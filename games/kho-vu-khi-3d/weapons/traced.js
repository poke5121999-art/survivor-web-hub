// Melee weapons whose silhouette is TRACED from the owner sheet (tools/trace-profile.js -> lib/guns/data.js).
// Origin is bottom-centre of the item, +Y up the weapon, thin parts extruded along Z, details added on top.
import { weapon } from '../lib/weapon.js';
import DATA from '../lib/guns/data.js';

const lum = (c, m = 1.15) => (Math.min(255, c[0] * m) << 16) | (Math.min(255, c[1] * m) << 8) | Math.min(255, c[2] * m);

/** Extrude every traced part of `id`; returns bounds per part and overall. spec[name] = {d, col, t} */
function tr(k, id, spec = {}) {
  const g = DATA[id], B = {};
  for (const p of g.parts) {
    if (p.outline.length < 3) continue;
    const s = spec[p.name] || {};
    const xs = p.outline.map((q) => q[0]), ys = p.outline.map((q) => q[1]);
    B[p.name] = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    k.blade(p.outline, { holes: p.holes.length ? p.holes : undefined, d: s.d ?? 1, b: Math.min(0.4, (s.d ?? 1) * 0.2), col: s.col ?? lum(p.color), t: s.t ?? 0, cs: 2, nofat: true });
  }
  const xs = g.outline.map((q) => q[0]), ys = g.outline.map((q) => q[1]);
  const top = g.outline.reduce((a, q) => (q[1] > a[1] ? q : a), g.outline[0]);
  const all = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), top };
  return { g, B, all };
}
const sock = (k, T, gripY, edge = true) => {
  k.grip([0, gripY, 0], [0, 1, 0], [1, 0, 0]); k.tip([T.all.top[0], T.all.y1, 0]);
  if (edge) k.edge([T.all.x1, T.all.y0 + (T.all.y1 - T.all.y0) * 0.45, 0], [T.all.top[0] + 0.2, T.all.y1 * 0.95, 0]);
};

function thrower(id, name, o = {}) {
  return weapon(id, name, { rot: 0 }, (k) => {
    const T = tr(k, id, { ring: { d: 1.1, col: 0x7f9fb0 }, blade: { d: 1.0, col: 0x86acba }, body: { d: 1.0, col: o.col ?? 0x7fa6b4 } });
    if (o.band) k.box([T.all.x1 - T.all.x0 + 0.3, 0.8, 1.3], { p: [(T.all.x0 + T.all.x1) / 2, (T.all.y1 - T.all.y0) * 0.3, 0], col: 0x3d5a66, t: 1, b: 0.2, nofat: true });
    sock(k, T, (T.all.y1 - T.all.y0) * 0.3);
  });
}
function kunai(id, name, wrapCol) {
  return weapon(id, name, { rot: 0 }, (k) => {
    const T = tr(k, id, { ring: { d: 1.0, col: 0xa7b4bf }, wrap: { d: 1.7, col: wrapCol, t: 2 }, blade: { d: 0.9, col: 0xa4b8ae } });
    const w = T.B.wrap, cx = (w.x0 + w.x1) / 2;
    k.tape(w.y0 + 0.2, w.y1 - 0.2, 1, { p: [cx, 0, 0], rx: (w.x1 - w.x0) / 2.3, rz: 0.9, col: wrapCol, band: 1.0, n: 8 });
    k.box([0.5, (T.B.blade.y1 - T.B.blade.y0) * 0.6, 1.1], { p: [cx, T.B.blade.y0 + (T.B.blade.y1 - T.B.blade.y0) * 0.5, 0], col: 0x7a8d84, t: 0, b: 0.15, nofat: true });
    sock(k, T, (w.y0 + w.y1) / 2);
  });
}

export default [
  thrower('thrower-slim', 'Throwing knife (slim)'),
  thrower('thrower-slot', 'Throwing knife (slot)'),
  thrower('thrower-hex', 'Throwing knife (hex)'),
  thrower('thrower-teal-hex', 'Throwing knife (hex pommel)', { band: false }),
  thrower('thrower-teal-slim', 'Throwing knife (slim ring)'),
  kunai('kunai-green', 'Kunai (green)', 0x6f9a2e),
  kunai('kunai-purple', 'Kunai (purple)', 0x8a3fc0),

  weapon('karambit', 'Karambit', { rot: 0, rust: 0.2 }, (k) => {
    const T = tr(k, 'karambit', { handle: { d: 2.8, col: 0x2a2b30, t: 1 }, blade: { d: 0.9, col: 0xa9bac6 } });
    const h = T.B.handle;
    k.box([h.x1 - h.x0 + 0.5, 1.3, 3.2], { p: [(h.x0 + h.x1) / 2 + 0.2, h.y1 - 0.5, 0], col: 0xc23a36, t: 1, b: 0.25, nofat: true });
    for (let i = 0; i < 2; i++) k.cyl(0.38, 0.38, 0.4, { p: [(h.x0 + h.x1) / 2 + 0.2, h.y0 + 2 + i * 3, 1.5], r: [90, 0, 0], col: 0x8d96a0, t: 0, n: 6, nofat: true });
    sock(k, T, h.y0 + (h.y1 - h.y0) * 0.5);
  }),

  weapon('kukri', 'Kukri', { rot: 0, rust: 0.3 }, (k) => {
    const T = tr(k, 'kukri', { handle: { d: 2.6, col: 0x232429, t: 1 }, blade: { d: 0.9, col: 0xa3b4bf } });
    const h = T.B.handle;
    k.box([h.x1 - h.x0 + 0.8, 1.2, 3.0], { p: [(h.x0 + h.x1) / 2, h.y1, 0], col: 0x6d7782, t: 0, b: 0.25, nofat: true });
    sock(k, T, h.y0 + (h.y1 - h.y0) * 0.45);
  }),

  weapon('ladder-saw', 'Frame saw', { hands: 2, rot: 0, rust: 0.3, blood: 0.1 }, (k) => {
    const T = tr(k, 'ladder-saw', { body: { d: 1.6, col: 0x93a2ad } });
    const a = T.all, mid = (a.y0 + a.y1) / 2;
    k.cyl(2.0, 2.0, 3.2, { p: [a.x0 + 0.9, mid + 3, 0], col: 0xe9822e, t: 1, n: 6, nofat: true });
    k.cyl(1.3, 1.3, 4.4, { p: [a.x0 + 0.9, mid + 4.4, 0], r: [0, 0, 90], col: 0xe9822e, t: 1, n: 6, nofat: true });
    k.box([3.2, 3.2, 3.0], { p: [a.x0 + 1.4, a.y1 - 1.6, 0], col: 0x2f6fe0, t: 1, b: 0.6, nofat: true });
    k.box([3.2, 3.2, 3.0], { p: [a.x0 + 1.4, a.y0 + 1.6, 0], col: 0x2f6fe0, t: 1, b: 0.6, nofat: true });
    k.box([5.2, 3.0, 3.0], { p: [a.x1 - 6, a.y1 - 2, 0], col: 0x6a737c, t: 0, b: 0.6, nofat: true });
    k.box([5.2, 3.0, 3.0], { p: [a.x1 - 6, a.y0 + 2, 0], col: 0x6a737c, t: 0, b: 0.6, nofat: true });
    k.grip([a.x0 + 1, mid - 12, 0], [0, 1, 0], [1, 0, 0]); k.grip2([a.x1 - 6, mid, 0], [0, 1, 0], [1, 0, 0]); k.tip([0, a.y1, 0]);
  }),
];
