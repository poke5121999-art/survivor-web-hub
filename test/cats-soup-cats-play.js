#!/usr/bin/env node
/* Meo & Sup feature "cats" on the real page: the profile slot opens the cat list, a row opens the cat info window with
 * hearts and skills, the heart and skill popups open, swapping trades two cats' facilities, "move all" fits skills, a
 * fishHeart event raises a heart level, and the gift bubble opens the three-box gift window that pays.
 *   node test/cats-soup-cats-play.js
 *   CS_URL=https://poke5121999-art.github.io/survivor-web-hub/games/cats-soup/index.html node test/cats-soup-cats-play.js
 * Screenshots: shots/cats-soup-cats/*.png */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots', 'cats-soup-cats');
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
  page.setDefaultTimeout(90000);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = n => page.screenshot({ path: path.join(SHOTS, `${n}.png`) });
  const wait = ms => page.waitForTimeout(ms);

  await page.goto(`${url}?demo=14&speed=1`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  const cats0 = await page.evaluate(() => window.__game.state.cats.length);
  check('demo has several cats', cats0 >= 4, `${cats0}`);
  check('every cat has hearts and skills', await page.evaluate(() => window.__game.state.cats.every(c => window.__game.state.cats_ext.byId[c.id].main)));
  await shot('01-hud');
  check('profile slot shows the cat count', (await page.locator('[data-n="CatNum"] [data-n="num"] .w').first().textContent()).trim() === String(cats0));

  // cat list
  await page.locator('[data-n="set_cat"] .w').first().click();
  await wait(500);
  const rows = await page.locator('.panel .crow').count();
  check('cat list has one row per cat', rows === cats0, `${rows}`);
  await shot('02-list');

  // info window
  await page.locator('.panel .crow').first().click();
  await wait(500);
  check('cat info window opens', await page.locator('.cs-pop.info').count() === 1);
  check('info shows hearts, a skill icon and the facility', await page.locator('.cs-pop .cs-heart').count() === 1 && await page.locator('.cs-pop .cs-skill').count() >= 1 && await page.locator('.cs-pop .wrow').count() === 1);
  await shot('03-info');

  // heart info
  await page.locator('.cs-pop .cs-heart').click();
  await wait(300);
  check('heart popup lists current and next bonuses', await page.locator('.cs-pop.heart .hcol').count() === 2);
  await shot('04-heart');
  await page.locator('.cs-pop .x').click();
  check('closing the heart popup returns to the info window', await page.locator('.cs-pop.info').count() === 1);

  // skill info
  await page.locator('.cs-pop .skills .cs-skill').first().click();
  await wait(300);
  check('skill popup shows the match note', await page.locator('.cs-pop.skill .active').count() === 1);
  await shot('05-skill');

  // swap through "gotoSwitch"
  const before = await page.evaluate(() => window.__game.state.cats.map(c => [c.id, c.work]));
  await page.locator('.cs-pop.skill .btn').click();
  await wait(300);
  check('swap list shows the other cats', await page.locator('.cs-pop.swap .crow').count() === cats0 - 1);
  await shot('06-swap');
  await page.locator('.cs-pop.swap .crow').first().click();
  await wait(400);
  const after = await page.evaluate(() => window.__game.state.cats.map(c => [c.id, c.work]));
  const moved = after.filter((a, i) => a[1] !== before[i][1]).length;
  check('swapping trades the facilities of exactly two cats', moved === 2, `${moved} moved`);
  check('one cat per facility', new Set(after.map(a => a[1])).size === after.length);

  // the outfit button asks the equip module (absent or not, it must not throw)
  await page.locator('.cs-pop.info .btn.green').click();
  await wait(600);
  const hasEquip = await page.evaluate(() => !!window.__equip);
  if (hasEquip) {
    check('outfit button opens the equip fitting room', await page.locator('.eq-room').count() === 1);
    await shot('06b-outfit');
    await page.evaluate(() => window.__equip.close());
  }
  for (let k = 0; k < 4 && await page.locator('.cs-pop .x').count(); k++) { await page.locator('.cs-pop .x').click(); await wait(150); }
  await page.evaluate(() => window.__hud.close());

  // move all
  await page.evaluate(() => window.__catsView.openList());
  await wait(300);
  const nswap = await page.evaluate(() => window.__game.feat.cats.bestFit(window.__game));
  check('move all keeps one cat per facility', await page.evaluate(() => new Set(window.__game.state.cats.map(c => c.work)).size === window.__game.state.cats.length), `${nswap} swaps`);
  await page.locator('.panel .row.head .btn').click();
  await wait(300);

  // fishHeart event raises the heart level shown in the list
  const lv0 = await page.evaluate(() => { const g = window.__game, c = g.state.cats[0]; return g.feat.cats.heartLevel(g, c); });
  await page.evaluate(() => { const g = window.__game; g.emit('fishHeart', { cat: g.state.cats[0], value: 35 }); });
  const lv1 = await page.evaluate(() => { const g = window.__game, c = g.state.cats[0]; return [g.feat.cats.heartLevel(g, c), c.heart]; });
  check('fishHeart +35 exp lifts heart level (core cat.heart follows)', lv1[0] >= lv0 + 1 && lv1[1] === lv1[0] - 1, `${lv0} -> ${lv1[0]}`);
  await page.evaluate(() => window.__hud.panel && window.__hud.panel.refresh());
  await wait(300);
  await shot('07-list-after');
  await page.locator('.panel .close').click();

  // gift
  check('gift bubble hidden at first', await page.locator('[data-n="bt_unitGift"]').evaluate(e => getComputedStyle(e).display === 'none'));
  await page.evaluate(() => { window.__game.state.cats_ext.gift.t = 599.9; });
  await wait(1500);
  await page.waitForFunction(() => window.__game.feat.cats.giftReady(window.__game), null, { timeout: 20000 }).catch(() => {});
  check('gift bubble appears after the wait', await page.locator('[data-n="bt_unitGift"]').evaluate(e => getComputedStyle(e).display !== 'none'), JSON.stringify(await page.evaluate(() => window.__game.state.cats_ext.gift)));
  await shot('08-bubble');
  await page.locator('[data-n="bt_unitGift"] .w').first().click();
  await wait(400);
  check('gift window shows three boxes', await page.locator('.cs-pop.gift .gbox').count() === 3);
  await shot('09-gift');
  const g0 = await page.evaluate(() => { const g = window.__game; return { gem: g.state.gem, coin: g.state.coin, gold: g.state.gold, en: g.state.energy, stash: Object.keys(g.state.cats_ext.stash).length }; });
  await page.evaluate(() => { const g = window.__game; g.state.cats_ext.gift.boxes[0].row = 0; g.state.cats_ext.gift.boxes[1].row = 9; g.state.cats_ext.gift.boxes[2].row = 3; });
  await page.locator('.cs-pop.gift .gbox').first().click();
  await wait(300);
  const g1 = await page.evaluate(() => window.__game.state.gem);
  check('first box pays 5 gems', g1 === g0.gem + 5, `${g0.gem} -> ${g1}`);
  check('the other boxes wait for the ad button', await page.locator('.cs-pop.gift .gbox.open').count() === 1 && await page.locator('.cs-pop.gift .btn.green').count() === 1);
  await shot('10-gift-picked');
  await page.locator('.cs-pop.gift .btn.green').click();
  await wait(300);
  const g2 = await page.evaluate(() => ({ coin: window.__game.state.coin }));
  check('ad button opens the rest (5 coins)', g2.coin === g0.coin + 5 && await page.locator('.cs-pop.gift .gbox.open').count() === 3, `${g0.coin} -> ${g2.coin}`);
  await shot('11-gift-all');
  await page.locator('.cs-pop.gift .btn.blue').click();  // OK, shown once every box is open
  await wait(300);
  check('window closes and the bubble goes away', await page.locator('.cs-pop').count() === 0 && await page.evaluate(() => !window.__game.feat.cats.giftReady(window.__game)));

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`${pass} passed, ${fail} failed`);
  await browser.close();
  if (srv) srv.close();
  process.exit(fail ? 1 : 0);
})();
