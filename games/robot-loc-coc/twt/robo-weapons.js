// Toy-style weapons for the crowd robots (built in code from the robo-geo primitives: bevels, chipped paint, screws)
// plus the combat effects: one InstancedMesh per weapon / loose part, muzzle flashes, tracers, thrown and dropped
// objects (grenade, can, spent magazine, spit glob) with simple physics.
// Weapon frames: melee weapons point along +Y from the grip at the origin; guns point the barrel along +Z with the
// grip handle at the origin. grip2 = where the other hand goes; muzzle / eject in weapon space.
import * as THREE from '../vendor/three.module.min.js';
import { R, place, merge, rbox, fillet, lathe, cyl, sph, tor, cone, bcyl, screw } from './robo-geo.js';

const P = Math.PI;
const prof = (pts, seg = 3) => fillet(pts, seg);
// weapon palette slots (separate from the robots): 0 paint A, 1 paint B, 2 dark metal, 3 chrome, 4 wood, 5 rubber, 6 glow, 7 brass, 8 hazard, 9 olive
export const W = { A: 0, B: 1, DARK: 2, CHROME: 3, WOOD: 4, RUBBER: 5, GLOW: 6, BRASS: 7, HAZ: 8, OLIVE: 9 };
const WPAL = [0xd9483b, 0x2c5cc5, 0x2a2c31, 0xc6cad0, 0xb07a45, 0x1c1c1f, 0xffc860, 0xd6a640, 0xe8b923, 0x5e6a3a];
const T = (g, reg) => { const a = g.attributes.aReg.array; for (let i = 0; i < a.length; i++) a[i] = reg; return g; };
const rb = (w, h, d, r, reg) => T(rbox(w, h, d, r), reg);
const cy = (r0, r1, h, reg, s = 12) => T(cyl(r0, r1, h, 0, s), reg);
const bc = (r, h, bev, reg, s = 14) => T(bcyl(r, h, bev, 0, s), reg);

