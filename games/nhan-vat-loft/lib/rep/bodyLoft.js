// bodyLoft: the skin submesh alone as Fourier-6 / superellipse ring lofts per bone chain.
// Table = chain names, joint NAMES (real, or virtual = anchor joint + k*(other - anchor) + offset*heroScale),
// extensions as fractions of the end segments, ring counts per extended segment, ring profiles (centre + shape in the
// ring frame). No positions of the fitted hero are stored, so build() works on any skeleton with the same joint names.
// Contract v2: per ring a colour row (palette letters, run-length) and the ring's top-3 original joints by NAME
// (table.pal / jn / janc shared by all chains); build() returns { pos, idx, col, si, sw }.
// This file also holds the paint helpers (texture hit per ring x angle bin, joint weights) used by shell and strips.
// build() runs in a browser: node-only modules load only under node, through a guarded dynamic import.
import { v3, makePolyline, plPoint, plTangent, frame, ringTs, profR } from '../../lib/loft-core.js';

const NODE = typeof process !== 'undefined' && !!(process.versions && process.versions.node);
const FITM = NODE ? await import('../../tools/fit.js') : null;
const GLB = NODE ? await import('../../tools/glb.js') : null;
const FS = NODE ? (await import('node:fs')).default : null;
const CP = NODE ? await import('node:child_process') : null;
const URLP = NODE ? await import('node:url') : null;
export const nodeLibs = () => { if (!NODE) throw new Error('fit() runs under node only'); return { FITM, GLB, FS, CP }; };

export const BODYJ = /^(Root_M|RootPart|Spine|BackA|BackB|Chest_M|Neck|Head_M|HeadEnd|Jaw|Eye|Scapula|Shoulder|Elbow|Wrist|Cup|.*Finger|Hip_|HipPart|Knee|Ankle|.*Toe|Chest_[LR])/;

// ---------- paint (fit side, node): texel at a uv of a prim, raw RGB cache per hero written by work/dump-tex.py ----------
const TEX = new Map();
function texture(hero, i) {
  const key = hero + '/' + i; if (TEX.has(key)) return TEX.get(key);
  const dir = new URL(`../../work/tex/${hero}/`, import.meta.url), ix = new URL('index.json', dir);
  if (!FS.existsSync(ix)) {
    const r = CP.spawnSync('python', [URLP.fileURLToPath(new URL('../../work/dump-tex.py', import.meta.url)), hero], { timeout: 180000, encoding: 'utf8' });
    if (r.status !== 0) throw new Error('texture dump failed: ' + (r.stderr || r.error));
  }
  const dims = JSON.parse(FS.readFileSync(ix, 'utf8'))[String(i)];
  const t = dims ? { w: dims[0], h: dims[1], d: FS.readFileSync(new URL(i + '.rgb', dir)) } : null;
  TEX.set(key, t); return t;
}
function texel(hero, prim, uv) {
  const f = prim.color || [1, 1, 1, 1], t = prim.tex !== null && prim.tex !== undefined && uv ? texture(hero, prim.tex) : null;
  if (!t) return [f[0], f[1], f[2]];
  const x = Math.floor((((uv[0] % 1) + 1) % 1) * t.w) % t.w, y = Math.floor((((uv[1] % 1) + 1) % 1) * t.h) % t.h, o = (y * t.w + x) * 3;
  return [(t.d[o] / 255) * f[0], (t.d[o + 1] / 255) * f[1], (t.d[o + 2] / 255) * f[2]];
}

