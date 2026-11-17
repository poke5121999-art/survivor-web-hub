// Front end: Splash (level0) -> MainMenu (level1) -> character / mode / brainrot / environment / weapon panels ->
// Loading -> resolves with the run choice. Rules: rules/menus-flow.md 1-3, 6, 7; ads/IAP: rules/ads-iap.md 1.3, 5.
// The uGUI trees are drawn by js/view/hud.js (imported, not changed): art/ui/level0/level0.json (splash, exported with
// tools/export_ui.py for level0 Canvas id 11) and art/ui/level1.json (MainMenu canvas). Buttons run their serialized
// persistent onClick calls (SetActive, SelectPlayer(int), UnlockPlayerWithAd, show1stAd, PlayGame, ...) in order,
// plus the code-wired ones (coins.mybutton -> WatchAds, Exit yes/no). Strings in Vietnamese, sprites as shipped.
//
//   const choice = await runFrontEnd(root, { profile, assets, sound });   // { character, weapon, mode, brainrot, environment }
//
// root: element the menu fills (the #stage, or a child of it; its client size is the stage size).
// profile: object from js/sim/profile.js (load(state)); mutated in place, saved through opts.save(profile) after every
//   change (default: merged into localStorage 'steal-egg-v1' as `profile`).
// assets: { art (URL of art/, default ../../art/ next to this file), version, level0, level1 (layouts, fetched when
//   missing), coins (number shown in the coin buttons; default: the save's coins, else data/game.json start.coins) }.
// sound: a js/view/sound.js Sound (optional): click on ButtonClickSound buttons, popup sounds, music on/off.
// Other options: ready (promise the splash waits for after its bar), splashSeconds (test override of the 10 s bar),
//   splash (false: straight to MainMenu, as Pause > Home loads it without the Splash scene), onChoice (called with the
//   run choice when the Loading bar is full), hold (promise: the menu keeps its full Loading bar up until it resolves,
//   i.e. while the GamePlay scene loads behind it),
//   wallet ({ get(), add(n) } for coins when the sim already exists), onQuit (EXIT > YES), debug (object filled with
//   live state for tests).
import { Hud } from './hud.js';
import * as P from '../sim/profile.js';

// --- numbers (menus-flow.md 1-3; mb-level0/1 component data) ------------------------------------------------------
const T = {
  splash: 10,            // level0 Loading id 136 loadingTime, Ease Linear
  gamePlay: 1,           // level1 Loading id 1052 loadingTime (sceneName "GamePlay" from MainMenu.PlayGame)
  barStart: 0.01,        // Loading.LoadScene: slider.value = 0.01 before DOValue(1)
  firstAdBar: 3.0,       // MainMenu.LoadAds: slide.DOValue(1, 3.0)
  firstAdOn: 2.0 + 1.0,  // LoadAds: panel on, wait 2.0, [interstitial dropped], wait 1.0, panel off
  dragThreshold: 10,     // EventSystem m_DragThreshold (mb-level1 id 640), screen pixels
  coinFly: 0.6,          // coins.flyDuration (ids 907/944/1023)
};
// CharacterPopupTween (identical on the 5 panels, menus-flow.md 3)
const POP = { popupDuration: 0.45, delayBetweenPopup: 0.08, slideDistance: 2000, popupOvershoot: 1.15, loopDuration: 0.6,
  delayBetweenLoopCharacters: 0.001, delayBetweenFullLoops: 3.0, tiltAmount: 8, jumpAmount: 40, breathScale: 0.08,
  afterPopups: 0.3 };    // AnimationRoutine: Wait(0.3) between the popups and the idle loop

const M = 'MainMenu/';
const HOME = M + 'MainMenu', CHAR = M + 'charSelection', MODE = M + 'ModeSelection', BRAIN = M + 'BrainRotSelection';
const ENV = M + 'dayN9ight', WEAPON = M + 'weapon', EXIT = M + 'EXIT', SETTINGS = M + 'Setting (1)';
const AD_LOADING = M + 'LoadingPanel (1)', LOADING = M + 'Loading/LoadingPanel';
const SCREENS = { [HOME]: 'home', [CHAR]: 'character', [MODE]: 'mode', [BRAIN]: 'brainrot', [ENV]: 'environment',
  [WEAPON]: 'weapon', [EXIT]: 'exit', [SETTINGS]: 'settings', [AD_LOADING]: 'adLoading', [LOADING]: 'loading' };
const NAMES = ['3 (1)', '2', '3', '3 (2)', '1', '4'];      // players[] / list buttons, index 0..5 (mb-level1 ids 991/686/1021)

