// Shuriken particle systems from art/fx/fx.json (tools/export_fx.py), simulated on the CPU and drawn as camera-facing
// quads (billboard / stretch / vertical / horizontal) or instanced meshes (mesh mode, art/fx/fx.glb).
// Covered modules: main (lifetime, speed, size, rotation, colour, gravity, space, hierarchy scaling, loop, prewarm),
// emission (rate, bursts), shape (sphere, hemisphere, cone, circle, box, edge), velocity / limit velocity (dampen),
// size / colour / rotation over lifetime, texture sheet. Not covered: collision, trails, noise, sub emitters, lights.
// A system is anchored to its scene node (art/world/scene.json index) and follows it; "local" systems keep their
// particles in the node frame, "world" ones leave them behind.
// Effects age in step(dt) (called every sim step, drawn or not) and are laid out in draw(camera).
import * as THREE from 'three';

const G = 9.81;
const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpM = new THREE.Matrix4();
const right = new THREE.Vector3(), up = new THREE.Vector3(), fwd = new THREE.Vector3();

function hermite(keys, t) {
  if (!keys.length) return 0;
  if (t <= keys[0][0]) return keys[0][1];
  const last = keys[keys.length - 1];
  if (t >= last[0]) return last[1];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t <= b[0]) {
      const dt = b[0] - a[0] || 1e-6, s = (t - a[0]) / dt, s2 = s * s, s3 = s2 * s;
      return (2 * s3 - 3 * s2 + 1) * a[1] + (s3 - 2 * s2 + s) * a[3] * dt + (-2 * s3 + 3 * s2) * b[1] + (s3 - s2) * b[2] * dt;
    }
  }
  return last[1];
}

// MinMaxCurve: {c} | {r:[a,b]} | {k, s} | {k, k2, s}; rnd in [0,1) is the particle's own random.
function curve(c, t, rnd) {
  if (!c) return 0;
  if (c.c != null) return c.c;
  if (c.r) return c.r[0] + (c.r[1] - c.r[0]) * rnd;
  if (c.k2) return (hermite(c.k, t) + (hermite(c.k2, t) - hermite(c.k, t)) * rnd) * (c.s ?? 1);
  if (c.k) return hermite(c.k, t) * (c.s ?? 1);
  return 0;
}

function gradient(g, t, out) {
  const c = g.c || [[0, 1, 1, 1]], a = g.a || [[0, 1]];
  const pick = (keys, n) => {
    if (t <= keys[0][0]) return keys[0].slice(1, 1 + n);
    for (let i = 0; i < keys.length - 1; i++) {
      const p = keys[i], q = keys[i + 1];
      if (t <= q[0]) {
        if (g.fixed) return q.slice(1, 1 + n);
        const s = (t - p[0]) / ((q[0] - p[0]) || 1e-6);
        return p.slice(1, 1 + n).map((v, k) => v + (q[1 + k] - v) * s);
      }
    }
    return keys[keys.length - 1].slice(1, 1 + n);
  };
  const rgb = pick(c, 3), al = pick(a, 1);
  out[0] = rgb[0]; out[1] = rgb[1]; out[2] = rgb[2]; out[3] = al[0];
  return out;
}

// MinMaxGradient: {c:[rgba]} | {c, c2} | {g} | {g, g2} | {g, rand}
function colorOf(m, t, rnd, out) {
  if (!m) { out[0] = out[1] = out[2] = out[3] = 1; return out; }
  if (m.c && !Array.isArray(m.c[0]) && m.c2) { for (let i = 0; i < 4; i++) out[i] = m.c[i] + (m.c2[i] - m.c[i]) * rnd; return out; }
  if (m.c && !m.g) { for (let i = 0; i < 4; i++) out[i] = m.c[i]; return out; }
  if (m.g && m.g2) {
    const a = gradient(m.g, t, [0, 0, 0, 0]), b = gradient(m.g2, t, [0, 0, 0, 0]);
    for (let i = 0; i < 4; i++) out[i] = a[i] + (b[i] - a[i]) * rnd;
    return out;
  }
  if (m.g) return gradient(m.g, m.rand ? rnd : t, out);
  out[0] = out[1] = out[2] = out[3] = 1;
  return out;
}

const rand = () => Math.random();

