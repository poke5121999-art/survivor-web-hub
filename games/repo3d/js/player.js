import * as THREE from '../vendor/three.module.min.js';
import { CFG } from './config.js';

const P = CFG.player;

export class Player {
  constructor(phys, spawn) {
    const { R, world } = phys;
    this.phys = phys;
    this.body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, P.halfHeight + P.radius + 0.02, spawn.z));
    this.col = world.createCollider(R.ColliderDesc.capsule(P.halfHeight, P.radius), this.body);
    this.kcc = world.createCharacterController(0.02);
    this.kcc.enableAutostep(0.32, 0.25, false);
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
  }

  /** Take damage. At 0 hp the player goes down: the capsule stops, the camera rides a grabbable head (mass 9). */
  hurt(dmg, from) {
    if (this.down || !(dmg > 0)) return 0;
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
      speed = P.run;
      this.stamina = Math.max(0, this.stamina - P.runDrain * dt);
      this.staminaWait = P.staminaDelay;
    } else if ((this.staminaWait -= dt) <= 0) {
      this.stamina = Math.min(P.stamina, this.stamina + P.staminaRegen * dt);
    }
    speed *= this.speedMul;

    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const nx = moving ? mx / Math.max(1, len) : 0, nz = moving ? mz / Math.max(1, len) : 0;
    const wx = (nx * c - nz * s) * speed, wz = (-nx * s - nz * c) * speed;

    if (this.grounded && cmd.jump) this.vy = P.jump;
    this.vy -= CFG.gravity * dt;

    const ignore = this.ignore;
    this.kcc.computeColliderMovement(this.col, { x: wx * dt, y: this.vy * dt, z: wz * dt }, undefined, undefined, ignore ? (col) => col !== ignore : undefined);
    const m = this.kcc.computedMovement();
    this.grounded = this.kcc.computedGrounded();
    if (this.grounded && this.vy < 0) this.vy = 0;
    const t = this.body.translation();
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
    this.camPos.set(t.x, t.y - P.halfHeight - P.radius + this.eye + bobY, t.z);
    cam.position.copy(this.camPos);
    cam.rotation.set(this.pitch, this.yaw, Math.sin(this.bob) * 0.006 * Math.min(1, this.horizSpeed / 3), 'YXZ');
  }
}
