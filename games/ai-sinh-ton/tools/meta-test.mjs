// Checks of the account (js/meta.js) through the same calls the UI makes. Node only, fake storage.
// Usage: node tools/meta-test.mjs
import { createMeta } from '../js/meta.js';
import { levelCost, levelMul, HERO_RARITY, EVOLVE, stonesOf, DAILY } from '../js/data/economy.js';
import { heroDef } from '../js/data/beasts.js';
import { itemStat } from '../js/data/equip.js';
import { isUnlocked as import_isUnlocked } from '../js/data/unlocks.js';
import { HERO } from '../js/data/heroes.js';

const fails = [];
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const eq = (got, want, msg) => check(JSON.stringify(got) === JSON.stringify(want), `${msg} (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`);
const fakeStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
const KEY = 'aisinhton.save.v1';
let clock = new Date(2026, 10, 19, 9, 0, 0);
// most checks use the old four-hero account (preset vet); `brandNew` is the real new account
const fresh = (storage = fakeStorage()) => createMeta({ storage, now: () => clock, preset: 'vet' });
const brandNew = (storage = fakeStorage()) => createMeta({ storage, now: () => clock });
const give = (M, slot, item, tier = 0, lv = 1) => { const it = { uid: ++M.acc.uidSeq, item, tier, lv }; M.acc.bag.push(it); return it; };

// the old four-hero account (preset vet)
{
  const M = fresh();
  const a = M.acc;
  eq([a.v, a.gold, a.gems, a.pity, a.cleared], [2, 1500, 1000, 0, 0], 'new account: version, gold, gems, pity, cleared');
  eq(a.team, ['tegiap', 'nhim', 'loc', 'chon'], 'new account: team is the four starters');
  eq(Object.values(a.heroes).map((h) => h.level), [1, 1, 1, 1], 'new account: starters at level 1');
  eq(a.bag, [], 'new account: empty bag');
  eq([a.level, a.xp, a.cheatUnlock, a.freePull, a.ftue.session], [10, 0, true, false, true], 'vet preset: level 10, every unlock open, no free pull, first session finished');
  eq([M.slots(), M.unlocked('gacha'), M.unlocked('merge'), M.pendingReveals()], [4, true, true, []], 'vet preset: four slots, every feature open, nothing to reveal');
  check(M.ftueNext({ screen: 'home', event: 'home' }) === null && M.ftueNext({ screen: 'battle' }) === null, 'vet preset: no guide is pending');
}

// pulls spend and refuse
{
  const M = fresh();
  const r1 = M.pull(1);
  check(r1.ok && r1.results.length === 1 && M.acc.gems === 900, 'pull 1 spends 100 gems and returns one result');
  const r10 = M.pull(10);
  check(r10.ok && r10.results.length === 10 && M.acc.gems === 0, 'pull 10 spends 900 gems and returns ten results');
  check(r10.results.some((r) => ['hero_ssr', 'hero_sr', 'shard_ssr', 'shard_sr'].includes(r.row)), 'a ten-pull holds a Sử Thi-or-better row');
  const gems = M.acc.gems;
  const bad = M.pull(1);
  check(!bad.ok && bad.why === 'thiếu ngọc' && M.acc.gems === gems, 'pull with 0 gems is refused and spends nothing');
  M.acc.gems = 899;
  check(!M.pull(10).ok && M.acc.gems === 899, 'pull 10 with 899 gems is refused');
  check(!M.pull(3).ok, 'pull 3 is refused');
  eq(M.acc.stats.pulls, 11, 'stats count 11 pulls');
}

// 2000 pulls on a rich account: every result applied
{
  const M = fresh();
  M.acc.gems = 1e9;
  const heroesBefore = Object.values(M.acc.heroes).filter((h) => h.level > 0).length;
  let maxPity = 0; let bagGrowth = 0; let shardsExpected = {}; let dupeShards = 0; let newHeroes = 0; let goldExpected = M.acc.gold; let bad = 0;
  for (let i = 0; i < 2000; i++) {
    const own = (id) => !!(M.acc.heroes[id] && M.acc.heroes[id].level > 0);
    const before = M.acc.bag.length;
    const r = M.pull(1);
    if (!r.ok) { bad++; continue; }
    const x = r.results[0];
    maxPity = Math.max(maxPity, M.acc.pity);
    if (x.kind === 'item') { bagGrowth++; if (M.acc.bag.length !== before + 1 || !x.item || x.item.tier !== 0) bad++; }
    else if (M.acc.bag.length !== before) bad++;
    if (x.kind === 'gold') goldExpected += x.n;
    if (x.kind === 'hero' && x.isNew) { newHeroes++; if (!own(x.hero)) bad++; }
    if (x.dupe) { dupeShards++; if (x.kind !== 'shard' || x.n !== HERO_RARITY[HERO[x.hero].rarity].dupe) bad++; }
  }
  const heroesAfter = Object.values(M.acc.heroes).filter((h) => h.level > 0).length;
  check(bad === 0, '2000 pulls: every result applied as reported');
  check(heroesAfter > heroesBefore, `2000 pulls: hero count grew ${heroesBefore} -> ${heroesAfter}`);
  check(maxPity <= 50, `2000 pulls: pity never passed 50 (max ${maxPity})`);
  check(dupeShards > 0, `2000 pulls: duplicate heroes turned into shards (${dupeShards})`);
  check(Object.values(M.acc.heroes).some((h) => h.shards > 0), '2000 pulls: shards landed on heroes');
  check(M.acc.gold >= goldExpected, '2000 pulls: gold drops landed');
  check(bagGrowth > 0 && M.acc.bag.length === bagGrowth, `2000 pulls: ${bagGrowth} item rows are all in the bag`);
  check(new Set(M.acc.bag.map((i) => i.uid)).size === M.acc.bag.length, '2000 pulls: item uids are unique');
}

// shards craft a hero
{
  const M = fresh();
  M.acc.heroes.kiem = undefined; delete M.acc.heroes.kiem;
  const id = Object.keys(HERO).find((k) => HERO[k].rarity === 'R' && !M.acc.heroes[k]);
  M.acc.heroes[id] = { level: 0, shards: 29 };
  M.acc.gems = 1e6;
  let crafted = false;
  for (let i = 0; i < 400 && !crafted; i++) { const r = M.pull(1); if (M.acc.heroes[id].level === 1) crafted = true; }
  check(crafted && M.acc.heroes[id].shards < 30, 'shards craft a hero once they reach 30 (Hiếm)');
}

// level up
{
  const M = fresh();
  M.acc.heroes.tegiap.shards = 4;
  const r = M.levelUp('tegiap');
  check(r.ok && M.acc.heroes.tegiap.level === 2 && M.acc.heroes.tegiap.shards === 0 && M.acc.gold === 1450, 'level 1 -> 2 spends 4 shards and 50 gold');
  const no = M.levelUp('tegiap');
  check(!no.ok && no.why === 'thiếu mảnh' && M.acc.gold === 1450, 'level-up short of shards is refused');
  M.acc.heroes.tegiap.shards = 1e6; M.acc.gold = 10;
  const poor = M.levelUp('tegiap');
  check(!poor.ok && poor.why === 'thiếu vàng' && M.acc.heroes.tegiap.level === 2, 'level-up short of gold is refused');
  check(!M.levelUp('nobody').ok, 'level-up of an unknown hero is refused');
  M.acc.gold = 1e9;
  let prev = { shards: 0, gold: 0 }; let ok = true;
  for (let i = 0; i < 30; i++) {
    const L = M.acc.heroes.tegiap.level; const sh = M.acc.heroes.tegiap.shards; const go = M.acc.gold;
    const c = levelCost(L);
    if (!(c.shards > prev.shards && c.gold > prev.gold)) ok = false;
    prev = c;
    const r2 = M.levelUp('tegiap');
    if (!r2.ok || M.acc.heroes.tegiap.level !== L + 1 || M.acc.heroes.tegiap.shards !== sh - c.shards || M.acc.gold !== go - c.gold) ok = false;
  }
  check(ok && M.acc.heroes.tegiap.level === 32, '30 level-ups in a row each cost exactly levelCost and each costs more than the last');
}

