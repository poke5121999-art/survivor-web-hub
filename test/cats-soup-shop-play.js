#!/usr/bin/env node
/* Mèo & Súp shop feature in a real browser: the shop window (free ad gems, gems -> gold, real-money goods disabled, stamp rally),
 * settings (sound on/off, reset save with confirm), the notice list and viewer, the "more" menu, the offline popup with the ad x2
 * and the double-speed ad.   node test/cats-soup-shop-play.js
 *   CS_URL=https://poke5121999-art.github.io/survivor-web-hub/games/cats-soup/index.html node test/cats-soup-shop-play.js
 * Screenshots: shots/cats-soup-shop-play/*.png */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots', 'cats-soup-shop-play');
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
  const errors = [];
  const ready = async page => { await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 }); await page.waitForTimeout(600); };
  const open = async (ctx, query = '') => {
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.setViewportSize({ width: 450, height: 800 });
    await page.goto(`${url}${query}`);
    await ready(page);
    return page;
  };
  const shotOf = page => n => page.screenshot({ path: path.join(SHOTS, `${n}.png`) });
  const num = b => b.f * 10 ** b.e;
  const click = (page, sel) => page.locator(sel).first().click({ force: true });
  const hud = '.hud';

  // ================= shop, settings, notices, more menu (fresh game) =================
  const ctx = await browser.newContext();
  let page = await open(ctx, '?fresh&speed=2');
  let shot = shotOf(page);
  check('page loads, no feature failed', (await page.evaluate(() => window.__failed())).length === 0);
  check('shop dot is lit: the daily free gems wait', await page.evaluate(() => getComputedStyle(document.querySelector('.sh-dot')).display === 'block'));

  // ---- shop ----
  await click(page, '[data-n="bt_shop"] .w');
  await page.waitForSelector('.sh-list .sh-card');
  await shot('01-shop-goods');
  const cards = await page.locator('.sh-list .sh-card').count();
  check('goods tab lists 26 cards (25 rows minus 3 furniture rows and the telescope-ticket row, plus 5 payable gem packages)', cards === 26, `${cards}`);
  const gem0 = await page.evaluate(() => window.__game.state.gem);
  await click(page, '.sh-list .sh-card:nth-child(1) .sh-b');
  await page.waitForTimeout(300);
  check('ad item pays 30 gems at once', (await page.evaluate(() => window.__game.state.gem)) === gem0 + 30);
  check('...and shows a check mark (once a day)', await page.locator('.sh-list .sh-card:nth-child(1) .sh-done').count() === 1);
  check('...and the dot is gone', await page.evaluate(() => getComputedStyle(document.querySelector('.sh-dot')).display === 'none'));
  const gold0 = num(await page.evaluate(() => window.__game.state.gold));
  const gem1 = gem0 + 30;
  await click(page, '.sh-list .sh-card:nth-child(2) .sh-b');
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({ gem: window.__game.state.gem, gold: window.__game.state.gold }));
  check('gold 1 h costs 100 gems', after.gem === gem1 - 100, `${after.gem}`);
  check('...and adds gold', num(after.gold) > gold0 + 1000, `${num(after.gold)}`);
  await shot('02-shop-bought');
  // gem packages: the last card is package 222 (2000 gems, forest theme 3); 1045 is an outfit + 500 gems
  await page.evaluate(() => { window.__game.state.gem = 20000; });
  const pk0 = await page.evaluate(() => window.__game.state.gem);
  await click(page, '.sh-list .sh-card:last-child .sh-b');
  await page.waitForTimeout(300);
  check('gem package 222 costs 2000 gems and adds theme 3', await page.evaluate(() => [window.__game.state.gem, window.__game.feat.theme.ownTheme(window.__game, 3)].join()) === `${pk0 - 2000},true`);
  check('...and shows a check mark (bought once)', await page.locator('.sh-list .sh-card:last-child .sh-done').count() === 1);
  await page.evaluate(() => { const l = document.querySelector('.sh-list'); l.scrollTop = l.scrollHeight; });
  await shot('02b-shop-packages');
  await click(page, '.sh-list .sh-card:nth-last-child(5) .sh-b');
  await page.waitForTimeout(300);
  check('package 1045 (7500 gems, +500 back) gives outfit 357', await page.evaluate(() => [window.__game.state.gem, window.__game.feat.equip.owned(window.__game, 357)].join()) === `${pk0 - 2000 - 7500 + 500},true`);
  await page.evaluate(g => { window.__game.state.gem = g; document.querySelector('.sh-list').scrollTop = 0; }, after.gem);
  if (await page.getByText('OK', { exact: true }).count()) await page.getByText('OK', { exact: true }).first().click({ force: true });   // the outfit level-up card of the equip feature
  await page.waitForTimeout(400);
  const iapCard = await page.evaluate(() => [...document.querySelectorAll('.sh-list .sh-card')].findIndex(c => /₩/.test(c.textContent)) + 1);
  check('a real-money gem pack is on the list', iapCard > 0, `${iapCard}`);
  await click(page, `.sh-list .sh-card:nth-child(${iapCard}) .sh-b`);
  await page.waitForTimeout(200);
  check('...shown disabled, tapping it changes nothing', (await page.evaluate(() => window.__game.state.gem)) === after.gem);
  await click(page, '[data-n="t1"] .w');
  await page.waitForTimeout(200);
  check('special tab: 14 real-money goods, all disabled', (await page.locator('.sh-list .sh-card .sh-b.off').count()) === 14, `${await page.locator('.sh-list .sh-card .sh-b.off').count()} off of ${await page.locator('.sh-list .sh-card').count()}`);
  await shot('03-shop-special');
  await click(page, '[data-n="t4"] .w');
  await page.waitForTimeout(300);
  const stamps0 = await page.evaluate(() => window.__game.state.shop.stamps);
  await click(page, '.sh-head .sh-b');
  await page.waitForTimeout(200);
  check('stamp tab: an ad view pays 10 stamps at once', (await page.evaluate(() => window.__game.state.shop.stamps)) === stamps0 + 10);
  await shot('04-shop-stamp');
  await click(page, '.sh-x');
  check('close button shuts the window', (await page.locator('.sh-layer').count()) === 0);

  // ---- settings ----
  await click(page, '[data-n="bt_option"] .w');
  await page.waitForSelector('.sh-layer [data-n="set_bgm"]', { state: 'attached' });
  await shot('05-option');
  const mute = () => page.evaluate(() => localStorage.getItem('cats-soup-mute'));
  check('opening the settings does not toggle the sound', (await mute()) !== '1');
  const offBtn = '[data-n="set_bgm"] [data-n="bt_off"] .w';
  await click(page, offBtn);
  check('"TẮT" turns the sound off', (await mute()) === '1');
  await click(page, '[data-n="set_bgm"] [data-n="bt_on"] .w');
  check('"BẬT" turns it on again', (await mute()) === '0');
  check('language is fixed to Vietnamese', (await page.locator('[data-n="bt_language"]').innerText()).includes('Tiếng Việt'));
  check('account / support tabs are hidden', (await page.evaluate(() => ['t2', 't3', 't4'].every(t => document.querySelector(`.sh-layer [data-n="tabs"] [data-n="${t}"]`).style.display === 'none'))));
  await click(page, '.sh-reset');
  await page.waitForSelector('.sh-confirm');
  await shot('06-reset-confirm');
  await click(page, '.sh-confirm .sh-b.gray');
  check('cancel keeps the window and the game', (await page.locator('.sh-confirm').count()) === 0 && (await page.locator('.sh-layer').count()) === 1);
  await click(page, '.sh-x');

  // ---- notices ----
  await click(page, '[data-n="bt_notice"] .w');
  await page.waitForSelector('.sh-notice [data-n="txt"]', { state: 'attached' });
  await shot('07-notice');
  const slots = await page.locator('.sh-notice > [data-n="set_noticeSlot"]').count();
  check('notice list shows the 7 information pages (no real-money events)', slots === 7, `${slots}`);
  await click(page, '.sh-notice [data-n="txt"] .w');
  await page.waitForSelector('.sh-nimg');
  await page.waitForTimeout(400);
  await shot('08-notice-page');
  check('the banner image of the page loads', await page.evaluate(() => { const i = document.querySelector('.sh-nimg'); return i.complete && i.naturalWidth > 100; }));
  check('the notice sound of the toggle did not fire (sound still on)', (await mute()) === '0');
  await click(page, '.sh-x');

  // ---- more menu ----
  await click(page, '[data-n="bt_more"] .w');
  await page.waitForSelector('.sh-more');
  await shot('09-more');
  const names = await page.locator('.sh-more').allInnerTexts();
  check('more menu lists only windows that exist (no raw string keys)', names.length >= 8 && names.every(n => !/^title_|^[a-z]+_[a-zA-Z]+$/.test(n.trim())), names.join(' | '));
  check('...with the shop, notices and settings', ['Cửa hàng', 'Lưu ý', 'Cài đặt'].every(n => names.some(x => x.includes(n))));
  await page.locator('.sh-more', { hasText: 'Hôm nay phải làm' }).click({ force: true });
  await page.waitForTimeout(300);
  check('an entry opens the other feature\'s window (missions panel)', (await page.locator('.hud .panel').count()) === 1);
  await page.evaluate(() => window.__hud.close());
  await click(page, '[data-n="bt_more"] .w');
  await page.waitForSelector('.sh-more');
  await page.locator('.sh-more', { hasText: /^\s*Cửa hàng\s*$/ }).first().click({ force: true });
  await page.waitForSelector('.sh-list .sh-card');
  check('the shop entry opens the shop', true);
  await click(page, '.sh-x');

  // ---- double speed ad ----
  check('double-speed button is offered', await page.evaluate(() => document.querySelector('[data-n="set_dbSpeedBt"]').style.display !== 'none'));
  await click(page, '[data-n="set_dbSpeedBt"] [data-n="bt_ads"] .w');
  await page.waitForTimeout(600);
  const left = await page.evaluate(() => window.__game.state.shop.doubleSec);
  check('the ad starts 300 s of double speed at once', left > 250 && left <= 300, `${left}`);
  check('...the button gives way to the countdown', await page.evaluate(() => document.querySelector('[data-n="set_dbSpeedBt"]').style.display === 'none' && document.querySelector('[data-n="set_dbSpeedEf"]').style.display !== 'none'));
  await shot('10-double-speed');
  check('no feature failed so far', (await page.evaluate(() => window.__failed())).length === 0);
  await page.close();
  await ctx.close();

  // ================= reset save (a real save in localStorage) =================
  const ctx2 = await browser.newContext();
  page = await open(ctx2, '');
  await page.evaluate(() => { window.__game.state.gem = 777; });
  await page.reload();
  await ready(page);
  check('the save is kept across a reload (777 gems)', (await page.evaluate(() => window.__game.state.gem)) === 777);
  await click(page, '[data-n="bt_option"] .w');
  await page.waitForSelector('.sh-reset');
  await click(page, '.sh-reset');
  await page.waitForSelector('.sh-confirm');
  const nav = page.waitForNavigation();
  await click(page, '.sh-confirm .sh-b.green');
  await nav;
  await ready(page);
  const fresh = await page.evaluate(() => ({ gem: window.__game.state.gem, works: window.__game.state.works.length }));
  check('reset save: the game restarts fresh (200 gems, 1 facility)', fresh.gem === 200 && fresh.works === 1, JSON.stringify(fresh));
  await shotOf(page)('11-after-reset');
  await page.close();
  await ctx2.close();

  // ================= offline popup with the ad x2 =================
  const ctx3 = await browser.newContext();
  const p1 = await open(ctx3, '?fresh');
  const save = await p1.evaluate(() => { const s = window.__game.save(); s.savedAt = Date.now() - 2 * 3600e3; return s; });
  await p1.close();
  const p2 = await ctx3.newPage();
  p2.on('pageerror', e => errors.push(String(e)));
  await p2.addInitScript(s => { if (!sessionStorage.__set) { sessionStorage.__set = 1; localStorage.setItem('cats-soup-v1', JSON.stringify(s)); } }, save);
  await p2.setViewportSize({ width: 450, height: 800 });
  await p2.goto(url);
  await ready(p2);
  await shotOf(p2)('12-offline');
  check('2 h away: the offline popup is shown instead of the toast', (await p2.locator('.sh-layer [data-n="bt_earnAds"]').count()) === 1);
  const info = await p2.evaluate(() => { const g = window.__game; const a = g.feat.shop.away(g); return { gold: g.state.gold, got: a.gold, secs: a.seconds }; });
  check('the popup holds the offline result (2 h = 7200 s, plus the seconds the test took)', info.secs >= 7200 && info.secs < 7300 && num(info.got) > 1000, `${info.secs} ${num(info.got)}`);
  await click(p2, '[data-n="bt_earnAds"] .w');
  await p2.waitForTimeout(400);
  const gold2 = num(await p2.evaluate(() => window.__game.state.gold));
  check('the ad pays the offline gold a second time at once (x2 in all)', Math.abs(gold2 - num(info.gold) - num(info.got)) < num(info.got) * 0.02 + 5000, `${gold2} vs ${num(info.gold)} + ${num(info.got)}`);
  check('...and the popup closes', (await p2.locator('.sh-layer').count()) === 0);
  check('no feature failed', (await p2.evaluate(() => window.__failed())).length === 0);
  await p2.close();
  await ctx3.close();

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' || '));
  await browser.close();
  if (srv) srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
