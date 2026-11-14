// Particles (sparks, smoke, water splashes, debris glow, fire), bullet-hole decals, explosions with light.
import * as THREE from '../vendor/three.module.min.js';
import { keepAlpha, noMask } from './mats.js';
import { rng } from './rng.js';

const P_VS = /* glsl */`
attribute vec4 aPos; attribute vec4 aCol; attribute vec4 aVel;
varying vec4 vCol; varying vec2 vUv; varying float vKind;
void main(){
  vCol = aCol; vUv = position.xy + 0.5; vKind = aVel.w;
  vec3 c = aPos.xyz; float s = aPos.w;
  vec4 mv = viewMatrix * vec4(c, 1.0);
  if (aVel.w > 0.5 && aVel.w < 1.5) {
    // spark: stretch along screen-space velocity
    vec3 v = (viewMatrix * vec4(aVel.xyz, 0.0)).xyz;
    vec2 dir = normalize(v.xy + 1e-4); vec2 nrm = vec2(-dir.y, dir.x);
    float len = clamp(length(v) * 0.03, 0.02, 0.35);
    mv.xy += dir * position.y * len + nrm * position.x * s;
  } else {
    mv.xy += position.xy * s;
  }
  gl_Position = projectionMatrix * mv;
}`;
const P_FS = /* glsl */`
varying vec4 vCol; varying vec2 vUv; varying float vKind;
void main(){
  vec2 p = vUv - 0.5; float r = length(p) * 2.0;
  float a;
  if (vKind > 0.5 && vKind < 1.5) a = smoothstep(1.0, 0.0, abs(p.x) * 2.0);
  else if (vKind > 1.5 && vKind < 2.5) { a = smoothstep(1.0, 0.2, r); a *= a; } // smoke
  else a = smoothstep(1.0, 0.0, r);
  a *= vCol.a;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vCol.rgb * a, (vKind > 1.5 && vKind < 2.5) ? a : 0.0);
}`;

