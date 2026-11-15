// One robot: assembled from rigid parts (pelvis, torso shell, neck, head, ears, springy antennae, hat, two-segment
// arms and legs with hands and feet), posed procedurally every frame. Springs give every part secondary motion
// (torso tilt from inertia, head lag, antenna whip, hat wobble, floppy hands, squash and stretch); a small verlet
// ragdoll handles falling over and a scripted get-up blends back to standing.
import * as THREE from 'three';
import { R, place, merge, tor, sph, cyl } from './geo.js';
import { torso as torsoPart, pelvis as pelvisPart, head as headPart, ears as earsPart, antenna as antPart, hand as handPart, foot as footPart, limbSeg, joint, crateGeo } from './parts.js';
import { hatGeo, hatDef } from './hats.js';
import { botMat, EMO } from './mat.js';
import { SCHEMES, rng } from './crew.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Y = V(0, 1, 0), NY = V(0, -1, 0);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// 1D damped spring
class S1 { constructor(x = 0) { this.x = x; this.v = 0; } step(t, k, d, dt, f = 0) { this.v += (k * (t - this.x) - d * this.v + f) * dt; this.x += this.v * dt; return this.x; } }
class S3 { constructor(v) { this.x = v ? v.clone() : V(); this.v = V(); } step(t, k, d, dt) { this.v.x += (k * (t.x - this.x.x) - d * this.v.x) * dt; this.v.y += (k * (t.y - this.x.y) - d * this.v.y) * dt; this.v.z += (k * (t.z - this.x.z) - d * this.v.z) * dt; this.x.addScaledVector(this.v, dt); return this.x; } }
function noise1(t) { const i = Math.floor(t), f = t - i, h = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }; const u = f * f * (3 - 2 * f); return lerp(h(i), h(i + 1), u) * 2 - 1; }

// decal canvas: big number + sticker
const STICKERS = ['star', 'heart', 'bolt', 'smile', 'warn', 'flower', 'stripes', 'dots'];
function decalTex(spec, sch) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const hex = (h) => '#' + h.toString(16).padStart(6, '0');
  const st = STICKERS[spec.sticker % STICKERS.length];
  g.lineJoin = 'round';
  const num = String(spec.num).padStart(2, '0');
  g.font = 'bold 118px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 14; g.strokeStyle = hex(sch.B === sch.A ? 0xffffff : sch.B); g.strokeText(num, 112, 120); g.fillStyle = hex(sch.C); g.fillText(num, 112, 120);
  // sticker at the lower right, slightly rotated
  g.save(); g.translate(196, 196); g.rotate(-0.25 + (spec.seed % 5) * 0.12);
  g.fillStyle = '#f7f3e8'; g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 3;
  const col = hex(sch.glow), dark = '#222';
  if (st === 'star') { g.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 18 : 40; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fillStyle = '#ffd23f'; g.fill(); g.stroke(); }
  else if (st === 'heart') { g.beginPath(); g.moveTo(0, 30); g.bezierCurveTo(44, 0, 30, -36, 0, -14); g.bezierCurveTo(-30, -36, -44, 0, 0, 30); g.fillStyle = '#ff4d6d'; g.fill(); g.stroke(); }
  else if (st === 'bolt') { g.beginPath(); g.moveTo(8, -40); g.lineTo(-22, 6); g.lineTo(-2, 6); g.lineTo(-10, 40); g.lineTo(22, -8); g.lineTo(2, -8); g.closePath(); g.fillStyle = '#ffe14d'; g.fill(); g.stroke(); }
  else if (st === 'smile') { g.beginPath(); g.arc(0, 0, 36, 0, 7); g.fillStyle = '#ffd23f'; g.fill(); g.stroke(); g.fillStyle = dark; g.fillRect(-14, -14, 7, 12); g.fillRect(7, -14, 7, 12); g.beginPath(); g.lineWidth = 6; g.strokeStyle = dark; g.arc(0, 2, 20, 0.3, Math.PI - 0.3); g.stroke(); }
  else if (st === 'warn') { g.beginPath(); g.moveTo(0, -40); g.lineTo(40, 32); g.lineTo(-40, 32); g.closePath(); g.fillStyle = '#ffcc00'; g.fill(); g.lineWidth = 5; g.strokeStyle = dark; g.stroke(); g.fillStyle = dark; g.fillRect(-4, -16, 8, 28); g.fillRect(-4, 18, 8, 7); }
  else if (st === 'flower') { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.beginPath(); g.arc(Math.cos(a) * 20, Math.sin(a) * 20, 15, 0, 7); g.fillStyle = '#fff'; g.fill(); } g.beginPath(); g.arc(0, 0, 13, 0, 7); g.fillStyle = '#ffb703'; g.fill(); }
  else if (st === 'stripes') { g.beginPath(); g.rect(-40, -20, 80, 40); g.clip(); g.fillStyle = '#ffcc00'; g.fillRect(-40, -20, 80, 40); g.fillStyle = dark; for (let i = -5; i < 5; i++) { g.beginPath(); g.moveTo(i * 20, -20); g.lineTo(i * 20 + 10, -20); g.lineTo(i * 20 + 30, 20); g.lineTo(i * 20 + 20, 20); g.fill(); } }
  else { g.beginPath(); g.arc(0, 0, 34, 0, 7); g.fillStyle = col; g.fill(); g.stroke(); g.fillStyle = '#fff'; for (const [x, y] of [[-12, -10], [12, -6], [0, 14]]) { g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); } }
  g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

let ZTEX = null;
function zTex() {
  if (ZTEX) return ZTEX; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.font = 'bold 48px Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 6; g.strokeStyle = '#1b2433'; g.strokeText('z', 32, 34); g.fillStyle = '#cfe8ff'; g.fillText('z', 32, 34);
  ZTEX = new THREE.CanvasTexture(c); ZTEX.colorSpace = THREE.SRGBColorSpace; return ZTEX;
}

export const ANIMS = ['idle', 'walk', 'run', 'jump', 'carry', 'fall', 'wave', 'dance', 'scared', 'sleep'];
const ANIM_EMO = { idle: 'neutral', walk: 'neutral', run: 'happy', jump: 'happy', carry: 'strain', fall: 'scared', wave: 'happy', dance: 'love', scared: 'scared', sleep: 'sleepy' };

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = V(), _v2 = V(), _v3 = V();

