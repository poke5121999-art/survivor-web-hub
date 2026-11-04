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
import { DayNight } from './view/sky.js';
import { KeyLabels } from './view/keys.js';
import { Sim, pointsToNext } from './sim/sim.js';
import { TUT_STEPS, TUT_NAME } from './sim/tutorial.js';

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
  const [storeJ, storeG, poolJ, poolG, ui, G, L, nav, col, clips, ctrls, text, rewards, skyJ] = await Promise.all([
    json(`${ART}/store/scene.json`), glb(`${ART}/store/geo.glb`), json(`${ART}/pool/scene.json`), glb(`${ART}/pool/geo.glb`),
    json(`${ART}/ui/ui.json`), json(`${BASE}data/game.json`), json(`${BASE}data/layout.json`), json(`${ART}/store/navmesh.json`),
    json(`${ART}/store/colliders.json`), json(`${ART}/anim/clips.json`), json(`${ART}/anim/controllers.json`),
    json(`${BASE}data/text.json`), json(`${BASE}data/rewards.json`), json(`${ART}/sky/sky.json`)]);
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
  scene3.background = new THREE.Color(0.53, 0.71, 0.88);   // behind the skybox faces only while they load
  const dnComp = storeJ.nodes.find(n => n.k && n.k.DayNightCycle).k.DayNightCycle;
  const dayNight = new DayNight({ scene3, camera, dn: dnComp, sky: skyJ, base: `${ART}/sky`, ambient, hemi, equator: eq,
    ground: rgb(R.m_AmbientGroundColor || { r: 0.1, g: 0.1, b: 0.1 }) });
  // RestrictAreaHelper.Start hides the red no-placement zone; it only shows while furniture is being moved.
  for (const o of store.objects) { const k = o.userData.node.k && o.userData.node.k.RestrictAreaHelper; if (k && k.restrictArea && k.restrictArea.n != null) store.objects[k.restrictArea.n].visible = false; }

  const fresh = params.has('fresh');
  // an object is active when it and all its parents are visible (walls of the current expansion, the storage shutter...)
  const isOn = node => { let o = store.objects[node]; while (o) { if (!o.visible) return false; o = o.parent; } return true; };
  // FurniturePlaceHelper's BoundingBoxDetector tests every active collider: the scene BoxColliders that are on now
  const solids = () => col.boxes.filter(b => isOn(b.node)).map(b => ({ c: b.c, size: b.size, yaw: b.yaw }));
  const sim = new Sim(G, L, storeJ, nav, { save: fresh ? null : readJson(SAVE_KEY), colliders: col, solids, noTutorial: params.has('notut') });
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
  let target = null, mouse = null, holdT = 0, birdsStopped = false;
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
  const movable = t => t && (t.kind === 'cab' || t.kind === 'plate' || t.kind === 'scab' || t.kind === 'furn') && !sim.heldBox() && !sim.s.placing && !sim.tut.active();
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
    if (b.kind === 'f' || b.kind === 's') { if (sim.beginPlaceBox()) sound.sfx('5_BoxOpening'); }
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

  const exitHidden = () => { const t = sim.tut.type(); return t === 13 || t === 14 || t === 15 || (sim.tut.between() && (t === 14 || t === 15 || t === 16)); };
  function setCheckout(on) {
    if (!on && exitHidden()) return;
    if (mode.checkout !== on) sim.tutEvent(on ? 'counterEnter' : 'counterLeave');   // CheckOutCounter start / leave actions
    mode.checkout = on;
    sim.checkout.using = on;
    if (on && document.pointerLockElement) document.exitPointerLock();
    player.enabled = !on;
  }

  // PlayerInteraction.Interact on the current target.
  function interact(t = target) {
    if (!t || mode.ui) return;
    if (!tutAllows(t)) return;
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
      case 'laptop': if (!held) { hud.openStore(); sim.tutEvent('laptop'); } break;   // LaptopDesk.OnLaptopInteractEvent
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
    if (e.code === 'Escape') { if (hud.over) hud.overlay(hud.over, false); else if (hud.modal) hud.closeModal(); else if (sim.s.placing) sim.cancelPlace(); else if (mode.checkout && !exitHidden()) setCheckout(false); }
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

  // ---- tutorial (Tutorial component, js/sim/tutorial.js): screens, the camera turn, the 3D arrow, HUD gating, fingers
  const tutK = storeJ.nodes.find(n => n.k && n.k.Tutorial).k.Tutorial;
  const tutIcon = {};
  for (const d of tutK.stepDataList) if (d.stepIcon) tutIcon[d.tutorialStepType] = `tut_${d.stepIcon.id}.webp`;
  const TP = sim.points.tut;
  let lookTw = null;
  // Tutorial.LookAtTarget: body yaw then camera pitch towards the target over 0.5 s, OutQuad
  function lookAtTween(p, dur = 0.5) {
    if (!p) return;
    const dx = p[0] - player.x, dy = p[1] - player.height, dz = p[2] - player.z;
    if (Math.hypot(dx, dz) < 1e-5) return;
    let yaw = Math.atan2(-dx, -dz);
    while (yaw - player.yaw > Math.PI) yaw -= 2 * Math.PI;
    while (yaw - player.yaw < -Math.PI) yaw += 2 * Math.PI;
    lookTw = { y0: player.yaw, p0: player.pitch, y1: yaw, p1: Math.atan2(dy, Math.hypot(dx, dz)), t: 0, dur };
  }
  const add = (p, o) => p && [p[0] + o[0], p[1] + o[1], p[2] + o[2]];
  const tutBoxPos = () => { const b = sim.s.boxes.find(x => x.id === sim.s.tutBox); return b && [b.x, b.y, b.z]; };
  const rackCab1 = () => {
    const c9 = sim.tut.cab9 || sim.tut.tutCabinet();
    const f = c9 && sim.s.furniture.find(x => x.id === c9[0]); if (!f) return null;
    const c = sim.layoutOf(f).cabinets[c9[1]]; const [x, z] = sim.toWorld(f, c.coll ? c.coll.c : [0, 0, 0]); return [x, 0.047, z];
  };
  const platePos = () => { const f = sim.s.furniture.find(x => x.kind === 'f' && x.cab.some(c => c.n > 0)); if (!f) return TP.tut_RackPos; const i = f.cab.findIndex(c => c.n > 0); const c = sim.layoutOf(f).cabinets[i]; if (!c.plate) return TP.tut_RackPos; const [x, z] = sim.toWorld(f, c.plate); return [x, c.plate[1], z]; };
  // ForceTutorialStepCompleter: trigger volumes (scene nodes 163-167, "once" 0) that turn the camera to the step's target
  // (0.35 s) whenever the player walks in while that step's force collider is on
  const FORCE = [];
  for (const [ni, n] of storeJ.nodes.entries()) {
    const k = n.k && n.k.ForceTutorialStepCompleter;
    if (!k) continue;
    const w = sim.worldOf(ni), bc = n.k.BoxCollider, sc = w.s;
    FORCE.push({ step: { 1: 8, 2: 9, 3: 10, 4: 11, 5: 12 }[k.forceStep], c: [w.t[0] + bc.m_Center.x * sc[0], w.t[2] - bc.m_Center.z * sc[2]],
      h: [bc.m_Size.x * sc[0] / 2, bc.m_Size.z * sc[2] / 2], target: { 1: () => tutBoxPos(), 2: () => rackCab1(), 3: () => TP.tut_TrashtBin, 4: () => platePos(), 5: () => TP.tut_StoreSign }[k.forceStep], inside: false });
  }
  // the HUD Navigation element (hudElement) position per step: the off-screen indicator points at it
  const TUT_NAV = {
    8: () => tutBoxPos(), 9: () => TP.tut_RackPos, 10: () => add(TP.tut_TrashtBin, [0, 0.75, 0]), 11: () => TP.tut_RackPos,
    12: () => TP.tut_StoreSign, 13: () => TP.tut_CheckOutCounter, 17: () => add(TP.tut_LaptopDesk, [0, 0.75, 0]),
    20: () => add(deliveredPos(), [0, 0.5, 0]), 21: () => add(TP.tut_AnimalCage, [0, 1.5, 0]),
  };
  // forced first actions: during the tutorial only the current step's interactable answers [ĐỀ XUẤT on top of the
  // original's disabled colliders, so the guided order cannot be broken]
  const tutAllows = t => {
    if (!sim.tut.active()) return true;
    if (sim.tut.between()) return false;
    const st = sim.tut.type(), s = sim.s;
    switch (st) {
      case 8: return t.kind === 'box' && t.id === s.tutBox;
      case 9: return t.kind === 'cab' && sim.tut.canPlace(t.fid, t.i);
      case 10: return t.kind === 'trash';
      case 11: return t.kind === 'plate' || t.kind === 'cab';
      case 12: return t.kind === 'sign';
      case 13: return t.kind === 'counter';
      case 14: case 15: return t.kind === 'scan' || t.kind === 'pay';
      case 17: return t.kind === 'laptop';
      case 20: return t.kind === 'box' && s.tutDelivered.includes(t.id);
      case 21: return t.kind === 'cab';
      default: return false;
    }
  };
  game.tutAllows = tutAllows;
  const deliveredPos = () => { const b = sim.s.boxes.find(x => sim.s.tutDelivered.includes(x.id)); return b && [b.x, b.y, b.z]; };
  // arrow offsets of SetupTutorialStepEvent (Unity z negated) and the LookAtTarget targets
  const TUT_ARROW = {
    8: () => add(tutBoxPos(), [0, 1.0, 0]), 9: () => add(rackCab1(), [0, 2.5, 0]), 10: () => add(TP.tut_TrashtBin, [0, 1.75, 0]),
    12: () => add(TP.tut_StoreSign, [-0.08, 0.65, 0]), 13: () => add(sim.points.counter, [1.24, 1.7, 1.0]),
    17: () => add(TP.tut_LaptopDesk, [0, 1.75, 0]), 20: () => add(deliveredPos(), [0, 1.0, 0]), 21: () => add(TP.tut_AnimalCage, [0, 1.3, 0]),
  };
  const TUT_LOOK = {
    3: () => TP.tut_BoardPos, 8: tutBoxPos, 9: () => TP.tut_RackPos, 10: () => TP.tut_TrashtBin, 11: () => TP.tut_RackPos,
    12: () => TP.tut_StoreSign, 13: () => TP.tut_CheckOutCounter, 17: () => TP.tut_LaptopDesk, 20: () => TP.tut_AnimalCatBox, 21: () => TP.tut_AnimalCage,
  };
  function tutEnter(t) {
    if (t === 1) hud.showLanguage(() => sim.tutEvent('language'));
    if (t === 2) hud.tutScreen('Welcome Screen', true, () => sim.tutEvent('welcome'));
    if (t === 3) hud.openStoreName();
    if (t === 5) hud.tutScreen('MoveCamera', true);
    if (t === 6) hud.tutScreen('Move JoyStick', true);
    if (TUT_LOOK[t]) lookAtTween(TUT_LOOK[t]());
    tutArrow = TUT_ARROW[t] || null;
  }
  function tutLeave(t) {
    if (t === 2) hud.tutScreen('Welcome Screen', false);
    if (t === 5) hud.tutScreen('MoveCamera', false);
    if (t === 6) hud.tutScreen('Move JoyStick', false);
    tutArrow = null;
  }
  let tutArrow = null;
  game.turning = () => !!lookTw;
  player.onLook = () => sim.tutEvent('look');      // TouchField.OnTouchDownAction
  let movedOnce = false;
  player.onMove = () => { movedOnce = true; sim.tutEvent('move'); };      // FloatingJoystick.OnJoystickMoveAction
  // keyboard help on desktops (key caps under the on-screen controls + a first move/look bubble), as games/food-gang does
  const keyLabels = KeyLabels.wanted() ? new KeyLabels(hud) : null;
  game.keyLabels = keyLabels;
  // CashPaymentTutorial / CardPayemntTutorial: the finger on the next note/coin (largest not overshooting) or digit
  const NOTES = [[5000, 'CashButtons/50$'], [2000, 'CashButtons/20$'], [1000, 'CashButtons/10$'], [500, 'CashButtons/5$'], [100, 'CashButtons/1$'],
    [50, 'CoinsButtons/50C'], [25, 'CoinsButtons/20C'], [10, 'CoinsButtons/10C'], [5, 'CoinsButtons/5C'], [1, 'CoinsButtons/1C']];
  function payFinger() {
    const k = sim.checkout;
    if (k.phase !== 'pay') return null;
    if (k.method === 1) {
      const B = 'HudUI/CheckOutCounter/CashPayment/Panels/';
      const left = k.change - k.given;
      if (left === 0) return `${B}LowerButtons/OK`;
      const n = NOTES.find(([v]) => v <= left);
      return n && left > 0 ? B + n[1] : `${B}LowerButtons/Back`;
    }
    const B = 'HudUI/CheckOutCounter/CardPayment/Panel/Buttons/';
    const want = (k.bill / 100).toFixed(2);
    if (k.card === want) return `${B}Lower/OK`;
    if (k.card.length > want.length || !want.startsWith(k.card)) return `${B}Contanier/Back`;
    return `${B}Contanier/${want[k.card.length]}`;
  }
  const screenOf = v => { const p = v.clone().project(camera); if (p.z > 1) return null; const r = canvas.getBoundingClientRect(); return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height }; };
  // HUDNavigationElement indicator: off screen -> an arrow at the screen edge pointing at the target
  function navPoint(p) {
    const v = new THREE.Vector3(p[0], p[1], p[2]).project(camera);
    const behind = v.z > 1;
    let x = v.x, y = v.y;
    if (behind) { x = -x; y = -y; }
    if (!behind && Math.abs(x) <= 0.9 && Math.abs(y) <= 0.9) return null;
    const m = Math.max(Math.abs(x), Math.abs(y)) || 1;
    x = x / m * 0.88; y = y / m * 0.85;
    const r = canvas.getBoundingClientRect();
    return { x: r.left + (x + 1) / 2 * r.width, y: r.top + (1 - y) / 2 * r.height, angle: Math.atan2(-y, x) };
  }
  function tutFrame(dt) {
    if (lookTw) {
      lookTw.t += dt;
      const f = Math.min(1, lookTw.t / lookTw.dur), e = 1 - (1 - f) * (1 - f);
      player.yaw = lookTw.y0 + (lookTw.y1 - lookTw.y0) * e;
      player.pitch = lookTw.p0 + (lookTw.p1 - lookTw.p0) * e;
      if (f >= 1) lookTw = null;
    }
    view.showArrow(tutArrow ? tutArrow() : null);
    const s = sim.s;
    if (!sim.tut.active()) {
      player.canLook = player.canMove = true;
      return { vis: null, finger: s.task === 1 && mode.checkout ? payFinger() : null };
    }
    const tt = TUT_STEPS[s.tutStep];
    player.canLook = tt >= 5 && !lookTw;
    player.canMove = tt >= 6;
    // the cart button would bypass the laptop step: the store opens from the laptop during the tutorial
    const vis = { hud: tt >= 5, cart: false, interact: tt >= 8, exit: !exitHidden() };
    let finger = null;
    const cur = sim.tut.type();
    // force-look volumes
    for (const f of FORCE) {
      const inside = Math.abs(player.x - f.c[0]) <= f.h[0] && Math.abs(player.z - f.c[1]) <= f.h[1];
      if (inside && !f.inside && cur === f.step && !sim.tut.between() && !lookTw && !mode.ui) lookAtTween(f.target(), 0.35);
      f.inside = inside;
    }
    // off-screen indicator towards the step's HUD element
    const navP = !sim.tut.between() && !mode.checkout && !mode.ui && TUT_NAV[cur] ? TUT_NAV[cur]() : null;
    vis.nav = navP ? navPoint(navP) : null;
    if ((cur === 14 || cur === 15) && mode.checkout) {
      const k = sim.checkout;
      // CheckOutCounter.SubmitProducts at step 14 points at list[0]; the first unscanned item, then the customer's cash /
      // card, then the payment buttons
      if (k.phase === 'scan') { const i = k.items.findIndex(it => !it.scanned); const o = view.counter[i]; if (o) finger = screenOf(o.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.1, 0))); }
      else if (k.phase === 'offer') { const e = view.custs.get(k.cur); if (e) finger = screenOf(e.obj.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.1, 0))); }
      else finger = payFinger();
    }
    if (cur === 16 && mode.checkout) finger = 'HudUI/CheckOutCounter/ExitCheckOut';
    if ((cur === 17 || cur === 18) && hud.modal === 'Store') {
      // Tutorial.OpenStoreFromLaptop: finger on the Animals tab -> the first animal's Buy -> the cart's Buy
      if (hud.cart.length) finger = 'Store/Store/Products/Panels/Cart/Buy';
      else if (hud.tab !== 'Animals') finger = 'Store/Store/Products/TopButtons/Animals';
      else { const vp = hud.q('Store/Store/Products/Panels/Animals/Scroll View/Viewport'); const b = vp && vp.firstElementChild.firstElementChild; finger = b ? b.querySelector('[data-n="Buy"]') : null; if (vp) vp.style.overflowY = 'hidden'; }
    }
    if (cur === 19 && s.pending.length) finger = 'HudUI/DeliveryUI/TimerSideBar/TimerArea/Buttons/UseBoost';   // DeliveryUI.finger
    return { vis, finger };
  }

  // ObjectiveBar (TaskManager + GameHudUIHelper): day-end tips, the store-empty / store-closed tips, else the current task
  // (Task_1_n "Complete checkouts." with n/5, Task_2..Task_5). Texts are the I2 terms in the chosen language.
  function objective() {
    const s = sim.s, T = hud.T;
    if (sim.tut.active()) {
      // Tutorial.ShowObjective: the I2 term named like the step; steps 1-3 none; checkout steps count n/2
      const t = sim.tut.type();
      if (t < 5 || sim.tut.between()) return null;
      const o = { text: T(TUT_NAME[t]), iconFile: tutIcon[t] };
      if (t === 14 || t === 15) Object.assign(o, { n: t === 14 ? 0 : 1, count: 2 });
      return o;
    }
    if (sim.canEndDay()) return { text: T('Tip_DayEnd_3'), icon: 'dayEndIcon' };
    if (s.ended) return { text: T('Tip_DayEnd_2'), icon: 'dayEndIcon' };
    if (s.tooLate && s.open) return { text: T('Tip_DayEnd_1'), icon: 'dayEndIcon' };
    if (!sim.cabinets().some(c => c.st.n > 0)) return { text: T('Tip_StoreEmpty'), icon: 'sadIcon' };
    if (!s.open) return { text: T('Tip_StoreClosed'), icon: 'openSignIcon' };
    if (s.task === 1) return { text: T(`Task_1_${s.taskN}`), icon: 'checkOutIcon', n: s.taskN, count: 5 };
    return { text: T(`Task_${s.task}`), icon: 'normalIcon' };
  }

  // CustomerReactionHelper clips per customer prefab (thankYou / extraPayment / wrongPayment asset ids 974/984/973 on the
  // men, 989/988/983 on the women, 981/979/sharedassets0#63 on the kids) -> art/audio names [GUESS: id -> name by
  // grouping; the kids' wrong-payment clip is not among the exported files, the men's is used]
  const VOICE = {
    male: { NormalCheckout: 'MaleThanks', FreeCash: 'MaleFreeCash', WrongPayment: '40_Male_WrongAmount' },
    female: { NormalCheckout: 'FemaleThanks', FreeCash: 'FemaleFreeCash', WrongPayment: '41_FemaleWrongAmount' },
    kid: { NormalCheckout: 'KidThanks', FreeCash: 'KidFreeCash', WrongPayment: '40_Male_WrongAmount' },
  };
  const voiceOf = model => { const n = (L.customers[model] || {}).name || ''; return /^Kid/.test(n) ? 'kid' : /^Female/.test(n) ? 'female' : 'male'; };
  game.voiceOf = voiceOf;
  // BaseProduct moveToRackClip / moveToCounterClip asset ids (data/layout.json products[].clip) -> art/audio names
  // [GUESS: id -> name by species]; 975 is the goods' placement sound
  const CLIP = { 987: 'Cat_meow', 982: 'Dog_wow', 977: 'Rabit', 976: 'Duck_quack', 986: 'Hen_', 980: 'Pig', 978: 'Bird', 975: '6_ItemPlacement' };
  const productClip = type => CLIP[(L.products[type] || {}).clip] || null;
  game.sounds = [];

  // events -> sounds, alerts, level up
  function drainEvents() {
    for (const ev of sim.events.splice(0)) {
      if (ev.type === 'delivered') sound.sfx('2_OrderArrival');
      if (ev.type === 'levelUp') { sound.sfx('26_LevelUp'); hud.levelUp(ev.level); }
      if (ev.type === 'lowEnergy') hud.lowEnergy();
      if (ev.type === 'lowCash') hud.lowCash();
      if (ev.type === 'tutStep') tutEnter(ev.step);
      if (ev.type === 'tutDone') { tutLeave(ev.step); sound.sfx('28_Tut_Step_Completed'); hud.taskTick(); }
      if (ev.type === 'tutFinished') { tutArrow = null; writeJson(SAVE_KEY, sim.save()); }
      if (ev.type === 'taskComplete') { sound.sfx('34_SuccessSound'); hud.taskTick(); writeJson(SAVE_KEY, sim.save()); }
      if (ev.type === 'furniturePlaced' || ev.type === 'service' || ev.type === 'hired' || ev.type === 'sold') writeJson(SAVE_KEY, sim.save());
      if (ev.type === 'customerEnter') sound.sfx('32_CustomerEnter');
      if (ev.type === 'checkout') game.lastPay = { method: sim.checkout.method, change: sim.checkout.change, bill: ev.bill };
      if (ev.type === 'checkout') { sound.sfx('39_RecieptClip'); writeJson(SAVE_KEY, sim.save()); }
      if (ev.type === 'reaction') { const v = VOICE[voiceOf(ev.model)][ev.kind]; sound.sfx(v); game.sounds.push(v); }
      if (ev.type === 'checkoutChime') { sound.sfx('10_CheckoutSuccess'); game.sounds.push('10_CheckoutSuccess'); }
      if (ev.type === 'extraCash') hud.alert('ExtraCash', '$' + (ev.cents / 100).toFixed(2));
      if (ev.type === 'bell') { sound.sfx('33_CounterBellRing'); game.sounds.push('33_CounterBellRing'); }
      if (ev.type === 'submit') for (const t of new Set(ev.types)) { const c = productClip(t); if (c) { sound.sfx(c); game.sounds.push(c); } }
      if (ev.type === 'placed') { const c = productClip(ev.what); if (c && c !== '6_ItemPlacement') { sound.sfx(c); game.sounds.push(c); } }
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
    game.dayNight = dayNight.update(sim.s.time);
    // DayNightCycle.Update: past endBirdsHour the bird AudioSource is muted once (isBirdAudioStoped is never reset,
    // so the birds stay quiet until the game is restarted)
    if (sim.s.time > dnComp.endBirdsHour) birdsStopped = true;
    sound.birdsOn(!birdsStopped);
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
        if (t.kind === 'cab' && held && !sim.tut.canPlace(t.fid, t.i)) continue;   // tutorial step 9: other cabinets' colliders are off
        if (!tutAllows(t)) continue;
        target = t; break;
      }
    }
    // HoldButtonInvoker: keeping E / the Interact button pressed on a shelf repeats the placement [GUESS 0.15 s]
    if (target && target.kind === 'cab' && sim.heldBox() && (player.keys.has('KeyE') || game.holdInteract)) {
      holdT -= dt; if (holdT <= 0) { interact(); holdT = 0.15; }
    } else holdT = 0.3;
    const tf = tutFrame(dt);
    if (keyLabels) keyLabels.update(dt, { canMove: player.canMove && !mode.checkout && !mode.ui, moved: movedOnce, locked: player.locked });
    hud.update(dt, { target, pointsToNext: pointsToNext(G, sim.s.level), objective: objective(), placeOk: view.placeOk, tutVis: tf.vis, finger: tf.finger,
      hold: pressT != null && pressTarget ? Math.min(1, pressT / HOLD) : 0 });
    game.target = target;
    if ((saveT -= dt) <= 0) { saveT = 5; writeJson(SAVE_KEY, sim.save()); }
    renderer.render(scene3, camera);
  });
})().catch(e => { game.errors.push(String(e.stack || e)); console.error(e); });
