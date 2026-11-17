// axisLoft: ears, horns, hairpins, glasses, bows. The part is split into connected components; each component is a loft of
// Fourier-6 rings along its own PCA axis, stored relative to the dominant bone joint (rigid on that bone).
// table = { cards:[{ bone, q:[centre 3, half axis a 3, half axis b 3] }] (loose 1-7 triangle pieces as one fitted flat quad each, bone-relative), cc, cw (colour / weights per card vertex), comps:[{ bone, o:[3], ax,u,v:[3], lo, hi, rings:[[t, cx, cy, r0, a1,b1..a6,b6]] }], M,
//           pal, cb (palette index per ring x M, base-36), wn, anc, wr (top-3 name index + % per ring) }
// build() returns Contract v2 { pos, idx, col, si, sw }; browser safe (fit reaches node only through process.getBuiltinModule).
import { closestOnTri, makeSource, sampleColors, quantize, encIdx, decIdx, nameRegistry, resolveNames, putWeights } from './shCap.js';

const r5 = (x) => +x.toFixed(5), K = 6, NR = 14, MB = 20, MS = 32; // MS: samples per slice ring in the fitter
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// ported from tools/fit.mjs (that file imports node:fs and the GLB reader)
function pca(pts) {
  const n = pts.length; let c = [0, 0, 0]; for (const p of pts) c = add(c, p); c = scl(c, 1 / n);
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of pts) { const d = sub(p, c); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j]; }
  let v = [1, 0.3, 0.2]; for (let it = 0; it < 60; it++) v = nrm([dot(C[0], v), dot(C[1], v), dot(C[2], v)]);
  return { c, axis: v };
}
function sliceRing(tri, O, T, u, v, rmax) {
  const segs = [];
  for (let k = 0; k < tri.length; k += 9) {
    const d = [0, 1, 2].map((i) => (tri[k + i * 3] - O[0]) * T[0] + (tri[k + i * 3 + 1] - O[1]) * T[1] + (tri[k + i * 3 + 2] - O[2]) * T[2]), pts = [];
    for (let e = 0; e < 3; e++) {
      const a = e, b = (e + 1) % 3;
      if ((d[a] > 0) !== (d[b] > 0)) {
        const t = d[a] / (d[a] - d[b]), q = [0, 1, 2].map((c) => tri[k + a * 3 + c] + (tri[k + b * 3 + c] - tri[k + a * 3 + c]) * t), w = sub(q, O); pts.push([dot(w, u), dot(w, v)]);
      }
    }
    if (pts.length === 2 && Math.hypot(...pts[0]) < rmax && Math.hypot(...pts[1]) < rmax) segs.push(pts);
  }
  if (!segs.length) return null;
  let cx = 0, cy = 0, wl = 0;
  for (const [a, b] of segs) { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) + 1e-9; cx += (a[0] + b[0]) / 2 * l; cy += (a[1] + b[1]) / 2 * l; wl += l; }
  cx /= wl; cy /= wl;
  const r = new Array(MS).fill(NaN);
  for (let m = 0; m < MS; m++) {
    const th = (m / MS) * Math.PI * 2, dx = Math.cos(th), dy = Math.sin(th); let best = NaN;
    for (const [a, b] of segs) {
      const ex = b[0] - a[0], ey = b[1] - a[1], den = dx * ey - dy * ex; if (Math.abs(den) < 1e-12) continue;
      const ax = a[0] - cx, ay = a[1] - cy, s = (ax * ey - ay * ex) / den, w = (ax * dy - ay * dx) / den;
      if (s > 0 && w >= 0 && w <= 1 && !(s <= best)) best = s;
    }
    r[m] = best;
  }
  if (r.every((x) => isNaN(x))) return null;
  for (let m = 0; m < MS; m++) if (isNaN(r[m])) { let a = 1; while (isNaN(r[(m - a + MS) % MS])) a++; let b = 1; while (isNaN(r[(m + b) % MS])) b++; r[m] = (r[(m - a + MS) % MS] * b + r[(m + b) % MS] * a) / (a + b); }
  return { cx, cy, r };
}
function fitFourier(ring) {
  const out = [ring.cx, ring.cy, 0];
  for (let m = 0; m < MS; m++) out[2] += ring.r[m] / MS;
  for (let k = 1; k <= K; k++) { let a = 0, b = 0; for (let m = 0; m < MS; m++) { const th = (m / MS) * Math.PI * 2; a += ring.r[m] * Math.cos(k * th); b += ring.r[m] * Math.sin(k * th); } out.push(2 * a / MS, 2 * b / MS); }
  return out;
}

