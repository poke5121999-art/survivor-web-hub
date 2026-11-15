// Furniture, fabric, wood: chairs, seats, mattresses, bedrolls, pallets, tarp crates, logs, planks, workbench.
import * as THREE from '../vendor/three.module.min.js';
import { Prop } from '../lib/prop.js';
import * as parts from '../lib/parts.js';


const PI = Math.PI;

// Soft rounded box: subdivided BoxGeometry -> rounded box -> puff/sag/bulge/folds/hem. Returns geometry (use p.geom).
function softGeom(size, o = {}) {
  const [w, h, d] = size, hw = w / 2, hh = h / 2, hd = d / 2;
  const n = (dim, mx) => Math.max(2, Math.min(mx, Math.round(dim / 0.075)));
  const sx = o.sx ?? n(w, 10), sy = o.sy ?? Math.max(2, Math.min(6, Math.round(h / 0.08))), sz = o.sz ?? n(d, 9);
  const g = new THREE.BoxGeometry(w, h, d, sx, sy, sz);
  const r = Math.min(o.r ?? 0.05, Math.min(hw, hh, hd) * 0.95);
  const pos = g.attributes.position, nor = g.attributes.normal;
  const puff = o.puff ?? 0, bulge = o.bulge ?? 0, fold = o.fold, hem = o.hem, ridge = o.ridge, flare = o.flare ?? 0, ph = o.phase ?? 0;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const cx = Math.max(-(hw - r), Math.min(hw - r, x)), cy = Math.max(-(hh - r), Math.min(hh - r, y)), cz = Math.max(-(hd - r), Math.min(hd - r, z));
    let nx = x - cx, ny = y - cy, nz = z - cz; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    x = cx + nx * r; y = cy + ny * r; z = cz + nz * r;
    const u = x / hw, v = z / hd, wv = y / hh, t = (y + hh) / (2 * hh);
    if (puff && y > 0) y += puff * (1 - u * u) * (1 - v * v) * Math.min(1, y / hh + 0.2);
    if (bulge) { const k = 1 + bulge * (1 - wv * wv); x *= k; z *= k; }
    if (fold && Math.abs(ny) < 0.8) {
      const sc = Math.abs(nz) > Math.abs(nx) ? x : z;
      const off = fold.amp * Math.sin(fold.freq * sc + ph + 2.1 * (Math.abs(nz) > Math.abs(nx) ? 0 : 1)) * (0.25 + 0.75 * (1 - t));
      x += nx * off; z += nz * off;
    }
    if (flare) { x += nx * flare * (1 - t); z += nz * flare * (1 - t); }
    if (ridge && ny > 0.6) y += ridge.amp * Math.sin(ridge.freq * (ridge.axis === 'z' ? z : x) + ph);
    if (hem && t < 0.35) y -= hem.amp * (0.5 + 0.5 * Math.sin(hem.freq * (x + 1.3 * z) + ph)) * (1 - t / 0.35);
    pos.setXYZ(i, x, y, z); nor.setXYZ(i, nx, ny, nz);
  }
  g.deleteAttribute('uv');
  return g;
}
// rolled pad / sleeping roll along local Y (rotate with rot), slightly bulged, rounded ends
function softRollPts(r, len, bulge = 0.08) {
  const pts = [[0, -len / 2]]; const N = 8;
  for (let k = 0; k <= N; k++) { const s = k / N; pts.push([r * (0.93 + bulge * Math.sin(Math.PI * s)) * (k === 0 || k === N ? 0.9 : 1), -len / 2 + len * s]); }
  pts.push([0, len / 2]); return pts;
}

// Prop with a cheaper box(): thin parts are flat 12-tri boxes, others 1-segment bevels (108 tris);
// pass hi:true for soft chunky parts (2-segment bevel). parts.* helpers call p.box so they benefit too.
function mk(id, seed, opts) {
  const p = new Prop(id, seed, opts);
  const box = p.box.bind(p);
  p.box = (size, o = {}) => {
    if (!o.hi) return box(size, { ...o, round: o.segs === 1 ? 1 : 0 });
    const m = Math.min(...size);
    const g = softGeom(size, { r: (o.bevel ?? 0.03) * 1.8, puff: o.puff ?? Math.min(0.03, m * 0.1), bulge: o.bulge ?? 0.03, ...(o.soft || {}) });
    return p.geom(g, o);
  };
  const cyl = p.cyl.bind(p);
  p.cyl = (r, h, o = {}) => cyl(r, h, { ...o, seg: o.seg ?? 10, bevel: (r < 0.03 || h < 0.03) ? 0 : o.bevel });
  return p;
}
// drop the lowest point of `root` onto y = 0 by moving `node`
function settle(root, node) {
  root.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(root);
  node.position.y -= bb.min.y;
}

// ---------------------------------------------------------------- pallet
function palletBody(p, o = {}) {
  const [ox, oy, oz] = o.at || [0, 0, 0];
  const wood = p.paint('plywood', { color: o.color || '#f2c6a0' });
  const dark = p.paint('plywood', { color: '#e0a87c' });
  const L = 1.2, W = 0.8, t = 0.03, br = o.broken || 0;
  for (let i = 0; i < 5; i++) { // wide top boards with see-through gaps
    const z = -W / 2 + 0.06 + i * (W - 0.12) / 4;
    if (br && p.chance(br * 0.3)) continue;
    const brk = br && p.chance(br * 0.5);
    const len = brk ? L * 0.8 : L - p.r() * 0.02;
    parts.plank(p, { size: [len, t, 0.1], at: [ox + (brk ? -(L - len) / 2 : 0), oy + 0.15 - t / 2, oz + z], paint: wood, broken: brk, rot: [0, (p.r() - 0.5) * 0.02, 0] });
  }
  for (const x of [-L / 2 + 0.07, 0, L / 2 - 0.07]) for (const z of [-W / 2 + 0.07, 0, W / 2 - 0.07])
    p.box([0.14, 0.09, 0.14], { at: [ox + x, oy + 0.075, oz + z], paint: dark, bevel: 0.012 });
  for (const x of [-L / 2 + 0.07, 0, L / 2 - 0.07]) p.box([0.14, 0.03, W], { at: [ox + x, oy + 0.015, oz], paint: wood, bevel: 0.01 });
}
export function pallet(seed = 1, opts = {}) {
  const p = mk('pallet', seed, opts);
  palletBody(p, opts);
  return p.done();
}

// ---------------------------------------------------------------- tarp helpers
// Draped tarp over a box region (w x d, top at topY). Soft deformed bevel boxes + gathered folds.
function tarpOver(p, o) {
  const { w, d, topY, drop = 0.2, over = 0.04, paint } = o, at = o.at || [0, 0, 0];
  const t = 0.04, W = w + over * 2, D = d + over * 2, H = drop + t;
  const g = softGeom([W, H, D], { r: 0.06, sx: 12, sy: 6, sz: 9, puff: 0.03, bulge: 0.0, flare: o.flare ?? 0.03,
    fold: { amp: o.amp ?? 0.02, freq: 21 }, hem: { amp: 0.045, freq: 8 }, ridge: { amp: 0.012, freq: 17, axis: 'z' }, phase: p.r() * 6 });
  p.geom(g, { paint, at: [at[0], topY + t - H / 2, at[2]] });
}
function tarpPaint(p, color, col2) {
  return p.paint('tarp', { color, col2, under: color, pattern: 'mottle', patW: 0.18, chip: 0, dirt: 0.5 * Math.min(1.4, 0.5 + p.wear / 1.2) });
}

// ---------------------------------------------------------------- pallet table
export function palletTable(seed = 1, opts = {}) {
  const p = mk('pallet_table', seed, opts);
  const blockH = 0.39, topY = blockH + 0.144;
  const conc = p.paint('concrete', { color: '#a9adb0' });
  const L = 1.2, W = 0.8;
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    parts.cinderBlock(p, { at: [sx * (L / 2 - 0.12), blockH / 2, sz * (W / 2 - 0.12) * 0.9], rot: [0, 0, PI / 2], paint: conc });
  palletBody(p, { at: [0, blockH, 0], color: opts.color || '#d98268', broken: opts.broken || 0 });
  if (opts.tarp !== false) {
    const col = opts.tarpColor || '#79c43a';
    tarpOver(p, { w: 0.86, d: 0.62, topY: topY + 0.005, at: [0.05, 0, 0.02], drop: 0.2, over: 0.03, flare: 0.2, paint: tarpPaint(p, col, '#5da02a') });
  }
  return p.done();
}

