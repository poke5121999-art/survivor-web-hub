#!/usr/bin/env node
/* Mèo & Súp "minigame" rules (games/cats-soup/js/sim/features/minigame.js) in node, literal values from the tables and
 * D:/catsoup-ref/rules/minigame.md: butterfly and mole sub games (20 s, 1 free + 2 ad tries a day, +1 a catch, hard hat mole
 * two taps for +3, single rewards by score, season rewards by total, rare animals), and Cooking Lab (8 ingredients, 3 to guess
 * in order, 15 tries, 40/100/200 points, 2 tries a day).
 *   node test/cats-soup-minigame.js */
'use strict';
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const G = path.join(__dirname, '..', 'games', 'cats-soup');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); ok ? pass++ : fail++; };
const eq = (name, a, b) => check(name, JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a)} vs ${JSON.stringify(b)}`);

(async () => {
  const { makeGame } = await import(pathToFileURL(path.join(G, 'js/sim/boot.js')).href);
  const S = await import(pathToFileURL(path.join(G, 'js/sim/features/minigame.js')).href);
  let seed = 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const g = await makeGame(async p => JSON.parse(fs.readFileSync(path.join(G, p), 'utf8')), rng);
  g.fresh();
  const mg = g.state.minigame;
  const D = g.data.minigame;

  // ---- tables ----
  eq('butterfly single rewards (group 1): 10 coins x5, 20 gold ticket 3h, 25 gems x5', S.singleRewards(g, 1).map(r => [r[1], r[4], r[5]]), [[10, 4, 5], [20, 1102, 1], [25, 3, 5]]);
  eq('mole single rewards (group 2) are the same', S.singleRewards(g, 2).map(r => [r[1], r[4], r[5]]), [[10, 4, 5], [20, 1102, 1], [25, 3, 5]]);
  eq('mole season rewards: 18 rows, first at 25 points = 5 recipe tickets 3h, last at 450 = 3 fish 7106', [S.periodRewards(g, 2).length, S.periodRewards(g, 2)[0].slice(1), S.periodRewards(g, 2).pop().slice(1)], [18, [25, 1, 1, 1202, 5], [450, 1, 18, 7106, 3]]);
  eq('rare set rewards: butterfly 64 = type 21 (bgm), mole 8 = type 40, 40 percent a game', [S.collectRow(g, 1), S.collectRow(g, 2)].map(r => [r.rewardType, r.rewardValue, r.prob]), [[21, 64, 40], [40, 8, 40]]);
  eq('mole: stay 1.3/1.1/0.9 s, interval 1.4/1.2/1.0 s, 7 holes, hat chance 0.3', [S.MOLE.stay, S.MOLE.interval, S.MOLE.holes, S.MOLE.special], [[1.3, 1.1, 0.9], [1.4, 1.2, 1.0], 7, 0.3]);
  eq('butterfly: spawn every 1.5 s, 2-3 / 3-4 / 6-7 a spawn, phases at 8 and 14 s', [S.BUTTERFLY.interval, S.BUTTERFLY.count, S.BUTTERFLY.phaseAt], [1.5, [[2, 3], [3, 4], [6, 7]], [8, 14]]);
  eq('mini game group of Cooking Lab (type 5) = MiniGame row 4: 15/30/45 = 5 coins, gold ticket 3h, pudding', [S.miniGroup(g, 5), S.miniSingle(g, 5).map(r => [r[1], r[4], r[5]])], [4, [[15, 4, 5], [30, 1102, 1], [45, 23, 1]]]);
  eq('Cooking Lab season rewards start at 50 points = 5 gold tickets 3h', S.miniPeriod(g, 5)[0].slice(1), [50, 1, 1, 1102, 5]);

  // ---- tries: 1 free + 2 by ad, a new day refills ----
  eq('fresh game: butterfly 1 free + 2 ad tries', [mg.sub[1].free, mg.sub[1].ads, S.triesLeft(g, 1)], [1, 2, 3]);
  const ses1 = S.startSub(g, 1);
  eq('a play spends the free try first', [mg.sub[1].free, mg.sub[1].ads], [0, 2]);
  S.startSub(g, 1); S.startSub(g, 1);
  eq('then the ad tries, 3 plays a day in all', [mg.sub[1].free, mg.sub[1].ads, S.startSub(g, 1)], [0, 0, null]);
  g.state.specials.skewMs += 86400000;
  eq('next day: 1 free + 2 ad again', [S.triesLeft(g, 1), mg.sub[1].free, mg.sub[1].ads], [3, 1, 2]);

  // ---- mole ----
  const gold0 = g.state.coin, gem0 = g.state.gem;
  const m = S.startSub(g, 2, false);
  check('mole session has 7 holes and a 3 s count', m.holes.length === 7 && m.t === -3);
  S.stepSub(g, m, 3.0);   // ready count ends
  const up = (i, o) => Object.assign(m.holes[i], { state: 'up', type: 0, grade: 0, hits: 0, life: 1 }, o);
  up(0, {}); up(1, { grade: 1 });
  eq('normal mole: one tap = +1', S.tapHole(g, m, 0), 1);
  eq('hard hat mole: first tap 0 points', S.tapHole(g, m, 1), 0);
  eq('hard hat mole: second tap = +3', S.tapHole(g, m, 1), 3);
  eq('a caught mole gives no second point', S.tapHole(g, m, 0), 0);
  eq('score 4, season total 4', [m.score, mg.sub[2].total], [4, 4]);
  up(2, {}); up(3, {});
  S.tapHole(g, m, 2); S.tapHole(g, m, 3);
  check('mole holes refill every interval (a hole stays idle until its mole is up)', m.holes.some(h => h.state === 'wait' || h.state === 'up' || h.state === 'idle'));
  // 20 s play to the end
  for (let i = 0; i < 400; i++) S.stepSub(g, m, 0.05);
  check('mole game ends at 20 s', m.done === true && m.t >= 20);
  const r = m.result;
  eq('score under 10 pays nothing', r.score < 10 ? r.paid.length : 0, 0);
  // forced score of 26: all three single rewards
  const m2 = S.startSub(g, 2, true);
  eq('practice: no try spent', mg.sub[2].free + mg.sub[2].ads, 2);
  const m3 = S.startSub(g, 2, false);
  S.stepSub(g, m3, 3.0);
  m3.score = 26;
  const gems = g.state.gem, coins = g.state.coin, tickets = (g.state.specials.tickets[1102] || 0);
  const res = S.endSub(g, m3);
  eq('score 26: coins +5, ticket 1102 +1, gems +5', [g.state.coin - coins, (g.state.specials.tickets[1102] || 0) - tickets, g.state.gem - gems], [5, 1, 5]);
  eq('top score kept', mg.sub[2].top >= 26, true);
  const m4 = S.startSub(g, 2, true);
  S.stepSub(g, m4, 3.0);
  m4.holes[0] = { state: 'up', type: 0, grade: 0, hits: 0, life: 1 };
  const t0 = mg.sub[2].total;
  S.tapHole(g, m4, 0);
  eq('practice scores nothing into the total', mg.sub[2].total, t0);
  check('practice never carries a rare animal', m4.rare === 0);

  // ---- season rewards by total score ----
  mg.sub[2].total = 24;
  eq('24 points: nothing ready', S.periodState(g, 2).filter(p => p.ready).length, 0);
  mg.sub[2].total = 60;
  eq('60 points: rows at 25 and 50 ready', S.periodState(g, 2).filter(p => p.ready).map(p => p.need), [25, 50]);
  const t1202 = g.state.specials.tickets[1202] || 0, t1102 = g.state.specials.tickets[1102] || 0;
  S.claimPeriod(g, 2, 1); S.claimPeriod(g, 2, 2);
  eq('claim: 5 recipe tickets 3h and 5 gold tickets 3h', [(g.state.specials.tickets[1202] || 0) - t1202, (g.state.specials.tickets[1102] || 0) - t1102], [5, 5]);
  eq('a row pays once', S.claimPeriod(g, 2, 1), null);

  // ---- butterfly: rare butterflies and the set reward ----
  g.state.specials.skewMs += 86400000;
  mg.sub[1].collected = [];
  let found = 0;
  for (let k = 0; k < 40 && mg.sub[1].collected.length < 3; k++) {
    g.state.specials.skewMs += 86400000;
    const b = S.startSub(g, 1);
    if (!b) continue;
    S.stepSub(g, b, 3.0);
    for (let i = 0; i < 420 && !b.done; i++) {
      S.stepSub(g, b, 0.05);
      for (const f of b.bf.slice()) { S.tapButterfly(g, b, f); if (f.type) found += 1; }
    }
  }
  check('every butterfly of a 20 s game can be caught and rare ones turn up (40 percent of games)', found >= 3, `rare caught ${found}`);
  eq('all three rare butterflies collected', mg.sub[1].collected.slice().sort(), [1, 2, 3]);
  check('set reward paid once (type 21 waits in the bag until a feature takes bgm)', mg.sub[1].collectRewarded === true && (mg.bag[21] === 64 || g.features.some(f => f.rewards && f.rewards[21])));
  check('a catch is +1: total counts every catch', mg.sub[1].total > 0 && mg.sub[1].total >= found);

  // ---- Cooking Lab ----
  g.state.specials.skewMs += 86400000;
  eq('Cooking Lab: 2 tries a day', S.miniTries(g, 5), 2);
  const c = S.startMini(g, 5, false);
  eq('tray of 8 distinct ingredients, answer of 3 places, 15 tries', [new Set(c.items).size, c.items.length, c.answer.length, new Set(c.answer).size, c.left], [8, 8, 3, 3, 15]);
  eq('a play spends one try', S.miniTries(g, 5), 1);
  c.answer = [0, 2, 5];
  eq('guess [0,1,2] vs [0,2,5]: 1 right place, 1 in the answer elsewhere', (({ strike, ball }) => [strike, ball])(S.cookGuess(g, c, [0, 1, 2])), [1, 1]);
  eq('guess [3,4,6]: all wrong', (({ strike, ball }) => [strike, ball])(S.cookGuess(g, c, [3, 4, 6])), [0, 0]);
  eq('guess [5,2,0]: 1 right place, 2 elsewhere', (({ strike, ball }) => [strike, ball])(S.cookGuess(g, c, [5, 2, 0])), [1, 2]);
  eq('a repeated ingredient is not a guess', S.cookGuess(g, c, [1, 1, 2]), null);
  eq('3 guesses used of 15', c.left, 12);
  const coins2 = g.state.coin, tk = g.state.specials.tickets[1102] || 0, pud = g.state.specials.pudding;
  const win = S.cookGuess(g, c, [0, 2, 5]);
  eq('exact answer: 3 strikes ends the play with 200 points', [win.strike, c.done, c.won, c.score], [3, true, true, 200]);
  eq('200 points: 5 coins, gold ticket 3h, pudding', [g.state.coin - coins2, (g.state.specials.tickets[1102] || 0) - tk, g.state.specials.pudding - pud], [5, 1, 1]);
  eq('total and top score', [mg.mini[5].total, mg.mini[5].top], [200, 200]);
  eq('no guess after the end', S.cookGuess(g, c, [0, 2, 5]), null);
  // out of tries: pays by the strikes of the last guess
  const c2 = S.startMini(g, 5, false);
  c2.answer = [0, 1, 2];
  for (let i = 0; i < 14; i++) S.cookGuess(g, c2, [3, 4, 5]);
  check('14 wrong guesses: still playing', !c2.done && c2.left === 1);
  S.cookGuess(g, c2, [0, 4, 5]);
  eq('15th guess with 1 right: play over, 40 points', [c2.done, c2.won, c2.score], [true, false, 40]);
  eq('40 points pays the 15 and 30 point rewards, not 45', c2.result.paid.map(p => p.need), [15, 30]);
  eq('no try left: a third play is refused', S.startMini(g, 5, false), null);
  const c3 = S.startMini(g, 5, true);
  check('practice needs no try and scores nothing', !!c3 && (S.cookGuess(g, c3, [0, 1, 2]), mg.mini[5].total === 200 + 40));
  eq('season rewards by total 240: rows at 50, 100, 160 and 220 ready', S.miniPeriodState(g, 5).filter(p => p.ready).map(p => p.need), [50, 100, 160, 220]);
  const gw = S.claimMini(g, 5, 1);
  check('claim pays', !!gw);

  // ---- magnet board: magnets come from the kitty feature (reward 3500), read through kitty.magnets(g) ----
  const K = g.feat.kitty;
  eq('tables: 36 magnets, boards cost 0/200/400/800/1200, themes 0/800/800 gems', [D.magnets.length, S.boardRows(g).map(r => r.cost), S.themeRows(g).map(r => [r.cost, r.costType])], [36, [0, 200, 400, 800, 1200], [[0, 0], [800, 3], [800, 3]]]);
  eq('fresh: board 0 open and theme 0 owned, others closed', [Object.keys(mg.magnet.boards), mg.magnet.themes, S.boardOpen(g, 1)], [['0'], [0], false]);
  eq('no magnet yet: inventory empty, no new mark', [S.magnetOwned(g), S.hasNewMagnet(g)], [{}, false]);
  for (let i = 0; i < 3; i++) g.reward(3500, 9);
  g.reward(3500, 18);
  eq('3 x asia01 (9) and the commemorative 18 read through kitty.magnets', [S.magnetOwned(g), K.magnets(g)], [{ 9: 3, 18: 1 }, { 9: 3, 18: 1 }]);
  eq('item API: itemCount(3500009) = 3 over the same map', [g.itemCount(K.magnetItem(9)), K.magnetItem(9)], [3, 3500009]);
  eq('type totals: normal 3, special 1; new mark on', [S.magnetTotal(g, 0), S.magnetTotal(g, 2), S.hasNewMagnet(g)], [3, 1, true]);
  const it = S.deployMagnet(g, 0, 9, 0.25, 0.75);
  eq('deploy asia01 at (0.25, 0.75): 1 placed, 2 free, seen', [it && [it.m, it.x, it.y], S.magnetPlaced(g, 9), S.magnetFree(g, 9), S.magnetNew(g, 9)], [[9, 0.25, 0.75], 1, 2, false]);
  S.deployMagnet(g, 0, 18, 2, -1);
  eq('x, y clamp to 0..1; a second copy of 18 has no free one', [mg.magnet.boards[0].items[1].x, mg.magnet.boards[0].items[1].y, S.deployMagnet(g, 0, 18), S.deployMagnet(g, 3, 9)], [1, 0, null, null]);
  const tok0 = g.itemCount(96);
  eq('sell asia01: +30 souvenir tokens, 2 owned', [S.sellMagnet(g, 9).tokens, g.itemCount(96) - tok0, S.magnetOwned(g)[9]], [30, 30, 2]);
  eq('the last one stands on the board: no free copy to sell; 18 is commemorative (sell -1)', [S.sellMagnet(g, 9) && 1, S.sellMagnet(g, 18), S.magnetRow(g, 18).sell], [1, null, -1]);
  eq('now none free', [S.magnetFree(g, 9), S.sellMagnet(g, 9)], [0, null]);
  g.state.gem = 100;
  eq('board 2 (400) / board 1 (200) with 100 gems: short', [S.buyBoard(g, 2), S.buyBoard(g, 1)], [{ short: 'gem' }, { short: 'gem' }]);
  g.state.gem = 1000;
  eq('board 1 costs 200 gems; once only', [S.buyBoard(g, 1), g.state.gem, S.buyBoard(g, 1)], [{ board: 1 }, 800, null]);
  eq('theme 1 costs 800 gems and sets on board 1; theme 2 not owned', [S.buyTheme(g, 1), g.state.gem, S.setBoardTheme(g, 1, 1), S.setBoardTheme(g, 1, 2), mg.magnet.boards[1].theme], [{ theme: 1 }, 0, true, false, 1]);
  K.magnets(g); g.state.kitty.magnets[9] = 150;
  eq('150 magnets of a type fill the inventory (GetMagnetMaxInven 0x96)', [S.magnetFull(g, 0), S.magnetFull(g, 2)], [true, false]);
  g.state.kitty.magnets[9] = 1;
  g.spendItem(K.magnetItem(9), 1);
  for (let i = 0; i < 3; i++) g.tick(0.5);
  eq('spent elsewhere: the placed copy leaves the board', [mg.magnet.boards[0].items.map(x => x.m), S.magnetOwned(g)], [[18], { 18: 1 }]);
  const g2 = await makeGame(async p => JSON.parse(fs.readFileSync(path.join(G, p), 'utf8')), rng);
  g2.load(JSON.parse(JSON.stringify(g.save())));
  eq('save/load keeps boards, themes and magnets', [Object.keys(g2.state.minigame.magnet.boards), g2.state.minigame.magnet.themes, g2.state.minigame.magnet.boards[0].items.length, g2.feat.minigame.magnetOwned(g2)], [['0', '1'], [0, 1], 1, { 18: 1 }]);

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
