// Voxelizer for Blockade Z's box models (?vox=1): a body part made of textured boxes becomes a small voxel grid
// (one voxel per texel on the hero; the inside is filled so a carve shows meat or the part's own colour), greedy-meshed
// with baked per-vertex ambient occlusion, and drawn with a Lambert material that adds the voxel-lab look in the
// fragment shader: a bevel on every voxel edge and a slight colour jitter per voxel. Also owns the shared debris pool
// (instanced cubes that fly, bounce, settle and fade) used by the zombie, street and fx modules.
// The look follows games/voxel-lab (our clean-room build; techniques studied from Voxel Engine by mattshumer, spawn.co).
const BZ = window.BZ; const THREE = window.THREE; const V = BZ.vox;

// ---------- colour helpers (grids keep sRGB bytes; vertex colours are linear) ----------
const S2L = new Float32Array(256); for (let i = 0; i < 256; i++) { const c = i / 255; S2L[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const l2s = (v) => { v = v < 0 ? 0 : v > 1 ? 1 : v; return Math.round((v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255); };
const hash3 = (x, y, z, s = 0) => { let h = (Math.imul(x | 0, 0x1f1f1f1f) ^ Math.imul(y | 0, 0x3c6ef372) ^ Math.imul(z | 0, 0x2545f491) ^ Math.imul(s | 0, 0x9e3779b1)) | 0; h = Math.imul(h ^ (h >>> 16), 0x7feb352d); h = Math.imul(h ^ (h >>> 15), 0x846ca68b); return (h ^ (h >>> 16)) >>> 0; };
V.hash3 = hash3;

// ---------- texture pixels ----------
const pixCache = new Map();
// key: a texture key of BZ.tex, or a THREE.Texture (any canvas or image texture)
function texPixels(key) {
  const id = typeof key === 'string' ? key : key.uuid;
  let p = pixCache.get(id);
  if (!p) {
    const img = typeof key === 'string' ? BZ.tex(key).image : key.image; let cv = img;
    if (!cv || !cv.getContext) { cv = document.createElement('canvas'); cv.width = (img && img.width) || 1; cv.height = (img && img.height) || 1; if (img) cv.getContext('2d').drawImage(img, 0, 0); }
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height); p = { w: cv.width, h: cv.height, d: d.data }; pixCache.set(id, p);
  }
  return p;
}
const texIndex = (p, u, v) => { u -= Math.floor(u); v -= Math.floor(v); const x = Math.min(p.w - 1, Math.floor(u * p.w)); const y = Math.min(p.h - 1, Math.floor((1 - v) * p.h - 1e-6)); return (Math.max(0, y) * p.w + x) * 4; };
// texel at (u, v) with v = 0 at the bottom (the textures are flipped on upload), scaled by k in linear light -> packed sRGB
function sample(key, u, v, k) {
  const p = texPixels(key); const i = texIndex(p, u, v);
  if (k === 1) return (p.d[i] << 16) | (p.d[i + 1] << 8) | p.d[i + 2];
  return (l2s(S2L[p.d[i]] * k) << 16) | (l2s(S2L[p.d[i + 1]] * k) << 8) | l2s(S2L[p.d[i + 2]] * k);
}
const sampleA = (key, u, v) => { const p = texPixels(key); return p.d[texIndex(p, u, v) + 3]; };
V.sample = sample;
// multiply two packed sRGB colours in linear light
const mulCol = (a, b) => (l2s(S2L[(a >> 16) & 255] * S2L[(b >> 16) & 255]) << 16) | (l2s(S2L[(a >> 8) & 255] * S2L[(b >> 8) & 255]) << 8) | l2s(S2L[a & 255] * S2L[b & 255]);
const scaleCol = (a, k) => (k === 1 ? a : (l2s(S2L[(a >> 16) & 255] * k) << 16) | (l2s(S2L[(a >> 8) & 255] * k) << 8) | l2s(S2L[a & 255] * k));
V.mulCol = mulCol;
// average colour of a texture (used for interiors and for the street block's palette)
const avgCache = new Map();
V.texAvg = (key) => { let a = avgCache.get(key); if (a === undefined) { const p = texPixels(key); let r = 0; let g = 0; let b = 0; let n = 0; for (let i = 0; i < p.d.length; i += 4) { if (p.d[i + 3] < 128) continue; r += S2L[p.d[i]]; g += S2L[p.d[i + 1]]; b += S2L[p.d[i + 2]]; n++; } n = n || 1; a = (l2s(r / n) << 16) | (l2s(g / n) << 8) | l2s(b / n); avgCache.set(key, a); } return a; };

// ---------- box list -> voxel grid ----------
// A box: { a, b, k (brightness), tex(face) -> texture key, uv: 'fit' | 'dens', rect, emis(key, px, py) }.
// face names follow BZ.Builder: px nx py ny pz nz. Later boxes paint over earlier ones.
const SOLID = 1 << 24; const EMIS = 1 << 25; const INNER = 1 << 26;
const FLESH = [0xa82a22, 0x7a1410, 0x8c1c16, 0xc04a42]; const BONE = 0xeadfc8;
// Optional on a box: m (a THREE.Matrix4 from the box's own frame into the part's: a tilted grip, a rotated plate), col (a packed
// sRGB colour, alone or multiplying the texture), alpha (skip texels with alpha < 128: a wing), emis (key, u, v, face) or glow (all lit),
// uv 'world' with ws (Builder's world mapping), convex (a list of planes [nx, ny, nz, d] instead of a box: a gem, a dome).
// Interiors: opt.interior 'flesh' (meat and bone) or anything else (the box's own colour, darker).
const FN = ['pz', 'py', 'px', 'nx', 'nz', 'ny'];
function boxColour(B, F, a, b, cx, cy, cz, k) {
  const dx = Math.max(1e-6, b[0] - a[0]); const dy = Math.max(1e-6, b[1] - a[1]); const dz = Math.max(1e-6, b[2] - a[2]);
  const fit = B.uv === undefined || B.uv === 'fit'; const rc = B.rect; let u; let v;
  if (B.uv === 'world') { const s = B.ws || 1; u = (F === 'px' ? -cz : F === 'nx' ? cz : F === 'nz' ? -cx : cx) * s; v = (F === 'py' ? -cz : F === 'ny' ? cz : cy) * s; }
  else {
    if (F === 'px') { u = b[2] - cz; v = cy - a[1]; if (fit) { u /= dz; v /= dy; } }
    else if (F === 'nx') { u = cz - a[2]; v = cy - a[1]; if (fit) { u /= dz; v /= dy; } }
    else if (F === 'py') { u = cx - a[0]; v = b[2] - cz; if (fit) { u /= dx; v /= dz; } }
    else if (F === 'ny') { u = cx - a[0]; v = cz - a[2]; if (fit) { u /= dx; v /= dz; } }
    else if (F === 'pz') { u = cx - a[0]; v = cy - a[1]; if (fit) { u /= dx; v /= dy; } }
    else { u = b[0] - cx; v = cy - a[1]; if (fit) { u /= dx; v /= dy; } }
    if (!fit) { u /= 0.5; v /= 0.5; } else { u = Math.min(0.9999, Math.max(0, u)); v = Math.min(0.9999, Math.max(0, v)); if (rc && F !== 'py' && F !== 'ny') { u = rc[0] + u * (rc[2] - rc[0]); v = rc[1] + v * (rc[3] - rc[1]); } }
  }
  // B.face(F) -> { tex, col, glow } when the faces differ (a BoxGeometry with one material per face)
  const fc = B.face ? B.face(F) : null; const key = fc ? fc.tex : B.tex ? B.tex(F) : null; const col = fc ? fc.col : B.col; let c;
  if (key) { if (B.alpha && sampleA(key, u, v) < 128) return -1; c = sample(key, u, v, k); if (col !== undefined) c = mulCol(c, col); }
  else c = scaleCol(col === undefined ? 0xffffff : col, k);
  c |= SOLID; if ((fc ? fc.glow : B.glow) || (B.emis && B.emis(key, u, v, F))) c |= EMIS;
  return c;
}
function interiorColour(B, opt, i, j, kk, midx, midz, k) {
  if (opt.interior === 'flesh') { const h = hash3(i, j, kk, 7); return Math.abs(i + 0.5 - midx) < 1.1 && Math.abs(kk + 0.5 - midz) < 1.1 ? BONE : FLESH[h & 3]; }
  const fc = B.face ? B.face('px') : null; const key = fc ? fc.tex : B.tex ? B.tex('px') : null; const col = fc ? fc.col : B.col;
  let c = key ? sample(key, 0.5, 0.5, k * 0.7) : scaleCol(col === undefined ? 0xffffff : col, k * 0.7);
  if (key && col !== undefined) c = mulCol(c, col);
  return c;
}
const _v = { x: 0, y: 0, z: 0 };
function rasterize(boxes, vs, opt = {}) {
  let x0 = 1e9; let y0 = 1e9; let z0 = 1e9; let x1 = -1e9; let y1 = -1e9; let z1 = -1e9; const R = [];
  for (const B of boxes) {
    const lo = [0, 0, 0]; const hi = [0, 0, 0];
    if (B.m || B.convex) {
      // a tilted box (or a convex shape): its bounds in the part's frame, thin sides grown to one voxel so nothing vanishes
      if (B.m && !B.inv) { B.inv = B.m.clone().invert(); B.h = [0, 1, 2].map((q) => Math.max((B.b[q] - B.a[q]) / 2, vs * 0.55)); B.c = [0, 1, 2].map((q) => (B.a[q] + B.b[q]) / 2); }
      const mn = [1e9, 1e9, 1e9]; const mx = [-1e9, -1e9, -1e9]; const e = B.m ? B.m.elements : null;
      for (let q = 0; q < 8; q++) {
        let px = B.convex ? (q & 1 ? B.b[0] : B.a[0]) : B.c[0] + (q & 1 ? B.h[0] : -B.h[0]); let py = B.convex ? (q & 2 ? B.b[1] : B.a[1]) : B.c[1] + (q & 2 ? B.h[1] : -B.h[1]); let pz = B.convex ? (q & 4 ? B.b[2] : B.a[2]) : B.c[2] + (q & 4 ? B.h[2] : -B.h[2]);
        if (e) { const X = e[0] * px + e[4] * py + e[8] * pz + e[12]; const Y = e[1] * px + e[5] * py + e[9] * pz + e[13]; const Z = e[2] * px + e[6] * py + e[10] * pz + e[14]; px = X; py = Y; pz = Z; }
        mn[0] = Math.min(mn[0], px); mn[1] = Math.min(mn[1], py); mn[2] = Math.min(mn[2], pz); mx[0] = Math.max(mx[0], px); mx[1] = Math.max(mx[1], py); mx[2] = Math.max(mx[2], pz);
      }
      for (let k = 0; k < 3; k++) { lo[k] = Math.floor(mn[k] / vs); hi[k] = Math.max(lo[k] + 1, Math.ceil(mx[k] / vs)); }
    } else for (let k = 0; k < 3; k++) { lo[k] = Math.round(B.a[k] / vs); hi[k] = Math.max(lo[k] + 1, Math.round(B.b[k] / vs)); }
    R.push([lo, hi]);
    x0 = Math.min(x0, lo[0]); y0 = Math.min(y0, lo[1]); z0 = Math.min(z0, lo[2]); x1 = Math.max(x1, hi[0]); y1 = Math.max(y1, hi[1]); z1 = Math.max(z1, hi[2]);
  }
  if (!boxes.length) { x0 = y0 = z0 = 0; x1 = y1 = z1 = 1; }
  const nx = x1 - x0; const ny = y1 - y0; const nz = z1 - z0; const data = new Uint32Array(nx * ny * nz);
  boxes.forEach((B, bi) => {
    const [lo, hi] = R[bi]; const k = B.k === undefined ? 1 : B.k; const a = B.a; const b = B.b;
    if (B.m || B.convex) {
      const ie = B.m ? B.inv.elements : null; const midx = (lo[0] + hi[0]) / 2; const midz = (lo[2] + hi[2]) / 2;
      const thin = B.convex ? Math.min(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / vs : Math.min(B.h[0], B.h[1], B.h[2]) * 2 / vs;
      for (let j = lo[1]; j < hi[1]; j++) for (let kk = lo[2]; kk < hi[2]; kk++) for (let i = lo[0]; i < hi[0]; i++) {
        let px = (i + 0.5) * vs; let py = (j + 0.5) * vs; let pz = (kk + 0.5) * vs; let dmin; let F;
        if (B.convex) {
          let worst = -1e9; let fi = 0; for (let q = 0; q < B.convex.length; q++) { const P = B.convex[q]; const s = P[0] * px + P[1] * py + P[2] * pz - P[3]; if (s > worst) { worst = s; fi = q; } }
          if (worst > 0) continue; dmin = -worst / vs - 0.5; const n = B.convex[fi]; const an = [Math.abs(n[0]), Math.abs(n[1]), Math.abs(n[2])];
          F = an[0] >= an[1] && an[0] >= an[2] ? (n[0] > 0 ? 'px' : 'nx') : an[1] >= an[2] ? (n[1] > 0 ? 'py' : 'ny') : (n[2] > 0 ? 'pz' : 'nz');
        } else {
          const X = ie[0] * px + ie[4] * py + ie[8] * pz + ie[12]; const Y = ie[1] * px + ie[5] * py + ie[9] * pz + ie[13]; const Z = ie[2] * px + ie[6] * py + ie[10] * pz + ie[14];
          if (Math.abs(X - B.c[0]) > B.h[0] || Math.abs(Y - B.c[1]) > B.h[1] || Math.abs(Z - B.c[2]) > B.h[2]) continue;
          px = X; py = Y; pz = Z;
          const d = [B.c[2] + B.h[2] - pz, B.c[1] + B.h[1] - py, B.c[0] + B.h[0] - px, px - B.c[0] + B.h[0], pz - B.c[2] + B.h[2], py - B.c[1] + B.h[1]];
          let f = 0; for (let q = 1; q < 6; q++) if (d[q] < d[f]) f = q; dmin = d[f] / vs - 0.5; F = FN[f];
        }
        const o = (i - x0) + nx * ((kk - z0) + nz * (j - y0));
        if (dmin >= 1.5 && thin >= 5) { data[o] = interiorColour(B, opt, i, j, kk, midx, midz, k) | SOLID | INNER; continue; }
        const c = boxColour(B, F, a, b, Math.min(b[0], Math.max(a[0], px)), Math.min(b[1], Math.max(a[1], py)), Math.min(b[2], Math.max(a[2], pz)), k);
        if (c >= 0) data[o] = c;
      }
      return;
    }
    const midx = (lo[0] + hi[0]) / 2; const midz = (lo[2] + hi[2]) / 2; const thin = Math.min(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
    for (let j = lo[1]; j < hi[1]; j++) for (let kk = lo[2]; kk < hi[2]; kk++) for (let i = lo[0]; i < hi[0]; i++) {
      // nearest face of the box; ties go to the front, then the top, then the sides
      const d = [hi[2] - 1 - kk, hi[1] - 1 - j, hi[0] - 1 - i, i - lo[0], kk - lo[2], j - lo[1]]; // pz py px nx nz ny
      let f = 0; for (let q = 1; q < 6; q++) if (d[q] < d[f]) f = q;
      const o = (i - x0) + nx * ((kk - z0) + nz * (j - y0));
      // inside: meat and bone for a body, the box's own colour (darker) for anything else
      if (d[f] >= 2 && thin >= 5) { data[o] = interiorColour(B, opt, i, j, kk, midx, midz, k) | SOLID | INNER; continue; }
      // the same uv layout as BZ.Builder's faces (and zombies.js multi()), measured from each face's start corner
      const c = boxColour(B, FN[f], a, b, Math.min(b[0], Math.max(a[0], (i + 0.5) * vs)), Math.min(b[1], Math.max(a[1], (j + 0.5) * vs)), Math.min(b[2], Math.max(a[2], (kk + 0.5) * vs)), k);
      if (c >= 0) data[o] = c;
    }
  });
  const g = { nx, ny, nz, vs, ox: x0 * vs, oy: y0 * vs, oz: z0 * vs, data };
  g.count = 0; for (let i = 0; i < data.length; i++) if (data[i]) g.count++;
  return g;
}
V.rasterize = rasterize;
V.cloneGrid = (g) => ({ ...g, data: g.data.slice() });
// merge 2x2x2 voxels into one (the low tier): the colour of the first solid surface voxel wins, any emissive voxel keeps the glow
V.halve = (g) => {
  const nx = Math.ceil(g.nx / 2); const ny = Math.ceil(g.ny / 2); const nz = Math.ceil(g.nz / 2); const data = new Uint32Array(nx * ny * nz);
  for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    let best = 0; let n = 0;
    for (let q = 0; q < 8; q++) { const x = i * 2 + (q & 1); const y = j * 2 + ((q >> 1) & 1); const z = k * 2 + (q >> 2); if (x >= g.nx || y >= g.ny || z >= g.nz) continue; const c = g.data[x + g.nx * (z + g.nz * y)]; if (!c) continue; n++; if (!best || (c & EMIS) || ((best & INNER) && !(c & INNER))) best = (best & EMIS) | c; }
    if (n >= 3 || (n && (nx < 4 || nz < 4))) data[i + nx * (k + nz * j)] = best;
  }
  const o = { nx, ny, nz, vs: g.vs * 2, ox: g.ox, oy: g.oy, oz: g.oz, data }; o.count = 0; for (let i = 0; i < data.length; i++) if (data[i]) o.count++; return o;
};

// ---------- greedy mesher with vertex AO ----------
const AOK = [0.5, 0.68, 0.84, 1];
const AX = [[1, 2, 0], [2, 0, 1], [0, 1, 2]]; // per normal axis d: the two in-plane axes (u, v) so that u x v = +d
function meshGrid(g) {
  const { nx, ny, nz, data, vs } = g; const dim = [nx, ny, nz];
  const at = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz ? 0 : data[x + nx * (z + nz * y)]);
  const P = []; const N = []; const C = []; const E = []; const I = [];
  const p = [0, 0, 0]; const q = [0, 0, 0];
  for (let d = 0; d < 3; d++) {
    const [ua, va] = AX[d]; const nu = dim[ua]; const nv = dim[va]; const mc = new Uint32Array(nu * nv); const ma = new Uint8Array(nu * nv);
    for (let s = 0; s < 2; s++) {
      const sg = s ? 1 : -1;
      for (let w = 0; w < dim[d]; w++) {
        let any = false;
        for (let v = 0; v < nv; v++) for (let u = 0; u < nu; u++) {
          p[d] = w; p[ua] = u; p[va] = v; const c = at(p[0], p[1], p[2]); let key = 0; let ao = 0;
          if (c) {
            q[0] = p[0]; q[1] = p[1]; q[2] = p[2]; q[d] += sg;
            if (!at(q[0], q[1], q[2])) {
              key = c & 0x3ffffff; any = true;
              // ambient occlusion at the four corners, from the three cells that touch each corner in the layer in front
              const o = (du, dv) => { const r = [q[0], q[1], q[2]]; r[ua] += du; r[va] += dv; return at(r[0], r[1], r[2]) ? 1 : 0; };
              const cor = (du, dv) => { const s1 = o(du, 0); const s2 = o(0, dv); return s1 && s2 ? 0 : 3 - s1 - s2 - o(du, dv); };
              ao = cor(-1, -1) | (cor(1, -1) << 2) | (cor(1, 1) << 4) | (cor(-1, 1) << 6);
            }
          }
          mc[u + nu * v] = key; ma[u + nu * v] = ao;
        }
        if (!any) continue;
        for (let v = 0; v < nv; v++) for (let u = 0; u < nu;) {
          const key = mc[u + nu * v]; if (!key) { u++; continue; }
          const ao = ma[u + nu * v]; const flat = ao === 255;
          let w2 = 1; let h2 = 1;
          // only fully lit cells merge both ways; a shaded cell merges along a run of the same shading
          while (u + w2 < nu && mc[u + w2 + nu * v] === key && ma[u + w2 + nu * v] === ao && (flat || ((ao & 3) === ((ao >> 2) & 3) && ((ao >> 4) & 3) === ((ao >> 6) & 3)))) w2++;
          if (flat || (w2 === 1 && (ao & 3) === ((ao >> 6) & 3) && ((ao >> 2) & 3) === ((ao >> 4) & 3))) {
            outer: for (; v + h2 < nv; h2++) for (let k = 0; k < w2; k++) if (mc[u + k + nu * (v + h2)] !== key || ma[u + k + nu * (v + h2)] !== ao) break outer;
          }
          for (let b = 0; b < h2; b++) for (let k = 0; k < w2; k++) mc[u + k + nu * (v + b)] = 0;
          const base = P.length / 3; const r = S2L[(key >> 16) & 255]; const gg = S2L[(key >> 8) & 255]; const bb = S2L[key & 255]; const em = key & EMIS ? 1 : 0;
          const corners = [[0, 0, ao & 3], [w2, 0, (ao >> 2) & 3], [w2, h2, (ao >> 4) & 3], [0, h2, (ao >> 6) & 3]];
          for (const [cu, cv, a] of corners) {
            p[d] = w + s; p[ua] = u + cu; p[va] = v + cv;
            P.push(g.ox + p[0] * vs, g.oy + p[1] * vs, g.oz + p[2] * vs);
            N.push(d === 0 ? sg : 0, d === 1 ? sg : 0, d === 2 ? sg : 0);
            const k = em ? 1 : AOK[a]; C.push(r * k, gg * k, bb * k); E.push(em);
          }
          // split along the diagonal that keeps the AO gradient smooth; wind for the face direction
          const flip = corners[0][2] + corners[2][2] < corners[1][2] + corners[3][2];
          const t = flip ? [1, 2, 3, 1, 3, 0] : [0, 1, 2, 0, 2, 3];
          if (s) I.push(base + t[0], base + t[1], base + t[2], base + t[3], base + t[4], base + t[5]);
          else I.push(base + t[0], base + t[2], base + t[1], base + t[3], base + t[5], base + t[4]);
          u += w2;
        }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); geo.setAttribute('emis', new THREE.Float32BufferAttribute(E, 1));
  geo.setIndex(P.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(I, 1) : new THREE.Uint16BufferAttribute(I, 1));
  // fixed bounds from the grid, so a carved copy never needs them recomputed and culling stays stable
  geo.boundingBox = new THREE.Box3(new THREE.Vector3(g.ox, g.oy, g.oz), new THREE.Vector3(g.ox + nx * vs, g.oy + ny * vs, g.oz + nz * vs));
  geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());
  geo.userData.tris = I.length / 3;
  return geo;
}
V.meshGrid = meshGrid;

// ---------- the voxel material ----------
// Lambert (so the game's lights, fog and shadows apply) + per-voxel jitter + a bevel on every voxel edge + glowing voxels.
// `vs` is the voxel size in the mesh's own units. Every instance shares one program.
// opt.cells: the bevel follows a per-face 'vuv' attribute (voxel cells counted along each face) instead of the position, for a mesh
// whose boxes move inside it (the jointed fingers): each box then reads as a row of voxels whatever its pose.
V.material = (vs, opt = {}) => {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.userData.vox = { uVox: { value: vs }, uBevel: { value: opt.bevel === undefined ? 0.11 : opt.bevel }, uJit: { value: opt.jitter === undefined ? 0.16 : opt.jitter }, uGlow: { value: opt.glow === undefined ? 1.5 : opt.glow } };
  const cells = !!opt.cells;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.vox);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float emis; varying vec3 vVoxP; varying vec3 vVoxN; varying float vEmis;' + (cells ? ' attribute vec2 vuv; varying vec2 vVoxUv;' : ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvVoxP = position; vVoxN = normal; vEmis = emis;' + (cells ? ' vVoxUv = vuv;' : ''));
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uVox; uniform float uBevel; uniform float uJit; uniform float uGlow; varying vec3 vVoxP; varying vec3 vVoxN; varying float vEmis;' + (cells ? ' varying vec2 vVoxUv;' : ''))
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 vp = vVoxP / uVox; vec3 an = abs(vVoxN);
          ${cells ? 'vec3 cell = vec3(floor(vVoxUv), dot(vVoxN, vec3(1.0, 2.0, 3.0))); vec2 f = fract(vVoxUv); float fw = fwidth(vVoxUv.x) + fwidth(vVoxUv.y);'
    : 'vec3 cell = floor(vp - vVoxN * 0.5); vec2 f = an.x > 0.5 ? fract(vp.zy) : an.y > 0.5 ? fract(vp.xz) : fract(vp.xy); float fw = fwidth(vp.x) + fwidth(vp.y) + fwidth(vp.z);'}
          float hj = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          // fw: voxels per pixel; the detail fades out when a voxel is under ~2 px
          float near = clamp(1.0 - fw * 1.6, 0.0, 1.0);
          float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
          float rim = (1.0 - smoothstep(0.0, uBevel + fw * 0.5, e)) * near;
          float top = an.y > 0.5 ? 0.0 : smoothstep(1.0 - uBevel * 1.6, 1.0, f.y) * near;   // the upper edge of a side face catches light
          diffuseColor.rgb *= (1.0 + (hj - 0.5) * uJit * near) * (1.0 - 0.3 * rim * (1.0 - vEmis)) * (1.0 + 0.2 * top);
        }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vEmis * uGlow;');
  };
  m.customProgramCacheKey = () => (cells ? 'bzvox1c' : 'bzvox1');
  // a clone (a severed limb's frozen material, a weapon's own copy) keeps the voxel shader: Material.copy drops onBeforeCompile
  m.clone = () => {
    const c = V.material(m.userData.vox.uVox.value, opt); const keep = c.userData;
    THREE.Material.prototype.copy.call(c, m); c.color.copy(m.color); c.emissive.copy(m.emissive); c.vertexColors = true; c.fog = m.fog; c.userData = keep; return c;
  };
  return m;
};

