// One co-op store on screen: the solo game's world, view and HUD (games/casual-farm, imported as is) around a CoopSim
// on the host or a MirrorSim on a guest. Left out next to solo: the city map, prestige, shop, daily spin, cosmetics
// and travelling to the next mart; a co-op store is one mart from start to finish, as in Supermarket Together.
import * as THREE from 'three';
import { GLTFLoader } from '../../casual-farm/vendor/GLTFLoader.js';
import MeshoptDecoder from '../../casual-farm/vendor/meshopt_decoder.js';
import { buildWorld } from '../../casual-farm/js/view/world.js';
import { lighting, texture } from '../../casual-farm/js/view/toon.js';
import { AnimLibrary, attachRigs } from '../../casual-farm/js/view/anim.js';
import { GameView } from '../../casual-farm/js/view/game.js';
import { Hud } from '../../casual-farm/js/view/hud.js';
import { CameraDirector } from '../../casual-farm/js/view/camera.js';
import { Sound } from '../../casual-farm/js/view/sound.js';
import { Fx } from '../../casual-farm/js/view/fx.js';
import { buildStore } from '../../casual-farm/js/sim/store.js';
import { Customers } from '../../casual-farm/js/sim/customers.js';
import { Workers } from '../../casual-farm/js/sim/workers.js';
import { Thief } from '../../casual-farm/js/sim/thief.js';
import { Cars } from '../../casual-farm/js/sim/cars.js';
import { Boosters } from '../../casual-farm/js/sim/boosters.js';
import { Tasks, buildTasks, matArrows } from '../../casual-farm/js/sim/tasks.js';
import { NavMesh } from '../../casual-farm/js/sim/nav.js';
import { GridNav } from '../../casual-farm/js/sim/grid.js';
import { Bot } from '../../casual-farm/js/sim/bot.js';
import { CoopSim, MirrorSim } from './coopsim.js';
import { RemotePlayers } from './remotes.js';

const V = new URL(import.meta.url).searchParams.get('v') || '';
const SOLO = new URL('../../casual-farm/', import.meta.url).href;
const ART = `${SOLO}art`;
// Same camera as solo (main.js): orthographic size 35, Cinemachine follow offset, look 10 m above the target.
const ORTHO = 35;
const FOLLOW = new THREE.Vector3(77.38, 253.93, 310.62);
const LOOK_UP = 10;
// Difficulty: every level makes each pad 50 % dearer (the menu's "inflate difficulty" knob).
export const costScale = d => 1 + 0.5 * d;

const json = url => fetch(`${url}?v=${V}`).then(r => {
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
});
const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const glb = url => gltfLoader.loadAsync(`${url}?v=${V}`);

// Everything one mart needs, fetched once per page (the menu backdrop warms the same cache).
const cache = new Map();
function fetchMart(mart) {
  if (!cache.has(mart)) {
    cache.set(mart, {
      scene: Promise.all([json(`${ART}/${mart}/scene.json`), glb(`${ART}/${mart}/geo.glb`)]),
      rest: Promise.all([
        json(`${ART}/anim/clips.json`), json(`${ART}/anim/controllers.json`), json(`${ART}/items/items.json`),
        glb(`${ART}/items/items.glb`), json(`${ART}/${mart}/navmesh.json`), json(`${SOLO}data/${mart}.json`),
        json(`${ART}/fx/fx.json`), glb(`${ART}/fx/fx.glb`), json(`${ART}/ui/upgrade/icons.json`).catch(() => null),
      ]),
    });
  }
  return cache.get(mart);
}
export const prefetch = mart => { fetchMart(mart); };

