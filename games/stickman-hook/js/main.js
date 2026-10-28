import { buildLevel, modeData, unpackDefaults } from './level.js';
import { forwardFocus } from './camera.js';
import { PHYS, ST } from './physics.js';
import { Renderer } from './render.js';
import { readSave, writeSave, DEFAULT_EQUIP } from './save.js';
import { Meta } from './meta.js';
import { makeCustom } from './custom.js';
import { MODES, NORMAL } from './modes.js';

const V = '?v=20261028j';
const DEFAULT_ZOOM = 5, FINISH_ZOOM = 2; // CameraConfig.defaultZoom, PlayerCameraController.cameraZoomOnEndGame
// Rope prefab: sprite scaled (1.6, 2) under its parent. [ĐỀ XUẤT] 0.2 per axis so a 167 px tile is ~0.4 wide.
const ROPE_SCALE = [1.6 * 0.2, 2 * 0.2];
// The default rope is the white `basic` texture (ropes.webp, not loaded for it): a white line ~0.03 world units wide
// (2026 clip 1:06, 4-5 px across at 128 px per unit with the JPEG blur).
const DEFAULT_ROPE = [0.03, '#fff'];
// Finish: AnimateTimescale (0.6 s) and ZoomOnPlayer (0.5 s) together, then Task.Delay(400), then FinishLevel opens the end
// game (piggy bank popup, end page) [asm 0x1207d70..0x1207810]. The stickman keeps its FINISHED pose until then.
const END_AFTER = 1.0;
// ShowSpawnFx waits ParticleSystem.time x timeToSpawn [asm 0x1206ea0..0x1206f04]; `time` of an FX instantiated that frame
// is 0, so the player grows in while the FX plays (2019 clip 0:05.8 and 0:05.95 show the ring and the player together).
const SPAWN_DELAY = 0;
// FX_Spawn: one particle living 0.5 s, its 8 x 2 sheet played once (cells 11..15 empty; build_data.py SPAWN_FX)
const SPAWN_FX_LIFE = 0.5, SPAWN_FX_CELLS = 16, SPAWN_FX_FRAMES = 11;
const HALO_IN = 0.1; // Halo: HaloAppearManager.appearDuration, DOScale 0 -> 1 [asm 0x1242b78..0x1242b94]
// HUD: CanvasScaler ScaleWithScreenSize 750 x 1334, match height 1 (scene level1), so 1 reference unit = height / 1334
const REF_H = 1334;

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
// fx: seconds since the spawn FX started; ff: ForwardFocus influence (camera.js); halo: [target, time it appeared];
// piggy: this finish's piggy bank fill (bonus.piggyLevelEnd), shown by the end game (endgame.js).
const game = { phase: 'spawn', t: 0, hold: false, deaths: 0, confetti: [], timeScale: 1, zoomFrom: DEFAULT_ZOOM, camFrom: null,
  paused: false, clock: 0, trail: [], reward: null, died: false, fx: 0, ff: { h: 0, v: 0 }, halo: [-1, 0], piggy: null,
  ended: false };
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
  // the finish line's SpriteRenderer half width, for the progress bar (ResetProgressBar: size.x * 0.5)
  world.finishHalf = (world.draw.find((d) => d.size && Math.abs(d.m[4] - world.finishX) < 1e-3)?.size[0] || 0) / 2;
  mode.race?.place(world); // race: the player's start slot
  world.layers = layers(world.draw);
  mode.def.slot(save).level = index;
  writeSave(save);
  R.theme = meta.themeFor(mode.id, index);
  player = new mode.Player(world.spawn);
  game.phase = 'spawn';
  game.t = 0;
  game.hold = false;
  game.confetti = [];
  game.emitter = null;
  game.timeScale = 1;
  game.trail = [];
  game.reward = null;
  game.died = false;
  game.fx = 0;
  game.ff = { h: 0, v: 0 };
  game.piggy = null;
  game.ended = false;
  document.body.classList.remove('fin');
  endgame?.hide();
  skipView();
  cam.zoom = DEFAULT_ZOOM;
  cam.x = clampCamX(world.spawn.x);
  cam.y = 0;
  mode.race?.begin(game); // race: countdown before the start
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

