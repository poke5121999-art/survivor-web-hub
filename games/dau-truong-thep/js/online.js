// Online play: a room on Unity Relay (or BroadcastChannel with ?fakenet=1), one host that runs the real simulation,
// guests that send inputs and render snapshots. main.js owns the match and the screens; this file owns the wire.
//
//   connection  off -> connecting -> lobby -> playing -> lobby      (FSM below, one table)
//   messages    { type -> handler } per role (HOST_MSG, GUEST_MSG)
//   reliable    lobby, start, welcome, hello, mine, final snapshot: resent until the peer acks the message type
//   droppable   snapshots, inputs, heartbeats
import { hostRoom, joinRoom, listRooms as listRelayRooms } from './net/room.js';
import { snapshot, applySnapshot, createMirror, packEvents, SNAP_TICKS } from './netstate.js';
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
const INPUT_RATE = 1 / 30;
const WELCOME_TIMEOUT = 8;
const EXTRAPOLATE = 0.1;
const SNAP_DT = SNAP_TICKS * TICK;
const CHAT_MAX = 120;
const CHAT_BURST = 5;        // messages allowed per player ...
const CHAT_WINDOW = 10;      // ... in this many seconds
const EVENT_RING = 20;      // batches kept for a guest whose acks are late: about 1.3 s of lost packets are repaired

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

