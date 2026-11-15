// Voxelizer for skinned (or rigid) triangle meshes: bind-pose triangles -> one voxel grid per bone on a shared lattice ->
// greedy-meshed quads with baked per-vertex AO, one BufferGeometry per character with a per-vertex bone index (aBone),
// drawn by vox/material.js which moves every bone part rigidly from a per-bone 3x4 matrix. So any rig that can give
// "bone b maps bind point p to R_b p + O_b" keeps its own animation code; the voxels just ride the bones.
//
// API (see README.md):
//   const model = voxelize(src, { size, minW, shade })
//     src = { P: Float32Array bind positions (xyz), N: normals (optional), I: triangle indices, nBones,
//             BA, BB: Uint8Array bone ids per vertex, W: Float32Array weight of BB (0 = all BA); omit BB/W for rigid,
//             omit BA too for a single-bone mesh }
//     size  = voxel edge in mesh units; minW = weight above which a blended vertex also lands in its other bone (0.25)
//     priority(v) -> 0..1 (optional): small features that should win a voxel they share with a bigger surface
//             (pupils, lenses); applied when the feature is within `tol` voxels (0.6) of the outermost sample
//     ignore(v) -> true: the sample fills its voxel but never colours it (features a decal will paint instead)
//     decals = [{ bone, p: [x,y,z] bind point, dir: [0,0,1], col: [r,g,b], emis, cells: [[du,dv],...] lattice x/y offsets,
//               onlyIf(v): paint only if the voxel's colour came from a vertex passing this test }]
//     phase = [px,py,pz]: lattice planes at px + k * size (use [size/2, 0, 0] for symmetric characters facing +z)
//     shade(v, x, y, z) -> [r, g, b, emis]  linear colour of the surface seen at voxel centre (x, y, z), where v is the
//             index of the source vertex that was outermost in that voxel (default: no colour data -> grey)
//   const geo = meshModel(model)  -> THREE.BufferGeometry (position, normal, color, aBone, aEmis), userData { tris, quads, vox }
// Same greedy + AO scheme as Blockade Z's js/vox/voxelize.js meshGrid (our own code), per part instead of per mesh.
import { THREE } from '../lib/lf-host.js';

const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

// ---------- bind-pose triangles -> per-bone sample lists ----------
function samplesOf(src, size, minW) {
  const P = src.P, I = src.I, N = src.N, BA = src.BA, BB = src.BB, W = src.W;
  const out = { x: [], y: [], z: [], v: [], b: [] };
  const step = size * 0.45;
  const push = (x, y, z, v) => {
    const a = BA ? BA[v] : 0, w = W ? W[v] : 0, bb = BB ? BB[v] : a;
    if (a === bb || w <= 0) { out.x.push(x); out.y.push(y); out.z.push(z); out.v.push(v); out.b.push(a); return; }
    if (1 - w >= minW) { out.x.push(x); out.y.push(y); out.z.push(z); out.v.push(v); out.b.push(a); }
    if (w >= minW) { out.x.push(x); out.y.push(y); out.z.push(z); out.v.push(v); out.b.push(bb); }
  };
  for (let t = 0; t < I.length; t += 3) {
    const i0 = I[t], i1 = I[t + 1], i2 = I[t + 2];
    const ax = P[i0 * 3], ay = P[i0 * 3 + 1], az = P[i0 * 3 + 2], bx = P[i1 * 3], by = P[i1 * 3 + 1], bz = P[i1 * 3 + 2], cx = P[i2 * 3], cy = P[i2 * 3 + 1], cz = P[i2 * 3 + 2];
    const e = Math.max(Math.hypot(bx - ax, by - ay, bz - az), Math.hypot(cx - bx, cy - by, cz - bz), Math.hypot(ax - cx, ay - cy, az - cz));
    if (!(e > 0)) continue;
    const n = Math.max(1, Math.ceil(e / step));
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
      const u = i / n, w = j / n, s = 1 - u - w;
      // each sample takes the attributes of the corner it is nearest to (keeps hard colour edges between garments)
      const v = s >= u && s >= w ? i0 : u >= w ? i1 : i2;
      push(ax * s + bx * u + cx * w, ay * s + by * u + cy * w, az * s + bz * u + cz * w, v);
    }
    if (n === 1) push((ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3, i0);
  }
  return out;
}

