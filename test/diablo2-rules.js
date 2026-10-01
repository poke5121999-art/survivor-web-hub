// node test/diablo2-rules.js — behaviour tests for games/diablo2/js/rules.js against the 1.14d tables.
// Expected numbers are worked out by hand from the tables (cited per test) or quoted from Arreat Summit.
'use strict';
const path = require('path');
require(path.join(__dirname, '..', 'games', 'diablo2', 'js', 'data.js'));
const R = require(path.join(__dirname, '..', 'games', 'diablo2', 'js', 'rules.js'));
const D = globalThis.D2DATA;

let pass = 0, fail = 0;
function ok(cond, msg, detail) {
  if (cond) { pass++; console.log('✔ ' + msg); }
  else { fail++; console.log('✘ ' + msg + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
}
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function near(a, b, eps, msg) { ok(Math.abs(a - b) <= eps, msg + ' (got ' + a + ', want ' + b + ' ±' + eps + ')'); }

// ---------------------------------------------------------------- classes (charstats.txt)
{
  const a = R.newCharacter('amazon', 'Ama');
  eq([a.str, a.dex, a.vit, a.ene], [20, 25, 20, 15], 'new Amazon has str 20 dex 25 vit 20 ene 15');
  const d = R.derived(a);
  eq([d.maxHp, d.maxMp, d.maxStamina], [50, 15, 84], 'Amazon life 50 (hpadd 30 + vit 20), mana 15, stamina 84');
  eq(d.ar, 95, 'Amazon attack rating = (dex-7)*5 + ToHitFactor 5');
  ok(a.equip.lhand.def >= 4 && a.equip.lhand.def <= 6 && d.def === Math.floor(25 / 4) + a.equip.lhand.def, 'Amazon defense = dex/4 + Buckler (4-6)', d.def);
  ok(a.equip.rhand && a.equip.rhand.base === 'jav' && a.equip.lhand.base === 'buc', 'Amazon starts with Javelin + Buckler (charstats item1/item2)');
  eq(a.belt.filter(i => i.base === 'hp1').length, 4, 'Amazon starts with 4 Minor Healing Potions');
  eq([a.lvl, a.statPts, a.skillPts, Object.keys(a.skills).length], [1, 0, 0, 0], 'new character: level 1, no unspent points, no class skills');
  const s = R.derived(R.newCharacter('sorceress'));
  eq([s.maxHp, s.maxMp], [40, 35], 'Sorceress life 40, mana 35');
  const b = R.newCharacter('barbarian');
  const bd = R.derived(b);
  eq([b.str, b.dex, b.vit, b.ene, bd.maxHp, bd.maxMp, bd.ar], [30, 20, 25, 10, 55, 10, 85], 'Barbarian 30/20/25/10, life 55, mana 10, AR 85');
  eq(Object.keys(D.classes).length, 7, 'all 7 classes present');
  eq(D.classes.amazon.tabs, ['Bow and Crossbow', 'Passive and Magic', 'Javelin and Spear'], 'Amazon skill tabs');
  eq(D.classes.paladin.tabs[0], 'Combat', 'Paladin tab 1 is Combat (string-table fix)');
  for (const c of Object.values(D.classes)) {
    ok(c.skills.length === 30, c.name + ' has 30 skills in 3 tabs', c.skills.length);
  }
}

// ---------------------------------------------------------------- leveling / experience
{
  eq(R.xpToReach(2), 500, 'XP to reach level 2 is 500 (experience.txt)');
  eq(R.xpToReach(3), 1500, 'XP to reach level 3 is 1500');
  eq(R.xpToReach(99), 3520485254, 'XP to reach level 99 is 3,520,485,254');
  const a = R.newCharacter('amazon');
  const g = R.grantXp(a, 1, 500);
  eq([g.gained, g.leveled, a.lvl, a.statPts, a.skillPts], [500, 1, 2, 5, 1], 'killing for 500 XP levels 1->2, +5 stat, +1 skill point');
  const d = R.derived(a);
  eq([d.maxHp, d.maxMp], [52, 16], 'Amazon level 2: +2 life (LifePerLevel 8/4), +1.5 mana (6/4) floored');
  // [D2MOO SUNITDMG_ComputeExperienceGain]
  eq(R.xpGain(1, 12, 100), 1, 'monster 11 levels above a level-1 char: 5/256 of XP');
  eq(R.xpGain(7, 1, 100), 80, 'monster 6 levels below: 207/256 of XP');
  eq(R.xpGain(10, 15, 100), 100, 'monster 5 above: full XP');
  eq(R.xpGain(30, 40, 100), 75, 'clvl >= 25 and monster above: XP * clvl/mlvl');
  eq(R.xpGain(70, 70, 1000), 953, 'level 70 penalty: ExpRatio 976/1024');
  eq(R.xpGain(99, 99, 1000), 0, 'no XP at level 99');
  ok(R.spendStat(a, 'vit') && R.derived(a).maxHp === 55, 'spending 1 vit on Amazon gives +3 life (LifePerVitality 12/4)');
}

// ---------------------------------------------------------------- skills
{
  const sor = R.newCharacter('sorceress');
  let e = R.skillEffect('fire_bolt', 1, sor);
  eq([e.dmg.min, e.dmg.max, e.dmg.elem, e.mana, e.kind], [3, 6, 'fire', 2.5, 'missile'], 'Fire Bolt slvl1: 3-6 fire, 2.5 mana (EMin 6/EMax 12, HitShift 7, mana 5<<7)');
  e = R.skillEffect('fire_bolt', 2, sor);
  eq([e.dmg.min, e.dmg.max], [4, 7], 'Fire Bolt slvl2: 4-7 (Arreat Summit)');
  e = R.skillEffect('fire_bolt', 10, sor);
  eq([e.dmg.min, e.dmg.max], [17, 22], 'Fire Bolt slvl10: 17-22 (Arreat Summit)');
  sor.skills.fire_ball = 5;
  e = R.skillEffect('fire_bolt', 10, sor);
  eq([e.dmg.min, e.dmg.max, e.elem.synergyPct], [31, 40, 80], 'Fire Bolt slvl10 + 5 Fire Ball: +16%/lvl synergy -> 31-40');
  delete sor.skills.fire_ball;
  e = R.skillEffect('inferno', 1, sor);
  eq([e.dmg.min, e.dmg.max], [12, 25], 'Inferno slvl1: 12-25 fire per second (Arreat Summit)');
  e = R.skillEffect('inferno', 2, sor);
  eq([e.dmg.min, e.dmg.max], [21, 34], 'Inferno slvl2: 21-34 per second (Arreat Summit)');
  eq(R.skillEffect('warmth', 2, sor).stats.manarecoverybonus, 42, 'Warmth slvl2: +42% mana regen');
  e = R.skillEffect('charged_bolt', 1, sor);
  eq([e.count, e.dmg.min, e.dmg.max, e.mana], [3, 2, 4, 3], 'Charged Bolt slvl1: 3 bolts of 2-4, 3 mana');
  eq(R.skillEffect('charged_bolt', 22, sor).count, 24, 'Charged Bolt bolts cap at 24 (min(24,ln12))');
  e = R.skillEffect('ice_bolt', 1, sor);
  eq([e.dmg.min, e.dmg.max, e.elem.durationSec], [3, 5, 6], 'Ice Bolt slvl1: 3-5 cold, 6 s chill');
  e = R.skillEffect('frozen_armor', 1, sor);
  eq([e.stats.defensePct, e.duration, e.freezeSec], [30, 120, 1.2], 'Frozen Armor slvl1: +30% def, 120 s, freezes 1.2 s');
  e = R.skillEffect('frost_nova', 1, sor);
  eq([e.dmg.min, e.dmg.max, e.elem.durationSec, e.kind], [2, 4, 8, 'nova'], 'Frost Nova slvl1: 2-4 cold, 8 s chill');
  e = R.skillEffect('ice_blast', 1, sor);
  eq([e.dmg.min, e.dmg.max, e.freezeSec], [8, 12, 3], 'Ice Blast slvl1: 8-12 cold, freezes 3 s');
  eq(R.skillEffect('static_field', 1, sor).lifePct, 25, 'Static Field takes 25% of current life');
  eq(R.skillEffect('telekinesis', 1, sor).dmg.max, 2, 'Telekinesis slvl1: 1-2 lightning');

  const ama = R.newCharacter('amazon');
  eq(R.skillEffect('magic_arrow', 1, ama).mana, 1.5, 'Magic Arrow slvl1 mana 1.5 (12<<5/256)');
  eq(R.skillEffect('magic_arrow', 13, ama).mana, 0, 'Magic Arrow costs 0 mana from slvl13');
  e = R.skillEffect('fire_arrow', 1, ama);
  eq([e.dmg.min, e.dmg.max, e.mana], [1, 4, 3], 'Fire Arrow slvl1: 1-4 fire, 3 mana');
  e = R.skillEffect('cold_arrow', 1, ama);
  eq([e.dmg.min, e.dmg.max, e.elem.durationSec], [3, 4, 4], 'Cold Arrow slvl1: 3-4 cold, 4 s');
  eq(R.skillEffect('multiple_shot', 1, ama).count, 2, 'Multiple Shot slvl1: 2 arrows');
  eq(R.skillEffect('multiple_shot', 1, ama).weaponPct, 75, 'Multiple Shot arrows deal 75% weapon damage (SrcDam 96/128)');
  e = R.skillEffect('jab', 3, ama);
  eq([e.dmgPct, e.toHitPct], [-9, 28], 'Jab slvl3: -9% damage, +28% AR (Arreat Summit)');
  eq(R.skillEffect('jab', 2, ama).mana, 2.25, 'Jab slvl2 mana 2.25 (Arreat shows 2.2)');
  e = R.skillEffect('power_strike', 2, ama);
  eq([e.dmg.min, e.dmg.max, e.toHitPct], [1, 34, 32], 'Power Strike slvl2: 1-34 lightning, +32% AR');
  e = R.skillEffect('poison_javelin', 1, ama);
  eq([e.dmg.min, e.dmg.max, e.elem.durationSec], [25, 37, 8], 'Poison Javelin slvl1: 25-37 over 8 s (Arreat Summit)');
  e = R.skillEffect('poison_javelin', 2, ama);
  eq([e.dmg.min, e.dmg.max, e.elem.durationSec], [46, 62, 10], 'Poison Javelin slvl2: 46-62 over 10 s (Arreat Summit)');
  e = R.skillEffect('inner_sight', 1, ama);
  eq([e.stats.armorclass, e.duration], [-40, 8], 'Inner Sight slvl1: -40 defense for 8 s');
  eq(R.skillEffect('critical_strike', 1, ama).stats.passive_critical_strike, 16, 'Critical Strike slvl1: 16% (dm12 5..80)');
  eq(R.skillEffect('dodge', 1, ama).stats.passive_dodge, 18, 'Dodge slvl1: 18% (dm12 10..65)');

  const bar = R.newCharacter('barbarian');
  e = R.skillEffect('bash', 1, bar);
  eq([e.dmgPct, e.addMin, e.toHitPct, e.mana], [50, 1, 20, 2], 'Bash slvl1: +50% dmg, +1 dmg, +20% AR, 2 mana');
  bar.skills.stun = 3;
  eq(R.skillEffect('bash', 1, bar).dmgPct, 65, 'Bash gets +5%/lvl from Stun (calc1 synergy)');
  e = R.skillEffect('stun', 1, bar);
  eq([e.stunSec, e.toHitPct], [1.2, 15], 'Stun slvl1: 1.2 s stun, +15% AR');
  e = R.skillEffect('sword_mastery', 1, bar);
  eq([e.stats.damagePct, e.stats.tohitPct, e.itype], [28, 28, 'swor'], 'Sword Mastery slvl1: +28% dmg, +28% AR');
  eq(R.skillEffect('axe_mastery', 2, bar).stats.damagePct, 33, 'Axe Mastery slvl2: +33% dmg');
  eq(R.skillEffect('mace_mastery', 1, bar).itype, 'blun', 'Mace Mastery applies to blunt weapons');
  e = R.skillEffect('howl', 1, bar);
  eq([e.kind, e.duration], ['nova', 3], 'Howl slvl1: monsters flee for 3 s');
  eq(R.skillEffect('find_potion', 1, bar).chancePct, 15, 'Find Potion slvl1: 15% (dm12 0..100)');
  eq(R.skillEffect('leap', 1, bar).kind, 'leap', 'Leap is a leap');
  eq(R.skillEffect('double_swing', 1, bar).toHitPct, 15, 'Double Swing slvl1: +15% AR');
  e = R.skillEffect('shout', 1, bar);
  eq([e.stats.defensePct, e.duration], [100, 20], 'Shout slvl1: +100% defense for 20 s');
  e = R.skillEffect('taunt', 1, bar);
  eq([e.stats.tohitPct, e.stats.damagePct], [-5, -5], 'Taunt slvl1: target -5% AR, -5% dmg');

  // prerequisites / required level
  const a2 = R.newCharacter('amazon');
  a2.lvl = 6; a2.skillPts = 3;
  ok(!R.learnSkill(a2, 'multiple_shot').ok, 'Multiple Shot needs Magic Arrow first');
  ok(R.learnSkill(a2, 'magic_arrow').ok && R.learnSkill(a2, 'multiple_shot').ok, 'Magic Arrow then Multiple Shot at clvl 6');
  ok(!R.learnSkill(a2, 'exploding_arrow').ok, 'Exploding Arrow needs clvl 12');
  eq(D.skills.valkyrie.prereq, ['decoy', 'evade'], 'Valkyrie needs Decoy + Evade (internal name Dopplezon mapped)');
  // every skill of every class evaluates at slvl 1..20
  let errs = 0, warnAct1 = [];
  const act1 = ['magic_arrow', 'fire_arrow', 'jab', 'inner_sight', 'critical_strike', 'dodge', 'cold_arrow', 'multiple_shot', 'power_strike', 'poison_javelin',
    'fire_bolt', 'warmth', 'charged_bolt', 'ice_bolt', 'frozen_armor', 'inferno', 'static_field', 'telekinesis', 'frost_nova', 'ice_blast',
    'bash', 'sword_mastery', 'axe_mastery', 'mace_mastery', 'howl', 'find_potion', 'leap', 'double_swing', 'shout', 'taunt', 'stun'];
  for (const k of Object.keys(D.skills)) for (let L = 1; L <= 20; L++) {
    try { const x = R.skillEffect(k, L, ama); if (act1.includes(k) && x.warnings.length) warnAct1.push(k); } catch (er) { errs++; }
  }
  eq(errs, 0, 'all 210 class skills evaluate at slvl 1-20');
  eq([...new Set(warnAct1)], [], 'the 31 Act I skills use only modelled calc terms');
}

// ---------------------------------------------------------------- combat formulas
{
  eq(R.hitChance(1, 1, 100000, 1), 0.05, 'hit chance floors at 5%');
  eq(R.hitChance(100000, 99, 0, 1), 0.95, 'hit chance caps at 95%');
  near(R.hitChance(95, 1, 10, 1), 2 * 95 / 105 * 1 / 2, 1e-12, 'hit chance = 2*AR/(AR+DEF) * alvl/(alvl+dlvl)');
  const a = R.newCharacter('amazon');
  a.gold = 1000; a.lvl = 5;
  const dp = R.deathPenalty(a);
  eq([dp.lost, dp.corpseGold, a.gold], [50, 950, 0], 'death at clvl 5 with 1000 gold: lose 5%, rest drops with corpse');
  eq(R.goldLimit(a), 50000, 'gold carried limit = 10000 * clvl');
  const b = R.newCharacter('barbarian');
  b.lvl = 1;
  eq(R.derived(b).block, Math.min(75, Math.floor((0 + 25) * (20 - 15) / 2)), 'block = (shield + class bonus) * (dex-15) / (2*clvl), max 75');
}

// ---------------------------------------------------------------- potions (misc.txt + Arreat Summit class multipliers)
{
  const hp1 = R.makeItem('hp1', 1);
  eq(R.potionEffect(hp1, R.newCharacter('amazon')).hp, 45, 'Minor Healing heals Amazon 45');
  eq(R.potionEffect(hp1, R.newCharacter('barbarian')).hp, 60, 'Minor Healing heals Barbarian 60');
  eq(R.potionEffect(hp1, R.newCharacter('sorceress')).hp, 30, 'Minor Healing heals Sorceress 30');
  eq(R.potionEffect(hp1, R.newCharacter('sorceress')).seconds, 7.68, 'Minor Healing lasts 192 frames = 7.68 s');
  const mp1 = R.makeItem('mp1', 1);
  eq([R.potionEffect(mp1, R.newCharacter('barbarian')).mp, R.potionEffect(mp1, R.newCharacter('amazon')).mp, R.potionEffect(mp1, R.newCharacter('sorceress')).mp], [20, 30, 40], 'Minor Mana: Barbarian 20, Amazon 30, Sorceress 40');
  eq(R.potionEffect(R.makeItem('hp2', 1), R.newCharacter('paladin')).hp, 90, 'Light Healing heals Paladin 90');
}

// ---------------------------------------------------------------- monsters (monstats + monlvl)
{
  // zombie1: Level 1; monlvl row 1 L-HP 7, L-AC 6, L-TH 8, L-DM 2, L-XP 30; minHP 101% maxHP 181%
  const hps = new Set();
  for (let s = 1; s <= 400; s++) hps.add(R.rollMonster('zombie1', 1, R.rng(s)).hp);
  eq([Math.min(...hps), Math.max(...hps)], [7, 12], 'Zombie HP rolls 7-12 (7*101/100 .. 7*181/100)');
  const z = R.rollMonster('zombie1', 1, R.rng(9));
  eq([z.lvl, z.ac, z.ar, z.dmg.min, z.dmg.max, z.xp], [1, 5, 8, 1, 3, 33], 'Zombie: mlvl 1, def 5, AR 8, dmg 1-3, 33 XP');
  eq([z.art, z.aiKind], ['enemy.zombie', 'melee_slow'], 'Zombie uses Flare enemy.zombie, slow melee AI');
  const c = R.rollMonster('zombie1', 1, R.rng(9), 'champion');
  eq([c.lvl, c.xp, c.dmg.min, c.dmg.max], [3, 99, 1, 5], 'champion Zombie: +2 mlvl, XP x3, +90% damage');
  ok(c.hp >= 21 && c.hp <= 36, 'champion Zombie HP x3 (21-36)', c.hp);
  const br = R.rollMonster('bloodraven', 3, R.rng(1));
  eq([br.lvl, br.hp, br.ac, br.ar, br.dmg.min, br.dmg.max, br.xp], [10, 113, 38, 225, 4, 6, 181], 'Blood Raven normal: mlvl 10, 113 HP (35*323%), AC 38, AR 225, 4-6, 181 XP');
  const cf = R.rollMonster('corpsefire', 1, R.rng(2));
  eq([cf.name, cf.kind, cf.lvl, cf.mods], ['Corpsefire', 'unique', 4, ['spectralhit']], 'Corpsefire: unique Zombie, mlvl 1+3, Spectral Hit');
  ok(cf.hp >= 28 && cf.hp <= 48 && cf.xp === 165, 'Corpsefire HP x4 (28-48), XP 33*5', [cf.hp, cf.xp]);
  const bb = R.rollMonster('bishibosh', 2, R.rng(2));
  eq([bb.lvl, bb.mods, bb.res.fire, bb.missile && bb.missile.id], [5, ['resist', 'fire'], 25 + 40 + 75, 'shafire1'], 'Bishibosh: Fallen Shaman +3, Magic Resistant + Fire Enchanted, casts fire');
  ok(bb.extraDmg.fire && bb.extraDmg.fire.max > 0, 'Fire Enchanted adds fire damage', bb.extraDmg);
  const q = R.rollMonster('quillrat1', 1, R.rng(3));
  eq([q.ranged, q.missile.id, q.missile.dmg], [true, 'spike1', { min: 1, max: 2 }], 'Quill Rat shoots spike1 (1-2)');
  const fs = R.rollMonster('fallenshaman1', 2, R.rng(3));
  eq([fs.resurrects, fs.missile.dmg.min, fs.missile.dmg.max, fs.art], ['fallen', 1, 4, 'enemy.goblin_elite'], 'Fallen Shaman: fireball 1-4, resurrects Fallen');
  eq(R.rollMonster('fallen1', 1, R.rng(3)).flee, { onAllyDeath: true }, 'Fallen flee when an ally dies');
  for (const a of Object.values(D.areas)) for (const m of a.monsters) {
    const x = R.rollMonster(m, a.lvl, R.rng(7));
    ok(x.hp > 0 && /^enemy\./.test(x.art), a.id + ': ' + m + ' (' + x.name + ') rolls with art ' + x.art);
  }
}

// ---------------------------------------------------------------- areas, quest, NPCs
{
  eq(D.areas.blood_moor.monsters, ['zombie1', 'fallen1', 'quillrat1'], 'Blood Moor monsters (levels.txt mon1-3)');
  eq(D.areas.den_of_evil.monsters, ['zombie1', 'brute1', 'fallenshaman1'], 'Den of Evil monsters (levels.txt)');
  eq(D.areas.cold_plains.monsters, ['brute1', 'corruptrogue1', 'fallenshaman1', 'cr_lancer1'], 'Cold Plains monsters (levels.txt)');
  eq(D.areas.burial_grounds.monsters, ['skeleton1', 'zombie2'], 'Burial Grounds monsters (levels.txt)');
  eq([D.areas.rogue_encampment.layout, D.areas.blood_moor.layout, D.areas.den_of_evil.layout], ['preset', 'outdoor', 'cave'], 'layouts');
  eq([D.areas.rogue_encampment.waypoint, D.areas.cold_plains.waypoint, D.areas.blood_moor.waypoint], [true, true, false], 'waypoints: town + Cold Plains, none in Blood Moor');
  eq(D.areas.den_of_evil.superuniques, ['corpsefire'], 'Corpsefire lives in the Den of Evil');
  eq(D.areas.burial_grounds.bosses, ['bloodraven'], 'Blood Raven in the Burial Grounds');
  const grid = D.areas.rogue_encampment.preset;
  ok(grid.length === 40 && grid.every(r => r.length === 56), 'camp preset is 56x40');
  const all = grid.join('');
  const count = ch => all.split(ch).length - 1;
  eq(['A', 'C', 'g', 'k', 'r', 'S', 'h'].map(count), [1, 1, 1, 1, 1, 1, 1], 'camp has one spot each for Akara, Charsi, Gheed, Kashya, Warriv, stash, hero');
  ok(count('W') === 4 && count('F') === 4 && count('E') >= 4, 'camp has waypoint, campfire and exits');
  ok([...new Set(all)].every(ch => D.areas.rogue_encampment.presetLegend[ch]), 'every camp char is in the legend');
  const a = R.newCharacter('necromancer');
  eq(D.quests.den_of_evil.giver, 'akara', 'Den of Evil is given by Akara');
  const qr = R.completeQuest(a, 'den_of_evil');
  eq([qr.ok, a.skillPts], [true, 1], 'Den of Evil reward grants 1 skill point');
  eq(R.completeQuest(a, 'den_of_evil').ok, false, 'Den of Evil reward only once');
  eq(Object.keys(D.npcs).sort(), ['akara', 'charsi', 'gheed', 'kashya', 'warriv'], 'Act I NPCs');
}

// ---------------------------------------------------------------- items / drops
{
  eq(R.affixLevel(10, 4, 0), 8, 'affix level = ilvl - qlvl/2');
  eq(R.affixLevel(10, 1, 1), 11, 'affix level with magic lvl = ilvl + magic lvl');
  const d1 = R.rollDrop('zombie1', 1, R.rng(12345));
  const d2 = R.rollDrop('zombie1', 1, R.rng(12345));
  eq(d1, d2, 'rollDrop with a fixed seed is deterministic');
  let many = [], empty = 0, N = 20000;
  const r = R.rng(777);
  for (let i = 0; i < N; i++) { const x = R.rollDrop('zombie1', 1, r); if (!x.length) empty++; many = many.concat(x); }
  // Act 1 H2H A: Picks 1, NoDrop 100 vs 21+16+21+2 = 60 -> 100/160 = 62.5% nothing
  near(empty / N, 0.625, 0.015, 'Zombie (Act 1 H2H A) drops nothing 62.5% of the time');
  const gold = many.filter(i => i.base === 'gld');
  ok(gold.length && gold.every(gl => gl.gold >= 1 && gl.gold <= 5), 'gold from an mlvl-1 kill is rand(5)+1 (1..5)', gold.slice(0, 3));
  near(gold.length / N, 21 / 160, 0.012, 'gold chance 21/160');
  ok(many.every(i => i.base === 'gld' || D.items.bases[i.base]), 'every dropped base exists in the tables');
  ok(many.some(i => i.q === 'magic') && many.some(i => i.q === 'low') && many.some(i => i.q === 'superior'), 'normal kills give low/normal/superior/magic items');
  const ring = many.filter(i => i.base === 'rin' || i.base === 'amu');
  ok(ring.length && ring.every(i => i.q !== 'normal'), 'rings/amulets are never plain (itemtypes Magic=1)', ring.map(i => i.q));
  const mag = many.filter(i => i.q === 'magic' && i.base !== 'rin' && i.base !== 'amu');
  ok(mag.every(i => R.itemName(i) !== D.items.bases[i.base].name && i.affixes.length > 0), 'magic items carry a prefix and/or suffix');
  // Corpsefire: Act 1 Super A, Picks -4 -> 2x Uitem A + 2x Cpot A (2 potions each) = 6 items; Magic 1024 => equipment at least magic
  for (let s = 1; s <= 30; s++) {
    const cf = R.rollDrop('corpsefire', 4, R.rng(s));
    const eqp = cf.filter(i => i.base !== 'gld' && D.items.bases[i.base].kind !== 'misc');
    if (cf.length !== 6 || eqp.some(i => ['magic', 'rare', 'set', 'unique'].indexOf(i.q) < 0)) { ok(false, 'Corpsefire drop shape', cf.map(i => i.base + ':' + i.q)); break; }
    if (s === 30) ok(true, 'Corpsefire drops 6 items; equipment is always magic or better (TC Magic=1024)');
  }
  const champ = R.rollDrop('zombie1', 3, R.rng(4), { kind: 'champion' });
  ok(champ.length === 3, 'champion (Act 1 Champ A, Picks -2): Citem A once + Cpot A once (Picks 2) = 3 items', champ.map(i => i.base));
  // determinism of item text
  const it = R.createItem('lsd', 10, 'magic', R.rng(5));
  ok(it.q === 'magic' && typeof R.itemName(it) === 'string' && R.itemStats(it).length >= 2, 'createItem magic Long Sword: ' + R.itemName(it) + ' | ' + R.itemStats(it).join('; '));
  const u = R.createItem('hax', 12, 'unique', R.rng(1));
  ok(u.q === 'unique' && u.uniqueName === 'The Gnasher', 'unique Hand Axe at ilvl 12 is The Gnasher', u.uniqueName);
  const fallback = R.createItem('hax', 1, 'unique', R.rng(1));
  ok(fallback.q === 'rare' || fallback.q === 'magic', 'unique roll below the unique level falls back to rare', fallback.q);
  ok(D.items.bases.lsd.icon === 'sword' && D.items.bases.sbw.icon === 'bow' && D.items.bases.lea.icon === 'body_armor', 'items carry Flare icon hints');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
