// Levels 3 and 4, Task 1. FishGetsFood + the player's ThrowSimulation. The next target slides to and fro over its
// container; JUMP always throws the fish at the target as it stands (ThrowSimulation.Update has no aim check): the
// target and its arrow stop and vanish, 0.2 s later the fish flies a 45 degree ballistic arc to the target's trigger
// (SimulateProjectile). The arrow turns green and "GO!!" shows while a ray 2 units below the target hits a Prop
// collider (FishGetsFood.Update); that is only the hint. A throw can kill only through ThrowSimulation.Grounded: a
// sphere cast 0.3 below the fish hitting a ground-layer collider (layer 12). The final targets move those colliders
// off the ground layer (ChangeGameobjectLayer) so the landing next to the table does not count.
import * as THREE from 'three';
import { Base } from '../components.js';
import { activeInHierarchy } from '../unity.js';

const ref = s => s.slice(1).split('#')[0];
const GROUND = 12, PROP = 14; // LayerMask bits 4096 (groundLayer) and 16384 (propLayerMask) in the data
const AIM_RANGE = 2; // FishGetsFood.Update: Physics.Raycast(target, Vector3.down, 2, propLayerMask)
const LAND_DROP = 0.2; // ThrowSimulation.TargetReached sets the fish 0.2 below the trigger
const CONTACT_OFFSET = 0.01; // Physics.defaultContactOffset
// arrow_original_Mat is not in the export (only the green arrow_current_Mat is): a light grey stands in for it
const IDLE_ARROW = new THREE.Color(0.85, 0.85, 0.85);
const DOWN = new THREE.Vector3(0, -1, 0);
const hasCollider = n => !!(n.k && (n.k.MeshCollider || n.k.BoxCollider));

// Meshes standing in for the colliders on the ground layer (12) and the prop layer (14): the task's containers and
// the aquarium's "Water (For Arrow Check)". The layer is kept per node (userData.layer) because ChangeGameobjectLayer
// changes it while playing. A renderer that is off (ren 0) still collides.
export function layerColliders(game) {
  const out = { ground: [], props: [] };
  game.stage.env.root.traverse(o => {
    if (!o.isMesh) return;
    const grp = o.parent, n = grp && grp.userData.node;
    // ground: any mesh on the layer (the room's collider meshes are not exported, StylizedHouseB's render mesh is the floor)
    if (!n || (n.layer !== GROUND && n.layer !== PROP) || (n.layer === PROP && !hasCollider(n))) return;
    // inferred: the ground-layer "Water" colliders are pools the fish ends in (level 4 starts 0.14 above one), not floors
    if (n.layer === GROUND && n.n === 'Water') return;
    if (grp.userData.layer === undefined) grp.userData.layer = n.layer;
    (n.layer === GROUND ? out.ground : out.props).push(o);
  });
  return out;
}

// Nearest front-face hit straight down (Physics.Raycast / SphereCast see a MeshCollider from outside only).
export function castDown(rc, origin, meshes, layer, far, scene = false) {
  rc.set(origin, DOWN);
  rc.near = 0;
  rc.far = far;
  const live = meshes.filter(m => (scene ? m.parent.userData.node.layer : m.parent.userData.layer) === layer && activeInHierarchy(m.parent));
  for (const h of rc.intersectObjects(live, false)) {
    if (!h.face) continue;
    const nrm = h.face.normal.clone().transformDirection(h.object.matrixWorld);
    if (nrm.y > 0 || h.object.material?.side === THREE.DoubleSide) return h;
  }
  return null;
}

// Physics.SphereCast(player + up * (R + contact offset), R, down, height, layer), approximated by its lowest point
// under the centre and four rim points (scene: use the layer saved in the scene, not the runtime one). Shared by ThrowSimulation.Grounded and FloppingFish.Grounded.
export function sphereGrounded(rc, fish, meshes, layer, height, scene = false) {
  const p = fish.root.position, r = fish.radius * 0.7;
  for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
    if (castDown(rc, new THREE.Vector3(p.x + dx, p.y + CONTACT_OFFSET, p.z + dz), meshes, layer, height + CONTACT_OFFSET, scene)) return true;
  }
  return false;
}

export class FishGetsFood extends Base {
  onEnable() {
    if (this.started) return;
    this.started = true;
    const g = this.game, d = this.data;
    this.sim = g.comps['Player/ThrowSimulation'].ThrowSimulation;
    this.targets = d.targetList.map(r => ref(r));
    this.index = 0;
    this.disableDeath = false; // FishGetsFood.DisableDeathCheck only stores ThrowSimulation.disableDeath, nothing reads it
    this.flight = null;
    this.look = true; // ThrowSimulation.lookAtTarget: set in the constructor and after each target, cleared at each throw
    this.foodCollected = 0;
    this.groundTick = 0;
    this.ray = new THREE.Raycaster();
    this.collectColliders();
    this.vcam = ref(d.vCam);
    for (const t of this.targets) g.setActive(t, false);
    g.driver = this;
    g.swimControls(false);
    g.hud('TaskSpecificControls/FishJump_TouchBtn', true);
    g.input.on('jump', () => this.jump());
    this.useVcam(this.vcam);
    this.TargetAssignment();
  }

