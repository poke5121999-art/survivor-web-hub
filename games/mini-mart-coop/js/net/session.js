// Host and guest over any link with the RelayLink surface (send, broadcast, peers, onMessage, onPeer, onPeerLeft,
// onClose, drop). The host owns the game: it steps the CoopSim and streams patches of the wire state at RATE Hz with the
// sim events of that interval. A guest walks its own player, sends its pose, and asks for a full state when a patch
// arrives out of sequence.
//
// Messages are JSON. On the wire each is cut into frames of at most FRAME bytes: [index, count, id lo, id hi, ...].
import { diff, apply } from './mirror.js';

export const PROTOCOL = 1;
const FRAME = 1100;
const RATE = 10;
const POSE_RATE = 15;
const KEEPALIVE = 1;
const PEER_TIMEOUT = 8;
// Events only the host's screen needs, or that every guest rebuilds from state.
const LOCAL_EVENTS = new Set(['noCash', 'upgradeFill', 'nextReady', 'depart']);

const enc = new TextEncoder(), dec = new TextDecoder();

export class Framer {
  constructor() { this.id = 0; this.parts = new Map(); }

  pack(msg) {
    const body = enc.encode(JSON.stringify(msg));
    const n = Math.max(1, Math.ceil(body.length / FRAME)), id = this.id = (this.id + 1) & 0xffff, out = [];
    for (let i = 0; i < n; i++) {
      const chunk = body.subarray(i * FRAME, (i + 1) * FRAME), f = new Uint8Array(4 + chunk.length);
      f[0] = i; f[1] = n; f[2] = id & 255; f[3] = id >> 8;
      f.set(chunk, 4);
      out.push(f);
    }
    return out;
  }

  // Frames from one sender arrive in order (WebSocket both ways), so a message is complete at its last frame.
  unpack(from, f) {
    const i = f[0], n = f[1], body = f.subarray(4);
    if (n === 1) return JSON.parse(dec.decode(body));
    const key = `${from}:${f[2] | (f[3] << 8)}`;
    const parts = this.parts.get(key) || [];
    parts[i] = body.slice();
    this.parts.set(key, parts);
    if (parts.filter(Boolean).length < n) return null;
    this.parts.delete(key);
    const all = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
    let at = 0;
    for (const p of parts) { all.set(p, at); at += p.length; }
    return JSON.parse(dec.decode(all));
  }
}

const now = () => performance.now() / 1000;

export class HostNet {
  constructor({ link, sim, hostName, info, maxPlayers = 4, onCommand = () => {}, onRoster = () => {} }) {
    Object.assign(this, { link, sim, hostName, info, maxPlayers, onCommand, onRoster });
    this.framer = new Framer();
    this.peers = new Map();   // relay id -> { pid, name, ready, heard }; pid is short (p1, p2) since it rides in every patch and event
    this.joins = 0;
    this.sent = sim.wire(hostName);
    this.seq = 0;
    this.acc = 0;
    this.events = [];
    this.bytes = { tick: 0, full: 0, frames: 0 };
    this.listen = e => { if (!LOCAL_EVENTS.has(e.type) && this.sim === this.listening) this.events.push(e); };
    this.listening = sim;
    sim.listeners.push(this.listen);
    link.onMessage = (from, f) => {
      const m = this.framer.unpack(from, f);
      if (m) this.receive(from, m);
    };
    link.onPeerLeft = from => this.leave(from, 'left');
  }

  send(to, msg) {
    for (const f of this.framer.pack(msg)) { this.link.send(to, f); this.bytes.frames++; }
  }

  receive(from, m) {
    let p = this.peers.get(from);
    if (p) p.heard = now();
    if (m.t === 'hello') {
      if (m.v !== PROTOCOL) { this.send(from, { t: 'kick', why: 'version' }); return; }
      if (!p && this.peers.size >= this.maxPlayers - 1) { this.send(from, { t: 'kick', why: 'full' }); return; }
      if (!p) {
        p = { pid: `p${++this.joins}`, name: String(m.name || 'Player').slice(0, 16), ready: false, heard: now(), uid: m.uid, looks: m.looks || null };
        this.peers.set(from, p);
        this.sim.addRemote(p.pid, p.name, p.looks);
        this.onRoster(this.roster());
      }
      p.ready = false;   // the welcome goes out right after the next tick, with the state that tick produced
    } else if (!p) {
      return;
    } else if (m.t === 'pose') {
      this.sim.setPose(p.pid, m.p);
    } else if (m.t === 'resync') {
      p.ready = false;
    } else if (m.t === 'looks') {
      p.looks = m.looks || null;
      this.sim.setLooks(p.pid, p.looks);
    } else if (m.t === 'cmd') {
      this.onCommand(p.pid, m);
    } else if (m.t === 'bye') {
      this.leave(from, 'left');
    }
  }

  leave(from, why) {
    const p = this.peers.get(from);
    if (!p) return;
    this.peers.delete(from);
    this.sim.removeRemote(p.pid);
    this.link.drop(from);
    this.onRoster(this.roster(), { left: p.pid, uid: p.uid, why });
  }

  roster() {
    return [{ id: 'host', name: this.hostName }, ...[...this.peers].map(([, p]) => ({ id: p.pid, name: p.name, uid: p.uid }))];
  }

