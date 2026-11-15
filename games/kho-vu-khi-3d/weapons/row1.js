// Sheet row 1 (cells 01-16): knives, saws, sickle, tenderiser, cleavers, throwing knives
import { weapon } from '../lib/weapon.js';
import { C, knife, thrower, arc, teeth } from './common.js';

export default [
  weapon('cleaver-saw', 'Cleaver saw', { rot: -55, blood: 0.1, rust: 0.2 }, (k) => {
    k.cyl(2.3, 2.5, 11, { col: C.black, t: 2, b: 0.5 });
    k.tape(1, 10.5, 2.3, { col: C.black, band: 1.2 });
    k.cyl(3.3, 3.3, 1.8, { p: [0, 0, 0], col: C.steelD, t: 0 });
    k.ring(3.2, 0.9, { p: [-4.4, 12, 0], col: C.steelD, t: 0, seg: 8 });
    k.box([8, 1.6, 3], { p: [0, 11.5, 0], col: C.steelD, t: 0, b: 0.4 });
    const top = teeth([-9, 48], [9, 40], 8, 0.9).reverse();
    k.blade([[-3.5, 12], [3.5, 12], [3.5, 16], [9, 19], [9, 40], ...top.slice(1), [-9, 48], [-9, 20], [-3.5, 16]].filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]),
      { d: 1.1, b: 0.4, col: C.steel, t: 0 });
    k.grip([0, 5, 0]); k.tip([0, 47, 0]); k.edge([9, 19, 0], [9, 40, 0]);
  }),

  weapon('pruning-saw', 'Pruning saw', { rot: -50, rust: 0.2 }, (k) => {
    k.blade([[-3.2, 0], [3.6, 0], [4.4, 6], [4, 13], [1.5, 16], [-2, 15], [-3.8, 10], [-3.6, 4]], { d: 3.2, b: 0.9, col: C.blue, t: 1 });
    k.box([3, 3, 2.4], { p: [0.4, 16, 0], col: C.steelD, t: 0, b: 0.5 });
    k.blade([[-1.7, 15], [0.4, 46], ...teeth([2.2, 46], [4.4, 15], 26, 0.7)], { d: 0.5, b: 0.18, col: C.steel, t: 0 });
    k.grip([0.4, 7, 0]); k.tip([1, 46, 0]); k.edge([4.4, 15, 0], [2.2, 46, 0]);
  }),

  weapon('sickle', 'Sickle', { rot: 0, rust: 0.35 }, (k) => {
    k.cyl(2.1, 2.4, 15, { col: 0x9a4430, t: 3, b: 0.4 });
    k.cyl(1.5, 1.7, 1.4, { p: [0, 15, 0], col: C.steelD, t: 0 });
    const out = arc(-9, 24, 10.5, 0, 205, 12), inn = arc(-9, 24, 6.5, 0, 205, 12).map(([x, y], i, a) => { const t = i / (a.length - 1); const r = 4.6 + 5.9 * t; const ang = (205 * t) * Math.PI / 180; return [-9 + Math.cos(ang) * r, 24 + Math.sin(ang) * r]; }).reverse();
    k.blade([[-2.2, 14.5], [2.2, 14.5], ...out, ...inn.slice(1), [-2.2, 24], [-2.2, 17]], { d: 0.6, b: 0.25, col: C.steel, t: 0 });
    k.grip([0, 7, 0]); k.tip([-17.6, 18, 0]); k.edge([-9, 14.5, 0], [-17.4, 20, 0]);
  }),

  weapon('utility-knife-red', 'Red utility knife', { rot: 0 }, (k) => {
    knife(k, { hl: 8.5, hw: 2.4, hd: 2, L: 7, W: 2.7, hcol: C.red, bcol: 0xc4cfd6, tip: 'clip', bands: [{ y: 0.7, h: 1.4, col: C.black }] });
  }),

  weapon('kitchen-knife', 'Kitchen knife', { rot: 0 }, (k) => {
    knife(k, { hl: 9.5, L: 17, W: 4.6, hcol: C.black, bands: [{ y: 5, h: 1.8, col: C.red }], dots: 2, tip: 'drop', bolster: C.steelD });
  }),

  weapon('dagger', 'Dagger', { rot: 0 }, (k) => {
    knife(k, { hl: 9, hw: 2.1, hd: 2.1, L: 15, W: 3.4, tip: 'spear', hcol: C.black, guard: true, guardW: 2.6, pommel: C.steelD, round: true, bd: 0.8, bb: 0.3, dotc: C.red });
    k.cyl(0.4, 0.4, 0.4, { p: [0, 5, 1.0], r: [90, 0, 0], col: C.red, t: 1, n: 6 });
  }),

  weapon('knife-green', 'Green-wrapped knife', { rot: 0, blood: 0.05 }, (k) => {
    knife(k, { hl: 9, L: 14, W: 3.8, hcol: C.black, wrap: { col: C.green, y0: 1.5, y1: 7 }, tip: 'clip', guard: true, guardW: 1.2, spine: true, bolster: C.steelD });
  }),

  weapon('meat-tenderiser', 'Meat tenderiser', { rot: 0, rust: 0.2 }, (k) => {
    k.cyl(1.1, 1.3, 24, { col: 0x5f8190, t: 0, b: 0.25 });
    k.cyl(1.9, 1.9, 1.6, { p: [0, 0, 0], col: C.steelD, t: 0 });
    k.box([13, 6, 5.2], { p: [0, 27, 0], col: 0xb9c7cf, t: 0, b: 0.7 });
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) k.cone(0.55, 0.7, { p: [sx * 6.9, 25.5 + i * 1.5, (j - 1) * 1.5], r: [0, 0, -sx * 90], col: C.steelL, t: 0, n: 4 });
    k.box([3, 7, 4], { p: [0, 24.5, 0], col: C.steelD, t: 0, b: 0.5 });
    k.grip([0, 10, 0]); k.tip([0, 30.2, 0]);
  }),

  weapon('boning-knife-teal', 'Teal boning knife', { rot: 0 }, (k) => {
    knife(k, { hl: 9, hw: 2.4, L: 14, W: 3.3, hcol: C.teal, tip: 'point', bolster: C.steelD, dots: 2 });
  }),

  weapon('chef-knife', 'Chef knife', { rot: 0 }, (k) => {
    knife(k, { hl: 10, L: 19, W: 4.6, hcol: C.black, tip: 'drop', bolster: C.steelD, dots: 3, spine: true });
  }),

  weapon('big-cleaver', 'Big cleaver', { rot: 0, blood: 0.04 }, (k) => {
    knife(k, { hl: 11, hd: 2.4, hcol: C.black, pts: [[-1.2, 0], [1.2, 0], [1.2, 2], [6.6, 3], [6.6, 21], [4.6, 22.4], [-6.6, 22.4], [-6.6, 3], [-1.2, 2]], L: 22, W: 13, bd: 0.8, bb: 0.3, dots: 3, bolster: C.steelD });
  }),

  weapon('fillet-knife', 'Fillet knife', { rot: 0 }, (k) => {
    knife(k, { hl: 8.5, hw: 2.2, hd: 2, L: 21, W: 2.8, hcol: C.black, tip: 'point', bands: [{ y: 5, h: 1.3, col: C.steelD, t: 0 }], bolster: C.steelD });
  }),

  weapon('boning-knife-long', 'Long boning knife', { rot: 0 }, (k) => {
    knife(k, { hl: 8.5, hw: 2.2, hd: 2, L: 25, W: 2.6, hcol: 0x6b3c32, tip: 'clip', tipLen: 0.2, bolster: C.steelD, guard: true, guardW: 0.8, bands: [{ y: 0.8, h: 1.3, col: C.steelD, t: 0 }] });
  }),

];