// plane slice of prim triangles: segments in the ring frame relative to c2, with uv at both ends and the triangle id
export function sliceUV(prim, tris, O, T, u, v, c2 = [0, 0], rmax = Infinity) {
  const segs = [], P = prim.pos, UV = prim.uv;
  for (const t of tris) {
    const ii = [prim.idx[t * 3], prim.idx[t * 3 + 1], prim.idx[t * 3 + 2]], q = ii.map((i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
    const d = q.map((x) => (x[0] - O[0]) * T[0] + (x[1] - O[1]) * T[1] + (x[2] - O[2]) * T[2]), pts = [];
    for (let e = 0; e < 3; e++) {
      const a = e, b = (e + 1) % 3; if ((d[a] > 0) === (d[b] > 0)) continue;
      const f = d[a] / (d[a] - d[b]), w = v3.sub(v3.lerp(q[a], q[b], f), O);
      pts.push({ p: [v3.dot(w, u) - c2[0], v3.dot(w, v) - c2[1]],
        uv: UV ? [UV[ii[a] * 2] + (UV[ii[b] * 2] - UV[ii[a] * 2]) * f, UV[ii[a] * 2 + 1] + (UV[ii[b] * 2 + 1] - UV[ii[a] * 2 + 1]) * f] : null });
    }
    if (pts.length === 2 && Math.hypot(...pts[0].p) < rmax && Math.hypot(...pts[1].p) < rmax) segs.push({ a: pts[0].p, b: pts[1].p, ua: pts[0].uv, ub: pts[1].uv, t });
  }
  return segs;
}
// per angle bin m (theta = 2 pi m / M from the slice origin): outermost and innermost hit { k, uv, t } or null
export function rayHits(segs, M) {
  const out = new Array(M).fill(null), inn = new Array(M).fill(null);
  for (let m = 0; m < M; m++) {
    const th = (m / M) * Math.PI * 2, dx = Math.cos(th), dy = Math.sin(th);
    for (const s of segs) {
      const a = s.a, b = s.b, ex = b[0] - a[0], ey = b[1] - a[1], den = dx * ey - dy * ex; if (Math.abs(den) < 1e-12) continue;
      const k = (a[0] * ey - a[1] * ex) / den, w = (a[0] * dy - a[1] * dx) / den; if (!(k > 0 && w >= 0 && w <= 1)) continue;
      const h = () => ({ k, t: s.t, uv: s.ua ? [s.ua[0] + (s.ub[0] - s.ua[0]) * w, s.ua[1] + (s.ub[1] - s.ua[1]) * w] : null });
      if (!out[m] || k > out[m].k) out[m] = h();
      if (!inn[m] || k < inn[m].k) inn[m] = h();
    }
  }
  return { out, inn };
}

// row codes: palette letters with run lengths ("a12b3"); lists of rows run-length coded as "row*count"
const LET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const rleList = (a) => { const o = []; for (let i = 0; i < a.length;) { let j = i; while (j + 1 < a.length && a[j + 1] === a[i]) j++; o.push(j > i ? `${a[i]}*${j - i + 1}` : a[i]); i = j + 1; } return o; };
export const unrleList = (a) => { const o = []; for (const s of a || []) { const m = /^(.*)\*(\d+)$/.exec(s); if (m) for (let k = 0; k < +m[2]; k++) o.push(m[1]); else o.push(s); } return o; };
const encRow = (ids) => { let s = ''; for (let i = 0; i < ids.length;) { let j = i; while (j + 1 < ids.length && ids[j + 1] === ids[i]) j++; s += LET[ids[i]] + (j > i ? j - i + 1 : ''); i = j + 1; } return s; };
export const decRow = (s) => { const o = []; for (const m of String(s).matchAll(/([a-zA-Z])(\d*)/g)) for (let k = 0; k < (m[2] ? +m[2] : 1); k++) o.push(LET.indexOf(m[1])); return o; };

const nearestC = (C, p) => { let b = 0, bd = 1e9; C.forEach((c, i) => { const d = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2; if (d < bd) { bd = d; b = i; } }); return b; };
// k-means palette (sRGB), as tools/fit-char.mjs
function palette(cols, k) {
  const uniq = [...new Map(cols.map((c) => [c.map((x) => x.toFixed(3)).join(), c])).values()];
  if (uniq.length <= 4) return uniq.map((c) => c.map((x) => +x.toFixed(3)));
  const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2], srt = [...cols].sort((a, b) => lum(a) - lum(b));
  let C = []; for (let i = 0; i < k; i++) C.push(srt[Math.floor(((i + 0.5) * srt.length) / k)]);
  for (let it = 0; it < 12; it++) {
    const s = C.map(() => [0, 0, 0, 0]); for (const p of cols) { const b = nearestC(C, p); s[b][0] += p[0]; s[b][1] += p[1]; s[b][2] += p[2]; s[b][3]++; }
    C = C.map((c, i) => (s[i][3] ? [s[i][0] / s[i][3], s[i][1] / s[i][3], s[i][2] / s[i][3]] : c));
  }
  for (let i = 0; i < C.length; i++) for (let j = C.length - 1; j > i; j--) if (Math.hypot(C[i][0] - C[j][0], C[i][1] - C[j][1], C[i][2] - C[j][2]) < PAL_MERGE) C.splice(j, 1);
  return C.map((c) => c.map((x) => +x.toFixed(3)));
}
const PAL_MERGE = 0.04;
// null entries take the nearest non-null neighbour in the sequence
function fillSeq(a, dflt) { return a.map((x, i) => { if (x != null) return x; for (let d = 1; d < a.length; d++) { if (a[i - d] != null) return a[i - d]; if (a[i + d] != null) return a[i + d]; } return dflt(i); }); }
// top-3 joints, percent weights; the last weight is the remainder ("a60b30c")
function encW(m) {
  const top = [...m].sort((x, y) => y[1] - x[1]).slice(0, 3), s = top.reduce((q, x) => q + x[1], 0); let out = '';
  top.forEach(([j, w], k) => { const p = Math.round((w / s) * 100); out += LET[j] + (k === top.length - 1 ? '' : p); });
  return out;
}

// painter for one part fit: hit(uv) -> raw colour id, wmap(segs) -> joint weight map of the cut triangles,
// attach(target, rows, wmaps) records rows to encode, finish() -> { pal, jn, janc } and writes target[ckey] / target[wkey]
export function painter(ctx, prim, K = 24, darkCut = 0) {
  const H = ctx.hero, cols = [], jix = new Map(), jn = [], att = [];
  const hit = (uv) => { cols.push(texel(H.name, prim, uv)); return cols.length - 1; };
  const jid = (node) => { const n = H.nodes[node]; if (!jix.has(n)) { if (jn.length >= LET.length) return 0; jix.set(n, jn.length); jn.push(n); } return jix.get(n); };
  const wmap = (segs) => {
    if (!segs || !segs.length) return null; const m = new Map();
    for (const s of segs) for (let c = 0; c < 3; c++) { const vi = prim.idx[s.t * 3 + c]; for (let k = 0; k < 4; k++) { const w = prim.jw[vi * 4 + k]; if (w > 0) { const j = jid(prim.jn[vi * 4 + k]); m.set(j, (m.get(j) || 0) + w); } } }
    return m;
  };
  const attach = (target, rows, wmaps, ckey = 'col', wkey = 'w', allowEmpty = false) => att.push({ target, rows, wmaps, ckey, wkey, allowEmpty });
  function finish() {
    // skin textures paint hidden areas (under clothes, the face hole) near black: drop texels far darker than the median
    if (darkCut > 0) {
      const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2], L = [];
      for (const a of att) for (const r of a.rows) for (const i of r) if (i >= 0) L.push(lum(cols[i]));
      L.sort((x, y) => x - y); const cut = darkCut * (L[L.length >> 1] || 0);
      for (const a of att) a.rows = a.rows.map((r) => r.map((i) => (i >= 0 && lum(cols[i]) < cut ? -1 : i)));
    }
    const used = []; for (const a of att) for (const r of a.rows) for (const i of r) if (i >= 0) used.push(cols[i]);
    const baseC = texel(H.name, prim, null); if (!used.length) used.push(baseC);
    const pal = palette(used, K), map = new Map(), pix = (i) => { if (!map.has(i)) map.set(i, nearestC(pal, cols[i])); return map.get(i); };
    const base = nearestC(pal, baseC);
    for (const a of att) {
      const fillRow = (r) => { if (r.every((i) => i < 0)) return null; const n = r.length;
        return r.map((i, m) => { if (i >= 0) return pix(i); for (let d = 1; d < n; d++) { const x = r[(m + d) % n], y = r[(m - d + n) % n]; if (x >= 0) return pix(x); if (y >= 0) return pix(y); } return base; }); };
      const rows = a.rows.map(fillRow);
      a.target[a.ckey] = a.allowEmpty ? rleList(rows.map((r) => (r ? encRow(r) : ''))) : rleList(fillSeq(rows, (i) => a.rows[i].map(() => base)).map(encRow));
      if (a.wmaps) a.target[a.wkey] = rleList(fillSeq(a.wmaps.map((m) => (m && m.size ? encW(m) : null)), () => ''));
    }
    // ancestors of every used joint up to the first body joint or used joint, for skeletons that lack it
    const byName = new Map(H.nodes.map((n, i) => [n, i]));
    const janc = jn.map((n) => { const o = []; let i = H.parent[byName.get(n)]; while (i >= 0 && o.length < 24) { o.push(H.nodes[i]); if (BODYJ.test(H.nodes[i]) || jix.has(H.nodes[i])) break; i = H.parent[i]; } return o; });
    return { pal, jn, janc };
  }
  return { hit, wmap, attach, finish };
}

