// Match state on the wire. Pure: no DOM, no three.js, runs in Node.
//   host:   snapshot(m) every SNAP_TICKS ticks -> encodeSnap -> bytes; packEvents(events) for the ticks in between
//   guest:  createMirror(roster) once; decodeSnap(bytes) -> applySnapshot(mirror, snap, dt) per snapshot
//   guest:  encodeInput(...) per local tick; host: decodeInput(bytes)
// The mirror has the same field names as a real match, so gfx, ui and audio read it unchanged.
// Static facts (map, mechs, weapon stats) never travel: both ends rebuild them from data.js and maps.js.

import { TICK, MECHS, BOSSES, PICKUPS } from './data.js';
import { createMatch } from './sim.js';

export const SNAP_TICKS = 1;

const rd = (v, k = 100) => Math.round(v * k) / k;
const ang = (v) => rd(v, 1000);
// A running timer never rounds down to 0: `stealthT > 0` and `hidden()` must agree on both ends.
const tm = (v) => (v > 0 ? Math.max(0.01, rd(v)) : 0);
const num = (v) => (Number.isFinite(v) ? v : 0);

const PICKUP_KEYS = Object.keys(PICKUPS);
const ZONE_KINDS = ['strike', 'mine', 'field', 'dome', 'wall', 'turret'];

// Shots are sent as [id, owner, kind, x, z, angle]. Team and colour come from the owner; speed, radius and look from
// a kind table both ends build from the same data rows (weapons, volley skills, the turret). A kind the table lacks
// travels in the snapshot's `xk` list, so a new weapon row never breaks the protocol.
const SHOT_KINDS = [];
const shotKey = (vis, speed, r) => `${vis}|${speed}|${r}`;
const SHOT_INDEX = new Map();
function addKind(vis, speed, r) {
  const k = shotKey(vis, speed, r);
  if (!SHOT_INDEX.has(k)) { SHOT_INDEX.set(k, SHOT_KINDS.length); SHOT_KINDS.push({ vis, speed, r }); }
}
for (const def of [...Object.values(MECHS), ...Object.values(BOSSES)]) {
  for (const s of [def.weapon, ...def.skills]) if (s.vis && s.speed && s.r && !s.lob) addKind(s.vis, s.speed, s.r);
}
addKind('rivet', 30, 0.18);

// Per zone kind: the fields beyond [id, kind, owner, x, z, r, age, delay]. n number, b boolean, s string, p points.
const ZONE_EXTRA = {
  strike: [['total', 'n'], ['lob', 'b'], ['x0', 'n'], ['z0', 'n']],
  mine: [['dur', 'n'], ['blast', 'n']],
  field: [['dur', 'n'], ['vis', 's'], ['hps', 'n'], ['dps', 'n'], ['slow', 'n'], ['hide', 'b'], ['pull', 'n']],
  dome: [['dur', 'n']],
  wall: [['dur', 'n'], ['a', 'a'], ['pts', 'p']],
  turret: [['dur', 'n'], ['hp', 'i'], ['maxHp', 'i'], ['aim', 'a'], ['range', 'n']],
};

function encZoneField(v, type) {
  if (type === 'b') return v ? 1 : 0;
  if (type === 's') return v || '';
  if (type === 'p') return (v || []).map((p) => [rd(p[0]), rd(p[1])]);
  if (type === 'i') return Math.round(num(v));
  if (type === 'a') return ang(num(v));
  return rd(num(v));
}
function decZoneField(v, type) {
  if (type === 'b') return !!v;
  return v;
}

const F_ALIVE = 1, F_DASH = 2, F_BOT = 4;
const STATUS = ['shield', 'shieldMax', 'shieldT', 'slowT', 'stunT', 'hasteT', 'rapidT', 'dmgT', 'stealthT', 'invulnT', 'revealT', 'healT'];
const CD = ['fire', 's1', 's2', 'ult', 'heal'];