  onDisable() {
    const g = this.game;
    if (g.driver === this) g.driver = null;
    g.shots = null;
    g.hud('TaskSpecificControls/FishJump_TouchBtn', false);
    g.hud('JumpGoPRomptParent/JumpGoPrompt', false);
    g.swimControls(true);
  }

  collectColliders() {
    const c = layerColliders(this.game);
    this.ground = c.ground;
    this.props = c.props;
  }

  useVcam(path) {
    const g = this.game;
    g.stage.cine.override.follow[path] = g.fish.root;
    if (!g.stage.vcams[path]?.look) g.stage.cine.override.look[path] = g.fish.root;
    g.shots = [{ path, weight: 1 }];
  }

  get target() { return this.targets[this.index]; }

  TargetAssignment() {
    const g = this.game, t = this.target;
    if (!t) return;
    g.setActive(t, true);
    g.tweens.playById(t, 'target');
    this.arrow = g.find(`${t}/arrow`);
    this.arrowMats = [];
    this.arrow?.traverse(o => { if (o.isMesh) this.arrowMats.push(o.material); });
    this.look = true;
    this.wasAimed = false;
  }

  // FishGetsFood.Update: the first target in the list, a ray 2 units straight down, a Prop collider on propLayerMask.
  pointsDown() {
    if (!this.target) return false;
    const o = this.game.find(this.target);
    if (!o) return false;
    return !!castDown(this.ray, o.getWorldPosition(new THREE.Vector3()), this.props, PROP, AIM_RANGE);
  }

  // ThrowSimulation.Grounded: a ground-layer collider within groundCheckHeight below the fish.
  grounded() { return sphereGrounded(this.ray, this.game.fish, this.ground, GROUND, this.data.groundCheckHeight); }

  // The first Update line for the jump key: no state check; the throw starts whether or not the arrow is green.
  jump() {
    const g = this.game;
    if (this.flight || g.state !== 'playing' || g.tl || !g.control || !this.target) return;
    const s = this.sim;
    g.tweens.pause(this.target); // SimulateProjectile pauses the target and arrow tweens, then waits throwDelay
    const o = g.find(this.target);
    o.traverse(m => { if (m.isMesh) m.visible = false; }); // TargetAssignment turns the target and arrow renderers off
    this.arrowMats = [];
    this.look = false;
    g.hud('JumpGoPRomptParent/JumpGoPrompt', false);
    g.fish.anim('SWIM FAST');
    this.flight = { delay: s.throwDelay, end: o.getWorldPosition(new THREE.Vector3()), started: false };
  }

  // SimulateProjectile, after the delay: Vx, Vy from the distance, the fish turned to the target once, then each frame
  // Translate(0, (Vy - g t) dt, Vx dt) in its own frame until t reaches the flight time.
  launch(f) {
    const g = this.game, fish = g.fish, s = this.sim;
    const gravity = this.data.gravityMultiplier; // FishGetsFood.Start copies it to ThrowSimulation.gravity
    f.start = fish.root.position.clone();
    const dist = f.start.distanceTo(f.end);
    const a = s.firingAngle * Math.PI / 180;
    const v = Math.sqrt(dist / (Math.sin(2 * a) / gravity));
    f.vx = v * Math.cos(a);
    f.vy = v * Math.sin(a);
    f.dur = dist / f.vx;
    f.g = gravity;
    f.fwd = f.end.clone().sub(f.start).normalize();
    f.up = new THREE.Vector3(0, 1, 0).sub(f.fwd.clone().multiplyScalar(f.fwd.y)).normalize();
    f.t = 0;
    f.started = true;
    fish.yaw = Math.atan2(-f.fwd.x, -f.fwd.z); // LookRotation(target - fish), kept for the whole flight
    fish.pitch = Math.asin(f.fwd.y);
    fish.applyRotation();
  }

