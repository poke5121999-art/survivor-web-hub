// Level runner: one AS.Activity (ActivityManager/Activities/Level N) at a time on the shared FishEnv scene. Runs its
// OnInit events, plays timelines (letterbox, skip panel), updates the gameplay components, player, triggers, tweens,
// cameras and HUD, and ends in the complete / fail panels. Starting a level restores the scene to its load state.
import * as THREE from 'three';
import { TimelinePlayer } from './timeline.js';
import { Events } from './events.js';
import { Triggers } from './triggers.js';
import { Tweens } from './tween3d.js';
import { Fish, FollowCam } from './fish.js';
import { NavMarkers } from './hudnav.js';
import { CORE } from './components.js';
import { TASKS } from './tasks/index.js';
import { activeInHierarchy, shortType, BoxVolume, parseRef } from './unity.js';

export const levelPath = n => `ActivityManager/Activities/Level ${n}`;
const H = p => `CF2-Canvas/CF2-Panel/${p}`; // hud node paths as ui.js names them
const CLICK = 'mouth-pop-1_z1M9vz4u_NWM';
const AMBIENCE = 'audioblocks-robert-frost-iii_educational_birds-full-mix-inst-100bpm_SXk9vUWUv_NWM';
const FILTER_HUM = 'zapsplat_household_fishtank_filter_buzz_hum_18539';
const HINT_SECONDS = 5;
const SWIM_FX_SPEED = 0.8; // fraction of top speed that shows the swim wake
const SWIM_CONTROLS = ['Controls/Joystick-Region (LeftRightForward)', 'Controls/SwimUp-Button', 'Controls/SwimDown-Button', 'Controls/Run'];
const TASK_CONTROLS = ['TaskSpecificControls/PullMoss_Button', 'TaskSpecificControls/HungerSlider', 'TaskSpecificControls/FishJump_TouchBtn',
  'TaskSpecificControls/JumpNow_Txt', 'TaskSpecificControls/FoodCollected_Slider', 'TaskSpecificControls/HP_Bg_Image',
  'TaskSpecificControls/FloppyFishJump_TouchBtn', 'TaskSpecificControls/FloppyFish_CameraPad'];
// rate-us links of the original store build are left out
const STORE_LINKS = ['GameStatus/LevelCompletePanel/Panel/RateUs_Button', 'GameStatus/PausePanel/Panel/RateUs_Button'];
const PANELS = ['GameStatus/CompletePopUpPanel', 'GameStatus/Wasted Text', 'GameStatus/LevelCompletePanel', 'GameStatus/LevelFailPanel',
  'GameStatus/PausePanel', 'GameStatus/Level Skip', 'Timeline/Skip CutScene', 'Timeline/TimelineSkipButton', 'HintPanel_Img',
  'Controls/ActionButton', 'JumpGoPRomptParent/JumpGoPrompt', 'DialgogueSystem', 'Loading'];

export class Game {
  constructor({ stage, ui, sound, input, comps, save, particles, fxLayer, onExit, onNext }) {
    Object.assign(this, { stage, ui, sound, input, comps, save, particles, onExit, onNext });
    this.fx = fxLayer;
    this.classes = { ...CORE, ...TASKS };
    this.find = p => stage.find(p);
    this.objects = [...stage.env.objects, ...stage.player.objects];
    this.snapshot = this.objects.map(o => ({ o, parent: o.parent, p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone(), v: o.visible }));
    this.compPaths = Object.keys(comps);
    this.events = new Events(this);
    this.triggers = new Triggers(stage.env, comps, this.events);
    this.tweens = new Tweens(this.find);
    this.fish = new Fish(stage, comps);
    this.follow = new FollowCam(stage.vcams['MainCamera/CameraStateManager/CM vcam1']);
    this.nav = new NavMarkers(stage.env.objects, fxLayer);
    this.dynamic = new THREE.Group();
    this.dynamic.name = 'dynamic';
    stage.scene.add(this.dynamic);
    this.state = 'menu';
    this.time = 0;
    this.textCache = {};
    this.bindHud();
  }

  // ---- scene state ------------------------------------------------------------------------------------------------
  pathOf(o) {
    const s = [];
    for (let a = o; a && !a.name.startsWith('scene:'); a = a.parent) s.unshift(a.name);
    return s.join('/');
  }

