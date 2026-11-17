// strips: open panels (coat tails, open skirt panels, capes, wings) as bent rounded slabs per ring along their own bone
// chain. Ring = [cu, cv, ang, hw, th, bend] in the chain ring frame (slab as in tools/fit-char.mjs stripChain), or a
// Fourier-6 ring [cu, cv, a0, a1, b1, ...] where the section is closed (bow loops, knots).
// Joints are stored by name plus a fallback (nearest body ancestor + offset / heroScale) for skeletons that lack them.
// Contract v2: per ring a colour row over 16 bins around the ring centre (outermost hit) and the ring's top-3 joints;
// build() returns { pos, idx, col, si, sw }.
import { v3, makePolyline, plPoint, plTangent, frame, ringTs, fR } from '../../lib/loft-core.js';
import { FRONT, heroScale, BODYJ, nodeLibs, painter, sliceUV, rayHits, mesh, wres, unrleList, decRow, palCol } from './bodyLoft.js';
export { BODYJ };
const SB = 16; // colour bins per strip ring
const r4 = (x) => +(+x).toFixed(4), r5 = (x) => +(+x).toFixed(5);

function solve2(A, b) { const det = A[0][0] * A[1][1] - A[0][1] * A[1][0]; if (Math.abs(det) < 1e-18) return [b[0] / (A[0][0] || 1), 0]; return [(b[0] * A[1][1] - A[0][1] * b[1]) / det, (A[0][0] * b[1] - A[1][0] * b[0]) / det]; }
export const triDom = (prim, t) => { const a = prim.dom[prim.idx[t * 3]], b = prim.dom[prim.idx[t * 3 + 1]], c = prim.dom[prim.idx[t * 3 + 2]]; return a === b || a === c ? a : b === c ? b : a; };

// group the triangles' dominant joints into chains (root -> heaviest child), as fit-char chainsOf
function chainsOf(H, prim, tris) {
  const par = H.parent, cnt = new Map(); for (const t of tris) { const d = triDom(prim, t); cnt.set(d, (cnt.get(d) || 0) + 1); }
  const cand = new Set(cnt.keys()), kids = new Map(); for (const j of cand) { if (!kids.has(par[j])) kids.set(par[j], []); kids.get(par[j]).push(j); }
  const sub = new Map(), subC = (j) => { if (sub.has(j)) return sub.get(j); let s = cnt.get(j) || 0; for (const c of kids.get(j) || []) s += subC(c); sub.set(j, s); return s; };
  const out = [], q = [...cand].filter((j) => !cand.has(par[j]));
  // a chain runs down while the joint has one child; a fork (bow knot, cape root) ends it and each branch starts anew
  while (q.length) { let j = q.shift(); const ch = [j]; for (;;) { const ks = kids.get(j) || []; if (ks.length !== 1) { q.push(...ks); break; } j = ks[0]; ch.push(j); } out.push(ch); }
  return out;
}

export function resolveStripJoint(js, H) {
  if (H.joint[js.n]) return H.joint[js.n];
  return v3.add(H.joint[js.a], v3.scl(js.o, heroScale(H)));
}

// section points (segment end pairs) -> Fourier-6 ring [cu, cv, a0, a1, b1, ..., a6, b6] when rays from the centroid
// hit the section in >= 28 of 32 directions, else null
function closedRing(P2) {
  let cx = 0, cy = 0, wl = 0; for (let i = 0; i < P2.length; i += 2) { const a = P2[i], b = P2[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) + 1e-9; cx += (a[0] + b[0]) / 2 * l; cy += (a[1] + b[1]) / 2 * l; wl += l; }
  cx /= wl; cy /= wl; const r = new Array(32).fill(NaN);
  for (let m = 0; m < 32; m++) { const th = (m / 32) * Math.PI * 2, dx = Math.cos(th), dy = Math.sin(th);
    for (let i = 0; i < P2.length; i += 2) { const a = P2[i], b = P2[i + 1], ex = b[0] - a[0], ey = b[1] - a[1], den = dx * ey - dy * ex; if (Math.abs(den) < 1e-12) continue;
      const ax = a[0] - cx, ay = a[1] - cy, k = (ax * ey - ay * ex) / den, w = (ax * dy - ay * dx) / den; if (k > 0 && w >= 0 && w <= 1 && !(k <= r[m])) r[m] = k; } }
  if (r.filter((x) => !isNaN(x)).length < 28) return null;
  for (let m = 0; m < 32; m++) if (isNaN(r[m])) { let a = 1; while (isNaN(r[(m - a + 32) % 32])) a++; let b = 1; while (isNaN(r[(m + b) % 32])) b++; r[m] = (r[(m - a + 32) % 32] * b + r[(m + b) % 32] * a) / (a + b); }
  return nodeLibs().FITM.fitFourier({ cx, cy, r }, 6);
}

