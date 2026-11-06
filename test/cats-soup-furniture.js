#!/usr/bin/env node
/* Mèo & Súp "furniture" rules (games/cats-soup/js/sim/features/furniture.js) in node, literal values from Furniture.json / Work.json /
 * Shop.json and D:/catsoup-ref/rules/furniture.md: 1704 rows (131 floors, 135 walls, 62 carpets, 276 + 460 + 630 + 10 pieces),
 * daily goods x0.9 / x5, catalog price = cost, three goods a day, restock 30 gems or 3 ads, 51 pieces per room, reward type 6.
 *   node test/cats-soup-furniture.js */
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
  const FU = await import(pathToFileURL(path.join(G, 'js/sim/features/furniture.js')).href);
  let seed = 11;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const mk = async () => {
    const g = await makeGame(async p => JSON.parse(fs.readFileSync(path.join(G, p), 'utf8')), rng);
    g.fresh();
    return g;
  };
  const g = await mk();
  const F = g.feat.furniture;
  const S = () => g.state.furniture;
  const cat = g.state.cats[0].id;

  // ---- tables ----
  const T = g.t.Furniture;
  const byType = {}, byEvent = {};
  for (const r of T) { byType[r.type] = (byType[r.type] || 0) + 1; byEvent[r.eventType] = (byEvent[r.eventType] || 0) + 1; }
  eq('Furniture.json has 1704 rows', T.length, 1704);
  eq('types 1..7 = 131/135/62/276/460/630/10', [1, 2, 3, 4, 5, 6, 7].map(t => byType[t]).join('/'), '131/135/62/276/460/630/10');
  eq('eventType -1 / 0 / 2 / 3 = 11 / 225 / 1427 / 41', [-1, 0, 2, 3].map(t => byEvent[t]).join('/'), '11/225/1427/41');
  eq('index 505 is chair11, type 5, cost 150', `${F.row(g, 505).resName}/${F.row(g, 505).type}/${F.row(g, 505).cost}`, 'chair11/5/150');
  eq('Work 111 is the furniture shop: needWork 14, dailyCount 3', `${g.work.get(111).needWork}/${g.work.get(111).dailyCount}`, '14/3');
  eq('start furniture coins = 2000', g.state.coin, 2000);
  eq('Init 43/44/45 = 0.9 / 0.9 / 5 (daily cost rates)', [43, 44, 45].map(i => g.t.Init[i].value).join('/'), '0.9/0.9/5');
  eq('restock costs 30 gems (Shop.json row 38: cost 30, costType 3)', FU.RESTOCK_GEMS, 30);
  const chair = T.find(r => r.eventType === 0 && r.cost === 150);       // a normal 150 piece (index 505 chair11 is an event piece)

  // ---- price rule ----
  const ev = T.find(r => r.eventType === 2 && r.cost === 180);
  eq('daily cost of a 200 piece (normal) = 180', FU.dailyCost(g, F.row(g, 2), false), 180);
  eq('daily cost of a 150 normal piece = 135', FU.dailyCost(g, chair, false), 135);
  eq('chair11 (505, eventType 2, cost 150) not owned = 750 (x5)', FU.dailyCost(g, F.row(g, 505), false), 750);
  eq('daily cost of a 120 piece = 108', FU.dailyCost(g, T.find(r => r.eventType === 0 && r.cost === 120), false), 108);
  eq('event piece of 180 not owned = 900 (x5)', FU.dailyCost(g, ev, false), 900);
  eq('event piece of 180 owned = 162 (x0.9)', FU.dailyCost(g, ev, true), 162);

  // ---- daily goods ----
  eq('a fresh game has 3 goods', S().goods.length, 3);
  check('goods are distinct, normal pieces (eventType 0)', new Set(S().goods).size === 3 && S().goods.every(i => F.row(g, i).eventType === 0), S().goods.join(','));
  eq('normal pool = 225 pieces, limited pool empty before anything is owned', `${F.pools(g).normal.length}/${F.pools(g).limited.length}`, '225/0');
  eq('ads left today = 3', S().ads, 3);
  const k0 = 0, i0 = S().goods[0], p0 = F.slot(g, k0).price;
  const before = g.state.coin;
  const r1 = F.buyDaily(g, k0);
  check('buy slot 0: ok, coins down by the price, stock +1', r1.ok && g.state.coin === before - p0 && F.count(g, i0) === 1, `${before} -> ${g.state.coin}, price ${p0}`);
  eq('the slot is marked sold (negative)', S().goods[0], -i0);
  eq('buying it again fails with "sold"', F.buyDaily(g, k0).why, 'sold');
  g.state.coin = 10;
  eq('not enough coins fails with "coin"', F.buyDaily(g, 1).why, 'coin');
  g.state.coin = 2000;

  // restock: 30 gems or ad x3
  const gem0 = g.state.gem;
  check('restock by gems takes 30 gems and refills 3 goods', F.restock(g, 'gem').ok && g.state.gem === gem0 - 30 && S().goods.every(i => i > 0) && S().goods.length === 3, `gem ${gem0} -> ${g.state.gem}`);
  check('three ad restocks work, the fourth does not', [1, 2, 3].every(() => F.restock(g, 'ads').ok) && !F.restock(g, 'ads').ok && S().ads === 0);
  g.state.gem = 5;
  eq('restock without gems fails with "gem"', F.restock(g, 'gem').why, 'gem');
  S().goods[0] = -S().goods[0];
  check('a new day (ensureDaily with another date) restocks and refills the ads', F.ensureDaily(g, '2099-01-01') && S().ads === 3 && S().goods.every(i => i > 0), S().day);
  eq('the same day does nothing', F.ensureDaily(g, '2099-01-01'), false);

  // ---- catalog ----
  const tabCounts = [0, 1, 2, 3, 4].map(t => F.catalog(g, t, false).length);
  eq('catalog tabs (eventType 0): floors 17, walls 18, carpets+furniture 60, wall pieces 39, small 91', tabCounts.join('/'), '17/18/60/39/91');
  const allCounts = [0, 1, 2, 3, 4].map(t => F.catalog(g, t, true).length);
  eq('catalog with the "not for sale" toggle: 129/133/518/274/639', allCounts.join('/'), '129/133/518/274/639');
  g.state.coin = 2000;
  const c1 = F.buyCatalog(g, 2);
  check('catalog buy of floor1 (index 2, cost 200): coins 2000 -> 1800, stock 1', c1.ok && g.state.coin === 1800 && F.count(g, 2) === 1);
  eq('an event piece is not for sale', F.buyCatalog(g, ev.index).why, 'notForSale');
  eq('floor0 (cost 0, eventType -1) is not for sale', F.buyCatalog(g, 0).why, 'notForSale');
  g.state.coin = 1;
  eq('catalog buy without coins fails', F.buyCatalog(g, chair.index).why, 'coin');
  eq('chair11 (event piece) is not for sale in the catalog either', F.buyCatalog(g, 505).why, 'notForSale');

  // ---- reward type 6 ----
  g.state.coin = 2000;
  const ev0 = g.events.length;
  const out = g.reward(6, 505);
  check('reward type 6 adds the piece and reports it', out && out.type === 6 && out.value === 505 && F.count(g, 505) === 1, JSON.stringify(out));
  check('reward emits furnitureAdd and reward', g.events.slice(ev0).some(e => e.type === 'furnitureAdd' && e.index === 505) && g.events.slice(ev0).some(e => e.type === 'reward'));
  check('reward with extra.count = 3 adds three', g.reward(6, 505, { count: 3 }) && F.count(g, 505) === 4);

  // ---- room ----
  eq('a new room has the default floor 0 and wall 1', `${F.room(g, cat).floor}/${F.room(g, cat).wall}`, '0/1');
  const fl = F.place(g, cat, 2, 0, 0);
  check('floor1 goes on the floor, leaving stock', fl.ok && F.room(g, cat).floor === 2 && F.count(g, 2) === 0);
  F.add(g, 3, 1);
  const fl2 = F.place(g, cat, 3);
  check('a second floor replaces it and the old one returns to stock', fl2.ok && F.room(g, cat).floor === 3 && F.count(g, 2) === 1);
  check('placed pieces count as owned (Have_FurnitureCheck)', F.owns(g, 3) && F.count(g, 3) === 0);
  const back = F.place(g, cat, 0);
  check('the room\'s own floor 0 needs no stock and returns the custom floor', back.ok && F.room(g, cat).floor === 0 && F.count(g, 3) === 1);
  eq('a piece not in stock cannot be placed', F.place(g, cat, 900, 0, 0).why, 'none');

  const carpet = T.find(r => r.type === 3), wallhang = T.find(r => r.type === 4);
  F.add(g, carpet.index, 1); F.add(g, wallhang.index, 1); F.add(g, chair.index, 1);
  const pc = F.place(g, cat, carpet.index, 5, -9);
  const pw = F.place(g, cat, wallhang.index, -5, 9);
  const pf = F.place(g, cat, chair.index, 0.1, 9);
  eq('carpet clamps to x 0.35, y -0.38', `${pc.item.x}/${pc.item.y}`, '0.35/-0.38');
  eq('wall piece clamps to x -0.35, y 0.4', `${pw.item.x}/${pw.item.y}`, '-0.35/0.4');
  eq('floor piece keeps x 0.1 and clamps y to 0.4', `${pf.item.x}/${pf.item.y}`, '0.1/0.4');
  check('moveItem re-clamps (chair y -3 -> -0.5)', F.moveItem(g, cat, pf.item.n, 0, -3) && pf.item.y === -0.5);
  check('flip toggles dir', F.flipItem(g, cat, pf.item.n) && pf.item.dir === 1 && F.flipItem(g, cat, pf.item.n) && pf.item.dir === 0);
  const room2 = F.room(g, g.state.cats[1] ? g.state.cats[1].id : cat);
  check('take back returns the piece to stock', F.takeBack(g, cat, pf.item.n) && F.count(g, chair.index) >= 1 && room2 !== undefined);
  F.add(g, chair.index, 60);
  let placed = F.room(g, cat).items.length;
  while (F.place(g, cat, chair.index, 0, 0).ok) placed++;
  eq('a room refuses the 52nd piece (msg_limintFurniture when size > 50)', F.room(g, cat).items.length, 51);
  eq('the refusal reason is "full"', F.place(g, cat, chair.index, 0, 0).why, 'full');
  const n = F.clearRoom(g, cat);
  check('clear room returns every piece to stock', n === 51 && F.room(g, cat).items.length === 0);

  // ---- sell ----
  const own2 = F.count(g, 2);
  const sc = g.state.coin;
  const sres = F.sell(g, 2, 1);
  check('sell floor1 (cost 200): +100 coins (inferred 50 %), stock -1', sres.ok && sres.coin === 100 && g.state.coin === sc + 100 && F.count(g, 2) === own2 - 1);
  F.add(g, ev.index, 1);
  eq('an event piece cannot be sold', F.sell(g, ev.index, 1).why, 'notForSale');
  check('sellable lists stock with eventType < 1 only', F.sellable(g).every(i => F.row(g, i).eventType < 1) && !F.sellable(g).includes(ev.index));

  // ---- the shop building ----
  const g2 = await mk();
  eq('no shop in a fresh game', !!F.shopWork(g2), false);
  eq('the shop is locked without work 14 (crane)', g2.feat.furniture.canBuildShop(g2), false);
  g2.state.mapSize = g2.state.maxMapSize = 4;
  g2.place(14, g2.autoCell(), 0);
  eq('with the crane built the shop can be built', g2.feat.furniture.canBuildShop(g2), true);
  const w = g2.feat.furniture.buildShop(g2);
  check('buildShop places work 111 for free', w && w.a === 111 && g2.feat.furniture.shopWork(g2) === w);
  eq('a second shop is refused', g2.feat.furniture.canBuildShop(g2), false);

  // ---- save and load ----
  const snap = JSON.parse(JSON.stringify(g.save()));
  const g3 = await mk();
  g3.load(snap);
  check('state survives save and load (stock, rooms, goods)', JSON.stringify(g3.state.furniture.inv) === JSON.stringify(g.state.furniture.inv) && g3.state.furniture.goods.length === 3 && g3.state.furniture.rooms[cat].floor === g.state.furniture.rooms[cat].floor);
  const g4 = await mk();
  delete g4.state.furniture;
  g4.initFeatures();
  check('an old save without the slice gets one and three goods', g4.state.furniture && g4.state.furniture.goods.length === 3);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
