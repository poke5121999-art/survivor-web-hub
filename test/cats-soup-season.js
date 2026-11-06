#!/usr/bin/env node
/* Mèo & Súp season feature (games/cats-soup/js/sim/features/season.js) in node, with Date.now patched to walk through
 * days and months: month -> season rotation, exchange shop + leftover conversion, event missions + pass, login calendars,
 * return missions, soup pass mini game, play points, save/load.   node test/cats-soup-season.js */
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
  let seed = 5;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const realNow = Date.now;
  const at = (y, m, d, h = 12) => { const t = new Date(y, m - 1, d, h, 0, 0).getTime(); Date.now = () => t; return t; };
  at(2026, 11, 2);
  const g = await makeGame(async p => JSON.parse(fs.readFileSync(path.join(G, p), 'utf8')), rng);
  g.fresh();
  const f = g.feat.season;
  const S = () => g.state.season;
  const addCats = n => { while (g.state.cats.length < n) g.state.cats.push({ ...g.state.cats[0], id: 100 + g.state.cats.length }); };
  const sell = n => { for (let i = 0; i < n; i++) g.sellItem({ a: 0, p: B.fromNumber(100), c: false }); };
  const tk = t => g.state.specials.tickets[t] || 0;

  // ---- schedule: month -> season of SeasonTime ----
  eq('Nov 2026 runs season 57 (autumn25) with 49 shop rows', [f.seasonId(g), f.seasonInfo(g).name, f.seasonInfo(g).shop.length], [57, 'autumn25', 49]);
  eq('29 days left on Nov 2, season ends in December', [new Date(f.seasonInfo(g).endsAt).getMonth(), f.seasonInfo(g).daysLeft], [11, 29]);
  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => f.seasonId(g, new Date(2027, m - 1, 10).getTime()));
  eq('every month has its season', months, [59, 60, 61, 62, 63, 64, 66, 67, 43, 68, 57, 58]);
  eq('day group of Nov 2026 is 13, soup pass table is 62', [f.dayGroup(Date.now()), f.soupSeason(Date.now())], [13, 62]);
  eq('fresh: the first login counts for event mission 0', S().em[0], [0, 1]);
  check('events locked below 3 cats', f.calState(g, 'group') === null && !f.soupLimit(g));

  // ---- shop: items, price, limit ----
  check('no items: cannot buy', f.buyShop(g, 31) === null);
  S().items = 1000;
  const t0 = tk(1201);
  const out = f.buyShop(g, 31);
  eq('row 31 (30 items) pays 1201 x3 and costs 30', [out.type, out.value, tk(1201) - t0, S().items], [1201, 3, 3, 970]);
  for (let i = 0; i < 5; i++) f.buyShop(g, 24); // 80 items each, enableCount 5
  eq('row 24 limit 5: five bought, sixth refused, 400 items spent', [S().buys[24], f.buyShop(g, 24), S().items], [5, null, 570]);
  const lamp = f.buyShop(g, 1); // 200 items -> lamp 99 (theme feature owns type 14)
  eq('row 1 (200 items) pays lamp 99', [lamp.type, lamp.value, S().items], [14, 99, 370]);
  check('row 1 is single use', f.buyShop(g, 1) === null);

  // ---- event items come from dishes: 20 % of food events (own generator) ----
  S().items = 0;
  for (let i = 0; i < 2000; i++) g.emit('food', {});
  check('2000 dishes -> about 400 event items (20 %)', S().items > 340 && S().items < 460, `${S().items}`);

  // ---- event missions + event pass ----
  eq('13 event missions are listed (14 rows minus 4 = feed, which has no sim event)', f.missionList(g).length, 13);
  sell(50);
  const m1 = f.missionList(g).find(x => x.row.index === 1);
  eq('sell 50 completes event mission 1 (count 50/50)', [m1.count, m1.max, m1.done], [50, 50, true]);
  const it0 = S().items, pp0 = S().passPts;
  f.claimMission(g, 1);
  eq('claim pays 4 pass points and 2 event items', [S().passPts - pp0, S().items - it0], [4, 2]);
  check('double claim refused', f.claimMission(g, 1) === null);
  check('pass level 0 (40 points) still closed', f.claimPass(g, 0) === null);
  S().passPts = 40;
  const items1 = S().items;
  f.claimPass(g, 0);
  eq('pass level 0 at 40 points pays 140 event items', S().items - items1, 140);
  eq('premium column is never paid: claims only touch the free reward', S().passClaimed, { 0: 1 });

  // ---- login calendars need 3 cats ----
  addCats(3);
  at(2026, 11, 2, 13); f.refresh(g);
  const gr = f.calState(g, 'group');
  eq('calendar group 13 has 7 rows, day 0 open, nothing claimed', [gr.rows.length, gr.unlock, gr.rows[0].rewardType, gr.rows[0].rewardValue], [7, 0, 5, 14080]);
  const c0 = f.claimCal(g, 'group', 0);
  eq('day 0 pays equipment 14080 (type 5)', c0.type, 5);
  check('day 1 closed on the same date', f.claimCal(g, 'group', 1) === null);
  at(2026, 11, 3); f.refresh(g);
  const c1 = f.claimCal(g, 'group', 1);
  eq('next date opens day 1: fish 7106 x1', [c1.type, c1.value], [7106, 1]);
  const se = f.calState(g, 'season');
  eq('season calendar (57) day 0 pays pudding 23 x1, day 1 fish 7106', [se.rows[0].rewardType, se.rows[0].rewardValue, se.rows[1].rewardType, se.unlock], [23, 1, 7106, 1]);
  const pud = g.state.specials.pudding;
  f.claimCal(g, 'season', 0);
  eq('claim of season day 0 gives 1 pudding', g.state.specials.pudding - pud, 1);
  const bg = f.calState(g, 'beginner');
  eq('beginner gift tier 3: 7 days, day 0 is equipment 107', [bg.rows.length, bg.rows[0].rewardType, bg.rows[0].rewardValue], [7, 5, 107]);
  const wl = f.calState(g, 'welcome');
  eq('welcome gift tier 3: 15 days, day 0 = 1103 x5', [wl.rows.length, wl.rows[0].rewardType, wl.rows[0].rewardValue], [15, 1103, 5]);
  const t3 = tk(1103);
  f.claimCal(g, 'welcome', 0);
  eq('welcome day 0 pays 1103 x5', tk(1103) - t3, 5);
  f.claimCal(g, 'welcome', 1); // 97 welcome coin x600: no owner, held in the bag
  eq('welcome day 1 (welcome coin 97 x600) is held in the bag', S().bag[97], 600);

  // ---- soup pass ----
  const lv = f.soupLevels(g);
  eq('soup pass 62: 29 levels, level 0 at 40 points then +100 each', [lv.length, lv[0].need, lv[1].need, lv[28].need], [29, 40, 140, 2840]);
  const gm = f.soupStart(g);
  eq('a round shows 3 wanted and 6 offered ingredients', [gm.target.length, gm.options.length], [3, 6]);
  gm.target.forEach(x => f.soupPick(g, x));
  eq('perfect soup pays SoupPassInit[5] = 20 points', [S().soup.pts, S().soup.plays, gm.gain], [20, 1, 20]);
  const gm2 = f.soupStart(g);
  const wrong = gm2.options.filter(x => !gm2.target.includes(x)).slice(0, 3);
  wrong.forEach(x => f.soupPick(g, x));
  eq('all wrong pays SoupPassInit[4] = 10 points', [S().soup.pts, S().soup.plays], [30, 2]);
  check('level 0 closed at 30 points', f.claimSoup(g, 0) === null);
  S().soup.pts = 40;
  const sp = f.claimSoup(g, 0);
  eq('level 0 pays equipment 5458', [sp.type, sp.items[0].index], [5, 5458]);
  S().soup.plays = 19;
  const gm3 = f.soupStart(g);
  gm3.target.forEach(x => f.soupPick(g, x));
  eq('20 rounds a day, the 21st is refused', [S().soup.plays, f.soupStart(g)], [20, null]);

  // ---- play points: minutes of play today ----
  eq('play time 0: nothing to claim', f.ppList(g).filter(x => x.open).length, 0);
  for (let i = 0; i < 61; i++) g.tick(5); // 305 s
  eq('after 305 s the 5 minute reward is open', f.ppList(g).map(x => x.open), [true, false, false, false, false]);
  f.claimPlayPoint(g, 0);
  eq('claim pays 10 play points (type 99)', [g.state.missions.bag[99], f.playPoints(g)], [10, 10]);
  check('double claim refused', f.claimPlayPoint(g, 0) === null);

  // ---- save / load ----
  g.load(JSON.parse(JSON.stringify(g.save())));
  eq('save/load keeps claims, points and calendars', [S().passClaimed[0], S().soup.claimed[0], S().cal.group.claimed[0], S().pp.claimed[0]], [1, 1, 1, 1]);

  // ---- a new day resets the daily parts ----
  at(2026, 11, 4); f.refresh(g);
  eq('new date: play time and soup rounds reset, soup points stay', [S().pp.sec, S().soup.plays, S().soup.pts], [0, 0, 60]);

  // ---- return missions: a week away ----
  at(2026, 11, 12); f.refresh(g); // 8 days since Nov 4
  let r = f.retState(g);
  eq('8 days away opens return day 1 with the 5 supported missions of 13', [r.day, r.rows.map(x => x.row.missionType)], [1, [17, 6, 0, 100, 5]]);
  const t10 = tk(1103);
  const lg = r.rows.find(x => x.row.missionType === 17);
  eq('login mission is counted on the return date', [lg.count, lg.done], [1, true]);
  f.claimReturn(g, lg.row.index);
  eq('claim pays 1103 x10', tk(1103) - t10, 10);
  sell(10);
  r = f.retState(g);
  eq('sell 10 completes return mission 0:10', r.rows.find(x => x.row.missionType === 0).done, true);
  check('clear reward needs all missions claimed', f.claimReturnClear(g) === null);
  at(2026, 11, 13); f.refresh(g);
  eq('next date moves to return day 2 (missions 17, 0, 100, 19, 18)', [f.retState(g).day, f.retState(g).rows.map(x => x.row.missionType)], [2, [17, 0, 100, 19, 18]]);
  at(2026, 11, 20); f.refresh(g);
  check('return missions end after 5 days', f.retState(g) === null);

  // ---- month change: leftover items become gold tickets, event data switches ----
  S().items = 120;
  const g1 = tk(1101);
  at(2026, 12, 3); f.refresh(g);
  eq('Dec 3: season 58, items 0, 120 left over -> 2 gold tickets (1101)', [f.seasonId(g), S().items, tk(1101) - g1, S().converted], [58, 0, 2, 2]);
  eq('shop and pass restart in the new season', [Object.keys(S().buys).length, S().passPts, Object.keys(S().passClaimed).length, S().soup.pts], [0, 0, 0, 0]);
  eq('calendars restart too (day group 1, soup pass table 67)', [f.calState(g, 'group').unlock, f.dayGroup(Date.now()), f.soupSeason(Date.now())], [0, 1 + ((2026 * 12 + 11) % 13), 67]);
  at(2027, 1, 5); f.refresh(g);
  eq('Jan 5 2027: season 59 (newyear26)', [f.seasonId(g), f.seasonInfo(g).name], [59, 'newyear26']);

  Date.now = realNow;
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
