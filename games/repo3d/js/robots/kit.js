import * as THREE from '../../vendor/three.module.min.js';

// Robot kit: bevelled primitives with an "edge" flag per vertex, baked vertex-colour wear,
// a per-joint per-material bucket merger, and the shared materials. No textures.
// Robots face +Z, feet on y = 0, units are metres.

// ---------- noise ----------
function hash3(x, y, z) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const sm = (t) => t * t * (3 - 2 * t);
export function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = sm(x - xi), fy = sm(y - yi), fz = sm(z - zi);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), fx), l(c(0, 1, 0), c(1, 1, 0), fx), fy),
    l(l(c(0, 0, 1), c(1, 0, 1), fx), l(c(0, 1, 1), c(1, 1, 1), fx), fy), fz);
}
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- primitives (indexed, with userData.edge) ----------
// Rounded box: grid lines at +-h and +-(h-r) (k steps through the bevel), outer vertices snapped onto
// the radius around the inner box. k=1 gives a 108-tri chamfer, k=2 a 300-tri round.
export function rboxGeo(w, h, d, r, k = 1) {
  const hx = w / 2, hy = h / 2, hz = d / 2;
  r = Math.max(0.0005, Math.min(r, hx * 0.95, hy * 0.95, hz * 0.95));
  if (k === 0) r = 0;
  const axis = (hh) => { if (k === 0) return [-hh, hh]; const a = []; for (let i = 0; i <= k; i++) a.push(-hh + (r * i) / k); for (let i = 0; i <= k; i++) a.push(hh - r + (r * i) / k); return a; };
  const AX = [axis(hx), axis(hy), axis(hz)];
  const lim = [hx - r, hy - r, hz - r];
  const pos = [], nor = [], edge = [], idx = [];
  const faces = [[0, 1, 2, 1], [0, 1, 2, -1], [1, 2, 0, 1], [1, 2, 0, -1], [2, 0, 1, 1], [2, 0, 1, -1]];
  const v = [0, 0, 0];
  for (const [ua, va, na, sgn] of faces) {
    const U = AX[ua], V = AX[va], n = U.length;
    const base = pos.length / 3;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      v[ua] = U[i]; v[va] = V[j]; v[na] = sgn * [hx, hy, hz][na];
      const dx = v[0] - Math.max(-lim[0], Math.min(lim[0], v[0]));
      const dy = v[1] - Math.max(-lim[1], Math.min(lim[1], v[1]));
      const dz = v[2] - Math.max(-lim[2], Math.min(lim[2], v[2]));
      const dl = Math.hypot(dx, dy, dz);
      const nn = [0, 0, 0]; nn[na] = sgn;
      const onAx = (Math.abs(dx) > 1e-6) + (Math.abs(dy) > 1e-6) + (Math.abs(dz) > 1e-6);
      if (onAx >= 2) {
        const ix = v[0] - dx, iy = v[1] - dy, iz = v[2] - dz;
        pos.push(ix + (dx / dl) * r, iy + (dy / dl) * r, iz + (dz / dl) * r); nor.push(dx / dl, dy / dl, dz / dl); edge.push(1);
      } else { pos.push(v[0], v[1], v[2]); nor.push(nn[0], nn[1], nn[2]); edge.push(0); }
    }
    // winding: (u x v) must point along +normal
    const flip = ((ua === 0 && va === 1) || (ua === 1 && va === 2) || (ua === 2 && va === 0)) ? sgn < 0 : sgn > 0;
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const a = base + j * n + i, b = a + 1, c = a + n, e = c + 1;
      if (!flip) idx.push(a, b, e, a, e, c); else idx.push(a, e, b, a, c, e);
    }
  }
  return mk(pos, nor, idx, edge);
}

function mk(pos, nor, idx, edge) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.userData.edge = new Float32Array(edge);
  return g;
}

