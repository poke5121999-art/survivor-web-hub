// Soft (toy-like) shapes for the chunky look of the concept sheets: big rounded bevels,
// puffy faces, superellipse-section lofts with inset windows / grooves / cut doors.
import * as THREE from '../vendor/three.module.min.js';
import { Q, radialSegs } from './geo.js';

// Rounded box with bevel radius r and optional face bulge (metres the flat faces bow outward).
// segs = arc steps per rounded edge, mid = subdivisions across each flat face (bulge needs >= 2).
export function softBox(w, h, d, r = 0.05, { segs = 3, mid = 2, bulge = 0 } = {}) {
  const hx = w / 2, hy = h / 2, hz = d / 2;
  r = Math.max(1e-3, Math.min(r, hx * 0.98, hy * 0.98, hz * 0.98));
  if (Q.bevelSegs < 2) { segs = Math.max(1, Math.ceil(segs / 2)); mid = Math.max(1, Math.ceil(mid / 2)); }
  const n = 2 * segs + mid;
  const g = new THREE.BoxGeometry(1, 1, 1, n, n, n);
  const pos = g.attributes.position, nor = g.attributes.normal;
  const core = [hx - r, hy - r, hz - r];
  const o = new THREE.Vector3(), c = [0, 0, 0], f = [0, 0, 0], u = [0, 0, 0];
  for (let i = 0; i < pos.count; i++) {
    const p = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const fn = [nor.getX(i), nor.getY(i), nor.getZ(i)];
    const fa = Math.abs(fn[0]) > 0.5 ? 0 : Math.abs(fn[1]) > 0.5 ? 1 : 2;
    for (let a = 0; a < 3; a++) {
      const k = Math.round((p[a] + 0.5) * n), s = Math.sign(p[a]) || 1;
      let frac = 0;
      if (k <= segs) frac = (segs - k) / segs; else if (k >= n - segs) frac = (k - (n - segs)) / segs;
      f[a] = frac * s;
      u[a] = frac > 0 ? s : (k - n / 2) / (n / 2 - segs);
      c[a] = u[a] * core[a];
    }
    o.set(f[0], f[1], f[2]);
    const flat = o.lengthSq() < 1e-9;
    if (!flat) o.normalize();
    const P = [c[0] + o.x * r, c[1] + o.y * r, c[2] + o.z * r];
    let N = flat ? fn.slice() : [o.x, o.y, o.z];
    if (bulge && flat) { // offset = bulge * (1-u_b^2)(1-u_c^2) along the face axis
      const b = (fa + 1) % 3, cc = (fa + 2) % 3, s = Math.sign(fn[fa]);
      const gb = 1 - u[b] * u[b], gc = 1 - u[cc] * u[cc];
      P[fa] += s * bulge * gb * gc;
      N = [0, 0, 0]; N[fa] = s;
      N[b] = (bulge * 2 * u[b] / Math.max(core[b], 1e-3)) * gc;
      N[cc] = (bulge * 2 * u[cc] / Math.max(core[cc], 1e-3)) * gb;
      const l = Math.hypot(N[0], N[1], N[2]); N = N.map((v) => v / l);
    }
    pos.setXYZ(i, P[0], P[1], P[2]); nor.setXYZ(i, N[0], N[1], N[2]);
  }
  g.userData = { kind: 0, half: [hx, hy, hz] };
  return g;
}

export function sphere(r, seg = 10) {
  const s = radialSegs(seg);
  const g = new THREE.SphereGeometry(r, s, Math.max(3, Math.round(s / 2)));
  g.userData = { kind: 2, edgeZero: true };
  return g;
}

