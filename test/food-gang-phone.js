#!/usr/bin/env node
/* Food Gang on a phone (owner report 2026-11-02, rev 20261031e): the game must fill a wide phone screen, the fighters
 * screen must not stutter, and the camera must not strain the eyes (worst with NORI's dash-slash).
 *   fill     touch viewports 20:9 / 19.5:9 / 18:9 landscape: no black band at any screen edge on the menu and in a
 *            match; the canvas backing covers the viewport; the first tap asks for real fullscreen (browser bars away)
 *   fighters SceneSkinCollection at 4x CPU throttle: cells scrolled out of the mask are culled (not drawn, animators
 *            paused), engine step time, cells scrolled back in are drawn again
 *   comfort  NORI 1v1, attack every 2.1 s: camera speed in screen widths per second, lookahead lead, shake offset,
 *            flashes; SCREEN SHAKE setting off and prefers-reduced-motion take shake to 0
 *   node test/food-gang-phone.js   FG_PARTS=fill,fighters,comfort   FG_URL=<Pages>/games/food-gang/index.html
 * Shots: shots/food-gang/phone/. Exit 1 on any failed check.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'shots', 'food-gang', 'phone');
const PARTS = (process.env.FG_PARTS || 'fill,fighters,comfort').split(',');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp',
  '.png': 'image/png', '.mp3': 'audio/mpeg', '.css': 'text/css', '.otf': 'font/otf', '.ttf': 'font/ttf' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const fails = [];
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
  if (ok) pass++; else { fail++; fails.push(name); }
};
const HARD = setTimeout(() => { console.log('FAIL hard time limit (20 min)'); process.exit(2); }, 20 * 60e3);

function serve() {
  return http.createServer((q, s) => {
    const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
    if (!f.startsWith(ROOT)) { s.writeHead(403); s.end(); return; }
    fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); s.end(d); });
  });
}

async function open(browser, url, vp, extra = {}) {
  const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] }, ...extra });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const ev = (f, a) => page.evaluate(f, a);
  const until = async (f, ms, a) => { const end = Date.now() + ms; for (;;) { const v = await ev(f, a).catch(() => null); if (v) return v; if (Date.now() > end) return null; await sleep(100); } };
  await page.goto(url);
  await until(() => window.fgApp && window.fgApp.profile && window.fgDebug().screen !== 'boot', 60000);
  await ev(() => { const a = window.fgApp; a.meta.completeTutorial(a.profile, new Date()); a.profile.gameCount = Math.max(1, a.profile.gameCount); a.save(); try { localStorage.setItem('fg-lang', 'English'); } catch (e) { /* */ } });
  await page.reload();
  return { ctx, page, errors, ev, until };
}

const menuUp = () => { const u = window.fgDebug && window.fgDebug().ui; return u && u[0] && u[0].scene === 'SceneMenu'; };

// share of edge samples that are black (an empty band) on each side, from a screenshot
async function edges(page) {
  const b64 = (await page.screenshot()).toString('base64');
  return page.evaluate(async (src) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + src; await img.decode();
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, cv.width, cv.height).data, W = cv.width, H = cv.height;
    const side = (x0, x1, y0, y1) => { let n = 0, k = 0; for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) { const i = (y * W + x) * 4; n++; if (d[i] + d[i + 1] + d[i + 2] < 24) k++; } return +(k / n).toFixed(3); };
    const bx = Math.max(2, Math.round(W * 0.02)), by = Math.max(2, Math.round(H * 0.02));
    return { left: side(0, bx, 0, H), right: side(W - bx, W, 0, H), top: side(0, W, 0, by), bottom: side(0, W, H - by, H) };
  }, b64);
}

// frame / step-time / draw-call sample over ms
const measure = (P, ms) => P.ev((ms) => new Promise((done) => {
  const st = window.fgEngineStats, E = window.fgApp.engine, t = [], dc = [], cpu = [], cul = [];
  if (!E.__wrapped) { const o = E.step.bind(E); E.step = (d) => { const a = performance.now(); o(d); E.__last = performance.now() - a; }; E.__wrapped = 1; }
  let last = performance.now();
  const end = last + ms;
  const f = (now) => {
    t.push(now - last); last = now; dc.push(st.drawCalls); cpu.push(E.__last || 0); cul.push(st.uiCulled || 0);
    if (now < end) { requestAnimationFrame(f); return; }
    const q = (a, p) => { const s = a.slice(1).sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2); };
    done({ fps: +(1000 * (t.length - 1) / ms).toFixed(1), draws: Math.max(...dc), culled: Math.max(...cul), step50: q(cpu, 0.5), step95: q(cpu, 0.95), frame95: q(t, 0.95) });
  };
  requestAnimationFrame(f);
}), ms);

