// Unity ParticleSystem playback for three.js (data/particles.json, see tools/export_particles.py).
//
//   const fx = new Particles(defs, { texBase: 'art/tex' });  scene.add(fx.root);
//   autoAttach(stage, fx);                                    // every level2/level4 system on its node
//   fx.play(fx.at(obj)); fx.stop(emitter); fx.burst(emitter, 20); fx.update(dt, camera);
//   fx.spawn('prefab:sharedassets2.assets:441', { position })  // one-shot prefab effect (crunch, splash, flop, dust)
//
// One draw call per emitter: an InstancedBufferGeometry quad (or the renderer's mesh) with per-instance position,
// velocity, size/roll/frame and colour. Simulation is CPU, in the emitter's local space (simulationSpace 0) or world space.
// Modules played: emission/shape/velocity/force/clamp/noise/size/colour/rotation/sheet, Inherit Velocity (initial and current),
// Collision (world type) and Trails (per-particle ribbons). Collision is a cheap stand-in: Unity collides with scene colliders, which
// the page does not have, so particles bounce off host-given planes (fx.planes = [[nx, ny, nz, d]], solid side n.p < d; autoAttach
// sets the room floor). Sub-emitters, Lights, Custom data and external forces are not enabled on any of the 102 original systems.
// Unity axes are mirrored once: shape and velocity maths run in Unity local axes, then z is negated. Colours are gamma
// values passed straight to the (linear-output) renderer, like materials.js.
import * as THREE from 'three';
import { texture } from './materials.js';

const G = 9.81;
const MAXN = 4000;
const PLANE_SLAB = 0.25; // m below a collision plane still counted as touching it
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3();
const rnd = Math.random;
const dir3 = (m, v) => { const x = v.x, y = v.y, z = v.z; v.set(m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z); };
const lerp = (a, b, s) => a + (b - a) * s;

// ---- curve / gradient evaluation ---------------------------------------------------------------------------------
const samp = (a, t) => {
  const x = Math.min(1, Math.max(0, t)) * (a.length - 1), i = Math.min(a.length - 2, x | 0);
  return a.length < 2 ? a[0] : lerp(a[i], a[i + 1], x - i);
};
// number | [min, max] | {c, c2?} at normalised time t; r = the particle's random draw in 0..1
function cv(c, t, r) {
  if (typeof c === 'number') return c;
  if (Array.isArray(c)) return lerp(c[0], c[1], r);
  return c.c2 ? lerp(samp(c.c, t), samp(c.c2, t), r) : samp(c.c, t);
}
function gradAt(g, t, out) {
  const n = g.length;
  if (n === 1) { for (let k = 0; k < 4; k++) out[k] = g[0][k]; return out; }
  const x = Math.min(1, Math.max(0, t)) * (n - 1), i = Math.min(n - 2, x | 0), s = x - i;
  for (let k = 0; k < 4; k++) out[k] = lerp(g[i][k], g[i + 1][k], s);
  return out;
}
function startColor(c, t, r, out) {
  if (c.a) { for (let k = 0; k < 4; k++) out[k] = c.b ? lerp(c.a[k], c.b[k], r) : c.a[k]; return out; }
  if (c.r) return gradAt(c.r, r, out);
  gradAt(c.g, t, out);
  if (c.g2) { const o2 = gradAt(c.g2, t, [0, 0, 0, 0]); for (let k = 0; k < 4; k++) out[k] = lerp(out[k], o2[k], r); }
  return out;
}

