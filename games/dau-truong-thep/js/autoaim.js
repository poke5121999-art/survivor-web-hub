// Auto-aim for touch and gamepad. Pure: no DOM, no three.js, reads the match and the unit, writes nothing but the lock the caller owns.
// It only ever produces { aim, tx, tz }: the turret still turns at the mech's turn rate and the weapon's spread still applies in the sim.
import { visibleTo, weaponRange, towerOpen, turnRate } from './sim.js';
import { losClear } from './maps.js';
import { TICK } from './data.js';

export const LEAD = 0.7;                // share of the full lead a good human lands; below 1 so a target that changes direction is missed
export const ERR = 0.12;               // radians of slow wobble on the aim: a thumb is not a mouse, and it keeps touch from out-shooting a good mouse player
export const PRIORITIES = ['near', 'lowhp', 'lowpct'];
const RANK = { unit: 0, turret: 1, tower: 2 };   // a decoy ranks as a unit: the player cannot tell it apart, so neither may the aim

/* ---- targets ---- */
// One row per kind of thing that can be shot; each adds { kind, id, x, z, r, hp, maxHp, rank } for every enemy of it.
const SOURCES = [
  (m, u, add) => { for (const o of m.units) if (o.alive && o.team !== u.team && visibleTo(m, o, u.team)) add('unit', o, o.radius, RANK.unit); },
  (m, u, add) => { for (const z of m.zones) if (z.team !== u.team && z.hp > 0) { if (z.kind === 'decoy') add('zone', z, z.r, RANK.unit); else if (z.kind === 'turret') add('zone', z, z.r, RANK.turret); } },
  (m, u, add) => { for (const t of m.towers || []) if (t.team !== u.team && towerOpen(m, t)) add('tower', t, t.r, RANK.tower); },
];
const SCORE = {
  near: (c) => c.d,
  lowhp: (c) => c.hp + c.d * 0.001,
  lowpct: (c) => c.hp / Math.max(1, c.maxHp) + c.d * 0.0001,
};

// Everything shootable from u inside `range` with a clear line, closest rank first.
function candidates(m, u, range, los) {
  const out = [];
  const add = (kind, o, r, rank) => {
    const d = Math.hypot(o.x - u.x, o.z - u.z);
    if (d > range || (los && !losClear(m.map, u.x, u.z, o.x, o.z))) return;
    out.push({ kind, id: o.id, x: o.x, z: o.z, r, hp: o.hp, maxHp: o.maxHp, rank, d });
  };
  for (const src of SOURCES) src(m, u, add);
  return out;
}
const pub = (c) => ({ kind: c.kind, id: c.id, x: c.x, z: c.z, r: c.r });

// prev: the target kept so far ({ kind, id } or null). It stays while it is still a candidate of the best rank present (the stickiness),
// so two enemies at similar distance never flip. opts: { range, priority, los, acquire (false = only keep prev), any (keep prev whatever its rank) }.
export function pickTarget(m, u, prev, opts = {}) {
  if (!u.alive) return null;
  const list = candidates(m, u, opts.range ?? weaponRange(u), opts.los !== false);
  if (!list.length) return null;
  let best = 99;
  for (const c of list) if (c.rank < best) best = c.rank;
  if (prev) {
    const k = list.find((c) => c.id === prev.id && c.kind === prev.kind);
    if (k && (opts.any || k.rank === best)) return pub(k);
  }
  if (opts.acquire === false) return null;
  const score = SCORE[opts.priority] || SCORE.near;
  let pick = null, ps = Infinity;
  for (const c of list) { if (c.rank !== best) continue; const s = score(c); if (s < ps) { ps = s; pick = c; } }
  return pick && pub(pick);
}

// The enemy a finger landed on: nearest candidate to the ground point within its own radius plus `slack`, any rank.
export function pickAt(m, u, x, z, opts = {}) {
  let best = null, bd = Infinity;
  for (const c of candidates(m, u, opts.range ?? weaponRange(u), true)) {
    const d = Math.hypot(c.x - x, c.z - z) - c.r;
    if (d < (opts.slack ?? 1.6) && d < bd) { bd = d; best = c; }
  }
  return best && pub(best);
}

