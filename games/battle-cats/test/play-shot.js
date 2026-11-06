// Launch the game, auto-play a bit, screenshot the battlefield.
const path = require('path'), http = require('http'), fs = require('fs');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.join(__dirname, '..');
const BASE = process.env.BC_URL || null;

function serve(dir) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
  return http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    let fp = path.join(dir, p === '/' ? 'index.html' : p);
    if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(fp)] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
  });
}

(async () => {
  let url = BASE, srv;
  if (!url) { srv = serve(ROOT); await new Promise(r => srv.listen(0, r)); url = `http://localhost:${srv.address().port}/index.html`; }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 520 } });
  page.on('console', m => console.log('[page]', m.text()));
  page.on('pageerror', e => console.log('[ERR]', e.message));
  await page.goto(url);
  await page.waitForFunction(() => !document.getElementById('loading') || document.getElementById('loading').style.display === 'none', { timeout: 15000 }).catch(() => console.log('loading did not clear'));
  // auto-play: spam deploy buttons + worker for a few seconds
  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => {
      const w = document.getElementById('worker'); if (w && !w.disabled) w.click();
      document.querySelectorAll('.catbtn').forEach(b => { if (!b.disabled) b.click(); });
      const c = document.getElementById('cannon'); if (c && !c.disabled && Math.random() < 0.2) c.click();
    });
    await page.waitForTimeout(400);
  }
  const out = path.join(__dirname, 'play_shot.png');
  await page.screenshot({ path: out });
  const state = await page.evaluate(() => {
    return { title: document.title };
  });
  console.log('shot', out, JSON.stringify(state));
  await browser.close(); if (srv) srv.close();
})();
