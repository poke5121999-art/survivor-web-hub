// Room backends for the online session. A backend finds/creates rooms and hands out links with the RelayLink surface
// (id, hostId, peers, send(to, u8), onMessage(from, u8), onPeer, onPeerLeft, onClose, drop(peer), close(), stats).
//   ugsBackend()      Unity Lobby + Relay (the real thing)
//   loopBackend(name) BroadcastChannel rooms: pages of one browser profile, or node instances of one process
//   lossy(link, opts) delay / jitter / drop on what a link sends (drop only touches INPUT / SNAP)
import { Ugs, lobbyData } from './ugs.js';
import { RelayLink } from './relay.js';
import { MSG } from './codec.js';

const HEARTBEAT = 15;   // Lobby hides a room whose host skipped heartbeats for 30 s
const now = () => performance.now();

export function ugsBackend({ region = null } = {}) {
  let shared = null;
  const ugs = () => (shared || (shared = new Ugs())).signIn();
  return {
    name: 'ugs',
    async available() { await ugs(); return true; },
    async hostRoom({ isPrivate, bracket, protocol, hostName, maxPlayers = 4 }) {
      const u = await ugs();
      const alloc = await u.allocate(maxPlayers - 1, region);
      const relay = await u.joinCode(alloc.allocationId);
      const link = await new RelayLink(alloc, { role: 'host' }).open();
      let lobby;
      try {
        lobby = await u.createLobby({ name: `fg ${hostName}`.slice(0, 30), maxPlayers, isPrivate, playerName: hostName,
          data: lobbyData({ bracket, protocol, relay, host: hostName, kind: isPrivate ? 'private' : 'quick' }) });
      } catch (e) { link.close(); throw e; }
      const beat = setInterval(() => { u.signIn().then(() => u.heartbeat(lobby.id)).catch(() => {}); }, HEARTBEAT * 1000);
      let closed = false, unlisted = false;
      return {
        id: lobby.id, code: lobby.lobbyCode, created: Date.parse(lobby.created) || Date.now(), link, uid: u.playerId,
        region: alloc.region || region,
        lock() { return u.updateLobby(lobby.id, { isLocked: true }).catch(() => {}); },
        unlock() { if (!unlisted) u.updateLobby(lobby.id, { isLocked: false }).catch(() => {}); },
        free(uid) { if (uid) u.removePlayer(lobby.id, uid).catch(() => {}); },
        // the match runs on the relay alone: the lobby row goes, the link stays
        unlist(keepalive = false) {
          if (unlisted) return;
          unlisted = true;
          clearInterval(beat);
          u.deleteLobby(lobby.id, keepalive).catch(() => {});
        },
        close(keepalive = false) {
          if (closed) return;
          closed = true;
          this.unlist(keepalive);
          link.close();
        },
      };
    },
    async findRooms({ bracket, protocol }) {
      const u = await ugs();
      const rows = await u.queryLobbies(bracket, protocol);
      return rows.map((l) => ({ id: l.id, created: Date.parse(l.created) || 0, players: l.maxPlayers - l.availableSlots, max: l.maxPlayers }));
    },
    async joinRoom({ id, code, name }) {
      const u = await ugs();
      const lobby = id ? await u.joinLobbyById(id, name) : await u.joinLobbyByCode(code, name);
      const relay = lobby.data && lobby.data.relay && lobby.data.relay.value;
      if (!relay) { u.removePlayer(lobby.id, u.playerId).catch(() => {}); throw new Error('room has no relay code'); }
      let link;
      try {
        link = await new RelayLink(await u.joinRelay(relay), { role: 'client' }).open();
      } catch (e) { u.removePlayer(lobby.id, u.playerId).catch(() => {}); throw e; }
      let left = false;
      return {
        id: lobby.id, code: lobby.lobbyCode, link, uid: u.playerId,
        leave(keepalive = false) { if (left) return; left = true; u.removePlayer(lobby.id, u.playerId, keepalive).catch(() => {}); },
      };
    },
  };
}

// ---- loopback

