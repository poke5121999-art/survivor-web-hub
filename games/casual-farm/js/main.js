import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import MeshoptDecoder from '../vendor/meshopt_decoder.js';
import { buildWorld } from './view/world.js';
import { lighting, texture } from './view/toon.js';
import { AnimLibrary, attachRigs } from './view/anim.js';
import { GameView } from './view/game.js';
import { Hud } from './view/hud.js';
import { CameraDirector } from './view/camera.js';
import { Sound } from './view/sound.js';
import { buildStore } from './sim/store.js';
import { Sim } from './sim/sim.js';
import { Customers } from './sim/customers.js';
import { Workers } from './sim/workers.js';
import { Thief } from './sim/thief.js';
import { Cars } from './sim/cars.js';
import { Tasks, buildTasks, matArrows } from './sim/tasks.js';
import { NavMesh } from './sim/nav.js';
import { GridNav } from './sim/grid.js';
import { Bot } from './sim/bot.js';
import { martRows } from './sim/martmap.js';
import { Boosters } from './sim/boosters.js';
import { Fx } from './view/fx.js';

const params = new URLSearchParams(location.search);
const V = new URL(import.meta.url).searchParams.get('v') || '';
const BASE = new URL('../', import.meta.url).href;
const ART = `${BASE}art`;
// Saves: one global record (current mart, cash: money is global, progression.md "Next mart") plus one record per mart.
const GLOBAL_KEY = 'mmm-global-v1';
const MART_KEY = id => `mmm-${id}-v1`;
const load_ = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const store_ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } };
const fresh = params.has('fresh');
// Before marts existed the only save was Store 1's, which then also held the cash.
const global = (!fresh && load_(GLOBAL_KEY)) || { mart: 'store1', cash: (!fresh && load_(MART_KEY('store1')) || {}).cash || 0 };
if (params.get('mart')) global.mart = params.get('mart');
const STORE = global.mart;
// Map menu state: marts reached so far (older saves: every mart with a save) and when each one's idle income was
// last collected; the 3-hour clock starts on the first visit.
global.idleAt = global.idleAt || {};
if (!global.visited) global.visited = Object.keys(localStorage).map(k => (k.match(/^mmm-(store\d+)-v1$/) || [])[1]).filter(Boolean);
if (!global.visited.includes(STORE)) global.visited.push(STORE);
if (global.idleAt[STORE] == null) global.idleAt[STORE] = Date.now();

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene3 = new THREE.Scene();
scene3.background = new THREE.Color(0x9bd36a);

// Original main vcam: orthographic size 35, CinemachineTransposer follow offset (77.38, 253.93, -310.62) in Unity
// space, composer looks at the target +10 m up.
const ORTHO = 35;
const FOLLOW = new THREE.Vector3(77.38, 253.93, 310.62);
const LOOK_UP = 10;
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.3, 1000);
const camFwd = new THREE.Vector2(-FOLLOW.x, -FOLLOW.z).normalize();

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  // Unity's orthographic size is the vertical half-extent whatever the aspect: a landscape screen sees the same height
  // and more width (gameplay video at 1280x720: a crop bed 143 px long, as with 35 here).
  const aspect = w / h;
  const half = ORTHO;
  camera.left = -half * aspect; camera.right = half * aspect;
  camera.top = half; camera.bottom = -half;
  camera.updateProjectionMatrix();
  lighting.resolution.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
}
window.addEventListener('resize', resize);
resize();

// Load stages drive the blur: the scene shows as soon as geometry exists, then sharpens as the rest arrives.
const mm = window.__mm = { stage: 'boot', blur: 14, stages: [] };
function setStage(px, label) {
  mm.blur = px;
  mm.stage = label;
  mm.stages.push([label, px, Math.round(performance.now())]);
  canvas.style.filter = px > 0 ? `blur(${px}px)` : 'none';
}
setStage(14, 'boot');

const json = url => fetch(`${url}?v=${V}`).then(r => {
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
});
const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const glb = url => gltfLoader.loadAsync(`${url}?v=${V}`);

function readSave() {
  const d = fresh ? null : load_(MART_KEY(STORE));
  return d && { ...d, cash: global.cash };
}