function bat() { return merge([lathe(prof([[0, -0.05, 0, W.RUBBER], [0.017, -0.05, 0.006, W.RUBBER], [0.016, -0.04, 0, W.RUBBER], [0.012, -0.035, 0, W.RUBBER], [0.012, 0.07, 0, W.RUBBER], [0.012, 0.075, 0, W.WOOD], [0.016, 0.16, 0, W.WOOD], [0.03, 0.34, 0.03, W.WOOD], [0.031, 0.4, 0.02, W.WOOD], [0, 0.415, 0, W.WOOD]]), 14), place(bc(0.0315, 0.012, 0.003, W.A), [0, 0.3, 0])]); }
function pipe() { return merge([place(cy(0.016, 0.016, 0.36, W.CHROME), [0, 0.16, 0]), place(bc(0.024, 0.05, 0.006, W.DARK), [0, 0.32, 0]), place(cy(0.016, 0.016, 0.07, W.CHROME), [0.03, 0.36, 0], [0, 0, P / 2]), place(cy(0.019, 0.019, 0.09, W.HAZ), [0, 0.0, 0]), ...[0, 1, 2].map((i) => place(T(tor(0.019, 0.003, 0, 5, 12), W.RUBBER), [0, -0.03 + i * 0.03, 0], [P / 2, 0, 0]))]); }
function wrench() {
  return merge([place(rb(0.028, 0.3, 0.016, 0.008, W.CHROME), [0, 0.11, 0]), place(rb(0.034, 0.12, 0.022, 0.01, W.A), [0, -0.0, 0]),
    place(rb(0.1, 0.05, 0.022, 0.012, W.CHROME), [0.0, 0.29, 0]), place(rb(0.024, 0.07, 0.022, 0.008, W.CHROME), [-0.04, 0.33, 0]), place(rb(0.024, 0.05, 0.022, 0.008, W.CHROME), [0.03, 0.33, 0]),
    place(bc(0.012, 0.03, 0.004, W.DARK), [0, 0.24, 0], [P / 2, 0, 0]), screw([0, 0.04, 0.012], 0.006)]);
}
function machete() {
  const g = [place(rb(0.03, 0.1, 0.024, 0.01, W.RUBBER), [0, 0.0, 0]), place(rb(0.05, 0.014, 0.03, 0.005, W.DARK), [0, 0.055, 0])];
  g.push(place(rb(0.05, 0.2, 0.008, 0.004, W.CHROME), [0.004, 0.16, 0], [0, 0, -0.04]), place(rb(0.058, 0.14, 0.008, 0.004, W.CHROME), [0.014, 0.32, 0], [0, 0, -0.14]));
  g.push(place(rb(0.012, 0.32, 0.01, 0.003, W.DARK), [-0.024, 0.22, 0], [0, 0, -0.06]), place(bc(0.006, 0.03, 0.002, W.BRASS), [0, 0.0, 0], [P / 2, 0, 0]), place(bc(0.006, 0.03, 0.002, W.BRASS), [0, 0.03, 0], [P / 2, 0, 0]));
  return merge(g);
}
function axe() {
  return merge([place(rb(0.026, 0.46, 0.022, 0.01, W.WOOD), [0, 0.16, 0]), place(rb(0.032, 0.08, 0.028, 0.012, W.RUBBER), [0, -0.04, 0]),
    place(rb(0.1, 0.08, 0.034, 0.012, W.DARK), [0.03, 0.34, 0]), place(rb(0.04, 0.12, 0.02, 0.006, W.CHROME), [0.09, 0.34, 0]), place(rb(0.04, 0.05, 0.03, 0.01, W.A), [-0.03, 0.34, 0]), screw([0.02, 0.34, 0.018], 0.007)]);
}
function sledge() {
  return merge([place(rb(0.03, 0.56, 0.026, 0.012, W.WOOD), [0, 0.2, 0]), place(rb(0.036, 0.12, 0.032, 0.014, W.RUBBER), [0, -0.02, 0]),
    place(rb(0.2, 0.1, 0.1, 0.025, W.DARK), [0, 0.48, 0]), place(rb(0.204, 0.03, 0.104, 0.01, W.HAZ), [0, 0.48, 0]), place(bc(0.045, 0.012, 0.004, W.CHROME), [0.1, 0.48, 0], [0, 0, -P / 2]), place(bc(0.045, 0.012, 0.004, W.CHROME), [-0.1, 0.48, 0], [0, 0, P / 2])]);
}
function pistol() {
  return merge([place(rb(0.036, 0.05, 0.15, 0.012, W.DARK), [0, 0.045, 0.04]), place(rb(0.038, 0.016, 0.15, 0.006, W.A), [0, 0.075, 0.04]), place(bc(0.009, 0.03, 0.002, W.CHROME), [0, 0.055, 0.12], [P / 2, 0, 0]),
    place(rb(0.032, 0.08, 0.04, 0.012, W.RUBBER), [0, -0.01, -0.005], [-0.2, 0, 0]), place(T(tor(0.016, 0.004, 0, 5, 12, P), W.DARK), [0, 0.02, 0.03], [0, P / 2, P]), place(rb(0.01, 0.012, 0.012, 0.003, W.GLOW), [0, 0.088, -0.02])]);
}
function smg() {
  return merge([place(rb(0.044, 0.07, 0.22, 0.014, W.DARK), [0, 0.04, 0.06]), place(rb(0.03, 0.11, 0.04, 0.01, W.DARK), [0, -0.04, 0.1]), place(rb(0.032, 0.075, 0.036, 0.012, W.RUBBER), [0, -0.01, -0.01], [-0.2, 0, 0]),
    place(bc(0.012, 0.06, 0.003, W.CHROME), [0, 0.05, 0.19], [P / 2, 0, 0]), place(rb(0.03, 0.03, 0.12, 0.008, W.OLIVE), [0, 0.05, -0.08]), place(rb(0.046, 0.016, 0.06, 0.005, W.HAZ), [0, 0.08, 0.04]), screw([0.023, 0.04, 0.0], 0.006, [1, 0, 0])]);
}
function rifle() {
  return merge([place(rb(0.046, 0.075, 0.3, 0.014, W.OLIVE), [0, 0.04, 0.06]), place(rb(0.04, 0.09, 0.2, 0.02, W.WOOD), [0, 0.02, -0.16]), place(rb(0.05, 0.05, 0.16, 0.012, W.WOOD), [0, 0.03, 0.26]),
    place(bc(0.011, 0.14, 0.003, W.DARK), [0, 0.05, 0.34], [P / 2, 0, 0]), place(bc(0.016, 0.03, 0.004, W.DARK), [0, 0.05, 0.48], [P / 2, 0, 0]),
    place(rb(0.026, 0.11, 0.045, 0.01, W.DARK), [0, -0.04, 0.1], [0.25, 0, 0]), place(rb(0.032, 0.075, 0.036, 0.012, W.RUBBER), [0, -0.01, -0.01], [-0.2, 0, 0]),
    place(bc(0.022, 0.13, 0.004, W.DARK), [0, 0.105, 0.0], [P / 2, 0, 0]), place(T(bcyl(0.019, 0.004, 0.002, 0, 14), W.GLOW), [0, 0.105, 0.135], [P / 2, 0, 0]), place(rb(0.02, 0.03, 0.02, 0.006, W.DARK), [0, 0.085, 0.06]), screw([0.024, 0.04, 0.12], 0.006, [1, 0, 0])]);
}
function shotgun() {
  return merge([place(rb(0.05, 0.075, 0.18, 0.016, W.DARK), [0, 0.04, 0.04]), place(rb(0.044, 0.085, 0.22, 0.02, W.WOOD), [0, 0.02, -0.15]),
    place(bc(0.015, 0.36, 0.004, W.CHROME), [0, 0.06, 0.13], [P / 2, 0, 0]), place(bc(0.012, 0.28, 0.003, W.DARK), [0, 0.035, 0.13], [P / 2, 0, 0]),
    place(rb(0.032, 0.075, 0.036, 0.012, W.RUBBER), [0, -0.01, -0.01], [-0.2, 0, 0]), place(rb(0.04, 0.01, 0.06, 0.004, W.A), [0, 0.08, 0.04]), screw([0.026, 0.04, 0.05], 0.006, [1, 0, 0])]);
}
function pump() { return merge([place(rb(0.044, 0.04, 0.1, 0.014, W.WOOD), [0, 0, 0]), ...[0, 1, 2].map((i) => place(rb(0.046, 0.006, 0.006, 0.002, W.DARK), [0, -0.012 + i * 0.012, 0.0]))]); }
function grenade() { return merge([T(sph(0.035, 0, 12, 9), W.OLIVE), place(rb(0.074, 0.012, 0.074, 0.005, W.HAZ), [0, 0, 0]), place(bc(0.012, 0.025, 0.004, W.DARK), [0, 0.03, 0]), place(T(tor(0.011, 0.0025, 0, 4, 10), W.CHROME), [0.014, 0.05, 0], [0, 0, 0.4])]); }
function can() { return merge([lathe(prof([[0, 0, 0, W.CHROME], [0.028, 0, 0.004, W.CHROME], [0.028, 0.012, 0, W.CHROME], [0.028, 0.013, 0, W.A], [0.028, 0.067, 0, W.A], [0.028, 0.068, 0, W.CHROME], [0.028, 0.08, 0.004, W.CHROME], [0, 0.08, 0, W.CHROME]]), 14).translate(0, -0.04, 0), place(rb(0.058, 0.02, 0.058, 0.002, W.HAZ), [0, 0, 0])]); }
function mag() { return merge([place(rb(0.024, 0.09, 0.04, 0.008, W.DARK), [0, 0, 0]), place(rb(0.026, 0.012, 0.042, 0.004, W.BRASS), [0, 0.045, 0])]); }
function shell() { return merge([place(bc(0.009, 0.04, 0.002, W.A), [0, 0, 0]), place(bc(0.0095, 0.012, 0.002, W.BRASS), [0, 0, 0])]); }
function glob() { return T(sph(0.03, 0, 10, 8), W.GLOW); }