const rid = () => Array.from({ length: 16 }, () => ((Math.random() * 256) | 0).toString(16).padStart(2, '0')).join('');
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function loopLink(channelName, self, hostId) {
  const ch = new BroadcastChannel(channelName);
  const link = {
    id: self, hostId, peers: new Set(hostId ? [hostId] : []), closed: false,
    stats: { tx: 0, rx: 0, txMsgs: 0, rxMsgs: 0 },
    onMessage() {}, onPeer() {}, onPeerLeft() {}, onClose() {},
    send(to, u8) {
      if (link.closed) return;
      // 38 bytes = the Unity Relay RELAY header, so byte counts compare with the real transport
      link.stats.tx += u8.length + 38; link.stats.txMsgs++;
      ch.postMessage({ k: 'm', to, from: self, d: u8 });
    },
    broadcast(u8) { for (const p of link.peers) link.send(p, u8); },
    drop(p) { if (link.peers.delete(p)) ch.postMessage({ k: 'x', to: p, from: self }); },
    close() {
      if (link.closed) return;
      for (const p of link.peers) ch.postMessage({ k: 'x', to: p, from: self });
      link.closed = true;
      ch.close();
      link.onClose('closed');
    },
  };
  ch.onmessage = (ev) => {
    const m = ev.data;
    if (link.closed || m.to !== self) return;
    if (m.k === 'm') {
      const d = m.d instanceof Uint8Array ? m.d : new Uint8Array(m.d);
      link.stats.rx += d.length + 38; link.stats.rxMsgs++;
      if (!link.peers.has(m.from)) { link.peers.add(m.from); link.onPeer(m.from); }
      link.onMessage(m.from, d);
    } else if (m.k === 'x') {
      if (link.peers.delete(m.from)) link.onPeerLeft(m.from);
      if (m.from === hostId) { link.closed = true; ch.close(); link.onClose('host left'); }
    }
  };
  return link;
}

/** Rooms announced over a BroadcastChannel registry; every instance keeps what it heard in the last 3 s. */
export function loopBackend(name = 'fg-loop') {
  const reg = new BroadcastChannel(`${name}:rooms`);
  const rooms = new Map();
  reg.onmessage = (ev) => {
    const m = ev.data;
    if (m.k === 'room') rooms.set(m.room.id, { ...m.room, seen: now() });
    else if (m.k === 'gone') rooms.delete(m.id);
  };
  const live = () => [...rooms.values()].filter((r) => now() - r.seen < 3000);
  return {
    name: 'loop',
    async available() { return typeof BroadcastChannel !== 'undefined'; },
    async hostRoom({ isPrivate, bracket, protocol, maxPlayers = 4 }) {
      const id = rid(), self = rid();
      const code = Array.from({ length: 6 }, () => CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0]).join('');
      const link = loopLink(`${name}:link`, self, null);
      const room = { id, code, host: self, isPrivate, bracket, protocol, created: Date.now(), max: maxPlayers, locked: false };
      const announce = () => {
        room.players = 1 + link.peers.size;
        rooms.set(id, { ...room, seen: now() });
        reg.postMessage({ k: 'room', room });
      };
      announce();
      const beat = setInterval(announce, 500);
      let closed = false;
      return {
        id, code, created: room.created, link, uid: self,
        lock() { room.locked = true; announce(); },
        unlock() { room.locked = false; announce(); },
        free() {},
        unlist() { clearInterval(beat); reg.postMessage({ k: 'gone', id }); rooms.delete(id); },
        close() { if (closed) return; closed = true; this.unlist(); link.close(); },
      };
    },
    async findRooms({ bracket, protocol }) {
      await new Promise((r) => setTimeout(r, 600));   // hear at least one announcement round
      return live().filter((r) => !r.isPrivate && !r.locked && r.bracket === bracket && r.protocol === protocol && r.players < r.max)
        .sort((a, b) => a.created - b.created).map((r) => ({ id: r.id, created: r.created, players: r.players, max: r.max }));
    },
    async joinRoom({ id, code }) {
      if (code) await new Promise((r) => setTimeout(r, 600));
      const room = live().find((r) => (id ? r.id === id : r.code === String(code).trim().toUpperCase()));
      if (!room) throw new Error(id ? 'room not found' : 'lobby join: HTTP 404 lobby not found');
      if (room.locked) throw new Error('room is locked');
      const self = rid();
      const link = loopLink(`${name}:link`, self, room.host);
      return { id: room.id, code: room.code, link, uid: self, leave() {} };
    },
  };
}

// ---- impairment

/**
 * Wraps a link so what it sends is delayed by delay + U(0, jitter) ms, delivered in order (one WebSocket each way),
 * and INPUT / SNAP packets are dropped with probability drop. Control messages are never dropped: on the real
 * relay they ride the same reliable WebSocket.
 */
export function lossy(link, { delay = 0, jitter = 0, drop = 0, rand = Math.random } = {}) {
  if (!delay && !jitter && !drop) return link;
  const send = link.send.bind(link);
  let last = 0;
  link.impair = { delay, jitter, drop, dropped: 0 };
  link.send = (to, u8) => {
    if (drop && (u8[0] === MSG.SNAP || u8[0] === MSG.INPUT) && rand() < drop) { link.impair.dropped++; return; }
    const t = Math.max(last, now() + delay + rand() * jitter);
    last = t;
    const copy = u8.slice();
    setTimeout(() => send(to, copy), Math.max(0, t - now()));
  };
  return link;
}
