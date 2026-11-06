#!/usr/bin/env node
/* Mèo & Súp "specials" on the real page: tap the chest (real canvas click), open every special facility's dialog and use it:
 * chest, jar fairy bubble, balloon, crane, basketball, elephant trader, music player, special-order board; state survives a reload.
 *   node test/cats-soup-specials-play.js
 *   CS_URL=https://.../games/cats-soup/index.html node test/cats-soup-specials-play.js
 * Equip (type 5) and fishing (6002) belong to other features; when they are missing a stand-in pays them. Screenshots: shots/specials-play/ */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots', 'specials-play');
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
  const num = b => b.f * 10 ** b.e;
  const gold = () => page.evaluate(() => { const g = window.__game.state.gold; return g.f * 10 ** g.e; });
  const st = (fn, ...a) => page.evaluate(fn, ...a);
  const wait = ms => page.waitForTimeout(ms);
  const closePopups = async () => { for (let i = 0; i < 4; i++) { const c = page.locator('.sp-click'); if (await c.count()) { await c.first().click({ force: true }); await wait(150); } const e = page.locator('.eq-pop .btn'); if (await e.count()) { await e.first().click(); await wait(150); } } };
  const closeDialog = async () => { await closePopups(); const x = page.locator('.sp-dim .sp-x'); if (await x.count()) await x.first().click(); await wait(150); };

  await page.goto(`${url}?fresh&speed=2`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  await st(() => {
    const g = window.__game;
    // Stand-ins only for what other agents own: equip cards (5) and star-candy bait (6002).
    window.__stub = { 5: [], 6002: [] };
    for (const t of [5, 6002]) if (!g.features.some(f => f.rewards && f.rewards[t])) g.features.push({ id: `stub${t}`, rewards: { [t]: (_g, v, x) => { window.__stub[t].push([v, x && x.equip]); return { type: t, value: v, equip: x && x.equip }; } } });
    g.state.mapSize = g.state.maxMapSize = 8;
    g.state.gem = 5000; g.state.coin = 5000;
    // The soup pot earns gold, so give it a few levels and a second line to make average income worth looking at.
    const [px, py] = g.state.works[0].pos;
    const near = g.emptyCells().sort((a, b) => Math.hypot(a[0] - px, a[1] - py) - Math.hypot(b[0] - px, b[1] - py))[0];
    g.place(3, near, 0);                    // the chest next to the soup pot, in the middle of the screen, for the real tap
    for (const a of [5, 8, 12, 14, 87, 90, 97]) g.place(a, g.emptyCells()[0], 0);
    g.state.gold = { f: 5, e: 6 };
  });
  await wait(2500);
  await shot('01-forest');
  const ids = await st(() => Object.fromEntries(window.__game.state.works.map(w => [w.a, w.id])));
  const W = a => `window.__game.state.works.find(w => w.a === ${a})`;
  check('all eight specials placed and full', await st(() => [3, 5, 8, 12, 14, 87, 90, 97].every(a => window.__game.state.works.some(w => w.a === a))));

  // ---- chest: real click on the canvas until the dialog opens ----
  const box = await page.locator('#game').boundingBox();
  let opened = false;
  const cell = await st(() => window.__game.state.works.find(w => w.a === 3).pos);
  await page.evaluate(() => { window.__hud.close && window.__hud.close(); });
  outer: for (let y = 260; y < 620; y += 30) {
    for (let x = 60; x < box.width - 60; x += 30) {
      await page.mouse.click(box.x + x, box.y + y);
      await wait(30);
      if (await page.locator('.sp-dim').count()) {
        if ((await page.locator('.sp-title').first().textContent()) === await st(() => window.__hud.t('title_gacha'))) { opened = true; break outer; }
        await page.locator('.sp-dim .sp-x').first().click();
      }
      if (await st(() => !!window.__hud.panel)) await st(() => window.__hud.close());
    }
  }
  void cell;
  check('tapping the chest on the canvas opens its dialog', opened);
  if (!opened) await st(() => window.__specials.open(window.__game.state.works.find(w => w.a === 3)));
  await wait(400);
  await shot('02-chest');
  const v0 = await st(() => window.__game.state.works.find(w => w.a === 3).v);
  await page.locator('.sp-dim .sp-btn').first().click();
  await wait(500);
  await shot('03-chest-reward');
  check('free chest open draws 1 card (equip reveal) and spends one of 5', (await st(() => window.__game.state.works.find(w => w.a === 3).v)) === v0 - 1 && await page.locator('.eq-pop .row').count() === 1);
  await closeDialog();
  const g0 = await st(() => window.__game.state.gem);
  await st(() => window.__specials.open(window.__game.state.works.find(w => w.a === 3)));
  await page.locator('.sp-dim .sp-btn').nth(1).click();
  await wait(300);
  await shot('03b-chest-gem');
  check('gem open costs 300 and draws 3 cards', (await st(() => window.__game.state.gem)) === g0 - 300 && await page.locator('.eq-pop .row').count() === 3);
  await closeDialog();

  // ---- jar fairy ----
  await st(() => { const g = window.__game; g.state.works.find(w => w.a === 5).v = 1; });
  await wait(700);
  await shot('04-jar-hud');
  const jarVisible = await st(() => document.querySelector('[data-n="set_jar"]').style.display !== 'none');
  check('jar icon shows on the HUD when charged', jarVisible);
  await page.locator('[data-n="set_jar"] [data-n="bt_jar"] .w').first().click({ force: true });
  await wait(400);
  await shot('05-jar-bubble');
  const bubble = await st(() => document.querySelector('[data-n="set_jini"]').style.display !== 'none');
  check('tapping the jar shows the fairy bubble', bubble);
  const gj = await gold();
  await page.locator('[data-n="set_jini"] [data-n="bt_yes"] .w').first().click({ force: true });
  await wait(300);
  const gain = (await gold()) - gj;
  const expect = await st(() => { const g = window.__game; return g.averageIncome().f * 10 ** g.averageIncome().e * 3600 / 20; });
  check('free jar button pays 1/20 of the jar gold', gain > 0 && Math.abs(gain / expect - 1) < 0.05, `${gain} vs ${expect}`);
  check('jar empties', (await st(() => window.__game.state.works.find(w => w.a === 5).v)) === 0);
  await st(() => { window.__game.state.works.find(w => w.a === 5).v = 1; });
  await wait(600);
  await page.locator('[data-n="set_jar"] [data-n="bt_jar"] .w').first().click({ force: true });
  await wait(200);
  const gj2 = await gold();
  await page.locator('[data-n="set_jini"] [data-n="bt_yes"] ~ [data-n="bt_yes"] .w').first().click({ force: true });
  await wait(300);
  check('ad jar button pays all at once', (await gold()) - gj2 > expect * 15, `${(await gold()) - gj2}`);

  // ---- balloon ----
  await st(() => window.__specials.reset());   // the chest scan above may have tapped other facilities
  await wait(400);
  await shot('06-balloon-hud');
  check('balloon icon shows when the search light has a charge', await st(() => document.querySelector('.sp-hudbtn').style.display !== 'none'));
  const lv = await st(() => window.__game.state.works.find(w => w.a === 12).v);
  const gb = await gold();
  await page.locator('.sp-hudbtn').click({ force: true });
  await wait(300);
  await shot('07-balloon');
  for (let i = 0; i < 13; i++) { await page.locator('.sp-balloon').click({ force: true, noWaitAfter: true }).catch(() => {}); await wait(40); }
  await wait(300);
  check('13 taps pop it: gold up, one charge spent', (await gold()) > gb && (await st(() => window.__game.state.works.find(w => w.a === 12).v)) === lv - 1, `${lv} -> ${await st(() => window.__game.state.works.find(w => w.a === 12).v)}`);

  // ---- crane ----
  const c0 = await st(() => ({ v: window.__game.state.works.find(w => w.a === 14).v, coin: window.__game.state.coin, gem: window.__game.state.gem, gold: 0 }));
  const gc = await gold();
  await st(() => { const g = window.__game, o = g.reward.bind(g); window.__rw = []; g.reward = (t, v, x) => { const r = o(t, v, x); if (x && x.from) window.__rw.push([t, x.from, !!r]); return r; }; });
  await st(() => window.__specials.open(window.__game.state.works.find(w => w.a === 14)));
  await wait(400);
  await shot('08-crane');
  await page.locator('.sp-dim .sp-btn:has-text("▼")').click();
  await wait(1200);
  await shot('09-crane-grab');
  await page.waitForSelector('.sp-pop', { state: 'attached', timeout: 20000 });
  await wait(600);
  await shot('10-crane-reward');
  const c1 = await st(() => ({ v: window.__game.state.works.find(w => w.a === 14).v, coin: window.__game.state.coin, gem: window.__game.state.gem }));
  const rw = await st(() => window.__rw);
  const paid = rw.length === 1 && rw[0][1] === 'crane' && rw[0][2] && [4, 101, 3, 6002].includes(rw[0][0]);
  check('crane: one play spent, one ball reward paid (coin 30 / gold 800 s / gem 5 / bait)', c1.v === c0.v - 1 && paid && (rw[0][0] !== 4 || c1.coin - c0.coin === 30) && (rw[0][0] !== 3 || c1.gem - c0.gem === 5), JSON.stringify([c0, c1, rw]));
  await closeDialog();

  // ---- elephant trader ----
  await st(() => { const d = new Date(); d.setHours(14, 0, 0, 0); window.__game.state.specials.skewMs = d.getTime() - Date.now(); });
  await wait(900);
  await shot('11-trader-hud');
  check('elephant icon shows inside the window', await st(() => document.querySelector('[data-n="set_trader"]').style.display !== 'none'));
  await page.locator('[data-n="set_trader"] [data-n="bt_trader"] .w').first().click({ force: true });
  await wait(500);
  await shot('12-trader');
  const slots = await page.locator('.sp-slot:not(.gap)').count();
  check('trader shows stock slots', slots >= 3, `${slots}`);
  const gem1 = await st(() => window.__game.state.gem);
  const stock = await st(() => window.__game.state.specials.trader.slots);
  const priceOfLast = stock.filter(Boolean).at(-1).cost;
  await page.locator('.sp-slot:not(.gap)').last().click();
  await wait(400);
  await shot('13-trader-bought');
  check('buying a slot pays its gem price', (await st(() => window.__game.state.gem)) === gem1 - priceOfLast, `${gem1} - ${priceOfLast}`);
  // furniture (type 6) and item slots are stocked now that the furniture / item owners exist
  check('trader stock has no empty slot: 9 slots, 2-3 furniture (type 6, 300-400 gems)', stock.length === 9 && stock.every(Boolean) && stock[2].type === 6 && stock[3].type === 6 && [300, 400].includes(stock[2].cost), JSON.stringify(stock.map(x => x && [x.type, x.cost])));
  const furCost = stock[2].cost;
  const fur0 = await st(() => ({ n: window.__game.feat.furniture.count(window.__game, window.__game.state.specials.trader.slots[2].value), gem: window.__game.state.gem }));
  if (await page.locator('.sp-pop').count()) { await page.locator('.sp-pop').first().click({ force: true, position: { x: 5, y: 5 } }); await wait(300); }
  await page.locator('.sp-slot:not(.gap)').nth(2).click();
  await wait(400);
  await shot('13b-trader-furniture');
  check('buying the furniture slot adds the furniture and pays its gems', await st(() => window.__game.feat.furniture.count(window.__game, window.__game.state.specials.trader.slots[2].value)) === fur0.n + 1 && (await st(() => window.__game.state.gem)) === fur0.gem - furCost);
  await closeDialog();

  // ---- music ----
  await st(() => window.__specials.open(window.__game.state.works.find(w => w.a === 90)));
  await wait(300);
  await page.locator('.sp-tabs div').nth(1).click();
  await wait(200);
  await shot('14-music');
  const coin1 = await st(() => window.__game.state.coin);
  await page.locator('.sp-list .sp-item .sp-btn').first().click();
  await wait(200);
  check('buying a track costs 400 coins', (await st(() => window.__game.state.coin)) === coin1 - 400);
  await page.locator('.sp-tabs div').nth(0).click();
  await page.locator('.sp-list .sp-item .sp-btn').last().click();
  await wait(200);
  check('picking an owned track sets it', await st(() => window.__game.state.specials.bgm !== 1));
  await closeDialog();

  // ---- special order board ----
  await st(() => { const g = window.__game; const o = g.state.specials.order; for (let i = 0; i < o.need; i++) g.sellItem({ a: o.food, p: { f: 1, e: 0 } }); });
  await st(() => window.__specials.open(window.__game.state.works.find(w => w.a === 8)));
  await wait(500);
  await shot('15-board');
  const gold2 = await gold();
  await page.locator('.sp-dim .sp-btn').click();
  await wait(300);
  check('finished order pays gold and draws a new one', (await gold()) > gold2 && await st(() => window.__game.state.specials.order.have === 0));
  await closeDialog();

  // ---- basketball (hoop sweeps; tap when it is above the ball) ----
  await st(() => window.__specials.open(window.__game.state.works.find(w => w.a === 97)));
  await wait(300);
  await shot('16-basket');
  const b0 = await st(() => window.__game.state.works.find(w => w.a === 97).v);
  await page.locator('.sp-dim .sp-btn').click();
  await page.waitForFunction(() => window.__sp.basket.phase === 'play', null, { timeout: 30000 });
  await shot('17-basket-play');
  const goals = await page.evaluate(() => new Promise(res => {
    const court = document.querySelector('.sp-court');
    const f = () => {
      const b = window.__sp.basket;
      if (b.phase === 'done' || b.phase === 'idle' || !document.querySelector('.sp-court')) return res(b.goals);
      if (b.phase === 'play' && !b.shot && Math.abs(b.hx - 320) < 40) court.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      requestAnimationFrame(f);
    };
    f();
  }));
  await wait(600);
  await shot('18-basket-end');
  const bs = await st(() => window.__game.state.specials.basket);
  check('basketball: a game spent, goals scored, points counted', (await st(() => window.__game.state.works.find(w => w.a === 97).v)) === b0 - 1 && goals >= 1 && bs.total === goals * 10, `${goals} goals, ${JSON.stringify(bs)}`);
  await closeDialog();

  // ---- persistence ----
  await st(() => dispatchEvent(new Event('pagehide')));
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  const kept = await st(() => { const s = window.__game.state.specials; return { bgm: s.bgm, owned: s.bgmOwned.length, total: s.basket.total, works: window.__game.state.works.length }; });
  check('reload keeps tracks, basketball score and facilities', kept.bgm !== 1 && kept.owned === 3 && kept.total === goals * 10 && kept.works >= 9, JSON.stringify(kept));
  await shot('19-reload');
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`${pass} passed, ${fail} failed`);
  await browser.close();
  if (srv) srv.close();
  process.exit(fail ? 1 : 0);
})();
