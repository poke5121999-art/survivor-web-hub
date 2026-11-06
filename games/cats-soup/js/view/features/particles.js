// Feature "particles" (view part). Contract: js/view/registry.js. Data: data/particles.json (tools/export_particles.py),
// the Unity ParticleSystem + ParticleSystemRenderer of every main-forest facility prefab (places/placeN, lamp/lamp0).
// A small CPU simulation (main, emission + bursts, shape, velocity / force / size / rotation / colour over lifetime,
// texture sheet animation) feeds one THREE.InstancedBufferGeometry quad batch per system; the shader billboards the
// quads on the camera in the same gamma-space convention as js/view/shaders.js (textures raw, ambient x2 for the
// "Ambient" shaders). Systems attach in onWork(entry) to the node of entry.obj with the exported index, follow its world
// matrix, are skipped while any ancestor is hidden or the emitter is off screen, and share one live-particle budget.
// Left out (exported and noted by the exporter, not simulated): noise, collision, sub-emitters, trails, lights, orbital /
// radial velocity, rate over distance, inherit velocity, "by speed" modules.
import * as THREE from 'three';
import { env } from '../shaders.js';

const TOTAL_CAP = 1500;        // live particles over all systems
const SYS_CAP = 160;           // per system
const GRAV = 9.81;
const BLEND = [THREE.ZeroFactor, THREE.OneFactor, THREE.DstColorFactor, THREE.SrcColorFactor, THREE.OneMinusDstColorFactor,
  THREE.SrcAlphaFactor, THREE.OneMinusSrcColorFactor, THREE.DstAlphaFactor, THREE.OneMinusDstAlphaFactor,
  THREE.SrcAlphaSaturateFactor, THREE.OneMinusSrcAlphaFactor];

// ---- curves ----
function hermite(a, b, t) {
  const dt = b[0] - a[0];
  if (dt <= 0) return b[1];
  if (Math.abs(a[3]) > 1e8 || Math.abs(b[2]) > 1e8) return a[1];
  const u = (t - a[0]) / dt, u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * a[1] + (u3 - 2 * u2 + u) * a[3] * dt + (-2 * u3 + 3 * u2) * b[1] + (u3 - u2) * b[2] * dt;
}
function keyLut(keys, n = 40) {
  const out = new Float32Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let v;
    if (!keys.length) v = 0;
    else if (t <= keys[0][0]) v = keys[0][1];
    else if (t >= keys[keys.length - 1][0]) v = keys[keys.length - 1][1];
    else {
      let k = 0;
      while (keys[k + 1][0] < t) k++;
      v = hermite(keys[k], keys[k + 1], t);
    }
    out[i] = v;
  }
  return out;
}
const lutAt = (l, t) => {
  const f = Math.min(1, Math.max(0, t)) * (l.length - 1), i = Math.min(l.length - 2, Math.floor(f));
  return l[i] + (l[i + 1] - l[i]) * (f - i);
};
// MinMaxCurve -> (t, rnd) => value
export function curve(c) {
  if (typeof c === 'number') return () => c;
  if (c.r) return (t, r) => c.r[0] + (c.r[1] - c.r[0]) * r;
  const a = keyLut(c.c), m = c.m;
  if (!c.c2) return t => lutAt(a, t) * m;
  const b = keyLut(c.c2);
  return (t, r) => { const x = lutAt(a, t); return (x + (lutAt(b, t) - x) * r) * m; };
}
const avg = c => (typeof c === 'number' ? c : c.r ? (c.r[0] + c.r[1]) / 2 : Math.max(...keyLut(c.c || c.c2).map(Math.abs)) * c.m);
const maxOf = c => (typeof c === 'number' ? c : c.r ? Math.max(c.r[0], c.r[1]) : Math.max(...keyLut(c.c), ...(c.c2 ? keyLut(c.c2) : [0])) * c.m);