// finishStage
{
  const M = fresh();
  const g0 = M.acc.gold; const m0 = Object.values(M.acc.mats).reduce((a, b) => a + b, 0);
  const r = M.finishStage({ stage: 3, won: true, wavesCleared: 5, seconds: 61 });
  check(r.ok && r.first && r.gold === 630 && r.gems === 120 && r.teamShards === 12 && r.mats === 2 && r.items.length === 3, 'stage 3 first clear: 630 gold, 120 gems, 12 shards, 2 mats, 3 items');
  check(M.acc.gold === g0 + 630 && M.acc.gems === 1120 && M.acc.cleared === 3 && M.acc.best[3] === 61, 'stage 3 first clear: applied to the account, best time recorded');
  check(M.acc.team.every((id) => M.acc.heroes[id].shards === 12), 'stage 3 first clear: each team hero got 12 shards');
  check(Object.values(M.acc.mats).reduce((a, b) => a + b, 0) === m0 + 2, 'stage 3 first clear: 2 mats landed');
  check(M.acc.bag.length === 3 && M.acc.bag.every((i) => i.tier === 0), 'stage 3 first clear: three Thường items in the bag');
  const slots = new Set(M.acc.bag.map((i) => itemSlot(i)));
  check(slots.size >= 1, 'stage 3 first clear: items in valid slots');
  const g1 = M.acc.gold;
  const rep = M.finishStage({ stage: 3, won: true, wavesCleared: 5, seconds: 70 });
  check(rep.ok && !rep.first && rep.gold === 210 && rep.gems === 20 && rep.teamShards === 4 && rep.mats === 2 && rep.items.length === 1, 'stage 3 repeat: 210 gold, 20 gems, 4 shards, 2 mats, 1 item');
  check(M.acc.gold === g1 + 210 && M.acc.best[3] === 61, 'stage 3 repeat: a slower time keeps the record');
  M.finishStage({ stage: 3, won: true, wavesCleared: 5, seconds: 50 });
  check(M.acc.best[3] === 50, 'stage 3: a faster time replaces the record');
  const g2 = M.acc.gold; const gem2 = M.acc.gems; const sh2 = M.acc.heroes.tegiap.shards;
  const loss = M.finishStage({ stage: 3, won: false, wavesCleared: 2, seconds: 30 });
  check(loss.ok && loss.gold === 50 && loss.gems === 0 && loss.teamShards === 0 && loss.items.length === 0, 'stage 3 loss after 2 waves: 50 gold only');
  check(M.acc.gold === g2 + 50 && M.acc.gems === gem2 && M.acc.heroes.tegiap.shards === sh2 && M.acc.cleared === 3, 'stage 3 loss: applied, cleared unchanged');
  const loss3 = M.finishStage({ stage: 3, won: false, wavesCleared: 3, seconds: 30 });
  check(loss3.teamShards === 1 && loss3.gold === 76, 'stage 3 loss after 3 waves: 76 gold, 1 shard');
  eq([M.acc.stats.wins, M.acc.stats.losses], [3, 2], 'stats count wins and losses');
  check(!M.finishStage({ stage: 0, won: true }).ok, 'stage 0 is refused');
}
function itemSlot(i) { return i.item.charAt(0); }

// first clear favours the slots the team has empty
{
  const M = fresh();
  for (const id of M.acc.team) { const e = {}; for (const s of ['weapon', 'necklace', 'gloves', 'armor', 'belt']) { const it = give(M, s, { weapon: 'w_cua', necklace: 'n_rang', gloves: 'g_da', armor: 'a_lop', belt: 'b_dan' }[s]); e[s] = it.uid; } e.boots = 0; M.acc.equip[id] = e; }
  const r = M.finishStage({ stage: 1, won: true, wavesCleared: 5, seconds: 40 });
  check(r.items.every((i) => i.item.startsWith('f_')), 'first clear: with only boots empty every dropped item is boots');
}

// save and reload
{
  const st = fakeStorage();
  const M = fresh(st);
  M.pull(10); M.finishStage({ stage: 2, won: true, wavesCleared: 5, seconds: 55 }); M.claimDaily();
  const M2 = fresh(st);
  eq(M2.acc, M.acc, 'save then a second createMeta reads the identical account');
  check(M2.readOnly === false, 'a normal save is not read-only');
}

// damaged saves
{
  const st = fakeStorage();
  st.setItem(KEY, '{"v":1,"gold":12,');
  let M; let threw = false;
  try { M = fresh(st); } catch (e) { threw = true; }
  check(!threw && M.acc.gold === 1500 && M.acc.team.length === 4, 'corrupted JSON gives a fresh account (the preset one) without throwing');

  const st2 = fakeStorage();
  st2.setItem(KEY, JSON.stringify({ v: 1, gems: 5 }));
  M = fresh(st2);
  check(M.acc.gems === 5 && M.acc.gold === 500 && M.acc.bag.length === 0 && M.acc.team.join() === 'chon' && M.acc.mats.weapon === 0, 'a save missing fields keeps what is there and defaults the rest (new-account values)');

  const st3 = fakeStorage();
  st3.setItem(KEY, JSON.stringify({ v: 1, gold: -50, gems: 'many' }));
  M = fresh(st3);
  check(M.acc.gold === 0 && M.acc.gems === 300, 'negative gold becomes 0 and a non-number gem count becomes the default');

  const st4 = fakeStorage();
  st4.setItem(KEY, JSON.stringify({
    v: 1, heroes: { thep: { level: 3, shards: 2 }, ghost: { level: 9, shards: 9 } }, team: ['ghost', 'thep', 'thep'],
    bag: [{ uid: 1, item: 'w_cua', tier: 0, lv: 1 }, { uid: 2, item: 'no_such_item', tier: 0, lv: 1 }, { uid: 3, item: 'w_cua', tier: 99, lv: 1 }, { uid: 4, item: 'g_da', tier: 1, lv: 500 }],
    equip: { thep: { weapon: 1, gloves: 2, boots: 1 }, ghost: { weapon: 4 } },
  }));
  M = fresh(st4);
  check(!M.acc.heroes.ghost && M.acc.heroes.tegiap.level === 3, 'an unknown hero id is dropped, a known one kept');
  eq(M.acc.team, ['tegiap'], 'team drops unknown ids and duplicates');
  eq(M.acc.bag.map((i) => i.uid), [1, 4], 'items with an unknown id or tier are dropped');
  check(M.acc.bag[1].lv === 20, 'item level is clamped to the tier cap');
  eq(M.acc.equip.tegiap, { weapon: 1, necklace: 0, gloves: 0, armor: 0, belt: 0, boots: 0 }, 'equip drops missing items, wrong-slot items and repeats');
  check(!M.acc.equip.ghost && M.acc.uidSeq >= 4, 'equip of unknown heroes dropped, uid sequence repaired');
  const st5 = fakeStorage();
  st5.setItem(KEY, 'null');
  check(fresh(st5).acc.gold === 1500, 'a null save gives a fresh account');
}

// a newer save is kept
{
  const st = fakeStorage();
  const raw = JSON.stringify({ v: 99, gold: 7, future: { a: 1 } });
  st.setItem(KEY, raw);
  const M = fresh(st);
  check(M.readOnly === true && M.acc.v === 2 && M.acc.gold === 1500, 'a v:99 save starts a fresh account in memory, read-only');
  M.finishStage({ stage: 1, won: true, wavesCleared: 5, seconds: 30 }); M.save();
  check(st.getItem(KEY) === raw, 'a v:99 save is never overwritten');
}

// equip
{
  const M = fresh();
  const w = give(M, 'weapon', 'w_cua');
  check(M.equip('tegiap', w.uid).ok && M.acc.equip.tegiap.weapon === w.uid, 'equip puts the item on the hero');
  const r = M.equip('nhim', w.uid);
  check(r.ok && r.from === 'tegiap' && M.acc.equip.tegiap.weapon === 0 && M.acc.equip.nhim.weapon === w.uid, 'equip moves the item from one hero to another');
  check(!M.equip('tegiap', 9999).ok && !M.equip('ghost', w.uid).ok, 'equip refuses an unknown item or hero');
  check(M.unequip('nhim', 'weapon').ok && M.acc.equip.nhim.weapon === 0, 'unequip empties the slot');
  check(!M.unequip('nhim', 'weapon').ok, 'unequip of an empty slot is refused');
}

