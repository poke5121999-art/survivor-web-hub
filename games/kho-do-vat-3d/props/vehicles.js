// Vehicles: armoured post-apocalyptic pickup, van and hatchback (front faces +Z, driver side +X).
// Chunky toy look (owner sheet): the body is one superellipse-section shell lofted along Z (lib/soft.js
// shellLoft) - puffy sides, big rounded corners, roof tucked in above the belt line, wheel arches as a
// rounded rise of the section bottom. Windows are inset dark panels with a soft step, the driver door is
// cut out of the same shell (so it closes flush and opens onto a real interior), seams are inset grooves.
// Bars / tubes / plates are thick and round-ended, wheels are big balloon tyres with tread blocks.
// Wheels roll (speed), front wheels steer (steer).
import * as THREE from '../vendor/three.module.min.js';
import { Prop } from '../lib/prop.js';
import { extrude as geoExtrude } from '../lib/geo.js';
import { sectionPts } from '../lib/soft.js';

const PI = Math.PI;
const SIDE = [0, -PI / 2, 0]; // extrude shape (x=z, y=y), depth along world X
const lerp = (a, b, t) => a + (b - a) * t;

// Extrude with the flat caps marked "not edge" so the wear shader chips only the bevelled rim.
function ext(p, pts, depth, o = {}) {
  const g = geoExtrude(pts, depth, { bevel: o.bevel ?? 0.03, holes: o.holes || [], curveSegs: o.curveSegs ?? 8 });
  const ew = g.attributes.aEdgeW, pos = g.attributes.position;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  if (ew) for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    if (Math.abs(b.sub(a).cross(c.sub(a)).normalize().z) > 0.995) for (let k = 0; k < 3; k++) ew.setX(i + k, 0);
  }
  return p.geom(g, o);
}