// fx: 'swing' melee kind; grip2 other hand; muzzle/eject for guns; mag/ammo for reloads
export const WEAPONS = {
  fists: { vi: 'Tay không', kind: 'fist', geo: null },
  bat: { vi: 'Gậy bóng chày', kind: 'm1', two: true, geo: bat, grip2: [0, 0.07, 0], dmg: 22, reach: 1.3 },
  pipe: { vi: 'Ống nước', kind: 'm1', geo: pipe, dmg: 18, reach: 1.2 },
  wrench: { vi: 'Cờ lê', kind: 'm1', geo: wrench, dmg: 20, reach: 1.15 },
  machete: { vi: 'Mã tấu', kind: 'm1', geo: machete, dmg: 26, reach: 1.25 },
  axe: { vi: 'Rìu', kind: 'm2', two: true, geo: axe, grip2: [0, 0.16, 0], dmg: 40, reach: 1.4 },
  sledge: { vi: 'Búa tạ', kind: 'm2', two: true, geo: sledge, grip2: [0, 0.2, 0], dmg: 55, reach: 1.5 },
  pistol: { vi: 'Súng lục', kind: 'pistol', geo: pistol, grip2: [0, -0.03, 0.0], muzzle: [0, 0.055, 0.14], eject: [0.02, 0.07, 0.04], mag: 8, rate: 0.42, dmg: 25, reload: 1.1 },
  pistol2: { vi: 'Súng lục 2 tay', kind: 'pistol', two: true, geo: pistol, grip2: [0, -0.03, 0.0], muzzle: [0, 0.055, 0.14], eject: [0.02, 0.07, 0.04], mag: 8, rate: 0.36, dmg: 25, reload: 1.1 },
  smg: { vi: 'Tiểu liên', kind: 'smg', two: true, geo: smg, grip2: [0, -0.05, 0.1], muzzle: [0, 0.05, 0.23], eject: [0.025, 0.06, 0.06], mag: 24, rate: 0.09, dmg: 9, reload: 1.4 },
  rifle: { vi: 'Súng trường', kind: 'rifle', two: true, geo: rifle, grip2: [0, 0.0, 0.24], muzzle: [0, 0.05, 0.5], eject: [0.03, 0.06, 0.08], stock: [0, 0.03, -0.25], mag: 6, rate: 0.62, dmg: 45, reload: 1.8 },
  shotgun: { vi: 'Súng săn', kind: 'shotgun', two: true, geo: shotgun, grip2: [0, 0.01, 0.2], pump: [0, 0.03, 0.2], muzzle: [0, 0.06, 0.32], eject: [0.03, 0.06, 0.05], stock: [0, 0.03, -0.24], mag: 5, rate: 0.95, dmg: 12, pellets: 6, reload: 2.2 },
  grenade: { vi: 'Lựu đạn', kind: 'throw', geo: grenade, proj: 'grenade' },
  can: { vi: 'Lon đồ hộp', kind: 'throw', geo: can, proj: 'can' },
};
export const WEAPON_IDS = Object.keys(WEAPONS);
const PARTS = { pump, grenade, can, mag, shell, glob };