// Most hurt ally (lowest health share, not full) inside range of u, or null.
export function pickAlly(m, u, range) {
  let best = null, bs = 1;
  for (const o of m.units) {
    if (o === u || !o.alive || o.team !== u.team || o.hp >= o.maxHp || Math.hypot(o.x - u.x, o.z - u.z) > range) continue;
    const s = o.hp / o.maxHp;
    if (s < bs) { bs = s; best = o; }
  }
  return best && { kind: 'unit', id: best.id, x: best.x, z: best.z, r: best.radius };
}

/* ---- the lock: what the caller owns ---- */
export const newLock = () => ({ target: null, since: 0, pinned: false, mid: null });
export function clearLock(L) { L.target = null; L.pinned = false; }
// Keep the lock while valid, otherwise take the next valid target (or none). A new match drops the old lock.
export function updateLock(L, m, u, opts) {
  if (L.mid !== m) { L.mid = m; clearLock(L); }
  const t = pickTarget(m, u, L.target, { ...opts, any: L.pinned });
  if (!t) clearLock(L);
  else { if (!L.target || L.target.id !== t.id || L.target.kind !== t.kind) { L.since = m.time; L.pinned = false; } L.target = t; }
  return L.target;
}
// The player tapped this enemy: it replaces the lock and survives until it stops being valid.
export function pinLock(L, m, t) { L.mid = m; L.target = t; L.since = m.time; L.pinned = true; }

/* ---- velocity and lead ---- */
// Smoothed velocity per target from the positions seen on each tick, so it works on a guest's mirror match too (which has no real velocities).
export function createTracker() {
  const E = new Map();
  let at = -1;
  const key = (kind, id) => kind + id;
  const note = (kind, o, dt, now) => {
    const k = key(kind, o.id), e = E.get(k);
    if (!e) { E.set(k, { x: o.x, z: o.z, vx: 0, vz: 0, seen: now }); return; }
    const dx = o.x - e.x, dz = o.z - e.z;
    if (dt > 0 && dt <= 0.25) {
      if (dx * dx + dz * dz > 6) { e.vx = e.vz = 0; }
      else { const a = 1 - Math.exp(-dt / 0.1); e.vx += (dx / dt - e.vx) * a; e.vz += (dz / dt - e.vz) * a; }
    } else { e.vx = e.vz = 0; }
    e.x = o.x; e.z = o.z; e.seen = now;
  };
  return {
    see(m) {
      const dt = m.time - at;
      if (dt === 0) return;
      at = m.time;
      for (const o of m.units) if (o.alive) note('unit', o, dt, m.time);
      for (const z of m.zones) if (z.kind === 'decoy') note('zone', z, dt, m.time);
      for (const [k, e] of E) if (e.seen < m.time - 0.5) E.delete(k);
    },
    get(kind, id) { return E.get(key(kind, id)) || null; },
  };
}
function velOf(m, t, track) {
  const e = track && track.get(t.kind, t.id);
  if (e) return [e.vx, e.vz];
  if (t.kind === 'unit') { const o = m.units[t.id]; if (o) return [o.vx || 0, o.vz || 0]; }
  return [0, 0];
}
// Where a target moving at (vx, vz) will be when something that takes `time(distance)` seconds reaches it, scaled by `lead`.
function leadPoint(u, t, vx, vz, time, lead) {
  let px = t.x, pz = t.z;
  if (!time) return [px, pz];
  for (let i = 0; i < 2; i++) {
    const s = time(Math.hypot(px - u.x, pz - u.z));
    px = t.x + vx * s * lead; pz = t.z + vz * s * lead;
  }
  return [px, pz];
}
const toward = (u, p) => Math.atan2(p[1] - u.z, p[0] - u.x);
// Deterministic wobble (two slow sines, no rng so the sim's stream is untouched), different per target.
const wobble = (m, id, err) => err * (Math.sin(m.time * 5.3 + id * 1.7) + Math.sin(m.time * 11.9 + id * 4.1)) / 2;
const swing = (m, u, p, id, err) => { const d = Math.hypot(p[0] - u.x, p[1] - u.z), a = toward(u, p) + wobble(m, id, err); return [u.x + Math.cos(a) * d, u.z + Math.sin(a) * d]; };

// How the main weapon meets a target: a shot flies, a lob lands after its flight, a ray and a charge beam are instant.
export function aimFor(m, u, target, opts = {}) {
  const w = u.def.weapon, lead = opts.lead ?? LEAD;
  const [vx, vz] = velOf(m, target, opts.track);
  const time = w.ray || w.charge ? null : w.lob ? () => w.flight : w.speed > 0 ? (d) => d / w.speed : null;
  const p = swing(m, u, leadPoint(u, target, vx, vz, time, lead), target.id, opts.err ?? ERR);
  return { aim: toward(u, p), tx: p[0], tz: p[1] };
}

