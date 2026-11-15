// Silhouettes traced from the owner's sheet by the stylized kit's tools/trace-profile.js (copied as traced-data.js,
// cm, origin bottom-centre). Here they are rebuilt as real steel: one-piece blanks with ground edges, cord wraps,
// screwed scales.
import { weapon } from '../js/weapon.js';
import DATA from './traced-data.js';
import { G, C, edgeRuns, wrap, arc, roundPoly } from './common.js';

const bounds = (pts) => { const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; };
const part = (id, name) => DATA[id].parts.find((p) => p.name === name);

/** one-piece throwing knife: blank with a ground double edge on the upper part, paracord wrap, ring pommel */
export function thrower(id, name, o = {}) {
  return weapon(id, name, { rot: 0 }, (k) => {
    const d = DATA[id];
    const body = part(id, 'body'), ring = part(id, 'ring'), blade = part(id, 'blade');
    const all = body || blade, b = bounds(all.outline), L = b.y1 - b.y0;
    const steel = o.mat ?? 'steel_satin';
    const edgeFrom = body ? b.y0 + L * 0.5 : b.y0 + L * 0.2;
    k.add(G.blade(all.outline, { d: 0.42, b: 0.05, edge: edgeRuns(all.outline, (p) => p[1] > edgeFrom), grind: 0.9, thin: 0.14, holes: all.holes.length ? all.holes : null }), steel, { wear: 0.25, grain: 'y', blood: o.blood });
    if (ring) k.add(G.extrude(ring.outline, 0.45, 0.1, ring.holes.length ? ring.holes : [arc(0, 1.7, 0.75, 360, 0, 14).slice(0, -1)]), steel, { wear: 0.3 });
    else k.add(G.pipe(0.55, 0.47, 0.25, 14), steel, { p: [0, b.y0 + 1.0, -0.235], r: [90, 0, 0] });
    // handle zone: cord wrap or skeleton slot
    const hy0 = b.y0 + (ring ? 3.6 : 2.2), hy1 = b.y0 + L * (body ? 0.42 : 0.38);
    const hw = body ? Math.min(1.05, (b.x1 - b.x0) * 0.42) : 0.8;
    if (id === 'thrower-slot') k.add(G.box(0.5, (hy1 - hy0) * 0.7, 0.5, 0.2), 'steel_dark', { p: [0, (hy0 + hy1) / 2, 0] });
    else wrap(k, hy0, hy1, hw, 0.32, ['rope'], { band: 0.5, tilt: 14, t: 0.12, over: 0.05, col: o.cord ?? [0.55, 0.75, 0.8] });
    k.grip([0, (hy0 + hy1) / 2, 0], [0, 1, 0], [1, 0, 0]);
    const top = all.outline.reduce((a, q) => (q[1] > a[1] ? q : a));
    k.tip([top[0], top[1], 0]); k.edge([b.x1, edgeFrom, 0], [top[0], b.y1 * 0.95, 0]);
  });
}

