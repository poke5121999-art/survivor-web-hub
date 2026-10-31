#!/usr/bin/env node
/* Lumber Inc (games/lumber-inc) rules without a browser: a teleporting bot plays the opening of map 1 the way the
 * original tutorial leads (guide money -> peeler 1001 -> forest gate 10011 -> chop -> deposit -> squarer 2001 ->
 * station 5001 -> trucks), checking the numbers of D:\lumber-ref\rules\economy.md along the way.
 *   node test/lumber-inc-sim.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const G = path.join(__dirname, '..', 'games', 'lumber-inc');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); ok ? pass++ : fail++; };

(async () => {
  const url = f => require('url').pathToFileURL(path.join(G, f)).href;
  const { describeWorld } = await import(url('js/sim/world.js'));
  const { Sim, SQUARE, PEELED } = await import(url('js/sim/sim.js'));
  const { Mover } = await import(url('js/sim/move.js'));
  const scene = JSON.parse(fs.readFileSync(path.join(G, 'art/world1/scene.json'), 'utf8'));
  const config = JSON.parse(fs.readFileSync(path.join(G, 'data/config.json'), 'utf8'));
  const world = describeWorld(scene);
  const sim = new Sim(world, config);
  const S = sim.state;
  const B = id => world.buildings.get(id);
  const at = v => { S.player.x = v.x; S.player.z = v.z; };
  const run = (sec, moving = false) => { for (let t = 0; t < sec; t += 1 / 30) sim.tick(1 / 30, moving); sim.events.length = 0; };
  const runUntil = (pred, max = 600) => { let t = 0; while (!pred() && t < max) { sim.tick(1 / 30, false); t += 1 / 30; } sim.events.length = 0; return t; };

  check('opening statuses: peeler pad open, squarer hidden, forest open', sim.status(B(1001)) === 'locked' && sim.status(B(2001)) === 'hidden' && sim.active(1),
    `${sim.status(B(1001))}/${sim.status(B(2001))}`);
  at(B(-1).moneyBox.middle); run(0.2);
  check('guide money gives 50 once', S.coins === 50, `${S.coins}`);
  run(0.5);
  check('guide money not twice', S.coins === 50);

  at(B(1001).pad.center);
  const tPad = runUntil(() => sim.active(1001));
  check('peeler 1001 bought for 30 in about 0.56 s', sim.active(1001) && S.coins === 20 && tPad < 0.8, `${S.coins} coins, ${tPad.toFixed(2)} s`);
  check('factory pad gives 5 exp', S.exp === 5, `${S.exp}`);
  const c1 = S.coins;
  check('task 1 "Unlock 1 Peeler" is done and pays 20 when claimed', sim.missions.done() && sim.missions.claim() && S.coins === c1 + 20 && sim.missions.current.Order === 2);
  S.coins -= 20;
  check('forest gate 10011 and squarer 2001 pads open after the peeler', sim.status(B(10011)) === 'locked' && sim.status(B(2001)) === 'locked');
  at(B(10011).pad.center); runUntil(() => sim.active(10011));
  check('forest gate costs 5', sim.active(10011) && S.coins === 15, `${S.coins}`);

  // Chop: stand by a tree of forest 1 until the pack is full.
  // Chop: walk from standing tree to standing tree until the pack is full.
  const nextTree = () => {
    const p = S.player;
    const t = sim.forest.trees.filter(t => t.forest === 1 && t.state === 0)
      .sort((a, b) => Math.hypot(a.pos.x - p.x, a.pos.z - p.z) - Math.hypot(b.pos.x - p.x, b.pos.z - p.z))[0];
    at({ x: t.pos.x + 0.8, z: t.pos.z });
  };
  at({ x: -8, z: 14 });
  let tFull = 0;
  while (!sim.pack.full && tFull < 120) {
    if (!sim.forest.choppable(S.player, () => true).length && !sim.forest.trees.some(t => t.state === 3)) nextTree();
    sim.tick(1 / 30, false);
    tFull += 1 / 30;
  }
  sim.events.length = 0;
  check('chopping fills the 10-log pack', sim.pack.count === 10, `${sim.pack.count} logs in ${tFull.toFixed(1)} s`);
  check('a felled tree turns into a stump', sim.forest.trees.some(t => t.state === 2));

  at(B(1001).inBox.middle); run(0.5);
  check('deposit 10 logs at the peeler (1 per 0.02 s)', sim.pack.count === 0 && sim.stock('1001:in') <= 10, `pack ${sim.pack.count}, in ${sim.stock('1001:in')}`);
  check('income 10 per log goes to the peeler pile', S.piles[1001] === 100, `${S.piles[1001]}`);
  at(B(1001).moneyBox.middle); run(0.1);
  check('pile collected at once', S.coins === 115 && !S.piles[1001], `${S.coins}`);

  run(14);
  check('peeler makes a peeled log about every 6.5 s', sim.stock('1001:out') === 2, `out ${sim.stock('1001:out')}`);

  at(B(2001).pad.center); runUntil(() => sim.active(2001));
  check('squarer 2001 is not affordable with 115 (partial payment kept)', !sim.active(2001) && S.paid[2001] === 115 && S.coins === 0, `paid ${S.paid[2001]}`);
  S.coins += 35; runUntil(() => sim.active(2001));
  check('squarer bought once the rest is paid', sim.active(2001) && S.coins === 0);

  run(60);
  at(B(1001).outBox.middle); run(0.5);
  const peeled = sim.pack.countOf(PEELED);
  check('take peeled logs from the peeler output (cap 12)', peeled >= 8 && peeled <= 10, `${peeled}`);
  at(B(2001).inBox.middle); run(0.5);
  check('squarer pays 15 per peeled log', S.piles[2001] === 15 * peeled, `${S.piles[2001]}`);
  at(B(2001).moneyBox.middle); run(0.1);
  S.coins += 400;
  at(B(5001).pad.center); runUntil(() => sim.active(5001));
  check('station 5001 bought, sell store 10 opens with it', sim.active(5001) && sim.active(10));

  run(60);
  at(B(2001).outBox.middle); run(0.5);
  const sq = sim.pack.countOf(SQUARE);
  at(B(10).inBox.middle); run(0.5);
  check('squares go into store 10', sim.stock('10:in') === sq && sq > 0, `${sq}`);
  at(B(5001).inBox.middle);
  runUntil(() => S.firstTruck, 120);
  check('first truck ever carries 1 square for 20', S.firstTruck && S.piles[5001] === 20, `${S.piles[5001]}`);
  const before = S.piles[5001];
  runUntil(() => S.piles[5001] > before, 60);
  check('next truck at level 1 carries 3 (60 coins)', S.piles[5001] - before === 60, `${S.piles[5001] - before}`);

  // Employees (rules/workers-guide-camera.md A): lumberjack hut 10101 after the station, first hire free.
  S.coins += 400;
  at(B(10101).pad.center); runUntil(() => sim.active(10101));
  check('lumberjack hut 10101 opens after the station for 400', sim.active(10101));
  const c0 = S.coins;
  check('first lumberjack is free, the second costs 450', sim.crew.hireCost(10101) === 0 && sim.crew.hire(10101) && S.coins === c0 && sim.crew.hireCost(10101) === 450);
  const w = sim.crew.workers[0];
  check('lumberjack stats from EmployeeUpgradeConf lv1: speed 2, pack 4, axe 34', w.speed === 2 && w.pack.max === 4 && w.dmg === 34,
    `${w.speed}/${w.pack.max}/${w.dmg}`);
  at({ x: 60, z: 60 });
  const p0 = S.piles[1001] || 0;
  run(150);
  const delivered = ((S.piles[1001] || 0) - p0) / 10;
  check('the lumberjack alone chops and delivers logs to the peeler', delivered >= 4, `${delivered} logs in 150 s`);
  S.coins += 2000;
  at(B(1002).pad && B(1002).pad.center || { x: 0, z: 0 });
  sim.state.bought[10000] = true; sim.recheck();
  at(B(10102).pad.center); runUntil(() => sim.active(10102));
  check('porter hut 10102 opens after the player cabin', sim.active(10102));
  sim.crew.hire(10102);
  S.stock['2001:out'] = 6; S.stock['1001:out'] = 6;
  const sold0 = S.piles[5001] || 0, sqPile0 = S.piles[2001] || 0;
  at({ x: 60, z: 60 });
  let toStore = 0;
  for (let t = 0; t < 60; t += 1 / 30) {
    sim.tick(1 / 30, false);
    toStore += sim.events.filter(e => e.type === 'deposit' && e.id === 10).length;
    sim.events.length = 0;
  }
  check('the porter moves squares to the store and peeled logs to the squarer',
    toStore >= 6 && (S.piles[2001] || 0) > sqPile0, `squares stored ${toStore}, squarer pile +${(S.piles[2001] || 0) - sqPile0}`);
  check('trucks load while the porter waits at the counter', (S.piles[5001] || 0) > sold0, `truck pile +${(S.piles[5001] || 0) - sold0}`);

  // Research stars (ResearchUpgradeConf): peeler 1001 star 1 needs the porter hut and costs 1580; +2 income, -2.25 s.
  S.coins += 2000;
  const inc0 = sim.income(1001), dur0 = sim.duration(1001);
  check('peeler star 1 costs 1580 and needs the porter hut', sim.nextStar(1001).Cost === 1580 && !sim.starBlocked(1001));
  check('star 1 adds 2 coins per log and cuts 2.25 s per item', sim.buyStar(1001) && sim.income(1001) === inc0 + 2 && Math.abs(sim.duration(1001) - (dur0 - 2.25)) < 1e-9,
    `${inc0}->${sim.income(1001)}, ${dur0}->${sim.duration(1001)}`);
  check('star 2 of the peeler waits for squarer 2002', sim.starBlocked(1001) === 'pre');

  // Star 2 is paid on the research frame like a pad (4520), then the senior machine costs 10 gems: IncomeAddAd 5, CapacitAddAd 14.
  S.bought[2002] = true; sim.recheck();
  S.coins = 5000; S.gems = 10;
  at(B(1001).researchBox.middle);
  const tStar = runUntil(() => sim.stars(1001) === 2, 30);
  check('star 2 paid on the research frame for 4520', sim.stars(1001) === 2 && S.coins === 480 && !S.paid.r1001, `${S.coins} coins, ${tStar.toFixed(2)} s`);
  run(1);
  check('the frame takes nothing more while star 3 waits for player level 6', S.coins === 480 && sim.starBlocked(1001) === 'level');
  check('normal machine: +4 per log, output cap 22', sim.income(1001) === 14 && sim.outCap(1001) === 22, `${sim.income(1001)}/${sim.outCap(1001)}`);
  check('senior machine for 10 gems: +5 per log, output cap 26', sim.chooseMachine(1001, 1) && S.gems === 0 && sim.income(1001) === 15 && sim.outCap(1001) === 26,
    `${sim.income(1001)}/${sim.outCap(1001)}`);
  check('the machine is chosen once per star', !sim.chooseMachine(1001, 2));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
