// Screen flow: splash (loading) -> menu (Play, Settings: volume + invert vertical) -> level select (5 cards, locked
// until the previous level is done) -> a level (game.js) -> complete / fail panels -> next level or back to the menu.
// Dev: ?level=N&skip=1 starts level N with its intro cutscene skipped. window.__fb exposes state for tests.
import { createStage } from './stage.js';
import { UI } from './ui.js';
import { Sound } from './sound.js';
import { Input } from './input.js';
import { Game, MUSIC, MUSIC_VOLUME } from './game.js';
import { Save, LEVELS } from './save.js';
import { Particles, autoAttach } from './particles.js';

const q = new URLSearchParams(location.search);
const json = p => fetch(`${p}?v=${window.FB_REV || ''}`).then(r => r.json());
const CLICK = 'mouth-pop-1_z1M9vz4u_NWM';
const SPLASH_SECONDS = 10; // Splash.DelaySplash: WaitForSeconds(10) before the MainMenu scene loads
const SETTINGS = 'SettingsPanel_BG_Img';
const VOLUME = 'SettingsPanel_BG_Img/SettingsPanel/VolumeSlider';
const INVERT = 'SettingsPanel_BG_Img/SettingsPanel/InvertControlsToggle';
const LEVEL_PLAY = 'Footer/Play_Button';

let screen = 'splash';
let game, ui, sound, save, input, stage, layout;
let gameAssets = null; // what a level needs on top of the menu: lightmaps (the room is unlit without them), HUD sprites

const loadImage = name => new Promise(res => { const i = new Image(); i.onload = i.onerror = res; i.src = `art/ui/sprites/${name}.webp`; });
const spritesOf = keys => [...new Set(keys.flatMap(k => layout.screens[k].nodes.map(n => n.image && n.image.sprite).filter(Boolean)))];

async function boot() {
  const t0 = performance.now();
  layout = await json('art/ui/layout.json');
  ui = new UI(document.getElementById('ui'), layout, { spriteBase: 'art/ui/sprites/' });
  ui.show('splash');
  const dev = +q.get('level') >= 1 && +q.get('level') <= LEVELS;
  // The splash stays until everything the next screen draws is in: the stage and data, and the menu + level select
  // sprites and font (or, for a direct ?level= start, the HUD sprites and lightmaps). No time cap, so the menu never
  // shows bare on a slow line; the percentage counts finished files. The original splash also holds 10 s at least.
  const sprites = spritesOf(dev ? ['splash', 'hud', 'letterbox'] : ['splash', 'menu', 'levels']);
  let stageP = 0, spritesDone = 0, extraDone = 0;
  const extra = 2; // font + lightmaps (dev) or font + data files
  const progress = () => {
    const files = (stageP * 7 + spritesDone + extraDone) / (7 + sprites.length + extra);
    const p = dev ? files : Math.min(files, (performance.now() - t0) / 1000 / SPLASH_SECONDS);
    ui.setText('splash', 'LoadingPanel/Text', `LOADING ${Math.floor(p * 100)}%`);
    return p;
  };
  const tick = setInterval(progress, 100);
  const count = p => p.then(v => { extraDone++; return v; });
  const [st, comps, controllers, fxDefs] = await Promise.all([
    createStage(document.getElementById('c'), { onProgress: p => { stageP = p; } }),
    json('data/components.json'), json('art/anim/controllers.json'), count(json('data/particles.json')),
    ...sprites.map(s => loadImage(s).then(() => { spritesDone++; })),
    count(document.fonts ? document.fonts.load("40px 'Plumpfull'") : Promise.resolve()),
  ]);
  stage = st;
  gameAssets = Promise.all([stage.lightmapsReady, ...spritesOf(['hud', 'letterbox']).map(loadImage)]);
  if (dev) await gameAssets;
  while (!dev && progress() < 1) await new Promise(r => setTimeout(r, 100));
  clearInterval(tick);
  ui.setText('splash', 'LoadingPanel/Text', 'LOADING 100%');
  save = new Save();
  sound = new Sound('./art/sfx', stage.sfx);
  sound.setVolume(save.d.volume);
  input = new Input();
  input.ui = ui;
  const particles = new Particles(fxDefs, { texBase: 'art/tex' });
  autoAttach(stage, particles);
  game = new Game({ stage, ui, sound, input, comps, save, particles, fxLayer: document.getElementById('fx'),
    onExit: () => { game.stop(); menu(); }, onNext: next });
  game.controllers = controllers;
  game.follow.invert = !!save.d.invert;
  bindMenus();
  loop();
  if (dev) play(+q.get('level'), { skip: q.get('skip') === '1' });
  else menu();
  stage.ready.then(() => { window.__fb.texturesReady = true; });
}