// ---------------------------------------------------------------- tarp crates
function tarpCrate(id, seed, opts, def) {
  const p = mk(id, seed, opts);
  const w = def.w ?? 1.0, h = def.h ?? 0.56, d = def.d ?? 0.62;
  const wood = p.paint('wood', { color: opts.wood || '#a8756a', under: '#d8b8a0' });
  const wood2 = p.paint('wood', { color: '#8a5f58', under: '#c8a890' });
  const nb = def.rows ?? 4;
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) p.box([0.08, h, 0.08], { at: [sx * (w / 2 - 0.04), h / 2, sz * (d / 2 - 0.04)], paint: wood2, bevel: 0.01, segs: 1 });
  for (const sz of [-1, 1]) for (let i = 0; i < nb; i++) p.box([w - 0.04, h / nb - 0.014, 0.03], { at: [0, h / nb / 2 + i * h / nb + 0.004, sz * (d / 2 - 0.015)], paint: i % 2 ? wood : wood2, bevel: 0.007 });
  for (const sx of [-1, 1]) for (let i = 0; i < nb; i++) p.box([0.03, h / nb - 0.014, d - 0.1], { at: [sx * (w / 2 - 0.015), h / nb / 2 + i * h / nb + 0.004, 0], paint: i % 2 ? wood : wood2, bevel: 0.007 });
  if (def.brace) { // X braces on the front and sides
    const bl = Math.hypot(w - 0.2, h - 0.1), ba = Math.atan2(h - 0.1, w - 0.2);
    for (const k of [-1, 1]) p.box([bl, 0.07, 0.03], { at: [0, h / 2, d / 2 + 0.01], rot: [0, 0, k * ba], paint: wood, bevel: 0.01, segs: 1 });
    const sl = Math.hypot(d - 0.2, h - 0.1), sa = Math.atan2(h - 0.1, d - 0.2);
    for (const k of [-1, 1]) p.box([0.03, 0.07, sl], { at: [w / 2 + 0.01, h / 2, 0], rot: [k * sa, 0, 0], paint: wood, bevel: 0.01, segs: 1 });
  }
  p.box([w - 0.06, 0.03, d - 0.06], { at: [0, h - 0.015, 0], paint: wood2, bevel: 0.008 });
  if (opts.broken) // a slat knocked loose
    p.box([0.5, 0.05, 0.025], { at: [0.45, 0.025, d / 2 + 0.08], rot: [-0.9, 0.3, 0.1], paint: wood, bevel: 0.006 });
  const tp = tarpPaint(p, def.color, def.col2);
  const drop = opts.drop ?? def.drop ?? 0.36;
  tarpOver(p, { w, d, topY: h, drop, over: def.over ?? 0.05, flare: 0.1, paint: tp, amp: def.amp ?? 0.022 });
  const sp = p.paint('fabric', { color: '#3e4640', chip: 0, rust: 0 });
  const bandH = drop + 0.05;
  const bx = def.straps || [-0.28, 0.28];
  for (const x of bx) parts.strapBox(p, { size: [w, bandH, d + 0.13 + (def.strapPad ?? 0)], at: [x, h + 0.04 - bandH / 2 + 0.014 + (def.strapLift ?? 0), 0], axis: 'x', t: 0, width: 0.075, paint: sp });
  return p.done();
}
export function tarpCrateGreen(seed = 1, opts = {}) { return tarpCrate('tarp_crate_green', seed, opts, { color: '#80c648', col2: '#64a83a' }); }
export function tarpCrateBlue(seed = 1, opts = {}) { return tarpCrate('tarp_crate_blue', seed, opts, { color: '#4a54cc', col2: '#363ea8', w: 0.8, h: 0.62, d: 0.72, rows: 3, brace: true, drop: 0.26, over: 0.07, straps: [-0.15, 0.15], strapLift: 0.04, strapPad: 0.1 }); }

// ---------------------------------------------------------------- mattresses & mats
export function mattress(seed = 1, opts = {}) {
  const p = mk('mattress', seed, opts);
  const base = opts.color || '#c4c7c9';
  const body = p.paint('fabric', { color: base, col2: opts.stain || '#b9bcbe', under: '#a3a6a8', pattern: 'stains', patW: 0.16, dirt: 0.55 * p.wear / 0.6, rough: 0.8 });
  const trim = p.paint('fabric', { color: '#a9acaf', chip: 0, dirt: 0.5 });
  p.box([1.5, 0.3, 1.0], { at: [0, 0.15, 0], paint: body, bevel: 0.11, hi: true, deform: { amp: 0.014, freq: 3 } });
  p.box([1.52, 0.04, 1.02], { at: [0, 0.085, 0], paint: trim, bevel: 0.015, segs: 1 });
  for (let i = 0; i < 3; i++) p.cyl(0.03, 0.012, { at: [-0.4 + i * 0.4, 0.285, (i % 2 ? 0.18 : -0.18)], paint: trim, seg: 8 });
  const ys = p.paint('paint', { color: '#e8b832', chip: 0.3, dirt: 0.3 });
  p.box([0.1, 0.012, 0.08], { at: [-0.45, 0.305, -0.3], rot: [0, 0.5, 0], paint: ys, bevel: 0.003 });
  p.box([0.08, 0.012, 0.07], { at: [0.62, 0.17, 0.45], rot: [0, 0.5, 0], paint: ys, bevel: 0.003 });
  if (opts.torn) {
    const foam = p.paint('fabric', { color: '#d9c066', chip: 0, dirt: 0.2 });
    p.box([0.34, 0.03, 0.26], { at: [0.45, 0.285, 0.25], rot: [0, 0.4, 0.05], paint: p.paint('fabric', { color: '#4a4540', chip: 0 }), bevel: 0.01, segs: 1 });
    p.blob(0.12, { at: [0.45, 0.3, 0.25], scale: [1.3, 0.35, 0.9], paint: foam });
    p.blob(0.08, { at: [0.28, 0.295, 0.28], scale: [1.3, 0.35, 0.9], paint: foam });
  }
  return p.done();
}
export function sleepMatFlat(seed = 1, opts = {}) {
  const p = mk('sleep_mat_flat', seed, opts);
  const c = p.paint('fabric', { color: opts.color || '#cdc0b8', col2: '#a89c96', pattern: 'grid', patW: 0.42, under: '#9a8e8a', dirt: 0.5, rough: 0.9 });
  const top = p.paint('fabric', { color: '#ddd2cb', under: '#9a8e8a', dirt: 0.4, rough: 0.9 });
  const seam = p.paint('fabric', { color: '#8d827d', chip: 0, dirt: 0.3 });
  // quilted, puffy pad: soft box with wave ridges across the length, rolled edges
  p.box([1.3, 0.1, 0.64], { at: [0, 0.05, 0], paint: c, bevel: 0.04, hi: true, puff: 0.035, bulge: 0.05,
    soft: { ridge: { amp: 0.02, freq: 8.5, axis: 'x' }, hem: { amp: 0.012, freq: 6 }, sx: 16, sz: 8 }, deform: { amp: 0.01, freq: 3 } });
  if (opts.rolled) p.cyl(0.08, 0.6, { at: [0.8, 0.08, 0.5], rot: [0, 0, PI / 2], paint: top, bevel: 0.02, seg: 12 });
  p.box([0.12, 0.008, 0.1], { at: [0.4, 0.14, 0.1], rot: [0, 0.4, 0], paint: p.paint('paint', { color: '#e4b83a', chip: 0.3 }), bevel: 0.002 });
  return p.done();
}
export function bedrollOpen(seed = 1, opts = {}) {
  const p = mk('bedroll_open', seed, opts);
  const pad = p.paint('fabric', { color: opts.padColor || '#a39990', col2: '#857c74', under: '#857c74', pattern: 'stains', patW: 0.2, dirt: 0.6 });
  const roll = p.paint('fabric', { color: '#ecebe8', col2: '#d4d2cc', under: '#d4d2cc', pattern: 'stains', patW: 0.2, dirt: 0.5 });
  p.box([1.2, 0.09, 0.85], { at: [0, 0.045, 0.1], paint: pad, bevel: 0.035, hi: true, deform: { amp: 0.006, freq: 4 } });
  p.lathe(softRollPts(0.17, 0.95, 0.06), { at: [-0.25, 0.2, -0.24], rot: [0, 0, PI / 2], paint: roll, seg: 14 });
  const band = p.paint('fabric', { color: '#b8b3ac', chip: 0, dirt: 0.5 });
  if (!opts.loose) for (const x of [-0.5, 0.0]) p.cyl(0.176, 0.035, { at: [x, 0.2, -0.24], rot: [0, 0, PI / 2], paint: band, seg: 14 });
  p.box([0.1, 0.008, 0.08], { at: [0.35, 0.094, 0.3], rot: [0, 0.5, 0], paint: p.paint('paint', { color: '#e0a83a', chip: 0.2 }), bevel: 0.002 });
  return p.done();
}
function roll(p, o) { // rolled sleeping pad along X
  const { len, r, at, paint, bands = [] } = o;
  p.lathe(softRollPts(r, len), { at, rot: [0, 0, PI / 2], paint, seg: 14 });
  const sp = p.paint('fabric', { color: o.strapColor || '#34373c', chip: 0, rust: 0 });
  for (const x of bands) {
    p.cyl(r + 0.008, 0.08, { at: [at[0] + x, at[1], at[2]], rot: [0, 0, PI / 2], paint: sp, bevel: 0.004, seg: 14 });
    p.box([0.07, 0.05, 0.025], { at: [at[0] + x, at[1] + r * 0.45, at[2] + r * 0.9], paint: p.paint('metal', { color: '#c9ced2' }), bevel: 0.006, segs: 1 });
  }
}
export function sleepRollOrange(seed = 1, opts = {}) {
  const p = mk('sleep_roll_orange', seed, opts);
  const c = p.paint('fabric', { color: opts.color || '#f0836c', col2: '#e46a55', under: '#d9604e', pattern: 'stains', patW: 0.3, dirt: 0.5 });
  roll(p, { len: 0.78, r: 0.13, at: [0, 0.13, 0], paint: c, bands: [-0.25, 0.25] });
  p.cyl(0.075, 0.01, { at: [0.395, 0.13, 0], rot: [0, 0, PI / 2], paint: p.paint('fabric', { color: '#c75443', chip: 0 }), seg: 12, bevel: 0.003 });
  return p.done();
}
export function bedrollTied(seed = 1, opts = {}) {
  const p = mk('bedroll_tied', seed, opts);
  const c = p.paint('fabric', { color: opts.color || '#c8e040', under: '#9bbf2c', dirt: 0.5 });
  roll(p, { len: 0.6, r: 0.15, at: [0, 0.15, 0], paint: c, bands: [-0.17, 0.17], strapColor: '#3a3d40' });
  const gr = p.paint('fabric', { color: '#c6c9cb', chip: 0, dirt: 0.5 });
  for (const s of [-1, 1]) p.cyl(0.152, 0.1, { at: [s * 0.3, 0.15, 0], rot: [0, 0, PI / 2], paint: gr, bevel: 0.03, seg: 14 });
  return p.done();
}

