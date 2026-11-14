// Generates js/sl/ground-sl.js from the beautified Saltline bundle: puddle mask + detail textures, the wet
// ground shader (puddles, soak band, damp halo, rain rings, planar mirror lookup), the planar reflection pass,
// and the rain streak / splash particles. Harbour-specific pieces are replaced for the Ga Chìm freight yard:
// mask rectangle, puddle basins and height field (aisle ruts + flooded low ground instead of quay ruts and
// ramp), no painted marks, no quay concrete, ground plane size.
// Usage: node tools/port-sl-ground.js [D:/ref-saltline-gh/work/game.pretty.js]
'use strict';
const path = require('path');
const { readBundle, replaceAll, replaceFunction, writeModule } = require('./sl-port-lib.js');
const SRC = process.argv[2] || 'D:/ref-saltline-gh/work/game.pretty.js';
const OUT = path.join(__dirname, '..', 'js', 'sl', 'ground-sl.js');
const { alias, slice } = readBundle(SRC);

// yard layout (js/level.js): tracks along z at these x, flood box x -28..14, z -112..-66
const TRACK_X = [-24, -18.5, -13, -7.5, -2, 3.5, 9];
const AISLES = [-27, ...TRACK_X.slice(1).map((x, i) => (x + TRACK_X[i]) / 2), 12];
let seed = 20261114;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const basins = [];
for (let n = 0; n < 46; n++) {
  const ax = AISLES[Math.floor(rnd() * AISLES.length)];
  const onAisle = rnd() < 0.7;
  const x = onAisle ? ax + (rnd() - 0.5) * 1.2 : -44 + rnd() * 70;
  const z = -128 + rnd() * 178;
  basins.push([+x.toFixed(2), +z.toFixed(2), +(onAisle ? 0.7 + rnd() * 0.8 : 1.4 + rnd() * 2.6).toFixed(2), +(onAisle ? 2 + rnd() * 5 : 1.2 + rnd() * 2.4).toFixed(2), +(0.16 + rnd() * 0.1).toFixed(3)]);
}

let code = slice(38275, 38874) + '\n' + slice(39066, 39301);
code = replaceAll(code, [
  ['Li = {\n      x0: -44,\n      z0: -40,\n      size: 80\n    },', 'Li = {\n      x0: -60,\n      z0: -140,\n      size: 200\n    },'],
  ['float conc = smoothstep(15.6, 16.6, gxz.x + (d1.g - 0.5) * 0.6);', 'float conc = 0.0;'],
  ['new rn(190, 320, 1, 1).rotateX(-Math.PI / 2).translate(-65, 0, 0)', 'new rn(520, 520, 1, 1).rotateX(-Math.PI / 2).translate(-10, 0, -70)'],
], 'ground');
// basin table
code = code.replace(/Sb = \[\n[\s\S]*?\n {4}\],\n {4}Tb = 1,/, () => `Sb = ${JSON.stringify(basins)},\n    Tb = 1,`);
if (!code.includes(JSON.stringify(basins))) throw new Error('basin table not replaced');
code = replaceFunction(code, 'SR', `  function SR(i, e) {
    let t = .5 + (fs(i / 8.5, e / 8.5, 11, 4) - .47) * .3 + (fs(i / 2.4, e / 2.4, 23, 3) - .5) * .14;
    for (let n = 0; n < Sb.length; n++) {
      let s = Sb[n], o = (i - s[0]) / (s[2] * Tb), r = (e - s[1]) / (s[3] * Tb), a = o * o + r * r;
      a < 9 && (t -= (s[4] + ER) * Math.exp(-a * a))
    }
    // tyre ruts along the aisles between tracks, broken up along their length
    for (let k = 0; k < GC_AISLES.length; k++) {
      let n = .5 + .5 * Ab(e / 6, k * 3.1, 5), on = fl(.3, .55, fs(e / 9, k * 7.7, 19, 2));
      for (let q = -1; q <= 1; q += 2) { let d = (i - GC_AISLES[k] - q * .62) / .38; t -= .12 * (.55 + .45 * n) * on * Math.exp(-d * d) }
    }
    // flooded low ground in the middle of the yard, ragged edge
    let fd = Math.max(-28 - i, i - 14, -112 - e, e + 66) + (fs(i / 7, e / 7, 61, 3) - .5) * 9;
    return t -= .34 * (1 - fl(-4, 3, fd)), t
  }
  var GC_AISLES = ${JSON.stringify(AISLES)};`);
code = replaceFunction(code, 'Pb', `  function Pb(i, e = 1) {
    let t = document.createElement("canvas");
    t.width = t.height = 64;
    let n = t.getContext("2d");
    n.fillStyle = "#000", n.fillRect(0, 0, 64, 64);
    let c = new xs(t);
    return c.anisotropy = e, c
  }`);

const r = writeModule({
  out: OUT, alias, code,
  credit: { tool: 'tools/port-sl-ground.js' },
  imports: "import * as THREE from '../../vendor/three.module.min.js';\nimport { SUN_DIR, SUN_COLOR, PALETTE } from '../sky.js';\nconst Mn = { dir: SUN_DIR, color: SUN_COLOR };\nconst en = { zenith: PALETTE.zen, horizon: PALETTE.hor, horizonAway: PALETTE.horAway, fog: PALETTE.fog };",
  provided: new Set(['Mn', 'en']),
  exportsLine: 'export { Rb as buildMask, Cb as buildDetail, N1 as dataTexture, Pb as buildMarks, Ib as buildApron, zb as buildPlanar, Nb as buildRain, U1 as sampleMask, Li as MASK_RECT };',
});
console.log('wrote', OUT, r);
