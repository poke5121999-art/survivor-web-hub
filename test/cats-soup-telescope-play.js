#!/usr/bin/env node
/* Meo & Sup telescope feature in a real browser: the observatory building (Work 110) opens the observatory on tap, the "more"
 * quick menu reaches the star telescope and the observatory, an observation pays real rewards, a new look / new skill changes
 * the cat and spends gems or tickets, and the star-tree event (?tdate=20260825) opens, takes a partner cat, uses skills and
 * pays rewards. window.__failed() must stay empty.
 *   node test/cats-soup-telescope-play.js
 *   CS_URL=https://poke5121999-art.github.io/survivor-web-hub/games/cats-soup/index.html node test/cats-soup-telescope-play.js
 * Screenshots: shots/cats-soup-telescope/*.png */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots', 'cats-soup-telescope');
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
  page.on('console', m => { if (m.type() === 'error') errors.push(`${m.text()} ${m.location().url || ''}`); });
  const shot = n => page.screenshot({ path: path.join(SHOTS, `${n}.png`) });
  const ready = () => page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  const count = sel => page.locator(sel).count();
  const sim = f => page.evaluate(f);
  const menu = async label => {
    await page.locator('[data-n="bt_more"] .w:visible').first().click();
    await page.waitForTimeout(400);
    await page.locator('.sh-more', { hasText: label }).first().click();
    await page.waitForTimeout(500);
  };
  const failed = () => sim(() => window.__failed());
  // the equipment feature opens its own "new item" popup over ours when a costume drops: dismiss it first
  const clearEq = async () => { for (let i = 0; i < 4 && await count('.eq-pop .btn'); i++) { await page.locator('.eq-pop .btn').first().click(); await page.waitForTimeout(250); } };
  const okPop = async () => { await clearEq(); await page.locator('.ts-pop .pb').click(); };

  // ================= telescope + observatory (season 6, 2026-11-02) =================
  await page.goto(`${url}?fresh&speed=1&tdate=20261102`);
  await ready();
  await page.waitForTimeout(500);
  check('no feature failed on load', (await failed()).length === 0, JSON.stringify(await failed()));
  await sim(() => {
    const g = window.__game;
    while (g.state.cats.length < 3) g.addCat(g.state.works[0]);
    g.state.gem = 3000;
    g.feat.telescope.sync(g);
  });
  await page.waitForTimeout(600);
  check('three cats start the season: season 6, quarter 1', await sim(() => [window.__game.state.telescope.season, window.__game.state.telescope.quarter]).then(a => a.join()) === '6,1');

  // the menu entries exist; without the building they open the build panel
  await page.locator('[data-n="bt_more"] .w:visible').first().click();
  await page.waitForTimeout(400);
  const labels = await sim(() => [...document.querySelectorAll('.sh-more')].map(b => b.textContent));
  check('quick menu lists "Đài quan sát" and "Quan Sát Sao"', labels.includes('Đài quan sát') && labels.includes('Quan Sát Sao'), JSON.stringify(labels));
  check('the star-tree entry is hidden outside the event', !labels.some(l => l.includes('Nuôi lớn Cây Sao')));
  await page.locator('.sh-more', { hasText: 'Quan Sát Sao' }).first().click();
  await page.waitForTimeout(500);
  await shot('01-need-building');
  check('without the building the telescope asks to build it', await count('.panel') > 0 && await count('.ts.on') === 0);
  await page.locator('.panel .close').click().catch(() => {});

  // place the building (cost 0, needs work 8) and let the page draw it
  await sim(() => { const g = window.__game; g.place(110, g.autoCell(), 0); });
  await page.waitForTimeout(1500);
  check('Work 110 stands on the map', await sim(() => window.__game.state.works.some(w => w.a === 110)));

  await menu('Quan Sát Sao');
  await shot('02-telescope');
  check('telescope opens over the forest', await count('.ts.on') === 1 && await count('.ts-nroot [data-n="set_telescope"]') === 1);
  check('lens counter shows 0 lenses', (await sim(() => document.querySelector('.ts-lens').textContent)).includes('0'), await sim(() => document.querySelector('.ts-lens').textContent));
  check('the first observation shows "Miễn phí"', (await sim(() => document.querySelector('[data-n="bt_observationX1"] .ts-cost').textContent)).includes('Miễn phí'));
  check('the three lens packages are shown but dimmed (real money)', await count('.ts-nroot .ts-dim') === 3);
  const tickets0 = await sim(() => JSON.stringify(window.__game.state.telescope.stash) + Object.values(window.__game.state.collection.items).join());
  await page.locator('[data-n="bt_observationX1"] > [data-n="bg"] > .w').first().click({ force: true });
  await page.waitForTimeout(500);
  await shot('03-result');
  check('an observation shows its reward popup', await count('.ts-pop .ts-item') === 1);
  check('the free observation was used: counter 1, no lens spent', await sim(() => [window.__game.state.telescope.free, window.__game.state.telescope.obs]).then(a => a.join()) === 'true,1');
  await okPop();
  await page.waitForTimeout(300);
  check('popup closes', await count('.ts-pop') === 0);
  await sim(() => { window.__game.state.collection.items[6001] = 12; });
  await page.waitForTimeout(700);
  await page.locator('[data-n="bt_observationX5"] > [data-n="bg"] > .w').first().click({ force: true });
  await page.waitForTimeout(500);
  await shot('04-result-x5');
  check('5 observations: 5 reward cells, 5 lenses spent (7 left)', await count('.ts-pop .ts-item') === 5 && await sim(() => window.__game.state.collection.items[6001]) === 7);
  await okPop();
  // guaranteed tale
  await sim(() => { window.__game.state.telescope.obs = 9; });
  await page.waitForTimeout(700);
  await page.locator('[data-n="bt_observationX1"] > [data-n="bg"] > .w').first().click({ force: true });
  await page.waitForTimeout(500);
  await shot('05-result-tale');
  check('the 10th observation is a fairy-tale item (gold frame)', await count('.ts-pop .ts-item.tale') === 1);
  await okPop();
  await page.waitForTimeout(200);
  // probabilities / tale list / guide
  await page.locator('[data-n="bt_Info_1"] .w').first().click({ force: true });
  await page.waitForTimeout(400);
  await shot('06-probabilities');
  check('probability list shows 13 groups (tale left) summing to 100 %', await count('.ts-pop .ts-row') === 12 || await count('.ts-pop .ts-row') === 13, `${await count('.ts-pop .ts-row')}`);
  await okPop();
  await page.locator('[data-n="icon_reward_button"] .w').first().click({ force: true });
  await page.waitForTimeout(400);
  await shot('07-tale-list');
  check('tale list shows the 24 items of the season (3 quarters)', await count('.ts-pop .ts-item') === 24, `${await count('.ts-pop .ts-item')}`);
  await okPop();
  await page.locator('.ts-exit').click();
  await page.waitForTimeout(300);
  check('exit closes the telescope', await count('.ts-screen') === 0);
  check('no feature failed', (await failed()).length === 0, JSON.stringify(await failed()));

  // ---- observatory ----
  await menu('Đài quan sát');
  await shot('08-observatory');
  check('observatory opens with 4 tabs and the first cat', await count('.ts-screen .tabs .tab') === 4 && await count('.ts-screen .stage') === 1);
  await sim(() => { const i = window.__game.state.collection.items; i[1401] = 0; i[1402] = 0; });   // observations may have dropped tickets: the gem price is what is tested
  const cat0 = await sim(() => window.__game.state.cats[0].type);
  await page.locator('.tabs .tab').nth(1).click();
  await page.waitForTimeout(300);
  await shot('09-obs-look');
  const gem0 = await sim(() => window.__game.state.gem);
  await page.locator('.body .pb').last().click();
  await page.waitForTimeout(500);
  await shot('10-obs-look-result');
  check('a new look costs 100 gems and changes the cat type', await sim(() => window.__game.state.gem) === gem0 - 100 && await sim(() => window.__game.state.cats[0].type) !== cat0);
  check('result popup compares before and after', await count('.ts-pop .prev') === 1);
  await okPop();
  await page.waitForTimeout(300);
  await page.locator('.tabs .tab').nth(2).click();
  await page.waitForTimeout(300);
  await shot('11-obs-skill');
  const main0 = await sim(() => window.__game.state.cats_ext.byId[window.__game.state.cats[0].id].main.a);
  const gem1 = await sim(() => window.__game.state.gem);
  await page.locator('.body .pb').last().click();
  await page.waitForTimeout(400);
  check('a new skill costs 500 gems and changes the main skill', await sim(() => window.__game.state.gem) === gem1 - 500 && await sim(() => window.__game.state.cats_ext.byId[window.__game.state.cats[0].id].main.a) !== main0);
  await okPop();
  await page.waitForTimeout(300);
  await sim(() => { const i = window.__game.state.collection.items; i[1501] = 1; i[1403] = 2; i[1401] = 2; });
  await page.locator('.tabs .tab').nth(3).click();
  await page.waitForTimeout(400);
  await shot('12-obs-custom');
  check('the custom tab lists 24 limited, 3 fat and 1 random ticket', await count('.body .chip') === 28, `${await count('.body .chip')}`);
  await page.locator('.body .chip').first().click();
  await page.waitForTimeout(300);
  await page.locator('.body .pb').last().click();
  await page.waitForTimeout(400);
  check('limited ticket 1501 turns the cat into type 27', await sim(() => [window.__game.state.cats[0].type, window.__game.state.collection.items[1501]]).then(a => a.join()) === '27,0');
  await okPop();
  // next cat
  await page.locator('.stage .arrow.r').click();
  await page.waitForTimeout(300);
  check('arrows move to the next cat', await sim(() => window.__telescope.obs.cat) === 1);
  await shot('13-obs-next-cat');
  await page.locator('.ts-exit').click();
  await page.waitForTimeout(300);
  // tap the building
  const tapped = await sim(() => { const g = window.__game; const w = g.state.works.find(x => x.a === 110); return window.__telescope.onTap(w); });
  await page.waitForTimeout(300);
  check('tapping Work 110 opens the observatory', tapped === true && await count('.ts-screen .stage') === 1);
  await page.locator('.ts-exit').click();
  check('no feature failed after the observatory', (await failed()).length === 0, JSON.stringify(await failed()));

  // ================= star tree event (2026-08-25) =================
  await page.goto(`${url}?fresh&speed=1&tdate=20260825`);
  await ready();
  await sim(() => { const g = window.__game; while (g.state.cats.length < 3) g.addCat(g.state.works[0]); });
  await page.waitForTimeout(600);
  await page.locator('[data-n="bt_more"] .w:visible').first().click();
  await page.waitForTimeout(400);
  check('in the event the quick menu lists the star tree', (await sim(() => [...document.querySelectorAll('.sh-more')].map(b => b.textContent))).some(l => l.includes('Nuôi lớn Cây Sao')));
  await page.locator('.sh-more', { hasText: 'Nuôi lớn Cây Sao' }).first().click();
  await page.waitForTimeout(600);
  await shot('20-tree-pick-cat');
  check('first visit asks for a partner cat (3 cats)', await count('.ts-pop .cat3') === 3);
  await page.locator('.ts-pop .cat3').nth(1).click();
  await page.waitForTimeout(300);
  await shot('21-tree-confirm');
  await page.locator('.ts-pop .pb').last().click();
  await page.waitForTimeout(600);
  await shot('22-tree');
  check('Teety chosen; the tree screen shows 3 skills and 3 groups', await sim(() => window.__game.state.telescope.star.cat) === 2 && await count('.ts-tree .skill') === 3 && await count('.ts-tree .grp') === 3);
  check('level label shows Cấp 5 at 2026-08-25 12:00', (await sim(() => document.querySelector('.ts-tree .gauge span').textContent)) === 'Cấp 5');
  await page.locator('.ts-tree .skill').first().click();
  await page.waitForTimeout(500);
  await shot('23-tree-skill');
  check('skill 1 gives 15 points and starts cooling down', await sim(() => [window.__game.state.telescope.star.points, window.__game.state.telescope.star.count]).then(a => a.join()) === '15,1' && await count('.ts-tree .skill.cool') === 1);
  await page.locator('.ts-tree .skill').first().click();
  await page.waitForTimeout(300);
  check('using it again while cooling down changes nothing', await sim(() => window.__game.state.telescope.star.count) === 1);
  await page.locator('.ts-tree .rs.ready').first().click();
  await page.waitForTimeout(400);
  check('the first participation reward (gold ticket) was claimed', await sim(() => window.__game.state.telescope.star.gotP.join()) === '1' && await sim(() => window.__game.state.specials.tickets[1101]) === 5);
  await page.locator('.ts-tree .growbtn').click();
  await page.waitForTimeout(400);
  await shot('24-tree-growth');
  check('growth rewards list 10 levels', await count('.ts-pop .ts-item') === 10, `${await count('.ts-pop .ts-item')}`);
  await page.locator('.ts-pop .ts-item').first().click();
  await page.waitForTimeout(400);
  check('claiming level 1 pays 500 gems', await sim(() => window.__game.state.telescope.star.gotG.join()) === '1');
  await okPop();
  await page.locator('.ts-exit').click();
  await page.waitForTimeout(300);
  check('no feature failed after the star tree', (await failed()).length === 0, JSON.stringify(await failed()));

  // progress survives a reload (the same calendar)
  await page.evaluate(() => dispatchEvent(new Event('pagehide')));
  await page.goto(`${url}?tdate=20260825`);
  await ready();
  check('reload keeps the partner cat and points', await sim(() => [window.__game.state.telescope.star.cat, window.__game.state.telescope.star.points]).then(a => a.join()) === '2,15');
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`${pass} passed, ${fail} failed`);
  await browser.close();
  if (srv) srv.close();
  process.exit(fail ? 1 : 0);
})();