function unitRow(u) {
  const r = [rd(u.x), rd(u.z), ang(u.aim), rd(u.heading), Math.round(u.hp), u.maxHp,
    (u.alive ? F_ALIVE : 0) | (u.dash ? F_DASH : 0) | (u.bot ? F_BOT : 0), tm(u.respawnT)];
  for (const k of CD) r.push(tm(u.cd[k]));
  for (const k of STATUS) r.push(tm(u[k]));
  r.push(u.bush, u.cast ? [u.def.skills.indexOf(u.cast.skill), rd(u.cast.t), rd(u.cast.total), ang(u.cast.aim)] : 0,
    rd(u.slowF || 0), rd(u.hasteF || 1), u.kills, u.deaths, u.assists, Math.round(u.dmg), Math.round(u.healed));
  return r;
}

export function snapshot(m) {
  const xk = [], extra = new Map();
  const shots = m.shots.map((s) => {
    const key = shotKey(s.vis, s.speed, s.r);
    let k = SHOT_INDEX.get(key);
    if (k === undefined) {
      if (!extra.has(key)) { extra.set(key, SHOT_KINDS.length + xk.length); xk.push([s.vis, s.speed, s.r]); }
      k = extra.get(key);
    }
    // A tower's shot has no unit owner: it travels as -1 - towerId.
    return [s.id, s.owner >= 0 ? s.owner : -1 - (s.tower || 0), k, rd(s.x), rd(s.z), ang(Math.atan2(s.dz, s.dx))];
  });
  const zones = m.zones.map((z) => {
    const row = [z.id, ZONE_KINDS.indexOf(z.kind), z.owner, rd(z.x), rd(z.z), rd(z.r), rd(z.age), rd(num(z.delay))];
    for (const [name, type] of ZONE_EXTRA[z.kind]) row.push(encZoneField(z[name], type));
    return row;
  });
  const mask = [];
  m.props.forEach((p, i) => { if (!p.alive) mask[i >> 4] = (mask[i >> 4] || 0) | (1 << (i & 15)); });
  for (let i = 0; i < Math.ceil(m.props.length / 16); i++) mask[i] = mask[i] || 0;
  const snap = {
    k: m.tick, sc: m.score.slice(), o: m.over ? 1 : 0, w: m.winner, l: m.lives,
    pt: m.points.map((p) => [p.owner, rd(p.prog, 1000)]),
    vt: m.vents.map((v) => [rd(v.t), v.warn ? 1 : 0]),
    tw: m.towers.map((t) => [Math.round(t.hp), t.alive ? 1 : 0, rd(t.charge), ang(t.aim), t.target]),
    u: m.units.map(unitRow), s: shots, z: zones,
    c: m.crates.map((c) => [c.id, rd(c.x), rd(c.z), PICKUP_KEYS.indexOf(c.type), rd(c.fall), rd(c.age)]),
    p: mask,
  };
  if (xk.length) snap.xk = xk;
  return snap;
}

// What the host sends once at match start, from a real match. (online.js builds the same shape from the lobby
// before a match exists; both feed createMirror and matchOptions.)
export function roster(m) {
  return {
    map: m.map.key, theme: m.map.theme, mode: m.mode, seed: m.seed, target: m.target, duration: m.duration,
    units: m.units.map((u) => ({ team: m.mode === 'tudo' ? 0 : u.team, color: u.color, mech: u.mech, name: u.name, bot: u.bot, diff: u.diff,
      paint: u.paint, radius: u.radius, maxHp: u.maxHp, mods: { hp: u.maxHp / u.def.hp, dmg: u.dmgMod } })),
  };
}

// createMatch options for a roster. In free-for-all createMatch gives every unit its own team, so the roster's team
// only matters in team modes.
export function matchOptions(rosterData) {
  return {
    map: rosterData.map, theme: rosterData.theme, mode: rosterData.mode, seed: rosterData.seed, target: rosterData.target, duration: rosterData.duration,
    roster: rosterData.units.map((r) => ({ team: r.team, mech: r.mech, name: r.name, bot: r.bot, diff: r.diff, paint: r.paint, mods: r.mods })),
  };
}

// A match-shaped object for a guest. Built by the real createMatch (same map, points, vents, props, unit shape) and
// then only ever written by applySnapshot.
export function createMirror(rosterData) {
  const m = createMatch(matchOptions(rosterData));
  m.events = [];
  m.mirror = true;
  m.units.forEach((u, i) => { if (rosterData.units[i].color !== undefined) u.color = rosterData.units[i].color; });
  m.net = { shots: new Map(), zones: new Map(), first: true };
  m.shots = []; m.zones = []; m.crates = [];
  return m;
}

