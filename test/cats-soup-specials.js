#!/usr/bin/env node
/* Mèo & Súp "specials" rules (games/cats-soup/js/sim/features/specials.js) in node, literal values from the tables and
 * D:/catsoup-ref/rules/specials.md / specials-full.md: chest 5 opens a day 60 s apart, jar fairy 1/20 free, balloon 13 taps
 * 20 s of income, crane weights 100/100/90/78, basketball 10 points a goal and tiers 30/60/100, elephant windows 13:00 and
 * 19:00 for 3 h, special order 3..6 dishes for 1000 s of income.
 *   node test/cats-soup-specials.js */
'use strict';
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const G = path.join(__dirname, '..', 'games', 'cats-soup');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); ok ? pass++ : fail++; };
const eq = (name, a, b) => check(name, a === b, `${a} vs ${b}`);

(async () => {
  const { makeGame } = await import(pathToFileURL(path.join(G, 'js/sim/boot.js')).href);
  const B = await import(pathToFileURL(path.join(G, 'js/sim/big.js')).href);
  const S = await import(pathToFileURL(path.join(G, 'js/sim/features/specials.js')).href);
  let seed = 11;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const g = await makeGame(async p => JSON.parse(fs.readFileSync(path.join(G, p), 'utf8')), rng);
  g.fresh();
  g.state.mapSize = g.state.maxMapSize = 8;
  // Stand-ins in front of the features built in parallel: equip (type 5) and fishing (type 6002) only record what they were asked.
  const asked = { 5: [], 6002: [] };
  g.features.unshift({ id: "stub", rewards: {
    5: (_g, v, x) => { asked[5].push([v, x.equip]); return { type: 5, value: v }; },
    6002: (_g, v) => { asked[6002].push(v); return { type: 6002, value: v }; },
  } });
  const add = a => g.place(a, g.emptyCells()[0], 0);
  const tick = s => { for (let i = 0; i < s * 4; i++) g.tick(0.25); g.events.length = 0; };
  const sp = g.state.specials;

  // ---- data tables ----
  const D = g.data.specials;
  eq('chest gem price from Shop "gacha"', D.chestGem, 300);
  check('basketball tiers 30/60/100', JSON.stringify(D.basketball.map(t => [t.score, t.rewardType, t.rewardValue])) === '[[30,4,10],[60,3,5],[100,23,1]]');
  check('ball weights 100/100/90/78', JSON.stringify(D.balls.map(b => [b.index, b.weight, b.rewardType, b.rewardValue])) === '[[0,100,4,30],[1,100,101,800],[2,90,3,5],[9,78,6002,1]]');
  eq('Init 7/8/9/10/53', [7, 8, 9, 10, 53].map(i => g.t.Init[i].value).join(','), '13,3600,20,1000,3');

  // ---- treasure chest: 5 opens a day, 60 s apart; gems open without a daily open ----
  const chest = add(3);
  eq('chest starts with 5 opens (Work.maxValue = dailyCount = 5)', chest.v, 5);
  let r = S.openChest(g, chest, 'free');
  check('free open pays 1 card (Init 23)', r && JSON.stringify(asked[5][0]) === '[1,null]' && chest.v === 4, JSON.stringify(asked[5]));
  check('second open is on cooldown (60 s)', S.openChest(g, chest, 'free') === null && chest.v === 4);
  tick(30);
  check('still closed after 30 s', S.chestReady(g, chest) === false, S.chestWait(g));
  tick(31);
  check('open again after 61 s', S.openChest(g, chest, 'free') !== null && chest.v === 3);
  r = S.openChest(g, chest, 'gem');
  check('gems: 200 < 300 is short', r && r.short === 'gem' && g.state.gem === 200);
  g.state.gem = 1000;
  r = S.openChest(g, chest, 'gem');
  check('gems: 3 cards for 300 gems, no daily open spent', r && g.state.gem === 700 && asked[5][2][0] === 3 && chest.v === 3, `gem ${g.state.gem}`);
  for (let i = 0; i < 3; i++) { tick(61); S.openChest(g, chest, 'free'); }
  eq('5 free opens used up', chest.v, 0);
  tick(61);
  check('no open left today', S.openChest(g, chest, 'free') === null);
  sp.skewMs += 86400e3;
  tick(1.25);
  eq('next day refills the chest to 5', chest.v, 5);

  // ---- income based works: give the soup pot a price so avgGold > 0 ----
  const avg = g.averageIncome();
  check('average income is positive', B.toNumber(avg) > 0, B.format(avg));
  const jar = add(5);
  eq('jar starts full', jar.v, 1);
  const full = S.jarGold(g);
  check('jar gold = avgGold x 3600', Math.abs(B.toNumber(full) / (B.toNumber(avg) * 3600) - 1) < 1e-6);
  const g0 = g.state.gold;
  const free = S.claimJarFree(g, jar);
  check('free jar button pays 1/20', Math.abs(B.toNumber(free) / (B.toNumber(avg) * 180) - 1) < 1e-6 && jar.v === 0 && B.cmp(g.state.gold, g0) > 0);
  check('jar empty until 240 s pass', S.claimJarFree(g, jar) === null);
  tick(241);
  eq('jar recharges after 240 s', jar.v, 1);
  check('ad jar button (core claimJar) pays all', Math.abs(B.toNumber(g.claimJar(jar)) / B.toNumber(full) - 1) < 1e-6);

  // ---- search light / balloon ----
  const light = add(12);
  eq('light starts with 4 charges', light.v, 4);
  eq('balloon needs 13 taps', S.balloonTaps(g), 13);
  const b1 = S.popBalloon(g, light);
  check('balloon pays avgGold x 20 s', Math.abs(B.toNumber(b1) / (B.toNumber(avg) * 20) - 1) < 1e-6 && light.v === 3);
  for (let i = 0; i < 3; i++) S.popBalloon(g, light);
  check('5th balloon is empty', S.popBalloon(g, light) === null && light.v === 0);
  tick(181);
  eq('light +1 charge per 180 s', light.v, 1);

  // ---- capsule crane ----
  const crane = add(14);
  eq('crane starts with 5 plays', crane.v, 5);
  eq('machine holds 16 balls', S.craneBalls(g).length, 16);
  let counts = { coin: 0, gold: 0, gem: 0, bait: 0 };
  for (let i = 0; i < 250; i++) {
    sp.balls.length = 0;
    for (const idx of S.craneBalls(g)) counts[{ 4: 'coin', 101: 'gold', 3: 'gem', 6002: 'bait' }[D.balls.find(x => x.index === idx).rewardType]]++;
  }
  const share = k => counts[k] / 4000;
  check('ball draw shares 27.2/27.2/24.5/21.2 %', Math.abs(share('coin') - 100 / 368) < 0.03 && Math.abs(share('gold') - 100 / 368) < 0.03
    && Math.abs(share('gem') - 90 / 368) < 0.03 && Math.abs(share('bait') - 78 / 368) < 0.03, JSON.stringify(counts));
  const coin0 = g.state.coin, gem0 = g.state.gem;
  let plays = 0, last, coinBalls = 0;
  while ((last = S.playCrane(g, crane))) { plays++; if (last.ball.rewardType === 4) coinBalls++; }
  eq('coin balls paid 30 coins each', g.state.coin - coin0, 30 * coinBalls);
  eq('5 plays then empty', plays, 5);
  eq('machine refilled to 16', S.craneBalls(g).length, 16);
  tick(7201);
  eq('crane +1 play per 2 h', crane.v, 1);
  void gem0;

  // ---- basketball ----
  const basket = add(97);
  eq('basketball starts with 2 games', basket.v, 2);
  check('rules 3 s ready, 40 s play, 10 a goal', JSON.stringify([S.basketRules(g).ready, S.basketRules(g).time, S.basketRules(g).perGoal]) === '[3,40,10]');
  check('start spends a game', S.startBasket(g, basket) && basket.v === 1);
  const c1 = g.state.coin, e1 = g.state.gem;
  r = S.finishBasket(g, basket, 7);
  check('70 points pay 10 coins and 5 gems, no pudding', r.points === 70 && g.state.coin - c1 === 10 && g.state.gem - e1 === 5 && sp.pudding === 0, JSON.stringify([g.state.coin - c1, g.state.gem - e1, sp.pudding]));
  S.startBasket(g, basket);
  r = S.finishBasket(g, basket, 10);
  check('100 points add a pudding', r.points === 100 && sp.pudding === 1 && sp.basket.total === 170 && sp.basket.best === 100);
  check('no third game', S.startBasket(g, basket) === false);
  tick(28801);
  eq('basketball +1 game per 8 h', basket.v, 1);

  // ---- special order board ----
  const board = add(8);
  S.refreshOrder(g);
  const o = sp.order;
  check('order is one learned dish, 3..6 of it', o.food === 1 && o.need >= 3 && o.need <= 6, JSON.stringify(o));
  const item = { a: o.food, p: B.fromNumber(1) };
  for (let i = 0; i < o.need - 1; i++) g.sellItem({ ...item });
  check('not done one short', S.claimOrder(g, board) === null && o.have === o.need - 1);
  g.sellItem({ a: 99, p: B.fromNumber(1) });
  eq('other dishes do not count', o.have, o.need - 1);
  g.sellItem({ ...item });
  check('done after the last dish', S.orderDone(g));
  const gold = S.claimOrder(g, board);
  check('reward avgGold x 1000 s, new order', Math.abs(B.toNumber(gold) / (B.toNumber(avg) * 1000) - 1) < 1e-6 && sp.order.have === 0 && sp.order.need >= 3);

  // ---- elephant trader: windows 13:00-16:00 and 19:00-22:00 local ----
  const trader = add(87);
  check('trader is built', !!trader);
  const at = (h, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.getTime(); };
  check('12:59 closed, next 13:00', !S.traderWindow(g, at(12, 59)).open && S.traderWindow(g, at(12, 59)).next === at(13));
  check('13:00 open', S.traderWindow(g, at(13)).open);
  check('15:59 open, 1 min left', S.traderWindow(g, at(15, 59)).open && Math.round(S.traderWindow(g, at(15, 59)).left) === 60);
  check('16:00 closed', !S.traderWindow(g, at(16)).open);
  check('19:00-21:59 open, 22:00 closed', S.traderWindow(g, at(19)).open && S.traderWindow(g, at(21, 59)).open && !S.traderWindow(g, at(22)).open);
  sp.skewMs = at(13, 30) - Date.now();
  const stock = S.traderStock(g);
  eq('9 slots', stock.length, 9);
  check('slot 0-1 equip 500+ gems, slots 6-7 tickets, slot 8 pudding', stock[0].type === 5 && stock[0].costType === 3 && stock[0].cost >= 500
    && [1101, 1102, 1103, 1201, 1202, 1203].includes(stock[6].type) && stock[8].type === 23 && stock[8].cost === 200, JSON.stringify([stock[0], stock[6], stock[8]]));
  check('slots 2-5 (furniture, item) are empty: no feature pays them', stock.slice(2, 6).every(x => x === null));
  const t6 = stock[6];
  g.state.gem = 10;
  check('short of gems', S.buyTrader(g, 6).short === 'gem' && !t6.bought);
  g.state.gem = 1000;
  r = S.buyTrader(g, 6);
  check('ticket bought: price paid, ticket stored', r.given && t6.bought && g.state.gem === 1000 - t6.cost && sp.tickets[t6.type] === 1, `gem ${g.state.gem}`);
  check('slot cannot be bought twice', S.buyTrader(g, 6) === null);
  S.useTicket(g, 1101);                // spends any 1101 the trader stock happened to sell
  sp.tickets[1101] = 1;
  const gold0 = g.state.gold;
  const used = S.useTicket(g, 1101);
  check('gold ticket 1h pays avgGold x 3600', used && Math.abs(B.toNumber(B.sub(g.state.gold, gold0)) / (B.toNumber(avg) * 3600) - 1) < 1e-6 && sp.tickets[1101] === 0);
  sp.skewMs = at(19, 5) - Date.now();
  check('dinner window draws new stock', S.traderStock(g) !== stock && sp.trader.win.endsWith('#1'));

  // ---- music ----
  eq('free tracks owned at start', sp.bgmOwned.join(','), '1,2');
  g.state.coin = 100;
  check('track 3 costs 400 coins', S.buyBgm(g, 3).short === 'coin');
  g.state.coin = 1000;
  check('buy then select', S.buyBgm(g, 3).index === 3 && g.state.coin === 600 && S.selectBgm(g, 3) && sp.bgm === 3);
  check('cannot select an unowned track', S.selectBgm(g, 4) === false);

  // ---- save round trip ----
  const copy = g.save();
  const g2 = await makeGame(async p => JSON.parse(fs.readFileSync(path.join(G, p), 'utf8')), rng);
  g2.load(JSON.parse(JSON.stringify(copy)));
  check('state survives save/load', g2.state.specials.bgm === 3 && g2.state.specials.basket.total === 170 && g2.state.specials.trader.win === sp.trader.win);

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
