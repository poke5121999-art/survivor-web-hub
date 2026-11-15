// Concrete, barriers, traffic. Each prop: export function <camelId>(seed, opts) + entry in PROPS.
import { Prop } from '../lib/prop.js';
import * as THREE from '../vendor/three.module.min.js';
import * as parts from '../lib/parts.js';

const PI = Math.PI;
const JERSEY = [[-0.32, 0], [0.32, 0], [0.32, 0.09], [0.25, 0.13], [0.25, 0.17], [0.17, 0.27], [0.12, 0.8], [-0.12, 0.8], [-0.17, 0.27], [-0.25, 0.17], [-0.25, 0.13], [-0.32, 0.09]];
const JLOW = [[-0.32, 0], [0.32, 0], [0.32, 0.09], [0.25, 0.13], [0.25, 0.17], [0.17, 0.27], [-0.17, 0.27], [-0.25, 0.17], [-0.25, 0.13], [-0.32, 0.09]];

// Real fork-lift tunnels: the lower body is cut into sections along the barrier; in a slot section the
// foot flange is removed so a through-opening (roof at y = flange top) remains. Geometry, not decals.
function tunnelProfile(prof) {
  const [x3, y3] = prof[3], roof = y3 - 0.01;
  return [[-x3, roof], [x3, roof], ...prof.slice(4, prof.length - 2)];
}
function lowBody(p, prof, x0, x1, xs, paint, sw = 0.3) {
  const tun = tunnelProfile(prof);
  const seg = (pr, a, b) => { if (b - a > 0.02) p.extrude(pr, b - a, { rot: [0, PI / 2, 0], at: [(a + b) / 2, 0, 0], paint, bevel: 0.004 }); };
  let cur = x0;
  for (const x of [...xs].sort((m, n) => m - n)) { seg(prof, cur, x - sw / 2); seg(tun, x - sw / 2, x + sw / 2); cur = x + sw / 2; }
  seg(prof, cur, x1);
}
const RED = '#d8262a', WHITE = '#f2f2ee';

function concretePaint(p, o) {
  return p.paint('concrete', o.stains ? { pattern: 'stains', col2: '#7d6d60', patW: 0.35 } : {});
}

// Painted red/white band on both slanted faces between x0..x1.
function bands(p, x0, x1, y = 0.48) {
  if (x1 - x0 < 0.1) return;
  const band = p.paint('paint', { color: RED, col2: WHITE, pattern: 'stripes', patW: 0.09, chip: 0.5 * p.wear / 0.6, under: '#b9bcbc', rust: 0 });
  for (const s of [1, -1]) p.box([x1 - x0, 0.28, 0.024], { at: [(x0 + x1) / 2, y, s * 0.172], rot: [s * -0.094, 0, 0], paint: band, bevel: 0.006 });
}

// Jagged top line of the upper stem. kind: 'mid' | 'end' (steep diagonal snap) | 'long' (shallow slope)
function jagged(p, L, kind) {
  const h = L / 2, top = [];
  const j = (x, y) => top.push([x, y]);
  const r = () => p.r();
  if (kind === 'mid') {
    const c = 0, w = 0.36;
    j(-h, 0.8); j(c - w, 0.8); j(c - w + 0.04, 0.6 + r() * 0.05); j(c - w * 0.6, 0.55 + r() * 0.06);
    j(c - w * 0.4, 0.36 + r() * 0.05); j(c - w * 0.15, 0.46 + r() * 0.08); j(c + w * 0.1, 0.3 + r() * 0.05);
    j(c + w * 0.4, 0.42 + r() * 0.08); j(c + w * 0.7, 0.62 + r() * 0.06); j(c + w, 0.8); j(h, 0.8);
  } else if (kind === 'end') {
    const x0 = h * 0.25;
    j(-h, 0.8); j(x0, 0.8); j(x0 + 0.06, 0.66); j(x0 + 0.13, 0.72); j(x0 + 0.2, 0.52 + r() * 0.04); j(x0 + 0.27, 0.58);
    j(x0 + 0.34, 0.36 + r() * 0.04); j(x0 + 0.4, 0.42); j(x0 + 0.46, 0.2 + r() * 0.04); j(h - 0.03, 0.14); j(h, 0.04);
  } else {
    j(-h, 0.8); j(-h * 0.2, 0.8); j(-h * 0.12, 0.7 + r() * 0.03); j(h * 0.0, 0.72); j(h * 0.1, 0.55 + r() * 0.04); j(h * 0.2, 0.6);
    j(h * 0.32, 0.45 + r() * 0.04); j(h * 0.42, 0.5); j(h * 0.55, 0.38 + r() * 0.04); j(h * 0.68, 0.42); j(h * 0.8, 0.3 + r() * 0.03);
    j(h * 0.9, 0.34); j(h, 0.24);
  }
  return top;
}

