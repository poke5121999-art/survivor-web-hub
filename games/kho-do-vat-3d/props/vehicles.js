// Vehicles: armoured post-apocalyptic pickup, van and hatchback (front faces +Z).
// Body = two side panels (extruded side profile with window / door holes) joined by
// double-faced lofted strips along the profile (roof, hood, windshield, floor), so
// doors open onto a real interior. Wheels roll (speed), front wheels steer (steer).
import * as THREE from '../vendor/three.module.min.js';
import { Prop } from '../lib/prop.js';
import { creaseNormals, extrude as geoExtrude } from '../lib/geo.js';
import * as parts from '../lib/parts.js';

const PI = Math.PI;
const SIDE = [0, -PI / 2, 0]; // extrude shape (x=z, y=y), depth along world X

// Extrude with the flat caps marked "not edge" so the wear shader chips only the bevelled
// rim (lib extrude flags every cap vertex as crease -> a whole flat face reads as chipped metal).
function ext(p, pts, depth, o = {}) {
  const g = geoExtrude(pts, depth, { bevel: o.bevel ?? 0.012, holes: o.holes || [], curveSegs: o.curveSegs ?? 6 });
  const ew = g.attributes.aEdgeW, pos = g.attributes.position;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  if (ew) for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    if (Math.abs(b.sub(a).cross(c.sub(a)).normalize().z) > 0.995) for (let k = 0; k < 3; k++) ew.setX(i + k, 0);
  }
  return p.geom(g, o);
}

// ---------- 2D helpers (side profile coords [z, y])
function arch(zc, yc, r, yb, n = 9) {
  const out = [[zc - r, yb]];
  for (let k = 0; k <= n; k++) { const a = PI - (PI * k) / n; out.push([zc + r * Math.cos(a), yc + r * Math.sin(a)]); }
  out.push([zc + r, yb]);
  return out;
}
function inset(pts, d) { // offset a simple polygon inward by d
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
  const s = a > 0 ? 1 : -1, n = pts.length, L = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1;
    const nx = (-dy / l) * s * d, ny = (dx / l) * s * d;
    L.push([p[0] + nx, p[1] + ny, dx, dy]);
  }
  return L.map((e, i) => {
    const f = L[(i + n - 1) % n];
    const den = f[2] * e[3] - f[3] * e[2];
    if (Math.abs(den) < 1e-9) return [e[0], e[1]];
    const t = ((e[0] - f[0]) * e[3] - (e[1] - f[1]) * e[2]) / den;
    return [f[0] + f[2] * t, f[1] + f[3] * t];
  });
}
const lerp2 = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];

// Strip between x0..x1 along a polyline of [z,y]; outward faces when the polyline runs
// in the profile's CCW order (front -> roof -> rear -> bottom). flip = inner face.
function loftGeom(pts, x0, x1, flip) {
  const pos = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [az, ay] = pts[i], [bz, by] = pts[i + 1];
    const A0 = [x0, ay, az], A1 = [x1, ay, az], B0 = [x0, by, bz], B1 = [x1, by, bz];
    const tri = flip ? [A0, B0, B1, A0, B1, A1] : [A0, B1, B0, A0, A1, B1];
    for (const v of tri) pos.push(...v);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  creaseNormals(g, 40);
  g.userData = { kind: 2 };
  return g;
}
function loft(p, pts, x0, x1, paint, inner, node) {
  p.geom(loftGeom(pts, x0, x1, false), { paint, node });
  if (inner) p.geom(loftGeom(pts, x0, x1, true), { paint: inner, node });
}
// Box lying on the profile line a->b at fraction f: size [x, along line, thickness], off = outward.
function onLine(p, a, b, f, size, o = {}) {
  const dz = b[0] - a[0], dy = b[1] - a[1], th = Math.atan2(dz, dy), off = o.off ?? 0;
  const z = a[0] + dz * f + Math.cos(th) * off, y = a[1] + dy * f - Math.sin(th) * off;
  return p.box(size, { at: [o.x ?? 0, y, z], rot: [th + (o.tilt || 0), o.yaw || 0, o.roll || 0], paint: o.paint, bevel: o.bevel, node: o.node, deform: o.deform });
}
// Cone spike from `at` pointing along dir (unit-ish [x,y,z]).
function spike(p, at, dir, len, r, paint, seg = 5) {
  const d = new THREE.Vector3(...dir).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  const e = new THREE.Euler().setFromQuaternion(q);
  p.cyl(r, len, { r2: 0.004, at: [at[0] + d.x * len / 2, at[1] + d.y * len / 2, at[2] + d.z * len / 2], rot: [e.x, e.y, e.z], paint, seg, bevel: 0.004 });
}
function lamp(p, at, s, glow, housing, face = 1) { // square lamp facing +Z (face=1) or -Z
  p.box([s[0] + 0.04, s[1] + 0.04, 0.08], { at: [at[0], at[1], at[2] - face * 0.03], paint: housing, bevel: 0.015 });
  p.box([s[0], s[1], 0.03], { at: [at[0], at[1], at[2] + face * 0.02], paint: glow, bevel: 0.008 });
}
function roundLamp(p, at, r, glow, housing, face = 1) {
  p.cyl(r + 0.025, 0.08, { at: [at[0], at[1], at[2] - face * 0.02], rot: [PI / 2, 0, 0], paint: housing, seg: 12, bevel: 0.012 });
  p.cyl(r, 0.03, { at: [at[0], at[1], at[2] + face * 0.025], rot: [PI / 2, 0, 0], paint: glow, seg: 12, bevel: 0.006 });
}
// Half-torus fender flare around a wheel arch on side `side`.
function flare(p, zc, yc, r, x, paint) {
  p.torus(r, 0.045, { arc: PI, seg: 10, tube: 5, at: [x, yc, zc], rot: [-PI / 2, PI / 2, 0], order: 'YXZ', scale: [1, 1.7, 1], paint });
}

