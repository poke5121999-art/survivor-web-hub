// Drop-in replacement for twt js/people.js: every human and zombie is a robot (robo-cast.js looks, robo-rig.js
// animator, robo-crowd.js instanced renderer). Same API and the same desc contract:
//
//   const people = createPeople(G)   G = { scene, camera, renderer, quality: { name } }
//   const p = people.spawn(seed, kind, pos, opts)   kind null = living human, else a ZKind string
//   p.update(desc)   every frame (desc: js/sim/actors.js, staff.js, cine.js, carry.js, world.js VIEW NOTES)
//   people.update(dt)   once per frame after all p.update calls: animation, LOD, culling, upload
//   p.despawn()   p.mesh (THREE.Group kept at the root transform; the robot itself is drawn by the crowd meshes)
//   people.corpseFigure(seed, kind) -> Object3D (caller adds it to the scene, sets position / rotation.y / visible,
//                                     calls .userData.dispose()), people.corpse(), stats(), prewarm(), count(), list()
// Extra (cast page / debugging): p.setEmote(name|null), p.body (RoboBody), people.crowd, people.fx(kind, pos).
//
// Sim conventions as people.js: model faces -Z at yaw 0, so the robot (built facing +Z) gets rotation yaw + PI;
// speed is measured from the change of desc.pos (people are never moved here).
import * as THREE from '../vendor/three.module.min.js';
import { robotDef, zombieRobotDef, mix32, HUMAN_LOOKS, ZOMBIE_LOOKS } from './robo-cast.js';
import { RoboBody, B } from './robo-rig.js';
import { Crowd } from './robo-crowd.js';
import { TEX_W } from './robo-mat.js';
import { WeaponLayer, WEAPONS } from './robo-weapons.js';

export { HUMAN_LOOKS, ZOMBIE_LOOKS };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const HIDE = { lan: B.BASKET, lanB: B.CRATE, wR: B.WEAPON, lFore: B.LFORE, rFore: B.RFORE, lHand: B.LHAND, rHand: B.RHAND };
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();

// zombie per-instance gait / arms (Rust actors.js zombie_pose: gait = seed%4, arms = floor(seed/7)%5, splay = floor(seed/3)%4)
function zStyle(seed, kind) {
  if (kind === 'Base' || kind === 'Tumour') return { gait: seed % 4, arms: Math.trunc(seed / 7) % 5, splay: 0.06 + (Math.trunc(seed / 3) % 4) * 0.05, hunch: (mix32(seed) % 5) * 0.04 };
  if (kind === 'Baby') return { gait: 0, arms: 0, splay: 0.06, hunch: 0.25 };
  if (kind === 'Birther') return { gait: 0, arms: 2, splay: 0.25, hunch: -0.08 };
  return { gait: 0, arms: 2, splay: 0.2, hunch: 0.06 };
}

function auraMesh(col) { // soft additive column round the twin sisters (as people.js)
  const g = new THREE.CylinderGeometry(0.55, 0.75, 2.1, 24, 1, true); g.translate(0, 1.05, 0);
  const m = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(col[0], col[1], col[2]) }, uT: { value: 0 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uCol; uniform float uT; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(abs(dot(vN, vV)), 2.5); float a = pow(1. - vUv.y, 2.2) * (0.6 + 0.4 * sin(uT * 3. + vUv.x * 37.7 + vUv.y * 9.)) * f * 0.55; float scan = .75 + .25 * step(.5, fract(vUv.y * 24. - uT * 2.)); gl_FragColor = vec4(uCol * a * scan, a); }',
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  m.blending = THREE.CustomBlending; m.blendEquation = THREE.AddEquation; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneFactor; m.blendEquationAlpha = THREE.AddEquation; m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor;
  const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 6; return mesh;
}

