// Binary wire format of an online Food Gang match (host-authoritative). Every message starts with a type byte.
//   CTRL  = 1 | frame index u8 | frame count u8 | id u16 LE | JSON bytes        lobby, start, keepalive (reliable path)
//   INPUT = 2 | ackSnap | echo | newestSeq | count u8 | count x (dir u8, down | pressed << 3)   newest first
//   SNAP  = 3 | seq | tick | baseSeq | ackInput | echo | hold | globals | agents | bullets | firstEvent | nEvents | events
// Integers are LEB128 varints (zigzag where signed). Entity state is a vector of quantized ints; an entity is written
// as a changed-field bitmask plus zigzag deltas against the same entity in the base snapshot the client acked
// (baseSeq 0 = against zeros, a full snapshot).
import { createBulletState } from '../sim/index.js';

export const MSG = Object.freeze({ CTRL: 1, INPUT: 2, SNAP: 3 });
export const PROTOCOL = 1;
// Relay messages ride one WebSocket frame; mini-mart-coop keeps frames under 1100 bytes and so do we.
export const MAX_PACKET = 1100;

export class Writer {
  constructor(size = 256) { this.buf = new Uint8Array(size); this.n = 0; }
  need(k) {
    if (this.n + k <= this.buf.length) return;
    const b = new Uint8Array(Math.max(this.buf.length * 2, this.n + k));
    b.set(this.buf.subarray(0, this.n));
    this.buf = b;
  }
  u8(v) { this.need(1); this.buf[this.n++] = v & 255; }
  uv(v) {
    this.need(8);
    while (v >= 128) { this.buf[this.n++] = (v % 128) | 128; v = Math.floor(v / 128); }
    this.buf[this.n++] = v;
  }
  sv(v) { this.uv(v >= 0 ? v * 2 : -v * 2 - 1); }
  f32(v) { this.need(4); new DataView(this.buf.buffer).setFloat32(this.n, v, true); this.n += 4; }
  bytes(u8) { this.need(u8.length); this.buf.set(u8, this.n); this.n += u8.length; }
  done() { return this.buf.slice(0, this.n); }
}

export class Reader {
  constructor(u8, at = 0) { this.b = u8; this.i = at; }
  get left() { return this.b.length - this.i; }
  u8() { if (this.i >= this.b.length) throw new Error('packet truncated'); return this.b[this.i++]; }
  uv() {
    let v = 0, k = 1, c;
    do { c = this.u8(); v += (c & 127) * k; k *= 128; } while (c & 128);
    return v;
  }
  sv() { const u = this.uv(); return u % 2 ? -(u + 1) / 2 : u / 2; }
  f32() { const v = new DataView(this.b.buffer, this.b.byteOffset).getFloat32(this.i, true); this.i += 4; return v; }
}

// ---- entity schemas: [get(obj) -> int, set(obj, int)]

const num = (k, q) => [(o) => Math.round(o[k] * q), (o, v) => { o[k] = v / q; }];
const sub = (k, j, q) => [(o) => Math.round(o[k][j] * q), (o, v) => { o[k][j] = v / q; }];
const flag = (k) => [(o) => (o[k] ? 1 : 0), (o, v) => { o[k] = v !== 0; }];
const bits = (keys) => [
  (o) => { let m = 0; for (let i = 0; i < keys.length; i++) if (o[keys[i]]) m |= 1 << i; return m; },
  (o, v) => { for (let i = 0; i < keys.length; i++) o[keys[i]] = (v & (1 << i)) !== 0; },
];

// Fields the views, HUD and result screen read (AgentView, Hud, MatchScene.outcome/debug); the rest stays host-only.
export const AGENT = [
  sub('pos', 'x', 256), sub('pos', 'y', 256), sub('velocity', 'x', 64), sub('velocity', 'y', 64),
  bits(['grounded', 'facingLeft', 'isActioning', 'currentIsSpecial', 'isBot', 'isJumping', 'isFalling', 'isDashing',
    'isPushback', 'meleeWindowOpen', 'isBusy']),
  num('directionX', 127), num('flags', 1), num('hpCurrent', 16), num('hpMax', 16),
  num('cooldownAction', 60), num('cooldownActionMax', 60), num('cooldownSpecial', 60), num('cooldownSpecialMax', 60),
  num('respawnTimer', 60), num('invincibilityTimer', 60), num('killCount', 1), num('deathCount', 1),
  num('actionRef', 1), num('specialRef', 1), num('actionEventIndex', 1),
  sub('powerTypes', 0, 1), sub('powerTypes', 1, 1), sub('powerTypes', 2, 1), sub('powerTypes', 3, 1),
  num('level', 1), num('skin', 1), num('lastKiller', 1),
];

