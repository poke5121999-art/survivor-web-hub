#!/usr/bin/env node
/* Mèo & Súp fishing + aquarium in a real browser (games/cats-soup): build the fishing ground, play the quill (wait for the
 * bite, raise), inventory, sell popup, aquarium, fish book, themes, reload.
 *   node test/cats-soup-fishing-play.js
 *   CS_URL=https://.../games/cats-soup/index.html node test/cats-soup-fishing-play.js
 * Screenshots: shots/cats-soup-fishing/*.png */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots', 'cats-soup-fishing');
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
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = n => page.screenshot({ path: path.join(SHOTS, `${n}.png`) });
  const fs_ = () => page.evaluate(() => {
    const f = window.__game.state.fishing;
    const w = window.__game.state.works.find(x => x.a === 10);
    return { charges: w && w.v, inv: f.inv, book: f.book, casts: f.casts, bait: f.bait };
  });
  const click = sel => page.locator(sel).first().dispatchEvent('click');
  const phase = p => page.waitForFunction(x => document.querySelector('.fx-fishing') && document.querySelector('.fx-fishing').dataset.ph === x, p, { timeout: 60000 });

  await page.goto(`${url}?fresh`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  // gold and a big forest, then the two facilities through the game API (CRAFT only lists the next row)
  const built = await page.evaluate(() => {
    const g = window.__game;
    g.state.gold = { f: 9, e: 40 };
    g.state.gem = 5000;
    for (let i = 0; i < 40 && g.canExpand(); i++) g.expand();
    return [g.build(10), g.build(33)].map(w => !!w);
  });
  check('fishing ground (work 10) and aquarium (work 33) build', built[0] && built[1], JSON.stringify(built));
  await page.waitForTimeout(1500);
  check('the fishing ground starts with 5 charges', (await fs_()).charges === 5);

  // tap the facility through the feature's onTap, as main.js does
  await page.evaluate(() => { const g = window.__game; window.__fishing.onTap(g.state.works.find(w => w.a === 10)); });
  await page.waitForTimeout(600);
  await shot('01-fishing');
  check('fishing panel opens with the pond', await page.locator('.fx-fishing .fx-pond').count() === 1);
  check('4 fish shadows swim in the pond', await page.locator('.fx-shadowfish').count() === 4);

  // wait for the bite, raise: a fish arrives
  const before = await fs_();
  await phase('bite');
  await click('[data-n="bt_fishing"] .w');
  await page.waitForTimeout(1200);
  const after = await fs_();
  check('raising at the bite spends one charge and gives a catch', after.charges === before.charges - 1 && after.casts === 1, `${before.charges} -> ${after.charges}`);
  await shot('03-caught');
  check('the catch card shows the fish or reward', await page.locator('.fx-catch').evaluate(e => !!e.dataset.fish && e.childElementCount > 0));

  // hold a bite open to look at it (the real window is 1.6 s of game time)
  await page.evaluate(() => { window.__fishing.round('wait'); window.__fishing.round('bite'); window.__fishing.pdur = 1e9; });
  await page.waitForTimeout(400);
  await shot('02-bite');
  await page.evaluate(() => { window.__fishing.round('wait'); });

  // raise with nothing biting: no charge, no fish
  await phase('wait');
  const c1 = (await fs_()).charges;
  await click('[data-n="bt_fishing"] .w');
  await page.waitForTimeout(300);
  check('raising when nothing bites costs nothing', (await fs_()).charges === c1);

  // use up the charges
  for (let i = 0; i < 12; i++) {
    if ((await fs_()).charges < 1) break;
    await page.evaluate(() => { window.__fishing.round('bite'); window.__fishing.pdur = 1e9; });
    await click('[data-n="bt_fishing"] .w');
    await page.waitForTimeout(150);
  }
  const empty = await fs_();
  check('after 5 casts the charges are 0', empty.charges === 0 && empty.casts === 5, JSON.stringify({ c: empty.charges, k: empty.casts }));
  await phase('wait');
  await page.waitForTimeout(600);
  await shot('04-no-bait');
  check('the no-bait message and the ad button show', await page.locator('[data-n="set_msg"] .w').first().isVisible() && await page.locator('[data-n="bt_earnAds"] .w').first().isVisible());
  await click('[data-n="bt_earnAds"] .w');
  await page.waitForTimeout(300);
  check('the ad button pays one charge at once', (await fs_()).charges === 1);

  // inventory
  await page.evaluate(() => {
    const f = window.__game.feat.fishing, g = window.__game;
    g.state.fishing.inv = {};
    for (const id of [0, 0, 0, 5, 9, 18, 100, 411, 411, 408, 3]) f.addFish(g, id);
  });
  await click('[data-n="bt_fishInven"] .w');
  await page.waitForTimeout(1200);
  await shot('05-inven');
  const tiles = await page.locator('.fx-tile').count();
  check('inventory lists the normal fish', tiles >= 5, String(tiles));
  await click('[data-n="t2"] .w');
  await page.waitForTimeout(300);
  await shot('06-inven-special');
  check('special tab lists fish 411 and 408', await page.locator('.fx-tile').count() === 2);
  await click('[data-n="t1"] .w');
  await page.waitForTimeout(300);

  // popup: 3 of fish 0 -> 2 to the aquarium, sell 1
  await page.locator('.fx-tile').filter({ hasText: 'x 3' }).first().click();
  await page.waitForTimeout(1200);
  await shot('07-popup');
  check('the popup opens', await page.locator('[data-n="bt_sell"] .w').first().isVisible());
  await click('[data-n="bt_plus"] .w');
  await page.waitForTimeout(100);
  await click('[data-n="bt_aqua"] .w');
  await page.waitForTimeout(1200);
  let st = await page.evaluate(() => window.__game.state.fishing.inv[0]);
  check('"aquarium" moves 2 fish of kind 0 into the aquarium', st.n === 3 && st.a === 2, JSON.stringify(st));
  await page.locator('.fx-tile').first().click();
  await page.waitForTimeout(400);
  await click('[data-n="bt_sell"] .w');
  await page.waitForTimeout(400);
  st = await page.evaluate(() => window.__game.state.fishing.inv);
  check('selling takes one fish from the inventory', Object.values(st).reduce((a, v) => a + v.n, 0) === 10, JSON.stringify(st));

  // aquarium
  await page.evaluate(() => { window.__fishing.open('aquarium'); });
  await page.waitForTimeout(800);
  await shot('08-aquarium');
  check('the aquarium shows the 2 fish placed', await page.locator('.fx-tank .swim').count() === 2);
  await page.evaluate(() => {
    const g = window.__game, f = g.feat.fishing;
    for (let i = 0; i < 30; i++) { const id = [1, 2, 4, 5, 6, 7][i % 6]; f.addFish(g, id); f.store(g, id, 1); }
    window.__fishing.refresh();
  });
  await page.waitForTimeout(800);
  await shot('09-aquarium-full');
  check('32 fish swim', await page.locator('.fx-tank .swim').count() === 32);
  // themes: buy theme 1 (800 gems)
  await page.locator('.fx-circle').nth(2).click();
  await page.waitForTimeout(400);
  await shot('10-theme');
  await page.locator('.fx-modal .arrow').nth(1).click();
  await page.waitForTimeout(200);
  await page.locator('.fx-modal .yes').click();
  await page.waitForTimeout(300);
  check('theme 1 bought for 800 gems and selected', await page.evaluate(() => { const g = window.__game; return g.state.fishing.theme === 1 && g.state.gem === 4200; }));
  await shot('11-theme-sky');
  await page.locator('.fx-modal .no').click();
  // fish book
  await page.locator('.fx-circle').nth(3).click();
  await page.waitForTimeout(1200);
  await shot('12-book');
  check('the fish book lists the 30 normal fish', await page.locator('.fx-tile.book').count() === 30);
  check('caught fish show, the others are silhouettes', await page.locator('.fx-tile.book.unknown').count() > 0 && await page.locator('.fx-tile.book:not(.unknown)').count() > 3);
  await click('[data-n="t2"] .w');
  await page.waitForTimeout(300);
  await shot('13-book-special');
  check('special tab lists the 25 special fish', await page.locator('.fx-tile.book').count() === 25);
  await page.evaluate(() => window.__fishing.close());

  // the save keeps the state
  await page.evaluate(() => dispatchEvent(new Event('pagehide')));
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  st = await page.evaluate(() => {
    const f = window.__game.state.fishing;
    return { aqua: Object.values(f.inv).reduce((a, v) => a + v.a, 0), theme: f.theme, book: Object.keys(f.book).length };
  });
  check('reload keeps the aquarium, the theme and the book', st.aqua === 32 && st.theme === 1 && st.book >= 5, JSON.stringify(st));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`${pass} passed, ${fail} failed`);
  await browser.close();
  if (srv) srv.close();
  process.exit(fail ? 1 : 0);
})();
