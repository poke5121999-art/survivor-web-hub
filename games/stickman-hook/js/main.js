import { buildLevel, modeData } from './level.js';
import { PHYS, ST } from './physics.js';
import { Renderer } from './render.js';
import { readSave, writeSave, DEFAULT_EQUIP } from './save.js';
import { Meta } from './meta.js';
import { makeCustom } from './custom.js';
import { MODES, NORMAL } from './modes.js';

const V = '?v=20261028c';
const DEFAULT_ZOOM = 5, FINISH_ZOOM = 2; // CameraConfig.defaultZoom, PlayerCameraController.cameraZoomOnEndGame
// Rope prefab: sprite scaled (1.6, 2) under its parent. [ĐỀ XUẤT] 0.2 per axis so a 167 px tile is ~0.4 wide,
// next to the 0.045 Classic line.
const ROPE_SCALE = [1.6 * 0.2, 2 * 0.2];
const DANCE_AFTER = 0.6; // [ĐỀ XUẤT] the dance starts once the finish slow motion has settled

const $ = (id) => document.getElementById(id);
const cv = $('cv');

function load(url) { return fetch(url + V).then((r) => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); }); }
function image(url) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(url)); i.src = url + V; });
}

// Sounds are created on the first input: nothing plays before it anyway, and the first level loads lighter.
const sfx = {};
function initAudio() {
  if (sfx.button) return;
  for (const n of ['button', 'popup_in', 'popup_out']) { sfx[n] = new Audio('./audio/' + n + '.mp3' + V); sfx[n].preload = 'auto'; }
}
function play(name) {
  if (!save.sound) return;
  const a = sfx[name];
  if (a) { a.currentTime = 0; a.play().catch(() => {}); }
}

let data, R, world, player, meta, custom, save = readSave();
// The mode being played: {id, def (modes.js entry), data (buildLevel input), Player, count}. Loaded modes are cached.
let mode = null;
const loaded = {};
const cam = { x: 0, y: 0, zoom: DEFAULT_ZOOM };
// phase: 'spawn' (spawn FX, player hidden) -> 'play' -> 'finish' (slow motion + zoom, then wait for a tap).
// Leaving the camera through its bottom or left edge while not hooked restarts the level (CameraLimits triggers).
const game = { phase: 'spawn', t: 0, hold: false, deaths: 0, confetti: [], timeScale: 1, zoomFrom: DEFAULT_ZOOM, camFrom: null,
  paused: false, clock: 0, trail: [], reward: null };
// Equipped look: skin = loaded sheet or null (atlas CHAR_Classic), rope = textured rope or null (Classic line).
const look = { skin: null, dance: null, rope: null, trail: null, drawn: 0 };

// SpriteShadow renders at sortingOrder + sortingOrderDifference (d.sh[2]); with solid shadows that order shows.
// Ties put the shadow first, so a target's own background stays above its ring's shadow.
function layers(draw) {
  const out = [];
  draw.forEach((d, i) => {
    if (d.sh) out.push({ d, shadow: true, o: d.o + (d.sh[2] || 0), i });
    out.push({ d, shadow: false, o: d.o, i });
  });
  return out.sort((a, b) => a.o - b.o || b.shadow - a.shadow || a.i - b.i);
}

function startLevel(index) {
  world = buildLevel(mode.data, index);
  world.layers = layers(world.draw);
  mode.def.slot(save).level = index;
  writeSave(save);
  R.theme = meta.themeFor(mode.id, index);
  player = new mode.Player(world.spawn);
  game.phase = 'spawn';
  game.t = 0;
  game.hold = false;
  game.confetti = [];
  game.timeScale = 1;
  game.trail = [];
  game.reward = null;
  cam.zoom = DEFAULT_ZOOM;
  cam.x = clampCamX(world.spawn.x);
  cam.y = 0;
}

function clampCamX(x) {
  const halfW = (cv.width / cv.height) * cam.zoom;
  const lo = world.camMin + halfW, hi = world.camMax - halfW;
  return lo > hi ? (world.camMin + world.camMax) / 2 : Math.min(hi, Math.max(lo, x));
}

function equippedItem(kind) { return meta.item(kind, save.equipped[kind]) || meta.item(kind, DEFAULT_EQUIP[kind]); }

