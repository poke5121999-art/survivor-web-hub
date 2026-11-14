// Bot AI. One call per bot per tick, pure: reads the match, keeps its memory in u.brain, draws randomness only from m.rng.
// States: push (go toward the enemy / the lane objective), fight (hold a preferred range and shoot),
// retreat (heal at base or a heal crate), grab (drive onto an airdrop crate).

import { TICK, RULES, DIFFICULTY } from './data.js';
import { visibleTo } from './sim.js';
import { findPath, losClear, solidAt, castStatic, segCircle } from './maps.js';

// pref: [near, far] fraction of weapon range the bot likes to hold. kite: back away from closers.
// peek: duck behind cover while the weapon recharges. eager: multiplier on the skill roll for slots s1, s2, ult.
const ROLE = {
  tank:    { pref: [0.3, 0.6],  kite: false, peek: false, strafe: 0.45, follow: false, eager: [1, 1, 1] },
  assault: { pref: [0.4, 0.75], kite: false, peek: false, strafe: 1,    follow: false, eager: [1, 1, 1] },
  sniper:  { pref: [0.7, 0.95], kite: true,  peek: true,  strafe: 0.6,  follow: false, eager: [1, 1, 0.9] },
  support: { pref: [0.55, 0.85], kite: true, peek: false, strafe: 0.8,  follow: true,  eager: [1, 1, 1] },
};
const LANES = [0, -14, 14, 0, 14];
const SLOTS = ['s1', 's2', 'ult'];
const STEER = [0, 0.5, -0.5, 1.0, -1.0, 1.7, -1.7];
const NO = { mx: 0, mz: 0, aim: 0, fire: false, s1: false, s2: false, ult: false, heal: false, tx: 0, tz: 0 };

const hyp = Math.hypot;
const d2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const turnTo = (a, b, max) => a + Math.max(-max, Math.min(max, angDiff(a, b)));

function newBrain(m, u) {
  const lane = u.slot === 4 ? (m.rng() < 0.5 ? -14 : 14) : LANES[u.slot % 5];
  return {
    state: 'push', since: 0, lane, patrol: 0, goal: null,
    path: null, pi: 0, pathT: -9, pgx: 0, pgz: 0, forceRepath: false,
    seen: {}, tgt: -1, engageAt: 0, aim: u.aim, err: 0, errTo: 0, errNext: 0,
    strafe: 1, strafeNext: 0, dutyOn: true, dutyNext: 0,
    sx: u.x, sz: u.z, sT: 0, stuck: 0, cmd: 0, sideUntil: 0, sideX: 0, sideZ: 0, propId: -1, propUntil: 0,
    coverX: 0, coverZ: 0, coverT: -9, hasCover: false, ss: 1, dodge: {}, retreatGoal: null, crate: -1,
    out: { mx: 0, mz: 0, aim: 0, fire: false, s1: false, s2: false, ult: false, heal: false, tx: 0, tz: 0 },
    enemies: [], sk: { x: 0, z: 0, aim: null, mx: null, mz: null },
  };
}

export function allInputs(m, human) {
  const inputs = [];
  for (const u of m.units) {
    if (u.bot) inputs[u.id] = botInput(m, u);
    else if (human && human[u.id]) inputs[u.id] = human[u.id];
  }
  return inputs;
}

