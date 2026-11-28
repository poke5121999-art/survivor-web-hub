// First-person movement, ported from Game.Player.PlayerController serialized tuning (level0 "Player").
// Pure math (node-testable). The view feeds input and reads position/yaw/pitch.
export const PC = {
  moveSpeed: 5.5, sprintMultiplier: 1.6, jumpHeight: 1.25,
  groundAcceleration: 45, groundDeceleration: 55, airAcceleration: 16, airDeceleration: 2.5,
  gravity: 24, fallGravityMultiplier: 1.65, jumpCutMultiplier: 0.5, maxFallSpeed: 45,
  coyoteTime: 0.12, jumpBufferTime: 0.12, groundSnapDistance: 0.6,
  standHeight: 1.8, crouchHeight: 1.05, crouchSpeedMultiplier: 0.5, crouchSharpness: 14, eyeFromTop: 0.16,
  radius: 0.35, stepOffset: 0.45, slopeLimit: 50,
  mouseDegreesPerUnit: 0.08, pitchLimit: 87, fov: 80, sprintFovKick: 8,
  stepLength: 0.9, bobVertical: 0.045, bobHorizontal: 0.025,
  respawnBelowY: -60,
  // jetpack / flight (Drop 2)
  flySpeedMultiplier: 2, flyVerticalSpeed: 6, jetThrustAcceleration: 26, jetAirAcceleration: 16,
};

const COS_SLOPE = Math.cos(PC.slopeLimit * Math.PI / 180);

export class Player {
  constructor(world, pile, spawn) {
    this.world = world;        // BoxWorld
    this.pile = pile;          // object with heightAt(x,z) -> y or -Infinity
    this.pos = [spawn[0], spawn[1], spawn[2]];  // feet
    this.vel = [0, 0, 0];
    this.yaw = spawn[3] || 0;  // radians, 0 = looking toward -z
    this.pitch = 0;
    this.height = PC.standHeight;
    this.grounded = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.jumpHeld = false;
    this.crouch = false;
    this.sprint = false;
    this.speedMul = 1;      // MoveSpeed stat / base
    this.jumpMul = 1;
    this.stepPhase = 0;
    this.walked = 0;
    this.landed = 0;        // impact speed of last landing (for view dip)
    this.spawn = spawn;
    // jetpack (rules/drop2.md §B; JetpackFuel): fuel in seconds of thrust
    this.fuel = 2; this.fuelMax = 2; this.jetGround = 0; this.engaged = false; this.thrusting = false;
    this._o = { ny: -1, hit: false };
  }

  look(dxPixels, dyPixels, sens = 1) {
    const k = PC.mouseDegreesPerUnit * sens * Math.PI / 180;
    this.yaw -= dxPixels * k;
    this.pitch -= dyPixels * k;
    const lim = PC.pitchLimit * Math.PI / 180;
    if (this.pitch > lim) this.pitch = lim; else if (this.pitch < -lim) this.pitch = -lim;
  }

  eye() { return [this.pos[0], this.pos[1] + this.height - PC.eyeFromTop + (this.eyeDrop || 0), this.pos[2]]; }   // eyeDrop: knocked down (co-op fun)
  // CoopFun knockback: velocity set at once, ungrounded, jetpack off; ext = this frame's extra velocity (AddExternalVelocity)
  knockback(v) { this.vel = v.slice(); this.grounded = false; this.engaged = false; this.thrusting = false; this.coyote = 0; }

  forward() {
    const cp = Math.cos(this.pitch);
    return [-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp];
  }