export class Bot {
  constructor(spec, o = {}) {
    this.spec = spec; const sch = this.sch = SCHEMES[spec.scheme];
    const A = spec.swapAB ? sch.B : sch.A, B = spec.swapAB ? sch.A : sch.B;
    const pal = [A, B, sch.dark, 0xc6cad0, 0x0a0f13, 0x04060a, sch.glow, 0x1c1c1f, 0xece7db, A, sch.C];
    this.decal = decalTex(spec, { ...sch, A, B });
    const mat = this.mat = botMat(pal, { decal: this.decal, wear: spec.wear, seed: spec.seed % 97, dirt: 0.6, eye: sch.eye });
    const T = this.T = torsoPart(spec.torso), PV = this.PV = pelvisPart(T.w, T.round), Hd = this.Hd = headPart(spec.head);
    mat.userData.u.uDecalR.value.set(T.decal[0], T.decal[1], T.decal[2], 1);
    const f = Hd.face, u = mat.userData.u;
    u.uFace.value.x = f.mode; if (f.mode === 1) { u.uScr.value.set(...f.scr); u.uFace2.value.x = f.led; u.uFace2.value.y = f.mouth; }
    else { u.uLens0.value.set(...f.lens0); u.uLens1.value.set(...f.lens1); }
    // dims
    const FT = this.FT = footPart(spec.foot, spec.swapAB ? R.A : R.B);
    this.L = spec.legLen; this.l1 = this.L * 0.52; this.l2 = this.L * 0.52; this.fh = FT.fh;
    this.H = this.L * 0.94 + this.fh; this.gap = 0.028;
    this.a1 = spec.armLen * 0.5; this.a2 = spec.armLen * 0.5;
    this.torsoY = PV.top + this.gap; // torso origin in pelvis space
    this.neckLen = 0.045;
    // groups
    this.root = new THREE.Group(); this.root.userData.bot = this;
    this.pelvis = new THREE.Group(); this.root.add(this.pelvis);
    this.torso = new THREE.Group(); this.torso.position.y = this.torsoY; this.pelvis.add(this.torso);
    this.headG = new THREE.Group(); this.headG.position.y = T.neck + this.neckLen; this.torso.add(this.headG);
    this.headS = new THREE.Group(); this.headS.scale.setScalar(spec.headScale); this.headG.add(this.headS);
    const mk = (g, parent, shadow = true, m = mat) => { const me = new THREE.Mesh(g, m); me.castShadow = shadow; me.receiveShadow = true; parent.add(me); me.userData.bot = this; return me; };
    this.meshes = [];
    this.meshes.push(mk(PV.geo, this.pelvis), mk(T.geo, this.torso), mk(Hd.geo, this.headS));
    const eg = earsPart(spec.ears, Hd); if (eg) this.meshes.push(mk(eg, this.headS));
    // neck accordion (between torso top and head)
    this.neck = mk(neckGeo(), this.torso); this.neck.position.y = T.neck - 0.004;
    // antennae
    this.ants = [];
    for (const a of antPart(spec.ant)) {
      const mount = Hd.mounts[a.m] || Hd.mounts[0]; const base = new THREE.Group(); base.position.set(...mount); base.rotation.z = -(a.lean || 0); this.headS.add(base);
      const segs = []; let parent = base;
      for (const [g, len] of a.segs) { const piv = new THREE.Group(); parent.add(piv); mk(g, piv, false); segs.push({ piv, len }); const tipP = new THREE.Group(); tipP.position.y = len; piv.add(tipP); parent = tipP; }
      if (a.tip) mk(a.tip, parent, false);
      this.ants.push({ segs, k: a.k, bx: new S1(), bz: new S1() });
    }
    // hats / accessories (own palette)
    this.hats = [];
    const addHat = (id) => {
      if (!id) return; const d = hatDef(id), hg = hatGeo(id), r = rng(spec.seed + id.length * 31);
      let cols = d.cols.slice(); if (spec.hatCol && d.slot === 'top' && !['cone', 'chef', 'halo', 'crown'].includes(id)) cols = [sch.C === 0xffffff ? B : sch.C, A, B];
      const hm = botMat([cols[0], cols[1], 0x2b2b2e, 0xc6cad0, 0x0a0f13, 0x2a4a66, d.glow || sch.glow, 0x1c1c1f, 0xece7db, cols[0], cols[2]], { wear: 0.25, seed: spec.seed % 53 + 3, dirt: 0 });
      hm.side = THREE.DoubleSide;
      const piv = new THREE.Group(); let parent;
      if (d.slot === 'top') { parent = this.headS; piv.position.set(0, Hd.top + (d.y || 0) - 0.006, 0); piv.scale.setScalar(Hd.topR / 0.13); }
      else if (d.slot === 'face') { parent = this.headS; const fy = f.mode === 1 ? f.scr[1] + f.scr[2] * 0.2 : f.lens0[1]; piv.position.set(0, fy, Hd.front + 0.012); piv.scale.setScalar(f.mode === 2 && f.lens1[3] < 0 ? 1.2 : 1); }
      else if (d.slot === 'neck') { parent = this.torso; piv.position.set(0, T.neck + 0.01, 0); piv.scale.set(T.w / 0.12 * 0.75, 1, T.d / 0.11 * 0.75); }
      else { parent = this.torso; piv.position.set(0, T.h * 0.55, -T.d); }
      parent.add(piv); const me = mk(hg.geo, piv, d.slot === 'top', hm); this.meshes.push(me);
      let rot = null; if (hg.rotor) { rot = new THREE.Group(); rot.position.y = d.rotorY; piv.add(rot); mk(hg.rotor, rot, false, hm); }
      this.hats.push({ d, piv, rot, bx: new S1(), bz: new S1(), base: piv.rotation.clone() });
    };
    addHat(spec.hat); addHat(spec.acc);
    // limbs (children of root, posed in root space). upper segment includes the joint balls.
    const r = spec.limbR, lk = spec.limb;
    const upGeo = (len, top, bottom) => merge([limbSeg(lk, r, len), place(joint(top, R.CHROME).clone(), [0, 0, 0]), place(joint(bottom, R.DARK).clone(), [0, len, 0])]);
    const handReg = spec.swapAB ? R.A : (spec.seed % 3 === 0 ? R.WHITE : R.B);
    this.arm = [0, 1].map(() => ({ up: mk(upGeo(this.a1, 0.026, r * 1.8), this.root, false), lo: mk(limbSeg(lk, r * 0.9, this.a2), this.root, false), hand: mk(handPart(spec.hand, handReg), this.root, false) }));
    this.leg = [0, 1].map(() => ({ up: mk(upGeo(this.l1, 0.001, r * 2), this.root), lo: mk(limbSeg(lk, r, this.l2), this.root), foot: mk(FT.geo, this.root) }));
    this.pick = [this.meshes[0], this.meshes[1], this.meshes[2]];
    // blob shadow
    this.blob = o.blobTex ? new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: o.blobTex, transparent: true, depthWrite: false, opacity: 0.75 })) : null;
    if (this.blob) { this.blob.rotation.x = -Math.PI / 2; this.blob.position.y = 0.003; this.blob.scale.setScalar(T.w * 3.2); this.blob.renderOrder = -1; this.root.add(this.blob); }
    // sleep Zs
    this.zs = []; for (let i = 0; i < 3; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTex(), transparent: true, depthWrite: false })); s.scale.setScalar(0.08); s.visible = false; this.root.add(s); this.zs.push(s); }
    // state
    this.rand = rng(spec.seed * 31 + 7); this.ph = this.rand() * 6.28;
    this.anim = 'idle'; this.emote = null; this.t = this.rand() * 10; this.at = 0; this.phase = this.rand() * 6.28;
    this.treadmill = true; this.speed = 0; this.vel = V(); this.goal = null; this.face = null; this.maxSpeed = 0.55;
    this.tTilt = [new S1(), new S1()]; this.hRot = [new S1(), new S1(), new S1()]; this.squash = new S1(1);
    this.hands = [new S3(), new S3()]; this.handInit = false;
    this.prevW = null; this.prevV = V(); this.prevHW = null; this.prevHV = V();
    this.blinkT = 1 + this.rand() * 3; this.blink = 0; this.lookTarget = null; this.lookS = [new S1(), new S1()];
    this.idleLook = [0, 0]; this.idleLookT = 0; this.rag = null; this.getup = null; this.fallT = 0; this.fallStage = 'stand';
    this.carry = null; this.crate = null; this.extHands = null; this.shake = 0; this.emoNow = 'neutral';
    this.pose = { hip: V(), prot: V(), trot: V(), squash: 1, hrot: V(), feet: [V(), V()], fpitch: [0, 0], hands: [V(), V()], hspace: 'torso', emote: 'neutral', jitter: 0, handK: 1 };
    this.footPrev = [0, 0];
    this.root.traverse((ob) => { ob.matrixAutoUpdate = true; });
  }
  setAnim(a) {
    if (this.anim === a && a !== 'fall') return;
    if (this.rag || this.getup) { this.pendingAnim = a; if (a !== 'fall') return; }
    this.anim = a; this.at = 0; this.fallStage = 'stand'; this.fallT = 0;
    if (a === 'carry' && !this.crate) { this.crate = new THREE.Mesh(crateGeo(0.3, 0.22, 0.24), crateMat()); this.crate.castShadow = true; this.root.add(this.crate); }
    if (this.crate) this.crate.visible = a === 'carry';
  }
  // world-space knock: start the ragdoll with an impulse
  knock(dir, s = 1.6) {
    if (this.rag || this.getup) return;
    const ry = this.root.rotation.y, c = Math.cos(-ry), sn = Math.sin(-ry);
    const lx = dir.x * c + dir.z * sn, lz = -dir.x * sn + dir.z * c; // world -> root local
    this.startRag(V(lx * s, 0.7, lz * s));
  }
  // ---- per frame ----
  update(dt, cam) {
    dt = Math.min(dt, 1 / 20); this.t += dt; this.at += dt;
    const p = this.pose; this.basePose(p);
    // locomotion (non treadmill): integrate root towards goal
    let lv = _v.set(0, 0, 0);
    const roam = !this.treadmill || this.returning;
    if (roam && !this.rag && !this.getup) {
      if (this.returning) { this.goal = this.home; const d = Math.hypot(this.home.x - this.root.position.x, this.home.z - this.root.position.z); this.face = d < 0.12 ? this.homeYaw : null; if (d < 0.06 && this.vel.length() < 0.06) { this.returning = false; this.goal = null; this.face = null; this.vel.set(0, 0, 0); } }
      const want = V();
      if (this.goal) { want.set(this.goal.x - this.root.position.x, 0, this.goal.z - this.root.position.z); const d = want.length(); if (d < 0.05) want.set(0, 0, 0); else want.multiplyScalar(Math.min(this.maxSpeed, d * 2.2) / d); }
      this.vel.lerp(want, 1 - Math.exp(-dt * 5));
      this.root.position.addScaledVector(this.vel, dt);
      const sp = this.vel.length();
      let yawT = this.face !== null ? this.face : sp > 0.08 ? Math.atan2(this.vel.x, this.vel.z) : null;
      if (yawT !== null) { let d = yawT - this.root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); this.root.rotation.y += d * (1 - Math.exp(-dt * 7)); }
      const ry = this.root.rotation.y, c = Math.cos(ry), sn = Math.sin(ry);
      lv.set(this.vel.x * c - this.vel.z * sn, 0, this.vel.x * sn + this.vel.z * c);
      this.speed = sp;
    } else if (this.treadmill && !this.returning) { const sp = this.anim === 'walk' ? 0.42 : this.anim === 'run' ? 1.2 : 0; lv.set(0, 0, sp); this.speed = sp; }
    const anim = this.rag || this.getup ? 'ragdoll' : this.anim;
    if (anim === 'ragdoll') this.poseRagdoll(p, dt);
    else if (this.carry) this.poseCoCarry(p, dt, lv);
    else if (anim === 'walk' || anim === 'run' || ((!this.treadmill || this.returning) && (anim === 'idle' || anim === 'fall' || this.returning) && this.speed > 0.05)) this.poseGait(p, dt, lv, anim === 'run' || this.speed > 0.9);
    else if (anim === 'jump') this.poseJump(p, dt);
    else if (anim === 'carry') this.poseCarry(p, dt);
    else if (anim === 'fall') this.poseFall(p, dt);
    else if (anim === 'wave') this.poseWave(p, dt);
    else if (anim === 'dance') this.poseDance(p, dt);
    else if (anim === 'scared') this.poseScared(p, dt);
    else if (anim === 'sleep') this.poseSleep(p, dt);
    else this.poseIdle(p, dt);
    this.applyEmoteBody(p);
    this.apply(p, dt, cam);
  }
  basePose(p) {
    const T = this.T, hx = this.PV.hipX;
    p.hip.set(0, this.H, 0); p.prot.set(0, 0, 0); p.trot.set(0, 0, 0); p.squash = 1; p.hrot.set(0, 0, 0);
    p.feet[0].set(hx + 0.005, this.fh, 0); p.feet[1].set(-hx - 0.005, this.fh, 0); p.fpitch[0] = p.fpitch[1] = 0;
    const [sx, sy] = T.sh, A = this.a1 + this.a2;
    p.hands[0].set(sx + 0.035, sy - A * 0.9, 0.02); p.hands[1].set(-sx - 0.035, sy - A * 0.9, 0.02); p.hspace = 'torso'; p.handK = 1;
    p.emote = ANIM_EMO[this.anim] || 'neutral'; p.jitter = 0; p.ragdoll = false; p.footAlign = false;
  }
  poseIdle(p, dt) {
    const t = this.t; p.squash = 1 + 0.018 * Math.sin(t * 2.1 + this.ph);
    p.hip.x = 0.01 * Math.sin(t * 0.7 + this.ph); p.prot.z = 0.035 * Math.sin(t * 0.7 + this.ph); p.trot.z = -0.02 * Math.sin(t * 0.7 + this.ph);
    this.idleLookT -= dt; if (this.idleLookT <= 0) { this.idleLookT = 1.5 + this.rand() * 3; this.idleLook = this.rand() < 0.45 ? [0, 0] : [(this.rand() - 0.5) * 1.4, (this.rand() - 0.5) * 0.5]; }
    p.hrot.y = this.idleLook[0] * 0.6; p.hrot.x = -this.idleLook[1] * 0.5; p.hrot.z = 0.06 * Math.sin(t * 0.9 + this.ph);
    for (let i = 0; i < 2; i++) { p.hands[i].z += 0.01 * Math.sin(t * 1.3 + i); }
    // fidgets: a little boing, a curious head tilt, or a hand scratch of the head
    this.fidT = (this.fidT ?? 2 + this.rand() * 5) - dt;
    if (this.fidT <= 0) { this.fidT = 3 + this.rand() * 6; this.fid = Math.floor(this.rand() * 3); this.fidA = 0; if (this.fid === 0) { this.squash.v -= 2.2; } if (this.fid === 1) this.hRot[2].v += (this.rand() < 0.5 ? -1 : 1) * 4; }
    if (this.fid === 2 && this.fidA < 1.4) { this.fidA += dt; const k = Math.sin(Math.min(1, this.fidA / 1.4) * Math.PI); const i = this.spec.seed % 2, s = i ? -1 : 1; p.hands[i].lerp(_v2.set(s * 0.07, this.T.neck + 0.1 + 0.02 * Math.sin(this.fidA * 18), this.T.d * 0.3), k); p.hrot.z += -s * 0.15 * k; p.handK = 2; }
  }
  poseGait(p, dt, lv, run) {
    const sp = Math.hypot(lv.x, lv.z), L = this.L;
    const f = (run ? 2.9 : 2.1) * Math.sqrt(0.24 / L) * (0.6 + 0.4 * Math.min(1, sp / (run ? 1.2 : 0.42))), w = 2 * Math.PI * f;
    this.phase += w * dt; const ph = this.phase;
    const k = Math.min(1, sp / 0.15), dx = sp > 1e-4 ? lv.x / sp : 0, dz = sp > 1e-4 ? lv.z / sp : 1;
    const stride = Math.min(L * (run ? 0.75 : 0.55), sp / w * 1.6);
    const lift = (run ? 0.09 : 0.055) * k * (L / 0.24);
    for (let i = 0; i < 2; i++) {
      const pi = ph + i * Math.PI, c = Math.cos(pi), s = Math.sin(pi);
      p.feet[i].x += dx * stride * c; p.feet[i].z += dz * stride * c; p.feet[i].y += lift * Math.max(0, -s);
      p.fpitch[i] = -0.45 * Math.max(0, -s) * k * Math.sign(dz || 1) + 0.25 * Math.max(0, s) * k * (c > 0 ? 1 : 0);
      if (this.footPrev[i] < 0 && s >= 0) this.squash.v -= run ? 1.6 : 0.9; this.footPrev[i] = s;
      // arms swing against the same-side foot
      const sw = (run ? 0.14 : 0.09) * k;
      p.hands[i].z += -sw * c * 1.0 + (run ? 0.06 : 0.02); p.hands[i].y += run ? 0.09 + 0.04 * Math.max(0, -c) : 0.015 * Math.abs(c);
      p.hands[i].x += (i ? -1 : 1) * (run ? -0.01 : 0.01);
    }
    const s0 = Math.sin(ph);
    p.hip.y += -0.02 * k + (run ? 0.05 : 0.03) * Math.abs(Math.sin(ph)) * k * (L / 0.24) - (run ? 0.03 : 0);
    p.prot.z = 0.09 * s0 * k; p.hip.x += 0.012 * s0 * k; p.prot.y = 0.18 * Math.cos(ph) * k;
    p.trot.y = -0.12 * Math.cos(ph) * k; p.trot.x = (run ? 0.26 : 0.09) * k * dz; p.trot.z = -0.06 * s0 * k;
    p.hrot.x = -p.trot.x * 0.6 + 0.04 * Math.sin(ph * 2); p.hrot.z = 0.05 * s0;
    if (run) p.emote = 'happy';
  }
  poseJump(p, dt) {
    const u = this.at % 1.6, L = this.L, P = this.pose; const [sx, sy] = this.T.sh;
    let y = 0, crouch = 0;
    if (u < 0.32) { crouch = sstep(0, 0.32, u); p.squash = 1 - 0.12 * crouch; for (let i = 0; i < 2; i++) { p.hands[i].z -= 0.08 * crouch; p.hands[i].y += 0.02; } p.trot.x = 0.25 * crouch; p.emote = 'neutral'; }
    else if (u < 0.95) {
      const a = (u - 0.32) / 0.63; y = 4 * a * (1 - a) * 0.34; p.squash = 1 + 0.12 * (1 - a) * (a < 0.5 ? 1 : 0.4);
      if (!this._launched) { this._launched = true; this.squash.v += 3.5; }
      for (let i = 0; i < 2; i++) { const s = i ? -1 : 1; p.hands[i].set(s * (sx + 0.09), sy + this.a1 * 0.9, 0.03); p.feet[i].y += 0.05 * Math.sin(a * Math.PI); p.feet[i].z += 0.03; p.fpitch[i] = 0.3; }
      p.trot.x = -0.1; p.hrot.x = -0.25 * Math.sin(a * Math.PI);
    } else {
      if (this._launched) { this._launched = false; this.squash.v -= 6; this.hRot[0].v += 4; }
      crouch = 1 - sstep(0.95, 1.35, u); p.trot.x = 0.2 * crouch;
    }
    if (u < 0.32) this._launched = false;
    p.hip.y += y - 0.35 * L * crouch; for (let i = 0; i < 2; i++) p.feet[i].y += y;
    this.jumpY = y;
  }
  poseCarry(p, dt) {
    const t = this.at, L = this.L, cr = this.crate; const tz = this.T.d + 0.16;
    const heave = Math.sin(t * 2.4), sag = Math.max(0, Math.sin(t * 0.8 + 1.5)) ** 6; // every ~8 s the crate sags, then a heave
    const shake = noise1(t * 22) * 0.012 + noise1(t * 31 + 5) * 0.008;
    p.hip.y -= 0.24 * L + 0.03 * heave + 0.08 * sag; p.trot.x = -0.2 + 0.18 * sag + 0.04 * heave; p.prot.x = 0.12; p.squash = 0.93 - 0.06 * sag + 0.03 * heave; p.trot.z = 0.08 * noise1(t * 1.7);
    // stomp in place, slow
    const ph = t * 2 * Math.PI * 1.2;
    for (let i = 0; i < 2; i++) { const s = Math.sin(ph + i * Math.PI); p.feet[i].y += 0.03 * Math.max(0, s); p.feet[i].x *= 1.25; if (this.footPrev[i] < 0 && s >= 0) this.squash.v -= 0.7; this.footPrev[i] = s; }
    p.prot.z = 0.1 * Math.sin(ph); p.hip.x += 0.02 * Math.sin(ph); p.jitter = 0.008;
    const cy = this.H + this.torsoY + this.T.h * 0.45 - 0.24 * L - 0.12 * sag + 0.04 * heave + shake;
    cr.position.set(0.03 * Math.sin(ph), cy, tz); cr.rotation.set(0.15 * sag, 0.05 * Math.sin(t * 0.9), 0.1 * Math.sin(ph) + shake * 4);
    p.hspace = 'root'; p.handK = 3;
    for (let i = 0; i < 2; i++) { const s = i ? -1 : 1; _v2.set(s * (0.165), 0.02, 0).applyEuler(cr.rotation).add(cr.position); p.hands[i].copy(_v2); }
    p.hrot.x = 0.15 + 0.1 * sag; p.hrot.z = 0.08 * Math.sin(t * 1.3);
    p.emote = sag > 0.4 ? 'scared' : 'strain';
  }
  // co-op carry: hands go to world handle points given by the playground
  poseCoCarry(p, dt, lv) {
    const c = this.carry; this.poseGait(p, dt, lv, false);
    p.hip.y -= 0.15 * this.L; p.trot.x = -0.12; p.squash *= 0.96; p.jitter = 0.004;
    p.hspace = 'root'; p.handK = 3;
    for (let i = 0; i < 2; i++) p.hands[i].copy(this.root.worldToLocal(_v2.copy(c.hands[i])));
    p.emote = c.emote || 'strain'; p.hrot.x = 0.1;
  }
  poseWave(p, dt) {
    const t = this.at, [sx, sy] = this.T.sh, i = this.spec.seed % 2;
    const s = i ? -1 : 1;
    p.hands[i].set(s * (sx + 0.12 + 0.06 * Math.sin(t * 9)), sy + this.a1 * 1.15, 0.05 + 0.02 * Math.cos(t * 9));
    p.handK = 2.5; p.prot.z = -s * 0.05 * (1 + Math.sin(t * 4.5) * 0.5); p.trot.z = -s * 0.07; p.hrot.z = -s * (0.18 + 0.05 * Math.sin(t * 4.5)); p.hrot.y = s * 0.15;
    p.hands[1 - i].x -= s * 0.01; p.hip.y += 0.012 * Math.abs(Math.sin(t * 4.5));
    p.feet[i].y += 0.0; p.squash = 1 + 0.02 * Math.sin(t * 9);
  }
  poseDance(p, dt) {
    const b = this.at * 2.1 * Math.PI, [sx, sy] = this.T.sh;
    p.hip.y -= 0.045 * Math.abs(Math.sin(b)) + 0.02; p.hip.x = 0.05 * Math.sin(b / 2);
    p.prot.z = -0.14 * Math.sin(b / 2); p.trot.z = 0.2 * Math.sin(b / 2); p.trot.y = 0.25 * Math.sin(b / 4);
    p.hrot.x = 0.18 * Math.abs(Math.sin(b)) - 0.08; p.hrot.z = -0.22 * Math.sin(b / 2);
    for (let i = 0; i < 2; i++) {
      const s = i ? -1 : 1, up = Math.sin(b + i * Math.PI) > 0;
      p.hands[i].set(s * (sx + 0.1), up ? sy + this.a1 * 1.2 : sy - 0.02, up ? 0.04 : 0.1);
      const tap = Math.max(0, Math.sin(b / 2 + i * Math.PI)); p.feet[i].y += 0.05 * tap; p.feet[i].x += s * 0.03 * tap; p.fpitch[i] = 0.3 * tap;
    }
    p.handK = 1.8; p.squash = 1 - 0.06 * Math.abs(Math.cos(b));
    p.emote = Math.floor(this.at / 2.9) % 2 ? 'happy' : 'love';
  }
  poseScared(p, dt) {
    const t = this.at, L = this.L, T = this.T; const [sx] = T.sh;
    p.hip.y -= 0.28 * L; p.trot.x = 0.28; p.prot.x = 0.1;
    for (let i = 0; i < 2; i++) { const s = i ? -1 : 1; p.feet[i].x *= 0.75; p.hands[i].set(s * 0.06, T.neck + 0.07, T.d + 0.1); }
    p.handK = 2.5; p.jitter = 0.009; p.squash = 0.93;
    this.idleLookT -= dt; if (this.idleLookT <= 0) { this.idleLookT = 0.35 + this.rand() * 0.5; this.idleLook = [(this.rand() - 0.5) * 1.8, (this.rand() - 0.2) * 0.4]; }
    p.hrot.y = this.idleLook[0] * 0.6; p.hrot.x = -0.1 - this.idleLook[1] * 0.4;
  }
  poseSleep(p, dt) {
    const t = this.at, br = Math.sin(t * 1.25);
    const nod = (t % 6.5) / 6.5, jerk = nod > 0.93 ? 1 : 0;
    p.trot.x = 0.22 + 0.03 * br; p.squash = 1 + 0.03 * br; p.hip.y -= 0.03;
    p.hrot.x = jerk ? -0.1 : 0.15 + 0.4 * sstep(0, 0.9, nod); p.hrot.z = 0.15 * sstep(0, 0.9, nod);
    if (jerk && !this._jerk) { this.hRot[0].v -= 6; this.squash.v += 1.5; } this._jerk = jerk;
    p.emote = jerk ? 'scared' : 'sleepy';
    for (let i = 0; i < 2; i++) p.hands[i].z += 0.03;
    this.zOn = !jerk;
  }
  poseFall(p, dt) {
    // loop: stand -> trip -> ragdoll -> getup (handled in poseRagdoll) -> stand
    this.fallT += dt;
    if (this.fallStage === 'stand') { this.poseIdle(p, dt); p.emote = 'neutral'; if (this.fallT > 0.7) { this.fallStage = 'go'; this.fallT = 0; const a = (this.rand() - 0.5) * 1.2; this.startRag(V(Math.sin(a) * 1.5, 0.6, Math.cos(a) * 1.5)); } }
  }
  applyEmoteBody(p) {
    const e = this.emote || p.emote; this.emoNow = e; const t = this.t;
    if (!this.emote || this.rag) return;
    if (e === 'happy') { p.hrot.z += 0.15; p.hip.y += 0.012 * Math.abs(Math.sin(t * 6)); }
    else if (e === 'sad') { p.hrot.x += 0.3; p.trot.x += 0.08; }
    else if (e === 'angry') { p.hrot.x += 0.15; p.trot.x += 0.1; p.jitter = Math.max(p.jitter, 0.003); }
    else if (e === 'scared') p.jitter = Math.max(p.jitter, 0.007);
    else if (e === 'love') { p.hrot.z += 0.2 * Math.sin(t * 2.5); p.prot.z += 0.05 * Math.sin(t * 2.5); }
    else if (e === 'dizzy') { p.hrot.z += 0.18 * Math.sin(t * 4); p.hrot.x += 0.12 * Math.cos(t * 4); }
    else if (e === 'sleepy') p.hrot.x += 0.3;
    else if (e === 'dead') { p.hrot.z += 0.35; p.hrot.x += 0.2; p.trot.x += 0.1; }
  }
  // ---------- ragdoll ----------
  startRag(v0) {
    const T = this.T, top = this.torsoY + T.h, mid = this.torsoY + T.h * 0.5;
    const loc = [V(0, -0.045, 0), V(0, top, 0), V(T.w, mid, 0), V(-T.w, mid, 0), V(0, mid, T.d), V(0, mid, -T.d)];
    this.root.updateMatrixWorld(true);
    const pm = this.pelvis.matrix; // pelvis in root space
    const pts = loc.map((l) => l.clone().applyMatrix4(pm));
    const dt = 1 / 60, hTop = Math.max(0.1, top), prev = pts.map((q, i) => { const k = Math.max(0, loc[i].y) / hTop; return q.clone().addScaledVector(V(v0.x * (0.15 + 0.85 * k), v0.y * 0.5, v0.z * (0.15 + 0.85 * k)), -dt); });
    const cons = []; for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) cons.push([i, j, loc[i].distanceTo(loc[j])]);
    // head point
    const hc = V(0, T.neck + this.neckLen + this.Hd.h * 0.5 * this.spec.headScale, 0).applyMatrix4(this.torso.matrixWorld).applyMatrix4(_m.copy(this.root.matrixWorld).invert());
    const ext = [hc, ...this.armWrist.map((w) => w.clone()), ...this.ankle.map((a) => a.clone())];
    const extPrev = ext.map((q, i) => q.clone().addScaledVector(v0, i === 0 ? -dt : i < 3 ? -dt * 0.6 : 0));
    this.rag = { loc, pts, prev, cons, ext, extPrev, t: 0, still: 0, headD: loc[1].distanceTo(V(0, top + this.neckLen + this.Hd.h * 0.5 * this.spec.headScale - T.h * 0 - (T.neck - T.h), 0)), q: new THREE.Quaternion(), o: V() };
    this.rag.headD = hc.distanceTo(pts[1]);
    this.squash.v -= 2;
  }
  ragFrame(r) {
    // body frame from the 6 points
    const up = _v.copy(r.pts[1]).sub(r.pts[0]).normalize(), right = _v2.copy(r.pts[2]).sub(r.pts[3]);
    right.addScaledVector(up, -right.dot(up)).normalize(); const fwd = _v3.crossVectors(right, up);
    _m.makeBasis(right, up, fwd); r.q.setFromRotationMatrix(_m);
    // origin = centroid(world) - R * centroid(local)
    const cw = V(), cl = V(); for (let i = 0; i < 6; i++) { cw.add(r.pts[i]); cl.add(r.loc[i]); } cw.multiplyScalar(1 / 6); cl.multiplyScalar(1 / 6);
    r.o.copy(cw).sub(cl.applyQuaternion(r.q));
  }
  stepRag(dt) {
    const r = this.rag; r.t += dt; const n = 4, h = dt / n, g = -8.5;
    const T = this.T;
    for (let s = 0; s < n; s++) {
      let mv = 0;
      const integ = (P, Q, rad) => { for (let i = 0; i < P.length; i++) { const p = P[i], q = Q[i]; const vx = (p.x - q.x) * 0.996, vy = (p.y - q.y) * 0.996, vz = (p.z - q.z) * 0.996; q.copy(p); p.x += vx; p.y += vy + g * h * h; p.z += vz; mv += Math.abs(vx) + Math.abs(vy) + Math.abs(vz); } };
      integ(r.pts, r.prev); integ(r.ext, r.extPrev);
      for (let it = 0; it < 6; it++) {
        for (const [a, b, d] of r.cons) { const pa = r.pts[a], pb = r.pts[b]; _v.subVectors(pb, pa); const l = _v.length() || 1e-6, k = (l - d) / l * 0.5; pa.addScaledVector(_v, k); pb.addScaledVector(_v, -k); }
        for (let i = 0; i < 6; i++) { const p = r.pts[i]; if (p.y < 0.012) { p.y = 0.012; const q = r.prev[i]; q.x = lerp(q.x, p.x, 0.35); q.z = lerp(q.z, p.z, 0.35); } }
      }
      this.ragFrame(r);
      // attachments: head to the top point, wrists to shoulders, ankles to hips
      const sock = (l) => _v2.copy(l).applyQuaternion(r.q).add(r.o);
      const neckL = V(0, this.torsoY + T.neck, 0), hd = r.headD;
      const lim = [[neckL, hd, true], [V(T.sh[0], this.torsoY + T.sh[1], 0), this.a1 + this.a2], [V(-T.sh[0], this.torsoY + T.sh[1], 0), this.a1 + this.a2], [V(this.PV.hipX, -0.025, 0), this.l1 + this.l2 + 0.01], [V(-this.PV.hipX, -0.025, 0), this.l1 + this.l2 + 0.01]];
      for (let i = 0; i < 5; i++) {
        const [l, d, hard] = lim[i], s0 = sock(l).clone(), p = r.ext[i];
        _v.subVectors(p, s0); const len = _v.length() || 1e-6;
        if (hard || len > d) p.copy(s0).addScaledVector(_v, d / len);
        const rad = i === 0 ? this.Hd.h * 0.4 : i < 3 ? 0.025 : this.fh;
        if (p.y < rad) { p.y = rad; const q = r.extPrev[i]; q.x = lerp(q.x, p.x, 0.4); q.z = lerp(q.z, p.z, 0.4); }
      }
      if (s === n - 1) r.mv = mv;
    }
    if (r.mv < 0.004) r.still += dt; else r.still = 0;
  }
  poseRagdoll(p, dt) {
    if (this.rag) {
      this.stepRag(dt); const r = this.rag;
      p.ragdoll = true; p.footAlign = true; p.hspace = 'root'; p.handK = 6;
      p.emote = r.t < 0.5 ? 'scared' : 'dizzy';
      for (let i = 0; i < 2; i++) { p.hands[i].copy(r.ext[1 + i]); p.feet[i].copy(r.ext[3 + i]); }
      if ((r.still > 0.35 && r.t > 1.0) || r.t > 2.6) { if (r.down === undefined) r.down = 0; r.down += dt; if (r.down > 0.7) this.startGetup(); }
    }
    if (this.getup) {
      const G = this.getup; G.t += dt; const u = G.t;
      p.ragdoll = true; p.footAlign = u < 0.9; p.hspace = 'root'; p.handK = 4;
      const a = sstep(0, 0.55, u), b = sstep(0.5, 1.1, u);
      const qMid = _q.setFromEuler(_e.set(1.05, G.yaw, 0, 'YXZ')), qEnd = _q2.setFromEuler(_e.set(0, G.yaw, 0, 'YXZ'));
      const q = G.q0.clone().slerp(qMid, a).slerp(qEnd, b);
      const mid = V(G.p0.x, this.H * 0.38, G.p0.z), end = V(G.p0.x, this.H, G.p0.z);
      const pos = G.p0.clone().lerp(mid, a).lerp(end, b);
      G.q.copy(q); G.o.copy(pos);
      const fy = Math.sin(G.yaw), fz = Math.cos(G.yaw), rx = Math.cos(G.yaw), rz = -Math.sin(G.yaw);
      for (let i = 0; i < 2; i++) {
        const s = i ? -1 : 1;
        const stand = V(G.p0.x + rx * s * this.PV.hipX, this.fh, G.p0.z + rz * s * this.PV.hipX);
        const kneel = stand.clone().addScaledVector(V(fy, 0, fz), -0.05);
        p.feet[i].copy(G.f0[i]).lerp(kneel, a).lerp(stand, b); p.feet[i].y = Math.max(p.feet[i].y, this.fh) + 0.04 * Math.sin(Math.PI * clamp((u - 0.5 - i * 0.12) / 0.3, 0, 1));
        const plant = V(G.p0.x + rx * s * 0.12 + fy * 0.18, 0.03, G.p0.z + rz * s * 0.12 + fz * 0.18);
        const side = V(G.p0.x + rx * s * (this.T.w + 0.06), this.H + this.torsoY + this.T.sh[1] - (this.a1 + this.a2) * 0.9, G.p0.z + rz * s * (this.T.w + 0.06));
        p.hands[i].copy(G.h0[i]).lerp(plant, sstep(0, 0.3, u)).lerp(side, sstep(0.6, 1.1, u));
      }
      p.emote = u < 1.4 ? 'dizzy' : 'happy';
      if (u > 1.1 && !G.kick) { G.kick = true; this.squash.v -= 3; this.hRot[1].v += 6; }
      if (u > 1.25) { this.endGetup(); p.ragdoll = false; p.footAlign = false; this.basePose(p); }
    }
  }
  startGetup() {
    const r = this.rag; this.ragFrame(r);
    const up = V(0, 1, 0).applyQuaternion(r.q); const yaw = Math.atan2(up.x, up.z);
    this.getup = { t: 0, q0: r.q.clone(), p0: r.o.clone(), yaw: Math.abs(up.y) > 0.8 ? this.rand() * 6 : yaw, f0: [r.ext[3].clone(), r.ext[4].clone()], h0: [r.ext[1].clone(), r.ext[2].clone()], q: r.q.clone(), o: r.o.clone() };
    this.rag = null;
  }
  endGetup() {
    const G = this.getup; this.getup = null;
    // move the root to where the pelvis stands now and fold the yaw in
    const ry = this.root.rotation.y, c = Math.cos(ry), s = Math.sin(ry);
    this.root.position.x += G.p0.x * c + G.p0.z * s; this.root.position.z += -G.p0.x * s + G.p0.z * c;
    this.root.rotation.y = ry + G.yaw; if (this.treadmill && this.home) this.returning = true;
    this.pelvis.position.set(0, this.H, 0); this.pelvis.quaternion.identity();
    this.fallStage = 'stand'; this.fallT = -0.6; this.hRot[1].v += 5;
    if (this.pendingAnim) { const a = this.pendingAnim; this.pendingAnim = null; this.setAnim(a); }
    this.prevW = null;
  }
  // ---------- apply pose: springs, transforms, IK ----------
  apply(p, dt, cam) {
    const sub = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / sub;
    // pelvis
    if (p.ragdoll && (this.rag || this.getup)) { const src = this.rag || this.getup; this.pelvis.position.copy(src.o); this.pelvis.quaternion.copy(src.q); }
    else {
      this.pelvis.position.copy(p.hip);
      if (p.jitter) { this.pelvis.position.x += noise1(this.t * 37) * p.jitter; this.pelvis.position.y += noise1(this.t * 41 + 3) * p.jitter * 0.5; }
      this.pelvis.rotation.set(p.prot.x, p.prot.y, p.prot.z, 'YXZ');
    }
    this.pelvis.updateMatrix();
    // inertia of the torso top (world), drives torso tilt + head lag
    this.root.updateMatrixWorld(true);
    const tw = _v.set(0, this.T.h, 0).applyMatrix4(this.torso.matrixWorld);
    let ax = 0, az = 0, ay = 0;
    if (this.prevW) {
      const vx = (tw.x - this.prevW.x) / dt, vy = (tw.y - this.prevW.y) / dt, vz = (tw.z - this.prevW.z) / dt;
      const awx = (vx - this.prevV.x) / dt, awy = (vy - this.prevV.y) / dt, awz = (vz - this.prevV.z) / dt; this.prevV.set(vx, vy, vz);
      const ry = this.root.rotation.y, c = Math.cos(ry), s = Math.sin(ry);
      ax = clamp(awx * c - awz * s, -40, 40); az = clamp(awx * s + awz * c, -40, 40); ay = clamp(awy, -60, 60);
    } else this.prevW = V();
    this.prevW.copy(tw);
    const rag = p.ragdoll;
    for (let i = 0; i < sub; i++) {
      this.tTilt[0].step(rag ? 0 : p.trot.x, 140, 9, h, rag ? 0 : -az * 1.2);
      this.tTilt[1].step(rag ? 0 : p.trot.z, 140, 9, h, rag ? 0 : ax * 1.2);
      this.squash.step(p.squash, 260, 11, h, -ay * 0.04);
      this.hRot[0].step(p.hrot.x, 90, 7, h, -az * 2.2 + ay * 0.4);
      this.hRot[1].step(p.hrot.y, 70, 8, h);
      this.hRot[2].step(p.hrot.z, 90, 7, h, ax * 2.2);
    }
    const sq = clamp(this.squash.x, 0.7, 1.3);
    this.torso.rotation.set(this.tTilt[0].x, p.trot.y, this.tTilt[1].x, 'YXZ'); this.torso.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    if (p.jitter) { this.torso.rotation.z += noise1(this.t * 33 + 9) * p.jitter * 4; }
    // head: look target (eyes + head yaw)
    let lx = 0, ly = 0;
    if (cam && !rag && (this.lookAtCam || this.lookTarget)) {
      this.torso.updateMatrixWorld(true);
      const hp = _v2.set(0, this.T.neck + 0.15, 0).applyMatrix4(this.torso.matrixWorld);
      const tgt = this.lookTarget || cam.position; _v3.subVectors(tgt, hp);
      _q.copy(this.torso.getWorldQuaternion(_q2)).invert(); _v3.applyQuaternion(_q);
      const yaw = Math.atan2(_v3.x, _v3.z), pit = Math.atan2(_v3.y, Math.hypot(_v3.x, _v3.z));
      if (Math.abs(yaw) < 1.6) { lx = clamp(yaw * 0.9, -1, 1); ly = clamp(pit * 1.2, -1, 1); }
    }
    const hl = this.lookTarget || this.lookAtCam ? 0.5 : 0;
    this.headG.rotation.set(this.hRot[0].x - ly * hl * 0.4, this.hRot[1].x + lx * hl * 0.8, this.hRot[2].x, 'YXZ');
    this.neck.rotation.set(this.headG.rotation.x * 0.5, this.headG.rotation.y * 0.5, this.headG.rotation.z * 0.5, 'YXZ');
    const eyeX = this.lookS[0].step(clamp(lx * 0.6 + (p.hrot.y - this.hRot[1].x) * 0.8, -1, 1), 200, 22, dt), eyeY = this.lookS[1].step(clamp(ly * 0.6, -1, 1), 200, 22, dt);
    // blink
    this.blinkT -= dt; if (this.blinkT <= 0) { this.blinkT = 1.8 + this.rand() * 3.5; this.blinkS = 0; if (this.rand() < 0.2) this.dbl = true; }
    if (this.blinkS !== undefined) { this.blinkS += dt; const b = this.blinkS / 0.15; this.blink = b < 1 ? Math.sin(b * Math.PI) : 0; if (b >= 1) { this.blinkS = undefined; if (this.dbl) { this.dbl = false; this.blinkT = 0.08; } } }
    const emo = this.emote || p.emote; this.emoNow = emo;
    const u = this.mat.userData.u; u.uFace.value.y = EMO[emo] ?? 0; u.uFace.value.z = emo === 'neutral' || emo === 'angry' || emo === 'sad' ? this.blink : 0; u.uFace.value.w = this.t; u.uFace2.value.z = eyeX; u.uFace2.value.w = eyeY;
    this.root.updateMatrixWorld(true);
    // head acceleration for antennae / hats
    const hw = _v.set(0, this.Hd.top, 0).applyMatrix4(this.headS.matrixWorld);
    let hax = 0, hay = 0, haz = 0;
    if (this.prevHW) { const vx = (hw.x - this.prevHW.x) / dt, vy = (hw.y - this.prevHW.y) / dt, vz = (hw.z - this.prevHW.z) / dt; hax = clamp((vx - this.prevHV.x) / dt, -60, 60); hay = clamp((vy - this.prevHV.y) / dt, -60, 60); haz = clamp((vz - this.prevHV.z) / dt, -60, 60); this.prevHV.set(vx, vy, vz); } else this.prevHW = V();
    this.prevHW.copy(hw);
    // into head space (approx with the head world quaternion)
    this.headS.getWorldQuaternion(_q); _q.invert(); _v3.set(hax, hay, haz).applyQuaternion(_q); const hx = _v3.x, hz = _v3.z;
    // gravity in head space: lean antennae / hats down when the head tilts
    const gl = _v2.set(0, -1, 0).applyQuaternion(_q);
    for (const a of this.ants) {
      for (let i = 0; i < sub; i++) { a.bx.step(gl.z * 0.25, a.k, 2.2, h, -hz * 0.9 + (p.jitter ? noise1(this.t * 50) * 30 * p.jitter : 0)); a.bz.step(-gl.x * 0.25, a.k, 2.2, h, hx * 0.9); }
      a.bx.x = clamp(a.bx.x, -1.2, 1.2); a.bz.x = clamp(a.bz.x, -1.2, 1.2);
      a.segs.forEach((s, i) => { const f = i ? 0.9 : 0.6; s.piv.rotation.set(a.bx.x * f, 0, a.bz.x * f); if (this.spec.ant === 'coil' && i === 0) s.piv.scale.y = clamp(1 - hay * 0.004 + a.bx.v * 0.0, 0.6, 1.5); });
    }
    for (const H of this.hats) {
      const k = H.d.anim === 'sway' ? 45 : 160, gain = H.d.anim === 'sway' ? 0.5 : 0.12;
      for (let i = 0; i < sub; i++) { H.bx.step(0, k, 4, h, -hz * gain); H.bz.step(0, k, 4, h, hx * gain); }
      H.piv.rotation.set(H.base.x + clamp(H.bx.x, -0.5, 0.5), H.base.y, H.base.z + clamp(H.bz.x, -0.5, 0.5));
      if (H.rot) H.rot.rotation.y += dt * (10 + Math.abs(this.speed) * 18);
      if (H.d.anim === 'spin') H.piv.children[0].rotation.z += dt * 2.5;
      if (H.d.anim === 'float') H.piv.position.y = this.Hd.top + 0.01 * Math.sin(this.t * 2.5);
    }
    // Zs while sleeping
    const zOn = this.anim === 'sleep' && this.zOn && !rag;
    for (let i = 0; i < 3; i++) { const z = this.zs[i]; z.visible = zOn; if (zOn) { const k = ((this.t * 0.35 + i / 3) % 1); z.position.set(0.12 + k * 0.12 + Math.sin(k * 6 + i) * 0.03, this.H + this.torsoY + this.T.neck + this.Hd.h * this.spec.headScale + 0.05 + k * 0.25, 0.02); z.material.opacity = Math.sin(k * Math.PI); z.scale.setScalar(0.05 + k * 0.06); } }
    // limbs
    this.root.updateMatrixWorld(true);
    _m.copy(this.root.matrixWorld).invert();
    const tor2root = _m2.multiplyMatrices(_m, this.torso.matrixWorld);
    const pel2root = new THREE.Matrix4().multiplyMatrices(_m, this.pelvis.matrixWorld);
    this.armWrist = this.armWrist || [V(), V()]; this.ankle = this.ankle || [V(), V()];
    const T = this.T;
    for (let i = 0; i < 2; i++) {
      const s = i ? -1 : 1;
      const sh = V(s * T.sh[0], T.sh[1], T.sh[2]).applyMatrix4(tor2root);
      const tgt = p.hspace === 'torso' ? p.hands[i].clone().setX(p.hands[i].x).applyMatrix4(tor2root) : p.hands[i].clone();
      if (!this.handInit) this.hands[i].x.copy(tgt);
      const hk = 160 * p.handK;
      for (let j = 0; j < sub; j++) this.hands[i].step(tgt, hk, 2 * Math.sqrt(hk) * 0.55, h);
      const pole = V(s * 0.6, -0.3, -1).transformDirection(tor2root);
      const el = ik(sh, this.hands[i].x, this.a1, this.a2, pole), w = this.armWrist[i];
      segTo(this.arm[i].up, sh, el.b); segTo(this.arm[i].lo, el.b, el.c); w.copy(el.c);
      const hm = this.arm[i].hand; hm.position.copy(el.c); hm.quaternion.setFromUnitVectors(NY, _v.subVectors(el.c, el.b).normalize());
      if (p.hspace === 'root' && p.handK > 2 && !rag) { hm.quaternion.multiply(_q.setFromAxisAngle(Y, s * Math.PI / 2)); }
    }
    this.handInit = true;
    for (let i = 0; i < 2; i++) {
      const s = i ? -1 : 1;
      const hip = V(s * this.PV.hipX, -0.025, 0).applyMatrix4(pel2root);
      const ft = p.feet[i]; const ankle = this.ankle[i];
      const fwd = rag ? V(0, 0, 1).transformDirection(pel2root) : V(Math.sin(p.prot.y * 0.3), 0, 1);
      const pole = V(fwd.x, 0.15, fwd.z).normalize();
      const el = ik(hip, ft, this.l1, this.l2, pole);
      segTo(this.leg[i].up, hip, el.b); segTo(this.leg[i].lo, el.b, el.c); ankle.copy(el.c);
      const fm = this.leg[i].foot; fm.position.copy(el.c);
      if (p.footAlign) {
        const shin = _v.subVectors(el.b, el.c).normalize(); fm.quaternion.setFromUnitVectors(Y, shin);
        const yawq = _q.setFromAxisAngle(Y, Math.atan2(fwd.x, fwd.z)); fm.quaternion.multiply(yawq);
      } else fm.rotation.set(p.fpitch[i], p.prot.y * 0.3 + s * 0.08, 0, 'YXZ');
    }
    if (this.blob) {
      const px = this.pelvis.position.x, pz = this.pelvis.position.z, hy = this.jumpY || 0; this.blob.position.set(px, 0.003, pz);
      this.blob.scale.setScalar(T.w * 3.4 * (1 + (rag ? 0.4 : 0)) / (1 + hy * 2)); this.blob.material.opacity = 0.7 / (1 + hy * 5);
      if (this.anim !== 'jump') this.jumpY = 0;
    }
  }
  dispose() {
    this.root.traverse((o) => { if (o.material && o.material !== this.mat) { if (o.material.map === ZTEX) { o.material.dispose(); } else o.material.dispose?.(); } });
    this.mat.dispose(); this.decal.dispose(); this.root.removeFromParent();
  }
}

