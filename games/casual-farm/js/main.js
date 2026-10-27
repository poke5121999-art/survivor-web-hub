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
import { CityMap } from './view/citymap.js';
import { Looks } from './view/looks.js';
import { cosmeticsState, saveCosmetics, cosmeticEffects } from './view/customise.js';

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
// Prestige (census-prestige.md): stars per mart (martStarList), gold bars, and the reward waiting for the welcome
// screen after the reload (GameSingleton.SetPrestigeReward / JustPrestiged).
global.stars = global.stars || {};
global.gold = global.gold || 0;

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
  // The portrait frame (#stage), not the window.
  const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
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
    json(`${ART}/cosmetics/cosmetics.json`), glb(`${ART}/cosmetics/cosmetics.glb`),
  ]);
  const [sceneJson, gltf] = await Promise.all([json(`${ART}/${STORE}/scene.json`), glb(`${ART}/${STORE}/geo.glb`)]);
  const world = buildWorld(sceneJson, gltf, { texBase: `${ART}/tex` });
  scene3.add(world.root);
  setStage(8, 'geometry');
  const [clips, controllers, items, itemsGltf, navJson, data, marts, fxData, fxGltf, upgradeIcons, cosData, cosGltf] = await restP;
  const anim = new AnimLibrary(clips, controllers);
  world.rigs = attachRigs(anim, world);
  setStage(5, 'animation');

  const store = buildStore(sceneJson, data);
  const nav = new NavMesh(navJson, store.player.start);
  const grid = new GridNav(nav);
  const saved = readSave();
  const sim = new Sim(store, { save: saved, cash: global.cash });
  // HasJustPrestiged: the rebuilt mart starts at currentDemandIndex 100 (CustomerManager.c:2907-2911).
  if (!saved && global.prestige && global.prestige.id === STORE) sim.state.demandIndex = 100;
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
  // The 3D map loads the first time the card opens; the player's van (vanCarObj) is borrowed while it is shown.
  const ph = sceneJson.nodes[store.player.node] && sceneJson.nodes[store.player.node].k.PlayerHumanController;
  const cityMap = new CityMap({ scene3, texBase: `${ART}/tex`, fx: view.fx, storeRoot: world.root,
    van: ph && ph.vanCarObj ? world.objects[ph.vanCarObj.n] : new THREE.Group(),
    load: () => Promise.all([json(`${ART}/citymap/scene.json`), glb(`${ART}/citymap/geo.glb`)]) });
  // Cosmetics are global (not per mart): saved in the global record like the original's PlayerPrefs preferences.
  const cosState = cosmeticsState(cosData, global.cosmetics);
  const looks = new Looks({ data: cosData, gltf: cosGltf, texBase: `${ART}/tex`, player: world.objects[store.player.node], anim,
    loadPets: () => Promise.all([json(`${ART}/pets/scene.json`), glb(`${ART}/pets/geo.glb`)]) });
  view.looks = looks;
  const wear = () => { looks.apply(cosState.eq); sim.setCosmetics(cosmeticEffects(cosData, cosState.eq)); };
  wear();
  const cosmetics = { data: cosData, state: cosState, onChange: () => { global.cosmetics = saveCosmetics(cosState); wear(); save(); } };
  const martMap = {
    rows: () => {
      // UpdateCollectButton stamps a reached mart the first time the menu shows it, so its 3-hour clock starts then.
      const now = Date.now();
      for (const id of global.visited) if (global.idleAt[id] == null) global.idleAt[id] = now;
      return martRows(marts, global, doneOf, now);
    },
    // GiveExtraCashImmediateSaveGame(income), or trunc(1.5 x income) from the ad button, then the clock restarts.
    collect: (row, mult = 1) => {
      const amount = Math.trunc(row.income * mult);
      global.idleAt[row.id] = Date.now();
      sim.state.cash += amount;
      sim.emit({ type: 'coinPile', amount });
      save();
    },
    go: row => travel(row.id),
    // OnPressPrestigeButton: star +1, the mart's save is deleted, the reward is parked for the welcome screen, then
    // the renovation sound plays and that mart's scene loads.
    prestige: row => {
      global.stars[row.id] = row.star + 1;
      global.prestige = { id: row.id, name: row.name, icon: row.icon, star: row.star + 1, cash: row.offer.cash, gold: row.offer.gold,
        before: row.offer.now, after: row.offer.next };
      if (game.hud.sound) game.hud.sound.play('renovation');
      setTimeout(() => travel(row.id, row.id), 600);
    },
    // PrestigeMenuWelcome.OnPressClaimButton: GiveExtraCash(cash) and GiveExtraGold(gold), no ad.
    claim: p => {
      sim.state.cash += p.cash;
      sim.emit({ type: 'coinPile', amount: p.cash });
      global.gold += p.gold;
      global.prestige = null;
      save();
    },
    global,
  };
  const hud = new Hud({ sim, store, camera, canvas, items, art: ART, world, tasks, matArrows: matArrows(store), nextMart: next, workerDefs: workers.defs,
    sound: new Sound(`${ART}/sfx`, sim, store, V), martMap, upgradeRows: upgradeIcons && upgradeIcons.stores[STORE], cosmetics,
    onMapView: i => { if (i == null) { cityMap.hide(); sim.state.mapMode = false; } else { sim.state.mapMode = true; if (cityMap.open) cityMap.goTo(i); else cityMap.show(martMap.rows(), i); } } });
  await Promise.all(sceneJson.textures.map(t => texture(`${ART}/tex`, t.name).full));
  setStage(0, 'textures');
  sim.listeners.push(e => { if (e.type === 'depart') setTimeout(() => travel(next.id), VAN_TIME); });
  const director = new CameraDirector(sim, store);
  hud.onTaskFocus = p => director.highlight(p);
  return { world, store, nav, grid, sim, view, hud, director, cityMap, looks, radar: objectiveRadar(world, store) };
}

