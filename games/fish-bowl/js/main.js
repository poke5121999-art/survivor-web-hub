// Screen flow: splash (loading) -> menu (Play, Settings: volume + invert vertical) -> level select (5 cards, locked
// until the previous level is done) -> a level (game.js) -> complete / fail panels -> next level or back to the menu.
// Dev: ?level=N&skip=1 starts level N with its intro cutscene skipped. window.__fb exposes state for tests.
import { createStage } from './stage.js';
import { UI } from './ui.js';
import { Sound } from './sound.js';
import { Input } from './input.js';
import { Game } from './game.js';
import { Save, LEVELS } from './save.js';
import { Particles, autoAttach } from './particles.js';

const q = new URLSearchParams(location.search);
const json = p => fetch(`${p}?v=${window.FB_REV || ''}`).then(r => r.json());
const CLICK = 'mouth-pop-1_z1M9vz4u_NWM';
const MENU_MUSIC = 'audioblocks-robert-frost-iii_educational_birds-full-mix-inst-100bpm_SXk9vUWUv_NWM';
const SETTINGS = 'SettingsPanel_BG_Img';
const VOLUME = 'SettingsPanel_BG_Img/SettingsPanel/VolumeSlider';
const INVERT = 'SettingsPanel_BG_Img/SettingsPanel/InvertControlsToggle';

let screen = 'splash';
let game, ui, sound, save, input, stage;

async function boot() {
  const layout = await json('art/ui/layout.json');
  ui = new UI(document.getElementById('ui'), layout, { spriteBase: 'art/ui/sprites/' });
  ui.show('splash');
  const progress = p => ui.setText('splash', 'LoadingPanel/Text', `LOADING ${Math.round(p * 100)}%`);
  progress(0);
  const [st, comps, controllers, fxDefs] = await Promise.all([
    createStage(document.getElementById('c'), { onProgress: p => progress(p * 0.95) }),
    json('data/components.json'), json('art/anim/controllers.json'), json('data/particles.json'),
  ]);
  stage = st;
  save = new Save();
  sound = new Sound('./art/sfx', stage.sfx);
  sound.setVolume(save.d.volume);
  input = new Input();
  input.ui = ui;
  const particles = new Particles(fxDefs, { texBase: 'art/tex' });
  autoAttach(stage, particles);
  game = new Game({ stage, ui, sound, input, comps, save, particles, fxLayer: document.getElementById('fx'),
    onExit: () => { game.stop(); menu(); }, onNext: n => (n < LEVELS ? play(n + 1) : (game.stop(), levels())) });
  game.controllers = controllers;
  game.follow.invert = !!save.d.invert;
  bindMenus();
  // Stay on the splash until the lightmaps (the room is unlit without them) and the menu art are in, at most 15 s.
  const sprites = [...new Set(Object.values(layout.screens).flatMap(sc => sc.nodes.map(n => n.image && n.image.sprite).filter(Boolean)))];
  const img = name => new Promise(res => { const i = new Image(); i.onload = i.onerror = res; i.src = `art/ui/sprites/${name}.webp`; });
  await Promise.race([Promise.all([stage.lightmapsReady, ...sprites.map(img)]), new Promise(res => setTimeout(res, 15000))]);
  progress(1);
  loop();
  const lv = +q.get('level');
  if (lv >= 1 && lv <= LEVELS) play(lv, { skip: q.get('skip') === '1' });
  else menu();
  stage.ready.then(() => { window.__fb.texturesReady = true; });
}

function click(key, path, fn) { ui.on(key, path, () => { sound.play(CLICK); fn(); }); }

function bindMenus() {
  click('menu', 'Play_Button', levels);
  click('menu', 'Settings_Btn', () => settings(true));
  click('menu', `${SETTINGS}/SettingsPanel/Cross_Btn`, () => settings(false));
  // store / ads links of the original are not part of the web build
  for (const p of ['Footer/RateUs_Button', 'Footer/MoreGames_Button', 'Footer/PrivacyPolicy_Button']) ui.setActive('menu', p, false);
  ui.setActive('levels', 'Footer/RateUs_Button', false);
  click('menu', INVERT, () => {
    save.set('invert', !save.d.invert);
    game.follow.invert = save.d.invert;
    ui.setActive('menu', `${INVERT}/Background/Checkmark`, save.d.invert);
  });
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

  let cur = 1;
  const pick = n => { cur = n; ui.selectLevel(n); };
  click('levels', 'Left_Btn', () => pick(((cur + LEVELS - 2) % LEVELS) + 1));
  click('levels', 'Right_Btn', () => pick((cur % LEVELS) + 1));
  click('levels', 'Back_Button', menu);
  const go = () => { if (cur <= save.unlocked) play(cur); };
  click('levels', 'Footer/Play_Button', go);
  for (let i = 1; i <= LEVELS; i++) click('levels', `BtnsContainer_WithoutScroll/Level${i}Button`, go);
  levels.pick = pick;
}

function settings(on) {
  ui.setActive('menu', SETTINGS, on);
  if (!on) return;
  ui.setActive('menu', INVERT, true);
  ui.setActive('menu', `${INVERT}/Background/Checkmark`, !!save.d.invert);
  ui.setFill('menu', VOLUME, save.d.volume);
}

function hideAll() { for (const k of ['splash', 'menu', 'levels']) ui.hide(k); }

function menu() {
  hideAll();
  screen = 'menu';
  ui.show('menu');
  ui.setText('menu', 'TotalCoins_BG/Text', `${save.coins}`);
  settings(false);
  sound.playMusic(MENU_MUSIC, 0.4);
}

function levels() {
  hideAll();
  screen = 'levels';
  ui.show('levels');
  for (let n = 1; n <= LEVELS; n++) ui.setLevelState(n, { locked: n > save.unlocked });
  levels.pick(Math.min(save.unlocked, LEVELS));
}

function play(n, opts) {
  hideAll();
  screen = 'game';
  game.start(n, opts);
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
