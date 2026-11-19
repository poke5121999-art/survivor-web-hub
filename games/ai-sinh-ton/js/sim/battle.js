// The battle: a deterministic fixed-step simulation of up to four heroes against five waves of one stage.
// No DOM and no three.js; the page draws it from the events it emits and the unit list, and the Node tools
// (tools/balance.mjs) run thousands of stages with the same code.
//
// Flow: phase 'fight' -> (wave cleared) 'pick' -> 'fight' ... -> 'won' | 'lost'.
// The only commands are castUlt(B, heroIndex) and pickCard(B, heroIndex, cardIndex).
import { HERO, SUMMONS } from '../data/heroes.js';
import { ENEMY } from '../data/enemies.js';
import { stageDef, MAX_ALIVE, BASE } from '../data/stages.js';
import { CARD, offerCards } from '../data/cards.js';

export const DT = 1 / 30;
export const ARENA_R = 14;
export const SPAWN_R = 18.5;
const HERO_R = ARENA_R - 1;
const DOT_EVERY = 0.5;
const ENRAGE_AT = 75;
const WAVE_LIMIT = 200;

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
  const def = HERO[spec.id];
  const lv = spec.mul || 1;
  const u = baseUnit(B, 0, def.id, 0, 0);
  const a = (slot / Math.max(1, B.teamSize)) * Math.PI * 2 + 0.6;
  u.x = Math.cos(a) * 2.2; u.z = Math.sin(a) * 2.2;
  u.hero = true; u.slot = slot; u.def = def; u.role = def.role;
  u.base = { hp: def.hp * lv + (spec.hpFlat || 0), atk: def.atk * lv + (spec.atkFlat || 0), aspd: def.aspd, speed: def.speed };
  u.atkScale = u.base.atk / def.atk;
  u.mods = { ...(spec.perks || {}) };
  if (def.dr) u.mods.dr = (u.mods.dr || 0) + def.dr;
  if (def.lifesteal) u.mods.lifesteal = (u.mods.lifesteal || 0) + def.lifesteal;
  u.taunt = def.taunt || 0;
  u.attack = def.attack;
  u.skills = [{ def: def.s1, slot: 's1', cd: def.s1.cd * 0.4 }, { def: def.s2, slot: 's2', cd: def.s2.cd * 0.6 }];
  u.ult = u.mods.ultStart || 0; u.ultReady = false; u.cards = []; u.cheatLeft = u.mods.cheat ? 1 : 0;
  u.maxHp = maxHpOf(u); u.hp = u.maxHp;
  u.dealt = 0; u.taken = 0; u.healed = 0;
  return u;
}