// Loads what the equipped items need. The default skin and rope draw from atlas.webp, so they fetch nothing.
function applyEquip() {
  const sk = equippedItem('skins'), rp = equippedItem('ropes'), tr = equippedItem('trails');
  look.trail = meta.d.trails[tr.asset] || null;
  look.dance = null;
  if (sk.name === DEFAULT_EQUIP.skins) look.skin = null;
  else custom.skin(sk).then((s) => { if (equippedItem('skins') === sk) look.skin = s; }).catch(() => {});
  if (rp.name === DEFAULT_EQUIP.ropes) look.rope = null;
  else {
    const r = meta.d.ropes[rp.asset];
    custom.ropes().then((img) => {
      if (equippedItem('ropes') !== rp) return;
      const w = (r.rect[2] / r.ppu) * ROPE_SCALE[0], p = (r.rect[3] / r.ppu) * ROPE_SCALE[1];
      look.rope = { img, rect: r.rect, width: w, period: p };
    }).catch(() => {});
  }
}

function finishLevel() {
  game.phase = 'finish';
  game.t = 0;
  game.zoomFrom = cam.zoom;
  game.camFrom = { x: cam.x, y: cam.y };
  game.reward = mode.def.complete(meta, save, world.index);
  writeSave(save);
  hud();
  for (const g of game.reward.got) if (g.item) toast('Mở khoá: ' + g.item.title);
  // the dance clip lives in the skin sheet, also for the default skin
  custom.skin(equippedItem('skins')).then((s) => { look.dance = s; }).catch(() => {});
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
  player = new mode.Player(world.spawn);
  game.phase = 'spawn';
  game.t = 0;
  game.trail = [];
}

// Next level when the mode has one and it is open (Challenge waits for XP), else back to the mode's level picker.
function nextLevel() {
  play('button');
  const n = world.index + 1;
  if (n < mode.count && mode.def.open(meta, save, n)) startLevel(n);
  else openLevels();
}

async function loadMode(id) {
  if (loaded[id]) return loaded[id];
  const def = MODES[id];
  const [file, P] = await Promise.all([def.file ? load('./data/mode-' + def.file + '.json') : null, def.player()]);
  const d = file ? modeData(data, file, id) : data;
  return (loaded[id] = { id, def, data: d, Player: P, count: d.random.length ? Infinity : d.levels.length });
}

async function openMode(id) {
  const same = mode.id === id;
  mode = await loadMode(id);
  for (const o of ['modes', 'start', 'levels']) if ($(o)) overlay(o, false);
  if (!same) startLevel(mode.def.slot(save).level || 0);
  if (mode.def.picker) openLevels();
  hud();
}

const STEP = PHYS.fixedDt;
let acc = 0, last = 0;
function frame(now) {
  requestAnimationFrame(frame);
  R.resize();
  let dt = Math.min(0.1, (now - (last || now)) / 1000);
  last = now;
  if (game.paused) dt = 0;
  game.t += dt;

  if (game.phase === 'spawn' && game.t >= PHYS.timeToSpawn) { game.phase = 'play'; game.t = 0; }
  if (game.phase === 'finish') {
    // TimeScale.AnimateTimescale(0.05, 600 ms, OutCirc), real time
    const k = Math.min(1, game.t / 0.6);
    game.timeScale = 1 - 0.95 * Math.sqrt(1 - (k - 1) * (k - 1));
  }
  if (game.phase === 'play' || game.phase === 'finish') {
    acc += dt * game.timeScale;
    game.clock += dt * game.timeScale;
    while (acc >= STEP) {
      acc -= STEP;
      const ev = player.step(STEP, world, game.phase === 'play' && game.hold);
      if (ev.bumper >= 0) world.bumpers[ev.bumper].anim = 0;
      if (ev.finished && game.phase === 'play') finishLevel();
      if (game.phase === 'play' && player.hooked < 0 && outOfCamera()) { respawn(); break; }
    }
    sampleTrail();
  } else acc = 0;

  for (const b of world.bumpers) if (b.anim >= 0) { b.anim += dt; if (b.anim > 0.1667) b.anim = -1; }
  updateCamera(dt);
  draw(now);
}