export function botInput(m, u) {
  if (!u.alive) { u.brain = null; return NO; }
  const b = u.brain || (u.brain = newBrain(m, u));
  const D = DIFFICULTY[u.diff] || DIFFICULTY.normal;
  const role = ROLE[u.def.roleKey] || ROLE.assault;
  const map = m.map, now = m.time, w = u.def.weapon;
  const out = b.out;
  out.fire = out.s1 = out.s2 = out.ult = out.heal = false;

  const hpFrac = u.hp / u.maxHp;
  const foe = map.bases[1 - u.team], own = map.bases[u.team];
  const inOwnBase = d2(u.x, u.z, own[0], own[1]) < (RULES.baseRadius - 0.5) ** 2;

  perceive(m, u, b, D, now);
  const tgt = pickTarget(m, u, b, D, now, w);
  const enemies = b.enemies;
  let td = tgt ? hyp(tgt.x - u.x, tgt.z - u.z) : 1e9;

  let near = 0, allyNear = 0;
  for (const e of enemies) if (d2(e.x, e.z, u.x, u.z) < 196) near++;
  for (const a of m.units) if (a !== u && a.team === u.team && a.alive && d2(a.x, a.z, u.x, u.z) < 196) allyNear++;
  const outnumbered = near - allyNear >= 2;

  const crate = pickCrate(m, u, b, hpFrac, enemies);
  setState(m, u, b, D, now, hpFrac, outnumbered, crate, tgt, td, w, inOwnBase);

  let gx = null, gz = null, hold = false, aimX = null, aimZ = null;
  let mvx = 0, mvz = 0;
  const underFire = u.combatT < 1.2;
  const state = b.state;

  let los = false, aimPt = null, aimAng = u.aim;
  if (tgt) {
    aimPt = leadPoint(u, tgt, w.speed, D.lead);
    los = losClear(map, u.x, u.z, aimPt[0], aimPt[1], Math.min(0.2, w.r * 0.6));
    aimX = aimPt[0]; aimZ = aimPt[1];
  }

  if (state === 'fight') {
    const r = fightMove(m, u, b, D, role, tgt, td, w, los, now, hpFrac, underFire);
    mvx = r[0]; mvz = r[1]; gx = r[2]; gz = r[3]; hold = r[4];
  } else if (state === 'retreat') {
    const g = b.retreatGoal || own;
    if (inOwnBase) hold = true; else { gx = g[0]; gz = g[1]; }
  } else if (state === 'grab') {
    const c = m.crates.find((k) => k.id === b.crate);
    if (c) { gx = c.x; gz = c.z; }
  } else {
    const g = pushGoal(m, u, b, role, now, tgt);
    gx = g[0]; gz = g[1];
  }

  if (gx !== null) {
    const v = goTo(m, u, b, gx, gz, now);
    if (v) { mvx += v[0]; mvz += v[1]; }
  }
  if (hold && !tgt) { mvx = mvz = 0; }

  // incoming ground attacks: step out of red circles and off armed mines
  const avoid = dodgeZones(m, u, b, D);
  if (avoid) { mvx = avoid[0] * 1.5 + mvx * 0.3; mvz = avoid[1] * 1.5 + mvz * 0.3; }

  const unstuck = stuckLogic(m, u, b, now);
  if (unstuck) {
    if (unstuck.prop) { aimX = unstuck.prop.x; aimZ = unstuck.prop.z; mvx = mvz = 0; }
    else { mvx = unstuck.mx; mvz = unstuck.mz; }
  }

  let len = hyp(mvx, mvz);
  if (len > 1e-3) {
    if (len > 1) { mvx /= len; mvz /= len; len = 1; }
    const f = freeDir(m, u, b, mvx, mvz);
    mvx = f[0] * len; mvz = f[1] * len;
  } else mvx = mvz = 0;
  b.cmd = len;

  // aim
  let desired;
  if (aimX !== null) desired = Math.atan2(aimZ - u.z, aimX - u.x);
  else if (len > 0.1) desired = Math.atan2(mvz, mvx);
  else desired = b.aim;
  if (now >= b.errNext) { b.errNext = now + 0.3 + m.rng() * 0.4; b.errTo = (m.rng() * 2 - 1) * D.aimErr; }
  b.err += (b.errTo - b.err) * Math.min(1, 7 * TICK);
  const turnRate = 4.5 + 8 * D.skill;
  const noisy = desired + (aimX !== null ? b.err : 0);
  b.aim = u.cast && u.cast.lock ? u.cast.aim : turnTo(b.aim, noisy, turnRate * TICK);
  aimAng = b.aim;

  // skills (may snap the aim for a flick)
  const ctx = { m, u, b, D, role, tgt, td, los, enemies, hpFrac, underFire, state, w, aimPt };
  const sk = chooseSkill(ctx);
  if (sk) {
    out[SLOTS[sk.slot]] = true;
    if (b.sk.aim !== null) aimAng = b.aim = b.sk.aim;
    if (b.sk.mx !== null) { mvx = b.sk.mx; mvz = b.sk.mz; }
    aimX = b.sk.x; aimZ = b.sk.z;
  }

  // heal item
  if (u.cd.heal <= 0 && hpFrac < 0.6 && (underFire || state === 'retreat' || hpFrac < 0.4)) out.heal = true;

  // fire
  let fire = false;
  if (tgt && los) {
    const aimErrNow = Math.abs(angDiff(aimAng, desired));
    const reach = hyp(aimPt[0] - u.x, aimPt[1] - u.z) - tgt.radius * 0.5 <= w.range;
    const ready = now >= b.engageAt;
    const size = Math.atan2(tgt.radius, Math.max(1, td)) + 0.1;
    if (reach && ready && aimErrNow < size + 0.06 && !domeBlocks(m, u, aimPt) && duty(m, b, D, now)) fire = true;
  }
  if (unstuck && unstuck.prop) {
    const p = unstuck.prop, a = Math.atan2(p.z - u.z, p.x - u.x);
    if (Math.abs(angDiff(aimAng, a)) < 0.2 && w.range >= hyp(p.x - u.x, p.z - u.z)) fire = true;
  }
  out.fire = fire && !(u.cast && u.cast.skill);

  out.mx = mvx; out.mz = mvz; out.aim = aimAng;
  if (aimX !== null) { out.tx = aimX; out.tz = aimZ; } else { out.tx = u.x + Math.cos(aimAng) * 8; out.tz = u.z + Math.sin(aimAng) * 8; }
  return out;
}

