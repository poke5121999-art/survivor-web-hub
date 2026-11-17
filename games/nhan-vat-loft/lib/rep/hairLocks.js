// hairLocks: the hair triangles the shCap shell does not cover, as lock strips (bent rounded slabs) along each lock.
// fit(ctx, prim) fits the cap itself (ctx.capTable reuses a cap table already fitted) and keeps the leftovers; build()
// returns only the locks: { pos, idx, col, si, sw } (Contract v2). Weights come from the original triangles of each
// lock by joint name, so the hair spring bones (Hair_*, jointNN, ...) keep swinging them.
// table = { ref, S, locks:[{ rings:[[Cx,Cy,Cz, ax,ay,az, nx,ny,nz, hw, th, bend]] (metres from the ref joint) , ... }],
//           pal, cb (palette index per ring x S, base-36), wn, anc, wr (top-3 name index + % per ring) }
// Slab section: x = hw cos t, y = bend (x/hw)^2 + th sin t with a superellipse n = 4 (same as lib/char.js stripPts).
import * as cap from './shCap.js';
import { makeSource, sampleColors, quantize, encIdx, decIdx, nameRegistry, resolveNames, putWeights } from './shCap.js';

const r5 = (x) => +x.toFixed(5), S = 14, SL = 15; // S section points of a slab; a slab ring has SL numbers
function gauss(A, b) { // small dense solve with partial pivoting
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; } }
  const x = new Array(n).fill(0); for (let r = n - 1; r >= 0; r--) { let t = M[r][n]; for (let k = r + 1; k < n; k++) t -= M[r][k] * x[k]; x[r] = t / M[r][r]; } return x;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// ---- which original triangles the cap does not cover
function leftovers(prim, gen, thr) {
  const H = 0.01, grid = new Map(), G = gen.pos, key = (x, y, z) => `${Math.floor(x / H)},${Math.floor(y / H)},${Math.floor(z / H)}`;
  const used = new Set(); for (const i of gen.idx) used.add(i);
  for (const i of used) { const k = key(G[i * 3], G[i * 3 + 1], G[i * 3 + 2]); (grid.get(k) || grid.set(k, []).get(k)).push(i); }
  const dist = (x, y, z) => {
    let b = 1e9; const gx = Math.floor(x / H), gy = Math.floor(y / H), gz = Math.floor(z / H);
    for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) for (let d = -1; d <= 1; d++) { const cell = grid.get(`${gx + a},${gy + c},${gz + d}`); if (cell) for (const j of cell) b = Math.min(b, Math.hypot(x - G[j * 3], y - G[j * 3 + 1], z - G[j * 3 + 2])); }
    return b;
  };
  const P = prim.pos, I = prim.idx, out = [], B = [[1 / 3, 1 / 3, 1 / 3], [.8, .1, .1], [.1, .8, .1], [.1, .1, .8], [.45, .45, .1], [.1, .45, .45], [.45, .1, .45]];
  for (let t = 0; t < I.length / 3; t++) {
    const v = [0, 1, 2].map((k) => I[t * 3 + k] * 3); let n = 0;
    for (const [a, b, c] of B) if (dist(a * P[v[0]] + b * P[v[1]] + c * P[v[2]], a * P[v[0] + 1] + b * P[v[1] + 1] + c * P[v[2] + 1], a * P[v[0] + 2] + b * P[v[1] + 2] + c * P[v[2] + 2]) > thr) n++;
    if (n >= 4) out.push(t);
  }
  return out;
}

