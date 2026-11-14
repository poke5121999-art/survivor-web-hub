// Generates lib/lf/post.js from Lanternfall src/40-post.js (whole file): HDR scene target (MSAA, half float, depth
// texture), paired-sample SSAO + height fog + analytic point-light in-scatter, 4-level bloom, DOF, AgX and the grade.
// Host hook: the drawing size comes from LF.viewW()/LF.viewH() instead of window.innerWidth/innerHeight, so a page
// can put the canvas in a panel (lib/lf-host.js defaults them to the window size).
// Usage: node tools/port-lf-post.js [outDir=lib/lf]
'use strict';
const L = require('./lf-port-lib.js');
module.exports = () => {
  let code = L.readSrc('src/40-post.js').slice(1, 158);
  code = L.replaceAll(code, [
    ['LF.gfx = (function () {', 'const gfx = LF.gfx = (function () {', 1],
    ['const cw = Math.max(2, window.innerWidth), ch = Math.max(2, window.innerHeight)', 'const cw = Math.max(2, LF.viewW()), ch = Math.max(2, LF.viewH())', 1],
  ], 'post');
  // r158 and r170 both treat this as "renderer writes linear HDR, the final pass grades and gamma-encodes itself"
  if (!code.includes('renderer.toneMapping = THREE.NoToneMapping; renderer.outputColorSpace = THREE.LinearSRGBColorSpace;')) throw new Error('post anchor missing: linear output setup');
  return { name: 'post', out: 'post.js', tool: 'tools/port-lf-post.js', from: [['src/40-post.js', 1, 158]], code };
};
if (require.main === module) L.run('post');