// ---------------------------------------------------------------- car seats
function seatBody(p, o) {
  const { w, depth = 0.5, cushionH = 0.16, backH = 0.62, recline = 0.2, paint, side, y0 = 0.12 } = o;
  const baseP = p.paint('metal', { color: '#3a3d42' });
  p.box([w - 0.06, y0, depth - 0.1], { at: [0, y0 / 2, 0], paint: baseP, bevel: 0.015 });
  p.box([w, cushionH, depth], { at: [0, y0 + cushionH / 2, 0], paint, bevel: 0.05, hi: true, puff: 0.03, bulge: 0.06, deform: { amp: 0.008, freq: 4 } });
  const by = y0 + cushionH + 0.02, bz = -depth / 2 + 0.07;
  const c = Math.cos(recline), s = Math.sin(recline);
  p.box([w, backH, 0.14], { at: [0, by + backH / 2 * c, bz - backH / 2 * s], rot: [-recline, 0, 0], paint, bevel: 0.05, hi: true, puff: 0.025, bulge: 0.08, deform: { amp: 0.008, freq: 4 } });
  if (side) for (const sx of [-1, 1]) {
    p.box([0.09, cushionH + 0.07, depth * 0.9], { at: [sx * (w / 2 - 0.035), y0 + cushionH / 2 + 0.025, 0.02], paint: side, bevel: 0.035, hi: true });
    p.box([0.1, backH * 0.9, 0.2], { at: [sx * (w / 2 - 0.04), by + backH * 0.45 * c, bz - backH * 0.45 * s + 0.03], rot: [-recline, 0, 0], paint: side, bevel: 0.04, hi: true });
  }
  return { by, bz, c, s };
}
const patchY = (p) => p.paint('paint', { color: '#e8b832', chip: 0.35, dirt: 0.3 });
export function carBenchSeat(seed = 1, opts = {}) {
  const p = mk('car_bench_seat', seed, opts);
  const c = p.paint('fabric', { color: opts.color || '#aab0b6', col2: '#7d8186', under: '#7d8186', pattern: 'stains', patW: 0.2, dirt: 0.6 * p.wear / 0.6 });
  const frame = p.paint('metal', { color: '#7fa0b8', under: '#5a7488', chip: 0.2 });
  const W = 1.3;
  p.box([W, 0.17, 0.52], { at: [0, 0.2, 0.0], paint: c, bevel: 0.05, hi: true, deform: { amp: 0.008, freq: 4 } });
  p.box([W + 0.04, 0.05, 0.54], { at: [0, 0.095, 0.0], paint: frame, bevel: 0.015, segs: 1 });
  const rc = 0.12;
  p.box([W, 0.6, 0.12], { at: [0, 0.5, -0.26], rot: [-rc, 0, 0], paint: c, bevel: 0.045, hi: true, deform: { amp: 0.008, freq: 4 } });
  for (const sx of [-1, 1]) p.box([0.06, 0.62, 0.05], { at: [sx * (W / 2 + 0.01), 0.52, -0.26], rot: [-rc, 0, 0], paint: frame, bevel: 0.01 });
  p.tube([[-W / 2 - 0.01, 0.84, -0.33], [W / 2 + 0.01, 0.84, -0.33]], 0.022, { paint: frame, seg: 6 });
  p.box([0.2, 0.012, 0.16], { at: [0.35, 0.288, 0.1], rot: [0, 0.4, 0], paint: patchY(p), bevel: 0.003 });
  p.box([0.16, 0.14, 0.012], { at: [-0.25, 0.62, -0.17], rot: [-0.12, 0.2, 0.3], paint: patchY(p), bevel: 0.003 });
  if (opts.torn) {
    p.blob(0.11, { at: [-0.3, 0.3, 0.12], scale: [1.4, 0.4, 1], paint: p.paint('fabric', { color: '#d9c066', chip: 0 }) });
    p.box([0.28, 0.012, 0.2], { at: [-0.3, 0.287, 0.12], rot: [0, 0.3, 0], paint: p.paint('fabric', { color: '#3a3836', chip: 0 }), bevel: 0.004 });
  }
  return p.done();
}
export function carSeatSport(seed = 1, opts = {}) {
  const p = mk('car_seat_sport', seed, opts);
  const c = p.paint('fabric', { color: opts.color || '#6d6e72', col2: '#4a4b50', under: '#4a4b50', pattern: 'stains', patW: 0.22, dirt: 0.6 });
  const sd = p.paint('fabric', { color: '#58595e', chip: 0.0, dirt: 0.6 });
  const g = seatBody(p, { w: 0.56, depth: 0.56, cushionH: 0.16, backH: 0.7, recline: 0.28, paint: c, side: sd, y0: 0.12 });
  p.box([0.26, 0.24, 0.1], { at: [0, g.by + 0.68 * g.c, g.bz - 0.68 * g.s], rot: [-0.28, 0, 0], paint: sd, bevel: 0.05, hi: true });
  p.box([0.1, 0.1, 0.1], { at: [-0.2, g.by + 0.7 * g.c, g.bz - 0.7 * g.s + 0.05], rot: [-0.28, 0, 0.1], paint: p.paint('paint', { color: '#a64bd6', chip: 0.2 }), bevel: 0.03 });
  p.box([0.18, 0.012, 0.12], { at: [0.18, 0.30, 0.14], rot: [0, 0.4, 0], paint: patchY(p), bevel: 0.003 });
  p.box([0.14, 0.1, 0.012], { at: [0.0, g.by + 0.64, g.bz - 0.12], rot: [-0.28, 0, 0], paint: patchY(p), bevel: 0.003 });
  return p.done();
}
export function carSeat(seed = 1, opts = {}) {
  const p = mk('car_seat', seed, opts);
  const c = p.paint('fabric', { color: opts.color || '#6e5c58', col2: '#5a4a47', under: '#5a4a47', pattern: 'stains', patW: 0.2, dirt: 0.6 });
  const g = seatBody(p, { w: 0.52, depth: 0.52, cushionH: 0.18, backH: 0.78, recline: 0.12, paint: c, y0: 0.1 });
  p.box([0.1, 0.1, 0.012], { at: [0.08, g.by + 0.7, g.bz - 0.7 * g.s / g.c - 0.05], rot: [-0.12, 0, 0.3], paint: patchY(p), bevel: 0.003 });
  p.box([0.12, 0.012, 0.1], { at: [0.1, 0.285, 0.1], rot: [0, 0.5, 0], paint: patchY(p), bevel: 0.003 });
  if (opts.torn) p.blob(0.09, { at: [-0.1, 0.29, 0.1], scale: [1.4, 0.4, 1], paint: p.paint('fabric', { color: '#d9c066', chip: 0 }) });
  return p.done();
}