const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
// Should the trigger be down now? Not while the turret is still swinging toward the target: the sim fires along the turret.
// A lob goes to the ground point whatever the turret faces; a charge weapon keeps charging, so it is never gated.
export function fireOk(u, want, target) {
  const w = u.def.weapon;
  if (w.lob || w.charge) return true;
  const d = Math.max(1, Math.hypot(target.x - u.x, target.z - u.z));
  const slack = turnRate(u) * TICK;
  return Math.abs(angDiff(u.aim, want)) - slack <= 0.1 + Math.atan2(target.r, d);
}

/* ---- skills ---- */
// One row per skill primitive, like SHAPES in touch.js. mode: 'dir' = toward the target, 'ground' = at the target clamped to cast range,
// 'ally' = on the most hurt ally in range, 'self' = no target needed (the aim only turns toward one). reach: how far a target may stand.
// speed: shot speed for lead; wait: seconds before an area lands.
const dir = (reach, speed) => ({ mode: 'dir', reach, speed });
const ground = (s, wait = 0) => ({ mode: 'ground', reach: s.cast + (s.radius || s.blast || 0) * 0.6, wait });
const pickOne = (s) => ({ mode: 'ground', reach: s.cast, wait: 0 });
const SELF = { mode: 'self', reach: Infinity };
export const SKILL_MODES = {
  dash: (s) => dir(s.dist), blink: (s) => dir(s.dist), warp: (s) => dir(14),
  beam: (s) => dir(s.range), sweep: (s) => dir(s.range), hook: (s) => dir(s.range, s.speed), volley: (s) => dir(s.range, s.speed),
  wall: (s) => dir(14),
  barrage: (s) => ground(s, s.delay), zone: (s) => (s.at === 'self' ? SELF : s.vis === 'heal' ? { mode: 'ally', reach: s.cast || 12 } : ground(s)),
  mine: (s) => ground(s), minefield: (s) => ground(s), turret: (s) => ground(s), wire: (s) => ground(s), leap: (s) => ground(s, s.flight),
  swap: pickOne, mark: pickOne,
  bless: (s) => ({ mode: 'ally', reach: s.cast }),
};
export const skillSpec = (s) => (SKILL_MODES[s.do] ? SKILL_MODES[s.do](s) : SELF);
// How far an enemy may stand for the skill to be aimed at it (the main weapon's reach for a skill that needs no target).
export const skillReach = (u, s) => { const r = skillSpec(s).reach; return Number.isFinite(r) ? r : weaponRange(u); };

const clampTo = (u, x, z, reach) => { const d = Math.hypot(x - u.x, z - u.z); return d > reach ? [u.x + (x - u.x) * reach / d, u.z + (z - u.z) * reach / d] : [x, z]; };
const RESOLVE = {
  dir(m, u, sp, t, o) { if (!t) return null; const [vx, vz] = velOf(m, t, o.track); const p = leadPoint(u, t, vx, vz, sp.speed > 0 ? (d) => d / sp.speed : null, o.lead ?? LEAD); return { aim: toward(u, p), tx: p[0], tz: p[1] }; },
  ground(m, u, sp, t, o) {
    if (!t) return null;
    const [vx, vz] = velOf(m, t, o.track);
    const p = clampTo(u, ...leadPoint(u, t, vx, vz, sp.wait ? () => sp.wait : null, o.lead ?? LEAD), sp.reach);
    return { aim: toward(u, p), tx: p[0], tz: p[1] };
  },
  ally(m, u, sp) { const a = pickAlly(m, u, sp.reach) || u; const p = [a.x, a.z]; return { aim: a === u ? u.aim : toward(u, p), tx: p[0], tz: p[1] }; },
  self(m, u, sp, t) { return t ? { aim: toward(u, [t.x, t.z]), tx: u.x, tz: u.z } : null; },
};
// The { aim, tx, tz } a quick-cast of skill s should use against `target` (an enemy picked inside skillReach, or null), or null to fall back.
export function skillAim(m, u, s, target, opts = {}) {
  const sp = skillSpec(s);
  return RESOLVE[sp.mode](m, u, sp, target, opts);
}
