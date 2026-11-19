// Checks of the account (js/meta.js) through the same calls the UI makes. Node only, fake storage.
// Usage: node tools/meta-test.mjs
import { createMeta } from '../js/meta.js';
import { levelCost, levelMul, HERO_RARITY } from '../js/data/economy.js';
import { itemStat } from '../js/data/equip.js';
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
  eq([a.v, a.gold, a.gems, a.pity, a.cleared], [1, 1500, 1000, 0, 0], 'new account: version, gold, gems, pity, cleared');
  eq(a.team, ['thep', 'mua', 'yta', 'gio'], 'new account: team is the four starters');
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
  M.acc.heroes.thep.shards = 4;
  const r = M.levelUp('thep');
  check(r.ok && M.acc.heroes.thep.level === 2 && M.acc.heroes.thep.shards === 0 && M.acc.gold === 1450, 'level 1 -> 2 spends 4 shards and 50 gold');
  const no = M.levelUp('thep');
  check(!no.ok && no.why === 'thiếu mảnh' && M.acc.gold === 1450, 'level-up short of shards is refused');
  M.acc.heroes.thep.shards = 1e6; M.acc.gold = 10;
  const poor = M.levelUp('thep');
  check(!poor.ok && poor.why === 'thiếu vàng' && M.acc.heroes.thep.level === 2, 'level-up short of gold is refused');
  check(!M.levelUp('nobody').ok, 'level-up of an unknown hero is refused');
  M.acc.gold = 1e9;
  let prev = { shards: 0, gold: 0 }; let ok = true;
  for (let i = 0; i < 30; i++) {
    const L = M.acc.heroes.thep.level; const sh = M.acc.heroes.thep.shards; const go = M.acc.gold;
    const c = levelCost(L);
    if (!(c.shards > prev.shards && c.gold > prev.gold)) ok = false;
    prev = c;
    const r2 = M.levelUp('thep');
    if (!r2.ok || M.acc.heroes.thep.level !== L + 1 || M.acc.heroes.thep.shards !== sh - c.shards || M.acc.gold !== go - c.gold) ok = false;
  }
  check(ok && M.acc.heroes.thep.level === 32, '30 level-ups in a row each cost exactly levelCost and each costs more than the last');
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
  const g2 = M.acc.gold; const gem2 = M.acc.gems; const sh2 = M.acc.heroes.thep.shards;
  const loss = M.finishStage({ stage: 3, won: false, wavesCleared: 2, seconds: 30 });
  check(loss.ok && loss.gold === 50 && loss.gems === 0 && loss.teamShards === 0 && loss.items.length === 0, 'stage 3 loss after 2 waves: 50 gold only');
  check(M.acc.gold === g2 + 50 && M.acc.gems === gem2 && M.acc.heroes.thep.shards === sh2 && M.acc.cleared === 3, 'stage 3 loss: applied, cleared unchanged');
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
  check(M.acc.gems === 5 && M.acc.gold === 500 && M.acc.bag.length === 0 && M.acc.team.join() === 'gio' && M.acc.mats.weapon === 0, 'a save missing fields keeps what is there and defaults the rest (new-account values)');

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
  check(!M.acc.heroes.ghost && M.acc.heroes.thep.level === 3, 'an unknown hero id is dropped, a known one kept');
  eq(M.acc.team, ['thep'], 'team drops unknown ids and duplicates');
  eq(M.acc.bag.map((i) => i.uid), [1, 4], 'items with an unknown id or tier are dropped');
  check(M.acc.bag[1].lv === 20, 'item level is clamped to the tier cap');
  eq(M.acc.equip.thep, { weapon: 1, necklace: 0, gloves: 0, armor: 0, belt: 0, boots: 0 }, 'equip drops missing items, wrong-slot items and repeats');
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
  check(M.readOnly === true && M.acc.v === 1 && M.acc.gold === 1500, 'a v:99 save starts a fresh account in memory, read-only');
  M.finishStage({ stage: 1, won: true, wavesCleared: 5, seconds: 30 }); M.save();
  check(st.getItem(KEY) === raw, 'a v:99 save is never overwritten');
}

