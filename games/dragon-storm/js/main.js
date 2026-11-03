// Dragon Storm web remake - boot, scenes, game loop, input, and the window.__ds hook the tests drive.
// Flow: title -> world map -> stage prep (upgrade sword / helmet with gold) -> stage -> result -> world map; the "+"
// next to gold / gems opens the shop (buying turned off). Progress lives in this browser (js/meta.js).
// URL flags: ?mute  ?bot (auto-play)  ?speed=N  ?manual (no auto stepping; tests call __ds.step(ms))
//   ?stage[=stage02] (skip title + map)  ?seed=N  ?fresh (wipe the save)  ?tier=06 | ?armor=06&sword=06 (preview art).
// Combat input (clips: 4 touch zones, no joystick): left / right triangles slash that way, the red button slashes
// the way the hero faces, the blue button fires the skill; corner slots use the winged shield / potion.
// Keyboard: arrows or A/D slash, X or Enter = red button, Space/Up/W = skill, Q = shield, E = potion, P/Esc = pause.
import { createSim, update, attack, attackFacing, skill, usePotion, useShield, createBot, W, H } from './sim.js';
import { createRenderer, BTN, PAD_TOP } from './render.js';
import { createAudio } from './audio.js';
import { createMeta } from './meta.js';
import { createScreens, MAP_NODES, MAP_BTN, PREP_BTN, SHOP_BTN } from './screens.js';

const V = new URL(import.meta.url).searchParams.get('v') || '';
const BASE = new URL('../', import.meta.url).href;
const Q = new URLSearchParams(location.search);
const SPEED = Math.max(0.1, Math.min(20, +Q.get('speed') || 1));
const MANUAL = Q.has('manual');
const SEED = +Q.get('seed') || 1;
const STEP = 1 / 60;
const BUILT_STAGES = ['stage01', 'stage02', 'stage03', 'stage04', 'stage05'];
const MAP_STAGES = BUILT_STAGES; // stages placed on the map (clip c2 5:20, stage 5 clip c1 7:52)

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = W;
canvas.height = H;
ctx.imageSmoothingEnabled = false;

const ds = (window.__ds = { ready: false, errors: [], scene: 'boot', rev: V || 'dev', sim: null, frames: 0, prep: null });
window.addEventListener('error', e => ds.errors.push(String(e.message)));
window.addEventListener('unhandledrejection', e => ds.errors.push(String((e.reason && e.reason.message) || e.reason)));

const json = async url => {
  const r = await fetch(`${BASE}${url}?v=${V}`);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
};
const loadImage = url => new Promise((res, rej) => {
  const i = new Image();
  i.onload = () => res(i);
  i.onerror = () => rej(new Error(`image not loaded: ${url}`));
  i.src = `${BASE}${url}?v=${V}`;
});

const audio = createAudio(Q.has('mute'));
let art;
let metaData;
let meta;
let screens;
const stages = {};
let renderer;
let sim = null;
let stageId = BUILT_STAGES[0];
let resultInfo = {};
let bot = Q.has('bot') ? createBot({ react: 0.1, err: 0.05 }) : null;
let titleT = 0;
let sceneT = 0;
let runs = 0;
let urlTiers = {};
let shopReturn = 'map';
const inputFlash = { left: 0, right: 0 };

const SFX = {
  hit: () => 'sword_hit',
  kill: () => 'sword_kill',
  miss: () => 'sword_miss',
  monsterAttack: e => sim.stage.monsters[e.mtype].attackSfx,
  alert: () => 'boss_alert',
  heroDie: () => 'hero_die',
  skill: () => 'skill',
  potion: () => 'potion',
};

function applyTiers() {
  const t = meta.tiers();
  renderer.setTiers({ armor: urlTiers.armor || t.armor, sword: urlTiers.sword || t.sword });
}

function startStage(id = stageId) {
  stageId = id;
  applyTiers();
  const st = meta.stats();
  sim = ds.sim = createSim(stages[id], SEED + runs++, { hp: st.hp, atk: st.atk, crit: st.crit, def: st.def });
  sim.inputFlash = inputFlash;
  resultInfo = { best: meta.stageInfo(id).best, hasNext: false };
  ds.scene = 'stage';
  ds.stageId = id;
  ds.prep = null;
  audio.music('bgm_stage');
  audio.play('start');
}

function toTitle() {
  sim = ds.sim = null;
  ds.scene = 'title';
  ds.prep = null;
  titleT = 0;
  audio.music('bgm_title');
}

function toMap(prepIdx = null) {
  sim = ds.sim = null;
  ds.scene = 'map';
  ds.prep = prepIdx;
  sceneT = 0;
  screens.resetScroll();
  audio.music('bgm_ui');
}

function toShop(from) {
  shopReturn = from;
  ds.scene = 'shop';
  audio.music('bgm_ui');
}

function press(side) {
  if (!sim) return null;
  inputFlash[side < 0 ? 'left' : 'right'] = 0.12;
  return attack(sim, side);
}

