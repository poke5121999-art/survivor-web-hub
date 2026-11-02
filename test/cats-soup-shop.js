#!/usr/bin/env node
/* Mèo & Súp shop feature (games/cats-soup/js/sim/features/shop.js) in node, seeded: the tables of data/shop.json, buying with
 * gems / tickets, the daily free gems, real-money goods refused, the stamp rally (cap, equipment reward), the offline ad x2,
 * the double-speed ad and save/load.   node test/cats-soup-shop.js
 * Expected numbers come from D:/catsoup-ref/flat (Shop, ShopAds, Init) and rules/shop.md, not from running the code. */
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
  const SH = await imp('js/sim/features/shop.js');
  let seed = 11;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const json = async p => JSON.parse(fs.readFileSync(path.join(G, p), 'utf8'));
  const mk = async () => { const g = await makeGame(json, rng); g.fresh(); return g; };
  const num = b => b.f * 10 ** b.e;
  let g = await mk();
  const s = g.feat.shop;
  const realNow = Date.now;

  // ---- tables ----
  eq('real-money specials (shopType 0) listed: 14', s.listed(g, 0).length, 14);
  eq('real-money subscriptions / packages (shopType 1): 8', s.listed(g, 1).length, 8);
  eq('goods tab (shopType 2): 25 rows', s.listed(g, 2).length, 25);
  eq('Init: offline ad factor 2, double speed 0.5, 10 stamps a view, 1000 a day',
    [g.data.shop.init.offlineAdsFactor, g.data.shop.init.doubleSpeedFactor, g.data.shop.init.perViewStamp, g.data.shop.init.maxStampPerDay], [2, 0.5, 10, 1000]);
  eq('every real-money row refuses with iap', [...s.listed(g, 0), ...s.listed(g, 1), s.itemRow(g, 10), s.itemRow(g, 14)].map(r => s.blocked(g, r)).filter(x => x !== 'iap'), []);
  eq('gem pack 3 (index 11): 5500 won, 525 gems (+525 bonus)', ((r) => [r.cost, r.rewardValue, r.bonus, r.iap])(s.itemRow(g, 11)), [5500, 525, 525, true]);
  eq('fresh start: 200 gems 2000 coins', [g.state.gem, g.state.coin], [200, 2000]);

  // ---- buying with gems: gold = 3600 s of average income ----
  eq('fresh average income is 29 gold a second', num(g.averageIncome()), 29);
  const gold0 = num(g.state.gold);
  let r = s.buy(g, 15);
  eq('item 15 (gold 1 h, 100 gems): gems 200 -> 100', g.state.gem, 100);
  eq('...pays 3600 s x 29 = 104400 gold', Math.round(num(g.state.gold) - gold0), 104400);
  eq('...result type 101, value 3600', [r.given.type, r.given.value], [101, 3600]);
  r = s.buy(g, 15);
  eq('a consumable (duration 0) can be bought again: gems 0', g.state.gem, 0);
  r = s.buy(g, 21);
  eq('no gems left: item 21 refused with "gem", nothing changes', [r.why, g.state.coin, g.state.gem], ['gem', 2000, 0]);
  g.state.gem = 500;
  r = s.buy(g, 21);
  eq('item 21 (100 coins for 100 gems): coins 2000 -> 2100, gems 400', [g.state.coin, g.state.gem], [2100, 400]);
  r = s.buy(g, 22);
  eq('item 22 (300 coins for 300 gems)', [g.state.coin, g.state.gem], [2400, 100]);
  r = s.buy(g, 10);
  eq('item 10 is a real-money gem pack: refused, gems unchanged', [r.why, g.state.gem], ['iap', 100]);
  r = s.buy(g, 7);
  eq('item 7 (monthly package, 5500 won): refused', r.why, 'iap');
  r = s.buy(g, 24);
  eq('item 24 (furniture, rewardValue -1) is left to the furniture feature', r.why, 'unsupported');
  r = s.buy(g, 147);
  eq('item 147 (cost type 1401, telescope tickets) is not in this port', r.why, 'unsupported');

  // ---- ticket exchange: 3 recipe tickets (1 h) -> 1 gold ticket (1 h) ----
  r = s.buy(g, 141);
  eq('item 141 without tickets: "ticket"', r.why, 'ticket');
  g.state.specials.tickets[1201] = 4;
  r = s.buy(g, 141);
  eq('item 141 costs 3 x 1201 and gives 1 x 1101', [g.state.specials.tickets[1201], g.state.specials.tickets[1101]], [1, 1]);
  g.state.specials.tickets[1101] = 3;
  r = s.buy(g, 144);
  eq('item 144 costs 3 x 1101 and gives 1 x 1201', [g.state.specials.tickets[1101], g.state.specials.tickets[1201]], [0, 2]);

  // ---- daily free gems: item 9 (ad, +30 gems), once a day ----
  g.state.gem = 0;
  r = s.buy(g, 9);
  eq('ad item 9 pays 30 gems at once', [g.state.gem, r.given.type, r.given.value], [30, 3, 30]);
  r = s.buy(g, 9);
  eq('second try the same day: "owned"', [r.why, g.state.gem], ['owned', 30]);
  Date.now = () => realNow() + 86400e3;
  g.feat.shop.rollover(g);
  r = s.buy(g, 9);
  eq('next calendar day it is available again: 60 gems', [r.why, g.state.gem], [undefined, 60]);
  Date.now = realNow;

  // ---- stamp rally ----
  g = await mk();
  const sh = g.feat.shop;
  eq('an ad view gives 10 stamps', [sh.watchStamp(g), g.state.shop.stamps], [10, 10]);
  for (let i = 0; i < 99; i++) sh.watchStamp(g);
  eq('100 views = 1000 stamps (the daily cap)', g.state.shop.stamps, 1000);
  eq('view 101 the same day pays nothing', [sh.watchStamp(g), g.state.shop.stamps], [0, 1000]);
  eq('53 equipment rows can be bought with stamps', sh.stampRows(g).length, 53);
  r = sh.buyStamp(g, 1);
  eq('ShopAds 1 costs 9500 stamps: 1000 is short', r.why, 'stamp');
  g.state.shop.stamps = 10000;
  r = sh.buyStamp(g, 1);
  eq('ShopAds 1 (9500 stamps) gives equipment 325: stamps 500, item owned', [g.state.shop.stamps, g.state.equip.items.some(i => i.i === 325)], [500, true]);
  eq('bought once only', sh.buyStamp(g, 1).why, 'owned');

  // ---- offline earnings, ad x2 ----
  g = await mk();
  const o = g.offline(10800);
  eq('3 h away: the core pays 158776 gold, no energy', [Math.round(num(o.gold)), num(o.energy)], [158776, 0]);
  eq('the shop keeps that result for the popup', [Math.round(num(g.feat.shop.away(g).gold)), g.feat.shop.away(g).seconds], [158776, 10800]);
  const before = num(g.state.gold);
  const c = g.feat.shop.claimOfflineAds(g);
  eq('the ad pays the same amount again at once (x2 in all)', Math.round(num(g.state.gold) - before), 158776);
  eq('...and only once', g.feat.shop.claimOfflineAds(g), null);
  g = await mk();
  eq('no offline time, no popup data', [g.offline(10), g.feat.shop.away(g)], [null, null]);

  // ---- double speed: cook time x 0.5 for 300 s ----
  const cooked = (gm, ticks) => { gm.events.length = 0; for (let i = 0; i < ticks; i++) gm.tick(0.5); return gm.events.filter(e => e.type === 'food').length; };
  g = await mk();
  eq('without the ad: 10 s of a 15 s soup pot = 0 dishes', cooked(g, 20), 0);
  g = await mk();
  check('the button is offered with a working pot and cat', g.feat.shop.doubleAvailable(g));
  g.feat.shop.startDouble(g);
  check('...and not while a boost runs', !g.feat.shop.doubleAvailable(g) && g.feat.shop.doubleActive(g));
  eq('with the ad: 10 s = 1 dish, 290 s left', [cooked(g, 20), Math.round(g.feat.shop.doubleLeft(g))], [1, 290]);
  g = await mk();
  g.feat.shop.startDouble(g);
  const n = cooked(g, 700);
  eq('350 s with the ad (300 s boosted): 43 dishes (650 s of cooking / 15 s)', n, 43);
  eq('...the boost ended: 0 s left, offered again', [g.feat.shop.doubleLeft(g), g.feat.shop.doubleAvailable(g)], [0, true]);
  g = await mk();
  eq('350 s without it: 23 dishes', cooked(g, 700), 23);

  // ---- save and load ----
  g = await mk();
  g.state.gem = 500;
  g.feat.shop.buy(g, 9);
  g.feat.shop.watchStamp(g);
  g.feat.shop.startDouble(g);
  const save = g.save();
  const g2 = await makeGame(json, rng);
  g2.load(JSON.parse(JSON.stringify(save)));
  eq('state survives a save: stamps, daily buy, boost', [g2.state.shop.stamps, g2.feat.shop.blocked(g2, g2.feat.shop.itemRow(g2, 9)), g2.state.shop.doubleSec], [10, 'owned', 300]);
  const old = JSON.parse(JSON.stringify(save));
  delete old.shop;
  const g3 = await makeGame(json, rng);
  g3.load(old);
  eq('an old save without the slice gets a fresh one', [g3.state.shop.stamps, g3.state.shop.doubleSec], [0, 0]);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