// ---------- carve a sphere out of a part grid (voxel coordinates); returns what came off ----------
V.carve = (g, cx, cy, cz, r, seed = 0, max = 400) => {
  const out = []; const { nx, ny, nz, data } = g; const R = r + 1.2;
  for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(ny - 1, Math.ceil(cy + R)); y++) for (let z = Math.max(0, Math.floor(cz - R)); z <= Math.min(nz - 1, Math.ceil(cz + R)); z++) for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(nx - 1, Math.ceil(cx + R)); x++) {
    const o = x + nx * (z + nz * y); const c = data[o]; if (!c) continue;
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy, z + 0.5 - cz);
    // a ragged rim: the shell goes or stays by a hash of the voxel (so the same hit always leaves the same hole)
    if (d > r * 0.75 && d > r + ((hash3(x, y, z, seed) & 255) / 255 - 0.55) * 1.6) continue;
    data[o] = 0; g.count--; if (out.length < max) out.push(x, y, z, c & 0xffffff);
  }
  // what the hole exposes shows the inside colour
  return out;
};
// first solid voxel along a ray given in grid voxel coordinates; returns [x, y, z, t] or null
V.rayGrid = (g, ox, oy, oz, dx, dy, dz, maxT = 400) => {
  const { nx, ny, nz, data } = g;
  // clip to the grid box
  let t0 = 0; let t1 = maxT;
  for (const [o, d, n] of [[ox, dx, nx], [oy, dy, ny], [oz, dz, nz]]) { if (Math.abs(d) < 1e-9) { if (o < 0 || o >= n) return null; continue; } let a = -o / d; let b = (n - o) / d; if (a > b) { const t = a; a = b; b = t; } t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return null; }
  let t = t0 + 1e-4; let x = Math.floor(ox + dx * t); let y = Math.floor(oy + dy * t); let z = Math.floor(oz + dz * t);
  const sx = dx > 0 ? 1 : -1; const sy = dy > 0 ? 1 : -1; const sz = dz > 0 ? 1 : -1;
  const tdx = Math.abs(1 / (dx || 1e-9)); const tdy = Math.abs(1 / (dy || 1e-9)); const tdz = Math.abs(1 / (dz || 1e-9));
  let tx = ((dx > 0 ? x + 1 : x) - ox) / (dx || 1e-9); let ty = ((dy > 0 ? y + 1 : y) - oy) / (dy || 1e-9); let tz = ((dz > 0 ? z + 1 : z) - oz) / (dz || 1e-9);
  for (let i = 0; i < 600 && t <= t1 + 1e-3; i++) {
    if (x >= 0 && y >= 0 && z >= 0 && x < nx && y < ny && z < nz && data[x + nx * (z + nz * y)]) return [x, y, z, t];
    if (tx < ty && tx < tz) { t = tx; tx += tdx; x += sx; } else if (ty < tz) { t = ty; ty += tdy; y += sy; } else { t = tz; tz += tdz; z += sz; }
  }
  return null;
};