// ---------------------------------------------------------------- chairs, stool
// One continuous lofted shell: seat -> bent, cupped fan back with radiating slits (quads omitted), double-skinned.
function chairShell(p, paint) {
  const NU = 40, NS = 5, NB = 11, NV = NS + NB;
  let path = [];
  for (let k = 0; k <= 40; k++) { // centreline in (z, y): seat then leaning back
    const a = k / 40;
    if (a <= 0.46) { const q = a / 0.46; path.push([0.25 - 0.47 * q, 0.44 - 0.012 * Math.sin(Math.PI * q)]); }
    else { const q = (a - 0.46) / 0.54; path.push([-0.22 - Math.sin(0.3) * 0.58 * q, 0.44 + Math.cos(0.3) * 0.58 * q]); }
  }
  for (let pass = 0; pass < 6; pass++) path = path.map((pt, k) => k === 0 || k === path.length - 1 ? pt : [(path[k - 1][0] + pt[0] * 2 + path[k + 1][0]) / 4, (path[k - 1][1] + pt[1] * 2 + path[k + 1][1]) / 4]);
  const at = (a) => { const f = Math.min(0.9999, a) * 40, k = Math.floor(f), e = f - k; return [path[k][0] + (path[k + 1][0] - path[k][0]) * e, path[k][1] + (path[k + 1][1] - path[k][1]) * e]; };
  const P = new Float32Array((NU + 1) * (NV + 1) * 3);
  const vA = (iv) => iv <= NS ? 0.46 * iv / NS * 0.999 : 0.46 + 0.54 * (iv - NS) / NB; // parameter along path
  for (let iv = 0; iv <= NV; iv++) for (let iu = 0; iu <= NU; iu++) {
    const u = iu / NU * 2 - 1, a = vA(iv), [z, y] = at(a), back = Math.max(0, (a - 0.46) / 0.54);
    const hw = 0.25 + 0.04 * back, cup = 0.075 * back * u * u, lip = 0.03 * Math.pow(Math.abs(u), 4) * (1 - back);
    const idx = (iv * (NU + 1) + iu) * 3;
    const ny = Math.sin(0.3) * back, nz = Math.cos(0.3) * back; // back normal blend (forward = +z)
    P[idx] = u * hw; P[idx + 1] = y + lip - cup * ny * 0.0 + (back > 0 ? 0 : 0); P[idx + 2] = z + cup * nz * 1.0 + cup * 0;
    if (back > 0) { P[idx + 1] += cup * ny; }
  }
  const skip = (iv, iu) => {
    if (iv < NS + 4) return false; const q = (iv - NS - 4) / (NB - 4);
    if (iv >= NV - 1) { const uc = ((iu + 0.5) / NU) * 2 - 1; if (Math.abs(uc) > 0.82 - 0.0) return true; }
    for (let k = 0; k < 5; k++) { const uk = (k - 2) * 0.29 * (0.5 + 0.5 * q); const c0 = Math.min(NU - 1, Math.max(1, Math.floor((uk + 1) / 2 * NU))); if (iu === c0 || iu === c0 - 1) return iv < NV - 1 && q < 0.95; }
    return false;
  };
  const outer = new THREE.BufferGeometry();
  outer.setAttribute('position', new THREE.BufferAttribute(P, 3));
  const ind = [];
  for (let iv = 0; iv < NV; iv++) for (let iu = 0; iu < NU; iu++) {
    if (skip(iv, iu)) continue;
    const a = iv * (NU + 1) + iu, b = a + 1, c = a + NU + 1, d = c + 1;
    ind.push(a, c, b, b, c, d);
  }
  outer.setIndex(ind); outer.computeVertexNormals();
  const n = outer.attributes.normal, th = 0.045, cnt = (NU + 1) * (NV + 1);
  const P2 = new Float32Array(cnt * 6), N2 = new Float32Array(cnt * 6);
  for (let k = 0; k < cnt; k++) {
    let nx = n.getX(k), ny = n.getY(k), nz = n.getZ(k);
    P2[k * 3] = P[k * 3]; P2[k * 3 + 1] = P[k * 3 + 1]; P2[k * 3 + 2] = P[k * 3 + 2];
    N2[k * 3] = nx; N2[k * 3 + 1] = ny; N2[k * 3 + 2] = nz;
    P2[cnt * 3 + k * 3] = P[k * 3] - nx * th; P2[cnt * 3 + k * 3 + 1] = P[k * 3 + 1] - ny * th; P2[cnt * 3 + k * 3 + 2] = P[k * 3 + 2] - nz * th;
    N2[cnt * 3 + k * 3] = -nx; N2[cnt * 3 + k * 3 + 1] = -ny; N2[cnt * 3 + k * 3 + 2] = -nz;
  }
  const I2 = [];
  for (let k = 0; k < ind.length; k += 3) { I2.push(ind[k], ind[k + 1], ind[k + 2]); I2.push(ind[k] + cnt, ind[k + 2] + cnt, ind[k + 1] + cnt); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P2, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N2, 3));
  g.setIndex(I2);
  return p.geom(g, { paint });
}
export function chairPlastic(seed = 1, opts = {}) {
  const p = mk('chair_plastic', seed, opts);
  const body = p.node('body');
  const pl = p.paint('plastic', { color: opts.color || '#eceff0', under: '#c9cdcf', chip: 0.0, dirt: 0.7 * Math.min(1.4, 0.5 + p.wear / 1.2) });
  p.in(body, () => {
    const sy = 0.44;
    chairShell(p, pl);
    for (const sx of [-1, 1]) {
      p.tube([[sx * 0.25, 0.0, 0.32], [sx * 0.23, sy * 0.5, 0.26], [sx * 0.26, sy + 0.2, 0.2], [sx * 0.27, sy + 0.22, -0.1], [sx * 0.27, sy + 0.2, -0.27]], 0.032, { paint: pl, seg: 7 });
      p.tube([[sx * 0.27, 0.0, -0.33], [sx * 0.23, sy * 0.5, -0.24], [sx * 0.22, sy - 0.03, -0.2]], 0.03, { paint: pl, seg: 7 });
    }
  });
  if (opts.tipped) { body.rotation.order = 'YXZ'; body.rotation.set(-1.32, 0, 0.08); }
  const root = p.done();
  if (opts.tipped) settle(root, body);
  return root;
}
export function chairWood(seed = 1, opts = {}) {
  const p = mk('chair_wood', seed, opts);
  const body = p.node('body');
  const w1 = p.paint('wood', { color: opts.color || '#7e5a52', under: '#c0a090' });
  const w2 = p.paint('wood', { color: '#977066', under: '#c0a090' });
  const w3 = p.paint('wood', { color: '#6a4a44', under: '#c0a090' });
  const sy = 0.44;
  p.in(body, () => {
    p.box([0.48, 0.06, 0.46], { at: [0, sy, 0], paint: w2, bevel: 0.015, segs: 1 });
    p.box([0.01, 0.062, 0.46], { at: [-0.1, sy, 0], paint: w3, bevel: 0.002 });
    p.box([0.01, 0.062, 0.46], { at: [0.1, sy, 0], paint: w3, bevel: 0.002 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const back = sz < 0, hh = back ? 0.82 : sy - 0.03;
      if (opts.broken && back && sx > 0) { p.box([0.07, 0.2, 0.07], { at: [sx * 0.19, 0.1, sz * 0.18], rot: [0, 0, 0.04], paint: w1, bevel: 0.012, segs: 1 }); continue; }
      p.box([0.07, hh, 0.07], { at: [sx * 0.19, hh / 2, sz * 0.18], paint: w1, bevel: 0.014, segs: 1 });
    }
    for (const sx of [-1, 1]) p.box([0.04, 0.04, 0.32], { at: [sx * 0.19, 0.16, 0], paint: w1, bevel: 0.01 });
    p.box([0.34, 0.04, 0.04], { at: [0, 0.16, 0.18], paint: w1, bevel: 0.01 });
    p.box([0.36, 0.11, 0.035], { at: [0, 0.58, -0.18], paint: w2, bevel: 0.012, segs: 1 });
    if (!opts.broken) p.box([0.34, 0.1, 0.035], { at: [0, 0.74, -0.18], rot: [0, 0, 0.05], paint: w2, bevel: 0.012, segs: 1 });
    for (const sx of [-1, 1]) p.cyl(0.012, 0.02, { at: [sx * 0.15, 0.58, -0.158], rot: [PI / 2, 0, 0], paint: p.paint('metal', { color: '#cfd2d4' }), seg: 6 });
    p.box([0.04, 0.005, 0.04], { at: [-0.08, 0.473, 0.1], rot: [0, 0.5, 0], paint: p.paint('paint', { color: '#d9a642', chip: 0.5 }) });
  });
  if (opts.broken) body.rotation.set(0.0, 0.2, 0.2);
  const root = p.done();
  if (opts.broken) settle(root, body);
  return root;
}
export function stool(seed = 1, opts = {}) {
  const p = mk('stool', seed, opts);
  const w1 = p.paint('wood', { color: opts.color || '#a47f78', under: '#d0aa98', chip: 0.3 });
  const w2 = p.paint('wood', { color: '#b58f86', under: '#d0aa98', chip: 0.3 });
  const sy = 0.44;
  p.box([0.52, 0.045, 0.1], { at: [0, sy, -0.12], paint: w2, bevel: 0.014, segs: 1 });
  p.box([0.52, 0.055, 0.12], { at: [0, sy, 0.0], paint: w1, bevel: 0.016, segs: 1 });
  p.box([0.52, 0.045, 0.1], { at: [0, sy, 0.12], rot: [0.03, 0, 0], paint: w2, bevel: 0.014, segs: 1 });
  for (const sx of [-1, 1]) p.box([0.05, 0.04, 0.34], { at: [sx * 0.17, sy - 0.045, 0], paint: w1, bevel: 0.01, segs: 1 });
  const L = Math.hypot(0.42, 0.34);
  for (const sx of [-1, 1]) for (const k of [-1, 1]) {
    const th = k * 0.68;
    p.box([0.055, L, 0.03], { at: [sx * 0.2, 0.21, 0], rot: [th, 0, 0], paint: k > 0 ? w1 : w2, bevel: 0.01, segs: 1 });
  }
  p.box([0.44, 0.04, 0.035], { at: [0, 0.12, 0.1], paint: w1, bevel: 0.01, segs: 1 });
  if (opts.broken) p.box([0.04, 0.2, 0.03], { at: [0.1, 0.1, 0.3], rot: [1.3, 0.3, 0.4], paint: w1, bevel: 0.008, segs: 1 });
  return p.done();
}
export function campChair(seed = 1, opts = {}) {
  const p = mk('camp_chair', seed, opts);
  const cv = p.paint('fabric', { color: opts.color || '#3b4fd4', col2: '#2a3aa8', under: '#2a3aa8', pattern: 'stains', patW: 0.3, dirt: 0.6 });
  const fr = p.paint('metal', { color: '#b4bbbf', under: '#7d858a', chip: 0.0, rust: 0.2 });
  const sy = 0.42;
  p.box([0.6, 0.05, 0.46], { at: [0, sy, 0.0], rot: [0.04, 0, 0], paint: cv, bevel: 0.02, hi: true, deform: { amp: 0.012, freq: 4 } });
  p.box([0.6, 0.3, 0.04], { at: [0, sy + 0.2, -0.27], rot: [-0.3, 0, 0], paint: cv, bevel: 0.016, round: 1, deform: { amp: 0.01, freq: 4 } });
  for (const sx of [-1, 1]) {
    const x = sx * 0.31;
    p.tube([[x, sy - 0.03, -0.22], [x, sy + 0.2, -0.28], [x, sy + 0.38, -0.36]], 0.022, { paint: fr, seg: 7, smooth: false });
    p.tube([[x, 0.0, 0.24], [x, sy - 0.03, -0.2]], 0.024, { paint: fr, seg: 7, smooth: false });
    p.tube([[x, 0.0, -0.24], [x, sy - 0.03, 0.22]], 0.024, { paint: fr, seg: 7, smooth: false });
    p.tube([[x, sy - 0.03, 0.22], [x, sy - 0.03, -0.22]], 0.024, { paint: fr, seg: 7, smooth: false });
    p.tube([[x, 0.0, 0.24], [x, 0.0, -0.24]], 0.022, { paint: fr, seg: 7, smooth: false });
  }
  p.tube([[-0.31, 0.0, 0.24], [0.31, 0.0, 0.24]], 0.02, { paint: fr, seg: 6, smooth: false });
  p.tube([[-0.31, 0.0, -0.24], [0.31, 0.0, -0.24]], 0.02, { paint: fr, seg: 6, smooth: false });
  return p.done();
}

// ---------------------------------------------------------------- logs, planks
function logPiece(p, o) { // vertical or lying log with bark sides and light cut ends
  const { r, h, at, rot, bark, cut, seg = 10, order } = o;
  p.cyl(r, h, { at, rot, order, paint: bark, bevel: Math.min(0.02, r * 0.25), seg, deform: { amp: o.amp ?? 0.01, freq: 4 } });
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot || [0, 0, 0]), order || 'XYZ'));
  for (const s of o.ends || [1]) {
    const pos = new THREE.Vector3(0, s * (h / 2 - 0.004), 0).applyQuaternion(q).add(new THREE.Vector3(...at));
    p.cyl(r * 0.94, 0.014, { at: pos.toArray(), rot, order, paint: cut, bevel: 0.004, seg });
  }
}
const barkP = (p, c) => p.paint('wood', { color: c, under: '#c8a070', chip: 0.3, dirt: 0.6 });
const cutP = (p, c) => p.paint('plywood', { color: c, under: '#e0a088', chip: 0.0, dirt: 0.15 });
export function logStump(seed = 1, opts = {}) {
  const p = mk('log_stump', seed, opts);
  logPiece(p, { r: 0.16, h: 0.5, at: [0, 0.25, 0], bark: barkP(p, opts.bark || '#7a4a3a'), cut: cutP(p, '#e2b48a'), seg: 12, amp: 0.016 });
  for (const a of [0.5, 2.6, 4.4]) p.box([0.06, 0.1, 0.04], { at: [Math.cos(a) * 0.165, 0.38 - a * 0.03, Math.sin(a) * 0.165], rot: [0, -a, 0], paint: barkP(p, '#5e3a2e'), bevel: 0.01 });
  if (opts.axeCut) p.box([0.26, 0.03, 0.04], { at: [0, 0.505, 0], paint: p.paint('wood', { color: '#7c3d30', chip: 0 }), bevel: 0.006 });
  return p.done();
}
export function logThin(seed = 1, opts = {}) {
  const p = mk('log_thin', seed, opts);
  const len = opts.len ?? 0.62;
  logPiece(p, { r: 0.085, h: len, at: [0, len / 2, 0], bark: barkP(p, opts.bark || '#7a4a3a'), cut: cutP(p, '#e2b48a'), seg: 10, amp: 0.012 });
  p.box([0.05, 0.08, 0.04], { at: [0.075, len * 0.55, 0.0], rot: [0, 0, -0.5], paint: barkP(p, '#6f5854'), bevel: 0.01 });
  return p.done();
}
export function plankStanding(seed = 1, opts = {}) {
  const p = mk('plank_standing', seed, opts);
  const wd = p.paint('wood', { color: opts.color || '#8a5240', under: '#d8aa80', chip: 1.0, dirt: 0.5 });
  const lean = opts.lean ?? 0.08, h = 0.95;
  const prof = [[0, -0.17], [0.04, -0.165], [0.08, -0.12], [0.1, -0.06], [0.105, 0], [0.1, 0.06], [0.08, 0.12], [0.04, 0.165], [0, 0.17]];
  p.extrude(prof, h, { at: [0, h / 2 * Math.cos(lean), -h / 2 * Math.sin(lean)], rot: [-PI / 2 - lean, 0, 0], paint: wd, bevel: 0.016 });
  p.box([0.05, 0.1, 0.06], { at: [-0.1, 0.58, -0.02], rot: [0, 0, 0.2], paint: wd, bevel: 0.015 });
  p.cyl(0.014, 0.02, { at: [0.0, 0.78, 0.0], rot: [PI / 2, 0, 0], paint: p.paint('metal', { color: '#5d5651' }), seg: 6 });
  return p.done();
}
export function plankBroken(seed = 1, opts = {}) {
  const p = mk('plank_broken', seed, opts);
  const wd = p.paint('wood', { color: opts.color || '#d98a7c', under: '#8f7a76', chip: 1.0, dirt: 0.5 });
  p.box([0.55, 0.09, 0.3], { at: [0, 0.05, 0], rot: [0, 0.1, 0.04], paint: wd, bevel: 0.035, hi: true, deform: { amp: 0.018, freq: 3 } });
  if (opts.shard !== false) for (const [z, r, l] of [[-0.1, 0.3, 0.2], [0.0, -0.1, 0.26], [0.1, 0.2, 0.16]])
    p.box([l, 0.05, 0.05], { at: [0.27 + l / 2 - 0.03, 0.06, z], rot: [0, r, 0.1], paint: wd, bevel: 0.01 });
  p.cyl(0.014, 0.02, { at: [-0.2, 0.097, 0.05], paint: p.paint('metal', { color: '#6e6560' }), seg: 6 });
  return p.done();
}

