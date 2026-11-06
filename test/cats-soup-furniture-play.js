#!/usr/bin/env node
/* Mèo & Súp "furniture" in a real browser (games/cats-soup, rules in D:/catsoup-ref/rules/furniture.md): the shop button builds the
 * furniture shop once the crane stands, the shop panel buys today's goods with furniture coins, the catalog orders a piece, the sell tab
 * pays coins back, reward type 6 fills the stock, the mini room of a cat takes a floor and a piece (drawn from the exported sprite sheet),
 * a piece drags and flips and goes back to stock, everything survives a reload, and no page errors / failed features.
 *   node test/cats-soup-furniture-play.js
 *   CS_URL=https://poke5121999-art.github.io/survivor-web-hub/games/cats-soup/index.html node test/cats-soup-furniture-play.js
 * Query flags used: ?fresh (ignore the save), ?demo=N, ?speed=k. Screenshots: shots/cats-soup-furniture-play/*.png */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots', 'cats-soup-furniture-play');
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
  let coreJson = 0;     // the same missing-model request makes the core's scene.json parse fail once per request
  page.on('pageerror', e => { if (/Unexpected end of JSON input/.test(String(e)) && coreJson < 2) coreJson++; else errors.push(String(e)); });
  // Core quirk (reported): js/main.js placeLib has no model for work 111 (places.json lists main-forest works only), so it requests
  // art/placesundefined/*; the shop is drawn by the furniture view from art/furniture/place111 instead. Any other failed request counts.
  const known = u => u.includes('placesundefined');
  page.on('response', r => { if (r.status() >= 400 && !known(r.url())) errors.push(`${r.status()} ${r.url()}`); });
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource') && !known(m.text())) errors.push(m.text()); });
  const shot = n => page.screenshot({ path: path.join(SHOTS, `${n}.png`) });
  const wait = ms => page.waitForTimeout(ms);
  const fs_ = () => page.evaluate(() => { const f = window.__game.state.furniture; return JSON.parse(JSON.stringify({ ...f, coin: window.__game.state.coin, works: window.__game.state.works.map(w => w.a) })); });

  await page.goto(`${url}?fresh`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  check('furniture view mounted (window.__furniture, state slice with 3 goods)', await page.evaluate(() => !!window.__furniture && window.__game.state.furniture.goods.length === 3));
  await shot('01-start');
  check('no extra HUD buttons: shop and room live in the quick menu', await page.locator('.hud > .fu-btn').count() === 0);

  // ---- the shop is locked until the crane (work 14) stands ----
  await menu(page, 'Cửa hàng đồ nội thất');
  await wait(300);
  check('shop button without the shop opens the build panel (locked)', await page.locator('.fu-panel .row .price.off').count() === 1);
  await shot('02-locked');
  await page.locator('.panel .close').click();
  await page.evaluate(() => { const g = window.__game; g.state.mapSize = g.state.maxMapSize = 3; g.place(14, g.autoCell(), 0); });
  await menu(page, 'Cửa hàng đồ nội thất');
  await wait(300);
  await page.locator('.fu-panel .row .price:not(.off)').click();
  await wait(500);
  let s = await fs_();
  check('with the crane the build button places work 111', s.works.includes(111), JSON.stringify(s.works));
  check('the build panel closed', await page.locator('.panel').count() === 0);

  // ---- tapping the shop opens it; today's goods ----
  const opened = await page.evaluate(() => { const w = window.__game.state.works.find(x => x.a === 111); return window.__furniture.onTap(w); });
  await wait(400);
  check('onTap(shop) opens the panel with 3 goods rows', opened === true && await page.locator('.fu-panel .row[data-k]').count() === 3);
  await shot('03-shop-daily');
  const p0 = await page.evaluate(() => window.__game.feat.furniture.slot(window.__game, 0).price);
  const i0 = await page.evaluate(() => window.__game.feat.furniture.slot(window.__game, 0).index);
  const coin0 = (await fs_()).coin;
  await page.locator('.fu-panel .row[data-k="0"] .price').click();
  await wait(300);
  s = await fs_();
  check('buying slot 0 spends its 0.9 price in coins and stocks the piece', s.coin === coin0 - p0 && s.inv[i0] === 1 && s.goods[0] === -i0, `coins ${coin0} -> ${s.coin}, price ${p0}`);
  check('the bought row is shown sold', await page.locator('.fu-panel .row[data-k="0"].sold').count() === 1);
  await shot('04-shop-bought');
  const gem0 = await page.evaluate(() => window.__game.state.gem);
  await page.locator('.fu-panel .bar2 .price').nth(1).click();
  await wait(300);
  s = await fs_();
  check('restock by 30 gems brings three fresh goods', (await page.evaluate(() => window.__game.state.gem)) === gem0 - 30 && s.goods.every(i => i > 0));

  // ---- catalog ----
  await page.locator('.panel .tabs div').nth(1).click();
  await wait(400);
  check('catalog tab 0 lists the 17 floors', await page.locator('.fu-panel .cell').count() === 17);
  await shot('05-catalog');
  const cat0 = (await fs_()).coin;
  await page.locator('.fu-panel .cell[data-i]').first().click();
  await wait(300);
  const idx = await page.evaluate(() => Object.keys(window.__game.state.furniture.inv).map(Number));
  s = await fs_();
  check('ordering a floor from the catalog costs its full price (200)', s.coin === cat0 - 200 && idx.length === 2, `coins ${cat0} -> ${s.coin}`);
  await page.locator('.fu-panel .subtabs div').nth(2).click();
  await wait(300);
  check('catalog tab 2 (carpets + furniture) lists 60 pieces on page 1 (40)', await page.locator('.fu-panel .cell').count() === 40);
  await shot('06-catalog-furniture');

  // ---- sell ----
  await page.locator('.panel .tabs div').nth(2).click();
  await wait(400);
  await shot('07-sell');
  const sc0 = (await fs_()).coin;
  const cellN = await page.locator('.fu-panel .cell').count();
  await page.locator('.fu-panel .cell').first().click();
  await wait(300);
  s = await fs_();
  check('selling a stocked piece pays coins back', cellN >= 1 && s.coin > sc0, `${sc0} -> ${s.coin}`);
  await page.locator('.panel .close').click();

  // ---- reward type 6 ----
  const rew = await page.evaluate(() => { const g = window.__game; const o = g.reward(6, 505); return { o, n: g.state.furniture.inv[505] }; });
  check('game.reward(6, 505) stocks chair11', rew.o && rew.o.type === 6 && rew.n === 1, JSON.stringify(rew));

  // ---- mini room ----
  await page.evaluate(() => { const g = window.__game, F = g.feat.furniture; for (const t of [2, 3, 4, 5, 6, 7, 8]) F.add(g, t, 1); const w = g.t.Furniture.filter(r => r.eventType === 0 && r.type === 5).slice(0, 3); for (const r of w) F.add(g, r.index, 1); const k = g.t.Furniture.find(r => r.eventType === 0 && r.type === 4); F.add(g, k.index, 1); const c = g.t.Furniture.find(r => r.eventType === 0 && r.type === 3); F.add(g, c.index, 1); });
  await menu(page, 'Trang trí nhà');
  await wait(800);
  check('the 🏠 button opens the room overlay with the stage', await page.locator('.fu-room .stage').count() === 1);
  await shot('08-room-empty');
  await page.locator('.fu-room .inv .fu-cell').first().click();      // tab 0: floors
  await wait(600);
  s = await fs_();
  const cid = await page.evaluate(() => window.__furniture.cat);
  check('tapping a floor in the stock sets the room floor', s.rooms[cid].floor !== 0, JSON.stringify(s.rooms[cid]));
  await page.locator('.fu-room .inv .subtabs div').nth(1).click();
  await wait(300);
  await page.locator('.fu-room .inv .fu-cell').first().click();      // walls
  await wait(600);
  s = await fs_();
  check('and the wall', s.rooms[cid].wall !== 1, JSON.stringify(s.rooms[cid]));
  await page.locator('.fu-room .inv .subtabs div').nth(2).click();
  await wait(300);
  const nCells = await page.locator('.fu-room .inv .fu-cell').count();
  for (let i = 0; i < Math.min(3, nCells); i++) { await page.locator('.fu-room .inv .fu-cell').first().click(); await wait(250); }
  await page.locator('.fu-room .inv .subtabs div').nth(3).click();
  await wait(300);
  if (await page.locator('.fu-room .inv .fu-cell').count()) await page.locator('.fu-room .inv .fu-cell').first().click();
  await wait(1200);
  s = await fs_();
  const items = s.rooms[cid].items;
  check('pieces were placed in the room (3+ items, drawn as parts)', items.length >= 3 && await page.locator('.fu-room .stage .it').count() === items.length, `${items.length} items`);
  const withArt = await page.locator('.fu-room .stage .it .part').count();
  check('each piece draws its sprite part', withArt >= items.length, `${withArt} parts`);
  await shot('09-room');

  // spread the pieces so none hides another, then drag the last one to the left
  await page.evaluate(() => { const g = window.__game, F = g.feat.furniture, c = window.__furniture.cat; F.room(g, c).items.forEach((q, i) => F.moveItem(g, c, q.n, -0.27 + 0.18 * i, -0.2)); window.__furniture.drawRoom(); });
  await wait(500);
  const it = (await fs_()).rooms[cid].items.slice(-1)[0];
  const box = await page.locator(`.fu-room .stage .it[data-n="${it.n}"] .part`).first().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await wait(100);
  await page.mouse.move(box.x + box.width / 2 - 70, box.y + box.height / 2 + 40, { steps: 6 });
  await page.mouse.up();
  await wait(300);
  const moved = (await fs_()).rooms[cid].items.find(q => q.n === it.n);
  check('dragging moves the piece inside the clamps', moved.x < it.x && Math.abs(moved.x) <= 0.35, `x ${it.x} -> ${moved.x}, y ${it.y} -> ${moved.y}`);
  await page.locator('.fu-room .acts div').first().click();      // flip
  await wait(200);
  check('the flip button toggles dir', (await fs_()).rooms[cid].items.find(q => q.n === it.n).dir === 1);
  await shot('10-room-dragged');
  const stock0 = (await fs_()).inv[it.a] || 0;
  await page.locator('.fu-room .acts [data-act="back"]').click();
  await wait(300);
  s = await fs_();
  check('"back to stock" returns the piece', (s.inv[it.a] || 0) === stock0 + 1 && !s.rooms[cid].items.some(q => q.n === it.n));
  check('the stage lost the piece', await page.locator('.fu-room .stage .it').count() === s.rooms[cid].items.length);

  // a second cat has its own empty room
  await page.evaluate(() => { const g = window.__game; g.state.mapSize = g.state.maxMapSize = 3; g.state.gold = { f: 9, e: 9 }; g.build(g.buildList().find(o => o.n < o.max && g.canBuild(o.w.index)).w.index); });
  await page.evaluate(() => window.__furniture.openRoom());
  await wait(500);
  check('a chip per cat in the room header', await page.locator('.fu-room .cats div').count() === 2);
  await page.locator('.fu-room .cats div').nth(1).click();
  await wait(400);
  check('the second cat has an empty room', await page.evaluate(() => { const f = window.__game.state.furniture; const c = window.__furniture.cat; return (f.rooms[c] ? f.rooms[c].items.length : 0) === 0; }));
  await page.locator('.fu-room .x').click();
  await wait(200);
  check('× closes the room and returns to the forest', await page.locator('.fu-room').count() === 0);

  // ---- persistence ----
  const before = await fs_();
  await page.evaluate(() => dispatchEvent(new Event('pagehide')));
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  const after = await fs_();
  check('reload keeps stock, rooms, coins and today\'s goods', JSON.stringify(after.inv) === JSON.stringify(before.inv) && JSON.stringify(after.rooms) === JSON.stringify(before.rooms) && after.coin === before.coin && JSON.stringify(after.goods) === JSON.stringify(before.goods));
  await shot('11-reload');

  // ---- demo mode ----
  await page.goto(`${url}?demo=12&speed=4`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  await wait(1500);
  check('?demo=12&speed=4 runs the feature (3 goods, no failed feature)', await page.evaluate(() => window.__game.state.furniture.goods.length === 3 && window.__failed().length === 0));

  check('window.__failed() is empty', await page.evaluate(() => window.__failed().length === 0), await page.evaluate(() => window.__failed().join(',')));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`${pass} passed, ${fail} failed`);
  await browser.close();
  if (srv) srv.close();
  process.exit(fail ? 1 : 0);
})();
