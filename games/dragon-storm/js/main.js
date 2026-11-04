// Dragon Storm web remake - boot, scenes, game loop, input, and the window.__ds hook the tests drive.
// Flow: title -> world map -> stage prep (upgrade sword / helmet with gold) -> stage -> result -> world map. From the
// map: SHOP (gold and hearts for jewels, js/metaui.js), UPGRADE popup, ITEM tab after stage 5. First run: the original
// guided steps (js/ftue.js). Progress lives in this browser (js/meta.js).
// URL flags: ?mute  ?bot (auto-play)  ?speed=N  ?manual (no auto stepping; tests call __ds.step(ms))  ?notuto (no FTUE)
//   ?stage[=stage02] (skip title + map)  ?seed=N  ?fresh (wipe the save)  ?tier=06 | ?armor=06&sword=06 (preview art).
// Combat input (clips: 4 touch zones, no joystick): left / right triangles slash that way, the red button slashes
// the way the hero faces (the knight's dash), the blue button fires Sword Storm; the potion corner heals; the Divine
// Shield corner only shows the count (it fires by itself when a monster hits).
// Keyboard: arrows or A/D slash, X or Enter = red button (dash), Space/Up/W = Sword Storm, E = potion, P/Esc = pause.
// On desktop the keys are labelled on the controls during play (js/keys.js, as games/food-gang).
import { createSim, update, attack, attackFacing, skill, usePotion, useShield, createBot, autoPlay, toggleAuto, W, H } from './sim.js';
import { createRenderer, BTN, PAD_TOP } from './render.js';
import { createAudio } from './audio.js';
import { createMeta } from './meta.js';
import { createScreens, MAP_NODES, MAP_BTN, PREP_BTN } from './screens.js';
import { createKeyLabels } from './keys.js';
import { createMetaUI, SHOP_LAYOUT, BAG_LAYOUT, UPG_LAYOUT } from './metaui.js';
import { createFtue } from './ftue.js';

const V = new URL(import.meta.url).searchParams.get('v') || '';
const BASE = new URL('../', import.meta.url).href;
const Q = new URLSearchParams(location.search);
const SPEED = Math.max(0.1, Math.min(20, +Q.get('speed') || 1));
const MANUAL = Q.has('manual');
const NOTUTO = Q.has('notuto');
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
let metaUI;
let ftue;
let popup = null; // 'upgrade' over the map
const stages = {};
let renderer;
let keyLabels = null;
let sim = null;
let stageId = BUILT_STAGES[0];
let stageMode = 0; // 0 NORMAL, 1 HARD, 2 HELL (GameData+0x92e0)
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
  dash: () => 'dash',
  heroDie: () => 'hero_die',
  skill: () => 'skill',
  potion: () => 'potion',
  shieldUsed: () => 'shield',
};

function applyTiers() {
  const t = meta.tiers();
  renderer.setTiers({ armor: urlTiers.armor || t.armor, sword: urlTiers.sword || t.sword });
}

function startStage(id = stageId, mode = id === stageId ? stageMode : 0) {
  // a stage needs a heart to start (Call_Back_Game_Start @0x55d9c4); stages 1-5 never take one
  if (!meta.canEnter()) { screens.toast(metaData.shop.messages.value.noHeart); return false; }
  if (ftue) ftue.drop();
  stageId = id;
  stageMode = meta.modeOpen(id, mode) ? mode : 0;
  applyTiers();
  const st = meta.stats();
  // easy first stages while their tutorials are not done (Scene_UI::FUC_INIT_PLAYER code at 0x5f20cc): stage 1
  // ATK x2, dash power x2, DEF x3; stage 2 +3 / +10 / +3 (player+0x53c / +0x540 / +0x544)
  const idx = MAP_STAGES.indexOf(id);
  const tuto = !NOTUTO && ((idx === 0 && !meta.tutoDone(3)) || (idx === 1 && !meta.tutoDone(16)));
  const boost = !tuto ? (v => v) : idx === 0 ? ((v, k) => v * { atk: 2, skill: 2, def: 3 }[k]) : ((v, k) => v + { atk: 3, skill: 10, def: 3 }[k]);
  sim = ds.sim = createSim(stages[id], SEED + runs++, {
    hp: st.hp, atk: boost(st.atk, 'atk'), skill: boost(st.skill, 'skill'), def: boost(st.def, 'def'), wlv: st.wlv,
    critBonus: st.critBonus, cdCut: st.cdCut,
    ...meta.modeSettings(id, stageMode), ...meta.stageBoosters(), autoOpen: meta.autoOpen(id, stageMode),
  });
  // TUTO06 fires when the dash gauge fills for the first time, so that first run starts with it charging (inferred)
  if (!NOTUTO && !meta.tutoDone(6)) sim.hero.dashCd = sim.hero.dashMax;
  sim.firstCoin = false;
  sim.inputFlash = inputFlash;
  resultInfo = { best: meta.stageInfo(id).best, hasNext: false };
  ds.scene = 'stage';
  ds.stageId = id;
  ds.prep = null;
  audio.music('bgm_stage');
  audio.play('start');
  return true;
}