// fit one strip chain on the given triangles of prim
function stripChain(H, prim, jointIdx, tris, PT) {
  const { pca } = nodeLibs().FITM, N = H.nodes, par = H.parent, sc = heroScale(H);
  const vp = (i) => [prim.pos[i * 3], prim.pos[i * 3 + 1], prim.pos[i * 3 + 2]];
  const vset = new Set(); for (const t of tris) for (let k = 0; k < 3; k++) vset.add(prim.idx[t * 3 + k]);
  const pts = [...vset].map(vp); if (pts.length < 6) return null;
  let jp = jointIdx.map((j) => H.joint[N[j]]);
  const bodyAnc = (j) => { let i = par[j]; while (i >= 0 && !BODYJ.test(N[i])) i = par[i]; return i < 0 ? 'Root_M' : N[i]; };
  const anchor = bodyAnc(jointIdx[0]);
  const jsOut = jointIdx.map((j) => ({ n: N[j], a: anchor, o: v3.scl(v3.sub(H.joint[N[j]], H.joint[anchor]), 1 / sc).map(r5) }));
  let single = false;
  if (jp.length === 1) { // one bone: a virtual line through the triangles along their main axis, end to end
    const { axis, c } = pca(pts); let lo = Infinity, hi = -Infinity; for (const p of pts) { const x = v3.dot(v3.sub(p, c), axis); lo = Math.min(lo, x); hi = Math.max(hi, x); }
    const a = v3.add(c, v3.scl(axis, lo * 0.97)), b = v3.add(c, v3.scl(axis, hi * 0.97)); jp = [a, b]; single = true;
    jsOut.length = 0; for (const q of [a, b]) jsOut.push({ n: '', a: anchor, o: v3.scl(v3.sub(q, H.joint[anchor]), 1 / sc).map(r5) });
  }
  const d0 = v3.norm(v3.sub(jp[1], jp[0])), dn = v3.norm(v3.sub(jp[jp.length - 1], jp[jp.length - 2]));
  let es = 0.002, ee = 0.002; for (const p of pts) { es = Math.max(es, -v3.dot(v3.sub(p, jp[0]), d0)); ee = Math.max(ee, v3.dot(v3.sub(p, jp[jp.length - 1]), dn)); }
  const ext = [r5(Math.min(es, 0.08) * 0.97), r5(ee * 0.97)];
  const counts = single ? [1, Math.max(4, Math.round(v3.len(v3.sub(jp[1], jp[0])) / 0.012)), 1] : [2, ...new Array(jp.length - 1).fill(3), Math.max(3, Math.round(ee / 0.016))];
  const pl = makePolyline(jp, ext), ts = ringTs(pl, counts), raw = [], segsR = [];
  let prevAng = null;
  for (const t of ts) {
    const O = plPoint(pl, t), T = plTangent(pl, t), { u, v } = frame(T, FRONT), segs = sliceUV(prim, tris, O, T, u, v, [0, 0], 0.25), P2 = [];
    for (const sg of segs) P2.push(sg.a, sg.b);
    segsR.push(segs);
    if (!P2.length) { raw.push(null); continue; }
    { // closed section (bow loop, knot): Fourier-6 ring around the section centroid instead of a slab
      const R = closedRing(P2); if (R) { raw.push(R); continue; } }
    const mx = P2.reduce((a, p) => a + p[0], 0) / P2.length, my = P2.reduce((a, p) => a + p[1], 0) / P2.length;
    let sxx = 0, sxy = 0, syy = 0; for (const [x, y] of P2) { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); syy += (y - my) ** 2; }
    let ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    if (prevAng !== null) { while (ang - prevAng > Math.PI / 2) ang -= Math.PI; while (ang - prevAng < -Math.PI / 2) ang += Math.PI; }
    prevAng = ang;
    const ca = Math.cos(ang), sa = Math.sin(ang), loc = P2.map(([x, y]) => [(x - mx) * ca + (y - my) * sa, -(x - mx) * sa + (y - my) * ca]);
    let lo = Infinity, hi = -Infinity; for (const [a] of loc) { lo = Math.min(lo, a); hi = Math.max(hi, a); }
    const hw = Math.max(0.003, (hi - lo) / 2), cA = (lo + hi) / 2;
    const A = [[0, 0], [0, 1e-12]], b = [0, 0]; for (const [a, n] of loc) { const x = a - cA, f = [1, x * x]; for (let i = 0; i < 2; i++) { b[i] += f[i] * n; for (let k = 0; k < 2; k++) A[i][k] += f[i] * f[k]; } }
    const c = solve2(A, b); let res = 0; for (const [a, n] of loc) { const x = a - cA; res = Math.max(res, Math.abs(n - c[0] - c[1] * x * x)); }
    const th = Math.min(Math.max(0.003, res * 0.8 + 0.0015), hw);
    raw.push([mx + cA * ca - c[0] * sa, my + cA * sa + c[0] * ca, ang, hw, th, c[1] * hw * hw]);
  }
  for (let i = 0; i < raw.length; i++) if (!raw[i]) { let k = 1; while (!raw[i - k] && !raw[i + k] && k < raw.length) k++; const s = raw[i - k] || raw[i + k]; if (!s) return null; raw[i] = s.slice(); if (s.length === 6) { raw[i][3] *= 0.6; raw[i][4] *= 0.8; } }
  for (let pass = 0; pass < 2; pass++) { const c = raw.map((r) => r.slice()); for (let i = 1; i < raw.length - 1; i++) if (c[i - 1].length === c[i].length && c[i + 1].length === c[i].length) for (let k = 0; k < c[i].length; k++) raw[i][k] = (c[i - 1][k] + 2 * c[i][k] + c[i + 1][k]) / 4; }
  const st = { joints: jsOut, ext, counts, rings: raw.map((r) => r.map(r4)) };
  // colour bins around each final ring centre, joints of the cut triangles
  const crow = segsR.map((segs, i) => { const c = st.rings[i], sh = segs.map((g) => ({ ...g, a: [g.a[0] - c[0], g.a[1] - c[1]], b: [g.b[0] - c[0], g.b[1] - c[1]] }));
    return rayHits(sh, SB).out.map((h) => (h ? PT.hit(h.uv) : -1)); });
  PT.attach(st, crow, segsR.map((segs) => PT.wmap(segs)));
  st.rq = st.rings.map((r) => r.map((x) => Math.round(x * 1e4))); delete st.rings;
  return st;
}

