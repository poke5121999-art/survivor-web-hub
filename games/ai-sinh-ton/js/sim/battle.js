// The battle: a deterministic fixed-step simulation of up to four heroes against five waves of one stage.
// No DOM and no three.js; the page draws it from the events it emits and the unit list, and the Node tools
// (tools/balance.mjs) run thousands of stages with the same code.
//
// Flow: phase 'fight' -> (wave cleared) 'pick' -> 'fight' ... -> 'won' | 'lost'.
// The only commands are castUlt(B, heroIndex) and pickCard(B, heroIndex, cardIndex).
import { HERO, SUMMONS } from '../data/heroes.js?v=20261124a';
import { ENEMY } from '../data/enemies.js?v=20261124a';
import { stageDef, MAX_ALIVE, BASE } from '../data/stages.js?v=20261124a';
import { CARD, offerCards } from '../data/cards.js?v=20261124a';
import { roomPlan } from './rooms.js?v=20261124a';
import { moveUnit, moveTick, moveEnter, moveAct } from './move.js?v=20261124a';
import { mapTick } from './maprules.js?v=20261124a';
import { heroDef } from '../data/beasts.js?v=20261124a';

export const DT = 1 / 30;
// The arena is an ellipse sized to a portrait phone frame: x is across the screen, z is up the screen. The whole
// of it is on screen at once, so nothing can spawn, fight or die where the player cannot see it.
export const ARENA = { x: 9.6, z: 4.6 };
// fractions of the ellipse: heroes stay inside HERO_K, enemies step out of the fog at SPAWN_K (the rim the eye sees)
const HERO_K = 0.9;
export const SPAWN_K = 1.04;
export const arenaNorm = (x, z) => Math.hypot(x / ARENA.x, z / ARENA.z);
const DOT_EVERY = 0.5;
const ENRAGE_AT = 75;
const WAVE_LIMIT = 200;
// a pack walks out of its gate across this much of the rim (param angle, radians)
const GATE_SPREAD = 0.14;

export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

// ---------- units ----------
function baseUnit(B, team, kind, x, z) {
  return {
    uid: ++B.uidSeq, team, kind, x, z, face: 0, r: 0.45, alive: true,
    hp: 1, maxHp: 1, shield: 0, shieldT: 0,
    base: { hp: 1, atk: 1, aspd: 1, speed: 4 }, mods: {}, buffs: [], status: {}, state: {},
    attack: null, skills: [], target: 0, retargetT: 0, atkT: 0.3, lockT: 0, dotT: DOT_EVERY,
    anim: 'idle', animT: 0, vx: 0, vz: 0,
  };
}

function makeHero(B, slot, spec) {
  const def = heroDef(spec);
  const lv = spec.mul || 1;
  const u = baseUnit(B, 0, def.id, 0, 0);
  const a = (slot / Math.max(1, B.teamSize)) * Math.PI * 2 + 0.6;
  u.x = Math.cos(a) * 2.2; u.z = Math.sin(a) * 2.2;
  u.hero = true; u.slot = slot; u.def = def; u.role = def.role;
  u.base = { hp: def.hp * lv + (spec.hpFlat || 0), atk: def.atk * lv + (spec.atkFlat || 0), aspd: def.aspd, speed: def.speed };
  // the ultimate charges by damage relative to the form-1 attack, so an evolved form fills it at the same pace
  u.atkScale = u.base.atk / (def.atk0 || def.atk);
  u.mods = { ...(spec.perks || {}) };
  u.hooks = {};
  for (const p of def.passives || []) {
    if (p.mods) for (const k in p.mods) u.mods[k] = (u.mods[k] || 0) + p.mods[k];
    if (p.hook) u.hooks[p.hook] = p;
  }
  u.form = def.form || 1; u.branch = def.branch || null;
  if (def.dr) u.mods.dr = (u.mods.dr || 0) + def.dr;
  if (def.lifesteal) u.mods.lifesteal = (u.mods.lifesteal || 0) + def.lifesteal;
  u.taunt = def.taunt || 0;
  u.attack = u.mods.range ? { ...def.attack, range: def.attack.range + u.mods.range } : def.attack;
  u.skills = [{ def: def.s1, slot: 's1', cd: def.s1.cd * 0.4 }, { def: def.s2, slot: 's2', cd: def.s2.cd * 0.6 }];
  u.ult = u.mods.ultStart || 0; u.ultReady = false; u.cards = []; u.cheatLeft = u.mods.cheat ? 1 : 0;
  u.maxHp = maxHpOf(u); u.hp = u.maxHp;
  u.dealt = 0; u.over = 0; u.taken = 0; u.healed = 0; u.selfHeal = 0; u.shieldGiven = 0; u.aliveT = 0; u.downT = 0; u.downs = 0;
  u.bySrc = { atk: 0, s1: 0, s2: 0, ult: 0, fx: 0 };
  u.start = permStats(u);
  moveEnter(B, u);
  return u;
}

function makeEnemy(B, kind, x, z, o = {}) {
  const def = ENEMY[kind];
  const u = baseUnit(B, 1, kind, x, z);
  const S = B.stage;
  const k = (o.elite ? 2.2 : 1) * (def.boss ? S.bossHp : 1);
  u.def = def; u.r = def.r || 0.45; u.boss = !!def.boss; u.elite = !!o.elite; u.fly = !!def.fly;
  u.base = { hp: def.hp * S.hpMul * k * (o.hpK || 1), atk: def.atk * S.atkMul * (o.elite ? 1.3 : 1) * (o.atkK || 1), aspd: def.aspd, speed: def.speed };
  u.ccK = o.ccK || 1;
  u.horde = !!o.hpK && o.hpK < 1;
  if (def.dr) u.mods.dr = def.dr;
  if (def.kbRes) u.mods.kbRes = 1;
  if (def.lifesteal) u.mods.lifesteal = def.lifesteal;
  u.attack = def.attack;
  u.skills = (def.skills || []).filter((s) => !s.tier || s.tier <= S.bossTier).map((s, i) => ({ def: s, slot: 'k' + i, cd: s.first !== undefined ? s.first : s.cd * 0.5 }));
  u.maxHp = u.base.hp; u.hp = u.maxHp; u.face = Math.atan2(-z, -x);
  u.spawnT = 0.6;
  return u;
}

function makeSummon(B, owner, kind, dur, x, z) {
  const def = SUMMONS[kind];
  const u = baseUnit(B, owner.team, kind, x, z);
  u.summon = true; u.owner = owner.uid; u.def = def; u.life = dur; u.r = 0.4;
  u.untargetable = !!def.untargetable; u.still = !!def.still; u.followOwner = !!def.follow; u.taunt = def.taunt || 0;
  u.base = { hp: Math.max(1, owner.maxHp * def.hp * (1 + M(owner, 'summonHp'))), atk: atkOf(owner) * def.atk, aspd: def.aspd || 1, speed: def.speed || 5 };
  u.attack = def.kind === 'none' ? null : { kind: def.kind, range: def.range, aoe: def.aoe, speed: def.speed, deg: 100, cleave: 1, fx: def.fx };
  u.maxHp = u.base.hp; u.hp = u.maxHp; u.credit = owner.uid; u.tag = B.tag;
  return u;
}

// ---------- stats ----------
function M(u, k) {
  let v = u.mods[k] || 0;
  for (const b of u.buffs) if (b.mods[k]) v += b.mods[k];
  return v;
}
const maxHpOf = (u) => u.base.hp * (1 + (u.mods.hp || 0));
const atkOf = (u) => u.base.atk * (1 + M(u, 'atk'));
const aspdOf = (u) => u.base.aspd * (1 + M(u, 'aspd')) * (u.status.slow ? 1 - u.status.slow.v * 0.5 : 1);
const speedOf = (u) => u.base.speed * (1 + M(u, 'speed')) * (u.status.slow ? 1 - u.status.slow.v : 1);
// what the result screen compares: base, cards and passive mods only, never a status or a timed buff
const permStats = (u) => ({ atk: u.base.atk * (1 + (u.mods.atk || 0)), hp: maxHpOf(u), aspd: u.base.aspd * (1 + (u.mods.aspd || 0)), crit: Math.min(1, 0.05 + (u.mods.crit || 0)) });
const stunned = (u) => !!(u.status.stun || u.status.freeze);
const rooted = (u) => stunned(u) || !!u.status.root;
const targetable = (u) => u.alive && !u.untargetable && !u.under && !(u.state.stealth > 0) && !(u.spawnT > 0.3);

// ---------- queries ----------
function foes(B, u) { return u.team === 0 ? B.enemies : B.allies; }
function friends(B, u) { return u.team === 0 ? B.allies : B.enemies; }