// upgrade
{
  const M = fresh();
  const w = give(M, 'weapon', 'w_cua');
  M.acc.gold = 100; M.acc.mats.weapon = 0;
  check(!M.upgradeItem(w.uid).ok, 'upgrade without mats is refused');
  M.acc.mats.weapon = 5;
  const r = M.upgradeItem(w.uid);
  check(r.ok && w.lv === 2 && M.acc.gold === 60 && M.acc.mats.weapon === 4, 'upgrade 1 -> 2 costs 40 gold and 1 weapon mat');
  w.lv = 10;
  M.acc.gold = 1e6; M.acc.mats.weapon = 100;
  check(!M.upgradeItem(w.uid).ok, 'upgrade past the tier cap is refused');
}

// merge
{
  const M = fresh();
  const a = give(M, 'weapon', 'w_cua'); const b = give(M, 'weapon', 'w_cua', 0, 3); const c = give(M, 'weapon', 'w_cua', 0, 4);
  const r = M.merge(a.uid, [b.uid, c.uid]);
  check(r.ok && a.tier === 1 && M.acc.bag.length === 1, 'merge of 3 equal items makes one Tốt item');
  eq([M.acc.gold, M.acc.mats.weapon], [1500 + 154 + 362, 5], 'merge refunds the fodder upgrade costs in gold and weapon mats');
  const x = give(M, 'weapon', 'w_cua'); const y = give(M, 'weapon', 'w_no');
  check(!M.merge(a.uid, [x.uid, y.uid]).ok, 'merge with the wrong item or tier is refused');
  const p = give(M, 'weapon', 'w_cua'); const q = give(M, 'weapon', 'w_cua'); const s = give(M, 'weapon', 'w_cua');
  M.equip('tegiap', q.uid);
  const w = M.merge(p.uid, [q.uid, s.uid]);
  check(!w.ok && w.why === 'nguyên liệu đang được mặc' && M.acc.bag.length === 6, 'equipped fodder is refused');
}

// autoMerge
{
  const M = fresh();
  for (let i = 0; i < 9; i++) give(M, 'weapon', 'w_cua');
  const r = M.autoMerge();
  check(r.ok && r.merges === 4 && M.acc.bag.length === 1 && M.acc.bag[0].tier === 2, 'autoMerge of 9 equal Thường items leaves one Hiếm (4 merges)');
  check(!M.autoMerge().ok, 'autoMerge with nothing to merge is refused');
  const N = fresh();
  const items = []; for (let i = 0; i < 3; i++) items.push(give(N, 'weapon', 'w_cua'));
  N.equip('tegiap', items[2].uid);
  const nr = N.autoMerge();
  check(nr.ok && N.acc.bag.length === 1 && N.acc.bag[0].uid === items[2].uid && N.acc.equip.tegiap.weapon === items[2].uid, 'autoMerge keeps the worn piece as the main piece');
  const O = fresh();
  const o = [give(O, 'weapon', 'w_cua'), give(O, 'weapon', 'w_cua'), give(O, 'weapon', 'w_cua')];
  O.equip('tegiap', o[0].uid); O.equip('nhim', o[1].uid);
  check(!O.autoMerge().ok && O.acc.bag.length === 3, 'autoMerge never uses worn pieces as fodder');
}

// daily
{
  clock = new Date(2026, 10, 19, 9, 0, 0);
  const M = fresh();
  const g = M.acc.gems; const go = M.acc.gold;
  const r = M.claimDaily();
  check(r.ok && M.acc.gems === g + 150 && M.acc.gold === go + 500, 'daily chest gives 150 gems and 500 gold');
  const shards = M.acc.team.reduce((s, id) => s + M.acc.heroes[id].shards, 0);
  check(shards === 10, 'daily chest gives 10 shards to a team hero');
  clock = new Date(2026, 10, 19, 23, 59, 0);
  check(!M.claimDaily().ok && M.acc.gems === g + 150, 'daily chest twice on one day is refused');
  clock = new Date(2026, 10, 20, 0, 1, 0);
  check(M.dots().rewards && M.claimDaily().ok && M.acc.gems === g + 300, 'next local day: red dot is on and the chest can be taken again');
  clock = new Date(2026, 10, 19, 9, 0, 0);
}

// chapter
{
  const M = fresh();
  const r0 = M.claimChapter(0);
  check(!r0.ok && r0.why === 'chưa qua đủ ải của chương', 'chapter 0 chest needs 5 stages cleared');
  M.acc.cleared = 4;
  check(!M.claimChapter(0).ok, 'chapter 0 chest at 4 stages cleared is refused');
  M.acc.cleared = 5;
  const gems = M.acc.gems;
  const r = M.claimChapter(0);
  check(r.ok && M.acc.gems === gems + 300 && Object.values(M.acc.mats).every((n) => n === 5), 'chapter 0: 300 gems and 5 of each mat');
  check(M.acc.bag.length === 1 && M.acc.bag[0].tier === 2, 'chapter 0: one Hiếm item');
  check(!M.claimChapter(0).ok, 'chapter 0 chest twice is refused');
  check(!M.claimChapter(1).ok, 'chapter 1 needs 10 stages');
  M.acc.cleared = 10;
  M.claimChapter(1);
  check(Object.values(M.acc.mats).every((n) => n === 15), 'chapter 1 gives 10 of each mat on top (15 total)');
}

// team
{
  const M = fresh();
  check(!M.setTeam([]).ok && !M.setTeam(['tegiap', 'tegiap']).ok && !M.setTeam(['ghost']).ok && !M.setTeam(['tegiap', 'nhim', 'loc', 'chon', 'tegiap']).ok, 'setTeam refuses empty, duplicates, unknown and five heroes');
  check(M.setTeam(['nhim', 'tegiap']).ok && M.acc.team.join() === 'nhim,tegiap', 'setTeam accepts two owned heroes in order');
}

// teamSpec
{
  const M = fresh();
  M.acc.heroes.tegiap.level = 11;
  const w = give(M, 'weapon', 'w_cua', 1, 5); const ar = give(M, 'armor', 'a_lop', 2, 1);
  M.equip('tegiap', w.uid); M.equip('tegiap', ar.uid);
  const spec = M.teamSpec();
  const t = spec.find((s) => s.id === 'tegiap');
  check(Math.abs(t.mul - levelMul(11)) < 1e-12 && Math.abs(t.mul - 1.8) < 1e-12, 'teamSpec mul is levelMul(11) = 1.8');
  check(t.atkFlat === itemStat(w) && t.hpFlat === itemStat(ar) && t.atkFlat === 24 && t.hpFlat === 150, 'teamSpec includes equipment: +24 attack, +150 health');
  eq(spec.map((s) => s.id), M.acc.team, 'teamSpec follows the team order');
  const st = M.heroStats('tegiap');
  check(st.atk === Math.round(HERO.tegiap.atk * 1.8 + 24) && st.hp === Math.round(HERO.tegiap.hp * 1.8 + 150), 'heroStats combines level and equipment');
  check(M.power('tegiap') === Math.round(st.atk * 4 + st.hp / 2) && M.teamPower() === M.acc.team.reduce((s, id) => s + M.power(id), 0), 'power and teamPower follow the formula');
}

// dots and listeners
{
  const M = fresh();
  M.acc.gems = 99;
  check(M.dots().gacha === false, 'dots: no gacha dot at 99 gems');
  M.acc.gems = 100;
  check(M.dots().gacha === true, 'dots: gacha dot at 100 gems');
  check(M.dots().heroes === false, 'dots: no hero dot with no shards');
  M.acc.heroes.nhim.shards = 4;
  const d = M.dots();
  check(d.heroes === true && d.heroIds.nhim === true && !d.heroIds.tegiap, 'dots: hero dot for a hero that can level up');
  check(M.dots().equip === false, 'dots: no equipment dot with an empty bag');
  give(M, 'weapon', 'w_cua');
  check(M.dots().equip === true && M.dots().heroIds.tegiap === true, 'dots: a bag item better than an empty slot lights equipment and that hero');
  const seen = [];
  M.on((name, res) => seen.push([name, res.ok]));
  M.setTeam(['tegiap']); M.pull(99); M.levelUp('nhim');
  eq(seen, [['setTeam', true], ['levelUp', true]], 'listeners hear successful commands only');
}


