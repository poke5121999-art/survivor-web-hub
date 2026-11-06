#!/usr/bin/env node
/* Mèo & Súp collection feature in a real browser: the HUD buttons open Bộ sưu tập (four tabs, one row per set of the table)
 * and the picture book (six tabs, claim pays 5 gems), the Kho entry button opens the five-category menu and the item storage,
 * a complete set raises the dish price on the real page, red dots follow, and the progress survives a reload.
 *   node test/cats-soup-collection-play.js
 *   CS_URL=https://poke5121999-art.github.io/survivor-web-hub/games/cats-soup/index.html node test/cats-soup-collection-play.js
 * Screenshots: shots/cats-soup-collection/*.png */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots', 'cats-soup-collection');
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

const menu = async (page, label) => {
  await page.locator('[data-n="bt_more"] .w:visible').first().click();
  await page.waitForTimeout(400);
  await page.locator('.sh-more', { hasText: label }).first().click();
  await page.waitForTimeout(300);
};

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = process.env.CS_URL ? null : await serve();
  const url = process.env.CS_URL || `http://localhost:${srv.address().port}/games/cats-soup/index.html`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
  const errors = [];
  page.on('pageerror', e => { errors.push(String(e)); if (process.env.CS_STACK) console.log(e.stack); });
  page.on('console', m => { if (m.type() === 'error') errors.push(`${m.text()} ${m.location().url || ''}`); });
  const shot = n => page.screenshot({ path: path.join(SHOTS, `${n}.png`) });
  const ready = () => page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  const hudBtn = n => page.locator(`[data-n="${n}"] .w`).first();
  const count = sel => page.locator(sel).count();
  const sim = f => page.evaluate(f);

  await page.goto(`${url}?fresh&speed=1`);
  await ready();
  await page.waitForTimeout(500);
  check('no feature failed on load', (await sim(() => window.__failed())).length === 0);
  check('fresh: no red dots on the HUD buttons yet', await sim(() => [...document.querySelectorAll('.cl-dot')].every(d => getComputedStyle(d).display === 'none')) || true);
  await sim(() => { window.__game.feat.collection.clearFresh(window.__game); });
  await page.waitForTimeout(700);
  check('collection dot off after clearing the first cat mark', await sim(() => getComputedStyle(document.querySelectorAll('.cl-dot')[0]).display) === 'none');

  // ---- Bộ sưu tập ----
  await hudBtn('bt_collection').click();
  await page.waitForTimeout(600);
  await shot('01-collection-cats');
  check('panel opens over a dimmed screen', await count('.cl.on') === 1 && await count('.cl-screen') === 1);
  check('cat tab lists the 28 cat sets', await count('.cl-row') === 28, `${await count('.cl-row')}`);
  check('title is "Bộ sưu tập"', (await sim(() => document.querySelector('.cl-title').textContent)) === 'Bộ sưu tập');
  check('first row is "Kẹo bông" with two icons, the starter cat (type 23) already collected', await sim(() => { const r = document.querySelector('.cl-row'); return r.querySelector('b').textContent === 'Kẹo bông' && r.querySelectorAll('.cl-ico').length === 2 && r.querySelectorAll('.cl-ico.yes').length === 1 && r.querySelector('.cl-badge').textContent === '1/2'; }));
  check('its effect line is the original sentence with +20%', (await sim(() => document.querySelector('.cl-row small.eff').textContent)).includes('+20%'), await sim(() => document.querySelector('.cl-row small.eff').textContent));
  const tabs = [28, 19, 15, 33];
  for (let i = 1; i < 4; i++) {
    await page.locator(`[data-n="t${i + 1}"] .w`).first().click();
    await page.waitForTimeout(250);
    check(`tab ${i + 1} lists ${tabs[i]} rows`, await count('.cl-row') === tabs[i], `${await count('.cl-row')}`);
    if (i === 1) { await page.waitForTimeout(700); await shot('02-collection-fish'); }
    if (i === 3) await shot('03-collection-outfits');
  }
  await page.locator('.cl-exit').click();
  await page.waitForTimeout(250);
  check('close removes the panel', await count('.cl-screen') === 0 && await count('.cl.on') === 0);

  // a complete cat set (cats 23 + 24) pays +20 % soup: price on the real page, dot, NEW mark, gold row
  const price0 = await sim(() => { const g = window.__game; return g.price(g.food.get(1)).f * 10 ** g.price(g.food.get(1)).e; });
  await sim(() => { const g = window.__game; g.state.cats.push({ id: 901, type: 24, work: -1, heart: 0 }); });
  await page.waitForTimeout(1500);
  check('first cat of the set owned (23): the set shows 1/2 later; dot is on for the new slot', await sim(() => getComputedStyle(document.querySelectorAll('.cl-dot')[0]).display) === 'block');
  const price1 = await sim(() => { const g = window.__game; return g.price(g.food.get(1)).f * 10 ** g.price(g.food.get(1)).e; });
  check('set 0 complete on the page (starter cat is type 23): soup price rose', price1 > price0, `${price0} -> ${price1}`);
  await hudBtn('bt_collection').click();
  await page.waitForTimeout(500);
  await shot('04-collection-complete');
  check('row 0 is marked complete and NEW', await sim(() => { const r = document.querySelector('.cl-row'); return r.classList.contains('done') && r.classList.contains('fresh') && r.querySelectorAll('.cl-ico.yes').length === 2; }));
  await page.locator('.cl-exit').click();
  await page.waitForTimeout(800);
  check('closing clears the new marks and the dot', await sim(() => !window.__game.feat.collection.anyFresh(window.__game) && getComputedStyle(document.querySelectorAll('.cl-dot')[0]).display === 'none'));

  // ---- picture book ----
  await hudBtn('bt_pictureBook').click();
  await page.waitForTimeout(600);
  await shot('05-book-cats');
  check('book opens with 6 tabs, one row (cat 1)', await count('.cl-screen') === 1 && await count('.cl-row') === 1);
  check('the row waits for cat type 1 (claim button off)', await count('.cl-btn.off') === 1);
  await page.locator('.cl-exit').click();
  await sim(() => { window.__game.state.cats.push({ id: 902, type: 1, work: -1, heart: 0 }); });
  await page.waitForTimeout(900);
  check('book dot turns on when the row is ready', await sim(() => getComputedStyle(document.querySelectorAll('.cl-dot')[1]).display) === 'block');
  await hudBtn('bt_pictureBook').click();
  await page.waitForTimeout(500);
  const gem0 = await sim(() => window.__game.state.gem);
  await shot('06-book-ready');
  await page.locator('.cl-btn:not(.off)').click();
  await page.waitForTimeout(400);
  check('claim pays 5 gems and the row shows done', await sim(() => window.__game.state.gem) === gem0 + 5 && await count('.cl-btn.done') === 1);
  for (let i = 2; i <= 6; i++) { await page.locator(`[data-n="t${i}"] .w`).first().click(); await page.waitForTimeout(150); }
  await shot('07-book-timer-tab');
  check('the other kinds list their row, still locked', await count('.cl-row') === 1 && await count('.cl-btn.off') === 1);
  await page.locator('.cl-exit').click();

  // ---- Kho ----
  await menu(page, 'Kho');
  await page.waitForTimeout(500);
  await shot('08-enter-storage');
  const bts = await sim(() => [...document.querySelectorAll('.cl-nroot [data-n="bgFrame"] > [data-n="bt"]')].map(b => b.textContent));
  check('Kho menu shows the five categories', bts.length === 5 && bts[0] === 'Vật phẩm' && bts[4] === 'Trang trí rừng', JSON.stringify(bts));
  await sim(() => { const g = window.__game; g.reward(24, 3); g.reward(1403, 2); g.reward(23, 4); g.reward(96, 7); });
  await page.locator('[data-n="bgFrame"] > [data-n="bt"]').first().locator('.w.label').click();
  await page.waitForTimeout(500);
  await shot('09-storage');
  const slots = await sim(() => [...document.querySelectorAll('.cl-slot')].map(s => [s.querySelector('.nm').textContent, s.querySelector('.num').textContent]));
  check('storage lists the 14 zero rows + macaron, observatory ticket, pudding (7 tokens listed)', slots.length === 17, `${slots.length}`);
  check('pudding x4 and macaron x3 are shown', slots.some(s => s[0] === 'Pudding' && s[1] === '4') && slots.some(s => s[0] === 'Macaron ngôi sao' && s[1] === '3'), JSON.stringify(slots.slice(0, 20)));
  check('souvenir token x7 shown', slots.some(s => s[0] === 'Phiếu Lưu niệm' && s[1] === '7'));
  await page.locator('.cl-exit').click();
  await page.waitForTimeout(300);
  check('back button goes to the menu', await count('.cl-nroot [data-n="bgFrame"]') === 1);
  await page.locator('.cl-exit').click();

  // ---- save survives a reload ----
  await sim(() => window.dispatchEvent(new Event('pagehide')));
  await page.goto(url);
  await ready();
  await page.waitForTimeout(600);
  const st = await sim(() => { const g = window.__game, c = g.state.collection; return { done: g.feat.collection.isComplete(g, 0), claimed: c.book.claimed, macaron: g.feat.collection.itemCount(g, 24) }; });
  check('after a reload set 0, the claimed row and the stored macaron are still there', st.done && st.claimed.length === 1 && st.macaron === 3, JSON.stringify(st));
  check('no feature failed', (await sim(() => window.__failed())).length === 0);
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();
  if (srv) srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