// TrailRenderer: points age out after the trail's `time` (game time, so the finish slow motion stretches it)
function sampleTrail() {
  const tr = look.trail;
  if (!tr || game.phase === 'spawn') return;
  const pts = game.trail, last = pts[pts.length - 1];
  if (!last || Math.hypot(player.x - last.x, player.y - last.y) > 0.02) pts.push({ x: player.x, y: player.y, t: game.clock });
  while (pts.length && game.clock - pts[0].t > tr.time) pts.shift();
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

// BumperAnimation / BumperAnimationSmall clips (30 fps), keyed by the bumper's idle sprite
const BUMP_FRAMES = {
  AN_Grap1_BumperLarge0005: ['AN_Grap1_BumperLarge0001', 'AN_Grap1_BumperLarge0002', 'AN_Grap1_BumperLarge0003',
    'AN_Grap1_BumperLarge0004', 'AN_Grap1_BumperLarge0005'],
  AN_Grap1_BumperSmall004: ['AN_Grap1_BumperSmall000', 'AN_Grap1_BumperSmall001', 'AN_Grap1_BumperSmall002',
    'AN_Grap1_BumperSmall003', 'AN_Grap1_BumperSmall004'],
};
// draw item `th` -> theme colour replacing the material tint (build_data.py THEMED)
const THEMED = { 1: 'targets', 2: 'walls' };

function draw(now) {
  R.begin(cam);
  const halfW = (cv.width / cv.height) * cam.zoom + 3;
  const t = now / 1000;
  const hooked = player.hooked, closest = player.closest;
  for (const { d, shadow } of world.layers) {
    if (Math.abs(d.m[4] - cam.x) > halfW + 12) continue;
    let name = d.s, m = d.m;
    if (d.bumper != null) {
      const b = world.bumpers[d.bumper];
      const clip = BUMP_FRAMES[d.s];
      if (b.anim >= 0 && clip) name = clip[Math.min(clip.length - 1, Math.floor(b.anim * 30))];
    }
    if (d.target != null && d.target === hooked) name = 'A_PlotSelected';
    if (d.bob) m = [m[0], m[1], m[2], m[3], m[4], m[5] + Math.sin(t * (2 * Math.PI / 0.383)) * 0.06];
    if (shadow) {
      const sm = [m[0], m[1], m[2], m[3], m[4] + d.sh[0], m[5] + d.sh[1]];
      if (d.size) R.tiled(name, sm, d.size, true); else R.sprite(name, sm, { shadow: true });
      continue;
    }
    if (d.size) R.tiled(name, m, d.size, d.shadow);
    else R.sprite(name, m, { tint: d.th ? R.theme[THEMED[d.th]] : d.tint, shadow: d.shadow });
    if (d.target != null && d.target === closest && hooked < 0 && game.phase === 'play') {
      const s = 0.5 * 1.2 * (1 + 0.05 * Math.sin(t * 12));
      R.sprite('A_PlotNearestFeedback', [s, 0, 0, s, m[4], m[5]]);
    }
  }
  drawPlayer(t);
  drawConfetti();
  drawHud(now);
}

// Sprite frame for the player: the dance clip after the finish, else the PlayerState clip at 15 fps (physics.js FRAMES).
function playerFrame(t) {
  const sk = look.skin;
  if (game.phase === 'finish' && look.dance && game.t > DANCE_AFTER) {
    const dn = look.dance.dance;
    if (dn.frames.length) return [look.dance, dn.frames[Math.floor((game.t - DANCE_AFTER) * dn.fps) % dn.frames.length], true];
  }
  if (!sk) return [null, player.frame(), false];
  const f = sk.states[player.state] || sk.states[ST.FALL];
  return [sk, f.length > 1 ? f[Math.floor((player.time - player.stateTime) * 15) % f.length] : f[0], false];
}

function drawPlayer(t) {
  if (game.trail.length > 1) R.trail(game.trail, game.clock, look.trail);
  if (player.hooked >= 0) {
    const tg = world.targets[player.hooked];
    const a = player.anchor();
    if (look.rope) R.rope(look.rope.img, look.rope.rect, tg.x, tg.y, a.x, a.y, look.rope.width, look.rope.period);
    else R.line(a.x, a.y, tg.x, tg.y, 0.045, '#0d1b2a');
  }
  if (game.phase === 'spawn') {
    const k = game.t / PHYS.timeToSpawn, s = 0.15 + k * 0.5;
    R.sprite('A_PlotNearestFeedback', [s, 0, 0, s, world.spawn.x, world.spawn.y], { alpha: 1 - k });
    return;
  }
  const [sheet, name, upright] = playerFrame(t);
  const s = 0.3 * player.scale(), fx = player.flipX ? -1 : 1, ang = upright ? 0 : player.angle;
  const c = Math.cos(ang) * s, sn = Math.sin(ang) * s;
  const m = [c * fx, sn * fx, -sn, c, player.x, player.y];
  const sm = [m[0], m[1], m[2], m[3], m[4], m[5] - 0.1];
  if (!sheet) {
    R.sprite(name, sm, { shadow: true });
    R.sprite(name, m);
    return;
  }
  const [img, r] = sheet.frames[name];
  if (!meta.byId.get(sheet.id).noShadow) R.spriteFrom(img, name, r, sm, { shadow: true });
  R.spriteFrom(img, name, r, m);
  look.drawn++;
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
  const label = mode.def.hud + ' ' + (world.index + 1);
  // shrink long labels ("challenge 12") to the gap between the two button rows
  R.text(label, w / 2, 34, Math.min(30, (30 * (w - 250)) / R.measure(label, 30)));
  if (game.phase === 'finish' && game.t > 0.9) {
    const h = cv.height / R.dpr;
    R.text(label + ' completed', w / 2, h * 0.3, Math.min(54, w / 13));
    if (game.reward?.xp) R.text('+' + game.reward.xp + ' xp', w / 2, h * 0.3 + Math.min(54, w / 13) * 1.2, Math.min(34, w / 18));
    const blink = 0.6 + 0.4 * Math.sin(now / 200);
    R.text('tap to continue', w / 2, h * 0.62, Math.min(30, w / 18), 0.5, blink);
  }
}

let toastTimer = 0;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2200);
}