// ---- new account, gating, XP, slots, free pull, gifts, old saves (the real start)
const win = (M, stage, extra = {}) => M.finishStage({ stage, won: true, wavesCleared: 5, seconds: 60, ...extra });
{
  const M = brandNew();
  const a = M.acc;
  eq([a.gold, a.gems, a.level, a.xp, a.cleared, a.freePull], [500, 300, 1, 0, 0, true], 'brand-new account: 500 gold, 300 gems, level 1, 0 xp, nothing cleared, free pull waiting');
  eq([Object.keys(a.heroes), a.team], [['chon'], ['chon']], 'brand-new account: only Chồn Gió, in the team');
  eq([a.ftue, a.cheatUnlock], [{ done: {}, session: false }, undefined], 'brand-new account: first session not started, no cheat');
  eq([M.slots(), M.unlocked('ult'), M.unlocked('cards'), M.unlocked('gacha')], [1, true, true, false], 'brand-new account: one slot, ult and cards open, gacha locked');
  eq(M.pendingReveals(), [], 'brand-new account: what is open from the start is not revealed');
  eq(M.lockText('gacha'), 'Mở khi qua ải 1', 'lockText of a stage unlock');
  eq(M.lockText('slot3'), 'Mở ở cấp 4', 'lockText of a level unlock');
}

// every gate refuses before its condition and accepts after
{
  const M = brandNew();
  M.acc.gems = 1e6; M.acc.gold = 1e6;
  const refused = (r, id) => !r.ok && r.why === M.lockText(id);
  const before = JSON.stringify(M.acc);
  check(refused(M.pull(1), 'gacha') && refused(M.levelUp('chon'), 'levelup') && refused(M.claimDaily(), 'daily') && refused(M.claimChapter(0), 'chapter'), 'locked at the start: pull, levelUp, claimDaily, claimChapter refuse with the lock text');
  check(refused(M.equip('chon', 1), 'equip') && refused(M.upgradeItem(1), 'equip') && refused(M.merge(1, [2, 3]), 'merge') && refused(M.autoMerge(), 'merge'), 'locked at the start: equip, upgradeItem, merge, autoMerge refuse with the lock text');
  eq(JSON.stringify(M.acc) === before, true, 'refused commands change nothing');
  win(M, 1);
  M.acc.heroes.chon.shards = 100;
  check(M.pull(1).ok, 'pull works after stage 1 (the free pull)');
  check(M.levelUp('chon').ok, 'levelUp works after stage 1');
  check(!M.claimDaily().ok && M.claimDaily().why === 'Mở ở cấp 4', 'daily still locked at level 2');
  win(M, 2); win(M, 3);
  check(M.acc.level >= 4 && M.claimDaily().ok, 'daily opens at level 4 (reached by clearing stages)');
  check(refused(M.claimChapter(0), 'chapter'), 'chapter chest locked before stage 5');
  win(M, 4); win(M, 5);
  check(M.claimChapter(0).ok, 'chapter chest opens after stage 5');
  check(refused(M.equip('chon', 1), 'equip') === (M.acc.level < 6), 'equip follows level 6');
  for (let s = 6; M.acc.level < 6; s++) win(M, s);
  check(M.unlocked('equip') && M.acc.bag.length === 2 && M.acc.bag[0].item === 'w_cua', 'equip opens at level 6: the gift weapon and the chapter chest item (claimed just after) are the whole bag');
  const w = M.acc.bag[0];
  check(M.equip('chon', w.uid).ok && M.upgradeItem(w.uid).ok, 'equip and the free first upgrade work at level 6');
  check(refused(M.autoMerge(), 'merge'), 'merge is still locked with one item');
  for (let i = 0; i < 3; i++) give(M, 'weapon', 'w_cua');
  check(M.unlocked('merge') === true, 'three identical items in the bag open merge');
}

// equipment before and after Trang Bị opens (literal numbers)
{
  const N = brandNew();
  win(N, 1);
  N.acc.gold = 0; N.acc.gems = 1000; N.acc.freePull = false; N.acc.pity = 0;
  const g0 = N.acc.gold;
  const r = N.finishStage({ stage: 3, won: true, wavesCleared: 5, seconds: 40 });
  check(r.items.length === 0 && N.acc.bag.length === 0 && Object.values(N.acc.mats).every((n) => n === 0), 'before level 6: a first clear drops no item and no material');
  eq([r.gold, r.itemGold, N.acc.gold - g0, r.mats], [630 + 3 * 30 + 2 * 10, 110, 630 + 110, 0], 'before level 6: stage 3 first clear pays 630 gold plus 3 items x 30 and 2 mats x 10 as gold');
  eq(M0pull(N), [300, 0], 'before level 6: a gacha item row pays 300 gold (kind gold, n 300) and adds no item');
  // level 5 -> 6
  while (N.acc.level < 5) N.finishStage({ stage: 1, won: true, wavesCleared: 5, seconds: 40 });
  const bagBefore = N.acc.bag.length;
  eq([N.unlocked('equip'), bagBefore], [false, 0], 'level 5: Trang Bị locked, bag empty');
  let up = null;
  while (!up) { const q = N.finishStage({ stage: 1, won: true, wavesCleared: 5, seconds: 40 }); if (q.unlocked.includes('equip')) up = q; }
  eq([up.unlocked.includes('equip'), N.acc.bag.length, N.acc.bag[0].item, N.acc.bag[0].tier, N.acc.bag[0].lv, up.items.length], [true, 1, 'w_cua', 0, 1, 1], 'the unlock gives exactly one level-1 Thường Cưa Xích Cũ and nothing else');
  eq(N.openSlots(), ['weapon'], 'at the unlock only the weapon slot is open');
  check(!N.slotOpen('armor') && N.slotLine('armor') === 'Giáp: Rơi từ ải ' + (N.acc.equipAt + 2) + ' trở đi', 'a closed slot says where it drops: ' + N.slotLine('armor'));
  const at = N.acc.equipAt;
  const w1 = N.finishStage({ stage: 2, won: true, wavesCleared: 5, seconds: 40 });
  check(w1.items.length === 0 || w1.items.every((i) => ['w_cua', 'w_no', 'w_bua'].includes(i.item)), 'stages after the unlock drop weapons only while only the weapon slot is open');
  eq(N.acc.mats, { weapon: 0, necklace: 0, gloves: 0, armor: 0, belt: 0, boots: 0 }, 'materials still pay gold before the first upgrade');
  // slot opening order by stages cleared after the unlock
  N.acc.cleared = at; N.acc.equipAt = at;
  const order = [];
  for (let k = 0; k <= 5; k++) { N.acc.cleared = at + k; order.push(N.openSlots().slice().sort().join('+')); }
  const S = (...x) => x.sort().join('+');
  eq(order, [S('weapon'), S('weapon', 'armor'), S('weapon', 'armor', 'gloves', 'boots'), S('weapon', 'armor', 'gloves', 'boots'), S('weapon', 'armor', 'gloves', 'boots', 'necklace', 'belt'), S('weapon', 'armor', 'gloves', 'boots', 'necklace', 'belt')], 'slots open: weapon; armor 1 stage later; gloves and boots 2; necklace and belt 4');
  N.acc.cleared = at;
  check(N.equip('chon', N.acc.bag[0].uid).ok, 'the weapon can be worn');
  check(!N.equip('chon', give(N, 'armor', 'a_lop').uid).ok && N.equip('chon', N.acc.bag[N.acc.bag.length - 1].uid).why === N.slotLine('armor'), 'an item of a closed slot cannot be worn (refused with the slot line)');
}
function M0pull(M) {
  // force the item row of the gacha table: the first pull whose row is an item
  for (let k = 0; k < 400; k++) { M.acc.gems = 1000; const g0 = M.acc.gold; const r = M.pull(1).results[0]; if (r.row === 'item') return [M.acc.gold - g0, M.acc.bag.length + (r.item ? 1 : 0) - M.acc.bag.length]; }
  return [-1, -1];
}

