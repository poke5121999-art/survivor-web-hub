// shell: a garment as a layer over the wearer's body loft. Per body chain the garment spans: rows at chain-relative
// positions s (segment units of the body chain, adaptive: 6 mm base step, bisected twice where the cover pattern
// changes so hems and edges stay sharp), 32 angle bins (64 on the trunk) each = offset (mm, outer garment radius minus body loft radius
// along the same ray, >= 1.5 mm) or -1 (not covered). Triangles skinned dominantly to non-body joints go to strips.
// build() lays the rows on ctx.body over ctx.hero's skeleton; uncovered bins are dropped, hems stay open; any vertex
// that ends up inside any body chain loft of the wearer is pushed out to that surface + 1.5 mm.
// Contract v2: per row a colour code (outer bins, and inner bins where the row has an inner surface) and the row's
// top-3 joints; build() returns { pos, idx, col, si, sw }.
import { v3, profR } from '../../lib/loft-core.js';
import { bodyGeom, frameAt, projectT, sToT, tToS, specOf, nodeLibs, painter, sliceUV, rayHits, mesh, wres, unrleList, decRow, palCol } from './bodyLoft.js';
import { BODYJ, triDom, fitTris, buildStrips } from './strips.js';

const STEP = 0.006, MINOFF = 0.0015, INNER = 0.003, PUSH = 0.0015;
// offset code: '#' = not covered; value v (0.25 mm units) < 60 -> one char, else two chars (prefix, low)
const OC = Array.from({ length: 92 }, (_, i) => String.fromCharCode(35 + i)).filter((c) => c !== '\\'), ONE = 60, OX = OC.length - 1 - ONE;
export const encOff = (a) => a.map((v) => (v < 0 ? OC[0] : v < ONE ? OC[1 + v] : OC[1 + ONE + Math.min(OX - 1, Math.floor((v - ONE) / OC.length))] + OC[(v - ONE) % OC.length])).join('');
export const decOff = (s) => { const o = []; for (let i = 0; i < s.length; i++) { const k = OC.indexOf(s[i]); if (k === 0) o.push(-1); else if (k <= ONE) o.push(k - 1); else o.push(ONE + (k - 1 - ONE) * OC.length + OC.indexOf(s[++i])); } return o; };
const chainOfPart = (p) => { const n = nodeLibs().GLB.PARTS[p]; if (/pelvis|chest|neck|head/.test(n)) return 'trunk';
  const sd = n.slice(-1); if (/upperarm|forearm|hand/.test(n)) return 'arm_' + sd; if (/thigh|shin/.test(n)) return 'leg_' + sd; return 'foot_' + sd; };

export function fit(ctx, prim) {
  const H = ctx.hero, G = bodyGeom(ctx.body, H), N = H.nodes, nt = prim.idx.length / 3, PT = painter(ctx, prim);
  const vp = (i) => [prim.pos[i * 3], prim.pos[i * 3 + 1], prim.pos[i * 3 + 2]];
  const stripT = [], shellT = [];
  for (let t = 0; t < nt; t++) (BODYJ.test(N[triDom(prim, t)] || '') ? shellT : stripT).push(t);
  const shells = [];
  for (const g of G) {
    if (g.kind !== 'f6') continue; // garments sit on trunk / arms / legs / feet
    const tris = shellT.filter((t) => { let k = 0; for (let j = 0; j < 3; j++) k += chainOfPart(prim.part[prim.idx[t * 3 + j]]) === g.name; return k >= 2; });
    if (tris.length < 4) continue;
    const Q = tris.map((t) => [0, 1, 2].map((k) => vp(prim.idx[t * 3 + k])));
    let tmin = Infinity, tmax = -Infinity; for (const q3 of Q) for (const q of q3) { const t = projectT(g.pl, q); tmin = Math.min(tmin, t); tmax = Math.max(tmax, t); }
    const rmax = specOf(g.name).rmax, M = g.name === 'trunk' ? 64 : 32; // trunk: 64 bins so skirt pleats and flares resolve
    const row = (t) => {
      const { O, T, u, v } = frameAt(g.pl, t, g.ref), p = g.profAt(t), segs = sliceUV(prim, tris, O, T, u, v, p, rmax), { out: ho, inn: hi } = rayHits(segs, M);
      const out = new Array(2 * M).fill(-1), co = new Array(M).fill(-1), ci = new Array(M).fill(-1);
      for (let m = 0; m < M; m++) {
        if (!ho[m]) continue;
        const th = (m / M) * Math.PI * 2, rb = profR(g.kind, p, th), oo = Math.max(MINOFF, ho[m].k - rb), oi = Math.max(MINOFF, hi[m].k - rb);
        out[m] = Math.round(oo * 4000); co[m] = PT.hit(ho[m].uv); // offsets in 0.25 mm
        if (oo - oi > INNER) { out[M + m] = Math.round(oi * 4000); ci[m] = PT.hit(hi[m].uv); } // separate inner surface (lining, open flap, thick cuff)
      }
      return { t, o: out, co, ci, w: PT.wmap(segs) };
    };
    let rows = []; const n0 = Math.max(2, Math.ceil((tmax - tmin) / STEP));
    for (let i = 0; i <= n0; i++) rows.push(row(tmin + 0.0005 + (tmax - tmin - 0.001) * i / n0));
    for (let pass = 0; pass < 2; pass++) { // bisect where the cover pattern changes
      const nx = [rows[0]];
      for (let i = 1; i < rows.length; i++) { const a = rows[i - 1], b = rows[i]; if (a.o.some((x, m) => m < M && (x < 0) !== (b.o[m] < 0))) nx.push(row((a.t + b.t) / 2)); nx.push(b); }
      rows = nx;
    }
    // runs of empty rows collapse to one separator
    rows = rows.filter((r, i) => r.o.some((x) => x >= 0) || (i > 0 && rows[i - 1].o.some((x) => x >= 0)));
    const sh = { chain: g.name, m: M, q: 4, rows: rows.map((r) => [+tToS(g.pl, r.t).toFixed(5), encOff(r.o.slice(M).some((x) => x >= 0) ? r.o : r.o.slice(0, M))]) }; // inner half only when present
    PT.attach(sh, rows.map((r) => r.co), rows.map((r) => r.w)); PT.attach(sh, rows.map((r) => r.ci), null, 'ci', null, true);
    shells.push(sh);
  }
  const strips = stripT.length ? fitTris(H, prim, stripT, PT) : [];
  return { rep: 'shell', shells, strips, stripTris: stripT.length, ...PT.finish() };
}