function perceive(m, u, b, D, now) {
  const list = b.enemies; list.length = 0;
  for (const e of m.units) {
    if (e.team === u.team || !e.alive) continue;
    if (!visibleTo(m, e, u.team)) continue;
    const prev = b.seen[e.id];
    const fresh = !prev || now - prev.t > 1.0;
    if (prev) { prev.x = e.x; prev.z = e.z; prev.t = now; } else b.seen[e.id] = { x: e.x, z: e.z, t: now };
    if (fresh && (b.tgt < 0 || !m.units[b.tgt].alive)) b.engageAt = Math.max(b.engageAt, now + D.react * (0.6 + 0.8 * m.rng()));
    list.push(e);
  }
  for (const id in b.seen) if (now - b.seen[id].t > 6) delete b.seen[id];
}

function pickTarget(m, u, b, D, now, w) {
  let best = null, bs = -1e9;
  for (const e of b.enemies) {
    if (e.invulnT > 0.3) continue;
    const d = hyp(e.x - u.x, e.z - u.z);
    if (d > 36) continue;
    let s = -d - 14 * (e.hp / e.maxHp) * (0.5 + 0.5 * D.skill);
    if (b.tgt === e.id) s += 4;
    let team = 0;
    for (const k in e.hitBy) { const a = m.units[k]; if (a.team === u.team && a !== u && now - e.hitBy[k] < 2.5) team++; }
    for (const a of m.units) if (a !== u && a.team === u.team && a.alive && a.brain && a.brain.tgt === e.id) team++;
    s += D.focus * 5 * Math.min(2, team);
    if (e.hp < e.maxHp * 0.4) s += D.focus * 6;
    if (s > bs) { bs = s; best = e; }
  }
  const id = best ? best.id : -1;
  if (id !== b.tgt) { b.tgt = id; }
  return best;
}

function pickCrate(m, u, b, hpFrac, enemies) {
  let best = null, bd = 1e9;
  const foe = m.map.bases[1 - u.team], br = RULES.baseRadius + 1;
  for (const c of m.crates) {
    if (c.fall > 0) continue;
    if (d2(c.x, c.z, foe[0], foe[1]) < br * br) continue;
    const dm = hyp(c.x - u.x, c.z - u.z);
    let ok = false;
    const healNeed = c.type === 'heal' && hpFrac < 0.6;
    if (healNeed && dm < 40) ok = true;
    else if (dm < 40) {
      ok = true;
      for (const e of enemies) if (hyp(e.x - c.x, e.z - c.z) <= dm) { ok = false; break; }
    }
    if (!ok) continue;
    // only the closest teammate goes, unless I need the heal
    if (!healNeed) for (const a of m.units) {
      if (a === u || a.team !== u.team || !a.alive) continue;
      if (hyp(a.x - c.x, a.z - c.z) < dm - 0.5) { ok = false; break; }
    }
    if (ok && dm < bd) { bd = dm; best = c; }
  }
  return best;
}

