// node test/diablo2-skills.js — behaviour of games/diablo2/js/skills.js (window.D2S) without a browser.
// data.js + rules.js + skills.js run in a vm; a fake Game.api mirrors the game.js functions D2S calls
// (damageMon carries the proposed onMonDamage hook line, recalc runs D2R.derived + D2S.modDerived like dv()).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const JS = path.join(__dirname, '..', 'games', 'diablo2', 'js');

const ctx = { console, Math: Object.create(Math), JSON, Object, Array, String, Number, Error, Date };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
['data.js', 'rules.js', 'skills.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f }));
const R = ctx.D2R, D2S = ctx.D2S, D = ctx.D2DATA;

let pass = 0, fail = 0;
function ok(cond, msg, detail) {
  if (cond) { pass++; console.log('✔ ' + msg); }
  else { fail++; console.log('✘ ' + msg + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
}
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }

// ---------------------------------------------------------------- fake world
let rndSeq = null;
ctx.Math.random = () => (rndSeq !== null ? rndSeq : 0.5);   // 0.5 by default; tests set 0.01 for "always hits"
function world(cls, skills, opts) {
  opts = opts || {};
  const W = 80, H = 80;
  const S = { char: R.newCharacter(cls), ents: [], time: 0, nextId: 1, grid: { w: W, h: H, col: new Uint8Array(W * H) }, d: null, def: { lvl: 5 } };
  S.char.lvl = opts.clvl || 30;
  Object.assign(S.char.skills, skills || {});
  const log = { msgs: [], heroHits: [] };
  function mk(kind, x, y, extra) { const e = Object.assign({ id: S.nextId++, kind, x, y, dir: 0, st: 'idle', stT: 0, stDur: 0 }, extra || {}); S.ents.push(e); return e; }
  function setSt(e, st, dur) { if (e.st !== st) { e.st = st; e.stT = 0; } e.stDur = dur || 0; }
  function restart(e, st, dur) { e.st = st; e.stT = 0; e.stDur = dur || 0; }
  function blocked(x, y) { const ix = Math.floor(x), iy = Math.floor(y); return ix < 0 || iy < 0 || ix >= W || iy >= H || S.grid.col[iy * W + ix] !== 0; }
  function canStand(x, y, r) { r = r == null ? 0.3 : r; return !blocked(x - r, y - r) && !blocked(x + r, y - r) && !blocked(x - r, y + r) && !blocked(x + r, y + r); }
  function elemOf(e) { e = String(e || 'phys').toLowerCase(); return /fire/.test(e) ? 'fire' : /cold/.test(e) ? 'cold' : /light/.test(e) ? 'light' : /pois/.test(e) ? 'poison' : 'phys'; }
  const api = {
    S, mk, setSt, restart, canStand, dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y), rnd: (a, b) => a + ctx.Math.random() * (b - a), ri: (a, b) => a, clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
    los: () => true, findPath: () => null, tryMove: () => true,
    E: {
      hasSheet: k => /^(mon\.SK|mis\.firebolt|ovl\.curseamplifydamage)$/.test(k), animOf: () => null, animDur: () => 0, pickAnim: () => null,
      dirFromTiles: () => 0, heroCof: () => null, sfx: () => {}, toScreen: (x, y) => [x, y], ctx: null,
      ensureHero: () => Promise.resolve(), ensure: () => Promise.resolve(),
    },
    UI: { msg: t => log.msgs.push(t) },
    DA: { itemName: it => it.name || it.base },
    damageMon(m, amount, elem, fromHero) {
      if (m.st === 'die' || m.st === 'dead') return;
      // proposed hook line in game.js damageMon
      if (D2S.onMonDamage) { amount = D2S.onMonDamage(api, m, amount, elem, fromHero); if (amount <= 0) return; }
      elem = elemOf(elem);
      const res = (m.inst.res && m.inst.res[elem]) || 0;
      const dmg = Math.max(1, Math.round(amount * (1 - Math.max(-100, Math.min(95, res)) / 100)));
      m.hp -= dmg; m.lastDmg = dmg;
      if (m.hp <= 0) api.killMon(m);
    },
    damageHero(amount, src) {
      if (D2S.onHeroDamage) amount = D2S.onHeroDamage(api, amount, src);
      if (amount <= 0) return;
      S.char.hp -= Math.max(1, Math.round(amount)); log.heroHits.push(amount);
    },
    killMon(m) { m.hp = 0; m.act = null; restart(m, 'die', 100); m.deadAt = S.time; },
    spawnMissile(owner, tx, ty, o) {
      const dx = tx - owner.x, dy = ty - owner.y, d = Math.hypot(dx, dy) || 1, sp = o.speed || 18;
      return mk('missile', owner.x + dx / d, owner.y + dy / d, { vx: dx / d * sp, vy: dy / d * sp, dmg: o.dmg, owner: o.owner, life: o.life || 1.2, hit: {}, pierce: o.pierce || 0, st: 'run' });
    },
    makeMonster(id, x, y, rank) {
      let inst = null;
      try { inst = R.rollMonster(id, 5, R.rng(7), rank || 'normal'); } catch (e) { inst = { id, name: id, lvl: 5, hp: 10, a1: { min: 1, max: 2, ar: 10 }, def: 5, res: {} }; }
      const spd = inst.run || inst.walk || 4;
      return mk('mon', x, y, { monId: id, inst, rank: rank || 'normal', art: null, hp: inst.hp, maxHp: inst.hp, speed: spd, aggro: false, cd: 0, act: null, flee: 0, hitFlash: 0 });
    },
    floatText: () => {}, monArt: () => null, removeEnt: e => { e.removed = true; },
    recalc() { const d = R.derived(S.char); D2S.modDerived(api, d); S.d = d; S.char.hp = Math.min(S.char.hp, d.maxHp); S.char.mp = Math.min(S.char.mp, d.maxMp); },
    heroLook: () => ({ cls: 'XX', wclass: 'HTH', tok: {} }),
  };
  S.hero = mk('hero', 20.5, 20.5, { act: null });
  api.recalc();
  S.char.hp = S.d.maxHp; S.char.mp = 1000;
  return { S, api, log };
}
// one game frame in the order of game.js updateWorld: hero act, D2S.update, then entities
function tick(w, dt) {
  const { S, api } = w, h = S.hero;
  S.time += dt;
  h.stT += dt * 1000;
  if ((h.st === 'attack' || h.st === 'cast') && h.act && !h.act.done && h.stT >= h.act.dur * 0.5) { h.act.done = true; if (D2S.handles(h.act.fx)) D2S.apply(api, h.act); }
  if ((h.st === 'attack' || h.st === 'cast') && h.stT >= h.stDur) { h.act = null; api.setSt(h, 'idle'); }
  D2S.update(api, dt);
  S.ents.forEach(e => {
    if (e.kind === 'mon' && !e.ally) { e.stT += dt * 1000; if (e.st === 'die' && e.stT >= e.stDur) e.st = 'dead'; if (e.spawnT > 0) e.spawnT -= dt * 1000; }
    else if (e.kind === 'missile') {
      e.x += e.vx * dt; e.y += e.vy * dt; e.life -= dt;
      S.ents.forEach(o => {
        if (e.st !== 'run' || o.kind !== 'mon' || o.st === 'die' || o.st === 'dead' || e.hit[o.id] || D2S.isFriend(o)) return;
        if (Math.hypot(o.x - e.x, o.y - e.y) < 1.4) { e.hit[o.id] = 1; api.damageMon(o, e.dmg.min + (e.dmg.max - e.dmg.min) / 2, e.dmg.elem, true); if (e.pierce-- <= 0) e.st = 'dead'; }
      });
      if (e.life <= 0) e.st = 'dead';
    } else if (e.kind === 'fx') { e.t += dt; if (e.t > e.life) e.removed = true; }
    else e.stT += dt * 1000;
  });
  S.ents = S.ents.filter(e => !e.removed && !(e.kind === 'missile' && e.st === 'dead'));
}
function run(w, sec) { for (let t = 0; t < sec; t += 0.04) tick(w, 0.04); }
function fxOf(w, id) { return R.skillEffect(id, w.S.char.skills[id] || 1, w.S.char); }
// cast exactly like game.js beginAct for a D2S skill, then let the animation reach its hit frame
function cast(w, id, tx, ty, target) {
  const fx = fxOf(w, id);
  ok(D2S.handles(fx), id + ' is handled by D2S');
  const started = D2S.instantCast(w.api, id, fx, tx, ty, target || null);
  if (started) run(w, 1.7);
  return started;
}
function corpse(w, id, x, y) { const m = w.api.makeMonster(id || 'zombie1', x, y); m.hp = 0; m.st = 'dead'; return m; }
function foe(w, x, y, id) { const m = w.api.makeMonster(id || 'zombie1', x, y); m.aggro = true; return m; }

// ---------------------------------------------------------------- every class skill has an executor
{
  const GAME = { missile: 1, melee: 1, nova: 1, channel: 1, passive: 1, buff: 1 };
  const missing = [];
  Object.values(D.classes).forEach(c => c.skills.forEach(id => {
    const fx = R.skillEffect(id, 1, R.newCharacter(c.id));
    if (!D2S.handles(fx) && !GAME[fx.kind]) missing.push(id + ':' + fx.kind);
  }));
  eq(missing, [], 'all 210 class skills run in game.js (missile/melee/nova/channel/passive/buff) or in D2S');
}

// ---------------------------------------------------------------- summons
{
  const w = world('necromancer', { raise_skeleton: 1 });
  corpse(w, 'zombie1', 24, 20.5); corpse(w, 'zombie1', 25, 21);
  cast(w, 'raise_skeleton', 24, 20.5);
  let pets = w.S.ents.filter(e => D2S.isFriend(e));
  eq([pets.length, pets[0] && pets[0].maxHp, pets[0] && pets[0].inst.a1.min, pets[0] && pets[0].inst.a1.max], [1, 21, 1, 2], 'Raise Skeleton slvl1: one skeleton, 21 life, 1-2 damage (monstats necroskeleton)');
  ok(!cast(w, 'raise_skeleton', 25, 21) && w.log.msgs.some(m => /đủ số lượng/.test(m)), 'slvl1 petmax 1: second skeleton is refused');
  w.S.char.skills.raise_skeleton = 4;
  ok(cast(w, 'raise_skeleton', 25, 21), 'slvl4 petmax 2+4/3 = 3: a second skeleton rises');
  eq(w.S.ents.filter(e => D2S.isFriend(e)).length, 2, 'two skeletons now');
  const z = foe(w, 28, 20.5); const hp0 = z.hp;
  rndSeq = 0.01; run(w, 4); rndSeq = null;
  ok(z.hp < hp0, 'skeletons walk to an enemy and hit it', { hp0, hp: z.hp });
  ok(!corpse(w, 'zombie1', 40, 40).ally && D2S.onMonDamage(w.api, pets[0], 50, 'phys', true) === 0, 'hero damage to his own skeleton is 0 (onMonDamage)');
}
{
  const w = world('necromancer', { clay_golem: 1, iron_golem: 1 });
  cast(w, 'clay_golem', 22, 20); cast(w, 'clay_golem', 22, 20);
  eq(w.S.ents.filter(e => D2S.isFriend(e) && e.st !== 'die' && e.st !== 'dead').length, 1, 'Clay Golem recast: still one golem (petmax 1, oldest replaced)');
  cast(w, 'iron_golem', 22, 20);
  const g = w.S.ents.filter(e => D2S.isFriend(e) && e.st !== 'die' && e.st !== 'dead');
  eq([g.length, g[0] && g[0].pet.skill], [1, 'iron_golem'], 'golems share pettype golem: Iron Golem replaces Clay Golem');
}
{
  const w0 = world('assassin', { charged_bolt_sentry: 1 });
  for (let i = 0; i < 6; i++) cast(w0, 'charged_bolt_sentry', 26 + i, 22);
  eq(w0.S.ents.filter(e => D2S.isFriend(e) && e.st !== 'die' && e.st !== 'dead').length, 5, 'six sentries cast, five stand (assassintrap petmax 5)');
  const ms = foe(w0, 30, 25); ms.hp = ms.maxHp = 1000;
  run(w0, 2);
  ok(ms.hp < 1000, 'sentries shoot charged bolts at a monster in range', ms.hp);
  const w = world('assassin', { fire_blast: 1 });
  const fb = R.skillEffect('fire_blast', 1, w.S.char);
  const m1 = foe(w, 30.5, 30.5), m2 = foe(w, 33, 30.5), m3 = foe(w, 40, 30.5);
  const h1 = m1.hp, h2 = m2.hp, h3 = m3.hp;
  m1.inst.res.fire = 0; m2.inst.res.fire = 0;
  cast(w, 'fire_blast', 30.5, 30.5);
  ok(m1.hp < h1 && m2.hp < h2 && m3.hp === h3, 'Fire Blast bomb explodes in radius ' + fb.bomb.radius + ' at the target point', [h1 - m1.hp, h2 - m2.hp, h3 - m3.hp]);
  ok(h1 - m1.hp >= fb.dmg.min && h1 - m1.hp <= fb.dmg.max, 'Fire Blast damage within ' + fb.dmg.min + '-' + fb.dmg.max + ' fire');
}
{
  const w = world('druid', { summon_spirit_wolf: 3, oak_sage: 1 });
  const hp0 = w.S.d.maxHp;
  cast(w, 'oak_sage', 22, 22);
  const sage = R.skillEffect('oak_sage', 1, w.S.char).summon.aura.lifePct;
  eq(w.S.d.maxHp, Math.floor(hp0 * (100 + sage) / 100), 'Oak Sage: party max life +' + sage + '% while the spirit lives');
  for (let i = 0; i < 4; i++) cast(w, 'summon_spirit_wolf', 22, 22);
  eq(w.S.ents.filter(e => D2S.isFriend(e) && e.pet.skill === 'summon_spirit_wolf' && e.st !== 'die' && e.st !== 'dead').length, 3, 'Spirit Wolf slvl3: petmax min(lvl,5) = 3 wolves');
  // đổi khu: đồng minh đi theo
  const pets = w.S.ents.filter(e => D2S.isFriend(e) && e.st !== 'die' && e.st !== 'dead').length;
  w.S.ents = [w.S.hero]; w.S.grid = { w: 80, h: 80, col: new Uint8Array(6400) };
  run(w, 0.1);
  eq(w.S.ents.filter(e => D2S.isFriend(e)).length, pets, 'changing area: wolves and the Oak Sage follow the hero');
}
{
  const w = world('necromancer', { revive: 1 });
  const c = corpse(w, 'zombie1', 23, 20.5), hp = c.maxHp;
  cast(w, 'revive', 23, 20.5);
  const r = w.S.ents.filter(e => D2S.isFriend(e))[0];
  const fx = R.skillEffect('revive', 1, w.S.char);
  ok(r && r.monId === 'zombie1' && r.pet.until - w.S.time > 170, 'Revive raises the corpse as an ally for ' + fx.summon.durationSec + ' s (calc2 = 4500 frames)');
  ok(r && r.maxHp >= Math.floor(hp * 2.5), 'Revive life +' + fx.summon.hpPct + '% (calc1 HP %)', r && [hp, r.maxHp]);
}

// ---------------------------------------------------------------- curses
{
  const w = world('necromancer', { amplify_damage: 1, lower_resist: 1, weaken: 1, iron_maiden: 1, decrepify: 1 });
  const m = foe(w, 24, 20.5); m.inst.res.fire = 0; m.hp = m.maxHp = 1000;
  cast(w, 'amplify_damage', 24, 20.5);
  eq([D2S.dmgTakenMul(m, 'phys'), D2S.dmgTakenMul(m, 'fire')], [2, 1], 'Amplify Damage: x2 physical (damageresist -100), elements unchanged');
  const hp0 = m.hp; w.api.damageMon(m, 10, 'phys', true);
  eq(hp0 - m.hp, 20, 'damageMon through the hook: 10 physical lands as 20');
  run(w, 9);
  eq(D2S.dmgTakenMul(m, 'phys'), 1, 'Amplify Damage ends after its 8 s (auralencalc ln34 = 200 frames)');
  const lr = R.skillEffect('lower_resist', 1, w.S.char).curse.stats.fireresist;
  cast(w, 'lower_resist', 24, 20.5);
  eq(m.inst.res.fire, lr, 'Lower Resist slvl1: fire resist ' + lr + ' (dm56 of 25..70)');
  const base = m.d2s.base.a1.max;
  cast(w, 'weaken', 24, 20.5);
  eq([m.inst.res.fire, m.inst.a1.max], [0, Math.floor(base * 67 / 100)], 'Weaken replaces Lower Resist (one curse) and cuts monster damage 33%');
  cast(w, 'decrepify', 24, 20.5);
  eq([D2S.dmgTakenMul(m, 'phys'), Math.round(m.speed * 100) / 100], [1.5, Math.round(m.d2s.base.speed * 50) / 100], 'Decrepify: x1.5 physical taken, half speed');
  cast(w, 'iron_maiden', 24, 20.5);
  const hp1 = m.hp; w.api.damageHero(10, m);
  eq(hp1 - m.hp, 20, 'Iron Maiden slvl1: monster melee 10 returns 200% = 20 to itself');
}
{
  const w = world('barbarian', { taunt: 1, howl: 1, battle_cry: 1 });
  const m = foe(w, 23, 20.5);
  cast(w, 'howl', 23, 20.5);
  ok(m.flee > 0, 'Howl makes nearby monsters flee');
  cast(w, 'battle_cry', 23, 20.5);
  eq(m.inst.a1.max, Math.floor(m.d2s.base.a1.max * 75 / 100), 'Battle Cry slvl1: monster damage -25%');
}

// ---------------------------------------------------------------- auras, buffs, passives
{
  const w = world('paladin', { might: 1, conviction: 1, prayer: 1 });
  const d0 = R.derived(w.S.char);
  cast(w, 'might', 0, 0);
  eq([w.S.d.dmgMin, w.S.d.dmgMax], [Math.floor(d0.dmgMin * 1.4), Math.floor(d0.dmgMax * 1.4)], 'Might slvl1: +40% damage on the hero (aurastat damagepercent ln34)');
  const m = foe(w, 26, 20.5); const f0 = m.inst.res.fire || 0;
  cast(w, 'conviction', 0, 0); run(w, 0.1);
  ok(m.inst.res.fire < f0 && w.S.d.dmgMin === d0.dmgMin, 'Conviction replaces Might and lowers enemy fire resist in radius', [f0, m.inst.res.fire]);
  cast(w, 'prayer', 0, 0); w.S.char.hp = 10; run(w, 4.1);
  ok(w.S.char.hp > 10, 'Prayer heals every 2 s', w.S.char.hp);
}
{
  const w = world('barbarian', { battle_orders: 1, iron_skin: 3 });
  const d0 = R.derived(w.S.char);
  ok(w.S.d.def > d0.def, 'Iron Skin (passive) raises defense via modDerived', [d0.def, w.S.d.def]);
  cast(w, 'battle_orders', 0, 0);
  eq(w.S.d.maxHp, Math.floor(d0.maxHp * 1.35), 'Battle Orders slvl1: +35% max life (ln34)');
}
{
  const w = world('necromancer', { bone_armor: 1 });
  cast(w, 'bone_armor', 0, 0);
  const hp0 = w.S.char.hp; w.api.damageHero(15, { kind: 'mon', x: 21, y: 21 });
  eq(w.S.char.hp, hp0, 'Bone Armor slvl1 absorbs 15 physical (pool 20)');
  w.api.damageHero(15, { kind: 'mon', x: 21, y: 21 });
  eq(hp0 - w.S.char.hp, 10, 'pool runs out: the next 15 lets 10 through');
}

// ---------------------------------------------------------------- shapeshift, martial arts
{
  const w = world('druid', { werewolf: 1, feral_rage: 1 });
  const hp0 = w.S.d.maxHp;
  cast(w, 'werewolf', 0, 0);
  eq([w.S.d2s.form && w.S.d2s.form.form, w.S.d.maxHp], ['wolf', Math.floor(hp0 * 1.25)], 'Werewolf slvl1: wolf form, +25% life (aurastat item_maxhp_percent par2)');
  run(w, 41);
  ok(!w.S.d2s.form, 'wolf form ends after 40 s (1000 frames)');
  const m = foe(w, 21.8, 20.5);
  rndSeq = 0.01; cast(w, 'feral_rage', m.x, m.y, m); rndSeq = null;
  ok(w.S.d2s.form && w.S.d2s.form.form === 'wolf', 'Feral Rage (restrict 2, State1 wolf) shifts into a wolf first');
}
{
  const w = world('assassin', { tiger_strike: 1, dragon_talon: 1 });
  const ts = R.skillEffect('tiger_strike', 1, w.S.char);
  eq([ts.charge.max, ts.charge.dmgPctPerCharge, ts.charge.durationSec], [3, 100, 15], 'Tiger Strike slvl1: 3 charges, +100% damage each, 15 s');
  const m = foe(w, 21.8, 20.5); m.hp = m.maxHp = 100000; m.inst.def = 0;
  rndSeq = 0.01;
  for (let i = 0; i < 4; i++) cast(w, 'tiger_strike', m.x, m.y, m);
  eq(w.S.d2s.charges.tiger_strike && w.S.d2s.charges.tiger_strike.n, 3, 'four hits store 3 charges (max)');
  const d = w.S.d, hpA = m.hp;
  cast(w, 'dragon_talon', m.x, m.y, m);
  rndSeq = null;
  const talon = R.skillEffect('dragon_talon', 1, w.S.char).finisher;
  const want = Math.round(((d.dmgMin + (d.dmgMax - d.dmgMin) * 0.01)) * (100 + talon.dmgPct + 300) / 100);
  ok(!w.S.d2s.charges.tiger_strike && Math.abs((hpA - m.hp) - want) <= 2, 'Dragon Talon releases Tiger Strike: kick at +' + (talon.dmgPct + 300) + '%', [hpA - m.hp, want]);
}

// ---------------------------------------------------------------- movement, corpses, warcries
{
  const w = world('sorceress', { teleport: 1 });
  cast(w, 'teleport', 40.5, 30.5);
  eq([Math.round(w.S.hero.x * 10) / 10, Math.round(w.S.hero.y * 10) / 10], [40.5, 30.5], 'Teleport moves the hero to the target');
}
{
  const w = world('barbarian', { leap: 3 });
  const fx = R.skillEffect('leap', 3, w.S.char);
  cast(w, 'leap', 28.5, 20.5); run(w, 1);
  ok(Math.abs(w.S.hero.x - 28.5) < 0.6, 'Leap lands on the target point (range ' + fx.move.range + ')', w.S.hero.x);
}
{
  const w = world('necromancer', { corpse_explosion: 1 });
  const c = corpse(w, 'zombie1', 25, 20.5), m = foe(w, 26, 20.5), far = foe(w, 40, 20.5);
  m.hp = m.maxHp = 1000; const hp = far.hp;
  m.inst.res.fire = 0;
  cast(w, 'corpse_explosion', 25, 20.5);
  const ce = R.skillEffect('corpse_explosion', 1, w.S.char).corpse;
  const lo = Math.floor(c.maxHp * ce.minPct / 100), hi = Math.ceil(c.maxHp * ce.maxPct / 100) + 2;
  ok(c.removed && 1000 - m.hp >= lo && 1000 - m.hp <= hi && far.hp === hp, 'Corpse Explosion: ' + ce.minPct + '-' + ce.maxPct + '% of the corpse life in radius ' + ce.radius, [1000 - m.hp, lo, hi]);
}
{
  const w = world('barbarian', { find_potion: 20 });
  corpse(w, 'zombie1', 22, 20.5);
  rndSeq = 0.01; cast(w, 'find_potion', 22, 20.5); rndSeq = null;
  ok(w.S.ents.some(e => e.kind === 'drop' && e.item), 'Find Potion on a corpse drops a potion');
}

// ---------------------------------------------------------------- smoke: cast every D2S skill of every class
{
  const errors = [], silent = [];
  Object.values(D.classes).forEach(c => {
    [1, 12].forEach(L => {
      const all = {}; c.skills.forEach(id => { all[id] = L; });
      const w = world(c.id, all);
      for (let i = 0; i < 6; i++) corpse(w, 'zombie1', 23 + i, 22);
      c.skills.forEach(id => {
        const fx = R.skillEffect(id, L, w.S.char);
        if (!D2S.handles(fx)) return;
        for (let i = 0; i < 3; i++) { const m = foe(w, 24 + i, 20.5 + i * 0.4); m.hp = m.maxHp = 500; }
        if (fx.summon && fx.summon.needsCorpse) corpse(w, 'zombie1', 24, 21);
        if (fx.corpse) corpse(w, 'zombie1', 24.5, 20.5);
        const t = w.S.ents.find(e => e.kind === 'mon' && !e.ally && e.st !== 'dead' && e.st !== 'die');
        try {
          w.S.char.mp = 1000;
          if (w.S.d2s && w.S.d2s.form && !fx.restrict) { w.S.d2s.form = null; w.api.recalc(); }
          const before = JSON.stringify(w.S.ents.map(e => [e.id, e.hp, e.d2s && e.d2s.curse && e.d2s.curse.id, e.flee > 0, !!(e.d2s && e.d2s.cry), e.ctl || 0])) + JSON.stringify(Object.keys((w.S.d2s || {}).buffs || {})) + ((w.S.d2s || {}).aura || '');
          const started = D2S.instantCast(w.api, id, fx, t ? t.x : 24, t ? t.y : 20.5, t);
          run(w, 2.5);
          const after = JSON.stringify(w.S.ents.map(e => [e.id, e.hp, e.d2s && e.d2s.curse && e.d2s.curse.id, e.flee > 0, !!(e.d2s && e.d2s.cry), e.ctl || 0])) + JSON.stringify(Object.keys((w.S.d2s || {}).buffs || {})) + ((w.S.d2s || {}).aura || '');
          if (!started || before === after && !/teleport|leap|whirlwind|charge|find_item|find_potion/.test(id)) silent.push(id + '@' + L + (started ? '' : '(refused: ' + w.log.msgs.slice(-1)[0] + ')'));
          w.S.hero.x = 20.5; w.S.hero.y = 20.5;
        } catch (e) { errors.push(id + '@' + L + ': ' + e.stack.split('\n').slice(0, 2).join(' | ')); }
      });
    });
  });
  eq(errors, [], 'every D2S skill of all 7 classes casts at slvl 1 and 12 and runs 2.5 s without throwing');
  ok(silent.length === 0, 'every D2S skill changes the world (damage, summon, buff or aura)', silent);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