// Concrete jersey barrier. opts: length, stripes, stains, broken ('mid'|'end'|'long')
function jersey(id, seed, opts, dflt = {}) {
  const o = { ...dflt, ...opts };
  const p = new Prop(id, seed, opts);
  const L = o.length ?? 1.6, h = L / 2;
  const con = concretePaint(p, o);
  const kind = o.broken;
  if (!kind) {
    lowBody(p, JERSEY, -h, h, [-L * 0.27, L * 0.27], con);
    if (o.stripes) bands(p, -L * 0.43, L * 0.43);
    for (const x of [-L * 0.32, L * 0.32]) parts.loop(p, { at: [x, 0.8, 0], w: 0.12, h: 0.08 });
    return p.done();
  }
  const top = jagged(p, L, kind);
  if (kind === 'end') {
    const bl = L * 0.6;
    lowBody(p, JLOW, -h, -h + bl, [-L * 0.3], con);
    // snapped lower slab: diagonal edge reaching the floor
    p.extrude([[-h + bl - 0.05, 0], [h - 0.02, 0], [h - 0.14, 0.12], [h - 0.3, 0.2], [h - 0.5, 0.27], [-h + bl - 0.05, 0.27]], 0.46, { paint: con, bevel: 0.02 });
    p.extrude([[-h, 0.22], ...top, [h * 0.6, 0.22]], 0.25, { paint: con, bevel: 0.02 });
    const brk = top.filter((q) => q[0] > h * 0.25 && q[1] < 0.7);
    for (let i = 0; i < brk.length; i++) parts.rebar(p, { at: [brk[i][0], brk[i][1] - 0.03, 0], dir: [0.7, 0.8, 0.1], count: 2, len: 0.22, spread: 0.12 });
    parts.rebar(p, { at: [h - 0.04, 0.12, 0], dir: [1, 0.3, 0], count: 3, len: 0.24, spread: 0.3 });
  } else if (kind === 'long') {
    lowBody(p, JLOW, -h, h, [-L * 0.3, L * 0.05, L * 0.35], con);
    p.extrude([[-h, 0.22], ...top, [h, 0.22]], 0.25, { paint: con, bevel: 0.02 });
    for (let i = 3; i < top.length; i++) parts.rebar(p, { at: [top[i][0], top[i][1] - 0.02, 0], dir: [0.5, 1, 0.1], count: 2, len: 0.24, spread: 0.14 });
    parts.rebar(p, { at: [h - 0.02, 0.24, 0], dir: [1, 0.4, 0], count: 5, len: 0.3, spread: 0.22 });
  } else {
    lowBody(p, JLOW, -h, h, [-L * 0.3, L * 0.3], con);
    p.extrude([[-h, 0.22], ...top, [h, 0.22]], 0.25, { paint: con, bevel: 0.02 });
    const lo = top.filter((q) => q[1] < 0.7 && q[1] > 0.28);
    for (let i = 0; i < lo.length; i += 2) parts.rebar(p, { at: [lo[i][0], lo[i][1] - 0.02, 0], dir: [0.15, 1, 0.1], count: 2, len: 0.2, spread: 0.12 });
  }
  if (o.stripes) {
    if (kind === 'end') bands(p, -L * 0.47, L * 0.2);
    else if (kind === 'long') bands(p, -L * 0.47, -L * 0.05);
    else { bands(p, -L * 0.47, -L * 0.23); bands(p, L * 0.23, L * 0.47); }
  }
  parts.loop(p, { at: [-L * 0.38, 0.8, 0], w: 0.12, h: 0.08 });
  if (kind === 'mid') parts.loop(p, { at: [L * 0.4, 0.8, 0], w: 0.12, h: 0.08 });
  if (kind === 'end') parts.loop(p, { at: [-L * 0.08, 0.8, 0], w: 0.12, h: 0.08 });
  if (kind === 'long') parts.loop(p, { at: [-L * 0.3, 0.8, 0], w: 0.12, h: 0.08 });
  return p.done();
}