// a card quad as 4 triangles (both windings, so it shows from either side), 9 numbers per triangle
function cardTris(q) {
  const P = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, u]) => [0, 1, 2].map((d) => q[d] + s * q[3 + d] + u * q[6 + d]));
  return [[0, 1, 2], [0, 2, 3], [0, 2, 1], [0, 3, 2]].flatMap((tr) => tr.flatMap((k) => P[k]));
}
function components(prim) {
  const n = prim.pos.length / 3, par = Int32Array.from({ length: n }, (_, i) => i);
  const f = (x) => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
  const I = prim.idx; for (let t = 0; t < I.length; t += 3) { par[f(I[t])] = f(I[t + 1]); par[f(I[t + 1])] = f(I[t + 2]); }
  const tris = new Map();
  for (let t = 0; t < I.length; t += 3) { const r = f(I[t]); (tris.get(r) || tris.set(r, []).get(r)).push(t); }
  return [...tris.values()];
}

// one loft along the PCA axis of the triangles ts (triangle offsets into idx)
function loft(ctx, prim, ts) {
  const P = prim.pos, I = prim.idx;
  const vs = new Set(); for (const t of ts) for (let k = 0; k < 3; k++) vs.add(I[t + k]);
  const pts = [...vs].map((v) => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]);
  const cnt = new Map(); for (const v of vs) cnt.set(prim.dom[v], (cnt.get(prim.dom[v]) || 0) + 1);
  let bi = -1, bc = -1; for (const [d, c] of cnt) if (c > bc) { bc = c; bi = d; }
  const bone = ctx.hero.nodes[bi], J = ctx.hero.joint[bone];
  const { c, axis } = pca(pts);
  const ax = nrm(axis), ref = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = nrm(cross(ax, ref)), v = cross(ax, u);
  let lo = 1e9, hi = -1e9; for (const p of pts) { const s = dot(sub(p, c), ax); lo = Math.min(lo, s); hi = Math.max(hi, s); }
  const tri = new Float32Array(ts.length * 9);
  ts.forEach((t, i) => { for (let k = 0; k < 3; k++) for (let d = 0; d < 3; d++) tri[i * 9 + k * 3 + d] = P[I[t + k] * 3 + d]; });
  const rings = [];
  for (let k = 0; k < NR; k++) {
    const s = lo + ((k + 0.5) / NR) * (hi - lo), O = [c[0] + ax[0] * s, c[1] + ax[1] * s, c[2] + ax[2] * s];
    const ring = sliceRing(tri, O, ax, u, v, 0.5);
    if (!ring) continue;
    rings.push([r5(s), ...fitFourier(ring).map(r5)]);
  }
  if (!rings.length) return null;
  return { bone, o: sub(c, J).map(r5), ax: ax.map(r5), u: u.map(r5), v: v.map(r5), lo: r5(lo), hi: r5(hi), rings };
}