  restore() {
    for (const r of this.snapshot) {
      if (r.o.parent !== r.parent) r.parent.add(r.o);
      r.o.position.copy(r.p);
      r.o.quaternion.copy(r.q);
      r.o.scale.copy(r.s);
      r.o.visible = r.v;
    }
    this.dynamic.clear();
    // the room ships inactive; the game enables it once the Controller scene is in (see stage.js)
    this.find('*****FISHENV*****').visible = true;
  }

  component(path, type) {
    const key = `${path}#${type}`;
    if (this.instances.has(key)) return this.instances.get(key);
    const C = this.classes[type];
    if (!C) return null;
    const block = Object.entries(this.comps[path] || {}).find(([k]) => shortType(k) === type);
    const inst = new C(this, path, block ? block[1] : {});
    this.instances.set(key, inst);
    return inst;
  }

  isActive(path) { const o = this.find(path); return !!o && activeInHierarchy(o); }

  // GameObject.SetActive with Unity's side effects: OnEnable/OnDisable of the components below, DOTween autoPlay.
  setActive(target, on) {
    const obj = typeof target === 'string' ? this.find(target) : target;
    if (!obj) return;
    const was = activeInHierarchy(obj);
    obj.visible = !!on;
    const now = activeInHierarchy(obj);
    if (was === now) return;
    const p = this.pathOf(obj);
    for (const cp of this.compPaths) {
      if (cp !== p && !cp.startsWith(p + '/')) continue;
      const o = this.find(cp);
      if (!o || (now && !activeInHierarchy(o))) continue;
      for (const t of Object.keys(this.comps[cp])) {
        const C = this.classes[shortType(t)];
        if (!C || !(now ? C.prototype.onEnable : C.prototype.onDisable)) continue;
        const inst = this.component(cp, shortType(t));
        now ? inst.onEnable() : inst.onDisable();
      }
    }
    if (now) this.tweens.autoPlay(obj);
  }

  // ParticleSystem.Play on a scene system (its emitters and its children's, as Unity's Play(withChildren) does)
  particle(path) {
    const o = this.find(path);
    if (!o) return;
    o.visible = true;
    this.particles.play(this.particles.at(o, true));
  }

  // One-shot prefab effect (FeedFish.crunchParticle, flop, splash, dust) at a world position.
  spawnFx(prefab, position) {
    const key = `prefab:${prefab.f}:${prefab.id}`;
    if (this.particles.resolve(key)) this.particles.spawn(key, { position });
  }

  // A scene system played by hand (playOnAwake off or taken over by gameplay).
  playFx(path) { const o = this.find(path); if (o) this.particles.play(this.particles.at(o, true)); }

  tween(path, op, id) {
    if (op === 'playById') this.tweens.playById(path, id);
    else this.tweens[op](path);
  }