async function partFill(browser, url) {
  console.log('-- fill');
  const VPS = [[915, 412], [844, 390], [800, 360], [740, 360]];
  for (const vp of VPS) {
    const P = await open(browser, url, vp, { deviceScaleFactor: 2.625, isMobile: true, hasTouch: true });
    const tag = `${vp[0]}x${vp[1]}`;
    try {
      const up = await P.until(menuUp, 60000);
      await sleep(1500);
      const e = await edges(P.page);
      await P.page.screenshot({ path: path.join(OUT, `fill-${tag}-menu.png`) });
      const cv = await P.ev(() => { const c = document.getElementById('cv'), r = c.getBoundingClientRect(); return { css: [r.width, r.height, r.left, r.top], vw: innerWidth, vh: innerHeight, backing: [c.width, c.height] }; });
      check(`${tag} (${(vp[0] / vp[1]).toFixed(2)}:1): canvas covers the viewport`, !!up && cv.css[0] === cv.vw && cv.css[1] === cv.vh && cv.css[2] === 0 && cv.css[3] === 0 && Math.abs(cv.backing[0] - cv.vw * 2) <= 2,
        `css ${cv.css.join(',')} viewport ${cv.vw}x${cv.vh} backing ${cv.backing.join('x')}`);
      check(`${tag}: menu has no black band at any edge`, Math.max(e.left, e.right, e.top, e.bottom) < 0.2, JSON.stringify(e));
      if (vp[0] === 915) {
        // first tap: fullscreen requested (headless Chromium grants it)
        await P.page.touchscreen.tap(vp[0] / 2, vp[1] * 0.12);
        const fs1 = await P.until(() => window.fgFullscreen && window.fgFullscreen.requests > 0 && window.fgFullscreen, 3000);
        await sleep(500);
        const full = await P.ev(() => !!document.fullscreenElement);
        check(`${tag}: the first tap asks for fullscreen (browser bars hidden)`, !!fs1 && fs1.coarse && fs1.requests >= 1, `${JSON.stringify(fs1)}, fullscreen ${full}`);
        // a match on the widest phone: the camera widens, the map fills the screen
        await P.ev(() => { location.search = '?mode=dm1v1&map=dining&seed=3'; });
        const m = await P.until(() => window.fgDebug && window.fgDebug().phase === 'match', 60000);
        await sleep(4500);
        const em = await edges(P.page);
        await P.page.screenshot({ path: path.join(OUT, `fill-${tag}-match.png`) });
        check(`${tag}: match fills the screen (no black band)`, !!m && Math.max(em.left, em.right, em.top, em.bottom) < 0.2, JSON.stringify(em));
      }
      check(`${tag}: no page errors`, P.errors.length === 0, P.errors.slice(0, 2).join(' | '));
    } finally { await P.ctx.close(); }
  }
  // a desktop window never asks for fullscreen on its own
  const D = await open(browser, url, [1280, 720]);
  try {
    await D.until(menuUp, 60000);
    await D.page.mouse.click(640, 80); await sleep(300);
    const f = await D.ev(() => window.fgFullscreen);
    check('desktop: no fullscreen request on click', f && !f.coarse && f.requests === 0, JSON.stringify(f));
  } finally { await D.ctx.close(); }
}