// ---------------------------------------------------------------- firewood, hatchet
export function firewoodPile(seed = 1, opts = {}) {
  const p = mk('firewood_pile', seed, opts);
  const wd = p.paint('wood', { color: '#dc8878', under: '#8f7a76', chip: 1.0, dirt: 0.5 });
  const half = (r, len, at, yaw, tilt = 0) => {
    const prof = [];
    for (let k = 0; k <= 6; k++) { const a = PI + (k / 6) * PI; prof.push([Math.cos(a) * r, Math.sin(a) * r * 1.25]); }
    p.extrude(prof, len, { at, rot: [tilt, yaw, 0], paint: wd, bevel: 0.014 });
  };
  const m = opts.messy ? 1 : 0.4;
  half(0.14, 0.9, [-0.1, 0.12, -0.3], 0.1 + p.r() * 0.3 * m);
  half(0.15, 0.95, [0.05, 0.13, 0.0], -0.15 + p.r() * 0.3 * m);
  half(0.14, 0.9, [-0.05, 0.12, 0.3], 0.2 + p.r() * 0.3 * m);
  logPiece(p, { r: 0.13, h: 0.85, at: [0.0, 0.39, 0.0], rot: [0, 0.9, PI / 2], order: 'YXZ', bark: barkP(p, '#9a7a72'), cut: cutP(p, '#f4a08c'), ends: [1, -1], seg: 10 });
  half(0.12, 0.7, [-0.05, 0.28, 0.12], 1.2, 0);
  if (opts.messy) logPiece(p, { r: 0.08, h: 0.5, at: [0.5, 0.08, 0.35], rot: [0, 2.2, PI / 2], order: 'YXZ', bark: barkP(p, '#9a7a72'), cut: cutP(p, '#f4a08c'), ends: [1, -1], seg: 9 });
  return p.done();
}
export function firewoodSplit(seed = 1, opts = {}) {
  const p = mk('firewood_split', seed, opts);
  const n = opts.count ?? 1;
  const wd = p.paint('wood', { color: opts.color || '#e0907f', under: '#8f7a76', chip: 1.0, dirt: 0.5 });
  const prof = [[-0.14, 0], [0.14, 0], [0.17, 0.07], [0.1, 0.14], [-0.1, 0.14], [-0.17, 0.07]];
  for (let i = 0; i < n; i++)
    p.extrude(prof, 0.55 - i * 0.08, { at: [i * 0.07, 0.07 + i * 0.12, i * 0.0], rot: [PI / 2, i * 0.7, 0], paint: wd, bevel: 0.018 });
  return p.done();
}
export function hatchet(seed = 1, opts = {}) {
  const p = mk('hatchet', seed, opts);
  const hd = p.paint('wood', { color: '#f4642a', col2: '#c04418', under: '#c95020', pattern: 'bands', patW: 0.14, chip: 0.2, dirt: 0.4 });
  const st = p.paint('steel', { color: '#d4d9dc', under: '#e8ecee', chip: 0.3, rust: 0.2 });
  const dk = p.paint('steel', { color: '#4b4f55', chip: 0.0 });
  p.cyl(0.045, 0.46, { at: [-0.12, 0.045, 0], rot: [0, 0, PI / 2], paint: hd, bevel: 0.02, seg: 10 });
  p.box([0.07, 0.1, 0.1], { at: [-0.37, 0.05, 0], paint: p.paint('steel', { color: '#4a5058' }), bevel: 0.02, segs: 1 });
  p.box([0.16, 0.1, 0.12], { at: [0.13, 0.05, 0], paint: dk, bevel: 0.03, segs: 1 });
  p.cyl(0.022, 0.012, { at: [0.15, 0.106, 0.0], paint: p.paint('plastic', { color: '#e8eaec' }), seg: 8 });
  p.extrude([[-0.06, 0.04], [0.06, 0.04], [0.1, 0.2], [-0.09, 0.2]], 0.025, { at: [0.12, 0.02, 0], rot: [PI / 2, 0, 0], paint: st, bevel: 0.006 });
  return p.done();
}

