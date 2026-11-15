// Reusable sub-assemblies that add pieces to a Prop (p). Each takes (p, opts) and
// returns nothing (or a node). Shared so drums, tyres, straps look the same in every prop.
import * as THREE from '../vendor/three.module.min.js';

// Oil drum (steel, 2 ribs, rolled rims). opts: at, rot, r, h, paint, lid=true, open=false, dent=0, node
export function drum(p, o = {}) {
  const r = o.r ?? 0.29, h = o.h ?? 0.88, paint = o.paint || p.paint('paint', { color: '#2d55c8' });
  const rib = 0.012, y0 = -h / 2;
  const pts = [[0, y0 + 0.02], [r - 0.02, y0 + 0.02], [r + 0.012, y0], [r + 0.016, y0 + 0.02], [r, y0 + 0.04],
    [r, -h / 6 - 0.02], [r + rib, -h / 6], [r, -h / 6 + 0.02], [r, h / 6 - 0.02], [r + rib, h / 6], [r, h / 6 + 0.02],
    [r, h / 2 - 0.04], [r + 0.016, h / 2 - 0.02], [r + 0.012, h / 2]];
  if (o.open) pts.push([r - 0.012, h / 2], [r - 0.012, h / 2 - 0.02], [r - 0.014, y0 + 0.06], [0, y0 + 0.06]);
  else pts.push([r - 0.02, h / 2 - 0.012], [0, h / 2 - 0.012]);
  const g = p.lathe(pts, { seg: o.seg ?? 18, paint, at: o.at || [0, h / 2, 0], rot: o.rot, node: o.node,
    deform: o.dent ? { amp: o.dent, freq: 3.2 } : undefined });
  if (!o.open && o.lid !== false) { // bung caps
    const cap = p.paint('metal', { color: '#9aa1a6' });
    const at = o.at || [0, h / 2, 0];
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...(o.rot || [0, 0, 0])));
    for (const [x, z, rr] of [[r * 0.55, 0, 0.035], [-r * 0.5, r * 0.2, 0.022]]) {
      const v = new THREE.Vector3(x, h / 2 - 0.004, z).applyMatrix4(m).add(new THREE.Vector3(...at));
      p.cyl(rr, 0.018, { at: v.toArray(), rot: o.rot, paint: cap, seg: 8, node: o.node });
    }
  }
  return g;
}

// Tyre lying or standing. opts: at, rot, R (outer radius), w (width), rim=true, rimPaint, node, flat
export function tyre(p, o = {}) {
  const R = o.R ?? 0.33, w = o.w ?? 0.2, ri = o.ri ?? R * 0.58;
  const rub = o.paint || p.paint('rubber');
  const hw = w / 2, b = Math.min(0.05, w * 0.3);
  // lathe profile closed loop (tread with rounded shoulders)
  const pts = [[ri, -hw * 0.8], [ri + 0.02, -hw], [R - b, -hw], [R - b * 0.3, -hw + b * 0.3], [R, -hw + b], [R, hw - b],
    [R - b * 0.3, hw - b * 0.3], [R - b, hw], [ri + 0.02, hw], [ri, hw * 0.8], [ri, -hw * 0.8]];
  const node = o.node;
  p.lathe(pts, { seg: o.seg ?? 20, paint: rub, at: o.at, rot: o.rot, node, deform: o.flat ? { amp: 0.015, freq: 4 } : undefined });
  if (o.rim) {
    const rp = o.rimPaint || p.paint('steel', { color: '#9ca3a8' });
    const rr = ri + 0.005;
    p.lathe([[0, -hw * 0.5], [rr * 0.35, -hw * 0.55], [rr * 0.4, -hw * 0.35], [rr, -hw * 0.6], [rr, hw * 0.6], [rr * 0.4, hw * 0.3], [rr * 0.35, hw * 0.45], [0, hw * 0.4]],
      { seg: o.seg ?? 20, paint: rp, at: o.at, rot: o.rot, node });
  }
}

// Wheel node that rolls: returns a node whose rotation.x spins. Axis along X.
export function wheel(p, o = {}) {
  const n = p.node(o.name || 'wheel', { at: o.at || [0, 0, 0], parent: o.parent });
  p.in(n, () => tyre(p, { R: o.R ?? 0.36, w: o.w ?? 0.24, ri: o.ri, rim: true, rot: [0, 0, Math.PI / 2], rimPaint: o.rimPaint, paint: o.paint }));
  return n;
}