// XP and level
{
  const M = brandNew();
  const r = win(M, 1);
  eq([r.xp, r.levelBefore, r.levelAfter, M.acc.level, M.acc.xp], [140, 1, 2, 2, 60], 'first clear of stage 1: 140 xp, level 1 -> 2 with 60 left');
  const lose = M.finishStage({ stage: 2, won: false, wavesCleared: 2 });
  eq([lose.xp, lose.levelAfter, M.acc.xp], [20, 2, 80], 'a lost stage after 2 waves: 20 xp');
  const rep = win(M, 1);
  eq(rep.xp, 80, 'a repeat win: 5 waves and the clear, no first-clear bonus (80 xp)');
  eq([M.acc.level, M.acc.xp], [3, 50], 'xp rolls over: 160 xp is level 3 with 50 left');
}

// slots follow the table
{
  const M = brandNew();
  eq(M.slots(), 1, 'slots at level 1, stage 0: 1');
  M.acc.level = 4;
  eq(M.slots(), 2, 'slots at level 4, stage 0: slot 3 is open and slot 2 is not, the table counts open slots: 2');
  M.acc.level = 1;
  win(M, 1);
  eq([M.acc.level, M.slots()], [2, 2], 'slots at level 2, stage 1: 2');
  M.acc.level = 4;
  eq(M.slots(), 3, 'slots at level 4, stage 1: 3');
  M.acc.level = 7;
  eq(M.slots(), 4, 'slots at level 7, stage 1: 4');
}

// setTeam follows the slots, the first clear does not fill the team
{
  const M = brandNew();
  win(M, 1);
  eq(M.acc.team, ['chon'], 'tutorial won: the team is still just Chồn Gió (the guide fills slot 2)');
  eq(M.setTeam(['chon', 'loc']).ok, true, 'two heroes fit in two slots');
  M.pull(1);
  const r = M.setTeam(['chon', 'loc', 'nhim']);
  check(!r.ok && r.why === 'Mở ở cấp 4' && M.acc.team.length === 2, 'three heroes in two slots refused with the lock text');
}

// free pull and gifts
{
  const M = brandNew();
  win(M, 1);
  eq([M.acc.heroes.loc && M.acc.heroes.loc.level, M.acc.heroes.nhim], [1, undefined], 'gift: Lộc Đèn joins the account after stage 1');
  check(!M.pull(10).ok, 'pull 10 is refused while the free pull is waiting');
  const g = M.acc.gems;
  const p = M.pull(1);
  check(p.ok && p.free && p.results[0].hero === 'nhim' && p.results[0].isNew && M.acc.gems === g && M.acc.heroes.nhim.level === 1 && !M.acc.freePull, 'free pull costs nothing, gives Nhím Gai and uses itself up');
  const p2 = M.pull(1);
  check(p2.ok && M.acc.gems === g - 100, 'the next pull costs 100 gems');
  const r2 = win(M, 2);
  check(M.acc.heroes.tegiap.level === 1 && r2.gifts.join() === 'tegiap', 'gift: Tê Giáp joins after stage 2 and the result says so');
  eq(win(M, 2).gifts, [], 'a repeat clear gifts nothing');
}

// the unlocked list on the result that crosses a threshold
{
  const M = brandNew();
  const r1 = win(M, 1);
  eq(r1.unlocked, ['slot2', 'levelup', 'gacha'], 'stage 1 result lists slot 2, level-up and gacha');
  eq(r1.gifts, ['loc'], 'stage 1 result lists the tutorial gift');
  eq(M.pendingReveals(), ['slot2', 'levelup', 'gacha'], 'those three wait for their reveal');
  const r2 = win(M, 2);
  eq(r2.unlocked.sort(), ['spectate', 'speed'].sort(), 'stage 2 result lists spectate and speed (level 3 is reached too)');
  M.markSeen('gacha');
  eq(M.pendingReveals(), ['slot2', 'levelup', 'spectate', 'speed'], 'markSeen removes a reveal');
  const d0 = M.dots();
  check(d0.gacha && d0.heroes, 'unlocked but unvisited: red dots on the gacha and heroes tabs');
  M.visitTab('gacha'); M.visitTab('heroes');
  M.acc.gems = 0; M.acc.freePull = false; for (const h of Object.values(M.acc.heroes)) h.shards = 0;
  const d1 = M.dots();
  check(!d1.gacha && !d1.heroes, 'visiting the tabs clears those dots');
  M.markVisited('slot2');
  eq(M.acc.visited.slot2, true, 'markVisited records the feature');
}

// the first session steps
{
  const M = brandNew();
  eq(M.ftueNext({ screen: 'battle', event: 'tutorial:start' }).id, 'intro', 'ftueNext: the tutorial start gives the intro step');
  eq(M.ftueNext({ screen: 'battle', event: 'tutorial:ult_ready' }).id, 'ult', 'ftueNext: ult_ready gives the ult step');
  check(M.ftueNext({ screen: 'home', event: 'home' }) === null, 'ftueNext: at home before stage 1 there is nothing to guide');
  win(M, 1);
  eq(M.ftueNext({ screen: 'home', event: 'home' }).id, 'levelup', 'ftueNext: first home step after the tutorial is levelup');
  M.ftueDone('levelup');
  eq(M.ftueNext({ screen: 'home', event: 'home' }).id, 'gacha', 'ftueNext: then gacha');
  check(M.ftueDone('nope').ok === false, 'ftueDone of an unknown step is refused');
  for (const id of ['intro', 'ult', 'pick', 'join', 'boss', 'reward', 'gacha', 'team']) M.ftueDone(id);
  check(!M.acc.ftue.session && M.ftueNext({ screen: 'home', event: 'home' }).id === 'start2', 'one step left: the session is not over');
  M.ftueDone('start2');
  check(M.acc.ftue.session === true && M.ftueNext({ screen: 'home', event: 'home' }) === null, 'the last step finishes the session');
  const N = brandNew();
  N.ftueSkip();
  check(N.acc.ftue.session && FTUE_IDS_OK(N), 'ftueSkip finishes everything');
}
function FTUE_IDS_OK(M) { return ['intro', 'ult', 'pick', 'join', 'boss', 'reward', 'levelup', 'gacha', 'team', 'start2'].every((id) => M.acc.ftue.done[id]); }

// later guides: once, when the unlock opens
{
  const M = brandNew();
  win(M, 1); M.ftueSkip();
  check(M.ftueNext({ screen: 'battle' }) === null, 'later guide: nothing before spectate opens');
  win(M, 2);
  const g = M.ftueNext({ screen: 'battle' });
  check(g && g.id === 'spectate' && g.target === 'eye0', 'later guide: the eye step appears when stage 2 is cleared');
  M.ftueDone('spectate');
  eq(M.ftueNext({ screen: 'battle' }).id, 'speed', 'later guide: then the speed step (level 3)');
  M.ftueDone('speed');
  check(M.ftueNext({ screen: 'battle' }) === null, 'later guide: each shows once');
}

// old saves count as finished
{
  const st = fakeStorage();
  st.setItem(KEY, JSON.stringify({ v: 1, gold: 900, gems: 40, cleared: 3, heroes: { thep: { level: 2, shards: 0 }, mua: { level: 1, shards: 0 }, yta: { level: 1, shards: 0 }, gio: { level: 1, shards: 0 } }, team: ['thep', 'mua', 'yta', 'gio'] }));
  const M = brandNew(st);
  eq([M.acc.ftue.session, M.acc.freePull, M.acc.level, M.acc.xp], [true, false, 4, 90], 'old save (cleared 3): session finished, no free pull, level and xp computed from the stages');
  check(M.ftueNext({ screen: 'home', event: 'home' }) === null && M.ftueNext({ screen: 'battle', event: 'tutorial:start' }) === null && M.ftueNext({ screen: 'battle' }) === null, 'old save: no guide at all');
  eq(M.pendingReveals(), [], 'old save: nothing to reveal');
  eq([M.acc.team, M.slots()], [['tegiap', 'nhim', 'loc'], 3], 'old save: the team of four is trimmed to the three slots level 4 opens');
  check(M.unlocked('gacha') && M.unlocked('daily') && M.dots().rewards === true, 'old save: gacha and the daily chest are open');
}

