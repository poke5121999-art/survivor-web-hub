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
function texPixels(key) {
  let p = pixCache.get(key);
  if (!p) { const cv = BZ.tex(key).image; const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height); p = { w: cv.width, h: cv.height, d: d.data }; pixCache.set(key, p); }
  return p;
}
// texel at (u, v) with v = 0 at the bottom (the textures are flipped on upload), scaled by k in linear light -> packed sRGB
function sample(key, u, v, k) {
  const p = texPixels(key); u -= Math.floor(u); v -= Math.floor(v);
  const x = Math.min(p.w - 1, Math.floor(u * p.w)); const y = Math.min(p.h - 1, Math.floor((1 - v) * p.h - 1e-6)); const i = (Math.max(0, y) * p.w + x) * 4;
  if (k === 1) return (p.d[i] << 16) | (p.d[i + 1] << 8) | p.d[i + 2];
  return (l2s(S2L[p.d[i]] * k) << 16) | (l2s(S2L[p.d[i + 1]] * k) << 8) | l2s(S2L[p.d[i + 2]] * k);
}
V.sample = sample;
// average colour of a texture (used for interiors and for the street block's palette)
const avgCache = new Map();
V.texAvg = (key) => { let a = avgCache.get(key); if (a === undefined) { const p = texPixels(key); let r = 0; let g = 0; let b = 0; let n = 0; for (let i = 0; i < p.d.length; i += 4) { if (p.d[i + 3] < 128) continue; r += S2L[p.d[i]]; g += S2L[p.d[i + 1]]; b += S2L[p.d[i + 2]]; n++; } n = n || 1; a = (l2s(r / n) << 16) | (l2s(g / n) << 8) | l2s(b / n); avgCache.set(key, a); } return a; };

