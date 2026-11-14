// The match simulation. Pure and deterministic: fixed 30 Hz ticks, one seeded RNG, no three.js, no DOM.
// The same code runs in the browser, in Node tests, and (later) on the host of an online room.
//
//   const m = createMatch({ map, seed, roster, mode });   roster: [{ team, mech, name, bot, diff }]   mode: a MODES key (default tdm)
//   step(m, inputs);                                inputs[unit.id] = { mx, mz, aim, fire, s1, s2, ult, heal, tx, tz }
//   m.events                                        what happened during the last tick, for effects, sound and HUD
//
// Angles are radians in the XZ plane: direction = (cos a, sin a).

import { TICK, RULES, PICKUPS, MECHS, PROPS, MODES, BOSSES } from './data.js';
import { mulberry } from './rng.js';
import { compileMap, mapsFor, castStatic, segCircle, solidAt, navBlock } from './maps.js';

const NO_INPUT = { mx: 0, mz: 0, aim: 0, fire: false, s1: false, s2: false, ult: false, heal: false, tx: 0, tz: 0 };
const SLOTS = ['s1', 's2', 'ult'];

export function createMatch(opts) {
  const mode = MODES[opts.mode] ? opts.mode : 'tdm', rule = MODES[mode], pool = mapsFor(mode);
  const map = compileMap(pool.includes(opts.map) ? opts.map : pool[0], opts.theme);
  const m = {
    mode, rule, lives: rule.lives || 0, points: [], towers: [],
    map, seed: opts.seed >>> 0, rng: mulberry(opts.seed >>> 0), tick: 0, time: 0,
    target: opts.target || rule.target, duration: opts.duration || rule.duration,
    units: [], shots: [], zones: [], crates: [], events: [],
    props: map.props.map((p) => ({ id: p.id, x: p.x, z: p.z, kind: p.kind, r: PROPS[p.kind].r, hp: PROPS[p.kind].hp, alive: true })),
    score: [0, 0], over: false, winner: -1, nextId: 1, crateT: RULES.crate.first,
    vents: map.hazards.filter((h) => h.kind === 'vent').map((h, i) => ({ id: h.id, x: h.x, z: h.z, r: h.r, t: RULES.vent.period * (0.5 + 0.5 * (i % 2)), warn: false })),
  };
  const slot = [0, 0];
  for (const r of opts.roster) {
    const def = MECHS[r.mech] || BOSSES[r.mech];
    // In free-for-all every unit is its own team; `color` is the palette index the renderer uses (0 = ally look, 1 = enemy look).
    const team = mode === 'tudo' ? m.units.length : r.team;
    const mods = r.mods || {};
    const u = {
      id: m.units.length, team, color: mode === 'tudo' ? 1 : r.team, mech: r.mech, def, name: r.name, bot: !!r.bot, diff: r.diff || 'normal',
      slot: mode === 'tudo' ? m.units.length : slot[r.team]++, paint: r.paint || null, radius: def.radius, moveRadius: def.boss ? def.radius : RULES.moveRadius, maxHp: Math.round(def.hp * (mods.hp || 1)), dmgMod: mods.dmg || 1,
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

export function unitSpeed(u) {
  let s = u.def.speed;
  if (u.hasteT > 0) s *= u.hasteF;
  if (u.slowT > 0) s *= 1 - u.slowF;
  if (u.cast) s *= u.cast.move;
  return s;
}

export function gripAt(map, x, z) {
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
  const k = Math.min(1, grip * TICK);
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

  for (const k in u.cd) if (u.cd[k] > 0) u.cd[k] = Math.max(0, u.cd[k] - dt * (k === 'fire' && u.rapidT > 0 ? u.rapidF : 1));
  for (const k of ['slowT', 'stunT', 'hasteT', 'rapidT', 'dmgT', 'stealthT', 'invulnT', 'revealT']) if (u[k] > 0) u[k] = Math.max(0, u[k] - dt);
  if (u.shieldT > 0) { u.shieldT -= dt; if (u.shieldT <= 0) { u.shield = 0; u.shieldT = 0; } }
  u.combatT += dt;
  u.bush = bushAt(m.map, u.x, u.z);
  if (u.bush < 0) for (const z of m.zones) if (z.hide && dist2(u.x, u.z, z.x, z.z) < z.r * z.r) { u.bush = 1000 + z.id; break; }

  if (m.mode !== 'tudo' && !u.def.boss) {
    const own = m.map.bases[u.team], foe = m.map.bases[1 - u.team], br = RULES.baseRadius;
    if (dist2(u.x, u.z, own[0], own[1]) < br * br) { if (u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * RULES.baseRegen * dt); }
    else if (m.mode !== 'trum' && m.mode !== 'nha' && dist2(u.x, u.z, foe[0], foe[1]) < br * br) { burn(m, u, RULES.baseBurn * dt); if (!u.alive) return; }
  }
  const grip = gripAt(m.map, u.x, u.z);
  for (const h of m.map.hazards) {
    if (h.kind === 'vent' || h.kind === 'ice' || dist2(u.x, u.z, h.x, h.z) > h.r * h.r) continue;
    if (h.kind === 'mud') { if (!u.def.hover && !u.def.heavy) { u.slowT = Math.max(u.slowT, 0.2); u.slowF = Math.max(u.slowT > 0.2 ? u.slowF : 0, RULES.mud.slow); } }
    else { burn(m, u, RULES.lava.dps * dt); if (!u.alive) return; }
  }
  if (!u.def.boss && u.combatT > RULES.regenDelay && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * RULES.regen * dt);
  if (u.healT > 0) { u.healT -= dt; heal(m, u, u.healRate * dt, u, true); }

  if (u.def.heavy) { u.stunT = 0; u.kx = 0; u.kz = 0; }
  const stunned = u.stunT > 0;
  if (stunned) { inp = NO_INPUT; u.cast = null; }
  else u.aim = u.cast && u.cast.lock ? u.cast.aim : inp.aim;

  if (u.cast) {
    u.cast.t -= dt;
    if (u.cast.t <= 0) { const c = u.cast; u.cast = null; FINISH[c.skill.do](m, u, c.skill, c); }
  }

  if (u.dash) stepDash(m, u);
  else walk(m, u, inp, grip);
  u.kx *= 0.8; u.kz *= 0.8;
  if (stunned || !u.alive) return;

  if (inp.heal && u.cd.heal <= 0 && u.hp < u.maxHp) {
    u.cd.heal = RULES.healItem.cd; u.healT = RULES.healItem.dur; u.healRate = u.maxHp * RULES.healItem.frac / RULES.healItem.dur;
    m.events.push({ t: 'item', id: u.id });
  }
  if (u.cast || u.dash) return;
  for (let i = 0; i < 3; i++) {
    const key = SLOTS[i];
    if (!inp[key] || u.cd[key] > 0) continue;
    const s = u.def.skills[i];
    u.cd[key] = s.cd; u.stealthT = 0; u.revealT = RULES.revealOnFire;
    m.events.push({ t: 'skill', id: u.id, slot: i, skill: s.id, x: u.x, z: u.z, a: u.aim });
    CAST[s.do](m, u, s, inp);
    return;
  }
  if (inp.fire && u.cd.fire <= 0) fireWeapon(m, u, inp);
}

function fireWeapon(m, u, inp) {
  const w = u.def.weapon;
  u.cd.fire = w.cd; u.stealthT = 0; u.revealT = RULES.revealOnFire;
  if (w.lob) {
    // A lobbed shell is a delayed strike at the aim point: it flies over walls and everyone sees where it lands.
    const [x, z] = aimPoint(u, inp, w.range);
    addZone(m, u, { kind: 'strike', lob: true, x0: u.x, z0: u.z, x, z, r: w.splash, delay: w.flight, total: w.flight, dmg: w.dmg });
    m.events.push({ t: 'fire', id: u.id, vis: w.vis, x: u.x, z: u.z, a: u.aim, side: 0 });
    return;
  }
  const n = w.n || 1;
  let side = 0;
  if (w.alt) { u.barrel ^= 1; side = u.barrel ? w.alt : -w.alt; }
  const base = u.aim + (w.spread ? (m.rng() - 0.5) * 2 * w.spread : 0);
  for (let i = 0; i < n; i++) spawnShot(m, u, w, base + (i - (n - 1) / 2) * (w.fan || 0), side);
  m.events.push({ t: 'fire', id: u.id, vis: w.vis, x: u.x, z: u.z, a: base, side });
}

function spawnShot(m, u, w, a, side) {
  const dx = Math.cos(a), dz = Math.sin(a), off = u.radius + 0.25;
  let x = u.x + dx * off - dz * side, z = u.z + dz * off + dx * side;
  // A muzzle poking through a wall must not fire from the far side.
  if (castStatic(m.map, u.x, u.z, x, z, w.r) <= 1) { x = u.x; z = u.z; }
  m.shots.push({
    id: m.nextId++, team: u.team, owner: u.id, x, z, px: x, pz: z, dx, dz, speed: w.speed, left: w.range,
    color: u.color, dmg: w.dmg * u.dmgMod * (u.dmgT > 0 ? u.dmgF : 1), splash: w.splash || 0, knock: w.knock || 0, slow: w.slow || 0, slowDur: w.slowDur || 0, r: w.r, vis: w.vis,
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
  shield(m, u, s) { u.shield = Math.max(u.shield, s.amount); u.shieldMax = u.shield; u.shieldT = s.dur; },
  dash(m, u, s) { u.dash = { dx: Math.cos(u.aim), dz: Math.sin(u.aim), left: s.dist, speed: s.speed, s, hit: [] }; },
  blink(m, u, s, inp) {
    let dx = inp.mx, dz = inp.mz;
    const len = Math.hypot(dx, dz);
    if (len > 0.2) { dx /= len; dz /= len; } else { dx = -Math.cos(u.aim); dz = -Math.sin(u.aim); }
    u.dash = { dx, dz, left: s.dist, speed: s.speed, s, hit: [] };
    u.stealthT = s.stealth + s.dist / s.speed; u.revealT = 0;
  },
  nova(m, u, s) { u.cast = { skill: s, t: s.windup, total: s.windup, move: s.move ?? 0.35, lock: false, aim: u.aim, left: s.repeat || 1 }; },
  beam(m, u, s) { u.cast = { skill: s, t: s.windup, total: s.windup, move: 0.12, lock: true, aim: u.aim }; },
  volley(m, u, s) {
    for (let i = 0; i < s.n; i++) spawnShot(m, u, s, u.aim + (i - (s.n - 1) / 2) * s.fan, 0);
    m.events.push({ t: 'fire', id: u.id, vis: s.vis, x: u.x, z: u.z, a: u.aim, side: 0 });
  },
  buff(m, u, s) {
    if (s.haste) { u.hasteT = s.dur; u.hasteF = s.haste; }
    if (s.rapid) { u.rapidT = s.dur; u.rapidF = s.rapid; }
    if (s.stealth) { u.stealthT = s.stealth; u.revealT = 0; }
  },
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
    addZone(m, u, { kind: 'wall', x: cx, z: cz, r: s.r, pts, dur: s.dur, a: u.aim });
  },
  turret(m, u, s, inp) {
    let [x, z] = aimPoint(u, inp, s.cast);
    if (solidAt(m.map, x, z, 0.8)) { x = u.x; z = u.z; }
    addZone(m, u, { kind: 'turret', x, z, r: 0.8, hp: s.hp, maxHp: s.hp, dur: s.dur, range: s.range, dmg: s.dmg, rate: s.rate, cd: 0.6, aim: u.aim });
  },
  minefield(m, u, s, inp) {
    const [cx, cz] = aimPoint(u, inp, s.cast);
    for (let i = 0; i < s.n; i++) {
      const a = (i / s.n) * 6.283 + m.rng(), d = i ? s.radius * 0.7 : 0;
      addZone(m, u, { kind: 'mine', x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d, r: s.trigger, blast: s.blast, delay: s.arm, dur: s.life, dmg: s.dmg, stun: s.stun });
    }
  },
  barrage(m, u, s, inp) {
    const [cx, cz] = aimPoint(u, inp, s.cast);
    const ux = Math.cos(u.aim), uz = Math.sin(u.aim);
    for (let i = 0; i < s.n; i++) {
      // line: strikes march from the aim point along the aim direction; otherwise they scatter in a disc.
      const a = s.line ? 0 : m.rng() * 6.283, d = s.line ? 0 : (i ? Math.sqrt(m.rng()) * (s.radius - s.blast * 0.5) : 0);
      const lx = s.line ? ux * s.gap * (i - (s.n - 1) / 2) : 0, lz = s.line ? uz * s.gap * (i - (s.n - 1) / 2) : 0;
      addZone(m, u, { kind: 'strike', x: cx + lx + Math.cos(a) * d, z: cz + lz + Math.sin(a) * d, r: s.blast, delay: s.delay + (i / s.n) * s.span, total: s.delay + (i / s.n) * s.span, dmg: s.dmg });
    }
  },
  mine(m, u, s, inp) {
    const [x, z] = aimPoint(u, inp, s.cast);
    addZone(m, u, { kind: 'mine', x, z, r: s.trigger, blast: s.blast, delay: s.arm, dur: s.life, dmg: s.dmg, stun: s.stun });
  },
  zone(m, u, s, inp) {
    const [x, z] = s.at === 'self' ? [u.x, u.z] : aimPoint(u, inp, s.cast);
    addZone(m, u, { kind: 'field', vis: s.vis, x, z, r: s.radius, dur: s.dur, hps: s.hps || 0, dps: s.dps || 0, slow: s.slow || 0, hide: !!s.hide, pull: s.pull || 0, acc: 0 });
  },
  dome(m, u, s) {
    addZone(m, u, { kind: 'dome', x: u.x, z: u.z, r: s.radius, dur: s.dur });
    for (const o of m.units) {
      if (o.team !== u.team || !o.alive || dist2(o.x, o.z, u.x, u.z) > s.radius * s.radius) continue;
      heal(m, o, s.heal, u);
      o.shield = Math.max(o.shield, s.shield); o.shieldMax = o.shield; o.shieldT = s.dur;
    }
  },
};

// What a wind-up skill does when the wind-up completes.
const FINISH = {
  nova(m, u, s, c) {
    m.events.push({ t: 'nova', id: u.id, x: u.x, z: u.z, r: s.radius });
    areaDamage(m, u, u.x, u.z, s.radius, s.dmg, s, null);
    if (c.left > 1 && u.alive) u.cast = { ...c, t: s.gap, total: s.gap, left: c.left - 1 };
  },
  beam(m, u, s, c) {
    const dx = Math.cos(c.aim), dz = Math.sin(c.aim);
    const t = Math.min(1, castStatic(m.map, u.x, u.z, u.x + dx * s.range, u.z + dz * s.range, 0.2));
    const len = s.range * t, x1 = u.x + dx * len, z1 = u.z + dz * len;
    const dmg = s.dmg * u.dmgMod * (u.dmgT > 0 ? u.dmgF : 1);
    for (const o of m.units) {
      if (o.team === u.team || !o.alive) continue;
      const along = (o.x - u.x) * dx + (o.z - u.z) * dz;
      if (along < 0 || along > len + o.radius) continue;
      const side = Math.abs((o.x - u.x) * dz - (o.z - u.z) * dx);
      if (side < s.width / 2 + o.radius) damage(m, o, dmg, u);
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
  },
};

function stepDash(m, u) {
  const d = u.dash, s = d.s;
  const stepLen = Math.min(d.left, d.speed * TICK);
  const bx = u.x, bz = u.z;
  moveUnit(m, u, d.dx * stepLen, d.dz * stepLen);
  const moved = Math.hypot(u.x - bx, u.z - bz);
  d.left -= stepLen;
  u.heading = Math.atan2(d.dz, d.dx);
  if (s.dmg) for (const o of m.units) {
    if (o.team === u.team || !o.alive || d.hit.includes(o.id)) continue;
    const rr = u.radius + o.radius + 0.35;
    if (dist2(o.x, o.z, u.x, u.z) > rr * rr) continue;
    d.hit.push(o.id);
    damage(m, o, s.dmg * u.dmgMod * (u.dmgT > 0 ? u.dmgF : 1), u);
    if (o.alive) { o.stunT = Math.max(o.stunT, s.stun); o.kx += d.dx * s.knock * 4; o.kz += d.dz * s.knock * 4; }
    m.events.push({ t: 'ram', id: u.id, x: o.x, z: o.z });
  }
  if (d.left <= 0.01 || moved < stepLen * 0.4) { u.dash = null; u.vx = d.dx * 2; u.vz = d.dz * 2; }
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
      for (const z of m.zones) if (z.kind === 'wall') for (const q of z.pts) pushOut(u, q[0], q[1], z.r + r, sx, sz);
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

function stepShots(m) {
  const map = m.map;
  for (let i = m.shots.length - 1; i >= 0; i--) {
    const s = m.shots[i];
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
        for (const q of z.pts) { const t = segCircle(s.x, s.z, ex, ez, q[0], q[1], z.r + s.r); if (t < best) { best = t; what = 'wall'; hitProp = null; hitZone = null; } }
      } else if (z.kind === 'turret' && z.team !== s.team) {
        const t = segCircle(s.x, s.z, ex, ez, z.x, z.z, z.r + s.r);
        if (t < best) { best = t; what = 'turret'; hitProp = null; hitZone = z; }
      } else if (z.kind === 'dome' && z.team !== s.team && dist2(s.x, s.z, z.x, z.z) >= z.r * z.r) {
        const t = segCircle(s.x, s.z, ex, ez, z.x, z.z, z.r);
        if (t < best) { best = t; what = 'dome'; hitProp = null; hitZone = null; }
      }
    }
    for (const u of m.units) {
      if (u.team === s.team || !u.alive) continue;
      const t = segCircle(s.x, s.z, ex, ez, u.x, u.z, u.radius + s.r);
      if (t < best) { best = t; what = 'unit'; hitUnit = u; hitProp = null; hitTower = null; }
    }
    if (best > 1) {
      s.x += ex; s.z += ez; s.left -= len;
      if (s.left > 1e-4) continue;
      what = 'end';
    } else { s.x += ex * best; s.z += ez * best; }
    const owner = s.owner >= 0 ? m.units[s.owner] : null;
    if (what === 'tower') hurtTower(m, hitTower, s.dmg, owner);
    else if (what === 'unit') {
      damage(m, hitUnit, s.dmg, owner);
      if (s.knock && hitUnit.alive) { hitUnit.kx += s.dx * s.knock * 3; hitUnit.kz += s.dz * s.knock * 3; }
      if (s.slow && hitUnit.alive) { hitUnit.slowT = Math.max(hitUnit.slowT, s.slowDur); hitUnit.slowF = Math.max(hitUnit.slowF, s.slow); }
    } else if (what === 'prop') damageProp(m, hitProp, s.dmg, owner);
    else if (what === 'turret') hitZone.hp -= s.dmg;
    if (s.splash && what !== 'dome' && owner) areaDamage(m, owner, s.x, s.z, s.splash, s.dmg * 0.6, null, hitUnit);
    m.events.push({ t: 'impact', vis: s.vis, on: what, x: s.x, z: s.z, dx: s.dx, dz: s.dz, splash: s.splash });
    m.shots.splice(i, 1);
  }
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
      if (z.delay <= 0) { explode(m, owner, z.x, z.z, z.r, z.dmg, null, 'strike'); done = true; }
    } else if (z.kind === 'mine') {
      if (z.delay > 0) z.delay -= dt;
      else {
        for (const u of m.units) {
          if (u.team === z.team || !u.alive) continue;
          const rr = z.r + u.radius * 0.5;
          if (dist2(u.x, u.z, z.x, z.z) < rr * rr) { explode(m, owner, z.x, z.z, z.blast, z.dmg, { stun: z.stun }, 'mine'); done = true; break; }
        }
      }
      if (z.age > z.dur) done = true;
    } else if (z.kind === 'field') {
      z.acc += dt;
      const pulse = z.acc >= 0.5;
      if (pulse) z.acc -= 0.5;
      for (const u of m.units) {
        if (!u.alive || dist2(u.x, u.z, z.x, z.z) > z.r * z.r) continue;
        if (u.team === z.team) { if (z.hps && pulse) heal(m, u, z.hps * 0.5, owner); }
        else {
          if (z.pull && !u.def.heavy) { const d = Math.sqrt(dist2(u.x, u.z, z.x, z.z)); if (d > 0.6) moveUnit(m, u, (z.x - u.x) / d * z.pull * dt, (z.z - u.z) / d * z.pull * dt); }
          if (z.slow) { u.slowT = Math.max(u.slowT, 0.3); u.slowF = Math.max(u.slowT > 0.3 ? u.slowF : 0, z.slow); }
          if (z.dps && pulse) damage(m, u, z.dps * 0.5, owner);
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
    } else if (z.age > z.dur) done = true;
    if (done) { m.zones.splice(i, 1); m.events.push({ t: 'zoneEnd', id: z.id, kind: z.kind, x: z.x, z: z.z }); }
  }
}

function explode(m, src, x, z, r, dmg, fx, why) {
  m.events.push({ t: 'explode', x, z, r, why });
  areaDamage(m, src, x, z, r, dmg, fx, null);
}

// Damage with falloff (100% at the centre, 50% at the rim) to enemies of src and to props. fx may carry slow, slowDur, stun, knock.
function areaDamage(m, src, x, z, r, dmg, fx, skip) {
  const scale = src.dmgMod * (src.dmgT > 0 ? src.dmgF : 1);
  for (const u of m.units) {
    if (u.team === src.team || !u.alive || u === skip) continue;
    const reach = r + u.radius * 0.6, d2 = dist2(u.x, u.z, x, z);
    if (d2 > reach * reach) continue;
    const d = Math.sqrt(d2);
    damage(m, u, dmg * scale * (1 - 0.5 * Math.min(1, d / r)), src);
    if (!u.alive || !fx) continue;
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

function damageProp(m, p, amount, src) {
  if (!p.alive) return;
  p.hp -= amount;
  m.events.push({ t: 'propHit', id: p.id, x: p.x, z: p.z });
  if (p.hp > 0) return;
  p.alive = false;
  m.events.push({ t: 'propBreak', id: p.id, kind: p.kind, x: p.x, z: p.z });
  const b = PROPS[p.kind].blast;
  if (b) explode(m, src, p.x, p.z, b.radius, b.dmg / (src.dmgMod * (src.dmgT > 0 ? src.dmgF : 1)), { knock: b.knock }, 'barrel');
}

function damage(m, u, amount, src) {
  if (!u.alive || u.invulnT > 0 || amount <= 0) return;
  let left = amount, absorbed = 0;
  if (u.shield > 0) {
    absorbed = Math.min(u.shield, left); u.shield -= absorbed; left -= absorbed;
    if (u.shield <= 0) { u.shieldT = 0; m.events.push({ t: 'shieldBreak', id: u.id, x: u.x, z: u.z }); }
  }
  u.hp -= left; u.combatT = 0;
  if (src && src !== u) { src.dmg += left; u.hitBy[src.id] = m.time; src.hurtAllyAt = m.time; src.combatT = Math.min(src.combatT, RULES.regenDelay - 3); }
  m.events.push({ t: 'hit', id: u.id, by: src ? src.id : -1, x: u.x, z: u.z, amt: left, absorbed });
  if (u.hp <= 0) kill(m, u, src);
}

function burn(m, u, amount) {
  u.invulnT = 0;
  // Only a recent attacker gets credit for a death by lava, vent or base fire.
  const last = Object.keys(u.hitBy).map(Number).filter((k) => m.time - u.hitBy[k] <= RULES.assistWindow).sort((a, b) => u.hitBy[b] - u.hitBy[a])[0];
  damage(m, u, amount, last === undefined ? null : m.units[last]);
}

function heal(m, u, amount, src, quiet) {
  if (!u.alive) return;
  const got = Math.min(u.maxHp - u.hp, amount);
  if (got <= 0) return;
  u.hp += got;
  if (src) src.healed += got;
  if (!quiet && got >= 1) m.events.push({ t: 'heal', id: u.id, x: u.x, z: u.z, amt: got });
}

function kill(m, u, src) {
  const R = m.rule.respawn;
  u.hp = 0; u.alive = false; u.deaths++; u.respawnT = R ? Math.min(R.max, R.base + R.perMin * m.time / 60) : RULES.respawn;
  const assists = [];
  let by = -1;
  if (src && src.team !== u.team) {
    by = src.id; src.kills++;
    if (m.mode === 'tdm' || m.mode === 'tudo') m.score[src.team]++;
    for (const k in u.hitBy) {
      const o = m.units[k];
      if (o !== src && o.team !== u.team && m.time - u.hitBy[k] <= RULES.assistWindow) { o.assists++; assists.push(o.id); }
    }
  } else if (m.mode === 'tdm') m.score[1 - u.team]++;
  if (m.mode === 'trum') { if (u.def.boss) u.respawnT = 1e9; else m.lives--; }
  m.events.push({ t: 'death', id: u.id, by, assists, x: u.x, z: u.z });
  clearStatus(u);
}

function stepCrates(m) {
  const C = RULES.crate;
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