export const GLOBAL = [
  num('phase', 1), num('timerElapsed', 60), num('timerMax', 60), num('winnerSlot', 1), num('winnerTeam', 1), flag('timeOut'),
  ...[0, 1, 2, 3].map((i) => sub('killSlot', i, 1)), ...[0, 1, 2, 3].map((i) => sub('deathSlot', i, 1)),
  ...[0, 1, 2, 3].map((i) => sub('lastKillSeq', i, 1)), ...[0, 1, 2, 3].map((i) => sub('lastDeathSeq', i, 1)),
];

export const BULLET = [
  num('data', 1), num('source', 1), sub('pos', 'x', 256), sub('pos', 'y', 256), sub('velocity', 'x', 64), sub('velocity', 'y', 64),
  sub('direction', 'x', 1024), sub('direction', 'y', 1024), num('distanceTraveled', 64), num('scaleOnDistance', 64),
  flag('fromBoss'), flag('isSpecial'), flag('alive'),
];

for (const s of [AGENT, GLOBAL, BULLET]) if (s.length > 31) throw new Error('schema has more than 31 fields');

export const vec = (schema, o) => schema.map(([g]) => g(o));
export const unvec = (schema, o, v) => { for (let i = 0; i < schema.length; i++) schema[i][1](o, v[i]); return o; };

function writeDelta(w, v, base) {
  let mask = 0;
  for (let i = 0; i < v.length; i++) if (v[i] !== (base ? base[i] : 0)) mask |= 1 << i;
  w.uv(mask >>> 0);
  for (let i = 0; i < v.length; i++) if (mask & (1 << i)) w.sv(v[i] - (base ? base[i] : 0));
}

function readDelta(r, len, base) {
  const mask = r.uv();
  const v = new Array(len);
  for (let i = 0; i < len; i++) {
    const b = base ? base[i] : 0;
    v[i] = (mask & (1 << i)) ? b + r.sv() : b;
  }
  return v;
}

/** Quantized picture of one MatchState: {tick, g, a: [vec], b: Map(id -> vec)}. */
export function capture(s) {
  const b = new Map();
  for (const x of s.bullets) b.set(x.id, vec(BULLET, x));
  return { tick: s.tick, g: vec(GLOBAL, s), a: s.agents.map((x) => vec(AGENT, x)), b };
}

// ---- events (SimEvent: type, tick, agent, other, bullet, int, value, value2, flag, pos)

function writeEvent(w, e, tick) {
  w.u8(e.type);
  w.uv(tick - e.tick);
  const m = (e.agent !== -1 ? 1 : 0) | (e.other !== -1 ? 2 : 0) | (e.bullet !== -1 ? 4 : 0) | (e.int !== 0 ? 8 : 0)
    | (e.value !== 0 ? 16 : 0) | (e.value2 !== 0 ? 32 : 0) | (e.flag ? 64 : 0) | (e.pos.x !== 0 || e.pos.y !== 0 ? 128 : 0);
  w.u8(m);
  if (m & 1) w.uv(e.agent);
  if (m & 2) w.uv(e.other);
  if (m & 4) w.uv(e.bullet);
  if (m & 8) w.sv(e.int);
  if (m & 16) w.f32(e.value);
  if (m & 32) w.f32(e.value2);
  if (m & 128) { w.sv(Math.round(e.pos.x * 256)); w.sv(Math.round(e.pos.y * 256)); }
}

function readEvent(r, tick) {
  const type = r.u8();
  const t = tick - r.uv();
  const m = r.u8();
  return {
    type, tick: t,
    agent: m & 1 ? r.uv() : -1, other: m & 2 ? r.uv() : -1, bullet: m & 4 ? r.uv() : -1, int: m & 8 ? r.sv() : 0,
    value: m & 16 ? r.f32() : 0, value2: m & 32 ? r.f32() : 0, flag: (m & 64) !== 0,
    pos: m & 128 ? { x: r.sv() / 256, y: r.sv() / 256 } : { x: 0, y: 0 },
  };
}

// ---- snapshot

/**
 * h: {seq, baseSeq, ackInput, echo, hold}; cur, base: capture() results (base null = full);
 * events: [{seq, e}] in order, written until the packet would pass MAX_PACKET. Returns {bytes, lastEvent}.
 */