  // input: {mx, mz in -1..1 (strafe, forward), jump (bool held), sprint, crouch}
  step(dt, input, stats = {}) {
    const moveSpeed = (stats.moveSpeed ?? PC.moveSpeed);
    const sprintMul = (stats.sprintMultiplier ?? PC.sprintMultiplier);
    const jumpH = (stats.jumpHeight ?? PC.jumpHeight);
    this.crouch = !!input.crouch;
    this.sprint = !!input.sprint && !this.crouch;
    const targetH = this.crouch ? PC.crouchHeight : PC.standHeight;
    this.height += (targetH - this.height) * (1 - Math.exp(-PC.crouchSharpness * dt));

    // desired horizontal velocity in world space
    let ix = input.mx || 0, iz = input.mz || 0;
    const il = Math.hypot(ix, iz);
    if (il > 1) { ix /= il; iz /= il; }
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    // forward = (-sin yaw, -cos yaw); right = (cos yaw, -sin yaw)
    const jet = stats.jet || null;
    let speed = moveSpeed * (this.sprint ? sprintMul : 1) * (this.crouch ? PC.crouchSpeedMultiplier : 1) * (this.thrusting && jet ? jet.speedMul : 1);
    const wx = (ix * cy - iz * sy) * speed;
    const wz = (-ix * sy - iz * cy) * speed;
    const air = jet ? jet.airControl : 1;
    const accel = this.grounded ? (il > 0.01 ? PC.groundAcceleration : PC.groundDeceleration)
      : this.thrusting && jet ? jet.agility * 16 : (il > 0.01 ? PC.airAcceleration : PC.airDeceleration) * air;
    const dvx = wx - this.vel[0], dvz = wz - this.vel[2];
    const dl = Math.hypot(dvx, dvz), maxd = accel * dt;
    if (dl > maxd) { this.vel[0] += dvx / dl * maxd; this.vel[2] += dvz / dl * maxd; }
    else { this.vel[0] = wx; this.vel[2] = wz; }

    // jump (buffer + coyote), variable height
    const forgive = jet ? jet.forgiveness : 0;
    const pressed = input.jump && !this.jumpHeld;
    if (pressed) this.jumpBuffer = PC.jumpBufferTime + forgive;
    this.jumpHeld = !!input.jump;
    this.jumpBuffer -= dt;
    this.coyote = this.grounded ? PC.coyoteTime + forgive : this.coyote - dt;
    let jumpedNow = false;
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vel[1] = Math.sqrt(2 * PC.gravity * jumpH);
      this.jumpBuffer = 0; this.coyote = 0; this.grounded = false;
      this.jumped = true; jumpedNow = true;
    }
    // jetpack: hold jump in the air; ignites on a new press or once vy <= 1.5
    let k = 0;
    if (jet) {
      if (jet.fuelMax !== this.fuelMax) { this.fuel = Math.max(0, this.fuel + jet.fuelMax - this.fuelMax); this.fuelMax = jet.fuelMax; }
      if (!jet.owned || !this.jumpHeld || (this.grounded && !jumpedNow)) this.engaged = false;
      else if (!this.engaged && !jumpedNow && this.fuel > 0 && (pressed || this.vel[1] <= 1.5)) this.engaged = true;
      if (this.engaged && this.fuel > 0) { k = Math.min(1, Math.max(0, this.fuel / 0.18)); this.fuel = Math.max(0, this.fuel - dt); this.jetGround = 0; }
      else if (this.grounded && !jumpedNow) { this.jetGround += dt; const over = this.jetGround - 0.35; if (over > 0) this.fuel = Math.min(this.fuelMax, this.fuel + Math.min(over, dt) * Math.max(0, jet.refuel)); }
      else this.jetGround = 0;
      if (this.engaged && k <= 0) this.engaged = false;
    }
    this.thrusting = k > 0;
    // gravity (thrust replaces it; the last 0.18 s of fuel fades back to gravity)
    if (this.thrusting) {
      const target = k * jet.climb, d = target - this.vel[1], m = 26 * dt;
      this.vel[1] += Math.abs(d) <= m ? d : Math.sign(d) * m;
      this.vel[1] -= (1 - k) * PC.gravity * dt;
    } else {
      let g = PC.gravity;
      if (this.vel[1] < 0) g *= PC.fallGravityMultiplier * (stats.fall || 1);   // Propeller Cap: falls 25 % slower (Hats.Fall 0.75, applied to the fall gravity [inferred])
      else if (!this.jumpHeld) g /= PC.jumpCutMultiplier;   // early release cuts the jump
      if (!this.grounded || this.vel[1] > 0) this.vel[1] -= g * dt;
    }
    if (this.vel[1] < -PC.maxFallSpeed) this.vel[1] = -PC.maxFallSpeed;

