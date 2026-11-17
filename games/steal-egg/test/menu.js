// Front-end test on menu-test.html, real input only (touch taps at element centres, mouse drags on the scroll lists):
//   flow     splash bar then home; every home button (EXIT opens, rate/more/privacy stay inert, coin ad +100); Play ->
//            3 s overlay -> character panel; tiles cycle the 6 characters (drag-scrolling the list); a locked one
//            unlocks with the ad button and stays unlocked after a reload (profile in steal-egg-v1); the shared
//            UnlockedPlayers key unlocks the same slot in the brainrot panel; back buttons; settings toggles; weapon
//            unlock + select; Next on the weapon panel resolves with the chosen character and weapon.
//   overlap  at 1280x720, 1920x1080, 2756x1268, 919x423@DPR3 and portrait 1268x2756 (stage turned 90 degrees): on
//            every screen, document.elementFromPoint at the centre of each visible button hits that button, inside
//            the stage; hidden IAP rows stay hidden. At 1920x1080 the screens are also saved for parity under
//            ~/stealegg-ref/parity/menu/web/<key>.png (refs: art/ui/preview.html?s=level1, see --refs).
//   node test/menu.js            all
//   node test/menu.js --refs     only re-render the preview.html references
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run } = require('./harness');

const PARITY = path.join(os.homedir(), 'stealegg-ref', 'parity', 'menu');
const SIZES = [
  { name: '1280x720', viewport: { width: 1280, height: 720 }, dpr: 1 },
  { name: '1920x1080', viewport: { width: 1920, height: 1080 }, dpr: 1 },
  { name: '2756x1268', viewport: { width: 2756, height: 1268 }, dpr: 1 },
  { name: '919x423@3', viewport: { width: 919, height: 423 }, dpr: 3 },
  { name: '1268x2756-portrait', viewport: { width: 1268, height: 2756 }, dpr: 1 },
];
const M = 'MainMenu/';
const HOME = `${M}MainMenu/Panel/`;
const CHAR = `${M}charSelection/`, BRAIN = `${M}BrainRotSelection/`, WEAPON = `${M}weapon/`;
const MODE = `${M}ModeSelection/`, ENV = `${M}dayN9ight/`, EXIT = `${M}EXIT/Panel (1)/Panel/`, SET = `${M}Setting (1)/Panel/`;
const NAMES = ['3 (1)', '2', '3', '3 (2)', '1', '4'];
const PANEL = {
  character: { root: CHAR, tiles: `${CHAR}Scroll View/Viewport/Content/`, stage: `${CHAR}stage/`, vp: `${CHAR}Scroll View/Viewport` },
  brainrot: { root: BRAIN, tiles: `${BRAIN}Scroll View (1)/Viewport/Content/`, stage: `${BRAIN}stage (1)/`, vp: `${BRAIN}Scroll View (1)/Viewport` },
  weapon: { root: WEAPON, tiles: `${WEAPON}Character/Scroll View/Viewport/Content/`, stage: `${WEAPON}stage/`, vp: `${WEAPON}Character/Scroll View/Viewport` },
};
// IAP rows that must never show (rules/ads-iap.md 5) plus the dead Pricebar rows.
const HIDDEN = [`${HOME}Unlock`, `${HOME}no ads`, `${M}royal pass`, `${CHAR}CUnlock`, `${BRAIN}CUnlock`, `${WEAPON}CUnlock`,
  `${CHAR}Pricebar`, `${BRAIN}Pricebar`, `${WEAPON}Pricebar`];
// Screen key -> panel root whose buttons are checked (modal panels: only their own).
const SCOPE = { home: `${M}MainMenu`, exit: `${M}EXIT`, character: `${M}charSelection`, mode: `${M}ModeSelection`,
  settings: `${M}Setting (1)`, brainrot: `${M}BrainRotSelection`, environment: `${M}dayN9ight`, weapon: `${M}weapon` };
const PARITY_KEY = { home: 'home', character: 'char', mode: 'mode', brainrot: 'brainrot', environment: 'daynight', weapon: 'weapon',
  exit: 'exit', settings: 'settings', loading: 'loading' };

