// Pet Shop Simulator web remake (three.js, no build step). Boots the store scene, the runtime prefabs and the original
// uGUI canvas from the extracted data, runs the rules (js/sim/sim.js) and draws them.
// URL flags: ?fresh ignores the save, ?speed=N runs the sim N times faster (tests), ?cam=x,y,z,yawDeg,pitchDeg.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import MeshoptDecoder from '../vendor/meshopt_decoder.js';
import { buildWorld } from './view/world.js';
import { lighting } from './view/std.js';
import { AnimLibrary } from './view/anim.js';
import { Pool } from './view/pool.js';
import { GameView } from './view/game.js';
import { Player, CollisionGrid } from './view/player.js';
import { Hud } from './view/hud.js';
import { Sound } from './view/audio.js';
import { Sim, pointsToNext } from './sim/sim.js';

const params = new URLSearchParams(location.search);
const V = new URL(import.meta.url).searchParams.get('v') || '';
const BASE = new URL('../', import.meta.url).href;
const ART = `${BASE}art`;
const SAVE_KEY = 'ps-save-v1';
const readJson = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } };

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
// Gamma colour space project (PlayerSettings.m_ActiveColorSpace 0): raw values in, raw values out.
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
const scene3 = new THREE.Scene();
// Cinemachine lens of "PlayerVirtual Camera" did not decode; 60 deg vertical FOV [GUESS] (Main Camera serializes 50).
const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 400);
scene3.add(camera);
const game = window.__game = { stage: 'boot', errors: [] };
window.addEventListener('error', e => game.errors.push(String(e.message)));
window.addEventListener('unhandledrejection', e => game.errors.push(String(e.reason && e.reason.stack || e.reason)));

const json = url => fetch(`${url}?v=${V}`).then(r => { if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r.json(); });
const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const glb = url => gltfLoader.loadAsync(`${url}?v=${V}`);

