// The beast kit: bones and body parts written in model space (metres before the height fit, +z forward, y up), merged
// into at most three skinned meshes per beast plus one inverted-hull outline: `toon` (opaque, outlined), `glow` (unlit,
// lanterns, crystals, eyes' shine) and `ghost` (see-through bodies). Every bone rests with identity rotation, so a bone's
// local offset is its model-space position minus its parent's, and animation is plain local rotations.
const THREE = window.THREE;

const V = (a) => (a && a.isVector3 ? a.clone() : new THREE.Vector3(a[0], a[1], a[2]));
const spow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
const col3 = new THREE.Color();
const mix = (a, b, t) => { const c = new THREE.Color(a); return c.lerp(new THREE.Color(b), t).getHex(); };
export const shade = (hex, k) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return c.getHex(); };
export const tint = mix;

class Buf {
  constructor() { this.pos = []; this.col = []; this.si = []; this.sw = []; this.idx = []; }
  get n() { return this.pos.length / 3; }
  vert(p, hex, b0, b1 = b0, w = 1) {
    this.pos.push(p.x, p.y, p.z); col3.setHex(hex); this.col.push(col3.r, col3.g, col3.b);
    this.si.push(b0, b1, 0, 0); this.sw.push(w, 1 - w, 0, 0); return this.n - 1;
  }
  geometry() {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('skinIndex', new THREE.Float32BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx); g.computeVertexNormals(); return g;
  }
}

