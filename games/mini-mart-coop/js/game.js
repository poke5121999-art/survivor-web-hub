// One co-op store on screen: the solo game's world, view and HUD (games/casual-farm, imported as is) around a CoopSim
// on the host or a MirrorSim on a guest. The host also gets the solo game's meta (mart map with idle income, prestige,
// shop, daily spin, the next-mart van) on the co-op store's record instead of the solo save; whatever moves the room to
// another mart goes through hooks.travel. Every player has a wardrobe of their own (Customise), seen by the others.
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
import { CityMap } from '../../casual-farm/js/view/citymap.js';
import { Looks } from '../../casual-farm/js/view/looks.js';
import { cosmeticsState, saveCosmetics, cosmeticEffects } from '../../casual-farm/js/view/customise.js';
import { Daily } from '../../casual-farm/js/view/daily.js';
import { Shop } from '../../casual-farm/js/view/shop.js';
import { featureCount } from '../../casual-farm/js/sim/shop.js';
import { martRows } from '../../casual-farm/js/sim/martmap.js';
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
// MatNextStore.FillUpCompleted: the van leaves after 1.0 s and drives for 1.5 s (solo main.js VAN_TIME).
const VAN_TIME = 2600;
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
const shared = {};
const once = (k, f) => shared[k] || (shared[k] = f());
function fetchMart(mart) {
  if (!cache.has(mart)) {
    cache.set(mart, {
      scene: Promise.all([json(`${ART}/${mart}/scene.json`), glb(`${ART}/${mart}/geo.glb`)]),
      rest: Promise.all([
        once('clips', () => json(`${ART}/anim/clips.json`)), once('ctrl', () => json(`${ART}/anim/controllers.json`)),
        once('items', () => json(`${ART}/items/items.json`)), once('itemsGlb', () => glb(`${ART}/items/items.glb`)),
        json(`${ART}/${mart}/navmesh.json`), json(`${SOLO}data/${mart}.json`),
        once('fx', () => json(`${ART}/fx/fx.json`)), once('fxGlb', () => glb(`${ART}/fx/fx.glb`)),
        once('icons', () => json(`${ART}/ui/upgrade/icons.json`).catch(() => null)),
        once('cos', () => json(`${ART}/cosmetics/cosmetics.json`)), once('cosGlb', () => glb(`${ART}/cosmetics/cosmetics.glb`)),
      ]),
    });
  }
  return cache.get(mart);
}
export const prefetch = mart => { fetchMart(mart); };
const loadPets = () => once('pets', () => Promise.all([json(`${ART}/pets/scene.json`), glb(`${ART}/pets/geo.glb`)]));

