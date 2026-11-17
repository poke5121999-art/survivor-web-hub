// shCap: hair caps and hats as a star-shaped shell around a head-local centre.
// table = { bone, center:[dx,dy,dz] (metres from the bone joint), L, coef (radial SH of the OUTERMOST surface),
//           covL, cov (coverage SH, cut where < 0.5), level,
//           bl, pal, cb (palette index per level-bl icosphere direction, base-36 chars), wn, anc, wb (top-3 joint name
//           index + weight% per direction) }
// build() returns Contract v2 { pos, idx, col, si, sw }. Browser safe: node-only things (fs, child_process) are only
// reached from fit(), through process.getBuiltinModule.
// Also exports the attribute helpers shared by axisLoft.mjs and hairLocks.mjs (closest-triangle source, texture colour,
// palette, joint-name weights resolved against ctx.skel.names).
import { shBasis, icosphere } from '../../lib/sph.js';

// ---------- shared attribute helpers (pure) ----------
const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';

// closest point of triangle (a,b,c) to p: returns [dist2, v, w] with q = a + v (b-a) + w (c-a)
export function closestOnTri(P, ia, ib, ic, px, py, pz) {
  const ax = P[ia], ay = P[ia + 1], az = P[ia + 2];
  const abx = P[ib] - ax, aby = P[ib + 1] - ay, abz = P[ib + 2] - az, acx = P[ic] - ax, acy = P[ic + 1] - ay, acz = P[ic + 2] - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  let v, w;
  if (d1 <= 0 && d2 <= 0) { v = 0; w = 0; } else {
    const bpx = px - P[ib], bpy = py - P[ib + 1], bpz = pz - P[ib + 2], d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
    const cpx = px - P[ic], cpy = py - P[ic + 1], cpz = pz - P[ic + 2], d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
    const vc = d1 * d4 - d3 * d2, vb = d5 * d2 - d1 * d6, va = d3 * d6 - d5 * d4;
    if (d3 >= 0 && d4 <= d3) { v = 1; w = 0; }
    else if (vc <= 0 && d1 >= 0 && d3 <= 0) { v = d1 / (d1 - d3); w = 0; }
    else if (d6 >= 0 && d5 <= d6) { v = 0; w = 1; }
    else if (vb <= 0 && d2 >= 0 && d6 <= 0) { v = 0; w = d2 / (d2 - d6); }
    else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); v = 1 - w; }
    else { const den = 1 / (va + vb + vc); v = vb * den; w = vc * den; }
  }
  const qx = ax + abx * v + acx * w, qy = ay + aby * v + acy * w, qz = az + abz * v + acz * w;
  return [(px - qx) ** 2 + (py - qy) ** 2 + (pz - qz) ** 2, v, w];
}

// source of colours and weights: the original prim (or a subset of its triangles, tris = triangle numbers)
export function makeSource(ctx, prim, tris) {
  const P = prim.pos, I = prim.idx, T = tris || Array.from({ length: I.length / 3 }, (_, i) => i), H = ctx.hero;
  const vw = (v) => { const o = []; for (let k = 0; k < 4; k++) if (prim.jw[v * 4 + k] > 0) o.push([prim.jn[v * 4 + k], prim.jw[v * 4 + k]]); return o.length ? o : [[prim.jn[v * 4], 1]]; };
  return {
    // -> { d, u, v (texture), w: Map(joint name -> weight) }
    at(x, y, z) {
      let best = Infinity, bt = 0, bv = 0, bw = 0;
      for (const t of T) { const r = closestOnTri(P, I[t * 3] * 3, I[t * 3 + 1] * 3, I[t * 3 + 2] * 3, x, y, z); if (r[0] < best) { best = r[0]; bt = t; bv = r[1]; bw = r[2]; } }
      const a = I[bt * 3], b = I[bt * 3 + 1], c = I[bt * 3 + 2], ba = 1 - bv - bw, m = new Map();
      for (const [v, f] of [[a, ba], [b, bv], [c, bw]]) if (f > 1e-6) for (const [j, w] of vw(v)) { const n = H.nodes[j]; m.set(n, (m.get(n) || 0) + w * f); }
      const uv = prim.uv;
      return { d: Math.sqrt(best), u: uv ? ba * uv[a * 2] + bv * uv[b * 2] + bw * uv[c * 2] : 0, v: uv ? ba * uv[a * 2 + 1] + bv * uv[b * 2 + 1] + bw * uv[c * 2 + 1] : 0, w: m };
    },
  };
}

