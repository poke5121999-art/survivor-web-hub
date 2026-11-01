// Farm Land (web remake): boot, loop, HUD, save. ?fresh ignores the save, ?bot lets the bot play, ?speed=N fast-forwards.
import { Stage } from './view/stage.js';
import { SceneData, loadSprites, applyColorPreset } from './view/scene.js';
import { loadAnims, loadGeneric } from './view/anim.js';
import { GameView, fmt } from './view/game.js';
import { Input } from './view/input.js';
import { Farm } from './sim/farm.js';
import { Bot } from './sim/bot.js';
import { Sound } from './view/sound.js';
import { pull, push, owner, META_KEY } from './cloud.js';
import { Flight, loadFlight } from './view/flight.js';
import { Meta } from './sim/meta.js';
import { MetaView } from './view/metaview.js';

const q = new URLSearchParams(location.search);
// WorldController.WorldDescs order (FarmScene): each World keeps its own WorldSave (coins, parcels, ...)
const WORLDS = ['regulier', 'japan', 'savana2', 'winter'];
const PICTOS = ['WorldGrassland', 'WorldAsia', 'WorldSavana', 'WorldIceland'].map(n => `art/ui/${n}.png`);
// A signed-in hub account's cloud save replaces the local one first when it is newer or the local one is someone else's.
const cloudState = q.has('fresh') ? 'off' : await pull();
function readMeta() {
  try { return { world: 0, reached: 0, ...JSON.parse(localStorage.getItem(META_KEY) || '{}') }; } catch { return { world: 0, reached: 0 }; }
}
const meta = readMeta();
if (owner()) meta.owner = owner();
function writeMeta() { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch { /* storage blocked */ } }
const WORLD = q.get('world') || WORLDS[meta.world] || 'regulier';
const WI = Math.max(0, WORLDS.indexOf(WORLD));
const SAVE_KEY = `farmland-${WORLD}-v1`;
const stageEl = document.getElementById('stage');
const hud = document.getElementById('hud');
const canvas = document.getElementById('game');
const fl = window.__fl = { stage: 'boot' };

function readSave() {
  if (q.has('fresh')) return null;
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch { return null; }
}
// Every local save stamps the meta record (savedAt decides newer-wins against the cloud, ver is HubSave's version)
// and offers an upload (throttled in cloud.js).
function writeSave(farm) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(farm.save())); } catch { /* storage blocked */ }
  meta.savedAt = Date.now();
  meta.ver = (meta.ver || 0) + 1;
  writeMeta();
  push();
}

const stage = new Stage(canvas);
function resize() {
  const r = stageEl.getBoundingClientRect();
  stage.resize(r.width, r.height);
}
window.addEventListener('resize', resize);
resize();
canvas.style.filter = 'blur(12px)';

const [data, worldSD, propsSD] = await Promise.all([
  // sprites first: SceneData.build reads the manifest

  fetch(`data/${WORLD}.json`).then(r => r.json()),
  SceneData.load(`art/${WORLD}`),
  SceneData.load('art/props'),
  loadSprites('art/sprites/sprites.json'),
  loadAnims('art/anim/stickman.json'),
  loadGeneric('art/anim/animals.json'),
]);
fl.stage = 'loaded';
fl.presetSlots = applyColorPreset(worldSD, data.colors) + applyColorPreset(propsSD, data.colors);
const farm = new Farm(data, { save: readSave() });
const view = new GameView(stage, worldSD, propsSD, data, farm, hud);
const input = new Input(stageEl, hud);
view.sound = new Sound();
// account layer (diamonds, pets, bike, piggy bank, skins): lives in the meta record, so it follows the cloud save
const skinData = await fetch('data/skins.json').then(r => r.json()).catch(() => ({ pool: [] }));
const metaSim = new Meta(meta.fs, skinData.pool);
meta.fs = metaSim.fs;
const metaView = new MetaView(view, metaSim, hud);
metaView.loadSkins = () => SceneData.load('art/skins');
if (metaSim.fs.skin !== 'BasePlayer') metaView.preview(metaSim.fs.skin);
view.onEvent = e => metaView.event(e);
fl.meta2 = metaSim; fl.metaView = metaView;
let bot = q.has('bot') ? new Bot(farm) : null;
fl.useBot = () => { bot = new Bot(farm); };
fl.stopBot = () => { bot = null; };
fl.saveNow = () => writeSave(farm);

// HUD (clip buyciZObYbc): coins and land top-left, settings gear under them, inventory top-right, current tool bottom.
hud.insertAdjacentHTML('beforeend', `<div class="pill money"><img src="${data.ui.coin}" alt=""><span>0</span></div>
<div class="pill land"><img src="art/ui/Parcel.png" alt=""><span>0</span></div>
<img class="gear ui" src="art/ui/btn_settings.png" alt="sound">
<div class="bag"></div><div class="tool"><img alt=""></div>`);
const moneyEl = hud.querySelector('.money'), moneyTxt = moneyEl.lastChild, landTxt = hud.querySelector('.land span');
const bagEl = hud.querySelector('.bag'), toolEl = hud.querySelector('.tool'), toolImg = toolEl.firstChild;
const gear = hud.querySelector('.gear');
gear.addEventListener('click', () => { view.sound.muted = !view.sound.muted; gear.classList.toggle('off', view.sound.muted);
  for (const a of [view.sound.music, view.sound.amb]) if (a) a.muted = view.sound.muted; });