function setState(m, u, b, D, now, hpFrac, outnumbered, crate, tgt, td, w, inOwnBase) {
  let next = b.state;
  const thr = D.retreat + (outnumbered ? 0.08 : 0);
  if (b.state === 'retreat') {
    if (hpFrac >= 0.7) next = 'push';
    else if (u.cd.heal > 0 && hpFrac > 0.6 && !inOwnBase) next = b.state;
  } else if (hpFrac < thr) {
    next = 'retreat';
    b.retreatGoal = null;
  } else if (crate && (!tgt || td > 9 || hyp(crate.x - u.x, crate.z - u.z) < 6)) next = 'grab';
  else if (tgt && (td <= w.range * 1.25 || (b.state === 'fight' && td <= w.range * 1.6))) next = 'fight';
  else next = 'push';
  if (next === 'grab') b.crate = crate.id;
  if (next === 'retreat') {
    const own = m.map.bases[u.team];
    b.retreatGoal = own;
    for (const c of m.crates) {
      if (c.fall > 0 || c.type !== 'heal') continue;
      const dc = hyp(c.x - u.x, c.z - u.z);
      if (dc < 0.8 * hyp(own[0] - u.x, own[1] - u.z) && dc < 25) { b.retreatGoal = [c.x, c.z]; break; }
    }
  }
  if (next !== b.state) { b.state = next; b.since = now; b.path = null; }
}

function pushGoal(m, u, b, role, now, tgt) {
  const dir = u.team === 0 ? 1 : -1;
  if (tgt) return [tgt.x, tgt.z];
  // hunt: freshest sighting by me or a teammate
  let hx = 0, hz = 0, hd = 1e9, found = false;
  for (const a of m.units) {
    if (a.team !== u.team || !a.alive || !a.brain) continue;
    for (const id in a.brain.seen) {
      const s = a.brain.seen[id];
      if (m.time - s.t > 4) continue;
      const e = m.units[id];
      if (!e.alive) continue;
      const dd = hyp(s.x - u.x, s.z - u.z);
      if (dd < hd) { hd = dd; hx = s.x; hz = s.z; found = true; }
    }
  }
  if (found && hd > 4) return safeGoal(m, u, hx, hz);
  if (found) { b.goal = null; }
  if (role.follow) {
    let ally = null, ad = 1e9;
    for (const a of m.units) {
      if (a === u || a.team !== u.team || !a.alive || a.def.roleKey === 'support') continue;
      const dd = hyp(a.x - u.x, a.z - u.z) - (1 - a.hp / a.maxHp) * 8;
      if (dd < ad) { ad = dd; ally = a; }
    }
    if (ally) return hyp(ally.x - u.x, ally.z - u.z) < 5 ? [u.x, u.z] : safeGoal(m, u, ally.x - dir * 2, ally.z);
  }
  if (!b.goal || hyp(b.goal[0] - u.x, b.goal[1] - u.z) < 2.2) {
    if (b.goal) b.patrol++;
    if (b.patrol === 0) b.goal = [dir * 4, b.lane];
    else if (b.patrol === 1) b.goal = [dir * 19, b.lane * 0.7];
    else b.goal = [dir * m.rng.range(-8, 22), m.rng.pick([-15, 0, 15]) + m.rng.range(-3, 3)];
    b.goal = safeGoal(m, u, b.goal[0], b.goal[1]);
  }
  return b.goal;
}

