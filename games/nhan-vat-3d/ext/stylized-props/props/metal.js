// Metal cabinets, machinery, big structures: lockers, fridge, safes, tool chests, generator, container, caravan, scrap piles.
import { Prop } from '../lib/prop.js';
import * as parts from '../lib/parts.js';
import { bevelBox, extrude as gExtrude } from '../lib/geo.js';

// ---------------------------------------------------------------- local helpers
const PI = Math.PI;
// Cheap bevelled box: one bevel ring (108 tris) instead of the 2-ring default (300 tris).
function box1(p, s, o = {}) {
  return p.geom(bevelBox(s[0], s[1], s[2], o.bevel ?? Math.min(0.02, Math.min(...s) * 0.18), 1), o);
}
// Plain box (12 tris) for tiny details.
const flat = (p, s, o = {}) => p.box(s, { ...o, bevel: 0 });

// Rounded polygon: corners [[x,y,r?],...] (CCW) -> points with arc fillets.
function roundPoly(corners, rDef = 0.05, steps = 3) {
  const out = [], n = corners.length;
  for (let i = 0; i < n; i++) {
    const [x, y, rc] = corners[i], r = rc ?? rDef;
    const a = corners[(i - 1 + n) % n], b = corners[(i + 1) % n];
    if (!r) { out.push([x, y]); continue; }
    const v1 = [a[0] - x, a[1] - y], v2 = [b[0] - x, b[1] - y];
    const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2);
    const u1 = [v1[0] / l1, v1[1] / l1], u2 = [v2[0] / l2, v2[1] / l2];
    const t = Math.min(r, l1 * 0.45, l2 * 0.45);
    const p1 = [x + u1[0] * t, y + u1[1] * t], p2 = [x + u2[0] * t, y + u2[1] * t];
    for (let k = 0; k <= steps; k++) { // quadratic bezier through the corner
      const s = k / steps, m = 1 - s;
      out.push([m * m * p1[0] + 2 * m * s * x + s * s * p2[0], m * m * p1[1] + 2 * m * s * y + s * s * p2[1]]);
    }
  }
  return out;
}
const rrect = (w, h, r, steps = 3) => roundPoly([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], r, steps);

// Corrugated sheet in local XY: waves along X (len), height along Y (h), ribs stick out toward +Z.
// Back face flat at z = -thick. Centred on x, y; outer crest at z = amp.
function corrugated(p, o) {
  const { len, h, amp = 0.035, pitch = 0.3, thick = 0.02 } = o;
  const n = Math.max(1, Math.round(len / pitch)), P = len / n, x0 = -len / 2;
  const pts = [[x0, -thick], [len / 2, -thick]];
  const wave = [];
  for (let i = 0; i < n; i++) {
    const a = x0 + i * P;
    wave.push([a, 0], [a + P * 0.28, 0], [a + P * 0.4, amp], [a + P * 0.88, amp]);
  }
  wave.push([len / 2, 0]);
  for (let i = wave.length - 1; i >= 0; i--) pts.push(wave[i]);
  const g = gExtrude(pts, h, { bevel: 0, curveSegs: 1 });
  g.rotateX(PI / 2); // shape Y (depth) -> +Z, extrusion -> Y
  // every vertex of an unbevelled extrude sits on a crease -> chip mask would cover the whole sheet
  const ew = g.attributes.aEdgeW; if (ew) { ew.array.fill(o.edge ?? 0); ew.needsUpdate = true; }
  return p.geom(g, { at: o.at, rot: o.rot, paint: o.paint, node: o.node });
}

// Open-front carcass (back, sides, top, bottom). at = bottom centre. Returns inner size.
function carcass(p, o) {
  const { w, h, d, t = 0.025, paint, at = [0, 0, 0], node, inner } = o;
  const [x, y, z] = at;
  box1(p, [t, h, d], { at: [x - w / 2 + t / 2, y + h / 2, z], paint, node, bevel: o.bevel });
  box1(p, [t, h, d], { at: [x + w / 2 - t / 2, y + h / 2, z], paint, node, bevel: o.bevel });
  box1(p, [w, t, d], { at: [x, y + h - t / 2, z], paint, node, bevel: o.bevel });
  box1(p, [w - 2 * t, t, d - t], { at: [x, y + t / 2, z + t / 2], paint, node, bevel: 0.006 });
  flat(p, [w - 2 * t, h - 2 * t, t], { at: [x, y + h / 2, z - d / 2 + t / 2], paint, node });
  if (inner) { // liner (darker / grey interior)
    flat(p, [w - 2 * t - 0.004, h - 2 * t - 0.004, 0.004], { at: [x, y + h / 2, z - d / 2 + t + 0.002], paint: inner, node });
    flat(p, [0.004, h - 2 * t - 0.004, d - t - 0.01], { at: [x - w / 2 + t + 0.002, y + h / 2, z + t / 2 - 0.005], paint: inner, node });
    flat(p, [0.004, h - 2 * t - 0.004, d - t - 0.01], { at: [x + w / 2 - t - 0.002, y + h / 2, z + t / 2 - 0.005], paint: inner, node });
    flat(p, [w - 2 * t - 0.004, 0.004, d - t - 0.01], { at: [x, y + h - t - 0.002, z + t / 2 - 0.005], paint: inner, node });
    flat(p, [w - 2 * t - 0.004, 0.004, d - t - 0.01], { at: [x, y + t + 0.002, z + t / 2 - 0.005], paint: inner, node });
  }
  return [w - 2 * t, h - 2 * t, d - t];
}

// Concrete counterweight block with a rebar handle on top.
function weightBlock(p, o) {
  const [w, h, d] = o.size;
  const paint = o.paint || p.paint('concrete', { color: '#c9cbcb', chip: 0.5 });
  box1(p, [w, h, d], { at: o.at, rot: o.rot, paint, bevel: 0.04, deform: { amp: 0.012, freq: 3 } });
  const r = o.rot || [0, 0, 0];
  const [x, y, z] = o.at;
  // handle sits on top (rot only around Y used for the handle)
  const c = Math.cos(r[1]), s = Math.sin(r[1]);
  const ox = o.handleX ?? 0;
  handle(p, { at: [x + ox * c, y + h / 2 - 0.01, z - ox * s], rot: [r[0], r[1], r[2]], w: Math.min(w, d) * 0.45, h: h * 0.42, r: 0.024,
    paint: p.paint('metal', { color: '#5f6468', rust: 0.3 }) });
}

// Cheap U handle (same shape as parts.loop, ~1/4 of its triangles).
function handle(p, o = {}) {
  const w = o.w ?? 0.12, h = o.h ?? 0.08, r = o.r ?? 0.012;
  return p.tube([[-w / 2, 0, 0], [-w / 2, h * 0.75, 0], [-w * 0.3, h, 0], [w * 0.3, h, 0], [w / 2, h * 0.75, 0], [w / 2, 0, 0]], r,
    { at: o.at, rot: o.rot, order: o.order, paint: o.paint || p.paint('metal', { color: '#6c7176' }), seg: 5, steps: 12, node: o.node });
}

// Fence plank standing on y=0 with a jagged top. Width along X, thickness along Z.
function fencePlank(p, o) {
  const { w = 0.17, h = 1.3, t = 0.04 } = o;
  const a = p.range(0.02, 0.14), b = p.range(0.05, 0.22);
  const pts = [[-w / 2, 0], [w / 2, 0], [w / 2, h - a], [w * p.range(-0.2, 0.3), h], [-w / 2, h - b]];
  if (p.chance(0.4)) pts.splice(3, 0, [w * 0.35, h - a - 0.1]);
  return p.extrude(pts, t, { at: o.at, rot: o.rot, order: o.order, paint: o.paint, bevel: 0.006, curveSegs: 1 });
}

// Cheap cinder block (single box with two dark holes on top).
function cinder(p, o) {
  const paint = o.paint || p.paint('concrete', { color: '#b6b9ba' });
  const dark = p.paint('concrete', { color: '#4b5455', chip: 0, dirt: 0.8 });
  const r = o.rot || [0, 0, 0], [x, y, z] = o.at;
  box1(p, [0.39, 0.19, 0.19], { at: [x, y + 0.095, z], rot: r, paint, bevel: 0.012 });
  const c = Math.cos(r[1]), s = Math.sin(r[1]);
  for (const k of [-0.095, 0.095]) {
    flat(p, [0.13, 0.004, 0.12], { at: [x + k * c, y + 0.19, z - k * s], rot: r, paint: dark });
    flat(p, [0.13, 0.12, 0.004], { at: [x + k * c + 0.0955 * s, y + 0.095, z - k * s + 0.0955 * c], rot: r, paint: dark });
  }
}

