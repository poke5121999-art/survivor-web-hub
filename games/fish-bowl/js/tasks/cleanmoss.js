// Level 1. CleanMoss (Task 1): at the clogged pump, tap "Keep Tapping To Pull Moss" to fill Moss_Slider against its
// constant drain; full -> the moss ball sticks to the fish's mouth, the tank starts clearing, and the drop spot opens.
// CountCollectedItems (Task 2): carry the remaining moss balls one by one to the drop spot at the top.
import { Base } from '../components.js';

const SLIDER = 'TaskSpecificControls/PullMoss_Button/Moss_Slider';
// CleanMoss.FillMossSliderValue / DecreaseMossSliderValue: the Animator speed chases 1.25 on a tap (fill * dt, clamped to 1)
// and chases 0 at decreaseAmnt per second while idle; the Pull bool stays set until the slider fills.
const PULL_SPEED = 1.25;

export class CleanMoss extends Base {
  onEnable() {
    if (this.started) return;
    this.started = true;
    const d = this.data;
    this.value = d.mossSliderStartValue;
    this.shown = false;
    this.done = false;
    this.cleaning = false;
    this.pulling = false; // Animator bool 'Pull'
    this.animSpeed = 1;
    this.lastDt = 1 / 60;
    this.dropped = false;
    this.game.input.on('pull', () => this.FillMossSliderValue());
    this.game.ui.setFill('hud', SLIDER, 0);
  }

  ShowMossBtn(on) {
    this.shown = !!on && !this.done;
    // ShowMossBtn sets the player Rigidbody kinematic: the fish holds still at the pump while the pull button is up
    this.game.fishHeld = this.shown;
    this.game.hud('TaskSpecificControls/PullMoss_Button', this.shown);
  }

  FillMossSliderValue() {
    if (!this.shown || this.done) return;
    // slider += fillAmnt * Time.deltaTime of the frame the tap lands in; the original never plays a sound per tap
    this.value = Math.min(this.data.mossSliderMaxtAmnt, this.value + this.data.mossSliderFillAmnt * this.lastDt);
    this.pulling = true;
    this.animSpeed = PULL_SPEED;
    this.game.cameraShake(0.5); // CleanMoss.FillMossSliderValue: cameraManager.CameraShake(0.5) on every tap
    this.CheckMossSliderMax();
  }

  CheckMossSliderMax() {
    if (this.value < this.data.mossSliderMaxtAmnt || this.done) return;
    this.done = true;
    this.game.fishHeld = false;
    this.cleaning = true;
    this.pulling = false;
    this.game.sound.play(this.data.popSfx.name); // popSfx plays once, when the slider fills
    this.game.events.run(this.data.onMaxSliderValueEvent);
    this.StopFogParticles();
  }

  StopFogParticles() { this.game.setActive(`${this.path.replace(/\/Task 1$/, '')}/FogParticles`, false); }

  MakeChildOFMouth(t) { this.game.attachToMouth(t); }
  // the original sets taskComplete when the first ball is dropped, then asks Task 2 to re-check
  UnparentChildOfMouth() {
    this.game.dropFromMouth();
    this.dropped = true;
    const t2 = this.game.component(this.data.task2.slice(1).split('#')[0], 'CountCollectedItems');
    if (t2) t2.TaskCheck();
  }

  get taskComplete() { return this.dropped; }

  update(dt) {
    const d = this.data, g = this.game;
    this.lastDt = dt;
    if (this.shown && !this.done) {
      // drain is decreaseAmnt per second (Time.deltaTime), same for the Animator speed
      this.value = Math.max(d.mossSliderMintAmnt, this.value - d.mossSliderDecreaseAmnt * dt);
      this.animSpeed = Math.max(0, this.animSpeed - this.animSpeed * Math.min(1, d.mossSliderDecreaseAmnt * dt));
      g.ui.setFill('hud', SLIDER, (this.value - d.mossSliderMintAmnt) / (d.mossSliderMaxtAmnt - d.mossSliderMintAmnt));
    }
    // the Animator's "Pull" state (VIBRATE); at animSpeed ~0 the pose is frozen, shown here as the idle swim
    g.fish.forceAnim = this.pulling && this.animSpeed > 0.05 ? 'VIBRATE' : null;
    if (this.cleaning) {
      g.dirt = Math.max(0, g.dirt - d.aquariumCleaningRate * dt);
      if (g.dirt === 0) {
        this.cleaning = false;
        g.setActive('Post Processing/DirtyAquariumPP', false);
      }
    }
  }
}

export class CountCollectedItems extends Base {
  onEnable() {
    if (this.started) return;
    this.started = true;
    this.count = 0;
    this.done = false;
    // maxItemsCount is 0 in the scene, so CheckMaxCollectedItems (count >= max) is already true at the first drop
    this.max = this.data.maxItemsCount;
  }

  MakeChildOFMouth(t) { this.game.attachToMouth(t); }

  UnparentChildOfMouth() {
    if (!this.game.dropFromMouth()) return;
    this.IncrementCount();
  }

  IncrementCount() {
    this.count++;
    this.CheckMaxCollectedItems();
  }

  CheckMaxCollectedItems() {
    if (this.count < this.max) return;
    this.done = true;
    this.game.events.run(this.data.onMaxItemsCollectedEvent);
    this.TaskCheck();
  }

  TaskCheck() {
    const t1 = this.game.component(this.data.task1.slice(1).split('#')[0], 'CleanMoss');
    if (!this.done || !t1.taskComplete) return;
    this.game.events.run(this.data.onBothTasksCompletedEvent);
    this.game.complete(false);
  }
}