// nearest open point to (x,z) that is not inside walls and not inside the enemy base
function safeGoal(m, u, x, z) {
  const map = m.map, foe = map.bases[1 - u.team], R = RULES.baseRadius + 2.5;
  const dx = x - foe[0], dz = z - foe[1], dd = hyp(dx, dz);
  if (dd < R) { const k = R / (dd || 1); x = foe[0] + (dd ? dx * k : R); z = foe[1] + (dd ? dz * k : 0); }
  if (!solidAt(map, x, z, 1.3)) return [x, z];
  for (let r = 1; r < 8; r++) for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    if (!solidAt(map, px, pz, 1.3) && d2(px, pz, foe[0], foe[1]) > R * R) return [px, pz];
  }
  return [x, z];
}

function leadPoint(u, e, speed, lead) {
  let px = e.x, pz = e.z;
  const vx = e.vx || 0, vz = e.vz || 0;
  for (let i = 0; i < 2; i++) {
    const t = hyp(px - u.x, pz - u.z) / speed;
    px = e.x + vx * t * lead; pz = e.z + vz * t * lead;
  }
  return [px, pz];
}

function duty(m, b, D, now) {
  if (D.fireDuty >= 1) return true;
  if (now >= b.dutyNext) {
    if (b.dutyOn) { b.dutyOn = false; b.dutyNext = now + (0.8 + m.rng()) * (1 - D.fireDuty) / D.fireDuty; }
    else { b.dutyOn = true; b.dutyNext = now + 0.8 + m.rng(); }
  }
  return b.dutyOn;
}

function domeBlocks(m, u, p) {
  for (const z of m.zones) {
    if (z.kind !== 'dome' || z.team === u.team) continue;
    if (d2(u.x, u.z, z.x, z.z) < z.r * z.r) continue;
    if (segCircle(u.x, u.z, p[0] - u.x, p[1] - u.z, z.x, z.z, z.r) <= 1) return true;
  }
  return false;
}

function fightMove(m, u, b, D, role, tgt, td, w, los, now, hpFrac, underFire) {
  const lo = w.range * role.pref[0], hi = w.range * role.pref[1];
  const ux = (tgt.x - u.x) / (td || 1), uz = (tgt.z - u.z) / (td || 1);
  if (now >= b.strafeNext) { b.strafe = m.rng() < 0.5 ? -1 : 1; b.strafeNext = now + 0.7 + m.rng() * 0.9 / (0.4 + D.dodge); }

  // cover: low health, or a slow weapon that is recharging while the enemy can see us
  const wantCover = los && (hpFrac < 0.5 || (role.peek && u.cd.fire > 0.55 && td < w.range * 1.1));
  if (wantCover) {
    if (now - b.coverT > 0.4) { b.coverT = now; b.hasCover = findCover(m, u, tgt.x, tgt.z); if (b.hasCover) { b.coverX = b.hasCover[0]; b.coverZ = b.hasCover[1]; } }
    if (b.hasCover) {
      if (hyp(b.coverX - u.x, b.coverZ - u.z) < 0.7) return [0, 0, null, null, true];
      return [0, 0, b.coverX, b.coverZ, false];
    }
  } else b.hasCover = false;

  if (!los) return [0, 0, tgt.x, tgt.z, false];

  let radial = 0;
  if (td < lo) radial = role.kite ? -1 : -0.6;
  else if (td > hi) radial = 1;
  if (role.kite && td < lo * 0.7) radial = -1.3;
  const amp = role.strafe * (0.35 + 0.65 * D.dodge) + (underFire ? 0.2 : 0);
  const sx = -uz * b.strafe * amp, sz = ux * b.strafe * amp;
  return [ux * radial + sx, uz * radial + sz, null, null, false];
}

function findCover(m, u, tx, tz) {
  const map = m.map, foe = map.bases[1 - u.team];
  let best = null, bd = 1e9;
  for (let k = 0; k < 12; k++) {
    const a = k * Math.PI / 6;
    for (let r = 3; r <= 6; r += 3) {
      const px = u.x + Math.cos(a) * r, pz = u.z + Math.sin(a) * r;
      if (solidAt(map, px, pz, u.radius + 0.3)) continue;
      if (d2(px, pz, foe[0], foe[1]) < (RULES.baseRadius + 1.5) ** 2) continue;
      if (losClear(map, tx, tz, px, pz, 0.2)) continue;
      if (!losClear(map, u.x, u.z, px, pz, u.radius * 0.7)) continue;
      if (r < bd) { bd = r; best = [px, pz]; }
    }
  }
  return best;
}

