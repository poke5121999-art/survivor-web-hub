// Sheet row 2 (cells 17-32): bats, hammers, pipes, katanas, axes, pickaxe, wrench, chainsaw, saw
import { weapon } from '../lib/weapon.js';
import { C, arc, teeth } from './common.js';
import { rotTo } from '../lib/kit.js';

export const batProfile = (len = 86) => [[0, 0, 1], [2.1, 0, 1], [2.3, 1.2, 0], [1.5, 4], [1.55, 30], [2.5, 50], [3.3, 65], [3.55, 76], [3.1, len - 3, 1], [1.6, len - 0.6, 1], [0, len]];

export function bat(k, o = {}) {
  k.lathe(batProfile(o.len), { n: 10, smooth: true, col: o.col ?? 0xb5562c, t: 3 });
  if (o.grip !== false) k.tape(1.5, o.gripTo ?? 20, 1.6, { col: o.gripCol ?? 0x1e1f24, band: 1.2 });
  k.grip([0, 11, 0]); k.tip([0, o.len ?? 86, 0]); k.edge([3.5, 50, 0], [3.5, 80, 0]);
}

/** katana: blade outline with curve; edge on +x */
export function katanaPts(L, W, curve, o = {}) {
  const sp = [], ed = [], n = 12;
  for (let i = 0; i <= n; i++) {
    const t = i / n, cx = curve * t * t, w = W * (1 - 0.18 * t);
    sp.push([cx - w / 2, L * t]); ed.push([cx + w / 2, L * t * (t > 0.92 ? 0.995 : 1)]);
  }
  const tipy = L * 1.03, tipx = curve - W * 0.1;
  ed[n] = [curve + W * 0.3, L * 0.965];
  return [...sp.slice(0, n), [tipx, tipy], ...ed.slice(1).reverse(), ed[0]].map((p) => p);
}
export function katana(k, o) {
  const hl = 24, L = o.L ?? 70, W = o.W ?? 3.2;
  k.cyl(1.55, 1.7, hl, { col: o.hcol ?? C.black, t: 2, b: 0.4, n: 8 });
  k.tape(1, hl - 1, 1.55, { col: o.wrap ?? C.red, band: 1.6, rx: 1.6, rz: 1.5 });
  k.cyl(2.0, 2.0, 1.2, { p: [0, -0.2, 0], col: C.steelD, t: 0 });
  k.cyl(3.6, 3.6, 0.9, { p: [0, hl, 0], col: o.tsuba ?? 0x2b2d33, t: 0, n: 8, b: 0.25 });
  if (o.hook) { k.ring(4.2, 0.45, { nofat: true, p: [3.5, hl + 5, 0], r: [0, 0, 0], col: C.steelD, seg: 10 }); }
  k.cyl(1.1, 1.1, 2, { p: [0, hl + 0.9, 0], col: C.steelD, t: 0 });
  k.blade(katanaPts(L, W, o.curve ?? 3).map(([x, y]) => [x, y + hl + 2.5]), { d: 0.65, b: 0.24, col: o.bcol ?? C.steel, t: 0 });
  k.box([0.45, L * 0.9, 0.95], { p: [(o.curve ?? 3) * 0.25 - W / 2 + 0.45, hl + 2.5 + L * 0.45, 0], col: o.bcol ?? C.steel, t: 0, b: 0.12 });
  k.grip([0, 8, 0]); k.grip2([0, 19, 0]); k.tip([o.curve ?? 3, hl + 2.5 + L, 0]); k.edge([W / 2, hl + 3, 0], [(o.curve ?? 3) + W / 2, hl + 2.5 + L * 0.95, 0]);
}

