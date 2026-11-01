// Burger Please! web remake: boots Stage 1 from the extracted art and data, runs the sim, draws it.
// URL flags: ?fresh ignores the save, ?bot lets the test bot play, ?speed=N runs N sim steps per frame (tests).
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import MeshoptDecoder from '../vendor/meshopt_decoder.js';
import { buildWorld } from './view/world.js';
import { lighting } from './view/toon.js';
import { AnimLibrary, attachRigs } from './view/anim.js';
import { GameView } from './view/game.js';
import { Hud } from './view/hud.js';
import { Sound } from './view/audio.js';
import { Sim } from './sim/sim.js';
import { Bot } from './sim/bot.js';

const params = new URLSearchParams(location.search);
const V = new URL(import.meta.url).searchParams.get('v') || '';
const BASE = new URL('../', import.meta.url).href;
const ART = `${BASE}art`;
const STAGE = 'stage1';
const SAVE_KEY = `bp-${STAGE}-v1`;
const fresh = params.has('fresh');
const load_ = () => { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return null; } };
const store_ = v => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } };

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene3 = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.3, 1000);
const game = window.__game = { stage: 'boot', errors: [] };
window.addEventListener('error', e => game.errors.push(String(e.message)));

const json = url => fetch(`${url}?v=${V}`).then(r => { if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r.json(); });
const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const glb = url => gltfLoader.loadAsync(`${url}?v=${V}`);

let ORTHO = 11;
function resize() {
  const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  // Unity orthographic size = vertical half-extent.
  const a = w / h;
  camera.left = -ORTHO * a; camera.right = ORTHO * a; camera.top = ORTHO; camera.bottom = -ORTHO;
  camera.updateProjectionMatrix();
  lighting.resolution.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
}
window.addEventListener('resize', resize);

// ---- input: WASD / arrows, or drag anywhere (floating joystick) ----
const keys = new Set();
addEventListener('keydown', e => keys.add(e.key.toLowerCase()));
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
const stick = { on: false, x0: 0, y0: 0, x: 0, y: 0 };
const knob = document.getElementById('stick');
canvas.addEventListener('pointerdown', e => { stick.on = true; stick.x0 = stick.x = e.clientX; stick.y0 = stick.y = e.clientY; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => { if (stick.on) { stick.x = e.clientX; stick.y = e.clientY; } });
const up = () => { stick.on = false; };
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);

function readInput(view) {
  let sx = 0, sy = 0;
  if (keys.has('w') || keys.has('arrowup')) sy += 1;
  if (keys.has('s') || keys.has('arrowdown')) sy -= 1;
  if (keys.has('d') || keys.has('arrowright')) sx += 1;
  if (keys.has('a') || keys.has('arrowleft')) sx -= 1;
  if (stick.on) {
    const dx = stick.x - stick.x0, dy = stick.y - stick.y0, r = 60;
    const l = Math.hypot(dx, dy);
    if (l > 6) { sx = dx / Math.max(l, r); sy = -dy / Math.max(l, r); }
    knob.hidden = false;
    knob.style.transform = `translate(${stick.x0}px, ${stick.y0}px)`;
  } else knob.hidden = true;
  // Screen axes on the floor: the camera looks along -offset.
  const f = view.fwd, rgt = view.right;
  return { x: rgt.x * sx + f.x * sy, z: rgt.z * sx + f.z * sy };
}

async function main() {
  const [stageJson, stageGlb, poolJson, poolGlb, clips, controllers, data, nav, text] = await Promise.all([
    json(`${ART}/${STAGE}/scene.json`), glb(`${ART}/${STAGE}/geo.glb`), json(`${ART}/pool/scene.json`), glb(`${ART}/pool/geo.glb`),
    json(`${ART}/anim/clips.json`), json(`${ART}/anim/controllers.json`), json(`${BASE}data/${STAGE}.json`),
    json(`${ART}/${STAGE}/navmesh.json`), json(`${BASE}data/text.json`)]);
  // Sound is optional: a missing audio.json leaves the game silent.
  const [audioMeta, ui] = await Promise.all([json(`${ART}/audio/audio.json`).catch(() => null), json(`${ART}/ui/ui.json`)]);
  const world = buildWorld(stageJson, stageGlb, { texBase: `${ART}/tex` });
  const pool = buildWorld(poolJson, poolGlb, { texBase: `${ART}/tex` });
  scene3.add(world.root);
  // Camera, light and ambient of the shared scene (level1: FollowCamera._offset, Main Camera, Directional Light).
  const V3 = data.view;
  ORTHO = V3.ortho;
  scene3.background = new THREE.Color().setRGB(...V3.background, THREE.SRGBColorSpace);
  lighting.dir.set(0, 0, 1).applyQuaternion(new THREE.Quaternion().fromArray(V3.lightRot)).normalize();
  lighting.color.setRGB(...V3.lightColor, THREE.SRGBColorSpace).multiplyScalar(V3.lightIntensity);
  lighting.ambient.setRGB(...V3.ambient, THREE.SRGBColorSpace);
  resize();
  const anim = new AnimLibrary(clips, controllers);
  world.rigs = attachRigs(anim, world);

  const saved = fresh ? null : load_();
  const sim = new Sim(data, nav, saved);
  const view = new GameView({ world, pool, sim, anim, scene3 });
  const offset = new THREE.Vector3(...V3.offset);
  view.fwd = new THREE.Vector3(-offset.x, 0, -offset.z).normalize();
  view.right = new THREE.Vector3().crossVectors(view.fwd, new THREE.Vector3(0, 1, 0)).normalize();
  const sound = audioMeta ? new Sound(`${ART}/audio`, audioMeta) : null;
  const hud = new Hud(document.getElementById('hud'), { sim, text, camera, canvas, sound, ui, uiBase: `${ART}/ui` });
  Object.assign(game, { sim, view, hud, world, THREE, camera, sound, bot: params.has('bot') ? new Bot(sim) : null, stage: 'ready',
    setBot: (on, opt) => { game.bot = on ? new Bot(sim, opt) : null; }, save: () => store_(sim.save()), steps: +(params.get('speed') || 1) });

  // Money earned while away (GameManager.CheckOfflineReward; rule in sim.offlineReward).
  if (saved && saved.savedAt) {
    const off = sim.offlineReward(Date.now() - saved.savedAt);
    if (off > 0) hud.popup(text.Offline || 'Offline', off, () => { sim.gain(off, 'offline'); });
    game.offline = off;
  }

  let last = performance.now(), saveT = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (let k = 0; k < game.steps; k++) {
      const input = game.bot ? game.bot.input(dt) : readInput(view);
      sim.step(dt, input);
      view.update(dt);
      if (sound) sound.events(sim.events, dt);
      sim.events.length = 0;
    }
    hud.update();
    if (sound) sound.setMusic(sim.d.counters.some(c => sim.s.built[c.pad]));
    const p = sim.s.player.pos;
    camera.position.set(p[0] + offset.x, offset.y, p[2] + offset.z);
    camera.lookAt(p[0], 0, p[2]);
    renderer.render(scene3, camera);
    saveT += dt;
    if (saveT > 3 && !game.noSave) { saveT = 0; store_(sim.save()); }
    requestAnimationFrame(frame);
  }
  addEventListener('pagehide', () => { if (!game.noSave) store_(sim.save()); });
  requestAnimationFrame(frame);
}

main().catch(e => { game.errors.push(String(e && e.stack || e)); console.error(e); });