// ---------------------------------------------------------------- lockers
// Triple steel locker. opts: doors (opens all three, staggered), door2 (extra on the last door), color
export function lockersTriple(seed = 1, opts = {}) {
  const p = new Prop('lockers_triple', seed, opts);
  const body = p.paint('paint', { color: opts.color || '#6b929b', under: '#a9b0b4', chip: 0.22, rust: 0.12 });
  const inner = p.paint('paint', { color: '#2e383c', chip: 0.05, rust: 0.1, dirt: 0.7 });
  const steel = p.paint('steel', { color: '#5a6064' });
  const W = 0.4, H = 1.75, D = 0.48, n = 3, t = 0.025, y0 = 0.07;
  const TW = W * n + t;
  carcass(p, { w: TW, h: H, d: D, t, paint: body, at: [0, y0, 0], inner, bevel: 0.012 });
  for (let i = 1; i < n; i++) flat(p, [t * 0.8, H - 2 * t, D - t], { at: [-TW / 2 + i * W + t / 2, y0 + H / 2, t / 2], paint: body });
  box1(p, [TW + 0.03, 0.05, D + 0.03], { at: [0, y0 + H + 0.025, 0], paint: body, bevel: 0.015 }); // top cap
  box1(p, [TW + 0.01, y0, D - 0.02], { at: [0, y0 / 2, -0.01], paint: steel, bevel: 0.01 }); // plinth
  const chrome = p.paint('chrome');
  const doors = [];
  for (let i = 0; i < n; i++) {
    const x0 = -TW / 2 + i * W + t;
    const dw = W - t - 0.006, dh = H - 2 * t - 0.01;
    // shelf + hat hook inside each bay
    flat(p, [W - t - 0.01, 0.015, D - 0.06], { at: [x0 + (W - t) / 2, y0 + H - 0.32, 0], paint: inner });
    flat(p, [0.012, 0.06, 0.012], { at: [x0 + (W - t) / 2, y0 + H - 0.42, -D / 2 + 0.06], paint: chrome });
    const d = p.node('door' + i, { at: [x0, y0 + t + 0.005, D / 2 + 0.01] });
    p.in(d, () => {
      box1(p, [dw, dh, 0.022], { at: [dw / 2, dh / 2, 0], paint: body, bevel: 0.006 });
      box1(p, [dw * 0.8, dh * 0.42, 0.006], { at: [dw / 2, dh * 0.3, 0.012], paint: body, bevel: 0.003 }); // pressed panel
      for (let k = 0; k < 5; k++) flat(p, [dw * 0.55, 0.014, 0.012], { at: [dw / 2, dh - 0.12 - k * 0.035, 0.016], rot: [0.6, 0, 0], paint: p.paint('paint', { color: '#2b3a3f', chip: 0, rust: 0, dirt: 0 }) }); // louvers (dark slot faces)
      flat(p, [0.09, 0.05, 0.004], { at: [dw / 2, dh - 0.36, 0.013], paint: p.paint('paint', { color: '#d9d4c3', chip: 0.3 }) }); // name tag
      box1(p, [0.025, 0.12, 0.025], { at: [dw - 0.05, dh * 0.52, 0.02], paint: chrome, bevel: 0.006 });
    });
    doors.push(d);
  }
  const k = [1, 0.62, 0.85];
  p.param('doors', opts.doors ?? 0, (v) => { doors.forEach((d, i) => { d.rotation.y = -v * 1.9 * k[i] * (i === 0 ? 1 : (opts.doorsAll === false ? 0 : 1)); }); });
  p.param('door2', opts.door2 ?? 0, (v) => { if (v > 0) doors[2].rotation.y = -v * 1.9; });
  return p.done();
}

// ---------------------------------------------------------------- shipping container
// 20ft container. opts: color, doors 0..1 (both doors swing out), rusty (bool)
export function containerOpen(seed = 1, opts = {}) {
  const p = new Prop('container_open', seed, opts);
  const rusty = !!opts.rusty;
  const col = opts.color || '#e8615e';
  const wall = p.paint(rusty ? 'rusty' : 'paint', rusty ? { color: '#9a4b2c', chip: 0.5, rust: 0.95 } : { color: col, under: '#8a8e92', chip: 0.12, rust: 0.12 });
  const frame = p.paint(rusty ? 'rusty' : 'paint', rusty ? { color: '#7d3f26', rust: 0.9 } : { color: col, under: '#6e7275', chip: 0.9, rust: 0.45 });
  const cast = p.paint('steel', { color: '#4a4d50', rust: 0.6 });
  const dark = p.paint('paint', { color: '#1b1c1e', chip: 0 });
  const floor = p.paint('wood', { color: '#5b3a2a', dirt: 0.9 });
  const L = 5.8, W = 2.44, H = 2.8, post = 0.16, rail = 0.14; // stylised: a bit shorter / taller than ISO
  const hx = L / 2, hz = W / 2;
  // corner posts
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box1(p, [post, H, post], { at: [sx * (hx - post / 2), H / 2, sz * (hz - post / 2)], paint: frame, bevel: 0.02 });
  // long rails top / bottom
  for (const sz of [-1, 1]) {
    box1(p, [L - 0.02, rail, rail * 0.9], { at: [0, H - rail / 2, sz * (hz - rail * 0.45)], paint: frame, bevel: 0.02 });
    box1(p, [L - 0.02, rail * 1.3, rail], { at: [0, rail * 0.65, sz * (hz - rail / 2)], paint: frame, bevel: 0.02 });
  }
  // end rails
  for (const sx of [-1, 1]) {
    box1(p, [rail, rail, W - 0.02], { at: [sx * (hx - rail / 2), H - rail / 2, 0], paint: frame, bevel: 0.02 });
    box1(p, [rail, rail * 1.5, W - 0.02], { at: [sx * (hx - rail / 2), rail * 0.75, 0], paint: frame, bevel: 0.02 });
  }
  // corner castings with slots
  for (const sx of [-1, 1]) for (const sy of [0, 1]) for (const sz of [-1, 1]) {
    const y = sy ? H - 0.06 : 0.06;
    box1(p, [0.19, 0.13, 0.19], { at: [sx * (hx - 0.09), y, sz * (hz - 0.09)], paint: cast, bevel: 0.015 });
    flat(p, [0.09, 0.05, 0.01], { at: [sx * (hx - 0.09), y, sz * (hz + 0.002)], paint: dark });
    flat(p, [0.01, 0.05, 0.08], { at: [sx * (hx + 0.002), y, sz * (hz - 0.09)], paint: dark });
  }
  // corrugated side walls (dented by seed)
  const wl = L - 2 * post, wh = H - rail - rail * 1.3;
  const wy = rail * 1.3 + wh / 2;
  const dent = { amp: rusty ? 0.03 : 0.018, freq: 1.4 };
  corrugated(p, { len: wl, h: wh, amp: 0.09, pitch: 0.4, at: [0, wy, hz - 0.1], paint: wall });
  corrugated(p, { len: wl, h: wh, amp: 0.09, pitch: 0.4, at: [0, wy, -hz + 0.1], rot: [0, PI, 0], paint: wall });
  // closed end (-X)
  corrugated(p, { len: W - 2 * post, h: wh, amp: 0.07, pitch: 0.34, at: [-hx + 0.09, wy, 0], rot: [0, -PI / 2, 0], paint: wall });
  // roof: shallow corrugation, ribs up
  const roof = { ...wall, chip: wall.chip * 0.45 };
  corrugated(p, { len: wl, h: W - 2 * rail * 0.9, amp: 0.03, pitch: 0.5, thick: 0.02, at: [0, H - 0.06, 0], rot: [-PI / 2, 0, 0], paint: roof });
  // interior floor + crossmember shadow
  box1(p, [L - 0.3, 0.04, W - 0.3], { at: [0, rail * 1.3 + 0.02, 0], paint: floor, bevel: 0.01 });
  // painted stencils on the side (dark id band)
  flat(p, [0.6, 0.12, 0.004], { at: [hx - 0.8, H - 0.45, hz - 0.01 + 0.04], paint: p.paint('paint', { color: '#f2efe6', chip: 0.6 }) });
  // ---- doors on +X end
  const dw = W / 2 - post + 0.02, dh = H - rail - rail * 1.5 + 0.02;
  const rod = p.paint('paint', { color: '#e4e7e9', under: '#8d9296', chip: 0.2, rust: 0.15, metal: 0.3 });
  const doors = [];
  for (const side of [1, -1]) {
    // hinge on outer post, door spans toward the centre
    const d = p.node(side > 0 ? 'doorR' : 'doorL', { at: [hx + 0.01, rail * 1.5 - 0.01, side * (hz - post + 0.02)] });
    p.in(d, () => {
      const zc = -side * dw / 2;
      corrugated(p, { len: dw - 0.12, h: dh - 0.16, amp: 0.025, pitch: 0.28, at: [0.0, dh / 2, zc], rot: [0, PI / 2, 0], paint: wall, thick: 0.03 });
      // door frame
      box1(p, [0.05, dh, 0.06], { at: [0.0, dh / 2, -side * 0.03], paint: frame, bevel: 0.012 });
      box1(p, [0.05, dh, 0.06], { at: [0.0, dh / 2, -side * (dw - 0.03)], paint: frame, bevel: 0.012 });
      box1(p, [0.05, 0.08, dw], { at: [0.0, dh - 0.04, zc], paint: frame, bevel: 0.012 });
      box1(p, [0.05, 0.08, dw], { at: [0.0, 0.04, zc], paint: frame, bevel: 0.012 });
      // inner face (darker) so the open door reads from behind
      flat(p, [0.01, dh - 0.1, dw - 0.1], { at: [-0.035, dh / 2, zc], paint: p.paint('paint', { color: rusty ? '#6b3a24' : '#a3332d', chip: 0.3, rust: 0.6 }) });
      // two locking bars with handles + cams
      for (const f of [0.28, 0.72]) {
        const z = -side * dw * f;
        p.cyl(0.032, dh + 0.12, { at: [0.07, dh / 2, z], paint: rod, seg: 7, bevel: 0.006 });
        for (const y of [0.06, dh - 0.06]) flat(p, [0.05, 0.07, 0.07], { at: [0.05, y, z], paint: cast });
        for (const y of [dh * 0.3, dh * 0.7]) flat(p, [0.03, 0.04, 0.08], { at: [0.04, y, z], paint: rod });
        // handle lever
        p.box([0.03, 0.035, 0.32], { at: [0.085, dh * 0.42, z - side * 0.12], paint: rod, bevel: 0 });
        flat(p, [0.04, 0.09, 0.05], { at: [0.06, dh * 0.42, z - side * 0.27], paint: cast });
      }
      // hinges
      for (const y of [0.25, dh * 0.5, dh - 0.25]) flat(p, [0.06, 0.07, 0.07], { at: [0.03, y, -side * 0.015], paint: cast });
    });
    doors.push([d, side]);
  }
  // large worn patches (grey bare metal) painted as thin irregular plates, like the ref's few big chips
  const bare = p.paint('steel', { color: '#7b8085', under: '#6e7378', chip: 0, rust: rusty ? 0.6 : 0.35, dirt: 0.4, metal: 0.3 });
  const patch = (at, rot, r) => {
    const n = 9, pts = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * PI * 2, rr = r * p.range(0.6, 1.15); pts.push([Math.cos(a) * rr * 1.3, Math.sin(a) * rr]); }
    p.extrude(pts, 0.006, { at, rot, paint: bare, bevel: 0.002, curveSegs: 1 });
  };
  const nSide = p.int(4, 6), crest = hz - 0.1 + 0.093;
  for (let i = 0; i < nSide; i++) patch([p.range(-hx + 0.6, hx - 0.6), p.range(0.5, H - 0.5), crest], [0, 0, p.range(-0.5, 0.5)], p.range(0.16, 0.34));
  for (let i = 0; i < 2; i++) patch([p.range(-hx + 0.6, hx - 0.6), p.range(0.5, H - 0.5), -crest], [0, PI, p.range(-0.5, 0.5)], p.range(0.16, 0.3));
  for (let i = 0; i < 3; i++) patch([p.range(-hx + 0.6, hx - 0.6), H - 0.06 + 0.035, p.range(-0.7, 0.7)], [-PI / 2, 0, p.range(0, 3)], p.range(0.18, 0.35));
  p.in(doors[0][0], () => patch([0.06, p.range(0.5, 1.6), -dw * 0.5], [0, PI / 2, 0.3], 0.14));
  p.param('doors', opts.doors ?? 0, (v) => { for (const [d, side] of doors) d.rotation.y = side * -v * 2.1 * (side > 0 ? 1 : 0.95); });
  void dent;
  return p.done();
}

