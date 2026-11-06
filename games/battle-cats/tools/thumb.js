/*
 * Card thumbnail for Battle Cats: drive into a live battle, capture a combat
 * frame at 1280x720, resize to 640x360. Landscape game, so no blur bars.
 *   node games/battle-cats/tools/thumb.js
 * PLAYWRIGHT_PATH overrides the playwright module path.
 */
'use strict';
const path = require('path'), fs = require('fs'), http = require('http');
const { execFileSync } = require('child_process');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const PY = process.env.PYTHON || 'python';
const ROOT = path.resolve(__dirname, '..', '..', '..');   // survivor-web-hub

function serve(dir) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
  return http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const fp = path.join(dir, p === '/' ? 'index.html' : p);
    if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(fp)] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
  });
}

(async () => {
  const GAME = path.resolve(__dirname, '..');
  const srv = serve(GAME); await new Promise(r => srv.listen(0, r));
  const url = `http://localhost:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById('loading').style.display === 'none', { timeout: 15000 });
  await page.click('#go-play'); await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('#map-list .stage:not(.locked)').click());
  await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelectorAll('#eq-cats .eqcard:not(.on)').forEach(c => c.click()));
  await page.click('#eq-start');
  await page.waitForFunction(() => document.getElementById('bt-load').style.display === 'none', { timeout: 15000 });
  // autoplay until there are both cats and enemies on screen for a lively frame
  for (let i = 0; i < 40; i++) {
    const good = await page.evaluate(() => {
      const w = document.getElementById('worker'); if (w && !w.disabled) w.click();
      document.querySelectorAll('.catbtn').forEach(b => { if (!b.disabled) b.click(); });
      const s = window.__sim; if (!s) return false;
      const cats = s.units.filter(u => u.side === 'cat').length;
      const ens = s.units.filter(u => u.side === 'enemy').length;
      return cats >= 2 && ens >= 1 && !s.over;
    });
    if (good) { await page.waitForTimeout(250); break; }
    await page.waitForTimeout(300);
  }
  const out = path.join(ROOT, 'assets', 'thumbnails', 'battle-cats.png');
  const raw = out.replace(/\.png$/, '.raw.png');
  await page.screenshot({ path: raw });
  execFileSync(PY, ['-c',
    'import sys\nfrom PIL import Image\nImage.open(sys.argv[1]).convert("RGB").resize((640,360),Image.LANCZOS).save(sys.argv[2],optimize=True)',
    raw, out]);
  fs.unlinkSync(raw);
  await browser.close(); srv.close();
  console.log('thumb ->', out);
})();
