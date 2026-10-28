// Player physics, ported from the PlayerDefault prefab and the IL2CPP code (rules: README.md "Luật gốc").
// One circle Rigidbody2D (mass 2, gravityScale 1.1, NoFriction) hangs on a SpringJoint2D (3 Hz, damping 0.5).

const DEG = Math.PI / 180;

export const PHYS = {
  fixedDt: 0.02, // Unity default fixed timestep
  substeps: 5,
  gravity: -9.81 * 1.1, // Physics2DSettings.gravity * Rigidbody2D.gravityScale
  mass: 2,
  radius: 0.375 * 0.3, // CircleCollider2D.radius * PlayerDefault scale 0.3
  anchor: [-0.03 * 0.3, 0.58 * 0.3], // SpringJoint2D.anchor in world units
  anchorLen: Math.hypot(-0.03, 0.58), // Grab subtracts the UNSCALED anchor length from the rest distance
  springHz: 3,
  springDamping: 0.5,
  angularDamping: 0.05,
  bumperBounce: 1.4, // BumperMaterial.bounciness, combined with Maximum
  bounceThreshold: 1, // Physics2DSettings velocity threshold
  ropeImpulse: 0.3, // PlayerHookController.ropeImpulseForce, upward, ForceMode2D.Impulse
  ropeImpulseCooldown: 0.5,
  angularMultiplier: 200, // deg/s per m/s of tangential speed
  hookedStoppedSpeed: 0.5,
  hookAnimDuration: 0.15,
  growth: 1.0, // PlayerController.growthDuration (OutElastic)
  timeToSpawn: 0.75,
};

// PlayerState enum from dump.cs, written to the Animator int "State".
export const ST = { ROLL: 0, FALL: 1, HOOK: 2, HOOK_FAST: 3, HOOK_SLOW: 4, HOOK_STOPPED: 5, FINISHED: 6 };
const FRAMES = {
  [ST.ROLL]: ['CHAR_Classic0036'],
  [ST.FALL]: ['CHAR_Classic0020', 'CHAR_Classic0028'],
  [ST.HOOK]: ['CHAR_Classic0001'],
  [ST.HOOK_FAST]: ['CHAR_Classic0001'],
  [ST.HOOK_SLOW]: ['CHAR_Classic0005'],
  [ST.HOOK_STOPPED]: ['CHAR_Classic0015'],
  [ST.FINISHED]: ['CHAR_Classic0022'],
};

function closestOnSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const L = dx * dx + dy * dy;
  let t = L > 0 ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return [ax + dx * t, ay + dy * t];
}

export class Player {
  constructor(spawn) {
    this.x = spawn.x; this.y = spawn.y;
    this.vx = 0; this.vy = 0;
    this.angle = 0; // radians, CCW; 0 = upright
    this.av = 0; // deg/s like Rigidbody2D.angularVelocity
    this.hooked = -1;
    this.closest = -1;
    this.rest = 0;
    this.time = 0;
    this.lastImpulse = 0;
    this.state = ST.FALL;
    this.stateTime = 0;
    this.hookTime = 0;
    this.flipX = false;
    this.finished = false;
    this.age = 0; // seconds since spawn, drives the OutElastic growth
  }

  anchor() {
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    const [ax, ay] = PHYS.anchor;
    return { x: this.x + c * ax - s * ay, y: this.y + s * ax + c * ay };
  }

  scale() {
    const t = Math.min(1, this.age / PHYS.growth);
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const p = 0.3; // DOTween OutElastic with default period
    return Math.pow(2, -10 * t) * Math.sin(((t - p / 4) * (2 * Math.PI)) / p) + 1;
  }

  setState(s, force = false) {
    if (this.state === s) return;
    if ((s === ST.HOOK_FAST || s === ST.HOOK_SLOW) && this.state === ST.HOOK) {
      if (this.time - this.hookTime < PHYS.hookAnimDuration) return;
      this.hookTime = this.time;
    } else if (s === ST.FALL && this.state === ST.ROLL && !force) return;
    this.state = s;
    this.stateTime = this.time;
  }