// Text messages cut into frames of at most FRAME bytes: [index, count, id lo, id hi, ...]. A message missing a frame
// is dropped when the next one from that peer arrives; only snapshots and inputs are allowed to be lost this way.
class Framer {
  constructor() { this.id = 0; this.parts = new Map(); }
  pack(text) {
    const body = enc.encode(text), n = Math.max(1, Math.ceil(body.length / FRAME)), id = (this.id = (this.id + 1) & 0xffff), out = [];
    for (let i = 0; i < n; i++) {
      const c = body.subarray(i * FRAME, (i + 1) * FRAME), f = new Uint8Array(4 + c.length);
      f[0] = i; f[1] = n; f[2] = id & 255; f[3] = id >> 8; f.set(c, 4);
      out.push(f);
    }
    return out;
  }
  unpack(from, f) {
    const i = f[0], n = f[1], body = f.subarray(4);
    if (n === 1) return dec.decode(body);
    const key = from + ':' + (f[2] | (f[3] << 8));
    const entry = this.parts.get(key) || { at: performance.now(), parts: [] };
    entry.parts[i] = body.slice();
    this.parts.set(key, entry);
    if (entry.parts.filter(Boolean).length < n) return null;
    this.parts.delete(key);
    const all = new Uint8Array(entry.parts.reduce((s, p) => s + p.length, 0));
    let at = 0;
    for (const p of entry.parts) { all.set(p, at); at += p.length; }
    return dec.decode(all);
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
      const room = await hostRoom({ name: o.name, isPrivate: o.isPrivate, playerName: o.playerName, mode: o.mode, map: o.map, maxPlayers: MAX_PLAYERS });
      return { link: room.link, code: room.code, room, publish: (p) => room.publish(p), lock: (v) => room.lock(v), free: (uid) => room.free(uid), close: () => room.close() };
    },
    async join(o) {
      const room = await joinRoom({ code: o.code, lobbyId: o.lobbyId, playerName: o.playerName });
      return { link: room.link, code: room.lobby.lobbyCode || o.code || '', uid: room.uid, leave: (k) => room.leave(k) };
    },
    list: () => listRelayRooms(),
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
const wrapAim = (a) => (Number.isFinite(a) ? Math.atan2(Math.sin(a), Math.cos(a)) : 0);
const r2 = (v) => Math.round(v * 100) / 100;
const clock = () => performance.now() / 1000;

export function makeOnline(G) {
  const search = typeof location === 'undefined' ? '' : location.search;
  const fake = (G.params && G.params.fakenet === '1') || new URLSearchParams(search).get('fakenet') === '1';
  const net = fake ? TRANSPORTS.fake : TRANSPORTS.relay;
  const emit = (topic, data) => G.bus.emit(topic, data);

  const online = {
    state: 'off', role: null, code: '', error: '', me: null, lobby: null, mySlot: -1, rosterData: null, mirror: null,
    stats: { snapsSent: 0, snapsRecv: 0, bytesSent: 0, inputsSent: 0, inputsRecv: 0 },
  };
  const listeners = new Set();
  let link = null, conn = null, framer = new Framer(), pump = null, ticket = 0;
  let peers = new Map();         // link id -> { link, pid, slot, pending, seen, heard, input, inputSeq, inputAt, ack, uid }
  let relId = 0, pidN = 0;
  // host
  let evq = [], sinceSend = 0, snapSeq = 0, ring = [], finalSent = false, gone = new Set();
  // guest
  let inSeq = 0, pendIn = null, lastIn = 0, lastRecvQ = 0, evSeq = 0, queue = [], play = null, lastFrame = 0, lastHb = 0, hostHeard = 0, idle = 0;

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
        queue = []; play = null; gone = new Set(); evq = []; ring = [];
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
  function sendText(to, text) {
    if (!link) return;
    online.stats.bytesSent += text.length;
    for (const f of framer.pack(text)) link.send(to, f);
  }
  const send = (peer, msg) => sendText(peer.link, JSON.stringify(msg));
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

  function peerOf(id) {
    let p = peers.get(id);
    if (!p) { p = { link: id, pid: null, slot: -1, pending: new Map(), seen: {}, chatSeen: new Set(), chatTimes: [], heard: clock(), input: null, inputSeq: 0, inputAt: 0, ack: 0, uid: null }; peers.set(id, p); }
    return p;
  }

  function onPacket(from, bytes) {
    const text = framer.unpack(from, bytes);
    if (text === null) return;
    let msg;
    try { msg = JSON.parse(text); } catch (e) { return; }
    if (!msg || typeof msg.t !== 'string') return;
    const peer = peerOf(from);
    peer.heard = clock();
    if (online.role === 'guest') hostHeard = peer.heard;
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
    in(peer, m) {
      if (!(m.q > peer.inputSeq)) return;
      peer.inputSeq = m.q;
      const f = m.f | 0, mv = m.m || [], tp = m.p || [];
      const inp = { mx: finite(mv[0], -1, 1), mz: finite(mv[1], -1, 1), aim: wrapAim(m.r), tx: finite(tp[0], -200, 200), tz: finite(tp[1], -200, 200) };
      FLAGS.forEach((k, i) => { inp[k] = !!(f & (1 << i)); });
      peer.input = inp; peer.inputAt = clock(); peer.ack = m.a | 0;
      online.stats.inputsRecv++;
    },
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
      lastRecvQ = 0; evSeq = 0; queue = []; play = null; idle = 0; lastFrame = 0; pendIn = null; inSeq = 0;
      fire('start', { rosterData: m.rosterData, mySlot, mirror: createMirror(m.rosterData) });
    },
    snap(peer, m) {
      if (online.state !== 'playing' || !online.mirror || !(m.q > lastRecvQ)) return;
      lastRecvQ = m.q;
      online.stats.snapsRecv++;
      queue.push(m);
    },
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
    if (online.role === 'guest') flushInput(now);
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
      online.lobby = newLobby(pname); online.me = 'p0'; online.code = c.code; pidN = 0;
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
      peer.slot = slots[peer.pid]; peer.input = null; peer.inputSeq = 0; peer.inputAt = clock(); peer.ack = 0;
      sendRel(peer, { t: 'start', rosterData, slots });
    }
    evq = []; ring = []; snapSeq = 0; sinceSend = 0; finalSent = false; gone = new Set();
    fire('start', { rosterData, mySlot: slots[online.me], mirror: null });
    return true;
  };

  online.toLobby = function toLobby() { return fire('back'); };

  // ---- host, every tick -----------------------------------------------------------------------------------------
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
      const stale = !peer.input || now - peer.inputAt > INPUT_SILENCE;
      out[peer.slot] = stale ? NEUTRAL(peer.input ? peer.input.aim : 0) : peer.input;
    }
    return out;
  };

  function packet(seq, snapJson, batches) {
    return `{"t":"snap","q":${seq},"s":${snapJson},"b":[${batches.map((b) => b.json).join(',')}]}`;
  }

  online.afterStep = function afterStep(m) {
    if (online.role !== 'host' || online.state !== 'playing' || finalSent) return;
    for (const e of m.events) evq.push(e);
    sinceSend++;
    const last = m.over;
    if (sinceSend < SNAP_TICKS && !last) return;
    sinceSend = 0;
    const seq = ++snapSeq, ev = packEvents(evq);
    evq = [];
    ring.push({ seq, json: JSON.stringify([seq, ev]) });
    if (ring.length > EVENT_RING) ring.shift();
    const targets = joined().filter((p) => p.slot >= 0);
    if (!targets.length) { if (last) finalSent = true; return; }
    const snap = snapshot(m), snapJson = JSON.stringify(snap);
    for (const peer of targets) {
      const batches = ring.filter((b) => b.seq > peer.ack);
      if (last) sendRel(peer, { t: 'snap', q: seq, s: snap, b: batches.map((b) => JSON.parse(b.json)), fin: 1 });
      else sendText(peer.link, packet(seq, snapJson, batches));
      online.stats.snapsSent++;
    }
    if (last) finalSent = true;
  };

  // ---- guest, every frame ---------------------------------------------------------------------------------------
  // input: { mx, mz, aim, fire, s1, s2, ult, heal, tx, tz }. Call as often as you like; it sends at 30 Hz and keeps a
  // button pressed in between so a short tap is not lost.
  online.sendInput = function sendInput(input) {
    if (online.role !== 'guest' || online.state !== 'playing' || !input) return;
    const held = pendIn ? pendIn.f : 0;
    let f = 0;
    FLAGS.forEach((k, i) => { if (input[k]) f |= 1 << i; });
    pendIn = { f: f | held, mx: input.mx, mz: input.mz, aim: input.aim, tx: input.tx, tz: input.tz };
    flushInput(clock());
  };
  function flushInput(now) {
    if (!pendIn || now - lastIn < INPUT_RATE || !link || online.state !== 'playing') return;
    lastIn = now;
    const i = pendIn;
    pendIn = null;
    send(peerOf(link.hostId), { t: 'in', q: ++inSeq, a: lastRecvQ, m: [r2(i.mx || 0), r2(i.mz || 0)], r: Math.round(wrapAim(i.aim || 0) * 1000) / 1000, f: i.f, p: [Math.round((i.tx || 0) * 10) / 10, Math.round((i.tz || 0) * 10) / 10] });
    online.stats.inputsSent++;
  }

  // The mirror always holds an interval: px = the snapshot before, x = the newest one applied. `play` times it.
  function applyNext() {
    const e = queue.shift(), m = online.mirror;
    const dur = play ? Math.max(TICK, (e.s.k - play.k) * TICK) : SNAP_DT;
    applySnapshot(m, e.s, play ? dur : undefined);
    play = { k: e.s.k, elapsed: 0, dur };
    for (const [seq, ev] of e.b) if (seq > evSeq) { evSeq = seq; for (const x of ev) m.events.push(x); }
  }

  // now: milliseconds, performance.now() style. Returns { alpha }: draw each unit and shot at px + (x - px) * alpha.
  // Snapshots play one interval behind arrival; past the newest one the picture extrapolates for at most 100 ms.
  online.frame = function frame(now) {
    const m = online.mirror;
    if (online.role !== 'guest' || !m) return { alpha: 1 };
    const dt = lastFrame ? Math.min(0.1, Math.max(0, (now - lastFrame) / 1000)) : 0;
    lastFrame = now;
    m.events = [];
    if (!play) {
      idle = queue.length ? idle + dt : 0;
      if (queue.length >= 2 || idle > 0.25) applyNext();
      return { alpha: 1 };
    }
    while (queue.length > 8) applyNext();
    play.elapsed += dt * (queue.length > 3 ? 2 : queue.length > 2 ? 1.4 : 1);
    if (queue.length && play.elapsed >= play.dur) {
      const late = play.elapsed - play.dur;
      applyNext();
      // After a stall the clock restarts at the new snapshot instead of racing through the queue.
      play.elapsed = late > EXTRAPOLATE ? 0 : late;
    }
    return { alpha: Math.min(play.elapsed / play.dur, 1 + EXTRAPOLATE / play.dur) };
  };

  return online;
}