// ObjectiveRadarController under PlayerFollower: while a task has a target, an arrow circles the player, LookAt the target
// and scaled by min(distance / 15, 1) (PlayerHumanController.SetFocusArrow, ABTutorialType arms 1, 2 and 4; the arm
// this build follows also keeps the world arrows). The arrow child sits at -2.9 z after the z flip, so -z faces the target.
function objectiveRadar(world, store) {
  const i = store.node('ObjectiveRadar');
  if (i == null) return null;
  const o = world.objects[i];
  world.root.add(o);
  o.visible = false;
  const away = new THREE.Vector3();
  return {
    update(player, p) {
      o.visible = !!p;
      if (!p) return;
      const d = Math.hypot(p.x - player.x, p.z - player.z), k = Math.min(d / 15, 1);
      o.position.set(player.x, 0, player.z);
      o.scale.setScalar(Math.max(k, 1e-3));
      o.lookAt(away.set(2 * player.x - p.x, 0, 2 * player.z - p.z));
    },
  };
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
  game.hud.saved();
}

// MatNextStore.FillUpCompleted: the van leaves after 1.0 s and drives for 1.5 s, then the next scene loads.
const VAN_TIME = 2600;
// wipe: a mart whose save is deleted on the way (prestige); the cash is kept, the mart's own record is not written back.
function travel(id, wipe = null) {
  if (wipe && wipe === STORE && game) {
    global.cash = game.sim.state.cash;
    game = null;
  } else save();
  if (wipe) {
    try { localStorage.removeItem(MART_KEY(wipe)); } catch (e) { /* storage unavailable */ }
  }
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
    game.looks.update(dt);
    if (game.radar) { const task = hud.tasks && hud.tasks.current; game.radar.update(sim.state.player, task && task.radar && task.target); }
    for (const r of world.rigs) r.update(dt);
    const shot = director.update();
    target.set(shot.x, 0, shot.z);
    // Map mode: the main vcam follows the van on the city map (CameraController.GoIntoMapMode).
    if (game.cityMap.open && game.cityMap.ready) {
      game.cityMap.update(dt, hud.martMenu && hud.martMenu.rows);
      target.set(game.cityMap.target.x, 0, game.cityMap.target.z);
      shot.zoom = 1;
    }
    camera.position.copy(target).add(FOLLOW);
    camera.lookAt(target.x, LOOK_UP, target.z);
    // Customise screen: zoom in on the player and lift it into the open top of the screen (the original shows a preview
    // rig there).
    const dressing = hud.customise && hud.customise.isOpen;
    if (dressing) { target.set(sim.state.player.x, 0, sim.state.player.z); camera.position.copy(target).add(FOLLOW); camera.lookAt(target.x, LOOK_UP, target.z); shot.zoom = 0.45; }
    if (dressing !== !!(camera.view && camera.view.enabled)) {
      if (dressing) camera.setViewOffset(canvas.clientWidth, canvas.clientHeight, 0, canvas.clientHeight * 0.33, canvas.clientWidth, canvas.clientHeight);
      else camera.clearViewOffset();
    }
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
  // No welcome-back popup: WelcomeBackController has no caller in the original (census-daily-shop.md); away time pays
  // only through the map's idle income.
  if (params.has('bot')) g.bot = bot = new Bot(g.sim, g.grid);
  // CanvasManager.Start with HasJustPrestiged: the welcome screen, then ResetPrestige.
  if (global.prestige && global.prestige.id === STORE && g.hud.martMenu) g.hud.martMenu.showWelcome(global.prestige);
  mm.ready = true;
}).catch(e => {
  console.error(e);
  mm.error = String(e && e.stack || e);
});
frame();