// Flat strap (ratchet strap / rope band) looping around an axis-aligned box.
// opts: size [w,h,d] of the box being wrapped, at (box centre), axis 'x'|'z', t (offset along axis), width, paint
export function strapBox(p, o) {
  const [w, h, d] = o.size, at = o.at || [0, 0, 0], sw = o.width ?? 0.05, th = 0.012;
  const paint = o.paint || p.paint('fabric', { color: '#3a3c40' });
  const t = o.t ?? 0;
  if ((o.axis || 'x') === 'x') { // band runs around in YZ plane at x=t
    p.box([sw, th, d + th * 2], { at: [at[0] + t, at[1] + h / 2 + th / 2, at[2]], paint, bevel: 0.004, node: o.node });
    p.box([sw, h, th], { at: [at[0] + t, at[1], at[2] + d / 2 + th / 2], paint, bevel: 0.004, node: o.node });
    p.box([sw, h, th], { at: [at[0] + t, at[1], at[2] - d / 2 - th / 2], paint, bevel: 0.004, node: o.node });
    if (o.buckle !== false) p.box([sw * 1.5, sw * 1.1, 0.02], { at: [at[0] + t, at[1] + h * 0.1, at[2] + d / 2 + th + 0.008], paint: p.paint('metal'), bevel: 0.005, node: o.node });
  } else {
    p.box([w + th * 2, th, sw], { at: [at[0], at[1] + h / 2 + th / 2, at[2] + t], paint, bevel: 0.004, node: o.node });
    p.box([th, h, sw], { at: [at[0] + w / 2 + th / 2, at[1], at[2] + t], paint, bevel: 0.004, node: o.node });
    p.box([th, h, sw], { at: [at[0] - w / 2 - th / 2, at[1], at[2] + t], paint, bevel: 0.004, node: o.node });
  }
}

// Strap ring around a vertical cylinder (radius r) at height y.
export function strapRing(p, o) {
  p.lathe([[o.r + 0.004, -(o.width ?? 0.05) / 2], [o.r + 0.012, -(o.width ?? 0.05) / 2 + 0.005], [o.r + 0.012, (o.width ?? 0.05) / 2 - 0.005], [o.r + 0.004, (o.width ?? 0.05) / 2]],
    { seg: o.seg ?? 18, paint: o.paint || p.paint('fabric', { color: '#33363a' }), at: o.at, rot: o.rot, node: o.node });
}

// Painted decal plate (thin): shape 'triangle' (warning), 'circle', 'rect', 'diamond'. Faces +Z.
export function decal(p, o) {
  const s = o.size ?? 0.12, col = o.color || '#f2c81e', at = o.at || [0, 0, 0];
  const paint = p.paint('paint', { color: col, chip: o.chip ?? 0.2, rust: 0, dirt: 0.2 });
  const pts = { triangle: [[-s / 2, -s * 0.43], [s / 2, -s * 0.43], [0, s * 0.43]],
    diamond: [[0, -s / 2], [s / 2, 0], [0, s / 2], [-s / 2, 0]],
    rect: [[-s / 2, -s * 0.35], [s / 2, -s * 0.35], [s / 2, s * 0.35], [-s / 2, s * 0.35]] }[o.shape || 'triangle'];
  if (o.shape === 'circle') p.cyl(s / 2, 0.006, { at, rot: [Math.PI / 2 + (o.rot?.[0] || 0), o.rot?.[1] || 0, o.rot?.[2] || 0], paint, bevel: 0.002, seg: 14, node: o.node });
  else p.extrude(pts, 0.006, { at, rot: o.rot, paint, bevel: 0.0015, node: o.node });
  if (o.mark !== false && (o.shape || 'triangle') === 'triangle') { // exclamation mark
    const dark = p.paint('paint', { color: '#1d1d1f', chip: 0 });
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...(o.rot || [0, 0, 0])));
    const off = (x, y) => new THREE.Vector3(x, y, 0.0045).applyMatrix4(m).add(new THREE.Vector3(...at)).toArray();
    p.box([s * 0.08, s * 0.32, 0.004], { at: off(0, s * 0.02), rot: o.rot, paint: dark, bevel: 0.001, node: o.node });
    p.box([s * 0.08, s * 0.08, 0.004], { at: off(0, -s * 0.24), rot: o.rot, paint: dark, bevel: 0.001, node: o.node });
  }
}

