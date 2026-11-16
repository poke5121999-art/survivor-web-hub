// The match simulation. Pure and deterministic: fixed 30 Hz ticks, one seeded RNG, no three.js, no DOM.
// The same code runs in the browser, in Node tests, and (later) on the host of an online room.
//
//   const m = createMatch({ map, seed, roster, mode });   roster: [{ team, mech, name, bot, diff }]   mode: a MODES key (default tdm)
//   step(m, inputs);                                inputs[unit.id] = { mx, mz, aim, fire, s1, s2, ult, heal, tx, tz }
//   m.events                                        what happened during the last tick, for effects, sound and HUD
//
// Angles are radians in the XZ plane: direction = (cos a, sin a).

import { TICK, RULES, PICKUPS, MECHS, PROPS, MODES, BOSSES, buildDef, formDef, matchSize, ruleFor } from './data.js';
import { mulberry } from './rng.js';
import { compileMap, mapsFor, castStatic, segCircle, solidAt, navBlock } from './maps.js';

const NO_INPUT = { mx: 0, mz: 0, aim: 0, fire: false, s1: false, s2: false, ult: false, heal: false, tx: 0, tz: 0 };
const SLOTS = ['s1', 's2', 'ult'];
// Everything a unit's own damage is multiplied by: the garage track, a power pick-up, a transform (skill.dmg).
const dmgScale = (u) => u.dmgMod * (u.dmgT > 0 ? u.dmgF : 1) * (u.tfT > 0 ? u.tfDmg : 1) * u.skillAmp;
// Where the damage being dealt right now comes from ('w' = the main weapon, else a skill id); meter reads it (weapon, distinct).
let curSrc = null;
// The unscaled amount of the last damage() call (0 when it hurt nobody): what hitfx chain passes on.
let lastBase = 0;
let chaining = false;

export function createMatch(opts) {
  const mode = MODES[opts.mode] ? opts.mode : 'tdm', size = matchSize(mode, opts.roster), rule = ruleFor(mode, size), pool = mapsFor(mode);
  const map = compileMap(pool.includes(opts.map) ? opts.map : pool[0], opts.theme);
  const m = {
    mode, rule, size, lives: rule.lives || 0, points: [], towers: [],
    map, seed: opts.seed >>> 0, rng: mulberry(opts.seed >>> 0), tick: 0, time: 0,
    target: opts.target || rule.target, duration: opts.duration || rule.duration,
    units: [], shots: [], zones: [], crates: [], events: [],
    props: map.props.map((p) => ({ id: p.id, x: p.x, z: p.z, kind: p.kind, r: PROPS[p.kind].r, hp: PROPS[p.kind].hp, alive: true })),
    score: [0, 0], over: false, winner: -1, nextId: 1, crateT: rule.crate.first,
    vents: map.hazards.filter((h) => h.kind === 'vent').map((h, i) => ({ id: h.id, x: h.x, z: h.z, r: h.r, t: RULES.vent.period * (0.5 + 0.5 * (i % 2)), warn: false })),
  };
  const slot = [0, 0];
  for (const r of opts.roster) {
    const mods = r.mods || {};
    const def = MECHS[r.mech] ? buildDef(r.mech, mods.lv) : BOSSES[r.mech];
    // In free-for-all every unit is its own team; `color` is the palette index the renderer uses (0 = ally look, 1 = enemy look).
    const team = mode === 'tudo' ? m.units.length : r.team;
    const u = {
      id: m.units.length, team, color: mode === 'tudo' ? 1 : r.team, mech: r.mech, def, name: r.name, bot: !!r.bot, diff: r.diff || 'normal',
      slot: mode === 'tudo' ? m.units.length : slot[r.team]++, paint: r.paint || null, glow: r.glow || null, decal: r.decal || null, radius: def.radius, moveRadius: def.boss ? def.radius : RULES.moveRadius, maxHp: Math.round(def.hp * (mods.hp || 1) * (def.boss ? rule.bossHp || 1 : 1)), dmgMod: (mods.dmg || 1) * (def.dmgUp || 1),
      lv: def.lv || null, passive: def.passive ? def.passive.do : null, stanceDef: def.skills.find((s) => s.do === 'stance') || null,
      x: 0, z: 0, px: 0, pz: 0, vx: 0, vz: 0, kx: 0, kz: 0, aim: r.team ? Math.PI : 0, heading: r.team ? Math.PI : 0, score: 0,
      hp: 0, alive: false, respawnT: 0, cd: { fire: 0, s1: 0, s2: 0, ult: 0, heal: 0 }, barrel: 0,
      kills: 0, deaths: 0, assists: 0, dmg: 0, healed: 0, pickups: 0, hitBy: {}, brain: null,
    };
    m.units.push(u);
    spawn(m, u, true);
  }
  if (mode === 'tudo') m.score = m.units.map(() => 0);
  if (mode === 'nha') {
    const T = rule.tower;
    for (const p of map.towers) {
      m.towers.push({ id: m.towers.length, team: p.team, color: p.team, kind: p.kind, x: p.x, z: p.z, r: T.radius, hp: T[p.kind], maxHp: T[p.kind], alive: true, cd: 1, charge: 0, aim: p.team ? Math.PI : 0, target: -1 });
      navBlock(map, p.x, p.z, T.radius, true);
    }
  }
  if (mode === 'chiem') {
    const spots = [[0, 0], [-map.hw * 0.4, -map.hd * 0.58], [map.hw * 0.4, map.hd * 0.58]];
    m.points = spots.map((p, i) => { const [x, z] = freeSpot(map, p[0], p[1]); return { id: i, x, z, r: rule.radius, owner: -1, prog: 0, acc: 0 }; });
  }
  return m;
}

function freeSpot(map, x, z) {
  for (let ring = 0; ring < 8; ring++) for (let k = 0; k < 8; k++) {
    const a = k * 0.785, px = x + Math.cos(a) * ring * 1.5, pz = z + Math.sin(a) * ring * 1.5;
    if (!solidAt(map, px, pz, 2.2)) return [px, pz];
  }
  return [x, z];
}

// Where a unit appears: its team's base pad, or in free-for-all the open spot farthest from everyone alive.
function spawnPoint(m, u) {
  if (m.mode !== 'tudo') return m.map.spawns[u.team][u.slot % 5];
  const spots = m.map.spawns[0].concat(m.map.spawns[1], m.map.cratePoints);
  let best = spots[u.id % spots.length], bd = -1;
  for (const p of spots) {
    if (solidAt(m.map, p[0], p[1], u.moveRadius)) continue;
    let d = 1e9;
    for (const o of m.units) if (o !== u && o.alive) d = Math.min(d, dist2(o.x, o.z, p[0], p[1]));
    if (d > bd) { bd = d; best = p; }
  }
  return best;
}

function clearStatus(u) {
  u.shield = 0; u.shieldMax = 0; u.shieldT = 0; u.slowT = 0; u.slowF = 0; u.stunT = 0;
  u.hasteT = 0; u.hasteF = 1; u.rapidT = 0; u.rapidF = 1; u.dmgT = 0; u.dmgF = 1;
  u.stealthT = 0; u.invulnT = 0; u.healT = 0; u.healRate = 0; u.revealT = 0; u.combatT = 99;
  u.armorT = 0; u.armorF = 0; u.reflectF = 0; u.rageT = 0; u.rageF = 0; u.markT = 0; u.markBy = -1; u.markAmp = 0; u.markEx = 0;
  u.primeT = 0; u.charge = 0; u.stance = false; u.ambushT = 0; u.woundT = 0;
  u.rootT = 0; u.weakenT = 0; u.weakenF = 1; u.ampT = 0; u.ampF = 0;
  u.burnT = 0; u.burnN = 0; u.burnDps = 0; u.burnBy = -1;
  u.tfT = 0; u.tfSlot = -1; u.tfDmg = 1; u.ccT = 0; u.radius = u.def.radius;
  u.rampN = 0; u.rampT = 0; u.rampTo = -1; u.rampAcc = 0; u.recast = null;
  u.stkN = 0; u.stkT = 0; u.stkBy = -1;
  u.parryT = 0; u.parrySlot = -1; u.flurry = null; u.tfCc = 1; u.ccPrev = null; u.hpHist = [];
  u.form = 0; u.def = formDef(u.def, 0);
  u.meter = 0; u.lastSrc = null; u.hurtAt = -99; u.skillAmp = 1; u.shieldBurst = null; u.blindT = 0; u.blindF = 1; u.blindSpread = 0; u.mmT = 0; u.mmBy = -1;
  u.cast = null; u.dash = null; u.bush = -1; u.kx = 0; u.kz = 0; u.vx = 0; u.vz = 0; u.hitBy = {};
}

function spawn(m, u, first) {
  const p = spawnPoint(m, u);
  u.x = u.px = p[0]; u.z = u.pz = p[1];
  u.hp = u.maxHp; u.alive = true; u.respawnT = 0;
  clearStatus(u);
  u.invulnT = first ? 0 : RULES.spawnGuard;
  if (!first) m.events.push({ t: 'respawn', id: u.id, x: u.x, z: u.z });
}

export function step(m, inputs) {
  m.events.length = 0;
  if (m.over) return;
  m.tick++; m.time += TICK;
  for (const u of m.units) stepUnit(m, u, clean(inputs && inputs[u.id]));
  stepShots(m);
  stepZones(m);
  stepCrates(m);
  stepVents(m);
  if (m.mode === 'chiem') stepPoints(m);
  if (m.mode === 'nha') stepTowers(m);
  const timeUp = m.time >= m.duration;
  if (m.mode === 'trum') {
    const boss = m.units.find((u) => u.def.boss);
    if (!boss.alive) finish(m, 0); else if (m.lives <= 0 || timeUp) finish(m, 1);
  } else if (m.mode === 'nha') {
    const hp = [0, 0];
    for (const t of m.towers) if (t.alive) hp[t.team] += t.hp;
    const fallen = m.towers.find((t) => t.kind === 'main' && !t.alive);
    if (fallen) finish(m, 1 - fallen.team); else if (timeUp) finish(m, hp[0] === hp[1] ? -1 : hp[0] > hp[1] ? 0 : 1);
  } else {
    const lead = Math.max(...m.score);
    if (lead >= m.target || timeUp) finish(m, m.score.filter((s) => s === lead).length > 1 ? -1 : m.score.indexOf(lead));
  }
}

// Inputs come from bots, devices and (online) other machines: a non-finite number must never reach the simulation.
function clean(inp) {
  if (!inp) return NO_INPUT;
  return Number.isFinite(inp.mx + inp.mz + inp.aim + inp.tx + inp.tz) ? inp : NO_INPUT;
}

function finish(m, winner) {
  m.over = true; m.winner = winner;
  m.events.push({ t: 'over', winner });
}

export const towerOpen = (m, t) => t.alive && (t.kind === 'sub' || !m.towers.some((o) => o.team === t.team && o.kind === 'sub' && o.alive));

function hurtTower(m, t, amount, src) {
  if (!t.alive || !src || src.team === t.team) return;
  amount *= src.def.towerMul ?? 1;
  if (!towerOpen(m, t)) { m.events.push({ t: 'towerBlock', tower: t.id, x: t.x, z: t.z }); return; }
  t.hp -= amount; src.dmg += amount;
  m.events.push({ t: 'towerHit', tower: t.id, by: src.id, x: t.x, z: t.z, amt: amount });
  if (t.hp > 0) return;
  t.hp = 0; t.alive = false; m.score[src.team]++;
  navBlock(m.map, t.x, t.z, t.r, false);
  m.events.push({ t: 'towerDown', tower: t.id, team: t.team, kind: t.kind, by: src.id, x: t.x, z: t.z });
}

// Towers shoot the enemy that most recently hurt one of their mechs (within rule.tower.aggro seconds), otherwise the nearest one they can see.
function stepTowers(m) {
  const T = m.rule.tower;
  for (const t of m.towers) {
    if (!t.alive) continue;
    t.cd -= TICK;
    let best = null, score = -1;
    for (const u of m.units) {
      if (u.team === t.team || !u.alive || !visibleTo(m, u, t.team)) continue;
      const d2 = dist2(u.x, u.z, t.x, t.z);
      if (d2 > T.range * T.range) continue;
      const s = (m.time - (u.hurtAllyAt ?? -99) <= T.aggro ? 1000 : 0) + (T.range * T.range - d2);
      if (s > score) { score = s; best = u; }
    }
    if (!best) { t.charge = 0; t.target = -1; continue; }
    t.target = best.id; t.aim = Math.atan2(best.z - t.z, best.x - t.x);
    if (t.cd > 0) continue;
    t.charge += TICK / T.windup;
    if (t.charge < 1) continue;
    t.charge = 0; t.cd = T.cd;
    const dx = Math.cos(t.aim), dz = Math.sin(t.aim), x = t.x + dx * (t.r + 0.4), z = t.z + dz * (t.r + 0.4);
    m.shots.push({ id: m.nextId++, team: t.team, color: t.color, owner: -1, tower: t.id, x, z, px: x, pz: z, dx, dz, speed: T.speed, left: T.range + 3, dmg: T.dmg, splash: 0, knock: 0, slow: 0, slowDur: 0, r: 0.3, vis: 'tower', over: true });
    m.events.push({ t: 'towerFire', tower: t.id, x: t.x, z: t.z, a: t.aim });
  }
}

// Control points: a team alone on a point pulls its progress toward that team; a full bar flips the owner. Owned points pay score on a timer.
function stepPoints(m) {
  const R = m.rule;
  for (const p of m.points) {
    let a = 0, b = 0;
    for (const u of m.units) if (u.alive && dist2(u.x, u.z, p.x, p.z) < p.r * p.r) { if (u.team === 0) a++; else b++; }
    const dir = a && !b ? -1 : b && !a ? 1 : 0;
    if (dir) {
      p.prog = Math.max(-1, Math.min(1, p.prog + dir * TICK / R.captureTime * (1 + 0.25 * (Math.max(a, b) - 1))));
      const owner = p.prog <= -1 ? 0 : p.prog >= 1 ? 1 : p.owner;
      if (owner !== p.owner) { p.owner = owner; p.acc = 0; m.events.push({ t: 'capture', point: p.id, team: owner, x: p.x, z: p.z }); }
    }
    if (p.owner >= 0) { p.acc += TICK; if (p.acc >= R.every) { p.acc -= R.every; m.score[p.owner] += 1; } }
  }
}

export const hidden = (u) => u.stealthT > 0 || (u.bush >= 0 && u.revealT <= 0);

// Can `team` see unit u? Hidden units are seen only by an enemy standing next to them.
export function visibleTo(m, u, team) {
  if (u.team === team || !hidden(u)) return true;
  const s = RULES.bushSight;
  for (const o of m.units) {
    if (o.team !== team || !o.alive) continue;
    const dx = o.x - u.x, dz = o.z - u.z;
    if (dx * dx + dz * dz < s * s) return true;
  }
  return false;
}

// `mods` on a passive row (data-driven, read for every passive): lowHp { below, haste, armor } is on while hp is under the fraction;
// onKill { reset { slots, frac }, assist { reset } } fires from takedown().
export function lowHpMod(u) {
  const P = u.def.passive, low = P && P.mods && P.mods.lowHp;
  return low && u.hp < u.maxHp * low.below ? low : null;
}