// ---- shapes (Unity local axes) -----------------------------------------------------------------------------------
const D2R = Math.PI / 180;
function eulerRot(v, e) { // Unity Quaternion.Euler: Z, then X, then Y
  const [ax, ay, az] = [e[0] * D2R, e[1] * D2R, e[2] * D2R];
  let [x, y, z] = v, c = Math.cos(az), s = Math.sin(az);
  [x, y] = [x * c - y * s, x * s + y * c];
  c = Math.cos(ax); s = Math.sin(ax);
  [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(ay); s = Math.sin(ay);
  [x, z] = [x * c + z * s, -x * s + z * c];
  v[0] = x; v[1] = y; v[2] = z;
}
function unitRandom(o) {
  const z = rnd() * 2 - 1, p = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
  o[0] = r * Math.cos(p); o[1] = r * Math.sin(p); o[2] = z;
}
const P = [0, 0, 0], Dn = [0, 0, 1], U = [0, 0, 0];
function shape(s, pos, dir) {
  pos[0] = pos[1] = pos[2] = 0; dir[0] = dir[1] = 0; dir[2] = 1;
  if (!s) return;
  const r = s.r, th = s.thick;
  const frac = (e) => (1 - th) + th * e;
  const t = s.t, arc = s.arc * D2R;
  if (t === 0 || t === 1 || t === 2 || t === 3) {
    unitRandom(U);
    if (t >= 2 && U[2] < 0) U[2] = -U[2];
    const f = (t === 1 || t === 3) ? 1 : frac(Math.cbrt(rnd()));
    for (let k = 0; k < 3; k++) { pos[k] = U[k] * r * f; dir[k] = U[k]; }
  } else if (t === 4 || t === 7 || t === 8 || t === 9) {
    const ph = rnd() * arc, f = t === 7 || t === 9 ? 1 : frac(Math.sqrt(rnd()));
    const a = s.ang * D2R * f;
    pos[0] = Math.cos(ph) * r * f; pos[1] = Math.sin(ph) * r * f;
    if (t >= 8) pos[2] = rnd() * s.len;
    dir[0] = Math.sin(a) * Math.cos(ph); dir[1] = Math.sin(a) * Math.sin(ph); dir[2] = Math.cos(a);
  } else if (t === 10 || t === 11 || t === 17) {
    const ph = rnd() * arc, f = t === 11 ? 1 : frac(Math.sqrt(rnd()));
    dir[0] = Math.cos(ph); dir[1] = Math.sin(ph); dir[2] = 0;
    pos[0] = dir[0] * r * f; pos[1] = dir[1] * r * f;
  } else if (t === 12) {
    pos[0] = (rnd() * 2 - 1) * r;
  } else if (t === 5 || t === 15 || t === 16) {
    const b = s.box || [1, 1, 1];
    for (let k = 0; k < 3; k++) pos[k] = (rnd() - 0.5) * b[k];
  } else if (t === 18) {
    const b = s.scl || [1, 1, 1];
    pos[0] = (rnd() - 0.5) * b[0]; pos[1] = (rnd() - 0.5) * b[1];
    return finishShape(s, pos, dir);
  }
  if (s.scl && t !== 5) { pos[0] *= s.scl[0]; pos[1] *= s.scl[1]; pos[2] *= s.scl[2]; }
  finishShape(s, pos, dir);
}
function finishShape(s, pos, dir) {
  if (s.sph) { const l = Math.hypot(pos[0], pos[1], pos[2]) || 1; for (let k = 0; k < 3; k++) dir[k] = lerp(dir[k], pos[k] / l, s.sph); }
  if (s.rnd) { unitRandom(U); for (let k = 0; k < 3; k++) dir[k] = lerp(dir[k], U[k], s.rnd); const l = Math.hypot(dir[0], dir[1], dir[2]) || 1; for (let k = 0; k < 3; k++) dir[k] /= l; }
  if (s.rot) { eulerRot(pos, s.rot); eulerRot(dir, s.rot); }
  if (s.pos) for (let k = 0; k < 3; k++) pos[k] += s.pos[k];
}

// ---- rendering ---------------------------------------------------------------------------------------------------
const VERT = /* glsl */`
attribute vec3 iPos; attribute vec3 iVel; attribute vec4 iA; attribute vec4 iCol;
uniform vec2 uTiles; uniform vec4 uST; uniform float uLen; uniform float uVScale;
varying vec2 vUv; varying vec4 vCol;
void main() {
  float size = iA.x, rot = iA.y, frame = iA.z;
  float cs = cos(rot), sn = sin(rot);
  vec2 c = position.xy;
  vec2 rc = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs);
  vec4 mv;
#if MODE == 0
  mv = modelViewMatrix * vec4(iPos, 1.0);
  mv.xy += rc * size;
#elif MODE == 1
  mv = modelViewMatrix * vec4(iPos, 1.0);
  vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
  float sp = length(vv);
  vec2 d = length(vv.xy) > 1e-4 ? normalize(vv.xy) : vec2(0.0, 1.0);
  float len = size * uLen + sp * uVScale;
  mv.xy += d * (c.y * len) + vec2(d.y, -d.x) * (c.x * size);
#elif MODE == 2
  mv = modelViewMatrix * vec4(iPos + vec3(rc.x, 0.0, -rc.y) * size, 1.0);
#else
  vec3 q = position; float cm = cos(-rot), sm = sin(-rot);
  q.xy = vec2(q.x * cm - q.y * sm, q.x * sm + q.y * cm);
  mv = modelViewMatrix * vec4(iPos + q * size, 1.0);
#endif
  vec2 uv0 = uv;
  float col = mod(frame, uTiles.x), row = floor(frame / uTiles.x);
  vUv = ((uv0 + vec2(col, row)) / uTiles) * uST.xy + uST.zw;
  vCol = iCol;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */`
uniform sampler2D map; uniform vec4 uTint; uniform float uHasMap; uniform float uCut;
varying vec2 vUv; varying vec4 vCol;
void main() {
  vec4 t = uHasMap > 0.5 ? texture2D(map, vUv) : vec4(1.0);
  vec4 c = t * vCol * uTint;
  if (c.a < max(0.003, uCut)) discard;
  gl_FragColor = c;
}`;
const QUAD = { p: [-.5, -.5, 0, .5, -.5, 0, -.5, .5, 0, .5, .5, 0], uv: [0, 1, 1, 1, 0, 0, 1, 0], i: [0, 2, 1, 2, 3, 1] };

function buildGeometry(def, cap) {
  const mesh = def.rend.mesh && def.rend.mesh.p ? def.rend.mesh : QUAD;
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(mesh.p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(mesh.uv.length ? mesh.uv : new Array(mesh.p.length / 3 * 2).fill(0), 2));
  g.setIndex(mesh.i);
  const inst = (name, n) => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * n), n);
    a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute(name, a);
    return a;
  };
  g.attrs = { pos: inst('iPos', 3), vel: inst('iVel', 3), a: inst('iA', 4), col: inst('iCol', 4) };
  g.instanceCount = 0;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  return g;
}

const TVERT = /* glsl */`
attribute vec4 aTan; attribute vec2 aUv; attribute vec4 aCol;
uniform vec4 uST;
varying vec2 vUv; varying vec4 vCol;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 t = (modelViewMatrix * vec4(aTan.xyz, 0.0)).xyz;
  vec3 s = cross(t, normalize(-mv.xyz));
  float l = length(s);
  s = l > 1e-6 ? s / l : vec3(1.0, 0.0, 0.0);
  mv.xyz += s * aTan.w;
  vUv = aUv * uST.xy + uST.zw; vCol = aCol;
  gl_Position = projectionMatrix * mv;
}`;
const TK = 96; // ring size: trail points kept per particle

// Trail ribbon: camera-facing strip, one vertex pair per point, expanded in the vertex shader. Buffers grow on demand.
function buildTrail(def, texBase, pending) {
  const g = new THREE.BufferGeometry();
  const t = { g, cap: 0, idxCap: 0 };
  growTrail(t, 2048);
  const m = buildMaterial({ rend: def.trail.mat }, texBase, pending, TVERT);
  m.defines = {};
  t.mesh = new THREE.Mesh(g, m);
  t.mesh.frustumCulled = false; t.mesh.matrixAutoUpdate = false; t.mesh.visible = false;
  t.mesh.renderOrder = 10 + (def.rend.order || 0);
  return t;
}
function growTrail(t, verts) {
  const g = t.g;
  t.cap = verts; t.idxCap = verts * 3;
  const attr = (name, n) => { const a = new THREE.BufferAttribute(new Float32Array(verts * n), n); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, a); return a; };
  t.pos = attr('position', 3); t.tan = attr('aTan', 4); t.uv = attr('aUv', 2); t.col = attr('aCol', 4);
  const ix = new THREE.BufferAttribute(new Uint32Array(t.idxCap), 1); ix.setUsage(THREE.DynamicDrawUsage);
  g.setIndex(ix); t.ix = ix;
}

function buildMaterial(def, texBase, pending, vert) {
  const r = def.rend;
  const add = r.blend === 'add';
  const tiles = def.sheet ? [def.sheet.x, def.sheet.y] : [1, 1];
  let map = null;
  if (r.tex) { const e = texture(texBase, r.tex); map = e.tex; pending.push(e.full); }
  const tint = r.tint || [1, 1, 1, 1], k = r.x2 ? 2 : 1;
  const mode = r.mesh && r.mesh.p ? 4 : ({ 0: 0, 1: 1, 2: 2 }[r.mode] ?? 0);
  return new THREE.ShaderMaterial({
    defines: { MODE: mode },
    uniforms: {
      map: { value: map }, uHasMap: { value: map ? 1 : 0 },
      uTint: { value: new THREE.Vector4(tint[0] * k, tint[1] * k, tint[2] * k, tint[3] * k) },
      uTiles: { value: new THREE.Vector2(...tiles) }, uST: { value: new THREE.Vector4(...(r.st || [1, 1, 0, 0])) },
      uCut: { value: r.cut || 0 }, uLen: { value: r.len || 0 }, uVScale: { value: r.vscale || 0 },
    },
    vertexShader: vert || VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false,
  });
}

// ---- emitter -----------------------------------------------------------------------------------------------------
function chainVisible(o) {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
}

export class Particles {
  constructor(defs, { texBase = 'art/tex' } = {}) {
    this.defs = defs;
    this.alias = defs._alias || {};
    this.texBase = texBase;
    this.root = new THREE.Group();
    this.root.name = 'Particles';
    this.root.matrixAutoUpdate = false;
    this.list = [];
    this.pending = [];
    this.spawns = [];
    this.time = 0;
    this.planes = []; // collision planes, three world space: [nx, ny, nz, d]; a particle stays on the n.p >= d side
  }

  resolve(key) { return this.defs[key] ? key : this.alias[key]; }

  // Emitter for defs[key] following object3D (its world matrix, times def.xf for a prefab child).
  attach(object3D, key, { auto = true } = {}) {
    const def = this.defs[this.resolve(key)];
    if (!def) throw new Error(`particle system "${key}" not found`);
    const cap = Math.min(MAXN, Math.max(16, def.max));
    const e = {
      key, def, obj: object3D, auto, cap, n: 0, t: 0, prevT: -1, playing: false, emitting: false, acc: 0, vis: false,
      world: def.space === 1, W: new THREE.Matrix4(), Wi: new THREE.Matrix3(), last: new THREE.Vector3(), hasLast: false,
      sc: 1, bst: new Float32Array(def.bursts ? def.bursts.length : 0),
      x: new Float32Array(cap * 3), v: new Float32Array(cap * 3), age: new Float32Array(cap), life: new Float32Array(cap),
      size: new Float32Array(cap), rot: new Float32Array(cap), rv: new Float32Array(cap), rd: new Float32Array(cap * 3),
      col: new Float32Array(cap * 4), frame: new Float32Array(cap),
    };
    e.xf = def.xf ? new THREE.Matrix4().compose(new THREE.Vector3(...def.xf.t), new THREE.Quaternion(...def.xf.q), new THREE.Vector3(...def.xf.s)) : null;
    e.wInv = new THREE.Matrix4(); e.ev = new THREE.Vector3(); e.lastW = new THREE.Vector3(); e.hasW = false; e.tnow = 0;
    if (def.trail) {
      e.T = { pts: new Float32Array(cap * TK * 3), tm: new Float32Array(cap * TK), n: new Uint16Array(cap), s: new Uint16Array(cap), on: new Uint8Array(cap), ...buildTrail(def, this.texBase, this.pending) };
      e.T.mesh.name = `fx trail ${key}`;
      this.root.add(e.T.mesh);
    }
    e.geom = buildGeometry(def, cap);
    e.mat = buildMaterial(def, this.texBase, this.pending);
    e.mesh = new THREE.Mesh(e.geom, e.mat);
    e.mesh.frustumCulled = false;
    e.mesh.matrixAutoUpdate = false;
    e.mesh.visible = false;
    e.mesh.renderOrder = 10 + (def.rend.order || 0);
    e.mesh.name = `fx ${key}`;
    this.root.add(e.mesh);
    this.list.push(e);
    (object3D.userData.fx ||= []).push(e);
    return e;
  }

  // All emitters of a prefab (root key or alias), attached to one object3D.
  attachPrefab(object3D, key, opts) {
    const root = this.resolve(key);
    if (!root) throw new Error(`particle prefab "${key}" not found`);
    // root first: equal-depth emitters draw in creation order, and the root is the backdrop of its children
    return Object.keys(this.defs).filter(k => k === root || k.startsWith(`${root}/`)).sort((a, b) => (b === root) - (a === root)).map(k => this.attach(object3D, k, opts));
  }

  // Emitters attached to an object (deep: its descendants' too).
  at(obj, deep = false) {
    const out = [...(obj.userData.fx || [])];
    if (deep) obj.traverse(o => { if (o !== obj && o.userData.fx) out.push(...o.userData.fx); });
    return out;
  }

  // One-shot prefab effect at a world position (and orientation); removes itself when every particle has died.
  spawn(key, { position, quaternion, scale, parent = this.root, play = true } = {}) {
    const holder = new THREE.Object3D();
    if (position) holder.position.copy(position);
    if (quaternion) holder.quaternion.copy(quaternion);
    if (scale) holder.scale.copy(scale);
    parent.add(holder);
    const list = this.attachPrefab(holder, key, { auto: false });
    if (play) this.play(list);
    const fx = { obj: holder, list, once: true };
    this.spawns.push(fx);
    return fx;
  }

  _w(e) {
    e.obj.updateWorldMatrix(true, false);
    e.W.copy(e.obj.matrixWorld);
    if (e.xf) e.W.multiply(e.xf);
    e.W.decompose(tmpV, tmpQ, tmpS);
    e.wInv.copy(e.W).invert();
    e.Wi.setFromMatrix4(e.wInv);
    const hier = e.def.sm === 0;
    e.sc = hier ? (Math.abs(tmpS.x) + Math.abs(tmpS.y) + Math.abs(tmpS.z)) / 3
      : (Math.abs(e.obj.scale.x) + Math.abs(e.obj.scale.y) + Math.abs(e.obj.scale.z)) / 3 * (e.def.xf ? (e.def.xf.s[0] + e.def.xf.s[1] + e.def.xf.s[2]) / 3 : 1);
  }

  play(e) {
    if (Array.isArray(e)) { e.forEach(x => this.play(x)); return e; }
    if (e.once) { this.play(e.list); return e; }
    this._w(e);
    e.playing = e.emitting = true;
    e.t = -cv(e.def.delay || 0, 0, rnd());
    e.prevT = e.t - 1e-6;
    e.acc = 0;
    e.bst.fill(0);
    e.hasLast = false; e.hasW = false; e.ev.set(0, 0, 0);
    e.n = 0;
    if (e.def.pre && e.def.loop) {
      const span = Math.max(cv(e.def.life, 0, 1), 1), dt = Math.max(span / 80, 1 / 30);
      for (let t = 0; t < span; t += dt) this._step(e, dt, true);
    }
    return e;
  }

  stop(e) {
    if (Array.isArray(e)) { e.forEach(x => this.stop(x)); return e; }
    if (e.once) { this.stop(e.list); return e; }
    e.emitting = false;
    return e;
  }

  clear(e) {
    if (Array.isArray(e)) { e.forEach(x => this.clear(x)); return; }
    e.n = 0; e.playing = e.emitting = false; e.geom.instanceCount = 0; e.mesh.visible = false;
    if (e.T) e.T.mesh.visible = false;
  }

  // Emit n particles now (default: the sum of the system's configured bursts, else 10).
  burst(e, n) {
    if (Array.isArray(e)) { e.forEach(x => this.burst(x, n)); return e; }
    if (e.once) { this.burst(e.list, n); return e; }
    this._w(e);
    if (n == null) n = e.def.bursts ? e.def.bursts.reduce((s, b) => s + cv(b[1], 0, 0.5) * b[2], 0) : 10;
    this._emit(e, n | 0, Math.max(0, e.t) / e.def.dur);
    e.playing = true;
    return e;
  }

  dispose(e) {
    this.root.remove(e.mesh);
    e.geom.dispose(); e.mat.dispose();
    if (e.T) { this.root.remove(e.T.mesh); e.T.g.dispose(); e.T.mesh.material.dispose(); }
    this.list.splice(this.list.indexOf(e), 1);
    const a = e.obj.userData.fx;
    if (a) a.splice(a.indexOf(e), 1);
  }

  _emit(e, count, tn) {
    const d = e.def, W = e.W.elements, s = d.shape;
    for (let c = 0; c < count && e.n < e.cap; c++) {
      const i = e.n++;
      const rl = rnd(), rs = rnd(), rz = rnd();
      shape(s, P, Dn);
      let speed = cv(d.speed, tn, rs);
      let px = P[0], py = P[1], pz = -P[2];
      let vx = Dn[0] * speed, vy = Dn[1] * speed, vz = -Dn[2] * speed;
      if (e.world) { // sim space = three world
        const x = W[0] * px + W[4] * py + W[8] * pz + W[12], y = W[1] * px + W[5] * py + W[9] * pz + W[13], z = W[2] * px + W[6] * py + W[10] * pz + W[14];
        const ux = W[0] * vx + W[4] * vy + W[8] * vz, uy = W[1] * vx + W[5] * vy + W[9] * vz, uz = W[2] * vx + W[6] * vy + W[10] * vz;
        px = x; py = y; pz = z; vx = ux; vy = uy; vz = uz;
      }
      if (e.world && d.inherit && d.inherit.mode === 0) { // InheritVelocity "Initial": the emitter's velocity at birth
        const k = cv(d.inherit.k, tn, rnd());
        vx += e.ev.x * k; vy += e.ev.y * k; vz += e.ev.z * k;
      }
      e.x[i * 3] = px; e.x[i * 3 + 1] = py; e.x[i * 3 + 2] = pz;
      e.v[i * 3] = vx; e.v[i * 3 + 1] = vy; e.v[i * 3 + 2] = vz;
      e.age[i] = 0;
      e.life[i] = Math.max(0.01, cv(d.life, tn, rl));
      e.size[i] = cv(d.size, tn, rnd());
      e.rot[i] = d.rot != null ? cv(d.rot, tn, rnd()) : 0;
      e.rv[i] = rnd();
      e.rd[i * 3] = rnd(); e.rd[i * 3 + 1] = rnd(); e.rd[i * 3 + 2] = rnd();
      startColor(d.color, tn, rnd(), this._c || (this._c = [0, 0, 0, 0]));
      for (let k = 0; k < 4; k++) e.col[i * 4 + k] = this._c[k];
      e.frame[i] = d.sheet ? rnd() : 0;
      if (e.T) { e.T.n[i] = 0; e.T.s[i] = 0; e.T.on[i] = rnd() < d.trail.ratio ? 1 : 0; }
    }
  }

  _bursts(e, a, b) { // bursts whose time falls in (a, b]
    const d = e.def;
    if (!d.bursts) return;
    d.bursts.forEach(([bt, cnt, cycles, every, prob]) => {
      for (let k = 0; k < Math.max(1, cycles); k++) {
        const tt = bt + k * every;
        if (tt > a && tt <= b && rnd() <= prob) this._emit(e, cv(cnt, tt / d.dur, rnd()) | 0, tt / d.dur);
        if (cycles <= 1) break;
      }
    });
  }

  _step(e, dt, prewarm = false) {
    const d = e.def;
    dt *= d.simspd || 1;
    e.tnow += dt;
    const dur = d.dur;
    if (e.emitting) {
      const a = e.t;
      e.t += dt;
      const t0 = Math.max(a, 0);
      const rate = d.rate == null ? 0 : cv(d.rate, Math.min(1, Math.max(0, e.t) / dur), rnd());
      if (e.t > 0) {
        e.acc += rate * (e.t - t0);
        const n = e.acc | 0;
        e.acc -= n;
        if (n) this._emit(e, n, Math.min(1, e.t / dur));
      }
      if (e.t >= dur) {
        this._bursts(e, e.prevT, dur);
        if (d.loop) { e.t -= dur; e.prevT = -1e-6; this._bursts(e, e.prevT, e.t); } else e.emitting = false;
      } else this._bursts(e, e.prevT, e.t);
      if (e.t < dur) e.prevT = e.t;
      if (d.rateDist) {
        tmpV.setFromMatrixPosition(e.W);
        if (e.hasLast) { e.acc2 = (e.acc2 || 0) + tmpV.distanceTo(e.last) * cv(d.rateDist, 0, rnd()); const n = e.acc2 | 0; e.acc2 -= n; if (n) this._emit(e, n, e.t / dur); }
        e.last.copy(tmpV); e.hasLast = true;
      }
    }
    // gravity in sim space
    const g = d.grav ? cv(d.grav, 0, 0.5) * G : 0;
    let gx = 0, gy = -g, gz = 0;
    if (!e.world && g) { const m = e.Wi.elements; gx = m[1] * -g; gy = m[4] * -g; gz = m[7] * -g; }
    const vo = d.vel, fo = d.force, cl = d.clamp, nz = d.noise;
    const wi = e.Wi.elements, col = d.col && d.col.type === 1;
    const ih1 = e.world && d.inherit && d.inherit.mode === 1 ? cv(d.inherit.k, 0, 0.5) : 0;
    for (let i = 0; i < e.n; i++) {
      e.age[i] += dt;
      if (e.age[i] >= e.life[i]) { // swap-remove
        const j = --e.n;
        if (i !== j) {
          e.x.copyWithin(i * 3, j * 3, j * 3 + 3); e.v.copyWithin(i * 3, j * 3, j * 3 + 3); e.rd.copyWithin(i * 3, j * 3, j * 3 + 3);
          e.col.copyWithin(i * 4, j * 4, j * 4 + 4);
          for (const k of ['age', 'life', 'size', 'rot', 'rv', 'frame']) e[k][i] = e[k][j];
          if (e.T) {
            const T = e.T;
            T.n[i] = T.n[j]; T.s[i] = T.s[j]; T.on[i] = T.on[j];
            T.pts.copyWithin(i * TK * 3, j * TK * 3, (j + 1) * TK * 3); T.tm.copyWithin(i * TK, j * TK, (j + 1) * TK);
          }
        }
        i--;
        continue;
      }
      const tl = e.age[i] / e.life[i], r = e.rv[i];
      const i3 = i * 3;
      let vx = e.v[i3], vy = e.v[i3 + 1], vz = e.v[i3 + 2];
      vx += gx * dt; vy += gy * dt; vz += gz * dt;
      if (fo) { vx += cv(fo.x, tl, r) * dt; vy += cv(fo.y, tl, r) * dt; vz -= cv(fo.z, tl, r) * dt; }
      if (cl) {
        const drag = cv(cl.drag, tl, r);
        if (drag) { const f = Math.max(0, 1 - drag * dt); vx *= f; vy *= f; vz *= f; }
        const mag = cv(cl.mag, tl, r), sp = Math.hypot(vx, vy, vz);
        if (mag && sp > mag) { // speed limit, pulled toward it by `damp` per 1/60 s
          const f = 1 + (mag / sp - 1) * (1 - Math.pow(1 - cl.damp, dt * 60));
          vx *= f; vy *= f; vz *= f;
        }
      }
      e.v[i3] = vx; e.v[i3 + 1] = vy; e.v[i3 + 2] = vz;
      let ex = 0, ey = 0, ez = 0;
      if (vo) {
        const x = cv(vo.x, tl, r), y = cv(vo.y, tl, r), z = -cv(vo.z, tl, r);
        if (vo.world && !e.world) { ex = wi[0] * x + wi[3] * y + wi[6] * z; ey = wi[1] * x + wi[4] * y + wi[7] * z; ez = wi[2] * x + wi[5] * y + wi[8] * z; } else { ex = x; ey = y; ez = z; }
      }
      if (nz) {
        const s = cv(nz.str, tl, r) * (cv(nz.pos, tl, r) || 1), f = nz.freq, ph = e.rd[i3] * 40 + this.time * (cv(nz.scroll, tl, r) || 0.5) * 2;
        ex += Math.sin(ph * f * 2 + e.rd[i3 + 1] * 9) * s; ey += Math.sin(ph * f * 2.3 + e.rd[i3 + 2] * 9) * s; ez += Math.sin(ph * f * 1.7 + e.rd[i3] * 9) * s;
      }
      if (ih1) { ex += e.ev.x * ih1; ey += e.ev.y * ih1; ez += e.ev.z * ih1; } // InheritVelocity "Current"
      e.x[i3] += (vx + ex) * dt; e.x[i3 + 1] += (vy + ey) * dt; e.x[i3 + 2] += (vz + ez) * dt;
      if (col && this.planes.length) this._collide(e, i, tl, r);
      if (d.rotOL != null) e.rot[i] += cv(d.rotOL, tl, r) * dt;
      if (e.T && e.T.on[i]) this._trailPush(e, i, tl, r);
    }
    if (!e.emitting && e.n === 0) e.playing = false;
  }

  // Collision module (type World) against this.planes. A killed particle (kill speed, lifetime loss) is culled by the next pass.
  _collide(e, i, tl, r) {
    const c = e.def.col, i3 = i * 3, loc = !e.world;
    tmpV.set(e.x[i3], e.x[i3 + 1], e.x[i3 + 2]);
    tmpS.set(e.v[i3], e.v[i3 + 1], e.v[i3 + 2]);
    if (loc) { tmpV.applyMatrix4(e.W); dir3(e.W.elements, tmpS); }
    const rad = e.size[i] * (e.def.sizeOL != null ? cv(e.def.sizeOL, tl, r) : 1) * e.sc * 0.5 * c.rs;
    let hit = false, speed = 0;
    for (const pl of this.planes) {
      const dist = pl[0] * tmpV.x + pl[1] * tmpV.y + pl[2] * tmpV.z - pl[3] - rad, vn = pl[0] * tmpS.x + pl[1] * tmpS.y + pl[2] * tmpS.z;
      // not touching, already leaving, or born well below (the room floor under the tank's sand plane): a plane is a one-frame slab
      if (dist >= 0 || vn >= 0 || dist < -PLANE_SLAB) continue;
      speed = tmpS.length();
      const bounce = Math.min(1, Math.max(0, cv(c.bounce, tl, r))), damp = Math.min(1, Math.max(0, cv(c.damp, tl, r)));
      // normal component reflected and scaled by bounce, tangent kept, everything scaled by 1 - dampen
      tmpS.x -= pl[0] * vn * (1 + bounce); tmpS.y -= pl[1] * vn * (1 + bounce); tmpS.z -= pl[2] * vn * (1 + bounce);
      tmpS.multiplyScalar(1 - damp);
      tmpV.x -= pl[0] * dist; tmpV.y -= pl[1] * dist; tmpV.z -= pl[2] * dist;
      hit = true;
    }
    if (!hit) return;
    e.age[i] += cv(c.loss, tl, r) * e.life[i]; // "Lifetime loss"
    if (speed < c.kmin || speed > c.kmax) e.age[i] = e.life[i];
    if (loc) { tmpV.applyMatrix4(e.wInv); dir3(e.wInv.elements, tmpS); }
    e.x[i3] = tmpV.x; e.x[i3 + 1] = tmpV.y; e.x[i3 + 2] = tmpV.z;
    e.v[i3] = tmpS.x; e.v[i3 + 1] = tmpS.y; e.v[i3 + 2] = tmpS.z;
  }

  // Trail point source: the particle position in the trail's space (world, or the emitter's local space).
  _tpos(e, i, out) {
    out.set(e.x[i * 3], e.x[i * 3 + 1], e.x[i * 3 + 2]);
    if (!e.world && e.def.trail.world) out.applyMatrix4(e.W);
    return out;
  }

  _trailPush(e, i, tl, r) {
    const T = e.T, tr = e.def.trail, K = TK, k3 = i * K * 3, kk = i * K;
    const life = Math.max(0.001, cv(tr.life, tl, r)) * e.life[i] * (tr.sizeL ? e.size[i] : 1);
    while (T.n[i] > 0 && e.tnow - T.tm[kk + T.s[i]] > life) { T.s[i] = (T.s[i] + 1) % K; T.n[i]--; }
    this._tpos(e, i, tmpV);
    let add = T.n[i] === 0;
    if (!add) {
      const l3 = k3 + ((T.s[i] + T.n[i] - 1) % K) * 3;
      add = Math.hypot(tmpV.x - T.pts[l3], tmpV.y - T.pts[l3 + 1], tmpV.z - T.pts[l3 + 2]) >= tr.minDist;
    }
    if (!add) return;
    if (T.n[i] === K) { T.s[i] = (T.s[i] + 1) % K; T.n[i]--; }
    const slot = (T.s[i] + T.n[i]) % K;
    T.pts[k3 + slot * 3] = tmpV.x; T.pts[k3 + slot * 3 + 1] = tmpV.y; T.pts[k3 + slot * 3 + 2] = tmpV.z;
    T.tm[kk + slot] = e.tnow;
    T.n[i]++;
  }

  // Rebuild the ribbons: point 0 is the live head at the particle, then the stored points newest -> oldest. Width and colour run
  // head (0) to tail (1) by point age over the trail lifetime (inferred: Unity may use the length along the ribbon).
  _writeTrails(e) {
    const T = e.T, tr = e.def.trail, d = e.def, K = TK;
    let need = 0;
    for (let i = 0; i < e.n; i++) if (T.on[i] && T.n[i] > 0) need += (T.n[i] + 1) * 2;
    if (need > T.cap) growTrail(T, Math.max(need, T.cap * 2));
    const pos = T.pos.array, tan = T.tan.array, uv = T.uv.array, col = T.col.array, ix = T.ix.array;
    const pr = this._tp || (this._tp = new Float32Array(3 * (TK + 1))), ag = this._ta || (this._ta = new Float32Array(TK + 1)), cd = this._tc || (this._tc = new Float32Array(TK + 1));
    const bc = [0, 0, 0, 0], lc = [1, 1, 1, 1], tc = [1, 1, 1, 1];
    let vtx = 0, nix = 0;
    for (let i = 0; i < e.n; i++) {
      const n = T.n[i];
      if (!T.on[i] || n < 1) continue;
      const tl = e.age[i] / e.life[i], r = e.rv[i], m = n + 1;
      const life = Math.max(0.001, cv(tr.life, tl, r)) * e.life[i] * (tr.sizeL ? e.size[i] : 1);
      this._tpos(e, i, tmpV);
      pr[0] = tmpV.x; pr[1] = tmpV.y; pr[2] = tmpV.z; ag[0] = 0;
      for (let j = 0; j < n; j++) { // j = 0 oldest stored -> index n
        const slot = (T.s[i] + j) % K, o = (i * K + slot) * 3, q = n - j;
        pr[q * 3] = T.pts[o]; pr[q * 3 + 1] = T.pts[o + 1]; pr[q * 3 + 2] = T.pts[o + 2];
        ag[q] = e.tnow - T.tm[i * K + slot];
      }
      cd[0] = 0;
      for (let j = 1; j < m; j++) cd[j] = cd[j - 1] + Math.hypot(pr[j * 3] - pr[j * 3 - 3], pr[j * 3 + 1] - pr[j * 3 - 2], pr[j * 3 + 2] - pr[j * 3 - 1]);
      const total = cd[m - 1] || 1;
      if (tr.inhCol) {
        for (let k = 0; k < 4; k++) bc[k] = e.col[i * 4 + k];
        if (d.colorOL) { gradAt(d.colorOL.g, tl, lc); for (let k = 0; k < 4; k++) bc[k] *= lc[k]; }
      } else bc[0] = bc[1] = bc[2] = bc[3] = 1;
      gradAt(tr.colLife.g, tl, lc);
      const sz = tr.sizeW ? e.size[i] * (d.sizeOL != null ? cv(d.sizeOL, tl, r) : 1) * e.sc : 1;
      const base = vtx;
      for (let j = 0; j < m; j++) {
        const a = j > 0 ? j - 1 : 0, b = j < m - 1 ? j + 1 : j;
        let tx = pr[a * 3] - pr[b * 3], ty = pr[a * 3 + 1] - pr[b * 3 + 1], tz = pr[a * 3 + 2] - pr[b * 3 + 2];
        const tl2 = Math.hypot(tx, ty, tz) || 1; tx /= tl2; ty /= tl2; tz /= tl2;
        const tt = Math.min(1, ag[j] / life);
        const hw = 0.5 * cv(tr.width, tt, r) * sz;
        gradAt(tr.colTrail.g, tt, tc);
        const u = tr.texMode === 0 ? cd[j] / total : tr.texMode === 1 ? cd[j] * tr.texScale[0] : j * tr.texScale[0];
        for (let s = 0; s < 2; s++, vtx++) {
          const v3 = vtx * 3, v4 = vtx * 4;
          pos[v3] = pr[j * 3]; pos[v3 + 1] = pr[j * 3 + 1]; pos[v3 + 2] = pr[j * 3 + 2];
          tan[v4] = tx; tan[v4 + 1] = ty; tan[v4 + 2] = tz; tan[v4 + 3] = s ? hw : -hw;
          uv[vtx * 2] = u; uv[vtx * 2 + 1] = s * tr.texScale[1];
          for (let k = 0; k < 4; k++) col[v4 + k] = bc[k] * lc[k] * tc[k];
        }
        if (j < m - 1) {
          const q = base + j * 2;
          ix[nix++] = q; ix[nix++] = q + 1; ix[nix++] = q + 2; ix[nix++] = q + 1; ix[nix++] = q + 3; ix[nix++] = q + 2;
        }
      }
    }
    T.pos.needsUpdate = T.tan.needsUpdate = T.uv.needsUpdate = T.col.needsUpdate = T.ix.needsUpdate = true;
    T.g.setDrawRange(0, nix);
    T.mesh.visible = nix > 0;
    if (nix) {
      if (e.world || tr.world) T.mesh.matrix.identity(); else T.mesh.matrix.copy(e.W);
      T.mesh.matrixWorld.copy(T.mesh.matrix);
    }
  }

  // Emitter velocity (world sim space, for InheritVelocity), from the world position of the last two updates.
  _ev(e, dt) {
    tmpV.setFromMatrixPosition(e.W);
    if (e.hasW && dt > 0) e.ev.copy(tmpV).sub(e.lastW).divideScalar(dt); else e.ev.set(0, 0, 0);
    e.lastW.copy(tmpV); e.hasW = true;
  }

  _write(e) {
    const d = e.def, a = e.geom.attrs, sh = d.sheet, c = [0, 0, 0, 0];
    const total = sh ? (sh.anim === 1 ? sh.x : sh.x * sh.y) : 1;
    for (let i = 0; i < e.n; i++) {
      const tl = e.age[i] / e.life[i], r = e.rv[i], i3 = i * 3, i4 = i * 4;
      a.pos.array[i3] = e.x[i3]; a.pos.array[i3 + 1] = e.x[i3 + 1]; a.pos.array[i3 + 2] = e.x[i3 + 2];
      a.vel.array[i3] = e.v[i3]; a.vel.array[i3 + 1] = e.v[i3 + 1]; a.vel.array[i3 + 2] = e.v[i3 + 2];
      let sz = e.size[i] * (d.sizeOL != null ? cv(d.sizeOL, tl, r) : 1) * e.sc;
      a.a.array[i4] = Math.max(0, sz);
      a.a.array[i4 + 1] = e.rot[i];
      let f = 0;
      if (sh) {
        f = Math.floor((cv(sh.start, 0, e.frame[i]) + cv(sh.frame, tl, r) * sh.cycles) * total) % total;
        if (sh.anim === 1) f += (sh.rowMode === 1 ? Math.floor(e.frame[i] * sh.y) : sh.row) * sh.x;
      }
      a.a.array[i4 + 2] = f;
      if (d.colorOL) gradAt(d.colorOL.g, tl, c); else c[0] = c[1] = c[2] = c[3] = 1;
      for (let k = 0; k < 4; k++) a.col.array[i4 + k] = e.col[i4 + k] * c[k];
    }
    for (const k in a) a[k].needsUpdate = true;
    e.geom.instanceCount = e.n;
  }

  update(dt) {
    dt = Math.min(0.1, dt);
    this.time += dt;
    for (const e of this.list.slice()) {
      const vis = chainVisible(e.obj);
      if (vis !== e.vis) {
        e.vis = vis;
        if (!vis) this.clear(e);
        else if (e.auto && e.def.awake) this.play(e);
      }
      if (!vis || (!e.playing && e.n === 0)) { e.mesh.visible = false; if (e.T) e.T.mesh.visible = false; continue; }
      this._w(e);
      if (e.world && e.def.inherit) this._ev(e, dt);
      this._step(e, dt);
      if (e.T) this._writeTrails(e);
      e.mesh.visible = e.n > 0 && !e.def.rend.off;
      if (e.mesh.visible) {
        this._write(e);
        if (e.world) e.mesh.matrix.identity(); else e.mesh.matrix.copy(e.W);
        e.mesh.matrixWorld.copy(e.mesh.matrix);
      }
    }
    if (this.spawns.length) this._reap();
  }

  // One-shot spawns that finished are removed (and their GPU buffers freed) at the end of update().
  _reap() {
    this.spawns = this.spawns.filter(fx => {
      if (!fx.list.every(e => !e.playing && e.n === 0)) return true;
      fx.list.forEach(e => this.dispose(e));
      if (fx.obj.parent) fx.obj.parent.remove(fx.obj);
      return false;
    });
  }
}

// Attach every scene system of particles.json to its node (stage.find(path)); returns the emitters. Adds fx.root to the scene.
export function autoAttach(stage, fx) {
  if (!fx.root.parent) stage.scene.add(fx.root);
  // Collision stand-in: the top of the tank sand is the only plane (Unity collided with every scene collider).
  const sand = stage.find('*****FISHENV*****/Aquarium/AquariumSand');
  if (sand) { sand.updateWorldMatrix(true, true); fx.planes = [[0, 1, 0, new THREE.Box3().setFromObject(sand).max.y]]; }
  const out = [];
  for (const key of Object.keys(fx.defs)) {
    const m = /^(env|player):(.*?)(#\d+)?$/.exec(key);
    if (!m) continue;
    const obj = stage.find(m[2]);
    if (obj && !m[3]) out.push(fx.attach(obj, key));
  }
  return out;
}
