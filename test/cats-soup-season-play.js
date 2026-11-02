#!/usr/bin/env node
/* Mèo & Súp season events in a real browser: the event box of the HUD, the exchange shop, event missions, the login
 * calendars, the soup pass mini game, play points, the gift menu entry, claims surviving a reload, and a month change.
 *   node test/cats-soup-season-play.js
 *   CS_URL=https://poke5121999-art.github.io/survivor-web-hub/games/cats-soup/index.html node test/cats-soup-season-play.js
 * Screenshots: shots/cats-soup-season/*.png */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots', 'cats-soup-season');
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
  const SS = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__game.state.season)));
  const rows = () => page.locator('.panel .row').count();
  const btn = n => page.locator(`[data-n="${n}"] .w`).first();
  const ready = async () => { await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 }); await page.waitForTimeout(700); };

  await page.goto(`${url}?fresh&speed=1`);
  await ready();
  check('no feature failed to load', (await page.evaluate(() => window.__failed())).length === 0);
  const vis = n => page.locator(`[data-n="${n}"]`).first().evaluate(e => getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden');
  check('event box shows the shop, mission and play-point buttons', (await vis('bt_eventSeason')) && (await vis('bt_eventPass_Season')) && (await vis('bt_playPoint')));
  check('calendars and soup pass stay hidden below 3 cats', !(await vis('bt_eventMain')) && !(await vis('bt_soupPass')));
  await shot('01-hud');
  await btn('bt_eventOpen').click();
  await page.waitForTimeout(700);
  check('bt_eventOpen folds the event box away', !(await vis('bt_eventSeason')) || (await page.locator('[data-n="set_eventBox"]').evaluate(e => getComputedStyle(e).display)) === 'none');
  await btn('bt_eventOpen').click();
  await page.waitForTimeout(700);
  check('and brings it back', await vis('bt_eventSeason'));

  // Exchange shop: give items through the sim, buy a 3x 1201 ticket row (30 items).
  await page.evaluate(() => { window.__game.state.season.items = 100; });
  await btn('bt_eventSeason').click();
  await page.waitForTimeout(500);
  await shot('02-shop');
  const nRows = await rows();
  check('shop lists the 49 rows of season 57 plus a header', nRows === 50, `${nRows} rows`);
  const before = await page.evaluate(() => window.__game.state.specials.tickets[1201] || 0);
  await page.evaluate(() => { const p = [...document.querySelectorAll('.panel .row')].find(r => r.querySelector('.price') && r.querySelector('.price').textContent === '🎁 30'); p.querySelector('.price').click(); });
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({ t: window.__game.state.specials.tickets[1201] || 0, items: window.__game.state.season.items }));
  check('buying row 31 paid 3 tickets and 30 items', after.t - before === 3 && after.items === 70, JSON.stringify(after));
  await page.locator('.panel .close').click();

  // Missions: sell 50 dishes, claim mission 1.
  await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 50; i++) g.sellItem({ a: 0, p: { f: 1, e: 2 }, c: false }); });
  await btn('bt_eventPass_Season').click();
  await page.waitForTimeout(500);
  await shot('03-missions');
  check('mission tab lists 13 missions plus a header', await rows() === 14, `${await rows()}`);
  const pts0 = (await SS()).passPts;
  await page.locator('.panel .row.sn .price:not(.off)').first().click();
  await page.waitForTimeout(300);
  const s1 = await SS();
  check('claim added pass points', s1.passPts > pts0, `${pts0} -> ${s1.passPts}`);
  await page.locator('.panel .tabs div').nth(1).click();
  await page.waitForTimeout(300);
  await shot('04-pass');
  check('pass tab lists 75 levels plus a header', await rows() === 76, `${await rows()}`);
  check('premium column is drawn locked', await page.locator('.panel .prem').count() === 75);
  await page.locator('.panel .close').click();

  // Add cats: calendars and soup pass appear.
  await page.evaluate(() => { const g = window.__game; while (g.state.cats.length < 3) g.state.cats.push({ ...g.state.cats[0], id: 900 + g.state.cats.length }); window.__game.feat.season.refresh(window.__game); });
  await page.waitForTimeout(800);
  check('3 cats unlock the calendars and the soup pass', (await vis('bt_eventMain')) && (await vis('bt_soupPass')) && (await vis('bt_dailyReward_Season')));
  await btn('bt_eventMain').click();
  await page.waitForTimeout(500);
  await shot('05-calendar');
  check('day-group calendar draws 7 cells with day 1 ready', await page.locator('.sn-grid .day').count() === 7 && await page.locator('.sn-grid .day.ready').count() === 1);
  await page.locator('.sn-grid .day.ready').click();
  await page.waitForTimeout(300);
  let s2 = await SS();
  check('day 1 claimed', s2.cal.group.claimed[0] === 1, JSON.stringify(s2.cal.group));
  await page.locator('.panel .tabs div').nth(1).click();
  await page.waitForTimeout(300);
  await shot('06-calendar-season');
  await page.locator('.panel .close').click();

  // Soup pass: level list, mini game round.
  await btn('bt_soupPass').click();
  await page.waitForTimeout(500);
  await shot('07-soup');
  check('soup pass lists 29 levels plus a header', await rows() === 30, `${await rows()}`);
  await page.locator('.panel .tabs div').nth(1).click();
  await page.waitForTimeout(300);
  await page.locator('.panel .row .price').first().click();
  await page.waitForTimeout(300);
  await shot('08-soup-game');
  check('a round shows 3 wanted and 6 offered ingredients', await page.locator('.sn-soup .ing.want').count() === 3 && await page.locator('.sn-soup .opts .ing').count() === 6);
  for (let i = 0; i < 3; i++) { await page.locator('.sn-soup .opts .ing:not(.picked)').first().click(); await page.waitForTimeout(150); }
  await shot('09-soup-result');
  s2 = await SS();
  check('three picks end the round and pay coins', s2.soup.plays === 1 && s2.soup.pts >= 10, JSON.stringify([s2.soup.plays, s2.soup.pts]));
  await page.locator('.panel .close').click();

  // Play points: advance play time through the sim tick, claim 5 minutes.
  await page.evaluate(() => { window.__game.state.season.pp.sec = 301; });
  await btn('bt_playPoint').click();
  await page.waitForTimeout(500);
  await shot('10-play');
  await page.locator('.panel .row.sn .price:not(.off)').first().click();
  await page.waitForTimeout(300);
  const pp = await page.evaluate(() => ({ bag: window.__game.state.missions.bag[99], c: window.__game.state.season.pp.claimed }));
  check('5 minute reward paid 10 play points (type 99)', pp.bag === 10 && pp.c[0] === 1, JSON.stringify(pp));
  await page.locator('.panel .close').click();

  // Gift menu entry exists and opens the beginner / welcome gifts.
  const gift = await page.evaluate(() => { const g = window.__game; return { b: g.feat.season.calState(g, 'beginner').rows.length, w: g.feat.season.calState(g, 'welcome').rows.length }; });
  check('beginner gift has 7 days, welcome gift 15', gift.b === 7 && gift.w === 15, JSON.stringify(gift));

  // Reload keeps claims.
  await page.evaluate(() => dispatchEvent(new Event('pagehide')));
  await page.goto(url);
  await ready();
  const s3 = await SS();
  check('reload keeps claims and points', s3.cal.group.claimed[0] === 1 && s3.pp.claimed[0] === 1 && s3.soup.plays === 1 && s3.em[0][0] === 1, JSON.stringify([s3.cal.group.claimed, s3.pp.claimed, s3.soup.plays]));
  await shot('11-reload-hud');

  // Month change: the saved period is rolled back, reload, the event restarts with the leftover converted.
  await page.evaluate(() => { const g = window.__game; g.state.season.period = '2000-01'; g.state.season.items = 130; });
  const t1 = await page.evaluate(() => window.__game.state.specials.tickets[1101] || 0);
  await page.evaluate(() => dispatchEvent(new Event('pagehide')));
  await page.goto(url);
  await ready();
  const s4 = await SS();
  const t2 = await page.evaluate(() => window.__game.state.specials.tickets[1101] || 0);
  check('a new month resets items (a few new dishes may have dropped one) / pass and converts 130 items into 2 gold tickets', s4.items < 10 && s4.passPts === 0 && s4.period !== '2000-01' && t2 - t1 === 2 && s4.converted === 2, JSON.stringify([s4.items, s4.passPts, t2 - t1]));
  check('no feature failed and no page errors', (await page.evaluate(() => window.__failed())).length === 0 && errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`${pass} passed, ${fail} failed`);
  await browser.close();
  if (srv) srv.close();
  process.exit(fail ? 1 : 0);
})();
