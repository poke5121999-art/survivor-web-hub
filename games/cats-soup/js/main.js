// Mèo & Súp: boot, scene assembly and the frame loop. Rules live in js/sim (no THREE), drawing in js/view.
// URL: ?fresh ignores the save, ?size=<0..8> starts a fresh game at that forest size (testing), ?speed=<k> runs the
// clock k times faster (testing).
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import MeshoptDecoder from '../vendor/meshopt_decoder.js';
import { loadLib } from './view/world.js';
import { Forest } from './view/forest.js';
import { GameCamera } from './view/camera.js';
import { NGUI } from './view/ngui.js';
import { env } from './view/shaders.js';
import { AnimLibrary } from './view/anim.js';
import { GameView } from './view/game.js';
import { Hud } from './view/hud.js';
import { Game } from './sim/game.js';
import { cellPos } from './view/forest.js';
import { Sound } from './view/sound.js';
import * as B from './sim/big.js';

const BASE = '.';
// Every data fetch carries the page's ?v=<rev> (tools/stamp.js) so a new build never mixes with cached data.
globalThis.CS_V = new URL(import.meta.url).search;
const SAVE_KEY = 'cats-soup-v1';
const q = new URLSearchParams(location.search);
const canvas = document.getElementById('game');
const stage = document.getElementById('stage');
const uiEl = document.getElementById('ui');
canvas.style.filter = 'blur(12px)';

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setClearColor(new THREE.Color(0.4274, 0.5569, 0.3294));
const scene = new THREE.Scene();
const camera = new GameCamera(canvas, { size: +(q.get('zoom') || 2.5), min: 1.7, max: 6 });

function fit() {
  renderer.setSize(stage.clientWidth, stage.clientHeight, false);
  uiEl.style.transform = `scale(${stage.clientWidth / 1080})`;
  camera.update();
}
addEventListener('resize', fit);

const json = p => fetch(`${BASE}/${p}${globalThis.CS_V}`).then(r => r.json());
const [sfx, tables, fields, ground, places, lang, cats, map, catLib, animLib] = await Promise.all([
  json('art/sfx/sfx.json'), json('data/tables.json'), json('data/fields.json'), json('data/ground.json'), json('data/places.json'),
  json('data/lang-vi.json'), json('data/cats.json'),
  loadLib(BASE, 'map', GLTFLoader, MeshoptDecoder), loadLib(BASE, 'cat', GLTFLoader, MeshoptDecoder), AnimLibrary.load(BASE),
]);

const game = new Game(tables, fields);
let saved = null;
try { saved = q.has('fresh') || q.has('size') ? null : JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { saved = null; }
if (saved) game.load(saved); else game.fresh();
if (q.has('size')) { game.state.mapSize = game.state.maxMapSize = +q.get('size'); }
// ?demo=N (testing and screenshots): build the first N facilities of the table with free gold, expanding as needed.
if (q.has('demo')) {
  const n = +q.get('demo');
  for (let i = 0; i < 400 && game.state.works.length < n; i++) {
    game.state.gold = { f: 9, e: 9000 };
    game.state.gem = 99999;
    if (game.canExpand()) game.expand();
    const next = game.buildList().find(o => o.n < o.max && !o.w.costGem && game.canBuild(o.w.index));
    if (!next) { if (!game.expand()) break; continue; }
    game.build(next.w.index);
  }
  game.state.gold = { f: 2, e: 2 };
  game.events.length = 0;
}
const away = saved ? game.offline((Date.now() - saved.savedAt) / 1000) : null;

const forest = new Forest(map, ground['0'], `${BASE}/art/tex`);
scene.add(forest.group);
const chunkLibs = new Map();
const placeLib = work => {
  const k = places[work];
  if (!chunkLibs.has(k)) chunkLibs.set(k, loadLib(BASE, `places${k}`, GLTFLoader, MeshoptDecoder));
  return chunkLibs.get(k);
};
const view = new GameView({ game, scene, forest, placeLib, catLib, animLib, catTypes: cats, texBase: `${BASE}/art/tex` });
view.rebuildForest();

const ng = await NGUI.load(BASE, lang);
const hudTree = await json('art/ui/hud.json');
const root = uiEl.querySelector('.root');
for (const n of hudTree.roots) root.appendChild(ng.build(n));
const focus = w => { cellPos(w.pos[0], w.pos[1], camera.target); camera.update(); };
const hud = new Hud({ game, ng, root, lang, onBuilt: w => focus(w) });
camera.onTap = (x, y) => {
  const w = view.pick(camera.ground(x, y));
  if (w && w.a === 5 && w.v >= 1) game.claimJar(w);
  hud.select(w || null);
};
fit();
if (away && (away.gold.f || away.energy.f)) hud.toast(`+${B.format(away.gold)} 💰  +${B.format(away.energy)} ⚡`);
const sound = new Sound(BASE, sfx);
const soundBtn = root.querySelector('[data-n="set_option"]');
if (soundBtn) for (const b of soundBtn.querySelectorAll('.w')) { b.style.pointerEvents = 'auto'; b.style.cursor = 'pointer'; b.onclick = () => sound.toggle(); }

// Screen position (in #ui pixels, 1080 wide) of a world point, for floating numbers.
const sv = new THREE.Vector3();
function uiPoint(obj) {
  obj.getWorldPosition(sv);
  sv.y += 0.6;
  sv.project(camera.cam);
  return [(sv.x + 1) * 540, (1 - sv.y) * 960];
}
function floater(text, x, y, color) {
  const d = document.createElement('div');
  d.className = 'floater';
  d.textContent = text;
  d.style.left = `${x}px`;
  d.style.top = `${y}px`;
  if (color) d.style.color = color;
  hud.el.appendChild(d);
  setTimeout(() => d.remove(), 1200);
}

function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(game.save())); } catch (e) { /* storage full or blocked */ }
}
setInterval(save, 10000);
addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

env.ambient.value.set(0.5, 0.5, 0.5, 1);
const speed = +(q.get('speed') || 1);
let last = performance.now();
renderer.setAnimationLoop(t => {
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  game.tick(dt * speed);
  for (const e of game.events) {
    sound.event(e);
    if (e.type === 'expand' || e.type === 'build') view.rebuildForest();
    if (e.type === 'expand') { camera.target.set(0, 0, 0); camera.update(); hud.toast(hud.t('guide_expandNow')); }
    if (e.type === 'sell' && !e.auto) floater(`+${B.format(e.gold)}`, 300, 1700, '#ffe066');
    if ((e.type === 'energy' || e.type === 'jar') && view.works.get(e.work.id)) {
      const [x, y] = uiPoint(view.works.get(e.work.id).obj);
      floater(e.type === 'energy' ? `⚡${B.format(e.energy)}` : `+${B.format(e.gold)}`, x, y, e.type === 'energy' ? '#b6ff7a' : '#ffe066');
    }
  }
  game.events.length = 0;
  view.update(dt * speed);
  hud.update();
  renderer.render(scene, camera.cam);
});
canvas.style.filter = '';
window.__game = game;
window.__hud = hud;
setTimeout(() => { window.__ready = true; }, 3000);