// ---- leftover triangles -> locks: dominant joint of each triangle, then connected pieces of that joint's triangles
function groups(ctx, prim, left) {
  const I = prim.idx, domT = (t) => { const m = new Map(); for (let k = 0; k < 3; k++) { const d = prim.dom[I[t * 3 + k]]; m.set(d, (m.get(d) || 0) + 1); } return [...m].sort((a, b) => b[1] - a[1])[0][0]; };
  const byJ = new Map(); for (const t of left) { const d = domT(t); (byJ.get(d) || byJ.set(d, []).get(d)).push(t); }
  const out = [];
  for (const [d, ts] of byJ) {
    const par = new Map(), f = (x) => { while (par.get(x) !== x) { par.set(x, par.get(par.get(x))); x = par.get(x); } return x; };
    for (const t of ts) for (let k = 0; k < 3; k++) if (!par.has(I[t * 3 + k])) par.set(I[t * 3 + k], I[t * 3 + k]);
    for (const t of ts) { par.set(f(I[t * 3]), f(I[t * 3 + 1])); par.set(f(I[t * 3 + 1]), f(I[t * 3 + 2])); }
    const pieces = new Map(); for (const t of ts) { const r = f(I[t * 3]); (pieces.get(r) || pieces.set(r, []).get(r)).push(t); }
    for (const p of pieces.values()) if (p.length >= 4) out.push({ joint: ctx.hero.nodes[d], tris: p });
  }
  return out;
}

