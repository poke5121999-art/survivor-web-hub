// Sheet 2 (cells 59-72): clean flat-colour props from the owner's second sheet
import { weapon } from '../lib/weapon.js';
import { C, arc, teeth } from './common.js';
import { roundPoly } from '../lib/kit.js';
import { bat } from './row2.js';
import { pan, } from './row3.js';
import { pickHead } from './row2.js';

const P = { gray: 0x9aa6b0, grayD: 0x6c7580, yel: 0xf6b136, orange: 0xf08a2c, red: 0xd9475c, wood: 0xa8523a };
const T = (extra = {}) => ({ clean: true, ...extra });

function wrenchHead(cy, r, gap) {
  const a2 = 90 - gap, nx = r * Math.cos(a2 * Math.PI / 180) * 0.82, yt = cy + r * Math.sin(a2 * Math.PI / 180);
  return [...arc(0, cy, r, 270, 360 + a2, 10), [nx, yt], [nx, cy + 0.6], [-nx, cy + 0.6], [-nx, yt], ...arc(0, cy, r, 450 - a2, 630, 8)];
}

export default [
  weapon('warning-sign', 'Warning sign on pole', T({ hands: 2, kind: 'tool', rot: 17 }), (k) => {
    k.cyl(2.0, 2.1, 150, { col: P.gray, t: 1, b: 0.4 });
    const tri = [[-27, 96], [27, 96], [0, 144]];
    k.blade(roundPoly(tri, 7, 4), { p: [0, 0, 1.6], d: 3.4, b: 1.0, col: P.red, t: 1, cs: 3 });
    const inner = tri.map(([x, y]) => [x * 0.66, 112 + (y - 112) * 0.66]);
    k.blade(roundPoly(inner, 3, 3), { p: [0, 0, 3.4], d: 1.2, b: 0.4, col: 0xe8e8ee, t: 1, cs: 3 });
    k.grip([0, 40, 0]); k.grip2([0, 12, 0]); k.tip([0, 150, 0]);
  }),

  weapon('hedge-shears', 'Hedge shears', T({ hands: 2, kind: 'tool', rot: 8 }), (k) => {
    for (const s of [-1, 1]) k.xf({ r: [0, 0, s * 15], p: [0, 40, 0] }, () => {
      k.cyl(2.0, 2.0, 36, { p: [0, 0, 0], col: P.yel, t: 1, b: 0.3 });
      k.cyl(2.15, 2.15, 10, { p: [0, 26, 0], col: 0x6a4030, t: 1, b: 0.3 });
      k.blob(2.7, { p: [0, 37, 0], col: P.orange, t: 1 });
      k.blade([[-1.8, 0], [1.8, 0], [3.4, -6], [2.6, -40], [-1.0, -44], [-3.4, -6]].map(([x, y]) => [x * s, y]), { d: 0.7, b: 0.2, col: 0xa7b4bf, t: 0 });
    });
    k.cyl(1.3, 1.3, 1.4, { p: [0, 39.3, 1.6], r: [90, 0, 0], col: C.steelD, t: 0, n: 6 });
    k.grip([-3, 60, 0]); k.grip2([3, 60, 0]); k.tip([0, -4, 0]);
  }),

  weapon('bat-yellow', 'Yellow bat, black tape', T({ fat: [1.7, 1, 1.7], rot: -85 }), (k) => {
    bat(k, { col: P.yel, gripCol: 0x25262b, gripTo: 4 });
    k.tape(14, 20, 1.55, { col: 0x25262b, band: 1.5, rx: 1.5, rz: 1.5 }); k.tape(24, 28, 1.7, { col: 0x25262b, band: 1.5 });
    k.tape(4, 10, 1.55, { col: 0x25262b, band: 1.5 });
  }),

  weapon('crowbar-red', 'Crowbar, red grip', T({ fat: [1.3, 1, 1.3], rot: -62 }), (k) => {
    k.tube([[0, 0, 0], [0, 40, 0], [0, 64, 0]], 1.9, { n: 6, col: P.gray, t: 0 });
    k.tube([[0, 64, 0], [0.6, 72, 0], [3.5, 78, 0], [8, 79, 0], [11, 75, 0], [10.4, 70, 0]], 1.9, { n: 6, col: P.gray, t: 0 });
    k.cyl(2.5, 2.5, 24, { p: [0, 22, 0], col: P.red, t: 1, b: 0.3 });
    k.blade([[-1.2, -8], [1.5, -8], [3.4, 4], [-1.8, 4]], { d: 1.3, b: 0.3, col: P.gray, t: 0, p: [0, 3, 0] });
    k.grip([0, 34, 0]); k.grip2([0, 12, 0]); k.tip([10.4, 70, 0]);
  }),

  weapon('tonfa', 'Tonfa baton', T({ rot: 45 }), (k) => {
    k.cyl(2.3, 2.3, 56, { col: 0x3b3e46, t: 1, b: 0.5 });
    k.cyl(1.8, 1.8, 13, { p: [0, 36, 0], r: [0, 0, -90], col: 0x3b3e46, t: 1, b: 0.4, n: 8 });
    k.blob(2.5, { p: [14, 36, 0], col: 0x3b3e46, t: 1 });
    k.grip([12, 36, 0], [0, 1, 0], [1, 0, 0]); k.tip([0, 56, 0]);
  }),

  weapon('bent-pipe', 'Bent pipe', T({ rot: 70 }), (k) => {
    k.cyl(2.7, 2.7, 58, { col: 0x7a8791, t: 0, b: 0.3 });
    k.tube([[0, 57, 0], [0, 62, 0], [-1.2, 66, 0], [-4.5, 69, 0], [-9, 69.5, 0]], 2.7, { n: 8, col: 0x7a8791, t: 0 });
    k.cyl(2.6, 2.6, 2, { p: [0, 46, 0], col: 0x5f6a73, t: 0 }); k.cyl(2.6, 2.6, 2, { p: [0, 6, 0], col: 0x5f6a73, t: 0 });
    k.cyl(1.4, 1.4, 4, { p: [-9, 69.5, 0], r: [0, 0, 90], col: 0x5f6a73, t: 0, n: 8 });
    k.grip([0, 24, 0]); k.tip([-12, 69.5, 0]);
  }),

  weapon('garden-hoe', 'Garden hoe', T({ fat: [1.0, 1, 1.5], hands: 2, kind: 'tool', rot: -62 }), (k) => {
    k.cyl(2.0, 2.0, 62, { p: [0, 22, 0], col: P.orange, t: 1, b: 0.3 });
    k.blob(1.9, { p: [0, 85, 0], col: P.orange, t: 1 });
    k.cyl(2.9, 2.9, 7, { p: [0, 22, 0], col: 0x5f6a73, t: 0 });
    k.cyl(0.9, 0.9, 20, { p: [0, 4, 0], col: P.gray, t: 0, n: 6 });
    k.blade([[-9, -19], [14, -2], [-9, -2]], { p: [0, 4, 0], d: 1.0, b: 0.3, col: P.gray, t: 0 });
    k.grip([0, 66, 0]); k.grip2([0, 40, 0]); k.tip([-6, -10, 0]); k.edge([-6, -10, 0], [11, 3, 0]);
  }),

  weapon('frying-pan-clean', 'Frying pan', T({ rot: 175 }), (k) => pan(k, { rim: 0x545c66, inside: 0x95a3b5, hcol: 0x8a4c3a, noRing: true })),

  weapon('pickaxe-yellow', 'Pickaxe, yellow handle', T({ hands: 2, rot: -76 }), (k) => {
    k.cyl(3.0, 2.5, 78, { col: P.yel, t: 3, b: 0.4 });
    pickHead(k, 78, 0x9aa0a8);
    k.cyl(3.2, 3.2, 7, { p: [0, 74, 0], col: 0x7a838c, t: 0 });
    k.grip([0, 12, 0]); k.grip2([0, 46, 0]); k.tip([-34, 68, 0]);
  }),

  weapon('wrench-open', 'Open-end wrench', T({ rot: 22 }), (k) => {
    k.blade([[-3.2, 2], [3.2, 2], [3.2, 58], [-3.2, 58]], { d: 2.2, b: 0.4, col: 0xa9b6c3, t: 0 });
    k.blade(wrenchHead(60, 8.2, 25), { d: 2.2, b: 0.45, col: 0xa9b6c3, t: 0, cs: 3 });
    k.blade(wrenchHead(0, 7, 25).map(([x, y]) => [x, -y]).reverse(), { d: 2.2, b: 0.45, col: 0xa9b6c3, t: 0, cs: 3 });
    k.grip([0, 30, 0]); k.tip([0, 69, 0]);
  }),

  weapon('rake', 'Garden rake', T({ hands: 2, kind: 'tool', rot: -125 }), (k) => {
    k.cyl(2.0, 2.0, 150, { col: 0xa8503c, t: 3, b: 0.3 });
    k.xf({ p: [0, 148, 0], r: [0, 0, 32] }, () => {
      k.box([46, 5.4, 3.4], { p: [0, 0, 0], col: P.gray, t: 1, b: 0.9 });
      for (let i = 0; i < 9; i++) k.box([2.6, 13, 3], { p: [-20.5 + i * 5.1, 8.5, 0], col: P.gray, t: 1, b: 0.5 });
      k.box([3, 7, 2.8], { p: [0, -4, 0], col: 0x7a838c, t: 0, b: 0.6 });
    });
    k.grip([0, 60, 0]); k.grip2([0, 110, 0]); k.tip([0, 150, 0]);
  }),

  weapon('pipe-wrench-red', 'Red pipe wrench', T({ rot: -112 }), (k) => {
    k.blade([[-2.2, 0], [2.2, 0], [2.6, 44], [-2.6, 44]], { d: 2.2, b: 0.55, col: P.red, t: 1, holes: [arc(0, 3.4, 0.9, 0, 360, 8).slice(0, -1).reverse()] });
    k.blade([[-4.4, 40], [3, 40], [4.4, 50], [8.4, 56], [10, 62], [7, 68], [3, 62], [1, 54], [-4.4, 52]], { d: 3, b: 0.7, col: 0x606973, t: 1 });
    k.box([6.4, 7.4, 3.6], { p: [0, 47, 0], col: 0xaab3bd, t: 0, b: 0.9 });
    k.cyl(2.2, 2.2, 3.4, { p: [0, 47, 0], r: [90, 0, 0], col: 0xcad2d9, t: 0, n: 6 });
    k.grip([0, 20, 0]); k.grip2([0, 6, 0]); k.tip([8, 62, 0]);
  }),

  weapon('shovel-small', 'Small shovel', T({ rot: 34 }), (k) => {
    k.cyl(1.9, 1.9, 38, { p: [0, 2, 0], col: P.orange, t: 1, b: 0.3 });
    k.blob(1.8, { p: [0, 41, 0], col: P.orange, t: 1 });
    k.cyl(1.9, 1.9, 3, { p: [0, 2, 0], col: P.gray, t: 0 });
    k.blade(roundPoly([[-2.6, 2], [2.6, 2], [7.5, -4], [7.5, -17], [0, -23], [-7.5, -17], [-7.5, -4]], 1.5, 3), { p: [0, 3, 0], d: 1.6, b: 0.5, col: 0x4aa84a, t: 1, cs: 3 });
    k.box([1.6, 10, 1.2], { p: [0, -9, 0.9], col: 0x3a8a3c, t: 1, b: 0.3 });
    k.grip([0, 30, 0]); k.tip([0, -20, 0]); k.edge([-7, -17, 0], [7, -17, 0]);
  }),

  weapon('hand-saw', 'Hand saw', T({ rot: 122 }), (k) => {
    k.blade([[-4.8, 0], [4.8, 0], [5.2, 9], [3, 14.5], [-3, 14.5], [-5.2, 9]], { d: 2.6, b: 0.7, col: P.orange, t: 1, holes: [[[-2.2, 3.5], [-2.2, 9.5], [2.4, 9.5], [2.4, 3.5]].reverse()] });
    k.blade([[-4.4, 14], [-1.5, 58], ...teeth([1.5, 58], [4.7, 14], 26, 0.8, 0.6)], { d: 0.5, b: 0.15, col: 0xb7c4cf, t: 0 });
    k.box([6, 1.6, 1.6], { p: [0, 14.5, 0], col: P.gray, t: 0, b: 0.3 });
    k.grip([0, 7, 0]); k.tip([0, 58, 0]); k.edge([4.7, 14, 0], [1.5, 58, 0]);
  }),
];