// Path follower. Returns a direction vector or null when there is nothing to do.
function goTo(m, u, b, gx, gz, now) {
  const map = m.map;
  const dg = hyp(gx - u.x, gz - u.z);
  if (dg < 0.7) return null;
  if (dg < 7 && losClear(map, u.x, u.z, gx, gz, u.radius * 0.9 + 0.1)) { b.path = null; return [gx - u.x, gz - u.z]; }
  const moved = hyp(gx - b.pgx, gz - b.pgz);
  const since = now - b.pathT;
  if (!b.path || b.forceRepath || (since >= 0.5 && (moved > 2 || since > 2)) || (moved > 8 && since >= 0.2)) {
    b.path = findPath(map, u.x, u.z, gx, gz); b.pi = 0; b.pathT = now; b.pgx = gx; b.pgz = gz; b.forceRepath = false;
  }
  const p = b.path;
  while (b.pi < p.length - 1 && hyp(p[b.pi][0] - u.x, p[b.pi][1] - u.z) < 1.0) b.pi++;
  while (b.pi < p.length - 1 && losClear(map, u.x, u.z, p[b.pi + 1][0], p[b.pi + 1][1], u.radius + 0.1)) b.pi++;
  const wp = p[b.pi];
  if (b.pi >= p.length - 1 && hyp(wp[0] - u.x, wp[1] - u.z) < 0.8) return null;
  return [wp[0] - u.x, wp[1] - u.z];
}

function inFoe(m, u, x, z) {
  const foe = m.map.bases[1 - u.team], R = RULES.baseRadius + 0.6;
  const dn = d2(x, z, foe[0], foe[1]);
  return dn < R * R && dn <= d2(u.x, u.z, foe[0], foe[1]) + 1e-6;
}

// Keep the intended direction unless it runs into a wall or the enemy base within ~1.6 m; then rotate to the nearest free heading.
function freeDir(m, u, b, dx, dz) {
  const len = hyp(dx, dz);
  if (len < 1e-6) return [0, 0];
  const ux = dx / len, uz = dz / len, map = m.map, rr = u.radius * 0.8;
  for (let i = 0; i < STEER.length; i++) {
    const a = STEER[i] * b.ss, c = Math.cos(a), s = Math.sin(a);
    const vx = ux * c - uz * s, vz = ux * s + uz * c;
    const px = u.x + vx * 1.6, pz = u.z + vz * 1.6;
    if (solidAt(map, px, pz, rr) || inFoe(m, u, px, pz) || propAt(m, px, pz, rr)) continue;
    if (i > 0 && i < 3) b.ss = a >= 0 ? 1 : -1;
    return [vx, vz];
  }
  return [ux, uz];
}

function propAt(m, x, z, r) {
  for (const p of m.props) if (p.alive && d2(p.x, p.z, x, z) < (p.r + r) * (p.r + r)) return true;
  return false;
}

function dodgeZones(m, u, b, D) {
  if (D.dodge <= 0) return null;
  let ax = 0, az = 0, any = false;
  for (const z of m.zones) {
    if (z.team === u.team) continue;
    let rad = 0;
    if (z.kind === 'strike' && z.delay > 0.12) rad = z.r + 0.6;
    else if (z.kind === 'mine' && z.delay <= 0) rad = z.r + 0.8;
    else continue;
    const dd = hyp(u.x - z.x, u.z - z.z);
    if (dd > rad + u.radius) continue;
    let flag = b.dodge[z.id];
    if (flag === undefined) flag = b.dodge[z.id] = m.rng() < D.dodge;
    if (!flag) continue;
    const k = dd || 1;
    ax += (u.x - z.x) / k; az += (u.z - z.z) / k; any = true;
  }
  if (b.dodge && m.tick % 90 === 0) b.dodge = {};
  return any ? [ax, az] : null;
}