// ---- one lock: rings along the centre line, each a slab fitted to the slice of the lock's own triangles
function fitLock(ctx, prim, g) {
  const P = prim.pos, I = prim.idx, H = ctx.hero, jp = H.joint[g.joint];
  const vs = new Set(); for (const t of g.tris) for (let k = 0; k < 3; k++) vs.add(I[t * 3 + k]);
  const pts = [...vs].map((v) => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]);
  let c = [0, 0, 0]; for (const p of pts) c = add(c, p); c = scl(c, 1 / pts.length);
  // principal axis (power iteration)
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (const p of pts) { const d = sub(p, c); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j]; }
  let ax = [0.2, -1, 0.1]; for (let it = 0; it < 60; it++) ax = nrm([dot(C[0], ax), dot(C[1], ax), dot(C[2], ax)]);
  // the lock grows away from its bone joint
  let lo = 1e9, hi = -1e9; for (const p of pts) { const s = dot(sub(p, c), ax); lo = Math.min(lo, s); hi = Math.max(hi, s); }
  if (dot(sub(c, jp), ax) < 0 || (Math.abs(dot(sub(c, jp), ax)) < 1e-4 && ax[1] > 0)) { ax = scl(ax, -1); [lo, hi] = [-hi, -lo]; }
  const len = hi - lo, K = Math.max(4, Math.min(28, Math.round(len / 0.01))), win = len / K * 0.75;
  // centre line: centroid of the vertices near each station, smoothed
  const cs = [];
  for (let k = 0; k < K; k++) {
    const s = lo + ((k + 0.5) / K) * len; let m = [0, 0, 0], n = 0;
    for (const p of pts) if (Math.abs(dot(sub(p, c), ax) - s) < win) { m = add(m, p); n++; }
    cs.push(n ? scl(m, 1 / n) : add(c, scl(ax, s)));
  }
  for (let pass = 0; pass < 2; pass++) { const q = cs.map((x) => x.slice()); for (let i = 1; i < K - 1; i++) cs[i] = scl(add(add(q[i - 1], q[i + 1]), scl(q[i], 2)), 0.25); }
  const tri = (t, k) => [P[I[t * 3 + k] * 3], P[I[t * 3 + k] * 3 + 1], P[I[t * 3 + k] * 3 + 2]];
  const rings = [], st = []; let prevA = null, prevN = null;
  for (let k = 0; k < K; k++) {
    const O = cs[k], T = nrm(sub(cs[Math.min(K - 1, k + 1)], cs[Math.max(0, k - 1)]));
    const Tn = dot(T, ax) > 0.2 ? T : ax;
    const e1 = nrm(cross(Tn, Math.abs(Tn[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])), e2 = cross(Tn, e1), seg = [];
    for (const t of g.tris) {
      const q = [tri(t, 0), tri(t, 1), tri(t, 2)], d = q.map((x) => dot(sub(x, O), Tn)), pp = [];
      for (let e = 0; e < 3; e++) { const a = e, b = (e + 1) % 3; if ((d[a] > 0) !== (d[b] > 0)) { const f = d[a] / (d[a] - d[b]), x = [0, 1, 2].map((m) => q[a][m] + (q[b][m] - q[a][m]) * f), w = sub(x, O); pp.push([dot(w, e1), dot(w, e2)]); } }
      if (pp.length === 2) seg.push(pp[0], pp[1]);
    }
    st.push({ O, e1, e2, seg });
    if (!seg.length) { rings.push(null); continue; }
    const mx = seg.reduce((a, p) => a + p[0], 0) / seg.length, my = seg.reduce((a, p) => a + p[1], 0) / seg.length;
    let sxx = 0, sxy = 0, syy = 0; for (const [x, y] of seg) { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); syy += (y - my) ** 2; }
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    let a3 = add(scl(e1, Math.cos(ang)), scl(e2, Math.sin(ang)));
    if (prevA && dot(a3, prevA) < 0) a3 = scl(a3, -1);
    let n3 = nrm(cross(Tn, a3)); if (prevN && dot(n3, prevN) < 0) n3 = scl(n3, -1);
    const ca = [dot(a3, e1), dot(a3, e2)], na = [dot(n3, e1), dot(n3, e2)];
    const loc = seg.map(([x, y]) => [(x - mx) * ca[0] + (y - my) * ca[1], (x - mx) * na[0] + (y - my) * na[1]]);
    let l0 = 1e9, l1 = -1e9; for (const [a] of loc) { l0 = Math.min(l0, a); l1 = Math.max(l1, a); }
    const hw = Math.max(0.003, (l1 - l0) / 2), cA = (l0 + l1) / 2;
    // n = c0 + c1 xn + c2 xn^2 + c3 xn^3 + c4 xn^4, xn = (a - cA) / hw: a curved sheet (C or S shaped) of any lock width
    const polyFit = (NP) => { // NP 2: c0 + c2 xn^2 (parabola); NP 5: full quartic
      const basis = (xn) => (NP === 2 ? [1, xn * xn] : [1, xn, xn * xn, xn ** 3, xn ** 4]);
      const Am = Array.from({ length: NP }, () => new Float64Array(NP)), bm = new Float64Array(NP);
      for (const [a, n] of loc) { const xn = (a - cA) / hw, f = basis(xn); for (let i = 0; i < NP; i++) { bm[i] += f[i] * n; for (let j = 0; j < NP; j++) Am[i][j] += f[i] * f[j]; } }
      for (let i = 0; i < NP; i++) Am[i][i] += 1e-9 * (1 + i);
      let c = gauss(Am, bm); if (NP === 2) c = [c[0], 0, c[1], 0, 0];
      const rs = loc.map(([a, n]) => { const xn = (a - cA) / hw; return Math.abs(n - (c[0] + c[1] * xn + c[2] * xn * xn + c[3] * xn ** 3 + c[4] * xn ** 4)); }).sort((x, y) => x - y);
      return { c, res: rs[rs.length - 1] * 0.9 };
    };
    // parabola unless a quartic (C / S shaped sheet) is clearly closer
    let pf = polyFit(2); if (pf.res > 0.004) { const q = polyFit(5); if (q.res < pf.res * 0.65) pf = q; }
    const cf = pf.c, res = pf.res, th = Math.min(Math.max(0.0025, res + 0.001), hw), c0 = cf[0];
    const Cc = add(add(O, add(scl(e1, mx), scl(e2, my))), add(scl(a3, cA), scl(n3, c0)));
    prevA = a3; prevN = n3;
    rings.push([...Cc, ...a3, ...n3, hw, th, cf[1], cf[2], cf[3], cf[4]]);
  }
  // fill empty rings from the neighbours, then smooth
  for (let i = 0; i < K; i++) if (!rings[i]) { let k = 1; while ((i - k < 0 || !rings[i - k]) && (i + k >= K || !rings[i + k])) { k++; if (k > K) return null; } const s = (i - k >= 0 && rings[i - k]) ? rings[i - k] : rings[i + k]; rings[i] = s.slice(); rings[i][9] *= 0.6; rings[i][10] *= 0.8; }
  for (let pass = 0; pass < 1; pass++) { const q = rings.map((r) => r.slice()); for (let i = 1; i < K - 1; i++) for (let m = 0; m < SL; m++) rings[i][m] = (q[i - 1][m] + 2 * q[i][m] + q[i + 1][m]) / 4; }
  for (const r of rings) { const a = nrm(r.slice(3, 6)), nn = nrm(r.slice(6, 9)); r.splice(3, 6, ...a, ...nn); }
  return { rings, fourier: fourierRings(st) };
}