// Shape module: start position and direction in the system frame (Unity: local +z is the emit axis).
function emitShape(sh, s, p, d) {
  if (!sh) { p.set(0, 0, 0); d.set(0, 0, 1); return; }
  const rad = (sh.radius ?? 1) * s, thick = sh.radiusThickness ?? 1;
  const rr = () => rad * (1 - thick * (1 - Math.cbrt(rand())));
  switch (sh.type) {
    case 'sphere': case 'hemisphere': {
      d.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
      while (d.lengthSq() > 1 || d.lengthSq() < 1e-6) d.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
      d.normalize();
      if (sh.type === 'hemisphere' && d.z < 0) d.z = -d.z;
      p.copy(d).multiplyScalar(rr());
      break;
    }
    case 'circle': {
      const arc = (sh.arc ?? 360) * Math.PI / 180, a = rand() * arc, r = rad * (1 - thick * (1 - Math.sqrt(rand())));
      d.set(Math.cos(a), Math.sin(a), 0);
      p.copy(d).multiplyScalar(r);
      break;
    }
    case 'box': {
      const b = sh.box && sh.box.some(v => v) ? sh.box : [1, 1, 1];
      p.set((rand() - 0.5) * b[0] * s, (rand() - 0.5) * b[1] * s, (rand() - 0.5) * b[2] * s);
      d.set(0, 0, 1);
      break;
    }
    case 'edge': {
      p.set((rand() - 0.5) * 2 * rad, 0, 0);
      d.set(0, 1, 0);
      break;
    }
    default: { // cone (base)
      const a = rand() * Math.PI * 2, r = rad * (1 - thick * (1 - Math.sqrt(rand())));
      const ang = (sh.angle ?? 25) * Math.PI / 180;
      p.set(Math.cos(a) * r, Math.sin(a) * r, 0);
      const k = rad > 1e-6 ? r / rad : 0;
      d.set(Math.cos(a) * Math.sin(ang * k), Math.sin(a) * Math.sin(ang * k), Math.cos(ang * k)).normalize();
    }
  }
  if (sh.randomDir) { d.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize(); }
  const sc = sh.scale || [1, 1, 1];
  p.set(p.x * sc[0], p.y * sc[1], p.z * sc[2]);
  if (sh.rot && (sh.rot[0] || sh.rot[1] || sh.rot[2])) {
    // Unity Euler order ZXY, degrees, left-handed; the exporter keeps Unity's local frame for particle systems.
    const e = new THREE.Euler(sh.rot[0] * Math.PI / 180, sh.rot[1] * Math.PI / 180, sh.rot[2] * Math.PI / 180, 'YXZ');
    p.applyEuler(e); d.applyEuler(e);
  }
  if (sh.pos) p.add(tmpV.set(sh.pos[0] * s, sh.pos[1] * s, sh.pos[2] * s));
}