// forced: a race the player lost to all four ghosts (PlayerController.ForceFinish: no confetti)
function finishLevel(forced) {
  game.phase = 'finish';
  document.body.classList.add('fin'); // the PauseButton is gone from the finish on (every clip)
  game.t = 0;
  game.zoomFrom = cam.zoom;
  game.camFrom = { x: cam.x, y: cam.y };
  if (forced) player.finish();
  game.reward = mode.race ? mode.race.finish(forced) : mode.def.complete(meta, save, world.index);
  writeSave(save);
  hud();
  skipView();
  for (const g of game.reward.got) if (g.item) toast('Mở khoá: ' + g.item.title);
  // Normal end game: the piggy bank fills on a level's first completion (like XP: the original never replays a level);
  // the end game shows it (PiggyBankPopup) before the end page
  if (mode.id === NORMAL && game.reward.xp) {
    const at = world;
    loadBonus().then((b) => {
      const r = b.piggyLevelEnd(save);
      writeSave(save);
      if (world === at) game.piggy = r;
    }).catch(() => {});
  }
  // the end page's dance clip lives in the skin sheet, also for the default skin; endgame.js and its art load now too
  custom.skin(equippedItem('skins')).then((s) => { look.dance = s; }).catch(() => {});
  if (!mode.race) loadEnd().catch(() => {});
  play('popup_in');
  // Instantiate(confettisPrefab) at the player + velocity x 2 Time.deltaTime, its up along the velocity [asm 0x1207938..0x1207ae8]
  const sp = Math.hypot(player.vx, player.vy);
  game.emitter = forced ? null : { x: player.x + player.vx * (2 / 60), y: player.y + player.vy * (2 / 60),
    ax: sp ? player.vx / sp : 0, ay: sp ? player.vy / sp : 1, t: 0, acc: 0 };
}

function outOfCamera() {
  const halfW = (cv.width / cv.height) * cam.zoom;
  return player.y < cam.y - cam.zoom - 0.3 || player.x < cam.x - halfW - 0.3;
}

function respawn() {
  // PlayerController.TryKillPlayer: DeservesSecondChance -> Revive instead of KillPlayer [asm 0x12050d0, 0x1207054]
  if (cards && cards.secondChance(save, mode.id)) { revive(); return; }
  game.deaths++;
  game.died = true;
  skipView();
  player = new mode.Player(world.spawn);
  game.phase = 'spawn';
  game.t = 0;
  game.fx = 0;
  game.trail = [];
}

// Revive [asm 0x12097f0..0x1209a64]: GetLastSpawnPointPassed (the last pattern spawn point left of the death, else
// the start; only Start patterns hold one, so the level start), the SpawnCounter countdown, then SpawnPlayer with
// velocity 0. No death is counted (no skip button). The small card popup (ActivateSmallCardEffect) shows the card.
// [ĐỀ XUẤT] the countdown is the race's SpawnCounter rhythm: "3", "2", "1", "GO", 0.5 s each.
const REVIVE_STEP = 0.5, REVIVE_TEXT = ['3', '2', '1', 'GO'];
function revive() {
  player = new mode.Player(world.spawn);
  game.phase = 'revive';
  game.t = 0;
  game.trail = [];
  game.hold = false;
  cardsUi?.secondChance(app, mode.id);
}
function reviveTick() {
  const i = Math.floor(game.t / REVIVE_STEP), el = $('revive');
  if (i >= REVIVE_TEXT.length) { el.classList.remove('on'); game.phase = 'spawn'; game.t = 0; game.fx = 0; return; }
  el.textContent = REVIVE_TEXT[i];
  el.classList.add('on');
}