async function partFighters(browser, url) {
  console.log('-- fighters');
  const vp = [915, 412];
  const P = await open(browser, url, vp, { deviceScaleFactor: 2.625, isMobile: true, hasTouch: true });
  try {
    await P.until(menuUp, 60000);
    await sleep(2000);
    const cdp = await P.ctx.newCDPSession(P.page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const menu = await measure(P, 3000);
    const btn = await P.ev(() => (window.fgButtons('SceneMenu') || []).find((x) => x.method.split(',').includes('OpenSkinCollection')));
    await P.page.touchscreen.tap(btn.pos[0], btn.pos[1]);
    const col = await P.until(() => { const u = window.fgDebug().ui; return u[0] && u[0].scene === 'SceneSkinCollection' ? u[0] : null; }, 30000);
    await sleep(3000);
    const c = await measure(P, 4000);
    await P.page.screenshot({ path: path.join(OUT, 'fighters-start.png') });
    console.log(`  menu ${JSON.stringify(menu)}\n  fighters ${JSON.stringify(c)}`);
    check('fighters: 16 cells', !!col && col.cells.length === 16, col ? `${col.cells.length}` : '');
    check('fighters: cells outside the scroll mask are culled (>= 8 of 16)', c.culled >= 8, `${c.culled} culled`);
    check('fighters: draw calls <= 110 (173 before culling)', c.draws <= 110, `${c.draws}`);
    // relative to the menu measured on the same page and load: 4.3x before culling (11.3 / 2.6 ms), 2.6x after
    check('fighters: engine step p50 <= 3.2x the menu\'s (4.3x before culling)', c.step50 <= 3.2 * menu.step50, `${c.step50} ms vs menu ${menu.step50} ms = ${(c.step50 / menu.step50).toFixed(2)}x`);
    // paused animators belong to culled cells only
    const an = await P.ev(() => { const E = window.fgApp.engine; let paused = 0, run = 0; for (const a of E.animators) if (a.node.activeInHierarchy) { if (a.culled) paused++; else run++; } return { paused, run }; });
    check('fighters: animators of culled cells are paused', an.paused > 0 && an.run > 0, JSON.stringify(an));
    const swipe = async (x0, x1, y) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
      for (let i = 1; i <= 12; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / 12, y }] }); await sleep(16); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    const sp = measure(P, 3500);
    for (let i = 0; i < 3; i++) { await swipe(vp[0] * 0.8, vp[0] * 0.2, vp[1] * 0.6); await sleep(500); }
    const s = await sp;
    console.log(`  scrolling ${JSON.stringify(s)}`);
    check('fighters: step p95 while scrolling <= 5x the menu\'s p50 (6.6x standing still before culling)', s.step95 <= 5 * menu.step50, `${s.step95} ms vs menu p50 ${menu.step50} ms = ${(s.step95 / menu.step50).toFixed(2)}x`);
    await sleep(1500);
    // every cell whose rect is on screen is drawn (not culled) and its fighter is laid out inside the screen
    const vis = await P.ev((W) => {
      const scr = window.fgApp.screens.find((q) => q.sceneName === 'SceneSkinCollection');
      return scr.cells.map((cell) => { const n = cell.inst.root, r = window.fgApp.engine.ui.screenRect(n); const on = r[0] + r[2] > 0 && r[0] < W; return { on, culled: !!n.uiCulled }; });
    }, (await P.ev(() => window.fgApp.engine.canvas.width)));
    const onScreen = vis.filter((v) => v.on);
    check('fighters: after scrolling, every on-screen cell is drawn', onScreen.length >= 4 && onScreen.every((v) => !v.culled), JSON.stringify(vis.map((v) => (v.on ? (v.culled ? 'X' : 'o') : '.')).join('')));
    await P.page.screenshot({ path: path.join(OUT, 'fighters-scrolled.png') });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    check('fighters: no page errors', P.errors.length === 0, P.errors.slice(0, 2).join(' | '));
  } finally { await P.ctx.close(); }
}

// NORI 1v1, J every 2.1 s for 16 s; per-frame camera log
async function ninja(browser, url, extra = {}, beforeMatch = null) {
  const P = await open(browser, url + (url.includes('?') ? '&' : '?') + 'skin=6&mode=dm1v1&map=kitchen&seed=7', [1280, 720], extra);
  try {
    if (beforeMatch) await beforeMatch(P);
    const m = await P.until(() => window.fgDebug && window.fgDebug().phase === 'match', 60000);
    if (!m) return { err: 'no match' };
    await sleep(3500);
    await P.ev(() => {
      const E = window.fgApp.engine, c = E.cine, L = window.__mot = { f: [] };
      const st = E.step.bind(E);
      E.step = (d) => {
        st(d);
        let fl = 0;
        for (const r of E.spriteRenderers) if (r.node.activeInHierarchy && r.flashAmount > fl) fl = r.flashAmount;
        L.f.push([performance.now() / 1000, c.camNode.lp[0], c.look[0] || 0, c.out ? Math.hypot(c.camNode.lp[0] - c.out[0], c.camNode.lp[1] - c.out[1]) : 0, fl, E.canvas.width / E.canvas.height, c.composer ? 0 : 0]);
      };
    });
    for (let i = 0; i < 8; i++) { await P.page.keyboard.down('KeyJ'); await sleep(120); await P.page.keyboard.up('KeyJ'); await sleep(1980); }
    const L = await P.ev(() => window.__mot);
    const comfort = await P.ev(() => window.fgApp.engine.comfort);
    const f = L.f, visH = 2 * 20 * Math.tan(12.5 * Math.PI / 180), visW = visH * f[0][5];
    let vmax = 0, flashMax = 0, shakeMax = 0, lookMax = 0;
    for (let i = 1; i < f.length; i++) {
      const dt = f[i][0] - f[i - 1][0]; if (dt <= 0) continue;
      vmax = Math.max(vmax, Math.abs(f[i][1] - f[i - 1][1]) / visW / dt);
      lookMax = Math.max(lookMax, Math.abs(f[i][2])); shakeMax = Math.max(shakeMax, f[i][3] / visH); flashMax = Math.max(flashMax, f[i][4]);
    }
    return { frames: f.length, vmax: +vmax.toFixed(2), lookMax: +lookMax.toFixed(2), shakeMax: +shakeMax.toFixed(4), flashMax: +flashMax.toFixed(2), comfort, errors: P.errors };
  } finally { await P.ctx.close(); }
}

