// Level 2. FeedFish: the feeding machine rides its dolly track above the tank and drops a pinch of food; the fish
// swims to it and bites (eat sound, the FoodEating cutscene), HungerSlider fills by hungerFillValue per pinch, and the
// level ends when it is full. Uneaten food is cleared after foodDestroyTime and the machine drops again.
import * as THREE from 'three';
import { Base } from '../components.js';
import { U, meshBox } from '../unity.js';

const SLIDER = 'TaskSpecificControls/HungerSlider';
const FOOD_SRC = 'ActivityManager/Activities/Level 2/TimelineFoodEating/TimelineStuff/FishFood';
const FIRST_DROP = 2; // s after the task starts
const NEXT_DROP = 1.5; // s after a pinch was eaten or cleared
const BITE_RANGE = 1.0; // mouth to food centre
const SINK_SPEED = 0.6; // food drifting down through the water
const ref = s => s.slice(1).split('#')[0];

export class FeedFish extends Base {
  onEnable() {
    if (this.started) return;
    this.started = true;
    const d = this.data, g = this.game;
    this.hunger = d.hungerSlider_StartValue;
    this.food = null;
    this.pathPos = 0;
    this.dropIn = FIRST_DROP;
    this.machine = g.find(ref(d.fishFoodDispenser));
    this.cylinder = ref(d.foodCylinder);
    this.lid = ref(d.lid);
    const track = g.find(ref(d.dispenserPath));
    track.updateWorldMatrix(true, false);
    this.points = track.userData.node.k['Cinemachine.CinemachineSmoothPath'].m_Waypoints
      .map(w => U(w.position).applyMatrix4(track.matrixWorld));
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

  DispenseFood() {
    const g = this.game, d = this.data;
    g.tweens.playById(this.cylinder, 'rotate');
    g.tweens.playById(this.lid, 'openLid');
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
    g.after(1, () => g.tweens.playById(this.lid, 'closeLid'));
  }

  DropFishFood() { this.DispenseFood(); }

  clearFood() {
    if (!this.food) return;
    this.game.nav.extra.delete(this.food);
    this.food.removeFromParent();
    this.food = null;
  }

  IncrementHunger() {
    const g = this.game, d = this.data;
    this.clearFood();
    g.spawnFx(d.crunchParticle, g.fish.mouthPos());
    g.fish.once('ACTION FOR SWIM');
    g.sound.play(d.eatSfx.name);
    this.hunger = Math.min(d.hungerSlider_MaxValue, this.hunger + d.hungerFillValue);
    g.ui.setFill('hud', SLIDER, this.hunger / d.hungerSlider_MaxValue);
    g.after(0.4, () => {
      if (g.state !== 'playing') return;
      const eat = g.component(ref(d.EatTimeline), 'TimelineController');
      eat ? eat.Play() : this.CheckHungerBarLevel();
    });
  }

  CheckHungerBarLevel() {
    if (this.hunger >= this.data.hungerSlider_MaxValue) { this.game.complete(false); return; }
    this.dropIn = NEXT_DROP;
  }

  update(dt) {
    const g = this.game, d = this.data;
    if (g.tl || g.state !== 'playing') return;
    this.pathPos += d.cartSpeed * dt;
    this.machine.position.copy(this.machine.parent.worldToLocal(this.machineAt(this.pathPos)));
    if (!this.food && this.dropIn > 0 && (this.dropIn -= dt) <= 0) this.DispenseFood();
    const f = this.food;
    if (!f) return;
    f.userData.age += dt;
    const b = g.fish.bounds;
    if (f.position.y > b.top) { f.userData.vy -= 9.8 * dt; f.position.y += f.userData.vy * dt; } else {
      const floor = b.floor(f.position.x, f.position.z) + 0.15;
      f.position.y = Math.max(floor, f.position.y - SINK_SPEED * dt);
      f.rotation.y += dt * 0.5;
    }
    const outside = f.position.x < b.box.min.x || f.position.x > b.box.max.x || f.position.z < b.box.min.z || f.position.z > b.box.max.z;
    if (outside || f.userData.age > d.foodDestroyTime) { this.clearFood(); this.dropIn = NEXT_DROP; return; }
    if (f.position.y <= b.top && g.fish.mouthPos().distanceTo(f.position) < BITE_RANGE) this.IncrementHunger();
  }

  dispose() { this.clearFood(); }
}
