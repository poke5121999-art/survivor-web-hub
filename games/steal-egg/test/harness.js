// Shared browser-test harness: a case-sensitive static server for games/steal-egg on a free port (like GitHub Pages),
// headless Chromium on the GPU (ANGLE over EGL), screenshots under $SHOTS or ~/stealegg-ref/shots, and cleanup of only
// this test's own browser and server, also on failure or a signal. Paths come from __dirname, so any copy of the repo
// runs as is.
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PW = process.env.PW_CORE || path.join(os.homedir(), '.cache/pw-node/node_modules/playwright-core');
const SHOTS = process.env.SHOTS || path.join(os.homedir(), 'stealegg-ref', 'shots');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp',
  '.png': 'image/png', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };

function exactExists(file) {
  const rel = path.relative(ROOT, file);
  if (rel.startsWith('..')) return false;
  let dir = ROOT;
  for (const part of rel.split(path.sep)) {
    if (!part) continue;
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

// run(name, async ({ browser, base, shot, check }) => {...}): prints PASS/FAIL lines, exits 1 on any failure.
function run(name, body) {
  let browser = null, server = null;
  const results = [];
  const check = (what, ok, info = '') => {
    results.push({ what, ok: !!ok, info });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${info !== '' ? ` - ${info}` : ''}`);
    return !!ok;
  };
  const cleanup = async () => {
    if (browser) { const b = browser; browser = null; await b.close().catch(() => {}); }
    if (server) { server.close(); server = null; }
  };
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => cleanup().then(() => process.exit(130)));
  fs.mkdirSync(SHOTS, { recursive: true });
  const shot = (page, file, opts = {}) => page.screenshot({ path: path.join(SHOTS, file), ...opts });
  (async () => {
    const { chromium } = require(PW);
    server = await serve();
    const base = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
    await body({ browser, base, shot, check, SHOTS, ROOT });
  })().catch(e => { console.error(e); check(`${name} ran without exception`, false, String(e && e.message)); })
    .finally(async () => {
      await cleanup();
      const bad = results.filter(r => !r.ok).length;
      console.log(`${name}: ${results.length - bad}/${results.length} passed`);
      process.exit(bad ? 1 : 0);
    });
}

// New page that records console errors, page errors and HTTP >= 400 into `errors`.
async function openPage(browser, url, { viewport = { width: 1280, height: 720 }, dpr = 1, touch = true, init = null } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr, hasTouch: touch });
  if (init) await ctx.addInitScript(init.fn, init.arg);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => errors.push(`pageerror ${e.message}`));
  page.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
  await page.goto(url);
  await page.waitForFunction(() => (window.__game && window.__game.ready && window.__game.blur === 0) || (window.__game && window.__game.error),
    null, { timeout: 180000 });
  const err = await page.evaluate(() => window.__game.error || null);
  if (err) throw new Error(`boot: ${err}`);
  return { ctx, page, errors };
}

// Stage point -> client point (the stage is turned 90 degrees in a portrait window).
const toClient = (page, p) => page.evaluate(([x, y]) => (window.__game.stage.rotated ? [window.innerWidth - y, x] : [x, y]), p);
// Client centre of a HUD node.
async function hudCenter(page, hudPath) {
  const r = await page.evaluate(p => window.__game.view.hud.rect(p), hudPath);
  return toClient(page, [r.cx, r.cy]);
}

module.exports = { run, openPage, toClient, hudCenter, ROOT, SHOTS };