// dt: seconds the host simulated between the previous snapshot and this one (new shots start that far back).
export function applySnapshot(m, snap, dt) {
  const net = m.net;
  const dts = dt === undefined ? (net.first ? 0 : (snap.k - m.tick) * TICK) : dt;
  const first = net.first;
  net.first = false;
  m.tick = snap.k; m.time = snap.k * TICK;
  m.score = snap.sc.slice(); m.over = !!snap.o; m.winner = snap.w; m.lives = snap.l;
  snap.pt.forEach((p, i) => { if (m.points[i]) { m.points[i].owner = p[0]; m.points[i].prog = p[1]; } });
  snap.vt.forEach((v, i) => { if (m.vents[i]) { m.vents[i].t = v[0]; m.vents[i].warn = !!v[1]; } });
  (snap.tw || []).forEach((r, i) => { const t = m.towers[i]; if (t) { t.hp = r[0]; t.alive = !!r[1]; t.charge = r[2]; t.aim = r[3]; t.target = r[4]; } });

  snap.u.forEach((r, i) => {
    const u = m.units[i];
    if (!u) return;
    const wasAlive = u.alive;
    u.px = u.x; u.pz = u.z;
    u.x = r[0]; u.z = r[1]; u.aim = r[2]; u.heading = r[3]; u.hp = r[4];
    if (r[5] !== undefined) u.maxHp = r[5];
    u.alive = !!(r[6] & F_ALIVE); u.dash = r[6] & F_DASH ? { remote: true } : null; u.bot = !!(r[6] & F_BOT);
    u.respawnT = r[7];
    let at = 8;
    for (const k of CD) u.cd[k] = r[at++];
    for (const k of STATUS) u[k] = r[at++];
    u.bush = r[at++];
    const c = r[at++];
    if (c) {
      const skill = u.def.skills[c[0]];
      u.cast = { skill, t: c[1], total: c[2], aim: c[3], move: skill.move ?? (skill.do === 'beam' ? 0.12 : 0.35), lock: skill.do === 'beam' };
    } else u.cast = null;
    u.slowF = r[at++]; u.hasteF = r[at++];
    if (r[at] !== undefined) { u.kills = r[at++]; u.deaths = r[at++]; u.assists = r[at++]; u.dmg = r[at++]; u.healed = r[at++]; }
    const jump = (u.x - u.px) ** 2 + (u.z - u.pz) ** 2;
    if (first || !wasAlive || jump > 36) { u.px = u.x; u.pz = u.z; }
  });

  const kinds = (k) => (k < SHOT_KINDS.length ? SHOT_KINDS[k] : (() => { const x = (snap.xk || [])[k - SHOT_KINDS.length] || ['bullet', 30, 0.2]; return { vis: x[0], speed: x[1], r: x[2] }; })());
  const seen = new Map();
  m.shots = snap.s.map((r) => {
    const kind = kinds(r[2]), owner = r[1] >= 0 ? m.units[r[1]] : m.towers[-1 - r[1]];
    let s = net.shots.get(r[0]);
    const dx = Math.cos(r[5]), dz = Math.sin(r[5]);
    if (s) { s.px = s.x; s.pz = s.z; } else {
      s = { id: r[0] };
      s.px = r[3] - dx * kind.speed * dts; s.pz = r[4] - dz * kind.speed * dts;
    }
    s.team = owner ? owner.team : 0; s.color = owner ? owner.color : 0; s.owner = r[1] >= 0 ? r[1] : -1;
    s.x = r[3]; s.z = r[4]; s.dx = dx; s.dz = dz; s.speed = kind.speed; s.vis = kind.vis; s.r = kind.r;
    seen.set(s.id, s);
    return s;
  });
  net.shots = seen;

  const zseen = new Map();
  m.zones = snap.z.map((r) => {
    const kind = ZONE_KINDS[r[1]], owner = m.units[r[2]];
    const z = net.zones.get(r[0]) || { id: r[0] };
    z.kind = kind; z.owner = r[2]; z.team = owner ? owner.team : 0; z.color = owner ? owner.color : 0;
    z.x = r[3]; z.z = r[4]; z.r = r[5]; z.age = r[6]; z.delay = r[7];
    ZONE_EXTRA[kind].forEach(([name, type], i) => { z[name] = decZoneField(r[8 + i], type); });
    zseen.set(z.id, z);
    return z;
  });
  net.zones = zseen;

  m.crates = snap.c.map((r) => ({ id: r[0], x: r[1], z: r[2], type: PICKUP_KEYS[r[3]], fall: r[4], age: r[5] }));
  if (snap.p) m.props.forEach((p, i) => {
    p.alive = !((snap.p[i >> 4] >> (i & 15)) & 1);
    if (!p.alive) p.hp = 0;
  });
  return m;
}