// 2-bone IK: a root, c target, lengths l1 l2, pole direction -> { b, c }
function ik(a, c, l1, l2, pole) {
  const d0 = _v.subVectors(c, a), d = clamp(d0.length(), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-4), dir = d0.normalize();
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const po = pole.clone().addScaledVector(dir, -pole.dot(dir)); if (po.lengthSq() < 1e-8) po.set(0, 0, 1); po.normalize();
  const b = a.clone().addScaledVector(dir, along).addScaledVector(po, hh);
  const cc = a.clone().addScaledVector(dir, d);
  return { b, c: cc };
}
function segTo(m, a, b) { m.position.copy(a); _v3.subVectors(b, a); m.quaternion.setFromUnitVectors(Y, _v3.normalize()); }
let NECK = null;
function neckGeo() {
  if (NECK) return NECK; const g = [];
  g.push(cyl(0.05, 0.045, 0.012, R.CHROME, 18).translate(0, 0.006, 0));
  for (let i = 0; i < 3; i++) g.push(place(tor(0.032 - i * 0.002, 0.011, R.RUBBER, 8, 20), [0, 0.02 + i * 0.015, 0], [Math.PI / 2, 0, 0]));
  g.push(cyl(0.024, 0.024, 0.06, R.DARK, 10).translate(0, 0.03, 0)); NECK = merge(g); return NECK;
}
let CM = null;
export function crateMat() { if (!CM) CM = botMat([0xb07a45, 0x8a5a2e, 0x2b2b2e, 0xc6cad0, 0, 0, 0xffaa00, 0x1c1c1f, 0xece7db, 0xb07a45, 0x333333], { wear: 0.6, seed: 5, dirt: 0.3 }); return CM; }
