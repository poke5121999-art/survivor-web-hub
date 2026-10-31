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
// SplashBGMusic: one looping clip started by the splash and kept across scenes (no level changes it), BGMusic m_Volume 0.4
export const MUSIC = 'audioblocks-robert-frost-iii_educational_birds-full-mix-inst-100bpm_SXk9vUWUv_NWM';
export const MUSIC_VOLUME = 0.4;
const FILTER_HUM = 'zapsplat_household_fishtank_filter_buzz_hum_18539';
// spongefilter/BubbleRisingUnderwater AudioSource: m_Volume 0.5, fully 3D, logarithmic rolloff between 1 and 3.5
const HUM = { volume: 0.5, min: 1, max: 3.5 };
const UI_VOLUME = 0.8; // Manager AudioSource = UIManager.audioSourceForSoundEffects (clicks, complete / fail sounds)
const HINT_SECONDS = 5; // HintManager.TurnHintOnforABit / TurnOnHint: WaitForSeconds(5)
const HINT_CLOSE_SECONDS = 1; // HintManager.TurnOnHint: "close" tween, then WaitForSeconds(1)
const NO_HINT = 'No Hint Available'; // HintManager.TurnOnHint, when the panel text is empty
const POPUP_SECONDS = 3; // UIManager.MissionComplete: ShowCompletePopUpPanel(3, Cash) waits in real time
const POPUP_TIME_SCALE = 0.5; // ShowCompletePopUpPanel: Time.timeScale = 0.5 (until the next scene load)
const DEATH_SECONDS = 2; // PlayerHandler.Death(2), from FloppingFish / FishGetsFood / ThrowSimulation
const SKIP_TAIL = 0.1; // TimelineManager.SkipCutscene: director.time = duration - 0.1
const HUD_FADE = 1; // UIManager.HudFader: CanvasGroup alpha MoveTowards(target, deltaTime)
const HUD_GROUPS = ['Controls', 'GameStatusBtns', 'TaskSpecificControls'];
// CameraManager.DefaultCameraShaker: CinemachineImpulseSource, legacy impulse with the "6D Shake" NoiseSettings
// (sharedassets4), envelope attack 0 / sustain 0.2 / decay 0.7 s, gain = force x |m_DefaultVelocity| (1).
// Each row is one noise octave: [frequency Hz, amplitude] for x, y, z; position in m, orientation in degrees.
const SHAKE_POS = [[3.2, 0.011, 1.9, 0.059, 3.33, 0.021], [7.7, 0.009, 9.1, 0.04, 9.22, 0.009], [51.51, 0.002, 55.54, 0.05, 58.55, 0.017]];
const SHAKE_ROT = [[5.83, 0.09, 1.8, 0.059, 2.38, 0.017], [9.17, 0.14, 11.35, 0.041, 10.52, 0.009], [57.17, 0.15, 54.17, 0.048, 63.76, 0.016]];
const SHAKE_SUSTAIN = 0.2, SHAKE_DECAY = 0.7;
const noise6 = (rows, t, ph, out) => {
  out.set(0, 0, 0);
  rows.forEach((r, k) => {
    out.x += r[1] * Math.sin(2 * Math.PI * r[0] * t + ph[k * 3]);
    out.y += r[3] * Math.sin(2 * Math.PI * r[2] * t + ph[k * 3 + 1]);
    out.z += r[5] * Math.sin(2 * Math.PI * r[4] * t + ph[k * 3 + 2]);
  });
  return out;
};
const moveTowards = (a, b, d) => (Math.abs(b - a) <= d ? b : a + Math.sign(b - a) * d);
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
    this.impulses = [];
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
    this.realTimers = [];
    this.runId = (this.runId || 0) + 1;
    this.hum?.stop();
    // the filter bubbles (playOnAwake off) belong to the scene that a level reload resets; levels 2-5 start them in OnInit
    this.particles.clear(this.particles.at(this.find(parseRef(this.comps.ActivityManager.InstanceManager.bubblesParticle).path), true));
    this.tweens.reset();
    this.triggers.reset();
    this.stage.cine.override = { follow: {}, look: {} };
    // a level is its own scene load in the original: Time.timeScale back to 1 (UIManager.LoadingScene), nothing focused
    Object.assign(this, { state: 'playing', paused: false, tlPaused: false, tl: null, action: null, carried: [], control: true,
      shots: null, driver: null, dirt: 1, swimFx: false, skipIntro: skip, lastHint: 'Hint', hintTimer: 0, levelSkipped: false,
      timeScale: 1, fishHeld: false, impulses: [], focus: { controls: false, status: false, task: false }, groupAlpha: null, hum: null, humOn: false });
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
    this.sound.playMusic(MUSIC, MUSIC_VOLUME);
    this.fadeTo(0, 1, 1); // AS.Fading.Init: FadeOutOnLoad -> DoFading(FromBlack, speed 1, wait 1)
    this.events.run(this.activity.OnInit);
    if (skip && this.tl) this.endTimeline(true);
  }

  stop() {
    this.state = 'menu';
    this.runId++;
    this.hum?.stop();
    this.hum = null;
    this.ui.hide('hud');
    this.ui.hide('letterbox');
    this.nav.enabled = false;
    this.nav.update(this.stage.camera, 1, 1);
    this.instances?.forEach(i => i.dispose?.());
  }

  // WaitForSeconds (scaled by timeScale) and WaitForSecondsRealtime
  after(sec, fn) { this.timers.push({ t: sec, fn }); }
  afterReal(sec, fn) { this.realTimers.push({ t: sec, fn }); }

  setControl(on) {
    this.control = !!on;
    this.refreshControls();
  }

  canSwim() { return this.state === 'playing' && this.control && !this.tl && !this.driver && !this.paused && !this.fishHeld; }

  // ---- HUD --------------------------------------------------------------------------------------------------------
  hud(path, on) { this.ui.setActive('hud', path, on); }
  // CameraManager.CameraShake(force) -> GenerateImpulse(force); m_Randomize gives each impulse its own noise phase
  cameraShake(force) { this.impulses.push({ t: 0, gain: force, ph: Array.from({ length: 9 }, () => Math.random() * 2 * Math.PI) }); }
  applyShake(cam, dt) {
    if (!this.impulses.length) return;
    const p = new THREE.Vector3(), r = new THREE.Vector3(), tp = new THREE.Vector3(), tr = new THREE.Vector3();
    this.impulses = this.impulses.filter(im => (im.t += dt) < SHAKE_SUSTAIN + SHAKE_DECAY);
    for (const im of this.impulses) {
      const env = im.gain * (im.t <= SHAKE_SUSTAIN ? 1 : 1 - (im.t - SHAKE_SUSTAIN) / SHAKE_DECAY);
      p.addScaledVector(noise6(SHAKE_POS, im.t, im.ph, tp), env);
      r.addScaledVector(noise6(SHAKE_ROT, im.t, im.ph, tr), env);
    }
    cam.position.add(p.applyQuaternion(cam.quaternion));
    cam.rotateX(THREE.MathUtils.degToRad(r.x)); cam.rotateY(THREE.MathUtils.degToRad(r.y)); cam.rotateZ(THREE.MathUtils.degToRad(r.z));
  }

  resetHud() {
    const ui = this.ui;
    ui.show('hud');
    ui.show('letterbox');
    ui.setActive('letterbox', 'TimelineUI', false);
    for (const p of [...PANELS, ...TASK_CONTROLS, ...STORE_LINKS]) this.hud(p, false);
    for (const p of [...HUD_GROUPS, 'JumpGoPRomptParent', ...SWIM_CONTROLS, 'Controls/Hint', 'Controls/CameraPad']) this.hud(p, true);
    ui.setText('hud', 'HintPanel_Img/Text (TMP)', this.lastHint);
    ui.setInteractable('hud', H('Controls/Hint'), true);
    // UIManager.Init: ControlsGroup alpha 0, so the controls fade in; the other groups start at their serialized alpha 1
    this.groupAlpha = { Controls: 0, GameStatusBtns: 1, TaskSpecificControls: 1 };
    this.nav.opacity = 1;
    this.hudFader(0);
    this.nav.enabled = true;
    this.textCache = {};
  }

  swimControls(on) { for (const p of SWIM_CONTROLS) this.hud(p, on); }

  refreshControls() { this.nav.enabled = this.state !== 'menu' && !this.tl; }

  // UIManager.HudFader: each HUD CanvasGroup moves to alpha 0 while its focus flag is set (Focus, FocusGameStatusGroup,
  // FocusTaskSpecificControlsGroup) and back to 1 otherwise, at 1/s; a focused group takes no input. The HUD navigation
  // canvas follows the controls flag. PlayerStatus(false) (the player switched off) also takes the controls away here.
  hudFader(dt) {
    const f = this.focus, off = !this.control;
    const want = { Controls: f.controls || off, GameStatusBtns: f.status, TaskSpecificControls: f.task || off };
    for (const g of HUD_GROUPS) {
      this.groupAlpha[g] = moveTowards(this.groupAlpha[g], want[g] ? 0 : 1, dt * HUD_FADE);
      this.ui.groupAlpha('hud', H(g), this.groupAlpha[g], !want[g]);
    }
    this.nav.opacity = moveTowards(this.nav.opacity, f.controls ? 0 : 1, dt * HUD_FADE);
  }

  setFocus(controls, status = controls, task = controls) { Object.assign(this.focus, { controls, status, task }); }

  // HintManager.ChangeHintAndShow (InstanceManager.ShowHintFromInstanceMngr): the text replaces the panel's at once (TypeHint
  // without its typewriter coroutine), the panel shows for 5 s and the Hint button is disabled meanwhile.
  hint(text) {
    if (text == null) return;
    this.lastHint = text;
    this.ui.setText('hud', 'HintPanel_Img/Text (TMP)', text);
    this.openHint(HINT_SECONDS);
  }

  // HintManager.ShowHint (Hint button): whatever the panel holds, "No Hint Available" when empty, for 5 s, then its "close"
  // tween (the panel has none with that id) and 1 s more.
  showHint() {
    if (!this.lastHint) {
      this.lastHint = NO_HINT;
      this.ui.setText('hud', 'HintPanel_Img/Text (TMP)', NO_HINT);
    }
    this.openHint(HINT_SECONDS + HINT_CLOSE_SECONDS);
  }

  openHint(sec) {
    this.hud('HintPanel_Img', true);
    this.ui.setInteractable('hud', H('Controls/Hint'), false);
    this.hintTimer = sec;
  }

  // AS.Fading.FadingNumerator: the Fader jumps to black (mode 0, FromBlack) or clear (mode 1), holds `wait` s, then moves to
  // alpha = mode at `speed`/s, blocking the HUD until it gets there.
  fadeTo(mode, speed = 1, wait = 1) {
    this.fader = { a: mode === 0 ? 1 : 0, to: mode, speed, wait };
    this.ui.fade(this.fader.a);
  }

  get fading() { return !!this.fader; }

  bindHud() {
    const ui = this.ui, input = this.input;
    const hold = (path, name) => ui.onPress('hud', H(path), d => input.hold(name, d));
    const press = (path, name) => ui.onPress('hud', H(path), d => { if (d) input.tap(name); });
    // UIManager's own handlers end in ClickSound on the Manager AudioSource; HintManager.ShowHint, UIManager.SetSkipPanel,
    // the TimelineManager skip buttons and the task buttons play none. The action button plays the pop on its own source.
    const click = (path, fn, volume = UI_VOLUME) => ui.on('hud', H(path), () => { if (volume) this.sound.play(CLICK, { volume }); fn(); });
    hold('Controls/SwimUp-Button', 'up');
    hold('Controls/SwimDown-Button', 'down');
    hold('Controls/Run', 'boost');
    press('TaskSpecificControls/FishJump_TouchBtn', 'jump');
    press('TaskSpecificControls/FloppyFishJump_TouchBtn', 'flop');
    click('TaskSpecificControls/PullMoss_Button', () => input.tap('pull'), 0);
    click('Controls/ActionButton', () => input.tap('action'), 1);
    click('Controls/Hint', () => this.showHint(), 0);
    click('GameStatusBtns/Pause', () => this.pause(true));
    click('GameStatus/PausePanel/Panel/Main Buttons Container/Resume', () => this.pause(false));
    click('GameStatus/PausePanel/Panel/Main Buttons Container/Restart', () => this.start(this.level));
    click('GameStatus/PausePanel/Panel/Main Buttons Container/Home', () => this.onExit());
    click('GameStatusBtns/Skip', () => this.levelSkipPanel(true), 0);
    click('GameStatus/Level Skip/Skjp Panel/Yes/Button', () => this.skipLevel());
    click('GameStatus/Level Skip/Skjp Panel/No', () => this.levelSkipPanel(false), 0);
    click('Timeline/TimelineSkipButton', () => this.cutsceneSkipPanel(true), 0);
    click('Timeline/Skip CutScene/Skjp Panel/Yes/Button', () => this.skipCutscene(), 0);
    click('Timeline/Skip CutScene/Skjp Panel/No', () => this.cutsceneSkipPanel(false), 0);
    click('GameStatus/LevelCompletePanel/Panel/Main Buttons Container/Next', () => this.onNext(this.level));
    click('GameStatus/LevelCompletePanel/Panel/Main Buttons Container/Restart', () => this.start(this.level));
    click('GameStatus/LevelCompletePanel/Panel/Main Buttons Container/Home', () => this.onExit());
    click('GameStatus/LevelFailPanel/Panel/Main Buttons Container/Restart', () => this.start(this.level));
    click('GameStatus/LevelFailPanel/Panel/Main Buttons Container/Home', () => this.onExit());
  }

  // UIManager.Pause: the panel and GameManager.gamePaused (the tasks stop on it); Time.timeScale is left alone.
  pause(on) {
    if (this.state !== 'playing') return;
    this.paused = on;
    this.hud('GameStatus/PausePanel', on);
  }

  // UIManager.SetSkipPanel: the level-skip question stops the game clock (Time.timeScale 0), "No" restarts it.
  levelSkipPanel(on) {
    if (on && this.state !== 'playing') return;
    this.hud('GameStatus/Level Skip', on);
    this.timeScale = on ? 0 : 1;
  }

  // UIManager.Skip: the activity completes with its full Cash (the original shows a rewarded ad first); timeScale stays 0
  // until the complete pop-up sets 0.5.
  skipLevel() {
    this.hud('GameStatus/Level Skip', false);
    this.complete(true);
  }

  // TimelineManager.SetSkip: the question pauses the director only (speed 0) and hides the skip button; "No" resumes.
  cutsceneSkipPanel(on) {
    if (on && !this.tl) return;
    this.tlPaused = on;
    this.hud('Timeline/Skip CutScene', on);
    this.hud('Timeline/TimelineSkipButton', !on && !!this.tl);
  }

  // TimelineManager.SkipCutscene: speed back to 1 and the director jumps to 0.1 s before its end, so the cutscene ends
  // (OnTimelineEnd) on its own a moment later. The skip button stays hidden.
  skipCutscene() {
    this.hud('Timeline/Skip CutScene', false);
    this.tlPaused = false;
    const p = this.tl?.player;
    if (p) p.t = Math.max(p.t, p.duration - SKIP_TAIL);
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
    // AS.TimelineEvents.OnEnable: skip button per SkipAble, TimelineManager.isTimeLine(true) focuses every HUD group
    this.hud('Timeline/TimelineSkipButton', !!ev.SkipAble);
    this.hud('Timeline/Skip CutScene', false);
    this.setFocus(true);
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
    this.setFocus(false);
    this.refreshControls();
    this.events.run(t.ev.OnTimelineEnd);
    this.lastTimeline = { path: t.path, skipped };
  }

  snapCamera() { this.follow.snap(this.fish.focus, this.fish.yaw); }

  // ---- results ----------------------------------------------------------------------------------------------------
  // AS.Activity.ActivityComplete -> UIManager.MissionComplete(Cash), then the activity's OnComplete (NexActivityUnlock).
  // ShowCompletePopUpPanel(3, Cash): pop-up + inGameCompleteSfx, Time.timeScale 0.5, 3 s of real time, then the panel
  // with "X<Cash>", lvlCompleteSound, the controls focused away and GameManager.gamePaused. A skipped level (UIManager.Skip)
  // goes through the same ActivityComplete, full Cash included. Controls and hint stay as they are until then.
  complete(skipped = false) {
    if (this.state !== 'playing') return;
    if (this.tl) this.endTimeline(true);
    this.state = 'complete';
    this.levelSkipped = skipped;
    const cash = this.activity.Cash;
    const um = this.comps.Manager['AS.UIManager'];
    this.hud('GameStatus/CompletePopUpPanel', true);
    this.sound.play(um.inGameCompleteSfx.name, { volume: UI_VOLUME });
    this.timeScale = POPUP_TIME_SCALE;
    this.afterReal(POPUP_SECONDS, () => {
      this.hud('GameStatus/CompletePopUpPanel', false);
      this.hud('GameStatus/LevelCompletePanel', true);
      this.ui.setText('hud', 'GameStatus/LevelCompletePanel/Panel/RewardText_Bg/RewardText (TMP)', `X${cash}`);
      // the original stores TotalCoins = Cash (set_totalCoins without the old total); the web build adds it up
      this.save.addCoins(cash);
      this.sound.play(um.lvlCompleteSound.name, { volume: UI_VOLUME });
      this.focus.controls = true;
      this.paused = true;
    });
    this.events.run(this.activity.OnComplete);
    this.save.markDone(this.level);
  }

  unlockNext() { this.save.unlock(this.level + 1); }

  // PlayerHandler.Death(2): death vcam and global volume on, death sfx, "WASTED", Animator "Death" (JUMP, then FlopJump
  // held). 2 s later they go off and ActivityManager.CurrentActivityFailed -> UIManager.MissionFailed: the fail panel,
  // lvlFailedSound, the controls focused away, gamePaused; then the activity's OnFailed.
  die() {
    if (this.state !== 'playing') return;
    this.state = 'dead';
    this.driver = null;
    const ph = this.comps.Player.PlayerHandler;
    const vol = ph.deathGlobalVolume && parseRef(ph.deathGlobalVolume).path;
    this.fish.once('JUMP');
    this.fish.anim('FlopJump');
    this.hud('GameStatus/Wasted Text', true);
    if (vol) this.setActive(vol, true);
    const before = this.shots;
    this.shots = [{ path: parseRef(ph.deathVcam).path, weight: 1 }];
    this.sound.play(ph.deathSfx.name);
    this.after(DEATH_SECONDS, () => {
      this.hud('GameStatus/Wasted Text', false);
      if (vol) this.setActive(vol, false);
      this.shots = before;
      this.hud('GameStatus/LevelFailPanel', true);
      this.sound.play(this.comps.Manager['AS.UIManager'].lvlFailedSound.name, { volume: UI_VOLUME });
      this.focus.controls = true;
      this.paused = true;
      this.events.run(this.activity.OnFailed);
    });
  }

  // InstanceManager.AquariumSound: the filter hum starts the first time the bubble system emits and loops from then on.
  // Its AudioSource is 3D with logarithmic rolloff: gain min / distance, held between minDistance and maxDistance.
  aquariumSound() {
    if (!this.humOn) {
      const bubbles = this.find(parseRef(this.comps.ActivityManager.InstanceManager.bubblesParticle).path);
      if (!bubbles || !this.particles.at(bubbles, true).some(e => e.emitting)) return;
      this.humOn = true;
      const run = this.runId;
      this.sound.play(FILTER_HUM, { loop: true, volume: 0 }).then(h => { if (run === this.runId) this.hum = h; else h?.stop(); });
      this.humAt = bubbles;
    }
    if (!this.hum) return;
    const d = this.stage.camera.getWorldPosition(new THREE.Vector3()).distanceTo(this.humAt.getWorldPosition(new THREE.Vector3()));
    this.hum.gain.value = HUM.volume * HUM.min / THREE.MathUtils.clamp(d, HUM.min, HUM.max);
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
    for (const t of [...this.realTimers]) if ((t.t -= dt) <= 0) { this.realTimers.splice(this.realTimers.indexOf(t), 1); t.fn(); }
    dt *= this.timeScale; // Time.timeScale: 0 under the level-skip question, 0.5 from the complete pop-up on
    this.time += dt;
    for (const t of [...this.timers]) if ((t.t -= dt) <= 0) { this.timers.splice(this.timers.indexOf(t), 1); t.fn(); }
    if (this.tl && !this.tlPaused && this.tl.player.update(dt)) this.endTimeline(false);
    this.tweens.update(dt);
    this.particles.update(dt);
    // the task components skip their work while GameManager.gamePaused is set
    if (!this.paused) for (const inst of this.instances.values()) if (inst.update && this.isActive(inst.path)) inst.update(dt);
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
    if (this.hintTimer > 0 && (this.hintTimer -= dt) <= 0) {
      this.hud('HintPanel_Img', false);
      this.ui.setInteractable('hud', H('Controls/Hint'), true);
    }
    const f = this.fader;
    if (f) {
      if (f.wait > 0) f.wait -= dt;
      else {
        f.a = moveTowards(f.a, f.to, dt * f.speed);
        if (f.a === f.to) this.fader = null;
      }
      this.ui.fade(f.a);
    }
    this.hudFader(dt);
    this.aquariumSound();
    const frozen = dt === 0;
    const cam = this.stage.camera;
    const look = this.input.look();
    if (this.tl) { /* the timeline's Cinemachine track drives the camera */ } else if (this.shots) this.stage.cine.apply(cam, this.shots, frozen ? 0 : dt);
    else {
      const clamp = this.inTank(this.fish.bodyCenter()) ? this.camBox : null;
      this.follow.update(cam, this.fish.focus, frozen ? { dx: 0, dy: 0 } : look, frozen ? 0 : dt, clamp);
    }
    this.applyShake(cam, dt);
    const r = this.stage.renderer.domElement;
    this.nav.update(cam, r.clientWidth, r.clientHeight);
  }
}
