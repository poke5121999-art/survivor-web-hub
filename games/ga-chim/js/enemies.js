// Enemies: "Bọ Sắt" (scrap quadruped that rushes and lunges) and "Đom Đóm" (searchlight drone that strafes
// and fires telegraphed bursts). Perception uses an exposure meter; attack tokens keep fights fair.
import * as THREE from '../vendor/three.module.min.js';
import { Kit, chamferBox, cylinder, lathe } from './kit.js';
import { mat, noMask, keepAlpha } from './mats.js';
import { rng, clamp, damp, lerp } from './rng.js';
import { buildRaider, animateRaider } from './humans.js';

const TOKENS = { max: 2, gap: 1.25 };
let M = null;
function mats() {
  if (M) return M;
  const b = { space: 'object', macro: 0.1, wetK: 1 };
  const E = (r, g, bb) => noMask(new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, bb) }));
  M = {
    hull: mat({ ...b, surf: 'paintedMetal', paint: 0x8a6a1e, scale: 3 }),
    dark: mat({ ...b, surf: 'paintedMetal', paint: 0x1d1c1b, scale: 4 }),
    steel: mat({ ...b, surf: 'steel', scale: 4, roughK: 0.8 }),
    rust: mat({ ...b, surf: 'rust', scale: 3 }),
    rubber: mat({ ...b, surf: 'polymer', scale: 4 }),
    droneBody: mat({ ...b, surf: 'paintedMetal', paint: 0x2b3238, scale: 4 }),
    eye: E(10, 0.6, 0.25), eyeHot: E(30, 3, 1), nav: E(0.2, 8, 1), lens: E(4, 0.2, 0.1),
  };
  return M;
}

function crawlerModel(seed) {
  const m = mats(); const r = rng(seed);
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const k = new Kit();
  k.box(0.86, 0.36, 1.25, 'hull', 0, 0, 0, 0.07);
  k.box(0.7, 0.14, 0.5, 'hull', 0, 0.22, -0.25, 0.05);
  k.box(0.74, 0.12, 0.42, 'hull', 0, 0.2, 0.2, 0.05);
  k.box(0.5, 0.1, 0.3, 'rust', 0, 0.3, 0.05, 0.04);
  k.box(0.96, 0.08, 0.3, 'dark', 0, -0.06, -0.3, 0.02);
  k.box(0.96, 0.08, 0.3, 'dark', 0, -0.06, 0.32, 0.02);
  for (const sx of [-1, 1]) { k.cyl(0.05, 0.4, 'steel', sx * 0.25, 0.15, 0.62, 10, 'z'); k.cyl(0.07, 0.08, 'dark', sx * 0.25, 0.15, 0.84, 10, 'z'); }
  for (let i = 0; i < 5; i++) k.box(0.9, 0.02, 0.04, 'dark', 0, 0.185, -0.5 + i * 0.25, 0.008);
  // head
  k.push().at(0, 0.06, -0.72);
  k.box(0.42, 0.26, 0.3, 'dark', 0, 0, 0, 0.05);
  k.box(0.3, 0.05, 0.04, 'eye', 0, 0.04, -0.16, 0.01);
  k.cyl(0.06, 0.06, 'lens', 0.12, -0.05, -0.16, 12, 'z');
  for (const sx of [-1, 1]) { k.push().at(sx * 0.16, -0.12, -0.12, sx * 0.3); k.box(0.05, 0.05, 0.3, 'steel', 0, 0, -0.1, 0.015); k.box(0.04, 0.04, 0.12, 'steel', sx * -0.04, 0, -0.27, 0.01); k.pop(); }
  k.pop();
  const hull = k.build(m, { }); body.add(hull);
  const legs = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const hip = new THREE.Vector3(sx * 0.42, -0.02, sz * 0.42);
    const upper = new THREE.Group(), lower = new THREE.Group();
    const ku = new Kit(); ku.box(0.1, 0.1, 0.55, 'hull', 0, 0, -0.275, 0.03); ku.cyl(0.07, 0.14, 'dark', 0, 0, 0, 12, 'x'); ku.cyl(0.03, 0.4, 'steel', 0.06, 0.05, -0.28, 6, 'z');
    upper.add(ku.build(m));
    const kl = new Kit(); kl.box(0.08, 0.08, 0.6, 'dark', 0, 0, -0.3, 0.025); kl.cyl(0.06, 0.12, 'steel', 0, 0, 0, 12, 'x');
    const tip = new THREE.ConeGeometry(0.045, 0.16, 8); tip.rotateX(-Math.PI / 2); tip.translate(0, 0, -0.66); kl.add(tip, 'steel');
    lower.add(kl.build(m));
    legs.push({ hip, upper, lower, foot: new THREE.Vector3(), target: new THREE.Vector3(), lift: 0, phase: (sx * sz > 0 ? 0 : 0.5), planted: true });
  }
  for (const o of [root, ...legs.flatMap((L) => [L.upper, L.lower])]) o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  return { root, body, legs };
}

