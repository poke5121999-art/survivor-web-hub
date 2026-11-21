import * as THREE from '../vendor/three.module.min.js';
import { CFG } from './config.js';

const P = CFG.player;
// Jump rules (new design, the 2D game has no jump; trail.tsv): a jump costs stamina and needs it; carrying makes it lower
// by the same factor as the carry slow-down (height x speedMul); landing makes noise by the drop (sneaking halves it),
// dips the camera and thumps by floor kind; a drop of a floor (3 m: off a stair landing) hurts, 8 hp + 15 per metre over 2.5.
export const JUMP = { cost: 8, fallSafe: 2.5, fallBase: 8, fallPerM: 15, minDrop: 0.3 };
// Feel (batch 6f, owner: "đi đứng, nhảy rất khó thao tác"; R.E.P.O.-like): up to speed in about 0.1 s, stop in about 0.08 s
// (no slide), a jump still counts 0.1 s after walking off a ledge (coyote) and a press 0.12 s before landing is kept (buffer),
// 60 % control in the air (the air push is 60 % of the ground's), the camera eases over steps the
// capsule pops up or down (autostep 0.36 m: anything lower is stepped over, decor parts under 0.35 m included).
export const MOVE = { accelT: 0.1, decelT: 0.08, coyote: 0.1, buffer: 0.12, air: 0.6, step: 0.36, stepEase: 12 };

