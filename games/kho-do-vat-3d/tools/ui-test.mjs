// UI smoke test: phone + desktop widths, click a prop to inspect, open a door param, quality toggle.
// Writes shots/ui-*.png; prints console errors. usage: node tools/ui-test.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PW = 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright-core/index.js';
const pwMod = await import('file:///' + PW); const chromium = pwMod.chromium || pwMod.default.chromium;
const port = 9100 + Math.floor(Math.random() * 90);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const killer = setTimeout(() => { console.error('ui-test: timeout'); process.exit(2); }, 150000);
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(ROOT, u === '/' ? 'index.html' : u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(port);
const errors = []; let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11'] });
  for (const [name, vp] of [['phone', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ['desktop', { width: 1440, height: 860 }]]) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor || 1, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch });
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${name}] ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`[${name}] pageerror ${e.message}`));
    await page.goto(`http://127.0.0.1:${port}/index.html`);
    await page.waitForFunction(() => window.SP && window.SP.ready, null, { timeout: 60000 });
    await page.waitForTimeout(800);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    if (sw > vp.width) errors.push(`[${name}] horizontal overflow ${sw}px`);
    await page.screenshot({ path: path.join(ROOT, 'shots', `ui-${name}-sheet.png`) });
    await page.evaluate(() => window.SP.inspect('lockers_triple', 2, { doors: 0.8 }));
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(ROOT, 'shots', `ui-${name}-inspect.png`) });
    await page.click('#back'); await page.click('#q'); await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(ROOT, 'shots', `ui-${name}-low.png`) });
    const stats = await page.textContent('#stats'); console.log(name, 'low quality:', stats);
    await page.close();
  }
} catch (e) { errors.push('ui-test failed: ' + e.message); }
finally { if (browser) await browser.close(); server.close(); clearTimeout(killer); }
console.log(errors.length ? 'ISSUES:\n' + errors.join('\n') : 'console: 0 errors/warnings, no overflow');
process.exit(0);