// ---------- hero parts ----------
const HERO_VS = 1 / 32;                 // the hero's face is 16 texels across a 0.5 m head: one texel = one voxel
const GLOW = new Set(['c_60e8ff', 'c_c080ff', 'c_ffa020', 'c_9ad8ff', 'c_9aff40', 'c_ff8a20', 'c_ffb040']); // the cells heroes.js lights up
let heroMat = null;
const texOf = (mats) => (typeof mats === 'string' ? () => mats : (f) => mats[f] || (f === 'py' ? mats.top : f === 'ny' ? mats.bottom || mats.side : mats.side) || mats.all);
V.heroPart = (id, name, boxes) => {
  const desc = ([a, b, m, o]) => ({ a, b, k: typeof o === 'number' ? o : o && o.k ? o.k : 1, rect: o && o.rect, tex: texOf(m), uv: 'fit', emis: (key) => GLOW.has(key) });
  // a thin strip trailing behind the head (a bandana tail, a headband's ends) becomes its own piece on a pivot, so a spring can let it trail and flutter
  const isTail = ([a, b]) => name === 'head' && b[2] <= -0.255 && a[2] < -0.4 && b[0] - a[0] < 0.16 && b[1] - a[1] < 0.16;
  const grid = rasterize(boxes.filter((q) => !isTail(q)).map(desc), HERO_VS, { interior: 'own' });
  if (!heroMat) heroMat = V.material(HERO_VS);
  const mesh = new THREE.Mesh(meshGrid(grid), heroMat); mesh.castShadow = true; mesh.name = 'vox-' + name; mesh.userData.voxGrid = grid;
  for (const q of boxes.filter(isTail)) {
    const snap = (v) => Math.round(v / HERO_VS) * HERO_VS; const px = snap((q[0][0] + q[1][0]) / 2); const py = snap((q[0][1] + q[1][1]) / 2); const pz = snap(q[1][2]);
    const g2 = rasterize([desc([[q[0][0] - px, q[0][1] - py, q[0][2] - pz], [q[1][0] - px, q[1][1] - py, q[1][2] - pz], q[2], q[3]])], HERO_VS, { interior: 'own' });
    const pivot = new THREE.Group(); pivot.position.set(px, py, pz); pivot.rotation.x = -0.3; pivot.name = 'vox-tail';
    const tail = new THREE.Mesh(meshGrid(g2), heroMat); tail.castShadow = true; pivot.add(tail); mesh.add(pivot);
    if (V.spring) V.spring(pivot, { stiffness: 38, damping: 4.5, drag: 0.09, sideDrag: 0.07, accel: 0.006, turn: 0.035, max: 1.0, wind: 0.05 });
  }
  // a part that hangs inside another (shin in boot, forearm in sleeve) is a hair thinner or wider, so their faces never share a plane
  const fit = { shin: 0.94, fore: 0.94, boot: 1.05, upper: 0.985 }[name]; if (fit) mesh.scale.set(fit, 1, fit);
  V.stats.heroTris += mesh.geometry.userData.tris; V.stats.heroVox += grid.count;
  return mesh;
};
V.stats = { heroTris: 0, heroVox: 0, meshes: 0, built: 0, skipped: 0 };

