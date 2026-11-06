// Walk the full game: menu -> map -> equip -> battle -> result, plus upgrade & gacha.
// Screenshots each screen and asserts the loop reaches a WIN/LOSE result.
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
const shot = (page, name) => page.screenshot({ path: path.join(__dirname, 'shot_' + name + '.png') });

(async () => {
  let url = BASE, srv;
  if (!url) { srv = serve(ROOT); await new Promise(r => srv.listen(0, r)); url = `http://localhost:${srv.address().port}/index.html`; }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
  page.on('pageerror', e => console.log('[ERR]', e.message));
  let fail = false;
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById('loading').style.display === 'none', { timeout: 15000 });

  // MENU
  await page.waitForTimeout(300); await shot(page, '1menu');
  const owned = await page.evaluate(() => document.getElementById('m-owned').textContent);
  console.log('owned cats:', owned);

  // GACHA (roll once)
  await page.click('#go-gacha'); await page.waitForTimeout(300);
  await page.click('#g-roll'); await page.waitForTimeout(500); await shot(page, '2gacha');
  await page.click('#g-back');

  // UPGRADE (level first cat + base)
  await page.click('#go-upgrade'); await page.waitForTimeout(400);
  await page.evaluate(() => { const b = document.querySelector('#up-cats .upbtn:not(:disabled)'); if (b) b.click(); });
  await page.waitForTimeout(200); await shot(page, '3upgrade');
  await page.click('#up-back');

  // MAP
  await page.click('#go-play'); await page.waitForTimeout(300); await shot(page, '4map');

  // EQUIP (first stage)
  await page.evaluate(() => { const s = document.querySelector('#map-list .stage:not(.locked)'); s.click(); });
  await page.waitForTimeout(500);
  await page.evaluate(() => { document.querySelectorAll('#eq-cats .eqcard:not(.on)').forEach(c => c.click()); });
  await page.waitForTimeout(200); await shot(page, '5equip');
  const cnt = await page.evaluate(() => document.getElementById('eq-count').textContent);
  console.log('lineup:', cnt);

  // BATTLE
  await page.click('#eq-start');
  await page.waitForFunction(() => document.getElementById('bt-load').style.display === 'none', { timeout: 15000 });
  // autoplay to a result
  let over = null;
  for (let i = 0; i < 120; i++) {
    over = await page.evaluate(() => {
      const w = document.getElementById('worker'); if (w && !w.disabled) w.click();
      document.querySelectorAll('.catbtn').forEach(b => { if (!b.disabled) b.click(); });
      const c = document.getElementById('cannon'); if (c && !c.disabled && Math.random() < 0.3) c.click();
      return document.getElementById('bt-overlay').style.display === 'flex'
        ? document.getElementById('bt-result').textContent : null;
    });
    if (i === 18) await shot(page, '6battle');   // mid-fight, after deploys + spawns
    if (over) break;
    await page.waitForTimeout(350);
  }
  await page.waitForTimeout(300); await shot(page, '7result');
  const stat = await page.evaluate(() => { const s = window.__sim; return s ? { eBase: Math.round(s.enemyBaseHp), eMax: s.enemyBaseMax, cBase: Math.round(s.catBaseHp), cMax: s.catBaseMax, frame: s.frame } : null; });
  console.log('battle result:', over, 'stats:', JSON.stringify(stat));
  if (!over) { console.log('FAIL: battle never resolved'); fail = true; }

  await browser.close(); if (srv) srv.close();
  console.log(fail ? '\nFLOW FAILED' : '\nFLOW OK');
  process.exit(fail ? 1 : 0);
})();
