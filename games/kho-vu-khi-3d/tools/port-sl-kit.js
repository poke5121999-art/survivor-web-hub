// Generates the two Saltline modules this kit is built on, straight from the beautified Saltline bundle:
//   js/sl/gun-sl.js  : geometry utils, the PAC-9 part helpers (bevelled extrusions, lathes, pins, slots), the PAC-9
//                      part builder w_(), markings atlas, reflex-sight glass and the weapon micro-detail shader Bf().
//   js/sl/mats-sl.js : the [mats] module: GPU-baked texture sets (wood, rust, paint, brushed, fabric...), the
//                      MeshStandardMaterial patch (triplanar, wetness, macro variation), the material table and decals.
// Saltline is by Felix Rieseberg (claude.ai artifact BGY1SztrAYcJQHSsnHHGmp). The code and numbers are kept; minified
// three.js aliases are renamed and engraved/brand text is replaced. Generated files are never edited by hand.
// Usage: node tools/port-sl-kit.js [D:/ref-saltline-gh/work/game.pretty.js]
'use strict';
const path = require('path');
const { readBundle, replaceAll, writeModule } = require('./sl-port-lib.js');
const SRC = process.argv[2] || process.env.SALTLINE_PRETTY || 'D:/ref-saltline-gh/work/game.pretty.js';
const B = readBundle(SRC);
const OUT = path.join(__dirname, '..', 'js', 'sl');
const lineOf = (needle, from = 1) => { const i = B.lines.findIndex((l, k) => k >= from - 1 && l.startsWith(needle)); if (i < 0) throw new Error('anchor line missing: ' + needle); return i + 1; };
const expect = (n, needle) => { if (!B.lines[n - 1].includes(needle)) throw new Error(`line ${n} moved, expected "${needle}"`); return n; };

const credit = { tool: 'tools/port-sl-kit.js' };
const imports3 = "import * as THREE from '../../vendor/three.module.min.js';";

// ---------- gun-sl.js ----------
const U0 = expect(24100, 'function sa('), U1 = expect(24306, '  }');  // mergeGeometries, Wi, ot, Fn, Dc, Lc, Ii
const H0 = expect(45296, 'var im ='), H1 = expect(46065, 'var Kc');      // helpers, mi constants, w_() parts, Kc
const M0 = expect(46601, 'var hm ='), M1 = expect(46806, '  }');              // markings atlas TC, quads F_, sight glass U_
const D0 = expect(46886, 'var Wv ='), D1 = expect(46948, '  }');              // rain uniform + micro-detail patch Bf
let gun = [B.slice(U0, U1), B.slice(H0, H1), B.slice(M0, M1), B.slice(D0, D1)].join('\n');
gun = gun.replace(/,\s*$/, ';');
// marking quad layout used by the viewmodel (dm(), 47055-47078): [atlas key, x, y, fwd, height, side]
const L0 = expect(47055, 'v = F_(['), L1 = expect(47078, '["r12"');
gun += '\n  var MARK_LAYOUT = [\n' + B.slice(L0 + 1, L1) + '\n  ];';
gun = replaceAll(gun, [
  ['name: "PAC-9 Longshore"', 'name: "TR-9 Tideline"'],
  ['"PAC-9"', '"TR-9"'],
  ['LONGSHORE ARMS WORKS  \\xB7  SALTLINE', 'KHO ARMS WORKS  \\xB7  REPLICA KIT'],
  ['SN PA-004217', 'SN KV-310877'],
  ['PROPERTY OF PORT AUTHORITY \\u2014 BERTH 4 ARMOURY', 'PROPERTY OF DEPOT 3 \\u2014 FIELD ARMOURY'],
  ['"B4-07"', '"D3-12"'],
  ['PA-REG 44/7', 'KV-REG 31/8'],
  ['"HX-2 REFLEX"', '"RD-6 REFLEX"'],
], 'gun rebrand');
const gunHead = imports3 + "\nimport { SUN_DIR, SUN_COLOR, PALETTE } from '../sky.js';\n" +
  'const Mn = { dir: SUN_DIR, color: SUN_COLOR };\n' +
  'const en = { zenith: PALETTE.zen, horizon: PALETTE.hor, horizonAway: PALETTE.horAway, fog: PALETTE.fog };';