function toTitle() {
  sim = ds.sim = null;
  ds.scene = 'title';
  ds.prep = null;
  titleT = 0;
  audio.music('bgm_title');
}

function toMap(prepIdx = null) {
  // leaving stage 2's result sets TUTO15..20 (the original's retry guard in FUC_SHOW_RESULT; the TUTO17-20 pickup
  // explainers are not built, so this is also what lets the upgrade steps TUTO21/22 start)
  if (sim && MAP_STAGES.indexOf(stageId) === 1 && sim.phase === 'result') meta.setTuto(15, 16, 17, 18, 19, 20);
  if (ftue) ftue.drop();
  popup = null;
  sim = ds.sim = null;
  ds.scene = 'map';
  ds.prep = prepIdx;
  sceneT = 0;
  if (meta.claimGift()) { screens.state.giftBanner = true; screens.toast(metaData.boosters.freeGift.value.text); audio.play('gold'); }
  screens.resetScroll();
  audio.music('bgm_ui');
}

function toShop(from, tab = 'GOLD') {
  shopReturn = from;
  metaUI.st.tab = tab;
  ds.scene = 'shop';
  audio.music('bgm_ui');
}
function toBag() {
  metaUI.st.sel = null;
  ds.scene = 'bag';
  audio.music('bgm_ui');
}

function press(side) {
  if (!sim) return null;
  inputFlash[side < 0 ? 'left' : 'right'] = 0.12;
  return attack(sim, side);
}

function bankRun(cleared) {
  meta.finishRun(stageId, { cleared, stars: sim.stars, score: sim.score, gold: sim.gold, mode: stageMode, untouched: sim.damageTaken === 0 });
  meta.spendHeart(stageId); // win or lose, except stages 1-5 (FUC_SHOW_RESULT @0x5fa4ac)
  const i = MAP_STAGES.indexOf(stageId);
  resultInfo.hasNext = cleared && i >= 0 && i + 1 < MAP_STAGES.length;
}

function handleEvents() {
  for (const e of sim.events) {
    renderer.onEvent(e, sim);
    const f = SFX[e.type];
    if (f) audio.play(f(e));
    // a booster used in the stage is spent from the save at once (SaveBoosterItemAndDestiny after each use)
    if (e.type === 'potion') meta.spendBooster('potion');
    if (e.type === 'shieldUsed') meta.spendBooster('shield');
    if (e.type === 'skill') meta.spendBooster('sword');
    if (e.type === 'kill') setTimeout(() => audio.play('coin', 0.6), MANUAL ? 0 : 900 / SPEED);
    if (e.type === 'kill' && e.gold > 0) sim.firstCoin = true;
    if (e.type === 'phase' && e.phase === 'clear') { audio.music(null); audio.play('result_win'); bankRun(true); }
    if (e.type === 'phase' && e.phase === 'fail') { audio.music(null); audio.play('result_fail'); bankRun(false); }
  }
  sim.events.length = 0;
}

function stepSim(dt) {
  sceneT += dt;
  if (!sim) { titleT += dt; return; }
  if (bot && !sim.tutoHold) bot(sim, dt);
  if (!sim.tutoHold) autoPlay(sim);
  update(sim, dt);
  inputFlash.left = Math.max(0, inputFlash.left - dt);
  inputFlash.right = Math.max(0, inputFlash.right - dt);
  handleEvents();
}

// rects the tutorial bubbles point at
function ftueLayout() {
  const r = c => ({ x: c.cx - c.r, y: c.cy - c.r, w: c.r * 2, h: c.r * 2 });
  return {
    shopBtn: MAP_BTN.shop, itemTab: MAP_BTN.tabs[1], start: PREP_BTN.start, weapon: PREP_BTN.weapon, armor: PREP_BTN.armor,
    box: BAG_LAYOUT.box, cell0: BAG_LAYOUT.cell(0), equipBtn: BAG_LAYOUT.equipBtn,
    right: BTN.right, left: BTN.left, red: r(BTN.red), next: BTN.next, lane: { y: 252, h: PAD_TOP - 252 }, // lit band, clip c2 1:44 (CLIP-MEASURED)
  };
}
function ftueStep(dt) {
  if (!ftue) return;
  const scroll = screens.state.scroll ?? 0;
  const ui = {
    scene: ds.scene, prep: ds.prep, popup: ds.scene === 'bag' ? metaUI.st.sel !== null : popup, sim,
    stageIdx: MAP_STAGES.indexOf(stageId), L: ftueLayout(), firstCoin: !!(sim && sim.firstCoin), mapNode0: [MAP_NODES[0][0], MAP_NODES[0][1] - scroll],
  };
  const c = ftue.cur;
  // a step whose screen is gone is dropped (its flag stays unset, so it shows again next time)
  if (c && (c.sim ? c.sim !== sim || ds.scene !== 'stage' : c.where !== `${ui.scene}:${ui.prep}:${!!ui.popup}`)) ftue.drop();
  if (!ftue.cur) { const s = ftue.check(ui); if (s && !s.sim) s.where = `${ui.scene}:${ui.prep}:${!!ui.popup}`; }
  ftue.draw(dt);
  ds.tuto = ftue.cur ? ftue.cur.id : null;
}

