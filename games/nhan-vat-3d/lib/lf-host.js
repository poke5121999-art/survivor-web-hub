// Host shim for the generated Lanternfall modules in lib/lf/ (hand-written; lib/lf/ itself is generated, never edit it).
// It supplies the names Lanternfall took from its single-script globals:
//   THREE  three.js r170 (Lanternfall shipped r158)
//   LF     the namespace object (src/00-util.js:3 made it window.LF); generated modules hang LF.world, LF.gfx, LF.fx,
//          LF.HEROES, LF.MONSTERS, LF.gallery, LF.makeFig on it. Kept on window.LF too, for console debugging.
//   QS     URLSearchParams Lanternfall reads its tuning switches from (src/00-util.js:9). Defaults to the page URL;
//          a page can set window.LF_QS = '?...' before importing to override (or '' to ignore the URL).
//   qnum   numeric query lookup, same one-liner as src/00-util.js:10.
// Host hooks added by the generators (see tools/port-lf-post.js, port-lf-fx.js):
//   LF.viewW() / LF.viewH()  size of the drawing area in CSS px (Lanternfall used the window size).
import * as THREE from '../vendor/three.module.min.js';

const LF = (globalThis.LF = globalThis.LF || {});
const QS = new URLSearchParams(globalThis.LF_QS !== undefined ? globalThis.LF_QS : (globalThis.location ? location.search : ''));
const qnum = (k, d) => QS.has(k) && QS.get(k) !== '' && !isNaN(+QS.get(k)) ? +QS.get(k) : d;
if (!LF.viewW) LF.viewW = () => window.innerWidth;
if (!LF.viewH) LF.viewH = () => window.innerHeight;

export { THREE, LF, QS, qnum };