// Angle on a superellipse (exponent n) where the normalised x (upper half) or y (right half) equals v.
export const thetaX = (v, n = 3) => Math.acos(Math.pow(Math.min(1, Math.max(0, v)), n / 2));
export const thetaY = (v, n = 3) => Math.asin(Math.pow(Math.min(1, Math.max(0, v)), n / 2));

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Superellipse-section shell lofted along Z (car bodies, tubs, hulls).
// stations: [{ z, hw, yb, yt, x?, belt?, gh? }] in ascending z. Section at a station:
//   x = x0 + hw * sgn(c)|c|^(2/n) * (1 - gh * smoothstep(belt, belt + beltW, y))   (gh = greenhouse tuck)
//   y = (yb+yt)/2 + (yt-yb)/2 * sgn(s)|s|^(2/nY),  nY = nT (upper half) / nB (lower half)
// o.region(q) -> null (hole) | { key, inset = 0, inner = false } per quad; q = { i, j, z, x, y, nx, ny, side, top }
//   (x, y, z = quad centre, nx / ny = normalised section coords). Quads with a different key get a wall
//   `thick` deep (door cut, hole rim); same key but deeper inset gets a step wall (window, groove);
//   inner: true also emits the inside face as key + ':in'. grp (default = key) groups keys for walls:
//   a window { key: 'glass', grp: 'body', inset } only gets the soft step wall from its host, no deep rim.
// o.cap0 / o.cap1: key for the rear / front end cap, null = open end (rim wall when inner).
// o.extraT: extra ring angles (radians, first quadrant; mirrored to all four).
// Returns Map key -> BufferGeometry (non-indexed, smooth normals, aEdgeW = curvature for the chip mask).
export function shellLoft(stations, o = {}) {
  const n = o.n ?? 3, nT = o.nT ?? n, nB = o.nB ?? n, thick = o.thick ?? 0.05;
  const beltW = o.beltW ?? 0.25;
  const sec = (th) => { const c = Math.cos(th), s = Math.sin(th);
    return [Math.sign(c) * Math.pow(Math.abs(c), 2 / n), Math.sign(s) * Math.pow(Math.abs(s), 2 / (s >= 0 ? nT : nB))]; };
  // ring angles: uniform arc length on a reference section (aspect 1 : 0.7) + extra angles
  let R = Math.max(10, Math.round((o.ring ?? 32) * (Q.radial < 1 ? 0.6 : 1)));
  const ref = [], M = 720; let L = 0;
  for (let k = 0; k <= M; k++) {
    const t = (k / M) * Math.PI * 2, [x, y] = sec(t), p = [x, y * 0.7];
    if (k) L += Math.hypot(p[0] - ref[k - 1][1][0], p[1] - ref[k - 1][1][1]);
    ref.push([t, p, L]);
  }
  let th = [];
  for (let j = 0; j < R; j++) {
    const t = (j / R) * L; let k = 1; while (k < M && ref[k][2] < t) k++;
    const a = ref[k - 1], b = ref[k]; th.push(a[0] + (b[0] - a[0]) * ((t - a[2]) / Math.max(1e-9, b[2] - a[2])));
  }
  for (const e of o.extraT || []) for (const v of [e, Math.PI - e, Math.PI + e, 2 * Math.PI - e]) th.push(((v % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
  th.sort((a, b) => a - b);
  th = th.filter((v, i) => i === 0 || v - th[i - 1] > 0.003);
  R = th.length;
  const S = stations.length;
  const V = [], UX = [], UY = [];
  for (let i = 0; i < S; i++) {
    const st = stations[i], yc = (st.yb + st.yt) / 2, hh = (st.yt - st.yb) / 2, row = [], rx = [], ry = [];
    const belt = st.belt ?? o.belt ?? 1e9, g = st.gh ?? o.gh ?? 0;
    if (o.rect) { // rounded-rectangle section (fixed corner radii) with puffy sides / top
      for (const [x, y, ux, uy] of rrectRing(st, o)) { row.push(new THREE.Vector3(x, y, st.z)); rx.push(ux); ry.push(uy); }
      R = row.length;
    } else for (let j = 0; j < R; j++) {
      const [ux, uy] = sec(th[j]);
      const y = yc + hh * uy;
      const x = (st.x ?? 0) + st.hw * ux * (1 - g * smooth(belt, belt + beltW, y));
      row.push(new THREE.Vector3(x, y, st.z)); rx.push(ux); ry.push(uy);
    }
    V.push(row); UX.push(rx); UY.push(ry);
  }
  // smooth vertex normals from the neighbouring quad faces (area weighted; degenerate quads add nothing)
  const N = V.map((row) => row.map(() => new THREE.Vector3()));
  const t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), fv = new THREE.Vector3();
  for (let i = 0; i < S - 1; i++) for (let j = 0; j < R; j++) {
    const j1 = (j + 1) % R;
    t1.subVectors(V[i + 1][j1], V[i][j]); t2.subVectors(V[i][j1], V[i + 1][j]);
    fv.crossVectors(t1, t2);
    for (const [a, b] of [[i, j], [i + 1, j], [i, j1], [i + 1, j1]]) N[a][b].add(fv);
  }
  // make sure normals point outward (away from the section centre)
  for (let i = 0; i < S; i++) {
    const st = stations[i], cx = st.x ?? 0, cy = (st.yb + st.yt) / 2;
    for (let j = 0; j < R; j++) {
      const v = N[i][j];
      if (v.lengthSq() < 1e-14) v.set(UX[i][j], UY[i][j], 0);
      v.normalize();
    }
    // orientation check on the widest ring point
    const p = V[i][0], v = N[i][0];
    if ((p.x - cx) * v.x + (p.y - cy) * v.y < 0) for (const w of N[i]) w.negate();
  }
  const out = new Map();
  const bucket = (k) => { if (!out.has(k)) out.set(k, { p: [], n: [], e: [] }); return out.get(k); };
  const curv = (i, j) => { const a = N[i][(j + R - 1) % R], b = N[i][(j + 1) % R]; return Math.min(0.8, Math.max(0, (1 - a.dot(b)) * 1.2)); };
  const put = (B, P, Nn, E) => { B.p.push(P.x, P.y, P.z); B.n.push(Nn.x, Nn.y, Nn.z); B.e.push(E); };
  const off = (i, j, d) => V[i][j].clone().addScaledVector(N[i][j], -d);
  const Qd = [];
  for (let i = 0; i < S - 1; i++) {
    const row = [];
    for (let j = 0; j < R; j++) {
      const j1 = (j + 1) % R;
      const c = V[i][j].clone().add(V[i + 1][j]).add(V[i][j1]).add(V[i + 1][j1]).multiplyScalar(0.25);
      const nx = (UX[i][j] + UX[i][j1]) / 2, ny = (UY[i][j] + UY[i][j1]) / 2;
      const r = o.region ? o.region({ i, j, z: c.z, x: c.x, y: c.y, nx, ny, side: nx >= 0 ? 1 : -1, top: ny > 0 }) : { key: 'body' };
      row.push(r === undefined ? { key: 'body', inset: 0 } : r && { inset: 0, ...r });
    }
    Qd.push(row);
  }
  // outward triangle order for (i,j) (i+1,j) (i+1,j1) (i,j1): check against the normal once
  const sideSign = (() => {
    const i = Math.floor(S / 2) - 1 >= 0 ? Math.floor(S / 2) - 1 : 0, j = Math.floor(R / 8);
    const a = V[i][j], b = V[i + 1][j], c = V[i + 1][(j + 1) % R];
    const fn = new THREE.Vector3().subVectors(c, a).cross(new THREE.Vector3().subVectors(b, a));
    return fn.dot(N[i][j]) >= 0 ? 1 : -1;
  })();
  const quad = (B, a, b, c, d, na, nb, nc, nd, ea, eb, ec, ed, inner) => {
    if ((sideSign > 0) !== !!inner) { put(B, a, na, ea); put(B, c, nc, ec); put(B, b, nb, eb); put(B, a, na, ea); put(B, d, nd, ed); put(B, c, nc, ec); }
    else { put(B, a, na, ea); put(B, b, nb, eb); put(B, c, nc, ec); put(B, a, na, ea); put(B, c, nc, ec); put(B, d, nd, ed); }
  };
  const wall = (B, p0, p1, n0, n1, d0, d1, facing) => {
    const A = p0.clone().addScaledVector(n0, -d0), Bv = p1.clone().addScaledVector(n1, -d0);
    const C = p1.clone().addScaledVector(n1, -d1), D = p0.clone().addScaledVector(n0, -d1);
    const fn = new THREE.Vector3().subVectors(Bv, A).cross(new THREE.Vector3().subVectors(C, A));
    if (fn.lengthSq() < 1e-14) return;
    fn.normalize();
    let tri = [A, Bv, C, A, C, D];
    if (fn.dot(facing) < 0) { tri = [A, C, Bv, A, D, C]; fn.negate(); }
    // soften: blend the wall normal with the surface normal at the outer lip
    const lip0 = fn.clone().add(n0).normalize(), lip1 = fn.clone().add(n1).normalize();
    for (const v of tri) put(B, v, v === A ? lip0 : v === Bv ? lip1 : fn, v === A || v === Bv ? 0.55 : 0.1);
  };
  for (let i = 0; i < S - 1; i++) for (let j = 0; j < R; j++) {
    const q = Qd[i][j]; if (!q) continue;
    const j1 = (j + 1) % R, d = q.inset || 0, B = bucket(q.key);
    quad(B, off(i, j, d), off(i + 1, j, d), off(i + 1, j1, d), off(i, j1, d), N[i][j], N[i + 1][j], N[i + 1][j1], N[i][j1],
      curv(i, j), curv(i + 1, j), curv(i + 1, j1), curv(i, j1), false);
    if (q.inner) {
      const BI = bucket(q.key + ':in'), T = d + thick, ng = (v) => v.clone().negate();
      quad(BI, off(i, j, T), off(i + 1, j, T), off(i + 1, j1, T), off(i, j1, T), ng(N[i][j]), ng(N[i + 1][j]), ng(N[i + 1][j1]), ng(N[i][j1]), 0, 0, 0, 0, true);
    }
    const nbs = [
      [i > 0 ? Qd[i - 1][j] : 'end0', V[i][j], V[i][j1], N[i][j], N[i][j1]],
      [i < S - 2 ? Qd[i + 1][j] : 'end1', V[i + 1][j], V[i + 1][j1], N[i + 1][j], N[i + 1][j1]],
      [Qd[i][(j + R - 1) % R], V[i][j], V[i + 1][j], N[i][j], N[i + 1][j]],
      [Qd[i][j1], V[i][j1], V[i + 1][j1], N[i][j1], N[i + 1][j1]]];
    const ctr = V[i][j].clone().add(V[i + 1][j1]).add(V[i + 1][j]).add(V[i][j1]).multiplyScalar(0.25);
    for (const [nb, p0, p1, n0, n1] of nbs) {
      let depth = null;
      if (nb === 'end0' || nb === 'end1') { if (q.inner && !(nb === 'end0' ? o.cap0 : o.cap1)) depth = d + thick; else continue; }
      else if (!nb || (nb.grp ?? nb.key) !== (q.grp ?? q.key)) depth = d + thick;
      else if ((nb.inset || 0) > d + 1e-5) depth = nb.inset;
      if (depth === null) continue;
      const facing = p0.clone().add(p1).multiplyScalar(0.5).sub(ctr);
      wall(B, p0, p1, n0, n1, d, depth, facing);
    }
  }
  for (const [i, key, sgn] of [[0, o.cap0, -1], [S - 1, o.cap1, 1]]) { // end caps: fan to the ring centroid
    if (!key) continue;
    const B = bucket(key), cc = new THREE.Vector3();
    for (const v of V[i]) cc.add(v); cc.multiplyScalar(1 / R);
    const nn = new THREE.Vector3(0, 0, sgn);
    for (let j = 0; j < R; j++) {
      const a = V[i][j], b = V[i][(j + 1) % R];
      const fn = new THREE.Vector3().subVectors(a, cc).cross(new THREE.Vector3().subVectors(b, cc));
      if (fn.z * sgn >= 0) { put(B, cc, nn, 0); put(B, a, nn, 0.4); put(B, b, nn, 0.4); } else { put(B, cc, nn, 0); put(B, b, nn, 0.4); put(B, a, nn, 0.4); }
    }
  }
  const res = new Map();
  for (const [k, B] of out) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3));
    g.setAttribute('aEdgeW', new THREE.Float32BufferAttribute(B.e, 1));
    g.userData = { kind: 2, edgeZero: true, edgeW: true };
    res.set(k, g);
  }
  return res;
}