// Selection panels: script class, stage previews, list tiles, CharacterPopupTween sounds (art/sfx/sfx.json refs).
const SELECT = {
  character: { cls: 'PurchaseAbleCharacterSelection', root: CHAR, stage: `${CHAR}/stage/`, tiles: `${CHAR}/Scroll View/Viewport/Content/`,
    viewport: `${CHAR}/Scroll View/Viewport`, sounds: ['pop_1', 'pop_2', 1.0] },
  brainrot: { cls: 'studentSelection', root: BRAIN, stage: `${BRAIN}/stage (1)/`, tiles: `${BRAIN}/Scroll View (1)/Viewport/Content/`,
    viewport: `${BRAIN}/Scroll View (1)/Viewport`, sounds: ['pop_1', 'pop_2', 0.623] },
  weapon: { cls: 'weaponSelection', root: WEAPON, stage: `${WEAPON}/stage/`, tiles: `${WEAPON}/Character/Scroll View/Viewport/Content/`,
    viewport: `${WEAPON}/Character/Scroll View/Viewport`, sounds: ['popup_3', 'popup_5', 0.623] },
};
const CLS_PANEL = Object.fromEntries(Object.entries(SELECT).map(([k, v]) => [v.cls, k]));
const POPUP_PANELS = {
  [CHAR]: { tiles: NAMES.map(n => SELECT.character.tiles + n), sounds: SELECT.character.sounds },
  [BRAIN]: { tiles: NAMES.map(n => SELECT.brainrot.tiles + n), sounds: SELECT.brainrot.sounds },
  [WEAPON]: { tiles: NAMES.map(n => SELECT.weapon.tiles + n), sounds: SELECT.weapon.sounds },
  [MODE]: { tiles: ['StealMode', 'Comming', 'Comming (1)'].map(n => `${MODE}/Panel/${n}`), sounds: ['popup_3', 'popup_5', 0.623] },
  [ENV]: { tiles: ['StealMode', 'Comming'].map(n => `${ENV}/Panel/${n}`), sounds: ['popup_3', 'popup_5', 0.623] },
};

// DOTweenVisualManager onEnableBehaviour 3 (Restart): Scale isFrom 0, 0.5 s (mb-level1 DOTweenAnimation goids 82, 204, 139).
const ENABLE_TWEENS = {
  [HOME]: [{ path: `${HOME}/Panel`, ease: 'outQuad' }],
  [EXIT]: [{ path: `${EXIT}/Panel (1)`, ease: 'outQuad' }],
  [SETTINGS]: [{ path: `${SETTINGS}/Panel`, ease: 'outExpo' }],
};
// autoPlay DOTweenAnimation loops (mb-level1): Scale yoyo to `to` in `dur`, and ShakePosition on every stage preview
// (strength (0, 50, 10), 1 s, vibrato 10, randomness 90, Restart).
const LOOP_SCALES = [
  [`${HOME}/Panel/PlayGame`, 1.1, 'linear'],
  [`${CHAR}/PlayGame`, 1.1, 'outQuart'], [`${CHAR}/PlayGame (1)`, 1.1, 'outQuart'],
  [`${BRAIN}/PlayGame`, 1.1, 'outQuart'], [`${BRAIN}/PlayGame (1)`, 1.1, 'outQuart'],
  [`${WEAPON}/PlayGame`, 1.1, 'outQuart'], [`${WEAPON}/PlayGame (1)`, 1.1, 'outQuart'],
  [`${MODE}/Panel/Comming`, 1.01, 'outElastic'], [`${MODE}/Panel/Comming (1)`, 1.01, 'outElastic'], [`${ENV}/Panel/Comming`, 1.01, 'outElastic'],
  [`${EXIT}/Panel (1)/Panel/No`, 1.13, 'outQuad'], [`${SETTINGS}/Panel/Save`, 0.8, 'outQuad'],
];
const SHAKE = { strength: 50, dur: 1.0, vibrato: 10 };

// Vietnamese for the TMP strings of both scenes (rules/menus-flow.md 1-2 list them); sprites keep their baked art.
const VI = {
  'Loading...': 'Đang tải...',
  next: 'Tiếp',
  Unlock: 'Mở khoá',
  'Exit Game': 'Thoát trò chơi',
  'Are you sure you want to exit': 'Bạn có chắc muốn thoát không?',
  YES: 'CÓ',
  NO: 'KHÔNG',
  Settings: 'Cài đặt',
  Sound: 'Âm thanh',
  Music: 'Nhạc',
  Sensitivity: 'Độ nhạy',
  Save: 'Lưu',
};

const EASE = {
  linear: t => t,
  inQuad: t => t * t,
  outQuad: t => t * (2 - t),
  outCubic: t => 1 - (1 - t) ** 3,
  inOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outQuart: t => 1 - (1 - t) ** 4,
  outExpo: t => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
  inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: t => { const c = 1.70158; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; },
  outElastic: t => (t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t - 0.075) * (2 * Math.PI) / 0.3) + 1),
};