// ramp (passive): N stacks of step each, on one stat: 'rapid' (fire rate), 'dmg' (shot damage) or 'armor'.
export function rampBonus(u, stat) {
  const P = u.passive === 'ramp' && u.def.passive;
  return P && P.stat === stat ? u.rampN * P.step : 0;
}
function rampGain(u, to) {
  const P = u.def.passive;
  if (P.reset === 'switch' && u.rampTo !== to) u.rampN = 0;
  u.rampTo = to; u.rampN = Math.min(P.max, u.rampN + 1); u.rampT = P.dur;
}

// meter (passive): u.meter climbs toward P.max from the sources in P.gain (hit, weapon, cast, hurt, absorbed, calm, distinct), times
// mods.lowHp.gain. At max it is armed (meterArmed) and P.spend.kind decides what it buys: 'shot' (the next main shot, x mul, plus stun),
// 'skill' (the next damaging skill x mul), 'chain' (the next hit jumps on), 'shield' and 'nova' (spent the moment it fills).
// The event meter { id, kind, on } says when it filled (1) and when it was spent (0).
export const meterArmed = (u) => u.passive === 'meter' && u.meter >= u.def.passive.max;
function meterAdd(m, u, key, amount) {
  const P = u.def.passive, g = P.gain[key];
  if (!g || !(amount > 0) || u.meter >= P.max) return;
  const low = lowHpMod(u);
  u.meter = Math.min(P.max, u.meter + g * amount * (low && low.gain ? low.gain : 1));
  if (u.meter > P.max - 1e-6) u.meter = P.max;
  if (u.meter < P.max) return;
  const S = P.spend;
  m.events.push({ t: 'meter', id: u.id, kind: S.kind, on: 1 });
  if (S.kind === 'shield') {
    u.shield = Math.max(u.shield, Math.min(S.cap ?? 1e9, u.shield + S.amount)); u.shieldMax = Math.max(u.shieldMax, u.shield); u.shieldT = Math.max(u.shieldT, S.dur);
    meterSpent(m, u);
  } else if (S.kind === 'nova') {
    meterSpent(m, u);
    m.events.push({ t: 'nova', id: u.id, x: u.x, z: u.z, r: S.radius });
    areaDamage(m, u, u.x, u.z, S.radius, S.dmg, S, null);
  }
}
function meterSpent(m, u) {
  u.meter = 0;
  m.events.push({ t: 'meter', id: u.id, kind: u.def.passive.spend.kind, on: 0 });
}
// The unit has just dealt damage to `o`: the chain spend rides this hit, then the hit itself feeds the meter.
function meterHit(m, u, o) {
  const P = u.def.passive;
  if (curSrc === 'w' && P.gain.weapon) { o.mmT = 4; o.mmBy = u.id; }
  if (P.spend.kind === 'chain' && u.meter >= P.max) { meterSpent(m, u); chainHit(m, u, o, P.spend, lastBase); }
  meterAdd(m, u, 'hit', 1);
  if (curSrc === 'w') meterAdd(m, u, 'weapon', 1);
  if (curSrc && P.gain.distinct) { if (u.lastSrc && u.lastSrc !== curSrc) meterAdd(m, u, 'distinct', 1); u.lastSrc = curSrc; }
}
// The armed shot spend, taken by the next main-weapon shot: { mul, stun } or null.
function meterShot(m, u) {
  if (!meterArmed(u) || u.def.passive.spend.kind !== 'shot') return null;
  const S = u.def.passive.spend;
  meterSpent(m, u);
  return { mul: S.mul || 1, stun: S.stun || 0, patch: S.patch || null };
}
// hitfx chain: from the mech just hit, jump to the n nearest other enemies inside r (nearest first, lower id on a tie) for base x mul each. It never chains again.
function chainHit(m, src, o, C, base) {
  if (chaining || !(base > 0)) return;
  const near = [];
  for (const t of m.units) {
    if (t === o || !t.alive || t.team === src.team) continue;
    const d = dist2(t.x, t.z, o.x, o.z);
    if (d <= C.r * C.r) near.push([d, t]);
  }
  near.sort((a, b) => a[0] - b[0] || a[1].id - b[1].id);
  if (!near.length) return;
  chaining = true;
  const pts = [[o.x, o.z]];
  for (const [, t] of near.slice(0, C.n)) { pts.push([t.x, t.z]); damage(m, t, base * C.mul, src); }
  chaining = false;
  m.events.push({ t: 'chain', id: src.id, pts });
}
// shield.burst: the shield is gone (broken or timed out): it goes off around its owner once.
function popShield(m, u) {
  const B = u.shieldBurst;
  if (!B) return;
  u.shieldBurst = null;
  m.events.push({ t: 'nova', id: u.id, x: u.x, z: u.z, r: B.radius });
  areaDamage(m, u, u.x, u.z, B.radius, B.dmg, B, null);
}

export function unitSpeed(u) {
  if (u.stance || u.rootT > 0) return 0;
  let s = u.def.speed;
  if (u.hasteT > 0) s *= u.hasteF;
  const low = lowHpMod(u);
  if (low && low.haste) s *= low.haste;
  if (u.slowT > 0) s *= 1 - u.slowF * (u.passive === 'steady' ? 0.5 : 1);
  if (u.cast) s *= u.cast.move;
  if (u.charge > 0 && !(u.primeT > 0)) s *= weaponOf(u).charge.move;
  return s;
}

// Radians per second the turret follows the aim input. A planted siege mech and a sweeping beam turn slowly.
export function turnRate(u) {
  if (u.cast && u.cast.skill.turn) return u.cast.skill.turn;
  if (u.stance) return u.stanceDef.turn;
  return u.def.turn || 40;
}
export const aimStep = (u, want, dt) => turnTo(u.aim, want, turnRate(u) * dt);

// Range and damage of the main weapon as the unit stands: a planted siege mech reaches further and hits harder.
// The main weapon as the unit plays it right now: a transform with a weapon row swaps it in for the duration.
export function weaponOf(u) {
  const tw = u.tfT > 0 && u.def.tfWeapon;
  return tw ? tw[u.tfSlot >= 0 ? u.tfSlot : Object.keys(tw)[0]] || u.def.weapon : u.def.weapon;
}
export const weaponRange = (u) => weaponOf(u).range * (u.stance ? u.stanceDef.range : 1) * (u.blindT > 0 ? u.blindF : 1);

// Fraction of incoming damage a unit shrugs off: its own plating, a fortify or bastion buff, a planted stance, an ally's ward.
export function armorOf(m, u) {
  let a = (u.def.armor || 0) + (u.armorT > 0 ? u.armorF : 0) + (u.stance ? u.stanceDef.armor : 0) + (lowHpMod(u)?.armor || 0) + rampBonus(u, 'armor');
  for (const o of m.units) {
    if (o === u || o.team !== u.team || !o.alive || o.passive !== 'ward') continue;
    const P = o.def.passive;
    if (dist2(o.x, o.z, u.x, u.z) < P.radius * P.radius) { a += P.armor; break; }
  }
  return Math.min(RULES.armorCap, a);
}

export function gripAt(map, x, z, u) {
  if (u && u.def.hover) return 14;
  for (const h of map.hazards) if (h.kind === 'ice' && dist2(x, z, h.x, h.z) <= h.r * h.r) return RULES.ice.grip;
  return 14;
}

// One tick of driving: steer the velocity toward the stick, move, slide along what is solid. A guest runs this same
// function on its own mech between snapshots (predict.js), so the host and the guest agree on where a stick input leads.
export function walk(m, u, inp, grip) {
  const sp = u.stunT > 0 ? 0 : unitSpeed(u);
  let mx = inp.mx, mz = inp.mz;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const k = Math.min(1, grip * (u.def.accel || 1) * TICK);
  u.vx += (mx * sp - u.vx) * k; u.vz += (mz * sp - u.vz) * k;
  moveUnit(m, u, (u.vx + u.kx) * TICK, (u.vz + u.kz) * TICK);
  if (len > 0.2) u.heading = turnTo(u.heading, Math.atan2(mz, mx), 9 * TICK);
}

function bushAt(map, x, z) {
  for (const b of map.bushes) { const dx = b.x - x, dz = b.z - z; if (dx * dx + dz * dz < b.r * b.r) return b.id; }
  return -1;
}

function stepUnit(m, u, inp) {
  const dt = TICK;
  u.px = u.x; u.pz = u.z;
  if (!u.alive) { u.respawnT -= dt; if (u.respawnT <= 0) spawn(m, u, false); return; }

  // transform.ccResist: a stun, slow or root that landed since last tick lasts only tfCc of what it was given
  if (u.ccPrev) for (let i = 0; i < 3; i++) { const k = CC_KEYS[i], d = u[k] - u.ccPrev[i]; if (d > 1e-9) u[k] = u.ccPrev[i] + d * u.tfCc; }
  for (const k in u.cd) if (u.cd[k] > 0) u.cd[k] = Math.max(0, u.cd[k] - dt * (k === 'fire' ? (u.rapidT > 0 ? u.rapidF : 1) * (1 + rampBonus(u, 'rapid')) : 1));
  for (const k of ['slowT', 'stunT', 'hasteT', 'rapidT', 'dmgT', 'stealthT', 'invulnT', 'revealT', 'armorT', 'rageT', 'markT', 'primeT', 'ambushT', 'rootT', 'weakenT', 'ampT', 'ccT', 'blindT', 'mmT', 'stkT']) if (u[k] > 0) u[k] = Math.max(0, u[k] - dt);
  if (u.stkN > 0 && u.stkT <= 0) u.stkN = 0;
  u.ccPrev = u.tfT > 0 && u.tfCc < 1 ? [u.stunT, u.slowT, u.rootT] : null;
  // counter: the window runs out without a hit and 40% of the cooldown comes back
  if (u.parryT > 0) {
    u.parryT -= dt;
    if (u.parryT <= 0) { u.parryT = 0; const ps = u.def.skills[u.parrySlot]; if (ps) u.cd[SLOTS[u.parrySlot]] = Math.max(0, u.cd[SLOTS[u.parrySlot]] - ps.cd * 0.4); }
  }
  if (u.shieldT > 0) { u.shieldT -= dt; if (u.shieldT <= 0) { u.shield = 0; u.shieldT = 0; popShield(m, u); } }
  if (u.skillAmp !== 1 && !u.cast && !u.dash) u.skillAmp = 1;
  if (u.tfT > 0) { u.tfT -= dt; if (u.tfT <= 0) endTransform(m, u); }
  // burn (hitfx): damage over time, N stacks, credited to whoever lit it
  if (u.burnT > 0) {
    u.burnT -= dt;
    if (u.burnT <= 0) { u.burnT = 0; u.burnN = 0; }
    else { damage(m, u, u.burnN * u.burnDps * dt, u.burnBy >= 0 ? m.units[u.burnBy] : null); if (!u.alive) return; }
  }
  // dash.recast: the window to press the skill again runs only while the unit is free to
  if (u.recast && !u.dash && !u.cast) {
    u.recast.t -= dt;
    if (u.recast.t <= 0) { u.cd['s1 s2 ult'.split(' ')[u.recast.slot]] = u.def.skills[u.recast.slot].cd; u.recast = null; }
  }
  u.combatT += dt;
  // rewind reads the hit points of the last three seconds, one sample each half second (host side only: only what it heals travels)
  if (m.tick % 15 === 0) { u.hpHist.push(u.hp); if (u.hpHist.length > 7) u.hpHist.shift(); }
  u.bush = bushAt(m.map, u.x, u.z);
  if (u.passive) PASSIVE_TICK[u.passive]?.(m, u);
  if (u.bush < 0) for (const z of m.zones) if (z.hide && dist2(u.x, u.z, z.x, z.z) < z.r * z.r) { u.bush = 1000 + z.id; break; }

  if (m.mode !== 'tudo' && !u.def.boss) {
    const own = m.map.bases[u.team], foe = m.map.bases[1 - u.team], br = RULES.baseRadius;
    if (dist2(u.x, u.z, own[0], own[1]) < br * br) { if (u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * RULES.baseRegen * dt); }
    else if (m.mode !== 'trum' && m.mode !== 'nha' && dist2(u.x, u.z, foe[0], foe[1]) < br * br) { burn(m, u, RULES.baseBurn * dt); if (!u.alive) return; }
  }
  const grip = gripAt(m.map, u.x, u.z, u);
  for (const h of m.map.hazards) {
    if (h.kind === 'vent' || h.kind === 'ice' || dist2(u.x, u.z, h.x, h.z) > h.r * h.r) continue;
    if (h.kind === 'mud') { if (!u.def.hover && !u.def.heavy) { u.slowT = Math.max(u.slowT, 0.2); u.slowF = Math.max(u.slowT > 0.2 ? u.slowF : 0, RULES.mud.slow); } }
    else { burn(m, u, RULES.lava.dps * dt); if (!u.alive) return; }
  }
  if (!u.def.boss && u.combatT > RULES.regenDelay && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * RULES.regen * dt);
  if (u.woundT > 0) u.woundT -= dt;
  if (u.healT > 0) { u.healT = Math.max(0, u.healT - dt); heal(m, u, u.healRate * dt, u, true); }

  if (u.def.heavy) { u.stunT = 0; u.kx = 0; u.kz = 0; }
  if (u.ccT > 0) { u.stunT = 0; u.slowT = 0; u.rootT = 0; u.kx = 0; u.kz = 0; }
  if (u.stance) { u.kx = 0; u.kz = 0; }
  const stunned = u.stunT > 0;
  if (stunned) { inp = NO_INPUT; u.cast = null; u.charge = 0; }
  else {
    // A tracking beam (beam.track) keeps its aim on the target picked at cast time while it winds up.
    if (u.cast && u.cast.target >= 0) { const o = m.units[u.cast.target]; if (o.alive) u.cast.aim = Math.atan2(o.z - u.z, o.x - u.x); }
    u.aim = u.cast && u.cast.lock ? u.cast.aim : aimStep(u, inp.aim, dt);
  }

  if (u.cast) {
    const c = u.cast;
    c.t -= dt;
    if (c.skill.do === 'barrage' && c.skill.channel) {
      c.acc += dt;
      while (c.acc >= c.skill.channel.every) { c.acc -= c.skill.channel.every; channelStrike(m, u, c.skill, inp); }
    }
    // volley.burst: the same volley again every gap seconds
    if (c.skill.do === 'volley' && c.skill.burst) {
      c.acc += dt;
      while (c.acc >= c.skill.burst.gap - 1e-9 && c.left > 0) { c.acc -= c.skill.burst.gap; c.left--; fireVolley(m, u, c.skill); }
    }
    if (c.skill.do === 'sweep' && c.t <= c.skill.dur) {
      c.acc += dt;
      while (c.acc >= SWEEP_PULSE) { c.acc -= SWEEP_PULSE; fireBeam(m, u, { range: c.skill.range, width: c.skill.width, dmg: c.skill.dps * SWEEP_PULSE }, u.aim); }
    }
    if (c.t <= 0) { u.cast = null; FINISH[c.skill.do](m, u, c.skill, c); }
  }

  if (u.dash) stepDash(m, u);
  else walk(m, u, inp, grip);
  const drag = u.passive === 'steady' ? 0.6 : 0.8;
  u.kx *= drag; u.kz *= drag;
  if (stunned || !u.alive) return;

  if (inp.heal && u.cd.heal <= 0 && u.hp < u.maxHp) {
    u.cd.heal = RULES.healItem.cd; u.healT = RULES.healItem.dur; u.healRate = u.maxHp * RULES.healItem.frac / RULES.healItem.dur;
    m.events.push({ t: 'item', id: u.id });
  }
  if (u.cast || u.dash) { u.charge = 0; return; }
  for (let i = 0; i < 3; i++) {
    const key = SLOTS[i], rc = u.recast, re = !!rc && rc.slot === i && rc.t > 0;
    if (!inp[key] || (u.cd[key] > 0 && !re)) continue;
    const s = u.def.skills[i], at = m.events.length, wasHidden = u.stealthT;
    if (u.rootT > 0 && ROOT_BLOCKS[s.do]) continue;
    m.events.push({ t: 'skill', id: u.id, slot: i, skill: s.id, x: u.x, z: u.z, a: u.aim });
    u.stealthT = 0;
    // A skill that needs a target and finds none (swap, mark) does not happen: a short lockout instead of the cooldown.
    const hide = u.revealT;
    u.revealT = RULES.revealOnFire;
    // meter 'skill': an armed meter powers up the next skill that deals damage (skillAmp lives until its cast or dash is over)
    const P = u.passive === 'meter' ? u.def.passive : null, amped = !!P && P.spend.kind === 'skill' && u.meter >= P.max && !!(s.dmg || s.dps);
    if (amped) u.skillAmp = P.spend.mul;
    if (CAST[s.do](m, u, s, inp) === false) { m.events.length = at; u.cd[key] = 0.4; u.stealthT = wasHidden; u.revealT = hide; u.skillAmp = 1; continue; }
    if (amped) meterSpent(m, u);
    if (P) meterAdd(m, u, 'cast', 1);
    if (!u.cast && !u.dash) u.skillAmp = 1;
    if (s.recast) {
      // dash.recast: the skill stays ready for another press inside the window; the cooldown starts after the last one
      if (re) { rc.left--; if (rc.left <= 0) { u.recast = null; u.cd[key] = s.cd; } else { rc.t = s.recast.window; u.cd[key] = 0; } }
      else { u.recast = { slot: i, left: s.recast.n - 1, t: s.recast.window }; u.cd[key] = 0; }
    } else u.cd[key] = s.cd;
    // thrifty (passive): a cast sometimes gives most of its cooldown back
    if (u.passive === 'thrifty' && !s.recast && m.rng() < u.def.passive.chance) { u.cd[key] *= 1 - u.def.passive.refund; m.events.push({ t: 'thrift', id: u.id, slot: i }); }
    // form (passive) flip: using the slot changes the stance
    if (u.passive === 'form' && u.def.passive.flip === key) flipForm(m, u);
    u.charge = 0;
    return;
  }
  if (weaponOf(u).charge) stepCharge(m, u, inp);
  else if (inp.fire && u.cd.fire <= 0) fireWeapon(m, u, inp);
}