// ---------------------------------------------------------------- caravan
// Lime trailer with chamfered roof, double door on the -X end. opts: doors 0..1, color
export function caravan(seed = 1, opts = {}) {
  const p = new Prop('caravan', seed, opts);
  const lime = p.paint('paint', { color: opts.color || '#a9c63c', under: '#7f9636', chip: 0.12, rust: 0, dirt: 0.5 });
  const inside = p.paint('paint', { color: '#3d4a1c', chip: 0, rust: 0, dirt: 0.8 });
  const blue = p.paint('paint', { color: '#2c7fe6', rough: 0.2, chip: 0, rust: 0, dirt: 0.1 });
  const red = p.paint('paint', { color: '#d23b2b', rough: 0.25, chip: 0, rust: 0, dirt: 0.1 });
  const steel = p.paint('steel', { color: '#b9bec2', under: '#7b8186', chip: 0.2 });
  const beam = p.paint('wood', { color: '#b8503a', under: '#d58060', chip: 0.3 });
  const L = 5.0, W = 2.3, H = 2.45, yb = 0.24; // body base height
  const halfW = W / 2;
  // cross-section in (z, y): vertical sides, big chamfer to roof
  const prof = roundPoly([[-halfW, 0, 0.08], [halfW, 0, 0.08], [halfW, H * 0.6, 0.12], [halfW - 0.55, H, 0.14], [-halfW + 0.55, H, 0.14], [-halfW, H * 0.6, 0.12]], 0.12, 3);
  const front = 0.4; // depth of the door frame section at -X end
  const bodyLen = L - front;
  const gBody = gExtrude(prof, bodyLen, { bevel: 0.05, curveSegs: 1 });
  gBody.rotateY(PI / 2);
  p.geom(gBody, { at: [front / 2, yb, 0], paint: lime });
  // door frame section with hole
  const dW = 1.3, dH = 1.85, dY = 0.18;
  const hole = [[-dW / 2, dY], [-dW / 2, dY + dH], [dW / 2, dY + dH], [dW / 2, dY]];
  const gFront = gExtrude(prof, front, { bevel: 0.05, holes: [hole], curveSegs: 1 });
  gFront.rotateY(PI / 2);
  p.geom(gFront, { at: [-L / 2 + front / 2, yb, 0], paint: lime });
  flat(p, [0.02, dH, dW], { at: [-L / 2 + front + 0.01, yb + dY + dH / 2, 0], paint: inside }); // dark interior
  flat(p, [front, 0.02, dW], { at: [-L / 2 + front / 2, yb + dY + 0.01, 0], paint: inside });
  // sits on red beams + blocks
  for (const x of [-L / 2 + 0.35, -0.2, L / 2 - 0.4]) {
    box1(p, [0.22, 0.14, W + 0.25], { at: [x + p.range(-0.05, 0.05), 0.17, 0], rot: [0, p.range(-0.04, 0.04), 0], paint: beam, bevel: 0.02 });
    for (const z of [-0.85, 0.85]) box1(p, [0.26, 0.1, 0.3], { at: [x, 0.05, z], paint: p.paint('concrete', { color: '#8f8a84' }), bevel: 0.015 });
  }
  // side windows (+Z side): lower row on wall, upper row on the chamfer
  const slope = Math.atan2(H * 0.4, 0.55);
  const BV = 0.045; // ExtrudeGeometry grows the profile by bevelSize (0.9 * bevel) -> real skin offset
  const win = (x, y, z, w, h, rx, paint) => {
    const nz = Math.cos(rx), ny = -Math.sin(rx), o = BV + 0.008;
    p.extrude(rrect(w + 0.07, h + 0.07, 0.07, 2), 0.03, { at: [x, y + ny * o, z + nz * o], rot: [rx, 0, 0], paint: lime, bevel: 0.012, curveSegs: 2 });
    p.extrude(rrect(w, h, 0.05, 2), 0.03, { at: [x, y + ny * (o + 0.006), z + nz * (o + 0.006)], rot: [rx, 0, 0], paint, bevel: 0.006, curveSegs: 2 });
  };
  const wx = [0.55, 1.05, 1.55];
  wx.forEach((x, i) => win(x, yb + H * 0.48, halfW + 0.01, 0.36, 0.42, 0, i === 2 ? red : blue));
  const upY = yb + H * 0.8, upZ = halfW - 0.55 * ((upY - yb - H * 0.6) / (H * 0.4)) + 0.02;
  wx.forEach((x) => win(x + 0.05, upY, upZ, 0.36, 0.3, -(PI / 2 - slope), blue));
  // back side: two windows
  for (const x of [0.3, 1.2]) win(x, yb + H * 0.48, -halfW - 0.01, 0.36, 0.42, PI, blue);
  // ladder rungs on +Z side near door end (U handles)
  for (let i = 0; i < 6; i++) handle(p, { at: [-L / 2 + 0.75, yb + 0.35 + i * 0.27, halfW + BV], rot: [PI / 2, 0, 0], w: 0.26, h: 0.1, r: 0.022, paint: steel });
  // short rungs on the end face corner
  for (let i = 0; i < 3; i++) handle(p, { at: [-L / 2 - 0.02, yb + 0.5 + i * 0.4, halfW - 0.3], rot: [PI / 2, -PI / 2, 0], order: 'YXZ', w: 0.2, h: 0.08, r: 0.02, paint: steel });
  // roof rails: two bars with posts
  for (const z of [-0.5, 0.5]) {
    const y = yb + H, x0 = -L / 2 + 0.6, x1 = L / 2 - 0.5;
    p.tube([[x0, y - 0.02, z], [x0 + 0.08, y + 0.16, z], [x1 - 0.08, y + 0.16, z], [x1, y - 0.02, z]], 0.025, { paint: steel, seg: 6, steps: 16 });
    for (const x of [(x0 + x1) / 2 - 0.6, (x0 + x1) / 2 + 0.6]) p.cyl(0.02, 0.16, { at: [x, y + 0.08, z], paint: steel, seg: 6, bevel: 0 });
  }
  // rear end: small vent + lamp
  flat(p, [0.03, 0.12, 0.25], { at: [L / 2 + 0.02, yb + 0.5, halfW - 0.35], paint: red });
  flat(p, [0.03, 0.12, 0.25], { at: [L / 2 + 0.02, yb + 0.5, -halfW + 0.35], paint: red });
  // ---- doors (hinged at the outer jambs, swing out toward -X)
  const doors = [];
  for (const side of [1, -1]) {
    const lw = dW / 2 - 0.01;
    const d = p.node(side > 0 ? 'doorR' : 'doorL', { at: [-L / 2 - 0.035, yb + dY + 0.01, side * dW / 2] });
    p.in(d, () => {
      const zc = -side * lw / 2;
      box1(p, [0.05, dH - 0.02, lw], { at: [0, dH / 2, zc], paint: lime, bevel: 0.015 });
      flat(p, [0.01, dH - 0.1, lw - 0.08], { at: [0.03, dH / 2, zc], paint: inside }); // inner face
      // window
      const g = gExtrude(rrect(lw * 0.45, 0.5, 0.05, 2), 0.02, { bevel: 0.005, curveSegs: 2 });
      g.rotateY(-PI / 2);
      p.geom(g, { at: [-0.03, dH * 0.66, zc], paint: blue });
      flat(p, [0.012, 0.56, lw * 0.45 + 0.06], { at: [-0.026, dH * 0.66, zc], paint: steel });
      // handle + hinges + latch plate
      box1(p, [0.05, 0.035, 0.14], { at: [-0.05, dH * 0.45, -side * (lw - 0.12)], paint: steel, bevel: 0.008 });
      flat(p, [0.012, 0.16, 0.06], { at: [-0.03, dH * 0.45, -side * (lw - 0.08)], paint: steel });
      for (const y of [0.25, dH - 0.25]) flat(p, [0.03, 0.12, 0.05], { at: [-0.02, y, -side * 0.02], paint: steel });
      if (side > 0) flat(p, [0.012, 0.18, 0.18], { at: [-0.028, dH * 0.3, zc], paint: p.paint('paint', { color: '#efe9d6', chip: 0.4 }) }); // sticker
    });
    doors.push([d, side]);
  }
  p.param('doors', opts.doors ?? 0, (v) => { for (const [d, side] of doors) d.rotation.y = side * v * (side > 0 ? 1.7 : 1.35); });
  return p.done();
}