// coins.FormatNumber: < 1000 as is, else "0.#" + k / M / B.
export function formatCoins(n) {
  n = Math.floor(n);
  const f = (v, s) => `${Math.round(v * 10) / 10}${s}`;
  if (n >= 1e9) return f(n / 1e9, 'B');
  if (n >= 1e6) return f(n / 1e6, 'M');
  if (n >= 1000) return f(n / 1000, 'k');
  return String(n);
}

const STYLE = `
.menu-root { position: absolute; inset: 0; overflow: hidden; z-index: 20; pointer-events: auto; touch-action: none;
  -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent; }
.menu-root .ugui-btn { cursor: pointer; }
.menu-root .menu-glow > .ugui-img { filter: drop-shadow(0 0 3px rgb(255, 64, 170)) drop-shadow(0 0 3px rgb(255, 64, 170)); }
`;

// Hud with the menu's own path lookup (Hud.index prefixes "Canvas/", the MainMenu tree starts at "MainMenu").
// Layout groups the export lists but whose component is disabled (mb-level1 HorizontalLayoutGroup m_Enabled 0): their
// children keep the serialized positions.
const DISABLED_LAYOUTS = new Set([`${CHAR}/Scroll View/Viewport/Content`]);

class MenuCanvas extends Hud {
  index(path) {
    const i = this.byPath.get(path);
    return i == null ? -1 : i;
  }

  // HorizontalLayoutGroup as Unity runs it (childControlWidth 0): each child keeps its width, gets an equal share of
  // the surplus when childForceExpandWidth, sits at childAlignment inside its cell; with no surplus the children run
  // from the left padding. Hud's equal-slot approximation is replaced; serialized positions of the fixed-width rows
  // (Settings rows, dayN9ight) come out identical.
  place(i, ax, ay, pw, ph, slot) {
    const n = this.L.nodes[i], p = n.parent;
    if (slot && p >= 0) {
      const par = this.L.nodes[p];
      slot = DISABLED_LAYOUTS.has(par.path) ? null : this.hlgSlot(p, i, pw, ph);
    }
    return super.place(i, ax, ay, pw, ph, slot);
  }

  hlgSlot(p, i, w, h) {
    const lay = this.L.nodes[p].layout, [pl, pr, pt, pb] = lay.padding;
    const kids = this.kids[p].filter(k => this.L.nodes[k].active);
    const sizes = kids.map(k => this.L.nodes[k].rect.sizeDelta[0]);
    const pref = sizes.reduce((a, b) => a + b, 0) + lay.spacing * (kids.length - 1) + pl + pr;
    const align = /Left$/.test(lay.childAlignment) ? 0 : /Right$/.test(lay.childAlignment) ? 1 : 0.5;
    const expand = lay.forceExpand && lay.forceExpand[0];
    let pos = pl, mult = 0;
    const surplus = w - pref;
    if (surplus > 0) { if (expand) mult = surplus / kids.length; else pos = pl + surplus * align; }
    for (let k = 0; k < kids.length; k++) {
      const c = sizes[k], cell = c + (expand ? mult : 0);
      if (kids[k] === i) return { x: pos + (cell - c) * align, y: pb, w: c, h: h - pt - pb };
      pos += cell + lay.spacing;
    }
    return null;
  }
}

function loadJson(url) {
  return fetch(url).then(r => {
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    return r.json();
  });
}

const STORE_KEY = 'steal-egg-v1';
function readStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { return null; }
}
// Default persistence: merge the profile into the stored steal-egg-v1 state, keep everything else.
export function storeProfile(profile) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(P.save(readStore(), profile))); } catch (e) { /* storage unavailable */ }
}
export function storedProfile() { return P.load(readStore()); }

