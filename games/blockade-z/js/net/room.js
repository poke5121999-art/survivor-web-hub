// A fight room on Unity Gaming Services (adapted from games/mini-mart-coop/js/net/room.js): the Lobby row is the
// listing and the code, the Relay allocation carries the game.
import { Ugs, lobbyData } from './ugs.js';
import { RelayLink } from './relay.js';

const HEARTBEAT = 15;   // Lobby hides a room whose host has not called heartbeat for 30 s

const RELINK_TRIES = 3;

// The relay drops a host allocation that went quiet (a throttled background tab, a network blip) while the Lobby row
// lives on through heartbeats, so the list kept offering a join code the relay no longer knew ("join code not found").
// The host now hands the game a stable link that re-allocates on loss and republishes the new code in the lobby;
// if that fails the lobby row is deleted so nobody is sent to a dead room.
export async function hostRoom({ name, isPrivate, region, playerName, maxPlayers = 4 }) {
  const ugs = await new Ugs().signIn();
  const open = async () => {
    const alloc = await ugs.allocate(maxPlayers - 1, region);
    const relay = await ugs.joinCode(alloc.allocationId);
    return { alloc, relay, link: await new RelayLink(alloc, { role: 'host' }).open() };
  };
  let cur = await open();
  const reg = cur.alloc.region || region;
  let lobby;
  try {
    lobby = await ugs.createLobby({ name, maxPlayers, isPrivate, playerName,
      data: lobbyData({ wave: 1, relay: cur.relay, host: playerName, region: reg }) });
  } catch (e) {
    cur.link.close();
    throw e;
  }
  let closed = false, relinking = false;
  const L = {
    role: 'host', relinks: 0,
    onMessage() {}, onPeer() {}, onPeerLeft() {}, onClose() {},
    get peers() { return cur.link.peers; },
    get hostId() { return cur.link.hostId; },
    get id() { return cur.link.id; },
    get stats() { return cur.link.stats; },
    get alive() { return !cur.link.closed; },
    send: (to, p) => cur.link.send(to, p),
    broadcast: (p) => cur.link.broadcast(p),
    drop: (peer) => cur.link.drop(peer),
    close: () => room.close(),
  };
  const wire = (link) => {
    link.onMessage = (...a) => L.onMessage(...a);
    link.onPeer = (...a) => L.onPeer(...a);
    link.onPeerLeft = (...a) => L.onPeerLeft(...a);
    link.onClose = (why) => { if (!closed && link === cur.link) relink(why); };
  };
  async function relink(why) {
    if (relinking || closed) return;
    relinking = true;
    for (const p of [...cur.link.peers]) L.onPeerLeft(p);
    for (let i = 0; i < RELINK_TRIES && !closed; i++) {
      try {
        await ugs.signIn();
        const next = await open();
        if (closed) { next.link.close(); break; }
        await ugs.updateLobby(lobby.id, { data: lobbyData({ wave: room.wave, relay: next.relay, host: playerName, region: next.alloc.region || reg }) });
        cur = next; wire(cur.link); L.relinks++;
        relinking = false;
        return;
      } catch (e) {
        await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
      }
    }
    relinking = false;
    if (!closed) { room.close(); L.onClose(`relay lost: ${why}`); }
  }
  wire(cur.link);
  const beat = setInterval(() => {
    if (closed) return;
    if (cur.link.closed) { relink('link closed'); return; }
    ugs.signIn().then(() => ugs.heartbeat(lobby.id)).catch(() => {});
  }, HEARTBEAT * 1000);
  const room = {
    ugs, link: L, lobby, code: lobby.lobbyCode, region: reg, wave: 1,
    // A guest that vanished keeps its lobby seat until the host frees it.
    free(uid) { if (uid) ugs.removePlayer(lobby.id, uid).catch(() => {}); },
    close(keepalive = false) {
      if (closed) return;
      closed = true;
      clearInterval(beat);
      ugs.deleteLobby(lobby.id, keepalive).catch(() => {});
      cur.link.close();
    },
  };
  return room;
}

// relay: a reconnect after the link dropped goes straight back to the allocation it knew; the lobby seat is still its.
export async function joinRoom({ lobbyId, code, playerName, relay: known = null, lobbyCode = null }) {
  const ugs = await new Ugs().signIn();
  const lobby = known ? { id: lobbyId, lobbyCode, data: { relay: { value: known } } }
    : lobbyId ? await ugs.joinLobbyById(lobbyId, playerName) : await ugs.joinLobbyByCode(code, playerName);
  const relay = lobby.data && lobby.data.relay && lobby.data.relay.value;
  if (!relay) {
    ugs.leaveLobby(lobby.id).catch(() => {});
    throw new Error('room has no relay code');
  }
  let link;
  try {
    let alloc;
    try {
      alloc = await ugs.joinRelay(relay);
    } catch (e) {
      // The host may be re-allocating right now: read the lobby again and try its newest code once.
      if (!/join code not found|404/.test(String(e.message))) throw e;
      await new Promise((r) => setTimeout(r, 2500));
      const fresh = await ugs.getLobby(lobby.id).catch(() => null);
      const code2 = fresh && fresh.data && fresh.data.relay && fresh.data.relay.value;
      if (!code2 || code2 === relay) throw new Error('this room has closed (its host is gone); pick another room');
      alloc = await ugs.joinRelay(code2);
    }
    link = await new RelayLink(alloc, { role: 'client' }).open();
  } catch (e) {
    ugs.leaveLobby(lobby.id).catch(() => {});
    throw e;
  }
  let left = false;
  return {
    ugs, link, lobby, relay, uid: ugs.playerId,
    leave(keepalive = false) {
      if (left) return;
      left = true;
      ugs.leaveLobby(lobby.id, keepalive).catch(() => {});
    },
  };
}

export async function listRooms() {
  const ugs = await new Ugs().signIn();
  const rows = await ugs.listLobbies();
  const v = (l, k) => (l.data && l.data[k] ? l.data[k].value : '');
  return rows.map(l => ({ id: l.id, name: l.name, wave: +v(l, 'wave') || 1, host: v(l, 'host'), region: v(l, 'region'),
    players: l.maxPlayers - l.availableSlots, max: l.maxPlayers }));
}
