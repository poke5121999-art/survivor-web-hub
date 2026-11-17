// One code primitive for every stickman part: a loft along an axis. A loft is
//   { o:[3], d:[3], u:[3], st:[t...], r:[[M radii in mm per station]...], cov:[bitmask per station-gap], col:{pal, rle} }
// Station i is the ring at o + d*t_i; its M radii are measured outward along u*cos + v*sin (v = d x u).
// fitLoft (node) reads radii off the original triangles by ray casting (outermost hit). buildLoft (browser-safe) turns a
// loft back into triangles with per-cell colour and smooth normals.
export const M = 32;

export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const frame = (d) => { const u = nrm(crs(d, Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])); return { u, v: crs(d, u) }; };

// ---------- fit (node) ----------
export function hits(tris, o, w, near = false) { // farthest (or nearest) positive hit of ray o + s*w: { s, k, b1, b2 } or null
  let best = null;
  for (let k = 0; k < tris.length; k++) {
    const [a, b, c] = tris[k], e1 = sub(b, a), e2 = sub(c, a), p = crs(w, e2), det = dot(e1, p);
    if (Math.abs(det) < 1e-12) continue;
    const id = 1 / det, tv = sub(o, a), b1 = dot(tv, p) * id; if (b1 < 0 || b1 > 1) continue;
    const qv = crs(tv, e1), b2 = dot(w, qv) * id; if (b2 < 0 || b1 + b2 > 1) continue;
    const s = dot(e2, qv) * id; if (s > 1e-6 && (!best || (near ? s < best.s : s > best.s))) best = { s, k, b1, b2 };
  }
  return best;
}

// tris: [{ p:[a,b,c], c:[ca,cb,cc] }] ; axis { o, d } ; opts { step (m), closed }
export function fitLoft(T, axis, opts = {}) {
  const step = opts.step || 0.012, d = nrm(axis.d), { u, v } = frame(d);
  const tris = T.map((t) => t.p);
  let lo = Infinity, hi = -Infinity;
  for (const t of tris) for (const p of t) { const s = dot(sub(p, axis.o), d); lo = Math.min(lo, s); hi = Math.max(hi, s); }
  const n = Math.max(3, Math.round((hi - lo) / step) + 1), eps = 0.0005;
  const st = Array.from({ length: n }, (_, i) => lo + eps + (hi - lo - 2 * eps) * i / (n - 1));
  const dir = (j) => { const a = (j / M) * 2 * Math.PI; return [u[0] * Math.cos(a) + v[0] * Math.sin(a), u[1] * Math.cos(a) + v[1] * Math.sin(a), u[2] * Math.cos(a) + v[2] * Math.sin(a)]; };
  const at = (t) => [axis.o[0] + d[0] * t, axis.o[1] + d[1] * t, axis.o[2] + d[2] * t];
  // a ray in the ring plane at t can only hit triangles whose extent along d spans t
  const span = tris.map((tr) => { const s = tr.map((p) => dot(sub(p, axis.o), d)); return [Math.min(...s), Math.max(...s)]; });
  const ids = (t) => { const out = []; for (let k = 0; k < span.length; k++) if (span[k][0] <= t && t <= span[k][1]) out.push(k); return out; };
  const cast = (t, w) => { const K = ids(t), h = hits(K.map((k) => tris[k]), at(t), w); if (h) h.k = K[h.k]; return h; };
  // radii at ring nodes
  const r = st.map((t) => Array.from({ length: M }, (_, j) => { const h = cast(t, dir(j)); return h ? h.s : null; }));
  // cells (station gap i, bin j): covered if the ray through the cell centre hits; colour of that hit
  // cells (station gap i, bin j): covered if the ray through the cell centre hits; colour = the most common texel
  // colour over a 3 x 3 grid of rays inside the cell (one ray picks up thin seams and button edges as noise)
  const cells = [], colours = [];
  const key = (c) => c.map((x) => Math.round(x * 64)).join(',');
  for (let i = 0; i + 1 < n; i++) for (let j = 0; j < M; j++) {
    const votes = new Map(); let centre = null;
    for (let si = 0; si < 3; si++) for (let sj = 0; sj < 3; sj++) {
      const t = st[i] + (st[i + 1] - st[i]) * (si + 0.5) / 3, a = ((j + (sj + 0.5) / 3) / M) * 2 * Math.PI;
      const h = cast(t, [u[0] * Math.cos(a) + v[0] * Math.sin(a), u[1] * Math.cos(a) + v[1] * Math.sin(a), u[2] * Math.cos(a) + v[2] * Math.sin(a)]);
      if (si === 1 && sj === 1) centre = h;
      if (!h) continue;
      const c = T[h.k].c, b0 = 1 - h.b1 - h.b2, col = [0, 1, 2].map((q) => b0 * c[0][q] + h.b1 * c[1][q] + h.b2 * c[2][q]), k = key(col);
      const e = votes.get(k) || votes.set(k, { n: 0, col }).get(k); e.n++;
    }
    cells.push(!!centre || !!opts.closed);
    colours.push(votes.size ? [...votes.values()].sort((x, y) => y.n - x.n)[0].col : null);
  }
  // fill missing node radii around each ring from the nearest hits (closed rings, or nodes bordering covered cells)
  for (const ring of r) {
    if (ring.every((x) => x === null)) { ring.fill(0); continue; }
    for (let j = 0; j < M; j++) if (ring[j] === null) {
      let a = 1, b = 1; while (ring[(j - a + M) % M] === null) a++; while (ring[(j + b) % M] === null) b++;
      ring[j] = (ring[(j - a + M) % M] * b + ring[(j + b) % M] * a) / (a + b);
    }
  }
  // colour: fill uncovered-but-kept cells from neighbours, then palette + run-length indices
  for (let k = 0; k < colours.length; k++) if (!colours[k] && cells[k]) {
    for (let s = 1; s < M; s++) { const c = colours[k - (k % M) + ((k % M) + s) % M]; if (c) { colours[k] = c; break; } }
    if (!colours[k]) colours[k] = [0.5, 0.5, 0.5];
  }
  const hex = (c) => c ? c.map((x) => Math.round(Math.pow(Math.max(0, Math.min(1, x)), 1 / 2.2) * 255).toString(16).padStart(2, '0')).join('') : null;
  const pal = [], idx = colours.map((c) => { const h = hex(c); if (!h) return -1; let i = pal.indexOf(h); if (i < 0) { i = pal.length; pal.push(h); } return i; });
  const rle = []; for (let k = 0; k < idx.length; k++) { const x = cells[k] ? idx[k] : -1; if (rle.length && rle[rle.length - 1][1] === x) rle[rle.length - 1][0]++; else rle.push([1, x]); }
  const R = (x, f = 1e4) => Math.round(x * f) / f;
  return { o: axis.o.map((x) => R(x)), d: d.map((x) => R(x)), st: st.map((x) => R(x)), r: r.map((ring) => ring.map((x) => Math.round(x * 1000))), pal, rle: rle.flat() };
}

