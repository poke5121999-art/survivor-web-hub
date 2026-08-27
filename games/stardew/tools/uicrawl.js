/*
 * uicrawl.js - tap every button in every panel, and check what moved.
 *
 *   node tools/uicrawl.js .
 *
 * smoke.js proves the game can be DRIVEN. This proves the game can be TAPPED:
 * it opens every panel the UI can produce, finds every element the render
 * actually wired a handler to, clicks it the way a thumb would, and reports
 * anything that changed. It exists because the whole class of bug that a
 * scripted playthrough cannot see lives here -
 *
 *   - gold or an item appearing out of nothing, which is what an item
 *     duplication bug looks like from outside
 *   - a handler that throws, which on a canvas game just stops the screen
 *   - a panel whose close path leaves game.modal above zero, freezing the
 *     world with nothing left on screen to close
 *
 * Every button is tapped from a FRESH open of its panel, because one tap can
 * invalidate the list the next tap would have used - a sold stack, a consumed
 * item, a re-sorted row.
 *
 * Output is deliberately quiet: a panel with nothing to report prints one
 * line. Read the lines that are not "no error, no state change".
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const H = require('./harness.js');

const ROOT = process.argv[2] || '.';
const { window, document } = H;

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const files = [...html.matchAll(/<script src="([^"?]+)/g)].map(m => m[1]);
for (const f of files) {
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
}

window.ISL_ATLAS.load('art/pki/', function (err) {
  if (err) { console.log('ATLAS FAIL', err); process.exit(1); }
  run();
});

/* The stub's querySelectorAll returns nothing, so walk the tree by hand. That
 * is fine - we want every node carrying an onclick, which is exactly what the
 * game binds, and no CSS selector describes that. */
function tappable(node, out) {
  out = out || [];
  if (!node) return out;
  if (node.onclick) out.push(node);
  const kids = node.children || [];
  for (let i = 0; i < kids.length; i++) tappable(kids[i], out);
  return out;
}
function label(el) {
  const t = String(el.textContent || '').replace(/\s+/g, ' ').trim();
  return t.length > 30 ? t.slice(0, 30) + '…' : (t || '<' + (el.tagName || '?') + '>');
}