function click(key, path, fn) { ui.on(key, path, () => { sound.play(CLICK); fn(); }); }

function bindMenus() {
  click('menu', 'Play_Button', levels);
  click('menu', 'Settings_Btn', () => settings(true));
  click('menu', `${SETTINGS}/SettingsPanel/Cross_Btn`, () => settings(false));
  // store / ads links of the original (AddsCalling.ShowRating / MoreGames, Application.OpenURL) are not part of the web
  // build; nothing else reads them
  for (const p of ['Footer/RateUs_Button', 'Footer/MoreGames_Button', 'Footer/PrivacyPolicy_Button']) ui.setActive('menu', p, false);
  ui.setActive('levels', 'Footer/RateUs_Button', false);
  // The original toggle only writes the "InvertControls" pref (GameManager.InvertControls is empty), so its camera never
  // inverts; the web build keeps a working toggle, off by default like the camera of the original.
  ui.on('menu', INVERT, () => {
    save.set('invert', !save.d.invert);
    game.follow.invert = save.d.invert;
    ui.setActive('menu', `${INVERT}/Background/Checkmark`, save.d.invert);
  });
  // SplashBGMusic.VolumeSlider: the menu volume slider is AudioListener.volume (pref "Volume", default 1)
  const vol = ui.el('menu', VOLUME);
  vol.classList.add('fb-btn');
  let drag = null;
  const setVol = e => {
    const b = vol.getBoundingClientRect();
    const v = Math.max(0, Math.min(1, (e.clientX - b.left) / b.width));
    save.set('volume', v);
    sound.setVolume(v);
    ui.setFill('menu', VOLUME, v);
  };
  vol.addEventListener('pointerdown', e => { drag = e.pointerId; vol.setPointerCapture(drag); setVol(e); });
  vol.addEventListener('pointermove', e => { if (e.pointerId === drag) setVol(e); });
  vol.addEventListener('pointerup', () => { drag = null; });

  // LevelSelectionManager (useScrollView off): Left / Right step through the cards with wrap-around (CheckLevelStatus),
  // the Play button is interactable only on a card up to UnlockLevel. The cards themselves have no click.
  let cur = 1;
  const pick = n => {
    cur = n;
    ui.selectLevel(n);
    ui.setInteractable('levels', LEVEL_PLAY, n <= save.unlocked);
  };
  click('levels', 'Left_Btn', () => pick(((cur + LEVELS - 2) % LEVELS) + 1));
  click('levels', 'Right_Btn', () => pick((cur % LEVELS) + 1));
  click('levels', 'Back_Button', menu);
  // The original wires Play to Levels(0) when the scene opens (AssignPlayButtonEvent(0)) and to the shown card only after
  // an arrow press; the web build always plays the card on screen.
  click('levels', LEVEL_PLAY, () => { if (cur <= save.unlocked) play(cur); });
  click('levels', 'Tutorial/Play', () => play(1));
  levels.pick = pick;
}

// MainMenuManager.Settings: the panel only (no pause in the menu)
function settings(on) {
  ui.setActive('menu', SETTINGS, on);
  if (!on) return;
  ui.setActive('menu', INVERT, true);
  ui.setActive('menu', `${INVERT}/Background/Checkmark`, !!save.d.invert);
  ui.setFill('menu', VOLUME, save.d.volume);
}

function hideAll() { for (const k of ['splash', 'menu', 'levels']) ui.hide(k); }

