#!/usr/bin/env node
/* My Mini Mart (games/casual-farm) covered-UI audit: at four viewports, with every HUD button unlocked, each NEW! tip
 * shown and every menu opened in turn, ask the browser what sits at the centre of each clickable element; anything
 * else on top means it is covered. Also fails on clickables cut off by the viewport, on HUD widgets (counters, right
 * column, button column, task banner, next-mart card, tips, phone timer) whose boxes overlap, and on a tip that shows
 * over the next-mart card.
 *   node test/casual-farm-ui.js        (serves the repo itself; MM_URL=... for Pages, MM_SHOTS=dir to keep screenshots)
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.join(__dirname, '..'), OUT = process.env.MM_SHOTS;
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const VIEWS = [[390, 844], [360, 640], [820, 1180], [1280, 720]];
const MENUS = ['hud', 'tip:shop', 'tip:map', 'tip:phone', '#setbtn', '#upbtn', '#upbtn > .machines', '#mapbtn', '#custombtn', '#robtn', '#spinbtn', '#phonebtn', '#shopbtn'];
const srv = http.createServer((q, s) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); s.end(b); }); }).listen(0, async () => {
  const url = process.env.MM_URL || `http://localhost:${srv.address().port}/games/casual-farm/index.html`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const kill = setTimeout(() => { console.log('  FAIL timeout'); process.exit(1); }, 600000);
  const report = [];
  for (const [w, h] of VIEWS) {
    const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
    page.on('pageerror', e => report.push(`${w}x${h} pageerror ${e.message}`));
    await page.goto(`${url}?fresh`);
    await page.waitForFunction(() => window.__mm && (window.__mm.ready || window.__mm.error), null, { timeout: 120000 });
    // Everything on screen at once: all mats bought, counters with gems and gold, both boosters, a car order, the
    // next-mart card, every button unlocked.
    await page.evaluate(async () => {
      const g = window.__mmGame, st = g.sim.state, gl = g.hud.martMap.global;
      for (const m of Object.values(st.mats)) m.done = true;
      st.cash = 123456; gl.gold = 50; g.daily.g.gems = 99;
      // Odd speed levels put the upgrade menu's Free ad button next to every machine's cash button ('#upbtn > .machines').
      for (const r of g.hud.menuModel()) {
        if (r.slot.kind === 'player') continue;
        st.active.add(r.node);
        (r.slot.kind === 'producer' ? st.levels.producers[r.slot.i] : g.sim.workerLevel(r.slot.name)).speed = 1;
      }
      st.task.index = g.hud.tasks.list.length;
      gl.unlocks = { upgrade: 'seen', shop: 'seen', rolling: 'seen', spin: 'seen', custom: 'seen', phone: 'seen', map: 'seen' };
      gl.showSpin = true; (gl.shop || (gl.shop = {})).on = true;
      g.sim.boosters.grant('worker', 1800); g.sim.boosters.grant('player', 1800);
      st.car.order = { items: [{ type: g.store.shelves[0].type, n: 8, got: 2 }], arrive: st.t, expires: st.t + 3000 };
      st.next.ready = true;
      g.sim.step = () => {};
      await new Promise(r => setTimeout(r, 800));
    });
    const closeAll = () => page.evaluate(() => { window.__mmGame.hud.closeMenus(); document.querySelectorAll('.mshade.open').forEach(e => e.classList.remove('open')); });
    // A new button's tip waits while the next-mart card is up.
    await closeAll();
    const blocked = await page.evaluate(async () => {
      const g = window.__mmGame;
      g.hud.martMap.global.unlocks.shop = 'new';
      await new Promise(r => setTimeout(r, 600));
      const n = document.querySelectorAll('.newtip').length;
      g.hud.martMap.global.unlocks.shop = 'seen';
      return n;
    });
    if (blocked) report.push(`${w}x${h} a NEW! tip shows over the next-mart card`);
    for (const menu of MENUS) {
      const tip = menu.startsWith('tip:');
      await closeAll();
      if (tip) {
        await page.evaluate(id => {
          const g = window.__mmGame, u = g.hud.martMap.global.unlocks;
          for (const k in u) u[k] = 'seen';
          u[id] = 'new'; g.hud.unlocks.shownFor = 0; g.sim.state.next.ready = false;
        }, menu.slice(4));
      } else if (menu !== 'hud') {
        await page.evaluate(m => { window.__mmGame.sim.state.next.ready = true; m.split(' > ').forEach(q => document.querySelector(q.startsWith('.') ? '#upmenu .tab' + q : q).click()); }, menu);
      } else await page.evaluate(() => { window.__mmGame.sim.state.next.ready = true; });
      await page.waitForTimeout(900);
      const res = await page.evaluate(([menu, tip]) => {
        const vis = el => { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return null; for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return null; } return r; };
        const name = el => (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '') + (el.dataset && Object.keys(el.dataset).length ? `[${Object.entries(el.dataset).map(([k, v]) => k + '=' + v).join(',')}]` : '') + (el.textContent.trim() ? ` "${el.textContent.trim().slice(0, 18)}"` : '');
        const clip = el => { for (let e = el.parentElement; e; e = e.parentElement) { const cs = getComputedStyle(e); if (/(auto|scroll|hidden)/.test(cs.overflowY + cs.overflowX)) return e.getBoundingClientRect(); } return null; };
        const W = innerWidth, H = innerHeight, covered = [], cut = [];
        const sel = '#hud .btn, #hud a, #hud [data-act], #hud [data-buy], #hud [data-claim], #hud .tab, #hud .x, #hud .tb, #hud button';
        // HUD and tip states: only what is not in an overlay. Menu state: only what is inside the open overlay(s).
        const OVER = '.mshade, .upmenu, .custom, .shopmenu, .romenu, #shopmenu, #romenu, .mcard';
        const overlays = [...document.querySelectorAll(OVER)].filter(o => vis(o));
        const bare = menu === 'hud' || tip;
        for (const el of new Set(document.querySelectorAll(sel))) {
          const r = vis(el);
          if (!r) continue;
          if (bare ? !!el.closest(OVER) : !overlays.some(o => o.contains(el))) continue;
          const c = clip(el), x = r.left + r.width / 2, y = r.top + r.height / 2;
          if (c && (y < c.top || y > c.bottom || x < c.left || x > c.right)) continue;
          if (x < 0 || y < 0 || x > W || y > H) { cut.push(name(el)); continue; }
          if (r.left < -1 || r.right > W + 1 || r.top < -1 || r.bottom > H + 1) cut.push(name(el) + ' (partly)');
          const hit = document.elementFromPoint(x, y);
          // Locked rolling-offer cards sit under their lock on purpose.
          if (hit && !el.contains(hit) && !hit.contains(el) && !hit.classList.contains('lockbg')) covered.push(`${name(el)} under ${name(hit)}`);
        }
        const widgets = ['.counters', '.rcol', '.lbtns', '#task', '#next', '.newtip', '#max', '.saving', '#phonebtn > s'].flatMap(s => [...document.querySelectorAll('#hud ' + s)]).map(e => [e, vis(e)]).filter(([, r]) => r);
        const overlap = [];
        if (bare) for (let i = 0; i < widgets.length; i++) for (let j = i + 1; j < widgets.length; j++) {
          const [a, ra] = widgets[i], [b, rb] = widgets[j];
          if (a.contains(b) || b.contains(a)) continue;
          const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
          if (ix > 2 && iy > 2) overlap.push(`${name(a).slice(0, 30)} x ${name(b).slice(0, 30)} (${Math.round(ix)}x${Math.round(iy)})`);
        }
        return { covered, cut, overlap, overlays: overlays.length, tips: document.querySelectorAll('.newtip').length };
      }, [menu, tip]);
      const tag = `${w}x${h} ${menu}`;
      for (const k of ['covered', 'cut', 'overlap']) for (const line of res[k]) report.push(`${tag} ${k}: ${line}`);
      if (!tip && menu !== 'hud' && !res.overlays) report.push(`${tag} no menu opened`);
      if (tip && res.tips !== 1) report.push(`${tag} ${res.tips} tips shown, expected 1`);
      if (OUT) await page.screenshot({ path: path.join(OUT, `${w}x${h}-${menu.replace(/[#:>. ]+/g, '')}.png`) });
    }
    await page.context().close();
  }
  const lines = [...new Set(report)];
  console.log(lines.length ? lines.map(l => '  FAIL ' + l).join('\n') : `  PASS no covered, cut-off or overlapping UI in ${VIEWS.length} viewports x ${MENUS.length} states`);
  console.log(`PASS: ${lines.length ? 0 : 1} passed, ${lines.length ? 1 : 0} failed`);
  clearTimeout(kill); await browser.close(); srv.close();
  process.exit(lines.length ? 1 : 0);
});