  // UpdateClosestTarget(0): nearest active target by distance; ties keep the earlier one. No range limit in normal mode.
  updateClosest(world) {
    let best = -1, bd = Infinity;
    const ts = world.targets;
    for (let i = 0; i < ts.length; i++) {
      const d = (ts[i].x - this.x) ** 2 + (ts[i].y - this.y) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    this.closest = best;
  }

  grab(world) {
    if (this.hooked >= 0 || this.finished) return;
    this.updateClosest(world);
    if (this.closest < 0) { this.setState(ST.HOOK); return; }
    this.hooked = this.closest;
    const t = world.targets[this.hooked];
    this.rest = Math.max(0, Math.hypot(this.x - t.x, this.y - t.y) - PHYS.anchorLen);
    this.hookTime = this.time;
    this.setState(ST.HOOK);
  }

  ungrab() {
    if (this.hooked < 0) return;
    this.hooked = -1;
    if (this.finished) return; // kinematic: Unity ignores the impulse and Finish zeroes the spin
    if (this.time - this.lastImpulse > PHYS.ropeImpulseCooldown) {
      this.lastImpulse = this.time;
      this.vy += PHYS.ropeImpulse / PHYS.mass;
    }
    const spin = Math.hypot(this.vx, this.vy) * PHYS.angularMultiplier;
    this.av = this.vx < 0 ? spin : -spin;
    this.setState(ST.ROLL);
  }

  finish() {
    if (this.finished) return;
    this.ungrab();
    this.finished = true;
    this.av = 0;
    this.angle = Math.atan2(this.vy, this.vx) - Math.PI / 2;
    this.setState(ST.FINISHED, true);
  }

  // One fixed step. `hold` is the pointer state; press grabs, release lets go (PlayerInputController).
  step(dt, world, hold) {
    const ev = { bumper: -1, finished: false };
    this.time += dt;
    this.age += dt;
    if (this.finished) {
      this.x += this.vx * dt; this.y += this.vy * dt;
      return ev;
    }
    if (hold && this.hooked < 0 && !this.wasHold) this.grab(world);
    if (!hold && this.hooked >= 0) this.ungrab();
    this.wasHold = hold;
    this.updateClosest(world);

    this.beforeFixedStep(dt, world);
    const h = dt / PHYS.substeps;
    let contact = null;
    for (let i = 0; i < PHYS.substeps; i++) {
      if (this.hooked >= 0) {
        const t = world.targets[this.hooked];
        this.angle = Math.atan2(t.y - this.y, t.x - this.x) - Math.PI / 2; // transform.up = toward target
      }
      const [ax, ay] = this.accel(world);
      this.vx += ax * h;
      this.vy += ay * h;
      this.x += this.vx * h;
      this.y += this.vy * h;
      const hit = this.collide(world);
      if (hit) {
        contact = hit;
        if (hit.bumper >= 0 && hit.enter) ev.bumper = hit.bumper;
      }
    }
    // BumperAnimationController.OnCollisionEnter2D with forceBounce: velocity = 0, then AddForce(forceImpulse, Impulse)
    // in world space [asm 0x11ffdf8..0x11ffe24]. No Normal bumper sets it; Challenge and event ones do.
    const force = ev.bumper >= 0 && world.bumpers[ev.bumper].force;
    if (force) { this.vx = force[0] / PHYS.mass; this.vy = force[1] / PHYS.mass; }
    if (contact) {
      this.setState(ST.ROLL);
      // SetRotation: spin = tangential speed * 200 deg/s, clockwise when moving right
      const [nx, ny] = contact.n;
      const tx = this.vx > 0 ? ny : -ny, ty = this.vx > 0 ? -nx : nx;
      const proj = Math.abs(this.vx * tx + this.vy * ty);
      const spin = proj * PHYS.angularMultiplier;
      this.av = this.vx <= 0 ? spin : -spin;
    }
    if (this.hooked < 0) {
      this.av *= 1 / (1 + dt * PHYS.angularDamping);
      this.angle += this.av * DEG * dt;
    }
    this.tickAnimation(world);
    if (this.x >= world.finishX) { this.finish(); ev.finished = true; }
    return ev;
  }

  beforeFixedStep() {}

  // Gravity plus, while hooked, the SpringJoint2D pull on the hand anchor.
  accel(world) {
    let ax = 0, ay = PHYS.gravity;
    if (this.hooked >= 0) {
      const w = 2 * Math.PI * PHYS.springHz;
      const k = PHYS.mass * w * w, c = 2 * PHYS.mass * PHYS.springDamping * w;
      const t = world.targets[this.hooked], a = this.anchor();
      const dx = a.x - t.x, dy = a.y - t.y, d = Math.hypot(dx, dy) || 1e-6;
      const nx = dx / d, ny = dy / d;
      const vn = this.vx * nx + this.vy * ny;
      const f = (-k * (d - this.rest) - c * vn) / PHYS.mass;
      ax += f * nx; ay += f * ny;
    }
    return [ax, ay];
  }

  collide(world) {
    const R = PHYS.radius;
    let out = null;
    const hit = (qx, qy, rad, bounce, bi) => {
      const dx = this.x - qx, dy = this.y - qy;
      const d = Math.hypot(dx, dy), min = R + rad;
      if (d >= min || d === 0) return;
      const nx = dx / d, ny = dy / d;
      this.x = qx + nx * min; this.y = qy + ny * min;
      const vn = this.vx * nx + this.vy * ny;
      let enter = false;
      if (vn < 0) {
        const e = -vn > PHYS.bounceThreshold ? bounce : 0;
        this.vx -= (1 + e) * vn * nx; this.vy -= (1 + e) * vn * ny;
        enter = -vn > 0.05;
      }
      out = { n: [nx, ny], bumper: bi, enter };
    };
    const bs = world.bumpers;
    for (let i = 0; i < bs.length; i++) {
      const [ax, ay, bx, by, r] = bs[i].cap;
      if (this.x < Math.min(ax, bx) - r - 1 || this.x > Math.max(ax, bx) + r + 1) continue;
      const [qx, qy] = closestOnSeg(this.x, this.y, ax, ay, bx, by);
      hit(qx, qy, r, bs[i].bounce ?? PHYS.bumperBounce, i);
    }
    for (const [ax, ay, bx, by, r] of world.caps) {
      if (this.x < Math.min(ax, bx) - r - 1 || this.x > Math.max(ax, bx) + r + 1) continue;
      const [qx, qy] = closestOnSeg(this.x, this.y, ax, ay, bx, by);
      hit(qx, qy, r, 0, -1);
    }
    for (const p of world.polys) {
      for (let i = 0; i < p.length; i += 2) {
        const j = (i + 2) % p.length;
        if (this.x < Math.min(p[i], p[j]) - 1 || this.x > Math.max(p[i], p[j]) + 1) continue;
        const [qx, qy] = closestOnSeg(this.x, this.y, p[i], p[i + 1], p[j], p[j + 1]);
        hit(qx, qy, 0, 0, -1);
      }
    }
    return out;
  }

  // PlayerAnimationController.Tick
  tickAnimation(world) {
    if (this.hooked < 0) { this.flipX = this.vx < 0; return; }
    const t = world.targets[this.hooked];
    const below = this.y <= t.y;
    this.flipX = below !== (this.vx >= 0);
    let s;
    if (below && Math.hypot(this.vx, this.vy) <= PHYS.hookedStoppedSpeed) s = ST.HOOK_STOPPED;
    else s = (this.x > t.x) === this.flipX ? ST.HOOK_FAST : ST.HOOK_SLOW;
    this.setState(s);
  }

  frame() {
    const f = FRAMES[this.state];
    return f.length > 1 ? f[Math.floor((this.time - this.stateTime) * 15) % f.length] : f[0];
  }
}
