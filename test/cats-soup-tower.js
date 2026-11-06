#!/usr/bin/env node
/* Mèo & Súp Cat Tower rules (games/cats-soup/js/sim/features/tower.js) in node with literal values from the Tower*
 * tables (D:/catsoup-ref/flat): opening, floors, size and cat levels, the prop shop / storage / sale, placement,
 * the 23-step guide chain, the accumulated reward, save/load.   node test/cats-soup-tower.js
 * The game is built with the tower feature alone so another feature's work in progress cannot break the rules check. */
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
  const { Game } = await imp('js/sim/game.js');
  const B = await imp('js/sim/big.js');
  const T = await imp('js/sim/features/tower.js');
  const rd = p => JSON.parse(fs.readFileSync(path.join(G, p), 'utf8'));
  const mk = () => { const g = new Game(rd('data/tables.json'), rd('data/fields.json'), () => 0.5, [T.default], { tower: rd('data/tower.json') }); g.fresh(); return g; };
  const g = mk();
  const t = () => g.state.tower;

  // ---- tables ----
  const d = g.data.tower;
  eq('TowerInfo 33 rows, TowerProp 918, TowerMission 23', [d.info.length, d.props.length, d.missions.length], [33, 918, 23]);
  eq('floor build prices 1..10 (coin)', Array.from({ length: 10 }, (_, i) => T.floorCost(g, i + 1).value), [300, 350, 400, 450, 500, 500, 500, 500, 500, 500]);
  eq('floor build prices are furniture coins (type 4)', T.floorCost(g, 3).type, 4);
  eq('size levels 12 / 20 / 28 for floor 1 and the lobby', [T.infoRow(g, 1, 1).value.slice(0, 3), T.infoRow(g, 1, 0).value.slice(0, 3)], [[12, 20, 28], [12, 20, 28]]);
  eq('size upgrades cost 300 then 500 coins', [T.infoRow(g, 1, 4).cost[1], T.infoRow(g, 1, 4).cost[2]], [300, 500]);
  eq('cat slots 2 / 3 / 4 / 5, gems 300 / 400 / 500', [T.infoRow(g, 2, 7).value, T.infoRow(g, 2, 7).cost.slice(1), T.infoRow(g, 2, 7).costType[1]], [[2, 3, 4, 5], [300, 400, 500], 3]);
  const chair = T.propOf(g, 1);
  eq('prop 1 prop_normal_01: chair 2x2x2, 200 coin, resale 100, store 10', [chair.resName, chair.type, chair.detail, chair.sx, chair.sy, chair.sz, chair.cost, chair.resale, chair.maxStorage], ['prop_normal_01', 3, 3, 2, 2, 2, 200, 100, 10]);
  eq('the shop lists the 169 always-on props (eventType 0)', T.shopList(g).length, 169);
  eq('every prop is paid in coins', [...new Set(d.props.map(p => p.costType))], [4]);

  // ---- opening ----
  check('closed before work 15 exists', !T.canOpen(g) && !T.open(g));
  g.place(15, g.autoCell(), 0);
  eq('coins at the start 2000', g.state.coin, 2000);
  check('with work 15 built the tower opens', T.canOpen(g));
  check('opening pays 300 coins and makes the lobby and floor 1', T.open(g) && g.state.coin === 1700 && T.floorList(g).join() === '0,1');
  eq('lobby starts at size level 0 (12x12) with 2 cat slots', [T.gridSize(g, 0), T.catCap(g, 0)], [12, 2]);
  check('opening twice does nothing', !T.open(g) && g.state.coin === 1700);

  // ---- floors ----
  check('floor 3 needs floor 2 first', !T.canBuildFloor(g, 3) && !T.buildFloor(g, 3));
  check('floor 2 costs 350 coins', T.buildFloor(g, 2) && g.state.coin === 1350);
  check('floor 3 costs 400 coins', T.buildFloor(g, 3) && g.state.coin === 950);
  check('no floor 11', !T.canBuildFloor(g, 11));

  // ---- size ----
  eq('size info floor 1: level 0, next costs 300 coins', [T.sizeInfo(g, 1).level, T.sizeInfo(g, 1).next], [0, { type: 4, value: 300 }]);
  check('level 2 cannot be bought before level 1', !T.setSize(g, 1, 2));
  check('level 1 costs 300 and makes the room 20x20', T.setSize(g, 1, 1) && g.state.coin === 650 && T.gridSize(g, 1) === 20);
  check('going back to level 0 is free', T.setSize(g, 1, 0) && g.state.coin === 650 && T.gridSize(g, 1) === 12);
  check('going to the bought level 1 again is free', T.setSize(g, 1, 1) && g.state.coin === 650);
  check('level 2 costs 500 and makes the room 28x28', T.setSize(g, 1, 2) && g.state.coin === 150 && T.gridSize(g, 1) === 28);

  // ---- cat slots ----
  g.state.gem = 1000;
  check('slot 2 of the lobby costs 300 gems', T.buyCatSlot(g, 0) && g.state.gem === 700 && T.catCap(g, 0) === 3);
  check('slot 3 costs 400 gems', T.buyCatSlot(g, 0) && g.state.gem === 300 && T.catCap(g, 0) === 4);
  check('slot 4 needs 500 gems: refused with 300, paid with 800', !T.buyCatSlot(g, 0) && (g.state.gem = 800, T.buyCatSlot(g, 0)) && g.state.gem === 300 && T.catCap(g, 0) === 5);
  check('no sixth slot', !T.buyCatSlot(g, 0));

  // ---- cats ----
  const cat = g.state.cats[0].id;
  check('a cat goes to the lobby and counts for guide mission 1', T.placeCat(g, cat, 0) && T.catsOn(g, 0).length === 1);
  check('the cat can move to floor 1 (a cat stands on one floor)', T.placeCat(g, cat, 1) && T.catsOn(g, 0).length === 0 && T.catsOn(g, 1).length === 1);
  check('a floor that is not built refuses', !T.placeCat(g, cat, 9));
  check('taking the cat out', T.removeCat(g, cat) && T.catsOn(g, 1).length === 0);

  // ---- shop / storage / sale / placement ----
  const g2 = mk();
  g2.place(15, g2.autoCell(), 0);
  g2.state.coin = 5000;
  T.open(g2);
  const c0 = g2.state.coin;
  check('buying 3 chairs costs 600', T.buy(g2, 1, 3) && g2.state.coin === c0 - 600 && T.have(g2, 1) === 3);
  check('the 10-copy storage limit refuses the 8th extra chair', !T.buy(g2, 1, 8) && T.buy(g2, 1, 7) && T.have(g2, 1) === 10 && !T.buy(g2, 1, 1));
  check('an event prop (eventType 2) is not in the shop', !T.buy(g2, 79, 1));
  check('placing the first chair finds the corner (0,0) with footprint 2x2', (() => { const o = T.place(g2, 0, 1); return o && o.g === 'f' && o.x === 0 && o.y === 0; })());
  const o2 = T.place(g2, 0, 1);
  eq('the second chair sits next to it at (2,0)', [o2.x, o2.y], [2, 0]);
  check('moving a chair onto the other is refused, onto a free cell works', !T.move(g2, 0, o2, 'f', 1, 0) && T.move(g2, 0, o2, 'f', 5, 5));
  check('footprint stays inside the 12x12 lobby', !T.fits(g2, 0, 1, 'f', 11, 0) && T.fits(g2, 0, 1, 'f', 10, 10) && !T.fits(g2, 0, 1, 'f', 11, 11));
  const tall = T.propOf(g2, 3);   // prop_normal_03 4x? floor furniture
  eq('prop 3 is a floor piece of 4 wide, 2 high, 3 deep', [tall.type, tall.sx, tall.sy, tall.sz], [3, 4, 2, 3]);
  eq('rotating swaps width and depth', [T.footprint(tall, 0), T.footprint(tall, 1)], [[4, 3], [3, 4]]);
  check('rotate a chair in place', T.rotate(g2, 0, o2) && o2.r === 1);
  eq('3 chairs owned, 2 placed -> 1 spare; sellable 1 (ResaleLimitType 1 sells spare copies)', [T.spare(g2, 1), T.sellable(g2, 1)], [8, 8]);
  const coin1 = g2.state.coin;
  check('selling 2 chairs pays 2 x 100', T.sell(g2, 1, 2) && g2.state.coin === coin1 + 200 && T.have(g2, 1) === 8);
  check('cannot sell a placed copy', !T.sell(g2, 1, 7) && T.sellable(g2, 1) === 6);
  check('storing returns the chair to storage, still owned', T.store(g2, 0, o2) && T.have(g2, 1) === 8 && T.arranged(g2, 1) === 1);
  eq('storeAll empties the layer', [T.storeAll(g2, 0), g2.state.tower.layers[0].props.length], [1, 0]);
  // ResaleLimitType 2 keeps one copy while none is placed; 0 never sells
  const lim2 = d.props.find(p => p.resaleLimit === 2 && p.eventType === 0), lim0 = d.props.find(p => p.resaleLimit === 0);
  T.addProp(g2, lim2.index, 2); T.addProp(g2, lim0.index, 1);
  eq(`prop ${lim2.index} (limit 2): 2 owned, none placed -> sell 1; limit 0 prop sells 0`, [T.sellable(g2, lim2.index), T.sellable(g2, lim0.index)], [1, 0]);
  // wall pieces and surfaces
  const wallProp = d.props.find(p => p.type === 4 && p.eventType === 0);
  T.buy(g2, wallProp.index, 1);
  const w = T.place(g2, 0, wallProp.index);
  check(`wall piece ${wallProp.resName} goes on the left wall at its base`, w && w.g === 'wl' && w.x === 0 && w.y === 0);
  const floorTile = d.props.find(p => p.type === 1 && p.eventType === 0);
  T.addProp(g2, floorTile.index, 1);
  check('a floor tile (type 1) replaces the layer floor', T.place(g2, 0, floorTile.index) === true && g2.state.tower.layers[0].floor === floorTile.index);
  const carpet = d.props.find(p => p.type === 5 && p.eventType === 0);
  T.addProp(g2, carpet.index, 1);
  const cp = T.place(g2, 0, carpet.index);
  check('a carpet goes on its own grid under the furniture', cp && cp.g === 'c');
  // shrinking returns pieces outside the new size to storage
  const g3 = mk();
  g3.place(15, g3.autoCell(), 0); g3.state.coin = 5000; T.open(g3);
  T.setSize(g3, 1, 1);
  T.buy(g3, 1, 1);
  const far = T.place(g3, 1, 1, { g: 'f', x: 18, y: 18 });
  eq('a chair placed at (18,18) on the 20x20 floor', [far.x, far.y], [18, 18]);
  T.setSize(g3, 1, 0);
  eq('back to 12x12 the chair is stored, not lost', [g3.state.tower.layers[1].props.length, T.have(g3, 1)], [0, 1]);

  // ---- guide mission chain ----
  const g4 = mk();
  g4.place(15, g4.autoCell(), 0); g4.state.coin = 2000; g4.state.gem = 99999; T.open(g4);
  const row = () => T.missionRow(g4);
  eq('mission 0 is met when the tower opens (the butler is placed): ready', [row().index, g4.state.tower.mission.ready], [0, true]);
  const coin0 = g4.state.coin;
  T.claimMission(g4);
  eq('claim 0 pays 200 coins and moves to row 1', [g4.state.coin - coin0, row().index], [200, 1]);
  check('row 1 (place a cat in the lobby) is not ready, then is', !T.canClaimMission(g4) && T.placeCat(g4, g4.state.cats[0].id, 0) && T.canClaimMission(g4));
  T.claimMission(g4);
  eq('row 2 is a visit row: met on arrival; its reward is prop 3 (rewardType 201)', [row().index, row().missionType, T.canClaimMission(g4), row().rewardValue], [2, 4, true, 3]);
  T.claimMission(g4);
  eq('claim 2 put one prop 3 in storage', [T.have(g4, 3), row().index, row().missionType, row().missionValue2], [1, 3, 2, 3]);
  check('placing a different prop does not count for row 3 (needs prop 3)', (() => { T.addProp(g4, 1, 1); T.place(g4, 0, 1); return !T.canClaimMission(g4); })());
  check('placing prop 3 in the lobby does', T.place(g4, 0, 3) && T.canClaimMission(g4));
  // walk the rest with a bot
  const seen = [];
  for (let i = 0; i < 40 && !T.missionDone(g4); i++) {
    const r = row();
    if (!T.canClaimMission(g4)) {
      if (r.missionType === 2) { T.addProp(g4, r.missionValue2, 1); check(`row ${r.index}: place prop ${r.missionValue2}`, !!T.place(g4, r.missionValue2 === 9999 ? 0 : 0, r.missionValue2)); }
      else if (r.missionType === 3) T.buy(g4, 1, 1);
      else if (r.missionType === 8) T.photo(g4);
      else if (r.missionType === 1) T.placeCat(g4, g4.state.cats[0].id, 0);
    }
    seen.push(r.index);
    check(`row ${r.index} claimable`, T.canClaimMission(g4)) ;
    T.claimMission(g4);
  }
  eq('the chain ran 3..22 and finished', [seen[0], seen[seen.length - 1], T.missionDone(g4)], [3, 22, true]);
  check('no mission once the chain is done', T.missionRow(g4) === null && T.claimMission(g4) === null);

  // ---- accumulated reward ----
  const g5 = mk();
  g5.place(15, g5.autoCell(), 0); T.open(g5);
  eq('fresh average income is 29 gold/s, one tick = 450 s of it = 13050', [B.toNumber(g5.averageIncome()), B.toNumber(T.tickGold(g5))], [29, 13050]);
  g5.tick(3599);
  eq('59 min 59 s: nothing stored', [T.ticks(g5), T.canClaimIdle(g5)], [0, false]);
  g5.tick(1);
  eq('after one hour 1 tick = 13050 gold', [T.ticks(g5), B.toNumber(T.pending(g5))], [1, 13050]);
  g5.tick(3600 * 2);
  eq('3 ticks = 39150', B.toNumber(T.pending(g5)), 39150);
  const gold0 = B.toNumber(g5.state.gold);
  const paid = T.claimIdle(g5, true);
  eq('the ad claim pays twice: 78300', [Math.round(B.toNumber(paid)), Math.round(B.toNumber(g5.state.gold) - gold0)], [78300, 78300]);
  eq('claim resets the counter', [T.ticks(g5), T.canClaimIdle(g5)], [0, false]);
  g5.offline(30 * 3600, 30 * 3600);
  eq('offline 30 h adds 30 ticks', T.ticks(g5), 30);
  g5.tick(100 * 3600);
  eq('capped at 72 ticks (3 days)', [T.ticks(g5), T.isMax(g5), Math.round(B.toNumber(T.pending(g5)))], [72, true, 72 * 13050]);

  // ---- save / load ----
  const snap = JSON.parse(JSON.stringify(g2.save()));
  const g6 = mk(); g6.load(snap);
  eq('save keeps floors, owned props and placed pieces', [g6.state.tower.open, g6.state.tower.have[1], g6.state.tower.layers[0].floor], [true, 8, floorTile.index]);

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
