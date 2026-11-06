#!/usr/bin/env node
/* Mèo & Súp missions feature (games/cats-soup/js/sim/features/missions.js) in node, seeded: daily mission counters and
 * rewards from Mission.json, levelled quests (Quest.json targets), the all-clear scratch card (DailyReward.json roll),
 * the daily reset on a new calendar date, attendance, and save/load.   node test/cats-soup-missions.js */
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
  const M = await imp('js/sim/features/missions.js');
  let seed = 11;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const g = await makeGame(async p => JSON.parse(fs.readFileSync(path.join(G, p), 'utf8')), rng);
  g.fresh();
  const m = g.feat.missions;
  const realNow = Date.now;
  const sellN = n => { for (let i = 0; i < n; i++) g.sellItem({ a: 0, p: B.fromNumber(100), c: false }); };
  const buildNext = () => { const o = g.buildList().find(x => x.n < x.max && !x.w.costGem && g.canBuild(x.w.index)); return o && g.build(o.w.index); };
  const qs = i => m.questState(g, i);
  const ms = i => m.missionState(g, i);

  // ---- tables ----
  eq('fresh: listed missions in display order (9, 0, 1), work-gated ones hidden', m.listedMissions(g).map(r => r.index), [9, 0, 1]);
  eq('quests listed = the 21 rows with a counter rule', m.listedQuests(g).length, 21);
  eq('quest 0 targets 50,100,250,500', [0, 1, 2, 3].map(l => M.questTarget(g.data.missions.quests[0], l)), [50, 100, 250, 500]);
  eq('quest 10 (expand) targets 1,2,3', [0, 1, 2].map(l => M.questTarget(g.data.missions.quests[10], l)), [1, 2, 3]);
  eq('quest 1 (build) targets 5,10,15', [0, 1, 2].map(l => M.questTarget(g.data.missions.quests[1], l)), [5, 10, 15]);
  eq('the fresh pot (built before the feature existed) counts on no quest', qs(1).value, 0);

  // ---- daily mission 9: sell 10 dishes -> gold ticket 1h ----
  sellN(9);
  eq('9 sells: mission 9 at 9/10, mission 0 at 9/50', [ms(9).count, ms(0).count], [9, 9]);
  check('not claimable at 9', m.claimMission(g, 9) === null);
  sellN(1);
  eq('10th sell completes mission 9', ms(9).done, true);
  const out = m.claimMission(g, 9);
  eq('claim pays reward 1101 x1 (a gold ticket, kept by specials)', [out.type, out.value, g.state.specials.tickets[1101]], [1101, 1, 1]);
  check('double claim refused', m.claimMission(g, 9) === null);
  sellN(100);
  eq('counts stop at maxValue (mission 0 capped at 50)', ms(0).count, 50);

  // ---- quest 0: levels, cumulative value, gem reward 10 ----
  eq('quest 0 value after 110 sells', qs(0).value, 110);
  eq('quest 0 level 0 done (110 >= 50)', qs(0).done, true);
  const gem0 = g.state.gem;
  m.claimQuest(g, 0);
  eq('quest 0 claim: +10 gems, level 1, target 100', [g.state.gem - gem0, qs(0).level, qs(0).target], [10, 1, 100]);
  m.claimQuest(g, 0);
  eq('quest 0 claim again at 110 >= 100: level 2, target 250', [qs(0).level, qs(0).target], [2, 250]);
  eq('quest 0 not done at 110 < 250', qs(0).done, false);

  // ---- build / upgrade / expand / recipe counters ----
  g.state.gold = { f: 9, e: 9000 };
  g.state.energy = { f: 9, e: 9000 };
  const v0 = [1, 2, 3, 10, 11].map(i => qs(i).value);
  check('a facility was built', !!buildNext());
  g.upgrade(g.state.works[0], 3);
  eq('build -> quest 1 +1; upgrade x3 -> quest 2 +3', [qs(1).value - v0[0], qs(2).value - v0[1]], [1, 3]);
  const unlockable = g.recipeList(0).find(r => r.open && r.lv === 0);
  g.upgradeRecipe(1, 2);
  eq('recipe 1 two levels -> quest 11 (soup recipe) +2, quest 3 unchanged', [qs(11).value - v0[4], qs(3).value - v0[2]], [2, 0]);
  check('a second soup recipe is open to learn', !!unlockable);
  g.upgradeRecipe(unlockable.f.index, 1);
  eq('learning a new recipe -> quest 3 +1, quest 11 unchanged', [qs(3).value - v0[2], qs(11).value - v0[4]], [1, 2]);
  for (let i = 0; i < 80 && !g.canExpand(); i++) if (!buildNext()) break;
  check('forest can expand', g.canExpand());
  g.expand();
  eq('expand -> quest 10 +1', qs(10).value - v0[3], 1);

  // ---- events from other features ----
  g.place(10, g.emptyCells()[0], 0); // fishing ground makes the Feed and Fishing missions listed
  const listed = m.listedMissions(g).map(r => r.index);
  check('with work 10 built the Feed (2) and Fishing (5) missions are listed', listed.includes(2) && listed.includes(5), listed.join(','));
  g.emit('fish', { star: false });
  eq('fish -> mission 5 and quest 7 count, quest 27 (type 30, star bait) does not', [ms(5).count, qs(7).value, qs(27).value], [1, 1, 0]);
  g.emit('fish', { star: true });
  eq('star fish -> quest 7 = 2, quest 27 = 1', [qs(7).value, qs(27).value], [2, 1]);
  g.emit('feed', {});
  const gem1 = g.state.gem;
  m.claimMission(g, 2);
  eq('feed -> mission 2 claim = 10 gems', g.state.gem - gem1, 10);
  g.emit('gift', {});
  g.emit('photo', {});
  eq('photo or gift -> mission 1 capped at 1', ms(1).count, 1);
  g.state.gold = B.fromNumber(1000); // small, so an hour of income is not dropped by BigNumber's 9-digit gap
  const gold1 = g.state.gold;
  m.claimMission(g, 1);
  eq('mission 1 pays 101 x1200 = avgGold x 1200 s', B.format(B.sub(g.state.gold, gold1)), B.format(B.mul(g.averageIncome(), 1200)));
  const bait = m.claimMission(g, 5);
  eq('mission 5 reward is 6002 x1 (star bait; paid by fishing, else held in the missions bag)', [bait.type, bait.value], [6002, 1]);

  // ---- all-clear scratch card ----
  check('scratch locked while mission 0 is unclaimed', m.claimClear(g) === null);
  for (const r of m.listedMissions(g)) if (ms(r.index).done) m.claimMission(g, r.index);
  g.emit('chest', {});
  g.emit('jar', {});
  for (const r of m.listedMissions(g)) if (ms(r.index).done) m.claimMission(g, r.index);
  g.state.gold = B.fromNumber(1000);
  eq('scratch card ready after all claimed', m.clearReady(g), true);
  eq('three rolled rows', g.state.missions.clear.picks.length, 3);
  g.state.missions.clear.picks = [0, 3, 9]; // 50 gems, gold 1 h, fish heart 1 (DailyReward.json)
  const gem2 = g.state.gem, gold2 = g.state.gold;
  const rows = m.claimClear(g);
  eq('claimClear pays 50 gems + 1 h gold (101) + fish (7)', [g.state.gem - gem2, B.format(B.sub(g.state.gold, gold2)), rows.map(r => r.type)], [50, B.format(B.mul(g.averageIncome(), 3600)), [3, 101, 7]]);
  check('scratch card pays once', m.claimClear(g) === null);

  // ---- DailyReward roll: r = RandomValue(1000), pool = rows with probability >= 1000 - r ----
  let shift = 0;
  const picks = (...rs) => {
    const keep = g.rng; let k = 0; g.rng = () => rs[k++];
    g.state.missions.day = '';
    Date.now = () => realNow() + 86400000 * (++shift);
    m.rollover(g); g.rng = keep;
    return g.state.missions.clear.picks;
  };
  eq('r=0: only the probability-1000 row (index 9) qualifies', picks(0, 0.5, 0, 0.5, 0, 0.5), [9, 9, 9]);
  eq('r=999 and rng 0: whole table, first row', picks(0.9995, 0, 0.9995, 0, 0.9995, 0), [0, 0, 0]);
  eq('r=985 keeps probability-15 row 2 in the pool; r=984 drops it', picks(0.985, 0.1389, 0.984, 0.1389, 0, 0), [2, 3, 9]);

  // ---- daily reset on a new calendar date + attendance ----
  const s = g.state.missions;
  const a0 = m.attendState(g);
  eq('attendance: 28 rows, login days stack up', [a0.rows.length, a0.avail], [28, 4]);
  Date.now = () => realNow() + 86400000 * 100;
  eq('new date resets the dailies', [m.rollover(g), Object.keys(s.daily).length, s.clear.claimed], [true, 0, false]);
  check('same date does not reset again', m.rollover(g) === false);
  const first = m.claimAttend(g);
  eq('attendance day 1 = 200 play points (type 99), held', [first.type, first.value, s.bag[99]], [99, 200, 200]);
  const t0 = g.state.specials.tickets[1101];
  const second = m.claimAttend(g);
  eq('day 2 = gold ticket 1 h (1101)', [second.type, g.state.specials.tickets[1101] - t0], [1101, 1]);
  while (m.attendState(g).avail) m.claimAttend(g);
  eq('5 login days claimed, next row is the 6th', m.attendState(g).next, 5);
  check('nothing to claim without a new day', m.claimAttend(g) === null);
  Date.now = realNow;

  // ---- save / load ----
  g.load(JSON.parse(JSON.stringify(g.save())));
  eq('save/load keeps quest 0 level and the attendance cursor', [g.state.missions.quest[0][0], g.state.missions.attend.next], [2, 5]);
  check('pending() is boolean', typeof m.pending(g) === 'boolean');
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