function nearestFoe(B, u, maxD = 1e9, weigh = false) {
  let best = null; let bd = maxD;
  for (const f of foes(B, u)) {
    if (!targetable(f)) continue;
    let d = dist(u, f);
    if (weigh) d = d / (1 + (f.taunt || 0)) / (f.state.taunt > 0 ? 4 : 1);
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}

function inRadius(B, team, x, z, r) {
  const out = [];
  const list = team === 0 ? B.allies : B.enemies;
  for (const f of list) if (f.alive && !f.untargetable && Math.hypot(f.x - x, f.z - z) <= r + f.r) out.push(f);
  return out;
}

// the foe with the most other foes around it; ties go to the nearer one
function clusterPoint(B, u, r, maxD = 14) {
  let best = null; let bn = -1; let bd = 1e9;
  const list = foes(B, u);
  for (const f of list) {
    if (!targetable(f)) continue;
    const d = dist(u, f);
    if (d > maxD) continue;
    let n = 0;
    for (const g of list) if (g.alive && Math.hypot(g.x - f.x, g.z - f.z) <= r) n += g.boss ? 3 : 1;
    if (n > bn || (n === bn && d < bd)) { bn = n; bd = d; best = f; }
  }
  return best ? { x: best.x, z: best.z, n: bn, unit: best } : null;
}

function pickFoe(B, u, how, maxD = 14) {
  const list = foes(B, u).filter((f) => targetable(f) && dist(u, f) <= maxD);
  if (!list.length) return null;
  if (how === 'target') return B.byUid.get(u.target) || list[0];
  if (how === 'random') return list[Math.floor(B.rng() * list.length) % list.length];
  let best = list[0];
  for (const f of list) {
    if (how === 'strong' ? f.hp > best.hp : how === 'weak' ? f.hp < best.hp : how === 'far' ? dist(u, f) > dist(u, best) : dist(u, f) < dist(u, best)) best = f;
  }
  return best;
}

// ---------- damage, healing, status ----------
const CC_FLOOR = 0.25;
function addStatus(B, src, dst, s, power) {
  if (!dst.alive || !s) return;
  const hard = s.k === 'stun' || s.k === 'freeze' || s.k === 'root';
  if (hard && (dst.state.invuln > 0 || dst.state.unstop > 0)) return;
  let dur = s.dur;
  let v = s.v || 0;
  // the caster's passives that stretch its own statuses
  const who = src && src.hero ? src : src && src.credit ? creditOf(B, src) : null;
  if (who && who.hero) {
    if (s.k === 'poison') dur *= 1 + M(who, 'dotDur');
    if (s.k === 'root') dur += M(who, 'rootDur');
    if (s.k === 'slow') v = Math.min(0.85, v + M(who, 'slowPow'));
  }
  if ((hard || s.k === 'slow') && src && src.ccK < 1) dur = Math.max(Math.min(dur, CC_FLOOR), dur * src.ccK);
  if (hard || s.k === 'slow') dur *= dst.boss ? 0.35 : 1 - Math.min(0.8, M(dst, 'ccRes'));
  const cur = dst.status[s.k];
  const dps = v * power;
  if (!cur || dur > cur.t || dps > (cur.dps || 0)) {
    dst.status[s.k] = { t: Math.max(dur, cur ? cur.t : 0), v: Math.max(v, cur ? cur.v : 0), dps: Math.max(dps, cur ? cur.dps || 0 : 0), src: src ? (src.credit || src.uid) : 0 };
    if (!cur) B.emit({ e: 'status', uid: dst.uid, k: s.k, dur });
  }
}

function creditOf(B, src) { return src ? B.byUid.get(src.credit || src.uid) || src : null; }

function hurt(B, src, dst, amount, o = {}) {
  if (!dst.alive || amount <= 0) return 0;
  if (dst.under) return 0;
  if (dst.state.invuln > 0) { if (dst.hooks && dst.hooks.reflect && src && src.team !== dst.team) dst.blocked = (dst.blocked || 0) + amount; B.emit({ e: 'block', uid: dst.uid }); return 0; }
  const who = creditOf(B, src);
  let dmg = amount;
  let crit = false;
  if (who && !o.dot) {
    // a blinded attacker misses part of its blows
    if (who.status && who.status.blind && B.rng() < who.status.blind.v) { B.emit({ e: 'dodge', uid: dst.uid }); return 0; }
    if (o.canCrit && who.sureCrit) { crit = true; who.sureCrit = false; dmg *= 1.5 + M(who, 'critDmg'); proc(B, who, 'blinkCrit'); }
    else if (o.canCrit && B.rng() < 0.05 + M(who, 'crit')) { crit = true; dmg *= 1.5 + M(who, 'critDmg'); }
    dmg *= 1 + M(who, 'dmgMul');
    if (dst.boss) dmg *= 1 + M(who, 'bossDmg');
    if (who.hero) {
      if (dst.hp < dst.maxHp * 0.5) dmg *= 1 + M(who, 'lowHpDmg');
      if (dst.status.freeze) dmg *= 1 + M(who, 'frozenAmp');
      if (dst.status.stun) dmg *= 1 + M(who, 'stunAmp');
      if (dst.status.root) dmg *= 1 + M(who, 'rootAmp');
    }
  }
  if (!o.dot && !o.sure && B.rng() < M(dst, 'dodge')) { B.emit({ e: 'dodge', uid: dst.uid }); return 0; }
  if (!o.dot && dst.dodgeLeft > 0) { dst.dodgeLeft--; B.emit({ e: 'dodge', uid: dst.uid }); proc(B, dst, 'waveDodge'); return 0; }
  let dr = M(dst, 'dr') + (o.ranged ? M(dst, 'rangedDr') : 0);
  if (dst.hooks && dst.hooks.stillDr && dst.stillT > 0.5) { dr += dst.hooks.stillDr.dr; proc(B, dst, 'stillDr'); }
  dmg *= 1 - Math.min(0.85, dr);
  // a flier is hard to reach for a claw or a bite
  if (o.melee && dst.air && dst.team === 0) dmg *= 0.8;
  if (dst.amp > 0) dmg *= 1 + dst.amp;
  if (dst.inkT > B.t) dmg *= 1 + dst.inkAmp;
  if (dst.shield > 0) { const s = Math.min(dst.shield, dmg); dst.shield -= s; dmg -= s; if (dmg <= 0) { B.emit({ e: 'hit', uid: dst.uid, by: src ? src.uid : 0, dmg: Math.round(s), shield: true, x: dst.x, z: dst.z }); return s; } }
  const real = Math.min(dmg, Math.max(0, dst.hp));
  dst.hp -= dmg;
  if (dst.team === 1 && !dst.summon) { B.book.enemyLost += real; if (!(who && who.hero)) B.book.other += real; }
  if (dst.hero) { dst.taken += real; chargeUlt(B, dst, (dmg / dst.maxHp) * 0.5); }
  if (who && who.hero) {
    who.dealt += real; who.over += dmg - real;
    const tag = B.tag in who.bySrc ? B.tag : 'fx';
    who.bySrc[tag] += real;
    chargeUlt(B, who, dmg / (who.def.ult.cost * BASE.ultCost * who.atkScale));
    const ls = M(who, 'lifesteal');
    if (ls > 0 && !o.dot) heal(B, who, who, dmg * ls, true);
    const td = M(who, 'teamDrain');
    if (td > 0 && !o.dot) { const low = lowestAlly(B, who); if (low) heal(B, who, low, real * td, true); }
  }
  if (dst.hooks && dst.hooks.spit && o.melee && src && src.alive && src.team !== dst.team && B.rng() < dst.hooks.spit.p) { addStatus(B, dst, src, { k: 'poison', dur: 4, v: 0.4 }, atkOf(dst)); proc(B, dst, 'spit'); }
  B.emit({ e: 'hit', uid: dst.uid, by: src ? src.uid : 0, dmg: Math.round(dmg), crit, dot: !!o.dot, x: dst.x, z: dst.z });
  if (o.melee && !o.dot && src && src.alive) { const th = M(dst, 'thorns'); if (th > 0) withTag(B, 'fx', () => hurt(B, dst, src, dmg * th, { dot: true })); }
  if (dst.hp <= 0) kill(B, dst, who);
  return dmg;
}

function kill(B, u, by) {
  if (u.team === 1 && !u.summon && u.hp > 0) { B.book.enemyLost += u.hp; B.book.other += u.hp; }
  if (u.hero && u.cheatLeft > 0) { u.cheatLeft--; u.hp = u.maxHp * 0.3; u.state.invuln = 1.5; B.emit({ e: 'cheat', uid: u.uid }); return; }
  // a guardian lantern stands a fallen ally up once per wave
  if (u.hero && u.saved !== B.wave) {
    const g = B.heroes.find((h) => h.alive && h !== u && h.hooks.guardian);
    if (g) { u.saved = B.wave; u.hp = u.maxHp * g.hooks.guardian.hp; u.state.invuln = 1.2; B.emit({ e: 'revive', uid: u.uid, x: u.x, z: u.z, by: g.uid }); proc(B, g, 'guardian'); return; }
  }
  u.alive = false; u.hp = 0; u.anim = 'dead'; u.animT = 0; u.status = {}; u.buffs.length = 0;
  if (u.summon) summonGone(B, u);
  if (u.hero) u.downs++;
  B.emit({ e: 'die', uid: u.uid, by: by ? by.uid : 0, x: u.x, z: u.z, boss: u.boss });
  if (u.team === 1 && !u.summon) {
    B.kills++;
    if (by && by.hero) {
      by.kills = (by.kills || 0) + 1;
      if (by.hooks.killStealth) { proc(B, by, 'killStealth'); by.state.stealth = Math.max(by.state.stealth || 0, by.hooks.killStealth.dur); B.emit({ e: 'state', uid: by.uid, key: 'stealth', dur: by.hooks.killStealth.dur, fx: 'vanish' }); }
      if (by.hooks.contagion && B.dotK === 'poison') { proc(B, by, 'contagion'); B.emit({ e: 'fx', key: 'plague', part: 'burst', x: u.x, z: u.z, r: 3, team: 0, by: by.uid }); for (const f of inRadius(B, 1, u.x, u.z, 3)) addStatus(B, by, f, { k: 'poison', dur: 5, v: 0.5 }, atkOf(by)); }
      const ex = M(by, 'explodeKill');
      if (ex > 0) { B.emit({ e: 'fx', key: 'kill_blast', x: u.x, z: u.z, r: 2.5 }); for (const f of inRadius(B, 1, u.x, u.z, 2.5)) withTag(B, 'fx', () => hurt(B, by, f, atkOf(by) * ex, { dot: true })); }
    }
    if (u.def.onDeath) runOps(B, u, { ops: u.def.onDeath, fx: u.def.deathFx }, { dead: true });
    if (u.plague && by) for (const f of inRadius(B, 1, u.x, u.z, 3)) addStatus(B, by, f, { k: 'poison', dur: 5, v: 0.4 }, atkOf(by));
  }
}

function heal(B, src, dst, amount, quiet) {
  if (!dst.alive || dst.summon) return 0;
  const a = Math.min(dst.maxHp - dst.hp, amount * (1 + M(dst, 'healIn')));
  if (a <= 0) return 0;
  dst.hp += a;
  if (dst.team === 1 && !dst.summon) B.book.enemyIn += a;
  if (src && src.hero && src !== dst) { src.healed += a; chargeUlt(B, src, (a / dst.maxHp) * 0.6); } else if (src && src.hero) src.selfHeal += a;
  if (!quiet || a > dst.maxHp * 0.03) B.emit({ e: 'heal', uid: dst.uid, amt: Math.round(a), x: dst.x, z: dst.z });
  return a;
}

// a passive acted: one event per beast and passive per second, for the view and the tests
function proc(B, u, k) {
  const T = u.procT || (u.procT = {});
  if ((T[k] || -9) + 1 > B.t) return;
  T[k] = B.t; B.emit({ e: 'passive', uid: u.uid, k, x: u.x, z: u.z });
}

function lowestAlly(B, u) {
  let best = null;
  for (const f of friends(B, u)) if (f.alive && !f.summon && (!best || f.hp / f.maxHp < best.hp / best.maxHp)) best = f;
  return best;
}

// a summon broken or run out: the owner's scrap blows up (Hải Ly Cơ Giáp)
function summonGone(B, u) {
  const o = B.byUid.get(u.owner);
  if (!o || !o.alive || !o.hooks || !o.hooks.boomSummon || u.boomed) return;
  u.boomed = true; const h = o.hooks.boomSummon; proc(B, o, 'boomSummon');
  B.emit({ e: 'fx', key: 'kill_blast', part: 'burst', x: u.x, z: u.z, r: h.r, team: o.team, by: o.uid });
  withTag(B, 'fx', () => { for (const f of inRadius(B, 1 - o.team, u.x, u.z, h.r)) hurt(B, o, f, atkOf(o) * h.dmg, {}); });
}

function chargeUlt(B, u, f) {
  if (!u.hero || !u.alive || u.ultLock > 0) return;
  u.ult = Math.min(1, u.ult + f * (1 + M(u, 'ultRate')));
  if (u.ult >= 1 && !u.ultReady) { u.ultReady = true; u.ultReadyT = B.t; B.emit({ e: 'ult_ready', uid: u.uid, slot: u.slot }); }
}

// ---------- ops ----------
function resolvePoint(B, u, at, r) {
  if (at === 'self' || !at) return { x: u.x, z: u.z };
  const t = B.byUid.get(u.target);
  if (at === 'cluster') { const c = clusterPoint(B, u, r || 3.5); if (c) return c; }
  if (at === 'random') { const f = pickFoe(B, u, 'random', 14); if (f) return { x: f.x, z: f.z, unit: f }; }
  if (at === 'weak' || at === 'far') { const f = pickFoe(B, u, at, at === 'far' ? 40 : 10); if (f) return { x: f.x, z: f.z, unit: f }; }
  if (t && t.alive) return { x: t.x, z: t.z, unit: t };
  const n = nearestFoe(B, u);
  return n ? { x: n.x, z: n.z, unit: n } : { x: u.x, z: u.z };
}

// Damage is booked under the source that was current when the work was scheduled: 'atk', 's1', 's2', 'ult' or 'fx'
// (burn, poison, bleed, thorns, chain and kill effects). The tag rides along with delayed hits.
function later(B, t, run) { const tag = B.tag; B.pending.push({ t: B.t + t, run: () => { const prev = B.tag; B.tag = tag; run(); B.tag = prev; } }); }
function withTag(B, tag, fn) { const prev = B.tag; B.tag = tag; const r = fn(); B.tag = prev; return r; }

const OPS = {
  aoe(B, u, op, C) {
    const p = resolvePoint(B, u, op.at, op.r);
    const r = op.r * (1 + M(u, 'aoe'));
    const go = () => {
      B.emit({ e: 'fx', key: C.fx, part: 'burst', x: p.x, z: p.z, r, team: u.team, by: u.uid });
      for (const f of inRadius(B, 1 - u.team, p.x, p.z, r)) {
        hurt(B, u, f, C.power * op.dmg, { canCrit: true });
        addStatus(B, u, f, op.status, C.atk);
        if (op.kb && f.alive && !f.boss && !M(f, 'kbRes')) push(B, f, p.x, p.z, op.kb, u);
      }
    };
    if (op.delay) { B.emit({ e: 'tele', shape: 'circle', x: p.x, z: p.z, r, t: op.delay, team: u.team, key: C.fx }); later(B, op.delay, go); } else go();
  },
  cone(B, u, op, C) {
    const p = resolvePoint(B, u, 'target');
    const ang = Math.atan2(p.z - u.z, p.x - u.x);
    const go = () => {
      B.emit({ e: 'fx', key: C.fx, part: 'cone', x: u.x, z: u.z, r: op.r, ang, deg: op.deg, team: u.team, by: u.uid });
      for (const f of inCone(B, u, ang, op.r, op.deg)) { hurt(B, u, f, C.power * op.dmg, { canCrit: true }); addStatus(B, u, f, op.status, C.atk); }
    };
    if (op.delay) { B.emit({ e: 'tele', shape: 'cone', x: u.x, z: u.z, r: op.r, ang, deg: op.deg, t: op.delay, team: u.team, key: C.fx }); later(B, op.delay, go); } else go();
  },
  // n > 1 spreads n lines evenly over `fan` degrees around the target direction (fan 360: a full ring)
  line(B, u, op, C) {
    const p = resolvePoint(B, u, 'target');
    const a0 = Math.atan2(p.z - u.z, p.x - u.x);
    const n = op.n || 1; const fan = ((op.fan || 0) * Math.PI) / 180;
    const step = n > 1 ? (op.fan >= 360 ? fan / n : fan / (n - 1)) : 0;
    const x1 = u.x; const z1 = u.z;
    for (let i = 0; i < n; i++) {
      const ang = n > 1 ? (op.fan >= 360 ? a0 + step * i : a0 - fan / 2 + step * i) : a0;
      const x2 = x1 + Math.cos(ang) * op.len; const z2 = z1 + Math.sin(ang) * op.len;
      const go = () => {
        B.emit({ e: 'fx', key: C.fx, part: 'line', x: x1, z: z1, x2, z2, w: op.w, team: u.team, by: u.uid });
        for (const f of onSegment(B, 1 - u.team, x1, z1, x2, z2, op.w / 2)) { hurt(B, u, f, C.power * op.dmg, { canCrit: true, ranged: true }); addStatus(B, u, f, op.status, C.atk); }
      };
      if (op.delay) { B.emit({ e: 'tele', shape: 'line', x: x1, z: z1, x2, z2, w: op.w, t: op.delay, team: u.team, key: C.fx }); later(B, op.delay, go); } else go();
    }
  },
  dash(B, u, op, C) {
    if (rooted(u) && !C.ult) return;
    const x1 = u.x; const z1 = u.z;
    let tx = u.x; let tz = u.z;
    if (op.to === 'away') {
      const n = nearestFoe(B, u);
      const a = n ? Math.atan2(u.z - n.z, u.x - n.x) : B.rng() * 6.283;
      tx = u.x + Math.cos(a) * op.dist; tz = u.z + Math.sin(a) * op.dist;
      // against the fog wall, slide along it instead of stopping in the crowd
      if (arenaNorm(tx, tz) > HERO_K) { const side = (Math.cos(a) * -u.z + Math.sin(a) * u.x) > 0 ? 1 : -1; const b = Math.atan2(u.z / ARENA.z, u.x / ARENA.x) + side * (op.dist / ARENA.z); tx = Math.cos(b) * ARENA.x * HERO_K * 0.9; tz = Math.sin(b) * ARENA.z * HERO_K * 0.9; }
    } else {
      const p = resolvePoint(B, u, op.to === 'through' ? 'target' : op.to, 3.5);
      const d = Math.hypot(p.x - u.x, p.z - u.z) || 1;
      const stop = op.to === 'through' ? d + 2.5 : op.to === 'cluster' ? d : Math.max(0, d - 1.4);
      tx = u.x + ((p.x - u.x) / d) * stop; tz = u.z + ((p.z - u.z) / d) * stop;
    }
    ({ x: tx, z: tz } = clampR(tx, tz, u.team === 0 ? HERO_K : 1));
    u.x = tx; u.z = tz; u.face = Math.atan2(tz - z1, tx - x1);
    B.emit({ e: 'dash', uid: u.uid, x: x1, z: z1, x2: tx, z2: tz, jump: !!op.jump, key: C.fx });
    if (op.dmg) for (const f of onSegment(B, 1 - u.team, x1, z1, tx, tz, (op.w || 1.4) / 2)) {
      hurt(B, u, f, C.power * op.dmg, { canCrit: true, melee: true }); addStatus(B, u, f, op.status, C.atk);
      if (op.kb && f.alive && !f.boss && !M(f, 'kbRes')) pushAside(B, f, x1, z1, tx, tz, op.kb, u);
    }
    // a cutting wake along the path (Tê Thành Lũy's crack, Chồn Liềm's wind blade)
    if (op.trail) addZone(B, u, C, { x: x1, z: z1, seg: { x2: tx, z2: tz }, r: op.trail.w / 2, dur: op.trail.dur, every: op.trail.every, dmg: op.trail.dmg, status: op.trail.status });
    // chained charges: the next nearest foe after a short beat
    const left = (C.times === undefined ? op.times || 1 : C.times) - 1;
    if (left > 0) later(B, 0.35, () => { if (!u.alive) return; const n = nearestFoe(B, u, 12); if (n) { u.target = n.uid; OPS.dash(B, u, op, { ...C, times: left }); } });
  },
  heal(B, u, op, C) {
    const list = friends(B, u).filter((f) => f.alive && !f.summon);
    const who = op.who === 'self' ? [u] : op.who === 'all' ? list : op.n > 1 ? list.slice().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp).slice(0, op.n) : [list.reduce((a, b) => (b.hp / b.maxHp < a.hp / a.maxHp ? b : a), u)];
    const pow = (1 + (C.bonus || 0)) * (1 + M(u, 'healPow')); const hs = M(u, 'healShield');
    for (const f of who) {
      heal(B, u, f, f.maxHp * op.amt * pow); B.emit({ e: 'fx', key: C.fx, part: 'heal', x: f.x, z: f.z, uid: f.uid });
      if (hs > 0 && f !== u) { const sh = f.maxHp * hs; u.shieldGiven += Math.max(0, sh - f.shield); f.shield = Math.max(f.shield, sh); f.shieldT = Math.max(f.shieldT, 4); }
    }
  },
  shield(B, u, op, C) {
    const who = op.who === 'self' ? [u] : friends(B, u).filter((f) => f.alive && !f.summon);
    for (const f of who) { const sh = f.maxHp * op.amt * (1 + (C.bonus || 0)); if (u.hero && f !== u) u.shieldGiven += Math.max(0, sh - f.shield); f.shield = Math.max(f.shield, sh); f.shieldT = op.dur; B.emit({ e: 'fx', key: C.fx, part: 'shield', x: f.x, z: f.z, uid: f.uid, dur: op.dur }); }
  },
  buff(B, u, op, C) {
    const who = op.who === 'self' ? [u] : friends(B, u).filter((f) => f.alive && !f.summon);
    for (const f of who) { f.buffs.push({ mods: op.mods, t: op.dur, key: C.fx }); B.emit({ e: 'buff', uid: f.uid, key: C.fx, dur: op.dur }); }
  },
  state(B, u, op, C) {
    u.state[op.key] = Math.max(u.state[op.key] || 0, op.dur);
    B.emit({ e: 'state', uid: u.uid, key: op.key, dur: op.dur, fx: C.fx });
  },
  zone(B, u, op, C) {
    const p = resolvePoint(B, u, op.at, op.r);
    const n = op.n || 1;
    for (let i = 0; i < n; i++) {
      // n zones scattered around the point (Nghìn Lưỡi Lốc's columns, Phun Trào's vents)
      const a = (i / n) * 6.283 + B.rng() * 0.8; const d = n > 1 ? (op.scatter || 2) * (0.5 + B.rng() * 0.5) : 0;
      const q = n > 1 ? clampR(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, 1) : p;
      addZone(B, u, C, { ...op, x: q.x, z: q.z });
    }
  },
  rain(B, u, op, C) {
    const p = resolvePoint(B, u, op.at === 'front' ? 'target' : op.at, op.r);
    for (let i = 0; i < op.n; i++) {
      const wait = (op.delay || 0) + (op.over * i) / Math.max(1, op.n - 1 || 1);
      later(B, Math.max(0, wait - 0.6), () => {
        let x; let z;
        const f = op.seek && B.rng() < 0.7 ? pickFoe(B, u, 'random', 30) : null;
        if (f) { x = f.x; z = f.z; } else { const a = B.rng() * 6.283; const d = Math.sqrt(B.rng()) * op.r; x = p.x + Math.cos(a) * d; z = p.z + Math.sin(a) * d; }
        const r = op.hitR * (1 + M(u, 'aoe'));
        B.emit({ e: 'tele', shape: 'circle', x, z, r, t: 0.6, team: u.team, key: C.fx, fall: true });
        later(B, 0.6, () => {
          B.emit({ e: 'fx', key: C.fx, part: 'burst', x, z, r, team: u.team, by: u.uid });
          for (const g of inRadius(B, 1 - u.team, x, z, r)) {
            hurt(B, u, g, C.power * op.dmg, { canCrit: true, ranged: true }); addStatus(B, u, g, op.status, C.atk);
            if (op.kb && g.alive && !g.boss && !M(g, 'kbRes')) push(B, g, x, z, op.kb, u);
          }
          if (op.healAlly) for (const g of inRadius(B, u.team, x, z, r + 1)) if (!g.summon) heal(B, u, g, g.maxHp * op.healAlly * (1 + M(u, 'healPow')), true);
          if (op.pool) addZone(B, u, C, { x, z, ...op.pool });
        });
      });
    }
  },
  bolts(B, u, op, C) {
    for (let i = 0; i < op.n; i++) {
      later(B, (op.delay || 0) + op.every * i, () => {
        if (!u.alive && !C.dead) return;
        const f = pickFoe(B, u, op.pick, op.blink ? 30 : 16);
        if (!f) return;
        if (op.blink) { const a = B.rng() * 6.283; const x1 = u.x; const z1 = u.z; u.x = clampR(f.x + Math.cos(a) * 1.3, f.z + Math.sin(a) * 1.3, HERO_K).x; u.z = clampR(f.x + Math.cos(a) * 1.3, f.z + Math.sin(a) * 1.3, HERO_K).z; u.face = Math.atan2(f.z - u.z, f.x - u.x); B.emit({ e: 'dash', uid: u.uid, x: x1, z: z1, x2: u.x, z2: u.z, key: C.fx, blink: true }); }
        B.emit({ e: 'fx', key: C.fx, part: 'bolt', x: f.x, z: f.z, fromX: u.x, fromZ: u.z, team: u.team, by: u.uid, to: f.uid });
        const d = op.dmg ? hurt(B, u, f, C.power * op.dmg, { canCrit: true, ranged: !op.blink }) : 0;
        addStatus(B, u, f, op.status, C.atk);
        if (op.aoe) { B.emit({ e: 'fx', key: C.fx, part: 'burst', x: f.x, z: f.z, r: op.aoe, team: u.team, by: u.uid }); for (const g of inRadius(B, 1 - u.team, f.x, f.z, op.aoe)) if (g !== f) { hurt(B, u, g, C.power * op.dmg * 0.6, { ranged: true }); addStatus(B, u, g, op.status, C.atk); } }
        if (op.drain && d > 0) heal(B, u, op.drainTeam ? lowestAlly(B, u) || u : u, d * op.drain);
        if (op.chain) chain(B, u, f, op.chain + M(u, 'chainN'), C.power * op.dmg * 0.6, C.fx);
      });
    }
  },
  summon(B, u, op, C) {
    for (let i = 0; i < op.n; i++) {
      const a = u.face + (i - (op.n - 1) / 2) * 1.2 + (op.kind === 'decoy' ? 3.14 : 0);
      const d = op.kind === 'decoy' ? 0 : 1.5;
      const p = clampR(u.x + Math.cos(a) * d, u.z + Math.sin(a) * d, HERO_K);
      const s = makeSummon(B, u, op.kind, op.dur * (1 + (C.bonus || 0)) * (1 + M(u, 'summonDur')), p.x, p.z);
      s.side = i;
      addUnit(B, s);
      B.emit({ e: 'summon', uid: s.uid, kind: op.kind, owner: u.uid, x: s.x, z: s.z, dur: s.life });
    }
  },
  // zones built straight from parameters: x, z (and seg for a strip along a path), r, dur, every, dmg, status, ...
  mark(B, u, op, C) {
    const p = resolvePoint(B, u, op.at || 'self', op.r);
    B.emit({ e: 'fx', key: C.fx, part: 'mark', x: p.x, z: p.z, r: op.r, team: u.team, by: u.uid, dur: op.dur });
    for (const f of inRadius(B, 1 - u.team, p.x, p.z, op.r)) { f.amp = Math.max(f.amp || 0, op.amp); f.ampT = op.dur; if (op.status) { addStatus(B, u, f, op.status, C.atk); if (op.status.k === 'poison') f.plague = true; } }
  },
  pull(B, u, op, C) {
    const done = new Set();
    for (let i = 0; i < (op.n || 1); i++) {
      // the second point is the busiest spot outside the first pull
      let p = resolvePoint(B, u, op.at, op.r);
      if (i > 0) { const left = foes(B, u).filter((f) => targetable(f) && !done.has(f.uid) && dist(u, f) <= 14); if (!left.length) break; let best = left[0]; let bn = -1; for (const f of left) { let k = 0; for (const g of left) if (Math.hypot(g.x - f.x, g.z - f.z) <= op.r) k++; if (k > bn) { bn = k; best = f; } } p = { x: best.x, z: best.z }; }
      B.emit({ e: 'fx', key: C.fx, part: 'pull', x: p.x, z: p.z, r: op.r, team: u.team, by: u.uid });
      for (const f of inRadius(B, 1 - u.team, p.x, p.z, op.r)) {
        if (done.has(f.uid)) continue; done.add(f.uid);
        if (!f.boss && !M(f, 'kbRes')) { f.x += (p.x - f.x) * 0.75; f.z += (p.z - f.z) * 0.75; }
        hurt(B, u, f, C.power * op.dmg, { canCrit: true }); addStatus(B, u, f, op.status, C.atk);
      }
    }
  },
  revive(B, u, op, C) {
    for (const f of friends(B, u)) if (!f.alive && f.hero) { f.alive = true; f.hp = Math.min(f.maxHp, f.maxHp * op.hp * (1 + M(u, 'healPow'))); f.anim = 'idle'; f.state.invuln = 1.5; B.emit({ e: 'revive', uid: f.uid, x: f.x, z: f.z }); }
  },
  die(B, u) { if (u.alive) kill(B, u, null); },
  spawn(B, u, op) {
    for (let i = 0; i < op.n; i++) {
      const a = B.rng() * 6.283; const d = 2 + B.rng() * 2;
      const gates = op.near ? null : roomOf(B).gates; let gi;
      let p;
      if (op.near) p = clampR(u.x + Math.cos(a) * d, u.z + Math.sin(a) * d, 1);
      else if (gates.length) { gi = Math.floor((a / 6.283) * gates.length) % gates.length; p = rimPoint(gates[gi].t + (d - 3) * GATE_SPREAD * 0.5, SPAWN_K); }
      else p = rimPoint(a, SPAWN_K);
      const e = makeEnemy(B, op.kind, p.x, p.z); e.room = B.wave - 1; if (gi !== undefined) e.gate = gi; addUnit(B, e);
      B.emit({ e: 'spawn', uid: e.uid, kind: e.kind, x: e.x, z: e.z, gate: gi, by: u.uid });
    }
  },
};