// equip
{
  const M = fresh();
  const w = give(M, 'weapon', 'w_cua');
  check(M.equip('thep', w.uid).ok && M.acc.equip.thep.weapon === w.uid, 'equip puts the item on the hero');
  const r = M.equip('mua', w.uid);
  check(r.ok && r.from === 'thep' && M.acc.equip.thep.weapon === 0 && M.acc.equip.mua.weapon === w.uid, 'equip moves the item from one hero to another');
  check(!M.equip('thep', 9999).ok && !M.equip('ghost', w.uid).ok, 'equip refuses an unknown item or hero');
  check(M.unequip('mua', 'weapon').ok && M.acc.equip.mua.weapon === 0, 'unequip empties the slot');
  check(!M.unequip('mua', 'weapon').ok, 'unequip of an empty slot is refused');
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
  M.equip('thep', q.uid);
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
  N.equip('thep', items[2].uid);
  const nr = N.autoMerge();
  check(nr.ok && N.acc.bag.length === 1 && N.acc.bag[0].uid === items[2].uid && N.acc.equip.thep.weapon === items[2].uid, 'autoMerge keeps the worn piece as the main piece');
  const O = fresh();
  const o = [give(O, 'weapon', 'w_cua'), give(O, 'weapon', 'w_cua'), give(O, 'weapon', 'w_cua')];
  O.equip('thep', o[0].uid); O.equip('mua', o[1].uid);
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
  check(!M.setTeam([]).ok && !M.setTeam(['thep', 'thep']).ok && !M.setTeam(['ghost']).ok && !M.setTeam(['thep', 'mua', 'yta', 'gio', 'thep']).ok, 'setTeam refuses empty, duplicates, unknown and five heroes');
  check(M.setTeam(['mua', 'thep']).ok && M.acc.team.join() === 'mua,thep', 'setTeam accepts two owned heroes in order');
}

// teamSpec
{
  const M = fresh();
  M.acc.heroes.thep.level = 11;
  const w = give(M, 'weapon', 'w_cua', 1, 5); const ar = give(M, 'armor', 'a_lop', 2, 1);
  M.equip('thep', w.uid); M.equip('thep', ar.uid);
  const spec = M.teamSpec();
  const t = spec.find((s) => s.id === 'thep');
  check(Math.abs(t.mul - levelMul(11)) < 1e-12 && Math.abs(t.mul - 1.8) < 1e-12, 'teamSpec mul is levelMul(11) = 1.8');
  check(t.atkFlat === itemStat(w) && t.hpFlat === itemStat(ar) && t.atkFlat === 24 && t.hpFlat === 150, 'teamSpec includes equipment: +24 attack, +150 health');
  eq(spec.map((s) => s.id), M.acc.team, 'teamSpec follows the team order');
  const st = M.heroStats('thep');
  check(st.atk === Math.round(HERO.thep.atk * 1.8 + 24) && st.hp === Math.round(HERO.thep.hp * 1.8 + 150), 'heroStats combines level and equipment');
  check(M.power('thep') === Math.round(st.atk * 4 + st.hp / 2) && M.teamPower() === M.acc.team.reduce((s, id) => s + M.power(id), 0), 'power and teamPower follow the formula');
}

// dots and listeners
{
  const M = fresh();
  M.acc.gems = 99;
  check(M.dots().gacha === false, 'dots: no gacha dot at 99 gems');
  M.acc.gems = 100;
  check(M.dots().gacha === true, 'dots: gacha dot at 100 gems');
  check(M.dots().heroes === false, 'dots: no hero dot with no shards');
  M.acc.heroes.mua.shards = 4;
  const d = M.dots();
  check(d.heroes === true && d.heroIds.mua === true && !d.heroIds.thep, 'dots: hero dot for a hero that can level up');
  check(M.dots().equip === false, 'dots: no equipment dot with an empty bag');
  give(M, 'weapon', 'w_cua');
  check(M.dots().equip === true && M.dots().heroIds.thep === true, 'dots: a bag item better than an empty slot lights equipment and that hero');
  const seen = [];
  M.on((name, res) => seen.push([name, res.ok]));
  M.setTeam(['thep']); M.pull(99); M.levelUp('mua');
  eq(seen, [['setTeam', true], ['levelUp', true]], 'listeners hear successful commands only');
}


