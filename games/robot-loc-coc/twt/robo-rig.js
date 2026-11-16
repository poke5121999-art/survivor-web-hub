// Procedural animator for one crowd robot. No Object3D graph: the pose is solved straight into 24 rigid bone matrices
// (root space, bot units) that robo-crowd.js uploads to a float texture; the shader skins each vertex by its one bone.
// Motion comes from the bot-crew kit (../js/bot.js): springs on torso tilt, squash, head lag, antennae, hat, hands,
// a hanging basket and a loose panel; two-bone IK for arms and legs; plus the twt clips (pay, reach, bat swing, hammer,
// collapse, cheer, listen, guard; zombie claw, smash, slam, throw, jump, roar, stagger) and a death that knocks the
// head and a forearm off as free parts which fall and settle (the same settle makes the lying corpse).
import * as THREE from '../vendor/three.module.min.js';
import { installCombat } from './robo-combat.js';

export const B = { PELVIS: 0, TORSO: 1, HEAD: 2, ANT0: 3, ANT0B: 4, ANT1: 5, ANT1B: 6, LUP: 7, LFORE: 8, LHAND: 9, RUP: 10, RFORE: 11, RHAND: 12, LTHIGH: 13, LSHIN: 14, LFOOT: 15, RTHIGH: 16, RSHIN: 17, RFOOT: 18, BASKET: 19, CRATE: 20, WEAPON: 21, HAT: 22, DANGLE: 23 };
export const NB = 24;
export const EMO = { neutral: 0, happy: 1, scared: 2, angry: 3, dizzy: 4, sleepy: 5, love: 6, dead: 7, sad: 8, strain: 9 };

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Y = V(0, 1, 0), NY = V(0, -1, 0), ONE = V(1, 1, 1);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const bump = (u, a, b, c, d) => sstep(a, b, u) * (1 - sstep(c, d, u)); // rise a..b, hold, fall c..d
class S1 { constructor(x = 0) { this.x = x; this.v = 0; } step(t, k, d, dt, f = 0) { this.v += (k * (t - this.x) - d * this.v + f) * dt; this.x += this.v * dt; return this.x; } }
class S3 { constructor() { this.x = V(); this.v = V(); } step(t, k, d, dt) { this.v.x += (k * (t.x - this.x.x) - d * this.v.x) * dt; this.v.y += (k * (t.y - this.x.y) - d * this.v.y) * dt; this.v.z += (k * (t.z - this.x.z) - d * this.v.z) * dt; this.x.addScaledVector(this.v, dt); return this.x; } }
function noise1(t) { const i = Math.floor(t), f = t - i, h = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }; const u = f * f * (3 - 2 * f); return lerp(h(i), h(i + 1), u) * 2 - 1; }
function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let x = a; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const _v = V(), _v2 = V(), _v3 = V(), _v4 = V(), _s = V();
const _ikB = V(), _ikC = V(), _po = V(), _d0 = V();
// 2-bone IK: root a, target c, lengths l1 l2, pole -> writes _ikB (elbow), _ikC (end)
function ik(a, c, l1, l2, pole) {
  _d0.subVectors(c, a); const d = clamp(_d0.length(), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-4); _d0.normalize();
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  _po.copy(pole).addScaledVector(_d0, -pole.dot(_d0)); if (_po.lengthSq() < 1e-8) _po.set(0, 0, 1); _po.normalize();
  _ikB.copy(a).addScaledVector(_d0, along).addScaledVector(_po, hh); _ikC.copy(a).addScaledVector(_d0, d);
}
function segTo(M, a, b) { _v3.subVectors(b, a).normalize(); _q.setFromUnitVectors(Y, _v3); M.compose(a, _q, ONE); }
const mulT = (M, x, y, z) => M.multiply(_m.makeTranslation(x, y, z));
const mulE = (M, x, y, z, o = 'XYZ') => M.multiply(_m.makeRotationFromEuler(_e.set(x, y, z, o)));

// the parts that fly off when a zombie robot dies: [subtree root, ...children]
const HEAD_TREE = [B.HEAD, B.ANT0, B.ANT0B, B.ANT1, B.ANT1B, B.HAT];

export class RoboBody {
  constructor(proto, seed, o = {}) {
    this.P = proto; this.D = proto.dims; this.seed = seed >>> 0; this.zombie = !!o.zombie; this.kind = o.kind || 'human'; this.big = !!o.big;
    this.M = Array.from({ length: NB }, () => new THREE.Matrix4());
    this.hide = new Uint8Array(NB);
    const pr = this.D.props;
    if (!pr.basket) this.hide[B.BASKET] = 1; else this.hide[B.BASKET] = 1; // shown on demand
    this.hide[B.CRATE] = 1; this.hide[B.WEAPON] = pr.weapon && pr.weaponAlways ? 0 : 1;
    if (!this.D.hat) this.hide[B.HAT] = 1; if (!this.D.dangle) this.hide[B.DANGLE] = 1;
    if (this.D.ants.length < 2) { this.hide[B.ANT1] = this.hide[B.ANT1B] = 1; }
    if (this.D.ants.length < 1) { this.hide[B.ANT0] = this.hide[B.ANT0B] = 1; }
    for (const a of this.D.ants) if (a.n < 2) this.hide[a.b[1]] = 1;
    this.rand = rng(this.seed * 31 + 7); const r = this.rand;
    this.t = r() * 10; this.ph = r() * 6.28; this.phase = r() * 6.28; this.mpu = this.D.k; // metres per bot unit (adapter sets with the person scale)
    this.tTilt = [new S1(), new S1()]; this.hRot = [new S1(), new S1(), new S1()]; this.squash = new S1(1);
    this.hands = [new S3(), new S3()]; this.handInit = false; this.handV0 = [V(), V()];
    this.ants = this.D.ants.map(() => ({ bx: new S1(), bz: new S1() }));
    this.hatS = [new S1(), new S1()]; this.dangS = [new S1(), new S1()]; this.basS = [new S1(), new S1()];
    this.lookS = [new S1(), new S1()]; this.blinkT = 1 + r() * 3; this.blink = 0; this.blinkS = undefined;
    this.idleLook = [0, 0]; this.idleLookT = 0; this.fidT = 2 + r() * 5; this.fid = -1; this.fidA = 0;
    this.footPrev = [0, 0]; this.prevHipY = null; this.prevHipVY = 0;
    this.I = { sp: 0, run: false, carry: 'none', limp: 0, browse: 0, cheer: 0, listen: 0, ready: 0, chase: 0, lead: 0, gait: 0, arms: 0, splay: 0.06, hunch: 0, shake: 0, eyeOff: 0, scared: 0 };
    this.fc = null; this.shot = null; this.emote = null; this.emoNow = 'neutral';
    this.flash = 0; this.glowK = 1; this.eyeK = 1; this.eyeFlick = 0; this.glitchT = 1 + r() * 4; this.glitch = 0; this.stagT = 0;
    this.death = null; this.frozen = false; this.particles = false; this.ev = []; this.weap = null; this.wdef = null; this.actS = null; this.explode = false;
    this.pose = { hip: V(), prot: V(), trot: V(), squash: 1, hrot: V(), feet: [V(), V()], fpitch: [0, 0], hands: [V(), V()], hspace: 'torso', handK: 1, emote: 'neutral', jitter: 0, wp: 2.3, wr: 0, crate: null, footAlign: false, eyeK: 1 };
    this.params = new Float32Array(8);
    this.solveRest();
  }
  solveRest() { this.basePose(this.pose); this.poseIdle(this.pose, 0); this.apply(this.pose, 1 / 60, null); }
  setHidden(b, h) { this.hide[b] = h ? 1 : 0; }
  // forced clip at progress u (0..1), held until release(); one-shot clip: hit lands at u 0.75 after tHit, then tRec
  force(name, u) { this.fc = { name, u: clamp(u, 0, 1) }; }
  release() { this.fc = null; }
  play(name, tHit, tRec) { this.shot = { name, t: 0, tHit: Math.max(0.05, tHit), tRec: Math.max(0.05, tRec) }; }
  stagger(k = 1) { this.tTilt[0].v -= 7 * k; this.hRot[0].v -= 9 * k; this.hRot[2].v += (this.rand() - 0.5) * 12 * k; this.squash.v += 2.2 * k; this.flash = 1; this.stagT = 0.45; this.eyeFlick = 0.12; }

