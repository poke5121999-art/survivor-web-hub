// Generates lib/lf/gallery.js from Lanternfall src/90-main.js: the prototype cache LF.makeFig (:5-10), the death
// effects stepDeath (:74-90) and the figure gallery LF.gallery (:258-288). They sit inside main's IIFE, where
// `W` is LF.world (:3); the generator re-declares that one binding. LF.gallery is also exported as `gallery`.
// Usage: node tools/port-lf-gallery.js [outDir=lib/lf]
'use strict';
const L = require('./lf-port-lib.js');
module.exports = () => {
  const s = L.readSrc('src/90-main.js');
  if (!s.slice(3, 3).includes('W = LF.world')) throw new Error('gallery anchor missing: W = LF.world (90-main.js:3)');
  let code = 'const W = LF.world; // 90-main.js:3\n' + s.slice(5, 10) + '\n' + s.slice(74, 90) + '\n' + s.slice(258, 288);
  code = L.replaceAll(code, [
    ['  LF.gallery = function (scene, cam) {', '  const gallery = LF.gallery = function (scene, cam) {', 1],
  ], 'gallery');
  for (const k of ['LF.makeFig = function (name, lantern)', 'function stepDeath(u, v, dt)', "W.lantern.position.set(cx + qnum('lx', -2.2), qnum('ly', 3.2), cz + qnum('lz', 0.8));"]) if (!code.includes(k)) throw new Error('gallery anchor missing: ' + k);
  return { name: 'gallery', out: 'gallery.js', tool: 'tools/port-lf-gallery.js', from: [['src/90-main.js', 3, 3], ['src/90-main.js', 5, 10], ['src/90-main.js', 74, 90], ['src/90-main.js', 258, 288]], code };
};
if (require.main === module) L.run('gallery');