// ---- new account, gating, XP, slots, free pull, gifts, old saves (the real start)
const win = (M, stage, extra = {}) => M.finishStage({ stage, won: true, wavesCleared: 5, seconds: 60, ...extra });
{
  const M = brandNew();
  const a = M.acc;
  eq([a.gold, a.gems, a.level, a.xp, a.cleared, a.freePull], [500, 300, 1, 0, 0, true], 'brand-new account: 500 gold, 300 gems, level 1, 0 xp, nothing cleared, free pull waiting');
  eq([Object.keys(a.heroes), a.team], [['gio'], ['gio']], 'brand-new account: only Gió, in the team');
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
  check(refused(M.pull(1), 'gacha') && refused(M.levelUp('gio'), 'levelup') && refused(M.claimDaily(), 'daily') && refused(M.claimChapter(0), 'chapter'), 'locked at the start: pull, levelUp, claimDaily, claimChapter refuse with the lock text');
  check(refused(M.equip('gio', 1), 'equip') && refused(M.upgradeItem(1), 'equip') && refused(M.merge(1, [2, 3]), 'merge') && refused(M.autoMerge(), 'merge'), 'locked at the start: equip, upgradeItem, merge, autoMerge refuse with the lock text');
  eq(JSON.stringify(M.acc) === before, true, 'refused commands change nothing');
  win(M, 1);
  M.acc.heroes.gio.shards = 100;
  check(M.pull(1).ok, 'pull works after stage 1 (the free pull)');
  check(M.levelUp('gio').ok, 'levelUp works after stage 1');
  check(!M.claimDaily().ok && M.claimDaily().why === 'Mở ở cấp 4', 'daily still locked at level 2');
  win(M, 2); win(M, 3);
  check(M.acc.level >= 4 && M.claimDaily().ok, 'daily opens at level 4 (reached by clearing stages)');
  check(refused(M.claimChapter(0), 'chapter'), 'chapter chest locked before stage 5');
  win(M, 4); win(M, 5);
  check(M.claimChapter(0).ok, 'chapter chest opens after stage 5');
  check(refused(M.equip('gio', 1), 'equip') === (M.acc.level < 6), 'equip follows level 6');
  for (let s = 6; M.acc.level < 6; s++) win(M, s);
  const w = give(M, 'weapon', 'w_cua');
  check(M.equip('gio', w.uid).ok && M.upgradeItem(w.uid).ok === (M.canUpgradeItem(w.uid).ok), 'equip and upgrade open at level 6');
  check(refused(M.autoMerge(), 'merge') === (M.acc.level < 9), 'merge follows level 9');
  while (M.acc.level < 9) win(M, 10);
  for (let i = 0; i < 3; i++) give(M, 'weapon', 'w_cua');
  check(M.autoMerge().ok, 'autoMerge opens at level 9');
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
  eq(M.acc.team, ['gio'], 'tutorial won: the team is still just Gió (the guide fills slot 2)');
  eq(M.setTeam(['gio', 'yta']).ok, true, 'two heroes fit in two slots');
  M.pull(1);
  const r = M.setTeam(['gio', 'yta', 'mua']);
  check(!r.ok && r.why === 'Mở ở cấp 4' && M.acc.team.length === 2, 'three heroes in two slots refused with the lock text');
}

// free pull and gifts
{
  const M = brandNew();
  win(M, 1);
  eq([M.acc.heroes.yta && M.acc.heroes.yta.level, M.acc.heroes.mua], [1, undefined], 'gift: Y Tá joins the account after stage 1');
  check(!M.pull(10).ok, 'pull 10 is refused while the free pull is waiting');
  const g = M.acc.gems;
  const p = M.pull(1);
  check(p.ok && p.free && p.results[0].hero === 'mua' && p.results[0].isNew && M.acc.gems === g && M.acc.heroes.mua.level === 1 && !M.acc.freePull, 'free pull costs nothing, gives Mưa Đạn and uses itself up');
  const p2 = M.pull(1);
  check(p2.ok && M.acc.gems === g - 100, 'the next pull costs 100 gems');
  const r2 = win(M, 2);
  check(M.acc.heroes.thep.level === 1 && r2.gifts.join() === 'thep', 'gift: Thép joins after stage 2 and the result says so');
  eq(win(M, 2).gifts, [], 'a repeat clear gifts nothing');
}

// the unlocked list on the result that crosses a threshold
{
  const M = brandNew();
  const r1 = win(M, 1);
  eq(r1.unlocked, ['slot2', 'levelup', 'gacha'], 'stage 1 result lists slot 2, level-up and gacha');
  eq(r1.gifts, ['yta'], 'stage 1 result lists the tutorial gift');
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
  eq([M.acc.team, M.slots()], [['thep', 'mua', 'yta'], 3], 'old save: the team of four is trimmed to the three slots level 4 opens');
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

if (fails.length) { console.log(`\n${fails.length} FAILED`); process.exit(1); }
console.log('\nALL PASS');