// Events leave the host as rounded copies. An event whose keys are exactly its row here travels as
// [type index, values...]; any other event (a new type, an optional key) travels as the plain object.
const EVENT_KEYS = {
  fire: ['id', 'vis', 'x', 'z', 'a', 'side'], impact: ['vis', 'on', 'x', 'z', 'dx', 'dz', 'splash'], hit: ['id', 'by', 'x', 'z', 'amt', 'absorbed'],
  skill: ['id', 'slot', 'skill', 'x', 'z', 'a'], zone: ['id', 'kind', 'x', 'z', 'lob'], zoneEnd: ['id', 'kind', 'x', 'z'], explode: ['x', 'z', 'r', 'why'],
  turretFire: ['id', 'zone', 'x', 'z', 'a'], heal: ['id', 'x', 'z', 'amt'], death: ['id', 'by', 'assists', 'x', 'z'], respawn: ['id', 'x', 'z'],
  propHit: ['id', 'x', 'z'], propBreak: ['id', 'kind', 'x', 'z'], ram: ['id', 'x', 'z'], item: ['id'], nova: ['id', 'x', 'z', 'r'], shieldBreak: ['id', 'x', 'z'],
  beam: ['id', 'x0', 'z0', 'x1', 'z1', 'w'], crateDrop: ['id', 'x', 'z', 'type'], crateLand: ['id', 'x', 'z'], pickup: ['id', 'crate', 'type', 'x', 'z'],
  ventWarn: ['id', 'x', 'z', 'r'], towerHit: ['tower', 'by', 'x', 'z', 'amt'], towerFire: ['tower', 'x', 'z', 'a'], capture: ['point', 'team', 'x', 'z'],
};
const EVENT_TYPES = Object.keys(EVENT_KEYS);

export function packEvents(events) {
  return events.map((e) => {
    const o = {};
    for (const k in e) {
      const v = e[k];
      if (v !== undefined) o[k] = typeof v === 'number' && !Number.isInteger(v) ? rd(v) : v;
    }
    const keys = EVENT_KEYS[o.t];
    if (!keys || Object.keys(o).length !== keys.length + 1 || !keys.every((k) => k in o)) return o;
    return [EVENT_TYPES.indexOf(o.t), ...keys.map((k) => o[k])];
  });
}

export function unpackEvents(list) {
  return list.map((e) => {
    if (!Array.isArray(e)) return e;
    const t = EVENT_TYPES[e[0]], o = { t };
    EVENT_KEYS[t].forEach((k, i) => { o[k] = e[i + 1]; });
    return o;
  });
}

// ---- bytes -------------------------------------------------------------------------------------------------------
// Numbers keep the precision snapshot() rounds to: positions and timers in hundredths (i16 or a variable-length int),
// angles as u16 over a full turn. A value that is usually zero is announced by a bit in the row's mask and otherwise
// not sent, which is where most of the size goes away: a unit row is about 20 bytes instead of 110 as JSON.
const text = new TextEncoder(), untext = new TextDecoder();
const TAU = Math.PI * 2;
const a16 = (a) => Math.round((Math.atan2(Math.sin(a), Math.cos(a)) + Math.PI) / TAU * 65535);
const unA16 = (q) => q / 65535 * TAU - Math.PI;
const centi = (v) => Math.round(v * 100);