// A charge weapon fills while fire is held and shoots when it is let go (or when it has been held full for `hold` seconds).
function stepCharge(m, u, inp) {
  const w = weaponOf(u), C = w.charge;
  if (u.cd.fire > 0) { u.charge = 0; return; }
  let go = false;
  if (inp.fire) {
    if (u.primeT > 0) { u.charge = C.max; go = true; }
    else { u.charge = Math.min(C.max + C.hold, u.charge + TICK * (u.rapidT > 0 ? u.rapidF : 1)); go = u.charge >= C.max + C.hold; }
  } else if (u.charge > 0) { go = u.charge >= C.min; if (!go) u.charge = 0; }
  if (!go) return;
  const k = Math.max(0, Math.min(1, (u.charge - C.min) / (C.max - C.min))), mix = (p) => p[0] + (p[1] - p[0]) * k;
  u.charge = 0; u.primeT = 0; u.cd.fire = w.cd; u.stealthT = 0; u.revealT = RULES.revealOnFire;
  m.events.push({ t: 'fire', id: u.id, vis: w.vis, x: u.x, z: u.z, a: u.aim, side: 0 });
  fireBeam(m, u, { range: mix(C.range), width: mix(C.width), dmg: mix(C.dmg) }, u.aim);
}

const SWEEP_PULSE = 0.2;
const CC_KEYS = ['stunT', 'slowT', 'rootT'];
// A rooted mech can still shoot and cast, but not move itself.
const ROOT_BLOCKS = { dash: 1, blink: 1, leap: 1, warp: 1, recoil: 1, flurry: 1 };

// Once-a-tick work of a passive trait. The other passives act where damage, kills and deployables are handled.
const PASSIVE_TICK = {
  aura(m, u) {
    if ((m.tick + u.id) % 15) return;
    const P = u.def.passive;
    for (const o of m.units) if (o !== u && o.team === u.team && o.alive && dist2(o.x, o.z, u.x, u.z) < P.radius * P.radius) heal(m, o, P.hps * 0.5, u, true);
  },
  ambush(m, u) { if (hidden(u)) u.ambushT = u.def.passive.linger; },
  // ramp: 'still' grows while the mech stands (it resets when it moves, if reset is 'move'); 'hit' and 'hurt' only fade, in damage() they grow
  ramp(m, u) {
    const P = u.def.passive;
    if (P.on === 'still') {
      if (!u.dash && Math.hypot(u.vx + u.kx, u.vz + u.kz) < 0.3) {
        u.rampAcc += TICK;
        if (u.rampAcc >= P.every) { u.rampAcc -= P.every; u.rampN = Math.min(P.max, u.rampN + 1); }
      } else { u.rampAcc = 0; if (P.reset === 'move') u.rampN = 0; }
      return;
    }
    if (u.rampN > 0) { u.rampT -= TICK; if (u.rampT <= 0) { u.rampN--; u.rampT = 0.5; } }
  },
  // meter: calm fills one per second while nobody has hurt this mech for two seconds
  meter(m, u) {
    const P = u.def.passive;
    if (P.gain.calm && m.time - u.hurtAt > 2) meterAdd(m, u, 'calm', TICK);
  },
  // regen: every half second heal hps of max hp plus `missing` of the lost hp (x mods.lowHp.regen when low), ignoring combat; near: allies inside r
  // get the same hps, times mul when they are under `below` of their hp
  regen(m, u) {
    if ((m.tick + u.id) % 15) return;
    const P = u.def.passive, low = lowHpMod(u), k = low && low.regen ? low.regen : 1;
    const amt = ((P.hps || 0) * u.maxHp + (P.missing || 0) * (u.maxHp - u.hp)) * k * 0.5;
    if (amt > 0) heal(m, u, amt, u, true);
    const N = P.near;
    if (!N || !P.hps) return;
    for (const o of m.units) {
      if (o === u || o.team !== u.team || !o.alive || o.hp >= o.maxHp || dist2(o.x, o.z, u.x, u.z) > N.r * N.r) continue;
      heal(m, o, P.hps * o.maxHp * 0.5 * (o.hp < o.maxHp * N.below ? N.mul : 1), u, true);
    }
  },
  // brittle.reveal: enemies of this mech under the fraction, inside r, cannot hide (no bush, no stealth).
  brittle(m, u) {
    const R = u.def.passive.reveal;
    if (!R) return;
    for (const o of m.units) {
      if (o.team === u.team || !o.alive || o.hp >= o.maxHp * R.below || dist2(o.x, o.z, u.x, u.z) > R.r * R.r) continue;
      o.stealthT = 0; o.revealT = Math.max(o.revealT, 0.2);
    }
  },
};

// A hitscan line weapon: the first mech the line touches is healed (an ally who can use it) or hurt (an enemy).
function fireRay(m, u, w) {
  const dx = Math.cos(u.aim), dz = Math.sin(u.aim), scale = dmgScale(u) * (1 + rampBonus(u, 'dmg'));
  let len = w.range * Math.min(1, castStatic(m.map, u.x, u.z, u.x + dx * w.range, u.z + dz * w.range, 0.15)), hit = null, tower = null;
  for (const o of m.units) {
    if (o === u || !o.alive) continue;
    if (o.team === u.team && !(o.hp < o.maxHp || (u.passive === 'overheal' && o.shield < u.def.passive.cap))) continue;
    const along = (o.x - u.x) * dx + (o.z - u.z) * dz;
    if (along <= 0 || along > len + o.radius) continue;
    if (Math.abs((o.x - u.x) * dz - (o.z - u.z) * dx) < w.width / 2 + o.radius) { len = Math.max(0.5, along); hit = o; }
  }
  for (const t of m.towers) {
    if (!t.alive || t.team === u.team) continue;
    const along = (t.x - u.x) * dx + (t.z - u.z) * dz;
    if (along > 0 && along < len + t.r && Math.abs((t.x - u.x) * dz - (t.z - u.z) * dx) < w.width / 2 + t.r) { len = Math.max(0.5, along - t.r); hit = null; tower = t; }
  }
  if (tower) hurtTower(m, tower, w.dmg * scale, u);
  else if (hit && hit.team === u.team) heal(m, hit, w.heal * scale, u);
  else if (hit) damage(m, hit, w.dmg * scale, u);
  m.events.push({ t: 'ray', id: u.id, x0: u.x, z0: u.z, x1: u.x + dx * len, z1: u.z + dz * len, on: tower ? 'tower' : hit ? (hit.team === u.team ? 'ally' : 'foe') : 'none' });
}

function fireWeapon(m, u, inp) {
  const w = weaponOf(u);
  u.cd.fire = w.cd; u.stealthT = 0; u.revealT = RULES.revealOnFire;
  if (w.ray) { curSrc = 'w'; fireRay(m, u, w); curSrc = null; return; }
  if (w.lob) {
    // A lobbed shell is a delayed strike at the aim point: it flies over walls and everyone sees where it lands.
    const [x, z] = aimPoint(u, inp, w.range);
    addZone(m, u, { kind: 'strike', lob: true, x0: u.x, z0: u.z, x, z, r: w.splash, delay: w.flight, total: w.flight, dmg: w.dmg, fx: w.slow ? { slow: w.slow, slowDur: w.slowDur } : null });
    m.events.push({ t: 'fire', id: u.id, vis: w.vis, x: u.x, z: u.z, a: u.aim, side: 0 });
    return;
  }
  const n = w.n || 1;
  let side = 0;
  if (w.alt) { u.barrel ^= 1; side = u.barrel ? w.alt : -w.alt; }
  const base = u.aim + (w.spread ? (m.rng() - 0.5) * 2 * w.spread : 0);
  const st = u.stance ? u.stanceDef : null;
  const boost = u.passive === 'meter' ? meterShot(m, u) : null;
  // meter 'shot' patch: the armed shot flies as a different projectile (longer, faster, wider)
  const sw = boost && boost.patch ? { ...w, ...boost.patch } : w;
  for (let i = 0; i < n; i++) spawnShot(m, u, sw, base + (i - (n - 1) / 2) * (w.fan || 0), side, st, 'w', boost);
  m.events.push({ t: 'fire', id: u.id, vis: sw.vis, x: u.x, z: u.z, a: base, side, boost: boost ? 1 : 0 });
}

// st: the stance row when a planted mech fires its main weapon (longer reach, harder hit).
// src: where the damage comes from ('w' or a skill id); boost: a meter 'shot' spend { mul, stun }.
function spawnShot(m, u, w, a, side, st, src, boost) {
  // zone.blind: a blinded mech shoots shorter and wide of the mark
  if (u.blindT > 0 && u.blindSpread) a += (m.rng() - 0.5) * 2 * u.blindSpread;
  const dx = Math.cos(a), dz = Math.sin(a), off = u.radius + 0.25;
  let x = u.x + dx * off - dz * side, z = u.z + dz * off + dx * side;
  // A muzzle poking through a wall must not fire from the far side.
  if (castStatic(m.map, u.x, u.z, x, z, w.r) <= 1) { x = u.x; z = u.z; }
  m.shots.push({
    id: m.nextId++, team: u.team, owner: u.id, x, z, px: x, pz: z, dx, dz, speed: w.speed, left: w.range * (st ? st.range : 1) * (u.blindT > 0 ? u.blindF : 1),
    color: u.color, dmg: w.dmg * dmgScale(u) * (1 + rampBonus(u, 'dmg')) * (st ? st.dmg : 1) * (boost ? boost.mul : 1), splash: w.splash || 0, knock: w.knock || 0, slow: w.slow || 0, slowDur: w.slowDur || 0, r: w.r, vis: w.vis,
    pierce: !!w.pierce, bounce: w.bounce || 0, hook: w.do === 'hook' ? w : null, far: w.far || null, flown: 0, hit: w.pierce ? [] : null,
    fx: boost && boost.stun ? { ...(w.fx || {}), stun: boost.stun } : w.fx || null, ret: !!w.ret, back: false, src: src || null,
  });
}

const aimPoint = (u, inp, range) => {
  let dx = inp.tx - u.x, dz = inp.tz - u.z;
  const d = Math.hypot(dx, dz);
  if (d > range) { dx *= range / d; dz *= range / d; }
  return [u.x + dx, u.z + dz];
};

