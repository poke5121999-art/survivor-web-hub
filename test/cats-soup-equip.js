#!/usr/bin/env node
/* Mèo & Súp "equip" rules (games/cats-soup/js/sim/features/equip.js) in node, literal values from Equip.json / Ability.json /
 * AcceType.json / Init.json and D:/catsoup-ref/rules/equip.md: 2247 rows (639 hats, 627 cloth, 468 accessories, 284 friends,
 * 80+80+69 kitty), 10 exp for a level 1 item and level*10+10 after, draws worth 8..12 exp, pool of 103 fresh cards, reward 5.
 *   node test/cats-soup-equip.js */
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
  const M = await import(pathToFileURL(path.join(G, 'js/sim/features/equip.js')).href);
  let seed = 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const g = await makeGame(async p => JSON.parse(fs.readFileSync(path.join(G, p), 'utf8')), rng);
  g.fresh();
  const E = g.feat.equip;
  const cat = g.state.cats[0].id;

  // ---- tables ----
  const byType = {};
  for (const e of g.t.Equip) byType[e.type] = (byType[e.type] || 0) + 1;
  eq('Equip.json has 2247 rows', g.t.Equip.length, 2247);
  eq('types 0/1/2/3/10/11/12 = 639/627/468/284/80/80/69', [0, 1, 2, 3, 10, 11, 12].map(t => byType[t]).join('/'), '639/627/468/284/80/80/69');
  eq('Init 5/6/23/24/25 = 8/13/1/3/10', [5, 6, 23, 24, 25].map(i => g.t.Init[i].value).join('/'), '8/13/1/3/10');
  const art = g.data.equip;
  eq('art data: 1388 prefab items, 625 cloth textures, 24 per chunk', `${Object.keys(art.prefab).length}/${Object.keys(art.cloth).length}/${art.chunk}`, '1388/625/24');
  check('item 101 head1 is a prefab in a chunk, item 1 body1 a cloth texture', Array.isArray(art.prefab[101]) && art.prefab[101][1] === 'equip/head1' && art.cloth[1] === 'body1');
  eq('every chunk file exists', Array.from({ length: art.chunks }, (_, k) => fs.existsSync(path.join(G, 'art/equip', `c${k}`, 'scene.json'))).every(Boolean), true);
  check('fresh save: nothing owned, nothing worn', E.ownedList(g).length === 0 && g.state.equip.items.length === 0);

  // ---- level rules: head1 has Ability 406 (type 3, initValue 10, maxLv 10) ----
  eq('item 101 max level = Ability 406 maxLv', E.maxLevel(g, 101), 10);
  eq('MaxExp(0)=10, (1)=20, (9)=100, (10)=0', [0, 1, 9, 10].map(l => M.maxExp(l, 10)).join(','), '10,20,100,0');
  eq('unowned: level 0', E.level(g, 101), 0);
  const r = E.grant(g, 101);
  check('grant gives 10 exp (Init 25) = level 1', r && r.exp === 10 && r.levels === 1 && E.level(g, 101) === 1 && E.owned(g, 101), JSON.stringify(r));
  eq('level 1 item needs 20 exp for level 2', E.maxExpOf(g, 101), 20);
  eq('item 101 ability at level 1 = 10 x LFactor[0] = 10', E.abilityOf(g, 101), 10);
  E.addExp(g, 101, 19);
  eq('19 exp is not enough', E.level(g, 101), 1);
  E.addExp(g, 101, 1);
  check('20 exp levels up, exp left 0', E.level(g, 101) === 2 && E.entry(g, 101).exp === 0);
  E.addExp(g, 101, 30 + 40 + 50);
  eq('one big gain climbs several levels (2 -> 5)', E.level(g, 101), 5);
  eq('ability at level 5 = 10 x LFactor[4] (6) = 60', E.abilityOf(g, 101), 60);
  E.addExp(g, 101, 100000);
  eq('level stops at maxLv 10', E.level(g, 101), 10);
  eq('max level item has no next exp', E.maxExpOf(g, 101), 0);
  check('level-up list names item 101', E.takeLevelUps(g).includes(101) && E.takeLevelUps(g).length === 0);
  check('ability sum: Ability 406 = 10 x LFactor[9] (20) = 200', E.abilities(g)[406] === 200, JSON.stringify(E.abilities(g)));

  // ---- the draw pool (SelectGachaEquip) ----
  g.state.equip = { items: [], worn: {}, ups: [] };
  eq('fresh pool = 103 cards (eventType 0, no kitty, no friend, not item 0)', E.pool(g).length, 103);
  check('pool holds hat 101, cloth 1, acce 201 and no pet 301 / kitty 14001 / none 0',
    [101, 1, 201].every(i => E.pool(g).includes(i)) && ![301, 14001, 0].some(i => E.pool(g).includes(i)));
  let got = E.draw(g, 1);
  check('a draw returns one card worth 8..12 exp', got.length === 1 && got[0].exp >= 8 && got[0].exp <= 12, JSON.stringify(got));
  const expSeen = new Set();
  for (let k = 0; k < 200; k++) for (const x of E.draw(g, 1)) expSeen.add(x.exp);
  eq('200 draws give exactly the exps 8,9,10,11,12', [...expSeen].sort((a, b) => a - b).join(','), '8,9,10,11,12');
  check('a card that was drawn once stays in the pool until maxed, so draws eventually level things', E.ownedList(g).length > 20, `owned ${E.ownedList(g).length}`);
  // exhaust: give every pool card max level, pool must empty (msg_haveAllEquip)
  for (const i of E.pool(g)) E.addExp(g, i, 1e6);
  eq('all maxed: pool empty and a draw gives nothing', E.pool(g).length + E.draw(g, 3).length, 0);

  // ---- wearing ----
  g.state.equip = { items: [], worn: {}, ups: [] };
  g.addCat(g.state.works[0]);
  const cat2 = g.state.cats[g.state.cats.length - 1].id;
  eq('unowned item cannot be worn', E.wear(g, cat, 101).reason, 'unowned');
  E.grant(g, 101); E.grant(g, 1); E.grant(g, 201); E.grant(g, 202); E.grant(g, 222); E.grant(g, 301); E.grant(g, 302);
  let w = E.wear(g, cat, 101);
  check('hat goes to slot 0', w.ok && w.slot === 0 && E.worn(g, cat)[0] === 101);
  eq('cloth goes to slot 1', E.wear(g, cat, 1).slot, 1);
  eq('accessory 201 goes to slot 2', E.wear(g, cat, 201).slot, 2);
  w = E.wear(g, cat, 202, { slot: 1 });
  check('accessory 202 (same position 0) clashes with 201 via AcceType row 0 unable [0,13]', !w.ok && w.reason === 'unable' && w.with === 201, JSON.stringify(w));
  w = E.wear(g, cat, 222, { slot: 1 });
  check('accessory 222 (position 12) fits in slot 3', w.ok && w.slot === 3 && E.worn(g, cat)[3] === 222);
  eq('friend 301 goes to slot 4, 302 asked second goes to slot 5', `${E.wear(g, cat, 301).slot}${E.wear(g, cat, 302, { slot: 1 }).slot}`, '45');
  eq('worn slots of the cat', E.worn(g, cat).join(','), '101,1,201,222,301,302');
  eq('wearer of 101', E.wearer(g, 101), cat);
  w = E.wear(g, cat2, 101);
  check('another cat cannot take a worn item (msg_otherEquip)', !w.ok && w.reason === 'in_use' && w.by === cat);
  w = E.wear(g, cat2, 101, { steal: true });
  check('steal moves it', w.ok && E.wearer(g, 101) === cat2 && E.worn(g, cat)[0] === 0);
  check('unwear slot 2 empties it', E.unwear(g, cat, 2) && E.worn(g, cat)[2] === 0 && !E.unwear(g, cat, 2));
  eq('unwear all clears the rest (1,222,301,302)', E.unwearAll(g, cat), 4);
  const kit = g.t.Equip.find(e => e.type === 10).index;
  eq('kitty outfits are refused (this build has no kitties)', E.grant(g, kit), null);
  eq('wear event carries the slot', (g.events.filter(e => e.type === 'equip').pop() || {}).on, false);

  // ---- ability goes with ownership, not with wearing ----
  const ab = E.abilities(g);
  check('unworn but owned items still count (msg_equipItemEffect)', ab[406] === 10 && ab[13] === 20, JSON.stringify(ab));

  // ---- reward type 5 through game.reward ----
  g.state.equip = { items: [], worn: {}, ups: [] };
  let out = g.reward(5, 1, { from: 'chest' });
  check('reward 5 x1 draws one card (8..12 exp; owned only from 10)', out && out.type === 5 && out.items.length === 1 && E.entry(g, out.items[0].index).exp === out.items[0].exp && E.ownedList(g).length === (out.items[0].exp >= 10 ? 1 : 0), JSON.stringify(out));
  out = g.reward(5, 3, { from: 'chest' });
  eq('reward 5 x3 (gem chest, Init 24) draws three', out.items.length, 3);
  out = g.reward(5, 1, { equip: 5122, from: 'trader' });
  check('reward 5 with extra.equip names the outfit (elephant trader)', out && out.items[0].index === 5122 && E.owned(g, 5122), JSON.stringify(out));
  eq('chest default count = Init[23] = 1', E.openChest(g).length, 1);
  check('save round trip keeps items and worn', (() => { const c = g.save(); return JSON.stringify(c.equip) === JSON.stringify(g.state.equip); })());

  // ---- mult hook: recipe price (Ability 407: type 3, food 208) and rest energy (Ability 102: type 1, rest work 11) ----
  g.state.equip = { items: [], worn: {}, ups: [] };
  eq('no items: price and energy factors are 1', `${E.mult(g, 'price', { index: 208 })}/${E.mult(g, 'energy', { a: 11 })}`, '1/1');
  E.grant(g, 8); E.grant(g, 5);
  eq('item 8 level 1 (10 x LFactor[0]) -> food 208 price x1.1', E.mult(g, 'price', { index: 208 }), 1.1);
  eq('other food unchanged', E.mult(g, 'price', { index: 207 }), 1);
  eq('item 5 level 1 (20 x LFactor[0]) -> rest work 11 energy x1.2', E.mult(g, 'energy', { a: 11 }), 1.2);
  eq('rest work 12 unchanged, price kind ignores the energy ability', `${E.mult(g, 'energy', { a: 12 })}/${E.mult(g, 'price', { index: 11 })}`, '1/1');
  E.addExp(g, 8, 20);
  eq('item 8 level 2 (10 x LFactor[1] = 20) -> x1.2', E.mult(g, 'price', { index: 208 }), 1.2);
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