function gradFn(g) {
  const ck = g.c, ak = g.a;
  const at = (keys, t, k) => {
    if (t <= keys[0][0]) return keys[0][k];
    for (let i = 1; i < keys.length; i++) {
      if (t <= keys[i][0]) { const a = keys[i - 1], b = keys[i], u = (t - a[0]) / Math.max(1e-6, b[0] - a[0]); return a[k] + (b[k] - a[k]) * u; }
    }
    return keys[keys.length - 1][k];
  };
  return (t, out) => {
    out[0] = at(ck, t, 1); out[1] = at(ck, t, 2); out[2] = at(ck, t, 3); out[3] = at(ak, t, 1);
  };
}
// MinMaxGradient -> (t, rnd, out[4])
export function colorFn(c) {
  if (c.m === 0) return (t, r, o) => { o[0] = c.c[0]; o[1] = c.c[1]; o[2] = c.c[2]; o[3] = c.c[3]; };
  if (c.m === 2) return (t, r, o) => { for (let i = 0; i < 4; i++) o[i] = c.c[i] + (c.c2[i] - c.c[i]) * r; };
  const a = gradFn(c.g);
  if (c.m === 1) return (t, r, o) => a(t, o);
  if (c.m === 4) return (t, r, o) => a(r, o);
  const b = gradFn(c.g2), tmp = [0, 0, 0, 0];
  return (t, r, o) => { a(t, o); b(t, tmp); for (let i = 0; i < 4; i++) o[i] = tmp[i] + (o[i] - tmp[i]) * r; };
}

// ---- textures ----
const texLoader = new THREE.TextureLoader();
const texCache = new Map();
let softDot = null;
function dotTexture() {
  if (softDot) return softDot;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  softDot = new THREE.CanvasTexture(c);
  softDot.colorSpace = THREE.NoColorSpace;
  return softDot;
}
function texture(base, t) {
  if (!t) return dotTexture();
  if (!texCache.has(t.name)) {
    const x = texLoader.load(`${base}/art/particles/${t.name}.webp`);
    x.colorSpace = THREE.NoColorSpace;
    x.generateMipmaps = false;
    x.minFilter = THREE.LinearFilter;
    texCache.set(t.name, x);
  }
  return texCache.get(t.name);
}

const quad = new THREE.InstancedBufferGeometry();
quad.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
quad.setIndex([0, 1, 2, 0, 2, 3]);

const VERT = `
  attribute vec4 iPos;
  attribute vec4 iSize;
  attribute vec4 iColor;
  attribute vec2 iUv;
  uniform int mode;
  varying vec2 vUv;
  varying vec4 vColor;
  void main() {
    float c = cos(iPos.w), s = sin(iPos.w);
    vec2 q = position.xy;
    vec2 r = vec2(q.x * c - q.y * s, q.x * s + q.y * c) * iSize.xy;
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    if (mode == 2) { right = vec3(1.0, 0.0, 0.0); up = vec3(0.0, 0.0, -1.0); }
    else if (mode == 3) { up = vec3(0.0, 1.0, 0.0); }
    vec3 w = iPos.xyz + right * r.x + up * r.y;
    gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
    vUv = iSize.zw + (position.xy + 0.5) * iUv;
    vColor = iColor;
  }`;
const FRAG = `
  uniform sampler2D map;
  uniform vec4 tint;
  uniform vec4 ambient;
  uniform float ambientFactor;
  varying vec2 vUv;
  varying vec4 vColor;
  void main() {
    vec4 c = texture2D(map, vUv) * vColor * tint;
    vec3 a = ambient.rgb * ambientFactor * 2.0 + vec3(1.0 - ambientFactor);
    gl_FragColor = vec4(c.rgb * a, c.a);
  }`;

// ---- one ParticleSystem ----
const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const _e = new THREE.Euler(), _qs = new THREE.Quaternion();