// Lathe from a profile [[r, y, edgeFlag], ...] bottom to top, split normals at corners > hardDeg.
export function latheGeo(prof, seg = 16, hardDeg = 32, a0 = 0, a1 = Math.PI * 2) {
  const pos = [], nor = [], edge = [], idx = [];
  const segN = [];
  for (let i = 0; i < prof.length - 1; i++) {
    const dr = prof[i + 1][0] - prof[i][0], dy = prof[i + 1][1] - prof[i][1];
    const l = Math.hypot(dr, dy) || 1; segN.push([dy / l, -dr / l, Math.hypot(dr, dy) > 1e-7]);
  }
  const cosH = Math.cos((hardDeg * Math.PI) / 180);
  const ring = (r, y, nr, ny, e) => {
    const b = pos.length / 3;
    for (let s = 0; s <= seg; s++) {
      const a = a0 + ((a1 - a0) * s) / seg, ca = Math.cos(a), sa = Math.sin(a);
      pos.push(r * sa, y, r * ca); nor.push(nr * sa, ny, nr * ca); edge.push(e);
    }
    return b;
  };
  let prevOut = -1;
  for (let i = 0; i < prof.length; i++) {
    const [r, y, e = 0] = prof[i];
    const nin = i > 0 ? segN[i - 1] : null, nout = i < segN.length ? segN[i] : null;
    let inRing, outRing;
    if (nin && nout && nin[2] && nout[2] && nin[0] * nout[0] + nin[1] * nout[1] > cosH) {
      const nx = nin[0] + nout[0], ny = nin[1] + nout[1], l = Math.hypot(nx, ny) || 1;
      inRing = outRing = ring(r, y, nx / l, ny / l, e);
    } else {
      if (nin) inRing = ring(r, y, nin[0], nin[1], e);
      if (nout) outRing = ring(r, y, nout[0], nout[1], e);
    }
    if (nin && nin[2] && prevOut >= 0) {
      for (let s = 0; s < seg; s++) { const a = prevOut + s, b = a + 1, c = inRing + s, d = c + 1; idx.push(a, b, d, a, d, c); }
    }
    prevOut = outRing;
  }
  return mk(pos, nor, idx, edge);
}

// Bevelled cylinder along Y.
export function cylGeo(rt, rb, h, bev, seg) {
  const b = Math.min(bev, rt * 0.45, rb * 0.45, h * 0.3), y0 = -h / 2, y1 = h / 2;
  if (b < 0.0008) return latheGeo([[0, y0], [rb, y0, 1], [rt, y1, 1], [0, y1]], seg);
  return latheGeo([[0, y0], [rb - b, y0, 1], [rb, y0 + b, 1], [rt, y1 - b, 1], [rt - b, y1, 1], [0, y1]], seg);
}

function edgeFromNormals(g, lo = 0.12, hi = 0.96) {
  const n = g.attributes.normal, e = new Float32Array(n.count);
  for (let i = 0; i < n.count; i++) { const z = Math.abs(n.getZ(i)); e[i] = z > lo && z < hi ? 1 : 0; }
  g.userData.edge = e; return g;
}

// Extruded 2D shape (points [[x,y],...] in the XY plane), centred on z, with a bevel of bs segments,
// normals auto-smoothed across edges flatter than `crease` degrees.
export function extrudeGeo(pts, depth, bev = 0.006, curveSeg = 6, holes, bs = 1, crease = 50) {
  const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  if (holes) for (const hp of holes) sh.holes.push(new THREE.Path(hp.map(([x, y]) => new THREE.Vector2(x, y))));
  const b = Math.min(bev, depth * 0.4);
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.0005, depth - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: bs, curveSegments: curveSeg });
  g.translate(0, 0, -(depth - 2 * b) / 2);
  g.deleteAttribute('uv');
  edgeFromNormals(g);
  if (bs > 1 || crease > 0) autoSmooth(g, crease);
  return g;
}