function bankRun(cleared) {
  meta.finishRun(stageId, { cleared, stars: sim.stars, score: sim.score, gold: sim.gold });
  const i = MAP_STAGES.indexOf(stageId);
  resultInfo.hasNext = cleared && i >= 0 && i + 1 < MAP_STAGES.length;
}

function handleEvents() {
  for (const e of sim.events) {
    renderer.onEvent(e, sim);
    const f = SFX[e.type];
    if (f) audio.play(f(e));
    if (e.type === 'kill') setTimeout(() => audio.play('coin', 0.6), MANUAL ? 0 : 900 / SPEED);
    if (e.type === 'phase' && e.phase === 'clear') { audio.music(null); audio.play('result_win'); bankRun(true); }
    if (e.type === 'phase' && e.phase === 'fail') { audio.music(null); audio.play('result_fail'); bankRun(false); }
  }
  sim.events.length = 0;
}

function stepSim(dt) {
  sceneT += dt;
  if (!sim) { titleT += dt; return; }
  if (bot) bot(sim, dt);
  update(sim, dt);
  inputFlash.left = Math.max(0, inputFlash.left - dt);
  inputFlash.right = Math.max(0, inputFlash.right - dt);
  handleEvents();
}

function draw(dt) {
  if (ds.scene === 'title') renderer.drawTitle(titleT, ds.rev);
  else if (ds.scene === 'map') {
    applyTiers();
    screens.drawMap(dt, sceneT);
    if (ds.prep !== null) { screens.drawPrep(ds.prep, sceneT); screens.drawToast(0); }
  } else if (ds.scene === 'shop') screens.drawShop(dt);
  else if (sim) renderer.drawStage(sim, dt, resultInfo);
  ds.frames++;
}