export function jerseyStriped(seed = 1, opts = {}) { return jersey('jersey_striped', seed, opts, { stripes: opts.stripes !== false }); }
export function jerseyStained(seed = 1, opts = {}) { return jersey('jersey_stained', seed, opts, { stains: true }); }
export function jerseyPlain(seed = 1, opts = {}) {
  const p = new Prop('jersey_plain', seed, opts);
  const L = opts.length ?? 2.0;
  const con = p.paint('concrete', opts.stains ? { pattern: 'stains', col2: '#7d6d60', patW: 0.5 } : { pattern: 'mottle', col2: '#a9a99e', patW: 0.4 });
  const low = [[-0.3, 0], [0.3, 0], [0.3, 0.09], [0.24, 0.12], [0.24, 0.15], [0.16, 0.24], [0.11, 0.6], [-0.11, 0.6], [-0.16, 0.24], [-0.24, 0.15], [-0.24, 0.12], [-0.3, 0.09]];
  lowBody(p, low, -L / 2, L / 2, [-L * 0.27, L * 0.27], con);
  for (const x of [-L * 0.32, L * 0.32]) parts.loop(p, { at: [x, 0.6, 0], w: 0.12, h: 0.08 });
  return p.done();
}
export function jerseyBrokenMid(seed = 1, opts = {}) { return jersey('jersey_broken_mid', seed, opts, { broken: 'mid', length: 1.7 }); }
export function jerseyBrokenEnd(seed = 1, opts = {}) { return jersey('jersey_broken_end', seed, opts, { broken: 'end', length: 1.6 }); }
export function jerseyBrokenLong(seed = 1, opts = {}) { return jersey('jersey_broken_long', seed, opts, { broken: 'end', length: 2.4 }); }
export function jerseyStripedLong(seed = 1, opts = {}) { return jersey('jersey_striped_long', seed, opts, { length: 2.6, stripes: true }); }

// Water-filled plastic barrier: bulbous waist, wide feet with arched notches, big rib bulges.
function waterBarrier(id, seed, opts, color, white) {
  const p = new Prop(id, seed, opts);
  const L = opts.length ?? 1.3;
  const pl = p.paint('plastic', white ? { color, pattern: 'stains', col2: '#8f8a82', patW: 0.5, chip: 0.05, under: '#d0d0cc' } : { color, chip: 0.3, under: '#f06a60', dirt: 0.35, pattern: 'mottle', col2: '#f2574c', patW: 0.5 });
  const prof = [[-0.24, 0.2], [0.24, 0.2], [0.26, 0.3], [0.2, 0.46], [0.19, 0.6], [0.15, 0.78], [0.1, 0.88], [-0.1, 0.88], [-0.15, 0.78], [-0.19, 0.6], [-0.2, 0.46], [-0.26, 0.3]];
  // carved wedge hollows on both faces: body is cut into sections along X, each section's profile has the face
  // pushed in by `dep` from y0 up to a height that shrinks toward the hollow edge (stepped wedge, wide at the bottom).
  const dent = opts.dent ? { amp: opts.dent, freq: 4 } : undefined;
  const R = prof.slice(1, 7), dep = 0.07, y0 = 0.27;
  const wAt = (y) => { for (let i = 0; i < R.length - 1; i++) if (y <= R[i + 1][1]) { const t = (y - R[i][1]) / (R[i + 1][1] - R[i][1]); return R[i][0] + (R[i + 1][0] - R[i][0]) * t; } return R[R.length - 1][0]; };
  const prof2 = (yt) => { // right side up to yt (inset between y0..yt), mirrored back down
    const r = [];
    for (const [x, y] of R) if (y < y0 - 1e-6) r.push([x, y]);
    r.push([wAt(y0), y0], [wAt(y0) - dep, y0]);
    for (const [x, y] of R) if (y > y0 + 1e-6 && y < yt - 1e-6) r.push([x - dep, y]);
    r.push([wAt(yt) - dep, yt], [wAt(yt), yt]);
    for (const [x, y] of R) if (y > yt + 1e-6) r.push([x, y]);
    return [...r, ...r.slice().reverse().map(([x, y]) => [-x, y])];
  };
  const hc = [-L * 0.15, L * 0.15], hws = [0.1, 0.075, 0.05], tops = [0.46, 0.62, 0.78];
  const cuts = new Set([-L / 2, L / 2]);
  for (const c of hc) for (const w of hws) { cuts.add(c - w); cuts.add(c + w); }
  const xsorted = [...cuts].sort((m, n) => m - n), cache = new Map();
  for (let i = 0; i < xsorted.length - 1; i++) {
    const a = xsorted[i], b = xsorted[i + 1], m = (a + b) / 2;
    let yt = 0;
    for (const c of hc) for (let k = 0; k < 3; k++) if (Math.abs(m - c) < hws[k]) yt = Math.max(yt, tops[k]);
    const pr = yt ? (cache.get(yt) || (cache.set(yt, prof2(yt)), cache.get(yt))) : prof;
    p.extrude(pr, b - a, { rot: [0, PI / 2, 0], at: [m, 0, 0], paint: pl, bevel: 0.004, deform: dent });
  }
  // three feet with two arched notches between them
  const fw = L * 0.22;
  for (const x of [-L * 0.39, 0, L * 0.39]) p.box([fw, 0.22, 0.5], { at: [x, 0.11, 0], paint: pl, bevel: 0.035 });
  for (const x of [-L * 0.195, L * 0.195]) {
    p.box([L * 0.17, 0.06, 0.48], { at: [x, 0.19, 0], paint: pl, bevel: 0.03 });
    for (const sx of [-1, 1]) p.box([0.06, 0.06, 0.5], { at: [x + sx * L * 0.075, 0.17, 0], rot: [0, 0, sx * PI / 4], paint: pl, bevel: 0.012 });
  }
  // big vertical rib bulges on both faces
  for (const s of [1, -1]) for (const x of [-L * 0.3, 0, L * 0.3]) {
    p.box([0.2, 0.52, 0.09], { at: [x, 0.5, s * 0.215], rot: [s * 0.12, 0, 0], paint: pl, bevel: 0.03 });
    p.box([0.12, 0.1, 0.06], { at: [x, 0.28, s * 0.25], paint: pl, bevel: 0.025 });
  }
  // round top cap + fill plug
  p.cyl(0.07, 0.05, { at: [L * 0.28, 0.9, 0], paint: p.paint('plastic', { color: white ? '#dcdcd6' : '#c4201c', chip: 0.2 }), seg: 10, bevel: 0.015 });
  p.cyl(0.03, 0.03, { at: [-L * 0.25, 0.9, 0], paint: p.paint('plastic', { color: '#3a3b3d', chip: 0 }), seg: 8 });
  return p.done();
}
export function waterBarrierWhite(seed = 1, opts = {}) { return waterBarrier('water_barrier_white', seed, opts, '#ecebe6', true); }
export function waterBarrierRed(seed = 1, opts = {}) { return waterBarrier('water_barrier_red', seed, opts, '#e8302a', false); }

