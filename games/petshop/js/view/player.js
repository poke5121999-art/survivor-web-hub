// First-person player (StarterAssets.FirstPersonController on "Player": MoveSpeed 3, camera at Root y 1.6,
// pitch clamp +-50 deg; PlayerInteraction rayDistance 6). Desktop: WASD/arrows + mouse look (pointer lock after a
// click), E or left click interacts. Touch: the original Floating Joystick on the left, TouchField drag on the right.
// Collision: footprint grid of every collider at body height (art/store/colliders.json) plus placed furniture.
import * as THREE from 'three';

const CELL = 0.1, RADIUS = 0.3;

export class CollisionGrid {
  constructor(col, bounds = [-40, -60, 40, 60]) {
    this.x0 = bounds[0]; this.z0 = bounds[1];
    this.w = Math.ceil((bounds[2] - bounds[0]) / CELL); this.h = Math.ceil((bounds[3] - bounds[1]) / CELL);
    this.col = col;
    this.base = new Uint8Array(this.w * this.h);
    for (const s of col.segs) this.seg(this.base, s[0], s[1], s[2], s[3]);
    this.cells = this.base;
    this.key = null;
  }
  idx(x, z) { const gx = Math.floor((x - this.x0) / CELL), gz = Math.floor((z - this.z0) / CELL); return gx < 0 || gz < 0 || gx >= this.w || gz >= this.h ? -1 : gz * this.w + gx; }
  seg(a, x1, z1, x2, z2) {
    const n = Math.max(2, Math.ceil(Math.hypot(x2 - x1, z2 - z1) / (CELL / 2)));
    const r = Math.ceil(RADIUS / CELL);
    for (let k = 0; k <= n; k++) {
      const x = x1 + (x2 - x1) * k / n, z = z1 + (z2 - z1) * k / n;
      const gx = Math.floor((x - this.x0) / CELL), gz = Math.floor((z - this.z0) / CELL);
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > r * r) continue;
        const X = gx + dx, Z = gz + dz;
        if (X >= 0 && Z >= 0 && X < this.w && Z < this.h) a[Z * this.w + X] = 1;
      }
    }
  }
  box(a, cx, cz, sx, sz, yaw) {
    const c = Math.cos(yaw), s = Math.sin(yaw), hx = sx / 2 + RADIUS, hz = sz / 2 + RADIUS;
    const ex = Math.abs(c * hx) + Math.abs(s * hz), ez = Math.abs(s * hx) + Math.abs(c * hz);
    for (let z = cz - ez; z <= cz + ez; z += CELL) for (let x = cx - ex; x <= cx + ex; x += CELL) {
      const dx = x - cx, dz = z - cz;
      const lx = c * dx - s * dz, lz = s * dx + c * dz;
      if (Math.abs(lx) <= hx && Math.abs(lz) <= hz) { const i = this.idx(x, z); if (i >= 0) a[i] = 1; }
    }
  }
  // boxes: scene BoxColliders whose GameObject is active (isOn) + extra [{c:[x,z], size:[sx,sz], yaw}]
  update(isOn, extra) {
    const act = this.col.boxes.filter(b => isOn(b.node));
    const key = act.map(b => b.node).join(',') + '|' + extra.map(e => e.c.join(',') + e.yaw).join(';');
    if (key === this.key) return;
    this.key = key;
    this.cells = this.base.slice();
    for (const b of act.concat(extra)) this.box(this.cells, b.c[0], b.c[1], b.size[0], b.size[1], b.yaw);
  }
  free(x, z) { const i = this.idx(x, z); return i >= 0 && !this.cells[i]; }
  move(ox, oz, nx, nz) {
    if (!this.free(ox, oz)) return [nx, nz];
    if (this.free(nx, nz)) return [nx, nz];
    if (this.free(nx, oz)) return [nx, oz];
    if (this.free(ox, nz)) return [ox, nz];
    return [ox, oz];
  }
}

export class Player {
  constructor(camera, dom, opts) {
    this.cam = camera;
    this.dom = dom;
    this.x = opts.x; this.z = opts.z; this.yaw = opts.yaw; this.pitch = 0;
    this.speed = opts.speed ?? 3;
    this.height = opts.height ?? 1.6;
    this.sens = opts.sens ?? 0.5;
    this.keys = new Set();
    this.joy = { x: 0, y: 0 };
    this.locked = false;
    this.enabled = true;
    this.lookDrag = null;
    addEventListener('keydown', e => { this.keys.add(e.code); });
    addEventListener('keyup', e => { this.keys.delete(e.code); });
    addEventListener('blur', () => this.keys.clear());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === dom; });
    document.addEventListener('mousemove', e => {
      if (!this.locked || !this.enabled) return;
      this.look(e.movementX, e.movementY);
    });
  }

  look(dx, dy) {
    const k = 0.0025 * (this.sens / 0.5) * (this.sensMul ?? 1);
    this.yaw -= dx * k;
    this.pitch = Math.max(-50 * Math.PI / 180, Math.min(50 * Math.PI / 180, this.pitch - dy * k));
  }

  update(dt, grid) {
    let fx = 0, fz = 0;
    if (this.enabled) {
      const K = this.keys;
      if (K.has('KeyW') || K.has('ArrowUp')) fz += 1;
      if (K.has('KeyS') || K.has('ArrowDown')) fz -= 1;
      if (K.has('KeyA') || K.has('ArrowLeft')) fx -= 1;
      if (K.has('KeyD') || K.has('ArrowRight')) fx += 1;
      fx += this.joy.x; fz += this.joy.y;
    }
    const len = Math.hypot(fx, fz);
    if (len > 1) { fx /= len; fz /= len; }
    if (len > 0.01) {
      // forward is -z of the camera (three.js); yaw rotates about +y
      const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
      const dx = (-s * fz + c * fx) * this.speed * dt, dz = (-c * fz - s * fx) * this.speed * dt;
      [this.x, this.z] = grid ? grid.move(this.x, this.z, this.x + dx, this.z + dz) : [this.x + dx, this.z + dz];
    }
    this.cam.position.set(this.x, this.height, this.z);
    this.cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