  // ---------------- per frame ----------------
  // ctx: { ax, az } root-frame acceleration (bot units / s^2), look: root-space point or null
  update(dt, ctx = {}) {
    if (this.frozen) return;
    dt = Math.min(dt, 1 / 15); this.t += dt; this.ev.length = 0; if (this.evPend && this.evPend.length) { this.ev.push(...this.evPend); this.evPend.length = 0; } this.dtNow = dt;
    const p = this.pose; this.basePose(p);
    const I = this.I, sh = this.shot;
    if (sh) { sh.t += dt; if (sh.t >= sh.tHit + sh.tRec) this.shot = null; }
    // robot glitch: zombies stutter (hold the last pose a few frames) and their eyes flicker
    if (this.zombie && !this.death && !this.actS) {
      this.glitchT -= dt; if (this.glitchT <= 0) { this.glitchT = 1.2 + this.rand() * 3.5; this.glitch = 0.07 + this.rand() * 0.12; this.hRot[1].v += (this.rand() - 0.5) * 14; this.eyeFlick = 0.1; }
      if (this.glitch > 0) { this.glitch -= dt; this.params[6] = 0.25; return; }
    }
    if (this.stagT > 0) this.stagT -= dt;
    const fc = this.fc, dying = fc && (fc.name === 'die' || fc.name === 'down' || fc.name === 'downB' || fc.name === 'collapse');
    if (!dying) {
      const asp = Math.abs(I.sp);
      if (asp > 0.04) this.poseGait(p, dt, I.sp, I.run); else this.poseIdle(p, dt);
      if (this.zombie) this.zArms(p, dt); else this.carryOverlay(p, dt);
      if (!this.zombie) this.humanOverlays(p, dt);
    }
    if (fc) this.clip(p, fc.name, fc.u, dt);
    if (sh) { const u = sh.t < sh.tHit ? 0.75 * sh.t / sh.tHit : 0.75 + 0.25 * (sh.t - sh.tHit) / sh.tRec; this.clip(p, sh.name, u, dt); }
    if (this.wdef && !dying) this.armedStance(p);
    if (this.actS && !this.death) { const nm = this.actS.name; this._idle = null; const u = this.stepAct(dt); if (u !== null) this.combat(p, nm, u); }
    if (this.stagT > 0) { p.emote = 'dizzy'; p.jitter = Math.max(p.jitter, 0.006); }
    if (I.shake) { p.jitter = Math.max(p.jitter, 0.01); }
    if (I.scared && !this.zombie) p.emote = 'scared';
    this.applyEmoteBody(p);
    this.apply(p, dt, ctx);
    if (this.death) this.stepDeath(dt);
    this.writeParams(dt, p);
  }
  basePose(p) {
    const D = this.D, T = D.T, hx = D.hipX;
    p.hip.set(0, D.H, 0); p.prot.set(0, 0, 0); p.trot.set(0, 0, 0); p.squash = 1; p.hrot.set(0, 0, 0);
    p.feet[0].set(hx + 0.005, D.fh, 0); p.feet[1].set(-hx - 0.005, D.fh, 0); p.fpitch[0] = p.fpitch[1] = 0;
    const [sx, sy] = T.sh, A = D.a1 + D.a2;
    p.hands[0].set(sx + 0.035, sy - A * 0.9, 0.02); p.hands[1].set(-sx - 0.035, sy - A * 0.9, 0.02); p.hspace = 'torso'; p.handK = 1;
    p.emote = this.zombie ? 'angry' : 'neutral'; p.jitter = 0; p.footAlign = false; p.wp = 2.3; p.wr = 0; p.crate = null; p.eyeK = 1;
    if (this.zombie) { p.trot.x = 0.12 + this.I.hunch; p.hrot.x = -0.1 - this.I.hunch * 0.5; }
  }
  poseIdle(p, dt) {
    const t = this.t, D = this.D; this.walkK = 0;
    p.squash = 1 + 0.018 * Math.sin(t * 2.1 + this.ph);
    p.hip.x = 0.01 * Math.sin(t * 0.7 + this.ph); p.prot.z = 0.035 * Math.sin(t * 0.7 + this.ph); p.trot.z = -0.02 * Math.sin(t * 0.7 + this.ph);
    this.idleLookT -= dt; if (this.idleLookT <= 0) { this.idleLookT = 1.5 + this.rand() * 3; this.idleLook = this.rand() < 0.45 ? [0, 0] : [(this.rand() - 0.5) * 1.4, (this.rand() - 0.5) * 0.5]; }
    p.hrot.y += this.idleLook[0] * 0.6; p.hrot.x += -this.idleLook[1] * 0.5; p.hrot.z = 0.06 * Math.sin(t * 0.9 + this.ph);
    for (let i = 0; i < 2; i++) p.hands[i].z += 0.01 * Math.sin(t * 1.3 + i);
    if (this.zombie) { p.prot.z += 0.05 * Math.sin(t * 0.9 + this.ph); p.hip.y -= 0.02 * D.L; return; }
    this.fidT -= dt;
    if (this.fidT <= 0) { this.fidT = 3 + this.rand() * 6; this.fid = Math.floor(this.rand() * 3); this.fidA = 0; if (this.fid === 0) this.squash.v -= 2.2; if (this.fid === 1) this.hRot[2].v += (this.rand() < 0.5 ? -1 : 1) * 4; }
    if (this.fid === 2 && this.fidA < 1.4 && this.I.carry === 'none') { this.fidA += dt; const k = Math.sin(Math.min(1, this.fidA / 1.4) * Math.PI); const i = this.seed % 2, s = i ? -1 : 1; p.hands[i].lerp(_v2.set(s * 0.07, D.T.neck + 0.1 + 0.02 * Math.sin(this.fidA * 18), D.T.d * 0.3), k); p.hrot.z += -s * 0.15 * k; p.handK = 2; }
  }
  // walk / run / shamble; sp signed bot units / s (negative walks backwards)
  poseGait(p, dt, sp, run) {
    const D = this.D, L = D.L, asp = Math.abs(sp), dz = sp >= 0 ? 1 : -1, Z = this.zombie, I = this.I;
    const gid = Z ? I.gait : -1;
    let f = (run ? 2.9 : 2.1) * Math.sqrt(0.24 / L) * (0.6 + 0.4 * Math.min(1, asp / (run ? 1.2 : 0.42)));
    if (Z) f *= this.big ? 0.62 : 0.82;
    let w = 2 * Math.PI * f;
    const maxStride = L * (run ? 0.72 : 0.55) * (gid === 3 ? 1.15 : 1);
    let stride = asp / w * 1.6; if (stride > maxStride) { w = asp * 1.6 / maxStride; stride = maxStride; }
    this.phase += w * dt; const ph = this.phase;
    const k = Math.min(1, asp / 0.12);
    let lift = (run ? 0.09 : 0.055) * k * (L / 0.24) * (Z ? (gid === 0 ? 0.35 : 0.6) : 1);
    if (I.limp) lift *= 0.7;
    for (let i = 0; i < 2; i++) {
      const pi = ph + i * Math.PI, c = Math.cos(pi), s = Math.sin(pi);
      let st = stride, li = lift, zo = 0;
      if (gid === 1 && i === 0) st *= 0.4; // short left step
      if (gid === 2 && i === 1) { st *= 0.45; li = 0.004; zo = -0.05 * L / 0.3; } // dragged right leg
      if (I.limp && i === 1) { st *= 0.55; li *= 0.4; }
      p.feet[i].z += dz * st * c + zo; p.feet[i].y += li * Math.max(0, -s);
      p.fpitch[i] = (-0.45 * Math.max(0, -s) * k * dz + 0.25 * Math.max(0, s) * k * (c > 0 ? 1 : 0)) * (Z ? 0.5 : 1);
      if (gid === 2 && i === 1) p.fpitch[i] = 0.45;
      if (this.footPrev[i] < 0 && s >= 0) this.squash.v -= (run ? 1.6 : 0.9) * (this.big ? 1.6 : 1); this.footPrev[i] = s;
      const sw = (run ? 0.14 : 0.09) * k;
      p.hands[i].z += -sw * c + (run ? 0.06 : 0.02); p.hands[i].y += run ? 0.09 + 0.04 * Math.max(0, -c) : 0.015 * Math.abs(c);
      p.hands[i].x += (i ? -1 : 1) * (run ? -0.01 : 0.01);
    }
    const s0 = Math.sin(ph);
    p.hip.y += -0.02 * k + (run ? 0.05 : 0.03) * Math.abs(Math.sin(ph)) * k * (L / 0.24) * (Z ? 0.6 : 1) - (run ? 0.03 : 0);
    p.prot.z = 0.09 * s0 * k * (Z ? 1.6 : 1); p.hip.x += 0.012 * s0 * k * (Z ? 2 : 1); p.prot.y = 0.18 * Math.cos(ph) * k;
    p.trot.y = -0.12 * Math.cos(ph) * k; p.trot.x += (run ? 0.26 : 0.09) * k * dz; p.trot.z = -0.06 * s0 * k;
    p.hrot.x += -p.trot.x * 0.5 + 0.04 * Math.sin(ph * 2); p.hrot.z = 0.05 * s0;
    if (Z) {
      if (gid === 1) { p.hip.y -= 0.035 * Math.max(0, -s0) * k; p.prot.z += 0.08 * s0 * k; p.hrot.z -= 0.08 * s0 * k; }
      if (gid === 2) { p.trot.z -= 0.12 * k; p.prot.z += 0.07 * k; p.hip.y -= 0.03 * k; }
      if (gid === 3) { p.trot.x += 0.18 * k; }
      if (I.chase) { p.trot.x += 0.14 * k; p.hrot.x -= 0.12 * k; }
      // jerky: snap the head now and then and add servo buzz
      p.hrot.y += 0.25 * Math.pow(Math.max(0, Math.sin(this.t * 1.1 + this.ph)), 24) * Math.sin(this.t * 31);
      p.jitter = Math.max(p.jitter, 0.003);
    }
    if (I.limp) { p.hip.y -= 0.035 * Math.max(0, s0) * k; p.trot.z -= 0.08 * s0 * k; }
    this.walkK = k;
  }
  // zombie arm styles (Rust: floor(seed/7)%5) and kind postures
  zArms(p, dt) {
    const D = this.D, T = D.T, [sx, sy] = T.sh, A = D.a1 + D.a2, t = this.t, I = this.I, ph = this.phase, k = this.walkK || 0;
    const sway = (i) => 0.025 * Math.sin(t * (1.9 + i * 0.4) + this.ph + i);
    const H = p.hands;
    const reach = (i) => { const s = i ? -1 : 1; H[i].set(s * sx * 0.75, sy + 0.01 + sway(i), T.d + A * 0.78 + 0.03 * Math.sin(ph + i * Math.PI) * k); };
    const dangle = (i) => { H[i].x += (i ? 1 : -1) * 0.01; H[i].z += 0.04 * Math.sin(t * 2.3 + i); };
    const k2 = this.kind;
    if (k2 === 'Base' || k2 === 'Tumour') {
      switch (I.arms) {
        case 0: reach(0); reach(1); break;
        case 1: reach(0); dangle(1); break;
        case 2: dangle(0); dangle(1); break;
        case 3: for (let i = 0; i < 2; i++) { const s = i ? -1 : 1; H[i].set(s * sx * 0.85, sy + A * 0.62 + sway(i), T.d + A * 0.32); } break;
        default: H[1].set(-sx * 0.9, sy + A * 0.7 + sway(1), T.d * 0.6); reach(0); H[0].y -= A * 0.25;
      }
      for (let i = 0; i < 2; i++) H[i].x += (i ? -1 : 1) * I.splay * 0.3;
    } else if (this.big) { for (let i = 0; i < 2; i++) { const s = i ? -1 : 1; H[i].set(s * (sx + 0.1), sy - A * 0.78, 0.08 + 0.05 * Math.sin(ph + i * Math.PI) * k); } }
    else if (k2 === 'Sweaty') { for (let i = 0; i < 2; i++) { const s = i ? -1 : 1; H[i].set(s * (sx + A * 0.45), sy - A * 0.55, 0.02); } }
    else if (k2 === 'Birther') { for (let i = 0; i < 2; i++) { const s = i ? -1 : 1; H[i].set(s * sx * 0.55, sy - A * 0.45, T.d + 0.08); } }
    else if (k2 === 'Baby') { reach(0); reach(1); for (let i = 0; i < 2; i++) H[i].y += A * 0.25; }
    else if (k2 === 'TwinBuff') { for (let i = 0; i < 2; i++) { const s = i ? -1 : 1; H[i].set(s * sx * 0.55, sy - 0.02 + 0.02 * Math.sin(t * 5 + i * 2), T.d + A * 0.38); } p.handK = 2; }
    else if (k2 === 'TwinHeal') { for (let i = 0; i < 2; i++) { const s = i ? -1 : 1; H[i].set(s * (sx + 0.08), sy - A * 0.6, 0.06 + 0.03 * Math.sin(t * 1.4 + i)); } }
  }
  carryOverlay(p, dt) {
    const D = this.D, T = D.T, [sx, sy] = T.sh, A = D.a1 + D.a2, c = this.I.carry, H = p.hands;
    if (c === 'basket' || c === 'hurtB') { H[0].set(sx + 0.05, sy - A * 0.72, 0.06); p.handK = Math.max(p.handK, 1.5); }
    if (c === 'crate') {
      const cz = T.d + 0.16, cy = T.h * 0.42; p.crate = [0, cy, cz];
      H[0].set(0.165, cy + 0.02, cz); H[1].set(-0.165, cy + 0.02, cz); p.handK = 3; p.trot.x -= 0.16; p.squash *= 0.96; p.hip.y -= 0.06 * D.L; p.emote = 'strain'; p.jitter = Math.max(p.jitter, 0.003);
    }
    if (c === 'bat') { H[1].set(-sx - 0.03, sy - A * 0.68, 0.09); p.wp = 2.1; p.wr = 0.25; }
    if (c === 'hammer') { H[1].set(-sx - 0.035, sy - A * 0.72, 0.06); p.wp = 2.5; p.wr = 0; }
    if (c === 'hurt' || c === 'hurtB') { H[c === 'hurt' ? 0 : 1].set(c === 'hurt' ? 0.05 : -0.05, T.h * 0.3, T.d + 0.05); p.trot.x += 0.2; p.hrot.x += 0.15; p.handK = 2; p.emote = 'sad'; }
  }
  humanOverlays(p, dt) {
    const D = this.D, T = D.T, [sx, sy] = T.sh, A = D.a1 + D.a2, I = this.I, t = this.t, H = p.hands;
    if (I.browse) { p.hrot.y += 0.45 * Math.sin(t * 0.55 + this.seed); p.hrot.x += 0.08; p.trot.y += 0.12 * Math.sin(t * 0.55 + this.seed); }
    if (I.ready) { // guard stance with the bat up
      p.hip.y -= 0.12 * D.L; p.trot.x += 0.12; p.trot.y = -0.25; p.hrot.y += 0.25;
      H[1].set(-sx - 0.02, sy + 0.1, 0.1); H[0].set(-sx * 0.1, sy + 0.0, T.d + 0.12); p.handK = 2.5; p.wp = 2.75; p.wr = -0.35; p.emote = "angry";
      p.feet[0].z += 0.05; p.feet[1].z -= 0.05; p.feet[0].x += 0.02; p.feet[1].x -= 0.02;
    }
    if (I.cheer) { H[1].set(-sx - 0.05 - 0.04 * Math.sin(t * 9), sy + A * 1.05, 0.05); p.handK = 2.5; p.hrot.x -= 0.15; p.emote = 'happy'; p.hip.y += 0.015 * Math.abs(Math.sin(t * 5)); }
    if (I.listen) { H[1].set(-sx * 0.75, T.neck + 0.12, 0.04); p.handK = 2; p.hrot.z -= 0.2; p.hrot.x += 0.1; p.trot.x += 0.08; }
  }
  // named clips: u 0..1 (one-shots land their hit at 0.75)
  clip(p, name, u, dt) {
    const D = this.D, T = D.T, [sx, sy] = T.sh, A = D.a1 + D.a2, L = D.L, H = p.hands, t = this.t;
    switch (name) {
      case 'pay': case 'serve': { const k = bump(u, 0.05, 0.4, 0.7, 1.0); H[1].lerp(_v.set(-sx * 0.35, sy - A * 0.3, T.d + A * 0.55), k); if (name === 'serve') H[0].lerp(_v.set(sx * 0.35, sy - A * 0.35, T.d + A * 0.45), k); p.trot.x += 0.12 * k; p.hrot.x += 0.18 * k; p.handK = Math.max(p.handK, 2); p.emote = 'happy'; break; }
      case 'reach': { const k = bump(u, 0.05, 0.45, 0.65, 0.95); H[1].lerp(_v.set(-sx * 0.55, sy + A * 0.32, T.d + A * 0.62), k); p.hrot.x -= 0.22 * k; p.trot.x += 0.1 * k; p.handK = Math.max(p.handK, 2); if (u > 0.55) p.hrot.x += 0.25 * sstep(0.62, 0.86, u); break; }
      case 'swing': { // bat swing across the front
        const a = sstep(0, 0.55, u), b = sstep(0.62, 0.82, u), c = sstep(0.85, 1, u);
        _v.set(-sx - 0.12, sy + 0.1, -0.06).lerp(_v2.set(sx * 0.9, sy - 0.02, T.d + A * 0.62), b).lerp(_v4.set(-sx - 0.03, sy - A * 0.8, 0.07), c);
        H[1].lerp(_v, Math.max(a, b)); H[0].lerp(_v2.set(sx * 0.2, sy - 0.05, T.d + 0.1), a * (1 - c));
        p.trot.y += 0.55 * a - 1.2 * b + 0.65 * c; p.prot.y += 0.2 * a - 0.45 * b + 0.25 * c; p.trot.x += 0.15 * b * (1 - c); p.hip.y -= 0.06 * L * a * (1 - c);
        p.wp = lerp(lerp(0.4, 1.4, b), 2.1, c); p.wr = lerp(-0.6, 0.3, b); p.handK = 4; p.emote = 'angry'; if (b > 0 && b < 1) this.hRot[1].v -= 2; break;
      }
      case 'hammer': {
        const a = sstep(0, 0.6, u), b = sstep(0.62, 0.78, u), c = sstep(0.88, 1, u);
        _v.set(-sx * 0.45, sy + A * 0.95, -0.04).lerp(_v2.set(-sx * 0.3, sy - A * 0.45, T.d + A * 0.62), b).lerp(_v4.set(-sx - 0.035, sy - A * 0.84, 0.05), c);
        H[1].lerp(_v, Math.max(a, b)); H[0].lerp(_v2.set(sx * 0.6, sy - A * 0.5, T.d + 0.12), b * (1 - c));
        p.trot.x += -0.15 * a * (1 - b) + 0.42 * b * (1 - c); p.hip.y -= 0.1 * L * b * (1 - c); p.wp = lerp(lerp(1.0, 1.75, b), 2.5, c); p.handK = 4; if (u > 0.76 && u < 0.8) this.squash.v -= 1.5; p.emote = 'strain'; break;
      }
      case 'hit': this.stagT = Math.max(this.stagT, 0.1); break;
      case 'collapse': case 'downB': this.poseDown(p, u, -1); break;
      case 'down': this.poseDown(p, u, 1); p.eyeK = 1 - 0.85 * sstep(0.5, 1, u); p.emote = 'sleepy'; break;
      case 'die': this.poseDown(p, u, 1); p.emote = 'dead'; if (!this.death && u > 0.02 && (this.zombie || this.explode)) this.startDeath(); break;
      case 'attack': { // claw: arms up and back, then rake down and forward with a lunge
        const a = sstep(0, 0.7, u), b = sstep(0.7, 0.8, u), c = sstep(0.85, 1, u);
        for (let i = 0; i < 2; i++) { const s = i ? -1 : 1; _v.set(s * sx * 0.7, sy + A * 0.75, -0.04).lerp(_v2.set(s * sx * 0.45, sy - A * 0.25, T.d + A * 0.72), b); H[i].lerp(_v, Math.max(a, b) * (1 - c)); }
        p.trot.x += -0.18 * a * (1 - b) + 0.38 * b * (1 - c); p.hip.z += 0.07 * L * b * (1 - c); p.hip.y -= 0.05 * L * b * (1 - c); p.hrot.x -= 0.2 * a * (1 - b);
        p.feet[0].z += 0.1 * L * b * (1 - c); p.handK = 4; p.emote = 'angry'; p.eyeK = 1.6; break;
      }
      case 'smash': { // big: two-handed overhead hammer-fist
        const a = sstep(0, 0.7, u), b = sstep(0.7, 0.8, u), c = sstep(0.88, 1, u);
        for (let i = 0; i < 2; i++) { const s = i ? -1 : 1; _v.set(s * sx * 0.35, sy + A * 0.95, -0.05).lerp(_v2.set(s * sx * 0.3, sy - A * 0.55, T.d + A * 0.65), b); H[i].lerp(_v, Math.max(a, b) * (1 - c)); }
        p.trot.x += -0.2 * a * (1 - b) + 0.5 * b * (1 - c); p.hip.y -= 0.15 * L * b * (1 - c); p.handK = 3.5; if (u > 0.78 && u < 0.81) this.squash.v -= 3; p.eyeK = 1.8; break;
      }
      case 'slam': { // Brute: crouch, raise both fists high, slam the ground
        const a = sstep(0, 0.22, u), b = sstep(0.22, 0.66, u), c = sstep(0.66, 0.86, u), d = sstep(0.9, 1, u);
        for (let i = 0; i < 2; i++) { const s = i ? -1 : 1; _v.set(s * (sx + 0.1), sy - A * 0.3, 0.1).lerp(_v2.set(s * sx * 0.5, sy + A * 1.0, -0.06), b).lerp(_v4.set(s * sx * 0.6, -D.torsoY - D.H * 0.75, T.d + A * 0.5), c); H[i].copy(_v); }
        p.hip.y -= (0.12 * a + 0.0 * b + 0.32 * c) * L * (1 - d); p.trot.x += (0.3 * a - 0.5 * b + 0.95 * c) * (1 - d); p.hrot.x += -0.3 * b * (1 - c);
        for (let i = 0; i < 2; i++) { p.feet[i].x *= 1 + 0.4 * (a + c) * (1 - d); }
        p.handK = 3; p.emote = 'angry'; p.eyeK = 1 + b + c; if (u > 0.84 && u < 0.87) this.squash.v -= 6; p.jitter = 0.004 + 0.01 * b; break;
      }
      case 'throw': { // Brute: squat and rip up a chunk, lift it overhead, hurl it
        const a = sstep(0, 0.25, u), b = sstep(0.25, 0.6, u), c = sstep(0.8, 0.88, u), d = sstep(0.92, 1, u);
        const grab = _v.set(0, -D.torsoY - D.H * 0.7, T.d + A * 0.45).lerp(_v2.set(0, sy + A * 0.9, -0.08), b).lerp(_v4.set(0, sy + A * 0.4, T.d + A * 0.9), c);
        for (let i = 0; i < 2; i++) { const s = i ? -1 : 1; H[i].set(grab.x + s * 0.17, grab.y, grab.z); }
        p.hip.y -= (0.35 * a * (1 - b)) * L; p.trot.x += (0.8 * a - 0.95 * b + 0.75 * c) * (1 - d); p.trot.y += 0.35 * c * (1 - d);
        p.handK = 3; p.eyeK = 1.5; this.showChunk = u > 0.18 && u < 0.86; this.chunkAt = grab.clone(); break;
      }
      case 'jump': { // Sweaty: crouch, launch, tuck in the air, land in a crouch
        const a = bump(u, 0, 0.08, 0.12, 0.16), tuck = bump(u, 0.16, 0.4, 0.8, 0.9), land = bump(u, 0.86, 0.94, 0.97, 1.0);
        p.hip.y -= (0.4 * a + 0.38 * land) * L; p.trot.x += 0.5 * a + 0.35 * tuck + 0.45 * land;
        for (let i = 0; i < 2; i++) { const s = i ? -1 : 1; p.feet[i].y += 0.35 * L * tuck; p.feet[i].z += 0.1 * L * tuck; p.fpitch[i] = 0.6 * tuck; H[i].lerp(_v.set(s * (sx + 0.1), sy + A * 0.85, 0.02), bump(u, 0.1, 0.18, 0.4, 0.6)); H[i].lerp(_v.set(s * (sx + A * 0.6), sy, 0), tuck * 0.6); }
        p.handK = 2.5; if (u > 0.93 && u < 0.95) this.squash.v -= 6; break;
      }
      case 'roar': { // arms thrown wide, head back, chest out, eyes flare
        const k = bump(u, 0.05, 0.3, 0.85, 1);
        for (let i = 0; i < 2; i++) { const s = i ? -1 : 1; H[i].lerp(_v.set(s * (sx + A * 0.85), sy + A * 0.3, 0.05), k); }
        p.trot.x -= 0.3 * k; p.hrot.x -= 0.45 * k; p.handK = 2.5; p.jitter = Math.max(p.jitter, 0.012 * k); p.eyeK = 1 + 1.4 * k; p.emote = 'angry'; break;
      }
    }
  }
  // fall over: dir 1 face-down (zombie death, knocked out), -1 onto the back (human collapse); u 0..1
  poseDown(p, u, dir) {
    const D = this.D, T = D.T, L = D.L, [sx, sy] = T.sh, A = D.a1 + D.a2;
    const k1 = sstep(0, 0.35, u), k2 = sstep(0.25, 0.85, u);
    const lie = (dir > 0 ? T.d : T.d * 0.9) + 0.02;
    p.hip.y = lerp(D.H - 0.45 * L * k1, lie + 0.01, k2); p.hip.z += dir * 0.05 * k2;
    p.trot.x = 0.35 * k1 * (1 - k2) * dir; p.prot.x = 1.45 * k2 * dir; p.prot.y = 0; p.prot.z = 0.1 * k2; p.trot.y = 0; p.trot.z = 0.08 * k2;
    p.hrot.x = (dir > 0 ? -0.2 : 0.2) * k2; p.hrot.y = 0.6 * k2 * (this.seed % 2 ? 1 : -1); p.hrot.z = 0;
    for (let i = 0; i < 2; i++) {
      const s = i ? -1 : 1;
      p.feet[i].set(s * (D.hipX + 0.02 + 0.03 * k2 * i), D.fh * (1 - 0.4 * k2), -dir * (L * 0.85) * k2 + 0.0);
      p.fpitch[i] = dir * 1.3 * k2;
      _v.set(s * (sx + 0.1), sy + A * 0.4 * k1, 0.06);
      const ground = dir > 0 ? _v2.set(s * (sx + 0.12 + 0.05 * i), 0.04, D.torsoY + T.h * 0.9 + 0.08 * i) : _v2.set(s * (sx + A * 0.75), 0.05, -0.05 - D.torsoY * 0.3);
      p.hands[i].copy(_v).applyMatrix4(this.torsoRest || _m2.identity()); // rough torso->root before the fall
      p.hands[i].lerp(ground, k2);
    }
    p.hspace = 'root'; p.handK = 3; p.footAlign = false; p.emote = dir > 0 ? 'dead' : 'dizzy'; p.jitter = 0.008 * k1 * (1 - k2);
  }
  applyEmoteBody(p) {
    const e = this.emote || p.emote; this.emoNow = e; const t = this.t;
    if (!this.emote) return;
    if (e === 'happy') { p.hrot.z += 0.15; p.hip.y += 0.012 * Math.abs(Math.sin(t * 6)); }
    else if (e === 'sad') { p.hrot.x += 0.3; p.trot.x += 0.08; }
    else if (e === 'angry') { p.hrot.x += 0.15; p.trot.x += 0.1; p.jitter = Math.max(p.jitter, 0.003); }
    else if (e === 'scared') p.jitter = Math.max(p.jitter, 0.007);
    else if (e === 'love') { p.hrot.z += 0.2 * Math.sin(t * 2.5); p.prot.z += 0.05 * Math.sin(t * 2.5); }
    else if (e === 'dizzy') { p.hrot.z += 0.18 * Math.sin(t * 4); p.hrot.x += 0.12 * Math.cos(t * 4); }
    else if (e === 'sleepy') p.hrot.x += 0.3;
  }

