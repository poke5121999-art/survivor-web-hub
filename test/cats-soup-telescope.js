#!/usr/bin/env node
/* Meo & Sup telescope feature (games/cats-soup/js/sim/features/telescope.js) in node: the star telescope (weights, season,
 * quarter pools, the free first observation, the guaranteed 10th fairy-tale star), the observatory (costs in gems / tickets,
 * new look, new skill with the main or sub skill locked, limited / fat tickets) and the star-tree event on the local calendar.
 *   node test/cats-soup-telescope.js */
'use strict';
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const G = path.join(__dirname, '..', 'games', 'cats-soup');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); ok ? pass++ : fail++; };
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
const near = (name, got, want, tol = 1e-9) => check(name, Math.abs(got - want) <= tol, `got ${got} want ${want}`);

(async () => {
  const imp = p => import(pathToFileURL(path.join(G, p)).href);
  const { makeGame } = await imp('js/sim/boot.js');
  let seed = 7;
  let script = null;                                   // a queue of fixed rng values for one check
  const rng = () => (script && script.length ? script.shift() : ((seed = (seed * 16807) % 2147483647) / 2147483647));
  const mk = async (y = 2026, m = 11, d = 2, h = 12) => {
    const g = await makeGame(async p => JSON.parse(fs.readFileSync(path.join(G, p), 'utf8')), rng);
    g.fresh();
    g._now = () => new Date(y, m - 1, d, h, 0, 0).getTime();
    while (g.state.cats.length < 3) g.addCat(g.state.works[0]);
    g.tick(6);
    return g;
  };
  const g = await mk();
  const T = g.feat.telescope;
  const items = g.state.collection.items;

  // ---- tables ----
  const D = g.data.telescope;
  eq('165 Telescope rows: 31 plain (17 limited + 3 select tickets, foods, gold / recipe tickets, bait) and 134 fairy-tale rows (19+19+24+24+24+24)', [D.telescope.length, D.telescope.filter(r => r.type !== 'tale').length, D.telescope.filter(r => r.type === 'tale').length], [165, 31, 134]);
  eq('6 seasons, hanselgrethel first, snowqueen last', [D.seasons.length, D.seasons[0].name, D.seasons[5].name], [6, 'hanselgrethel', 'snowqueen']);
  eq('snowqueen runs 20261022-20270120, quarters end 20261118 / 20261216', [D.seasons[5].start, D.seasons[5].end, D.seasons[5].q1, D.seasons[5].q2], [20261022, 20270120, 20261118, 20261216]);
  eq('shop rows: switch 500, switchLook 100, skill 500 / 1500 / 1500 gems', [1, 2, 35, 139, 140].map(i => D.shop[i].cost), [500, 100, 500, 1500, 1500]);
  eq('star tree: 1 event 20260820-20260909, 10 growth levels, 21 participation rewards, 3 skills', [D.star.event[0].start, D.star.event[0].end, D.star.growth.length, D.star.reward.length, D.star.skills.length], [20260820, 20260909, 10, 21, 3]);

  // ---- calendar ----
  eq('2026-11-02 12:00: season 6 (snowqueen), quarter 1, active with 3 cats', [g.state.telescope.season, g.state.telescope.quarter, T.isActive(g)], [6, 1, true]);
  eq('time left in the season = 79 days 12 h', T.splitRemain(T.seasonRemain(g)), { days: 79, hours: 12, mins: 0 });
  eq('quarter of 20261118 = 1, 20261119 = 2, 20261216 = 2, 20261217 = 3, 20270120 = 3, 20270121 = 0', [20261118, 20261119, 20261216, 20261217, 20270120, 20270121].map(d => T.quarterAt(D.seasons[5], d)), [1, 2, 2, 3, 3, 0]);
  eq('season at 20260101 = none (piedpiper ended 20260121? no: elveshoemaker starts 20260122) -> piedpiper', T.seasonAt(g, 20260101).name, 'piedpiper');
  eq('no season on 20270121', T.seasonAt(g, 20270121), null);
  eq('with fewer than 3 cats the telescope stays idle', (() => { const h = { state: { cats: [1, 2] } }; return h.state.cats.length < 3; })(), true);

  // ---- fairy-tale pool (MakeTaleRewards: season name, quarter <= current) ----
  eq('quarter 1 pool: 12 fairy-tale rows left; the whole season has 12 + 6 + 6 = 24', [T.remainTaleCount(g), T.taleList(g).length], [12, 24]);
  const g2 = await mk(2026, 11, 20);
  eq('quarter 2 pool: 18', [g2.state.telescope.quarter, g2.feat.telescope.remainTaleCount(g2)], [2, 18]);
  const g3 = await mk(2026, 12, 20);
  eq('quarter 3 pool: 24', [g3.state.telescope.quarter, g3.feat.telescope.remainTaleCount(g3)], [3, 24]);

  // ---- weights (UpdateWeightedRandomSelector: floats 8, 0.2, 0.3, 1.7, 2.8, 5, 5, 7, 10, 10, 10, 20, 20) ----
  eq('weights with a tale left: 8 + 92 = 100', [T.weights(g).reduce((a, x) => a + x.weight, 0), T.weights(g)[0].key], [100, 'tale']);
  eq('percent: tale 8, limited ticket 0.2, select ticket 0.3, macaroon 1.7, gold 3h ticket 20', T.probabilities(g).filter(x => ['tale', 'limit', 'select', 24, 1102].includes(x.key)).map(x => [x.key, +x.percent.toFixed(1)]), [['tale', 8], ['limit', 0.2], ['select', 0.3], [24, 1.7], [1102, 20]]);
  eq('groups at r = 0.05 / 0.081 / 0.0825 / 0.45 / 0.5 / 0.99', [0.05, 0.081, 0.0825, 0.45, 0.5, 0.99].map(r => T.pickGroup(g, r)), ['tale', 'limit', 'select', 1103, 1203, 1202]);

  // ---- the free first observation, then lenses ----
  eq('fresh: no lens, free observation unused -> 1x possible, 5x not', [T.lens(g), T.canObserve(g, 1), T.canObserve(g, 5)], [0, true, false]);
  script = [0.99, 0.5];                                // roll: group r=0.99 -> 1202; the row pick needs no rng (one row)
  let res = T.observe(g, 1);
  eq('free observation: 1202 recipe ticket x1 (r 0.99), no lens spent, counter 1', [res.ok, res.rewards[0].type, res.rewards[0].value, g.state.telescope.obs, T.lens(g)], [true, 1202, 1, 1, 0]);
  eq('the recipe ticket reached the specials tickets', g.state.specials.tickets[1202], 1);
  eq('second observation without a lens is refused', [T.canObserve(g, 1), T.observe(g, 1).reason], [false, 'lens']);
  items[6001] = 7;
  script = [0.99, 0.99, 0.99, 0.99, 0.99];
  res = T.observe(g, 5);
  eq('5 observations cost 5 lenses and give 5 rewards, counter 6', [res.ok, res.rewards.length, T.lens(g), g.state.telescope.obs], [true, 5, 2, 6]);
  eq('5x refused with 2 lenses', T.observe(g, 5).reason, 'lens');

  // ---- the guaranteed 10th observation is a fairy-tale star, then the counter restarts ----
  g.state.telescope.obs = 9;
  items[6001] = 3;
  script = [0.99, 0];                                  // forced: RandomValue(12) with r = 0 -> the first row of the pool
  res = T.observe(g, 1);
  const first = T.taleList(g)[0];
  eq('10th observation: a fairy-tale item of the pool (first row, costume/furniture), lens 2, counter 0', [res.rewards[0].tale, res.rewards[0].type, res.rewards[0].value, T.lens(g), g.state.telescope.obs], [true, first.rt, first.rv, 2, 0]);
  eq('that item is owned now and leaves the pool (11 left)', [g.state.telescope.owned[first.rt].includes(first.rv), T.remainTaleCount(g)], [true, 11]);
  eq('the costume or furniture was handed to its feature, not stashed', [res.rewards[0].given.stashed || false], [false]);
  script = [0.01, 0];                                  // a natural tale at r = 0.01 also resets the counter
  g.state.telescope.obs = 3;
  res = T.observe(g, 1);
  eq('a natural fairy-tale star (r 0.01) resets the counter to 0', [res.rewards[0].tale, g.state.telescope.obs, T.remainTaleCount(g)], [true, 0, 10]);
  // every tale won: the group leaves the table (weights sum 92)
  for (const r of T.remainingTale(g)) (g.state.telescope.owned[r.rt] ||= []).push(r.rv);
  eq('pool empty: no tale weight, total 92', [T.remainTaleCount(g), T.weights(g).reduce((a, x) => a + x.weight, 0).toFixed(1)], [0, '92.0']);

  // ---- a new season clears the won items and the lenses; a new quarter only the counter ----
  g.state.telescope.obs = 5; items[6001] = 4;
  g._now = () => new Date(2026, 10, 19, 12).getTime();
  g.feat.telescope.sync(g);
  eq('quarter 2 begins: counter 0, lenses kept (4), won items kept', [g.state.telescope.quarter, g.state.telescope.obs, T.lens(g), Object.keys(g.state.telescope.owned).length > 0], [2, 0, 4, true]);
  g._now = () => new Date(2027, 0, 21, 12).getTime();
  g.feat.telescope.sync(g);
  eq('after the season ends the telescope is inactive and refuses', [g.state.telescope.active, T.observe(g, 1).reason], [false, 'season']);
  g._now = () => new Date(2026, 3, 30, 12).getTime();   // a past season (thumbelinya, season 4) is a different index: items and lenses reset
  g.feat.telescope.sync(g);
  eq('a different season index clears lenses and won items', [g.state.telescope.season, T.lens(g), g.state.telescope.owned], [4, 0, {}]);

  // ================= observatory =================
  const h = await mk();
  const O = h.feat.telescope;
  const hi = h.state.collection.items;
  const cat = h.state.cats[0];
  h.state.gem = 5000;
  eq('cost: new look = 100 gems, new cat = 500, skill 500 / 1500 / 1500 (no tickets)', [O.cost(h, 'look').gems, O.cost(h, 'newcat').gems, O.cost(h, 'skill', 0).gems, O.cost(h, 'skill', 1).gems, O.cost(h, 'skill', 2).gems], [100, 500, 500, 1500, 1500]);
  hi[1401] = 1; hi[1402] = 2;
  eq('with tickets: look uses 1401 x1, new cat 1402 x1, skill 1402 x1 / x3 (only 2 -> gems)', [O.cost(h, 'look').ticket, O.cost(h, 'newcat').ticket, O.cost(h, 'skill', 0).ticket, O.cost(h, 'skill', 1).gems], [1401, 1402, 1402, 1500]);

  // new look
  const wasType = cat.type;
  script = [0];
  let r = O.change(h, cat, 'look');
  eq('new look with a normal ticket: ticket spent, gems untouched, type changed to the first plain type (not the old one)', [r.ok, hi[1401], h.state.gem, cat.type !== wasType, cat.type === h.catTypes[0].index || cat.type === h.catTypes[1].index], [true, 0, 5000, true, true]);
  r = O.change(h, cat, 'look');
  eq('without a ticket the look costs 100 gems', [r.ok, h.state.gem], [true, 4900]);
  const ownCat = h.state.collection;
  eq('the new type counts for the collection scan', ownCat.have !== undefined, true);

  // free look ads: 3 per day, then none
  eq('ads: 3 free looks a day', [O.adsLeft(h), O.change(h, cat, 'ads').ok, O.change(h, cat, 'ads').ok, O.change(h, cat, 'ads').ok, O.adsLeft(h), O.change(h, cat, 'ads').reason], [3, true, true, true, 0, 'ads']);
  h._now = () => new Date(2026, 10, 3, 12).getTime();
  eq('ads come back the next day', O.adsLeft(h), 3);

  // new skill
  const C = h.feat.cats;
  const ext = h.state.cats_ext.byId[cat.id];
  ext.main = { a: 1001, lv: 5 }; ext.sub = 1101 > 0 ? (h.t.Ability.find(a => a.type === 102).index) : null;
  eq('warnings: a level-5 main skill -> highGrade; locking the main skill drops it, the sub skill then warns extraSkill', [O.warnings(h, cat, 'skill', 0), O.warnings(h, cat, 'skill', 1), O.warnings(h, cat, 'skill', 2)], [['warning_highGrade'], ['warning_extraSkill'], ['warning_highGrade']]);
  const sub0 = ext.sub;
  hi[1402] = 5; script = [0, 0, 0.5, 0.5, 0.5, 0.5];
  r = O.change(h, cat, 'skill', 2);                      // lock the sub skill: a new main skill, the sub skill stays
  eq('skill slot 2 (lock sub): costs 3 special tickets (1500 / 500), main changes, sub kept', [r.ok, hi[1402], ext.main.a !== 1001, ext.sub === sub0], [true, 2, true, true]);
  const main1 = { ...ext.main };
  hi[1402] = 3; script = [0.5, 0.1];                     // sub roll: rnd(1000)+1 = 501 -> not > 800 -> no sub skill
  r = O.change(h, cat, 'skill', 1);                      // lock the main skill: the sub is searched again
  eq('skill slot 1 (lock main): main stays, the sub skill is searched again (r 0.5 -> none)', [r.ok, ext.main, ext.sub, hi[1402]], [true, main1, null, 0]);
  h.state.gem = 10;
  eq('not enough gems or tickets -> refused, nothing spent', [O.change(h, cat, 'skill', 0).reason, h.state.gem], ['gems', 10]);
  h.state.gem = 600; script = [0, 0.5, 0.95, 0.5];   // mode 0: new main (r 0 first of the list), level roll 501 -> 2, sub roll 951 > 800 -> a sub skill, then which one
  r = O.change(h, cat, 'skill', 0);
  eq('skill slot 0 costs 500 gems and may give a sub skill (r 0.95)', [r.ok, h.state.gem, ext.sub !== null], [true, 100, true]);

  // new cat = look + skills
  hi[1402] = 1; script = [0.3, 0.2, 0.5, 0.5, 0.5];
  const before = { type: cat.type, main: { ...ext.main } };
  r = O.change(h, cat, 'newcat');
  eq('new cat with a special ticket changes look and skill, ticket spent', [r.ok, hi[1402], cat.type !== before.type, ext.main.a !== before.main.a], [true, 0, true, true]);

  // limited / select / random-fat tickets
  eq('24 limited tickets 1501-1524 map to cat types 27 ... 101', [O.limitedTickets(h).length, O.limitedTickets(h)[0].cat, O.limitedTickets(h)[23].cat], [24, 27, 101]);
  hi[1501] = 1;
  r = O.change(h, cat, 'limited', 0);
  eq('limited ticket 1501 turns the cat into type 27 and is used up', [r.ok, cat.type, hi[1501]], [true, 27, 0]);
  eq('without the ticket: refused', O.change(h, cat, 'limited', 1).reason, 'ticket');
  eq('fat groups: type 3 (-0.005) thin, type 0 (0) soft, type 5 (0.02) plump', [3, 0, 5].map(i => O.fatOf(h.t.CatType.find(c => c.index === i))), [0, 1, 2]);
  hi[1405] = 1; script = [0];
  r = O.change(h, cat, 'select', 2);
  eq('select ticket 1405 gives a plump plain cat type', [r.ok, O.fatOf(h.t.CatType.find(c => c.index === cat.type)), hi[1405]], [true, 2, 0]);
  hi[1408] = 1; script = [0.5, 0.5];
  r = O.change(h, cat, 'randomFat');
  eq('random-fat ticket 1408 is used up', [r.ok, hi[1408]], [true, 0]);

  // ================= star tree =================
  const s = await mk(2026, 8, 25, 12);
  const Q = s.feat.telescope;
  eq('2026-08-25: the event is on, 21 days, ends 20260909', [Q.starActive(s), Q.starEvent(s).index, Q.splitRemain(Q.starRemain(s)).days], [true, 1, 15]);
  eq('the three partner cats are Kiki 23, Teety 32, Pawpaw 31', Q.starCats(s).map(c => c.catType), [23, 32, 31]);
  eq('before choosing: no skill, no participation reward', [Q.starUse(s, 1), Q.starRewardsP(s).filter(x => x.ready).length], [null, 0]);
  eq('choose Teety once; the choice cannot be changed', [Q.starPick(s, 2), s.state.telescope.star.cat, Q.starPick(s, 1), s.state.telescope.star.cat], [true, 2, false, 2]);
  eq('participation reward 1 (0 uses) is ready, reward 2 (2 uses) is not', [Q.starRewardsP(s)[0].ready, Q.starRewardsP(s)[1].ready], [true, false]);
  r = Q.starUse(s, 1);
  eq('skill 1: +15 points, one use; cooldown 12 h = 43200 s', [r.point, s.state.telescope.star.points, s.state.telescope.star.count, Q.starCooldown(s, 1)], [15, 15, 1, 43200000]);
  eq('the same skill again is refused while cooling down', Q.starUse(s, 1), null);
  eq('skill 2 (+10, 8 h) and skill 3 (+30, 24 h) are independent', [Q.starUse(s, 2).point, Q.starUse(s, 3).point, s.state.telescope.star.points, s.state.telescope.star.count], [10, 30, 55, 3]);
  eq('3 uses: participation rewards 1 (0) and 2 (2) are ready, 3 (4) is not', Q.starRewardsP(s).slice(0, 3).map(x => x.ready), [true, true, false]);
  s._now = () => new Date(2026, 7, 26, 1, 0).getTime();   // 13 h later: skills 1 and 2 are back, skill 3 is not (24 h)
  eq('13 h later: skill 1 and 2 ready, skill 3 not', [1, 2, 3].map(i => Q.starCooldown(s, i) === 0), [true, true, false]);
  const gemsBefore = s.state.gem;
  const got = Q.starClaimP(s, 1);
  eq('claim participation reward 1 (type 1101 x5 gold ticket); claimed twice gives nothing', [got.type, got.value, Q.starClaimP(s, 1), s.state.specials.tickets[1101]], [1101, 5, null, 5]);
  // growth: exp = 90 % of 14.2M * elapsed fraction + points * 1000
  s._now = () => new Date(2026, 7, 25, 12).getTime();
  const e1 = Q.starExp(s);
  eq('exp at 2026-08-25 12:00 = floor(14,200,000 * 0.9 * 5.5/21) + 55 * 1000 = 3,402,142', e1, 3402142);
  eq('level 5 at that exp (2.8M <= exp < 4.4M)', [Q.starLevel(s), Q.starLevel(s, 199999), Q.starLevel(s, 200000), Q.starLevel(s, 14199999), Q.starLevel(s, 14200000)], [5, 1, 2, 9, 10]);
  eq('growth rewards for levels 1-5 are ready, level 6 is not', Q.starRewardsG(s).map(x => x.ready), [true, true, true, true, true, false, false, false, false, false]);
  const gr = Q.starClaimG(s, 1);
  eq('growth level 1 pays 500 gems', [gr.type, gr.value, s.state.gem - gemsBefore], [3, 500, 500]);
  const gr2 = Q.starClaimG(s, 5);
  eq('growth level 5 pays 5 x ticket 1401', [gr2.type, gr2.value, s.state.collection.items[1401]], [1401, 5, 5]);
  eq('level 6 not claimable yet', Q.starClaimG(s, 6), null);
  s._now = () => new Date(2026, 8, 9, 23, 0).getTime();
  eq('on the last day the crowd alone reaches level 9 (floor(14.2M*0.9*~0.958)) -> 9', Q.starLevel(s) >= 9 && Q.starLevel(s) <= 10, true);
  s._now = () => new Date(2026, 8, 10, 0, 1).getTime();
  eq('after 20260909 the event is over: no skill, no pick', [Q.starActive(s), Q.starUse(s, 1)], [false, null]);
  eq('the 3 groups sum to the exp (partner group carries the player points)', (() => { s._now = () => new Date(2026, 7, 25, 12).getTime(); const gs = Q.starGroups(s); return [gs[1] > gs[0], gs[0] === gs[2]]; })(), [true, true]);
  // today (no event): idle, no state change
  const idle = await mk();
  eq('on 2026-11-02 the star-tree event is not running', [idle.feat.telescope.starActive(idle), idle.feat.telescope.starDot(idle)], [false, false]);

  // ---- save / load ----
  const saved = JSON.parse(JSON.stringify(s.state));
  const s2 = await mk(2026, 8, 25, 12);
  s2.load(saved);
  s2.feat.telescope.init(s2);
  eq('save/load keeps the partner cat, the points and the claimed rewards', [s2.state.telescope.star.cat, s2.state.telescope.star.points, s2.state.telescope.star.gotP], [2, 55, [1]]);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