  // UnityEvents aimed at the HUD canvas (EventTriggers on its panels).
  uiCall(path, key, arg) {
    const p = path.replace(/^CF2-Canvas\/CF2-Panel\//, '');
    if (key === 'GameObject.SetActive') this.ui.setActive('hud', p, !!arg);
    else if (key.startsWith('DOTweenAnimation.')) this.ui.tween('hud', p);
  }

  // ---- level lifecycle --------------------------------------------------------------------------------------------
  start(n, { skip = false } = {}) {
    this.level = n;
    this.path = levelPath(n);
    this.activity = this.comps[this.path]['AS.Activity'];
    this.instances?.forEach(i => i.dispose?.());
    this.restore();
    this.instances = new Map();
    this.timers = [];
    this.tweens.reset();
    this.triggers.reset();
    this.stage.cine.override = { follow: {}, look: {} };
    Object.assign(this, { state: 'playing', paused: false, tlPaused: false, tl: null, action: null, carried: [], control: true,
      shots: null, driver: null, dirt: 1, swimFx: false, skipIntro: skip, lastHint: '', hintTimer: 0, levelSkipped: false });
    this.input.clearListeners();
    this.input.on('action', () => this.doAction());
    this.nav.extra.clear();
    for (const sp of this.particles.spawns) this.particles.clear(sp.list);
    this.nav.opacity = 1;
    this.resetHud();
    this.fish.reset();
    this.fish.root.visible = true;
    this.computeBounds();
    this.fish.align(this.find(parseRef(this.activity.PlayerInitPosition).path));
    this.snapCamera();
    this.tweens.autoPlay(this.stage.env.root);
    this.sound.playMusic(AMBIENCE, 0.25);
    this.hum?.stop();
    this.sound.play(FILTER_HUM, { loop: true, volume: 0.15 }).then(h => { this.hum = h; });
    this.fade(0);
    this.events.run(this.activity.OnInit);
    if (skip && this.tl) this.endTimeline(true);
  }

  stop() {
    this.state = 'menu';
    this.hum?.stop();
    this.hum = null;
    this.ui.hide('hud');
    this.ui.hide('letterbox');
    this.nav.enabled = false;
    this.nav.update(this.stage.camera, 1, 1);
    this.instances?.forEach(i => i.dispose?.());
  }

  after(sec, fn) { this.timers.push({ t: sec, fn }); }

  setControl(on) {
    this.control = !!on;
    this.refreshControls();
  }

  canSwim() { return this.state === 'playing' && this.control && !this.tl && !this.driver && !this.paused; }

  // ---- HUD --------------------------------------------------------------------------------------------------------
  hud(path, on) { this.ui.setActive('hud', path, on); }

  resetHud() {
    const ui = this.ui;
    ui.show('hud');
    ui.show('letterbox');
    ui.setActive('letterbox', 'TimelineUI', false);
    for (const p of [...PANELS, ...TASK_CONTROLS, ...STORE_LINKS]) this.hud(p, false);
    for (const p of ['Controls', 'GameStatusBtns', 'TaskSpecificControls', 'JumpGoPRomptParent', ...SWIM_CONTROLS, 'Controls/Hint', 'Controls/CameraPad']) this.hud(p, true);
    this.nav.enabled = true;
    this.textCache = {};
  }

  swimControls(on) { for (const p of SWIM_CONTROLS) this.hud(p, on); }

  refreshControls() {
    const live = this.state === 'playing' && !this.tl;
    this.hud('Controls', live && this.control);
    this.hud('GameStatusBtns', live);
    this.hud('TaskSpecificControls', live && this.control);
    this.nav.enabled = live;
  }

  hint(text) {
    if (!text) return;
    this.lastHint = text;
    this.ui.setText('hud', 'HintPanel_Img/Text (TMP)', text);
    this.hud('HintPanel_Img', true);
    this.hintTimer = HINT_SECONDS;
  }

  fade(a) { this.ui.fade(a); this.fadeAnim = null; }
  fadeFromBlack(sec) { this.ui.fade(1); this.fadeAnim = { t: 0, dur: sec }; }

  bindHud() {
    const ui = this.ui, input = this.input;
    const hold = (path, name) => ui.onPress('hud', H(path), d => input.hold(name, d));
    const press = (path, name) => ui.onPress('hud', H(path), d => { if (d) input.tap(name); });
    const click = (path, fn) => ui.on('hud', H(path), () => { this.sound.play(CLICK); fn(); });
    hold('Controls/SwimUp-Button', 'up');
    hold('Controls/SwimDown-Button', 'down');
    hold('Controls/Run', 'boost');
    press('TaskSpecificControls/FishJump_TouchBtn', 'jump');
    press('TaskSpecificControls/FloppyFishJump_TouchBtn', 'flop');
    click('TaskSpecificControls/PullMoss_Button', () => input.tap('pull'));
    click('Controls/ActionButton', () => input.tap('action'));
    click('Controls/Hint', () => this.hint(this.lastHint));
    click('GameStatusBtns/Pause', () => this.pause(true));
    click('GameStatus/PausePanel/Panel/Main Buttons Container/Resume', () => this.pause(false));
    click('GameStatus/PausePanel/Panel/Main Buttons Container/Restart', () => this.start(this.level));
    click('GameStatus/PausePanel/Panel/Main Buttons Container/Home', () => this.onExit());
    click('GameStatusBtns/Skip', () => { this.paused = true; this.hud('GameStatus/Level Skip', true); });
    click('GameStatus/Level Skip/Skjp Panel/Yes/Button', () => { this.hud('GameStatus/Level Skip', false); this.paused = false; this.complete(true); });
    click('GameStatus/Level Skip/Skjp Panel/No', () => { this.hud('GameStatus/Level Skip', false); this.paused = false; });
    click('Timeline/TimelineSkipButton', () => { if (!this.tl) return; this.tlPaused = true; this.hud('Timeline/Skip CutScene', true); });
    click('Timeline/Skip CutScene/Skjp Panel/Yes/Button', () => { this.hud('Timeline/Skip CutScene', false); this.tlPaused = false; if (this.tl) this.endTimeline(true); });
    click('Timeline/Skip CutScene/Skjp Panel/No', () => { this.hud('Timeline/Skip CutScene', false); this.tlPaused = false; });
    click('GameStatus/LevelCompletePanel/Panel/Main Buttons Container/Next', () => this.onNext(this.level));
    click('GameStatus/LevelCompletePanel/Panel/Main Buttons Container/Restart', () => this.start(this.level));
    click('GameStatus/LevelCompletePanel/Panel/Main Buttons Container/Home', () => this.onExit());
    click('GameStatus/LevelFailPanel/Panel/Main Buttons Container/Restart', () => this.start(this.level));
    click('GameStatus/LevelFailPanel/Panel/Main Buttons Container/Home', () => this.onExit());
  }

  pause(on) {
    if (this.state !== 'playing') return;
    this.paused = on;
    this.hud('GameStatus/PausePanel', on);
  }

  // AS.ButtonEventsAssign: the action button belongs to the trigger the player is in.
  assignAction(assigner) {
    this.action = assigner;
    this.hud('Controls/ActionButton', true);
  }

  doAction() {
    const a = this.action;
    if (!a || this.state !== 'playing') return;
    this.action = null;
    this.hud('Controls/ActionButton', false);
    a.click();
  }

  // ---- carrying (CleanMoss / CountCollectedItems MakeChildOFMouth / UnparentChildOfMouth) ---------------------------
  attachToMouth(t) {
    if (!t) return;
    this.fish.mouth.attach(t);
    t.position.set(0, 0, 0);
    this.carried.push(t);
  }

  dropFromMouth() {
    const t = this.carried.pop();
    if (!t) return null;
    this.stage.env.root.attach(t);
    return t;
  }

  // ---- timelines --------------------------------------------------------------------------------------------------
  playTimeline(controllerPath) {
    const def = this.stage.timelines[controllerPath];
    if (!def) { console.warn('[fish-bowl] timeline not found', controllerPath); return; }
    if (this.tl) this.endTimeline(true);
    const group = controllerPath.endsWith('/Controller') ? controllerPath.slice(0, -'/Controller'.length) : controllerPath;
    const ev = this.comps[`${group}/Events`]?.['AS.TimelineEvents'] || {};
    const ui = this.ui;
    const ctx = {
      ...this.stage,
      find: p => (p.startsWith('Canvas/') ? null : this.stage.find(p)),
      ui: {
        text: (p, s) => {
          const key = p.endsWith('TimelineText') ? 'TimelineText' : 'SubtitlesText';
          if (this.textCache[key] === s) return;
          this.textCache[key] = s;
          ui.setText('letterbox', key, s);
        },
        uiTrack: (p, prop, v) => { if (prop === 'scale') ui.el('letterbox', p.split('/').pop()).style.scale = `${v[0]} ${v[1]}`; },
      },
      sound: this.sound,
      rigs: new Map(),
    };
    this.tl = { player: new TimelinePlayer(def, ctx), ev, path: controllerPath };
    this.tlPaused = false;
    this.fish.root.visible = false; // TimelineController.SetPlayer: the cutscene has its own fish
    ui.setActive('letterbox', 'TimelineUI', true);
    this.hud('Timeline/TimelineSkipButton', !!ev.SkipAble);
    this.hud('HintPanel_Img', false);
    this.refreshControls();
    this.events.run(ev.OnTimelineStart);
    this.tl.player.start();
  }

  endTimeline(skipped) {
    const t = this.tl;
    if (!t) return;
    this.tl = null;
    t.player.finish();
    this.ui.setActive('letterbox', 'TimelineUI', false);
    this.ui.setText('letterbox', 'SubtitlesText', '');
    this.ui.setText('letterbox', 'TimelineText', '');
    this.textCache = {};
    this.hud('Timeline/TimelineSkipButton', false);
    this.hud('Timeline/Skip CutScene', false);
    this.fish.root.visible = true;
    this.snapCamera();
    this.refreshControls();
    this.events.run(t.ev.OnTimelineEnd);
    this.lastTimeline = { path: t.path, skipped };
  }

  snapCamera() { this.follow.snap(this.fish.focus, this.fish.yaw); }

  // ---- results ----------------------------------------------------------------------------------------------------
  complete(skipped) {
    if (this.state !== 'playing') return;
    if (this.tl) this.endTimeline(true);
    this.state = 'complete';
    this.levelSkipped = skipped;
    const cash = skipped ? 0 : this.activity.Cash;
    this.events.run(this.activity.OnComplete);
    this.save.addCoins(cash);
    this.save.markDone(this.level);
    this.refreshControls();
    this.hud('Controls/ActionButton', false);
    this.hud('HintPanel_Img', false);
    const um = this.comps.Manager['AS.UIManager'];
    this.sound.play(um.inGameCompleteSfx.name);
    this.hud('GameStatus/CompletePopUpPanel', true);
    this.after(1.6, () => {
      this.hud('GameStatus/CompletePopUpPanel', false);
      this.ui.setText('hud', 'GameStatus/LevelCompletePanel/Panel/RewardText_Bg/RewardText (TMP)', `${cash}`);
      this.hud('GameStatus/LevelCompletePanel', true);
      this.sound.play(um.lvlCompleteSound.name, { volume: 0.7 });
    });
  }

  unlockNext() { this.save.unlock(this.level + 1); }

  // PlayerHandler death: "WASTED", death camera, sound, then the fail panel.
  die() {
    if (this.state !== 'playing') return;
    this.state = 'dead';
    this.driver = null;
    this.refreshControls();
    this.hud('Controls/ActionButton', false);
    const ph = this.comps.Player.PlayerHandler;
    this.fish.once('JUMP');
    this.fish.anim('FlopIdle');
    this.hud('GameStatus/Wasted Text', true);
    this.shots = [{ path: ph.deathVcam.slice(1).split('#')[0], weight: 1 }];
    this.sound.play(ph.deathSfx.name);
    this.after(2.5, () => {
      this.hud('GameStatus/Wasted Text', false);
      this.hud('GameStatus/LevelFailPanel', true);
      this.sound.play(this.comps.Manager['AS.UIManager'].lvlFailedSound.name, { volume: 0.7 });
    });
  }

  // CharacterFx.SwimParticle (Player/Fx/waterSplashBack): the wake behind the fish while it swims fast.
  swimTrail() {
    const fast = this.canSwim() && this.fish.vel.length() > this.fish.speed * SWIM_FX_SPEED;
    if (fast === this.swimFx) return;
    this.swimFx = fast;
    const o = this.find('Player/Fx');
    if (fast) { o.visible = true; this.particles.play(this.particles.at(o, true)); } else this.particles.stop(this.particles.at(o, true));
  }

  // ---- tank bounds ------------------------------------------------------------------------------------------------
  computeBounds() {
    if (this.fish.bounds) return;
    const env = this.stage.env.root;
    env.updateMatrixWorld(true);
    // inner water volume = the Water box collider (x, z extents; its y is the surface)
    const water = this.find('*****FISHENV*****/Water');
    const wv = new BoxVolume(water, water.userData.node.k.BoxCollider);
    const c = wv.worldCenter();
    const box = new THREE.Box3(c.clone().sub(wv.half), c.clone().add(wv.half));
    const top = c.y;
    // sand height field sampled once by ray casts
    const sand = this.find('*****FISHENV*****/Aquarium/AquariumSand');
    const ray = new THREE.Raycaster();
    const step = 1;
    const nx = Math.ceil((box.max.x - box.min.x) / step) + 1, nz = Math.ceil((box.max.z - box.min.z) / step) + 1;
    const h = new Float32Array(nx * nz);
    const down = new THREE.Vector3(0, -1, 0);
    let low = Infinity;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      ray.set(new THREE.Vector3(box.min.x + i * step, top + 1, box.min.z + j * step), down);
      const hit = ray.intersectObject(sand, true)[0];
      h[i * nz + j] = hit ? hit.point.y : NaN;
      if (hit) low = Math.min(low, hit.point.y);
    }
    for (let k = 0; k < h.length; k++) if (Number.isNaN(h[k])) h[k] = low;
    const floor = (x, z) => {
      const fi = THREE.MathUtils.clamp((x - box.min.x) / step, 0, nx - 1), fj = THREE.MathUtils.clamp((z - box.min.z) / step, 0, nz - 1);
      const i = Math.min(nx - 2, Math.floor(fi)), j = Math.min(nz - 2, Math.floor(fj));
      const u = fi - i, v = fj - j;
      const a = h[i * nz + j], b = h[(i + 1) * nz + j], cc = h[i * nz + j + 1], d = h[(i + 1) * nz + j + 1];
      return (a * (1 - u) + b * u) * (1 - v) + (cc * (1 - u) + d * u) * v;
    };
    // rocks and mushrooms block the fish roughly as boxes (shrunk: a rock is rounder than its box)
    const obstacles = [];
    for (const o of this.find('*****FISHENV*****/Aquarium').children) {
      if (!/^(Rock|mush)/.test(o.name) || !o.visible) continue;
      const b = new THREE.Box3().setFromObject(o);
      const s = b.getSize(new THREE.Vector3()).multiplyScalar(0.12);
      b.min.add(s); b.max.sub(s);
      obstacles.push(b);
    }
    this.fish.bounds = { box, floor, top, obstacles };
    this.tank = box.clone();
    this.tank.min.y = low - 0.5;
    this.camBox = new THREE.Box3(new THREE.Vector3(box.min.x + 0.2, low + 0.3, box.min.z + 0.2), new THREE.Vector3(box.max.x - 0.2, top - 0.15, box.max.z - 0.2));
  }

