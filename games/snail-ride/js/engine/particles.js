// Shuriken (Unity ParticleSystem) + TrailRenderer subset for the Snail Ride web runtime.
// Implements the modules the game's 12 systems actually enable: Initial, Shape (circle/box/edge, plus
// sphere/hemisphere/cone/rectangle), Emission (rate over time/distance, bursts), Size, Color,
// Velocity, ClampVelocity, plus Force/Rotation over lifetime and gravity (cheap, unused by the game).
// Not implemented (no system enables them): Noise, TextureSheetAnimation, InheritVelocity, Collision,
// Trigger, SubEmitters, Lights, Trails module, CustomData, ExternalForces.
// Space: Unity (x, y, z) maps to three (x, y, -z). One draw call per system: CPU-built quads.
import { THREE, sharedMaterial } from './world.js?v=20261102c';
import { A, refKey } from './assets.js?v=20261102c';

const TAU = Math.PI * 2;
const GRAVITY = -9.81;
// ClampVelocity "dampen" is a per-frame fraction in Unity; made frame-rate independent at this reference rate.
const DAMPEN_FPS = 30;
const WHITE_TEX = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
WHITE_TEX.needsUpdate = true;

// ---------- curves ----------
function curveEval(keys, t) {
  const n = keys.length;
  if (!n) return 0;
  if (n === 1 || t <= keys[0].time) return keys[0].value;
  if (t >= keys[n - 1].time) return keys[n - 1].value;
  let i = 1;
  while (keys[i].time < t) i++;
  const k0 = keys[i - 1], k1 = keys[i], dt = k1.time - k0.time;
  if (dt <= 0) return k1.value;
  const m0 = k0.outSlope, m1 = k1.inSlope;
  if (!Number.isFinite(m0) || !Number.isFinite(m1)) return k0.value; // stepped key
  const s = (t - k0.time) / dt, s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * k0.value + (s3 - 2 * s2 + s) * dt * m0 + (-2 * s3 + 3 * s2) * k1.value + (s3 - s2) * dt * m1;
}
const curveKeys = c => (c && c.m_Curve) || [];
// MinMaxCurve -> compact record. st: 0 const, 1 curve, 2 two curves, 3 two consts.
function mmc(o, def = 0) {
  if (!o) return { st: 0, s: def, min: def, maxK: [], minK: [] };
  return { st: o.minMaxState | 0, s: o.scalar ?? def, min: o.minScalar ?? def, maxK: curveKeys(o.maxCurve), minK: curveKeys(o.minCurve) };
}
function mmEval(m, t, r) {
  switch (m.st) {
    case 1: return curveEval(m.maxK, t) * m.s;
    case 2: { const a = curveEval(m.minK, t); return (a + (curveEval(m.maxK, t) - a) * r) * m.s; }
    case 3: return m.min + (m.s - m.min) * r;
    default: return m.s;
  }
}
const mmIsZero = m => m.st === 0 && m.s === 0 || m.st === 3 && m.s === 0 && m.min === 0;

// ---------- gradients ----------
function grad(g) {
  if (!g) return null;
  const nc = g.m_NumColorKeys || 0, na = g.m_NumAlphaKeys || 0;
  const cols = [], alps = [];
  for (let i = 0; i < nc; i++) { const k = g['key' + i]; cols.push(g['ctime' + i] / 65535, k.r, k.g, k.b); }
  for (let i = 0; i < na; i++) alps.push(g['atime' + i] / 65535, g['key' + i].a);
  return { cols, alps, fixed: g.m_Mode === 1 };
}
// Writes rgba of gradient at t into out[o..o+3].
function gradEval(g, t, out, o) {
  const c = g.cols, a = g.alps;
  let n = c.length / 4;
  if (!n) { out[o] = out[o + 1] = out[o + 2] = 1; }
  else if (t <= c[0] || n === 1) { out[o] = c[1]; out[o + 1] = c[2]; out[o + 2] = c[3]; }
  else if (t >= c[(n - 1) * 4]) { const j = (n - 1) * 4; out[o] = c[j + 1]; out[o + 1] = c[j + 2]; out[o + 2] = c[j + 3]; }
  else {
    let i = 1; while (c[i * 4] < t) i++;
    const j0 = (i - 1) * 4, j1 = i * 4;
    if (g.fixed) { out[o] = c[j1 + 1]; out[o + 1] = c[j1 + 2]; out[o + 2] = c[j1 + 3]; }
    else {
      const f = (t - c[j0]) / Math.max(1e-6, c[j1] - c[j0]);
      out[o] = c[j0 + 1] + (c[j1 + 1] - c[j0 + 1]) * f; out[o + 1] = c[j0 + 2] + (c[j1 + 2] - c[j0 + 2]) * f; out[o + 2] = c[j0 + 3] + (c[j1 + 3] - c[j0 + 3]) * f;
    }
  }
  n = a.length / 2;
  if (!n) out[o + 3] = 1;
  else if (t <= a[0] || n === 1) out[o + 3] = a[1];
  else if (t >= a[(n - 1) * 2]) out[o + 3] = a[(n - 1) * 2 + 1];
  else {
    let i = 1; while (a[i * 2] < t) i++;
    const j0 = (i - 1) * 2, j1 = i * 2;
    out[o + 3] = g.fixed ? a[j1 + 1] : a[j0 + 1] + (a[j1 + 1] - a[j0 + 1]) * (t - a[j0]) / Math.max(1e-6, a[j1] - a[j0]);
  }
}
// MinMaxGradient. st: 0 color, 1 gradient, 2 two colors, 3 two gradients, 4 random color.
function mmg(o) {
  if (!o) return { st: 0, c0: [1, 1, 1, 1], c1: [1, 1, 1, 1] };
  const cc = c => (c ? [c.r, c.g, c.b, c.a] : [1, 1, 1, 1]);
  return { st: o.minMaxState | 0, c0: cc(o.minColor), c1: cc(o.maxColor), g0: grad(o.minGradient), g1: grad(o.maxGradient) };
}
const _gc = new Float32Array(8);
function mmgEval(m, t, r, out, o) {
  switch (m.st) {
    case 1: gradEval(m.g1, t, out, o); return;
    case 2: for (let k = 0; k < 4; k++) out[o + k] = m.c0[k] + (m.c1[k] - m.c0[k]) * r; return;
    case 3: gradEval(m.g0, t, _gc, 0); gradEval(m.g1, t, _gc, 4); for (let k = 0; k < 4; k++) out[o + k] = _gc[k] + (_gc[4 + k] - _gc[k]) * r; return;
    case 4: gradEval(m.g1, r, out, o); return;
    default: for (let k = 0; k < 4; k++) out[o + k] = m.c1[k];
  }
}