export function kunai(id, name, wrapCol) {
  return weapon(id, name, { rot: 0 }, (k) => {
    const ring = part(id, 'ring'), wr = part(id, 'wrap'), bl = part(id, 'blade');
    const w = bounds(wr.outline), bb = bounds(bl.outline), cx = (w.x0 + w.x1) / 2;
    k.add(G.blade(bl.outline, { d: 0.55, b: 0.05, edge: edgeRuns(bl.outline, (p) => p[1] > bb.y0 + 1.5), grind: 1.4, thin: 0.12 }), 'steel_dark', { wear: 0.35, grain: 'y' });
    // diamond ridge along the blade centre
    k.add(G.blade([[0, bb.y0 + 1], [0.5, bb.y0 + 6], [0, bb.y1 - 0.8], [-0.5, bb.y0 + 6]], { d: 0.75, b: 0.03 }), 'steel_dark', { wear: 0.3 });
    k.add(G.cyl(0.55, 0.55, w.y1 - w.y0, 12, 0.1), 'steel_dark', { p: [cx, w.y0, 0] });
    wrap(k, w.y0 + 0.2, w.y1 - 0.2, Math.max(0.65, (w.x1 - w.x0) / 3.2), 0.62, ['fabric', wrapCol], { band: 0.9, tilt: 16, cross: true, t: 0.1 });
    k.add(G.extrude(ring.outline, 0.5, 0.12, ring.holes.length ? ring.holes : [arc(0, (bounds(ring.outline).y1) / 2, 0.8, 360, 0, 14).slice(0, -1)]), 'steel_dark', { wear: 0.35 });
    k.grip([cx, (w.y0 + w.y1) / 2, 0], [0, 1, 0], [1, 0, 0]); k.tip([0, bb.y1, 0]); k.edge([bb.x1, bb.y0 + 4, 0], [0.2, bb.y1 - 1, 0]);
  });
}

export const karambit = () => weapon('karambit', 'Karambit', { rot: 0 }, (k) => {
  const h = part('karambit', 'handle'), bl = part('karambit', 'blade'), hb = bounds(h.outline), bb = bounds(bl.outline);
  // inner (concave) curve is the edge: points on the +X half of the hooked blade, below its tip
  const tip = bl.outline.reduce((a, q) => (q[1] > a[1] ? q : a));
  k.add(G.blade(bl.outline, { d: 0.42, b: 0.05, edge: edgeRuns(bl.outline, (p) => p[0] > tip[0] - 0.2 && p[1] < tip[1] - 0.2 && p[1] > bb.y0 + 0.6), grind: 1.0, thin: 0.12 }), 'steel_dark', { wear: 0.3, grain: 'y' });
  k.add(G.extrude(h.outline, 0.38, 0.04, h.holes.length ? h.holes : null), 'steel_satin', {});
  for (const s of [-1, 1]) k.add(G.extrude(h.outline.map(([x, y]) => [x * 0.96, y]), 0.6, 0.25, h.holes.length ? h.holes : null), ['polymer', 0x22252a], { p: [0, 0, s * 0.49] });
  k.add(G.pipe(1.15, 1.7, 0.3, 18), 'steel_satin', { p: [(hb.x0 + hb.x1) / 2, hb.y0 + 1.2, -0.85], r: [90, 0, 0] });
  k.add(G.box(hb.x1 - hb.x0 + 0.3, 1.1, 1.9, 0.3), ['paint', C.red], { p: [(hb.x0 + hb.x1) / 2 + 0.1, hb.y1 - 0.6, 0] });
  for (let i = 0; i < 2; i++) k.add(G.cyl(0.28, 0.28, 1.85, 10, 0.06), 'steel_satin', { p: [(hb.x0 + hb.x1) / 2 + 0.2, hb.y0 + 3.2 + i * 2.6, -0.925], r: [90, 0, 0] });
  k.grip([(hb.x0 + hb.x1) / 2, (hb.y0 + hb.y1) / 2, 0], [0, 1, 0], [1, 0, 0]); k.tip([tip[0], tip[1], 0]); k.edge([bb.x1, bb.y0 + 2, 0], [tip[0], tip[1] - 1, 0]);
});

