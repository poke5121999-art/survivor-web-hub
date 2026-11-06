#!/usr/bin/env node
/* Mèo & Súp collection feature (games/cats-soup/js/sim/features/collection.js) in node: the 95 Collection sets and what a
 * complete one pays (Ability.json through the mult hook), the picture-book rows and their gem reward, the item storage
 * "Kho" (Storage_item.json) and the reward types that land in it, save/load.   node test/cats-soup-collection.js */
'use strict';
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const G = path.join(__dirname, '..', 'games', 'cats-soup');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); ok ? pass++ : fail++; };
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
const near = (name, got, want, tol = 1e-9) => check(name, Math.abs(got - want) <= tol, `got ${got} want ${want}`);
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

(async () => {
  const imp = p => import(pathToFileURL(path.join(G, p)).href);
  const { makeGame } = await imp('js/sim/boot.js');
  const B = await imp('js/sim/big.js');
  const E = await imp('js/sim/economy.js');
  let seed = 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const mk = async () => { const g = await makeGame(async p => JSON.parse(fs.readFileSync(path.join(G, p), 'utf8')), rng); g.fresh(); return g; };
  const g = await mk();
  const c = g.feat.collection;
  const tick = (n = 1) => g.tick(n);

  // ---- tables (Collection.json / PictureBook.json / Storage_item.json) ----
  const D = g.data.collection;
  eq('95 sets: 28 cat, 19 fish, 15 furniture, 33 outfit', [D.sets.length, ...[0, 1, 2, 3].map(t => D.sets.filter(s => s.type === t).length)], [95, 28, 19, 15, 33]);
  eq('set 0 "Kẹo bông" = cats 23 and 24, ability 0, level 1', [D.sets[0].ids, D.sets[0].ability, D.sets[0].abilityLv], [[23, 24], 0, 1]);
  eq('set 3 = cats 11, 15, 22; set 12 = cats 23, 32, 31', [c.setOf(g, 3).ids, c.setOf(g, 12).ids], [[11, 15, 22], [23, 32, 31]]);
  eq('set 101 (fish) = 0, 2, 4 ability 500; set 201 (furniture) = 70, 36, 31 ability 100', [c.setOf(g, 101).ids, c.setOf(g, 101).ability, c.setOf(g, 201).ids, c.setOf(g, 201).ability], [[0, 2, 4], 500, [70, 36, 31], 100]);
  eq('set 301 (outfit) = 134, 24, 207 ability 200; set 333 = 311, 312, 313 ability 309', [c.setOf(g, 301).ids, c.setOf(g, 301).ability, c.setOf(g, 333).ids, c.setOf(g, 333).ability], [[134, 24, 207], 200, [311, 312, 313], 309]);
  eq('6 picture-book rows, each pays 5 gems (reward type 3)', [D.book.length, D.book.map(r => r.type), D.book.every(r => r.rewardType === 3 && r.rewardValue === 5)], [6, [0, 1, 2, 3, 4, 5], true]);
  eq('picture-book row 2 = outfits 10-13', D.book[1].ids, [10, 11, 12, 13]);
  eq('68 storage rows, 14 shown at zero', [D.storage.length, D.storage.filter(r => r.zero).length], [68, 14]);

  // ---- fresh state ----
  eq('fresh game: nothing complete; the first cat already marks its set slot as new', [c.completeCount(g), c.anyFresh(g)], [0, true]);
  c.clearFresh(g);
  eq('fresh game: no ability', c.abilities(g), {});
  eq('fresh game: mult is 1', [g.mult('price', g.food.get(1)), g.mult('energy', { a: 2 })], [1, 1]);

  // ---- cat set 0: cats 23 + 24 -> ability 0 (+20 % soup, Ability.json type 1 initValue 20, subIndex 0 = the soup pot) ----
  const pot = g.state.works.find(w => w.a === 0);
  const food = g.food.get(1);
  const p0 = B.toNumber(g.price(food));
  g.state.cats.push({ id: 901, type: 23, work: -1, heart: 0 });
  tick();
  eq('one of two cats: the set stays open, the first slot is marked', [c.isComplete(g, 0), c.have(g, 0)], [false, [1, 0]]);
  g.state.cats.push({ id: 902, type: 24, work: -1, heart: 0 });
  tick();
  eq('both cats: set 0 complete, marked new', [c.isComplete(g, 0), c.isFresh(g, 0), c.anyFresh(g)], [true, true, true]);
  eq('set 12 (23,32,31) has its first slot', c.have(g, 12), [1, 0, 0]);
  eq('ability 0 pays +20', c.abilities(g), { 0: 20 });
  const want = 10 ** (B.log10(E.gradeValue(g.work.get(0), pot.lv, 1.2)) - B.log10(E.gradeValue(g.work.get(0), pot.lv, 1)));
  near('soup price multiplier = GradeValue(x1.2) / GradeValue(x1) of the pot', g.mult('price', food), want, 1e-9);
  const p1 = B.toNumber(g.price(food));
  check('the soup price rose, by less than 20 % (the +400 correction does not scale)', p1 > p0 * 1.001 && p1 < p0 * 1.2, `${p0} -> ${p1}`);
  c.clearFresh(g);
  tick(5);
  eq('new marks cleared and not set again by the next scan', c.anyFresh(g), false);

  // ---- outfit set 301 (134, 24, 207) -> ability 200 = recipe 1 sale price +10 % ----
  const eqf = g.feat.equip;
  eqf.addExp(g, 134, 10); eqf.addExp(g, 24, 10);
  tick();
  eq('two outfits owned: open', [eqf.owned(g, 134), eqf.owned(g, 24), c.isComplete(g, 301), c.have(g, 301)], [true, true, false, [1, 1, 0]]);
  eqf.addExp(g, 207, 10);
  tick();
  eq('third outfit: set 301 complete', c.isComplete(g, 301), true);
  eq('ability 200 pays +10', c.abilities(g)[200], 10);
  near('recipe 1 price factor is 1.1 times the recipe-2 factor (recipe 2 has no set; both carry the soup-pot ratio of set 0)', c.mult(g, 'price', { index: 1, type: 0 }) / c.mult(g, 'price', { index: 2, type: 0 }), 1.1);

  // ---- fish set 101 (0, 2, 4) -> ability 500, type 11, subIndex 1001 (photo reward) +5 ----
  for (const id of [0, 2]) g.feat.fishing.addFish(g, id);
  eq('two fish: open', c.isComplete(g, 101), false);
  g.feat.fishing.addFish(g, 4);
  eq('the fish event completes set 101 at once (no wait for the scan)', c.isComplete(g, 101), true);
  eq('ability 500 pays +5; sub ability 1001 reads 5, 1002 reads 0', [c.abilities(g)[500], c.subPercent(g, 1001), c.subPercent(g, 1002)], [5, 5, 0]);

  // ---- furniture set 201 (70, 36, 31) -> ability 100 = rest work 2 energy +20 ----
  for (const id of [70, 36, 31]) g.reward(6, id);
  tick();
  eq('furniture set 201 complete after the furniture feature stocks 70, 36, 31 (reward 6)', c.isComplete(g, 201), true);
  near('rest work 2 energy factor 1.2 (Ability 100: type 1, subIndex 2)', c.mult(g, 'energy', { a: 2 }), 1.2);
  near('rest work 6 untouched', c.mult(g, 'energy', { a: 6 }), 1);
  eq('completed sets: 0, 101, 201, 301', D.sets.filter(s => c.isComplete(g, s.index)).map(s => s.index), [0, 101, 201, 301]);

  g.state.cats = g.state.cats.filter(x => x.id < 900);
  tick(2);
  eq('a cat that left keeps its set complete (GameData.collections is a memory)', c.isComplete(g, 0), true);

  // ---- picture book ----
  const row0 = D.book[0];
  eq('book row 1 wants cat type 1', row0.ids, [1]);
  eq('book dot off, row not ready (no cat of type 1 yet)', [c.bookDot(g, 0), c.bookReady(g, row0)], [false, false]);
  eq('claim refused when not ready', c.claimBook(g, 1), null);
  g.state.cats.push({ id: 903, type: 1, work: -1, heart: 0 });
  eq('cat 1 present: ready, dot on', [c.bookReady(g, row0), c.bookDot(g, 0)], [true, true]);
  const gem0 = g.state.gem;
  const got = c.claimBook(g, 1);
  eq('claim pays 5 gems', [g.state.gem - gem0, got.given.type, got.given.value], [5, 3, 5]);
  eq('claimed: cannot claim twice, dot off', [c.claimBook(g, 1), c.bookClaimed(g, row0), c.bookDot(g, 0)], [null, true, false]);
  eq('rows of the other kinds stay closed (no outfits 10-13, no furniture 10-13)', [1, 2, 3, 4, 5].map(i => c.bookReady(g, D.book[i])), [false, false, false, false, false]);

  // ---- storage "Kho" ----
  const rows0 = c.storageRows(g);
  eq('storage at the start shows the 14 DisplayAtZero rows', rows0.map(r => r.row.index), [1, 2, 3, 4, 5, 6, 7, 8, 101, 102, 103, 104, 105, 106]);
  eq('gems and coins are the core counters', [rows0[0].count, rows0[4].count], [g.state.gem, g.state.coin]);
  const owner = t => (g.features.find(f => f.rewards && f.rewards[t]) || { id: t <= 4 ? 'core' : null }).id;
  eq('every Storage_item type has an owner (core 3 and 4, or a feature)', D.storage.map(r => r.type).filter(t => !owner(t)), []);
  const mineWant = [88, 96, 6001, 24, ...range(3002, 3013), 1401, 1402, 1407, 1406, 1403, 1404, 1405, 1408, ...range(1501, 1524)];
  eq('the 48 types this feature keeps (table order)', D.storage.map(r => r.type).filter(t => owner(t) === 'collection' && !range(7102, 7109).includes(t)), mineWant);
  eq('the eight fish cookies 7102-7109 are also ours', range(7102, 7109).map(owner), Array(8).fill('collection'));
  const out = g.reward(24, 3);
  eq('reward 24 (macaron) x3 is stored and listed (row 36 shows at count > 0)', [out.type, c.itemCount(g, 24), c.storageRows(g).some(r => r.row.index === 36 && r.count === 3)], [24, 3, true]);
  g.reward(1403, 2); g.reward(1403, 1);
  eq('reward 1403 observatory ticket x2 + x1 = 3 in row 305', c.storageRows(g).find(r => r.row.index === 305).count, 3);
  g.reward(23, 4);
  eq('pudding (23) is kept by specials and read from there (row 31)', [g.state.specials.pudding, c.storageRows(g).find(r => r.row.index === 31).count], [4, 4]);
  g.reward(1101, 2);
  eq('gold ticket 1101 read from specials (row 101)', c.storageRows(g).find(r => r.row.index === 101).count, 2);
  g.reward(7106, 3);
  eq('reward 7106 x3 goes to the fishing inventory as fish 106 and shows in row 32', [g.state.fishing.inv[106].n, c.storageRows(g).find(r => r.row.index === 32).count], [3, 3]);
  g.reward(96, 7); g.reward(6001, 1); g.reward(88, 50);
  eq('souvenir token 7, lens 1, paid gems 50 (rows 6, 7, 2)', [6, 7, 2].map(i => c.storageRows(g).find(r => r.row.index === i).count), [7, 1, 50]);
  g.reward(98, 5); g.reward(99, 6); g.reward(6002, 2);
  eq('butterflies 5 / stamps 6 (missions bag) and star bait 2 (fishing) in rows 4, 3, 8', [4, 3, 8].map(i => c.storageRows(g).find(r => r.row.index === i).count), [5, 6, 2]);

  // ---- save / load ----
  const saved = JSON.parse(JSON.stringify(g.save()));
  const g2 = await mk();
  g2.load(saved);
  const c2 = g2.feat.collection;
  eq('after save/load the complete sets, claimed rows and stored items survive', [D.sets.filter(s => c2.isComplete(g2, s.index)).map(s => s.index), g2.state.collection.book.claimed, c2.itemCount(g2, 24), c2.itemCount(g2, 1403)], [[0, 101, 201, 301], [1], 3, 3]);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
