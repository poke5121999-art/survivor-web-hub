// The match simulation. Pure and deterministic: fixed 30 Hz ticks, one seeded RNG, no three.js, no DOM.
// The same code runs in the browser, in Node tests, and (later) on the host of an online room.
//
//   const m = createMatch({ map, seed, roster, mode });   roster: [{ team, mech, name, bot, diff }]   mode: a MODES key (default tdm)
//   step(m, inputs);                                inputs[unit.id] = { mx, mz, aim, fire, s1, s2, ult, heal, tx, tz }
//   m.events                                        what happened during the last tick, for effects, sound and HUD
//
// Angles are radians in the XZ plane: direction = (cos a, sin a).

import { cleanSkin } from './skins.js';
import { TICK, RULES, PICKUPS, MECHS, PROPS, MODES, BOSSES, buildDef, formDef, matchSize, ruleFor } from './data.js';
import { mulberry } from './rng.js';
import { compileMap, mapsFor, castStatic, segCircle, solidAt, navBlock } from './maps.js';

const NO_INPUT = { mx: 0, mz: 0, aim: 0, fire: false, s1: false, s2: false, ult: false, heal: false, tx: 0, tz: 0 };
const SLOTS = ['s1', 's2', 'ult'];
// Everything a unit's own damage is multiplied by: the garage track, a power pick-up, a transform (skill.dmg).
const dmgScale = (u) => u.dmgMod * (u.dmgT > 0 ? u.dmgF : 1) * (u.tfT > 0 ? u.tfDmg : 1) * u.skillAmp * (u.hkF > 0 ? 1 + u.hkF : 1) * k7Dmg(u);
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
    // feat/dtt-modes: Phó bản spawn spots for the monsters, the stage id, the wave in play
    pveSpots: mode === 'pve' ? pveSpots(map) : null, stage: mode === 'pve' ? opts.stage || null : null, wave: 0, waves: 0, waveT: 0,
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
      slot: mode === 'tudo' ? m.units.length : slot[r.team]++, skin: cleanSkin(r.mech, r.skin), radius: def.radius, moveRadius: def.boss ? def.radius : RULES.moveRadius, maxHp: Math.round(def.hp * (mods.hp || 1) * (def.boss ? rule.bossHp || 1 : 1)), dmgMod: (mods.dmg || 1) * (def.dmgUp || 1),
      lv: def.lv || null, passive: def.passive ? def.passive.do : null, stanceDef: def.skills.find((s) => s.do === 'stance') || null,
      x: 0, z: 0, px: 0, pz: 0, vx: 0, vz: 0, kx: 0, kz: 0, aim: r.team ? Math.PI : 0, heading: r.team ? Math.PI : 0, score: 0,
      hp: 0, alive: false, respawnT: 0, cd: { fire: 0, s1: 0, s2: 0, ult: 0, heal: 0 }, barrel: 0,
      kills: 0, deaths: 0, assists: 0, dmg: 0, healed: 0, pickups: 0, hitBy: {}, brain: null,
      wave: r.wave | 0, summon: !!r.summon,
    };
    m.units.push(u);
    spawn(m, u, true);
  }
  if (mode === 'tudo') m.score = m.units.map(() => 0);
  if (mode === 'pve') pveInit(m);
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
  if (m.pveSpots && u.team === 1 && !u.def.boss) return m.pveSpots[u.slot % m.pveSpots.length];
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
  u.guardT = 0; u.guardF = 0; u.silenceT = 0; u.next = null; u.airT = 0;
  u.parryT = 0; u.parrySlot = -1; u.flurry = null; u.tfCc = 1; u.ccPrev = null; u.hpHist = [];
  u.form = 0; u.def = formDef(u.def, 0);
  u.meter = 0; u.lastSrc = null; u.hurtAt = -99; u.skillAmp = 1; u.shieldBurst = null; u.blindT = 0; u.blindF = 1; u.blindSpread = 0; u.mmT = 0; u.mmBy = -1;
  u.cast = null; u.dash = null; u.bush = -1; u.kx = 0; u.kz = 0; u.vx = 0; u.vz = 0; u.hitBy = {};
  // kit-remake G1: uses, i.e. skill charges (spent and the gap left, per slot), antiheal, cdAfter holds, hits per press, cuts waiting for the press's cooldown
  u.use0 = 0; u.use1 = 0; u.use2 = 0; u.gap0 = 0; u.gap1 = 0; u.gap2 = 0; u.ahT = 0; u.ahF = 1;
  u.hold = 0; u.holdT = [0, 0, 0]; u.hitN = {}; u.pressing = -1; u.pendCut = null;
  g2Clear(u);   // kit-remake G2
  g4Clear(u);
  k1Clear(u);
  // kit-remake G3: loss of control, per-target stack lockouts and shred, empowered shots, follow-ups, transform patch/stacks, hurt stacks, volley hit tally
  u.locT = 0; u.locK = 0; u.locBy = -1; u.locA = 0; u.locR = 0; u.stkLock = {}; u.stkShred = 0;
  u.shotN = 0; u.shotT = 0; u.shotRow = null; u.thenQ = []; u.hsN = 0; u.hsT = 0; u.hsAcc = 0; u.tfN = 0; u.tfAcc = 0; u.volTag = null;
  if (u.tfBase) u.def = formDef(u.tfBase, 0);
  u.tfBase = null;
  k2Clear(u);   // kit-remake G5 Athena
  k4Clear(u);   // kit-remake K4
  krClear(u);   // kit-remake G5 Kurumi
  adClear(u);   // kit-remake G5 An Dương Vương
  k7Clear(u);   // kit-remake G5 lane K7 (Saitama, Thủy Tinh, Ưng Nhãn)
  k10Clear(u);   // kit lane K10
  tthClear(u);   // kit-remake G5 Tào Tháo
  sntClear(u);   // kit-remake G5 Sơn Tinh
  k13Clear(u);   // kit lane K13
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
  } else if (m.mode === 'pve') {
    if (pveStep(m)) finish(m, 0); else if (m.lives <= 0 || timeUp) finish(m, 1);
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
  amount *= (src.def.towerMul ?? 1) * rowTowerMul(src);
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
  return (P && P.stat === stat ? u.rampN * P.step : 0) + (stat === 'rapid' && u.hkF > 0 ? u.hkF : 0);
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
  if (key === 'hurt' && P.hurtPer) amount /= P.hurtPer * u.maxHp;   // kit-remake G5 Saitama: one stack per hurtPer of max hp lost
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
  } else if (S.kind === 'mode') k7Mode(m, u, S);   // kit-remake G5 Saitama: Serious Mode
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
  return { mul: S.mul || 1, stun: S.stun || 0, patch: S.patch || null, cdr: S.cdr || 0, reach: S.reach || 0 };
}
// hitfx chain: from the mech just hit, jump to the n nearest other enemies inside r (nearest first, lower id on a tie) for base x mul each. It never chains again.
function chainHit(m, src, o, C, base) {
  if (chaining || !(base > 0)) return;
  if (C.seq) return chainSeq(m, src, o, C, base);
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
  if (u.stance || u.rootT > 0 || u.sirT > 0) return 0;   // sirT: kit-remake G5 Thủy Tinh, sealed in ice
  let s = u.def.speed;
  if (u.hasteT > 0) s *= u.hasteF;
  const low = lowHpMod(u);
  if (low && low.haste) s *= low.haste;
  // kit-remake G2: slowG (a decaying, growing or stacking slow) counts when it slows harder than the plain one
  const sl = Math.max(u.slowT > 0 ? u.slowF : 0, u.slowG || 0);
  if (sl > 0) s *= 1 - sl * (u.passive === 'steady' ? 0.5 : 1);
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
  a += g3Armor(u, a);
  for (const o of m.units) {
    if (o === u || o.team !== u.team || !o.alive || o.passive !== 'ward') continue;
    const P = o.def.passive;
    if (dist2(o.x, o.z, u.x, u.z) < P.radius * P.radius) { a += P.armor; break; }
  }
  a += k1Armor(u);
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
  // cdAfter: a held slot's cooldown waits until the row's state is over
  if (u.hold) for (let i = 0; i < 3; i++) if (u.hold & (1 << i) && !stateOn(u, i)) u.hold &= ~(1 << i);
  for (const k in u.cd) if (u.cd[k] > 0 && !(u.hold & (HOLD_BIT[k] || 0))) u.cd[k] = Math.max(0, u.cd[k] - dt * (k === 'fire' ? (u.rapidT > 0 ? u.rapidF : 1) * (1 + rampBonus(u, 'rapid')) * (u.sfT > 0 ? u.sfF : 1) : 1));
  for (const k of ['slowT', 'stunT', 'hasteT', 'rapidT', 'dmgT', 'stealthT', 'invulnT', 'revealT', 'armorT', 'rageT', 'markT', 'primeT', 'ambushT', 'rootT', 'weakenT', 'ampT', 'ccT', 'blindT', 'mmT', 'stkT', 'guardT', 'silenceT', 'airT', 'gap0', 'gap1', 'gap2', 'ahT']) if (u[k] > 0) u[k] = Math.max(0, u[k] - dt);
  // uses (skill charges): the cooldown is the recharge of one spent use; it starts again while uses are still spent
  for (let i = 0; i < 3; i++) {
    const s = u.def.skills[i], k = USE[i];
    if (!s || !s.uses || !(u[k] > 0) || u.cd[SLOTS[i]] > 0) continue;
    u[k] = Math.min(u[k], s.uses.n) - 1;
    if (u[k] > 0) u.cd[SLOTS[i]] = s.cd;
  }
  if (u.stkN > 0 && u.stkT <= 0) u.stkN = 0;
  g4Tick(m, u);
  g3Tick(m, u);
  k4Tick(m, u);   // kit-remake K4: tumay's chaos orb pool
  u.ccPrev = u.tfT > 0 && u.tfCc < 1 ? [u.stunT, u.slowT, u.rootT] : null;
  // counter: the window runs out without a hit and 40% of the cooldown comes back
  if (u.parryT > 0) {
    u.parryT -= dt;
    if (u.parryT <= 0) { u.parryT = 0; const ps = u.def.skills[u.parrySlot]; if (ps) u.cd[SLOTS[u.parrySlot]] = Math.max(0, u.cd[SLOTS[u.parrySlot]] - ps.cd * 0.4); }
  }
  if (u.shieldT > 0) { u.shieldT -= dt; if (u.shieldT <= 0) { u.shield = 0; u.shieldT = 0; popShield(m, u); } }
  if (u.skillAmp !== 1 && !u.cast && !u.dash) u.skillAmp = 1;
  if (u.tfT > 0) { u.tfT -= dt; if (u.tfT <= 0) endTransform(m, u); }
  k1Tick(m, u, dt);
  adTick(u);   // kit-remake G5 An Dương Vương: crit stacks, kill reward
  tthTick(m, u, dt);   // kit-remake G5 Tào Tháo
  sntTick(m, u, dt); if (!u.alive) return;   // kit-remake G5 Sơn Tinh
  if (k13Tick(m, u, dt)) return;   // kit lane K13: wind-eye ticks, temple pulses, fading haste
  // burn (hitfx): damage over time, N stacks, credited to whoever lit it
  if (u.burnT > 0) {
    u.burnT -= dt;
    if (u.burnT <= 0) { u.burnT = 0; u.burnN = 0; }
    else { const bh = u.hp; damage(m, u, u.burnN * u.burnDps * dt, u.burnBy >= 0 ? m.units[u.burnBy] : null); k10BurnSteal(m, u, bh); if (!u.alive) return; }   // K10: bcSteal
  }
  // dash.recast: the window to press the skill again runs only while the unit is free to
  if (u.recast && !u.dash && !u.cast) {
    u.recast.t -= dt;
    if (u.recast.t <= 0) { u.cd['s1 s2 ult'.split(' ')[u.recast.slot]] = u.def.skills[u.recast.slot].cd; u.recast = null; }
  }
  // next (two-stage skill): the follow-up waits for its window; it takes a fresh press, so the key must have been let go
  if (u.next) {
    if (!inp[SLOTS[u.next.slot]]) u.next.up = true;
    u.next.t -= dt;
    if (u.next.t <= 0) u.next = null;
  }
  u.combatT += dt;
  // rewind reads the hit points of the last three seconds, one sample each half second (host side only: only what it heals travels)
  if (m.tick % 15 === 0) { u.hpHist.push(u.hp); if (u.hpHist.length > 7) u.hpHist.shift(); }
  u.bush = bushAt(m.map, u.x, u.z);
  if (u.passive) PASSIVE_TICK[u.passive]?.(m, u);
  if (u.bush < 0) for (const z of m.zones) if (z.hide && dist2(u.x, u.z, z.x, z.z) < z.r * z.r) { u.bush = 1000 + z.id; break; }

  // Phó bản monsters (def.monster) neither heal at a base nor regenerate out of combat.
  if (m.mode !== 'tudo' && !u.def.boss && !u.def.monster) {
    const own = m.map.bases[u.team], foe = m.map.bases[1 - u.team], br = RULES.baseRadius;
    if (dist2(u.x, u.z, own[0], own[1]) < br * br) { if (u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * RULES.baseRegen * dt); }
    else if (m.mode !== 'trum' && m.mode !== 'nha' && m.mode !== 'pve' && dist2(u.x, u.z, foe[0], foe[1]) < br * br) { burn(m, u, RULES.baseBurn * dt); if (!u.alive) return; }
  }
  const grip = gripAt(m.map, u.x, u.z, u);
  for (const h of m.map.hazards) {
    if (h.kind === 'vent' || h.kind === 'ice' || dist2(u.x, u.z, h.x, h.z) > h.r * h.r) continue;
    if (h.kind === 'mud') { if (!u.def.hover && !u.def.heavy) { u.slowT = Math.max(u.slowT, 0.2); u.slowF = Math.max(u.slowT > 0.2 ? u.slowF : 0, RULES.mud.slow); } }
    else { burn(m, u, RULES.lava.dps * dt); if (!u.alive) return; }
  }
  if (!u.def.boss && !u.def.monster && u.combatT > RULES.regenDelay && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * RULES.regen * dt);
  if (u.woundT > 0) u.woundT -= dt;
  if (u.healT > 0) { u.healT = Math.max(0, u.healT - dt); heal(m, u, u.healRate * dt, u, true); }

  // guard (skill row): while that skill's cast runs the mech takes `guard` less of every blow and shrugs off crowd control
  if (u.cast && u.cast.skill.guard) { u.guardT = Math.max(u.guardT, 2 * dt); u.guardF = u.cast.skill.guard; u.ccT = Math.max(u.ccT, 2 * dt); }
  if (u.def.heavy) { u.stunT = 0; u.kx = 0; u.kz = 0; }
  if (u.ccT > 0) { u.stunT = 0; u.slowT = 0; u.rootT = 0; u.kx = 0; u.kz = 0; }
  g2Tick(m, u);   // kit-remake G2: tags, saves, onHurt cc, energy, slowG, slowFire timers
  k2Tick(m, u);   // kit-remake G5 Athena: the heal when a bless.undying ends
  krTick(m, u);   // kit-remake G5 Kurumi: a rewind mark snaps hp back when it ends
  k7Tick(m, u);   // kit-remake G5 lane K7: Serious Mode
  k10Tick(m, u);   // kit lane K10: Apocalypse's timed burst, Kirito's penetration stacks
  if (u.stance) { u.kx = 0; u.kz = 0; }
  // knock-up (hitfx air): the mech is in the air only while the stun it came with lasts (cc immunity, heavy, ccResist cut both)
  if (u.airT > u.stunT) u.airT = u.stunT;
  if (u.locT > 0) inp = locInput(m, u, inp);
  if (u.tthHT > 0) inp = tthHeld(u);   // kit-remake G5 Tào Tháo: a hold
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
  if (u.slamT > 0) slamCheck(m, u);
  const drag = u.passive === 'steady' ? 0.6 : 0.8;
  u.kx *= drag; u.kz *= drag;
  if (u.thenQ.length && u.alive) thenStep(m, u, inp, stunned || locked(u));
  if (stunned || !u.alive) return;

  if (inp.heal && u.cd.heal <= 0 && u.hp < u.maxHp) {
    u.cd.heal = RULES.healItem.cd; u.healT = RULES.healItem.dur; u.healRate = u.maxHp * RULES.healItem.frac / RULES.healItem.dur;
    m.events.push({ t: 'item', id: u.id });
  }
  // charge (skill row): a held cast goes off when its key is pressed again after being let go, or by itself when full
  if (u.cast && u.cast.charge) {
    const c = u.cast;
    if (!inp[SLOTS[c.slot]]) c.up = true;
    else if (c.up && c.total - c.t >= c.skill.charge.min) { u.cast = null; FINISH[c.skill.do](m, u, c.skill, c); }
  }
  if (u.cast && u.cast.skill.bnStop) bnStop(m, u, inp);   // kit-remake G5 Băng Nha: press again to stop the channel
  if (u.cast || u.dash) { u.charge = 0; return; }
  // silence (hitfx): no skills, the weapon still works
  for (let i = 0; i < 3 && !(u.silenceT > 0); i++) {
    const key = SLOTS[i], rc = u.recast, re = !!rc && rc.slot === i && rc.t > 0;
    // next: the second stage of a two-stage skill is ready (armed, key pressed afresh): this press casts it, whatever the cooldown says
    const nx = u.next && u.next.slot === i && u.next.armed && u.next.up ? u.next : null;
    if (!inp[key] || (!skillReady(u, i) && !re && !nx)) continue;
    const s = nx ? u.def.skills[i].next.row : u.def.skills[i], at = m.events.length, wasHidden = u.stealthT;
    if (u.rootT > 0 && ROOT_BLOCKS[s.do] && !s.rootOk) continue;   // kit-remake G5 An Dương Vương: rootOk
    m.events.push({ t: 'skill', id: u.id, slot: i, skill: s.id, x: u.x, z: u.z, a: u.aim });
    u.stealthT = 0;
    // A skill that needs a target and finds none (swap, mark) does not happen: a short lockout instead of the cooldown.
    const hide = u.revealT;
    u.revealT = RULES.revealOnFire;
    // meter 'skill': an armed meter powers up the next skill that deals damage (skillAmp lives until its cast or dash is over)
    const P = u.passive === 'meter' ? u.def.passive : null, amped = !!P && P.spend.kind === 'skill' && u.meter >= P.max && !!(s.dmg || s.dps);
    if (amped) u.skillAmp = P.spend.mul;
    // next.onHit: the second stage is armed only once this cast has hit an enemy (see damage); otherwise at once. It exists before
    // the cast runs, so a first stage that hits at once (warp.land) arms it in the same tick.
    const nextWas = u.next;
    if (s.next) u.next = { slot: i, src: s.id, t: s.next.onHit ? (s.delay || 0) + 0.6 : s.next.window, armed: !s.next.onHit, up: false, target: -1 };
    // cdCut / self count this press's hits from zero; a cut of this slot by a hit inside the cast waits for its cooldown (pressing)
    if (s.cdCut || s.self) u.hitN[s.id] = 0;
    u.pressing = nx ? -1 : i;
    u.yankX = inp.tx; u.yankZ = inp.tz;
    if (CAST[s.do](m, u, s, inp) === false) {
      m.events.length = at; u.pressing = -1; u.pendCut = null;
      if (!nx) { if (u.def.skills[i].uses) u[GAP[i]] = Math.max(u[GAP[i]], 0.4); else u.cd[key] = 0.4; }
      u.stealthT = wasHidden; u.revealT = hide; u.skillAmp = 1; if (s.next) u.next = nextWas; continue;
    }
    // meter castShield {frac, dur}: every cast (a second stage too) wraps the mech in a shield of frac of its max hp
    if (P && P.castShield) { u.shield = Math.max(u.shield, u.maxHp * P.castShield.frac); u.shieldMax = Math.max(u.shieldMax, u.shield); u.shieldT = Math.max(u.shieldT, P.castShield.dur); }
    g4Cast(m, u, s);
    k7Cast(m, u, s);   // kit-remake G5 lane K7: a cast breaks the ice block, the dash reloads
    k13Cast(m, u, s);   // kit lane K13
    if (u.passive === 'castHeal') k2CastHeal(m, u);   // kit-remake G5 Athena
    if (nx) { castHooks(u, s, i); u.next = null; if (!u.cast && !u.dash) u.skillAmp = 1; u.charge = 0; return; }
    if (amped) meterSpent(m, u);
    if (P) meterAdd(m, u, 'cast', 1);
    if (!u.cast && !u.dash) u.skillAmp = 1;
    if (s.recast) {
      // dash.recast: the skill stays ready for another press inside the window; the cooldown starts after the last one
      if (re) { rc.left--; if (rc.left <= 0) { u.recast = null; u.cd[key] = s.cd; } else { rc.t = s.recast.window; u.cd[key] = 0; } }
      else { u.recast = { slot: i, left: s.recast.n - 1, t: s.recast.window }; u.cd[key] = 0; }
    } else if (s.uses) {
      // uses: spend one; the recharge starts now unless one is already running
      u[USE[i]]++; u[GAP[i]] = s.uses.gap || 0;
      if (!(u.cd[key] > 0)) u.cd[key] = s.cd;
    } else u.cd[key] = s.cd;
    // cdAfter: the cooldown stands still while the row's state runs (stateOn); dur seconds for a row without a live state
    if (s.cdAfter) { u.hold |= 1 << i; u.holdT[i] = s.do === 'transform' || s.do === 'shield' ? 0 : s.dur || 0; }
    castHooks(u, s, i);
    k1Cast(m, u, s);
    if (s.adHeal) heal(m, u, u.maxHp * s.adHeal, u);   // kit-remake G5 An Dương Vương
    // thrifty (passive): a cast sometimes gives most of its cooldown back
    if (u.passive === 'thrifty' && !s.recast && m.rng() < u.def.passive.chance) { u.cd[key] *= 1 - u.def.passive.refund; m.events.push({ t: 'thrift', id: u.id, slot: i }); }
    // form (passive) flip: using the slot changes the stance
    if (u.passive === 'form' && u.def.passive.flip === key) flipForm(m, u);
    u.charge = 0;
    return;
  }
  if (weaponOf(u).charge) stepCharge(m, u, inp);
  else if (inp.fire && u.cd.fire <= 0 && !(u.magT > 0) && !(u.sirT > 0)) fireWeapon(m, u, inp);   // sirT: kit-remake G5 Thủy Tinh
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

// ---- kit-remake G1 (~/handoff/dtt-ref/kits/MECHANICS.md): uses (charges), cdCut, self, steal/healLost/healMax, towerMul, invuln/unstoppable, cdAfter ----
const USE = ['use0', 'use1', 'use2'], GAP = ['gap0', 'gap1', 'gap2'], HOLD_BIT = { s1: 1, s2: 2, ult: 4 };
// dash, leap and flurry read their own `invuln: true` (a dash's is not cc immunity); a number there, and any other row, is the generic one
const OWN_INVULN = { dash: 1, leap: 1, flurry: 1 };

// Can slot i be cast now? uses {n, gap} (skill charges; `charges` is taken by the wire row): a use is left and the gap since the last one is over; otherwise the cooldown is done.
export function skillReady(u, i) {
  const s = u.def.skills[i];
  // kit-remake G2 energy: a row with `en.cost` needs that much energy stored (a plain `cost` is the hp price of a buff)
  if (s && s.en && s.en.cost && !(u.en >= s.en.cost)) return false;
  if (s && s.uses) return u[USE[i]] < s.uses.n && !(u[GAP[i]] > 0);
  return !(u.cd[SLOTS[i]] > 0);
}
// cdAfter: is the state of slot i's row (or its second stage) still running? holdT counts down dur for rows without a live state.
function stateOn(u, i) {
  const s = u.def.skills[i], nx = s.next ? s.next.row : null, d = u.dash;
  if (u.holdT[i] > 0) { u.holdT[i] -= TICK; return true; }
  if (u.tfT > 0 && u.tfSlot === i) return true;
  if (u.next && u.next.slot === i) return true;
  if (u.cast && (u.cast.skill === s || (nx && u.cast.skill === nx))) return true;
  if (d && (d.s === s || d.land === s || (nx && (d.s === nx || d.land === nx)))) return true;
  if (u.flurry && u.flurry.s === s) return true;
  return s.do === 'shield' && u.shieldT > 0;
}
// How long the cast or dash a row has just started runs (a leap: wind-up plus flight), for invuln/unstoppable: true.
const actTime = (u, s) => (u.cast ? u.cast.t + (s.do === 'leap' ? s.flight : 0) : 0) + (u.dash ? u.dash.left / u.dash.speed : 0) + 0.1;
// What every successful press does once its cooldown is set: invuln, unstoppable, self (on cast), the cuts that waited, cdCut on cast.
function castHooks(u, s, i) {
  if (s.invuln && !(s.invuln === true && OWN_INVULN[s.do])) { const t = s.invuln === true ? actTime(u, s) : s.invuln; u.invulnT = Math.max(u.invulnT, t); u.ccT = Math.max(u.ccT, t); }
  if (s.unstoppable) u.ccT = Math.max(u.ccT, s.unstoppable === true ? actTime(u, s) : s.unstoppable);
  if (s.self && s.self.on !== 'hit') selfBuff(u, s.self);
  const P = u.pendCut;
  u.pressing = -1; u.pendCut = null;
  if (P) for (let k = 0; k < P.length; k += 2) applyCut(u, P[k + 1], P[k]);
  if (s.cdCut && s.cdCut.on === 'cast') cutCd(u, s.cdCut, i);
  g2Cast(u, s, i);   // kit-remake G2: energy cost and drain, mods.onCast
  if (s.then) u.thenQ.push({ row: s.then, slot: i, t: s.then.after || 0 });
}
// self {on, dur, haste, rapid, armor, guard, cc}: the caster's own buff; a weaker one never replaces a stronger one that still runs
function selfBuff(u, S) {
  const d = S.dur ?? 1.5;
  if (S.haste) { u.hasteF = Math.max(u.hasteT > 0 ? u.hasteF : 1, S.haste); u.hasteT = Math.max(u.hasteT, d); }
  if (S.rapid) { u.rapidF = Math.max(u.rapidT > 0 ? u.rapidF : 1, S.rapid); u.rapidT = Math.max(u.rapidT, d); }
  if (S.armor) { if (!(u.armorT > 0)) u.reflectF = 0; u.armorF = Math.max(u.armorT > 0 ? u.armorF : 0, S.armor); u.armorT = Math.max(u.armorT, d); }
  if (S.guard && S.vs) g2Guard(u, S.guard, S.vs, d);   // kit-remake G2: guard vs 'skill' | 'weapon'
  else if (S.guard) { u.guardF = Math.max(u.guardT > 0 ? u.guardF : 0, S.guard); u.guardT = Math.max(u.guardT, d); }
  if (S.cc) u.ccT = Math.max(u.ccT, d);
  if (S.shots) shotsArm(u, S);
}
// cdCut {slot: self|s1|s2|ult|all|other, cut, frac, set}: slot i's row cuts these cooldowns; the slot being pressed this tick waits (pendCut)
function cutCd(u, C, i) {
  for (let j = 0; j < 3; j++) {
    const on = C.slot === 'all' || (C.slot === 'other' ? j !== i : !C.slot || C.slot === 'self' ? j === i : SLOTS[j] === C.slot);
    if (!on || !u.def.skills[j]) continue;
    if (u.pressing === j) { if (!u.pendCut) u.pendCut = []; u.pendCut.push(C, j); } else applyCut(u, j, C);
  }
}
function applyCut(u, j, C) {
  const k = SLOTS[j];
  if (C.set !== undefined && u.cd[k] > C.set) u.cd[k] = C.set;
  u.cd[k] = Math.max(0, u.cd[k] - (C.cut || 0) - (C.frac || 0) * u.def.skills[j].cd);
}
// The slot whose row (or second stage) a source tag names; -1 for the weapon, an untagged hit, or a tag this unit has no row for.
function srcSlot(u, src) {
  if (!src || src === 'w') return -1;
  const S = u.def.skills;
  for (let i = 0; i < S.length; i++) if (S[i].id === src || (S[i].next && S[i].next.row.id === src) || (S[i].then && S[i].then.id === src)) return i;
  return -1;
}
const slotRow = (u, i, src) => (u.def.skills[i].id === src ? u.def.skills[i] : u.def.skills[i].next && u.def.skills[i].next.row.id === src ? u.def.skills[i].next.row : u.def.skills[i].then);
// A skill row of u has just hurt an enemy (left: hp it took): steal, healLost, healMax, self on hit, cdCut on hit.
function rowHit(m, u, left) {
  const i = srcSlot(u, curSrc);
  if (i < 0) return;
  const s = slotRow(u, i, curSrc);
  if (s.steal && left > 0) heal(m, u, left * s.steal, u, true);
  // healLost (one after another: each hit heals that share of what is lost by then), healMax (that share of max hp)
  if (s.healLost || s.healMax) heal(m, u, (u.maxHp - u.hp) * (s.healLost || 0) + u.maxHp * (s.healMax || 0), u);
  if (!s.cdCut && !s.self) return;
  const n = u.hitN[s.id] = (u.hitN[s.id] || 0) + 1;
  if (s.self && s.self.on === 'hit' && n === 1) selfBuff(u, s.self);
  if (s.cdCut && s.cdCut.on !== 'cast' && (!s.cdCut.max || n <= s.cdCut.max)) cutCd(u, s.cdCut, i);
}
// towerMul on the row that hurt the tower, and on a transform row while it runs (once when that row is the source)
function rowTowerMul(u) {
  const i = srcSlot(u, curSrc), s = i >= 0 ? slotRow(u, i, curSrc) : null, t = u.tfT > 0 && u.tfSlot >= 0 ? u.def.skills[u.tfSlot] : null;
  return (s && s.towerMul !== undefined ? s.towerMul : 1) * (t && t !== s && t.towerMul !== undefined ? t.towerMul : 1);
}

// ---- kit-remake G2 (~/handoff/dtt-ref/kits/MECHANICS.md): hitfx tag + row vsTag, mods.save, guard vs, mods.onHurt, mods.onCast,
// energy (def.energy, row en {cost, drain, refund}, hitfx enSteal), hitfx slowDecay/slowGrow/slowStack (slowG), hitfx slowFire, thruWalls ----
const G2_T = ['svT', 'undyT', 'gvT', 'ohT', 'dsT', 'ssT', 'sfT'], CC_SEEN = ['stunT', 'rootT', 'silenceT'];
// The kind of hit damage() is handling: 'weapon' (the main gun's tag) or 'skill' (every other enemy hit: skill rows, their untagged extras, fields).
const hitKind = () => (curSrc === 'w' ? 'weapon' : 'skill');
const hurtMod = (u) => { const P = u.def.passive; return P && P.mods ? P.mods.onHurt : null; };
const saveMod = (u) => { const P = u.def.passive; return P && P.mods ? P.mods.save : null; };
const enAdd = (u, n) => { if (n > 0 && u.def.energy) u.en = Math.min(u.def.energy.max, u.en + n); };
const dsNow = (o) => (o.dsT > 0 && o.dsD > 0 ? o.dsF * (o.dsK ? 1 - o.dsT / o.dsD : o.dsT / o.dsD) : 0);
const g2SlowNow = (o) => { o.slowG = Math.max(dsNow(o), o.ssT > 0 ? Math.min(o.ssMax, o.ssN * o.ssF) : 0); };

function g2Clear(u) {
  u.tags = {}; u.tgT = 0; u.svT = 0; u.undyT = 0; u.gvT = 0; u.gvF = 0; u.gvK = '';
  u.ohT = 0; u.ohAcc = 0; u.ohCc = [0, 0, 0];
  const E = u.def.energy;
  u.en = E ? E.start ?? E.max : 0; u.enDrain = null;
  u.dsT = 0; u.dsD = 0; u.dsF = 0; u.dsK = 0; u.ssN = 0; u.ssT = 0; u.ssF = 0; u.ssMax = 0; u.slowG = 0; u.sfT = 0; u.sfF = 1;
}
// Once a tick, after cc immunity has wiped stuns: timers, tags, slowG, onHurt by 'cc', energy regen and drain.
function g2Tick(m, u) {
  for (const k of G2_T) if (u[k] > 0) u[k] = Math.max(0, u[k] - TICK);
  let tg = 0;
  for (const k in u.tags) { const t = u.tags[k] - TICK; if (t > 1e-9) { u.tags[k] = t; if (t > tg) tg = t; } else delete u.tags[k]; }
  u.tgT = tg;
  if (u.ccT > 0) { u.dsT = 0; u.ssT = 0; }
  if (!(u.ssT > 0)) u.ssN = 0;
  g2SlowNow(u);
  // onHurt by 'cc': a stun, root or silence that landed (or got longer) since the last tick
  const O = hurtMod(u);
  if (O && O.by === 'cc' && !(u.ohT > 0) && CC_SEEN.some((k, i) => u[k] > u.ohCc[i] + 1e-9)) onHurtFire(m, u, null, O);
  for (let i = 0; i < 3; i++) u.ohCc[i] = u[CC_SEEN[i]];
  const E = u.def.energy;
  if (!E) return;
  if (E.regen) enAdd(u, E.regen * TICK);
  const D = u.enDrain;
  if (D && !g2StateOn(u, D.s, D.slot)) u.enDrain = null;
  else if (D) {
    u.en -= D.rate * TICK;
    if (u.en <= 1e-9) { u.en = 0; u.enDrain = null; g2EndState(m, u, D.s, D.slot); }
  }
}
// en.drain: does the state the row started still run (its transform, cast, dash, flurry or shield)?
function g2StateOn(u, s, i) {
  return (u.tfT > 0 && u.tfSlot === i) || (!!u.cast && u.cast.skill === s) || (!!u.dash && (u.dash.s === s || u.dash.land === s)) || (!!u.flurry && u.flurry.s === s) || (s.do === 'shield' && u.shieldT > 0);
}
// en.drain ran the energy dry: the state ends at once (a transform ends, a cast or dash is cut, a shield drops)
function g2EndState(m, u, s, i) {
  if (u.tfT > 0 && u.tfSlot === i) endTransform(m, u);
  if (u.cast && u.cast.skill === s) u.cast = null;
  if (u.dash && (u.dash.s === s || u.dash.land === s)) u.dash = null;
  if (u.flurry && u.flurry.s === s) u.flurry = null;
  if (s.do === 'shield' && u.shieldT > 0) { u.shield = 0; u.shieldT = 0; }
  m.events.push({ t: 'enOut', id: u.id, slot: i, x: u.x, z: u.z });
}
// Every successful press (second stages too): en.cost, en.drain, and the passive's mods.onCast self buff.
function g2Cast(u, s, i) {
  const N = s.en;
  if (N && N.cost) u.en = Math.max(0, u.en - N.cost);
  if (N && N.drain && u.def.energy) u.enDrain = { s, slot: i, rate: N.drain };
  const P = u.def.passive, C = P && P.mods && P.mods.onCast;
  if (C) selfBuff(u, C);
}
function g2Guard(u, f, vs, d) {
  const same = u.gvT > 0 && u.gvK === vs;
  u.gvF = same ? Math.max(u.gvF, f) : f; u.gvT = same ? Math.max(u.gvT, d) : d; u.gvK = vs;
}
// The row behind the hit being handled: the weapon for 'w', the skill row (or its second stage) for a skill tag, else null.
function g2Row(u) {
  if (curSrc === 'w') return weaponOf(u);
  const i = srcSlot(u, curSrc);
  return i >= 0 ? slotRow(u, i, curSrc) : null;
}
// vsTag {key, mul, fx, healMax, cdCut, self, consume}: the row hits a victim carrying the caster's own tag `key`
function vsTagOf(foe, u) {
  const r = foe.def && foe.def.skills ? g2Row(foe) : null, V = r && r.vsTag;
  return V && u.tags && u.tags[V.key + '@' + foe.id] > 0 ? V : null;
}
function vsTagPay(m, foe, u, V) {
  const keep = curSrc, i = curSrc === 'w' ? -1 : srcSlot(foe, curSrc);
  if (V.consume && u.tags) delete u.tags[V.key + '@' + foe.id];
  if (V.healMax) heal(m, foe, foe.maxHp * V.healMax, foe);
  if (V.cdCut) cutCd(foe, V.cdCut, i);
  if (V.self) selfBuff(foe, V.self);
  m.events.push({ t: 'tagPay', id: u.id, by: foe.id, key: V.key, x: u.x, z: u.z });
  // the fx rides with no source tag (it never feeds stacks or pays a tag again)
  if (V.fx && u.alive) { curSrc = null; applyFx(m, foe, u, V.fx); curSrc = keep; }
}
// hitfx fields of G2. Returns true when the fx's slow went to slowG (slowDecay / slowGrow / slowStack), so the plain slow is skipped.
function g2Fx(src, o, fx) {
  if (fx.tag && o.tags && src) { const k = fx.tag.key + '@' + src.id; o.tags[k] = Math.max(o.tags[k] || 0, fx.tag.dur); o.tgT = Math.max(o.tgT, o.tags[k]); }
  // slowFire {mul, dur}: the victim's weapon cooldown runs at x mul (the strongest that still runs wins)
  if (fx.slowFire) { o.sfF = o.sfT > 0 ? Math.min(o.sfF, fx.slowFire.mul) : fx.slowFire.mul; o.sfT = Math.max(o.sfT, fx.slowFire.dur); }
  // enSteal: the victim loses that much energy, the attacker gains what was taken
  if (fx.enSteal && o.def.energy) { const t = Math.min(o.en, fx.enSteal); o.en -= t; if (src && src.def) enAdd(src, t); }
  const mine = !!(fx.slowStack || fx.slowDecay || fx.slowGrow);
  if (!mine || o.ccT > 0) return mine;
  if (fx.slowStack) {
    // slowStack {step, max}: each hit adds step (up to max) and refreshes slowDur
    const S = fx.slowStack;
    o.ssN = o.ssT > 0 ? Math.min(o.ssN + 1, Math.ceil(S.max / S.step - 1e-9)) : 1; o.ssF = S.step; o.ssMax = S.max; o.ssT = fx.slowDur;
  } else {
    // slowDecay: slow falls from `slow` to 0 over slowDur; slowGrow: climbs from 0 to `slow` (a growing curse is never restarted;
    // a decaying one is replaced unless what runs slows harder right now)
    const K = fx.slowGrow ? 1 : 0;
    if (o.dsT > 0 && (o.dsK === 1 ? K === 1 : dsNow(o) > fx.slow)) return true;
    o.dsK = K; o.dsF = fx.slow; o.dsD = o.dsT = fx.slowDur;
  }
  g2SlowNow(o);
  return true;
}
// After a hit that landed: energy gains, vsTag payoff, onHurt, a below-hp save. kind: 'weapon' | 'skill'; vt: the vsTag it paid.
function g2After(m, u, foe, left, kind, vt) {
  if (foe && foe.alive && foe.def.energy) {
    const G = foe.def.energy.gain || {}, r = curSrc && curSrc !== 'w' ? g2Row(foe) : null;
    enAdd(foe, (curSrc === 'w' ? G.weapon || 0 : curSrc ? G.hit || 0 : 0) + (r && r.en && r.en.refund ? r.en.refund : 0));
  }
  if (foe && u.alive && u.def.energy) enAdd(u, (u.def.energy.gain || {}).hurt || 0);
  if (vt && foe && foe.alive) vsTagPay(m, foe, u, vt);
  if (!u.alive) return;
  // onHurt {by: 'skill' | 'weapon' | 'any', every, icd}: every qualifying hit, or each time `every` of max hp is lost
  const O = hurtMod(u);
  if (O && foe && O.by !== 'cc' && (!O.by || O.by === 'any' || O.by === kind)) {
    if (O.every) {
      u.ohAcc += left;
      const stp = O.every * u.maxHp;
      while (u.ohAcc >= stp && u.alive) { u.ohAcc -= stp; if (!(u.ohT > 0)) onHurtFire(m, u, foe, O); }
    } else if (!(u.ohT > 0)) onHurtFire(m, u, foe, O);
  }
  if (u.alive && left > 0) { const o = saverFor(m, u, false); if (o) runSave(m, o, u); }
}
function onHurtFire(m, u, foe, O) {
  u.ohT = O.icd || 0;
  if (O.self) selfBuff(u, O.self);
  if (O.cdCut) cutCd(u, O.cdCut, -1);
  const amt = (u.maxHp - u.hp) * (O.heal || 0) + u.maxHp * (O.healMax || 0);
  if (amt > 0) heal(m, u, amt, u);
  // mark {key, dur}: the attacker gets this mech's tag (a vsTag row of this mech pays on it)
  if (O.mark && foe && foe.alive && foe.tags) { const k = O.mark.key + '@' + u.id; foe.tags[k] = Math.max(foe.tags[k] || 0, O.mark.dur); foe.tgT = Math.max(foe.tgT, foe.tags[k]); }
  m.events.push({ t: 'onHurt', id: u.id, x: u.x, z: u.z });
}
// save {fatal | below, icd, ...}: the unit's own save first, then an ally's with `ally: true` inside r (lowest id first)
function saverFor(m, u, fatal) {
  if (canSave(u, u, fatal)) return u;
  for (const o of m.units) if (o !== u && canSave(o, u, fatal)) return o;
  return null;
}
function canSave(o, u, fatal) {
  const S = saveMod(o);
  if (!S || !o.alive || o.svT > 0 || !!S.fatal !== fatal) return false;
  if (o !== u && !(S.ally && o.team === u.team && dist2(o.x, o.z, u.x, u.z) <= (S.r || 6) ** 2)) return false;
  return fatal || u.hp < u.maxHp * S.below;
}
function runSave(m, o, u) {
  const S = saveMod(o), d = S.dur ?? 2;
  o.svT = S.icd || 0;
  if (u.hp <= 0) u.hp = 1;
  if (S.cleanse) cleanse(u);
  const amt = u.maxHp * (S.heal || 0) + (u.maxHp - u.hp) * (S.lostHeal || 0);
  if (amt > 0) heal(m, u, amt, o);
  if (S.invuln) { u.invulnT = Math.max(u.invulnT, S.invuln); u.ccT = Math.max(u.ccT, S.invuln); }
  if (S.undying) u.undyT = Math.max(u.undyT, S.undying);
  if (S.haste || S.guard || S.armor || S.cc) selfBuff(u, { dur: d, haste: S.haste, guard: S.guard, armor: S.armor, cc: S.cc, vs: S.vs });
  if (S.resetSlots && o === u) for (const k of S.resetSlots) u.cd[k] = 0;
  if (S.ice) sirIce(m, u, S.ice);   // kit-remake G5 Thủy Tinh: sealed in ice
  if (S.bhHot) k10Hot(u, S.bhHot);   // kit lane K10: Apocalypse's heal over time after the save
  m.events.push({ t: 'save', id: u.id, by: o.id, x: u.x, z: u.z });
}
// A hit took the last hp: undying holds it at 1, or a fatal save fires.
function g2Fatal(m, u) {
  if (u.undyT > 0) { u.hp = 1; return; }
  const o = saverFor(m, u, true);
  if (o) runSave(m, o, u);
}
// save.cleanse: every harmful timer goes
function cleanse(u) {
  u.stunT = 0; u.slowT = 0; u.rootT = 0; u.silenceT = 0; u.airT = 0; u.weakenT = 0; u.blindT = 0; u.burnT = 0; u.burnN = 0; u.ahT = 0;
  u.dsT = 0; u.ssT = 0; u.ssN = 0; u.slowG = 0; u.sfT = 0;
}

// ---- kit-remake G3 (~/handoff/dtt-ref/kits/MECHANICS.md, Group 3): loss of control, stacks extensions, next N main shots, then,
// transform extensions, dash drag, armour pen, volley perTarget / sameDecay, onKill extras ----
// The projectile whose hit is being dealt right now (stepShots): its steal and pen ride the hit.
let curShot = null;
// Loss of control (hitfx kind: seconds). One state: locT (time left), locK (index here, in STATUS), locBy (who put it on), host side locA/locR.
export const LOC_KINDS = ['', 'confuse', 'fear', 'charm', 'petrify', 'sleep', 'banish', 'disarm', 'lift'];
const LOC_CONFUSE = 1, LOC_FEAR = 2, LOC_CHARM = 3, LOC_SLEEP = 5, LOC_BANISH = 6, LOC_DISARM = 7;
// Does the loss of control on u take its skills and weapon? (disarm takes only the weapon)
export const locked = (u) => (u.locT > 0 && u.locK !== LOC_DISARM) || u.tthHT > 0;   // kit-remake G5 Tào Tháo: a hold
// A longer one replaces what runs; heavy mechs shrug off all but disarm; cc immunity blocks all; transform.ccResist shortens it.
function applyLoc(m, src, o, fx) {
  for (let k = 1; k < LOC_KINDS.length; k++) {
    let d = fx[LOC_KINDS[k]];
    if (!(d > 0) || o.ccT > 0 || (o.def.heavy && k !== LOC_DISARM)) continue;
    if (o.tfT > 0) d *= o.tfCc;
    if (d < o.locT) continue;
    o.locT = d; o.locK = k; o.locBy = src ? src.id : -1; o.locR = 0.5;
    if (k === LOC_CONFUSE) o.locA = m.rng() * 2 * Math.PI;
    if (k === LOC_BANISH) o.invulnT = Math.max(o.invulnT, d);
    m.events.push({ t: 'loc', id: o.id, kind: LOC_KINDS[k], dur: d, by: o.locBy, x: o.x, z: o.z });
  }
}
// The input a mech under loss of control plays instead of its own: confuse wanders (a new heading from m.rng() every 0.5 s, 0.6 of
// the speed), fear runs straight away from locBy, charm walks to locBy at half speed (stops 1.5 m short), petrify, sleep, banish
// and lift hold it still; none of these cast, shoot or use the item (the cast is cut like a stun). disarm only takes the weapon.
function locInput(m, u, inp) {
  if (u.ccT > 0 || (u.def.heavy && u.locK !== LOC_DISARM)) { u.locT = 0; return inp; }
  if (u.locK === LOC_DISARM) return inp.fire ? { ...inp, fire: false } : inp;
  u.cast = null; u.charge = 0;
  let mx = 0, mz = 0;
  const by = u.locBy >= 0 ? m.units[u.locBy] : null;
  if (u.locK === LOC_CONFUSE) {
    if ((u.locR -= TICK) <= 1e-9) { u.locR = 0.5; u.locA = m.rng() * 2 * Math.PI; }
    mx = Math.cos(u.locA) * 0.6; mz = Math.sin(u.locA) * 0.6;
  } else if ((u.locK === LOC_FEAR || u.locK === LOC_CHARM) && by && by.alive) {
    const dx = by.x - u.x, dz = by.z - u.z, d = Math.hypot(dx, dz) || 1;
    const k = u.locK === LOC_FEAR ? -1 : d > 1.5 + u.radius + by.radius ? 0.5 : 0;
    mx = dx / d * k; mz = dz / d * k;
  }
  return { ...NO_INPUT, mx, mz, aim: mx || mz ? Math.atan2(mz, mx) : u.aim, tx: u.x, tz: u.z };
}

// stacks extensions (passive stacks): icd (s) = after the n-th mark goes off on a target, this owner cannot mark it again for icd
// (stkLock[owner id] = time); per {slow, armor, amp} = each mark on the target: slowed slow x marks, armour down armor x marks
// (stkShred), takes amp x marks more from everyone; hurt {every, max, dur, armor} = the owner gains a mark of its own (hsN) per
// `every` of its max hp lost to foes, up to max, all gone dur s after the last one; each gives armor.
function stackPer(foe, u, P) {
  const R = P.per, n = u.stkN;
  if (R.slow) { u.slowF = Math.max(u.slowT > 0 ? u.slowF : 0, Math.min(0.9, R.slow * n)); u.slowT = Math.max(u.slowT, P.dur); }
  if (R.armor) u.stkShred = R.armor * n;
  if (R.amp) applyAmp(u, R.amp * n, P.dur);
}
// What armorOf adds: own hurt marks, transform stacks; minus the shred of the marks on it (never below 0 armour in all).
function g3Armor(u, a) {
  let d = 0;
  const P = u.passive === 'stacks' ? u.def.passive : null;
  if (P && P.hurt && u.hsN > 0) d += u.hsN * (P.hurt.armor || 0);
  const tf = u.tfT > 0 && u.tfSlot >= 0 ? u.def.skills[u.tfSlot] : null;
  if (tf && tf.stack && u.tfN > 0) d += u.tfN * (tf.stack.armor || 0);
  if (u.stkN > 0 && u.stkT > 0 && u.stkShred) d -= u.stkShred;
  return Math.max(-a, d);
}
// After a hit landed (amt = hp + shield it took): row detonate, the victim's hurt marks, transform stack on: 'hit'.
function g3Hit(m, foe, u, amt) {
  const i = curSrc && curSrc !== 'w' ? srcSlot(foe, curSrc) : -1, row = i >= 0 ? slotRow(foe, i, curSrc) : null;
  // detonate {per, fx}: a skill row's hit sets off every mark its owner has on the target: per x marks (scaled like the row), no tag
  if (row && row.detonate && u.alive && u.stkN > 0 && u.stkT > 0 && u.stkBy === foe.id) {
    const n = u.stkN, D = row.detonate, keep = curSrc;
    u.stkN = 0; u.stkT = 0; u.stkShred = 0;
    m.events.push({ t: 'detonate', id: u.id, by: foe.id, n, x: u.x, z: u.z });
    curSrc = null; damage(m, u, (D.per || 0) * n * dmgScale(foe), foe); curSrc = keep;
    if (u.alive && D.fx) applyFx(m, foe, u, D.fx);
  }
  const H = u.passive === 'stacks' && u.def.passive.hurt;
  if (H && u.alive) {
    u.hsAcc += amt; u.hsT = H.dur;
    while (u.hsAcc >= H.every * u.maxHp - 1e-9) { u.hsAcc -= H.every * u.maxHp; if (u.hsN < H.max) u.hsN++; }
  }
  const tf = foe.alive && foe.tfT > 0 && foe.tfSlot >= 0 ? foe.def.skills[foe.tfSlot] : null;
  if (tf && tf.stack && tf.stack.on === 'hit') tfStack(foe, tf);
}

// self.shots: n (the next n main shots, within shotsFor s, default 6) fly as the weapon with `patch` merged in (any weapon field:
// n, fan, splash, splashHit, pierce, fx, range, vis; steal = lifesteal of what each hit takes; pen) and dmg x mul.
function shotsArm(u, S) { u.shotN = S.shots; u.shotT = S.shotsFor ?? 6; u.shotRow = S; }
function shotsPatch(u, w) {
  if (!(u.shotN > 0) || !u.shotRow) return w;
  const S = u.shotRow, P = S.patch || {};
  if (--u.shotN <= 0) { u.shotN = 0; u.shotT = 0; u.shotRow = null; }
  return { ...w, ...P, dmg: (P.dmg ?? w.dmg) * (S.mul || 1) };
}

// then: row (on any skill row, a second stage, a transform onEnd or an onKill cast): a follow-up that goes off by itself once
// `after` s (default 0) have passed and the caster is free (no cast, dash or flurry), aimed where the caster aims then. Its hits
// carry its own id (srcSlot finds it under its slot). A stun or a lock drops what is queued; a target row finding nobody does nothing.
function thenStep(m, u, inp, blocked) {
  if (blocked) { u.thenQ.length = 0; return; }
  for (let k = 0; k < u.thenQ.length; k++) {
    const q = u.thenQ[k];
    if (q.t > 1e-9) { q.t -= TICK; if (q.t > 1e-9) continue; }
    if (u.cast || u.dash || u.flurry) continue;
    u.thenQ.splice(k--, 1);
    if (q.bgAt !== undefined && !bgAim(m, u, q)) continue;   // kit-remake G5 Black Panther: the second charge turns to its unit
    const at = m.events.length;
    m.events.push({ t: 'skill', id: u.id, slot: q.slot, skill: q.row.id, x: u.x, z: u.z, a: u.aim, then: 1 });
    if (CAST[q.row.do](m, u, q.row, inp) === false) { m.events.length = at; continue; }
    u.pressing = -1;
    castHooks(u, q.row, q.slot);
  }
}

// transform extensions: regen (share of max hp healed per s while it runs), zone {radius, dps, slow, hps, vis} (a field that follows
// the mech for the transform), patch {s1|s2|ult: fields} (the other slots' rows play with these fields merged in; u.tfBase keeps the
// plain def), stack {every | on: 'hit', max, dmg, armor} (tfN grows every `every` s or per hit it lands; each adds dmg to the
// transform's damage factor and armor), onEnd: row (cast by itself when the transform times out). A leap or dash with it: `then`.
function tfStart(m, u, s) {
  u.tfN = 0; u.tfAcc = 0;
  const Z = s.zone;
  if (Z) addZone(m, u, { kind: 'field', vis: Z.vis, x: u.x, z: u.z, r: Z.radius, dur: s.dur, hps: Z.hps || 0, dps: Z.dps || 0, slow: Z.slow || 0, hide: false, pull: 0, acc: 0,
    haste: 0, blind: null, follow: true, armor: 0, cage: false, held: 0, drain: 0, shield: 0, sh: {} });
  if (s.patch) {
    const base = u.tfBase || u.def, P = s.patch;
    u.tfBase = base;
    u.def = { ...base, skills: base.skills.map((r, i) => (P[SLOTS[i]] && r !== s ? { ...r, ...P[SLOTS[i]] } : r)) };
  }
}
function tfStack(u, s) {
  const S = s.stack;
  if (u.tfN >= S.max) return;
  u.tfN++; u.tfDmg = (s.dmg || 1) + u.tfN * (S.dmg || 0);
}
function tfEnd(u) {
  const s = u.tfSlot >= 0 ? u.def.skills[u.tfSlot] : null;
  if (u.tfBase) { u.def = u.tfBase; u.tfBase = null; }
  u.tfN = 0; u.tfAcc = 0;
  if (s && s.onEnd && u.alive) u.thenQ.push({ row: s.onEnd, slot: u.tfSlot, t: 0 });
}

// Once a tick (after the status timers): loss of control, empowered shots, hurt marks, transform regen and timed stacks.
function g3Tick(m, u) {
  if (u.locT > 0) u.locT = Math.max(0, u.locT - TICK);
  if (u.shotN > 0 && (u.shotT -= TICK) <= 1e-9) { u.shotN = 0; u.shotT = 0; u.shotRow = null; }
  if (u.hsN > 0 || u.hsAcc > 0) { if ((u.hsT -= TICK) <= 1e-9) { u.hsN = 0; u.hsT = 0; u.hsAcc = 0; } }
  const tf = u.tfT > 0 && u.tfSlot >= 0 ? u.def.skills[u.tfSlot] : null;
  if (!tf) return;
  if (tf.regen) heal(m, u, u.maxHp * tf.regen * TICK, u, true);
  const S = tf.stack;
  if (S && S.every && u.tfN < S.max && (u.tfAcc += TICK) >= S.every - 1e-9) { u.tfAcc -= S.every; tfStack(u, tf); }
}

// dash drag: true: every mech the dash hits is carried along in front of it (held like a stun) until the dash ends; heavy, planted
// and cc-immune mechs stay put. Walls stop the one carried.
function dragHit(m, u, d) {
  for (const id of d.hit) {
    const o = m.units[id];
    if (!o.alive || o.def.heavy || o.stance || o.ccT > 0) continue;
    const k = u.radius + o.radius + 0.2;
    moveUnit(m, o, u.x + d.dx * k - o.x, u.z + d.dz * k - o.z);
    if (d.s.bnSlam) k10Slam(m, u, d, o, u.x + d.dx * k, u.z + d.dz * k);   // kit lane K10: Kirito's wall slam
    o.vx = o.vz = 0; o.dash = null; o.cast = null;
    o.stunT = Math.max(o.stunT, 2 * TICK);
  }
}

// pen (skill row, weapon row, or a shots patch): that share of the target's armour is ignored by this damage.
function penOf(foe) {
  if (!foe) return 0;
  if (curShot && curShot.owner === foe.id) return curShot.pen || 0;
  if (curSrc === 'w') return weaponOf(foe).pen || 0;
  const i = srcSlot(foe, curSrc);
  return i >= 0 ? slotRow(foe, i, curSrc).pen || 0 : 0;
}

// volley perTarget: n (the shots of one press, bursts included, hit one mech at most n times: the rest fly through it) and
// sameDecay: f (each further hit of that press on the same mech is worth f x the one before). The tally lives on the press (u.volTag).
const volFull = (s, o) => !!s.vol && s.vol.cap > 0 && (s.vol.hits[o.id] || 0) >= s.vol.cap;
function volHit(s, o) {
  const V = s.vol;
  if (!V) return 1;
  const n = V.hits[o.id] || 0;
  V.hits[o.id] = n + 1;
  return V.decay ? V.decay ** n : 1;
}

// onKill extras (passive mods.onKill): from: 's1'|'s2'|'ult'|'w' (the whole onKill block pays only for a killing blow from that
// row; assists are not gated), healLost (share of the lost hp healed), setCd {slot: s} (cooldowns lowered to s), cast: row (a free
// follow-up, queued like `then`).
const killFrom = (o, from) => (from === 'w' ? curSrc === 'w' : srcSlot(o, curSrc) === SLOTS.indexOf(from));
function onKillMore(m, o, K) {
  if (K.healLost) heal(m, o, (o.maxHp - o.hp) * K.healLost, o);
  if (K.setCd) for (const k in K.setCd) if (o.cd[k] > K.setCd[k]) o.cd[k] = K.setCd[k];
  if (K.cast) o.thenQ.push({ row: K.cast, slot: -1, t: 0 });
}
// ---- end kit-remake G3 ----
// ---- kit-remake G5 Athena (kit lane K2; ~/handoff/dtt-ref/kits/MECHANICS.md group 5, AUDIT-a.md athena) ----
// passive do 'castHeal' {r, ally, self, selfDur}: every press heals the ally with the lowest hp share within r (not the caster) by
//   `ally`, and the caster `self` over selfDur s (healT / healRate, the heal item's fields).
// barrage `lock: r`: the strikes go on the nearest visible enemy within r of the caster (lowest id on a tie) and ride it (zone `on`)
//   until they land; nobody in reach = no cast (a 0.4 s lockout, no use, no energy spent).
// bless `cleanse: true` (the G2 save's cleanse on the target), `shieldEn {per, en}` (each `per` of the caster's max hp the shield
//   absorbs gives the caster `en` energy; only the last caster's shield counts: shBy / shEn), `undying: s` (the target's hp cannot
//   drop under 1 for s: G2 undyT) and `endHeal: f` (when that runs out the target heals f of the caster's max hp: udHeal / udBy).
// None of this is in netstate STATUS (shBy, shEn, udHeal, udBy are host-side bookkeeping; undyT is G2's, also host-side).
function k2Clear(u) { u.shBy = -1; u.shEn = 0; u.udHeal = 0; u.udBy = -1; }
function k2Tick(m, u) {
  if (!(u.shieldT > 0) || u.shield <= 0) u.shBy = -1;
  if (u.udHeal > 0 && !(u.undyT > 0)) { const by = m.units[u.udBy]; heal(m, u, u.udHeal, by && by.alive ? by : u); u.udHeal = 0; u.udBy = -1; }
}
function k2CastHeal(m, u) {
  const P = u.def.passive;
  let best = null, bf = 2;
  for (const o of m.units) {
    if (o === u || o.team !== u.team || !o.alive || o.hp >= o.maxHp || dist2(o.x, o.z, u.x, u.z) > P.r * P.r) continue;
    const f = o.hp / o.maxHp;
    if (f < bf) { bf = f; best = o; }
  }
  if (best) heal(m, best, P.ally, u);
  if (P.self) { u.healRate = Math.max(u.healT > 0 ? u.healRate : 0, P.self / P.selfDur); u.healT = Math.max(u.healT, P.selfDur); }
}
function k2Lock(m, u, s) {
  let best = null, bd = s.lock * s.lock;
  for (const o of m.units) {
    if (o.team === u.team || !o.alive || o.invulnT > 0 || !visibleTo(m, o, u.team)) continue;
    const d = dist2(o.x, o.z, u.x, u.z);
    if (d < bd) { bd = d; best = o; }
  }
  return best ? [best] : [];
}
function k2Follow(m, z) {
  const o = m.units[z.on];
  if (o && o.alive) { z.x = o.x; z.z = o.z; } else z.on = -1;
}
function k2Bless(m, u, o, s) {
  if (s.cleanse) cleanse(o);
  if (s.shield && s.shieldEn) { o.shBy = u.id; o.shEn = s.shieldEn.en / (s.shieldEn.per * u.maxHp); }
  if (s.undying) { o.undyT = Math.max(o.undyT, s.undying); if (s.endHeal) { o.udHeal = s.endHeal * u.maxHp; o.udBy = u.id; } }
}
function k2Absorb(m, u, absorbed) {
  const by = m.units[u.shBy];
  if (by && by.alive && by.team === u.team) enAdd(by, absorbed * u.shEn);
  if (u.shield <= 0) u.shBy = -1;
}

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
  const w = shotsPatch(u, weaponOf(u));
  u.cd.fire = w.cd; u.stealthT = 0; u.revealT = RULES.revealOnFire;
  if (w.mag) magShot(m, u, w);
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
  // reach: the armed shot flies that many times the weapon's range (garage range levels included)
  const sw = boost && (boost.patch || boost.reach) ? { ...w, ...boost.patch, ...(boost.reach ? { range: w.range * boost.reach } : {}) } : w;
  for (let i = 0; i < n; i++) spawnShot(m, u, sw, base + (i - (n - 1) / 2) * (w.fan || 0), side, st, 'w', boost);
  if (u.def.passive && u.def.passive.missile) k4Missile(m, u, base);   // kit-remake K4: enbac's homing missile chance
  if ((u.def.passive && u.def.passive.crit) || sw.adFall) adShots(m, u, sw, n);   // kit-remake G5 An Dương Vương
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
    fx: boost && boost.stun ? { ...(w.fx || {}), stun: boost.stun } : w.fx || null, ret: !!w.ret, back: false, src: src || null, cdr: boost ? boost.cdr : 0, splashHit: !!w.splashHit,
    over: !!w.thruWalls,   // kit-remake G2 thruWalls: flies over walls and props (player-built wall zones still stop it)
    bn: !!w.bnWave,   // kit lane K10: Kirito's sword wave feeds his penetration stacks
    steal: src === 'w' ? w.steal || 0 : 0, pen: w.pen || 0, vol: src !== 'w' && (w.perTarget || w.sameDecay) ? u.volTag : null,
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
    if (s.windup && !dashGo) return dashWindup(u, s);
    // onStart: something left behind at the starting point: a mine, or a volley (back: true fires opposite to the aim).
    if (s.onStart && s.onStart.mine) placeMine(m, u, u.x, u.z, s.onStart.mine);
    if (s.onStart && s.onStart.volley) {
      const v = s.onStart.volley, a0 = u.aim + (v.back ? Math.PI : 0);
      for (let i = 0; i < (v.n || 1); i++) spawnShot(m, u, v, a0 + (i - ((v.n || 1) - 1) / 2) * (v.fan || 0), 0, null, s.id);
      m.events.push({ t: 'fire', id: u.id, vis: v.vis, x: u.x, z: u.z, a: a0, side: 0 });
    }
    if (s.back) return k4BackDash(u, s);   // kit-remake K4: enbac's dash away from the aim
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
    // charge {min, max, dmg[2], range[2], width[2]}: hold up to max seconds (aim locked, s.move of the speed), a fresh press after min lets it go
    if (s.charge) { u.cast = { skill: s, t: s.charge.max, total: s.charge.max, move: s.move ?? 0, lock: true, aim: u.aim, target: -1, charge: true, up: false, slot: u.def.skills.indexOf(s) }; return; }
    // track: lock the enemy nearest the cursor now and keep the beam on it while it winds up; none there, it fires straight.
    const o = s.track ? pickUnit(m, u, inp, s.track, (o) => o.team !== u.team) : null;
    u.cast = { skill: s, t: s.windup, total: s.windup, move: 0.12, lock: true, aim: u.aim, target: o ? o.id : -1 };
  },
  volley(m, u, s, inp) {
    if (s.home) return k4Homing(m, u, s, inp);   // kit-remake K4: enbac's homing volley
    if (s.perTarget || s.sameDecay) u.volTag = { cap: s.perTarget || 0, decay: s.sameDecay || 0, hits: {} };
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
    if (s.fwd) return krRewind(m, u, s);   // kit-remake G5 Kurumi: the forward rewind
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
    if (s.sntStone) sntStone(m, u, s);   // kit-remake G5 Sơn Tinh
  },
  // transform: a bigger buff. Everything buff does, plus a damage factor, cleanse, crowd-control immunity, a heal of the lost hp,
  // a shield, a size, a weapon swap (def.tfWeapon, read by weaponOf) and a nova after a windup (the cast is this skill; FINISH.transform fires it).
  transform(m, u, s, inp) {
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
    tfStart(m, u, s);
    if (s.sntLand) sntLand(m, u, s, inp);   // kit-remake G5 Sơn Tinh
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
    k1Bless(m, u, s, o);
    k2Bless(m, u, o, s);   // kit-remake G5 Athena: cleanse, shieldEn, undying + endHeal
    m.events.push({ t: 'bless', id: u.id, to: o.id, skill: s.id, x: o.x, z: o.z });
  },
  rally(m, u, s) {
    for (const o of m.units) {
      if (o.team !== u.team || !o.alive || dist2(o.x, o.z, u.x, u.z) > s.radius * s.radius) continue;
      heal(m, o, s.heal * (o === u ? RULES.selfHealMul : 1), u);
      o.slowT = 0; o.stunT = 0; o.markT = 0; o.burnT = 0; o.burnN = 0;
      o.hasteT = Math.max(o.hasteT, s.dur); o.hasteF = Math.max(o.hasteT > s.dur ? o.hasteF : 1, s.haste);
    }
    k1Rally(m, u, s);
    m.events.push({ t: 'rally', id: u.id, x: u.x, z: u.z, r: s.radius });
  },
  leap(m, u, s, inp) {
    // to: 'foe' | 'ally': fly to the unit under the cursor (pickUnit); nobody there, the skill does not happen.
    let [tx, tz] = aimPoint(u, inp, s.cast);
    if (s.to) {
      const o = pickUnit(m, u, inp, s, (o) => (s.to === 'foe' ? o.team !== u.team && !(s.tthHold && o.tthHT > 0) : o.team === u.team));
      if (!o) return false;
      tx = o.x; tz = o.z;
      if (s.tthHold) tthPick(m, u, s, o, inp);   // kit-remake G5 Tào Tháo
    }
    // invuln: untargetable (no damage, no crowd control) from the press until it lands, wind-up included
    if (s.invuln) { const T = (s.windup || 0) + s.flight + 0.1; u.invulnT = Math.max(u.invulnT, T); u.ccT = Math.max(u.ccT, T); }
    // windup: stand charging that long (aim locked), then jump to the point chosen at the press (FINISH.leap)
    if (s.windup) {
      u.cast = { skill: s, t: s.windup, total: s.windup, move: s.move ?? 0, lock: true, aim: u.aim, tx, tz };
      // the press event (pushed just before this) carries the landing point, so every end can mark it during the wind-up
      const ev = m.events[m.events.length - 1];
      if (ev && ev.t === 'skill' && ev.id === u.id) { ev.tx = tx; ev.tz = tz; }
      return;
    }
    jump(m, u, s, tx, tz);
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
    if (s.to) { const p = ownObject(m, u, s, true); if (!p) return false; tx = p.x; tz = p.z; }
    // behind: an enemy near the cursor (within pick) and in reach: come out 1.6 m behind its back
    // behind.next: the enemy the first stage of this two-stage skill hit, if alive and in reach (nobody: the press does nothing);
    // behind.far: come out on the far side of it from here (facing it), not behind its own back
    if (s.behind) {
      let o;
      if (s.behind.next) {
        o = u.next && u.next.target >= 0 ? m.units[u.next.target] : null;
        if (!o || !o.alive || dist2(o.x, o.z, u.x, u.z) > (s.dist + 1) ** 2) return false;
      } else o = pickUnit(m, u, inp, { pick: s.behind.pick, cast: s.dist + s.behind.pick }, (o) => o.team !== u.team);
      if (o && s.behind.far) {
        const dx = o.x - u.x, dz = o.z - u.z, d = Math.hypot(dx, dz) || 1, back = o.radius + u.radius + 0.4;
        tx = o.x + dx / d * back; tz = o.z + dz / d * back;
        u.aim = u.heading = Math.atan2(-dz, -dx);
      } else if (o) { tx = o.x - Math.cos(o.heading) * 1.6; tz = o.z - Math.sin(o.heading) * 1.6; }
    }
    const [x, z] = landing(m, u, tx, tz), x0 = u.x, z0 = u.z;
    // leave: a still copy stays where the mech stood and goes off when it is shot down or its time is up
    if (s.leave) addZone(m, u, { kind: 'decoy', x: x0, z: z0, r: u.radius, hp: s.leave.hp, maxHp: s.leave.hp, dur: s.leave.dur, aim: u.aim, speed: 0, blast: s.leave.blast, dmg: s.leave.dmg, fx: s.leave.fx || null, seek: null });
    // glide (m/s): fly there over everything in a short dash instead of appearing there at once
    if (s.glide) {
      const d = Math.hypot(x - x0, z - z0) || 0.01;
      u.dash = { dx: (x - x0) / d, dz: (z - z0) / d, left: d, speed: s.glide, s: { dmg: 0 }, hit: [], fly: true };
    } else { u.x = u.px = x; u.z = u.pz = z; u.vx = u.vz = 0; }
    m.events.push({ t: 'warp', id: u.id, x0, z0, x, z, ...(s.look ? { skill: s.id } : {}) });
    if (s.land) { m.events.push({ t: 'nova', id: u.id, x, z, r: s.land.radius, ...(s.look ? { skill: s.id } : {}) }); curSrc = s.id; areaDamage(m, u, x, z, s.land.radius, s.land.dmg, s.land, null); curSrc = null; }
  },
  // orbit: n orbs circle the caster. 'seek': each `rate` seconds the next orb flies off at the nearest enemy in range and is spent;
  // 'guard': the orbs shoot down enemy shots and the ring cuts enemies close to the caster.
  orbit(m, u, s, inp) {
    if (s.mode === 'devour') return k4Devour(m, u, s, inp);   // kit-remake K4: tumay's ult
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
  wall(m, u, s, inp) {
    if (s.at || s.burst) return sirWall(m, u, s, inp);   // kit-remake G5 Thủy Tinh: at the cursor, a burst as it forms
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
    if (s.mgtSeq) return mgtSeq(m, u, s, inp);   // kit-remake G5 Magneto
    // channel: one cast like a sweep: a strike every channel.every seconds around wherever the cursor is, the mech still walks (channel.move)
    if (s.channel) { u.cast = { skill: s, t: s.channel.dur, total: s.channel.dur, move: s.channel.move, lock: false, aim: u.aim, acc: 0 }; return; }
    const [cx, cz] = aimPoint(u, inp, s.cast);
    const ux = Math.cos(u.aim), uz = Math.sin(u.aim);
    // seek: the first strikes land on the enemies standing within seek.radius of the cursor (marked ones first when prefer is 'meterMark', then by id); the rest scatter
    const hunt = s.lock ? k2Lock(m, u, s) : s.seek ? seekTargets(m, u, s.seek, cx, cz) : [];
    if (s.lock && !hunt.length) return false;   // kit-remake G5 Athena: lock needs an enemy in reach
    for (let i = 0; i < s.n; i++) {
      const delay = s.delay + (i / s.n) * s.span;
      if (i < hunt.length) { addZone(m, u, { kind: 'strike', x: hunt[i].x, z: hunt[i].z, r: s.blast, delay, total: delay, dmg: s.dmg * u.skillAmp, fx: strikeFx(s), src: s.id, ...(s.lock ? { on: hunt[i].id } : {}) }); continue; }
      // line: strikes march from the aim point along the aim direction; otherwise they scatter in a disc.
      const a = s.line ? 0 : m.rng() * 6.283, d = s.line ? 0 : (i ? Math.sqrt(m.rng()) * (s.radius - s.blast * 0.5) : 0);
      const lx = s.line ? ux * s.gap * (i - (s.n - 1) / 2) : 0, lz = s.line ? uz * s.gap * (i - (s.n - 1) / 2) : 0;
      addZone(m, u, { kind: 'strike', x: cx + lx + Math.cos(a) * d, z: cz + lz + Math.sin(a) * d, r: s.blast, delay, total: delay, dmg: s.dmg * u.skillAmp, fx: strikeFx(s), src: s.id, ...(s.linger ? { linger: s.linger, vis: s.linger.vis } : {}) });
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
    if (s.grow || s.ownerHps || s.marks || s.eye) k7Zone(m.zones[m.zones.length - 1], s);   // kit-remake G5 lane K7: Thủy Tinh's vortex, Ưng Nhãn's eye
    if (s.tthHeal) m.zones[m.zones.length - 1].tthHeal = s.tthHeal;   // kit-remake G5 Tào Tháo
    mgtZone(s, m.zones[m.zones.length - 1]);   // kit-remake G5 Magneto
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
  addZone(m, u, { kind: 'strike', x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d, r: s.blast, delay: s.delay, total: s.delay, dmg: s.dmg, fx: strikeFx(s), src: s.id });   // src: kit-remake G5 Băng Nha (vsTag, towerMul)
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
  if (F.left <= 0 && s.bgLast) bgLast(u, s);   // kit-remake G5 Black Panther: the last cut
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
  tfEnd(u);
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
// leap: fly from here to (tx, tz), or the nearest free ground there, over flight seconds; the landing (stepDash) hits as s says.
function jump(m, u, s, tx, tz) {
  const [x, z] = landing(m, u, tx, tz);
  const d = Math.hypot(x - u.x, z - u.z) || 0.01;
  u.dash = { dx: (x - u.x) / d, dz: (z - u.z) / d, left: d, speed: Math.max(4, d / s.flight), s: { dmg: 0 }, hit: [], fly: true, land: s };
  m.events.push({ t: 'leap', id: u.id, x0: u.x, z0: u.z, x, z, dur: s.flight });
}

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
    if (side < s.width / 2 + o.radius) {
      damage(m, o, dmg, u);
      if (o.alive && s.fx) applyFx(m, u, o, s.fx, { core: side / (s.width / 2 + o.radius) });
      // knock: thrown along the beam
      if (o.alive && s.knock && !o.def.heavy) { o.kx += dx * s.knock * 3; o.kz += dz * s.knock * 3; }
    }
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
  m.events.push({ t: 'beam', id: u.id, x0: u.x, z0: u.z, x1, z1, w: s.width, ...(s.look ? { skill: s.id } : {}) });
}

// What a wind-up skill does when the wind-up completes.
const FINISH = {
  stance(m, u) { u.stance = !u.stance; u.vx = u.vz = 0; m.events.push({ t: 'stance', id: u.id, on: u.stance ? 1 : 0, x: u.x, z: u.z }); },
  sweep() {},
  // nova extensions: arc (half-angle of a sector in front of the turret instead of the full ring), grow (each repeat hits
  // grow times harder than the one before), last.maxHp (the final repeat adds that share of each victim's max hp, armour ignored).
  nova(m, u, s, c) {
    const k = (s.repeat || 1) - (c.left || 1), arc = s.arc ? { a: u.aim, half: s.arc } : null;
    m.events.push({ t: 'nova', id: u.id, x: u.x, z: u.z, r: s.radius, ...(s.look ? { skill: s.id, k, a: u.aim } : {}) });
    curSrc = s.id;
    // healLost (each enemy the blow lands on heals the caster that share of its lost hp) is read in rowHit, like on every skill row
    areaDamage(m, u, u.x, u.z, s.radius, s.dmg * (c.mul || 1) * (s.grow ? s.grow ** k : 1) * (s.bnSplit ? k10Split(m, u, s, arc) : 1), s, null, arc);   // K10 bnSplit
    if (s.orbKnock) k4Knock(m, u, s);   // kit-remake K4: tumay's Q knocks its own orbs
    if (s.last && (c.left || 1) <= 1) {
      for (const o of m.units) {
        if (o.team === u.team || !o.alive || o.def.boss) continue;
        const d2 = dist2(o.x, o.z, u.x, u.z), reach = s.radius + o.radius * 0.6;
        if (d2 <= reach * reach && inArc(o, u.x, u.z, Math.sqrt(d2), arc)) damage(m, o, o.maxHp * s.last.maxHp, u, true);
      }
    }
    curSrc = null;
    if (c.left > 1 && u.alive) u.cast = { ...c, t: s.gap, total: s.gap, left: c.left - 1 };
  },
  // charge: the beam grows with the time held, from [0] at no charge to [1] when full (dmg, range, width)
  beam(m, u, s, c) {
    if (s.fan) return k7Fan(m, u, s, c);   // kit-remake G5 Saitama: a charged fan instead of a line
    let row = s;
    if (s.charge) {
      const C = s.charge, f = Math.min(1, Math.max(0, (c.total - Math.max(0, c.t)) / c.total)), L = (p) => p[0] + (p[1] - p[0]) * f;
      row = { ...s, dmg: L(C.dmg), range: L(C.range), width: L(C.width) };
    }
    curSrc = s.id; fireBeam(m, u, row, c.aim); curSrc = null;
  },
  barrage() {},
  leap(m, u, s, c) { jump(m, u, s, c.tx ?? u.x, c.tz ?? u.z); },
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
    if (s.stop) { if (s.bgRe) bgQueue(u, s, o); d.left = 0; break; }   // dash.stop: the dash ends on the first mech it hits (kit-remake G5 Black Panther: bgRe)
  }
  if (s.drag && d.hit.length) dragHit(m, u, d);
  if (d.left <= 0.01 || moved < stepLen * 0.4) {
    u.dash = null; u.vx = d.dx * 2; u.vz = d.dz * 2;
    if (u.flurry) flurryNext(m, u);
    if (d.land) { [u.x, u.z] = landing(m, u, u.x, u.z); m.events.push({ t: 'nova', id: u.id, x: u.x, z: u.z, r: d.land.radius, ...(d.land.look ? { skill: d.land.id } : {}) }); curSrc = d.land.id || null; areaDamage(m, u, u.x, u.z, d.land.radius, d.land.dmg, d.land, null); curSrc = null; landShield(m, u, d.land); }
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
    curShot = s;
    if (s.back) {
      // volley.ret on the way home: flies straight at its owner over everything and vanishes on touching it.
      if (!owner || !owner.alive) { m.shots.splice(i, 1); continue; }
      const bx = owner.x - s.x, bz = owner.z - s.z, bd = Math.hypot(bx, bz);
      if (bd < owner.radius + s.r + 0.1) { m.shots.splice(i, 1); continue; }
      s.dx = bx / bd; s.dz = bz / bd; s.left = Math.max(s.left, 1);
    }
    if (s.k4Home !== undefined) k4Steer(m, s);   // kit-remake K4: homing shots
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
      } else if ((z.kind === 'turret' || z.kind === 'decoy' || z.kind === 'totem') && z.team !== s.team) {
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
      if (u.team === s.team || !u.alive || volFull(s, u)) continue;
      const t = segCircle(s.x, s.z, ex, ez, u.x, u.z, u.radius + s.r);
      if (u.bubT > 0) { const tb = segCircle(s.x, s.z, ex, ez, u.x, u.z, u.radius + s.r + 0.5); if (tb < best && tb <= 1) { best = tb; what = 'dome'; hitUnit = null; hitProp = null; hitTower = null; hitZone = null; } continue; }
      if (s.pierce) {
        // A piercing shot hurts every mech it crosses, once each, and flies on.
        if (t > Math.min(best, 1) || s.hit.includes(u.id)) continue;
        s.hit.push(u.id);
        damage(m, u, shotDamage(s, len * t) * volHit(s, u), owner);
        if (s.adFall) s.dmg *= 1 - s.adFall;   // kit-remake G5 An Dương Vương: pierce falloff
        if (s.cdr) cutCooldowns(owner, s);
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
      k1Back(owner, s);
      m.events.push({ t: 'impact', vis: s.vis, on: what, x: s.x, z: s.z, dx: s.dx, dz: s.dz, splash: 0 });
      continue;
    }
    const dmg = shotDamage(s, 0);
    if (what === 'tower') hurtTower(m, hitTower, dmg, owner);
    else if (what === 'unit') {
      damage(m, hitUnit, dmg * volHit(s, hitUnit), owner);
      if (s.cdr) cutCooldowns(owner, s);
      if (s.knock && hitUnit.alive) { hitUnit.kx += s.dx * s.knock * 3; hitUnit.kz += s.dz * s.knock * 3; }
      if (s.slow && hitUnit.alive) { hitUnit.slowT = Math.max(hitUnit.slowT, s.slowDur); hitUnit.slowF = Math.max(hitUnit.slowF, s.slow); }
      if (s.fx && owner && hitUnit.alive) applyFx(m, owner, hitUnit, s.fx);
      if (s.hook && !s.hook.self && hitUnit.alive && owner && owner.alive) reel(m, owner, hitUnit, s.hook);
      if (owner) k4ShotHit(m, s, hitUnit, owner);   // kit-remake K4: orb shots, enbac's nth hit
    } else if (what === 'prop') damageProp(m, hitProp, dmg, owner);
    else if (hitZone) hitZone.hp -= dmg;
    // splashHit (weapon row): the burst goes off only round a mech it hit, not at the end of its range or on a wall
    if (s.splash && what !== 'dome' && owner && (!s.splashHit || what === 'unit')) areaDamage(m, owner, s.x, s.z, s.splash, dmg * 0.6, s.fx ? { fx: s.fx } : null, hitUnit);
    if (what === 'unit' && owner && s.src === 'w') krSplashHeal(m, owner, s);   // kit-remake G5 Kurumi: the burst heals allies
    if (s.hook && s.hook.self && owner && owner.alive && (what === 'wall' || what === 'unit' || what === 'prop' || what === 'tower')) reelSelf(m, owner, s.x, s.z, hitUnit || hitProp || hitTower, s.hook);
    m.events.push({ t: 'impact', vis: s.vis, on: what, x: s.x, z: s.z, dx: s.dx, dz: s.dz, splash: s.splash });
    m.shots.splice(i, 1);
  }
  curSrc = null;
  curShot = null;
}

// meter spend.cdr: the armed shot hit a mech: every skill cooldown of its owner drops by cdr seconds, once per shot.
function cutCooldowns(u, s) {
  if (u && u.alive) for (const k of ['s1', 's2', 'ult']) u.cd[k] = Math.max(0, u.cd[k] - s.cdr);
  s.cdr = 0;
}

// extra: metres this tick's hit lies beyond s.flown.
const shotDamage = (s, extra) => s.dmg * (s.far && s.flown + extra > s.far.after ? s.far.mul : 1) * (s.far && s.far.ramp ? farRamp(s.far.ramp, s.flown + extra) : 1);

// The hook caught `o`: it is dragged to just in front of the hooker and cannot act on the way.
function reel(m, u, o, s) {
  m.events.push({ t: 'hook', id: u.id, target: o.id, x: o.x, z: o.z });
  // a mech in mid-leap is above the hook line (and maybe above a wall): it is hurt, not reeled
  if (o.def.heavy || o.stance || (o.dash && o.dash.fly)) return;
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
    if (z.kind === 'totem') done = totemStep(m, z, owner);
    else if (z.kind === 'strike') {
      if (z.on >= 0) k2Follow(m, z);   // kit-remake G5 Athena: a locked strike rides its target
      z.delay -= dt;
      if (z.delay <= 0 && z.mgtGrp) { mgtStrike(m, owner, z); done = true; }   // kit-remake G5 Magneto
      else if (z.delay <= 0) {
        curSrc = z.src || null; explode(m, owner, z.x, z.z, z.r, z.dmg, z.fx || null, 'strike', z.vis); if (z.src) bnRing(m, owner, z); curSrc = null; done = true;   // kit-remake G5 Băng Nha: bnRing
        // linger {radius, dur, dps, slow, vis}: what fell stays as a field that keeps cutting and slowing enemies around it
        const L = z.linger;
        if (L) addZone(m, owner, { kind: 'field', vis: L.vis, x: z.x, z: z.z, r: L.radius, dur: L.dur, hps: 0, dps: L.dps || 0, slow: L.slow || 0, hide: false, pull: 0, acc: 0,
          haste: 0, blind: null, follow: false, armor: 0, cage: false, held: 0, drain: 0, shield: 0, sh: {} });
        k4Strike(m, z, owner);   // kit-remake K4: a strike that leaves a chaos orb
      }
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
      if (z.k7) k7ZoneTick(m, z, owner, pulse);   // kit-remake G5 lane K7: growing slow, owner heal (Thủy Tinh), the eye (Ưng Nhãn)
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
            curSrc = z.src || null; damage(m, u, z.dps * 0.5, owner); curSrc = null;   // z.src: kit-remake G5 Thủy Tinh (zone marks)
            if (z.tthHeal && owner.alive) heal(m, owner, owner.maxHp * z.tthHeal, owner);   // kit-remake G5 Tào Tháo
            // drain: the owner gets back that share of what the field took
            if (z.drain && owner.alive) heal(m, owner, Math.min(z.dps * 0.5, had - (u.alive ? u.hp + u.shield : 0)) * z.drain, owner, true);
          }
        }
      }
      if (z.mgtStorm) mgtStorm(m, z, owner);   // kit-remake G5 Magneto
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
    } else if (z.kind === 'orbit' && z.mode === 'chaosG') { done = k4Ground(m, z, owner);   // kit-remake K4: a ground chaos orb
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

// vis: a strike whose zone names a look (looks.js) says so, so the renderer can draw that look's landing instead of a fireball
function explode(m, src, x, z, r, dmg, fx, why, vis) {
  m.events.push({ t: 'explode', x, z, r, why, ...(vis ? { vis } : {}) });
  areaDamage(m, src, x, z, r, dmg, fx, null);
}

// Damage with falloff (100% at the centre, 50% at the rim) to enemies of src and to props. fx may carry slow, slowDur, stun, knock.
// arc {a, half}: only the sector within half radians of direction a (a mech overlapping the centre always counts).
function inArc(u, x, z, d, arc) {
  if (!arc || d < u.radius + 0.3) return true;
  const da = Math.atan2(u.z - z, u.x - x) - arc.a;
  return Math.abs(Math.atan2(Math.sin(da), Math.cos(da))) <= arc.half + Math.atan2(u.radius, d);
}
function areaDamage(m, src, x, z, r, dmg, fx, skip, arc) {
  const scale = dmgScale(src);
  let n = 0;
  for (const u of m.units) {
    if (u.team === src.team || !u.alive || u === skip) continue;
    const reach = r + u.radius * 0.6, d2 = dist2(u.x, u.z, x, z);
    if (d2 > reach * reach) continue;
    const d = Math.sqrt(d2);
    if (!inArc(u, x, z, d, arc)) continue;
    damage(m, u, dmg * scale * (1 - 0.5 * Math.min(1, d / r)), src);
    n++;
    if (!u.alive || !fx) continue;
    if (fx.fx) applyFx(m, src, u, fx.fx, { cx: x, cz: z });
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
  return n;
}

// hitfx: the `fx` key any damaging row may carry. { chance, pick: [fx, ...] } rolls m.rng() (once for the chance, once for the pick);
// otherwise every field present applies: slow/slowDur, weaken {mul, dur} (its hits do less), root (seconds it cannot walk),
// stun, amp {amp, dur} (it takes more from everyone), reveal (seconds it cannot hide), execute (fraction of max hp: below it, it dies).
export function applyFx(m, src, o, fx, ctx) {
  if (!o.alive || !fx) return;
  if (fx.chance !== undefined && m.rng() >= fx.chance) return;
  if (fx.pick) fx = fx.pick[Math.floor(m.rng() * fx.pick.length)];
  // kit-remake G2: slowDecay / slowGrow / slowStack go to slowG instead of the plain slow; tag, slowFire, enSteal
  if (!g2Fx(src, o, fx) && fx.slow) { o.slowT = Math.max(o.slowT, fx.slowDur); o.slowF = Math.max(o.slowF, fx.slow); }
  if (fx.weaken) { o.weakenF = o.weakenT > 0 ? Math.min(o.weakenF, fx.weaken.mul) : fx.weaken.mul; o.weakenT = Math.max(o.weakenT, fx.weaken.dur); }
  if (fx.root) o.rootT = Math.max(o.rootT, fx.root);
  if (fx.stun) {
    // stun { dur, core }: only a mech inside the middle `core` fraction of a beam (ctx.core = how far off the axis it was) is stunned
    const st = typeof fx.stun === 'number' ? fx.stun : !ctx || ctx.core === undefined || ctx.core <= fx.stun.core ? fx.stun.dur : 0;
    o.stunT = Math.max(o.stunT, st);
  }
  if (fx.chain) chainHit(m, src, o, fx.chain, lastBase);
  if (fx.bcPop) { k10Pop(m, src, o, fx.bcPop); if (!o.alive) return; }   // kit lane K10: Bọ Cạp sets off her poison
  if (fx.burn) { o.burnT = fx.burn.dur; o.burnN = Math.min(fx.burn.max, o.burnN + 1); o.burnDps = fx.burn.dps; o.burnBy = src.id; }
  if (fx.amp) applyAmp(o, fx.amp.amp, fx.amp.dur);
  if (fx.reveal) { o.revealT = Math.max(o.revealT, fx.reveal); o.stealthT = 0; }
  if (fx.silence) o.silenceT = Math.max(o.silenceT, fx.silence);
  if (fx.ddEye) k13Eye(src, o, fx.ddEye);   // kit lane K13: Đom Đóm's wind eye
  applyLoc(m, src, o, fx);
  if (fx.sntCurse) sntCurse(m, src, o, fx.sntCurse);   // kit-remake G5 Sơn Tinh
  // air (s): knocked up: a stun that also lifts the mech (airT, drawn as a hop); heavy mechs and cc immunity shrug it off like a stun
  if (fx.air && !o.def.heavy) { o.stunT = Math.max(o.stunT, fx.air); o.airT = Math.max(o.airT || 0, fx.air); }
  // maxHp: an extra blow worth that share of the victim's max hp (armour applies; bosses are spared); it carries no source tag so it never feeds stacks
  if (fx.maxHp && !o.def.boss) { const keep = curSrc; curSrc = null; damage(m, o, o.maxHp * fx.maxHp, src); curSrc = keep; if (!o.alive) return; }
  // lostHp / curHp: an extra blow of that share of the victim's lost / current hp (after the hit it rides; bosses spared); trueDmg: flat.
  // All are true damage (no armour, no guard), credited to src, with no source tag.
  if (fx.lostHp || fx.curHp || fx.trueDmg) {
    const amt = (o.def.boss ? 0 : (fx.lostHp || 0) * (o.maxHp - o.hp) + (fx.curHp || 0) * o.hp) + (fx.trueDmg || 0);
    if (amt > 0) { const keep = curSrc; curSrc = null; trueHit = true; damage(m, o, amt, src); curSrc = keep; if (!o.alive) return; }
  }
  // antiheal {mul, dur}: heals it receives are x mul (the strongest cut that still runs wins)
  if (fx.antiheal) { o.ahF = o.ahT > 0 ? Math.min(o.ahF, fx.antiheal.mul) : fx.antiheal.mul; o.ahT = Math.max(o.ahT, fx.antiheal.dur); }
  if (fx.yank || fx.slam || (fx.antiheal && fx.antiheal.shield)) g4Fx(m, src, o, fx, ctx);
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
let reflecting = false, trueHit = false;
function damage(m, u, amount, src, raw) {
  const isTrue = trueHit;
  trueHit = false;
  lastBase = 0;
  if (!u.alive || u.invulnT > 0 || amount <= 0) return;
  if (u.tthHO && u.tthHT > 0 && !raw && src && src !== u) amount = tthRedirect(m, u, amount);   // kit-remake G5 Tào Tháo
  lastBase = amount;
  const foe = src && src !== u && !raw ? src : null;
  if (foe && u.blockN > 0 && amount >= 10) { blockHit(m, u); lastBase = 0; return; }
  if (foe && u.parryT > 0 && amount >= 10) { amount = parryHit(m, u, foe, amount); lastBase = amount; if (amount <= 0) return; }
  if (foe) {
    if (u.markT > 0) amount *= 1 + u.markAmp;
    if (u.ampT > 0) amount *= 1 + u.ampF;
    if (foe.weakenT > 0) amount *= foe.weakenF;
    if (foe.passive === 'brittle') { const P = foe.def.passive; if (P.when === 'low' ? u.hp < u.maxHp * P.below : P.when === 'burn' ? u.burnT > 0 : P.when === 'marked' ? u.markT > 0 || u.ampT > 0 : u.slowT > 0) amount *= P.mul; }
    if (foe.passive === 'ambush' && foe.ambushT > 0 && !hidden(foe)) { amount *= foe.def.passive.mul; foe.ambushT = 0; }
    amount *= lowHpScaleMul(foe);
    amount *= k7AimMul(foe, u);   // kit-remake G5 Ưng Nhãn: Aim vs a shielded mech
    if (u.inT > 0 && curSrc === 'w') amount *= 1 - k1Wdr(u);
  }
  // kit-remake G2: the hit's kind (weapon / skill) and a vsTag payoff the row reads off this victim's tag
  const kind = hitKind(), vt = foe && curSrc && !reflecting ? vsTagOf(foe, u) : null;
  if (vt && vt.mul) amount *= vt.mul;
  const preArmor = amount;
  // trueHit (hitfx lostHp, curHp, trueDmg): neither armour nor guard cuts it
  if (!raw && !isTrue && !(foe && foe.passive === 'pierce')) amount *= 1 - armorOf(m, u) * (1 - Math.min(1, penOf(foe) + k7Pen(foe) + k10Pen(foe)));   // K7: Serious Mode, K10: Kirito's stacks
  // guard (skill row or stacks self): a cut on top of armour, outside its cap
  if (u.guardT > 0 && !isTrue) amount *= 1 - u.guardF;
  // kit-remake G2 guard vs: a cut of one kind of enemy damage only
  if (u.gvT > 0 && !isTrue && foe && u.gvK === kind) amount *= 1 - u.gvF;
  if (!raw) amount = hitCapped(u, amount);
  const blocked = preArmor - amount;
  let left = amount, absorbed = 0, broke = false;
  if (u.shield > 0) {
    absorbed = Math.min(u.shield, left); u.shield -= absorbed; left -= absorbed;
    if (u.shield <= 0) { u.shieldT = 0; broke = true; m.events.push({ t: 'shieldBreak', id: u.id, x: u.x, z: u.z }); }
    if (u.shBy >= 0) k2Absorb(m, u, absorbed);   // kit-remake G5 Athena: energy back to the shield's caster
  }
  u.hp -= left; u.combatT = 0;
  if (u.locT > 0 && u.locK === LOC_SLEEP && left + absorbed > 0) u.locT = 0;
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
  // next.onHit: the first enemy the first stage lands on arms the second stage and becomes its target
  if (foe && foe.next && !foe.next.armed && curSrc === foe.next.src) {
    const N = foe.def.skills[foe.next.slot].next;
    foe.next.armed = true; foe.next.t = N.window; foe.next.target = u.id;
  }
  // a skill row's own on-hit fields (steal, healLost, healMax, self on hit, cdCut)
  if (foe && foe.alive && left + absorbed > 0 && !reflecting && curSrc && curSrc !== 'w') rowHit(m, foe, left);
  if (foe && left + absorbed > 0) k1Hurt(m, u, foe);
  if (foe && left + absorbed > 0) k10Hit(foe);   // kit lane K10: a sword wave adds a Kirito penetration stack
  if (foe && left + absorbed > 0) tthHurt(m, u, left + absorbed);   // kit-remake G5 Tào Tháo
  if (foe && left + absorbed > 0) mgtHurt(foe);   // kit-remake G5 Magneto
  if (foe && foe.alive && left + absorbed > 0) k13Hit(m, foe, u);   // kit lane K13: passives that ride every hit
  if (foe && foe.alive && left > 0) {
    const low = lowHpMod(foe), steal = Math.max(foe.passive === 'lifesteal' ? foe.def.passive.frac * (low && low.steal ? low.steal : 1) : 0, foe.rageT > 0 ? foe.rageF : 0, curShot && curShot.owner === foe.id ? curShot.steal : 0, k7Steal(foe));
    if (steal) heal(m, foe, left * steal, foe, true);
    if (u.armorT > 0 && u.reflectF > 0 && !reflecting) { reflecting = true; damage(m, foe, amount * u.reflectF, u); reflecting = false; }
  }
  if (foe && foe.alive && foe.passive === 'souls' && u.hp > 0) applyAmp(u, foe.def.passive.mark.amp, foe.def.passive.mark.dur);
  if (foe && foe.alive && foe.passive === 'meter' && left + absorbed > 0 && !chaining) meterHit(m, foe, u);
  if (foe && foe.alive && foe.passive === 'stacks' && left + absorbed > 0 && !chaining && u.hp > 0) stackHit(m, foe, u);
  if (u.hp <= 0) g2Fatal(m, u);   // kit-remake G2: undying, or a fatal save, keeps it at 1 hp
  if (foe && left + absorbed > 0 && !chaining && !reflecting) g3Hit(m, foe, u, left + absorbed);
  if (foe && left + absorbed > 0 && !chaining && !reflecting && curSrc) k7Hit(m, foe, u);   // kit-remake G5 Ưng Nhãn: Aim count, falcon bursts
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
  // kit-remake G2: after the hit is fully done (it may hurt again): energy, vsTag payoff, onHurt, a below-hp save
  if (left + absorbed > 0) g2After(m, u, foe, left, kind, vt);
}

// stacks (passive): a hit with a source tag adds a mark to the mech it lands on ('skill': only skill hits count, 'any': weapon and skill hits;
// ticks of fields and burns carry no tag and never count). Marks belong to one attacker; the n-th one goes off as P.fx and is cleared.
function stackHit(m, foe, u) {
  const P = foe.def.passive;
  if (!curSrc || (P.on === 'skill' && curSrc === 'w')) return;
  if (!P.n || (P.icd && (u.stkLock[foe.id] || 0) > m.time + 1e-9)) return;
  if (u.stkN > 0 && u.stkT > 0 && u.stkBy === foe.id) u.stkN++; else u.stkN = 1;
  u.stkBy = foe.id; u.stkT = P.dur;
  if (P.per) stackPer(foe, u, P);
  if (P.fireSlow) sirFire(u, P);   // kit-remake G5 Thủy Tinh: each mark slows its fire
  if (u.stkN < P.n) return;
  u.stkN = 0; u.stkT = 0;
  if (P.icd) u.stkLock[foe.id] = m.time + P.icd;
  m.events.push({ t: 'stacks', id: u.id, by: foe.id, x: u.x, z: u.z });
  // self.guard: the mark going off also covers its owner: guard less of every blow and no crowd control for self.dur seconds
  if (P.self && P.self.guard) { foe.guardT = Math.max(foe.guardT, P.self.dur); foe.guardF = P.self.guard; foe.ccT = Math.max(foe.ccT, P.self.dur); }
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
  // hitfx antiheal: what this mech is healed by anyone (itself too) is cut
  if (u.ahT > 0) amount *= u.ahF;
  amount *= healInMul(u);
  amount *= k1HealMul(u);
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
  src = tthCredit(m, u, src);   // kit-remake G5 Tào Tháo: a held foe's death is its holder's
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
  if (m.mode === 'pve') { if (u.team === 1) u.respawnT = 1e9; else m.lives--; }
  m.events.push({ t: 'death', id: u.id, by, assists, x: u.x, z: u.z });
  clearStatus(u);
}

// A kill or an assist feeds the passives that live on them.
// kill: true for the killing blow, false for an assist. victim: the mech that just died (its x, z are where it fell).
function takedown(m, o, kill, victim) {
  if (!o.alive) return;
  if (kill) adKill(m, o);   // kit-remake G5 An Dương Vương
  const P = o.def.passive, K = P && P.mods && P.mods.onKill;
  if (K && (!kill || !K.from || killFrom(o, K.from))) {
    if (kill) onKillMore(m, o, K);
    const hl = kill ? K.heal : K.assist && K.assist.heal;
    if (hl) heal(m, o, o.maxHp * hl, o);
    const r = kill ? K.reset : K.assist && K.assist.reset !== undefined ? { slots: SLOTS, frac: K.assist.reset } : null;
    if (r) for (const slot of r.slots) o.cd[slot] *= 1 - r.frac;
    if (kill && K.haste) { o.hasteF = Math.max(o.hasteT > 0 ? o.hasteF : 1, K.haste); o.hasteT = Math.max(o.hasteT, K.dur || 3); }
  }
  if (kill && o.def.passive && o.def.passive.do === 'chaos') k4Kill(m, o);   // kit-remake K4: tumay's orbs per kill
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
  return { rows, mvp, mode: m.mode, score: m.score.slice(), winner: m.winner, time: m.time, lives: m.lives, stage: m.stage, wave: m.wave, waves: m.waves };
}

const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);

function turnTo(a, b, max) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + Math.max(-max, Math.min(max, d));
}

/* ===== kit-remake G4 (~/handoff/dtt-ref/kits/MECHANICS.md "Group 4"): far.ramp, yank, slam, chain.seq, shield variants
   (selfShield frac/hits/burst, passive reShield, antiheal on shields), weapon mag, lowHpScale, dash.windup, heal received
   (healIn), hitCap, own objects (warp.to, totem). Hooks elsewhere are one line each and call into this block. ===== */
let dashGo = false;
const g4Mods = (u) => (u.def.passive && u.def.passive.mods) || null;
function g4Clear(u) {
  u.magN = 0; u.magT = 0; u.blockN = 0; u.blockT = 0; u.rsT = 0; u.rsUp = false;
  u.slamT = 0; u.slamBy = -1; u.slamDmg = 0; u.slamStun = 0; u.hiT = 0; u.hiF = 1; u.ahSh = 1; u.shPrev = 0; u.yankX = 0; u.yankZ = 0;
}
// Once a tick, after the shared timers: magazine reload, hit-block and slam windows, heal-in buff, the recurring passive shield,
// and the antiheal cut on shields gained since last tick (measured once a tick, so a shield lost and regained inside one tick is not cut).
function g4Tick(m, u) {
  const dt = TICK;
  if (u.magT > 0) u.magT = Math.max(0, u.magT - dt);
  if (u.blockT > 0) { u.blockT = Math.max(0, u.blockT - dt); if (u.blockT <= 0) u.blockN = 0; }
  if (u.slamT > 0) u.slamT = Math.max(0, u.slamT - dt);
  if (u.hiT > 0) u.hiT = Math.max(0, u.hiT - dt);
  // passive mods.reShield {frac, regrow, burst}: a shield of frac x max hp that holds until broken, then grows back regrow s later
  const RS = g4Mods(u) && g4Mods(u).reShield;
  if (RS) {
    if (u.rsUp) { if (u.shield <= 0) { u.rsUp = false; u.rsT = RS.regrow; } else u.shieldT = Math.max(u.shieldT, 0.5); }
    else if (u.rsT > 0) u.rsT = Math.max(0, u.rsT - dt);
    else {
      const live = u.shieldT > 0 ? u.shieldMax : 0;
      u.shield = Math.max(u.shield, RS.frac * u.maxHp); u.shieldMax = Math.max(live, u.shield); u.shieldT = Math.max(u.shieldT, 0.5);
      if (RS.burst) u.shieldBurst = RS.burst;
      u.rsUp = true;
      m.events.push({ t: 'reShield', id: u.id, x: u.x, z: u.z });
    }
  }
  if (!(u.ahT > 0)) u.ahSh = 1;
  if (u.ahSh < 1 && u.shield > u.shPrev) u.shield = u.shPrev + (u.shield - u.shPrev) * u.ahSh;
  u.shPrev = u.shield;
}
// Every successful press (a second stage too), after its cast: row selfShield {frac, amount, dur, hits, burst} and healIn {mul, dur}.
function g4Cast(m, u, s) {
  const S = s.selfShield;
  if (S) {
    const amt = (S.frac || 0) * u.maxHp + (S.amount || 0), d = S.dur ?? 3;
    if (amt > 0) {
      const live = u.shieldT > 0 ? u.shieldMax : 0;
      u.shield = Math.max(u.shield, amt); u.shieldMax = Math.max(live, u.shield); u.shieldT = Math.max(u.shieldT, d);
      if (S.burst) u.shieldBurst = S.burst;
    }
    if (S.hits) { u.blockN = Math.max(u.blockN, S.hits); u.blockT = Math.max(u.blockT, d); }
  }
  if (s.healIn) { u.hiF = Math.max(u.hiT > 0 ? u.hiF : 1, s.healIn.mul); u.hiT = Math.max(u.hiT, s.healIn.dur); }
}
// selfShield.hits: a blow of 10 or more from an enemy is turned away whole and spends one count (ticks under 10 pass).
function blockHit(m, u) {
  u.blockN--;
  if (u.blockN <= 0) { u.blockN = 0; u.blockT = 0; }
  m.events.push({ t: 'block', id: u.id, left: u.blockN, x: u.x, z: u.z });
}
// heal received: the healIn buff, and passive mods.healIn {mul, lost} (x mul, and + lost x the share of max hp missing)
function healInMul(u) {
  let k = u.hiT > 0 ? u.hiF : 1;
  const H = g4Mods(u) && g4Mods(u).healIn;
  if (H) k *= (H.mul || 1) * (1 + (H.lost || 0) * Math.max(0, 1 - u.hp / u.maxHp));
  return k;
}
// hitCap: no single blow takes more than that share of max hp (passive mods.hitCap; a transform row's hitCap while it runs)
function hitCapped(u, amount) {
  const P = g4Mods(u), t = u.tfT > 0 && u.tfSlot >= 0 ? u.def.skills[u.tfSlot] : null;
  const cap = Math.min(P && P.hitCap ? P.hitCap : 1e9, t && t.hitCap ? t.hitCap : 1e9);
  return cap < 1e9 ? Math.min(amount, cap * u.maxHp) : amount;
}
// lowHpScale f: the attacker's damage x (1 + f x its own share of max hp lost); passive mods.lowHpScale (every hit), plus the
// row that is hitting (a skill row through its source tag, the weapon row for 'w')
function lowHpScaleMul(foe) {
  const P = g4Mods(foe), i = curSrc ? srcSlot(foe, curSrc) : -1;
  let f = (P && P.lowHpScale) || 0;
  if (i >= 0) f += slotRow(foe, i, curSrc).lowHpScale || 0;
  else if (curSrc === 'w') f += weaponOf(foe).lowHpScale || 0;
  return f ? 1 + f * Math.max(0, 1 - foe.hp / foe.maxHp) : 1;
}
// weapon mag {n, reload}: after n shots the weapon cannot fire for reload s (magN shots fired, magT reload left)
function magShot(m, u, w) {
  u.magN++;
  if (u.magN < w.mag.n) return;
  u.magN = 0; u.magT = w.mag.reload;
  m.events.push({ t: 'reload', id: u.id, dur: w.mag.reload });
}
// far.ramp {per, max}: a shot hits x (1 + per x metres flown), at most x max
const farRamp = (R, d) => Math.min(R.max ?? Infinity, 1 + (R.per || 0) * d);
// hitfx yank, slam and antiheal.shield
function g4Fx(m, src, o, fx, ctx) {
  if (fx.slam && !o.def.heavy) { o.slamT = fx.slam.win ?? 0.6; o.slamBy = src.id; o.slamDmg = fx.slam.dmg || 0; o.slamStun = fx.slam.stun || 0; o.stmLost = fx.slam.lostHp || 0; }   // stmLost: kit-remake G5 Saitama
  if (fx.antiheal && fx.antiheal.shield) o.ahSh = o.ahSh < 1 ? Math.min(o.ahSh, fx.antiheal.mul) : fx.antiheal.mul;
  if (fx.yank) yank(m, src, o, fx.yank, ctx);
}
// hitfx yank: m | {dist, to: 'centre'|'point'|'caster'}: the victim is pulled at once up to dist m toward the centre of the
// area that hit it (a single-target hit: the caster), the cursor point of the caster's last press, or the caster (stops at touch).
// Walls stop it; heavy, planted, cc-immune, untargetable and flying mechs are not moved.
function yank(m, src, o, Y, ctx) {
  if (!o.alive || o.def.heavy || o.stance || o.ccT > 0 || o.invulnT > 0 || (o.dash && o.dash.fly)) return;
  const to = typeof Y === 'number' ? 'centre' : Y.to || 'centre', dist = typeof Y === 'number' ? Y : Y.dist ?? 1e9;
  let tx, tz, stop = 0;
  if (to === 'point') { tx = src.yankX; tz = src.yankZ; }
  else if (to === 'caster' || !ctx || ctx.cx === undefined) { tx = src.x; tz = src.z; stop = src.radius + o.radius + 0.4; }
  else { tx = ctx.cx; tz = ctx.cz; }
  const dx = tx - o.x, dz = tz - o.z, d = Math.hypot(dx, dz), go = Math.min(dist, d - stop);
  if (go <= 0.05) return;
  const x0 = o.x, z0 = o.z;
  o.dash = null;
  moveUnit(m, o, dx / d * go, dz / d * go);
  o.vx = o.vz = 0;
  m.events.push({ t: 'yank', id: o.id, by: src.id, x0, z0, x: o.x, z: o.z });
}
// hitfx slam {dmg, stun, win}: for win s after the hit, a mech still thrown (knock speed 1.5 m/s or more) that is stopped by a wall
// (it moved less than half of what it was thrown) or runs into another mech of its own team takes dmg (x the attacker's damage
// scale) and a stun; the mech it ran into takes the same. Once per hit.
function slamCheck(m, u) {
  const ks = Math.hypot(u.kx, u.kz);
  if (ks < 1.5) return;
  const want = Math.hypot(u.vx + u.kx, u.vz + u.kz) * TICK, moved = Math.hypot(u.x - u.px, u.z - u.pz);
  let other = null;
  for (const o of m.units) {
    if (o === u || !o.alive || o.team !== u.team) continue;
    const rr = u.radius + o.radius + 0.1, dx = o.x - u.x, dz = o.z - u.z;
    if (dx * dx + dz * dz < rr * rr && dx * u.kx + dz * u.kz > 0) { other = o; break; }
  }
  if (!other && moved >= want * 0.5) return;
  const by = m.units[u.slamBy], dmg = u.slamDmg * dmgScale(by), stun = u.slamStun;
  u.slamT = 0; u.kx = u.kz = 0; u.vx = u.vz = 0;
  m.events.push({ t: 'slam', id: u.id, by: by.id, on: other ? 'unit' : 'wall', other: other ? other.id : -1, x: u.x, z: u.z });
  const keep = curSrc;
  curSrc = null;
  for (const o of other ? [u, other] : [u]) {
    damage(m, o, dmg, by);
    if (o.alive && stun && !(o.ccT > 0) && !o.def.heavy) o.stunT = Math.max(o.stunT, stun);
  }
  if (u.stmLost) k7SlamLost(m, u, by);   // kit-remake G5 Saitama: + a share of the lost hp
  curSrc = keep;
}
// hitfx chain.seq {falloff}: the chain runs one after another, each jump from the last mech hit to the nearest one not yet hit
// within r of it (lower id on a tie), n jumps; the first jump hits base x mul, each next one x falloff.
function chainSeq(m, src, o, C, base) {
  chaining = true;
  const pts = [[o.x, o.z]], done = [o.id];
  let ax = o.x, az = o.z, dmg = base * (C.mul ?? 1);
  for (let k = 0; k < C.n; k++) {
    let best = null, bd = C.r * C.r + 1e-9;
    for (const t of m.units) {
      if (!t.alive || t.team === src.team || done.includes(t.id)) continue;
      const d = dist2(t.x, t.z, ax, az);
      if (d < bd) { bd = d; best = t; }
    }
    if (!best) break;
    done.push(best.id); pts.push([best.x, best.z]); ax = best.x; az = best.z;
    damage(m, best, dmg, src);
    if (best.alive && C.fx) applyFx(m, src, best, C.fx);
    dmg *= C.seq.falloff ?? 1;
  }
  chaining = false;
  if (pts.length > 1) m.events.push({ t: 'chain', id: src.id, pts });
}
// dash.windup s: stand that long (aim locked, move of the speed, default 0), then the dash goes (FINISH.dash)
function dashWindup(u, s) {
  u.cast = { skill: s, t: s.windup, total: s.windup, move: s.move ?? 0, lock: true, aim: u.aim };
}
FINISH.dash = function (m, u, s, c) { dashGo = true; u.aim = c.aim; CAST.dash(m, u, s); dashGo = false; };
// Own objects. warp.to: 'decoy'|'totem'|'field'|... (a zone kind of this mech) or 'shot' (one of its skill projectiles): the warp goes
// to the newest such object (of: only a shot or zone with that source row id) within reach (default dist); none, the press does
// nothing. take: true removes the object (no blast). Exported for the bots (take false).
export function ownObject(m, u, s, take) {
  const shot = s.to === 'shot', reach = s.reach ?? s.dist ?? 1e9;
  let best = null;
  for (const q of shot ? m.shots : m.zones) {
    if (q.owner !== u.id || (shot ? !q.src || q.src === 'w' : q.kind !== s.to) || (s.of && q.src !== s.of)) continue;
    if (!best || q.id > best.id) best = q;
  }
  if (!best || dist2(best.x, best.z, u.x, u.z) > reach * reach) return null;
  if (take && s.take) {
    const L = shot ? m.shots : m.zones;
    L.splice(L.indexOf(best), 1);
    if (!shot) m.events.push({ t: 'zoneEnd', id: best.id, kind: best.kind, x: best.x, z: best.z });
  }
  return best;
}
// do: 'totem' {cast, at, radius, hp, decay, dur, hps, dps}: a placed post with hp that loses decay hp a second; every half second it
// heals allies inside radius (zone `area`; the owner x selfHealMul) and hurts enemies there. Its body (r 0.8) takes enemy shots like a turret.
CAST.totem = function (m, u, s, inp) {
  let [x, z] = s.at === 'self' ? [u.x, u.z] : aimPoint(u, inp, s.cast);
  if (solidAt(m.map, x, z, 0.8)) { x = u.x; z = u.z; }
  addZone(m, u, { kind: 'totem', x, z, r: 0.8, area: s.radius, hp: s.hp, maxHp: s.hp, dur: s.dur, decay: s.decay || 0, hps: s.hps || 0, dps: s.dps || 0, acc: 0, src: s.id });
};
function totemStep(m, z, owner) {
  z.hp -= z.decay * TICK;
  z.acc += TICK;
  if (z.acc >= 0.5 - 1e-9) {
    z.acc -= 0.5;
    for (const u of m.units) {
      if (!u.alive || dist2(u.x, u.z, z.x, z.z) > z.area * z.area) continue;
      if (u.team === z.team) { if (z.hps) heal(m, u, z.hps * 0.5 * (u === owner ? RULES.selfHealMul : 1), owner); }
      else if (z.dps) damage(m, u, z.dps * 0.5, owner);
    }
  }
  return z.hp <= 0 || z.age > z.dur;
}
/* ===== end kit-remake G4 ===== */

/* ===== kit-remake K4 (lane K4, G5 one-tank mechanics; ~/handoff/dtt-ref/kits/MECHANICS.md "Group 5": tumay, enbac).
   Hooks elsewhere are one line each, marked "kit-remake K4", and call into this block.
   tumay (Tư Mã Ý, clip p12): the Chaos Orb economy.
     passive {do: 'chaos', every, max, kill, ring, spin}: one orbit zone per mech (mode 'chaos', synced as an orbit zone: n bits
       in `live`) holds the orbs circling it; one more every `every` s up to `max`; a kill gives `kill` more (up to max + kill).
     ground orbs: orbit zones of mode 'chaosG' (ring 0, one orb, fixed x/z): `dur` s, then a blast of `bdmg` in `blast` m
       (event nova, skill = the row that planted it). Spent by a skill, it vanishes without the blast.
     barrage row `leaveOrb {dur, blast, dmg}`: each strike plants a ground orb where it fell.
     nova row `orbKnock {dmg, stun, speed, range, cut}`: every own orb (circling or ground) inside the blow's reach and arc flies
       off away from the caster as a shot (dmg, stun s); a shot that hits a mech plants a ground orb there (the leaveOrb row's
       numbers) and cuts every cooldown of the caster by `cut` of its full length.
     orbit row `mode: 'devour' {cast, pick, dmg, grow, heal, speed, max}`: picks the enemy nearest the cursor (within pick of
       it, cast of the caster); every own orb (up to max, nearest the target first) flies at it, homing, over walls but
       stopped by any enemy in the way: the k-th does dmg + k x grow and heals the caster `heal` on a hit. No target or no
       orb: the press does not happen.
   enbac (Star Lord, clip p18 飞翼):
     passive {nth, bonus}: every nth weapon hit in a row on the same mech adds `bonus` (event stacks {id, by, x, z}).
     passive {chance, missile {dmg, speed, range, r, vis, turn, src}}: each weapon shot has that chance to also launch one
       homing missile at the enemy nearest the aim (within the weapon's reach, 0.7 rad of the aim).
     dash row `back: true`: the dash runs away from the aim (onStart.volley without `back` fires along the aim).
     volley row `home {cast, pick, turn}`: the volley locks the enemy nearest the cursor and its shots turn toward it at
       `turn` rad/s; nobody there, they fly straight.
   New names carry a prefix (tm = tumay, sl = enbac, k4 = shared by the lane): unit tmAcc (orb timer), slTo/slN (hit count);
   zone tmGone/tmBlast/tmDmg (ground orbs); shot k4Home (unit id), k4Turn (rad/s), k4Kind ('knock' | 'devour'), tmHeal, tmCut. Shots travel in netstate by
   position and direction, so a homing shot needs no new field. TODO (G3 STATUS mask): nothing of K4 is a unit status;
   u.slTo/u.slN and u.tmAcc are host-only and need no sync (the orbs are zones). ===== */
const k4P = (u) => u.def.passive || null;
function k4Clear(u) { u.slTo = -1; u.slN = 0; u.tmAcc = 0; }
function k4Pool(m, u) { for (const z of m.zones) if (z.kind === 'orbit' && z.owner === u.id && z.mode === 'chaos') return z; return null; }
const k4Bits = (v) => { let n = 0; for (; v; v &= v - 1) n++; return n; };
function k4AddOrbs(z, k, cap) {
  for (let i = 0; i < z.n && k > 0 && k4Bits(z.live) < cap; i++) if (!((z.live >> i) & 1)) { z.live |= 1 << i; k--; }
}
// Every tick of a living mech: the chaos pool exists, and grows one orb every P.every s up to P.max.
function k4Tick(m, u) {
  const P = k4P(u);
  if (!P || P.do !== 'chaos') return;
  let z = k4Pool(m, u);
  if (!z) {
    const ring = P.ring || 1.7;
    z = { kind: 'orbit', mode: 'chaos', x: u.x, z: u.z, r: ring, ring, n: P.max + (P.kill || 0), live: 0, dur: 1e6, rate: 0, acc: 0, dmg: 0, range: 0, dps: 0, spin: P.spin || 2.2, speed: 0, pr: 0, vis: 'dart', src: null };
    addZone(m, u, z);
  }
  if (k4Bits(z.live) >= P.max) { u.tmAcc = 0; return; }
  u.tmAcc += TICK;
  if (u.tmAcc >= P.every - 1e-9) { u.tmAcc -= P.every; k4AddOrbs(z, 1, P.max); }
}
// takedown: a kill of the chaos mech gives P.kill orbs at once (the ult reset is passive mods.onKill)
function k4Kill(m, o) {
  const P = k4P(o), z = k4Pool(m, o);
  if (z) k4AddOrbs(z, P.kill || 0, z.n);
}
// Every own orb: circling ones (pool, bit i) and ground ones, with where they are now.
export function chaosOrbs(m, u) {
  const out = [];
  for (const z of m.zones) {
    if (z.kind !== 'orbit' || z.owner !== u.id) continue;
    if (z.mode === 'chaos') { for (let i = 0; i < z.n; i++) if ((z.live >> i) & 1) { const [x, zz] = orbPos(z, u, i); out.push({ z, i, x, zz }); } }
    else if (z.mode === 'chaosG' && !z.tmGone) out.push({ z, i: -1, x: z.x, zz: z.z });
  }
  return out;
}
function k4Spend(o) { if (o.i >= 0) o.z.live &= ~(1 << o.i); else o.z.tmGone = true; }
function k4Plant(m, u, x, z, L, src) {
  addZone(m, u, { kind: 'orbit', mode: 'chaosG', x, z, r: 0.6, ring: 0, n: 1, live: 1, dur: L.dur, rate: 0, acc: 0, dmg: 0, range: 0, dps: 0, spin: 0, speed: 0, pr: 0, vis: 'dart', src, tmBlast: L.blast, tmDmg: L.dmg });
}
// A ground orb's tick: spent (gone) it just ends; at the end of its time it bursts round itself.
function k4Ground(m, z, owner) {
  if (z.tmGone || !owner || !owner.alive) return true;
  if (z.age < z.dur) return false;
  m.events.push({ t: 'nova', id: owner.id, x: z.x, z: z.z, r: z.tmBlast, skill: z.src, orb: 1 });
  curSrc = z.src; areaDamage(m, owner, z.x, z.z, z.tmBlast, z.tmDmg, null, null); curSrc = null;
  return true;
}
// A strike of a barrage row with leaveOrb plants a ground orb where it fell.
function k4Strike(m, z, owner) {
  if (!owner || !owner.alive || !z.src) return;
  const s = owner.def.skills.find((r) => r.id === z.src);
  if (s && s.leaveOrb) k4Plant(m, owner, z.x, z.z, s.leaveOrb, s.id);
}
// An orb shot leaving (x, z) at angle a.
function k4Shot(m, u, x, z, a, o) {
  const dx = Math.cos(a), dz = Math.sin(a);
  const s = { id: m.nextId++, team: u.team, color: u.color, owner: u.id, x, z, px: x, pz: z, dx, dz, speed: o.speed, left: o.range, dmg: o.dmg * dmgScale(u), splash: 0, knock: 0, slow: 0, slowDur: 0, r: o.r, vis: o.vis,
    pierce: false, bounce: 0, hook: null, far: null, flown: 0, hit: null, fx: o.fx || null, ret: false, back: false, src: o.src, over: !!o.over, k4Kind: o.k4 };
  if (o.home !== undefined) { s.k4Home = o.home; s.k4Turn = o.turn; }
  if (o.heal) s.tmHeal = o.heal;
  if (o.cut) s.tmCut = o.cut;
  m.shots.push(s);
  return s;
}
const k4Ang = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// FINISH.nova of a row with orbKnock: own orbs inside the blow fly off away from the caster.
function k4Knock(m, u, s) {
  const K = s.orbKnock, reach = s.radius + 0.3, vis = u.def.weapon.vis;
  for (const o of chaosOrbs(m, u)) {
    const dx = o.x - u.x, dz = o.zz - u.z, d = Math.hypot(dx, dz);
    if (d > reach || (s.arc && d > 0.2 && Math.abs(k4Ang(Math.atan2(dz, dx) - u.aim)) > s.arc)) continue;
    k4Spend(o);
    const a = d > 0.2 ? Math.atan2(dz, dx) : u.aim;
    k4Shot(m, u, o.x, o.zz, a, { dmg: K.dmg, speed: K.speed, range: K.range, r: 0.45, vis, fx: K.stun ? { stun: K.stun } : null, src: s.id, k4: 'knock', cut: K.cut });
    m.events.push({ t: 'orbKnock', id: u.id, x: o.x, z: o.zz, a });
  }
}
// CAST.orbit, mode 'devour': every orb at the picked enemy.
function k4Devour(m, u, s, inp) {
  const tgt = pickUnit(m, u, inp, s, (o) => o.team !== u.team);
  if (!tgt) return false;
  const orbs = chaosOrbs(m, u).sort((p, q) => dist2(p.x, p.zz, tgt.x, tgt.z) - dist2(q.x, q.zz, tgt.x, tgt.z) || p.z.id - q.z.id || p.i - q.i).slice(0, s.max || 99);
  if (!orbs.length) return false;
  const vis = u.def.weapon.vis;
  orbs.forEach((o, k) => {
    k4Spend(o);
    k4Shot(m, u, o.x, o.zz, Math.atan2(tgt.z - o.zz, tgt.x - o.x), { dmg: s.dmg + k * (s.grow || 0), speed: s.speed || 26, range: 40, r: 0.45, vis, src: s.id, k4: 'devour', over: true, home: tgt.id, turn: 99, heal: s.heal });
  });
  m.events.push({ t: 'devour', id: u.id, target: tgt.id, n: orbs.length, x: tgt.x, z: tgt.z });
}
// stepShots: a homing shot turns toward its target at s.turn rad/s; the target gone, it flies on straight.
function k4Steer(m, s) {
  const o = m.units[s.k4Home];
  if (!o || !o.alive) { s.k4Home = undefined; return; }
  const want = Math.atan2(o.z - s.z, o.x - s.x), cur = Math.atan2(s.dz, s.dx), d = k4Ang(want - cur), lim = s.k4Turn * TICK;
  const a = cur + (Math.abs(d) <= lim ? d : Math.sign(d) * lim);
  s.dx = Math.cos(a); s.dz = Math.sin(a);
}
// stepShots: a shot hurt a mech (after its own damage and fx).
function k4ShotHit(m, s, o, u) {
  if (s.k4Kind === 'knock' && u.alive) {
    const L = u.def.skills.find((r) => r.leaveOrb);
    if (L) k4Plant(m, u, o.x, o.z, L.leaveOrb, L.id);
    if (s.tmCut) for (let j = 0; j < 3; j++) if (u.def.skills[j]) applyCut(u, j, { frac: s.tmCut });
  }
  if (s.tmHeal && u.alive) heal(m, u, s.tmHeal, u);
  const P = k4P(u);
  if (P && P.nth && s.src === 'w' && o.alive) {
    if (u.slTo === o.id) u.slN++; else { u.slTo = o.id; u.slN = 1; }
    if (u.slN >= P.nth) {
      u.slN = 0;
      curSrc = 'w'; damage(m, o, P.bonus * dmgScale(u), u); curSrc = s.src;
      m.events.push({ t: 'stacks', id: o.id, by: u.id, x: o.x, z: o.z });
    }
  }
}
// fireWeapon: the passive's chance of a homing missile beside the shot.
function k4Missile(m, u, a) {
  const P = k4P(u), M = P.missile;
  if (!(m.rng() < P.chance)) return;
  let best = null, bd = 1e9;
  const reach = weaponRange(u) + 2;
  for (const o of m.units) {
    if (o.team === u.team || !o.alive || !visibleTo(m, o, u.team)) continue;
    const d = dist2(o.x, o.z, u.x, u.z);
    if (d > reach * reach || Math.abs(k4Ang(Math.atan2(o.z - u.z, o.x - u.x) - a)) > 0.7) continue;
    if (d < bd) { bd = d; best = o; }
  }
  const side = m.rng() < 0.5 ? -1 : 1, at = m.shots.length;
  spawnShot(m, u, M, a + side * 0.6, side * 0.3, null, M.src);
  const s = m.shots[at];
  if (s && best) { s.k4Home = best.id; s.k4Turn = M.turn; }
  m.events.push({ t: 'fire', id: u.id, vis: M.vis, x: u.x, z: u.z, a: a + side * 0.6, side: 0 });
}
// CAST.dash with back: true (after its onStart): the dash runs opposite to the aim.
function k4BackDash(u, s) { u.dash = { dx: -Math.cos(u.aim), dz: -Math.sin(u.aim), left: s.dist, speed: s.speed, s, hit: [] }; }
// CAST.volley with home: the volley, its shots locked on the enemy nearest the cursor.
function k4Homing(m, u, s, inp) {
  const tgt = inp ? pickUnit(m, u, inp, s.home, (o) => o.team !== u.team) : null, at = m.shots.length;
  fireVolley(m, u, s);
  if (tgt) for (let i = at; i < m.shots.length; i++) { m.shots[i].k4Home = tgt.id; m.shots[i].k4Turn = s.home.turn; }
  if (tgt) m.events.push({ t: 'lock', id: u.id, target: tgt.id, x: tgt.x, z: tgt.z, skill: s.id });
}
/* ===== end kit-remake K4 ===== */

/* ===== feat/dtt-modes: Phó bản waves ===== */
// Every monster of every wave is in the roster from the start (an online mirror needs a fixed unit list). A later wave waits
// dead (respawnT 1e9) until the one before it is cleared, then appears after PVE_GAP seconds behind its spawn guard.
const PVE_GAP = 2.5;
// Where monsters appear: the far team's pads, then the open airdrop points on its half, then the rest.
function pveSpots(map) {
  const far = map.bases[1], side = Math.sign(far[0]) || 1;
  const pts = map.spawns[1].concat(map.cratePoints.filter((p) => Math.sign(p[0]) === side), map.cratePoints.filter((p) => Math.sign(p[0]) !== side && Math.abs(p[0]) > map.hw * 0.15));
  const ok = pts.filter((p) => !solidAt(map, p[0], p[1], 1.3));
  return ok.length ? ok : map.spawns[1].slice();
}
function pveInit(m) {
  let n = 0;
  for (const u of m.units) if (u.team === 1) n = Math.max(n, u.wave + 1);
  m.waves = n; m.target = n; m.wave = 0; m.waveT = 0;
  // later waves, and the summons a boss calls in, wait dead
  for (const u of m.units) if (u.team === 1 && (u.wave > 0 || u.summon)) { u.alive = false; u.hp = 0; u.respawnT = 1e9; }
}
// true when the last wave is cleared
function pveStep(m) {
  pveBosses(m);
  for (const u of m.units) if (u.team === 1 && u.wave === m.wave && u.alive) { m.waveT = 0; return false; }
  if (m.wave >= m.waves - 1) return true;
  m.waveT += TICK;
  if (m.waveT < PVE_GAP) return false;
  m.wave++; m.waveT = 0;
  for (const u of m.units) if (u.team === 1 && u.wave === m.wave && !u.summon) spawn(m, u, false);
  m.events.push({ t: 'wave', n: m.wave, of: m.waves });
  return false;
}
// Boss scripts (def.script), run every tick for each living boss of a Phó bản after everything else moved. Their state lives on u.bs.
// Every attack they add is a strike zone (a marked circle that lands after its delay) or the always-drawn rail.
const bossParts = (m, u) => m.units.filter((o) => o.team === u.team && o.def.part && o.wave === u.wave);
const PVE_SCRIPTS = {
  // Giant tank: at half hp it rings itself with marked shells and fires a third faster for the rest of the fight.
  tank(m, u) {
    const s = u.bs || (u.bs = { rage: false });
    if (s.rage || u.hp > u.maxHp * 0.5) return;
    s.rage = true;
    m.events.push({ t: 'bossPhase', id: u.id, x: u.x, z: u.z });
    for (let i = 0; i < 10; i++) { const a = i / 10 * 2 * Math.PI; addZone(m, u, { kind: 'strike', x: u.x + Math.cos(a) * 6, z: u.z + Math.sin(a) * 6, r: 2.4, delay: 1.5, total: 1.5, dmg: 700, src: 'ct_vong' }); }
    u.rapidF = 1.35; u.rapidT = 1e6;
  },
  // Warship: cruises its lane (x = lane.x * sin of the clock), the deck guns ride along; while one stands the hull takes 60% less damage.
  ship(m, u) {
    const L = u.def.lane, s = u.bs || (u.bs = { t0: m.time });
    const ph = (m.time - s.t0) * 2 * Math.PI / L.period, x = L.x * Math.sin(ph);
    // the bow keeps facing +x: on the way back the ship goes astern, so the guns never swap places
    u.x = x; u.z = L.z; u.vx = 0; u.vz = 0; u.heading = 0;
    const parts = bossParts(m, u), at = u.def.parts[0].at;
    let up = 0;
    parts.forEach((p, i) => { if (!p.alive) return; up++; p.x = x + at[i % at.length]; p.z = L.z; p.vx = 0; p.vz = 0; p.heading = u.heading; });
    if (up) { u.armorT = Math.max(u.armorT, 0.2); u.armorF = Math.max(u.armorF, 0.6); }
  },
  // Train: the engine leads round the rail at rail.speed, carriages follow rail.gap apart. Standing on the rail burns every half second;
  // the engine and the carriages ram whoever is in their way (once a second per victim).
  train(m, u) {
    const R = u.def.rail, s = u.bs || (u.bs = { d: 0, ram: {} });
    s.d += R.speed * TICK;
    const set = (o, d) => { const p = railAt(R, d); o.x = p.x; o.z = p.z; o.heading = p.h; o.vx = Math.cos(p.h) * R.speed; o.vz = Math.sin(p.h) * R.speed; };
    set(u, s.d);
    // the engine is the weak point: it has no armour and takes half again the damage
    u.ampT = Math.max(u.ampT, 0.2); u.ampF = Math.max(u.ampF, 0.5);
    const cars = [u];
    bossParts(m, u).forEach((p, i) => { if (p.alive) { set(p, s.d - (i + 1) * R.gap); cars.push(p); } });
    const scale = dmgScale(u);
    for (const o of m.units) {
      if (o.team === u.team || !o.alive) continue;
      for (const c of cars) {
        const rr = c.radius + o.radius;
        if (dist2(o.x, o.z, c.x, c.z) > rr * rr || (s.ram[o.id] || 0) > m.time) continue;
        s.ram[o.id] = m.time + 1;
        const d = Math.hypot(o.x - c.x, o.z - c.z) || 1;
        damage(m, o, R.ram * scale, u);
        if (o.alive && !o.def.heavy) { o.kx += (o.x - c.x) / d * 16; o.kz += (o.z - c.z) / d * 16; }
        m.events.push({ t: 'ram', id: u.id, x: o.x, z: o.z });
        break;
      }
      if (m.tick % 15 === 0 && o.alive) {
        const a = Math.atan2(o.z / R.rz, o.x / R.rx), px = Math.cos(a) * R.rx, pz = Math.sin(a) * R.rz;
        if (dist2(o.x, o.z, px, pz) < R.width * R.width) { curSrc = 'rail'; damage(m, o, R.dps * 0.5 * scale, u); curSrc = null; }
      }
    }
  },
  // Alien: every blink.every seconds it marks a far spot, which blasts when it lands there; every summons.every seconds up to summons.per
  // of its held drones come back around it.
  alien(m, u) {
    const B = u.def.blink, S = u.def.summons, s = u.bs || (u.bs = { blinkT: B.every * 0.6, sumT: S.every * 0.5, to: null });
    if (s.to) {
      s.to.t -= TICK;
      if (s.to.t <= 0) {
        const x0 = u.x, z0 = u.z;
        u.x = u.px = s.to.x; u.z = u.pz = s.to.z; u.vx = u.vz = 0; u.cast = null;
        m.events.push({ t: 'warp', id: u.id, x0, z0, x: u.x, z: u.z });
        s.to = null;
      }
    } else if ((s.blinkT -= TICK) <= 0) {
      s.blinkT = B.every;
      const spots = m.pveSpots.concat(m.map.cratePoints).filter((p) => !solidAt(m.map, p[0], p[1], u.radius + 0.3));
      let best = null, bs = -1;
      for (const p of spots) { const d = dist2(p[0], p[1], u.x, u.z) * (0.6 + 0.4 * m.rng()); if (d > bs) { bs = d; best = p; } }
      if (best) {
        s.to = { x: best[0], z: best[1], t: B.delay };
        addZone(m, u, { kind: 'strike', x: best[0], z: best[1], r: B.r, delay: B.delay, total: B.delay, dmg: B.dmg, src: 'nt_dich' });
      }
    }
    if ((s.sumT -= TICK) <= 0) {
      s.sumT = S.every;
      let n = 0;
      for (const o of m.units) {
        if (n >= S.per || o.alive || !o.summon || o.wave !== u.wave) continue;
        spawn(m, o, false);
        const a = m.rng() * 2 * Math.PI, x = u.x + Math.cos(a) * 3.5, z = u.z + Math.sin(a) * 3.5;
        if (!solidAt(m.map, x, z, o.moveRadius)) { o.x = o.px = x; o.z = o.pz = z; }
        n++;
      }
      if (n) m.events.push({ t: 'summon', id: u.id, n, x: u.x, z: u.z });
    }
  },
};
function pveBosses(m) {
  for (const u of m.units) {
    if (u.team !== 1) continue;
    if (u.alive && u.def.script) PVE_SCRIPTS[u.def.script](m, u);
    // a boss's parts and summons fall with it
    if (u.alive && (u.def.part || u.summon)) { const lead = m.units.find((o) => o.team === u.team && o.def.boss && o.wave === u.wave); if (lead && !lead.alive && lead.deaths > 0) kill(m, u, null); }
  }
}
import { railAt } from './data.js';
/* ===== end feat/dtt-modes Phó bản waves ===== */

/* ===== kit lane K1 (feat/dtt-k1): G5 mechanics of Hulk, Captain America, Tư Mã Ý, Star Lord ===== */
// Hooks in shared paths, one line each: clearStatus -> k1Clear, stepUnit -> k1Tick (after the transform tick), damage -> k1Hurt
// (the victim, after rowHit), heal -> k1HealMul, dmgScale (hkF while hkT runs), rampBonus 'rapid' (hkF while hkT runs).
function k1Clear(u) {
  u.hkN = 0; u.hkT = 0; u.hkF = 0; u.hkIcd = 0;
  u.capT = 0; u.inT = 0; u.bubT = 0; u.bubCc = 1; u.bubPrev = null;
  u.rlT = 0; u.rlDur = 1; u.rlS = 0; u.rlH = 1;
}

// Hulk (khidot). passive regen `healUp: f`: every heal it receives is x (1 + f x its lost share of max hp).
// transform `hps: f` (heals f of max hp per second while it runs) and `hurtW { heal, cut, step, max, dur, icd }`: while it runs, a
// weapon blow from an enemy (one per icd s) heals `heal` of the lost hp, cuts the other two slots' cooldowns by `cut` of their full
// cooldown, and adds a stack (hkN, up to max) of +step damage and fire rate for dur s (hkT, refreshed by each stack).
function k1HealMul(u) {
  const P = u.def.passive;
  return P && P.healUp ? 1 + P.healUp * Math.max(0, 1 - u.hp / u.maxHp) : 1;
}
const k1Tf = (u) => (u.tfT > 0 && u.tfSlot >= 0 ? u.def.skills[u.tfSlot] : null);
function k1Tick(m, u, dt) {
  if (u.capT > 0) u.capT = Math.max(0, u.capT - dt);
  if (u.inT > 0) u.inT = Math.max(0, u.inT - dt);
  if (u.bubT > 0) {
    // bubble cc cut: a stun, slow or root that landed since the last tick lasts only bubCc of what it was given
    const P = u.bubPrev;
    if (P && u.bubCc < 1) for (let i = 0; i < 3; i++) { const k = CC_KEYS[i], d = u[k] - P[i]; if (d > 1e-9) u[k] = P[i] + d * u.bubCc; }
    u.bubT = Math.max(0, u.bubT - dt); u.bubPrev = u.bubT > 0 ? [u.stunT, u.slowT, u.rootT] : null;
  }
  if (u.rlT > 0) {
    // rally shield and haste fade linearly to nothing over their duration
    u.rlT = Math.max(0, u.rlT - dt); const f = u.rlT / u.rlDur;
    if (u.shield > u.rlS * f) { u.shield = u.rlS * f; if (u.shield <= 0) { u.shield = 0; u.shieldT = 0; } }
    if (u.hasteT > 0 && u.rlH > 1) u.hasteF = Math.max(1 + (u.rlH - 1) * f, u.capT > 0 ? 1 + k1Cap().aura.speed : 1);
  }
  const P = u.def.passive;
  if (P && P.aura && !((m.tick + u.id) % 6)) for (const o of m.units) {
    if (o.team !== u.team || !o.alive || dist2(o.x, o.z, u.x, u.z) > P.aura.r * P.aura.r) continue;
    o.capT = 0.25; k1Haste(o, 0.25, 1 + P.aura.speed);
  }
  if (u.hkIcd > 0) u.hkIcd = Math.max(0, u.hkIcd - dt);
  if (u.hkT > 0) { u.hkT = Math.max(0, u.hkT - dt); if (u.hkT <= 0) { u.hkN = 0; u.hkF = 0; } }
  const s = k1Tf(u);
  if (s && s.hps) heal(m, u, u.maxHp * s.hps * dt, u, true);
}
function k1Hurt(m, u, foe) {
  if (typeof curSrc === 'string' && curSrc.endsWith('~b')) k1BackHit(foe, curSrc);
  const s = curSrc === 'w' && u.alive ? k1Tf(u) : null, H = s && s.hurtW;
  if (!H || u.hkIcd > 0) return;
  u.hkIcd = H.icd;
  if (H.heal) heal(m, u, (u.maxHp - u.hp) * H.heal, u, true);
  if (H.cut) for (let i = 0; i < 3; i++) if (i !== u.tfSlot && u.def.skills[i]) { const k = SLOTS[i]; u.cd[k] = Math.max(0, u.cd[k] - u.def.skills[i].cd * H.cut); }
  u.hkN = Math.min(H.max, u.hkN + 1); u.hkF = u.hkN * H.step; u.hkT = H.dur;
  m.events.push({ t: 'k1', kind: 'hurtW', id: u.id, n: u.hkN, x: u.x, z: u.z });
}

// Captain America (tacke). passive `aura { r, speed, armor }`: allies within r (itself too) move speed x (1 + speed) and get +armor
// (capT, refreshed every 0.2 s). passive `inspire { r, dur, haste, wdr }`: every cast gives allies within r (itself too) dur s of
// +haste speed and wdr less damage from weapon blows (inT/inS/inW).
// The armour and weapon-damage factors are read from the one aura passive in MECHS (k1Cap), not stored per unit.
let k1CapRow;
const K1_NO_CAP = { aura: { speed: 0, armor: 0 }, inspire: { haste: 0, wdr: 0 } };
const k1Cap = () => (k1CapRow !== undefined ? k1CapRow : (k1CapRow = { ...K1_NO_CAP, ...(Object.values(MECHS).map((r) => r.passive).find((P) => P && (P.aura || P.inspire)) || {}) }));
// Speed goes through the synced haste (hasteT/hasteF, the strongest haste running wins), so a guest's mirror moves the same; the
// timers capT/inT/bubT and the factors stay host side (the netstate status mask has no room for them).
function k1Haste(o, dur, f) { o.hasteF = Math.max(o.hasteT > 0 ? o.hasteF : 1, f); o.hasteT = Math.max(o.hasteT, dur); }
const k1Armor = (u) => (u.capT > 0 ? k1Cap().aura.armor : 0);
const k1Wdr = (u) => (u.inT > 0 ? k1Cap().inspire.wdr : 0);
function k1Cast(m, u, s) {
  const I = u.def.passive && u.def.passive.inspire;
  if (!I) return;
  for (const o of m.units) {
    if (o.team !== u.team || !o.alive || dist2(o.x, o.z, u.x, u.z) > I.r * I.r) continue;
    o.inT = I.dur; k1Haste(o, I.dur, 1 + I.haste);
  }
  m.events.push({ t: 'k1', kind: 'inspire', id: u.id, x: u.x, z: u.z, r: I.r });
}
// bless `bubble: s` (+ `bubCc: f`): the blessed ally AND the caster are wrapped for s seconds in a bubble that eats every enemy shot
// that reaches it (stepShots: the shot ends as a 'dome' impact, no damage, no splash); the ally's new stuns, slows and roots last bubCc.
function k1Bless(m, u, s, o) {
  if (!s.bubble) return;
  for (const w of o === u ? [u] : [o, u]) { w.bubT = Math.max(w.bubT, s.bubble); w.bubCc = w === o && s.bubCc ? s.bubCc : 1; w.bubPrev = [w.stunT, w.slowT, w.rootT]; }
}
// volley `back { dmg, fx, cut }` on a `ret` row: the shot turning home hits for back.dmg with back.fx, and each enemy it hurts on the way
// home cuts this slot's cooldown by `cut` of the row's cd. The homeward shot carries the source tag '<id>~b' (rowHit ignores it).
function k1Back(owner, s) {
  const row = s.src && owner.def.skills.find((r) => r.id === s.src), B = row && row.back;
  if (!B) return;
  s.dmg = B.dmg * dmgScale(owner); s.fx = B.fx || null; s.pierce = true; s.hit = []; s.src = row.id + '~b';
}
function k1BackHit(foe, tag) {
  const id = tag.slice(0, -2), i = foe.def.skills.findIndex((r) => r.id === id), B = i >= 0 && foe.def.skills[i].back;
  if (!B || !B.cut) return;
  const k = SLOTS[i]; foe.cd[k] = Math.max(0, foe.cd[k] - foe.def.skills[i].cd * B.cut);
}
// rally `shield, shieldDur, decay, ccImmune`: allies in the radius get a shield that fades to nothing over shieldDur (with the rally's
// haste fading alongside) and ccImmune s of crowd-control immunity.
function k1Rally(m, u, s) {
  if (!s.shield) return;
  for (const o of m.units) {
    if (o.team !== u.team || !o.alive || dist2(o.x, o.z, u.x, u.z) > s.radius * s.radius) continue;
    o.shield = Math.max(o.shield, s.shield); o.shieldMax = Math.max(o.shieldMax, o.shield); o.shieldT = Math.max(o.shieldT, s.shieldDur);
    if (s.decay) { o.rlT = s.shieldDur; o.rlDur = s.shieldDur; o.rlS = s.shield; o.rlH = s.haste || 1; }
    if (s.ccImmune) o.ccT = Math.max(o.ccT, s.ccImmune);
  }
}
/* ===== end kit lane K1 ===== */
/* ===== kit-remake G5 Kurumi (kit lane k8; ~/handoff/dtt-ref/kits/AUDIT-c.md vesau): weapon krHeal, rewind fwd ===== */
// weapon krHeal: a weapon shot that hits a mech heals every ally of its owner (not the owner) inside the shot's splash radius by krHeal.
function krSplashHeal(m, owner, s) {
  const w = weaponOf(owner), r = s.splash || 0;
  if (!w.krHeal || !r) return;
  for (const o of m.units) if (o !== owner && o.team === owner.team && o.alive && o.hp < o.maxHp && dist2(o.x, o.z, s.x, s.z) <= r * r) heal(m, o, w.krHeal, owner);
}
// rewind fwd: s (the forward rewind): every ally within radius (the caster too) is marked for fwd s with the hp it has now (krHp);
// meanwhile it takes `guard` less skill damage (G2 guard vs 'skill'); when the mark ends its hp goes back up to krHp (the caster's own
// share x selfHealMul). Event 'rewind' at the press, 'krBack' when a mark snaps back.
function krRewind(m, u, s) {
  for (const o of m.units) {
    if (o.team !== u.team || !o.alive || dist2(o.x, o.z, u.x, u.z) > s.radius * s.radius) continue;
    o.krT = s.fwd; o.krHp = o.hp; o.krBy = u.id;
    if (s.guard) g2Guard(o, s.guard, 'skill', s.fwd);
  }
  m.events.push({ t: 'rewind', id: u.id, x: u.x, z: u.z, r: s.radius });
}
function krClear(u) { u.krT = 0; u.krHp = 0; u.krBy = -1; }
function krTick(m, u) {
  if (!(u.krT > 0)) return;
  u.krT -= TICK;
  if (u.krT > 1e-9) return;
  const by = m.units[u.krBy], lost = u.krHp - u.hp;
  if (lost > 0) heal(m, u, lost * (by === u ? RULES.selfHealMul : 1), by && by.alive ? by : u);
  m.events.push({ t: 'krBack', id: u.id, x: u.x, z: u.z, amt: Math.max(0, lost) });
  krClear(u);
}
/* ===== end kit-remake G5 Kurumi ===== */

/* ===== kit-remake G5 An Dương Vương (kit lane k9; ~/handoff/dtt-ref/kits/MECHANICS.md group 5, AUDIT-a.md anduong) ===== */
// passive `crit {chance, mul, kill {add, dur, max}}`: every main-weapon arrow rolls m.rng() once as it leaves; under chance (+ add per
//   kill stack) it is a crit: dmg x mul (event k9 crit). A killing blow adds a stack (adN, up to max) for dur s (adNT, refreshed).
// row `rootOk: true`: the row can be cast while rooted (dash, blink, leap and the like are blocked by a root otherwise).
// transform `adHeal: f`: heals f of max hp at the press (hook in the cast loop). transform `adKill {extend, reset, dur, critDmg,
//   steal}`: a kill while it runs makes the transform, its haste and its guard run `extend` s longer, clears the `reset` slots'
//   cooldowns, and for `dur` s (adKT) main-weapon crits do x (mul + critDmg) (adKC) and arrows heal steal of what they take (adKS).
// weapon `adFall: f` (a transform's weapon too): a piercing arrow loses f of its damage at every mech it goes through.
// adN and adKT are in netstate STATUS (they change the next arrow); adNT, adKC, adKS are host-side.
function adClear(u) { u.adN = 0; u.adNT = 0; u.adKT = 0; u.adKC = 0; u.adKS = 0; }
function adTick(u) {
  if (u.adNT > 0 && (u.adNT -= TICK) <= 1e-9) { u.adNT = 0; u.adN = 0; }
  if (u.adKT > 0 && (u.adKT -= TICK) <= 1e-9) { u.adKT = 0; u.adKC = 0; u.adKS = 0; }
}
// the n arrows fireWeapon has just pushed: falloff, kill-reward lifesteal, the crit roll
function adShots(m, u, w, n) {
  const P = u.def.passive, K = P && P.crit;
  for (let i = m.shots.length - n; i < m.shots.length; i++) {
    const sh = m.shots[i];
    if (w.adFall) sh.adFall = w.adFall;
    if (u.adKT > 0 && u.adKS) sh.steal = Math.max(sh.steal, u.adKS);
    if (!K || m.rng() >= K.chance + (K.kill ? K.kill.add * u.adN : 0)) continue;
    sh.dmg *= K.mul + (u.adKT > 0 ? u.adKC : 0); sh.crit = 1;
    m.events.push({ t: 'k9', kind: 'crit', id: u.id, x: sh.x, z: sh.z, a: Math.atan2(sh.dz, sh.dx) });
  }
}
function adKill(m, o) {
  const P = o.def.passive, K = P && P.crit && P.crit.kill;
  if (K) { o.adN = Math.min(K.max, o.adN + 1); o.adNT = K.dur; }
  const tf = o.tfT > 0 && o.tfSlot >= 0 ? o.def.skills[o.tfSlot] : null, A = tf && tf.adKill;
  if (!A) return;
  o.tfT += A.extend;
  if (o.hasteT > 0) o.hasteT += A.extend;
  if (o.guardT > 0) o.guardT += A.extend;
  for (const k of A.reset || []) o.cd[k] = 0;
  o.adKT = A.dur; o.adKC = A.critDmg || 0; o.adKS = A.steal || 0;
  m.events.push({ t: 'k9', kind: 'adKill', id: o.id, x: o.x, z: o.z });
}
/* ===== end kit-remake G5 An Dương Vương ===== */

/* ===== kit-remake G5 Băng Nha (kit lane k9; ~/handoff/dtt-ref/kits/MECHANICS.md group 5, AUDIT-a.md bang) ===== */
// barrage `bnRing {inner, fx}`: when one of the row's strikes goes off, every enemy standing in its outer band (from inner x the
//   blast radius out to the rim the blast reaches) also gets fx (Băng Sương Chi Hoàn: frozen on the outer ring). Hook in stepZones.
// row `bnStop: true` on a channelled barrage: once the key has been let go, pressing it again ends the channel at once (strikes
//   already falling still land) and drops the guard it gave (event k9 bnStop). Hook in stepUnit before the cast-in-progress return.
// Channel strikes now carry their row's source tag (channelStrike), so vsTag, towerMul and the on-hit row fields work for them.
// Nothing here is in netstate STATUS (the cast that ends is synced as the cast).
function bnRing(m, owner, z) {
  const i = srcSlot(owner, z.src), s = i >= 0 ? slotRow(owner, i, z.src) : null, B = s && s.bnRing;
  if (!B) return;
  for (const o of m.units) {
    if (o.team === owner.team || !o.alive) continue;
    const d = Math.sqrt(dist2(o.x, o.z, z.x, z.z)), reach = z.r + o.radius * 0.6;
    if (d > reach || d < B.inner * z.r) continue;
    applyFx(m, owner, o, B.fx);
    m.events.push({ t: 'k9', kind: 'bnRing', id: o.id, by: owner.id, x: o.x, z: o.z });
  }
}
function bnStop(m, u, inp) {
  const c = u.cast, i = u.def.skills.indexOf(c.skill);
  if (i < 0) return;
  if (!inp[SLOTS[i]]) { c.bnUp = true; return; }
  if (!c.bnUp) return;
  u.cast = null; u.guardT = 0; u.guardF = 0;
  m.events.push({ t: 'k9', kind: 'bnStop', id: u.id, x: u.x, z: u.z });
}
/* ===== end kit-remake G5 Băng Nha ===== */

/* ===== kit-remake G5 Black Panther (kit lane k9; ~/handoff/dtt-ref/kits/MECHANICS.md group 5, AUDIT-a.md baogam) ===== */
// dash `bgRe: row` (with `stop: true`): the mech the dash stops on is charged again at once: the row (a dash, usually `drag`) is queued
//   like a G3 `then` and, when it goes, turns to that mech; if it has died, to the nearest visible enemy within `row.r` of the caster;
//   nobody, the second charge is dropped. Hooks: stepDash (the stop) and thenStep (the aim).
// flurry `bgLast {dmg, knock, fx}`: the last cut of the flurry (its n-th step) hits with these instead of the row's dmg / fx and
//   throws the victim back by knock. Hook: flurryStep.
// Nothing here is in netstate STATUS (the dash and the flurry travel as they do for every row).
function bgQueue(u, s, o) {
  u.thenQ.push({ row: s.bgRe, slot: u.def.skills.indexOf(s), t: 0, bgAt: o.id });
}
function bgAim(m, u, q) {
  let o = m.units[q.bgAt];
  if (!o || !o.alive) {
    o = null; let bd = (q.row.r || 8) ** 2;
    for (const e of m.units) {
      if (e.team === u.team || !e.alive || e.invulnT > 0 || !visibleTo(m, e, u.team)) continue;
      const d = dist2(e.x, e.z, u.x, u.z);
      if (d < bd) { bd = d; o = e; }
    }
    if (!o) return false;
  }
  u.aim = u.heading = Math.atan2(o.z - u.z, o.x - u.x);
  return true;
}
function bgLast(u, s) {
  const L = s.bgLast, d = u.dash;
  d.s = { ...d.s, dmg: L.dmg ?? d.s.dmg, knock: L.knock || 0, fx: L.fx || d.s.fx };
}
/* ===== end kit-remake G5 Black Panther ===== */

/* ===== kit lane K7 (feat/dtt-k7): one-line hooks in shared paths call these; each tank's G5 work is its own block below ===== */
function k7Clear(u) { smClear(u); sirClear(u); hwkClear(u); }
function k7Tick(m, u) { smTick(m, u); sirTick(m, u); hwkTick(m, u); }
// every successful press (a second stage too), after its cast
function k7Cast(m, u, s) { if (u.sirT > 0) sirBreak(m, u); if (s.reload) hwkReload(m, u); }
function k7Zone(z, s) { if (s.eye) hwkZone(z, s); else sirZone(z, s); }
function k7ZoneTick(m, z, owner, pulse) { if (z.hwkEye) hwkEye(m, z, owner); else sirZoneTick(m, z, owner, pulse); }
/* ===== end kit lane K7 hooks ===== */

/* ===== kit-remake G5 Saitama (kit lane K7; ~/handoff/dtt-ref/kits/MECHANICS.md group 5, AUDIT-c.md tegiac) =====
   meter `hurtPer: f`: the meter's 'hurt' gain counts one per f of max hp lost (instead of per hp point; hook in meterAdd).
   meter `perStack: f`: each point of the meter adds f to the mech's damage factor (dmgScale; the meter is synced, so the guest agrees).
   meter spend `{kind: 'mode', dur, regenLost, guard, pen}`: a full meter starts Serious Mode for dur s (stmT, in netstate STATUS):
     every second heals regenLost of the lost hp, takes guard less of every blow, is cc immune (ccT) and ignores pen of the target's
     armour; the meter stays full while it runs and is spent (0) when it ends. Events {t: 'k7', kind: 'serious', id, on: 1|0}.
   beam `fan: [half0, half1]` with `charge`: the release is a sector of the circle round the caster, half-angle and radius (charge.range)
     growing with the time held, like the charged line; the row's knock and fx ride areaDamage (nova event with skill, a, arc, f).
   hitfx `slam.lostHp: f`: a slammed mech also takes f of its lost hp as true damage from the thrower (stmLost, set with the slam). */
function smClear(u) { u.stmT = 0; u.stmLost = 0; }
const smSpend = (u) => (u.passive === 'meter' && u.def.passive.spend.kind === 'mode' ? u.def.passive.spend : null);
function k7Dmg(u) {
  const P = u.passive === 'meter' ? u.def.passive : null;
  return P && P.perStack ? 1 + P.perStack * u.meter : 1;
}
function k7Pen(foe) { const S = foe && foe.stmT > 0 ? smSpend(foe) : null; return S ? S.pen || 0 : 0; }
function k7Mode(m, u, S) {
  u.stmT = S.dur;
  if (S.guard) { u.guardF = Math.max(u.guardT > 0 ? u.guardF : 0, S.guard); u.guardT = Math.max(u.guardT, S.dur); }
  u.ccT = Math.max(u.ccT, S.dur);
  m.events.push({ t: 'k7', kind: 'serious', id: u.id, on: 1, dur: S.dur, x: u.x, z: u.z });
}
function smTick(m, u) {
  if (!(u.stmT > 0)) return;
  const S = smSpend(u);
  if (S && S.regenLost) heal(m, u, (u.maxHp - u.hp) * S.regenLost * TICK, u, true);
  u.stmT = Math.max(0, u.stmT - TICK);
  if (u.stmT > 0) return;
  if (S) meterSpent(m, u);
  m.events.push({ t: 'k7', kind: 'serious', id: u.id, on: 0, x: u.x, z: u.z });
}
function k7Fan(m, u, s, c) {
  const C = s.charge, f = Math.min(1, Math.max(0, (c.total - Math.max(0, c.t)) / c.total)), L = (p) => p[0] + (p[1] - p[0]) * f;
  const r = L(C.range), half = L(s.fan), a = c.aim;
  m.events.push({ t: 'nova', id: u.id, x: u.x, z: u.z, r, skill: s.id, a, arc: half, f });
  curSrc = s.id;
  areaDamage(m, u, u.x, u.z, r, L(C.dmg) * (c.mul || 1), s, null, { a, half });
  curSrc = null;
}
function k7SlamLost(m, u, by) {
  const f = u.stmLost;
  u.stmLost = 0;
  if (!u.alive || !by || u.def.boss) return;
  const amt = (u.maxHp - u.hp) * f;
  if (amt <= 0) return;
  const keep = curSrc;
  curSrc = null; trueHit = true; damage(m, u, amt, by); curSrc = keep;
}
/* ===== end kit-remake G5 Saitama ===== */

/* ===== kit-remake G5 Thủy Tinh (kit lane K7; ~/handoff/dtt-ref/kits/MECHANICS.md group 5, AUDIT-c.md thuytinh) =====
   stacks `fireSlow: f`: each mark of this owner on a target makes its weapon cooldown run at x (1 - f x marks) for the marks' dur
     (the G2 slowFire fields sfT/sfF, the strongest that runs wins). The stack lockout after a freeze is G3 `icd`.
   save `ice: s` (passive mods.save, fatal): the saved mech is sealed in ice for s (sirT, in netstate STATUS): it cannot walk or
     shoot (the save's invuln gives the untargetable part); any successful press breaks the ice at once (invuln and cc immunity
     end with it). Events {t: 'k7', kind: 'ice', id, on: 1|0}.
   wall `at: 'target'` (the wall stands across the aim at the cursor, within cast m) and `burst {radius, dmg, marks}` (as it forms:
     a nova event with the skill, area damage tagged with the row, and marks - 1 more stacks marks on each enemy it hurt). The wall
     zone carries src = the row id. A second stage `do: 'recall', of: <row id>` (a `next` row) removes this mech's newest wall of
     that row; none, the press does nothing.
   zone `grow: s` (the slow climbs from 0 to `slow` over the zone's first s), `ownerHps` (the owner alone heals ownerHps x 0.5 at
     every half-second pulse while it stands inside, x selfHealMul not applied: the tooltip's number is for herself), `marks: true`
     (the zone's damage pulses carry the row's source tag, so they add stacks marks and pay the row's on-hit fields). */
function sirClear(u) { u.sirT = 0; }
function sirFire(u, P) {
  const mul = Math.max(0.1, 1 - P.fireSlow * u.stkN);
  u.sfF = u.sfT > 0 ? Math.min(u.sfF, mul) : mul; u.sfT = Math.max(u.sfT, P.dur);
}
function sirIce(m, u, d) {
  u.sirT = d; u.cast = null; u.charge = 0;
  m.events.push({ t: 'k7', kind: 'ice', id: u.id, on: 1, dur: d, x: u.x, z: u.z });
}
function sirBreak(m, u) {
  u.sirT = 0; u.invulnT = 0; u.ccT = 0;
  m.events.push({ t: 'k7', kind: 'ice', id: u.id, on: 0, x: u.x, z: u.z });
}
function sirTick(m, u) {
  if (!(u.sirT > 0)) return;
  u.sirT = Math.max(0, u.sirT - TICK);
  if (u.sirT <= 0) m.events.push({ t: 'k7', kind: 'ice', id: u.id, on: 0, x: u.x, z: u.z });
}
function sirWall(m, u, s, inp) {
  const [cx, cz] = s.at ? aimPoint(u, inp, s.cast) : [u.x + Math.cos(u.aim) * s.cast, u.z + Math.sin(u.aim) * s.cast];
  const dx = Math.cos(u.aim), dz = Math.sin(u.aim), pts = [];
  for (let i = 0; i < s.n; i++) {
    const k = (i - (s.n - 1) / 2) * s.gap, x = cx - dz * k, z = cz + dx * k;
    if (!solidAt(m.map, x, z, s.r * 0.5)) pts.push([x, z]);
  }
  addZone(m, u, { kind: 'wall', x: cx, z: cz, r: s.r, pts, dur: s.dur, a: u.aim, screen: !!s.screen, src: s.id });
  const B = s.burst;
  if (!B) return;
  m.events.push({ t: 'nova', id: u.id, x: cx, z: cz, r: B.radius, skill: s.id, a: u.aim });
  curSrc = s.id;
  areaDamage(m, u, cx, cz, B.radius, B.dmg * u.skillAmp, null, null);
  if (u.passive === 'stacks' && B.marks > 1) for (const o of m.units) {
    if (o.team === u.team || !o.alive || !(o.hitBy[u.id] === m.time) || dist2(o.x, o.z, cx, cz) > (B.radius + o.radius * 0.6) ** 2) continue;
    for (let k = 1; k < B.marks && o.alive; k++) stackHit(m, u, o);
  }
  curSrc = null;
}
CAST.recall = function (m, u, s) {
  let best = null;
  for (const z of m.zones) if (z.kind === 'wall' && z.owner === u.id && z.src === s.of && (!best || z.id > best.id)) best = z;
  if (!best) return false;
  m.zones.splice(m.zones.indexOf(best), 1);
  m.events.push({ t: 'zoneEnd', id: best.id, kind: 'wall', x: best.x, z: best.z });
  m.events.push({ t: 'nova', id: u.id, x: best.x, z: best.z, r: 0, skill: s.id, a: best.a });   // for the looks: the wall falls back to her
};
function sirZone(z, s) {
  z.k7 = 1; z.sirG = s.grow || 0; z.sirS = s.slow || 0; z.sirH = s.ownerHps || 0;
  if (s.marks) z.src = s.id;
  if (z.sirG) z.slow = 0;
}
function sirZoneTick(m, z, owner, pulse) {
  if (z.sirG) z.slow = z.sirS * Math.min(1, z.age / z.sirG);
  if (pulse && z.sirH && owner.alive && dist2(owner.x, owner.z, z.x, z.z) <= z.r * z.r) heal(m, owner, z.sirH * 0.5, owner);
}
/* ===== end kit-remake G5 Thủy Tinh ===== */

/* ===== kit-remake G5 Ưng Nhãn (kit lane K7; ~/handoff/dtt-ref/kits/MECHANICS.md group 5, AUDIT-c.md ung) =====
   passive do 'hawk' {aim {hits, win, dur, vsShield}, lowSteal, mods}: `hits` weapon hits on enemies with no gap longer than `win`
     s start the Aim state for dur s (hwkAimT, in netstate STATUS; event {t: 'k7', kind: 'aim', id}): her shots then do
     x (1 + vsShield x min(0.5, the target's shield / its max hp)). lowSteal: her shots heal lowSteal x her own lost share of max hp
     of what they take (rides the lifesteal max in damage). The damage side is G4 `mods.lowHpScale`.
   zone `eye {key, dur}`: every tick an enemy stands inside, it is revealed (stealth gone, revealT dur) and carries the owner's tag
     `key` for dur s (G2 tags, so the weapon's vsTag reads it: x1.25 for her shots only).
   blink `reload: true`: the press refills the G4 magazine at once (magN 0, magT 0).
   volley `falcon {key, radius, dmg, grow, n}`: the row's own hit (its fx carries the G2 tag) resets the victim's count; each later
     weapon hit of the owner on a victim carrying the tag bursts round the victim for dmg + grow x bursts so far (area falloff,
     untagged, scaled like her damage), at most n bursts, then the tag is gone (hwkN on the victim; event {t: 'k7', kind: 'falcon'}). */
function hwkClear(u) { u.hwkAimT = 0; u.hwkC = 0; u.hwkW = 0; u.hwkN = 0; }
function hwkTick(m, u) {
  if (u.hwkAimT > 0) u.hwkAimT = Math.max(0, u.hwkAimT - TICK);
  if (u.hwkW > 0) { u.hwkW = Math.max(0, u.hwkW - TICK); if (u.hwkW <= 0) u.hwkC = 0; }
}
function k7AimMul(foe, u) {
  if (!(foe.hwkAimT > 0) || curSrc !== 'w') return 1;
  const A = foe.def.passive.aim;
  return 1 + A.vsShield * Math.min(0.5, (u.shield || 0) / u.maxHp);
}
function k7Steal(foe) {
  const P = foe.passive === 'hawk' && curSrc === 'w' ? foe.def.passive : null;
  return P && P.lowSteal ? P.lowSteal * Math.max(0, 1 - foe.hp / foe.maxHp) : 0;
}
function hwkReload(m, u) {
  if (!(u.magN > 0) && !(u.magT > 0)) return;
  u.magN = 0; u.magT = 0;
  m.events.push({ t: 'k7', kind: 'reload', id: u.id, x: u.x, z: u.z });
}
function hwkZone(z, s) { z.k7 = 1; z.hwkEye = s.eye; }
function hwkEye(m, z, owner) {
  const E = z.hwkEye;
  for (const o of m.units) {
    if (o.team === z.team || !o.alive || dist2(o.x, o.z, z.x, z.z) > z.r * z.r) continue;
    o.stealthT = 0; o.revealT = Math.max(o.revealT, E.dur);
    const k = E.key + '@' + owner.id;
    o.tags[k] = Math.max(o.tags[k] || 0, E.dur); o.tgT = Math.max(o.tgT, o.tags[k]);
  }
}
// After a hit of foe on u that landed (a tagged source): the Aim count (weapon hits), the falcon mark reset (its own row) and bursts (weapon hits).
function k7Hit(m, foe, u) {
  if (!foe.alive || !foe.def.skills) return;
  const P = foe.passive === 'hawk' ? foe.def.passive : null;
  if (P && P.aim && curSrc === 'w') {
    foe.hwkC++; foe.hwkW = P.aim.win;
    if (foe.hwkC >= P.aim.hits) { foe.hwkC = 0; foe.hwkAimT = P.aim.dur; m.events.push({ t: 'k7', kind: 'aim', id: foe.id, x: foe.x, z: foe.z }); }
  }
  const row = foe.def.skills.find((r) => r.falcon), F = row && row.falcon;
  if (!F || !u.tags) return;
  if (curSrc === row.id) { u.hwkN = 0; return; }
  const k = F.key + '@' + foe.id;
  if (curSrc !== 'w' || !(u.tags[k] > 0) || !u.alive) return;
  const n = u.hwkN || 0;
  u.hwkN = n + 1;
  if (u.hwkN >= F.n) delete u.tags[k];
  m.events.push({ t: 'k7', kind: 'falcon', id: foe.id, on: u.id, n: u.hwkN, x: u.x, z: u.z, r: F.radius });
  const keep = curSrc;
  curSrc = null; areaDamage(m, foe, u.x, u.z, F.radius, F.dmg + F.grow * n, null, null); curSrc = keep;
}
/* ===== end kit-remake G5 Ưng Nhãn ===== */
/* ===== kit lane K10 (feat/dtt-k10; ~/handoff/dtt-ref/kits/MECHANICS.md group 5, AUDIT-a.md bocap, bohung, bongua) =====
   Host-side bookkeeping only: what changes play (shotN, the burn, root, disarm) is already in netstate STATUS. */
function k10Clear(u) { u.bhT = 0; u.bnN = 0; u.bnT = 0; }
function k10Tick(m, u) {
  if (u.bnT > 0 && (u.bnT -= TICK) <= 1e-9) { u.bnT = 0; u.bnN = 0; }
  bhTick(u);
}
// -- kit-remake G5 Bọ Cạp: passive `bcSteal: f` (each burn tick she lit heals her f of the hp it took), hitfx `bcPop {dmg, per3,
//    full, disarm, root}` (her poison already on the target goes off before the hit's own poison lands: dmg x (1 + per3 x
//    floor(stacks / 3)), scaled like the row, no source tag; at `full` stacks also disarm + root; the stacks are spent; event
//    k10 {kind: 'pop', n}).
function k10BurnSteal(m, u, before) {
  const by = u.burnBy >= 0 ? m.units[u.burnBy] : null, P = by && by.def.passive;
  if (!P || !P.bcSteal || by === u || !by.alive) return;
  const took = before - Math.max(0, u.hp);
  if (took > 0) heal(m, by, took * P.bcSteal, by, true);
}
function k10Pop(m, src, o, P) {
  const n = o.burnT > 0 && o.burnBy === src.id ? o.burnN : 0;
  if (!(n > 0)) return;
  o.burnN = 0; o.burnT = 0;
  m.events.push({ t: 'k10', kind: 'pop', id: o.id, by: src.id, n, x: o.x, z: o.z });
  const keep = curSrc;
  curSrc = null; damage(m, o, P.dmg * (1 + (P.per3 || 0) * Math.floor(n / 3)) * dmgScale(src), src); curSrc = keep;
  if (!o.alive || !(P.full && n >= P.full)) return;
  if (P.disarm) applyLoc(m, src, o, { disarm: P.disarm });
  if (P.root && !(o.ccT > 0)) o.rootT = Math.max(o.rootT, P.root);
}
// -- kit-remake G5 Apocalypse: passive `bhEvery: s` + `bhPatch` (while no empowered shot waits, every s one main shot is armed
//    with bhPatch: G3 shotN, `u.bhT` counts), save `bhHot {frac, dur}` (after the G2 save, frac of max hp a second for dur:
//    healT / healRate).
function bhTick(u) {
  const P = u.def.passive;
  if (!P || !P.bhEvery || !u.alive) return;
  if (u.shotN > 0) { u.bhT = 0; return; }
  if ((u.bhT += TICK) >= P.bhEvery - 1e-9) { u.bhT = 0; shotsArm(u, { shots: 1, patch: P.bhPatch, shotsFor: 1e9 }); }
}
function k10Hot(u, H) { u.healRate = Math.max(u.healT > 0 ? u.healRate : 0, H.frac * u.maxHp); u.healT = Math.max(u.healT, H.dur); }
// -- kit-remake G5 Kirito: passive `bnPen {per, max, dur}` (each hit of a shot fired with a `bnWave` patch adds a stack, `u.bnN`,
//    all gone dur s after the last, `u.bnT`; every hit of his ignores per x stacks of the target's armour, on top of row pen), dash
//    `bnSlam {dmg, stun}` (a mech the dash carries (drag) that a wall stops takes dmg x his damage scale and the stun, once per
//    dash, no source tag; event k10 {kind: 'slam'}), nova `bnSplit: true` (each blow's damage is divided by the number of enemies
//    it reaches).
function k10Hit(foe) {
  const P = foe.def.passive;
  if (!curShot || !curShot.bn || curShot.owner !== foe.id || !P || !P.bnPen) return;
  foe.bnN = Math.min(P.bnPen.max, foe.bnN + 1); foe.bnT = P.bnPen.dur;
}
const k10Pen = (foe) => (foe && foe.bnN > 0 && foe.def.passive && foe.def.passive.bnPen ? foe.bnN * foe.def.passive.bnPen.per : 0);
function k10Slam(m, u, d, o, wx, wz) {
  const S = d.s.bnSlam;
  if (!S || !o.alive || Math.hypot(o.x - wx, o.z - wz) < 0.3) return;
  if (!d.bnSl) d.bnSl = [];
  if (d.bnSl.includes(o.id)) return;
  d.bnSl.push(o.id);
  m.events.push({ t: 'k10', kind: 'slam', id: o.id, by: u.id, x: o.x, z: o.z });
  const keep = curSrc;
  curSrc = null; damage(m, o, S.dmg * dmgScale(u), u); curSrc = keep;
  if (o.alive && S.stun && !(o.ccT > 0) && !o.def.heavy) o.stunT = Math.max(o.stunT, S.stun);
}
function k10Split(m, u, s, arc) {
  let n = 0;
  for (const o of m.units) {
    if (o.team === u.team || !o.alive) continue;
    const reach = s.radius + o.radius * 0.6, d2 = dist2(o.x, o.z, u.x, u.z);
    if (d2 <= reach * reach && inArc(o, u.x, u.z, Math.sqrt(d2), arc)) n++;
  }
  return 1 / Math.max(1, n);
}
/* ===== end kit lane K10 ===== */

/* ===== kit-remake G5 Magneto (kit lane K6, feat/dtt-k6; AUDIT-c.md samthep) ===== */
// Hooks, one line each, marked "kit-remake G5 Magneto": CAST.barrage -> mgtSeq, CAST.zone -> mgtZone, stepZones: a strike with mgtGrp
// -> mgtStrike, a field -> mgtStorm; damage (after k1Hurt) -> mgtHurt. All host-side bookkeeping (haste travels as hasteT/hasteF).
// passive `mgtHaste {haste, dur}`: every enemy a skill of his hurts (a hit with a skill source tag) gives him x haste for dur s
// (the strongest haste running wins; mechs never collide, so the clip's "no unit collision" needs nothing).
function mgtHurt(foe) {
  const F = foe.def.passive;
  if (F && F.mgtHaste && foe.alive && curSrc && curSrc !== 'w') k1Haste(foe, F.mgtHaste.dur, F.mgtHaste.haste);
}
// barrage `mgtSeq: [{delay, dmg, blast, fx, fxNew}]` + `mgtBoth: fx`: every strike falls on the cursor point (cast = reach), each at its
// own delay, damage and blast (default the row's), with the usual falloff and the row's source tag. `fxNew`: that strike's fx only
// lands on a mech no earlier strike of the press reached. `mgtBoth`: a mech hit by every damaging strike of the press gets that fx
// once (Kim Loại Oanh Tạc: { maxHp: 0.1 }). The zone event of each strike carries its delay and index k for the look.
function mgtSeq(m, u, s, inp) {
  const [cx, cz] = aimPoint(u, inp, s.cast);
  const grp = { hit: {}, seen: {}, need: s.mgtSeq.filter((q) => q.dmg > 0).length, both: s.mgtBoth || null };
  s.mgtSeq.forEach((q, k) => {
    addZone(m, u, { kind: 'strike', x: cx, z: cz, r: q.blast || s.blast, delay: q.delay, total: q.delay, dmg: (q.dmg || 0) * u.skillAmp, fx: null, src: s.id, vis: s.look, mgtGrp: grp, mgtQ: q });
    const ev = m.events[m.events.length - 1]; ev.delay = q.delay; ev.k = k;
  });
}
function mgtStrike(m, owner, z) {
  const q = z.mgtQ, G = z.mgtGrp, list = [];
  m.events.push({ t: 'explode', x: z.x, z: z.z, r: z.r, why: 'strike', vis: z.vis });
  for (const o of m.units) {
    if (o.team === owner.team || !o.alive || o.invulnT > 0) continue;
    const reach = z.r + o.radius * 0.6;
    if (dist2(o.x, o.z, z.x, z.z) <= reach * reach) list.push(o);
  }
  curSrc = z.src;
  areaDamage(m, owner, z.x, z.z, z.r, z.dmg, null, null);
  for (const o of list) {
    if (!o.alive) continue;
    if (q.fx && !(q.fxNew && G.seen[o.id])) applyFx(m, owner, o, q.fx, { cx: z.x, cz: z.z });
    G.seen[o.id] = 1;
    if (!(z.dmg > 0) || !G.both || !o.alive) continue;
    G.hit[o.id] = (G.hit[o.id] || 0) + 1;
    if (G.hit[o.id] === G.need) { m.events.push({ t: 'kit', look: z.vis, k: 'both', id: owner.id, o: o.id, x: o.x, z: o.z }); applyFx(m, owner, o, G.both); }
  }
  curSrc = null;
}
// zone `mgtStorm {n, dmg, near {r, dmg}}` (a field round the caster): n strikes spread evenly over the zone's dur (the first after half
// a step); each hits every living enemy mech on the map for dmg x the caster's damage scale, then one enemy within near.r of the
// caster (picked with m.rng() among them, in id order) for near.dmg more. Hits carry the row's source tag; events `kit` bolt / near.
function mgtZone(s, z) {
  if (!s.mgtStorm) return;
  z.mgtStorm = s.mgtStorm; z.mgtLeft = s.mgtStorm.n; z.mgtAcc = s.dur / s.mgtStorm.n / 2; z.src = s.id;
}
function mgtStorm(m, z, owner) {
  const S = z.mgtStorm, every = z.dur / S.n;
  z.mgtAcc += TICK;
  while (z.mgtAcc >= every - 1e-9 && z.mgtLeft > 0) {
    z.mgtAcc -= every; z.mgtLeft--;
    if (!owner.alive) continue;
    const sc = dmgScale(owner), near = [];
    curSrc = z.src;
    for (const o of m.units) {
      if (o.team === owner.team || !o.alive || o.invulnT > 0) continue;
      m.events.push({ t: 'kit', look: z.vis, k: 'bolt', id: owner.id, o: o.id, x: o.x, z: o.z });
      damage(m, o, S.dmg * sc, owner);
      if (o.alive && S.near && dist2(o.x, o.z, owner.x, owner.z) <= S.near.r * S.near.r) near.push(o);
    }
    if (near.length) {
      const o = near[Math.floor(m.rng() * near.length)];
      m.events.push({ t: 'kit', look: z.vis, k: 'near', id: owner.id, o: o.id, x: o.x, z: o.z });
      damage(m, o, S.near.dmg * sc, owner);
    }
    curSrc = null;
  }
}
/* ===== end kit-remake G5 Magneto ===== */

/* ===== kit-remake G5 Sơn Tinh (kit lane K6, feat/dtt-k6; AUDIT-c.md sontinh) ===== */
// Hooks, one line each, marked "kit-remake G5 Sơn Tinh": clearStatus -> sntClear, stepUnit -> sntTick (after k1Tick), applyFx ->
// sntCurse, CAST.transform -> sntLand, CAST.buff -> sntStone. sntCT is in netstate STATUS (the looks draw the curse).
// hitfx `sntCurse {dur, dmg, petrify}` (beside slow / slowDur / slowGrow, which do the slowing to a stop): dur s after it lands the
// victim takes dmg (x the caster's damage scale at the press, the row's source tag) and is petrified `petrify` s (G3 lock; cc
// immunity refuses it as usual). A curse that runs is not restarted.
function sntClear(u) { u.sntCT = 0; u.sntCB = -1; u.sntCD = 0; u.sntCP = 0; u.sntCS = null; }
function sntCurse(m, src, o, K) {
  if (!src || !src.def || o.sntCT > 0 || !o.alive) return;
  o.sntCT = K.dur; o.sntCB = src.id; o.sntCD = K.dmg * dmgScale(src); o.sntCP = K.petrify || 0; o.sntCS = curSrc;
}
function sntTick(m, u, dt) {
  if (!(u.sntCT > 0) || (u.sntCT -= dt) > 1e-9) return;
  u.sntCT = 0;
  const by = m.units[u.sntCB];
  m.events.push({ t: 'kit', look: 'stCurse', k: 'burst', id: by.id, o: u.id, x: u.x, z: u.z });
  curSrc = u.sntCS; damage(m, u, u.sntCD, by); curSrc = null;
  if (u.alive && u.sntCP) applyLoc(m, by, u, { petrify: u.sntCP });
}
// transform `sntLand {cast, short, flight, radius, dmg, fx}`: the transform starts with a leap toward the cursor (at most cast m),
// landing `short` m before it (in front of what it aims at, not on top of it, so its shots can still hit it): flight s in the air,
// then the landing hits like a leap's (falloff, fx, the row's source tag; the nova event names the row for its look).
// Pair it with the row's G1 `invuln: true` (untargetable for the flight) and `cdAfter`. The press event carries the landing tx, tz.
function sntLand(m, u, s, inp) {
  const L = s.sntLand, [cx, cz] = aimPoint(u, inp, L.cast), d = Math.hypot(cx - u.x, cz - u.z) || 1, k = Math.max(0, d - (L.short || 0)) / d;
  const tx = u.x + (cx - u.x) * k, tz = u.z + (cz - u.z) * k;
  for (let i = m.events.length - 1; i >= 0; i--) { const e = m.events[i]; if (e.t === 'skill' && e.id === u.id) { e.tx = tx; e.tz = tz; break; } }
  jump(m, u, { ...L, id: s.id, look: s.look }, tx, tz);
}
// buff `sntStone: s` (the god's onEnd row): the caster petrifies itself for s (a G3 lock: it holds still and cannot act).
const sntStone = (m, u, s) => applyLoc(m, u, u, { petrify: s.sntStone });
/* ===== end kit-remake G5 Sơn Tinh ===== */

/* ===== kit-remake G5 Tào Tháo (kit lane K6, feat/dtt-k6; AUDIT-c.md taothao) ===== */
// Hooks, one line each, marked "kit-remake G5 Tào Tháo": clearStatus -> tthClear, stepUnit -> tthTick (after k1Tick) and tthHeld (the
// input of a held mech), locked() reads tthHT, damage -> tthRedirect (top) and tthHurt (after k1Hurt), kill -> tthCredit, CAST.leap ->
// tthPick (the pick skips a held foe), CAST.zone -> tthHeal on the zone, stepZones field pulse -> the heal. tthHT is in netstate STATUS.
// passive `tthBlood {every, icd, dur, heal}`: once he has lost `every` of his max hp to enemies (counted while the icd is over), the
// blood rage runs dur s (tthBT) and the icd icd s (tthBI): meanwhile every enemy skill hit he takes heals him heal x max hp.
// zone `tthHeal: f` (Dục Huyết Kiêu Hùng): each enemy a pulse of the field hurts heals the owner f of his max hp.
// leap `tthHold {dur, every, dmg, redirect, also}` (with to: 'foe'): the pick skips a foe someone already holds. At the press the row of
// slot `also` goes off for free (no cooldown; its press event says then: 1). When the leap lands he and the foe are held dur s
// (tthHT on both; tthHO = 1 on the holder; tthHW the other's id): neither moves, shoots or casts (tthHeld; locked() is true, so bots
// and the guest's prediction stand still); every `every` s the holder deals dmg x his damage scale to it (the row's source tag);
// `redirect` of every blow the holder takes (not raw, not his own) goes to the held foe instead, as the holder's hit; and the held
// foe's death is the holder's kill (tthCredit). A foe more than 6 m off at the landing, a dead foe or a dead holder ends it.
function tthClear(u) { u.tthHT = 0; u.tthHW = -1; u.tthHO = 0; u.tthHA = 0; u.tthHP = -1; u.tthRow = null; u.tthBT = 0; u.tthBA = 0; u.tthBI = 0; }
function tthRelease(u) { u.tthHT = 0; u.tthHW = -1; u.tthHO = 0; u.tthHA = 0; }
const tthHeld = (u) => ({ ...NO_INPUT, aim: u.aim, tx: u.x, tz: u.z });
function tthTick(m, u, dt) {
  if (u.tthBT > 0) u.tthBT = Math.max(0, u.tthBT - dt);
  if (u.tthBI > 0) u.tthBI = Math.max(0, u.tthBI - dt);
  if (u.tthHP >= 0 && !u.dash) tthStart(m, u);
  if (!(u.tthHT > 0)) return;
  const o = m.units[u.tthHW];
  if (!u.tthHO) { if (!o || !o.alive || o.tthHW !== u.id || !(o.tthHT > 0)) tthRelease(u); return; }
  if (!o || !o.alive || o.tthHW !== u.id) { tthRelease(u); return; }
  const H = u.tthRow.tthHold;
  u.tthHT = Math.max(0, u.tthHT - dt); o.tthHT = u.tthHT; u.tthHA += dt;
  while (u.tthHA >= H.every - 1e-9 && o.alive) {
    u.tthHA -= H.every;
    curSrc = u.tthRow.id; damage(m, o, H.dmg * dmgScale(u), u); curSrc = null;
  }
  if (!(u.tthHT > 0) || !o.alive) { tthRelease(u); if (o.tthHW === u.id) tthRelease(o); }
}
function tthPick(m, u, s, o, inp) {
  u.tthHP = o.id; u.tthRow = s;
  const i = s.tthHold.also, r = i >= 0 ? u.def.skills[i] : null;
  if (!r) return;
  m.events.push({ t: 'skill', id: u.id, slot: i, skill: r.id, x: u.x, z: u.z, a: u.aim, then: 1 });
  if (CAST[r.do](m, u, r, inp) !== false && r.self && r.self.on !== 'hit') selfBuff(u, r.self);
}
function tthStart(m, u) {
  const o = m.units[u.tthHP], H = u.tthRow && u.tthRow.tthHold;
  u.tthHP = -1;
  if (!H || !u.alive || !o.alive || o.tthHT > 0 || dist2(o.x, o.z, u.x, u.z) > 36) return;
  u.tthHT = o.tthHT = H.dur; u.tthHO = 1; o.tthHO = 0; u.tthHW = o.id; o.tthHW = u.id; u.tthHA = 0;
  for (const w of [u, o]) { w.cast = null; w.charge = 0; if (!(w.dash && w.dash.fly)) w.dash = null; w.flurry = null; }
  m.events.push({ t: 'kit', look: u.tthRow.look, k: 'hold', id: u.id, o: o.id, dur: H.dur, x: o.x, z: o.z });
}
function tthRedirect(m, u, amount) {
  const o = m.units[u.tthHW], f = u.tthRow ? u.tthRow.tthHold.redirect : 0;
  if (!o || !o.alive || !f) return amount;
  const keep = curSrc;
  curSrc = null; damage(m, o, amount * f, u); curSrc = keep;
  return amount * (1 - f);
}
function tthCredit(m, u, src) {
  if (!(u.tthHT > 0) || u.tthHO) return src;
  const h = m.units[u.tthHW];
  return h && h.alive && h.team !== u.team && (!src || src === u || src.team === h.team) ? h : src;
}
function tthHurt(m, u, amt) {
  const P = u.def.passive, B = P && P.tthBlood;
  if (!B || !u.alive) return;
  if (u.tthBT > 0 && curSrc !== 'w') heal(m, u, u.maxHp * B.heal, u);
  if (u.tthBI > 0) return;
  u.tthBA += amt;
  if (u.tthBA < B.every * u.maxHp - 1e-9) return;
  u.tthBA = 0; u.tthBI = B.icd; u.tthBT = B.dur;
  m.events.push({ t: 'kit', look: P.look, k: 'blood', id: u.id, x: u.x, z: u.z });
}
/* ===== end kit-remake G5 Tào Tháo ===== */

/* ===== kit lane K13 (G5 one-tank mechanics: Đom Đóm, Dương Tiễn, Kaneki; ~/handoff/dtt-ref/kits/AUDIT-a.md, MECHANICS.md
   "Group 5"). Hooks elsewhere are one line each, marked "kit lane K13", and call into this block: clearStatus -> k13Clear,
   stepUnit -> k13Tick (after k1Tick) and k13Cast (every press that went through, second stages too), damage -> k13Hit (after
   k1Hurt), applyFx -> k13Eye. New unit state carries a prefix per tank: dd (domdom), dt (duongtien), kn (mucma). ===== */
function k13Clear(u) {
  u.ddEN = 0; u.ddET = 0; u.ddEBy = -1; u.ddHsT = 0; u.ddHsF = 0;
  u.ddYN = 0; u.ddYT = 0; u.ddYBy = -1; u.ddYF = null; u.ddTpN = 0; u.ddTpT = 0; u.ddTpS = null;
}
// Returns true when the mech died this tick (a wind-eye tick), so stepUnit stops there like it does after a burn.
function k13Tick(m, u, dt) {
  if (u.ddET > 0 && (u.ddET -= dt) <= 1e-9) { u.ddET = 0; u.ddEN = 0; }
  // song haste: +haste fading to nothing over fade s, as long as the haste running is still this one
  if (u.ddHsT > 0) {
    u.ddHsT = Math.max(0, u.ddHsT - dt);
    const S = u.def.passive.song;
    if (u.hasteT > 0 && u.hasteF === u.ddHsF) u.hasteF = u.ddHsF = 1 + S.haste * u.ddHsT / S.fade;
  }
  if (u.ddTpN > 0 && (u.ddTpT -= dt) <= 1e-9) ddPulse(m, u);
  if (u.ddYN > 0 && (u.ddYT -= dt) <= 1e-9) {
    const F = u.ddYF, by = m.units[u.ddYBy], keep = curSrc;
    u.ddYN--; u.ddYT = F.every;
    m.events.push({ t: 'k13', kind: 'eye', id: u.id, by: by.id, x: u.x, z: u.z });
    curSrc = null; applyFx(m, by, u, { lostHp: F.lostHp, slow: F.slow, slowDur: F.slowDur }); curSrc = keep;
    if (!u.alive) return true;
  }
  return false;
}
// Every press that went through (second stages too).
function k13Cast(m, u, s) {
  const P = u.def.passive;
  if (P && P.do === 'ddWind') ddSong(m, u, P.song);
  if (s.ddTemple) { u.ddTpS = s.ddTemple; u.ddTpN = s.ddTemple.n; u.ddTpT = s.ddTemple.delay; }
}
// u (the victim) has just been hurt by foe through a hit with a source tag curSrc ('w' the weapon).
function k13Hit(m, foe, u) {
  const P = foe.def.passive;
  if (!P || !u.alive || reflecting || !curSrc) return;
  if (P.do === 'ddWind' && curSrc !== 'w') ddErode(m, foe, u);
}
// hitfx ddEye {every, n, lostHp, slow, slowDur}: the victim takes the tick every `every` s, n times (a new eye restarts it)
function k13Eye(src, o, F) {
  o.ddYF = F; o.ddYN = F.n; o.ddYT = F.every; o.ddYBy = src.id;
}

// ---- Đom Đóm (domdom), passive ddWind {erode {per, max, dur}, song {r, block, haste, fade}} ----
// Phong Thực: one stack per skill hit (max), each per x slow, weaken and antiheal for dur s; stacks are per victim, the last
// Đom Đóm to hit owns them (another one starts at 1).
function ddErode(m, foe, u) {
  const E = foe.def.passive.erode;
  u.ddEN = u.ddET > 0 && u.ddEBy === foe.id ? Math.min(E.max, u.ddEN + 1) : 1;
  u.ddEBy = foe.id; u.ddET = E.dur;
  const f = E.per * u.ddEN, keep = curSrc;
  curSrc = null;
  applyFx(m, foe, u, { slow: f, slowDur: E.dur, weaken: { mul: 1 - f, dur: E.dur }, antiheal: { mul: 1 - f, dur: E.dur } });
  curSrc = keep;
}
// The K1 bubble (bubT: every enemy shot that reaches it ends without damage) for t s; a running bubble keeps its own cc factor.
function ddWrap(o, t) {
  if (!(o.bubT > 0)) { o.bubCc = 1; o.bubPrev = [o.stunT, o.slowT, o.rootT]; }
  o.bubT = Math.max(o.bubT, t);
}
// Phong Vãn Chi Ca: every press wraps her and the allies within r, and gives her the fading haste
function ddSong(m, u, S) {
  for (const o of m.units) if (o.alive && o.team === u.team && dist2(o.x, o.z, u.x, u.z) <= S.r * S.r) ddWrap(o, S.block);
  const f = 1 + S.haste;
  if (!(u.hasteT > 0) || u.hasteF <= f) { u.hasteF = u.ddHsF = f; u.hasteT = Math.max(u.hasteT, S.fade); u.ddHsT = S.fade; }
  m.events.push({ t: 'k13', kind: 'song', id: u.id, x: u.x, z: u.z, r: S.r });
}
// Phong Nha Thần Điện: one pulse round the caster. k = 0 for the first (x first).
function ddPulse(m, u) {
  const T = u.ddTpS, k = T.n - u.ddTpN, mul = k === 0 ? T.first : 1, keep = curSrc;
  u.ddTpN--; u.ddTpT = T.every;
  m.events.push({ t: 'k13', kind: 'temple', id: u.id, k, x: u.x, z: u.z, r: T.r });
  const fire = 1 - Math.min(T.max, T.step * (k + 1));
  for (const o of m.units) {
    if (!o.alive || dist2(o.x, o.z, u.x, u.z) > T.r * T.r) continue;
    if (o.team === u.team) { cleanse(o); ddWrap(o, T.block); heal(m, o, u.maxHp * T.heal * mul, u); continue; }
    if (o.invulnT > 0) continue;
    curSrc = null;
    applyFx(m, u, o, { yank: { dist: T.pull, to: 'caster' }, slowStack: { step: T.step, max: T.max }, slowDur: T.dur, slowFire: { mul: fire, dur: T.dur }, lostHp: T.lostHp * mul });
    if (o.alive) ddErode(m, u, o);
  }
  curSrc = keep;
}

/* ===== end kit lane K13 ===== */
