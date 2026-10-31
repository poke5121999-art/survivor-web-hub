import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import MeshoptDecoder from '../vendor/meshopt_decoder.js';
import { buildWorld } from './view/world.js';
import { lighting } from './view/lowpoly.js';
import { AnimLibrary, Rig } from './view/anim.js';
import { Props } from './view/props.js';
import { GameView } from './view/game.js';
import { UI } from './view/ui.js';
import { Hud } from './view/hud.js';
import { Sound } from './view/sound.js';
import { HirePanel, UpgradePanel, StarPanel, RentPanel, OrderPanel, SpecialPanel } from './view/panels.js';
import { GuideView } from './view/guide.js';
import { describeWorld } from './sim/world.js';
import { Mover } from './sim/move.js';
import { Sim } from './sim/sim.js';

const params = new URLSearchParams(location.search);
const V = new URL(import.meta.url).searchParams.get('v') || '';
const BASE = new URL('../', import.meta.url).href;
const ART = `${BASE}art`;
const SAVE_KEY = 'lumber-inc-v1';
const fresh = params.has('fresh');
const json = url => fetch(`${url}?v=${V}`).then(r => {
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
});
const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const glb = url => gltfLoader.loadAsync(`${url}?v=${V}`);

const canvas = document.getElementById('game');
const hudEl = document.getElementById('hud');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene3 = new THREE.Scene();
scene3.background = new THREE.Color(0x7cc04a);

