#!/usr/bin/env node
/* Chợ Việt (games/cho-viet: My Mini Mart's engine with a Vietnamese market theme) in a real browser:
 *   - the page loads with no error or missing file, saves under its own keys, never under My Mini Mart's;
 *   - goods and tasks are in Vietnamese, the bánh mì icon is served, the van pad to a next mart is gone;
 *   - customers, workers and the player wear Vietnamese pieces, the props are in the yard and the buffalo moves;
 *   - the bot builds the whole mart from nothing (no cash given), nobody walks through a prop, customers face their way.
 *   node test/cho-viet-play.js
 *   MM_URL=https://poke5121999-art.github.io/survivor-web-hub/games/cho-viet/index.html node test/cho-viet-play.js
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const MINUTES = +(process.env.MM_MINUTES || 90);
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
  const url = process.env.MM_URL || `http://localhost:${srv.address().port}/games/cho-viet/index.html`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const kill = setTimeout(() => { console.log('timeout'); process.exit(2); }, 900000);
  const errors = [], missing = [];
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
    page.on('response', r => { if (r.status() >= 400) missing.push(`${r.status()} ${r.url()}`); });
    await page.goto(`${url}?fresh&bot`);
    await page.waitForFunction(() => window.__mm && (window.__mm.ready || window.__mm.error), null, { timeout: 120000 });
    const boot = await page.evaluate(() => ({ err: window.__mm.error || null, theme: window.MM_THEME && window.MM_THEME.id }));
    check('the page loads with the theme', !boot.err && boot.theme === 'cho-viet', boot.err || boot.theme);

    const look = await page.evaluate(async () => {
      const g = window.__mmGame, types = g.view.items.types;
      const names = [0, 1, 2, 3, 6, 10, 12].map(t => types[t].name);
      const icon = await fetch(new URL(`../casual-farm/art/items/${types[6].icon}`, location.href)).then(r => r.ok).catch(() => false);
      const texts = g.hud.tasks ? [...new Set(g.hud.tasks.list.map(t => t.text).filter(Boolean))] : [];
      const dressed = o => { let n = 0; o.traverse(x => { if (/^vn_/.test(x.name)) n++; }); return n; };
      const customers = [...g.view.agentTemplates.values()].map(dressed);
      const workers = g.world.objects.filter(o => /^_Worker_/.test(o.name)).map(dressed);
      const props = g.world.root.children.filter(o => /^ChoViet_/.test(o.name)).length;
      return { names, icon, texts, customers, workers, player: dressed(g.world.objects[g.store.player.node]), props,
         martName: g.marts.find(m => m.id === 'store1').name };
    });
    check('goods have Vietnamese names', look.names.join(',') === 'Lúa,Cà chua,Bột mì,Tương cà,Bánh mì,Trứng gà,Sữa bò', look.names.join(','));
    check('the bánh mì icon is served', look.icon);
    check('task texts are Vietnamese', look.texts.length > 5 && look.texts.every(t => /[à-ỹÀ-Ỹđ]/.test(t)), look.texts.join(' | '));
    check('every customer, worker and the player wears Vietnamese pieces',
      look.customers.length >= 7 && look.customers.every(n => n > 0) && look.workers.length > 3 && look.workers.every(n => n > 0) && look.player > 0,
      `customers ${look.customers.join(',')} workers ${look.workers.join(',')} player ${look.player}`);
    check('the props stand in the yard', look.props >= 20, `${look.props}`);
    check('the welcome names the mart Chợ Việt', look.martName === 'Chợ Việt', look.martName);

    // The bot builds the mart on its own money; sampled every half second: nobody inside a prop's box, customers face
    // their way, the buffalo's clip advances.
    const run = await page.evaluate(MINUTES => {
      const g = window.__mmGame, sim = g.sim, st = sim.state, view = g.view;
      const props = g.nav.obstacles.filter(o => /^ChoViet_/.test(o.name)).map(o => ({ o, f: null }));
      const V = g.camera.position.constructor, a = new V(), b = new V();
      const inside = [], face = [0, 0];
      const trau = g.world.root.getObjectByName('ChoViet_trau');
      let bone = null;
      trau.traverse(x => { if (!bone && x.isBone) bone = x; });
      const pose0 = bone ? bone.quaternion.clone() : null;
      const test = (who, p) => {
        for (const { o } of props) {
          const [x, , z] = o.center, [w, , d] = o.size, q = o.rot, yaw = 2 * Math.atan2(q[1], q[3]);
          const dx = p.x - x, dz = p.z - z, u = dx * Math.cos(yaw) - dz * Math.sin(yaw), v = dx * Math.sin(yaw) + dz * Math.cos(yaw);
          if (Math.abs(u) < w / 2 && Math.abs(v) < d / 2 && inside.length < 5) inside.push(`${who} in ${o.name}`);
        }
      };
      // The scene still holds the pad to the next mart; the theme takes it out of the chain, so it must never open.
      const NEXT = 'Mat_Activate_NextMart', built = () => Object.entries(st.mats).every(([k, m]) => m.done || k === NEXT);
      const DT = 1 / 30;
      let n = 0, t = 0;
      for (; t < MINUTES * 60; t += DT) {
        g.bot.step(DT);
        sim.step(DT, { nav: g.nav, grid: g.grid });
        if (++n % 15) continue;
        view.update(0.5);
        test('player', st.player);
        for (const c of st.customers || []) {
          test(c.agent, c);
          const v = view.customerViews.get(c.id), slot = v && v.obj.getObjectByName('BoxTransformSlot');
          if (!v || !slot || !c.moving || c.state === 7 || Math.hypot(c.dirX, c.dirZ) < 0.5) continue;
          v.obj.updateMatrixWorld(true);
          v.obj.getWorldPosition(a); slot.getWorldPosition(b);
          const fx = b.x - a.x, fz = b.z - a.z, l = Math.hypot(fx, fz);
          if (l > 0.3) face[(fx * c.dirX + fz * c.dirZ) / l / Math.hypot(c.dirX, c.dirZ) > 0.9 ? 0 : 1]++;
        }
        for (const w of st.workers || []) test(w.name, w);
        if (built()) break;
      }
      for (const r of g.world.rigs) r.update(0.7);
      return { minutes: +(t / 60).toFixed(1), done: Object.values(st.mats).filter(m => m.done).length, of: g.store.mats.length - 1, inside, face,
        next: !!(st.mats[NEXT] && (st.mats[NEXT].open || st.mats[NEXT].done)) || st.active.has(NEXT) || st.active.has('Mat_NextMart'),
        trauMoves: !!(bone && !bone.quaternion.equals(pose0)) };
    }, MINUTES);
    check('the bot builds every mat with no cash given', run.done === run.of, `${run.done}/${run.of} in ${run.minutes} sim-minutes`);
    check('one mart only: the pad to a next mart never opens', !run.next);
    check('nobody walks inside a prop', run.inside.length === 0, run.inside.join(', ') || 'none');
    check('customers face where they walk', run.face[0] > 50 && run.face[1] === 0, `${run.face[0]} ok, ${run.face[1]} wrong`);
    check('the buffalo is animated', run.trauMoves);

    await page.evaluate(() => window.__mmGame && window.__mmGame.hud.saved && 0);
    await page.waitForTimeout(6000);
    const keys = await page.evaluate(() => Object.keys(localStorage));
    check('saves under cho-viet-*, never under My Mini Mart\'s mmm-* records',
      keys.includes('cho-viet-global-v1') && keys.includes('cho-viet-store1-v1') && !keys.some(k => /^mmm-(global|store\d+)-v1$/.test(k)), keys.join(','));
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