// Menu icon from art/menu.webp (tools/build_meta.py), fitted into a px square. Set only when a menu shows, so the
// sheet loads after the level, never before it.
function icon(el, key, px) {
  const r = meta.d.menu[key], [W, H] = meta.d.menu._size;
  if (!r) return;
  const k = px / Math.max(r[2], r[3]);
  Object.assign(el.style, { width: px + 'px', height: px + 'px', backgroundImage: `url(./art/menu.webp${V})`,
    backgroundSize: `${W * k}px ${H * k}px`,
    backgroundPosition: `${-r[0] * k + (px - r[2] * k) / 2}px ${-r[1] * k + (px - r[3] * k) / 2}px` });
}

// Coins, XP bar and the road badge on the home screen.
function hud() {
  if ($('start').classList.contains('on')) for (const el of document.querySelectorAll('#start [data-ico]')) icon(el, el.dataset.ico, 30);
  const b = meta.xpBar(save.xp);
  $('coins').textContent = save.coins;
  $('rank').textContent = b.rank;
  $('league').textContent = b.league;
  $('xpfill').style.width = Math.round(b.k * 100) + '%';
  $('xptext').textContent = b.hi > b.lo ? `${save.xp} / ${b.hi}` : String(save.xp);
  const n = meta.claimable(save);
  $('roadBadge').textContent = n;
  $('roadBadge').style.display = n ? '' : 'none';
  $('playLevel').textContent = (mode.def.picker ? modeName(mode.id) + ' · ' : '') + 'Màn ' + (world.index + 1);
}

function setHold(v) {
  if (v) initAudio();
  if (game.paused) return;
  if (game.phase === 'finish') { if (v && game.t > 1) nextLevel(); return; }
  if (v && !game.hold) $('hint').style.opacity = 0;
  game.hold = v;
}

// Overlays pause the level behind them.
function overlay(id, on) {
  $(id).classList.toggle('on', on);
  game.paused = [...document.querySelectorAll('.overlay')].some((e) => e.classList.contains('on'));
  document.body.classList.toggle('menu', game.paused);
  if (game.paused) game.hold = false;
}

const app = {
  get save() { return save; }, get meta() { return meta; }, get custom() { return custom; }, get world() { return world; },
  get R() { return R; }, play, writeSave: () => writeSave(save), applyEquip, hud, overlay, toast, image, icon, $, V, look,
  openMode, get mode() { return mode.id; },
};
let menus = null;
async function openMenu(name) {
  initAudio();
  play('popup_in');
  menus ||= await import('./menus.js');
  menus[name](app);
}

