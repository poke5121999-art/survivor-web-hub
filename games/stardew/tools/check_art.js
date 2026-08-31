/*
 * check_art.js - every atlas frame name the game asks for, checked against the
 * atlas that actually shipped.
 *
 *   node tools/check_art.js
 *
 * A missing frame is invisible until somebody walks onto the island that uses
 * it, and then it is a magenta box with no clue which file named it. This
 * walks the data files and reports every name that is not in art/pki/pki.json,
 * with the file and field it came from.
 */
'use strict';
const fs = require('fs');

global.window = global;
require('../data/gamedata.js');
require('../data/pokedata.js');
require('../data/islands.js');
require('../data/npcs.js');
require('../data/tutorial.js');

const frames = new Set(Object.keys(JSON.parse(fs.readFileSync('art/pki/pki.json', 'utf8')).f));
const bad = [];
/* Every frame the game actually asks for, and who asks for it. This is the
 * REPLACEMENT LIST: art/CREDITS.txt tells whoever draws the new set to "run
 * node tools/check_art.js for the list", and until now the tool only ever
 * printed names on failure, so the documented workflow could not be followed.
 * `--list` prints it; `--list --json` prints it as data. */
const want = new Map();
function check(where, name) {
  if (!name) return;
  if (!want.has(name)) want.set(name, []);
  want.get(name).push(where);
  if (!frames.has(name)) bad.push(where + ' -> ' + name);
}

// islands: hand-placed object art, and the ground panels
const ISL = window.ISL_ISLANDS;
ISL.GROUND.forEach((g, i) => check('islands.GROUND[' + i + ']', g));
ISL.list.forEach(isl => {
  (isl.objs || []).forEach(o => check('island ' + isl.id + ' obj ' + o.kind, o.art));
});

// world scatter art
require('../js/world.js');
const SC = window.SDV_WORLD.SCATTER_ART;
for (const k in SC) (SC[k] || []).forEach(n => check('scatter ' + k, n));

// npc walking sprites and portraits
const NP = window.ISL_NPCS;
NP.order.forEach(id => {
  const d = NP.npcs[id];
  check('npc ' + id + '.art', d.art);
  check('npc ' + id + '.portrait', d.portrait);
});

// tutorial art
window.ISL_TUTORIAL_DATA.STEPS.forEach(s => {
  check('tutorial ' + s.id + '.who', s.who);
  (s.pages || []).forEach((p, i) => check('tutorial ' + s.id + '.pages[' + i + ']', p.art));
});

// item art map
require('../js/atlas.js');
require('../js/sprites.js');
require('../js/itemart.js');
const MAP = window.ISL_ITEMART.MAP;
for (const k in MAP) check('itemart ' + k, MAP[k]);
for (const k in window.ISL_ITEMART.BY_CAT) check('itemart cat ' + k, window.ISL_ITEMART.BY_CAT[k]);

// object art table lives inside game.js; pull it out by reading the source,
// because exporting it just for this check would be a worse trade
const gsrc = fs.readFileSync('js/game.js', 'utf8');
const objArt = gsrc.match(/var OBJ_ART = \{[\s\S]*?\n  \};/);
if (objArt) {
  /* Keys and values are both quoted, so take only what sits after a colon -
   * the values. The old rule was "starts with a capital", which silently
   * skipped real frame names like smithy_0 and let a typo in one through. */
  for (const m of objArt[0].matchAll(/:\s*'([^']+)'/g)) check('game.OBJ_ART', m[1]);
}
const cropArt = gsrc.match(/var CROP_ART = \{[\s\S]*?\n  \};/);
if (cropArt) {
  for (const m of cropArt[0].matchAll(/'([A-Z][^']*)'/g)) check('game.CROP_ART', m[1]);
}

/* drawNpc alternates Foo_0 -> Foo_1 while a villager walks, so the second
 * frame of every idle pair is part of the required set. */
const nsrc = fs.readFileSync('data/npcs.js', 'utf8');
for (const m of nsrc.matchAll(/art: '([^']+0)'/g)) {
  const alt = m[1].slice(0, -1) + '1';
  if (frames.has(alt)) check('npc idle frame 2', alt);
}

// mine art
const msrc = fs.readFileSync('js/mine.js', 'utf8');
for (const m of msrc.matchAll(/art: '([^']+)'/g)) check('mine art', m[1]);
for (const m of msrc.matchAll(/art: '([^']+)'/g)) { /* covered above */ }

// pokework icons
require('../js/poke.js');
require('../js/pokework.js');
window.ISL_POKEWORK.SKILLS.forEach(s => check('pokework ' + s.id + '.icon', s.icon));

if (bad.length) {
  console.log('MISSING FRAMES (' + bad.length + '):');
  bad.forEach(b => console.log('  ' + b));
  process.exit(1);
}

const TAB = String.fromCharCode(9), NL = String.fromCharCode(10);
if (process.argv.includes('--list')) {
  const atlas = JSON.parse(fs.readFileSync('art/pki/pki.json', 'utf8')).f;
  const names = [...want.keys()].sort();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(names.map(n => ({
      name: n, w: atlas[n][7], h: atlas[n][8], usedBy: want.get(n)
    })), null, 2));
  } else {
    console.log('FRAMES THE GAME ASKS FOR (' + names.length + ' of ' +
                frames.size + ' in the atlas):');
    console.log('# name' + TAB + 'w' + TAB + 'h' + TAB + 'first asked for by');
    names.forEach(n => {
      console.log(n + TAB + atlas[n][7] + TAB + atlas[n][8] + TAB + want.get(n)[0]);
    });
    console.log(NL + (frames.size - names.length) + ' frames in the atlas are ' +
                'referenced by nothing.');
    console.log('NOTE: some names contain a SPACE (e.g. "BaseGround0_forSliced 1"). ' +
                'A replacement PNG must keep it.');
  }
  process.exit(0);
}

console.log('all art references resolve (' + frames.size + ' frames in atlas)');
console.log('run with --list for the frame names a replacement set must provide');