// ---------------------------------------------------------------- workbench
export function workbench(seed = 1, opts = {}) {
  const p = mk('workbench', seed, opts);
  const wd = p.paint('wood', { color: opts.color || '#9a6258', under: '#d3966f', chip: 0.3 });
  const wd2 = p.paint('wood', { color: '#7c4a44', under: '#d3a08a', chip: 0.3 });
  const steel = p.paint('steel', { color: '#59636a', under: '#8a9298', chip: 0.2 });
  const L = 1.3, D = 0.8, topY = 0.74, tt = 0.09;
  p.box([L, tt, D], { at: [0, topY, 0], paint: wd, bevel: 0.025 });
  p.box([L, 0.22, 0.06], { at: [0, topY + tt / 2 + 0.11, -D / 2 + 0.03], paint: wd2, bevel: 0.02, segs: 1 });
  const lh = topY - tt / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box([0.1, lh, 0.1], { at: [sx * (L / 2 - 0.07), lh / 2, sz * (D / 2 - 0.07)], paint: wd2, bevel: 0.02 });
  p.box([L - 0.1, 0.05, D - 0.1], { at: [0, 0.2, 0], paint: wd, bevel: 0.015, segs: 1 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { // steel corner brackets on legs
    const x = sx * (L / 2 - 0.07), z = sz * (D / 2 - 0.07);
    p.box([0.14, 0.1, 0.14], { at: [x, topY - tt / 2 - 0.05, z], paint: steel, bevel: 0.012, segs: 1 });
    p.box([0.13, 0.08, 0.13], { at: [x, 0.2, z], paint: steel, bevel: 0.012, segs: 1 });
  }
  p.box([L - 0.2, 0.06, 0.03], { at: [0, topY - tt / 2 - 0.04, D / 2 - 0.05], paint: wd2, bevel: 0.01 });
  const cx = -0.36, cw = 0.4; // drawer cabinet (left)
  p.box([0.03, 0.46, D - 0.12], { at: [cx - cw / 2 - 0.015, 0.46, 0], paint: wd2, bevel: 0.01 });
  p.box([0.03, 0.46, D - 0.12], { at: [cx + cw / 2 + 0.015, 0.46, 0], paint: wd2, bevel: 0.01 });
  p.box([cw, 0.46, 0.03], { at: [cx, 0.46, -D / 2 + 0.1], paint: wd2, bevel: 0.01 });
  p.box([cw, 0.03, D - 0.12], { at: [cx, 0.22, 0], paint: wd2, bevel: 0.01 });
  const drawers = [];
  for (const y of [0.56, 0.36]) {
    const dn = p.node('drawer', { at: [cx, y, D / 2 - 0.1] });
    drawers.push(dn);
    const inner = p.paint('plywood', { color: '#c58f62', chip: 0.2 });
    p.in(dn, () => {
      p.box([cw + 0.02, 0.17, 0.035], { at: [0, 0, 0.02], paint: wd, bevel: 0.012 });
      p.box([0.14, 0.025, 0.03], { at: [0, 0.0, 0.055], paint: steel, bevel: 0.008 });
      p.box([cw - 0.04, 0.015, 0.55], { at: [0, -0.07, -0.275], paint: inner });
      for (const sx of [-1, 1]) p.box([0.015, 0.1, 0.55], { at: [sx * (cw / 2 - 0.03), -0.02, -0.275], paint: inner });
      p.box([cw - 0.04, 0.1, 0.015], { at: [0, -0.02, -0.55], paint: inner });
      if (y > 0.5) p.cyl(0.015, 0.2, { at: [0.05, -0.04, -0.2], rot: [PI / 2, 0, 0.2], paint: p.paint('paint', { color: '#d84a3a' }), seg: 6 });
    });
  }
  p.param('drawers', opts.drawers ?? 0.5, (v) => { drawers.forEach((n, i) => { n.position.z = D / 2 - 0.1 + v * (i ? 0.3 : 0.18); }); });
  const ty = topY + tt / 2;
  p.box([0.55, 0.014, 0.4], { at: [0.12, ty + 0.007, 0.06], paint: p.paint('plastic', { color: '#33d0bc', under: '#2a9e8e', chip: 0.2 }), bevel: 0.004 });
  const lime = p.paint('paint', { color: '#a6d41f', under: '#6c8a14', chip: 0.35 }); // vise
  p.box([0.14, 0.06, 0.18], { at: [0.54, ty + 0.03, 0.14], paint: lime, bevel: 0.012, segs: 1 });
  p.box([0.12, 0.12, 0.05], { at: [0.54, ty + 0.12, 0.2], paint: lime, bevel: 0.012, segs: 1 });
  p.box([0.12, 0.1, 0.05], { at: [0.54, ty + 0.11, 0.1], paint: lime, bevel: 0.012, segs: 1 });
  p.tube([[0.46, ty + 0.1, 0.3], [0.66, ty + 0.1, 0.3]], 0.011, { paint: p.paint('metal'), seg: 5 });
  const red = p.paint('paint', { color: '#d6362a', chip: 0.3 }); // red press / bottle at left
  p.box([0.12, 0.06, 0.12], { at: [-0.55, ty + 0.03, 0.05], paint: red, bevel: 0.012, segs: 1 });
  p.cyl(0.04, 0.2, { at: [-0.55, ty + 0.16, 0.05], paint: red, seg: 10, bevel: 0.015 });
  p.cyl(0.02, 0.05, { at: [-0.55, ty + 0.285, 0.05], paint: p.paint('metal'), seg: 8 });
  const lampP = p.paint('steel', { color: '#26292d', chip: 0.1 }); // desk lamp
  p.cyl(0.06, 0.03, { at: [0.45, ty + 0.015, -0.28], paint: lampP, seg: 10, bevel: 0.01 });
  p.tube([[0.45, ty + 0.03, -0.28], [0.4, ty + 0.4, -0.25], [0.15, ty + 0.62, -0.1], [-0.15, ty + 0.55, 0.0]], 0.013, { paint: lampP, seg: 5 });
  p.cyl(0.05, 0.1, { at: [-0.18, ty + 0.52, 0.01], rot: [0.0, 0, 2.2], paint: lampP, bevel: 0.012, seg: 8 });
  p.cyl(0.034, 0.01, { at: [-0.205, ty + 0.475, 0.01], rot: [0, 0, 2.2], paint: p.paint('glow'), seg: 8 });
  return p.done();
}

// ---------------------------------------------------------------- backpacks
function shell(p, c, ang) {
  const [cx, cy, cz] = c;
  const a = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, ang)));
  const rp = p.paint('plastic', { color: '#d63a2a', under: '#a82a20', chip: 0.0, dirt: 0.3 });
  const bp = p.paint('metal', { color: '#e0b64a', under: '#b08a30', chip: 0, rust: 0 });
  p.cyl(0.016, 0.055, { at: [cx + a.x * 0.0085, cy + a.y * 0.0085, cz], rot: [0, 0, ang], paint: rp, seg: 6, bevel: 0.004 });
  p.cyl(0.0175, 0.022, { at: [cx - a.x * 0.0225, cy - a.y * 0.0225, cz], rot: [0, 0, ang], paint: bp, seg: 6, bevel: 0.003 });
}
export function backpackRed(seed = 1, opts = {}) {
  const p = mk('backpack_red', seed, opts);
  const fb = p.paint('fabric', { color: opts.color || '#d9786c', col2: '#9a3a34', under: '#a8403a', pattern: 'stains', patW: 0.22, dirt: 0.6, splat: 0.45 * p.wear / 0.6 });
  const fb2 = p.paint('fabric', { color: '#c9625a', under: '#a8403a', splat: 0.3 });
  const brown = p.paint('fabric', { color: '#7a5448', chip: 0, dirt: 0.5 });
  const dark = p.paint('fabric', { color: '#3d3532', chip: 0, dirt: 0.4 });
  p.box([0.5, 0.42, 0.32], { at: [0, 0.23, 0], paint: fb, bevel: 0.11, hi: true, deform: { amp: 0.014, freq: 5 } });
  p.cyl(0.17, 0.12, { at: [0, 0.5, -0.02], r2: 0.14, paint: fb2, bevel: 0.03, seg: 12 });
  p.torus(0.14, 0.035, { at: [0, 0.57, -0.02], rot: [PI / 2, 0, 0], paint: brown, seg: 12, tube: 6 });
  p.cyl(0.115, 0.01, { at: [0, 0.565, -0.02], paint: dark, seg: 12 });
  for (const sx of [-1, 1]) p.box([0.13, 0.3, 0.26], { at: [sx * 0.29, 0.17, 0.0], paint: fb2, bevel: 0.06, hi: true });
  p.box([0.38, 0.2, 0.1], { at: [0, 0.14, 0.19], paint: fb2, bevel: 0.05, hi: true });
  p.box([0.5, 0.075, 0.035], { at: [0, 0.3, 0.19], rot: [0, 0, 0.22], paint: dark, bevel: 0.01, segs: 1 });
  for (let i = 0; i < 7; i++) {
    const x = -0.21 + i * 0.07;
    shell(p, [x, 0.3 + x * 0.22 + 0.04, 0.215], 0.22);
  }
  p.box([0.05, 0.05, 0.03], { at: [-0.05, 0.3, 0.215], paint: p.paint('metal'), bevel: 0.008, segs: 1 });
  return p.done();
}
export function backpackYellow(seed = 1, opts = {}) {
  const p = mk('backpack_yellow', seed, opts);
  const fb = p.paint('fabric', { color: opts.color || '#eab63c', col2: '#a8741c', under: '#b98a2c', pattern: 'stains', patW: 0.22, dirt: 0.6, splat: 0.4 * p.wear / 0.6 });
  const fb2 = p.paint('fabric', { color: '#d9a432', under: '#a77a22', splat: 0.3 });
  const dark = p.paint('fabric', { color: '#3a3330', chip: 0, dirt: 0.4 });
  const brown = p.paint('fabric', { color: '#8a6a58', chip: 0, dirt: 0.5 });
  const grey = p.paint('metal', { color: '#a9afb3' });
  p.box([0.56, 0.42, 0.32], { at: [0, 0.23, 0], paint: fb, bevel: 0.11, hi: true, deform: { amp: 0.012, freq: 5 } });
  p.box([0.48, 0.12, 0.3], { at: [0, 0.5, 0.0], paint: brown, bevel: 0.05, hi: true });
  for (const x of [-0.16, 0, 0.16]) {
    p.box([0.13, 0.26, 0.09], { at: [x, 0.16, 0.19], paint: fb2, bevel: 0.04, hi: true });
    p.box([0.04, 0.46, 0.016], { at: [x, 0.3, 0.24], paint: dark, bevel: 0.005 });
    p.box([0.06, 0.04, 0.02], { at: [x, 0.17, 0.255], paint: grey, bevel: 0.006 });
  }
  p.box([0.5, 0.05, 0.016], { at: [0, 0.42, 0.2], paint: dark, bevel: 0.005 });
  p.box([0.08, 0.06, 0.022], { at: [0, 0.42, 0.21], paint: grey, bevel: 0.006 });
  for (const sx of [-1, 1]) p.box([0.1, 0.3, 0.24], { at: [sx * 0.3, 0.17, 0.0], paint: fb2, bevel: 0.05, hi: true });
  if (opts.roll !== false) {
    const pink = p.paint('fabric', { color: '#e8527e', col2: '#c93a62', under: '#c93a62', pattern: 'stains', patW: 0.3, dirt: 0.4 });
    p.lathe(softRollPts(0.1, 0.5), { at: [0, 0.71, 0.0], rot: [0, 0, PI / 2], paint: pink, seg: 12 });
    for (const x of [-0.14, 0.14]) p.cyl(0.108, 0.04, { at: [x, 0.71, 0], rot: [0, 0, PI / 2], paint: dark, seg: 12 });
    p.cyl(0.06, 0.01, { at: [0.255, 0.71, 0], rot: [0, 0, PI / 2], paint: p.paint('fabric', { color: '#a82a4c', chip: 0 }), seg: 10 });
  }
  return p.done();
}