// pull a point back inside the fraction k of the arena ellipse
function clampR(x, z, k) { const n = arenaNorm(x, z); return n > k ? { x: (x * k) / n, z: (z * k) / n } : { x, z }; }
function rimPoint(a, k) { return { x: Math.cos(a) * ARENA.x * k, z: Math.sin(a) * ARENA.z * k }; }
// knock f away from (x, z); a knock by a hero with Gai Hồi Sức heals that hero
function push(B, f, x, z, k, by) {
  const d = Math.hypot(f.x - x, f.z - z) || 1; const p = clampR(f.x + ((f.x - x) / d) * k, f.z + ((f.z - z) / d) * k, 1); f.x = p.x; f.z = p.z;
  if (by && by.hooks && by.hooks.kbHeal && f.team !== by.team) { heal(B, by, by, by.maxHp * by.hooks.kbHeal.amt, true); proc(B, by, 'kbHeal'); }
}
// knock f off a path to the side it stands on (a charge throws what it meets aside)
function pushAside(B, f, x1, z1, x2, z2, k, by) {
  const dx = x2 - x1; const dz = z2 - z1; const L = Math.hypot(dx, dz) || 1;
  const side = ((f.x - x1) * -dz + (f.z - z1) * dx) >= 0 ? 1 : -1;
  push(B, f, f.x - (-dz / L) * side, f.z - (dx / L) * side, k, by);
}
function addZone(B, u, C, op) {
  const t = B.byUid.get(u.target);
  const ang = (t ? Math.atan2(t.z - u.z, t.x - u.x) : u.face) + (op.spin || 0);
  const r = op.r * (op.seg ? 1 : 1 + M(u, 'aoe'));
  const z = { x: op.x, z: op.z, r, t: op.dur, every: op.every, tick: op.delay || 0, dmg: op.dmg, status: op.status, src: u.uid, team: u.team, power: C.power, atk: C.atk,
    tag: B.tag, follow: op.follow ? u.uid : 0, cone: op.cone || 0, ang, vx: op.drift ? Math.cos(ang) * op.drift : 0, vz: op.drift ? Math.sin(ang) * op.drift : 0, key: op.key || C.fx, id: ++B.uidSeq,
    seg: op.seg || null, suck: op.suck || 0, ink: op.ink ? M(u, 'inkAmp') || 0.0001 : 0 };
  B.zones.push(z);
  B.emit({ e: 'zone', id: z.id, key: z.key, x: z.x, z: z.z, r: z.r, dur: op.dur, follow: z.follow, cone: z.cone, ang, team: u.team, delay: op.delay || 0, ...(z.seg ? { x2: z.seg.x2, z2: z.seg.z2 } : {}) });
  return z;
}

