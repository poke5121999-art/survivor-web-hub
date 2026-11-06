// Level 2. FeedFish: the feeding machine rides its dolly track above the tank. DispensingFood: the cylinder rotates,
// 2 s later the lid opens and a pinch of food drops, 2 s later the lid closes. The pinch lives foodDestroyTime (20 s)
// and DispenseAgain asks for the next one that long after the drop, whether or not it was eaten. The fish bites the
// food (crunch, FoodEating cutscene), HungerSlider gains hungerFillValue, and at max the level completes after 2 s.
import * as THREE from 'three';
import { Base } from '../components.js';
import { U, meshBox } from '../unity.js';

const SLIDER = 'TaskSpecificControls/HungerSlider';
const FOOD_SRC = 'ActivityManager/Activities/Level 2/TimelineFoodEating/TimelineStuff/FishFood';
const DISPENSE_DELAY = 2; // Update calls DispenseFood(2.0); both WaitForSeconds of DispensingFood use it
const COMPLETE_DELAY = 2; // CheckHungerBarLevel -> CurrentActivityComplete(2.0)
const CRUNCH_COOLDOWN = 1; // HandleCrunch: showCrunch gate and the particle's lifetime
const FLIP_AT = 1.1; // Update: dispenser yaw 0 below this cart position, 180 degrees above
// inferred, not read: the food prefab's Rigidbody and trigger collider are not in the dump
const BITE_RANGE = 1.0; // mouth to food centre
const SINK_SPEED = 0.6; // food drifting down through the water
const FLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const ref = s => s.slice(1).split('#')[0];

export class FeedFish extends Base {
  onEnable() {
    if (this.started) return;
    this.started = true;
    const d = this.data, g = this.game;
    this.hunger = d.hungerSlider_StartValue;
    this.food = null;
    this.pathPos = 0;
    this.cartSpeed = d.cartSpeed;
    this.foodNeeded = true;
    this.foodDispensed = false; // set once the bar is full: the cart eases to a stop and nothing more drops
    this.checked = false; // hasCheckedHungerLevel
    this.crunchReady = true; // showCrunch
    this.dispense = null; // DispensingFood coroutine: {t, step}
    this.refill = 0; // DispenseAgain coroutine: seconds until foodNeeded
    this.machine = g.find(ref(d.fishFoodDispenser));
    this.cylinder = ref(d.foodCylinder);
    this.lid = ref(d.lid);
    const track = g.find(ref(d.dispenserPath));
    track.updateWorldMatrix(true, false);
    this.points = track.userData.node.k['Cinemachine.CinemachineSmoothPath'].m_Waypoints
      .map(w => U(w.position).applyMatrix4(track.matrixWorld));
    this.baseRot = this.machine.quaternion.clone();
    this.offset = this.machine.getWorldPosition(new THREE.Vector3()).sub(this.points[0]);
    g.hud(SLIDER, true);
    g.ui.setFill('hud', SLIDER, this.hunger / d.hungerSlider_MaxValue);
  }

  // CinemachineSmoothPath looped through its two waypoints: there and back, eased at the ends.
  machineAt(pos) {
    const n = this.points.length;
    const u = ((pos % n) + n) % n;
    const i = Math.floor(u), k = u - i;
    const e = (1 - Math.cos(k * Math.PI)) / 2;
    return this.points[i].clone().lerp(this.points[(i + 1) % n], e).add(this.offset);
  }

  // Update -> DispenseFood(2.0) -> DispensingFood
  DispenseFood() {
    this.cartSpeed = this.data.cartSpeed;
    this.foodNeeded = false;
    this.game.tweens.restart(this.cylinder);
    this.dispense = { t: DISPENSE_DELAY, step: 1 };
  }

  stepDispense(dt) {
    const g = this.game, o = this.dispense;
    if (!o || (o.t -= dt) > 0) return;
    if (o.step === 1) {
      g.tweens.playById(this.lid, 'openLid');
      this.DropFishFood();
      o.t = DISPENSE_DELAY;
      o.step = 2;
    } else {
      g.tweens.playById(this.lid, 'closeLid');
      this.dispense = null;
    }
  }

