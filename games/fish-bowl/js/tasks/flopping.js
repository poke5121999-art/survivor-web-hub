// Level 4, Task 2. FloppingFish: out of water on the floor, the fish flops (FLOP JUMP: up by jumpSpeed, forward by
// forwardForce) along the Escape Route's path triggers, up the bookshelf and back into the tank, before its HP runs
// out. The fish turns to face the next path trigger by itself (lookAtPath); the stick turns it too.
import * as THREE from 'three';
import { Base } from '../components.js';
import { BoxVolume, activeInHierarchy } from '../unity.js';
import { yawTo } from '../fish.js';

const ref = s => s.slice(1).split('#')[0];
const GRAVITY = 9.81; // Physics.gravity default
// hpDecreaseRate has no unit in the data; read as per fifth of a second (0.3 -> 1.5 HP/s, ~67 s from full HP,
// about three times what a perfect run of the route takes)
const HP_RATE_SCALE = 5;
const TURN_RATE = 2.2; // rad/s from the stick
const LOOK_RATE = 6; // 1/s, turning toward the next path trigger while resting
const FLOOR_BAND = 0.5; // landings this close to the room floor raise dust
const HARD_LANDING = 6; // m/s downward at touchdown

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
    g.input.on('flop', () => this.jump());
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
    this.floorY = this.groundBelow(g.fish.root.position); // the fish starts on the room floor
    this.impact = 0;
    this.faceNext(1);
  }

  next() { const p = this.paths[this.index]; return p ? this.game.find(p).getWorldPosition(new THREE.Vector3()) : null; }

  faceNext(k) {
    const n = this.next();
    if (!n) return;
    const fish = this.game.fish, d = n.sub(fish.root.position);
    const want = yawTo(d.x, d.z);
    let dy = want - fish.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    fish.yaw += dy * k;
  }

  jump() {
    if (!this.live || !this.grounded || this.dead || this.game.state !== 'playing' || this.game.paused) return;
    const d = this.data, fish = this.game.fish;
    // lookAtPath: a flop without stick input heads for the next path trigger
    if (d.lookAtPath && Math.abs(this.game.input.axis().x) < 0.1) this.faceNext(1);
    const fwd = new THREE.Vector3(-Math.sin(fish.yaw), 0, -Math.cos(fish.yaw));
    this.vel.copy(fwd.multiplyScalar(d.forwardForce)).setY(d.jumpSpeed);
    this.grounded = false;
    fish.once('FlopJump', 0.05);
    this.game.spawnFx(d.flopParticle, fish.root.position);
    this.game.sound.play(this.game.comps['Player/ThrowSimulation'].ThrowSimulation.waterPlopSound.name, { volume: 0.35 });
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
    // HP (CalculateFishHP / CheckDied)
    this.hp = Math.max(d.minHP, this.hp - d.hpDecreaseRate * HP_RATE_SCALE * dt);
    g.ui.setFill('hud', 'TaskSpecificControls/HP_Bg_Image/HP_Slider', this.hp / d.maxHP);
    g.ui.setText('hud', 'TaskSpecificControls/HP_Bg_Image/HP_Text (TMP', `(${Math.ceil(this.hp)}/${d.maxHP})`);
    if (this.hp <= d.minHP && !this.dead) { this.dead = true; g.die(); return; }

    const ax = g.input.axis().x;
    fish.yaw -= ax * TURN_RATE * dt;
    if (d.lookAtPath && this.grounded && Math.abs(ax) < 0.1) this.faceNext(1 - Math.exp(-dt * LOOK_RATE));
    // physics in small steps so a slow frame cannot tunnel through a shelf
    const steps = Math.ceil(dt / (1 / 60));
    const h = dt / steps;
    const p = fish.root.position;
    for (let i = 0; i < steps; i++) {
      this.vel.y -= GRAVITY * h;
      if (this.grounded) this.vel.multiplyScalar(Math.exp(-d.stoppingSpeed * h)).setY(0);
      if (this.vel.y < 0) this.impact = this.vel.y;
      p.addScaledVector(this.vel, h);
      for (const w of this.walls) pushOutObb(p, fish.radius, w);
      // AssignWaterEvents: the water trigger is a flat box, so test it every step or a fast fall skips it
      if (g.triggers.contains(this.water, fish.bodyCenter(), fish.radius)) { this.AquariumReahed(); return; }
      const gy = this.groundBelow(p);
      if (p.y <= gy + 0.02 && this.vel.y <= 0) {
        if (!this.grounded) { fish.anim('FlopIdle', 0.1); this.landed(gy, -this.impact); }
        p.y = gy;
        this.vel.y = 0;
        this.grounded = true;
      } else if (p.y > gy + 0.05) this.grounded = false;
    }
    fish.pitch = 0;
    fish.applyRotation();
    fish.animate(dt);
  }

  // Dust (StepsManager.Dust) when a flop lands on the room floor; the body slam when it lands hard.
  landed(y, speed) {
    const g = this.game, p = g.fish.root.position;
    if (y < this.floorY + FLOOR_BAND) g.spawnFx(g.comps.Player.StepsManager.Dust, new THREE.Vector3(p.x, y, p.z));
    if (speed > HARD_LANDING) g.playFx('Player/CartoonyBodySlam');
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