function resize() {
  const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

(async () => {
  const [storeJ, storeG, poolJ, poolG, ui, G, L, nav, col, clips, ctrls, text, rewards] = await Promise.all([
    json(`${ART}/store/scene.json`), glb(`${ART}/store/geo.glb`), json(`${ART}/pool/scene.json`), glb(`${ART}/pool/geo.glb`),
    json(`${ART}/ui/ui.json`), json(`${BASE}data/game.json`), json(`${BASE}data/layout.json`), json(`${ART}/store/navmesh.json`),
    json(`${ART}/store/colliders.json`), json(`${ART}/anim/clips.json`), json(`${ART}/anim/controllers.json`),
    json(`${BASE}data/text.json`), json(`${BASE}data/rewards.json`)]);
  const store = buildWorld(storeJ, storeG, { texBase: `${ART}/tex` });
  scene3.add(store.root);
  const lib = new AnimLibrary(clips, ctrls);
  const poolW = buildWorld(poolJ, poolG, { texBase: `${ART}/tex` });
  scene3.add(poolW.root);
  const pool = new Pool(poolW, lib);
  // Lighting: level1 has no Light and no lightmaps; RenderSettings ambient is Trilight (sky / equator / ground) x
  // m_AmbientIntensity. Unity adds albedo * ambient; three.js divides indirect diffuse by PI (BRDF_Lambert), hence the PI.
  // Trilight = equator everywhere + a hemisphere of (sky - equator) above / (ground - equator) below.
  const R = storeJ.render || {};
  const rgb = c => new THREE.Color(c.r, c.g, c.b);
  const amb = R.m_AmbientIntensity ?? 1;
  const eq = rgb(R.m_AmbientEquatorColor || { r: 0.8, g: 0.8, b: 0.8 });
  const ambient = new THREE.AmbientLight(eq, Math.PI * amb);
  scene3.add(ambient);
  const hemi = new THREE.HemisphereLight(rgb(R.m_AmbientSkyColor || { r: 1, g: 1, b: 1 }).sub(eq), rgb(R.m_AmbientGroundColor || { r: 0.1, g: 0.1, b: 0.1 }).sub(eq), Math.PI * amb);
  scene3.add(hemi);
  game.lights = { ambient, hemi };
  scene3.background = new THREE.Color(0.53, 0.71, 0.88);
  // RestrictAreaHelper.Start hides the red no-placement zone; it only shows while furniture is being moved.
  for (const o of store.objects) { const k = o.userData.node.k && o.userData.node.k.RestrictAreaHelper; if (k && k.restrictArea && k.restrictArea.n != null) store.objects[k.restrictArea.n].visible = false; }

  const fresh = params.has('fresh');
  // an object is active when it and all its parents are visible (walls of the current expansion, the storage shutter...)
  const isOn = node => { let o = store.objects[node]; while (o) { if (!o.visible) return false; o = o.parent; } return true; };
  // FurniturePlaceHelper's BoundingBoxDetector tests every active collider: the scene BoxColliders that are on now
  const solids = () => col.boxes.filter(b => isOn(b.node)).map(b => ({ c: b.c, size: b.size, yaw: b.yaw }));
  const sim = new Sim(G, L, storeJ, nav, { save: fresh ? null : readJson(SAVE_KEY), colliders: col, solids });
  const view = new GameView({ scene3, store, pool, sim, G, L, camera, uiBase: `${ART}/ui` });
  const P0 = storeJ.nodes.find(n => n.n === 'Player' && n.k && n.k['StarterAssets.FirstPersonController']);
  const fpc = P0.k['StarterAssets.FirstPersonController'];
  const yaw0 = 2 * Math.atan2(P0.r ? P0.r[1] : 0, P0.r ? P0.r[3] : 1);
  const player = new Player(camera, canvas, { x: P0.t[0], z: P0.t[2], yaw: yaw0, speed: fpc.MoveSpeed, height: 1.6, sens: fpc.sensitivity });
  if (params.get('cam')) { const c = params.get('cam').split(',').map(Number); player.x = c[0]; player.height = c[1]; player.z = c[2]; player.yaw = c[3] * Math.PI / 180; player.pitch = (c[4] || 0) * Math.PI / 180; }
  const grid = new CollisionGrid(col);
  const sound = new Sound(`${ART}/audio`);
  const mode = { checkout: false, ui: false };
  const ray = new THREE.Raycaster();
  ray.far = 6;   // PlayerInteraction.rayDistance
  let target = null, mouse = null, holdT = 0;
  const lastGive = [];

  const ctx = {
    sim, G, L, player, sound, lastGive, text, rewards,
    interact: () => interact(),
    press: () => press(), release: () => release(),
    openBox: () => openBox(),
    place: a => placeAction(a),
    throwBox: () => throwBox(),
    exitCheckout: () => setCheckout(false),
    inCheckout: () => mode.checkout,
    uiOpen: on => { mode.ui = on; if (on && document.pointerLockElement) document.exitPointerLock(); },
    saveNow: () => writeJson(SAVE_KEY, sim.save()),
  };
  const hud = new Hud(document.getElementById('hud'), ui, `${ART}/ui`, `${ART}/icons`, ctx);
  Object.assign(game, { sim, view, player, hud, sound, mode, G, L });
  // test helpers: stand at (x, z) and look at a world point
  game.lookAt = (x, y, z, fromX, fromZ) => {
    if (fromX != null) { player.x = fromX; player.z = fromZ; }
    const dx = x - player.x, dy = y - player.height, dz = z - player.z;
    player.yaw = Math.atan2(-dx, -dz);
    player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  };

  // PlayerObjectMover: tap = interact, holding thresholdTime 1.25 s on a placed furniture picks it up to move it.
  const HOLD = 1.25;
  let pressT = null, pressTarget = null;
  const movable = t => t && (t.kind === 'cab' || t.kind === 'plate' || t.kind === 'scab' || t.kind === 'furn') && !sim.heldBox() && !sim.s.placing;
  function press() {
    if (mode.ui || mode.checkout) return;
    if (sim.s.placing) { placeAction('place'); return; }
    if (movable(target)) { pressT = 0; pressTarget = target; return; }
    interact();
  }
  function release() {
    if (pressT != null && pressT < HOLD && pressTarget) interact(pressTarget);
    pressT = null; pressTarget = null;
  }
  function openBox() {
    const b = sim.heldBox();
    if (!b) return;
    if (b.kind === 'f' || b.kind === 's') { if (sim.beginPlaceBox()) sound.sfx('5_BoxOpen'); }
    else sim.setOpen(!b.open);
  }
  function placeAction(a) {
    if (!sim.s.placing) return;
    if (a === 'right') sim.rotatePlacing(-1);
    else if (a === 'left') sim.rotatePlacing(1);
    else if (a === 'cancel') sim.cancelPlace();
    else if (a === 'sell') { const r = sim.sellPlacing(); if (r.ok) sound.sfx('34_SuccessSound'); else if (r.why) hud.alert(r.why); }
    else if (a === 'place') { const r = sim.confirmPlace(); if (r.ok) sound.sfx('6_ItemPlacement'); else hud.alert(r.why); }
  }
  // StayFrontHelper: the held furniture sits where the camera ray meets the floor (surface layers), 0.135..10 m away
  const floorPoint = () => {
    const d = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    let t = d.y < -1e-3 ? -camera.position.y / d.y : 10;
    const flat = Math.hypot(d.x, d.z) || 1;
    const dist = Math.max(1.0, Math.min(t * flat, 4.5));   // [GUESS clamp for a mouse/touch camera]
    return [camera.position.x + d.x / flat * dist, camera.position.z + d.z / flat * dist];
  };

  function throwBox() {
    if (sim.s.placing) return;
    const d = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const x = player.x + d.x * 0.9, z = player.z + d.z * 0.9;
    sim.drop(x, 0, z, player.yaw);
    sound.sfx('3_BoxThrow');
  }

  function setCheckout(on) {
    mode.checkout = on;
    sim.checkout.using = on;
    if (on && document.pointerLockElement) document.exitPointerLock();
    player.enabled = !on;
  }

  // PlayerInteraction.Interact on the current target.
  function interact(t = target) {
    if (!t || mode.ui) return;
    const held = sim.heldBox();
    switch (t.kind) {
      case 'box': if (!held) { sim.pick(t.id); sound.sfx('4_BoxPick'); } break;
      case 'cab': {
        if (!held) { const c = sim.cab(t.fid, t.i); if (c && c.st.n > 0) hud.openPrice(c.st.p); break; }
        const r = sim.place(t.fid, t.i);
        if (r.ok) sound.sfx('6_ItemPlacement');
        else if (r.why === 'wrongStorage') hud.alert('wrongStorage', { 1: 'Rack', 2: 'Fridge', 3: 'Animal Cage', 4: 'Reptile Cage', 5: 'Aquarium', 6: 'Bird Cage' }[r.need]);
        else if (r.why) hud.alert(r.why);
        break;
      }
      case 'plate': { const c = sim.cab(t.fid, t.i); if (c && c.st.p) hud.openPrice(c.st.p); break; }
      case 'laptop': if (!held) hud.openStore(); break;
      case 'counter': if (held) break; if (sim.cashierWorking()) hud.alert('cashierBusy'); else setCheckout(true); break;
      case 'scab': if (held) { const r = sim.storeBox(t.fid, t.i); if (r.ok) sound.sfx('6_ItemPlacement'); else if (r.why) hud.alert(r.why); } break;
      case 'storageLocked': hud.alert('Alert_LowLevel'); hud.openStore(); hud.storeSection('Service'); break;
      case 'cashier':
        if (!sim.s.cashierService) { hud.alert('service'); break; }
        hud.openHire(); break;
      case 'atm': case 'cashMachine': case 'energyMachine': {
        const r = sim.claim(t.kind);
        if (r.ok) { sound.sfx('34_SuccessSound'); hud.alert(r.what === 'cash' ? 'Alert_FreeCash' : 'Alert_FreeEnergy'); } else hud.alert(r.why);
        break;
      }
      case 'board': hud.openStoreName(); break;
      case 'sign': if (sim.toggleOpen()) sound.sfx(sim.s.open ? '14.1_ShopOpen' : '13_ShopClosed'); else hud.alert('Alert_CloseStore'); break;
      case 'trash': { const r = sim.trash(); if (r.ok) sound.sfx('15_TrashThrow'); else if (r.why) hud.alert(r.why); break; }
      case 'scan': if (sim.scan(t.idx)) sound.sfx('7_ItemScan'); break;
      case 'pay': if (sim.takePayment()) sound.sfx(sim.checkout.method === 1 ? '37_CashPanel' : '38_CardPanel'); break;
    }
  }

  // keyboard
  addEventListener('keydown', e => {
    if (e.repeat) return;
    if (e.code === 'KeyE') press();
    if (e.code === 'KeyF') openBox();
    if (e.code === 'KeyG') throwBox();
    if (e.code === 'KeyR') placeAction('right');
    if (e.code === 'KeyQ') placeAction('left');
    if (e.code === 'Escape') { if (hud.over) hud.overlay(hud.over, false); else if (hud.modal) hud.closeModal(); else if (sim.s.placing) sim.cancelPlace(); else if (mode.checkout) setCheckout(false); }
  });
  addEventListener('keyup', e => { if (e.code === 'KeyE') release(); });
  canvas.addEventListener('mousedown', e => { if (e.button === 0 && document.pointerLockElement && !mode.checkout) press(); });
  addEventListener('mouseup', e => { if (e.button === 0) release(); });
  canvas.addEventListener('click', e => {
    sound.unlock();
    if (mode.ui) return;
    if (mode.checkout) {
      const r = canvas.getBoundingClientRect();
      mouse = new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
      ray.setFromCamera(mouse, camera);
      const hit = ray.intersectObjects(view.targets(), false).find(h => h.object.userData.hit.kind === 'scan' || h.object.userData.hit.kind === 'pay');
      if (hit) interact(hit.object.userData.hit);
      return;
    }
    if (e.pointerType !== 'touch' && !document.pointerLockElement && matchMedia('(pointer: fine)').matches) { canvas.requestPointerLock && canvas.requestPointerLock(); return; }
  });

  // ObjectiveBar (TaskManager + GameHudUIHelper): day-end tips, the store-empty / store-closed tips, else the current task
  // (Task_1_n "Complete checkouts." with n/5, Task_2..Task_5). Texts are the I2 terms in the chosen language.
  function objective() {
    const s = sim.s, T = hud.T;
    if (sim.canEndDay()) return { text: T('Tip_DayEnd_3'), icon: 'dayEndIcon' };
    if (s.ended) return { text: T('Tip_DayEnd_2'), icon: 'dayEndIcon' };
    if (s.tooLate && s.open) return { text: T('Tip_DayEnd_1'), icon: 'dayEndIcon' };
    if (!sim.cabinets().some(c => c.st.n > 0)) return { text: T('Tip_StoreEmpty'), icon: 'sadIcon' };
    if (!s.open) return { text: T('Tip_StoreClosed'), icon: 'openSignIcon' };
    if (s.task === 1) return { text: T(`Task_1_${s.taskN}`), icon: 'checkOutIcon', n: s.taskN, count: 5 };
    return { text: T(`Task_${s.task}`), icon: 'normalIcon' };
  }

  // events -> sounds, alerts, level up
  function drainEvents() {
    for (const ev of sim.events.splice(0)) {
      if (ev.type === 'delivered') sound.sfx('2_OrderArrival');
      if (ev.type === 'levelUp') { sound.sfx('26_LevelUp'); hud.levelUp(ev.level); }
      if (ev.type === 'lowEnergy') hud.lowEnergy();
      if (ev.type === 'lowCash') hud.lowCash();
      if (ev.type === 'taskComplete') { sound.sfx('34_SuccessSound'); hud.taskTick(); writeJson(SAVE_KEY, sim.save()); }
      if (ev.type === 'furniturePlaced' || ev.type === 'service' || ev.type === 'hired' || ev.type === 'sold') writeJson(SAVE_KEY, sim.save());
      if (ev.type === 'customerEnter') sound.sfx('32_CustomerEnter');
      if (ev.type === 'checkout') { sound.sfx('39_RecieptClip'); writeJson(SAVE_KEY, sim.save()); }
      if (ev.type === 'dayEnd') { sound.sfx('14_DayEnd'); }
      if (ev.type === 'give') lastGive.push(ev.cents);
      if (ev.type === 'payScreen') lastGive.length = 0;
      game.lastEvent = ev;
    }
  }

  resize();
  game.stage = 'ready';
  const clock = new THREE.Clock();
  let saveT = 5;
  const speed = +(params.get('speed') || 1);
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    for (let i = 0; i < speed; i++) sim.step(dt);
    drainEvents();
    // only the current expansion's walls and a closed storage shutter are solid
    grid.update(isOn, sim.s.furniture.map(f => { const lay = sim.layoutOf(f); const c = lay.collider; if (!c) return null; const [x, z] = sim.toWorld(f, c.c); return { c: [x, z], size: [c.size[0], c.size[2]], yaw: f.yaw + c.yaw }; }).filter(Boolean));
    if (mode.checkout) {
      view.counterCam.updateMatrixWorld(true);
      view.counterCam.getWorldPosition(camera.position);
      view.counterCam.getWorldQuaternion(camera.quaternion);
    } else player.update(dt, grid);
    if (sim.s.placing) { const [x, z] = floorPoint(); sim.movePlacing(x, z); }
    if (pressT != null) {
      pressT += dt;
      if (pressT >= HOLD && pressTarget) { sim.beginMove(pressTarget.fid); sound.sfx('4_BoxPick'); pressT = null; pressTarget = null; }
    }
    view.update(dt);
    // centre ray (PlayerInteraction.CheckInteractable)
    target = null;
    if (!mode.checkout && !mode.ui && !sim.s.placing) {
      ray.setFromCamera(new THREE.Vector2(0, 0), camera);
      const held = sim.heldBox();
      const hits = ray.intersectObjects(view.targets(), false);
      // a furniture's outer collider is hit before its shelves: prefer a shelf / plate / storage cabinet of the same
      // furniture further along the ray
      const valid = t => !(t.kind === 'cab' && !held && !(sim.cab(t.fid, t.i) || { st: {} }).st.n) && !(t.kind === 'scab' && !held);
      for (const h of hits) {
        let t = h.object.userData.hit;
        if (t.kind === 'furn') {
          const inner = hits.find(x => { const u = x.object.userData.hit; return u.fid === t.fid && u.kind !== 'furn' && valid(u); });
          if (inner) t = inner.object.userData.hit;
          else if (held) continue;
        }
        if (t.kind === 'scan' || t.kind === 'pay') continue;
        if (held && (t.kind === 'box' || t.kind === 'laptop' || t.kind === 'counter' || t.kind === 'cashier' || t.kind === 'board')) continue;
        if (!held && t.kind === 'scab') continue;
        if (!held && t.kind === 'trash') continue;
        if (t.kind === 'cab' && !held && !(sim.cab(t.fid, t.i) || { st: {} }).st.n) continue;
        target = t; break;
      }
    }
    // HoldButtonInvoker: keeping E / the Interact button pressed on a shelf repeats the placement [GUESS 0.15 s]
    if (target && target.kind === 'cab' && sim.heldBox() && (player.keys.has('KeyE') || game.holdInteract)) {
      holdT -= dt; if (holdT <= 0) { interact(); holdT = 0.15; }
    } else holdT = 0.3;
    hud.update(dt, { target, pointsToNext: pointsToNext(G, sim.s.level), objective: objective(), placeOk: view.placeOk,
      hold: pressT != null && pressTarget ? Math.min(1, pressT / HOLD) : 0 });
    game.target = target;
    if ((saveT -= dt) <= 0) { saveT = 5; writeJson(SAVE_KEY, sim.save()); }
    renderer.render(scene3, camera);
  });
})().catch(e => { game.errors.push(String(e.stack || e)); console.error(e); });
