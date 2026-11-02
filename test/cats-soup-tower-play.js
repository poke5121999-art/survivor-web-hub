#!/usr/bin/env node
/* Mèo & Súp Cat Tower in a real browser: the HUD tower button asks to build the tower, the overlay opens on the lobby,
 * the guide mission pays, the shop sells a prop, storage places it, a drag moves it, rotate/store work, cats are placed
 * and walk, size / cat slots / a second floor are bought in the expand panel, the accumulated reward shows its badge and
 * pays, and the way back to the forest works. window.__failed() must stay empty.
 *   node test/cats-soup-tower-play.js
 *   CS_URL=https://poke5121999-art.github.io/survivor-web-hub/games/cats-soup/index.html node test/cats-soup-tower-play.js
 * Screenshots: shots/cats-soup-tower/*.png */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots', 'cats-soup-tower');
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
  page.on('pageerror', e => { errors.push(String(e)); if (process.env.CS_STACK) console.log(e.stack); });
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = n => page.screenshot({ path: path.join(SHOTS, `${n}.png`) });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const TW = () => ev(() => { const g = window.__game, t = g.state.tower; return JSON.parse(JSON.stringify({ open: t.open, layers: t.layers, have: t.have, cats: t.cats, mission: t.mission, coin: g.state.coin, gem: g.state.gem })); });
  const rows = () => page.locator('.panel .row').count();
  const wait = ms => page.waitForTimeout(ms);
  const btn = i => page.locator('.tw-bar .tw-btn').nth(i);
  const overlay = () => ev(() => getComputedStyle(document.querySelector('.tw') || document.body).display);
  const badge = () => ev(() => getComputedStyle(document.querySelector('[data-n="accReward"]')).display);
  const piecePoint = idx => ev(async i => {
    const THREE = await import('three');
    const tw = window.__tower, e = [...tw.objs.values()][i];
    const b = new THREE.Box3().setFromObject(e.group), c = b.getCenter(new THREE.Vector3());
    c.project(tw.cam);
    const r = tw.dom.cv.getBoundingClientRect();
    return [r.left + (c.x + 1) / 2 * r.width, r.top + (1 - c.y) / 2 * r.height];
  }, idx);

  await page.goto(`${url}?fresh&demo=24`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  await wait(600);
  let s = await TW();
  check('fresh game: tower not built, work 15 is in the forest', !s.open && (await ev(() => window.__game.copies(15))) === 1);
  check('the HUD badge is hidden before there is a reward', (await badge()) === 'none');
  await shot('00-forest');

  // ---- opening ----
  const coin0 = s.coin;
  await page.locator('[data-n="bt_catTower"] .w').first().click();
  await wait(500);
  await shot('01-open-prompt');
  check('first press asks to build the tower (one row with the price)', await rows() === 1 && (await page.locator('.panel .price').textContent()).includes('300'));
  await page.locator('.panel .price').click();
  await wait(4500);
  s = await TW();
  check('paying 300 coins opens the tower with the lobby and floor 1', s.open && Object.keys(s.layers).join() === '0,1' && s.coin === coin0 - 300, `coin ${coin0} -> ${s.coin}`);
  check('the overlay is up and the HUD panel is gone', (await overlay()) === 'block' && await rows() === 0);
  await shot('02-lobby');
  check('title says THÁP CÁT and the floor label LF 12x12', (await page.locator('.tw-title h1').textContent()) === 'THÁP CÁT' && (await page.locator('.tw-title h2').textContent()).includes('12x12'));

  // ---- guide mission ----
  check('guide mission 0 is ready (the butler is placed)', s.mission.cur === 0 && s.mission.ready && (await page.locator('.tw-msn.ready').count()) === 1);
  await page.locator('.tw-msn').click({ force: true });
  await wait(400);
  await shot('03-mission');
  const c1 = s.coin;
  await page.locator('.panel .row .price:not(.off)').first().click();
  await wait(400);
  s = await TW();
  check('claiming pays 200 coins and moves to mission 1', s.coin === c1 + 200 && s.mission.cur === 1, `coin ${c1} -> ${s.coin} cur ${s.mission.cur}`);
  await page.locator('.panel .close').click();

  // ---- shop ----
  await btn(0).click();
  await wait(700);
  await shot('04-shop');
  const nShop = await rows();
  check('the shop lists props (169 always-on ones over the tabs)', nShop > 20, `${nShop} rows on the first tab`);
  const tabs = await page.locator('.panel .tabs div').count();
  check('four tabs: furniture, decoration, room design, floors', tabs === 4, `${tabs}`);
  const c2 = (await TW()).coin;
  await page.locator('.panel .row .price:not(.off)').first().click();
  await wait(300);
  s = await TW();
  check('buying the first prop (chair, 200 coins) puts one in storage', s.coin === c2 - 200 && s.have[1] === 1, `have ${JSON.stringify(s.have)}`);
  await page.locator('.panel .close').click();

  // ---- storage and placing ----
  await btn(1).click();
  await wait(500);
  await shot('05-storage');
  check('storage lists the chair', await rows() >= 1);
  await page.locator('.panel .row .price:not(.off)').first().click();
  await wait(1500);
  s = await TW();
  check('placing puts it on the lobby floor at the corner and selects it', s.layers[0].props.length === 1 && s.layers[0].props[0].x === 0 && (await page.locator('.tw-sel').evaluate(e => getComputedStyle(e).display)) === 'flex');
  await shot('06-placed');

  // ---- drag, rotate, store ----
  const [px, py] = await piecePoint(0);
  await page.mouse.move(px, py);
  await page.mouse.down();
  await page.mouse.move(px + 40, py + 60, { steps: 6 });
  await page.mouse.move(px + 80, py + 120, { steps: 6 });
  await page.mouse.up();
  await wait(600);
  s = await TW();
  const o = s.layers[0].props[0];
  check('dragging the selected piece moves it off the corner', o.x > 0 || o.y > 0, `now at ${o.x},${o.y}`);
  await shot('07-dragged');
  await page.locator('.tw-sel .tw-btn').nth(0).click();
  await wait(300);
  s = await TW();
  check('rotate turns the chair', s.layers[0].props[0].r === 1);
  await page.locator('.tw-sel .tw-btn').nth(1).click();
  await wait(300);
  s = await TW();
  check('store sends it back to storage (still owned)', s.layers[0].props.length === 0 && s.have[1] === 1);
  await btn(1).click();
  await wait(300);
  await page.locator('.panel .row .price:not(.off)').first().click();
  await wait(800);

  // ---- cats ----
  await btn(2).click();
  await wait(500);
  await shot('08-cats');
  const nCats = await rows();
  check('the cat list has every cat of the forest', nCats === (await ev(() => window.__game.state.cats.length)), `${nCats} rows`);
  await page.locator('.panel .row .price:not(.off)').first().click();
  await wait(300);
  await page.locator('.panel .row .price:not(.off)').nth(1).click();
  await wait(300);
  s = await TW();
  check('two cats stand in the lobby (cap 2)', Object.values(s.cats).filter(f => f === 0).length === 2);
  await page.locator('.panel .row .price').nth(2).click();
  await wait(300);
  s = await TW();
  check('a third cat is refused', Object.values(s.cats).filter(f => f === 0).length === 2);
  await page.locator('.panel .close').click();
  await wait(2500);
  check('both cats are drawn', (await ev(() => window.__tower.cats.size)) === 2);
  await shot('09-cats-walking');
  await wait(1500);
  await shot('09b-cats-walking');

  // ---- expand: size, cat slots, floor ----
  await btn(3).click();
  await wait(500);
  await shot('10-expand');
  const c3 = (await TW()).coin;
  await page.locator('.panel .chip.buy').first().click();
  await wait(500);
  s = await TW();
  check('size level 1 costs 300 coins and the lobby becomes 20x20', s.layers[0].area === 1 && s.coin === c3 - 300, `area ${s.layers[0].area} coin ${c3} -> ${s.coin}`);
  await page.locator('.panel .tabs div').nth(1).click();
  await wait(300);
  await shot('11-expand-cats');
  const g0 = (await TW()).gem;
  await page.locator('.panel .row .price:not(.off)').first().click();
  await wait(300);
  s = await TW();
  check('the 3rd cat slot of the lobby costs 300 gems', s.layers[0].cats === 1 && s.gem === g0 - 300, `gem ${g0} -> ${s.gem}`);
  await page.locator('.panel .tabs div').nth(2).click();
  await wait(300);
  await shot('12-expand-floors');
  await page.locator('.panel .row .price:not(.off)').first().click();
  await wait(300);
  s = await TW();
  check('floor 2 is built (350 coins)', !!s.layers[2], Object.keys(s.layers).join());
  await page.locator('.panel .close').click();
  await wait(1000);
  check('the elevator shows lobby, 1 F and 2 F', await page.locator('.tw-floors .f:not(.add)').count() === 3);
  await page.locator('.tw-floors .f:not(.add):not(.on)').first().click();
  await wait(1500);
  await shot('13-floor-2');
  check('switching floor changes the label', /^[12] F/.test(await page.locator('.tw-title h2').textContent()));

  // ---- accumulated reward ----
  await page.locator('.tw-top .tw-btn.round').click();
  await wait(400);
  check('the back button leaves for the forest', (await overlay()) === 'none');
  await ev(() => { window.__game.state.tower.off.t = 5 * 3600; });
  await wait(900);
  check('after 5 hours the HUD badge shows', (await badge()) !== 'none');
  await shot('14-forest-badge');
  const gold0 = await ev(() => window.__game.state.gold.f * 10 ** window.__game.state.gold.e);
  await page.locator('[data-n="bt_catTower"] .w').first().click();
  await wait(4000);
  await shot('15-idle-popup');
  check('entering with a reward waiting opens the popup with 5/72', (await page.locator('.panel .row .txt small').first().textContent()).includes('5/72'));
  await page.locator('.panel .row .price:not(.ads):not(.off)').first().click();
  await wait(500);
  const gold1 = await ev(() => window.__game.state.gold.f * 10 ** window.__game.state.gold.e);
  check('the claim pays gold', gold1 > gold0, `${gold0} -> ${gold1}`);
  check('claiming empties the counter', (await ev(() => window.__game.state.tower.off.stored)) === 0);
  await page.locator('.tw-top .tw-btn.round').click();
  await wait(900);
  check('the badge is gone again', (await badge()) === 'none');
  await shot('16-forest');

  check('no feature failed', JSON.stringify(await ev(() => window.__failed())) === '[]');
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`${pass} passed, ${fail} failed`);
  await browser.close();
  if (srv) srv.close();
  process.exit(fail ? 1 : 0);
})();