// ---------------------------------------------------------------- scrap piles
// Junk buggy-like heap: striped chassis, big wheel, concrete weights, plank fence, drums.
export function scrapPileA(seed = 1, opts = {}) {
  const p = new Prop('scrap_pile_a', seed, opts);
  const j = (a) => p.range(-a, a);
  const metal = p.paint('metal', { color: '#6c7176', rust: 0.35 });
  // chassis: white body with red diagonal stripes, dented
  const bodyP = p.paint('paint', { color: '#ecebe6', col2: '#d8352c', pattern: 'stripes', patW: 0.3, under: '#8d9296', chip: 0.35, rust: 0.15, dirt: 0.6 });
  box1(p, [1.9, 0.55, 1.0], { at: [0.1, 0.52, 0], paint: bodyP, bevel: 0.05, deform: { amp: 0.025, freq: 2 } });
  box1(p, [2.3, 0.1, 0.7], { at: [0.15, 0.2, 0], paint: metal, bevel: 0.02 });
  box1(p, [0.55, 0.4, 0.95], { at: [-0.95, 0.45, 0], rot: [0, 0, 0.3], paint: bodyP, bevel: 0.04 }); // sloped nose
  // wheels
  parts.tyre(p, { R: 0.47, w: 0.3, rim: true, at: [0.82, 0.47, 0.58], rot: [PI / 2, 0, 0], seg: 18 });
  parts.tyre(p, { R: 0.42, w: 0.26, rim: false, at: [0.82, 0.42, -0.58], rot: [PI / 2, 0, 0], seg: 12 });
  // rail frame (barrier-like) on the front of the chassis
  const fx0 = -0.6, fx1 = 0.35, fy0 = 0.62, fy1 = 1.18, fz = 0.47;
  p.tube([[fx0, fy0, fz], [fx0, fy1, fz], [fx1, fy1 - 0.05, fz], [fx1, fy0, fz]], 0.025, { paint: metal, seg: 6, steps: 16 });
  for (let i = 1; i < 4; i++) { const x = fx0 + (fx1 - fx0) * i / 4; p.cyl(0.016, fy1 - fy0 - 0.04, { at: [x, (fy0 + fy1) / 2 - 0.02, fz], paint: metal, seg: 5, bevel: 0 }); }
  p.tube([[fx0, fy1, fz], [fx0 - 0.05, fy1 + 0.05, 0], [fx0, fy1, -0.4]], 0.022, { paint: metal, seg: 6, steps: 10 });
  // blocks: tall white box back-left, weight with handle on top of it, lower box in front
  const white = p.paint('paint', { color: '#d9d9d5', under: '#8d9296', chip: 0.35, rust: 0.1 });
  box1(p, [0.85, 0.7, 0.7], { at: [-0.8, 1.05, -0.12], rot: [0, 0.12 + j(0.08), j(0.04)], paint: white, bevel: 0.05, deform: { amp: 0.015, freq: 3 } });
  handle(p, { at: [-0.85, 1.39, -0.12], rot: [0, 0.12, 0], w: 0.3, h: 0.2, r: 0.026, paint: metal });
  box1(p, [0.6, 0.48, 0.42], { at: [-0.42, 0.98, 0.22], rot: [0, 0.25 + j(0.1), 0], paint: white, bevel: 0.04 });
  weightBlock(p, { size: [0.78, 0.62, 0.62], at: [0.72, 1.15, -0.12], rot: [0, j(0.15) - 0.12, j(0.05)] });
  // crumpled scrap mass between the blocks + loose bars
  const dk = p.paint('metal', { color: '#5c5f63', rust: 0.6 });
  box1(p, [0.7, 0.4, 0.6], { at: [0.2, 1.0, 0.0], rot: [0.2, 0.5, 0.15], paint: dk, bevel: 0.04, deform: { amp: 0.09, freq: 3.5 } });
  box1(p, [0.4, 0.3, 0.35], { at: [0.4, 1.22, 0.2], rot: [-0.3, -0.4, 0.4], paint: dk, bevel: 0.03, deform: { amp: 0.06, freq: 5 } });
  for (let i = 0; i < 6; i++) p.box([0.45 + j(0.15), 0.025, 0.03], { at: [0.25 + j(0.35), 1.25 + j(0.1), j(0.3)], rot: [j(0.6), j(1.6), j(0.5)], paint: metal, bevel: 0 });
  // wooden plank fence at the right end
  const wood = p.paint('wood', { color: '#ad5a3b', under: '#d48a62', chip: 0.3 });
  const nP = 6;
  for (let i = 0; i < nP; i++) {
    // fence line runs diagonally back-right so the planks face the viewer
    const h = 1.2 + p.r() * 0.6, s = i * 0.19 + j(0.02);
    fencePlank(p, { w: 0.19, h, t: 0.045, at: [1.05 + s * 0.83, 0.02, 0.48 - s * 0.56], rot: [j(0.08) - 0.05, 0.6 + j(0.12), -0.1 + j(0.1)], order: 'YXZ', paint: wood });
  }
  for (const y of [0.45, 1.0]) parts.plank(p, { size: [1.3, 0.12, 0.04], at: [1.5 - y * 0.06, y, 0.17 - 0.03], rot: [0, 0.6, j(0.06)], paint: wood });
  fencePlank(p, { w: 0.2, h: 1.0, t: 0.045, at: [-0.15, 0.0, 0.72], rot: [-0.35, 0.3, 0.45], order: 'YXZ', paint: wood }); // leaning in front
  // drums front-left with straps
  const teal = p.paint('paint', { color: '#2fb1b6', col2: '#3d7a50', pattern: 'bands', patW: 0.5, under: '#8d9296', chip: 0.5 });
  parts.drum(p, { r: 0.29, h: 0.82, at: [-1.38, 0.41, 0.3], paint: teal, seg: 14 });
  const strap = p.paint('fabric', { color: '#3b3330' });
  parts.strapRing(p, { r: 0.295, at: [-1.38, 0.32, 0.3], width: 0.06, seg: 14, paint: strap });
  const orange = p.paint('paint', { color: '#cf6a3c', under: '#9aa0a6', chip: 0.5, rust: 0.4 });
  parts.drum(p, { r: 0.25, h: 0.64, at: [-0.85, 0.32, 0.56], paint: orange, seg: 14, open: true });
  parts.strapRing(p, { r: 0.255, at: [-0.85, 0.22, 0.56], width: 0.06, seg: 14, paint: strap });
  parts.strapRing(p, { r: 0.255, at: [-0.85, 0.44, 0.56], width: 0.06, seg: 14, paint: strap });
  p.tube([[-1.38, 0.5, 0.6], [-1.1, 0.48, 0.75], [-0.85, 0.4, 0.82]], 0.02, { paint: strap, seg: 4, steps: 8 }); // strap joining both
  return p.done();
}