function inCone(B, u, ang, r, deg) {
  const out = []; const half = (deg * Math.PI) / 360;
  for (const f of foes(B, u)) {
    if (!f.alive || f.untargetable) continue;
    const d = dist(u, f); if (d > r + f.r) continue;
    let da = Math.atan2(f.z - u.z, f.x - u.x) - ang; da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) <= half + Math.atan2(f.r, Math.max(0.5, d))) out.push(f);
  }
  return out;
}

function onSegment(B, team, x1, z1, x2, z2, half) {
  const out = []; const dx = x2 - x1; const dz = z2 - z1; const L2 = dx * dx + dz * dz || 1;
  for (const f of team === 0 ? B.allies : B.enemies) {
    if (!f.alive || f.untargetable) continue;
    const t = clamp(((f.x - x1) * dx + (f.z - z1) * dz) / L2, 0, 1);
    if (Math.hypot(f.x - (x1 + dx * t), f.z - (z1 + dz * t)) <= half + f.r) out.push(f);
  }
  return out;
}

function chain(B, u, from, n, dmg, key) {
  const seen = new Set([from.uid]); let cur = from;
  for (let i = 0; i < n; i++) {
    let best = null; let bd = 4.5;
    for (const f of foes(B, u)) { if (!targetable(f) || seen.has(f.uid)) continue; const d = dist(cur, f); if (d < bd) { bd = d; best = f; } }
    if (!best) return;
    seen.add(best.uid);
    B.emit({ e: 'fx', key: 'chain', part: 'bolt', x: best.x, z: best.z, fromX: cur.x, fromZ: cur.z, team: u.team, by: u.uid, src: key });
    hurt(B, u, best, dmg, { ranged: true });
    cur = best;
  }
}