// closed outline per ring: outermost radius per angle from the slice centroid, Fourier-KF. ring = [C(3), e1(3), e2(3), r0, a1, b1, ...]
const KF = 6, SF = 20, MR = 40;
function fourierRings(st) {
  const K = st.length, rings = [];
  for (const { O, e1, e2, seg } of st) {
    if (!seg.length) { rings.push(null); continue; }
    let cx = 0, cy = 0, wl = 0; for (let i = 0; i + 1 < seg.length; i += 2) { const a = seg[i], b = seg[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) + 1e-9; cx += (a[0] + b[0]) / 2 * l; cy += (a[1] + b[1]) / 2 * l; wl += l; }
    cx /= wl; cy /= wl;
    const r = new Array(MR).fill(NaN);
    for (let m = 0; m < MR; m++) {
      const th = (m / MR) * Math.PI * 2, dx = Math.cos(th), dy = Math.sin(th);
      for (let i = 0; i + 1 < seg.length; i += 2) {
        const a = seg[i], b = seg[i + 1], ex = b[0] - a[0], ey = b[1] - a[1], den = dx * ey - dy * ex; if (Math.abs(den) < 1e-12) continue;
        const ax = a[0] - cx, ay = a[1] - cy, k = (ax * ey - ay * ex) / den, w = (ax * dy - ay * dx) / den;
        if (k > 0 && w >= 0 && w <= 1 && !(k <= r[m])) r[m] = k;
      }
    }
    if (r.every((x) => isNaN(x))) { rings.push(null); continue; }
    for (let m = 0; m < MR; m++) if (isNaN(r[m])) { let a = 1; while (isNaN(r[(m - a + MR) % MR])) a++; let b = 1; while (isNaN(r[(m + b) % MR])) b++; r[m] = (r[(m - a + MR) % MR] * b + r[(m + b) % MR] * a) / (a + b); }
    const co = [r.reduce((q, x) => q + x, 0) / MR];
    for (let k = 1; k <= KF; k++) { let a = 0, b = 0; for (let m = 0; m < MR; m++) { const th = (m / MR) * Math.PI * 2; a += r[m] * Math.cos(k * th); b += r[m] * Math.sin(k * th); } co.push(2 * a / MR, 2 * b / MR); }
    rings.push([...add(O, add(scl(e1, cx), scl(e2, cy))), ...e1, ...e2, ...co]);
  }
  for (let i = 0; i < K; i++) if (!rings[i]) { let k = 1; while ((i - k < 0 || !rings[i - k]) && (i + k >= K || !rings[i + k])) { k++; if (k > K) return null; } const s = (i - k >= 0 && rings[i - k]) ? rings[i - k] : rings[i + k]; rings[i] = s.slice(); for (let m = 9; m < s.length; m++) rings[i][m] *= 0.6; }
  const q = rings.map((r) => r.slice()); for (let i = 1; i < K - 1; i++) for (let m = 0; m < q[i].length; m++) rings[i][m] = (q[i - 1][m] + 2 * q[i][m] + q[i + 1][m]) / 4;
  for (const r of rings) { const a = nrm(r.slice(3, 6)), nn = nrm(r.slice(6, 9)); r.splice(3, 6, ...a, ...nn); }
  return rings;
}

