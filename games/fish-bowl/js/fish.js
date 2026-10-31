// The player goldfish (Controller scene "Player"): swimming inside the tank (AS.CharacterController fly mode), its
// Animator states (art/anim/controllers.json "Fish"), and the third-person camera CM vcam1 driven by the camera pad.
import * as THREE from 'three';
import { Rig } from './anim.js';
import { U } from './unity.js';

const UP = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const damp = (k, dt) => 1 - Math.exp(-k * dt);
// yaw that turns the fish's nose (local -Z, Unity +Z) toward a horizontal direction
export const yawTo = (dx, dz) => Math.atan2(-dx, -dz);

export class Fish {
  constructor(stage, comps) {
    this.stage = stage;
    this.root = stage.find('Player');
    this.model = stage.find('Player/ToonFishMain');
    this.focus = stage.find('Player/CameraFocusPoint');
    const ph = comps.Player.PlayerHandler;
    this.mouth = stage.find(ph.fishMouth.slice(1));
    const cc = comps.Player['AS.CharacterController'];
    this.speed = cc.m_FlyBoostMoveSpeed;
    this.turnMoving = cc.m_MovingTurnSpeed * Math.PI / 180;
    this.turnStill = cc.m_StationaryTurnSpeed * Math.PI / 180;
    const cap = this.root.userData.node.k.CapsuleCollider;
    this.radius = cap.m_Radius;
    this.center = U(cap.m_Center); // capsule centre in Player space
    this.rig = new Rig(stage.lib, this.model);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.oneShot = null;
    this.bounds = null; // {box: Box3 interior, floor(x, z) -> y, top: y, obstacles: [Box3]}
  }

  reset() {
    this.vel.set(0, 0, 0);
    this.pitch = 0;
    this.oneShot = null;
    this.forceAnim = null;
    this.rig = new Rig(this.stage.lib, this.model);
    this.rig.play('IDLE', 0);
  }

  get position() { return this.root.position; }

  // Body centre in world space (where triggers test the player).
  bodyCenter(out = new THREE.Vector3()) {
    this.root.updateWorldMatrix(true, false);
    return out.copy(this.center).applyMatrix4(this.root.matrixWorld);
  }

  mouthPos(out = new THREE.Vector3()) { return this.mouth.getWorldPosition(out); }

  align(t) {
    t.updateWorldMatrix(true, false);
    t.matrixWorld.decompose(this.root.position, this.root.quaternion, tmp);
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(this.root.quaternion);
    this.yaw = yawTo(f.x, f.z);
    this.pitch = 0;
    this.vel.set(0, 0, 0);
    this.applyRotation();
  }

  face(target) {
    tmp.copy(target).sub(this.root.position);
    this.yaw = yawTo(tmp.x, tmp.z);
    this.applyRotation();
  }

  applyRotation() {
    this.root.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
  }

  // Animator: base loop by name, or a one-shot clip that returns to the loop when it ends.
  anim(name, fade = 0.2) { if (!this.oneShot) this.rig.play(name, fade); this.loop = name; }
  once(name, fade = 0.1) {
    const key = this.stage.lib.byName(name);
    const dur = key ? this.stage.lib.clips[key].duration : 0.5;
    this.rig.play(name, fade);
    this.oneShot = { t: dur };
  }

  animate(dt, speed = 1) {
    if (this.oneShot && (this.oneShot.t -= dt) <= 0) {
      this.oneShot = null;
      this.rig.current = null; // force the loop to restart after the one-shot
      this.rig.play(this.loop || 'IDLE', 0.2);
    }
    this.rig.update(dt, speed);
  }

  // Free swimming: stick is camera-relative on the horizontal plane; up/down buttons swim vertically.
  swim(dt, input, camYaw) {
    const a = input.axis();
    const mag = Math.min(1, Math.hypot(a.x, a.y));
    const fwd = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
    const right = new THREE.Vector3(Math.cos(camYaw), 0, -Math.sin(camYaw));
    const want = fwd.multiplyScalar(a.y).addScaledVector(right, a.x);
    const boost = input.held('boost');
    const sp = this.speed * (boost ? 1 : 0.6);
    want.multiplyScalar(sp);
    const vy = ((input.held('up') ? 1 : 0) - (input.held('down') ? 1 : 0)) * sp * 0.7;
    want.y = vy;
    this.vel.lerp(want, damp(4, dt));
    this.root.position.addScaledVector(this.vel, dt);
    this.confine();

    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (mag > 0.05 && hs > 0.05) {
      const target = yawTo(this.vel.x, this.vel.z);
      let d = target - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const rate = hs > 1 ? this.turnMoving : this.turnStill;
      // turn speeds are the original's degrees per second; doubled so the nose keeps up with the stick
      this.yaw += Math.sign(d) * Math.min(Math.abs(d), rate * 2 * dt);
    }
    const pTarget = THREE.MathUtils.clamp(Math.atan2(this.vel.y, Math.max(hs, 1)), -0.6, 0.6);
    this.pitch += (pTarget - this.pitch) * damp(5, dt);
    this.applyRotation();

    const total = this.vel.length();
    this.anim(this.forceAnim || (total < 0.4 ? 'IDLE' : boost && total > this.speed * 0.8 ? 'SWIM FAST' : 'SWIM'));
    this.animate(dt, total < 0.4 ? 1 : 0.6 + total / this.speed);
  }