// these ops show their own warning and then land; every other op with a `delay` simply runs late
const SELF_TIMED = new Set(['aoe', 'cone', 'line', 'zone', 'rain', 'bolts']);

function runOps(B, u, skill, o = {}) {
  const slot = o.slot || '';
  const bonus = slot ? M(u, slot + 'Dmg') : 0;
  const C = { fx: skill.fx, atk: atkOf(u), power: atkOf(u) * (1 + bonus), bonus, ult: slot === 'ult', dead: !!o.dead };
  const prevTag = B.tag; B.tag = o.dead ? 'fx' : slot || 'atk';
  for (const op of skill.ops) {
    if (op.delay && !SELF_TIMED.has(op.op)) later(B, op.delay, () => { if (u.alive || C.dead) OPS[op.op](B, u, op, C); });
    else OPS[op.op](B, u, op, C);
  }
  B.tag = prevTag;
}

// ---------- AI ----------
function wants(B, u, w) {
  if (!w) return true;
  const t = B.byUid.get(u.target);
  if (w.hpBelow !== undefined) return u.hp / u.maxHp < w.hpBelow && !!nearestFoe(B, u, 12);
  if (w.allyBelow !== undefined) return friends(B, u).some((f) => f.alive && !f.summon && f.hp / f.maxHp < w.allyBelow);
  if (w.targetWithin !== undefined) return !!t && t.alive && dist(u, t) <= w.targetWithin;
  if (w.enemyWithin !== undefined) return !!nearestFoe(B, u, w.enemyWithin);
  if (w.crowd !== undefined) {
    if (w.self) return inRadius(B, 1 - u.team, u.x, u.z, w.r).length >= w.crowd;
    const c = clusterPoint(B, u, w.r, 12);
    return !!c && (c.n >= w.crowd || (c.n >= 1 && B.spawnsLeft === 0 && foes(B, u).filter((f) => f.alive).length <= 2));
  }
  if (w.every !== undefined) return true;
  return true;
}

function castSkill(B, u, s) {
  const cdr = M(u, 'cdr') + M(u, s.slot + 'Cd');
  s.cd = s.def.cd * (1 - Math.min(0.6, cdr));
  u.lockT = s.def.lock !== undefined ? s.def.lock : 0.35; u.anim = 'cast'; u.animT = 0; u.castSlot = s.slot;
  B.emit({ e: 'cast', uid: u.uid, slot: s.slot, key: s.def.fx, name: s.def.name, x: u.x, z: u.z, boss: u.boss });
  runOps(B, u, s.def, { slot: s.slot });
  if (u.hero) u.casts = (u.casts || 0) + 1;
}

export function castUlt(B, slot) {
  const u = B.heroes[slot];
  if (!u || !u.alive || u.ult < 1 || B.phase !== 'fight') return false;
  u.ult = 0; u.ultReady = false; u.ultLock = 1; u.lockT = 0.5; u.anim = 'ult'; u.animT = 0; delete u.status.stun; delete u.status.freeze; delete u.status.root;
  B.emit({ e: 'ult', uid: u.uid, slot, key: u.def.ult.fx, name: u.def.ult.name, hero: u.kind, x: u.x, z: u.z });
  runOps(B, u, u.def.ult, { slot: 'ult' });
  u.ults = (u.ults || 0) + 1;
  return true;
}

function doAttack(B, u, t) {
  const prevTag = B.tag; B.tag = u.summon ? u.tag || 'atk' : 'atk';
  const A = u.attack; const atk = atkOf(u);
  u.face = Math.atan2(t.z - u.z, t.x - u.x);
  u.anim = 'attack'; u.animT = 0;
  B.emit({ e: 'attack', uid: u.uid, to: t.uid, key: A.fx, kind: A.kind, x: u.x, z: u.z, tx: t.x, tz: t.z });
  const onHit = (f, k = 1, o = {}) => {
    const d = hurt(B, u, f, atk * k, { canCrit: true, ...o });
    if (d <= 0) return;
    addStatus(B, u, f, A.status, atk);
    if (!u.hero) return;
    if (M(u, 'burnHit')) addStatus(B, u, f, { k: 'burn', dur: 3, v: M(u, 'burnHit') }, atk);
    if (M(u, 'poisonHit')) addStatus(B, u, f, { k: 'poison', dur: 4, v: M(u, 'poisonHit') }, atk);
    if (M(u, 'slowHit')) addStatus(B, u, f, { k: 'slow', dur: 1.5, v: M(u, 'slowHit') }, atk);
    if (M(u, 'stunHit') && B.rng() < M(u, 'stunHit')) addStatus(B, u, f, { k: 'stun', dur: 1 }, atk);
    if (M(u, 'chain') && B.rng() < M(u, 'chain')) withTag(B, 'fx', () => chain(B, u, f, 2, atk * 0.5, 'chain'));
    if (f.alive && !f.boss && M(u, 'execute') && f.hp / f.maxHp < M(u, 'execute')) withTag(B, 'fx', () => hurt(B, u, f, f.hp + f.shield + 1, { dot: true }));
    if (M(u, 'zapHit') && f.alive && B.rng() < M(u, 'zapHit')) { B.emit({ e: 'fx', key: 'smite', part: 'bolt', x: f.x, z: f.z, fromX: f.x, fromZ: f.z, team: u.team, by: u.uid, to: f.uid }); withTag(B, 'fx', () => hurt(B, u, f, atk * 1.2, { ranged: true })); }
    if (M(u, 'kbHit') && f.alive && !f.boss && !M(f, 'kbRes')) push(B, f, u.x, u.z, M(u, 'kbHit'), u);
  };
  if (A.kind === 'melee') {
    const list = inCone(B, u, u.face, A.range + 0.3, A.deg).sort((a, b) => dist(u, a) - dist(u, b)).slice(0, (A.cleave || 1) + M(u, 'cleave'));
    if (!list.includes(t) && dist(u, t) <= A.range + t.r + 0.3) list.unshift(t);
    for (const f of list) onHit(f, 1, { melee: true });
  } else if (A.kind === 'shot') {
    onHit(t, 1, { ranged: true });
    // Gai Thừa: now and then a second spike flies at another foe in reach
    if (u.hero && M(u, 'extraShot') && B.rng() < M(u, 'extraShot')) { const o2 = foes(B, u).find((f) => f !== t && targetable(f) && dist(u, f) <= A.range + f.r); if (o2) { B.emit({ e: 'attack', uid: u.uid, to: o2.uid, key: A.fx, kind: A.kind, x: u.x, z: u.z, tx: o2.x, tz: o2.z }); onHit(o2, 1, { ranged: true }); } }
    const more = A.chain ? A.chain + M(u, 'chainN') : 0;
    if (more) chain(B, u, t, more, atk * 0.6, A.fx);
    const pierce = M(u, 'pierce');
    if (pierce) { const ang = u.face; const hit = onSegment(B, 1 - u.team, t.x, t.z, t.x + Math.cos(ang) * 5, t.z + Math.sin(ang) * 5, 0.6).filter((f) => f !== t).slice(0, pierce); for (const f of hit) onHit(f, 0.7, { ranged: true }); }
  } else if (A.kind === 'cone') {
    const list = inCone(B, u, u.face, A.range + 0.3, A.deg).sort((a, b) => dist(u, a) - dist(u, b));
    if (!list.includes(t)) list.unshift(t);
    list.forEach((f, i) => onHit(f, i === 0 ? 1 : 0.6, { ranged: true }));
  } else if (A.kind === 'proj') {
    const d = dist(u, t);
    B.projs.push({ id: ++B.uidSeq, x: u.x, z: u.z, tx: t.x, tz: t.z, speed: A.speed || 18, src: u.uid, team: u.team, dmg: atk, aoe: (A.aoe || 0) * (1 + M(u, 'aoe')), to: t.uid, key: A.fx, status: A.status, life: d / (A.speed || 18) + 0.05, tag: B.tag, kb: u.hero ? M(u, 'kbHit') : 0, ox: u.x, oz: u.z });
  }
  B.tag = prevTag;
}