// ---------- any other box model: a BZ.Builder group (weapons, arms), or a plain mesh (boss rigs, zombie extras) ----------
// A Builder given `rec = []` records every box it lays down (with the transform it was pushed under), so its output can be
// voxelized from the exact same list: same boxes, same textures, same uv layout.
{
  const Bp = BZ.Builder && BZ.Builder.prototype;
  if (Bp && !Bp.__voxRec) {
    Bp.__voxRec = 1; const box0 = Bp.box; const build0 = Bp.build;
    Bp.box = function (min, max, mats, opt = {}) { if (this.rec) this.rec.push({ min: min.slice(), max: max.slice(), mats, opt, m: this.stack.length ? this.m.clone() : null }); return box0.call(this, min, max, mats, opt); };
    Bp.build = function (opts) { const g = build0.call(this, opts); if (this.rec) g.userData.voxRec = this.rec.slice(); return g; };
  }
}
// a recorded Builder group -> one voxel mesh in its place (the group itself stays, so whoever holds it keeps working)
V.voxBuilt = (group, vs, o = {}) => {
  const rec = group.userData.voxRec; if (!rec || !rec.length) return null;
  const glow = new Set(); let cast = false;
  for (const ch of group.children) if (ch.isMesh) { if (ch.material.emissive && ch.material.emissive.getHex()) glow.add(ch.name); if (ch.castShadow) cast = true; }
  const boxes = rec.map(({ min, max, mats, opt, m }) => ({ a: min, b: max, k: opt.tint ? opt.tint[0] : 1, rect: opt.rect, tex: texOf(mats), uv: opt.uv || 'world', ws: opt.uvScale || 1, m, emis: (key) => glow.has(key) }));
  const grid = rasterize(boxes, vs, { interior: 'own' });
  const mesh = new THREE.Mesh(meshGrid(grid), o.material || V.material(vs)); mesh.name = 'vox'; mesh.castShadow = cast; mesh.userData.voxGrid = grid; mesh.userData.noVox = true;
  for (const ch of group.children.slice()) if (ch.isMesh) group.remove(ch);
  group.add(mesh); V.stats.built++;
  return mesh;
};
// a plain mesh -> the boxes it is made of, or null when it is not a closed solid we can fill (a plane, a ring, a see-through shell)
const CONVEX = new Set(['OctahedronGeometry', 'IcosahedronGeometry', 'DodecahedronGeometry', 'TetrahedronGeometry', 'BoxGeometry', 'CylinderGeometry', 'ConeGeometry', 'SphereGeometry', 'CapsuleGeometry']);
const glowOf = (m) => !!m && (m.isMeshBasicMaterial || (m.emissive && m.emissive.r + m.emissive.g + m.emissive.b > 0.6));
const colOf = (m) => (m && m.color ? m.color.getHex() : 0xffffff);
const _m4 = new THREE.Matrix4(); const _e = new THREE.Euler();
function meshBoxes(mesh) {
  const g = mesh.geometry; const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  if (!g || !g.attributes || !g.attributes.position || mesh.isSprite || mesh.isPoints || mesh.isLine) return null;
  for (const m of mats) if (!m || (m.transparent && !(m.alphaTest > 0)) || m.blending === THREE.AdditiveBlending || m.wireframe) return null;
  const vc = (m, i) => { const ca = g.attributes.color; if (!ca || !m.vertexColors || i >= ca.count) return 0xffffff; return (l2s(ca.getX(i)) << 16) | (l2s(ca.getY(i)) << 8) | l2s(ca.getZ(i)); };
  let key = g.uuid; for (const m of mats) key += '|' + (m.map ? m.map.uuid : '-') + colOf(m).toString(16) + (glowOf(m) ? 'g' : '') + (m.alphaTest > 0 ? 'a' : '');
  const texM = (m) => (m.map && !m.isMeshBasicMaterial ? m.map : m.map && m.isMeshBasicMaterial ? m.map : null);
  const boxes = [];
  if (g.userData.garb) {
    // BZ.boxGeo's merged boxes: [x0, y0, z0, x1, y1, z1, colour, rotation about the box's centre]
    const m0 = mats[0]; const t = texM(m0); const gl = glowOf(m0);
    for (const [x0, y0, z0, x1, y1, z1, c, rot] of g.userData.garb) {
      const B = { a: [x0, y0, z0], b: [x1, y1, z1], col: mulCol(c, colOf(m0)), tex: t ? () => t : null, uv: 'fit', glow: gl };
      if (rot && (rot[0] || rot[1] || rot[2])) { const cx = (x0 + x1) / 2; const cy = (y0 + y1) / 2; const cz = (z0 + z1) / 2; B.m = new THREE.Matrix4().makeTranslation(cx, cy, cz).multiply(_m4.makeRotationFromEuler(_e.set(rot[0], rot[1], rot[2]))).multiply(new THREE.Matrix4().makeTranslation(-cx, -cy, -cz)); }
      boxes.push(B);
    }
    return { key, boxes };
  }
  if (!CONVEX.has(g.type)) return null;
  const P = g.parameters || {};
  if ((g.type === 'CylinderGeometry' || g.type === 'ConeGeometry') && P.openEnded) return null;
  if (g.type === 'SphereGeometry' && ((P.phiLength !== undefined && P.phiLength < 6.28) || (P.thetaLength !== undefined && P.thetaLength < 3.14))) return null;
  if (!g.boundingBox) g.computeBoundingBox(); const bb = g.boundingBox;
  const a = [bb.min.x, bb.min.y, bb.min.z]; const b = [bb.max.x, bb.max.y, bb.max.z];
  if (g.type === 'BoxGeometry' && Math.abs(b[0] - a[0] - P.width) < 1e-4 && Math.abs(b[1] - a[1] - P.height) < 1e-4 && Math.abs(b[2] - a[2] - P.depth) < 1e-4) {
    // an axis-aligned box: per face its material (geometry groups), texture and vertex colour, same uv layout as three's BoxGeometry
    const FI = { px: 0, nx: 1, py: 2, ny: 3, pz: 4, nz: 5 }; const faces = {}; const ws = P.widthSegments || 1; const hs = P.heightSegments || 1; const ds = P.depthSegments || 1;
    const per = [hs * ds, hs * ds, ws * ds, ws * ds, ws * hs, ws * hs]; let idx = 0; let vtx = 0; const st = [];
    for (let f = 0; f < 6; f++) { st.push([idx, vtx]); idx += per[f] * 6; vtx += (f < 2 ? (ds + 1) * (hs + 1) : f < 4 ? (ws + 1) * (ds + 1) : (ws + 1) * (hs + 1)); }
    for (const F in FI) {
      const [i0, v0] = st[FI[F]]; let m = mats[0];
      if (mats.length > 1) { const gr = g.groups.find((q) => i0 >= q.start && i0 < q.start + q.count); m = mats[gr ? gr.materialIndex : 0] || mats[0]; }
      faces[F] = { tex: texM(m), col: mulCol(colOf(m), vc(m, v0)), glow: glowOf(m) };
    }
    boxes.push({ a, b, uv: 'fit', face: (F) => faces[F], alpha: mats.some((m) => m.alphaTest > 0) });
    return { key, boxes };
  }
  // any other closed convex solid (a gem, a disc, a ball): the planes of its triangles bound it; one flat colour
  const pos = g.attributes.position; const ix = g.index; const n = ix ? ix.count : pos.count; const planes = [];
  const A = new THREE.Vector3(); const Bv = new THREE.Vector3(); const C = new THREE.Vector3(); const N = new THREE.Vector3(); const E = new THREE.Vector3();
  for (let t = 0; t + 2 < n; t += 3) {
    const i0 = ix ? ix.getX(t) : t; const i1 = ix ? ix.getX(t + 1) : t + 1; const i2 = ix ? ix.getX(t + 2) : t + 2;
    A.fromBufferAttribute(pos, i0); Bv.fromBufferAttribute(pos, i1); C.fromBufferAttribute(pos, i2);
    N.subVectors(Bv, A).cross(E.subVectors(C, A)); if (N.lengthSq() < 1e-14) continue; N.normalize(); const d = N.dot(A);
    if (!planes.some((q) => Math.abs(q[0] - N.x) < 1e-3 && Math.abs(q[1] - N.y) < 1e-3 && Math.abs(q[2] - N.z) < 1e-3 && Math.abs(q[3] - d) < 1e-4)) planes.push([N.x, N.y, N.z, d]);
  }
  if (planes.length < 4) return null;
  const m0 = mats[0]; let col = mulCol(colOf(m0), vc(m0, 0)); if (m0.map) col = mulCol(col, V.texAvg ? texAvgOf(m0.map) : 0xffffff);
  boxes.push({ a, b, convex: planes, col, glow: glowOf(m0) });
  return { key, boxes };
}
const texAvgOf = (t) => { const p = texPixels(t); let r = 0; let g = 0; let b = 0; let n = 0; for (let i = 0; i < p.d.length; i += 4) { if (p.d[i + 3] < 128) continue; r += S2L[p.d[i]]; g += S2L[p.d[i + 1]]; b += S2L[p.d[i + 2]]; n++; } n = n || 1; return (l2s(r / n) << 16) | (l2s(g / n) << 8) | l2s(b / n); };
// the shared voxel grid + geometry of a mesh (keyed by its geometry, textures and colours): null if it cannot be voxelized
const meshCache = new Map();
V.voxShared = (mesh, vs, opt = {}) => {
  const src = mesh.userData.vox0 ? { geometry: mesh.userData.vox0.g, material: mesh.userData.vox0.m, isMesh: true } : mesh;
  const mb = meshBoxes(src); if (!mb) { V.stats.skipped++; return null; }
  const id = mb.key + '|' + vs + '|' + (opt.interior || 'own');
  let s = meshCache.get(id);
  if (!s) { const grid = rasterize(mb.boxes, vs, { interior: opt.interior || 'own' }); if (!grid.count) return null; s = { grid, geo: meshGrid(grid), id }; meshCache.set(id, s); V.stats.meshes++; }
  return s;
};
V.meshCacheSize = () => meshCache.size;
// every mesh under root that can be voxelized becomes voxels (static: no carving); one material per voxel size for the tree
V.voxTree = (root, vs, o = {}) => {
  const mats = {}; let n = 0;
  root.traverse((m) => {
    if (!m.isMesh || m.userData.voxS || m.userData.noVox || (o.skip && o.skip(m))) return;
    let s = 1; for (let p = m; p && p !== root; p = p.parent) { const k = Math.max(Math.abs(p.scale.x), Math.abs(p.scale.y), Math.abs(p.scale.z)); if (k > 1e-3) s *= k; }
    const v = vs / Math.min(4, Math.max(0.25, Math.round(s * 8) / 8)); const sh = V.voxShared(m, v, o); if (!sh) return;
    if (!m.userData.vox0) m.userData.vox0 = { g: m.geometry, m: m.material };
    m.geometry = sh.geo; m.material = mats[v] || (mats[v] = V.material(v)); if (o.fog === false) m.material.fog = false; m.userData.voxS = sh; n++;
  });
  return n;
};
// a hand of BZ.makeHand as voxels: every finger joint is a whole number of voxels and draws with the voxel bevel counted along
// its own faces, so the jointed fingers keep their per-frame pose and still read as stacks of voxels
V.handLook = (geo, segs, vs, colHex) => {
  const n = segs.length; const vuv = new Float32Array(n * 48); const col = geo.attributes.color; const r = S2L[(colHex >> 16) & 255]; const g = S2L[(colHex >> 8) & 255]; const b = S2L[colHex & 255];
  for (let i = 0; i < n; i++) {
    const S = segs[i]; const T = S.th / vs; const D = S.len / vs; const W = S.wd / vs;
    // per face (the order of makeHand's put()): the two box sides it spans, in voxels
    const span = [[W, D], [W, D], [T, W], [T, W], [T, D], [T, D]];
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const q = i * 24 + f * 4 + v; vuv[q * 2] = (v === 1 || v === 2 ? 1 : 0) * span[f][0]; vuv[q * 2 + 1] = (v > 1 ? 1 : 0) * span[f][1]; }
  }
  for (let i = 0; i < col.count; i++) col.setXYZ(i, col.getX(i) * r, col.getY(i) * g, col.getZ(i) * b);
  geo.setAttribute('vuv', new THREE.BufferAttribute(vuv, 2)); geo.setAttribute('emis', new THREE.BufferAttribute(new Float32Array(col.count), 1));
  return V.material(vs, { cells: true });
};