  // ---------------- springs, matrices, IK ----------------
  apply(p, dt, ctx) {
    const D = this.D, T = D.T, M = this.M, t = this.t;
    const armed = this.weap && p.w && p.w.show && !p.footAlign;
    if (armed) { p.hands[1].copy(p.w.pos); p.hspace = 'torso'; p.handK = Math.max(p.handK, 4); if (p.w.oh === 'free' && (this.guard || this.actS)) p.hands[0].copy(p.w.ohPos); }
    const sub = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / sub;
    // pelvis
    _v.copy(p.hip); if (p.jitter) { _v.x += noise1(t * 37) * p.jitter; _v.y += noise1(t * 41 + 3) * p.jitter * 0.5; }
    _q2.setFromEuler(_e.set(p.prot.x, p.prot.y, p.prot.z, 'YXZ')); M[B.PELVIS].compose(_v, _q2, ONE);
    // inertia: root acceleration (adapter) plus vertical hip acceleration
    const ax = ctx ? clamp(ctx.ax || 0, -40, 40) : 0, az = ctx ? clamp(ctx.az || 0, -40, 40) : 0;
    let ay = 0; if (this.prevHipY !== null && dt > 0) { const vy = (p.hip.y - this.prevHipY) / dt; ay = clamp((vy - this.prevHipVY) / dt, -60, 60); this.prevHipVY = vy; } this.prevHipY = p.hip.y;
    const down = p.footAlign;
    for (let i = 0; i < sub; i++) {
      this.tTilt[0].step(p.trot.x, 140, 9, h, -az * 1.2);
      this.tTilt[1].step(p.trot.z, 140, 9, h, ax * 1.2);
      this.squash.step(p.squash, 260, 11, h, -ay * 0.04);
      this.hRot[0].step(p.hrot.x, 90, 7, h, -az * 2.2 + ay * 0.3);
      this.hRot[1].step(p.hrot.y, 70, 8, h);
      this.hRot[2].step(p.hrot.z, 90, 7, h, ax * 2.2);
    }
    const sq = clamp(this.squash.x, 0.72, 1.28), isq = 1 / Math.sqrt(sq);
    let tz = this.tTilt[1].x; if (p.jitter) tz += noise1(t * 33 + 9) * p.jitter * 4;
    _q3.setFromEuler(_e.set(this.tTilt[0].x, p.trot.y, tz, 'YXZ'));
    const MT = M[B.TORSO]; MT.copy(M[B.PELVIS]); mulT(MT, 0, D.torsoY, 0); MT.multiply(_m.compose(_v.set(0, 0, 0), _q3, _s.set(isq, sq, isq)));
    const qTorso = _q2.multiply(_q3); // torso rotation in root space (pelvis * tilt)
    if (!this.torsoRest) this.torsoRest = new THREE.Matrix4(); this.torsoRest.copy(MT);
    // head look (eyes + a little head yaw) at ctx.look (root space)
    let lx = 0, ly = 0, hl = 0;
    if (ctx && ctx.look && !p.footAlign) {
      _v.set(0, T.neck + 0.15, 0).applyMatrix4(MT); _v2.subVectors(ctx.look, _v); _q.copy(qTorso).invert(); _v2.applyQuaternion(_q);
      const yaw = Math.atan2(_v2.x, _v2.z), pit = Math.atan2(_v2.y, Math.hypot(_v2.x, _v2.z));
      if (Math.abs(yaw) < 1.7) { lx = clamp(yaw * 0.9, -1, 1); ly = clamp(pit * 1.2, -1, 1); hl = 0.55; }
    }
    const MH = M[B.HEAD]; MH.copy(MT); mulT(MH, 0, T.neck + D.neckLen, 0);
    mulE(MH, this.hRot[0].x - ly * hl * 0.4, this.hRot[1].x + lx * hl * 0.8, this.hRot[2].x, 'YXZ'); MH.multiply(_m.makeScale(D.hs, D.hs, D.hs));
    this.eyeX = this.lookS[0].step(clamp(lx * 0.6 + (p.hrot.y - this.hRot[1].x) * 0.8, -1, 1), 200, 22, dt); this.eyeY = this.lookS[1].step(clamp(ly * 0.6, -1, 1), 200, 22, dt);
    // secondary: antennae, hat, loose panel (driven by root accel, step bounce and the head's spin)
    const hx = ax + this.tTilt[1].v * 0.8 + this.hRot[2].v * 0.6, hz = az - this.tTilt[0].v * 0.8 - this.hRot[0].v * 0.6;
    const gz = Math.sin(this.tTilt[0].x + this.hRot[0].x + p.prot.x) * 0.25, gx = -Math.sin(tz + this.hRot[2].x + p.prot.z) * 0.25;
    D.ants.forEach((a, ai) => {
      const s = this.ants[ai];
      for (let i = 0; i < sub; i++) { s.bx.step(gz, a.k, 2.2, h, -hz * 0.9 + (p.jitter ? noise1(t * 50) * 30 * p.jitter : 0) - ay * 0.0); s.bz.step(gx, a.k, 2.2, h, hx * 0.9); }
      s.bx.x = clamp(s.bx.x, -1.2, 1.2); s.bz.x = clamp(s.bz.x, -1.2, 1.2);
      const M0 = M[a.b[0]]; M0.copy(MH); mulT(M0, a.mount[0], a.mount[1], a.mount[2]); mulE(M0, 0, 0, -a.lean); mulE(M0, s.bx.x * 0.6, 0, s.bz.x * 0.6);
      if (a.n > 1) { const M1 = M[a.b[1]]; M1.copy(M0); mulT(M1, 0, a.lens[0], 0); mulE(M1, s.bx.x * 0.9, 0, s.bz.x * 0.9); }
    });
    if (D.hat) { const k = D.hat.sway ? 45 : 160, g = D.hat.sway ? 0.5 : 0.12; for (let i = 0; i < sub; i++) { this.hatS[0].step(0, k, 4, h, -hz * g); this.hatS[1].step(0, k, 4, h, hx * g); } const MHt = M[B.HAT]; MHt.copy(MH); mulT(MHt, ...D.hat.pos); mulE(MHt, clamp(this.hatS[0].x, -0.5, 0.5), 0, clamp(this.hatS[1].x, -0.5, 0.5)); }
    if (D.dangle) { for (let i = 0; i < sub; i++) { this.dangS[0].step(gz * 2, 30, 1.6, h, -hz * 1.5 - ay * 0.05); this.dangS[1].step(gx * 2, 30, 1.6, h, hx * 1.5); } const MD = M[B.DANGLE]; MD.copy(MT); mulT(MD, ...D.dangle.pos); mulE(MD, clamp(this.dangS[0].x, -1.3, 1.3), 0, clamp(this.dangS[1].x, -1.3, 1.3) + 0.15 * D.dangle.side); }
    // arms
    const [sx, sy, sz] = T.sh;
    const gunFirst = armed && !!this.wdef.muzzle; // guns: place the gun from the stance, then put both hands on it
    if (gunFirst) { this.solveWeapon(p, MT, qTorso, null, null); p.handK = Math.max(p.handK, 9); }
    for (let i = 0; i < 2; i++) {
      const s = i ? -1 : 1, bU = i ? B.RUP : B.LUP, bF = i ? B.RFORE : B.LFORE, bH = i ? B.RHAND : B.LHAND;
      const shp = _v4.set(s * sx, sy, sz).applyMatrix4(MT).clone();
      let tgt = p.hspace === 'torso' ? _v.copy(p.hands[i]).applyMatrix4(MT) : _v.copy(p.hands[i]);
      if (i === 0 && armed && p.w.oh !== 'free' && this.g2) tgt = _v.copy(this.g2);
      if (i === 1 && gunFirst && this.g1) tgt = _v.copy(this.g1);
      if (!this.handInit) this.hands[i].x.copy(tgt);
      const hk = 160 * p.handK; this.handV0[i].copy(this.hands[i].v);
      for (let j = 0; j < sub; j++) this.hands[i].step(tgt, hk, 2 * Math.sqrt(hk) * 0.55, h);
      const pole = (gunFirst ? _v2.set(s * 0.55, -1, -0.25) : _v2.set(s * 0.6, -0.3, -1)).applyQuaternion(qTorso);
      ik(shp, this.hands[i].x, D.a1, D.a2, pole);
      const el = _ikB.clone(), wr = _ikC.clone();
      segTo(M[bU], shp, el); segTo(M[bF], el, wr);
      _v3.subVectors(wr, el).normalize(); _q.setFromUnitVectors(NY, _v3); M[bH].compose(wr, _q, ONE);
      if (p.hspace === 'root' && p.handK > 2 && !p.footAlign) mulE(M[bH], 0, s * Math.PI / 2, 0);
      if (i === 0) this.lw = wr; else { this.rw = wr; this._elR = el; }
    }
    this.handInit = true;
    if (this.wdef) { if (armed) { if (!gunFirst) this.solveWeapon(p, MT, qTorso, this._elR, this.rw); } else this.wShown = false; }
    // legs
    const MP = M[B.PELVIS];
    for (let i = 0; i < 2; i++) {
      const s = i ? -1 : 1, bT = i ? B.RTHIGH : B.LTHIGH, bS = i ? B.RSHIN : B.LSHIN, bF = i ? B.RFOOT : B.LFOOT;
      const hip = _v4.set(s * D.hipX, D.hipY, 0).applyMatrix4(MP).clone();
      const pole = _v2.set(Math.sin(p.prot.y * 0.3), 0.15, 1).normalize();
      if (Math.abs(p.prot.x) > 0.5) pole.set(0, 1, 0.3 * Math.sign(-p.prot.x) + 0.0).applyQuaternion(_q.setFromEuler(_e.set(p.prot.x * 0.5, 0, 0)));
      ik(hip, p.feet[i], D.l1, D.l2, pole);
      const kn = _ikB.clone(), an = _ikC.clone();
      segTo(M[bT], hip, kn); segTo(M[bS], kn, an);
      M[bF].makeRotationFromEuler(_e.set(p.fpitch[i], p.prot.y * 0.3 + s * 0.08, 0, 'YXZ')).setPosition(an);
    }
    // props
    const MLh = M[B.LHAND], MRh = M[B.RHAND];
    if (!this.hide[B.BASKET]) {
      _v.set(0, -0.035, 0).applyMatrix4(MLh);
      const hv = this.hands[0].v, hv0 = this.handV0[0], iax = dt > 0 ? (hv.x - hv0.x) / dt : 0, iaz = dt > 0 ? (hv.z - hv0.z) / dt : 0;
      for (let i = 0; i < sub; i++) { this.basS[0].step(0, 40, 2.2, h, -(az + iaz) * 1.4); this.basS[1].step(0, 40, 2.2, h, (ax + iax) * 1.4); }
      M[B.BASKET].makeRotationFromEuler(_e.set(clamp(this.basS[0].x, -0.9, 0.9), 0, clamp(this.basS[1].x, -0.9, 0.9))).setPosition(_v);
    }
    if (D.props.weapon) { const MW = M[B.WEAPON]; MW.copy(MRh); mulT(MW, 0, -0.035, 0); mulE(MW, p.wp, 0, p.wr); }
    if (D.props.crate) {
      if (p.crate) { const MC = M[B.CRATE]; MC.copy(MT); mulT(MC, p.crate[0], p.crate[1], p.crate[2]); MC.multiply(_m.makeScale(1 / isq, 1 / sq, 1 / isq)); this.hide[B.CRATE] = 0; }
      else if (this.showChunk && this.chunkAt) { M[B.CRATE].makeRotationFromEuler(_e.set(0.3, 0.5, 0.2)).setPosition(_v.copy(this.chunkAt).applyMatrix4(MT)); this.hide[B.CRATE] = 0; }
      else this.hide[B.CRATE] = 1;
      this.showChunk = false;
    }
    this.handsK = p.handK;
  }
  writeParams(dt, p) {
    // blink
    this.blinkT -= dt; if (this.blinkT <= 0) { this.blinkT = 1.8 + this.rand() * 3.5; this.blinkS = 0; if (this.rand() < 0.2) this.dbl = true; }
    if (this.blinkS !== undefined) { this.blinkS += dt; const b = this.blinkS / 0.15; this.blink = b < 1 ? Math.sin(b * Math.PI) : 0; if (b >= 1) { this.blinkS = undefined; if (this.dbl) { this.dbl = false; this.blinkT = 0.08; } } }
    const emo = this.emote || p.emote; this.emoNow = emo;
    let eye = p.eyeK;
    if (this.zombie) { // flicker: brief dips, a slow unsteady hum
      if (this.eyeFlick > 0) { this.eyeFlick -= dt; eye *= 0.15 + 0.3 * (Math.sin(this.t * 90) > 0 ? 1 : 0); }
      else if (this.rand() < dt * 0.5) this.eyeFlick = 0.05 + this.rand() * 0.15;
      eye *= 0.88 + 0.12 * noise1(this.t * 7 + this.ph);
    }
    if (this.I.eyeOff) eye *= 0.1;
    if (this.death) eye *= Math.max(0, 1 - this.death.t * 1.5) * (Math.sin(this.t * 60) > 0 ? 1 : 0.3);
    this.flash *= Math.exp(-dt * 9);
    const P = this.params;
    P[0] = EMO[emo] ?? 0; P[1] = emo === 'neutral' || emo === 'angry' || emo === 'sad' ? this.blink : 0; P[2] = this.eyeX || 0; P[3] = this.eyeY || 0;
    P[4] = this.flash; P[5] = this.glowK; P[6] = eye; P[7] = (this.seed % 997) / 997;
  }

