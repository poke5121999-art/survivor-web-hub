// Viewmodel behaviour: spring-driven pose (kick, pitch, yaw, roll, sway, bob, landing), ADS, sprint,
// reload, muzzle flash, muzzle light, shell ejection with bounces, tracers. Gun gets wet in rain.
import * as THREE from '../vendor/three.module.min.js';
import { Spring, clamp, damp, lerp, rng } from './rng.js';
import { buildViewmodel, MAG_PIVOT as MAGP } from './gunmodel.js';
import { keepAlpha, noMask, U } from './mats.js';

export const RIFLE = { name: 'K9 CARBINE', rpm: 720, mag: 30, reserve: 150, dmg: 34, spreadHip: 0.0125, spreadAds: 0.0016, reload: 2.25, range: 220, recoilPitch: 0.012, recoilYaw: 0.004 };

const FLASH_FS = /* glsl */`
varying vec2 vUv; uniform float uA; uniform float uSeed;
void main(){
  vec2 p = vUv - 0.5; float r = length(p) * 2.0; float a = atan(p.y, p.x);
  float star = pow(max(0.0, cos(a * 3.0 + uSeed * 6.28)), 6.0) * (1.0 - r);
  float core = smoothstep(0.55, 0.0, r);
  float i = (core * 1.6 + star * 2.2) * uA;
  gl_FragColor = vec4(vec3(1.0, 0.62, 0.28) * i * 6.0, 0.0);
}`;

