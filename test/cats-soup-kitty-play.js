#!/usr/bin/env node
/* Meo & Sup feature "kitty" on the real page: the "more" menu opens the kitty house window, a house is built (free), a kitty
 * is sent on a trip with bought travel items, the timer runs, the souvenirs and photo come back, the album, magnets and
 * shop tabs draw, the dance stage builds, and no feature failed (window.__failed() stays empty).
 *   node test/cats-soup-kitty-play.js
 *   CS_URL=https://poke5121999-art.github.io/survivor-web-hub/games/cats-soup/index.html node test/cats-soup-kitty-play.js
 * Screenshots: shots/cats-soup-kitty/*.png */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots', 'cats-soup-kitty');
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
  const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = n => page.screenshot({ path: path.join(SHOTS, `${n}.png`) });
  const wait = ms => page.waitForTimeout(ms);
  const failed = () => page.evaluate(() => window.__failed());
  const ev = (fn, arg) => page.evaluate(fn, arg);

  await page.goto(`${url}?demo=14&speed=1`);
  await page.waitForFunction(() => window.__ready === true && !!window.__kitty, null, { timeout: 90000 });
  check('no feature failed at start', (await failed()).length === 0, JSON.stringify(await failed()));
  await shot('01-hud');

  // open through the "more" quick menu
  await page.locator('[data-n="bt_more"] .w:visible').first().click();
  await wait(500);
  const label = await ev(() => window.__game && document.querySelector('.sh-more') ? [...document.querySelectorAll('.sh-more')].map(e => e.textContent) : []);
  check('quick menu has the kitty trip entry', label.some(l => /Chuyến đi của mèo con/i.test(l)), label.join('|'));
  await page.locator('.sh-more', { hasText: 'Chuyến đi của mèo con' }).first().click();
  await wait(500);
  check('kitty window opens', await page.locator('.ky-pop .tabs .tab').count() === 5);
  check('house 402 is locked with a build note', await page.locator('.ky-house').count() === 3 && await page.locator('.ky-pop .btn.green').count() === 1);
  await shot('02-locked');

  // build the first house (free) -> first kitty
  await page.locator('.ky-pop .btn.green').first().click();
  await wait(300);
  const k1 = await ev(() => { const s = window.__game.state.kitty; return { n: s.kitties.length, type: s.kitties[0].type, houses: s.houses }; });
  check('house built, one kitty of a first-kitty body', k1.n === 1 && [48, 79, 80].includes(k1.type) && k1.houses.join() === '402', JSON.stringify(k1));
  check('kitty portrait drawn', await page.locator('.ky-card .ky-cat').count() === 1);
  await shot('03-house');

  // shop: no butterflies -> toast, with butterflies -> buy
  await page.locator('.ky-pop .tab[data-tab="shop"]').click();
  await wait(200);
  check('shop lists 12 items', await page.locator('.ky-item[data-buy]').count() === 12);
  await page.locator('.ky-item[data-buy="9"]').click();
  await wait(200);
  check('buying without butterflies buys nothing', await ev(() => window.__game.feat.kitty.itemCount(window.__game, 9)) === 0);
  await ev(() => window.__game.reward(98, 400));
  await page.evaluate(() => window.__kitty.view.draw());
  await shot('04-shop');
  for (const i of [1, 4, 9]) await page.locator(`.ky-item[data-buy="${i}"]`).click();
  await wait(200);
  const bought = await ev(() => [1, 4, 9].map(i => window.__game.feat.kitty.itemCount(window.__game, i)).join() + '/' + window.__game.feat.kitty.count(window.__game, 98));
  check('lunch box 100 + charger 200 + bus 10 butterflies bought, 90 left', bought === '1,1,1/90', bought);

  // trip tab: pick items, send
  await page.locator('.ky-pop .tab[data-tab="trip"]').click();
  await wait(200);
  for (const i of [1, 4, 9]) await page.locator(`.ky-item[data-item="${i}"]`).click();
  await wait(200);
  check('three items selected', await page.locator('.ky-item.on').count() === 3);
  await shot('05-items');
  await page.locator('.ky-pop .body > .btn.green').click();
  await wait(300);
  const trip = await ev(() => { const k = window.__game.state.kitty.kitties[0]; return k.trip && { total: k.trip.total, items: k.trip.items }; });
  check('kitty is travelling 10800 s with items 1,4,9', trip && trip.total === 10800 && trip.items.join() === '1,4,9', JSON.stringify(trip));
  check('timer shown, cancel button present, items spent', await page.locator('.ky-time').count() === 1 && await page.locator('.ky-pop .btn.red').count() === 1 && await ev(() => window.__game.feat.kitty.itemCount(window.__game, 4)) === 0);
  await shot('06-travelling');

  // cancel returns the items, send again
  await page.locator('.ky-pop .btn.red').click();
  await wait(200);
  check('cancel gives the items back', await ev(() => window.__game.feat.kitty.itemCount(window.__game, 9)) === 1 && await ev(() => window.__game.state.kitty.kitties[0].trip) === null);
  for (const i of [1, 4, 9]) await page.locator(`.ky-item[data-item="${i}"]`).click();
  await page.locator('.ky-pop .body > .btn.green').click();
  await wait(200);

  // time passes (offline) -> ready -> collect
  await ev(() => { const g = window.__game; g.offline(20000, 10800, 20000); });
  await ev(() => window.__kitty.view.draw());
  check('after 20000 s away the trip is ready', await ev(() => window.__game.feat.kitty.tripDone(window.__game.state.kitty.kitties[0])) && await page.locator('.ky-pop .ky-card .btn.green').count() === 1);
  await shot('07-ready');
  const tok0 = await ev(() => window.__game.feat.kitty.count(window.__game, 96));
  await page.locator('.ky-pop .ky-card .btn.green').click();
  await wait(500);
  check('result window shows the photo and the tokens', await page.locator('.ky-pop.res .ky-photo').count() >= 1 && await page.locator('.ky-pop.res .ky-line').count() >= 1);
  const tok1 = await ev(() => window.__game.feat.kitty.count(window.__game, 96));
  check('souvenir tokens received (20 base + 3..6 without a magnet, or 20 with one)', tok1 - tok0 >= 20 && tok1 - tok0 <= 26, `${tok1 - tok0}`);
  await shot('08-result');
  await page.locator('.ky-pop.res .btn').first().click();
  await wait(300);

  // album
  await page.locator('.ky-pop .tab[data-tab="album"]').click();
  await wait(300);
  check('album shows 50 destinations, one photo', await page.locator('.ky-grid .cell').count() === 50 && await page.locator('.ky-grid .cell:not(.empty)').count() === 1);
  await shot('09-album');

  // magnets
  await ev(() => { window.__game.state.kitty.magnets = {}; window.__game.reward(3500, 5); });
  await page.locator('.ky-pop .tab[data-tab="magnet"]').click();
  await wait(300);
  await page.waitForFunction(() => { const i = document.querySelector('.ky-mag:not(.empty) i'); return i && i.style.backgroundImage; }, null, { timeout: 40000 }).catch(() => {});
  check('magnet tab shows 36 magnets, one owned', await page.locator('.ky-mag').count() === 36 && await page.locator('.ky-mag:not(.empty)').count() === 1);
  await shot('10-magnets');

  // dance stage: needs work 22 and 1e25 gold
  await page.locator('.ky-pop .tab[data-tab="stage"]').click();
  await wait(300);
  await shot('11-stage-locked');
  await ev(() => {
    const g = window.__game;
    if (g.copies(22) < 1) g.place(22, g.autoCell(), 0);
    g.state.gold = { f: 1, e: 25 };
    g.state.gem = 2000;
    window.__kitty.view.draw();
  });
  await page.locator('.ky-pop .ky-card .btn.green').click();
  await wait(300);
  check('dance stage built with a first kitty, next slot offered', await ev(() => window.__game.feat.kitty.stageKitties(window.__game).length) === 1 && await page.locator('.ky-pop .btn', { hasText: '400' }).count() === 1);
  await page.locator('.ky-pop .btn', { hasText: '400' }).click();
  await wait(300);
  check('second stage kitty cost 400 gems', await ev(() => window.__game.feat.kitty.stageKitties(window.__game).length) === 2 && await ev(() => window.__game.state.gem) === 1600);
  await shot('12-stage');

  // houses 403 and 404 then a second trip with a ticket only
  await page.locator('.ky-pop .tab[data-tab="trip"]').click();
  await ev(() => { window.__kitty.view.house = 403; window.__kitty.view.draw(); });
  await page.locator('.ky-pop .btn.green').first().click();
  await wait(200);
  check('house 403 built', await ev(() => window.__game.state.kitty.houses.join()) === '402,403');
  await shot('13-second-house');

  check('no feature failed at the end', (await failed()).length === 0, JSON.stringify(await failed()));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  if (srv) srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