// Stations for a rounded end: shrink width / height toward the tip over `len` (k steps).
// base: { hw, yb, yt } of the full section, z0 = where rounding starts, dir = +1 (front) / -1 (rear).
export function roundEnd(base, z0, len, dir, k = 4, { shrink = 0.7, lift = 0 } = {}) {
  const out = [];
  for (let s = 1; s <= k; s++) {
    const a = (s / k) * (Math.PI / 2), e = 1 - Math.cos(a); // 0..1
    const r = Math.min(base.hw, (base.yt - base.yb) / 2) * shrink;
    const dz = Math.sin(a) * len, sh = r * e;
    out.push({ ...base, z: z0 + dir * dz, hw: base.hw - sh, yb: base.yb + sh + lift * e, yt: base.yt - sh });
  }
  return dir > 0 ? out : out.reverse();
}

// Outline [[x, y], ...] of one shellLoft station (same section formula), for doors / caps cut to the body shape.
export function sectionPts(st, o = {}, count = 32) {
  if (o.rect) return rrectRing(st, o).map(([x, y]) => [x, y]);
  const n = o.n ?? 3, nT = o.nT ?? n, nB = o.nB ?? n, out = [];
  const yc = (st.yb + st.yt) / 2, hh = (st.yt - st.yb) / 2, belt = st.belt ?? o.belt ?? 1e9, g = st.gh ?? o.gh ?? 0, beltW = o.beltW ?? 0.25;
  for (let j = 0; j < count; j++) {
    const t = (j / count) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    const y = yc + hh * Math.sign(s) * Math.pow(Math.abs(s), 2 / (s >= 0 ? nT : nB));
    out.push([(st.x ?? 0) + st.hw * Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * (1 - g * smooth(belt, belt + beltW, y)), y]);
  }
  return out;
}