// Junk heap B: engine block, two tyres, orange bucket, cinder blocks, bar frame, concrete weight.
export function scrapPileB(seed = 1, opts = {}) {
  const p = new Prop('scrap_pile_b', seed, opts);
  const j = (a) => p.range(-a, a);
  const grey = p.paint('paint', { color: '#9a9ea1', under: '#6c7176', chip: 0.25, rust: 0.12, dirt: 0.6, metal: 0.3 });
  const metal = p.paint('metal', { color: '#6a6f73', rust: 0.25 });
  // engine block with flywheel and fins
  box1(p, [0.8, 0.7, 0.6], { at: [-0.72, 0.55, -0.12], rot: [0, 0.1, 0], paint: grey, bevel: 0.06, deform: { amp: 0.012, freq: 4 } });
  box1(p, [0.55, 0.22, 0.5], { at: [-0.75, 1.0, -0.14], rot: [0, 0.1, 0.05], paint: grey, bevel: 0.05 });
  flat(p, [0.3, 0.16, 0.004], { at: [-0.62, 1.02, 0.115], rot: [0, 0.1, 0.05], paint: p.paint('paint', { color: '#4f5357', chip: 0 }) }); // dark plate
  p.cyl(0.32, 0.12, { at: [-0.95, 0.5, 0.25], rot: [PI / 2, 0, 0], paint: grey, seg: 18, bevel: 0.025 });
  p.cyl(0.14, 0.06, { at: [-0.95, 0.5, 0.33], rot: [PI / 2, 0, 0], paint: metal, seg: 10, bevel: 0.01 });
  for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; flat(p, [0.04, 0.04, 0.03], { at: [-0.95 + Math.cos(a) * 0.24, 0.5 + Math.sin(a) * 0.24, 0.32], paint: metal }); }
  // cinder blocks (teal) under the engine front
  const tealC = p.paint('concrete', { color: '#5c9c97' });
  cinder(p, { at: [-1.0, 0, 0.45], rot: [0, 0.15, 0], paint: tealC });
  cinder(p, { at: [-0.55, 0, 0.5], rot: [0, -0.1, 0], paint: tealC });
  cinder(p, { at: [-0.78, 0.19, 0.5], rot: [0, 0.05 + j(0.1), 0], paint: tealC });
  // concrete weight on a base at the back right
  box1(p, [0.7, 0.35, 0.55], { at: [0.55, 0.175, -0.3], paint: metal, bevel: 0.03 });
  weightBlock(p, { size: [0.65, 0.5, 0.5], at: [0.55, 0.6, -0.3], rot: [0, j(0.1), 0] });
  // bar frame over the heap
  const pipe = p.paint('steel', { color: '#8d9397', rust: 0.15, chip: 0.1 });
  p.tube([[-1.05, 0.95, -0.38], [-0.95, 1.32, -0.38], [0.7, 1.24, -0.38], [0.82, 0.9, -0.38]], 0.035, { paint: pipe, seg: 6, steps: 18 });
  p.tube([[-0.9, 1.3, -0.38], [-0.4, 1.05, -0.25], [0.15, 1.22, -0.3]], 0.028, { paint: pipe, seg: 6, steps: 16 });
  p.tube([[-0.5, 1.28, -0.38], [-0.2, 1.26, -0.15], [0.45, 1.2, -0.2]], 0.025, { paint: pipe, seg: 6, steps: 16 });
  p.torus(0.07, 0.015, { at: [-0.95, 1.36, -0.35], rot: [PI / 2, 0, 0], paint: metal, seg: 10, tube: 4 });
  // junk between
  p.blob(0.22, { at: [-0.25, 0.55, 0.0], scale: [1.2, 0.9, 1], paint: p.paint('metal', { color: '#a3a7aa', rust: 0.4 }), deform: { amp: 0.06, freq: 5 } });
  p.cyl(0.1, 0.24, { at: [-0.38, 0.3, 0.5], rot: [0.3, 0, 1.3], paint: p.paint('paint', { color: '#d9dad6', chip: 0.4 }), seg: 10, deform: { amp: 0.02, freq: 6 } }); // crushed can
  // two standing tyres
  parts.tyre(p, { R: 0.42, w: 0.26, ri: 0.2, paint: p.paint('rubber', { color: '#3a3b3f' }), at: [0.02, 0.4, 0.3], rot: [PI / 2 + 0.08, 0.1 + j(0.05), 0], seg: 16 });
  parts.tyre(p, { R: 0.4, w: 0.26, ri: 0.19, paint: p.paint('rubber', { color: '#3a3b3f' }), at: [0.6, 0.38, 0.32], rot: [PI / 2 - 0.05, -0.15 + j(0.05), 0], seg: 16 });
  // orange bucket with junk
  const orange = p.paint('plastic', { color: '#ec5a1d', under: '#f08a5a', chip: 0.2, dirt: 0.5 });
  p.lathe([[0.2, 0], [0.24, 0.02], [0.29, 0.62], [0.31, 0.64], [0.29, 0.66], [0.27, 0.66], [0.25, 0.1], [0, 0.1]], { at: [1.1, 0, 0.25], paint: orange, seg: 16, rot: [0, 0, -0.04] });
  for (let i = 0; i < 4; i++) p.box([0.12, 0.1, 0.08], { at: [1.1 + j(0.12), 0.62 + j(0.04), 0.25 + j(0.12)], rot: [j(1), j(1), j(1)], paint: p.pick([metal, grey, p.paint('wood')]), bevel: 0 });
  return p.done();
}