// What a skill does the moment its key is pressed.
const CAST = {
  shield(m, u, s) { u.shield = Math.max(u.shield, s.amount); u.shieldMax = u.shield; u.shieldT = s.dur; u.shieldBurst = s.burst || null; },
  dash(m, u, s) {
    // onStart: something left behind at the starting point: a mine, or a volley (back: true fires opposite to the aim).
    if (s.onStart && s.onStart.mine) placeMine(m, u, u.x, u.z, s.onStart.mine);
    if (s.onStart && s.onStart.volley) {
      const v = s.onStart.volley, a0 = u.aim + (v.back ? Math.PI : 0);
      for (let i = 0; i < (v.n || 1); i++) spawnShot(m, u, v, a0 + (i - ((v.n || 1) - 1) / 2) * (v.fan || 0), 0, null, s.id);
      m.events.push({ t: 'fire', id: u.id, vis: v.vis, x: u.x, z: u.z, a: a0, side: 0 });
    }
    if (s.invuln) u.invulnT = Math.max(u.invulnT, s.dist / s.speed + 0.1);
    u.dash = { dx: Math.cos(u.aim), dz: Math.sin(u.aim), left: s.dist, speed: s.speed, s, hit: [] };
  },
  blink(m, u, s, inp) {
    let dx = inp.mx, dz = inp.mz;
    const len = Math.hypot(dx, dz);
    if (len > 0.2) { dx /= len; dz /= len; } else { dx = -Math.cos(u.aim); dz = -Math.sin(u.aim); }
    u.dash = { dx, dz, left: s.dist, speed: s.speed, s, hit: [] };
    u.stealthT = s.stealth + s.dist / s.speed; u.revealT = 0;
  },
  nova(m, u, s) {
    // meterMul: the whole meter goes into this blow, damage x (1 + meter / max)
    let mul = 1;
    if (s.meterMul && u.passive === 'meter') { mul = 1 + u.meter / u.def.passive.max; if (u.meter > 0) meterSpent(m, u); }
    u.cast = { skill: s, t: s.windup, total: s.windup, move: s.move ?? 0.35, lock: false, aim: u.aim, left: s.repeat || 1, mul };
  },
  beam(m, u, s, inp) {
    // track: lock the enemy nearest the cursor now and keep the beam on it while it winds up; none there, it fires straight.
    const o = s.track ? pickUnit(m, u, inp, s.track, (o) => o.team !== u.team) : null;
    u.cast = { skill: s, t: s.windup, total: s.windup, move: 0.12, lock: true, aim: u.aim, target: o ? o.id : -1 };
  },
  volley(m, u, s) {
    fireVolley(m, u, s);
    // haste: a short run after the volley; burst: the volley goes off again burst.n - 1 times, burst.gap apart, while the mech keeps walking
    if (s.haste) { u.hasteF = Math.max(u.hasteT > 0 ? u.hasteF : 1, s.haste); u.hasteT = Math.max(u.hasteT, s.hasteDur || 1.5); }
    if (s.burst && s.burst.n > 1) { const T = s.burst.gap * (s.burst.n - 1); u.cast = { skill: s, t: T, total: T, move: s.move ?? 0.6, lock: false, aim: u.aim, acc: 0, left: s.burst.n - 1 }; }
  },
  // counter: a window in which the first hit taken is cut by dr (or turned away whole with first) and answered with a riposte at the attacker
  counter(m, u, s, inp) {
    u.parryT = s.window; u.parrySlot = u.def.skills.indexOf(s);
    const M = s.move;
    if (!M) return;
    let a = u.aim + Math.PI;
    if (!M.back) a = u.aim + ((inp.mx * -Math.sin(u.aim) + inp.mz * Math.cos(u.aim)) >= 0 ? 1 : -1) * Math.PI / 2;
    u.dash = { dx: Math.cos(a), dz: Math.sin(a), left: M.back || M.side, speed: M.speed, s: { dmg: 0 }, hit: [] };
  },
  // flurry: dash through the enemy under the cursor, then through the next one (same: the same one again), n times
  flurry(m, u, s, inp) {
    const o = pickUnit(m, u, inp, { pick: 99, cast: s.range }, (e) => e.team !== u.team);
    if (!o) return false;
    u.flurry = { s, left: s.n, target: o.id, hits: [], step: 0 };
    flurryStep(m, u, o);
  },
  // form: after the set-up the mech plays its other stance (def.formDefs)
  form(m, u, s) { u.cast = { skill: s, t: s.setup, total: s.setup, move: s.move ?? 0.6, lock: false, aim: u.aim }; },
  // portal: one end here, the other at the cursor; the caster goes through at once, later allies who step into an end come out of the other
  portal(m, u, s, inp) {
    const [tx, tz] = aimPoint(u, inp, s.cast), [x, z] = landing(m, u, tx, tz), x0 = u.x, z0 = u.z;
    if (Math.hypot(x - x0, z - z0) < s.r * 2) return false;
    addZone(m, u, { kind: 'portal', x: x0, z: z0, x2: x, z2: z, r: s.r, dur: s.dur, last: {} });
    const zn = m.zones[m.zones.length - 1];
    zn.last[u.id] = m.time;
    u.x = u.px = x; u.z = u.pz = z;
    m.events.push({ t: 'warp', id: u.id, x0, z0, x, z, via: zn.id });
  },
  // rewind: allies in range get back frac of what they have lost since `back` seconds ago
  rewind(m, u, s) {
    for (const o of m.units) {
      if (o.team !== u.team || !o.alive || !o.hpHist.length || dist2(o.x, o.z, u.x, u.z) > s.radius * s.radius) continue;
      const was = o.hpHist[Math.max(0, o.hpHist.length - 1 - Math.round(s.back * 2))], lost = was - o.hp;
      if (lost > 0) heal(m, o, lost * s.frac * (o === u ? RULES.selfHealMul : 1), u);
    }
    m.events.push({ t: 'rewind', id: u.id, x: u.x, z: u.z, r: s.radius });
  },
  buff(m, u, s) {
    if (s.haste) { u.hasteT = s.dur; u.hasteF = s.haste; }
    if (s.rapid) { u.rapidT = s.dur; u.rapidF = s.rapid; }
    if (s.stealth) { u.stealthT = s.stealth; u.revealT = 0; }
    if (s.armor) { u.armorT = s.dur; u.armorF = s.armor; u.reflectF = s.reflect || 0; }
    if (s.lifesteal) { u.rageT = s.dur; u.rageF = s.lifesteal; }
    if (s.cost) u.hp = Math.max(1, u.hp - u.maxHp * s.cost);
    if (s.prime) u.primeT = s.prime;
  },
  // transform: a bigger buff. Everything buff does, plus a damage factor, cleanse, crowd-control immunity, a heal of the lost hp,
  // a shield, a size, a weapon swap (def.tfWeapon, read by weaponOf) and a nova after a windup (the cast is this skill; FINISH.transform fires it).
  transform(m, u, s) {
    CAST.buff(m, u, s);
    u.tfT = s.dur; u.tfSlot = u.def.skills.indexOf(s); u.tfDmg = s.dmg || 1;
    if (s.cleanse) { u.slowT = 0; u.stunT = 0; u.rootT = 0; u.burnT = 0; u.burnN = 0; u.markT = 0; }
    if (s.ccImmune) u.ccT = s.ccImmune;
    u.tfCc = s.ccResist || 1;
    if (s.shield) { u.shield = Math.max(u.shield, s.shield); u.shieldMax = u.shield; u.shieldT = s.dur; }
    if (s.heal) heal(m, u, (u.maxHp - u.hp) * s.heal, u);
    if (s.size) u.radius = u.def.radius * s.size;
    if (s.nova) u.cast = { skill: s, t: s.nova.windup, total: s.nova.windup, move: 0.35, lock: false, aim: u.aim };
    m.events.push({ t: 'transform', id: u.id, on: 1, x: u.x, z: u.z, size: s.size || 1 });
  },
  stance(m, u, s) { u.cast = { skill: s, t: s.setup, total: s.setup, move: 0, lock: false, aim: u.aim }; },
  hook(m, u, s) {
    spawnShot(m, u, s, u.aim, 0, null, s.id);
    m.events.push({ t: 'fire', id: u.id, vis: s.vis, x: u.x, z: u.z, a: u.aim, side: 0 });
  },
  swap(m, u, s, inp) {
    const o = pickUnit(m, u, inp, s, (o) => !o.def.boss && !o.def.heavy);
    if (!o) return false;
    const x = u.x, z = u.z;
    u.x = u.px = o.x; u.z = u.pz = o.z; o.x = o.px = x; o.z = o.pz = z;
    u.vx = u.vz = o.vx = o.vz = 0; o.dash = null;
    if (o.team !== u.team) { o.slowT = Math.max(o.slowT, s.slowDur); o.slowF = Math.max(o.slowF, s.slow); o.hitBy[u.id] = m.time; }
    m.events.push({ t: 'swap', id: u.id, other: o.id, x0: x, z0: z, x1: u.x, z1: u.z });
  },
  bless(m, u, s, inp) {
    const o = pickUnit(m, u, inp, s, (o) => o.team === u.team) || u;
    if (s.shield) { o.shield = Math.max(o.shield, s.shield); o.shieldMax = o.shield; o.shieldT = s.dur; }
    if (s.haste) { o.hasteT = s.dur; o.hasteF = s.haste; }
    if (s.rapid) { o.rapidT = s.dur; o.rapidF = s.rapid; }
    // hot: heal over time on whoever it lands on (the same fields the heal item uses)
    if (s.hot) { o.healRate = Math.max(o.healT > 0 ? o.healRate : 0, s.hot.hps); o.healT = Math.max(o.healT, s.hot.dur); }
    m.events.push({ t: 'bless', id: u.id, to: o.id, skill: s.id, x: o.x, z: o.z });
  },
  rally(m, u, s) {
    for (const o of m.units) {
      if (o.team !== u.team || !o.alive || dist2(o.x, o.z, u.x, u.z) > s.radius * s.radius) continue;
      heal(m, o, s.heal * (o === u ? RULES.selfHealMul : 1), u);
      o.slowT = 0; o.stunT = 0; o.markT = 0; o.burnT = 0; o.burnN = 0;
      o.hasteT = Math.max(o.hasteT, s.dur); o.hasteF = Math.max(o.hasteT > s.dur ? o.hasteF : 1, s.haste);
    }
    m.events.push({ t: 'rally', id: u.id, x: u.x, z: u.z, r: s.radius });
  },
  leap(m, u, s, inp) {
    // to: 'foe' | 'ally': fly to the unit under the cursor (pickUnit); nobody there, the skill does not happen.
    let [tx, tz] = aimPoint(u, inp, s.cast);
    if (s.to) {
      const o = pickUnit(m, u, inp, s, (o) => (s.to === 'foe' ? o.team !== u.team : o.team === u.team));
      if (!o) return false;
      tx = o.x; tz = o.z;
    }
    const [x, z] = landing(m, u, tx, tz);
    const d = Math.hypot(x - u.x, z - u.z) || 0.01;
    u.dash = { dx: (x - u.x) / d, dz: (z - u.z) / d, left: d, speed: Math.max(4, d / s.flight), s: { dmg: 0 }, hit: [], fly: true, land: s };
    m.events.push({ t: 'leap', id: u.id, x0: u.x, z0: u.z, x, z, dur: s.flight });
  },
  mark(m, u, s, inp) {
    const o = pickUnit(m, u, inp, s, (o) => o.team !== u.team);
    if (!o) return false;
    o.markT = s.dur; o.markBy = u.id; o.markAmp = s.amp; o.markEx = o.def.boss ? 0 : s.execute; o.revealT = Math.max(o.revealT, s.dur);
    u.hasteT = s.dur; u.hasteF = s.haste;
    m.events.push({ t: 'mark', id: u.id, target: o.id, x: o.x, z: o.z });
  },
  decoy(m, u, s) {
    for (let i = 0; i < s.n; i++) {
      addZone(m, u, { kind: 'decoy', x: u.x, z: u.z, r: u.radius, hp: s.hp, maxHp: s.hp, dur: s.dur, aim: u.aim + (i - (s.n - 1) / 2) * s.fan, speed: s.seek ? s.seek.speed : u.def.speed, blast: s.blast, dmg: s.dmg, fx: s.fx || null, seek: s.seek || null });
    }
    u.stealthT = s.stealth; u.revealT = 0;
    if (s.haste) { u.hasteT = s.stealth; u.hasteF = s.haste; }
  },
  warp(m, u, s, inp) {
    let [tx, tz] = aimPoint(u, inp, s.dist);
    // behind: an enemy near the cursor (within pick) and in reach: come out 1.6 m behind its back
    if (s.behind) {
      const o = pickUnit(m, u, inp, { pick: s.behind.pick, cast: s.dist + s.behind.pick }, (o) => o.team !== u.team);
      if (o) { tx = o.x - Math.cos(o.heading) * 1.6; tz = o.z - Math.sin(o.heading) * 1.6; }
    }
    const [x, z] = landing(m, u, tx, tz), x0 = u.x, z0 = u.z;
    // leave: a still copy stays where the mech stood and goes off when it is shot down or its time is up
    if (s.leave) addZone(m, u, { kind: 'decoy', x: x0, z: z0, r: u.radius, hp: s.leave.hp, maxHp: s.leave.hp, dur: s.leave.dur, aim: u.aim, speed: 0, blast: s.leave.blast, dmg: s.leave.dmg, fx: s.leave.fx || null, seek: null });
    u.x = u.px = x; u.z = u.pz = z; u.vx = u.vz = 0;
    m.events.push({ t: 'warp', id: u.id, x0, z0, x, z });
    if (s.land) { m.events.push({ t: 'nova', id: u.id, x, z, r: s.land.radius }); areaDamage(m, u, x, z, s.land.radius, s.land.dmg, s.land, null); }
  },
  // orbit: n orbs circle the caster. 'seek': each `rate` seconds the next orb flies off at the nearest enemy in range and is spent;
  // 'guard': the orbs shoot down enemy shots and the ring cuts enemies close to the caster.
  orbit(m, u, s) {
    addZone(m, u, { kind: 'orbit', mode: s.mode, x: u.x, z: u.z, r: s.ring, ring: s.ring, n: s.n, live: (1 << s.n) - 1, dur: s.dur, rate: s.rate || 0.35, acc: 0,
      dmg: s.dmg || 0, range: s.range || 11, dps: s.dps || 0, spin: s.spin || 2.4, speed: s.speed || 30, pr: s.pr || 0.24, vis: s.vis || 'dart', src: s.id });
  },
  drone(m, u, s) { addZone(m, u, { kind: 'drone', x: u.x, z: u.z, r: 0.5, dur: s.dur, range: s.range, hps: s.hps, acc: 0 }); },
  wire(m, u, s, inp) {
    const [cx, cz] = aimPoint(u, inp, s.cast), dx = Math.cos(u.aim), dz = Math.sin(u.aim), h = s.width / 2;
    addZone(m, u, { kind: 'wire', x: cx, z: cz, r: h, pts: [[cx - dz * h, cz + dx * h], [cx + dz * h, cz - dx * h]], delay: s.arm, dur: s.dur, dmg: s.dmg, slow: s.slow, slowDur: s.slowDur, left: s.charges, last: {} });
  },
  sweep(m, u, s) { u.cast = { skill: s, t: s.windup + s.dur, total: s.windup + s.dur, move: s.move, lock: false, aim: u.aim, acc: 0 }; },
  recoil(m, u, s) {
    m.events.push({ t: 'nova', id: u.id, x: u.x, z: u.z, r: s.radius });
    areaDamage(m, u, u.x, u.z, s.radius, s.dmg, s, null);
    u.dash = { dx: -Math.cos(u.aim), dz: -Math.sin(u.aim), left: s.dist, speed: s.speed, s: { ...s, dmg: 0 }, hit: [] };
  },
  wall(m, u, s) {
    const dx = Math.cos(u.aim), dz = Math.sin(u.aim), cx = u.x + dx * s.cast, cz = u.z + dz * s.cast, pts = [];
    for (let i = 0; i < s.n; i++) {
      const k = (i - (s.n - 1) / 2) * s.gap, x = cx - dz * k, z = cz + dx * k;
      if (!solidAt(m.map, x, z, s.r * 0.5)) pts.push([x, z]);
    }
    addZone(m, u, { kind: 'wall', x: cx, z: cz, r: s.r, pts, dur: s.dur, a: u.aim, screen: !!s.screen });
  },
  turret(m, u, s, inp) {
    let [x, z] = aimPoint(u, inp, s.cast);
    if (solidAt(m.map, x, z, 0.8)) { x = u.x; z = u.z; }
    const k = lasting(u);
    addZone(m, u, { kind: 'turret', x, z, r: 0.8, hp: s.hp * k, maxHp: s.hp * k, dur: s.dur * k, range: s.range, dmg: s.dmg, rate: s.rate, cd: 0.6, aim: u.aim });
  },
  minefield(m, u, s, inp) {
    const [cx, cz] = aimPoint(u, inp, s.cast);
    for (let i = 0; i < s.n; i++) {
      const a = (i / s.n) * 6.283 + m.rng(), d = i ? s.radius * 0.7 : 0;
      addZone(m, u, { kind: 'mine', x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d, r: s.trigger, blast: s.blast, delay: s.arm, dur: s.life * lasting(u), dmg: s.dmg, stun: s.stun, fx: s.fx || null });
    }
  },
  barrage(m, u, s, inp) {
    // channel: one cast like a sweep: a strike every channel.every seconds around wherever the cursor is, the mech still walks (channel.move)
    if (s.channel) { u.cast = { skill: s, t: s.channel.dur, total: s.channel.dur, move: s.channel.move, lock: false, aim: u.aim, acc: 0 }; return; }
    const [cx, cz] = aimPoint(u, inp, s.cast);
    const ux = Math.cos(u.aim), uz = Math.sin(u.aim);
    // seek: the first strikes land on the enemies standing within seek.radius of the cursor (marked ones first when prefer is 'meterMark', then by id); the rest scatter
    const hunt = s.seek ? seekTargets(m, u, s.seek, cx, cz) : [];
    for (let i = 0; i < s.n; i++) {
      const delay = s.delay + (i / s.n) * s.span;
      if (i < hunt.length) { addZone(m, u, { kind: 'strike', x: hunt[i].x, z: hunt[i].z, r: s.blast, delay, total: delay, dmg: s.dmg * u.skillAmp, fx: strikeFx(s), src: s.id }); continue; }
      // line: strikes march from the aim point along the aim direction; otherwise they scatter in a disc.
      const a = s.line ? 0 : m.rng() * 6.283, d = s.line ? 0 : (i ? Math.sqrt(m.rng()) * (s.radius - s.blast * 0.5) : 0);
      const lx = s.line ? ux * s.gap * (i - (s.n - 1) / 2) : 0, lz = s.line ? uz * s.gap * (i - (s.n - 1) / 2) : 0;
      addZone(m, u, { kind: 'strike', x: cx + lx + Math.cos(a) * d, z: cz + lz + Math.sin(a) * d, r: s.blast, delay, total: delay, dmg: s.dmg * u.skillAmp, fx: strikeFx(s), src: s.id });
    }
  },
  mine(m, u, s, inp) {
    const [x, z] = aimPoint(u, inp, s.cast);
    placeMine(m, u, x, z, s);
  },
  zone(m, u, s, inp) {
    const [x, z] = s.at === 'self' ? [u.x, u.z] : aimPoint(u, inp, s.cast);
    addZone(m, u, { kind: 'field', vis: s.vis, x, z, r: s.radius, dur: s.dur, hps: s.hps || 0, dps: (s.dps || 0) * u.skillAmp, slow: s.slow || 0, hide: !!s.hide, pull: s.pull || 0, acc: 0,
      haste: s.haste || 0, blind: s.blind || null, follow: !!s.follow, armor: s.armor || 0, cage: !!s.cage, held: s.cage ? heldMask(m, u, x, z, s.radius) : 0, drain: s.drain || 0, shield: s.shield || 0, sh: {} });
  },
  dome(m, u, s) {
    addZone(m, u, { kind: 'dome', x: u.x, z: u.z, r: s.radius, dur: s.dur });
    for (const o of m.units) {
      if (o.team !== u.team || !o.alive || dist2(o.x, o.z, u.x, u.z) > s.radius * s.radius) continue;
      heal(m, o, s.heal * (o === u ? RULES.selfHealMul : 1), u);
      o.shield = Math.max(o.shield, s.shield); o.shieldMax = o.shield; o.shieldT = s.dur;
    }
  },
};

