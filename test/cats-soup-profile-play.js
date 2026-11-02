#!/usr/bin/env node
/* Mèo & Súp profile feature in a real browser: the profile window (nickname, introduction, picture, frame, title), the
 * photo mode (HUD hidden, sticker, frame, shutter, PNG download) and that no feature view fails.
 *   node test/cats-soup-profile-play.js
 *   CS_URL=https://.../games/cats-soup/index.html node test/cats-soup-profile-play.js
 * Screenshots: shots/cats-soup-profile-play/*.png */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots', 'cats-soup-profile-play');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.css': 'text/css', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml' };
let pass = 0, fail = 0;
const check = (name, ok, detail) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); ok ? pass++ : fail++; };

function serve() {
  return new Promise(res => {
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
  const srv = process.env.CS_URL ? null : await serve();
  const url = process.env.CS_URL || `http://localhost:${srv.address().port}/games/cats-soup/index.html`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 540, height: 960 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = n => page.screenshot({ path: path.join(SHOTS, `${n}.png`) });
  const prof = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__game.state.profile)));

  await page.goto(`${url}?fresh&speed=1`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  check('profile view mounted, no failed feature', await page.evaluate(() => !!window.__profileView && window.__failed().length === 0));
  await page.evaluate(() => { window.__game.state.profile.maxCats = 20; });

  // ---- profile window ----
  await page.locator('[data-n="set_userProfileSlot"] .w').first().click({ force: true });
  await page.waitForTimeout(500);
  check('tapping the profile slot opens the window', await page.locator('.pf-card').count() === 1);
  await shot('01-profile');
  await page.locator('.pf-nick').fill('Mèo Vàng');
  await page.locator('.pf-nick-ok').click();
  check('nickname is stored', (await prof()).nick === 'Mèo Vàng', (await prof()).nick);
  await page.locator('.pf-intro').fill('Xin chào khu rừng');
  await page.locator('.pf-intro-ok').click();
  check('introduction is stored', (await prof()).intro === 'Xin chào khu rừng');
  await page.locator('.pf-cell[data-idx="3"]').click();
  check('an owned picture is chosen (cat2 needs 4 cats, 20 reached)', (await prof()).image === 3);
  await page.locator('.pf-cell[data-idx="60"]').click();
  check('a locked picture stays unchosen', (await prof()).image === 3);
  await page.locator('.pf-tab').nth(1).click();
  await page.locator('.pf-cell[data-idx="1"]').click();
  check('outline 1 is chosen (15 cats)', (await prof()).frame === 1);
  await page.locator('.pf-tab').nth(2).click();
  await page.waitForTimeout(200);
  await shot('02-titles');
  await page.locator('.pf-trow[data-idx="3"]').click();
  check('title 3 (20 cats) is chosen', (await prof()).title === 3);
  await page.locator('.pf-trow[data-idx="6"]').click();
  check('title 6 (80 cats) stays locked', (await prof()).title === 3);
  await page.locator('.pf-tab').first().click();
  await shot('03-picker');
  await page.locator('.pf-x').click();
  check('window closes', await page.locator('.pf-card').count() === 0);
  await page.waitForTimeout(700);
  await shot('04-hud-face');

  // ---- via the more menu ----
  await page.locator('[data-n="bt_more"] .w').first().click({ force: true });
  await page.waitForTimeout(500);
  const menuHit = page.locator('.sh-more', { hasText: 'Hồ sơ' });
  check('the more menu lists the profile', await menuHit.count() === 1);
  if (await menuHit.count()) await menuHit.click();
  await page.waitForTimeout(300);
  check('menu entry opens the window', await page.locator('.pf-card').count() === 1);
  await page.locator('.pf-x').click();

  // ---- photo mode ----
  await page.locator('[data-n="bt_screenShot"] .w').first().click({ force: true });
  await page.waitForTimeout(500);
  check('camera button opens photo mode and hides the HUD', await page.locator('.pf-cam').count() === 1 && await page.evaluate(() => document.querySelector('#ui > .root').style.visibility === 'hidden'));
  await page.locator('.pf-tcell[data-idx="0"]').click();
  await page.locator('.pf-tcell[data-idx="2"]').click();
  check('two stickers placed', await page.locator('.pf-sticker').count() === 2);
  await page.locator('.pf-tcell[data-idx="0"]').click();
  check('a duplicate sticker is refused', await page.locator('.pf-sticker').count() === 2);
  const box = await page.locator('.pf-sticker .pf-simg').nth(1).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 - 75, { steps: 6 });
  await page.mouse.up();
  const moved = await page.locator('.pf-sticker .pf-simg').nth(1).boundingBox();
  check('a sticker drags', Math.abs(moved.x - box.x - 40) < 4 && Math.abs(moved.y - box.y + 75) < 4, `${moved.x - box.x}, ${moved.y - box.y}`);
  await page.locator('.pf-camtab[data-tab="frame"]').click();
  await page.locator('.pf-tcell[data-idx="4"]').click();
  check('photo frame 5 applied', await page.locator('.pf-camframe').getAttribute('data-frame') === '4');
  await page.waitForTimeout(400);
  await shot('05-photo-mode');

  await page.evaluate(() => { window.__game.state.profile.mission = 1; });
  const photos0 = (await prof()).photos;
  await page.locator('.pf-shutter').click();
  await page.waitForSelector('.pf-preview', { timeout: 15000 });
  await page.waitForTimeout(400);
  const p = await prof();
  check('the shutter counts a photo and uses up the mission', p.photos === photos0 + 1 && p.mission === 0, JSON.stringify(p));
  const ph = await page.evaluate(() => ({ w: window.__photo.width, h: window.__photo.height, size: window.__photo.size }));
  check('the composed picture has the canvas size and bytes', ph.w > 100 && ph.h > 100 && ph.size > 2000, JSON.stringify(ph));
  const colours = await page.evaluate(() => new Promise(res => {
    const i = new Image();
    i.onload = () => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 64;
      const x = c.getContext('2d'); x.drawImage(i, 0, 0, 64, 64);
      const d = x.getImageData(0, 0, 64, 64).data; const s = new Set();
      for (let k = 0; k < d.length; k += 4) s.add(`${d[k] >> 4},${d[k + 1] >> 4},${d[k + 2] >> 4}`);
      res(s.size);
    };
    i.src = window.__photo.url;
  }));
  check('the picture is not blank', colours > 8, `${colours} colours`);
  await shot('06-preview');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.locator('.pf-save').click()]);
  const file = path.join(SHOTS, 'download.png');
  await dl.saveAs(file);
  const buf = fs.readFileSync(file);
  check('downloaded file is a non-empty PNG', buf.length > 2000 && buf.slice(1, 4).toString() === 'PNG', `${buf.length} bytes ${dl.suggestedFilename()}`);
  await page.locator('.pf-back').click();
  await page.locator('.pf-camclose').click();
  check('closing photo mode brings the HUD back', await page.evaluate(() => document.querySelector('#ui > .root').style.visibility === '') && await page.locator('.pf-cam').count() === 0);

  // ---- persistence ----
  await page.evaluate(() => dispatchEvent(new Event('pagehide')));
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  const after = await prof();
  check('profile survives a reload', after.nick === 'Mèo Vàng' && after.image === 3 && after.frame === 1 && after.title === 3 && after.photos === 1, JSON.stringify(after));
  check('no failed feature views', await page.evaluate(() => window.__failed().length === 0));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`${pass} passed, ${fail} failed`);
  await browser.close();
  if (srv) srv.close();
  process.exit(fail ? 1 : 0);
})();
