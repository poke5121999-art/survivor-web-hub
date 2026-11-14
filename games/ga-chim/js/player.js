// Player: pointer-lock look, WASD movement with the Saltline numbers, capsule vs AABB colliders on a grid,
// step-up onto platforms, jump with coyote time and buffer, crouch, sprint, ADS FOV, footsteps by distance.
import * as THREE from '../vendor/three.module.min.js';
import { clamp, damp, lerp } from './rng.js';

export const MOVE = { walk: 3.8, sprint: 6.4, crouch: 1.9, ads: 2.4, accelGround: 34, decelGround: 26, accelAir: 9, gravity: 21, jumpV: 6.2, coyote: 0.12, jumpBuffer: 0.13, stride: { walk: 1.55, sprint: 2.1, crouch: 1.05 } };

export class Grid {
  constructor(boxes, cell = 6) {
    this.cell = cell; this.map = new Map(); this.boxes = boxes;
    boxes.forEach((b, i) => {
      for (let x = Math.floor(b.min.x / cell); x <= Math.floor(b.max.x / cell); x++)
        for (let z = Math.floor(b.min.z / cell); z <= Math.floor(b.max.z / cell); z++) {
          const k = x + ',' + z; if (!this.map.has(k)) this.map.set(k, []); this.map.get(k).push(i);
        }
    });
  }
  near(x, z, r) {
    const out = new Set(); const c = this.cell;
    for (let gx = Math.floor((x - r) / c); gx <= Math.floor((x + r) / c); gx++)
      for (let gz = Math.floor((z - r) / c); gz <= Math.floor((z + r) / c); gz++) {
        const l = this.map.get(gx + ',' + gz); if (l) for (const i of l) out.add(i);
      }
    return [...out].map((i) => this.boxes[i]);
  }
  // nearest hit of a ray against boxes, up to maxD
  ray(o, d, maxD) {
    let best = maxD, bestBox = null, bestN = null;
    const step = this.cell * 0.5; const seen = new Set();
    for (let t = 0; t <= Math.min(maxD, best) + step; t += step) {
      const px = o.x + d.x * t, pz = o.z + d.z * t;
      const l = this.map.get(Math.floor(px / this.cell) + ',' + Math.floor(pz / this.cell));
      if (!l) continue;
      for (const i of l) {
        if (seen.has(i)) continue; seen.add(i);
        const hit = rayBox(o, d, this.boxes[i]);
        if (hit && hit.t < best) { best = hit.t; bestBox = this.boxes[i]; bestN = hit.n; }
      }
      if (bestBox && t > best) break;
    }
    return bestBox ? { t: best, box: bestBox, n: bestN } : null;
  }
}
export function rayBox(o, d, b) {
  let tmin = -Infinity, tmax = Infinity, nAxis = 0, nSign = 0;
  for (let a = 0; a < 3; a++) {
    const k = ['x', 'y', 'z'][a];
    if (Math.abs(d[k]) < 1e-8) { if (o[k] < b.min[k] || o[k] > b.max[k]) return null; continue; }
    let t1 = (b.min[k] - o[k]) / d[k], t2 = (b.max[k] - o[k]) / d[k]; let s = -1;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
    if (t1 > tmin) { tmin = t1; nAxis = a; nSign = s; }
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  const t = tmin > 0 ? tmin : 0;
  const n = new THREE.Vector3();
  n.setComponent(nAxis, -Math.sign(d[['x', 'y', 'z'][nAxis]]));
  return { t, n };
}

export class Player {
  constructor(G, grid) {
    this.G = G; this.grid = grid;
    this.pos = new THREE.Vector3(-2, 0, 44); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.radius = 0.35; this.height = 1.72; this.eye = 1.62;
    this.grounded = true; this.coyote = 0; this.jumpBuf = 0; this.crouch = 0; this.stepAcc = 0;
    this.keys = new Set(); this.mouse = { l: false, r: false }; this.look = { dx: 0, dy: 0 };
    this.sens = 0.0022; this.hp = 100; this.dead = false; this.landed = 0; this.camY = this.eye;
    this.rec = { x: 0, y: 0, b: 0, m: 0, hold: 0 }; this.shake = 0; this.shakeT = 0; this.fov = 74; this.indoor = false; this.events = [];
    this.bind();
  }
  bind() {
    const c = this.G.renderer.domElement;
    addEventListener('keydown', (e) => { this.keys.add(e.code); if (e.code === 'Space') this.jumpBuf = MOVE.jumpBuffer; if (['Space', 'Tab'].includes(e.code)) e.preventDefault(); });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('mousemove', (e) => { if (document.pointerLockElement === c || this.G.params.nolock) { this.look.dx += e.movementX; this.look.dy += e.movementY; } });
    addEventListener('mousedown', (e) => { if (e.button === 0) this.mouse.l = true; if (e.button === 2) this.mouse.r = true; });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.l = false; if (e.button === 2) this.mouse.r = false; });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('blur', () => { this.keys.clear(); this.mouse.l = this.mouse.r = false; });
  }
  groundAt(x, z, feet) {
    let g = 0;
    for (const b of this.grid.near(x, z, this.radius)) {
      if (x + this.radius * 0.6 < b.min.x || x - this.radius * 0.6 > b.max.x || z + this.radius * 0.6 < b.min.z || z - this.radius * 0.6 > b.max.z) continue;
      if (b.max.y <= feet + 0.45 && b.max.y > g) g = b.max.y;
    }
    return g;
  }
  collide(p) {
    const r = this.radius;
    for (let it = 0; it < 3; it++) {
      for (const b of this.grid.near(p.x, p.z, r + 0.5)) {
        if (b.max.y <= p.y + 0.45 || b.min.y >= p.y + this.height) continue;
        const cx = clamp(p.x, b.min.x, b.max.x), cz = clamp(p.z, b.min.z, b.max.z);
        const dx = p.x - cx, dz = p.z - cz; const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 1e-8) { const d = Math.sqrt(d2); p.x += (dx / d) * (r - d); p.z += (dz / d) * (r - d); }
          else { // inside: push along the shallowest axis
            const ox = Math.min(p.x - b.min.x, b.max.x - p.x), oz = Math.min(p.z - b.min.z, b.max.z - p.z);
            if (ox < oz) p.x = p.x - b.min.x < b.max.x - p.x ? b.min.x - r : b.max.x + r; else p.z = p.z - b.min.z < b.max.z - p.z ? b.min.z - r : b.max.z + r;
          }
        }
      }
    }
  }
  update(dt, weapon) {
    const k = this.keys; const G = this.G;
    // look
    const adsK = lerp(1, 0.6, weapon ? weapon.ads : 0);
    this.yaw -= this.look.dx * this.sens * adsK; this.pitch -= this.look.dy * this.sens * adsK;
    this.lookDX = this.look.dx; this.lookDY = this.look.dy; this.look.dx = this.look.dy = 0;
    // recoil (Saltline weapon.md §4): transient part held .09 s, decays at 6.5, camera chases it at 34
    const R = this.rec; R.hold -= dt;
    if (R.hold <= 0) { R.x = damp(R.x, 0, 6.5, dt); R.y = damp(R.y, 0, 6.5, dt); }
    R.b = damp(R.b, R.x, 34, dt); R.m = damp(R.m, R.y, 34, dt);
    this.shake = Math.max(0, this.shake - dt * 1.7); this.shakeT += dt;
    this.pitch = clamp(this.pitch, -1.45, 1.45);
    if (this.dead) { this.vel.set(0, 0, 0); this.applyCam(dt); return; }
    // move
    const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0), s = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    this.moveX = s; this.moveY = f;
    const crouching = k.has('ControlLeft') || k.has('KeyC');
    this.crouch = damp(this.crouch, crouching ? 1 : 0, 12, dt);
    const ads = this.mouse.r;
    const sprinting = k.has('ShiftLeft') && f > 0 && !ads && !crouching;
    const max = crouching ? MOVE.crouch : ads ? MOVE.ads : sprinting ? MOVE.sprint : MOVE.walk;
    const wish = new THREE.Vector3(s, 0, -f); if (wish.lengthSq() > 0) wish.normalize();
    wish.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw).multiplyScalar(max);
    const acc = this.grounded ? (wish.lengthSq() > 0 ? MOVE.accelGround : MOVE.decelGround) : MOVE.accelAir;
    const hv = new THREE.Vector3(this.vel.x, 0, this.vel.z);
    const dv = wish.clone().sub(hv); const dl = dv.length(); const stepV = acc * dt;
    if (dl > stepV) dv.multiplyScalar(stepV / dl);
    this.vel.x += dv.x; this.vel.z += dv.z;
    // jump
    this.coyote = this.grounded ? MOVE.coyote : this.coyote - dt; this.jumpBuf -= dt;
    if (this.jumpBuf > 0 && this.coyote > 0 && !crouching) { this.vel.y = MOVE.jumpV; this.grounded = false; this.coyote = 0; this.jumpBuf = 0; this.events.push('jump'); }
    this.vel.y -= MOVE.gravity * dt;
    const before = this.pos.clone();
    // substeps so fast movement never tunnels
    const dist = this.vel.length() * dt; const n = Math.max(1, Math.ceil(dist / (this.radius * 0.6)));
    for (let i = 0; i < n; i++) {
      this.pos.x += this.vel.x * dt / n; this.pos.z += this.vel.z * dt / n;
      this.collide(this.pos);
      this.pos.y += this.vel.y * dt / n;
      const g = this.groundAt(this.pos.x, this.pos.z, before.y);
      if (this.pos.y <= g) {
        if (!this.grounded && this.vel.y < -4) { this.landed = Math.min(1, -this.vel.y / 12); this.events.push('land'); }
        this.pos.y = g; this.vel.y = 0; this.grounded = true;
      } else if (this.pos.y > g + 0.05) this.grounded = this.vel.y <= 0 && this.pos.y - g < 0.06 ? true : false;
    }
    // ceiling-free world; keep inside the fence
    this.pos.x = clamp(this.pos.x, -59, 31); this.pos.z = clamp(this.pos.z, -209, 65);
    // footsteps by distance
    const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
    this.speed = moved / Math.max(dt, 1e-4);
    if (this.grounded) {
      this.stepAcc += moved;
      const stride = crouching ? MOVE.stride.crouch : sprinting ? MOVE.stride.sprint : MOVE.stride.walk;
      if (this.stepAcc > stride) { this.stepAcc = 0; this.events.push(['step', this.surface()]); }
    }
    this.sprinting = sprinting; this.ads = ads; this.moving = moved > 0.002;
    this.applyCam(dt);
  }
  addRecoil(pitch, yaw) {
    this.pitch += pitch * 0.35; this.yaw += yaw * 0.35;
    const R = this.rec; R.x = clamp(R.x + pitch * 0.65, -0.3, 0.3); R.y = clamp(R.y + yaw * 0.65, -0.2, 0.2); R.hold = 0.09;
  }
  addShake(a) { this.shake = Math.min(1, this.shake + a); }
  surface() {
    const x = this.pos.x; let onTrack = false;
    for (const tx of [-24, -18.5, -13, -7.5, -2, 3.5, 9]) if (Math.abs(x - tx) < 1.6) onTrack = true;
    if (this.pos.y > 0.9) return 'concrete';
    if (onTrack) return 'gravel';
    return this.G.puddleAt && this.G.puddleAt(this.pos) ? 'water' : 'asphalt';
  }
  applyCam(dt) {
    const cam = this.G.camera;
    const eye = lerp(this.eye, 1.05, this.crouch);
    this.camY = damp(this.camY, eye, 18, dt);
    this.landed = damp(this.landed, 0, 6, dt);
    cam.position.set(this.pos.x, this.pos.y + this.camY - this.landed * 0.2, this.pos.z);
    const w = this.G.weapon; const R = this.rec; const sh = this.shake * this.shake, T = this.shakeT;
    const sp = sh * 0.03 * (Math.sin(T * 43.1) + 0.6 * Math.sin(T * 71.7 + 1.3)), sy = sh * 0.03 * (Math.sin(T * 37.3) + 0.6 * Math.sin(T * 83.9 + 0.7)), sr = sh * 0.045 * (Math.sin(T * 29.7) + 0.6 * Math.sin(T * 61.3 + 2.1));
    cam.rotation.set(clamp(this.pitch + R.b, -1.5, 1.5) + sp, this.yaw + R.m + sy, sr, 'YXZ');
    const target = w && w.ads > 0.5 ? 52 : this.sprinting ? 80 : 74;
    this.fov = damp(this.fov, target, 10, dt);
    const f = this.fov;
    if (Math.abs(cam.fov - f) > 0.01) { cam.fov = f; cam.updateProjectionMatrix(); }
  }
}