// ---- crowd barriers (tube frames)
function crowdFrame(p, o) {
  const W = o.width ?? 1.9, H = o.height ?? 1.0, st = p.paint('steel', { color: o.color || '#8a9298', chip: 0.15, rust: 0.25, dirt: 0.5 });
  const hw = W / 2, rr = 0.036, bend = o.bend || 0, n = o.bars ?? 9; // chunky toy tubes (sheet), few fat bars
  const missing = new Set(o.missing || []);
  for (let i = 1; i < n; i++) {
    if (missing.has(i)) continue;
    const x = -hw + (W * i) / n, t = i / n;
    const dz = bend ? bend * Math.sin(t * PI) * (0.4 + p.r()) : 0;
    p.tube([[x, 0.2, 0], [x, H * 0.6, dz * 0.6], [x, H - 0.05, dz]], 0.026, { paint: st, seg: 7, smooth: false });
  }
  for (const s of [-1, 1]) p.rtube([[s * hw, 0.05, 0], [s * hw, o.gap ? H - 0.04 : H - 0.17, 0]], rr, { paint: st });
  const rail = (y, x0, x1, sag = 0) => {
    const pts = [];
    for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push([x0 + (x1 - x0) * t, y, sag ? sag * Math.sin(t * PI) : 0]); }
    p.tube(pts, rr, { paint: st, seg: 8, smooth: true });
    for (const q of [pts[0], pts[6]]) p.sphere(rr * 1.05, { at: q, paint: st, seg: 7 });
  };
  if (o.gap) { rail(H - 0.03, -hw, o.gap[0], bend * 0.2); rail(H - 0.03, o.gap[1], hw, -bend * 0.5); }
  else { // top rail bends down into the posts with big round corners (one smooth tube)
    const c = 0.1, top = H - 0.03, pts = [[-hw, top - c * 1.4, 0], [-hw + c * 0.3, top - c * 0.3, 0]];
    for (let i = 0; i <= 4; i++) { const t = i / 4, x = -hw + c * 1.2 + (2 * hw - c * 2.4) * t; pts.push([x, top, bend * 0.5 * Math.sin(t * PI)]); }
    pts.push([hw - c * 0.3, top - c * 0.3, 0], [hw, top - c * 1.4, 0]);
    p.tube(pts, rr * 1.02, { paint: st, seg: 8, smooth: true, steps: 40 });
  }
  rail(0.2, -hw, hw, bend * 0.2);
  for (const s of [-1, 1]) p.rtube([[s * hw, 0.1, -0.3], [s * hw, 0.045, 0], [s * hw, 0.1, 0.3]], 0.038, { paint: st, smooth: false });
  return { W, H, hw };
}
export function barrierSteel(seed = 1, opts = {}) {
  const p = new Prop('barrier_steel', seed, opts);
  crowdFrame(p, {});
  return p.done();
}
export function barrierSteelBroken(seed = 1, opts = {}) {
  const p = new Prop('barrier_steel_broken', seed, opts);
  crowdFrame(p, { bend: 0.25, missing: [3, 4, 7], gap: [-0.1, 0.25], color: '#7c848a' });
  p.tube([[0.1, 0.9, 0.05], [0.2, 0.6, 0.35], [0.28, 0.5, 0.45]], 0.024, { paint: p.paint('steel', { color: '#7c848a' }), seg: 5, smooth: false });
  return p.done();
}
export function barrierCrowdRed(seed = 1, opts = {}) {
  const p = new Prop('barrier_crowd_red', seed, opts);
  const { W, H } = crowdFrame(p, { color: '#8e969c', bars: 9 });
  const tape = p.paint('paint', { color: RED, col2: WHITE, pattern: 'stripes', patW: 0.13, chip: 0.4 * p.wear / 0.6, under: '#c9c9c4', rust: 0, dirt: 0.2 });
  const a = Math.atan2(H * 0.62, W * 0.9), len = Math.hypot(W * 0.9, H * 0.62);
  p.box([len, 0.11, 0.026], { at: [0, H * 0.52, 0.03], rot: [0, 0, a], paint: tape, bevel: 0.004 });
  p.box([len, 0.11, 0.026], { at: [0, H * 0.52, 0.045], rot: [0, 0, -a], paint: tape, bevel: 0.004 });
  p.box([W - 0.1, 0.12, 0.026], { at: [0, H * 0.84, 0.026], rot: [0, 0, 0.01], paint: tape, bevel: 0.004 });
  p.box([W - 0.1, 0.1, 0.026], { at: [0, H * 0.3, -0.026], paint: tape, bevel: 0.004 });
  return p.done();
}