class Person {
  constructor(sys, seed, kind, pos, opts) {
    opts = opts || {};
    this.sys = sys; this.seed = seed >>> 0; this.kind = kind; this.opts = opts; this.zombie = kind !== null && kind !== undefined;
    let role = 'customer';
    if (opts.role === 'staff') role = opts.hired === false ? 'candidate' : 'staff';
    else if (['survivor', 'scavenger', 'merchant', 'crew', 'helper'].includes(opts.role)) role = opts.role;
    this.role = role;
    const def = this.def = this.zombie ? zombieRobotDef(this.seed, kind, role) : robotDef(this.seed, role);
    const pr = this.proto = sys.crowd.proto(def);
    this.slot = sys.crowd.alloc();
    const zk = this.zombie ? def.kind : 'human';
    const body = this.body = new RoboBody(pr.P, this.seed, { zombie: this.zombie && role !== 'helper', kind: zk, big: !!def.big });
    if (this.zombie) Object.assign(body.I, zStyle(this.seed, zk));
    if (role === 'helper') body.zombie = false;
    for (const h of def.hidden) if (HIDE[h] !== undefined) body.setHidden(HIDE[h], true);
    // missing forearms (Rust: 22% left, 30% right; Base and Tumour only)
    if (this.zombie && (zk === 'Base' || zk === 'Tumour') && !opts.cine) { const hh = mix32(this.seed * 3 + 11) % 100; if (hh < 22) { this.hide('lFore', 1); this.hide('lHand', 1); } else if (hh >= 60 && hh < 90) { this.hide('rFore', 1); this.hide('rHand', 1); } }
    this.missing = (body.hide[B.LFORE] ? 1 : 0) + (body.hide[B.RFORE] ? 2 : 0);
    this.scale = (opts.scale !== undefined && this.zombie ? opts.scale * 1.78 / 1.81 : def.scale) * (this.zombie && zk === 'Base' ? 0.96 + (mix32(this.seed) % 9) * 0.01 : 1);
    this.mpu = pr.dims.k * this.scale; body.mpu = this.mpu;
    const m = this.mesh = new THREE.Group(); m.name = 'robot'; m.position.set(pos.x, pos.y, pos.z); m.rotation.y = Math.PI; m.scale.setScalar(this.scale); m.userData.person = this;
    if (def.aura) { this.aura = auraMesh(def.aura); this.aura.scale.setScalar(1 / 1.0); m.add(this.aura); }
    sys.scene.add(m);
    this.desc = null; this.px = pos.x; this.pz = pos.z; this.py = pos.y; this.spd = 0; this.yaw = 0; this.lead = 0; this.first = true;
    this.acc = 0; this.fu = undefined; this.rec = null; this.t = 0; this.dead = false; this.visible = true;
    this.prevWind = 0; this.prevStag = 0; this.prevSwing = 0; this.prevAct = 0; this.prevSpecial = 0; this.prevHp = undefined;
    this.vel = new THREE.Vector3(); this.velPrev = new THREE.Vector3(); this.accW = new THREE.Vector3(); this.rag = false; this.sparkT = Math.random() * 2;
    this.evq = [];
    if (opts.weapon) this.setWeapon(opts.weapon);
    this.writeRoot();
    body.writeBones(sys.crowd.data, sys.crowd.row(this.slot));
  }
  setWeapon(id) { this.body.setWeapon(id); }
  act(name, o) { return this.body.act(name, o); }
  fire() { return this.body.fire(); }
  // world point in the weapon (muzzle etc.), or null
  wpoint(local) { return this.body.wShown ? this.body.weaponPoint(this.rootM(), local) : null; }
  // world point on a bone (bot-unit local), e.g. chest for hits
  bpoint(bone, x = 0, y = 0, z = 0) { return new THREE.Vector3(x, y, z).applyMatrix4(this.body.M[bone]).applyMatrix4(this.rootM()); }
  update(desc) { this.desc = desc; }
  despawn() { if (this.dead) return; this.dead = true; this.sys.remove(this); this.sys.scene.remove(this.mesh); this.sys.crowd.release(this.slot); if (this.aura) { this.aura.geometry.dispose(); this.aura.material.dispose(); } }
  hide(name, h) { const b = HIDE[name]; if (b !== undefined) this.body.setHidden(b, h); }
  setEmote(e) { this.body.emote = e && e !== 'auto' ? e : null; }
  force(name, u) { this.body.force(name, u); this.fu = u; this.forced = name; }
  release() { if (this.forced) { this.body.release(); this.forced = null; } this.fu = undefined; }