  inTank(p) { return !!this.tank && this.tank.containsPoint(p); }

  // ---- frame ------------------------------------------------------------------------------------------------------
  update(dt) {
    if (this.state === 'menu') return;
    const frozen = this.paused || this.tlPaused;
    if (!frozen) {
      this.time += dt;
      for (const t of [...this.timers]) if ((t.t -= dt) <= 0) { this.timers.splice(this.timers.indexOf(t), 1); t.fn(); }
      if (this.tl && this.tl.player.update(dt)) this.endTimeline(false);
      this.tweens.update(dt);
      this.particles.update(dt);
      for (const inst of this.instances.values()) if (inst.update && this.isActive(inst.path)) inst.update(dt);
      if (this.canSwim()) this.fish.swim(dt, this.input, this.follow.yaw);
      else if (this.driver) this.driver.drive(dt);
      else this.fish.animate(dt);
      this.swimTrail();
      if (!this.tl && this.fish.root.visible && this.state === 'playing') {
        const c = this.fish.bodyCenter();
        this.triggers.update(c, this.fish.radius);
        if (this.action) {
          const tp = this.action.path;
          if (!this.triggers.contains(tp, c, this.fish.radius)) { this.action = null; this.hud('Controls/ActionButton', false); }
        }
      }
      if (this.hintTimer > 0 && (this.hintTimer -= dt) <= 0) this.hud('HintPanel_Img', false);
      if (this.fadeAnim) {
        const f = this.fadeAnim;
        f.t += dt;
        this.ui.fade(Math.max(0, 1 - f.t / f.dur));
        if (f.t >= f.dur) this.fadeAnim = null;
      }
    }
    const cam = this.stage.camera;
    const look = this.input.look();
    if (this.tl) { /* the timeline's Cinemachine track drives the camera */ } else if (this.shots) this.stage.cine.apply(cam, this.shots, frozen ? 0 : dt);
    else {
      const clamp = this.inTank(this.fish.bodyCenter()) ? this.camBox : null;
      this.follow.update(cam, this.fish.focus, frozen ? { dx: 0, dy: 0 } : look, frozen ? 0 : dt, clamp);
    }
    const r = this.stage.renderer.domElement;
    this.nav.update(cam, r.clientWidth, r.clientHeight);
  }
}