// save and reload keep the account level and the guide state
{
  const st = fakeStorage();
  const M = brandNew(st);
  win(M, 1); M.ftueDone('intro'); M.markSeen('gacha'); M.visitTab('gacha');
  const M2 = brandNew(st);
  eq([M2.acc.level, M2.acc.xp, M2.acc.ftue.done.intro, M2.acc.seenUnlock.gacha, M2.acc.visited.gacha, M2.acc.freePull], [2, 60, true, true, true, true], 'save and reload keep level, xp, ftue, seen, visited and the free pull');
  eq(M2.acc, M.acc, 'save and reload give an identical account');
  const V = createMeta({ storage: st, now: () => clock, preset: 'vet' });
  eq(V.acc.cleared, 1, 'a preset is ignored when a save exists');
}

// the gentle opening: free first upgrade, merge by triple, equipBest, the dot reasons, old saves
// a new account taken to Trang Bị with two heroes and the weapon gift
const opened = () => {
  const M = brandNew();
  M.acc.heroes.loc = { level: 1, shards: 0 }; M.acc.team = ['chon'];
  win(M, 1); M.acc.level = 5; M.acc.xp = 199; win(M, 2); // crosses to level 6 and hands the weapon over
  return M;
};
{
  const M = opened();
  const w = M.acc.bag[0];
  eq([M.unlocked('equip'), M.acc.bag.length, w.item, M.unlocked('upgrade'), true], [true, 1, 'w_cua', false, true], 'opened account: one weapon, upgrade not open yet');
  M.acc.gold = 1000; M.acc.mats.weapon = 0;
  const c1 = M.canUpgradeItem(w.uid);
  eq([c1.ok, c1.cost.gold, c1.cost.mats, c1.free], [true, 0, 0, true], 'the first upgrade is free (0 gold, 0 materials)');
  M.equip('chon', w.uid);
  const u1 = M.upgradeItem(w.uid);
  eq([u1.ok, u1.free, w.lv, M.acc.gold, M.acc.mats.weapon, M.unlocked('upgrade')], [true, true, 2, 1000, 0, true], 'free upgrade: level 2, gold and materials untouched, upgrade now open');
  const c2 = M.canUpgradeItem(w.uid);
  eq([c2.ok, c2.cost.gold, c2.cost.mats], [false, 114, 1], 'the second upgrade costs upgradeCost(2): 114 gold and 1 material (refused without the material)');
  M.acc.mats.weapon = 1; const u2 = M.upgradeItem(w.uid);
  eq([u2.ok, M.acc.gold, M.acc.mats.weapon, w.lv], [true, 1000 - 114, 0, 3], 'the second upgrade takes 114 gold and 1 weapon material');
  const r = M.finishStage({ stage: 3, won: true, wavesCleared: 5, seconds: 40 });
  check(r.mats === 2 && Object.values(M.acc.mats).reduce((a, b) => a + b, 0) === 2, 'after the first upgrade materials drop again');
}
{
  // merge: triple of the same item and tier, latched; no bag field means locked
  const M = opened();
  const noBag = { level: 20, cleared: 40 }; 
  check(M.lockText('merge') === 'Có 3 món giống nhau thì mở', 'merge lock text names the condition');
  give(M, 'weapon', 'w_cua'); eq(M.unlocked('merge'), false, 'merge: two identical items keep it locked');
  give(M, 'weapon', 'w_no'); eq(M.unlocked('merge'), false, 'merge: two of one kind plus another still locked');
  give(M, 'weapon', 'w_cua'); eq(M.unlocked('merge'), true, 'merge: three identical items open it');
  check(M.pendingReveals().includes('merge'), 'merge opening is announced by a reveal');
  eq([M.autoShown(), M.acc.stats.merges], [false, 0], 'Ghép Nhanh is hidden before the first manual merge');
  const ids = M.acc.bag.filter((i) => i.item === 'w_cua').map((i) => i.uid);
  const t = M.guideTokens();
  eq([t['bag-main'], t['bag-copy1'], t['bag-copy2']], ids.map((u) => 'bag-' + u), 'guide tokens name the triple');
  check(M.merge(ids[0], ids.slice(1)).ok, 'the guided merge works');
  eq([M.unlocked('merge'), M.autoShown(), M.acc.stats.merges, M.acc.bag.filter((i) => i.tier === 1 && i.item === 'w_cua').length], [true, true, 1, 1], 'merge stays open after the triple is gone; Ghép Nhanh shows; one Tốt Cưa Xích Cũ');
  const st = fakeStorage(); const M3 = brandNew(st); M3.acc = M.acc; M3.save(); const M4 = brandNew(st);
  eq([M4.unlocked('merge'), M4.autoShown()], [true, true], 'merge and Ghép Nhanh survive a reload');
  eq(import_isUnlocked(noBag, 'merge'), false, 'isUnlocked works when the account has no bag field (merge locked)');
}
{
  // equipBest: strongest free item per opened slot, never one another hero wears
  const M = fresh();
  const a = give(M, 'weapon', 'w_cua'), b = give(M, 'weapon', 'w_bua', 1), c = give(M, 'armor', 'a_lop'), d = give(M, 'armor', 'a_kevlar');
  M.equip('nhim', b.uid);
  const plan = M.equipBestPlan('tegiap');
  eq(plan.changes.map((x) => x.slot + ':' + x.uid), ['weapon:' + a.uid, 'armor:' + c.uid], 'equipBestPlan: the free weapon (the better one is worn by another hero) and the stronger armour');
  const r = M.equipBest('tegiap');
  eq([r.ok, r.changes.length, r.gain.atk, r.gain.hp, M.acc.equip.tegiap.weapon, M.acc.equip.tegiap.armor, M.acc.equip.nhim.weapon], [true, 2, itemStat(a), itemStat(c), a.uid, c.uid, b.uid], 'equipBest wears them and reports the gain');
  check(!M.equipBest('tegiap').ok && M.equipBest('tegiap').why === 'không có món nào mạnh hơn', 'equipBest with nothing better is refused');
  const N = brandNew(); check(!N.equipBest('chon').ok && N.equipBest('chon').why === N.lockText('equip'), 'equipBest before Trang Bị refuses with the lock text');
}
{
  // every dot reason flips the tab dot on and off, for team heroes only
  const M = opened(); M.acc.gold = 0; M.acc.mats.weapon = 0;
  const w = M.acc.bag[0];
  M.acc.stats.upgrades = 1; // past the free upgrade
  let d = M.dots();
  eq([d.equip, d.equipWhy.better, d.slotDots.chon.weapon, d.best.chon], [true, true, 'better', true], 'dot: a stronger free item for an opened slot lights the tab, the slot and Mặc Tốt Nhất');
  M.equip('chon', w.uid); d = M.dots();
  eq([d.equip, d.equipWhy.better, d.slotDots.chon.weapon, !!d.best.chon], [false, false, undefined, false], 'dot off: worn, nothing to upgrade without gold and materials');
  M.acc.gold = 500; M.acc.mats.weapon = 5; d = M.dots();
  eq([d.equip, d.equipWhy.upgrade, d.slotDots.chon.weapon], [true, true, 'upgrade'], 'dot: an equipped item that can be upgraded lights the tab and its slot');
  M.acc.gold = 0; d = M.dots(); eq(d.equip, false, 'dot off: not enough gold to upgrade');
  const x = give(M, 'weapon', 'w_cua'), y = give(M, 'weapon', 'w_cua');
  d = M.dots(); eq([d.equip, d.equipWhy.merge, d.merge], [true, true, true], 'dot: a merge is possible (three identical, two free) lights the tab');
  check(M.dots().slotDots.chon.weapon === undefined, 'the merge dot is on GHÉP, not on a slot');
  M.merge(x.uid, [y.uid, w.uid]).ok || M.autoMerge();
  d = M.dots(); eq(d.equipWhy.merge, false, 'dot off: nothing left to merge');
  const z = give(M, 'gloves', 'g_da'); d = M.dots();
  eq([d.equip, d.slotDots.chon.gloves], [false, undefined], 'no dot for a new item in a closed slot (and none for a new item alone)');
  const V = fresh(); const t = give(V, 'weapon', 'w_cua');
  eq([V.dots().equip, V.dots().slotDots.tegiap.weapon], [true, 'better'], 'dot: a vet account opens every slot');
  V.acc.team = ['tegiap']; V.equip('nhim', t.uid); eq(V.dots().equip, false, 'dot off: the only better item is worn by a hero outside the team and nobody else lacks one');
}
{
  // old saves keep everything they had
  const st = fakeStorage();
  st.setItem(KEY, JSON.stringify({ v: 1, gold: 900, gems: 40, cleared: 12, level: 9, heroes: { thep: { level: 2, shards: 0 }, gio: { level: 1, shards: 0 } }, team: ['thep', 'gio'], bag: [{ uid: 1, item: 'w_cua', tier: 0, lv: 3 }, { uid: 2, item: 'a_lop', tier: 0, lv: 1 }], ftue: { done: {}, session: true }, seenUnlock: { gacha: true }, visited: {} }));
  const M = brandNew(st);
  eq([M.acc.bag.length, M.openSlots().length, M.unlocked('upgrade'), M.unlocked('merge'), M.acc.ftue.done.equip, M.pendingReveals().includes('upgrade'), M.pendingReveals().includes('slot_hands')], [2, 6, true, true, true, false, false], 'an old save at level 9 keeps its items, every slot, upgrade and merge, and plays no equipment guide or reveal');
  for (const scr of ['home', 'battle']) { const g = M.ftueNext({ screen: scr }); check(!(g && (g.id === 'equip' || g.id === 'merge')), `old save: no equipment or merge guide on ${scr}`); }
}