// Sawhorse barricade with striped boards and steel legs.
export function sawhorse(seed = 1, opts = {}) {
  const p = new Prop('sawhorse', seed, opts);
  const W = opts.width ?? 1.4;
  const st = p.paint('steel', { color: '#55595d', chip: 0.2, rust: 0.4 });
  const band = p.paint('paint', { color: RED, col2: WHITE, pattern: 'stripes', patW: 0.09, chip: 0.5 * p.wear / 0.6, under: '#b9a88e', rust: 0 });
  for (const s of [-1, 1]) {
    const x = s * (W / 2 - 0.08);
    p.tube([[x, 0.92, -0.02], [x, 0.0, 0.34]], 0.022, { paint: st, seg: 6 });
    p.tube([[x, 0.92, 0.02], [x, 0.0, -0.34]], 0.022, { paint: st, seg: 6 });
    p.tube([[x, 0.08, -0.32], [x, 0.08, 0.32]], 0.016, { paint: st, seg: 5 });
  }
  const tilt = opts.tilt ?? 0;
  for (const y of [0.84, 0.55]) p.box([W, 0.24, 0.04], { at: [0, y, 0.04], rot: [0.12, 0, tilt], paint: band, bevel: 0.01 });
  if (opts.broken) p.box([0.4, 0.2, 0.035], { at: [0.45, 0.1, 0.45], rot: [-1.4, 0.4, 0.2], paint: band, bevel: 0.01 });
  return p.done();
}

export function cone(seed = 1, opts = {}) {
  const p = new Prop('cone', seed, opts);
  const H = opts.height ?? 0.5, o = '#f25c13', w = '#f4f4f0';
  p.cyl(0.2, 0.03, { at: [0, 0.015, 0], paint: p.paint('rubber', { color: '#26272b' }), bevel: 0.012, seg: 12 });
  p.lathe([[0.15, 0.03], [0.13, H * 0.25], [0.12, H * 0.3], [0.09, H * 0.62], [0.08, H * 0.68], [0.04, H * 0.97], [0.035, H], [0, H]],
    { seg: 16, colors: [o, o, w, w, o, o, o, o], paint: p.paint('plastic', { color: o, chip: 0.15, dirt: 0.5 }) });
  return p.done();
}

// Tall banded traffic drum on a flat black base
export function trafficDrum(seed = 1, opts = {}) {
  const p = new Prop('traffic_drum', seed, opts);
  const o = '#f2610f', w = '#f4f4ef', H = 0.9, r = 0.19;
  p.cyl(0.26, 0.06, { at: [0, 0.03, 0], paint: p.paint('rubber', { color: '#26272b' }), bevel: 0.02, seg: 12 });
  const pts = [[r, 0.06], [r, 0.2], [r, 0.2], [r, 0.38], [r, 0.38], [r, 0.52], [r, 0.52], [r, 0.7], [r - 0.01, 0.86], [r - 0.03, H], [0, H]];
  p.lathe(pts, { seg: 16, colors: [o, o, o, w, w, o, o, w, w, o, o], paint: p.paint('plastic', { color: o, chip: 0.2, dirt: 0.6 }), deform: opts.dent ? { amp: opts.dent, freq: 3 } : undefined });
  p.cyl(0.05, 0.03, { at: [0, H + 0.01, 0], paint: p.paint('plastic', { color: '#2a2a2c', chip: 0 }), seg: 8 });
  return p.done();
}

