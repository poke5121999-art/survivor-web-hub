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
function check(where, name) {
  if (!name) return;
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
  for (const m of objArt[0].matchAll(/'([^']+)'/g)) {
    const n = m[1];
    // keys and values are both quoted; only values are frame names, and a key
    // that happens to be a real frame does no harm
    if (!frames.has(n) && /^[A-Z]/.test(n)) bad.push('game.OBJ_ART -> ' + n);
  }
}
const cropArt = gsrc.match(/var CROP_ART = \{[\s\S]*?\n  \};/);
if (cropArt) {
  for (const m of cropArt[0].matchAll(/'([A-Z][^']*)'/g)) check('game.CROP_ART', m[1]);
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
console.log('all art references resolve (' + frames.size + ' frames in atlas)');