function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Unity euler (degrees, applied Z then X then Y) -> three-space quaternion.
function unityEulerToThreeQuat(e) {
  const d = Math.PI / 180, q = new THREE.Quaternion();
  const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (e.x || 0) * d);
  const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (e.y || 0) * d);
  const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (e.z || 0) * d);
  q.copy(qy).multiply(qx).multiply(qz);
  return q.set(-q.x, -q.y, q.z, q.w); // same handedness flip as world.js applyTransform
}

// Unity sharedMaterial semantics: runtime color changes (e.g. EnvironmentController's glow color)
// made through world.js sharedMaterial/allSharedMaterials reach every system using that material.
function materialFor(matKey) {
  const mat = sharedMaterial(matKey || null);
  const m = matKey ? A.scene.materials[matKey] : null;
  // Unity's default "white" _MainTex when the material has none (world.js leaves an empty texture).
  if (!(m && refKey(m.tex && m.tex._MainTex)) && mat.uniforms.map) mat.uniforms.map.value = WHITE_TEX;
  return mat;
}
// Shaders that ignore vertex color (the vertex color is replaced with _Color in the game's GLSL).
const IGNORES_VERTEX_COLOR = new Set(['Unlit/AdditiveTint', 'Unlit/Tint', 'Unlit/Texture']);

function topObject(o) { while (o.parent) o = o.parent; return o; }
function markRange(attr, count) {
  if (attr.addUpdateRange) { attr.clearUpdateRanges && attr.clearUpdateRanges(); attr.addUpdateRange(0, count); }
  attr.needsUpdate = true;
}

// Per-particle record layout (floats).
const F = { px: 0, py: 1, pz: 2, vx: 3, vy: 4, vz: 5, age: 6, life: 7, size: 8, rot: 9, rotv: 10, cr: 11, cg: 12, cb: 13, ca: 14, r0: 15, r1: 16, r2: 17, r3: 18, r4: 19 };
const STRIDE = 20;
const MAX_CAP = 1000;

const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _d = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();
const _col = new Float32Array(4);