// MainMenuManager.Start: total coins ("0" below 1), the first-run Tutorial (dimmer + hand on Play) until a level has
// been opened (InstanceManager.Init sets TutorialComplete); the hand goes with the Tutorial (its OnDisable event).
function menu() {
  hideAll();
  screen = 'menu';
  ui.show('menu');
  ui.setText('menu', 'TotalCoins_BG/Text', `${save.coins >= 1 ? save.coins : 0}`);
  ui.setActive('menu', 'Tutorial', !save.d.tutorial);
  ui.setActive('menu', 'HandIndicator', !save.d.tutorial);
  settings(false);
  sound.playMusic(MUSIC, MUSIC_VOLUME);
}

// LevelSelectionManager.Start: the card shown first is the last activity started (pref "Activity"); the Tutorial overlay
// (its own Play -> Level 1) covers the screen on the first run.
function levels() {
  hideAll();
  screen = 'levels';
  ui.show('levels');
  for (let n = 1; n <= LEVELS; n++) ui.setLevelState(n, { locked: n > save.unlocked });
  ui.setActive('levels', 'Tutorial', !save.d.tutorial);
  levels.pick(Math.min(LEVELS, Math.max(1, (save.d.activity | 0) + 1)));
}

// LevelSelectionManager.Levels / UIManager.Next set the "Activity" pref, then the level scene loads behind the Loading
// panel; here the level waits only for what it still needs (lightmaps, HUD sprites) the first time.
async function play(n, opts) {
  save.set('activity', n - 1);
  const panel = { menu: 'Canvas/LoadingPanel', levels: 'Canvas/LoadingPanel' }[screen];
  let ready = false;
  gameAssets.then(() => { ready = true; });
  await Promise.resolve();
  if (!ready) {
    if (panel) ui.setActive(screen, panel, true);
    await gameAssets;
    if (panel) ui.setActive(screen, panel, false);
  }
  save.set('tutorial', true);
  hideAll();
  screen = 'game';
  game.start(n, opts);
}

// UIManager.Next: the next activity; after the last one a random one of the others (Random.Range(0, count - 1)).
function next(n) {
  game.stop();
  play(n < LEVELS ? n + 1 : 1 + Math.floor(Math.random() * (LEVELS - 1)));
}

let last = performance.now();
function loop() {
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (screen === 'game') {
    game.update(dt);
    stage.update(now / 1000);
    stage.render();
  }
  requestAnimationFrame(loop);
}

// Test / debug view of the running game. Read-only except `input`, which is the same API the HUD drives.
window.__fb = {
  get screen() { return screen; },
  get state() { return screen === 'game' ? (game.tl ? 'timeline' : game.state) : screen; },
  get level() { return game && game.level; },
  get save() { return save && { ...save.d }; },
  get task() { return game && screen === 'game' ? taskInfo() : null; },
  get player() {
    if (!game) return null;
    const p = game.fish.root.position, m = game.fish.mouthPos();
    return { pos: p.toArray(), mouth: m.toArray(), yaw: game.fish.yaw, camYaw: game.follow.yaw, radius: game.fish.radius, anim: game.fish.rig.current?.key };
  },
  get targets() { return game ? game.nav.targets() : []; },
  get input() { return input; },
  get game() { return game; },
};

function taskInfo() {
  const out = { control: game.control, timeline: !!game.tl, action: !!game.action, hint: game.lastHint };
  for (const inst of game.instances.values()) {
    if (!game.isActive(inst.path)) continue;
    const t = inst.constructor.name;
    if (t === 'CleanMoss') Object.assign(out, { moss: inst.value, mossButton: inst.shown, mossDone: inst.done });
    if (t === 'CountCollectedItems') Object.assign(out, { collected: inst.count, max: inst.max });
    if (t === 'FeedFish') Object.assign(out, { hunger: inst.hunger, food: inst.food ? inst.food.position.toArray() : null });
    if (t === 'FishGetsFood') Object.assign(out, { jumpIndex: inst.index, jumps: inst.targets.length, aimed: inst.aimed, flying: !!inst.flight });
    if (t === 'FloppingFish') Object.assign(out, { hp: inst.hp, path: inst.index, paths: inst.paths.length, grounded: inst.grounded, flopLive: !!inst.live, next: inst.next()?.toArray() });
    if (t === 'PerformGestureTask') Object.assign(out, { gestures: inst.count, draw: inst.drawInfo, lastScore: inst.lastScore });
  }
  return out;
}

boot().catch(e => {
  window.__fb.error = String(e && e.stack || e);
  console.error(e);
});
