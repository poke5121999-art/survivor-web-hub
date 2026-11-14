// Generates lib/lf/world.js from Lanternfall src/30-world.js (whole file): reaches (biome palettes), prop generators,
// road chunks, waylights, lights (hemisphere, moon, lantern, fill, fx), PMREM night-sky environment, the procedural
// ground + grass + sky materials, and the per-frame update. LF.world is also exported as `world`.
// Usage: node tools/port-lf-world.js [outDir=lib/lf]
'use strict';
const L = require('./lf-port-lib.js');
module.exports = () => {
  let code = L.readSrc('src/30-world.js').slice(1, 353);
  code = L.replaceAll(code, [
    ['LF.world = (function () {', 'const world = LF.world = (function () {', 1],
  ], 'world');
  for (const k of ['new THREE.PointLight(0xffb878, 40, 26, 1.25)', 'pm.fromScene(es, 0.04)', "LF.chunkBase = 0; LF.seed = qnum('seed', 7);"]) if (!code.includes(k)) throw new Error('world anchor missing: ' + k);
  return { name: 'world', out: 'world.js', tool: 'tools/port-lf-world.js', from: [['src/30-world.js', 1, 353]], code };
};
if (require.main === module) L.run('world');
