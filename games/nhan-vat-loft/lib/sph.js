// Generator: a star-shaped shell r(dir) = sum_lm c_lm Y_lm(dir) around a centre (real spherical harmonics up to L),
// meshed on a subdivided icosahedron, skinned to one bone. Used for heads and hair shells.
// table: { type:'sph', joints, bone, center:[x,y,z], L, coef:[...(L+1)^2] }
import { CANON } from './loft.js';

// real SH basis values for all l<=L at unit direction (x,y,z), via associated Legendre recurrences
export function shBasis(L, x, y, z) {
  // use y as the polar axis: theta from +y, phi in the x-z plane
  const ct = Math.max(-1, Math.min(1, y)), st = Math.sqrt(Math.max(0, 1 - ct * ct)), phi = Math.atan2(x, z);
  const P = []; // P[l][m]
  for (let l = 0; l <= L; l++) P.push(new Float64Array(l + 1));
  P[0][0] = 1;
  for (let m = 1; m <= L; m++) P[m][m] = -(2 * m - 1) * st * P[m - 1][m - 1];
  for (let m = 0; m < L; m++) P[m + 1][m] = (2 * m + 1) * ct * P[m][m];
  for (let m = 0; m <= L; m++) for (let l = m + 2; l <= L; l++) P[l][m] = ((2 * l - 1) * ct * P[l - 1][m] - (l + m - 1) * P[l - 2][m]) / (l - m);
  const out = [];
  const fact = (n) => { let f = 1; for (let i = 2; i <= n; i++) f *= i; return f; };
  for (let l = 0; l <= L; l++) for (let m = -l; m <= l; m++) {
    const am = Math.abs(m), K = Math.sqrt(((2 * l + 1) / (4 * Math.PI)) * (fact(l - am) / fact(l + am)));
    out.push(m === 0 ? K * P[l][0] : m > 0 ? Math.SQRT2 * K * Math.cos(m * phi) * P[l][am] : Math.SQRT2 * K * Math.sin(am * phi) * P[l][am]);
  }
  return out;
}

export function icosphere(level) {
  const t = (1 + Math.sqrt(5)) / 2; let V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
  let F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  V = V.map((v) => { const l = Math.hypot(...v); return v.map((c) => c / l); });
  for (let s = 0; s < level; s++) {
    const mid = new Map(), F2 = [];
    const m = (a, b) => { const k = a < b ? a + '_' + b : b + '_' + a; if (!mid.has(k)) { const p = [0, 1, 2].map((c) => (V[a][c] + V[b][c]) / 2); const l = Math.hypot(...p); V.push(p.map((c) => c / l)); mid.set(k, V.length - 1); } return mid.get(k); };
    for (const [a, b, c] of F) { const ab = m(a, b), bc = m(b, c), ca = m(c, a); F2.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    F = F2;
  }
  return { V, F };
}

export function buildSPH(table, opts = {}) {
  const { V, F } = icosphere(opts.level || table.level || 4);
  const pos = new Float32Array(V.length * 3), c = table.center;
  V.forEach((d, i) => { const B = shBasis(table.L, d[0], d[1], d[2]); let r = 0; for (let k = 0; k < B.length; k++) r += table.coef[k] * B[k]; r = Math.max(0.002, r); pos.set([c[0] + d[0] * r, c[1] + d[1] * r, c[2] + d[2] * r], i * 3); });
  const idx = new Uint32Array(F.flat()); const bi = CANON.indexOf(table.bone || 'Head_M');
  const si = new Uint16Array(V.length * 4), sw = new Float32Array(V.length * 4); for (let i = 0; i < V.length; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
  const col = new Float32Array(V.length * 3); const C = table.color || [0.95, 0.8, 0.7]; for (let i = 0; i < V.length; i++) col.set(C, i * 3);
  return { position: pos, index: idx, skinIndex: si, skinWeight: sw, color: col, joints: table.joints };
}
