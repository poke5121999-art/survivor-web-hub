// Online play: a room on Unity Relay (or BroadcastChannel with ?fakenet=1), one host that runs the real simulation,
// guests that send inputs and render snapshots. main.js owns the match and the screens; this file owns the wire.
//
//   connection  off -> connecting -> lobby -> playing -> lobby      (FSM below, one table)
//   messages    { type -> handler } per role (HOST_MSG, GUEST_MSG), JSON; snapshots and inputs are binary (netstate.js)
//   reliable    lobby, start, welcome, hello, mine, final snapshot: resent until the peer acks the message type
//   droppable   snapshots, inputs, heartbeats. Event batches ride on snapshots and are sent again when no ack came back.
//   guest       drives its own mech at once (predict.js) and draws everyone else a little in the past, between snapshots
import { hostRoom, joinRoom, listRooms as listRelayRooms } from './net/room.js';
import { nearestRegion } from './net/region.js';
import { snapshot, applySnapshot, createMirror, packEvents, unpackEvents, encodeSnap, encodeSnapPacket, decodeSnapPacket, encodeInputPacket, decodeInputPacket, wireInput, PKT_SNAP, PKT_INPUT, SNAP_TICKS } from './netstate.js';
import { createPredictor } from './predict.js';
import { MECHS, BOSSES, MECH_ORDER, MODES, PAINTS, DIFFICULTY, BOT_NAMES, TICK } from './data.js';
import { MAPS, THEMES, pickArena, fitMap } from './maps.js';
import { mulberry } from './rng.js';

const PROTOCOL = 1;
const FRAME = 1100;          // Relay datagrams stay under the ~1400 B MTU; bigger messages are cut into frames
const MAX_PLAYERS = 10;
const TEAM_SIZE = 5;
const HEARTBEAT = 1;
const RESEND = 0.5;
const RESEND_TRIES = 24;     // 12 s without an ack: the peer is gone
const PEER_TIMEOUT = 10;     // host: no packet at all from a guest
const HOST_TIMEOUT = 5;      // guest: no packet at all from the host
const INPUT_SILENCE = 1;     // host: a guest quiet this long gets a neutral input
const INPUT_REPEAT = 3;      // inputs per packet: the newest and the two before it, so one lost packet loses nothing
const INPUT_QUEUE_MAX = 6;   // host: inputs waiting per guest before the oldest are skipped (a burst after a stall)
const SLOW_EVERY = 10;       // snapshots between two that carry the slow facts (scoreboard numbers, broken props)
const EVENT_BYTES = 700;     // event text per packet: with the snapshot it stays inside one datagram
const CLOCK_WINDOW = 3;      // guest: seconds of snapshot arrivals that set the drawing delay
const DELAY_MAX = 0.4;
const WELCOME_TIMEOUT = 8;
const EXTRAPOLATE = 0.1;
const SNAP_DT = SNAP_TICKS * TICK;
const CHAT_MAX = 120;
const CHAT_BURST = 5;        // messages allowed per player ...
const CHAT_WINDOW = 10;      // ... in this many seconds
const EVENT_RING = 60;      // event batches kept for sending again: 2 s

const T = {
  hostLeft: 'Chủ phòng đã rời đi.',
  hostLost: 'Mất kết nối với chủ phòng.',
  noRoom: 'Không tìm thấy phòng. Hãy kiểm tra lại mã phòng.',
  full: 'Phòng đã đầy.',
  started: 'Trận đấu đã bắt đầu, không thể vào thêm.',
  version: 'Phiên bản game không khớp với chủ phòng.',
  timeout: 'Kết nối quá lâu. Hãy thử lại.',
  noReply: 'Chủ phòng không phản hồi.',
  generic: 'Không kết nối được. Hãy kiểm tra mạng rồi thử lại.',
  list: 'Không tải được danh sách phòng.',
  notReady: 'Còn người chơi chưa sẵn sàng.',
  bossFull: 'Chế độ Săn trùm tối đa 5 người chơi.',
  teamFull: 'Mỗi đội tối đa 5 người chơi.',
  guestName: 'Người chơi',
};

