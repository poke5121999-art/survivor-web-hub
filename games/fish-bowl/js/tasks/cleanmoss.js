// Level 1. CleanMoss (Task 1): at the clogged pump, tap "Keep Tapping To Pull Moss" to fill Moss_Slider against its
// constant drain; full -> the moss ball sticks to the fish's mouth, the tank starts clearing, and the drop spot opens.
// CountCollectedItems (Task 2): carry the remaining moss balls one by one to the drop spot at the top.
import { Base } from '../components.js';

// Fill/drain amounts are per frame in the original (Update without deltaTime); 60 fps is the reference rate.
const REF_FPS = 60;
const SLIDER = 'TaskSpecificControls/PullMoss_Button/Moss_Slider';
const PULL_ANIM_SECONDS = 0.35;

export class CleanMoss extends Base {
  onEnable() {
    if (this.started) return;
    this.started = true;
    const d = this.data;
    this.value = d.mossSliderStartValue;
    this.shown = false;
    this.done = false;
    this.cleaning = false;
    this.pullT = 0;
    this.game.input.on('pull', () => this.FillMossSliderValue());
    this.game.ui.setFill('hud', SLIDER, 0);
  }

  ShowMossBtn(on) {
    this.shown = !!on && !this.done;
    this.game.hud('TaskSpecificControls/PullMoss_Button', this.shown);
  }

  FillMossSliderValue() {
    if (!this.shown || this.done) return;
    this.value = Math.min(this.data.mossSliderMaxtAmnt, this.value + this.data.mossSliderFillAmnt / REF_FPS);
    this.game.sound.play(this.data.popSfx.name, { volume: 0.6 });
    this.pullT = PULL_ANIM_SECONDS;
    this.CheckMossSliderMax();
  }

  CheckMossSliderMax() {
    if (this.value < this.data.mossSliderMaxtAmnt || this.done) return;
    this.done = true;
    this.cleaning = true;
    this.game.events.run(this.data.onMaxSliderValueEvent);
    this.StopFogParticles();
  }

  StopFogParticles() { this.game.setActive(`${this.path.replace(/\/Task 1$/, '')}/FogParticles`, false); }

  MakeChildOFMouth(t) { this.game.attachToMouth(t); }
  UnparentChildOfMouth() { this.game.dropFromMouth(); }

  get taskComplete() { return this.done; }

  update(dt) {
    const d = this.data, g = this.game;
    if (this.shown && !this.done) {
      this.value = Math.max(d.mossSliderMintAmnt, this.value - d.mossSliderDecreaseAmnt * REF_FPS * dt);
      g.ui.setFill('hud', SLIDER, (this.value - d.mossSliderMintAmnt) / (d.mossSliderMaxtAmnt - d.mossSliderMintAmnt));
    }
    // the Animator's "Pull" state (VIBRATE) while the player keeps tapping
    this.pullT = Math.max(0, this.pullT - dt);
    g.fish.forceAnim = this.pullT > 0 ? 'VIBRATE' : null;
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
    // maxItemsCount is 0 in the scene and the list names one ball; the task has three balls and ends at the third drop
    const node = this.game.find(this.path);
    this.max = Math.max(this.data.maxItemsCount, node.children.filter(c => /^Moss Ball/.test(c.name)).length);
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
    if (this.done || this.count < this.max) return;
    this.done = true;
    this.game.events.run(this.data.onMaxItemsCollectedEvent);
    this.game.events.run(this.data.onBothTasksCompletedEvent);
    this.TaskCheck();
  }

  TaskCheck() {
    const t1 = this.game.component(this.data.task1.slice(1).split('#')[0], 'CleanMoss');
    if (this.done && (!t1 || t1.taskComplete)) this.game.complete(false);
  }
}
