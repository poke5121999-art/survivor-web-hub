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
import { PlayerSkins } from './view/skins.js';
import { Fx } from './view/fx.js';
import { Sound } from './view/audio.js';
import { Sim } from './sim/sim.js';
import { Bot } from './sim/bot.js';

const params = new URLSearchParams(location.search);
const V = new URL(import.meta.url).searchParams.get('v') || '';
const BASE = new URL('../', import.meta.url).href;
const ART = `${BASE}art`;
// Campaign state shared by all stages (bp-meta-v1): the stage played last, the stages opened (a stage's 'NewStage' star
// reward opens the next one, GameManager/StarLevelHelper.GetNewStageLevel), and the office upgrades, which are player-wide
// (every StageData row sets use_player_total_data). Each stage keeps its own save and wallet (StageData.money_index).
const META_KEY = 'bp-meta-v1';
const readJson = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } };
const fresh = params.has('fresh');
const meta = (!fresh && readJson(META_KEY)) || { stage: 1, open: { 1: true }, lv: null };
const asked = +(params.get('stage') || 0);
// ?stage=N picks a stage (tests and the stage popup); otherwise the last one played, if it is open.
const STAGE_N = Math.max(1, Math.min(10, asked || (meta.open[meta.stage] ? meta.stage : 1)));
const STAGE = `stage${STAGE_N}`;
const SAVE_KEY = `bp-${STAGE}-v1`;
const load_ = () => readJson(SAVE_KEY);
const store_ = v => writeJson(SAVE_KEY, v);

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
// The Unity project renders in Gamma colour space (PlayerSettings.m_ActiveColorSpace 0): shaders multiply the sRGB
// values as they are and write them out unconverted. Textures and colours therefore stay raw (NoColorSpace /
// LinearSRGB = no conversion) and the output is not encoded again.
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
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
  }
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
  const [audioMeta, ui, items] = await Promise.all([json(`${ART}/audio/audio.json`).catch(() => null), json(`${ART}/ui/ui.json`),
    json(`${BASE}data/items.json`)]);
  const world = buildWorld(stageJson, stageGlb, { texBase: `${ART}/tex` });
  const pool = buildWorld(poolJson, poolGlb, { texBase: `${ART}/tex` });
  scene3.add(world.root);
  // Camera, light and ambient of the shared scene (level1: FollowCamera._offset, Main Camera, Directional Light).
  const V3 = data.view;
  ORTHO = V3.ortho;
  scene3.background = new THREE.Color().setRGB(...V3.background, THREE.LinearSRGBColorSpace);
  lighting.dir.set(0, 0, 1).applyQuaternion(new THREE.Quaternion().fromArray(V3.lightRot)).normalize();
  lighting.color.setRGB(...V3.lightColor, THREE.LinearSRGBColorSpace).multiplyScalar(V3.lightIntensity);
  lighting.ambient.setRGB(...V3.ambient, THREE.LinearSRGBColorSpace);
  resize();
  const anim = new AnimLibrary(clips, controllers);
  world.rigs = attachRigs(anim, world);

  const saved = fresh ? null : load_();
  const sim = new Sim(data, nav, saved);
  if (meta.lv) sim.s.lv = { ...sim.s.lv, ...meta.lv };
  meta.stage = STAGE_N;
  meta.open[STAGE_N] = true;
  // Saving writes the stage, then the campaign: shared upgrades, and the next stage once this one reaches its
  // NewStage star level.
  const saveAll = () => {
    store_(sim.save());
    meta.lv = { ...sim.s.lv };
    if (data.newStageStar != null && sim.s.star >= data.newStageStar && STAGE_N < 10 && !meta.open[STAGE_N + 1]) {
      meta.open[STAGE_N + 1] = true;
      game.newStage = STAGE_N + 1;
    }
    writeJson(META_KEY, meta);
  };
  const view = new GameView({ world, pool, sim, anim, scene3, items });
  const fxData = await json(`${ART}/fx/fx.json`).catch(() => null);
  if (fxData) view.fx = new Fx(world.root, `${ART}/fx`, fxData);
  view.fxBase = `${ART}/fx`;
  // Skins (SkinManager) are campaign-wide: the worn one and the owned ones live in the meta save. A free uniform is
  // offered once the stage of its Skin.cost_stage (0-based) has been opened.
  const [skinLib, skinGlb] = await Promise.all([json(`${ART}/pool/playerskins.json`), glb(`${ART}/pool/playerskins.glb`)]).catch(() => [null, null]);
  meta.skin = meta.skin || { sel: 1, owned: [1] };
  const playerSkins = skinLib ? new PlayerSkins(skinLib, skinGlb, `${ART}/tex`) : null;
  const wear = () => {
    sim.setSkin(skinLib.rows, meta.skin.sel, meta.skin.owned);
    playerSkins.apply(world.objects, world.objects[data.player.node].userData.node.k['BurgerPlease.PlayerSkin'], meta.skin.sel - 1);
  };
  if (skinLib) wear();
  const skins = skinLib && {
    lib: skinLib, state: meta.skin,
    maxStage: () => Math.max(...Object.keys(meta.open).filter(k => meta.open[k]).map(Number)),
    equip: id => { meta.skin.sel = id; wear(); if (!game.noSave) saveAll(); },
    take: id => { if (!meta.skin.owned.includes(id)) meta.skin.owned.push(id); meta.skin.sel = id; wear(); if (!game.noSave) saveAll(); },
  };
  const offset = new THREE.Vector3(...V3.offset);
  view.fwd = new THREE.Vector3(-offset.x, 0, -offset.z).normalize();
  view.right = new THREE.Vector3().crossVectors(view.fwd, new THREE.Vector3(0, 1, 0)).normalize();
  const sound = audioMeta ? new Sound(`${ART}/audio`, audioMeta, STAGE_N) : null;
  const hud = new Hud(document.getElementById('hud'), { sim, text, camera, canvas, sound, ui, uiBase: `${ART}/ui`, stage: STAGE_N, meta,
    stageData: n => json(`${BASE}data/stage${n}.json`), skins, view, enter: n => { if (!game.noSave) saveAll(); location.search = `?stage=${n}`; } });
  Object.assign(game, { sim, view, hud, world, THREE, camera, sound, bot: params.has('bot') ? new Bot(sim) : null, stage: 'ready',
    setBot: (on, opt) => { game.bot = on ? new Bot(sim, opt) : null; }, save: saveAll, meta, stageN: STAGE_N, wear, skinLib, steps: +(params.get('speed') || 1) });

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
      for (const e of sim.events) if (e.type === 'skinroom') { if (e.open) hud.showSkins(); else hud.hideSkins(); }
      sim.events.length = 0;
    }
    hud.update(stick);
    if (sound) {
      sound.setMusic(sim.d.counters.some(c => sim.s.built[c.pad]));
      const pp = sim.s.player.pos, inZ2 = (sim.d.bgmAreas || []).some(a => a.zone === 1 && Math.abs(pp[0] - a.box[0]) <= a.box[2] && Math.abs(pp[2] - a.box[1]) <= a.box[3]);
      sound.setZone(inZ2 ? 2 : 1);
    }
    const p = sim.s.player.pos;
    camera.position.set(p[0] + offset.x, offset.y, p[2] + offset.z);
    camera.lookAt(p[0], 0, p[2]);
    renderer.render(scene3, camera);
    saveT += dt;
    if (saveT > 3 && !game.noSave) { saveT = 0; saveAll(); }
    if (game.newStage) { hud.showStage(game.newStage); game.newStage = null; }
    requestAnimationFrame(frame);
  }
  addEventListener('pagehide', () => { if (!game.noSave) saveAll(); });
  requestAnimationFrame(frame);
}

main().catch(e => { game.errors.push(String(e && e.stack || e)); console.error(e); });