export class Player {
  constructor(phys, spawn) {
    const { R, world } = phys;
    this.phys = phys;
    this.body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, P.halfHeight + P.radius + 0.02, spawn.z));
    this.col = world.createCollider(R.ColliderDesc.capsule(P.halfHeight, P.radius), this.body);
    this.kcc = world.createCharacterController(0.02);
    this.kcc.enableAutostep(MOVE.step, 0.2, false);
    this.kcc.enableSnapToGround(0.3);
    this.kcc.setMaxSlopeClimbAngle(50 * Math.PI / 180);
    this.kcc.setApplyImpulsesToDynamicBodies(true);
    this.kcc.setCharacterMass(60);
    this.yaw = spawn.yaw || 0;
    this.pitch = 0;
    this.vy = 0;
    this.grounded = false;
    this.stamina = P.stamina;
    this.staminaWait = 0;
    this.hp = P.hp;
    this.eye = P.eye;
    this.speedMul = 1;
    this.str = P.str;
    this.ignore = null;
    this.bob = 0;
    this.camPos = new THREE.Vector3();
    this.down = false;
    this.head = null;
    this.hurtT = 0;
    this.downAt = -1;
    this.horizSpeed = 0; this.sprinting = false;   // read by the camera bob before the first step (was undefined -> NaN camera)
    this.crewId = 'bao';
    this.runMul = 1;   // sprint potion
    this.invisT = 0; this.noDownT = 0; this.gongT = 0;
    this.landDip = 0; this.airT = 0; this.peak = null;
    this.hv = { x: 0, z: 0 }; this.offGround = 99; this.jumpBuf = 0; this.stepOff = 0;
  }

  /** Take damage. At 0 hp the player goes down: the capsule stops, the camera rides a grabbable head (mass 9). */
  hurt(dmg, from) {
    if (this.down || !(dmg > 0)) return 0;
    if (this.dmgHook) { dmg = this.dmgHook(dmg); if (!(dmg > 0)) return 0; }   // passives: Barb's shield, Seraph's light, Blink's after-step
    if (this.noDownT > 0) dmg = Math.min(dmg, Math.max(0, this.hp - 1));   // Seraph's angel: cannot go down
    this.hp = Math.max(0, this.hp - dmg);
    this.hurtT = 0.35;
    this.lastHit = { dmg, from };
    if (this.hp <= 0) this.goDown(from);
    return dmg;
  }

  goDown(from) {
    if (this.down) return;
    this.down = true;
    this.hp = 0;
    const { R, world } = this.phys;
    const t = this.body.translation();
    const r = 0.17;
    const mat = new THREE.MeshStandardMaterial({ color: 0x9aa4ae, roughness: 0.4, metalness: 0.6, emissive: 0x1a2a3a, emissiveIntensity: 1 });
    const mesh = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), mat);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(r * 1.3, r * 0.35, r * 0.4), new THREE.MeshBasicMaterial({ color: 0x9fe8ff }));
    visor.position.set(0, r * 0.15, r * 0.8);
    mesh.add(shell, visor);
    shell.castShadow = true;
    const eyeY = t.y - P.halfHeight - P.radius + this.eye;
    const rec = this.phys.dynamicBody(R.ColliderDesc.ball(r), { x: t.x, y: eyeY, z: t.z }, 9 * CFG.loot.kgPerMass, mesh, 'head');
    rec.grabbable = true; rec.mass = 9; rec.kg = 9 * CFG.loot.kgPerMass; rec.isHead = true; rec.owner = this;
    const fx = from ? t.x - from.x : 0, fz = from ? t.z - from.z : 0, fl = Math.hypot(fx, fz) || 1;
    rec.body.setLinvel({ x: fx / fl * 1.5, y: 2.6, z: fz / fl * 1.5 }, true);
    this.head = rec;
    this.scene?.add(mesh);
    this.col.setEnabled?.(false);
    this.body.setNextKinematicTranslation({ x: t.x, y: -5, z: t.z });
  }

  land(drop, crouch, at) {
    this.lastLand = { drop: +drop.toFixed(2), crouch };
    if (drop < JUMP.minDrop) return;
    this.landDip = Math.min(0.24, 0.05 + 0.05 * drop);
    let dmg = 0;
    if (drop > JUMP.fallSafe) { dmg = Math.round(JUMP.fallBase + (drop - JUMP.fallSafe) * JUMP.fallPerM); this.hurt(dmg, null); }
    this.lastLand.dmg = dmg;
    this.landHook?.(drop, crouch, at);
  }
  /** A shove that slides the body along (m/s, decays in about 0.4 s). */
  shove(vx, vz) { this.push = { x: vx, z: vz }; }
  get position() { return this.body.translation(); }

  forward(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  step(dt, cmd) {
    if (this.hurtT > 0) this.hurtT = Math.max(0, this.hurtT - dt);
    if (this.down) {
      this.yaw -= cmd.dyaw;
      this.pitch = THREE.MathUtils.clamp(this.pitch - cmd.dpitch, -1.45, 1.45);
      this.horizSpeed = 0; this.sprinting = false; this.grounded = false;
      return;
    }
    this.yaw -= cmd.dyaw;
    this.pitch = THREE.MathUtils.clamp(this.pitch - cmd.dpitch, -1.45, 1.45);

    const mx = cmd.mx, mz = cmd.mz;
    const len = Math.hypot(mx, mz);
    const moving = len > 0.01;
    let speed = cmd.crouch ? P.sneak : P.walk;
    const sprinting = cmd.sprint && moving && !cmd.crouch && this.stamina > 1;
    if (sprinting) {
      speed = P.run * this.runMul;
      this.stamina = Math.max(0, this.stamina - P.runDrain * dt);
      this.staminaWait = P.staminaDelay;
    } else if ((this.staminaWait -= dt) <= 0) {
      this.stamina = Math.min(P.stamina, this.stamina + P.staminaRegen * dt);
    }
    speed *= this.gongT > 0 ? (sprinting ? 1.3 : 1) : this.speedMul;   // Atlas's gong: no weight penalty, +30 % run
    if (this.heavyT > 0) { this.heavyT = Math.max(0, this.heavyT - dt); speed *= 0.5; }   // the angel's swipe: heavy legs (foe-moves-c.js)
    if (this.torchOffT > 0) this.torchOffT = Math.max(0, this.torchOffT - dt);
    if (this.slowT > 0) { this.slowT = Math.max(0, this.slowT - dt); speed *= 0.6; }   // the nurse's syringe (bosses.js)
    // floor traps (traps.js): ice freezes then slows, mud slows while you wade in it
    if (this.freezeT > 0) { this.freezeT = Math.max(0, this.freezeT - dt); speed = 0; }
    if (this.iceSlowT > 0) { this.iceSlowT = Math.max(0, this.iceSlowT - dt); speed *= 0.6; }
    if (this.inMud) speed *= 0.5;
    if (this.inkT > 0) this.inkT = Math.max(0, this.inkT - dt);

    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const nx = moving ? mx / Math.max(1, len) : 0, nz = moving ? mz / Math.max(1, len) : 0;
    const pu = this.push; let tx = (nx * c - nz * s) * speed, tz = (-nx * s - nz * c) * speed;
    if (this.heldBy) {   // held (wall hand, gacha): no walking; left/right alternately counts toward breaking free
      tx = 0; tz = 0; this.hv.x = this.hv.z = 0; const sd = Math.abs(cmd.mx) > 0.5 ? Math.sign(cmd.mx) : 0;
      if (sd && sd !== this.mashSide) { this.mashSide = sd; this.mash = (this.mash || 0) + 1; }
    }
    // the body's own velocity chases the wanted one: on the ground at speed/accelT (or speed/decelT to stop), in the air at
    // 60 % of that rate in the air (no braking there: momentum carries a jump)
    { const hv = this.hv, dx = tx - hv.x, dz = tz - hv.z, dl = Math.hypot(dx, dz), want = Math.hypot(tx, tz), have = Math.hypot(hv.x, hv.z);
      const air = !this.grounded && this.offGround > MOVE.coyote;
      const ground = want > 0.01 ? Math.max(want, P.walk * 0.5) / MOVE.accelT : Math.max(have, P.walk) / MOVE.decelT, rate = air ? (want > 0.01 ? MOVE.air * ground : 0) : ground;   // air: 60 % of the ground's push, no braking
      const k = dl > rate * dt ? rate * dt / dl : 1; hv.x += dx * k; hv.z += dz * k; }
    let wx = this.hv.x, wz = this.hv.z;
    if (pu) { wx += pu.x; wz += pu.z; const k = Math.exp(-dt * 5); pu.x *= k; pu.z *= k; if (Math.abs(pu.x) + Math.abs(pu.z) < 0.05) this.push = null; }   // a shove (rook charge)

    // jump: the press is kept MOVE.buffer s; it fires on the ground or within MOVE.coyote s of leaving it (not mid-jump)
    if (cmd.jump) this.jumpBuf = MOVE.buffer; else this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    if (this.jumpBuf > 0 && (this.grounded || (this.offGround <= MOVE.coyote && this.vy <= 0.01))) {
      this.jumpBuf = 0;
      if (this.stamina >= JUMP.cost) {
        this.vy = P.jump * Math.sqrt(Math.min(1, this.speedMul));   // carrying: height x speedMul
        this.stamina -= JUMP.cost; this.staminaWait = P.staminaDelay; this.jumps = (this.jumps || 0) + 1; this.offGround = 99;
      } else this.jumpDenied = (this.jumpDenied || 0) + 1;
    }
    this.vy -= CFG.gravity * dt;

    const ignore = this.ignore, iset = this.ignoreSet;   // the held item (and every collider of a held cart): no riding it
    this.kcc.computeColliderMovement(this.col, { x: wx * dt, y: this.vy * dt, z: wz * dt }, undefined, undefined, ignore ? (col) => col !== ignore && !(iset && iset.has(col.handle)) : undefined);
    const m = this.kcc.computedMovement();
    const wasAir = !this.grounded;
    this.grounded = this.kcc.computedGrounded();
    // stay on the ground over a crest (a landing's edge onto a ramp at a run): the controller's own snap misses it on some
    // frames, which threw the runner off the stair as a 1.8 m fall (tools/jump.js ramps); a floor within 0.4 m under the
    // feet (the house's floor height map: ramps and floors, not furniture or doors) after a grounded frame, not jumping,
    // pulls the body down onto it
    if (!wasAir && !this.grounded && this.vy <= 0 && this.offGround < MOVE.coyote && this.groundAt) {
      const t0 = this.body.translation(), x = t0.x + m.x, z = t0.z + m.z, feet = t0.y + m.y - P.halfHeight - P.radius, drop = feet - this.groundAt(x, z);
      if (drop > 0.02 && drop < 0.4) { m.y -= drop - 0.01; this.grounded = true; this.vy = 0; this.crestSnaps = (this.crestSnaps || 0) + 1; }
    }
    this.offGround = this.grounded ? 0 : this.offGround + dt;
    // on the ground the camera rides a smoothed copy of the feet height (steps, kerbs, the snap down off one); in the air it
    // follows the body exactly (jumps and falls are not softened)
    if (this.grounded && !wasAir) { this.stepOff = THREE.MathUtils.clamp(this.stepOff - m.y, -0.45, 0.45); this.stepOff *= Math.exp(-dt * MOVE.stepEase); }
    else this.stepOff = 0;

    if (this.grounded && this.vy < 0) this.vy = 0;
    const t = this.body.translation();
    // falls: the highest feet height in the air, the drop on landing (a teleport, i.e. a jump the KCC did not make, resets it)
    const feet = t.y + m.y - P.halfHeight - P.radius;
    if (this.lastFeet != null && Math.abs(t.y - P.halfHeight - P.radius - this.lastFeet) > 0.5) { this.peak = null; this.airT = 0; }
    this.lastFeet = feet;
    if (!this.grounded) { this.airT = (this.airT || 0) + dt; this.peak = Math.max(this.peak ?? feet, feet); }
    else if (wasAir && this.airT > 0.08) { const drop = (this.peak ?? feet) - feet; this.airT = 0; this.peak = null; this.land(drop, !!cmd.crouch, { x: t.x, y: feet, z: t.z }); }
    else { this.airT = 0; this.peak = null; }
    this.landDip *= Math.exp(-dt * 7);
    this.body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });

    const targetEye = cmd.crouch ? P.crouchEye : P.eye;
    this.eye += (targetEye - this.eye) * Math.min(1, dt * 10);
    const horiz = Math.hypot(m.x, m.z) / dt;
    if (this.grounded && horiz > 0.3) this.bob += dt * horiz * 2.1;
    this.sprinting = sprinting;
    this.horizSpeed = horiz;
  }

  updateCamera(cam) {
    if (this.down && this.head && !this.head.dead) {
      const h = this.head.body.translation();
      this.camPos.set(h.x, h.y + 0.06, h.z);
      cam.position.copy(this.camPos);
      cam.rotation.set(this.pitch, this.yaw, 0.18, 'YXZ');
      return;
    }
    const t = this.body.translation();
    const bobY = Math.sin(this.bob * 2) * 0.035 * Math.min(1, this.horizSpeed / 3);
    this.camPos.set(t.x, t.y - P.halfHeight - P.radius + this.eye + bobY - (this.landDip || 0) + (this.stepOff || 0), t.z);
    cam.position.copy(this.camPos);
    cam.rotation.set(this.pitch, this.yaw, Math.sin(this.bob) * 0.006 * Math.min(1, this.horizSpeed / 3), 'YXZ');
  }
}
