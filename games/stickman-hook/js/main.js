import { buildLevel } from './level.js';
import { Player, PHYS } from './physics.js';
import { Renderer } from './render.js';

const V = '?v=20261028a';
const SAVE_KEY = 'stickman-hook';
const DEFAULT_ZOOM = 5, FINISH_ZOOM = 2; // CameraConfig.defaultZoom, PlayerCameraController.cameraZoomOnEndGame

const $ = (id) => document.getElementById(id);
const cv = $('cv');

function load(url) { return fetch(url + V).then((r) => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); }); }
function image(url) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url + V; });
}

function readSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || { level: 0, best: 0, sound: true }; }
  catch { return { level: 0, best: 0, sound: true }; }
}
function writeSave(s) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* private mode */ } }

const sfx = {};
function play(name) {
  if (!save.sound) return;
  const a = sfx[name];
  if (a) { a.currentTime = 0; a.play().catch(() => {}); }
}

let data, R, world, player, save = readSave();
const cam = { x: 0, y: 0, zoom: DEFAULT_ZOOM };
// phase: 'spawn' (spawn FX, player hidden) -> 'play' -> 'finish' (slow motion + zoom, then wait for a tap).
// Leaving the camera through its bottom or left edge while not hooked restarts the level (CameraLimits triggers).
const game = { phase: 'spawn', t: 0, hold: false, deaths: 0, confetti: [], timeScale: 1, zoomFrom: DEFAULT_ZOOM, camFrom: null };

function startLevel(index) {
  world = buildLevel(data, index);
  save.level = index;
  writeSave(save);
  player = new Player(world.spawn);
  game.phase = 'spawn';
  game.t = 0;
  game.hold = false;
  game.confetti = [];
  game.timeScale = 1;
  cam.zoom = DEFAULT_ZOOM;
  cam.x = clampCamX(world.spawn.x);
  cam.y = 0;
}

function clampCamX(x) {
  const halfW = (cv.width / cv.height) * cam.zoom;
  const lo = world.camMin + halfW, hi = world.camMax - halfW;
  return lo > hi ? (world.camMin + world.camMax) / 2 : Math.min(hi, Math.max(lo, x));
}

function finishLevel() {
  game.phase = 'finish';
  game.t = 0;
  game.zoomFrom = cam.zoom;
  game.camFrom = { x: cam.x, y: cam.y };
  save.best = Math.max(save.best, world.index + 1);
  writeSave(save);
  play('popup_in');
  const sp = Math.hypot(player.vx, player.vy) || 1;
  for (let i = 0; i < 60; i++) {
    const a = Math.atan2(player.vy, player.vx) + (Math.random() - 0.5) * 1.6, v = 2 + Math.random() * 4;
    game.confetti.push({ x: player.x + player.vx * 0.04, y: player.y + player.vy * 0.04, vx: Math.cos(a) * v + player.vx / sp,
      vy: Math.sin(a) * v,
      r: Math.random() * 6, c: ['#ff5a5f', '#ffd23f', '#7ee0ff', '#fff', '#7cff8a'][i % 5] });
  }
}

function outOfCamera() {
  const halfW = (cv.width / cv.height) * cam.zoom;
  return player.y < cam.y - cam.zoom - 0.3 || player.x < cam.x - halfW - 0.3;
}

function respawn() {
  game.deaths++;
  player = new Player(world.spawn);
  game.phase = 'spawn';
  game.t = 0;
}

function nextLevel() { play('button'); startLevel(world.index + 1); }