// share of the piece's own surface (vertices + triangle centres) within 5 mm of the loft, and of the loft's vertices within 6 mm
// of the piece: min of the two. Low = the piece is not one tube (a bow with two lobes, a ring).
function agreement(ctx, prim, ts, cp) {
  const g = geometry({ M: MB, comps: [cp] }, ctx), P = prim.pos, I = prim.idx, G = g.pos, GI = g.idx;
  const near = (A, AI, ntri, x, y, z) => { let b = Infinity; for (let t = 0; t < ntri; t++) { const e = closestOnTri(A, AI[t * 3] * 3, AI[t * 3 + 1] * 3, AI[t * 3 + 2] * 3, x, y, z)[0]; if (e < b) b = e; } return Math.sqrt(b); };
  let ok = 0, n = 0;
  const own = ts.map((t) => [I[t], I[t + 1], I[t + 2]]), sample = [];
  for (const [a, b, c] of own) { sample.push([P[a * 3], P[a * 3 + 1], P[a * 3 + 2]]); sample.push([(P[a * 3] + P[b * 3] + P[c * 3]) / 3, (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3, (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3]); }
  for (const q of sample) { n++; if (near(G, GI, GI.length / 3, q[0], q[1], q[2]) < 0.005) ok++; }
  const sub2 = new Uint32Array(ts.length * 3); ts.forEach((t, i) => { sub2[i * 3] = I[t]; sub2[i * 3 + 1] = I[t + 1]; sub2[i * 3 + 2] = I[t + 2]; });
  let ok2 = 0, n2 = 0; for (let v = 0; v < G.length / 3; v += 3) { n2++; if (near(P, sub2, ts.length, G[v * 3], G[v * 3 + 1], G[v * 3 + 2]) < 0.006) ok2++; }
  return Math.min(ok / n, ok2 / Math.max(1, n2));
}

// k-means (k = 2) on triangle centres, seeded at the two farthest centres along the principal axis
function split2(prim, ts) {
  const P = prim.pos, I = prim.idx, cen = ts.map((t) => [0, 1, 2].map((c) => (P[I[t] * 3 + c] + P[I[t + 1] * 3 + c] + P[I[t + 2] * 3 + c]) / 3)), { axis } = pca(cen);
  const pr = cen.map((c) => dot(c, axis)); let a = 0, b = 0; pr.forEach((x, i) => { if (x < pr[a]) a = i; if (x > pr[b]) b = i; });
  let C = [cen[a], cen[b]], asg = [];
  for (let it = 0; it < 10; it++) {
    asg = cen.map((c) => (Math.hypot(...sub(c, C[0])) <= Math.hypot(...sub(c, C[1])) ? 0 : 1));
    C = [0, 1].map((k) => { const m = cen.filter((_, i) => asg[i] === k); return m.length ? scl(m.reduce((q, c) => add(q, c), [0, 0, 0]), 1 / m.length) : C[k]; });
  }
  return [ts.filter((_, i) => asg[i] === 0), ts.filter((_, i) => asg[i] === 1)];
}
// a loft per piece; a piece that is not tube-like is cut in two and each half lofted, when that agrees better
function fitTree(ctx, prim, ts, depth, opts) {
  const cp = loft(ctx, prim, ts); if (!cp) return [];
  const sc = agreement(ctx, prim, ts, cp), me = [{ cp, ts, sc }];
  if (sc >= (opts.goodAt || 0.93) || depth >= (opts.depth ?? 3) || ts.length < 16) return me;
  const [A, B] = split2(prim, ts); if (A.length < 8 || B.length < 8) return me;
  const kids = [...fitTree(ctx, prim, A, depth + 1, opts), ...fitTree(ctx, prim, B, depth + 1, opts)];
  if (!kids.length) return me;
  const tot = kids.reduce((q, k) => q + k.ts.length, 0), kc = kids.reduce((q, k) => q + k.sc * k.ts.length, 0) / tot;
  return kc > sc + 0.04 ? kids : me;
}

export function fit(ctx, prim, opts = {}) {
  const comps = [], tl = [], cardT = [], P = prim.pos, I = prim.idx, H = ctx.hero;
  for (const ts of components(prim)) {
    if (ts.length < 8) { cardT.push(ts); continue; } // loose 1-7 triangle pieces cannot be a tube: one fitted quad each
    for (const k of fitTree(ctx, prim, ts, 0, opts)) { comps.push(k.cp); tl.push(k.ts); }
  }
  const t = { M: MB, comps };
  // cards: each loose piece -> centre + two PCA half axes (a flat quad), relative to its dominant bone
  if (cardT.length) t.cards = cardT.map((os) => {
    const m = new Map(); for (const o of os) for (let k = 0; k < 3; k++) { const d = prim.dom[I[o + k]]; m.set(d, (m.get(d) || 0) + 1); }
    const d = [...m].sort((a, b) => b[1] - a[1])[0][0], J = H.joint[H.nodes[d]];
    const pts = []; for (const o of os) for (let k = 0; k < 3; k++) pts.push([0, 1, 2].map((c) => P[I[o + k] * 3 + c] - J[c]));
    const { c, axis: e1 } = pca(pts), flat = pts.map((p) => { const q = sub(p, c); return add(c, sub(q, scl(e1, dot(q, e1)))); });
    let e2 = pca(flat).axis; e2 = nrm(sub(e2, scl(e1, dot(e2, e1))));
    const ext = (e) => Math.max(1e-4, ...pts.map((p) => Math.abs(dot(sub(p, c), e))));
    return { bone: H.nodes[d], q: [...c, ...scl(e1, ext(e1)), ...scl(e2, ext(e2))].map(r5), o: os };
  });
  // colour per ring vertex and joint weights per ring, from the closest original surface of the component
  const geo = geometry(t, ctx), reg = nameRegistry(ctx), hits = [], wr = [];
  comps.forEach((cp, ci) => {
    const src = makeSource(ctx, prim, tl[ci].map((o) => o / 3));
    cp.rings.forEach((_, ri) => {
      const wm = new Map();
      for (let m = 0; m < MB; m++) { const o = (geo.ringBase[ci] + ri * MB + m) * 3, h = src.at(geo.pos[o], geo.pos[o + 1], geo.pos[o + 2]); hits.push(h); for (const [n, w] of h.w) wm.set(n, (wm.get(n) || 0) + w); }
      wr.push(...reg.pack(wm));
    });
  });
  const cw = [];
  for (const g of t.cards || []) {
    const src = makeSource(ctx, prim, g.o.map((o) => o / 3)), J = H.joint[g.bone], v = cardTris(g.q);
    for (let i = 0; i < v.length; i += 3) { const h = src.at(v[i] + J[0], v[i + 1] + J[1], v[i + 2] + J[2]); hits.push(h); cw.push(...reg.pack(h.w)); }
    delete g.o;
  }
  const q = quantize(sampleColors(ctx, prim, hits));
  const nc = comps.reduce((a, c) => a + c.rings.length * MB, 0);
  t.pal = q.pal; t.cb = encIdx(q.idx.slice(0, nc)); t.cc = encIdx(q.idx.slice(nc)); t.wn = reg.names; t.anc = reg.anc; t.wr = wr; t.cw = cw;
  return t;
}

// bind-pose geometry; ringBase[c] = first vertex of component c's rings, capBase[c] = its two apex vertices
function geometry(t, ctx) {
  const pos = [], idx = [], M = t.M, ringBase = [], capBase = [];
  for (const cp of t.comps) {
    const J = ctx.hero.joint[cp.bone], c = [J[0] + cp.o[0], J[1] + cp.o[1], J[2] + cp.o[2]], base = pos.length / 3;
    const R = cp.rings; ringBase.push(base);
    for (const r of R) {
      const O = [0, 1, 2].map((d) => c[d] + cp.ax[d] * r[0] + cp.u[d] * r[1] + cp.v[d] * r[2]);
      for (let m = 0; m < M; m++) {
        const th = (m / M) * Math.PI * 2; let rad = r[3];
        for (let k = 1; k <= K; k++) rad += r[3 + 2 * k - 1] * Math.cos(k * th) + r[3 + 2 * k] * Math.sin(k * th);
        rad = Math.max(rad, 0.0005); const a = Math.cos(th) * rad, b = Math.sin(th) * rad;
        pos.push(O[0] + cp.u[0] * a + cp.v[0] * b, O[1] + cp.u[1] * a + cp.v[1] * b, O[2] + cp.u[2] * a + cp.v[2] * b);
      }
    }
    for (let k = 0; k + 1 < R.length; k++) for (let m = 0; m < M; m++) {
      const a = base + k * M + m, b = base + k * M + (m + 1) % M, c2 = a + M, d = b + M; idx.push(a, b, c2, b, d, c2);
    }
    // end caps: apex at the extreme of the axis, over the end ring's centre
    capBase.push(pos.length / 3);
    for (const [ri, s] of [[0, cp.lo], [R.length - 1, cp.hi]]) {
      const r = R[ri], O = [0, 1, 2].map((d) => c[d] + cp.ax[d] * s + cp.u[d] * r[1] + cp.v[d] * r[2]), ap = pos.length / 3; pos.push(...O);
      for (let m = 0; m < M; m++) { const a = base + ri * M + m, b = base + ri * M + (m + 1) % M; idx.push(a, b, ap); }
    }
  }
  const cardBase = pos.length / 3;
  for (const g of t.cards || []) { const J = ctx.hero.joint[g.bone], v = cardTris(g.q); for (let i = 0; i < v.length; i += 9) { const b = pos.length / 3; for (let k = 0; k < 3; k++) pos.push(v[i + k * 3] + J[0], v[i + k * 3 + 1] + J[1], v[i + k * 3 + 2] + J[2]); idx.push(b, b + 1, b + 2); } }
  return { pos: Float32Array.from(pos), idx: Uint32Array.from(idx), ringBase, capBase, cardBase };
}

export function build(t, ctx) {
  const { pos, idx, ringBase, capBase, cardBase } = geometry(t, ctx), n = pos.length / 3, M = t.M;
  const col = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  if (!t.cb) { col.fill(0.5); for (let v = 0; v < n; v++) sw[v * 4] = 1; return { pos, idx, col, si, sw }; }
  const cb = decIdx(t.cb), res = resolveNames(t.wn, t.anc, ctx);
  let ring = 0;
  t.comps.forEach((cp, ci) => {
    cp.rings.forEach((_, ri) => {
      const row = t.wr.slice((ring + ri) * 6, (ring + ri) * 6 + 6);
      for (let m = 0; m < M; m++) { const v = ringBase[ci] + ri * M + m, p = t.pal[cb[(ring + ri) * M + m]]; col.set(p, v * 3); putWeights(si, sw, v, row, res); }
    });
    [0, cp.rings.length - 1].forEach((ri, k) => { // apex takes the end ring's first colour and weights
      const v = capBase[ci] + k, w = ringBase[ci] + ri * M; col.set(col.subarray(w * 3, w * 3 + 3), v * 3); si.set(si.subarray(w * 4, w * 4 + 4), v * 4); sw.set(sw.subarray(w * 4, w * 4 + 4), v * 4);
    });
    ring += cp.rings.length;
  });
  if (t.cards) { const cc = decIdx(t.cc || ''); for (let v = cardBase; v < n; v++) { col.set(t.pal[cc[v - cardBase]], v * 3); putWeights(si, sw, v, t.cw.slice((v - cardBase) * 6, (v - cardBase) * 6 + 6), res); } }
  return { pos, idx, col, si, sw };
}