// fit strips on a triangle subset (shell hands over its non-body triangles); triangles skinned to body joints are
// attached to the chain of the nearest strip joint
export function fitTris(H, prim, tris, PT) {
  const N = H.nodes, flow = tris.filter((t) => !BODYJ.test(N[triDom(prim, t)] || ''));
  const rest = tris.filter((t) => BODYJ.test(N[triDom(prim, t)] || ''));
  const groups = chainsOf(H, prim, flow).map((cj) => ({ cj, set: new Set(cj), tris: [] }));
  for (const t of flow) { const d = triDom(prim, t); groups.find((g) => g.set.has(d)).tris.push(t); }
  if (groups.length) for (const t of rest) { // body-skinned triangles of a strips part: nearest strip joint
    const q = [0, 1, 2].map((k) => prim.idx[t * 3 + k]).map((i) => [prim.pos[i * 3], prim.pos[i * 3 + 1], prim.pos[i * 3 + 2]]).reduce((a, p) => v3.add(a, v3.scl(p, 1 / 3)), [0, 0, 0]);
    let bg = groups[0], bd = Infinity; for (const g of groups) for (const j of g.cj) { const d = v3.len(v3.sub(q, H.joint[N[j]])); if (d < bd) { bd = d; bg = g; } } bg.tris.push(t);
  }
  return groups.map((g) => stripChain(H, prim, g.cj, g.tris, PT)).filter(Boolean);
}

