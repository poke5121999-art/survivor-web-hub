// Ported verbatim from games/robot-loc-coc/twt/robo-geo.js (origin/main, Xưởng Robot Lóc Cóc, same owner); only the three.js import path changed.
// Hard-surface primitives for the bot parts. Every geometry carries position, normal and aReg (palette slot, see
// mat.js R). Parts are built from several primitives, each tagged with a region, then merged into one geometry per
// part so a robot is a modest number of draw calls.
import * as THREE from '../../vendor/three.module.min.js';

// Copied from ../js/geo.js for the twt crowd kit (relative three import, global detail factor D for segment counts).
let D = 1; export function setDetail(d) { D = d; } export const detail = () => D;
const S = (n, min = 5) => Math.max(min, Math.round(n * D));
// palette slots understood by the bot material
export const R = { A: 0, B: 1, DARK: 2, CHROME: 3, SCREEN: 4, LENS: 5, GLOW: 6, RUBBER: 7, WHITE: 8, DECAL: 9, C: 10 };

// strip a three geometry to position / normal (indexed) and tag it
export function tag(g, reg) {
  if (!g.index) { const n = g.attributes.position.count, idx = []; for (let i = 0; i < n; i++) idx.push(i); g.setIndex(idx); }
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'aReg') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.aReg) { const n = g.attributes.position.count; g.setAttribute('aReg', new THREE.BufferAttribute(new Float32Array(n).fill(reg), 1)); }
  return g;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
// place a geometry: position [x,y,z], euler [rx,ry,rz], scale number|[sx,sy,sz]
export function place(g, p = [0, 0, 0], r = [0, 0, 0], s = 1) {
  _q.setFromEuler(_e.set(r[0], r[1], r[2])); _s.set(...(typeof s === 'number' ? [s, s, s] : s));
  g.applyMatrix4(_m.compose(_v.set(p[0], p[1], p[2]), _q, _s)); return g;
}
// merge tagged geometries (indexed, same attributes) into one
export function merge(list) {
  let nv = 0, ni = 0; for (const g of list) { nv += g.attributes.position.count; ni += g.index.count; }
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), G = new Float32Array(nv), I = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let ov = 0, oi = 0;
  for (const g of list) {
    const n = g.attributes.position.count; P.set(g.attributes.position.array, ov * 3); N.set(g.attributes.normal.array, ov * 3); G.set(g.attributes.aReg.array, ov);
    const ix = g.index.array; for (let i = 0; i < ix.length; i++) I[oi + i] = ix[i] + ov; ov += n; oi += ix.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('aReg', new THREE.BufferAttribute(G, 1));
  g.setIndex(new THREE.BufferAttribute(I, 1)); g.computeBoundingSphere(); g.computeBoundingBox(); return g;
}

// rounded box, half extents from w,h,d, corner radius r, s segments per corner arc
export function rbox(w, h, d, r, reg = R.A, s = 3) {
  s = r < 0.013 ? 1 : Math.max(1, Math.round(s * Math.min(1, D + 0.15))); // tiny bevels: one segment is enough at crowd distance
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const N = 2 * s + 1, g = new THREE.BoxGeometry(2, 2, 2, N, N, N), p = g.attributes.position, nrm = g.attributes.normal, H = [w / 2, h / 2, d / 2];
  const remap = (u, half) => { const k = Math.round((u + 1) / 2 * N); if (k <= s) return -half + r * k / s; if (k >= N - s) return half - r * (N - k) / s; return 0; };
  const v = [0, 0, 0], inn = [0, 0, 0];
  for (let i = 0; i < p.count; i++) {
    const u = [p.getX(i), p.getY(i), p.getZ(i)];
    for (let a = 0; a < 3; a++) { const k = Math.round((u[a] + 1) / 2 * N); v[a] = (k > s && k < N - s) ? (u[a] * H[a]) : remap(u[a], H[a]); const lim = H[a] - r; inn[a] = Math.max(-lim, Math.min(lim, v[a])); }
    let dx = v[0] - inn[0], dy = v[1] - inn[1], dz = v[2] - inn[2]; const L = Math.hypot(dx, dy, dz);
    if (L > 1e-7) { dx /= L; dy /= L; dz /= L; p.setXYZ(i, inn[0] + dx * r, inn[1] + dy * r, inn[2] + dz * r); nrm.setXYZ(i, dx, dy, dz); }
    else { p.setXYZ(i, v[0], v[1], v[2]); }
  }
  return tag(g, reg);
}