// ---------- build side (browser-safe) ----------
// weight code -> { si: [4], sw: [4] } against ctx.skel.names (a joint the skeleton lacks falls back to its nearest ancestor present)
export function wres(table, ctx) {
  const names = ctx.skel && ctx.skel.names, ix = new Map((names || []).map((n, i) => [n, i])), cache = new Map();
  const root = ix.has('Root_M') ? ix.get('Root_M') : 0;
  const jn = table.jn || [], memo = new Map();
  const res = (k, depth = 0) => { if (memo.has(k)) return memo.get(k); let r = root;
    for (const c of [jn[k], ...((table.janc || [])[k] || [])]) { if (ix.has(c)) { r = ix.get(c); break; } const k2 = jn.indexOf(c); if (k2 >= 0 && k2 !== k && depth < 32) { r = res(k2, depth + 1); break; } }
    memo.set(k, r); return r; };
  const jix = jn.map((_, k) => res(k));
  return (s) => {
    s = s || ''; if (cache.has(s)) return cache.get(s);
    const parts = [...s.matchAll(/([a-zA-Z])(\d*)/g)].map((m) => [LET.indexOf(m[1]), m[2]]), acc = new Map(); let rest = 100;
    parts.forEach(([j, p], k) => { const w = k === parts.length - 1 || p === '' ? rest : +p; rest -= w; const i = jix[j] !== undefined ? jix[j] : root; acc.set(i, (acc.get(i) || 0) + Math.max(0, w)); });
    if (![...acc.values()].some((w) => w > 0)) { acc.clear(); acc.set(root, 100); }
    const top = [...acc].filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 4), sum = top.reduce((q, x) => q + x[1], 0);
    const r = { si: [0, 0, 0, 0], sw: [0, 0, 0, 0] }; top.forEach(([i, w], k) => { r.si[k] = i; r.sw[k] = w / sum; });
    cache.set(s, r); return r;
  };
}
// growable render mesh: v(q, rgb, {si, sw}) -> vertex index; out() -> Contract v2 arrays
export function mesh() {
  const o = { pos: [], idx: [], col: [], si: [], sw: [] };
  o.v = (q, c, w) => { o.pos.push(q[0], q[1], q[2]); o.col.push(c[0], c[1], c[2]); o.si.push(...w.si); o.sw.push(...w.sw); return o.pos.length / 3 - 1; };
  o.out = () => ({ pos: Float32Array.from(o.pos), idx: Uint32Array.from(o.idx), col: Float32Array.from(o.col), si: Uint16Array.from(o.si), sw: Float32Array.from(o.sw) });
  return o;
}
export const GREY = [0.8, 0.8, 0.8];
export const palCol = (table, i) => (table.pal && table.pal[i]) || GREY;

