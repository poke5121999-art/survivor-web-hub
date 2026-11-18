import * as THREE from '../vendor/three.module.min.js';
import { CFG } from './config.js';
import { createPhysics } from './physics.js';
import { createInput } from './input.js';
import { Player } from './player.js';
import { Grab } from './grab.js';
import { Loot } from './loot.js';
import { Extraction } from './extract.js';
import { buildTestRoom } from './testroom.js';
import { Noise } from './noise.js';
import { robotsFrame } from './robots.js';

const params = Object.fromEntries(new URLSearchParams(location.search));
const errors = [];
const G = window.__G = { params, errors, time: 0, frames: 0 };
window.__errors = errors;
addEventListener('error', (e) => errors.push(String(e.message)));
addEventListener('unhandledrejection', (e) => errors.push(String(e.reason?.message || e.reason)));

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function createEvents() {
  const map = new Map();
  return {
    on(name, fn) { (map.get(name) || map.set(name, []).get(name)).push(fn); },
    emit(name, data) { for (const fn of map.get(name) || []) fn(data); },
  };
}

// Run wiring: lobby UI, pointer lock only during play, Esc = settings/pause popup.
async function setupRun(freeHouse) {
  const [{ UI }, { Runner }] = await Promise.all([import('../ui/ui.js'), import('./run.js')]);
  UI.mount(document.body);
  await UI.ready();
  const num = (v) => (v === undefined ? undefined : Number(v));
  const R = new Runner(G, UI, {
    seed: num(params.seed), theme: params.theme || (freeHouse ? 'vampire' : undefined), houseSeed: freeHouse ? (num(params.seed) ?? 7) : undefined,
    foes: params.foes, foeSleep: num(params.foeSleep), testMode: freeHouse && params.run === undefined,
  });
  G.ui = UI;
  G.events.on('pad:extract', (e) => R.onPadExtract(e));
  G.events.on('loot:break', () => {});
  // pointer lock lost while playing = Esc: pause and open the settings popup (the HUD gear opens the same popup)
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === G.renderer.domElement || !R.simulating() || !G.input.wasLocked) { G.input.wasLocked = document.pointerLockElement === G.renderer.domElement; return; }
    G.input.wasLocked = false;
    G.paused = true;
    document.querySelector('.ui-root .hud .gear')?.click();
  });
  G.input.wasLocked = false;
  const modal = document.querySelector('.ui-root .ui-modal');
  new MutationObserver(() => { if (G.paused && modal.classList.contains('hidden')) G.paused = false; }).observe(modal, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement === G.renderer.domElement) G.paused = false; });
  if (freeHouse) await R.begin({ house: Number(params.house) || 1 });
  else R.toLobby();
}

async function boot() {
  const canvas = document.getElementById('view');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05060a);
  scene.fog = new THREE.FogExp2(0x05060a, 0.06);
  const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 80);
  scene.add(camera);

  const phys = await createPhysics();
  const events = createEvents();
  Object.assign(G, { renderer, scene, camera, phys, events, rng: mulberry32(Number(params.seed) || 1234) });
  G.loot = new Loot(phys, scene, events);
  const slice = params.slice !== undefined;           // ?slice=1: the old test room (tools/slice.js), no UI, no run
  const freeHouse = params.house !== undefined;       // ?house=N&theme=&seed=: start the run at house N, no lobby (tests)
  let room = null;
  if (slice) room = buildTestRoom(G);
  G.player = new Player(phys, room ? room.spawn : { x: 0, z: 0 });
  G.player.scene = scene;
  G.grab = new Grab(phys, G.player, scene);
  G.noise = new Noise(G);
  G.extract = new Extraction(G.loot, events);
  if (room) G.extract.setPads(room.pads);

  const torch = new THREE.SpotLight(0xfff1d6, 18, 14, 0.62, 0.45, 1.6);
  torch.castShadow = true; torch.shadow.mapSize.set(1024, 1024); torch.shadow.bias = -0.0008;
  camera.add(torch); torch.position.set(0.25, -0.15, 0); torch.target.position.set(0.1, -0.1, -3); camera.add(torch.target);
  G.torch = torch;

  G.input = createInput(canvas);
  if (slice) canvas.style.visibility = 'visible';
  else await setupRun(freeHouse);
  G.log = [];
  events.on('loot:hit', (e) => G.log.push(['hit', e.item.material, e.lost, +e.dv.toFixed(2)]));
  events.on('loot:break', (e) => G.log.push(['break', e.item.material]));
  events.on('pad:extract', (e) => G.log.push(['extract', e.value]));

  const resize = () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
  addEventListener('resize', resize); resize();
  return G;
}

