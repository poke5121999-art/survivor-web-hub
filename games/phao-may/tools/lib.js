// Shared helpers for the Pháo Mây browser tools: local server, headless Chrome, page open with a member session.
'use strict';
const path = require('path');
const fs = require('fs');
const { serve } = require('../../../tools/thumb-lib.js');
const PW = process.env.PLAYWRIGHT_PATH || path.join(process.env.HOME, '.cache/pw-node/node_modules/playwright-core');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const CHK = path.join(ROOT, '.chk');

function launch() {
  // PM_GL=gl-egl uses the hardware GPU when the box has one; the default is the software renderer every machine has.
  const gl = process.env.PM_GL || 'swiftshader';
  return require(PW).chromium.launch({ args: ['--use-gl=angle', '--use-angle=' + gl, '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
}

// query: URL params without the leading '?'. Returns { page, problems, close }.
async function open(br, base, query, viewport) {
  const vp = viewport || { width: 1280, height: 720 };
  const ctx = await br.newContext({ viewport: vp, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'smoke@test' })); } catch (e) {} });
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('response', (r) => { if (r.status() >= 400) problems.push('http ' + r.status() + ': ' + r.url()); });
  await page.goto(base + '/games/phao-may/index.html?' + query);
  await page.waitForFunction('window.__ready === true || (document.getElementById("fatal") && document.getElementById("fatal").style.display === "block")', null, { timeout: 180000 });
  return { page, problems, close: () => ctx.close() };
}

async function session(fn) {
  const remote = process.env.PM_BASE;
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

module.exports = { launch, open, session, checker, ROOT, CHK, fs, path };