// ---- input ----
function toCanvas(ev) {
  const r = canvas.getBoundingClientRect();
  return { x: ((ev.clientX - r.left) / r.width) * W, y: ((ev.clientY - r.top) / r.height) * H };
}
const inside = (p, b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
const inCircle = (p, b) => (p.x - b.cx) ** 2 + (p.y - b.cy) ** 2 <= b.r * b.r;
// corner slots are triangles hugging the outer edge: the half above the slot's diagonal
const inCorner = (p, b, leftSide) => inside(p, b) && (leftSide ? (p.x - b.x) / b.w + (p.y - b.y) / b.h <= 1 : (b.x + b.w - p.x) / b.w + (p.y - b.y) / b.h <= 1);

function tapMenu(p) {
  if (ds.scene === 'shop') {
    const r = screens.shopTap(p);
    if (r && r.back) { ds.scene = 'map'; audio.music('bgm_ui'); return 'shop-back'; }
    return null;
  }
  if (ds.prep !== null) {
    const r = screens.prepTap(p, ds.prep);
    if (!r) return null;
    if (r.close) { ds.prep = null; return 'prep-close'; }
    if (r.upgrade) { if (r.result === 'ok') audio.play('gold'); return `upgrade-${r.upgrade}-${r.result}`; }
    if (r.shop) { toShop('map'); return 'shop'; }
    if (r.start) { startStage(r.stage); return 'start-stage'; }
    return Object.keys(r)[0];
  }
  const r = screens.mapTap(p);
  if (r && r.stage !== undefined) { ds.prep = r.stage; return `prep-${MAP_STAGES[r.stage]}`; }
  return r && r.tab ? `tab-${r.tab}` : null;
}

function tapStage(p) {
  if (sim.phase === 'result') {
    if (inside(p, BTN.retry)) { startStage(stageId); return 'retry'; }
    if (inside(p, BTN.next) && resultInfo.hasNext) { toMap(MAP_STAGES.indexOf(stageId) + 1); return 'next'; }
    if (inside(p, BTN.map) || inside(p, BTN.close)) { toMap(); return 'worldmap'; }
    return null;
  }
  if (sim.paused) { sim.paused = false; return 'resume'; }
  if (inside(p, BTN.pause)) { if (sim.phase === 'play') sim.paused = true; return 'pause'; }
  if (inCircle(p, BTN.red)) { inputFlash[sim.hero.facing < 0 ? 'left' : 'right'] = 0.12; attackFacing(sim); return 'red'; }
  if (inCircle(p, BTN.blue)) { skill(sim); return 'blue'; }
  if (inCorner(p, BTN.shield, true)) { useShield(sim); return 'shield'; }
  if (inCorner(p, BTN.potion, false)) { usePotion(sim); return 'potion'; }
  if (p.y >= PAD_TOP && p.y < H - 112) { press(p.x < W / 2 ? -1 : 1); return p.x < W / 2 ? 'left' : 'right'; }
  if (p.y < PAD_TOP) { press(p.x < W / 2 ? -1 : 1); return p.x < W / 2 ? 'left' : 'right'; } // tapping the lane works too
  return null;
}

function tap(p) {
  audio.unlock();
  if (ds.scene === 'title') { toMap(); return 'title-start'; }
  if (ds.scene === 'map' || ds.scene === 'shop') return tapMenu(p);
  if (!sim) return null;
  return tapStage(p);
}

// combat reacts on pointer down; menus act on release so the map can be dragged
let drag = null;
canvas.addEventListener('pointerdown', ev => {
  ev.preventDefault();
  const p = toCanvas(ev);
  if (ds.scene === 'map' && ds.prep === null) { drag = { y: p.y, moved: 0, p }; return; }
  if (ds.scene === 'map' || ds.scene === 'shop') { drag = { y: p.y, moved: 0, p, noScroll: true }; return; }
  ds.lastTap = tap(p);
});
canvas.addEventListener('pointermove', ev => {
  if (!drag || drag.noScroll) return;
  const p = toCanvas(ev);
  drag.moved += Math.abs(p.y - drag.y);
  screens.mapScrollBy(p.y - drag.y);
  drag.y = p.y;
});
canvas.addEventListener('pointerup', ev => {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (d.moved < 8) ds.lastTap = tap(toCanvas(ev));
});
window.addEventListener('keydown', ev => {
  audio.unlock();
  const k = ev.key;
  if (ds.scene === 'title' && (k === 'Enter' || k === ' ')) { toMap(); return; }
  if (ds.scene === 'shop') { if (k === 'Escape') ds.scene = 'map'; return; }
  if (ds.scene === 'map') {
    if (ds.prep !== null && k === 'Escape') ds.prep = null;
    else if (ds.prep !== null && k === 'Enter' && stages[MAP_STAGES[ds.prep]]) startStage(MAP_STAGES[ds.prep]);
    return;
  }
  if (!sim) return;
  if (sim.phase === 'result') {
    if (k === 'Enter' || k === 'r' || k === 'R') startStage(stageId);
    else if ((k === 'n' || k === 'N') && resultInfo.hasNext) toMap(MAP_STAGES.indexOf(stageId) + 1);
    else if (k === 'Escape') toMap();
    return;
  }
  if (k === 'p' || k === 'P' || k === 'Escape') { if (sim.phase === 'play') sim.paused = !sim.paused; return; }
  if (sim.paused) return;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') press(-1);
  else if (k === 'ArrowRight' || k === 'd' || k === 'D') press(1);
  else if (k === 'x' || k === 'X' || k === 'Enter') attackFacing(sim);
  else if (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W') skill(sim);
  else if (k === 'q' || k === 'Q') useShield(sim);
  else if (k === 'e' || k === 'E') usePotion(sim);
});

// ---- loop ----
let last = 0;
let acc = 0;
function frame(now) {
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
  last = now;
  if (!MANUAL) {
    acc += dt * SPEED;
    let n = 0;
    while (acc >= STEP && n++ < 240) { stepSim(STEP); acc -= STEP; }
  }
  draw(MANUAL ? 0 : dt * SPEED);
  requestAnimationFrame(frame);
}

// test hooks
Object.assign(ds, {
  start: id => startStage(id || BUILT_STAGES[0]),
  title: toTitle,
  map: toMap,
  press,
  skill: () => sim && skill(sim),
  tapAt: (x, y) => (ds.lastTap = tap({ x, y })),
  bot: on => { bot = on ? createBot(typeof on === 'object' ? on : { react: 0.1, err: 0.05 }) : null; },
  step: ms => { for (let i = 0; i < Math.round(ms / (STEP * 1000)); i++) stepSim(STEP); draw(ms / 1000); },
  sfx: audio.log,
  fxCount: () => renderer.fx.length,
  heroPose: () => sim && renderer.heroPose(sim),
  setTiers: t => { urlTiers = { ...t }; renderer.setTiers(t); },
  btn: BTN,
  mapScroll: () => screens.state.scroll,
});

async function boot() {
  art = await json('data/art.json');
  metaData = await json('data/meta.json');
  for (const id of BUILT_STAGES) stages[id] = await json(`data/${id}.json`);
  await Promise.all(Object.values(art.images).map(async a => { a.img = await loadImage(a.file); }));
  await Promise.all(Object.entries(art.audio).map(([k, a]) => audio.load(k, `${BASE}${a.file}?v=${V}`)));
  renderer = createRenderer(ctx, art);
  meta = createMeta(metaData, MAP_STAGES);
  if (Q.has('fresh')) meta.reset();
  screens = createScreens(renderer.gfx, meta, stages, metaData);
  // ?tier=06 sets both knight layers, ?armor= / ?sword= set one (art preview; the save's levels pick the tier otherwise)
  const tierQ = k => { const v = Q.get(k) || Q.get('tier'); return v && art.images[`hero_${k}_${v.padStart(2, '0')}`] ? v.padStart(2, '0') : undefined; };
  urlTiers = { armor: tierQ('armor'), sword: tierQ('sword') };
  ds.art = art;
  ds.stages = stages;
  ds.meta = meta;
  ds.metaData = metaData;
  ds.layout = { MAP_NODES, MAP_BTN, PREP_BTN, SHOP_BTN };
  const st = Q.get('stage');
  if (Q.has('stage')) startStage(stages[st] ? st : BUILT_STAGES[0]); else toTitle();
  ds.ready = true;
  requestAnimationFrame(frame);
}
boot().catch(e => { ds.errors.push(String(e.message || e)); console.error(e); });