class PSystem {
  constructor(def, node, base) {
    this.def = def;
    this.node = node;
    this.name = def.name;
    const m = def.main, em = def.emission;
    this.dur = Math.max(0.05, m.duration);
    this.loop = m.loop;
    this.f = {
      delay: curve(m.delay), life: curve(m.life), speed: curve(m.speed), size: m.size.map(curve), rot: curve(m.rot),
      gravity: curve(m.gravity), rate: curve(em.rate), color: colorFn(m.color),
      sizeOL: def.sizeOL && { x: curve(def.sizeOL.x), y: def.sizeOL.sep ? curve(def.sizeOL.y) : null, z: def.sizeOL.sep ? curve(def.sizeOL.z) : null },
      rotOL: def.rotOL != null ? curve(def.rotOL) : null,
      colorOL: def.colorOL ? colorFn(def.colorOL) : null,
      vel: def.velocity && { x: curve(def.velocity.x), y: curve(def.velocity.y), z: curve(def.velocity.z), mod: curve(def.velocity.speedMod) },
      force: def.force && { x: curve(def.force.x), y: curve(def.force.y), z: curve(def.force.z) },
      frame: def.sheet && curve(def.sheet.frame), start: def.sheet && curve(def.sheet.start),
    };
    this.bursts = em.bursts.map(b => ({ ...b, n: curve(b.n) }));
    const maxLife = Math.max(0.1, maxOf(m.life));
    const rate = em.on ? Math.max(0, maxOf(em.rate)) : 0;
    const burst = em.bursts.reduce((a, b) => a + Math.abs(maxOf(b.n)) * (b.cycles || 1), 0);
    this.cap = Math.max(2, Math.min(m.max, SYS_CAP, Math.ceil(rate * maxLife * 1.2 + burst * Math.max(1, maxLife / this.dur) + 2)));
    this.ps = [];
    this.pool = [];
    this.time = 0;
    this.acc = 0;
    this.cycle = 0;
    this.playing = m.playOnAwake || m.loop;
    this.warmed = false;
    this.world = m.space === 1;
    this.hier = m.scaling === 0;
    this.local = m.scaling === 1;
    this.simSpeed = m.simSpeed;
    // Noise module (fireflies): a small wandering displacement; amplitude `strength`, angular rate 2 rad/s x frequency.
    this.noise = def.noise ? { s: avg(def.noise.strength) * 2 * (def.noise.frequency || 1), w: 2 * (def.noise.frequency || 1) } : null;
    this.shape = def.shape;
    if (this.shape) {
      _e.set(THREE.MathUtils.degToRad(this.shape.rot[0]), THREE.MathUtils.degToRad(this.shape.rot[1]), THREE.MathUtils.degToRad(this.shape.rot[2]), 'YXZ');
      this.shapeQ = new THREE.Quaternion().setFromEuler(_e);
    }
    const r = def.renderer, mat = r.materials[0];
    this.mode = r.mode;
    // mesh particles (render mode 4: rings, dolls, stars, cylinders: 112 systems) need real 3D meshes; left out
    // The torch flame mesh ("pt_fire", a flat flame card turned about the vertical axis) is drawn as a vertical billboard.
    const flame = false;   // the flame mesh has no exported bounds: drawn 6x too large as a card, left out (the glow systems stay)
    this.enabled = r.enabled && r.mode !== 5 && (r.mode !== 4 || flame) && !!mat;
    this.order = r.order + (((mat && mat.q) || 3000) - 3000) / 20000 + r.fudge * 1e-4;
    this.sheet = def.sheet;
    const tex = mat && mat.tex && (mat.tex._MainTex || Object.values(mat.tex)[0]);
    const map = texture(base, tex);
    const blend = (mat && mat.blend) || [5, 10];
    const tc = mat && ((mat.c && (mat.c._TintColor || mat.c._Color)) || null);
    const amb = mat && /Ambient/.test(mat.shader);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthTest: r.mode === 2, depthWrite: false, side: THREE.DoubleSide,   // ground glow (horizontal quad) hides behind solid meshes like Unity ZTest LEqual
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: BLEND[blend[0]] ?? THREE.SrcAlphaFactor,
      blendDst: BLEND[blend[1]] ?? THREE.OneMinusSrcAlphaFactor,
      uniforms: {
        map: { value: map }, tint: { value: new THREE.Vector4(...(tc || [1, 1, 1, 1])) }, ambient: env.ambient,
        ambientFactor: { value: amb ? (mat.f._AmbientFactor ?? 1) : 0 },
        mode: { value: r.mode === 2 ? 2 : r.mode === 3 || flame ? 3 : 0 },
      },
    });
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.getAttribute('position'));
    const attr = (n, k) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * k), k); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(n, a); return a; };
    this.aPos = attr('iPos', 4); this.aSize = attr('iSize', 4); this.aCol = attr('iColor', 4); this.aUv = attr('iUv', 2);
    g.instanceCount = 0;
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = this.order;
    this.mesh.visible = false;
    this.mesh.matrixAutoUpdate = false;
    this.col = [1, 1, 1, 1];
  }

  get live() { return this.ps.length; }

  play() { this.playing = true; this.time = 0; this.acc = 0; this.cycle = 0; this.bursts.forEach(b => { b.done = 0; }); }

  // world scale factor applied to particle sizes (Unity "scaling mode")
  sizeScale() {
    if (this.local) return this.node.scale.x;
    if (!this.hier) return 1;
    this.node.matrixWorld.decompose(_v, _q, _s);
    return (_s.x + _s.y + _s.z) / 3;
  }

  shapeSample(p) {
    const s = this.shape;
    let x = 0, y = 0, z = 0, dx = 0, dy = 0, dz = 1;
    if (s) {
      const R = s.radius, rt = s.radiusThickness;
      const arc = THREE.MathUtils.degToRad(s.arc || 360);
      const ang = (s.arcMode === 0 ? Math.random() : Math.random()) * arc;
      const k = s.kind;
      if (k === 'sphere' || k === 'hemisphere') {
        let u = Math.random() * 2 - 1, th = Math.random() * 2 * Math.PI;
        const rr = R * (1 - rt + rt * Math.cbrt(Math.random()));
        const sq = Math.sqrt(1 - u * u);
        dx = sq * Math.cos(th); dy = sq * Math.sin(th); dz = u;
        if (k === 'hemisphere' && dz < 0) dz = -dz;
        x = dx * rr; y = dy * rr; z = dz * rr;
      } else if (k === 'cone') {
        const f = Math.sqrt(1 - rt + rt * Math.random());
        x = Math.cos(ang) * R * f; y = Math.sin(ang) * R * f;
        const a = THREE.MathUtils.degToRad(s.angle) * (R > 1e-4 ? f : 1);
        dx = Math.sin(a) * Math.cos(ang); dy = Math.sin(a) * Math.sin(ang); dz = Math.cos(a);
      } else if (k === 'box') {
        x = Math.random() - 0.5; y = Math.random() - 0.5; z = Math.random() - 0.5;
      } else if (k === 'circle') {
        const f = Math.sqrt(1 - rt + rt * Math.random());
        dx = Math.cos(ang); dy = Math.sin(ang); dz = 0;
        x = dx * R * f; y = dy * R * f;
      } else if (k === 'edge') {
        x = (Math.random() * 2 - 1) * R; dx = 0; dy = 1; dz = 0;
      } else if (k === 'rect') {
        x = Math.random() - 0.5; y = Math.random() - 0.5;
      } else if (k === 'donut') {
        const th = Math.random() * 2 * Math.PI;
        dx = Math.cos(th); dy = Math.sin(th); dz = 0; x = dx * R; y = dy * R;
      }
      x *= s.scale[0]; y *= s.scale[1]; z *= s.scale[2];
      if (s.randomDir > 0) {
        const u = Math.random() * 2 - 1, th = Math.random() * 2 * Math.PI, sq = Math.sqrt(1 - u * u), w = s.randomDir;
        dx += (sq * Math.cos(th) - dx) * w; dy += (sq * Math.sin(th) - dy) * w; dz += (u - dz) * w;
      }
      if (s.sphericalDir > 0) {
        const l = Math.hypot(x, y, z) || 1, w = s.sphericalDir;
        dx += (x / l - dx) * w; dy += (y / l - dy) * w; dz += (z / l - dz) * w;
      }
      _v.set(x, y, z).applyQuaternion(this.shapeQ);
      x = _v.x + s.pos[0]; y = _v.y + s.pos[1]; z = _v.z + s.pos[2];
      _v.set(dx, dy, dz).applyQuaternion(this.shapeQ);
      dx = _v.x; dy = _v.y; dz = _v.z;
    }
    p.x = x; p.y = y; p.z = z; p.dx = dx; p.dy = dy; p.dz = dz;
  }

  spawn(t) {
    const p = this.pool.pop() || {};
    const rnd = Math.random;
    const T = t / this.dur;
    p.age = 0;
    p.life = Math.max(0.02, this.f.life(T, rnd()));
    p.r1 = rnd(); p.r2 = rnd(); p.r3 = rnd();
    this.shapeSample(p);
    const sp = this.f.speed(T, rnd());
    p.vx = p.dx * sp; p.vy = p.dy * sp; p.vz = p.dz * sp;
    p.sx = this.f.size[0](T, rnd());
    p.sy = this.f.size.length > 1 ? this.f.size[1](T, rnd()) : p.sx;
    p.rot = this.f.rot(T, rnd());
    this.f.color(T, rnd(), this.col);
    p.c0 = this.col[0]; p.c1 = this.col[1]; p.c2 = this.col[2]; p.c3 = this.col[3];
    p.f0 = this.f.start ? this.f.start(T, rnd()) : 0;
    if (this.world) {
      // to world (three) space now: unity local (x, y, -z) through the node matrix
      const e = this.node.matrixWorld.elements;
      const lx = p.x, ly = p.y, lz = -p.z;
      p.x = e[0] * lx + e[4] * ly + e[8] * lz + e[12];
      p.y = e[1] * lx + e[5] * ly + e[9] * lz + e[13];
      p.z = e[2] * lx + e[6] * ly + e[10] * lz + e[14];
      const vx = p.vx, vy = p.vy, vz = -p.vz;
      p.vx = e[0] * vx + e[4] * vy + e[8] * vz;
      p.vy = e[1] * vx + e[5] * vy + e[9] * vz;
      p.vz = e[2] * vx + e[6] * vy + e[10] * vz;
    }
    this.ps.push(p);
  }

  emit(dt, budget) {
    if (!this.playing) return budget;
    const em = this.def.emission;
    const t0 = this.time, t1 = this.time + dt;
    const delay = this.f.delay(0, 0.5);
    this.time = t1;
    const room = () => budget > 0 && this.ps.length < this.cap;
    if (t1 < delay) return budget;
    let a = Math.max(t0, delay), b = t1;
    if (em.on) {
      const lt = Math.min(this.dur, b) - a;
      if (lt > 0) {
        this.acc += this.f.rate(Math.min(1, a / this.dur), Math.random()) * lt;
        while (this.acc >= 1) { this.acc -= 1; if (room()) { this.spawn(a); budget--; } }
      }
      for (const bu of this.bursts) {
        for (let k = bu.done || 0; k < (bu.cycles || 1); k++) {
          const tt = delay + bu.t + k * bu.every;
          if (tt > b) break;
          bu.done = k + 1;
          if (tt >= a - 1e-6 && Math.random() <= bu.p) {
            const n = Math.round(bu.n(Math.min(1, bu.t / this.dur), Math.random()));
            for (let i = 0; i < n && room(); i++) { this.spawn(tt); budget--; }
          }
        }
      }
    }
    if (b >= this.dur + delay) {
      if (this.loop) {
        this.time = b - this.dur;
        this.bursts.forEach(bu => { bu.done = 0; });
      } else this.playing = false;
    }
    return budget;
  }

  step(dt) {
    const d = this.def, m = this.node.matrixWorld.elements;
    // world gravity expressed in the unity-local frame of the node (local simulation space)
    let gx = 0, gy = -GRAV, gz = 0;
    const gm = this.f.gravity(Math.min(1, this.time / this.dur), 0.5);
    if (!this.world) {
      const lx = Math.hypot(m[1], m[5], m[9]) || 1;
      gx = -GRAV * m[1] / lx; gy = -GRAV * m[5] / lx; gz = GRAV * m[9] / lx;
    }
    const ps = this.ps;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.age += dt;
      if (p.age >= p.life) { this.pool.push(p); ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
      const T = p.age / p.life;
      let ax = gx * gm, ay = gy * gm, az = gz * gm;
      let ox = 0, oy = 0, oz = 0, sm = 1;
      if (this.f.force) { ax += this.f.force.x(T, p.r1); ay += this.f.force.y(T, p.r1); az += this.f.force.z(T, p.r1); }
      if (this.f.vel) { ox = this.f.vel.x(T, p.r1); oy = this.f.vel.y(T, p.r1); oz = this.f.vel.z(T, p.r1); sm = this.f.vel.mod(T, p.r2); }
      p.vx += ax * dt; p.vy += ay * dt; p.vz += az * dt;
      p.x += (p.vx * sm + ox) * dt; p.y += (p.vy * sm + oy) * dt; p.z += (p.vz * sm + oz) * dt;
      if (this.noise) {
        const a = p.age * this.noise.w + p.r1 * 40;
        p.x += Math.cos(a) * this.noise.s * dt; p.y += Math.cos(a * 1.3 + 2) * this.noise.s * 0.5 * dt; p.z += Math.sin(a * 0.9 + 1) * this.noise.s * dt;
      }
      if (this.f.rotOL) p.rot += this.f.rotOL(T, p.r3) * dt;
    }
    void d;
  }

  write(first) {
    const e = this.node.matrixWorld.elements;
    const ss = this.sizeScale();
    const sh = this.sheet;
    const tx = sh ? sh.x : 1, ty = sh ? sh.y : 1;
    const tot = sh ? (sh.anim === 1 ? tx : tx * ty) : 1;
    const ps = this.ps, n = ps.length;
    const P = this.aPos.array, S = this.aSize.array, C = this.aCol.array, U = this.aUv.array;
    for (let i = 0; i < n; i++) {
      const p = ps[i], T = p.age / p.life;
      let X = p.x, Y = p.y, Z = p.z;
      if (!this.world) {
        const lx = X, ly = Y, lz = -Z;
        X = e[0] * lx + e[4] * ly + e[8] * lz + e[12];
        Y = e[1] * lx + e[5] * ly + e[9] * lz + e[13];
        Z = e[2] * lx + e[6] * ly + e[10] * lz + e[14];
      }
      let w = p.sx * ss, h = p.sy * ss;
      if (this.f.sizeOL) {
        const so = this.f.sizeOL, a = so.x(T, p.r1);
        w *= a; h *= so.y ? so.y(T, p.r1) : a;
      }
      this.col[0] = p.c0; this.col[1] = p.c1; this.col[2] = p.c2; this.col[3] = p.c3;
      let r = p.c0, g = p.c1, b = p.c2, al = p.c3;
      if (this.f.colorOL) {
        this.f.colorOL(T, p.r2, this.col);
        r *= this.col[0]; g *= this.col[1]; b *= this.col[2]; al *= this.col[3];
      }
      let u0 = 0, v0 = 0, du = 1, dv = 1;
      if (sh) {
        let fr;
        if (sh.timeMode === 2) fr = Math.floor(p.age * sh.fps + p.f0 * tot);
        else fr = Math.floor((this.f.frame(T, p.r3) * sh.cycles + (this.f.start ? p.f0 : 0)) * tot);
        fr = ((fr % tot) + tot) % tot;
        let row = 0, colm = fr;
        if (sh.anim === 1) { row = sh.rowMode === 1 ? 0 : sh.row; } else { row = Math.floor(fr / tx); colm = fr % tx; }
        du = 1 / tx; dv = 1 / ty; u0 = colm * du; v0 = 1 - (row + 1) * dv;
      }
      const o4 = i * 4;
      P[o4] = X; P[o4 + 1] = Y; P[o4 + 2] = Z; P[o4 + 3] = this.mode === 2 ? -p.rot : p.rot;
      S[o4] = w; S[o4 + 1] = h; S[o4 + 2] = u0; S[o4 + 3] = v0;
      C[o4] = r; C[o4 + 1] = g; C[o4 + 2] = b; C[o4 + 3] = al;
      U[i * 2] = du; U[i * 2 + 1] = dv;
    }
    this.mesh.geometry.instanceCount = n;
    this.mesh.visible = n > 0 && this.enabled;
    if (n) { this.aPos.needsUpdate = this.aSize.needsUpdate = this.aCol.needsUpdate = this.aUv.needsUpdate = true; }
    void first;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

// ---- feature ----
let C = null;
let data = null;
const systems = new Set();
const byWork = new Map();      // work id -> [PSystem]
const pending = [];
let group = null;
let live = 0;

const hidden = o => { for (let n = o; n; n = n.parent) if (!n.visible) return true; return false; };
const ndc = new THREE.Vector3();

function attach(entry) {
  const found = [];
  entry.obj.traverse(o => { if (o.userData.objects && o.userData.objects[0] === o) found.push(o); });
  for (const root of found) {
    const defs = data[`places/place${entry.w.a}`] && root === entry.obj ? data[`places/place${entry.w.a}`] : (root.name === 'lamp0' ? data['lamp/lamp0'] : null);
    if (!defs) continue;
    for (const def of Object.values(defs)) {
      const node = root.userData.objects[def.idx];
      if (!node || node.name !== def.name) continue;
      const s = new PSystem(def, node, C.base);
      s.workId = entry.w.id;
      s.root = entry.obj;
      if (root.name === 'lamp0') { s.mesh.renderOrder = -0.2; s.nightOnly = true; }   // the lantern glow sits behind the glass jar sprite (renderOrder 0), not over it
      group.add(s.mesh);
      systems.add(s);
      if (!byWork.has(entry.w.id)) byWork.set(entry.w.id, []);
      byWork.get(entry.w.id).push(s);
    }
  }
}

// Spawn.pt_fireFly: a level2 scene system riding on the camera; its world pose is a horizontal 10 x 10 rectangle 0.5 above the
// view centre (camera rig numbers composed in the exporter: tools/export_particles.py --scene). Simulated in world space,
// emitted at night only (the existing sparks fade out over their 1-3 s life when day comes).
let fireNode = null;
function mountFireflies() {
  const defs = data['scene/pt_fireFly'];
  if (!defs) return;
  fireNode = new THREE.Object3D();
  fireNode.name = 'pt_fireFly';
  fireNode.rotation.x = -Math.PI / 2;     // the box shape lies in the node's XY plane; lay it on the ground plane
  C.scene.add(fireNode);
  for (const def of Object.values(defs)) {
    const s = new PSystem(def, fireNode, C.base);
    s.workId = -1;
    s.root = fireNode;
    s.nightEmit = true;
    s.mesh.renderOrder = 5;
    group.add(s.mesh);
    systems.add(s);
  }
}

export default {
  id: 'particles',
  async mount(ctx) {
    C = ctx;
    group = new THREE.Group();
    group.name = 'particles';
    ctx.scene.add(group);
    data = await ctx.json('data/particles.json');
    for (const e of pending.splice(0)) attach(e);
    mountFireflies();
    window.__particles = {
      systems: () => [...systems].map(s => ({ work: s.workId, name: s.name, live: s.live, playing: s.playing, mode: s.mode, shown: s.mesh.visible })),
      live: (name, work) => [...systems].filter(s => (!name || s.name === name) && (work == null || s.workId === work)).reduce((a, s) => a + s.live, 0),
      total: () => live,
      focus: id => { const e = C.view.works.get(id); if (!e) return false; C.camera.target.copy(e.obj.position); C.camera.update(); return true; },   // test helper: centre the camera on a facility
      off: false,           // test switch: skip the simulation and hide every system (frame-time baseline)
    };
  },
  onWork(entry) {
    if (!data) { pending.push(entry); return; }
    attach(entry);
  },
  onEvent(e) {
    const id = e.work && e.work.id;
    if (id == null || !['food', 'energy', 'jar', 'upgrade', 'build'].includes(e.type)) return;
    for (const s of byWork.get(id) || []) if (!s.loop && !s.playing) s.play();
  },
  update(dt) {
    if (!data) return;
    group.visible = !(window.__particles && window.__particles.off);
    if (!group.visible) return;
    dt = Math.min(dt, 0.1);
    live = 0;
    for (const s of systems) live += s.live;
    let budget = TOTAL_CAP - live;
    const cam = C.camera.cam;
    for (const s of systems) {
      if (!s.root.parent) {
        systems.delete(s);
        const l = byWork.get(s.workId);
        if (l) l.splice(l.indexOf(s), 1);
        s.dispose();
        continue;
      }
      if (s.nightEmit) fireNode.position.set(C.camera.target.x, 0.5, C.camera.target.z);
      if (hidden(s.node) || (s.nightOnly && !C.game.isNight())) { s.mesh.visible = false; continue; }   // HandLightOn: the lantern is lit at night only
      s.node.updateWorldMatrix(true, false);
      ndc.setFromMatrixPosition(s.node.matrixWorld).project(cam);
      if (Math.abs(ndc.x) > 1.5 || Math.abs(ndc.y) > 1.5) { s.mesh.visible = false; continue; }
      if (!s.warmed) {
        s.warmed = true;
        if (s.def.main.prewarm && s.loop) for (let t = 0; t < Math.min(3, Math.max(0.1, maxOf(s.def.main.life))); t += 0.1) { budget = s.emit(0.1, budget); s.step(0.1); }
      }
      const d = dt * s.simSpeed;
      if (!s.nightEmit || C.game.isNight()) budget = s.emit(d, budget);
      s.step(d);
      s.write();
    }
  },
};
