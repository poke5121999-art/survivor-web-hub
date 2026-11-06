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
  run(0.1);
  check('guide 1 points at the start-up cash with its welcome line', sim.guide.show.arrow === 'GuideMoneyBuilding' && sim.guide.show.word === 'guide_word_1001',
    `${sim.guide.show.arrow} ${sim.guide.show.word}`);
  at(B(-1).moneyBox.middle); run(0.2);
  check('guide money gives 50 once', S.coins === 50, `${S.coins}`);
  run(0.5);
  check('guide money not twice', S.coins === 50);
  check('collecting the cash moves the guide to the peeler pad (guide 2)', sim.guide.show.arrow === 'Pre_Factory_Debarker1_1_1', sim.guide.show.arrow);

  at(B(1001).pad.center);
  const tPad = runUntil(() => sim.active(1001));
  check('peeler 1001 bought for 30 in about 0.56 s', sim.active(1001) && S.coins === 20 && tPad < 0.8, `${S.coins} coins, ${tPad.toFixed(2)} s`);
  check('factory pad gives 5 exp', S.exp === 5, `${S.exp}`);
  const c1 = S.coins;
  check('task 1 "Unlock 1 Peeler" is done and pays 20 when claimed', sim.missions.done() && sim.missions.claim() && S.coins === c1 + 20 && sim.missions.current.Order === 2);
  S.coins -= 20;
  check('forest gate 10011 and squarer 2001 pads open after the peeler', sim.status(B(10011)) === 'locked' && sim.status(B(2001)) === 'locked');
  run(0.1);
  check('after the peeler, guide 3 points at the forest gate', sim.guide.show.arrow === 'Pre_AreaCtrl0', sim.guide.show.arrow);
  at(B(10011).pad.center); runUntil(() => sim.active(10011));
  run(0.1);
  check('inside the forest the guide marks a tree to chop', sim.guide.show.tree && sim.guide.show.word === 'guide_word_3002');
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
  check('with logs on the back the guide points at the peeler input', sim.guide.show.arrow === 'Pre_ProgressingFrame1_1_1', sim.guide.show.arrow);
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

  // Map buildings around the line (D:\lumber-ref\rules\map1-extra.md).
  const X = sim.extras;
  const { GAS } = await import(url('js/sim/extras.js'));
  sim.pack.items.length = 0; sim.pack.add(10); sim.pack.add(101); sim.pack.add(102);
  at(B(10005).funcBox.middle);
  const tBin = runUntil(() => sim.pack.count === 0, 5);
  check('the trash bin eats one carried log per 0.15 s and pays nothing', sim.pack.count === 0 && tBin > 0.3 && tBin < 0.5, `${tBin.toFixed(2)} s`);
  S.bought[10102] = true; S.level = 4; sim.recheck();
  check('the gas station opens at level 4 after the porter hut', sim.active(10006), sim.status(B(10006)));
  const g0 = X.gasStock();
  S.level = 4; S.exp = 0; sim.addExp(sim.needExp());
  check('a level-up puts LevelUpRewardGas into the gas station', X.gasStock() === g0 + 2, `${g0} -> ${X.gasStock()}`);
  at(B(10006).outBox.middle); run(1.2);
  check('gas is taken from the station one per 0.5 s', sim.pack.countOf(GAS) === 2, `${sim.pack.countOf(GAS)}`);
  const d0 = sim.duration(1001);
  at(B(1001).gasBox.middle); run(4.1);
  check('two gases on a machine stack 2 x 150 s of 1.8x speed (2 s apart)', Math.abs(X.boostLeft(1001) - 297.9) < 0.1 && Math.abs(sim.duration(1001) - d0 / 1.8) < 1e-9,
    `${X.boostLeft(1001).toFixed(1)} s, ${d0} -> ${sim.duration(1001).toFixed(2)}`);
  const v = sim.speed;
  at(B(10002).funcBox.middle); run(0.1);
  check('the bike station opens its panel', sim.zoneAt(S.player)?.kind === 'bike');
  X.rent('bike');
  check('a rented bike adds 5.5 to the speed for 180 s', sim.speed === v + 5.5 && Math.abs(X.rentLeft('bike') - 180) < 1e-6);
  at({ x: 60, z: 60 }); run(181);
  check('the bike goes back after 180 s', sim.speed === v);
  check('an order appears after the 150 s cooldown at level 2+', X.orderOpen() && [10, 20].includes(S.order.need), `${S.order.need}`);
  sim.pack.max = 40;
  for (let i = 0; i < 20; i++) sim.pack.add(101);
  at(B(-2).manBox.middle); run(0.5);
  check('the order man takes logs of any kind until the order is full', X.orderDone(), `${S.order.cur}/${S.order.need}`);
  const c2 = S.coins, want = 60 * X.valuable();
  check('an order pays 60 x the 5 s output of all machines, the ad doubles it', X.claimOrder(2) && S.coins === c2 + 2 * want, `${want}`);
  S.bought[10012] = true; sim.recheck();
  X.rent('uav');
  at({ x: 60, z: 60 });
  const u0 = S.piles[-10] || 0, standing = sim.forest.trees.filter(t => t.state === 0).length;
  run(40);
  check('the drone fells trees and drops their logs for 2 x the 5 s output each', (S.piles[-10] || 0) > u0 && (S.piles[-10] - u0) % (2 * X.valuable()) === 0
    && sim.forest.trees.filter(t => t.state === 0).length < standing, `pile ${S.piles[-10]}`);

  // Super lumberjack spot 100001 (after the cabin and the lumberjack hut): 10 gems, 3.4 speed, 12 logs, 100 damage, 180 s.
  S.gems = 10;
  at(B(100001).manBox.middle); run(0.1);
  check('the super worker spot opens its panel', sim.zoneAt(S.player)?.kind === 'special');
  const sw = sim.crew.hireSpecial(B(100001), true) && sim.crew.special(100001);
  check('a super lumberjack costs 10 gems and has the fixed stats', sw && S.gems === 0 && sw.speed === 3.4 && sw.pack.max === 12 && sw.dmg === 100);
  check('only one super worker per spot', !sim.crew.hireSpecial(B(100001), false));
  at({ x: 60, z: 60 }); run(181);
  check('the super worker leaves after 180 s', !sim.crew.special(100001));

  // Town (D:\lumber-ref\rules\hometown.md): pad 10013 opens the build store, the site and lot 88000.
  const T = sim.town;
  S.level = 6; S.bought[10013] = true; sim.recheck();
  check('area 10013 opens build store 30, the build truck house and the site', sim.active(30) && sim.active(5030) && sim.active(88100));
  check('the first lot to build is 88000 (book 0)', T.next() && T.next().id === 88000);
  const e0 = S.exp;
  check('a normal build gives 3 exp and puts 5 squares in the store (guide 200)', T.startBuild(88000, false) && S.exp === e0 + 3 && sim.stock('30:in') === 5,
    `exp +${S.exp - e0}, store ${sim.stock('30:in')}`);
  T.truckSold(9); run(6);
  check('a sold truck load that fits also goes to the build store, one square per 0.1 s', sim.stock('30:in') === 14, `${sim.stock('30:in')}`);
  sim.pack.items.length = 0; sim.pack.max = 40;
  at(B(30).outBox.middle); run(0.5);
  check('squares come out of the build store into the pack', sim.pack.countOf(102) === 14 && sim.stock('30:in') === 0);
  at(B(88100).buildBox.middle); run(1);
  check('the site takes 10 squares a second from the pack', T.lot(88000).cur === 10, `${T.lot(88000).cur}`);
  run(1);
  T.lot(88000).cur = 100;
  const c3 = S.coins, want3 = 50 * X.valuable();
  const spin0 = sim.meta.M.spin;
  check('the full site pays RewardCoinRatio x the 5 s output and 2 spin coins, x2 with the ad', T.claim(2) && S.coins === c3 + 2 * want3 && sim.meta.M.spin - spin0 === 4,
    `${want3}`);
  check('the next lot is 88001 (book 1)', T.next() && T.next().id === 88001);
  const inc = sim.income(1001);
  check('a resident of house 0 (Pre_President01, MachineRevenue) adds 1.5 % to machine income', T.setResident(0, 1, false) && Math.abs(sim.income(1001) - inc * 1.015) < 1e-9, `${inc} -> ${sim.income(1001)}`);
  check('the advanced resident gives 3 % instead', T.setResident(0, 1, true) && Math.abs(T.ratio.income - 1.03) < 1e-9);
  check('house level 2 opens a second resident slot', !T.setResident(0, 2, false) && T.upgradeHouse(0) && T.setResident(0, 2, false) && Math.abs(T.ratio.income - 1.045) < 1e-9);

  // Builder hut 10103 (WG 22): builders carry squares from store 30 to the site, one per 1.5 s.
  check('lot 88001 starts as the next build', T.startBuild(88001, false));
  S.coins += 100000; S.stock['30:in'] = 40;
  at(B(10103).pad ? B(10103).pad.center : B(10103).pos); runUntil(() => sim.active(10103), 10);
  check('the builder hut is open', sim.active(10103), sim.status(B(10103)));
  check('a builder can be hired', sim.crew.hire(10103) || sim.crew.hired(10103) > 0);
  at({ x: 60, z: 60 });
  const w0 = T.lot(88001).cur;
  run(90);
  check('the builder brings squares from the build store to the site', T.lot(88001).cur > w0, `${w0} -> ${T.lot(88001).cur}`);

  // Meta (rules/meta.md D-I): a fresh sim on a fake clock.
  {
    let now = new Date(2026, 9, 1, 10).getTime();
    const m0 = new Sim(world, config, null, 0, null);
    const M = m0.meta;
    M.now = () => now;
    const MS = m0.state;
    const day = () => { now += 86400e3; M.rollDay(); };
    check('sign-in: day 0 is open on the first login, day 1 is not yet', M.canSign(0) && !M.canSign(1));
    check('sign-in day 0 gives 2 spin coins', M.sign(0) && M.M.spin === 2, `${M.M.spin}`);
    check('sign-in: one day per login day', !M.sign(1));
    day();
    const g0 = MS.gems;
    check('sign-in day 1 gives 15 gems the next day', M.sign(1) && MS.gems === g0 + 15);
    for (let i = 2; i < 8; i++) { day(); M.sign(i); }
    check('sign-in day 7 makes Cowboy (13) unlockable', M.canUnlock(13) && M.unlock(13) && M.wear(13) && M.M.skin === 13);

    // Gacha: Mohawk's piece (weight 99,999,999) comes first; one piece unlocks it.
    M.M.spin = 3;
    const pr = M.draw(false, () => 0.5);
    check('a spin coin draw costs 1 coin and gives the Mohawk piece first', pr && pr.id === 1 && !pr.bike && M.M.spin === 2);
    check('the x3 claim adds 3 pieces and Mohawk becomes unlockable', M.claimDraw(pr, true) && M.skin(1).pieces === 3 && M.canUnlock(1));
    const sp0 = m0.speed;
    M.unlock(1);
    check('an unlocked skin adds its buff to the player (Mohawk Spd +0.2)', Math.abs(m0.speed - sp0 - 0.2) < 1e-9, `${sp0} -> ${m0.speed}`);
    const pr2 = M.draw(false, () => 0);
    check('Mohawk leaves the pool once unlocked', pr2 && pr2.id !== 1, pr2 && `${pr2.id}`);
    let ads = 0;
    while (M.draw(true)) ads++;
    check('5 free (ad) draws a day', ads === 5);
    day();
    check('the free draws come back the next day', M.spinAdLeft() === 5);

    // Daily tasks: ads count, claims pay gems or N x the 5 s output, x ratio for the ad.
    const t201 = config.DailyTaskConf.find(r => r.Id === 201);
    for (let i = 0; i < 3; i++) m0.emit({ type: 'ad' });
    m0.tick(1 / 30, false);
    check('3 ads finish task 201', M.taskDone(t201));
    const c0 = MS.coins, want = 25 * m0.extras.valuable() * 3;
    check('task 201 pays 25 x the 5 s output, x3 with the ad', M.claimTask(201, true) && MS.coins === c0 + want && !M.claimTask(201, false), `${MS.coins - c0} vs ${want}`);
    check('a claimed task counts toward task 208', (M.M.today.count.CompleteDailyTask || 0) === 1);
    const before = M.taskProgress(t201);
    day();
    check('daily tasks reset on a new day', M.taskProgress(t201) === 0 && !M.taskClaimed(t201) && before === 3);

    // Achievements: gems spent and gained count; stages step through.
    const a108 = config.AchievementConf.find(r => r.Id === 108);
    MS.gems += 60; m0.tick(1 / 30, false);
    const g1 = MS.gems;
    check('achievement 108 (gems gained) claims its first stage for 2 gems', M.achieveReady(a108) && M.claimAchieve(108) && MS.gems === g1 + 2 && M.stage(a108).i === 1);
    const a109 = config.AchievementConf.find(r => r.Id === 109);
    check('achievement 109 counts login days', M.stateCount('LoginDay') === M.M.loginDay && M.M.loginDay >= 9, `${M.M.loginDay}`);

    // Offline reward: under 5 min nothing; else min(minutes, 180) x per-minute income, x2 for the ad.
    check('offline: under 300 s gives nothing', M.offline(now - 200e3) === null);
    const off = M.offline(now - 5 * 3600e3);
    check('offline: capped at 180 minutes', off && off.min === 180 && off.coins === Math.round(180 * M.perMinute()));
    const c1 = MS.coins;
    check('offline x2 pays twice once', M.claimOffline(off, true) && MS.coins === c1 + 2 * off.coins && !M.claimOffline(off, false));

    // Ad boxes start after guide 7, spawn after the group cooldown, and buff for 180 s.
    m0.guide.done.add(7);
    for (let i = 0; i < 31 * 30; i++) m0.tick(1 / 30, false);
    const live = M.liveBoxes();
    check('ad boxes of groups 1, 2 and 3 appear after 30-45 s (gas box needs level 4)', live.length >= 2 && live.every(b => b.row.id !== 6), live.map(b => b.row.id).join(','));
    const g2 = M.boxes[2].box;
    if (g2) {
      const kind = g2.row.kind;
      const sp = m0.speed, dm = m0.damage, pm = m0.pack.max;
      check('a group 2 box claims for 20 gems', M.claimBox(2, true));
      m0.tick(1 / 30, false);
      const ok = kind === 'speed' ? Math.abs(m0.speed / sp - 1.5) < 1e-6 : kind === 'damage' ? m0.damage === dm * 2 : m0.pack.max === pm + 5;
      check(`the ${kind} buff applies`, ok, `${sp}->${m0.speed} ${dm}->${m0.damage} ${pm}->${m0.pack.max}`);
      for (let i = 0; i < 181 * 30; i++) m0.tick(1 / 30, false);
      check(`the ${kind} buff ends after 180 s`, !(M.buffs[kind] > 0));
    }
    const box1 = M.boxes[1].box || (() => { for (let i = 0; i < 61 * 30 && !M.boxes[1].box; i++) m0.tick(1 / 30, false); return M.boxes[1].box; })();
    if (box1) {
      Object.assign(MS.player, box1.row.pos);
      m0.events.length = 0;
      m0.tick(1 / 30, false);
      check('walking into a box raises boxTouch', m0.events.some(e => e.type === 'boxTouch' && e.group === 1));
      const c2 = MS.coins;
      check('the coin box pays 80 x the 5 s output', M.claimBox(1, false) && MS.coins === c2 + 80 * m0.extras.valuable());
    }
    const saved = JSON.parse(JSON.stringify(M.save()));
    const m1 = new Sim(world, config, null, 0, saved);
    check('meta state survives a save and reload', m1.meta.M.skin === 13 && m1.meta.skin(1).unlock && m1.meta.M.sign.length === 8);
  }

  // Phone chat (rules/chat.md): resident 101 of book 0, worked example K.
  {
    const c0 = new Sim(world, config, null, 0, null);
    const Ch = c0.chat, T0 = c0.town;
    T0.T.books.push(0); T0.T.houseLv[0] = 1;
    c0.emit({ type: 'houseDone', id: 88000, book: 0 });
    check('a built house sends its resident\'s friend request', Ch.requests().join() === '0' && Ch.hasRequest());
    check('accepting queues story 1 (20001) as unread', Ch.accept(0) && Ch.topUnread() === 20001 && Ch.hasUnread());
    const tick = sec => { for (let t = 0; t < sec; t += 1) c0.tick(1, false); };
    tick(400);
    check('no daily arrives while a chat is waiting', Ch.C.queue.length === 1);
    Ch.enter(20001);
    check('option B of a story starts locked', !Ch.select(20001, 2000102) && Ch.select(20001, 2000101));
    check('option A (bad ending) has no reward', !Ch.reward(20001, 2000101));
    T0.houseLv(0); T0.T.houseLv[0] = 2; c0.emit({ type: 'houseUp', book: 0 });
    check('story 2 waits while story 1 has no good ending', !Ch.queued(20002) && (Ch.C.pending[0] || []).includes(2));
    check('the good ending unlocks for an ad and gives photo 301', Ch.playOther(20001) && Ch.album(101).photos.join() === '301');
    const cc = c0.state.coins, want = 50 * c0.extras.valuable() * 2;
    check('its reward 501 pays 50 x the 5 s output, x2 doubled', Ch.claim(20001, 2000102, true) && c0.state.coins === cc + want && !Ch.claim(20001, 2000102, false),
      `${c0.state.coins - cc} vs ${want}`);
    check('completing story 1 with its good ending queues story 2 (house already level 2)', Ch.complete(20001) && !!Ch.queued(20002));
    Ch.enter(20002); Ch.select(20002, Ch.opts(20002)[0].Id); Ch.playOther(20002); Ch.complete(20002);
    tick(299);
    check('no daily before 300 s after the last chat', Ch.C.queue.length === 2);
    tick(2);
    const d = Ch.C.queue[2] && Ch.conf(Ch.C.queue[2].conv);
    check('a daily of resident 101 arrives 300 s after the last completed chat', d && d.ConversationType === 0 && d.BookId === 0);
    const [oa, ob] = Ch.opts(d.Id);
    Ch.enter(d.Id);
    check('a daily: the first pick is free, the other answer costs an ad', Ch.select(d.Id, oa.Id) && Ch.other(d.Id).Id === ob.Id && Ch.playOther(d.Id));
    const sp = c0.meta.buffs.speed || 0;
    const rb = [oa, ob].find(o => Ch.reward(d.Id, o.Id).RewardType === 4);
    check('a buff reward adds 300 s of speed x1.5', Ch.claim(d.Id, rb.Id, false) && c0.meta.buffs.speed === sp + 300);
    T0.T.houseLv[0] = 3; c0.emit({ type: 'houseUp', book: 0 });
    Ch.enter(20003); Ch.select(20003, Ch.opts(20003)[0].Id); Ch.playOther(20003);
    const r0 = T0.ratio.income;
    check('three photos complete the album: income ratio +0.02', Ch.album(101).bonus && Math.abs(Ch.albumBonus() - 0.02) < 1e-9, `${r0}`);
    const re = new Sim(world, config, JSON.parse(JSON.stringify(c0.save())), 0, null);
    check('chat state survives a reload and the album bonus is kept', re.chat.album(101).bonus && Math.abs(re.town.ratio.income - T0.ratio.income) < 1e-9);
    const m2 = new Sim(world, config, null, 1, null);
    check('chat is off on map 2', !m2.chat.on);
  }

  // Maps 2 and 3 (rules/meta.md A): the same rules on their own data, map coin and level table; no tutorial or task bar.
  for (const [m, first, truck] of [[1, 21001, 25001], [2, 31001, 35001]]) {
    const w2 = describeWorld(JSON.parse(fs.readFileSync(path.join(G, `art/world${m + 1}/scene.json`), 'utf8')));
    const s2 = new Sim(w2, config, null, m);
    const B2 = id => w2.buildings.get(id);
    check(`map ${m + 1}: 29 player levels, no tutorial, no task bar`, s2.levels.length === 29 && !s2.guide.guides.length && !s2.missions.current);
    check(`map ${m + 1}: the first peeler opens free or on its pad`, s2.active(first) || s2.status(B2(first)) === 'locked', s2.status(B2(first)));
    s2.state.coins = 1e6; s2.state.level = 10;
    for (let k = 0; k < 8; k++) { for (const b of w2.buildings.values()) if (s2.status(b) === 'locked' && b.cost < 1e5) s2.state.bought[b.id] = true; s2.recheck(); }
    check(`map ${m + 1}: line 1 and its truck station open`, s2.active(first) && s2.active(truck) && s2.active(first + 1000));
    const P2 = s2.state.player;
    const t2 = s2.forest.trees.find(t => t.forest === 1 && t.state === 0);
    Object.assign(P2, { x: t2.pos.x + 0.8, z: t2.pos.z });
    let n = 0;
    while (!s2.pack.count && n++ < 600) s2.tick(1 / 30, false);
    Object.assign(P2, B2(first).inBox.middle);
    for (let i = 0; i < 30; i++) s2.tick(1 / 30, false);
    check(`map ${m + 1}: chopped logs go into the peeler for its income`, (s2.state.piles[first] || 0) > 0, `pile ${s2.state.piles[first]}`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