// ---------- body shell
function shell(p, s) {
  const x1 = s.hw - s.t * 0.5;
  for (const side of [1, -1]) {
    const holes = s.holes.filter((h) => !h.side || h.side === side).map((h) => h.pts);
    ext(p, s.outline, s.t, { holes, at: [side * (s.hw - s.t / 2), 0, 0], rot: SIDE, paint: s.paint, bevel: 0.016,
      deform: s.dent ? { amp: s.dent, freq: 2.2, axis: [1, 0.4, 0.4] } : undefined });
    for (const h of s.holes) if (h.glass && (!h.side || h.side === side))
      ext(p, h.pts, 0.016, { at: [side * (s.hw - s.t / 2), 0, 0], rot: SIDE, paint: s.glass, bevel: 0.004 });
  }
  for (const st of s.strips) {
    const xa = st.x0 ?? -x1, xb = st.x1 ?? x1;
    if (st.glass) { // glass centre, painted pillars at the sides
      const e = st.edge ?? 0.12;
      loft(p, st.pts, xa + e, xb - e, s.glass, null);
      loft(p, st.pts, xa, xa + e, st.paint || s.paint, s.inner);
      loft(p, st.pts, xb - e, xb, st.paint || s.paint, s.inner);
    } else loft(p, st.pts, xa, xb, st.paint || s.paint, st.inner === false ? null : s.inner);
  }
}
// Side door (hinge at the front edge): extruded panel + window glass in its own node.
function sideDoor(p, s, d) { // d.fixed: never opens -> merged into the body (no extra draws)
  const base = [d.side * (s.hw - s.t / 2), 0, d.hinge];
  const n = d.fixed ? p.cur : p.node(d.name, { at: base });
  const A = (v) => (d.fixed ? [v[0] + base[0], v[1], v[2] + base[2]] : v);
  const loc = inset(d.pts, 0.012).map(([z, y]) => [z - d.hinge, y]);
  const win = d.win.map(([z, y]) => [z - d.hinge, y]);
  p.in(n, () => {
    ext(p, loc, s.t * 0.9, { holes: [win], at: A([0, 0, 0]), rot: SIDE, paint: s.paint, bevel: 0.008, deform: s.dent ? { amp: s.dent * 0.6, freq: 3 } : undefined });
    ext(p, win, 0.016, { at: A([0, 0, 0]), rot: SIDE, paint: s.glass, bevel: 0.004 });
    // inner trim panel + handle
    const zs = loc.map((q) => q[0]), ys = loc.map((q) => q[1]);
    const zmin = Math.min(...zs), zmax = Math.max(...zs), ymin = Math.min(...ys), yw = Math.min(...win.map((q) => q[1]));
    p.box([0.03, yw - ymin - 0.12, zmax - zmin - 0.16], { at: A([-d.side * s.t * 0.55, (yw + ymin) / 2, (zmin + zmax) / 2]), paint: s.inner, bevel: 0.01 });
    p.box([0.03, 0.035, 0.14], { at: A([d.side * s.t * 0.55, yw - 0.1, zmin + 0.16]), paint: s.trim, bevel: 0.008 });
  });
  return n;
}
// Fold a static node's pieces into its parent (saves its draw calls); node must not move.
function bake(p, n) {
  const list = p.nodes.get(n), host = p.nodes.get(n.parent);
  if (!list || !host) return;
  n.updateMatrix();
  for (const it of list) { it.g.applyMatrix4(n.matrix); host.push(it); }
  p.nodes.delete(n); n.parent.remove(n);
}
function wheels(p, o) {
  const list = [], steers = [];
  for (const [z, front] of [[o.zf, true], [o.zr, false]]) for (const sx of [1, -1]) {
    const at = [sx * o.x, o.R, z];
    let parent = null;
    if (front) { parent = p.node('steer', { at }); steers.push(parent); }
    const w = parts.wheel(p, { name: 'wheel', at: front ? [0, 0, 0] : at, parent, R: o.R, w: o.w, ri: o.R * 0.6, rimPaint: o.rim });
    if (o.hub) p.in(w, () => { // hub cap + lug ring on the outside
      p.cyl(o.R * 0.2, 0.04, { at: [sx * (o.w * 0.32), 0, 0], rot: [0, 0, PI / 2], paint: o.hub, seg: 8, bevel: 0.01 });
      for (let k = 0; k < 5; k++) { const a = (k / 5) * PI * 2; p.cyl(0.018, 0.03, { at: [sx * o.w * 0.33, Math.sin(a) * o.R * 0.3, Math.cos(a) * o.R * 0.3], rot: [0, 0, PI / 2], paint: o.hub, seg: 6, bevel: 0.004 }); }
    });
    list.push(w);
  }
  return { list, steers };
}
function drive(p, wh, R, opts) {
  let speed = opts.speed ?? 0;
  p.param('steer', opts.steer ?? 0, (v) => { for (const s of wh.steers) s.rotation.y = v * 0.5; }, [-1, 1]);
  p.param('speed', speed, (v) => { speed = v; }, [0, 20]);
  p.onUpdate((dt) => { const a = (speed * dt) / R; for (const w of wh.list) w.rotation.x += a; });
}
function common(p, opts, color) {
  const blood = opts.blood ?? 0.15;
  return {
    body: p.paint('paint', { color: opts.color || color, under: '#8e9397', splatScale: 0.4, splat: blood, chip: 0.6 * p.wear / 0.6, rust: 0.1 * p.wear / 0.6 }),
    glass: p.paint('glass', { color: '#55748f' }),
    inner: p.paint('paint', { color: '#3a3b40', chip: 0, rust: 0, dirt: 0.35 }),
    seat: p.paint('fabric', { color: '#4a4643' }),
    trim: p.paint('plastic', { color: '#2f3034', chip: 0.05 }),
    steel: p.paint('steel', { color: '#6c7378', splatScale: 0.4, splat: blood * 0.7 }),
    dark: p.paint('steel', { color: '#45494e', under: '#8b9196', splatScale: 0.4, splat: blood * 0.5 }),
    plate: p.paint('steel', { color: '#7d8489', under: '#a5abb0', rust: 0.2 * p.wear / 0.6, splatScale: 0.4, splat: blood * 0.6 }),
    rusty: p.paint('rusty', { splatScale: 0.4, splat: blood * 0.5 }),
    wood: p.paint('wood', { color: '#a3735a', under: '#c69a78', splatScale: 0.4, splat: blood * 0.4 }),
    tyreRim: p.paint('steel', { color: '#5a5f64', under: '#9aa0a5' }),
    hub: p.paint('metal', { color: '#9aa1a6' }),
    glowW: p.paint('glow', { color: '#fff4d2' }),
    glowR: p.paint('glow', { color: '#ff4a35' }),
    glowA: p.paint('glow', { color: '#ffb23a' }),
    rubber: p.paint('rubber'),
  };
}
function interior(p, P, o) { // seats, dash, steering wheel (driver on +X)
  const { hw, zSeat, zDash, yFloor, yDash, seats = 2 } = o;
  p.box([hw * 2 - 0.2, 0.08, Math.abs(zDash - zSeat) + 0.5], { at: [0, yFloor + 0.04, (zSeat + zDash) / 2], paint: P.inner, bevel: 0.01 });
  const sx = seats === 1 ? [0] : [hw * 0.45, -hw * 0.45], sw = seats === 1 ? hw * 1.6 : hw * 0.7;
  for (const x of sx) {
    p.box([sw, 0.16, 0.5], { at: [x, yFloor + 0.38, zSeat + 0.15], paint: P.seat, bevel: 0.04 });
    p.box([sw, 0.62, 0.14], { at: [x, yFloor + 0.72, zSeat - 0.12], rot: [-0.18, 0, 0], paint: P.seat, bevel: 0.04 });
  }
  p.box([hw * 2 - 0.14, 0.22, 0.4], { at: [0, yDash, zDash], paint: P.trim, bevel: 0.04 });
  p.torus(0.17, 0.022, { at: [hw * 0.45, yDash + 0.12, zDash - 0.32], rot: [-0.5, 0, 0], seg: 12, tube: 5, paint: P.trim });
  p.cyl(0.025, 0.3, { at: [hw * 0.45, yDash + 0.04, zDash - 0.2], rot: [1.07, 0, 0], paint: P.trim, seg: 6 });
}

