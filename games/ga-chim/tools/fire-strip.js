// Fires a burst and captures frames at 25 fps into one contact sheet, to compare with Saltline's fire25.jpg.
// Usage: node tools/fire-strip.js <outDir> [shot=gun] [frames=30] [query]
'use strict';
const path = require('path'); const fs = require('fs');
const { serve } = require('../../../tools/thumb-lib.js');
const PW = 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright-core';
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
const SHOT = process.argv[3] || 'gun', N = +(process.argv[4] || 30), Q = process.argv[5] || '';
(async () => {
  const srv = await serve();
  const br = await require(PW).chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  try {
    const ctx = await br.newContext({ viewport: { width: 960, height: 540 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'fire@test' })); } catch (e) {} });
    const page = await ctx.newPage(); const logs = [];
    page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
    await page.goto(srv.base + '/games/ga-chim/index.html?q=medium&noaudio=1&autostart=1&shot=1' + Q);
    await page.waitForFunction('window.__ready === true || window.__fatal', null, { timeout: 120000 });
    await page.evaluate(`(() => { window.__paused = true; __setShot(${JSON.stringify(SHOT)}); __sim(1.0); })()`);
    const shots = [];
    for (let i = 0; i < N; i++) {
      await page.evaluate((i) => { __G.player.mouse.l = i >= 6 && i < 22; for (let k = 0; k < 2; k++) __sim(1 / 50); }, i);
      const f = path.join(OUT, 'f' + String(i).padStart(2, '0') + '.jpg');
      await page.screenshot({ path: f, quality: 85 }); shots.push(f);
    }
    const st = await page.evaluate('({ ammo: __G.weapon.ammo, errors: __G.errors })');
    console.log(JSON.stringify(st));
    if (logs.length) console.log(logs.slice(0, 10).join('\n'));
  } finally { await br.close(); srv.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