// Wider barrel with handle ring top
export function trafficBarrel(seed = 1, opts = {}) {
  const p = new Prop('traffic_barrel', seed, opts);
  const o = '#f2610f', w = '#f4f4ef', H = 0.85;
  p.cyl(0.28, 0.05, { at: [0, 0.025, 0], paint: p.paint('rubber', { color: '#26272b' }), bevel: 0.02, seg: 12 });
  const pts = [[0.25, 0.05], [0.25, 0.14], [0.24, 0.2], [0.23, 0.3], [0.21, 0.4], [0.2, 0.46], [0.2, 0.5], [0.185, 0.6], [0.18, 0.72], [0.17, 0.82], [0.14, H], [0, H]];
  p.lathe(pts, { seg: 16, colors: [o, o, o, w, w, w, w, w, o, o, o, o], paint: p.paint('plastic', { color: o, chip: 0.2, dirt: 0.6 }), deform: opts.dent ? { amp: opts.dent, freq: 3 } : undefined });
  p.torus(0.1, 0.018, { at: [0, H + 0.01, 0], rot: [PI / 2, 0, 0], paint: p.paint('plastic', { color: '#2a2a2c', chip: 0 }), seg: 10, tube: 5 });
  return p.done();
}

function block(p, o = {}) {
  const paint = o.paint || p.paint('concrete', { color: '#c8cacb', chip: 0.5, dirt: 0.5 });
  const hole = p.paint('concrete', { color: '#7b7e80', chip: 0, dirt: 0.3 });
  const at = o.at || [0, 0.095, 0], rot = o.rot || [0, 0, 0];
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot));
  const P = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(m).add(new THREE.Vector3(...at)).toArray();
  p.box([0.39, 0.19, 0.19], { at, rot, paint, bevel: 0.015 });
  for (const sz of [1, -1]) for (const x of [-0.09, 0.09]) p.box([0.1, 0.1, 0.012], { at: P(x, 0.0, sz * 0.095), rot, paint: hole, bevel: 0.004 });
}

export function cinderBlock(seed = 1, opts = {}) {
  const p = new Prop('cinder_block', seed, opts);
  const paint = p.paint('concrete', { color: opts.color || '#c4c7c8', chip: 0.5, dirt: 0.5 });
  if (opts.stack) {
    block(p, { at: [0, 0.095, 0.0], paint });
    block(p, { at: [0.09, 0.285, 0], rot: [0, 0.2, 0], paint });
    block(p, { at: [-0.1, 0.095, 0.4], rot: [0, -0.1, 0], paint });
  } else block(p, { paint });
  return p.done();
}

export function concreteBlockTarp(seed = 1, opts = {}) {
  const p = new Prop('concrete_block_tarp', seed, opts);
  const con = p.paint('concrete', { pattern: 'stains', col2: '#7d6d60', patW: 0.4 });
  const tarp = p.paint('tarp', { color: opts.color || '#2b57c9', under: '#1e3fa0', pattern: 'mottle', col2: '#22389a', patW: 0.4, chip: 0, dirt: 0.5 });
  const L = 1.5;
  p.extrude([[-0.3, 0], [0.3, 0], [0.3, 0.1], [0.2, 0.28], [0.17, 0.62], [-0.17, 0.62], [-0.2, 0.28], [-0.3, 0.1]], L, { rot: [0, PI / 2, 0], paint: con, bevel: 0.03 });
  p.box([0.7, 0.04, 0.46], { at: [0.0, 0.645, 0.0], rot: [0, 0.05, 0.03], paint: tarp, bevel: 0.015, deform: { amp: 0.012, freq: 8 } });
  for (const s of [1, -1]) p.box([0.66, 0.2, 0.03], { at: [0.0, 0.55, s * 0.205], rot: [s * 0.35, 0.05, 0.03], paint: tarp, bevel: 0.012, deform: { amp: 0.014, freq: 8 } });
  p.box([0.05, 0.22, 0.4], { at: [0.37, 0.55, 0.0], rot: [0, 0, -0.5], paint: tarp, bevel: 0.01 });
  block(p, { at: [-0.5, 0.715, 0.02], rot: [0, 0.15, 0] });
  block(p, { at: [0.52, 0.715, -0.03], rot: [0, -0.3, 0], paint: p.paint('concrete', { color: '#b0b4b5' }) });
  parts.loop(p, { at: [-L * 0.4, 0.62, 0.0], w: 0.12, h: 0.07 });
  return p.done();
}