function makeEnemy(B, kind, x, z, o = {}) {
  const def = ENEMY[kind];
  const u = baseUnit(B, 1, kind, x, z);
  const S = B.stage;
  const k = (o.elite ? 2.2 : 1) * (def.boss ? S.bossHp : 1);
  u.def = def; u.r = def.r || 0.45; u.boss = !!def.boss; u.elite = !!o.elite; u.fly = !!def.fly;
  u.base = { hp: def.hp * S.hpMul * k, atk: def.atk * S.atkMul * (o.elite ? 1.3 : 1), aspd: def.aspd, speed: def.speed };
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
  u.base = { hp: Math.max(1, owner.maxHp * def.hp), atk: atkOf(owner) * def.atk, aspd: def.aspd || 1, speed: def.speed || 5 };
  u.attack = def.kind === 'none' ? null : { kind: def.kind, range: def.range, aoe: def.aoe, speed: def.speed, deg: 100, cleave: 1, fx: def.fx };
  u.maxHp = u.base.hp; u.hp = u.maxHp; u.credit = owner.uid;
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
const stunned = (u) => !!(u.status.stun || u.status.freeze);
const rooted = (u) => stunned(u) || !!u.status.root;
const targetable = (u) => u.alive && !u.untargetable && !(u.state.stealth > 0) && !(u.spawnT > 0.3);

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
function addStatus(B, src, dst, s, power) {
  if (!dst.alive || !s) return;
  const hard = s.k === 'stun' || s.k === 'freeze' || s.k === 'root';
  if (hard && dst.state.invuln > 0) return;
  let dur = s.dur;
  if (hard || s.k === 'slow') dur *= dst.boss ? 0.35 : 1 - Math.min(0.8, M(dst, 'ccRes'));
  const cur = dst.status[s.k];
  const dps = (s.v || 0) * power;
  if (!cur || dur > cur.t || dps > (cur.dps || 0)) {
    dst.status[s.k] = { t: Math.max(dur, cur ? cur.t : 0), v: Math.max(s.v || 0, cur ? cur.v : 0), dps: Math.max(dps, cur ? cur.dps || 0 : 0), src: src ? (src.credit || src.uid) : 0 };
    if (!cur) B.emit({ e: 'status', uid: dst.uid, k: s.k, dur });
  }
}

function creditOf(B, src) { return src ? B.byUid.get(src.credit || src.uid) || src : null; }

function hurt(B, src, dst, amount, o = {}) {
  if (!dst.alive || amount <= 0) return 0;
  if (dst.state.invuln > 0) { B.emit({ e: 'block', uid: dst.uid }); return 0; }
  const who = creditOf(B, src);
  let dmg = amount;
  let crit = false;
  if (who && !o.dot) {
    if (o.canCrit && B.rng() < 0.05 + M(who, 'crit')) { crit = true; dmg *= 1.5 + M(who, 'critDmg'); }
    dmg *= 1 + M(who, 'dmgMul');
    if (dst.boss) dmg *= 1 + M(who, 'bossDmg');
  }
  if (!o.dot && !o.sure && B.rng() < M(dst, 'dodge')) { B.emit({ e: 'dodge', uid: dst.uid }); return 0; }
  let dr = M(dst, 'dr') + (o.ranged ? M(dst, 'rangedDr') : 0);
  dmg *= 1 - Math.min(0.85, dr);
  if (dst.amp > 0) dmg *= 1 + dst.amp;
  if (dst.shield > 0) { const s = Math.min(dst.shield, dmg); dst.shield -= s; dmg -= s; if (dmg <= 0) { B.emit({ e: 'hit', uid: dst.uid, by: src ? src.uid : 0, dmg: Math.round(s), shield: true, x: dst.x, z: dst.z }); return s; } }
  dst.hp -= dmg;
  if (dst.hero) { dst.taken += dmg; chargeUlt(B, dst, (dmg / dst.maxHp) * 0.5); }
  if (who && who.hero) {
    who.dealt += dmg;
    chargeUlt(B, who, dmg / (who.def.ult.cost * BASE.ultCost * who.atkScale));
    const ls = M(who, 'lifesteal');
    if (ls > 0 && !o.dot) heal(B, who, who, dmg * ls, true);
  }
  B.emit({ e: 'hit', uid: dst.uid, by: src ? src.uid : 0, dmg: Math.round(dmg), crit, dot: !!o.dot, x: dst.x, z: dst.z });
  if (o.melee && !o.dot && src && src.alive) { const th = M(dst, 'thorns'); if (th > 0) hurt(B, dst, src, dmg * th, { dot: true }); }
  if (dst.hp <= 0) kill(B, dst, who);
  return dmg;
}

function kill(B, u, by) {
  if (u.hero && u.cheatLeft > 0) { u.cheatLeft--; u.hp = u.maxHp * 0.3; u.state.invuln = 1.5; B.emit({ e: 'cheat', uid: u.uid }); return; }
  u.alive = false; u.hp = 0; u.anim = 'dead'; u.animT = 0; u.status = {}; u.buffs.length = 0;
  B.emit({ e: 'die', uid: u.uid, by: by ? by.uid : 0, x: u.x, z: u.z, boss: u.boss });
  if (u.team === 1 && !u.summon) {
    B.kills++;
    if (by && by.hero) {
      by.kills = (by.kills || 0) + 1;
      const ex = M(by, 'explodeKill');
      if (ex > 0) { B.emit({ e: 'fx', key: 'kill_blast', x: u.x, z: u.z, r: 2.5 }); for (const f of inRadius(B, 1, u.x, u.z, 2.5)) hurt(B, by, f, atkOf(by) * ex, { dot: true }); }
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
  if (src && src.hero && src !== dst) { src.healed += a; chargeUlt(B, src, (a / dst.maxHp) * 0.6); }
  if (!quiet || a > dst.maxHp * 0.03) B.emit({ e: 'heal', uid: dst.uid, amt: Math.round(a), x: dst.x, z: dst.z });
  return a;
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
  if (at === 'weak' || at === 'far') { const f = pickFoe(B, u, at, at === 'far' ? 40 : 10); if (f) return { x: f.x, z: f.z, unit: f }; }
  if (t && t.alive) return { x: t.x, z: t.z, unit: t };
  const n = nearestFoe(B, u);
  return n ? { x: n.x, z: n.z, unit: n } : { x: u.x, z: u.z };
}

function later(B, t, run) { B.pending.push({ t: B.t + t, run }); }

const OPS = {
  aoe(B, u, op, C) {
    const p = resolvePoint(B, u, op.at, op.r);
    const r = op.r * (1 + M(u, 'aoe'));
    const go = () => {
      B.emit({ e: 'fx', key: C.fx, part: 'burst', x: p.x, z: p.z, r, team: u.team, by: u.uid });
      for (const f of inRadius(B, 1 - u.team, p.x, p.z, r)) {
        hurt(B, u, f, C.power * op.dmg, { canCrit: true });
        addStatus(B, u, f, op.status, C.atk);
        if (op.kb && f.alive && !f.boss && !M(f, 'kbRes')) push(f, p.x, p.z, op.kb);
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
  line(B, u, op, C) {
    const p = resolvePoint(B, u, 'target');
    const ang = Math.atan2(p.z - u.z, p.x - u.x);
    const x2 = u.x + Math.cos(ang) * op.len; const z2 = u.z + Math.sin(ang) * op.len;
    const x1 = u.x; const z1 = u.z;
    const go = () => {
      B.emit({ e: 'fx', key: C.fx, part: 'line', x: x1, z: z1, x2, z2, w: op.w, team: u.team, by: u.uid });
      for (const f of onSegment(B, 1 - u.team, x1, z1, x2, z2, op.w / 2)) { hurt(B, u, f, C.power * op.dmg, { canCrit: true, ranged: true }); addStatus(B, u, f, op.status, C.atk); }
    };
    if (op.delay) { B.emit({ e: 'tele', shape: 'line', x: x1, z: z1, x2, z2, w: op.w, t: op.delay, team: u.team, key: C.fx }); later(B, op.delay, go); } else go();
  },
  dash(B, u, op, C) {
    if (rooted(u) && !C.ult) return;
    const x1 = u.x; const z1 = u.z;
    let tx = u.x; let tz = u.z;
    if (op.to === 'away') {
      const n = nearestFoe(B, u);
      const a = n ? Math.atan2(u.z - n.z, u.x - n.x) : B.rng() * 6.283;
      tx = u.x + Math.cos(a) * op.dist; tz = u.z + Math.sin(a) * op.dist;
      const d = Math.hypot(tx, tz);
      // against the fog wall, slide along it instead of stopping in the crowd
      if (d > HERO_R) { const side = (Math.cos(a) * -u.z + Math.sin(a) * u.x) > 0 ? 1 : -1; const b = Math.atan2(u.z, u.x) + side * (op.dist / HERO_R); tx = Math.cos(b) * HERO_R * 0.9; tz = Math.sin(b) * HERO_R * 0.9; }
    } else {
      const p = resolvePoint(B, u, op.to === 'through' ? 'target' : op.to, 3.5);
      const d = Math.hypot(p.x - u.x, p.z - u.z) || 1;
      const stop = op.to === 'through' ? d + 2.5 : op.to === 'cluster' ? d : Math.max(0, d - 1.4);
      tx = u.x + ((p.x - u.x) / d) * stop; tz = u.z + ((p.z - u.z) / d) * stop;
    }
    const d = Math.hypot(tx, tz);
    const lim = u.team === 0 ? HERO_R : ARENA_R;
    if (d > lim) { tx *= lim / d; tz *= lim / d; }
    u.x = tx; u.z = tz; u.face = Math.atan2(tz - z1, tx - x1);
    B.emit({ e: 'dash', uid: u.uid, x: x1, z: z1, x2: tx, z2: tz, jump: !!op.jump, key: C.fx });
    if (op.dmg) for (const f of onSegment(B, 1 - u.team, x1, z1, tx, tz, (op.w || 1.4) / 2)) { hurt(B, u, f, C.power * op.dmg, { canCrit: true, melee: true }); addStatus(B, u, f, op.status, C.atk); }
  },
  heal(B, u, op, C) {
    const list = friends(B, u).filter((f) => f.alive && !f.summon);
    const who = op.who === 'self' ? [u] : op.who === 'all' ? list : [list.reduce((a, b) => (b.hp / b.maxHp < a.hp / a.maxHp ? b : a), u)];
    for (const f of who) { heal(B, u, f, f.maxHp * op.amt * (1 + (C.bonus || 0))); B.emit({ e: 'fx', key: C.fx, part: 'heal', x: f.x, z: f.z, uid: f.uid }); }
  },
  shield(B, u, op, C) {
    const who = op.who === 'self' ? [u] : friends(B, u).filter((f) => f.alive && !f.summon);
    for (const f of who) { f.shield = Math.max(f.shield, f.maxHp * op.amt * (1 + (C.bonus || 0))); f.shieldT = op.dur; B.emit({ e: 'fx', key: C.fx, part: 'shield', x: f.x, z: f.z, uid: f.uid, dur: op.dur }); }
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
    const t = B.byUid.get(u.target);
    const ang = t ? Math.atan2(t.z - u.z, t.x - u.x) : u.face;
    const z = { x: p.x, z: p.z, r: op.r * (1 + M(u, 'aoe')), t: op.dur, every: op.every, tick: op.delay || 0, dmg: op.dmg, status: op.status, src: u.uid, team: u.team, power: C.power, atk: C.atk,
      follow: op.follow ? u.uid : 0, cone: op.cone || 0, ang, vx: op.drift ? Math.cos(ang) * op.drift : 0, vz: op.drift ? Math.sin(ang) * op.drift : 0, key: C.fx, id: ++B.uidSeq };
    B.zones.push(z);
    B.emit({ e: 'zone', id: z.id, key: C.fx, x: z.x, z: z.z, r: z.r, dur: op.dur, follow: z.follow, cone: z.cone, ang, team: u.team, delay: op.delay || 0 });
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
          for (const g of inRadius(B, 1 - u.team, x, z, r)) { hurt(B, u, g, C.power * op.dmg, { canCrit: true, ranged: true }); addStatus(B, u, g, op.status, C.atk); }
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
        if (op.blink) { const a = B.rng() * 6.283; const x1 = u.x; const z1 = u.z; u.x = clampR(f.x + Math.cos(a) * 1.3, f.z + Math.sin(a) * 1.3, HERO_R).x; u.z = clampR(f.x + Math.cos(a) * 1.3, f.z + Math.sin(a) * 1.3, HERO_R).z; u.face = Math.atan2(f.z - u.z, f.x - u.x); B.emit({ e: 'dash', uid: u.uid, x: x1, z: z1, x2: u.x, z2: u.z, key: C.fx, blink: true }); }
        B.emit({ e: 'fx', key: C.fx, part: 'bolt', x: f.x, z: f.z, fromX: u.x, fromZ: u.z, team: u.team, by: u.uid, to: f.uid });
        const d = op.dmg ? hurt(B, u, f, C.power * op.dmg, { canCrit: true, ranged: !op.blink }) : 0;
        addStatus(B, u, f, op.status, C.atk);
        if (op.drain && d > 0) heal(B, u, u, d * op.drain);
        if (op.chain) chain(B, u, f, op.chain, C.power * op.dmg * 0.6, C.fx);
      });
    }
  },
  summon(B, u, op, C) {
    for (let i = 0; i < op.n; i++) {
      const a = u.face + (i - (op.n - 1) / 2) * 1.2 + (op.kind === 'decoy' ? 3.14 : 0);
      const d = op.kind === 'decoy' ? 0 : 1.5;
      const p = clampR(u.x + Math.cos(a) * d, u.z + Math.sin(a) * d, HERO_R);
      const s = makeSummon(B, u, op.kind, op.dur * (1 + (C.bonus || 0)), p.x, p.z);
      s.side = i;
      addUnit(B, s);
      B.emit({ e: 'summon', uid: s.uid, kind: op.kind, owner: u.uid, x: s.x, z: s.z, dur: s.life });
    }
  },
  mark(B, u, op, C) {
    const p = resolvePoint(B, u, op.at || 'self', op.r);
    B.emit({ e: 'fx', key: C.fx, part: 'mark', x: p.x, z: p.z, r: op.r, team: u.team, by: u.uid, dur: op.dur });
    for (const f of inRadius(B, 1 - u.team, p.x, p.z, op.r)) { f.amp = Math.max(f.amp || 0, op.amp); f.ampT = op.dur; if (op.status) { addStatus(B, u, f, op.status, C.atk); if (op.status.k === 'poison') f.plague = true; } }
  },
  pull(B, u, op, C) {
    const p = resolvePoint(B, u, op.at, op.r);
    B.emit({ e: 'fx', key: C.fx, part: 'pull', x: p.x, z: p.z, r: op.r, team: u.team, by: u.uid });
    for (const f of inRadius(B, 1 - u.team, p.x, p.z, op.r)) {
      if (!f.boss && !M(f, 'kbRes')) { f.x += (p.x - f.x) * 0.75; f.z += (p.z - f.z) * 0.75; }
      hurt(B, u, f, C.power * op.dmg, { canCrit: true }); addStatus(B, u, f, op.status, C.atk);
    }
  },
  revive(B, u, op, C) {
    for (const f of friends(B, u)) if (!f.alive && f.hero) { f.alive = true; f.hp = f.maxHp * op.hp; f.anim = 'idle'; f.state.invuln = 1.5; B.emit({ e: 'revive', uid: f.uid, x: f.x, z: f.z }); }
  },
  die(B, u) { if (u.alive) kill(B, u, null); },
  spawn(B, u, op) {
    for (let i = 0; i < op.n; i++) {
      const a = B.rng() * 6.283; const d = op.near ? 2 + B.rng() * 2 : SPAWN_R;
      const p = op.near ? clampR(u.x + Math.cos(a) * d, u.z + Math.sin(a) * d, ARENA_R) : { x: Math.cos(a) * d, z: Math.sin(a) * d };
      const e = makeEnemy(B, op.kind, p.x, p.z); addUnit(B, e);
      B.emit({ e: 'spawn', uid: e.uid, kind: e.kind, x: e.x, z: e.z });
    }
  },
};

function clampR(x, z, R) { const d = Math.hypot(x, z); return d > R ? { x: (x * R) / d, z: (z * R) / d } : { x, z }; }
function push(f, x, z, k) { const d = Math.hypot(f.x - x, f.z - z) || 1; const p = clampR(f.x + ((f.x - x) / d) * k, f.z + ((f.z - z) / d) * k, ARENA_R); f.x = p.x; f.z = p.z; }

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
  for (const op of skill.ops) {
    if (op.delay && !SELF_TIMED.has(op.op)) later(B, op.delay, () => { if (u.alive || C.dead) OPS[op.op](B, u, op, C); });
    else OPS[op.op](B, u, op, C);
  }
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
    if (M(u, 'chain') && B.rng() < M(u, 'chain')) chain(B, u, f, 2, atk * 0.5, 'chain');
    if (f.alive && !f.boss && M(u, 'execute') && f.hp / f.maxHp < M(u, 'execute')) hurt(B, u, f, f.hp + f.shield + 1, { dot: true });
  };
  if (A.kind === 'melee') {
    const list = inCone(B, u, u.face, A.range + 0.3, A.deg).sort((a, b) => dist(u, a) - dist(u, b)).slice(0, (A.cleave || 1) + M(u, 'cleave'));
    if (!list.includes(t) && dist(u, t) <= A.range + t.r + 0.3) list.unshift(t);
    for (const f of list) onHit(f, 1, { melee: true });
  } else if (A.kind === 'shot') {
    onHit(t, 1, { ranged: true });
    const more = (A.chain || 0);
    if (more) chain(B, u, t, more, atk * 0.6, A.fx);
    const pierce = M(u, 'pierce');
    if (pierce) { const ang = u.face; const hit = onSegment(B, 1 - u.team, t.x, t.z, t.x + Math.cos(ang) * 5, t.z + Math.sin(ang) * 5, 0.6).filter((f) => f !== t).slice(0, pierce); for (const f of hit) onHit(f, 0.7, { ranged: true }); }
  } else if (A.kind === 'cone') {
    const list = inCone(B, u, u.face, A.range + 0.3, A.deg).sort((a, b) => dist(u, a) - dist(u, b));
    if (!list.includes(t)) list.unshift(t);
    list.forEach((f, i) => onHit(f, i === 0 ? 1 : 0.6, { ranged: true }));
  } else if (A.kind === 'proj') {
    const d = dist(u, t);
    B.projs.push({ id: ++B.uidSeq, x: u.x, z: u.z, tx: t.x, tz: t.z, speed: A.speed || 18, src: u.uid, team: u.team, dmg: atk, aoe: (A.aoe || 0) * (1 + M(u, 'aoe')), to: t.uid, key: A.fx, status: A.status, life: d / (A.speed || 18) + 0.05 });
  }
}

function think(B, u, dt) {
  if (u.spawnT > 0) { u.spawnT -= dt; }
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
        const rr = Math.hypot(u.x, u.z);
        if (rr > HERO_R - 2.5) { const tx = -u.z / rr; const tz = u.x / rr; const s = ax * tx + az * tz >= 0 ? 1 : -1; ax = tx * s - (u.x / rr) * 0.5; az = tz * s - (u.z / rr) * 0.5; }
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
    u.x += u.vx * dt; u.z += u.vz * dt;
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
      if (a.fly !== b.fly) continue;
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
    const lim = u.team === 0 ? HERO_R : u.spawnT > 0 || Math.hypot(u.x, u.z) > ARENA_R + 0.5 ? SPAWN_R + 1 : ARENA_R;
    const d = Math.hypot(u.x, u.z);
    if (d > lim) { u.x *= lim / d; u.z *= lim / d; }
  }
}