function explain(e) {
  const s = String((e && e.message) || e);
  if (e && e.status === 404 || /HTTP 404/.test(s)) return T.noRoom;
  if (/full|HTTP 409/.test(s)) return T.full;
  if (/timed out/.test(s)) return T.timeout;
  if (/no host on fakenet/.test(s)) return T.noRoom;
  return T.generic;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

// Messages cut into frames of at most FRAME bytes: [index, count, id lo, id hi, ...]. A message missing a frame
// is dropped when the next one from that peer arrives; only snapshots and inputs are allowed to be lost this way.
class Framer {
  constructor() { this.id = 0; this.parts = new Map(); }
  pack(body) {
    const n = Math.max(1, Math.ceil(body.length / FRAME)), id = (this.id = (this.id + 1) & 0xffff), out = [];
    for (let i = 0; i < n; i++) {
      const c = body.subarray(i * FRAME, (i + 1) * FRAME), f = new Uint8Array(4 + c.length);
      f[0] = i; f[1] = n; f[2] = id & 255; f[3] = id >> 8; f.set(c, 4);
      out.push(f);
    }
    return out;
  }
  unpack(from, f) {
    const i = f[0], n = f[1], body = f.subarray(4);
    if (n === 1) return body;
    const key = from + ':' + (f[2] | (f[3] << 8));
    const entry = this.parts.get(key) || { at: performance.now(), parts: [] };
    entry.parts[i] = body.slice();
    this.parts.set(key, entry);
    if (entry.parts.filter(Boolean).length < n) return null;
    this.parts.delete(key);
    const all = new Uint8Array(entry.parts.reduce((s, p) => s + p.length, 0));
    let at = 0;
    for (const p of entry.parts) { all.set(p, at); at += p.length; }
    return all;
  }
  prune() {
    const old = performance.now() - 3000;
    for (const [k, e] of this.parts) if (e.at < old) this.parts.delete(k);
  }
}

// ---- ?fakenet=1: the same surface as RelayLink over a BroadcastChannel, for tests without network ----------------
const FAKE_REGISTRY = 'dtt-fakenet-rooms';
function fakeLink(role, code) {
  const ch = new BroadcastChannel('dtt-fakenet-' + code), id = Math.random().toString(16).slice(2, 10);
  const L = { id, role, peers: new Set(), hostId: null, onMessage() {}, onPeer() {}, onPeerLeft() {}, onClose() {}, stats: { tx: 0 } };
  let ready = () => {};
  ch.onmessage = (e) => {
    const m = e.data;
    if (m.to && m.to !== id) return;
    if (m.k === 'hello' && role === 'host') { ch.postMessage({ k: 'ack', to: m.from, from: id }); return; }
    if (m.k === 'ack' && role === 'client' && !L.hostId) { L.hostId = m.from; L.peers.add(m.from); ready(); return; }
    if (m.k === 'bye') { if (L.peers.delete(m.from)) L.onPeerLeft(m.from); if (m.from === L.hostId) L.onClose('host left'); return; }
    if (m.k === 'msg') {
      if (!L.peers.has(m.from)) { L.peers.add(m.from); L.onPeer(m.from); }
      L.onMessage(m.from, new Uint8Array(m.data));
    }
  };
  L.send = (to, payload) => {
    ch.postMessage({ k: 'msg', to, from: id, data: payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength) });
    L.stats.tx += payload.length;
  };
  L.broadcast = (payload) => { for (const p of L.peers) L.send(p, payload); };
  L.drop = (p) => { L.peers.delete(p); };
  L.close = () => { try { ch.postMessage({ k: 'bye', from: id }); ch.close(); } catch (e) { /* channel already closed */ } };
  L.open = () => new Promise((resolve, reject) => {
    if (role === 'host') { resolve(L); return; }
    ready = () => resolve(L);
    ch.postMessage({ k: 'hello', from: id });
    setTimeout(() => reject(new Error('no host on fakenet')), 3000);
  });
  return L;
}

