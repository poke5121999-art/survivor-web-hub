// Levels 3 and 4, Task 1. FishGetsFood + the player's ThrowSimulation: the next target slides to and fro over its
// container; its arrow turns green (and "GO!!" shows) while it points down into the container. JUMP throws the fish on
// a 45 degree ballistic arc (ThrowSimulation.SimulateProjectile) to where the target is. Landing over the container
// reaches the target; landing beside it drops the fish on the table and it dies (unless DisableDeathCheck was set).
import * as THREE from 'three';
import { Base } from '../components.js';
import { meshBox } from '../unity.js';
import { yawTo } from '../fish.js';

const ref = s => s.slice(1).split('#')[0];
const GREEN_SHRINK = 0.15; // the target must be this far (fraction of the container size) inside the rim
const LAND_PAUSE = 0.35;
// arrow_original_Mat is not in the export (only the green arrow_current_Mat is): a light grey stands in for it
const IDLE_ARROW = new THREE.Color(0.85, 0.85, 0.85);

export class FishGetsFood extends Base {
  onEnable() {
    if (this.started) return;
    this.started = true;
    const g = this.game, d = this.data;
    this.sim = g.comps['Player/ThrowSimulation'].ThrowSimulation;
    this.targets = d.targetList.map(r => ref(r));
    this.index = 0;
    this.disableDeath = false;
    this.flight = null;
    this.foodCollected = 0;
    this.vcam = ref(d.vCam);
    this.props = this.targets.map(t => this.propOf(t));
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

  useVcam(path) {
    const g = this.game;
    g.stage.cine.override.follow[path] = g.fish.root;
    if (!g.stage.vcams[path]?.look) g.stage.cine.override.look[path] = g.fish.root;
    g.shots = [{ path, weight: 1 }];
  }

  // The container a target stands for: the first object its trigger moves to the see-through layer.
  propOf(target) {
    const trig = this.game.comps[`${target}/Trigger`]?.['AS.TriggerEvents'];
    const call = (trig?.OnTriggerEnterEvent || []).find(e => e.method === 'ChangeGameobjectLayer');
    return call ? ref(call.arg) : null;
  }

  get target() { return this.targets[this.index]; }

  TargetAssignment() {
    const g = this.game, t = this.target;
    if (!t) return;
    g.setActive(t, true);
    g.tweens.playById(t, 'target');
    const prop = this.props[this.index] && g.find(this.props[this.index]);
    this.propBox = prop ? meshBox(prop) : null;
    this.arrow = g.find(`${t}/arrow`);
    this.arrowMats = [];
    this.arrow?.traverse(o => { if (o.isMesh) this.arrowMats.push(o.material); });
    g.fish.face(g.find(t).getWorldPosition(new THREE.Vector3()));
  }

  // The arrow points at its target; a hit on the container (propLayerMask) means the target is over the container.
  pointsDown() {
    if (!this.target || !this.propBox) return false;
    const p = this.game.find(this.target).getWorldPosition(new THREE.Vector3());
    const b = this.propBox, sx = (b.max.x - b.min.x) * GREEN_SHRINK, sz = (b.max.z - b.min.z) * GREEN_SHRINK;
    return p.x > b.min.x + sx && p.x < b.max.x - sx && p.z > b.min.z + sz && p.z < b.max.z - sz;
  }

  jump() {
    const g = this.game;
    if (this.flight || g.state !== 'playing' || g.tl || !g.control || !this.target) return;
    const s = this.sim;
    const start = g.fish.root.position.clone();
    const end = g.find(this.target).getWorldPosition(new THREE.Vector3());
    g.tweens.pause(this.target); // the target stops where the fish was thrown at
    const aimed = this.pointsDown();
    // ThrowSimulation.SimulateProjectile: launch at firingAngle along the line to the target under gravity
    const dist = start.distanceTo(end);
    const a = s.firingAngle * Math.PI / 180;
    const v = Math.sqrt(dist * s.gravity / Math.sin(2 * a));
    const vx = v * Math.cos(a), vy = v * Math.sin(a);
    const fwd = end.clone().sub(start).normalize();
    const up = new THREE.Vector3(0, 1, 0).sub(fwd.clone().multiplyScalar(fwd.y)).normalize();
    this.flight = { start, end, fwd, up, vx, vy, t: -s.throwDelay, dur: dist / vx, aimed };
    g.hud('JumpGoPRomptParent/JumpGoPrompt', false);
    g.fish.anim('SWIM FAST');
  }

  drive(dt) {
    const g = this.game, f = this.flight, fish = g.fish;
    const aimed = !f && this.pointsDown();
    for (const m of this.arrowMats) m.color.copy(aimed ? this.green() : IDLE_ARROW);
    if (!f) {
      g.hud('JumpGoPRomptParent/JumpGoPrompt', aimed && g.control && !g.tl);
      fish.anim('IDLE');
      fish.animate(dt);
      return;
    }
    f.t += dt;
    if (f.t < 0) { fish.animate(dt); return; }
    const t = Math.min(f.t, f.dur), s = this.sim;
    const p = f.start.clone().addScaledVector(f.fwd, f.vx * t).addScaledVector(f.up, f.vy * t - 0.5 * s.gravity * t * t);
    const vel = f.fwd.clone().multiplyScalar(f.vx).addScaledVector(f.up, f.vy - s.gravity * t);
    this.surfaceSplash(fish.root.position, p);
    fish.root.position.copy(p);
    fish.yaw = yawTo(vel.x, vel.z);
    fish.pitch = Math.atan2(vel.y, Math.hypot(vel.x, vel.z));
    fish.applyRotation();
    fish.animate(dt, 1.5);
    if (f.t >= f.dur) this.land();
  }

  // Splash (ThrowSimulation.splashParticle) where the arc crosses the tank's water surface, in or out.
  surfaceSplash(from, to) {
    const g = this.game, top = g.fish.bounds.top;
    if ((from.y - top) * (to.y - top) > 0 || !g.inTank(new THREE.Vector3(to.x, top - 0.01, to.z))) return;
    g.spawnFx(this.sim.splashParticle, new THREE.Vector3(to.x, top, to.z));
  }

  green() { const c = this.data.greenArrowColor; return new THREE.Color(c.r, c.g, c.b); }

  land() {
    const g = this.game, f = this.flight, fish = g.fish;
    fish.pitch = 0;
    fish.applyRotation();
    g.sound.play(this.sim.waterPlopSound.name);
    if (f.aimed || this.disableDeath) g.spawnFx(this.sim.splashParticle, fish.root.position);
    if (!f.aimed && !this.disableDeath) { this.miss(); return; }
    this.flight = { done: true, t: 0, dur: Infinity, start: f.end, end: f.end, fwd: f.fwd, up: f.up, vx: 0, vy: 0 };
    g.after(LAND_PAUSE, () => {
      this.flight = null;
      this.TargetReached();
    });
  }

  // Landed beside the container: fall to whatever is below and die (ThrowSimulation.DeathCheck).
  miss() {
    const g = this.game, fish = g.fish;
    const from = fish.root.position.clone();
    const ray = new THREE.Raycaster(from.clone().add(new THREE.Vector3(0, 0.2, 0)), new THREE.Vector3(0, -1, 0), 0, 60);
    const hit = ray.intersectObject(g.stage.env.root, true).find(h => h.object.visible);
    const floorY = hit ? hit.point.y : from.y - 2;
    let vy = 0;
    this.flight = { falling: true };
    this.drive = dt => {
      vy -= this.sim.gravity * dt;
      fish.root.position.y = Math.max(floorY, fish.root.position.y + vy * dt);
      fish.animate(dt);
      if (fish.root.position.y <= floorY && !this.dead) {
        this.dead = true;
        g.playFx('Player/CartoonyBodySlam'); // PlayerHandler.flopParticle on the hard landing
        g.die();
      }
    };
  }

  TargetReached() {
    const g = this.game;
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

  ChangeGameobjectLayer() { /* see-through layer for the camera: nothing to do here */ }
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