function stuckLogic(m, u, b, now) {
  if (now - b.sT >= 0.4) {
    const moved = hyp(u.x - b.sx, u.z - b.sz);
    const expect = u.def.speed * 0.4 * b.cmd * 0.25;
    if (b.cmd > 0.5 && u.stunT <= 0 && moved < expect && !u.dash) b.stuck++; else b.stuck = 0;
    b.sx = u.x; b.sz = u.z; b.sT = now;
    if (b.stuck >= 2) {
      b.forceRepath = true;
      let prop = null, pd = 1e9;
      for (const p of m.props) {
        if (!p.alive) continue;
        const dd = hyp(p.x - u.x, p.z - u.z);
        if (dd < u.radius + p.r + 2.2 && dd < pd) { pd = dd; prop = p; }
      }
      if (prop && b.stuck >= 3) { b.propId = prop.id; b.propUntil = now + 1.6; }
      else { const a = m.rng() * 6.283; b.sideX = Math.cos(a); b.sideZ = Math.sin(a); b.sideUntil = now + 0.6; }
      if (b.stuck >= 6) { b.goal = null; b.path = null; b.stuck = 0; }
    }
  }
  if (b.propId >= 0) {
    const p = m.props[b.propId];
    if (p && p.alive && now < b.propUntil) return { prop: p };
    b.propId = -1;
  }
  if (now < b.sideUntil) return { mx: b.sideX, mz: b.sideZ };
  return null;
}