export function encodeSnapshot(h, cur, base, events) {
  const w = new Writer(512);
  w.u8(MSG.SNAP);
  w.uv(h.seq); w.uv(cur.tick); w.uv(base ? h.baseSeq : 0); w.uv(h.ackInput); w.uv(h.echo); w.uv(h.hold);
  writeDelta(w, cur.g, base && base.g);
  w.uv(cur.a.length);
  for (let i = 0; i < cur.a.length; i++) writeDelta(w, cur.a[i], base && base.a[i]);
  const ids = [...cur.b.keys()].sort((x, y) => x - y);
  w.uv(ids.length);
  let prev = 0;
  for (const id of ids) {
    w.uv(id - prev); prev = id;
    writeDelta(w, cur.b.get(id), base ? base.b.get(id) : null);
  }
  const first = events.length ? events[0].seq : 0;
  w.uv(first);
  // the event count goes last so the loop can stop at the size cap; the reader takes it from the trailing byte group
  const ew = new Writer(256);
  let count = 0, lastEvent = first - 1;
  for (const { seq, e } of events) {
    const at = ew.n;
    writeEvent(ew, e, cur.tick);
    if (w.n + ew.n + 4 > MAX_PACKET && count > 0) { ew.n = at; break; }
    count++; lastEvent = seq;
  }
  w.uv(count);
  w.bytes(ew.buf.subarray(0, ew.n));
  return { bytes: w.done(), lastEvent };
}

/** baseOf(seq) -> capture or undefined. Throws 'base snapshot missing' when the client lacks the base. */
export function decodeSnapshot(u8, baseOf) {
  const r = new Reader(u8, 1);
  const h = { seq: r.uv(), tick: r.uv(), baseSeq: r.uv(), ackInput: r.uv(), echo: r.uv(), hold: r.uv() };
  let base = null;
  if (h.baseSeq) {
    base = baseOf(h.baseSeq);
    if (!base) throw new Error('base snapshot missing');
  }
  const g = readDelta(r, GLOBAL.length, base && base.g);
  const na = r.uv();
  const a = [];
  for (let i = 0; i < na; i++) a.push(readDelta(r, AGENT.length, base && base.a[i]));
  const nb = r.uv();
  const b = new Map();
  let id = 0;
  for (let i = 0; i < nb; i++) {
    id += r.uv();
    b.set(id, readDelta(r, BULLET.length, base ? base.b.get(id) : null));
  }
  const first = r.uv();
  const count = r.uv();
  const events = [];
  for (let i = 0; i < count; i++) events.push({ seq: first + i, e: readEvent(r, h.tick) });
  return { h, snap: { tick: h.tick, g, a, b }, events };
}

/** Writes a capture into a MatchState-shaped object (agents keep their static fields from the template). */
export function applyCapture(s, c) {
  s.tick = c.tick;
  unvec(GLOBAL, s, c.g);
  for (let i = 0; i < c.a.length && i < s.agents.length; i++) unvec(AGENT, s.agents[i], c.a[i]);
  s.bullets = [];
  for (const [id, v] of c.b) {
    const b = createBulletState();
    b.id = id;
    s.bullets.push(unvec(BULLET, b, v));
  }
  return s;
}

// ---- input

/** frames: [{seq, f: InputFrame}] newest first (redundant copies of the last few). */
export function encodeInput(ackSnap, echo, frames) {
  const w = new Writer(64);
  w.u8(MSG.INPUT);
  w.uv(ackSnap); w.uv(echo);
  w.uv(frames.length ? frames[0].seq : 0);
  w.u8(frames.length);
  for (const { f } of frames) { w.u8(f.encodedDirection); w.u8((f.down & 7) | ((f.pressed & 7) << 3)); }
  return w.done();
}

export function decodeInput(u8) {
  const r = new Reader(u8, 1);
  const ackSnap = r.uv(), echo = r.uv(), newest = r.uv(), n = r.u8();
  const frames = [];
  for (let i = 0; i < n; i++) {
    const dir = r.u8(), b = r.u8();
    frames.push({ seq: newest - i, f: { encodedDirection: dir, down: b & 7, pressed: (b >> 3) & 7 } });
  }
  return { ackSnap, echo, frames };
}

// ---- control messages: JSON cut into frames (a START carries the whole match request)

const enc = new TextEncoder(), dec = new TextDecoder();
const CTRL_FRAME = MAX_PACKET - 5;

export class CtrlFramer {
  constructor() { this.id = 0; this.parts = new Map(); }

  pack(msg) {
    const body = enc.encode(JSON.stringify(msg));
    const n = Math.max(1, Math.ceil(body.length / CTRL_FRAME));
    const id = this.id = (this.id + 1) & 0xffff;
    const out = [];
    for (let i = 0; i < n; i++) {
      const chunk = body.subarray(i * CTRL_FRAME, (i + 1) * CTRL_FRAME);
      const f = new Uint8Array(5 + chunk.length);
      f[0] = MSG.CTRL; f[1] = i; f[2] = n; f[3] = id & 255; f[4] = id >> 8;
      f.set(chunk, 5);
      out.push(f);
    }
    return out;
  }

  unpack(from, f) {
    const i = f[1], n = f[2], body = f.subarray(5);
    if (n === 1) return JSON.parse(dec.decode(body));
    const key = `${from}:${f[3] | (f[4] << 8)}`;
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