// average normals of coincident vertices whose face normals differ by less than `deg`
export function autoSmooth(g, deg = 50) {
  const P = g.attributes.position.array, N = g.attributes.normal.array, n = P.length / 3;
  const cosT = Math.cos((deg * Math.PI) / 180), q = 1e4;
  const map = new Map();
  for (let i = 0; i < n; i++) {
    const k = Math.round(P[i * 3] * q) + ',' + Math.round(P[i * 3 + 1] * q) + ',' + Math.round(P[i * 3 + 2] * q);
    let l = map.get(k); if (!l) map.set(k, (l = [])); l.push(i);
  }
  const out = new Float32Array(N.length);
  for (const l of map.values()) for (const i of l) {
    let x = 0, y = 0, z = 0;
    for (const j of l) { const d = N[i * 3] * N[j * 3] + N[i * 3 + 1] * N[j * 3 + 1] + N[i * 3 + 2] * N[j * 3 + 2]; if (d >= cosT) { x += N[j * 3]; y += N[j * 3 + 1]; z += N[j * 3 + 2]; } }
    const len = Math.hypot(x, y, z) || 1; out[i * 3] = x / len; out[i * 3 + 1] = y / len; out[i * 3 + 2] = z / len;
  }
  N.set(out);
}

// ---------- materials (shared by every robot) ----------
let MATS = null;
export function sharedMats() {
  if (MATS) return MATS;
  const vc = { vertexColors: true };
  MATS = {
    paint: new THREE.MeshPhysicalMaterial({ ...vc, roughness: 0.46, metalness: 0.18, clearcoat: 0.4, clearcoatRoughness: 0.32 }),
    metal: new THREE.MeshStandardMaterial({ ...vc, roughness: 0.34, metalness: 0.88 }),
    dark: new THREE.MeshStandardMaterial({ ...vc, roughness: 0.72, metalness: 0.25 }),
    glass: new THREE.MeshPhysicalMaterial({ ...vc, roughness: 0.06, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.04 }),
    chrome: new THREE.MeshStandardMaterial({ ...vc, roughness: 0.07, metalness: 1 }),
    stone: new THREE.MeshStandardMaterial({ ...vc, roughness: 0.93, metalness: 0 }),
    ghost: new THREE.MeshPhysicalMaterial({ ...vc, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.42, depthWrite: false, emissive: 0x2a5a80, emissiveIntensity: 0.55, side: THREE.DoubleSide }),
    clear: new THREE.MeshPhysicalMaterial({ ...vc, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.28, depthWrite: false, clearcoat: 1 }),
    glow: new THREE.MeshBasicMaterial({ ...vc }),
    glow2: new THREE.MeshBasicMaterial({ ...vc }),
    // foe/boss surfaces: dielectric grimy paint, true metals, per-vertex roughness/metalness offsets (attribute surf)
    fpaint: surfMat(new THREE.MeshStandardMaterial({ ...vc, roughness: 0.56, metalness: 0.04 })),
    fmetal: surfMat(new THREE.MeshStandardMaterial({ ...vc, roughness: 0.38, metalness: 0.9 })),
    fdark: surfMat(new THREE.MeshStandardMaterial({ ...vc, roughness: 0.64, metalness: 0.5 })),
    fchrome: surfMat(new THREE.MeshStandardMaterial({ ...vc, roughness: 0.12, metalness: 1 })),
    fstone: surfMat(new THREE.MeshStandardMaterial({ ...vc, roughness: 0.9, metalness: 0 })),
    halo: haloMat(),
    halo2: haloMat(),
  };
  for (const k in MATS) MATS[k].name = 'robot_' + k;
  return MATS;
}
export const GLOW_MATS = ['glow', 'glow2'];
// foe kits remap the shared names onto the grimy set
const FX_MAT = { paint: 'fpaint', metal: 'fmetal', dark: 'fdark', chrome: 'fchrome', stone: 'fstone' };