function sectionPts(r, S) { // 3D positions of the S points of one ring: slab outline (12 numbers) or Fourier outline
  const out = [];
  if (r.length === SL) {
    const [cx, cy, cz, ax, ay, az, nx, ny, nz, hw, th, p1, p2, p3, p4] = r;
    for (let a = 0; a < S; a++) {
      const t = (a / S) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t), n = 4;
      const rr = Math.pow(Math.pow(Math.abs(c) / Math.max(hw, 1e-4), n) + Math.pow(Math.abs(s) / Math.max(th, 1e-4), n), -1 / n);
      const x = rr * c, xn = Math.max(-1, Math.min(1, x / Math.max(hw, 1e-5))), y = rr * s + p1 * xn + p2 * xn * xn + p3 * xn ** 3 + p4 * xn ** 4;
      out.push([cx + ax * x + nx * y, cy + ay * x + ny * y, cz + az * x + nz * y]);
    }
    return out;
  }
  const [cx, cy, cz, ax, ay, az, nx, ny, nz] = r;
  for (let a = 0; a < S; a++) {
    const t = (a / S) * Math.PI * 2; let rad = r[9];
    for (let k = 1; k <= KF; k++) rad += r[9 + 2 * k - 1] * Math.cos(k * t) + r[9 + 2 * k] * Math.sin(k * t);
    rad = Math.max(rad, 0.0005); const x = Math.cos(t) * rad, y = Math.sin(t) * rad;
    out.push([cx + ax * x + nx * y, cy + ay * x + ny * y, cz + az * x + nz * y]);
  }
  return out;
}
const lockS = (lk) => lk.rings[0].length === SL ? S : SF;

export function fit(ctx, prim, opts = {}) {
  const ref = 'Head_M', J = ctx.hero.joint[ref];
  // opts.all: no cap, every triangle of the prim becomes strips (bows, ribbons: sheets that are not tubes)
  const capT = opts.all ? { score: 0 } : ctx.capTable || cap.fit(ctx, prim, { attrs: false });
  const left = opts.all ? Array.from({ length: prim.idx.length / 3 }, (_, i) => i) : leftovers(prim, cap.geometry(capT, ctx), opts.thr || 0.006);
  const reg = nameRegistry(ctx), locks = [], allCols = [], rows = [];
  // one piece -> slab or closed Fourier outline (whichever sits closer to the piece's own triangles) + weights per ring
  const piece = (g) => {
    const fl = fitLock(ctx, prim, g); if (!fl) return null;
    const src = makeSource(ctx, prim, g.tris);
    const sample = (rings, SS) => { const hits = [], rw = []; let err = 0;
      for (const r of rings) { const sp = sectionPts(r, SS), wm = new Map(), hh = sp.map((q) => src.at(q[0], q[1], q[2]));
        for (const h of hh) { err += h.d; for (const [n, w] of h.w) wm.set(n, (wm.get(n) || 0) + w); }
        // the chord between two section points is surface too: it must lie on the original as well
        for (let a = 0; a < SS; a++) { const q = sp[a], q2 = sp[(a + 1) % SS]; err += src.at((q[0] + q2[0]) / 2, (q[1] + q2[1]) / 2, (q[2] + q2[2]) / 2).d; }
        hits.push(...hh); rw.push(wm); }
      return { hits, rw, err: err / (hits.length * 2) }; };
    let rings = fl.rings, smp = sample(rings, S);
    if (fl.fourier && (opts.forceF || smp.err > 0.0035)) { const sf = sample(fl.fourier, SF); if (opts.forceF || sf.err < smp.err) { rings = fl.fourier; smp = sf; } }
    return { joint: g.joint, tris: g.tris, rings, smp };
  };
  // a piece that fits badly (a wide curtain, a twisted mass) is cut in two along its length or width and each half refitted
  const fitTree = (g, depth) => {
    const me = piece(g); if (!me) return [];
    if (me.smp.err < (opts.splitAt || 0.0035) || depth >= 3 || g.tris.length < 16) return [me];
    const cent = g.tris.map((t) => { let m = [0, 0, 0]; for (let k = 0; k < 3; k++) for (let c = 0; c < 3; c++) m[c] += prim.pos[prim.idx[t * 3 + k] * 3 + c] / 3; return m; });
    let mc = [0, 0, 0]; for (const c of cent) mc = add(mc, c); mc = scl(mc, 1 / cent.length);
    const Cm = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (const c of cent) { const d = sub(c, mc); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) Cm[i][j] += d[i] * d[j]; }
    const pc = (M, seed) => { let v = seed; for (let it = 0; it < 60; it++) v = nrm([dot(M[0], v), dot(M[1], v), dot(M[2], v)]); return v; };
    const p1 = pc(Cm, [0.3, 1, 0.2]), l1 = dot([dot(Cm[0], p1), dot(Cm[1], p1), dot(Cm[2], p1)], p1);
    const M2 = Cm.map((r, i) => r.map((x, j) => x - l1 * p1[i] * p1[j])), p2 = pc(M2, nrm(cross(p1, [0, 0, 1])));
    let bestSet = null, bestErr = me.smp.err * 0.85;
    for (const dir of [p1, p2]) {
      const pr = cent.map((c) => dot(sub(c, mc), dir)), med = [...pr].sort((a, b) => a - b)[Math.floor(pr.length / 2)];
      const A = g.tris.filter((_, i) => pr[i] <= med), B = g.tris.filter((_, i) => pr[i] > med); if (A.length < 4 || B.length < 4) continue;
      const kids = [...fitTree({ joint: g.joint, tris: A }, depth + 1), ...fitTree({ joint: g.joint, tris: B }, depth + 1)];
      const tot = kids.reduce((q, k) => q + k.tris.length, 0) || 1, e = kids.reduce((q, k) => q + k.smp.err * k.tris.length, 0) / tot;
      if (e < bestErr) { bestErr = e; bestSet = kids; }
    }
    return bestSet || [me];
  };
  for (const g of groups(ctx, prim, left)) for (const pc of fitTree(g, 0)) {
    const { rings, smp } = pc, rw = smp.rw.flatMap((wm) => reg.pack(wm));
    locks.push({ joint: pc.joint, n: rings.length, kind: rings[0].length === SL ? 's' : 'f', err: r5(smp.err), rings: rings.map((r) => r.map((x, i) => r5(i < 3 ? x - J[i] : x))) });
    allCols.push(smp.hits); rows.push(rw);
  }
  const flat = allCols.flat(), cols = flat.length ? sampleColors(ctx, prim, flat) : [];
  const q = cols.length ? quantize(cols) : { pal: [[0.5, 0.5, 0.5]], idx: [] };
  return { ref, S, capScore: capT.score, leftTris: left.length, nTris: prim.idx.length / 3, locks, pal: q.pal, cb: encIdx(q.idx), wn: reg.names, anc: reg.anc, wr: rows.flat() };
}

