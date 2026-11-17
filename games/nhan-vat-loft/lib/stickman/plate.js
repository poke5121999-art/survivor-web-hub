// Second stickman primitive: a plate, i.e. two height fields (top and bottom) over a polar grid around an axis.
//   { kind:'plate', o:[3], d:[3], step (m), top:[[MP heights in mm per radial ring]], bot:[[...]], pal, rle (top cells then bottom cells) }
// Ring k sits at radius k*step from o in the plane normal to d; heights are measured along d. Plates carry what rings
// along an axis cannot: hat brims, flat ribbons and straps, glasses. Covered cells form a slab, closed along its rim.
import { hits, frame, sub, dot, nrm } from './loft.js';
export const MP = 64;

// ---------- fit (node) ----------
export function fitPlate(T, axis, opts = {}) {
  const step = opts.step || 0.008, d = nrm(axis.d), { u, v } = frame(d), tris = T.map((t) => t.p);
  let rmax = 0, hlo = Infinity, hhi = -Infinity;
  for (const tr of tris) for (const p of tr) { const q = sub(p, axis.o), h = dot(q, d); hlo = Math.min(hlo, h); hhi = Math.max(hhi, h); rmax = Math.max(rmax, Math.hypot(dot(q, u), dot(q, v))); }
  const K = Math.max(2, Math.ceil(rmax / step) + 1);
  // 2D buckets in the plate plane: a vertical ray at (x, y) can only hit triangles whose footprint box holds it
  const B = 0.03, grid = new Map(), cell = (x, y) => `${Math.floor(x / B)},${Math.floor(y / B)}`;
  tris.forEach((tr, k) => {
    const xs = tr.map((p) => dot(sub(p, axis.o), u)), ys = tr.map((p) => dot(sub(p, axis.o), v));
    for (let gx = Math.floor(Math.min(...xs) / B); gx <= Math.floor(Math.max(...xs) / B); gx++) for (let gy = Math.floor(Math.min(...ys) / B); gy <= Math.floor(Math.max(...ys) / B); gy++) {
      const key = `${gx},${gy}`; (grid.get(key) || grid.set(key, []).get(key)).push(k);
    }
  });
  const pt = (rho, a) => [Math.cos(a) * rho, Math.sin(a) * rho];
  const cast = (x, y, top) => {
    const K2 = grid.get(cell(x, y)) || [], from = top ? hhi + 0.05 : hlo - 0.05;
    const o = [0, 1, 2].map((q) => axis.o[q] + u[q] * x + v[q] * y + d[q] * from), w = top ? d.map((c) => -c) : d;
    const h = hits(K2.map((k) => tris[k]), o, w, true); if (!h) return null;
    h.k = K2[h.k]; h.h = top ? from - h.s : from + h.s; return h;
  };
  const colourOf = (h) => { const c = T[h.k].c, b0 = 1 - h.b1 - h.b2; return [0, 1, 2].map((q) => b0 * c[0][q] + h.b1 * c[1][q] + h.b2 * c[2][q]); };
  const key = (c) => c.map((x) => Math.round(x * 64)).join(',');
  const layers = [true, false].map((top) => {
    const H = Array.from({ length: K }, (_, k) => Array.from({ length: MP }, (_, j) => { const [x, y] = pt(k * step, (j / MP) * 2 * Math.PI); const h = cast(x, y, top); return h ? h.h : null; }));
    const cov = [], col = [];
    for (let k = 0; k + 1 < K; k++) for (let j = 0; j < MP; j++) {
      const votes = new Map(); let centre = null;
      for (let sk = 0; sk < 3; sk++) for (let sj = 0; sj < 3; sj++) {
        const [x, y] = pt((k + (sk + 0.5) / 3) * step, ((j + (sj + 0.5) / 3) / MP) * 2 * Math.PI), h = cast(x, y, top);
        if (sk === 1 && sj === 1) centre = h; if (!h) continue;
        const c = colourOf(h), e = votes.get(key(c)) || votes.set(key(c), { n: 0, c }).get(key(c)); e.n++;
      }
      cov.push(!!centre); col.push(votes.size ? [...votes.values()].sort((a, b) => b.n - a.n)[0].c : null);
    }
    // heights of nodes that missed: nearest hit along the same spoke, then around the ring, else the mean
    const all = H.flat().filter((x) => x !== null), mean = all.length ? all.reduce((s, x) => s + x, 0) / all.length : 0;
    for (let j = 0; j < MP; j++) for (let k = 0; k < K; k++) if (H[k][j] === null) {
      for (let s = 1; s < K && H[k][j] === null; s++) { if (k - s >= 0 && H[k - s][j] !== null) H[k][j] = H[k - s][j]; else if (k + s < K && H[k + s][j] !== null) H[k][j] = H[k + s][j]; }
    }
    for (const ring of H) for (let j = 0; j < MP; j++) if (ring[j] === null) ring[j] = mean;
    return { H, cov, col };
  });
  const hex = (c) => c.map((x) => Math.round(Math.pow(Math.max(0, Math.min(1, x)), 1 / 2.2) * 255).toString(16).padStart(2, '0')).join('');
  const pal = [], rle = [];
  for (const L of layers) for (let i = 0; i < L.cov.length; i++) {
    let x = -1; if (L.cov[i]) { const h = hex(L.col[i] || [0.5, 0.5, 0.5]); x = pal.indexOf(h); if (x < 0) { x = pal.length; pal.push(h); } }
    if (rle.length && rle[rle.length - 1][1] === x) rle[rle.length - 1][0]++; else rle.push([1, x]);
  }
  const R = (x) => Math.round(x * 1e4) / 1e4;
  return { kind: 'plate', o: axis.o.map(R), d: d.map(R), step: R(step), top: layers[0].H.map((r) => r.map((x) => Math.round(x * 1000))), bot: layers[1].H.map((r) => r.map((x) => Math.round(x * 1000))), pal, rle: rle.flat() };
}

