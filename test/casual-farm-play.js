#!/usr/bin/env node
/* My Mini Mart (games/casual-farm) in a real browser: loads blurred then sharp, keyboard moves the player, the bot
 * plays the opening (coins, first mats, tutorial, a paying customer), and progress survives a reload.
 *   node test/casual-farm-play.js                       (serves the repo itself)
 *   MM_URL=https://poke5121999-art.github.io/survivor-web-hub/games/casual-farm/index.html node test/casual-farm-play.js
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css' };
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
  const srv = process.env.MM_URL ? null : await serve();
  const url = process.env.MM_URL || `http://localhost:${srv.address().port}/games/casual-farm/index.html`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const kill = setTimeout(() => { console.log('  FAIL timed out after 240 s'); process.exit(1); }, 240000);
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const errors = [], missing = [], modules = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400) missing.push(`${r.status()} ${r.url()}`); });
    page.on('request', r => { if (/\/games\/casual-farm\/(js|vendor)\/.*\.js/.test(r.url())) modules.push(r.url()); });

    const t0 = Date.now();
    await page.goto(`${url}?fresh`);
    await page.waitForFunction(() => window.__mm && (window.__mm.ready || window.__mm.error), null, { timeout: 90000 });
    const mm = await page.evaluate(() => window.__mm);
    check('loads with no error', mm.ready && !mm.error, mm.error || `${((Date.now() - t0) / 1000).toFixed(1)} s`);
    const blurs = mm.stages.map(s => s[1]);
    check('starts blurred and sharpens step by step', blurs[0] > 0 && blurs.every((b, i) => !i || b < blurs[i - 1]) && mm.blur === 0,
      mm.stages.map(([l, b, t]) => `${l} ${b}px @${t}ms`).join(', '));
    check('every module request carries the build stamp', modules.length > 15 && modules.every(u => /\?v=\d{8}[a-z]/.test(u)),
      `${modules.length} modules, unstamped: ${modules.filter(u => !/\?v=/.test(u)).map(u => u.split('/').pop()).join(', ') || 'none'}`);

    const p0 = await page.evaluate(() => ({ ...window.__mmGame.sim.state.player }));
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1200);
    await page.keyboard.up('KeyW');
    const p1 = await page.evaluate(() => ({ ...window.__mmGame.sim.state.player }));
    check('W walks the player', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 3, `moved ${Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(1)} m`);

    // The in-page bot (?bot, the policy test/casual-farm-sim.js proves can finish Store 1) plays the opening.
    await page.goto(`${url}?fresh&bot`);
    await page.waitForFunction(() => window.__mm && (window.__mm.ready || window.__mm.error), null, { timeout: 90000 });
    await page.evaluate(() => {
      const paid = window.__mmPaid = { n: 0 };
      window.__mmGame.sim.listeners.push(e => { if (e.type === 'customerPay') paid.n++; });
    });
    await page.waitForFunction(() => window.__mmPaid.n >= 1 && window.__mmGame.sim.state.task.index >= 3, null, { timeout: 150000 }).catch(() => {});
    const run = await page.evaluate(() => {
      const g = window.__mmGame, st = g.sim.state;
      return { t: st.t, done: Object.values(st.mats).filter(m => m.done).length, task: st.task.index, paid: window.__mmPaid.n,
        coins: st.coins.every(c => c.taken), banner: document.querySelector('#task').innerText.replace(/\s+/g, ' ').trim(),
        tags: document.querySelectorAll('.tag').length };
    });
    check('the starting coin piles get collected', run.coins);
    check('the first three mats are bought', run.done >= 3, `${run.done} mats by ${run.t.toFixed(0)} s`);
    check('a customer pays at the cashier', run.paid >= 1, `${run.paid} paid`);
    check('the tutorial moves past "Shelf tomatoes"', run.task >= 3, `task ${run.task}, banner "${run.banner}"`);

    const saved = await page.evaluate(() => {
      dispatchEvent(new Event('pagehide'));
      const st = window.__mmGame.sim.state;
      return { cash: st.cash, done: Object.values(st.mats).filter(m => m.done).length };
    });
    await page.goto(url);
    await page.waitForFunction(() => window.__mm && (window.__mm.ready || window.__mm.error), null, { timeout: 90000 });
    const back = await page.evaluate(() => {
      const st = window.__mmGame.sim.state;
      return { cash: st.cash, done: Object.values(st.mats).filter(m => m.done).length };
    });
    check('a reload keeps cash and bought mats', back.done === saved.done && back.cash === saved.cash,
      `mats ${back.done}/${saved.done}, cash ${back.cash}/${saved.cash}`);

    // Upgrade menu (legacy UpgradeMenuController): a machine row on the Machines tab, Speed and Stack bought separately;
    // a locked machine shows as a "???" silhouette; the red dot means an unlocked thing on a tab not yet looked at.
    const upgraded = await page.evaluate(async () => {
      const g = window.__mmGame, sim = g.sim, st = sim.state, hud = g.hud;
      const rows = hud.menuModel();
      const ri = rows.findIndex(r => r.tab === 'machines');
      if (ri < 0) return { err: 'no machine row' };
      const pi = rows[ri].slot.i, name = g.store.producers[pi].name;
      st.active.delete(name);
      document.querySelector('#upbtn').click();
      document.querySelector('#upmenu [data-tab="machines"]').click();
      await new Promise(r => setTimeout(r, 300));
      const lockedRow = [...document.querySelectorAll('#upmenu .row')][rows.filter(r => r.tab === 'machines').indexOf(rows[ri])];
      const locked = !!lockedRow && lockedRow.classList.contains('locked') && /\?\?\?/.test(lockedRow.textContent);
      document.querySelector('#upmenu .x').click();
      st.seen.machines = true;
      sim.activate ? sim.activate(name, 0) : st.active.add(name);
      if (!st.active.has(name)) { st.active.add(name); st.seen.machines = false; }
      await new Promise(r => setTimeout(r, 600));
      const dotOn = document.querySelector('#upbtn').classList.contains('alert');
      st.cash = 100000;
      document.querySelector('#upbtn').click();
      document.querySelector('#upmenu [data-tab="machines"]').click();
      await new Promise(r => setTimeout(r, 300));
      const speed = document.querySelector(`#upmenu [data-r="${ri}"][data-t="speed"]`);
      if (!speed) return { err: 'no speed button', locked, dotOn };
      speed.click();
      await new Promise(r => setTimeout(r, 1700));
      const lv1 = { ...st.levels.producers[pi] };
      const stack = document.querySelector(`#upmenu [data-r="${ri}"][data-t="stack"]`);
      if (stack) stack.click();
      const lv2 = { ...st.levels.producers[pi] };
      await new Promise(r => setTimeout(r, 600));
      const dotOff = !document.querySelector('#upbtn').classList.contains('alert');
      const text = document.querySelector('#upmenu .rows').textContent;
      document.querySelector('#upmenu .x').click();
      return { locked, dotOn, dotOff, lv1, lv2, label: /Speed - Lvl\.2/.test(text) && /Stack - Lvl\.2/.test(text) };
    });
    check('the upgrade menu lists a locked machine as "???" and buys Speed and Stack separately', upgraded.locked && upgraded.lv1
      && upgraded.lv1.speed === 1 && upgraded.lv1.stack === 0 && upgraded.lv2.stack === 1 && upgraded.label, JSON.stringify(upgraded));
    check('the upgrade button dot shows a new unlock until its tab is seen', upgraded.dotOn && upgraded.dotOff, JSON.stringify(upgraded));

    // Phone order: an order shows the phone button with its countdown, the dot lights when the car is in, the popup lists
    // the lines and Collect (only once full) pays 5 x the order.
    const phone = await page.evaluate(async () => {
      const g = window.__mmGame, sim = g.sim, st = sim.state, btn = document.querySelector('#phonebtn');
      const type = g.store.shelves[0].type;
      st.car.order = { items: [{ type, n: 2, got: 0 }], arrive: st.t - 1, expires: st.t + 600 };
      await new Promise(r => setTimeout(r, 500));
      const shown = getComputedStyle(btn).display !== 'none', timer = btn.querySelector('s').textContent, dot = btn.classList.contains('alert');
      btn.click();
      await new Promise(r => setTimeout(r, 300));
      const rows = document.querySelectorAll('#phonemenu .row').length;
      const cash0 = st.cash;
      document.querySelector('#phonemenu [data-collect]').click();
      const early = st.cash - cash0;
      st.car.order.items[0].got = 2;
      await new Promise(r => setTimeout(r, 300));
      document.querySelector('#phonemenu [data-collect]').click();
      const paid = st.cash - cash0, price = g.store.prices[type] || 0;
      return { shown, timer, dot, rows, early, paid, expect: Math.trunc(5 * Math.trunc(price * 2)), gone: !st.car.order };
    });
    check('the phone button counts down an order and its popup collects 5x once full', phone.shown && /09m 5\ds/.test(phone.timer) && phone.dot
      && phone.rows === 1 && phone.early === 0 && phone.paid === phone.expect && phone.gone, JSON.stringify(phone));

    // Left button column and Settings: the buttons sit on the left; Settings switches the music.
    const hudLeft = await page.evaluate(async () => {
      const g = window.__mmGame, up = document.querySelector('#upbtn');
      const box = up.getBoundingClientRect();
      document.querySelector('#setbtn').click();
      const open = document.querySelector('#setmenu').classList.contains('open');
      const music0 = g.hud.sound.music;
      document.querySelector('#setmenu [data-tog="music"]').click();
      const music1 = g.hud.sound.music;
      document.querySelector('#setmenu [data-tog="music"]').click();
      document.querySelector('#setmenu .x').click();
      return { left: Math.round(box.left), open, toggled: music0 !== music1 };
    });
    check('the HUD buttons sit on the left and Settings switches the music', hudLeft.left < 40 && hudLeft.open && hudLeft.toggled, JSON.stringify(hudLeft));

    // Boosters: the offer button grants a 300 s cash x2; the extra-cash mat shows, and standing on it pays the cheapest mat.
    const boost = await page.evaluate(async () => {
      const g = window.__mmGame, sim = g.sim, b = sim.state.boost, t = sim.state.t;
      b.offer = { kind: 'cash', until: t + 20 };
      await new Promise(r => setTimeout(r, 300));
      const btn = document.querySelector('#boosts [data-boost="cash"]');
      if (btn) btn.click();
      const on = sim.boosters.on('cash'), left = Math.round(sim.boosters.left('cash'));
      const amount = sim.boosters.extraCash();
      b.cashT = 1e9;
      await new Promise(r => setTimeout(r, 300));
      const m = sim.boosters.cashMat, mat = g.world.byName.get('Mat_RV_Extra_Cash');
      const shown = !!(mat && mat.visible && b.cash);
      const cash0 = sim.state.cash;
      Object.assign(sim.state.player, { x: m.zone.middle.x, z: m.zone.middle.z });
      for (let i = 0; i < 40 && b.cash; i++) await new Promise(r => setTimeout(r, 100));
      return { clicked: !!btn, on, left, shown, amount, paid: sim.state.cash - cash0 };
    });
    check('a booster offer grants cash x2 and the extra-cash mat pays the cheapest mat', boost.clicked && boost.on && boost.left >= 299 && boost.shown && boost.amount > 0 && boost.paid === boost.amount,
      JSON.stringify(boost));

    // Next mart pad: stand on it, press GO, the van leaves and Store 2 loads with the same cash.
    const before = await page.evaluate(async () => {
      const g = window.__mmGame, nm = g.store.nextMart, st = g.sim.state;
      st.active.add(nm.name);
      Object.assign(st.player, { x: nm.zone.middle.x, z: nm.zone.middle.z });
      st.cash = 777;
      for (let i = 0; i < 40 && !st.next.ready; i++) await new Promise(r => setTimeout(r, 100));
      const shown = getComputedStyle(document.querySelector('#next')).display !== 'none';
      window.__oldPage = true;
      document.querySelector('#next .go').click();
      return { shown, label: document.querySelector('#next b').textContent };
    });
    await page.waitForFunction(() => !window.__oldPage && window.__mm && (window.__mm.ready || window.__mm.error) && window.__mmGame, null, { timeout: 90000 });
    const arrived = await page.evaluate(() => ({ first: window.__mmGame.store.mats[0].name, cash: window.__mmGame.sim.state.cash }));
    check('the next-mart pad opens the menu and GO drives to Store 2 with the cash', before.shown && arrived.first === 'Mat_Activate_Cashier_Cafe' && arrived.cash === 777,
      `menu ${before.shown} "${before.label}", first mat ${arrived.first}, cash ${arrived.cash}`);

    // Map menu (MartMenuController): Store 1 now holds idle income; three hours on, COLLECT pays it and GO goes back.
    const map = await page.evaluate(async () => {
      const g = window.__mmGame, mm = g.hud.martMap, st = g.sim.state;
      mm.global.idleAt.store1 = Date.now() - 10801 * 1000;
      document.querySelector('#mapbtn').click();
      await new Promise(r => setTimeout(r, 700));
      const rows = [...document.querySelectorAll('#mapmenu .row')];
      const s1 = mm.rows().find(r => r.id === 'store1');
      const cash0 = st.cash;
      const btn = document.querySelector('#mapmenu [data-id="store1"][data-act="collect"]');
      if (btn) btn.click();
      return { rows: rows.length, locked: rows.filter(r => r.classList.contains('locked')).length, here: !!document.querySelector('#mapmenu .max'),
        expect: s1.amount, paid: st.cash - cash0, again: mm.rows().find(r => r.id === 'store1').ready };
    });
    check('the map lists every mart and COLLECT pays the Store 1 idle income once', map.rows === 14 && map.locked === 12 && map.here && map.expect > 0 && map.paid === map.expect && !map.again,
      JSON.stringify(map));
    const cashBack = await page.evaluate(() => {
      const c = window.__mmGame.sim.state.cash;
      window.__oldPage = true;
      document.querySelector('#mapmenu [data-id="store1"][data-act="go"]').click();
      return c;
    });
    await page.waitForFunction(() => !window.__oldPage && window.__mm && (window.__mm.ready || window.__mm.error) && window.__mmGame, null, { timeout: 90000 });
    const back1 = await page.evaluate(() => ({ first: window.__mmGame.store.mats[0].name, cash: window.__mmGame.sim.state.cash }));
    check('GO on the map goes back to Store 1 with the cash', back1.first === 'Mat_Activate_Cashier' && back1.cash === cashBack, JSON.stringify(back1));

    // Stores 9-14 build their mats from the progression CSV: the first one is open and drawn.
    await page.goto(`${url}?mart=store9&fresh`);
    await page.waitForFunction(() => window.__mm && (window.__mm.ready || window.__mm.error), null, { timeout: 90000 });
    const s9 = await page.evaluate(() => {
      const g = window.__mmGame, m = g.store.mats[0], o = g.world.byName.get(m.name);
      return { err: window.__mm.error, mats: g.store.mats.length, first: m.name, open: g.sim.state.mats[m.name].open, drawn: !!(o && o.visible) };
    });
    check('Store 9 loads with its CSV mats and the first one drawn', !s9.err && s9.mats === 38 && s9.open && s9.drawn, JSON.stringify(s9));
    const sfx = await page.evaluate(async () => (await fetch('art/sfx/sfx.json')).ok);
    check('the sound table is served', sfx);
    check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');
    check('no missing files', missing.length === 0, missing.slice(0, 3).join(' | ') || 'none');
  } finally {
    clearTimeout(kill);
    await browser.close();
    if (srv) srv.close();
  }
  console.log(`PASS: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
