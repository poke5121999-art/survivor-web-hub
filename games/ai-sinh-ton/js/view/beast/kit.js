// The beast kit: bones and body parts written in model space (metres before the height fit, +z forward, y up), merged
// into at most three skinned meshes per beast: `toon` (opaque, lit), `glow` (unlit: lanterns, crystals, eyes' shine) and
// `ghost` (see-through bodies). Every part is built from blocks (Addendum 11): boxes and stepped stacks of boxes, each
// face with its own vertices and flat normal, and a low-res pixel pattern drawn in the shader from the `pix` attribute
// (cell coordinates across the face, so every face reads as a grid of texels the size of `Kit.px`). Every bone rests
// with identity rotation, so a bone's local offset is its model-space position minus its parent's, and animation is
// plain local rotations; a block is skinned to the bone it hangs on.
const THREE = window.THREE;

const V = (a) => (a && a.isVector3 ? a.clone() : new THREE.Vector3(a[0], a[1], a[2]));
const col3 = new THREE.Color();
const mix = (a, b, t) => { const c = new THREE.Color(a); return c.lerp(new THREE.Color(b), t).getHex(); };
export const shade = (hex, k) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return c.getHex(); };
export const tint = mix;

// the six faces of a box: normal axis k with sign s, and the two axes the face spans (u, v), wound counter-clockwise
const FACES = [[0, 1, 2, 1], [0, -1, 1, 2], [1, 1, 0, 2], [1, -1, 2, 0], [2, 1, 1, 0], [2, -1, 0, 1]];

class Buf {
  constructor() { this.pos = []; this.nrm = []; this.col = []; this.pix = []; this.si = []; this.sw = []; this.idx = []; }
  get n() { return this.pos.length / 3; }
  vert(p, nr, hex, px, b0, b1 = b0, w = 1) {
    this.pos.push(p.x, p.y, p.z); this.nrm.push(nr.x, nr.y, nr.z); col3.setHex(hex); this.col.push(col3.r, col3.g, col3.b);
    this.pix.push(px[0], px[1], px[2], px[3]); this.si.push(b0, b1, 0, 0); this.sw.push(w, 1 - w, 0, 0); return this.n - 1;
  }
  geometry() {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('pix', new THREE.Float32BufferAttribute(this.pix, 4));
    g.setAttribute('skinIndex', new THREE.Float32BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx); return g;
  }
}

// an orthonormal frame with az along d and ay as close to `up` as d allows
function frameAlong(d, up0) {
  const az = d.clone().normalize(); let up = up0 || new THREE.Vector3(0, 1, 0);
  if (Math.abs(az.dot(up)) > 0.92) up = Math.abs(az.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const ay = up.clone().addScaledVector(az, -up.dot(az)).normalize(); const ax = new THREE.Vector3().crossVectors(ay, az).normalize();
  return { ax, ay, az };
}
function frameOf(c, rot) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot || [0, 0, 0])));
  return { o: V(c), ax: new THREE.Vector3(1, 0, 0).applyQuaternion(q), ay: new THREE.Vector3(0, 1, 0).applyQuaternion(q), az: new THREE.Vector3(0, 0, 1).applyQuaternion(q) };
}

export class Kit {
  constructor(lod = 'battle') {
    this.lod = lod; this.hi = lod === 'portrait';
    // one texel of the pixel pattern, in model metres (a chibi head is about 12 texels wide)
    this.px = 0.055;
    this.bones = []; this.by = {}; this.solids = [];
    this.buf = { toon: new Buf(), glow: new Buf(), ghost: new Buf() };
    // what the rig animates: filled by the family builders and the form files
    this.roles = { legs: [], tail: [], springs: [], wings: [], fins: [], orbits: [], eyes: [], danglers: [], tentacles: [], spine: [] };
    this.bone('root', null, [0, 0, 0]);
  }
  bone(name, parent, pos) {
    const b = new THREE.Bone(); b.name = name; const w = V(pos); b.userData.w = w;
    const p = parent ? this.by[parent] : null;
    if (p) { b.position.copy(w).sub(p.userData.w); p.add(b); } else b.position.copy(w);
    b.userData.i = this.bones.length; this.bones.push(b); this.by[name] = b; return b;
  }
  bi(name) { const b = this.by[name]; if (!b) throw new Error('beast bone not found: ' + name); return b.userData.i; }
  at(name) { return this.by[name].userData.w.clone(); }