// role: 'host' | 'guest' | 'attract' (the menu backdrop: a bot plays solo, nothing on screen but the store).
// host: record (the co-op store's meta, the solo game's "global"), save (this mart's sim save), hooks { travel, save }.
// guest: welcome. Both: wardrobe { saved, keep(saved) } for the player's own looks (saveCosmetics form); marts (marts.json).
export async function startGame({ canvas, hudRoot, mart, role, difficulty = 0, save = null, welcome = null, record = null,
  marts = [], wardrobe = null, hooks = {}, onStage = () => {} }) {
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
  const [clips, controllers, items, itemsGltf, navJson, data, fxData, fxGltf, upgradeIcons, cosData, cosGltf] = await rest;
  const anim = new AnimLibrary(clips, controllers);
  world.rigs = attachRigs(anim, world);
  stage(5, 'animation');

  const host = role === 'host', guest = role === 'guest', attract = role === 'attract';
  const store = buildStore(sceneJson, data);
  if (difficulty) for (const m of store.mats) m.cost = Math.max(1, Math.round(m.cost * costScale(difficulty)));
  const nav = new NavMesh(navJson, store.player.start);
  const grid = new GridNav(nav);
  const sim = guest ? new MirrorSim(store, welcome.you) : new CoopSim(store, { save, cash: record ? record.cash || 0 : 0 });
  // HasJustPrestiged: the rebuilt mart starts at currentDemandIndex 100 (solo main.js).
  if (host && !save && record.prestige && record.prestige.id === mart) sim.state.demandIndex = 100;
  // Systems hang helpers the view reads on the sim (cars.point, boosters.cashMat) and the tasks drive the banner, so a
  // guest builds them too; only the host steps them.
  const tasks = new Tasks(sim, buildTasks(store));
  const workers = new Workers(sim, grid);
  const systems = [new Customers(sim, grid), workers, new Thief(sim, grid), new Cars(sim), new Boosters(sim), tasks];
  if (!guest) sim.systems.push(...systems);
  if (guest) sim.adopt(welcome.full);

  const view = new GameView({ world, store, sim, items, itemsGltf, texBase: `${ART}/tex`, anim });
  view.fx = new Fx({ root: scene3, camera, art: ART, fxData, gltf: fxGltf, texBase: `${ART}/tex`, version: V });
  const makeLooks = player => new Looks({ data: cosData, gltf: cosGltf, texBase: `${ART}/tex`, player, anim, loadPets });

  // --- the player's own looks ------------------------------------------------------------------------------------
  const looks = makeLooks(world.objects[store.player.node]);
  view.looks = looks;
  const wardrobeState = cosmeticsState(cosData, wardrobe ? wardrobe.saved : null);
  const wear = () => {
    looks.apply(wardrobeState.eq);
    const fx = cosmeticEffects(cosData, wardrobeState.eq);
    // A guest walks on its own screen, so its speed skill is applied there; its store-wide skills are not (the host's are).
    sim.setCosmetics(guest ? { abilities: { player: fx.abilities.player || 1 }, petCarry: fx.petCarry } : fx);
    const mine = { eq: wardrobeState.eq, petCarry: fx.petCarry };
    if (host) sim.setLooks('host', mine);
    if (hooks.looks) hooks.looks(mine);
  };
  wear();
  const cosmetics = attract ? null : { data: cosData, state: wardrobeState,
    onChange: () => { if (wardrobe) wardrobe.keep(saveCosmetics(wardrobeState)); wear(); } };

  // --- host meta: the solo main.js on the co-op record ---------------------------------------------------------------
  const order = marts.filter(m => !m.seasonal), here = order.findIndex(m => m.id === mart);
  const next = host && here >= 0 ? order[(here + 1) % order.length] : null;
  if (!next) sim.state.next.gone = true;
  let martMap = null, daily = null, shop = null, cityMap = null;
  if (host) {
    const g = record;
    g.idleAt = g.idleAt || {};
    g.visited = g.visited || [];
    if (!g.visited.includes(mart)) g.visited.push(mart);
    if (g.idleAt[mart] == null) g.idleAt[mart] = Date.now();
    g.stars = g.stars || {};
    g.gold = g.gold || 0;
    g.marts = g.marts || {};
    const doneOf = id => Object.values((id === mart ? sim.state : g.marts[id] || {}).mats || {}).filter(m => m.done).length;
    const ph = sceneJson.nodes[store.player.node] && sceneJson.nodes[store.player.node].k.PlayerHumanController;
    cityMap = new CityMap({ scene3, texBase: `${ART}/tex`, fx: view.fx, storeRoot: world.root,
      van: ph && ph.vanCarObj ? world.objects[ph.vanCarObj.n] : new THREE.Group(),
      load: () => once('citymap', () => Promise.all([json(`${ART}/citymap/scene.json`), glb(`${ART}/citymap/geo.glb`)])) });
    martMap = {
      rows: () => {
        const now = Date.now();
        for (const id of g.visited) if (g.idleAt[id] == null) g.idleAt[id] = now;
        return martRows(marts, g, doneOf, now);
      },
      collect: (row, mult = 1) => {
        const amount = Math.trunc(row.income * mult);
        g.idleAt[row.id] = Date.now();
        sim.state.cash += amount;
        sim.emit({ type: 'coinPile', amount });
        hooks.save();
      },
      go: row => hooks.travel(row.id),
      prestige: row => {
        g.stars[row.id] = row.star + 1;
        g.prestige = { id: row.id, name: row.name, icon: row.icon, star: row.star + 1, cash: row.offer.cash, gold: row.offer.gold,
          before: row.offer.now, after: row.offer.next };
        if (hud.sound) hud.sound.play('renovation');
        setTimeout(() => hooks.travel(row.id, row.id), 600);
      },
      claim: p => {
        sim.state.cash += p.cash;
        sim.emit({ type: 'coinPile', amount: p.cash });
        g.gold += p.gold;
        g.prestige = null;
        hooks.save();
      },
      global: g,
    };
    const level = +String(sceneJson.level || '').replace(/\D/g, '') || 0;
    if (level > (g.maxLevel || 0)) { g.maxLevel = level; g.maxItems = 0; }
    sim.listeners.push(e => {
      if (e.type !== 'matDone' || level !== g.maxLevel) return;
      g.maxItems = Math.max(g.maxItems || 0, new Set(store.shelves.filter(sh => sim.isActive(sh.name)).map(sh => sh.type)).size);
    });
    const cheapest = () => sim.boosters.extraCash() || Math.max(0, ...store.mats.map(m => m.cost));
    daily = new Daily({ art: ART, sound: null, g, rng: Math.random,
      wallet: { cheapest, addCash: n => { sim.state.cash += n; sim.emit({ type: 'coinPile', amount: n }); }, boost: (kind, s) => sim.boosters.grant(kind, s) },
      save: () => hooks.save(),
      unlocked: () => {
        if (mart !== 'store1' || g.showSpin) return true;
        if ((sim.state.mats.Mat_Activate_Blender || {}).done) g.showSpin = true;
        return !!g.showSpin;
      } });
    const shopOn = () => {
      const s = g.shop || (g.shop = {});
      if (!s.on && (mart !== 'store1' || (sim.state.mats.Mat_Activate_Cashier || {}).done)) s.on = true;
      return !!s.on;
    };
    shop = new Shop({ art: ART, sound: null, g, save: () => hooks.save(), unlocked: shopOn,
      wallet: {
        cash: () => sim.state.cash,
        spendCash: n => { sim.state.cash -= n; },
        addCash: n => { sim.state.cash += n; sim.emit({ type: 'coinPile', amount: n }); },
        boost: (kind, s) => sim.boosters.grant(kind, s),
        cheapest,
        features: () => featureCount(g.visited.map(doneOf)),
        shake: () => hud.shakeCash(),
      } });
    sim.listeners.push(e => { if (e.type === 'depart') setTimeout(() => hooks.travel(next.id), VAN_TIME); });
  }

  const hud = attract ? null : new Hud({ onDeleteAccount: hooks.deleteAccount, sim, store, camera, canvas, items, art: ART, world, tasks, matArrows: matArrows(store),
    nextMart: next, workerDefs: workers.defs, sound: new Sound(`${ART}/sfx`, sim, store, V), martMap, cosmetics, daily, shop,
    upgradeRows: upgradeIcons && upgradeIcons.stores[mart],
    onMapView: i => {
      if (!cityMap) return;
      if (i == null) { cityMap.hide(); sim.state.mapMode = false; } else { sim.state.mapMode = true; if (cityMap.open) cityMap.goTo(i); else cityMap.show(martMap.rows(), i); }
    } });
  if (hud) {
    hudRoot.classList.add('coop');
    hudRoot.classList.toggle('coop-guest', guest);
    if (daily) daily.sound = hud.sound;
    if (shop) shop.sound = hud.sound;
    // Outfits cost the store's shared cash; gold is the store's (prestige), kept on the host.
    if (hud.customise) hud.customise.wallet = hooks.wallet || {
      cash: () => sim.state.cash, spendCash: n => { sim.state.cash -= n; },
      gold: () => (record ? record.gold || 0 : 0), spendGold: n => { record.gold -= n; },
    };
  }
  // After the HUD: it rebuilds #hud's markup when it is made, which would drop the name tags.
  const remotes = new RemotePlayers({ view, store, camera, canvas, hudRoot, makeLooks });
  await Promise.all(sceneJson.textures.map(t => texture(`${ART}/tex`, t.name).full));
  stage(0, 'textures');
  const director = new CameraDirector(sim, store);
  if (hud) hud.onTaskFocus = p => director.highlight(p);
  // Boosters still running when the store was saved carry on (solo main.js, global.boostLeft in play seconds).
  if (host) for (const [kind, s] of Object.entries(record.boostLeft || {})) if (s > 0) sim.boosters.grant(kind, s);
  if (host && hud && hud.martMenu && record.prestige && record.prestige.id === mart) hud.martMenu.showWelcome(record.prestige);
  else if (host && daily && !save && !hooks.quiet) {
    const m = marts.find(x => x.id === mart);
    if (m) daily.showWelcome({ id: m.id, name: m.name, level: m.level, icon: `${ART}/ui/${m.icon}.webp` });
  }

  // A guest's view smooths everyone it only hears about 10 times a second.
  let frameDt = 0;
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
  let running = true, orbit = 0;
  const g = {
    sim, store, view, hud, remotes, looks, nav, grid, renderer, camera, scene: scene3, bot, record, mart, cityMap,
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
    looks.update(dt);
    remotes.update(dt, sim.state.remotes || {});
    for (const r of world.rigs) r.update(dt);
    const shot = director.update();
    if (attract) {
      // The backdrop drifts around the bot instead of sitting on it.
      orbit += dt * 0.15;
      target.set(sim.state.player.x + Math.sin(orbit) * 12, 0, sim.state.player.z + Math.cos(orbit * 0.7) * 8);
      shot.zoom = 0.8;
    } else target.set(shot.x, 0, shot.z);
    // Map mode: the camera follows the van on the city map (CameraController.GoIntoMapMode).
    if (cityMap && cityMap.open && cityMap.ready) {
      cityMap.update(dt, hud.martMenu && hud.martMenu.rows);
      target.set(cityMap.target.x, 0, cityMap.target.z);
      shot.zoom = 1;
    }
    camera.position.copy(target).add(FOLLOW);
    camera.lookAt(target.x, LOOK_UP, target.z);
    // Customise screen: zoom on the player and lift it into the open top of the screen (solo main.js).
    const dressing = hud && hud.customise && hud.customise.isOpen;
    if (dressing) { target.set(sim.state.player.x, 0, sim.state.player.z); camera.position.copy(target).add(FOLLOW); camera.lookAt(target.x, LOOK_UP, target.z); shot.zoom = 0.45; }
    if (!!dressing !== !!(camera.view && camera.view.enabled)) {
      if (dressing) camera.setViewOffset(canvas.clientWidth, canvas.clientHeight, 0, canvas.clientHeight * 0.33, canvas.clientWidth, canvas.clientHeight);
      else camera.clearViewOffset();
    }
    if (camera.zoom !== 1 / shot.zoom) { camera.zoom = 1 / shot.zoom; camera.updateProjectionMatrix(); }
    if (hud) hud.update(dt);
    renderer.render(scene3, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return g;
}