// ---------------------------------------------------------------- red tool chest
// opts: drawers 0..1 (slide out), doors 0..1 (lower doors), color
export function toolChestRed(seed = 1, opts = {}) {
  const p = new Prop('tool_chest_red', seed, opts);
  const red = p.paint('paint', { color: opts.color || '#e0262c', under: '#9aa0a5', chip: 0.22, rust: 0.05 });
  const inner = p.paint('paint', { color: '#5b1517', chip: 0, dirt: 0.8 });
  const steel = p.paint('steel', { color: '#a6adb2', under: '#d0d5d8' });
  const W = 0.8, H = 0.62, D = 0.55, t = 0.025, y0 = 0.06;
  carcass(p, { w: W, h: H, d: D, t, paint: red, at: [0, y0, 0], inner, bevel: 0.015 });
  flat(p, [W - 2 * t, t, D - t], { at: [0, y0 + H * 0.52, t / 2], paint: red }); // divider
  // feet + corner guards
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box1(p, [0.07, y0, 0.07], { at: [sx * (W / 2 - 0.06), y0 / 2, sz * (D / 2 - 0.06)], paint: steel, bevel: 0.012 });
    box1(p, [0.07, 0.03, 0.07], { at: [sx * (W / 2 - 0.02), y0 + H - 0.005, sz * (D / 2 - 0.02)], paint: steel, bevel: 0.01 });
    box1(p, [0.04, 0.16, 0.04], { at: [sx * (W / 2 - 0.005), y0 + 0.15, sz * (D / 2 - 0.005)], paint: steel, bevel: 0.01 });
  }
  // drawers
  const drawers = [];
  const dh = (H * 0.48 - t) / 2 - 0.01;
  for (let i = 0; i < 2; i++) {
    const y = y0 + H - t - (i + 0.5) * (dh + 0.01) - 0.005;
    const d = p.node('drawer' + i, { at: [0, y, D / 2 - 0.01] });
    p.in(d, () => {
      const dw = W - 2 * t - 0.01, dd = D - 0.08;
      box1(p, [dw, dh, 0.025], { at: [0, 0, 0], paint: red, bevel: 0.006 });
      flat(p, [dw - 0.02, dh * 0.8, 0.012], { at: [0, -dh * 0.05, -dd + 0.012], paint: red });
      flat(p, [0.012, dh * 0.8, dd], { at: [-dw / 2 + 0.01, -dh * 0.05, -dd / 2], paint: red });
      flat(p, [0.012, dh * 0.8, dd], { at: [dw / 2 - 0.01, -dh * 0.05, -dd / 2], paint: red });
      flat(p, [dw - 0.02, 0.01, dd], { at: [0, -dh * 0.42, -dd / 2], paint: inner });
      p.tube([[-0.13, 0, 0.012], [-0.12, 0, 0.04], [0.12, 0, 0.04], [0.13, 0, 0.012]], 0.009, { paint: steel, seg: 5, steps: 14 });
      flat(p, [dw * 0.9, 0.012, 0.006], { at: [0, dh * 0.38, 0.013], paint: steel });
    });
    drawers.push(d);
  }
  // lower doors
  const doors = [];
  const lh = H * 0.52 - t - 0.01, lw = (W - 2 * t) / 2 - 0.005;
  for (const side of [-1, 1]) {
    const d = p.node(side < 0 ? 'doorL' : 'doorR', { at: [side * (W / 2 - t), y0 + t + 0.005, D / 2 + 0.003] });
    p.in(d, () => {
      box1(p, [lw, lh, 0.022], { at: [-side * lw / 2, lh / 2, 0], paint: red, bevel: 0.006 });
      box1(p, [0.02, 0.09, 0.02], { at: [-side * (lw - 0.04), lh * 0.6, 0.02], paint: steel, bevel: 0.005 });
      for (const y of [0.05, lh - 0.05]) flat(p, [0.02, 0.05, 0.02], { at: [-side * 0.008, y, 0.004], paint: steel });
    });
    doors.push([d, side]);
  }
  p.param('drawers', opts.drawers ?? 0, (v) => { drawers[0].position.z = D / 2 - 0.01 + v * 0.22; drawers[1].position.z = D / 2 - 0.01 + v * 0.3; });
  p.param('doors', opts.doors ?? 0, (v) => { for (const [d, side] of doors) d.rotation.y = side * v * (side < 0 ? 1.25 : 0.85); });
  return p.done();
}

// ---------------------------------------------------------------- fridge
// Retro yellow fridge, door hinged on the right. opts: door 0..1, color
export function fridgeYellow(seed = 1, opts = {}) {
  const p = new Prop('fridge_yellow', seed, opts);
  const yel = p.paint('paint', { color: opts.color || '#f1dc72', under: '#a3a7aa', chip: 0.3, rust: 0.12, dirt: 0.5 });
  const inner = p.paint('paint', { color: '#7b8186', chip: 0.05, rust: 0.1, dirt: 0.6 });
  const steel = p.paint('steel', { color: '#8c969c' });
  const W = 0.72, H = 1.3, D = 0.66, t = 0.05, y0 = 0.07;
  carcass(p, { w: W, h: H, d: D, t, paint: yel, at: [0, y0, 0], inner, bevel: 0.045 });
  box1(p, [W - 0.08, y0, D - 0.1], { at: [0, y0 / 2, -0.02], paint: p.paint('paint', { color: '#4a4c4f', chip: 0 }), bevel: 0.015 });
  for (const y of [0.45, 0.8]) flat(p, [W - 2 * t - 0.01, 0.012, D - t - 0.08], { at: [0, y0 + y, -0.02], paint: steel }); // wire shelves
  flat(p, [W - 2 * t - 0.02, 0.18, D - t - 0.1], { at: [0, y0 + t + 0.09, -0.01], paint: p.paint('plastic', { color: '#cfd6d9', chip: 0 }) }); // crisper
  // door: hinge on the right front edge
  const d = p.node('door', { at: [W / 2, y0, D / 2 + 0.005] });
  p.in(d, () => {
    const dw = W, dh = H, dt = 0.08;
    box1(p, [dw, dh, dt], { at: [-dw / 2, dh / 2, dt / 2], paint: yel, bevel: 0.07 });
    box1(p, [dw - 0.14, dh - 0.16, 0.02], { at: [-dw / 2, dh / 2, -0.005], paint: inner, bevel: 0.01 });
    for (const y of [0.35, 0.7, 1.0]) flat(p, [dw - 0.18, 0.05, 0.08], { at: [-dw / 2, y, -0.04], paint: inner }); // door bins
    p.tube([[-dw + 0.12, dh * 0.6, dt - 0.01], [-dw + 0.15, dh * 0.6 + 0.01, dt + 0.05], [-dw + 0.38, dh * 0.6 + 0.03, dt + 0.05], [-dw + 0.42, dh * 0.6 + 0.03, dt - 0.01]], 0.024, { paint: p.paint('paint', { color: '#5f8a8c', chip: 0.2 }), seg: 6, steps: 16 });
    box1(p, [0.17, 0.05, 0.012], { at: [-dw * 0.6, dh * 0.82, dt + 0.004], paint: p.paint('paint', { color: '#2b2d30', chip: 0.2 }), bevel: 0.004 }); // badge
    flat(p, [0.13, 0.025, 0.004], { at: [-dw * 0.6, dh * 0.82, dt + 0.011], paint: p.paint('paint', { color: '#e9e6dc', chip: 0 }) });
    // chipped patches (grey painted)
    for (let i = 0; i < 3; i++) flat(p, [0.05 + p.r() * 0.06, 0.05 + p.r() * 0.08, 0.004], { at: [-dw * (0.2 + p.r() * 0.6), dh * (0.2 + p.r() * 0.6), dt + 0.002], paint: p.paint('steel', { color: '#9a9fa3' }) });
  });
  p.param('door', opts.door ?? 0, (v) => { d.rotation.y = v * 2.0; });
  return p.done();
}

// ---------------------------------------------------------------- small yellow cabinet
// opts: door 0..1 (right hinge), color
export function cabinetYellow(seed = 1, opts = {}) {
  const p = new Prop('cabinet_yellow', seed, opts);
  const yel = p.paint('paint', { color: opts.color || '#c5d23f', under: '#9aa0a5', chip: 0.2, rust: 0.05 });
  const inner = p.paint('paint', { color: '#9aa3a8', chip: 0, rust: 0, dirt: 0.3 });
  const steel = p.paint('steel', { color: '#9aa2a7' });
  const W = 0.52, H = 0.8, D = 0.46, t = 0.025, y0 = 0.1;
  carcass(p, { w: W, h: H, d: D, t, paint: yel, at: [0, y0, 0], inner, bevel: 0.012 });
  flat(p, [W - 2 * t, 0.015, D - t - 0.02], { at: [0, y0 + H * 0.42, 0], paint: inner }); // shelf
  // splayed sheet feet
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box1(p, [0.07, y0 + 0.02, 0.07], { at: [sx * (W / 2 - 0.04), (y0 + 0.02) / 2, sz * (D / 2 - 0.04)], paint: steel, bevel: 0.012 });
  const d = p.node('door', { at: [W / 2, y0 + 0.01, D / 2 + 0.003] });
  p.in(d, () => {
    const dw = W - 0.01, dh = H - 0.02;
    box1(p, [dw, dh, 0.022], { at: [-dw / 2, dh / 2, 0], paint: yel, bevel: 0.006 });
    flat(p, [dw - 0.06, dh - 0.06, 0.006], { at: [-dw / 2, dh / 2, -0.013], paint: inner });
    box1(p, [0.025, 0.11, 0.03], { at: [-dw + 0.05, dh * 0.55, 0.02], paint: steel, bevel: 0.006 });
    flat(p, [0.05, 0.03, 0.01], { at: [-dw + 0.05, dh * 0.48, 0.014], paint: steel });
  });
  p.param('door', opts.door ?? 0, (v) => { d.rotation.y = v * 1.85; });
  return p.done();
}

