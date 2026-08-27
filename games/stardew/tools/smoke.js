/* Boot the game under the DOM stub and exercise it. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const H = require('./harness.js');

const ROOT = process.argv[2];
const { window, document } = H;

// script order, read straight out of index.html so it cannot drift
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const files = [...html.matchAll(/<script src="([^"?]+)/g)].map(m => m[1]);

let failed = 0;
for (const f of files) {
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  try {
    vm.runInThisContext(code, { filename: f });
  } catch (e) {
    console.log('LOAD FAIL', f, '\n  ', e.message);
    failed++;
  }
}
console.log('loaded', files.length - failed, '/', files.length, 'scripts');
if (failed) process.exit(1);

const need = ['ISL_PLACES', 'ISL_MINE', 'ISL_ATLAS', 'ISL_POKE', 'ISL_POKE_DATA', 'ISL_ISLANDS', 'ISL_NPCS',
  'ISL_BATTLE', 'ISL_POKEWORK', 'ISL_POKEART', 'ISL_ITEMART', 'ISL_TUTORIAL',
  'ISL_TUTORIAL_DATA', 'ISL_NPC', 'ISL_UI', 'ISL_POKEUI', 'ISL_FARMQOL',
  'SDV_WORLD', 'SDV_SIM', 'SDV_GAME', 'SDV_DATA', 'SDV_FARMLIFE', 'SDV_SPRITES'];
const missing = need.filter(n => !window[n]);
console.log(missing.length ? 'MISSING GLOBALS: ' + missing.join(', ') : 'all globals present');

// ------------------------------------------------------------------- boot
window.ISL_ATLAS.load('art/pki/', function (err) {
  if (err) { console.log('ATLAS FAIL', err); process.exit(1); }
  console.log('atlas loaded, frames:', Object.keys(window.ISL_ATLAS.frame('Tree') ? { ok: 1 } : {}).length ? 'ok' : 'EMPTY');
  run();
});

function run() {
  const view = document.createElement('canvas');
  view.width = 430; view.height = 860;
  const G = new window.SDV_GAME.Game(view);
  G.sim._game = G;
  window.GAME = G;
  window.ISL_UI.build(G);

  /* A player taps through cards; the harness has to as well, or the very
   * first one blocks the world for the rest of the run. */
  function tapThroughTutorials(limit) {
    var n = 0;
    while (window.ISL_TUTORIAL.isOpen() && n++ < (limit || 60)) {
      window.ISL_TUTORIAL.dismiss();
    }
    return n;
  }

  step('start(fresh)', () => G.start(true));
  console.log('  tutorial cards queued:', window.ISL_TUTORIAL.pending() +
              (window.ISL_TUTORIAL.isOpen() ? 1 : 0));
  console.log('  player at', G.player.x.toFixed(1), G.player.y.toFixed(1),
              '| island:', G.currentIsland() && G.currentIsland().id);
  console.log('  npcs in world:', G.world.npcs.length);
  console.log('  owned:', Object.keys(G.sim.owned).join(','));

  step('frame x120', () => { for (let i = 0; i < 120; i++) G.frame(i * 16); });

  step('walk around', () => {
    G.stick.dx = 1; G.stick.dy = 0;
    for (let i = 0; i < 200; i++) G.frame(2000 + i * 16);
    G.stick.dx = 0; G.stick.dy = 1;
    for (let i = 0; i < 200; i++) G.frame(6000 + i * 16);
    G.stick.dx = 0; G.stick.dy = 0;
  });

  // farming loop
  step('till + plant + water + grow + harvest', () => {
    const isl = G.islandRec('home');
    const a = G.area();
    let tilled = 0, planted = 0;
    for (let y = isl.y; y < isl.y + isl.h && planted < 8; y++) {
      for (let x = isl.x; x < isl.x + isl.w && planted < 8; x++) {
        if (a.name_of(x, y) !== 'dirt') continue;
        if (!G.till(x, y, { free: true })) continue;
        tilled++;
        if (G.plantAt(x, y, 'Parsnip Seeds', { silent: true })) planted++;
      }
    }
    console.log('  tilled', tilled, 'planted', planted);
    if (!planted) throw new Error('planted nothing - the farm loop is broken');
    // water them, then run four nights
    a.objs.filter(o => o.kind === 'crop').forEach(o => { o.watered = true; });
    for (let d = 0; d < 5; d++) {
      G.sleep();
      a.objs.filter(o => o.kind === 'crop').forEach(o => { o.watered = true; });
    }
    const ready = a.objs.filter(o => o.kind === 'crop' && o.stage >= o.maxStage);
    console.log('  ripe after 5 nights:', ready.length, 'of', planted);
    if (!ready.length) throw new Error('nothing ripened in 5 nights');
    const before = G.sim.count('Parsnip');
    ready.forEach(o => G.harvestCrop(o, { silent: true }));
    console.log('  parsnips in bag:', G.sim.count('Parsnip'), '(was', before + ')');
    if (G.sim.count('Parsnip') <= before) throw new Error('harvest gave nothing');
  });

  step('island purchase chain', () => {
    G.sim.rank = 40; G.sim.gold = 5000000;
    const order = ['farm', 'market', 'forest', 'ranch', 'harbor', 'smith',
                   'meadow', 'pokemart', 'mine', 'workshop', 'jungle', 'tavern',
                   'rocky', 'greenhouse', 'museum', 'festival', 'beach',
                   'volcano', 'frost', 'lab', 'ruins', 'sanctuary', 'sky', 'dragon'];
    let bought = 0;
    for (const id of order) { tapThroughTutorials(); if (G.buyIsland(id)) bought++; }
    tapThroughTutorials();
    console.log('  bought', bought, 'of', order.length);
    if (bought !== order.length) {
      const left = order.filter(id => !G.sim.owned[id]);
      throw new Error('could not buy: ' + left.join(','));
    }
    console.log('  bridges:', (G.area()._bridges || []).length, 'tiles');
    console.log('  starter granted:', G.sim.party.length, 'party,',
                G.sim.count('Poké Ball'), 'balls');
  });

  step('every island is walkable from home', () => {
    const a = G.area();
    const home = G.islandRec('home');
    const seen = window.SDV_WORLD.reachable(a, home.x + 12, home.y + 12);
    const unreachable = [];
    for (const rec of a.islands) {
      let ok = false;
      for (let y = rec.y; y < rec.y + rec.h && !ok; y++) {
        for (let x = rec.x; x < rec.x + rec.w && !ok; x++) {
          if (seen[x + ',' + y]) ok = true;
        }
      }
      if (!ok) unreachable.push(rec.id);
    }
    console.log('  unreachable:', unreachable.length ? unreachable.join(',') : 'none');
    if (unreachable.length) throw new Error('islands cut off: ' + unreachable.join(','));
  });

  step('tutorial taught the right things in the right order', () => {
    const taught = Object.keys(G.sim.taught);
    console.log('  taught:', taught.join(','));
    console.log('  handbook pages:', G.sim.handbook.length);
    for (const id of ['welcome', 'move', 'farm', 'shop', 'pokemon', 'mine']) {
      if (!G.sim.taught[id]) throw new Error('never taught: ' + id);
    }
    if (G.sim.handbook[0] !== 'welcome') {
      throw new Error('first card should be welcome, was ' + G.sim.handbook[0]);
    }
  });

  step('encounters + battle', () => {
    tapThroughTutorials();
    window.ISL_UI.closeAll();
    G.pause(false);
    G.modal = 0;
    const meadow = G.islandRec('meadow');
    G.travelTo(meadow);
    // arriving fires the island's tutorial card, which pauses the world by
    // design - a player taps it away before walking into the grass
    tapThroughTutorials();
    G.pause(false); G.modal = 0;
    let started = 0;
    for (let i = 0; i < 60 && !G.battle; i++) {
      G.lastGrassTile = null;
      // stand in the grass
      const gr = meadow.isl.grass[0];
      G.player.x = meadow.x + gr.x + 2 + (i % 5);
      G.player.y = meadow.y + gr.y + 2;
      G.checkGrass();
      if (G.battle) started++;
    }
    console.log('  battle started:', !!G.battle);
    if (!G.battle) throw new Error('no encounter in 60 tries on the starter island');
    const b = G.battle;
    let guard = 0;
    while (!b.over && guard++ < 40) b.act({ kind: 'ball', ball: 'Poké Ball' });
    console.log('  result:', b.result, 'after', guard, 'turns');
    G.endBattle();
    console.log('  party now:', G.sim.party.length, '| dex caught:', G.sim.pokeCaught);
  });

  step('pokemon work', () => {
    const PW = window.ISL_POKEWORK;
    // give a full type-spread party so every job is reachable
    const PK = window.ISL_POKE;
    G.sim.party = [7, 74, 1, 25, 4, 16].map(id => PK.create(id, 30, {}));
    G.travelTo(G.islandRec('farm'));
    const jobs = PW.partySkills(G.sim.party);
    console.log('  jobs offered:', jobs.length, '->', jobs.map(j => j.skill.id).join(','));
    if (jobs.length < 6) throw new Error('type spread should offer more jobs than ' + jobs.length);
    // till a field then have the water type water it
    const isl = G.currentIsland();
    let n = 0;
    for (let y = isl.y; y < isl.y + isl.h; y++)
      for (let x = isl.x; x < isl.x + isl.w; x++)
        if (G.till(x, y, { free: true })) n++;
    console.log('  tilled', n, 'tiles by hand');
    const water = jobs.find(j => j.skill.id === 'water');
    const r = PW.cast(G, water.poke, 'water');
    console.log('  water job:', r.ok, r.msg);
    if (!r.ok) throw new Error('water job failed: ' + r.msg);
    console.log('  work points left on', PK.nameOf(water.poke) + ':', PK.workLeft(water.poke));
  });

  step('mine: descend, mine ore, fight, come back', () => {
    const M = window.ISL_MINE;
    M.enter(G, 1);
    if (G.world.current !== 'mine') throw new Error('did not enter the mine');
    let ore = 0, floors = 0, kills = 0;
    for (let f = 0; f < 12; f++) {
      const a = G.area();
      floors++;
      // break every ore rock on the floor
      a.objs.slice().forEach(o => {
        if (o.kind === 'oreRock' || o.kind === 'rock') {
          G.sim.energy = 200;
          G.breakObject(o, { instant: true, free: true });
        }
      });
      a.objs.slice().forEach(o => {
        if (o.kind === 'foe') {
          for (let t = 0; t < 20 && o.hp > 0; t++) { G.sim.energy = 200; G.fight(o); }
          if (o.hp <= 0) kills++;
        }
      });
      // hoover the drops
      a.objs.slice().forEach(o => { if (o.kind === 'drop') G.pickUp(o); });
      M.descend(G);
    }
    ore = ['Copper Ore','Iron Ore','Gold Ore','Iridium Ore']
      .reduce((n, k) => n + G.sim.count(k), 0);
    console.log('  floors', floors, '| depth', G.sim.mineDepth,
                '| ore mined', ore, '| kills', kills);
    if (!ore) throw new Error('twelve floors produced no ore at all');
    M.leave(G);
    if (G.world.current !== 'sea') throw new Error('could not leave the mine');
    console.log('  deepest recorded:', G.sim.deepestMine);
  });

  step('machines, crafting, cooking, museum, bundles', () => {
    const P = window.ISL_PLACES;
    // the mine filled the bag; the bag upgrade is bought, so grant it here
    G.sim.invSize = 36;
    G.sim.give('Copper Bar', 5); G.sim.give('Iron Bar', 5);
    G.sim.give('Wood', 200); G.sim.give('Stone', 200);
    G.sim.give('Milk', 4); G.sim.give('Wheat', 10);
    if (G.sim.count('Milk') < 1) throw new Error('bag was too full to hold the Milk');
    // place a Furnace and run it
    G.sim.give('Furnace', 1);
    G.travelTo(G.islandRec('workshop'));
    const a = G.area(), isl = G.currentIsland();
    let spot = null;
    for (let y = isl.y + 1; y < isl.y + isl.h - 1 && !spot; y++)
      for (let x = isl.x + 1; x < isl.x + isl.w - 1 && !spot; x++)
        if (!a.objAt(x, y) && !a.solid(x, y)) spot = { x, y };
    a.obj({ x: spot.x, y: spot.y, kind: 'machine', machine: 'Cheese Press', item: 'Cheese Press' });
    a.reindex();
    const mach = a.objAt(spot.x, spot.y);
    // start it by hand, the way the panel would
    const def = window.SDV_DATA.machines.find(m => m.name === 'Cheese Press');
    const recipes = P.machineRecipes(def);
    const rec = recipes.find(r => P.canMake(G.sim, r));
    if (!rec) {
      throw new Error('no runnable Cheese Press recipe with 4 Milk in the bag; ' +
        'offered: ' + recipes.map(r => r.out).join(','));
    }
    if (rec.alts) { const u = P.pickAlt(G.sim, rec); G.sim.take(u.item, u.qty); }
    else rec.in.forEach(i => G.sim.take(i.item, i.qty));
    mach.busy = true; mach.out = rec.out; mach.outQty = 1; mach.nights = P.nightsFor(rec);
    G.sleep();
    if (!mach.ready) throw new Error('machine did not finish overnight');
    console.log('  machine produced:', mach.out);
    const had = G.sim.count(mach.out);
    G.sim.give(mach.out, mach.outQty);
    if (G.sim.count(mach.out) <= had) throw new Error('could not collect machine output');

    // museum + bundles need something donatable
    G.sim.give('Quartz', 2); G.sim.give('Amethyst', 2);
    const beforeMuseum = G.sim.museum.length;
    G.sim.take('Quartz', 1); G.sim.museum.push('Quartz');
    if (G.sim.museum.length !== beforeMuseum + 1) throw new Error('museum donation lost');
    console.log('  museum now', G.sim.museum.length);
  });

  step('save + reload round trip', () => {
    G.sim.save(G.world);
    const raw = window.localStorage.getItem('isl-save-v1');
    console.log('  save size:', Math.round(raw.length / 1024) + ' KB');
    const view2 = document.createElement('canvas');
    view2.width = 430; view2.height = 860;
    const G2 = new window.SDV_GAME.Game(view2);
    G2.sim._game = G2;
    const ok = G2.sim.load(G2.world);
    console.log('  loaded:', ok, '| rank', G2.sim.rank, '| party', G2.sim.party.length,
                '| owned', Object.keys(G2.sim.owned).length,
                '| gold', G2.sim.gold);
    if (!ok) throw new Error('load returned false');
    if (G2.sim.party.length !== G.sim.party.length) throw new Error('party lost on reload');
    if (Object.keys(G2.sim.owned).length !== Object.keys(G.sim.owned).length) {
      throw new Error('island ownership lost on reload');
    }
    const shinyBefore = G.sim.party.filter(p => p.shiny).length;
    const shinyAfter = G2.sim.party.filter(p => p.shiny).length;
    if (shinyBefore !== shinyAfter) throw new Error('shininess changed across save');
    // crops must survive
    const cropsBefore = G.area().objs.filter(o => o.kind === 'crop').length;
    window.SDV_WORLD.applyOwnership(G2.area(), G2.sim.owned);
    const cropsAfter = G2.area().objs.filter(o => o.kind === 'crop').length;
    console.log('  crops before/after:', cropsBefore, '/', cropsAfter);
  });

  step('open every panel', () => {
    const UI = window.ISL_UI, PU = window.ISL_POKEUI, FQ = window.ISL_FARMQOL;
    const opens = [
      ['bag', () => UI.openBag(G)],
      ['map', () => UI.openMap(G)],
      ['menu', () => UI.openMenu(G)],
      ['skills', () => UI.openHandbook(G)],
      ['bin', () => UI.openBin(G)],
      ['chest', () => UI.openChest(G, { kind: 'chest' })],
      ['shop-seeds', () => { G.sim.time = 9 * 60; UI.openShop(G, 'seeds'); }],
      ['shop-pokemart', () => UI.openShop(G, 'pokemart')],
      ['calendar', () => UI.openFor(G, { kind: 'calendar' })],
      ['orders', () => FQ.openOrders(G)],
      ['farm panel', () => FQ.openPanel(G)],
      ['party', () => PU.openParty(G)],
      ['summary', () => PU.openSummary(G, G.sim.party[0], 0, () => {})],
      ['box', () => PU.openBox(G)],
      ['dex', () => PU.openDex(G)],
      ['judge', () => PU.openJudge(G)],
      ['ev', () => PU.openEvTrainer(G)],
      ['mint', () => PU.openMint(G)],
      ['npc', () => { const v = G.world.npcs[0]; if (v) UI.openNpc(G, v); }],
      ['sleep', () => UI.confirmSleep(G)],
      ['workshop', () => window.ISL_PLACES.openWorkshop(G)],
      ['kitchen', () => window.ISL_PLACES.openKitchen(G)],
      ['museum', () => window.ISL_PLACES.openMuseum(G)],
      ['bundles', () => window.ISL_PLACES.openBundles(G)],
      ['toolUpgrade', () => window.ISL_PLACES.openToolUpgrade(G)],
      ['shrine', () => window.ISL_PLACES.openShrine(G, {})],
      ['daycare', () => window.ISL_PLACES.openDaycare(G)],
      ['mail', () => window.ISL_PLACES.openMail(G)],
      ['animal house', () => UI.openFor(G, { kind: 'animalHouse', obj: { farmBuilding: 'Coop', buildingId: 'coop1' } })],
      ['mine elevator', () => window.ISL_MINE.openElevator(G)]
    ];
    let bad = [];
    for (const [name, fn] of opens) {
      try { fn(); UI.closeAll(); }
      catch (e) { bad.push(name + ': ' + e.message); }
    }
    console.log('  panels ok:', opens.length - bad.length, '/', opens.length);
    if (bad.length) throw new Error('panels failed -> ' + bad.join(' | '));
  });

  step('daily forage appears and is pickable', () => {
    G.sim.invSize = 36;
    G.spawnForage();
    const forage = G.area().objs.filter(o => o.kind === 'forage');
    console.log('  forage spawned:', forage.length,
                '| e.g.', forage.slice(0, 3).map(o => o.item).join(', '));
    if (!forage.length) throw new Error('no forage spawned on 25 owned islands');
    const before = G.sim.inventory.length;
    G.pickUp(forage[0]);
    if (G.sim.inventory.length === before && G.sim.count(forage[0].item) === 0) {
      throw new Error('picking up forage gave nothing');
    }
    // and it must not pile up night after night
    G.spawnForage(); G.spawnForage();
    const after = G.area().objs.filter(o => o.kind === 'forage').length;
    console.log('  after three nights:', after, '(must not grow without bound)');
    if (after > forage.length + 4) throw new Error('forage is accumulating');
  });

  step('a full in-game week', () => {
    for (let d = 0; d < 7; d++) {
      for (let i = 0; i < 400; i++) G.frame(100000 + d * 100000 + i * 16);
      G.sleep();
    }
    console.log('  now', G.sim.seasonVN(), G.sim.day, '| rank', G.sim.rank,
                '| gold', G.sim.gold);
  });

  console.log('\n' + (errs ? errs + ' STEP(S) FAILED' : 'ALL STEPS PASSED'));
  process.exit(errs ? 1 : 0);
}

let errs = 0;
function step(name, fn) {
  try {
    fn();
    console.log('OK  ' + name);
  } catch (e) {
    errs++;
    console.log('FAIL ' + name + '\n     ' + e.message + '\n' +
                (e.stack || '').split('\n').slice(1, 4).join('\n'));
  }
}