// Cards, boosters, black market (js/cards.js rules + data/cards.json; js/cardsui.js views): loaded with the home screen,
// or at start when the save holds a card or a booster. Booster rewards wait in save.boosterQueue and open in their popup
// (BoosterOpeningPopup) as soon as the home screen shows.
let cards = null, cardsP = null, cardsUi = null, cardsUiP = null;
function loadCards() {
  cardsP ||= Promise.all([import('./cards.js'), load('./data/cards.json')]).then(([m, d]) => {
    cards = m.makeCards(app, d);
    meta.onBoost = (res, src, n) => cardsUi?.boostToast(app, res, src, n);
    if (meta.deliverPending(save).length) writeSave(save);
    hud();
    return cards;
  });
  return cardsP;
}
function loadCardsUi() {
  cardsUiP ||= Promise.all([loadCards(), import('./cardsui.js')]).then(([, u]) => (cardsUi = u));
  return cardsUiP;
}
let opening = false;
async function nextBooster() {
  if (opening || !cards || !save.boosterQueue?.length || !$('start').classList.contains('on')) return;
  opening = true;
  try { await loadCardsUi(); await cardsUi.openBooster(app, cards); } finally { opening = false; }
  hud();
}
async function openCards() {
  initAudio();
  play('popup_in');
  await loadCardsUi();
  await cardsUi.openCards(app, cards);
}

// End game (js/endgame.js, art/ui.webp): piggy bank popup, then the end page with the dancing skin and the Play button.
// Loaded at the first finish, never with the first level.
let endgame = null, endP = null;
function loadEnd() {
  endP ||= Promise.all([import('./endgame.js'), load('./data/ui.json')]).then(([m, d]) => (endgame = m.makeEndgame(app, d)));
  return endP;
}
async function openEnd() {
  game.ended = true;
  const at = world;
  if (mode.id === NORMAL && game.reward?.xp) await loadBonus().catch(() => {});
  await loadEnd();
  if (world !== at || game.phase !== 'finish') return;
  endgame.show({ mode: mode.id, def: mode.def, level: world.index, piggy: game.piggy });
}

// Lucky Wheel, piggy bank, market and skip level: js/bonus.js + data/bonus.json, loaded with the home screen, at the
// first death or at the finish of a Normal level. The first level never loads them.
let bonus = null, bonusP = null;
function loadBonus() {
  bonusP ||= Promise.all([import('./bonus.js'), load('./data/bonus.json')]).then(([m, d]) => {
    bonus = m.makeBonus(app, d);
    hud();
    skipView();
    return bonus;
  });
  return bonusP;
}

// SkipButtonView: in a Normal level after a death (SetHasDied), while today's skips last. It pays a skip ticket and
// completes the level (Bonus.skipLevel).
function skipView() {
  const show = mode.id === NORMAL && game.died && game.phase !== 'finish';
  if (bonus) bonus.skipView(show);
  else if (show) loadBonus().catch(() => {});
}

function skipLevel() {
  initAudio();
  if (!bonus || game.phase === 'finish' || game.paused) return;
  const r = bonus.skipLevel(save);
  if (r.refused) { toast(r.refused === 'tickets' ? 'Cần 1 vé bỏ qua (mua ở Chợ trên trang chính)' : 'Hết lượt bỏ qua hôm nay'); return; }
  play('button');
  finishLevel();
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
  return (loaded[id] = { id, def, data: d, file, Player: P, count: d.random.length ? Infinity : d.levels.length });
}

// A mode with its own engine (modes.js `launch`) takes over the screen itself instead of loading levels.
async function openMode(id) {
  if (MODES[id].launch) return MODES[id].launch(app);
  const same = mode.id === id;
  mode = await loadMode(id);
  for (const o of ['modes', 'start', 'levels']) if ($(o)) overlay(o, false);
  if (!same) startLevel(mode.def.slot(save).level || 0);
  if (mode.def.picker) openLevels();
  hud();
}

// Race (js/race.js): the mode's level with its controller `rc` (start slot, ghosts, countdown, placement).
async function startRace(rc) {
  mode = await loadMode(rc.id);
  mode.race = rc;
  for (const o of ['modes', 'start', 'levels']) if ($(o)) overlay(o, false);
  startLevel(rc.level);
  hud();
}
const restart = () => (mode.race ? openMode(mode.id) : startLevel(world.index));

