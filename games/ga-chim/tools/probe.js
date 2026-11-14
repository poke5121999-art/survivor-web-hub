// Evaluate an expression in a booted game page. Usage: node probe.js "<expr>" [query]
'use strict';
const { serve } = require('../../../tools/thumb-lib.js');
const PW = 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright-core';
(async () => {
  const srv = await serve();
  const br = await require(PW).chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  try {
    const ctx = await br.newContext({ viewport: { width: 640, height: 360 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'probe@test' })); } catch (e) {} });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('pageerror', e.message));
    await page.goto(srv.base + '/games/ga-chim/index.html?q=medium&noaudio=1&autostart=1' + (process.argv[3] || ''));
    await page.waitForFunction('window.__ready === true || window.__fatal', null, { timeout: 120000 });
    await page.addScriptTag({ content: `window.__half = (h) => { const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 31, f = h & 1023; return e === 0 ? s * f * 5.96e-8 : e === 31 ? (f ? NaN : s * Infinity) : s * Math.pow(2, e - 15) * (1 + f / 1024); };
      window.__px = (rt, fx, fy) => { const r = __G.renderer; const x = Math.floor(rt.width * fx), y = Math.floor(rt.height * fy); const b = new Uint16Array(4); r.readRenderTargetPixels(rt, x, y, 1, 1, b); return Array.from(b).map(__half).map((v) => +v.toFixed(4)); };` });
    console.log(JSON.stringify(await page.evaluate(process.argv[2]), null, 1));
  } finally { await br.close(); srv.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