export function build(t, ctx) {
  const J = ctx.hero.joint[t.ref], pos = [], idx = [], cbi = decIdx(t.cb), res = resolveNames(t.wn, t.anc, ctx);
  const vcol = [], vrow = []; let ringNo = 0, colNo = 0;
  for (const lk of t.locks) {
    const base = pos.length / 3, R = lk.rings, S = lockS(lk);
    R.forEach((r, ri) => {
      const rr = r.map((x, i) => (i < 3 ? x + J[i] : x)), q = sectionPts(rr, S), row = t.wr.slice((ringNo + ri) * 6, (ringNo + ri) * 6 + 6);
      q.forEach((p, a) => { pos.push(...p); vcol.push(cbi[colNo + ri * S + a]); vrow.push(row); });
    });
    for (let i = 0; i + 1 < R.length; i++) for (let a = 0; a < S; a++) {
      const i0 = base + i * S + a, i1 = base + i * S + (a + 1) % S, j0 = i0 + S, j1 = i1 + S; idx.push(i0, i1, j0, i1, j1, j0);
    }
    for (const [ri, first] of [[0, true], [R.length - 1, false]]) {
      let m = [0, 0, 0]; for (let a = 0; a < S; a++) m = add(m, pos.slice((base + ri * S + a) * 3, (base + ri * S + a) * 3 + 3));
      const ci = pos.length / 3; pos.push(...scl(m, 1 / S)); vcol.push(vcol[base + ri * S]); vrow.push(vrow[base + ri * S]);
      for (let a = 0; a < S; a++) { const i0 = base + ri * S + a, i1 = base + ri * S + (a + 1) % S; if (first) idx.push(ci, i1, i0); else idx.push(ci, i0, i1); }
    }
    ringNo += R.length; colNo += R.length * S;
  }
  const n = pos.length / 3, col = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) { const p = t.pal[vcol[v]] || [0.5, 0.5, 0.5]; col[v * 3] = p[0]; col[v * 3 + 1] = p[1]; col[v * 3 + 2] = p[2]; putWeights(si, sw, v, vrow[v], res); }
  return { pos: Float32Array.from(pos), idx: Uint32Array.from(idx), col, si, sw };
}