// ---------- debris pool: instanced cubes ----------
V.register('pool', (G) => {
  const CAP = G.vox.low ? 700 : G.vox.q === 'high' ? 3600 : 2200;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), CAP);
  mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false; mesh.count = 0; mesh.name = 'vox-debris';
  mesh.setColorAt(0, new THREE.Color(1, 1, 1)); mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); G.scene.add(mesh);
  const px = new Float32Array(CAP); const py = new Float32Array(CAP); const pz = new Float32Array(CAP); const vx = new Float32Array(CAP); const vy = new Float32Array(CAP); const vz = new Float32Array(CAP);
  const size = new Float32Array(CAP); const life = new Float32Array(CAP); const ang = new Float32Array(CAP); const spin = new Float32Array(CAP); const rest = new Uint8Array(CAP); const fl = new Float32Array(CAP);
  let n = 0; let ring = 0; const col = new THREE.Color(); const M = new THREE.Matrix4(); const Q = new THREE.Quaternion(); const AXIS = new THREE.Vector3(); const S = new THREE.Vector3(); const Pv = new THREE.Vector3();
  let colDirty = false;
  function spawn(x, y, z, ux, uy, uz, s, hex, lf = 3, floor = 0) {
    let i; if (n < CAP) i = n++; else { i = ring; ring = (ring + 1) % CAP; } // full: the oldest slots are reused in a ring
    px[i] = x; py[i] = y; pz[i] = z; vx[i] = ux; vy[i] = uy; vz[i] = uz; size[i] = s; life[i] = lf; ang[i] = (i * 2.399) % 6.283; spin[i] = 4 + (i % 7); rest[i] = 0; fl[i] = floor;
    col.setHex(hex); mesh.setColorAt(i, col); colDirty = true;
    return i;
  }
  const floorAt = (x, z, i) => { const st = G.vox.street; return Math.max(fl[i], st && st.topAt ? st.topAt(x, z, py[i]) : 0); };
  function update(dt) {
    if (!n) { mesh.count = 0; return; }
    dt = Math.min(dt, 0.05);
    for (let i = n - 1; i >= 0; i--) {
      life[i] -= dt;
      if (life[i] <= 0) { // swap the last one in
        const l = --n; if (i !== l) { px[i] = px[l]; py[i] = py[l]; pz[i] = pz[l]; vx[i] = vx[l]; vy[i] = vy[l]; vz[i] = vz[l]; size[i] = size[l]; life[i] = life[l]; ang[i] = ang[l]; spin[i] = spin[l]; rest[i] = rest[l]; fl[i] = fl[l]; mesh.getColorAt(l, col); mesh.setColorAt(i, col); colDirty = true; }
        if (ring >= n) ring = 0; continue;
      }
      if (!rest[i]) {
        vy[i] -= 16 * dt; px[i] += vx[i] * dt; py[i] += vy[i] * dt; pz[i] += vz[i] * dt; ang[i] += spin[i] * dt;
        const f = floorAt(px[i], pz[i], i) + size[i] * 0.5;
        if (py[i] < f) { py[i] = f; if (vy[i] < -1.6) { vy[i] = -vy[i] * 0.32; vx[i] *= 0.6; vz[i] *= 0.6; spin[i] *= 0.5; } else { vy[i] = 0; vx[i] *= 0.5; vz[i] *= 0.5; if (vx[i] * vx[i] + vz[i] * vz[i] < 0.05) { rest[i] = 1; ang[i] = Math.round(ang[i] / 1.5708) * 1.5708; } } }
      }
    }
    for (let i = 0; i < n; i++) {
      const k = life[i] < 0.6 ? life[i] / 0.6 : 1; const s = size[i] * k;
      AXIS.set(((i * 37) % 11) - 5, 7, ((i * 53) % 13) - 6).normalize(); Q.setFromAxisAngle(rest[i] ? AXIS.set(0, 1, 0) : AXIS, ang[i]);
      M.compose(Pv.set(px[i], py[i] - (1 - k) * size[i] * 0.5, pz[i]), Q, S.set(s, s, s)); mesh.setMatrixAt(i, M);
    }
    mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (colDirty && mesh.instanceColor) { mesh.instanceColor.needsUpdate = true; colDirty = false; }
  }
  G.events.on('game:new', () => { n = 0; ring = 0; mesh.count = 0; });
  return { spawn, update, mesh, count: () => n, cap: CAP, reset: () => { n = 0; ring = 0; mesh.count = 0; },
    // pieces still in the air, or lying above the floor they should rest on (for the tests)
    floaters: (minAge = 0) => { const out = []; for (let i = 0; i < n; i++) { const f = floorAt(px[i], pz[i], i) + size[i] * 0.5; if (!rest[i] || py[i] - f > 0.05) out.push([+px[i].toFixed(1), +py[i].toFixed(2), +f.toFixed(2), rest[i]]); } return out; } };
});