function bindInput() {
  cv.addEventListener('pointerdown', (e) => { e.preventDefault(); cv.setPointerCapture?.(e.pointerId); setHold(true); });
  const up = () => setHold(false);
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  window.addEventListener('blur', up);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); if (!e.repeat) setHold(true); }
    if (e.code === 'KeyR' && !game.paused) { startLevel(world.index); }
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') setHold(false); });
  $('btnRestart').onclick = () => { initAudio(); play('button'); startLevel(world.index); };
  $('btnSound').onclick = () => { initAudio(); save.sound = !save.sound; writeSave(save); soundIcon(); play('button'); };
  $('btnLevels').onclick = () => { initAudio(); play('popup_in'); openLevels(); };
  $('btnClose').onclick = () => { play('popup_out'); overlay('levels', false); };
  $('btnMenu').onclick = () => { initAudio(); play('popup_in'); overlay('start', true); hud(); };
  $('btnPlay').onclick = () => { initAudio(); play('button'); overlay('start', false); };
  $('btnModes').onclick = () => openMenu('openModes');
  $('btnShop').onclick = () => openMenu('openShop');
  $('xpbar').onclick = () => openMenu('openRoad');
}

function soundIcon() { $('btnSound').style.opacity = save.sound ? 1 : 0.45; }

function modeName(id) { return meta.d.modes.find((m) => m[0] === id)?.[1] || id; }

// Level picker of the current mode: every level of a finite mode (locked ones greyed), else up to the next new level.
function openLevels() {
  const g = $('grid');
  g.innerHTML = '';
  const slot = mode.def.slot(save), best = slot.best || 0;
  const done = (i) => (slot.done ? slot.done.includes(i) : i < best);
  const top = Number.isFinite(mode.count) ? mode.count : Math.max(best + 1, world.index + 1, mode.data.levels.length);
  for (let i = 0; i < top; i++) {
    const b = document.createElement('button');
    b.textContent = i + 1;
    if (done(i)) b.className = 'done';
    if (i === world.index) b.className = 'cur';
    b.disabled = !mode.def.open(meta, save, i);
    b.onclick = () => { overlay('levels', false); play('button'); startLevel(i); };
    g.appendChild(b);
  }
  $('levelsTitle').textContent = mode.def.picker ? modeName(mode.id) : 'Chọn màn';
  overlay('levels', true);
  g.querySelector('.cur')?.scrollIntoView({ block: 'center' });
}

async function boot() {
  const [lv, atlasImg, font, fontImg, md] = await Promise.all([
    load('./data/levels.json'), image('./art/atlas.webp'), load('./data/font.json'), image('./art/font.webp'), load('./data/meta.json'),
  ]);
  data = lv;
  meta = new Meta(md);
  mode = loaded[NORMAL] = { id: NORMAL, def: MODES[NORMAL], data, Player: MODES[NORMAL].player(), count: Infinity };
  custom = makeCustom(load, image);
  R = new Renderer(cv, atlasImg, lv.atlas, fontImg, font);
  app.atlas = { img: atlasImg, rects: lv.atlas, fontImg, font };
  // the achieved-level road follows `best`, so catch up rewards from saves made before it existed
  if (meta.claim(save, 'achieved_level_mode.normal', save.best).length) writeSave(save);
  const params = new URLSearchParams(location.search), q = params.get('level'), qm = 'mode.' + params.get('mode');
  if (MODES[qm]) mode = await loadMode(qm);
  startLevel(q ? Math.max(0, (parseInt(q, 10) || 1) - 1) : mode.def.slot(save).level || 0);
  applyEquip();
  bindInput();
  soundIcon();
  if (!q) overlay('start', true);
  hud();
  $('loading').remove();
  requestAnimationFrame(frame);
  window.__sh = { game, get world() { return world; }, get player() { return player; }, get save() { return save; }, cam, look,
    get theme() { return R.theme; }, meta, startLevel, setHold, applyEquip, openMenu, overlay, openMode, openLevels,
    get mode() { return mode; } };
}

boot().catch((e) => { $('loading').textContent = 'Không tải được game: ' + e.message; });
