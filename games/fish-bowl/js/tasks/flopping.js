// Level 4, Task 2. FloppingFish: out of water on the floor, the fish flops (FLOP JUMP: an impulse of (0, jumpSpeed,
// forwardForce) in its own frame) along the Escape Route's path triggers, up the bookshelf and back into the tank, before
// its HP bar (hpDecreaseRate per second) runs out. The fish turns itself toward the next path trigger (lookAtPath,
// slerp factor deltaTime * lookAtTime); nothing but the camera answers to the stick.
import * as THREE from 'three';
import { Base } from '../components.js';
import { BoxVolume, activeInHierarchy } from '../unity.js';
import { layerColliders, sphereGrounded } from './jumps.js';

const ref = s => s.slice(1).split('#')[0];
const GRAVITY = 9.81; // Physics.gravity default (the player's Rigidbody useGravity is switched on in Start)
const STEP = 0.02; // Time.fixedDeltaTime: FixedUpdate does the grounded check, damping and the flop impulse
const GROUND = 12;

export class FloppingFish extends Base {
  onEnable() {
    if (this.started) return;
    this.started = true;
    const g = this.game, d = this.data;
    this.hp = d.maxHP;
    this.dead = false;
    this.reached = false;
    this.vel = new THREE.Vector3();
    this.grounded = false;
    this.paths = d.pathTriggersList.map(ref);
    this.index = d.currentPathIndex;
    this.paths.forEach((p, i) => g.setActive(p, i === this.index));
    // invisible walls of the route (Colliders/Collider_Cube*)
    const colliders = g.find(`${this.path}/Colliders`);
    this.walls = colliders ? colliders.children.filter(o => o.userData.node?.k?.BoxCollider).map(o => new BoxVolume(o, o.userData.node.k.BoxCollider)) : [];
    const area = new THREE.Box3();
    for (const p of this.paths) area.expandByPoint(g.find(p).getWorldPosition(new THREE.Vector3()));
    area.expandByPoint(g.find(`ActivityManager/Activities/Level ${g.level}/PlayerPos (Flopping)`)?.getWorldPosition(new THREE.Vector3()) || area.min);
    area.expandByScalar(6);
    // what the fish lands on: any visible mesh of the room near the route (the floor's MeshCollider has no mesh)
    this.ground = [];
    const mb = new THREE.Box3();
    g.stage.env.root.traverse(o => {
      if (!o.isMesh || /Water|Glass/.test(o.parent?.name || '') || !activeInHierarchy(o)) return;
      if (mb.setFromObject(o).intersectsBox(area)) this.ground.push(o);
    });
    this.ray = new THREE.Raycaster();
    // groundLayer 4096. The room floor (FISHENV/Plane) has no exported mesh, so StylizedHouseB's render mesh stands in
    // for it, with the layer it has in the scene: Task 1's last target moved it off layer 12 for the throws.
    this.layer12 = layerColliders(g).ground;
    this.step = 0;
    this.queued = false;
    g.input.on('flop', () => { this.queued = true; });
    this.vcam = ref(d.flopVcam);
    this.water = ref(d.waterTrigger);
  }

  // Controls and camera switch on only once the Glass Dropped cutscene has handed the player back.
  begin() {
    const g = this.game;
    this.live = true;
    g.driver = this;
    g.swimControls(false);
    for (const p of ['TaskSpecificControls/HP_Bg_Image', 'TaskSpecificControls/FloppyFishJump_TouchBtn']) g.hud(p, true);
    g.stage.cine.override.follow[this.vcam] = g.fish.root;
    g.stage.cine.override.look[this.vcam] = g.fish.root;
    g.shots = [{ path: this.vcam, weight: 1 }];
    g.fish.anim('FlopIdle', 0.1);
  }

  next() { const p = this.paths[this.index]; return p ? this.game.find(p).getWorldPosition(new THREE.Vector3()) : null; }