  DropFishFood() {
    const g = this.game, d = this.data;
    const sfx = d.dispenseSfx[Math.floor(Math.random() * d.dispenseSfx.length)];
    g.sound.play(sfx.name);
    // the FoodEating cutscene's pellets stand in for the FoodContainer2 prefab, centred in a holder
    const src = g.find(FOOD_SRC);
    const pellets = src.clone(true);
    src.parent.updateWorldMatrix(true, false);
    pellets.applyMatrix4(src.parent.matrixWorld);
    pellets.traverse(o => { o.visible = true; });
    const centre = meshBox(pellets).getCenter(new THREE.Vector3());
    pellets.position.sub(centre);
    const food = new THREE.Group();
    food.add(pellets);
    food.position.copy(g.find(this.cylinder).getWorldPosition(new THREE.Vector3()));
    food.userData.vy = 0;
    food.userData.age = 0;
    g.dynamic.add(food);
    g.nav.extra.add(food);
    this.food = food;
    this.refill = d.foodDestroyTime; // DispenseAgain(foodDestroyTime)
  }

  clearFood() {
    if (!this.food) return;
    this.game.nav.extra.delete(this.food);
    this.food.removeFromParent();
    this.food = null;
  }

  IncrementHunger() {
    const g = this.game, d = this.data;
    const at = this.food.position.clone();
    this.clearFood();
    if (this.crunchReady) { // HandleCrunch spawns the particle at the food, then waits a second before the next one
      this.crunchReady = false;
      g.spawnFx(d.crunchParticle, at);
      g.after(CRUNCH_COOLDOWN, () => { this.crunchReady = true; });
    }
    g.sound.play(d.eatSfx.name); // inferred: nothing in FeedFish plays eatSfx on a bite, only PlayAudio exists
    this.hunger = Math.min(d.hungerSlider_MaxValue, this.hunger + d.hungerFillValue);
    g.ui.setFill('hud', SLIDER, this.hunger / d.hungerSlider_MaxValue);
    const eat = g.component(ref(d.EatTimeline), 'TimelineController');
    if (eat) eat.Play(); else this.CheckHungerBarLevel();
  }

  // runs when the FoodEating timeline ends (TimelineEvents.OnTimelineEnd)
  CheckHungerBarLevel() {
    const g = this.game, d = this.data;
    if (this.checked || this.hunger < d.hungerSlider_MaxValue) return;
    this.foodDispensed = true;
    this.checked = true;
    g.events.run(d.onHungerMaxEvent);
    g.after(COMPLETE_DELAY, () => g.complete(false));
  }

  update(dt) {
    const g = this.game, d = this.data;
    if (g.state !== 'playing') return;
    // Update (runs during cutscenes too): the cart eases to a stop once full, the machine yaws at the far end
    if (this.foodDispensed) this.cartSpeed -= this.cartSpeed * Math.min(1, dt);
    this.pathPos += this.cartSpeed * dt;
    this.machine.position.copy(this.machine.parent.worldToLocal(this.machineAt(this.pathPos)));
    if (!this.foodDispensed) {
      const u = ((this.pathPos % this.points.length) + this.points.length) % this.points.length;
      // the original sets an absolute localRotation of yaw 0/180; the exported node carries a base rotation, so compose
      this.machine.quaternion.copy(this.baseRot);
      if (u >= FLIP_AT) this.machine.quaternion.multiply(FLIP);
      if (this.foodNeeded) this.DispenseFood();
    }
    // coroutines
    this.stepDispense(dt);
    if (this.refill > 0 && (this.refill -= dt) <= 0) this.foodNeeded = true;
    const f = this.food;
    if (!f) return;
    f.userData.age += dt;
    const b = g.fish.bounds;
    if (f.position.y > b.top) { f.userData.vy -= 9.8 * dt; f.position.y += f.userData.vy * dt; } else {
      const floor = b.floor(f.position.x, f.position.z) + 0.15;
      f.position.y = Math.max(floor, f.position.y - SINK_SPEED * dt);
      f.rotation.y += dt * 0.5;
    }
    // DestroyFood triggers outside the tank and Destroy(food, foodDestroyTime); the next pinch's timer is not touched
    const outside = f.position.x < b.box.min.x || f.position.x > b.box.max.x || f.position.z < b.box.min.z || f.position.z > b.box.max.z;
    if (outside || f.userData.age > d.foodDestroyTime) { this.clearFood(); return; }
    if (!g.tl && f.position.y <= b.top && g.fish.mouthPos().distanceTo(f.position) < BITE_RANGE) this.IncrementHunger();
  }

  dispose() { this.clearFood(); }
}
