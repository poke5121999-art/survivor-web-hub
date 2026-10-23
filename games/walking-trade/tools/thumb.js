#!/usr/bin/env node
// Ảnh thẻ hub assets/thumbnails/walking-trade.png (640x360): mở game, mở quán, chờ khách vào, chụp vùng quán ở màn dọc x2.
// Dùng: node games/walking-trade/tools/thumb.js   (cần Python có PIL để thu ảnh)
'use strict';
const path = require('path');
const http = require('http');
const fs = require('fs');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../../..');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const OUT = path.join(ROOT, 'assets/thumbnails/walking-trade.png');

const srv = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

srv.listen(0, '127.0.0.1', async () => {
  const { chromium } = require(PW);
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  await page.goto(`http://127.0.0.1:${srv.address().port}/games/walking-trade/index.html`);
  await page.waitForFunction(() => window.__twt && window.__twt.phase === 'Morning', null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  const b = await page.evaluate(() => window.__twt.buttons.find((x) => x.id === 'open'));
  const s = await page.evaluate(() => window.__twt.screen);
  const x = (b.x + b.w / 2) * (390 / s[0]), y = 844 - (b.y + b.h / 2) * (844 / s[1]);
  await page.mouse.move(x, y);
  await page.waitForTimeout(100);
  await page.mouse.click(x, y);
  await page.waitForFunction(() => window.__twt.customers >= 2, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const tmp = OUT + '.raw.png';
  // Cột giao diện 720x1280 co về 390 px rộng, nằm giữa theo chiều dọc: HUD và sàn quán ở 75..294 px.
  await page.screenshot({ path: tmp, clip: { x: 0, y: 75, width: 390, height: 219 } });
  execFileSync('python', ['-c', `from PIL import Image; Image.open(r'${tmp}').convert('RGB').resize((640, 360), Image.LANCZOS).save(r'${OUT}')`]);
  fs.unlinkSync(tmp);
  console.log('wrote ' + OUT);
  await br.close();
  srv.close();
});
