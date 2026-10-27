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

    // The upgrade menu buys a machine step with the cash in hand.
    const upgraded = await page.evaluate(async () => {
      const g = window.__mmGame, sim = g.sim;
      const pi = g.store.producers.findIndex(p => p.upgradable);
      if (pi < 0) return { err: 'no upgradable machine' };
      sim.state.active.add(g.store.producers[pi].name);
      sim.state.cash = 100000;
      document.querySelector('#upbtn').click();
      await new Promise(r => setTimeout(r, 400));
      const btn = document.querySelector(`.upmenu [data-k="p${pi}"]`);
      if (!btn) return { err: 'no row for the machine' };
      btn.click();
      const lv = sim.state.levels.producers[pi];
      return { level: lv.speed + lv.stack, cash: sim.state.cash };
    });
    check('the upgrade menu buys a machine upgrade', upgraded.level === 1 && upgraded.cash < 100000, JSON.stringify(upgraded));

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
