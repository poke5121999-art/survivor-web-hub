// smoke.js -- kiem chung pipeline that: mo tools/smoke.html qua http local (khong file://) trong
// Chromium headless that (Playwright), bat pageerror/console error, chup anh, doc ket qua window.SMOKE.
//     node smoke.js [http://127.0.0.1:8934]
const path = require('path');
const { chromium } = require('C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');

const BASE = process.argv[2] || 'http://127.0.0.1:8934';
const URL = BASE + '/games/voiddiver/tools/smoke.html';
const SHOT = path.join(__dirname, 'smoke.png');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 980, height: 620 } });
  const errors = [];
  const badResponses = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push('console.error: ' + msg.text()); });
  page.on('response', (res) => { if (res.status() >= 400) badResponses.push(res.status() + ' ' + res.url()); });

  console.log('opening', URL);
  await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('window.SMOKE && window.SMOKE.ready === true', { timeout: 20000 }).catch((e) => {
    errors.push('timeout waiting SMOKE.ready: ' + e.message);
  });
  await page.waitForTimeout(600); // vai khung de spine cap nhat pose
  await page.screenshot({ path: SHOT });

  const smoke = await page.evaluate(() => {
    const s = window.SMOKE || {};
    const out = {};
    for (const k in s) if (!k.startsWith('_')) out[k] = s[k];
    return out;
  });
  await browser.close();

  console.log('--- SMOKE result ---');
  console.log(JSON.stringify(smoke, null, 1));
  console.log('--- console/page errors ---');
  errors.forEach((e) => console.log(' ', e));
  console.log('--- responses >= 400 ---');
  badResponses.forEach((e) => console.log(' ', e));
  console.log('screenshot ->', SHOT);

  const ok = smoke && smoke.ready && smoke.fengariOk && smoke.sectorOk && smoke.spineOk &&
    errors.length === 0 && badResponses.length === 0;
  console.log(ok ? 'SMOKE OK' : 'SMOKE FAIL');
  process.exit(ok ? 0 : 1);
})();