const STEP = PHYS.fixedDt;
let acc = 0, last = 0;
function frame(now) {
  requestAnimationFrame(frame);
  R.resize();
  let dt = Math.min(0.1, (now - (last || now)) / 1000);
  last = now;
  game.t += dt;

  if (game.phase === 'spawn' && game.t >= PHYS.timeToSpawn) { game.phase = 'play'; game.t = 0; }
  if (game.phase === 'finish') {
    // TimeScale.AnimateTimescale(0.05, 600 ms, OutCirc), real time
    const k = Math.min(1, game.t / 0.6);
    game.timeScale = 1 - 0.95 * Math.sqrt(1 - (k - 1) * (k - 1));
  }
  if (game.phase === 'play' || game.phase === 'finish') {
    acc += dt * game.timeScale;
    while (acc >= STEP) {
      acc -= STEP;
      const ev = player.step(STEP, world, game.phase === 'play' && game.hold);
      if (ev.bumper >= 0) world.bumpers[ev.bumper].anim = 0;
      if (ev.finished && game.phase === 'play') finishLevel();
      if (game.phase === 'play' && player.hooked < 0 && outOfCamera()) { respawn(); break; }
    }
  } else acc = 0;

  for (const b of world.bumpers) if (b.anim >= 0) { b.anim += dt; if (b.anim > 0.1667) b.anim = -1; }
  updateCamera(dt);
  draw(now);
}

function updateCamera(dt) {
  if (game.phase === 'finish') {
    // ZoomOnPlayer: DOOrthoSize(2, 0.5 s, InOutSine) while the bounds re-centre on the player
    const k = Math.min(1, game.t / 0.5), e = -(Math.cos(Math.PI * k) - 1) / 2;
    cam.zoom = game.zoomFrom + (FINISH_ZOOM - game.zoomFrom) * e;
    cam.x = game.camFrom.x + (player.x - game.camFrom.x) * e;
    cam.y = game.camFrom.y + (player.y - game.camFrom.y) * e;
    return;
  }
  cam.zoom = DEFAULT_ZOOM;
  if (game.phase === 'spawn') return;
  // ProCamera2D follow with ForwardFocus: lead in the direction of travel, clamped to StartCamera..EndCamera.
  const lead = Math.max(-1.2, Math.min(1.2, player.vx * 0.2));
  const want = clampCamX(player.x + lead);
  cam.x += (want - cam.x) * Math.min(1, dt * 6);
  cam.y = 0;
}

const BUMP_FRAMES = ['AN_Grap1_BumperLarge0001', 'AN_Grap1_BumperLarge0002', 'AN_Grap1_BumperLarge0003',
  'AN_Grap1_BumperLarge0004', 'AN_Grap1_BumperLarge0005'];

function draw(now) {
  R.begin(cam);
  const halfW = (cv.width / cv.height) * cam.zoom + 3;
  const t = now / 1000;
  const hooked = player.hooked, closest = player.closest;
  for (const d of world.draw) {
    if (Math.abs(d.m[4] - cam.x) > halfW + 12) continue;
    let name = d.s, m = d.m;
    if (d.bumper != null) {
      const b = world.bumpers[d.bumper];
      if (b.anim >= 0) name = BUMP_FRAMES[Math.min(4, Math.floor(b.anim * 30))];
    }
    if (d.target != null && d.target === hooked) name = 'A_PlotSelected';
    if (d.bob) m = [m[0], m[1], m[2], m[3], m[4], m[5] + Math.sin(t * (2 * Math.PI / 0.383)) * 0.06];
    if (d.sh) {
      const sm = [m[0], m[1], m[2], m[3], m[4] + d.sh[0], m[5] + d.sh[1]];
      if (d.size) R.tiled(name, sm, d.size, true); else R.sprite(name, sm, { shadow: true });
    }
    if (d.size) R.tiled(name, m, d.size, d.shadow);
    else R.sprite(name, m, { tint: d.tint, shadow: d.shadow });
    if (d.target != null && d.target === closest && hooked < 0 && game.phase === 'play') {
      const s = 0.5 * 1.2 * (1 + 0.05 * Math.sin(t * 12));
      R.sprite('A_PlotNearestFeedback', [s, 0, 0, s, m[4], m[5]]);
    }
  }
  drawPlayer();
  drawConfetti();
  drawHud(now);
}

function drawPlayer() {
  if (player.hooked >= 0) {
    const tg = world.targets[player.hooked];
    const a = player.anchor();
    R.line(a.x, a.y, tg.x, tg.y, 0.045, '#0d1b2a');
  }
  if (game.phase === 'spawn') {
    const k = game.t / PHYS.timeToSpawn, s = 0.15 + k * 0.5;
    R.sprite('A_PlotNearestFeedback', [s, 0, 0, s, world.spawn.x, world.spawn.y], { alpha: 1 - k });
    return;
  }
  const s = 0.3 * player.scale(), fx = player.flipX ? -1 : 1;
  const c = Math.cos(player.angle) * s, sn = Math.sin(player.angle) * s;
  const m = [c * fx, sn * fx, -sn, c, player.x, player.y];
  const name = player.frame();
  R.sprite(name, [m[0], m[1], m[2], m[3], m[4], m[5] - 0.1], { shadow: true });
  R.sprite(name, m);
}