export const FRONT = [0, 0, 1], UP = [0, 1, 0];
const r4 = (x) => +(+x).toFixed(4), r5 = (x) => +(+x).toFixed(5);
export const heroScale = (H) => v3.len(v3.sub(H.joint.Head_M, H.joint.Root_M));

// generator-side chain specs (which canonical parts a chain eats, slice radius limit)
export const SPEC = {
  trunk: { parts: ['pelvis', 'chest', 'neck', 'head'], rmax: 0.5, capEnd: true },
  arm: { parts: ['upperarm', 'forearm'], rmax: 0.22 }, leg: { parts: ['thigh', 'shin'], rmax: 0.3 },
  foot: { parts: ['foot'], rmax: 0.18, capStart: true, capEnd: true }, palm: { parts: ['hand'], rmax: 0.07 },
  finger: { parts: ['hand'], rmax: 0.025, capEnd: true },
};
export const specOf = (name) => SPEC[name.split('_')[0]] || SPEC.finger;

export function resolveJoint(virt, H, name) {
  if (H.joint[name] && !(virt && virt[name])) return H.joint[name];
  const d = virt[name]; if (!d) throw new Error(`joint ${name} not found on ${H.name}`);
  const A = H.joint[d.a], B = d.b ? H.joint[d.b] : A, s = heroScale(H);
  return v3.add(v3.add(A, v3.scl(v3.sub(B, A), d.k)), v3.scl(d.o, s));
}

