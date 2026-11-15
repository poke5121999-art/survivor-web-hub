// Shared palette + weapon factories (cm units; melee: +Y toward tip, +X toward edge/up; guns: +X toward muzzle, +Y up)
import { knifeOutline, arc, teeth } from '../lib/kit.js';

export const C = {
  steel: 0x93a4b1, steelD: 0x667683, steelL: 0xc3d0d8, iron: 0x4a5560, black: 0x26272c, dark: 0x3a3c44,
  red: 0xc9302c, blue: 0x2f6fe0, teal: 0x2f8f8a, green: 0x2e9d57, orange: 0xec7a2a, yellow: 0xf2b924,
  wood: 0xa65a33, woodD: 0x7a4128, tape: 0xdad3c2, tapeD: 0xb8ae98, rustc: 0x8a4a2a, leather: 0x5b3a2a, pink: 0xd84a5a, purple: 0x8a3fc0,
};

/** Generic handled knife. */
export function knife(k, o) {
  const hl = o.hl ?? 10, hw = (o.hw ?? 2.6) * 1.25, hd = (o.hd ?? 2.4) * 1.2, L = o.L ?? 16, W = o.W ?? 4;
  const bcol = o.bcol ?? C.steel;
  if (o.round) k.cyl(hw * 0.5, hw * 0.55, hl, { col: o.hcol ?? C.black, t: 1, b: 0.35, n: 8 });
  else k.box([hw, hl, hd], { p: [0, hl / 2, 0], col: o.hcol ?? C.black, t: o.ht ?? 1, b: Math.min(0.6, hw * 0.25) });
  if (o.pommel) k.box([hw + 0.4, 1, hd + 0.4], { p: [0, 0.5, 0], col: o.pommel, t: 0, b: 0.25 });
  if (o.wrap) k.tape(o.wrap.y0 ?? 1, o.wrap.y1 ?? hl - 0.5, 1, { col: o.wrap.col, band: o.wrap.band ?? 1, rx: hw / 2, rz: hd / 2 });
  for (const b of o.bands || []) k.box([hw + 0.35, b.h ?? 1.2, hd + 0.35], { p: [0, b.y, 0], col: b.col, t: b.t ?? 1, b: 0.2, stripe: b.stripe });
  if (o.bolster) k.box([hw + 0.5, 1.5, hd + 0.5], { p: [0, hl - 0.3, 0], col: o.bolster, t: o.bolsterT ?? 0, b: 0.35 });
  if (o.guard) k.box([W + (o.guardW ?? 3), 0.9, 1.9], { p: [0, hl, 0], col: o.gcol ?? C.steelD, t: 0, b: 0.3 });
  const pts = (o.pts || knifeOutline(L, W, { tip: o.tip, tipLen: o.tipLen })).map(([x, y]) => [x, y + hl]);
  k.blade(pts, { d: o.bd ?? 0.65, b: o.bb ?? 0.3, col: bcol, t: 0 });
  if (o.spine) k.box([0.5, L * 0.8, 0.9], { p: [-W / 2 + 0.3, hl + L * 0.4, 0], col: C.steelD, t: 0, b: 0.15 });
  for (let i = 0; i < (o.dots ?? 0); i++) k.cyl(0.38, 0.38, 0.45, { p: [0, hl * (0.2 + 0.28 * i) + 0.6, hd / 2 - 0.15], r: [90, 0, 0], col: o.dotc ?? C.steelL, t: 0, b: 0.1, n: 6 });
  k.grip([0, hl * 0.45, 0], [0, 1, 0], [1, 0, 0]);
  k.tip([0, hl + L, 0]); k.edge([W / 2, hl, 0], [W / 2, hl + L * 0.85, 0]);
}

/** Throwing knife: hex ring pommel, chunky handle, kite blade. */
export function thrower(k, o) {
  const L = o.L ?? 16, W = o.W ?? 4, col = o.col ?? 0x91a8b6, hc = o.hcol ?? 0x5f8f9a, hh = o.hh ?? 6;
  k.hexRing(2.7, 1.4, 1.1, { p: [0, 2.7, 0], col, t: 0 });
  k.box([3.6, hh, 2.8], { p: [0, 5 + hh / 2, 0], col: hc, t: 1, b: 0.8 });
  if (o.slot) k.box([1.2, 4, 3], { p: [0, 8.5, 0], col: 0x2c3e46, t: 1, b: 0.3 });
  const y0 = 5 + hh - 0.5;
  const pts = o.tip === 'straight'
    ? [[-W * 0.4, 0], [W * 0.4, 0], [W / 2, L * 0.15], [W / 2, L * 0.92], [-W / 2, L]]
    : [[-W * 0.4, 0], [W * 0.4, 0], [W / 2, L * 0.25], [W * 0.1, L], [-W / 2, L * 0.25]];
  k.blade(pts.map(([x, y]) => [x, y + y0]), { d: 0.9, b: 0.32, col, t: 0 });
  k.grip([0, 8, 0]); k.tip([0, y0 + L, 0]); k.edge([W / 2, y0 + 2, 0], [W / 2, y0 + L * 0.9, 0]);
}

/** Wooden shaft tool (axe/hatchet/pick): returns nothing; shaft along +Y from 0..len. */
export function shaft(k, len, r, o = {}) {
  const r0 = o.r0 ?? r, r1 = o.r1 ?? r;
  k.cyl(r1, r0, len, { col: o.col ?? C.wood, t: 3, b: 0.3, n: o.n ?? 8, smooth: true });
  if (o.knob) k.cyl(r0 * 1.25, r0 * 0.9, 1.4, { col: o.col ?? C.wood, t: 3, b: 0.3, n: 8 });
}

export { knifeOutline, arc, teeth };