const TOOL_ICON = { seed: 'art/ui/SeedBag.png', water: 'art/ui/Watercan.png', scythe: 'art/ui/Sickle.png' };
let shownCoins = -1, shownBag = '', shownTool = null;
function drawHud() {
  if (farm.coins !== shownCoins) {
    if (shownCoins >= 0) { moneyEl.classList.remove('pop'); void moneyEl.offsetWidth; moneyEl.classList.add('pop'); }
    shownCoins = farm.coins;
    moneyTxt.textContent = fmt(farm.coins);
  }
  landTxt.textContent = farm.land;
  const b = JSON.stringify(farm.bag);
  if (b !== shownBag) {
    shownBag = b;
    bagEl.innerHTML = Object.entries(farm.bag).map(([c, n]) => `<div class="pill"><img src="${data.crops[c]?.icon || ''}" alt="${c}">${fmt(n)}</div>`).join('');
  }
  const tool = farm.player.tool;
  if (tool !== shownTool) {
    shownTool = tool;
    if (tool) toolImg.src = TOOL_ICON[tool];
    toolEl.classList.toggle('on', !!tool);
  }
}
// Travel: the Hydravion flies to the next World; the map button switches between reached Worlds.
function goWorld(i) {
  writeSave(farm);
  meta.world = i; meta.reached = Math.max(meta.reached, i);
  writeMeta();
  canvas.style.filter = 'blur(12px)';
  const u = new URL(location.href);
  u.searchParams.delete('world'); u.searchParams.delete('fresh');
  // the upload goes out before the reload (up to 2 s), so the next island starts from what the account holds
  const go = () => { location.href = u.toString(); };
  Promise.race([push(true), new Promise(ok => setTimeout(ok, 2000))]).then(go, go);
}
fl.goWorld = goWorld;
fl.cloud = cloudState;
fl.pushNow = () => push(true);
fl.world = WORLD;
fl.meta = meta;
// The seaplane flies RoadToNewWorld (camera included); Skip shows at EnableSkipButton, OnTravelComplete changes world.
let flight = null;
view.onTravel = async () => {
  if (WI + 1 >= WORLDS.length || flight) return;
  const holder = view.world.obj(data.final?.plane);
  try { if (!holder) throw new Error('no plane'); await loadFlight('art/anim/plane.json'); } catch { goWorld(WI + 1); return; }
  writeSave(farm);
  view.avatar.visible = false;
  hud.classList.add('flying');
  const next = () => { if (fl.flight) { fl.flight = null; goWorld(WI + 1); } };
  flight = fl.flight = new Flight(view.world, holder, {
    onSkip: () => {
      const b = document.createElement('button');
      b.className = 'skip'; b.textContent = 'Skip';
      b.addEventListener('click', next);
      hud.appendChild(b);
    },
    onDone: next,
  });
};
if (meta.reached > 0) {
  hud.insertAdjacentHTML('beforeend', `<img class="map ui" src="art/ui/Icon_Map.png" alt="map">`);
  hud.querySelector('.map').addEventListener('click', () => {
    const old = hud.querySelector('.worlds');
    if (old) { old.remove(); return; }
    const el = document.createElement('div');
    el.className = 'worlds';
    el.innerHTML = PICTOS.slice(0, meta.reached + 1).map((src, i) => `<img src="${src}" data-w="${i}" class="${i === WI ? 'cur' : ''}" alt="${WORLDS[i]}">`).join('');
    el.addEventListener('click', e => { const w = e.target.dataset?.w; if (w != null && +w !== WI) goWorld(+w); else el.remove(); });
    hud.appendChild(el);
  });
}
view.toast = text => {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  hud.appendChild(el);
  setTimeout(() => el.remove(), 1200);
};

// Camera input space: joystick up = away from the camera (three -z when yaw is 0)
function worldInput(v) {
  const y = stage.rig.yaw * Math.PI / 180, c = Math.cos(y), s = Math.sin(y);
  return { x: v.x * c + v.z * s, z: -v.x * s + v.z * c };
}

fl.speed = +(q.get('speed') || 1);
let last = performance.now(), saveT = 0;
stage.follow(new (stage.focus.constructor)(farm.player.x, 0, farm.player.z), 0, true);
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  for (let k = 0; k < fl.speed; k++) {
    const inp = flight ? { x: 0, z: 0 } : bot ? bot.input(dt) : worldInput(input.read());
    farm.step(dt, inp);
  }
  metaView.update(dt);
  view.update(dt);
  if (flight) { if (!flight.update(dt, stage.camera)) flight = null; } else stage.follow(view.avatar.position, dt);
  stage.render();
  drawHud();
  saveT += dt;
  if (saveT > 2) { saveT = 0; writeSave(farm); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
addEventListener('pagehide', () => writeSave(farm));
document.addEventListener('visibilitychange', () => { if (document.hidden) { writeSave(farm); push(true); } });
requestAnimationFrame(() => { canvas.style.filter = ''; fl.stage = 'ready'; window.__ready = true; });
fl.farm = farm; fl.view = view; fl.stage3 = stage;