const STEP = PHYS.fixedDt;
let acc = 0, last = 0;
function frame(now) {
  requestAnimationFrame(frame);
  R.resize();
  let dt = Math.min(0.1, (now - (last || now)) / 1000);
  last = now;
  if (game.paused) dt = 0;
  game.frameDt = dt;
  game.t += dt;

  game.fx += dt;
  if (game.phase === 'spawn' && game.t >= SPAWN_DELAY) { game.phase = 'play'; game.t = 0; }
  if (game.phase === 'count' && mode.race.counted(game.t)) { game.phase = 'play'; game.t = 0; }
  if (game.phase === 'revive') reviveTick();
  // the race clock runs from GO, also while respawning; all four ghosts home first = forced finish
  if (mode.race && game.phase !== 'count' && mode.race.tick(dt * game.timeScale) && game.phase !== 'finish') finishLevel(true);
  if (game.phase === 'finish') {
    // TimeScale.AnimateTimescale(0.05, 600 ms, OutCirc), real time
    const k = Math.min(1, game.t / 0.6);
    game.timeScale = 1 - 0.95 * Math.sqrt(1 - (k - 1) * (k - 1));
    if (game.t >= END_AFTER && !game.ended && !mode.race) openEnd();
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
  // ProCamera2D: on the player plus the ForwardFocus influence (js/camera.js), clamped to StartCamera..EndCamera.
  // The influence follows the body's velocity, so a respawn's jump back to the start does not swing it.
  const lead = forwardFocus(game.ff, player.vx, (2 * cam.zoom * cv.width) / cv.height, dt * game.timeScale);
  cam.x = clampCamX(player.x + lead);
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
  // Target.MarkAsClosest switches the Halo child on (A_PlotNearestFeedback; MarkAsHooked switches it off); each time it
  // comes on, HaloAppearManager scales it 0 -> 1 in 0.1 s (DOTween default ease OutQuad). Halo local scale 1 x target 0.5.
  const haloOn = hooked < 0 && (game.phase === 'play' || game.phase === 'finish') ? closest : -1;
  if (game.halo[0] !== haloOn) game.halo = [haloOn, t];
  const hk = Math.min(1, (t - game.halo[1]) / HALO_IN), hs = 0.5 * hk * (2 - hk);
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
    if (d.target != null && d.target === haloOn && hs > 0) R.sprite('A_PlotNearestFeedback', [hs, 0, 0, hs, m[4], m[5]]);
  }
  mode.race?.draw(R, game);
  drawPlayer(t);
  const fdt = game.paused ? 0 : Math.min(0.1, game.frameDt || 0);
  drawConfetti(fdt * game.timeScale, fdt);
  drawHud();
}

// Sprite frame for the player: the PlayerState clip at 15 fps (physics.js FRAMES). The finish keeps the FINISHED pose
// through the slow motion (every clip); the dance clip plays on the end page only (endgame.js).
function playerFrame() {
  const sk = look.skin;
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
    else R.line(a.x, a.y, tg.x, tg.y, DEFAULT_ROPE[0], DEFAULT_ROPE[1]);
  }
  if (game.phase === 'count' || game.phase === 'revive') return;
  // FX_Spawn at the start point, a 2-unit particle stepping through its sheet once in 0.5 s
  const cell = Math.floor((game.fx / SPAWN_FX_LIFE) * SPAWN_FX_CELLS);
  if (cell < SPAWN_FX_FRAMES) R.sprite('FX_Spawn' + String(cell).padStart(2, '0'), [1, 0, 0, 1, world.spawn.x, world.spawn.y]);
  if (game.phase === 'spawn') return;
  const [sheet, name, upright] = playerFrame();
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