function surfMat(m) {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 surf;\nvarying vec2 vSurf;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurf = surf;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vSurf;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + vSurf.x, 0.04, 1.0);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = clamp(metalnessFactor + vSurf.y, 0.0, 1.0);');
  };
  m.customProgramCacheKey = () => 'robotSurf';
  return m;
}

// soft radial halo texture built from code (no image file), shared by every halo sprite
let HALO_TEX = null;
function haloTex() {
  if (HALO_TEX) return HALO_TEX;
  const N = 64, d = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const r = Math.hypot(x - N / 2 + 0.5, y - N / 2 + 0.5) / (N / 2);
    const a = Math.max(0, 1 - r);
    const v = Math.min(1, 0.7 * a * a * a + 0.7 * Math.exp(-r * r * 40));
    const i = (y * N + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.round(v * 255);
  }
  HALO_TEX = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  HALO_TEX.magFilter = THREE.LinearFilter; HALO_TEX.minFilter = THREE.LinearFilter; HALO_TEX.needsUpdate = true;
  return HALO_TEX;
}
function haloMat() {
  return new THREE.SpriteMaterial({ map: haloTex(), color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, fog: true });
}

// ---------- builder ----------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const WEAR = new THREE.Color(0.5, 0.49, 0.47);
const BARE = new THREE.Color(0.42, 0.41, 0.4);
const RUST = new THREE.Color(0.3, 0.12, 0.045), RUST2 = new THREE.Color(0.5, 0.24, 0.08);
const OIL = new THREE.Color(0.11, 0.012, 0.01), SOOT = new THREE.Color(0.03, 0.028, 0.026);