  // ---- the one primitive: a box ----
  // F = { o, ax, ay, az } (unit axes), h = [hx, hy, hz] half sizes. opts:
  //   buf, col: hex | (lp:[x,y,z] local metres from o, n:[nx,ny,nz] local face normal) -> hex, div: [dx, dy, dz] colour
  //   bands per axis, taper: x/y sizes scale by 1 + taper * z/hz, skin: (zk in -1..1) -> [b0, b1, w], bone: index
  box(F, h, opts = {}) {
    const key = opts.buf || this.defBuf || 'toon'; const B = this.buf[key];
    const [hx, hy, hz] = h.map((x) => Math.max(x, 1e-3)); const tp = opts.taper || 0; const div = opts.div || [1, 1, 1];
    const col = opts.col ?? 0xffffff; const bone = opts.bone ?? 0; const skin = opts.skin;
    const H = [hx, hy, hz]; const px = this.px;
    const P = (x, y, z) => { const k = 1 + tp * z; return F.o.clone().addScaledVector(F.ax, x * hx * k).addScaledVector(F.ay, y * hy * k).addScaledVector(F.az, z * hz); };
    const e1 = new THREE.Vector3(); const e2 = new THREE.Vector3(); const nr = new THREE.Vector3();
    for (const [k, s, u, v] of FACES) {
      const du = div[u]; const dv = div[v];
      const nu = Math.max(1, Math.round((2 * H[u]) / px)); const nv = Math.max(1, Math.round((2 * H[v]) / px));
      for (let i = 0; i < du; i++) for (let j = 0; j < dv; j++) {
        const L = [0, 0, 0]; const corners = []; const pc = [];
        for (const [a, b] of [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]]) {
          L[k] = s; L[u] = -1 + (2 * a) / du; L[v] = -1 + (2 * b) / dv;
          corners.push(P(L[0], L[1], L[2])); pc.push([(a / du) * nu, (b / dv) * nv]);
        }
        L[k] = s; L[u] = -1 + (2 * i + 1) / du; L[v] = -1 + (2 * j + 1) / dv;
        const lp = [L[0] * hx, L[1] * hy, L[2] * hz]; const n = [0, 0, 0]; n[k] = s;
        let hex = typeof col === 'function' ? col(lp, n) : col;
        if (key === 'glow') {
          // unlit blocks still show their form: a fixed light from above and the front left
          const wn = new THREE.Vector3().addScaledVector(F.ax, n[0]).addScaledVector(F.ay, n[1]).addScaledVector(F.az, n[2]);
          hex = shade(hex, 0.86 + 0.16 * wn.y + 0.06 * wn.z - 0.04 * wn.x);
        }
        e1.subVectors(corners[1], corners[0]); e2.subVectors(corners[3], corners[0]); nr.crossVectors(e1, e2);
        if (nr.lengthSq() < 1e-14) continue; nr.normalize();
        const base = B.n;
        corners.forEach((c, ci) => {
          const zk = this._zk(c, F, hz);
          const [b0, b1, w] = skin ? skin(zk) : [bone, bone, 1];
          B.vert(c, nr, hex, [pc[ci][0], pc[ci][1], nu, nv], b0, b1, w);
        });
        B.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    if (key === 'toon' && !opts.noSolid) this.solids.push({ F, h: [hx, hy, hz], tp, bone });
    return this;
  }
  _zk(c, F, hz) { return Math.max(-1, Math.min(1, c.clone().sub(F.o).dot(F.az) / hz)); }
  // a box from a to b (its long axis), cross-section half sizes rx, ry; `up` orients the cross-section
  beam(a, b, rx, ry, opts = {}) {
    const A = V(a); const Bv = V(b); const d = Bv.clone().sub(A); const len = d.length();
    if (len < 1e-5) d.set(0, 0, 1);
    const fr = frameAlong(d, opts.up ? V(opts.up) : null); const ext = opts.ext ?? 0;
    const o = A.clone().add(Bv).multiplyScalar(0.5);
    return this.box({ o, ...fr }, [rx, ry, Math.max(len / 2 + ext, Math.min(rx, ry) * 0.5)], opts);
  }
  // the first box a ray from `from` along `dir` hits on bone `bone` (toon blocks only): { p, n } or null
  hit(from, dir, bone) {
    const bi = this.bi(bone); let best = null; const O = V(from); const D = V(dir).normalize();
    for (const S of this.solids) {
      if (S.bone !== bi || S.tp) continue;
      const o = O.clone().sub(S.F.o); const ro = [o.dot(S.F.ax), o.dot(S.F.ay), o.dot(S.F.az)]; const rd = [D.dot(S.F.ax), D.dot(S.F.ay), D.dot(S.F.az)];
      let t0 = -Infinity; let t1 = Infinity; let ax = -1;
      for (let i = 0; i < 3; i++) {
        if (Math.abs(rd[i]) < 1e-9) { if (Math.abs(ro[i]) > S.h[i]) { t0 = Infinity; break; } continue; }
        let a = (-S.h[i] - ro[i]) / rd[i]; let b = (S.h[i] - ro[i]) / rd[i]; if (a > b) [a, b] = [b, a];
        if (a > t0) { t0 = a; ax = i; } if (b < t1) t1 = b;
      }
      if (t0 > t1 || t0 < 0 || ax < 0) continue;
      if (!best || t0 < best.t) { const n = [S.F.ax, S.F.ay, S.F.az][ax].clone().multiplyScalar(-Math.sign(rd[ax])); best = { t: t0, p: O.clone().addScaledVector(D, t0), n }; }
    }
    return best;
  }

  // A chain of blocks through control points: each point { p, rx, ry?, bone, col?, belly? }. One box per span (two
  // stepped boxes when the radius changes a lot), skinned to the bone of the span's first point, overlapping its
  // neighbours so a bend never opens a gap. opts: { buf, up, col, belly }
  tube(pts, opts = {}) {
    const P = pts.map((q) => ({ ...q, p: V(q.p), ry: q.ry ?? q.rx }));
    const K = 0.9; const up = opts.up ? V(opts.up) : null;
    const face = (c, bel) => (lp, n, f) => {
      let hex = typeof c === 'function' ? c(n[1], n[0], f) : c;
      if (bel !== undefined && (n[1] < 0 || (n[1] === 0 && lp[1] < 0))) hex = n[1] < 0 ? bel : mix(hex, bel, 0.75);
      return hex;
    };
    if (P.length === 1) {
      const q = P[0]; const c = q.col ?? opts.col ?? 0xffffff;
      return this.box({ o: q.p, ...frameAlong(new THREE.Vector3(0, 0, 1), up) }, [q.rx * K, q.ry * K, q.rx * K], { ...opts, bone: this.bi(q.bone), col: face(c, q.belly ?? opts.belly), div: [1, (q.belly ?? opts.belly) !== undefined ? 3 : 1, 1] });
    }
    const spans = P.length - 1;
    for (let i = 0; i < spans; i++) {
      const a = P[i]; const b = P[i + 1]; const len = a.p.distanceTo(b.p); if (len < 1e-5) continue;
      const big = Math.max(a.rx, b.rx, a.ry, b.ry); const steps = Math.abs(a.rx - b.rx) > 0.3 * big || Math.abs(a.ry - b.ry) > 0.3 * big ? 2 : 1;
      for (let s = 0; s < steps; s++) {
        const t0 = s / steps; const t1 = (s + 1) / steps; const tm = (t0 + t1) / 2;
        const A = a.p.clone().lerp(b.p, t0); const Bp = a.p.clone().lerp(b.p, t1);
        const rx = (a.rx + (b.rx - a.rx) * tm) * K; const ry = (a.ry + (b.ry - a.ry) * tm) * K;
        // overlap into the neighbour span at joints; open ends stop flat at their point (feet stay on the ground)
        const atStart = i === 0 && s === 0; const atEnd = i === spans - 1 && s === steps - 1;
        const d = Bp.clone().sub(A).normalize(); const m = Math.min(rx, ry);
        A.addScaledVector(d, -(atStart ? 0 : s === 0 ? m * 0.55 : 0)); Bp.addScaledVector(d, atEnd ? 0 : s === steps - 1 ? m * 0.2 : 0);
        const c = (tm < 0.5 ? a.col : b.col) ?? opts.col ?? 0xffffff; const bel = (tm < 0.5 ? a.belly : b.belly) ?? opts.belly;
        const f = (i + tm) / spans;
        this.beam(A, Bp, rx, ry, { ...opts, up, bone: this.bi(a.bone), col: (lp, n) => face(c, bel)(lp, n, f), div: [1, bel !== undefined ? 3 : 1, 1] });
      }
    }
    return this;
  }
  // a rounded body part along its local z (rot = euler [x, y, z] radians): one box when it is boxy (n >= 2.3), small,
  // or tapered; otherwise a stepped stack (a core and three slabs) that reads round from every side
  blob(bone, c, r, opts = {}) {
    const F = frameOf(c, opts.rot); const bi = this.bi(bone); const b2 = opts.bone2 ? this.bi(opts.bone2) : null;
    const skin = b2 !== null ? (zk) => [bi, b2, (1 - zk) / 2] : null;
    const n = Math.min(opts.n ?? 2, opts.nl ?? opts.n ?? 2); const R = r.map((x) => Math.max(x, 1e-3));
    const zc = opts.colAt ? 8 : 1; const bel = opts.belly;
    const col = (lp, nn) => {
      let hex = opts.colAt ? opts.colAt(Math.max(-1, Math.min(1, lp[2] / R[2]))) : (opts.col ?? 0xffffff);
      if (bel !== undefined && (nn[1] < 0 || lp[1] < -R[1] * 0.4)) hex = bel;
      return hex;
    };
    const o = { ...opts, bone: bi, skin, col, div: [1, bel !== undefined ? 3 : 1, zc], taper: opts.taper };
    const small = Math.max(...R) < this.px * 2.2;
    // a see-through body is one box: stacked boxes would show their insides through each other
    if (n >= 2.3 || small || opts.taper || opts.buf === 'ghost') {
      const k = n >= 2.3 ? 0.94 : 0.86;
      return this.box(F, [R[0] * k, R[1] * k, R[2] * k], o);
    }
    const a = 0.94; const b = 0.62; const cK = 0.8;
    this.box(F, [R[0] * cK, R[1] * cK, R[2] * cK], o);
    this.box(F, [R[0] * a, R[1] * b, R[2] * b], { ...o, noSolid: true });
    this.box(F, [R[0] * b, R[1] * a, R[2] * b], { ...o, noSolid: true });
    this.box(F, [R[0] * b, R[1] * b, R[2] * a], { ...o, noSolid: true });
    return this;
  }
  // a horn / spike / claw: stepped blocks along a polyline (pts) shrinking from radius r at the base to the tip
  horn(bone, pts, r, opts = {}) {
    const n = pts.length; const ry = opts.ry ?? r; const pw = opts.pow ?? 1; const sub = opts.sub ?? 2; const P = pts.map(V);
    const rad = (t, R0) => Math.max(this.px * 0.35, R0 * Math.pow(Math.max(0, 1 - t), pw));
    const total = (n - 1) * sub;
    for (let i = 0; i < n - 1; i++) {
      const bn = Array.isArray(bone) ? bone[i] : bone;
      for (let s = 0; s < sub; s++) {
        const k = i * sub + s; const tm = (k + 0.5) / total;
        const A = P[i].clone().lerp(P[i + 1], s / sub); const Bp = P[i].clone().lerp(P[i + 1], (s + 1) / sub);
        const tip = k === total - 1;
        const rx = rad(tm, r) * 0.92; const rr = rad(tm, ry) * 0.92;
        const d = Bp.clone().sub(A).normalize(); A.addScaledVector(d, -Math.min(rx, rr) * 0.4);
        this.beam(A, Bp, rx, rr, { buf: opts.buf, up: opts.up, bone: this.bi(bn), col: tip && opts.tip ? opts.tip : (opts.col ?? 0xffffff) });
      }
    }
    return this;
  }
  // spikes over part of an ellipsoid surface: count points by a golden spiral, keep those where keep(normal) is true
  spikes(bone, c, r, count, len, opts = {}) {
    const C = V(c); const keep = opts.keep || (() => true); let made = 0;
    for (let i = 0; i < count * 4 && made < count; i++) {
      const y = 1 - (2 * (i + 0.5)) / (count * 4); const rad = Math.sqrt(1 - y * y); const th = i * 2.39996;
      const nrm = new THREE.Vector3(Math.cos(th) * rad, y, Math.sin(th) * rad); if (!keep(nrm)) continue;
      // a block body is about a box: start the spike on the box surface along the normal, not on the ellipsoid
      const k = 0.86 / Math.max(Math.abs(nrm.x), Math.abs(nrm.y), Math.abs(nrm.z), 0.6);
      const p = new THREE.Vector3(nrm.x * r[0], nrm.y * r[1], nrm.z * r[2]).multiplyScalar(Math.min(1, k)).add(C);
      const dir = new THREE.Vector3(nrm.x / r[0], nrm.y / r[1], nrm.z / r[2]).normalize(); if (opts.sweep) dir.add(V(opts.sweep)).normalize();
      const L = len * (opts.vary ? 1 - opts.vary / 2 + opts.vary * ((i * 0.618) % 1) : 1);
      const mid = p.clone().addScaledVector(dir, L * 0.5); if (opts.bend) mid.add(V(opts.bend).multiplyScalar(L * 0.3));
      this.horn(bone, [p.clone().addScaledVector(dir, -0.02), mid, p.clone().addScaledVector(dir, L)], opts.r ?? len * 0.22, { col: opts.col, tip: opts.tip, buf: opts.buf, sub: 1, pow: 0.8 });
      made++;
    }
    return this;
  }
  // a crystal: a stepped column of blocks along dir (base, waist, point), light top faces, in the glow mesh
  crystal(bone, c, dir, len, r, hex, opts = {}) {
    const D = V(dir).normalize(); const C = V(c); const bi = this.bi(bone); const buf = opts.buf || 'glow';
    const steps = [[-0.08, 0.45, 0.82], [0.4, 0.78, 0.58], [0.74, 1.0, 0.3]];
    steps.forEach(([a, b, k], i) => this.beam(C.clone().addScaledVector(D, len * a), C.clone().addScaledVector(D, len * b), r * k, r * k, {
      buf, bone: bi, up: Math.abs(D.y) > 0.9 ? [1, 0, 0] : [0, 1, 0], col: (lp, n) => (n[2] > 0 ? shade(hex, 1.3) : (n[0] + n[1] > 0 ? hex : shade(hex, 0.75 + i * 0.05))),
    }));
    return this;
  }
  // a ring round an axis (aura bands, haloes, rims): blocks round an octagon; rot turns the
  // default xz-plane ring
  torus(bone, c, R, r, opts = {}) {
    const F = frameOf(c, opts.rot); const bi = this.bi(bone); const arc = opts.arc ?? 1;
    const N = Math.max(2, Math.round(8 * arc)); const step = (Math.PI * 2 * arc) / (arc >= 0.999 ? N : Math.max(1, N - 1));
    const chord = 2 * R * Math.sin(Math.min(step, Math.PI) / 2);
    for (let i = 0; i < N; i++) {
      const a = i * step; const p = F.o.clone().addScaledVector(F.ax, Math.cos(a) * R).addScaledVector(F.az, Math.sin(a) * R);
      const tan = F.ax.clone().multiplyScalar(-Math.sin(a)).addScaledVector(F.az, Math.cos(a));
      const half = chord * 0.5 + r * 0.6;
      this.beam(p.clone().addScaledVector(tan, -half), p.clone().addScaledVector(tan, half), r * 0.9, (opts.ry ?? r) * 0.9, { buf: opts.buf, up: [F.ay.x, F.ay.y, F.ay.z], bone: bi, col: opts.colAt ? opts.colAt(i / N) : (opts.col ?? 0xffffff) });
    }
    return this;
  }
  // a flat shape (fins, wing membranes, blades, ears) as a slab of blocks: the outline pts in the plane spanned by u and
  // v from origin o is rasterised on a coarse grid, each row's run of cells is one block (the edge cells in `edge`), so
  // the outline steps like pixel art. bones: one bone name, or one per outline point (each cell blends between its
  // nearest outline point's bone and the centre bone, so wing tips still follow their own bone)
  fin(bones, o, u, v, pts, th, hex, opts = {}) {
    const O = V(o); const U = V(u); const W = V(v); const Nn = new THREE.Vector3().crossVectors(U, W).normalize();
    const lu = U.length(); const lv = W.length(); const Un = U.clone().normalize(); const Wn = W.clone().normalize();
    const bi = (i) => this.bi(Array.isArray(bones) ? bones[i] : bones);
    const n = pts.length; const cx = pts.reduce((s, p) => s + p[0], 0) / n; const cy = pts.reduce((s, p) => s + p[1], 0) / n;
    const cb = Array.isArray(bones) ? bi(opts.centreBone ?? 0) : bi(0); const edge = opts.edge ?? hex;
    let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const ext = Math.max((x1 - x0) * lu, (y1 - y0) * lv);
    const cs = Math.max(this.px * 0.9, ext / (this.hi ? 14 : 10));
    const nx = Math.max(1, Math.round(((x1 - x0) * lu) / cs)); const ny = Math.max(1, Math.round(((y1 - y0) * lv) / cs));
    const inside = (x, y) => { let c = false; for (let i = 0, j = n - 1; i < n; j = i++) { const [xi, yi] = pts[i]; const [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
    const gx = (i) => x0 + ((i + 0.5) / nx) * (x1 - x0); const gy = (j) => y0 + ((j + 0.5) / ny) * (y1 - y0);
    const on = []; for (let j = 0; j < ny; j++) { on.push([]); for (let i = 0; i < nx; i++) on[j].push(inside(gx(i), gy(j))); }
    // a sliver too thin for one cell row still gets its middle row
    if (!on.some((r) => r.some(Boolean))) on[Math.floor(ny / 2)] = on[Math.floor(ny / 2)].map(() => true);
    const isOn = (i, j) => j >= 0 && j < ny && i >= 0 && i < nx && on[j][i];
    const isEdge = (i, j) => !isOn(i - 1, j) || !isOn(i + 1, j) || !isOn(i, j - 1) || !isOn(i, j + 1);
    const wAt = (x, y) => {
      let best = 0; let bd = Infinity; for (let i = 0; i < n; i++) { const d = Math.hypot((pts[i][0] - x) * lu, (pts[i][1] - y) * lv); if (d < bd) { bd = d; best = i; } }
      const dc = Math.hypot((cx - x) * lu, (cy - y) * lv); return [bi(best), cb, dc / (dc + bd + 1e-6)];
    };
    const cw = ((x1 - x0) / nx); const ch = ((y1 - y0) / ny);
    const thk = Math.max(th * 0.8, this.px * 0.3);
    for (let j = 0; j < ny; j++) {
      let i = 0;
      while (i < nx) {
        if (!on[j][i]) { i++; continue; }
        const e = edge !== hex && isEdge(i, j); let k = i + 1;
        while (k < nx && on[j][k] && (edge !== hex && isEdge(k, j)) === e) k++;
        const xa = x0 + i * cw; const xb = x0 + k * cw; const ya = y0 + j * ch; const yb = ya + ch;
        const mx = (xa + xb) / 2; const my = (ya + yb) / 2;
        const F = { o: O.clone().addScaledVector(U, mx).addScaledVector(W, my), ax: Un, ay: Wn, az: Nn };
        const [b0, b1, w] = wAt(mx, my);
        this.box(F, [((xb - xa) * lu) / 2, ((yb - ya) * lv) / 2 * 1.02, thk / 2], { buf: opts.buf, col: e ? edge : hex, skin: () => [b0, b1, w], bone: b0, noSolid: true });
        i = k;
      }
    }
    return this;
  }

  // ---- shared organs ----
  // pixel eyes: a white square, a dark pupil (an iris square under it when given) and a one-texel shine in the glow
  // mesh, laid flat on the front of the head block (found by a ray along -z, or from the side when the eye sits past
  // the head's front). Each eye on its own bone (blinks).
  eyes(head, c, r, opts = {}) {
    const [x, y, z] = c; const pupil = opts.pupil ?? 0x1a1420; const iris = opts.iris;
    for (const s of [-1, 1]) {
      const nm = head + (s < 0 ? '.eyeR' : '.eyeL');
      let at = new THREE.Vector3(s * x, y, z); let nrm = new THREE.Vector3(0, 0, 1);
      const h = this.hit([s * x, y, z + 3], [0, 0, -1], head) || this.hit([s * x + s * 3, y, z], [-s, 0, 0], head);
      if (h) { at = h.p; nrm = h.n; }
      this.bone(nm, head, [at.x, at.y, at.z]); this.roles.eyes.push(nm);
      const bi = this.bi(nm);
      const ay = new THREE.Vector3(0, 1, 0); const az = nrm.clone(); const ax = new THREE.Vector3().crossVectors(ay, az).normalize();
      const F = (dx, dy, dz) => ({ o: at.clone().addScaledVector(ax, dx).addScaledVector(ay, dy).addScaledVector(az, dz), ax, ay, az });
      const q = r * 0.8; const t = Math.max(0.004, q * 0.12);
      // inner side of the eye towards the nose: pupils look forward and a little in, like a block mob's
      const inX = -s * Math.sign(ax.x || 1);
      this.box(F(0, 0, t), [q, q, t], { buf: 'toon', col: 0xfafaf2, bone: bi, noSolid: true });
      if (iris) this.box(F(inX * q * 0.25, -q * 0.15, t * 2.6), [q * 0.72, q * 0.78, t * 0.6], { buf: 'toon', col: iris, bone: bi, noSolid: true });
      this.box(F(inX * q * 0.45, -q * 0.25, t * 3.4), [q * 0.45, q * (iris ? 0.5 : 0.7), t * 0.6], { buf: 'toon', col: pupil, bone: bi, noSolid: true });
      this.box(F(-inX * q * 0.5, q * 0.5, t * 4.2), [q * 0.22, q * 0.22, t * 0.5], { buf: 'glow', col: 0xffffff, bone: bi });
      // portrait only: a pixel brow over each eye, a texel row tilted down towards the nose
      if (opts.brow !== undefined && this.hi) { const bf = F(inX * q * 0.1, q * 1.45, t * 1.5); this.box(bf, [q * 0.9, q * 0.2, t * 1.2], { buf: 'toon', col: opts.brow, bone: bi, noSolid: true }); }
    }
    return this;
  }
  // a spring chain of bones from `parent` through pts (tails, ears, scarves, tentacles); returns the bone names
  chain(name, parent, pts, kind = 'tail', stiff = 1) {
    const names = []; let p = parent;
    pts.forEach((q, i) => { const nm = `${name}${i}`; this.bone(nm, p, q); names.push(nm); p = nm; });
    this.roles.springs.push({ bones: names, kind, stiff }); if (kind === 'tail') this.roles.tail.push(names);
    return names;
  }
  // a hanging thing on a pendulum bone: cord + cap + a lantern block in the glow mesh
  dangle(name, parent, at, len, r, hex, opts = {}) {
    const A = V(at); this.bone(name, parent, A); this.roles.danglers.push(name);
    const B = A.clone(); B.y -= len; const bi = this.bi(name);
    this.beam(A, B, 0.01, 0.01, { col: opts.cord ?? 0x3a2a1a, bone: bi });
    this.box({ o: new THREE.Vector3(B.x, B.y - r * 0.15, B.z), ...frameOf([0, 0, 0]) }, [r * 0.55, r * 0.16, r * 0.55], { col: opts.cap ?? 0x5a3a20, bone: bi });
    this.box({ o: new THREE.Vector3(B.x, B.y - r, B.z), ...frameOf([0, 0, 0]) }, [r * 0.7, r * 0.85, r * 0.7], { col: hex, buf: 'glow', bone: bi });
    return this;
  }

  // ---- meshes ----
  // gradient for MeshToonMaterial: three bands, the dark band not too dark so night maps still read the colours
  static gradient() {
    if (Kit._grad) return Kit._grad;
    const d = new Uint8Array([120, 120, 120, 255, 190, 190, 190, 255, 255, 255, 255, 255]);
    const t = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
    Kit._grad = t; return t;
  }
  build(opts = {}) {
    const root = new THREE.Group(); root.name = 'beast';
    const rootBone = this.bones[0]; root.add(rootBone);
    const skel = new THREE.Skeleton(this.bones); root.updateMatrixWorld(true);
    const U = { uSelf: { value: opts.self ?? 0.16 }, uFlash: { value: new THREE.Color(0, 0, 0) }, uOutline: { value: opts.outline ?? 0.03 } };
    // the pixel pattern: each texel of a face a little lighter or darker by a hash, the texels along a block's edge darker
    const PIX = 'float pixK = 1.0;\n{ vec2 cl = floor(vPix.xy); vec3 p3 = fract(vec3(cl.xyx + vColor.rgb * 37.0) * 0.1031); p3 += dot(p3, p3.yzx + 33.33);'
      + ' float hh = fract((p3.x + p3.y) * p3.z); pixK = 0.88 + 0.2 * hh;'
      + ' if ((vPix.z > 2.5 && (cl.x < 0.5 || cl.x > vPix.z - 1.5)) || (vPix.w > 2.5 && (cl.y < 0.5 || cl.y > vPix.w - 1.5))) pixK *= 0.8;'
      + ' diffuseColor.rgb *= pixK; }';
    const pixVert = (sh) => { sh.vertexShader = sh.vertexShader.replace('void main() {', 'attribute vec4 pix; varying vec4 vPix;\nvoid main() {\n vPix = pix;'); sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'varying vec4 vPix;\nvoid main() {').replace('#include <color_fragment>', '#include <color_fragment>\n' + PIX); };
    const self = (sh) => {
      sh.uniforms.uSelf = U.uSelf; sh.uniforms.uFlash = U.uFlash; pixVert(sh);
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor.rgb * pixK * uSelf + uFlash;').replace('void main() {', 'uniform float uSelf; uniform vec3 uFlash;\nvoid main() {');
    };
    const toonMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: Kit.gradient() });
    toonMat.onBeforeCompile = self; toonMat.customProgramCacheKey = () => 'beastBlock';
    const ghostMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: Kit.gradient(), transparent: true, opacity: opts.ghostOpacity ?? 0.5, depthWrite: false });
    ghostMat.onBeforeCompile = self; ghostMat.customProgramCacheKey = () => 'beastBlock';
    const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    glowMat.onBeforeCompile = pixVert; glowMat.customProgramCacheKey = () => 'beastBlockGlow';
    const lineMat = new THREE.MeshBasicMaterial({ color: opts.lineColor ?? 0x2a2230, vertexColors: true, side: THREE.BackSide });
    lineMat.onBeforeCompile = (sh) => { sh.uniforms.uOutline = U.uOutline; sh.vertexShader = sh.vertexShader.replace('void main() {', 'uniform float uOutline;\nvoid main() {').replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += normalize(normal) * uOutline;'); };
    lineMat.customProgramCacheKey = () => 'beastLine';
    const meshes = {}; const mats = { toon: toonMat, ghost: ghostMat, glow: glowMat, line: lineMat };
    const add = (key, geo, mat, order = 0) => { const m = new THREE.SkinnedMesh(geo, mat); m.name = 'beast.' + key; m.frustumCulled = false; m.renderOrder = order; root.add(m); m.bind(skel); meshes[key] = m; return m; };
    const tg = this.buf.toon.geometry();
    if (tg) { add('toon', tg, toonMat); if (opts.line) add('line', tg, lineMat); }
    const gg = this.buf.glow.geometry(); if (gg) add('glow', gg, glowMat);
    const hg = this.buf.ghost.geometry(); if (hg) add('ghost', hg, ghostMat, 1);
    return { root, skel, meshes, mats, U };
  }
}