function think(B, u, dt) {
  if (u.spawnT > 0) { u.spawnT -= dt; }
  if (u.hero && moveTick(B, u, dt)) return;
  if (u.lockT > 0) { u.lockT -= dt; return; }
  if (stunned(u)) { u.anim = 'stun'; return; }

  u.retargetT -= dt;
  let t = B.byUid.get(u.target);
  if (!t || !targetable(t) || u.retargetT <= 0) {
    u.retargetT = 0.4 + B.rng() * 0.2;
    const prev = t && targetable(t) ? t : null;
    let pick;
    // a flyer dives on the back line and stays on its victim; picking the farthest hero again each time would keep it circling
    if (u.team === 1) pick = u.fly ? prev || pickFoe(B, u, 'far', 60) || nearestFoe(B, u) : nearestFoe(B, u, 1e9, true);
    else if (u.role === 'ranged' || u.role === 'healer') { const R = u.attack.range; pick = pickFoe(B, u, 'weak', R) || nearestFoe(B, u); }
    else pick = nearestFoe(B, u);
    // stay on a target that is still in reach rather than flip between two equally near ones
    if (prev && pick && pick !== prev && u.team === 0 && u.role !== 'ranged' && u.role !== 'healer' && dist(u, prev) < dist(u, pick) + 1) pick = prev;
    t = pick; u.target = t ? t.uid : 0;
  }

  for (const s of u.skills) {
    if (s.cd > 0) continue;
    if (!t && !(s.def.when && (s.def.when.allyBelow !== undefined))) continue;
    if (wants(B, u, s.def.when)) { castSkill(B, u, s); return; }
  }
  if (u.hero && B.auto.ult && u.ult >= 1 && t && B.t - u.ultReadyT >= B.auto.ultDelay) { castUlt(B, u.slot); return; }
  if (u.hero && t) {
    // Mở Màn: the first foe of a wave is met with a charge
    if (u.openerReady) { u.openerReady = false; if (dist(u, t) > 3 && !rooted(u)) { proc(B, u, 'opener'); runOps(B, u, { ops: [{ op: 'dash', to: 'target', dmg: 1.2, w: 1.4 }], fx: 'pounce' }); return; } }
    if (!rooted(u) && moveAct(B, u, t)) return;
  }

  let mx = 0; let mz = 0;
  if (u.followOwner) {
    const o = B.byUid.get(u.owner);
    if (o) { const a = o.face + (u.side ? 1.9 : -1.9); u.x += (o.x + Math.cos(a) * 0.9 - u.x) * Math.min(1, dt * 10); u.z += (o.z + Math.sin(a) * 0.9 - u.z) * Math.min(1, dt * 10); }
  }
  if (t && u.attack) {
    const d = dist(u, t);
    const R = u.attack.range + t.r;
    const far = u.role === 'ranged' || u.role === 'healer';
    if (d > R * 0.92) { mx = (t.x - u.x) / d; mz = (t.z - u.z) / d; }
    if (far && u.team === 0) {
      const n = nearestFoe(B, u, 3.6);
      if (n) {
        // back off from what is in my face, bending along the fog wall and toward the middle
        const nd = dist(u, n) || 1; let ax = (u.x - n.x) / nd; let az = (u.z - n.z) / nd;
        const rr = Math.hypot(u.x, u.z) || 1;
        if (arenaNorm(u.x, u.z) > HERO_K - 0.25) { const tx = -u.z / rr; const tz = u.x / rr; const s = ax * tx + az * tz >= 0 ? 1 : -1; ax = tx * s - (u.x / rr) * 0.5; az = tz * s - (u.z / rr) * 0.5; }
        const l = Math.hypot(ax, az) || 1; mx = (ax / l) * 0.85; mz = (az / l) * 0.85;
      } else if (u.role === 'healer') {
        let cx = 0; let cz = 0; let n2 = 0;
        for (const f of B.heroes) if (f.alive && f !== u) { cx += f.x; cz += f.z; n2++; }
        if (n2) { cx /= n2; cz /= n2; const cd = Math.hypot(cx - u.x, cz - u.z); if (cd > 6) { mx = (cx - u.x) / cd; mz = (cz - u.z) / cd; } }
      }
    }
    if (u.base.aspd > 0) u.atkT -= dt * (aspdOf(u) / u.base.aspd);
    if (d <= R + 0.2) {
      u.face = Math.atan2(t.z - u.z, t.x - u.x);
      if (u.atkT <= 0 && u.base.aspd > 0) { u.atkT = 1 / u.base.aspd; doAttack(B, u, t); }
    }
  } else if (u.hero) {
    const d = Math.hypot(u.x, u.z);
    if (d > 4) { mx = -u.x / d; mz = -u.z / d; }
  }
  if (u.still || rooted(u)) { mx = 0; mz = 0; }
  const sp = speedOf(u);
  u.vx = mx * sp; u.vz = mz * sp;
  if (mx || mz) {
    moveUnit(B, u, dt, t);
    if (!(t && dist(u, t) <= (u.attack ? u.attack.range + t.r + 0.2 : 0))) u.face = Math.atan2(mz, mx);
    if (u.anim !== 'attack' || u.animT > 0.25) u.anim = 'run';
  } else if (u.anim === 'run' || ((u.anim === 'attack' || u.anim === 'cast' || u.anim === 'ult' || u.anim === 'stun') && u.animT > 0.45)) u.anim = 'idle';
}

function separate(B) {
  const L = B.units;
  for (let i = 0; i < L.length; i++) {
    const a = L[i]; if (!a.alive || a.untargetable) continue;
    for (let j = i + 1; j < L.length; j++) {
      const b = L[j]; if (!b.alive || b.untargetable) continue;
      if (!!(a.fly || a.air) !== !!(b.fly || b.air) || a.ghost || b.ghost || a.under || b.under) continue;
      const dx = b.x - a.x; const dz = b.z - a.z; const min = a.r + b.r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 0.01; const o = (min - d) / d;
      const wa = a.still || a.boss ? 0 : b.still || b.boss ? 1 : 0.5;
      a.x -= dx * o * wa; a.z -= dz * o * wa; b.x += dx * o * (1 - wa); b.z += dz * o * (1 - wa);
    }
  }
  for (const u of L) {
    if (!u.alive) continue;
    const p = clampR(u.x, u.z, u.team === 0 ? HERO_K : u.spawnT > 0 ? SPAWN_K + 0.05 : 1);
    u.x = p.x; u.z = p.z;
  }
}

function tickUnit(B, u, dt) {
  u.animT += dt;
  if (u.hero) { if (u.alive) u.aliveT += dt; else u.downT += dt; }
  if (!u.alive) return;
  for (const k in u.status) { const s = u.status[k]; s.t -= dt; if (s.t <= 0) delete u.status[k]; }
  for (const k in u.state) if (u.state[k] > 0) u.state[k] -= dt;
  for (let i = u.buffs.length - 1; i >= 0; i--) { u.buffs[i].t -= dt; if (u.buffs[i].t <= 0) u.buffs.splice(i, 1); }
  if (u.shieldT > 0) { u.shieldT -= dt; if (u.shieldT <= 0) u.shield = 0; }
  if (u.ampT > 0) { u.ampT -= dt; if (u.ampT <= 0) u.amp = 0; }
  if (u.ultLock > 0) u.ultLock -= dt;
  for (const s of u.skills) if (s.cd > 0) s.cd -= dt;
  if (u.summon) { u.life -= dt; if (u.life <= 0) { u.alive = false; summonGone(B, u); B.emit({ e: 'die', uid: u.uid, x: u.x, z: u.z, expire: true }); return; } }
  u.dotT -= dt;
  if (u.dotT <= 0) {
    u.dotT += DOT_EVERY;
    for (const k of ['burn', 'poison', 'bleed']) { const s = u.status[k]; if (s && s.dps > 0) { B.dotK = k; withTag(B, 'fx', () => hurt(B, B.byUid.get(s.src) || null, u, s.dps * DOT_EVERY, { dot: true })); B.dotK = ''; } if (!u.alive) return; }
    const rg = M(u, 'regen'); if (rg > 0 && u.hp < u.maxHp) heal(B, null, u, u.maxHp * rg * DOT_EVERY, true);
  }
  if (u.hero) { chargeUlt(B, u, 0.008 * dt); u.stillT = (u.stillT || 0) + dt; passiveTick(B, u, dt); if (!u.alive) return; }
  think(B, u, dt);
}

