// View smoke test: node test/view-smoke.js   (from games/steal-egg; run heavy through ~/handoff/heavy.sh)
// Serves games/steal-egg with a case-sensitive static server on a free port, drives headless Chromium on the GPU, and
// checks: no console errors, every module URL carries ?v=, blur reaches 0, W moves the player and the camera follows,
// a touch drag on the joystick moves the player (CDP Input.dispatchTouchEvent), a touch drag on the free screen turns
// the camera, HUD buttons are hit at their centres, the frame is neither washed out nor black. Screenshots go to
// ~/stealegg-ref/shots/view-<size>.png.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('/home/bui-thanh-thuong/.cache/pw-node/node_modules/playwright-core');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(process.env.HOME, 'stealegg-ref', 'shots');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp',
  '.png': 'image/png', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml' };
const SIZES = [
  { name: '1280x720', viewport: { width: 1280, height: 720 }, dpr: 1 },
  { name: '2756x1268', viewport: { width: 2756, height: 1268 }, dpr: 1 },
  { name: '919x423@3', viewport: { width: 919, height: 423 }, dpr: 3 },
  { name: '1268x2756-portrait', viewport: { width: 1268, height: 2756 }, dpr: 1 },
];
const BUTTONS = ['InGame/JoyStick', 'InGame/JumpBtn', 'InGame/Attack', 'InGame/ShopButton', 'InGame/TopPanel/Pause',
  'InGame/TopPanel/Coins', 'InGame/TopPanel/Setting'];

// Case-sensitive: the path must match a directory entry exactly, like GitHub Pages.
function exactExists(file) {
  const rel = path.relative(ROOT, file);
  if (rel.startsWith('..')) return false;
  let dir = ROOT;
  for (const part of rel.split(path.sep)) {
    if (!fs.existsSync(dir) || !fs.readdirSync(dir).includes(part)) return false;
    dir = path.join(dir, part);
  }
  return fs.statSync(dir).isFile();
}

function serve() {
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(ROOT, u.endsWith('/') ? `${u}index.html` : u);
    if (!exactExists(file)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

let browser = null, server = null;
const results = [];
const check = (size, name, ok, info = '') => {
  results.push({ size, name, ok, info });
  console.log(`${ok ? 'PASS' : 'FAIL'} [${size}] ${name}${info ? ` - ${info}` : ''}`);
};

async function cleanup() {
  if (browser) { await browser.close().catch(() => {}); browser = null; }
  if (server) { server.close(); server = null; }
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => cleanup().then(() => process.exit(130)));

const playerPos = page => page.evaluate(() => [...window.__game.sim.state.actors[0].pos]);
const camPos = page => page.evaluate(() => window.__game.view.camera.position.toArray());
const dist = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

// Stage point -> client point (the stage is turned 90 degrees in portrait).
const toClient = (page, p) => page.evaluate(([x, y]) => (window.__game.stage.rotated ? [window.innerWidth - y, x] : [x, y]), p);

async function touchDrag(cdp, from, to, holdMs) {
  const pt = ([x, y]) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(from) });
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    const p = [from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(p) });
    await new Promise(r => setTimeout(r, 16));
  }
  const until = Date.now() + holdMs;
  while (Date.now() < until) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt([to[0] + 0.5, to[1]]) });
    await new Promise(r => setTimeout(r, 100));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(to) });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

// Pixel statistics of a freshly drawn frame (read back in the same task, before the buffer is cleared).
const frameStats = page => page.evaluate(() => {
  window.__step(0, true);
  const gl = window.__game.view.renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(4);
  let n = 0, sum = 0, white = 0, black = 0;
  for (let y = 0.05; y < 1; y += 0.05) for (let x = 0.05; x < 1; x += 0.05) {
    gl.readPixels(Math.floor(x * w), Math.floor(y * h), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const l = 0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2];
    n++; sum += l;
    if (Math.min(px[0], px[1], px[2]) > 248) white++;
    if (Math.max(px[0], px[1], px[2]) < 12) black++;
  }
  return { mean: sum / n, white: white / n, black: black / n };
});