// review defect 1: the merge unlock and the guide count only what the merge screen accepts (worn copies cannot be fodder, a worn main is fine)
{
  const M = brandNew(); const a = M.acc;
  Object.assign(a, { level: 9, cleared: 9, equipAt: 0, mergeOpen: false });
  for (const id of ['nhim', 'loc', 'tegiap']) a.heroes[id] = { level: 1, shards: 0 };
  a.team = ['chon', 'nhim', 'loc', 'tegiap'];
  give(M, 'weapon', 'w_cua'); give(M, 'weapon', 'w_cua');
  for (const h of a.team) M.equipBest(h);
  const third = give(M, 'weapon', 'w_cua');
  check(M.unlocked('merge') === false && !a.mergeOpen, 'worn copies: two of three identical weapons are worn, merge stays locked');
  eq(M.guideTokens()['bag-main'], undefined, 'worn copies: the guide has no merge target');
  check(M.ftueNext({ screen: 'home' }) === null || M.ftueNext({ screen: 'home' }).id !== 'merge', 'worn copies: the merge guide is not offered');
  const wornUid = a.equip.chon.weapon;
  M.unequip('nhim', 'weapon');
  const tk = M.guideTokens(), copies = a.bag.filter((i) => i.uid !== wornUid);
  check(M.unlocked('merge') === true, 'one worn and two free copies: merge opens');
  eq([tk['bag-main'], tk['bag-copy1'], tk['bag-copy2']], ['bag-' + wornUid, 'bag-' + copies[0].uid, 'bag-' + copies[1].uid], 'the guide names the worn piece as main and two free copies');
  const r = M.merge(wornUid, copies.map((i) => i.uid));
  check(r.ok && a.equip.chon.weapon === wornUid && a.bag.find((i) => i.uid === wornUid).tier === 1, 'a worn main piece merges and stays worn');
  void third;
}

// review defect 2: a new save at level 9 without a triple keeps merge locked across a reload; a true old-format save has it open
{
  const st = fakeStorage();
  const M = brandNew(st); Object.assign(M.acc, { level: 9, cleared: 9, equipAt: 0 }); M.save();
  const R = brandNew(st); R.load();
  check(R.unlocked('merge') === false && !R.acc.ftue.done.merge, 'new save at level 9 without a triple: merge stays locked and its guide is not done after a reload');
  const R2 = brandNew(st); R2.load();
  check(R2.unlocked('merge') === false, 'and after a second reload');
  const old = fakeStorage();
  old.setItem(KEY, JSON.stringify({ v: 1, gold: 9, gems: 0, cleared: 12, level: 9, heroes: { gio: { level: 1, shards: 0 } }, team: ['gio'], bag: [], ftue: { done: {}, session: true }, seenUnlock: {}, visited: {} }));
  check(brandNew(old).unlocked('merge') === true, 'old-format save at level 9: merge is open');
}

// review defect 3: an old save below level 6 that already holds items
{
  const mk = (bag) => {
    const st = fakeStorage();
    st.setItem(KEY, JSON.stringify({ v: 1, gold: 9, gems: 0, cleared: 4, level: 5, xp: 0, heroes: { gio: { level: 1, shards: 0 } }, team: ['gio'], bag, ftue: { done: {}, session: true }, seenUnlock: {}, visited: {} }));
    return brandNew(st);
  };
  const M = mk([{ uid: 1, item: 'a_lop', tier: 0, lv: 1 }, { uid: 2, item: 'w_cua', tier: 0, lv: 1 }, { uid: 3, item: 'w_cua', tier: 0, lv: 1 }, { uid: 4, item: 'w_cua', tier: 0, lv: 1 }]);
  check(M.unlocked('equip') === false && M.unlocked('merge') === false, 'old level-5 save with three weapons: Trang Bị and merge are both locked');
  check(!M.merge(2, [3, 4]).ok && !M.autoMerge().ok && M.acc.bag.length === 4, 'old level-5 save: merge and autoMerge are refused');
  M.acc.xp = 10000; const f = M.finishStage({ stage: 5, won: true, wavesCleared: 5 });
  check(M.unlocked('equip') && f.gift === null, 'Trang Bị opens with a weapon already in the bag: no gift');
  const g = M.ftueNext({ screen: 'home', skip: ['daily', 'chapter'] });
  check(g && g.id === 'equip' && M.guideTokens()['bag-first'] === 'bag-2', 'the equipment guide starts at the weapon, not at the armour piece of a closed slot');
  const N = mk([{ uid: 1, item: 'a_lop', tier: 0, lv: 1 }]);
  N.acc.xp = 10000; const f2 = N.finishStage({ stage: 5, won: true, wavesCleared: 5 });
  check(f2.gift && N.guideTokens()['bag-first'] === 'bag-' + f2.gift.uid, 'armour only: the gift weapon is given and the guide points at it');
}

// account deletion: wiping the storage then loading gives the account a first run gives, whatever was there before
{
  const first = brandNew(); first.load();
  const want = JSON.stringify(first.acc);
  const variants = {
    'a played save': () => { const s = fakeStorage(); const M = fresh(s); M.load(); M.finishStage({ stage: 1, won: true, wavesCleared: 5, seconds: 30 }); M.save(); return s; },
    'an old version save': () => { const s = fakeStorage(); s.setItem(KEY, JSON.stringify({ v: 0, gold: 99999, heroes: {} })); return s; },
    'a newer (read-only) save': () => { const s = fakeStorage(); s.setItem(KEY, JSON.stringify({ v: 999, gold: 99999 })); return s; },
    'an unreadable save': () => { const s = fakeStorage(); s.setItem(KEY, '{not json'); return s; },
  };
  for (const [name, mk] of Object.entries(variants)) {
    const s = mk(); const before = createMeta({ storage: s, now: () => clock }); before.load();
    s.m.delete(KEY);
    const M = createMeta({ storage: s, now: () => clock }); M.load();
    check(JSON.stringify(M.acc) === want && !M.readOnly, `wipe after ${name}, then load: the same account as a first run, writable`);
    check(M.acc.gold === 500 && M.acc.gems === 300 && Object.keys(M.acc.heroes).join() === 'chon' && M.acc.cleared === 0 && !M.acc.ftue.session, `wipe after ${name}: 500 gold, 300 gems, only Chồn Gió, cleared 0, first session not done`);
  }
}