// Skill policy per `do` primitive. Each returns true when the skill makes sense now; it may fill c.b.sk with an aim point / aim angle / move override.
const SKILL_AI = {
  shield(c) { return c.u.shield <= 0 && c.underFire && c.enemies.length > 0; },
  dash(c, s) {
    const { u, tgt, td, los } = c;
    if (!tgt || !los || c.hpFrac < 0.3) return false;
    const reach = s.dist + tgt.radius * 0.6;
    if (td < u.radius + tgt.radius + 1.6 || td > reach) return false;
    const a = Math.atan2(tgt.z - u.z, tgt.x - u.x);
    if (inFoe(c.m, u, u.x + Math.cos(a) * s.dist, u.z + Math.sin(a) * s.dist)) return false;
    c.b.sk.aim = a;
    return true;
  },
  nova(c, s) {
    const { u, tgt } = c;
    let n = 0;
    for (const e of c.enemies) if (hyp(e.x - u.x, e.z - u.z) < s.radius * 0.85) n++;
    if (n >= 2) return true;
    return n >= 1 && (c.hpFrac < 0.5 || (tgt && tgt.hp <= s.dmg * 0.9) || c.D.skill >= 0.9);
  },
  volley(c, s) {
    const { u, tgt, td, los } = c;
    if (!tgt || !los || td > s.range - 1 || td < 2.5) return false;
    const p = leadPoint(u, tgt, s.speed, c.D.lead);
    c.b.sk.aim = Math.atan2(p[1] - u.z, p[0] - u.x);
    c.b.sk.x = p[0]; c.b.sk.z = p[1];
    return losClear(c.m.map, u.x, u.z, p[0], p[1], 0.3);
  },
  buff(c) {
    const { u, tgt, td, w } = c;
    if (u.hasteT > 0 || u.rapidT > 0) return false;
    if (c.state === 'retreat') return c.enemies.length > 0;
    return !!tgt && td < w.range + 4 && c.state !== 'grab';
  },
  barrage(c, s) {
    const { u, tgt, td } = c;
    if (!tgt || td > s.cast || td < 3.5) return false;
    let cx = 0, cz = 0, n = 0;
    const p = leadPoint(u, { x: tgt.x, z: tgt.z, vx: tgt.vx, vz: tgt.vz }, 6, c.D.lead * 0.6);
    for (const e of c.enemies) if (hyp(e.x - tgt.x, e.z - tgt.z) < s.radius) { cx += e.x; cz += e.z; n++; }
    c.b.sk.x = (p[0] + cx / n) / 2; c.b.sk.z = (p[1] + cz / n) / 2;
    return true;
  },
  mine(c, s) {
    const { u, tgt, td } = c;
    if (!tgt || td > s.cast + 2 || td < 2) return false;
    const p = leadPoint(u, tgt, 8, c.D.lead * 0.7);
    const d = hyp(p[0] - u.x, p[1] - u.z), k = Math.min(1, s.cast / (d || 1));
    c.b.sk.x = u.x + (p[0] - u.x) * k; c.b.sk.z = u.z + (p[1] - u.z) * k;
    return true;
  },
  blink(c, s) {
    const { u, tgt, td, role, w } = c;
    if (!tgt) return false;
    const danger = (c.hpFrac < 0.55 && td < 9) || (role.kite && td < w.range * 0.3);
    if (!danger) return false;
    const base = Math.atan2(u.z - tgt.z, u.x - tgt.x), map = c.m.map;
    for (const da of [0, 0.6, -0.6, 1.2, -1.2]) {
      const a = base + da, ex = u.x + Math.cos(a) * s.dist, ez = u.z + Math.sin(a) * s.dist;
      if (solidAt(map, ex, ez, u.radius * 0.8) || inFoe(c.m, u, ex, ez)) continue;
      if (!losClear(map, u.x, u.z, ex, ez, u.radius * 0.7)) continue;
      c.b.sk.mx = Math.cos(a); c.b.sk.mz = Math.sin(a);
      return true;
    }
    return false;
  },
  beam(c, s) {
    const { u, tgt, td } = c;
    if (!tgt || td > s.range - 2 || td < 4) return false;
    const p = leadPoint(u, tgt, td / s.windup, c.D.lead);
    const dx = p[0] - u.x, dz = p[1] - u.z, dd = hyp(dx, dz);
    if (castStatic(c.m.map, u.x, u.z, p[0], p[1], 0.2) <= 1) return false;
    const lat = Math.abs((tgt.vx || 0) * dz - (tgt.vz || 0) * dx) / (dd || 1);
    if (lat > 1.5 + (1 - c.D.skill) * 2) return false;
    c.b.sk.aim = Math.atan2(dz, dx); c.b.sk.x = p[0]; c.b.sk.z = p[1];
    return true;
  },
  zone(c, s) {
    const { u, tgt, td } = c;
    if (s.hps || s.at === 'self') {
      let miss = 0;
      for (const a of c.m.units) {
        if (a.team !== u.team || !a.alive || d2(a.x, a.z, u.x, u.z) > s.radius * s.radius) continue;
        miss += 1 - a.hp / a.maxHp;
      }
      return miss >= 0.5;
    }
    if (!tgt || td > s.cast + 1 || td < 3) return false;
    const p = leadPoint(u, tgt, 12, c.D.lead * 0.5);
    const d = hyp(p[0] - u.x, p[1] - u.z), k = Math.min(1, s.cast / (d || 1));
    c.b.sk.x = u.x + (p[0] - u.x) * k; c.b.sk.z = u.z + (p[1] - u.z) * k;
    return true;
  },
  dome(c, s) {
    const { u } = c;
    if (!c.enemies.length) return false;
    let hurt = 0;
    for (const a of c.m.units) {
      if (a.team !== u.team || !a.alive || d2(a.x, a.z, u.x, u.z) > s.radius * s.radius) continue;
      if (a.hp < a.maxHp * 0.6) hurt++;
    }
    return hurt >= 2 || (hurt >= 1 && c.hpFrac < 0.55 && c.underFire);
  },
};

function chooseSkill(c) {
  const { u, b, D, m, role } = c;
  if (u.cast || u.dash || u.stunT > 0) return null;
  const sk = b.sk;
  const p = 1 - Math.pow(1 - Math.min(0.999, D.skill), 1.5 * TICK);
  for (let i = 0; i < 3; i++) {
    if (u.cd[SLOTS[i]] > 0) continue;
    const s = u.def.skills[i], fn = SKILL_AI[s.do];
    if (!fn) continue;
    sk.x = c.tgt ? c.tgt.x : u.x; sk.z = c.tgt ? c.tgt.z : u.z; sk.aim = null; sk.mx = null; sk.mz = null;
    if (!fn(c, s)) continue;
    if (D.skill < 1 && m.rng() > p * role.eager[i]) continue;
    sk.slot = i;
    return sk;
  }
  return null;
}
