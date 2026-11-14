// Generates js/sl/fx-sl.js from the beautified Saltline bundle: particle pools (lit smoke/dust flipbooks and an
// additive pool for sparks, streaks, flashes, rings), tracers, impact table per surface, muzzle flash, splashes,
// debris, brass shells, decals and persistent emitters. Nothing level-specific needs replacing.
// Usage: node tools/port-sl-fx.js [D:/ref-saltline-gh/work/game.pretty.js]
'use strict';
const path = require('path');
const { readBundle, writeModule } = require('./sl-port-lib.js');
const SRC = process.argv[2] || 'D:/ref-saltline-gh/work/game.pretty.js';
const OUT = path.join(__dirname, '..', 'js', 'sl', 'fx-sl.js');
const { alias, slice } = readBundle(SRC);
const code = slice(39420, 41201);
for (const anchor of ['async function Cf(i) {', 'var Z1 = class {', 'q1 = class']) if (!code.includes(anchor)) throw new Error('anchor missing: ' + anchor);
const r = writeModule({
  out: OUT, alias, code,
  credit: { tool: 'tools/port-sl-fx.js' },
  imports: "import * as THREE from '../../vendor/three.module.min.js';\nimport { SUN_DIR, SUN_COLOR, PALETTE } from '../sky.js';\nconst Mn = { dir: SUN_DIR, color: SUN_COLOR, intensity: 9 };\nconst en = { zenith: PALETTE.zen, horizon: PALETTE.hor, horizonAway: PALETTE.horAway, fog: PALETTE.fog };",
  provided: new Set(['Mn', 'en']),
  exportsLine: 'export { Cf as createSaltlineFx };',
});
console.log('wrote', OUT, r);