// ---------------------------------------------------------------- registry
const V = (label, seed, opts = {}) => ({ label, seed, opts });
export const PROPS = [
  { id: 'pallet', name: 'Pallet gỗ', build: pallet, yaw: 0.35, variants: [V('mới', 1, { wear: 0.1 }), V('gãy', 2, { broken: 0.8, wear: 0.9 })] },
  { id: 'mattress', name: 'Nệm cũ', build: mattress, yaw: 0.5, variants: [V('sạch', 1, { wear: 0.2 }), V('ố', 2, { wear: 0.9 }), V('rách', 3, { torn: true, wear: 0.8 })] },
  { id: 'sleep_mat_flat', name: 'Tấm trải ngủ', build: sleepMatFlat, yaw: 0.4, variants: [V('phẳng', 1), V('cuộn góc', 2, { rolled: true, wear: 0.9, color: '#9aa39a' })] },
  { id: 'car_bench_seat', name: 'Ghế băng ô tô', build: carBenchSeat, yaw: 0.5, variants: [V('cũ', 1), V('rách', 2, { torn: true, wear: 1 }), V('mới', 3, { wear: 0.1 })] },
  { id: 'bedroll_open', name: 'Chăn ngủ mở', build: bedrollOpen, yaw: 0.5, variants: [V('cuộn', 1), V('rời', 2, { loose: true, wear: 0.9, padColor: '#8f8a6a' })] },
  { id: 'sleep_roll_orange', name: 'Cuộn đệm cam', build: sleepRollOrange, yaw: 0.4, variants: [V('mới', 1, { wear: 0.2 }), V('bẩn', 2, { wear: 1, color: '#e0745e' })] },
  { id: 'bedroll_tied', name: 'Cuộn chăn buộc', build: bedrollTied, yaw: 0.4, variants: [V('vàng', 1), V('xanh', 2, { color: '#5fc4e8', wear: 0.9 })] },
  { id: 'pallet_table', name: 'Bàn pallet phủ bạt', build: palletTable, yaw: 0.45, variants: [V('bạt xanh', 1), V('bạt xanh dương', 2, { tarpColor: '#3a8fe0', wear: 0.9 }), V('không bạt', 3, { tarp: false, broken: 0.6 })] },
  { id: 'tarp_crate_green', name: 'Thùng bạt xanh lá', build: tarpCrateGreen, yaw: 0.4, variants: [V('mới', 1, { wear: 0.2 }), V('cũ', 2, { wear: 1 }), V('hỏng', 3, { broken: 1, wear: 0.9 })] },
  { id: 'tarp_crate_blue', name: 'Thùng bạt xanh dương', build: tarpCrateBlue, yaw: 0.4, variants: [V('mới', 1, { wear: 0.2 }), V('cũ', 2, { wear: 1 })] },
  { id: 'chair_plastic', name: 'Ghế nhựa', build: chairPlastic, yaw: 0.55, variants: [V('đứng', 1), V('đổ', 2, { tipped: true, wear: 0.9 })] },
  { id: 'chair_wood', name: 'Ghế gỗ', build: chairWood, yaw: 0.55, variants: [V('mới', 1, { wear: 0.2 }), V('gãy', 2, { broken: true, wear: 1 })] },
  { id: 'stool', name: 'Ghế đẩu gỗ', build: stool, yaw: 0.5, variants: [V('mới', 1, { wear: 0.2 }), V('gãy', 2, { broken: true, wear: 1 })] },
  { id: 'car_seat_sport', name: 'Ghế thể thao', build: carSeatSport, yaw: 0.6, variants: [V('cũ', 1), V('mới', 2, { wear: 0.1 })] },
  { id: 'car_seat', name: 'Ghế ô tô', build: carSeat, yaw: 0.6, variants: [V('cũ', 1), V('rách', 2, { torn: true, wear: 1 })] },
  { id: 'camp_chair', name: 'Ghế xếp dã ngoại', build: campChair, yaw: 1.2, variants: [V('xanh', 1), V('đỏ', 2, { color: '#cf3a34', wear: 0.9 })] },
  { id: 'log_stump', name: 'Gốc cây', build: logStump, yaw: 0.2, variants: [V('trơn', 1), V('có vết chặt', 2, { axeCut: true, wear: 0.9 })] },
  { id: 'log_thin', name: 'Khúc gỗ mảnh', build: logThin, yaw: 0.2, variants: [V('dài', 1), V('ngắn', 2, { len: 0.4, wear: 0.9 })] },
  { id: 'plank_standing', name: 'Ván dựng', build: plankStanding, yaw: 0.3, variants: [V('thẳng', 1), V('nghiêng', 2, { lean: 0.22, wear: 0.9, color: '#c9755a' })] },
  { id: 'plank_broken', name: 'Ván gãy', build: plankBroken, yaw: 0.4, variants: [V('có mảnh', 1), V('một mảnh', 2, { shard: false, wear: 1 })] },
  { id: 'workbench', name: 'Bàn thợ', build: workbench, yaw: 0.5, variants: [V('ngăn kéo mở', 1, { drawers: 0.6 }), V('đóng', 2, { drawers: 0, wear: 0.9 }), V('mở hết', 3, { drawers: 1 })] },
  { id: 'firewood_pile', name: 'Đống củi', build: firewoodPile, yaw: 0.35, variants: [V('gọn', 1), V('bừa', 2, { messy: true, wear: 0.9 })] },
  { id: 'firewood_split', name: 'Củi chẻ', build: firewoodSplit, yaw: 0.4, variants: [V('2 thanh', 1), V('3 thanh', 2, { count: 3, wear: 0.9 })] },
  { id: 'backpack_red', name: 'Ba lô đỏ đai đạn', build: backpackRed, yaw: 0.5, variants: [V('bẩn máu', 1), V('mới', 2, { wear: 0.1 })] },
  { id: 'backpack_yellow', name: 'Ba lô vàng', build: backpackYellow, yaw: 0.5, variants: [V('có túi ngủ', 1), V('trơn', 2, { roll: false, wear: 0.9 })] },
  { id: 'hatchet', name: 'Rìu tay', build: hatchet, yaw: 0.5, variants: [V('mới', 1, { wear: 0.2 }), V('cũ', 2, { wear: 1 })] },
];