// polyline of a chain on hero H (ext stored as fractions of the first / last segment)
export function chainPolyline(ch, virt, H) {
  const jp = ch.joints.map((n) => resolveJoint(virt, H, n));
  const l0 = v3.len(v3.sub(jp[1], jp[0])), ln = v3.len(v3.sub(jp[jp.length - 1], jp[jp.length - 2]));
  return makePolyline(jp, [ch.ext[0] * l0, ch.ext[1] * ln]);
}

// s (segment units over the extended polyline, may run past both ends) <-> arclength t
export function sToT(pl, s) {
  const n = pl.S.length - 1;
  if (s < 0) return s * (pl.S[2] - pl.S[1]);
  if (s > n) return pl.L + (s - n) * (pl.S[n - 1] - pl.S[n - 2]);
  const i = Math.min(n - 1, Math.floor(s)); return pl.S[i] + (s - i) * (pl.S[i + 1] - pl.S[i]);
}
export function tToS(pl, t) {
  const n = pl.S.length - 1;
  if (t < 0) return t / (pl.S[2] - pl.S[1]);
  if (t > pl.L) return n + (t - pl.L) / (pl.S[n - 1] - pl.S[n - 2]);
  let i = 0; while (i < n - 1 && t > pl.S[i + 1]) i++; const l = pl.S[i + 1] - pl.S[i]; return i + (l > 0 ? (t - pl.S[i]) / l : 0);
}
// centre, frame and tangent at arclength t (linear past the ends)
export function frameAt(pl, t, ref) {
  let O; if (t < 0) O = v3.add(pl.P[0], v3.scl(pl.D[0], t)); else if (t > pl.L) O = v3.add(pl.P[pl.P.length - 1], v3.scl(pl.D[pl.D.length - 1], t - pl.L)); else O = plPoint(pl, t);
  const T = plTangent(pl, Math.max(0, Math.min(pl.L, t))), { u, v } = frame(T, ref);
  return { O, T, u, v };
}
// closest arclength of a point (end segments unclamped outward)
export function projectT(pl, q) {
  let best = Infinity, bt = 0; const n = pl.D.length;
  for (let i = 0; i < n; i++) {
    const l = pl.S[i + 1] - pl.S[i]; let x = v3.dot(v3.sub(q, pl.P[i]), pl.D[i]);
    if (!(i === 0 && x < 0) && !(i === n - 1 && x > l)) x = Math.max(0, Math.min(l, x));
    const d = v3.len(v3.sub(q, v3.add(pl.P[i], v3.scl(pl.D[i], x))));
    if (d < best) { best = d; bt = pl.S[i] + x; }
  }
  return bt;
}

// geometry of every chain of a body table on hero H: profile p(t) interpolated linearly between rings, clamped at ends
export const ringsOf = (ch) => (ch.rq ? ch.rq.map((r) => r.map((x) => x / 1e4)) : ch.rings);
export function bodyGeom(body, H) {
  return body.chains.map((ch0) => {
    const ch = ch0.rq ? { ...ch0, rings: ringsOf(ch0) } : ch0;
    const pl = chainPolyline(ch, body.virt, H), ts = ringTs(pl, ch.counts), ref = ch.ref === 'up' ? UP : FRONT;
    const profAt = (t) => {
      if (t <= ts[0]) return ch.rings[0]; if (t >= ts[ts.length - 1]) return ch.rings[ts.length - 1];
      let i = 0; while (i < ts.length - 2 && t > ts[i + 1]) i++; const f = (t - ts[i]) / Math.max(1e-9, ts[i + 1] - ts[i]);
      return ch.rings[i].map((x, k) => x + (ch.rings[i + 1][k] - x) * f);
    };
    const radius = (t, th) => profR(ch.kind, profAt(t), th);
    return { ch, name: ch.name, kind: ch.kind, pl, ts, ref, profAt, radius };
  });
}

