// Screenshots of named camera shots for visual review.
// Usage: node games/ga-chim/tools/shots.js <outDir> [shot,shot] [q=medium] [extra query]
'use strict';
const path = require('path');
const fs = require('fs');
const { serve } = require('../../../tools/thumb-lib.js');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright-core';
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
const SHOTS = (process.argv[3] || 'yard,alley,flood,platform,shed,boxcar').split(',');
const Q = process.argv[4] || 'medium';
const EXTRA = process.argv[5] || '';
(async () => {
  const srv = await serve();
  const br = await require(PW).chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] });
  const t0 = Date.now();
  try {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'shots@test' })); } catch (e) {} });
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
    page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
    await page.goto(srv.base + `/games/ga-chim/index.html?q=${Q}&noaudio=1&autostart=1${EXTRA}`);
    await page.waitForFunction('window.__ready === true || window.__fatal', null, { timeout: 120000 });
    const fatal = await page.evaluate('window.__fatal || null');
    if (fatal) { console.log('FATAL', fatal); }
    const gl = await page.evaluate(`(() => { const r = __G.renderer; const g = r.getContext(); const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a'; })()`);
    console.log('boot', ((Date.now() - t0) / 1000).toFixed(1) + 's', 'gpu', gl);
    for (const s of SHOTS) {
      await page.evaluate(`(() => { window.__paused = true; __setShot(${JSON.stringify(s)}); __sim(0.4); })()`);
      await page.waitForTimeout(150);
      const ms = await page.evaluate(`(() => { const t = performance.now(); for (let i = 0; i < 5; i++) __sim(1/60); __G.renderer.getContext().finish(); return (performance.now() - t) / 5; })()`);
      await page.screenshot({ path: path.join(OUT, s + '.jpg'), quality: 88 });
      console.log(s, ms.toFixed(1) + ' ms/frame');
    }
    if (logs.length) console.log(logs.slice(0, 30).join('\n'));
  } finally { await br.close(); srv.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
