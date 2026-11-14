// Bot AI. One call per bot per tick, pure: reads the match, keeps its memory in u.brain, draws randomness only from m.rng.
// States: push (go toward the enemy / the lane objective), fight (hold a preferred range and shoot),
// retreat (heal at base or a heal crate), grab (drive onto an airdrop crate).
// Mode nha (two-sided base) adds an objective layer on top: nhaPlan() picks attack / defend / wave for each bot, nhaMove() walks it,
// towerGuard() keeps it out of an enemy tower's range unless the group is already there. Mechs do not collide, so every bot keeps its own spacing.

import { TICK, RULES, DIFFICULTY } from './data.js';
import { visibleTo, towerOpen } from './sim.js';
import { findPath, losClear, solidAt, castStatic, segCircle } from './maps.js';

// pref: [near, far] fraction of weapon range the bot likes to hold. kite: back away from closers.
// peek: duck behind cover while the weapon recharges. eager: multiplier on the skill roll for slots s1, s2, ult.
const ROLE = {
  tank:    { pref: [0.3, 0.6],  kite: false, peek: false, strafe: 0.45, follow: false, eager: [1, 1, 1] },
  assault: { pref: [0.4, 0.75], kite: false, peek: false, strafe: 1,    follow: false, eager: [1, 1, 1] },
  sniper:  { pref: [0.7, 0.95], kite: true,  peek: true,  strafe: 0.6,  follow: false, eager: [1, 1, 0.9] },
  support: { pref: [0.55, 0.85], kite: true, peek: false, strafe: 0.8,  follow: true,  eager: [1, 1, 1] },
  // artillery: longest range, stays behind its allies (behind) and never strays far from them (tether, metres)
  artillery: { pref: [0.65, 0.95], kite: true, peek: false, strafe: 0.4, follow: true, behind: true, tether: 9, eager: [1, 1, 1] },
  // flanker: short range, goes for low-HP isolated targets (isolate, lowHp), breaks off sooner when focused (cautious)
  flanker: { pref: [0.25, 0.7], kite: false, peek: false, strafe: 1.2, follow: false, isolate: 1, lowHp: 1, cautious: 0.1, eager: [1, 1, 1] },
  // boss: slow, big, never retreats; walks at the best group and lets the skills do the work (see bossGoal, SKILL_AI)
  boss: { pref: [0.25, 0.5], kite: false, peek: false, strafe: 0, follow: false, boss: true, eager: [1, 1, 1] },
  control:  { pref: [0.5, 0.85], kite: false, peek: false, strafe: 0.7, follow: true, tether: 11, eager: [1, 1, 1] },
  engineer: { pref: [0.45, 0.8], kite: false, peek: false, strafe: 0.6, follow: true, tether: 11, eager: [1, 1, 1] },
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
    born: m.time, rot: 0, idleT: 0, np: null, otId: -1, waitT: -1, twHp: {}, twHit: {}, spotT: -9, spotFor: -1, stage: [0, 0], stand: [0, 0],
    path: null, pi: 0, pathT: -9, pgx: 0, pgz: 0, forceRepath: false,
    seen: {}, tgt: -1, engageAt: 0, aim: u.aim, err: 0, errTo: 0, errNext: 0,
    strafe: 1, strafeNext: 0, dutyOn: true, dutyNext: 0,
    sx: u.x, sz: u.z, sT: 0, stuck: 0, cmd: 0, sideUntil: 0, sideX: 0, sideZ: 0, propId: -1, propUntil: 0,
    pt: -1, planT: -9, stand: [0, 0], standT: -9, fleeUntil: 0, fleeCool: 0, lastThreat: -9, fleeG: null, fleeT: -9,
    goalT: -9, noLosT: -9, novaC: null, novaFlag: false, novaAt: 0, dashFlag: undefined,
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
  const mode = m.mode, isBoss = !!role.boss;

  const hpFrac = u.hp / u.maxHp;
  const own = ownOf(m, u);
  const inOwnBase = !!own && d2(u.x, u.z, own[0], own[1]) < (RULES.baseRadius - 0.5) ** 2;

  perceive(m, u, b, D, now);
  const lob = !!w.lob;
  const np = mode === 'nha' && !isBoss ? nhaPlan(m, u, b, D, role, w, now) : null;
  b.np = np;
  const mech = pickTarget(m, u, b, D, now, w, role);
  const enemies = b.enemies;
  // Target: an enemy mech; an enemy turret when no mech can be hit; for a lobbing weapon also a mech seen a moment ago.
  // In nha a tower the weapon reaches is a target too (see nhaTarget).
  let tgt = mech;
  if (np) tgt = nhaTarget(m, u, b, np, mech, w, enemies, D, now);
  else if (!mech || !canHit(m, u, mech, w, D)) {
    const tur = pickTurret(m, u, w);
    if (tur) tgt = tur;
    else if (!mech && lob) tgt = pickGhost(m, u, b, w, now);
  }
  const unitTgt = tgt && !tgt.pseudo ? tgt : null;
  let td = tgt ? hyp(tgt.x - u.x, tgt.z - u.z) : 1e9;

  let near = 0, allyNear = 0, hunters = 0, nearest = 1e9;
  for (const e of enemies) {
    const dd = d2(e.x, e.z, u.x, u.z);
    if (dd < 196) near++;
    if (dd < nearest) nearest = dd;
    if (dd < 169 && e.brain && e.brain.tgt === u.id) hunters++;
  }
  if (nearest < 400) b.lastThreat = now;
  for (const a of m.units) if (a !== u && a.team === u.team && a.alive && d2(a.x, a.z, u.x, u.z) < 196) allyNear++;
  const outnumbered = mode === 'tudo' ? near >= 2 : mode === 'trum' ? false : near - allyNear >= 2;
  // free-for-all: two hunters (or three mechs close) is a fight nobody wins; run, break the line of sight, come back later
  const flee = mode === 'tudo' && now >= b.fleeCool && (hunters >= 2 || (near >= 3 && u.combatT < 2)) &&
    !(unitTgt && unitTgt.hp < unitTgt.maxHp * 0.15 && td < 8);
  const plan = mode === 'chiem' && !isBoss ? chiemPlan(m, u, b, role, now, enemies) : null;
  const bossU = mode === 'trum' && !isBoss ? bossOf(m) : null;

  const crate = isBoss ? null : pickCrate(m, u, b, hpFrac, enemies, plan);
  setState(m, u, b, D, now, hpFrac, outnumbered, crate, tgt, td, w, inOwnBase, role, flee);

  let gx = null, gz = null, hold = false, aimX = null, aimZ = null;
  let mvx = 0, mvz = 0;
  const underFire = u.combatT < 1.2;
  const state = b.state;

  let los = false, aimPt = null, aimAng = u.aim;
  if (tgt) {
    aimPt = aimAtPoint(u, tgt, w, D.lead);
    los = losClear(map, u.x, u.z, aimPt[0], aimPt[1], Math.min(0.2, (w.r || 0.3) * 0.6)) && !wallBlocks(m, u.x, u.z, aimPt[0], aimPt[1], 0.2);
    aimX = aimPt[0]; aimZ = aimPt[1];
  }
  const canFire = lob ? !!tgt : los;

  if (isBoss) {
    const g = bossGoal(m, u, b, enemies);
    if (g) { gx = g[0]; gz = g[1]; } else hold = true;
  } else if (state === 'retreat') {
    if (own) {
      const g = b.retreatGoal || own;
      if (inOwnBase) hold = true; else { gx = g[0]; gz = g[1]; }
    } else {
      // no base in this mode: a heal crate, else out of their sight
      const hc = healCrateNear(m, u, 26);
      const g = hc ? [hc.x, hc.z] : fleeGoal(m, u, b, enemies, now);
      gx = g[0]; gz = g[1];
    }
  } else if (state === 'grab') {
    const c = m.crates.find((k) => k.id === b.crate);
    if (c) { gx = c.x; gz = c.z; }
  } else if (bossU && bossU.alive && tgt && tgt === bossU) {
    const r = trumMove(m, u, b, D, role, bossU, td, w, los, now, hpFrac);
    mvx = r[0]; mvz = r[1]; gx = r[2]; gz = r[3];
  } else if (plan) {
    const r = chiemMove(m, u, b, D, role, plan, tgt, td, w, los, now, hpFrac, underFire, enemies, state);
    mvx = r[0]; mvz = r[1]; gx = r[2]; gz = r[3]; hold = r[4];
  } else if (np) {
    const r = nhaMove(m, u, b, D, role, np, tgt, td, w, los, now, hpFrac, underFire, enemies);
    mvx = r[0]; mvz = r[1]; gx = r[2]; gz = r[3]; hold = r[4];
  } else if (state === 'fight') {
    const r = fightMove(m, u, b, D, role, tgt, td, w, los, now, hpFrac, underFire, enemies);
    mvx = r[0]; mvz = r[1]; gx = r[2]; gz = r[3]; hold = r[4];
  } else {
    const g = pushGoal(m, u, b, role, now, tgt);
    gx = g[0]; gz = g[1];
  }

  if (gx !== null) {
    const v = goTo(m, u, b, gx, gz, now);
    if (v) { mvx += v[0]; mvz += v[1]; }
  }
  if (hold && !tgt) { mvx = mvz = 0; }

  // incoming ground attacks: step out of red circles and off armed mines; the boss's nova ring and charge line
  const threat = bossThreat(m, u, b, D, now);
  const avoid = threat || (isBoss ? null : dodgeZones(m, u, b, D));
  if (avoid) { mvx = avoid[0] * 1.5 + mvx * 0.3; mvz = avoid[1] * 1.5 + mvz * 0.3; }
  // lava under or beside us, a vent about to blast: out, whatever the plan was
  const esc = hazardEscape(m, u, b);
  if (esc) { mvx = esc[0] * 1.6 + mvx * 0.15; mvz = esc[1] * 1.6 + mvz * 0.15; }

  const unstuck = stuckLogic(m, u, b, now);
  if (unstuck) {
    if (unstuck.prop) { aimX = unstuck.prop.x; aimZ = unstuck.prop.z; mvx = mvz = 0; }
    else if (!esc && !threat) { mvx = unstuck.mx; mvz = unstuck.mz; }
  }

  // a spinning slash that lets us move (nova with move: 1): keep closing in on the enemy
  if (u.cast && u.cast.skill.do === 'nova' && u.cast.skill.move >= 1 && unitTgt) {
    if (td < 1.6) mvx = mvz = 0; else { mvx = (unitTgt.x - u.x) / td; mvz = (unitTgt.z - u.z) / td; }
  }

  // mechs pass through each other: keep my own distance from allies (grouping, lanes, standing on a point, around the boss)
  if (!isBoss) { const sp = spacing(m, u); mvx += sp[0]; mvz += sp[1]; }
  let len = hyp(mvx, mvz);
  if (len > 1) { mvx /= len; mvz /= len; len = 1; }
  if (np && len > 1e-3) { const g = towerGuard(m, u, D, np, mvx, mvz); if (g) { mvx = g[0]; mvz = g[1]; len = hyp(mvx, mvz); if (len > 1) { mvx /= len; mvz /= len; len = 1; } } }
  if (len > 1e-3) {
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
  const turnRate = (isBoss ? 3.2 : 4.5) + 8 * D.skill;
  const noisy = desired + (aimX !== null ? b.err : 0);
  b.aim = u.cast && u.cast.lock ? u.cast.aim : turnTo(b.aim, noisy, turnRate * TICK);
  aimAng = b.aim;

  // skills (may snap the aim for a flick)
  const ctx = { m, u, b, D, role, tgt: unitTgt, td: unitTgt ? td : 1e9, los: unitTgt ? los : false, enemies, hpFrac, underFire, state, w, aimPt, near, allyNear,
    ttgt: tgt && tgt.tower ? tgt : null, ttd: td, tlos: los };
  const sk = chooseSkill(ctx);
  if (sk) {
    out[SLOTS[sk.slot]] = true;
    if (b.sk.aim !== null) aimAng = b.aim = b.sk.aim;
    if (b.sk.mx !== null) { mvx = b.sk.mx; mvz = b.sk.mz; }
    aimX = b.sk.x; aimZ = b.sk.z;
  }

  // heal item (the boss has none)
  if (!isBoss && u.cd.heal <= 0 && hpFrac < 0.6 && (underFire || state === 'retreat' || hpFrac < 0.4)) out.heal = true;

  // fire
  let fire = false;
  if (tgt && canFire) {
    const aimErrNow = lob ? 0 : Math.abs(angDiff(aimAng, desired));
    const reach = hyp(aimPt[0] - u.x, aimPt[1] - u.z) - tgt.radius * 0.5 <= w.range;
    const ready = now >= b.engageAt;
    const size = Math.atan2(tgt.radius, Math.max(1, td)) + 0.1;
    if (reach && ready && aimErrNow < size + 0.06 && (lob || !domeBlocks(m, u, aimPt)) && duty(m, b, D, now)) fire = true;
  }
  if (unstuck && unstuck.prop) {
    const p = unstuck.prop, a = Math.atan2(p.z - u.z, p.x - u.x);
    if (Math.abs(angDiff(aimAng, a)) < 0.2 && w.range >= hyp(p.x - u.x, p.z - u.z)) fire = true;
  }
  out.fire = fire && !(u.cast && u.cast.skill);

  out.mx = mvx; out.mz = mvz; out.aim = aimAng;
  if (aimX !== null) {
    out.tx = aimX; out.tz = aimZ;
    if (lob && !sk && b.err) {   // aim noise on a lobbed shell: rotate the aim point about the bot
      const c = Math.cos(b.err * 0.6), s = Math.sin(b.err * 0.6), dx = aimX - u.x, dz = aimZ - u.z;
      out.tx = u.x + dx * c - dz * s; out.tz = u.z + dx * s + dz * c;
    }
  } else { out.tx = u.x + Math.cos(aimAng) * 8; out.tz = u.z + Math.sin(aimAng) * 8; }
  return guard(out, u);
}

// ---- modes and hazards -------------------------------------------------------------------------------------------------------

// The one place that knows whether a team has a base: free-for-all (team ids 0..9) has none.
function baseOf(m, team) {
  if (m.mode === 'tudo' || (team !== 0 && team !== 1)) return null;
  return m.map.bases[team] || null;
}
// My own base (regen, retreat) and the enemy base I must not enter (it burns in tdm and chiem only; in nha the towers guard it instead). null when the mode has none.
function ownOf(m, u) { return u.def.boss ? null : baseOf(m, u.team); }
function foeOf(m, u) { return u.def.boss || m.mode === 'trum' || m.mode === 'nha' ? null : baseOf(m, 1 - u.team); }
const bossOf = (m) => { for (const x of m.units) if (x.def.boss) return x; return null; };

function lavaNear(map, x, z, pad) {
  for (const h of map.hazards) if (h.kind === 'lava' && d2(x, z, h.x, h.z) < (h.r + pad) * (h.r + pad)) return true;
  return false;
}
function lavaSeg(map, x0, z0, x1, z1, pad) {
  for (const h of map.hazards) if (h.kind === 'lava' && segCircle(x0, z0, x1 - x0, z1 - z0, h.x, h.z, h.r + pad) <= 1) return true;
  return false;
}
function iceAt(map, x, z) {
  for (const h of map.hazards) if (h.kind === 'ice' && d2(x, z, h.x, h.z) < h.r * h.r) return h;
  return null;
}
// Mud slows every mech except hover and heavy ones, so for those it is not there.
const mudProof = (u) => !!(u.def.hover || u.def.heavy);
function mudAt(map, x, z) {
  for (const h of map.hazards) if (h.kind === 'mud' && d2(x, z, h.x, h.z) < h.r * h.r) return h;
  return null;
}
const MUD_CELLS = new WeakMap();
function mudCells(map) {
  let c = MUD_CELLS.get(map);
  if (c) return c;
  c = [];
  const nav = map.nav;
  for (const h of map.hazards) {
    if (h.kind !== 'mud') continue;
    for (let j = 0; j < nav.rows; j++) for (let i = 0; i < nav.cols; i++) {
      const cx = -map.hw + (i + 0.5) * nav.cell, cz = -map.hd + (j + 0.5) * nav.cell;
      if (hyp(cx - h.x, cz - h.z) < h.r + 0.7) c.push(j * nav.cols + i);
    }
  }
  MUD_CELLS.set(map, c);
  return c;
}
function mudSeg(map, x0, z0, x1, z1) {
  for (const h of map.hazards) if (h.kind === 'mud' && segCircle(x0, z0, x1 - x0, z1 - z0, h.x, h.z, h.r) <= 1) return true;
  return false;
}
function pathLen(x, z, p) { let L = 0; for (const q of p) { L += hyp(q[0] - x, q[1] - z); x = q[0]; z = q[1]; } return L; }
function pathMud(map, x, z, p) { for (const q of p) { if (mudSeg(map, x, z, q[0], q[1])) return true; x = q[0]; z = q[1]; } return false; }
// A* that goes around mud when a path of similar length exists (the mud cells are blocked for one search, then released).
function findPathMud(m, u, x0, z0, x1, z1) {
  const map = m.map, p0 = findPath(map, x0, z0, x1, z1);
  if (mudProof(u) || !map.hazards.some((h) => h.kind === 'mud') || !pathMud(map, x0, z0, p0)) return p0;
  const nav = map.nav, set = [];
  for (const i of mudCells(map)) if (!nav.blocked[i]) { nav.blocked[i] = 1; set.push(i); }
  const p1 = findPath(map, x0, z0, x1, z1);
  for (const i of set) nav.blocked[i] = 0;
  return pathLen(x0, z0, p1) <= pathLen(x0, z0, p0) * 1.35 + 4 && !pathMud(map, x0, z0, p1) ? p1 : p0;
}

function ventNear(m, x, z, pad) {
  for (const v of m.vents) if (d2(x, z, v.x, v.z) < (v.r + pad) * (v.r + pad)) return true;
  return false;
}

// A straight line from (x,z) to (tx,tz) that crosses lava: the point beside the disc to aim at instead (null when the line is clear).
function lavaDetour(map, x, z, tx, tz) {
  let best = null, bt = 2;
  for (const h of map.hazards) {
    if (h.kind !== 'lava') continue;
    const t = segCircle(x, z, tx - x, tz - z, h.x, h.z, h.r + 0.6);
    if (t > 0 && t <= 1 && t < bt) { bt = t; best = h; }
  }
  if (!best) return null;
  const dx = tx - x, dz = tz - z, L = hyp(dx, dz) || 1, px = -dz / L, pz = dx / L;
  const sgn = ((best.x - x) * px + (best.z - z) * pz) >= 0 ? 1 : -1, R = best.r + 1.8;
  return [best.x - sgn * px * R, best.z - sgn * pz * R];
}

// Out of lava, off the rim of it, and off a vent that is warned or about to be.
function hazardEscape(m, u, b) {
  let ax = 0, az = 0, any = false;
  for (const h of m.map.hazards) {
    if (h.kind !== 'lava') continue;
    const d = hyp(u.x - h.x, u.z - h.z);
    if (d < h.r + 0.45) { const k = d || 1; ax += d ? (u.x - h.x) / k : 1; az += d ? (u.z - h.z) / k : 0; any = true; }
  }
  for (const v of m.vents) {
    const d = hyp(u.x - v.x, u.z - v.z);
    if (d < v.r + u.radius * 0.5 + 0.7 && (v.warn || v.t < 2.2)) { const k = d || 1; ax += d ? (u.x - v.x) / k : 1; az += d ? (u.z - v.z) / k : 0; any = true; }
  }
  return any ? [ax, az] : null;
}

// Boss raid, players' side: leave the nova ring before it lands, and step off the charge line when the boss faces us with its dash ready.
function bossThreat(m, u, b, D, now) {
  if (m.mode !== 'trum' || u.def.boss) return null;
  const boss = bossOf(m);
  if (!boss || !boss.alive) return null;
  const pd = 0.5 + 0.5 * Math.min(1, D.dodge / 0.8);   // how often this bot sees it coming: easy 0.5, normal 0.72, hard 1
  const dx = u.x - boss.x, dz = u.z - boss.z, d = hyp(dx, dz) || 1;
  const c = boss.cast;
  if (c && c.skill.do === 'nova') {
    if (b.novaC !== c) { b.novaC = c; b.novaFlag = m.rng() < pd; b.novaAt = now + D.react * 0.3 * m.rng(); }
    if (b.novaFlag && now >= b.novaAt && d < c.skill.radius + u.radius * 0.5 + 0.9) return [dx / d, dz / d];
    return null;
  }
  if (boss.cd.s2 > 1) b.dashFlag = undefined;
  const dashing = boss.dash;
  if (!c && (dashing || boss.cd.s2 <= 0.45)) {
    if (!dashing && b.dashFlag === undefined) b.dashFlag = m.rng() < pd;
    if (dashing || b.dashFlag) {
      const ax = dashing ? boss.dash.dx : Math.cos(boss.aim), az = dashing ? boss.dash.dz : Math.sin(boss.aim);
      const along = dx * ax + dz * az, lat = -dx * az + dz * ax;
      const reach = (dashing ? boss.dash.left : boss.def.skills[1].dist) + boss.radius + u.radius + 1;
      if (along > 0 && along < reach && Math.abs(lat) < boss.radius + u.radius + 1.8) { const sg = lat >= 0 ? 1 : -1; return [-az * sg, ax * sg]; }
    }
  }
  return null;
}

// Boss: walk at the best group of enemies it can see (many near each other, near me), stop a few metres short of it. null = stand and shoot.
function bossGoal(m, u, b, enemies) {
  let best = null, bs = -1e9;
  for (const e of enemies) {
    let n = 0, cx = 0, cz = 0;
    for (const o of enemies) if (hyp(o.x - e.x, o.z - e.z) < 8) { n++; cx += o.x; cz += o.z; }
    const s = n * 6 - hyp(e.x - u.x, e.z - u.z);
    if (s > bs) { bs = s; best = [cx / n, cz / n]; }
  }
  if (!best) {
    let bt = -1e9;
    for (const id in b.seen) if (b.seen[id].t > bt && m.units[id].alive) { bt = b.seen[id].t; best = [b.seen[id].x, b.seen[id].z]; }
  }
  if (!best) return [0, 0];
  const dx = best[0] - u.x, dz = best[1] - u.z, d = hyp(dx, dz);
  if (d < 6.5) return null;
  const k = (d - 5.5) / d;
  return [u.x + dx * k, u.z + dz * k];
}

// Where, around the boss, to stand: a ring just outside its nova (or at the weapon's reach), spread by slot, apart from allies.
function ringRadius(w) { return w.range >= 11.8 ? Math.min(20, Math.max(9.9, w.range * 0.85)) : w.range * 0.9; }

function trumMove(m, u, b, D, role, boss, td, w, los, now, hpFrac) {
  const dx = u.x - boss.x, dz = u.z - boss.z, d = hyp(dx, dz) || 1, ox = dx / d, oz = dz / d;
  const R = ringRadius(w);
  // out of reach or behind a wall: walk toward it until we see it; once we do, hold a moment so we shoot before backing off
  if (d > R + 5 || (!los && !w.lob)) { if (!los) b.noLosT = now; return [0, 0, d > R + 5 && los ? boss.x + ox * R * 0.9 : boss.x, d > R + 5 && los ? boss.z + oz * R * 0.9 : boss.z, false]; }
  if (now - b.noLosT < 1.0 && d > R * 0.6) return [0, 0, null, null, true];
  // slot angle among the living allies (including me), a fifth of a circle apart
  let k = 0, n = 0;
  for (const a of m.units) if (a.team === u.team && a.alive) { if (a.id < u.id) k++; n++; }
  const want = 0.5 + (k / Math.max(1, n)) * 2 * Math.PI, cur = Math.atan2(dz, dx), da = angDiff(cur, want);
  if (now >= b.strafeNext) { b.strafe = m.rng() < 0.5 ? -1 : 1; b.strafeNext = now + 0.9 + m.rng() * 1.1; }
  const radial = Math.max(-1, Math.min(1, (R - d) / 3));
  const tang = Math.abs(da) > 0.3 ? Math.max(-1, Math.min(1, da * 1.4)) * 0.7 : b.strafe * 0.3 * (0.35 + 0.65 * D.dodge) * role.strafe;
  let mx = ox * radial - oz * tang, mz = oz * radial + ox * tang;
  // spread: push off allies closer than 7 m
  for (const a of m.units) {
    if (a === u || a.team !== u.team || !a.alive) continue;
    const ax = u.x - a.x, az = u.z - a.z, ad = hyp(ax, az);
    if (ad < 7 && ad > 1e-3) { const f = (7 - ad) / 7 * 1.5; mx += ax / ad * f; mz += az / ad * f; }
  }
  // the healer and the other followers keep the group in reach
  if (role.follow) {
    let cx = 0, cz = 0, c = 0;
    for (const a of m.units) if (a !== u && a.team === u.team && a.alive) { cx += a.x; cz += a.z; c++; }
    if (c) { cx /= c; cz /= c; const ad = hyp(cx - u.x, cz - u.z); if (ad > (role.tether || 10) + 3) { mx += (cx - u.x) / ad * 0.35; mz += (cz - u.z) / ad * 0.35; } }
  }
  return [mx, mz, null, null, false];
}

// Free-for-all and base-less retreat: nearest heal crate, else the spot that is out of every pursuer's sight and far from them.
function healCrateNear(m, u, maxD) {
  let best = null, bd = maxD;
  for (const c of m.crates) {
    if (c.fall > 0 || c.type !== 'heal') continue;
    const d = hyp(c.x - u.x, c.z - u.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

function fleeGoal(m, u, b, enemies, now) {
  if (b.fleeG && now - b.fleeT < 0.4) return b.fleeG;
  b.fleeT = now;
  const map = m.map, thr = enemies.filter((e) => d2(e.x, e.z, u.x, u.z) < 484);
  if (!thr.length) return (b.fleeG = [u.x, u.z]);
  let best = null, bs = -1e9;
  for (let k = 0; k < 16; k++) {
    const a = k * Math.PI / 8;
    for (const r of [7, 11]) {
      const x = u.x + Math.cos(a) * r, z = u.z + Math.sin(a) * r;
      if (solidAt(map, x, z, 1.3) || lavaNear(map, x, z, 1.6) || ventNear(m, x, z, 0.6) || (!mudProof(u) && mudAt(map, x, z))) continue;
      if (!losClear(map, u.x, u.z, x, z, u.moveRadius * 0.8) || lavaSeg(map, u.x, u.z, x, z, 0.8)) continue;
      let s = 0;
      for (const e of thr) {
        s += Math.min(hyp(x - e.x, z - e.z), 16);
        if (!losClear(map, e.x, e.z, x, z, 0.2)) s += 5;
      }
      s /= thr.length;
      if (iceAt(map, x, z)) s -= 1;
      if (s > bs) { bs = s; best = [x, z]; }
    }
  }
  if (!best) {
    let cx = 0, cz = 0;
    for (const e of thr) { cx += e.x; cz += e.z; }
    cx /= thr.length; cz /= thr.length;
    const d = hyp(u.x - cx, u.z - cz) || 1;
    best = [u.x + (u.x - cx) / d * 6, u.z + (u.z - cz) / d * 6];
  }
  return (b.fleeG = best);
}

// ---- control points ----------------------------------------------------------------------------------------------------------
// Slot -> point it favours (team 0 sees the points as 0 = middle, 1 = near its base, 2 = far; team 1 the other way round).
const PT_AFF = [[0, 1, 2], [0, 2, 1]];

// Which point to go to: the one that needs capturing or defending most, spread over the squad, followers go where the squad is.
function chiemPlan(m, u, b, role, now, enemies) {
  const pts = m.points;
  if (!pts.length) return null;
  if (b.pt < 0 || now - b.planT > 0.6) {
    b.planT = now;
    const aff = PT_AFF[u.team & 1][u.slot % 3];
    let best = 0, bs = -1e9;
    for (const p of pts) {
      const mine = u.team === 0 ? -p.prog : p.prog;   // 1 = fully ours
      const need = (1 - mine) / 2;
      let ePres = 0;
      for (const e of enemies) if (hyp(e.x - p.x, e.z - p.z) < p.r + 3) ePres++;
      let al = 0;
      for (const a of m.units) if (a !== u && a.team === u.team && a.alive && a.brain && a.brain.pt === p.id) al++;
      let s = need * 2.2 + (ePres ? (p.owner === u.team ? 1.3 : 0.6) : 0) - 0.75 * al + (p.id === aff ? 0.9 : 0) - hyp(p.x - u.x, p.z - u.z) / 45 + (b.pt === p.id ? 0.5 : 0);
      if (role.follow) s += 1.5 * al;
      if (s > bs) { bs = s; best = p.id; }
    }
    b.pt = best;
  }
  const P = pts[b.pt];
  if (b.standT < 0 || now - b.standT > 0.7 || hyp(b.stand[0] - P.x, b.stand[1] - P.z) > P.r) { b.standT = now; b.stand = standPos(m, u, P, enemies); }
  return { P, S: b.stand };
}

// A spot inside the point's circle: clear of walls, lava and vents, hidden from the nearest enemy when there is such a spot, spread from allies.
function standPos(m, u, P, enemies) {
  const map = m.map;
  let ne = null, nd = 28;
  for (const e of enemies) { const d = hyp(e.x - u.x, e.z - u.z); if (d < nd) { nd = d; ne = e; } }
  let best = null, bs = -1e9;
  for (let ring = 0; ring < 3; ring++) for (let k = 0; k < (ring ? 8 : 1); k++) {
    const rr = [0, 0.45, 0.78][ring] * P.r, a = k * Math.PI / 4 + ring * 0.4;
    const x = P.x + Math.cos(a) * rr, z = P.z + Math.sin(a) * rr;
    if (solidAt(map, x, z, u.moveRadius + 0.2) || propAt(m, x, z, u.moveRadius) || lavaNear(map, x, z, u.moveRadius + 0.9) || ventNear(m, x, z, u.moveRadius + 0.4) || (!mudProof(u) && mudAt(map, x, z))) continue;
    let s = -hyp(x - u.x, z - u.z) * 0.1 - rr * 0.05;
    if (ne && !losClear(map, ne.x, ne.z, x, z, 0.2)) s += 3;
    for (const o of m.units) if (o !== u && o.team === u.team && o.alive && o.brain && o.brain.pt === P.id && hyp(o.brain.stand[0] - x, o.brain.stand[1] - z) < 2.2) s -= 1.5;
    if (iceAt(map, x, z)) s -= 0.6;
    if (s > bs) { bs = s; best = [x, z]; }
  }
  return best || [P.x, P.z];
}

// Hold the point's circle while it is not safely ours, shoot whatever comes within reach, never chase far from it.
function chiemMove(m, u, b, D, role, plan, tgt, td, w, los, now, hpFrac, underFire, enemies, state) {
  const { P, S } = plan;
  const dc = hyp(u.x - P.x, u.z - P.z);
  let on = 0;
  for (const e of enemies) if (hyp(e.x - P.x, e.z - P.z) < P.r + 1) on++;
  const mine = (u.team === 0 ? -P.prog : P.prog) >= 1 && P.owner === u.team;
  const holdIn = !mine || on > 0;
  const leash = P.r + 2.5 + w.range * 0.3;
  if (state !== 'fight' || !tgt) {
    if (dc < P.r - 1 && !holdIn && hyp(S[0] - u.x, S[1] - u.z) < 1.2) return [0, 0, null, null, true];
    return [0, 0, S[0], S[1], false];
  }
  const fm = fightMove(m, u, b, D, role, tgt, td, w, los, now, hpFrac, underFire, enemies);
  if (dc > leash) return [0, 0, S[0], S[1], false];
  if (fm[2] !== null && hyp(fm[2] - P.x, fm[3] - P.z) > P.r + 1.5) return [0, 0, S[0], S[1], false];
  if (!holdIn && dc < P.r + 1.5) return fm;
  if (fm[2] !== null) return fm;
  let mx = fm[0], mz = fm[1];
  const ox = dc > 1e-3 ? (u.x - P.x) / dc : 0, oz = dc > 1e-3 ? (u.z - P.z) / dc : 0;
  const edge = P.r - 1.0;
  if (dc > edge) {
    const k = mx * ox + mz * oz;
    if (k > 0) { mx -= ox * k; mz -= oz * k; }
    mx -= ox * 0.5 * Math.min(1, (dc - edge) / 1.5); mz -= oz * 0.5 * Math.min(1, (dc - edge) / 1.5);
  }
  return [mx, mz, null, null, false];
}

// Last line of defence: whatever the logic above produced, the simulation only ever gets finite numbers.
function guard(out, u) {
  const ua = Number.isFinite(u.aim) ? u.aim : 0;
  if (!Number.isFinite(out.mx) || !Number.isFinite(out.mz)) { out.mx = 0; out.mz = 0; }
  if (!Number.isFinite(out.aim)) out.aim = ua;
  if (!Number.isFinite(out.tx) || !Number.isFinite(out.tz)) { out.tx = u.x + Math.cos(out.aim) * 8; out.tz = u.z + Math.sin(out.aim) * 8; }
  out.fire = !!out.fire; out.s1 = !!out.s1; out.s2 = !!out.s2; out.ult = !!out.ult; out.heal = !!out.heal;
  return out;
}

// Where to aim at e: a flying shot leads by distance / speed, a lobbed shell by its flight time (both scaled by `lead`).
function aimAtPoint(u, e, w, lead) {
  if (w.lob) return [e.x + (e.vx || 0) * w.flight * lead, e.z + (e.vz || 0) * w.flight * lead];
  return leadPoint(u, e, w.speed, lead);
}

// A prop on the line stops a shot too (it can be shot away, but a bot does not count on that when it picks a firing spot).
function propBlocks(m, x0, z0, x1, z1) {
  for (const p of m.props) if (p.alive && segCircle(x0, z0, x1 - x0, z1 - z0, p.x, p.z, p.r + 0.3) <= 1) return true;
  return false;
}
function wallBlocks(m, x0, z0, x1, z1, r) {
  for (const z of m.zones) {
    if (z.kind !== 'wall') continue;
    for (const q of z.pts) if (segCircle(x0, z0, x1 - x0, z1 - z0, q[0], q[1], z.r + r) <= 1) return true;
  }
  return false;
}

// Can u hit this mech right now with its weapon?
function canHit(m, u, e, w, D) {
  const p = aimAtPoint(u, e, w, D.lead);
  if (hyp(p[0] - u.x, p[1] - u.z) - e.radius * 0.5 > w.range) return false;
  if (w.lob) return true;
  return losClear(m.map, u.x, u.z, p[0], p[1], Math.min(0.2, w.r * 0.6)) && !wallBlocks(m, u.x, u.z, p[0], p[1], 0.2);
}

function pseudo(id, x, z, radius, hp, maxHp) { return { pseudo: true, id, x, z, vx: 0, vz: 0, radius, hp, maxHp, invulnT: 0 }; }

// Nearest enemy turret that the weapon can reach (lobbed shells need no line of sight).
function pickTurret(m, u, w) {
  let best = null, bd = 1e9;
  for (const z of m.zones) {
    if (z.kind !== 'turret' || z.team === u.team || z.hp <= 0) continue;
    const d = hyp(z.x - u.x, z.z - u.z);
    if (d > w.range * 1.3 || d >= bd) continue;
    if (!w.lob && (!losClear(m.map, u.x, u.z, z.x, z.z, 0.2) || wallBlocks(m, u.x, u.z, z.x, z.z, 0.2))) continue;
    bd = d; best = z;
  }
  return best ? pseudo(-100 - best.id, best.x, best.z, best.r, best.hp, best.maxHp) : null;
}

// A lobbing bot keeps shelling the spot where an enemy was last seen for a moment.
function pickGhost(m, u, b, w, now) {
  let best = null, bt = -1e9;
  for (const id in b.seen) {
    const s = b.seen[id], e = m.units[id];
    if (!e.alive || now - s.t > 1.5 || s.t < bt) continue;
    if (hyp(s.x - u.x, s.z - u.z) > w.range * 1.25) continue;
    bt = s.t; best = s;
  }
  return best ? pseudo(-1, best.x, best.z, 1, 1, 1) : null;
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

function pickTarget(m, u, b, D, now, w, role) {
  let best = null, bs = -1e9;
  for (const e of b.enemies) {
    if (e.invulnT > 0.3) continue;
    const d = hyp(e.x - u.x, e.z - u.z);
    if (d > 36) continue;
    let s = -d - 14 * (e.hp / e.maxHp) * (0.5 + 0.5 * D.skill);
    if (b.tgt === e.id) s += 4;
    if (m.mode === 'tudo') {
      // third-party: someone else is already hitting it or it is busy with someone else
      let others = 0;
      for (const k in e.hitBy) if (+k !== u.id && now - e.hitBy[k] < 3) others++;
      const busy = e.brain && e.brain.tgt >= 0 && e.brain.tgt !== u.id && m.units[e.brain.tgt].alive;
      if (others || busy) s += 3 + 5 * D.focus;
    } else if (m.mode === 'chiem') {
      // enemies on a point matter, enemies far from every point are not worth a trip
      let dp = 1e9, pr = 4.6, held = false;
      for (const p of m.points) { const dd = hyp(e.x - p.x, e.z - p.z); if (dd < dp) { dp = dd; pr = p.r; held = p.owner === e.team && (e.team === 0 ? -p.prog : p.prog) >= 1; } }
      if (dp < pr + 0.5) s += held ? 4 : 8; else s -= Math.max(0, dp - 6) * 0.5;
    } else if (role.boss) {
      s += (e.def.roleKey === 'support' ? 6 : 0);
      let c = 0;
      for (const o of b.enemies) if (o !== e && hyp(o.x - e.x, o.z - e.z) < 6) c++;
      s += 1.5 * c;
    }
    if (b.np && D.skill >= 0.5) {
      // never chase a kill deep under a standing tower
      const R = m.rule.tower.range;
      for (const t of m.towers) if (t.alive && t.team === e.team && hyp(e.x - t.x, e.z - t.z) < R - 1.5 && hyp(u.x - t.x, u.z - t.z) > R + 0.5) { s -= 25; break; }
    }
    let team = 0;
    for (const k in e.hitBy) { const a = m.units[k]; if (a.team === u.team && a !== u && now - e.hitBy[k] < 2.5) team++; }
    for (const a of m.units) if (a !== u && a.team === u.team && a.alive && a.brain && a.brain.tgt === e.id) team++;
    s += D.focus * 5 * Math.min(2, team);
    if (e.hp < e.maxHp * 0.4) s += D.focus * 6;
    if (role.lowHp) s += role.lowHp * D.skill * 10 * (1 - e.hp / e.maxHp);
    if (role.isolate || w.lob) {
      let others = 0;
      for (const o of b.enemies) if (o !== e && d2(o.x, o.z, e.x, e.z) < 64) others++;
      if (role.isolate) s += role.isolate * D.skill * 4 * (2 - Math.min(2, others));
      if (w.lob) s += 2.5 * Math.min(2, others);   // shells splash: prefer a clump
    }
    if (s > bs) { bs = s; best = e; }
  }
  const id = best ? best.id : -1;
  if (id !== b.tgt) { b.tgt = id; }
  return best;
}

function pickCrate(m, u, b, hpFrac, enemies, plan) {
  let best = null, bd = 1e9;
  const foe = foeOf(m, u), br = RULES.baseRadius + 1;
  for (const c of m.crates) {
    if (c.fall > 0) continue;
    if (foe && d2(c.x, c.z, foe[0], foe[1]) < br * br) continue;
    if (lavaNear(m.map, c.x, c.z, 1.2)) continue;
    if (m.mode === 'nha' && underTower(m, u.team, c.x, c.z, 1.5)) continue;
    if (plan && !(c.type === 'heal' && hpFrac < 0.6) && hyp(c.x - plan.P.x, c.z - plan.P.z) > plan.P.r + 7) continue;
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

function setState(m, u, b, D, now, hpFrac, outnumbered, crate, tgt, td, w, inOwnBase, role, flee) {
  let next = b.state;
  const tudo = m.mode === 'tudo', trum = m.mode === 'trum';
  if (role.boss) next = tgt && td <= w.range * 1.25 ? 'fight' : 'push';
  else {
    const thr = D.retreat + (outnumbered ? 0.08 : 0) + (role.cautious && outnumbered ? role.cautious : 0) + (trum ? 0.14 : 0);
    if (b.state === 'retreat') {
      let stay;
      if (tudo) stay = !(now >= b.fleeUntil && (hpFrac >= 0.7 || (hpFrac >= 0.5 && now - b.lastThreat > 2.5) || now - b.since > 14));
      else if (trum) stay = hpFrac < 0.85;
      else stay = hpFrac < 0.7;
      next = stay ? 'retreat' : 'push';
    } else if (hpFrac < thr || flee || (b.np && b.np.hunted && hpFrac < b.np.stepOut)) {
      next = 'retreat';
      b.retreatGoal = null;
      if (flee) { b.fleeUntil = now + 2.2; b.fleeCool = now + 7; b.fleeG = null; }
    } else if (crate && (!tgt || td > 9 || hyp(crate.x - u.x, crate.z - u.z) < 6)) next = 'grab';
    else if (tgt && (td <= w.range * 1.25 || (b.state === 'fight' && td <= w.range * 1.6))) next = 'fight';
    else next = 'push';
  }
  if (next === 'grab') b.crate = crate.id;
  if (next === 'retreat') {
    const own = ownOf(m, u);
    b.retreatGoal = own;
    if (own) for (const c of m.crates) {
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
  if (!b.goal || hyp(b.goal[0] - u.x, b.goal[1] - u.z) < 2.2 || (m.mode === 'tudo' && now - b.goalT > 4)) {
    b.goalT = now;
    if (b.goal) b.patrol++;
    if (m.mode === 'tudo') {
      // head for the nearest scrap (somebody who fired a moment ago), else anywhere
      let fx = null, fd = 1e9;
      for (const a of m.units) if (a !== u && a.alive && a.combatT < 3 && hyp(a.x - u.x, a.z - u.z) < fd) { fd = hyp(a.x - u.x, a.z - u.z); fx = a; }
      b.goal = fx && fd > 8 ? [fx.x, fx.z] : [m.rng.range(-m.map.hw + 6, m.map.hw - 6), m.rng.range(-m.map.hd + 6, m.map.hd - 6)];
    }
    else if (b.patrol === 0) b.goal = [dir * 4, b.lane];
    else if (b.patrol === 1) b.goal = [dir * 19, b.lane * 0.7];
    else b.goal = [dir * m.rng.range(-8, 22), m.rng.pick([-15, 0, 15]) + m.rng.range(-3, 3)];
    b.goal = safeGoal(m, u, b.goal[0], b.goal[1]);
  }
  return b.goal;
}

// nearest open point to (x,z) that is not inside walls and not inside the enemy base
function safeGoal(m, u, x, z) {
  const map = m.map, foe = foeOf(m, u), R = RULES.baseRadius + 2.5;
  const dx = foe ? x - foe[0] : 1e3, dz = foe ? z - foe[1] : 0, dd = hyp(dx, dz);
  if (foe && dd < R) { const k = R / (dd || 1); x = foe[0] + (dd ? dx * k : R); z = foe[1] + (dd ? dz * k : 0); }
  if (!solidAt(map, x, z, 1.3) && !lavaNear(map, x, z, 1.2)) return [x, z];
  for (let r = 1; r < 8; r++) for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    if (!solidAt(map, px, pz, 1.3) && !lavaNear(map, px, pz, 1.2) && (!foe || d2(px, pz, foe[0], foe[1]) > R * R)) return [px, pz];
  }
  return [x, z];
}

function leadPoint(u, e, speed, lead) {
  let px = e.x, pz = e.z;
  if (!(speed > 0)) return [px, pz];
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

function fightMove(m, u, b, D, role, tgt, td, w, los, now, hpFrac, underFire, enemies) {
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

  // allies: the one closest to me and the one closest to the target
  let near = null, nd = 1e9, front = null, fd = 1e9;
  if (role.tether || role.behind) for (const a of m.units) {
    if (a === u || a.team !== u.team || !a.alive) continue;
    const dm = hyp(a.x - u.x, a.z - u.z), dt = hyp(a.x - tgt.x, a.z - tgt.z);
    if (dm < nd) { nd = dm; near = a; }
    if (dt < fd && dm < 22) { fd = dt; front = a; }
  }
  // a lobbing weapon needs no line of sight: hold range instead of walking up to the target
  if (!los && !w.lob) return [0, 0, tgt.x, tgt.z, false];

  let radial = 0;
  if (td < lo) radial = role.kite ? -1 : -0.6;
  else if (td > hi) radial = 1;
  if (role.kite && td < lo * 0.7) radial = -1.3;
  let ax = 0, az = 0;
  if (near && role.behind && front && td < fd + 1.5 && hyp(front.x - u.x, front.z - u.z) > 2.5) {
    // I am ahead of every ally: drop back behind them
    const k = hyp(front.x - u.x, front.z - u.z) || 1;
    ax = (front.x - u.x) / k; az = (front.z - u.z) / k;
    if (radial > 0) radial = 0;
  } else if (near && role.tether && nd > role.tether) {
    const k = nd || 1;
    ax = (near.x - u.x) / k * 0.9; az = (near.z - u.z) / k * 0.9;
    if (radial > 0) radial *= 0.4;
  }
  const ice = iceAt(m.map, u.x, u.z);
  // strafing on ice mostly slides: do less of it, and drift toward the rim
  const amp = (role.strafe * (0.35 + 0.65 * D.dodge) + (underFire ? 0.2 : 0)) * (ice ? 0.35 : 1);
  const sx = -uz * b.strafe * amp, sz = ux * b.strafe * amp;
  if (ice) {
    const id = hyp(u.x - ice.x, u.z - ice.z) || 1;
    ax += (u.x - ice.x) / id * 0.6; az += (u.z - ice.z) / id * 0.6;
  }
  // mud slows: do not stand in it to fight
  const mud = mudProof(u) ? null : mudAt(m.map, u.x, u.z);
  if (mud) {
    const id = hyp(u.x - mud.x, u.z - mud.z) || 1;
    ax += (u.x - mud.x) / id * 0.9; az += (u.z - mud.z) / id * 0.9;
  }
  return [ux * radial + sx + ax, uz * radial + sz + az, null, null, false];
}

function findCover(m, u, tx, tz) {
  const map = m.map, foe = foeOf(m, u);
  let best = null, bd = 1e9;
  for (let k = 0; k < 12; k++) {
    const a = k * Math.PI / 6;
    for (let r = 3; r <= 6; r += 3) {
      const px = u.x + Math.cos(a) * r, pz = u.z + Math.sin(a) * r;
      if (solidAt(map, px, pz, u.moveRadius + 0.3)) continue;
      if (foe && d2(px, pz, foe[0], foe[1]) < (RULES.baseRadius + 1.5) ** 2) continue;
      if (lavaNear(map, px, pz, 1.2) || ventNear(m, px, pz, 0.6) || (!mudProof(u) && mudAt(map, px, pz))) continue;
      if (losClear(map, tx, tz, px, pz, 0.2)) continue;
      if (!losClear(map, u.x, u.z, px, pz, u.moveRadius * 0.7)) continue;
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
  if (dg < 7 && losClear(map, u.x, u.z, gx, gz, u.moveRadius * 0.9 + 0.1) && (mudProof(u) || !mudSeg(map, u.x, u.z, gx, gz))) {
    b.path = null;
    const dv = lavaDetour(map, u.x, u.z, gx, gz);
    return dv ? [dv[0] - u.x, dv[1] - u.z] : [gx - u.x, gz - u.z];
  }
  const moved = hyp(gx - b.pgx, gz - b.pgz);
  const since = now - b.pathT;
  if (!b.path || b.forceRepath || (since >= 0.5 && (moved > 2 || since > 2)) || (moved > 8 && since >= 0.2)) {
    b.path = findPathMud(m, u, u.x, u.z, gx, gz); b.pi = 0; b.pathT = now; b.pgx = gx; b.pgz = gz; b.forceRepath = false;
  }
  const p = b.path;
  while (b.pi < p.length - 1 && hyp(p[b.pi][0] - u.x, p[b.pi][1] - u.z) < 1.0) b.pi++;
  while (b.pi < p.length - 1 && losClear(map, u.x, u.z, p[b.pi + 1][0], p[b.pi + 1][1], u.moveRadius + 0.1)) b.pi++;
  const wp = p[b.pi];
  if (b.pi >= p.length - 1 && hyp(wp[0] - u.x, wp[1] - u.z) < 0.8) return null;
  const dv = lavaDetour(map, u.x, u.z, wp[0], wp[1]);
  return dv ? [dv[0] - u.x, dv[1] - u.z] : [wp[0] - u.x, wp[1] - u.z];
}

function inFoe(m, u, x, z) {
  const foe = foeOf(m, u), R = RULES.baseRadius + 0.6;
  if (!foe) return false;
  const dn = d2(x, z, foe[0], foe[1]);
  return dn < R * R && dn <= d2(u.x, u.z, foe[0], foe[1]) + 1e-6;
}

// Keep the intended direction unless it runs into a wall or the enemy base within ~1.6 m; then rotate to the nearest free heading.
function freeDir(m, u, b, dx, dz) {
  const len = hyp(dx, dz);
  if (len < 1e-6) return [0, 0];
  const ux = dx / len, uz = dz / len, map = m.map, rr = u.radius * 0.8;
  // on ice the velocity follows the command slowly: look further ahead and give lava a wider berth
  const ice = iceAt(map, u.x, u.z), look = ice ? 3.2 : 1.6, pad = ice ? 1.6 : 0.5;
  for (let i = 0; i < STEER.length; i++) {
    const a = STEER[i] * b.ss, c = Math.cos(a), s = Math.sin(a);
    const vx = ux * c - uz * s, vz = ux * s + uz * c;
    const px = u.x + vx * look, pz = u.z + vz * look;
    if (solidAt(map, px, pz, rr) || inFoe(m, u, px, pz) || propAt(m, px, pz, rr)) continue;
    if (lavaNear(map, px, pz, pad) || lavaNear(map, u.x + vx * look * 0.5, u.z + vz * look * 0.5, pad)) continue;
    if (m.vents.length) { let bad = false; for (const v of m.vents) if (v.warn && d2(px, pz, v.x, v.z) < (v.r + 0.4) * (v.r + 0.4)) bad = true; if (bad) continue; }
    if (i > 0 && i < 3) b.ss = a >= 0 ? 1 : -1;
    return [vx, vz];
  }
  return [ux, uz];
}

function propAt(m, x, z, r) {
  for (const p of m.props) if (p.alive && d2(p.x, p.z, x, z) < (p.r + r) * (p.r + r)) return true;
  for (const zn of m.zones) {
    if (zn.kind !== 'wall') continue;
    for (const q of zn.pts) if (d2(q[0], q[1], x, z) < (zn.r + r) * (zn.r + r)) return true;
  }
  return false;
}

function dodgeZones(m, u, b, D) {
  const pd = m.mode === 'trum' ? Math.max(D.dodge, 0.55) : D.dodge;   // against the boss every bot at least tries
  if (pd <= 0) return null;
  let ax = 0, az = 0, any = false;
  for (const z of m.zones) {
    if (z.team === u.team) continue;
    let rad = 0;
    if (z.kind === 'strike' && z.delay > 0.12) rad = z.r + 0.6;
    else if (z.kind === 'mine' && z.delay <= 0) rad = z.r + 0.8;
    else if (z.kind === 'field' && (z.dps > 0 || z.pull > 0)) rad = z.r + 0.4;
    else continue;
    const dd = hyp(u.x - z.x, u.z - z.z);
    if (dd > rad + u.radius) continue;
    let flag = b.dodge[z.id];
    if (flag === undefined) flag = b.dodge[z.id] = m.rng() < pd;
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
    if (!tgt || !los || (c.hpFrac < 0.3 && !c.role.boss)) return false;
    if (c.m.mode === 'trum' && !c.role.boss) return false;   // charging a boss only lands us in its nova ring
    const reach = s.dist + tgt.radius * 0.6;
    if (td < u.radius + tgt.radius + 1.6 || td > reach) return false;
    const a = Math.atan2(tgt.z - u.z, tgt.x - u.x);
    if (inFoe(c.m, u, u.x + Math.cos(a) * s.dist, u.z + Math.sin(a) * s.dist)) return false;
    if (lavaSeg(c.m.map, u.x, u.z, u.x + Math.cos(a) * s.dist, u.z + Math.sin(a) * s.dist, 0.5)) return false;
    c.b.sk.aim = a;
    return true;
  },
  nova(c, s) {
    const { u, tgt } = c;
    let n = 0;
    for (const e of c.enemies) if (hyp(e.x - u.x, e.z - u.z) < s.radius * (c.role.boss ? 0.95 : 0.85)) n++;
    if (c.role.boss) return n >= 2 || (n >= 1 && c.D.skill >= 0.9);   // the ring is telegraphed: worth it on two, or on one for a hard boss
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
  buff(c, s) {
    const { u, tgt, td, w } = c;
    if (s.stealth) {
      // flanker: vanish before closing in, or to break contact when hurt and hunted
      if (u.stealthT > 0 || u.hasteT > 0) return false;
      if (c.state === 'retreat' || (c.underFire && c.hpFrac < 0.55)) return c.enemies.length > 0;
      return !!tgt && td > w.range * 0.7 && td < w.range + 9 && c.state !== 'grab';
    }
    if (u.hasteT > 0 || u.rapidT > 0) return false;
    if (c.state === 'retreat') return c.enemies.length > 0;
    return !!tgt && td < w.range + 4 && c.state !== 'grab';
  },
  barrage(c, s) {
    const { u, tgt, td } = c;
    if (s.line) return lineBarrage(c, s);
    if (c.role.boss) {
      // the densest group within reach
      const g = cluster(c.enemies.filter((e) => hyp(e.x - u.x, e.z - u.z) <= s.cast + 3), s.radius);
      if (!g) return false;
      const d = hyp(g.x - u.x, g.z - u.z), k = d > s.cast ? s.cast / d : 1;
      c.b.sk.x = u.x + (g.x - u.x) * k; c.b.sk.z = u.z + (g.z - u.z) * k;
      return true;
    }
    if (!tgt || td > s.cast || td < 3.5) return false;
    let cx = 0, cz = 0, n = 0;
    const p = leadPoint(u, { x: tgt.x, z: tgt.z, vx: tgt.vx, vz: tgt.vz }, 6, c.D.lead * 0.6);
    for (const e of c.enemies) if (hyp(e.x - tgt.x, e.z - tgt.z) < s.radius) { cx += e.x; cz += e.z; n++; }
    if (n) { c.b.sk.x = (p[0] + cx / n) / 2; c.b.sk.z = (p[1] + cz / n) / 2; } else { c.b.sk.x = p[0]; c.b.sk.z = p[1]; }
    return true;
  },
  minefield(c, s) {
    const { u, tgt, td, m } = c;
    if (!tgt || td < 3 || td > s.cast + 3) return false;
    const g = cluster(c.enemies.filter((e) => hyp(e.x - u.x, e.z - u.z) <= s.cast + 4), s.radius * 0.8);
    let px, pz;
    if (g && g.n >= 2) { px = g.x; pz = g.z; }
    else {
      // a lone enemy: only where it has to squeeze through, or to cover a retreat
      const p = leadPoint(u, tgt, 8, c.D.lead * 0.7);
      if (!(c.state === 'retreat' || c.hpFrac < 0.5 || chokepoint(m.map, p[0], p[1]))) return false;
      px = p[0]; pz = p[1];
    }
    const d = hyp(px - u.x, pz - u.z);
    if (d > s.cast + 1.5 || d < 2.5) return false;
    c.b.sk.x = px; c.b.sk.z = pz;
    return true;
  },
  turret(c, s) {
    const { u, tgt, td, m } = c;
    for (const z of m.zones) if (z.kind === 'turret' && z.owner === u.id) return false;
    if (!tgt || td > s.range + s.cast + 1 || td < 3) return false;
    // as far toward the enemy as the cast allows, but keep the target inside the turret's range
    const a = Math.atan2(tgt.z - u.z, tgt.x - u.x);
    for (let k = Math.min(s.cast, Math.max(2, td - 4)); k >= 1.5; k -= 1) {
      const x = u.x + Math.cos(a) * k, z = u.z + Math.sin(a) * k;
      if (solidAt(m.map, x, z, 1.0) || inFoe(m, u, x, z)) continue;
      if (hyp(tgt.x - x, tgt.z - z) > s.range) continue;
      c.b.sk.x = x; c.b.sk.z = z;
      return true;
    }
    return false;
  },
  wall(c, s) {
    const { u, tgt, td, m } = c;
    if (!tgt || td > 15 || td < 3) return false;
    const retreating = c.state === 'retreat' || (c.hpFrac < 0.4 && c.underFire);
    const chased = c.near - c.allyNear >= 1 && c.underFire;
    // winning: our own shots must not run into the wall
    const winning = c.allyNear + 1 >= c.near && !retreating;
    if (winning || !(retreating || chased)) return false;
    const a = Math.atan2(tgt.z - u.z, tgt.x - u.x);
    const cx = u.x + Math.cos(a) * s.cast, cz = u.z + Math.sin(a) * s.cast, half = (s.n - 1) / 2 * s.gap + 1.5;
    for (const o of m.units) if (o !== u && o.team === u.team && o.alive && hyp(o.x - cx, o.z - cz) < half) return false;
    if (solidAt(m.map, cx, cz, 0.6)) return false;
    c.b.sk.aim = a;
    return true;
  },
  recoil(c, s) {
    const { u, m } = c;
    let near = null, nd = 1e9;
    for (const e of c.enemies) { const d = hyp(e.x - u.x, e.z - u.z); if (d < nd) { nd = d; near = e; } }
    if (!near || nd > s.radius * 0.9) return false;
    const base = Math.atan2(near.z - u.z, near.x - u.x);
    for (const da of [0, 0.6, -0.6, 1.2, -1.2]) {
      const a = base + da, ex = u.x - Math.cos(a) * s.dist, ez = u.z - Math.sin(a) * s.dist;
      if (solidAt(m.map, ex, ez, u.moveRadius * 0.8) || inFoe(m, u, ex, ez) || lavaSeg(m.map, u.x, u.z, ex, ez, 0.5)) continue;
      if (!losClear(m.map, u.x, u.z, ex, ez, u.moveRadius * 0.7)) continue;
      c.b.sk.aim = a;   // the recoil throws the caster opposite to its aim
      return true;
    }
    return false;
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
      if (solidAt(map, ex, ez, u.moveRadius * 0.8) || inFoe(c.m, u, ex, ez) || lavaSeg(map, u.x, u.z, ex, ez, 0.5)) continue;
      if (!losClear(map, u.x, u.z, ex, ez, u.moveRadius * 0.7)) continue;
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
    const { u, tgt, td, m } = c;
    if (s.hide) return smokeSkill(c, s);
    if (s.pull) return pullSkill(c, s);
    if (s.hps || s.at === 'self') {
      let miss = 0;
      for (const a of c.m.units) {
        if (a.team !== u.team || !a.alive || d2(a.x, a.z, u.x, u.z) > s.radius * s.radius) continue;
        miss += 1 - a.hp / a.maxHp;
      }
      return miss >= 0.5;
    }
    if (!tgt || td > s.cast + 1 || td < 3) return false;
    const g = cluster(c.enemies.filter((e) => hyp(e.x - u.x, e.z - u.z) <= s.cast + 2), s.radius * 0.8);
    if (g && g.n >= 2 && hyp(g.x - u.x, g.z - u.z) <= s.cast + 1) {
      const k = Math.min(1, s.cast / (hyp(g.x - u.x, g.z - u.z) || 1));
      c.b.sk.x = u.x + (g.x - u.x) * k; c.b.sk.z = u.z + (g.z - u.z) * k;
      return true;
    }
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
    if (c.m.mode === 'tudo') return c.underFire && c.hpFrac < 0.7;   // no allies: a dome only ever covers me, and only when I am the one being shot
    return hurt >= 2 || (hurt >= 1 && c.hpFrac < 0.55 && c.underFire);
  },
};

// Densest group of enemies within r of one of them: { x, z, n } (centre of the group) or null.
function cluster(list, r) {
  let best = null;
  for (const e of list) {
    let n = 0, cx = 0, cz = 0;
    for (const o of list) if (hyp(o.x - e.x, o.z - e.z) <= r) { n++; cx += o.x; cz += o.z; }
    if (!best || n > best.n) best = { x: cx / n, z: cz / n, n };
  }
  return best;
}

// A spot is a chokepoint when walls close in on three or more of eight sides.
function chokepoint(map, x, z) {
  let blocked = 0;
  for (let k = 0; k < 8; k++) if (solidAt(map, x + Math.cos(k * Math.PI / 4) * 2.5, z + Math.sin(k * Math.PI / 4) * 2.5, 0.8)) blocked++;
  return blocked >= 3;
}

// Line barrage: strikes march along the aim direction from the aim point, so aim along the enemy line.
function lineBarrage(c, s) {
  const { u, tgt, td } = c;
  if (!tgt || td < 3.5) return false;
  const g = cluster(c.enemies.filter((e) => hyp(e.x - u.x, e.z - u.z) <= s.cast + 4), 6);
  if (!g) return false;
  if (g.n < 2 && !(tgt.hp <= s.dmg * 2 || c.D.skill >= 0.9)) return false;
  const mem = c.enemies.filter((e) => hyp(e.x - g.x, e.z - g.z) <= 6);
  let a = Math.atan2(tgt.z - u.z, tgt.x - u.x), far = 0;
  for (const p of mem) for (const q of mem) {
    const d = hyp(p.x - q.x, p.z - q.z);
    if (d > far) { far = d; a = Math.atan2(q.z - p.z, q.x - p.x); }
  }
  const lead = c.D.lead * 0.5;
  let px = g.x + (tgt.vx || 0) * lead, pz = g.z + (tgt.vz || 0) * lead;
  const d = hyp(px - u.x, pz - u.z);
  if (d > s.cast + 2) return false;
  if (d > s.cast) { px = u.x + (px - u.x) * s.cast / d; pz = u.z + (pz - u.z) * s.cast / d; }
  c.b.sk.x = px; c.b.sk.z = pz; c.b.sk.aim = a;
  return true;
}

// Smoke: drop it on myself, or on a badly hurt ally under fire, when hunted or backing off.
function smokeSkill(c, s) {
  const { u, m } = c;
  if (!c.enemies.length || u.bush >= 0) return false;
  if (!(c.state === 'retreat' || (c.underFire && c.hpFrac < 0.8))) return false;
  let px = u.x, pz = u.z, worst = c.hpFrac;
  for (const a of m.units) {
    if (a === u || a.team !== u.team || !a.alive || a.combatT > 1.2 || a.bush >= 0) continue;
    const f = a.hp / a.maxHp;
    if (f < 0.45 && f < worst - 0.1 && hyp(a.x - u.x, a.z - u.z) <= s.cast) { worst = f; px = a.x; pz = a.z; }
  }
  for (const z of m.zones) if (z.kind === 'field' && z.hide && z.team === u.team && hyp(z.x - px, z.z - pz) < z.r * 0.6) return false;
  c.b.sk.x = px; c.b.sk.z = pz;
  return true;
}

// Pull field: on two or more enemies, or on a spot where a strike of ours is about to land, or to pin a nearly dead one.
function pullSkill(c, s) {
  const { u, tgt, td, m } = c;
  for (const z of m.zones) {
    if (z.kind !== 'strike' || z.team !== u.team || z.delay < 0.35 || z.delay > 2.2) continue;
    if (hyp(z.x - u.x, z.z - u.z) > s.cast + 1) continue;
    for (const e of c.enemies) if (hyp(e.x - z.x, e.z - z.z) < s.radius * 0.8 + z.r * 0.5) { c.b.sk.x = z.x; c.b.sk.z = z.z; return true; }
  }
  const g = cluster(c.enemies.filter((e) => hyp(e.x - u.x, e.z - u.z) <= s.cast + 2), s.radius * 0.8);
  if (g && g.n >= 2) {
    const d = hyp(g.x - u.x, g.z - u.z);
    if (d > s.cast + 1 || d < 3) return false;
    const k = Math.min(1, s.cast / (d || 1));
    c.b.sk.x = u.x + (g.x - u.x) * k; c.b.sk.z = u.z + (g.z - u.z) * k;
    return true;
  }
  if (tgt && td >= 3 && td <= s.cast && tgt.hp < tgt.maxHp * 0.35) {
    const p = leadPoint(u, tgt, 12, c.D.lead * 0.5);
    c.b.sk.x = p[0]; c.b.sk.z = p[1];
    return true;
  }
  return false;
}

const TOWER_SKILLS = { volley: 1, barrage: 1, beam: 1 };
function chooseSkill(c) {
  const { u, b, D, m, role } = c;
  if (u.cast || u.dash || u.stunT > 0) return null;
  const sk = b.sk;
  const p = 1 - Math.pow(1 - Math.min(0.999, D.skill), 1.5 * TICK);
  for (let i = 0; i < 3; i++) {
    if (u.cd[SLOTS[i]] > 0) continue;
    const s = u.def.skills[i], fn = SKILL_AI[s.do];
    if (!fn) continue;
    // a tower in reach is a target for the damage skills that fire at a point (rockets, shell barrage, the beam)
    const onTower = !c.tgt && c.ttgt && TOWER_SKILLS[s.do];
    if (onTower) { c.tgt = c.ttgt; c.td = c.ttd; c.los = c.tlos; }
    sk.x = c.tgt ? c.tgt.x : u.x; sk.z = c.tgt ? c.tgt.z : u.z; sk.aim = null; sk.mx = null; sk.mz = null;
    const ok = fn(c, s);
    if (onTower) { c.tgt = null; c.td = 1e9; c.los = false; }
    if (!ok) continue;
    if (D.skill < 1 && m.rng() > p * role.eager[i]) continue;
    sk.slot = i;
    return sk;
  }
  return null;
}

// ---- spacing --------------------------------------------------------------------------------------------------------------------
// Mechs no longer push each other apart, so a bot moves itself off allies that are closer than their radii plus a margin.
function spacing(m, u) {
  let ax = 0, az = 0;
  for (const a of m.units) {
    if (a === u || a.team !== u.team || !a.alive) continue;
    const dx = u.x - a.x, dz = u.z - a.z, d = hyp(dx, dz), want = u.radius + a.radius + 0.7;
    if (d >= want) continue;
    const k = (want - d) / want;
    if (d > 1e-3) { ax += dx / d * k; az += dz / d * k; } else { ax += Math.cos(u.id * 2.4) * k; az += Math.sin(u.id * 2.4) * k; }
  }
  return [ax * 3, az * 3];
}

// ---- base mode (nha): objective layer ---------------------------------------------------------------------------------------------
// attack: push as a group to an enemy tower (a sub tower first, split by slot, then the weaker; the main tower only once it is open)
// defend: an own tower is being hit or has enemies in its range: the nearest bots fall back to fight under it (everyone when the main is open)
// wave:   just respawned while the team is mostly dead: wait at the rally point so the wave pushes together
const nhaR = (m) => m.rule.tower.range;
const towerPseudo = (t) => { const p = pseudo(-200 - t.id, t.x, t.z, t.r, t.hp, t.maxHp); p.tower = t; return p; };

function underTower(m, team, x, z, pad) {
  const R = nhaR(m) + pad;
  for (const t of m.towers) if (t.alive && t.team !== team && d2(x, z, t.x, t.z) < R * R) return true;
  return false;
}

// May I step into tower t's range now? At least one ally (best the tank) already there, or the tower is busy shooting an ally.
function entryOK(m, u, D, t) {
  if (D.skill < 0.5) return true;   // easy bots dive carelessly
  const R = nhaR(m) + 0.8;
  let n = 0, tank = false;
  for (const a of m.units) {
    if (a === u || a.team !== u.team || !a.alive || d2(a.x, a.z, t.x, t.z) > R * R) continue;
    if (a.brain && a.brain.state === 'retreat') continue;
    n++; if (a.def.roleKey === 'tank') tank = true;
  }
  const charging = t.target >= 0 && t.target !== u.id && m.units[t.target].team === u.team;
  // the other team is two mechs down (respawning): nobody is there to hold the tower's aggro against, go in together
  let mineAlive = 0, foeAlive = 0;
  for (const a of m.units) if (a.alive && !a.def.boss) { if (a.team === u.team) mineAlive++; else foeAlive++; }
  if (mineAlive - foeAlive >= 2) return true;
  if (D.skill >= 0.9) return tank || n >= 2 || (charging && n >= 1);
  return n >= 1 || charging;
}

const ROT_TRY = [0, 0.5, -0.5, 1.0, -1.0];   // sides of the tower to try for a clear shot (never round the back: the way there is inside its range)
function nhaPlan(m, u, b, D, role, w, now) {
  const R = nhaR(m), own = baseOf(m, u.team) || [0, 0];
  const mine = [], foes = [];
  for (const t of m.towers) {
    if (t.team === u.team) {
      const p = b.twHp[t.id];
      if (p !== undefined && t.hp < p - 0.5) b.twHit[t.id] = now;
      b.twHp[t.id] = t.hp;
      if (t.alive) mine.push(t);
    } else if (t.alive) foes.push(t);
  }
  const smart = D.skill >= 0.5, hard = D.skill >= 0.9;
  let hunted = false;
  for (const t of foes) if (t.target === u.id) hunted = true;
  const P = { kind: 'attack', T: null, defT: null, hunted, stepOut: hard ? 0.45 : smart ? 0.38 : 0, allow: true, outside: role === ROLE.sniper || role === ROLE.artillery, stage: null, stand: null };

  // defend
  let defT = null, dsc = 0, dnear = 0;
  for (const t of mine) {
    const hit = now - (b.twHit[t.id] ?? -99) < 3;
    let near = 0;
    for (const e of m.units) if (e.team !== u.team && e.alive && d2(e.x, e.z, t.x, t.z) < (R + 2) * (R + 2) && visibleTo(m, e, u.team)) near++;
    if (!hit && !near) continue;
    const open = towerOpen(m, t);
    const sc = (t.kind === 'main' && open && near ? 100 : 0) + near * 10 + (hit ? 6 : 0) + (1 - t.hp / t.maxHp) * 4;
    if (sc > dsc) { dsc = sc; defT = t; dnear = near; }
  }
  if (defT) {
    const mainOpen = defT.kind === 'main' && towerOpen(m, defT) && dnear > 0;
    const everyone = mainOpen && smart;
    const nd = hard ? 3 : smart ? (dnear >= 3 ? 3 : 2) : (mainOpen ? 1 : 0);
    let rank = 0;
    const dm = d2(u.x, u.z, defT.x, defT.z);
    for (const a of m.units) {
      if (a === u || a.team !== u.team || !a.alive || a.def.boss) continue;
      const da = d2(a.x, a.z, defT.x, defT.z);
      if (da < dm || (da === dm && a.id < u.id)) rank++;
    }
    if (everyone || rank < nd) { P.kind = 'defend'; P.defT = defT; return P; }
  }

  // wave: respawned into a team that was just wiped
  if (smart && now - b.born < 12) {
    let alive = 0, soon = 0;
    for (const a of m.units) if (a.team === u.team && !a.def.boss) { if (a.alive) alive++; else if (a.respawnT <= 9) soon++; }
    if (alive <= 2 && soon >= 1) { P.kind = 'wave'; return P; }
  }

  // attack: which tower
  const subs = foes.filter((t) => t.kind === 'sub');
  let OT = b.otId >= 0 ? m.towers[b.otId] : null;
  if (!OT || !OT.alive || OT.team === u.team) OT = null;
  if (!subs.length) OT = foes.find((t) => t.kind === 'main') || null;
  else {
    const split = m.time < 50 || subs.length < 2;
    let cand = split ? (subs.length === 2 ? subs[u.slot < 3 ? 0 : 1] : subs[0]) : (subs[0].hp <= subs[1].hp ? subs[0] : subs[1]);
    if (!OT || OT.kind === 'main') OT = cand;
    else if (!split && cand !== OT && cand.hp < OT.hp * 0.7) OT = cand;
  }
  b.otId = OT ? OT.id : -1;
  if (!OT) return P;
  P.T = OT;
  if (b.spotFor !== OT.id) { b.rot = 0; b.rotN = 0; b.idleT = now; }
  if (b.spotFor !== OT.id || now - b.spotT > 0.8) { b.spotFor = OT.id; b.spotT = now; nhaSpots(m, u, b, P, w, R, own); }
  P.stage = b.stage; P.stand = b.stand;

  let allow = entryOK(m, u, D, OT);
  if (!allow && !P.outside) {
    // nobody is in range yet: the tankiest healthy bot leads once enough of the group is with it, or when waiting got too long
    const near = hyp(u.x - P.stage[0], u.z - P.stage[1]) < 6 || d2(u.x, u.z, OT.x, OT.z) < (R + 9) * (R + 9);
    if (near) { if (b.waitT < 0) b.waitT = now; } else b.waitT = -1;
    const waited = b.waitT >= 0 ? now - b.waitT : 0;
    let lead = null, ls = -1, others = 0, soon = 0;
    for (const a of m.units) {
      if (a.team !== u.team || a.def.boss) continue;
      if (!a.alive) { if (a.respawnT <= 10) soon++; continue; }
      if (a !== u) others++;
      if ((a.brain && a.brain.state === 'retreat') || a.hp < a.maxHp * 0.6) continue;
      const sc = a.maxHp - a.id * 1e-3;
      if (sc > ls) { ls = sc; lead = a; }
    }
    let with_ = 0;
    for (const a of m.units) if (a !== u && a.team === u.team && a.alive && d2(a.x, a.z, u.x, u.z) < 400 && !(a.brain && a.brain.state === 'retreat')) with_++;
    // alone (nobody alive or about to respawn) I never dive; with company, waiting too long breaks the deadlock
    const company = others + soon;
    if (lead === u && with_ >= Math.max(1, Math.min(1, company))) allow = true;
    if (company > 0 && waited > (hard ? 5 : 7)) allow = true;
  } else b.waitT = -1;
  P.allow = allow;
  return P;
}

// Where to wait (stage: just outside the tower's range) and where to shoot from (stand), spread around the tower by slot so nobody stacks.
function nhaSpots(m, u, b, P, w, R, own) {
  const OT = P.T, map = m.map, imm = mudProof(u);
  const a0 = Math.atan2(own[1] - OT.z, own[0] - OT.x) + b.rot;
  const ok = (x, z) => !solidAt(map, x, z, u.moveRadius + 0.3) && !lavaNear(map, x, z, u.moveRadius + 0.9) && !ventNear(m, x, z, u.moveRadius + 0.4) && (imm || !mudAt(map, x, z)) && !m.towers.some((t) => t !== OT && t.alive && t.team !== u.team && hyp(x - t.x, z - t.z) < (P.outside ? R + 1.6 : t.r + 2.6));
  const pick = (dist, lat, needLos, grow = 0) => {
    let fb = null;
    for (let j = 0; j < (needLos && grow ? 3 : 1); j++) for (let k = 0; k < 15; k++) {
      const d = dist + j * grow, a = a0 + lat + ((k + 1) >> 1) * 0.28 * (k & 1 ? 1 : -1), x = OT.x + Math.cos(a) * d, z = OT.z + Math.sin(a) * d;
      if (!ok(x, z)) continue;
      if (!fb) fb = [x, z];
      if (needLos && (!losClear(map, x, z, OT.x, OT.z, 0.2) || propBlocks(m, x, z, OT.x, OT.z))) continue;
      return [x, z];
    }
    return fb || [OT.x + Math.cos(a0 + lat) * dist, OT.z + Math.sin(a0 + lat) * dist];
  };
  b.stage = pick(R + 5, (u.slot - 2) * 0.3, false);
  const dd = P.outside ? Math.max(R + 1.6, Math.min(R + 3.5, w.range * 0.8)) : Math.max(OT.r + 2.8, Math.min(R - 1.8, w.range * 0.72));
  b.stand = pick(dd, (u.slot - 2) * (P.outside ? 0.2 : 0.42), !w.lob, P.outside ? 1.5 : 0);
}

// The nearest enemy tower that can be hurt now (main towers only when open: no shot is wasted on a blocked one) and that my weapon reaches.
function pickTowerTarget(m, u, w) {
  let best = null, bd = 1e9;
  for (const t of m.towers) {
    if (!t.alive || t.team === u.team || !towerOpen(m, t)) continue;
    const d = hyp(t.x - u.x, t.z - u.z);
    if (d - t.r * 0.5 > w.range - 0.4 || d >= bd) continue;
    if (!w.lob && (!losClear(m.map, u.x, u.z, t.x, t.z, 0.2) || wallBlocks(m, u.x, u.z, t.x, t.z, 0.2))) continue;
    bd = d; best = t;
  }
  return best ? towerPseudo(best) : null;
}

// Fight mechs first; shoot a tower when no enemy mech is within 8 m of me (never when I am defending).
function nhaTarget(m, u, b, np, mech, w, enemies, D, now) {
  const mechOK = !!mech && canHit(m, u, mech, w, D);
  const tt = np.kind === 'defend' ? null : pickTowerTarget(m, u, w);
  if (tt) {
    let contest = false;
    for (const e of enemies) if (d2(e.x, e.z, u.x, u.z) < 64) { contest = true; break; }
    if (!mechOK || !contest) return tt;
  }
  if (mechOK) return mech;
  const tur = pickTurret(m, u, w);
  if (tur) return tur;
  if (!mech && w.lob) return pickGhost(m, u, b, w, now);
  return mech;
}

function nhaMove(m, u, b, D, role, np, tgt, td, w, los, now, hpFrac, underFire, enemies) {
  const R = nhaR(m), own = baseOf(m, u.team) || [0, 0];
  const mechTgt = tgt && !tgt.pseudo;
  if (np.kind === 'wave') {
    const L = hyp(own[0], own[1]) || 1, ox = -own[0] / L, oz = -own[1] / L;
    const g = safeGoal(m, u, own[0] + ox * 9 - oz * (u.slot - 2) * 2.4, own[1] + oz * 9 + ox * (u.slot - 2) * 2.4);
    return hyp(g[0] - u.x, g[1] - u.z) < 1.3 ? [0, 0, null, null, true] : [0, 0, g[0], g[1], false];
  }
  if (np.kind === 'defend') {
    const T = np.defT, leash = R + 3.5, dT = hyp(u.x - T.x, u.z - T.z);
    let ne = null, nd = 1e9;
    for (const e of enemies) { const d = hyp(e.x - T.x, e.z - T.z); if (d < nd) { nd = d; ne = e; } }
    const back = () => {
      // a spot between the tower and the threat, inside the tower's range
      const dir = ne ? Math.atan2(ne.z - T.z, ne.x - T.x) : Math.atan2(-T.z, -T.x);
      const g = safeGoal(m, u, T.x + Math.cos(dir + (u.slot - 2) * 0.35) * 5, T.z + Math.sin(dir + (u.slot - 2) * 0.35) * 5);
      return hyp(g[0] - u.x, g[1] - u.z) < 1 ? [0, 0, null, null, true] : [0, 0, g[0], g[1], false];
    };
    if (mechTgt) {
      if (dT > leash) return back();
      const fm = fightMove(m, u, b, D, role, tgt, td, w, los, now, hpFrac, underFire, enemies);
      if (fm[2] !== null && hyp(fm[2] - T.x, fm[3] - T.z) > leash) return back();
      return fm;
    }
    return back();
  }
  if (!np.T) return [0, 0, 0, 0, false];
  // an enemy mech within 8 m contests me: fight it. A farther one is shot at on the way (see nhaTarget), the tower stays the goal.
  if (mechTgt && (td < 8 || !np.T)) return fightMove(m, u, b, D, role, tgt, td, w, los, now, hpFrac, underFire, enemies);
  const go = np.allow || np.outside;
  const S = go ? np.stand : np.stage;
  const near = hyp(S[0] - u.x, S[1] - u.z) < 1.0;
  // standing at the firing spot with nothing to shoot for a while (a prop or wall in the way): try another side of the tower
  if (tgt || !go || !near) b.idleT = now;
  else if (now - b.idleT > 1.6) { b.rotN = (b.rotN || 0) + 1; b.rot = ROT_TRY[b.rotN % ROT_TRY.length]; b.idleT = now; b.spotT = -9; }
  if (tgt && tgt.pseudo && tgt.tower && (near || !go)) {
    // shooting the tower: strafe while inside its range (its shot is aimed at where I am now), otherwise hold
    const T = tgt.tower, d = hyp(u.x - T.x, u.z - T.z);
    if (d < R + 0.5 && D.dodge > 0.2) {
      if (now >= b.strafeNext) { b.strafe = m.rng() < 0.5 ? -1 : 1; b.strafeNext = now + 0.7 + m.rng() * 0.9; }
      const amp = (0.35 + 0.65 * D.dodge) * 0.9;
      return [-(T.z - u.z) / d * b.strafe * amp, (T.x - u.x) / d * b.strafe * amp, null, null, false];
    }
    return [0, 0, null, null, true];
  }
  return near ? [0, 0, null, null, true] : [0, 0, S[0], S[1], false];
}

// Stay out of an enemy tower's range unless the group is already in it. Easy bots have no guard.
function towerGuard(m, u, D, np, mx, mz) {
  if (D.skill < 0.5) return null;
  const R = nhaR(m);
  let ox = mx, oz = mz, hit = false;
  for (const t of m.towers) {
    if (!t.alive || t.team === u.team) continue;
    const dx = u.x - t.x, dz = u.z - t.z, d = hyp(dx, dz);
    if (d > R + 4.5) continue;
    // a sniper or artillery never goes in (its stand-off is range + 1.2 m, whatever the path to the firing spot does); the rest need the group
    const keep = np.outside;
    if (!keep && (np.T === t ? np.allow : entryOK(m, u, D, t))) continue;
    const lim = keep ? R + 1.2 : R + 0.1;
    const nx = dx / (d || 1), nz = dz / (d || 1), inward = -(ox * nx + oz * nz);
    if (d >= lim) {
      if (inward > 0 && d - inward * 1.6 < lim + 0.3) { ox += nx * inward; oz += nz * inward; hit = true; }
    } else { if (inward > 0) { ox += nx * inward; oz += nz * inward; } ox += nx * 1.2; oz += nz * 1.2; hit = true; }
  }
  return hit ? [ox, oz] : null;
}