function draw(dt) {
  if (ds.scene === 'title') renderer.drawTitle(titleT, ds.rev);
  else if (ds.scene === 'map') {
    applyTiers();
    screens.drawMap(dt, sceneT);
    if (ds.prep !== null) { screens.drawPrep(ds.prep, sceneT); screens.drawToast(0); }
    if (popup === 'upgrade') { metaUI.drawUpgrade(screens.drawCard, screens.drawKnight); screens.drawToast(0); }
  } else if (ds.scene === 'shop') metaUI.drawShop(dt);
  else if (ds.scene === 'bag') metaUI.drawBag(dt);
  else if (sim) renderer.drawStage(sim, dt, resultInfo);
  ftueStep(MANUAL ? Math.max(dt, 1 / 60) : dt);
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
    const r = metaUI.shopTap(p);
    if (!r) return null;
    if (r.back) { ds.scene = 'map'; audio.music('bgm_ui'); return 'shop-back'; }
    if (r.buy) { if (r.result === 'ok') audio.play('gold'); return `shop-buy-${r.buy}-${r.result}`; }
    if (r.free) { if (r.free === 'ok') audio.play('gold'); return `shop-free-${r.free}`; }
    return r.tab ? `shop-tab-${r.tab}` : null;
  }
  if (ds.scene === 'bag') {
    const r = metaUI.bagTap(p);
    if (!r) return null;
    if (r.back) { toMap(); return 'bag-back'; }
    if (r.box) { if (r.box === 'ok') audio.play('gold'); return `bag-box-${r.box}${r.free ? '-free' : ''}`; }
    if (r.equip !== undefined) { if (r.on) audio.play('shield'); return `bag-${r.on ? 'equip' : 'unequip'}`; }
    if (r.sell !== undefined) { audio.play('gold'); return 'bag-sell'; }
    if (r.inten !== undefined) { if (r.result === 'ok') audio.play('gold'); return `bag-inten-${r.result}`; }
    if (r.expand) return `bag-expand-${r.expand}`;
    return `bag-${Object.keys(r)[0]}`;
  }
  if (popup === 'upgrade') {
    const r = metaUI.upgradeTap(p);
    if (!r) return null;
    if (r.close) { popup = null; return 'upgrade-close'; }
    if (r.result === 'ok') audio.play('gold');
    return `upgrade-${r.upgrade}-${r.result}`;
  }
  if (ds.prep !== null) {
    const r = screens.prepTap(p, ds.prep);
    if (!r) return null;
    if (r.close) { ds.prep = null; return 'prep-close'; }
    if (r.upgrade) { if (r.result === 'ok') audio.play('gold'); return `upgrade-${r.upgrade}-${r.result}`; }
    if (r.shop) { toShop('map', r.shop); return 'shop'; }
    if (r.start) return startStage(r.stage, r.mode) ? 'start-stage' : 'no-heart';
    if (r.buy) { if (r.result === 'ok') audio.play('gold'); return `buy-${r.buy}-${r.result}`; }
    if (r.mode !== undefined) return `mode-${r.mode}${r.locked ? '-locked' : ''}`;
    return Object.keys(r)[0];
  }
  const r = screens.mapTap(p);
  if (!r) return null;
  if (r.stage !== undefined) { ds.prep = r.stage; return `prep-${MAP_STAGES[r.stage]}`; }
  if (r.shop) { toShop('map', r.shop); return 'shop'; }
  if (r.upgrade) { popup = 'upgrade'; return 'upgrade'; }
  if (r.tab === 'ITEM' && r.open) { toBag(); return 'bag'; }
  return `tab-${r.tab}${r.open ? '' : '-locked'}`;
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
  if (inside(p, BTN.auto)) { return toggleAuto(sim) ? `auto-${sim.auto ? 'on' : 'off'}` : 'auto-locked'; }
  if (inCircle(p, BTN.red)) { attackFacing(sim); return 'red'; }
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
  if (ftue && ftue.tap(p) === 'block') return 'tuto';
  if (ds.scene === 'map' || ds.scene === 'shop' || ds.scene === 'bag') return tapMenu(p);
  if (!sim) return null;
  return tapStage(p);
}

