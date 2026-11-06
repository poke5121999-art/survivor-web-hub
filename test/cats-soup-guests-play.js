#!/usr/bin/env node
/* Meo & Sup feature "guests" in a real browser: frog prince in the rain (real click on the canvas, both buttons), the snail,
 * the golden butterfly, a guest vehicle crossing the forest, the hidden theme-14 quiz, deco blocks (shop, place, they sit on a
 * cell as facilities), the guest list and the wishlist. window.__failed() must stay empty.
 *   node test/cats-soup-guests-play.js
 *   CS_URL=https://poke5121999-art.github.io/survivor-web-hub/games/cats-soup/index.html node test/cats-soup-guests-play.js
 * Screenshots: shots/cats-soup-guests/*.png */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots', 'cats-soup-guests');
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
  const st = (fn, ...a) => page.evaluate(fn, ...a);
  const wait = ms => page.waitForTimeout(ms);
  const num = b => b.f * 10 ** b.e;
  const energy = () => st(() => { const e = window.__game.state.energy; return e.f * 10 ** e.e; });
  const failed = () => st(() => window.__failed());
  const closeAll = async () => { await st(() => { window.__guests.close(); window.__hud.close(); }); await wait(100); };
  const clickAt = async (kind) => {
    await st(k => window.__guests.focus(window.__guests.npc[k]), kind);
    await wait(150);
    const [x, y] = await st(k => window.__guests.screen(window.__guests.npc[k]), kind);
    await page.mouse.click(x, y);
    await wait(250);
  };

  await page.goto(`${url}?fresh&speed=1`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  await wait(1500);
  await st(() => {
    const g = window.__game;
    if (g.feat.guide && g.feat.guide.skip) g.feat.guide.skip(g);
    g.state.mapSize = g.state.maxMapSize = 4;
    g.state.gem = 5000; g.state.coin = 5000;
    while (g.state.cats.length < 3) g.state.cats.push({ id: g.state.nextId++, type: 14, work: g.state.works[0].id, heart: 0 });   // no 'cat' event: the welcome-cat window of the cats feature would cover the screen
    g.state.gold = { f: 5, e: 6 };
    for (const w of g.t.Work.filter(x => x.type === 3 && x.eventType === 0).slice(0, 2)) g.place(w.index, g.emptyCells()[0], 0);   // two rest props: the frog has energy to give
    g.state.gold = { f: 5, e: 6 };
    document.querySelector('.hud').dataset.t = '1';
  });
  await wait(500);
  check('feature mounted, nothing failed', (await failed()).length === 0, JSON.stringify(await failed()));

  // ---- frog prince ----
  await st(() => { const g = window.__game; g.feat.guests.setRain(g, true); g.feat.guests.npcStep(g); });
  await wait(1200);
  check('rain with 3 cats: the frog prince stands in the forest (sim and sprite)', await st(() => window.__game.feat.guests.activeNpc(window.__game) === 'frog' && window.__guests.npc.frog && window.__guests.npc.frog.visible));
  await shot('01-frog');
  const e0 = await energy();
  await clickAt('frog');
  check('a real click on the frog opens the gift window (set_froggift)', await page.locator('.gu-pop [data-n="set_frogGift"]').count() === 1);
  await shot('02-frog-window');
  const full = await st(() => { const e = window.__game.feat.guests.frogEnergy(window.__game); return e.f * 10 ** e.e; });
  await page.locator('.gu-pop [data-n="bt_earn"] .w').first().click({ force: true });
  await wait(300);
  const e1 = await energy();
  check('free button pays 1/20 of the frog energy and the frog leaves', Math.abs((e1 - e0) / (full / 20) - 1) < 0.02 && await st(() => window.__game.feat.guests.activeNpc(window.__game) === 'none'), `${e1 - e0} vs ${full / 20}`);
  await st(() => { const g = window.__game; g.feat.guests.npcStep(g); });
  await wait(600);
  await clickAt('frog');
  const e2 = await energy();
  await page.locator('.gu-pop [data-n="bt_earnAds"] .w').first().click({ force: true });
  await wait(300);
  check('ad button pays the whole amount at once', Math.abs(((await energy()) - e2) / full - 1) < 0.02);

  // ---- snail ----
  await st(() => { const g = window.__game; g.feat.guests.setRain(g, false); g.state.guests.snail.gone = -1000; g.feat.guests.npcStep(g); });
  await wait(1200);
  check('no rain: the snail comes', await st(() => window.__game.feat.guests.activeNpc(window.__game) === 'snail' && window.__guests.npc.snail.visible));
  await shot('03-snail');
  const gold0 = await st(() => { const e = window.__game.state.gold; return e.f * 10 ** e.e; });
  await clickAt('snail');
  check('click on the snail opens the window with the ad button only', await page.locator('.gu-pop [data-n="bt_earnAds"]').count() === 1 && await page.locator('.gu-pop [data-n="bt_earn"]').evaluate(n => n.style.display === 'none'));
  await shot('04-snail-window');
  await page.locator('.gu-pop [data-n="bt_earnAds"] .w').first().click({ force: true });
  await wait(300);
  const gold1 = await st(() => { const e = window.__game.state.gold; return e.f * 10 ** e.e; });
  check('snail pays gold and leaves', gold1 > gold0 && await st(() => window.__game.feat.guests.activeNpc(window.__game) === 'none'));

  // ---- golden butterfly ----
  await st(() => { const g = window.__game; g.state.guests.butterfly.ready = true; });
  await wait(1000);
  check('butterfly ready: it flutters in the forest', await st(() => window.__guests.npc.butterfly && window.__guests.npc.butterfly.visible));
  await shot('05-butterfly');
  const bf0 = await st(() => window.__game.feat.collection.itemCount(window.__game, 98));
  await clickAt('butterfly');
  check('click on the butterfly opens the mail-ads dialog', await page.locator('.gu-dlg .sp-btn').count() === 2);
  await shot('06-butterfly-dialog');
  await page.locator('.gu-dlg .sp-btn').nth(1).click();
  await wait(300);
  check('ad button gives 20 golden butterflies (10 x 2), event butterfly', (await st(() => window.__game.feat.collection.itemCount(window.__game, 98))) === bf0 + 20 && await st(() => !window.__game.state.guests.butterfly.ready));

  // ---- guest list and a guest vehicle ----
  await st(() => { const g = window.__game; for (const e of [18, 113, 204, 20, 122, 220]) g.feat.equip.grant(g, e); window.__guests.openGuests(); });
  await wait(500);
  await shot('07-guests-list');
  const rowsN = await page.locator('.panel .row').count();
  check('guest list: header + 15 guests', rowsN === 16, String(rowsN));
  await page.locator('.panel .row .tgl.get').first().click();
  await wait(300);
  check('"get" collects the sled guest (6 items owned)', await st(() => window.__game.feat.guests.isOn(window.__game, 1)));
  await shot('08-guest-owned');
  await page.locator('.panel .row .tgl.on').first().click();
  await wait(200);
  check('the switch turns the guest off', await st(() => !window.__game.feat.guests.isOn(window.__game, 1) && window.__game.feat.guests.isPossess(window.__game, 1)));
  await page.locator('.panel .row .tgl').first().click();
  await wait(200);
  await closeAll();
  await st(() => { const g = window.__game; const r = g.rng; g.rng = () => 0.5; g.feat.guests.checkGuest(g); g.rng = r; });
  await wait(2000);
  check('a guest vehicle is on the map and moves', await st(() => window.__guests.rides.size === 1));
  await st(() => window.__guests.focus([...window.__guests.rides.values()][0]));
  await wait(200);
  await shot('09-guest-vehicle');
  const p1 = await st(() => { const o = [...window.__guests.rides.values()][0]; return [o.position.x, o.position.z]; });
  await wait(800);
  const p2 = await st(() => { const o = [...window.__guests.rides.values()][0]; return [o.position.x, o.position.z]; });
  check('the vehicle travels along its line (z grows 5 per s for variant 1)', Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) > 1, JSON.stringify([p1, p2]));

  // ---- hidden theme-14 guest ----
  await st(() => { const g = window.__game; g.state.theme.theme = 14; g.state.clock += 700; });
  await wait(1500);
  check('theme 14: the hidden guest appears', await st(() => window.__game.state.guests.hidden.on && window.__guests.npc.hidden.visible));
  await shot('10-hidden');
  const m0 = await st(() => window.__game.feat.theme.moneyOf(window.__game, 1));
  await clickAt('hidden');
  check('click opens the quiz with three answers', await page.locator('.gu-dlg .gu-ans .sp-btn').count() === 3);
  await shot('11-quiz');
  const right = await st(() => { const g = window.__game, h = g.state.guests.hidden; return g.feat.guests.quizRow(g, h.quiz).question_correct; });
  const label = await st(k => window.__hud.t(k), right);
  await page.locator('.gu-dlg .gu-ans .sp-btn', { hasText: label }).first().click();
  await wait(400);
  await shot('12-quiz-right');
  check('the right answer pays special money (30 or 60)', [30, 60].includes((await st(() => window.__game.feat.theme.moneyOf(window.__game, 1))) - m0));
  await st(() => { window.__game.state.theme.theme = 0; });
  await wait(1800);

  // ---- deco blocks ----
  await st(() => window.__guests.openDeco(0));
  await wait(900);
  await shot('13-deco-shop');
  check('deco shop lists 12 blocks', await page.locator('.panel .row').count() === 12);
  const coin0 = await st(() => window.__game.state.coin);
  const works0 = await st(() => window.__game.ownedCount());
  await page.locator('.panel .row').nth(3).locator('.price').click();
  await wait(300);
  check('buying the 4th row (3004 mossy rock) costs 200 coins and fills the stock', (await st(() => window.__game.state.coin)) === coin0 - 200 && await st(() => window.__game.feat.guests.blockCount(window.__game, 3004)) === 1);
  await page.locator('.panel .tabs div').nth(1).click();
  await wait(700);
  await shot('14-deco-storage');
  check('storage tab shows the block', await page.locator('.panel .row').count() === 1);
  await page.locator('.panel .row .price').first().click();
  await wait(1500);
  const placed = await st(() => window.__game.state.works.find(w => w.a === 3004));
  check('"place" puts the block on an empty cell as a facility of type 21; expansion count unchanged', !!placed && await st(() => window.__game.work.get(3004).type === 21 && window.__game.ownedCount()) === works0);
  await closeAll();
  await st(p => { const g = window.__game; g.feat.guests.addBlock(g, 3001, 3); g.feat.guests.addBlock(g, 3005, 3); g.feat.guests.addBlock(g, 3013, 2); for (const a of [3001, 3005, 3013, 3001]) g.feat.guests.placeBlock(g, a, g.emptyCells().sort((x, y) => Math.hypot(x[0] - p[0], x[1] - p[1]) - Math.hypot(y[0] - p[0], y[1] - p[1]))[0]); }, placed.pos);
  await wait(2500);
  check('5 blocks on the field, the 3D object of each hangs on its facility object', await st(() => window.__game.state.works.filter(w => w.a > 3000).length) === 5 && await st(() => window.__guests.decorated()) === 5);
  await shot('15-deco-forest');
  const tapped = await st(() => { const w = window.__game.state.works.find(x => x.a === 3004); return window.__hud.selected === w; });
  check('a block never opens the facility card (upgrade, levels)', tapped === false);

  // ---- wishlist ----
  await st(() => window.__guests.openWish());
  await wait(500);
  await shot('16-wish-empty');
  await page.locator('.panel .tabs div').nth(1).click();
  await wait(700);
  await shot('17-wish-add');
  await page.locator('.panel .row .price').first().click();
  await wait(300);
  check('adding a hat to the wishlist', await st(() => window.__game.feat.guests.wishList(window.__game).length) === 1);
  await page.locator('.panel .tabs div').nth(0).click();
  await wait(400);
  check('the wishlist tab shows it', await page.locator('.panel .row .gu-x').count() === 1);
  await shot('18-wish-list');
  await page.locator('.panel .row .gu-x').first().click();
  await wait(200);
  check('removing it empties the list', await st(() => window.__game.feat.guests.wishList(window.__game).length) === 0);
  await closeAll();

  // ---- persistence ----
  await st(() => dispatchEvent(new Event('pagehide')));
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  await wait(1500);
  const kept = await st(() => { const s = window.__game.state.guests; return { blocks: s.blocks[3004], guest: s.list.join(), works: window.__game.state.works.filter(w => w.a > 3000).length }; });
  check('reload keeps the blocks and the guest', kept.blocks === 1 && kept.guest === '1' && kept.works === 5, JSON.stringify(kept));
  await wait(1500);
  await shot('19-reload');
  check('window.__failed() is empty at the end', (await failed()).length === 0, JSON.stringify(await failed()));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`${pass} passed, ${fail} failed`);
  await browser.close();
  if (srv) srv.close();
  process.exit(fail ? 1 : 0);
})();
