// Code-only character generator: one table of numbers (fits/char/<hero>.js) -> one skinned triangle mesh
// (body lofts, finger lofts, SH head, SH hair cap trimmed at the hairline, hair and garment strips) plus a face-decal
// patch. Pure math, no three.js; lib/char-three.js turns it into THREE objects.
//
// Table: { skel:{names, parent, trs}, virt:{name:[x,y,z]}, palette:[[r,g,b]], chains:[...], head, cap, face, springs }
// chain: { name, group:'body'|'hand'|'hair'|'cloth', kind:'se'|'f6'|'strip', joints, ext, counts, ref, rings, col, w, weld }
import { v3, makePolyline, plPoint, plTangent, frame, ringTs, profR, crom } from './loft-core.js';
import { shBasis, icosphere } from './sph.js';

// ---------- skeleton FK (column-major 4x4, Float64) ----------
export function m4mul(a, b) { const o = new Float64Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
export function m4trs(t) {
  const [tx, ty, tz, x, y, z, w, sx, sy, sz] = t, x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  return Float64Array.from([(1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0, (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0, tx, ty, tz, 1]);
}
export function restWorld(skel) {
  const W = []; skel.names.forEach((_, i) => { const L = m4trs(skel.trs[i]); W[i] = skel.parent[i] < 0 ? L : m4mul(W[skel.parent[i]], L); }); return W;
}
export function jointPos(table, W) {
  const P = { ...table.virt }; table.skel.names.forEach((n, i) => { P[n] = [W[i][12], W[i][13], W[i][14]]; }); return P;
}

const sstep = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
function stripPts(p, S) { // p = [cu, cv, ang, hw, th, bend] -> S points (x along u, y along v) of a bent rounded slab
  const [cu, cv, ang, hw, th, bend] = p, ca = Math.cos(ang), sa = Math.sin(ang), out = [];
  for (let a = 0; a < S; a++) {
    const t = (a / S) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t), n = 4;
    const r = Math.pow(Math.pow(Math.abs(c) / Math.max(hw, 1e-4), n) + Math.pow(Math.abs(s) / Math.max(th, 1e-4), n), -1 / n);
    const x = r * c, y = r * s + (hw > 1e-5 ? bend * (x / hw) * (x / hw) : 0);
    out.push([cu + x * ca - y * sa, cv + x * sa + y * ca]);
  }
  return out;
}

// sparse weight maps: [[bone, w], ...]
function lerpW(a, b, t) { const m = new Map(); for (const [k, w] of a) m.set(k, (m.get(k) || 0) + w * (1 - t)); for (const [k, w] of b) m.set(k, (m.get(k) || 0) + w * t); return [...m].sort((x, y) => y[1] - x[1]).slice(0, 4); }

export function buildCharacter(table, opts = {}) {
  const W = restWorld(table.skel), J = jointPos(table, W), pal = table.palette;
  const pos = [], col = [], idx = [], si = [], sw = [], part = [], tf = [], partNames = [];
  const push = (q, c, w, pn, t) => {
    pos.push(q[0], q[1], q[2]); col.push(c[0], c[1], c[2]);
    const ws = w.slice(0, 4); const tot = ws.reduce((s, x) => s + x[1], 0) || 1;
    for (let k = 0; k < 4; k++) { si.push(ws[k] ? ws[k][0] : 0); sw.push(ws[k] ? ws[k][1] / tot : 0); }
    part.push(pn); tf.push(t);
    return pos.length / 3 - 1;
  };
  const chainInfo = [];
  for (const ch of table.chains) {
    if (opts.only && !opts.only.includes(ch.group)) continue;
    const pn = partNames.length; partNames.push(ch.name);
    const pl = makePolyline(ch.joints.map((n) => J[n]), ch.ext), ts = ringTs(pl, ch.counts), ref = table.ref[ch.ref];
    const strip = ch.kind === 'strip', S = strip ? 16 : (ch.group === 'hand' ? 12 : 32), sub = strip ? 1 : (ch.group === 'hand' ? 1 : 2);
    const R = ch.rings, n = R.length;
    const ringRows = [];
    for (let i = 0; i < n - 1; i++) for (let k = 0; k <= sub; k++) {
      if (k === 0) { ringRows.push({ i, f: 0 }); continue; } ringRows.push({ i, f: k / (sub + 1) });
    }
    ringRows.push({ i: n - 1, f: 0 });
    const starts = [], ringT = [];
    const panel = ch.name === 'trunk' && table.skirt ? table.skirt.bones.map((n) => table.skel.names.indexOf(n)) : null;
    const L1 = pl.S[2] - pl.S[0]; // ext start + first segment
    for (const { i, f } of ringRows) {
      const a = R[Math.max(0, i - 1)], b = R[i], c = R[Math.min(n - 1, i + 1)], d = R[Math.min(n - 1, i + 2)];
      const p = f === 0 ? b : crom(a, b, c, d, f);
      const t = f === 0 ? ts[i] : ts[i] + (ts[Math.min(n - 1, i + 1)] - ts[i]) * f;
      const w = f === 0 ? ch.w[i] : lerpW(ch.w[i], ch.w[Math.min(n - 1, i + 1)], f);
      const O = plPoint(pl, t), T = plTangent(pl, t), { u, v } = frame(T, ref);
      const colAt = (bin) => { // per-angle palette bins (body) or one colour per ring (strips)
        const cr = ch.col[i], cn = ch.col[Math.min(n - 1, i + 1)];
        const pick = (row) => (Array.isArray(row) ? row[((bin % row.length) + row.length) % row.length] : row);
        const c0 = pal[pick(cr)], c1 = pal[pick(cn)]; return [0, 1, 2].map((q) => c0[q] + (c1[q] - c0[q]) * f);
      };
      starts.push(pos.length / 3); ringT.push(t);
      const tt = t / pl.L;
      if (strip) {
        const pts = stripPts(p, S);
        pts.forEach(([x, y], a) => push(v3.add(O, v3.add(v3.scl(u, x), v3.scl(v, y))), colAt(0), w, pn, tt));
      } else {
        const C = v3.add(O, v3.add(v3.scl(u, p[0]), v3.scl(v, p[1])));
        const bins = Array.isArray(ch.col[i]) ? ch.col[i].length : 1;
        for (let a = 0; a < S; a++) {
          const th = (a / S) * Math.PI * 2, r = profR(ch.kind, p, th) + (ch.name === 'trunk' && ch.ext[0] > 0.095 && t < pl.S[1] - 0.06 ? 0.008 * Math.min(1, (pl.S[1] - 0.06 - t) / 0.05) : 0);
          const q = v3.add(C, v3.add(v3.scl(u, r * Math.cos(th)), v3.scl(v, r * Math.sin(th))));
          const fb = (a / S) * bins, b0 = Math.floor(fb), fr = fb - b0, c0 = colAt(b0), c1 = colAt(b0 + 1);
          let wv = w;
          if (panel && t < table.skirt.tTop) { const K = table.skirt.K, f = Math.min(1, (table.skirt.tTop - t) / Math.max(1e-6, table.skirt.tTop - ts[1] * 0.5)), fw = f * f * (3 - 2 * f) * 0.95;
            const pos2 = (th / (Math.PI * 2)) * K, k0 = Math.floor(pos2) % K, k1 = (k0 + 1) % K, a2 = pos2 - Math.floor(pos2);
            wv = w.map(([b, x]) => [b, x * (1 - fw)]).concat([[panel[k0], fw * (1 - a2)], [panel[k1], fw * a2]]).sort((x, y) => y[1] - x[1]); }
          push(q, [0, 1, 2].map((k) => c0[k] + (c1[k] - c0[k]) * fr), wv, pn, ch.weld ? Math.min(1, t / Math.max(L1, 1e-6)) : tt);
        }
      }
    }
    const nr = starts.length;
    for (let r = 0; r < nr - 1; r++) for (let a = 0; a < S; a++) {
      const i0 = starts[r] + a, i1 = starts[r] + (a + 1) % S, j0 = starts[r + 1] + a, j1 = starts[r + 1] + (a + 1) % S;
      idx.push(i0, i1, j0, i1, j1, j0);
    }
    // a skirt is open at the hem: no bottom cap, and an inset reversed lining so its inside reads as cloth
    const skirt = ch.name === 'trunk' && ch.ext[0] > 0.095;
    if (skirt) {
      const lin = [];
      for (let r = 0; r < nr; r++) { if (ringT[r] > pl.S[1] - 0.05) break; lin.push(r); }
      const base = pos.length / 3;
      for (const r of lin) for (let a = 0; a < S; a++) {
        const k = starts[r] + a, q = [pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]];
        const ctr = [0, 1, 2].map((c) => { let m = 0; for (let b = 0; b < S; b++) m += pos[(starts[r] + b) * 3 + c]; return m / S; });
        const d = v3.sub(q, ctr), L = v3.len(d) || 1, qi = v3.add(ctr, v3.scl(d, (L - 0.003) / L));
        push(qi, col.slice(k * 3, k * 3 + 3).map((c) => c * 0.62), [[si[k * 4], sw[k * 4]], [si[k * 4 + 1], sw[k * 4 + 1]], [si[k * 4 + 2], sw[k * 4 + 2]], [si[k * 4 + 3], sw[k * 4 + 3]]], pn, tf[k]);
      }
      for (let i = 0; i < lin.length - 1; i++) for (let a = 0; a < S; a++) {
        const i0 = base + i * S + a, i1 = base + i * S + (a + 1) % S, j0 = base + (i + 1) * S + a, j1 = base + (i + 1) * S + (a + 1) % S;
        idx.push(i0, j0, i1, i1, j0, j1);
      }
    }
    for (const [r, first] of (skirt ? [[nr - 1, false]] : [[0, true], [nr - 1, false]])) {
      let c = [0, 0, 0]; for (let a = 0; a < S; a++) c = v3.add(c, pos.slice((starts[r] + a) * 3, (starts[r] + a) * 3 + 3));
      c = v3.scl(c, 1 / S);
      const k0 = starts[r];
      const ci = push(c, col.slice(k0 * 3, k0 * 3 + 3), [[si[k0 * 4], sw[k0 * 4]], [si[k0 * 4 + 1], sw[k0 * 4 + 1]], [si[k0 * 4 + 2], sw[k0 * 4 + 2]]], pn, first ? 0 : 1);
      for (let a = 0; a < S; a++) { const i0 = starts[r] + a, i1 = starts[r] + (a + 1) % S; if (first) idx.push(ci, i1, i0); else idx.push(ci, i0, i1); }
    }
    if (ch.name === 'trunk' && ch.ext[0] > 0.06) skirtBlend(table, ch, pl, starts[0], pos.length / 3, pos, si, sw, J, table.skirt ? 0.5 : 1);
    chainInfo.push({ name: ch.name, group: ch.group, weld: !!ch.weld, v0: starts[0], v1: pos.length / 3, starts, S, ringT, tRoot: pl.S[1] });
  }
  if (opts.settle !== false) settleStrips(table, J, chainInfo, pos, si, sw, tf);
  // ---------- SH head and hair cap ----------
  const sh = (o, d) => { const B = shBasis(o.L, d[0], d[1], d[2]); let r = 0; for (let k = 0; k < B.length; k++) r += o.coef[k] * B[k]; return r; };
  const { V, F } = icosphere(opts.level || 4);
  const headBone = table.skel.names.indexOf(table.head.bone);
  const skinC = pal[table.head.col];
  let headV0 = 0, faceIdx = [];
  if (!opts.only || opts.only.includes('head')) {
    const pn = partNames.length; partNames.push('head'); headV0 = pos.length / 3;
    V.forEach((d) => { const r = Math.max(0.01, sh(table.head, d)); push(v3.add(table.head.center, v3.scl(d, r)), skinC, [[headBone, 1]], pn, 0); });
    for (const f of F) idx.push(headV0 + f[0], headV0 + f[1], headV0 + f[2]);
    faceIdx = F;
    chainInfo.push({ name: 'head', group: 'head', v0: headV0, v1: pos.length / 3 });
  }
  if (table.cap && (!opts.only || opts.only.includes('hair'))) {
    const cap = table.cap, pn = partNames.length; partNames.push('cap'); const v0 = pos.length / 3, hairC = pal[cap.col];
    // never cover the eyes: below the brow line, the front of the cap is cut
    let browY = Infinity; if (table.face) for (const e of table.face.eyes) { const ir = e.iris || e.line; if (ir) browY = Math.min(browY, ir.c[1] + ir.h * 0.75); }
    const keep = V.map((d) => sh({ L: cap.covL, coef: cap.cov }, d) > 0.5 && !(d[2] > 0.2 && cap.center[1] + d[1] * sh(table.head, d) < browY));
    const rr = V.map((d) => Math.max(sh(cap, d), sh(table.head, d) + 0.004)); // cap shares the head centre
    const capBone = table.skel.names.indexOf(cap.bone);
    // outer shell + slightly inset inner shell (reversed) so the cut edge never shows a hole
    const V2 = icosphere(2).V, dcol = V.map((d) => { if (!cap.dirCol) return hairC; let b = 0, bd = -2; V2.forEach((e, k) => { const x = d[0] * e[0] + d[1] * e[1] + d[2] * e[2]; if (x > bd) { bd = x; b = k; } }); return pal[cap.dirCol[b]] || hairC; });
    V.forEach((d, i) => push(v3.add(cap.center, v3.scl(d, rr[i])), dcol[i], [[capBone, 1]], pn, 0));
    V.forEach((d, i) => push(v3.add(cap.center, v3.scl(d, rr[i] - 0.003)), dcol[i], [[capBone, 1]], pn, 0));
    for (const f of F) {
      const k = (keep[f[0]] ? 1 : 0) + (keep[f[1]] ? 1 : 0) + (keep[f[2]] ? 1 : 0);
      if (k < 2) continue;
      idx.push(v0 + f[0], v0 + f[1], v0 + f[2]); const o = V.length; idx.push(v0 + o + f[0], v0 + o + f[2], v0 + o + f[1]);
    }
    chainInfo.push({ name: 'cap', group: 'hair', v0, v1: pos.length / 3 });
  }
  // ---------- face decal patch: the front of the head SH, planar UVs ----------
  let face = null;
  if (table.face && headV0 >= 0 && faceIdx.length) {
    const fp = table.face.plane, fpos = [], fuv = [], fidx = [], map = new Map();
    const inside = (q) => q[2] > table.head.center[2] && q[0] > fp.x0 && q[0] < fp.x0 + fp.w && q[1] > fp.y0 && q[1] < fp.y0 + fp.h;
    for (const f of faceIdx) {
      const qs = f.map((k) => pos.slice((headV0 + k) * 3, (headV0 + k) * 3 + 3));
      if (!qs.every(inside)) continue;
      const ids = f.map((k, j) => {
        if (map.has(k)) return map.get(k);
        const q = qs[j], d = v3.norm(v3.sub(q, table.head.center)), qq = v3.add(q, v3.scl(d, 0.0008));
        fpos.push(...qq); fuv.push((q[0] - fp.x0) / fp.w, (q[1] - fp.y0) / fp.h); map.set(k, fpos.length / 3 - 1); return fpos.length / 3 - 1;
      });
      fidx.push(...ids);
    }
    face = { position: new Float32Array(fpos), uv: new Float32Array(fuv), index: new Uint32Array(fidx), bone: headBone };
  }
  return { position: new Float32Array(pos), color: new Float32Array(col), index: new Uint32Array(idx), skinIndex: new Uint16Array(si), skinWeight: new Float32Array(sw),
    part: new Uint8Array(part), tfrac: new Float32Array(tf), partNames, chains: chainInfo, face, restWorld: W, joints: J };
}


// rest-pose loft of a body chain, for push-out and inside tests
export function tubeOf(table, J, name) {
  const ch = table.chains.find((c) => c.name === name); if (!ch) return null;
  const pl = makePolyline(ch.joints.map((n) => J[n]), ch.ext); return { ch, pl, ts: ringTs(pl, ch.counts), ref: table.ref[ch.ref] };
}
// where q sits relative to the loft: t along the chain, radius r vs profile radius rp, radial unit direction
export function tubeQuery(G, q) {
  const { pl, ts, ch, ref } = G; let best = Infinity, bt = 0;
  for (let i = 0; i < pl.D.length; i++) {
    const a = pl.P[i], d = pl.D[i], L = pl.S[i + 1] - pl.S[i]; const w = [q[0] - a[0], q[1] - a[1], q[2] - a[2]];
    const s = Math.max(0, Math.min(L, w[0] * d[0] + w[1] * d[1] + w[2] * d[2]));
    const e = [w[0] - d[0] * s, w[1] - d[1] * s, w[2] - d[2] * s], dd = e[0] * e[0] + e[1] * e[1] + e[2] * e[2]; if (dd < best) { best = dd; bt = pl.S[i] + s; }
  }
  if (bt <= 0.002 || bt >= pl.L - 0.002) return null;
  let i = 0; while (i < ts.length - 2 && ts[i + 1] < bt) i++; const f = (bt - ts[i]) / Math.max(1e-9, ts[i + 1] - ts[i]);
  const p = ch.rings[i].map((x, k) => x + (ch.rings[i + 1][k] - x) * f);
  const O = plPoint(pl, bt), T = plTangent(pl, bt), { u, v } = frame(T, ref);
  const C = v3.add(O, v3.add(v3.scl(u, p[0]), v3.scl(v, p[1])));
  const w = v3.sub(q, C); const x = v3.dot(w, u), y = v3.dot(w, v); const r = Math.hypot(x, y), th = Math.atan2(y, x);
  return { t: bt, r, rp: profR(ch.kind, p, th), C, dir: r > 1e-9 ? v3.add(v3.scl(u, x / r), v3.scl(v, y / r)) : u, pl };
}
// strips (hair locks, garment panels) that cut into a body loft at rest are pushed out to its surface + gap;
// garment panels below the hips also lean on the thigh under them (part of their weight goes to that hip bone)
function settleStrips(table, J, chainInfo, pos, si, sw, tf) {
  const body = ['trunk', 'leg_L', 'leg_R', 'arm_L', 'arm_R'].map((n) => tubeOf(table, J, n)).filter(Boolean);
  const names = table.skel.names, caps = table.capsules || [];
  const thigh = ['L', 'R'].map((sd) => { const c = caps.find((k) => k.a === 'Hip_' + sd); return c ? { a: J['Hip_' + sd], b: J['Knee_' + sd], r: c.r, bone: names.indexOf('Hip_' + sd) } : null; }).filter(Boolean);
  let pushed = 0;
  for (const ci of chainInfo) {
    if (ci.group !== 'cloth' && ci.group !== 'hair') continue;
    const gap = ci.group === 'cloth' ? 0.005 : 0.004;
    for (let v = ci.v0; v < ci.v1; v++) {
      if (tf[v] < 0.06) continue;
      const q = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
      for (const G of body) {
        const r = tubeQuery(G, q); if (!r) continue;
        if (r.r < r.rp + gap) { const k = r.rp + gap - r.r; for (let c = 0; c < 3; c++) q[c] += r.dir[c] * k; pushed++; }
      }
      pos[v * 3] = q[0]; pos[v * 3 + 1] = q[1]; pos[v * 3 + 2] = q[2];
      if (ci.group === 'cloth') for (const th of thigh) {
        const hipY = th.a[1]; if (q[1] > hipY) continue;
        const ab = v3.sub(th.b, th.a), L2 = v3.dot(ab, ab); const f = Math.max(0, Math.min(1, v3.dot(v3.sub(q, th.a), ab) / L2));
        const d = v3.len(v3.sub(q, v3.add(th.a, v3.scl(ab, f)))), reach = th.r * 2.4; if (d > reach) continue;
        const w = 0.6 * Math.min(1, (hipY - q[1]) / 0.2) * (1 - d / reach); if (w <= 0.01) continue;
        const ws = []; for (let k = 0; k < 4; k++) if (sw[v * 4 + k] > 0) ws.push([si[v * 4 + k], sw[v * 4 + k] * (1 - w)]);
        ws.push([th.bone, w]); ws.sort((a, b) => b[1] - a[1]);
        for (let k = 0; k < 4; k++) { si[v * 4 + k] = ws[k] ? ws[k][0] : 0; sw[v * 4 + k] = ws[k] ? ws[k][1] : 0; }
        const tot = sw[v * 4] + sw[v * 4 + 1] + sw[v * 4 + 2] + sw[v * 4 + 3] || 1; for (let k = 0; k < 4; k++) sw[v * 4 + k] /= tot;
      }
    }
  }
  return pushed;
}

// the part of the trunk below the pelvis joint (a closed skirt or dress) leans on the thighs: up to half of each vertex
// weight moves to the hip bone on its side, growing toward the hem, so running thighs carry the skirt instead of piercing it
function skirtBlend(table, ch, pl, v0, v1, pos, si, sw, J, gain = 1) {
  const names = table.skel.names, hl = names.indexOf('Hip_L'), hr = names.indexOf('Hip_R'); if (hl < 0 || hr < 0) return;
  const root = J.Root_M, xl = J.Hip_L[0], xr = J.Hip_R[0], half = Math.abs(xl - xr) / 2 || 0.05, mid = (xl + xr) / 2;
  const tRoot = pl.S[1], ext = ch.ext[0];
  const dir = pl.D[0];
  for (let v = v0; v < v1; v++) {
    const q = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
    const t = tRoot + ((q[0] - root[0]) * dir[0] + (q[1] - root[1]) * dir[1] + (q[2] - root[2]) * dir[2]);
    if (t >= tRoot) continue;
    const f = Math.min(1, (tRoot - t) / ext), wT = Math.min(0.55, 0.45 * f * f * (3 - 2 * f) + 0.15 * Math.min(1, (tRoot - t) / 0.05)) * Math.min(1, 0.16 / ext) * gain;
    // the sides follow their own thigh fully, the front and back centre split between both
    const s = Math.max(-1, Math.min(1, (q[0] - mid) / (half * 1.2))) * Math.sign(xl - mid), side = 0.5 + 0.5 * Math.sin(s * Math.PI / 2);
    const wl = wT * side, wr = wT - wl;
    const keep = 1 - wl - wr, ws = [];
    for (let k = 0; k < 4; k++) if (sw[v * 4 + k] > 0) ws.push([si[v * 4 + k], sw[v * 4 + k] * keep]);
    ws.push([hl, wl], [hr, wr]); ws.sort((a, b) => b[1] - a[1]);
    for (let k = 0; k < 4; k++) { si[v * 4 + k] = ws[k] ? ws[k][0] : 0; sw[v * 4 + k] = ws[k] ? ws[k][1] : 0; }
    const tot = sw[v * 4] + sw[v * 4 + 1] + sw[v * 4 + 2] + sw[v * 4 + 3] || 1; for (let k = 0; k < 4; k++) sw[v * 4 + k] /= tot;
  }
}

// vertex normals; chains marked weld blend their root normals into the nearest trunk normals
export function normals(arr) {
  const p = arr.position, ix = arr.index, n = new Float32Array(p.length);
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { n[k] += fx; n[k + 1] += fy; n[k + 2] += fz; }
  }
  for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
  const trunk = arr.chains.find((c) => c.name === 'trunk');
  if (trunk) {
    for (const ch of arr.chains) {
      if (!ch.weld) continue;
      for (let v = ch.v0; v < ch.v1; v++) {
        const t = arr.tfrac[v]; if (t > 0.45) continue;
        let best = Infinity, bi = -1;
        for (let q = trunk.v0; q < trunk.v1; q++) { const d = (p[q * 3] - p[v * 3]) ** 2 + (p[q * 3 + 1] - p[v * 3 + 1]) ** 2 + (p[q * 3 + 2] - p[v * 3 + 2]) ** 2; if (d < best) { best = d; bi = q; } }
        const w = 1 - sstep(t / 0.45);
        for (let k = 0; k < 3; k++) n[v * 3 + k] = n[v * 3 + k] * (1 - w) + n[bi * 3 + k] * w;
        const l = Math.hypot(n[v * 3], n[v * 3 + 1], n[v * 3 + 2]) || 1; for (let k = 0; k < 3; k++) n[v * 3 + k] /= l;
      }
    }
  }
  return n;
}
