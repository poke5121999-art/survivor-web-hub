// Sheet row 3 (cells 33-51): throwing/hunting knives, hatchets, karambit, kukri, machete, steel, kunai, pan, shields
import { weapon } from '../lib/weapon.js';
import { C, knife, thrower, arc, teeth } from './common.js';
import { extrude } from '../lib/kit.js';

export function hatchet(k, o) {
  const len = o.len ?? 38;
  k.cyl(1.7, 1.45, len, { col: o.hcol ?? 0x3a2a24, t: 3, b: 0.4 });
  if (o.tape) k.tape(o.tape[0], o.tape[1], 1.6, { col: o.tapeCol, band: 1.5, tail: true });
  if (o.tape2) k.tape(o.tape2[0], o.tape2[1], 1.6, { col: o.tape2Col, band: 1.3 });
  const y = len - 6;
  k.box([3, 10, 3.2], { p: [-0.3, y + 6, 0], col: o.poll ?? C.steelD, t: 0, b: 0.5 });
  k.blade([[-3, y + 1], [-3, y + 12], [2, y + 12], [4, y + 14.5], [9.5, y + 17], [11.5, y + 6], [9.5, y - 5], [4, y - 2.5], [2, y]], { d: 1.7, b: 0.4, col: o.hcolr ?? 0xb5c1ca, t: 0 });
  if (o.red) k.box([5, 5, 2.4], { p: [-0.3, y + 10, 0], col: o.red, t: 1, b: 0.4 });
  k.grip([0, 12, 0]); k.tip([11.5, y + 6, 0]); k.edge([11.5, y - 4, 0], [11.5, y + 16, 0]);
}
function kunai(k, col) {
  k.fatBulge = true;
  k.hexRing(2.1, 1.1, 0.7, { p: [0, 2.1, 0], col: C.steel, t: 0 });
  k.tape(4.2, 11, 1.7, { col, band: 1.2, n: 6 });
  k.blade([[-1.4, 11], [1.4, 11], [4.2, 17], [0, 29], [-4.2, 17]], { d: 0.7, b: 0.25, col: 0x97b09e, t: 0 });
  k.box([0.5, 12, 1.0], { p: [0, 19, 0], col: C.steelD, t: 0, b: 0.15 });
  k.grip([0, 7, 0]); k.tip([0, 30, 0]); k.edge([4, 15.5, 0], [0.3, 28, 0]);
}
export function pan(k, o) {
  const rimCol = o.rim ?? 0x23242a, inCol = o.inside ?? 0x17181c;
  const prof = [[0, 0, 0], [9.5, 0, 0], [12, 3.2, 1], [12.8, 3.2, 1], [12.8, 3.7, 1], [11.6, 3.8, 1], [9, 0.8, 0], [0, 0.8, 0]];
  k.lathe(prof, { n: 14, smooth: false, col: rimCol, t: 0, r: [90, 0, 0], p: [0, 0, 0] });
  k.lathe([[0, 0.85], [9, 0.85], [11.4, 3.7]], { n: 14, col: inCol, t: 0, r: [90, 0, 0], p: [0, 0, 0.04] });
  k.box([3.6, 11, 2.0], { p: [0, -17, 0.2], col: o.hcol ?? C.red, t: 1, b: 0.6 });
  k.blade([[-1.4, -11.8], [1.4, -11.8], [2.6, -14], [-2.6, -14]], { d: 1.4, b: 0.3, col: rimCol, t: 0 });
  if (!o.noRing) k.ring(1.4, 0.45, { p: [0, -24, 0.2], col: o.hcol ?? C.red, t: 1, seg: 8 });
  if (o.nails) k.nails(14, 0, 1, 12, { len: 2.6 });
  k.grip([0, -17, 0.2]); k.tip([0, 12.8, 0.9]);
}
function nailRing(k, n) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.2, rx = Math.cos(a), ry = Math.sin(a);
    k.cone(0.2, 2.8, { p: [rx * 12.6, ry * 12.6, 0.9], r: [0, 0, a * 180 / Math.PI - 90], col: 0xa3a8ae, t: 0, n: 4 });
  }
}