// Where orb i of an orbit zone is: round its owner, one full turn each 2 pi / spin seconds.
export function orbPos(z, owner, i) {
  const a = z.age * z.spin + i * 2 * Math.PI / z.n;
  return [owner.x + Math.cos(a) * z.ring, owner.z + Math.sin(a) * z.ring];
}

function seekTargets(m, u, K, cx, cz) {
  const list = [];
  for (const o of m.units) if (o.team !== u.team && o.alive && visibleTo(m, o, u.team) && dist2(o.x, o.z, cx, cz) <= K.radius * K.radius) list.push(o);
  const rank = (o) => (K.prefer === 'meterMark' && o.mmBy === u.id && o.mmT > 0 ? 0 : 1);
  return list.sort((a, b) => rank(a) - rank(b) || a.id - b.id);
}
// A barrage's hit effects: fx.knock is not a status, it throws the target away from the blast (areaDamage reads it beside fx.fx).
const strikeFx = (s) => (s.fx ? (s.fx.knock ? { fx: s.fx, knock: s.fx.knock } : { fx: s.fx }) : null);
function channelStrike(m, u, s, inp) {
  const [cx, cz] = aimPoint(u, inp, s.cast), a = m.rng() * 6.283, d = Math.sqrt(m.rng()) * Math.max(0, s.radius - s.blast * 0.5);
  addZone(m, u, { kind: 'strike', x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d, r: s.blast, delay: s.delay, total: s.delay, dmg: s.dmg, fx: strikeFx(s) });
}

function fireVolley(m, u, s) {
  for (let i = 0; i < s.n; i++) spawnShot(m, u, s, u.aim + (i - (s.n - 1) / 2) * (s.fan || 0), 0, null, s.id);
  m.events.push({ t: 'fire', id: u.id, vis: s.vis, x: u.x, z: u.z, a: u.aim, side: 0 });
}

// form: flip between the two stances; the unit plays the def built for that stance.
function flipForm(m, u) {
  if (!u.def.formDefs) return;
  u.form = u.form ? 0 : 1; u.def = formDef(u.def, u.form);
  m.events.push({ t: 'form', id: u.id, on: u.form, x: u.x, z: u.z });
}

// flurry: one step is a dash from here through the target to the far side of it
function flurryStep(m, u, o) {
  const F = u.flurry, s = F.s;
  let dx = o.x - u.x, dz = o.z - u.z;
  const d = Math.hypot(dx, dz);
  if (d > 0.01) { dx /= d; dz /= d; } else { dx = Math.cos(u.aim); dz = Math.sin(u.aim); }
  const left = d + o.radius + 1.2;
  F.left--; F.step++; F.target = o.id; F.hits.push(o.id);
  u.dash = { dx, dz, left, speed: s.speed, s: { id: s.id, dmg: s.dmg, stun: s.stun || 0, fx: s.fx || null, heal: s.heal || 0 }, hit: [] };
  if (s.invuln) u.invulnT = Math.max(u.invulnT, left / s.speed + 0.15);
  m.events.push({ t: 'flurry', id: u.id, step: F.step, x: o.x, z: o.z });
}
// The step is over: go through the same enemy again (same) or the nearest one not yet cut, in reach; nobody, the chain ends.
function flurryNext(m, u) {
  const F = u.flurry;
  if (!F || F.left <= 0 || !u.alive) { u.flurry = null; return; }
  const t0 = m.units[F.target];
  let pick = F.s.same && t0 && t0.alive ? t0 : null;
  // not yet cut first; when all of those in reach have been cut, the list starts again (a lone enemy is cut again and again)
  for (let round = 0; round < 2 && !pick; round++) {
    let bd = 1e9;
    for (const o of m.units) {
      if (o.team === u.team || !o.alive || (round === 0 && !F.s.same && F.hits.includes(o.id)) || !visibleTo(m, o, u.team)) continue;
      const d = dist2(o.x, o.z, u.x, u.z);
      if (d <= F.s.range * F.s.range && d < bd) { bd = d; pick = o; }
    }
    if (!pick) F.hits = [];
  }
  if (!pick) { u.flurry = null; return; }
  flurryStep(m, u, pick);
}

// counter: the hit that opens the window. Answer the attacker, close the window, and say how much of the blow still lands.
function parryHit(m, u, foe, amount) {
  const s = u.def.skills[u.parrySlot];
  u.parryT = 0;
  if (!s) return amount;
  m.events.push({ t: 'parry', id: u.id, by: foe.id, x: u.x, z: u.z });
  const R = s.riposte, keep = curSrc;
  if (R && foe.alive) {
    const a = Math.atan2(foe.z - u.z, foe.x - u.x);
    if (R.volley) {
      const v = R.volley, k = v.n || 1;
      for (let i = 0; i < k; i++) spawnShot(m, u, v, a + (i - (k - 1) / 2) * (v.fan || 0), 0, null, s.id);
      m.events.push({ t: 'fire', id: u.id, vis: v.vis, x: u.x, z: u.z, a, side: 0 });
    }
    if (R.nova) {
      m.events.push({ t: 'nova', id: u.id, x: u.x, z: u.z, r: R.nova.radius });
      curSrc = s.id; areaDamage(m, u, u.x, u.z, R.nova.radius, R.nova.dmg, R.nova, null); curSrc = keep;
    }
  }
  return s.first ? 0 : amount * (1 - (s.dr || 0));
}

// meter gain.allyHurt: allies' blood lost near a mech with that meter fills it
function allyHurt(m, u, amount) {
  for (const a of m.units) {
    if (a === u || !a.alive || a.team !== u.team || a.passive !== 'meter') continue;
    const G = a.def.passive.gain;
    if (G.allyHurt && dist2(a.x, a.z, u.x, u.z) <= (G.r || 8) ** 2) meterAdd(m, a, 'allyHurt', amount);
  }
}

// hook.self: the hook caught a wall or a mech: the hooker is dragged to just short of it
function reelSelf(m, u, x, z, o, s) {
  if (o) { x = o.x; z = o.z; }
  const dx = x - u.x, dz = z - u.z, d = Math.hypot(dx, dz) || 0.01, left = d - (u.radius + (o ? o.radius ?? o.r ?? 0 : 0) + 0.45);
  if (o && o.radius !== undefined && o.alive) m.events.push({ t: 'hook', id: u.id, target: o.id, x, z });
  if (left <= 0.2 || u.def.heavy) return;
  u.cast = null;
  u.dash = { dx: dx / d, dz: dz / d, left, speed: s.speed, s: { dmg: 0 }, hit: [] };
}

function endTransform(m, u) {
  u.tfT = 0; u.tfSlot = -1; u.tfDmg = 1; u.tfCc = 1; u.ccPrev = null; u.radius = u.def.radius;
  m.events.push({ t: 'transform', id: u.id, on: 0, x: u.x, z: u.z });
}

// What a guest's mirror needs to size a transformed mech: the hitbox follows the skill's size while the transform runs.
export function unitRadius(u) {
  if (u.tfT > 0) for (const s of u.def.skills) if (s.do === 'transform' && s.size) return u.def.radius * s.size;
  return u.def.radius;
}

function placeMine(m, u, x, z, s) {
  addZone(m, u, { kind: 'mine', x, z, r: s.trigger, blast: s.blast, delay: s.arm, dur: s.life * lasting(u), dmg: s.dmg, stun: s.stun, fx: s.fx || null });
}

const lasting = (u) => (u.passive === 'mechanic' ? u.def.passive.mul : 1);