    // integrate in substeps to avoid tunnelling
    const ex = this.ext ? this.ext[0] : 0, ez = this.ext ? this.ext[1] : 0; this.ext = null;
    const total = Math.hypot((this.vel[0] + ex) * dt, this.vel[1] * dt, (this.vel[2] + ez) * dt);
    const n = Math.max(1, Math.ceil(total / 0.15));
    const h = dt / n;
    const wasGrounded = this.grounded;
    const vyBefore = this.vel[1];
    let grounded = false;
    const r = PC.radius;
    for (let i = 0; i < n; i++) {
      const ox = this.pos[0], oz = this.pos[2];
      this.pos[0] += (this.vel[0] + ex) * h; this.pos[1] += this.vel[1] * h; this.pos[2] += (this.vel[2] + ez) * h;
      // three spheres: feet, middle, head
      const feet = [this.pos[0], this.pos[1] + r, this.pos[2]];
      this.world.sphere(feet, r, this._o);
      let gnd = this._o.hit && this._o.ny > COS_SLOPE;
      this.pos[0] = feet[0]; this.pos[1] = feet[1] - r; this.pos[2] = feet[2];
      const top = this.height - r;
      const midY = Math.max(r, top * 0.5);
      for (const yy of [midY, top]) {
        const s = [this.pos[0], this.pos[1] + yy, this.pos[2]];
        this.world.sphere(s, r, this._o);
        // upper spheres never push upward (ceilings push down, walls sideways)
        this.pos[0] = s[0]; this.pos[2] = s[2];
        if (s[1] < this.pos[1] + yy) { this.pos[1] = s[1] - yy; if (this.vel[1] > 0) this.vel[1] = 0; }
      }
      // money pile heightfield
      if (this.pile) {
        const ph = groundHeight(this.pile, this.pos);
        if (ph > this.pos[1]) {
          if (ph - this.pos[1] <= PC.stepOffset + 0.05 || this.vel[1] <= 0) { this.pos[1] = ph; gnd = true; }
          else { this.pos[0] = ox; this.pos[2] = oz; }  // wall of money taller than a step
        } else if (ph > this.pos[1] - 0.02 && this.vel[1] <= 0) gnd = true;
      }
      if (gnd) { grounded = true; if (this.vel[1] < 0) this.vel[1] = 0; }
    }
    // ground snap (walk down slopes / stairs without hopping)
    if (!grounded && wasGrounded && this.vel[1] <= 0) {
      const gy = this.world.groundAt(this.pos[0], this.pos[2], this.pos[1] - PC.groundSnapDistance, this.pos[1] + 0.01, r * 0.5);
      const py = this.pile ? groundHeight(this.pile, this.pos) : -Infinity;
      const best = Math.max(gy, py);
      if (best > this.pos[1] - PC.groundSnapDistance) { this.pos[1] = best; grounded = true; this.vel[1] = 0; }
    }
    if (grounded && !wasGrounded) this.landed = -vyBefore;
    this.grounded = grounded;
    const hs = Math.hypot(this.vel[0], this.vel[2]);
    if (grounded) { this.stepPhase += hs * dt / PC.stepLength; this.walked += hs * dt; }
    if (this.pos[1] < PC.respawnBelowY) this.respawn();
  }

  respawn() {
    this.pos = [this.spawn[0], this.spawn[1], this.spawn[2]];
    this.vel = [0, 0, 0];
  }
}

// VaultLayout.InReserveRoom (pile.md §6f): under the reserve ceiling, inside the room rect, past the door plane.
// The room sits under the terraces, so the money heightfield above it is not this floor.
// between the door plane (z 46) and the room's floor slab (z 48.5) the walkway is the reserve floor (-36), carved through
// the terrace rock (VaultLayout reserve passage, ReservePassageHalfWidth 2.6; the door frame is 5 m wide) [inferred]
export function groundHeight(pile, p) {
  if (!inReserveRoom(p)) return pile.heightAt(p[0], p[2]);
  return -p[2] < 48.6 && Math.abs(p[0]) <= 3.7 ? -36 : -Infinity;
}
export function inReserveRoom(p) { return p[1] < -28.5 && p[0] >= -10 && p[0] <= 10 && -p[2] >= 46 && -p[2] <= 66; }
