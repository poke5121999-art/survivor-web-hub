// Generates lib/lf/monsters.js from Lanternfall src/22-monsters.js (whole file): bipedRig, limb3, rockAt, the humanoid
// monsters (peatwight, thornling, rustbound/barrowking, cairnback/mossjaw), the quadruped rig + QuadAnim
// (gloamhound/hollowstag) and the wisp + WispAnim. LF.MONSTERS / LF.MON_ORDER are also exported as MONSTERS / MON_ORDER.
// Usage: node tools/port-lf-monsters.js [outDir=lib/lf]
'use strict';
const L = require('./lf-port-lib.js');
module.exports = () => {
  let code = L.readSrc('src/22-monsters.js').slice(1, 384);
  code = L.replaceAll(code, [
    ['LF.MONSTERS = {};', 'const MONSTERS = LF.MONSTERS = {};', 1],
    ['LF.MON_ORDER = [', 'const MON_ORDER = LF.MON_ORDER = [', 1],
  ], 'monsters');
  return { name: 'monsters', out: 'monsters.js', tool: 'tools/port-lf-monsters.js', from: [['src/22-monsters.js', 1, 384]], code };
};
if (require.main === module) L.run('monsters');
