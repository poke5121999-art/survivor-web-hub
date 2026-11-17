// Front end inside the real game page (index.html, no URL flags, fresh profile), real input only (touch taps at element
// centres, the keyboard for walking):
//   flow     first launch: Splash bar -> main menu; the coin ad (+100) on home; Play -> character panel; character 2
//            (index 1, locked) unlocked with the ad button, Next -> mode -> brainrot -> day/night -> weapon -> Next ->
//            GamePlay with Player2 (GoToGamePlay.Player[1]): Player2 is the only player shown, it follows the sim and
//            its rig animates while it walks; the menu coins arrived in the game. Pause > Restart reloads GamePlay
//            straight away with the same character (static playerIndex). Pause > Home: 3 s Loading bar, then the main
//            menu without the Splash; the ad unlock is still there. A reload (new launch) shows Splash + menu again
//            (the original loads level0 on every launch) and keeps the unlock.
//   overlap  the menu screens inside index.html at 1280x720, 1920x1080, 2756x1268, 919x423@DPR3 and portrait
//            1268x2756: on every screen each visible button is hit at its centre (nothing on top, the hub link
//            included) and lies inside the stage.
//   parity   at 1920x1080 the splash and every menu screen of index.html are also saved under
//            ~/stealegg-ref/parity/menu/web/<key>.png (refs: art/ui/preview.html?s=level0|level1, test/menu.js --refs).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run, hudCenter } = require('./harness');

const PARITY = path.join(process.env.PARITY || path.join(os.homedir(), 'stealegg-ref', 'parity'), 'menu', 'web');
const PARITY_KEY = { splash: 'splash', home: 'home', character: 'char', mode: 'mode', brainrot: 'brainrot', environment: 'daynight', weapon: 'weapon',
  exit: 'exit', settings: 'settings', loading: 'loading' };

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
const TILES = `${CHAR}Scroll View/Viewport/Content/`;
const SCOPE = { home: `${M}MainMenu`, exit: `${M}EXIT`, character: `${M}charSelection`, mode: `${M}ModeSelection`,
  settings: `${M}Setting (1)`, brainrot: `${M}BrainRotSelection`, environment: `${M}dayN9ight`, weapon: `${M}weapon` };

async function open(browser, base, { viewport = { width: 1280, height: 720 }, dpr = 1, ctx = null } = {}) {
  const context = ctx || await browser.newContext({ viewport, deviceScaleFactor: dpr, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => errors.push(`pageerror ${e.message}`));
  page.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
  await page.goto(`${base}/index.html`);
  return { ctx: context, page, errors };
}
const menuState = page => page.evaluate(() => {
  const g = window.__game, m = g && g.menu;
  return { screen: m ? m.screen : null, bar: m ? m.bar : null, ready: !!(g && g.ready), mode: g && g.menuMode };
});
// Screen reached and its CharacterPopupTween popups finished.
const waitScreen = (page, name, timeout = 15000, settle = true) =>
  page.waitForFunction(([n, st]) => window.__game.menu && window.__game.menu.screen === n && !(st && window.__game.menu.popping),
    [name, settle], { timeout }).then(() => true, () => false);
const visible = (page, p) => page.evaluate(p => {
  const e = document.querySelector(`.menu-root [data-path="${CSS.escape(p)}"]`);
  return !!e && e.checkVisibility() && e.getBoundingClientRect().width > 0;
}, p);
async function tap(page, p) {
  const c = await page.evaluate(p => {
    const e = document.querySelector(`.menu-root [data-path="${CSS.escape(p)}"]`);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  }, p);
  if (!c) throw new Error(`menu node "${p}" not found`);
  await page.touchscreen.tap(c[0], c[1]);
  await page.waitForTimeout(150);
}
async function tapHud(page, p) {
  const [x, y] = await hudCenter(page, p);
  await page.touchscreen.tap(x, y);
  await page.waitForTimeout(150);
}
const stored = page => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('steal-egg-v1')); } catch (e) { return null; } });
const charState = page => page.evaluate(([C, T, names]) => {
  const vis = p => { const e = document.querySelector(`.menu-root [data-path="${CSS.escape(p)}"]`); return !!e && e.checkVisibility(); };
  return { preview: names.map(n => vis(`${C}stage/${n}`)).indexOf(true), next: vis(`${C}PlayGame`), unlock: vis(`${C}PlayGame (1)`),
    glow: names.map(n => document.querySelector(`.menu-root [data-path="${CSS.escape(T + n)}"]`).classList.contains('menu-glow')).indexOf(true) };
}, [CHAR, TILES, NAMES]);
const gameReady = page => page.waitForFunction(() => (window.__game.ready && window.__game.blur === 0) || window.__game.error, null, { timeout: 180000 })
  .then(() => page.evaluate(() => window.__game.error || null));

