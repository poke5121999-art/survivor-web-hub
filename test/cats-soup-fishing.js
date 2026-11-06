#!/usr/bin/env node
/* Mèo & Súp fishing + aquarium rules (games/cats-soup/js/sim/features/fishing.js) in node, with literal values from
 * D:/catsoup-ref/flat/Fish.json and rules/fishing.md.
 *   node test/cats-soup-fishing.js */
'use strict';
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const G = path.join(__dirname, '..', 'games', 'cats-soup');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); ok ? pass++ : fail++; };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

(async () => {
  const { makeGame } = await import(pathToFileURL(path.join(G, 'js/sim/boot.js')).href);
  const B = await import(pathToFileURL(path.join(G, 'js/sim/big.js')).href);
  const F = (await import(pathToFileURL(path.join(G, 'js/sim/features/fishing.js')).href));
  let seed = 12345;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const g = await makeGame(async p => JSON.parse(fs.readFileSync(path.join(G, p), 'utf8')), rng);
  g.fresh();
  const fx = g.feat.fishing;
  const rows = g.data.fishing.fish;

  // ---- table ----
  check('Fish table has 71 rows', rows.length === 71);
  const byType = {};
  rows.forEach(r => { byType[r.type] = (byType[r.type] || 0) + 1; });
  check('rows by type: 30 normal, 5 + 1 + 4 feed, 25 special, 6 reward', byType[0] === 30 && byType[1] === 5 && byType[2] === 1 && byType[3] === 4 && byType[4] === 25 && byType[99] === 6, JSON.stringify(byType));
  const r0 = g.fishTable.get(0), r411 = g.fishTable.get(411), r200 = g.fishTable.get(200);
  check('fish 0: probability 1000, heart 1, grade 1, group 8', r0.probability === 1000 && r0.heartValue === 1 && r0.grade === 1 && r0.group === 8);
  check('fish 411: type 4, probability 10, heart 60, grade 10', r411.type === 4 && r411.probability === 10 && r411.heartValue === 60 && r411.grade === 10);
  check('fish 200 pays equipment 65 (reward type 5)', r200.type === 99 && r200.rewardType === 5 && r200.rewardValue === 65);

  // ---- pools (GetFishAssetData predicates) ----
  g.feat.equip = { id: 'equip', owned: () => true };
  const normal = F.buildPool(g, false), special = F.buildPool(g, true);
  check('normal pool = 30 type-0 fish + furniture-coin rewards 300..302 (equipment owned)', normal.length === 33, String(normal.length));
  check('special pool = the 25 type-4 fish', special.length === 25 && special.every(r => r.type === 4));
  g.feat.equip = { ...g.feat.equip, owned: () => false };
  check('equipment fish 200..202 join both pools (36 normal, 28 special) when the equipment is not owned', F.buildPool(g, false).length === 36 && F.buildPool(g, true).length === 28);
  g.feat.equip = { ...g.feat.equip, owned: () => true };

  // ---- roll rule: candidates have 1000 - probability <= roll ----
  check('roll 0: only fish 0 (probability 1000) can bite', JSON.stringify(F.candidates(normal, 0).map(r => r.index)) === '[0]');
  check('roll 250: probability >= 750 -> fish 0 and 1', JSON.stringify(F.candidates(normal, 250).map(r => r.index)) === '[0,1]');
  check('roll 999: every normal fish (probability >= 1)', F.candidates(normal, 999).length === 33);
  check('special roll 0: the five probability-1000 fish', JSON.stringify(F.candidates(special, 0).map(r => r.index)) === '[400,401,402,412,421]');

  // ---- distribution over many seeded draws vs the exact one ----
  const N = 200000;
  const draw = special => {
    const hit = {};
    for (let i = 0; i < N; i++) { const r = F.pick(g, special); hit[r.index] = (hit[r.index] || 0) + 1; }
    return hit;
  };
  const lit = { normal: { 0: 0.430913, 1: 0.180913, 5: 0.02758, 9: 0.000606, 18: 0.010437, 300: 0.012104, 301: 0.005312 },
    special: { 400: 0.105384, 403: 0.055384, 408: 0.021158, 411: 0.0004, 424: 0.000835 } };
  for (const [name, sp] of [['normal', false], ['special', true]]) {
    const hit = draw(sp);
    let worst = 0, ok = true;
    for (const [id, p] of Object.entries(lit[name])) {
      const q = (hit[id] || 0) / N;
      const sd = Math.sqrt(p * (1 - p) / N);
      worst = Math.max(worst, Math.abs(q - p) / sd);
      if (Math.abs(q - p) > 5 * sd) ok = false;
    }
    check(`${name} pool: draw frequencies match the exact distribution (literal p, worst ${worst.toFixed(1)} sigma over ${N})`, ok);
  }

  // ---- casting: one charge per catch, star-candy bait for special ----
  g.state.gold = B.fromNumber(1e9);
  const w = g.build(10);
  check('building the fishing ground starts full: 5 charges (maxValue 5)', w && w.v === 5 && g.work.get(10).maxValue === 5 && g.work.get(10).completeTime === 7200);
  let ev = [];
  const got = F.cast(g, false);
  check('cast uses one charge and stores a fish or pays a reward', w.v === 4 && (got.stored || got.reward));
  check('special cast without bait is refused', F.cast(g, true) === null && w.v === 4);
  g.reward(6002, 2);
  check('reward 6002 gives star-candy bait', g.state.fishing.bait === 2);
  const sp = F.cast(g, true);
  check('special cast uses a bait and a charge', sp && g.state.fishing.bait === 1 && w.v === 3 && sp.row.type === 4);
  w.v = 0;
  check('no charge: cast refused', F.cast(g, false) === null);
  check('ad button gives a charge at once', F.adBait(g) && w.v === 1);
  g.tick(7200);
  check('a charge returns every 7200 s (core recharge)', w.v === 2, String(w.v));

  // ---- inventory, reward type 7, cap ----
  const f = g.state.fishing;
  f.inv = {}; f.book = {}; f.fresh = {};
  g.events.length = 0;
  const out = g.reward(7, 3);
  check('reward type 7 value 3 adds fish 3 (heart 7)', out.type === 7 && out.value === 3 && F.owned(g, 3) === 1 && f.book[3] === 1);
  check('reward type 7 emits fish event', g.events.some(e => e.type === 'fish' && e.fish === 3 && e.first === true));
  for (let i = 0; i < 998; i++) F.addFish(g, 1);
  check('normal pool counts 999 fish', F.count(g, 'normal') === 999);
  check('the 1000th normal fish does not fit (mailed in the original)', F.addFish(g, 2) === false && f.lost === 1 && F.owned(g, 2) === 0);
  check('special pool has its own 999 cap', F.addFish(g, 411) === true && F.count(g, 'special') === 1);
  f.inv = {}; f.book = {};

  // ---- selling: avgGold x heartValue x 600 x n ----
  g.state.recipes = { 1: 1 };
  const avg = g.averageIncome();
  for (let i = 0; i < 4; i++) F.addFish(g, 4);
  const before = g.state.gold;
  const price = F.sellPrice(g, 4, 3);
  check('price of 3 fish 4 (heart 9) = avgGold x 9 x 600 x 3', B.cmp(price, B.mul(avg, 9 * 600 * 3)) === 0);
  F.sell(g, 4, 3);
  check('selling pays the price and removes the fish', F.owned(g, 4) === 1 && near(B.toNumber(B.sub(g.state.gold, before)) / B.toNumber(price), 1, 1e-6));

  // ---- aquarium ----
  f.inv = {};
  for (let i = 0; i < 5; i++) F.addFish(g, 0);
  check('store 3 of 5 into the aquarium', F.store(g, 0, 3) && F.aquaCount(g) === 3 && F.sellable(g, 0) === 2);
  check('fish placed in the aquarium cannot be sold', F.sell(g, 0, 3) === null && F.sell(g, 0, 2) !== null);
  f.inv = { 7: { n: 600, a: 0 } };
  check('aquarium holds at most 500 fish', F.store(g, 7, 501) === false && F.store(g, 7, 500) === true && F.store(g, 7, 1) === false);
  F.unstoreAll(g);
  check('"keep all" returns every fish to the inventory', F.aquaCount(g) === 0);
  check('aquarium takes 1 cat at the start', F.deployCat(g, g.state.cats[0].id) && !F.deployCat(g, 999));
  g.state.gem = 1000;
  check('theme 1 costs 800 gems', F.buyTheme(g, 1) && g.state.gem === 200 && F.setTheme(g, 1) && f.theme === 1);
  check('theme 2 refused with 200 gems', F.buyTheme(g, 2) === false);

  // ---- fish book bonuses ----
  f.book = {};
  check('empty book: no bonus', F.bookBonus(g).energy === 0 && F.bookBonus(g).food === 0);
  f.book = { 0: 3 };
  check('fish 0 x3 (group 8, grade 1): +3 % energy', near(F.bookBonus(g).energy, 0.03));
  f.book = { 0: 20 };
  check('fish 0 x20 counts only group 8: +8 %', near(F.bookBonus(g).energy, 0.08));
  f.book = { 411: 5 };
  check('special 411 (group 1, grade 10): +20 % dish price (0.02 per star)', near(F.bookBonus(g).food, 0.2) && F.bookBonus(g).energy === 0);
  check('book totals: normal 409 stars, special 357 stars', F.bookMax(g, false) === 409 && F.bookMax(g, true) === 357);
  f.book = { 411: 1 };
  const soup = g.food.get(1);
  f.book = {};
  const plain = B.toNumber(g.price(soup));
  f.book = { 411: 1 };
  check('special book raises the dish price through core mult: 10 stars x 2 % = x1.2', near(g.feat.fishing.mult(g, 'price', soup), 1.2, 1e-9) && B.toNumber(g.price(soup)) / plain > 1.19 && B.toNumber(g.price(soup)) / plain < 1.2001);
  f.book = {};

  // ---- feeding cats ----
  f.inv = { 5: { n: 2, a: 0 } };
  g.events.length = 0;
  const cat = g.state.cats[0];
  check('feeding fish 5 gives heart value 10 through fishHeart', F.feed(g, cat.id, 5) === 10 && g.events.some(e => e.type === 'fishHeart' && e.value === 10 && e.catId === cat.id) && F.owned(g, 5) === 1);

  // ---- save / load ----
  f.book = { 3: 2 }; f.inv = { 3: { n: 2, a: 1 } };
  const s = g.save();
  g.load(JSON.parse(JSON.stringify(s)));
  check('save/load keeps inventory, aquarium and book', g.state.fishing.inv[3].n === 2 && g.state.fishing.inv[3].a === 1 && g.state.fishing.book[3] === 2 && g.state.fishing.themes.includes(1));

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
