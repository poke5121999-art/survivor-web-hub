// Mechanical Grapple mode: the hook reels the stickman straight to the target instead of swinging.
// Ported from PlayerHookControllerGrappleMode (rules and addresses: docs/FULLGAME.md "Mechanical Grapple").
// PlayerGrapple has the same body as PlayerDefault (radius, mass 2, gravityScale 1.1); only the hook differs.
import { Player, PHYS, ST } from './physics.js';

// GrappleGamePlayConfig
export const GRAPPLE = {
  speed: 15, // _grappleSpeed
  startSpeed: 5, // _grappleStartSpeed
  easing: 0.4, // _grappleEasingTimer: CountTo(start -> speed), LINEAR (accelEasing is never set)
  autoReleaseBoost: 0.75,
  releaseBoost: 1,
  forwardPreference: 0.4, // UpdateClosestTarget(0.4): targets behind the player count as 1 / 0.6 farther
  elasticity: 0.0176, // Vector2.SmoothDamp smoothTime
  forceHorizontal: 1,
  snappiness: 0.75,
  releaseDistance: 0.25, // FixedUpdate [asm 0x120df6c]
  minAlong: -5, // Grab clamps v·hookDir from below [asm 0x120e5ec..0x120e610]
};

// UnityEngine.Vector2.SmoothDamp with maxSpeed = +inf; `vel` is the ref currentVelocity.
function smoothDamp2(cx, cy, tx, ty, vel, smoothTime, dt) {
  const st = Math.max(0.0001, smoothTime), omega = 2 / st, x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const chx = cx - tx, chy = cy - ty;
  const tmx = (vel.x + omega * chx) * dt, tmy = (vel.y + omega * chy) * dt;
  vel.x = (vel.x - omega * tmx) * exp;
  vel.y = (vel.y - omega * tmy) * exp;
  let ox = tx + (chx + tmx) * exp, oy = ty + (chy + tmy) * exp;
  if ((tx - cx) * (ox - tx) + (ty - cy) * (oy - ty) > 0) { ox = tx; oy = ty; vel.x = 0; vel.y = 0; }
  return [ox, oy];
}

export class GrapplePlayer extends Player {
  constructor(spawn) {
    super(spawn);
    this.speedFrom = 0;
    this.grabAt = 0;
    this.sdv = { x: 0, y: 0 };
  }

  updateClosest(world) {
    const factor = Math.min(1, Math.max(0.01, 1 - GRAPPLE.forwardPreference));
    let best = -1, bs = Infinity;
    const ts = world.targets;
    for (let i = 0; i < ts.length; i++) {
      const score = Math.hypot(ts[i].x - this.x, ts[i].y - this.y) / (ts[i].x < this.x ? factor : 1);
      if (score < bs) { bs = score; best = i; }
    }
    this.closest = best;
  }

  // Grab [asm 0x120e270]: no spring joint; the start speed blends the current speed along the rope into startSpeed.
  grab(world) {
    if (this.hooked >= 0 || this.finished) return;
    this.updateClosest(world);
    if (this.closest < 0) { this.setState(ST.HOOK); return; }
    this.hooked = this.closest;
    const t = world.targets[this.hooked];
    const d = Math.hypot(t.x - this.x, t.y - this.y);
    const along = d > 1e-5 ? Math.max(GRAPPLE.minAlong, (this.vx * (t.x - this.x) + this.vy * (t.y - this.y)) / d) : GRAPPLE.minAlong;
    const k = Math.min(1, Math.max(0, GRAPPLE.snappiness));
    this.speedFrom = GRAPPLE.elasticity === 0 ? GRAPPLE.startSpeed : along + (GRAPPLE.startSpeed - along) * k;
    this.grabAt = this.time;
    this.sdv = { x: this.vx, y: this.vy }; // _currentVelocitySmoothDamp = rb.velocity [asm 0x120e818..0x120e824]
    this.hookTime = this.time;
    this.setState(ST.HOOK);
  }

  // UnGrab [asm 0x120e894]: no rope impulse; the auto release keeps 75 % of the speed; never leave almost vertical.
  ungrab(auto = false) {
    if (this.hooked < 0) return;
    this.hooked = -1;
    if (this.finished) return;
    const m = auto ? GRAPPLE.autoReleaseBoost : GRAPPLE.releaseBoost;
    this.vx *= m; this.vy *= m;
    const spin = Math.hypot(this.vx, this.vy) * PHYS.angularMultiplier;
    this.av = this.vx < 0 ? spin : -spin;
    if (Math.abs(this.vx) < GRAPPLE.forceHorizontal) this.vx = this.vx < 0 ? -GRAPPLE.forceHorizontal : GRAPPLE.forceHorizontal;
    this.setState(ST.ROLL);
  }

  // FixedUpdate: release near the target, otherwise HookDisplacement drives the velocity toward it (gravityScale 0).
  beforeFixedStep(dt, world) {
    if (this.hooked < 0) return;
    const t = world.targets[this.hooked];
    const dx = t.x - this.x, dy = t.y - this.y, d = Math.hypot(dx, dy);
    if (d < GRAPPLE.releaseDistance) { this.ungrab(true); return; }
    const k = Math.min(1, (this.time - this.grabAt) / GRAPPLE.easing);
    const speed = this.speedFrom + (GRAPPLE.speed - this.speedFrom) * k;
    const wx = d > 1e-5 ? (dx / d) * speed : 0, wy = d > 1e-5 ? (dy / d) * speed : 0;
    this.av = 0;
    if (GRAPPLE.elasticity === 0) { this.vx = wx; this.vy = wy; return; }
    [this.vx, this.vy] = smoothDamp2(this.vx, this.vy, wx, wy, this.sdv, GRAPPLE.elasticity, dt);
  }

  accel() {
    return this.hooked >= 0 ? [0, 0] : [0, PHYS.gravity];
  }
}