class Writer {
  constructor() { this.b = new Uint8Array(1024); this.n = 0; }
  room(k) { if (this.n + k > this.b.length) { const b = new Uint8Array(Math.max(this.b.length * 2, this.n + k)); b.set(this.b); this.b = b; } }
  u8(v) { this.room(1); this.b[this.n++] = v & 255; }
  u16(v) { this.room(2); this.b[this.n++] = v & 255; this.b[this.n++] = (v >> 8) & 255; }
  i16(v) { this.u16(Math.max(-32768, Math.min(32767, Math.round(v))) & 0xffff); }
  // Variable-length unsigned int, 7 bits per byte; divides instead of shifting so values past 2^31 survive (a dead boss's respawn timer).
  u(v) { v = Math.max(0, Math.round(v)); this.room(10); while (v >= 128) { this.b[this.n++] = (v % 128) | 128; v = Math.floor(v / 128); } this.b[this.n++] = v; }
  i(v) { v = Math.round(v); this.u(v < 0 ? -2 * v - 1 : 2 * v); }
  str(v) { const e = text.encode(v); this.u(e.length); this.raw(e); }
  raw(e) { this.room(e.length); this.b.set(e, this.n); this.n += e.length; }
  done() { return this.b.slice(0, this.n); }
}

class Reader {
  constructor(b, at = 0) { this.b = b; this.n = at; }
  u8() { return this.b[this.n++]; }
  u16() { const v = this.b[this.n] | (this.b[this.n + 1] << 8); this.n += 2; return v; }
  i16() { const v = this.u16(); return v > 32767 ? v - 65536 : v; }
  u() { let v = 0, k = 1, c; do { c = this.b[this.n++]; v += (c & 127) * k; k *= 128; } while (c & 128); return v; }
  i() { const v = this.u(); return v % 2 ? -(v + 1) / 2 : v / 2; }
  str() { const n = this.u(), v = untext.decode(this.b.subarray(this.n, this.n + n)); this.n += n; return v; }
  rest() { return this.b.subarray(this.n); }
}