// ---------- box list -> voxel grid ----------
// A box: { a, b, k (brightness), tex(face) -> texture key, uv: 'fit' | 'dens', rect, emis(key, px, py) }.
// face names follow BZ.Builder: px nx py ny pz nz. Later boxes paint over earlier ones.
const SOLID = 1 << 24; const EMIS = 1 << 25; const INNER = 1 << 26;
const FLESH = [0xa82a22, 0x7a1410, 0x8c1c16, 0xc04a42]; const BONE = 0xeadfc8;
function rasterize(boxes, vs, opt = {}) {
  let x0 = 1e9; let y0 = 1e9; let z0 = 1e9; let x1 = -1e9; let y1 = -1e9; let z1 = -1e9; const R = [];
  for (const B of boxes) {
    const lo = [0, 0, 0]; const hi = [0, 0, 0];
    for (let k = 0; k < 3; k++) { lo[k] = Math.round(B.a[k] / vs); hi[k] = Math.max(lo[k] + 1, Math.round(B.b[k] / vs)); }
    R.push([lo, hi]);
    x0 = Math.min(x0, lo[0]); y0 = Math.min(y0, lo[1]); z0 = Math.min(z0, lo[2]); x1 = Math.max(x1, hi[0]); y1 = Math.max(y1, hi[1]); z1 = Math.max(z1, hi[2]);
  }
  const nx = x1 - x0; const ny = y1 - y0; const nz = z1 - z0; const data = new Uint32Array(nx * ny * nz);
  boxes.forEach((B, bi) => {
    const [lo, hi] = R[bi]; const k = B.k === undefined ? 1 : B.k; const a = B.a; const b = B.b;
    const dx = Math.max(1e-6, b[0] - a[0]); const dy = Math.max(1e-6, b[1] - a[1]); const dz = Math.max(1e-6, b[2] - a[2]);
    const fit = B.uv !== 'dens'; const rc = B.rect;
    const midx = (lo[0] + hi[0]) / 2; const midz = (lo[2] + hi[2]) / 2; const thin = Math.min(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
    for (let j = lo[1]; j < hi[1]; j++) for (let kk = lo[2]; kk < hi[2]; kk++) for (let i = lo[0]; i < hi[0]; i++) {
      // nearest face of the box; ties go to the front, then the top, then the sides
      const d = [hi[2] - 1 - kk, hi[1] - 1 - j, hi[0] - 1 - i, i - lo[0], kk - lo[2], j - lo[1]]; // pz py px nx nz ny
      let f = 0; for (let q = 1; q < 6; q++) if (d[q] < d[f]) f = q;
      const o = (i - x0) + nx * ((kk - z0) + nz * (j - y0));
      if (d[f] >= 2 && thin >= 5) { // inside: meat and bone for a body, the box's own colour (darker) for anything else
        let c;
        if (opt.interior === 'flesh') { const h = hash3(i, j, kk, 7); c = Math.abs(i + 0.5 - midx) < 1.1 && Math.abs(kk + 0.5 - midz) < 1.1 ? BONE : FLESH[h & 3]; }
        else c = sample(B.tex('px'), 0.5, 0.5, k * 0.7);
        data[o] = c | SOLID | INNER; continue;
      }
      const cx = Math.min(b[0], Math.max(a[0], (i + 0.5) * vs)); const cy = Math.min(b[1], Math.max(a[1], (j + 0.5) * vs)); const cz = Math.min(b[2], Math.max(a[2], (kk + 0.5) * vs));
      let u; let v; const F = ['pz', 'py', 'px', 'nx', 'nz', 'ny'][f];
      // the same uv layout as BZ.Builder's faces (and zombies.js multi()), measured from each face's start corner
      if (F === 'px') { u = b[2] - cz; v = cy - a[1]; if (fit) { u /= dz; v /= dy; } }
      else if (F === 'nx') { u = cz - a[2]; v = cy - a[1]; if (fit) { u /= dz; v /= dy; } }
      else if (F === 'py') { u = cx - a[0]; v = b[2] - cz; if (fit) { u /= dx; v /= dz; } }
      else if (F === 'ny') { u = cx - a[0]; v = cz - a[2]; if (fit) { u /= dx; v /= dz; } }
      else if (F === 'pz') { u = cx - a[0]; v = cy - a[1]; if (fit) { u /= dx; v /= dy; } }
      else { u = b[0] - cx; v = cy - a[1]; if (fit) { u /= dx; v /= dy; } }
      if (!fit) { u /= 0.5; v /= 0.5; } else { u = Math.min(0.9999, Math.max(0, u)); v = Math.min(0.9999, Math.max(0, v)); if (rc && F !== 'py' && F !== 'ny') { u = rc[0] + u * (rc[2] - rc[0]); v = rc[1] + v * (rc[3] - rc[1]); } }
      const key = B.tex(F); let c = sample(key, u, v, k) | SOLID;
      if (B.emis && B.emis(key, u, v, F)) c |= EMIS;
      data[o] = c;
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
V.material = (vs, opt = {}) => {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.userData.vox = { uVox: { value: vs }, uBevel: { value: opt.bevel === undefined ? 0.11 : opt.bevel }, uJit: { value: opt.jitter === undefined ? 0.16 : opt.jitter }, uGlow: { value: opt.glow === undefined ? 1.5 : opt.glow } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.vox);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float emis; varying vec3 vVoxP; varying vec3 vVoxN; varying float vEmis;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvVoxP = position; vVoxN = normal; vEmis = emis;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uVox; uniform float uBevel; uniform float uJit; uniform float uGlow; varying vec3 vVoxP; varying vec3 vVoxN; varying float vEmis;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 vp = vVoxP / uVox; vec3 an = abs(vVoxN);
          vec3 cell = floor(vp - vVoxN * 0.5);
          float hj = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          vec2 f = an.x > 0.5 ? fract(vp.zy) : an.y > 0.5 ? fract(vp.xz) : fract(vp.xy);
          float fw = fwidth(vp.x) + fwidth(vp.y) + fwidth(vp.z);           // voxels per pixel: the detail fades out when a voxel is under ~2 px
          float near = clamp(1.0 - fw * 1.6, 0.0, 1.0);
          float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
          float rim = (1.0 - smoothstep(0.0, uBevel + fw * 0.5, e)) * near;
          float top = an.y > 0.5 ? 0.0 : smoothstep(1.0 - uBevel * 1.6, 1.0, f.y) * near;   // the upper edge of a side face catches light
          diffuseColor.rgb *= (1.0 + (hj - 0.5) * uJit * near) * (1.0 - 0.3 * rim * (1.0 - vEmis)) * (1.0 + 0.2 * top);
        }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vEmis * uGlow;');
  };
  m.customProgramCacheKey = () => 'bzvox1';
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
V.stats = { heroTris: 0, heroVox: 0 };

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
  return { spawn, update, mesh, count: () => n, cap: CAP };
});