class System {
  constructor(lib, key, def, anchor) {
    this.lib = lib;
    this.key = key;
    this.def = def;
    this.anchor = anchor;
    this.parts = [];
    this.playing = false;
    this.emitting = false;
    this.time = 0;
    this.emitAcc = 0;
    this.burstDone = new Set();
    const r = def.renderer;
    this.mode = r && r.enabled !== false ? r.mode : 'none';
    this.max = Math.min(def.main.maxParticles || 1000, 400);
    this.mat = lib.material(r && r.material);
    if (this.mode === 'mesh') {
      const geo = lib.meshGeo(r.mesh);
      if (geo) {
        this.mesh = new THREE.InstancedMesh(geo, this.mat, this.max);
        this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 3), 3);
        this.mesh.count = 0;
      } else this.mode = 'none';
    } else if (this.mode !== 'none') {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.max * 12), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.max * 8), 2));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.max * 16), 4));
      const idx = new Uint16Array(this.max * 6);
      for (let i = 0; i < this.max; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      this.mesh = new THREE.Mesh(g, this.mat);
      this.mesh.geometry.setDrawRange(0, 0);
    }
    if (this.mesh) {
      this.mesh.frustumCulled = false;
      this.mesh.renderOrder = 20 + (r.sortingOrder || 0);
      this.mesh.name = `fx:${key}`;
      lib.group.add(this.mesh);
    }
  }

  // Lossy scale of the anchor (hierarchy scaling), or its local scale (local scaling); uniform scales assumed.
  scaleOf() {
    const m = this.def.main;
    if (m.scaling === 'shape') return 1;
    if (m.scaling === 'local') return Math.abs(this.anchor.scale.x);
    this.anchor.matrixWorld.decompose(tmpV, tmpQ, tmpS);
    return Math.abs(tmpS.x);
  }

  play() {
    this.playing = true;
    this.emitting = true;
    this.time = 0;
    this.emitAcc = 0;
    this.burstDone.clear();
    if (this.def.main.prewarm && this.def.main.loop) for (let t = 0; t < this.def.main.duration; t += 1 / 30) this.step(1 / 30);
  }

  stop(clear = false) {
    this.emitting = false;
    if (clear) this.parts.length = 0;
  }

  alive() { return this.emitting || this.parts.length > 0; }

  spawn(n) {
    const m = this.def.main, s = this.scaleOf(), world = m.space === 'world';
    if (world) this.anchor.matrixWorld.decompose(tmpV, tmpQ, tmpS);
    const t = (this.time % m.duration) / m.duration;
    for (let i = 0; i < n && this.parts.length < this.max; i++) {
      const p = new THREE.Vector3(), d = new THREE.Vector3();
      emitShape(this.def.shape, s, p, d);
      // shape space is Unity's local frame; the exporter mirrored z for every node, so mirror it here too
      p.z = -p.z; d.z = -d.z;
      const r = [rand(), rand(), rand(), rand(), rand(), rand()];
      const life = Math.max(0.01, curve(m.startLifetime, t, r[0]));
      const v = d.multiplyScalar(curve(m.startSpeed, t, r[1]) * s);
      if (world) { p.applyQuaternion(tmpQ).add(tmpV); v.applyQuaternion(tmpQ); }
      const size3 = m.startSize3 ? m.startSize3.map(c => curve(c, t, r[2])) : null;
      const vol = this.def.velocityOverLifetime;
      this.parts.push({
        p, v, age: 0, life, r,
        size: (size3 ? size3[0] : curve(m.startSize, t, r[2])) * s,
        rot: curve(m.startRotation, t, r[3]),
        col: colorOf(m.startColor, t, r[4], [1, 1, 1, 1]),
        extra: vol ? new THREE.Vector3(curve(vol.x, 0, r[5]), curve(vol.y, 0, r[5]), curve(vol.z, 0, r[5])).multiplyScalar(s) : null,
        world,
      });
    }
  }

  step(dt) {
    const m = this.def.main;
    if (this.emitting) {
      const prev = this.time;
      this.time += dt * (m.speed || 1);
      if (this.time >= m.delayEnd) { /* reserved */ }
      const e = this.def.emission;
      if (e) {
        const cycleT = this.time % m.duration, cycle = Math.floor(this.time / m.duration);
        for (let b = 0; b < (e.bursts || []).length; b++) {
          const bu = e.bursts[b], k = `${cycle}:${b}`;
          if (cycleT >= bu.t && !this.burstDone.has(k) && (m.loop || cycle === 0)) {
            this.burstDone.add(k);
            if (rand() <= (bu.prob ?? 1)) this.spawn(Math.round(curve(bu.count, 0, rand())));
          }
        }
        const rate = curve(e.rate, cycleT / m.duration, rand());
        if (rate > 0) {
          this.emitAcc += rate * dt;
          const n = Math.floor(this.emitAcc);
          this.emitAcc -= n;
          if (n) this.spawn(n);
        }
      }
      if (!m.loop && this.time >= m.duration) this.emitting = false;
      if (prev === 0 && !e) this.emitting = false;
    }
    const grav = curve(m.gravity, 0, 0.5) * G * this.scaleOf();
    const lv = this.def.limitVelocity;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.age += dt;
      if (p.age >= p.life) { this.parts.splice(i, 1); continue; }
      if (grav) {
        if (p.world) p.v.y -= grav * dt;
        else { tmpV.set(0, -grav * dt, 0); this.anchor.getWorldQuaternion(tmpQ); tmpV.applyQuaternion(tmpQ.invert()); p.v.add(tmpV); }
      }
      if (lv) {
        const lim = curve(lv.limit, p.age / p.life, p.r[0]) * this.scaleOf(), sp = p.v.length();
        if (sp > lim) p.v.multiplyScalar((sp - (sp - lim) * Math.min(1, (lv.dampen || 0) * dt * 30)) / sp);
      }
      p.p.addScaledVector(p.v, dt);
      if (p.extra) p.p.addScaledVector(p.extra, dt);
      const rol = this.def.rotationOverLifetime;
      if (rol) p.rot += curve(rol.z || rol.x, p.age / p.life, p.r[3]) * dt;
    }
  }

  draw(camera) {
    if (!this.mesh) return;
    const n = this.parts.length;
    if (!n) { if (this.mode === 'mesh') this.mesh.count = 0; else this.mesh.geometry.setDrawRange(0, 0); return; }
    const def = this.def, col = [0, 0, 0, 0], sol = def.sizeOverLifetime, col2 = def.colorOverLifetime, ts = def.textureSheet;
    const anchorM = this.anchor.matrixWorld;
    if (this.mode === 'mesh') {
      this.anchor.matrixWorld.decompose(tmpV, tmpQ, tmpS);
      const aq = tmpQ.clone(), q = new THREE.Quaternion(), e = new THREE.Euler();
      for (let i = 0; i < n; i++) {
        const p = this.parts[i], t = p.age / p.life;
        const size = p.size * (sol ? curve(sol.x, t, p.r[2]) : 1);
        const pos = p.world ? p.p.clone() : p.p.clone().applyMatrix4(tmpM.compose(tmpV, aq, new THREE.Vector3(1, 1, 1)));
        e.set(0, 0, -p.rot);
        q.setFromEuler(e);
        if (def.renderer.alignment === 2 || def.renderer.alignment == null) q.premultiply(aq);
        tmpM.compose(pos, q, new THREE.Vector3(size, size, size));
        this.mesh.setMatrixAt(i, tmpM);
        colorOf(p.col ? { c: p.col } : null, t, 0, col);
        if (col2) { const g = colorOf(col2, t, p.r[4], [1, 1, 1, 1]); for (let k = 0; k < 4; k++) col[k] *= g[k]; }
        this.mesh.instanceColor.setXYZ(i, col[0] * col[3], col[1] * col[3], col[2] * col[3]);
      }
      this.mesh.count = n;
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor.needsUpdate = true;
      return;
    }
    camera.matrixWorld.extractBasis(right, up, fwd);
    const pos = this.mesh.geometry.attributes.position, uv = this.mesh.geometry.attributes.uv, cl = this.mesh.geometry.attributes.color;
    const wp = new THREE.Vector3(), vel = new THREE.Vector3(), ax = new THREE.Vector3(), ay = new THREE.Vector3();
    const r = def.renderer;
    for (let i = 0; i < n; i++) {
      const p = this.parts[i], t = p.age / p.life;
      const size = p.size * (sol ? curve(sol.x, t, p.r[2]) : 1);
      wp.copy(p.p);
      vel.copy(p.v);
      if (!p.world) { wp.applyMatrix4(anchorM); this.anchor.getWorldQuaternion(tmpQ); vel.applyQuaternion(tmpQ); }
      const h = size / 2, c = Math.cos(p.rot), s = Math.sin(p.rot);
      if (this.mode === 'stretch' && vel.lengthSq() > 1e-8) {
        const len = size * (r.lengthScale || 1) + vel.length() * (r.velocityScale || 0);
        ay.copy(vel).normalize();
        ax.crossVectors(ay, fwd).normalize().multiplyScalar(h);
        ay.multiplyScalar(len / 2);
        wp.addScaledVector(ay, -1);
      } else if (this.mode === 'horizontal') {
        ax.set(c * h, 0, s * h); ay.set(-s * h, 0, c * h);
      } else if (this.mode === 'vertical') {
        ax.set(right.x, 0, right.z).normalize();
        ax.multiplyScalar(h);
        ay.set(0, h, 0);
        ax.applyAxisAngle(fwd, 0);
      } else {
        ax.copy(right).multiplyScalar(c * h).addScaledVector(up, -s * h);
        ay.copy(up).multiplyScalar(c * h).addScaledVector(right, s * h);
      }
      const o = i * 12;
      pos.array.set([wp.x - ax.x - ay.x, wp.y - ax.y - ay.y, wp.z - ax.z - ay.z, wp.x + ax.x - ay.x, wp.y + ax.y - ay.y, wp.z + ax.z - ay.z,
        wp.x + ax.x + ay.x, wp.y + ax.y + ay.y, wp.z + ax.z + ay.z, wp.x - ax.x + ay.x, wp.y - ax.y + ay.y, wp.z - ax.z + ay.z], o);
      let u0 = 0, v0 = 0, u1 = 1, v1 = 1;
      if (ts && ts.mode !== 0 || (ts && ts.tilesX)) {
        const tx = ts.tilesX || 1, ty = ts.tilesY || 1, frames = ts.animation === 1 ? tx : tx * ty;
        const f = Math.min(frames - 1, Math.floor((curve(ts.frame, t, p.r[1]) * (ts.cycles || 1) % 1.0000001) * frames + curve(ts.startFrame, 0, p.r[1])));
        const row = ts.animation === 1 ? (ts.rowMode === 1 ? Math.floor(p.r[1] * ty) : ts.row || 0) : Math.floor(f / tx);
        const colI = ts.animation === 1 ? f : f % tx;
        u0 = colI / tx; u1 = (colI + 1) / tx;
        v1 = 1 - row / ty; v0 = 1 - (row + 1) / ty;
      }
      uv.array.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8);
      for (let k = 0; k < 4; k++) col[k] = p.col[k];
      if (col2) { const g = colorOf(col2, t, p.r[4], [1, 1, 1, 1]); for (let k = 0; k < 4; k++) col[k] *= g[k]; }
      for (let k = 0; k < 4; k++) cl.array.set(col, i * 16 + k * 4);
    }
    pos.needsUpdate = uv.needsUpdate = cl.needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, n * 6);
  }
}