export class Kit {
  constructor(lod = 'battle') {
    this.lod = lod; this.hi = lod === 'portrait';
    this.seg = this.hi ? 22 : 12;
    this.bones = []; this.by = {};
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

  // A tube through control points: each point { p, rx, ry?, n?, bone, col?, belly? }. Catmull-Rom between them, `sub`
  // rings per span, radii and skin weights blend between neighbouring points (so a chain of bones bends smoothly).
  // Ends close on a pole. opts: { buf, up, seg, sub, col, belly, flat }
  tube(pts, opts = {}) {
    const P = pts.map((q) => ({ ...q, p: V(q.p), ry: q.ry ?? q.rx, n: q.n ?? opts.n ?? 2 }));
    const sub = opts.sub ?? (this.hi ? 6 : 3); const rings = [];
    const cr = (a, b, c, d, t) => { const t2 = t * t; const t3 = t2 * t; return b.clone().multiplyScalar(2).add(c.clone().sub(a).multiplyScalar(t)).add(a.clone().multiplyScalar(2).sub(b.clone().multiplyScalar(5)).add(c.clone().multiplyScalar(4)).sub(d).multiplyScalar(t2)).add(b.clone().multiplyScalar(3).sub(a).sub(c.clone().multiplyScalar(3)).add(d).multiplyScalar(t3)).multiplyScalar(0.5); };
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[Math.max(0, i - 1)].p; const b = P[i].p; const c = P[i + 1].p; const d = P[Math.min(P.length - 1, i + 2)].p;
      const last = i === P.length - 2;
      for (let s = 0; s < (last ? sub + 1 : sub); s++) {
        const t = s / sub; const st = t * t * (3 - 2 * t);
        rings.push({ p: cr(a, b, c, d, t), rx: P[i].rx + (P[i + 1].rx - P[i].rx) * t, ry: P[i].ry + (P[i + 1].ry - P[i].ry) * t, n: P[i].n + (P[i + 1].n - P[i].n) * t,
          b0: this.bi(P[i].bone), b1: this.bi(P[i + 1].bone), w: 1 - st, col: t < 0.5 ? P[i].col : P[i + 1].col, belly: t < 0.5 ? P[i].belly : P[i + 1].belly });
      }
    }
    if (P.length === 1) rings.push({ p: P[0].p, rx: P[0].rx, ry: P[0].ry, n: P[0].n, b0: this.bi(P[0].bone), b1: this.bi(P[0].bone), w: 1 });
    return this.loft(rings, opts);
  }
  // rings: { p, rx, ry, n, b0, b1, w, col?, belly? } in order; frames from the path tangent and opts.up
  loft(rings, opts = {}) {
    const B = this.buf[opts.buf || this.defBuf || 'toon']; const seg = opts.seg || this.seg; const up0 = V(opts.up || [0, 1, 0]);
    const N = rings.length; const base = B.n; const ax = new THREE.Vector3(); const ay = new THREE.Vector3(); const d = new THREE.Vector3(); const q = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const r = rings[i]; const pa = rings[Math.max(0, i - 1)].p; const pb = rings[Math.min(N - 1, i + 1)].p; d.subVectors(pb, pa);
      if (d.lengthSq() < 1e-12) d.set(0, 0, 1); d.normalize();
      let up = up0; if (Math.abs(d.dot(up)) > 0.92) up = Math.abs(d.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
      ay.copy(up).addScaledVector(d, -up.dot(d)).normalize(); ax.crossVectors(ay, d).normalize();
      const c = r.col ?? opts.col ?? 0xffffff; const bel = r.belly ?? opts.belly;
      for (let k = 0; k < seg; k++) {
        const a = (k / seg) * Math.PI * 2; const e = 2 / r.n; const X = r.rx * spow(Math.cos(a), e); const Y = r.ry * spow(Math.sin(a), e);
        q.copy(r.p).addScaledVector(ax, X).addScaledVector(ay, Y);
        let hex = typeof c === 'function' ? c(Math.sin(a), Math.cos(a), i / Math.max(1, N - 1)) : c;
        if (bel !== undefined && Math.sin(a) < -0.25) hex = mix(hex, bel, Math.min(1, (-Math.sin(a) - 0.25) * 2.2));
        B.vert(q, hex, r.b0, r.b1, r.w);
      }
    }
    for (let i = 0; i < N - 1; i++) for (let k = 0; k < seg; k++) {
      const a = base + i * seg + k; const b = base + i * seg + (k + 1) % seg; const c = a + seg; const e = b + seg;
      B.idx.push(a, b, c, b, e, c);
    }
    // poles: a point just past each end ring, so tips are closed and rounded
    for (const [ri, sgn] of [[0, -1], [N - 1, 1]]) {
      const r = rings[ri]; const o = rings[ri + (sgn < 0 ? 1 : -1)] || r; d.subVectors(r.p, o.p); if (d.lengthSq() < 1e-12) d.set(0, 0, sgn); d.normalize();
      const capK = opts.cap === 'flat' ? 0 : 0.35; q.copy(r.p).addScaledVector(d, Math.min(r.rx, r.ry) * capK);
      const c = r.col ?? opts.col ?? 0xffffff; const pi = B.vert(q, typeof c === 'function' ? c(0, 1, ri ? 1 : 0) : c, r.b0, r.b1, r.w);
      const s0 = base + ri * seg;
      for (let k = 0; k < seg; k++) { const a = s0 + k; const b = s0 + (k + 1) % seg; if (sgn < 0) B.idx.push(pi, b, a); else B.idx.push(pi, a, b); }
    }
    return this;
  }
  // an ellipsoid, or a rounded box with n > 2, along its local z; rot = euler [x, y, z] (radians)
  blob(bone, c, r, opts = {}) {
    const m = new THREE.Matrix4().compose(V(c), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(opts.rot || [0, 0, 0]))), new THREE.Vector3(1, 1, 1));
    const nl = opts.nl ?? opts.n ?? 2; const steps = opts.steps ?? (this.hi ? 12 : 7); const rings = []; const bi = this.bi(bone); const b1 = opts.bone2 ? this.bi(opts.bone2) : bi;
    for (let i = 0; i <= steps; i++) {
      const t = -1 + (2 * i) / steps; const k = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t), nl)), 1 / nl);
      const tt = opts.taper ? 1 + opts.taper * t : 1;
      rings.push({ p: new THREE.Vector3(0, 0, t * r[2]).applyMatrix4(m), rx: Math.max(1e-4, r[0] * k * tt), ry: Math.max(1e-4, r[1] * k * tt), n: opts.n ?? 2, b0: bi, b1, w: opts.bone2 ? (1 - t) / 2 : 1, col: opts.colAt ? opts.colAt(t) : undefined });
    }
    const up = new THREE.Vector3(0, 1, 0).transformDirection(m);
    return this.loft(rings, { ...opts, up: [up.x, up.y, up.z] });
  }
  // a horn / spike / claw: a tapered tube along a polyline (pts), radius r at the base
  horn(bone, pts, r, opts = {}) {
    const n = pts.length; const ry = opts.ry ?? r;
    return this.tube(pts.map((p, i) => ({ p, rx: Math.max(0.002, r * Math.pow(1 - i / (n - 1), opts.pow ?? 1) + (i === n - 1 ? 0.003 : 0)), ry: Math.max(0.002, ry * Math.pow(1 - i / (n - 1), opts.pow ?? 1)), bone: Array.isArray(bone) ? bone[i] : bone, col: opts.tip && i === n - 1 ? opts.tip : opts.col })), { ...opts, sub: opts.sub ?? (this.hi ? 4 : 2), seg: opts.seg ?? (this.hi ? 10 : 6) });
  }
  // spikes over part of an ellipsoid surface: count points by a golden spiral, keep those where keep(normal) is true
  spikes(bone, c, r, count, len, opts = {}) {
    const C = V(c); const keep = opts.keep || (() => true); let made = 0;
    for (let i = 0; i < count * 4 && made < count; i++) {
      const y = 1 - (2 * (i + 0.5)) / (count * 4); const rad = Math.sqrt(1 - y * y); const th = i * 2.39996;
      const nrm = new THREE.Vector3(Math.cos(th) * rad, y, Math.sin(th) * rad); if (!keep(nrm)) continue;
      const p = new THREE.Vector3(nrm.x * r[0], nrm.y * r[1], nrm.z * r[2]).add(C);
      const dir = new THREE.Vector3(nrm.x / r[0], nrm.y / r[1], nrm.z / r[2]).normalize(); if (opts.sweep) dir.add(V(opts.sweep)).normalize();
      const L = len * (opts.vary ? 1 - opts.vary / 2 + opts.vary * ((i * 0.618) % 1) : 1);
      const mid = p.clone().addScaledVector(dir, L * 0.5); if (opts.bend) mid.add(V(opts.bend).multiplyScalar(L * 0.3));
      this.horn(bone, [p.clone().addScaledVector(dir, -0.01), mid, p.clone().addScaledVector(dir, L)], opts.r ?? len * 0.22, { col: opts.col, tip: opts.tip, buf: opts.buf, seg: opts.seg ?? (this.hi ? 7 : 4), sub: 1 });
      made++;
    }
    return this;
  }
  // a faceted bipyramid (flat shaded: its own vertices per face)
  crystal(bone, c, dir, len, r, hex, opts = {}) {
    const B = this.buf[opts.buf || 'glow']; const bi = this.bi(bone); const sides = opts.sides || 5;
    const D = V(dir).normalize(); const C = V(c); const up = Math.abs(D.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const ax = new THREE.Vector3().crossVectors(D, up).normalize(); const ay = new THREE.Vector3().crossVectors(ax, D).normalize();
    const mid = C.clone().addScaledVector(D, len * (opts.waist ?? 0.3)); const top = C.clone().addScaledVector(D, len); const bot = C.clone().addScaledVector(D, -len * 0.08);
    const ring = []; for (let k = 0; k < sides; k++) { const a = (k / sides) * Math.PI * 2; ring.push(mid.clone().addScaledVector(ax, Math.cos(a) * r).addScaledVector(ay, Math.sin(a) * r)); }
    const light = shade(hex, 1.25); const dark = shade(hex, 0.7);
    for (let k = 0; k < sides; k++) {
      const a = ring[k]; const b = ring[(k + 1) % sides]; const h1 = k % 2 ? hex : light; const h2 = k % 2 ? dark : hex;
      const i0 = B.vert(a, h1, bi); B.vert(top, h1, bi); B.vert(b, h1, bi); B.idx.push(i0, i0 + 2, i0 + 1);
      const j0 = B.vert(a, h2, bi); B.vert(b, h2, bi); B.vert(bot, h2, bi); B.idx.push(j0, j0 + 2, j0 + 1);
    }
    return this;
  }
  // a ring round an axis (aura bands, haloes, rims): rot turns the default xz-plane ring
  torus(bone, c, R, r, opts = {}) {
    const m = new THREE.Matrix4().compose(V(c), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(opts.rot || [0, 0, 0]))), new THREE.Vector3(1, 1, 1));
    const N = opts.around || (this.hi ? 36 : 18); const bi = this.bi(bone); const rings = [];
    for (let i = 0; i <= N; i++) { const a = (i / N) * Math.PI * 2 * (opts.arc ?? 1); rings.push({ p: new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R).applyMatrix4(m), rx: r, ry: opts.ry ?? r, n: opts.n ?? 2, b0: bi, b1: bi, w: 1, col: opts.colAt ? opts.colAt(i / N) : undefined }); }
    const up = new THREE.Vector3(0, 1, 0).transformDirection(m);
    return this.loft(rings, { ...opts, up: [up.x, up.y, up.z], seg: opts.seg || (this.hi ? 10 : 6) });
  }
  // a thick flat shape (fins, wing membranes, blades, ears): outline pts in the plane spanned by u and v from origin o,
  // thickness th; bones: one bone name, or one per outline point (wing tips follow their own bone)
  fin(bones, o, u, v, pts, th, hex, opts = {}) {
    const B = this.buf[opts.buf || 'toon']; const O = V(o); const U = V(u); const W = V(v); const Nn = new THREE.Vector3().crossVectors(U, W).normalize();
    const bi = (i) => this.bi(Array.isArray(bones) ? bones[i] : bones);
    const n = pts.length; const cx = pts.reduce((s, p) => s + p[0], 0) / n; const cy = pts.reduce((s, p) => s + p[1], 0) / n;
    const P = (x, y, s) => O.clone().addScaledVector(U, x).addScaledVector(W, y).addScaledVector(Nn, s * th * 0.5);
    const cb = Array.isArray(bones) ? bi(opts.centreBone ?? 0) : bi(0); const edge = opts.edge ?? hex;
    const top = B.n; B.vert(P(cx, cy, 1.2), hex, cb); for (let i = 0; i < n; i++) B.vert(P(pts[i][0], pts[i][1], 0.5), edge, bi(i));
    const bot = B.n; B.vert(P(cx, cy, -1.2), hex, cb); for (let i = 0; i < n; i++) B.vert(P(pts[i][0], pts[i][1], -0.5), edge, bi(i));
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; B.idx.push(top, top + 1 + i, top + 1 + j); B.idx.push(bot, bot + 1 + j, bot + 1 + i); B.idx.push(top + 1 + i, bot + 1 + i, top + 1 + j, top + 1 + j, bot + 1 + i, bot + 1 + j); }
    return this;
  }

  // ---- shared organs ----
  // chibi eyes: white, a big dark pupil looking forward, a shine dot in the glow mesh; each eye on its own bone (blinks)
  eyes(head, c, r, opts = {}) {
    const [x, y, z] = c; const pupil = opts.pupil ?? 0x1a1420; const iris = opts.iris;
    for (const s of [-1, 1]) {
      const nm = head + (s < 0 ? '.eyeR' : '.eyeL'); this.bone(nm, head, [s * x, y, z]); this.roles.eyes.push(nm);
      const yaw = s * (opts.yaw ?? 0.45);
      const fwd = [Math.sin(yaw), 0, Math.cos(yaw)];
      this.blob(nm, [s * x, y, z], [r * 0.95, r * 1.12, r * 0.6], { col: 0xfafaf2, rot: [0, yaw, 0], buf: 'toon' });
      const pc = [s * x + fwd[0] * r * 0.42, y - r * 0.05, z + fwd[2] * r * 0.42];
      if (iris) this.blob(nm, pc, [r * 0.68, r * 0.84, r * 0.3], { col: iris, rot: [0, yaw, 0], buf: 'toon' });
      this.blob(nm, [pc[0] + fwd[0] * 0.01, pc[1], pc[2] + fwd[2] * 0.01], [r * (iris ? 0.42 : 0.62), r * (iris ? 0.56 : 0.78), r * 0.3], { col: pupil, rot: [0, yaw, 0], buf: 'toon' });
      this.blob(nm, [pc[0] + fwd[0] * r * 0.2 - s * r * 0.15, pc[1] + r * 0.3, pc[2] + fwd[2] * r * 0.2], [r * 0.2, r * 0.2, r * 0.1], { col: 0xffffff, buf: 'glow', steps: 4, seg: 6 });
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
  // a hanging thing on a pendulum bone: string + body in the glow mesh (lanterns)
  dangle(name, parent, at, len, r, hex, opts = {}) {
    const A = V(at); this.bone(name, parent, A); this.roles.danglers.push(name);
    const B = A.clone(); B.y -= len;
    this.horn(name, [A, A.clone().lerp(B, 0.5), B], 0.008, { col: opts.cord ?? 0x3a2a1a, pow: 0, seg: 4, sub: 1 });
    this.blob(name, [B.x, B.y - r * 0.15, B.z], [r * 0.5, r * 0.18, r * 0.5], { col: opts.cap ?? 0x5a3a20, steps: 4 });
    this.blob(name, [B.x, B.y - r, B.z], [r * 0.78, r, r * 0.78], { col: hex, buf: 'glow', n: opts.n ?? 2.2, steps: 6 });
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
    const U = { uSelf: { value: opts.self ?? 0.28 }, uFlash: { value: new THREE.Color(0, 0, 0) }, uOutline: { value: opts.outline ?? 0.03 } };
    const self = (sh) => { sh.uniforms.uSelf = U.uSelf; sh.uniforms.uFlash = U.uFlash; sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor.rgb * uSelf + uFlash;').replace('void main() {', 'uniform float uSelf; uniform vec3 uFlash;\nvoid main() {'); };
    const toonMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: Kit.gradient() });
    toonMat.onBeforeCompile = self; toonMat.customProgramCacheKey = () => 'beastToon';
    const ghostMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: Kit.gradient(), transparent: true, opacity: opts.ghostOpacity ?? 0.5, depthWrite: false });
    ghostMat.onBeforeCompile = self; ghostMat.customProgramCacheKey = () => 'beastToon';
    const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const lineMat = new THREE.MeshBasicMaterial({ color: opts.lineColor ?? 0x2a2230, vertexColors: true, side: THREE.BackSide });
    lineMat.onBeforeCompile = (sh) => { sh.uniforms.uOutline = U.uOutline; sh.vertexShader = sh.vertexShader.replace('void main() {', 'uniform float uOutline;\nvoid main() {').replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += normalize(normal) * uOutline;'); };
    lineMat.customProgramCacheKey = () => 'beastLine';
    const meshes = {}; const mats = { toon: toonMat, ghost: ghostMat, glow: glowMat, line: lineMat };
    const add = (key, geo, mat, order = 0) => { const m = new THREE.SkinnedMesh(geo, mat); m.name = 'beast.' + key; m.frustumCulled = false; m.renderOrder = order; root.add(m); m.bind(skel); meshes[key] = m; return m; };
    const tg = this.buf.toon.geometry();
    if (tg) { add('toon', tg, toonMat); add('line', tg, lineMat); }
    const gg = this.buf.glow.geometry(); if (gg) add('glow', gg, glowMat);
    const hg = this.buf.ghost.geometry(); if (hg) add('ghost', hg, ghostMat, 1);
    return { root, skel, meshes, mats, U };
  }
}