// combat reacts on pointer down; menus act on release so the map can be dragged
let drag = null;
canvas.addEventListener('pointerdown', ev => {
  ev.preventDefault();
  const p = toCanvas(ev);
  if (ds.scene === 'map' && ds.prep === null && !popup && !(ftue && ftue.active())) { drag = { y: p.y, moved: 0, p }; return; }
  if (ds.scene === 'map' || ds.scene === 'shop' || ds.scene === 'bag') { drag = { y: p.y, moved: 0, p, noScroll: true }; return; }
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
  if (ftue && ftue.key(k) === 'block') return;
  if (ds.scene === 'shop' || ds.scene === 'bag') { if (k === 'Escape') toMap(); return; }
  if (ds.scene === 'map' && popup) { if (k === 'Escape') popup = null; return; }
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
  else if (k === 'e' || k === 'E') usePotion(sim);
});

// ---- loop ----
let last = 0;
let acc = 0;
// the next frame is booked first, so one exception can never stop the loop (Drop 3 froze for good on any throw)
function frame(now) {
  requestAnimationFrame(frame);
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
  last = now;
  try {
    if (!MANUAL) {
      acc += dt * SPEED;
      let n = 0;
      while (acc >= STEP && n++ < 240) { stepSim(STEP); acc -= STEP; }
    }
    draw(MANUAL ? 0 : dt * SPEED);
    if (keyLabels) keyLabels.update(sim, dt);
  } catch (e) {
    reportError(e);
  }
  if (ds.errors.length) drawErrorBar();
}

// errors go to __ds.errors, the console, and a red bar on the canvas (so a player can read them out)
function reportError(e) {
  const msg = String((e && e.message) || e);
  if (!ds.errors.includes(msg)) { ds.errors.push(msg); console.error(e); }
}
function drawErrorBar() {
  ctx.save();
  ctx.fillStyle = 'rgba(150,0,0,0.85)';
  ctx.fillRect(0, H - 46, W, 46);
  ctx.fillStyle = '#fff';
  ctx.font = '13px sans-serif';
  ctx.fillText(`ERROR (rev ${ds.rev}): ${ds.errors[ds.errors.length - 1]}`.slice(0, 70), 8, H - 28);
  ctx.fillText('Please send this text with the bug report.', 8, H - 10);
  ctx.restore();
}
function drawBootText(lines, color) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = color;
  ctx.font = '18px sans-serif';
  ctx.textAlign = 'center';
  lines.forEach((t, i) => ctx.fillText(t, W / 2, H / 2 + i * 26));
  ctx.textAlign = 'left';
}

// test hooks
Object.assign(ds, {
  start: (id, mode = 0) => startStage(id || BUILT_STAGES[0], mode),
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
  shop: tab => toShop('map', tab),
  bag: toBag,
  upgradePopup: () => { popup = 'upgrade'; },
  popup: () => popup,
  ftue: () => (ftue && ftue.cur ? ftue.cur.id : null),
  ftueRect: () => ftue && ftue.cur && ftue.cur.target,
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
  const hooks = { toast: t => screens.toast(t), drawToast: dt => screens.drawToast(dt), freeBox: () => !NOTUTO && !meta.tutoDone(26) };
  metaUI = createMetaUI(renderer.gfx, meta, metaData, hooks);
  screens = createScreens(renderer.gfx, meta, stages, metaData, metaUI);
  if (!NOTUTO) ftue = createFtue(renderer.gfx, meta);
  // ?tier=06 sets both knight layers, ?armor= / ?sword= set one (art preview; the save's levels pick the tier otherwise)
  const tierQ = k => { const v = Q.get(k) || Q.get('tier'); return v && art.images[`hero_${k}_${v.padStart(2, '0')}`] ? v.padStart(2, '0') : undefined; };
  urlTiers = { armor: tierQ('armor'), sword: tierQ('sword') };
  ds.art = art;
  ds.stages = stages;
  ds.meta = meta;
  ds.metaData = metaData;
  ds.layout = { MAP_NODES, MAP_BTN, PREP_BTN, SHOP: SHOP_LAYOUT, BAG: BAG_LAYOUT, UPG: UPG_LAYOUT };
  const st = Q.get('stage');
  if (Q.has('stage')) startStage(stages[st] ? st : BUILT_STAGES[0]); else toTitle();
  keyLabels = createKeyLabels(canvas, BTN);
  ds.keyLabels = keyLabels;
  ds.ready = true;
  requestAnimationFrame(frame);
}
drawBootText(['LOADING...'], '#ccc');
boot().catch(e => {
  reportError(e);
  drawBootText(['DRAGON STORM COULD NOT LOAD', String((e && e.message) || e).slice(0, 48), `rev ${ds.rev}`], '#ff8a7a');
});