export class Fx {
  constructor({ fxJson, fxGlb, world, base, version }) {
    this.json = fxJson;
    this.world = world;
    this.base = base;
    this.q = version ? `?v=${version}` : '';
    this.group = new THREE.Group();
    this.group.name = 'fx';
    this.systems = new Map();
    this.mats = new Map();
    this.texs = new Map();
    this.meshes = [];
    if (fxGlb) fxGlb.scene.traverse(o => { if (o.isMesh) this.meshes.push(o); });
    this.loader = new THREE.TextureLoader();
  }

  meshGeo(i) {
    const name = this.json.meshes[i];
    const m = this.meshes.find(o => o.name === name || o.name === `m${i}` || (o.parent && o.parent.name === name)) || this.meshes[i];
    return m ? m.geometry : null;
  }

  texture(name) {
    if (!name) return null;
    if (!this.texs.has(name)) {
      const t = this.loader.load(`${this.base}/fx/${name}.webp${this.q}`);
      t.colorSpace = THREE.NoColorSpace;
      this.texs.set(name, t);
    }
    return this.texs.get(name);
  }

  material(key) {
    if (this.mats.has(key)) return this.mats.get(key);
    const e = (key && this.json.materials[key]) || { blend: 'alpha' };
    const p = { map: this.texture(e.tex), transparent: true, depthWrite: false, side: THREE.DoubleSide, vertexColors: true };
    const tint = /Standard Unlit/.test(e.shader || '') ? e.tint : null;
    if (tint) p.color = new THREE.Color(tint[0], tint[1], tint[2]);
    if (e.blend === 'additive') p.blending = THREE.AdditiveBlending;
    else if (e.blend === 'premultiply') { p.blending = THREE.CustomBlending; p.blendSrc = THREE.OneFactor; p.blendDst = THREE.OneMinusSrcAlphaFactor; }
    else if (e.blend === 'cutout') { p.transparent = false; p.alphaTest = e.cutoff || 0.5; p.depthWrite = true; }
    else if (e.blend === 'opaque') { p.transparent = false; p.depthWrite = true; }
    const m = new THREE.MeshBasicMaterial(p);
    this.mats.set(key, m);
    return m;
  }

