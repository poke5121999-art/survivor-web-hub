// Bright showcase stage for chibi characters (hand-written; does not use Lanternfall's night world/post).
// Renderer with Neutral tone mapping, a studio light rig (hemisphere + warm key + cool fill + rim) and a small
// PMREM environment, plus Actor: one character (and its pet) driven by HumanAnim with optional grip IK.
import { THREE } from '../lf-host.js';
import { Figure } from '../lf/kit.js';
import { HumanAnim } from '../lf/anim.js';
import { attachGrip } from '../arm-ik.js';
import { toonify } from './mat.js';
import { buildDog, DogAnim } from './dog.js';

export function createRenderer(canvas, o = {}) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: !!o.preserve });
  r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.NeutralToneMapping; r.toneMappingExposure = o.exposure || 1.0;
  r.shadowMap.enabled = !!o.shadows; r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.info.autoReset = false;
  return r;
}
// soft studio environment for reflections on plastic / metal / glass
export function studioEnv(renderer, o = {}) {
  const sc = new THREE.Scene(), geo = new THREE.SphereGeometry(10, 24, 12);
  const cols = new Float32Array(geo.attributes.position.count * 3);
  for (let i = 0; i < geo.attributes.position.count; i++) { const y = geo.attributes.position.getY(i) / 10, t = y * 0.5 + 0.5; const top = o.top || [0.9, 0.95, 1.05], bot = o.bot || [0.12, 0.11, 0.1]; for (let k = 0; k < 3; k++) cols[i * 3 + k] = bot[k] + (top[k] - bot[k]) * Math.pow(t, 1.4); }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  sc.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const pan = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.8, 3.5) })); pan.position.set(-4, 6, 5); pan.lookAt(0, 0, 0); sc.add(pan);
  const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromScene(sc, 0.04); pm.dispose();
  return rt.texture;
}
// light presets: 'studio' (bright showcase), 'campfire' (warm drum fire + cool ambient), 'workshop' (desk lamp)
export function addLights(scene, preset = 'studio', o = {}) {
  const L = {};
  if (preset === 'studio') {
    L.hemi = new THREE.HemisphereLight(0xdfe6f5, 0x2e2a28, 0.62); scene.add(L.hemi);
    L.key = new THREE.DirectionalLight(0xfff0dc, 3.1); L.key.position.set(-4, 9, 6); scene.add(L.key);
    L.fill = new THREE.DirectionalLight(0xbfd4ff, 0.45); L.fill.position.set(5, 3, 4); scene.add(L.fill);
    L.rim = new THREE.DirectionalLight(0xffffff, 2.3); L.rim.position.set(3, 5, -6); scene.add(L.rim);
  } else {
    L.hemi = new THREE.HemisphereLight(0xb4bcd6, 0x1c1c24, preset === 'campfire' ? 1.0 : 1.1); scene.add(L.hemi);
    L.moon = new THREE.DirectionalLight(0xd0daf2, preset === 'campfire' ? 1.3 : 1.6); L.moon.position.set(-3, 7, 6); scene.add(L.moon);
    L.rim = new THREE.DirectionalLight(0xcfdcff, 1.0); L.rim.position.set(3, 4, -6); scene.add(L.rim);
  }
  if (o.shadowLight) { const s = L[o.shadowLight]; s.castShadow = true; s.shadow.mapSize.set(2048, 2048); const cam = s.shadow.camera; cam.left = cam.bottom = -(o.shadowR || 4); cam.right = cam.top = o.shadowR || 4; cam.near = 0.5; cam.far = 30; s.shadow.bias = -0.0005; s.shadow.normalBias = 0.02; s.shadow.radius = 4; }
  return L;
}

const PROTOS = new Map();
export function protoFor(def) { let p = PROTOS.get(def.id); if (!p) { p = def.build(); PROTOS.set(def.id, p); } return p; }
export function clearProtos() { PROTOS.clear(); }

// one character (+ pet). update(dt, mode) with mode: idle | ready | walk | run | attack | hit | death
export class Actor {
  constructor(def, o = {}) {
    this.def = def; const p = protoFor(def);
    const f = this.fig = toonify(new Figure({ d: p.d }, p.rig)); f.fx = p.fx; f.P = p.P;
    if (def.grip) attachGrip(f, Object.assign({ w: 1 }, def.grip));
    this.an = new HumanAnim(f, def.style); this.an.t = o.t0 || Math.random() * 10; this.an.ph = o.ph || 0;
    this.sc = def.scale; f.mesh.scale.setScalar(this.sc);
    this.root = new THREE.Group(); this.root.add(f.mesh);
    if (def.pet && def.pet.kind === 'dog' && o.pet !== false) { this.dog = buildDog(def.pet); this.dogAn = new DogAnim(this.dog); this.dog.mesh.position.set(def.pet.x || 0.55, 0, def.pet.z || 0.15); this.dog.mesh.rotation.y = def.pet.yaw || 0.3; this.root.add(this.dog.mesh); this.dogAn.sit = !!def.pet.sit; }
    this.mode = 'idle'; this.t = 0; this.shadows(o.shadows !== false);
  }
  shadows(on) { this.fig.mesh.castShadow = on; this.fig.mesh.receiveShadow = false; if (this.dog) this.dog.mesh.castShadow = on; }
  tris() { return this.fig.d.I.length / 3 + (this.dog ? this.dog.d.I.length / 3 : 0); }
  draws() { return this.dog ? 2 : 1; }
  setMode(m) {
    const an = this.an; this.mode = m; this.t = 0; an.act = null; an.stag = 0; an.down = false; this.fig.u.uDissolve.value = 0; this.fig.mesh.visible = true;
    if (this.fig.grip) this.fig.grip.off = false; this.hitT = 0; this.pause = 0;
    if (m !== 'walk' && m !== 'run') { an.pin = null; an.lgL = an.lgR = null; }
  }
  // world transform of the root (for foot IK) is set by the caller before update
  update(dt, speed = 0) {
    const an = this.an, m = this.mode, f = this.fig, w = new THREE.Vector3(); this.t += dt;
    this.root.getWorldPosition(w); const yaw = this.root.rotation.y + (this.root.parent && this.root.parent.rotation ? this.root.parent.rotation.y : 0);
    an.xf = { x: w.x, z: w.z, f: yaw, s: this.sc }; an.ikOn = (m === 'walk' || m === 'run') && !this.def.noWalk;
    if (m === 'walk' || m === 'run') an.update(dt, speed / this.sc, false);
    else if (m === 'attack') { if (!an.act && this.pause <= 0) { an.play('attack', 0.5, 0.7); this.pause = 0.6; } if (!an.act) this.pause -= dt; an.update(dt, 0, true); }
    else if (m === 'hit') { this.hitT -= dt; if (this.hitT <= 0) { an.stag = Math.min(1.15, (an.stag || 0) + 1); an.stagDir = an.stagDir > 0 ? -1 : 1; this.hitT = 1.25; f.u.uFlash.value.setRGB(0.35, 0.25, 0.2); } f.u.uFlash.value.multiplyScalar(Math.exp(-dt * 9)); an.update(dt, 0, true); }
    else if (m === 'death') {
      an.down = true; if (f.grip) f.grip.off = true; an.update(dt, 0, false);
      const k = Math.min(1, Math.max(0, (this.t - 1.2) / 1.6)); f.u.uDissolve.value = k; f.u.uDisH.value = f.height * 0.7;
      if (this.t > 3.6) this.setMode('death');
    } else an.update(dt, 0, m === 'ready');
    if (this.dogAn) this.dogAn.update(dt, m === 'walk' || m === 'run' ? speed : 0);
  }
}