// =====================================================================================
// 1. Pickup: light-blue, roof light bar + spare tyre, welded windscreen plates,
//    plank side rails, caged rear window, spiked plough, rear bumper spikes.
// opts: color, armor (0|1), blood (splat 0..1), doors (0..1 driver door), speed, steer, dent
export function pickup(seed = 1, opts = {}) {
  const p = new Prop('pickup', seed, opts);
  const P = common(p, opts, '#5ea6c4');
  const armor = opts.armor ?? 1;
  const hw = 0.97, t = 0.06, R = 0.46, zf = 1.42, zr = -1.45, ar = 0.57, ay = 0.48, yb = 0.40;
  const zF = 2.30, zB = -2.34, yHood = 1.30, yRail = 1.30, yRoof = 1.98, yBed = 0.86;
  const front = [[zF, yb], [zF + 0.06, 0.54], [zF + 0.06, 1.14], [zF - 0.04, 1.24], [1.05, yHood]];
  const ws = [[1.05, yHood], [0.56, yRoof - 0.05]];
  const roof = [[0.56, yRoof - 0.05], [0.44, yRoof], [-0.54, yRoof], [-0.62, yRoof - 0.05]];
  const bottom = [[zB + 0.06, yb], ...arch(zr, ay, ar, yb), ...arch(zf, ay, ar, yb), [zF, yb]];
  const outline = [...front, ...roof, [-0.66, yRail], [zB + 0.06, yRail], [zB, yRail - 0.08], [zB, 0.52], ...bottom];
  const doorPts = [[-0.58, 0.50], [0.83, 0.50], [0.83, 1.32], [0.50, 1.88], [-0.52, 1.89], [-0.58, 1.84]];
  const doorWin = [[0.70, 1.40], [0.46, 1.80], [-0.48, 1.80], [-0.50, 1.40]];
  const S = { hw, t, outline, paint: P.body, glass: P.glass, inner: P.inner, trim: P.trim, dent: opts.dent ?? 0.008,
    holes: [{ pts: doorPts }],
    strips: [
      { pts: front }, { pts: ws, glass: true, edge: 0.1 }, { pts: roof },
      { pts: [[-0.62, yRoof - 0.05], [-0.627, 1.82]] }, { pts: [[-0.627, 1.82], [-0.648, 1.48]], glass: true, edge: 0.3 },
      { pts: [[-0.648, 1.48], [-0.66, yRail], [-0.66, yBed]] },
      { pts: [[-0.66, yBed], [zB + 0.08, yBed]] },
      { pts: [[zB, 0.52], ...bottom] },
    ] };
  shell(p, S);
  const doorL = sideDoor(p, S, { name: 'door', side: 1, hinge: 0.83, pts: doorPts, win: doorWin });
  sideDoor(p, S, { name: 'door_r', side: -1, fixed: true, hinge: 0.83, pts: doorPts, win: doorWin });
  p.param('doors', opts.doors ?? 0, (v) => { doorL.rotation.y = -v * 1.15; });
  interior(p, P, { hw, zSeat: -0.32, zDash: 0.72, yFloor: yb, yDash: 1.2, seats: 1 });
  // tailgate, bed rail caps, rocker trim
  p.box([hw * 2 - t, yRail - 0.52, 0.09], { at: [0, (yRail + 0.52) / 2, zB + 0.045], paint: P.body, bevel: 0.02 });
  p.box([0.42, 0.1, 0.03], { at: [0, yRail - 0.17, zB - 0.005], paint: P.trim, bevel: 0.01 });
  for (const sx of [1, -1]) {
    p.box([0.1, 0.05, -0.66 - zB], { at: [sx * (hw - 0.04), yRail + 0.02, (zB - 0.66) / 2], paint: P.trim, bevel: 0.015 });
    p.box([0.05, 0.13, (zf - ar) - (zr + ar) - 0.02], { at: [sx * (hw + 0.01), yb + 0.08, (zf - ar + zr + ar) / 2], paint: P.trim, bevel: 0.015 });
    p.box([0.05, 0.13, (zr - ar) - zB - 0.02], { at: [sx * (hw + 0.01), yb + 0.08, (zB + zr - ar) / 2], paint: P.trim, bevel: 0.015 });
  }
  // front: grille, headlights, bumper, fender flares, mirrors, tail lights
  p.box([1.2, 0.36, 0.06], { at: [0, 0.98, zF + 0.06], paint: P.trim, bevel: 0.02 });
  for (let i = 0; i < 4; i++) p.box([1.1, 0.035, 0.03], { at: [0, 0.86 + i * 0.08, zF + 0.09], paint: P.hub, bevel: 0.008 });
  p.box([0.08, 0.36, 0.05], { at: [0, 0.98, zF + 0.1], paint: P.hub, bevel: 0.01 });
  for (const sx of [1, -1]) {
    for (const k of [0, 1]) roundLamp(p, [sx * (0.62 + k * 0.15), 1.0, zF + 0.06], 0.055, P.glowW, P.trim);
    lamp(p, [sx * (hw - 0.12), yRail - 0.18, zB - 0.01], [0.13, 0.2], P.glowR, P.trim, -1);
    flare(p, zf, ay, ar + 0.02, sx * (hw + 0.005), P.trim);
    flare(p, zr, ay, ar + 0.02, sx * (hw + 0.005), P.trim);
    p.box([0.04, 0.17, 0.13], { at: [sx * (hw + 0.11), 1.48, 0.74], paint: P.trim, bevel: 0.015 });
    p.box([0.13, 0.03, 0.03], { at: [sx * (hw + 0.045), 1.42, 0.77], paint: P.trim, bevel: 0.008 });
  }
  p.box([2.06, 0.24, 0.24], { at: [0, 0.56, zF + 0.16], paint: P.steel, bevel: 0.035 });
  const wh = wheels(p, { R, w: 0.32, x: 0.84, zf, zr, rim: P.tyreRim, hub: P.hub });
  drive(p, wh, R, opts);

  if (armor) {
    // bull bar
    const zb = zF + 0.24;
    for (const sx of [1, -1]) {
      p.tube([[sx * 0.5, 0.62, zb], [sx * 0.5, 1.16, zb], [sx * 0.42, 1.24, zb - 0.1]], 0.04, { paint: P.dark, seg: 6 });
      p.tube([[sx * 0.88, 0.62, zb], [sx * 0.88, 0.98, zb - 0.02], [sx * 0.8, 1.08, zb - 0.12]], 0.035, { paint: P.dark, seg: 6 });
    }
    p.tube([[-0.92, 0.94, zb + 0.01], [0.92, 0.94, zb + 0.01]], 0.035, { paint: P.dark, seg: 6, smooth: false });
    // spiked plough: blades + spikes under the bumper
    for (const x of [-0.78, -0.26, 0.26, 0.78]) {
      ext(p, [[0, 0.08], [0.6, -0.04], [0.56, -0.09], [0, -0.07]], 0.05, { at: [x + p.range(-0.04, 0.04), 0.42, zF + 0.2], rot: [0, -PI / 2 + p.range(-0.15, 0.15), 0], paint: P.plate, bevel: 0.01 });
    }
    p.box([1.95, 0.18, 0.05], { at: [0, 0.4, zF + 0.3], rot: [0.5, 0, 0], paint: P.plate, bevel: 0.015 });
    for (const x of [-0.88, -0.44, 0.0, 0.44, 0.88]) spike(p, [x, 0.44, zF + 0.3], [p.range(-0.15, 0.15), -0.1, 1], 0.26, 0.035, P.steel);
    // welded windscreen plates (slit in between) + straps + bolts
    onLine(p, ws[0], ws[1], 0.24, [hw * 2 - 0.1, 0.32, 0.035], { off: 0.03, paint: P.plate, roll: p.range(-0.04, 0.04), deform: { amp: 0.01, freq: 5 } });
    onLine(p, ws[0], ws[1], 0.74, [hw * 2 - 0.16, 0.26, 0.035], { off: 0.03, paint: P.plate, roll: p.range(-0.04, 0.04), deform: { amp: 0.01, freq: 5 } });
    for (const x of [-0.42, 0.42]) {
      onLine(p, ws[0], ws[1], 0.5, [0.08, 0.86, 0.03], { off: 0.065, x, paint: P.dark });
      for (const f of [0.12, 0.88]) onLine(p, ws[0], ws[1], f, [0.045, 0.045, 0.03], { off: 0.09, x, paint: P.hub });
    }
    // roof rack with light bar, spare tyre and jerry can
    const ry = yRoof + 0.14;
    for (const sx of [1, -1]) {
      p.box([0.06, 0.06, 1.1], { at: [sx * 0.8, ry, -0.05], paint: P.dark, bevel: 0.015 });
      for (const z of [0.42, -0.52]) p.box([0.05, 0.16, 0.05], { at: [sx * 0.8, yRoof + 0.06, z], paint: P.dark, bevel: 0.01 });
    }
    for (const z of [0.46, 0.0, -0.5]) p.box([1.66, 0.05, 0.06], { at: [0, ry, z], paint: P.dark, bevel: 0.012 });
    p.box([1.6, 0.06, 0.1], { at: [0, ry + 0.08, 0.48], paint: P.trim, bevel: 0.015 });
    for (let i = 0; i < 4; i++) lamp(p, [-0.57 + i * 0.38, ry + 0.2, 0.5], [0.22, 0.14], P.glowW, P.trim);
    parts.tyre(p, { R: 0.36, w: 0.2, ri: 0.21, rim: true, rimPaint: P.tyreRim, at: [-0.28, ry + 0.13, -0.18], rot: [0.04, 0, 0.05] });
    const green = p.paint('paint', { color: '#8fce3a', splat: 0 });
    p.box([0.36, 0.2, 0.45], { at: [0.45, ry + 0.13, -0.22], rot: [0, 0.1, 0], paint: green, bevel: 0.03 });
    parts.strapBox(p, { size: [0.36, 0.2, 0.45], at: [0.45, ry + 0.13, -0.22], axis: 'z', t: 0, width: 0.04, buckle: false });
    // plank side rails in the bed (posts + boards)
    for (const sx of [1, -1]) {
      for (const z of [-0.82, -1.6, zB + 0.12]) p.box([0.08, 0.78, 0.08], { at: [sx * (hw - 0.05), yRail + 0.3, z], rot: [p.range(-0.08, 0.08), 0, sx * p.range(0, 0.1)], paint: P.wood, bevel: 0.015 });
      for (const y of [yRail + 0.2, yRail + 0.42]) parts.plank(p, { size: [1.62, 0.03, 0.13], at: [sx * (hw + 0.005), y + p.range(-0.03, 0.03), -1.5], rot: [PI / 2, PI / 2 + p.range(-0.05, 0.05), 0], paint: P.wood });
    }
    // caged rear window
    const cz = -0.72;
    p.box([1.42, 0.05, 0.05], { at: [0, 1.86, cz], paint: P.dark });
    p.box([1.42, 0.05, 0.05], { at: [0, 1.42, cz], paint: P.dark });
    for (let i = 0; i <= 6; i++) p.box([0.025, 0.44, 0.025], { at: [-0.66 + i * 0.22, 1.64, cz - 0.02], paint: P.dark, bevel: 0.006 });
    for (const y of [1.54, 1.72]) p.box([1.38, 0.025, 0.025], { at: [0, y, cz - 0.04], paint: P.dark, bevel: 0.006 });
    // rear bumper with spiked brackets
    p.box([1.96, 0.15, 0.15], { at: [0, 0.52, zB - 0.2], paint: P.dark, bevel: 0.035 });
    for (const x of [-0.62, 0, 0.62]) {
      p.box([0.13, 0.22, 0.24], { at: [x, 0.52, zB - 0.12], paint: P.plate, bevel: 0.02 });
      spike(p, [x, 0.52, zB - 0.26], [0, 0, -1], 0.17, 0.042, P.steel);
    }
    for (const sx of [1, -1]) {
      p.box([0.2, 0.3, 0.12], { at: [sx * 0.86, 0.6, zB - 0.06], rot: [0, sx * 0.2, 0], paint: P.plate, bevel: 0.02 });
      spike(p, [sx * 0.95, 0.52, zB - 0.26], [sx * 0.3, 0, -1], 0.15, 0.035, P.steel);
    }
    // welded plate patches
    for (const sx of [1, -1]) p.box([0.02, 0.3, 0.42], { at: [sx * (hw + 0.012), 0.86, -1.95], rot: [p.range(-0.1, 0.1), 0, 0], paint: P.plate, bevel: 0.006 });
    p.box([0.02, 0.26, 0.36], { at: [-(hw + 0.02), 0.8, 2.0], rot: [0.12, 0, 0], paint: P.plate, bevel: 0.006 });
  } else {
    p.box([1.96, 0.15, 0.16], { at: [0, 0.54, zB - 0.1], paint: P.steel, bevel: 0.03 });
  }
  return p.done();
}

