// Shared by the fitter (node) and the generator (browser): the chain polyline, its smoothed tangent, the ring frame,
// and the two ring profiles (4-quadrant superellipse "se", Fourier "f<K>").
// Pure math, no three.js.

export const v3 = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  scl: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};

// pts: joint positions of the chain; ext: [start, end] extension lengths along the first / last segment direction
export function makePolyline(pts, ext) {
  const d0 = v3.norm(v3.sub(pts[1], pts[0])), dn = v3.norm(v3.sub(pts[pts.length - 1], pts[pts.length - 2]));
  const P = [v3.sub(pts[0], v3.scl(d0, ext[0])), ...pts, v3.add(pts[pts.length - 1], v3.scl(dn, ext[1]))];
  const S = [0], D = [];
  for (let i = 1; i < P.length; i++) { const e = v3.sub(P[i], P[i - 1]); const l = v3.len(e); S.push(S[i - 1] + l); D.push(l > 1e-9 ? v3.scl(e, 1 / l) : (D[i - 2] || [0, 1, 0])); }
  return { P, S, D, L: S[S.length - 1] };
}

function segOf(pl, t) { let i = 0; while (i < pl.D.length - 1 && t > pl.S[i + 1]) i++; return i; }
export function plPoint(pl, t) {
  const i = segOf(pl, t); return v3.add(pl.P[i], v3.scl(pl.D[i], t - pl.S[i]));
}
const sstep = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
export function plTangent(pl, t) {
  let T = pl.D[segOf(pl, t)];
  for (let k = 1; k < pl.P.length - 1; k++) { // blend across interior joints
    const w = 0.35 * Math.min(pl.S[k] - pl.S[k - 1], pl.S[k + 1] - pl.S[k]);
    if (w < 1e-9) continue;
    if (Math.abs(t - pl.S[k]) < w) { T = v3.lerp(pl.D[k - 1], pl.D[k], sstep((t - (pl.S[k] - w)) / (2 * w))); break; }
  }
  return v3.norm(T);
}
export function frame(T, ref) {
  let u = v3.sub(ref, v3.scl(T, v3.dot(ref, T)));
  if (v3.len(u) < 1e-4) u = Math.abs(T[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  u = v3.norm(u); const v = v3.cross(T, u);
  return { u, v };
}

// ring arclength positions: counts per extended segment [extStart, seg..., extEnd]
export function ringTs(pl, counts) {
  const ts = [0];
  for (let s = 0; s < counts.length; s++) for (let k = 1; k <= counts[s]; k++) ts.push(pl.S[s] + (pl.S[s + 1] - pl.S[s]) * k / counts[s]);
  return ts;
}
// which extended segment and fraction a t is in
export function segFrac(pl, t) { const i = segOf(pl, t); const l = pl.S[i + 1] - pl.S[i]; return [i, l > 0 ? (t - pl.S[i]) / l : 0]; }

// profiles. se: [cu, cv, aF, aB, bL, bR, n]; f<K>: [cu, cv, a0, a1, b1, ..., aK, bK]
export function seR(p, th) {
  const c = Math.cos(th), s = Math.sin(th);
  const a = c >= 0 ? p[2] : p[3], b = s >= 0 ? p[4] : p[5], n = p[6];
  if (a < 1e-6 || b < 1e-6) return 0;
  return Math.pow(Math.pow(Math.abs(c) / a, n) + Math.pow(Math.abs(s) / b, n), -1 / n);
}
export function fR(p, th) {
  let r = p[2]; const K = (p.length - 3) / 2;
  for (let k = 1; k <= K; k++) r += p[1 + 2 * k] * Math.cos(k * th) + p[2 + 2 * k] * Math.sin(k * th);
  return Math.max(0, r);
}
export function profR(kind, p, th) { return kind === 'se' ? seR(p, th) : fR(p, th); }

// Catmull-Rom on arrays
export function crom(a, b, c, d, t) {
  const t2 = t * t, t3 = t2 * t;
  return b.map((_, i) => 0.5 * (2 * b[i] + (-a[i] + c[i]) * t + (2 * a[i] - 5 * b[i] + 4 * c[i] - d[i]) * t2 + (-a[i] + 3 * b[i] - 3 * c[i] + d[i]) * t3));
}
