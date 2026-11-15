// Quick look: open index.html with a query, wait for the grid (or an inspect view), screenshot, print stats + console errors.
// Usage: node tools/peek.js "<query>" out.png [w=1400] [h=900] [waitMs=1500]
'use strict';
const path = require('path');
const PW = process.env.PW || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright-core';
const { chromium } = require(PW);
const [q = '', out = 'peek.png', w = 1400, h = 900, wait = 1500] = process.argv.slice(2);
const kill = setTimeout(() => { console.log('TIMEOUT'); process.exit(3); }, 240000);
(async () => {
  const srv = require('child_process').spawn(process.execPath, [path.join(__dirname, 'serve.js'), '8791', '230'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 400));
  const br = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  try {
    const page = await br.newPage({ viewport: { width: +w, height: +h } }); const errs = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message + '\n' + e.stack));
    const t0 = Date.now();
    await page.goto('http://127.0.0.1:8791/index.html' + q, { timeout: 60000 });
    await page.waitForFunction('window.__vc && (window.__vc.ready() || window.__vc.cur())', null, { timeout: 180000 });
    console.log('ready after', Date.now() - t0, 'ms');
    await page.waitForTimeout(+wait);
    await page.screenshot({ path: out });
    console.log(JSON.stringify(await page.evaluate(() => window.__stats)));
    console.log(await page.evaluate(() => document.getElementById('istat').textContent));
    console.log(errs.join('\n') || 'no console errors');
  } finally { await br.close(); srv.kill(); clearTimeout(kill); }
})().catch((e) => { console.error(e); process.exit(1); });