// Rounded-rectangle ring for shellLoft({ rect: { rT, rB, ns, na, nt, bulge, bulgeT } }): flat sides with big
// rounded edges (radius rT on top, rB at the bottom, per-station st.rT / st.rB override), sides bowed out by
// `bulge` (fraction of hw) and the top domed by `bulgeT` (fraction of hh). Same point count at every station,
// starting at the right-middle, counter-clockwise. Returns [[x, y, ux, uy], ...] (ux, uy = normalised coords).
export function rrectRing(st, o = {}) {
  const c = o.rect || {}, ns = c.ns ?? 3, na = Math.max(2, Math.round((c.na ?? 4) * (Q.radial < 1 ? 0.6 : 1))), nt = c.nt ?? 3;
  const hw = st.hw, yb = st.yb, yt = st.yt, yc = (yb + yt) / 2, hh = (yt - yb) / 2;
  const rT = Math.min(st.rT ?? c.rT ?? 0.12, hw * 0.95, hh * 0.95), rB = Math.min(st.rB ?? c.rB ?? 0.08, hw * 0.95, hh * 0.95);
  const P = [], H = Math.PI / 2;
  for (let k = 0; k < ns; k++) P.push([hw, yc + (hh - rT) * k / ns]);
  for (let k = 0; k < na; k++) { const a = (k / na) * H; P.push([hw - rT + rT * Math.cos(a), yt - rT + rT * Math.sin(a)]); }
  for (let k = 0; k < nt; k++) P.push([(hw - rT) * (1 - k / nt), yt]);
  for (let k = 0; k < nt; k++) P.push([-(hw - rT) * k / nt, yt]);
  for (let k = 0; k < na; k++) { const a = H + (k / na) * H; P.push([-(hw - rT) + rT * Math.cos(a), yt - rT + rT * Math.sin(a)]); }
  for (let k = 0; k < ns; k++) P.push([-hw, yt - rT - (hh - rT) * k / ns]);
  for (let k = 0; k < ns; k++) P.push([-hw, yc - (hh - rB) * k / ns]);
  for (let k = 0; k < na; k++) { const a = 2 * H + (k / na) * H; P.push([-(hw - rB) + rB * Math.cos(a), yb + rB + rB * Math.sin(a)]); }
  for (let k = 0; k < nt; k++) P.push([-(hw - rB) * (1 - k / nt), yb]);
  for (let k = 0; k < nt; k++) P.push([(hw - rB) * k / nt, yb]);
  for (let k = 0; k < na; k++) { const a = 3 * H + (k / na) * H; P.push([hw - rB + rB * Math.cos(a), yb + rB + rB * Math.sin(a)]); }
  for (let k = 0; k < ns; k++) P.push([hw, yb + rB + (hh - rB) * k / ns]);
  const bs = c.bulge ?? 0, bt = c.bulgeT ?? 0, belt = st.belt ?? o.belt ?? 1e9, g = st.gh ?? o.gh ?? 0, beltW = o.beltW ?? 0.25;
  return P.map(([x, y]) => {
    const ux = x / hw, uy = (y - yc) / hh;
    let X = x * (1 + bs * (1 - uy * uy)), Y = uy > 0 ? yc + (y - yc) * (1 + bt * (1 - ux * ux)) : y;
    X *= 1 - g * smooth(belt, belt + beltW, Y);
    return [(st.x ?? 0) + X, Y, ux, uy];
  });
}