// Which player object is shown, where it is against the sim, and a leg bone pose of the shown rig.
const playerProbe = page => page.evaluate(() => {
  const g = window.__game, w = g.view.world;
  const shown = ['Player1', 'Player2', 'Player3', 'Player4', 'Player5', 'Player6'].filter(n => w.node(n).visible);
  const obj = g.view.player, p = g.sim.state.actors[0].pos;
  const pos = obj.getWorldPosition(new obj.position.constructor());
  let leg = null;
  obj.traverse(o => { if (!leg && /LeftUpLeg$/.test(o.name)) leg = o; });
  const rig = g.view.playerRig;
  return { shown, name: g.view.playerName, objName: obj.name, rigNode: rig && rig.node ? rig.node.name : null,
    dist: Math.hypot(pos.x - p[0], pos.z - p[2]), simPos: p.slice(), leg: leg ? leg.quaternion.toArray() : null,
    coins: g.sim.state.coins, equipped: g.sim.state.upgrades.weapons.equipped };
});

// The page was reloaded (window.__before gone) and main.js decided what to show.
const afterReload = page => page.waitForFunction(() => !window.__before && window.__game && window.__game.menuMode, null, { timeout: 30000 });

async function flow(browser, base, shot, check) {
  const { ctx, page, errors } = await open(browser, base);
  // --- first launch: splash -> home
  await page.waitForFunction(() => window.__game && window.__game.menu && window.__game.menu.screen, null, { timeout: 30000 });
  let st = await menuState(page);
  check('first launch (no flags, fresh profile) starts on the Splash', st.screen === 'splash' && st.mode === 'splash', JSON.stringify(st));
  await page.waitForFunction(() => window.__game.menu.bar > 0.15, null, { timeout: 20000 });
  await shot(page, 'frontend-splash.png');
  check('the game does not start under the splash', !(await menuState(page)).ready);
  const tSplash = Date.now();
  check('main menu after the 10 s splash bar', await waitScreen(page, 'home', 20000) && await visible(page, `${HOME}PlayGame`), `${Date.now() - tSplash} ms after 15 %`);
  await page.waitForTimeout(600);
  await shot(page, 'frontend-home.png');
  check('hub link stays on the menu', await page.evaluate(() => { const a = document.querySelector('.hub-back'); const r = a.getBoundingClientRect();
    return a.checkVisibility() && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === a; }));
  await tap(page, `${HOME}TopPanel/Coin`);                              // coins.WatchAds -> +100
  check('home coin ad +100 waits as pendingCoins', ((await stored(page)) || {}).profile && (await stored(page)).profile.pendingCoins === 100);
  // --- Play -> character 2
  await tap(page, `${HOME}PlayGame`);
  check('Play -> character panel', await waitScreen(page, 'character', 12000));
  await tap(page, TILES + NAMES[1]);
  let cs = await charState(page);
  check('character 2 (index 1) previewed, locked: Unlock shown', cs.preview === 1 && cs.glow === 1 && cs.unlock && !cs.next, JSON.stringify(cs));
  await shot(page, 'frontend-char2-locked.png');
  await tap(page, `${CHAR}PlayGame (1)`);
  cs = await charState(page);
  const prof = ((await stored(page)) || {}).profile;
  check('ad unlock: Next shown, UnlockedPlayers "0,1" saved', cs.next && !cs.unlock && prof && prof.prefs.UnlockedPlayers === '0,1', JSON.stringify(prof && prof.prefs));
  await tap(page, `${CHAR}PlayGame`);
  check('Next -> mode panel', await waitScreen(page, 'mode'));
  await tap(page, `${MODE}Panel/StealMode`);
  check('Story tile -> brainrot panel', await waitScreen(page, 'brainrot'));
  await tap(page, `${BRAIN}PlayGame`);
  check('Next -> day/night panel', await waitScreen(page, 'environment'));
  await tap(page, `${ENV}Panel/StealMode`);
  check('Day tile -> weapon panel', await waitScreen(page, 'weapon'));
  await tap(page, `${WEAPON}PlayGame`);
  check('weapon Next -> Loading bar', await waitScreen(page, 'loading', 3000, false));
  // nothing of GamePlay shows before it is ready: the menu (full bar) is still on top whenever the game is not ready
  const cover = await page.evaluate(() => new Promise(res => {
    let bad = 0, n = 0;
    const tick = () => {
      const g = window.__game, menu = document.querySelector('.menu-root');
      n++;
      if (!g.ready && !menu && !g.error) bad++;
      if (g.ready && !menu) res({ bad, n }); else requestAnimationFrame(tick);
    };
    tick();
  }));
  check('GamePlay never shows before it is ready (menu Loading bar held)', cover.bad === 0, JSON.stringify(cover));
  const err = await gameReady(page);
  check('GamePlay starts after the menu', !err, err || '');
  if (err) { await ctx.close(); return; }
  const res = await page.evaluate(() => window.__game.choice);
  check('menu resolves with character 1, story, day', res && res.character === 1 && res.mode === 'story' && res.environment === 'day', JSON.stringify(res));
  check('the menu Loading bar stays up until GamePlay is ready, then its DOM goes',
    await page.waitForFunction(() => !document.querySelector('.menu-root'), null, { timeout: 5000 }).then(() => true, () => false)
    && (await page.evaluate(() => window.__game.menu.screen)) === 'done');
  let p0 = await playerProbe(page);
  check('only Player2 is shown and is the player', p0.shown.join() === 'Player2' && p0.name === 'Player2' && p0.objName === 'Player2' && p0.rigNode === 'Player2', JSON.stringify(p0.shown) + ' ' + p0.rigNode);
  check('menu ad coins arrived in the game (1000 + 100)', p0.coins === 1100, p0.coins);
  await page.waitForTimeout(400);
  await shot(page, 'frontend-game-start.png');
  // walk with the keyboard (real input) for 1.2 s
  p0 = await playerProbe(page);
  await page.keyboard.down('KeyW');
  const legs = [];
  for (let i = 0; i < 6; i++) { await page.waitForTimeout(200); legs.push((await playerProbe(page)).leg); }
  await page.keyboard.up('KeyW');
  const p1 = await playerProbe(page);
  const moved = Math.hypot(p1.simPos[0] - p0.simPos[0], p1.simPos[2] - p0.simPos[2]);
  const legVar = legs.filter(Boolean).reduce((m, q, i, a) => (i ? Math.max(m, Math.abs(q[0] - a[0][0]) + Math.abs(q[1] - a[0][1]) + Math.abs(q[2] - a[0][2])) : m), 0);
  check('the Player2 rig walks: sim moved, the Player2 object follows it, its leg bone animates', moved > 1 && p1.dist < 0.3 && legVar > 0.05,
    `moved ${moved.toFixed(2)} m, obj-sim ${p1.dist.toFixed(3)} m, leg ${legVar.toFixed(3)}`);
  await shot(page, 'frontend-game-walk.png');
  // --- Pause > Restart: GamePlay again with the same character, no menu
  await tapHud(page, 'InGame/TopPanel/Pause');
  await page.evaluate(() => { window.__before = 1; });
  await tapHud(page, 'PauseGame/Panel/Restart');
  check('Restart shows the 3 s Loading bar', await page.waitForFunction(() => window.__game.navBar > 0.3, null, { timeout: 5000 }).then(() => true, () => false));
  await shot(page, 'frontend-restart-loading.png');
  await afterReload(page);
  st = await menuState(page);
  check('Pause > Restart: GamePlay straight away, no menu', st.mode === 'skip' && !st.screen, JSON.stringify(st));
  check('restart starts without error', !(await gameReady(page)));
  p0 = await playerProbe(page);
  check('restart keeps Player2 (static GoToGamePlay.playerIndex)', p0.shown.join() === 'Player2' && p0.name === 'Player2', JSON.stringify(p0.shown));
  // --- Pause > Home: 3 s bar, then the main menu without the splash
  await tapHud(page, 'InGame/TopPanel/Pause');
  await shot(page, 'frontend-pause.png');
  await page.evaluate(() => { window.__before = 1; });
  const tHome = Date.now();
  await tapHud(page, 'PauseGame/Panel/Home');
  check('Home shows the 3 s Loading bar', await page.waitForFunction(() => window.__game.navBar > 0.4, null, { timeout: 5000 }).then(() => true, () => false));
  await shot(page, 'frontend-home-loading.png');
  await afterReload(page);
  check('Pause > Home goes back to the main menu (3 s Loading bar first)', await waitScreen(page, 'home', 15000) && Date.now() - tHome > 2800, `${Date.now() - tHome} ms`);
  st = await menuState(page);
  check('... without the Splash (MainMenu scene loaded directly)', st.mode === 'menu' && st.bar == null, JSON.stringify(st));
  await page.waitForTimeout(700);
  await shot(page, 'frontend-home-again.png');
  await tap(page, `${HOME}PlayGame`);
  await waitScreen(page, 'character', 12000);
  cs = await charState(page);
  check('character panel reopens on slot 0 (OnEnable SelectPlayer(0))', cs.preview === 0 && cs.next, JSON.stringify(cs));
  await tap(page, TILES + NAMES[1]);
  cs = await charState(page);
  check('ad unlock of character 2 kept', cs.preview === 1 && cs.next && !cs.unlock, JSON.stringify(cs));
  // --- reload = new launch: Splash + menu again
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.menu && window.__game.menu.screen, null, { timeout: 30000 });
  st = await menuState(page);
  check('reload (new launch) shows the Splash again', st.screen === 'splash' && st.mode === 'splash', JSON.stringify(st));
  check('then the main menu', await waitScreen(page, 'home', 20000));
  await page.waitForTimeout(700);                                       // home Panel scale-in (0.5 s)
  await tap(page, `${HOME}PlayGame`);
  await waitScreen(page, 'character', 12000);
  await tap(page, TILES + NAMES[1]);
  cs = await charState(page);
  check('after the reload character 2 is still unlocked', cs.preview === 1 && cs.next && !cs.unlock, JSON.stringify(cs));
  check('game save kept next to the profile', ((await stored(page)) || {}).coins === 1100 && !!(await stored(page)).profile, JSON.stringify(((await stored(page)) || {}).coins));
  check('no console errors (flow)', !errors.length, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// Overlap: every visible button of the screen's panel is hit at its centre and lies inside the stage.
const overlap = (page, scope) => page.evaluate(scope => {
  const root = document.querySelector(`.menu-root [data-path="${CSS.escape(scope)}"]`);
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
    if (r.width < 1 || r.height < 1) continue;
    const tf = e.style.transform;
    e.style.transform = '';
    const rest = e.getBoundingClientRect();
    e.style.transform = tf;
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    if (!clipOk(e, cx, cy)) continue;
    const hit = document.elementFromPoint(cx, cy);
    const inside = rest.x >= stage.x - 0.5 && rest.y >= stage.y - 0.5 && rest.right <= stage.right + 0.5 && rest.bottom <= stage.bottom + 0.5;
    const own = hit && hit.closest('[data-path], a');
    out.push({ p: e.dataset.path.replace('MainMenu/', ''), ok: !!hit && e.contains(hit), got: own ? (own.dataset.path || own.className).replace('MainMenu/', '') : String(hit && hit.tagName), inside });
  }
  return out;
}, scope);