export default [
  weapon('bat-nails-tape', 'Nail bat, blue tape', { fat: [1.55, 1, 1.55], rot: 0, blood: 0.22, rust: 0.4 }, (k) => {
    bat(k, { col: 0xb04f27 });
    k.tape(50, 70, 3.2, { col: C.blue, band: 1.5, rx: 3.0, rz: 3.0, tail: true });
    k.nails(26, 40, 82, 3.4, { len: 3.2 });
  }),

  weapon('bat-saw-blade', 'Bat with saw blade', { fat: [1.5, 1, 1.5], rot: 0, blood: 0.18, rust: 0.45 }, (k) => {
    bat(k, { col: 0x9a4a28 });
    k.tape(12, 26, 1.7, { col: C.tape, band: 1.4 });
    k.gear(11.5, 16, 18, 0.7, { nofat: true, saw: true, p: [0, 64, 0], col: 0xa9b3bc, t: 0, hole: 3.7 });
    k.gear(5, 8, 12, 0.5, { nofat: true, p: [0, 64, 0.5], col: C.steelD, t: 0, hole: 3.6 });
    k.nails(18, 38, 82, 3.4, { len: 3.4 });
  }),

  weapon('bat-wire', 'Wire-wrapped bat', { fat: [1.6, 1, 1.6], rot: 0, blood: 0.1, rust: 0.4 }, (k) => {
    bat(k, { col: 0x9b4a2a, gripCol: 0x20212a });
    k.wire(50, 80, (t) => 3.0 + 0.8 * t, { turns: 7, barbs: true, th: 0.4 });
  }),

  weapon('sledgehammer-tape', 'Taped sledgehammer', { fat: [1.45, 1, 1.45], rot: 0, rust: 0.4, blood: 0.1 }, (k) => {
    k.cyl(1.9, 1.7, 66, { col: 0x8a5a3a, t: 3, b: 0.4 });
    k.tape(2, 40, 1.8, { col: C.tape, band: 1.8 });
    k.box([17, 10, 8], { p: [0, 72, 0], col: 0x4b5058, t: 0, b: 1.4 }); k.nails(5, 70, 74, 5, { len: 4 });
    k.box([2.2, 9.5, 7.6], { p: [-7.6, 71.5, 0], col: 0x6a7078, t: 0, b: 0.5 }); k.box([2.2, 9.5, 7.6], { p: [7.6, 71.5, 0], col: 0x6a7078, t: 0, b: 0.5 });
    k.tape(55, 67, 2.0, { col: C.blue, band: 1.3, tail: true });
    k.grip([0, 14, 0]); k.grip2([0, 38, 0]); k.tip([0, 76, 0]);
  }),

  weapon('gear-hammer', 'Welded gear hammer', { fat: [1.4, 1, 1.4], hands: 2, rot: 0, rust: 0.5, blood: 0.1 }, (k) => {
    k.cyl(1.9, 1.7, 66, { col: 0x5a3a2c, t: 3, b: 0.4 });
    k.tape(16, 46, 1.8, { col: C.tape, band: 1.7 });
    k.box([21, 17, 8], { p: [0, 76, 0], col: 0x7d838c, t: 0, b: 1.1 });
    k.box([19, 3, 8], { p: [0, 85, 0], col: 0x464a52, t: 0, b: 0.6 });
    k.gear(4.2, 6, 10, 1, { nofat: true, p: [-3, 76, 3.9], col: 0x30333a, t: 0, hole: 1.4 });
    k.box([5, 6, 2], { p: [6.5, 80, 3.9], col: 0x9a4a2a, t: 1, b: 0.4 });
    k.box([4, 9, 3], { p: [8.5, 68, 0], col: C.steelD, t: 0, b: 0.5 });
    k.grip([0, 10, 0]); k.grip2([0, 40, 0]); k.tip([0, 85, 0]);
  }),

  weapon('pipe-wrench-club', 'Pipe elbow club', { fat: [1.5, 1, 1.5], rot: 0, rust: 0.45, blood: 0.05 }, (k) => {
    k.cyl(2.0, 2.0, 62, { col: 0x6f8a98, t: 0, b: 0.3 });
    k.tube([[0, 60, 0], [0, 66, 0], [-1, 70, 0], [-4, 72.5, 0], [-8, 73, 0]], 2.0, { n: 8, col: 0x7e98a6, t: 0 });
    k.cyl(2.5, 2.5, 1.3, { p: [0, 58, 0], col: C.steelD, t: 0 });
    k.tape(16, 36, 2.1, { col: 0x6a4a38, band: 1.1 });
    k.cyl(0.5, 0.5, 5, { p: [2.2, 52, 0], r: [0, 0, -90], col: C.red, t: 1, n: 6 });
    k.cyl(1.2, 1.2, 1, { p: [7, 52, 0], r: [0, 0, -90], col: C.red, t: 1, n: 6 });
    k.grip([0, 26, 0]); k.grip2([0, 8, 0]); k.tip([-8, 74, 0]);
  }),

  weapon('valve-mace', 'Valve-wheel pipe mace', { fat: [1.45, 1, 1.4], rot: 0, rust: 0.45, blood: 0.14 }, (k) => {
    k.cyl(1.9, 1.9, 56, { col: 0x6f8a98, t: 0, b: 0.3 });
    k.tape(4, 28, 2.0, { col: C.tape, band: 1.4 });
    k.cyl(4.4, 4.4, 15, { p: [0, 54, 0], r: [0, 0, 90], col: 0x4d5a64, t: 0, n: 8, b: 0.8 });
    k.cyl(3.2, 3.2, 8, { p: [0, 57, 0], col: 0x3e4852, t: 0, n: 8 });
    k.ring(6, 0.8, { nofat: true, p: [0, 68, 0], r: [0, 0, 0], col: C.red, t: 1, seg: 10 }); k.cyl(0.7, 0.7, 12, { p: [0, 62, 0], col: C.red, t: 1, n: 6 });
    k.box([12, 0.9, 0.9], { p: [0, 68, 0], col: C.red, t: 1, b: 0.2 }); k.box([0.9, 12, 0.9], { p: [0, 68, 0], col: C.red, t: 1, b: 0.2 });
    k.cyl(0.7, 0.7, 13, { p: [4, 39, 1.5], r: [0, 0, -20], col: C.red, t: 1, n: 6 });
    k.cyl(1.8, 1.8, 2, { p: [4.6, 51, 0], r: [0, 0, 90], col: C.orange, t: 1, n: 6 });
    k.grip([0, 16, 0]); k.grip2([0, 5, 0]); k.tip([0, 69, 0]);
  }),

  weapon('katana-red', 'Katana (red wrap, bloody)', { fat: [1.4, 1, 1.2], rot: 0, blood: 0.4, rust: 0.1 }, (k) => katana(k, { wrap: C.red, curve: 3.5, L: 68, W: 3.6 })),
  weapon('katana-dark', 'Katana (dark)', { fat: [1.4, 1, 1.2], rot: 0, blood: 0.05, rust: 0.1 }, (k) => katana(k, { wrap: 0x30323a, curve: 1.2, L: 72, bcol: 0x8a98a3, W: 3.8 })),
  weapon('katana-hook', 'Katana (hook guard)', { fat: [1.4, 1, 1.2], rot: 0, blood: 0.35, rust: 0.2 }, (k) => katana(k, { wrap: 0x34363e, curve: 2.2, L: 82, hook: true, W: 3.0, tsuba: 0x4a5058 })),

  weapon('saw-axe', 'Saw-blade axe', { fat: [1.35, 1, 1.35], rot: 0, rust: 0.45, blood: 0.1 }, (k) => {
    k.cyl(1.8, 1.6, 68, { col: 0x2b2a2e, t: 3, b: 0.4 });
    k.tape(16, 44, 1.8, { col: C.tape, band: 1.8 });
    k.gear(10, 14.5, 16, 1.0, { nofat: true, saw: true, p: [2, 72, 0], col: 0x9aa8b2, t: 0, hole: 6.5 });
    k.ring(6.2, 0.7, { nofat: true, p: [2, 72, 0.4], col: C.steelD, t: 0, seg: 10 });
    k.wire(60, 78, 3, { turns: 5, barbs: true, th: 0.3 });
    k.nails(8, 64, 80, 2.5, { len: 3 });
    k.grip([0, 10, 0]); k.grip2([0, 34, 0]); k.tip([2, 87, 0]);
  }),

  weapon('fire-axe', 'Fire axe', { fat: [1.4, 1, 1.35], rot: 0, blood: 0.1, rust: 0.3 }, (k) => {
    k.cyl(1.7, 1.55, 72, { col: 0x3a2d28, t: 3, b: 0.4 });
    k.tape(18, 44, 1.8, { col: C.green, band: 1.4 });
    k.cyl(2.1, 2.1, 2.5, { p: [0, 70, 0], col: C.steelD, t: 0 });
    k.blade([[-2.5, 62], [-2.5, 82], [2, 83], [5, 87], [11.5, 90], [13, 76], [13, 62], [5, 58], [2, 60]], { d: 2.2, b: 0.5, col: 0xb7c3cb, t: 0 });
    k.box([5, 20, 2.8], { p: [-0.5, 72, 0], col: 0xd44a3c, t: 1, b: 0.5 });
    k.grip([0, 12, 0]); k.grip2([0, 40, 0]); k.tip([13, 76, 0]); k.edge([13, 62, 0], [13, 90, 0]);
  }),

  weapon('pickaxe-rust', 'Pickaxe', { hands: 2, rot: 0, blood: 0.06, rust: 0.45 }, (k) => {
    k.cyl(3.0, 2.4, 76, { col: 0x6b3d28, t: 3, b: 0.4 });
    pickHead(k, 76, 0x7d8892);
    k.tape(2, 14, 1.5, { col: 0x1f2024, band: 1.3 });
    k.grip([0, 10, 0]); k.grip2([0, 45, 0]); k.tip([-34, 66, 0]);
  }),

  weapon('wrench-giant', 'Giant adjustable wrench', { fat: [1.4, 1, 1.3], hands: 2, rot: 0, rust: 0.3, blood: 0.1 }, (k) => {
    k.hexRing(4.5, 2.4, 2.4, { p: [0, 4.4, 0], col: 0x8d9aa5, t: 0 });
    k.blade([[-1.9, 8], [1.9, 8], [2.4, 52], [-2.4, 52]], { d: 2.2, b: 0.5, col: 0x8d9aa5, t: 0 });
    k.tape(16, 40, 2.4, { col: C.blue, band: 1.5, rx: 2.8, rz: 2.4 });
    k.blade([[-5, 52], [5, 52], [7, 58], [7.4, 66], [8.8, 74], [6.6, 82], [3, 84], [2.4, 78], [2.4, 66], [-2.4, 66], [-2.4, 78], [-3, 84], [-6.6, 82], [-8.8, 74], [-7.4, 66], [-7, 58]], { d: 2.6, b: 0.6, col: 0xa3afb9, t: 0 });
    k.box([2.6, 7, 2.8], { p: [-5.4, 80, 0], r: [0, 0, 8], col: C.red, t: 1, b: 0.4 }); k.box([2.6, 7, 2.8], { p: [5.4, 80, 0], r: [0, 0, -8], col: C.red, t: 1, b: 0.4 });
    k.cyl(2.6, 2.6, 2.8, { p: [0, 57, 0], r: [90, 0, 0], col: 0x71808c, t: 0, n: 6 });
    k.grip([0, 26, 0]); k.grip2([0, 12, 0]); k.tip([0, 83, 0]);
  }),

  weapon('chainsaw-sword', 'Chainsaw sword', { fat: [1.5, 1, 1.3], hands: 2, rot: 0, blood: 0.1, rust: 0.4 }, (k) => {
    k.cyl(2, 2.2, 18, { col: C.black, t: 2, b: 0.5 });
    k.box([6.4, 60, 3.2], { p: [0, 48, 0], col: 0x636e78, t: 0, b: 0.7 });
    for (let i = 0; i < 24; i++) for (const sx of [-1, 1]) k.cone(0.55, 1.6, { p: [sx * 3.5, 20 + i * 2.35, 0], r: [0, 0, -sx * 90], col: 0x9aa4ae, t: 0, n: 3 });
    k.box([13, 26, 6.2], { p: [0, 80, 0], col: C.green, t: 1, b: 2.1 });
    k.box([5, 8, 1.5], { p: [-4, 66, 3.4], col: C.green, t: 1, b: 0.5, r: [0, 0, 15] });
    k.box([2.4, 2.4, 6.6], { p: [-6, 86, 0], col: C.blue, t: 1, b: 0.5 });
    k.grip([0, 8, 0]); k.grip2([0, 26, 0]); k.tip([0, 93, 0]);
  }),

];

export function pickHead(k, y, col) {
  const pts = [], n = 14;
  for (let i = 0; i <= n; i++) { const x = -34 + 68 * i / n, a = Math.abs(x) / 34; pts.push([x, y - 11 * a * a]); }
  const low = [];
  for (let i = n; i >= 0; i--) { const x = -34 + 68 * i / n, a = Math.abs(x) / 34; low.push([x, y - 11 * a * a - (6.4 * (1 - Math.pow(a, 1.2)) + 0.6)]); }
  k.blade([...pts, ...low], { d: 3.4, b: 0.8, col, t: 0, cs: 3 });
  k.box([9, 11, 5.6], { p: [0, y - 2.5, 0], col: 0x5f6a73, t: 0, b: 0.9 });
}