// GameCamMgr (rules/workers-guide-camera.md C48-C52): FOV 40, follow damping 0.5, three zoom offsets with
// (23, 31, -23) the default; the zoom button cycles default -> close -> medium. Unity -> three: z flips.
const OFFSETS = [[16, 22, 16], [23, 31, 23], [9, 13, 9]].map(a => new THREE.Vector3(...a));
let zoomIndex = 1;
const FOLLOW = OFFSETS[1].clone();
const camera = new THREE.PerspectiveCamera(40, 1, 0.3, 1000);
function resize() {
  const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const LI = window.__li = { stage: 'boot', blur: 14, stages: [] };
function setStage(px, label) {
  LI.blur = px;
  LI.stage = label;
  LI.stages.push([label, px, Math.round(performance.now())]);
  canvas.style.filter = px > 0 ? `blur(${px}px)` : 'none';
}
setStage(14, 'boot');

try {
  await start();
} catch (e) {
  LI.error = String(e && e.stack || e);
  throw e;
}

async function start() {
  const uiP = Promise.all([json(`${ART}/ui/sprites.json`), json(`${ART}/ui/lang-en.json`), json(`${ART}/ui/panels/gamingpanel.json`),
    json(`${ART}/ui/panels/employeeupgradepanel.json`), json(`${ART}/ui/panels/skinpanel.json`),
    json(`${ART}/ui/panels/upgradebuildingstarpanel.json`), json(`${ART}/ui/panels/bonuspanel.json`), json(`${ART}/ui/panels/ordermanpanel.json`),
    json(`${ART}/ui/panels/adboxpanel.json`),
    document.fonts.load('20px LumberUI').catch(() => null)]);
  const [config, worldJson, worldGlb] = await Promise.all([
    json(`${BASE}data/config.json`), json(`${ART}/world1/scene.json`), glb(`${ART}/world1/geo.glb`)]);
  const view = buildWorld(worldJson, worldGlb, { texBase: `${ART}/tex` });
  scene3.add(view.root);
  const world = describeWorld(worldJson);
  let save = null;
  try { save = fresh ? null : JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { save = null; }
  const sim = new Sim(world, config, save);
  setStage(8, 'geometry');
  render0();

  const [charsJson, charsGlb, propsJson, propsGlb, clips, roles, rolesOf, guideJson, guideGlb, machJson, machGlb] = await Promise.all([
    json(`${ART}/chars/scene.json`), glb(`${ART}/chars/geo.glb`), json(`${ART}/props/scene.json`), glb(`${ART}/props/geo.glb`),
    json(`${ART}/anim/clips.json`), json(`${ART}/anim/roles.json`), json(`${ART}/chars/roles-of.json`),
    json(`${ART}/guide/scene.json`), glb(`${ART}/guide/geo.glb`), json(`${ART}/machines/scene.json`), glb(`${ART}/machines/geo.glb`)]);
  const chars = buildWorld(charsJson, charsGlb, { texBase: `${ART}/tex` });
  const props = new Props(buildWorld(propsJson, propsGlb, { texBase: `${ART}/tex` }), config);
  const lib = new AnimLibrary(clips, roles, rolesOf);
  const byRoot = name => chars.objects[charsJson.nodes.findIndex(n => n.n === name && n.p === -1)];
  const playerObj = byRoot('Pre_Role001');
  scene3.add(playerObj);
  let animatorObj = playerObj;
  playerObj.traverse(o => { if (animatorObj === playerObj && o.userData.node?.k?.Animator) animatorObj = o; });
  const rig = new Rig(lib, animatorObj, lib.role('Pre_Role001'));
  // The axe of Pre_ToolBag follows the right hand bone (BoneFollow_Tool) while chopping.
  const hand = playerObj.getObjectByName('+ R Hand');
  const axeSrc = chars.objects[charsJson.nodes.findIndex(n => n.n === 'Tool_Axe')];
  const tool = axeSrc ? axeSrc.clone(true) : null;
  if (tool && hand) { tool.position.set(0, 0, 0); tool.quaternion.identity(); hand.add(tool); tool.visible = false; }
  setStage(4, 'animation');

  const pad = worldJson.materials.find(m => m.gizmo && m.gizmo.kind === 'SizableFrameLocked2');
  const machines = buildWorld(machJson, machGlb, { texBase: `${ART}/tex` });
  machines.root.children.forEach(o => o.position.set(0, 0, 0));
  const game = new GameView({ scene3, view, world, sim, props, playerObj, rig, tool, padGizmo: pad.gizmo, chars, lib, machines });
  game.syncStatus();
  game.syncModels();
  const mover = new Mover(world);
  const shown = i => {
    for (let j = i; j >= 0; j = world.nodes[j].p) if (!view.objects[j].visible) return false;
    return true;
  };
  sim.mover = mover;
  sim.shown = shown;

  const sound = new Sound(`${ART}/sfx`, await json(`${ART}/sfx/sfx.json`));
  const [sprites, lang, gaming, empPanel, skinPanel, starPanel, bonusPanel, orderPanel, adPanel] = await uiP;
  const ui = new UI(`${ART}/ui`, sprites, lang);
  const hud = new Hud(hudEl, ui, { gamingpanel: gaming }, sim, world, camera);
  // Standing in a hut's or the cabin's trigger opens its panel (EmployeeHouseCtrller / PlayerHouseCtrller show trigger).
  const hire = new HirePanel(hudEl, ui, empPanel, sim);
  const upgrade = new UpgradePanel(hudEl, ui, skinPanel, sim);
  // A star paid on a research frame opens the machine choice.
  const star = new StarPanel(hudEl, ui, starPanel, sim);
  const bike = new RentPanel(hudEl, ui, bonusPanel, sim, 'MotoProvidePanel', 'bike');
  const drone = new RentPanel(hudEl, ui, bonusPanel, sim, 'UAVProvidePanel', 'uav');
  const order = new OrderPanel(hudEl, ui, orderPanel, sim);
  const superTimber = new SpecialPanel(hudEl, ui, adPanel, sim, 'AdWorkerTimberPanel', 'TimberAdTitle');
  const superCarrier = new SpecialPanel(hudEl, ui, adPanel, sim, 'AdWorkerCarrierPanel', 'CarrierAdTitle');
  const panels = [hire, upgrade, star, bike, drone, order, superTimber, superCarrier];
  // Tutorial (guide.txt): which top panel is up, and the UI nodes its UINodeFinder params name.
  const guideView = new GuideView({ scene3, arrows: buildWorld(guideJson, guideGlb, { texBase: `${ART}/tex` }), world, sim, host: hudEl, ui });
  const TOP = new Map([[hire, 'EmployeeUpgradePanel'], [upgrade, 'SkinPanel'], [star, 'UpgradeBuildingStarPanel'], [bike, 'MotoProvidePanel'],
    [drone, 'UAVProvidePanel'], [order, 'OrderManPanel'], [superTimber, 'AdWorkerTimberPanel'], [superCarrier, 'AdWorkerCarrierPanel']]);
  const uiNode = param => {
    const m = /^UINodeFinder:EmployeeUpgradePanel,.*Content\/(\d+)_(\d+)\/BtnContent\/btnUp$/.exec(param || '');
    if (!m || !hire.isOpen || hire.hut !== +m[1] || !hire.cells) return null;
    const c = hire.cells[+m[2]];
    return c ? c.out.get('btnUp') : null;
  };
  sim.guide.ui = { get top() { const o = panels.find(q => q.isOpen); return o ? TOP.get(o) : 'GamingPanel'; }, visible: q => !!uiNode(q) };
  hire.onPress = c => sim.guide.click(`UINodeFinder:EmployeeUpgradePanel,bg/Scroll View/Viewport/Content/${hire.hut}_${c.i}/BtnContent/btnUp`);
  const onZone = z => {
    if (!z) return;
    if (z.kind === 'employeeHouse') hire.open(z.id);
    else if (z.kind === 'playerHouse') upgrade.open();
    else if (z.kind === 'bike') bike.open();
    else if (z.kind === 'uav') drone.open();
    else if (z.kind === 'orderMan') order.open();
    else if (z.kind === 'special') (world.buildings.get(z.id).workerType === 1 ? superTimber : superCarrier).open(z.id);
  };
  hud.onZoom = () => { zoomIndex = (zoomIndex + 1) % 3; };
  hud.onStarEntry = id => star.open(id);
  LI.setZoom = i => { zoomIndex = i; };

  // Input: WASD / arrows, or drag on the game for a floating joystick.
  const keys = new Set();
  addEventListener('keydown', e => keys.add(e.key.toLowerCase()));
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  const joy = { on: false, x: 0, y: 0, dx: 0, dy: 0 };
  hudEl.addEventListener('pointerdown', e => { if (e.target.closest('.btn')) return; joy.on = true; joy.x = e.clientX; joy.y = e.clientY; joy.dx = joy.dy = 0; });
  canvas.addEventListener('pointerdown', e => { joy.on = true; joy.x = e.clientX; joy.y = e.clientY; joy.dx = joy.dy = 0; });
  addEventListener('pointermove', e => { if (joy.on) { joy.dx = e.clientX - joy.x; joy.dy = e.clientY - joy.y; } });
  addEventListener('pointerup', () => { joy.on = false; joy.dx = joy.dy = 0; });
  hudEl.style.pointerEvents = 'auto';

  // Screen up = away from the camera on the ground.
  const fwd = new THREE.Vector2(-FOLLOW.x, -FOLLOW.z).normalize();
  const right = new THREE.Vector2(-fwd.y, fwd.x);
  function input() {
    if (LI.bot) return LI.bot();
    let sx = 0, sy = 0;
    if (keys.has('w') || keys.has('arrowup')) sy += 1;
    if (keys.has('s') || keys.has('arrowdown')) sy -= 1;
    if (keys.has('d') || keys.has('arrowright')) sx += 1;
    if (keys.has('a') || keys.has('arrowleft')) sx -= 1;
    if (joy.on) {
      const r = Math.hypot(joy.dx, joy.dy);
      if (r > 6) { sx = joy.dx / Math.max(r, 60); sy = -joy.dy / Math.max(r, 60); }
    }
    const n = Math.hypot(sx, sy);
    if (!n) return null;
    return { x: (right.x * sx + fwd.x * sy) / n, z: (right.y * sx + fwd.y * sy) / n };
  }

  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(sim.save())); } catch (e) { /* storage off */ } };
  setInterval(persist, 5000);
  addEventListener('pagehide', persist);
  document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });

  const p = sim.state.player;
  const target = new THREE.Vector3(p.x, 0, p.z);
  const offset = OFFSETS[zoomIndex].clone();
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000) * (LI.speed || 1);
    last = now;
    // An open panel holds the player: no walking, and no paying into the pad or frame underfoot.
    const focus = guideView.focus();
    const busy = panels.some(pnl => pnl.isOpen) || !!focus;
    const mv = busy ? null : input();
    if (mv) {
      mover.step(p, mv.x * sim.speed * dt, mv.z * sim.speed * dt, shown);
      p.dir = Math.atan2(mv.x, mv.z);
    }
    sim.tick(dt, !!mv || busy);
    if (sim.events.some(e => e.type === 'status')) game.syncStatus();
    LI.events && LI.events.push(...sim.events);
    sound.events(sim.events, now / 1000);
    for (const e of sim.events) {
      if (e.type === 'zone') onZone(e.zone);
      else if (e.type === 'star') { star.open(e.id); game.syncModels(); }
      else if (e.type === 'machine') game.syncModels();
    }
    for (const pnl of panels) if (pnl.isOpen) pnl.update();
    sim.events.length = 0;
    if (mv) rig.playRole('run');
    else if (sim.chopping) rig.playChop('chopWood');
    else rig.playRole('idle');
    playerObj.position.set(p.x, 0, p.z);
    playerObj.rotation.y = p.dir + Math.PI;
    rig.update(dt);
    game.update(dt);
    guideView.update(dt, uiNode);
    // CameraFocusCommand: look at the guide target; levels 0-2 pick a zoom offset, other levels keep the current one.
    const look = focus ? focus.pos : p;
    const zoom = focus && focus.level >= 0 && focus.level < 3 ? focus.level : zoomIndex;
    target.lerp(new THREE.Vector3(look.x, 0, look.z), 1 - Math.exp(-dt / (focus ? 0.25 : 0.15)));
    offset.lerp(OFFSETS[zoom], 1 - Math.exp(-dt / 0.15));
    camera.position.copy(target).add(offset);
    camera.lookAt(target);
    renderer.render(scene3, camera);
    hud.update();
    requestAnimationFrame(frame);
  }
  Object.assign(LI, { sim, world, game, hud, persist, hire, upgrade, star, guideView, ready: true });
  setStage(0, 'ready');
  requestAnimationFrame(frame);

  function render0() {
    const q = sim.state.player;
    camera.position.set(q.x + FOLLOW.x, FOLLOW.y, q.z + FOLLOW.z);
    camera.lookAt(q.x, 0, q.z);
    renderer.render(scene3, camera);
  }
}
void lighting;
