// Crowd renderer: every robot instance owns one row ("slot") of a float texture holding its 24 bone matrices, its
// root matrix and 2 parameter texels. Each look (proto) is ONE mesh: an InstancedBufferGeometry whose per-instance
// attribute aSlot lists the visible members, so a proto costs one draw call (plus one shadow draw) however many
// robots use it. Sparks and steam puffs share one Points draw.
import * as THREE from '../vendor/three.module.min.js';
import { buildProto } from './robo-cast.js';
import { crowdMat, crowdDepthMat, TEX_W } from './robo-mat.js';

// blending that leaves the target alpha untouched (twt js/mats.js keepAlpha, inlined so this folder stands alone)
function keepAlpha(m, additive) {
  m.blending = THREE.CustomBlending; m.blendEquation = THREE.AddEquation; m.blendSrc = THREE.SrcAlphaFactor; m.blendDst = additive ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor;
  m.blendEquationAlpha = THREE.AddEquation; m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor; return m;
}

export class Crowd {
  constructor(scene, o = {}) {
    this.scene = scene; this.cap = 0; this.data = null; this.tex = null; this.nSlots = 0; this.free = [];
    this.shared = { uBones: { value: null }, uTime: { value: 0 }, timed: [] };
    this.protos = new Map(); this.depth = crowdDepthMat(this.shared); this.shadows = o.shadows !== false;
    this.grow(o.cap || 128);
    this.fx = new Sparks(scene);
  }
  grow(n) {
    const old = this.data; this.cap = n; this.data = new Float32Array(TEX_W * n * 4); if (old) this.data.set(old);
    if (this.tex) this.tex.dispose();
    this.tex = new THREE.DataTexture(this.data, TEX_W, n, THREE.RGBAFormat, THREE.FloatType); this.tex.magFilter = this.tex.minFilter = THREE.NearestFilter; this.tex.needsUpdate = true;
    this.shared.uBones.value = this.tex;
    for (const pr of this.protos.values()) this.sizeSlots(pr);
  }
  alloc() { const s = this.free.length ? this.free.pop() : this.nSlots++; if (s >= this.cap) this.grow(this.cap * 2); return s; }
  release(s) { this.data.fill(0, s * TEX_W * 4, (s + 1) * TEX_W * 4); this.free.push(s); }
  row(s) { return s * TEX_W * 4; }
  sizeSlots(pr) {
    const n = Math.max(16, this.cap); if (pr.slotAttr && pr.slotAttr.count >= n) return;
    const a = new THREE.InstancedBufferAttribute(new Float32Array(n), 1); a.setUsage(THREE.DynamicDrawUsage);
    pr.geom.setAttribute('aSlot', a); pr.slotAttr = a;
  }
  // look def (robo-cast robotDef / zombieRobotDef) -> proto record (built once per key)
  proto(def) {
    let pr = this.protos.get(def.key); if (pr) return pr;
    const P = buildProto(def.spec), g = new THREE.InstancedBufferGeometry();
    g.index = P.geom.index; for (const k of ['position', 'normal', 'aReg', 'aBone']) g.setAttribute(k, P.geom.attributes[k]);
    g.instanceCount = 0; g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const mat = crowdMat(P, this.shared), mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false; mesh.castShadow = this.shadows; mesh.receiveShadow = true; mesh.customDepthMaterial = this.depth; mesh.visible = false; mesh.name = 'robots:' + def.key;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    pr = { key: def.key, def, P, geom: g, mat, mesh, list: [], n: 0, dims: P.dims, tris: P.tris };
    this.sizeSlots(pr); this.scene.add(mesh); this.protos.set(def.key, pr);
    return pr;
  }
  // one robot visible this frame
  show(pr, slot) { if (pr.n >= pr.slotAttr.count) this.sizeSlots(pr); pr.slotAttr.array[pr.n++] = slot; }
  beginFrame() { for (const pr of this.protos.values()) pr.n = 0; }
  endFrame(t, dt, cam) {
    let calls = 0, tris = 0;
    for (const pr of this.protos.values()) {
      const g = pr.geom; g.instanceCount = pr.n; pr.mesh.visible = pr.n > 0;
      if (pr.n) { pr.slotAttr.addUpdateRange(0, pr.n); pr.slotAttr.needsUpdate = true; calls++; tris += pr.n * pr.tris; }
    }
    this.tex.needsUpdate = true; for (const u of this.shared.timed) u.value.w = t;
    this.fx.update(dt, cam);
    this.lastCalls = calls; this.lastTris = tris;
  }
  dispose() { for (const pr of this.protos.values()) { this.scene.remove(pr.mesh); pr.mat.dispose(); if (pr.mat.userData.decal) pr.mat.userData.decal.dispose(); pr.geom.dispose(); } this.depth.dispose(); this.tex.dispose(); this.fx.dispose(); }
}