async function partComfort(browser, url) {
  console.log('-- comfort');
  const a = await ninja(browser, url);
  console.log(`  default ${JSON.stringify(a)}`);
  check('comfort: NORI match ran', !a.err && a.frames > 600, a.err || `${a.frames} frames`);
  // before: 66 screen widths / s (warp + lookahead overshoot), lookahead up to 21 units
  check('comfort: camera never moves faster than 2.5 screen widths per second', a.vmax < 2.5, `${a.vmax}`);
  check('comfort: lookahead leads at most 1 unit', a.lookMax <= 1.0001, `${a.lookMax}`);
  check('comfort: shake stays under 0.8 % of the screen height', a.shakeMax < 0.008, `${a.shakeMax}`);
  check('comfort: flashes capped at 0.6', a.flashMax <= 0.6001, `${a.flashMax}`);
  const r = await ninja(browser, url, { reducedMotion: 'reduce' });
  console.log(`  reduced motion ${JSON.stringify(r)}`);
  check('comfort: prefers-reduced-motion -> no shake, flashes <= 0.25', r.comfort && r.comfort.shake === 0 && r.shakeMax === 0 && r.flashMax <= 0.2501, `${JSON.stringify(r.comfort)} shake ${r.shakeMax} flash ${r.flashMax}`);
  // the SCREEN SHAKE button in Settings: on -> off persists and reaches the engine
  const P = await open(browser, url, [1280, 720]);
  try {
    await P.until(menuUp, 60000);
    await sleep(800);
    const sb = await P.ev(() => (window.fgButtons('SceneMenu') || []).find((x) => x.method.split(',').includes('OpenSettings')));
    if (sb) await P.page.mouse.click(sb.pos[0], sb.pos[1]);
    const st = await P.until(() => { const u = window.fgDebug().ui; return u[0] && u[0].scene === 'SceneSettings' ? u[0] : null; }, 15000);
    await sleep(800);
    await P.page.screenshot({ path: path.join(OUT, 'settings.png') });
    check('comfort: Settings shows a SCREEN SHAKE button, on by default', !!st && !!st.shakeButton && st.shake === true, st ? JSON.stringify({ btn: st.shakeButton, shake: st.shake }) : 'no settings');
    if (st && st.shakeButton) {
      await P.page.mouse.click(st.shakeButton[0], st.shakeButton[1]);
      await sleep(400);
      const after = await P.ev(() => ({ ls: localStorage.getItem('fg-shake'), comfort: window.fgApp.engine.comfort, ui: window.fgDebug().ui[0].shake,
        label: (() => { const s = window.fgApp.screens.find((q) => q.sceneName === 'SceneSettings'); return s && s.shakeLabel ? s.shakeLabel.text : null; })() }));
      check('comfort: tapping it turns shake off (saved, engine shake 0)', after.ls === '0' && after.comfort.shake === 0 && after.ui === false, JSON.stringify(after));
      check('comfort: the button is labelled SCREEN SHAKE', after.label === 'SCREEN SHAKE', String(after.label));
      await P.page.screenshot({ path: path.join(OUT, 'settings-off.png') });
    }
    check('comfort: no page errors (settings)', P.errors.length === 0, P.errors.slice(0, 2).join(' | '));
  } finally { await P.ctx.close(); }
  check('comfort: no page errors (matches)', !a.errors.length && !r.errors.length, [...(a.errors || []), ...(r.errors || [])].slice(0, 2).join(' | '));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let server = null;
  let url = process.env.FG_URL;
  if (!url) { server = serve(); await new Promise((r) => server.listen(0, r)); url = `http://localhost:${server.address().port}/games/food-gang/index.html`; }
  const browser = await chromium.launch({ args: [...(process.platform === 'win32' ? ['--use-angle=d3d11'] : ['--use-angle=vulkan', '--enable-features=Vulkan']), '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  try {
    if (PARTS.includes('fill')) await partFill(browser, url);
    if (PARTS.includes('fighters')) await partFighters(browser, url);
    if (PARTS.includes('comfort')) await partComfort(browser, url);
  } catch (e) { check('run', false, String(e && e.stack || e)); }
  await browser.close();
  if (server) server.close();
  clearTimeout(HARD);
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fails.length) console.log('failed:\n  ' + fails.join('\n  '));
  process.exit(fail ? 1 : 0);
})();