  // place the root from desc and measure speed (every frame, cheap)
  place(dt) {
    const d = this.desc; if (!d) return;
    if (d.ragdoll) return;
    let p = d.foot || d.pos, y = p.y;
    if (!d.foot && !this.zombie && d.moving) y -= d.bob !== undefined ? d.bob : Math.abs(Math.sin((d.phase || 0) * 2)) * 0.03;
    if (this.zombie && d.fall) y -= d.fall * 0.1;
    const dx = p.x - this.px, dz = p.z - this.pz, dist = Math.hypot(dx, dz);
    let v = 0;
    if (this.first || dist > 3) { this.first = false; this.spd = 0; this.vel.set(0, 0, 0); this.velPrev.set(0, 0, 0); }
    else if (dt > 0) {
      const yaw = d.yaw || 0, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      v = dist / dt; if (dx * fx + dz * fz < -0.3 * dist) v = -v;
      this.vel.lerp(_v.set(dx / dt, 0, dz / dt), 1 - Math.exp(-dt * 12));
    }
    if (d.moving === false && Math.abs(v) < 0.25) { v = 0; this.vel.multiplyScalar(Math.exp(-dt * 10)); }
    this.spd = lerp(this.spd, v, 1 - Math.exp(-dt * 10));
    if (Math.abs(this.spd) < 0.03) this.spd = 0;
    this.px = p.x; this.pz = p.z; this.py = y;
    const m = this.mesh; m.position.set(p.x, y, p.z);
    const yaw = d.yaw !== undefined ? d.yaw : this.yaw, rate = dt > 0 ? angDiff(this.yaw, yaw) / dt : 0;
    this.yaw = yaw; m.rotation.set(0, yaw + Math.PI, 0);
    this.lead = lerp(this.lead, clamp(rate * 0.1, -0.6, 0.6), 1 - Math.exp(-dt * 8));
    if (d.visible !== undefined) this.visible = !!d.visible;
    if (d.show !== undefined) this.visible = !!d.show;
    m.visible = this.visible;
  }
  writeRoot() {
    const o = this.sys.crowd.row(this.slot) + 72 * 4, D = this.sys.crowd.data;
    if (this.rag) { D.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0], o); return; }
    const m = this.mesh, k = this.mpu;
    _q.setFromEuler(_e.set(0, m.rotation.y, 0)); _m.compose(m.position, _q, _s.set(k, k, k));
    const e = _m.elements;
    D[o] = e[0]; D[o + 1] = e[4]; D[o + 2] = e[8]; D[o + 3] = e[12]; D[o + 4] = e[1]; D[o + 5] = e[5]; D[o + 6] = e[9]; D[o + 7] = e[13]; D[o + 8] = e[2]; D[o + 9] = e[6]; D[o + 10] = e[10]; D[o + 11] = e[14];
  }

  // drive the animator from desc (at the LOD rate)
  step(dt, lookCam) {
    const d = this.desc, body = this.body, crowd = this.sys.crowd;
    this.t += dt;
    if (d && d.ragdoll) { this.ragdoll(d); return; }
    this.rag = false;
    const I = body.I;
    I.sp = this.spd / this.mpu; I.lead = this.lead;
    const msp = Math.abs(this.spd) / this.scale;
    I.run = this.zombie ? msp > 2.6 : msp > 2.4;
    I.scared = !this.zombie && msp > 3.25 ? 1 : 0;
    I.cheer = I.listen = I.ready = I.browse = I.limp = 0; I.shake = 0; I.chase = 0; I.eyeOff = 0;
    if (d && !this.opts.manual) { if (this.zombie) this.driveZombie(d, dt); else this.driveHuman(d, dt); }
    if (this.rec) { this.rec.u += this.rec.rate * dt; if (this.rec.u >= 1) { this.rec = null; this.release(); } else this.force(this.rec.name, this.rec.u); }
    if (this.def.glowPulse) body.glowK = 0.75 + 0.35 * Math.sin(this.t * (this.fastPulse ? 11 : 3.2) + (this.seed % 7));
    if (this.aura) this.aura.material.uniforms.uT.value = this.t;
    // accelerations into the root frame (bot units) for the springs
    this.accW.subVectors(this.vel, this.velPrev).multiplyScalar(dt > 0 ? 1 / dt : 0); this.velPrev.copy(this.vel);
    const ry = this.mesh.rotation.y, c = Math.cos(ry), s = Math.sin(ry), ki = 1 / this.mpu;
    const ctx = this.ctx || (this.ctx = { ax: 0, az: 0, look: null });
    ctx.ax = (this.accW.x * c - this.accW.z * s) * ki; ctx.az = (this.accW.x * s + this.accW.z * c) * ki;
    ctx.look = null;
    if (lookCam) { const lp = this.lookP || (this.lookP = new THREE.Vector3()); lp.copy(lookCam); this.mesh.updateMatrixWorld(); this.mesh.worldToLocal(lp); lp.multiplyScalar(this.scale / this.mpu); ctx.look = lp; }
    body.update(dt, ctx);
    body.writeBones(crowd.data, crowd.row(this.slot));
    this.fxStep(dt);
    if (body.ev.length) { for (const e of body.ev) this.combatFx(e); this.evq.push(...body.ev); }
  }
  // sparks from broken robots: a fizzing wire now and then, a shower when hit, a burst at death, steam on Sweaty
  fxStep(dt) {
    if (!this.zombie || !this.visible) return;
    const fx = this.sys.crowd.fx, body = this.body;
    this.sparkT -= dt;
    if (this.sparkT <= 0) {
      this.sparkT = 0.8 + Math.random() * 2.5;
      const b = this.missing ? (this.missing & 1 ? B.LUP : B.RUP) : B.TORSO, D = body.D;
      _v.set(0, b === B.TORSO ? D.T.neck : D.a1, 0).applyMatrix4(body.M[b]).applyMatrix4(this.rootM());
      fx.burst(_v, 3 + (Math.random() * 4 | 0), 1.0, 1.2, 0.03 * Math.sqrt(this.scale));
    }
    if (this.def.kind === 'Sweaty' && Math.random() < dt * 6) { _v.set((Math.random() - 0.5) * 0.2, body.D.T.h + 0.1, -0.12).applyMatrix4(body.M[B.TORSO]).applyMatrix4(this.rootM()); fx.emit(_v, { x: (Math.random() - 0.5) * 0.3, y: 0.8, z: (Math.random() - 0.5) * 0.3 }, 1, 1.4, 0.18 * this.scale); }
  }
  // generic combat effects; hits are decided by the caller from p.evq
  combatFx(e) {
    const W = this.sys.weapons, fx = this.sys.crowd.fx, d = this.body.wdef, rm = this.rootM(), k = this.mpu;
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(_q.setFromEuler(_e.set(0, this.mesh.rotation.y, 0)));
    if (e.e === 'fire' && d && d.muzzle) { const m = this.wpoint(d.muzzle); if (m) { W.flashes.add(m, 0.2 + (d.kind === 'shotgun' ? 0.25 : d.kind === 'rifle' ? 0.15 : 0), 0.05, d.kind === 'shotgun' ? 5 : 3); for (let i = 0; i < 3; i++) fx.emit(m, { x: fwd.x * 0.6 + (Math.random() - 0.5) * 0.3, y: 0.3 + Math.random() * 0.3, z: fwd.z * 0.6 + (Math.random() - 0.5) * 0.3 }, 1, 0.5, 0.06); } }
    if ((e.e === 'eject' || e.e === 'pumpStart') && d && d.eject) { const p = this.wpoint(d.eject); if (p) { const side = new THREE.Vector3(-fwd.z, 0, fwd.x).multiplyScalar(-1); W.throwObj({ id: 'part:shell', p, v: side.multiplyScalar(1.6 + Math.random()).add(new THREE.Vector3(0, 1.8, 0)), life: 2.5, s: k * 1.0 }); } }
    if (e.e === 'magout' && d && d.mag) { const p = this.wpoint([0, -0.08, d.kind === 'pistol' ? 0 : 0.1]); if (p) W.throwObj({ id: d.kind === 'shotgun' ? 'part:shell' : 'part:mag', p, v: new THREE.Vector3(0, -0.5, 0), life: 4, s: k }); }
    if (e.e === 'release' && d && d.proj) { const p = this.wpoint([0, 0, 0]) || this.bpoint(B.RHAND); const v = fwd.clone().multiplyScalar(7).add(new THREE.Vector3(0, 3.2, 0)); const self = this;
      W.throwObj({ id: 'part:' + d.proj, p, v, life: d.proj === 'grenade' ? 3 : 4, s: k, fuse: 1.4, onLand(o) { if (d.proj !== 'grenade') return true; setTimeout(() => {}, 0); o.boom = true; self.evq.push({ e: 'land', p: o.p.clone(), proj: d.proj }); return true; } }); }
    if (e.e === 'spit') { const p = this.bpoint(B.HEAD, 0, 0.08, 0.12); const v = fwd.clone().multiplyScalar(8).add(new THREE.Vector3(0, 2.5, 0)); const self = this; W.throwObj({ id: 'part:glob', p, v, life: 2, s: k * 1.2, g: 0.8, onLand(o) { self.evq.push({ e: 'splat', p: o.p.clone() }); for (let i = 0; i < 8; i++) fx.emit(o.p, { x: (Math.random() - 0.5) * 2, y: Math.random() * 1.5, z: (Math.random() - 0.5) * 2 }, 1, 0.6, 0.08); return false; } }); }
  }
  rootM() { const m = this.mesh, k = this.mpu; return this._rm || (this._rm = new THREE.Matrix4()), this._rm.compose(m.position, _q.setFromEuler(_e.set(0, m.rotation.y, 0)), _s.set(k, k, k)); }

  driveHuman(d, dt) {
    const body = this.body, I = body.I, cine = this.opts.cine;
    let carry = 'none';
    if (cine) {
      const act = d.act_name || '';
      this.hide('lanB', act !== 'CARRY');
      if (act === 'COLLAPSE' || act === 'RISE') this.force('collapse', clamp(d.fall || 0, 0, 1));
      else if (this.forced === 'collapse') this.release();
      if (act === 'CARRY') carry = 'crate';
      if (act === 'READY') I.ready = 1;
      if (act === 'CHEER') I.cheer = 1;
      if (act === 'LISTEN') I.listen = 1;
      if (this.role === 'survivor' && carry !== 'crate') carry = 'bat';
      if (carry === 'crate' && !body.D.props.crate) carry = 'none';
    } else if (this.role === 'crew') {
      carry = 'hammer';
      const sw = d.swing || 0;
      if (sw > this.prevSwing + 0.05) body.play('hammer', 0.22, 0.4);
      this.prevSwing = sw;
    } else if (this.role === 'staff' || this.role === 'candidate') {
      const sec = d.job === 3 && this.role === 'staff';
      this.hide('wR', !sec);
      if (sec) carry = 'bat';
      const sw = d.swing || 0;
      if (sw > this.prevSwing + 0.05) { if (sec) body.play('swing', 0.12, 0.35); else body.play('serve', 0.25, 0.35); }
      this.prevSwing = sw;
      if (sec && !d.moving && Math.abs(this.spd) < 0.3 && !body.shot) I.ready = 1;
    } else {
      const pay = d.pay !== undefined ? d.pay : clamp((d.pay_t || 0) / 0.9, 0, 1);
      const reach = d.reach !== undefined ? d.reach : d.state === 'Look' && (d.timer || 0) < 0.55;
      const hurt = d.hurt || d.goal === 'Medical';
      const basket = !!(d.basket || d.carrying);
      this.hide('lan', !basket);
      if (pay > 0) this.force('pay', 1 - pay);
      else if (reach) this.force('reach', clamp(1 - (d.timer || 0) / 0.55, 0, 1));
      else this.release();
      if (d.state === 'Look' && !reach) I.browse = 1;
      if (hurt) { I.limp = 1; carry = basket ? 'hurtB' : 'hurt'; }
      else if (basket) carry = 'basket';
    }
    I.carry = carry;
  }

  driveZombie(d, dt) {
    const body = this.body, I = body.I, k = this.def.kind;
    const fall = d.fall !== undefined ? d.fall : clamp((d.dying || 0) / 0.55, 0, 1);
    const act = d.act || 0, actT = d.act_t || 0;
    if (this.opts.cine) {
      const an = d.act_name || '';
      if (an === 'COLLAPSE' || an === 'RISE') this.force('down', clamp(d.fall || 0, 0, 1));
      else if (an === 'ROAR') { this.force('roar', clamp((d.k || 0) * 3, 0, 1)); I.shake = 1; }
      else this.release();
      return;
    }
    if (this.role === 'helper') { // Stompy: friendly chained hulk; lean -1.45 = knocked out lying; swing = claw swipe countdown
      if ((d.lean || 0) < -0.5) { this.force('down', 1); I.eyeOff = 1; return; }
      if (this.forced) this.release();
      const sw = d.swing || 0; if (sw > this.prevSwing + 0.05) body.play('smash', 0.2, 0.5); this.prevSwing = sw;
      body.emote = null; return;
    }
    if ((d.dying || 0) > 0 || fall > 0) {
      this.rec = null;
      if (!this.dieFx) { this.dieFx = true; const fx = this.sys.crowd.fx; _v.set(0, body.D.T.neck, 0).applyMatrix4(body.M[B.TORSO]).applyMatrix4(this.rootM()); fx.burst(_v, 18, 2.2, 2.4, 0.045 * Math.sqrt(this.scale)); }
      this.force('die', fall); return;
    }
    if (k === 'Brute' && (act === 1 || act === 2)) {
      const dur = act === 1 ? 2.0 : 2.33, name = act === 1 ? 'slam' : 'throw', hit = 0.86;
      this.rec = null; this.force(name, hit * clamp(1 - actT / dur, 0, 1)); this.prevAct = act; I.shake = act === 1 && actT < 0.5 ? 1 : 0;
      if (act === 1 && actT < 0.05 && !this.slamFx) { this.slamFx = true; const fx = this.sys.crowd.fx; _v.set(0, 0.05, 1.2 * this.scale).applyMatrix4(_m.makeRotationY(this.mesh.rotation.y)).add(this.mesh.position); fx.burst(_v, 30, 3, 5, 0.06); }
      if (actT > 0.1) this.slamFx = false;
    } else if (k === 'Brute' && this.prevAct) {
      const name = this.prevAct === 1 ? 'slam' : 'throw'; this.rec = { name, u: 0.86, rate: 0.14 / 1.0 }; this.prevAct = 0;
    } else if (k === 'Sweaty' && (d.air || 0) > 0) {
      this.force('jump', 0.02 + 0.97 * clamp((5 - d.air) / 5, 0, 1));
    } else if (!this.rec && this.forced) this.release();
    if (k === 'Birther') { const sp = d.special || 0; if (sp > this.prevSpecial + 5 && this.prevSpecial > 0) body.play('roar', 0.45, 1.3); this.prevSpecial = sp; }
    // claw / smash wind-up: wind 0.5 -> 0, hit at 0
    const w = d.wind || 0;
    if (w > 0 && this.prevWind <= 0 && !this.forced) body.play(this.def.big ? 'smash' : 'attack', Math.max(0.15, w), this.def.big ? 0.6 : 0.42);
    this.prevWind = w;
    // stagger on a hit
    const sg = d.stagger || 0;
    if (sg > 0 && this.prevStag <= 0) { body.stagger(this.def.big ? 0.6 : 1); const fx = this.sys.crowd.fx; _v.set(0, body.D.T.h * 0.6, body.D.T.d).applyMatrix4(body.M[B.TORSO]).applyMatrix4(this.rootM()); fx.burst(_v, 10, 1.6, 2.2, 0.035 * Math.sqrt(this.scale)); }
    if (d.hp !== undefined && this.prevHp !== undefined && d.hp < this.prevHp - 0.5) body.flash = Math.max(body.flash, 0.7);
    this.prevHp = d.hp; this.prevStag = sg;
    if (k === 'Tumour' && d.hp !== undefined && d.hp_max) this.fastPulse = d.hp < d.hp_max * 0.5;
    I.chase = d.chasing ? 1 : 0;
  }

  // carried corpse (carry.js): bones from the 15 world particles; the root becomes identity
  ragdoll(d) {
    const P = d.particles; if (!P || P.length < 15) return;
    const s = (d.scale || this.scale) * this.def.spec.heightM / this.body.D.top; // bot units -> metres at the corpse scale
    this.rag = true; this.mesh.position.set(P[0].x, P[0].y, P[0].z);
    this.body.fromParticles(P, s);
    this.body.writeBones(this.sys.crowd.data, this.sys.crowd.row(this.slot));
    const o = this.sys.crowd.row(this.slot) + 75 * 4; this.sys.crowd.data.set(this.body.params, o);
  }
}

