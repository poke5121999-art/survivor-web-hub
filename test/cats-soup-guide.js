#!/usr/bin/env node
/* Mèo & Súp guide feature (games/cats-soup/js/sim/features/guide.js) in node: tutorial step order and the event that
 * advances each step, the build nudge (save gold -> build now), old saves counting as finished, the welcome-cat and
 * forest-expansion queues, the hold-the-button hint, and save/load.   node test/cats-soup-guide.js */
'use strict';
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const G = path.join(__dirname, '..', 'games', 'cats-soup');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); ok ? pass++ : fail++; };
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

(async () => {
  const imp = p => import(pathToFileURL(path.join(G, p)).href);
  const { makeGame } = await imp('js/sim/boot.js');
  const B = await imp('js/sim/big.js');
  const GD = await imp('js/sim/features/guide.js');
  let seed = 5;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const mk = async () => makeGame(async p => JSON.parse(fs.readFileSync(path.join(G, p), 'utf8')), rng);
  const g = await mk();
  g.fresh();
  const step = () => (GD.info(g) || {}).step;
  const tick = (s = 0.1) => g.tick(s);

  // ---- order and literals ----
  eq('step order', GD.STEPS.map(s => s.id), ['sell', 'build', 'upgrade', 'recipe', 'expand']);
  eq('tutorial ids of the steps', GD.STEPS.map(s => s.tuto), [0, 4, -1, 5, -1]);
  eq('fresh game starts the tutorial at step 0', [g.state.guide.step, g.state.guide.done], [0, false]);
  const i0 = GD.info(g);
  eq('step 0 is tutorial 0: the dish, text guide_tuto00_1', [i0.step, i0.msg, i0.target], ['sell', ['guide_tuto00_1'], 'dish']);

  // ---- sell: only a tap on a dish counts, not the shelf overflowing ----
  g.sellItem({ a: 0, p: B.fromNumber(100), c: false }, 1, true);
  tick();
  eq('an automatic sale (shelf overflow) does not advance', step(), 'sell');
  g.state.shelf.push({ a: 1, p: B.fromNumber(446), c: false });
  g.sell(0);
  eq('tapping a dish advances to build', step(), 'build');
  eq('and the event is announced', g.events.filter(e => e.type === 'guideStep').map(e => [e.step, e.next]), [['sell', 'build']]);

  // ---- build: nudge guide_saveGold while short of gold, guide_buildNow once affordable (work 1 costs 5 x 10^2 = 500) ----
  g.state.gold = B.fromNumber(200);
  let n = GD.info(g).nudge;
  eq('200 gold: nudge "save gold" up to 500, no hand', [n.kind, B.format(n.price), n.a, GD.info(g).target], ['save', '500', 1, null]);
  g.state.gold = B.fromNumber(650);
  n = GD.info(g).nudge;
  eq('650 gold: nudge "build now" with the hand on CRAFT', [n.kind, GD.info(g).target], ['build', 'build']);
  g.state.gold = B.fromNumber(5000);
  g.state.gold = B.fromNumber(60000);
  check('the pot upgrades once', g.upgrade(g.state.works[0], 1) === 1);   // upgrading first does not skip the build step
  eq('an upgrade before the build leaves the build step current', step(), 'build');
  g.state.gold = B.fromNumber(5000);
  const placed = g.build(1);
  check('building the nudged work', !!placed && g.state.works.length === 2);
  eq('build advances past build and the already-done upgrade to recipe gate', g.state.guide.step, 3);

  g.tick(7);                                              // the longPress hint (6 s) has faded
  // ---- recipe: shown only once a recipe can be bought with the energy in hand ----
  g.state.energy = B.fromNumber(0);
  eq('no energy: recipe step is waiting (nothing shown)', GD.info(g), GD.info(g) && GD.info(g).hint ? GD.info(g) : null);
  g.state.energy = B.fromNumber(500);
  const ri = GD.info(g);
  eq('500 energy: tutorial 5 text and the hand on RECIPE', [ri.step, ri.msg, ri.target], ['recipe', ['guide_tuto05_1', 'guide_tuto05_2'], 'recipe']);
  const food = g.recipeList(0).find(r => r.open && B.gte(g.state.energy, g.recipeCost(r.f)));
  check('a learnable recipe exists', !!food);
  g.upgradeRecipe(food.f.index, 1);
  eq('learning a recipe advances to expand', g.state.guide.step, 4);

  // ---- expand: only when the forest can grow (7 facilities for size 1, MapSize_Main row 1 openRequire 7) ----
  eq('cannot expand yet: nothing shown', GD.info(g), null);
  g.state.gold = { f: 9, e: 12 };
  for (let i = 0; i < 40 && !g.canExpand(); i++) { const o = g.buildList().find(x => x.n < x.max && !x.w.costGem && g.canBuild(x.w.index)); if (!o) break; g.build(o.w.index); }
  check('7 facilities owned', g.ownedCount() >= 7, String(g.ownedCount()));
  const ei = GD.info(g);
  eq('expand nudge guide_expandNow with the hand on the button', [ei.step, ei.nudge.kind, ei.target], ['expand', 'expand', 'expand']);
  g.guideQ = [];
  g.expand();
  eq('expanding finishes the tutorial', [g.state.guide.done, step()], [true, undefined]);
  eq('expandReward queued the forest popup with size 1 gold 2 x 10^6 coin 100', g.feat.guide.takePopups(g).filter(p => p.kind === 'expand').map(p => [p.size, B.format(p.gold), p.coin]), [[1, '2000a', 100]]);

  // ---- the hold-the-button hint after the first upgrade (guide_longPress) ----
  const h = await mk();
  h.fresh();
  h.state.gold = B.fromNumber(5000);
  h.state.guide.sold = true;
  h.build(1);
  h.state.gold = B.fromNumber(60000);
  h.upgrade(h.state.works[0], 1);
  eq('first upgrade: hint guide_longPress on the card button', [(GD.info(h) || {}).msg, GD.info(h).target], [['guide_longPress'], 'up']);
  h.tick(7);
  check('the hint fades after 6 s', !(GD.info(h) || {}).hint, JSON.stringify(GD.info(h)));

  // ---- upgrade step shows the text, waiting for the tap ----
  const u = await mk();
  u.fresh();
  u.state.gold = B.fromNumber(5000);
  u.state.guide.sold = true;
  u.build(1);
  eq('after build: upgrade step, guide_levelUp, hand on the facility', [GD.info(u).step, GD.info(u).msg, GD.info(u).target], ['upgrade', ['guide_levelUp'], 'work']);

  // ---- old saves do not replay ----
  const o = await mk();
  o.fresh();
  const old = o.save();
  delete old.guide;
  old.clock = 120;
  old.stats.sold = 30;
  const o2 = await mk();
  o2.load(old);
  eq('a save without state.guide counts as finished', [o2.state.guide.done, GD.info(o2)], [true, null]);
  const o3 = await mk();
  const old2 = o.save();
  delete old2.guide;
  o3.load(old2);
  eq('an untouched save without guide (clock 0) is the start of a game', o3.state.guide.done, false);

  // ---- welcome cat ----
  const w = await mk();
  w.fresh();
  w.guideQ = [];
  w.state.gold = B.fromNumber(5000);
  w.build(1);
  const q = w.feat.guide.takePopups(w);
  eq('building a cook facility queues one welcome-cat popup (the 2nd cat, type 26)', q.filter(p => p.kind === 'welcome').map(p => [p.cat.type, p.rare]), [[26, false]]);
  eq('the queue is emptied by takePopups', w.feat.guide.takePopups(w), []);

  // ---- save/load keeps the step ----
  const s1 = await mk();
  s1.fresh();
  s1.state.guide.sold = true;
  const saved = JSON.parse(JSON.stringify(s1.save()));
  const s2 = await mk();
  s2.load(saved);
  eq('progress survives save/load', [s2.state.guide.sold, s2.state.guide.step], [true, 0]);
  s2.tick(0.1);
  eq('and the next tick settles to build', s2.state.guide.step, 1);

  // ---- skip ----
  const k = await mk();
  k.fresh();
  k.feat.guide.skip(k);
  eq('skip ends it', [k.state.guide.done, GD.info(k)], [true, null]);

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