// ---------- build (browser-safe) ----------
// weights(point) -> [[boneIndex, w], ...] optional, for skinning. Returns { pos, nrm, col, idx, si, sw } typed arrays.
export function buildLoft(L, weights) {
  const d = L.d, { u, v } = frame(d), n = L.st.length;
  const node = (i, j) => { const a = (j / M) * 2 * Math.PI, rr = L.r[i][j % M] / 1000, t = L.st[i];
    return [L.o[0] + d[0] * t + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * rr, L.o[1] + d[1] * t + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * rr, L.o[2] + d[2] * t + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * rr]; };
  const P = []; for (let i = 0; i < n; i++) for (let j = 0; j < M; j++) P.push(node(i, j));
  const cellIdx = []; for (let k = 0; k < L.rle.length; k += 2) for (let c = 0; c < L.rle[k]; c++) cellIdx.push(L.rle[k + 1]);
  // smooth normals per ring node from all cells around it (covered or not, so hems keep the body's curvature)
  const N = P.map(() => [0, 0, 0]);
  for (let i = 0; i + 1 < n; i++) for (let j = 0; j < M; j++) {
    const a = i * M + j, b = i * M + (j + 1) % M, c = (i + 1) * M + (j + 1) % M, e = (i + 1) * M + j;
    for (const [x, y, z] of [[a, b, c], [a, c, e]]) { const f = crs(sub(P[y], P[x]), sub(P[z], P[x])); for (const q of [x, y, z]) for (let s = 0; s < 3; s++) N[q][s] += f[s]; }
  }
  const pal = L.pal.map((h) => [0, 2, 4].map((o) => Math.pow(parseInt(h.slice(o, o + 2), 16) / 255, 2.2)));
  const pos = [], nr = [], col = [], si = [], sw = [], idx = [];
  const W = weights ? L.st.map((t) => weights([L.o[0] + d[0] * t, L.o[1] + d[1] * t, L.o[2] + d[2] * t])) : null;
  const push = (q, i, c) => {
    pos.push(...P[q]); const m = nrm(N[q]); nr.push(...m); col.push(...c);
    const w = W ? W[i] : [[0, 1]]; for (let s = 0; s < 4; s++) { si.push(w[s] ? w[s][0] : 0); sw.push(w[s] ? w[s][1] : 0); }
    return pos.length / 3 - 1;
  };
  for (let i = 0; i + 1 < n; i++) for (let j = 0; j < M; j++) {
    const ci = cellIdx[i * M + j]; if (ci === undefined || ci < 0) continue;
    const c = pal[ci], a = push(i * M + j, i, c), b = push(i * M + (j + 1) % M, i, c), cc = push((i + 1) * M + (j + 1) % M, i + 1, c), e = push((i + 1) * M + j, i + 1, c);
    idx.push(a, b, cc, a, cc, e);
  }
  // caps: close the first/last ring when the whole ring is covered (body ends, hat crowns)
  for (const [i, i2, flip] of [[0, 1, true], [n - 1, n - 2, false]]) {
    const gap = Math.min(i, i2), row = cellIdx.slice(gap * M, gap * M + M);
    if (row.some((x) => x < 0) || !L.r[i].some((x) => x > 0)) continue;
    const t = L.st[i], cpt = [L.o[0] + d[0] * t, L.o[1] + d[1] * t, L.o[2] + d[2] * t];
    const cn = flip ? [-d[0], -d[1], -d[2]] : d, c = pal[row[0]];
    const centre = pos.length / 3; pos.push(...cpt); nr.push(...cn); col.push(...c);
    const w = W ? W[i] : [[0, 1]]; for (let s = 0; s < 4; s++) { si.push(w[s] ? w[s][0] : 0); sw.push(w[s] ? w[s][1] : 0); }
    for (let j = 0; j < M; j++) {
      const a = pos.length / 3; pos.push(...P[i * M + j], ...P[i * M + (j + 1) % M]); nr.push(...cn, ...cn); col.push(...pal[row[j]], ...pal[row[j]]);
      for (let s = 0; s < 8; s++) { si.push(w[s % 4] ? w[s % 4][0] : 0); sw.push(w[s % 4] ? w[s % 4][1] : 0); }
      if (flip) idx.push(centre, a + 1, a); else idx.push(centre, a, a + 1);
    }
  }
  return { pos: new Float32Array(pos), nrm: new Float32Array(nr), col: new Float32Array(col), idx: new Uint32Array(idx), si: new Uint16Array(si), sw: new Float32Array(sw) };
}