// =====================================================================================
// 2. Van: dark grey, big roof rack (water tank, solar panel, crates, jerry can, light bar),
//    grille bars over windscreen, spiked ram, driver + rear doors open onto an interior.
// opts: color, armor (0|1), blood, doors (0..1: driver + rear doors), rack (bool), speed, steer
export function van(seed = 1, opts = {}) {
  const p = new Prop('van', seed, opts);
  const P = common(p, opts, '#6a6c70');
  const armor = opts.armor ?? 1;
  const hw = 1.0, t = 0.06, R = 0.4, zf = 1.6, zr = -1.5, ar = 0.5, ay = 0.42, yb = 0.34, zb = -2.44;
  const front = [[2.40, yb], [2.48, 0.48], [2.48, 0.92], [2.38, 1.05], [1.75, 1.12]];
  const ws = [[1.75, 1.12], [1.20, 1.92]];
  const roof = [[1.20, 1.92], [1.05, 2.08], [-2.32, 2.10], [zb, 2.0]];
  const bottom = [[-2.38, yb], ...arch(zr, ay, ar, yb), ...arch(zf, ay, ar, yb), [2.40, yb]];
  const outline = [...front, [1.20, 1.92], [1.05, 2.08], [-2.32, 2.10], [zb, 2.0], [zb, 0.46], ...bottom];
  const doorPts = [[0.35, 0.46], [1.02, 0.46], [1.02, 0.86], [1.30, 1.08], [1.0, 1.90], [0.35, 1.90]];
  const doorWin = [[1.12, 1.22], [0.92, 1.82], [0.45, 1.82], [0.45, 1.22]];
  const S = { hw, t, outline, paint: P.body, glass: P.glass, inner: P.inner, trim: P.trim, dent: opts.dent ?? 0.01,
    holes: [{ pts: doorPts }],
    strips: [{ pts: front }, { pts: ws, glass: true, edge: 0.1 }, { pts: roof }, { pts: [[zb, 0.46], ...bottom] }] };
  shell(p, S);
  const doorL = sideDoor(p, S, { name: 'door', side: 1, hinge: 1.15, pts: doorPts, win: doorWin });
  sideDoor(p, S, { name: 'door_r', side: -1, fixed: true, hinge: 1.15, pts: doorPts, win: doorWin });
  interior(p, P, { hw, zSeat: 0.45, zDash: 1.45, yFloor: 0.5, yDash: 1.15 });
  // rear frame around the cargo opening + cargo floor
  p.box([hw * 2, 0.14, 0.08], { at: [0, 1.99, zb + 0.04], paint: P.body, bevel: 0.02 });
  p.box([hw * 2, 0.16, 0.12], { at: [0, 0.5, zb + 0.05], paint: P.body, bevel: 0.02 });
  for (const sx of [1, -1]) p.box([0.09, 1.6, 0.08], { at: [sx * (hw - 0.045), 1.25, zb + 0.04], paint: P.body, bevel: 0.02 });
  p.box([hw * 2 - 0.12, 0.06, 2.75], { at: [0, 0.56, zb + 1.4], paint: P.inner, bevel: 0.01 });
  // cargo: crates, sacks, shelf
  p.box([0.55, 0.45, 0.5], { at: [-0.55, 0.82, -1.9], rot: [0, 0.1, 0], paint: P.wood, bevel: 0.02 });
  p.box([0.45, 0.35, 0.4], { at: [-0.55, 1.22, -1.85], rot: [0, -0.2, 0], paint: p.paint('plywood'), bevel: 0.02 });
  p.box([0.5, 0.3, 0.6], { at: [0.55, 0.74, -1.6], paint: p.paint('plastic', { color: '#2f6fb0' }), bevel: 0.03 });
  p.box([0.3, 0.05, 1.6], { at: [hw - 0.2, 1.45, -1.2], paint: P.inner, bevel: 0.01 });
  // rear doors (hinged at the outer edges)
  const rear = [];
  for (const sx of [1, -1]) {
    const n = p.node(sx > 0 ? 'rear_door_l' : 'rear_door_r', { at: [sx * (hw - 0.05), 0, zb - 0.01] });
    const w = hw - 0.06;
    p.in(n, () => {
      const pts = [[0, 0.56], [-sx * w, 0.56], [-sx * w, 1.92], [0, 1.92]];
      const win = [[-sx * 0.14, 1.25], [-sx * (w - 0.1), 1.25], [-sx * (w - 0.1), 1.8], [-sx * 0.14, 1.8]];
      ext(p, pts, 0.05, { holes: [win], at: [0, 0, 0], paint: P.body, bevel: 0.01, deform: { amp: 0.006, freq: 3 } });
      ext(p, win, 0.016, { paint: P.glass, bevel: 0.004 });
      p.box([w - 0.16, 0.6, 0.03], { at: [-sx * w / 2, 0.92, 0.035], paint: P.inner, bevel: 0.01 });
      p.box([0.03, 0.03, 0.12], { at: [-sx * (w - 0.08), 1.15, -0.04], rot: [0, 0, PI / 2], paint: P.trim, bevel: 0.008 });
      p.box([0.03, 0.14, 0.03], { at: [-sx * (w - 0.08), 1.15, -0.06], paint: P.hub, bevel: 0.008 });
      if (armor) for (let k = 0; k < 3; k++) p.box([0.035, 0.6, 0.03], { at: [-sx * (0.25 + k * 0.2), 1.52, -0.04], rot: [0, 0, p.range(-0.06, 0.06)], paint: P.plate, bevel: 0.008 });
      for (const y of [0.75, 1.7]) p.box([0.05, 0.12, 0.06], { at: [0, y, -0.02], paint: P.dark, bevel: 0.01 });
    });
    if (sx < 0) rear.push(n); else bake(p, n); // only the far-side (-X) rear door opens, as on the sheet
  }
  p.param('doors', opts.doors ?? 0, (v) => {
    doorL.rotation.y = -v * 1.15;
    for (const n of rear) n.rotation.y = v * 1.75;
  });
  // front details
  p.box([1.2, 0.26, 0.06], { at: [0, 0.82, 2.48], paint: P.trim, bevel: 0.02 });
  for (let i = 0; i < 3; i++) p.box([1.1, 0.03, 0.03], { at: [0, 0.74 + i * 0.08, 2.51], paint: P.hub, bevel: 0.008 });
  for (const sx of [1, -1]) {
    lamp(p, [sx * 0.75, 0.84, 2.48], [0.24, 0.13], P.glowW, P.trim);
    lamp(p, [sx * (hw - 0.1), 1.0, zb - 0.06], [0.1, 0.26], P.glowR, P.trim, -1);
    flare(p, zf, ay, ar + 0.02, sx * (hw + 0.005), P.trim);
    flare(p, zr, ay, ar + 0.02, sx * (hw + 0.005), P.trim);
    p.box([0.04, 0.24, 0.14], { at: [sx * (hw + 0.12), 1.45, 1.35], paint: P.trim, bevel: 0.015 });
    p.box([0.14, 0.03, 0.03], { at: [sx * (hw + 0.05), 1.38, 1.38], paint: P.trim, bevel: 0.008 });
    p.box([0.14, 0.05, 2.0], { at: [sx * (hw + 0.05), 0.38, -0.05], paint: P.dark, bevel: 0.015 }); // side step
  }
  p.box([2.05, 0.2, 0.2], { at: [0, 0.5, 2.6], paint: P.steel, bevel: 0.03 });
  p.box([2.0, 0.14, 0.14], { at: [0, 0.48, zb - 0.1], paint: P.dark, bevel: 0.03 });
  const wh = wheels(p, { R, w: 0.3, x: 0.86, zf, zr, rim: P.tyreRim, hub: P.hub });
  drive(p, wh, R, opts);

  if (opts.rack !== false) { // roof rack + load
    const ry = 2.24;
    for (const sx of [1, -1]) {
      p.box([0.06, 0.06, 3.3], { at: [sx * 0.98, ry, -0.62], paint: P.dark, bevel: 0.015 });
      for (const z of [0.9, -0.6, -2.15]) p.box([0.05, 0.16, 0.05], { at: [sx * 0.96, 2.16, z], paint: P.dark, bevel: 0.01 });
    }
    for (const z of [1.0, 0.4, -0.2, -0.8, -1.4, -2.2]) p.box([2.0, 0.05, 0.07], { at: [0, ry, z], paint: P.dark, bevel: 0.012 });
    for (const sx of [1, -1]) p.box([0.05, 0.12, 3.3], { at: [sx * 1.0, ry + 0.09, -0.62], paint: P.dark, bevel: 0.012 });
    // water tank along Z
    const tank = p.paint('plastic', { color: '#3e7f9c', under: '#9fc3d0', splat: 0.15 });
    p.lathe([[0, -0.6], [0.3, -0.6], [0.36, -0.54], [0.37, -0.3], [0.37, 0.3], [0.36, 0.54], [0.3, 0.6], [0, 0.6]], { seg: 16, at: [0.05, ry + 0.4, -1.0], rot: [PI / 2, 0, 0], paint: tank });
    for (const z of [-1.35, -0.65]) parts.strapRing(p, { r: 0.37, width: 0.07, at: [0.05, ry + 0.4, z], rot: [PI / 2, 0, 0], seg: 16 });
    // solar panel (front left), crates (rear), jerry can, light bar
    p.box([0.85, 0.05, 0.75], { at: [-0.5, ry + 0.1, 0.45], rot: [0.06, 0, 0], paint: p.paint('plastic', { color: '#2b3d70', col2: '#8aa4d8', pattern: 'grid', patW: 0.12, chip: 0, splat: 0 }), bevel: 0.015 });
    p.box([0.9, 0.06, 0.8], { at: [-0.5, ry + 0.06, 0.45], rot: [0.06, 0, 0], paint: P.hub, bevel: 0.015 });
    p.box([0.5, 0.36, 0.5], { at: [0.62, ry + 0.22, -1.9], rot: [0, 0.15, 0], paint: P.wood, bevel: 0.02 });
    p.box([0.42, 0.3, 0.4], { at: [-0.6, ry + 0.19, -2.0], rot: [0, -0.1, 0], paint: p.paint('plywood'), bevel: 0.02 });
    const red = p.paint('paint', { color: '#d1322b', splat: 0 });
    p.box([0.16, 0.4, 0.32], { at: [0.55, ry + 0.24, 0.45], paint: red, bevel: 0.03 });
    p.tube([[0.55, ry + 0.44, 0.35], [0.55, ry + 0.5, 0.42], [0.55, ry + 0.5, 0.52]], 0.015, { paint: red, seg: 5 });
    p.box([0.3, 0.32, 0.3], { at: [0.12, ry + 0.2, 0.5], paint: P.wood, bevel: 0.02 });
    p.box([1.7, 0.06, 0.08], { at: [0, ry + 0.12, 1.12], paint: P.dark, bevel: 0.015 });
    for (let i = 0; i < 4; i++) roundLamp(p, [-0.6 + i * 0.4, ry + 0.26, 1.16], 0.08, P.glowW, P.trim);
  }
  if (armor) {
    // grille bars over the windscreen
    for (const x of [-0.9, 0.9]) onLine(p, ws[0], ws[1], 0.5, [0.06, 0.98, 0.05], { off: 0.06, x, paint: P.dark });
    for (let i = 0; i < 6; i++) onLine(p, ws[0], ws[1], 0.1 + i * 0.16, [1.84, 0.035, 0.035], { off: 0.08, paint: P.steel });
    for (const x of [-0.45, 0, 0.45]) onLine(p, ws[0], ws[1], 0.5, [0.03, 0.95, 0.03], { off: 0.1, x, paint: P.steel });
    // spiked ram: tube frame + blades
    for (const sx of [1, -1]) p.tube([[sx * 0.7, 0.5, 2.7], [sx * 0.7, 1.0, 2.66], [sx * 0.55, 1.1, 2.5]], 0.035, { paint: P.dark, seg: 6 });
    p.tube([[-0.95, 0.8, 2.72], [0.95, 0.8, 2.72]], 0.035, { paint: P.dark, seg: 6, smooth: false });
    for (let i = 0; i < 5; i++) {
      const x = -0.84 + i * 0.42;
      ext(p, [[0, 0.12], [0.62, -0.18], [0.55, -0.24], [0, -0.1]], 0.06, { at: [x, 0.62, 2.68], rot: [0, -PI / 2 + p.range(-0.1, 0.1), 0], paint: P.plate, bevel: 0.012 });
    }
    // rear bumper teeth
    for (let i = 0; i < 6; i++) ext(p, [[-0.08, 0], [0.08, 0], [0, -0.16]], 0.03, { at: [-0.75 + i * 0.3, 0.44, zb - 0.16], rot: [-0.4, 0, 0], paint: P.plate, bevel: 0.006 });
    // side plank patch (-X) and corrugated rust sheet (+X)
    for (let k = 0; k < 4; k++) parts.plank(p, { size: [0.95, 0.03, 0.14], at: [-(hw + 0.02), 1.35 - k * 0.15, -0.9 + p.range(-0.05, 0.05)], rot: [PI / 2, PI / 2 + p.range(-0.06, 0.06), 0], paint: P.wood });
    const sheet = p.paint('rusty', { color: '#8a5a3c', splat: 0.2 });
    for (let k = 0; k < 5; k++) p.box([0.03, 0.12, 0.9], { at: [hw + 0.02 + (k % 2) * 0.012, 1.55 - k * 0.1, -0.9], rot: [0.05, 0, 0], paint: sheet, bevel: 0.01 });
  }
  return p.done();
}

