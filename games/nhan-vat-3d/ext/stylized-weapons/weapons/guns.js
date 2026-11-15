// Sheet row 4 (cells 52-58): seven guns. Muzzle toward +X, up +Y, origin at the main grip.
// Bodies are TRACED from the owner sheet (tools/trace-profile.js -> lib/guns/data.js): every part (stock, receiver, grip,
// magazine, barrel/handguard...) is a bevelled extrusion of its traced outline, with holes where the sheet shows gaps.
// Small details (rails, sights, trigger guard, tape, hazard stripes, decals) are separate parts positioned in the
// sheet's own cell-pixel coordinates (see ref/trace/*.png) and converted to cm by gun().
import { weapon } from '../lib/weapon.js';
import { C } from './common.js';
import GUNS from '../lib/guns/data.js';

const lum = (c, m = 1.12) => (Math.min(255, c[0] * m) << 16) | (Math.min(255, c[1] * m) << 8) | Math.min(255, c[2] * m);
const BLK = 0x23252b, DK = 0x34373f;

/** Build the traced parts and return coordinate helpers in cell pixels. */
function gun(k, id, depths, over = {}) {
  const g = GUNS[id], c = g.cmPerPx, [gx, gy] = g.gripPx;
  for (const p of g.parts) {
    if (p.outline.length < 3) continue;
    const d = depths[p.name] ?? 3.2;
    k.blade(p.outline, { holes: p.holes.length ? p.holes : undefined, d, b: Math.min(0.55, d * 0.17), col: over[p.name] ?? lum(p.color), t: p.name === 'stock' || p.name === 'grip' ? 1 : 0, p: [0, 0, (over.z && over.z[p.name]) || 0], cs: 2, nofat: true });
  }
  const H = {
    g, c,
    X: (x) => (x - gx) * c, Y: (y) => (gy - y) * c, S: (px) => px * c,
    /** raised box on the +Z face, cell px rectangle */
    plate(x0, y0, x1, y1, col, o = {}) { k.box([(x1 - x0) * c, (y1 - y0) * c, o.d ?? 0.35], { p: [H.X((x0 + x1) / 2), H.Y((y0 + y1) / 2), o.z ?? 1.95], col, t: o.t ?? 1, b: 0.08, stripe: o.stripe, nofat: true }); },
    /** rail with ridges along the top of a part, x0..x1 at row y */
    rail(x0, x1, y, o = {}) {
      const w = (x1 - x0) * c;
      k.box([w, 0.9, (o.d ?? 3) * 0.95], { p: [H.X((x0 + x1) / 2), H.Y(y) + 0.45, 0], col: o.col ?? 0x4b4f58, t: 0, b: 0.15, nofat: true });
      for (let x = H.X(x0) + 0.6; x < H.X(x1) - 0.4; x += 1.25) k.box([0.55, 0.55, (o.d ?? 3) * 1.02], { p: [x, H.Y(y) + 1.05, 0], col: 0x2d3037, t: 0, b: 0.08, nofat: true });
    },
    ring(x, y, R, col = BLK) { k.ring(R, 0.28, { p: [H.X(x), H.Y(y), 0], col, t: 1, seg: 10, nofat: true }); },
    /** tape wrapped around a horizontal part: cell-px x range, centre row y, half height/depth in cm */
    tapeX(x0, x1, y, hh, hd, col, o = {}) { k.xf({ r: [0, 0, -90], p: [0, H.Y(y), 0] }, () => k.tape(H.X(x0), H.X(x1), 1, { col, band: o.band ?? 1.1, rx: hh, rz: hd, n: 10, stripe: o.stripe })); },
    rivets(xs, y, col = 0xb9c0c8) { for (const x of xs) k.cyl(0.32, 0.32, 0.4, { p: [H.X(x), H.Y(y), 1.85], r: [90, 0, 0], col, t: 0, n: 6, b: 0.08, nofat: true }); },
    sight(x, y, h = 1.6, w = 0.9) { k.box([w, h, 1.0], { p: [H.X(x), H.Y(y) + h / 2, 0], col: 0x3b3f48, t: 0, b: 0.15, nofat: true }); },
    sockets(gripY, g2x, muzzleX, muzzleY) {
      k.grip([0, 0, 0], [1, 0, 0], [0, 1, 0]); k.grip2([H.X(g2x), H.Y(gripY), 0], [1, 0, 0], [0, 1, 0]);
      k.muzzle([H.X(muzzleX), H.Y(muzzleY), 0], [1, 0, 0]); k.tip([H.X(muzzleX), H.Y(muzzleY), 0]);
    },
  };
  return H;
}