  // Keep the body sphere inside the tank: glass walls, sand floor, water surface, rocks as boxes.
  confine() {
    const b = this.bounds;
    if (!b) return;
    const p = this.root.position;
    const c = this.bodyCenter(tmp2);
    const off = c.clone().sub(p);
    const r = this.radius;
    c.x = THREE.MathUtils.clamp(c.x, b.box.min.x + r, b.box.max.x - r);
    c.z = THREE.MathUtils.clamp(c.z, b.box.min.z + r, b.box.max.z - r);
    const floor = b.floor(c.x, c.z);
    c.y = THREE.MathUtils.clamp(c.y, floor + r, b.top - r);
    for (const o of b.obstacles) pushOut(c, r, o);
    p.copy(c).sub(off);
  }
}

// Sphere vs AABB: move the centre to the nearest point outside the expanded box.
function pushOut(c, r, box) {
  if (c.x < box.min.x - r || c.x > box.max.x + r || c.y < box.min.y - r || c.y > box.max.y + r
    || c.z < box.min.z - r || c.z > box.max.z + r) return;
  const q = new THREE.Vector3(
    THREE.MathUtils.clamp(c.x, box.min.x, box.max.x),
    THREE.MathUtils.clamp(c.y, box.min.y, box.max.y),
    THREE.MathUtils.clamp(c.z, box.min.z, box.max.z));
  const d = c.clone().sub(q);
  const l = d.length();
  if (l >= r) return;
  if (l > 1e-4) { c.copy(q).addScaledVector(d, r / l); return; }
  // centre inside the box: leave through the closest face (never down through the floor)
  const exits = [
    [box.max.y + r - c.y, 'y', box.max.y + r],
    [c.x - (box.min.x - r), 'x', box.min.x - r], [box.max.x + r - c.x, 'x', box.max.x + r],
    [c.z - (box.min.z - r), 'z', box.min.z - r], [box.max.z + r - c.z, 'z', box.max.z + r],
  ].sort((a, b) => a[0] - b[0])[0];
  c[exits[1]] = exits[2];
}

// CM vcam1: Transposer "simple follow with world up" behind Player/CameraFocusPoint, Composer looking at it. The
// camera keeps its own heading around the fish (so it trails behind a swimming fish); the camera pad turns it.
export class FollowCam {
  constructor(vcam) {
    const o = U(vcam.body.m_FollowOffset); // (0, 0.3, 1.5): behind and a little above
    this.dist = Math.hypot(o.x, o.z);
    this.height = o.y;
    this.fov = vcam.fov;
    this.yaw = 0;
    this.pitch = 0;
    this.invert = false;
    this.pos = null;
  }

  snap(focus, yaw) { this.yaw = yaw; this.pitch = 0; this.pos = null; this.focus = focus; }

  // clamp: optional Box3 the camera stays in (the tank while the fish is in it, as CinemachineCollider kept it)
  update(camera, focus, look, dt, clamp = null) {
    const fp = focus.getWorldPosition(new THREE.Vector3());
    if (this.pos) { // SimpleFollow: heading from where the camera already is
      const fl = this.pos.clone().sub(fp).setY(0);
      if (fl.lengthSq() > 1e-4) this.yaw = Math.atan2(fl.x, fl.z);
    }
    this.yaw -= look.dx * 0.006;
    this.pitch = THREE.MathUtils.clamp(this.pitch + look.dy * 0.004 * (this.invert ? -1 : 1), -0.9, 1.1);
    const off = new THREE.Vector3(0, this.height, this.dist)
      .applyAxisAngle(new THREE.Vector3(1, 0, 0), -this.pitch).applyAxisAngle(UP, this.yaw);
    const want = fp.clone().add(off);
    if (!this.pos) this.pos = want.clone();
    else this.pos.lerp(want, damp(6, dt));
    if (clamp) this.pos.clamp(clamp.min, clamp.max);
    camera.position.copy(this.pos);
    camera.lookAt(fp);
    if (camera.fov !== this.fov) { camera.fov = this.fov; camera.updateProjectionMatrix(); }
  }
}