// ---------- flood fill the outside of a part grid; everything not reached becomes solid ----------
function fillInside(occ, nx, ny, nz) {
  const n = nx * ny * nz, out = new Uint8Array(n), st = new Int32Array(n); let sp = 0;
  const seed = (i) => { if (!occ[i] && !out[i]) { out[i] = 1; st[sp++] = i; } };
  for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) if (x === 0 || y === 0 || z === 0 || x === nx - 1 || y === ny - 1 || z === nz - 1) seed(x + nx * (z + nz * y));
  while (sp) {
    const i = st[--sp], x = i % nx, r = (i - x) / nx, z = r % nz, y = (r - z) / nz;
    if (x > 0) seed(i - 1); if (x < nx - 1) seed(i + 1);
    if (z > 0) seed(i - nx); if (z < nz - 1) seed(i + nx);
    if (y > 0) seed(i - nx * nz); if (y < ny - 1) seed(i + nx * nz);
  }
  let filled = 0;
  for (let i = 0; i < n; i++) if (!occ[i] && !out[i]) { occ[i] = 2; filled++; }
  return filled;
}

export function voxelize(src, o = {}) {
  const size = o.size, minW = o.minW === undefined ? 0.25 : o.minW, nb = src.nBones || 1, prio = o.priority || null, ignore = o.ignore || null, tol = o.tol === undefined ? 0.6 : o.tol;
  // per-bone lattice: boneScale[b] < 1 makes that part finer (a head at 0.5 gets twice the voxels across a face)
  const bs = o.boneScale || [], szOf = new Float64Array(nb); let fin = 1;
  for (let b = 0; b < nb; b++) { szOf[b] = size * (bs[b] || 1); fin = Math.min(fin, bs[b] || 1); }
  const S = samplesOf(src, size * fin, minW), ns = S.x.length;
  // shared lattice: origin snapped so every part's voxels line up in bind pose
  let mnx = 1e9, mny = 1e9, mnz = 1e9; for (let i = 0; i < ns; i++) { if (S.x[i] < mnx) mnx = S.x[i]; if (S.y[i] < mny) mny = S.y[i]; if (S.z[i] < mnz) mnz = S.z[i]; }
  const ph = o.phase || [0, 0, 0]; // lattice planes at (ph + k) * cell size, ph in cells ([0.5, 0, 0] puts x = 0 on a cell centre: symmetric faces)
  const org = new Float64Array(nb * 3);
  for (let b = 0; b < nb; b++) { const z = szOf[b]; org[b * 3] = Math.floor((mnx - ph[0] * z) / z) * z + ph[0] * z; org[b * 3 + 1] = Math.floor((mny - ph[1] * z) / z) * z + ph[1] * z; org[b * 3 + 2] = Math.floor((mnz - ph[2] * z) / z) * z + ph[2] * z; }
  const ox = org[0], oy = org[1], oz = org[2];
  const cell = new Int32Array(ns * 3);
  const lo = new Int32Array(nb * 3).fill(1 << 30), hi = new Int32Array(nb * 3).fill(-(1 << 30));
  for (let i = 0; i < ns; i++) {
    const b = S.b[i] * 3, z = szOf[S.b[i]], cx = Math.floor((S.x[i] - org[b]) / z), cy = Math.floor((S.y[i] - org[b + 1]) / z), cz = Math.floor((S.z[i] - org[b + 2]) / z);
    cell[i * 3] = cx; cell[i * 3 + 1] = cy; cell[i * 3 + 2] = cz;
    if (cx < lo[b]) lo[b] = cx; if (cy < lo[b + 1]) lo[b + 1] = cy; if (cz < lo[b + 2]) lo[b + 2] = cz;
    if (cx > hi[b]) hi[b] = cx; if (cy > hi[b + 1]) hi[b + 1] = cy; if (cz > hi[b + 2]) hi[b + 2] = cz;
  }
  const parts = [];
  const N = src.N;
  for (let b = 0; b < nb; b++) {
    if (hi[b * 3] < lo[b * 3]) continue;
    // one empty cell of margin on every side so the flood fill can go round
    const x0 = lo[b * 3] - 1, y0 = lo[b * 3 + 1] - 1, z0 = lo[b * 3 + 2] - 1;
    const nx = hi[b * 3] - x0 + 2, ny = hi[b * 3 + 1] - y0 + 2, nz = hi[b * 3 + 2] - z0 + 2, n = nx * ny * nz;
    parts.push({ bone: b, size: szOf[b], ox: org[b * 3], oy: org[b * 3 + 1], oz: org[b * 3 + 2], x0, y0, z0, nx, ny, nz, occ: new Uint8Array(n), best: new Float32Array(n * 6).fill(-1e9), bv: new Int32Array(n * 6).fill(-1),
      pbest: new Float32Array(n * 6).fill(-1e9), pdep: new Float32Array(n * 6), pv: new Int32Array(n * 6).fill(-1), col: null, emis: null, count: 0 });
  }
  const partOf = new Int32Array(nb).fill(-1); parts.forEach((p, k) => (partOf[p.bone] = k));
  // every sample marks its cell; per face direction the cell remembers the outermost sample (what you would see there)
  for (let i = 0; i < ns; i++) {
    const p = parts[partOf[S.b[i]]], x = cell[i * 3] - p.x0, y = cell[i * 3 + 1] - p.y0, z = cell[i * 3 + 2] - p.z0, c = x + p.nx * (z + p.nz * y);
    p.occ[c] = 1;
    const ign = ignore && ignore(S.v[i]) ? 100 : 0; // fills the cell, but colours it only if nothing else is there
    const v = S.v[i], fx = (S.x[i] - p.ox) / p.size - cell[i * 3] - 0.5, fy = (S.y[i] - p.oy) / p.size - cell[i * 3 + 1] - 0.5, fz = (S.z[i] - p.oz) / p.size - cell[i * 3 + 2] - 0.5;
    const nx = N ? N[v * 3] : 0, ny = N ? N[v * 3 + 1] : 0, nz = N ? N[v * 3 + 2] : 0;
    const sc = [fx + 0.3 * nx - ign, -fx - 0.3 * nx - ign, fy + 0.3 * ny - ign, -fy - 0.3 * ny - ign, fz + 0.3 * nz - ign, -fz - 0.3 * nz - ign];
    for (let d = 0; d < 6; d++) if (sc[d] > p.best[c * 6 + d]) { p.best[c * 6 + d] = sc[d]; p.bv[c * 6 + d] = v; }
    // small features (pupils, lenses, glowing eyes) win their voxel when they sit near the front of it
    const pr = prio && !ign ? prio(v) : 0;
    if (pr > 0) for (let d = 0; d < 6; d++) { const k = c * 6 + d, q = pr * 4 + sc[d]; if (q > p.pbest[k]) { p.pbest[k] = q; p.pdep[k] = sc[d]; p.pv[k] = v; } }
  }
  for (const p of parts) { // resolve: a priority sample replaces the outermost one if it is within `tol` voxels of it
    const n6 = p.best.length;
    for (let k = 0; k < n6; k++) if (p.pv[k] >= 0 && p.pdep[k] >= p.best[k] - tol) { p.bv[k] = p.pv[k]; p.best[k] = Math.max(p.best[k], p.pdep[k]) + 1e-3; }
    p.pbest = p.pdep = p.pv = null;
  }
  let vox = 0;
  for (const p of parts) {
    fillInside(p.occ, p.nx, p.ny, p.nz);
    const { nx, ny, nz, occ } = p, n = nx * ny * nz, col = (p.col = new Float32Array(n * 3)), em = (p.emis = new Float32Array(n)), vsel = (p.vsel = new Int32Array(n).fill(-1));
    const at = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < nx && y < ny && z < nz && occ[x + nx * (z + nz * y)];
    for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
      const c = x + nx * (z + nz * y); if (!occ[c]) continue; p.count++;
      // colour only what can be seen: pick the exposed side whose outermost sample sits furthest out
      let bd = -1, bs = -1e9;
      for (let d = 0; d < 6; d++) { const D = DIRS[d]; if (at(x + D[0], y + D[1], z + D[2])) continue; const s = p.best[c * 6 + d]; if (p.bv[c * 6 + d] >= 0 && s > bs) { bs = s; bd = d; } }
      if (bd < 0) { for (let d = 0; d < 6; d++) if (p.bv[c * 6 + d] >= 0 && p.best[c * 6 + d] > bs) { bs = p.best[c * 6 + d]; bd = d; } }
      if (bd < 0) { col[c * 3] = col[c * 3 + 1] = col[c * 3 + 2] = -1; continue; } // inside: no colour needed
      const wx = p.ox + (p.x0 + x + 0.5) * p.size, wy = p.oy + (p.y0 + y + 0.5) * p.size, wz = p.oz + (p.z0 + z + 0.5) * p.size;
      const s = o.shade ? o.shade(p.bv[c * 6 + bd], wx, wy, wz) : [0.6, 0.6, 0.6, 0];
      col[c * 3] = s[0]; col[c * 3 + 1] = s[1]; col[c * 3 + 2] = s[2]; em[c] = s[3] || 0; vsel[c] = p.bv[c * 6 + bd];
    }
    vox += p.count; p.best = null; p.bv = null;
  }
  // decals: paint the surface voxel seen from `dir` at a bind-space point (eyes, brows, mouths too small for the lattice)
  for (const dc of o.decals || []) {
    const p = parts[partOf[dc.bone]]; if (!p) continue;
    const D = dc.dir || [0, 0, 1], cx = Math.floor((dc.p[0] - p.ox) / p.size) - p.x0, cy = Math.floor((dc.p[1] - p.oy) / p.size) - p.y0, cz = Math.floor((dc.p[2] - p.oz) / p.size) - p.z0;
    const ok = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < p.nx && y < p.ny && z < p.nz && p.occ[x + p.nx * (z + p.nz * y)];
    for (const [du, dv] of dc.cells || [[0, 0]]) {
      let x = cx + du, y = cy + dv, z = cz, k = 0;
      if (ok(x, y, z)) { while (k++ < 4 && ok(x + D[0], y + D[1], z + D[2])) { x += D[0]; y += D[1]; z += D[2]; } }
      else { while (k++ < 4 && !ok(x, y, z)) { x -= D[0]; y -= D[1]; z -= D[2]; } if (!ok(x, y, z)) continue; }
      const c = x + p.nx * (z + p.nz * y);
      if (dc.onlyIf && !dc.onlyIf(p.vsel[c])) continue; // something else covers the face here (glasses, a mask, a brim)
      p.col[c * 3] = dc.col[0]; p.col[c * 3 + 1] = dc.col[1]; p.col[c * 3 + 2] = dc.col[2]; p.emis[c] = dc.emis || 0;
    }
  }
  for (const p of parts) p.vsel = null;
  return { size, ox, oy, oz, parts, vox, nBones: nb };
}