  // The system at `key` (fx.json path); its scene node is the anchor unless one is given.
  get(key, anchor = null) {
    const id = anchor ? `${key}@${anchor.uuid}` : key;
    if (this.systems.has(id)) return this.systems.get(id);
    const def = this.json.systems[key];
    if (!def) return null;
    const a = anchor || (def.node != null ? this.world.objects[def.node] : null);
    if (!a) return null;
    const s = new System(this, key, def, a);
    this.systems.set(id, s);
    return s;
  }

  // ParticleSystem.Play(withChildren): the system and every system below its path.
  play(key) {
    let n = 0;
    for (const k of Object.keys(this.json.systems)) {
      if (k === key || k.startsWith(`${key}/`)) { const s = this.get(k); if (s) { s.play(); n++; } }
    }
    return n;
  }

  stop(key, clear = false) {
    for (const k of Object.keys(this.json.systems)) {
      if (k === key || k.startsWith(`${key}/`)) { const s = this.systems.get(k); if (s) s.stop(clear); }
    }
  }

  isPlaying(key) { const s = this.systems.get(key); return !!(s && s.emitting); }

  // Every system the scene starts with: active, looping, playOnAwake.
  playAwake(filter = () => true) {
    for (const [k, d] of Object.entries(this.json.systems)) if (d.active && d.main.playOnAwake && filter(k)) { const s = this.get(k); if (s) s.play(); }
  }

  step(dt) {
    for (const s of this.systems.values()) if (s.alive()) s.step(dt);
  }

  draw(camera) {
    for (const s of this.systems.values()) s.draw(camera);
  }

  count() {
    let n = 0;
    for (const s of this.systems.values()) n += s.parts.length;
    return n;
  }
}