// ConfettisLeft: PlayerController.confettisPrefab of every mode's player (PathID -2858981051185679930, bundle13 CAB-a88ed77c),
// one ParticleSystem read field by field (tools/extract/dump_confetti.py). Scaled time, so in the finish slow motion it
// hangs around the player (2026 clip 0:13.7, 0:14.5). Scaling mode Local with transform scale 0.3: the size x 0.3; the
// speed stays in world units (with it x 0.3 the cloud is a third of the clips' one).
//   duration 3.9 s, not looping, rate 400/s, max 70 particles, lifetime 4 s, world simulation space
//   start speed 50..100, size 0.2..0.5, 3D start rotation +-45 deg per axis, gravity modifier 1.4..2 (x 9.81)
//   shape: cone 20 deg, radius 0.01, along the transform's up
//   start colour: random in a Fixed gradient #BC0067 / #FF6DB5 / #F3EADA / #9BF7AD / #F9F871 (one fifth each)
//   rotation over lifetime: -2pi..2pi rad/s on x, y, z; colour over lifetime: alpha 1 until 0.806, 0 at 1
//   limit velocity: 1, dampen 0.1; noise: strength 0.5, frequency 0.5
//   renderer: billboard, ConfettisMaterial = texture `confetti`, a white rounded rectangle 0.98 x 0.70 of the quad
// [ĐỀ XUẤT] the dampen applies once per rendered frame (60 fps, real time) while the particles move in scaled time:
// 1 s after the finish the cloud spans -1.0..+3.8 units along the flight and up to 0.8 off it; the 2019 clip 0:09.7-0:10.0
// shows -0.2..+3.6 and +-1.05 (tools/extract/confetti_sim.js A 1). Damping in particle time instead leaves the cloud 3 x smaller.
const CONF = { rate: 400, max: 70, dur: 3.9, life: 4, speed: [50, 100], size: [0.06, 0.15], grav: [1.4, 2], cone: (20 * Math.PI) / 180,
  limit: 1, dampen: 0.1, noise: 0.5, freq: 0.5, spin: 2 * Math.PI, rot0: Math.PI / 4, fade: 0.806,
  colors: ['#BC0067', '#FF6DB5', '#F3EADA', '#9BF7AD', '#F9F871'] };
const rnd = (a, b) => a + Math.random() * (b - a);

function emitConfetti(dt) {
  const e = game.emitter;
  if (!e || e.t >= CONF.dur) return;
  e.t += dt;
  e.acc += CONF.rate * dt;
  for (; e.acc >= 1; e.acc--) {
    if (game.confetti.length >= CONF.max) { e.acc = 0; break; }
    // a point in the cone's base disc (uniform area) sets the angle off the axis; azimuth around it in 3D
    const th = CONF.cone * Math.sqrt(Math.random()), ph = Math.random() * 2 * Math.PI, v = rnd(...CONF.speed);
    const along = Math.cos(th) * v, side = Math.sin(th) * Math.cos(ph) * v;
    game.confetti.push({ x: e.x, y: e.y, vx: e.ax * along - e.ay * side, vy: e.ay * along + e.ax * side, age: 0,
      g: 9.81 * rnd(...CONF.grav), s: rnd(...CONF.size), c: CONF.colors[Math.min(4, Math.floor(Math.random() * 5))],
      r: [rnd(-CONF.rot0, CONF.rot0), rnd(-CONF.rot0, CONF.rot0), rnd(-CONF.rot0, CONF.rot0)],
      w: [rnd(-CONF.spin, CONF.spin), rnd(-CONF.spin, CONF.spin), rnd(-CONF.spin, CONF.spin)] });
  }
}