// The unit a targeted skill lands on: the one nearest the cursor within s.pick of it and s.cast of the caster, that `ok` accepts.
function pickUnit(m, u, inp, s, ok) {
  let best = null, bd = s.pick * s.pick;
  for (const o of m.units) {
    if (o === u || !o.alive || !ok(o) || !visibleTo(m, o, u.team) || dist2(o.x, o.z, u.x, u.z) > s.cast * s.cast) continue;
    const d = dist2(o.x, o.z, inp.tx, inp.tz);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

// Where a jump or a warp aimed at (x, z) puts the unit: that point, or the nearest free ground around it.
function landing(m, u, x, z) {
  const r = u.moveRadius + 0.05, free = (px, pz) => Math.abs(px) < m.map.hw - r && Math.abs(pz) < m.map.hd - r && !solidAt(m.map, px, pz, r) && !blockedAt(m, px, pz, r);
  if (free(x, z)) return [x, z];
  for (let ring = 1; ring <= 10; ring++) for (let k = 0; k < 12; k++) {
    const a = k * 0.5236, px = x + Math.cos(a) * ring * 0.6, pz = z + Math.sin(a) * ring * 0.6;
    if (free(px, pz)) return [px, pz];
  }
  return [u.x, u.z];
}

function blockedAt(m, x, z, r) {
  for (const p of m.props) if (p.alive && dist2(p.x, p.z, x, z) < (p.r + r) * (p.r + r)) return true;
  for (const t of m.towers) if (t.alive && dist2(t.x, t.z, x, z) < (t.r + r) * (t.r + r)) return true;
  for (const q of m.zones) if (q.kind === 'wall' && !q.screen) for (const c of q.pts) if (dist2(c[0], c[1], x, z) < (q.r + r) * (q.r + r)) return true;
  return false;
}

// Bit i is set for unit i: the enemies standing inside a cage when it closes.
function heldMask(m, u, x, z, r) {
  let mask = 0;
  for (const o of m.units) if (o.team !== u.team && o.alive && !o.def.heavy && o.id < 31 && dist2(o.x, o.z, x, z) < r * r) mask |= 1 << o.id;
  return mask;
}

// A piercing line from the unit along `aim`: every enemy mech, prop and tower it crosses is hit. Walls stop it.
function fireBeam(m, u, s, aim) {
  const dx = Math.cos(aim), dz = Math.sin(aim);
  const t = s.thru ? 1 : Math.min(1, castStatic(m.map, u.x, u.z, u.x + dx * s.range, u.z + dz * s.range, 0.2));
  const len = s.range * t, x1 = u.x + dx * len, z1 = u.z + dz * len;
  const dmg = s.dmg * dmgScale(u);
  for (const o of m.units) {
    if (o.team === u.team || !o.alive) continue;
    const along = (o.x - u.x) * dx + (o.z - u.z) * dz;
    if (along < 0 || along > len + o.radius) continue;
    const side = Math.abs((o.x - u.x) * dz - (o.z - u.z) * dx);
    if (side < s.width / 2 + o.radius) { damage(m, o, dmg, u); if (o.alive && s.fx) applyFx(m, u, o, s.fx, { core: side / (s.width / 2 + o.radius) }); }
  }
  for (const p of m.props) {
    if (!p.alive) continue;
    const along = (p.x - u.x) * dx + (p.z - u.z) * dz;
    if (along < 0 || along > len) continue;
    if (Math.abs((p.x - u.x) * dz - (p.z - u.z) * dx) < s.width / 2 + p.r) damageProp(m, p, dmg, u);
  }
  for (const t of m.towers) {
    if (!t.alive || t.team === u.team) continue;
    const along = (t.x - u.x) * dx + (t.z - u.z) * dz;
    if (along > 0 && along < len + t.r && Math.abs((t.x - u.x) * dz - (t.z - u.z) * dx) < s.width / 2 + t.r) hurtTower(m, t, dmg, u);
  }
  u.revealT = RULES.revealOnFire;
  m.events.push({ t: 'beam', id: u.id, x0: u.x, z0: u.z, x1, z1, w: s.width });
}

// What a wind-up skill does when the wind-up completes.
const FINISH = {
  stance(m, u) { u.stance = !u.stance; u.vx = u.vz = 0; m.events.push({ t: 'stance', id: u.id, on: u.stance ? 1 : 0, x: u.x, z: u.z }); },
  sweep() {},
  nova(m, u, s, c) {
    m.events.push({ t: 'nova', id: u.id, x: u.x, z: u.z, r: s.radius });
    curSrc = s.id; areaDamage(m, u, u.x, u.z, s.radius, s.dmg * (c.mul || 1), s, null); curSrc = null;
    if (c.left > 1 && u.alive) u.cast = { ...c, t: s.gap, total: s.gap, left: c.left - 1 };
  },
  beam(m, u, s, c) { curSrc = s.id; fireBeam(m, u, s, c.aim); curSrc = null; },
  barrage() {},
  volley(m, u, s, c) { while (c.left > 0) { c.left--; fireVolley(m, u, s); } },
  form(m, u) { flipForm(m, u); },
  transform(m, u, s) {
    const N = s.nova;
    if (!N) return;
    m.events.push({ t: 'nova', id: u.id, x: u.x, z: u.z, r: N.radius });
    curSrc = s.id; areaDamage(m, u, u.x, u.z, N.radius, N.dmg, N, null); curSrc = null;
  },
};

function stepDash(m, u) {
  const d = u.dash, s = d.s;
  const stepLen = Math.min(d.left, d.speed * TICK);
  const bx = u.x, bz = u.z;
  // A leap flies over everything; only the edge of the map holds it.
  if (d.fly) { const r = u.moveRadius; u.x = Math.max(-m.map.hw + r, Math.min(m.map.hw - r, u.x + d.dx * stepLen)); u.z = Math.max(-m.map.hd + r, Math.min(m.map.hd - r, u.z + d.dz * stepLen)); }
  else moveUnit(m, u, d.dx * stepLen, d.dz * stepLen);
  const moved = Math.hypot(u.x - bx, u.z - bz);
  d.left -= stepLen;
  u.heading = Math.atan2(d.dz, d.dx);
  if (s.dmg) for (const o of m.units) {
    if (o.team === u.team || !o.alive || d.hit.includes(o.id)) continue;
    const rr = u.radius + o.radius + 0.35;
    if (dist2(o.x, o.z, u.x, u.z) > rr * rr) continue;
    d.hit.push(o.id);
    curSrc = s.id || null;
    const before = o.hp + o.shield;
    damage(m, o, s.dmg * dmgScale(u), u);
    curSrc = null;
    if (s.heal) heal(m, u, Math.min(s.dmg * dmgScale(u), before - (o.alive ? o.hp + o.shield : 0)) * s.heal, u, true);
    if (o.alive) { o.stunT = Math.max(o.stunT, s.stun || 0); o.kx += d.dx * (s.knock || 0) * 4; o.kz += d.dz * (s.knock || 0) * 4; if (s.fx) applyFx(m, u, o, s.fx); }
    m.events.push({ t: 'ram', id: u.id, x: o.x, z: o.z });
    if (s.stop) { d.left = 0; break; }   // dash.stop: the dash ends on the first mech it hits
  }
  if (d.left <= 0.01 || moved < stepLen * 0.4) {
    u.dash = null; u.vx = d.dx * 2; u.vz = d.dz * 2;
    if (u.flurry) flurryNext(m, u);
    if (d.land) { [u.x, u.z] = landing(m, u, u.x, u.z); m.events.push({ t: 'nova', id: u.id, x: u.x, z: u.z, r: d.land.radius }); curSrc = d.land.id || null; areaDamage(m, u, u.x, u.z, d.land.radius, d.land.dmg, d.land, null); curSrc = null; landShield(m, u, d.land); }
  }
}

// leap.landShield: allies inside the landing radius get a shield.
function landShield(m, u, s) {
  if (!s.landShield) return;
  for (const o of m.units) {
    if (o.team !== u.team || !o.alive || dist2(o.x, o.z, u.x, u.z) > s.radius * s.radius) continue;
    o.shield = Math.max(o.shield, s.landShield); o.shieldMax = o.shield; o.shieldT = s.shieldDur || 4;
  }
}

function moveUnit(m, u, dx, dz) {
  const dist = Math.hypot(dx, dz);
  const n = Math.max(1, Math.ceil(dist / 0.45));
  for (let i = 0; i < n; i++) { u.x += dx / n; u.z += dz / n; resolveStatic(m, u, dx / n, dz / n); }
}

// Pushing out along the radial normal alone leaves a unit that drives exactly head-on into a round or a wall corner with no
// tangential motion at all. Curved contacts therefore also shift the unit along the surface, towards the side it was already
// sliding to (counter-clockwise on an exact tie), by this fraction of how deep it had sunk in.
const SLIDE = 0.15;

// (sx, sz) is the step that brought the unit here; it only picks the side to slide to.
function resolveStatic(m, u, sx, sz) {
  const map = m.map, r = u.moveRadius;
  // Two passes: pushing out of a prop can push back into a wall.
  for (let pass = 0; pass < 2; pass++) {
    for (const w of map.walls) {
      const cx = Math.max(w.x0, Math.min(u.x, w.x1)), cz = Math.max(w.z0, Math.min(u.z, w.z1));
      const dx = u.x - cx, dz = u.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        if (cx !== u.x && cz !== u.z) pushOut(u, cx, cz, r, sx, sz);
        else { const d = Math.sqrt(d2); u.x = cx + dx / d * r; u.z = cz + dz / d * r; }
      }
      else {
        const l = u.x - w.x0, rt = w.x1 - u.x, t = u.z - w.z0, b = w.z1 - u.z, mn = Math.min(l, rt, t, b);
        if (mn === l) u.x = w.x0 - r; else if (mn === rt) u.x = w.x1 + r; else if (mn === t) u.z = w.z0 - r; else u.z = w.z1 + r;
      }
    }
    for (const c of map.rounds) pushOut(u, c.x, c.z, c.r + r, sx, sz);
    if (pass === 0) {
      for (const p of m.props) if (p.alive) pushOut(u, p.x, p.z, p.r + r, sx, sz);
      for (const z of m.zones) {
        if (z.kind === 'wall' && !z.screen) for (const q of z.pts) pushOut(u, q[0], q[1], z.r + r, sx, sz);
        else if (z.cage && (z.held >> u.id) & 1) {
          const dx = u.x - z.x, dz = u.z - z.z, d = Math.hypot(dx, dz), lim = z.r - 0.3;
          if (d > lim) { u.x = z.x + dx / d * lim; u.z = z.z + dz / d * lim; }
        }
      }
      for (const t of m.towers) if (t.alive) pushOut(u, t.x, t.z, t.r + r, sx, sz);
    }
    u.x = Math.max(-map.hw + r, Math.min(map.hw - r, u.x));
    u.z = Math.max(-map.hd + r, Math.min(map.hd - r, u.z));
  }
}

function pushOut(u, cx, cz, rr, sx, sz) {
  const dx = u.x - cx, dz = u.z - cz, d2 = dx * dx + dz * dz;
  if (d2 >= rr * rr) return;
  const d = Math.sqrt(d2) || 1e-4, nx = dx / d, nz = dz / d;
  const side = sz * nx - sx * nz >= 0 ? SLIDE : -SLIDE, depth = rr - d;
  u.x = cx + nx * rr - nz * side * depth; u.z = cz + nz * rr + nx * side * depth;
}

// Which way a shot that just hit something solid at (x, z) goes on: the axis that is blocked is mirrored.
// The guest's predicted shots (predict.js) bounce by this same rule.
export function bounceDir(map, x, z, dx, dz, r) {
  const e = 0.35, bx = castStatic(map, x, z, x + Math.sign(dx) * e, z, r) <= 1, bz = castStatic(map, x, z, x, z + Math.sign(dz) * e, r) <= 1;
  if (bx && !bz) return [-dx, dz];
  if (bz && !bx) return [dx, -dz];
  return [-dx, -dz];
}

function stepShots(m) {
  const map = m.map;
  for (let i = m.shots.length - 1; i >= 0; i--) {
    const s = m.shots[i];
    const owner = s.owner >= 0 ? m.units[s.owner] : null;
    curSrc = s.src || null;
    if (s.back) {
      // volley.ret on the way home: flies straight at its owner over everything and vanishes on touching it.
      if (!owner || !owner.alive) { m.shots.splice(i, 1); continue; }
      const bx = owner.x - s.x, bz = owner.z - s.z, bd = Math.hypot(bx, bz);
      if (bd < owner.radius + s.r + 0.1) { m.shots.splice(i, 1); continue; }
      s.dx = bx / bd; s.dz = bz / bd; s.left = Math.max(s.left, 1);
    }
    const len = Math.min(s.left, s.speed * TICK);
    const ex = s.dx * len, ez = s.dz * len;
    s.px = s.x; s.pz = s.z;
    let best = s.over ? 2 : castStatic(map, s.x, s.z, s.x + ex, s.z + ez, s.r * 0.5), what = 'wall', hitUnit = null, hitProp = null, hitTower = null;
    for (const t of m.towers) {
      if (!t.alive || t.team === s.team) continue;
      const k = segCircle(s.x, s.z, ex, ez, t.x, t.z, t.r + s.r);
      if (k < best) { best = k; what = 'tower'; hitTower = t; }
    }
    for (const p of m.props) {
      if (!p.alive || s.over) continue;
      const t = segCircle(s.x, s.z, ex, ez, p.x, p.z, p.r + s.r);
      if (t < best) { best = t; what = 'prop'; hitProp = p; hitTower = null; }
    }
    let hitZone = null;
    for (const z of m.zones) {
      if (z.kind === 'wall') {
        // A screen is a wall only to the other team's shots.
        if (z.screen && z.team === s.team) continue;
        for (const q of z.pts) { const t = segCircle(s.x, s.z, ex, ez, q[0], q[1], z.r + s.r); if (t < best) { best = t; what = z.screen ? 'screen' : 'wall'; hitProp = null; hitZone = null; hitTower = null; } }
      } else if ((z.kind === 'turret' || z.kind === 'decoy') && z.team !== s.team) {
        const t = segCircle(s.x, s.z, ex, ez, z.x, z.z, z.r + s.r);
        if (t < best) { best = t; what = z.kind; hitProp = null; hitZone = z; hitTower = null; }
      } else if (z.kind === 'orbit' && z.mode === 'guard' && z.team !== s.team) {
        const ow = m.units[z.owner];
        for (let i = 0; i < z.n; i++) {
          const [ox, oz] = orbPos(z, ow, i), t = segCircle(s.x, s.z, ex, ez, ox, oz, 0.5 + s.r);
          if (t < best) { best = t; what = 'orbit'; hitProp = null; hitZone = null; hitTower = null; }
        }
      } else if (z.kind === 'dome' && z.team !== s.team && dist2(s.x, s.z, z.x, z.z) >= z.r * z.r) {
        const t = segCircle(s.x, s.z, ex, ez, z.x, z.z, z.r);
        if (t < best) { best = t; what = 'dome'; hitProp = null; hitZone = null; hitTower = null; }
      }
    }
    for (const u of m.units) {
      if (u.team === s.team || !u.alive) continue;
      const t = segCircle(s.x, s.z, ex, ez, u.x, u.z, u.radius + s.r);
      if (s.pierce) {
        // A piercing shot hurts every mech it crosses, once each, and flies on.
        if (t > Math.min(best, 1) || s.hit.includes(u.id)) continue;
        s.hit.push(u.id);
        damage(m, u, shotDamage(s, len * t), owner);
        if (u.alive) {
          if (s.knock) { u.kx += s.dx * s.knock * 3; u.kz += s.dz * s.knock * 3; }
          if (s.slow) { u.slowT = Math.max(u.slowT, s.slowDur); u.slowF = Math.max(u.slowF, s.slow); }
          if (s.fx && owner) applyFx(m, owner, u, s.fx);
        }
        m.events.push({ t: 'impact', vis: s.vis, on: 'unit', x: s.x + ex * t, z: s.z + ez * t, dx: s.dx, dz: s.dz, splash: 0 });
      } else if (t < best) { best = t; what = 'unit'; hitUnit = u; hitProp = null; hitTower = null; hitZone = null; }
    }
    if (best > 1) {
      s.x += ex; s.z += ez; s.left -= len; s.flown += len;
      if (s.left > 1e-4) continue;
      what = 'end';
    } else { s.x += ex * best; s.z += ez * best; s.flown += len * best; s.left -= len * best; }
    if (what === 'wall' && s.bounce > 0 && s.left > 0.5) {
      s.bounce--;
      s.x -= s.dx * 0.1; s.z -= s.dz * 0.1;
      [s.dx, s.dz] = bounceDir(map, s.x, s.z, s.dx, s.dz, s.r * 0.5);
      if (owner && owner.passive === 'rebound') s.dmg *= 1 + owner.def.passive.mul;
      m.events.push({ t: 'impact', vis: s.vis, on: 'bounce', x: s.x, z: s.z, dx: s.dx, dz: s.dz, splash: 0 });
      continue;
    }
    if (s.ret && !s.back && owner && owner.alive && (what === 'end' || what === 'wall')) {
      // volley.ret: out of range (or against a wall), turn round with a clean hit list and come home.
      s.back = true; s.over = true; s.hit = []; s.left = 80;
      m.events.push({ t: 'impact', vis: s.vis, on: what, x: s.x, z: s.z, dx: s.dx, dz: s.dz, splash: 0 });
      continue;
    }
    const dmg = shotDamage(s, 0);
    if (what === 'tower') hurtTower(m, hitTower, dmg, owner);
    else if (what === 'unit') {
      damage(m, hitUnit, dmg, owner);
      if (s.knock && hitUnit.alive) { hitUnit.kx += s.dx * s.knock * 3; hitUnit.kz += s.dz * s.knock * 3; }
      if (s.slow && hitUnit.alive) { hitUnit.slowT = Math.max(hitUnit.slowT, s.slowDur); hitUnit.slowF = Math.max(hitUnit.slowF, s.slow); }
      if (s.fx && owner && hitUnit.alive) applyFx(m, owner, hitUnit, s.fx);
      if (s.hook && !s.hook.self && hitUnit.alive && owner && owner.alive) reel(m, owner, hitUnit, s.hook);
    } else if (what === 'prop') damageProp(m, hitProp, dmg, owner);
    else if (hitZone) hitZone.hp -= dmg;
    if (s.splash && what !== 'dome' && owner) areaDamage(m, owner, s.x, s.z, s.splash, dmg * 0.6, s.fx ? { fx: s.fx } : null, hitUnit);
    if (s.hook && s.hook.self && owner && owner.alive && (what === 'wall' || what === 'unit' || what === 'prop' || what === 'tower')) reelSelf(m, owner, s.x, s.z, hitUnit || hitProp || hitTower, s.hook);
    m.events.push({ t: 'impact', vis: s.vis, on: what, x: s.x, z: s.z, dx: s.dx, dz: s.dz, splash: s.splash });
    m.shots.splice(i, 1);
  }
  curSrc = null;
}

// extra: metres this tick's hit lies beyond s.flown.
const shotDamage = (s, extra) => s.dmg * (s.far && s.flown + extra > s.far.after ? s.far.mul : 1);

// The hook caught `o`: it is dragged to just in front of the hooker and cannot act on the way.
function reel(m, u, o, s) {
  m.events.push({ t: 'hook', id: u.id, target: o.id, x: o.x, z: o.z });
  if (o.def.heavy || o.stance) return;
  const dx = u.x - o.x, dz = u.z - o.z, d = Math.hypot(dx, dz), left = d - (u.radius + o.radius + 0.6);
  if (left <= 0.2) { o.stunT = Math.max(o.stunT, s.stun); return; }
  o.cast = null;
  o.dash = { dx: dx / d, dz: dz / d, left, speed: s.speed, s: { dmg: 0 }, hit: [] };
  o.stunT = Math.max(o.stunT, s.stun + left / s.speed);
}

function addZone(m, u, z) {
  z.id = m.nextId++; z.team = u.team; z.color = u.color; z.owner = u.id; z.age = 0;
  if (z.delay === undefined) z.delay = 0;
  m.zones.push(z);
  m.events.push({ t: 'zone', id: z.id, kind: z.kind, x: z.x, z: z.z, vis: z.vis, lob: !!z.lob });
}

function stepZones(m) {
  const dt = TICK;
  for (let i = m.zones.length - 1; i >= 0; i--) {
    const z = m.zones[i], owner = m.units[z.owner];
    z.age += dt;
    let done = false;
    if (z.kind === 'strike') {
      z.delay -= dt;
      if (z.delay <= 0) { curSrc = z.src || null; explode(m, owner, z.x, z.z, z.r, z.dmg, z.fx || null, 'strike'); curSrc = null; done = true; }
    } else if (z.kind === 'mine') {
      if (z.delay > 0) z.delay -= dt;
      else {
        for (const u of m.units) {
          if (u.team === z.team || !u.alive) continue;
          const rr = z.r + u.radius * 0.5;
          if (dist2(u.x, u.z, z.x, z.z) < rr * rr) { explode(m, owner, z.x, z.z, z.blast, z.dmg, { stun: z.stun, fx: z.fx }, 'mine'); done = true; break; }
        }
      }
      if (z.age > z.dur) done = true;
    } else if (z.kind === 'field') {
      if (z.follow) { z.x = owner.x; z.z = owner.z; if (!owner.alive) done = true; }
      z.acc += dt;
      const pulse = z.acc >= 0.5;
      if (pulse) z.acc -= 0.5;
      for (const u of m.units) {
        if (!u.alive || dist2(u.x, u.z, z.x, z.z) > z.r * z.r) continue;
        if (u.team === z.team) {
          if (z.hps && pulse) heal(m, u, z.hps * 0.5 * (u === owner ? RULES.selfHealMul : 1), owner);
          if (z.armor) { u.armorF = Math.max(u.armorT > 0.3 ? u.armorF : 0, z.armor); u.armorT = Math.max(u.armorT, 0.3); }
          if (z.haste) { u.hasteF = Math.max(u.hasteT > 0.3 ? u.hasteF : 1, z.haste); u.hasteT = Math.max(u.hasteT, 0.3); }
          // shield: once per ally, on stepping in
          if (z.shield && !z.sh[u.id]) { z.sh[u.id] = 1; u.shield = Math.max(u.shield, z.shield); u.shieldMax = Math.max(u.shieldMax, u.shield); u.shieldT = Math.max(u.shieldT, 0.5, z.dur - z.age); }
        } else {
          if (z.blind) { u.blindT = Math.max(u.blindT, 0.3); u.blindF = z.blind.range; u.blindSpread = z.blind.spread; }
          // pull > 0 drags toward the centre, pull < 0 shoves out of the field.
          if (z.pull && !u.def.heavy && !u.stance && !(u.dash && u.dash.fly)) { const d = Math.sqrt(dist2(u.x, u.z, z.x, z.z)); if (d > (z.pull > 0 ? 0.6 : 0.05)) moveUnit(m, u, (z.x - u.x) / d * z.pull * dt, (z.z - u.z) / d * z.pull * dt); }
          if (z.slow) { u.slowT = Math.max(u.slowT, 0.3); u.slowF = Math.max(u.slowT > 0.3 ? u.slowF : 0, z.slow); }
          if (z.dps && pulse) {
            const had = u.hp + u.shield;
            damage(m, u, z.dps * 0.5, owner);
            // drain: the owner gets back that share of what the field took
            if (z.drain && owner.alive) heal(m, owner, Math.min(z.dps * 0.5, had - (u.alive ? u.hp + u.shield : 0)) * z.drain, owner, true);
          }
        }
      }
      if (z.age > z.dur) done = true;
    } else if (z.kind === 'turret') {
      z.cd -= dt;
      let best = null, bd = z.range * z.range;
      for (const u of m.units) {
        if (u.team === z.team || !u.alive || !visibleTo(m, u, z.team)) continue;
        const d = dist2(u.x, u.z, z.x, z.z);
        if (d < bd && castStatic(m.map, z.x, z.z, u.x, u.z, 0.15) > 1) { bd = d; best = u; }
      }
      if (best) {
        z.aim = Math.atan2(best.z - z.z, best.x - z.x);
        if (z.cd <= 0) {
          z.cd = z.rate;
          const dx = Math.cos(z.aim), dz = Math.sin(z.aim);
          m.shots.push({ id: m.nextId++, team: z.team, color: z.color, owner: z.owner, x: z.x + dx, z: z.z + dz, px: z.x + dx, pz: z.z + dz, dx, dz, speed: 30, left: z.range + 1, dmg: z.dmg * owner.dmgMod, splash: 0, knock: 0, slow: 0, slowDur: 0, r: 0.18, vis: 'rivet' });
          m.events.push({ t: 'turretFire', id: z.owner, zone: z.id, x: z.x, z: z.z, a: z.aim });
        }
      }
      if (z.hp <= 0 || z.age > z.dur) done = true;
    } else if (z.kind === 'decoy') {
      // Runs straight like a mech would and turns away from what it cannot pass. Bursts when shot down or spent.
      if (z.seek) {
        // decoy.seek: runs at the nearest enemy (lowest id on a tie) within range and bursts on touching it.
        let near = null, nd = z.seek.range * z.seek.range;
        for (const u of m.units) {
          if (u.team === z.team || !u.alive || !visibleTo(m, u, z.team)) continue;
          const d = dist2(u.x, u.z, z.x, z.z);
          if (d < nd) { nd = d; near = u; }
        }
        if (near) {
          z.aim = Math.atan2(near.z - z.z, near.x - z.x);
          if (nd < (z.r + near.radius + 0.3) ** 2) z.hp = 0;
        }
      }
      const nx = z.x + Math.cos(z.aim) * z.speed * dt, nz = z.z + Math.sin(z.aim) * z.speed * dt;
      if (Math.abs(nx) > m.map.hw - 1 || Math.abs(nz) > m.map.hd - 1 || solidAt(m.map, nx, nz, RULES.moveRadius)) z.aim += 0.9;
      else { z.x = nx; z.z = nz; }
      if (z.hp <= 0 || z.age > z.dur) { explode(m, owner, z.x, z.z, z.blast, z.dmg, z.fx ? { fx: z.fx } : null, 'decoy'); done = true; }
    } else if (z.kind === 'drone') {
      z.x = owner.x + Math.cos(z.age * 2.2) * 1.5; z.z = owner.z + Math.sin(z.age * 2.2) * 1.5;
      z.acc += dt;
      if (z.acc >= 0.5) {
        z.acc -= 0.5;
        let worst = null, wf = 1;
        for (const u of m.units) {
          if (u.team !== z.team || !u.alive || dist2(u.x, u.z, owner.x, owner.z) > z.range * z.range) continue;
          const f = u.hp / u.maxHp;
          if (f < wf) { wf = f; worst = u; }
        }
        z.target = worst ? worst.id : -1;
        if (worst) heal(m, worst, z.hps * 0.5 * (worst === owner ? RULES.selfHealMul : 1), owner);
      }
      if (!owner.alive || z.age > z.dur) done = true;
    } else if (z.kind === 'orbit') {
      if (!owner.alive || z.age > z.dur) done = true;
      else {
        z.x = owner.x; z.z = owner.z;
        z.acc += dt;
        if (z.mode === 'seek') {
          if (z.acc >= z.rate) {
            let i = 0;
            while (i < z.n && !((z.live >> i) & 1)) i++;
            const [ox, oz] = orbPos(z, owner, i);
            let near = null, nd = z.range * z.range;
            for (const u of m.units) {
              if (u.team === z.team || !u.alive || !visibleTo(m, u, z.team)) continue;
              const d = dist2(u.x, u.z, ox, oz);
              if (d < nd && castStatic(m.map, ox, oz, u.x, u.z, 0.15) > 1) { nd = d; near = u; }
            }
            if (near) {
              z.acc -= z.rate; z.live &= ~(1 << i);
              const a = Math.atan2(near.z - oz, near.x - ox), dx = Math.cos(a), dz = Math.sin(a);
              m.shots.push({ id: m.nextId++, team: z.team, color: z.color, owner: z.owner, x: ox, z: oz, px: ox, pz: oz, dx, dz, speed: z.speed, left: z.range + 1, dmg: z.dmg * dmgScale(owner), splash: 0, knock: 0, slow: 0, slowDur: 0, r: z.pr, vis: z.vis,
                pierce: false, bounce: 0, hook: null, far: null, flown: 0, hit: null, fx: null, ret: false, back: false, src: z.src });
            } else z.acc = Math.min(z.acc, z.rate);
          }
          if (!z.live) done = true;
        } else if (z.acc >= 0.5) {
          z.acc -= 0.5;
          if (z.dps) for (const u of m.units) if (u.team !== z.team && u.alive && dist2(u.x, u.z, owner.x, owner.z) < (z.ring + 0.6 + u.radius * 0.5) ** 2) damage(m, u, z.dps * 0.5 * dmgScale(owner), owner);
        }
      }
    } else if (z.kind === 'portal') {
      // either end sends a friendly mech to the other, once per 3 s each
      for (const u of m.units) {
        if (u.team !== z.team || !u.alive || u.dash || m.time - (z.last[u.id] ?? -9) < 3) continue;
        const to = dist2(u.x, u.z, z.x, z.z) <= z.r * z.r ? [z.x2, z.z2] : dist2(u.x, u.z, z.x2, z.z2) <= z.r * z.r ? [z.x, z.z] : null;
        if (!to) continue;
        z.last[u.id] = m.time;
        const x0 = u.x, z0 = u.z;
        u.x = u.px = to[0]; u.z = u.pz = to[1];
        m.events.push({ t: 'warp', id: u.id, x0, z0, x: u.x, z: u.z, via: z.id });
      }
      if (z.age > z.dur) done = true;
    } else if (z.kind === 'wire') {
      if (z.delay > 0) z.delay -= dt;
      else for (const u of m.units) {
        if (u.team === z.team || !u.alive || m.time - (z.last[u.id] ?? -9) < 1) continue;
        if (!crosses(u.px, u.pz, u.x, u.z, z.pts[0], z.pts[1])) continue;
        z.last[u.id] = m.time; z.left--;
        damage(m, u, z.dmg * owner.dmgMod, owner);
        if (u.alive) { u.slowT = Math.max(u.slowT, z.slowDur); u.slowF = Math.max(u.slowF, z.slow); }
        m.events.push({ t: 'zap', zone: z.id, id: u.id, x: u.x, z: u.z });
        if (z.left <= 0) break;
      }
      if (z.left <= 0 || z.age > z.dur) done = true;
    } else if (z.age > z.dur) done = true;
    if (done) { m.zones.splice(i, 1); m.events.push({ t: 'zoneEnd', id: z.id, kind: z.kind, x: z.x, z: z.z }); }
  }
}

// Does the step a -> b cross the segment p -> q?
function crosses(ax, az, bx, bz, p, q) {
  const side = (x, z) => (q[0] - p[0]) * (z - p[1]) - (q[1] - p[1]) * (x - p[0]);
  const s0 = side(ax, az), s1 = side(bx, bz);
  if (s0 === s1 || (s0 > 0) === (s1 > 0)) return false;
  const k = s0 / (s0 - s1), x = ax + (bx - ax) * k, z = az + (bz - az) * k;
  const along = ((x - p[0]) * (q[0] - p[0]) + (z - p[1]) * (q[1] - p[1])) / dist2(p[0], p[1], q[0], q[1]);
  return along >= 0 && along <= 1;
}

function explode(m, src, x, z, r, dmg, fx, why) {
  m.events.push({ t: 'explode', x, z, r, why });
  areaDamage(m, src, x, z, r, dmg, fx, null);
}

// Damage with falloff (100% at the centre, 50% at the rim) to enemies of src and to props. fx may carry slow, slowDur, stun, knock.
function areaDamage(m, src, x, z, r, dmg, fx, skip) {
  const scale = dmgScale(src);
  for (const u of m.units) {
    if (u.team === src.team || !u.alive || u === skip) continue;
    const reach = r + u.radius * 0.6, d2 = dist2(u.x, u.z, x, z);
    if (d2 > reach * reach) continue;
    const d = Math.sqrt(d2);
    damage(m, u, dmg * scale * (1 - 0.5 * Math.min(1, d / r)), src);
    if (!u.alive || !fx) continue;
    if (fx.fx) applyFx(m, src, u, fx.fx);
    if (!u.alive) continue;
    if (fx.slow) { u.slowT = Math.max(u.slowT, fx.slowDur); u.slowF = fx.slow; }
    if (fx.stun) u.stunT = Math.max(u.stunT, fx.stun);
    if (fx.knock && d > 0.01) { u.kx += (u.x - x) / d * fx.knock * 3; u.kz += (u.z - z) / d * fx.knock * 3; }
  }
  for (const p of m.props) {
    if (!p.alive) continue;
    const reach = r + p.r;
    if (dist2(p.x, p.z, x, z) < reach * reach) damageProp(m, p, dmg * scale, src);
  }
  for (const t of m.towers) { const reach = r + t.r; if (t.alive && t.team !== src.team && dist2(t.x, t.z, x, z) < reach * reach) hurtTower(m, t, dmg * scale * 0.75, src); }
}

// hitfx: the `fx` key any damaging row may carry. { chance, pick: [fx, ...] } rolls m.rng() (once for the chance, once for the pick);
// otherwise every field present applies: slow/slowDur, weaken {mul, dur} (its hits do less), root (seconds it cannot walk),
// stun, amp {amp, dur} (it takes more from everyone), reveal (seconds it cannot hide), execute (fraction of max hp: below it, it dies).
export function applyFx(m, src, o, fx, ctx) {
  if (!o.alive || !fx) return;
  if (fx.chance !== undefined && m.rng() >= fx.chance) return;
  if (fx.pick) fx = fx.pick[Math.floor(m.rng() * fx.pick.length)];
  if (fx.slow) { o.slowT = Math.max(o.slowT, fx.slowDur); o.slowF = Math.max(o.slowF, fx.slow); }
  if (fx.weaken) { o.weakenF = o.weakenT > 0 ? Math.min(o.weakenF, fx.weaken.mul) : fx.weaken.mul; o.weakenT = Math.max(o.weakenT, fx.weaken.dur); }
  if (fx.root) o.rootT = Math.max(o.rootT, fx.root);
  if (fx.stun) {
    // stun { dur, core }: only a mech inside the middle `core` fraction of a beam (ctx.core = how far off the axis it was) is stunned
    const st = typeof fx.stun === 'number' ? fx.stun : !ctx || ctx.core === undefined || ctx.core <= fx.stun.core ? fx.stun.dur : 0;
    o.stunT = Math.max(o.stunT, st);
  }
  if (fx.chain) chainHit(m, src, o, fx.chain, lastBase);
  if (fx.burn) { o.burnT = fx.burn.dur; o.burnN = Math.min(fx.burn.max, o.burnN + 1); o.burnDps = fx.burn.dps; o.burnBy = src.id; }
  if (fx.amp) applyAmp(o, fx.amp.amp, fx.amp.dur);
  if (fx.reveal) { o.revealT = Math.max(o.revealT, fx.reveal); o.stealthT = 0; }
  if (fx.execute && !o.def.boss && o.hp < o.maxHp * fx.execute) {
    m.events.push({ t: 'execute', id: o.id, by: src.id, x: o.x, z: o.z });
    kill(m, o, src);
  }
}

function applyAmp(o, amp, dur) {
  o.ampF = o.ampT > 0 ? Math.max(o.ampF, amp) : amp;
  o.ampT = Math.max(o.ampT, dur);
}

function damageProp(m, p, amount, src) {
  if (!p.alive) return;
  p.hp -= amount;
  m.events.push({ t: 'propHit', id: p.id, x: p.x, z: p.z });
  if (p.hp > 0) return;
  p.alive = false;
  m.events.push({ t: 'propBreak', id: p.id, kind: p.kind, x: p.x, z: p.z });
  const b = PROPS[p.kind].blast;
  if (b) explode(m, src, p.x, p.z, b.radius, b.dmg / (dmgScale(src)), { knock: b.knock }, 'barrel');
}

// raw: the environment (lava, vents, base fire) burns through armour and is nobody's hit.
let reflecting = false;
function damage(m, u, amount, src, raw) {
  lastBase = 0;
  if (!u.alive || u.invulnT > 0 || amount <= 0) return;
  lastBase = amount;
  const foe = src && src !== u && !raw ? src : null;
  if (foe && u.parryT > 0 && amount >= 10) { amount = parryHit(m, u, foe, amount); lastBase = amount; if (amount <= 0) return; }
  if (foe) {
    if (u.markT > 0) amount *= 1 + u.markAmp;
    if (u.ampT > 0) amount *= 1 + u.ampF;
    if (foe.weakenT > 0) amount *= foe.weakenF;
    if (foe.passive === 'brittle') { const P = foe.def.passive; if (P.when === 'low' ? u.hp < u.maxHp * P.below : P.when === 'burn' ? u.burnT > 0 : P.when === 'marked' ? u.markT > 0 || u.ampT > 0 : u.slowT > 0) amount *= P.mul; }
    if (foe.passive === 'ambush' && foe.ambushT > 0 && !hidden(foe)) { amount *= foe.def.passive.mul; foe.ambushT = 0; }
  }
  const preArmor = amount;
  if (!raw && !(foe && foe.passive === 'pierce')) amount *= 1 - armorOf(m, u);
  const blocked = preArmor - amount;
  let left = amount, absorbed = 0, broke = false;
  if (u.shield > 0) {
    absorbed = Math.min(u.shield, left); u.shield -= absorbed; left -= absorbed;
    if (u.shield <= 0) { u.shieldT = 0; broke = true; m.events.push({ t: 'shieldBreak', id: u.id, x: u.x, z: u.z }); }
  }
  u.hp -= left; u.combatT = 0;
  if (left > 0) allyHurt(m, u, left);
  if (left + absorbed > 0) {
    if (foe && foe.alive && foe.passive === 'ramp' && foe.def.passive.on === 'hit') rampGain(foe, u.id);
    if (!raw && u.passive === 'ramp' && u.def.passive.on === 'hurt') rampGain(u, foe ? foe.id : -1);
    u.hurtAt = m.time;
    if (u.passive === 'meter' && u.def.passive.resetOnHurt) u.meter = 0;
  }
  if (foe && left + absorbed >= RULES.wound.frac * u.maxHp) u.woundT = RULES.wound.dur;
  if (src && src !== u) { src.dmg += left; u.hitBy[src.id] = m.time; src.hurtAllyAt = m.time; src.combatT = Math.min(src.combatT, RULES.regenDelay - 3); }
  m.events.push({ t: 'hit', id: u.id, by: src ? src.id : -1, x: u.x, z: u.z, amt: left, absorbed });
  if (foe && foe.alive && left > 0) {
    const low = lowHpMod(foe), steal = Math.max(foe.passive === 'lifesteal' ? foe.def.passive.frac * (low && low.steal ? low.steal : 1) : 0, foe.rageT > 0 ? foe.rageF : 0);
    if (steal) heal(m, foe, left * steal, foe, true);
    if (u.armorT > 0 && u.reflectF > 0 && !reflecting) { reflecting = true; damage(m, foe, amount * u.reflectF, u); reflecting = false; }
  }
  if (foe && foe.alive && foe.passive === 'souls' && u.hp > 0) applyAmp(u, foe.def.passive.mark.amp, foe.def.passive.mark.dur);
  if (foe && foe.alive && foe.passive === 'meter' && left + absorbed > 0 && !chaining) meterHit(m, foe, u);
  if (foe && foe.alive && foe.passive === 'stacks' && left + absorbed > 0 && !chaining && u.hp > 0) stackHit(m, foe, u);
  if (u.hp <= 0) kill(m, u, src);
  else if (u.markT > 0 && u.markEx && u.hp < u.maxHp * u.markEx) {
    const by = m.units[u.markBy];
    m.events.push({ t: 'execute', id: u.id, by: by.id, x: u.x, z: u.z });
    kill(m, u, by);
  }
  if (u.alive) {
    // what a hit does to the meter and the shield of the mech that took it: filled by the blood lost and the blows its plating turned away
    if (u.passive === 'meter' && !u.def.passive.resetOnHurt && left + absorbed > 0) { meterAdd(m, u, 'hurt', left); meterAdd(m, u, 'absorbed', blocked + absorbed); }
    if (broke) popShield(m, u);
  }
}

// stacks (passive): a hit with a source tag adds a mark to the mech it lands on ('skill': only skill hits count, 'any': weapon and skill hits;
// ticks of fields and burns carry no tag and never count). Marks belong to one attacker; the n-th one goes off as P.fx and is cleared.
function stackHit(m, foe, u) {
  const P = foe.def.passive;
  if (!curSrc || (P.on === 'skill' && curSrc === 'w')) return;
  if (u.stkN > 0 && u.stkT > 0 && u.stkBy === foe.id) u.stkN++; else u.stkN = 1;
  u.stkBy = foe.id; u.stkT = P.dur;
  if (u.stkN < P.n) return;
  u.stkN = 0; u.stkT = 0;
  m.events.push({ t: 'stacks', id: u.id, by: foe.id, x: u.x, z: u.z });
  applyFx(m, foe, u, P.fx);
}

function burn(m, u, amount) {
  u.invulnT = 0;
  // Only a recent attacker gets credit for a death by lava, vent or base fire.
  const last = Object.keys(u.hitBy).map(Number).filter((k) => m.time - u.hitBy[k] <= RULES.assistWindow).sort((a, b) => u.hitBy[b] - u.hitBy[a])[0];
  damage(m, u, amount, last === undefined ? null : m.units[last], true);
}

function heal(m, u, amount, src, quiet) {
  if (!u.alive) return;
  if (u.woundT > 0) amount *= RULES.wound.mul;
  // meter spend 'heal': the next heal this mech gives somebody else is stronger
  if (src && src.alive && src.passive === 'meter' && src.def.passive.spend.kind === 'heal' && !(quiet && src === u) && u.hp < u.maxHp && amount > 0 && meterArmed(src)) { amount *= src.def.passive.spend.mul; meterSpent(m, src); }
  const got = Math.min(u.maxHp - u.hp, amount);
  if (src && src !== u && src.passive === 'overheal' && amount - got >= 1) {
    const P = src.def.passive, add = Math.min(amount - got, P.cap - u.shield);
    if (add > 0) { u.shield += add; u.shieldMax = Math.max(u.shieldMax, u.shield, P.cap); u.shieldT = Math.max(u.shieldT, P.dur); }
  }
  if (got <= 0) return;
  u.hp += got;
  if (src) src.healed += got;
  if (!quiet && got >= 1) m.events.push({ t: 'heal', id: u.id, x: u.x, z: u.z, amt: got });
}

function kill(m, u, src) {
  const R = m.rule.respawn;
  u.hp = 0; u.alive = false; u.deaths++; u.respawnT = Math.min(R.max, R.base + R.perMin * m.time / 60);
  const assists = [];
  let by = -1;
  if (src && src.team !== u.team) {
    by = src.id; src.kills++;
    if (m.mode === 'tdm' || m.mode === 'tudo') m.score[src.team]++;
    for (const k in u.hitBy) {
      const o = m.units[k];
      if (o !== src && o.team !== u.team && m.time - u.hitBy[k] <= RULES.assistWindow) { o.assists++; assists.push(o.id); takedown(m, o, false, u); }
    }
    takedown(m, src, true, u);
  } else if (m.mode === 'tdm') m.score[1 - u.team]++;
  if (m.mode === 'trum') { if (u.def.boss) u.respawnT = 1e9; else m.lives--; }
  m.events.push({ t: 'death', id: u.id, by, assists, x: u.x, z: u.z });
  clearStatus(u);
}

// A kill or an assist feeds the passives that live on them.
// kill: true for the killing blow, false for an assist. victim: the mech that just died (its x, z are where it fell).
function takedown(m, o, kill, victim) {
  if (!o.alive) return;
  const P = o.def.passive, K = P && P.mods && P.mods.onKill;
  if (K) {
    const hl = kill ? K.heal : K.assist && K.assist.heal;
    if (hl) heal(m, o, o.maxHp * hl, o);
    const r = kill ? K.reset : K.assist && K.assist.reset !== undefined ? { slots: SLOTS, frac: K.assist.reset } : null;
    if (r) for (const slot of r.slots) o.cd[slot] *= 1 - r.frac;
    if (kill && K.haste) { o.hasteF = Math.max(o.hasteT > 0 ? o.hasteF : 1, K.haste); o.hasteT = Math.max(o.hasteT, K.dur || 3); }
  }
  if (o.passive === 'souls') {
    const Z = P.zone;
    addZone(m, o, { kind: 'field', vis: 'magnet', x: victim.x, z: victim.z, r: Z.radius, dur: Z.dur, hps: 0, dps: Z.dps, slow: 0, hide: false, pull: 0, acc: 0, follow: false, armor: 0, cage: false, held: 0 });
  }
  if (o.passive === 'frenzy') { o.hasteF = Math.max(o.hasteT > 0 ? o.hasteF : 1, P.haste); o.hasteT = Math.max(o.hasteT, P.dur); }
  if (o.passive === 'trophy') heal(m, o, o.maxHp * P.heal, o);
}

function stepCrates(m) {
  const C = m.rule.crate;
  m.crateT -= TICK;
  if (m.crateT <= 0) {
    m.crateT = m.rng.range(C.every[0], C.every[1]);
    const free = m.map.cratePoints.filter((p) => !m.crates.some((c) => c.x === p[0] && c.z === p[1]));
    if (m.crates.length < C.max && free.length) {
      const p = m.rng.pick(free);
      const keys = Object.keys(PICKUPS);
      let roll = m.rng() * keys.reduce((a, k) => a + PICKUPS[k].w, 0), type = keys[0];
      for (const k of keys) { roll -= PICKUPS[k].w; if (roll <= 0) { type = k; break; } }
      const c = { id: m.nextId++, x: p[0], z: p[1], type, fall: C.fall, age: 0 };
      m.crates.push(c);
      m.events.push({ t: 'crateDrop', id: c.id, x: c.x, z: c.z, type });
    }
  }
  for (let i = m.crates.length - 1; i >= 0; i--) {
    const c = m.crates[i];
    if (c.fall > 0) { c.fall -= TICK; if (c.fall <= 0) m.events.push({ t: 'crateLand', id: c.id, x: c.x, z: c.z }); continue; }
    c.age += TICK;
    let taker = null;
    for (const u of m.units) {
      const rr = C.radius + u.radius;
      if (u.alive && !u.def.boss && dist2(u.x, u.z, c.x, c.z) < rr * rr) { taker = u; break; }
    }
    if (taker) { applyPickup(m, taker, c.type); m.events.push({ t: 'pickup', id: taker.id, crate: c.id, type: c.type, x: c.x, z: c.z }); }
    if (taker || c.age > C.life) m.crates.splice(i, 1);
  }
}

// Flame vents: a warning ring for RULES.vent.warn seconds, then a blast that hurts every mech of both teams standing on it.
function stepVents(m) {
  const V = RULES.vent;
  for (const v of m.vents) {
    v.t -= TICK;
    if (!v.warn && v.t <= V.warn) { v.warn = true; m.events.push({ t: 'ventWarn', id: v.id, x: v.x, z: v.z, r: v.r }); }
    if (v.t > 0) continue;
    v.t = V.period; v.warn = false;
    m.events.push({ t: 'explode', x: v.x, z: v.z, r: v.r, why: 'vent' });
    for (const u of m.units) {
      const reach = v.r + u.radius * 0.5;
      if (u.alive && dist2(u.x, u.z, v.x, v.z) < reach * reach) burn(m, u, V.dmg);
    }
  }
}

function applyPickup(m, u, type) {
  const p = PICKUPS[type];
  u.pickups++;
  if (p.heal) heal(m, u, u.maxHp * p.heal, null);
  if (p.dmgUp) { u.dmgT = p.dur; u.dmgF = p.dmgUp; }
  if (p.haste) { u.hasteT = p.dur; u.hasteF = p.haste; }
  if (p.refresh) { u.cd.s1 = 0; u.cd.s2 = 0; u.cd.ult = 0; u.cd.heal = 0; }
  if (p.shield) { u.shield = Math.max(u.shield, p.shield); u.shieldMax = u.shield; u.shieldT = p.dur; }
}

// End-of-match table: one row per unit with a rating, and the id of the MVP.
export function summary(m) {
  const rows = m.units.map((u) => ({
    id: u.id, team: u.team, name: u.name, mech: u.mech, bot: u.bot, kills: u.kills, deaths: u.deaths, assists: u.assists,
    dmg: Math.round(u.dmg), healed: Math.round(u.healed),
    rating: u.kills * 3 + u.assists * 1.5 + u.dmg / 600 + u.healed / 450 - u.deaths,
  }));
  const mvp = rows.reduce((a, b) => (b.rating > a.rating ? b : a)).id;
  return { rows, mvp, mode: m.mode, score: m.score.slice(), winner: m.winner, time: m.time, lives: m.lives };
}

const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);

function turnTo(a, b, max) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + Math.max(-max, Math.min(max, d));
}