// 32-bit mask: bin m set when the ray from the fitted ring centre hits skin (bins the loft only bridges are not drawn)
function coverMask(tri, O, T, u, v, rmax, p) {
  const segs = [];
  for (let k = 0; k < tri.length; k += 9) {
    const d = [0, 1, 2].map((i) => (tri[k + i * 3] - O[0]) * T[0] + (tri[k + i * 3 + 1] - O[1]) * T[1] + (tri[k + i * 3 + 2] - O[2]) * T[2]), pts = [];
    for (let e = 0; e < 3; e++) { const a = e, b = (e + 1) % 3; if ((d[a] > 0) !== (d[b] > 0)) { const f = d[a] / (d[a] - d[b]); const w = [0, 1, 2].map((c) => tri[k + a * 3 + c] + (tri[k + b * 3 + c] - tri[k + a * 3 + c]) * f - O[c]); pts.push([v3.dot(w, u) - p[0], v3.dot(w, v) - p[1]]); } }
    if (pts.length === 2 && Math.hypot(pts[0][0] + p[0], pts[0][1] + p[1]) < rmax && Math.hypot(pts[1][0] + p[0], pts[1][1] + p[1]) < rmax) segs.push(pts);
  }
  let mask = 0;
  for (let m = 0; m < 32; m++) { const th = (m / 32) * Math.PI * 2, dx = Math.cos(th), dy = Math.sin(th);
    for (const [a, b] of segs) { const ex = b[0] - a[0], ey = b[1] - a[1], den = dx * ey - dy * ex; if (Math.abs(den) < 1e-12) continue;
      const kk = (a[0] * ey - a[1] * ex) / den, w = (a[0] * dy - a[1] * dx) / den; if (kk > 0 && w >= 0 && w <= 1) { mask |= 1 << m; break; } } }
  return mask >>> 0;
}