// Unit row layout (see unitRow): 0 x, 1 z, 2 aim, 3 heading, 4 hp, 5 maxHp, 6 flags, 7 respawnT, 8-12 cooldowns,
// 13-24 status, 25 bush, 26 cast, 27 slowF, 28 hasteF, 29-33 kills deaths assists dmg healed.
// Mask bits 0-17 are the 18 timers, cooldowns first so a mech that is only cooling its gun needs one mask byte.
const TIMER_AT = [8, 9, 10, 11, 12, 7, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
const M_BUSH = 1 << 18, M_CAST = 1 << 19, M_SLOW = 1 << 20, M_HASTE = 1 << 21;
const S_OVER = 1, S_STATS = 2, S_PROPS = 4, S_XK = 8, S_LIVES = 16;

// snap: what snapshot(m) returns. stats: include maxHp and the scoreboard numbers. props: include the broken-prop mask.
// Both are slow facts; the host sends them a few times a second, and the mirror keeps what it had in between.
export function encodeSnap(snap, { stats = true, props = true } = {}) {
  const w = new Writer();
  w.u8((snap.o ? S_OVER : 0) | (stats ? S_STATS : 0) | (props ? S_PROPS : 0) | (snap.xk ? S_XK : 0) | (snap.l !== undefined ? S_LIVES : 0));
  w.u(snap.k); w.i(snap.w);
  if (snap.l !== undefined) w.i(snap.l);
  w.u8(snap.sc.length); for (const v of snap.sc) w.i(v);
  w.u8(snap.pt.length); for (const p of snap.pt) { w.i(p[0]); w.i(p[1] * 1000); }
  w.u8(snap.vt.length); for (const v of snap.vt) { w.i(centi(v[0])); w.u8(v[1]); }
  w.u8(snap.tw.length); for (const t of snap.tw) { w.u(t[0]); w.u8(t[1]); w.i(centi(t[2])); w.u16(a16(t[3])); w.i(t[4]); }
  w.u8(snap.u.length);
  for (const r of snap.u) {
    w.i16(centi(r[0])); w.i16(centi(r[1])); w.u16(a16(r[2])); w.u16(a16(r[3])); w.u(r[4]); w.u8(r[6]);
    let mask = 0;
    TIMER_AT.forEach((at, bit) => { if (r[at]) mask |= 1 << bit; });
    if (r[25] !== -1) mask |= M_BUSH;
    if (r[26]) mask |= M_CAST;
    if (r[27]) mask |= M_SLOW;
    if (r[28] !== 1) mask |= M_HASTE;
    w.u(mask);
    TIMER_AT.forEach((at, bit) => { if (mask & (1 << bit)) w.u(centi(r[at])); });
    if (mask & M_BUSH) w.u(r[25]);
    if (mask & M_CAST) { const c = r[26]; w.u8(c[0]); w.i(centi(c[1])); w.i(centi(c[2])); w.u16(a16(c[3])); }
    if (mask & M_SLOW) w.u(centi(r[27]));
    if (mask & M_HASTE) w.u(centi(r[28]));
    if (stats) { w.u(r[5]); for (let i = 29; i < 34; i++) w.u(r[i]); }
  }
  w.u(snap.s.length);
  let last = 0;
  for (const r of snap.s) { w.i(r[0] - last); last = r[0]; w.i(r[1]); w.u8(r[2]); w.i16(centi(r[3])); w.i16(centi(r[4])); w.u16(a16(r[5])); }
  w.u(snap.z.length);
  for (const r of snap.z) {
    w.u(r[0]); w.u8(r[1]); w.i(r[2]); w.i16(centi(r[3])); w.i16(centi(r[4])); w.i(centi(r[5])); w.i(centi(r[6])); w.i(centi(r[7]));
    ZONE_EXTRA[ZONE_KINDS[r[1]]].forEach(([, type], i) => {
      const v = r[8 + i];
      if (type === 'b') w.u8(v);
      else if (type === 's') w.str(v);
      else if (type === 'p') { w.u(v.length); for (const q of v) { w.i16(centi(q[0])); w.i16(centi(q[1])); } }
      else if (type === 'i') w.u(v);
      else if (type === 'a') w.u16(a16(v));
      else w.i(centi(v));
    });
  }
  w.u8(snap.c.length);
  for (const r of snap.c) { w.u(r[0]); w.i16(centi(r[1])); w.i16(centi(r[2])); w.u8(r[3]); w.i(centi(r[4])); w.i(centi(r[5])); }
  if (props) { w.u8(snap.p.length); for (const v of snap.p) w.u16(v); }
  if (snap.xk) w.str(JSON.stringify(snap.xk));
  return w.done();
}

export function decodeSnap(bytes, at = 0) {
  const r = new Reader(bytes, at), flags = r.u8(), snap = { o: flags & S_OVER ? 1 : 0 };
  const list = (n, fn) => { const out = []; for (let i = 0; i < n; i++) out.push(fn()); return out; };
  snap.k = r.u(); snap.w = r.i();
  if (flags & S_LIVES) snap.l = r.i();
  snap.sc = list(r.u8(), () => r.i());
  snap.pt = list(r.u8(), () => [r.i(), r.i() / 1000]);
  snap.vt = list(r.u8(), () => [r.i() / 100, r.u8()]);
  snap.tw = list(r.u8(), () => [r.u(), r.u8(), r.i() / 100, unA16(r.u16()), r.i()]);
  snap.u = list(r.u8(), () => {
    const row = new Array(34).fill(0);
    row[0] = r.i16() / 100; row[1] = r.i16() / 100; row[2] = unA16(r.u16()); row[3] = unA16(r.u16()); row[4] = r.u(); row[6] = r.u8();
    const mask = r.u();
    TIMER_AT.forEach((k, bit) => { if (mask & (1 << bit)) row[k] = r.u() / 100; });
    row[25] = mask & M_BUSH ? r.u() : -1;
    if (mask & M_CAST) row[26] = [r.u8(), r.i() / 100, r.i() / 100, unA16(r.u16())];
    if (mask & M_SLOW) row[27] = r.u() / 100;
    row[28] = mask & M_HASTE ? r.u() / 100 : 1;
    if (flags & S_STATS) { row[5] = r.u(); for (let i = 29; i < 34; i++) row[i] = r.u(); } else { row[5] = undefined; row.length = 29; }
    return row;
  });
  let last = 0;
  snap.s = list(r.u(), () => { last += r.i(); return [last, r.i(), r.u8(), r.i16() / 100, r.i16() / 100, unA16(r.u16())]; });
  snap.z = list(r.u(), () => {
    const row = [r.u(), r.u8(), r.i(), r.i16() / 100, r.i16() / 100, r.i() / 100, r.i() / 100, r.i() / 100];
    for (const [, type] of ZONE_EXTRA[ZONE_KINDS[row[1]]]) {
      if (type === 'b') row.push(r.u8());
      else if (type === 's') row.push(r.str());
      else if (type === 'p') row.push(list(r.u(), () => [r.i16() / 100, r.i16() / 100]));
      else if (type === 'i') row.push(r.u());
      else if (type === 'a') row.push(unA16(r.u16()));
      else row.push(r.i() / 100);
    }
    return row;
  });
  snap.c = list(r.u8(), () => [r.u(), r.i16() / 100, r.i16() / 100, r.u8(), r.i() / 100, r.i() / 100]);
  if (flags & S_PROPS) snap.p = list(r.u8(), () => r.u16());
  if (flags & S_XK) snap.xk = JSON.parse(r.str());
  return snap;
}

// ---- packets ------------------------------------------------------------------------------------------------------
// The first byte tells a binary packet from the JSON control messages, which all start with '{'.
export const PKT_SNAP = 1, PKT_INPUT = 2;

// q: snapshot number. applied: the last input number of this guest the host has run (the guest replays the later ones).
// base: the oldest event batch the host still holds. batches: [{ seq, json }] for this guest. body: encodeSnap bytes.
export function encodeSnapPacket(q, applied, base, batches, body) {
  const w = new Writer();
  w.u8(PKT_SNAP); w.u(q); w.u(applied); w.u(base); w.u8(batches.length);
  for (const b of batches) { w.u(b.seq); w.str(b.json); }
  w.raw(body);
  return w.done();
}

export function decodeSnapPacket(bytes) {
  const r = new Reader(bytes, 1), p = { q: r.u(), applied: r.u(), base: r.u(), batches: [] };
  for (let n = r.u8(); n > 0; n--) { const seq = r.u(); p.batches.push([seq, unpackEvents(JSON.parse(r.str()))]); }
  p.snap = decodeSnap(r.rest());
  return p;
}

const IN_FLAGS = ['fire', 's1', 's2', 'ult', 'heal'];
// What an input becomes on the wire. The guest predicts with this rounded copy, so it and the host walk from the same numbers.
export function wireInput(i) {
  const o = { mx: Math.round(Math.max(-1, Math.min(1, i.mx || 0)) * 100) / 100, mz: Math.round(Math.max(-1, Math.min(1, i.mz || 0)) * 100) / 100,
    aim: unA16(a16(i.aim || 0)), tx: Math.round(Math.max(-320, Math.min(320, i.tx || 0)) * 10) / 10, tz: Math.round(Math.max(-320, Math.min(320, i.tz || 0)) * 10) / 10 };
  for (const k of IN_FLAGS) o[k] = !!i[k];
  return o;
}

// q: number of the newest input. snapQ: newest snapshot received. evAck: every event batch up to this one has arrived.
// inputs: newest first, numbered q, q - 1, ...; the older ones repeat what earlier packets carried, in case those were lost.
export function encodeInputPacket(q, snapQ, evAck, inputs) {
  const w = new Writer();
  w.u8(PKT_INPUT); w.u(q); w.u(snapQ); w.u(evAck); w.u8(inputs.length);
  for (const i of inputs) {
    let f = 0;
    IN_FLAGS.forEach((k, bit) => { if (i[k]) f |= 1 << bit; });
    w.u8(f); w.u8(Math.round(i.mx * 100) + 100); w.u8(Math.round(i.mz * 100) + 100); w.u16(a16(i.aim)); w.i16(i.tx * 10); w.i16(i.tz * 10);
  }
  return w.done();
}

export function decodeInputPacket(bytes) {
  const r = new Reader(bytes, 1), p = { q: r.u(), snapQ: r.u(), evAck: r.u(), inputs: [] };
  for (let n = Math.min(8, r.u8()); n > 0; n--) {
    const f = r.u8(), i = { mx: (r.u8() - 100) / 100, mz: (r.u8() - 100) / 100, aim: unA16(r.u16()), tx: r.i16() / 10, tz: r.i16() / 10 };
    IN_FLAGS.forEach((k, bit) => { i[k] = !!(f & (1 << bit)); });
    p.inputs.push(i);
  }
  return p;
}
