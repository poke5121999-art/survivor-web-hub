// BlockActor: one blocky character (block/builder.js) as a single SkinnedMesh, animated by rotating whole boxes at the
// neck, shoulders and hips (no elbows or knees, the classic blocky way). Same surface as VoxActor so index.html can
// swap it in: root, mesh, setMode(idle|ready|walk|run|attack|hit|death), update(dt, speed), vox(), tris(), draws().
import { THREE } from '../lib/lf-host.js';
import { buildBlock, pivots, BONES, PX, HOLD, GUNS, holdOf } from './builder.js';

const CACHE = new Map();
function protoOf(sp) {
  let p = CACHE.get(sp.id);
  if (!p) {
    const b = buildBlock(sp);
    const mk = (cv) => { if (!cv) return null; const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; return t; };
    p = { geo: b.geo, map: mk(b.tex.map), emissive: mk(b.tex.emissive), meta: b.meta, boxes: b.boxes, canvas: b.tex.map };
    CACHE.set(sp.id, p);
  }
  return p;
}
export function blockProto(sp) { return protoOf(sp); }

const PARENT = { root: null, body: 'root', head: 'body', armR: 'body', armL: 'body', legR: 'root', legL: 'root', dog: 'root', dogHead: 'dog', dogLegFR: 'dog', dogLegFL: 'dog', dogLegBR: 'dog', dogLegBL: 'dog', dogTail: 'dog' };