// --- page helpers -----------------------------------------------------------------------------------------------------
async function openMenu(browser, base, { viewport, dpr = 1, query = 'mute&splash=0.4', ctx = null } = {}) {
  const context = ctx || await browser.newContext({ viewport, deviceScaleFactor: dpr, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => errors.push(`pageerror ${e.message}`));
  page.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
  await page.goto(`${base}/menu-test.html?${query}`);
  await page.waitForFunction(() => window.__menu && (window.__menu.screen || window.__menu.error), null, { timeout: 30000 });
  return { ctx: context, page, errors };
}
const screen = page => page.evaluate(() => window.__menu.screen);
// Screen reached and its CharacterPopupTween popups (tiles sliding / scaling in) finished.
const waitScreen = (page, name, timeout = 15000, settle = true) =>
  page.waitForFunction(([n, st]) => window.__menu.screen === n && !(st && window.__menu.popping), [name, settle], { timeout }).then(() => true, () => false);
const visible = (page, p) => page.evaluate(p => {
  const e = document.querySelector(`[data-path="${CSS.escape(p)}"]`);
  return !!e && e.checkVisibility() && e.getBoundingClientRect().width > 0;
}, p);
const centre = (page, p) => page.evaluate(p => {
  const e = document.querySelector(`[data-path="${CSS.escape(p)}"]`);
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return [r.x + r.width / 2, r.y + r.height / 2];
}, p);
async function tap(page, p) {
  const c = await centre(page, p);
  if (!c) throw new Error(`node "${p}" not found`);
  await page.touchscreen.tap(c[0], c[1]);
  await page.waitForTimeout(120);
}
// Drag the list until tile k's centre is inside the viewport (mouse drag from the viewport centre).
async function reveal(page, panel, k) {
  const P = PANEL[panel];
  for (let n = 0; n < 4; n++) {
    const g = await page.evaluate(([vp, tile]) => {
      const v = document.querySelector(`[data-path="${CSS.escape(vp)}"]`).getBoundingClientRect();
      const t = document.querySelector(`[data-path="${CSS.escape(tile)}"]`).getBoundingClientRect();
      const tc = [t.x + t.width / 2, t.y + t.height / 2], vc = [v.x + v.width / 2, v.y + v.height / 2];
      const inside = tc[0] > v.x + 4 && tc[0] < v.right - 4 && tc[1] > v.y + 4 && tc[1] < v.bottom - 4;
      return { inside, tc, vc };
    }, [P.vp, P.tiles + NAMES[k]]);
    if (g.inside) return true;
    const dx = g.vc[0] - g.tc[0], dy = g.vc[1] - g.tc[1];
    await page.mouse.move(g.vc[0], g.vc[1]);
    await page.mouse.down();
    for (let s = 1; s <= 8; s++) await page.mouse.move(g.vc[0] + dx * s / 8, g.vc[1] + dy * s / 8);
    await page.mouse.up();
    await page.waitForTimeout(100);
  }
  return false;
}
// Selection state as drawn: which stage preview shows, which tile glows, Next or Unlock button.
const panelState = (page, panel) => page.evaluate(([P, names]) => {
  const vis = p => { const e = document.querySelector(`[data-path="${CSS.escape(p)}"]`); return !!e && e.checkVisibility(); };
  return {
    preview: names.map(n => vis(P.stage + n)).indexOf(true),
    previews: names.filter(n => vis(P.stage + n)).length,
    glow: names.map(n => document.querySelector(`[data-path="${CSS.escape(P.tiles + n)}"]`).classList.contains('menu-glow')).indexOf(true),
    next: vis(`${P.root}PlayGame`), unlock: vis(`${P.root}PlayGame (1)`),
  };
}, [PANEL[panel], NAMES]);
const stored = page => page.evaluate(() => {
  try { return JSON.parse(localStorage.getItem('steal-egg-v1')).profile; } catch (e) { return null; }
});

// Overlap: every visible button of the screen's panel is hit at its centre and lies inside the stage.
const overlap = (page, scope) => page.evaluate(scope => {
  const root = document.querySelector(`[data-path="${CSS.escape(scope)}"]`);
  const stage = document.getElementById('stage').getBoundingClientRect();
  const clipOk = (e, cx, cy) => {
    for (let a = e.parentElement; a && a.dataset && a.dataset.path; a = a.parentElement) {
      if (getComputedStyle(a).overflow === 'hidden') {
        const r = a.getBoundingClientRect();
        if (cx < r.x || cx > r.right || cy < r.y || cy > r.bottom) return false;
      }
    }
    return true;
  };
  const out = [];
  for (const e of root.querySelectorAll('.ugui-btn')) {
    if (!e.checkVisibility()) continue;
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;            // scale 0 (MainMenu TopPanel/Setting)
    // inside-the-stage uses the rest pose: idle tilts / jumps of the popup tween are not layout
    const tf = e.style.transform;
    e.style.transform = '';
    const rest = e.getBoundingClientRect();
    e.style.transform = tf;
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    if (!clipOk(e, cx, cy)) continue;                     // scrolled out of its list
    const hit = document.elementFromPoint(cx, cy);
    const inside = rest.x >= stage.x - 0.5 && rest.y >= stage.y - 0.5 && rest.right <= stage.right + 0.5 && rest.bottom <= stage.bottom + 0.5;
    const own = hit && hit.closest('[data-path]');
    out.push({ p: e.dataset.path.replace('MainMenu/', ''), ok: !!hit && e.contains(hit), got: own ? own.dataset.path.replace('MainMenu/', '') : String(hit && hit.tagName), inside });
  }
  return out;
}, scope);

async function hiddenIap(page) {
  const shown = [];
  for (const p of HIDDEN) if (await visible(page, p)) shown.push(p);
  return shown;
}

// --- references -------------------------------------------------------------------------------------------------------
const REF_KEYS = {
  home: [[], []],
  char: [['MainMenu/charSelection'], ['stage/2', 'stage/3', 'stage/3 (2)', 'stage/1', 'stage/4', 'Pricebar', 'CUnlock', 'PlayGame (1)'].map(s => CHAR + s)],
  mode: [['MainMenu/ModeSelection'], []],
  brainrot: [['MainMenu/BrainRotSelection'], ['stage (1)/2', 'stage (1)/3', 'stage (1)/3 (2)', 'stage (1)/1', 'stage (1)/4', 'Pricebar', 'CUnlock', 'PlayGame (1)'].map(s => BRAIN + s)],
  daynight: [['MainMenu/dayN9ight'], []],
  weapon: [['MainMenu/weapon'], ['stage/2', 'stage/3', 'stage/3 (2)', 'stage/1', 'stage/4', 'Pricebar', 'CUnlock', 'PlayGame (1)'].map(s => WEAPON + s)],
  exit: [['MainMenu/EXIT'], []],
  settings: [['MainMenu/Setting (1)'], ['Panel/Panel/Sound/sound/Image (1)', 'Panel/Panel/Music/sound/Image (1)', 'Panel/Panel/Sensitvity/Slider/Handle Slide Area'].map(s => `${M}Setting (1)/${s}`)],
  loading: [['MainMenu/Loading/LoadingPanel'], []],
};
async function renderRefs(browser, base, check) {
  for (const [key, [show, hide]] of Object.entries(REF_KEYS)) {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await ctx.newPage();
    await page.goto(`${base}/art/ui/preview.html?s=level1${show.length ? `&show=${encodeURIComponent(show.join(','))}` : ''}`);
    await page.waitForFunction(() => window.__ready);
    await page.evaluate(h => {
      for (const p of h) { const e = document.querySelector(`[data-path="${CSS.escape(p)}"]`); if (e) e.classList.add('hid'); }
      document.getElementById('info').remove();
    }, hide);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    fs.mkdirSync(path.join(PARITY, 'ref', key), { recursive: true });
    await page.screenshot({ path: path.join(PARITY, 'ref', key, 'preview-1920.png') });
    await ctx.close();
  }
  check(`references rendered: ${Object.keys(REF_KEYS).length} screens`, true);
}

// --- flow -------------------------------------------------------------------------------------------------------------
async function flow(browser, base, shot, check) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, hasTouch: true });
  let { page, errors } = await openMenu(browser, base, { ctx, query: 'fresh&mute&splash=2' });
  check('splash shows first with its bar filling', await screen(page) === 'splash'
    && await visible(page, 'Canvas/Loading/LoadingPanel/Panel/w/Fill Area/Fill'));
  await page.waitForTimeout(700);
  await shot(page, 'menu-flow-splash.png');
  check('home appears after the splash bar', await waitScreen(page, 'home', 8000) && await visible(page, `${HOME}PlayGame`));
  await page.waitForTimeout(600);
  await shot(page, 'menu-flow-home.png');

  // home buttons
  await tap(page, `${HOME}Below panel/ExitBtn`);
  check('Exit opens the EXIT panel', await waitScreen(page, 'exit') && await visible(page, `${EXIT}YES`));
  await page.waitForTimeout(600);       // Panel (1) scale-in, 0.5 s
  await tap(page, `${EXIT}No`);
  check('EXIT > NO closes it', await waitScreen(page, 'home') && !(await visible(page, `${M}EXIT`)));
  await tap(page, `${HOME}Below panel/ExitBtn`);
  await page.waitForTimeout(600);
  await tap(page, `${EXIT}YES`);
  check('EXIT > YES (Application.Quit, no-op on web) closes the panel', await waitScreen(page, 'home'));
  for (const b of ['Below panel/Rateus', 'Below panel (1)/More Games', 'Below panel (1)/Privacy']) {
    await tap(page, HOME + b);
    check(`${b.split('/')[1]} (OpenURL, out) stays on home`, await screen(page) === 'home');
  }
  const coinText = () => page.evaluate(p => document.querySelector(`[data-path="${CSS.escape(p)}"] .ugui-txt`).textContent, `${HOME}TopPanel/Coin/Text (TMP)`);
  check('coins start at 1000 ("1K")', /^1k$/i.test(await coinText()), await coinText());
  await tap(page, `${HOME}TopPanel/Coin`);
  await page.waitForTimeout(800);
  check('coin ad grants +100 at once (1.1K)', /^1\.1k$/i.test(await coinText()) && (await stored(page)).pendingCoins === 100, await coinText());
  const setW = await page.evaluate(p => document.querySelector(`[data-path="${CSS.escape(p)}"]`).getBoundingClientRect().width, `${HOME}TopPanel/Setting`);
  check('home settings button is scale 0 in the original (not visible)', setW === 0, setW);

  // Play -> 3 s overlay -> character
  await tap(page, `${HOME}PlayGame`);
  check('Play shows the 3 s loading overlay', await waitScreen(page, 'adLoading', 1500, false));
  const t0 = Date.now();
  check('then the character panel', await waitScreen(page, 'character', 12000), `${Date.now() - t0} ms`);
  check('overlay lasted about 3 s', Date.now() - t0 > 2400, `${Date.now() - t0} ms`);
  await page.waitForTimeout(300);
  let st = await panelState(page, 'character');
  check('character panel opens on slot 0 with Next', st.preview === 0 && st.previews === 1 && st.glow === 0 && st.next && !st.unlock, JSON.stringify(st));
  const seen = [];
  for (const k of [1, 2, 3, 4, 5, 0]) {
    check(`tile ${k} reachable in the list`, await reveal(page, 'character', k));
    await tap(page, PANEL.character.tiles + NAMES[k]);
    st = await panelState(page, 'character');
    seen.push(st.preview);
    const locked = k !== 0;
    check(`character ${k}: preview ${k}, glow ${k}, ${locked ? 'Unlock' : 'Next'} button`,
      st.preview === k && st.previews === 1 && st.glow === k && st.unlock === locked && st.next === !locked, JSON.stringify(st));
  }
  check('tiles cycled all 6 characters', new Set(seen).size === 6, seen.join(','));
  await reveal(page, 'character', 2);
  await tap(page, PANEL.character.tiles + NAMES[2]);
  await shot(page, 'menu-flow-character-locked.png');
  await tap(page, `${CHAR}PlayGame (1)`);
  st = await panelState(page, 'character');
  let prof = await stored(page);
  check('ad Unlock unlocks character 2 at once', st.next && !st.unlock && prof && prof.prefs.UnlockedPlayers === '0,2', JSON.stringify(prof && prof.prefs));
  check('no console errors (first visit)', !errors.length, errors.slice(0, 3).join(' | '));

  // reload: still unlocked
  await page.close();
  ({ page, errors } = await openMenu(browser, base, { ctx, query: 'mute&splash=0.3' }));
  await waitScreen(page, 'home');
  await page.waitForTimeout(500);
  await tap(page, `${HOME}PlayGame`);
  await waitScreen(page, 'character', 12000);
  await reveal(page, 'character', 2);
  await tap(page, PANEL.character.tiles + NAMES[2]);
  st = await panelState(page, 'character');
  check('after reload character 2 is still unlocked', st.preview === 2 && st.next && !st.unlock, JSON.stringify(st));
  await tap(page, PANEL.character.tiles + NAMES[3]);
  st = await panelState(page, 'character');
  check('character 3 still locked', st.unlock && !st.next);
  await tap(page, `${CHAR}TopPanel (2)/Exit`);
  check('character X goes back home', await waitScreen(page, 'home'));
  await tap(page, `${HOME}PlayGame`);
  await waitScreen(page, 'character', 12000);
  st = await panelState(page, 'character');
  check('reopening resets the cursor to 0 (OnEnable SelectPlayer(0))', st.preview === 0 && st.next, JSON.stringify(st));
  await reveal(page, 'character', 2);
  await tap(page, PANEL.character.tiles + NAMES[2]);
  await tap(page, `${CHAR}PlayGame`);
  check('Next -> mode panel', await waitScreen(page, 'mode'));
  await tap(page, `${MODE}TopPanel (1)/back`);
  check('mode back -> character', await waitScreen(page, 'character'));
  await reveal(page, 'character', 2);
  await tap(page, PANEL.character.tiles + NAMES[2]);
  await tap(page, `${CHAR}PlayGame`);
  await waitScreen(page, 'mode');
  await tap(page, `${MODE}Panel/Comming`);
  check('"coming" mode tile has no handler', await screen(page) === 'mode');
  await tap(page, `${MODE}TopPanel (1)/Setting`);
  check('mode settings button opens Settings', await waitScreen(page, 'settings'));
  await page.waitForTimeout(600);
  await tap(page, `${SET}Panel/Sound/sound`);
  check('Sound toggle off shows the cross and saves SoundEnabled 0', await visible(page, `${SET}Panel/Sound/sound/Image (1)`) && (await stored(page)).prefs.SoundEnabled === 0);
  await tap(page, `${SET}Panel/Sound/sound`);
  await tap(page, `${SET}Panel/Music/sound`);
  check('Music toggle off saves MusicEnabled 0', (await stored(page)).prefs.MusicEnabled === 0 && (await stored(page)).prefs.SoundEnabled === 1);
  await tap(page, `${SET}Panel/Music/sound`);
  const sl = await page.evaluate(p => { const r = document.querySelector(`[data-path="${CSS.escape(p)}"]`).getBoundingClientRect(); return [r.x + r.width * 0.3, r.y + r.height / 2]; }, `${SET}Panel/Sensitvity/Slider`);
  await page.touchscreen.tap(sl[0], sl[1]);
  await page.waitForTimeout(150);
  prof = await stored(page);
  check('sensitivity slider writes an int near 3', prof.prefs.sensitivity >= 2 && prof.prefs.sensitivity <= 4, prof.prefs.sensitivity);
  await tap(page, `${SET}Save`);
  check('Save closes Settings', await waitScreen(page, 'mode'));
  await tap(page, `${MODE}Panel/StealMode`);
  check('Story mode tile -> brainrot panel', await waitScreen(page, 'brainrot'));
  await page.waitForTimeout(300);
  await reveal(page, 'brainrot', 2);
  await tap(page, PANEL.brainrot.tiles + NAMES[2]);
  st = await panelState(page, 'brainrot');
  check('shared UnlockedPlayers: brainrot 2 is unlocked too', st.preview === 2 && st.next && !st.unlock, JSON.stringify(st));
  await tap(page, `${BRAIN}TopPanel (2)/Exit`);
  check('brainrot X -> mode', await waitScreen(page, 'mode'));
  await tap(page, `${MODE}Panel/StealMode`);
  await waitScreen(page, 'brainrot');
  await tap(page, `${BRAIN}PlayGame`);
  check('brainrot Next -> environment', await waitScreen(page, 'environment'));
  await tap(page, `${ENV}TopPanel (1)/back`);
  check('environment back -> brainrot', await waitScreen(page, 'brainrot'));
  await tap(page, `${BRAIN}PlayGame`);
  await waitScreen(page, 'environment');
  await tap(page, `${ENV}TopPanel (1)/Coins`);
  await page.waitForTimeout(700);
  check('environment coin ad +100 (pending 200)', (await stored(page)).pendingCoins === 200);
  await tap(page, `${ENV}Panel/StealMode`);
  check('Day tile -> weapon panel', await waitScreen(page, 'weapon'));
  await page.waitForTimeout(300);
  await tap(page, PANEL.weapon.tiles + NAMES[4]);
  st = await panelState(page, 'weapon');
  check('weapon 4 selected, locked', st.preview === 4 && st.unlock && !st.next, JSON.stringify(st));
  await shot(page, 'menu-flow-weapon-locked.png');
  await tap(page, `${WEAPON}PlayGame (1)`);
  st = await panelState(page, 'weapon');
  check('weapon ad unlock', st.next && !st.unlock && (await stored(page)).prefs.UnlockedPlayers === '0,2,4');
  await tap(page, `${WEAPON}TopPanel (2)/Exit`);
  check('weapon X -> environment', await waitScreen(page, 'environment'));
  await tap(page, `${ENV}Panel/StealMode`);
  await waitScreen(page, 'weapon');
  await tap(page, PANEL.weapon.tiles + NAMES[4]);
  await tap(page, `${WEAPON}PlayGame`);
  check('weapon Next shows the 1 s loading bar', await waitScreen(page, 'loading', 1500, false));
  await page.waitForFunction(() => window.__menuResult, null, { timeout: 5000 }).catch(() => {});
  const result = await page.evaluate(() => window.__menuResult);
  check('Play resolves with the chosen character and weapon', result && result.character === 2 && result.weapon === 4 && result.mode === 'story' && result.environment === 'day',
    JSON.stringify(result));
  check('menu removed after resolving', !(await page.evaluate(() => !!document.querySelector('.menu-root'))));
  check('no console errors (second visit)', !errors.length, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// --- overlap + parity shots ------------------------------------------------------------------------------------------
async function overlapAll(browser, base, shot, check) {
  for (const size of SIZES) {
    const { ctx, page, errors } = await openMenu(browser, base, { viewport: size.viewport, dpr: size.dpr, query: 'fresh&mute&splash=0.3' });
    await waitScreen(page, 'home');
    const parity = size.name === '1920x1080';
    const visit = async (key, waitMs) => {
      const ok = await waitScreen(page, key, 6000);
      await page.waitForTimeout(waitMs);
      const res = ok ? await overlap(page, SCOPE[key]) : [];
      const bad = res.filter(b => !b.ok || !b.inside);
      check(`[${size.name}] ${key}: ${res.length} buttons hit at their centres, inside the stage`, ok && res.length > 0 && !bad.length,
        ok ? bad.map(b => `${b.p} -> ${b.got}${b.inside ? '' : ' (outside)'}`).join('; ') : 'screen not reached');
      const iap = await hiddenIap(page);
      check(`[${size.name}] ${key}: IAP rows hidden`, !iap.length, iap.join(', '));
      await shot(page, `menu-${size.name}-${key}.png`);
      if (parity) {
        fs.mkdirSync(path.join(PARITY, 'web'), { recursive: true });
        await page.screenshot({ path: path.join(PARITY, 'web', `${PARITY_KEY[key]}.png`) });
      }
    };
    await visit('home', 700);
    await tap(page, `${HOME}Below panel/ExitBtn`);
    await visit('exit', 700);
    await tap(page, `${EXIT}No`);
    await waitScreen(page, 'home');
    await tap(page, `${HOME}PlayGame`);
    await waitScreen(page, 'character', 12000);
    await visit('character', 300);
    await tap(page, `${CHAR}PlayGame`);
    await visit('mode', 2200);
    await tap(page, `${MODE}TopPanel (1)/Setting`);
    await visit('settings', 800);
    await tap(page, `${SET}Save`);
    await waitScreen(page, 'mode');
    await tap(page, `${MODE}Panel/StealMode`);
    await visit('brainrot', 300);
    await tap(page, `${BRAIN}PlayGame`);
    await visit('environment', 1800);
    await tap(page, `${ENV}Panel/StealMode`);
    await visit('weapon', 300);
    await tap(page, `${WEAPON}PlayGame`);
    if (await waitScreen(page, 'loading', 1500, false)) {
      await page.waitForTimeout(150);
      await shot(page, `menu-${size.name}-loading.png`);
      if (parity) await page.screenshot({ path: path.join(PARITY, 'web', 'loading.png') });
    }
    const res = await page.waitForFunction(() => window.__menuResult, null, { timeout: 5000 }).then(() => true, () => false);
    check(`[${size.name}] default run resolves`, res);
    check(`[${size.name}] no console errors`, !errors.length, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }
}

run('menu', async ({ browser, base, shot, check }) => {
  await renderRefs(browser, base, check);
  if (process.argv.includes('--refs')) return;
  await flow(browser, base, shot, check);
  await overlapAll(browser, base, shot, check);
});