  drive(dt) {
    const g = this.game, f = this.flight, fish = g.fish;
    const aimed = !f && this.pointsDown();
    for (const m of this.arrowMats) m.color.copy(aimed ? this.green() : IDLE_ARROW);
    if (aimed !== this.wasAimed) {
      this.wasAimed = aimed;
      // the jump button pulses (DOTween id jumpNow) while aimed
      if (aimed) g.ui.tween('hud', 'CF2-Canvas/CF2-Panel/TaskSpecificControls/FishJump_TouchBtn', 'jumpNow');
      // FishGetsFood.Update: UIManager.jumpText.color = greenArrowColor while aimed, Color.white otherwise
      const txt = g.ui.el('hud', 'CF2-Canvas/CF2-Panel/TaskSpecificControls/FishJump_TouchBtn/FishJump-Sprite/JumpText');
      if (txt) { const c = this.data.greenArrowColor; txt.style.color = aimed ? `rgb(${c.r * 255},${c.g * 255},${c.b * 255})` : '#fff'; }
    }
    if (!f) {
      g.hud('JumpGoPRomptParent/JumpGoPrompt', aimed && g.control && !g.tl);
      fish.anim('IDLE');
      this.lookAtTarget(dt);
      fish.animate(dt);
      this.checkGround();
      return;
    }
    if (!f.started) {
      f.delay -= dt;
      fish.animate(dt);
      this.checkGround();
      if (f.delay <= 0) this.launch(f);
      return;
    }
    if (f.t >= f.dur) { this.TargetReached(); return; }
    const pos = fish.root.position, prev = pos.clone();
    pos.addScaledVector(f.fwd, f.vx * dt).addScaledVector(f.up, (f.vy - f.g * f.t) * dt);
    f.t += dt;
    this.surfaceSplash(prev, pos);
    fish.animate(dt, 1.5);
    this.checkGround();
  }

  // Update: while lookAtTarget the fish slerps (factor deltaTime per frame) toward the first target in the list.
  lookAtTarget(dt) {
    if (!this.look || !this.target) return;
    const fish = this.game.fish, o = this.game.find(this.target);
    if (!o) return;
    const d = o.getWorldPosition(new THREE.Vector3()).sub(fish.root.position);
    const want = Math.atan2(-d.x, -d.z);
    let dy = want - fish.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const k = Math.min(1, dt);
    fish.yaw += dy * k;
    fish.pitch += (Math.asin(d.y / (d.length() || 1)) - fish.pitch) * k;
    fish.applyRotation();
  }

  // Splash (ThrowSimulation.splashParticle) where the arc crosses the tank's water surface, in or out.
  surfaceSplash(from, to) {
    const g = this.game, top = g.fish.bounds.top;
    if ((from.y - top) * (to.y - top) > 0 || !g.inTank(new THREE.Vector3(to.x, top - 0.01, to.z))) return;
    g.spawnFx(this.sim.splashParticle, new THREE.Vector3(to.x, top, to.z));
  }

  green() { const c = this.data.greenArrowColor; return new THREE.Color(c.r, c.g, c.b); }

  // Update: while checkForGrounder, Grounded() true -> PlayerHandler.Death(2) once.
  checkGround() {
    const g = this.game;
    if (this.dead || g.state !== 'playing' || (++this.groundTick % 3)) return;
    if (!this.grounded()) return;
    this.dead = true;
    g.die();
  }

  // The target trigger entered: ThrowSimulation.TargetReached.
  TargetReached() {
    const g = this.game, fish = g.fish, s = this.sim;
    fish.pitch = 0;
    fish.applyRotation();
    g.sound.play(s.waterPlopSound.name);
    const trig = g.find(`${this.target}/Trigger`) || g.find(this.target);
    const at = trig.getWorldPosition(new THREE.Vector3());
    g.spawnFx(s.splashParticle, at); // Instantiate(splashParticle at the trigger), Play, Destroy after 1 s
    fish.root.position.set(at.x, at.y - LAND_DROP, at.z);
    this.flight = null;
    g.setActive(this.target, false);
    this.index++;
    if (this.index >= this.targets.length) { this.MaxTargetsReached(); return; }
    this.TargetAssignment();
  }

  MaxTargetsReached() {
    const g = this.game;
    g.driver = null;
    g.events.run(this.data.onMaxTargetsReachedEvent);
  }

  // See-through layer events from the target triggers: GameObject.layer = 0 (not the children).
  ChangeGameobjectLayer(obj) { if (obj) obj.userData.layer = 0; }
  DisableDeathCheck(v) { this.disableDeath = !!v; }
  ChangeVcam() { this.useVcam(ref(this.data.otherVcam)); }

  FoodCollected(t) {
    if (!t || !t.visible) return;
    t.visible = false;
    this.foodCollected += this.data.foodCollectedfillAmount;
    this.game.hud('TaskSpecificControls/FoodCollected_Slider', true);
    this.game.ui.setFill('hud', 'TaskSpecificControls/FoodCollected_Slider', this.foodCollected / 100);
  }

  // Exposed to tests: is the jump lined up right now?
  get aimed() { return !this.flight && this.pointsDown(); }
}
