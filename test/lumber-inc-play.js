#!/usr/bin/env node
/* Lumber Inc (games/lumber-inc) in a real browser: loads blurred then sharp with stamped modules, W walks the player,
 * the opening plays through the HUD numbers (startup cash, peeler pad, forest gate, chopping, deposit, cash pile),
 * and progress survives a reload.
 *   node test/lumber-inc-play.js
 *   LI_URL=https://poke5121999-art.github.io/survivor-web-hub/games/lumber-inc/index.html node test/lumber-inc-play.js
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg' };
let pass = 0, fail = 0;
const check = (name, ok, detail) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); ok ? pass++ : fail++; };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, s) => {
      const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
      let exact = false;
      try { exact = fs.readdirSync(path.dirname(f)).includes(path.basename(f)); } catch (e) { /* no folder */ }
      if (!exact) { s.writeHead(404); s.end(); return; }
      fs.readFile(f, (e, b) => {
        if (e) { s.writeHead(404); s.end(); return; }
        s.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
        s.end(b);
      });
    }).listen(0, () => res(srv));
  });
}

(async () => {
  const srv = process.env.LI_URL ? null : await serve();
  const url = process.env.LI_URL || `http://localhost:${srv.address().port}/games/lumber-inc/index.html`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const kill = setTimeout(() => { console.log('  FAIL timed out after 420 s'); process.exit(1); }, 420000);
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [], missing = [], modules = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400) missing.push(`${r.status()} ${r.url()}`); });
    page.on('request', r => { if (/\/games\/lumber-inc\/(js|vendor)\/.*\.js/.test(r.url())) modules.push(r.url()); });

    const t0 = Date.now();
    await page.goto(`${url}?fresh`);
    await page.waitForFunction(() => window.__li && (window.__li.ready || window.__li.error), null, { timeout: 120000 });
    const li = await page.evaluate(() => ({ ready: window.__li.ready, error: window.__li.error, stages: window.__li.stages, blur: window.__li.blur }));
    check('loads with no error', li.ready && !li.error, li.error || `${((Date.now() - t0) / 1000).toFixed(1)} s`);
    const blurs = li.stages.map(s => s[1]);
    check('starts blurred and sharpens step by step', blurs[0] > 0 && blurs.every((b, i) => !i || b < blurs[i - 1]) && li.blur === 0,
      li.stages.map(([l, b, t]) => `${l} ${b}px @${t}ms`).join(', '));
    check('every module request carries the build stamp', modules.length > 10 && modules.every(u => /\?v=\d{8}[a-z]/.test(u)),
      `${modules.length} modules, unstamped: ${modules.filter(u => !/\?v=/.test(u)).map(u => u.split('/').pop()).join(', ') || 'none'}`);

    const hudCoins = () => page.evaluate(() => document.querySelector('[data-name="coin"] [data-name="txtCoins"]').textContent);
    check('HUD shows the original coin bar at 0', await hudCoins() === '0', await hudCoins());

    const p0 = await page.evaluate(() => ({ ...window.__li.sim.state.player }));
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1000);
    await page.keyboard.up('KeyW');
    const p1 = await page.evaluate(() => ({ ...window.__li.sim.state.player }));
    check('W walks the player', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 2, `moved ${Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(1)} m`);

    const go = (x, z) => page.evaluate(([x, z]) => { const s = window.__li.sim.state.player; s.x = x; s.z = z; }, [x, z]);
    const B = id => page.evaluate(id => { const b = window.__li.world.buildings.get(id); return { pad: b.pad && b.pad.center, money: b.moneyBox && b.moneyBox.middle, in: b.inBox && b.inBox.middle }; }, id);
    const gm = await B(-1);
    await go(gm.money.x, gm.money.z);
    await page.waitForTimeout(800);
    check('startup cash: 50 coins on the HUD', await hudCoins() === '50', await hudCoins());

    const peeler = await B(1001);
    await go(peeler.pad.x, peeler.pad.z);
    await page.waitForFunction(() => window.__li.sim.active(1001), null, { timeout: 15000 }).catch(() => {});
    const bought = await page.evaluate(() => ({ on: window.__li.sim.active(1001), exp: document.querySelector('[data-name="TxtExp"]').textContent,
      machine: window.__li.game.view.objects[window.__li.world.buildings.get(1001).activeRoot].visible }));
    check('peeler pad takes 30: machine shows, 20 coins left, 5/20 exp', bought.on && bought.machine && bought.exp === '5/20' && await hudCoins() === '20',
      JSON.stringify(bought));
    const gate = await B(10011);
    await go(gate.pad.x, gate.pad.z);
    await page.waitForFunction(() => window.__li.sim.active(10011), null, { timeout: 15000 }).catch(() => {});
    check('forest gate opens for 5 and its fence goes away', await page.evaluate(() => {
      const w = window.__li.world, v = window.__li.game.view;
      return window.__li.sim.active(10011) && w.buildings.get(10011).walls.every(i => !v.objects[i].visible);
    }));

    // Chop next to standing trees until 4 logs are on the back.
    await page.evaluate(() => { window.__li.speed = 3; });
    for (let k = 0; k < 40; k++) {
      const n = await page.evaluate(() => window.__li.sim.pack.count);
      if (n >= 4) break;
      await page.evaluate(() => {
        const L = window.__li, s = L.sim.state.player;
        if (L.sim.forest.choppable(s, () => true).length) return;
        const t = L.sim.forest.trees.filter(t => t.forest === 1 && t.state === 0 && t.pos.x > -20)
          .sort((a, b) => Math.hypot(a.pos.x - s.x, a.pos.z - s.z) - Math.hypot(b.pos.x - s.x, b.pos.z - s.z))[0];
        s.x = t.pos.x + 0.8; s.z = t.pos.z;
      });
      await page.waitForTimeout(700);
    }
    const chop = await page.evaluate(() => ({ pack: window.__li.sim.pack.count, back: window.__li.game.backItems.length,
      stumps: window.__li.sim.forest.trees.filter(t => t.state === 2).length }));
    check('chopping puts logs on the back and leaves stumps', chop.pack >= 4 && chop.back === chop.pack && chop.stumps >= 2, JSON.stringify(chop));

    await go(peeler.in.x, peeler.in.z);
    await page.waitForTimeout(600);
    const dep = await page.evaluate(() => ({ pack: window.__li.sim.pack.count, pile: window.__li.sim.state.piles[1001],
      cash: window.__li.game.piles.get('1001:cash').items.length }));
    check('logs go into the peeler and its cash pile grows by 10 a log', dep.pack === 0 && dep.pile === chop.pack * 10 && dep.cash > 0, JSON.stringify(dep));
    await go(peeler.money.x, peeler.money.z);
    await page.waitForTimeout(500);
    const coins = await page.evaluate(() => window.__li.sim.state.coins);
    check('walking onto the pile collects it', coins === 15 + chop.pack * 10, `${coins}`);

    await page.evaluate(() => window.__li.persist());
    await page.goto(url);
    await page.waitForFunction(() => window.__li && window.__li.ready, null, { timeout: 120000 });
    const back = await page.evaluate(() => ({ coins: window.__li.sim.state.coins, on: window.__li.sim.active(1001) && window.__li.sim.active(10011) }));
    check('reload keeps coins and bought buildings', back.coins === coins && back.on, JSON.stringify(back));

    // Meta (rules/meta.md) and chat (rules/chat.md) through the HUD.
    const click = sel => page.evaluate(sel => { const e = document.querySelector(sel); if (e) e.click(); return !!e; }, sel);
    const openNow = () => page.evaluate(() => ['phone', 'spin', 'box', 'chat', 'offline', 'sign', 'tasks', 'shop', 'skins']
      .filter(k => window.__li[k] && window.__li[k].isOpen).join());
    await click('[data-name="BtnPhone"]');
    await page.waitForTimeout(300);
    check('BtnPhone opens the phone', await openNow() === 'phone', await openNow());
    const apps = await page.evaluate(() => [...document.querySelectorAll('.panel-wrap [data-name="name"]')].map(e => e.textContent).filter(Boolean).length);
    check('the phone lists the 10 PhoneConf apps', apps >= 10, `${apps}`);
    await page.evaluate(() => window.__li.phone.close());
    for (const k of ['sign', 'spin', 'skins', 'tasks', 'shop']) {
      await page.evaluate(k => { window.__li[k].open(); }, k);
      await page.waitForTimeout(200);
      const ok = await page.evaluate(k => { const L = window.__li; const o = L[k].isOpen; L[k].close(); return o; }, k);
      check(`the ${k} panel opens`, ok);
    }
    await page.evaluate(() => {
      const L = window.__li, M = L.sim.meta;
      L.sim.guide.done.add(7);
      M.boxes[1] = { at: 0, box: { row: { id: 1, group: 1, prefab: 'Pre_AdBox1', kind: 'coin', val: 80, life: 60, pos: { x: 31.22, z: -17.54 } }, until: 1e9, shown: false } };
      Object.assign(L.sim.state.player, { x: 31.22, z: -17.54 });
    });
    await page.waitForTimeout(500);
    const boxSeen = await page.evaluate(() => ({ open: window.__li.box.isOpen, obj: window.__li.game.boxes.has(1) }));
    check('an ad box stands on the map and walking into it opens its panel', boxSeen.open && boxSeen.obj, JSON.stringify(boxSeen));
    const c0 = await page.evaluate(() => window.__li.sim.state.coins);
    await page.evaluate(() => { const L = window.__li; L.sim.meta.claimBox(1, false); L.box.close(); });
    check('the coin box pays 80 x the 5 s output', await page.evaluate(c0 => window.__li.sim.state.coins - c0 === 80 * window.__li.sim.extras.valuable(), c0));
    await page.evaluate(() => {
      const L = window.__li, T = L.sim.town;
      Object.assign(L.sim.state.player, { x: 0, z: 9 });
      T.T.books.push(0); T.T.houseLv[0] = 1;
      L.sim.emit({ type: 'houseDone', id: 88000, book: 0 });
    });
    await page.waitForTimeout(300);
    const chatBtn = await page.evaluate(() => { const e = document.querySelector('[data-name="BtnChat"]'); return !!e && e.style.display !== 'none'; });
    check('a built house makes the HUD chat bubble pop out', chatBtn);
    await click('[data-name="BtnChat"]');
    await page.waitForTimeout(300);
    check('the chat bubble opens the chat with the friend request', await openNow() === 'chat');
    await page.evaluate(() => { const L = window.__li; L.sim.chat.accept(0); L.chat.close(); });
    // Closed-app income: a save 2 h old (written after the page's own pagehide save) opens the offline panel.
    // The game saves on pagehide and again on visibilitychange (which runs after it), so age the save on both.
    await page.evaluate(() => {
      const age = () => {
        const k = 'lumber-inc-v1', s = JSON.parse(localStorage.getItem(k));
        s.lastPlay = Date.now() - 7200e3;
        localStorage.setItem(k, JSON.stringify(s));
      };
      addEventListener('pagehide', age);
      document.addEventListener('visibilitychange', age);
    });
    await page.goto(url);
    await page.waitForFunction(() => window.__li && window.__li.ready, null, { timeout: 120000 });
    await page.waitForTimeout(300);
    const off = await page.evaluate(() => ({ open: window.__li.offline.isOpen, chat: window.__li.sim.chat.friend(0), queued: !!window.__li.sim.chat.queued(20001) }));
    check('2 h away opens the offline reward on load', off.open, JSON.stringify(off));
    check('the chat friend and story 1 survive the reload', off.chat && off.queued);

    check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    check('no missing files', missing.length === 0, missing.slice(0, 3).join(' | '));
  } finally {
    clearTimeout(kill);
    await browser.close();
    if (srv) srv.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