function tickUnit(B, u, dt) {
  u.animT += dt;
  if (!u.alive) return;
  for (const k in u.status) { const s = u.status[k]; s.t -= dt; if (s.t <= 0) delete u.status[k]; }
  for (const k in u.state) if (u.state[k] > 0) u.state[k] -= dt;
  for (let i = u.buffs.length - 1; i >= 0; i--) { u.buffs[i].t -= dt; if (u.buffs[i].t <= 0) u.buffs.splice(i, 1); }
  if (u.shieldT > 0) { u.shieldT -= dt; if (u.shieldT <= 0) u.shield = 0; }
  if (u.ampT > 0) { u.ampT -= dt; if (u.ampT <= 0) u.amp = 0; }
  if (u.ultLock > 0) u.ultLock -= dt;
  for (const s of u.skills) if (s.cd > 0) s.cd -= dt;
  if (u.summon) { u.life -= dt; if (u.life <= 0) { u.alive = false; B.emit({ e: 'die', uid: u.uid, x: u.x, z: u.z, expire: true }); return; } }
  u.dotT -= dt;
  if (u.dotT <= 0) {
    u.dotT += DOT_EVERY;
    for (const k of ['burn', 'poison', 'bleed']) { const s = u.status[k]; if (s && s.dps > 0) hurt(B, B.byUid.get(s.src) || null, u, s.dps * DOT_EVERY, { dot: true }); if (!u.alive) return; }
    const rg = M(u, 'regen'); if (rg > 0 && u.hp < u.maxHp) heal(B, null, u, u.maxHp * rg * DOT_EVERY, true);
  }
  if (u.hero) chargeUlt(B, u, 0.008 * dt);
  think(B, u, dt);
}

