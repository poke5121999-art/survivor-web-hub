// Boot: loading blur, art, sim + view, fixed-step loop, save.
// Query flags: ?fresh (drop the save and start new), ?seed=N (fixed random seed, tests), ?bot (the player is driven by js/sim/bot.js through the same
// sim.input / sim.action calls a human makes), ?mute (no sound).
// Test hooks: window.__game (sim, view, game view), window.__step(n, draw) runs n fixed steps of 1/30 s; effects,
// tweens and animations age in every step, drawn or not.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import MeshoptDecoder from '../vendor/meshopt_decoder.js';
import { buildWorld, buildPrefabSet, addUnityLights, makeSky, loadFullTextures, lowResSettled, textureStats } from './view/world.js';
import { AnimLibrary, attachRigs } from './view/rig.js';
import { FollowCamera } from './view/camera.js';
import { Hud } from './view/hud.js';
import { Input } from './view/input.js';
import { GameView } from './view/game.js';
import { NavMesh } from './sim/nav.js';
import { Sim, STEP } from './sim/sim.js';
import { Bot } from './sim/bot.js';

const params = new URLSearchParams(location.search);
const V = new URL(import.meta.url).searchParams.get('v') || '';
const ART = new URL('../art', import.meta.url).href;
const DATA = new URL('../data', import.meta.url).href;
const SAVE_KEY = 'steal-egg-v1';
const SAVE_EVERY = 10;
const PLAYER = 'Player1';
const PLAYERS = ['Player1', 'Player2', 'Player3', 'Player4', 'Player5', 'Player6'];

// Gamma colour space: colours are used as stored and written out without conversion.
THREE.ColorManagement.enabled = false;

const stageEl = document.getElementById('stage');
const canvas = document.getElementById('game');
const hudEl = document.getElementById('hud');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene3 = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.3, 100);

const game = window.__game = { stage: { rotated: false, w: 0, h: 0 }, blur: 14, stages: [], ready: false, errors: [], saves: 0 };

function setBlur(px, label) {
  game.blur = px;
  game.stages.push([label, px, Math.round(performance.now())]);
  canvas.style.filter = px > 0 ? `blur(${px}px)` : 'none';
}
setBlur(14, 'boot');

// The game is landscape only: a portrait window gets the stage turned 90 degrees.
function layoutStage() {
  const vw = window.innerWidth, vh = window.innerHeight, rotated = vh > vw;
  const w = rotated ? vh : vw, h = rotated ? vw : vh;
  Object.assign(game.stage, { rotated, w, h });
  stageEl.classList.toggle('rotated', rotated);
  Object.assign(stageEl.style, { width: `${w}px`, height: `${h}px` });
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (game.hud) game.hud.resize(w, h);
}
window.addEventListener('resize', layoutStage);
layoutStage();

const json = url => fetch(`${url}?v=${V}`).then(r => {
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
});
const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const glb = url => gltfLoader.loadAsync(`${url}?v=${V}`);

function readSave() {
  if (params.has('fresh')) {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* storage unavailable */ }
    return null;
  }
  try { return localStorage.getItem(SAVE_KEY); } catch (e) { return null; }
}

function writeSave() {
  if (!game.sim || !game.ready) return;
  try {
    localStorage.setItem(SAVE_KEY, game.sim.save());
    game.saves++;
  } catch (e) { /* storage unavailable or full */ }
}

// Egg timers use real UTC seconds like the original (FarmPlacedEgg.ReadyAtUnix). Fast-forwarded test steps move this
// clock too, so a hatch can be watched without waiting 30 real seconds.
// With ?seed (tests) the clock is a fixed epoch plus sim time, so a seeded run replays exactly.
let clockSkew = 0;
const now = params.has('seed') ? () => 1.8e9 + (game.sim ? game.sim.state.t : 0) : () => Date.now() / 1000 + clockSkew;