// fillet a 2D polyline: pts [[x,y,radius]], radius 0 = sharp. Returns [[x,y,reg]]
export function fillet(pts, seg = 4) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, y, r, reg] = pts[i];
    if (!r || i === 0 || i === pts.length - 1) { out.push([x, y, reg]); continue; }
    const a = pts[i - 1], b = pts[i + 1];
    let ux = a[0] - x, uy = a[1] - y, vx = b[0] - x, vy = b[1] - y; const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy); ux /= lu; uy /= lu; vx /= lv; vy /= lv;
    const ang = Math.acos(Math.max(-1, Math.min(1, ux * vx + uy * vy))), t = Math.min(r / Math.tan(ang / 2), lu * 0.49, lv * 0.49);
    const p0 = [x + ux * t, y + uy * t], p1 = [x + vx * t, y + vy * t];
    for (let k = 0; k <= seg; k++) { const f = k / seg, q0 = [p0[0] + (x - p0[0]) * f, p0[1] + (y - p0[1]) * f], q1 = [x + (p1[0] - x) * f, y + (p1[1] - y) * f]; out.push([q0[0] + (q1[0] - q0[0]) * f, q0[1] + (q1[1] - q0[1]) * f, reg]); }
  }
  return out;
}
// own lathe: profile [[r, y, reg]] bottom->top, segs around, elliptic cross-section (sx, sz). Points with a
// different reg than the previous one are duplicated so colour bands are crisp. Smooth normals along the profile.
export function lathe(prof, segs = 32, sx = 1, sz = 1, defReg = R.A) {
  segs = S(segs, 6);
  const pts = [];
  for (let i = 0; i < prof.length; i++) { const p = prof[i], reg = p[2] === undefined ? defReg : p[2]; if (i > 0 && reg !== pts[pts.length - 1][2]) pts.push([p[0], p[1], reg, true]); else pts.push([p[0], p[1], reg]); }
  // where a reg changes, the new point starts the new band: insert a copy of the point carrying the old reg first
  const P2 = [];
  for (let i = 0; i < pts.length; i++) { const p = pts[i]; if (p[3]) P2.push([p[0], p[1], pts[i - 1][2]]); P2.push([p[0], p[1], p[2]]); }
  const np = P2.length, nrm2 = [];
  for (let j = 0; j < np; j++) {
    let a = j - 1; while (a >= 0 && Math.hypot(P2[a][0] - P2[j][0], P2[a][1] - P2[j][1]) < 1e-6) a--;
    let b = j + 1; while (b < np && Math.hypot(P2[b][0] - P2[j][0], P2[b][1] - P2[j][1]) < 1e-6) b++;
    const A = a >= 0 ? P2[a] : P2[j], B = b < np ? P2[b] : P2[j]; let tx = B[0] - A[0], ty = B[1] - A[1]; const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
    nrm2.push([ty, -tx]);
  }
  const pos = [], nor = [], reg = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const th = i / segs * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
    for (let j = 0; j < np; j++) {
      const [r, y, rg] = P2[j], [nr, ny] = nrm2[j];
      pos.push(r * s * sx, y, r * c * sz); let nx = nr * s / sx, nz = nr * c / sz; const L = Math.hypot(nx, ny, nz) || 1; nor.push(nx / L, ny / L, nz / L); reg.push(rg);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < np - 1; j++) {
    const a = i * np + j, b = (i + 1) * np + j, c = b + 1, d = a + 1;
    if (Math.hypot(P2[j][0] - P2[j + 1][0], P2[j][1] - P2[j + 1][1]) < 1e-7) continue;
    idx.push(a, b, d, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('aReg', new THREE.Float32BufferAttribute(reg, 1));
  g.setIndex(idx); return g;
}
export const cyl = (r0, r1, h, reg, seg = 20) => tag(new THREE.CylinderGeometry(r1, r0, h, S(seg), 1), reg); // r0 bottom
export const sph = (r, reg, ws = 18, hs = 12) => tag(new THREE.SphereGeometry(r, S(ws, 6), S(hs, 4)), reg);
export const tor = (R0, r, reg, rs = 10, ts = 28, arc = Math.PI * 2) => tag(new THREE.TorusGeometry(R0, r, S(rs, 4), S(ts, 8), arc), reg);
export const cone = (r, h, reg, seg = 20) => tag(new THREE.ConeGeometry(r, h, S(seg)), reg);
export const caps = (r, len, reg, cs = 6, rs = 14) => tag(new THREE.CapsuleGeometry(r, len, S(cs, 2), S(rs, 6)), reg);
// bevelled cylinder via lathe (axis Y, base at y0)
export function bcyl(r, h, bev, reg = R.A, segs = 24, y0 = 0) {
  return lathe(fillet([[0, y0, 0], [r, y0, bev], [r, y0 + h, bev], [0, y0 + h, 0]].map((p) => [...p, reg]), 3), segs);
}
// screw head: little domed cylinder facing +z at p
export function screw(p, r = 0.009, n = [0, 0, 1]) {
  const g = merge([bcyl(r, r * 0.6, r * 0.3, R.CHROME, 10), place(tag(new THREE.BoxGeometry(r * 1.6, r * 0.25, r * 0.3), 0), [0, r * 0.62, 0]).setAttribute('aReg', new THREE.BufferAttribute(new Float32Array(24).fill(R.DARK), 1))]);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...n).normalize());
  g.applyQuaternion(q); g.translate(p[0], p[1], p[2]); return g;
}
// extruded 2D shape (THREE.Shape), depth along +z, bevelled
export function extrude(shape, depth, bev, reg, curve = 6) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: S(curve, 2) });
  g.computeVertexNormals(); return tag(g, reg);
}
// spring coil along +y from 0 to 1 (scaled at runtime), radius rc, wire rw, turns
export function coil(rc, rw, turns = 7, reg = R.CHROME, len = 1) {
  class Helix extends THREE.Curve { getPoint(t, o = new THREE.Vector3()) { const a = t * turns * Math.PI * 2; return o.set(Math.cos(a) * rc, t * len, Math.sin(a) * rc); } }
  return tag(new THREE.TubeGeometry(new Helix(), S(turns * 14, 12), rw, S(5, 3), false), reg);
}