export class Weapon {
  constructor(G) {
    this.G = G;
    this.root = buildViewmodel();
    this.root.traverse((o) => o.layers.set(1));
    this.holder = new THREE.Group(); this.holder.add(this.root);
    G.scene.add(this.holder);
    this.vmCam = new THREE.PerspectiveCamera(52, G.camera.aspect, 0.01, 20);
    this.vmCam.layers.set(1);
    this.S = { kZ: new Spring(520, 30), kP: new Spring(380, 26), kY: new Spring(300, 22), kR: new Spring(300, 20), sx: new Spring(120, 16), sy: new Spring(120, 16), land: new Spring(160, 14), bumpZ: new Spring(200, 20) };
    this.ads = 0; this.sprint = 0; this.bobT = 0; this.reloadT = 0; this.cool = 0;
    this.ammo = RIFLE.mag; this.reserve = RIFLE.reserve; this.spread = RIFLE.spreadHip; this.bloom = 0;
    this.wet = 0;
    // muzzle flash: 3 crossed quads on the gun
    const fm = new THREE.ShaderMaterial({ uniforms: { uA: { value: 0 }, uSeed: { value: 0 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }', fragmentShader: FLASH_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    fm.userData.additive = true; fm.userData.premul = true; keepAlpha(fm);
    this.flash = new THREE.Group();
    const fwd = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), fm); this.flash.add(fwd);
    for (let i = 0; i < 2; i++) { const q = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.26), fm); q.rotation.set(Math.PI / 2, 0, i * Math.PI / 2); q.position.z = -0.1; this.flash.add(q); }
    this.flash.position.copy(this.root.userData.muzzle); this.flash.visible = false;
    this.flash.traverse((o) => { o.layers.set(1); o.renderOrder = 20; });
    this.root.userData.gun.add(this.flash);
    this.flashMat = fm; this.flashT = 0;
    // shells
    this.shells = [];
    const shellGeo = new THREE.CylinderGeometry(0.0048, 0.0048, 0.045, 10); shellGeo.rotateX(Math.PI / 2);
    this.shellMat = new THREE.MeshStandardMaterial({ color: 0xc9a050, metalness: 1, roughness: 0.28 });
    noMask(this.shellMat);
    this.shellMesh = new THREE.InstancedMesh(shellGeo, this.shellMat, 40);
    this.shellMesh.count = 0; this.shellMesh.frustumCulled = false; this.shellMesh.castShadow = false;
    G.scene.add(this.shellMesh);
    // tracers
    this.tracers = [];
    const tm = new THREE.MeshBasicMaterial({ color: new THREE.Color(10, 6, 2.5), transparent: true, depthWrite: false });
    tm.userData.additive = true; keepAlpha(tm);
    this.tracerGeo = new THREE.BoxGeometry(0.012, 0.012, 1); this.tracerMat = tm;
    this.events = [];
    this.r = rng('weapon');
  }
  get busy() { return this.reloadT > 0; }
  canFire() { return this.cool <= 0 && this.reloadT <= 0 && this.ammo > 0 && this.sprint < 0.3 && (this.tac || 0) < 0.3 && (this.wall || 0) < 0.5 && !(this.meleeT > 0) && !(this.inspectT > 0); }
  startInspect() { if (this.reloadT > 0 || this.inspectT > 0) return; this.inspectT = 2.8; }
  startMelee() { if (this.meleeT > 0 || this.reloadT > 0) return false; this.meleeT = 0.55; this.inspectT = 0; return true; }
  // returns ray origin/dir in world for the hit test, with spread
  fire(cam) {
    if (!this.canFire()) return null;
    this.cool = 60 / RIFLE.rpm; this.ammo--;
    const r = this.r;
    const S = this.S, a = this.ads;
    S.kZ.kick(lerp(0.9, 0.45, a)); S.kP.kick(lerp(1.4, 0.55, a)); S.kY.kick(r.range(-0.6, 0.6) * lerp(1, 0.4, a)); S.kR.kick(r.range(-1.2, 1.2) * lerp(1, 0.3, a));
    this.flashT = 0.05; this.flashMat.uniforms.uSeed.value = r(); this.flash.rotation.z = r() * 6.28; this.flash.scale.setScalar(r.range(0.8, 1.25));
    this.bloom = Math.min(this.bloom + 0.35, 1.6);
    const spread = lerp(RIFLE.spreadHip, RIFLE.spreadAds, a) * (1 + this.bloom);
    const dir = new THREE.Vector3(r.range(-1, 1) * spread, r.range(-1, 1) * spread, -1).normalize().applyQuaternion(cam.quaternion);
    // eject a shell
    const e = this.root.userData.eject.clone(); this.root.userData.gun.localToWorld(e);
    const vmToWorld = this.vmToWorld(e);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    this.spawnShell(vmToWorld, right.multiplyScalar(r.range(2.2, 3.2)).add(up.multiplyScalar(r.range(1.2, 2.0))));
    // muzzle world position for tracer start
    const m = this.root.userData.muzzle.clone(); this.root.userData.gun.localToWorld(m);
    const muzzleW = this.vmToWorld(m);
    this.G.lights.muzzle.position.copy(muzzleW); this.G.lights.muzzle.intensity = 22;
    return { origin: cam.position.clone(), dir, muzzle: muzzleW, recoil: { p: RIFLE.recoilPitch * lerp(1, 0.6, a), y: r.range(-1, 1) * RIFLE.recoilYaw } };
  }
  // the viewmodel is drawn with its own camera at the eye; map a viewmodel-space world point to the world camera frustum
  vmToWorld(p) {
    const cam = this.G.camera;
    const ndc = p.clone().project(this.vmCam);
    const d = p.distanceTo(this.vmCam.position);
    return new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(cam).sub(cam.position).normalize().multiplyScalar(d).add(cam.position);
  }
  spawnShell(pos, vel) {
    if (this.shells.length >= 40) this.shells.shift();
    this.shells.push({ p: pos.clone(), v: vel.clone(), q: new THREE.Quaternion(), w: new THREE.Vector3(this.r.range(-20, 20), this.r.range(-20, 20), this.r.range(-20, 20)), life: 6, bounced: 0 });
  }
  tracer(from, to) {
    const len = from.distanceTo(to);
    if (len < 2) return;
    const mesh = new THREE.Mesh(this.tracerGeo, this.tracerMat);
    mesh.renderOrder = 9;
    this.G.scene.add(mesh);
    this.tracers.push({ mesh, from: from.clone(), to: to.clone(), t: 0, len, speed: 420 });
  }
  startReload() {
    if (this.reloadT > 0 || this.ammo >= RIFLE.mag || this.reserve <= 0) return false;
    this.reloadT = RIFLE.reload; this.events.push('reload'); return true;
  }
  update(dt, st) {
    // st: { moving, speed, sprinting, ads, lookDX, lookDY, grounded, landed, rain, indoor }
    const S = this.S; const G = this.G;
    this.cool -= dt;
    this.bloom = Math.max(0, this.bloom - dt * 2.2);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) { const need = RIFLE.mag - this.ammo; const take = Math.min(need, this.reserve); this.ammo += take; this.reserve -= take; this.events.push('reloaded'); }
    }
    // situational weights: each hold blends in on its own spring
    this.tacT = st.sprinting ? (this.tacT || 0) + dt : 0;
    const tacOn = st.sprinting && this.tacT > 0.9;
    const busyHands = this.reloadT > 0 || this.meleeT > 0 || this.inspectT > 0;
    this.ads = damp(this.ads, st.ads && !busyHands && !st.sprinting && !(st.wall > 0.5) ? 1 : 0, 14, dt);
    this.sprint = damp(this.sprint, st.sprinting && !tacOn ? 1 : 0, 9, dt);
    this.tac = damp(this.tac || 0, tacOn ? 1 : 0, 6, dt);
    this.wall = damp(this.wall || 0, st.wall || 0, 10, dt);
    this.crouchK = damp(this.crouchK || 0, st.crouch ? 1 : 0, 8, dt);
    this.air = damp(this.air || 0, st.grounded ? 0 : 1, 6, dt);
    if (this.meleeT > 0) this.meleeT = Math.max(0, this.meleeT - dt);
    if (this.inspectT > 0) this.inspectT = Math.max(0, this.inspectT - dt);
    S.sx.t = clamp(-st.lookDX * 0.0009, -0.03, 0.03) * lerp(1, 0.25, this.ads);
    S.sy.t = clamp(st.lookDY * 0.0009, -0.03, 0.03) * lerp(1, 0.25, this.ads);
    if (st.landed) S.land.kick(-0.9 * Math.min(1, st.landed));
    for (const k in S) S[k].update(dt);
    if (st.moving && st.grounded) this.bobT += dt * (st.speed / 1.55) * Math.PI;
    const bobK = st.moving && st.grounded ? (st.sprinting ? 1.9 : 1) * lerp(1, 0.22, this.ads) : 0;
    const bobX = Math.sin(this.bobT) * 0.013 * bobK * 0.6, bobY = -Math.abs(Math.cos(this.bobT)) * 0.024 * bobK * 0.6;
    const breathe = Math.sin(G.t * 1.3) * 0.0015 * (1 - this.ads * 0.7);
    // poses: [x, y, z, pitch, yaw, roll]
    const P = {
      hip: [0.1, -0.13, -0.3, 0, 0.13, -0.09],
      ads: [0, -this.root.userData.sightY, -0.21, 0, 0, 0],
      sprint: [0.07, -0.16, -0.25, -0.25, 0.6, -0.1],
      tac: [0.1, -0.07, -0.25, 0.95, 0.35, 0.55],
      wall: [0.08, -0.19, -0.19, 0.75, 0.3, -0.25],
    };
    const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
    let q = mix(P.hip, P.ads, this.ads);
    q = mix(q, P.sprint, this.sprint * (1 - this.ads));
    q = mix(q, P.tac, this.tac);
    q = mix(q, P.wall, this.wall * (1 - this.tac));
    q[1] += this.crouchK * 0.012 * (1 - this.ads); q[5] -= this.crouchK * 0.07 * (1 - this.ads);
    q[1] += this.air * 0.015; q[3] += this.air * 0.07;
    // reload: gun cants toward the camera while the left hand swaps the magazine
    let rl = 0, rt = 0;
    if (this.reloadT > 0) { rt = 1 - this.reloadT / RIFLE.reload; rl = Math.sin(Math.min(1, rt * 1.1) * Math.PI); }
    q[5] += rl * 0.55; q[3] += rl * 0.22; q[1] -= rl * 0.03; q[0] -= rl * 0.02;
    // inspect: turn the gun to show its left side, then tilt it up
    if (this.inspectT > 0) { const it = 1 - this.inspectT / 2.8; const a = Math.sin(it * Math.PI); q[4] += a * 0.95; q[5] += a * 0.55; q[3] += Math.sin(it * Math.PI * 2) * 0.18; q[0] -= a * 0.06; }
    // melee: a short shove forward and left
    if (this.meleeT > 0) { const mt = 1 - this.meleeT / 0.55; const a = Math.sin(Math.min(1, mt * 1.6) * Math.PI); q[2] -= a * 0.16; q[4] -= a * 0.7; q[0] -= a * 0.08; q[5] += a * 0.3; }
    const ud = this.root.userData;
    // left hand: reload path, and it lets go of the gun in tactical sprint
    const LH = ud.leftHand; const bp = LH.userData.basePos, bq = LH.userData.baseQ;
    const grab = new THREE.Vector3(0.0, -0.2, -0.1), low = new THREE.Vector3(-0.08, -0.55, 0.05);
    const off = new THREE.Vector3(-0.12, -0.42, 0.12);
    const ease = (a, b, t) => clamp((t - a) / (b - a), 0, 1);
    const sm = (t) => t * t * (3 - 2 * t);
    let hp = bp.clone(); let magY = 0, magVis = true;
    if (this.reloadT > 0) {
      const t = rt;
      hp.lerp(grab, sm(ease(0.06, 0.22, t)));
      hp.lerp(low, sm(ease(0.24, 0.4, t)));
      hp.lerp(grab, sm(ease(0.48, 0.66, t)));
      hp.lerp(bp, sm(ease(0.74, 0.92, t)));
      magY = -0.4 * sm(ease(0.24, 0.4, t)) + 0.4 * sm(ease(0.48, 0.66, t));
      if (t > 0.24 && !this.dropped) { this.dropped = true; this.events.push('magout'); }
      if (t > 0.64 && !this.seated) { this.seated = true; this.events.push('magin'); }
    } else { this.dropped = false; this.seated = false; }
    hp.lerp(off, this.tac);
    LH.position.copy(hp); LH.quaternion.copy(bq);
    ud.mag.position.set(MAGP.x, MAGP.y + magY, MAGP.z + (magY < -0.01 ? -magY * 0.25 : 0)); ud.mag.visible = magVis;
    const root = this.root;
    root.position.set(q[0] + bobX + S.sx.x + S.kY.x * 0.004, q[1] + bobY + breathe + S.sy.x + S.land.x * 0.02, q[2] + S.kZ.x * 0.035);
    root.rotation.set(q[3] + S.kP.x * 0.035 + S.sy.x * 1.5, q[4] + S.kY.x * 0.02 + S.sx.x * 1.5, q[5] + S.kR.x * 0.03 + bobX * 2);
    // hold the viewmodel at the eye
    this.holder.position.copy(G.camera.position); this.holder.quaternion.copy(G.camera.quaternion);
    this.vmCam.position.copy(G.camera.position); this.vmCam.quaternion.copy(G.camera.quaternion);
    this.vmCam.fov = lerp(52, 40, this.ads); this.vmCam.aspect = G.camera.aspect; this.vmCam.updateProjectionMatrix();
    this.vmCam.updateMatrixWorld();
    // flash
    this.flashT -= dt; this.flash.visible = this.flashT > 0; this.flashMat.uniforms.uA.value = Math.max(0, this.flashT / 0.05);
    G.lights.muzzle.intensity = Math.max(0, G.lights.muzzle.intensity - dt * 600);
    // wetness: rises in rain, dries indoors
    const target = st.indoor ? 0 : (U.uRain.value > 0 ? 1 : 0);
    this.wet = damp(this.wet, target, target > this.wet ? 0.25 : 0.06, dt);
    U.uGunWet.value = this.wet;
    // shells
    const m4 = new THREE.Matrix4(); let n = 0;
    for (const s of this.shells) {
      s.life -= dt;
      s.v.y -= 9.8 * dt; s.p.addScaledVector(s.v, dt);
      const gy = st.groundAt ? st.groundAt(s.p) : 0;
      if (s.p.y < gy + 0.005) { s.p.y = gy + 0.005; if (s.v.y < -0.6) { s.v.y *= -0.35; s.v.x *= 0.5; s.v.z *= 0.5; s.w.multiplyScalar(0.5); if (s.bounced++ < 2) this.events.push(['shell', s.p.clone()]); } else { s.v.set(0, 0, 0); s.w.multiplyScalar(0.9); } }
      const dq = new THREE.Quaternion().setFromEuler(new THREE.Euler(s.w.x * dt, s.w.y * dt, s.w.z * dt)); s.q.multiply(dq);
      m4.compose(s.p, s.q, new THREE.Vector3(1, 1, 1)); this.shellMesh.setMatrixAt(n++, m4);
    }
    this.shells = this.shells.filter((s) => s.life > 0);
    this.shellMesh.count = n; this.shellMesh.instanceMatrix.needsUpdate = true;
    // tracers
    for (const t of this.tracers) {
      t.t += dt * t.speed;
      const a = Math.min(t.t, t.len), b = Math.max(0, a - 6);
      const pa = t.from.clone().lerp(t.to, a / t.len), pb = t.from.clone().lerp(t.to, b / t.len);
      t.mesh.position.copy(pa).add(pb).multiplyScalar(0.5); t.mesh.lookAt(pa); t.mesh.scale.set(1, 1, Math.max(0.01, a - b));
      if (t.t > t.len) { this.G.scene.remove(t.mesh); t.dead = true; }
    }
    this.tracers = this.tracers.filter((t) => !t.dead);
  }
  draw(renderer) {
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.G.scene, this.vmCam);
  }
}