// role: 'host' | 'guest' | 'attract' (the menu backdrop: a bot plays solo, nothing on screen but the store).
// host: { save, difficulty, net (HostNet built by the caller once the sim exists) }; guest: { welcome }.
export async function startGame({ canvas, hudRoot, mart, role, difficulty = 0, save = null, welcome = null, onStage = () => {} }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene3 = new THREE.Scene();
  scene3.background = new THREE.Color(0x9bd36a);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.3, 1000);
  const camFwd = new THREE.Vector2(-FOLLOW.x, -FOLLOW.z).normalize();
  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.left = -ORTHO * w / h; camera.right = ORTHO * w / h; camera.top = ORTHO; camera.bottom = -ORTHO;
    camera.updateProjectionMatrix();
    lighting.resolution.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
  };
  window.addEventListener('resize', resize);
  resize();
  // Blur stages as in solo: the store shows as soon as its geometry exists and sharpens as the rest arrives.
  const stage = (px, label) => { canvas.style.filter = px > 0 ? `blur(${px}px)` : 'none'; onStage(label); };
  stage(14, 'boot');

  const { scene, rest } = fetchMart(mart);
  const [sceneJson, gltf] = await scene;
  const world = buildWorld(sceneJson, gltf, { texBase: `${ART}/tex` });
  scene3.add(world.root);
  stage(8, 'geometry');
  const [clips, controllers, items, itemsGltf, navJson, data, fxData, fxGltf, upgradeIcons] = await rest;
  const anim = new AnimLibrary(clips, controllers);
  world.rigs = attachRigs(anim, world);
  stage(5, 'animation');

  const store = buildStore(sceneJson, data);
  if (difficulty) for (const m of store.mats) m.cost = Math.max(1, Math.round(m.cost * costScale(difficulty)));
  const nav = new NavMesh(navJson, store.player.start);
  const grid = new GridNav(nav);
  const guest = role === 'guest';
  const sim = guest ? new MirrorSim(store, welcome.you) : new CoopSim(store, { save });
  // Systems hang helpers the view reads on the sim (cars.point, boosters.cashMat) and the tasks drive the banner, so a
  // guest builds them too; only the host steps them.
  const tasks = new Tasks(sim, buildTasks(store));
  const workers = new Workers(sim, grid);
  const systems = [new Customers(sim, grid), workers, new Thief(sim, grid), new Cars(sim), new Boosters(sim), tasks];
  if (!guest) sim.systems.push(...systems);
  // No next mart in co-op: the pad stays shut.
  sim.state.next.gone = true;
  if (guest) sim.adopt(welcome.full);

  const view = new GameView({ world, store, sim, items, itemsGltf, texBase: `${ART}/tex`, anim });
  view.fx = new Fx({ root: scene3, camera, art: ART, fxData, gltf: fxGltf, texBase: `${ART}/tex`, version: V });
  const attract = role === 'attract';
  const hud = attract ? null : new Hud({ sim, store, camera, canvas, items, art: ART, world, tasks, matArrows: matArrows(store),
    nextMart: null, workerDefs: workers.defs, sound: new Sound(`${ART}/sfx`, sim, store, V), upgradeRows: upgradeIcons && upgradeIcons.stores[mart] });
  if (hud) hudRoot.classList.add('coop');
  // After the HUD: it rebuilds #hud's markup when it is made, which would drop the name tags.
  const remotes = new RemotePlayers({ view, store, camera, canvas, hudRoot });
  await Promise.all(sceneJson.textures.map(t => texture(`${ART}/tex`, t.name).full));
  stage(0, 'textures');
  const director = new CameraDirector(sim, store);
  if (hud) hud.onTaskFocus = p => director.highlight(p);

  // A guest's view smooths everyone it only hears about 10 times a second.
  if (guest) {
    const place = view.placeAgent.bind(view);
    view.placeAgent = (o, a) => {
      if (o === view.player) return place(o, a);
      const s = o.userData.smooth || (o.userData.smooth = { x: a.x, z: a.z });
      const k = 1 - Math.exp(-frameDt * 12);
      if (Math.hypot(a.x - s.x, a.z - s.z) > 8) { s.x = a.x; s.z = a.z; } else { s.x += (a.x - s.x) * k; s.z += (a.z - s.z) * k; }
      return place(o, { ...a, x: s.x, z: s.z });
    };
  }

  const bot = attract || /[?&]bot\b/.test(location.search) ? new Bot(sim, grid) : null;
  const target = new THREE.Vector3();
  const clock = new THREE.Clock();
  let frameDt = 0, running = true, orbit = 0;
  const g = {
    sim, store, view, hud, remotes, nav, grid, renderer, camera, scene: scene3, bot,
    beforeStep: () => {}, afterStep: () => {},
    stop() {
      running = false;
      window.removeEventListener('resize', resize);
      remotes.dispose();
      if (hud) hud.root.replaceChildren();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
  // Events a remote player caused animate on that player's avatar, not on this screen's own stack.
  const route = () => {
    const mine = [];
    for (const e of sim.events) (e.pid != null ? remotes.onEvent(e) : mine.push(e));
    sim.events.length = 0;
    sim.events.push(...mine);
  };
  function frame() {
    if (!running) return;
    const dt = frameDt = Math.min(clock.getDelta(), 0.1);
    if (bot) bot.step(dt);
    else if (hud) {
      // Joystick up = away from the camera on the ground plane; right = screen right.
      const j = hud.joystick();
      sim.setInput((-camFwd.y * j.x + camFwd.x * -j.y) * j.mag, (camFwd.x * j.x + camFwd.y * -j.y) * j.mag);
    }
    g.beforeStep(dt);
    sim.step(dt, { nav, grid });
    g.afterStep(dt);
    route();
    view.update(dt);
    remotes.update(dt, sim.state.remotes || {});
    for (const r of world.rigs) r.update(dt);
    const shot = director.update();
    if (attract) {
      // The backdrop drifts around the bot instead of sitting on it.
      orbit += dt * 0.15;
      target.set(sim.state.player.x + Math.sin(orbit) * 12, 0, sim.state.player.z + Math.cos(orbit * 0.7) * 8);
      shot.zoom = 0.8;
    } else target.set(shot.x, 0, shot.z);
    camera.position.copy(target).add(FOLLOW);
    camera.lookAt(target.x, LOOK_UP, target.z);
    if (camera.zoom !== 1 / shot.zoom) { camera.zoom = 1 / shot.zoom; camera.updateProjectionMatrix(); }
    if (hud) hud.update(dt);
    renderer.render(scene3, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return g;
}