// texture colours (sRGB 0..1 x material factor) at the given {u,v}; python + PIL, same sampling as tools/sample-colors.py
export function sampleColors(ctx, prim, uvs) {
  const fs = process.getBuiltinModule('node:fs'), cp = process.getBuiltinModule('node:child_process'), url = process.getBuiltinModule('node:url'), path = process.getBuiltinModule('node:path');
  const tex = prim.tex === null || !prim.uv ? -1 : prim.tex, f = prim.color;
  if (tex < 0) return uvs.map(() => [f[0], f[1], f[2]]);
  const dir = path.join(url.fileURLToPath(new URL('../work/', import.meta.url)), 'tmp'); fs.mkdirSync(dir, { recursive: true });
  const tag = `${ctx.hero.name}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`, rq = path.join(dir, tag + '.req.json'), rs = path.join(dir, tag + '.res.json');
  fs.writeFileSync(rq, JSON.stringify(uvs.map((q) => [tex, +q.u.toFixed(5), +q.v.toFixed(5), f[0], f[1], f[2]])));
  const r = cp.spawnSync('python', [url.fileURLToPath(new URL('../work/sample-tex.py', import.meta.url)), ctx.hero.name, rq, rs], { timeout: 180000, encoding: 'utf8' });
  if (r.status !== 0) throw new Error('texture sampling failed: ' + (r.stderr || r.error));
  const out = JSON.parse(fs.readFileSync(rs, 'utf8')).map((c) => [c[0], c[1], c[2]]);
  fs.unlinkSync(rq); fs.unlinkSync(rs);
  return out;
}

// palette of <= K colours (farthest-point seeds, Lloyd) and the index of each input colour
export function quantize(cols, K = 14) {
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  let C = [cols[0].slice()];
  while (C.length < Math.min(K, cols.length)) { let bi = 0, bd = -1; cols.forEach((c, i) => { const d = Math.min(...C.map((q) => d2(q, c))); if (d > bd) { bd = d; bi = i; } }); if (bd < 1e-5) break; C.push(cols[bi].slice()); }
  let asg = new Array(cols.length).fill(0);
  for (let it = 0; it < 8; it++) {
    asg = cols.map((c) => { let b = 0, bd = 1e9; C.forEach((q, i) => { const d = d2(q, c); if (d < bd) { bd = d; b = i; } }); return b; });
    C = C.map((q, i) => { const m = cols.filter((_, j) => asg[j] === i); return m.length ? [0, 1, 2].map((k) => m.reduce((s, c) => s + c[k], 0) / m.length) : q; });
  }
  return { pal: C.map((c) => c.map((x) => +x.toFixed(3))), idx: asg };
}
export const encIdx = (a) => a.map((i) => B36[i]).join('');
export const decIdx = (s) => Array.from(s, (ch) => B36.indexOf(ch));

// joint-name weights: registry of names (+ ancestor chains for the fallback), top-3 packing, resolution at build
export function nameRegistry(ctx) {
  const H = ctx.hero, names = [], map = new Map(), anc = {};
  return {
    names, anc,
    id(n) { if (!map.has(n)) { map.set(n, names.length); names.push(n); const a = []; let i = H.nodes.indexOf(n); i = i >= 0 ? H.parent[i] : -1; while (i >= 0 && a.length < 24) { a.push(H.nodes[i]); i = H.parent[i]; } anc[n] = a; } return map.get(n); },
    pack(wm) { // Map(name -> w) -> [i0,q0,i1,q1,i2,q2], q in percent summing to 100
      const top = [...wm].sort((a, b) => b[1] - a[1]).slice(0, 3), tot = top.reduce((s, x) => s + x[1], 0) || 1, out = [];
      const q = top.map(([, w]) => Math.round((w / tot) * 100)); q[0] += 100 - q.reduce((s, x) => s + x, 0);
      top.forEach(([n], k) => out.push(this.id(n), q[k]));
      while (out.length < 6) out.push(0, 0);
      return out;
    },
  };
}
// table names -> skeleton indices (missing name: nearest ancestor present in the skeleton, else joint 0)
export function resolveNames(wn, anc, ctx) {
  const sk = ctx && ctx.skel ? ctx.skel.names : null; if (!sk) return wn.map(() => 0);
  const ix = new Map(sk.map((n, i) => [n, i]));
  return wn.map((n) => { if (ix.has(n)) return ix.get(n); for (const a of (anc && anc[n]) || []) if (ix.has(a)) return ix.get(a); return 0; });
}
// write one vertex's si/sw from a packed [i0,q0,...] row and the resolved index map
export function putWeights(si, sw, vtx, row, res) {
  const m = new Map(); for (let k = 0; k < 3; k++) { const q = row[k * 2 + 1]; if (q > 0) m.set(res[row[k * 2]], (m.get(res[row[k * 2]]) || 0) + q / 100); }
  let k = 0; for (const [j, w] of [...m].sort((a, b) => b[1] - a[1])) { si[vtx * 4 + k] = j; sw[vtx * 4 + k] = w; k++; }
  if (!k) sw[vtx * 4] = 1;
}