// =====================================================================================
// 3. Hatchback: lime-green, roof machine gun on tripod, strapped barrel on the roof,
//    slatted window armour, mesh hood guard, spiked bumper plates, rear winch.
// opts: color, armor (0|1), blood, doors (0..1 driver door), gun (bool), speed, steer
export function hatchback(seed = 1, opts = {}) {
  const p = new Prop('hatchback', seed, opts);
  const P = common(p, opts, '#8cc63c');
  const armor = opts.armor ?? 1;
  const hw = 0.88, t = 0.05, R = 0.35, zf = 1.30, zr = -1.25, ar = 0.44, ay = 0.37, yb = 0.30;
  const front = [[1.95, yb], [2.05, 0.42], [2.05, 0.78], [1.95, 0.88], [1.05, 0.98]];
  const ws = [[1.05, 0.98], [0.30, 1.44]];
  const roof = [[0.30, 1.44], [0.15, 1.48], [-1.30, 1.48], [-1.45, 1.44]];
  const hatch = [[-1.45, 1.44], [-1.82, 1.06]];
  const rearF = [[-1.82, 1.06], [-1.92, 0.98], [-1.95, 0.42], [-1.88, yb]];
  const bottom = [[-1.88, yb], ...arch(zr, ay, ar, yb, 8), ...arch(zf, ay, ar, yb, 8), [1.95, yb]];
  const outline = [...front, [0.30, 1.44], [0.15, 1.48], [-1.30, 1.48], [-1.45, 1.44], [-1.82, 1.06], [-1.92, 0.98], [-1.95, 0.42], ...bottom];
  const doorPts = [[-0.30, 0.40], [0.82, 0.40], [0.82, 1.06], [0.24, 1.42], [-0.30, 1.42]];
  const doorWin = [[0.66, 1.12], [0.28, 1.37], [-0.22, 1.37], [-0.22, 1.12]];
  const rearWin = [[-0.42, 1.0], [-0.42, 1.40], [-1.25, 1.40], [-1.62, 1.04]];
  const S = { hw, t, outline, paint: P.body, glass: P.glass, inner: P.inner, trim: P.trim, dent: opts.dent ?? 0.008,
    holes: [{ pts: doorPts }, { pts: rearWin, glass: true }],
    strips: [{ pts: front }, { pts: ws, glass: true, edge: 0.1 }, { pts: roof }, { pts: hatch, glass: true, edge: 0.14 }, { pts: [...rearF, ...bottom.slice(1)] }] };
  shell(p, S);
  const doorL = sideDoor(p, S, { name: 'door', side: 1, hinge: 0.82, pts: doorPts, win: doorWin });
  sideDoor(p, S, { name: 'door_r', side: -1, fixed: true, hinge: 0.82, pts: doorPts, win: doorWin });
  p.param('doors', opts.doors ?? 0, (v) => { doorL.rotation.y = -v * 1.15; });
  interior(p, P, { hw, zSeat: -0.15, zDash: 0.78, yFloor: yb, yDash: 0.92 });
  p.box([hw * 2 - 0.2, 0.55, 0.16], { at: [0, 0.82, -0.95], rot: [-0.15, 0, 0], paint: P.seat, bevel: 0.04 });
  // front / rear details
  p.box([0.9, 0.18, 0.05], { at: [0, 0.6, 2.05], paint: P.trim, bevel: 0.02 });
  for (const sx of [1, -1]) {
    ext(p, [[0, 0], [0.3, 0.02], [0.32, 0.1], [0.04, 0.12]], 0.04, { at: [sx * 0.55, 0.72, 2.04], rot: [0, sx > 0 ? 0 : PI, 0], paint: P.glowW, bevel: 0.006 });
    lamp(p, [sx * 0.68, 0.86, -1.95], [0.22, 0.09], P.glowR, P.trim, -1);
    flare(p, zf, ay, ar + 0.02, sx * (hw + 0.005), P.trim);
    flare(p, zr, ay, ar + 0.02, sx * (hw + 0.005), P.trim);
    p.box([0.04, 0.12, 0.16], { at: [sx * (hw + 0.1), 1.08, 0.72], paint: P.trim, bevel: 0.015 });
    p.box([0.12, 0.03, 0.03], { at: [sx * (hw + 0.04), 1.03, 0.75], paint: P.trim, bevel: 0.008 });
  }
  p.box([1.7, 0.16, 0.14], { at: [0, 0.42, 2.08], paint: P.trim, bevel: 0.03 });
  p.box([1.7, 0.16, 0.14], { at: [0, 0.42, -1.98], paint: P.trim, bevel: 0.03 });
  p.box([0.38, 0.12, 0.02], { at: [0, 0.62, -1.96], paint: p.paint('paint', { color: '#e8e2cf', chip: 0.3, splat: 0 }), bevel: 0.006 });
  const wh = wheels(p, { R, w: 0.26, x: 0.75, zf, zr, rim: P.tyreRim, hub: P.hub });
  drive(p, wh, R, opts);
  // roof rails
  for (const sx of [1, -1]) p.tube([[sx * 0.72, 1.48, 0.2], [sx * 0.74, 1.6, 0.05], [sx * 0.74, 1.6, -1.25], [sx * 0.72, 1.48, -1.38]], 0.028, { paint: P.dark, seg: 6 });
  for (const z of [-0.2, -1.1]) p.tube([[-0.74, 1.6, z], [0.74, 1.6, z]], 0.025, { paint: P.dark, seg: 6, smooth: false });

  if (opts.gun !== false) { // barrel + machine gun on a tripod
    const bp = p.paint('wood', { color: '#7a4b38', under: '#a87a5e', splat: (opts.blood ?? 0.55) * 0.3 });
    const br = 0.3;
    p.lathe([[0, -0.52], [br * 0.86, -0.52], [br * 0.92, -0.48], [br, -0.2], [br * 1.02, 0], [br, 0.2], [br * 0.92, 0.48], [br * 0.86, 0.52], [0, 0.52]],
      { seg: 14, at: [0.12, 1.6 + br, -1.0], rot: [PI / 2, 0, 0], paint: bp });
    for (const z of [-1.38, -1.12, -0.88, -0.62]) parts.strapRing(p, { r: br * (Math.abs(z + 1.0) > 0.3 ? 0.95 : 1.01), width: 0.05, at: [0.12, 1.6 + br, z], rot: [PI / 2, 0, 0], seg: 14, paint: P.dark });
    p.cyl(br * 0.8, 0.02, { at: [0.12, 1.6 + br, -0.48], rot: [PI / 2, 0, 0], paint: p.paint('metal', { color: '#b8bcbe' }), seg: 14 });
    for (const z of [-0.8, -1.2]) p.box([0.7, 0.025, 0.06], { at: [0.12, 1.6 + br * 2 + 0.01, z], paint: P.trim, bevel: 0.006 });
    // tripod
    const gy = 1.6, gz = 0.0, top = [-0.05, gy + 0.55, gz];
    for (let k = 0; k < 3; k++) { const a = (k / 3) * PI * 2 + 0.4; p.tube([[top[0] + Math.sin(a) * 0.36, gy, gz + Math.cos(a) * 0.36], top], 0.018, { paint: P.dark, seg: 5, smooth: false }); }
    const gun = p.paint('steel', { color: '#3c3f44', under: '#7a8086', chip: 0.2 });
    p.box([0.12, 0.16, 0.5], { at: [top[0], top[1] + 0.1, gz + 0.05], paint: gun, bevel: 0.02 });
    p.cyl(0.04, 0.5, { at: [top[0], top[1] + 0.12, gz + 0.55], rot: [PI / 2, 0, 0], paint: gun, seg: 8 });
    p.cyl(0.022, 0.25, { at: [top[0], top[1] + 0.12, gz + 0.9], rot: [PI / 2, 0, 0], paint: gun, seg: 6 });
    p.box([0.16, 0.12, 0.16], { at: [top[0] + 0.12, top[1] + 0.06, gz + 0.05], paint: p.paint('paint', { color: '#4e5a3a', chip: 0.3 }), bevel: 0.015 });
    p.box([0.05, 0.12, 0.14], { at: [top[0], top[1] + 0.06, gz - 0.25], rot: [0.3, 0, 0], paint: P.wood, bevel: 0.012 });
    p.box([0.16, 0.1, 0.1], { at: [top[0], top[1] + 0.24, gz + 0.1], paint: gun, bevel: 0.015 });
  }
  if (armor) {
    // slatted windscreen armour
    for (const x of [-0.8, 0.8]) onLine(p, ws[0], ws[1], 0.5, [0.06, 0.92, 0.04], { off: 0.05, x, paint: P.dark });
    for (let i = 0; i < 4; i++) onLine(p, ws[0], ws[1], 0.16 + i * 0.22, [1.7, 0.1, 0.03], { off: 0.08, paint: P.plate, roll: p.range(-0.03, 0.03) });
    // side window crossbars
    for (const sx of [1, -1]) {
      p.box([0.03, 0.035, 1.05], { at: [sx * (hw + 0.03), 1.2, -0.95], rot: [0.42, 0, 0], paint: P.dark, bevel: 0.008 });
      p.box([0.03, 0.035, 1.05], { at: [sx * (hw + 0.03), 1.2, -0.95], rot: [-0.42, 0, 0], paint: P.dark, bevel: 0.008 });
      p.box([0.03, 0.035, 0.75], { at: [sx * (hw + 0.035), 1.26, 0.25], rot: [0.5, 0, 0], paint: P.dark, bevel: 0.008 });
    }
    // mesh hood guard: tilted frame with diagonal lattice
    const hz = 1.64, hy = 1.12, tilt = -0.9, gw = 1.55, gh = 0.64;
    const G = new THREE.Matrix4().makeRotationX(tilt).setPosition(0, hy, hz);
    const at = (x, y, z = 0) => new THREE.Vector3(x, y, z).applyMatrix4(G).toArray();
    for (const y of [-gh / 2, gh / 2]) p.box([gw, 0.05, 0.05], { at: at(0, y), rot: [tilt, 0, 0], paint: P.dark, bevel: 0.012 });
    for (const x of [-gw / 2, gw / 2]) p.box([0.05, gh, 0.05], { at: at(x, 0), rot: [tilt, 0, 0], paint: P.dark, bevel: 0.012 });
    for (let i = -3; i <= 3; i++) for (const s of [1, -1]) {
      p.box([0.02, gh * 1.25, 0.015], { at: at(i * 0.21, 0, 0.01), rot: [tilt, 0, s * 0.75], order: 'XYZ', paint: P.steel, bevel: 0.004 });
    }
    for (const sx of [1, -1]) p.box([0.05, 0.4, 0.05], { at: [sx * 0.72, 1.16, 1.42], rot: [0, 0, 0], paint: P.dark, bevel: 0.01 });
    // front tube bumper + spiked plates
    p.tube([[-0.85, 0.75, 2.05], [-0.8, 0.78, 2.2], [0.8, 0.78, 2.2], [0.85, 0.75, 2.05]], 0.04, { paint: P.dark, seg: 6 });
    for (const sx of [1, -1]) {
      p.box([0.75, 0.46, 0.08], { at: [sx * 0.45, 0.42, 2.22], rot: [-0.12, sx * -0.12, 0], paint: P.dark, bevel: 0.02, deform: { amp: 0.012, freq: 4 } });
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++)
        spike(p, [sx * (0.2 + c * 0.24), 0.3 + r * 0.22, 2.26 - c * 0.03 * sx * sx], [sx * 0.15, 0.05, 1], 0.17, 0.06, P.steel, 4);
    }
    // rear tube bumper + winch
    p.tube([[-0.85, 0.5, -2.0], [-0.8, 0.52, -2.12], [0.8, 0.52, -2.12], [0.85, 0.5, -2.0]], 0.035, { paint: P.dark, seg: 6 });
    p.box([0.5, 0.2, 0.18], { at: [0, 0.6, -2.12], paint: P.dark, bevel: 0.025 });
    p.cyl(0.08, 0.34, { at: [0, 0.6, -2.22], rot: [0, 0, PI / 2], paint: P.steel, seg: 10 });
    for (const sx of [1, -1]) p.cyl(0.1, 0.03, { at: [sx * 0.18, 0.6, -2.22], rot: [0, 0, PI / 2], paint: P.dark, seg: 10 });
    p.box([0.08, 0.06, 0.12], { at: [0, 0.52, -2.33], paint: P.steel, bevel: 0.01 });
  }
  return p.done();
}