export async function runFrontEnd(root, opts = {}) {
  const profile = opts.profile || storedProfile();
  const sound = opts.sound || null;
  const assets = opts.assets || {};
  const art = String(assets.art || new URL('../../art/', import.meta.url).href).replace(/\/?$/, '/');
  const version = assets.version || '';
  const q = version ? `?v=${version}` : '';
  const debug = opts.debug || {};
  const persist = () => (opts.save ? opts.save(profile) : storeProfile(profile));

  if (!document.getElementById('menu-style')) {
    const st = document.createElement('style');
    st.id = 'menu-style';
    st.textContent = STYLE;
    document.head.appendChild(st);
  }
  const [level0, level1, startCoins] = await Promise.all([
    assets.level0 || loadJson(`${art}ui/level0/level0.json${q}`),
    assets.level1 || loadJson(`${art}ui/level1.json${q}`),
    assets.coins != null || opts.wallet ? null
      : loadJson(`${art}../data/game.json${q}`).then(d => d.start.coins).catch(() => 1000),
  ]);
  const stored = readStore();
  const baseCoins = assets.coins != null ? assets.coins : stored && Number.isFinite(stored.coins) ? stored.coins : startCoins;
  const wallet = opts.wallet || {
    get: () => baseCoins + profile.pendingCoins,
    add: () => {},                       // P.adCoins already put the reward in profile.pendingCoins
  };

  const el = document.createElement('div');
  el.className = 'menu-root';
  root.appendChild(el);
  const size = () => [root.clientWidth || window.innerWidth, root.clientHeight || window.innerHeight];

  // --- animation clock ----------------------------------------------------------------------------------------------
  const states = new Map();           // element -> { x, y, s, r, base }
  const tweens = new Set();
  const loops = [];                   // per-frame functions
  let now = performance.now() / 1000, raf = 0, alive = true;
  const stateOf = node => {
    let s = states.get(node.el);
    if (!s) {
      const r = node.rect;
      s = { x: 0, y: 0, s: 1, r: 0, sx: r ? r.scale[0] : 1, sy: r ? r.scale[1] : 1, rot: r ? r.rotZ || 0 : 0, dirty: true };
      states.set(node.el, s);
    }
    return s;
  };
  const tween = (node, prop, from, to, dur, ease = 'linear', token = null) => new Promise(res => {
    const s = stateOf(node);
    for (const t of tweens) if (t.s === s && t.prop === prop) { tweens.delete(t); t.res(false); }
    s[prop] = from; s.dirty = true;
    tweens.add({ s, prop, from, to, t0: now, dur: Math.max(dur, 1e-6), ease: EASE[ease], res, token });
  });
  const wait = (sec, token) => new Promise(res => {
    tweens.add({ s: null, t0: now, dur: sec, ease: EASE.linear, res, token });
  });
  function frame() {
    if (!alive) return;
    now = performance.now() / 1000;
    for (const t of tweens) {
      if (t.token && t.token.dead) { tweens.delete(t); t.res(false); continue; }
      const k = Math.min(1, (now - t.t0) / t.dur);
      if (t.s) { t.s[t.prop] = t.from + (t.to - t.from) * t.ease(k); t.s.dirty = true; }
      if (k >= 1) { tweens.delete(t); t.res(true); }
    }
    for (const f of loops) f(now);
    for (const [e, s] of states) {
      if (!s.dirty) continue;
      s.dirty = false;
      e.style.transform = `translate(${s.x}px, ${-s.y}px) scale(${s.sx * s.s}, ${s.sy * s.s}) rotate(${-(s.rot + s.r)}deg)`;
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  // Screen-pixel delta -> canvas units of `elem` (undoes the stage rotation and the CanvasScaler scale).
  function screenMatrix(elem) {
    let m = new DOMMatrix();
    for (let e = elem; e && e !== document.documentElement; e = e.parentElement) {
      const t = getComputedStyle(e).transform;
      if (t && t !== 'none') m = new DOMMatrix(t).multiply(m);
    }
    return m;
  }
  function toLocal(elem, dx, dy) {
    const m = screenMatrix(elem), det = m.a * m.d - m.b * m.c || 1;
    return [(m.d * dx - m.c * dy) / det, (-m.b * dx + m.a * dy) / det];
  }

  // --- canvases -----------------------------------------------------------------------------------------------------
  function makeCanvas(layout, spriteBase) {
    const c = new MenuCanvas({ layout, parent: el, spriteBase, version });
    c.active = layout.nodes.map(n => n.active);
    c.els.forEach(e => e.classList.remove('ugui-off'));
    c.nodeAt = path => {
      const i = c.index(path);
      if (i < 0) throw new Error(`menu node "${path}" not found`);
      return { i, el: c.els[i], rect: layout.nodes[i].rect, path };
    };
    c.els.forEach((e, i) => {
      const d = e.querySelector(':scope > .ugui-txt');
      if (!d) return;
      const raw = String(layout.nodes[i].text.text || '').replace(/<[^>]+>/g, '').trim();
      if (VI[raw] != null) d.textContent = VI[raw];
    });
    c.inHierarchy = i => {
      for (let k = i; k >= 0; k = layout.nodes[k].parent) if (!c.active[k]) return false;
      return true;
    };
    // uGUI Slider without a handle: Fill rect anchorMax.x = value (Hud.place), patched in place for every frame.
    c.setBar = (path, v) => {
      const i = c.index(path);
      c.sliders.set(i, Math.max(0, Math.min(1, v)));
      const fillArea = c.nodeAt(`${path}/Fill Area`), fill = c.nodeAt(`${path}/Fill Area/Fill`);
      const w = fillArea.el.offsetWidth;
      fill.el.style.width = `${Math.max(0, c.sliders.get(i) * w + fill.rect.sizeDelta[0])}px`;
    };
    c.resize(...size());
    return c;
  }
  let cv = null;
  const onResize = () => { if (cv) { cv.resize(...size()); for (const s of states.values()) s.dirty = true; } };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null;
  if (ro) ro.observe(root);
  window.addEventListener('resize', onResize);

  function setActive(path, on) {
    const n = cv.nodeAt(path), was = cv.inHierarchy(n.i);
    cv.active[n.i] = !!on;
    n.el.classList.toggle('ugui-hid', !on);
    const is = cv.inHierarchy(n.i);
    if (is) cv.fitTexts(n.el);
    if (was !== is && hooks) (is ? hooks.enable : hooks.disable)(path);
  }
  let hooks = null;

  const play = (name, vol = 1) => { if (sound) sound.play(name, vol); };

  // --- 1. Splash (level0): Loading.OnEnable with IsSplashScene -> LoadScene("MainMenu"), bar 0.01 -> 1 linear ---------
  debug.screen = 'splash';
  cv = makeCanvas(level0, `${art}ui/level0/sprites`);
  debug.canvas = cv;
  const splashBar = 'Canvas/Loading/LoadingPanel/Panel/w';
  const splashTime = opts.splashSeconds != null ? opts.splashSeconds : T.splash;
  if (opts.splash !== false) {
    const t0 = performance.now();
    await new Promise(res => {
      const step = () => {
        if (!alive) return res();
        const k = Math.min(1, (performance.now() - t0) / 1000 / Math.max(splashTime, 1e-6));
        cv.setBar(splashBar, T.barStart + (1 - T.barStart) * k);
        debug.bar = k;
        if (k >= 1) res(); else requestAnimationFrame(step);
      };
      step();
    });
    if (opts.ready) await opts.ready;
  }
  cv.root.remove();

  // --- 2. MainMenu (level1) -----------------------------------------------------------------------------------------
  cv = makeCanvas(level1, `${art}ui/sprites`);
  debug.canvas = cv;
  const node = p => cv.nodeAt(p);
  const L = level1.nodes;

  // Sound / music prefs (SoundManager.Start, Settings.Start).
  if (sound) {
    sound.settings.sound = !!profile.prefs.SoundEnabled;
    sound.settings.music = !!profile.prefs.MusicEnabled;
    if (!sound.settings.music) sound.loop('sonami_music', false);
  }

  // coins: text = FormatNumber(CoinAmount) on the three coin buttons; AnimateCoinChange counts to the new value.
  const coinTexts = [`${HOME}/Panel/TopPanel/Coin/Text (TMP)`, `${MODE}/TopPanel (1)/Coins/Text (TMP)`, `${ENV}/TopPanel (1)/Coins/Text (TMP)`];
  let shownCoins = wallet.get();
  const showCoins = v => { shownCoins = v; for (const p of coinTexts) cv.setText(p, formatCoins(v)); };
  showCoins(shownCoins);
  cv.setText(`${M}TextDisplayer/displayText/Text (TMP)`, '');
  let coinAnim = null;
  function coinAd() {
    P.adCoins(profile);
    wallet.add(P.AD_COINS);
    persist();
    const from = shownCoins, to = wallet.get(), t0 = now;
    if (coinAnim) loops.splice(loops.indexOf(coinAnim), 1);
    coinAnim = t => {
      const k = Math.min(1, (t - t0) / T.coinFly);
      showCoins(Math.round(from + (to - from) * k));
      if (k >= 1) { loops.splice(loops.indexOf(coinAnim), 1); coinAnim = null; }
    };
    loops.push(coinAnim);
    debug.coins = to;
  }

  // Selection panels (PurchaseAbleCharacterSelection / studentSelection / weaponSelection).
  const cursor = { character: 0, brainrot: 0, weapon: 0 };
  function selectSlot(panel, i) {
    const S = SELECT[panel];
    cursor[panel] = i;
    const unlocked = P.select(profile, panel, i);
    NAMES.forEach((n, k) => {
      setActive(S.stage + n, k === i);
      node(S.tiles + n).el.classList.toggle('menu-glow', k === i);     // UIEffect enabled on the selected tile only
    });
    setActive(`${S.root}/PlayGame (1)`, !unlocked);
    setActive(`${S.root}/PlayGame`, unlocked);
    debug[panel] = i;
  }
  function unlockSlot(panel) {
    P.unlock(profile, panel, cursor[panel]);
    persist();
    setActive(`${SELECT[panel].root}/PlayGame (1)`, false);
    setActive(`${SELECT[panel].root}/PlayGame`, true);
  }

  // Settings panel (Settings.Start / ToggleSound / ToggleMusic / ChangeSensitivity / Continue).
  const SOUND_X = `${SETTINGS}/Panel/Panel/Sound/sound/Image (1)`, MUSIC_X = `${SETTINGS}/Panel/Panel/Music/sound/Image (1)`;
  const SENS = `${SETTINGS}/Panel/Panel/Sensitvity/Slider`;
  const SENS_MAX = L[cv.index(SENS)].slider.MaxValue, SENS_MIN = L[cv.index(SENS)].slider.MinValue;
  function settingsShow() {
    setActive(SOUND_X, !profile.prefs.SoundEnabled);
    setActive(MUSIC_X, !profile.prefs.MusicEnabled);
    cv.setBar(SENS, (profile.prefs.sensitivity - SENS_MIN) / (SENS_MAX - SENS_MIN));
  }
  {
    const sl = node(SENS).el;
    sl.classList.add('ugui-hit');
    let drag = false;
    const setFromPointer = e => {
      const r = sl.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const [lx] = toLocal(sl, e.clientX - cx, e.clientY - cy);
      const k = Math.max(0, Math.min(1, lx / sl.offsetWidth + 0.5));
      const v = SENS_MIN + (SENS_MAX - SENS_MIN) * k;
      P.setSetting(profile, 'sensitivity', v);
      cv.setBar(SENS, k);
      persist();
    };
    sl.addEventListener('pointerdown', e => { drag = true; setFromPointer(e); e.stopPropagation(); });
    window.addEventListener('pointermove', e => { if (drag) setFromPointer(e); });
    window.addEventListener('pointerup', () => { drag = false; });
  }

  // CharacterPopupTween: random popup and idle style per enable; tiles pop one after another, then idle forever.
  const popTokens = new Map();
  async function popupRoutine(panel) {
    const cfg = POPUP_PANELS[panel], token = { dead: false };
    popTokens.set(panel, token);
    const style = Math.floor(Math.random() * 4), idle = Math.floor(Math.random() * 4);
    const [popSnd, loopSnd, vol] = cfg.sounds;
    const tiles = cfg.tiles.map(node);
    const reset = n => { const s = stateOf(n); Object.assign(s, { x: 0, y: 0, s: 1, r: 0, dirty: true }); };
    tiles.forEach(reset);
    const D = POP.popupDuration;
    debug.popping = (debug.popping || 0) + 1;       // tests wait for 0 before tapping a tile
    try {
      await popups();
    } finally {
      debug.popping--;
    }
    async function popups() {
    for (const n of tiles) {
      if (token.dead) return;
      play(popSnd, vol);
      if (style === 0) {
        await tween(n, 's', 0, POP.popupOvershoot, D * 0.7, 'outBack', token);
        await tween(n, 's', POP.popupOvershoot, 1, D * 0.3, 'outQuad', token);
      } else if (style === 1) await tween(n, 'x', -POP.slideDistance, 0, D, 'outBack', token);
      else if (style === 2) await tween(n, 'y', POP.slideDistance, 0, D, 'outBack', token);
      else await Promise.all([tween(n, 's', 0, 1, D, 'outBack', token), tween(n, 'r', -360, 0, D, 'outCubic', token)]);
      reset(n);
      await wait(POP.delayBetweenPopup, token);
    }
    await wait(POP.afterPopups, token);
    }
    const L2 = POP.loopDuration;
    while (!token.dead) {
      for (const n of tiles) {
        if (token.dead) return;
        play(loopSnd, vol);
        if (idle === 0) {
          await tween(n, 'r', 0, POP.tiltAmount, L2 * 0.33, 'inOutSine', token);
          await tween(n, 'r', POP.tiltAmount, -POP.tiltAmount, L2 * 0.33, 'inOutSine', token);
          await tween(n, 'r', -POP.tiltAmount, 0, L2 * 0.34, 'inOutSine', token);
        } else if (idle === 1) await tween(n, 'r', 0, 360, L2, 'inOutCubic', token);
        else if (idle === 2) {
          await tween(n, 'y', 0, POP.jumpAmount, L2 * 0.45, 'outQuad', token);
          await tween(n, 'y', POP.jumpAmount, 0, L2 * 0.55, 'inQuad', token);
        } else {
          await tween(n, 's', 1, 1 + POP.breathScale, L2 * 0.5, 'inOutSine', token);
          await tween(n, 's', 1 + POP.breathScale, 1, L2 * 0.5, 'inOutSine', token);
        }
        reset(n);
        await wait(POP.delayBetweenLoopCharacters, token);
      }
      await wait(POP.delayBetweenFullLoops, token);
    }
  }

  // Panel OnEnable / OnDisable.
  const screenStack = () => Object.keys(SCREENS).filter(p => cv.inHierarchy(cv.index(p)));
  hooks = {
    enable(path) {
      for (const t of ENABLE_TWEENS[path] || []) tween(node(t.path), 's', 0, 1, 0.5, t.ease);
      const panel = Object.keys(SELECT).find(k => SELECT[k].root === path);
      if (panel) {
        const S = SELECT[panel];
        node(S.tiles.slice(0, -1)).el.dataset.scroll = '0';
        scrollTo(S, 0);
        selectSlot(panel, 0);            // OnEnable: LoadUnlockedPlayers, add 0, SelectPlayer(0)
      }
      if (POPUP_PANELS[path]) popupRoutine(path);
      if (path === SETTINGS) settingsShow();
      if (coinTexts.some(p => p.startsWith(path))) showCoins(wallet.get());
      debug.screen = SCREENS[screenStack().slice(-1)[0]] || debug.screen;
    },
    disable(path) {
      const tok = popTokens.get(path);
      if (tok) { tok.dead = true; POPUP_PANELS[path].tiles.forEach(p => { const s = stateOf(node(p)); Object.assign(s, { x: 0, y: 0, s: 1, r: 0, dirty: true }); }); }
      const top = screenStack().slice(-1)[0];
      debug.screen = SCREENS[top] || debug.screen;
    },
  };

  // Looping DOTweens.
  for (const [path, to, ease] of LOOP_SCALES) {
    const s = stateOf(node(path)), f = EASE[ease], t0 = now;
    loops.push(t => {
      const k = ((t - t0) / 0.5) % 2, u = k < 1 ? f(k) : f(2 - k);
      s.s = 1 + (to - 1) * u; s.dirty = true;
    });
  }
  for (const S of Object.values(SELECT)) {
    for (const n of NAMES) {
      const s = stateOf(node(S.stage + n));
      let cycle = -1, pts = [];
      loops.push(t => {
        const c = Math.floor(t / SHAKE.dur);
        if (c !== cycle) {
          cycle = c;
          let sign = Math.random() < 0.5 ? -1 : 1;
          pts = [0];
          for (let k = 1; k < SHAKE.vibrato; k++) { sign = -sign; pts.push(sign * SHAKE.strength * (1 - k / SHAKE.vibrato) * (0.5 + Math.random() / 2)); }
          pts.push(0);
        }
        const u = ((t / SHAKE.dur) % 1) * SHAKE.vibrato, k = Math.floor(u);
        s.y = pts[k] + (pts[k + 1] - pts[k]) * (u - k);
        s.dirty = true;
      });
    }
  }

  // Scroll views (ScrollRect: character/brainrot horizontal, weapon vertical); drag past m_DragThreshold cancels the tap.
  function scrollTo(S, v) {
    const vp = node(S.viewport), content = node(S.tiles.slice(0, -1)), s = stateOf(content);
    const horiz = L[content.i].layout && L[content.i].layout.type === 'horizontal';
    const over = horiz ? content.el.offsetWidth - vp.el.offsetWidth : content.el.offsetHeight - vp.el.offsetHeight;
    const lim = Math.max(0, over);
    const val = Math.max(-lim, Math.min(0, v));
    if (horiz) s.x = val; else s.y = -val;
    s.dirty = true;
    return val;
  }
  let suppressClick = false;
  for (const S of Object.values(SELECT)) {
    const vp = node(S.viewport).el, content = node(S.tiles.slice(0, -1));
    const horiz = L[content.i].layout && L[content.i].layout.type === 'horizontal';
    let start = null;
    vp.addEventListener('pointerdown', e => { start = { x: e.clientX, y: e.clientY, v: horiz ? stateOf(content).x : -stateOf(content).y, drag: false }; });
    window.addEventListener('pointermove', e => {
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!start.drag && Math.hypot(dx, dy) < T.dragThreshold) return;
      start.drag = true;
      const [lx, ly] = toLocal(vp, dx, dy);
      scrollTo(S, start.v + (horiz ? lx : ly));
    });
    window.addEventListener('pointerup', () => { if (start && start.drag) suppressClick = true; start = null; });
    vp.addEventListener('wheel', e => {
      const v = horiz ? stateOf(content).x : -stateOf(content).y;
      scrollTo(S, v - (e.deltaY + e.deltaX) / cv.scale);
      e.preventDefault();
    }, { passive: false });
  }
  el.addEventListener('click', e => { if (suppressClick) { suppressClick = false; e.stopPropagation(); e.preventDefault(); } }, true);
  el.addEventListener('pointerdown', () => { suppressClick = false; }, true);

  // Fake loading bars.
  let busy = false;
  async function bar(panelPath, sliderPath, dur, ease, hold) {
    busy = true;
    setActive(panelPath, true);
    debug.screen = SCREENS[panelPath];
    const t0 = now, f = EASE[ease];
    await new Promise(res => {
      const fn = t => {
        const k = Math.min(1, (t - t0) / dur);
        cv.setBar(sliderPath, (ease === 'linear' ? T.barStart : 0) + (1 - (ease === 'linear' ? T.barStart : 0)) * f(k));
        if (t - t0 >= hold) { loops.splice(loops.indexOf(fn), 1); res(); }
      };
      loops.push(fn);
    });
    busy = false;
  }

  // --- button wiring ------------------------------------------------------------------------------------------------
  let finish;
  const done = new Promise(res => { finish = res; });
  const calls = {
    SetActive: (c, arg) => setActive(c.target.path, !!(arg && arg.bool)),
    show1stAd: async () => {               // LoadAds: 3 s overlay (slide 0 -> 1, DOTween default ease OutQuad)
      await bar(AD_LOADING, `${AD_LOADING}/Panel/w`, T.firstAdBar, 'outQuad', T.firstAdOn);
      setActive(AD_LOADING, false);
      hooks.disable(AD_LOADING);
    },
    show2ndAd: () => {}, show3rdAd: () => {}, show4thAd: () => {},           // interstitials: dropped (ADS)
    SelectPlayer: (c, arg) => selectSlot(CLS_PANEL[c.cls], arg && arg.int ? arg.int : 0),
    UnlockPlayerWithAd: c => unlockSlot(CLS_PANEL[c.cls]),
    PlayGame: async () => {                // MainMenu.PlayGame -> StartLoading("GamePlay"): Loading 1 s linear
      await bar(LOADING, `${LOADING}/Panel/w`, T.gamePlay, 'linear', T.gamePlay);
      const choice = P.choice(profile);
      // LoadSceneAsync: the full bar stays until the GamePlay scene is there (opts.hold), nothing of it shows before
      if (opts.onChoice) opts.onChoice(choice);
      if (opts.hold) { busy = true; debug.screen = 'holding'; await opts.hold; }
      finish(choice);
    },
    QuitGame: () => { if (opts.onQuit) opts.onQuit(); else setActive(EXIT, false); },  // Application.Quit: web decision
    Rateus: () => {}, MoreGames: () => {}, privacy: () => {},                // OpenURL to Google Play / Sites: OUT
    ToggleSound: () => {
      P.setSetting(profile, 'SoundEnabled', !profile.prefs.SoundEnabled);
      if (sound) sound.settings.sound = !!profile.prefs.SoundEnabled;
      setActive(SOUND_X, !profile.prefs.SoundEnabled);
      persist();
    },
    ToggleMusic: () => {
      P.setSetting(profile, 'MusicEnabled', !profile.prefs.MusicEnabled);
      if (sound) {
        sound.settings.music = !!profile.prefs.MusicEnabled;
        sound.loop('sonami_music', sound.settings.music);
        if (sound.settings.music) sound.start();
      }
      setActive(MUSIC_X, !profile.prefs.MusicEnabled);
      persist();
    },
    Continue: () => { setActive(SETTINGS, false); persist(); },
    // IAP (hidden, never reachable): UnlockAllChar, ShowInapp
  };
  L.forEach((n, i) => {
    if (!n.button) return;
    const clicks = (n.scripts || []).includes('ButtonClickSound');
    const coin = (n.scripts || []).includes('coins');
    cv.els[i].addEventListener('click', async e => {
      e.stopPropagation();
      if (busy || !cv.inHierarchy(i) || !n.button.interactable) return;
      if (clicks) play('click');
      if (coin) coinAd();                  // coins.Start: mybutton.onClick += WatchAds -> RewardCoind (+100)
      debug.taps = (debug.taps || 0) + 1;
      for (const c of n.button.onClick || []) {
        const f = calls[c.method];
        if (!f) { console.warn(`menu: no handler for ${c.cls}.${c.method}`); continue; }
        await f(c, c.arg);
      }
    });
  });

  setActive(HOME, false);
  setActive(HOME, true);                   // home OnEnable: Panel scale-in
  debug.screen = 'home';
  debug.profile = profile;

  const result = await done;
  alive = false;
  cancelAnimationFrame(raf);
  for (const t of popTokens.values()) t.dead = true;
  if (ro) ro.disconnect();
  window.removeEventListener('resize', onResize);
  el.remove();
  debug.screen = 'done';
  debug.result = result;
  return result;
}