export class Kit {
  // fx (foes/bosses only): { rust, oil, soot, grime } 0..1; null keeps the clean crew look
  constructor(pal, seed = 1, fx = null) {
    this.fx = fx;
    this.halos = [];
    this.pal = {};
    for (const k in pal) this.pal[k] = new THREE.Color(pal[k]);
    this.seed = seed;
    this.root = new THREE.Group();
    this.J = { root: this.root };
    this.buckets = new Map();
    this.tris = 0;
  }
  joint(name, parent, x = 0, y = 0, z = 0) {
    const g = new THREE.Group(); g.name = name; g.position.set(x, y, z);
    this.J[parent || 'root'].add(g); this.J[name] = g; return name;
  }
  col(c, mat) {
    if (c === undefined) c = { paint: 'm', metal: 'k', dark: 'd', glass: 'v', clear: 0xdfefff, chrome: 'k', stone: 'm', ghost: 'm', glow: 'w', glow2: 'w' }[mat];
    if (c === 'w') return new THREE.Color(1, 1, 1);
    if (typeof c === 'string') return (this.pal[c] || new THREE.Color(0xff00ff)).clone();
    if (c instanceof THREE.Color) return c.clone();
    return new THREE.Color(c);
  }
  xf(o) {
    if (o.m) return o.m;
    const p = o.p || [0, 0, 0], r = o.r || [0, 0, 0], s = o.s || [1, 1, 1];
    _e.set(r[0], r[1], r[2], o.ro || 'XYZ'); _q.setFromEuler(_e);
    return _m.compose(_v.set(p[0], p[1], p[2]), _q, _s.set(s[0], s[1], s[2]));
  }
  // o: p, r, s, m, c (colour), i (glow intensity), wear (0..1), grime (0..1)
  add(j, mat, g, o = {}) {
    if (!this.J[j]) throw new Error('joint not found: ' + j);
    if (this.fx && FX_MAT[mat]) mat = FX_MAT[mat];
    if (o.taper || o.tb) taperGeo(g, o.taper || [1, 1], o.tb || [1, 1]);
    g.applyMatrix4(this.xf(o));
    this.bake(g, mat, o);
    let jb = this.buckets.get(j); if (!jb) this.buckets.set(j, (jb = new Map()));
    let list = jb.get(mat); if (!list) jb.set(mat, (list = []));
    list.push(g);
    this.tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    return g;
  }
  bake(g, mat, o) {
    const base = this.col(o.c, mat);
    const P = g.attributes.position, n = P.count, cols = new Float32Array(n * 3), E = g.userData.edge;
    const isGlow = mat === 'glow' || mat === 'glow2';
    if (isGlow) {
      const I = o.i ?? 2;
      for (let i = 0; i < n; i++) { cols[i * 3] = base.r * I; cols[i * 3 + 1] = base.g * I; cols[i * 3 + 2] = base.b * I; }
    } else {
      g.computeBoundingBox();
      const bb = g.boundingBox, y0 = bb.min.y, hy = Math.max(1e-3, bb.max.y - bb.min.y);
      const wear = o.wear ?? (mat === 'paint' ? 0.75 : mat === 'stone' ? 0.6 : 0.35);
      const grime = o.grime ?? 1;
      const sd = this.seed * 7.31;
      for (let i = 0; i < n; i++) {
        const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
        let r = base.r, gg = base.g, b = base.b;
        const big = vnoise(x * 6 + sd, y * 6, z * 6), fine = vnoise(x * 41, y * 41 + sd, z * 41);
        const k = 1 + (big - 0.5) * 0.22 * grime + (fine - 0.5) * 0.08;
        r *= k; gg *= k; b *= k;
        const e = E ? E[i] : 0;
        if (e > 0) {
          const chip = smoothstep(0.38, 0.62, vnoise(x * 27 + 3.1, y * 27, z * 27 - sd)) * wear * e;
          r += (WEAR.r - r) * chip; gg += (WEAR.g - gg) * chip; b += (WEAR.b - b) * chip;
          const hl = 1 + 0.12 * e; r *= hl; gg *= hl; b *= hl;
        }
        const ao = 1 - 0.3 * grime * (1 - smoothstep(0, 0.35, (y - y0) / hy));
        cols[i * 3] = r * ao; cols[i * 3 + 1] = gg * ao; cols[i * 3 + 2] = b * ao;
      }
      if (this.fx) this.bakeFx(g, mat, o, cols, E, y0, hy);
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  }
  // rust, oil stains with drips, soot, cavity grime; writes surf = (roughness offset, metalness offset)
  bakeFx(g, mat, o, cols, E, y0, hy) {
    const P = g.attributes.position, N = g.attributes.normal, n = P.count, fx = this.fx;
    const surf = new Float32Array(n * 2);
    const sd = this.seed * 3.17;
    const rustK = (o.rust ?? fx.rust ?? 0.5) * (mat === 'fstone' || mat === 'fchrome' ? 0.15 : 1);
    const oilK = o.oil ?? fx.oil ?? 0.4, sootK = o.soot ?? fx.soot ?? 0.3;
    const painted = mat === 'fpaint';
    for (let i = 0; i < n; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), ny = N ? N.getY(i) : 0;
      let r = cols[i * 3], gg = cols[i * 3 + 1], b = cols[i * 3 + 2];
      let ro = (vnoise(x * 23 + sd, y * 23, z * 23) - 0.5) * 0.22, me = 0;
      const e = E ? E[i] : 0;
      // chipped paint shows bare metal on edges
      if (painted && e > 0) {
        const chip = smoothstep(0.45, 0.6, vnoise(x * 31 - sd, y * 31, z * 31)) * e * (o.wear ?? 0.8);
        r += (BARE.r - r) * chip; gg += (BARE.g - gg) * chip; b += (BARE.b - b) * chip; me += 0.75 * chip; ro -= 0.15 * chip;
      }
      // rust: blotches, more on low and edge vertices
      const low = 1 - smoothstep(0, 0.6, (y - y0) / hy);
      const rn = vnoise(x * 8.5 + sd, y * 8.5 - sd, z * 8.5) + 0.25 * vnoise(x * 37, y * 37, z * 37 + sd);
      const rk = smoothstep(0.82 - 0.3 * rustK - 0.12 * e - 0.1 * low, 1.05 - 0.3 * rustK, rn) * Math.min(1, rustK * 1.6);
      if (rk > 0) {
        const t = vnoise(x * 60, y * 60 + sd, z * 60);
        const rr = RUST.r + (RUST2.r - RUST.r) * t, rg = RUST.g + (RUST2.g - RUST.g) * t, rb = RUST.b + (RUST2.b - RUST.b) * t;
        r += (rr - r) * rk; gg += (rg - gg) * rk; b += (rb - b) * rk; ro += 0.4 * rk; me -= 0.6 * rk;
      }
      // oil / blood-dark stains: blotch plus streaks stretched downward
      const on = vnoise(x * 5 - sd, y * 5, z * 5 + sd), streak = vnoise(x * 34 + sd, y * 2.2, z * 34);
      const ok = Math.max(smoothstep(0.7, 0.86, on), smoothstep(0.74, 0.9, streak) * smoothstep(0.45, 0.7, on)) * oilK;
      if (ok > 0) { r += (OIL.r - r) * ok; gg += (OIL.g - gg) * ok; b += (OIL.b - b) * ok; ro -= 0.35 * ok; me -= 0.3 * ok; }
      // soot near the bottom and in noise pockets, cavity darkening on down-facing faces
      const sk = (smoothstep(0.6, 0.9, vnoise(x * 3 + 7, y * 3, z * 3 - sd)) * 0.7 + low * 0.35) * sootK;
      const cav = 1 - 0.25 * Math.max(0, -ny) * (fx.grime ?? 1);
      r = (r + (SOOT.r - r) * sk) * cav; gg = (gg + (SOOT.g - gg) * sk) * cav; b = (b + (SOOT.b - b) * sk) * cav;
      ro += 0.2 * sk;
      cols[i * 3] = r; cols[i * 3 + 1] = gg; cols[i * 3 + 2] = b;
      surf[i * 2] = ro; surf[i * 2 + 1] = me;
    }
    g.setAttribute('surf', new THREE.BufferAttribute(surf, 2));
  }
  // additive camera-facing glow around an eye/light, joint-local position, size in metres
  halo(j, p, size = 0.12, key = 'glow', k = 1) {
    if (!this.J[j]) throw new Error('joint not found: ' + j);
    this.halos.push({ j, p, size, key: key === 'glow2' ? 'halo2' : 'halo', k });
  }
  // --- part helpers ---
  box(j, mat, w, h, d, o = {}) { const mn = Math.min(w, h, d); return this.add(j, mat, rboxGeo(w, h, d, o.b ?? Math.min(0.012, mn * 0.25), o.k ?? (mn < 0.016 || o.b === 0 ? 0 : 1)), o); }
  cyl(j, mat, rt, rb, h, o = {}) { // o.ax: 'x' | 'z' | 'y'
    const g = cylGeo(rt, rb, h, o.b ?? Math.min(0.008, h * 0.2), o.seg ?? 14);
    if (o.ax === 'x') g.rotateZ(Math.PI / 2); else if (o.ax === 'z') g.rotateX(Math.PI / 2);
    return this.add(j, mat, g, o);
  }
  lathe(j, mat, prof, o = {}) {
    const g = latheGeo(prof, o.seg ?? 16, o.hard ?? 32, o.a0 ?? 0, o.a1 ?? Math.PI * 2);
    if (o.ax === 'x') g.rotateZ(Math.PI / 2); else if (o.ax === 'z') g.rotateX(Math.PI / 2); else if (o.ax === '-z') g.rotateX(-Math.PI / 2);
    return this.add(j, mat, g, o);
  }
  // two-sided lathe shell: outer (paint) with outward normals, inner (o.inC colour, dark by default) facing in
  shell(j, mat, prof, o = {}) {
    const up = prof[0][1] <= prof[prof.length - 1][1] ? prof : prof.slice().reverse();
    this.lathe(j, mat, up, o);
    const k = o.inK ?? 0.95;
    this.lathe(j, o.inMat || mat, up.slice().reverse().map(([r, y]) => [r * k, y]), { ...o, c: o.inC ?? 0x18191c, wear: 0 });
  }
  sphere(j, mat, r, o = {}) {
    const g = new THREE.SphereGeometry(r, o.seg ?? 14, o.rows ?? 10, 0, Math.PI * 2, o.t0 ?? 0, o.t1 ?? Math.PI);
    g.deleteAttribute('uv'); g.userData.edge = null; return this.add(j, mat, g, o);
  }
  torus(j, mat, R, r, o = {}) {
    const g = new THREE.TorusGeometry(R, r, o.rs ?? 8, o.ts ?? 28, o.arc ?? Math.PI * 2);
    g.deleteAttribute('uv'); if (o.ax === 'y') g.rotateX(Math.PI / 2); else if (o.ax === 'x') g.rotateY(Math.PI / 2);
    return this.add(j, mat, g, o);
  }
  ext(j, mat, pts, depth, o = {}) { return this.add(j, mat, extrudeGeo(pts, depth, o.b ?? 0.006, o.cs ?? 6, o.holes, o.bs ?? 1, o.crease ?? 50), o); }
  // side profile: pts are [z, y] (z forward), extruded across x by `width`
  prof(j, mat, pts, width, o = {}) {
    const g = extrudeGeo(pts, width, o.b ?? 0.02, o.cs ?? 8, null, o.bs ?? 2, o.crease ?? 55);
    g.rotateY(-Math.PI / 2);
    return this.add(j, mat, g, o);
  }
  // cylinder between two points (joint-local)
  rod(j, mat, a, b, r, o = {}) {
    const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), d = Bv.clone().sub(A), L = d.length();
    const g = cylGeo(o.r2 ?? r, r, L, o.b ?? Math.min(0.004, r * 0.3), o.seg ?? 8);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, d.normalize());
    return this.add(j, mat, g, { ...o, m: new THREE.Matrix4().compose(A.add(Bv).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)) });
  }
  // bevelled box between two points
  beam(j, mat, a, b, w, d, o = {}) {
    const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), dir = Bv.clone().sub(A), L = dir.length();
    const g = rboxGeo(w, L, d, o.b ?? Math.min(0.01, Math.min(w, d) * 0.25), o.k ?? 1);
    if (o.taper || o.tb) taperGeo(g, o.taper || [1, 1], o.tb || [1, 1]);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
    if (o.spin) q.multiply(new THREE.Quaternion().setFromAxisAngle(UP, o.spin));
    const oo = { ...o, taper: undefined, tb: undefined, m: new THREE.Matrix4().compose(A.add(Bv).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)) };
    return this.add(j, mat, g, oo);
  }
  tube(j, mat, pts, r, o = {}) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), !!o.closed);
    const g = new THREE.TubeGeometry(curve, o.ts ?? Math.max(8, pts.length * 6), r, o.rs ?? 6, !!o.closed);
    g.deleteAttribute('uv'); g.userData.edge = null; return this.add(j, mat, g, o);
  }
  // hex bolt head facing direction n (axis 'x','y','z' with sign)
  bolt(j, x, y, z, n = 'z', s = 0.012, o = {}) {
    const g = latheGeo([[0, 0], [s, 0, 1], [s, s * 0.45, 1], [s * 0.7, s * 0.75, 1], [0, s * 0.75]], 6, 20);
    const sign = n[0] === '-' ? -1 : 1, ax = n.replace('-', '');
    if (ax === 'z') g.rotateX(sign * Math.PI / 2); else if (ax === 'x') g.rotateZ(-sign * Math.PI / 2); else if (sign < 0) g.rotateX(Math.PI);
    return this.add(j, o.mat || 'metal', g, { p: [x, y, z], c: o.c, wear: 0.2 });
  }
  // row of louvre slats on a face: centre (x,y,z), n slats stacked along y; o.ax 'z' | 'x', o.sgn +1 | -1 (face direction)
  vent(j, x, y, z, w, h, n, o = {}) {
    const d = o.d ?? 0.012, ax = o.ax || 'z', sg = o.sgn ?? 1, out = (o.out ?? 0.004) * sg;
    const X = ax === 'x';
    this.box(j, 'dark', X ? d : w + 0.014, h + 0.014, X ? w + 0.014 : d, { p: [x, y, z], c: o.frame ?? 0x16171a, b: 0.003 });
    for (let i = 0; i < n; i++) {
      const yy = y - h / 2 + (h * (i + 0.5)) / n;
      this.box(j, o.mat || 'metal', X ? d * 0.5 : w, (h / n) * 0.5, X ? w : d * 0.5, { p: X ? [x + out, yy, z] : [x, yy, z + out], r: X ? [0, 0, sg * 0.5] : [-sg * 0.5, 0, 0], c: o.c ?? 'k', b: 0.002 });
    }
  }
  finish() {
    const M = sharedMats();
    for (const [j, jb] of this.buckets) for (const [mat, list] of jb) {
      const mesh = new THREE.Mesh(mergeGeos(list), M[mat]);
      mesh.name = j + ':' + mat;
      mesh.userData.mat = mat;
      mesh.castShadow = mat !== 'glow' && mat !== 'glow2' && mat !== 'ghost' && mat !== 'clear';
      if (mat === 'clear' || mat === 'ghost') mesh.renderOrder = 2;
      mesh.receiveShadow = mesh.castShadow;
      this.J[j].add(mesh);
    }
    this.buckets.clear();
    for (const h of this.halos) {
      const sp = new THREE.Sprite(M[h.key]);
      sp.position.set(h.p[0], h.p[1], h.p[2]); sp.scale.set(h.size, h.size, 1);
      sp.userData.mat = h.key; sp.userData.halo = true; sp.name = h.j + ':' + h.key; sp.renderOrder = 3;
      sp.raycast = () => {};
      this.J[h.j].add(sp);
    }
    return this.root;
  }
}

