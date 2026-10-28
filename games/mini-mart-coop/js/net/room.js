// A store room on Unity Gaming Services: the Lobby row is the listing and the code, the Relay allocation carries the
// game. Mirrors CoopSessionService in D:/REPO_Meta (relay over wss, host region from the menu, join code in the room's
// properties) without the SDK.
import { Ugs, lobbyData } from './ugs.js';
import { RelayLink } from './relay.js';

const HEARTBEAT = 15;   // Lobby hides a room whose host has not called heartbeat for 30 s

export async function hostRoom({ name, isPrivate, mart, difficulty, region, playerName, maxPlayers = 4 }) {
  const ugs = await new Ugs().signIn();
  const alloc = await ugs.allocate(maxPlayers - 1, region);
  const relay = await ugs.joinCode(alloc.allocationId);
  const link = await new RelayLink(alloc, { role: 'host' }).open();
  let lobby;
  try {
    lobby = await ugs.createLobby({ name, maxPlayers, isPrivate, playerName,
      data: lobbyData({ mart, difficulty, relay, host: playerName, region: alloc.region || region }) });
  } catch (e) {
    link.close();
    throw e;
  }
  const beat = setInterval(() => { ugs.signIn().then(() => ugs.heartbeat(lobby.id)).catch(() => {}); }, HEARTBEAT * 1000);
  let closed = false;
  return {
    ugs, link, lobby, code: lobby.lobbyCode, region: alloc.region || region,
    // A guest that vanished keeps its lobby seat until the host frees it.
    free(uid) { if (uid) ugs.removePlayer(lobby.id, uid).catch(() => {}); },
    close(keepalive = false) {
      if (closed) return;
      closed = true;
      clearInterval(beat);
      ugs.deleteLobby(lobby.id, keepalive).catch(() => {});
      link.close();
    },
  };
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
    link = await new RelayLink(await ugs.joinRelay(relay), { role: 'client' }).open();
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
  return rows.map(l => ({ id: l.id, name: l.name, mart: v(l, 'mart'), host: v(l, 'host'), region: v(l, 'region'),
    difficulty: +v(l, 'diff') || 0, players: l.maxPlayers - l.availableSlots, max: l.maxPlayers }));
}