export class ParticleSim {
  constructor(go, psComp, rendererComp, opts = {}) {
    this.go = go; this.ps = psComp; this.rc = rendererComp || null; this.opts = opts;
    this.timeScale = opts.timeScale ?? 1;
    this.viewHeight = opts.viewHeight ?? 24; // ortho size 12 -> 24 world units; m_MaxParticleSize is a fraction of it
    this.rng = mulberry32(opts.seed ?? (Math.random() * 4294967296) >>> 0);
    const ps = psComp, I = ps.InitialModule || {}, S = ps.ShapeModule || {}, E = ps.EmissionModule || {};
    this.duration = Math.max(1e-3, ps.lengthInSec || 1);
    this.looping = !!ps.looping; this.prewarm = !!ps.prewarm; this.playOnAwake = !!ps.playOnAwake;
    this.simSpeed = ps.simulationSpeed ?? 1;
    this.worldSim = ps.moveWithTransform === 1; // 0 local, 1 world (2 custom: treated as world)
    if (ps.moveWithTransform === 2) this.worldSim = true;
    this.scalingMode = ps.scalingMode ?? 1; // 0 hierarchy, 1 local, 2 shape
    this.startDelay = mmc(ps.startDelay);
    this.life = mmc(I.startLifetime, 5); this.speed = mmc(I.startSpeed, 5); this.size = mmc(I.startSize, 1);
    this.rot0 = mmc(I.startRotation); this.color0 = mmg(I.startColor); this.gravity = mmc(I.gravityModifier);
    this.randRotDir = I.randomizeRotationDirection || 0;
    this.cap = Math.max(1, Math.min(I.maxNumParticles ?? 1000, opts.maxParticles ?? MAX_CAP));
    // shape
    this.shape = S.enabled ? {
      type: S.type, radius: S.radius ? S.radius.value : 1, thick: S.radiusThickness ?? 1, arc: (S.arc ? S.arc.value : 360) * Math.PI / 180,
      angle: (S.angle || 0) * Math.PI / 180, length: S.length || 0,
      pos: S.m_Position || { x: 0, y: 0, z: 0 }, scale: S.m_Scale || { x: 1, y: 1, z: 1 }, q: unityEulerToThreeQuat(S.m_Rotation || {}),
      hasRot: !!(S.m_Rotation && (S.m_Rotation.x || S.m_Rotation.y || S.m_Rotation.z)),
      randDir: S.randomDirectionAmount || 0, sph: S.sphericalDirectionAmount || 0, randPos: S.randomPositionAmount || 0, align: !!S.alignToDirection,
    } : null;
    // emission
    this.emOn = !!E.enabled;
    this.rate = mmc(E.rateOverTime); this.rateDist = mmc(E.rateOverDistance);
    this.hasDistRate = this.emOn && !mmIsZero(this.rateDist);
    this.bursts = (E.enabled && E.m_Bursts || []).map(b => ({ time: b.time || 0, count: mmc(b.countCurve), cycles: b.cycleCount | 0, interval: Math.max(0.01, b.repeatInterval || 0.01), prob: b.probability ?? 1 }));
    // lifetime modules
    const on = m => m && m.enabled;
    this.sizeM = on(ps.SizeModule) ? mmc(ps.SizeModule.curve, 1) : null;
    this.colorM = on(ps.ColorModule) ? mmg(ps.ColorModule.gradient) : null;
    this.rotM = on(ps.RotationModule) ? mmc(ps.RotationModule.curve) : null;
    const vm = ps.VelocityModule;
    this.velM = on(vm) ? { x: mmc(vm.x), y: mmc(vm.y), z: mmc(vm.z), mod: mmc(vm.speedModifier, 1), world: !!vm.inWorldSpace } : null;
    const fm = ps.ForceModule;
    this.forceM = on(fm) ? { x: mmc(fm.x), y: mmc(fm.y), z: mmc(fm.z), world: !!fm.inWorldSpace } : null;
    const cv = ps.ClampVelocityModule;
    this.clampM = on(cv) && !cv.separateAxis ? { mag: mmc(cv.magnitude, 1), dampen: cv.dampen ?? 1 } : null;
    this.hasGravity = !mmIsZero(this.gravity);
    // renderer
    const rc = this.rc || {};
    this.renderMode = rc.m_RenderMode ?? 0; // 0 billboard, 1 stretched, 2 horizontal, 3 vertical, 4 mesh
    this.align = rc.m_RenderAlignment ?? 0; // 0 view, 1 world, 2 local, 3 facing, 4 velocity
    this.sortMode = rc.m_SortMode ?? 0; // 2 oldest in front -> draw reversed
    this.maxSize = (rc.m_MaxParticleSize ?? 0.5) * this.viewHeight;
    this.lengthScale = rc.m_LengthScale ?? 2; this.velScale = rc.m_VelocityScale ?? 0;
    const matKey = refKey(rc.m_Materials && rc.m_Materials[0]);
    this.material = materialFor(matKey);
    this.whiteVerts = IGNORES_VERTEX_COLOR.has(this.material.userData.shader);
    this.rendererOn = rc.m_Enabled === undefined ? true : !!rc.m_Enabled;
    // buffers
    const cap = this.cap;
    this.P = new Float32Array(cap * STRIDE);
    this.n = 0;
    const g = new THREE.BufferGeometry();
    this.posArr = new Float32Array(cap * 12); this.colArr = new Float32Array(cap * 16);
    const uv = new Float32Array(cap * 8), idx = new Uint16Array(cap * 6);
    for (let i = 0; i < cap; i++) {
      uv.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8);
      const b = i * 4; idx.set([b, b + 1, b + 2, b, b + 2, b + 3], i * 6);
    }
    this.posAttr = new THREE.BufferAttribute(this.posArr, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.colArr, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr); g.setAttribute('color', this.colAttr);
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false; this.mesh.matrixAutoUpdate = true;
    this.mesh.renderOrder = rc.m_SortingOrder || 0;
    this.mesh.name = 'particles:' + go.name;
    this.container = this.worldSim ? (opts.worldRoot || null) : go.obj;
    if (this.container) this.container.add(this.mesh);
    // emitter state (container space)
    this.E = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scl: new THREE.Vector3(1, 1, 1), angle: 0, sizeScale: 1, worldScale: 1, viewAngle: 0 };
    this.lastPos = new THREE.Vector3(); this.hasLast = false; this.disp = new THREE.Vector3();
    this.time = 0; this.delayLeft = 0; this.emitAcc = 0; this.distAcc = 0; this.emitting = false; this.disposed = false;
    this.wasActive = go.activeInHierarchy;
    if (this.playOnAwake && this.wasActive) this.play();
  }

  get alive() { return this.n; }
  get isPlaying() { return this.emitting || this.n > 0; }
  get isEmitting() { return this.emitting; }

  play() {
    if (this.disposed || this.emitting) return;
    this.emitting = true;
    this.time = 0; this.emitAcc = 0; this.distAcc = 0; this.hasLast = false;
    this.delayLeft = Math.max(0, mmEval(this.startDelay, 0, this.rng()));
    if (this.prewarm && this.looping) {
      this.delayLeft = 0;
      const step = 1 / 30;
      for (let t = 0; t < this.duration - 1e-6; t += step) this._step(Math.min(step, this.duration - t));
      this._write();
    }
  }
  stop(clear = false) {
    this.emitting = false;
    if (clear) { this.n = 0; this.emitAcc = 0; this.distAcc = 0; this._write(); }
  }
  emit(n) {
    this._emitter();
    const t01 = Math.min(1, this.time / this.duration);
    for (let i = 0; i < n; i++) this._spawn(t01, 1);
    this._write();
  }
  clear() { this.n = 0; this._write(); }

  update(dt) {
    if (this.disposed) return;
    if (this.go.destroyed) { this.dispose(); return; }
    if (!this.container) { this.container = topObject(this.go.obj); this.container.add(this.mesh); }
    const active = this.go.activeInHierarchy;
    if (!active) {
      if (this.wasActive) { this.stop(true); this.wasActive = false; }
      this.mesh.visible = false;
      return;
    }
    if (!this.wasActive) { this.wasActive = true; if (this.playOnAwake) { this.stop(true); this.play(); } }
    this.mesh.visible = this.rendererOn;
    const ts = typeof this.timeScale === 'function' ? this.timeScale() : this.timeScale;
    this._step(dt * ts * this.simSpeed);
    this._write();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.emitting = false; this.n = 0;
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose(); // material is shared: not disposed
  }

  // ---- internals ----
  _emitter() {
    const E = this.E, o = this.go.obj;
    o.updateWorldMatrix(true, false);
    if (this.worldSim) {
      const c = this.container || topObject(o);
      c.updateWorldMatrix(true, false);
      _m.copy(c.matrixWorld).invert().multiply(o.matrixWorld);
      _m.decompose(E.pos, E.quat, E.scl);
      if (this.scalingMode === 1) E.scl.copy(o.scale);
      E.sizeScale = this.scalingMode === 2 ? 1 : Math.abs(E.scl.x);
      E.angle = 2 * Math.atan2(E.quat.z, E.quat.w);
      E.worldScale = 1; E.viewAngle = 0;
    } else {
      E.pos.set(0, 0, 0); E.quat.identity(); E.scl.set(1, 1, 1); E.sizeScale = 1; E.angle = 0;
      o.matrixWorld.decompose(_v, _q, _w);
      E.worldScale = Math.abs(_w.x) || 1;
      E.viewAngle = -2 * Math.atan2(_q.z, _q.w); // counter-rotate view-aligned billboards
    }
  }

  _step(dt) {
    if (dt <= 0) return;
    this._emitter();
    this._integrate(dt);
    // distance tracked in container space (world units when worldRoot is untransformed)
    const E = this.E;
    if (this.worldSim) _w.copy(E.pos); else _w.setFromMatrixPosition(this.go.obj.matrixWorld);
    if (this.hasLast) this.disp.subVectors(_w, this.lastPos); else this.disp.set(0, 0, 0);
    this.lastPos.copy(_w); this.hasLast = true;
    if (!this.emitting) return;
    let d = dt;
    if (this.delayLeft > 0) { const u = Math.min(d, this.delayLeft); this.delayLeft -= u; d -= u; if (d <= 0) return; }
    if (this.hasDistRate) {
      const dist = this.disp.length();
      this.distAcc += dist * mmEval(this.rateDist, this.time / this.duration, this.rng());
      const k = Math.floor(this.distAcc); this.distAcc -= k;
      for (let i = 0; i < k; i++) this._spawn(this.time / this.duration, (i + 1) / k);
    }
    this._emitTime(d);
  }

  _emitTime(d) {
    while (d > 1e-9 && this.emitting) {
      const t0 = this.time, step = Math.min(d, this.duration - t0), t1 = t0 + step, u = t0 / this.duration;
      if (this.emOn) {
        this.emitAcc += Math.max(0, mmEval(this.rate, u, this.rng())) * step;
        const k = Math.floor(this.emitAcc); this.emitAcc -= k;
        for (let i = 0; i < k; i++) this._spawn(u, 1);
        const atEnd = t1 >= this.duration - 1e-9;
        for (const b of this.bursts) {
          for (let c = 0; c < (b.cycles || 1e6); c++) {
            const bt = b.time + c * b.interval;
            if (bt >= t1 && !(atEnd && bt <= this.duration)) break;
            if (bt < t0) continue;
            if (b.prob < 1 && this.rng() > b.prob) continue;
            const cnt = Math.round(mmEval(b.count, bt / this.duration, this.rng()));
            for (let i = 0; i < cnt; i++) this._spawn(bt / this.duration, 1);
          }
        }
      }
      this.time = t1; d -= step;
      if (this.time >= this.duration - 1e-9) {
        if (this.looping) this.time = 0; else this.emitting = false;
      }
    }
  }

  // Sample shape in Unity shape-space into _v (position) and _d (direction).
  _shapeSample() {
    const r = this.rng, S = this.shape;
    if (!S) { _v.set(0, 0, 0); _d.set(0, 0, 1); return; }
    switch (S.type) {
      case 0: case 1: case 2: case 3: { // sphere / hemisphere (+shell)
        randUnit(r, _d); if (S.type >= 2 && _d.z < 0) _d.z = -_d.z;
        const th = S.type === 1 || S.type === 3 ? 0 : S.thick;
        const rad = S.radius * (1 - th * (1 - Math.cbrt(r())));
        _v.copy(_d).multiplyScalar(rad); break;
      }
      case 4: case 7: case 8: case 9: { // cone (base in XY, opening toward +z)
        const a = r() * S.arc, th = S.type === 7 || S.type === 9 ? 0 : S.thick;
        const rn = 1 - th * (1 - Math.sqrt(r()));
        const ca = Math.cos(a), sa = Math.sin(a), tilt = S.angle * rn;
        _v.set(ca * rn * S.radius, sa * rn * S.radius, 0);
        _d.set(ca * Math.sin(tilt), sa * Math.sin(tilt), Math.cos(tilt));
        if (S.type >= 8) _v.addScaledVector(_d, r() * S.length);
        break;
      }
      case 5: case 15: case 16: // box (volume; shell/edge approximated as volume), emits along +z
        _v.set(r() - 0.5, r() - 0.5, r() - 0.5); _d.set(0, 0, 1); break;
      case 18: // rectangle
        _v.set(r() - 0.5, r() - 0.5, 0); _d.set(0, 0, 1); break;
      case 10: case 11: case 17: { // circle / circle edge (donut approximated as circle edge)
        const a = r() * S.arc, ca = Math.cos(a), sa = Math.sin(a);
        const rad = S.type === 10 ? S.radius * (1 - S.thick * (1 - Math.sqrt(r()))) : S.radius;
        _v.set(ca * rad, sa * rad, 0); _d.set(ca, sa, 0); break;
      }
      case 12: // single sided edge along x, emits along +y
        _v.set((r() * 2 - 1) * S.radius, 0, 0); _d.set(0, 1, 0); break;
      default:
        _v.set(0, 0, 0); randUnit(r, _d);
    }
    // scale/rotate/offset (Unity space), then modifiers
    _v.x *= S.scale.x; _v.y *= S.scale.y; _v.z *= S.scale.z;
    if (S.randPos > 0) { randUnit(r, _w); _v.addScaledVector(_w, S.randPos * r()); }
    if (S.randDir > 0) { randUnit(r, _w); _d.lerp(_w, S.randDir).normalize(); }
    if (S.sph > 0 && _v.lengthSq() > 1e-12) { _w.copy(_v).normalize(); _d.lerp(_w, S.sph).normalize(); }
    if (_d.lengthSq() < 1e-12) _d.set(0, 0, 1);
    // to three space
    _v.z = -_v.z; _d.z = -_d.z;
    if (S.hasRot) { _v.applyQuaternion(S.q); _d.applyQuaternion(S.q); }
    _v.x += S.pos.x; _v.y += S.pos.y; _v.z -= S.pos.z;
  }

  // f: interpolation along this frame's emitter displacement (1 = current position)
  _spawn(t01, f) {
    if (this.n >= this.cap) return;
    const r = this.rng, E = this.E, P = this.P, o = this.n * STRIDE;
    this._shapeSample();
    _v.multiply(E.scl).applyQuaternion(E.quat).add(E.pos);
    _d.applyQuaternion(E.quat);
    if (f < 1 && this.worldSim) _v.addScaledVector(this.disp, f - 1);
    const sp = mmEval(this.speed, t01, r()); // world-space speed is not scaled by the transform (Unity)
    P[o + F.px] = _v.x; P[o + F.py] = _v.y; P[o + F.pz] = _v.z;
    P[o + F.vx] = _d.x * sp; P[o + F.vy] = _d.y * sp; P[o + F.vz] = _d.z * sp;
    P[o + F.age] = 0;
    P[o + F.life] = Math.max(1e-3, mmEval(this.life, t01, r()));
    P[o + F.size] = mmEval(this.size, t01, r()) * E.sizeScale;
    let rot = -mmEval(this.rot0, t01, r()); // Unity rotates clockwise as seen by the camera
    if (this.randRotDir > 0 && r() < this.randRotDir * 0.5) rot = -rot;
    if (this.shape && this.shape.align && (_d.x || _d.y)) rot += Math.atan2(_d.y, _d.x) - Math.PI / 2;
    P[o + F.rot] = rot; P[o + F.rotv] = 0;
    mmgEval(this.color0, t01, r(), P, o + F.cr);
    for (let k = 0; k < 5; k++) P[o + F.r0 + k] = r();
    this.n++;
  }

  _integrate(dt) {
    const P = this.P, E = this.E;
    let w = 0;
    const vm = this.velM, fm = this.forceM, cm = this.clampM, rm = this.rotM;
    const grav = this.hasGravity;
    const damp = cm ? 1 - Math.pow(1 - Math.min(1, cm.dampen), dt * DAMPEN_FPS) : 0;
    for (let i = 0; i < this.n; i++) {
      const o = i * STRIDE;
      const age = P[o + F.age] + dt, life = P[o + F.life];
      if (age >= life) continue;
      if (w !== i) P.copyWithin(w * STRIDE, o, o + STRIDE);
      const q = w * STRIDE; w++;
      P[q + F.age] = age;
      const t = age / life;
      let vx = P[q + F.vx], vy = P[q + F.vy], vz = P[q + F.vz];
      if (grav) vy += GRAVITY * mmEval(this.gravity, t, P[q + F.r3]) * dt;
      if (fm) {
        _w.set(mmEval(fm.x, t, P[q + F.r0]), mmEval(fm.y, t, P[q + F.r1]), -mmEval(fm.z, t, P[q + F.r2]));
        if (!fm.world && this.worldSim) _w.applyQuaternion(E.quat);
        vx += _w.x * dt; vy += _w.y * dt; vz += _w.z * dt;
      }
      if (cm) {
        const lim = mmEval(cm.mag, t, P[q + F.r4]), sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
        if (sp > lim && sp > 0) { const k = (sp - (sp - lim) * damp) / sp; vx *= k; vy *= k; vz *= k; }
      }
      P[q + F.vx] = vx; P[q + F.vy] = vy; P[q + F.vz] = vz;
      if (vm) {
        const mod = mmEval(vm.mod, t, P[q + F.r3]);
        _w.set(mmEval(vm.x, t, P[q + F.r0]), mmEval(vm.y, t, P[q + F.r1]), -mmEval(vm.z, t, P[q + F.r2]));
        if (!vm.world && this.worldSim) _w.applyQuaternion(E.quat);
        vx = (vx + _w.x) * mod; vy = (vy + _w.y) * mod; vz = (vz + _w.z) * mod;
      }
      P[q + F.px] += vx * dt; P[q + F.py] += vy * dt; P[q + F.pz] += vz * dt;
      if (rm) P[q + F.rot] -= mmEval(rm, t, P[q + F.r3]) * dt;
    }
    this.n = w;
  }

  _write() {
    const P = this.P, pos = this.posArr, col = this.colArr, E = this.E, n = this.n;
    const base = this.align === 2 ? (this.worldSim ? E.angle : 0) : E.viewAngle;
    const maxS = this.maxSize / E.worldScale;
    const zOff = this.worldSim ? E.pos.z : 0;
    if (this.worldSim) this.mesh.position.z = zOff;
    const stretched = this.renderMode === 1, white = this.whiteVerts, rev = this.sortMode === 2;
    for (let j = 0; j < n; j++) {
      const i = rev ? n - 1 - j : j, o = i * STRIDE, t = P[o + F.age] / P[o + F.life];
      let s = P[o + F.size];
      if (this.sizeM) s *= mmEval(this.sizeM, t, P[o + F.r3]);
      if (s > maxS) s = maxS;
      const h = s * 0.5, x = P[o + F.px], y = P[o + F.py], z = P[o + F.pz] - zOff;
      let ax, ay, bx, by; // half-extent axes
      if (stretched) {
        const vx = P[o + F.vx], vy = P[o + F.vy], sp = Math.hypot(vx, vy);
        const len = (s * this.lengthScale + sp * this.velScale) * 0.5;
        const ux = sp > 1e-6 ? vx / sp : 0, uy = sp > 1e-6 ? vy / sp : 1;
        ax = -uy * h; ay = ux * h; bx = ux * len; by = uy * len;
      } else {
        const a = base + P[o + F.rot], c = Math.cos(a), sn = Math.sin(a);
        ax = c * h; ay = sn * h; bx = -sn * h; by = c * h;
      }
      const p = j * 12;
      pos[p] = x - ax - bx; pos[p + 1] = y - ay - by; pos[p + 2] = z;
      pos[p + 3] = x + ax - bx; pos[p + 4] = y + ay - by; pos[p + 5] = z;
      pos[p + 6] = x + ax + bx; pos[p + 7] = y + ay + by; pos[p + 8] = z;
      pos[p + 9] = x - ax + bx; pos[p + 10] = y - ay + by; pos[p + 11] = z;
      let r = 1, g = 1, b = 1, al = 1;
      if (!white) {
        r = P[o + F.cr]; g = P[o + F.cg]; b = P[o + F.cb]; al = P[o + F.ca];
        if (this.colorM) { mmgEval(this.colorM, t, P[o + F.r3], _col, 0); r *= _col[0]; g *= _col[1]; b *= _col[2]; al *= _col[3]; }
      }
      const c4 = j * 16;
      for (let k = 0; k < 16; k += 4) { col[c4 + k] = r; col[c4 + k + 1] = g; col[c4 + k + 2] = b; col[c4 + k + 3] = al; }
    }
    this.mesh.geometry.setDrawRange(0, n * 6);
    if (n) { markRange(this.posAttr, n * 12); markRange(this.colAttr, n * 16); }
  }
}