// ---------- side-profile helpers ([z, y])
function prof(pts, z) {
  if (z <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (z <= pts[i][0]) { const [z0, y0] = pts[i - 1], [z1, y1] = pts[i]; return lerp(y0, y1, (z - z0) / (z1 - z0)); }
  return pts[pts.length - 1][1];
}
const sprof = (pts, z, r = 0.12) => [-1, -0.5, 0, 0.5, 1].reduce((s, k) => s + prof(pts, z + k * r), 0) / 5; // rounded corners
function archLift(z, arches, yb) {
  let y = yb;
  for (const a of arches) { const d = z - a.z; if (Math.abs(d) < a.r) y = Math.max(y, a.y + Math.sqrt(a.r * a.r - d * d)); }
  return y;
}
// Body stations from profile functions; rounded ends (radius r0 rear / r1 front, shrink k0 / k1).
function stations(c) {
  const { z0, z1, step = 0.17, r0 = 0.15, r1 = 0.2, k0 = 0.7, k1 = 0.7 } = c;
  let zs = [];
  for (let z = z0 + r0; z < z1 - r1 - 1e-6; z += step) zs.push(z);
  zs.push(z1 - r1);
  for (const z of c.extra || []) if (z > z0 + r0 && z < z1 - r1) zs.push(z);
  for (const a of c.arches || []) for (let k = 0; k <= 10; k++) { const z = a.z - a.r * Math.cos((k * PI) / 10); if (z > z0 + r0 && z < z1 - r1) zs.push(z); }
  zs.sort((a, b) => a - b); zs = zs.filter((z, i) => i === 0 || z - zs[i - 1] > 0.011);
  const at = (z, sh = 0) => {
    const yb = archLift(z, c.arches || [], c.yb(z)) + sh * 0.6, yt = c.yt(z) - sh;
    return { z, hw: c.hw(z) - sh, yb, yt: Math.max(yt, yb + 0.04), belt: c.belt, gh: c.gh };
  };
  const out = [];
  for (let s = 4; s >= 1; s--) { const a = (s / 4) * (PI / 2); out.push(at(z0 + r0 - r0 * Math.sin(a), r0 * k0 * (1 - Math.cos(a)))); }
  for (const z of zs) out.push(at(z));
  for (let s = 1; s <= 4; s++) { const a = (s / 4) * (PI / 2); out.push(at(z1 - r1 + r1 * Math.sin(a), r1 * k1 * (1 - Math.cos(a)))); }
  return out;
}

// ---------- chunky parts
function spike(p, at, dir, len, r, paint, seg = 6) { // fat cone, rounded tip
  const d = new THREE.Vector3(...dir).normalize();
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d));
  p.cyl(r, len, { r2: r * 0.22, at: [at[0] + d.x * len / 2, at[1] + d.y * len / 2, at[2] + d.z * len / 2], rot: [e.x, e.y, e.z], paint, seg, bevel: r * 0.2 });
}
function lamp(p, at, s, glow, housing, face = 1) { // square lamp facing +Z (face=1) or -Z
  p.soft([s[0] + 0.08, s[1] + 0.08, 0.12], { at: [at[0], at[1], at[2] - face * 0.03], paint: housing, r: 0.035 });
  p.soft([s[0], s[1], 0.05], { at: [at[0], at[1], at[2] + face * 0.035], paint: glow, r: 0.016, segs: 2, mid: 1 });
}
function roundLamp(p, at, r, glow, housing, face = 1) {
  p.cyl(r + 0.035, 0.1, { at: [at[0], at[1], at[2] - face * 0.02], rot: [PI / 2, 0, 0], paint: housing, seg: 12, bevel: 0.03 });
  p.cyl(r, 0.04, { at: [at[0], at[1], at[2] + face * 0.035], rot: [PI / 2, 0, 0], paint: glow, seg: 12, bevel: 0.012 });
}
// Thick rounded fender lip around a wheel arch (half annulus extruded, big bevel).
function flare(p, a, x, paint, w = 0.13) {
  const pts = [], n = 12;
  for (let k = 0; k <= n; k++) { const t = PI - (k * PI) / n; pts.push([a.z + (a.r + w) * Math.cos(t), a.y + (a.r + w) * Math.sin(t)]); }
  for (let k = n; k >= 0; k--) { const t = PI - (k * PI) / n; pts.push([a.z + (a.r - 0.02) * Math.cos(t), a.y + (a.r - 0.02) * Math.sin(t)]); }
  ext(p, pts, 0.11, { at: [x, 0, 0], rot: SIDE, paint, bevel: 0.04 });
}
// Balloon tyre (round shoulders, bulging sidewall) as a lathe around local Y.
function tyrePts(R, w, ri) {
  const hw = w / 2, rs = w * 0.44, pts = [[ri, -hw * 0.74], [ri + (R - ri) * 0.4, -hw * 0.98]];
  for (let k = 0; k <= 3; k++) { const t = (k / 3) * (PI / 2); pts.push([R - rs + rs * Math.sin(t), -hw + rs - rs * Math.cos(t)]); }
  pts.push([R * 1.012, 0]);
  for (let k = 3; k >= 0; k--) { const t = (k / 3) * (PI / 2); pts.push([R - rs + rs * Math.sin(t), hw - rs + rs * Math.cos(t)]); }
  pts.push([ri + (R - ri) * 0.4, hw * 0.98], [ri, hw * 0.74], [ri, -hw * 0.74]);
  return pts;
}
// Rolling wheel node (axis X): balloon tyre + staggered chunky tread blocks + deep-dish rim with round holes.
function wheel(p, o) {
  const { R, w, P, out = 1 } = o, ri = R * 0.6, rot = [0, 0, PI / 2];
  const n = p.node(o.name || 'wheel', { at: o.at, parent: o.parent });
  p.in(n, () => {
    p.lathe(tyrePts(R, w, ri), { seg: 20, paint: P.rubber, rot });
    const nb = o.blocks ?? 9;
    for (let row = 0; row < 2; row++) for (let k = 0; k < nb; k++) {
      const a = ((k + row * 0.5) / nb) * PI * 2, rb = R - 0.004;
      p.box([w * 0.4, 0.05, (PI * 2 * R / nb) * 0.55], { at: [(row ? 1 : -1) * w * 0.2, Math.cos(a) * rb, Math.sin(a) * rb], rot: [a, 0, 0], paint: P.rubber, bevel: 0.016 });
    }
    const rr = ri + 0.012, hw = w / 2, hb = hw * 0.3;
    p.lathe([[0, -hb], [rr * 0.3, -hb], [rr * 0.38, -0.03], [rr * 0.8, -0.04], [rr * 0.88, -hw * 0.6], [rr, -hw * 0.72],
      [rr, hw * 0.72], [rr * 0.88, hw * 0.6], [rr * 0.8, 0.04], [rr * 0.38, 0.03], [rr * 0.3, hb], [0, hb]], { seg: 16, paint: P.tyreRim, rot });
    if (o.holes) for (let k = 0; k < 4; k++) { // round holes in the dish (dark discs just proud of the outer face)
      const a = (k / 4) * PI * 2 + 0.3;
      p.cyl(rr * 0.13, 0.012, { at: [out * 0.045, Math.cos(a) * rr * 0.58, Math.sin(a) * rr * 0.58], rot, paint: P.trim, seg: 7, bevel: 0 });
    }
    p.cyl(rr * 0.26, 0.06, { at: [out * hb, 0, 0], rot, paint: P.hub, seg: 10, bevel: 0.02 });
  });
  return n;
}
function wheels(p, o) {
  const list = [], steers = [];
  for (const [z, front] of [[o.zf, true], [o.zr, false]]) for (const sx of [1, -1]) {
    const at = [sx * o.x, o.R, z];
    let parent = null;
    if (front) { parent = p.node('steer', { at }); steers.push(parent); }
    list.push(wheel(p, { name: 'wheel', at: front ? [0, 0, 0] : at, parent, R: o.R, w: o.w, P: o.P, out: sx }));
  }
  return { list, steers };
}
function drive(p, wh, R, opts) {
  let speed = opts.speed ?? 0;
  p.param('steer', opts.steer ?? 0, (v) => { for (const s of wh.steers) s.rotation.y = v * 0.5; }, [-1, 1]);
  p.param('speed', speed, (v) => { speed = v; }, [0, 20]);
  p.onUpdate((dt) => { const a = (speed * dt) / R; for (const w of wh.list) w.rotation.x += a; });
}
// Fold a static node's pieces into its parent (saves draw calls); node must not move.
function bake(p, n) {
  const list = p.nodes.get(n), host = p.nodes.get(n.parent);
  if (!list || !host) return;
  n.updateMatrix();
  for (const it of list) { it.g.applyMatrix4(n.matrix); host.push(it); }
  p.nodes.delete(n); n.parent.remove(n);
}
function common(p, opts, color) {
  const blood = opts.blood ?? 0.15, w = p.wear / 0.6;
  return {
    body: p.paint('paint', { color: opts.color || color, under: '#8e9397', splatScale: 0.55, splat: blood * 0.7, chip: 0.25 * w, rust: 0.02 * w, rough: 0.58 }),
    glass: p.paint('glass', { color: '#283846' }),
    inner: p.paint('paint', { color: '#2e2f34', chip: 0, rust: 0, dirt: 0.3 }),
    seat: p.paint('fabric', { color: '#4a4643' }),
    trim: p.paint('plastic', { color: '#34363b', chip: 0.05, splatScale: 0.55, splat: blood * 0.6 }),
    steel: p.paint('steel', { color: '#80878c', metal: 0.2, splatScale: 0.55, splat: blood * 1.6, rust: 0.08 * w }),
    dark: p.paint('steel', { color: '#5d6268', metal: 0.15, under: '#8b9196', splatScale: 0.55, splat: blood * 1.3, rust: 0.06 * w }),
    plate: p.paint('steel', { color: '#8e9499', metal: 0.15, under: '#b4b9bc', rust: 0.12 * w, splatScale: 0.55, splat: blood * 1.6 }),
    wood: p.paint('wood', { color: '#a08074', under: '#c0a08c', splatScale: 0.55, splat: blood * 0.5 }),
    tyreRim: p.paint('steel', { color: '#878d92', metal: 0.2, under: '#a3a9ae', chip: 0.15 }),
    hub: p.paint('metal', { color: '#a3aaae', metal: 0.3 }),
    glowW: p.paint('glow', { color: '#fff4d2' }),
    glowR: p.paint('glow', { color: '#ff4a35' }),
    rubber: p.paint('rubber', { color: '#2e2f33' }),
  };
}
function interior(p, P, o) { // chunky seats, dash, steering wheel (driver on +X)
  const { hw, zSeat, zDash, yFloor, yDash, seats = 2 } = o;
  p.soft([hw * 2 - 0.24, 0.08, Math.abs(zDash - zSeat) + 0.5], { at: [0, yFloor + 0.05, (zSeat + zDash) / 2], paint: P.inner, r: 0.03 });
  const sx = seats === 1 ? [0] : [hw * 0.45, -hw * 0.45], sw = seats === 1 ? hw * 1.55 : hw * 0.72;
  for (const x of sx) {
    p.soft([sw, 0.2, 0.52], { at: [x, yFloor + 0.38, zSeat + 0.15], paint: P.seat, r: 0.08, bulge: 0.02 });
    p.soft([sw, 0.64, 0.18], { at: [x, yFloor + 0.74, zSeat - 0.12], rot: [-0.18, 0, 0], paint: P.seat, r: 0.08, bulge: 0.02 });
  }
  p.soft([hw * 2 - 0.2, 0.24, 0.44], { at: [0, yDash, zDash], paint: P.trim, r: 0.1 });
  p.torus(0.17, 0.035, { at: [hw * 0.45, yDash + 0.12, zDash - 0.32], rot: [-0.5, 0, 0], seg: 14, tube: 6, paint: P.trim });
  p.cyl(0.035, 0.3, { at: [hw * 0.45, yDash + 0.04, zDash - 0.2], rot: [1.07, 0, 0], paint: P.trim, seg: 8 });
}
// Bar lying on the line a->b (side profile [z,y]) at fraction f, pushed `off` outward.
function onLine(a, b, f, off) {
  const dz = b[0] - a[0], dy = b[1] - a[1], th = Math.atan2(dz, dy);
  return { y: a[1] + dy * f - Math.sin(th) * off, z: a[0] + dz * f + Math.cos(th) * off, th };
}
function doorPaints(P, node, shift) {
  return { door: { paint: P.body, node, shift }, 'door:in': { paint: P.inner, node, shift }, doorGlass: { paint: P.glass, node, shift } };
}