// ---------------------------------------------------------------- small steel cabinet (safe)
// Two-door steel cabinet on a leg frame. opts: door 0..1 (both doors)
export function safeSmall(seed = 1, opts = {}) {
  const p = new Prop('safe_small', seed, opts);
  const body = p.paint('paint', { color: opts.color || '#a3b1b7', under: '#cfd6da', chip: 0.15, rust: 0.03, metal: 0.25 });
  const inner = p.paint('paint', { color: '#6d7a80', chip: 0, rust: 0, dirt: 0.25 });
  const W = 0.6, H = 0.52, D = 0.42, t = 0.025, y0 = 0.3;
  carcass(p, { w: W, h: H, d: D, t, paint: body, at: [0, y0, 0], inner, bevel: 0.012 });
  flat(p, [t * 0.8, H - 2 * t, D - t], { at: [0, y0 + H / 2, t / 2], paint: body }); // divider
  flat(p, [W - 2 * t, 0.015, D - t - 0.02], { at: [0, y0 + H * 0.45, 0], paint: body }); // shelf
  // leg frame: angle legs + bottom rail
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box1(p, [0.04, y0 + 0.02, 0.04], { at: [sx * (W / 2 - 0.02), (y0 + 0.02) / 2, sz * (D / 2 - 0.02)], paint: body, bevel: 0.008 });
  for (const sz of [-1, 1]) flat(p, [W - 0.04, 0.03, 0.025], { at: [0, 0.06, sz * (D / 2 - 0.02)], paint: body });
  for (const sx of [-1, 1]) flat(p, [0.025, 0.03, D - 0.04], { at: [sx * (W / 2 - 0.02), 0.06, 0], paint: body });
  const doors = [];
  for (const side of [-1, 1]) {
    const dw = W / 2 - 0.015, dh = H - 0.02;
    const d = p.node(side < 0 ? 'doorL' : 'doorR', { at: [side * W / 2, y0 + 0.01, D / 2 + 0.003] });
    p.in(d, () => {
      box1(p, [dw, dh, 0.022], { at: [-side * dw / 2, dh / 2, 0], paint: body, bevel: 0.006 });
      box1(p, [dw - 0.06, dh - 0.08, 0.006], { at: [-side * dw / 2, dh / 2, 0.012], paint: body, bevel: 0.003 });
      flat(p, [dw - 0.04, dh - 0.04, 0.005], { at: [-side * dw / 2, dh / 2, -0.012], paint: inner });
      box1(p, [0.02, 0.09, 0.025], { at: [-side * (dw - 0.04), dh * 0.55, 0.022], paint: p.paint('chrome'), bevel: 0.005 });
    });
    doors.push([d, side]);
  }
  p.param('door', opts.door ?? 0, (v) => { for (const [d, side] of doors) d.rotation.y = side * v * (side < 0 ? 1.7 : 1.3); });
  return p.done();
}