function randUnit(r, out) {
  const z = r() * 2 - 1, a = r() * TAU, s = Math.sqrt(1 - z * z);
  return out.set(Math.cos(a) * s, Math.sin(a) * s, z);
}

// ---------- TrailRenderer: ribbon through recent positions, newest at the head ----------
const TRAIL_CAP = 512;
export class TrailSim {
  constructor(go, comp, opts = {}) {
    this.go = go; this.comp = comp; this.opts = opts;
    this.timeScale = opts.timeScale ?? 1;
    const p = comp.m_Parameters || {};
    this.time = Math.max(1e-3, comp.m_Time ?? 5);
    this.minDist = comp.m_MinVertexDistance ?? 0.1;
    this.emitting = comp.m_Emitting !== false && comp.m_Emitting !== 0;
    this.widthMul = p.widthMultiplier ?? 1;
    this.widthKeys = curveKeys(p.widthCurve);
    this.grad = grad(p.colorGradient);
    const matKey = refKey(comp.m_Materials && comp.m_Materials[0]);
    this.material = materialFor(matKey);
    this.whiteVerts = IGNORES_VERTEX_COLOR.has(this.material.userData.shader);
    this.enabled = comp.m_Enabled === undefined ? true : !!comp.m_Enabled;
    this.pts = new Float32Array(TRAIL_CAP * 4); this.first = 0; this.count = 0; this.clock = 0;
    this.lens = new Float32Array(TRAIL_CAP + 1);
    const nv = (TRAIL_CAP + 1) * 2;
    this.posArr = new Float32Array(nv * 3); this.colArr = new Float32Array(nv * 4);
    const uv = new Float32Array(nv * 2), idx = new Uint16Array(TRAIL_CAP * 6);
    for (let i = 0; i < TRAIL_CAP; i++) { const b = i * 2; idx.set([b, b + 1, b + 3, b, b + 3, b + 2], i * 6); }
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.posArr, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.colArr, 4).setUsage(THREE.DynamicDrawUsage);
    this.uvAttr = new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr); g.setAttribute('color', this.colAttr); g.setAttribute('uv', this.uvAttr);
    g.setIndex(new THREE.BufferAttribute(idx, 1)); g.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = comp.m_SortingOrder || 0; this.mesh.name = 'trail:' + go.name;
    this.container = opts.worldRoot || null;
    if (this.container) this.container.add(this.mesh);
    this.disposed = false; this.wasActive = go.activeInHierarchy;
  }
  get alive() { return this.count; }
  get isPlaying() { return this.emitting; }
  play() { this.emitting = true; }
  stop(clear = false) { this.emitting = false; if (clear) this.clear(); }
  emit() {}
  clear() { this.count = 0; this.first = 0; this.mesh.geometry.setDrawRange(0, 0); }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.mesh.removeFromParent(); this.mesh.geometry.dispose();
  }
  _head(out) {
    const o = this.go.obj, c = this.container;
    o.updateWorldMatrix(true, false); c.updateWorldMatrix(true, false);
    out.setFromMatrixPosition(o.matrixWorld);
    return out.applyMatrix4(_m.copy(c.matrixWorld).invert());
  }
  update(dt) {
    if (this.disposed) return;
    if (this.go.destroyed) { this.dispose(); return; }
    if (!this.container) { this.container = topObject(this.go.obj); this.container.add(this.mesh); }
    const active = this.go.activeInHierarchy;
    if (!active) { if (this.wasActive) this.clear(); this.wasActive = false; this.mesh.visible = false; return; }
    if (!this.wasActive) { this.wasActive = true; this.clear(); }
    this.mesh.visible = this.enabled;
    const ts = typeof this.timeScale === 'function' ? this.timeScale() : this.timeScale;
    this.clock += dt * ts;
    const P = this.pts, head = this._head(_v);
    // expire old points
    while (this.count && this.clock - P[this.first * 4 + 3] > this.time) { this.first = (this.first + 1) % TRAIL_CAP; this.count--; }
    if (this.emitting) {
      let add = !this.count;
      if (!add) { const l = ((this.first + this.count - 1) % TRAIL_CAP) * 4; add = Math.hypot(head.x - P[l], head.y - P[l + 1], head.z - P[l + 2]) >= this.minDist; }
      if (add) {
        if (this.count === TRAIL_CAP) { this.first = (this.first + 1) % TRAIL_CAP; this.count--; }
        const k = ((this.first + this.count) % TRAIL_CAP) * 4;
        P[k] = head.x; P[k + 1] = head.y; P[k + 2] = head.z; P[k + 3] = this.clock; this.count++;
      }
    }
    this._write(head);
  }
  // vertex i: i = 0 is the head (current position while emitting), then newest -> oldest stored points
  _pt(i, useHead, head, out) {
    if (useHead) { if (i === 0) return out.copy(head); i--; }
    const k = ((this.first + this.count - 1 - i + TRAIL_CAP) % TRAIL_CAP) * 4;
    return out.set(this.pts[k], this.pts[k + 1], this.pts[k + 2]);
  }
  _write(head) {
    const useHead = this.emitting && this.count > 0;
    const N = this.count + (useHead ? 1 : 0);
    if (N < 2) { this.mesh.geometry.setDrawRange(0, 0); return; }
    const L = this.lens; L[0] = 0;
    for (let i = 1; i < N; i++) { this._pt(i - 1, useHead, head, _w); this._pt(i, useHead, head, _d); L[i] = L[i - 1] + _w.distanceTo(_d); }
    const total = L[N - 1] || 1, pos = this.posArr, col = this.colArr, uv = this.uvAttr.array;
    for (let i = 0; i < N; i++) {
      this._pt(Math.max(0, i - 1), useHead, head, _w); this._pt(Math.min(N - 1, i + 1), useHead, head, _d);
      let tx = _w.x - _d.x, ty = _w.y - _d.y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      this._pt(i, useHead, head, _v);
      const u = L[i] / total, hw = this.widthMul * (this.widthKeys.length ? curveEval(this.widthKeys, u) : 1) * 0.5;
      const nx = -ty * hw, ny = tx * hw, p = i * 6;
      pos[p] = _v.x + nx; pos[p + 1] = _v.y + ny; pos[p + 2] = _v.z;
      pos[p + 3] = _v.x - nx; pos[p + 4] = _v.y - ny; pos[p + 5] = _v.z;
      if (this.whiteVerts || !this.grad) _col.fill(1); else gradEval(this.grad, u, _col, 0);
      col.set(_col, i * 8); col.set(_col, i * 8 + 4);
      uv[i * 4] = u; uv[i * 4 + 1] = 0; uv[i * 4 + 2] = u; uv[i * 4 + 3] = 1;
    }
    this.mesh.geometry.setDrawRange(0, (N - 1) * 6);
    markRange(this.posAttr, N * 6); markRange(this.colAttr, N * 8); markRange(this.uvAttr, N * 4);
  }
}

// ---------- tree helpers ----------
// opts: { worldRoot, timeScale (number or () => number), viewHeight, seed }
export function attachParticles(rootGO, opts = {}) {
  const list = [];
  rootGO.walk(g => {
    for (const c of g.comps) {
      if (c.type === 'ParticleSystem' && !c.sim) {
        c.sim = new ParticleSim(g, c, g.comp('ParticleSystemRenderer'), opts);
        list.push(c.sim);
      } else if (c.type === 'TrailRenderer' && !c.sim) {
        c.sim = new TrailSim(g, c, opts);
        list.push(c.sim);
      }
    }
  });
  return list;
}

// Steps every sim; drops disposed ones from the list in place.
export function updateParticles(list, dt) {
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    s.update(dt);
    if (!s.disposed) list[w++] = s;
  }
  list.length = w;
  return list;
}

// Unity ParticleSystem.Play()/Stop() with children: applies to every sim under rootGO.
export function playTree(rootGO) { rootGO.walk(g => { for (const c of g.comps) if (c.sim) c.sim.play(); }); }
export function stopTree(rootGO, clear = false) { rootGO.walk(g => { for (const c of g.comps) if (c.sim) c.sim.stop(clear); }); }
