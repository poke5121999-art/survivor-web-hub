/*
 * regress.js - one assertion per bug that was actually found and fixed.
 *
 *   node tools/regress.js .
 *
 * smoke.js asks "does the game still work". uicrawl.js asks "does every button
 * still behave". This file asks the narrower and more useful question: DID THE
 * SPECIFIC THING THAT WAS BROKEN COME BACK.
 *
 * Every case below was reproduced before it was fixed. The comment on each one
 * says what the player saw, because six months from now that is the only part
 * that will still make sense.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const H = require('./harness.js');

const ROOT = process.argv[2] || '.';
const { window, document } = H;

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
[...html.matchAll(/<script src="([^"?]+)/g)].map(m => m[1])
  .forEach(f => vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f }));

let fails = 0;
function check(name, fn) {
  try {
    const why = fn();
    if (why) { fails++; console.log('FAIL ' + name + '\n     ' + why); }
    else console.log('ok   ' + name);
  } catch (e) {
    fails++;
    console.log('FAIL ' + name + '\n     threw: ' + e.message);
  }
}

window.ISL_ATLAS.load('art/pki/', function (err) {
  if (err) { console.log('ATLAS FAIL', err); process.exit(1); }
  run();
});

function run() {
  const view = document.createElement('canvas');
  view.width = 430; view.height = 860;
  const G = new window.SDV_GAME.Game(view);
  G.sim._game = G;
  window.GAME = G;
  window.ISL_UI.build(G);
  G.start(true);
  window.ISL_TUTORIAL.skipAll();
  window.ISL_UI.closeAll();

  const s = G.sim, PK = window.ISL_POKE, BT = window.ISL_BATTLE;
  const D = window.ISL_POKE_DATA;
  function mv(n) {
    for (const k in D.moves) if (D.moves[k].n === n) return Object.assign({ id: +k }, D.moves[k]);
    return null;
  }
  function fresh(id, lv, names) {
    const p = PK.create(id, lv, { iv: [31, 31, 31, 31, 31, 31] });
    if (names) p.moves = names.map(n => { const m = mv(n); return { id: m.id, pp: m.pp, ppMax: m.pp }; });
    p.stages = [0, 0, 0, 0, 0, 0, 0, 0];
    return p;
  }
  function arena(mine, wild) {
    const g = {
      sim: { party: [mine], luck: 0, count: () => 0, dexSee() {}, addXp() {} },
      toast() {}, addRank() {}, pokeParty: () => [mine]
    };
    const b = new BT.Battle(g, wild, { island: { id: 'x' } });
    b.you = mine; b.wild = wild;
    return b;
  }
  function bag(items) {
    s.inventory.length = 0;
    items.forEach(([n, q, ql]) => s.give(n, q, ql || 0));
  }

  console.log('--- inventory: one stack in, the same stack out ---');

  /* The player held one iridium Starfruit and ten plain ones. Selling the
   * iridium row paid the iridium price and removed a PLAIN one - so the good
   * fruit stayed in the bag and the difference was gold from nothing. */
  check('take removes the stack it was handed, not the last one with that name', () => {
    bag([['Starfruit', 1, 3], ['Starfruit', 5, 0]]);
    const good = s.inventory[0];
    s.takeStack(good, 1);
    const left = s.inventory.filter(i => i.name === 'Starfruit');
    if (left.length !== 1 || left[0].quality !== 0 || left[0].qty !== 5) {
      return 'expected the plain x5 to survive, got ' + JSON.stringify(left);
    }
    return null;
  });

  /* A full bag holding a PLAIN parsnip passed the old `hasSpace() ||
   * count(name)` guard, then give() refused the gold-star one because it
   * merges on name AND quality - and the crop was cleared off the map anyway. */
  check('canGive knows a full bag cannot take a different quality', () => {
    s.invSize = 3;
    bag([['Parsnip', 1, 0], ['Wood', 1, 0], ['Stone', 1, 0]]);
    const a = s.canGive('Parsnip', 0), b = s.canGive('Parsnip', 2);
    s.invSize = 24;
    if (!a) return 'a matching stack should still accept more';
    if (b) return 'a full bag must refuse a quality it has no stack for';
    return null;
  });

  check('harvesting into a full bag keeps the crop instead of destroying it', () => {
    s.invSize = 2;
    bag([['Parsnip', 1, 0], ['Wood', 1, 0]]);
    const a = G.area();
    const crop = { x: 44, y: 66, kind: 'crop', name: 'Parsnip', stage: 4, maxStage: 4,
                   watered: true, fert: 3, minHarvest: 1, maxHarvest: 1 };
    a.obj(crop);
    let kept = true;
    for (let i = 0; i < 40; i++) {          // roll quality until a non-plain one comes up
      crop.harvested = false;
      const r = G.harvestCrop(crop, { silent: true });
      if (r === 'full') { kept = !!a.objAt(44, 66); break; }
      if (r === true) break;                // rolled plain, merged, fine - retry
      s.inventory[0].qty = 1;
    }
    a.remove(crop);
    s.invSize = 24;
    return kept ? null : 'a refused harvest removed the crop from the map';
  });

  /* Shipping is not a rucksack. The bin inherited the BAG's slot cap and the
   * caller ignored give()'s answer, so the thirteenth kind of item shipped in
   * a day was deleted and paid nothing. */
  check('the shipping bin has no slot cap', () => {
    s.shipped.length = 0;
    for (let i = 0; i < 40; i++) s.give('Item' + i, 1, 0, s.shipped);
    return s.shipped.length === 40 ? null : 'bin capped at ' + s.shipped.length + ' stacks';
  });

  console.log('\n--- progression ---');

  /* RANK_XP[0] is 0, which is falsy, so `|| last` handed back 985000 as the
   * bar to leave rank 1. The first thing a new player saw was a full progress
   * bar that did not move until rank 2. */
  check('the rank bar starts empty at rank 1', () => {
    s.rank = 1; s.rankXp = 0;
    if (s.rankNeed(0) !== 0) return 'rankNeed(0) = ' + s.rankNeed(0) + ', want 0';
    if (s.rankProgress() !== 0) return 'progress at 0 xp = ' + s.rankProgress();
    s.rankXp = Math.floor(s.rankNeed(1) / 2);
    const half = s.rankProgress();
    if (half < 0.45 || half > 0.55) return 'progress at half the bar = ' + half;
    return null;
  });

  /* Every verb calls Game.prototype.spend, which only set `sluggish`.
   * Sim.prototype.spend - the one that sets `exhausted` and costs half the
   * night's rest - had no callers at all. */
  check('working to zero costs half the night', () => {
    s.energy = 5; s.exhausted = false;
    G.spend(10);
    return s.exhausted ? null : 'energy hit 0 and exhausted stayed false';
  });

  /* The four Vault bundles carry no item list, so `have < need` was 0 < 0 -
   * false - and all four completed on the first tap of the first day for
   * +2,000v and +120 rank each. */
  check('the Vault bundles charge their price', () => {
    const all = (G.data.bundles || []).filter(b => !(b.items || []).length);
    if (!all.length) return 'no money bundles in the data - test is stale';
    s.gold = 1000; s.bundlesDone = {};
    window.ISL_UI.closeAll();
    window.ISL_PLACES.openBundles(G);
    const layer = document.getElementById('layer');
    const panel = layer.children[layer.children.length - 1];
    const taps = [];
    (function walk(n) { if (n.onclick) taps.push(n); (n.children || []).forEach(walk); })(panel);
    const before = s.gold;
    taps.forEach(t => { try { t.click(); } catch (e) {} });
    window.ISL_UI.closeAll();
    if (s.gold > before) return 'gold ROSE from ' + before + ' to ' + s.gold +
                                ' with 1,000v in hand - the money bundles are free again';
    return null;
  });

  console.log('\n--- the world ---');

  /* FIXTURE lists `chest` because the generator puts one in the farmhouse, so
   * filtering saved objects by kind deleted every chest the PLAYER placed. */
  check('a player-placed chest survives a save/load', () => {
    const a = G.area();
    a.obj({ x: 46, y: 63, kind: 'chest', item: 'Chest', placed: 1 });
    const before = a.objs.filter(o => o.kind === 'chest' && o.placed).length;
    const blob = G.world.serialize();
    const w2 = new window.SDV_GAME.World();
    w2.deserialize(blob);
    const after = w2.areas.sea.objs.filter(o => o.kind === 'chest' && o.placed).length;
    a.remove(a.objAt(46, 63));
    return after === before ? null : 'placed chests ' + before + ' -> ' + after;
  });

  /* scatterOn reserved only an object's ORIGIN, so props landed inside the
   * footprint of houses and docks - and deserialize, which does use the whole
   * footprint, deleted them on the first reload. */
  check('nothing is generated inside a building footprint', () => {
    const a = G.area();
    const foot = {};
    a.objs.forEach(o => {
      if ((o.w || 1) === 1 && (o.h || 1) === 1) return;
      for (let y = 0; y < (o.h || 1); y++)
        for (let x = 0; x < (o.w || 1); x++) foot[(o.x + x) + ',' + (o.y + y)] = o;
    });
    /* Only single-tile scatter counts. A building's own origin is inside its
     * own footprint, which is not a collision with anything. */
    const buried = a.objs.filter(o =>
      o.gen && (o.w || 1) === 1 && (o.h || 1) === 1 &&
      foot[o.x + ',' + o.y] && foot[o.x + ',' + o.y] !== o);
    return buried.length
      ? buried.length + ' generated props sit inside a fixture, e.g. ' +
        buried.slice(0, 3).map(o => o.kind + ' at ' + o.x + ',' + o.y).join('; ')
      : null;
  });

  /* scatterOn made forage with no `item`, so it drew as a Daffodil and paid
   * Wood until the first night replaced it. */
  check('build-time forage knows what it is', () => {
    const bad = G.area().objs.filter(o => o.kind === 'forage' && !o.item);
    return bad.length ? bad.length + ' forage pickups have no item name' : null;
  });

  /* findFocus probed 0.85 of a tile from the player's exact position, so for
   * the first 15% of every tile it returned the tile UNDER the player. */
  check('the action button never targets the tile you are standing on', () => {
    const p = G.player;
    const was = { x: p.x, y: p.y, dir: p.dir };
    let bad = 0;
    for (let frac = 0.02; frac < 1; frac += 0.04) {
      p.x = Math.floor(was.x) + frac; p.y = was.y;
      p.dir = 'right';
      const f = G.findFocus();
      if (f && f.x === Math.floor(p.x)) bad++;
      p.dir = 'left';
      const f2 = G.findFocus();
      if (f2 && f2.x === Math.floor(p.x)) bad++;
    }
    p.x = was.x; p.y = was.y; p.dir = was.dir;
    return bad ? bad + ' positions targeted the standing tile' : null;
  });

  /* ui.js had a `case 'workshop'` handler and places.js had the whole crafting
   * bench, but objectVerb had no case for it - so a 12,000v island was scenery. */
  check('every placed prop kind has a verb', () => {
    const kinds = {};
    G.area().objs.forEach(o => { kinds[o.kind] = 1; });
    const SCENERY = { house: 1, pillar: 1, dock: 1, table: 1, stage: 1, display: 1,
                      petBed: 1, sign: 1, npc: 1, crop: 1, sprinkler: 1, drop: 1 };
    const mute = [];
    Object.keys(kinds).forEach(k => {
      if (SCENERY[k]) return;
      const v = window.SDV_GAME.objectVerb
        ? window.SDV_GAME.objectVerb(G, { kind: k })
        : null;
      if (v === undefined) mute.push(k);
    });
    return mute.length ? 'no verb for: ' + mute.join(', ') : null;
  });

  /* Each auto-work case needs a clean patch of ground and a rested player.
     Without this they read each other's leftovers - the felled tree from one
     case drops Wood that the next case's loot check then finds. */
  function clearAround(r) {
    /* Dismiss any card first. A tutorial card freezes the world - Game.busy()
     * is true while one is up, so step() never runs - and the low-energy card
     * that the previous case deliberately triggers would silently freeze every
     * case after it, making them all pass by doing nothing. */
    while (window.ISL_TUTORIAL.isOpen()) window.ISL_TUTORIAL.dismiss();
    window.ISL_UI.closeAll();
    const a = G.area();
    const px = Math.floor(G.player.x), py = Math.floor(G.player.y);
    a.objs.slice().forEach(o => {
      if (Math.abs(o.x - px) <= r && Math.abs(o.y - py) <= r) a.remove(o);
    });
    s.energy = s.maxEnergy;
    s.exhausted = false;
    s.sluggish = false;
    G.stick.dx = 0; G.stick.dy = 0;
    return { px, py, a };
  }

  console.log('\n--- lam viec tu dong ---');

  /* Standing next to a tree has to fell it without a single tap, the way
     Pickaxe King Island does. Three swings for a tree, five for a boulder -
     fifteen taps to clear one corner of an island is what this replaces. */
  check('standing next to a tree fells it with no input', () => {
    const { px, py, a } = clearAround(4);
    s.autoWork = true;
    const tree = { x: px + 1, y: py, kind: 'tree', hp: 3 };
    a.obj(tree);
    for (let i = 0; i < 200; i++) G.frame(G.time + 16);   // ~3.2 seconds
    return a.objs.indexOf(tree) < 0 ? null
      : 'still standing after 3 seconds, on ' + tree.hp + ' hp';
  });

  /* ...but walking past one must NOT. Otherwise crossing Dao Rung once strips
     it and the energy is gone before the player sees a bar move. */
  check('walking past a tree leaves it alone', () => {
    const { px, py, a } = clearAround(4);
    s.autoWork = true;
    const tree = { x: px + 2, y: py, kind: 'tree', hp: 3 };
    a.obj(tree);
    G.stick.dx = 1; G.stick.dy = 0;
    for (let i = 0; i < 40; i++) G.frame(G.time + 16);
    G.stick.dx = 0; G.stick.dy = 0;
    const survived = tree.hp === 3;
    a.remove(tree);
    return survived ? null : 'a tree lost ' + (3 - tree.hp) + ' hp to someone walking past';
  });

  /* Auto work must stop with energy left, not at zero: the price of hitting
     zero is half a night's rest and nothing on screen asked first. */
  check('auto work stops before the energy runs out', () => {
    const { px, py, a } = clearAround(4);
    s.autoWork = true;
    s.energy = 40;
    /* One tile can only hold one object, so refill it as each tree falls -
       the point is to keep swinging, not to model a forest. */
    a.obj({ x: px + 1, y: py, kind: 'tree', hp: 3 });
    for (let i = 0; i < 900; i++) {
      if (!a.objAt(px + 1, py)) a.obj({ x: px + 1, y: py, kind: 'tree', hp: 3 });
      G.frame(G.time + 16);
    }
    const left = s.energy, spent = s.exhausted;
    clearAround(4);
    if (left <= 0) return 'it ran the player to zero';
    if (spent) return 'it left the player exhausted';
    return null;
  });

  /* Everything the player knocked loose is already theirs. */
  check('loot within reach walks into the bag', () => {
    const { px, py, a } = clearAround(4);
    s.autoLoot = true; s.autoWork = false; s.invSize = 24;
    s.inventory.length = 0;
    const drop = { x: px + 1, y: py, kind: 'drop', item: 'Wood', qty: 4,
                   quality: 0, born: 0 };
    a.obj(drop);
    for (let i = 0; i < 30; i++) G.frame(G.time + 16);
    s.autoWork = true;
    if (a.objs.indexOf(drop) >= 0) return 'the drop is still on the ground';
    if (s.count('Wood') !== 4) return 'bag has ' + s.count('Wood') + ' Wood, want 4';
    return null;
  });

  /* A full bag must not delete what it cannot hold. */
  check('auto loot leaves what it cannot carry', () => {
    const { px, py, a } = clearAround(4);
    s.autoLoot = true; s.autoWork = false; s.invSize = 1;
    s.inventory.length = 0;
    s.give('Stone', 1, 0);
    const drop = { x: px + 1, y: py, kind: 'drop', item: 'Wood', qty: 4,
                   quality: 0, born: 0 };
    a.obj(drop);
    for (let i = 0; i < 30; i++) G.frame(G.time + 16);
    const still = a.objs.indexOf(drop) >= 0;
    a.remove(drop);
    s.invSize = 24; s.autoWork = true;
    return still ? null : 'a full bag made the drop disappear';
  });

  /* Both switches have to survive a reload, or the player turns them off and
     finds them back on tomorrow morning. */
  check('the auto switches are saved', () => {
    s.autoWork = false; s.autoLoot = false;
    const blob = JSON.parse(JSON.stringify(s.toJSON(G.world)));
    if (blob.autoWork !== false || blob.autoLoot !== false) return 'not written to the save';
    s.autoWork = true; s.autoLoot = true;
    return null;
  });

  /* Monsters in the mine used the same tap-per-swing as everything else. They
     are also the one case where standing still is not free: a foe within one
     tile takes health every 1.1 seconds whether or not you swing back. */
  check('standing next to a monster kills it with no input', () => {
    window.ISL_MINE.enter(G);
    while (window.ISL_TUTORIAL.isOpen()) window.ISL_TUTORIAL.dismiss();
    window.ISL_UI.closeAll();
    const a = G.area();
    s.autoFight = true;
    s.energy = s.maxEnergy;
    s.health = s.maxHealth;
    const px = Math.floor(G.player.x), py = Math.floor(G.player.y);
    a.objs.slice().forEach(o => {
      if (Math.abs(o.x - px) <= 3 && Math.abs(o.y - py) <= 3) a.remove(o);
    });
    const foe = { x: px + 1, y: py, kind: 'foe', name: 'Slime', hp: 20, dmg: 3 };
    a.obj(foe);
    G.stick.dx = 0; G.stick.dy = 0;
    for (let i = 0; i < 300; i++) G.frame(G.time + 16);
    const dead = a.objs.indexOf(foe) < 0;
    a.objs.slice().forEach(o => { if (o.kind === 'foe') a.remove(o); });
    window.ISL_MINE.leave(G);
    while (window.ISL_TUTORIAL.isOpen()) window.ISL_TUTORIAL.dismiss();
    window.ISL_UI.closeAll();
    return dead ? null : 'the monster is still alive on ' + foe.hp + ' hp';
  });

  /* Fainting costs ten percent of the player's gold. An auto-attack that
     fights to the last hit point is a trap nobody agreed to. */
  check('auto fight stops while there is still health left', () => {
    window.ISL_MINE.enter(G);
    while (window.ISL_TUTORIAL.isOpen()) window.ISL_TUTORIAL.dismiss();
    window.ISL_UI.closeAll();
    const a = G.area();
    s.autoFight = true;
    s.energy = s.maxEnergy;
    s.health = Math.round(s.maxHealth * 0.25);   // already under the floor
    const before = s.health;
    const px = Math.floor(G.player.x), py = Math.floor(G.player.y);
    a.objs.slice().forEach(o => {
      if (Math.abs(o.x - px) <= 3 && Math.abs(o.y - py) <= 3) a.remove(o);
    });
    const foe = { x: px + 1, y: py, kind: 'foe', name: 'Slime', hp: 9999, dmg: 0 };
    a.obj(foe);
    G.stick.dx = 0; G.stick.dy = 0;
    for (let i = 0; i < 200; i++) G.frame(G.time + 16);
    const hit = foe.hp < 9999;
    a.objs.slice().forEach(o => { if (o.kind === 'foe') a.remove(o); });
    window.ISL_MINE.leave(G);
    while (window.ISL_TUTORIAL.isOpen()) window.ISL_TUTORIAL.dismiss();
    window.ISL_UI.closeAll();
    s.health = s.maxHealth;
    if (hit) return 'it kept swinging at ' + before + ' health';
    return null;
  });

  console.log('\n--- Pokemon: Generation 3 arithmetic ---');

  /* Recoil is a NEGATIVE drain percentage, and Math.max(1, -35) is 1 - so
   * every recoil move healed its user for a point instead of hurting it. */
  check('recoil hurts the user', () => {
    const a = fresh(76, 60, ['Double-Edge']), d = fresh(1, 60, ['Tackle']);
    const b = arena(a, d);
    const hp0 = a.hp;
    b.useMove(a, d, a.moves[0], true);
    return a.hp < hp0 ? null : 'Double-Edge left the user on ' + a.hp + ' of ' + hp0;
  });

  /* Seventeen damaging moves carry no power number. They fell into the status
   * branch, dealt nothing, and printed no message - a Gastly caught at level
   * 21 could not deal damage at all, ever. */
  check('Night Shade deals damage equal to the user level', () => {
    const a = fresh(94, 50, ['Night Shade']), d = fresh(1, 50, ['Tackle']);
    const b = arena(a, d);
    const hp0 = d.hp;
    b.useMove(a, d, a.moves[0], true);
    return (hp0 - d.hp) === 50 ? null : 'dealt ' + (hp0 - d.hp) + ', want 50';
  });
  check('Dragon Rage deals exactly 40', () => {
    const a = fresh(147, 30, ['Dragon Rage']), d = fresh(1, 50, ['Tackle']);
    const b = arena(a, d);
    const hp0 = d.hp;
    b.useMove(a, d, a.moves[0], true);
    return (hp0 - d.hp) === 40 ? null : 'dealt ' + (hp0 - d.hp);
  });
  check('a Fighting move still cannot touch a Ghost', () => {
    const a = fresh(66, 50, ['Seismic Toss']), d = fresh(92, 50, ['Lick']);
    const b = arena(a, d);
    const hp0 = d.hp;
    b.useMove(a, d, a.moves[0], true);
    return d.hp === hp0 ? null : 'Seismic Toss hit a Ghost for ' + (hp0 - d.hp);
  });

  /* Struggle was a flat quarter of the STRUGGLER's max HP, ignoring defence,
   * level and typing - so a fat Snorlax got more dangerous once it ran dry. */
  check('Struggle goes through a Ghost and costs the user', () => {
    const a = fresh(143, 50, []), d = fresh(94, 50, ['Lick']);
    a.moves = [];
    const b = arena(a, d);
    const dh = d.hp, ah = a.hp;
    b.useMove(a, d, null, true);
    if (d.hp >= dh) return 'Struggle did not hit the Ghost';
    if (a.hp >= ah) return 'Struggle cost the user nothing';
    return null;
  });

  /* The engine guessed the target of a stat change from its SIGN, which gave
   * Superpower's drawback to the opponent and Swagger's +2 Attack to the user. */
  check('Swagger raises the TARGET', () => {
    const a = fresh(128, 50, ['Swagger']), d = fresh(1, 50, ['Tackle']);
    const b = arena(a, d);
    b.useMove(a, d, a.moves[0], true);
    if (d.stages[1] !== 2) return 'target attack stage = ' + d.stages[1] + ', want 2';
    if (a.stages[1] !== 0) return 'the user gained ' + a.stages[1] + ' attack stages';
    return null;
  });
  check('Superpower lowers the USER', () => {
    const a = fresh(31, 50, ['Superpower']), d = fresh(1, 50, ['Tackle']);
    const b = arena(a, d);
    b.useMove(a, d, a.moves[0], true);
    if (a.stages[1] !== -1) return 'user attack stage = ' + a.stages[1] + ', want -1';
    if (d.stages[1] !== 0) return 'the target lost ' + d.stages[1] + ' attack stages';
    return null;
  });

  /* Confusion was stored in `status`, so a Pokemon hit by Confuse Ray could
   * never be poisoned, burned or paralysed again, kept a healthy catch rate,
   * and printed "bị cnf!" in the log. */
  check('confusion does not block a real status', () => {
    const a = fresh(25, 50, ['Thunder Wave']), d = fresh(1, 50, ['Tackle']);
    d.conf = 3;
    const b = arena(a, d);
    for (let i = 0; i < 10 && d.status !== 'par'; i++) {
      a.moves[0].pp = 5;
      b.useMove(a, d, a.moves[0], true);
    }
    return d.status === 'par' ? null : 'status stuck at ' + d.status;
  });

  /* Only the UI greyed out an empty move, so anything driving the engine
   * directly could fire it forever and Struggle was unreachable. */
  check('a move at 0 PP falls through to Struggle', () => {
    const a = fresh(1, 50, ['Tackle']), d = fresh(4, 50, ['Scratch']);
    a.moves[0].pp = 0;
    const b = arena(a, d);
    const ah = a.hp;
    b.useMove(a, d, a.moves[0], true);
    return a.hp < ah ? null : 'the empty move was used and cost nothing';
  });

  /* Accuracy and evasion were read off the STAT table. Gen 3 gives them their
   * own, gentler ladder. */
  check('accuracy uses the Gen 3 accuracy ladder, not the stat ladder', () => {
    const a = fresh(1, 50, ['Tackle']), d = fresh(4, 50, ['Scratch']);
    a.stages[6] = -6;
    let hit = 0;
    for (let i = 0; i < 4000; i++) if (!PK.damage(a, d, a.moves[0].id).miss) hit++;
    const rate = hit / 4000;
    // Tackle is 95% accurate in Gen 3; at -6 that is 0.95 * 0.33 = ~0.31
    return (rate > 0.27 && rate < 0.36) ? null
      : 'hit rate at -6 accuracy = ' + rate.toFixed(3) + ', want ~0.31';
  });

  console.log('\n--- Pokemon: identity survives the save ---');

  /* pidWithNature nudges the PID by up to 24, which breaks the shiny test.
   * A minted shiny stayed shiny on screen and came back plain on the next
   * load - and could come back the other gender, too. */
  check('a shiny with a pinned nature is actually shiny', () => {
    let bad = 0;
    for (let i = 0; i < 50; i++) {
      const p = PK.create(25, 20, { shiny: true, nature: 7 });
      if (!p.shiny || p.nature !== 7) bad++;
    }
    return bad ? bad + ' of 50 came out wrong' : null;
  });
  check('the nature mint keeps shininess and gender', () => {
    const p = PK.create(25, 20, { shiny: true });
    const g0 = p.gender;
    PK.mintNature(p, 15, s.tid, s.sid);
    const back = PK.unpack(PK.pack(p), s.tid, s.sid);
    if (back.nature !== 15) return 'nature did not stick';
    if (!back.shiny) return 'the shiny came back plain after a reload';
    if (back.gender !== g0) return 'gender flipped';
    return null;
  });

  /* recalc clamped HP to at least 1, so a fainted Pokemon was revived by the
   * act of saving and loading - and its work points went 0 -> 3. */
  check('a fainted Pokemon stays fainted across a reload', () => {
    const p = PK.create(1, 20, {});
    p.hp = 0;
    const back = PK.unpack(PK.pack(p), s.tid, s.sid);
    if (back.hp !== 0) return 'came back on ' + back.hp + ' HP';
    if (PK.maxWork(back) !== 0) return 'a fainted Pokemon offers ' + PK.maxWork(back) + ' work points';
    return null;
  });
  check('a fainted legendary offers no work either', () => {
    const lg = window.ISL_POKE_DATA.mon;
    let id = null;
    for (const k in lg) if (lg[k].lg) { id = +k; break; }
    if (!id) return 'no legendary in the data - test is stale';
    const p = PK.create(id, 50, {});
    p.hp = 0;
    return PK.maxWork(p) === 0 ? null : 'offers ' + PK.maxWork(p);
  });
  check('sleep state survives a reload', () => {
    const p = PK.create(1, 20, {});
    p.status = 'slp'; p.statusTurns = 2;
    const back = PK.unpack(PK.pack(p), s.tid, s.sid);
    return back.statusTurns === 2 ? null
      : 'statusTurns came back ' + back.statusTurns + ', want 2';
  });

  /* toJSON wrote party and boxes and nothing else, and sleeping is exactly
   * when the save is taken - so depositing a Pokemon and going to bed
   * destroyed it. */
  check('the day-care is written to the save', () => {
    s.daycare = [PK.create(4, 10, {})];
    const blob = JSON.parse(JSON.stringify(s.toJSON(G.world)));
    s.daycare = [];
    return (blob.daycare && blob.daycare.length === 1) ? null : 'daycare missing from the save';
  });

  console.log('\n--- Gen 3 data, not today\'s data ---');

  check('move powers are the Generation 3 values', () => {
    const want = { 'Flamethrower': 95, 'Ice Beam': 95, 'Thunderbolt': 95,
                   'Hydro Pump': 120, 'Blizzard': 120, 'Fire Blast': 120,
                   'Tackle': 35, 'Thrash': 90, 'Jump Kick': 70, 'Dig': 60,
                   'Leech Life': 20, 'Knock Off': 20, 'Crabhammer': 90 };
    const wrong = [];
    for (const n in want) {
      const m = mv(n);
      if (!m) { wrong.push(n + ' missing'); continue; }
      if (m.p !== want[n]) wrong.push(n + ' ' + m.p + ' (want ' + want[n] + ')');
    }
    return wrong.length ? wrong.join(', ') : null;
  });
  check('base stats are the Generation 3 values', () => {
    const want = { 12: [60, 45, 50, 80, 80, 70], 25: [35, 55, 30, 50, 40, 90],
                   65: [55, 50, 45, 135, 85, 120], 76: [80, 110, 130, 55, 65, 45],
                   103: [95, 95, 85, 125, 65, 55] };
    const wrong = [];
    for (const id in want) {
      const b = window.ISL_POKE_DATA.mon[id].b;
      if (b.join(',') !== want[id].join(',')) {
        wrong.push(window.ISL_POKE_DATA.mon[id].n + ' ' + b.join(','));
      }
    }
    return wrong.length ? wrong.join(' | ') : null;
  });
  check('Growth raises Special Attack only, and it raises the USER', () => {
    const m = mv('Growth');
    if (!m || !m.sc) return 'Growth has no stat change';
    if (m.sc.length !== 1) return 'Growth changes ' + m.sc.length + ' stats, want 1';
    if (!m.ss) return 'Growth targets the opponent';
    return null;
  });

  console.log('\n' + (fails ? fails + ' REGRESSION(S)' : 'NO REGRESSIONS'));
  process.exit(fails ? 1 : 0);
}
