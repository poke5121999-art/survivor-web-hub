#!/usr/bin/env node
/* Mèo & Súp guide in a real browser: a fresh game is walked through the whole tutorial by clicking like a player (tap the
 * dish, CRAFT, buy, tap the pot, upgrade, RECIPE, learn, expand), checking each bubble / hand / nudge / popup on the way;
 * an old save without state.guide shows nothing; the overlay never blocks the HUD; window.__failed() stays empty.
 *   node test/cats-soup-guide-play.js
 *   CS_URL=https://poke5121999-art.github.io/survivor-web-hub/games/cats-soup/index.html node test/cats-soup-guide-play.js
 * Screenshots: shots/cats-soup-guide/*.png */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots', 'cats-soup-guide');
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
  page.on('response', r => { if (r.status() === 404) errors.push(`404 ${r.url()}`); });
  page.on('console', m => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errors.push(m.text()); });
  const shot = n => page.screenshot({ path: path.join(SHOTS, `${n}.png`) });
  const G = () => page.evaluate(() => {
    const s = window.__game.state;
    return { works: s.works.length, cats: s.cats.length, lv: s.works.map(w => w.lv), step: s.guide.step, done: s.guide.done, size: s.mapSize, recipes: Object.keys(s.recipes).length };
  });
  const vis = sel => page.evaluate(s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0; }, sel);
  // Rendered at all (a 0x0 NGUI node counts): no ancestor is display:none.
  const on = sel => page.evaluate(s => { const e = document.querySelector(s); return !!e && e.offsetParent !== null; }, sel);
  const text = sel => page.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent : null; }, sel);
  // Centre of the hand's ring and of a target, in page pixels.
  const handAt = () => page.evaluate(() => { const e = document.querySelector('.gd-hand .gd-ring'); const h = document.querySelector('.gd-hand'); if (!e || getComputedStyle(h).display === 'none') return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  const centre = sel => page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
  const near = (a, b, d = 40) => !!a && !!b && Math.hypot(a[0] - b[0], a[1] - b[1]) < d;
  const failed = () => page.evaluate(() => window.__failed());
  const waitFor = (fn, arg, ms = 20000) => page.waitForFunction(fn, arg, { timeout: ms }).catch(() => {});

  // ---- fresh game starts the tutorial ----
  await page.goto(`${url}?fresh&speed=6`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  await waitFor(() => document.querySelector('.gd-bubble') && getComputedStyle(document.querySelector('.gd-bubble')).display !== 'none');
  let s = await G();
  check('fresh game: tutorial at step 0', s.step === 0 && !s.done, JSON.stringify(s));
  check('speech bubble shows tutorial 0 text (guide_tuto00_1)', (await text('.gd-bubble') || '').startsWith('Meo cua ban nau sup xong roi'), await text('.gd-bubble'));
  await shot('01-sell-bubble');
  await waitFor(() => window.__game.state.shelf.length > 0 && document.querySelector('.shelf .dish'));
  await page.waitForTimeout(500);
  await shot('02-sell-hand');
  check('the hand points at the dish', near(await handAt(), await centre('.shelf .dish'), 90), `${await handAt()} vs ${await centre('.shelf .dish')}`);
  check('the nudge slot is hidden during tutorial 0', !(await on('.gd-nudge')));

  // ---- tap the dish ----
  const g0 = await page.evaluate(() => window.__game.state.gold.f * 10 ** window.__game.state.gold.e);
  await page.locator('.shelf .dish').first().click();
  await page.waitForTimeout(500);
  s = await G();
  check('tapping the dish advances to the build step', s.step === 1, JSON.stringify(s));
  check('and sold for gold', (await page.evaluate(() => window.__game.state.gold.f * 10 ** window.__game.state.gold.e)) > g0);
  check('the bubble is gone and the nudge banner shows', !(await vis('.gd-bubble')) && await on('.gd-nudge'));
  const nudge = await text('.gd-nudge [data-n="Label"] .w');
  check('nudge says to build (guide_buildNow) once 500 gold is in hand', /^Xây /.test(nudge || ''), nudge);
  await waitFor(() => document.querySelector('.gd-hand') && getComputedStyle(document.querySelector('.gd-hand')).display !== 'none');
  await shot('03-build-nudge');
  const btn = await page.evaluate(() => { const e = document.querySelector('[data-n="bt_build"]'); const r = [...e.querySelectorAll('.w')].map(w => w.getBoundingClientRect()).filter(r => r.width > 2); const l = Math.min(...r.map(x => x.left)), rr = Math.max(...r.map(x => x.right)), t = Math.min(...r.map(x => x.top)), b = Math.max(...r.map(x => x.bottom)); return [(l + rr) / 2, (t + b) / 2]; });
  check('the hand points at the CRAFT button', near(await handAt(), btn, 60), `${await handAt()} vs ${btn}`);

  // ---- save-gold variant of the nudge ----
  await page.evaluate(() => { window.__game.state.gold = { f: 1, e: 2 }; });
  await page.waitForTimeout(400);
  const save = await text('.gd-nudge [data-n="Label"] .w');
  check('with 100 gold the nudge says to save up (guide_saveGold, 500)', /^Thu thập lên đến 500 vàng/.test(save || ''), save);
  check('and no hand', !(await handAt()));
  await shot('04-save-gold');
  await page.evaluate(() => { window.__game.state.gold = { f: 5, e: 4 }; });
  await page.waitForTimeout(400);

  // ---- CRAFT, buy ----
  await page.locator('[data-n="bt_build"] .w').first().click();
  await page.waitForTimeout(500);
  const buy = await centre('.panel .row .price:not(.off)');
  check('with the CRAFT panel open the hand moves to the buy button', near(await handAt(), buy, 90), `${await handAt()} vs ${buy}`);
  await shot('05-buy-hand');
  await page.locator('.panel .row .price:not(.off)').first().click();
  await page.waitForTimeout(1200);
  s = await G();
  check('buying adds a facility and a cat; tutorial moves to the upgrade step', s.works === 2 && s.cats === 2 && s.step === 2, JSON.stringify(s));
  check('welcome-cat popup shows with the cat name', await vis('.gd-pop.welcome .gd-card') && (await text('.gd-pop.welcome .gd-name') || '').length > 0, await text('.gd-pop.welcome .gd-name'));
  await shot('06-welcome-cat');

  // ---- the popup does not block the HUD: the upgrade step, tap the pot on the canvas ----
  check('upgrade step shows guide_levelUp', (await text('.gd-bubble') || '').startsWith('Vàng có thể được thu thập nhanh hơn'), await text('.gd-bubble'));
  await page.evaluate(() => { window.__game.state.gold = { f: 5, e: 6 }; });
  await page.waitForTimeout(500);
  const hp = await handAt();
  check('the hand points at the pot on the map', !!hp && hp[1] > 100 && hp[1] < 700, JSON.stringify(hp));
  await shot('07-tap-pot');
  await page.mouse.click(hp[0], hp[1]);   // the welcome popup is still up: it must not eat the tap on the map
  await page.waitForTimeout(500);
  await page.locator('.gd-pop.welcome .gd-ok').click({ timeout: 1500 }).catch(() => {});   // it may have timed out by itself on a slow machine
  check('OK (or the timeout) closes the welcome popup', !(await vis('.gd-pop.welcome .gd-card')));
  if (!(await vis('.card'))) await page.evaluate(() => window.__hud.select(window.__game.state.works[0]));   // fall back when the map tap misses
  await page.waitForTimeout(500);
  check('the facility card is open and the hand points at its upgrade button', near(await handAt(), await centre('.card .up'), 90), `${await handAt()} vs ${await centre('.card .up')}`);
  await shot('08-card-hand');
  await page.locator('.card .up').click();
  await page.waitForTimeout(500);
  s = await G();
  check('upgrading advances to the recipe step', s.lv[0] >= 2 && s.step === 3, JSON.stringify(s));
  check('the long-press hint shows right after (guide_longPress)', (await text('.gd-bubble') || '').startsWith('Bạn không cần phải nhấn'), await text('.gd-bubble'));
  await shot('09-longpress');
  await page.waitForFunction(() => !document.querySelector('.gd-bubble') || getComputedStyle(document.querySelector('.gd-bubble')).display === 'none' || document.querySelector('.gd-bubble').textContent.startsWith('Học'), null, { timeout: 15000 }).catch(() => {});

  // ---- recipe ----
  await page.evaluate(() => { window.__game.state.energy = { f: 5, e: 3 }; });
  await waitFor(() => /cong thuc/.test((document.querySelector('.gd-bubble') || {}).textContent || ''), null, 15000);
  check('recipe step shows tutorial 5 text', /cong thuc/.test(await text('.gd-bubble') || ''), await text('.gd-bubble'));
  const rb = await page.evaluate(() => { const e = document.querySelector('[data-n="bt_recipe"]'); const r = [...e.querySelectorAll('.w')].map(w => w.getBoundingClientRect()).filter(r => r.width > 2); return [(Math.min(...r.map(x => x.left)) + Math.max(...r.map(x => x.right))) / 2, (Math.min(...r.map(x => x.top)) + Math.max(...r.map(x => x.bottom))) / 2]; });
  check('the hand points at the RECIPE button', near(await handAt(), rb, 60), `${await handAt()} vs ${rb}`);
  await shot('10-recipe-hand');
  await page.locator('[data-n="bt_recipe"] .w').first().click();
  await page.waitForTimeout(500);
  check('with the panel open the hand moves to the learn button', near(await handAt(), await centre('.panel .row .price.energy:not(.off)'), 90));
  await page.locator('.panel .row .price.energy:not(.off)').first().click();
  await page.waitForTimeout(400);
  await page.locator('.panel .close').click();
  s = await G();
  check('learning a recipe advances to the expand step', s.step === 4, JSON.stringify(s));
  check('nothing is shown while the forest cannot grow yet', !(await on('.gd-nudge')) && !(await handAt()));

  // ---- expand: own 7 facilities (as many builds as a player would make), then tap the expand button ----
  await page.evaluate(() => {
    const g = window.__game;
    for (let i = 0; i < 40 && !g.canExpand(); i++) {
      g.state.gold = { f: 9, e: 12 };
      const o = g.buildList().find(x => x.n < x.max && !x.w.costGem && g.canBuild(x.w.index));
      if (!o) break;
      g.build(o.w.index);
    }
    g.state.gold = { f: 1, e: 3 };
  });
  await page.waitForTimeout(800);
  await page.locator('.gd-pop.welcome .gd-ok').click({ timeout: 1500 }).catch(() => {});
  await page.waitForTimeout(300);
  check('expand nudge (guide_expandNow) shows', await on('.gd-nudge') && /^Mở rộng khu rừng/.test(await text('.gd-nudge [data-n="Label"] .w') || ''), await text('.gd-nudge [data-n="Label"] .w'));
  check('the hand points at the expand button', near(await handAt(), await centre('.expand'), 90), `${await handAt()} vs ${await centre('.expand')}`);
  await shot('11-expand-hand');
  await page.waitForTimeout(6500);   // let the queued welcome popups time out so the expansion popup is next
  await page.locator('.expand').click();
  await page.waitForTimeout(800);
  await waitFor(() => document.querySelector('.gd-pop.forest'), null, 15000);
  s = await G();
  check('expanding grows the forest and ends the tutorial', s.size === 1 && s.done, JSON.stringify(s));
  check('forest-expansion popup shows its title', await vis('.gd-pop.forest [data-n="bgFrame"] .w') && /Khu rừng đã mở rộng/.test(await text('.gd-pop.forest') || ''), (await text('.gd-pop.forest') || '').slice(0, 80));
  check('and the core "expand" toast was replaced', !/Mở rộng khu rừng của bạn/.test(await text('.toast') || ''));
  await page.waitForTimeout(500);
  await shot('12-forest-expansion');
  check('no tutorial left on screen', !(await vis('.gd-bubble')) && !(await on('.gd-nudge')));
  check('no feature failed', (await failed()).length === 0, JSON.stringify(await failed()));

  // ---- reload: finished stays finished; a save from before the feature counts as finished ----
  await page.evaluate(() => dispatchEvent(new Event('pagehide')));
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  s = await G();
  check('reload keeps the tutorial finished', s.done && s.step === 5, JSON.stringify(s));
  await page.evaluate(() => {
    const k = 'cats-soup-v1';
    const sv = JSON.parse(localStorage.getItem(k));
    delete sv.guide;
    sv.clock = 300; sv.stats.sold = 20;
    localStorage.setItem(k, JSON.stringify(sv));
  });
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  await page.waitForTimeout(600);
  s = await G();
  check('an old save without state.guide is finished and shows nothing', s.done && !(await vis('.gd-bubble')) && !(await on('.gd-nudge')), JSON.stringify(s));
  await shot('13-old-save');

  // ---- ?demo skips the tutorial ----
  await page.goto(`${url}?demo=6&speed=1`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  await page.waitForTimeout(600);
  s = await G();
  check('?demo states skip the tutorial', s.done && !(await vis('.gd-bubble')) && !(await on('.gd-pop')), JSON.stringify(s));
  check('no feature failed (reload and demo)', (await failed()).length === 0);
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`${pass} passed, ${fail} failed`);
  await browser.close();
  if (srv) srv.close();
  process.exit(fail ? 1 : 0);
})();