const r1 = writeModule({
  out: path.join(OUT, 'gun-sl.js'), credit, alias: B.alias,
  imports: gunHead, provided: new Set(['Mn', 'en']), code: gun,
  exportsLine: 'export { sa as mergeGeometries, Wi as roundedBox, ot as cylinderUV, Fn as tubePath, Ii as mergeParts, im as hash3, cC as boxEdge, b_ as bevelEdge, sm as paintVerts, Rt as box, hC as shapeOf, __ as extrudeShape, M_ as flatSides, xr as sidePlate, qo as railProfile, Cn as lathe, Fi as pin, Dv as slot, fC as chamferRect, mi as GUN, w_ as buildRifleParts, Kc as triCount, hm as MARK_ATLAS, TC as markingsTexture, F_ as markingQuads, U_ as sightGlass, Wv as GUN_WET, Bf as microDetail, MARK_LAYOUT };',
});
console.log('gun-sl.js', r1);

// ---------- mats-sl.js ----------
const A0 = expect(26265, 'var Qy ='), A1 = lineOf('  function wA(', A0) - 1;
let mats = B.slice(A0, A1);
mats = replaceAll(mats, [
  ['"NORDKAP LINE", "ARCTIC  \\xB7  ATLANTIC  \\xB7  FEEDER"', '"KESTREL LINE", "COASTAL  \\xB7  FEEDER"'],
  ['"TERN OCEANIC", "CONTAINER SERVICES"', '"DELTA FREIGHT", "CONTAINER SERVICES"'],
  ['"AUREL PACIFIC", "DEEP SEA  \\xB7  REEFER  \\xB7  BULK"', '"RIVERMARK", "BULK  \\xB7  REEFER"'],
  ['"HOLMGARD", "INTERMODAL  FREIGHT"', '"NAM SON", "INTERMODAL  FREIGHT"'],
  ['"BERTH 4"', '"DEPOT 3"'],
], 'mats rebrand');
const r2 = writeModule({
  out: path.join(OUT, 'mats-sl.js'), credit, alias: B.alias,
  imports: imports3, provided: new Set(), code: mats,
  exportsLine: 'export { Gg as createMats, h3 as applyPatch, l1 as MATERIALS, c3 as TEXTURE_SETS, c1 as planeUV, MA as sphereUV };',
});
console.log('mats-sl.js', r2);

// ---------- render-sl.js ----------
// sky shader + env capture (24366-24550), shadow frustum fit Gy + PCSS chunk qy (24551-24655),
// post shader strings: bloom down/up, streak, grade (ACES/AgX mix, split tone, vignette), final FXAA/grain (24656-25069)
const R0 = expect(24366, 'var Ug ='), R1 = expect(25069, '}`;');
let rend = B.slice(R0, R1);
const r3 = writeModule({
  out: path.join(OUT, 'render-sl.js'), credit, alias: B.alias,
  imports: imports3 + "\nimport { SUN_DIR, SUN_COLOR, PALETTE } from '../sky.js';\n" +
    'const Mn = { dir: SUN_DIR, color: SUN_COLOR, intensity: 9 };\n' +
    'const en = { zenith: PALETTE.zen, horizon: PALETTE.hor, horizonAway: PALETTE.horAway, fog: PALETTE.fog };',
  provided: new Set(['Mn', 'en']), code: rend,
  exportsLine: 'export { Hy as createSky, W6 as skyUniforms, Vy as captureEnv, Gy as fitSunShadow, qy as installPCSS, Xy as removePCSS, G6 as POST_VERT, Js as POST_COMMON, Og as POST_EXPOSURE, J6 as BLOOM_DOWN, K6 as BLOOM_UP, Q6 as STREAK, nA as GRADE, iA as FINAL };',
});
console.log('render-sl.js', r3);