function commandFromInput(I) {
  const s = CFG.player.sens;
  return {
    mx: (I.down('KeyD') ? 1 : 0) - (I.down('KeyA') ? 1 : 0),
    mz: (I.down('KeyW') ? 1 : 0) - (I.down('KeyS') ? 1 : 0),
    sprint: I.down('ShiftLeft'), crouch: I.down('ControlLeft') || I.down('KeyC'), jump: I.tap('Space'),
    dyaw: I.dx * s, dpitch: I.dy * s, grab: I.grab, grabPressed: I.grabPressed, wheel: I.wheel, throwIt: I.tap('KeyQ'),
  };
}

const FAR = { x: -1e4, y: 0, z: -1e4 };
const IDLE = { mx: 0, mz: 0, sprint: false, crouch: false, jump: false, dyaw: 0, dpitch: 0, grab: false, grabPressed: false, wheel: 0, throwIt: false };

function stepSim(dt, cmd) {
  if (G.runner && !G.runner.simulating()) return;
  G.player.step(dt, cmd);
  G.player.updateCamera(G.camera);
  G.grab.step(dt, G.player.down ? IDLE : cmd);
  G.noise.step(dt, G.player, G.grab);
  G.foes?.step(dt);
  if (G.player.down && !G.runLost) { G.runLost = true; G.run && (G.run.downs++); G.events.emit('run:lost', { reason: 'down' }); }
  G.house?.step(dt, G.player.down ? FAR : G.player.position, G.foes ? G.foes.list.filter((f) => !f.dead && f.def.beh !== 'ghost') : []);
  G.phys.snapshotVelocities();
  G.phys.world.step();
  G.loot.afterStep(dt);
  G.extract.step(dt, G.player.down ? FAR : G.player.position);
  G.time += dt;
  G.runner?.step(dt);
}

function render() {
  G.phys.syncMeshes();
  G.player.updateCamera(G.camera);
  G.grab.updateBeam();
  G.house?.update(G.camera.position);
  const now = performance.now(), rdt = Math.min(0.1, (now - (G.lastRender || now)) / 1000); G.lastRender = now;
  G.foes?.render(rdt, G.camera.position);
  if (G.viewOn !== false) { robotsFrame(G.scene, G.camera, rdt); G.renderer.render(G.scene, G.camera); }
  G.runner?.frame(rdt * 1000);
}

let acc = 0, last = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - (last || now)) / 1000);
  last = now;
  if (!window.__paused && !G.paused) {
    acc += dt;
    const h = 1 / CFG.physicsHz;
    let n = 0;
    while (acc >= h && n++ < 5) {
      const cmd = G.cmdOverride || commandFromInput(G.input);
      stepSim(h, cmd);
      G.input.endFrame();
      acc -= h;
    }
  }
  render();
  G.frames++;
}

window.__sim = (seconds, cmd = IDLE) => {
  const h = 1 / CFG.physicsHz;
  for (let i = 0; i < Math.round(seconds / h); i++) stepSim(h, typeof cmd === 'function' ? cmd(i) : cmd);
  render();
};
window.__IDLE = IDLE;

boot().then(() => {
  document.getElementById('boot')?.remove();
  window.__ready = true;
  requestAnimationFrame(frame);
}).catch((e) => {
  console.error(e);
  window.__fatal = String(e?.stack || e);
  const f = document.getElementById('fatal');
  if (f) f.textContent = window.__fatal;
});