  // Update, lookAtPath: rotation = Slerp(rotation, LookRotation(path trigger - fish), deltaTime * lookAtTime), pitch included.
  lookAtPath(dt) {
    const n = this.next(), fish = this.game.fish;
    if (!n) return;
    const d = n.sub(fish.root.position);
    if (d.lengthSq() < 1e-6) return;
    const want = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.asin(d.y / d.length()), Math.atan2(-d.x, -d.z), 0, 'YXZ'));
    fish.root.quaternion.slerp(want, Math.min(1, dt * this.data.lookAtTime));
    const e = new THREE.Euler().setFromQuaternion(fish.root.quaternion, 'YXZ');
    fish.yaw = e.y;
    fish.pitch = e.x;
  }

  // FixedUpdate, grounded: velocity = Lerp(velocity, 0, fixedDt * stoppingSpeed); a flop adds AddRelativeForce(0,
  // jumpSpeed, forwardForce, Impulse) to the mass 1 body and plays PlayerHandler.PlayFlopParticle (Player/CartoonyBodySlam).
  fixedUpdate() {
    const g = this.game, d = this.data, fish = g.fish;
    this.grounded = sphereGrounded(this.ray, fish, this.layer12, GROUND, d.groundCheckHeight, true);
    if (!this.grounded) { this.queued = false; return; }
    this.vel.multiplyScalar(1 - Math.min(1, STEP * d.stoppingSpeed));
    if (!this.queued) return;
    this.queued = false;
    this.vel.add(new THREE.Vector3(0, d.jumpSpeed, -d.forwardForce).applyQuaternion(fish.root.quaternion));
    g.playFx('Player/CartoonyBodySlam');
    fish.once('FlopJump', 0.05);
  }

  groundBelow(p) {
    this.ray.set(new THREE.Vector3(p.x, p.y + 0.6, p.z), new THREE.Vector3(0, -1, 0));
    this.ray.far = 40;
    const hit = this.ray.intersectObjects(this.ground, false).find(h => h.object.visible);
    return hit ? hit.point.y : -Infinity;
  }

  drive(dt) {
    const g = this.game, fish = g.fish, d = this.data;
    if (!this.live || this.reached) { fish.animate(dt); return; }
    // CalculateFishHP / CheckDied: the slider (0..maxHP, starts full) loses hpDecreaseRate per second
    this.hp = Math.max(d.minHP, this.hp - d.hpDecreaseRate * dt);
    g.ui.setFill('hud', 'TaskSpecificControls/HP_Bg_Image/HP_Slider', this.hp / d.maxHP);
    g.ui.setText('hud', 'TaskSpecificControls/HP_Bg_Image/HP_Text (TMP', `(${Math.floor(this.hp)}/${d.maxHP})`);
    if (this.hp <= d.minHP && !this.dead) { this.dead = true; g.die(); return; }

    if (d.lookAtPath) this.lookAtPath(dt);
    // physics in fixed steps: FixedUpdate first, then gravity, movement and contacts
    this.acc = (this.acc || 0) + dt;
    const p = fish.root.position;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.fixedUpdate();
      this.vel.y -= GRAVITY * STEP;
      p.addScaledVector(this.vel, STEP);
      for (const w of this.walls) pushOutObb(p, fish.radius, w);
      // AssignWaterEvents: the water trigger is a flat box, so test it every step or a fast fall skips it
      if (g.triggers.contains(this.water, fish.bodyCenter(), fish.radius)) { this.AquariumReahed(); return; }
      const gy = this.groundBelow(p);
      if (p.y <= gy + 0.02 && this.vel.y <= 0) {
        if (!this.touching) fish.anim('FlopIdle', 0.1);
        p.y = gy;
        this.vel.y = 0;
        this.touching = true;
      } else if (p.y > gy + 0.05) this.touching = false;
    }
    fish.applyRotation();
    fish.animate(dt);
  }

  NextPathTrigger() {
    const g = this.game;
    if (!this.live) return;
    g.setActive(this.paths[this.index], false);
    this.index++;
    if (this.paths[this.index]) g.setActive(this.paths[this.index], true);
  }

  AquariumReahed() {
    const g = this.game;
    if (!this.live || this.reached || this.dead || g.state !== 'playing') return;
    this.reached = true;
    g.driver = null;
    g.shots = null;
    g.swimControls(true);
    for (const p of ['TaskSpecificControls/HP_Bg_Image', 'TaskSpecificControls/FloppyFishJump_TouchBtn']) g.hud(p, false);
    g.fish.anim('SWIM');
    g.spawnFx(g.comps['Player/ThrowSimulation'].ThrowSimulation.splashParticle,
      new THREE.Vector3(g.fish.root.position.x, g.fish.bounds.top, g.fish.root.position.z));
    g.complete(false);
  }

  update() {
    // the Glass Dropped cutscene re-enables the player at its end (InstanceManager.PlayerStatus(true))
    if (!this.live && !this.game.tl && this.game.control) this.begin();
  }
}

// Sphere vs oriented BoxCollider (non-uniform scale): push the centre out along the nearest surface normal.
const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
function pushOutObb(p, r, vol) {
  vol.obj.updateWorldMatrix(true, false);
  vol.obj.matrixWorld.decompose(pos, quat, scl);
  const c = vol.center.clone().multiply(scl).applyQuaternion(quat).add(pos); // world box centre
  const qi = quat.clone().invert();
  const local = p.clone().sub(c).applyQuaternion(qi);
  const half = new THREE.Vector3(Math.abs(vol.half.x * scl.x), Math.abs(vol.half.y * scl.y), Math.abs(vol.half.z * scl.z));
  const q = local.clone().clamp(half.clone().negate(), half);
  const dlt = local.clone().sub(q);
  const l = dlt.length();
  if (l >= r) return;
  if (l > 1e-5) q.addScaledVector(dlt, r / l);
  else { // inside: leave through the closest side
    const ax = ['x', 'y', 'z'].sort((a, b) => (half[a] - Math.abs(local[a])) - (half[b] - Math.abs(local[b])))[0];
    q[ax] = Math.sign(local[ax] || 1) * (half[ax] + r);
  }
  p.copy(q.applyQuaternion(quat).add(c));
}