const HAZ = 0xf2b924;

export default [
  weapon('rifle-side-fold', 'Rifle, side-fold stock', { hands: 2, kind: 'gun', blood: 0, rust: 0.25 }, (k) => {
    const h = gun(k, 'rifle-side-fold', { receiver: 3.8, stock: 3.0, mag: 2.6, grip: 3.0, barrel: 3.4 });
    h.rail(66, 172, 33, { col: 0x50545d }); h.rail(132, 190, 41, { d: 3.4 });
    h.sight(68, 33, 1.7); h.sight(172, 41, 2.6, 0.8);
    h.plate(108, 47.5, 129, 60, HAZ, { stripe: 1, z: 1.95 });
    h.rivets([68, 76, 84, 92, 100, 106], 45.5);
    h.ring(97, 61, 1.7);
    k.cyl(0.9, 1.0, 1.6, { p: [h.X(194), h.Y(44), 0], r: [0, 0, -90], col: 0x2a2c32, t: 0, n: 6, nofat: true });
    h.sockets(60, 150, 199, 44);
  }),

  weapon('ak-taped', 'AK rifle, taped stock', { hands: 2, kind: 'gun', blood: 0.18, rust: 0.3 }, (k) => {
    const h = gun(k, 'ak-taped', { receiver: 3.8, stock: 3.4, mag: 2.6, grip: 3.0, barrel: 3.2 }, { barrel: 0x3d3f45, stock: 0x4a4547 });
    h.plate(79, 47, 107, 56.5, 0xb9363a, { z: 1.95 });
    h.tapeX(149, 180, 44.5, 2.9, 2.5, 0xe9d9d1, { band: 1.2 });
    h.tapeX(66, 78, 53, 2.6, 1.9, 0xe9d9d1, { band: 1.0 });
    h.rail(84, 134, 33, { col: 0x474a52 });
    h.sight(236, 40, 3.2, 0.9); h.sight(80, 34, 1.4);
    h.ring(108, 55, 1.6);
    k.cyl(0.8, 0.9, 1.4, { p: [h.X(252), h.Y(46.5), 0], r: [0, 0, -90], col: 0x2a2c32, t: 0, n: 6, nofat: true });
    h.sockets(44, 165, 253, 46.5);
  }),

  weapon('shovel-rifle', 'Shovel-handle rifle', { hands: 2, kind: 'gun', blood: 0.05, rust: 0.4 }, (k) => {
    const h = gun(k, 'shovel-rifle', { receiver: 3.8, stock: 3.0, mag: 2.6, grip: 3.2, barrel: 3.6 });
    h.plate(102, 45, 149, 53, HAZ, { stripe: 1, z: 1.95 });
    h.tapeX(81, 94, 48, 2.0, 1.7, 0xe9cfc8, { band: 1.0 });
    h.rail(106, 208, 36, { d: 3.6 });
    h.plate(100, 84, 110, 88.5, 0x2f66d6, { z: 1.7, d: 0.5 });
    h.rivets([110, 146], 58);
    h.ring(124, 66, 1.7);
    h.sockets(44, 180, 228, 48);
  }),

  weapon('shotgun-pump-tape', 'Pump shotgun, taped', { hands: 2, kind: 'gun', blood: 0.07, rust: 0.3 }, (k) => {
    const h = gun(k, 'shotgun-pump-tape', { receiver: 3.8, stock: 2.4, grip: 3.2, pump: 4.8, barrel: 3.0 }, { stock: 0x4a4650, grip: 0x7a3a3a });
    h.tapeX(44, 70, 52.5, 3.0, 1.5, 0xf1eee8, { band: 1.5 });
    h.tapeX(232, 244, 45, 2.4, 2.0, 0xb9363a, { band: 1.0 });
    for (let i = 0; i < 5; i++) h.plate(168 + i * 3.4, 41, 170 + i * 3.4, 54, 0x2e3036, { z: 2.55, d: 0.3 });
    h.rail(95, 126, 36, { d: 3.2 });
    k.cyl(0.9, 0.9, 0.5, { p: [h.X(87), h.Y(45.5), 1.95], r: [90, 0, 0], col: 0xe0463a, t: 1, n: 8, nofat: true });
    h.ring(100, 62, 1.9, BLK);
    h.sight(250, 37.5, 1.3, 0.8);
    h.sockets(46, 190, 254, 41);
  }),

  weapon('smg-fold-stock', 'Compact SMG, folding stock', { hands: 2, kind: 'gun', blood: 0, rust: 0.2 }, (k) => {
    const h = gun(k, 'smg-fold-stock', { receiver: 3.8, stock: 2.6, mag: 2.6, grip: 3.0, barrel: 3.4 }, { grip: 0x7a3a3c });
    h.plate(58, 39, 70, 44, 0x8a2f34, { z: 1.7 });
    for (let i = 0; i < 3; i++) k.cyl(0.5, 0.5, 1.4, { p: [h.X(106 + i * 3), h.Y(37 + i * 4.2), 1.95], r: [0, 0, -90], col: 0xe0884a, t: 1, n: 6, nofat: true });
    h.rail(120, 151, 32.5, { d: 3.4 });
    for (let i = 0; i < 9; i++) h.plate(160 + i * 3.2, 43.5, 161.6 + i * 3.2, 48, 0x2b2e34, { z: 1.85, d: 0.4 });
    h.plate(120, 40, 134, 45, 0x7d2f34, { z: 1.95 });
    h.ring(124, 61, 1.8);
    h.rivets([66, 76, 86, 96], 58);
    h.sockets(44, 165, 204, 46);
  }),

  weapon('machine-pistol-a', 'Machine pistol A', { hands: 1, kind: 'gun', blood: 0, rust: 0.2 }, (k) => {
    const h = gun(k, 'machine-pistol-a', { receiver: 3.8, foregrip: 3.8, suppressor: 3.0, rear: 3.6 }, { foregrip: 0x5d5d63 });
    h.rail(66, 104, 38, { d: 3.4 });
    h.plate(110, 46, 122, 51, 0xb9363a, { z: 1.55 });
    h.tapeX(64, 82, 66, 3.1, 1.8, 0x6f6f77, { band: 1.5 });
    h.sight(74, 36, 1.4); h.sight(100, 34, 1.2);
    h.sockets(66, 100, 124, 44);
    k.grip([0, 0, 0], [1, 0, 0], [0, 1, 0]);
  }),

  weapon('machine-pistol-b', 'Machine pistol B', { hands: 1, kind: 'gun', blood: 0, rust: 0.2 }, (k) => {
    const h = gun(k, 'machine-pistol-b', { slide: 3.4, grip: 3.0 }, { grip: 0x2f5fb0, slide: 0x474b54 });
    h.plate(79, 36, 83.5, 54.5, 0x2f7ae0, { z: 1.8, d: 0.5 });
    h.tapeX(32, 50, 69, 4.2, 1.7, 0x2f6fe0, { band: 1.1 });
    h.rail(56, 79, 36.5, { d: 3.2 });
    h.ring(56, 59, 1.5);
    h.sight(84, 34, 1.3, 0.8); h.sight(34, 34, 1.3, 0.8);
    k.grip([0, 0, 0], [1, 0, 0], [0, 1, 0]); k.muzzle([h.X(98), h.Y(45), 0], [1, 0, 0]); k.tip([h.X(98), h.Y(45), 0]);
  }),
];