function addUnit(B, u) {
  B.units.push(u); B.byUid.set(u.uid, u);
  (u.team === 0 ? B.allies : B.enemies).push(u);
}

// ---------- waves ----------
function startWave(B, n) {
  B.wave = n; B.waveT = 0; B.enrage = 0;
  const W = B.stage.waves[n - 1];
  B.queue = W.groups.map((g) => ({ ...g })).sort((a, b) => a.at - b.at);
  B.spawnsLeft = B.queue.reduce((s, g) => s + g.n, 0);
  B.emit({ e: 'wave', n, boss: !!W.boss, name: W.boss ? ENEMY[W.boss].name : '' });
  for (const u of B.heroes) {
    if (!u.alive) continue;
    const sw = M(u, 'shieldWave'); if (sw > 0) { u.shield = u.maxHp * sw; u.shieldT = 12; }
  }
}

function spawnDue(B) {
  while (B.queue.length && B.queue[0].at <= B.waveT) {
    if (B.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0) + B.queue[0].n > MAX_ALIVE && B.enemies.some((e) => e.alive)) return;
    const g = B.queue.shift();
    const a0 = g.ang !== undefined ? g.ang : B.rng() * 6.283;
    for (let i = 0; i < g.n; i++) {
      const a = a0 + (B.rng() - 0.5) * (g.spread !== undefined ? g.spread : 0.9);
      const d = SPAWN_R + B.rng() * 1.5;
      const e = makeEnemy(B, g.kind, Math.cos(a) * d, Math.sin(a) * d, { elite: g.elite });
      addUnit(B, e); B.spawnsLeft--;
      B.emit({ e: 'spawn', uid: e.uid, kind: e.kind, x: e.x, z: e.z, boss: e.boss, elite: e.elite });
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
  B.emit({ e: 'pick', wave: B.wave });
  if (B.auto.pick) for (let i = 0; i < B.heroes.length; i++) pickCard(B, i, B.auto.pick === 'best' ? bestOffer(B.offers[i]) : Math.floor(B.rng() * 3) % B.offers[i].length);
}

function bestOffer(offer) { let b = 0; for (let i = 1; i < offer.length; i++) if (CARD[offer[i]].rar > CARD[offer[b]].rar) b = i; return b; }

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
      for (const f of list) { hurt(B, src, f, p.dmg, { canCrit: true, ranged: true }); addStatus(B, src, f, p.status, p.dmg); }
    } else { p.x += ((p.tx - p.x) / d) * s; p.z += ((p.tz - p.z) / d) * s; }
  }

  for (let i = B.zones.length - 1; i >= 0; i--) {
    const z = B.zones[i];
    z.t -= dt; z.tick -= dt;
    const src = B.byUid.get(z.src);
    if (z.follow) { if (!src || !src.alive) { z.t = 0; } else { z.x = src.x; z.z = src.z; if (z.cone) { const t = B.byUid.get(src.target); if (t) { let da = Math.atan2(t.z - src.z, t.x - src.x) - z.ang; da = Math.atan2(Math.sin(da), Math.cos(da)); z.ang += clamp(da, -2.4 * dt, 2.4 * dt); src.face = z.ang; } } } }
    z.x += z.vx * dt; z.z += z.vz * dt;
    if (z.tick <= 0 && z.t > -dt) {
      z.tick += z.every;
      const by = src || { uid: z.src, team: z.team, mods: {}, buffs: [], alive: false };
      const list = z.cone ? inCone(B, { x: z.x, z: z.z, team: z.team }, z.ang, z.r, z.cone) : inRadius(B, 1 - z.team, z.x, z.z, z.r);
      for (const f of list) { hurt(B, by, f, z.power * z.dmg, { dot: !z.cone && z.dmg < 0.5 }); addStatus(B, by, f, z.status, z.atk); }
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
    projs: [], zones: [], pending: [], queue: [], spawnsLeft: 0, kills: 0, boss: 0, offers: null, picked: null,
    auto: { ult: false, ultDelay: 0.6, pick: false, ...(opts.auto || {}) },
    emit: () => {}, teamSize: opts.team.length,
  };
  // every event carries the game time it happened at
  if (opts.onEvent) B.emit = (e) => { e.t = B.t; opts.onEvent(e, B); };
  opts.team.slice(0, 4).forEach((spec, i) => { const u = makeHero(B, i, spec); B.heroes.push(u); addUnit(B, u); });
  const wave = clamp(opts.wave || 1, 1, stage.waves.length);
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

export const _test = { M, atkOf, maxHpOf, hurt, heal, chargeUlt };
