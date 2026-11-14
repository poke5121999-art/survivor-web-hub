// Shared helpers for the browser tools: local static server, headless Chrome, page open with a hub member session.
// DTT_BASE=<url> runs against a deployed hub. DTT_GL=gl-egl uses the hardware GPU; the default is the software renderer.
'use strict';
const path = require('path');
const fs = require('fs');
const { serve } = require('../../../tools/thumb-lib.js');
const PW = process.env.PLAYWRIGHT_PATH || path.join(process.env.HOME, '.cache/pw-node/node_modules/playwright-core');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const CHK = path.join(ROOT, '.chk');
const GAME = '/games/dau-truong-thep/index.html';

// One Chrome at a time on this shared box: every tool waits for the lock file, which names the PID that holds it.
const LOCK = path.join(CHK, '.chrome.lock');
async function lockChrome() {
  fs.mkdirSync(CHK, { recursive: true });
  for (;;) {
    try { fs.writeFileSync(LOCK, String(process.pid), { flag: 'wx' }); break; } catch (e) {
      let holder = 0; try { holder = Number(fs.readFileSync(LOCK, 'utf8')); } catch (e2) {}
      let alive = holder === process.pid; if (!alive && holder) { try { process.kill(holder, 0); alive = true; } catch (e3) {} }
      if (holder === process.pid) break;
      if (!alive) { try { fs.unlinkSync(LOCK); } catch (e4) {} continue; }
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  const free = () => { try { if (Number(fs.readFileSync(LOCK, 'utf8')) === process.pid) fs.unlinkSync(LOCK); } catch (e) {} };
  process.on('exit', free);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { free(); process.exit(1); });
}

async function launch() {
  await lockChrome();
  const gl = process.env.DTT_GL || 'swiftshader';
  return require(PW).chromium.launch({ args: ['--use-gl=angle', '--use-angle=' + gl, '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
}

// query: URL params without the leading '?'. opts: { viewport, touch }. Returns { page, problems, close }.
async function open(br, base, query, opts = {}) {
  const ctx = await br.newContext({ viewport: opts.viewport || { width: 1280, height: 720 }, deviceScaleFactor: 1, hasTouch: !!opts.touch, isMobile: !!opts.touch });
  await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'smoke@test' })); } catch (e) {} });
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('response', (r) => { if (r.status() >= 400) problems.push('http ' + r.status() + ': ' + r.url()); });
  await page.goto(base + GAME + '?' + query);
  await page.waitForFunction('window.__ready === true || (document.getElementById("fatal") && document.getElementById("fatal").style.display === "block")', null, { timeout: 180000 });
  // The boot curtain fades over 0.5 s; screenshots must not wait for it.
  await page.evaluate(() => { const b = document.getElementById('boot'); if (b) b.style.display = 'none'; });
  return { page, problems, close: () => ctx.close() };
}

async function session(fn) {
  const remote = process.env.DTT_BASE;
  const srv = remote ? { base: remote, close() {} } : await serve();
  const br = await launch();
  try { return await fn(br, srv.base); } finally { await br.close(); srv.close(); }
}

function checker() {
  const fails = [];
  const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
  check.done = () => { console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS'); process.exit(fails.length ? 1 : 0); };
  return check;
}

module.exports = { lockChrome, launch, open, session, checker, ROOT, CHK, fs, path };
