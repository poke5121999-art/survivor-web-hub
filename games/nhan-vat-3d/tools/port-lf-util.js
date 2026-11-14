// Generates lib/lf/util.js from Lanternfall src/00-util.js: math helpers (clamp/sat/lerp/smooth), mulberry PRNG,
// hash + value noise + fbm, C(hex) sRGB->linear, mixC, the road/terrain functions and the easing table.
// Dropped: line 3 (window.LF global) and lines 9-10 (QS/qnum read location.search); the host shim lib/lf-host.js
// provides LF, QS and qnum instead.
// Usage: node tools/port-lf-util.js [outDir=lib/lf]
'use strict';
const L = require('./lf-port-lib.js');
module.exports = () => {
  const s = L.readSrc('src/00-util.js');
  const head = s.slice(4, 8), rest = s.slice(11, 66);
  for (const a of ['const PI = Math.PI, TAU = PI * 2;', 'function mulberry(seed)', 'function C(hex)', 'const ease = {']) if (!(head + rest).includes(a)) throw new Error('util anchor missing: ' + a);
  return { name: 'util', out: 'util.js', tool: 'tools/port-lf-util.js', from: [['src/00-util.js', 4, 8], ['src/00-util.js', 11, 66]], code: head + '\n' + rest };
};
if (require.main === module) L.run('util');