// ---------- cap ----------
const r5 = (x) => +x.toFixed(5);
const L_RAD = 18, L_COV = 8, LEVEL = 5, BL = 4, CAPTOL = 1; // metres; 0.006 shrinks the shell but did not improve cap + locks

function solve(A, b) { // Cholesky on SPD, n small
  const n = b.length, Lm = A.map((r) => Float64Array.from(r));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = Lm[i][j]; for (let k = 0; k < j; k++) s -= Lm[i][k] * Lm[j][k];
    Lm[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / Lm[j][j];
  }
  const y = new Float64Array(n), x = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= Lm[i][k] * y[k]; y[i] = s / Lm[i][i]; }
  for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= Lm[k][i] * x[k]; x[i] = s / Lm[i][i]; }
  return x;
}
function fitSH(V, vals, wts, L, lam) {
  const n = (L + 1) ** 2, A = Array.from({ length: n }, () => new Float64Array(n)), b = new Float64Array(n);
  V.forEach((d, i) => { const w = wts[i]; if (w <= 0) return; const B = shBasis(L, d[0], d[1], d[2]);
    for (let p = 0; p < n; p++) { b[p] += w * B[p] * vals[i]; for (let q = 0; q <= p; q++) A[p][q] += w * B[p] * B[q]; } });
  for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) A[p][q] = A[q][p];
  let li = 0; for (let l = 0; l <= L; l++) for (let m = -l; m <= l; m++) { A[li][li] += lam * V.length * (1 + l * (l + 1)); li++; }
  return Array.from(solve(A, b), r5);
}
const evalSH = (L, coef, d) => { const B = shBasis(L, d[0], d[1], d[2]); let r = 0; for (let k = 0; k < B.length; k++) r += coef[k] * B[k]; return r; };

// outermost hit radius along each direction from c
function cast(prim, c, V) {
  const out = new Float64Array(V.length).fill(-1), P = prim.pos, I = prim.idx;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, d0 = I[t + 2] * 3;
    const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2 = [P[d0] - P[a], P[d0 + 1] - P[a + 1], P[d0 + 2] - P[a + 2]];
    const s = [c[0] - P[a], c[1] - P[a + 1], c[2] - P[a + 2]];
    const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
    for (let k = 0; k < V.length; k++) {
      const d = V[k], h0 = d[1] * e2[2] - d[2] * e2[1], h1 = d[2] * e2[0] - d[0] * e2[2], h2 = d[0] * e2[1] - d[1] * e2[0];
      const det = e1[0] * h0 + e1[1] * h1 + e1[2] * h2; if (Math.abs(det) < 1e-14) continue;
      const f = 1 / det, u = f * (s[0] * h0 + s[1] * h1 + s[2] * h2); if (u < 0 || u > 1) continue;
      const v = f * (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]); if (v < 0 || u + v > 1) continue;
      const tt = f * (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]); if (tt > out[k]) out[k] = tt;
    }
  }
  return out;
}

function fitAt(prim, c, J, bone) {
  const { V } = icosphere(LEVEL), R = cast(prim, c, V);
  let sum = 0, n = 0; for (const r of R) if (r > 0) { sum += r; n++; }
  const mean = sum / Math.max(n, 1);
  const hit = V.map((_, i) => R[i] > 0);
  const coef = fitSH(V, Array.from(R, (r) => (r > 0 ? r : mean)), hit.map((h) => (h ? 1 : 0.02)), L_RAD, 3e-6);
  // the shell only claims directions where it sits within CAPTOL of the outermost hit: the rest goes to the locks
  const good = V.map((d, i) => hit[i] && Math.abs(R[i] - evalSH(L_RAD, coef, d)) < CAPTOL);
  const cov = fitSH(V, good.map((h) => (h ? 1 : 0)), good.map(() => 1), L_COV, 1e-5);
  return { bone, center: c.map((v, k) => r5(v - J[k])), L: L_RAD, coef, covL: L_COV, cov, level: LEVEL };
}
// share of original vertices that lie within 8 mm (radially) of the shell along their direction: picks the centre
function score(t, J, P) {
  const c = t.center.map((v, k) => v + J[k]); let ok = 0, n = 0;
  for (let i = 0; i < P.length; i += 3) { const d = [P[i] - c[0], P[i + 1] - c[1], P[i + 2] - c[2]], r = Math.hypot(...d) || 1e-9; d[0] /= r; d[1] /= r; d[2] /= r;
    n++; if (Math.abs(r - evalSH(t.L, t.coef, d)) < 0.008 && evalSH(t.covL, t.cov, d) >= 0.5) ok++; }
  return ok / n;
}

