#!/usr/bin/env node
/* Mèo & Súp sim (games/cats-soup/js/sim) played by a greedy bot for N simulated minutes in node.
 *   node test/cats-soup-sim.js            CS_MINUTES=120 node test/cats-soup-sim.js
 * Checks: soup sells, gold grows, the bot builds and upgrades, prep cats deliver and rest pays energy, recipes level
 * up, the forest expands once enough facilities are owned, save/load round-trips, offline pays at most 180 minutes. */
'use strict';
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const G = path.join(__dirname, '..', 'games', 'cats-soup');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); ok ? pass++ : fail++; };

(async () => {
  const { makeGame } = await import(pathToFileURL(path.join(G, 'js/sim/boot.js')).href);
  const B = await import(pathToFileURL(path.join(G, 'js/sim/big.js')).href);
  let seed = 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const g = await makeGame(async p => JSON.parse(fs.readFileSync(path.join(G, p), 'utf8')), rng);
  g.fresh();
  check('fresh save has the soup pot and its cat', g.state.works.length === 1 && g.state.works[0].a === 0 && g.state.cats.length === 1);
  const minutes = +(process.env.CS_MINUTES || 60);
  let energyEvents = 0, soldFirst = null;
  for (let step = 0; step < minutes * 60 * 4; step++) {
    g.tick(0.25);
    for (const e of g.events) {
      if (e.type === 'energy') energyEvents++;
      if (e.type === 'sell' && !soldFirst) soldFirst = e.gold;
    }
    g.events.length = 0;
    if (g.state.shelf.length) g.sellAll();
    if (step % 20) continue;
    // Bot: build the cheapest affordable new facility, else upgrade the best value work, learn recipes, expand.
    if (g.canExpand()) g.expand();
    const wanted = g.buildList().filter(o => o.n < o.max && !o.w.costGem).sort((a, b) => B.cmp(a.price, b.price));
    if (wanted.length && g.canBuild(wanted[0].w.index)) g.build(wanted[0].w.index);
    const save = wanted.length ? wanted[0].price : B.ZERO;
    for (const line of [0, 1, 2]) for (const r of g.recipeList(line)) if (r.open) g.upgradeRecipe(r.f.index, 5);
    const ws = [...g.state.works].filter(w => [1, 2].includes(g.work.get(w.a).type)).sort((a, b) => B.cmp(g.upgradePrice(a), g.upgradePrice(b)));
    if (ws.length && B.gte(B.sub(g.state.gold, g.upgradePrice(ws[0])), B.mul(save, 0.5))) g.upgrade(ws[0], 1);
  }
  const s = g.state;
  console.log(`after ${minutes} min: gold ${B.format(s.gold)} energy ${B.format(s.energy)} works ${s.works.length} cats ${s.cats.length} map ${s.mapSize} sold ${s.stats.sold} upgrades ${s.stats.upgraded} recipes ${Object.keys(s.recipes).length}`);
  check('first dish sells near the video price (446 in LdkzNl0Bv3A)', soldFirst && B.toNumber(soldFirst) >= 400 && B.toNumber(soldFirst) < 600, soldFirst && B.format(soldFirst));
  check('bot built more facilities', s.works.length >= 5, `${s.works.length}`);
  check('every needUnit work has a cat', s.works.every(w => !g.work.get(w.a).needUnit || g.catOf(w)));
  check('rest visits paid energy', energyEvents > 0, `${energyEvents}`);
  check('facilities upgraded', s.stats.upgraded > 0, `${s.stats.upgraded}`);
  check('recipes learned beyond thin soup', Object.keys(s.recipes).length > 1);
  if (minutes >= 60) check('forest expanded at least once', s.mapSize >= 1, `size ${s.mapSize}`);
  check('works sit on distinct field cells', new Set(s.works.map(w => w.pos.join())).size === s.works.length &&
    s.works.every(w => g.fields[s.mapSize].field.some(c => c[0] === w.pos[0] && c[1] === w.pos[1])));
  const saved = g.save();
  const g2 = await makeGame(async p => JSON.parse(fs.readFileSync(path.join(G, p), 'utf8')), rng);
  g2.load(JSON.parse(JSON.stringify(saved)));
  check('save round-trips', JSON.stringify(g2.save().works) === JSON.stringify(saved.works) && B.cmp(g2.state.gold, s.gold) === 0);
  const before = s.gold;
  const off = g2.offline(24 * 3600);
  check('offline capped at 180 minutes', off && off.seconds === 180 * 60, off && `${off.seconds}s gold +${B.format(off.gold)}`);
  check('offline pays gold', B.cmp(g2.state.gold, before) > 0);
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