  update(dt) {
    const t = now();
    for (const [id, p] of this.peers) if (t - p.heard > PEER_TIMEOUT) this.leave(id, 'timeout');
    this.acc += dt;
    if (this.acc < 1 / RATE) return;
    this.acc = 0;
    const next = this.sim.wire(this.hostName);
    const p = diff(this.sent, next);
    this.sent = next;
    this.lastPatch = p;
    this.seq++;
    const events = this.events.splice(0);
    const ready = [...this.peers].filter(([, x]) => x.ready);
    if (ready.length) {
      const msg = { t: 'tick', s: this.seq, p: p || null, e: events };
      for (const f of this.framer.pack(msg)) {
        for (const [id] of ready) { this.link.send(id, f); this.bytes.tick += f.length; this.bytes.frames++; }
      }
    }
    for (const [id, x] of this.peers) {
      if (x.ready) continue;
      const msg = { t: 'welcome', v: PROTOCOL, you: x.pid, s: this.seq, info: this.info, full: this.sent };
      for (const f of this.framer.pack(msg)) { this.link.send(id, f); this.bytes.full += f.length; this.bytes.frames++; }
      x.ready = true;
    }
  }

  // The room moved to another mart (next-mart van, map, prestige): a new sim, everyone re-added and re-welcomed.
  rebind(sim, info) {
    this.sim = sim;
    this.info = info;
    this.listening = sim;
    sim.listeners.push(this.listen);
    for (const p of this.peers.values()) {
      sim.addRemote(p.pid, p.name, p.looks);
      p.ready = false;
    }
    this.events = [];
    this.sent = sim.wire(this.hostName);
  }

  close(why = 'host closed the store') {
    for (const id of this.peers.keys()) this.send(id, { t: 'kick', why });
    this.link.close();
  }
}

export class GuestNet {
  constructor({ link, name, uid = null, looks = null }) {
    Object.assign(this, { link, name, uid, looks });
    this.framer = new Framer();
    this.host = link.hostId;
    this.wire = null;
    this.seq = 0;
    this.acc = 0;
    this.lastPose = '';
    this.sentAt = 0;
    this.onTick = () => {};      // (wire, events) after each applied patch
    this.onWelcome = () => {};   // a later welcome: a resync, or the room moved to another mart (m.info.mart)
    this.onKick = () => {};
    this.stats = { ticks: 0, resyncs: 0 };
    link.onMessage = (from, f) => {
      const m = this.framer.unpack(from, f);
      if (m) this.receive(m);
    };
    link.onClose = why => this.onKick(why);
  }

  send(msg) {
    for (const f of this.framer.pack(msg)) this.link.send(this.host, f);
    this.sentAt = now();
  }

  // Resolves with the welcome (who I am, the store, the full state).
  join(timeout = 15) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('host did not answer')), timeout * 1000);
      this.welcomed = m => { clearTimeout(timer); resolve(m); };
      this.refused = why => { clearTimeout(timer); reject(new Error(why)); };
      this.send({ t: 'hello', v: PROTOCOL, name: this.name, uid: this.uid, looks: this.looks });
    });
  }

  receive(m) {
    if (m.t === 'welcome') {
      this.wire = m.full;
      this.seq = m.s;
      this.me = m.you;
      if (this.welcomed) { const w = this.welcomed; this.welcomed = null; w(m); return; }
      this.onWelcome(m);
    } else if (m.t === 'tick') {
      if (!this.wire) return;
      if (m.s !== this.seq + 1) {
        if (!this.waiting) { this.waiting = true; this.stats.resyncs++; this.send({ t: 'resync' }); }
        return;
      }
      this.waiting = false;
      this.seq = m.s;
      if (m.p) this.wire = apply(this.wire, m.p);
      this.stats.ticks++;
      this.onTick(this.wire, m.e);
    } else if (m.t === 'kick') {
      if (this.refused) this.refused(m.why);
      this.onKick(m.why);
    }
  }

  update(dt, pose) {
    this.acc += dt;
    if (this.acc < 1 / POSE_RATE) return;
    this.acc = 0;
    const key = JSON.stringify(pose);
    if (key !== this.lastPose || now() - this.sentAt > KEEPALIVE) {
      this.lastPose = key;
      this.send({ t: 'pose', p: pose });
    }
  }

  command(op, args = {}) { this.send({ t: 'cmd', op, ...args }); }

  setLooks(looks) { this.looks = looks; this.send({ t: 'looks', looks }); }

  leave() {
    try { this.send({ t: 'bye' }); } catch (e) { /* link already down */ }
    this.link.close();
  }
}

// In-memory links for tests and the local two-tab check: same surface as RelayLink, delivery on the next microtask.
export function memoryPair() {
  const mk = id => ({ id, peers: new Set(), hostId: null, onMessage() {}, onPeer() {}, onPeerLeft() {}, onClose() {}, stats: { tx: 0 } });
  const host = mk('h0st'.padEnd(32, '0')), links = new Map([[host.id, host]]);
  let n = 0;
  const deliver = (from, to, f) => {
    const t = links.get(to);
    if (!t) return;
    queueMicrotask(() => {
      if (!t.peers.has(from)) { t.peers.add(from); t.onPeer(from); }
      t.onMessage(from, f);
    });
  };
  const wire = l => Object.assign(l, {
    send(to, f) { l.stats.tx += f.length; deliver(l.id, to, f.slice()); },
    broadcast(f) { for (const p of l.peers) l.send(p, f); },
    drop(p) { l.peers.delete(p); },
    close() { links.delete(l.id); for (const p of l.peers) { const t = links.get(p); if (t && t.peers.delete(l.id)) t.onPeerLeft(l.id); } },
  });
  wire(host);
  return {
    host,
    guest() {
      const g = mk(`g${++n}`.padEnd(32, '0'));
      g.hostId = host.id;
      g.peers.add(host.id);
      links.set(g.id, g);
      return wire(g);
    },
  };
}