function droneModel(seed) {
  const m = mats();
  const root = new THREE.Group();
  const k = new Kit();
  const pod = lathe([[0, -0.18], [0.16, -0.16], [0.24, -0.06], [0.25, 0.04], [0.18, 0.13], [0, 0.16]], 18); k.add(pod, 'droneBody');
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2; const x = Math.cos(a) * 0.48, z = Math.sin(a) * 0.48;
    k.push().at(0, 0.02, 0, -a); k.box(0.42, 0.05, 0.07, 'dark', 0.26, 0, 0, 0.015); k.pop();
    k.push().at(x, 0.05, z); const ring = new THREE.TorusGeometry(0.2, 0.025, 6, 24); ring.rotateX(Math.PI / 2); k.add(ring, 'droneBody'); k.cyl(0.04, 0.08, 'dark', 0, 0, 0, 10); k.pop();
  }
  k.push().at(0, -0.2, -0.05); k.box(0.16, 0.14, 0.18, 'dark', 0, 0, 0, 0.03); k.cyl(0.05, 0.05, 'lens', 0, 0, -0.1, 14, 'z'); k.pop();
  k.box(0.04, 0.04, 0.04, 'nav', 0.22, 0.05, -0.1, 0.005);
  k.box(0.04, 0.04, 0.04, 'eye', -0.22, 0.05, -0.1, 0.005);
  const body = k.build(m); root.add(body);
  const rotors = [];
  const bladeM = noMask(new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.35, depthWrite: false }));
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.19, 20), bladeM); disc.rotation.x = -Math.PI / 2;
    disc.position.set(Math.cos(a) * 0.48, 0.09, Math.sin(a) * 0.48); root.add(disc); rotors.push(disc);
  }
  // searchlight cone
  const len = 9; const cg = new THREE.CylinderGeometry(0.06, 1.6, len, 20, 1, true); cg.translate(0, -len / 2, 0);
  const cm = new THREE.ShaderMaterial({
    uniforms: { uC: { value: new THREE.Color(1.0, 0.25, 0.15) } },
    vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = -position.y/9.0; vec4 w = modelMatrix*vec4(position,1.); vN = normalize(mat3(modelMatrix)*normal); vV = cameraPosition - w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader: 'uniform vec3 uC; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 1.5); float a = f * pow(1.0 - vY, 2.0) * 0.16; gl_FragColor = vec4(uC * a, 1.0); }',
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  cm.userData.additive = true; cm.userData.premul = true; keepAlpha(cm);
  const cone = new THREE.Mesh(cg, cm); cone.position.set(0, -0.25, -0.12); cone.rotation.x = 0.6; root.add(cone);
  root.traverse((o) => { if (o.isMesh && o !== cone && !rotors.includes(o)) o.castShadow = true; });
  return { root, body, rotors, cone };
}

export class Enemies {
  constructor(G, grid) {
    this.G = G; this.grid = grid; this.list = []; this.tokens = 0; this.tokenGap = 0; this.r = rng('enemies'); this.kills = 0;
  }
  spawn(type, pos) {
    const e = { type, hp: type === 'crawler' ? 90 : 60, pos: pos.clone(), vel: new THREE.Vector3(), yaw: this.r() * 6.28, state: 'idle', alert: 0, t: 0, atk: 0, cd: 1 + this.r(), alive: true, dead: 0, id: this.list.length, seed: 'e' + this.list.length };
    if (type === 'crawler') {
      Object.assign(e, crawlerModel(e.seed)); e.speed = 5.6 + this.r() * 0.8; e.radius = 0.6;
      e.legs.forEach((L) => { this.G.scene.add(L.upper); this.G.scene.add(L.lower); L.foot.copy(L.hip).applyAxisAngle(new THREE.Vector3(0, 1, 0), e.yaw).add(e.pos).setY(0); L.foot.x += Math.sign(L.hip.x) * 0.35; });
    } else if (type === 'raider') {
      e.m = buildRaider(e.seed); e.root = e.m.root; e.hp = 100; e.speed = 4.2; e.radius = 0.4; e.phase = 0; e.orbit = this.r() < 0.5 ? 1 : -1; e.hit = 0; e.fireK = 0;
    } else {
      Object.assign(e, droneModel(e.seed)); e.pos.y = 5 + this.r() * 1.5; e.speed = 5; e.radius = 0.5; e.orbit = this.r() < 0.5 ? 1 : -1;
    }
    e.root.position.copy(e.pos);
    this.G.scene.add(e.root);
    this.list.push(e);
    return e;
  }
  get alive() { return this.list.filter((e) => e.alive).length; }
  // hit test for a ray: returns {e, t, head}
  raycast(o, d, maxD) {
    let best = null;
    for (const e of this.list) {
      if (!e.alive) continue;
      const spheres = e.type === 'crawler'
        ? [[e.root.localToWorld(new THREE.Vector3(0, 0.6, 0)), 0.62, false], [e.root.localToWorld(new THREE.Vector3(0, 0.66, -0.75)), 0.24, true]]
        : e.type === 'raider'
          ? [[e.m.j.chest.getWorldPosition(new THREE.Vector3()), 0.3, false], [e.m.j.hips.getWorldPosition(new THREE.Vector3()), 0.26, false], [e.m.j.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.03, 0)), 0.14, true], [e.pos.clone().setY(e.pos.y + 0.5), 0.22, false]]
          : [[e.pos, 0.55, false]];
      for (const [c, rr, head] of spheres) {
        const oc = o.clone().sub(c); const b = oc.dot(d); const cc = oc.lengthSq() - rr * rr; const h = b * b - cc;
        if (h < 0) continue; const t = -b - Math.sqrt(h);
        if (t > 0 && t < maxD && (!best || t < best.t)) best = { e, t, head };
      }
    }
    return best;
  }
  damage(e, dmg, dir, head) {
    if (!e.alive) return false;
    e.hp -= dmg * (head ? 1.7 : 1);
    e.alert = 1; e.state = 'hunt';
    if (e.type === 'crawler') { e.vel.addScaledVector(dir, 1.2); }
    if (e.type === 'raider') e.hit = 1;
    if (e.hp <= 0) { this.kill(e, dir); return true; }
    return false;
  }
  kill(e, dir) {
    e.alive = false; e.dead = 0; this.kills++;
    const p = e.type === 'crawler' ? e.root.localToWorld(new THREE.Vector3(0, 0.6, 0)) : e.type === 'raider' ? e.pos.clone().setY(e.pos.y + 1.1) : e.pos.clone();
    if (e.type !== 'raider') this.G.slfx.explosion(p, e.type === 'crawler' ? 0.7 : 0.55);
    this.G.events.emit('enemy:dead', { e, p });
    if (e.type === 'drone') { e.vel.set(dir.x * 2, 0, dir.z * 2); e.spin = (this.r() - 0.5) * 8; }
    if (e.atkToken) { this.tokens--; e.atkToken = false; }
  }
  losTo(from, to) {
    const d = to.clone().sub(from); const L = d.length(); d.divideScalar(L);
    const hit = this.grid.ray(from, d, L);
    return !hit;
  }
  update(dt, player) {
    const G = this.G; const pp = player.pos.clone(); const head = pp.clone().setY(pp.y + 1.5);
    this.tokenGap -= dt;
    for (const e of this.list) {
      e.t += dt;
      if (!e.alive) { this.updateDead(e, dt); continue; }
      const toP = head.clone().sub(e.type === 'drone' ? e.pos : e.pos.clone().setY(e.pos.y + (e.type === 'raider' ? 1.55 : 0.8)));
      const dist = toP.length();
      // perception: exposure meter
      if (e.state !== 'hunt') {
        const seen = dist < (e.type === 'crawler' ? 30 : 42) && (e.t % 0.3 < dt * 1.5 ? (e.los = this.losTo(e.type === 'drone' ? e.pos : e.pos.clone().setY(e.pos.y + (e.type === 'raider' ? 1.6 : 0.9)), head)) : e.los);
        const noise = player.lastShot && G.t - player.lastShot < 0.4 && dist < 60 ? 1 : 0;
        e.alert = clamp(e.alert + (seen ? dt * (1.6 - dist / 40) : -dt * 0.2) + noise, 0, 1);
        if (e.alert >= 1) { e.state = 'hunt'; G.events.emit('enemy:alert', e); }
      }
      if (e.type === 'crawler') this.updateCrawler(e, dt, player, toP, dist);
      else if (e.type === 'raider') this.updateRaider(e, dt, player, toP, dist, head);
      else this.updateDrone(e, dt, player, toP, dist, head);
    }
  }
  takeToken(e) {
    if (e.atkToken) return true;
    if (this.tokens >= TOKENS.max || this.tokenGap > 0) return false;
    this.tokens++; e.atkToken = true; this.tokenGap = TOKENS.gap; return true;
  }
  freeToken(e) { if (e.atkToken) { e.atkToken = false; this.tokens--; } }
  updateCrawler(e, dt, player, toP, dist) {
    const G = this.G;
    let want = new THREE.Vector3();
    if (e.state === 'hunt') {
      want.set(toP.x, 0, toP.z).normalize();
      // lunge attack
      if (e.atk > 0) {
        e.atk -= dt;
        if (e.atk <= 0.25 && !e.leapt) { e.leapt = true; e.vel.addScaledVector(want, 9); e.vel.y = 3.2; G.events.emit('crawler:leap', e); }
        if (e.leapt && !e.hitDone && e.pos.distanceTo(player.pos) < 1.4) { e.hitDone = true; G.events.emit('player:hit', { dmg: 18 * G.diff.dmg, from: e.pos.clone() }); }
        if (e.atk <= 0) { e.cd = 1.4; this.freeToken(e); }
        want.multiplyScalar(0.2);
      } else {
        e.cd -= dt;
        if (dist < 3.2 && e.cd <= 0 && this.takeToken(e)) { e.atk = 0.8; e.leapt = false; e.hitDone = false; G.events.emit('crawler:tell', e); }
      }
    } else {
      // idle wander
      want.set(Math.sin(e.t * 0.3 + e.id), 0, Math.cos(e.t * 0.23 + e.id * 2)).multiplyScalar(0.25);
    }
    const sp = e.state === 'hunt' ? e.speed : 1.2;
    e.vel.x = damp(e.vel.x, want.x * sp, 5, dt); e.vel.z = damp(e.vel.z, want.z * sp, 5, dt);
    e.vel.y -= 20 * dt;
    e.pos.addScaledVector(e.vel, dt);
    // collide like the player
    for (const b of this.grid.near(e.pos.x, e.pos.z, 1.2)) {
      if (b.max.y < e.pos.y + 0.3 || b.min.y > e.pos.y + 1.0) continue;
      const cx = clamp(e.pos.x, b.min.x, b.max.x), cz = clamp(e.pos.z, b.min.z, b.max.z);
      const dx = e.pos.x - cx, dz = e.pos.z - cz, d2 = dx * dx + dz * dz;
      if (d2 < e.radius * e.radius && d2 > 1e-6) { const d = Math.sqrt(d2); e.pos.x += dx / d * (e.radius - d); e.pos.z += dz / d * (e.radius - d); e.vel.x *= 0.5; e.vel.z *= 0.5; }
    }
    // separation from other crawlers
    for (const o of this.list) if (o !== e && o.alive && o.type === 'crawler') { const d = e.pos.clone().sub(o.pos).setY(0); const l = d.length(); if (l < 1.3 && l > 1e-3) e.pos.addScaledVector(d, (1.3 - l) / l * 0.5); }
    let g = 0; for (const b of this.grid.near(e.pos.x, e.pos.z, 0.5)) if (e.pos.x > b.min.x && e.pos.x < b.max.x && e.pos.z > b.min.z && e.pos.z < b.max.z && b.max.y < e.pos.y + 0.5 && b.max.y > g) g = b.max.y;
    if (e.pos.y < g) { e.pos.y = g; e.vel.y = 0; }
    const hv = Math.hypot(e.vel.x, e.vel.z);
    if (hv > 0.2) e.yaw = Math.atan2(-e.vel.x, -e.vel.z) * 0 + lerpAngle(e.yaw, Math.atan2(-e.vel.x, -e.vel.z), 1 - Math.exp(-8 * dt));
    e.root.position.copy(e.pos); e.root.rotation.y = e.yaw;
    // body bob and attack crouch
    const tell = e.atk > 0.25 ? 1 : 0;
    e.body.position.y = 0.62 + Math.sin(e.t * 14) * 0.02 * Math.min(1, hv / 3) - tell * 0.12;
    e.body.rotation.x = tell * 0.15 - (e.leapt && e.atk > 0 ? 0.2 : 0);
    this.legsIK(e, dt, hv);
  }
  legsIK(e, dt, speed) {
    const up = new THREE.Vector3(0, 1, 0);
    const fwd = new THREE.Vector3(-Math.sin(e.yaw), 0, -Math.cos(e.yaw));
    const cycle = (e.t * Math.max(1.5, speed * 1.1)) % 1;
    for (const L of e.legs) {
      const hipW = L.hip.clone().add(new THREE.Vector3(0, e.body.position.y, 0)).applyAxisAngle(up, e.yaw).add(e.pos);
      const rest = L.hip.clone().setY(0); rest.x += Math.sign(L.hip.x) * 0.35; rest.z += Math.sign(L.hip.z) * 0.15;
      const restW = rest.applyAxisAngle(up, e.yaw).add(e.pos).addScaledVector(fwd, speed * 0.12); restW.y = e.pos.y;
      const swing = ((cycle + L.phase) % 1) < 0.5;
      if (speed > 0.3 && swing && L.planted && L.foot.distanceTo(restW) > 0.25) { L.planted = false; L.from = L.foot.clone(); L.target.copy(restW); L.lift = 0; }
      if (!L.planted) {
        L.lift = Math.min(1, L.lift + dt * Math.max(4, speed * 2.2));
        L.target.copy(restW);
        L.foot.lerpVectors(L.from, L.target, L.lift); L.foot.y = e.pos.y + Math.sin(L.lift * Math.PI) * 0.22;
        if (L.lift >= 1) { L.planted = true; if (speed > 2) this.G.events.emit('crawler:step', L.foot); }
      } else if (speed < 0.3 && L.foot.distanceTo(restW) > 0.6) { L.foot.copy(restW); }
      // 2-bone IK in the plane hip -> foot with the knee raised
      const a = 0.55, b = 0.66;
      const d = L.foot.clone().sub(hipW); let len = clamp(d.length(), 0.1, a + b - 0.01);
      const dirN = d.clone().normalize();
      const cosA = (a * a + len * len - b * b) / (2 * a * len); const ang = Math.acos(clamp(cosA, -1, 1));
      const side = new THREE.Vector3().crossVectors(dirN, up).normalize();
      if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
      const bendAxis = side.clone().multiplyScalar(Math.sign(L.hip.x) || 1);
      const kneeDir = dirN.clone().applyAxisAngle(bendAxis, ang * (Math.sign(L.hip.x) || 1) * -1);
      if (kneeDir.y < dirN.y) kneeDir.copy(dirN.clone().applyAxisAngle(bendAxis, ang * (Math.sign(L.hip.x) || 1)));
      const knee = hipW.clone().addScaledVector(kneeDir, a);
      L.upper.position.copy(hipW); L.upper.lookAt(knee); L.upper.rotateY(Math.PI);
      L.lower.position.copy(knee); L.lower.lookAt(L.foot); L.lower.rotateY(Math.PI);
    }
  }
  updateDrone(e, dt, player, toP, dist, head) {
    const G = this.G;
    let target = e.pos.clone();
    if (e.state === 'hunt') {
      const flat = new THREE.Vector3(-toP.x, 0, -toP.z).normalize();
      const ideal = 15;
      const orbitDir = new THREE.Vector3(-flat.z, 0, flat.x).multiplyScalar(e.orbit);
      target = player.pos.clone().addScaledVector(flat, ideal).addScaledVector(orbitDir, 4);
      target.y = 5.5 + Math.sin(e.t * 0.7 + e.id) * 0.8;
      // burst fire with telegraph
      e.cd -= dt;
      if (e.atk > 0) {
        e.atk -= dt;
        if (e.atk < 0.55 - 0.0 && e.atk > 0) {
          e.burstT = (e.burstT || 0) - dt;
          if (e.atk < 0.35 && e.burstT <= 0 && e.shots > 0) {
            e.burstT = 0.11; e.shots--;
            const from = e.root.localToWorld(new THREE.Vector3(0, -0.25, -0.2));
            const moving = player.speed > 2 ? 0.45 : 0.75;
            const hitP = this.losTo(from, head) && this.r() < moving * (1 - dist / 70);
            const aim = head.clone().add(new THREE.Vector3(this.r.range(-1, 1), this.r.range(-0.6, 0.4), this.r.range(-1, 1)).multiplyScalar(hitP ? 0 : 1.6));
            G.events.emit('drone:shot', { from, to: aim, hit: hitP, e });
            if (hitP) G.events.emit('player:hit', { dmg: 7 * G.diff.dmg, from });
          }
        }
        if (e.atk <= 0) { e.cd = 2.2 + this.r(); this.freeToken(e); }
      } else if (e.cd <= 0 && dist < 38 && e.los !== false && this.takeToken(e)) { e.atk = 1.2; e.shots = 4; G.events.emit('drone:tell', e); }
      if (e.t % 0.3 < dt * 1.5) e.los = this.losTo(e.pos, head);
    } else {
      target = e.home || (e.home = e.pos.clone());
      target = target.clone().add(new THREE.Vector3(Math.sin(e.t * 0.2 + e.id) * 8, Math.sin(e.t * 0.5) * 0.5, Math.cos(e.t * 0.17 + e.id) * 8));
    }
    const dv = target.sub(e.pos); const want = dv.clampLength(0, e.speed);
    e.vel.lerp(want, 1 - Math.exp(-1.6 * dt));
    e.pos.addScaledVector(e.vel, dt);
    e.root.position.copy(e.pos);
    const face = e.state === 'hunt' ? Math.atan2(-toP.x, -toP.z) : Math.atan2(-e.vel.x, -e.vel.z);
    e.yaw = lerpAngle(e.yaw, face, 1 - Math.exp(-4 * dt));
    e.root.rotation.set(-e.vel.z * 0.0 + clamp(e.vel.length() * 0.04, 0, 0.3), e.yaw, Math.sin(e.t * 1.3) * 0.05);
    for (const r of e.rotors) r.rotation.z += dt * 60;
    const tell = e.atk > 0.55 ? 1 : 0;
    e.cone.material.uniforms.uC.value.setRGB(1, tell ? 0.6 : 0.25, tell ? 0.4 : 0.15).multiplyScalar(tell ? 2.2 : 1);
    e.cone.rotation.x = e.state === 'hunt' ? clamp(Math.atan2(e.pos.y - head.y, Math.hypot(toP.x, toP.z)), 0.1, 1.4) : 0.6;
  }
  updateRaider(e, dt, player, toP, dist, head) {
    const G = this.G; const eye = e.pos.clone().setY(e.pos.y + 1.6);
    let want = new THREE.Vector3(); let aim = 0;
    if (e.state === 'hunt') {
      const flat = new THREE.Vector3(toP.x, 0, toP.z).normalize();
      if (e.t % 0.35 < dt * 1.5) e.los = this.losTo(eye, head);
      // advance until in range with line of sight, then strafe while shooting
      if (!e.los || dist > 24) want.copy(flat);
      else if (dist < 9) want.copy(flat).negate();
      else want.set(-flat.z, 0, flat.x).multiplyScalar(e.orbit * 0.6);
      if (e.t % 4 < dt) e.orbit *= -1;
      e.cd -= dt;
      if (e.atk > 0) {
        e.atk -= dt; aim = 1; want.multiplyScalar(0.25);
        e.m.eyeGlow.visible = e.atk > 0.5;
        if (e.atk < 0.5) {
          e.burstT = (e.burstT || 0) - dt;
          if (e.burstT <= 0 && e.shots > 0) {
            e.burstT = 0.12; e.shots--; e.fireK = 1;
            const from = e.m.muzzle.getWorldPosition(new THREE.Vector3());
            const acc = (player.speed > 2 ? 0.4 : 0.7) * (1 - dist / 60) * (player.crouch > 0.5 ? 0.8 : 1);
            const hitP = e.los && this.r() < acc;
            const to = head.clone().add(new THREE.Vector3(this.r.range(-1, 1), this.r.range(-0.7, 0.3), this.r.range(-1, 1)).multiplyScalar(hitP ? 0 : 1.4));
            G.events.emit('raider:shot', { from, to, hit: hitP, e });
            if (hitP) G.events.emit('player:hit', { dmg: 9 * G.diff.dmg, from });
          }
        }
        if (e.atk <= 0) { e.cd = 1.6 + this.r() * 1.2; this.freeToken(e); e.m.eyeGlow.visible = false; }
      } else if (e.cd <= 0 && e.los && dist < 34 && this.takeToken(e)) { e.atk = 1.15; e.shots = 3 + Math.floor(this.r() * 3); G.events.emit('raider:tell', e); }
      aim = Math.max(aim, e.los && dist < 34 ? 0.6 : 0);
    } else {
      want.set(Math.sin(e.t * 0.25 + e.id), 0, Math.cos(e.t * 0.2 + e.id * 2)).multiplyScalar(0.35);
    }
    const sp = e.state === 'hunt' ? e.speed : 1.3;
    e.vel.x = damp(e.vel.x, want.x * sp, 6, dt); e.vel.z = damp(e.vel.z, want.z * sp, 6, dt);
    e.pos.x += e.vel.x * dt; e.pos.z += e.vel.z * dt;
    for (const b of this.grid.near(e.pos.x, e.pos.z, 1.0)) {
      if (b.max.y < e.pos.y + 0.4 || b.min.y > e.pos.y + 1.7) continue;
      const cx = clamp(e.pos.x, b.min.x, b.max.x), cz = clamp(e.pos.z, b.min.z, b.max.z);
      const dx = e.pos.x - cx, dz = e.pos.z - cz, d2 = dx * dx + dz * dz;
      if (d2 < e.radius * e.radius && d2 > 1e-6) { const d = Math.sqrt(d2); e.pos.x += dx / d * (e.radius - d); e.pos.z += dz / d * (e.radius - d); }
    }
    let g = 0; for (const b of this.grid.near(e.pos.x, e.pos.z, 0.4)) if (e.pos.x > b.min.x && e.pos.x < b.max.x && e.pos.z > b.min.z && e.pos.z < b.max.z && b.max.y < e.pos.y + 0.5 && b.max.y > g) g = b.max.y;
    e.pos.y = damp(e.pos.y, g, 12, dt);
    const face = e.state === 'hunt' ? Math.atan2(-toP.x, -toP.z) : Math.atan2(-e.vel.x, -e.vel.z);
    if (e.state === 'hunt' || Math.hypot(e.vel.x, e.vel.z) > 0.2) e.yaw = lerpAngle(e.yaw, face, 1 - Math.exp(-7 * dt));
    e.root.position.copy(e.pos); e.root.rotation.y = e.yaw;
    const hv = Math.hypot(e.vel.x, e.vel.z);
    const local = new THREE.Vector3(e.vel.x, 0, e.vel.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), -e.yaw);
    const prevPh = e.phase; e.phase += dt * hv * 2.1;
    if (hv > 1 && Math.floor(e.phase / Math.PI) !== Math.floor(prevPh / Math.PI)) G.events.emit('raider:step', e.pos);
    e.hit = Math.max(0, e.hit - dt * 4); e.fireK = Math.max(0, e.fireK - dt * 10);
    e.aimK = damp(e.aimK || 0, aim, 6, dt);
    const dl = hv > 0.05 ? new THREE.Vector2(local.x, -local.z).normalize() : new THREE.Vector2(0, 1);
    animateRaider(e.m, { t: e.t, speed: hv, phase: e.phase, dirLocal: dl, aim: e.aimK, fire: e.fireK, hit: e.hit, dead: 0 }, dt);
  }
  updateDead(e, dt) {
    e.dead += dt;
    if (e.type === 'raider') {
      animateRaider(e.m, { t: e.t, speed: 0, phase: e.phase, aim: 0, fire: 0, hit: 0, dead: Math.min(1, e.dead * 1.2) }, dt);
      e.m.eyeGlow.visible = false;
      if (e.dead > 25 && !e.removed) { this.G.scene.remove(e.root); e.removed = true; }
      return;
    }
    if (e.type === 'drone') {
      if (e.pos.y > 0.3) { e.vel.y -= 14 * dt; e.pos.addScaledVector(e.vel, dt); e.root.rotation.z += (e.spin || 3) * dt; e.root.rotation.x += 2 * dt; if (e.pos.y <= 0.3) { e.pos.y = 0.3; this.G.slfx.explosion(e.pos.clone(), 0.45); this.G.events.emit('drone:crash', e); } }
      e.root.position.copy(e.pos); e.cone.visible = false;
    } else {
      e.body.position.y = damp(e.body.position.y, 0.25, 6, dt); e.body.rotation.z = damp(e.body.rotation.z, 0.3, 4, dt);
      if (e.dead < 0.6) this.legsIK(e, dt, 0);
      if (e.dead % 0.25 < dt && e.dead < 5) this.G.slfx.smoke(e.root.localToWorld(new THREE.Vector3(0, 0.7, 0.3)), { size: 0.35, life: 2.5, rise: 0.8, count: 1, alpha: 0.5 });
    }
    if (e.dead > 25 && !e.removed) { this.G.scene.remove(e.root); e.legs && e.legs.forEach((L) => { this.G.scene.remove(L.upper); this.G.scene.remove(L.lower); }); e.removed = true; }
  }
}
function lerpAngle(a, b, t) { let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; }