export function floodLight(seed = 1, opts = {}) {
  const p = new Prop('flood_light', seed, opts);
  const dk = p.paint('steel', { color: '#2f3336', under: '#6b7075', chip: 0.2, rust: 0.2 });
  const H = opts.height ?? 1.7;
  for (let i = 0; i < 3; i++) {
    const a = i * PI * 2 / 3 + 0.5, x = Math.sin(a) * 0.55, z = Math.cos(a) * 0.55;
    p.tube([[0, H - 0.2, 0], [x, 0.0, z]], 0.026, { paint: dk, seg: 6 });
    p.cyl(0.04, 0.02, { at: [x, 0.01, z], paint: p.paint('rubber'), seg: 8 });
  }
  p.cyl(0.05, H - 0.2, { at: [0, (H - 0.2) / 2 + 0.2, 0], paint: dk, seg: 8 });
  p.cyl(0.07, 0.1, { at: [0, H - 0.18, 0], paint: dk, seg: 8 });
  p.cyl(0.03, 0.2, { at: [0, H - 0.05, 0], paint: dk, seg: 8 });
  p.box([0.7, 0.04, 0.04], { at: [0, H + 0.05, 0], paint: dk, bevel: 0.01 });
  const glow = p.paint('glow', { color: '#e6f3f6' });
  for (const s of [-1, 1]) {
    const cx = s * 0.33, cy = H + 0.22, rz = -s * 0.04;
    p.box([0.4, 0.3, 0.14], { at: [cx, cy, 0], rot: [-0.2, s * -0.25, rz], paint: p.paint('paint', { color: '#34383b', under: '#7a7f83', chip: 0.5, rust: 0.2 }), bevel: 0.025 });
    p.box([0.33, 0.23, 0.01], { at: [cx + s * -0.015, cy + 0.01, 0.08], rot: [-0.2, s * -0.25, rz], paint: glow, bevel: 0.002 });
    p.box([0.05, 0.1, 0.05], { at: [cx, H + 0.09, 0], paint: dk, bevel: 0.01 });
  }
  return p.done();
}

export function fenceBroken(seed = 1, opts = {}) {
  const p = new Prop('fence_broken', seed, opts);
  const W = opts.width ?? 1.8, n = opts.planks ?? 12, pw = W / n;
  const woods = ['#8a4b3a', '#9a5a42', '#7a3f32', '#a56a4c', '#85463a'];
  const rail = p.paint('wood', { color: '#6e3a2c' });
  for (const y of [0.35, 0.95]) p.box([W + 0.1, 0.07, 0.05], { at: [0, y, -0.05], paint: rail, bevel: 0.01, rot: [0, 0, (p.r() - 0.5) * 0.05] });
  for (const s of [-1, 1]) p.box([0.08, 1.4, 0.07], { at: [s * (W / 2 + 0.03), 0.7, -0.08], paint: rail, bevel: 0.01, rot: [0, 0, s * 0.03] });
  for (let i = 0; i < n; i++) {
    if (i === 4 || (opts.gaps && i === 8)) continue;
    const x = -W / 2 + pw * (i + 0.5);
    const hmax = 1.3 + (p.r() - 0.5) * 0.2, broken = p.chance(0.55), h = broken ? 0.6 + p.r() * 0.6 : hmax;
    const w = pw * 0.88, y0 = p.r() * 0.06;
    const pts = broken
      ? [[-w / 2, 0], [w / 2, 0], [w / 2, h - 0.1 - p.r() * 0.12], [w * 0.1, h + 0.06 * p.r()], [-w / 2, h - 0.05]]
      : [[-w / 2, 0], [w / 2, 0], [w / 2, h - 0.04], [0, h + 0.05], [-w / 2, h - 0.04]];
    p.extrude(pts, 0.03, { at: [x, y0, (p.r() - 0.5) * 0.04], rot: [(p.r() - 0.5) * 0.1, 0, (p.r() - 0.5) * (broken ? 0.18 : 0.08)], paint: p.paint('wood', { color: woods[(p.r() * woods.length) | 0], dirt: 0.6 }), bevel: 0.006 });
  }
  return p.done();
}