const fakeStore = {
  read() { try { return JSON.parse(localStorage.getItem(FAKE_REGISTRY) || '{}'); } catch (e) { return {}; } },
  write(v) { try { localStorage.setItem(FAKE_REGISTRY, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
};

// Everything the lobby and the match need from a connection, whichever network carries it.
const TRANSPORTS = {
  relay: {
    async host(o) {
      const near = await nearestRegion();
      const room = await hostRoom({ name: o.name, isPrivate: o.isPrivate, region: near ? near.region : undefined, playerName: o.playerName, mode: o.mode, map: o.map, maxPlayers: MAX_PLAYERS });
      return { link: room.link, code: room.code, region: room.region, room, publish: (p) => room.publish(p), lock: (v) => room.lock(v), free: (uid) => room.free(uid), close: () => room.close() };
    },
    async join(o) {
      const room = await joinRoom({ code: o.code, lobbyId: o.lobbyId, playerName: o.playerName });
      return { link: room.link, code: room.lobby.lobbyCode || o.code || '', uid: room.uid, leave: (k) => room.leave(k) };
    },
    // Opening the room list is the sign that a room may be hosted soon: measure the regions while the player reads it.
    list: () => { nearestRegion(); return listRelayRooms(); },
  },
  fake: {
    async host(o) {
      const code = Math.random().toString(36).slice(2, 7).toUpperCase();
      const link = fakeLink('host', code);
      let row = { code, name: o.name, mode: o.mode, map: o.map, host: o.playerName, players: 1, max: MAX_PLAYERS, at: Date.now(), locked: false };
      const save = () => { const s = fakeStore.read(); s[code] = { ...row, at: Date.now() }; fakeStore.write(s); };
      save();
      const beat = setInterval(save, 1500);
      return {
        link, code,
        publish: (p) => { Object.assign(row, p); save(); },
        lock: (v) => { row.locked = v; save(); },
        free() {},
        close: () => { clearInterval(beat); const s = fakeStore.read(); delete s[code]; fakeStore.write(s); },
        count: (n) => { row.players = n; save(); },
      };
    },
    async join(o) {
      const code = String(o.code || o.lobbyId || '').trim().toUpperCase();
      const link = fakeLink('client', code);
      await link.open();
      return { link, code, uid: null, leave() {} };
    },
    async list() {
      const s = fakeStore.read();
      return Object.values(s).filter((r) => Date.now() - r.at < 5000 && !r.locked)
        .map((r) => ({ id: r.code, name: r.name, mode: r.mode, map: r.map, host: r.host, region: 'fake', players: r.players, max: r.max }));
    },
  },
};

// Control characters out, whitespace trimmed, cut to CHAT_MAX characters (by code point, so an emoji is never split).
const cleanChat = (t) => [...String(t == null ? '' : t).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, '').trim()].slice(0, CHAT_MAX).join('').trim();

const NEUTRAL = (aim = 0) => ({ mx: 0, mz: 0, aim, fire: false, s1: false, s2: false, ult: false, heal: false, tx: 0, tz: 0 });
const FLAGS = ['fire', 's1', 's2', 'ult', 'heal'];
const finite = (v, lo, hi) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0);
const clock = () => performance.now() / 1000;

export function makeOnline(G) {
  const search = typeof location === 'undefined' ? '' : location.search;
  const fake = (G.params && G.params.fakenet === '1') || new URLSearchParams(search).get('fakenet') === '1';
  const net = fake ? TRANSPORTS.fake : TRANSPORTS.relay;
  const emit = (topic, data) => G.bus.emit(topic, data);

  const online = {
    state: 'off', role: null, code: '', region: '', error: '', me: null, lobby: null, mySlot: -1, rosterData: null, mirror: null,
    stats: { snapsSent: 0, snapsRecv: 0, bytesSent: 0, inputsSent: 0, inputsRecv: 0 },
  };
  const listeners = new Set();
  let link = null, conn = null, framer = new Framer(), pump = null, ticket = 0;
  let peers = new Map();         // link id -> { link, pid, slot, pending, seen, heard, uid, ...freshInputs() }
  let relId = 0, pidN = 0;
  // host
  let evq = [], sinceSend = 0, snapSeq = 0, evSeq = 0, ring = [], finalSent = false, gone = new Set(), sentAt = new Map(), propsKey = '', propsLeft = 0;
  // guest
  let lastHb = 0, hostHeard = 0;
  // buf: snapshots not yet drawn, oldest first. held: the two the mirror is drawn between. drawAt: the host time being drawn.
  // arrivals: [local time, host time] of recent snapshots, from which the drawing delay comes.
  let buf = [], held = null, drawAt = 0, arrivals = [], lastFrame = 0, snapQ = 0, newestK = -1;
  // late: events that arrived for a snapshot already drawn; they play with the next frame.
  let evAck = 0, evSeen = new Set(), late = [];
  let predictor = null, own = null, sample = null, pressed = 0, tickAcc = 0, recent = [];

  // ---- connection state machine -------------------------------------------------------------------------------
  const FSM = {
    off: { open: 'connecting' },
    connecting: { ready: 'lobby', fail: 'off', leave: 'off' },
    lobby: { start: 'playing', leave: 'off', lost: 'off' },
    playing: { start: 'playing', back: 'lobby', leave: 'off', lost: 'off' },
  };
  const ENTER = {
    connecting() { online.error = ''; },
    lobby(from) {
      if (from === 'playing') {
        online.mirror = null; online.rosterData = null; online.mySlot = -1;
        buf = []; held = null; gone = new Set(); evq = []; ring = [];
        if (online.role === 'host') {
          for (const p of online.lobby.players) if (!p.host) p.ready = false;
          conn.lock(false);
          broadcastLobby();
        }
      }
      changed();
    },
    playing(from, ev, data) {
      online.rosterData = data.rosterData; online.mySlot = data.mySlot; online.mirror = data.mirror;
      emit('net:start', { rosterData: data.rosterData, mySlot: data.mySlot, role: online.role, mirror: data.mirror });
    },
    off(from, ev) {
      teardown();
      if (ev === 'lost') emit('net:lost', { reason: online.error });
      online.role = null; online.code = ''; online.me = null; online.lobby = null; online.mirror = null; online.rosterData = null; online.mySlot = -1;
      changed();
    },
  };
  function fire(ev, data) {
    const to = FSM[online.state][ev];
    if (!to) return false;
    const from = online.state;
    online.state = to;
    ENTER[to] && ENTER[to](from, ev, data);
    emit('net:state', { state: to, role: online.role });
    return true;
  }
  function changed() {
    for (const fn of listeners) { try { fn(online.lobby); } catch (e) { console.error('onLobby', e); } }
    emit('net:lobby', online.lobby);
  }
  function fail(text) { if (FSM[online.state].fail) { online.error = text; fire('fail'); } }
  function lose(text) { if (FSM[online.state].lost) { online.error = text; fire('lost'); } }

  function teardown() {
    ticket++;
    clearInterval(pump); pump = null;
    const c = conn, l = link;
    conn = null; link = null; peers = new Map();
    if (l) { try { l.onClose = () => {}; l.onPeerLeft = () => {}; } catch (e) { /* link already torn down */ } }
    if (c) { try { if (online.role === 'host') c.close(); else c.leave && c.leave(false); } catch (e) { /* already closed */ } }
    if (l) { try { l.close(); } catch (e) { /* already closed */ } }
  }

  // ---- sending --------------------------------------------------------------------------------------------------
  function sendBytes(to, bytes) {
    if (!link) return;
    online.stats.bytesSent += bytes.length;
    for (const f of framer.pack(bytes)) link.send(to, f);
  }
  const send = (peer, msg) => sendBytes(peer.link, enc.encode(JSON.stringify(msg)));
  // A message type has one pending copy per peer: the newest supersedes the older one.
  // A chat line is its own key: two lines in a row must both survive until acked.
  function sendRel(peer, msg, key = msg.t) {
    msg.rid = ++relId;
    if (key !== msg.t) msg.pk = key;
    peer.pending.set(key, { msg, at: clock(), tries: 0 });
    send(peer, msg);
  }
  const joined = () => [...peers.values()].filter((p) => p.pid);
  function toAll(msg) { for (const p of joined()) send(p, msg); }
  function broadcastLobby() { for (const p of joined()) sendRel(p, { t: 'lobby', lobby: online.lobby }); }

  // Host, per guest. queue: inputs not yet run, by number. applied: the last number run. evAck: every event batch up to
  // it has arrived there. evSent: batch -> when it last went out. rtt: seconds, from snapshot out to its echo in an input.
  const freshInputs = () => ({ input: null, inputAt: clock(), applied: 0, queue: new Map(), low: 99, lowN: 0, evAck: 0, evSent: new Map(), rtt: 0 });

  function peerOf(id) {
    let p = peers.get(id);
    if (!p) { p = { link: id, pid: null, slot: -1, pending: new Map(), seen: {}, chatSeen: new Set(), chatTimes: [], heard: clock(), uid: null, ...freshInputs() }; peers.set(id, p); }
    return p;
  }

  function onPacket(from, bytes) {
    const body = framer.unpack(from, bytes);
    if (body === null || !body.length) return;
    const peer = peerOf(from);
    peer.heard = clock();
    if (online.role === 'guest') hostHeard = peer.heard;
    if (body[0] !== 123) {
      try {
        if (body[0] === PKT_INPUT && online.role === 'host' && peer.pid) takeInputs(peer, decodeInputPacket(body));
        else if (body[0] === PKT_SNAP && online.role === 'guest') takeSnapshot(decodeSnapPacket(body));
      } catch (e) { /* a damaged packet is a lost packet */ }
      return;
    }
    let msg;
    try { msg = JSON.parse(dec.decode(body)); } catch (e) { return; }
    if (!msg || typeof msg.t !== 'string') return;
    if (msg.t === 'ack') {
      const p = peer.pending.get(msg.k);
      if (p && p.msg.rid === msg.rid) peer.pending.delete(msg.k);
      return;
    }
    if (msg.rid) {
      send(peer, { t: 'ack', k: msg.pk || msg.t, rid: msg.rid });
      if (msg.pk) {
        if (peer.chatSeen.has(msg.rid)) return;
        peer.chatSeen.add(msg.rid);
        if (peer.chatSeen.size > 200) peer.chatSeen.delete(peer.chatSeen.values().next().value);
      } else {
        if ((peer.seen[msg.t] || 0) >= msg.rid) return;
        peer.seen[msg.t] = msg.rid;
      }
    }
    const table = online.role === 'host' ? HOST_MSG : GUEST_MSG;
    const h = table[msg.t];
    if (!h) return;
    if (online.role === 'host' && msg.t !== 'hello' && !peer.pid) return;
    h(peer, msg);
  }

  // ---- lobby model (host owns it, guests hold a copy) -------------------------------------------------------------
  const newLobby = (hostName) => ({
    players: [{ id: 'p0', name: hostName, mech: MECH_ORDER[0], paint: null, mods: { hp: 1, dmg: 1 }, team: 0, ready: true, host: true }],
    map: 'denrung', theme: null, mode: 'tdm', diff: 'normal',
  });
  const teamSize = (t) => online.lobby.players.filter((p) => p.team === t).length;
  // Co-op by default: joiners side with the host against bots until that team is full. Players switch sides for PvP.
  const pickTeam = () => (online.lobby.mode === 'trum' || teamSize(0) < TEAM_SIZE ? 0 : 1);
  const humansCap = () => (online.lobby.mode === 'trum' ? TEAM_SIZE : MAX_PLAYERS);
  const lobbyPlayer = (pid) => online.lobby && online.lobby.players.find((p) => p.id === pid);
  const cleanName = (n) => String(n || '').trim().slice(0, 24) || T.guestName;
  function cleanMine(p, m) {
    if (MECHS[m.mech]) p.mech = m.mech;
    if (m.paint === null || PAINTS[m.paint]) p.paint = m.paint;
    if (m.mods && typeof m.mods === 'object') p.mods = { hp: finite(m.mods.hp, 1, 1.2) || 1, dmg: finite(m.mods.dmg, 1, 1.2) || 1 };
    if (!p.host && typeof m.ready === 'boolean') p.ready = m.ready;
  }
  function publishRoom() { conn && conn.publish && conn.publish({ mode: online.lobby.mode, map: online.lobby.map }); conn && conn.count && conn.count(online.lobby.players.length); }

  function removePlayer(peer, why) {
    if (!peer.pid) { peers.delete(peer.link); return; }
    const L = online.lobby;
    L.players = L.players.filter((p) => p.id !== peer.pid);
    if (peer.slot >= 0) gone.add(peer.slot);
    if (peer.uid && conn.free) conn.free(peer.uid);
    peers.delete(peer.link);
    try { link.drop(peer.link); } catch (e) { /* peer already gone */ }
    publishRoom();
    broadcastLobby();
    changed();
    emit('net:left', { id: peer.pid, why });
    peer.pid = null;
  }

  // ---- messages -------------------------------------------------------------------------------------------------
  const HOST_MSG = {
    hello(peer, m) {
      if (peer.pid) { sendRel(peer, { t: 'welcome', pid: peer.pid, lobby: online.lobby }); return; }
      const reject = (why) => sendRel(peer, { t: 'reject', why });
      if (m.v !== PROTOCOL) return reject(T.version);
      if (online.state !== 'lobby') return reject(T.started);
      if (online.lobby.players.length >= humansCap()) return reject(online.lobby.mode === 'trum' ? T.bossFull : T.full);
      peer.pid = 'p' + (++pidN);
      peer.uid = m.uid || null;
      const used = new Set(online.lobby.players.map((p) => p.mech));
      online.lobby.players.push({ id: peer.pid, name: cleanName(m.name), mech: MECH_ORDER.find((k) => !used.has(k)) || MECH_ORDER[0], paint: null, mods: { hp: 1, dmg: 1 }, team: pickTeam(), ready: false, host: false });
      sendRel(peer, { t: 'welcome', pid: peer.pid, lobby: online.lobby });
      for (const p of joined()) if (p !== peer) sendRel(p, { t: 'lobby', lobby: online.lobby });
      publishRoom();
      changed();
    },
    mine(peer, m) {
      const p = lobbyPlayer(peer.pid);
      if (!p) return;
      cleanMine(p, m);
      broadcastLobby(); changed();
    },
    swap(peer) { swapTeam(peer.pid); },
    say(peer, m) { acceptChat(peer.pid, peer, m.text); },
    hb() {},
    bye(peer) { removePlayer(peer, 'rời phòng'); },
  };

  const GUEST_MSG = {
    welcome(peer, m) {
      if (online.state !== 'connecting') return;
      online.me = m.pid; online.lobby = m.lobby;
      fire('ready');
    },
    reject(peer, m) { if (online.state === 'connecting') fail(m.why || T.generic); },
    lobby(peer, m) {
      if (online.state === 'connecting') return;
      online.lobby = m.lobby;
      changed();
    },
    start(peer, m) {
      if (online.state !== 'lobby' && online.state !== 'playing') return;
      const mySlot = m.slots[online.me];
      if (mySlot === undefined) return;
      const mirror = createMirror(m.rosterData);
      resetGuest(mirror, mySlot);
      fire('start', { rosterData: m.rosterData, mySlot, mirror });
    },
    // The last snapshot of a match arrives this way (reliable, whole); every other one is binary.
    snap(peer, m) { takeSnapshot({ q: m.q, applied: m.a | 0, base: 0, batches: (m.b || []).map((b) => [b[0], unpackEvents(b[1])]), snap: m.s }); },
    chat(peer, m) {
      if (online.state === 'connecting') return;
      emit('net:chat', { id: String(m.id), name: String(m.name || '').slice(0, 24), team: m.team | 0, text: cleanChat(m.text), t: Number(m.at) || Date.now() });
    },
    hb() {},
    bye() { lose(T.hostLeft); },
  };

  // ---- periodic work: resends, heartbeats, timeouts --------------------------------------------------------------
  function tick() {
    const now = clock();
    framer.prune();
    for (const peer of [...peers.values()]) {
      for (const [k, p] of peer.pending) {
        if (now - p.at < RESEND) continue;
        if (++p.tries > RESEND_TRIES) {
          peer.pending.delete(k);
          if (online.role === 'host') removePlayer(peer, 'mất kết nối');
          break;
        }
        p.at = now; send(peer, p.msg);
      }
    }
    if (now - lastHb >= HEARTBEAT) { lastHb = now; toAll({ t: 'hb' }); if (online.role === 'guest') for (const p of peers.values()) send(p, { t: 'hb' }); }
    if (online.role === 'host') {
      for (const peer of [...peers.values()]) if (peer.pid && now - peer.heard > PEER_TIMEOUT) removePlayer(peer, 'mất kết nối');
    } else if (online.role === 'guest' && online.state !== 'connecting' && hostHeard && now - hostHeard > HOST_TIMEOUT) lose(T.hostLost);
  }

  function attach(c, role) {
    conn = c; link = c.link; peers = new Map(); framer = new Framer();
    link.onMessage = onPacket;
    link.onPeer = (id) => peerOf(id);
    link.onPeerLeft = (id) => {
      const peer = peers.get(id);
      if (peer && online.role === 'host') removePlayer(peer, 'rời phòng');
    };
    link.onClose = (why) => {
      if (online.role !== 'guest') return;
      const text = why === 'host left' ? T.hostLeft : T.hostLost;
      if (online.state === 'connecting') fail(text); else lose(text);
    };
    online.role = role;
    hostHeard = clock(); lastHb = 0;
    pump = setInterval(tick, 100);
  }

  // ---- public: connecting ---------------------------------------------------------------------------------------
  online.host = async function host({ name, isPrivate = false, playerName } = {}) {
    if (!fire('open')) return false;
    const mine = ++ticket;
    const pname = cleanName(playerName);
    try {
      const c = await net.host({ name: name || `Phòng của ${pname}`, isPrivate, playerName: pname, mode: 'tdm', map: 'denrung' });
      if (mine !== ticket || online.state !== 'connecting') { c.close(); return false; }
      online.lobby = newLobby(pname); online.me = 'p0'; online.code = c.code; online.region = c.region || ''; pidN = 0;
      attach(c, 'host');
      fire('ready');
      return true;
    } catch (e) {
      if (mine === ticket) fail(explain(e));
      return false;
    }
  };

  online.join = async function join({ code, lobbyId, playerName } = {}) {
    if (!fire('open')) return false;
    const mine = ++ticket;
    const pname = cleanName(playerName);
    try {
      const c = await net.join({ code, lobbyId, playerName: pname });
      if (mine !== ticket || online.state !== 'connecting') { try { c.link.close(); c.leave && c.leave(false); } catch (e) { /* closed */ } return false; }
      online.code = c.code;
      attach(c, 'guest');
      const host = peerOf(link.hostId);
      sendRel(host, { t: 'hello', v: PROTOCOL, name: pname, uid: c.uid });
      const waitUntil = clock() + WELCOME_TIMEOUT;
      await new Promise((resolve) => {
        const poll = setInterval(() => {
          if (online.state !== 'connecting' || clock() > waitUntil) { clearInterval(poll); resolve(); }
        }, 50);
      });
      if (online.state === 'connecting') { fail(T.noReply); return false; }
      return online.state === 'lobby';
    } catch (e) {
      if (mine === ticket) fail(explain(e));
      return false;
    }
  };

  online.listRooms = async function listRooms() {
    try { return await net.list(); } catch (e) { online.error = T.list; return []; }
  };

  online.leave = function leave(keepalive = false) {
    if (online.state === 'off') return;
    for (const p of peers.values()) { try { send(p, { t: 'bye' }); } catch (e) { /* link down */ } }
    if (conn && online.role === 'guest' && conn.leave) { try { conn.leave(keepalive); } catch (e) { /* ignore */ } conn.leave = null; }
    fire('leave');
  };
  if (typeof addEventListener === 'function') addEventListener('pagehide', () => online.leave(true));

  // ---- room chat ----------------------------------------------------------------------------------------------
  // The host is the only judge of the rate limit and the only relay: a guest's line comes back as the same broadcast everyone gets.
  function allowChat(bucket) {
    const now = clock();
    while (bucket.length && now - bucket[0] >= CHAT_WINDOW) bucket.shift();
    if (bucket.length >= CHAT_BURST) return false;
    bucket.push(now);
    return true;
  }
  const hostChatTimes = [];
  function acceptChat(pid, peer, raw) {
    const text = cleanChat(raw), p = lobbyPlayer(pid);
    if (!text || !p || online.state === 'connecting') return false;
    if (!allowChat(peer ? peer.chatTimes : hostChatTimes)) return false;
    const line = { id: p.id, name: p.name, team: p.team, text, t: Date.now() };
    const wire = { t: 'chat', id: line.id, name: line.name, team: line.team, text, at: line.t };
    for (const q of joined()) sendRel(q, { ...wire }, 'chat' + (relId + 1));
    emit('net:chat', line);
    return true;
  }
  const guestChatTimes = [];
  // Returns false when the line is empty, the room is not open, or the sender is over 5 lines in 10 s.
  online.say = function say(text) {
    if (online.state !== 'lobby' && online.state !== 'playing') return false;
    const clean = cleanChat(text);
    if (!clean) return false;
    if (online.role === 'host') return acceptChat(online.me, null, clean);
    if (!allowChat(guestChatTimes)) return false;
    sendRel(peerOf(link.hostId), { t: 'say', text: clean }, 'say' + (relId + 1));
    return true;
  };

  // ---- public: lobby --------------------------------------------------------------------------------------------
  online.onLobby = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

  online.setMine = function setMine(mine) {
    if (online.state !== 'lobby') return false;
    const p = lobbyPlayer(online.me);
    if (!p) return false;
    cleanMine(p, mine);
    if (online.role === 'host') broadcastLobby();
    else sendRel(peerOf(link.hostId), { t: 'mine', mech: p.mech, paint: p.paint, mods: p.mods, ready: p.ready });
    changed();
    return true;
  };

  online.setRoom = function setRoom({ map, theme, mode, diff } = {}) {
    if (online.role !== 'host' || online.state !== 'lobby') return false;
    const L = online.lobby;
    online.error = '';
    if (mode && MODES[mode] && mode !== L.mode) {
      if (mode === 'trum' && L.players.length > TEAM_SIZE) { online.error = T.bossFull; return false; }
      L.mode = mode;
      if (mode === 'trum') L.players.forEach((p) => { p.team = 0; });
    }
    if (map && (MAPS[map] || map === 'random')) L.map = map;
    L.map = fitMap(L.map, L.mode);
    // theme: a THEMES key, 'random', or null for the layout's own theme
    if (theme !== undefined && (theme === null || theme === 'random' || THEMES[theme])) L.theme = theme;
    if (diff && DIFFICULTY[diff]) L.diff = diff;
    publishRoom(); broadcastLobby(); changed();
    return true;
  };

  function swapTeam(pid) {
    const L = online.lobby, p = lobbyPlayer(pid);
    if (online.role === 'guest') {
      if (pid === online.me && online.state === 'lobby') sendRel(peerOf(link.hostId), { t: 'swap' });
      return false;
    }
    if (!p || online.state !== 'lobby' || L.mode === 'trum' || L.mode === 'tudo') return false;
    const to = 1 - p.team;
    if (teamSize(to) >= TEAM_SIZE) { online.error = T.teamFull; return false; }
    p.team = to;
    broadcastLobby(); changed();
    return true;
  }
  online.swapTeam = swapTeam;

  // ---- public: starting a match ---------------------------------------------------------------------------------
  function buildRoster(L) {
    const seed = (Math.random() * 0x7fffffff) >>> 0;
    const rng = mulberry(seed ^ 0x51ed);
    const names = BOT_NAMES.slice().sort(() => rng() - 0.5);
    const unit = (r) => {
      const def = MECHS[r.mech] || BOSSES[r.mech];
      const mods = r.mods || { hp: 1, dmg: 1 };
      return { team: r.team, color: L.mode === 'tudo' ? 1 : r.team, mech: r.mech, name: r.name, bot: !!r.bot, diff: L.diff, paint: r.paint || null, mods,
        radius: def.radius, maxHp: Math.round(def.hp * (mods.hp || 1)), pid: r.pid || null };
    };
    const units = [], slots = {};
    const botMech = (taken) => {
      const free = MECH_ORDER.filter((k) => !taken.includes(k)).sort(() => rng() - 0.5);
      const k = free.length ? free[0] : MECH_ORDER[Math.floor(rng() * MECH_ORDER.length)];
      taken.push(k);
      return k;
    };
    const add = (r) => { if (r.pid) slots[r.pid] = units.length; units.push(unit(r)); };
    if (L.mode === 'tudo') {
      const taken = L.players.map((p) => p.mech);
      for (const p of L.players) add({ team: 0, mech: p.mech, name: p.name, paint: p.paint, mods: p.mods, pid: p.id });
      while (units.length < MAX_PLAYERS) add({ team: units.length < 5 ? 0 : 1, mech: botMech(taken), name: names.pop(), bot: true });
    } else {
      for (const team of L.mode === 'trum' ? [0] : [0, 1]) {
        const mine = L.players.filter((p) => p.team === team), taken = mine.map((p) => p.mech);
        for (const p of mine) add({ team, mech: p.mech, name: p.name, paint: p.paint, mods: p.mods, pid: p.id });
        for (let i = mine.length; i < TEAM_SIZE; i++) add({ team, mech: botMech(taken), name: names.pop(), bot: true });
      }
      if (L.mode === 'trum') add({ team: 1, mech: 'titan', name: 'Cự Thần', bot: true });
    }
    const rule = MODES[L.mode];
    // 'random' is resolved here on the host, so every machine gets the same concrete layout and theme.
    const arena = pickArena(L.map, L.theme, seed, L.mode);
    return { rosterData: { map: arena.map, theme: arena.theme, mode: L.mode, seed, target: rule.target, duration: rule.duration, units }, slots };
  }

  online.start = function start() {
    if (online.role !== 'host' || online.state !== 'lobby') return false;
    const L = online.lobby;
    online.error = '';
    if (L.players.some((p) => !p.ready)) { online.error = T.notReady; return false; }
    if (L.mode === 'trum' && L.players.length > TEAM_SIZE) { online.error = T.bossFull; return false; }
    if (L.mode !== 'tudo' && L.mode !== 'trum' && (teamSize(0) > TEAM_SIZE || teamSize(1) > TEAM_SIZE)) { online.error = T.teamFull; return false; }
    const { rosterData, slots } = buildRoster(L);
    conn.lock(true);
    for (const peer of joined()) {
      peer.slot = slots[peer.pid]; Object.assign(peer, freshInputs());
      sendRel(peer, { t: 'start', rosterData, slots });
    }
    evq = []; ring = []; snapSeq = 0; evSeq = 0; sinceSend = 0; finalSent = false; gone = new Set(); sentAt = new Map(); propsKey = ''; propsLeft = 0;
    fire('start', { rosterData, mySlot: slots[online.me], mirror: null });
    return true;
  };

  online.toLobby = function toLobby() { return fire('back'); };

  // ---- host, every tick -----------------------------------------------------------------------------------------
  function takeInputs(peer, p) {
    if (online.state !== 'playing' || peer.slot < 0) return;
    p.inputs.forEach((inp, i) => { const q = p.q - i; if (q > peer.applied && !peer.queue.has(q)) peer.queue.set(q, inp); });
    peer.inputAt = clock();
    if (p.evAck > peer.evAck) { peer.evAck = p.evAck; for (const k of peer.evSent.keys()) if (k <= p.evAck) peer.evSent.delete(k); }
    const out = sentAt.get(p.snapQ);
    if (out !== undefined) { const rtt = peer.inputAt - out; peer.rtt = peer.rtt ? peer.rtt * 0.85 + rtt * 0.15 : rtt; }
    online.stats.inputsRecv++;
  }

  // Skip the oldest waiting inputs down to `keep`. A button pressed in a skipped input is pressed in the next one kept.
  function skipInputs(peer, keep) {
    const keys = [...peer.queue.keys()].sort((a, b) => a - b);
    let carry = 0;
    while (keys.length > keep) {
      const k = keys.shift(), inp = peer.queue.get(k);
      FLAGS.forEach((f, i) => { if (inp[f]) carry |= 1 << i; });
      peer.queue.delete(k); peer.applied = k;
    }
    if (keys.length) FLAGS.forEach((f, i) => { if (carry & (1 << i)) peer.queue.get(keys[0])[f] = true; });
  }

  // One input per guest per tick, in the order the guest made them: the guest's prediction counts on that. The queue
  // is the jitter buffer: it fills by itself when a tick finds it empty, and gives a tick back when it stayed full.
  function nextInput(peer, now) {
    const q = peer.queue;
    if (q.size > INPUT_QUEUE_MAX) skipInputs(peer, 2);
    if (!q.size) return !peer.input || now - peer.inputAt > INPUT_SILENCE ? NEUTRAL(peer.input ? peer.input.aim : 0) : peer.input;
    let k = peer.applied + 1;
    if (!q.has(k)) k = Math.min(...q.keys());
    peer.input = q.get(k); q.delete(k); peer.applied = k;
    peer.low = Math.min(peer.low, q.size);
    if (++peer.lowN >= 60) { if (peer.low >= 2) skipInputs(peer, q.size - 1); peer.low = 99; peer.lowN = 0; }
    return peer.input;
  }

  online.remoteInputs = function remoteInputs() {
    const out = {};
    if (online.role !== 'host' || online.state !== 'playing') return out;
    const now = clock(), m = G.match;
    for (const slot of gone) {
      const u = m && m.units[slot];
      if (u && !u.bot) { u.bot = true; u.brain = null; }
    }
    for (const peer of peers.values()) {
      if (peer.slot < 0 || gone.has(peer.slot)) continue;
      out[peer.slot] = nextInput(peer, now);
    }
    return out;
  };

  // Event batches this guest has not acknowledged: new ones, and old ones once a round trip passed without the ack.
  function batchesFor(peer, now) {
    const wait = Math.min(1, Math.max(0.1, (peer.rtt || 0.2) * 1.5 + 0.06)), out = [];
    let bytes = 0;
    for (const b of ring) {
      if (b.seq <= peer.evAck) continue;
      const last = peer.evSent.get(b.seq);
      if (last !== undefined && now - last < wait) continue;
      if (out.length && bytes + b.json.length > EVENT_BYTES) break;
      peer.evSent.set(b.seq, now); out.push(b); bytes += b.json.length;
    }
    return out;
  }

  online.afterStep = function afterStep(m) {
    if (online.role !== 'host' || online.state !== 'playing' || finalSent) return;
    for (const e of m.events) evq.push(e);
    sinceSend++;
    const last = m.over;
    if (sinceSend < SNAP_TICKS && !last) return;
    sinceSend = 0;
    const seq = ++snapSeq, now = clock();
    if (evq.length) {
      ring.push({ seq: ++evSeq, json: JSON.stringify(packEvents(evq)) });
      if (ring.length > EVENT_RING) ring.shift();
      evq = [];
    }
    const targets = joined().filter((p) => p.slot >= 0);
    if (!targets.length) { if (last) finalSent = true; return; }
    const snap = snapshot(m), slow = seq % SLOW_EVERY === 1, key = snap.p.join();
    if (key !== propsKey) { propsKey = key; propsLeft = 3; }
    const body = last ? null : encodeSnap(snap, { stats: slow, props: slow || propsLeft-- > 0 });
    sentAt.set(seq, now);
    if (sentAt.size > 240) sentAt.delete(sentAt.keys().next().value);
    for (const peer of targets) {
      if (last) sendRel(peer, { t: 'snap', q: seq, a: peer.applied, s: snap, b: ring.filter((b) => b.seq > peer.evAck).map((b) => [b.seq, JSON.parse(b.json)]), fin: 1 });
      else sendBytes(peer.link, encodeSnapPacket(seq, peer.applied, ring.length ? ring[0].seq : evSeq + 1, batchesFor(peer, now), body));
      online.stats.snapsSent++;
    }
    if (last) finalSent = true;
  };

  // ---- guest ----------------------------------------------------------------------------------------------------
  function resetGuest(mirror, slot) {
    buf = []; held = null; drawAt = 0; arrivals = []; lastFrame = 0; snapQ = 0; newestK = -1;
    evAck = 0; evSeen = new Set(); late = [];
    predictor = createPredictor(mirror, slot); own = null; sample = null; pressed = 0; tickAcc = 0; recent = [];
  }

  function takeSnapshot(p) {
    const m = online.mirror;
    if (online.state !== 'playing' || !m || !predictor) return;
    const now = clock(), k = p.snap.k;
    online.stats.snapsRecv++;
    if (p.q > snapQ) snapQ = p.q;
    p.events = [];
    for (const [seq, events] of p.batches) {
      if (seq <= evAck || evSeen.has(seq)) continue;
      evSeen.add(seq);
      for (const e of events) p.events.push(e);
    }
    if (p.base - 1 > evAck) evAck = p.base - 1;
    while (evSeen.has(evAck + 1)) evAck++;
    for (const seq of evSeen) if (seq <= evAck) evSeen.delete(seq);
    if (k > newestK) {
      newestK = k;
      const r = p.snap.u[online.mySlot];
      if (r) predictor.correct(p.applied, r[0], r[1], !!(r[6] & 1), !!(r[6] & 2));
    }
    arrivals.push([now, k * TICK]);
    while (arrivals.length > 2 && now - arrivals[0][0] > CLOCK_WINDOW) arrivals.shift();
    // A snapshot older than the one on screen still delivers its events.
    if (held && k <= held.k) { late.push(...p.events); return; }
    let at = buf.length;
    while (at > 0 && buf[at - 1].snap.k > k) at--;
    if (at > 0 && buf[at - 1].snap.k === k) { buf[at - 1].events.push(...p.events); return; }
    buf.splice(at, 0, p);
  }
  // The host time to draw now: the newest arrival seen from the fastest path, minus one snapshot interval and the
  // jitter that 9 arrivals in 10 stay under.
  function drawTime(now) {
    let base = Infinity;
    for (const a of arrivals) base = Math.min(base, a[0] - a[1]);
    const lag = arrivals.map((a) => a[0] - a[1] - base).sort((x, y) => x - y);
    const jitter = lag[Math.floor((lag.length - 1) * 0.9)] || 0;
    online.stats.delay = Math.min(DELAY_MAX, SNAP_DT + jitter + 0.008);
    return now - base - online.stats.delay;
  }

  function applyNext() {
    const p = buf.shift(), m = online.mirror, u = m.units[online.mySlot];
    // The own mech is drawn from the predictor; the mirror's own interval is kept aside and put back for the snapshot to move on from.
    if (own) { u.x = own.x; u.z = own.z; }
    applySnapshot(m, p.snap, held ? Math.max(TICK, (p.snap.k - held.k) * TICK) : undefined);
    own = { x: u.x, z: u.z, px: u.px, pz: u.pz };
    held = { k: p.snap.k, from: held ? held.k : p.snap.k };
    for (const e of p.events) m.events.push(e);
  }

  // The input a frame holds. A button pressed between two ticks stays pressed until a tick has sent it.
  online.sendInput = function sendInput(input) {
    if (online.role !== 'guest' || online.state !== 'playing' || !input) return;
    sample = input;
    FLAGS.forEach((k, i) => { if (input[k]) pressed |= 1 << i; });
  };

  // now: milliseconds, performance.now() style. Returns { alpha }: draw each unit and shot at px + (x - px) * alpha.
  online.frame = function frame(nowMs) {
    const m = online.mirror;
    if (online.role !== 'guest' || !m || !predictor) return { alpha: 1 };
    const now = nowMs / 1000, dt = lastFrame ? Math.min(0.1, Math.max(0, now - lastFrame)) : 0;
    lastFrame = now;
    m.events = late; late = [];

    let alpha = 1;
    if (!held) { if (buf.length >= 2 || (buf.length && now - arrivals[0][0] > 0.25)) { applyNext(); drawAt = held.k * TICK; } }
    else {
      const want = drawTime(now);
      drawAt = Math.abs(want - drawAt) > 0.3 ? want : drawAt + dt * (1 + Math.max(-0.08, Math.min(0.08, (want - drawAt) * 2)));
      while (buf.length && drawAt >= held.k * TICK) applyNext();
      const span = Math.max(TICK, (held.k - held.from) * TICK);
      alpha = Math.max(0, Math.min(1 + EXTRAPOLATE / span, 1 - (held.k * TICK - drawAt) / span));
    }

    const u = m.units[online.mySlot];
    if (sample) {
      tickAcc += dt;
      let ran = 0;
      for (; tickAcc >= TICK && ran < 4; ran++) {
        tickAcc -= TICK;
        const inp = wireInput(sample);
        FLAGS.forEach((k, i) => { if (pressed & (1 << i)) inp[k] = true; });
        pressed = 0;
        predictor.tick(inp);
        recent.unshift(inp);
        if (recent.length > INPUT_REPEAT) recent.pop();
      }
      if (tickAcc > TICK) tickAcc = 0;
      if (ran) { sendBytes(link.hostId, encodeInputPacket(predictor.seq, snapQ, evAck, recent)); online.stats.inputsSent += ran; }
      if (u.alive && !(u.stunT > 0) && !(u.cast && u.cast.lock)) u.aim = sample.aim;
    }
    if (own) {
      const p = predictor.pose(tickAcc / TICK, dt, own.px + (own.x - own.px) * alpha, own.pz + (own.z - own.pz) * alpha);
      const dx = p.free ? p.dx : own.x - own.px, dz = p.free ? p.dz : own.z - own.pz;
      // Everything is drawn at px + (x - px) * alpha: these two points put the own mech at p and keep its tick of motion.
      u.px = p.x - dx * alpha; u.pz = p.z - dz * alpha; u.x = u.px + dx; u.z = u.pz + dz;
      if (p.free) u.heading = p.heading;
    }
    return { alpha };
  };

  return online;
}
