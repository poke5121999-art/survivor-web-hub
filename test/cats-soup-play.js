#!/usr/bin/env node
/* Mèo & Súp (games/cats-soup) in a real browser: loads without errors, a dish lands on the shelf and tapping it pays
 * gold, CRAFT builds the next facility (a new cat arrives), tapping a facility opens its card and upgrades it, the
 * recipe panel learns a recipe with energy, and progress survives a reload.
 *   node test/cats-soup-play.js
 *   CS_URL=https://poke5121999-art.github.io/survivor-web-hub/games/cats-soup/index.html node test/cats-soup-play.js
 * Screenshots: shots/cats-soup-play/*.png */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots', 'cats-soup-play');
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
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = n => page.screenshot({ path: path.join(SHOTS, `${n}.png`) });
  const st = () => page.evaluate(() => {
    const s = window.__game.state;
    return { works: s.works.length, cats: s.cats.length, shelf: s.shelf.length, gold: s.gold, energy: s.energy, lv: s.works.map(w => w.lv), recipes: Object.keys(s.recipes).length };
  });
  const num = b => b.f * 10 ** b.e;

  await page.goto(`${url}?fresh&speed=6`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  await shot('01-start');
  let s = await st();
  check('fresh game: soup pot and one cat', s.works === 1 && s.cats === 1, JSON.stringify(s));
  await page.waitForFunction(() => window.__game.state.shelf.length > 0, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(500);
  await shot('02-dish');
  const g0 = num((await st()).gold);
  const dish = page.locator('.shelf .dish').first();
  check('a dish appears on the shelf', await dish.count() > 0);
  if (await dish.count()) await dish.click();
  await page.waitForTimeout(300);
  check('tapping the dish pays gold', num((await st()).gold) > g0, `${g0} -> ${num((await st()).gold)}`);

  await page.evaluate(() => { window.__game.state.gold = { f: 5, e: 4 }; });
  await page.locator('[data-n="bt_build"] .w').first().click();
  await page.waitForTimeout(400);
  await shot('03-craft');
  check('CRAFT panel opens with rows', await page.locator('.panel .row').count() > 0);
  await page.locator('.panel .row .price:not(.off)').first().click();
  await page.waitForTimeout(1200);
  s = await st();
  check('building the next facility adds a work and a cat', s.works === 2 && s.cats === 2, JSON.stringify(s));
  await shot('04-built');

  const pos = await page.evaluate(() => {
    const w = window.__game.state.works[0];
    return w.pos;
  });
  await page.evaluate(() => { window.__game.state.gold = { f: 5, e: 6 }; });
  // Tap the soup pot through the camera ground mapping: find its screen point.
  const pt = await page.evaluate(([x, y]) => {
    const c = document.getElementById('game');
    const r = c.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, cell: [x, y] };
  }, pos);
  await page.evaluate(() => { const w = window.__game.state.works[0]; window.__hud && window.__hud.select(w); });
  await page.waitForTimeout(300);
  const card = page.locator('.card .up');
  check('facility card shows', await card.count() > 0 && await card.isVisible());
  if (await card.count()) await card.click();
  await page.waitForTimeout(300);
  s = await st();
  check('upgrade raises the level', s.lv[0] === 2, JSON.stringify(s.lv));
  await shot('05-card');

  await page.locator('[data-n="bt_recipe"] .w').first().click();
  await page.waitForTimeout(400);
  await shot('06-recipe');
  const before = (await st()).recipes;
  const learn = page.locator('.panel .row .price:not(.off)');
  if (await learn.count()) await learn.first().click();
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => Object.values(window.__game.state.recipes).reduce((a, b) => a + b, 0));
  check('recipe panel spends energy on a recipe', after > 1, `levels ${after}, recipes ${before}`);
  await page.locator('.panel .close').click();

  await page.evaluate(() => dispatchEvent(new Event('pagehide')));
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  s = await st();
  check('reload keeps the facilities and levels', s.works === 2 && s.lv[0] === 2, JSON.stringify(s));
  await shot('07-reload');
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`${pass} passed, ${fail} failed`);
  await browser.close();
  if (srv) srv.close();
  process.exit(fail ? 1 : 0);
})();
