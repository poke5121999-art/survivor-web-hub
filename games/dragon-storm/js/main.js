// Dragon Storm web remake - boot, game loop, input, and the window.__ds hook the tests drive.
// URL flags: ?mute  ?bot (auto-play)  ?speed=N (sim time multiplier)  ?manual (no auto stepping; tests call
// __ds.step(ms))  ?stage[=stage02] (skip the title)  ?seed=N  ?tier=06 | ?armor=06&sword=06 (knight upgrade tier).
// Input (clips: 4 touch zones, no joystick): left / right triangles slash that way, the red button slashes the way
// the hero faces, the blue button fires the skill; corner slots use the winged shield / potion. Keyboard: arrows or
// A/D slash, X or Enter = red button, Space/Up/W = skill, Q = shield, E = potion, P/Esc = pause.
import { createSim, update, attack, attackFacing, skill, usePotion, useShield, createBot, W, H } from './sim.js';
import { createRenderer, BTN, PAD_TOP } from './render.js';
import { createAudio } from './audio.js';

const V = new URL(import.meta.url).searchParams.get('v') || '';
const BASE = new URL('../', import.meta.url).href;
const Q = new URLSearchParams(location.search);
const SPEED = Math.max(0.1, Math.min(20, +Q.get('speed') || 1));
const MANUAL = Q.has('manual');
const SEED = +Q.get('seed') || 1;
const STEP = 1 / 60;
const STAGE_IDS = ['stage01', 'stage02'];

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = W;
canvas.height = H;
ctx.imageSmoothingEnabled = false;

const ds = (window.__ds = { ready: false, errors: [], scene: 'boot', rev: V || 'dev', sim: null, frames: 0 });
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

// best score per stage: a per-viewer convenience, so storage failures are ignored
const best = {
  get: id => { try { return +localStorage.getItem(`ds.best.${id}`) || 0; } catch (e) { return 0; } },
  put: (id, v) => { try { if (v > best.get(id)) localStorage.setItem(`ds.best.${id}`, String(v)); } catch (e) { /* storage blocked */ } },
};

const audio = createAudio(Q.has('mute'));
let art;
const stages = {};
let renderer;
let sim = null;
let stageId = STAGE_IDS[0];
let resultInfo = {};
let bot = Q.has('bot') ? createBot({ react: 0.1, err: 0.05 }) : null;
let titleT = 0;
let runs = 0;
const inputFlash = { left: 0, right: 0 };

const SFX = {
  hit: () => 'sword_hit',
  kill: () => 'sword_kill',
  miss: () => 'sword_miss',
  monsterAttack: e => sim.stage.monsters[e.mtype].attackSfx,
  heroDie: () => 'hero_die',
  skill: () => 'skill',
  potion: () => 'potion',
};

function startStage(id = stageId) {
  stageId = id;
  sim = ds.sim = createSim(stages[id], SEED + runs++);
  sim.inputFlash = inputFlash;
  resultInfo = { best: best.get(id), hasNext: false };
  ds.scene = 'stage';
  ds.stageId = id;
  audio.music('bgm_stage');
  audio.play('start');
}

function toTitle() {
  sim = ds.sim = null;
  ds.scene = 'title';
  titleT = 0;
  audio.music('bgm_title');
}

function press(side) {
  if (!sim) return null;
  inputFlash[side < 0 ? 'left' : 'right'] = 0.12;
  return attack(sim, side);
}

function handleEvents() {
  for (const e of sim.events) {
    renderer.onEvent(e, sim);
    const f = SFX[e.type];
    if (f) audio.play(f(e));
    if (e.type === 'kill') setTimeout(() => audio.play('coin', 0.6), MANUAL ? 0 : 900 / SPEED);
    if (e.type === 'phase' && e.phase === 'clear') {
      audio.music(null);
      audio.play('result_win');
      best.put(stageId, sim.score);
      resultInfo.hasNext = !!sim.stage.next && !!stages[sim.stage.next];
    }
    if (e.type === 'phase' && e.phase === 'fail') { audio.music(null); audio.play('result_fail'); }
  }
  sim.events.length = 0;
}

function stepSim(dt) {
  if (!sim) { titleT += dt; return; }
  if (bot) bot(sim, dt);
  update(sim, dt);
  inputFlash.left = Math.max(0, inputFlash.left - dt);
  inputFlash.right = Math.max(0, inputFlash.right - dt);
  handleEvents();
}

function draw(dt) {
  if (ds.scene === 'title') renderer.drawTitle(titleT, ds.rev);
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

function tap(p) {
  audio.unlock();
  if (ds.scene === 'title') { startStage(STAGE_IDS[0]); return 'start'; }
  if (!sim) return null;
  if (sim.phase === 'result') {
    if (inside(p, BTN.retry)) { startStage(stageId); return 'retry'; }
    if (inside(p, BTN.next) && resultInfo.hasNext) { startStage(sim.stage.next); return 'next'; }
    if (inside(p, BTN.map)) { toTitle(); return 'title'; }
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

canvas.addEventListener('pointerdown', ev => { ev.preventDefault(); ds.lastTap = tap(toCanvas(ev)); });
window.addEventListener('keydown', ev => {
  audio.unlock();
  const k = ev.key;
  if (ds.scene === 'title' && (k === 'Enter' || k === ' ')) { startStage(STAGE_IDS[0]); return; }
  if (!sim) return;
  if (sim.phase === 'result') {
    if (k === 'Enter' || k === 'r' || k === 'R') startStage(stageId);
    else if ((k === 'n' || k === 'N') && resultInfo.hasNext) startStage(sim.stage.next);
    else if (k === 'Escape') toTitle();
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
  start: id => startStage(id || STAGE_IDS[0]),
  title: toTitle,
  press,
  skill: () => sim && skill(sim),
  tapAt: (x, y) => (ds.lastTap = tap({ x, y })),
  bot: on => { bot = on ? createBot(typeof on === 'object' ? on : { react: 0.1, err: 0.05 }) : null; },
  step: ms => { for (let i = 0; i < Math.round(ms / (STEP * 1000)); i++) stepSim(STEP); draw(ms / 1000); },
  sfx: audio.log,
  fxCount: () => renderer.fx.length,
  heroPose: () => sim && renderer.heroPose(sim),
  setTiers: t => renderer.setTiers(t),
  btn: BTN,
});

async function boot() {
  art = await json('data/art.json');
  for (const id of STAGE_IDS) stages[id] = await json(`data/${id}.json`);
  await Promise.all(Object.values(art.images).map(async a => { a.img = await loadImage(a.file); }));
  await Promise.all(Object.entries(art.audio).map(([k, a]) => audio.load(k, `${BASE}${a.file}?v=${V}`)));
  renderer = createRenderer(ctx, art);
  // ?tier=06 sets both knight layers, ?armor= / ?sword= set one (two-digit tier, e.g. 01..11, 20, 30, 40, 50)
  const tierQ = k => { const v = Q.get(k) || Q.get('tier'); return v && art.images[`hero_${k}_${v.padStart(2, '0')}`] ? v.padStart(2, '0') : undefined; };
  renderer.setTiers({ armor: tierQ('armor'), sword: tierQ('sword') });
  ds.art = art;
  ds.stages = stages;
  const st = Q.get('stage');
  if (Q.has('stage')) startStage(stages[st] ? st : STAGE_IDS[0]); else toTitle();
  ds.ready = true;
  requestAnimationFrame(frame);
}
boot().catch(e => { ds.errors.push(String(e.message || e)); console.error(e); });