export const PROPS = [
  { id: 'pickup', name: 'Xe bán tải bọc thép', build: pickup, yaw: 0.55, backYaw: 3.95,
    variants: [
      { label: 'xanh nhạt', seed: 1, opts: {} },
      { label: 'đỏ trơn', seed: 2, opts: { color: '#c4473a', armor: 0, blood: 0, wear: 0.4 } },
      { label: 'ô-liu mở cửa', seed: 3, opts: { color: '#7d8a4a', doors: 1, blood: 0.5, wear: 0.9 } }] },
  { id: 'van', name: 'Xe van bọc thép', build: van, yaw: 0.55, backYaw: 3.95, sheetOpts: { doors: 1 },
    variants: [
      { label: 'xám', seed: 1, opts: {} },
      { label: 'mở cửa', seed: 1, opts: { doors: 1 } },
      { label: 'be trơn', seed: 2, opts: { color: '#c9b98f', armor: 0, rack: false, blood: 0, wear: 0.4 } }] },
  { id: 'hatchback', name: 'Hatchback súng máy', build: hatchback, yaw: 0.35, backYaw: 3.9,
    variants: [
      { label: 'xanh lá', seed: 1, opts: {} },
      { label: 'cam trơn', seed: 2, opts: { color: '#e07a2a', armor: 0, gun: false, blood: 0, wear: 0.4 } },
      { label: 'vàng mở cửa', seed: 3, opts: { color: '#e2c23a', doors: 1, blood: 0.5, wear: 0.9 } }] },
];