export function fit(ctx, prim) {
  const { sliceRing, fitFourier, fitSE, pca } = FITM, P = Object.fromEntries(GLB.PARTS.map((p, i) => [p, i]));
  const H = ctx.hero, N = H.nodes, sc = heroScale(H), PT = painter(ctx, prim, 24, 0.12);
  const vp = (i) => [prim.pos[i * 3], prim.pos[i * 3 + 1], prim.pos[i * 3 + 2]];
  const nt = prim.idx.length / 3;
  const tpart = new Int32Array(nt), tdom = new Int32Array(nt);
  for (let t = 0; t < nt; t++) {
    const a = prim.idx[t * 3], b = prim.idx[t * 3 + 1], c = prim.idx[t * 3 + 2];
    const pa = prim.part[a], pb = prim.part[b], pc = prim.part[c]; tpart[t] = pa === pb || pa === pc ? pa : pb === pc ? pb : pa;
    const da = prim.dom[a], db = prim.dom[b], dc = prim.dom[c]; tdom[t] = da === db || da === dc ? da : db === dc ? db : da;
  }
  // a triangle belongs to a chain when >= 2 of its vertices are in the chain's parts
  const trisOf = (parts, pred = () => true) => { const s = new Set(parts), out = [];
    for (let t = 0; t < nt; t++) { let k = 0; for (let j = 0; j < 3; j++) k += s.has(prim.part[prim.idx[t * 3 + j]]); if (k >= 2 && pred(t)) out.push(t); } return out; };
  const virt = {}, chains = [];
  const J = (n) => resolveJoint(virt, H, n);
  const setVirt = (name, q, a, b = null, k = 0) => { const A = H.joint[a], B = b ? H.joint[b] : A; const base = v3.add(A, v3.scl(v3.sub(B, A), k)); virt[name] = { a, b, k, o: v3.scl(v3.sub(q, base), 1 / sc).map(r5) }; };
  function chain(name, kind, joints, tris, counts, ref) {
    if (tris.length < 4) return;
    const sp = specOf(name), vs = new Set(); tris.forEach((t) => [0, 1, 2].forEach((k) => vs.add(prim.idx[t * 3 + k])));
    const pts = [...vs].map(vp), jp = joints.map(J);
    const d0 = v3.norm(v3.sub(jp[1], jp[0])), dn = v3.norm(v3.sub(jp[jp.length - 1], jp[jp.length - 2]));
    let es = 0.002, ee = 0.002; for (const p of pts) { es = Math.max(es, -v3.dot(v3.sub(p, jp[0]), d0)); ee = Math.max(ee, v3.dot(v3.sub(p, jp[jp.length - 1]), dn)); }
    const l0 = v3.len(v3.sub(jp[1], jp[0])), ln = v3.len(v3.sub(jp[jp.length - 1], jp[jp.length - 2]));
    const ch = { name, kind, joints, ext: [r4(es * 0.985 / l0), r4(ee * 0.985 / ln)], counts, ref };
    const pl = chainPolyline(ch, virt, H), ts = ringTs(pl, counts), refv = ref === 'up' ? UP : FRONT;
    const tri = new Float64Array(tris.length * 9); tris.forEach((t, i) => { for (let k = 0; k < 3; k++) tri.set(vp(prim.idx[t * 3 + k]), i * 9 + k * 3); });
    const masks = [];
    const rings = ts.map((t) => { const O = plPoint(pl, t), T = plTangent(pl, t), { u, v } = frame(T, refv); const R = sliceRing(tri, O, T, u, v, sp.rmax);
      if (!R) { masks.push(0); return null; } const p = kind === 'se' ? fitSE(R) : fitFourier(R, 6); masks.push(coverMask(tri, O, T, u, v, sp.rmax, p)); return p; });
    if (rings.every((r) => !r)) return;
    const filled = rings.map((r) => !!r);
    for (let i = 0; i < rings.length; i++) if (!filled[i]) { // empty ring: interpolated between the filled neighbours (kept for garments, not drawn)
      let a = i - 1; while (a >= 0 && !filled[a]) a--; let b = i + 1; while (b < rings.length && !filled[b]) b++;
      if (a >= 0 && b < rings.length) { rings[i] = rings[a].map((x, k) => x + (rings[b][k] - x) * (i - a) / (b - a)); continue; }
      const src = rings[a < 0 ? b : a], f = Math.exp(-Math.abs(i - (a < 0 ? b : a)) / 2); // past the skin's end: centre slides onto the bone line
      rings[i] = src.map((x, k) => (k < 2 ? x * f : x));
    }
    ch.rings = rings.map((r) => r.map(r4)); ch.mask = masks.map((m) => m.toString(36));
    // colour per ring x vertex bin (outermost skin hit from the ring centre) and the ring's dominant joints
    const S = kind === 'se' ? 12 : 32, crow = [], wrow = [];
    ts.forEach((t, i) => { const O = plPoint(pl, t), T = plTangent(pl, t), { u, v } = frame(T, refv), segs = filled[i] ? sliceUV(prim, tris, O, T, u, v, ch.rings[i], sp.rmax) : [];
      crow.push(rayHits(segs, S).out.map((h) => (h ? PT.hit(h.uv) : -1))); wrow.push(PT.wmap(segs)); });
    PT.attach(ch, crow, wrow); ch.rq = ch.rings.map((r) => r.map((x) => Math.round(x * 1e4))); delete ch.rings; chains.push(ch);
  }
  chain('trunk', 'f6', ['Root_M', 'Chest_M', 'Neck_M', 'Head_M'], trisOf(SPEC.trunk.parts.map((n) => P[n])), [8, 8, 8, 4, 2], 'front');
  for (const sd of ['L', 'R']) {
    chain('arm_' + sd, 'f6', ['Shoulder_' + sd, 'Elbow_' + sd, 'Wrist_' + sd], trisOf([P['upperarm_' + sd], P['forearm_' + sd]]), [4, 8, 8, 1], 'front');
    chain('leg_' + sd, 'f6', ['Hip_' + sd, 'Knee_' + sd, 'Ankle_' + sd], trisOf([P['thigh_' + sd], P['shin_' + sd]]), [4, 8, 8, 2], 'front');
    const ft = trisOf([P['foot_' + sd]]);
    { const vs = new Set(); ft.forEach((t) => [0, 1, 2].forEach((k) => vs.add(prim.idx[t * 3 + k]))); const pts = [...vs].map(vp);
      const an = H.joint['Ankle_' + sd], te = H.joint['ToesEnd_' + sd];
      if (pts.length > 80) { let { c, axis } = pca(pts); if (v3.dot(axis, FRONT) < 0) axis = v3.scl(axis, -1); const base = v3.add(c, v3.scl(axis, v3.dot(v3.sub(an, c), axis)));
        let mx = -1e9; for (const p of pts) mx = Math.max(mx, v3.dot(v3.sub(p, base), axis));
        setVirt('FootBase_' + sd, base, 'Ankle_' + sd); setVirt('Toe_' + sd, v3.add(base, v3.scl(axis, mx * 0.97)), 'Ankle_' + sd);
      } else if (te) { // skin foot mostly hidden in the shoe: axis from the skeleton (mid-ankle height down to above the toe end)
        setVirt('FootBase_' + sd, [an[0], an[1] * 0.5, an[2] - 0.03], 'Ankle_' + sd); setVirt('Toe_' + sd, [te[0], te[1] + 0.02, te[2]], 'ToesEnd_' + sd); }
      if (virt['Toe_' + sd]) {
        chain('foot_' + sd, 'f6', ['FootBase_' + sd, 'Toe_' + sd], ft, [3, 12, 1], 'up'); } }
    const fingerOf = (t) => { const m = /^(Thumb|Index|Middle|Ring|Pinky)Finger/.exec(N[tdom[t]] || ''); return m ? m[1] : null; };
    const hand = trisOf([P['hand_' + sd]]);
    const wr = H.joint['Wrist_' + sd], mid = H.joint['MiddleFinger1_' + sd];
    setVirt('PalmTip_' + sd, v3.add(wr, v3.scl(v3.sub(mid, wr), 1.02)), 'Wrist_' + sd, 'MiddleFinger1_' + sd, 1.02);
    chain('palm_' + sd, 'se', ['Wrist_' + sd, 'PalmTip_' + sd], hand.filter((t) => !fingerOf(t)), [1, 6, 1], 'front');
    for (const f of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) {
      const js = [1, 2, 3, 4].map((k) => `${f}Finger${k}_${sd}`).filter((n) => H.joint[n]);
      if (js.length >= 2) chain(`${f.toLowerCase()}_${sd}`, 'se', js, hand.filter((t) => fingerOf(t) === f), [1, ...new Array(js.length - 1).fill(3), 2], 'up');
    }
  }
  return { rep: 'bodyLoft', virt, chains, ...PT.finish() };
}