export class BlockActor {
  constructor(sp, o = {}) {
    this.sp = sp; this.def = { id: sp.id, speedK: 1 };
    const p = this.p = protoOf(sp), meta = this.meta = p.meta;
    const mat = this.mat = new THREE.MeshStandardMaterial({ map: p.map, roughness: 0.92, metalness: 0, alphaTest: 0.5, emissiveMap: p.emissive || null, emissive: p.emissive ? 0xffffff : 0x000000, emissiveIntensity: p.emissive ? 1.4 : 0 });
    const piv = pivots(meta), bones = {};
    for (const n of BONES) { const b = new THREE.Bone(); b.name = n; bones[n] = b; }
    for (const n of BONES) { const par = PARENT[n], pp = par ? piv[par] : [0, 0, 0], q = piv[n]; bones[n].position.set((q[0] - pp[0]) * PX, (q[1] - pp[1]) * PX, (q[2] - pp[2]) * PX); if (par) bones[par].add(bones[n]); }
    this.bones = bones; this.base = Object.fromEntries(BONES.map((n) => [n, bones[n].position.clone()]));
    const mesh = this.mesh = new THREE.SkinnedMesh(p.geo, mat);
    mesh.add(bones.root); mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(BONES.map((n) => bones[n])));
    mesh.frustumCulled = false;
    this.root = new THREE.Group(); this.root.add(mesh);
    this.hold = holdOf(meta, sp);
    if (meta.dog) { const d = meta.dog; this.dogPos = new THREE.Vector3((d.x || 0.55) > 0 ? 0.6 : -0.6, 0, 0.12); this.dogYaw = (d.x || 0.55) > 0 ? -0.35 : 0.35; bones.dog.scale.setScalar(d.k); bones.dog.position.copy(this.dogPos); bones.dog.rotation.y = this.dogYaw; }
    else bones.dog.scale.setScalar(0.0001);
    this.t = o.t0 || Math.random() * 10; this.ph = this.t * 1.7; this.mode = 'idle'; this.mt = 0; this.n = '';
    this.shadows(o.shadows !== false);
    this.update(0, 0);
  }
  shadows(on) { this.mesh.castShadow = on; }
  vox() { return this.p.boxes; }
  tris() { return this.p.geo.userData.tris; }
  draws() { return 1; }
  dispose() { this.mat.dispose(); }
  setMode(m) { this.mode = m; this.mt = 0; this.mat.emissive.setRGB(this.p.emissive ? 1 : 0, this.p.emissive ? 1 : 0, this.p.emissive ? 1 : 0); this.mesh.visible = true; }
  update(dt, speed = 0) {
    this.t += dt; this.mt += dt;
    const B = this.bones, t = this.t, m = this.mode, mt = this.mt, H = this.hold, zom = this.meta.zombie;
    const R = [...H.R], L = [...H.L]; let legR = 0, legL = 0, legRz = 0, legLz = 0;
    const body = [0, 0, 0], head = [0, 0, 0]; let bob = 0, fall = 0, sink = 0;
    const freeR = H === HOLD.none || H === HOLD.shield || H === HOLD.radio || H.R[0] > -0.45, freeL = H === HOLD.none || H === HOLD.drink || H === HOLD.shoulder || H.L[0] > -0.45;
    // idle breathing and a slow look around
    const br = Math.sin(t * 2.1);
    head[1] = Math.sin(t * 0.55) * 0.22; head[0] = Math.sin(t * 0.9) * 0.04;
    R[2] -= 0.03 + br * 0.025; L[2] += 0.03 + br * 0.025; bob = br * 0.12;
    if (zom) { body[2] = Math.sin(t * 0.8) * 0.06; head[2] = 0.18 + Math.sin(t * 0.7) * 0.08; head[0] = 0.12; R[0] += Math.sin(t * 1.3) * 0.08; L[0] += Math.sin(t * 1.3 + 1) * 0.08; }
    if (m === 'walk' || m === 'run') {
      const run = m === 'run', rate = (zom ? 2.6 : run ? 8.5 : 5.6) * Math.max(0.6, speed / (run ? 3.4 : 1.5));
      this.ph += dt * rate; const s = Math.sin(this.ph), amp = zom ? 0.38 : run ? 1.0 : 0.62;
      legR = s * amp; legL = -s * amp;
      if (freeR) R[0] += -s * amp * (zom ? 0.2 : 0.9); else R[0] += Math.sin(this.ph * 2) * 0.04;
      if (freeL) L[0] += s * amp * (zom ? 0.2 : 0.9); else L[0] += Math.sin(this.ph * 2) * 0.04;
      bob = Math.abs(Math.cos(this.ph)) * (run ? 0.9 : 0.5); body[0] = run ? 0.22 : zom ? 0.12 : 0.04; head[0] = run ? -0.12 : head[0]; head[1] *= 0.3;
      if (zom) { body[2] = Math.sin(this.ph) * 0.12; head[2] = 0.2 + Math.sin(this.ph) * 0.1; legRz = -0.05; legLz = 0.05; }
    } else if (m === 'ready') {
      legRz = -0.13; legLz = 0.13; body[0] = 0.12; bob = Math.sin(t * 6) * 0.25 - 0.3; head[1] *= 0.2;
      if (freeR) { R[0] = -0.85; R[2] = 0.15; } if (freeL) { L[0] = -0.6; L[2] = -0.3; }
    } else if (m === 'attack') {
      const T = 1.1, k = (mt % T) / T, ranged = this.meta.props.some((p) => GUNS.has(p) || p === 'pistol');
      legRz = -0.1; legLz = 0.1; head[1] = 0;
      if (zom) { const a = Math.sin(k * Math.PI * 2); R[0] = -1.45 - Math.max(0, a) * 0.9; L[0] = -1.45 - Math.max(0, -a) * 0.9; body[0] = 0.18 + Math.max(0, a) * 0.1; head[0] = -0.1; }
      else if (ranged) { const kick = k < 0.12 ? k / 0.12 : Math.max(0, 1 - (k - 0.12) / 0.3); if (H.R[0] > -0.9) { R[0] = -1.45; L[0] = -1.25; L[2] = -0.45; R[2] = 0.15; } R[0] -= kick * 0.35; L[0] -= kick * 0.3; body[0] = -kick * 0.08; }
      else {
        // wind up over the head, chop down across, recover
        const up = k < 0.38 ? k / 0.38 : k < 0.52 ? 1 - (k - 0.38) / 0.14 : 0, back = k < 0.52 ? 0 : k < 0.75 ? 1 - (k - 0.52) / 0.23 : 0;
        const ease = (x) => x * x * (3 - 2 * x);
        R[0] = -0.4 - ease(up) * 2.4 + (k >= 0.38 && k < 0.52 ? 0 : 0) - back * 0.5; R[2] = 0.05 + up * 0.1 + back * 0.35;
        body[1] = up * 0.35 - back * 0.3; body[0] = 0.05 + back * 0.12;
        if (H === HOLD.shield) L[0] = -0.6 - back * 0.4;
      }
    } else if (m === 'hit') {
      const T = 1.25, k = (mt % T) / T, e = Math.exp(-k * 7) * Math.min(1, k * 30);
      body[0] = -0.35 * e; head[0] = -0.45 * e; R[2] -= 0.7 * e; L[2] += 0.7 * e; R[0] -= 0.4 * e; L[0] -= 0.4 * e; legR = 0.25 * e; legL = -0.1 * e;
      const fl = e * 0.6; this.mat.emissive.setRGB(fl + (this.p.emissive ? 1 : 0), fl * 0.2 + (this.p.emissive ? 1 : 0), fl * 0.2 + (this.p.emissive ? 1 : 0)); this.mat.emissiveIntensity = this.p.emissive ? 1.4 : 1;
    } else if (m === 'death') {
      const k = Math.min(1, mt / 0.65), ease = k * k;
      fall = -ease * Math.PI / 2; R[0] = -0.6 * ease - 2.2 * ease; L[0] = -2.4 * ease; R[2] = -0.5 * ease; L[2] = 0.5 * ease; head[0] = -0.3 * ease; head[1] = 0; legR = -0.2 * ease; legL = 0.15 * ease;
      if (mt > 2.6) sink = Math.min(1, (mt - 2.6) / 0.8);
      if (mt > 3.6) this.setMode('death');
    }
    B.root.position.set(0, bob * PX + (fall ? 2 * PX * Math.min(1, -fall / 1.2) : 0) - sink * 6 * PX, 0); B.root.rotation.set(fall, 0, 0);
    B.body.rotation.set(body[0], body[1], body[2]);
    B.head.rotation.set(head[0], head[1], head[2]);
    B.armR.rotation.set(R[0], R[1], R[2]); B.armL.rotation.set(L[0], L[1], L[2]);
    B.legR.rotation.set(legR, 0, legRz); B.legL.rotation.set(legL, 0, legLz);
    if (this.meta.dog) {
      const moving = m === 'walk' || m === 'run', dph = this.ph * (m === 'run' ? 1.6 : 1.4);
      const s = moving ? Math.sin(dph) * (m === 'run' ? 0.9 : 0.6) : 0;
      B.dogLegFR.rotation.x = s; B.dogLegBL.rotation.x = s; B.dogLegFL.rotation.x = -s; B.dogLegBR.rotation.x = -s;
      B.dogTail.rotation.set(0.5, Math.sin(t * (moving ? 9 : 6)) * 0.5, 0);
      B.dogHead.rotation.set(m === 'attack' ? Math.sin(t * 14) * 0.2 - 0.1 : Math.sin(t * 0.8) * 0.08, moving ? 0 : Math.sin(t * 0.5 + 1) * 0.35, 0);
      B.dog.position.y = this.dogPos.y + (moving ? Math.abs(Math.cos(dph)) * 0.02 : 0) + (m === 'attack' ? Math.max(0, Math.sin(t * 7)) * 0.04 : 0);
      B.dog.rotation.z = m === 'death' ? Math.min(1, mt / 0.6) * 1.45 : 0;
      B.dog.rotation.x = m === 'hit' ? -0.2 * Math.exp(-((mt % 1.25) / 1.25) * 7) : 0;
    }
  }
}