export const PROPS = [
  { id: 'jersey_striped', name: 'Dải phân cách sọc', build: jerseyStriped, yaw: 0.25,
    variants: [{ label: 'mới', seed: 1, opts: { wear: 0.1 } }, { label: 'cũ', seed: 2, opts: { wear: 0.8, stains: true } }, { label: 'trơn', seed: 3, opts: { stripes: false } }] },
  { id: 'jersey_stained', name: 'Dải phân cách loang ố', build: jerseyStained, yaw: 0.25,
    variants: [{ label: 'loang', seed: 1, opts: {} }, { label: 'rất cũ', seed: 4, opts: { wear: 1 } }] },
  { id: 'jersey_broken_mid', name: 'Dải phân cách vỡ giữa', build: jerseyBrokenMid, yaw: 0.25,
    variants: [{ label: 'vỡ', seed: 1, opts: {} }, { label: 'sọc', seed: 3, opts: { stripes: true, wear: 0.9 } }] },
  { id: 'jersey_broken_end', name: 'Dải phân cách gãy đầu', build: jerseyBrokenEnd, yaw: 0.6,
    variants: [{ label: 'gãy', seed: 1, opts: {} }, { label: 'loang', seed: 2, opts: { stains: true, wear: 0.9 } }] },
  { id: 'jersey_plain', name: 'Dải phân cách trơn', build: jerseyPlain, yaw: 0.25,
    variants: [{ label: 'trơn', seed: 1, opts: {} }, { label: 'loang', seed: 2, opts: { stains: true, wear: 0.9 } }] },
  { id: 'jersey_broken_long', name: 'Dải phân cách dài gãy', build: jerseyBrokenLong, yaw: 0.5,
    variants: [{ label: 'gãy', seed: 1, opts: {} }, { label: 'loang', seed: 5, opts: { stains: true, wear: 1 } }] },
  { id: 'jersey_striped_long', name: 'Dải phân cách dài sọc', build: jerseyStripedLong, yaw: 0.5,
    variants: [{ label: 'mới', seed: 1, opts: { wear: 0.1 } }, { label: 'cũ', seed: 2, opts: { wear: 0.9, stains: true } }] },
  { id: 'water_barrier_white', name: 'Rào nhựa trắng', build: waterBarrierWhite, yaw: 0.45,
    variants: [{ label: 'loang', seed: 1, opts: {} }, { label: 'mới', seed: 2, opts: { wear: 0.1 } }] },
  { id: 'water_barrier_red', name: 'Rào nhựa đỏ', build: waterBarrierRed, yaw: 0.45,
    variants: [{ label: 'mới', seed: 1, opts: { wear: 0.2 } }, { label: 'cũ', seed: 2, opts: { wear: 1, dent: 0.01 } }] },
  { id: 'barrier_crowd_red', name: 'Rào đám đông sọc đỏ', build: barrierCrowdRed, yaw: 0.35,
    variants: [{ label: 'mới', seed: 1, opts: { wear: 0.2 } }, { label: 'cũ', seed: 2, opts: { wear: 1 } }] },
  { id: 'barrier_steel', name: 'Rào thép đám đông', build: barrierSteel, yaw: 0.35,
    variants: [{ label: 'mới', seed: 1, opts: { wear: 0.2 } }, { label: 'gỉ', seed: 2, opts: { wear: 1 } }] },
  { id: 'barrier_steel_broken', name: 'Rào thép gãy', build: barrierSteelBroken, yaw: 0.35,
    variants: [{ label: 'cong', seed: 1, opts: {} }, { label: 'gỉ', seed: 3, opts: { wear: 1 } }] },
  { id: 'sawhorse', name: 'Rào ngựa gỗ', build: sawhorse, yaw: 0.7,
    variants: [{ label: 'mới', seed: 1, opts: { wear: 0.2 } }, { label: 'đổ ván', seed: 2, opts: { wear: 1, broken: true, tilt: 0.04 } }] },
  { id: 'cone', name: 'Nón giao thông', build: cone, yaw: 0,
    variants: [{ label: 'mới', seed: 1, opts: { wear: 0.1 } }, { label: 'bẩn', seed: 2, opts: { wear: 1 } }] },
  { id: 'traffic_drum', name: 'Cột giao thông sọc', build: trafficDrum, yaw: 0,
    variants: [{ label: 'mới', seed: 1, opts: { wear: 0.1 } }, { label: 'móp', seed: 2, opts: { wear: 1, dent: 0.02 } }] },
  { id: 'traffic_barrel', name: 'Thùng giao thông', build: trafficBarrel, yaw: 0,
    variants: [{ label: 'mới', seed: 1, opts: { wear: 0.1 } }, { label: 'móp', seed: 2, opts: { wear: 1, dent: 0.02 } }] },
  { id: 'cinder_block', name: 'Gạch block', build: cinderBlock, yaw: 0.5,
    variants: [{ label: 'một', seed: 1, opts: {} }, { label: 'chồng', seed: 2, opts: { stack: true, wear: 1 } }] },
  { id: 'concrete_block_tarp', name: 'Khối bê tông phủ bạt', build: concreteBlockTarp, yaw: 0.45,
    variants: [{ label: 'xanh', seed: 1, opts: {} }, { label: 'cũ', seed: 2, opts: { wear: 1, color: '#2f6bb8' } }] },
  { id: 'flood_light', name: 'Đèn pha chân ba', build: floodLight, yaw: 0.3,
    variants: [{ label: 'cao', seed: 1, opts: {} }, { label: 'thấp', seed: 2, opts: { height: 1.3, wear: 1 } }] },
  { id: 'fence_broken', name: 'Hàng rào ván gãy', build: fenceBroken, yaw: 0.1,
    variants: [{ label: 'gãy', seed: 1, opts: {} }, { label: 'thưa', seed: 2, opts: { gaps: true, wear: 1 } }] },
];
