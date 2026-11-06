#!/usr/bin/env node
/* Mèo & Súp missions in a real browser: the HUD quest button opens the panel, selling dishes fills a daily mission whose
 * claim pays its ticket, the quest and attendance tabs draw, attendance pays day 1, claims survive a reload, and the
 * red dot follows what is claimable.
 *   node test/cats-soup-missions-play.js
 *   CS_URL=https://poke5121999-art.github.io/survivor-web-hub/games/cats-soup/index.html node test/cats-soup-missions-play.js
 * Screenshots: shots/cats-soup-missions/*.png */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots', 'cats-soup-missions');
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
  const page = await browser.newPage({ viewport: { width: 450, height: 800 } });
  const errors = [];
  page.on('pageerror', e => { errors.push(String(e)); if (process.env.CS_STACK) console.log(e.stack); });
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = n => page.screenshot({ path: path.join(SHOTS, `${n}.png`) });
  const M = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__game.state.missions)));
  const rows = () => page.locator('.panel .row').count();
  const dot = () => page.locator('.qdot').evaluate(e => getComputedStyle(e).display);

  await page.goto(`${url}?fresh&speed=1`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  let m = await M();
  check('fresh state has today and one attendance day waiting', !!m.day && m.attend.avail === 1, `${m.day} avail ${m.attend.avail}`);
  await page.waitForTimeout(800);
  check('red dot shows (attendance can be claimed)', await dot() === 'block');

  await page.locator('[data-n="bt_quest"] .w').first().click();
  await page.waitForTimeout(500);
  await shot('01-daily');
  check('panel opens with 3 missions + the all-clear card', await rows() === 4, `${await rows()} rows`);
  check('panel title is the original "Hôm nay phải làm"', (await page.locator('.panel h1').textContent()) === 'Hôm nay phải làm');

  // Sell 10 dishes through the sim: mission 9 (sell 10) completes, its claim button turns on.
  await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 10; i++) g.sellItem({ a: 0, p: { f: 1, e: 2 }, c: false }); });
  await page.locator('.panel .close').click();
  await page.locator('[data-n="bt_quest"] .w').first().click();
  await page.waitForTimeout(400);
  const claim = page.locator('.panel .row.mis:not(.clear) .price:not(.off)');
  check('one mission is claimable after 10 sells', await claim.count() === 1, `${await claim.count()}`);
  await claim.first().click();
  await page.waitForTimeout(400);
  await shot('02-claimed');
  m = await M();
  const tk = await page.evaluate(() => window.__game.state.specials.tickets[1101]);
  check('claim stored the 1101 gold ticket and marked it claimed', m.daily[9][0] === 1 && tk === 1, JSON.stringify(m.daily[9]) + ` tickets ${tk}`);
  check('mission 0 shows 10/50', m.daily[0][1] === 10);

  // Quests tab
  await page.locator('.panel .tabs div').nth(1).click();
  await page.waitForTimeout(300);
  await shot('03-quests');
  check('quest tab lists 21 rows', await rows() === 21, `${await rows()}`);
  await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 40; i++) g.sellItem({ a: 0, p: { f: 1, e: 2 }, c: false }); });
  await page.locator('.panel .tabs div').nth(0).click();
  await page.locator('.panel .tabs div').nth(1).click();
  const gem0 = await page.evaluate(() => window.__game.state.gem);
  await page.locator('.panel .row .price:not(.off)').first().click();
  await page.waitForTimeout(300);
  const q0 = await page.evaluate(() => ({ lv: window.__game.state.missions.quest[0][0], gem: window.__game.state.gem }));
  check('quest 0 (sell 50) claim: level 1 and +10 gems', q0.lv === 1 && q0.gem === gem0 + 10, JSON.stringify(q0));
  await shot('04-quest-claimed');

  // Attendance tab
  await page.locator('.panel .tabs div').nth(2).click();
  await page.waitForTimeout(300);
  await shot('05-attend');
  check('attendance grid has 28 days', await page.locator('.attend .day').count() === 28);
  await page.locator('.attend .day.next.ready').click();
  await page.waitForTimeout(300);
  m = await M();
  check('day 1 paid 200 play points (held) and advanced the cursor', m.attend.next === 1 && m.bag[99] === 200, JSON.stringify(m.attend) + JSON.stringify(m.bag));
  await shot('06-attend-claimed');
  await page.locator('.panel .close').click();

  // Reload keeps claims
  await page.evaluate(() => dispatchEvent(new Event('pagehide')));
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  m = await M();
  check('reload keeps the claimed mission, the quest level and the attendance cursor', m.daily[9][0] === 1 && m.quest[0][0] === 1 && m.attend.next === 1, JSON.stringify([m.daily[9], m.quest[0], m.attend]));
  await page.waitForTimeout(700);
  await shot('07-reload-hud');

  // New day: roll the saved day back, reload, the dailies reset and a login day is added.
  await page.evaluate(() => { const g = window.__game; g.state.missions.day = '2000-01-01'; });
  await page.evaluate(() => dispatchEvent(new Event('pagehide')));
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  m = await M();
  check('a new date resets the dailies and adds an attendance day', Object.values(m.daily).every(d => d[0] === 0 && d[1] === 0) && m.attend.avail === 1 && m.clear.picks.length === 3, JSON.stringify([m.daily, m.attend]));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`${pass} passed, ${fail} failed`);
  await browser.close();
  if (srv) srv.close();
  process.exit(fail ? 1 : 0);
})();