// =====================================================================================
// 1. Pickup: light-blue, roof light bar + spare tyre, welded windscreen plates,
//    plank side rails, caged rear window, spiked plough, rear bumper spikes.
// opts: color, armor (0|1), blood (splat 0..1), doors (0..1 driver door), speed, steer
export function pickup(seed = 1, opts = {}) {
  const p = new Prop('pickup', seed, opts);
  const P = common(p, opts, '#5ea6c4');
  const armor = opts.armor ?? 1;
  const hw = 0.98, R = 0.54, tw = 0.38, xw = 0.79, zf = 1.5, zr = -1.56, yb0 = 0.46;
  const arF = { z: zf, y: R + 0.03, r: R + 0.1 }, arR = { z: zr, y: R + 0.03, r: R + 0.1 };
  const zF = 2.36, zC = -0.74, zB = -2.42, yRail = 1.42, yBed = 0.9;
  const ytP = [[zC, 1.96], [0.5, 1.98], [1.04, 1.4], [1.9, 1.36], [zF, 1.28]];
  const dz0 = -0.56, dz1 = 0.76, wz0 = -0.47, wz1 = 0.6, wy = 1.47;
  const st = stations({ z0: zC, z1: zF, r0: 0.14, r1: 0.2, k0: 0.5, k1: 0.6, step: 0.16,
    hw: (z) => (z > 1.8 ? hw - (z - 1.8) * 0.05 : hw), yt: (z) => sprof(ytP, z, 0.09), yb: () => yb0, arches: [arF],
    belt: 1.44, gh: 0.1, extra: [dz0, dz1, wz0, wz1, 0.56, 0.98, 1.14, 1.17] });
  const doorL = p.node('door', { at: [hw, 0, dz1] });
  p.shell(st, { rect: { rT: 0.17, rB: 0.1, ns: 3, na: 4, nt: 3, bulge: 0.025, bulgeT: 0.04 }, thick: 0.05, cap0: 'body', cap1: 'body',
    region: (q) => {
      const sideF = Math.abs(q.nx) > 0.84;
      if (sideF && q.z > dz0 && q.z < dz1 && q.y > yb0 + 0.05 && q.y < 1.93) {
        const k = q.side > 0 ? 'door' : 'doorR';
        if (q.z > wz0 && q.z < wz1 && q.y > wy) return { key: k + 'Glass', grp: k, inset: 0.03 };
        return { key: k, inset: 0.008, inner: true };
      }
      if (q.top && !sideF && q.z > 0.56 && q.z < 0.98 && Math.abs(q.nx) < 0.74) return { key: "glass", grp: "body", inset: 0.035 };
      if (q.top && q.z > 1.14 && q.z < 1.17 && q.y > 1.2) return { key: 'body', inset: 0.016 }; // hood seam groove
      return { key: 'body', inner: q.z > -0.62 && q.z < 0.84 };
    } }, { body: P.body, inner: P.inner, glass: P.glass, doorRGlass: P.glass, ...doorPaints(P, doorL, [-hw, 0, -dz1]) });
  p.param('doors', opts.doors ?? 0, (v) => { doorL.rotation.y = -v * 1.15; });
  interior(p, P, { hw, zSeat: -0.32, zDash: 0.74, yFloor: yb0, yDash: 1.22, seats: 1 });
  // cab rear window (on the back cap)
  p.soft([1.36, 0.42, 0.06], { at: [0, 1.66, zC - 0.005], paint: P.trim, r: 0.03 });
  p.soft([1.22, 0.32, 0.05], { at: [0, 1.66, zC - 0.02], paint: P.glass, r: 0.03 });
  // chassis: dark tubs filling the wheel wells + frame under the cab
  p.soft([xw * 2 - tw - 0.06, 0.52, arF.r * 2 + 0.2], { at: [0, 0.66, zf], paint: P.trim, r: 0.1 });
  p.soft([1.3, 0.22, zF - zB - 0.6], { at: [0, 0.4, (zF + zB) / 2], paint: P.trim, r: 0.08 });
  // bed: thick rounded side slabs with arch notch, floor, front wall, tailgate, rail caps
  for (const sx of [1, -1]) {
    const pts = [[zB, 0.5]];
    for (let k = 0; k <= 12; k++) { const t = PI - (k * PI) / 12; pts.push([zr + arR.r * Math.cos(t), arR.y + arR.r * Math.sin(t)]); }
    pts.push([zC - 0.02, 0.5], [zC - 0.02, yRail], [zB, yRail]);
    ext(p, pts, 0.15, { at: [sx * (hw - 0.075), 0, 0], rot: SIDE, paint: P.body, bevel: 0.05 });
    p.soft([0.22, 0.09, zC - zB - 0.02], { at: [sx * (hw - 0.07), yRail + 0.03, (zC + zB) / 2], paint: P.trim, r: 0.04 });
    flare(p, arF, sx * (hw + 0.015), P.trim);
    flare(p, arR, sx * (hw + 0.02), P.trim);
    // rocker trim between the wheels
    p.soft([0.12, 0.17, (zf - arF.r) - zC + 0.1], { at: [sx * (hw + 0.01), yb0 + 0.08, (zf - arF.r + zC) / 2], paint: P.trim, r: 0.05 });
    // mirrors
    p.soft([0.07, 0.2, 0.16], { at: [sx * (hw + 0.14), 1.52, 0.78], paint: P.trim, r: 0.03 });
    p.soft([0.16, 0.05, 0.05], { at: [sx * (hw + 0.06), 1.46, 0.8], paint: P.trim, r: 0.02 });
  }
  p.soft([hw * 2 - 0.26, 0.12, zC - zB - 0.1], { at: [0, yBed, (zC + zB) / 2], paint: P.inner, r: 0.04 });
  p.soft([xw * 2 - tw - 0.08, 0.4, zC - zB - 0.1], { at: [0, 0.68, (zC + zB) / 2], paint: P.trim, r: 0.08 });
  p.soft([hw * 2 - 0.1, 0.56, 0.12], { at: [0, yBed + 0.24, zC - 0.08], paint: P.body, r: 0.05 });
  p.soft([hw * 2 - 0.02, yRail - 0.5, 0.16], { at: [0, (yRail + 0.5) / 2, zB + 0.06], paint: P.body, r: 0.06, bulge: 0.015 });
  p.soft([0.46, 0.12, 0.05], { at: [0, yRail - 0.2, zB - 0.02], paint: P.trim, r: 0.025 });
  // front: grille, headlights, bumper; tail lights
  p.soft([1.2, 0.42, 0.14], { at: [0, 0.98, zF - 0.02], paint: P.trim, r: 0.06 });
  for (const y of [0.88, 0.99, 1.1]) p.rtube([[-0.5, y, zF + 0.06], [0.5, y, zF + 0.06]], 0.028, { paint: P.hub, smooth: false });
  p.soft([0.11, 0.42, 0.08], { at: [0, 0.98, zF + 0.07], paint: P.hub, r: 0.035 });
  for (const sx of [1, -1]) {
    p.soft([0.34, 0.2, 0.1], { at: [sx * 0.72, 1.0, zF - 0.06], paint: P.trim, r: 0.05 });
    for (const k of [0, 1]) roundLamp(p, [sx * (0.65 + k * 0.15), 1.0, zF - 0.02], 0.05, P.glowW, P.trim);
    lamp(p, [sx * (hw - 0.14), yRail - 0.22, zB - 0.03], [0.14, 0.22], P.glowR, P.trim, -1);
  }
  p.soft([2.12, 0.28, 0.32], { at: [0, 0.6, zF + 0.1], paint: P.steel, r: 0.09, bulge: 0.01 });
  const wh = wheels(p, { R, w: tw, x: xw, zf, zr, P });
  drive(p, wh, R, opts);

  if (armor) {
    // bull bar (thick round tubes)
    const zb = zF + 0.3;
    for (const sx of [1, -1]) {
      p.rtube([[sx * 0.48, 0.66, zb], [sx * 0.48, 1.16, zb], [sx * 0.4, 1.26, zb - 0.14]], 0.06, { paint: P.dark });
      p.rtube([[sx * 0.9, 0.66, zb - 0.02], [sx * 0.9, 1.0, zb - 0.04], [sx * 0.8, 1.1, zb - 0.18]], 0.055, { paint: P.dark });
    }
    p.rtube([[-0.95, 0.96, zb + 0.01], [0.95, 0.96, zb + 0.01]], 0.055, { paint: P.dark, smooth: false });
    // spiked plough: 4 fat blades under the bumper + fat spikes
    for (const x of [-0.74, -0.25, 0.25, 0.74]) {
      ext(p, [[0, 0.1], [0.46, -0.1], [0.4, -0.17], [0, -0.09]], 0.1, { at: [x + p.range(-0.04, 0.04), 0.42, zF + 0.2], rot: [0, -PI / 2 + p.range(-0.15, 0.15), 0], paint: P.plate, bevel: 0.03 });
    }
    p.soft([1.98, 0.22, 0.09], { at: [0, 0.42, zF + 0.32], rot: [0.5, 0, 0], paint: P.plate, r: 0.04 });
    for (const x of [-0.8, 0, 0.8]) spike(p, [x, 0.46, zF + 0.34], [p.range(-0.12, 0.12), -0.1, 1], 0.26, 0.065, P.steel);
    // welded windscreen plates (slit between) + two straps
    const wA = [1.0, 1.42], wB = [0.56, 1.95];
    for (const [f, h, wdt] of [[0.26, 0.34, hw * 2 - 0.22], [0.76, 0.28, hw * 2 - 0.3]]) {
      const L = onLine(wA, wB, f, 0.04);
      p.soft([wdt, h, 0.06], { at: [0, L.y, L.z], rot: [L.th + PI / 2 - PI / 2, 0, p.range(-0.04, 0.04)], order: 'XYZ', paint: P.plate, r: 0.025, bulge: 0.01 });
    }
    for (const x of [-0.42, 0.42]) { const L = onLine(wA, wB, 0.5, 0.08); p.soft([0.11, 0.86, 0.05], { at: [x, L.y, L.z], rot: [L.th, 0, 0], paint: P.dark, r: 0.02 }); }
    // roof rack (round tubes) with light bar, spare tyre and jerry can
    const ry = 2.12;
    for (const sx of [1, -1]) {
      p.rtube([[sx * 0.8, ry, 0.5], [sx * 0.8, ry, -0.58]], 0.04, { paint: P.dark, smooth: false });
      for (const z of [0.42, -0.5]) p.rtube([[sx * 0.8, ry, z], [sx * 0.86, 1.96, z]], 0.035, { paint: P.dark, smooth: false });
    }
    for (const z of [0.48, -0.05, -0.56]) p.rtube([[-0.8, ry, z], [0.8, ry, z]], 0.035, { paint: P.dark, smooth: false });
    p.soft([1.66, 0.09, 0.14], { at: [0, ry + 0.08, 0.5], paint: P.trim, r: 0.035 });
    for (let i = 0; i < 4; i++) lamp(p, [-0.57 + i * 0.38, ry + 0.22, 0.52], [0.22, 0.15], P.glowW, P.trim);
    p.lathe(tyrePts(0.37, 0.22, 0.22), { seg: 22, paint: P.rubber, at: [-0.28, ry + 0.14, -0.2], rot: [0.04, 0, 0.05] });
    p.cyl(0.21, 0.12, { at: [-0.28, ry + 0.14, -0.2], paint: P.tyreRim, seg: 16, bevel: 0.03 });
    const green = p.paint('paint', { color: '#8fce3a', splat: 0 });
    p.soft([0.38, 0.24, 0.48], { at: [0.45, ry + 0.15, -0.22], rot: [0, 0.1, 0], paint: green, r: 0.06, bulge: 0.012 });
    p.soft([0.42, 0.05, 0.08], { at: [0.45, ry + 0.27, -0.22], rot: [0, 0.1, 0], paint: P.trim, r: 0.02 });
    // plank side rails in the bed: fat posts + 2 thick boards per side
    for (const sx of [1, -1]) {
      for (const z of [-0.86, -1.62, zB + 0.14]) p.soft([0.12, 0.84, 0.12], { at: [sx * (hw - 0.07), yRail + 0.34, z], rot: [p.range(-0.08, 0.08), 0, sx * p.range(0, 0.08)], paint: P.wood, r: 0.035 });
      for (const y of [yRail + 0.24, yRail + 0.5]) p.soft([0.07, 0.17, 1.66], { at: [sx * (hw + 0.0), y + p.range(-0.03, 0.03), -1.52], rot: [p.range(-0.05, 0.05), 0, 0], paint: P.wood, r: 0.025 });
    }
    // caged rear window: round frame + 4 bars + 1 rail
    const cz = zC - 0.1;
    p.rtube([[-0.72, 1.42, cz], [-0.72, 1.9, cz], [0.72, 1.9, cz], [0.72, 1.42, cz], [-0.72, 1.42, cz]], 0.035, { paint: P.dark, smooth: false, caps: false });
    for (let i = 0; i < 4; i++) { const x = -0.43 + i * 0.29; p.rtube([[x, 1.42, cz - 0.03], [x, 1.9, cz - 0.03]], 0.022, { paint: P.dark, smooth: false }); }
    p.rtube([[-0.72, 1.66, cz - 0.05], [0.72, 1.66, cz - 0.05]], 0.022, { paint: P.dark, smooth: false });
    // rear bumper with spiked brackets
    p.soft([2.0, 0.2, 0.22], { at: [0, 0.54, zB - 0.2], paint: P.dark, r: 0.07 });
    for (const x of [-0.62, 0, 0.62]) {
      p.soft([0.16, 0.26, 0.26], { at: [x, 0.54, zB - 0.12], paint: P.plate, r: 0.05 });
      spike(p, [x, 0.54, zB - 0.3], [0, 0, -1], 0.17, 0.06, P.steel);
    }
    for (const sx of [1, -1]) p.soft([0.24, 0.34, 0.14], { at: [sx * 0.86, 0.62, zB - 0.07], rot: [0, sx * 0.2, 0], paint: P.plate, r: 0.04 });
    // welded plate patches
    for (const sx of [1, -1]) p.soft([0.05, 0.32, 0.44], { at: [sx * (hw + 0.02), 0.88, -1.98], rot: [p.range(-0.1, 0.1), 0, 0], paint: P.plate, r: 0.02 });
    p.soft([0.05, 0.28, 0.38], { at: [-(hw + 0.02), 1.0, 2.0], rot: [0.12, 0, 0], paint: P.plate, r: 0.02 });
  } else {
    p.soft([2.0, 0.18, 0.2], { at: [0, 0.56, zB - 0.1], paint: P.steel, r: 0.06 });
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
  const hw = 1.0, R = 0.47, tw = 0.34, xw = 0.83, zf = 1.62, zr = -1.55, yb0 = 0.4, zb = -2.46, zF = 2.52;
  const arF = { z: zf, y: R + 0.03, r: R + 0.09 }, arR = { z: zr, y: R + 0.03, r: R + 0.09 };
  const ytP = [[zb, 2.08], [1.16, 2.1], [1.8, 1.3], [2.3, 1.18], [zF, 1.08]];
  const sh = { rect: { rT: 0.2, rB: 0.1, ns: 3, na: 4, nt: 3, bulge: 0.02, bulgeT: 0.03 } };
  const st = stations({ z0: zb, z1: zF, r0: 0.05, r1: 0.22, k0: 0.4, k1: 0.6, step: 0.24,
    hw: (z) => (z > 2.0 ? hw - (z - 2.0) * 0.06 : hw), yt: (z) => sprof(ytP, z, 0.1), yb: () => yb0, arches: [arF, arR],
    belt: 1.3, gh: 0.07, extra: [0.3, 0.4, 1.0, 1.22, 1.3, 1.18, 1.76, 1.86, 1.89] });
  const doorL = p.node('door', { at: [hw, 0, 1.3] });
  p.shell(st, { ring: 30, ...sh, thick: 0.05, cap0: null, cap1: 'body',
    region: (q) => {
      const sideF = Math.abs(q.nx) > 0.84;
      const inDoor = sideF && q.z > 0.3 && q.y > yb0 + 0.06 && q.y < 2.02 && (q.z < 1.0 || (q.y > 1.12 && q.z < 1.3));
      if (inDoor) {
        const k = q.side > 0 ? 'door' : 'doorR';
        if (q.z > 0.4 && q.z < 1.22 && q.y > 1.32 && q.y < 1.94) return { key: k + 'Glass', grp: k, inset: 0.03 };
        return { key: k, inset: 0.008, inner: true };
      }
      if (q.top && !sideF && q.z > 1.18 && q.z < 1.76 && Math.abs(q.nx) < 0.74) return { key: 'glass', grp: 'body', inset: 0.035 };
      if (q.top && q.z > 1.86 && q.z < 1.89 && q.y > 1.0) return { key: 'body', inset: 0.016 };
      return { key: 'body', inner: q.z < 1.36 };
    } }, { body: P.body, inner: P.inner, glass: P.glass, doorRGlass: P.glass, ...doorPaints(P, doorL, [-hw, 0, -1.3]) });
  interior(p, P, { hw, zSeat: 0.5, zDash: 1.42, yFloor: 0.5, yDash: 1.18 });
  // chassis tubs + cargo floor + cargo
  for (const a of [arF, arR]) p.soft([xw * 2 - tw - 0.06, 0.46, a.r * 2 + 0.14], { at: [0, 0.62, a.z], paint: P.trim, r: 0.1 });
  p.soft([1.3, 0.2, zF - zb - 0.4], { at: [0, 0.36, (zF + zb) / 2], paint: P.trim, r: 0.08 });
  p.soft([hw * 2 - 0.16, 0.1, 2.6], { at: [0, 0.56, zb + 1.35], paint: P.inner, r: 0.03 });
  p.soft([0.58, 0.48, 0.52], { at: [-0.5, 0.85, -1.95], rot: [0, 0.1, 0], paint: P.wood, r: 0.05, bulge: 0.01 });
  p.soft([0.46, 0.36, 0.42], { at: [-0.5, 1.27, -1.9], rot: [0, -0.2, 0], paint: p.paint('plywood'), r: 0.05 });
  p.soft([0.52, 0.32, 0.62], { at: [0.52, 0.77, -1.7], paint: p.paint('plastic', { color: '#2f6fb0' }), r: 0.07 });
  // rear frame lip around the open back
  const rs = st[0], rear = sectionPts(rs, sh, 40);
  // rear doors: the end section split in two halves, extruded with a fat bevel; hinged at the outer edges
  const rearN = [];
  for (const sx of [1, -1]) {
    const half = rear.filter(([x]) => sx * x >= -0.001).map(([x, y]) => [sx * Math.max(0, sx * x), y]);
    half.sort((a, b) => Math.atan2(a[1] - 1.2, sx * a[0]) - Math.atan2(b[1] - 1.2, sx * b[0]));
    const edge = sx * (rs.hw - 0.04);
    const n = p.node(sx > 0 ? 'rear_door_l' : 'rear_door_r', { at: [edge, 0, zb - 0.02] });
    p.in(n, () => {
      const pts = [[0, rs.yb + 0.08], ...half.filter(([, y]) => y > rs.yb + 0.08 && y < rs.yt - 0.06).map(([x, y]) => [x * 0.985, y]), [0, rs.yt - 0.06]]
        .map(([x, y]) => [x - edge, y]);
      const wx0 = -sx * 0.14, wx1 = -sx * (Math.abs(edge) - 0.12);
      const win = [[wx0, 1.3], [wx1, 1.3], [wx1, 1.86], [wx0, 1.86]];
      ext(p, pts, 0.08, { holes: [win], paint: P.body, bevel: 0.03 });
      ext(p, win, 0.03, { paint: P.glass, bevel: 0.008 });
      p.soft([Math.abs(edge) - 0.2, 0.62, 0.04], { at: [-sx * Math.abs(edge) / 2, 0.96, 0.05], paint: P.inner, r: 0.02 });
      p.soft([0.05, 0.05, 0.14], { at: [-sx * (Math.abs(edge) - 0.1), 1.16, -0.06], paint: P.trim, r: 0.02 });
      if (armor) for (let k = 0; k < 3; k++) p.rtube([[-sx * (0.26 + k * 0.2), 1.24, -0.06], [-sx * (0.26 + k * 0.2 + p.range(-0.03, 0.03)), 1.86, -0.06]], 0.026, { paint: P.plate, smooth: false });
      for (const y of [0.78, 1.72]) p.soft([0.08, 0.14, 0.08], { at: [0, y, -0.02], paint: P.dark, r: 0.03 });
    });
    if (sx < 0) rearN.push(n); else bake(p, n); // only the far-side (-X) rear door opens, as on the sheet
  }
  p.param('doors', opts.doors ?? 0, (v) => {
    doorL.rotation.y = -v * 1.15;
    for (const n of rearN) n.rotation.y = v * 1.75;
  });
  // front details
  p.soft([1.24, 0.3, 0.12], { at: [0, 0.84, zF - 0.06], paint: P.trim, r: 0.05 });
  for (const y of [0.78, 0.9]) p.rtube([[-0.5, y, zF + 0.0], [0.5, y, zF + 0.0]], 0.026, { paint: P.hub, smooth: false });
  for (const sx of [1, -1]) {
    lamp(p, [sx * 0.74, 0.86, zF - 0.06], [0.24, 0.14], P.glowW, P.trim);
    lamp(p, [sx * (hw - 0.1), 1.0, zb - 0.05], [0.1, 0.28], P.glowR, P.trim, -1);
    flare(p, arF, sx * (hw + 0.015), P.trim, 0.12);
    flare(p, arR, sx * (hw + 0.015), P.trim, 0.12);
    p.soft([0.07, 0.26, 0.16], { at: [sx * (hw + 0.14), 1.5, 1.34], paint: P.trim, r: 0.03 });
    p.soft([0.16, 0.05, 0.05], { at: [sx * (hw + 0.06), 1.42, 1.38], paint: P.trim, r: 0.02 });
    p.soft([0.18, 0.08, 1.9], { at: [sx * (hw + 0.04), 0.4, -0.02], paint: P.dark, r: 0.035 }); // side step
  }
  p.soft([2.08, 0.24, 0.26], { at: [0, 0.52, zF + 0.06], paint: P.steel, r: 0.08 });
  p.soft([2.02, 0.17, 0.18], { at: [0, 0.48, zb - 0.1], paint: P.dark, r: 0.06 });
  const wh = wheels(p, { R, w: tw, x: xw, zf, zr, P });
  drive(p, wh, R, opts);

  if (opts.rack !== false) { // roof rack + load
    const ry = 2.24;
    for (const sx of [1, -1]) {
      p.rtube([[sx * 0.98, ry, 1.1], [sx * 0.98, ry, -2.28]], 0.04, { paint: P.dark, smooth: false });
      p.rtube([[sx * 1.0, ry + 0.12, 1.1], [sx * 1.0, ry + 0.12, -2.28]], 0.032, { paint: P.dark, smooth: false });
      for (const z of [0.9, -0.6, -2.15]) p.rtube([[sx * 0.96, 2.1, z], [sx * 0.98, ry + 0.12, z]], 0.032, { paint: P.dark, smooth: false });
    }
    for (const z of [1.0, 0.35, -0.3, -0.95, -1.6, -2.2]) p.soft([1.96, 0.06, 0.1], { at: [0, ry, z], paint: P.dark, r: 0.025 });
    const tank = p.paint('plastic', { color: '#3e7f9c', under: '#9fc3d0', splat: 0.1 });
    p.lathe([[0, -0.6], [0.3, -0.6], [0.37, -0.53], [0.39, -0.3], [0.39, 0.3], [0.37, 0.53], [0.3, 0.6], [0, 0.6]], { seg: 18, at: [0.05, ry + 0.42, -1.0], rot: [PI / 2, 0, 0], paint: tank });
    for (const z of [-1.35, -0.65]) p.torus(0.39, 0.035, { at: [0.05, ry + 0.42, z], rot: [PI / 2, 0, 0], seg: 18, tube: 5, paint: P.trim });
    p.soft([0.88, 0.07, 0.78], { at: [-0.5, ry + 0.1, 0.45], rot: [0.06, 0, 0], paint: p.paint('plastic', { color: '#2b3d70', col2: '#8aa4d8', pattern: 'grid', patW: 0.14, chip: 0, splat: 0 }), r: 0.025 });
    p.soft([0.94, 0.06, 0.84], { at: [-0.5, ry + 0.05, 0.45], rot: [0.06, 0, 0], paint: P.hub, r: 0.025 });
    p.soft([0.52, 0.38, 0.52], { at: [0.62, ry + 0.23, -1.9], rot: [0, 0.15, 0], paint: P.wood, r: 0.05, bulge: 0.01 });
    p.soft([0.44, 0.32, 0.42], { at: [-0.6, ry + 0.2, -2.0], rot: [0, -0.1, 0], paint: p.paint('plywood'), r: 0.05 });
    const red = p.paint('paint', { color: '#d1322b', splat: 0 });
    p.soft([0.2, 0.42, 0.34], { at: [0.55, ry + 0.25, 0.45], paint: red, r: 0.06, bulge: 0.01 });
    p.rtube([[0.55, ry + 0.46, 0.36], [0.55, ry + 0.52, 0.42], [0.55, ry + 0.52, 0.52]], 0.024, { paint: red });
    p.soft([0.32, 0.34, 0.32], { at: [0.12, ry + 0.21, 0.5], paint: P.wood, r: 0.05 });
    p.soft([1.74, 0.08, 0.12], { at: [0, ry + 0.12, 1.14], paint: P.dark, r: 0.03 });
    for (let i = 0; i < 4; i++) roundLamp(p, [-0.6 + i * 0.4, ry + 0.28, 1.18], 0.085, P.glowW, P.trim);
  }
  if (armor) {
    // grille cage over the windscreen: round frame posts + 6 fat bars
    const wA = [1.84, 1.22], wB = [1.06, 2.06];
    for (const x of [-0.92, 0.92]) { const a = onLine(wA, wB, 0.0, 0.07), b = onLine(wA, wB, 1.0, 0.07); p.rtube([[x, a.y, a.z], [x, b.y, b.z]], 0.045, { paint: P.dark, smooth: false }); }
    for (let i = 0; i < 6; i++) { const L = onLine(wA, wB, 0.1 + i * 0.16, 0.1); p.rtube([[-0.92, L.y, L.z], [0.92, L.y, L.z]], 0.03, { paint: P.steel, smooth: false }); }
    // spiked ram: thick tube frame + 5 fat blades
    for (const sx of [1, -1]) p.rtube([[sx * 0.7, 0.5, 2.74], [sx * 0.7, 1.0, 2.7], [sx * 0.55, 1.1, 2.52]], 0.06, { paint: P.dark });
    p.rtube([[-0.98, 0.8, 2.76], [0.98, 0.8, 2.76]], 0.06, { paint: P.dark, smooth: false });
    for (let i = 0; i < 5; i++) {
      const x = -0.84 + i * 0.42;
      ext(p, [[0, 0.14], [0.48, -0.26], [0.39, -0.32], [0, -0.12]], 0.11, { at: [x, 0.62, 2.72], rot: [0, -PI / 2 + p.range(-0.1, 0.1), 0], paint: P.plate, bevel: 0.03 });
    }
    // rear bumper teeth
    for (let i = 0; i < 5; i++) ext(p, [[-0.1, 0], [0.1, 0], [0, -0.18]], 0.06, { at: [-0.72 + i * 0.36, 0.44, zb - 0.18], rot: [-0.4, 0, 0], paint: P.plate, bevel: 0.02 });
    // side plank patch (-X) and corrugated rust sheet (+X)
    for (let k = 0; k < 3; k++) p.soft([0.07, 0.18, 0.98], { at: [-(hw + 0.03), 1.42 - k * 0.2, -0.9 + p.range(-0.05, 0.05)], rot: [p.range(-0.06, 0.06), 0, 0], paint: P.wood, r: 0.025 });
    const sheet = p.paint('rusty', { color: '#8a5a3c', splat: 0.2 });
    for (let k = 0; k < 4; k++) p.soft([0.05, 0.14, 0.92], { at: [hw + 0.03 + (k % 2) * 0.015, 1.6 - k * 0.12, -0.9], rot: [0.05, 0, 0], paint: sheet, r: 0.02 });
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
  const hw = 0.95, R = 0.42, tw = 0.33, xw = 0.79, zf = 1.32, zr = -1.27, yb0 = 0.34, zF = 2.08, zB = -1.98;
  const arF = { z: zf, y: R + 0.03, r: R + 0.09 }, arR = { z: zr, y: R + 0.03, r: R + 0.09 };
  const ytP = [[zB, 1.02], [-1.84, 1.12], [-1.5, 1.48], [0.3, 1.5], [1.02, 1.02], [1.9, 0.97], [zF, 0.94]];
  const st = stations({ z0: zB, z1: zF, r0: 0.16, r1: 0.2, k0: 0.55, k1: 0.6, step: 0.15,
    hw: (z) => hw - Math.max(0, z - 1.7) * 0.1 - Math.max(0, -1.6 - z) * 0.08, yt: (z) => sprof(ytP, z, 0.14), yb: () => yb0, arches: [arF, arR],
    belt: 1.08, gh: 0.1, extra: [-0.3, 0.76, -0.22, 0.64, -1.3, -0.4, 0.32, 0.98, -1.74, -1.44, 1.12, 1.15] });
  const doorL = p.node('door', { at: [hw, 0, 0.76] });
  p.shell(st, { rect: { rT: 0.18, rB: 0.1, ns: 3, na: 4, nt: 3, bulge: 0.03, bulgeT: 0.05 }, thick: 0.045, cap0: 'body', cap1: 'body',
    region: (q) => {
      const sideF = Math.abs(q.nx) > 0.82;
      if (sideF && q.z > -0.3 && q.z < 0.76 && q.y > yb0 + 0.05 && q.y < 1.45) {
        const k = q.side > 0 ? 'door' : 'doorR';
        if (q.z > -0.22 && q.z < 0.64 && q.y > 1.1) return { key: k + 'Glass', grp: k, inset: 0.028 };
        return { key: k, inset: 0.008, inner: true };
      }
      if (sideF && q.z > -1.3 && q.z < -0.4 && q.y > 1.1 && q.y < 1.42) return { key: 'glass', grp: 'body', inset: 0.028 };
      if (q.top && !sideF && q.z > 0.32 && q.z < 0.98 && Math.abs(q.nx) < 0.72) return { key: 'glass', grp: 'body', inset: 0.032 };
      if (q.top && !sideF && q.z > -1.74 && q.z < -1.44 && Math.abs(q.nx) < 0.72) return { key: 'glass', grp: 'body', inset: 0.03 };
      if (q.top && q.z > 1.12 && q.z < 1.15 && q.y > 0.8) return { key: 'body', inset: 0.014 };
      return { key: 'body', inner: q.z > -1.5 && q.z < 0.9 };
    } }, { body: P.body, inner: P.inner, glass: P.glass, doorRGlass: P.glass, ...doorPaints(P, doorL, [-hw, 0, -0.76]) });
  p.param('doors', opts.doors ?? 0, (v) => { doorL.rotation.y = -v * 1.15; });
  interior(p, P, { hw, zSeat: -0.12, zDash: 0.8, yFloor: yb0, yDash: 0.94 });
  p.soft([hw * 2 - 0.3, 0.55, 0.2], { at: [0, 0.86, -0.95], rot: [-0.15, 0, 0], paint: P.seat, r: 0.08 });
  for (const a of [arF, arR]) p.soft([xw * 2 - tw - 0.06, 0.4, a.r * 2 + 0.12], { at: [0, 0.54, a.z], paint: P.trim, r: 0.1 });
  p.soft([1.1, 0.18, zF - zB - 0.5], { at: [0, 0.32, (zF + zB) / 2], paint: P.trim, r: 0.07 });
  // front / rear details
  p.soft([0.92, 0.2, 0.1], { at: [0, 0.6, zF - 0.03], paint: P.trim, r: 0.045 });
  for (const sx of [1, -1]) {
    p.soft([0.34, 0.16, 0.12], { at: [sx * 0.66, 0.76, zF - 0.07], paint: P.trim, r: 0.05 }); p.soft([0.28, 0.11, 0.05], { at: [sx * 0.66, 0.77, zF - 0.0], paint: P.glowW, r: 0.03 });
    lamp(p, [sx * 0.66, 0.86, zB + 0.04], [0.22, 0.1], P.glowR, P.trim, -1);
    flare(p, arF, sx * (hw + 0.0), P.body, 0.1);
    flare(p, arR, sx * (hw - 0.02), P.body, 0.1);
    p.soft([0.07, 0.15, 0.18], { at: [sx * (hw + 0.1), 1.1, 0.72], paint: P.trim, r: 0.03 });
    p.soft([0.14, 0.05, 0.05], { at: [sx * (hw + 0.04), 1.05, 0.75], paint: P.trim, r: 0.02 });
    p.soft([0.1, 0.13, 1.56], { at: [sx * (hw + 0.0), yb0 + 0.07, 0.0], paint: P.trim, r: 0.045 });
  }
  p.soft([1.74, 0.18, 0.18], { at: [0, 0.42, zF + 0.0], paint: P.trim, r: 0.07 });
  p.soft([1.74, 0.18, 0.18], { at: [0, 0.42, zB - 0.02], paint: P.trim, r: 0.07 });
  p.soft([0.4, 0.13, 0.04], { at: [0, 0.62, zB - 0.02], paint: p.paint('paint', { color: '#e8e2cf', chip: 0.3, splat: 0 }), r: 0.015 });
  const wh = wheels(p, { R, w: tw, x: xw, zf, zr, P });
  drive(p, wh, R, opts);
  // roof rails
  for (const sx of [1, -1]) p.rtube([[sx * 0.66, 1.49, 0.2], [sx * 0.68, 1.62, 0.04], [sx * 0.68, 1.62, -1.25], [sx * 0.66, 1.49, -1.4]], 0.04, { paint: P.dark });
  for (const z of [-0.2, -1.1]) p.rtube([[-0.68, 1.62, z], [0.68, 1.62, z]], 0.035, { paint: P.dark, smooth: false, caps: false });

  if (opts.gun !== false) { // barrel + machine gun on a tripod
    const bp = p.paint('wood', { color: '#7a4b38', under: '#a87a5e', splat: (opts.blood ?? 0.55) * 0.3 });
    const br = 0.31;
    p.lathe([[0, -0.52], [br * 0.86, -0.52], [br * 0.94, -0.46], [br, -0.2], [br * 1.03, 0], [br, 0.2], [br * 0.94, 0.46], [br * 0.86, 0.52], [0, 0.52]],
      { seg: 16, at: [0.12, 1.64 + br, -1.0], rot: [PI / 2, 0, 0], paint: bp });
    for (const z of [-1.36, -0.64]) p.torus(br * 0.98, 0.032, { at: [0.12, 1.64 + br, z], rot: [PI / 2, 0, 0], seg: 16, tube: 5, paint: P.dark });
    p.cyl(br * 0.8, 0.03, { at: [0.12, 1.64 + br, -0.48], rot: [PI / 2, 0, 0], paint: p.paint('metal', { color: '#b8bcbe' }), seg: 16 });
    for (const z of [-0.82, -1.18]) p.soft([0.72, 0.04, 0.08], { at: [0.12, 1.64 + br * 2 + 0.01, z], paint: P.trim, r: 0.018 });
    const gy = 1.62, gz = 0.0, top = [-0.05, gy + 0.55, gz];
    for (let k = 0; k < 3; k++) { const a = (k / 3) * PI * 2 + 0.4; p.rtube([[top[0] + Math.sin(a) * 0.38, gy, gz + Math.cos(a) * 0.38], top], 0.03, { paint: P.dark, smooth: false }); }
    const gun = p.paint('steel', { color: '#3c3f44', under: '#7a8086', chip: 0.2 });
    p.soft([0.16, 0.2, 0.52], { at: [top[0], top[1] + 0.11, gz + 0.05], paint: gun, r: 0.04 });
    p.cyl(0.055, 0.5, { at: [top[0], top[1] + 0.13, gz + 0.56], rot: [PI / 2, 0, 0], paint: gun, seg: 10, bevel: 0.015 });
    p.cyl(0.035, 0.24, { at: [top[0], top[1] + 0.13, gz + 0.9], rot: [PI / 2, 0, 0], paint: gun, seg: 8, bevel: 0.01 });
    p.soft([0.18, 0.15, 0.18], { at: [top[0] + 0.14, top[1] + 0.07, gz + 0.05], paint: p.paint('paint', { color: '#4e5a3a', chip: 0.3 }), r: 0.035 });
    p.soft([0.07, 0.14, 0.16], { at: [top[0], top[1] + 0.07, gz - 0.25], rot: [0.3, 0, 0], paint: P.wood, r: 0.025 });
    p.soft([0.2, 0.12, 0.12], { at: [top[0], top[1] + 0.27, gz + 0.1], paint: gun, r: 0.04 });
  }
  if (armor) {
    // slatted windscreen armour: 2 posts + 4 fat slats
    const wA = [1.04, 0.98], wB = [0.24, 1.5];
    for (const x of [-0.78, 0.78]) { const L = onLine(wA, wB, 0.5, 0.06); p.soft([0.09, 0.96, 0.07], { at: [x, L.y, L.z], rot: [L.th, 0, 0], paint: P.dark, r: 0.03 }); }
    for (let i = 0; i < 4; i++) { const L = onLine(wA, wB, 0.16 + i * 0.22, 0.11); p.soft([1.66, 0.13, 0.05], { at: [0, L.y, L.z], rot: [L.th, 0, p.range(-0.03, 0.03)], paint: P.plate, r: 0.022 }); }
    // side window crossbars (round)
    for (const sx of [1, -1]) {
      const x = sx * (hw - 0.05);
      p.rtube([[x, 1.1, -1.32], [x, 1.42, -0.42]], 0.026, { paint: P.dark, smooth: false });
      p.rtube([[x, 1.42, -1.32], [x, 1.1, -0.42]], 0.026, { paint: P.dark, smooth: false });
    }
    // mesh hood guard: round frame + coarse diagonal lattice
    const hz = 1.64, hy = 1.12, tilt = -0.9, gw = 1.55, gh = 0.66;
    const G = new THREE.Matrix4().makeRotationX(tilt).setPosition(0, hy, hz);
    const at = (x, y, z = 0) => new THREE.Vector3(x, y, z).applyMatrix4(G).toArray();
    p.rtube([at(-gw / 2, -gh / 2), at(-gw / 2, gh / 2), at(gw / 2, gh / 2), at(gw / 2, -gh / 2), at(-gw / 2, -gh / 2)], 0.04, { paint: P.dark, smooth: false, caps: false });
    for (let i = -4; i <= 4; i++) for (const s of [1, -1]) {
      const x0 = i * 0.2 - s * gh * 0.5, x1 = i * 0.2 + s * gh * 0.5;
      const cx0 = Math.max(-gw / 2, Math.min(gw / 2, x0)), cx1 = Math.max(-gw / 2, Math.min(gw / 2, x1));
      const y0 = -gh / 2 + (cx0 - x0) * s, y1 = gh / 2 - (x1 - cx1) * s;
      if (Math.abs(cx1 - cx0) < 0.05) continue;
      p.tube([at(cx0, y0, 0.01), at(cx1, y1, 0.01)], 0.016, { paint: P.steel, seg: 5, smooth: false });
    }
    for (const sx of [1, -1]) p.rtube([[sx * 0.72, 0.96, 1.46], [sx * 0.72, 1.32, 1.42]], 0.035, { paint: P.dark, smooth: false });
    // front tube bumper + two big spiked plates
    p.rtube([[-0.86, 0.76, 2.06], [-0.8, 0.79, 2.24], [0.8, 0.79, 2.24], [0.86, 0.76, 2.06]], 0.06, { paint: P.dark });
    for (const sx of [1, -1]) {
      p.soft([0.76, 0.5, 0.11], { at: [sx * 0.45, 0.43, 2.25], rot: [-0.12, sx * -0.12, 0], paint: P.dark, r: 0.04, bulge: 0.015 });
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++)
        spike(p, [sx * (0.22 + c * 0.23), 0.32 + r * 0.22, 2.29 - c * 0.03], [sx * 0.15, 0.05, 1], 0.15, 0.065, P.steel);
    }
    // rear tube bumper + winch
    p.rtube([[-0.86, 0.5, -2.0], [-0.8, 0.53, -2.14], [0.8, 0.53, -2.14], [0.86, 0.5, -2.0]], 0.055, { paint: P.dark });
    p.soft([0.52, 0.24, 0.2], { at: [0, 0.62, -2.13], paint: P.dark, r: 0.06 });
    p.cyl(0.09, 0.34, { at: [0, 0.62, -2.24], rot: [0, 0, PI / 2], paint: P.steel, seg: 12, bevel: 0.02 });
    for (const sx of [1, -1]) p.cyl(0.115, 0.04, { at: [sx * 0.18, 0.62, -2.24], rot: [0, 0, PI / 2], paint: P.dark, seg: 12, bevel: 0.012 });
    p.soft([0.1, 0.08, 0.14], { at: [0, 0.53, -2.35], paint: P.steel, r: 0.025 });
  }
  return p.done();
}

export const PROPS = [
  { id: 'pickup', name: 'Xe bán tải bọc thép', build: pickup, yaw: 0.66, backYaw: 3.95,
    variants: [
      { label: 'xanh nhạt', seed: 1, opts: {} },
      { label: 'đỏ trơn', seed: 2, opts: { color: '#c4473a', armor: 0, blood: 0, wear: 0.4 } },
      { label: 'ô-liu mở cửa', seed: 3, opts: { color: '#7d8a4a', doors: 1, blood: 0.5, wear: 0.9 } }] },
  { id: 'van', name: 'Xe van bọc thép', build: van, yaw: 0.62, backYaw: 3.95, sheetOpts: { doors: 1 },
    variants: [
      { label: 'xám', seed: 1, opts: {} },
      { label: 'mở cửa', seed: 1, opts: { doors: 1 } },
      { label: 'be trơn', seed: 2, opts: { color: '#c9b98f', armor: 0, rack: false, blood: 0, wear: 0.4 } }] },
  { id: 'hatchback', name: 'Hatchback súng máy', build: hatchback, yaw: 0.46, backYaw: 3.9,
    variants: [
      { label: 'xanh lá', seed: 1, opts: {} },
      { label: 'cam trơn', seed: 2, opts: { color: '#e07a2a', armor: 0, gun: false, blood: 0, wear: 0.4 } },
      { label: 'vàng mở cửa', seed: 3, opts: { color: '#e2c23a', doors: 1, blood: 0.5, wear: 0.9 } }] },
];
