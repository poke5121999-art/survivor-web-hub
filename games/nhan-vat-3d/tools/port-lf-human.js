// Generates lib/lf/human.js from Lanternfall src/20-human.js (humanRig, COL palette, the HW wardrobe namespace with
// body tables TP/AP/LP and every body/gear builder, BASE_STANCE, stance) plus src/20b-wardrobe.js (helms, hat, veil,
// fur mantle, bow, arrows, quiver, satchel, flask, pack, staff, bell sleeve), which adds to HW.
// Usage: node tools/port-lf-human.js [outDir=lib/lf]
'use strict';
const L = require('./lf-port-lib.js');
module.exports = () => {
  const a = L.readSrc('src/20-human.js').slice(1, 304), b = L.readSrc('src/20b-wardrobe.js').slice(1, 116);
  for (const k of ['function humanRig(o)', 'const HW = (function () {', 'H.torso = function', 'const BASE_STANCE =']) if (!a.includes(k)) throw new Error('human anchor missing: ' + k);
  for (const k of ['const H = HW;', 'H.bellSleeve = function']) if (!b.includes(k)) throw new Error('wardrobe anchor missing: ' + k);
  return { name: 'human', out: 'human.js', tool: 'tools/port-lf-human.js', from: [['src/20-human.js', 1, 304], ['src/20b-wardrobe.js', 1, 116]], code: a + '\n' + b };
};
if (require.main === module) L.run('human');
