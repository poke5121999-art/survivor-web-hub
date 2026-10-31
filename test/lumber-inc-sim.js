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

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