  // ---------------- death: head and a forearm come off and fall ----------------
  startDeath() {
    const M = this.M, r = this.rand, g = 9.8 / Math.max(0.2, this.mpu), parts = [];
    const sub = (root, kids, v, rad, cen) => {
      if (this.hide[root]) return; const inv = new THREE.Matrix4().copy(M[root]).invert();
      const rel = kids.filter((k) => !this.hide[k]).map((k) => [k, new THREE.Matrix4().multiplyMatrices(inv, M[k])]);
      const pos = V(), q = new THREE.Quaternion(), sc = V(); M[root].decompose(pos, q, sc);
      parts.push({ root, rel, pos, q, sc, v, w: V((r() - 0.5) * 14, (r() - 0.5) * 8, (r() - 0.5) * 14), rad, cen, rest: false });
    };
    const D = this.D, hh = D.head.h * D.hs;
    sub(B.HEAD, HEAD_TREE.slice(1), V((r() - 0.5) * 1.2, 1.5 + r() * 0.7, 0.4 + r() * 0.7), hh * 0.45, V(0, D.head.h * 0.5, 0));
    const side = this.seed % 2 ? 0 : 1, bF = side ? B.RFORE : B.LFORE, bH = side ? B.RHAND : B.LHAND, s = side ? -1 : 1;
    if (!this.hide[bF]) sub(bF, [bH, side ? B.WEAPON : B.BASKET].filter((b) => !this.hide[b]), V(s * (0.6 + r() * 0.5), 0.8 + r() * 0.5, 0.3 + r() * 0.4), 0.035, V(0, D.a2 * 0.5, 0));
    if (D.dangle && !this.hide[B.DANGLE]) sub(B.DANGLE, [], V(D.dangle.side * 0.8, 1.0, 0.5), 0.03, V(0, -0.05, 0));
    this.death = { t: 0, parts, g };
  }
  stepDeath(dt) {
    const Dd = this.death; Dd.t += dt; const g = Dd.g, M = this.M;
    const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
    for (const pt of Dd.parts) {
      for (let i = 0; i < n && !pt.rest; i++) {
        pt.v.y -= g * h; pt.pos.addScaledVector(pt.v, h);
        const wq = _q.set(pt.w.x * h * 0.5, pt.w.y * h * 0.5, pt.w.z * h * 0.5, 0).multiply(pt.q); pt.q.set(pt.q.x + wq.x, pt.q.y + wq.y, pt.q.z + wq.z, pt.q.w + wq.w).normalize();
        const c = _v.copy(pt.cen).multiply(pt.sc).applyQuaternion(pt.q).add(pt.pos);
        if (c.y < pt.rad) { pt.pos.y += pt.rad - c.y; if (pt.v.y < 0) pt.v.y *= -0.32; pt.v.x *= 0.55; pt.v.z *= 0.55; pt.w.multiplyScalar(0.55); if (pt.v.lengthSq() < 0.01 && pt.w.lengthSq() < 0.3) pt.rest = true; }
      }
      M[pt.root].compose(pt.pos, pt.q, pt.sc);
      for (const [k, rel] of pt.rel) M[k].multiplyMatrices(M[pt.root], rel);
    }
  }
  // run the death to rest with a fixed step (lying corpse); then the pose stays frozen
  settleCorpse() {
    this.glitchT = 1e9;
    for (let i = 0; i < 200; i++) { this.force('die', Math.min(1, i / 36)); this.update(1 / 60, null); }
    this.frozen = true; this.params[6] = 0;
  }
  // carried corpse: bones from the 15 world particles [pelvis, chest, head, shL, shR, elL, elR, hdL, hdR, hipL, hipR, knL, knR, ftL, ftR]
  fromParticles(Pt, k) {
    const D = this.D, T = D.T, M = this.M, v = (i) => _v.set(Pt[i].x, Pt[i].y, Pt[i].z);
    const pel = v(0).clone(), U = v(1).clone().sub(pel).normalize(), X = v(3).clone().sub(v(4)).normalize();
    X.addScaledVector(U, -X.dot(U)).normalize(); const Z = V().crossVectors(X, U);
    _m.makeBasis(X, U, Z); _q.setFromRotationMatrix(_m); const S = _s.set(k, k, k);
    M[B.PELVIS].compose(pel, _q, S);
    const MT = M[B.TORSO]; MT.copy(M[B.PELVIS]); mulT(MT, 0, D.torsoY, 0);
    const MH = M[B.HEAD]; MH.copy(MT); mulT(MH, 0, T.neck + D.neckLen, 0);
    const hp = V().setFromMatrixPosition(MH), hd = v(2).clone().sub(hp); if (hd.lengthSq() > 1e-6) { hd.normalize(); _q2.setFromUnitVectors(U, hd); const pos = hp.clone(); MH.premultiply(_m.makeTranslation(-pos.x, -pos.y, -pos.z)).premultiply(_m.makeRotationFromQuaternion(_q2)).premultiply(_m.makeTranslation(pos.x, pos.y, pos.z)); }
    MH.multiply(_m.makeScale(D.hs, D.hs, D.hs));
    const limb = (bU, bF, bH, from, mid, to, l1, l2, hand) => {
      const a = from.clone(), dir1 = mid.clone().sub(a).normalize(), el = a.clone().addScaledVector(dir1, l1 * k);
      _q.setFromUnitVectors(Y, dir1); M[bU].compose(a, _q, S);
      const dir2 = to.clone().sub(el).normalize(); _q.setFromUnitVectors(Y, dir2); M[bF].compose(el, _q, S);
      const end = el.clone().addScaledVector(dir2, l2 * k);
      if (hand) { _q.setFromUnitVectors(NY, dir2); M[bH].compose(end, _q, S); } else { M[bH].copy(M[B.PELVIS]).setPosition(end); }
    };
    const [sx, sy, sz] = T.sh;
    limb(B.LUP, B.LFORE, B.LHAND, V(sx, sy, sz).applyMatrix4(MT), V(Pt[5].x, Pt[5].y, Pt[5].z), V(Pt[7].x, Pt[7].y, Pt[7].z), D.a1, D.a2, true);
    limb(B.RUP, B.RFORE, B.RHAND, V(-sx, sy, sz).applyMatrix4(MT), V(Pt[6].x, Pt[6].y, Pt[6].z), V(Pt[8].x, Pt[8].y, Pt[8].z), D.a1, D.a2, true);
    limb(B.LTHIGH, B.LSHIN, B.LFOOT, V(D.hipX, D.hipY, 0).applyMatrix4(M[B.PELVIS]), V(Pt[11].x, Pt[11].y, Pt[11].z), V(Pt[13].x, Pt[13].y, Pt[13].z), D.l1, D.l2, false);
    limb(B.RTHIGH, B.RSHIN, B.RFOOT, V(-D.hipX, D.hipY, 0).applyMatrix4(M[B.PELVIS]), V(Pt[12].x, Pt[12].y, Pt[12].z), V(Pt[14].x, Pt[14].y, Pt[14].z), D.l1, D.l2, false);
    D.ants.forEach((a) => { const M0 = M[a.b[0]]; M0.copy(MH); mulT(M0, ...a.mount); mulE(M0, 0, 0, -a.lean); if (a.n > 1) { M[a.b[1]].copy(M0); mulT(M[a.b[1]], 0, a.lens[0], 0); } });
    if (D.hat) { M[B.HAT].copy(MH); mulT(M[B.HAT], ...D.hat.pos); }
    if (D.dangle) { M[B.DANGLE].copy(MT); mulT(M[B.DANGLE], ...D.dangle.pos); }
    this.hide[B.BASKET] = 1; this.hide[B.CRATE] = 1;
    this.params[6] = 0; this.params[0] = EMO.dead;
  }
  // 3x4 rows of every bone (hidden = zero) into out at offset (floats)
  writeBones(out, off) {
    const M = this.M;
    for (let b = 0; b < NB; b++) {
      const o = off + b * 12;
      if (this.hide[b]) { out.fill(0, o, o + 12); continue; }
      const e = M[b].elements;
      out[o] = e[0]; out[o + 1] = e[4]; out[o + 2] = e[8]; out[o + 3] = e[12];
      out[o + 4] = e[1]; out[o + 5] = e[5]; out[o + 6] = e[9]; out[o + 7] = e[13];
      out[o + 8] = e[2]; out[o + 9] = e[6]; out[o + 10] = e[10]; out[o + 11] = e[14];
    }
  }
}

installCombat(RoboBody);