/* ------------------------------------------------------------------ material: palette regions + chipped paint */
function weaponMat() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.2 });
  const u = { uWPal: { value: WPAL.map((h) => new THREE.Color(h)) } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aReg; varying float vReg; varying vec3 vOP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvReg = aReg; vOP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying float vReg; varying vec3 vOP; uniform vec3 uWPal[10];
float wh(vec3 p){ p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float wn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(mix(wh(i), wh(i+vec3(1,0,0)), f.x), mix(wh(i+vec3(0,1,0)), wh(i+vec3(1,1,0)), f.x), f.y), mix(mix(wh(i+vec3(0,0,1)), wh(i+vec3(1,0,1)), f.x), mix(wh(i+vec3(0,1,1)), wh(i+vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{ int r = int(vReg + .5); vec3 c = uWPal[r]; float ro = .45, me = .1; vec3 em = vec3(0.);
  bool paint = r < 2 || r == 8 || r == 9;
  if (r == 2) { ro = .45; me = .7; } else if (r == 3) { ro = .22; me = 1.; } else if (r == 4) { c *= .85 + .25 * wn(vOP * vec3(80., 8., 80.)); ro = .75; me = 0.; }
  else if (r == 5) { ro = .9; me = 0.; } else if (r == 6) { em = c * 2.2; } else if (r == 7) { ro = .3; me = 1.; }
  if (paint) { float n = .5*wn(vOP*60.) + .3*wn(vOP*130.) + .2*wn(vOP*260.); float ch = smoothstep(.66, .68, n); c = mix(c, vec3(.55,.56,.58), ch); me = mix(me, .9, ch); ro = mix(ro, .35, ch); }
  diffuseColor.rgb = c; roughnessFactor = ro; metalnessFactor = me; totalEmissiveRadiance = em; }`)
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  gl_FragColor.a = 0.0;');
  };
  m.customProgramCacheKey = () => 'roboweapon1';
  return m;
}

/* ------------------------------------------------------------------ the layer: instanced weapons, parts, debris, tracers, flashes */
export class WeaponLayer {
  constructor(scene, fx, cap = 48) {
    this.scene = scene; this.fx = fx; this.mat = weaponMat(); this.meshes = new Map(); this.cap = cap;
    for (const [id, d] of Object.entries(WEAPONS)) if (d.geo) this.meshes.set(id, this.mk(d.geo()));
    for (const [id, f] of Object.entries(PARTS)) this.meshes.set('part:' + id, this.mk(f()));
    this.debris = []; this.tr = new Tracers(scene); this.flashes = new Flashes(scene);
  }
  mk(geo) { const m = new THREE.InstancedMesh(geo, this.mat, this.cap); m.count = 0; m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; this.scene.add(m); return m; }
  begin() { for (const m of this.meshes.values()) m.count = 0; }
  add(id, M) { const m = this.meshes.get(id); if (!m || m.count >= this.cap) return; m.setMatrixAt(m.count++, M); }
  // thrown / dropped objects: { id, p, v, q, w, life, bounce, onLand }
  throwObj(o) { o.q = o.q || new THREE.Quaternion(); o.w = o.w || new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 12); o.t = 0; o.s = o.s || 1; this.debris.push(o); }
  end(dt) {
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const o = this.debris[i]; o.t += dt; o.v.y -= 9.8 * dt * (o.g ?? 1); o.p.addScaledVector(o.v, dt);
      _q.set(o.w.x * dt * 0.5, o.w.y * dt * 0.5, o.w.z * dt * 0.5, 0).multiply(o.q); o.q.set(o.q.x + _q.x, o.q.y + _q.y, o.q.z + _q.z, o.q.w + _q.w).normalize();
      const r = 0.04 * o.s;
      if (o.p.y < r) { o.p.y = r; if (o.onLand && !o.landed) { o.landed = true; if (o.onLand(o) === false) { this.debris.splice(i, 1); continue; } } o.v.y = Math.abs(o.v.y) * 0.35; o.v.x *= 0.6; o.v.z *= 0.6; o.w.multiplyScalar(0.6); }
      if (o.t > o.life) { this.debris.splice(i, 1); continue; }
      this.add(o.id, _m.compose(o.p, o.q, _s.set(o.s, o.s, o.s)));
    }
    for (const m of this.meshes.values()) { m.instanceMatrix.needsUpdate = true; m.visible = m.count > 0; }
    this.tr.update(dt); this.flashes.update(dt);
  }
}

// tracers: short additive lines from muzzle to hit, fading in ~70 ms
class Tracers {
  constructor(scene, N = 96) {
    this.N = N; this.list = [];
    const g = new THREE.BufferGeometry(); this.pos = new Float32Array(N * 6); this.col = new Float32Array(N * 6);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    m.blendEquationAlpha = THREE.AddEquation; m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor; m.blending = THREE.CustomBlending; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneFactor;
    this.lines = new THREE.LineSegments(g, m); this.lines.frustumCulled = false; this.lines.renderOrder = 6; scene.add(this.lines);
  }
  add(a, b, life = 0.07) { if (this.list.length >= this.N) this.list.shift(); this.list.push({ a: a.clone(), b: b.clone(), life, l0: life }); }
  update(dt) {
    let j = 0;
    this.list = this.list.filter((t) => (t.life -= dt) > 0);
    for (const t of this.list) {
      const k = t.life / t.l0, head = new THREE.Vector3().lerpVectors(t.a, t.b, 1 - k * 0.6);
      this.pos.set([t.a.x + (head.x - t.a.x) * 0.4, t.a.y + (head.y - t.a.y) * 0.4, t.a.z + (head.z - t.a.z) * 0.4, head.x, head.y, head.z], j * 6);
      this.col.set([0.5 * k, 0.35 * k, 0.1 * k, 3 * k, 2.4 * k, 1.2 * k], j * 6); j++;
    }
    this.lines.geometry.setDrawRange(0, j * 2); this.lines.geometry.attributes.position.needsUpdate = true; this.lines.geometry.attributes.color.needsUpdate = true; this.lines.visible = j > 0;
  }
}
// muzzle flashes / explosions: camera-facing star quads (additive) with a point light for the biggest
class Flashes {
  constructor(scene, N = 32) {
    this.list = []; this.N = N;
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(0.25, 'rgba(255,200,90,.9)'); gr.addColorStop(1, 'rgba(255,120,20,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,230,160,.8)'; for (let i = 0; i < 6; i++) { g.save(); g.translate(32, 32); g.rotate(i / 6 * P * 2); g.beginPath(); g.moveTo(0, -3); g.lineTo(30, 0); g.lineTo(0, 3); g.fill(); g.restore(); }
    this.tex = new THREE.CanvasTexture(c);
    this.sprites = Array.from({ length: N }, () => { const m = new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); const s = new THREE.Sprite(m); s.visible = false; s.renderOrder = 7; scene.add(s); return s; });
    this.light = new THREE.PointLight(0xffb060, 0, 7, 2); scene.add(this.light); this.li = 0;
  }
  add(p, size = 0.25, life = 0.06, light = 3) {
    const used = new Set(this.list.map((x) => x.s)); const s = this.sprites.find((x) => !used.has(x)) || this.sprites[0]; life = Math.max(life, 0.09); const o = { s, life, l0: life, size, fresh: true }; s.position.copy(p); s.visible = true; s.material.rotation = Math.random() * 6; this.list.push(o);
    if (light > this.li) { this.li = light; this.light.position.copy(p); }
  }
  update(dt) {
    this.list = this.list.filter((o) => { if (o.fresh) o.fresh = false; else o.life -= dt; if (o.life <= 0) { o.s.visible = false; return false; } const k = o.life / o.l0; o.s.scale.setScalar(o.size * (0.6 + 0.6 * k)); o.s.material.opacity = k; return true; });
    this.light.intensity = this.li * 1.2; this.li *= Math.exp(-dt * 30); if (this.li < 0.05) this.li = 0;
  }
}
