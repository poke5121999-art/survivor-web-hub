// Match state on the wire. Pure: no DOM, no three.js, runs in Node.
//   host:   snapshot(m) every 2nd tick, packEvents(events) for every tick in between
//   guest:  createMirror(roster) once, applySnapshot(mirror, snap, dt) per snapshot
// The mirror has the same field names as a real match, so gfx, ui and audio read it unchanged.
// Static facts (map, mechs, weapon stats) never travel: both ends rebuild them from data.js and maps.js.

import { TICK, MECHS, BOSSES, PICKUPS } from './data.js';
import { createMatch } from './sim.js';

export const SNAP_TICKS = 2;

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
    return [s.id, s.owner, k, rd(s.x), rd(s.z), ang(Math.atan2(s.dz, s.dx))];
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
    map: m.map.key, mode: m.mode, seed: m.seed, target: m.target, duration: m.duration,
    units: m.units.map((u) => ({ team: m.mode === 'tudo' ? 0 : u.team, color: u.color, mech: u.mech, name: u.name, bot: u.bot, diff: u.diff,
      paint: u.paint, radius: u.radius, maxHp: u.maxHp, mods: { hp: u.maxHp / u.def.hp, dmg: u.dmgMod } })),
  };
}

// createMatch options for a roster. In free-for-all createMatch gives every unit its own team, so the roster's team
// only matters in team modes.
export function matchOptions(rosterData) {
  return {
    map: rosterData.map, mode: rosterData.mode, seed: rosterData.seed, target: rosterData.target, duration: rosterData.duration,
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

  snap.u.forEach((r, i) => {
    const u = m.units[i];
    if (!u) return;
    const wasAlive = u.alive;
    u.px = u.x; u.pz = u.z;
    u.x = r[0]; u.z = r[1]; u.aim = r[2]; u.heading = r[3]; u.hp = r[4]; u.maxHp = r[5];
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
    u.kills = r[at++]; u.deaths = r[at++]; u.assists = r[at++]; u.dmg = r[at++]; u.healed = r[at++];
    const jump = (u.x - u.px) ** 2 + (u.z - u.pz) ** 2;
    if (first || !wasAlive || jump > 36) { u.px = u.x; u.pz = u.z; }
  });

  const kinds = (k) => (k < SHOT_KINDS.length ? SHOT_KINDS[k] : (() => { const x = (snap.xk || [])[k - SHOT_KINDS.length] || ['bullet', 30, 0.2]; return { vis: x[0], speed: x[1], r: x[2] }; })());
  const seen = new Map();
  m.shots = snap.s.map((r) => {
    const kind = kinds(r[2]), owner = m.units[r[1]];
    let s = net.shots.get(r[0]);
    const dx = Math.cos(r[5]), dz = Math.sin(r[5]);
    if (s) { s.px = s.x; s.pz = s.z; } else {
      s = { id: r[0] };
      s.px = r[3] - dx * kind.speed * dts; s.pz = r[4] - dz * kind.speed * dts;
    }
    s.team = owner ? owner.team : 0; s.color = owner ? owner.color : 0; s.owner = r[1];
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
  m.props.forEach((p, i) => {
    p.alive = !((snap.p[i >> 4] >> (i & 15)) & 1);
    if (!p.alive) p.hp = 0;
  });
  return m;
}

// Events leave the host as plain rounded copies, one list per packet.
export function packEvents(events) {
  return events.map((e) => {
    const o = {};
    for (const k in e) {
      const v = e[k];
      o[k] = typeof v === 'number' && !Number.isInteger(v) ? rd(v) : v;
    }
    return o;
  });
}
