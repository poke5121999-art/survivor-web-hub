// Bot AI. One call per bot per tick, pure: reads the match, keeps its memory in u.brain, draws randomness only from m.rng.
// States: push (go toward the enemy / the lane objective), fight (hold a preferred range and shoot),
// retreat (heal at base or a heal crate), grab (drive onto an airdrop crate).
// Mode nha (two-sided base) adds an objective layer on top: nhaPlan() picks attack / defend / wave for each bot, nhaMove() walks it,
// towerGuard() keeps it out of an enemy tower's range unless the group is already there. Mechs do not collide, so every bot keeps its own spacing.

import { TICK, RULES, DIFFICULTY } from './data.js';
import { visibleTo, towerOpen, weaponRange, weaponOf, turnRate, skillReady, ownObject, locked, chaosOrbs } from './sim.js';
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
  // outside: in nha it stands outside every tower's range and shoots the tower from there. siege plants (see SKILL_AI.stance) and reaches 24 m planted.
  siege:    { pref: [0.6, 0.95], kite: true, peek: false, strafe: 0.2, follow: true, behind: true, tether: 12, outside: true, standFar: 4.5, eager: [1, 1, 1] },
  hooker:   { pref: [0.35, 0.8], kite: false, peek: false, strafe: 0.7, follow: false, eager: [1, 1, 1] },
  guardian: { pref: [0.35, 0.75], kite: false, peek: false, strafe: 0.5, follow: true, tether: 8, eager: [1, 1, 1] },
  bruiser:  { pref: [0.25, 0.7], kite: false, peek: false, strafe: 1, follow: false, lowHp: 0.5, eager: [1, 1, 1] },
  trickster: { pref: [0.5, 0.9], kite: true, peek: false, strafe: 1.2, follow: false, isolate: 0.6, lowHp: 0.6, cautious: 0.08, eager: [1, 1, 1] },
  // medic: heal: the ray goes to the most hurt ally in reach; stays with the group
  medic:    { pref: [0.8, 1.1], kite: true, peek: false, strafe: 0.8, follow: true, behind: true, tether: 6, heal: true, cautious: 0.12, eager: [1, 1, 1] },
  trickshot: { pref: [0.5, 0.9], kite: true, peek: false, strafe: 0.9, follow: false, eager: [1, 1, 1] },
  lancer:   { pref: [0.55, 0.95], kite: true, peek: false, strafe: 0.5, follow: false, eager: [1, 1, 1] },
};
ROLE.sniper.outside = true; ROLE.artillery.outside = true;
// chiem: a lobbing or planted mech stands on the point instead of behind its allies, so its team has a body there to contest it
const ROLE_CHIEM = { artillery: { ...ROLE.artillery, behind: false, tether: 0 }, siege: { ...ROLE.siege, behind: false, tether: 0 } };
const LANES = [0, -14, 14, 0, 14];
// Lateral lane per slot for a small match: one mech takes the middle, two split the sides, three use the first three lanes above.
const LANES_SMALL = { 1: [0], 2: [-10, 10] };
const SLOTS = ['s1', 's2', 'ult'];
const STEER = [0, 0.5, -0.5, 1.0, -1.0, 1.7, -1.7];
const NO = { mx: 0, mz: 0, aim: 0, fire: false, s1: false, s2: false, ult: false, heal: false, tx: 0, tz: 0 };

const hyp = Math.hypot;
const d2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const turnTo = (a, b, max) => a + Math.max(-max, Math.min(max, angDiff(a, b)));

