// Generates lib/lf/kit.js from Lanternfall src/10-kit.js (whole file): material type ids, makeRig, the Geo mesh builder
// (surf/loft/lathe/sphere/box/tube with metre UVs, thin shells, caps, per-vertex bone functions), jb/chainY weight
// helpers, the shared surface shader (SURF_*) + makeSurfMat, and the CPU-skinned Figure. No text needs replacing:
// the r170 gate in lf-port-lib checks every THREE name and every patched shader chunk.
// Usage: node tools/port-lf-kit.js [outDir=lib/lf]
'use strict';
const L = require('./lf-port-lib.js');
module.exports = () => {
  const code = L.readSrc('src/10-kit.js').slice(1, 404);
  for (const a of ['class Geo {', 'class Figure {', "m.customProgramCacheKey = () => 'lfsurf';", "'#include <normal_fragment_maps>'", 'skin() {']) if (!code.includes(a)) throw new Error('kit anchor missing: ' + a);
  return { name: 'kit', out: 'kit.js', tool: 'tools/port-lf-kit.js', from: [['src/10-kit.js', 1, 404]], code };
};
if (require.main === module) L.run('kit');