export const kukri = () => weapon('kukri', 'Kukri', { rot: 0 }, (k) => {
  const h = part('kukri', 'handle'), bl = part('kukri', 'blade'), hb = bounds(h.outline), bb = bounds(bl.outline);
  const cx = (hb.x0 + hb.x1) / 2;
  // edge on the concave (+X) side of the recurve
  k.add(G.blade(bl.outline, { d: 0.75, b: 0.06, edge: edgeRuns(bl.outline, (p) => p[0] > cx + 0.6 && p[1] > bb.y0 + 1.2), grind: 2.4, thin: 0.09 }), 'steel_satin', { wear: 0.25, grain: 'y' });
  const hw = hb.x1 - hb.x0;
  k.add(G.lathe([[0, 0], [hw * 0.55, 0], [hw * 0.62, 0.6], [hw * 0.48, 3], [hw * 0.6, 7], [hw * 0.5, 11.5], [hw * 0.56, 14], [0, 14.4]].map(([r, y]) => [r * 0.95, y]), 18), 'wood', { p: [cx, hb.y0, 0], col: [0.45, 0.34, 0.3], grain: 'y' });
  k.add(G.cyl(hw * 0.6, hw * 0.6, 1.0, 18, 0.15), 'brass', { p: [cx, hb.y1 - 0.7, 0], wear: 0.3 });
  k.add(G.cyl(hw * 0.62, hw * 0.55, 0.7, 18, 0.15), 'brass', { p: [cx, hb.y0, 0], wear: 0.3 });
  k.grip([cx, hb.y0 + 7, 0], [0, 1, 0], [1, 0, 0]);
  const tip = bl.outline.reduce((a, q) => (q[1] > a[1] ? q : a));
  k.tip([tip[0], tip[1], 0]); k.edge([bb.x1, bb.y0 + 6, 0], [tip[0], tip[1] - 2, 0]);
});

export const ladderSaw = () => weapon('ladder-saw', 'Frame saw', { hands: 2, rot: 0, blood: 0.12 }, (k) => {
  const body = part('ladder-saw', 'body'), b = bounds(body.outline), mid = (b.y0 + b.y1) / 2;
  // tubular steel frame (C-shape) + toothed blade along the open side, tensioner, end blocks
  const fx = b.x0 + 1.2;
  k.add(G.cyl(1.05, 1.05, b.y1 - b.y0 - 4, 16, 0.1), ['paint', 0x8a949c], { p: [fx, b.y0 + 2, 0], wear: 0.3, grime: 0.3 });
  for (const y of [b.y0 + 2, b.y1 - 2]) k.add(G.cyl(0.95, 0.95, b.x1 - b.x0 - 4.5, 14, 0.1), ['paint', 0x8a949c], { p: [fx, y, 0], r: [0, 0, -90], wear: 0.3 });
  const bx = b.x1 - 2.6, teethPts = [];
  for (let i = 0; i <= 30; i++) { const y = b.y0 + 3 + (b.y1 - b.y0 - 6) * i / 30; teethPts.push([bx + 2.2 + (i % 2) * 0.9, y]); }
  const blade = [[bx - 1.6, b.y0 + 3], ...teethPts, [bx - 1.6, b.y1 - 3]];
  k.add(G.blade(blade, { d: 0.14, b: 0.02, edge: [[1, teethPts.length]], grind: 0.8 }), 'steel_rusty', { wear: 0.2, blood: 0.18 });
  for (const y of [b.y0 + 2, b.y1 - 2]) k.add(G.box(4.2, 2.6, 2.4, 0.4), ['paint', 0x2a55b0], { p: [b.x1 - 3.4, y, 0], wear: 0.4 });
  k.add(G.cyl(1.5, 1.5, 3.4, 8, 0.2), ['paint', C.orange], { p: [fx, mid + 2, 0], wear: 0.4 });
  k.add(G.cyl(0.6, 0.6, 5, 10, 0.1), 'steel_satin', { p: [fx - 2.4, mid + 3.7, 0], r: [0, 0, -90] });
  wrap(k, b.y0 + 6, mid - 6, 1.1, 1.1, ['tape', C.tapeDirty], { band: 1.8 });
  k.grip([fx, mid - 12, 0], [0, 1, 0], [1, 0, 0]); k.grip2([fx, mid + 12, 0], [0, 1, 0], [1, 0, 0]); k.tip([bx, b.y1, 0]); k.edge([bx + 2, b.y0 + 4, 0], [bx + 2, b.y1 - 4, 0]);
});