// sparks (additive, gravity) and steam (soft, rising) in one Points cloud
class Sparks {
  constructor(scene, N = 600) {
    this.N = N; this.n = 0; this.P = new Float32Array(N * 3); this.Vv = new Float32Array(N * 3); this.L = new Float32Array(N); this.L0 = new Float32Array(N); this.K = new Float32Array(N); this.S = new Float32Array(N);
    const g = new THREE.BufferGeometry(); this.aP = new THREE.BufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage); this.aD = new THREE.BufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aP); g.setAttribute('aD', this.aD); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const m = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } }, transparent: true, depthWrite: false,
      vertexShader: 'attribute vec3 aD; varying vec3 vD; uniform float uScale; void main(){ vD = aD; vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = aD.z * uScale / max(.1, -mv.z); }',
      fragmentShader: 'varying vec3 vD; void main(){ vec2 q = gl_PointCoord - .5; float r = length(q); if (r > .5) discard; float a = vD.x; vec3 c; if (vD.y < .5) { c = mix(vec3(1., .45, .1), vec3(1., .95, .7), a) * 3.; a *= smoothstep(.5, .1, r); } else { c = vec3(.85, .86, .88) * .9; a *= smoothstep(.5, 0., r) * .35; } gl_FragColor = vec4(c * a, a); }',
    });
    keepAlpha(m, true); m.blendSrc = THREE.OneFactor;
    this.pts = new THREE.Points(g, m); this.pts.frustumCulled = false; this.pts.renderOrder = 5; scene.add(this.pts);
  }
  // kind 0 spark, 1 steam; p world, v world velocity
  emit(p, v, kind = 0, life = 0.4, size = 0.05) {
    const i = this.n < this.N ? this.n++ : Math.floor(Math.random() * this.N);
    this.P.set([p.x, p.y, p.z], i * 3); this.Vv.set([v.x, v.y, v.z], i * 3); this.L[i] = this.L0[i] = life; this.K[i] = kind; this.S[i] = size;
  }
  burst(p, n, up = 1.5, spread = 1.6, size = 0.035) { for (let i = 0; i < n; i++) this.emit(p, { x: (Math.random() - 0.5) * spread, y: Math.random() * up + 0.3, z: (Math.random() - 0.5) * spread }, 0, 0.25 + Math.random() * 0.35, size * (0.6 + Math.random() * 0.8)); }
  update(dt, cam) {
    let j = 0; const P = this.P, Vv = this.Vv;
    for (let i = 0; i < this.n; i++) {
      this.L[i] -= dt; if (this.L[i] <= 0) continue;
      const k = this.K[i];
      if (k < 0.5) { Vv[i * 3 + 1] -= 9.8 * dt; } else { Vv[i * 3] *= 1 - dt; Vv[i * 3 + 2] *= 1 - dt; Vv[i * 3 + 1] += 0.6 * dt; this.S[i] += dt * 0.5; }
      P[i * 3] += Vv[i * 3] * dt; P[i * 3 + 1] += Vv[i * 3 + 1] * dt; P[i * 3 + 2] += Vv[i * 3 + 2] * dt;
      if (k < 0.5 && P[i * 3 + 1] < 0.01) { P[i * 3 + 1] = 0.01; Vv[i * 3 + 1] *= -0.3; Vv[i * 3] *= 0.5; Vv[i * 3 + 2] *= 0.5; }
      if (j !== i) { P.copyWithin(j * 3, i * 3, i * 3 + 3); Vv.copyWithin(j * 3, i * 3, i * 3 + 3); this.L[j] = this.L[i]; this.L0[j] = this.L0[i]; this.K[j] = k; this.S[j] = this.S[i]; }
      j++;
    }
    this.n = j;
    const ap = this.aP.array, ad = this.aD.array;
    for (let i = 0; i < j; i++) { ap[i * 3] = P[i * 3]; ap[i * 3 + 1] = P[i * 3 + 1]; ap[i * 3 + 2] = P[i * 3 + 2]; ad[i * 3] = this.L[i] / this.L0[i]; ad[i * 3 + 1] = this.K[i]; ad[i * 3 + 2] = this.S[i]; }
    this.pts.geometry.setDrawRange(0, j); this.aP.needsUpdate = true; this.aD.needsUpdate = true; this.pts.visible = j > 0;
    if (cam && cam.isPerspectiveCamera) this.pts.material.uniforms.uScale.value = window.innerHeight / (2 * Math.tan(cam.fov * Math.PI / 360));
  }
  dispose() { this.pts.geometry.dispose(); this.pts.material.dispose(); this.pts.removeFromParent(); }
}