// vertices of the shell rows on a wearer: [{chain, m, layer, rows: [[q or null] * m]}]; layer 1 = inner surface
export function shellPoints(table, ctx) {
  const G = bodyGeom(ctx.body, ctx.hero), out = [];
  for (const sh of table.shells) {
    const g = G.find((x) => x.name === sh.chain), M = sh.m; if (!g) continue;
    for (const layer of [0, 1]) out.push({ chain: sh.chain, m: M, layer, src: sh, rows: sh.rows.map((r0) => {
      const r = typeof r0[1] === 'string' ? [r0[0], ...decOff(r0[1])] : r0;
      const t = sToT(g.pl, r[0]), { O, u, v } = frameAt(g.pl, t, g.ref), p = g.profAt(t), C = v3.add(O, v3.add(v3.scl(u, p[0]), v3.scl(v, p[1])));
      return (r.length > 1 + layer * M ? r.slice(1 + layer * M, 1 + (layer + 1) * M) : new Array(M).fill(-1)).map((o, m) => { if (o < 0) return null; const th = (m / M) * Math.PI * 2, rr = profR(g.kind, p, th) + o / (1000 * (sh.q || 1)); return v3.add(C, v3.add(v3.scl(u, rr * Math.cos(th)), v3.scl(v, rr * Math.sin(th)))); });
    }) });
  }
  return out;
}

// every body chain loft of the wearer with its arclength range and a bounding box (for pushOut)
export function bodyHulls(ctx) {
  return bodyGeom(ctx.body, ctx.hero).map((g) => {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const t of g.ts) { const { O } = frameAt(g.pl, t, g.ref), p = g.profAt(t); let r = 0; for (let a = 0; a < 16; a++) r = Math.max(r, profR(g.kind, p, (a / 16) * Math.PI * 2));
      const e = r + Math.hypot(p[0], p[1]) + 0.01; for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], O[c] - e); hi[c] = Math.max(hi[c], O[c] + e); } }
    return { g, lo, hi, t0: g.ts[0], t1: g.ts[g.ts.length - 1] };
  });
}
// a point inside any chain loft goes out along that ring's ray to the surface + PUSH (a few passes: chains overlap)
export function pushOut(q, hulls) {
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const { g, lo, hi, t0, t1 } of hulls) {
      if (q[0] < lo[0] || q[1] < lo[1] || q[2] < lo[2] || q[0] > hi[0] || q[1] > hi[1] || q[2] > hi[2]) continue;
      const t = projectT(g.pl, q); if (t < t0 || t > t1) continue;
      const { O, u, v } = frameAt(g.pl, t, g.ref), p = g.profAt(t), w = v3.sub(q, O), x = v3.dot(w, u) - p[0], y = v3.dot(w, v) - p[1];
      const r = Math.hypot(x, y), th = Math.atan2(y, x), rp = profR(g.kind, p, th);
      if (r >= rp) continue;
      const dir = r > 1e-9 ? v3.add(v3.scl(u, x / r), v3.scl(v, y / r)) : u;
      q = v3.add(q, v3.scl(dir, rp + PUSH - r)); moved = true;
    }
    if (!moved) break;
  }
  return q;
}

export function build(table, ctx) {
  const MS = mesh(), W = wres(table, ctx), hulls = ctx.body ? bodyHulls(ctx) : [];
  const shells = shellPoints(table, ctx);
  for (const sh of shells) { // outer and inner layer of every shell
    const so = sh.src, crow = unrleList(so.col).map(decRow), cirow = unrleList(so.ci).map((s) => (s ? decRow(s) : null)), wrow = unrleList(so.w);
    {
      const id = sh.rows.map((r, i) => r.map((q, m) => { if (!q) return -1; const cr = sh.layer && cirow[i] ? cirow[i] : crow[i];
        return MS.v(pushOut(q, hulls), palCol(table, cr ? cr[m] : 0), W(wrow[i])); }));
      const M = sh.m, idx = MS.idx;
      for (let i = 0; i < id.length - 1; i++) for (let a = 0; a < M; a++) {
        const b = (a + 1) % M, A = id[i][a], B = id[i][b], C = id[i + 1][a], D = id[i + 1][b];
        const q = [A, B, D, C].filter((x) => x >= 0); // quad corners in cycle order; 3 present -> one triangle
        if (q.length === 4) idx.push(A, B, C, B, D, C); else if (q.length === 3) idx.push(q[0], q[1], q[2]);
      }
    }
  }
  const v0 = MS.pos.length / 3;
  buildStrips(table.strips, ctx.hero, MS, table, ctx);
  for (let i = v0; i < MS.pos.length / 3; i++) { const q = pushOut([MS.pos[i * 3], MS.pos[i * 3 + 1], MS.pos[i * 3 + 2]], hulls); MS.pos[i * 3] = q[0]; MS.pos[i * 3 + 1] = q[1]; MS.pos[i * 3 + 2] = q[2]; }
  return MS.out();
}