// ---------- greedy mesh with baked AO ----------
const AOK = [0.48, 0.66, 0.83, 1];
const AX = [[1, 2, 0], [2, 0, 1], [0, 1, 2]];
const l2s = (v) => { v = v < 0 ? 0 : v > 1 ? 1 : v; return Math.round((v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255); };

export function meshModel(model, o = {}) {
  const { size, ox, oy, oz } = model, P = [], Nn = [], C = [], B = [], E = [], LT = [], I = []; let quads = 0;
  for (const part of model.parts) {
    const { nx, ny, nz, occ, col, emis, x0, y0, z0, bone } = part, dim = [nx, ny, nz];
    // a part may carry its own lattice (size, ox, oy, oz) and a matrix into its bone's space (Blockade Z parts)
    const sz = part.size || size, pox = part.ox === undefined ? ox : part.ox, poy = part.oy === undefined ? oy : part.oy, poz = part.oz === undefined ? oz : part.oz, M = part.m ? part.m.elements : null;
    // palette key per cell: quantised sRGB + emissive bit, so equal-looking neighbours merge
    const key = new Int32Array(nx * ny * nz);
    const qs = o.quant === undefined ? 2 : o.quant; // drop low bits of sRGB so near-equal neighbours merge (the shader jitters anyway)
    for (let i = 0; i < key.length; i++) if (occ[i]) key[i] = col[i * 3] < 0 ? 1 : (((l2s(col[i * 3]) >> qs) << 16) | ((l2s(col[i * 3 + 1]) >> qs) << 8) | (l2s(col[i * 3 + 2]) >> qs)) + (emis[i] > 0 ? 1 << 24 : 0) + 2;
    const at = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz ? 0 : occ[x + nx * (z + nz * y)]);
    const p = [0, 0, 0], q = [0, 0, 0];
    for (let d = 0; d < 3; d++) {
      const [ua, va] = AX[d], nu = dim[ua], nv = dim[va], mc = new Int32Array(nu * nv), mi = new Int32Array(nu * nv), ma = new Uint8Array(nu * nv);
      for (let s = 0; s < 2; s++) {
        const sg = s ? 1 : -1;
        for (let w = 0; w < dim[d]; w++) {
          let any = false;
          for (let v = 0; v < nv; v++) for (let u = 0; u < nu; u++) {
            p[d] = w; p[ua] = u; p[va] = v; const ci = p[0] + nx * (p[2] + nz * p[1]); let k = 0, ao = 0;
            if (occ[ci]) {
              q[0] = p[0]; q[1] = p[1]; q[2] = p[2]; q[d] += sg;
              if (!at(q[0], q[1], q[2])) {
                k = key[ci]; any = true;
                const oc = (du, dv) => { const r = [q[0], q[1], q[2]]; r[ua] += du; r[va] += dv; return at(r[0], r[1], r[2]) ? 1 : 0; };
                const cor = (du, dv) => { const s1 = oc(du, 0), s2 = oc(0, dv); return s1 && s2 ? 0 : 3 - s1 - s2 - oc(du, dv); };
                ao = cor(-1, -1) | (cor(1, -1) << 2) | (cor(1, 1) << 4) | (cor(-1, 1) << 6);
              }
            }
            mc[u + nu * v] = k; mi[u + nu * v] = ci; ma[u + nu * v] = ao;
          }
          if (!any) continue;
          for (let v = 0; v < nv; v++) for (let u = 0; u < nu;) {
            const k = mc[u + nu * v]; if (!k) { u++; continue; }
            const ao = ma[u + nu * v], ci = mi[u + nu * v], flat = ao === 255; let w2 = 1, h2 = 1;
            while (u + w2 < nu && mc[u + w2 + nu * v] === k && ma[u + w2 + nu * v] === ao && (flat || ((ao & 3) === ((ao >> 2) & 3) && ((ao >> 4) & 3) === ((ao >> 6) & 3)))) w2++;
            if (flat || (w2 === 1 && (ao & 3) === ((ao >> 6) & 3) && ((ao >> 2) & 3) === ((ao >> 4) & 3))) {
              outer: for (; v + h2 < nv; h2++) for (let kk = 0; kk < w2; kk++) if (mc[u + kk + nu * (v + h2)] !== k || ma[u + kk + nu * (v + h2)] !== ao) break outer;
            }
            for (let bb = 0; bb < h2; bb++) for (let kk = 0; kk < w2; kk++) mc[u + kk + nu * (v + bb)] = 0;
            let r = col[ci * 3], g = col[ci * 3 + 1], b = col[ci * 3 + 2]; if (r < 0) { r = g = b = 0.3; }
            const em = emis[ci], base = P.length / 3;
            const corners = [[0, 0, ao & 3], [w2, 0, (ao >> 2) & 3], [w2, h2, (ao >> 4) & 3], [0, h2, (ao >> 6) & 3]];
            for (const [cu, cv, a] of corners) {
              p[d] = w + s; p[ua] = u + cu; p[va] = v + cv;
              const X = pox + (x0 + p[0]) * sz, Y = poy + (y0 + p[1]) * sz, Z = poz + (z0 + p[2]) * sz, n0 = d === 0 ? sg : 0, n1 = d === 1 ? sg : 0, n2 = d === 2 ? sg : 0;
              if (M) { P.push(M[0] * X + M[4] * Y + M[8] * Z + M[12], M[1] * X + M[5] * Y + M[9] * Z + M[13], M[2] * X + M[6] * Y + M[10] * Z + M[14]); Nn.push(M[0] * n0 + M[4] * n1 + M[8] * n2, M[1] * n0 + M[5] * n1 + M[9] * n2, M[2] * n0 + M[6] * n1 + M[10] * n2); }
              else { P.push(X, Y, Z); Nn.push(n0, n1, n2); }
              LT.push(x0 + p[0], y0 + p[1], z0 + p[2]); // lattice coordinate: the shader's bevel and jitter follow each part's own cells
              const kA = em > 0 ? 1 : AOK[a]; C.push(r * kA, g * kA, b * kA); B.push(bone); E.push(em);
            }
            const flip = corners[0][2] + corners[2][2] < corners[1][2] + corners[3][2];
            const t = flip ? [1, 2, 3, 1, 3, 0] : [0, 1, 2, 0, 2, 3];
            if (s) I.push(base + t[0], base + t[1], base + t[2], base + t[3], base + t[4], base + t[5]);
            else I.push(base + t[0], base + t[2], base + t[1], base + t[3], base + t[5], base + t[4]);
            quads++; u += w2;
          }
        }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geo.setAttribute('aBone', new THREE.Uint8BufferAttribute(Uint8Array.from(B), 1));
  geo.setAttribute('aEmis', new THREE.Float32BufferAttribute(E, 1));
  geo.setAttribute('aLat', new THREE.Float32BufferAttribute(LT, 3));
  geo.setIndex(P.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(I, 1) : new THREE.Uint16BufferAttribute(I, 1));
  geo.computeBoundingBox();
  geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());
  geo.boundingSphere.radius *= o.sphereK || 1.6; // parts swing out of the bind pose
  geo.userData = { tris: I.length / 3, quads, vox: model.vox, size };
  return geo;
}

// bone matrices of a CPU rig (Lanternfall Figure: p' = R p + O, R row-major 3x3) -> 3 vec4 rows per bone
export function packFigureBones(R, O, nb, out) {
  for (let b = 0; b < nb; b++) {
    const r = b * 9, o = b * 3, k = b * 12;
    out[k] = R[r]; out[k + 1] = R[r + 1]; out[k + 2] = R[r + 2]; out[k + 3] = O[o];
    out[k + 4] = R[r + 3]; out[k + 5] = R[r + 4]; out[k + 6] = R[r + 5]; out[k + 7] = O[o + 1];
    out[k + 8] = R[r + 6]; out[k + 9] = R[r + 7]; out[k + 10] = R[r + 8]; out[k + 11] = O[o + 2];
  }
  return out;
}
// a THREE.Matrix4 (column-major elements) -> the 3 rows for bone b
export function packMatrix(m, b, out) {
  const e = m.elements, k = b * 12;
  out[k] = e[0]; out[k + 1] = e[4]; out[k + 2] = e[8]; out[k + 3] = e[12];
  out[k + 4] = e[1]; out[k + 5] = e[5]; out[k + 6] = e[9]; out[k + 7] = e[13];
  out[k + 8] = e[2]; out[k + 9] = e[6]; out[k + 10] = e[10]; out[k + 11] = e[14];
  return out;
}