// dt: scaled seconds of this frame; real: its real seconds (the limit-velocity dampen counts frames)
function drawConfetti(dt, real) {
  emitConfetti(dt);
  if (!game.confetti.length) return;
  const { ctx } = R;
  const damp = dt > 0 ? 1 - Math.pow(1 - CONF.dampen, real * 60) : 0, k = CONF.freq * 2 * Math.PI;
  game.confetti = game.confetti.filter((p) => (p.age += dt) < CONF.life);
  ctx.globalCompositeOperation = 'source-over';
  for (const p of game.confetti) {
    p.vy -= p.g * dt;
    const s = Math.hypot(p.vx, p.vy);
    if (s > CONF.limit) { const ns = s - (s - CONF.limit) * damp; p.vx *= ns / s; p.vy *= ns / s; }
    // noise: a still field (scroll speed 0) moving the particle by up to `noise` units/s
    p.x += (p.vx + CONF.noise * Math.sin(k * p.y + 1.3) * Math.cos(k * 0.7 * p.x)) * dt;
    p.y += (p.vy + CONF.noise * Math.cos(k * p.x + 0.4) * Math.sin(k * 0.6 * p.y + 2.1)) * dt;
    for (let i = 0; i < 3; i++) p.r[i] += p.w[i] * dt;
    // the billboard quad turned in 3D (Unity Euler order Z, X, Y), seen straight on: its x and y axes projected
    const [cx, sx] = [Math.cos(p.r[0]), Math.sin(p.r[0])], [cy, sy] = [Math.cos(p.r[1]), Math.sin(p.r[1])];
    const [cz, sz] = [Math.cos(p.r[2]), Math.sin(p.r[2])];
    const ex = [cy * cz + sy * sx * sz, cx * sz], ey = [-cy * sz + sy * sx * cz, cx * cz];
    const a = p.age / CONF.life;
    ctx.globalAlpha = a < CONF.fade ? 1 : Math.max(0, 1 - (a - CONF.fade) / (1 - CONF.fade));
    R.setWorld([ex[0] * p.s, ex[1] * p.s, ey[0] * p.s, ey[1] * p.s, p.x, p.y]);
    ctx.fillStyle = p.c;
    ctx.beginPath();
    ctx.roundRect(-0.49, -0.35, 0.98, 0.7, 0.12);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// AInGamePage.GetPercentageOfProgressBar [asm 0x28d934c]: clamp01((x - StartingX) / posDiff), posDiff = Finish x - half
// its SpriteRenderer width - StartingX (ResetProgressBar [asm 0x28d8e90..0x28d92f8]); full once the level completes.
function progress() {
  if (game.phase === 'finish') return 1;
  if (game.phase !== 'play') return 0;
  const end = world.finishX - (world.finishHalf || 0) - world.spawn.x;
  return end > 0 ? Math.max(0, Math.min(1, (player.x - world.spawn.x) / end)) : 0;
}

// DefaultInGameUI (reference 750 x 1334, u = one reference unit in CSS px). LevelProgress at (0, 552) from the centre:
// ProgressBarBG 198 x 21 (#656565, Shadow 0.5 black 7 down), a white horizontal fill, and "n" / "n+1" (Junegull 41.65)
// 146 units either side; LevelProgressBarView.Initialize writes the level and the next. The Tournament page has the
// bar without the numbers.
function drawHud() {
  const w = cv.width / R.dpr, h = cv.height / R.dpr, u = h / REF_H;
  const cy = h / 2 - 552 * u, bw = 198.4 * u, bh = 21 * u, bx = w / 2 - bw / 2;
  R.rect(bx, cy - bh / 2 + 7 * u, bw, bh, '#000', 0.5);
  R.rect(bx, cy - bh / 2, bw, bh, '#656565');
  R.rect(bx, cy - bh / 2, bw * progress(), bh, '#fff');
  if (!mode.race) {
    R.text(String(world.index + 1), w / 2 - 146.3 * u, cy, 41.65 * u);
    R.text(String(world.index + 2), w / 2 + 146.3 * u, cy, 41.65 * u);
  }
  if ($('pause').classList.contains('on')) R.text('tap to continue', w / 2, h / 2, 57.63 * u); // PauseUI ContinueText
  if (mode.race) return mode.race.hud(R, w, h, game, player, u);
  if (game.phase === 'finish') finishText(w, h, u, [['stage ' + (world.index + 1), '#9FFF54'], ['completed', null]]);
}

// FinishText (anchor y 0.8, Junegull 60, DarkBlue outline), shown at CompleteLevel: AInGamePage.OnLevelComplete formats
// "<color=#9FFF54>Stage {0}</color> Completed" with the level + 1 [asm 0x28d9430..0x28d9584]. The text box is the screen
// width, so it wraps into two lines on a phone (2026 clip 0:13.7). `parts`: [[text, colour]], one line each if wrapped.
function finishText(w, h, u, parts) {
  const px = 60 * u, sp = R.measure(' ', px);
  const widths = parts.map(([t]) => R.measure(t, px));
  const one = widths.reduce((a, b) => a + b, 0) + sp * (parts.length - 1);
  const lh = (R.font.lineHeight / R.font.size) * px;
  if (one <= w) {
    let x = w / 2 - one / 2;
    parts.forEach(([t, c], i) => { R.text(t, x, h * 0.2, px, 0, 1, c); x += widths[i] + sp; });
  } else {
    const y0 = h * 0.2 - (lh * (parts.length - 1)) / 2;
    parts.forEach(([t, c], i) => R.text(t, w / 2, y0 + i * lh, px, 0.5, 1, c));
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
  const b = meta.xpBar(save.xp);
  $('coins').textContent = save.coins;
  if (bonus) bonus.hud();
  else if ($('start').classList.contains('on')) loadBonus().catch(() => {});
  if ($('start').classList.contains('on')) { if (cards) nextBooster().catch(() => {}); else loadCards().catch(() => {}); }
  $('rank').textContent = b.rank;
  $('league').textContent = b.league;
  $('xpfill').style.width = Math.round(b.k * 100) + '%';
  $('xptext').textContent = b.hi > b.lo ? `${save.xp - b.lo}/${b.hi - b.lo}` : String(save.xp);
  const n = meta.claimable(save);
  $('roadBadge').textContent = n;
  $('roadBadge').style.display = n ? '' : 'none';
  // PlayCounter: the level number only (LevelNumberText); another mode's name before it
  $('playLevel').textContent = mode.race ? modeName(mode.id) : (mode.def.picker ? modeName(mode.id) + ' ' : '') + (world.index + 1);
  if (home && $('start').classList.contains('on')) home.show(app);
}

// The home screen's layout and art (home.js, art/m-home.webp) load the first time it shows.
let home = null;
function showHome() {
  import('./home.js').then(async (h) => { await h.setup(app); home = h; hud(); }).catch((e) => toast('Không tải được trang chính: ' + e.message));
}

function setHold(v) {
  if (v) initAudio();
  if (game.paused) return;
  if (game.phase === 'finish') return; // the end game takes over (endgame.js; race.js for a race)
  if (v && !game.hold) $('hint').style.opacity = 0;
  game.hold = v;
}

// Overlays pause the level behind them.
function overlay(id, on) {
  $(id).classList.toggle('on', on);
  if (id === 'start' && on) showHome();
  game.paused = [...document.querySelectorAll('.overlay')].some((e) => e.classList.contains('on'));
  document.body.classList.toggle('menu', game.paused);
  if (game.paused) game.hold = false;
}

const app = {
  get save() { return save; }, get meta() { return meta; }, get custom() { return custom; }, get world() { return world; },
  get R() { return R; }, play, finishText, nextLevel, restart: () => restart(), pause, writeSave: () => writeSave(save), applyEquip, hud, overlay, toast, image, icon, $, V, look,
  openMode, get mode() { return mode.id; }, openMenu, openLevels, skipLevel, loadBonus, get bonus() { return bonus; },
  loadMode, startRace, get game() { return game; }, get player() { return player; },
  loadCards, loadCardsUi, openCards, nextBooster, get cards() { return cards; }, get cardsUi() { return cardsUi; },
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
    if (e.code === 'KeyR' && !game.paused) restart();
    if (e.code === 'Escape') pause(!$('pause').classList.contains('on'));
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') setHold(false); });
  // DefaultInGameUI PauseButton -> PauseUI: a full-screen "Tap To Continue" button and the Home button. The row of
  // level list / restart / sound / hub buttons under it is the web's (the original has a settings popup on the home page).
  $('btnPause').onclick = () => { initAudio(); play('button'); pause(true); };
  $('pause').onclick = (e) => { if (e.target === $('pause')) { play('button'); pause(false); } };
  $('btnRestart').onclick = () => { initAudio(); play('button'); pause(false); restart(); };
  $('btnSound').onclick = () => { initAudio(); save.sound = !save.sound; writeSave(save); soundIcon(); play('button'); };
  $('btnLevels').onclick = () => { initAudio(); play('popup_in'); pause(false); openLevels(); };
  $('btnClose').onclick = () => { play('popup_out'); overlay('levels', false); };
  $('btnMenu').onclick = () => { initAudio(); play('popup_in'); pause(false); overlay('start', true); hud(); };
  $('btnPlay').onclick = () => { initAudio(); play('button'); overlay('start', false); };
  $('btnModes').onclick = () => openMenu('openModes');
  $('btnShop').onclick = () => openMenu('openShop');
  $('xpbar').onclick = () => openMenu('openRoad');
}

function pause(on) {
  if (on && game.phase === 'finish') return;
  overlay('pause', on);
  // the Home icon is in art/ui.webp with the end game art: fetched the first time the pause menu opens
  if (on) loadEnd().then((e) => e.icon($('btnMenu'), 'Icon_Home')).catch(() => {});
}

function soundIcon() { $('btnSound').style.opacity = save.sound ? 1 : 0.45; }

function modeName(id) { return meta.d.modes.find((m) => m[0] === id)?.[1] || id; }

// Level picker of the current mode: every level of a finite mode (locked ones greyed), else up to the next new level.
function openLevels() {
  if (mode.race) return openMode(mode.id); // race: the tournament page
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
  data = unpackDefaults(lv);
  meta = new Meta(md);
  mode = loaded[NORMAL] = { id: NORMAL, def: MODES[NORMAL], data, Player: MODES[NORMAL].player(), count: Infinity };
  custom = makeCustom(load, image);
  R = new Renderer(cv, atlasImg, lv.atlas, fontImg, font);
  app.atlas = { img: atlasImg, rects: lv.atlas, fontImg, font };
  // PauseButton: B_PauseButton from the atlas (already loaded), 80 x 80 at (25, 30) from the top left, scaled with height
  const pr = lv.atlas.rects.B_PauseButton, pk = 100 / pr[2];
  Object.assign($('btnPause').style, { backgroundImage: `url(./art/atlas.webp${V})`,
    backgroundSize: `${lv.atlas.w * pk}% ${lv.atlas.h * (100 / pr[3])}%`,
    backgroundPosition: `${(pr[0] / (lv.atlas.w - pr[2])) * 100}% ${(pr[1] / (lv.atlas.h - pr[3])) * 100}%` });
  // the achieved-level road follows `best`, so catch up rewards from saves made before it existed
  if (meta.claim(save, 'achieved_level_mode.normal', save.best).length) writeSave(save);
  // road rewards kept in `pending` before their system existed (skip tickets) are delivered now
  if (meta.deliverPending(save).length) writeSave(save);
  // a save that holds cards (or a booster to open) needs the card rules in play: second chance, XP / coin boosts
  if (save.boosterQueue?.length || Object.keys(save.inv).some((k) => k.startsWith('card.'))) loadCards().catch(() => {});
  const params = new URLSearchParams(location.search), q = params.get('level'), qm = 'mode.' + params.get('mode');
  if (MODES[qm]?.launch) setTimeout(() => openMode(qm)); else if (MODES[qm]) mode = await loadMode(qm);
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
    get mode() { return mode; }, skipLevel, hud, loadBonus, get bonus() { return bonus; }, get race() { return mode.race; },
    loadCards, loadCardsUi, openCards, get cards() { return cards; }, get cardsUi() { return cardsUi; }, app };
}

boot().catch((e) => { $('loading').textContent = 'Không tải được game: ' + e.message; });