// ---------------------------------------------------------------- generator
// Orange / black portable generator in a tube frame. opts: color
export function generator(seed = 1, opts = {}) {
  const p = new Prop('generator', seed, opts);
  const orange = p.paint('paint', { color: opts.color || '#f2771c', under: '#9aa0a5', chip: 0.25, rust: 0.05 });
  const black = p.paint('paint', { color: '#2a2c30', under: '#5b6066', chip: 0.15, rust: 0.05 });
  const panel = p.paint('paint', { color: '#83888d', under: '#a9aeb2', chip: 0.2, rust: 0 });
  const frameP = p.paint('paint', { color: '#d8dcde', under: '#a3a9ad', chip: 0.15, rust: 0, metal: 0.25, rough: 0.4 });
  const W = 0.64, H = 0.5, D = 0.48, R = 0.034;
  // frame: fat rounded loop on each side + four cross bars
  for (const sx of [-1, 1]) {
    const x = sx * W / 2, z = D / 2;
    const pts = roundPoly([[-z, R], [z, R], [z, H], [-z, H]], 0.12, 3).map(([zz, y]) => [x, y, zz]);
    p.tube(pts, R, { paint: frameP, seg: 7, closed: true, steps: 40 });
  }
  for (const [y, z] of [[H, D / 2], [H, -D / 2], [R, D / 2], [R, -D / 2]]) p.cyl(R, W, { at: [0, y, z], rot: [0, 0, PI / 2], paint: frameP, seg: 7, bevel: 0 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box1(p, [0.07, 0.03, 0.07], { at: [sx * (W / 2), 0.012, sz * (D / 2 - 0.06)], paint: p.paint('rubber'), bevel: 0.01 }); // feet
  // body: grey housing filling the frame
  box1(p, [W - 0.1, 0.3, D - 0.1], { at: [0, 0.22, -0.01], paint: panel, bevel: 0.04 });
  box1(p, [W - 0.12, 0.08, D - 0.14], { at: [0, 0.06, -0.01], paint: black, bevel: 0.02 }); // engine base
  // fuel tank (orange) with dark cover on the right + cap
  box1(p, [W - 0.08, 0.12, D - 0.08], { at: [0, 0.42, 0], paint: orange, bevel: 0.05 });
  box1(p, [0.22, 0.07, D - 0.1], { at: [W / 2 - 0.17, 0.46, 0.0], paint: black, bevel: 0.02 });
  box1(p, [0.12, 0.05, 0.08], { at: [-0.03, 0.495, -0.02], paint: black, bevel: 0.02 }); // fuel cap
  // front panel details
  const fz = D / 2 - 0.05;
  p.cyl(0.024, 0.02, { at: [-0.23, 0.31, fz], rot: [PI / 2, 0, 0], paint: p.paint('paint', { color: '#d6dadc', chip: 0 }), seg: 8, bevel: 0.004 });
  box1(p, [0.06, 0.05, 0.02], { at: [-0.15, 0.3, fz], paint: p.paint('paint', { color: '#e0243a', chip: 0.1 }), bevel: 0.006 });
  p.cyl(0.03, 0.02, { at: [-0.06, 0.31, fz], rot: [PI / 2, 0, 0], paint: p.paint('paint', { color: '#e8e8e8', chip: 0 }), seg: 10, bevel: 0.004 });
  flat(p, [0.04, 0.006, 0.006], { at: [-0.06, 0.31, fz + 0.012], rot: [0, 0, 0.7], paint: black });
  parts.decal(p, { shape: 'triangle', at: [0.1, 0.31, fz + 0.002], size: 0.075 });
  box1(p, [0.07, 0.07, 0.02], { at: [0.2, 0.3, fz], paint: p.paint('paint', { color: '#f2c81e', chip: 0.2 }), bevel: 0.008 });
  // outlet blocks (black) bottom front
  box1(p, [0.14, 0.1, 0.05], { at: [-0.16, 0.15, D / 2 - 0.035], paint: black, bevel: 0.012 });
  box1(p, [0.15, 0.11, 0.06], { at: [0.12, 0.14, D / 2 - 0.03], paint: black, bevel: 0.012 });
  for (const x of [0.08, 0.16]) flat(p, [0.03, 0.035, 0.004], { at: [x, 0.15, D / 2 + 0.002], paint: panel });
  flat(p, [0.13, 0.08, 0.02], { at: [-0.02, 0.15, D / 2 - 0.05], paint: black });
  // exhaust muffler at the back
  p.cyl(0.05, 0.22, { at: [0.1, 0.24, -D / 2 + 0.03], rot: [0, 0, PI / 2], paint: p.paint('steel', { color: '#5a5f63', rust: 0.5 }), seg: 8, bevel: 0.01 });
  return p.done();
}

// ---------------------------------------------------------------- toolbox
// Steel cantilever toolbox. opts: lid 0..1, color
export function toolbox(seed = 1, opts = {}) {
  const p = new Prop('toolbox', seed, opts);
  const body = p.paint('paint', { color: opts.color || '#5b7671', under: '#aab2b5', chip: 0.25, rust: 0.12 });
  const inner = p.paint('paint', { color: '#33474a', chip: 0, dirt: 0.8 });
  const latch = p.paint('paint', { color: '#a9c6cc', chip: 0, rust: 0, rough: 0.35 });
  const W = 0.44, H = 0.2, D = 0.26, t = 0.014;
  // open-top tray
  box1(p, [W, t, D], { at: [0, t / 2, 0], paint: body, bevel: 0.004 });
  for (const sz of [-1, 1]) box1(p, [W, H, t], { at: [0, H / 2, sz * (D / 2 - t / 2)], paint: body, bevel: 0.006 });
  for (const sx of [-1, 1]) box1(p, [t, H, D - 2 * t], { at: [sx * (W / 2 - t / 2), H / 2, 0], paint: body, bevel: 0.004 });
  flat(p, [W - 2 * t, 0.004, D - 2 * t], { at: [0, t + 0.002, 0], paint: inner });
  flat(p, [W - 2 * t, 0.06, 0.004], { at: [0, H * 0.4, D / 2 - t - 0.002], paint: inner });
  flat(p, [W - 2 * t, 0.06, 0.004], { at: [0, H * 0.4, -D / 2 + t + 0.002], paint: inner });
  for (const x of [-0.12, 0.12]) box1(p, [0.085, 0.065, 0.016], { at: [x, H - 0.045, D / 2 + 0.006], paint: latch, bevel: 0.006 }); // latches
  // a few tools inside
  p.cyl(0.012, 0.3, { at: [0.0, 0.05, 0.02], rot: [0, 0.2, PI / 2], paint: p.paint('chrome'), seg: 6, bevel: 0 });
  box1(p, [0.12, 0.03, 0.035], { at: [-0.12, 0.05, -0.04], rot: [0, -0.3, 0], paint: p.paint('plastic', { color: '#d63a2a' }), bevel: 0.008 });
  // lid hinged along the back top edge
  const lid = p.node('lid', { at: [0, H, -D / 2] });
  p.in(lid, () => {
    const lh = 0.07;
    box1(p, [W, lh, D], { at: [0, lh / 2, D / 2], paint: body, bevel: 0.02 });
    flat(p, [W - 0.03, 0.004, D - 0.03], { at: [0, 0.001, D / 2], paint: inner });
    for (const x of [-0.12, 0.12]) box1(p, [0.085, 0.05, 0.016], { at: [x, 0.03, D + 0.006], paint: latch, bevel: 0.006 });
    p.tube([[-0.1, lh, D / 2], [-0.1, lh + 0.05, D / 2], [0.1, lh + 0.05, D / 2], [0.1, lh, D / 2]], 0.011, { paint: p.paint('paint', { color: '#c4562e', chip: 0.3 }), seg: 5, steps: 14 });
  });
  p.param('lid', opts.lid ?? 0, (v) => { lid.rotation.x = -v * 1.95; });
  return p.done();
}

// ---------------------------------------------------------------- red case
// Flat red hard case with foam. opts: lid 0..1, color
export function caseRed(seed = 1, opts = {}) {
  const p = new Prop('case_red', seed, opts);
  const red = p.paint('plastic', { color: opts.color || '#e3262f', under: '#f07a7e', chip: 0.25, dirt: 0.45 });
  const foam = p.paint('fabric', { color: '#4a3a33', dirt: 0.2 });
  const dark = p.paint('rubber', { color: '#2a2b2e' });
  const W = 0.42, H = 0.06, D = 0.3, t = 0.014;
  const shell = (node, flip) => {
    box1(p, [W, t, D], { at: [0, t / 2, 0], paint: red, bevel: 0.005, node });
    for (const sz of [-1, 1]) box1(p, [W, H, t], { at: [0, H / 2, sz * (D / 2 - t / 2)], paint: red, bevel: 0.006, node });
    for (const sx of [-1, 1]) box1(p, [t, H, D - 2 * t], { at: [sx * (W / 2 - t / 2), H / 2, 0], paint: red, bevel: 0.005, node });
    box1(p, [W - 2 * t, H * 0.55, D - 2 * t], { at: [0, t + H * 0.27, 0], paint: foam, bevel: 0.006, node, deform: { amp: 0.003, freq: 20 } });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) flat(p, [0.018, 0.004, 0.018], { at: [sx * (W / 2 - 0.035), t + H * 0.55 + 0.003, sz * (D / 2 - 0.035)], paint: dark, node });
    void flip;
  };
  shell(null, false);
  // front latches + handle
  for (const x of [-0.12, 0.12]) box1(p, [0.04, 0.03, 0.012], { at: [x, H - 0.012, D / 2 + 0.005], paint: dark, bevel: 0.004 });
  const lid = p.node('lid', { at: [0, H, -D / 2] });
  // lid: same shell flipped so its open side faces down when closed
  p.in(lid, () => {
    const g = p.node('lidInner', { at: [0, H, D / 2], rot: [PI, 0, 0], parent: lid });
    p.in(g, () => shell(g, true));
  });
  p.param('lid', opts.lid ?? 0, (v) => { lid.rotation.x = -v * PI; });
  return p.done();
}

export const PROPS = [
  { id: 'lockers_triple', name: 'Tủ locker 3 ngăn', build: lockersTriple, yaw: 0.15, sheetVariant: 1,
    variants: [{ label: 'đóng', seed: 1, opts: {} }, { label: 'hé cửa', seed: 2, opts: { doors: 0.4, wear: 0.45 } }, { label: 'mở, đỏ', seed: 3, opts: { color: '#9c3a2e', doors: 0.8, doorsAll: false } }] },
  { id: 'container_open', name: 'Container 20ft', build: containerOpen, yaw: -0.7, sheetVariant: 1,
    variants: [{ label: 'đóng', seed: 1, opts: { wear: 0.4 } }, { label: 'mở cửa', seed: 2, opts: { doors: 0.42, wear: 0.6 } }, { label: 'mở toang', seed: 5, opts: { doors: 0.9, wear: 0.6 } },
      { label: 'xanh', seed: 3, opts: { color: '#2f6fb3', doors: 0.5 } }, { label: 'gỉ', seed: 4, opts: { rusty: true, doors: 0.3, wear: 1 } }] },
  { id: 'caravan', name: 'Toa caravan', build: caravan, yaw: 0.75, sheetVariant: 1,
    variants: [{ label: 'đóng', seed: 1, opts: { wear: 0.4 } }, { label: 'mở cửa', seed: 2, opts: { doors: 0.85, wear: 0.7 } }, { label: 'cũ, cam', seed: 3, opts: { color: '#e08a2c', doors: 0.4, wear: 1 } }] },
  { id: 'scrap_pile_a', name: 'Đống phế liệu A', build: scrapPileA, yaw: 0.12,
    variants: [{ label: 'A', seed: 1, opts: {} }, { label: 'A cũ', seed: 5, opts: { wear: 1 } }] },
  { id: 'scrap_pile_b', name: 'Đống phế liệu B', build: scrapPileB, yaw: 0.1,
    variants: [{ label: 'B', seed: 1, opts: {} }, { label: 'B cũ', seed: 7, opts: { wear: 1 } }] },
  { id: 'tool_chest_red', name: 'Tủ đồ nghề đỏ', build: toolChestRed, yaw: 0.4, sheetVariant: 1,
    variants: [{ label: 'đóng', seed: 1, opts: {} }, { label: 'mở', seed: 2, opts: { drawers: 1, doors: 1, wear: 0.8 } }] },
  { id: 'fridge_yellow', name: 'Tủ lạnh vàng', build: fridgeYellow, yaw: -0.35, sheetVariant: 1,
    variants: [{ label: 'đóng', seed: 1, opts: {} }, { label: 'hé cửa', seed: 2, opts: { door: 0.3, wear: 0.8 } }, { label: 'mở, xanh', seed: 3, opts: { door: 0.7, color: '#7cc6c0' } }] },
  { id: 'cabinet_yellow', name: 'Tủ vàng nhỏ', build: cabinetYellow, yaw: 0.4, sheetVariant: 1,
    variants: [{ label: 'đóng', seed: 1, opts: {} }, { label: 'mở', seed: 2, opts: { door: 0.85, wear: 0.8 } }] },
  { id: 'safe_small', name: 'Tủ sắt nhỏ', build: safeSmall, yaw: 0.35, sheetVariant: 1,
    variants: [{ label: 'đóng', seed: 1, opts: {} }, { label: 'mở', seed: 2, opts: { door: 0.75, wear: 0.9 } }] },
  { id: 'generator', name: 'Máy phát điện', build: generator, yaw: 0.3,
    variants: [{ label: 'mới', seed: 1, opts: { wear: 0.3 } }, { label: 'cũ', seed: 2, opts: { wear: 1 } }, { label: 'vàng', seed: 3, opts: { color: '#f2c81e' } }] },
  { id: 'toolbox', name: 'Hộp đồ nghề', build: toolbox, yaw: 0.3, sheetVariant: 1,
    variants: [{ label: 'đóng', seed: 1, opts: {} }, { label: 'mở', seed: 2, opts: { lid: 0.7, wear: 0.7 } }, { label: 'đỏ', seed: 3, opts: { color: '#c8342c' } }] },
  { id: 'case_red', name: 'Hộp đỏ', build: caseRed, yaw: -0.12, sheetVariant: 1,
    variants: [{ label: 'đóng', seed: 1, opts: {} }, { label: 'mở', seed: 2, opts: { lid: 1 } }] },
];