function drawConfetti() {
  if (!game.confetti.length) return;
  const { ctx } = R;
  for (const p of game.confetti) {
    p.vy -= 9.81 * 0.016; p.x += p.vx * 0.016; p.y += p.vy * 0.016; p.r += 0.2;
    R.setWorld([1, 0, 0, 1, p.x, p.y]);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = p.c;
    ctx.rotate(p.r);
    ctx.fillRect(-0.06, -0.03, 0.12, 0.06);
  }
}

function drawHud(now) {
  const w = cv.width / R.dpr;
  R.text('level ' + (world.index + 1), w / 2, 34, 30);
  if (game.phase === 'finish' && game.t > 0.9) {
    const h = cv.height / R.dpr;
    R.text('level ' + (world.index + 1) + ' completed', w / 2, h * 0.3, Math.min(54, w / 13));
    const blink = 0.6 + 0.4 * Math.sin(now / 200);
    R.text('tap to continue', w / 2, h * 0.62, Math.min(30, w / 18), 0.5, blink);
  }
}

function setHold(v) {
  if (game.phase === 'finish') { if (v && game.t > 1) nextLevel(); return; }
  if (v && !game.hold) $('hint').style.opacity = 0;
  game.hold = v;
}

function bindInput() {
  cv.addEventListener('pointerdown', (e) => { e.preventDefault(); cv.setPointerCapture?.(e.pointerId); setHold(true); });
  const up = () => setHold(false);
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  window.addEventListener('blur', up);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); if (!e.repeat) setHold(true); }
    if (e.code === 'KeyR') { startLevel(world.index); }
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') setHold(false); });
  $('btnRestart').onclick = () => { play('button'); startLevel(world.index); };
  $('btnSound').onclick = () => { save.sound = !save.sound; writeSave(save); soundIcon(); play('button'); };
  $('btnLevels').onclick = () => { play('popup_in'); openLevels(); };
  $('btnClose').onclick = () => { play('popup_out'); $('levels').classList.remove('on'); };
}

function soundIcon() { $('btnSound').style.opacity = save.sound ? 1 : 0.45; }

function openLevels() {
  const g = $('grid');
  g.innerHTML = '';
  const top = Math.max(save.best + 1, world.index + 1, 64);
  for (let i = 0; i < top; i++) {
    const b = document.createElement('button');
    b.textContent = i + 1;
    if (i < save.best) b.className = 'done';
    if (i === world.index) b.className = 'cur';
    b.disabled = i > save.best;
    b.onclick = () => { $('levels').classList.remove('on'); play('button'); startLevel(i); };
    g.appendChild(b);
  }
  $('levels').classList.add('on');
  g.querySelector('.cur')?.scrollIntoView({ block: 'center' });
}

async function boot() {
  const [lv, atlasImg, font, fontImg] = await Promise.all([
    load('./data/levels.json'), image('./art/atlas.webp'), load('./data/font.json'), image('./art/font.webp'),
  ]);
  data = lv;
  R = new Renderer(cv, atlasImg, lv.atlas, fontImg, font);
  for (const n of ['button', 'popup_in', 'popup_out']) { sfx[n] = new Audio('./audio/' + n + '.mp3' + V); sfx[n].preload = 'auto'; }
  const q = new URLSearchParams(location.search).get('level');
  startLevel(q ? Math.max(0, (parseInt(q, 10) || 1) - 1) : save.level || 0);
  bindInput();
  soundIcon();
  $('loading').remove();
  requestAnimationFrame(frame);
  window.__sh = { game, get world() { return world; }, get player() { return player; }, cam, startLevel, setHold };
}

boot().catch((e) => { $('loading').textContent = 'Không tải được game: ' + e.message; });
