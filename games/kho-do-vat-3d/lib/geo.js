// Geometry helpers. Every helper returns a BufferGeometry with position + normal
// (indexed or not) and userData.kind / userData.half used by the wear shader:
//   kind 0 = box (half extents), 1 = cylinder along Y (half.x = radius, half.y = half height),
//   2 = generic (per-vertex edge weight in attribute 'aEdgeW', 1 at sharp creases).
import * as THREE from '../vendor/three.module.min.js';

export const Q = { bevelSegs: 1, radial: 1 }; // quality knobs (set by setQuality before building)
export function setGeoQuality(level) { // 0 low, 1 high
  Q.bevelSegs = level > 0 ? 2 : 1;
  Q.radial = level > 0 ? 1 : 0.6;
}
export const radialSegs = (n) => Math.max(5, Math.round(n * Q.radial));

// Chamfered box, 44 triangles: flat faces + one chamfer strip per edge + corner triangles.
// Chamfer vertices carry the neighbouring face normals, so shading rolls softly over the edge.
export function chamferBox(w, h, d, r) {
  const H = [w / 2, h / 2, d / 2], C = H.map((v) => v - r);
  const P = [], N = [], I = [], key = new Map();
  const F = (a, s, sb, sc) => { // face (axis a, sign s), corner signs on the other two axes
    const k = `${a}${s}${sb}${sc}`; if (key.has(k)) return key.get(k);
    const b = (a + 1) % 3, c = (a + 2) % 3, v = [0, 0, 0], n = [0, 0, 0];
    v[a] = s * H[a]; v[b] = sb * C[b]; v[c] = sc * C[c]; n[a] = s;
    P.push(...v); N.push(...n); key.set(k, P.length / 3 - 1); return P.length / 3 - 1;
  };
  const vx = (i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
  const tri = (i0, i1, i2, e) => {
    const A = vx(i0), B = vx(i1), Cc = vx(i2);
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [Cc[0] - A[0], Cc[1] - A[1], Cc[2] - A[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (n[0] * e[0] + n[1] * e[1] + n[2] * e[2] < 0) I.push(i0, i2, i1); else I.push(i0, i1, i2);
  };
  const quad = (q, e) => { tri(q[0], q[1], q[2], e); tri(q[0], q[2], q[3], e); };
  // signs on axis b/c for a vertex of face a given global corner signs g[3]
  const FV = (a, s, g) => F(a, s, g[(a + 1) % 3], g[(a + 2) % 3]);
  for (let a = 0; a < 3; a++) for (const s of [-1, 1]) {
    const e = [0, 0, 0]; e[a] = s; const b = (a + 1) % 3, c = (a + 2) % 3;
    const g = (sb, sc) => { const t = [0, 0, 0]; t[a] = s; t[b] = sb; t[c] = sc; return t; };
    quad([FV(a, s, g(-1, -1)), FV(a, s, g(1, -1)), FV(a, s, g(1, 1)), FV(a, s, g(-1, 1))], e);
  }
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) for (const s of [-1, 1]) for (const t of [-1, 1]) {
    const c = 3 - a - b, e = [0, 0, 0]; e[a] = s; e[b] = t;
    const g = (sc) => { const q = [0, 0, 0]; q[a] = s; q[b] = t; q[c] = sc; return q; };
    quad([FV(a, s, g(-1)), FV(a, s, g(1)), FV(b, t, g(1)), FV(b, t, g(-1))], e);
  }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const g = [sx, sy, sz]; tri(FV(0, sx, g), FV(1, sy, g), FV(2, sz, g), g);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setIndex(I);
  geo.userData = { kind: 0, half: H.slice() };
  return geo;
}

// Bevelled box. segs = 0 (default): cheap chamfer (44 tris); segs >= 1: rounded bevel with
// analytic normals (108 tris for 1, 300 for 2) for big hero pieces.
export function bevelBox(w, h, d, r = 0.02, segs = 0) {
  const hx = w / 2, hy = h / 2, hz = d / 2;
  r = Math.max(0, Math.min(r, hx * 0.98, hy * 0.98, hz * 0.98));
  if (r > 1e-4 && !segs) return chamferBox(w, h, d, r);
  if (r <= 1e-4) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.userData = { kind: 0, half: [hx, hy, hz] };
    return g;
  }
  const n = 2 * segs + 1;
  const g = new THREE.BoxGeometry(1, 1, 1, n, n, n);
  const pos = g.attributes.position, nor = g.attributes.normal;
  const core = [hx - r, hy - r, hz - r];
  const o = new THREE.Vector3(), c = [0, 0, 0];
  for (let i = 0; i < pos.count; i++) {
    const p = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const f = [0, 0, 0];
    for (let a = 0; a < 3; a++) {
      const k = Math.round((p[a] + 0.5) * n); // 0..n
      const s = Math.sign(p[a]) || 1;
      let frac;
      if (k <= segs) frac = (segs - k) / segs;           // toward -extreme
      else if (k >= n - segs) frac = (k - (n - segs)) / segs; // toward +extreme
      else frac = 0;
      f[a] = frac * s;
      c[a] = (frac > 0 ? s : (k - n / 2) / (n / 2 - segs)) * core[a];
      if (frac === 0) c[a] = Math.max(-core[a], Math.min(core[a], c[a]));
    }
    o.set(f[0], f[1], f[2]);
    if (o.lengthSq() < 1e-9) o.set(0, 0, 0); else o.normalize();
    pos.setXYZ(i, c[0] + o.x * r, c[1] + o.y * r, c[2] + o.z * r);
    if (o.lengthSq() > 0) nor.setXYZ(i, o.x, o.y, o.z);
  }
  g.userData = { kind: 0, half: [hx, hy, hz] };
  return g;
}

// Rounded profile corner helper: returns points of a quarter arc.
function arc(cx, cy, r, a0, a1, steps, out) {
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * (i / steps);
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
}

// Bevelled cylinder (optionally tapered: r2 = top radius) built as a lathe.
export function bevelCyl(r, h, { r2 = r, bevel = 0.02, seg = 16, open = false } = {}) {
  const hy = h / 2, b = Math.min(bevel, r * 0.45, r2 * 0.45, hy * 0.9);
  const pts = [];
  const st = Q.bevelSegs;
  if (!open) pts.push([0, -hy]);
  if (b > 1e-4) {
    arc(r - b, -hy + b, b, -Math.PI / 2, 0, st, pts);
    arc(r2 - b, hy - b, b, 0, Math.PI / 2, st, pts);
  } else { pts.push([r, -hy], [r, -hy], [r2, hy], [r2, hy]); }
  if (!open) pts.push([0, hy]);
  const g = lathe(pts, seg);
  g.userData = { kind: 1, half: [Math.max(r, r2), hy, Math.max(r, r2)] };
  return g;
}

// Lathe from [[radius, y], ...]. Optional per-point colours (hex) -> 'color' attribute.
export function lathe(pts, seg = 16, colors = null, phiStart = 0, phiLength = Math.PI * 2) {
  const v = pts.map(([x, y]) => new THREE.Vector2(Math.max(0, x), y));
  const g = new THREE.LatheGeometry(v, radialSegs(seg), phiStart, phiLength);
  if (colors) {
    const col = new Float32Array(g.attributes.position.count * 3);
    const segs = radialSegs(seg), np = pts.length, c = new THREE.Color();
    for (let i = 0; i <= segs; i++) for (let j = 0; j < np; j++) {
      c.set(colors[Math.min(j, colors.length - 1)]);
      const k = (i * np + j) * 3; col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  let mr = 0, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { mr = Math.max(mr, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  g.translate(0, 0, 0);
  g.userData = { kind: 1, half: [mr, (y1 - y0) / 2, mr], yc: (y0 + y1) / 2 };
  return g;
}

// Torus (tyres, rings, handles). Axis = Y.
export function torus(R, r, seg = 18, tube = 8, arcLen = Math.PI * 2) {
  const g = new THREE.TorusGeometry(R, r, Math.max(4, Math.round(tube * Q.radial + 1)), radialSegs(seg), arcLen);
  g.rotateX(Math.PI / 2);
  g.userData = { kind: 1, half: [R + r, r, R + r] };
  return g;
}

// Extrude a 2D polygon (array of [x,y], CCW) along +Z by depth, centred on z.
export function extrude(shapePts, depth, { bevel = 0.015, holes = [], curveSegs = 6 } = {}) {
  const s = new THREE.Shape(shapePts.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  const b = Math.max(0, bevel);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(1e-3, depth - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b * 0.9,
    bevelSegments: Q.bevelSegs, curveSegments: curveSegs,
  });
  g.translate(0, 0, -(depth - 2 * b) / 2);
  const out = creaseNormals(g.index ? g.toNonIndexed() : g, 40);
  out.userData = { kind: 2 };
  return out;
}

// Tube along a polyline / smooth path of [x,y,z] points.
export function tube(points, radius = 0.02, { seg = 6, smooth = true, closed = false, steps = 0 } = {}) {
  const v = points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  let path;
  if (smooth && v.length > 2) path = new THREE.CatmullRomCurve3(v, closed, 'catmullrom', 0.1);
  else {
    path = new THREE.CurvePath();
    for (let i = 0; i < v.length - 1; i++) path.add(new THREE.LineCurve3(v[i], v[i + 1]));
  }
  const n = steps || Math.max(2, (v.length - 1) * (smooth ? 6 : 1));
  const g = new THREE.TubeGeometry(path, n, radius, Math.max(4, Math.round(seg * Q.radial + 1)), closed);
  g.userData = { kind: 2, edgeZero: true };
  return g;
}

// Low-poly sphere / blob.
export function blob(r, detail = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  g.userData = { kind: 2, edgeZero: true };
  return g;
}

// Smooth normals within `angleDeg`, sharp across bigger creases; also writes aEdgeW
// (1 on vertices that sit on a crease) for the wear shader's generic edge mask.
export function creaseNormals(g, angleDeg = 40) {
  const pos = g.attributes.position;
  const cnt = pos.count;
  const cos = Math.cos((angleDeg * Math.PI) / 180);
  const fn = new Float32Array(cnt * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < cnt; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    for (let k = 0; k < 3; k++) { fn[(i + k) * 3] = n.x; fn[(i + k) * 3 + 1] = n.y; fn[(i + k) * 3 + 2] = n.z; }
  }
  const key = (i) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  const map = new Map();
  for (let i = 0; i < cnt; i++) { const k = key(i); let l = map.get(k); if (!l) map.set(k, (l = [])); l.push(i); }
  const nor = new Float32Array(cnt * 3), edge = new Float32Array(cnt);
  for (const list of map.values()) {
    for (const i of list) {
      let x = 0, y = 0, z = 0, crease = 0;
      for (const j of list) {
        const d = fn[i * 3] * fn[j * 3] + fn[i * 3 + 1] * fn[j * 3 + 1] + fn[i * 3 + 2] * fn[j * 3 + 2];
        if (d >= cos) { x += fn[j * 3]; y += fn[j * 3 + 1]; z += fn[j * 3 + 2]; }
        if (d < 0.9) crease = 1;
      }
      const l = Math.hypot(x, y, z) || 1;
      nor[i * 3] = x / l; nor[i * 3 + 1] = y / l; nor[i * 3 + 2] = z / l; edge[i] = crease;
    }
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('aEdgeW', new THREE.BufferAttribute(edge, 1));
  return g;
}

// Smooth value noise in JS (for deforming geometry: dents, wobble, broken edges).
function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const s = (t) => t * t * (3 - 2 * t);
  const u = s(xf), v = s(yf), w = s(zf);
  const L = (a, b, t) => a + (b - a) * t;
  const h = (i, j, k) => hash3(xi + i, yi + j, zi + k);
  return L(L(L(h(0, 0, 0), h(1, 0, 0), u), L(h(0, 1, 0), h(1, 1, 0), u), v),
    L(L(h(0, 0, 1), h(1, 0, 1), u), L(h(0, 1, 1), h(1, 1, 1), u), v), w) * 2 - 1;
}

// Displace vertices by smooth noise (dents / wobble). Keeps shared vertices together.
export function deform(g, amp = 0.01, freq = 6, seed = 0, axisMask = [1, 1, 1]) {
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const s = seed * 13.1;
    pos.setXYZ(i,
      x + noise3(x * freq + s, y * freq, z * freq) * amp * axisMask[0],
      y + noise3(x * freq, y * freq + s + 7, z * freq) * amp * axisMask[1],
      z + noise3(x * freq, y * freq, z * freq + s + 19) * amp * axisMask[2]);
  }
  pos.needsUpdate = true;
  return g;
}

export { THREE };