export function createPeople(G) {
  const crowd = new Crowd(G.scene, { shadows: true });
  const weapons = new WeaponLayer(G.scene, crowd.fx);
  const sys = { scene: G.scene, crowd, weapons, list: [], frame: 0, remove(p) { const i = this.list.indexOf(p); if (i >= 0) this.list.splice(i, 1); } };
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), sph = new THREE.Sphere(), camP = new THREE.Vector3();
  const stats = { ms: 0, animated: 0, culled: 0 };
  const corpses = new Set();
  let T = 0;
  return {
    crowd, weapons,
    spawn(seed, kind, pos, opts) { const p = new Person(sys, seed, kind === undefined ? null : kind, pos, opts); sys.list.push(p); return p; },
    update(dt) {
      const t0 = performance.now(); T += dt; sys.frame++;
      const cam = G.camera; cam.updateMatrixWorld(); pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); frustum.setFromProjectionMatrix(pv); camP.setFromMatrixPosition(cam.matrixWorld);
      crowd.beginFrame(); weapons.begin(); const wl = [];
      let animated = 0, culled = 0;
      const L = sys.list;
      for (const p of L) { p.place(dt); p.dist = p.mesh.position.distanceTo(camP); }
      const order = L.slice().sort((a, b) => a.dist - b.dist);
      for (const p of order) {
        const s = p.scale, h = p.def.spec.heightM * s;
        sph.center.set(p.mesh.position.x, p.mesh.position.y + 0.5 * h, p.mesh.position.z); sph.radius = 0.75 * h + 0.6;
        const rag = p.desc && p.desc.ragdoll;
        const vis = p.visible && (rag || frustum.intersectsSphere(sph));
        let rate = 1;
        if (!vis) { rate = p.dist < 6 ? 2 : 8; culled++; }
        else if (p.dist > 45) rate = 4;
        else if (p.dist > 22 || animated > 40) rate = 2;
        p.acc += dt;
        if (rag) { p.step(p.acc, null); p.acc = 0; }
        else if (rate === 1 || (sys.frame + p.slot) % rate === 0) {
          const look = !p.zombie && vis && p.dist < 5 && !p.opts.cine ? camP : null;
          p.step(Math.min(p.acc, 0.25), look); p.acc = 0; animated++;
        }
        if (!rag) p.writeRoot();
        // params every frame (blink / flicker run in the body)
        crowd.data.set(p.body.params, crowd.row(p.slot) + 75 * 4);
        if (vis) { crowd.show(p.proto, p.slot); if (p.body.wShown) { wl.length = 0; p.body.weaponDraw(p.rootM(), wl); for (const [id, M] of wl) weapons.add(id, M); } }
      }
      for (const c of corpses) {
        const g = c.group; if (!g.parent) continue;
        g.updateMatrixWorld(); let vis = g.visible; for (let o = g.parent; o && vis; o = o.parent) vis = o.visible;
        if (!vis) continue;
        const k = c.k, e = _m.copy(g.matrixWorld).multiply(_m2.makeScale(k, k, k)).elements, o = crowd.row(c.slot) + 72 * 4, D = crowd.data;
        D[o] = e[0]; D[o + 1] = e[4]; D[o + 2] = e[8]; D[o + 3] = e[12]; D[o + 4] = e[1]; D[o + 5] = e[5]; D[o + 6] = e[9]; D[o + 7] = e[13]; D[o + 8] = e[2]; D[o + 9] = e[6]; D[o + 10] = e[10]; D[o + 11] = e[14];
        sph.center.setFromMatrixPosition(g.matrixWorld); sph.radius = 2 * c.scale;
        if (frustum.intersectsSphere(sph)) crowd.show(c.proto, c.slot);
      }
      crowd.endFrame(T, dt, cam); weapons.end(dt);
      stats.ms = performance.now() - t0; stats.animated = animated; stats.culled = culled;
    },
    count() { return sys.list.length; },
    // static fallen robot (kind 0 Base, 1 Tumour, 2 Hulk): head and a forearm knocked off beside the body
    corpseFigure(seed, kind) {
      const zk = ['Base', 'Tumour', 'Hulk'][Math.min(2, Math.max(0, kind | 0))], def = zombieRobotDef(seed >>> 0, zk), pr = crowd.proto(def);
      const body = new RoboBody(pr.P, seed >>> 0, { zombie: true, kind: zk, big: !!def.big });
      const scale = def.scale * (zk === 'Base' ? 0.96 + (mix32(seed >>> 0) % 9) * 0.01 : 1); body.mpu = pr.dims.k * scale;
      Object.assign(body.I, zStyle(seed >>> 0, zk));
      const hh = mix32((seed >>> 0) * 3 + 11) % 100; if (zk !== 'Hulk') { if (hh < 22) { body.setHidden(B.LFORE, 1); body.setHidden(B.LHAND, 1); } else if (hh >= 60 && hh < 90) { body.setHidden(B.RFORE, 1); body.setHidden(B.RHAND, 1); } }
      body.settleCorpse();
      const slot = crowd.alloc(); body.writeBones(crowd.data, crowd.row(slot)); crowd.data.set(body.params, crowd.row(slot) + 75 * 4);
      const g = new THREE.Group(); g.name = 'robot-corpse';
      // the figure faces +Z like the twt corpse prop frame (people.js rotated its figure the same way)
      const c = { group: g, slot, proto: pr, k: body.mpu, scale };
      g.userData.dispose = () => { if (!corpses.has(c)) return; corpses.delete(c); crowd.release(slot); };
      corpses.add(c);
      return g;
    },
    corpse(mb, seed, kind) { return (kind | 0) >= 2 ? 1.5 : 1.0; },
    stats() { let tris = 0; for (const p of sys.list) tris += p.proto.tris; return Object.assign({ count: sys.list.length, protos: crowd.protos.size, tris, calls: crowd.lastCalls, drawnTris: crowd.lastTris, corpses: corpses.size }, stats); },
    prewarm(list) { for (const [seed, kind, opts] of list) crowd.proto(kind ? zombieRobotDef(seed >>> 0, kind, opts && opts.role) : robotDef(seed >>> 0, (opts && opts.role) || 'customer')); },
    list: () => sys.list.slice(),
    fx: (kind, pos) => crowd.fx.burst(pos, kind === 'big' ? 30 : 10),
  };
}