// Cinder block (2 holes). opts: at, rot, paint, node
export function cinderBlock(p, o = {}) {
  const paint = o.paint || p.paint('concrete', { color: '#b6b9ba' });
  const W = 0.39, H = 0.19, D = 0.19, t = 0.03;
  const base = o.at || [0, H / 2, 0];
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...(o.rot || [0, 0, 0])));
  const P = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(m).add(new THREE.Vector3(...base)).toArray();
  p.box([W, H, t], { at: P(0, 0, D / 2 - t / 2), rot: o.rot, paint, bevel: 0.01, node: o.node });
  p.box([W, H, t], { at: P(0, 0, -D / 2 + t / 2), rot: o.rot, paint, bevel: 0.01, node: o.node });
  for (const x of [-W / 2 + t / 2, 0, W / 2 - t / 2]) p.box([t + 0.004, H, D - 2 * t + 0.004], { at: P(x, 0, 0), rot: o.rot, paint, bevel: 0.008, node: o.node });
  p.box([W - 0.01, 0.02, D - 0.01], { at: P(0, -H / 2 + 0.01, 0), rot: o.rot, paint, bevel: 0.006, node: o.node });
}

// Wooden plank with rough ends. opts: size [l,t,w] (length along X), at, rot, paint, broken (0..1)
export function plank(p, o = {}) {
  const [l, t, w] = o.size || [1.0, 0.025, 0.12];
  const paint = o.paint || p.paint('wood');
  if (!o.broken) return p.box([l, t, w], { at: o.at, rot: o.rot, paint, bevel: Math.min(t * 0.3, 0.008), node: o.node });
  // broken: jagged end extruded through thickness
  const hl = l / 2, hw = w / 2, j = [];
  j.push([-hl, -hw], [hl * 0.7, -hw]);
  const n = 4; for (let i = 1; i < n; i++) j.push([hl * (0.7 + 0.3 * ((i % 2) ? 1 : 0.4) * (0.6 + p.r() * 0.4)), -hw + (w * i) / n]);
  j.push([hl * 0.85, hw], [-hl, hw]);
  // extrude lies in XY; turn it flat (local +90° X) and then apply the caller's rotation
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(o.rot || [0, 0, 0])))
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return p.extrude(j, t, { at: o.at, rot: [e.x, e.y, e.z], paint, bevel: 0.004, node: o.node });
}

// U-shaped lifting loop / handle (rebar). opts: at, rot, w, h, r, paint
export function loop(p, o = {}) {
  const w = o.w ?? 0.12, h = o.h ?? 0.08, r = o.r ?? 0.012;
  return p.tube([[-w / 2, 0, 0], [-w / 2, h * 0.75, 0], [-w * 0.3, h, 0], [w * 0.3, h, 0], [w / 2, h * 0.75, 0], [w / 2, 0, 0]], r,
    { at: o.at, rot: o.rot, paint: o.paint || p.paint('metal', { color: '#6c7176' }), seg: 6, node: o.node });
}

// Rebar spikes poking out of a broken face. opts: at (centre of face), count, len, spread, dir [x,y,z]
export function rebar(p, o = {}) {
  const paint = p.paint('rusty', { color: '#6b4a36', rust: 0.7 });
  const at = o.at || [0, 0, 0], dir = new THREE.Vector3(...(o.dir || [1, 0, 0])).normalize();
  for (let i = 0; i < (o.count ?? 4); i++) {
    const off = new THREE.Vector3((p.r() - 0.5) * (o.spread ?? 0.3), (p.r() - 0.5) * (o.spread ?? 0.3), (p.r() - 0.5) * (o.spread ?? 0.3));
    off.sub(dir.clone().multiplyScalar(off.dot(dir)));
    const s = new THREE.Vector3(...at).add(off);
    const len = (o.len ?? 0.18) * (0.6 + p.r() * 0.8);
    const bend = new THREE.Vector3((p.r() - 0.5) * 0.1, (p.r() - 0.4) * 0.1, (p.r() - 0.5) * 0.1);
    const mid = s.clone().add(dir.clone().multiplyScalar(len * 0.6));
    const e = s.clone().add(dir.clone().multiplyScalar(len)).add(bend);
    p.tube([s.clone().sub(dir.clone().multiplyScalar(0.05)).toArray(), mid.toArray(), e.toArray()], 0.008, { paint, seg: 5, smooth: false, node: o.node });
  }
}