function run() {
  const view = document.createElement('canvas');
  view.width = 430; view.height = 860;
  const G = new window.SDV_GAME.Game(view);
  G.sim._game = G;
  window.GAME = G;
  window.ISL_UI.build(G);
  G.start(true);

  const U = window.ISL_UI, PU = window.ISL_POKEUI,
        PL = window.ISL_PLACES, FQ = window.ISL_FARMQOL, PK = window.ISL_POKE;
  const s = G.sim;

  const errs = [];
  /* Errors thrown out of a tap handler must be COUNTED, not fatal - one bad
   * button should not hide the ninety good ones behind it. */
  function guard(fn) {
    try { fn(); return null; } catch (e) { return e; }
  }

  function quiet() {
    while (window.ISL_TUTORIAL.isOpen()) window.ISL_TUTORIAL.dismiss();
    U.closeAll();
  }

  // ---- a state rich enough that every panel has something in it ----
  quiet();
  window.ISL_TUTORIAL.skipAll();
  s.rank = 40; s.gold = 500000;
  window.ISL_ISLANDS.list.forEach(i => { if (i.unlock && i.unlock.rank) G.buyIsland(i.id); });
  ['Parsnip Seeds', 'Wood', 'Stone', 'Copper Ore', 'Milk', 'Egg', 'Poké Ball',
   'Potion', 'Sprinkler', 'Chest', 'Furnace', 'Fiber', 'Hay', 'Parsnip',
   'Quartz', 'Earth Crystal', 'Bait', 'Geode', 'Rare Candy', 'Fire Stone']
    .forEach(n => { try { s.give(n, 20); } catch (e) {} });
  /* One good stack in front of a plain one of the SAME item, which is the
   * shape every quality-laundering bug needs to show itself. */
  s.give('Starfruit', 1, 3);
  s.give('Starfruit', 8, 0);
  [25, 4, 7, 1, 143, 92].forEach(id => { try { s.party.push(PK.create(id, 25, {})); } catch (e) {} });
  s.chest = s.chest || [];
  s.give('Ruby', 4, 0, s.chest);
  quiet();

  /* Every panel starts from the SAME bag, party and purse. Without this the
   * crawl reads its own leftovers - the chest panel empties the bag, and then
   * the six panels after it report "no buttons" and look fine. */
  function restore() {
    s.gold = 500000;
    s.energy = s.maxEnergy;
    s.inventory.length = 0;
    ['Parsnip Seeds', 'Wood', 'Stone', 'Copper Ore', 'Milk', 'Egg', 'Poké Ball',
     'Potion', 'Sprinkler', 'Chest', 'Furnace', 'Fiber', 'Hay', 'Parsnip',
     'Quartz', 'Earth Crystal', 'Bait', 'Geode', 'Rare Candy', 'Fire Stone']
      .forEach(n => { try { s.give(n, 20); } catch (e) {} });
    s.give('Starfruit', 1, 3);
    s.give('Starfruit', 8, 0);
    s.chest.length = 0;
    s.give('Ruby', 4, 0, s.chest);
    s.shipped.length = 0;
    s.party.length = 0;
    [25, 4, 7, 1, 143, 92].forEach(id => { try { s.party.push(PK.create(id, 25, {})); } catch (e) {} });
    (s.boxes || []).length = 0;
    s.daycare = [];
  }
  s.invSize = 36;
  restore();

  console.log('state: owned=' + Object.keys(s.owned).length +
              ' party=' + s.party.length + ' bag=' + s.inventory.length +
              ' gold=' + s.gold);

  // ---------------------------------------------------------------- panels
  const PANELS = [
    ['bag',        () => U.openBag(G)],
    ['map',        () => U.openMap(G)],
    ['menu',       () => U.openMenu(G)],
    ['handbook',   () => U.openHandbook(G)],
    ['chest',      () => U.openChest(G, { kind: 'chest' })],
    ['bin',        () => U.openBin(G)],
    ['seedPicker', () => U.openSeedPicker(G, 50, 60)],
    ['party',      () => PU.openParty(G)],
    ['summary',    () => PU.openSummary(G, s.party[0], 0, function () {})],
    ['box',        () => PU.openBox(G)],
    ['dex',        () => PU.openDex(G)],
    ['judge',      () => PU.openJudge(G)],
    ['evTrainer',  () => PU.openEvTrainer(G)],
    ['mint',       () => PU.openMint(G)],
    ['farm',       () => FQ.openPanel(G)],
    ['orders',     () => FQ.openOrders(G)],
    ['workshop',   () => PL.openWorkshop(G)],
    ['kitchen',    () => PL.openKitchen(G)],
    ['museum',     () => PL.openMuseum(G)],
    ['bundles',    () => PL.openBundles(G)],
    ['toolUpgrade',() => PL.openToolUpgrade(G)],
    ['shrine',     () => PL.openShrine(G, { kind: 'shrine' })],
    ['daycare',    () => PL.openDaycare(G)],
    ['mail',       () => PL.openMail(G)],
    ['geode',      () => PL.openGeode(G)],
    ['bait',       () => PL.openBait(G)]
  ];
  ['seeds', 'general', 'lumber', 'animals', 'fish', 'smith', 'tavern',
   'pokemart', 'adventure', 'beach'].forEach(id => {
    PANELS.push(['shop:' + id, () => { s.time = 9 * 60; U.openShop(G, id); }]);
  });
  /* openNpc takes the LIVE villager - the one walking a schedule - not the id
   * of its definition. ISL_NPC.build populates them. */
  window.ISL_NPC.build(G);
  (G.world.npcs || []).slice(0, 4).forEach(v => {
    PANELS.push(['npc:' + v.name, () => U.openNpc(G, v)]);
  });

  function snap() {
    let qty = 0;
    s.inventory.forEach(it => { qty += it.qty; });
    return {
      gold: s.gold, energy: Math.round(s.energy), items: qty,
      slots: s.inventory.length, party: s.party.length,
      box: (s.boxes || []).length, chest: (s.chest || []).length,
      shipped: (s.shipped || []).length, museum: (s.museum || []).length,
      owned: Object.keys(s.owned).length, rank: s.rank
      /* modal is deliberately NOT here. A button that opens a sub-panel or
       * closes its own is doing its job, and reporting it buried the rows
       * that mattered. The close-path section below checks modal properly. */
    };
  }
  function delta(a, b) {
    const out = [];
    for (const k in a) if (a[k] !== b[k]) out.push(k + ' ' + a[k] + '→' + b[k]);
    return out.join('  ');
  }
  /* The layer the panels are appended to. Everything the crawler looks at
   * lives under here. */
  function top() {
    const layer = document.getElementById('layer');
    const kids = (layer && layer.children) || [];
    return kids.length ? kids[kids.length - 1] : null;
  }

  let tapped = 0, noisy = 0;
  console.log('\n=== PANEL CRAWL — every button, each from a fresh open ===');

  PANELS.forEach(([name, open]) => {
    quiet();
    restore();
    const boom = guard(open);
    if (boom) { console.log('  ' + name + ': OPEN THREW — ' + boom.message); errs.push(name); return; }
    const probe = top();
    if (!probe) { console.log('  ' + name + ': opened nothing'); return; }
    const total = tappable(probe).length;
    if (!total) { console.log('  ' + name + ': no buttons'); quiet(); return; }

    const notes = [];
    const cap = Math.min(total, 30);
    for (let i = 0; i < cap; i++) {
      quiet();
      restore();
      if (guard(open)) { notes.push('reopen threw'); break; }
      /* Snapshot AFTER opening. Taken before, every single row reported
       * "modal 0→1" - which is just the panel being open - and the real
       * findings were lost in it. */
      const before = snap();
      const panel = top();
      if (!panel) break;
      const list = tappable(panel);
      if (i >= list.length) break;
      const lb = label(list[i]);
      const e = guard(() => list[i].click());
      tapped++;
      if (e) { notes.push('[' + lb + '] THREW ' + e.message); errs.push(name + '/' + lb); continue; }
      while (window.ISL_TUTORIAL.isOpen()) window.ISL_TUTORIAL.dismiss();
      const d = delta(before, snap());
      if (d) notes.push('[' + lb + '] ' + d);
    }
    quiet();
    if (notes.length) noisy++;
    console.log('  ' + name + ': ' + total + ' buttons, tapped ' + cap +
      (notes.length ? '\n      ' + notes.join('\n      ') : '   — nothing thrown, nothing changed'));
  });

  // ------------------------------------------------------------ close paths
  console.log('\n=== CLOSE PATHS — the panel\'s own ✕, not closeAll ===');
  const leaks = [];
  PANELS.forEach(([name, open]) => {
    quiet();
    const base = G.modal;
    if (guard(open)) return;
    if (G.modal <= base) { leaks.push(name + ': opening did not raise modal'); return; }
    const panel = top();
    const x = tappable(panel).find(el => String(el.textContent || '').trim() === '✕');
    if (!x) { quiet(); return; }
    guard(() => x.click());
    if (G.modal !== base) leaks.push(name + ': ✕ left modal at ' + G.modal + ' (was ' + base + ')');
    quiet();
  });
  console.log(leaks.length ? '  ' + leaks.join('\n  ')
                           : '  every panel returns modal to where it started');

  // ------------------------------------------------------- open/close churn
  console.log('\n=== CHURN — 200 open/close cycles ===');
  quiet();
  const m0 = G.modal;
  for (let k = 0; k < 200; k++) {
    guard(PANELS[k % PANELS.length][1]);
    quiet();
  }
  console.log('  modal ' + m0 + ' → ' + G.modal +
              (G.modal !== m0 ? '   *** LEAK ***' : '   (clean)'));

  // -------------------------------------------------- still playable after
  quiet();
  const px = G.player.x;
  G.stick.dx = 1; G.stick.dy = 0;
  for (let i = 0; i < 90; i++) G.frame(G.time + 16);
  G.stick.dx = 0; G.stick.dy = 0;
  console.log('\n=== AFTER EVERYTHING ===');
  console.log('  player still moves: ' + (Math.abs(G.player.x - px) > 0.05));
  console.log('  modal ' + G.modal + ' | busy ' + G.busy() + ' | gold ' + s.gold +
              ' | bag ' + s.inventory.length + '/' + s.invSize);

  console.log('\ntapped ' + tapped + ' buttons across ' + PANELS.length + ' panels; ' +
              noisy + ' panel(s) reported something; ' + errs.length + ' threw.');
  process.exit(errs.length ? 1 : 0);
}