// the passives that act on their own clock (data: heroes.js passive.hook)
function passiveTick(B, u, dt) {
  const h = u.hooks;
  if (h.reflect) {
    // Phản Chấn: when the stone guard drops, what it held back comes out as a wave
    const on = u.state.invuln > 0;
    if (u.reflectOn && !on && u.blocked > 0) {
      const r = h.reflect.r; const per = Math.min(u.blocked * h.reflect.k, atkOf(u) * 8);
      B.emit({ e: 'fx', key: 'quake', part: 'burst', x: u.x, z: u.z, r, team: 0, by: u.uid });
      withTag(B, 'fx', () => { for (const f of inRadius(B, 1, u.x, u.z, r)) hurt(B, u, f, per, { sure: true }); });
      u.blocked = 0; proc(B, u, 'reflect');
    }
    u.reflectOn = on;
  }
  if (h.aura) {
    u.auraT = (u.auraT || 0) - dt;
    if (u.auraT <= 0) {
      u.auraT = 0.5;
      for (const f of inRadius(B, 0, u.x, u.z, h.aura.r)) {
        if (f.summon || f === u) continue;
        const b = f.buffs.find((x) => x.from === u.uid);
        if (b) b.t = 0.6; else { f.buffs.push({ mods: { dr: h.aura.dr }, t: 0.6, key: 'aura', from: u.uid }); proc(B, u, 'aura'); }
      }
    }
  }
  if (h.volley) {
    u.volT = (u.volT === undefined ? h.volley.every : u.volT) - dt;
    if (u.volT <= 0 && nearestFoe(B, u, 12)) { u.volT = h.volley.every; proc(B, u, 'volley'); runOps(B, u, { ops: [{ op: 'bolts', n: h.volley.n, every: 0.08, dmg: h.volley.dmg, pick: 'near' }], fx: 'minigun' }); }
  }
  if (h.rage && u.hp < u.maxHp * h.rage.below) {
    const b = u.buffs.find((x) => x.key === 'rage');
    if (b) b.t = 0.5; else { u.buffs.push({ mods: { aspd: h.rage.aspd }, t: 0.5, key: 'rage' }); proc(B, u, 'rage'); }
  }
  if (h.inkRegen && u.hp < u.maxHp && B.zones.some((z) => z.ink && z.src === u.uid && Math.hypot(z.x - u.x, z.z - u.z) <= z.r)) { heal(B, u, u, u.maxHp * h.inkRegen.amt * dt, true); proc(B, u, 'inkRegen'); }
  if (h.portal) {
    u.portT = (u.portT === undefined ? h.portal.every : u.portT) - dt;
    if (u.portT <= 0) {
      const f = foes(B, u).filter((g) => targetable(g) && !g.boss && dist(u, g) < 8).sort((a, b) => dist(u, a) - dist(u, b))[0];
      if (f) {
        u.portT = h.portal.every;
        const a = Math.atan2(f.z - u.z, f.x - u.x); const p = clampR(u.x + Math.cos(a) * 9, u.z + Math.sin(a) * 9, 0.97);
        const x0 = f.x; const z0 = f.z; f.x = p.x; f.z = p.z; f.target = 0;
        B.emit({ e: 'move', uid: f.uid, k: 'blink', x: x0, z: z0, tx: p.x, tz: p.z, by: u.uid }); proc(B, u, 'portal');
      }
    }
  }
}

function addUnit(B, u) {
  B.units.push(u); B.byUid.set(u.uid, u);
  if (u.team === 1 && !u.summon) B.book.enemyIn += u.maxHp;
  (u.team === 0 ? B.allies : B.enemies).push(u);
}

// ---------- rooms ----------
// Every wave is fought in its own room (a pad of the map). The team comes in on the room's entry side; the wave's first
// horde pack is already there, standing in one or two camps (made when the battle is created, idle and facing the camp,
// drawn in their room before the team arrives); every later pack, and anything a skill calls from the rim, walks out of
// one of the room's spawn gates on the far rim (rooms.js).
// the room a wave is fought in: plan.waveRoom maps wave index to room index when a layout puts several waves in one room
const roomIx = (B, w) => (B.plan.waveRoom ? B.plan.waveRoom[w] : w);
const roomOf = (B) => B.plan.rooms[Math.max(0, Math.min(B.plan.rooms.length - 1, roomIx(B, B.wave - 1)))];
// the packs of wave w that stand in camps: the ones there from the start, ordinary horde bodies, not on the boss pad
const campable = (W, g) => !W.boss && g.at === 0 && !g.elite && g.hpK > 0 && g.hpK < 1 && !ENEMY[g.kind].boss;
// only the rooms from `first` on (a battle begun at a later wave never meets the earlier camps)
function makeCamps(B, first = 0) {
  const r = makeRng((B.seed * 7919 + 17) >>> 0);
  B.camp = []; B.campN = 0;
  B.stage.waves.forEach((W, w) => {
    const room = B.plan.rooms[roomIx(B, w)]; if (!room || !room.camps.length || w < first) return;
    for (const g of W.groups) {
      if (!campable(W, g)) continue;
      const split = g.n > 12 && room.camps.length > 1 ? Math.ceil(g.n / 2) : g.n;
      for (let j = 0; j < g.n; j++) {
        const c = j < split ? room.camps[0] : room.camps[1]; const q = j < split ? j : j - split;
        const rr = 0.7 * Math.sqrt(q + 0.8); const a = q * 2.39996 + r() * 0.5;
        let x = c.x + Math.cos(a) * rr * 1.25; let z = c.z + Math.sin(a) * rr * 0.8;
        const k = arenaNorm(x, z); if (k > 0.93) { x *= 0.93 / k; z *= 0.93 / k; }
        const e = makeEnemy(B, g.kind, x, z, { elite: g.elite, hpK: g.hpK, atkK: g.atkK, ccK: g.ccK });
        e.spawnT = 0; e.camp = true; e.room = w; e.face = Math.atan2(c.z - z, c.x - x);
        e.wake = 0.2 + r() * 0.45; // seconds it takes to notice the team and turn on it
        B.camp.push(e); B.campN++;
      }
    }
  });
}
// the team comes in on the entry side of room n: moved there as soon as the room before is cleared (the page draws the run
// over the bridge from u.from; B.placeN counts the moves)
function placeTeam(B, n) {
  const h = B.plan.rooms[roomIx(B, n - 1)].home; const N = Math.max(1, B.heroes.length);
  for (const u of B.heroes) { const a = (u.slot / N) * Math.PI * 2 + 0.6; u.from = { x: u.x, z: u.z }; u.x = h.x + Math.cos(a) * 1.7; u.z = h.z + Math.sin(a) * 1.3; u.target = 0; }
  B.placeN = (B.placeN || 0) + 1;
}
function gateOf(gates, g) {
  if (!gates.length) return undefined;
  if (ENEMY[g.kind].boss) return 0;
  const f = (((g.ang % 6.283) + 6.283) % 6.283) / 6.283;
  return Math.floor(f * gates.length) % gates.length;
}

// ---------- waves ----------
function startWave(B, n) {
  B.wave = n; B.waveT = 0; B.enrage = 0;
  const W = B.stage.waves[n - 1];
  const gates = roomOf(B).gates;
  B.queue = W.groups.filter((g) => !campable(W, g)).map((g) => ({ ...g, gate: g.ang !== undefined ? gateOf(gates, g) : undefined })).sort((a, b) => a.at - b.at);
  B.spawnsLeft = B.queue.reduce((s, g) => s + g.n, 0);
  B.emit({ e: 'wave', n, boss: !!W.boss, name: W.boss ? ENEMY[W.boss].name : '' });
  // the camp of this room joins the fight: each body notices the team after its own beat
  for (let i = B.camp.length - 1; i >= 0; i--) {
    const e = B.camp[i]; if (e.room !== n - 1) continue;
    B.camp.splice(i, 1); e.lockT = e.wake; addUnit(B, e);
    B.emit({ e: 'wake', uid: e.uid, kind: e.kind, x: e.x, z: e.z });
  }
  for (const u of B.heroes) {
    if (!u.alive) continue;
    const sw = M(u, 'shieldWave'); if (sw > 0) { u.shield = u.maxHp * sw; u.shieldT = 12; }
    if (u.hooks.waveDodge) u.dodgeLeft = 1;
    if (u.hooks.waveUnstop) { proc(B, u, 'waveUnstop'); u.state.unstop = u.hooks.waveUnstop.dur; delete u.status.stun; delete u.status.freeze; delete u.status.root; }
    if (u.hooks.opener) u.openerReady = true;
  }
}

function spawnDue(B) {
  while (B.queue.length && B.queue[0].at <= B.waveT) {
    if (B.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0) + B.queue[0].n > MAX_ALIVE && B.enemies.some((e) => e.alive)) return;
    const g = B.queue.shift();
    const a0 = g.ang !== undefined ? g.ang : B.rng() * 6.283;
    const gates = roomOf(B).gates;
    const gi = g.gate !== undefined ? g.gate : gateOf(gates, { ...g, ang: a0 });
    for (let i = 0; i < g.n; i++) {
      const a = gi !== undefined ? gates[gi].t + (B.rng() - 0.5) * GATE_SPREAD : a0 + (B.rng() - 0.5) * (g.spread !== undefined ? g.spread : 0.9);
      const p = rimPoint(a, SPAWN_K + B.rng() * 0.03);
      const e = makeEnemy(B, g.kind, p.x, p.z, { elite: g.elite, hpK: g.hpK, atkK: g.atkK, ccK: g.ccK });
      e.room = B.wave - 1; e.gate = gi;
      addUnit(B, e); B.spawnsLeft--;
      B.emit({ e: 'spawn', uid: e.uid, kind: e.kind, x: e.x, z: e.z, boss: e.boss, elite: e.elite, gate: gi });
      if (e.boss) { B.boss = e.uid; B.emit({ e: 'boss', uid: e.uid, kind: e.kind, name: e.def.name }); }
    }
  }
}

function endWave(B) {
  B.emit({ e: 'wave_clear', n: B.wave });
  for (let i = B.units.length - 1; i >= 0; i--) { const u = B.units[i]; if (u.summon) { u.alive = false; B.emit({ e: 'die', uid: u.uid, x: u.x, z: u.z, expire: true }); } }
  B.zones.length = 0; B.projs.length = 0; B.pending.length = 0;
  prune(B, true);
  if (B.wave >= B.stage.waves.length) { B.phase = 'won'; B.emit({ e: 'won' }); return; }
  for (const u of B.heroes) {
    if (!u.alive) { u.alive = true; u.hp = u.maxHp * 0.35; u.anim = 'idle'; B.emit({ e: 'revive', uid: u.uid, x: u.x, z: u.z }); }
    else heal(B, null, u, u.maxHp * (0.12 + M(u, 'healWave')), true);
    u.status = {}; u.target = 0;
  }
  B.phase = 'pick';
  B.offers = B.heroes.map((u) => offerCards(u, B.rng));
  B.picked = B.heroes.map(() => -1);
  const join = B.stage.waves[B.wave - 1].join;
  if (join && B.joinSpec) joinHero(B, B.joinSpec(join));
  placeTeam(B, B.wave + 1);
  B.emit({ e: 'pick', wave: B.wave });
  if (B.auto.pick) for (let i = 0; i < B.heroes.length; i++) pickCard(B, i, B.auto.pick === 'best' ? bestOffer(B.offers[i]) : Math.floor(B.rng() * 3) % B.offers[i].length);
}