async function runSize(base, size) {
  const S = size.name;
  const ctx = await browser.newContext({ viewport: size.viewport, deviceScaleFactor: size.dpr, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [], modules = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => errors.push(`pageerror ${e.message}`));
  page.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
  page.on('request', r => { if (r.resourceType() === 'script' || /\.js(\?|$)/.test(r.url())) modules.push(r.url()); });
  const t0 = Date.now();
  await page.goto(`${base}/index.html?fresh`);
  await page.waitForFunction(() => (window.__game && window.__game.ready && window.__game.blur === 0) || (window.__game && window.__game.error),
    null, { timeout: 180000 });
  const atBlur0 = await page.evaluate(() => window.__game.textures || null);
  // full textures stream in after blur 0 (the game starts on the 16 px ones): wait for them before judging sharpness
  await page.waitForFunction(() => window.__game.error || (window.__game.texturesFull && window.__game.textures.sharp === window.__game.textures.total
    && window.__game.stages.some(s => s[0] === 'full textures')), null, { timeout: 180000 }).catch(() => {});
  const g = await page.evaluate(() => ({ error: window.__game.error, stages: window.__game.stages, tex: window.__game.textures,
    rotated: window.__game.stage.rotated }));
  check(S, 'boot without error', !g.error, g.error || `${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (g.error) { await ctx.close(); return; }
  const blurs = g.stages.filter(s => s[0] !== 'full textures').map(s => s[1]);
  check(S, 'blur 14 -> 8 -> 5 -> 0', JSON.stringify(blurs.filter((b, i) => i === 0 || b !== blurs[i - 1])) === '[14,8,5,0]',
    g.stages.map(s => `${s[0]}:${s[1]}@${s[2]}ms`).join(' '));
  check(S, 'textures sharp eventually (full ones streamed after blur 0)', g.tex.sharp === g.tex.total && g.tex.total > 50,
    `${g.tex.sharp}/${g.tex.total}, at blur 0: ${atBlur0 ? `${atBlur0.sharp}/${atBlur0.total}` : '?'}`);
  const noV = modules.filter(u => !/[?&]v=\d{8}[a-z]/.test(u));
  check(S, 'every module URL has ?v=', modules.length > 5 && !noV.length, `${modules.length} modules${noV.length ? `, missing: ${noV.join(', ')}` : ''}`);
  if (size.viewport.height > size.viewport.width) check(S, 'portrait stage rotated', g.rotated);

  await page.waitForTimeout(500);
  const stats = await frameStats(page);
  check(S, 'frame neither washed out nor black', stats.mean > 50 && stats.mean < 225 && stats.white < 0.25 && stats.black < 0.25,
    `mean ${stats.mean.toFixed(0)}, white ${(stats.white * 100).toFixed(0)}%, black ${(stats.black * 100).toFixed(0)}%`);
  await page.screenshot({ path: path.join(SHOTS, `view-${S}.png`) });

  // HUD buttons: the element at each button's centre belongs to that button.
  const hits = await page.evaluate(paths => paths.map(p => {
    const hud = window.__game.view.hud, r = hud.rect(p), st = window.__game.stage;
    const [cx, cy] = st.rotated ? [window.innerWidth - r.cy, r.cx] : [r.cx, r.cy];
    const el = document.elementFromPoint(cx, cy), own = el && el.closest('[data-path]');
    const inside = r.x >= 0 && r.y >= 0 && r.x + r.w <= st.w + 1 && r.y + r.h <= st.h + 1;
    return { p, got: own ? own.dataset.path.replace('Canvas/', '') : String(el && el.tagName), inside };
  }), BUTTONS);
  const bad = hits.filter(h => !h.got.startsWith(h.p) || !h.inside);
  check(S, 'HUD buttons hit at their centres, on screen', !bad.length, bad.map(h => `${h.p} -> ${h.got}${h.inside ? '' : ' (off screen)'}`).join('; '));
  const coinText = await page.evaluate(() => window.__game.view.hud.node('InGame/TopPanel/Coins/Text (TMP)').textContent);
  const healthText = await page.evaluate(() => window.__game.view.hud.node('InGame/TopPanel/PlayerHealth/Text (TMP)').textContent);
  // coins.FormatNumber of the sim balance (start 1000 -> "1k")
  const coinWant = await page.evaluate(async () => (await import('./js/view/ui.js')).formatCoins(window.__game.sim.state.coins));
  check(S, 'coins bound to state, Vietnamese labels', coinText === coinWant && healthText === 'Máu', `coins "${coinText}" (want "${coinWant}"), health "${healthText}"`);

  // Keyboard: hold W.
  if (!g.rotated) {
    const p0 = await playerPos(page), c0 = await camPos(page);
    await page.keyboard.down('KeyW');
    await page.waitForFunction(p => Math.hypot(window.__game.sim.state.actors[0].pos[0] - p[0], window.__game.sim.state.actors[0].pos[2] - p[2]) > 3,
      p0, { timeout: 20000 }).catch(() => {});
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(300);
    const p1 = await playerPos(page), c1 = await camPos(page);
    const lag = await page.evaluate(() => {
      const c = window.__game.view.camera.position, p = window.__game.view.player.position;
      return Math.hypot(c.x - p.x, c.z - p.z);
    });
    check(S, 'holding W moves the player', dist(p0, p1) > 3, `${dist(p0, p1).toFixed(2)} m`);
    check(S, 'camera follows', dist(c0, c1) > 2 && lag < 3, `camera moved ${dist(c0, c1).toFixed(2)} m, ${lag.toFixed(2)} m from player`);
    await page.screenshot({ path: path.join(SHOTS, `view-${S}-walked.png`) });
  }

  // Touch: joystick pushed up for 1.5 s.
  const cdp = await ctx.newCDPSession(page);
  const jr = await page.evaluate(() => window.__game.view.hud.rect('InGame/JoyStick'));
  const jc = await toClient(page, [jr.cx, jr.cy]), jt = await toClient(page, [jr.cx, jr.cy - jr.h * 0.35]);
  const q0 = await playerPos(page);
  await touchDrag(cdp, jc, jt, 1500);
  await page.waitForTimeout(200);
  const q1 = await playerPos(page);
  const handle = await page.evaluate(() => window.__game.view.input.joy);
  check(S, 'touch joystick moves the player', dist(q0, q1) > 2, `${dist(q0, q1).toFixed(2)} m, joystick released to ${handle}`);

  // A modal panel can be up over the free screen when the drag starts (the joystick walk can end inside a shop area, which
  // opens its panel; the ads break panel opens 60 s of game time into the run, which a slow machine reaches mid-test).
  // Like a player: look at what is under the drag start point and tap that panel's own button until the drag area is
  // what is hit. The loop ends on the game's own state (elementFromPoint), not on a delay.
  const CLOSE = { 'shoes shop': 'Button', 'Bat shop': 'Button', 'ads panel': 'Panel/bottem/Ads', 'ads panel (1)': 'Panel/bottem/Ads' };
  const dragStage = await page.evaluate(() => [window.__game.stage.w * 0.45, window.__game.stage.h * 0.5]);
  const dragPt = await toClient(page, dragStage);
  let covered = null;
  for (let tries = 0; tries < 20; tries++) {
    covered = await page.evaluate(([x, y, close]) => {
      const el = document.elementFromPoint(x, y), own = el && el.closest('[data-path]');
      const top = own && own.dataset.path.replace('Canvas/', '').split('/')[0];
      if (own && own.dataset.path === 'Canvas/InGame/Drag') return { free: true };
      if (!top || !close[top]) return { free: false, what: own ? own.dataset.path : String(el && el.tagName) };
      const r = window.__game.view.hud.node(`${top}/${close[top]}`).getBoundingClientRect();
      return { free: false, what: top, tap: [r.x + r.width / 2, r.y + r.height / 2] };
    }, [dragPt[0], dragPt[1], CLOSE]);
    if (covered.free || !covered.tap) break;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: covered.tap[0], y: covered.tap[1], id: 9 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(100);
  }
  check(S, 'free screen is hit by the drag area before the drag', covered.free, covered.free ? '' : `covered by ${covered.what}`);
  // Touch: drag on the free screen turns the camera (CameraDragArea).
  const yaw0 = await page.evaluate(() => window.__game.view.follow.x);
  const st = await page.evaluate(() => ({ w: window.__game.stage.w, h: window.__game.stage.h }));
  const a = dragPt, b = await toClient(page, [st.w * 0.45 + 60, st.h * 0.5]);
  await touchDrag(cdp, a, b, 0);
  const yaw1 = await page.evaluate(() => window.__game.view.follow.x);
  check(S, 'touch drag turns the camera', Math.abs(yaw1 - yaw0) > 5, `yaw ${yaw0.toFixed(1)} -> ${yaw1.toFixed(1)} deg`);
  await page.screenshot({ path: path.join(SHOTS, `view-${S}-touched.png`) });

  check(S, 'no console errors', !errors.length, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

(async () => {
  try {
    server = await serve();
    const base = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist'] });
    const only = process.argv[2];
    for (const size of SIZES) if (!only || size.name === only) await runSize(base, size);
  } catch (e) {
    console.log('FAIL exception', e.stack || e);
    results.push({ ok: false });
  } finally {
    await cleanup();
  }
  const failed = results.filter(r => !r.ok).length;
  console.log(`${results.length - failed}/${results.length} passed`);
  process.exitCode = failed ? 1 : 0;
})();