function newBrain(m, u) {
  const lane = m.size <= 2 ? LANES_SMALL[m.size][u.slot % m.size] : u.slot === 4 ? (m.rng() < 0.5 ? -14 : 14) : LANES[u.slot % 5];
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
    enemies: [], sk: { x: 0, z: 0, aim: null, mx: null, mz: null, tol: 0.12 },
    pw: null, scored: [], blockId: -1, blockT: -9, wasStance: false, stanceAt: -9, pIdle: 0, pend: 0, pendT: -9, healId: -1, chargeAt: -9,
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
  const role = (m.mode === 'chiem' && m.size > 3 && ROLE_CHIEM[u.def.roleKey]) || ROLE[u.def.roleKey] || ROLE.assault;
  const map = m.map, now = m.time, w = u.stance ? plantedWeapon(b, u) : weaponOf(u);
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
    const tur = pickTurret(m, u, w, D);
    if (tur) tgt = tur;
    else if (!mech && lob) tgt = pickGhost(m, u, b, w, now);
  }
  // easy and normal bots cannot tell a decoy from a mech: a decoy nearer than the mech they chose draws their fire
  if (!np && D.skill < 0.9 && tgt && !tgt.pseudo) {
    const dec = pickTurret(m, u, w, D, true);
    if (dec && hyp(dec.x - u.x, dec.z - u.z) < hyp(tgt.x - u.x, tgt.z - u.z) - 1) tgt = dec;
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
    // kit-remake G2: a thruWalls weapon only needs to clear player-built walls
    los = (w.thruWalls || losClear(map, u.x, u.z, aimPt[0], aimPt[1], Math.min(0.2, (w.r || 0.3) * 0.6))) && !wallBlocks(m, u.x, u.z, aimPt[0], aimPt[1], 0.2, u.team);
    aimX = aimPt[0]; aimZ = aimPt[1];
  }
  // the medic's ray goes to the most hurt ally in reach, whatever the movement plan is about
  const healT = w.ray && !isBoss ? pickHealTarget(m, u, b, w) : null;
  let fTgt = tgt, fPt = aimPt, fLos = los;
  if (healT) { fTgt = healT; fPt = [healT.x, healT.z]; fLos = true; aimX = fPt[0]; aimZ = fPt[1]; }
  const canFire = lob ? !!fTgt : fLos;

  if (u.stance !== b.wasStance) { b.wasStance = u.stance; b.stanceAt = now; }
  const reachNow = !!tgt && hyp(tgt.x - u.x, tgt.z - u.z) - tgt.radius * 0.5 <= w.range && canFire;
  b.pIdle = u.stance && !reachNow ? b.pIdle + TICK : 0;

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
  if (u.stance || (u.cast && u.cast.skill.do === 'stance')) { mvx = mvz = 0; }
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
  if (u.cast && u.cast.skill.do === 'sweep') { const e = sweepTrack(u, enemies, tgt); if (e) { aimX = e.x; aimZ = e.z; } }
  if (now < b.pendT) desired = b.pend;
  else if (aimX !== null) desired = Math.atan2(aimZ - u.z, aimX - u.x);
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
  if (fTgt && canFire) {
    // the turret may lag the command (def.turn, a planted stance): judge the aim by where it points now
    const aimErrNow = lob ? 0 : Math.abs(angDiff(u.aim, desired));
    const fd = hyp(fPt[0] - u.x, fPt[1] - u.z);
    const reach = fd - fTgt.radius * 0.5 <= w.range;
    const ready = healT ? true : now >= b.engageAt;
    const size = w.charge ? Math.atan2(fTgt.radius + 0.35, Math.max(1, fd)) + 0.02 : w.ray ? Math.atan2(fTgt.radius + w.width * 0.5, Math.max(1, fd)) : Math.atan2(fTgt.radius, Math.max(1, fd)) + 0.1;
    const aimed = aimErrNow < size + (w.charge || w.ray ? 0 : 0.06);
    if (w.charge) fire = chargeFire(u, b, D, m, w, fTgt, fd, aimed, reach && ready, hpFrac, near);
    else if (reach && ready && aimed && (lob || !domeBlocks(m, u, fPt)) && (healT || duty(m, b, D, now))) fire = true;
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
function foeOf(m, u) { return u.def.boss || m.mode === 'trum' || m.mode === 'nha' || m.mode === 'pve' ? null : baseOf(m, 1 - u.team); }
const bossOf = (m) => { for (const x of m.units) if (x.def.boss) return x; return null; };

function lavaNear(map, x, z, pad) {
  for (const h of map.hazards) if (h.kind === 'lava' && d2(x, z, h.x, h.z) < (h.r + pad) * (h.r + pad)) return true;
  return false;
}
function lavaSeg(map, x0, z0, x1, z1, pad) {
  for (const h of map.hazards) if (h.kind === 'lava' && segCircle(x0, z0, x1 - x0, z1 - z0, h.x, h.z, h.r + pad) <= 1) return true;
  return false;
}
function iceAt(map, x, z, pad = 0) {
  for (const h of map.hazards) if (h.kind === 'ice' && d2(x, z, h.x, h.z) < (h.r + pad) * (h.r + pad)) return h;
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
      // followers do not pile onto the point where their allies already are: stacking five on one point left the other two to the enemy (balance-log, step 1)
      let s = need * 2.2 + (ePres ? (p.owner === u.team ? 1.3 : 0.6) : 0) - 0.75 * al + (p.id === aff ? 0.9 : 0) - hyp(p.x - u.x, p.z - u.z) / 45 + (b.pt === p.id ? 0.5 : 0);
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
function wallBlocks(m, x0, z0, x1, z1, r, team) {
  for (const z of m.zones) {
    if (z.kind !== 'wall' || (z.screen && z.team === team)) continue;   // a screen lets my team's shots through
    for (const q of z.pts) if (segCircle(x0, z0, x1 - x0, z1 - z0, q[0], q[1], z.r + r) <= 1) return true;
  }
  return false;
}

// Can u hit this mech right now with its weapon?
function lineBlocked(m, u, e, w) {
  if (w.thruWalls) return wallBlocks(m, u.x, u.z, e.x, e.z, 0.2, u.team);   // kit-remake G2: over walls, not player-built ones
  return !losClear(m.map, u.x, u.z, e.x, e.z, Math.min(0.2, (w.r || 0.3) * 0.6)) || wallBlocks(m, u.x, u.z, e.x, e.z, 0.2, u.team);
}

function canHit(m, u, e, w, D) {
  const p = aimAtPoint(u, e, w, D.lead);
  if (hyp(p[0] - u.x, p[1] - u.z) - e.radius * 0.5 > w.range) return false;
  if (w.lob) return true;
  if (w.thruWalls) return !wallBlocks(m, u.x, u.z, p[0], p[1], 0.2, u.team);   // kit-remake G2
  return losClear(m.map, u.x, u.z, p[0], p[1], Math.min(0.2, (w.r || 0.3) * 0.6)) && !wallBlocks(m, u.x, u.z, p[0], p[1], 0.2, u.team);
}

function pseudo(id, x, z, radius, hp, maxHp) { return { pseudo: true, id, x, z, vx: 0, vz: 0, radius, hp, maxHp, invulnT: 0 }; }

// Nearest enemy turret (or decoy) that the weapon can reach (lobbed shells need no line of sight). A hard bot sees through a decoy once it has run for 1.5 s.
function pickTurret(m, u, w, D, decoyOnly) {
  let best = null, bd = 1e9;
  for (const z of m.zones) {
    const decoy = z.kind === 'decoy';
    if (z.team === u.team || z.hp <= 0 || !(decoy || (z.kind === 'turret' && !decoyOnly))) continue;
    if (decoy && D && D.skill >= 0.9 && z.age > 1.5) continue;
    const d = hyp(z.x - u.x, z.z - u.z);
    if (d > w.range * 1.3 || d >= bd) continue;
    if (!w.lob && (!losClear(m.map, u.x, u.z, z.x, z.z, 0.2) || wallBlocks(m, u.x, u.z, z.x, z.z, 0.2, u.team))) continue;
    bd = d; best = z;
  }
  if (!best) return null;
  const p = pseudo(-100 - best.id, best.x, best.z, best.r, best.hp, best.maxHp);
  if (best.kind === 'decoy') { p.vx = Math.cos(best.aim) * best.speed; p.vz = Math.sin(best.aim) * best.speed; p.decoy = true; }
  return p;
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
  const scored = b.scored; scored.length = 0;
  for (const e of b.enemies) {
    if (e.invulnT > 0.3) continue;
    const d = hyp(e.x - u.x, e.z - u.z);
    if (d > 36) continue;
    let s = -d - 14 * (e.hp / e.maxHp) * (0.5 + 0.5 * D.skill);
    if (b.tgt === e.id) s += u.stance ? 12 : 4;
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
    scored.push(e, s);
    if (s > bs) { bs = s; best = e; }
  }
  // a pick that has stood behind a wall for 0.8 s gives way to the best one that can be shot (a mech must not sit holding a target it cannot hit)
  if (best && !w.lob) {
    if (!lineBlocked(m, u, best, w)) b.blockId = -1;
    else {
      if (b.blockId !== best.id) { b.blockId = best.id; b.blockT = now; }
      if (now - b.blockT > 0.8) {
        let alt = null, as = -1e9;
        for (let i = 0; i < scored.length; i += 2) if (scored[i + 1] > as && scored[i] !== best && !lineBlocked(m, u, scored[i], w)) { as = scored[i + 1]; alt = scored[i]; }
        if (alt) best = alt;
      }
    }
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
    const thr = D.retreat + (outnumbered ? 0.08 : 0) + (role.cautious && outnumbered ? role.cautious : 0) + (trum ? 0.14 : 0) + (u.markT > 0 ? 0.22 : 0);   // a marked mech dies below 22%
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
      if (a === u || a.team !== u.team || !a.alive || a.def.roleKey === 'support' || a.def.roleKey === 'medic') continue;
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
  // the rim band counts too: at the rim the pull toward the target alone would walk the bot back onto the ice
  const rim = ice || iceAt(m.map, u.x, u.z, 1);
  if (rim) {
    const id = hyp(u.x - rim.x, u.z - rim.z) || 1, w = ice ? 0.6 : 0.9;
    ax += (u.x - rim.x) / id * w; az += (u.z - rim.z) / id * w;
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
    if (solidAt(map, px, pz, rr) || inFoe(m, u, px, pz) || propAt(m, px, pz, rr) || wireOn(m, u, b, px, pz)) continue;
    if (lavaNear(map, px, pz, pad) || lavaNear(map, u.x + vx * look * 0.5, u.z + vz * look * 0.5, pad)) continue;
    if (m.vents.length) { let bad = false; for (const v of m.vents) if (v.warn && d2(px, pz, v.x, v.z) < (v.r + 0.4) * (v.r + 0.4)) bad = true; if (bad) continue; }
    if (i > 0 && i < 3) b.ss = a >= 0 ? 1 : -1;
    return [vx, vz];
  }
  return [ux, uz];
}

// Would the step to (px, pz) cross an enemy wire this bot has noticed? (the chance it notices one is its dodge skill)
function wireOn(m, u, b, px, pz) {
  for (const z of m.zones) {
    if (z.kind !== 'wire' || z.team === u.team || z.left <= 0) continue;
    const p = z.pts[0], q = z.pts[1];
    const s0 = (q[0] - p[0]) * (u.z - p[1]) - (q[1] - p[1]) * (u.x - p[0]), s1 = (q[0] - p[0]) * (pz - p[1]) - (q[1] - p[1]) * (px - p[0]);
    if ((s0 > 0) === (s1 > 0)) continue;
    const k = s0 / (s0 - s1), cx = u.x + (px - u.x) * k, cz = u.z + (pz - u.z) * k, along = ((cx - p[0]) * (q[0] - p[0]) + (cz - p[1]) * (q[1] - p[1])) / d2(p[0], p[1], q[0], q[1]);
    if (along < 0 || along > 1) continue;
    let seen = b.dodge['w' + z.id];
    if (seen === undefined) seen = b.dodge['w' + z.id] = m.rng() < (DIFFICULTY[u.diff] || DIFFICULTY.normal).dodge;
    if (seen) return true;
  }
  return false;
}

function propAt(m, x, z, r) {
  for (const p of m.props) if (p.alive && d2(p.x, p.z, x, z) < (p.r + r) * (p.r + r)) return true;
  for (const zn of m.zones) {
    if (zn.kind !== 'wall' || zn.screen) continue;   // a screen blocks no mech
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
  shield(c, s) {
    // a shield that goes off when it ends (burst): raise it with an enemy inside the blast so it does its work
    if (s.burst) return c.u.shield <= 0 && !!c.tgt && c.td < s.burst.radius + 3.5 && (c.underFire || c.near >= 1 || c.td < s.burst.radius);
    return c.u.shield <= 0 && c.underFire && c.enemies.length > 0;
  },
  dash(c, s) {
    if (s.back) return k4BotBack(c, s);   // kit-remake K4: enbac fires forward while backing off
    const { u, tgt, td, los } = c;
    // a dash that hurts nobody but leaves a trap behind (onStart): use it to break contact, away from the nearest enemy
    if (s.onStart && !s.dmg) {
      if (!c.enemies.length || !(c.state === 'retreat' || (c.underFire && c.hpFrac < 0.6) || (tgt && td < 5 && c.role.kite))) return false;
      let near = c.enemies[0], nd = 1e9;
      for (const e of c.enemies) { const d = hyp(e.x - u.x, e.z - u.z); if (d < nd) { nd = d; near = e; } }
      const base = Math.atan2(u.z - near.z, u.x - near.x);
      for (const da of [0, 0.6, -0.6, 1.2, -1.2]) {
        const a = base + da, ex = u.x + Math.cos(a) * s.dist, ez = u.z + Math.sin(a) * s.dist;
        if (solidAt(c.m.map, ex, ez, u.moveRadius * 0.8) || inFoe(c.m, u, ex, ez) || lavaSeg(c.m.map, u.x, u.z, ex, ez, 0.5)) continue;
        if (!losClear(c.m.map, u.x, u.z, ex, ez, u.moveRadius * 0.7)) continue;
        c.b.sk.aim = a; c.b.sk.tol = 0.2;
        return true;
      }
      return false;
    }
    if (!tgt || !los || (c.hpFrac < 0.3 && !c.role.boss)) return false;
    if (c.m.mode === 'trum' && !c.role.boss) return false;   // charging a boss only lands us in its nova ring
    const reach = s.dist + tgt.radius * 0.6;
    if (td < u.radius + tgt.radius + 1.6 || td > reach) return false;
    const a = Math.atan2(tgt.z - u.z, tgt.x - u.x);
    if (inFoe(c.m, u, u.x + Math.cos(a) * s.dist, u.z + Math.sin(a) * s.dist)) return false;
    if (lavaSeg(c.m.map, u.x, u.z, u.x + Math.cos(a) * s.dist, u.z + Math.sin(a) * s.dist, 0.5)) return false;
    c.b.sk.aim = a; c.b.sk.tol = Math.max(0.04, Math.atan2(tgt.radius + u.radius, td) * 0.7);
    return true;
  },
  nova(c, s) {
    if (s.orbKnock) return k4BotKnock(c, s);   // kit-remake K4: tumay's cone also throws its orbs
    const { u, tgt } = c;
    let n = 0;
    for (const e of c.enemies) if (hyp(e.x - u.x, e.z - u.z) < s.radius * (c.role.boss ? 0.95 : 0.85)) n++;
    // an execute swing (fx.execute): worth it as soon as someone inside is under the threshold
    if (s.fx && s.fx.execute) for (const e of c.enemies) if (!e.def.boss && e.hp < e.maxHp * s.fx.execute && hyp(e.x - u.x, e.z - u.z) < s.radius * 0.85) return true;
    if (c.role.boss) return n >= 2 || (n >= 1 && c.D.skill >= 0.9);   // the ring is telegraphed: worth it on two, or on one for a hard boss
    // meterMul: the blow is worth more the fuller the meter, so one enemy is enough once it is half full
    if (s.meterMul && u.passive === 'meter' && n >= 1 && u.meter >= u.def.passive.max * 0.5) return true;
    if (n >= 2) return true;
    return n >= 1 && (c.hpFrac < 0.5 || (tgt && tgt.hp <= s.dmg * 0.9) || c.D.skill >= 0.9);
  },
  volley(c, s) {
    const { u, tgt, td, los } = c;
    if (s.n >= 10) {
      // a ring of discs: only worth it with enemies close all round
      let n = 0;
      for (const e of c.enemies) if (d2(e.x, e.z, u.x, u.z) < (s.range * 0.45) ** 2) n++;
      return n >= 2 || (n >= 1 && (c.hpFrac < 0.5 || c.underFire));
    }
    if (!tgt || (!los && !s.thruWalls) || td > s.range - 1 || td < 2.5) return false;
    const p = leadPoint(u, tgt, s.speed, c.D.lead);
    c.b.sk.aim = Math.atan2(p[1] - u.z, p[0] - u.x);
    c.b.sk.tol = Math.min(0.4, Math.max(0.05, (s.fan || 0) * (s.n - 1) / 2 + Math.atan2(tgt.radius + (s.r || 0.3), td) * 0.8));
    c.b.sk.x = p[0]; c.b.sk.z = p[1];
    return !!s.thruWalls || losClear(c.m.map, u.x, u.z, p[0], p[1], 0.3);
  },
  buff(c, s) {
    const { u, tgt, td, w } = c;
    if (s.prime) return u.primeT <= 0 && !!tgt && c.los && td >= 6 && td <= 21 && u.cd.fire <= 0.6 && tgt.hp > 450;
    if (s.armor) return u.armorT <= 0 && c.underFire && c.near >= 1 && c.hpFrac < 0.95;
    if (s.lifesteal) return u.rageT <= 0 && !!tgt && c.los && td < w.range + 3 && c.hpFrac - (s.cost || 0) > 0.25 && c.hpFrac < 0.95;
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
  transform(c, s) {
    const { u, tgt, td, w } = c;
    if (u.tfT > 0 || !tgt) return false;
    const reach = (s.weapon && s.weapon.range ? s.weapon.range : w.range) + 2;
    if (td > reach) return false;
    if (s.nova) return td < s.nova.radius * 0.9 && (c.near >= 2 || c.hpFrac < 0.75 || tgt.hp < s.nova.dmg * 1.2 || c.D.skill >= 0.9);
    if (s.cleanse && (u.slowT > 0.4 || u.rootT > 0.4 || u.burnT > 0.4)) return true;
    if (c.near >= 2 || c.underFire || c.hpFrac < 0.85) return c.state !== 'retreat' || c.hpFrac < 0.5;
    return tgt.hp < tgt.maxHp * 0.6 && c.D.skill >= 0.6;
  },
  barrage(c, s) {
    const { u, tgt, td } = c;
    // lock (Athena): the sim picks the nearest enemy in reach itself, so any enemy inside reach is enough
    if (s.lock) { for (const e of c.enemies) if (hyp(e.x - u.x, e.z - u.z) < s.lock - 0.5) return true; return false; }
    if (s.line) return lineBarrage(c, s);
    if (s.channel) {
      // the cast follows the cursor (the bot's aim point is its target), so only start it with an enemy inside the strike disc and in reach
      if (!tgt || td > s.cast - 1 || td < 3.5 || !c.los) return false;
      c.b.sk.x = tgt.x; c.b.sk.z = tgt.z;
      return c.enemies.length >= 2 || c.hpFrac < 0.7 || tgt.hp < tgt.maxHp * 0.7 || c.D.skill >= 0.9;
    }
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
    if (s.screen) return screenWall(c, s);
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
    if (s.track) {
      // a tracking beam follows its target: no lead and no clear line needed (thru ignores walls); lock the weakest enemy in reach
      let best = null, bs = -1;
      for (const e of c.enemies) {
        const d = hyp(e.x - u.x, e.z - u.z);
        if (d > s.track.cast - 1 || d < 3 || e.invulnT > 0) continue;
        const sc = 2 - e.hp / e.maxHp + (e === tgt ? 0.5 : 0) + (s.thru || castStatic(c.m.map, u.x, u.z, e.x, e.z, 0.2) > 1 ? 0 : -3);
        if (sc > bs) { bs = sc; best = e; }
      }
      if (!best || (bs < 1 && c.enemies.length < 2 && c.hpFrac > 0.5 && best.hp > s.dmg * 0.6)) return false;
      c.b.sk.x = best.x; c.b.sk.z = best.z;
      return true;
    }
    // charge: start holding with a target inside the full reach and a clear line (chooseSkill lets it go)
    if (s.charge) {
      if (!tgt || !c.los || td > s.charge.range[1] - 2 || td < 2.5) return false;
      c.b.sk.aim = Math.atan2(tgt.z - u.z, tgt.x - u.x); c.b.sk.tol = Math.max(0.04, Math.atan2(s.charge.width[0] * 0.5, td) * 0.7);
      return true;
    }
    if (!tgt || td > s.range - 2 || td < 4) return false;
    const p = leadPoint(u, tgt, td / s.windup, c.D.lead);
    const dx = p[0] - u.x, dz = p[1] - u.z, dd = hyp(dx, dz);
    if (castStatic(c.m.map, u.x, u.z, p[0], p[1], 0.2) <= 1) return false;
    const lat = Math.abs((tgt.vx || 0) * dz - (tgt.vz || 0) * dx) / (dd || 1);
    if (lat > 1.5 + (1 - c.D.skill) * 2) return false;
    c.b.sk.aim = Math.atan2(dz, dx); c.b.sk.x = p[0]; c.b.sk.z = p[1]; c.b.sk.tol = Math.max(0.03, Math.atan2(tgt.radius + s.width * 0.5, td) * 0.7);
    return true;
  },
  zone(c, s) {
    const { u, tgt, td, m } = c;
    if (s.cage) return cageSkill(c, s);
    // a healing field set down at the cursor (at target): on the hurt group, not on the enemy
    if (s.hps && s.at === 'target') return healField(c, s);
    // a healing field (hps): worth it when the people inside it have lost blood, and it follows me so no aiming
    if (s.hps && s.follow) {
      let miss = 0;
      for (const a of c.m.units) {
        if (a.team !== u.team || !a.alive || d2(a.x, a.z, u.x, u.z) > s.radius * s.radius) continue;
        miss += 1 - a.hp / a.maxHp;
      }
      return miss >= 0.6 && (c.enemies.length > 0 || c.underFire);
    }
    if (s.follow || s.pull < 0) return bastionSkill(c, s);
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
  // ---- the eight newer mechs ----
  stance(c, s) {
    const { u, m, b, state, enemies } = c;
    const pr = weaponOf(u).range * s.range;
    let nearest = 1e9;
    for (const e of enemies) nearest = Math.min(nearest, hyp(e.x - u.x, e.z - u.z));
    const closeR = m.mode === 'trum' ? 11 : 6.5;
    // chiem: plant only on the point (the planted reach covers it from there) and lift the legs when the plan moves elsewhere
    const CP = m.mode === 'chiem' ? m.points[b.pt] : null;
    if (u.stance) return state === 'retreat' || nearest < closeR || (b.pIdle > 1.2 && m.time - b.stanceAt > 1.5) || (CP && hyp(u.x - CP.x, u.z - CP.z) > CP.r + 0.5);
    if (state === 'retreat' || state === 'grab' || c.hpFrac < 0.3 || nearest < closeR + 3) return false;
    if (m.mode === 'chiem' && (!CP || hyp(u.x - CP.x, u.z - CP.z) > CP.r - 0.8)) return false;
    if (m.mode === 'nha' && underTower(m, u.team, u.x, u.z, 0.8)) return false;
    const t = c.tgt;
    if (t && c.los && c.td >= 10 && c.td <= pr - 1.5 && c.near - c.allyNear < 2) return true;
    if (m.mode === 'nha' && b.np && b.np.kind !== 'defend') {
      const R = nhaR(m);
      for (const tw of m.towers) {
        if (!tw.alive || tw.team === u.team || !towerOpen(m, tw)) continue;
        const d = hyp(tw.x - u.x, tw.z - u.z);
        if (d - tw.r * 0.5 > pr - 0.6 || d < R + 1) continue;
        if (losClear(m.map, u.x, u.z, tw.x, tw.z, 0.2) && !wallBlocks(m, u.x, u.z, tw.x, tw.z, 0.2, u.team)) return true;
      }
    }
    return false;
  },
  hook(c, s) {
    const { u, m, tgt, td } = c;
    if (!tgt || !c.los || tgt.def.heavy || tgt.stance || td < 4.5 || td > s.range - 1 || c.hpFrac < 0.3) return false;
    if (m.mode === 'tudo' ? c.near > 1 : c.near - c.allyNear >= 2) return false;
    const p = leadPoint(u, tgt, s.speed, c.D.lead);
    if (!losClear(m.map, u.x, u.z, p[0], p[1], 0.3) || wallBlocks(m, u.x, u.z, p[0], p[1], 0.3, u.team)) return false;
    c.b.sk.aim = Math.atan2(p[1] - u.z, p[0] - u.x); c.b.sk.tol = Math.max(0.03, Math.atan2(tgt.radius + s.r, td) * 0.8);
    c.b.sk.x = p[0]; c.b.sk.z = p[1];
    return true;
  },
  swap(c, s) {
    const { u, m, enemies } = c;
    if (u.stance) return false;
    const reach = s.cast - 0.7, mine = threatAt(enemies, u.x, u.z, null);
    let best = null, bs = 0;
    // an ally in trouble: I take its place when I am the healthier one and its spot is the hotter one
    for (const a of m.units) {
      if (a === u || a.team !== u.team || !a.alive || a.def.boss || a.def.heavy || a.stance || hyp(a.x - u.x, a.z - u.z) > reach) continue;
      const f = a.hp / a.maxHp;
      if (f > 0.45 || a.combatT > 1.5 || c.hpFrac < f + 0.25 || c.hpFrac < 0.55) continue;
      const gain = threatAt(enemies, a.x, a.z, null) - mine;
      if (gain < 4 || !safeLand(m, u, a.x, a.z)) continue;
      const sc = gain + (0.45 - f) * 20;
      if (sc > bs) { bs = sc; best = a; }
    }
    // an enemy that stands alone: drop it among my team, or get out of a crowd by taking its place
    if (!best) for (const e of enemies) {
      const d = hyp(e.x - u.x, e.z - u.z);
      if (e.def.heavy || e.def.boss || e.stance || e.invulnT > 0 || d > reach || d < 4) continue;
      let others = 0;
      for (const o of enemies) if (o !== e && d2(o.x, o.z, e.x, e.z) < 64) others++;
      if (others || !safeLand(m, u, e.x, e.z)) continue;
      let sc = 0;
      if (c.allyNear >= 2 && c.hpFrac >= 0.55) sc = 4 + c.allyNear + (1 - e.hp / e.maxHp) * 4;
      else if (c.near >= 2 && mine - threatAt(enemies, e.x, e.z, e) >= 8) sc = mine - threatAt(enemies, e.x, e.z, e);
      if (sc > bs) { bs = sc; best = e; }
    }
    if (!best) return false;
    c.b.sk.x = best.x; c.b.sk.z = best.z;
    return true;
  },
  bless(c, s) {
    const { u, m } = c, reach = s.cast - 0.5;
    if (s.bubble) return k1BotBubble(c, s, reach);

    // undying (Athena): the ally (or me) who is about to die under fire; cleanse: an ally held by a stun or root gets the shield
    if (s.undying) {
      let best = null, bf = 0.3;
      for (const a of m.units) {
        if (a === u || a.team !== u.team || !a.alive || a.combatT > 1.5 || a.undyT > 0 || hyp(a.x - u.x, a.z - u.z) > reach) continue;
        const f = a.hp / a.maxHp;
        if (f < bf) { bf = f; best = a; }
      }
      if (best) { c.b.sk.x = best.x; c.b.sk.z = best.z; return true; }
      if (!(c.underFire && c.hpFrac < 0.3)) return false;
      for (const a of m.units) if (a !== u && a.team === u.team && a.alive && hyp(a.x - u.x, a.z - u.z) < s.pick + 0.5) return false;
      c.b.sk.x = u.x; c.b.sk.z = u.z;
      return true;
    }
    if (s.shield && s.cleanse) {
      for (const a of m.units) {
        if (a === u || a.team !== u.team || !a.alive || !(a.stunT > 0.4 || a.rootT > 0.4 || a.silenceT > 0.4) || hyp(a.x - u.x, a.z - u.z) > reach) continue;
        c.b.sk.x = a.x; c.b.sk.z = a.z; return true;
      }
    }
    if (s.shield) {
      let best = null, bf = 0.8;
      for (const a of m.units) {
        if (a === u || a.team !== u.team || !a.alive || a.combatT > 1.5 || a.shield > 150 || hyp(a.x - u.x, a.z - u.z) > reach) continue;
        const f = a.hp / a.maxHp;
        if (f < bf) { bf = f; best = a; }
      }
      const selfNeed = c.underFire && c.hpFrac < 0.75 && u.shield <= 0;
      if (best && !(selfNeed && c.hpFrac < bf - 0.1)) { c.b.sk.x = best.x; c.b.sk.z = best.z; return true; }
      // no ally under the cursor: the shield comes back to me
      if (selfNeed) {
        for (const a of m.units) if (a !== u && a.team === u.team && a.alive && hyp(a.x - u.x, a.z - u.z) < s.pick + 0.5) return false;
        c.b.sk.x = u.x; c.b.sk.z = u.z;
        return true;
      }
      return false;
    }
    // hot: heal over time on the hurt ally under the cursor, or on me when nobody else is there
    if (s.hot) {
      let best = null, bf = 0.72;
      for (const a of m.units) {
        if (a === u || a.team !== u.team || !a.alive || a.healT > 0.5 || hyp(a.x - u.x, a.z - u.z) > reach) continue;
        const f = a.hp / a.maxHp;
        if (f < bf) { bf = f; best = a; }
      }
      if (best && !(c.hpFrac < bf - 0.15 && c.underFire)) { c.b.sk.x = best.x; c.b.sk.z = best.z; return true; }
      if (u.healT > 0.5 || c.hpFrac > 0.65 || !(c.underFire || c.enemies.length)) return false;
      for (const a of m.units) if (a !== u && a.team === u.team && a.alive && hyp(a.x - u.x, a.z - u.z) < s.pick + 0.5) return false;
      c.b.sk.x = u.x; c.b.sk.z = u.z;
      return true;
    }
    // haste, rapid fire: an ally who is fighting right now
    let best = null, bd = 1e9;
    for (const a of m.units) {
      if (a === u || a.team !== u.team || !a.alive || a.combatT > 4 || a.hasteT > 0.5 || a.rapidT > 0.5 || a.hp < a.maxHp * 0.25) continue;
      const d = hyp(a.x - u.x, a.z - u.z);
      if (d > reach || d >= bd) continue;
      let seen = false;
      for (const e of c.enemies) if (d2(e.x, e.z, a.x, a.z) < 225) { seen = true; break; }
      if (seen) { bd = d; best = a; }
    }
    if (best) { c.b.sk.x = best.x; c.b.sk.z = best.z; return true; }
    if (!c.enemies.length || u.hasteT > 0.5) return false;
    for (const a of m.units) if (a !== u && a.team === u.team && a.alive && hyp(a.x - u.x, a.z - u.z) < s.pick + 0.5) return false;
    if (c.state === 'retreat' || (c.tgt && c.td < c.w.range)) { c.b.sk.x = u.x; c.b.sk.z = u.z; return true; }
    return false;
  },
  // orbit: 'seek' orbs need someone to hit within their range; 'guard' blades go up when I am being shot at or someone is on top of me
  orbit(c, s) {
    if (s.mode === 'devour') return k4BotDevour(c, s);   // kit-remake K4: tumay's ult
    const { tgt, td } = c;
    if (s.mode === 'seek') return !!tgt && td <= s.range - 1 && (c.los || td < 7);
    if (!c.enemies.length) return false;
    return (c.underFire && (c.hpFrac < 0.9 || c.near >= 1)) || (!!tgt && td < s.ring + 3.5);
  },
  // counter: a window worth opening when somebody is on me or shooting me; facing the enemy so a back-step goes away from it
  counter(c, s) {
    const { u, tgt, td } = c;
    if (!tgt || tgt.pseudo || !c.enemies.length) return false;
    if (!((c.underFire && td < 12) || td < 4.5)) return false;
    c.b.sk.aim = Math.atan2(tgt.z - u.z, tgt.x - u.x); c.b.sk.tol = 0.6;
    return true;
  },
  // flurry: dash through the enemy in reach; not into a crowd, not when nearly dead
  flurry(c, s) {
    const { tgt, td, m } = c;
    if (!tgt || tgt.pseudo || !c.los || td > s.range - 0.5 || c.hpFrac < 0.3) return false;
    if (m.mode === 'trum' && !c.role.boss) return false;
    if (m.mode === 'tudo' ? c.near > 2 : c.near - c.allyNear >= 3) return false;
    c.b.sk.x = tgt.x; c.b.sk.z = tgt.z;
    return true;
  },
  // form: the heavy stance when the enemy is far, the light one when it is close or I am hunted
  form(c, s) {
    const { u, tgt, td } = c;
    if (u.form === 0) return !!tgt && c.los && td > 10.5 && c.near <= 1;
    return !tgt || td < 7 || (c.underFire && c.near >= 1);
  },
  // portal: slip back toward my base when hurt and hunted, or open a way to the ally who is far away while nobody is in sight
  portal(c, s) {
    const { u, m } = c;
    for (const z of m.zones) if (z.kind === 'portal' && z.owner === u.id) return false;
    let to = null;
    if (c.state === 'retreat' || (c.underFire && c.hpFrac < 0.45)) to = ownOf(m, u);
    else if (!c.enemies.length) {
      let bd = 256;
      for (const a of m.units) if (a !== u && a.team === u.team && a.alive) { const d = d2(a.x, a.z, u.x, u.z); if (d > bd) { bd = d; to = [a.x, a.z]; } }
    }
    if (!to) return false;
    const a = Math.atan2(to[1] - u.z, to[0] - u.x);
    for (let k = Math.min(s.cast - 0.5, hyp(to[0] - u.x, to[1] - u.z)); k >= 4; k -= 1.5) {
      const x = u.x + Math.cos(a) * k, z = u.z + Math.sin(a) * k;
      if (solidAt(m.map, x, z, u.moveRadius * 1.3) || lavaNear(m.map, x, z, 1.5) || !losClear(m.map, u.x, u.z, x, z, u.moveRadius * 0.7)) continue;
      c.b.sk.x = x; c.b.sk.z = z;
      return true;
    }
    return false;
  },
  // rewind: the group has lost a lot in the last few seconds and the fight is still on
  rewind(c, s) {
    if (s.fwd) return krBotRewind(c, s);   // kit-remake G5 Kurumi
    const { u, m } = c;
    if (!c.enemies.length && !c.underFire) return false;
    const back = Math.round(s.back * 2);
    let sum = 0, who = 0;
    for (const a of m.units) {
      if (a.team !== u.team || !a.alive || !a.hpHist.length || d2(a.x, a.z, u.x, u.z) > s.radius * s.radius) continue;
      const lost = a.hpHist[Math.max(0, a.hpHist.length - 1 - back)] - a.hp;
      if (lost > 0) { sum += lost * s.frac; if (lost > a.maxHp * 0.12) who++; }
    }
    return sum >= 900 || (who >= 2 && sum >= 600);
  },
  rally(c, s) {
    const { u, m } = c;
    if (s.shield) return k1BotRally(c, s);
    let value = 0, others = 0;
    for (const a of m.units) {
      if (a.team !== u.team || !a.alive || d2(a.x, a.z, u.x, u.z) > s.radius * s.radius) continue;
      value += Math.min(s.heal, a.maxHp - a.hp) + (a.stunT > 0 || a.slowT > 0 || a.markT > 0 ? 400 : 0);
      if (a !== u) others++;
    }
    return value >= (others ? 1500 : 800) && (c.enemies.length > 0 || c.underFire);
  },
  leap(c, s) {
    const { u, m, tgt, td } = c;
    if (s.to === 'ally') {
      // fly to a hurt ally who is in the fight and cover the group with the landing shield
      if (m.mode === 'trum' || c.state === 'grab') return false;
      let best = null, bf = 0.6;
      for (const a of m.units) {
        if (a === u || a.team !== u.team || !a.alive || hyp(a.x - u.x, a.z - u.z) > s.cast - 1 || hyp(a.x - u.x, a.z - u.z) < 3) continue;
        const f = a.hp / a.maxHp;
        if (f >= bf || a.combatT > 3) continue;
        let foe = false;
        for (const e of c.enemies) if (d2(e.x, e.z, a.x, a.z) < 144) { foe = true; break; }
        if (foe && safeLand(m, u, a.x, a.z)) { bf = f; best = a; }
      }
      if (!best) return false;
      c.b.sk.x = best.x; c.b.sk.z = best.z;
      return true;
    }
    if (s.to) {
      // fly to a chosen unit (leap.to): a foe to jump on, an ally to land beside; the cursor sits on it so pickUnit finds it
      if (c.state === 'retreat' || c.hpFrac < 0.45 || m.mode === 'trum' || c.state === 'grab') return false;
      if (s.to === 'foe') {
        if (!tgt || td < 3.5 || td > s.cast - 1 || (m.mode === 'tudo' ? c.near > 2 : c.near - c.allyNear >= 2)) return false;
        if (!(tgt.hp < tgt.maxHp * 0.75 || td > 6 || c.near >= 2)) return false;
        if (!safeLand(m, u, tgt.x, tgt.z)) return false;
        c.b.sk.x = tgt.x; c.b.sk.z = tgt.z;
        return true;
      }
      return false;
    }
    if (c.state === 'retreat' || (c.hpFrac < 0.4 && c.underFire)) {
      if (!c.enemies.length) return false;
      const sp = escapeSpot(c, s.cast, 4);
      if (!sp) return false;
      c.b.sk.x = sp[0]; c.b.sk.z = sp[1];
      return true;
    }
    if (m.mode === 'trum' || !tgt || c.hpFrac < 0.5 || c.state === 'grab' || td < 3.5 || td > s.cast + 1.5) return false;
    if (m.mode === 'tudo' ? c.near > 2 : c.near - c.allyNear >= 2) return false;
    const g = cluster(c.enemies.filter((e) => hyp(e.x - u.x, e.z - u.z) <= s.cast + 3), s.radius * 0.9);
    let px, pz;
    if (g && g.n >= 2) { px = g.x; pz = g.z; }
    else if (tgt.hp < tgt.maxHp * 0.7 || td > 6) { const p = leadPoint(u, tgt, 12, c.D.lead * 0.5); px = p[0]; pz = p[1]; }
    else return false;
    const d = hyp(px - u.x, pz - u.z), k = d > s.cast ? s.cast / d : 1;
    px = u.x + (px - u.x) * k; pz = u.z + (pz - u.z) * k;
    if (!safeLand(m, u, px, pz)) return false;
    c.b.sk.x = px; c.b.sk.z = pz;
    return true;
  },
  mark(c, s) {
    const { u, m } = c;
    let best = null, bs = 0;
    for (const e of c.enemies) {
      if (e.markT > 0 || e.invulnT > 0 || hyp(e.x - u.x, e.z - u.z) > s.cast - 0.5) continue;
      const f = e.hp / e.maxHp;
      let team = 0;
      for (const a of m.units) if (a !== u && a.team === u.team && a.alive && a.brain && a.brain.tgt === e.id) team++;
      let sc;
      if (e.def.boss) sc = team >= 2 ? 1 : 0;
      else if (f < 0.6 || (team >= 2 && f < 0.85)) sc = 1 - f + team * 0.3;
      else continue;
      if (sc > bs) { bs = sc; best = e; }
    }
    if (!best) return false;
    c.b.sk.x = best.x; c.b.sk.z = best.z;
    return true;
  },
  decoy(c, s) {
    const { u, tgt } = c;
    if (s.seek) {
      // a hound: send it after a target inside its range; one at a time
      for (const z of c.m.zones) if (z.kind === 'decoy' && z.owner === u.id && z.seek) return false;
      if (!tgt || c.td > s.seek.range - 3 || c.td < 2.5) return false;
      c.b.sk.aim = Math.atan2(tgt.z - u.z, tgt.x - u.x); c.b.sk.tol = 0.4;
      return true;
    }
    if (!c.enemies.length || u.stealthT > 0) return false;
    const retreating = c.state === 'retreat' || (c.hpFrac < 0.45 && c.underFire);
    const engaged = !!tgt && c.td < 13 && (c.underFire || c.td < 9);
    if (!retreating && !engaged) return false;
    if (s.n >= 2 ? !(retreating || c.near >= 2 || c.hpFrac < 0.6) : !(retreating || c.hpFrac < 0.85 || c.near >= 2)) return false;
    let e = tgt, nd = 1e9;
    if (!e) for (const o of c.enemies) { const d = hyp(o.x - u.x, o.z - u.z); if (d < nd) { nd = d; e = o; } }
    c.b.sk.aim = Math.atan2(e.z - u.z, e.x - u.x); c.b.sk.tol = 0.25;
    return true;
  },
  warp(c, s) {
    const { u, m, tgt, td } = c;
    if (s.to) return g4WarpTo(c, s, 99);   // kit-remake G4
    if (c.state === 'retreat' || (c.hpFrac < 0.45 && c.underFire) || (s.leave && c.underFire && c.hpFrac < 0.7 && c.enemies.length > 0)) {
      if (!c.enemies.length) return false;
      const sp = escapeSpot(c, s.dist - 0.4, 4);
      if (!sp) return false;
      c.b.sk.x = sp[0]; c.b.sk.z = sp[1];
      return true;
    }
    // behind: pointing the cursor at an enemy within reach puts the mech at its back (sim picks the 1.6 m behind spot)
    if (s.behind && m.mode !== 'trum' && tgt && c.los && td > 3 && td < s.dist + s.behind.pick - 1 && c.hpFrac > 0.5 && c.near - c.allyNear < 2) {
      c.b.sk.x = tgt.x; c.b.sk.z = tgt.z;
      return true;
    }
    // land: the warp ends in a blast, so close in on a target a little out of reach and let the blast land on it
    if (s.land && m.mode !== 'trum' && tgt && c.los && td > s.land.radius + 1.5 && td < s.dist + s.land.radius * 0.6 && c.hpFrac > 0.5 && c.near - c.allyNear < 2) {
      // come out 2.2 m short of the target: inside the blast, not on top of it (a mech standing on its target cannot shoot it)
      const k = Math.max(0, Math.min(s.dist, td - 2.2)) / td, lx = u.x + (tgt.x - u.x) * k, lz = u.z + (tgt.z - u.z) * k;
      if (!safeLand(m, u, lx, lz) || hyp(lx - tgt.x, lz - tgt.z) > s.land.radius * 0.85) return false;
      c.b.sk.x = lx; c.b.sk.z = lz;
      return true;
    }
    // a wall hides the target: warp to a spot on the other side that sees it
    if (m.mode === 'trum' || !tgt || c.los || c.hpFrac < 0.5 || td > c.w.range + 8 || c.near - c.allyNear >= 2) return false;
    let best = null, bd = 1e9;
    const want = c.w.range * 0.6;
    for (let k = 0; k < 16; k++) for (const f of [0.6, 1]) {
      const a = k * Math.PI / 8, x = u.x + Math.cos(a) * (s.dist - 0.4) * f, z = u.z + Math.sin(a) * (s.dist - 0.4) * f;
      if (!safeLand(m, u, x, z) || losClear(m.map, u.x, u.z, x, z, u.moveRadius) || !losClear(m.map, x, z, tgt.x, tgt.z, 0.2)) continue;
      const dd = Math.abs(hyp(tgt.x - x, tgt.z - z) - want);
      if (dd < bd) { bd = dd; best = [x, z]; }
    }
    if (!best) return false;
    c.b.sk.x = best[0]; c.b.sk.z = best[1];
    return true;
  },
  drone(c, s) {
    const { u, m } = c;
    for (const z of m.zones) if (z.kind === 'drone' && z.owner === u.id) return false;
    if (!c.enemies.length && !c.underFire) return false;
    for (const a of m.units) if (a.team === u.team && a.alive && d2(a.x, a.z, u.x, u.z) < s.range * s.range && a.hp < a.maxHp * 0.85) return true;
    return false;
  },
  wire(c, s) {
    const { u, m, tgt, td } = c;
    if (!tgt || td < 6 || td > s.cast + 8) return false;
    const a = Math.atan2(tgt.z - u.z, tgt.x - u.x), k = Math.min(s.cast, Math.max(4, td * 0.5));
    const px = u.x + Math.cos(a) * k, pz = u.z + Math.sin(a) * k;
    if (solidAt(m.map, px, pz, 0.6) || propAt(m, px, pz, 0.5)) return false;
    // a wire that still has charges and stands near this spot already does the job
    for (const z of m.zones) if (z.kind === 'wire' && z.team === u.team && z.left > 0 && z.age < z.dur - 1 && hyp(z.x - px, z.z - pz) < 5) return false;
    const toMe = (tgt.vx || 0) * (u.x - tgt.x) + (tgt.vz || 0) * (u.z - tgt.z);
    const coming = toMe > 0.4 * hyp(tgt.vx || 0, tgt.vz || 0) * td;
    if (!(c.state === 'retreat' || c.underFire || (coming && td < 14) || chokepoint(m.map, px, pz))) return false;
    c.b.sk.aim = a; c.b.sk.tol = 0.2; c.b.sk.x = px; c.b.sk.z = pz;
    return true;
  },
  sweep(c, s) {
    const { u, tgt, td } = c;
    if (!tgt || td < 3 || td > s.range - 1.5 || !(c.los || tgt.tower)) return false;
    const a = Math.atan2(tgt.z - u.z, tgt.x - u.x), dx = Math.cos(a), dz = Math.sin(a);
    if (tgt.tower) { c.b.sk.aim = a; return true; }
    let n = 0;
    for (const e of c.enemies) {
      const along = (e.x - u.x) * dx + (e.z - u.z) * dz, lat = Math.abs((e.x - u.x) * dz - (e.z - u.z) * dx);
      if (along > 0 && along < s.range && lat < s.width / 2 + e.radius + 1.2) n++;
    }
    const kill = tgt.hp <= s.dps * 1.4 && td < 12;
    if (!(n >= 2 || kill || c.m.mode === 'trum' || (c.hpFrac < 0.5 && c.near >= 1))) return false;
    c.b.sk.aim = a; c.b.sk.tol = 0.15;
    return true;
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

const TOWER_SKILLS = { volley: 1, barrage: 1, beam: 1, sweep: 1 };
function chooseSkill(c) {
  const { u, b, D, m, role } = c;
  // a charging beam (charge): let it go once the key has been up and the target stands inside the reach it has now
  if (u.cast && u.cast.charge && u.cast.up) {
    const C = u.cast.skill.charge, f = Math.min(1, (u.cast.total - u.cast.t) / u.cast.total), reach = C.range[0] + (C.range[1] - C.range[0]) * f;
    const t = c.tgt;
    if (t && f >= 0.6 && c.td < reach - 1 && Math.abs(angDiff(u.cast.aim, Math.atan2(t.z - u.z, t.x - u.x))) < Math.atan2(C.width[1] * 0.5, c.td)) {
      b.sk.x = t.x; b.sk.z = t.z; b.sk.aim = null; b.sk.mx = null; b.sk.mz = null; b.sk.slot = u.cast.slot;
      return b.sk;
    }
  }
  if (u.cast || u.dash || u.stunT > 0 || u.silenceT > 0 || locked(u)) return null;
  const sk = b.sk;
  const p = 1 - Math.pow(1 - Math.min(0.999, D.skill), 1.5 * TICK);
  for (let i = 0; i < 3; i++) {
    // next: an armed second stage is used at once while its target is still in reach (the sim checks the rest)
    const nx = u.next && u.next.slot === i && u.next.armed && u.next.up ? u.def.skills[i].next.row : null;
    if (nx) {
      if (nx.to) { if (g4WarpTo(c, nx, u.next.t)) { sk.slot = i; return sk; } continue; }   // kit-remake G4: recast to an own object
      const o = m.units[u.next.target];
      // a warp second stage must reach its target; a sweep second stage (nova) must have it inside the blade (any hp: it heals)
      const reach = nx.dist ?? nx.radius * 0.9, keen = nx.do === 'nova' || c.hpFrac > 0.35;
      if (o && o.alive && hyp(o.x - u.x, o.z - u.z) < reach && keen) { sk.x = o.x; sk.z = o.z; sk.aim = nx.do === 'nova' ? Math.atan2(o.z - u.z, o.x - u.x) : null; sk.mx = null; sk.mz = null; sk.slot = i; return sk; }
      continue;
    }
    if (!skillReady(u, i)) continue;   // uses (skill charges): a stored use counts, whatever the recharge says
    const s = u.def.skills[i], fn = SKILL_AI[s.do];
    if (!fn) continue;
    // a tower in reach is a target for the damage skills that fire at a point (rockets, shell barrage, the beam)
    const onTower = !c.tgt && c.ttgt && TOWER_SKILLS[s.do];
    if (onTower) { c.tgt = c.ttgt; c.td = c.ttd; c.los = c.tlos; }
    sk.x = c.tgt ? c.tgt.x : u.x; sk.z = c.tgt ? c.tgt.z : u.z; sk.aim = null; sk.mx = null; sk.mz = null; sk.tol = 0.12;
    const ok = fn(c, s);
    if (onTower) { c.tgt = null; c.td = 1e9; c.los = false; }
    if (!ok) continue;
    if (D.skill < 1 && m.rng() > p * role.eager[i]) continue;
    // a skill that fires along u.aim waits for the turret to get there (it turns at def.turn, slower still planted or sweeping)
    if (sk.aim !== null && Math.abs(angDiff(u.aim, sk.aim)) - turnRate(u) * TICK > sk.tol) { b.pend = sk.aim; b.pendT = m.time + 0.35; continue; }
    b.pendT = -9;
    sk.slot = i;
    return sk;
  }
  return null;
}

// ---- the eight newer mechs: weapons and helpers ---------------------------------------------------------------------------------

// A planted siege mech shoots further: the weapon row with the planted reach (cached in the brain).
function plantedWeapon(b, u) {
  const r = weaponRange(u);
  if (!b.pw || b.pw.range !== r || b.pw.name !== weaponOf(u).name) b.pw = { ...weaponOf(u), range: r };
  return b.pw;
}

// How much enemy fire there is at a spot: every enemy within 13 m counts the closer, the more.
function threatAt(enemies, x, z, skip) {
  let t = 0;
  for (const e of enemies) { if (e === skip) continue; const d = hyp(e.x - x, e.z - z); if (d < 13) t += 13 - d; }
  return t;
}

// Ground a jump or a warp may put me on: free, no lava or vent, outside the enemy base, and in nha never closer to an enemy tower than I am now once inside its range.
function safeLand(m, u, x, z) {
  const map = m.map, r = u.moveRadius + 0.3;
  if (Math.abs(x) > map.hw - r - 0.5 || Math.abs(z) > map.hd - r - 0.5) return false;
  if (solidAt(map, x, z, r) || propAt(m, x, z, r) || lavaNear(map, x, z, 1.2) || ventNear(m, x, z, 0.8)) return false;
  if (!mudProof(u) && mudAt(map, x, z)) return false;
  const foe = foeOf(m, u);
  if (foe && d2(x, z, foe[0], foe[1]) < (RULES.baseRadius + 1.5) ** 2) return false;
  if (m.mode === 'nha') {
    const R = nhaR(m) + 0.8;
    for (const t of m.towers) {
      if (!t.alive || t.team === u.team) continue;
      const dn = hyp(x - t.x, z - t.z);
      if (dn < R && dn < hyp(u.x - t.x, u.z - t.z) + 0.01) return false;
    }
  }
  return true;
}

// A spot within `dist` of me that is safe and has less enemy fire on it than my own (hidden from the nearest enemies counts, so does the way home).
function escapeSpot(c, dist, minGain) {
  const { u, m, enemies } = c, own = ownOf(m, u);
  const score = (x, z) => {
    let s = -threatAt(enemies, x, z, null);
    for (const e of enemies) if (d2(e.x, e.z, x, z) < 400 && !losClear(m.map, e.x, e.z, x, z, 0.2)) s += 4;
    if (own) s += (hyp(u.x - own[0], u.z - own[1]) - hyp(x - own[0], z - own[1])) * 0.25;
    return s;
  };
  const here = score(u.x, u.z);
  let best = null, bs = here + minGain;
  for (let k = 0; k < 16; k++) for (const f of [0.55, 1]) {
    const a = k * Math.PI / 8, x = u.x + Math.cos(a) * dist * f, z = u.z + Math.sin(a) * dist * f;
    if (!safeLand(m, u, x, z)) continue;
    const sc = score(x, z);
    if (sc > bs) { bs = sc; best = [x, z]; }
  }
  return best;
}

// The medic's ray: the ally in reach (clear line) who needs it most. A fresh shield on an ally under fire counts for a little.
function pickHealTarget(m, u, b, w) {
  let best = null, bs = 0.15;
  for (const a of m.units) {
    if (a === u || a.team !== u.team || !a.alive) continue;
    const d = hyp(a.x - u.x, a.z - u.z);
    if (d > w.range - 0.7) continue;
    const f = a.hp / a.maxHp;
    let need = (1 - f) * 2;
    if (f > 0.93) need = a.combatT < 1.5 && a.shield < 150 && u.passive === 'overheal' ? 0.3 : 0;
    if (need <= 0) continue;
    const sc = need - d / w.range * 0.3 + (b.healId === a.id ? 0.15 : 0);
    if (sc <= bs || castStatic(m.map, u.x, u.z, a.x, a.z, 0.15) <= 1) continue;
    bs = sc; best = a;
  }
  b.healId = best ? best.id : -1;
  return best;
}

// Hold the trigger while tracking, let go at a charge that suits the range and the target: full at a distance, shorter when the shot kills or the fight is close.
function chargeFire(u, b, D, m, w, tgt, fd, aimed, hold, hpFrac, near) {
  const C = w.charge;
  if (!hold) return false;
  if (u.charge <= 0 && u.cd.fire <= 0 && !duty(m, b, D, m.time)) return false;
  if (u.primeT > 0) return aimed || u.charge > 0;
  const mix = (p, k) => p[0] + (p[1] - p[0]) * k;
  const clamp = (v) => Math.max(0, Math.min(1, v));
  let k = clamp((fd + tgt.radius * 0.5 + 0.8 - C.range[0]) / (C.range[1] - C.range[0]));
  const arm = tgt.def && u.passive !== 'pierce' ? tgt.def.armor || 0 : 0;
  const per = u.dmgMod * (u.dmgT > 0 ? u.dmgF : 1) * (1 - arm);
  const life = tgt.hp + (tgt.shield || 0);
  const kk = (life / per - C.dmg[0]) / (C.dmg[1] - C.dmg[0]);
  if (tgt.def && kk <= 1) k = Math.max(k, clamp(kk + 0.03));
  else if (tgt.decoy) k = Math.max(k, 0.3);
  else if (fd < 6 || hpFrac < 0.4 || near >= 3) k = Math.max(k, 0.4);
  else k = 1;
  return !(u.charge >= C.min + k * (C.max - C.min) - 1e-6 && aimed);
}

// While a sweeping beam runs: follow the enemy nearest to where the turret already points.
function sweepTrack(u, enemies, tgt) {
  let best = null, bs = 0.9;
  for (const e of enemies) {
    const d = hyp(e.x - u.x, e.z - u.z);
    if (d > 21) continue;
    const sc = Math.abs(angDiff(u.aim, Math.atan2(e.z - u.z, e.x - u.x))) + d * 0.01;
    if (sc < bs) { bs = sc; best = e; }
  }
  return best || tgt;
}

// A healing field at the cursor (vesau's Vung Thoi Gian): onto the spot where hurt allies stand, once the fight is on.
function healField(c, s) {
  const { u, m } = c;
  if (!c.enemies.length && !c.underFire) return false;
  let best = null, bv = 0.45;
  for (const a of m.units) {
    if (a.team !== u.team || !a.alive || hyp(a.x - u.x, a.z - u.z) > s.cast - 0.5) continue;
    let v = 0;
    for (const o of m.units) if (o.team === u.team && o.alive && hyp(o.x - a.x, o.z - a.z) < s.radius - 0.5) v += 1 - o.hp / o.maxHp;
    if (v > bv) { bv = v; best = a; }
  }
  if (!best) return false;
  c.b.sk.x = best.x; c.b.sk.z = best.z;
  return true;
}

function cageSkill(c, s) {
  const { u, m } = c;
  if (m.mode === 'trum') return false;
  let n = 0, weak = false;
  for (const e of c.enemies) if (!e.def.heavy && d2(e.x, e.z, u.x, u.z) < (s.radius * 0.92) ** 2) { n++; if (e.hp < e.maxHp * 0.45) weak = true; }
  return n >= 2 || (n === 1 && weak && c.hpFrac > 0.4);
}

// Bastion: enemies pressing on me (or on the allies who stand with me).
function bastionSkill(c, s) {
  const { u, m } = c;
  let n = 0, allies = 0;
  // the field's armour helps against anything, its push not against a boss: close to a boss it is still worth it for the allies inside
  for (const e of c.enemies) if ((m.mode === 'trum' || !e.def.heavy) && d2(e.x, e.z, u.x, u.z) < (s.radius + (e.def.heavy ? 4 : 1)) ** 2) n++;
  for (const a of m.units) if (a !== u && a.team === u.team && a.alive && d2(a.x, a.z, u.x, u.z) < s.radius * s.radius) allies++;
  return n >= 2 || (n >= 1 && c.underFire && (c.hpFrac < 0.65 || allies >= 1));
}

// A screen stops shots of the other team only, so it is worth it whenever fire is coming in, winning or not.
function screenWall(c, s) {
  const { u, m, tgt, td } = c;
  if (!tgt || !c.los || td > 18 || td < 5 || !(c.underFire || c.near >= 2)) return false;
  const a = Math.atan2(tgt.z - u.z, tgt.x - u.x), cx = u.x + Math.cos(a) * s.cast, cz = u.z + Math.sin(a) * s.cast;
  for (const z of m.zones) if (z.kind === 'wall' && z.screen && z.team === u.team && z.age < z.dur - 1 && hyp(z.x - cx, z.z - cz) < 3.5) return false;
  if (solidAt(m.map, cx, cz, 0.6)) return false;
  c.b.sk.aim = a; c.b.sk.tol = 0.2;
  return true;
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
  if (m.size <= 1) return true;   // nobody to wait for
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
  if (mineAlive - foeAlive >= Math.min(2, m.size - 1)) return true;
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
  const P = { kind: 'attack', T: null, defT: null, hunted, stepOut: hard ? 0.45 : smart ? 0.38 : 0, allow: true, outside: !!role.outside, far: role.standFar || 0, stage: null, stand: null };

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
    // never the whole team: at least one mech keeps attacking unless the main tower is the one in danger
    const nd = everyone ? 9 : Math.min(hard ? 3 : smart ? (dnear >= 3 ? 3 : 2) : (mainOpen ? 1 : 0), Math.max(1, m.size - 1));
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
    if (alive <= Math.floor(m.size * 0.4) && soon >= 1) { P.kind = 'wave'; return P; }
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
  const dd = P.far ? R + P.far : P.outside ? Math.max(R + 1.6, Math.min(R + 3.5, w.range * 0.8)) : Math.max(OT.r + 2.8, Math.min(R - 1.8, w.range * 0.72));
  b.stand = pick(dd, (u.slot - 2) * (P.outside ? 0.2 : 0.42), !w.lob, P.outside ? 1.5 : 0);
}

// The nearest enemy tower that can be hurt now (main towers only when open: no shot is wasted on a blocked one) and that my weapon reaches.
function pickTowerTarget(m, u, w) {
  let best = null, bd = 1e9;
  for (const t of m.towers) {
    if (!t.alive || t.team === u.team || !towerOpen(m, t)) continue;
    const d = hyp(t.x - u.x, t.z - u.z);
    if (d - t.r * 0.5 > w.range - 0.4 || d >= bd) continue;
    if (!w.lob && (!losClear(m.map, u.x, u.z, t.x, t.z, 0.2) || wallBlocks(m, u.x, u.z, t.x, t.z, 0.2, u.team))) continue;
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
  const tur = pickTurret(m, u, w, D);
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
  // the medic stays with the group, a step behind it, and backs off from anything that closes in
  if (role.heal && np.kind === 'attack') {
    const g = groupAnchor(m, u, own);
    if (g) {
      if (mechTgt && td < 7) return fightMove(m, u, b, D, role, tgt, td, w, los, now, hpFrac, underFire, enemies);
      return hyp(g[0] - u.x, g[1] - u.z) < 2 ? [0, 0, null, null, true] : [0, 0, g[0], g[1], false];
    }
  }
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

// A point 2.5 m behind the middle of the healthy allies (toward my own base), or null when nobody is about.
function groupAnchor(m, u, own) {
  let cx = 0, cz = 0, n = 0;
  for (const a of m.units) {
    if (a === u || a.team !== u.team || !a.alive || a.def.boss || (a.brain && a.brain.state === 'retreat') || d2(a.x, a.z, u.x, u.z) > 900) continue;
    cx += a.x; cz += a.z; n++;
  }
  if (!n) return null;
  cx /= n; cz /= n;
  const d = hyp(own[0] - cx, own[1] - cz) || 1;
  return safeGoal(m, u, cx + (own[0] - cx) / d * 2.5, cz + (own[1] - cz) / d * 2.5);
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

/* ===== kit-remake G4 bots: warp.to an own object, totem ===== */
// warp.to: go back to the own object when hurt and under fire, or before the recast window (left s) runs out; the sim picks the spot
function g4WarpTo(c, s, left) {
  const p = ownObject(c.m, c.u, s, false);
  if (!p) return false;
  if (!((c.hpFrac < 0.5 && c.underFire) || left < 0.4)) return false;
  c.b.sk.x = p.x; c.b.sk.z = p.z; c.b.sk.aim = null; c.b.sk.mx = null; c.b.sk.mz = null;
  return true;
}
// totem: plant it on the most hurt ally in reach (itself included) while enemies are about
SKILL_AI.totem = function (c, s) {
  const { u, m } = c;
  if (!c.enemies.length) return false;
  let best = null, bf = 0.75;
  for (const a of m.units) {
    if (a.team !== u.team || !a.alive || Math.hypot(a.x - u.x, a.z - u.z) > (s.at === 'self' ? 0.01 : s.cast)) continue;
    const f = a.hp / a.maxHp;
    if (f < bf) { bf = f; best = a; }
  }
  if (!best) return false;
  c.b.sk.x = best.x; c.b.sk.z = best.z;
  return true;
};
/* ===== end kit-remake G4 bots ===== */

/* ===== kit lane K1 (feat/dtt-k1): bot use of the K1 rows ===== */
// bless.bubble (Captain America Q): the bubble eats shots, so it goes on whoever is being shot at right now: the ally under fire
// nearest to death within reach, else myself when I am under fire (the caster is wrapped too either way).
function k1BotBubble(c, s, reach) {
  const { u, m } = c;
  if (!c.enemies.length) return false;
  let best = null, bf = 0.9;
  for (const a of m.units) {
    if (a === u || a.team !== u.team || !a.alive || a.combatT > 0.8 || a.bubT > 0 || hyp(a.x - u.x, a.z - u.z) > reach) continue;
    const f = a.hp / a.maxHp;
    if (f < bf) { bf = f; best = a; }
  }
  if (best) { c.b.sk.x = best.x; c.b.sk.z = best.z; return true; }
  if (!c.underFire || c.hpFrac > 0.85) return false;
  for (const a of m.units) if (a !== u && a.team === u.team && a.alive && hyp(a.x - u.x, a.z - u.z) < s.pick + 0.5) return false;
  c.b.sk.x = u.x; c.b.sk.z = u.z;
  return true;
}
// rally.shield (Captain America ult): worth it when the team inside the radius is in a fight: two of us under fire, or me alone and low
function k1BotRally(c, s) {
  const { u, m } = c;
  if (!c.enemies.length) return false;
  let hot = 0, hurt = 0;
  for (const a of m.units) {
    if (a.team !== u.team || !a.alive || d2(a.x, a.z, u.x, u.z) > s.radius * s.radius) continue;
    if (a.combatT < 1.2) hot++;
    if (a.hp < a.maxHp * 0.6 || a.stunT > 0) hurt++;
  }
  return hot >= 2 || (hot >= 1 && hurt >= 1);
}
/* ===== end kit lane K1 ===== */

/* ===== kit-remake K4 (tumay, enbac): bot policy for the G5 rows (sim.js "kit-remake K4") ===== */
// dash back: the bolt goes along the aim, the mech backs off: aim at a foe in the bolt's reach when the spot behind is free
function k4BotBack(c, s) {
  const { u, tgt, td, los } = c, v = s.onStart && s.onStart.volley;
  if (!tgt || !los || !v || td > v.range - 1 || td < 2) return false;
  if (!(td < 7 || c.underFire || c.hpFrac < 0.6)) return false;
  const a = Math.atan2(tgt.z - u.z, tgt.x - u.x), ex = u.x - Math.cos(a) * s.dist, ez = u.z - Math.sin(a) * s.dist;
  if (solidAt(c.m.map, ex, ez, u.moveRadius * 0.8) || inFoe(c.m, u, ex, ez) || lavaSeg(c.m.map, u.x, u.z, ex, ez, 0.5)) return false;
  const p = leadPoint(u, tgt, v.speed, c.D.lead);
  c.b.sk.aim = Math.atan2(p[1] - u.z, p[0] - u.x); c.b.sk.tol = Math.max(0.05, Math.atan2(tgt.radius, td) * 0.8);
  return true;
}
// U Minh Khu Hổ: a foe inside the cone, or an own orb in front with a foe within the orb's flight beyond it
function k4BotKnock(c, s) {
  const { u, tgt, td } = c;
  if (!tgt) return false;
  const a = Math.atan2(tgt.z - u.z, tgt.x - u.x);
  let ok = td < s.radius * 0.85;
  if (!ok && td < s.radius + s.orbKnock.range * 0.8) {
    for (const o of chaosOrbs(c.m, u)) {
      const dx = o.x - u.x, dz = o.zz - u.z, d = hyp(dx, dz);
      if (d <= s.radius && d > 0.3 && Math.abs(angDiff(Math.atan2(dz, dx), a)) < 0.35) { ok = true; break; }
    }
  }
  if (!ok) return false;
  c.b.sk.aim = a; c.b.sk.tol = Math.min(0.3, s.arc * 0.5);
  return true;
}
// Hỗn Độn Chi Phệ: with three orbs or more (or enough to finish the foe), a visible foe within reach
function k4BotDevour(c, s) {
  const { u, tgt, td } = c;
  if (!tgt || td > s.cast - 0.5) return false;
  const n = Math.min(chaosOrbs(c.m, u).length, s.max || 99);
  if (!n) return false;
  const sum = n * s.dmg + (s.grow || 0) * n * (n - 1) / 2;
  if (n < 3 && tgt.hp > sum * 0.9) return false;
  c.b.sk.x = tgt.x; c.b.sk.z = tgt.z;
  return true;
}
/* ===== end kit-remake K4 ===== */
/* ===== kit-remake G5 Kurumi (kit lane k8) bots ===== */
// rewind fwd: the mark keeps the hp an ally has now, so it is worth most at the start of a fight: cast when allies in range are being
// hurt (hurt in the last second) with enemies around, two of them, or one that is already under half hp.
function krBotRewind(c, s) {
  const { u, m } = c;
  if (!c.enemies.length && !c.underFire) return false;
  let hot = 0, low = 0;
  for (const a of m.units) {
    if (a.team !== u.team || !a.alive || d2(a.x, a.z, u.x, u.z) > s.radius * s.radius || a.combatT > 1) continue;
    hot++; if (a.hp < a.maxHp * 0.5) low++;
  }
  return hot >= 2 || low >= 1;
}
/* ===== end kit-remake G5 Kurumi bots ===== */