// opts.attrs === false: geometry only (hairLocks fits the cap's leftovers and does not need colours)
export function fit(ctx, prim, opts = {}) {
  const bone = 'Head_M', J = ctx.hero.joint[bone], P = prim.pos;
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9], cen = [0, 0, 0];
  for (let i = 0; i < P.length; i += 3) for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], P[i + c]); mx[c] = Math.max(mx[c], P[i + c]); cen[c] += P[i + c] / (P.length / 3); }
  const cands = [
    [(mn[0] + mx[0]) / 2, J[1] + Math.min(0.5 * (mx[1] - J[1]), 0.1), (mn[2] + mx[2]) / 2], // skull-ish
    cen, [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2],
    [(mn[0] + mx[0]) / 2, mx[1] - 0.08, (mn[2] + mx[2]) / 2],
  ];
  let best = null;
  for (const c of cands) { const t = fitAt(prim, c, J, bone); t.score = score(t, J, P); if (!best || t.score > best.score) best = t; }
  best.score = r5(best.score);
  if (opts.prune !== false) prune(best, prim, J);
  if (opts.attrs !== false) addAttrs(ctx, prim, best, J);
  return best;
}

// the shell claims only directions where its surface sits within PRUNE of the original: the rest is left to the locks
const PRUNE = 0.005;
function prune(t, prim, J) {
  const { V } = icosphere(LEVEL), c = t.center.map((v, k) => v + J[k]), P = prim.pos, I = prim.idx, good = new Array(V.length);
  const cov = V.map((d) => evalSH(t.covL, t.cov, d) >= 0.5);
  V.forEach((d, i) => {
    if (!cov[i]) { good[i] = false; return; }
    const r = Math.max(0.002, evalSH(t.L, t.coef, d)), x = c[0] + d[0] * r, y = c[1] + d[1] * r, z = c[2] + d[2] * r; let b = Infinity;
    for (let q = 0; q < I.length; q += 3) { const e = closestOnTri(P, I[q] * 3, I[q + 1] * 3, I[q + 2] * 3, x, y, z)[0]; if (e < b) b = e; }
    good[i] = Math.sqrt(b) < PRUNE;
  });
  t.cov = fitSH(V, good.map((h) => (h ? 1 : 0)), good.map(() => 1), L_COV, 1e-5);
}

// colour and top-3 joint weights per level-BL direction, taken from the closest original surface
function addAttrs(ctx, prim, t, J) {
  const { V } = icosphere(BL), c = t.center.map((v, k) => v + J[k]), src = makeSource(ctx, prim), reg = nameRegistry(ctx);
  const hits = V.map((d) => { const r = Math.max(0.002, evalSH(t.L, t.coef, d)); return src.at(c[0] + d[0] * r, c[1] + d[1] * r, c[2] + d[2] * r); });
  const cols = sampleColors(ctx, prim, hits), { pal, idx } = quantize(cols);
  t.bl = BL; t.pal = pal; t.cb = encIdx(idx);
  const wb = []; for (const h of hits) wb.push(...reg.pack(h.w));
  t.wn = reg.names; t.anc = reg.anc; t.wb = wb;
}

// geometry only (also used by hairLocks to know what the cap covers)
export function geometry(t, ctx) {
  const J = ctx.hero.joint[t.bone], c = t.center.map((v, k) => v + J[k]);
  const { V, F } = icosphere(t.level), pos = new Float32Array(V.length * 3), ok = new Uint8Array(V.length);
  V.forEach((d, i) => { const r = Math.max(0.002, evalSH(t.L, t.coef, d)); pos.set([c[0] + d[0] * r, c[1] + d[1] * r, c[2] + d[2] * r], i * 3); ok[i] = evalSH(t.covL, t.cov, d) >= 0.5 ? 1 : 0; });
  const keep = F.filter((f) => ok[f[0]] + ok[f[1]] + ok[f[2]] >= 2).flat();
  return { pos, idx: Uint32Array.from(keep), V };
}

export function build(t, ctx) {
  const { pos, idx, V } = geometry(t, ctx), n = V.length;
  const col = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  if (!t.cb) { col.fill(0.5); for (let v = 0; v < n; v++) sw[v * 4] = 1; return { pos, idx, col, si, sw }; }
  const B = icosphere(t.bl).V, nb = B.length, cb = decIdx(t.cb), res = resolveNames(t.wn, t.anc, ctx);
  for (let v = 0; v < n; v++) {
    let b = v, d = V[v]; if (v >= nb) { let bd = -2; for (let k = 0; k < nb; k++) { const e = B[k][0] * d[0] + B[k][1] * d[1] + B[k][2] * d[2]; if (e > bd) { bd = e; b = k; } } }
    const p = t.pal[cb[b]]; col[v * 3] = p[0]; col[v * 3 + 1] = p[1]; col[v * 3 + 2] = p[2];
    putWeights(si, sw, v, t.wb.slice(b * 6, b * 6 + 6), res);
  }
  return { pos, idx, col, si, sw };
}