// ---------- build (browser-safe) ----------
export function buildPlate(L, weights) {
  const d = L.d, { u, v } = frame(d), K = L.top.length, n = (K - 1) * MP;
  const cells = []; for (let k = 0; k < L.rle.length; k += 2) for (let c = 0; c < L.rle[k]; c++) cells.push(L.rle[k + 1]);
  const pal = L.pal.map((h) => [0, 2, 4].map((o) => Math.pow(parseInt(h.slice(o, o + 2), 16) / 255, 2.2)));
  const node = (H, k, j) => { const a = (j / MP) * 2 * Math.PI, rho = k * L.step, h = H[k][j % MP] / 1000; return [0, 1, 2].map((q) => L.o[q] + (u[q] * Math.cos(a) + v[q] * Math.sin(a)) * rho + d[q] * h); };
  const w = weights ? weights(L.o) : [[0, 1]];
  const pos = [], nr = [], col = [], idx = [], si = [], sw = [];
  const push = (p, nn, c) => { pos.push(...p); nr.push(...nn); col.push(...c); for (let s = 0; s < 4; s++) { si.push(w[s] ? w[s][0] : 0); sw.push(w[s] ? w[s][1] : 0); } return pos.length / 3 - 1; };
  const face = (P, c, flip) => { // quad with a flat normal
    const e1 = [0, 1, 2].map((q) => P[1][q] - P[0][q]), e2 = [0, 1, 2].map((q) => P[2][q] - P[0][q]);
    let fn = nrm([e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]); if (flip) fn = fn.map((x) => -x);
    const ids = P.map((p) => push(p, fn, c)); if (flip) idx.push(ids[0], ids[2], ids[1], ids[0], ids[3], ids[2]); else idx.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
  };
  [[L.top, 0, false], [L.bot, n, true]].forEach(([H, off, flip]) => {
    for (let k = 0; k + 1 < K; k++) for (let j = 0; j < MP; j++) {
      const ci = cells[off + k * MP + j]; if (ci === undefined || ci < 0) continue;
      face([node(H, k, j), node(H, k + 1, j), node(H, k + 1, j + 1), node(H, k, j + 1)], pal[ci], flip);
      // rim: where this cell borders an uncovered cell (or the outer edge) in its own layer, wall it down to the other layer
      const other = flip ? L.top : L.bot, isCov = (kk, jj) => kk >= 0 && kk + 1 < K && cells[off + kk * MP + ((jj + MP) % MP)] >= 0;
      if (!isCov(k + 1, j)) face([node(H, k + 1, j), node(other, k + 1, j), node(other, k + 1, j + 1), node(H, k + 1, j + 1)], pal[ci], flip);
      if (k > 0 && !isCov(k - 1, j)) face([node(H, k, j + 1), node(other, k, j + 1), node(other, k, j), node(H, k, j)], pal[ci], flip);
      if (!isCov(k, j + 1)) face([node(H, k, j + 1), node(H, k + 1, j + 1), node(other, k + 1, j + 1), node(other, k, j + 1)], pal[ci], !flip);
      if (!isCov(k, j - 1)) face([node(H, k, j), node(other, k, j), node(other, k + 1, j), node(H, k + 1, j)], pal[ci], !flip);
    }
  });
  return { pos: new Float32Array(pos), nrm: new Float32Array(nr), col: new Float32Array(col), idx: new Uint32Array(idx), si: new Uint16Array(si), sw: new Float32Array(sw) };
}
