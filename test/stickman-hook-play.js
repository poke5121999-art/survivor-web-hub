#!/usr/bin/env node
/* Stickman Hook (games/stickman-hook) in a real browser: loads light, hooks, finishes level 1, moves on to level 2,
 * and the level list opens. Screenshots go to SH_SHOTS (default shots/stickman-hook).
 *   node test/stickman-hook-play.js
 *   SH_URL=https://poke5121999-art.github.io/survivor-web-hub/games/stickman-hook/index.html node test/stickman-hook-play.js
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.SH_SHOTS || path.join(ROOT, 'shots', 'stickman-hook');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp',
  '.png': 'image/png', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml' };
let pass = 0, fail = 0;
const check = (name, ok, detail) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); ok ? pass++ : fail++; };

function serve() {
  return new Promise((res) => {
    const srv = http.createServer((q, s) => {
      const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
      fs.readFile(f, (e, b) => {
        if (e) { s.writeHead(404); s.end(); return; }
        s.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
        s.end(b);
      });
    }).listen(0, () => res(srv));
  });
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = process.env.SH_URL ? null : await serve();
  const url = process.env.SH_URL || `http://localhost:${srv.address().port}/games/stickman-hook/index.html`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => { try { localStorage.removeItem('stickman-hook'); } catch { /* fresh start */ } });
  const t0 = Date.now();
  await page.goto(url + (url.includes('?') ? '&' : '?') + 'level=1');
  await page.waitForFunction(() => window.__sh && window.__sh.world, null, { timeout: 30000 });
  const loadMs = Date.now() - t0;
  check('game is up within 10 s', loadMs < 10000, `${loadMs} ms`);
  await page.waitForTimeout(300);
  // bytes on the wire (gzip on Pages, raw locally), page included
  const kb = await page.evaluate(() => Math.round(performance.getEntriesByType('resource').concat(performance.getEntriesByType('navigation'))
    .reduce((s, e) => s + (e.transferSize || e.encodedBodySize || 0), 0) / 1024));
  check('download under 600 KB', kb > 50 && kb < 600, `${kb} KB`);
  check('level 1 is Solo1 with one target', await page.evaluate(() => window.__sh.world.names.join() === 'Solo1' && window.__sh.world.targets.length === 1));

  const painted = await page.evaluate(() => {
    const c = document.getElementById('cv'), g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let dark = 0;
    for (let i = 0; i < d.length; i += 4 * 97) if (d[i] + d[i + 1] + d[i + 2] < 120) dark++;
    return dark;
  });
  check('level art is drawn (dark outlines on screen)', painted > 50, `${painted} dark samples`);

  await page.waitForFunction(() => window.__sh.game.phase === 'play', null, { timeout: 5000 });
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(150);
  const hooked = await page.evaluate(() => window.__sh.player.hooked);
  check('pressing hooks the nearest target', hooked === 0, `hooked ${hooked}`);
  await page.waitForTimeout(1100);
  await page.screenshot({ path: path.join(SHOTS, 'swing.png') });
  await page.mouse.up({ button: 'left' });
  await page.waitForFunction(() => window.__sh.game.phase === 'finish', null, { timeout: 8000 }).catch(() => {});
  check('swinging past the checker line finishes level 1', await page.evaluate(() => window.__sh.game.phase === 'finish'));
  await page.waitForTimeout(1300);
  await page.screenshot({ path: path.join(SHOTS, 'finish.png') });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('stickman-hook') || '{}'));
  check('progress saved (best level 1)', saved.best === 1, JSON.stringify(saved));

  await page.mouse.click(195, 500);
  await page.waitForTimeout(300);
  check('tap after finishing opens level 2', await page.evaluate(() => window.__sh.world.index === 1 && window.__sh.world.names.join() === 'Solo2'));

  await page.click('#btnLevels');
  await page.waitForTimeout(200);
  const grid = await page.evaluate(() => ({ n: document.querySelectorAll('#grid button').length,
    open: [...document.querySelectorAll('#grid button')].filter((b) => !b.disabled).length }));
  check('level list shows 64 levels, 2 unlocked', grid.n === 64 && grid.open === 2, JSON.stringify(grid));
  await page.screenshot({ path: path.join(SHOTS, 'levels.png') });
  await page.click('#btnClose');

  await page.evaluate(() => window.__sh.startLevel(64));
  check('level 65 is the seeded random level', await page.evaluate(() => window.__sh.world.names.join('+') === 'STARTU005+MIDDLE006+FINISH05'));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SHOTS, 'level65.png') });

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  srv?.close();
  console.log(`\n${pass} pass, ${fail} fail   shots: ${SHOTS}`);
  process.exit(fail ? 1 : 0);
})();