export default [
  weapon('knife-brown-wrap', 'Hunting knife (brown wrap)', { rot: 0 }, (k) => knife(k, { hl: 10, hw: 2.2, hd: 2.2, L: 14, W: 2.6, hcol: 0x4a342c, round: true, wrap: { col: 0x6b4a36, y0: 1, y1: 9 }, tip: 'clip', guard: true, guardW: 1.2, bcol: 0x9db0be })),
  weapon('knife-red-bands', 'Knife (red bands)', { rot: 0 }, (k) => knife(k, { hl: 10, hw: 2.2, hd: 2.2, L: 13, W: 2.6, hcol: 0x3a2b2a, bands: [{ y: 2.5, h: 1, col: C.red }, { y: 5, h: 1, col: C.red }, { y: 7.5, h: 1, col: C.red }], tip: 'clip', bcol: 0x9db0be })),
  weapon('knife-orange-wrap', 'Long knife (orange wrap)', { rot: 0 }, (k) => knife(k, { hl: 12, hw: 2.4, hd: 2.2, L: 24, W: 2.8, hcol: 0x4a4038, wrap: { col: C.orange, y0: 1, y1: 7 }, bands: [{ y: 9, h: 1.2, col: 0x24262c }], tip: 'point', bcol: 0x9db0be })),
  weapon('hatchet-red', 'Hatchet (red)', { fat: [1.5, 1, 1.55], rot: 0, blood: 0.1, rust: 0.4 }, (k) => hatchet(k, { hcol: 0x4a3028, tape: [3, 18], tapeCol: 0x1d1c20, red: C.red, poll: 0xc9302c })),
  weapon('hatchet-orange', 'Hatchet (orange tape)', { fat: [1.5, 1, 1.55], rot: 0, blood: 0.06, rust: 0.3 }, (k) => hatchet(k, { hcol: 0x3a2e28, tape: [4, 28], tapeCol: C.orange, poll: 0x3a3d44, len: 40 })),

  weapon('knife-small-blue', 'Small knife', { rot: 0 }, (k) => knife(k, { hl: 8, hw: 2.2, hd: 2, L: 12, W: 2.7, hcol: 0x6f8fa6, tip: 'drop', bolster: C.steelD, bcol: 0x9db0be })),

  weapon('machete', 'Machete', { rot: 0, rust: 0.3, blood: 0.05 }, (k) => {
    knife(k, { hl: 13, hw: 2.8, hd: 2.4, L: 42, W: 7.2, hcol: 0x7f6258, tip: 'clip', tipLen: 0.14, bd: 0.7, bb: 0.25, pommel: 0x5a4a44, bands: [{ y: 4, h: 1.2, col: 0x5a4a44 }], bcol: 0xa7b8c4, dots: 2, dotc: 0xcfd8de });
  }),

  weapon('sharpening-steel', 'Sharpening steel', { rot: 0 }, (k) => {
    k.cyl(2.2, 2.2, 13, { col: 0x2b2d33, t: 1, b: 0.4 });
    k.ring(1.9, 0.5, { p: [0, -1.2, 0], r: [90, 0, 0], col: C.steelD, t: 0, seg: 8 });
    k.cyl(3.4, 3.4, 1, { p: [0, 13, 0], col: C.steelD, t: 0, n: 8 });
    k.cyl(0.95, 0.95, 32, { p: [0, 14, 0], col: 0x454a52, t: 0, n: 6, b: 0.2 });
    for (let i = 0; i < 8; i++) k.cyl(1.05, 1.05, 0.5, { p: [0, 18 + i * 3.6, 0], col: 0x31353b, t: 0, n: 6, b: 0.1 });
    k.grip([0, 6, 0]); k.tip([0, 46, 0]);
  }),

  weapon('knife-teal-thin', 'Slim utility knife', { rot: 0 }, (k) => knife(k, { hl: 6, hw: 2, hd: 1.8, L: 12, W: 2.4, hcol: 0x55879b, tip: 'point', bcol: 0x8fb3c2 })),

  weapon('multitool-red', 'Red multitool', { rot: 0 }, (k) => {
    knife(k, { hl: 11, hw: 2.4, hd: 2, L: 6, W: 2.2, hcol: C.red, tip: 'clip', bcol: 0xd8dde0, bands: [{ y: 0.9, h: 1.2, col: 0xcfd4d8, t: 0 }] });
    k.box([1.2, 0.5, 2.3], { p: [0, 6, 0], col: 0xeeeeee, t: 1, b: 0.1 }); k.box([0.5, 1.2, 2.3], { p: [0, 6, 0], col: 0xeeeeee, t: 1, b: 0.1 });
  }),

  weapon('frying-pan-nails', 'Frying pan with nails', { rot: 0, blood: 0.38, rust: 0.2 }, (k) => { pan(k, { nails: false }); nailRing(k, 14); }),

  weapon('stop-sign-shield', 'No-entry sign shield', { hands: 1, kind: 'shield', rot: 0, blood: 0.2, rust: 0.2 }, (k) => {
    k.cyl(1.3, 1.3, 28, { col: 0xa56b45, t: 3, b: 0.4 });
    k.tape(4, 12, 1.4, { col: 0x3b2f2a, band: 1.2 });
    const circ = (r) => arc(0, 0, r, 0, 360, 22).slice(0, -1);
    k.blade(circ(15.4), { nofat: true, p: [0, 40, -0.2], d: 2.4, b: 0.7, col: 0x4a4f58, t: 1, cs: 2 });
    k.blade(circ(14), { p: [0, 40, 0.3], d: 2.0, b: 0.6, col: C.red, t: 1, cs: 2 });
    k.blade(circ(10.8), { p: [0, 40, 0.6], d: 1.6, b: 0.3, col: 0xf1f1f4, t: 1, cs: 2 });
    k.box([20.4, 3.8, 0.8], { p: [0, 40, 1.8], col: C.red, t: 1, b: 0.25 });
    k.cyl(1.2, 1.2, 3, { p: [0, 28, -1.5], r: [0, 0, 0], col: C.steelD, t: 0, n: 6 });
    k.grip([0, 10, 0]); k.tip([0, 54, 0]);
  }),

  weapon('tray-shield', 'Dented tray shield', { hands: 1, kind: 'shield', rot: 0, blood: 0.1, rust: 0.2 }, (k) => {
    const pts = [], rim = [], n = 22;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2; let sx = 1, sy = 1;
      const d = Math.abs(((a * 180 / Math.PI) - 38 + 540) % 360 - 180);
      const bite = d < 16 ? (1 - d / 16) * 0.22 : 0;
      sx = 1 - bite; sy = 1 - bite;
      pts.push([Math.cos(a) * 11.5 * sx, Math.sin(a) * 15 * sy]);
      rim.push([Math.cos(a) * 9.6 * sx, Math.sin(a) * 12.6 * sy]);
    }
    k.blade(pts, { p: [0, 14, 0], d: 1.2, b: 0.4, col: 0x8497a8, t: 0, holes: [rim.slice().reverse()], cs: 2 });
    k.blade(rim, { p: [0, 14, -0.1], d: 0.7, b: 0.2, col: 0x7c8fa0, t: 0, cs: 2 });
    k.ring(2.4, 0.6, { p: [0, 0.5, 0], col: 0x7c8fa0, t: 0, seg: 8 });
    k.box([2.4, 8, 1.4], { p: [0, 14, -1.6], col: C.steelD, t: 0, b: 0.4 });
    k.grip([0, 14, -1.6]); k.tip([0, 26, 0]);
  }),
];