export class FX {
  constructor(G) {
    this.G = G; this.max = 1400; this.list = [];
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aPos', this.aPos); g.setAttribute('aCol', this.aCol); g.setAttribute('aVel', this.aVel);
    g.instanceCount = 0;
    // additive (sparks, glow) and alpha (smoke) share one pass: premultiplied colour, alpha only for smoke
    const m = new THREE.ShaderMaterial({ vertexShader: P_VS, fragmentShader: P_FS, transparent: true, depthWrite: false });
    m.blending = THREE.CustomBlending; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor;
    m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor;
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = 10;
    G.scene.add(this.mesh); this.geo = g;
    // decals
    this.decalGeo = new THREE.PlaneGeometry(1, 1);
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.25, 'rgba(10,8,6,0.95)'); gr.addColorStop(0.5, 'rgba(30,25,20,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    this.decalMat = noMask(new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    this.decals = [];
    this.lights = [];
    for (let i = 0; i < 2; i++) { const l = new THREE.PointLight(0xff8a3a, 0, 22, 2); l.layers.enableAll(); G.scene.add(l); this.lights.push({ l, t: 0 }); }
    this.r = rng('fx');
  }
  add(kind, p, v, size, col, life, opts) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ kind, p: p.clone(), v: v ? v.clone() : new THREE.Vector3(), size, col: col.clone ? col.clone() : new THREE.Color(col), life, age: 0, grow: (opts && opts.grow) || 0, drag: (opts && opts.drag) ?? 1.5, grav: (opts && opts.grav) ?? 0, a0: (opts && opts.a) ?? 1 });
  }
  impact(p, n, surf) {
    const r = this.r;
    const metal = surf === 'metal';
    const water = surf === 'water';
    if (metal) for (let i = 0; i < 10; i++) {
      const v = n.clone().multiplyScalar(r.range(2, 6)).add(new THREE.Vector3(r.range(-3, 3), r.range(-1, 4), r.range(-3, 3)));
      this.add(1, p, v, 0.008, new THREE.Color(6, 3, 1), r.range(0.15, 0.45), { grav: 9.8, drag: 0.5 });
    }
    if (water) for (let i = 0; i < 8; i++) this.add(3, p, new THREE.Vector3(r.range(-0.8, 0.8), r.range(1.5, 3.5), r.range(-0.8, 0.8)), 0.035, new THREE.Color(0.25, 0.27, 0.3), r.range(0.3, 0.6), { grav: 9.8, drag: 0.3, a: 0.7 });
    for (let i = 0; i < (water ? 2 : 4); i++) this.add(2, p.clone().addScaledVector(n, 0.05), n.clone().multiplyScalar(r.range(0.3, 1.0)).add(new THREE.Vector3(r.range(-0.3, 0.3), r.range(0, 0.4), r.range(-0.3, 0.3))), 0.12, water ? new THREE.Color(0.2, 0.22, 0.25) : new THREE.Color(0.17, 0.16, 0.15), r.range(0.6, 1.4), { grow: 0.8, a: 0.5 });
    this.add(0, p.clone().addScaledVector(n, 0.03), null, 0.12, new THREE.Color(3, 1.8, 0.8), 0.05);
    if (!water) this.decal(p, n, r.range(0.05, 0.08));
  }
  decal(p, n, s) {
    const m = new THREE.Mesh(this.decalGeo, this.decalMat);
    m.position.copy(p).addScaledVector(n, 0.004); m.lookAt(p.clone().add(n)); m.rotateZ(this.r() * 6.28); m.scale.setScalar(s);
    this.G.scene.add(m); this.decals.push(m);
    if (this.decals.length > 120) this.G.scene.remove(this.decals.shift());
  }
  explosion(p, scale = 1) {
    const r = this.r;
    for (let i = 0; i < 40 * scale; i++) {
      const v = new THREE.Vector3(r.range(-1, 1), r.range(0.2, 1.4), r.range(-1, 1)).normalize().multiplyScalar(r.range(4, 14) * scale);
      this.add(1, p, v, 0.012, new THREE.Color(8, 4, 1.4), r.range(0.4, 1.2), { grav: 9.8, drag: 0.6 });
    }
    for (let i = 0; i < 10 * scale; i++) this.add(0, p.clone().add(new THREE.Vector3(r.range(-0.5, 0.5), r.range(-0.2, 0.6), r.range(-0.5, 0.5)).multiplyScalar(scale)), new THREE.Vector3(r.range(-1, 1), r.range(0.5, 2), r.range(-1, 1)), 0.9 * scale, new THREE.Color(6, 2.6, 0.8), r.range(0.15, 0.35), { grow: 3, drag: 2 });
    for (let i = 0; i < 16 * scale; i++) this.add(2, p.clone().add(new THREE.Vector3(r.range(-0.6, 0.6), r.range(0, 0.8), r.range(-0.6, 0.6)).multiplyScalar(scale)), new THREE.Vector3(r.range(-1.2, 1.2), r.range(0.6, 2.4), r.range(-1.2, 1.2)), 0.8 * scale, new THREE.Color(0.08, 0.075, 0.07), r.range(2, 4), { grow: 1.4, drag: 0.8, a: 0.75 });
    const L = this.lights.sort((a, b) => a.t - b.t)[0];
    L.l.position.copy(p).y += 0.5; L.t = 0.35; L.l.intensity = 120 * scale;
    this.G.postFx.shake = Math.min(1, (this.G.postFx.shake || 0) + 0.6 * scale);
  }
  update(dt) {
    let n = 0; const P = this.aPos.array, C = this.aCol.array, V = this.aVel.array;
    for (const s of this.list) {
      s.age += dt;
      s.v.y -= s.grav * dt; s.v.multiplyScalar(Math.exp(-s.drag * dt)); s.p.addScaledVector(s.v, dt);
      if (s.grav > 0 && s.p.y < 0.02) { s.p.y = 0.02; s.v.y *= -0.3; s.v.x *= 0.6; s.v.z *= 0.6; }
      const t = s.age / s.life; if (t >= 1) continue;
      const fade = s.kind === 2 ? Math.sin(t * Math.PI) : 1 - t;
      P[n * 4] = s.p.x; P[n * 4 + 1] = s.p.y; P[n * 4 + 2] = s.p.z; P[n * 4 + 3] = s.size * (1 + s.grow * t);
      C[n * 4] = s.col.r; C[n * 4 + 1] = s.col.g; C[n * 4 + 2] = s.col.b; C[n * 4 + 3] = fade * s.a0;
      V[n * 4] = s.v.x; V[n * 4 + 1] = s.v.y; V[n * 4 + 2] = s.v.z; V[n * 4 + 3] = s.kind;
      n++;
    }
    this.list = this.list.filter((s) => s.age < s.life);
    this.geo.instanceCount = n;
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aVel.needsUpdate = true;
    for (const L of this.lights) { L.t -= dt; L.l.intensity = L.t > 0 ? L.l.intensity * Math.exp(-dt * 9) : 0; }
  }
}
