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
