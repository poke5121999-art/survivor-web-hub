// Generates lib/lf/fx.js from Lanternfall src/50-fx.js (whole file): additive and soft point-sprite particle pools
// (sparks, embers, dust, smoke, chips, frost, motes in the lantern light, drizzle), flash light, rings, arcs, ground
// marks, projectiles, loot and the 2D overlay. Host hook: overlay size from LF.viewW()/LF.viewH(); the page supplies
// a <canvas id="fx2d">. LF.fx is also exported as `fx`.
// Usage: node tools/port-lf-fx.js [outDir=lib/lf]
'use strict';
const L = require('./lf-port-lib.js');
module.exports = () => {
  let code = L.readSrc('src/50-fx.js').slice(1, 192);
  code = L.replaceAll(code, [
    ['LF.fx = (function () {', 'const fx = LF.fx = (function () {', 1],
    ['cv.width = Math.round(window.innerWidth * d); cv.height = Math.round(window.innerHeight * d);', 'cv.width = Math.round(LF.viewW() * d); cv.height = Math.round(LF.viewH() * d);', 1],
  ], 'fx');
  return { name: 'fx', out: 'fx.js', tool: 'tools/port-lf-fx.js', from: [['src/50-fx.js', 1, 192]], code };
};
if (require.main === module) L.run('fx');