export function fit(ctx, prim) {
  const all = Array.from({ length: prim.idx.length / 3 }, (_, t) => t), PT = painter(ctx, prim);
  const strips = fitTris(ctx.hero, prim, all, PT);
  return { rep: 'strips', strips, ...PT.finish() };
}

// bent rounded slab rings (16 points), connected, both ends closed; vertices go into MS (bodyLoft mesh()),
// colours / weights decoded against table (pal, jn, janc)
export function buildStrips(strips, H, MS, table, ctx) {
  const S = 16, W = wres(table, ctx);
  for (const st of strips) {
    const jp = st.joints.map((j) => resolveStripJoint(j, H)), pl = makePolyline(jp, st.ext), ts = ringTs(pl, st.counts), base = MS.pos.length / 3, cs = [];
    const crow = unrleList(st.col).map(decRow), wrow = unrleList(st.w);
    const rings = st.rq ? st.rq.map((r) => r.map((x) => x / 1e4)) : st.rings;
    ts.forEach((t, i) => {
      const R = rings[i], [cu, cv, ang, hw, th, bend] = R, O = plPoint(pl, t), T = plTangent(pl, t), { u, v } = frame(T, FRONT), ca = Math.cos(ang), sa = Math.sin(ang);
      const w = W(wrow[i]), cr = crow[i], put = (x, y) => { // (x, y) = offset from the ring centre in the ring frame
        const b = ((Math.round((Math.atan2(y, x) / (2 * Math.PI)) * SB) % SB) + SB) % SB;
        MS.v(v3.add(O, v3.add(v3.scl(u, cu + x), v3.scl(v, cv + y))), palCol(table, cr ? cr[b] : 0), w); };
      cs.push([v3.add(O, v3.add(v3.scl(u, cu), v3.scl(v, cv))), w, palCol(table, cr ? cr[0] : 0)]);
      if (R.length > 6) { for (let a = 0; a < S; a++) { const tt = (a / S) * Math.PI * 2, r = fR(R, tt); put(r * Math.cos(tt), r * Math.sin(tt)); } return; }
      for (let a = 0; a < S; a++) {
        const tt = (a / S) * Math.PI * 2, c = Math.cos(tt), s = Math.sin(tt);
        const r = Math.pow(Math.pow(Math.abs(c) / Math.max(hw, 1e-4), 4) + Math.pow(Math.abs(s) / Math.max(th, 1e-4), 4), -1 / 4);
        const x = r * c, y = r * s + (hw > 1e-5 ? bend * (x / hw) * (x / hw) : 0);
        put(x * ca - y * sa, x * sa + y * ca);
      }
    });
    const n = ts.length, idx = MS.idx;
    for (let i = 0; i < n - 1; i++) for (let a = 0; a < S; a++) { const i0 = base + i * S + a, i1 = base + i * S + (a + 1) % S; idx.push(i0, i1, i0 + S, i1, i1 + S, i0 + S); }
    for (const [i, first] of [[0, true], [n - 1, false]]) { const c = MS.v(cs[i][0], cs[i][2], cs[i][1]); for (let a = 0; a < S; a++) { const i0 = base + i * S + a, i1 = base + i * S + (a + 1) % S; if (first) idx.push(c, i1, i0); else idx.push(c, i0, i1); } }
  }
}

export function build(table, ctx) {
  const MS = mesh(); buildStrips(table.strips, ctx.hero, MS, table, ctx);
  return MS.out();
}
