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
const FLY_DRIFT = 0.5; // AS.CharacterController.FlyingGroundChecker lifts the fish 0.5 u/s each physics step
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
    this.groundCheck = cc.m_FlyGroundCheckDistance;
    this.radius = cap.m_Radius;
    this.center = U(cap.m_Center); // capsule centre in Player space
    this.rig = new Rig(stage.lib, this.model);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.flyUp = 0;
    this.run = false;
    this.boostHeld = false;
    this.walk = 0;
    this.blendT = 0;
    this.forward = 0;
    this.oneShot = null;
    this.bounds = null; // {box: Box3 interior, floor(x, z) -> y, top: y, obstacles: [Box3]}
  }

  reset() {
    this.vel.set(0, 0, 0);
    this.pitch = 0;
    this.flyUp = 0;
    this.walk = 0;
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

  // Free swimming, AS.ControllerInputManager.InputHandler/PhysicsHandler -> AS.CharacterController.Move/OnAnimatorMove.
  swim(dt, input, camYaw) {
    const a = input.axis();
    // Run is a toggle (GetButtonDown 'Run'); without it the stick moves the fish at half strength.
    const boost = input.held('boost');
    if (boost && !this.boostHeld) this.run = !this.run;
    this.boostHeld = boost;
    // FlyUp eases to +1 / -1 / 0 by (target - FlyUp) * min(2 dt, 1) while SwimUp / SwimDown / neither is held.
    const k2 = Math.min(2 * dt, 1);
    if (input.held('up')) this.flyUp += (1 - this.flyUp) * k2;
    if (input.held('down')) this.flyUp += (-1 - this.flyUp) * k2;
    if (!input.held('up') && !input.held('down')) this.flyUp += (0 - this.flyUp) * k2;

    // m_Move = v * camForward(flat, normalised) + h * camRight, halved unless running; Move() clamps it to length 1.
    const fwd = tmp.set(-Math.sin(camYaw), 0, -Math.cos(camYaw));
    const right = tmp2.set(Math.cos(camYaw), 0, -Math.sin(camYaw));
    const want = new THREE.Vector3().addScaledVector(fwd, a.y).addScaledVector(right, a.x).multiplyScalar(this.run ? 1 : 0.5);
    if (want.length() > 1) want.normalize();
    // into the fish's own frame: forwardAmount = local z, turnAmount = atan2(local x, local z)
    const nose = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const side = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const f = want.dot(nose);
    const turn = Math.atan2(want.dot(side), f);
    this.forward = f;
    // ApplyExtraTurnRotation: Rotate(0, turn * lerp(stationary, moving, clamp01(forward)) * dt) in degrees; turn is in
    // radians, so the nose closes on the target exponentially (~pi/s standing, ~2.1/s moving). Unity yaw is clockwise.
    const rate = THREE.MathUtils.lerp(this.turnStill, this.turnMoving, THREE.MathUtils.clamp(f, 0, 1));
    const dyaw = turn * rate * dt;
    this.yaw -= Math.abs(dyaw) > Math.abs(turn) ? turn : dyaw;
    // OnAnimatorMove: velocity = speed * (forward * forwardAmount + up * FlyUp), no inertia
    const nose2 = tmp.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.vel.copy(nose2).multiplyScalar(this.speed * f);
    const grounded = this.grounded();
    // on the floor the rigidbody freezes Y; FlyingGroundChecker still lifts the transform 0.5 u/s every step
    this.vel.y = grounded ? 0 : this.speed * this.flyUp;
    this.root.position.addScaledVector(this.vel, dt);
    this.root.position.y += FLY_DRIFT * dt;
    this.confine();
    // Leaning: the model slerps (rate 5) toward a pitch of 10 degrees * FlyUp, nose up while swimming up
    this.pitch += (this.flyUp * 10 * Math.PI / 180 - this.pitch) * damp(5, dt);
    this.applyRotation();

    // Animator: Walk = forwardAmount (damped 0.1 s) drives the Grounded 1D blend IDLE 0 / SWIM 0.5 / SWIM FAST 1
    this.walk += (f - this.walk) * damp(10, dt);
    if (this.forceAnim || this.oneShot) {
      this.anim(this.forceAnim || this.loop || 'IDLE');
      this.animate(dt);
    } else this.blendSwim(dt);
  }

  blendSwim(dt) {
    const w = THREE.MathUtils.clamp(this.walk, 0, 1);
    const ws = [['IDLE', Math.max(0, 1 - 2 * w)], ['SWIM', Math.max(0, 1 - Math.abs(2 * w - 1))], ['SWIM FAST', Math.max(0, 2 * w - 1)]]
      .filter(x => x[1] > 0.001).sort((p, q) => q[1] - p[1]);
    const top = ws[0][1];
    this.blendT += dt;
    // the first clip of a frame must carry weight 1 (Rig.apply eases a lighter first writer in from the held pose)
    this.rig.apply(ws.map(([name, wt]) => ({ key: this.stage.lib.byName(name), time: this.blendT, weight: wt / top })));
    this.rig.current = { key: this.stage.lib.byName(ws[0][0]), time: this.blendT, fade: 0.2, w: 1 };
    this.rig.prev = null;
    this.loop = ws[0][0];
  }

  // FlyingGroundChecker: raycast down 2 * m_FlyGroundCheckDistance (0.24) from the root, Default layer (inferred: the sand)
  grounded() {
    const b = this.bounds;
    if (!b) return false;
    const p = this.root.position;
    return p.y - b.floor(p.x, p.z) < this.groundCheck * 2;
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
    this.pitch = THREE.MathUtils.clamp(this.pitch + look.dy * 0.004 * (this.invert ? -1 : 1), -20 * Math.PI / 180, 40 * Math.PI / 180); // CameraManager tilt clamp 340..40 deg
    const off = new THREE.Vector3(0, this.height, this.dist)
      .applyAxisAngle(new THREE.Vector3(1, 0, 0), -this.pitch).applyAxisAngle(UP, this.yaw);
    const want = fp.clone().add(off);
    if (!this.pos) this.pos = want.clone();
    else this.pos.lerp(want, damp(4.6, dt)); // Transposer damping 1 s -> 99% in 1 s
    if (clamp) this.pos.clamp(clamp.min, clamp.max);
    camera.position.copy(this.pos);
    camera.lookAt(fp);
    if (camera.fov !== this.fov) { camera.fov = this.fov; camera.updateProjectionMatrix(); }
  }
}