// ring loft mesh; caps where the chain ends in open air (toe, heel, finger tips, crown)
export function build(table, ctx) {
  const MS = mesh(), W = wres(table, ctx);
  for (const g of bodyGeom(table, ctx.hero)) {
    const ch = g.ch, S = ch.kind === 'se' ? 12 : 32, base = MS.pos.length / 3, sp = specOf(ch.name), mask = ch.mask && ch.mask.map((m) => (typeof m === 'string' ? parseInt(m, 36) : m));
    const crow = unrleList(ch.col).map(decRow), wrow = unrleList(ch.w), centres = [];
    g.ts.forEach((t, i) => {
      const p = ch.rings[i], { O, u, v } = frameAt(g.pl, t, g.ref), C = v3.add(O, v3.add(v3.scl(u, p[0]), v3.scl(v, p[1]))); centres.push(C);
      const w = W(wrow[i]);
      for (let a = 0; a < S; a++) { const th = (a / S) * Math.PI * 2, r = profR(ch.kind, p, th);
        MS.v(v3.add(C, v3.add(v3.scl(u, r * Math.cos(th)), v3.scl(v, r * Math.sin(th)))), palCol(table, crow[i] ? crow[i][a] : 0), w); }
    });
    const n = g.ts.length, idx = MS.idx;
    const bit = (i, m) => (mask[i] >>> ((m + 32) % 32)) & 1;
    const on = (i, a) => { if (!mask || !ctx.useMask) return true; const m = Math.floor((a / S) * 32); return (bit(i, m - 1) | bit(i, m) | bit(i, m + 1)) === 1; }; // drawn where its bin (or a neighbour) hit skin
    for (let i = 0; i < n - 1; i++) for (let a = 0; a < S; a++) {
      const b = (a + 1) % S, A = base + i * S + a, B = base + i * S + b, C = A + S, D = B + S, k = [[A, on(i, a)], [B, on(i, b)], [D, on(i + 1, b)], [C, on(i + 1, a)]].filter((x) => x[1]).map((x) => x[0]);
      if (k.length === 4) idx.push(A, B, C, B, D, C); else if (k.length === 3) idx.push(k[0], k[1], k[2]);
    }
    const cap = (i, first) => { if (mask && !mask[i]) return; const c = MS.v(centres[i], palCol(table, crow[i] ? crow[i][0] : 0), W(wrow[i]));
      for (let a = 0; a < S; a++) { const i0 = base + i * S + a, i1 = base + i * S + (a + 1) % S; if (first) idx.push(c, i1, i0); else idx.push(c, i0, i1); } };
    if (sp.capStart) cap(0, true); if (sp.capEnd) cap(n - 1, false);
  }
  return MS.out();
}