function bestOffer(offer) { let b = 0; for (let i = 1; i < offer.length; i++) if (CARD[offer[i]].rar > CARD[offer[b]].rar) b = i; return b; }

// a hero who joins mid-stage (the tutorial's second hero): enters at the centre with full health
export function joinHero(B, spec) {
  if (B.heroes.length >= 4 || B.heroes.some((u) => u.kind === spec.id)) return null;
  B.teamSize = B.heroes.length + 1;
  const u = makeHero(B, B.heroes.length, spec);
  u.state.invuln = 1.5;
  B.heroes.push(u); addUnit(B, u);
  if (B.picked) { B.picked.push(-1); B.offers.push(offerCards(u, B.rng)); }
  B.emit({ e: 'join', uid: u.uid, slot: u.slot, hero: u.kind, x: u.x, z: u.z });
  return u;
}

export function pickCard(B, slot, k) {
  if (B.phase !== 'pick' || B.picked[slot] >= 0) return false;
  const id = B.offers[slot][k];
  if (!id) return false;
  const u = B.heroes[slot]; const c = CARD[id];
  B.picked[slot] = k; u.cards.push(id);
  const hpBefore = u.maxHp;
  for (const key in c.mods) u.mods[key] = (u.mods[key] || 0) + c.mods[key];
  u.maxHp = maxHpOf(u); u.hp += u.maxHp - hpBefore;
  if (c.mods.ultStart) chargeUlt(B, u, c.mods.ultStart);
  B.emit({ e: 'picked', slot, card: id });
  if (B.picked.every((p) => p >= 0)) { B.phase = 'fight'; B.offers = null; startWave(B, B.wave + 1); }
  return true;
}

function prune(B, all) {
  const keep = (u) => u.alive || u.hero || (!all && u.animT < 2.5);
  if (B.units.every(keep)) return;
  for (const u of B.units) if (!keep(u)) { B.byUid.delete(u.uid); B.emit({ e: 'gone', uid: u.uid }); }
  B.units = B.units.filter(keep); B.allies = B.allies.filter(keep); B.enemies = B.enemies.filter(keep);
}

// ---------- step ----------
export function step(B) {
  if (B.phase !== 'fight') return;
  const dt = DT;
  B.t += dt; B.tick++; B.waveT += dt;
  spawnDue(B);
  mapTick(B, dt);

  for (let i = 0; i < B.pending.length; i++) { const p = B.pending[i]; if (p.t <= B.t) { B.pending.splice(i--, 1); p.run(); } }
  for (let i = 0; i < B.units.length; i++) tickUnit(B, B.units[i], dt);

  for (let i = B.projs.length - 1; i >= 0; i--) {
    const p = B.projs[i];
    const d = Math.hypot(p.tx - p.x, p.tz - p.z); const s = p.speed * dt;
    if (d <= s) {
      B.projs.splice(i, 1);
      const src = B.byUid.get(p.src) || { uid: p.src, team: p.team, mods: {}, buffs: [], alive: false };
      B.emit({ e: 'fx', key: p.key, part: 'burst', x: p.tx, z: p.tz, r: p.aoe || 0.8, team: p.team, by: p.src });
      const list = p.aoe ? inRadius(B, 1 - p.team, p.tx, p.tz, p.aoe) : [B.byUid.get(p.to)].filter((f) => f && f.alive && Math.hypot(f.x - p.tx, f.z - p.tz) < 1.6);
      withTag(B, p.tag, () => { for (const f of list) { hurt(B, src, f, p.dmg, { canCrit: true, ranged: true }); addStatus(B, src, f, p.status, p.dmg); if (p.kb && f.alive && !f.boss && !M(f, 'kbRes')) push(B, f, p.ox, p.oz, p.kb, src); } });
    } else { p.x += ((p.tx - p.x) / d) * s; p.z += ((p.tz - p.z) / d) * s; }
  }

  for (let i = B.zones.length - 1; i >= 0; i--) {
    const z = B.zones[i];
    z.t -= dt; z.tick -= dt;
    const src = B.byUid.get(z.src);
    if (z.follow) { if (!src || !src.alive) { z.t = 0; } else { z.x = src.x; z.z = src.z; if (z.cone) { const t = B.byUid.get(src.target); if (t) { let da = Math.atan2(t.z - src.z, t.x - src.x) - z.ang; da = Math.atan2(Math.sin(da), Math.cos(da)); z.ang += clamp(da, -2.4 * dt, 2.4 * dt); src.face = z.ang; } } } }
    z.x += z.vx * dt; z.z += z.vz * dt;
    // a vortex drags what stands in it toward the middle (bosses and the unshakeable stay)
    if (z.suck && z.tick > -dt) for (const f of inRadius(B, 1 - z.team, z.x, z.z, z.r)) { if (f.boss || M(f, 'kbRes')) continue; const d = Math.hypot(z.x - f.x, z.z - f.z); if (d > 0.4) { const k = Math.min(d - 0.4, z.suck * dt); f.x += ((z.x - f.x) / d) * k; f.z += ((z.z - f.z) / d) * k; } }
    if (z.tick <= 0 && z.t > -dt) {
      z.tick += z.every;
      const by = src || { uid: z.src, team: z.team, mods: {}, buffs: [], alive: false };
      const list = z.seg ? onSegment(B, 1 - z.team, z.x, z.z, z.seg.x2, z.seg.z2, z.r) : z.cone ? inCone(B, { x: z.x, z: z.z, team: z.team }, z.ang, z.r, z.cone) : inRadius(B, 1 - z.team, z.x, z.z, z.r);
      if (z.ink) for (const f of list) { f.inkT = B.t + z.every + 0.15; f.inkAmp = z.ink < 0.001 ? 0 : z.ink; }
      withTag(B, z.tag, () => { for (const f of list) { hurt(B, by, f, z.power * z.dmg, { dot: !z.cone && z.dmg < 0.5 }); addStatus(B, by, f, z.status, z.atk); } });
    }
    if (z.t <= 0) { B.zones.splice(i, 1); B.emit({ e: 'zone_end', id: z.id }); }
  }

  separate(B);
  if (B.tick % 15 === 0) prune(B, false);

  if (B.waveT > ENRAGE_AT) {
    const lvl = Math.floor((B.waveT - ENRAGE_AT) / 5) + 1;
    if (lvl !== B.enrage) { B.enrage = lvl; for (const e of B.enemies) if (e.alive) e.mods.atk = 0.15 * lvl; if (lvl === 1) B.emit({ e: 'enrage' }); }
  }

  const heroesUp = B.heroes.some((u) => u.alive);
  if (!heroesUp || B.waveT > WAVE_LIMIT) { B.phase = 'lost'; B.emit({ e: 'lost', wave: B.wave }); return; }
  if (!B.queue.length && !B.enemies.some((e) => e.alive)) endWave(B);
}

export function createBattle(opts) {
  const stage = typeof opts.stage === 'object' ? opts.stage : stageDef(opts.stage);
  const B = {
    t: 0, tick: 0, phase: 'fight', wave: 0, waveT: 0, enrage: 0, stage, seed: opts.seed || 1, rng: makeRng(opts.seed || 1),
    units: [], allies: [], enemies: [], heroes: [], byUid: new Map(), uidSeq: 0,
    projs: [], zones: [], pending: [], queue: [], tag: 'atk', book: { enemyIn: 0, enemyLost: 0, other: 0 }, spawnsLeft: 0, kills: 0, boss: 0, offers: null, picked: null,
    auto: { ult: false, ultDelay: 0.6, pick: false, ...(opts.auto || {}) },
    emit: () => {}, teamSize: opts.team.length, joinSpec: opts.joinSpec || null,
  };
  // what move.js needs from the sim without importing it back
  B.fn = { hurt, addStatus, push, inRadius, heal, atkOf, clampR, M, withTag, lowestAlly, zone: (B2, u, op) => addZone(B2, u, { fx: op.key, power: atkOf(u), atk: atkOf(u) }, op) };
  // every event carries the game time it happened at
  if (opts.onEvent) B.emit = (e) => { e.t = B.t; opts.onEvent(e, B); };
  opts.team.slice(0, 4).forEach((spec, i) => { const u = makeHero(B, i, spec); B.heroes.push(u); addUnit(B, u); });
  B.plan = roomPlan(stage.n || 1, ARENA);
  const wave = clamp(opts.wave || 1, 1, stage.waves.length);
  makeCamps(B, wave - 1);
  placeTeam(B, wave);
  startWave(B, wave);
  return B;
}

// run a stage to its end with the bot policies; used by the tools and by the page's fast-forward hook
export function runToEnd(B, maxTicks = 30 * 60 * 20) {
  let n = 0;
  while ((B.phase === 'fight' || B.phase === 'pick') && n++ < maxTicks) {
    if (B.phase === 'pick') { for (let i = 0; i < B.heroes.length; i++) if (B.picked[i] < 0) pickCard(B, i, 0); } else step(B);
  }
  return B;
}

// What each hero did this stage, for the result screen. Numbers are counted by the sim as they happen:
// `dealt` is health actually removed from enemies (the excess of a killing blow is in `over`), split by source.
export function battleReport(B) {
  const total = B.heroes.reduce((s, u) => s + u.dealt, 0) || 1;
  const top = B.heroes.reduce((a, b) => (b.dealt > a.dealt ? b : a), B.heroes[0]);
  return B.heroes.map((u) => ({
    id: u.kind, slot: u.slot, alive: u.alive, mvp: u === top && u.dealt > 0,
    dealt: u.dealt, share: u.dealt / total, dps: u.dealt / Math.max(1, B.t), over: u.over, bySrc: { ...u.bySrc },
    taken: u.taken, healed: u.healed, selfHeal: u.selfHeal, shieldGiven: u.shieldGiven,
    kills: u.kills || 0, ults: u.ults || 0, casts: u.casts || 0, aliveT: u.aliveT, downT: u.downT, downs: u.downs,
    cards: u.cards.slice(),
    start: { ...u.start },
    end: permStats(u),
  }));
}

export const _test = { M, atkOf, maxHpOf, hurt, heal, chargeUlt };