async function overlapAll(browser, base, shot, check) {
  for (const size of SIZES) {
    const { ctx, page, errors } = await open(browser, base, { viewport: size.viewport, dpr: size.dpr });
    const parity = size.name === '1920x1080';
    if (parity) fs.mkdirSync(PARITY, { recursive: true });
    if (parity && await page.waitForFunction(() => window.__game.menu && window.__game.menu.bar > 0.3, null, { timeout: 30000 }).then(() => true, () => false)) {
      await page.screenshot({ path: path.join(PARITY, 'splash.png') });
    }
    const home = await waitScreen(page, 'home', 30000);
    check(`[${size.name}] splash -> home in index.html`, home);
    if (!home) { await ctx.close(); continue; }
    const visit = async (key, waitMs) => {
      const ok = await waitScreen(page, key, 6000);
      await page.waitForTimeout(waitMs);
      const res = ok ? await overlap(page, SCOPE[key]) : [];
      const bad = res.filter(b => !b.ok || !b.inside);
      check(`[${size.name}] ${key}: ${res.length} buttons hit at their centres, inside the stage`, ok && res.length > 0 && !bad.length,
        ok ? bad.map(b => `${b.p} -> ${b.got}${b.inside ? '' : ' (outside)'}`).join('; ') : 'screen not reached');
      await shot(page, `frontend-${size.name}-${key}.png`);
      if (parity) await page.screenshot({ path: path.join(PARITY, `${PARITY_KEY[key]}.png`) });
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
    check(`[${size.name}] weapon Next -> Loading`, await waitScreen(page, 'loading', 3000, false));
    await page.waitForTimeout(300);
    await shot(page, `frontend-${size.name}-loading.png`);
    if (parity) await page.screenshot({ path: path.join(PARITY, 'loading.png') });
    check(`[${size.name}] no console errors`, !errors.length, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }
}

run('frontend-flow', async ({ browser, base, shot, check }) => {
  if (!process.argv.includes('--overlap')) await flow(browser, base, shot, check);
  if (!process.argv.includes('--flow')) await overlapAll(browser, base, shot, check);
});
