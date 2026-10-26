import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import MeshoptDecoder from '../vendor/meshopt_decoder.js';
import { buildWorld } from './view/world.js';
import { lighting, texture } from './view/toon.js';
import { AnimLibrary, attachRigs } from './view/anim.js';
import { GameView } from './view/game.js';
import { Hud } from './view/hud.js';
import { buildStore } from './sim/store.js';
import { Sim } from './sim/sim.js';
import { Customers } from './sim/customers.js';
import { Workers } from './sim/workers.js';
import { Tasks, buildTasks, matArrows } from './sim/tasks.js';
import { NavMesh } from './sim/nav.js';
import { GridNav } from './sim/grid.js';
import { Bot } from './sim/bot.js';

const params = new URLSearchParams(location.search);
const V = new URL(import.meta.url).searchParams.get('v') || '';
const BASE = new URL('../', import.meta.url).href;
const ART = `${BASE}art`;
const STORE = 'store1';
const SAVE_KEY = 'mmm-store1-v1';

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
  // Portrait keeps the original vertical extent; a wide screen keeps roughly the width a phone shows.
  const aspect = w / h;
  const half = aspect > 9 / 16 ? Math.max(ORTHO * 0.62, ORTHO * (9 / 16) / aspect * 1.6) : ORTHO;
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
  if (params.has('fresh')) return null;
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return null; }
}

async function load() {
  const restP = Promise.all([
    json(`${ART}/anim/clips.json`), json(`${ART}/anim/controllers.json`), json(`${ART}/items/items.json`),
    glb(`${ART}/items/items.glb`), json(`${ART}/${STORE}/navmesh.json`), json(`${BASE}data/${STORE}.json`),
  ]);
  const [sceneJson, gltf] = await Promise.all([json(`${ART}/${STORE}/scene.json`), glb(`${ART}/${STORE}/geo.glb`)]);
  const world = buildWorld(sceneJson, gltf, { texBase: `${ART}/tex` });
  scene3.add(world.root);
  setStage(8, 'geometry');
  const [clips, controllers, items, itemsGltf, navJson, data] = await restP;
  const anim = new AnimLibrary(clips, controllers);
  world.rigs = attachRigs(anim, world);
  setStage(5, 'animation');

  const store = buildStore(sceneJson, data);
  const nav = new NavMesh(navJson);
  const grid = new GridNav(nav);
  const sim = new Sim(store, { save: readSave() });
  const tasks = new Tasks(sim, buildTasks(store));
  sim.systems.push(new Customers(sim, grid), new Workers(sim, grid), tasks);
  const view = new GameView({ world, store, sim, items, itemsGltf, texBase: `${ART}/tex`, anim });
  const hud = new Hud({ sim, store, camera, canvas, items, art: ART, world, tasks, matArrows: matArrows(store) });
  await Promise.all(sceneJson.textures.map(t => texture(`${ART}/tex`, t.name).full));
  setStage(0, 'textures');
  return { world, store, nav, grid, sim, view, hud };
}

let game = null;
const target = new THREE.Vector3();
const clock = new THREE.Clock();
let saveTimer = 0;
let bot = null;

function save() {
  if (!game) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(game.sim.save())); } catch (e) { /* storage unavailable */ }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
window.addEventListener('pagehide', save);

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (game) {
    const { sim, view, hud, nav, grid, world } = game;
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
    target.set(sim.state.player.x, 0, sim.state.player.z);
    camera.position.copy(target).add(FOLLOW);
    camera.lookAt(target.x, LOOK_UP, target.z);
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
  if (params.has('bot')) bot = new Bot(g.sim, g.grid);
  mm.ready = true;
}).catch(e => {
  console.error(e);
  mm.error = String(e && e.stack || e);
});
frame();