async function load() {
  const restP = Promise.all([json(`${ART}/anim/clips.json`), json(`${ART}/anim/controllers.json`), json(`${ART}/world/navmesh.json`),
    json(`${ART}/ui/level2.json`), json(`${DATA}/game.json`), json(`${ART}/world/colliders.json`), json(`${ART}/fx/fx.json`),
    json(`${ART}/sfx/sfx.json`)]);
  const setsP = Promise.all(['brainrots', 'eggs'].map(s => Promise.all([json(`${ART}/${s}/scene.json`), glb(`${ART}/${s}/geo.glb`)])));
  const fxGlbP = glb(`${ART}/fx/fx.glb`).catch(() => null);
  const [sceneJson, gltf] = await Promise.all([json(`${ART}/world/scene.json`), glb(`${ART}/world/geo.glb`)]);
  const opts = { texBase: `${ART}/tex`, version: V };
  const world = buildWorld(sceneJson, gltf, { ...opts, file: 'level2' });
  scene3.add(world.root, makeSky(opts.texBase, V));
  const lights = addUnityLights(scene3, sceneJson, world.node('Directional Light (1)'));
  for (const name of PLAYERS) world.show(name, name === PLAYER);
  const follow = new FollowCamera(camera, world.node('MainCamera'));
  setBlur(8, 'geometry');

  const [clips, controllers, navJson, layout, data, colliders, fxJson, sfxJson] = await restP;
  const [[brJson, brGltf], [eggJson, eggGltf]] = await setsP;
  const fxGlb = await fxGlbP;
  const anim = new AnimLibrary(clips, controllers);
  const rigs = attachRigs(anim, world.objects, 'level2');
  const prefabs = {
    brainrots: buildPrefabSet(brJson, brGltf, { ...opts, file: 'resources.assets' }),
    eggs: buildPrefabSet(eggJson, eggGltf, { ...opts, file: 'sharedassets2.assets' }),
  };
  setBlur(5, 'animation');

  const nav = new NavMesh(navJson);
  nav.setColliders(colliders);
  const sim = new Sim(data, nav, { seed: params.has('seed') ? +params.get('seed') : (Date.now() >>> 0) || 1, now });
  const saved = readSave();
  if (saved && !sim.load(saved)) console.warn('save not loaded: unknown version');
  sim.startSession();

  const playerObj = world.node(PLAYER);
  const hud = new Hud({ layout, parent: hudEl, spriteBase: `${ART}/ui/sprites`, version: V });
  const joystick = layout.nodes[layout.nodes.findIndex(n => n.path === 'Canvas/InGame/JoyStick')];
  const joyMb = sceneJson.nodes.find(n => n.k && n.k.UIVirtualJoystick);
  const input = new Input({ hud, stage: game.stage, joystick: { joystickRange: joyMb ? joyMb.k.UIVirtualJoystick.joystickRange : 100, rect: joystick.rect } });
  input.onDrag = (dx, dy) => follow.drag(dx, dy);

  const view = {
    world, rigs, prefabs, anim, lights, camera, follow, hud, input, scene: scene3, renderer,
    player: playerObj, playerRig: playerObj.userData.rig || null,
    // Instance of a prefab (brainrot or egg) with its Animator rigs; the caller adds it to the scene and calls
    // view.despawn(o) when it goes, so no rig or mesh is left behind.
    spawn(setName, id) {
      const set = prefabs[setName], o = set.spawn(id);
      o.userData.rigs = attachRigs(anim, o.userData.objects, set.set.file);
      rigs.push(...o.userData.rigs);
      return o;
    },
    despawn(o) {
      for (const r of o.userData.rigs || []) {
        const i = rigs.indexOf(r);
        if (i >= 0) rigs.splice(i, 1);
        r.mixer.stopAllAction();
        r.mixer.uncacheRoot(r.node);
      }
      if (o.parent) o.parent.remove(o);
    },
  };
  Object.assign(game, { sim, view, nav, data });
  game.hud = hud;
  layoutStage();
  game.gv = new GameView({ sim, view, data, layout, fxJson, fxGlb, sfxJson, artBase: ART, version: V, mute: params.has('mute'),
    onPurchase: writeSave });

  await lowResSettled();
  game.stages.push(['lowres', game.blur, Math.round(performance.now())]);
  await loadFullTextures();
  setBlur(0, 'textures');
  game.textures = textureStats();
  return game;
}

function botInput() {
  return game.bot ? game.bot.input(game.sim) : { dir: [0, 0], jump: false, sprint: false };
}

// One fixed step: input, sim, events into the view (effects, sounds, HUD tweens) and their ageing.
function stepSim(quiet) {
  const { sim, view, gv } = game;
  if (params.has('bot')) sim.input(botInput());
  else {
    sim.input({ dir: view.input.worldDir(view.follow.x), jump: view.input.jump(), sprint: view.input.sprint });
    for (let n = view.input.takeAttacks(); n > 0; n--) sim.action('attack');
  }
  gv.beforeStep();
  sim.step(STEP);
  const events = sim.events.splice(0);
  gv.afterStep(events, STEP, quiet);
}

// Test hook: n fixed steps of 1/30 s; the clock, effects and animations advance with them; draw=false skips rendering.
// The first stepped call hands the clock to the test: the real-time loop stops stepping (it still renders).
window.__step = (n = 1, draw = true) => {
  if (!game.ready) return false;
  if (n > 0) game.manual = true;
  for (let i = 0; i < n; i++) { clockSkew += STEP; stepSim(n > 5); }
  game.gv.draw(n * STEP, 1);
  saveClock += n * STEP;
  if (draw) renderer.render(scene3, camera);
  return true;
};

const clock = new THREE.Clock();
let acc = 0, saveClock = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (game.ready && !game.paused && !game.manual) {
    acc += dt;
    while (acc >= STEP) { stepSim(false); acc -= STEP; }
    game.gv.draw(dt, acc / STEP);
    saveClock += dt;
    if (saveClock >= SAVE_EVERY) { saveClock = 0; writeSave(); }
  }
  renderer.render(scene3, camera);
  game.frames = (game.frames || 0) + 1;
  requestAnimationFrame(frame);
}

load().then(() => {
  if (params.has('bot')) game.bot = new Bot(game.sim);
  window.addEventListener('pagehide', writeSave);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') writeSave(); });
  game.writeSave = writeSave;
  // ?seed (tests): the test owns the clock from the start, so nothing steps in real time between boot and the first
  // __step and a seeded run replays exactly
  if (params.has('seed')) game.manual = true;
  game.ready = true;
}).catch(e => {
  console.error(e);
  game.error = String((e && e.stack) || e);
});
frame();