async function load() {
  const restP = Promise.all([
    json(`${ART}/anim/clips.json`), json(`${ART}/anim/controllers.json`), json(`${ART}/items/items.json`),
    glb(`${ART}/items/items.glb`), json(`${ART}/${STORE}/navmesh.json`), json(`${BASE}data/${STORE}.json`),
    json(`${BASE}data/marts.json`), json(`${ART}/fx/fx.json`), glb(`${ART}/fx/fx.glb`),
    json(`${ART}/ui/upgrade/icons.json`).catch(() => null),
  ]);
  const [sceneJson, gltf] = await Promise.all([json(`${ART}/${STORE}/scene.json`), glb(`${ART}/${STORE}/geo.glb`)]);
  const world = buildWorld(sceneJson, gltf, { texBase: `${ART}/tex` });
  scene3.add(world.root);
  setStage(8, 'geometry');
  const [clips, controllers, items, itemsGltf, navJson, data, marts, fxData, fxGltf, upgradeIcons] = await restP;
  const anim = new AnimLibrary(clips, controllers);
  world.rigs = attachRigs(anim, world);
  setStage(5, 'animation');

  const store = buildStore(sceneJson, data);
  const nav = new NavMesh(navJson, store.player.start);
  const grid = new GridNav(nav);
  const sim = new Sim(store, { save: readSave(), cash: global.cash });
  const tasks = new Tasks(sim, buildTasks(store));
  const workers = new Workers(sim, grid);
  sim.systems.push(new Customers(sim, grid), workers, new Thief(sim, grid), new Cars(sim), new Boosters(sim), tasks);
  const view = new GameView({ world, store, sim, items, itemsGltf, texBase: `${ART}/tex`, anim });
  view.fx = new Fx({ root: scene3, camera, art: ART, fxData, gltf: fxGltf, texBase: `${ART}/tex`, version: V });
  // RC_MartOrders: the pad leads to the next entry; past the last one GoToNextMart falls back to the first.
  const here = marts.findIndex(m => m.id === STORE);
  const next = marts[(here + 1) % marts.length];
  const doneOf = id => (id === STORE ? Object.values(sim.state.mats).filter(m => m.done).length
    : Object.values((load_(MART_KEY(id)) || {}).mats || {}).filter(m => m.done).length);
  const martMap = {
    rows: () => martRows(marts, global, doneOf, Date.now()),
    collect: row => {
      global.idleAt[row.id] = Date.now();
      sim.state.cash += row.amount;
      sim.emit({ type: 'coinPile', amount: row.amount });
      save();
    },
    go: row => travel(row.id),
    global,
  };
  const hud = new Hud({ sim, store, camera, canvas, items, art: ART, world, tasks, matArrows: matArrows(store), nextMart: next, workerDefs: workers.defs,
    sound: new Sound(`${ART}/sfx`, sim, store, V), martMap, upgradeRows: upgradeIcons && upgradeIcons.stores[STORE] });
  await Promise.all(sceneJson.textures.map(t => texture(`${ART}/tex`, t.name).full));
  setStage(0, 'textures');
  sim.listeners.push(e => { if (e.type === 'depart') setTimeout(() => travel(next.id), VAN_TIME); });
  const director = new CameraDirector(sim, store);
  return { world, store, nav, grid, sim, view, hud, director };
}

let game = null;
const target = new THREE.Vector3();
const clock = new THREE.Clock();
let saveTimer = 0;
let bot = null;

function save() {
  if (!game) return;
  const d = game.sim.save();
  global.cash = d.cash;
  store_(MART_KEY(STORE), d);
  global.savedAt = Date.now();
  store_(GLOBAL_KEY, global);
}

// WelcomeBackController.ActivateWith(seconds): income = min(maxIncome 240, incomePerMinAway 1.0 / 60 * seconds).
// Its minTimeAway is not in the dumps; one whole coin (a minute away) is the threshold used here.
const AWAY_MAX = 240, AWAY_PER_MIN = 1;
function welcomeBack(g) {
  if (fresh || !global.savedAt) return;
  const income = Math.min(AWAY_MAX, Math.floor(AWAY_PER_MIN / 60 * (Date.now() - global.savedAt) / 1000));
  if (income >= 1) g.hud.welcome(income, () => {
    g.sim.state.cash += income;
    g.sim.emit({ type: 'coinPile', amount: income });
  });
}

// MatNextStore.FillUpCompleted: the van leaves after 1.0 s and drives for 1.5 s, then the next scene loads.
const VAN_TIME = 2600;
function travel(id) {
  save();
  global.mart = id;
  store_(GLOBAL_KEY, global);
  const keep = new URLSearchParams();
  if (params.has('bot')) keep.set('bot', '');
  location.replace(`${location.pathname}${keep.toString() ? `?${keep}` : ''}`);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
window.addEventListener('pagehide', save);

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (game) {
    const { sim, view, hud, nav, grid, world, director } = game;
    if (bot) bot.step(dt);
    else {
      const j = hud.joystick();
      // Joystick up = away from the camera on the ground plane; right = screen right.
      const wx = -camFwd.y * j.x + camFwd.x * -j.y, wz = camFwd.x * j.x + camFwd.y * -j.y;
      sim.setInput(wx * j.mag, wz * j.mag);
    }
    sim.step(dt, { nav, grid });
    view.update(dt);
    for (const r of world.rigs) r.update(dt);
    const shot = director.update();
    target.set(shot.x, 0, shot.z);
    camera.position.copy(target).add(FOLLOW);
    camera.lookAt(target.x, LOOK_UP, target.z);
    if (camera.zoom !== 1 / shot.zoom) { camera.zoom = 1 / shot.zoom; camera.updateProjectionMatrix(); }
    hud.update(dt);
    saveTimer += dt;
    if (saveTimer > 5) { saveTimer = 0; save(); }
    mm.t = sim.state.t;
    mm.cash = sim.state.cash;
  }
  renderer.render(scene3, camera);
  requestAnimationFrame(frame);
}

load().then(g => {
  game = g;
  window.__mmGame = Object.assign(g, { camera, scene: scene3, renderer });
  if (params.has('bot')) g.bot = bot = new Bot(g.sim, g.grid);
  else welcomeBack(g);
  mm.ready = true;
}).catch(e => {
  console.error(e);
  mm.error = String(e && e.stack || e);
});
frame();