function taperGeo(g, top, bot) {
  const P = g.attributes.position; g.computeBoundingBox();
  const y0 = g.boundingBox.min.y, h = Math.max(1e-6, g.boundingBox.max.y - y0);
  for (let i = 0; i < P.count; i++) {
    const f = (P.getY(i) - y0) / h;
    P.setX(i, P.getX(i) * (bot[0] + (top[0] - bot[0]) * f));
    P.setZ(i, P.getZ(i) * (bot[1] + (top[1] - bot[1]) * f));
  }
}

export function mergeGeos(list) {
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  const surf = list.some((g) => g.attributes.surf) ? new Float32Array(nv * 2) : null;
  let vo = 0, io = 0;
  for (const g of list) {
    const P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color, c = P.count;
    if (surf && g.attributes.surf) surf.set(g.attributes.surf.array.subarray(0, c * 2), vo * 2);
    pos.set(P.array.subarray(0, c * 3), vo * 3); nor.set(N.array.subarray(0, c * 3), vo * 3); col.set(C.array.subarray(0, c * 3), vo * 3);
    if (g.index) { const I = g.index.array; for (let i = 0; i < I.length; i++) idx[io + i] = I[i] + vo; io += I.length; }
    else { for (let i = 0; i < c; i++) idx[io + i] = vo + i; io += c; }
    vo += c;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (surf) out.setAttribute('surf', new THREE.BufferAttribute(surf, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}