// evolution: what it asks, what it takes, forms and branches, and the drops that feed it
{
  const M = fresh(); const A = M.acc; const te = A.heroes.tegiap;
  const stock = () => { A.gold = 1e6; te.shards = 1000; A.evo.stone.dat = 100; A.evo.core = 10; };
  const locked = brandNew(); locked.acc.heroes.chon.level = 30;
  check(!locked.canEvolve('chon').ok && locked.canEvolve('chon').why === 'Mở ở cấp 8 hoặc khi qua ải 6', `evolve is locked on a new account: "${locked.canEvolve('chon').why}"`);
  stock(); te.level = EVOLVE[2].level - 1;
  eq([M.canEvolve('tegiap').ok, M.canEvolve('tegiap').why, M.canEvolve('tegiap').form], [false, `chưa đủ cấp ${EVOLVE[2].level}`, 2], 'form 2 below its level is refused with the state');
  te.level = EVOLVE[2].level; A.evo.stone.dat = EVOLVE[2].stones - 1;
  eq(M.canEvolve('tegiap').why, 'thiếu 1 Đá Mầm Đất', 'one Đá Mầm short is named by element');
  A.evo.stone.dat = 100; A.gold = EVOLVE[2].gold - 1;
  eq(M.canEvolve('tegiap').why, 'thiếu 1 vàng', 'gold short');
  stock(); const g0 = A.gold, s0 = te.shards, d0 = A.evo.stone.dat;
  const r = M.evolve('tegiap');
  check(r.ok && te.form === 2 && te.branch === null && g0 - A.gold === 5000 && s0 - te.shards === 30 && d0 - A.evo.stone.dat === 10 && A.evo.core === 10, `form 2 costs 5000 gold, 30 shards, 10 Đá Mầm Đất (paid ${g0 - A.gold}, ${s0 - te.shards}, ${d0 - A.evo.stone.dat}) and no Lõi Cổ`);
  check(EVOLVE[2].level === 8 && EVOLVE[3].level === 13 && EVOLVE[3].cleared === 15, `form 2 at beast level ${EVOLVE[2].level}, form 3 at ${EVOLVE[3].level} with stage ${EVOLVE[3].cleared} cleared (the levels tools/pacing.mjs settled)`);
  check(M.heroStats('tegiap').hp === Math.round(heroDef({ id: 'tegiap', form: 2 }).hp * levelMul(EVOLVE[2].level)) && M.teamSpec().find((x) => x.id === 'tegiap').form === 2, `stats and the battle spec follow the form (health ${M.heroStats('tegiap').hp} at level ${EVOLVE[2].level}, form 2)`);
  te.level = 30; A.cleared = 14;
  eq(M.canEvolve('tegiap', 'a').why, 'chưa qua ải 15', 'form 3 needs stage 15 cleared');
  A.cleared = 15;
  eq([M.canEvolve('tegiap').ok, M.canEvolve('tegiap').why], [false, 'chưa chọn nhánh'], 'a branching beast needs its path chosen');
  A.evo.core = 2; eq(M.canEvolve('tegiap', 'b').why, 'thiếu 1 Lõi Cổ', 'form 3 needs 3 Lõi Cổ');
  stock(); const g1 = A.gold, c1 = A.evo.core, d1 = A.evo.stone.dat, s1 = te.shards;
  check(M.evolve('tegiap', 'b').ok && te.form === 3 && te.branch === 'b' && g1 - A.gold === 20000 && c1 - A.evo.core === 3 && d1 - A.evo.stone.dat === 25 && s1 - te.shards === 80, `form 3 (branch b) costs 20000 gold, 80 shards, 25 stones, 3 Lõi Cổ (paid ${g1 - A.gold}, ${s1 - te.shards}, ${d1 - A.evo.stone.dat}, ${c1 - A.evo.core})`);
  eq(M.canEvolve('tegiap').why, 'đã ở dạng cuối', 'nothing past form 3');
  check(!M.rebranch('tegiap', 'b').ok && M.canRebranch('tegiap', 'b').why === 'đang ở nhánh này rồi', 'rebranching to the same path is refused');
  const g2 = A.gold, c2 = A.evo.core, d2 = A.evo.stone.dat;
  check(M.rebranch('tegiap', 'a').ok && te.branch === 'a' && g2 - A.gold === 10000 && A.evo.core === c2 && d2 - A.evo.stone.dat === 13, `switching to path a costs half (10000 gold, 13 stones; paid ${g2 - A.gold}, ${d2 - A.evo.stone.dat}) and no Lõi Cổ`);
  check(M.teamSpec().find((x) => x.id === 'tegiap').branch === 'a', 'the battle fights the new path');
  A.heroes.nhim.level = 30; A.evo.stone.bang = 99; A.heroes.nhim.shards = 999;
  M.evolve('nhim'); check(M.canEvolve('nhim').ok && M.canEvolve('nhim', 'x').ok && M.evolve('nhim').ok && A.heroes.nhim.form === 3 && A.heroes.nhim.branch === null, 'a beast without a fork takes form 3 with no branch');
  check(!M.canRebranch('nhim', 'a').ok, 'a beast without a fork cannot rebranch');
  const dots = (() => { const N = fresh(); N.acc.heroes.loc.level = EVOLVE[2].level; N.acc.heroes.loc.shards = 30; N.acc.gold = 5000; N.acc.evo.stone.moc = 10; return N.dots(); })();
  check(dots.evolve && dots.evoIds.loc && !dots.evoIds.chon && dots.heroIds.loc, 'dots: a beast with all it needs for its next form lights the beast and the tab');
}
{
  const M = fresh(); const A = M.acc; A.cleared = 0;
  const r1 = M.finishStage({ stage: 1, won: true, wavesCleared: 5, seconds: 30 });
  const n1 = Object.values(r1.stones).reduce((a, b) => a + b, 0);
  check(n1 === 4 && Object.keys(r1.stones).every((e) => stonesOf(1).includes(e)) && r1.cores === 0, `a first clear of stage 1 drops 4 Đá Mầm of Mộc or Đất (${JSON.stringify(r1.stones)}), no Lõi Cổ`);
  const r1b = M.finishStage({ stage: 1, won: true, wavesCleared: 5, seconds: 30 });
  check(Object.values(r1b.stones).reduce((a, b) => a + b, 0) === 1, 'a repeat clear drops 1 Đá Mầm');
  A.cleared = 4; const r5 = M.finishStage({ stage: 5, won: true, wavesCleared: 5, seconds: 30 }); const r5b = M.finishStage({ stage: 5, won: true, wavesCleared: 5, seconds: 30 });
  check(r5.cores === 3 && r5b.cores === 1, `the chapter boss stage gives 3 Lõi Cổ the first time, 1 after (${r5.cores}, ${r5b.cores})`);
  A.cleared = 10; const r12 = M.finishStage({ stage: 12, won: true, wavesCleared: 5, seconds: 30 });
  check(stonesOf(12).join() === 'lua,dat' && Object.keys(r12.stones).every((e) => ['lua', 'dat'].includes(e)), `stage 12 is chapter 3 (Sa Mạc Mộ) and drops Lửa or Đất: ${JSON.stringify(r12.stones)}`);
  eq([1, 6, 11, 16, 21, 26, 31, 36, 41, 46, 51].map((n) => stonesOf(n).join('+')), ['moc+dat', 'dat+set', 'lua+dat', 'moc+bang', 'lua+set', 'bang+gio', 'bang+moc', 'set+dat', 'gio+set', 'lua+gio', 'moc+dat'], 'the ten chapters drop their biome\'s two elements, then cycle');
  const lost = M.finishStage({ stage: 13, won: false, wavesCleared: 3, seconds: 30 });
  check(Object.keys(lost.stones).length === 0 && lost.cores === 0, 'a lost stage drops no evolution material');
  const sum = () => Object.values(A.evo.stone).reduce((a, b) => a + b, 0);
  const before = sum(); const d = M.claimDaily();
  check(d.ok && sum() - before === DAILY.stones && Object.values(d.stones).reduce((a, b) => a + b, 0) === 2, `the daily chest adds 2 Đá Mầm (${JSON.stringify(d.stones)})`);
}

if (fails.length) { console.log(`\n${fails.length} FAILED`); process.exit(1); }
console.log('\nALL PASS');
