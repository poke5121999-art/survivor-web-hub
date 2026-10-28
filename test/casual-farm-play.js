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
      // Case-sensitive like GitHub Pages: Windows would serve Triangle~2.webp for triangle~2.webp.
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

    // TaskBannerController.OnPressButton: a tap on the banner sends the camera to the task target; the objective radar
    // circles the player while a task has a target.
    // The opening task only waits for the tomato mats (action 8): DeactivateRadar, no arrow pointing back at the field.
    await page.waitForFunction(() => window.__mmGame.hud.tasks.current, null, { timeout: 15000 }).catch(() => {});
    const wait = await page.evaluate(() => { const g = window.__mmGame, t = g.hud.tasks.current; return { task: t && t.name, radar: g.world.objects[g.store.node('ObjectiveRadar')].visible }; });
    check('no radar arrow while the task only waits for a mat to be bought', wait.task && /Waiting/.test(wait.task) && !wait.radar, JSON.stringify(wait));
    await page.evaluate(() => { const g = window.__mmGame; for (const n of ['Mat_Activate_Cashier', 'Mat_Activate_Tomato_Shelf', 'Mat_Activate_Plant_Tomato']) g.sim.completeMat(g.store.mats.find(m => m.name === n)); });
    await page.waitForFunction(() => { const t = window.__mmGame.hud.tasks.current; return t && t.text && t.target && document.querySelector('#task').style.display === 'flex'; },
      null, { timeout: 60000 }).catch(() => {});
    await page.evaluate(() => { window.__mmGame.director.shots.length = 0; });
    await page.click('#task', { timeout: 5000 }).catch(() => {});
    const tut = await page.evaluate(() => {
      const g = window.__mmGame, task = g.hud.tasks.current, shot = g.director.shots[0], r = g.world.objects[g.store.node('ObjectiveRadar')];
      const pl = g.sim.state.player, a = new r.position.constructor();
      r.children[0].getWorldPosition(a);
      const toward = task && task.target ? ((a.x - pl.x) * (task.target.x - pl.x) + (a.z - pl.z) * (task.target.z - pl.z)) / Math.hypot(task.target.x - pl.x, task.target.z - pl.z) : 0;
      return { task: task && task.name, shot: !!shot && !!task && Math.hypot(shot.follow().x - task.target.x, shot.follow().z - task.target.z) < 0.01,
        frozen: g.sim.state.player.frozen > 1, radar: r.visible, pop: document.querySelector('#task').classList.contains('in'), toward: +toward.toFixed(2) };
    });
    check('tapping the task banner pans the camera to its target and the radar arrow is up', tut.shot && tut.frozen && tut.radar && tut.pop, JSON.stringify(tut));
    check('the radar arrow sits on the target side of the player', tut.toward > 1, `${tut.toward} m toward the target`);

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

    // Freeze the sim first: the bot keeps paying into a mat until the page goes, and the unload save would then hold
    // less cash than the snapshot (Pages loads slower, so that gap was wide enough to fail there).
    const saved = await page.evaluate(() => {
      window.__mmGame.sim.step = () => {};
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

    // Map card (MartMenuController): it opens on this mart; Down walks back to Store 1, which three hours on holds its
    // idle income; Collect pays it once, Store 3 shows locked, and GO goes back to Store 1.
    const map = await page.evaluate(async () => {
      const g = window.__mmGame, mm = g.hud.martMap, st = g.sim.state;
      const card = document.querySelector('#mapmenu');
      mm.global.idleAt.store1 = Date.now() - 10801 * 1000;
      document.querySelector('#mapbtn').click();
      await new Promise(r => setTimeout(r, 300));
      const first = card.querySelector('.title').textContent, here = getComputedStyle(card.querySelector('.here')).display !== 'none';
      card.querySelector('.up').click();
      await new Promise(r => setTimeout(r, 100));
      const third = { title: card.querySelector('.title').textContent, locked: card.classList.contains('locked') };
      card.querySelector('.down').click();
      card.querySelector('.down').click();
      await new Promise(r => setTimeout(r, 100));
      const s1 = mm.rows().find(r => r.id === 'store1');
      const cash0 = st.cash;
      const title = card.querySelector('.title').textContent, num = card.querySelector('.inc .num').textContent;
      card.querySelector('[data-act="collect"]').click();
      await new Promise(r => setTimeout(r, 100));
      return { open: card.classList.contains('open'), first, here, third, title, num, expect: s1.income, max: s1.max, paid: st.cash - cash0,
        again: mm.rows().find(r => r.id === 'store1').ready, timer: card.querySelector('.collect s').textContent };
    });
    check('the map card opens on this mart, walks to Store 1 and Collect pays its idle income once',
      map.open && map.first === 'Cafe Mart' && map.here && map.third.title === 'Pizza Mart' && map.third.locked && map.title === 'Grocer Mart'
      && map.expect > 0 && map.expect === map.max && map.num === `${map.max}/${map.max}` && map.paid === map.expect && !map.again && /^\d+h \d\dm \d\ds$|^\d\dm \d\ds$/.test(map.timer),
      JSON.stringify(map));
    // The 3D saga map behind the card: the store is hidden, the van sits on the shown mart's Mart3DController node and
    // the camera follows it; Up hops the van to the next mart (GoToMart3D); a mart not reached yet is drawn black;
    // closing the card brings the store back and returns the van to the player.
    const city = await page.evaluate(async () => {
      const g = window.__mmGame, cm = g.cityMap, card = document.querySelector('#mapmenu');
      g.hud.martMenu.close();
      document.querySelector('#mapbtn').click();
      for (let i = 0; i < 100 && !cm.ready; i++) await new Promise(r => setTimeout(r, 100));
      await new Promise(r => setTimeout(r, 200));
      const near = i => cm.van.getWorldPosition(new (cm.target.constructor)()).distanceTo(cm.martPos(i, new (cm.target.constructor)()));
      const at0 = { index: g.hud.martMenu.index, cityOn: cm.world.root.visible, storeOff: !g.world.root.visible, van: near(g.hud.martMenu.index),
        mapMode: g.sim.state.mapMode, cam: Math.hypot(g.camera.position.x - 77.38 - cm.target.x, g.camera.position.z - 310.62 - cm.target.z) };
      card.querySelector('.up').click();
      await new Promise(r => setTimeout(r, 800));
      const i1 = g.hud.martMenu.index;
      const black = cm.marts[i1].meshes.filter(m => m.material.side !== 1).every(m => m.material === cm.black);
      const at1 = { index: i1, van: near(i1), black, cityMeshes: cm.world.root.children.length };
      card.querySelector('[data-act="close"]').click();
      await new Promise(r => setTimeout(r, 200));
      const back = { cityOff: !cm.world.root.visible, storeOn: g.world.root.visible, vanHome: cm.van.parent === cm.vanHome.parent, vanHidden: !cm.van.visible, mapMode: !!g.sim.state.mapMode };
      document.querySelector('#mapbtn').click();
      card.querySelector('.down').click();
      await new Promise(r => setTimeout(r, 300));
      return { at0, at1, back };
    });
    check('the map card shows the 3D city: van on the mart, camera on the van, Up hops to the next mart drawn black, close restores the store',
      city.at0.cityOn && city.at0.storeOff && city.at0.van < 0.5 && city.at0.mapMode && city.at0.cam < 1 && city.at1.index === city.at0.index + 1
      && city.at1.van < 0.5 && city.at1.black && city.back.cityOff && city.back.storeOn && city.back.vanHome && city.back.vanHidden && !city.back.mapMode,
      JSON.stringify(city));
    const cashBack = await page.evaluate(() => {
      const c = window.__mmGame.sim.state.cash;
      window.__oldPage = true;
      document.querySelector('#mapmenu [data-act="go"]').click();
      return c;
    });
    await page.waitForFunction(() => !window.__oldPage && window.__mm && (window.__mm.ready || window.__mm.error) && window.__mmGame, null, { timeout: 90000 });
    const back1 = await page.evaluate(() => ({ first: window.__mmGame.store.mats[0].name, cash: window.__mmGame.sim.state.cash }));
    check('GO on the map goes back to Store 1 with the cash', back1.first === 'Mat_Activate_Cashier' && back1.cash === cashBack, JSON.stringify(back1));

    // Prestige (census-prestige.md). At 100 % the one-time "New Update: Prestige" popup points at the map; the card's
    // Prestige button opens the menu with 20 gold, 1.5 x max income in cash and max income 300 -> 450; Rebuild wipes
    // Store 1 and reloads it at demand 100 with the welcome screen, whose Claim pays the cash and the gold.
    const pre = await page.evaluate(async () => {
      const g = window.__mmGame, st = g.sim.state;
      for (const m of Object.values(st.mats)) m.done = true;
      await new Promise(r => setTimeout(r, 300));
      const info = document.querySelector('#prestigeinfo').classList.contains('open');
      document.querySelector('#prestigeinfo [data-act="map"]').click();
      await new Promise(r => setTimeout(r, 300));
      const card = document.querySelector('#mapmenu');
      const fromInfo = card.classList.contains('open') && card.querySelector('.title').textContent === 'Grocer Mart';
      const btnOn = !card.querySelector('.prest').classList.contains('off');
      card.querySelector('[data-act="prestige"]').click();
      await new Promise(r => setTimeout(r, 100));
      const pm = document.querySelector('#prestigemenu');
      const menu = { open: pm.classList.contains('open'), gold: pm.querySelector('b.vg').textContent, cash: pm.querySelector('b.vc').textContent,
        a: pm.querySelector('b.a').textContent, b: pm.querySelector('b.b').textContent, comp: pm.querySelector('.comp b').textContent,
        next: pm.querySelectorAll('.stars i.nx').length };
      window.__cashBefore = st.cash;
      window.__oldPage = true;
      pm.querySelector('[data-act="rebuild"]').click();
      return { info, fromInfo, btnOn, menu, cash: st.cash };
    });
    check('at 100 % the prestige popup opens the map, and the menu offers 20 gold, 450 cash, max income 300 -> 450',
      pre.info && pre.fromInfo && pre.btnOn && pre.menu.open && pre.menu.gold === '20' && pre.menu.cash === '450' && pre.menu.a === '300'
      && pre.menu.b === '450' && pre.menu.comp === '100% Completed' && pre.menu.next === 1, JSON.stringify(pre));
    await page.waitForFunction(() => !window.__oldPage && window.__mm && (window.__mm.ready || window.__mm.error) && window.__mmGame, null, { timeout: 90000 });
    const post = await page.evaluate(async () => {
      const g = window.__mmGame, st = g.sim.state, w = document.querySelector('#prestigewelcome');
      const done = Object.values(st.mats).filter(m => m.done).length;
      const shown = { open: w.classList.contains('open'), stars: w.querySelectorAll('.stars i.on').length, gold: w.querySelector('b.vg').textContent,
        cash: w.querySelector('b.vc').textContent, a: w.querySelector('b.a').textContent, b: w.querySelector('b.b').textContent };
      const cash0 = st.cash;
      await new Promise(r => setTimeout(r, 1300));
      w.querySelector('[data-act="claim"]').click();
      await new Promise(r => setTimeout(r, 100));
      const row = g.hud.martMap.rows().find(r => r.id === 'store1');
      return { first: g.store.mats[0].name, done, demand: st.demandIndex, shown, cash0, paid: st.cash - cash0, gold: g.hud.martMap.global.gold,
        goldShown: document.querySelector('#gold').textContent, star: row.star, max: row.max, closed: !w.classList.contains('open') };
    });
    check('Rebuild reloads Store 1 empty at demand 100 with 1 star, and Claim pays 450 cash and 20 gold',
      post.first === 'Mat_Activate_Cashier' && post.done === 0 && post.demand === 100 && post.shown.open && post.shown.stars === 1
      && post.shown.gold === '20' && post.shown.cash === '450' && post.shown.a === '300' && post.shown.b === '450' && post.paid === 450
      && post.gold === 20 && post.closed && post.star === 1 && post.max === 300 && post.cash0 === pre.cash, JSON.stringify(post));
    await page.waitForTimeout(800);
    check('the gold counter shows the bars', await page.evaluate(() => getComputedStyle(document.querySelector('#goldc')).display !== 'none'
      && document.querySelector('#gold').textContent === '20'));

    // Customise screen (rules/census-cosmetics.md): cash buys Skin_Gray (500) and Hat_Chef (5000), gold buys the Ninja
    // outfit (130, FasterPlayer x1.4: speed 23 -> 32.2) and the Duck (10, +1 carry); Hat_Ribbon needs 2 ad claims; IAP rows
    // are not offered; items past the player's own limit ride on the pet; everything survives a reload.
    const cos = await page.evaluate(async () => {
      const g = window.__mmGame, st = g.sim.state, c = document.querySelector('#custom');
      st.cash = 20000; g.hud.martMap.global.gold = 200;
      document.querySelector('#custombtn').click();
      const pick = (t, id) => { c.querySelector(`[data-tab="${t}"]`).click(); const b = c.querySelector(`[data-id="${id}"]`); if (b) b.click(); return !!b; };
      pick('skins', 2); pick('hats', 7); pick('outfits', 12); pick('pets', 7);
      pick('hats', 3);
      const ribbonAfter1 = { owned: g.hud.customise.state.own.hats.has(3), label: c.querySelector('[data-id="3"] .foot').textContent };
      pick('hats', 3);
      const iapShown = pick('outfits', 2);
      for (let i = 0; i < 40 && !g.looks.pet; i++) await new Promise(r => setTimeout(r, 100));
      c.querySelector('[data-act="close"]').click();
      const base = g.store.player.speed;
      st.player.inputMag = 1; st.player.dirX = 1; st.player.dirZ = 0;
      const x0 = st.player.x; g.sim.state.player.frozen = 0;
      st.carry = Array(g.sim.carryMax()).fill(st.carry[0] || 'Tomato');
      await new Promise(r => setTimeout(r, 300));
      const petStack = (g.view.stacks.get('pet') || []).filter(o => o.parent === g.looks.pet.obj).length;
      st.carry = [];
      return { eq: { ...g.hud.customise.state.eq }, cash: st.cash, gold: g.hud.martMap.global.gold, ribbonAfter1, ribbon: g.hud.customise.state.own.hats.has(3),
        iapShown, speed: +(base * g.sim.abilities.player).toFixed(2), carry: g.sim.carryMax(), petStack,
        outfitMeshes: g.looks.extra.filter(m => m.isSkinnedMesh).length, hatMeshes: g.looks.extra.filter(m => m.isMesh && !m.isSkinnedMesh).length };
    });
    check('the customise screen sells by cash, gold and ad claims, and the outfit, hat and pet change the game',
      cos.eq.skin === 2 && cos.eq.outfit === 12 && cos.eq.pet === 7 && cos.eq.hat === 3 && cos.cash === 20000 - 500 - 5000 && cos.gold === 200 - 130 - 10
      && !cos.ribbonAfter1.owned && /1\/2/.test(cos.ribbonAfter1.label) && cos.ribbon && !cos.iapShown && cos.speed === 32.2 && cos.carry === 4
      && cos.petStack === 1 && cos.outfitMeshes >= 1 && cos.hatMeshes >= 1, JSON.stringify(cos));
    await page.reload();
    await page.waitForFunction(() => window.__mm && (window.__mm.ready || window.__mm.error) && window.__mmGame, null, { timeout: 90000 });
    const cos2 = await page.evaluate(async () => {
      const g = window.__mmGame;
      for (let i = 0; i < 40 && !g.looks.pet; i++) await new Promise(r => setTimeout(r, 100));
      return { eq: { ...g.hud.customise.state.eq }, chef: g.hud.customise.state.own.hats.has(7), speed: g.sim.abilities.player, pet: !!g.looks.pet };
    });
    check('the cosmetics survive a reload', cos2.eq.outfit === 12 && cos2.eq.hat === 3 && cos2.chef && cos2.speed === 1.4 && cos2.pet, JSON.stringify(cos2));

    // Layout of the map card and the prestige menu on a phone and a desktop window: every block sits inside its panel
    // and the viewport, the card's blocks do not overlap, and no text is clipped by its button.
    for (const [vw, vh] of [[390, 844], [1280, 720]]) {
      await page.setViewportSize({ width: vw, height: vh });
      await page.waitForTimeout(300);
      const lay = await page.evaluate(async () => {
        const g = window.__mmGame, st = g.sim.state, mats = Object.values(st.mats);
        mats.forEach((m, i) => { m.done = i < mats.length * 0.85; });
        const hud = g.hud, menu = hud.martMenu;
        menu.close();
        menu.open();
        await new Promise(r => setTimeout(r, 200));
        const box = el => el.getBoundingClientRect();
        const inside = (a, b) => a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
        const overlap = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
        // The game keeps the phone's portrait frame: #stage is 750:1334 (or the whole window when that is narrower).
        const view = box(document.querySelector('#stage'));
        const want = Math.min(innerWidth, innerHeight * 750 / 1334), canvas = document.querySelector('#game');
        if (Math.abs(view.width - want) > 1.5 || Math.abs(view.height - innerHeight) > 1.5) bad.push(`stage ${view.width}x${view.height}, want ${want}x${innerHeight}`);
        if (Math.abs(canvas.width / canvas.height - view.width / view.height) > 0.02) bad.push(`canvas ${canvas.width}x${canvas.height} is not the stage aspect`);
        if (Math.abs(view.left - (innerWidth - view.width) / 2) > 1.5) bad.push('stage not centred');
        const bad = [];
        const card = document.querySelector('#mapmenu .panel'), cb = box(card);
        if (!inside(cb, view)) bad.push('card outside the viewport');
        const parts = ['.head', '.line', '.mid', '.go', '.nav', '.x'].map(q => [q, box(card.querySelector(q))]);
        for (const [q, b] of parts) if (!inside(b, cb)) bad.push(`${q} outside the card`);
        for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++)
          if (overlap(parts[i][1], parts[j][1]) && !(parts[i][0] === '.head' && parts[j][0] === '.x')) bad.push(`${parts[i][0]} overlaps ${parts[j][0]}`);
        if (overlap(box(card.querySelector('.head')), box(card.querySelector('.x')))) bad.push('.head overlaps .x');
        for (const t of card.querySelectorAll('.tb')) if (t.offsetParent && t.scrollWidth > t.clientWidth + 1) bad.push(`text clipped in ${t.textContent.trim()}`);
        card.querySelector('[data-act="prestige"]').click();
        await new Promise(r => setTimeout(r, 200));
        const pm = document.querySelector('#prestigemenu .panel'), pb = box(pm);
        if (!inside(pb, view)) bad.push('prestige menu outside the viewport');
        for (const q of ['.title', '.info', '.foot', '.x', '.info .mart', '.info p', '.info .rew', '.info .maxinc'])
          if (!inside(box(pm.querySelector(q)), pb)) bad.push(`prestige ${q} outside the panel`);
        const kids = [...pm.querySelectorAll('.info > *')].map(e => box(e));
        for (let i = 1; i < kids.length; i++) if (overlap(kids[i - 1], kids[i])) bad.push(`prestige info rows ${i - 1}/${i} overlap`);
        document.querySelector('#prestigemenu [data-act="close"]').click();
        menu.close();
        return { bad, card: [Math.round(cb.width), Math.round(cb.height)], menu: [Math.round(pb.width), Math.round(pb.height)] };
      });
      check(`the game keeps the portrait frame, and the map card and prestige menu lay out cleanly at ${vw}x${vh}`, lay.bad.length === 0, JSON.stringify(lay));
    }
    await page.setViewportSize({ width: 390, height: 844 });

    // Daily spin (DailySpinButtonController): Store 1 shows the button once the blender is bought; the free spin turns
    // the wheel for 5.25 s and the reward screen pays what the pointer shows. MartWelcomeScreen: a first visit to
    // Store 2 offers 300 cash, the ad button (granted here) doubles it, and it never comes back.
    await page.goto(`${url}?fresh`);
    await page.waitForFunction(() => window.__mm && (window.__mm.ready || window.__mm.error), null, { timeout: 90000 });
    const spinHidden = await page.evaluate(() => getComputedStyle(document.querySelector('#spinbtn')).display === 'none');
    await page.evaluate(() => { const g = window.__mmGame; g.sim.completeMat(g.store.mats.find(m => m.name === 'Mat_Activate_Blender')); g.daily.rng = () => 0.05; });
    await page.click('#spinbtn', { timeout: 5000 }).catch(() => {});
    await page.click('#spinmenu [data-act="spin"]', { timeout: 5000 }).catch(() => {});
    await page.waitForSelector('#spinreward.open', { timeout: 9000 }).catch(() => {});
    const spun = await page.evaluate(() => {
      const g = window.__mmGame, d = g.daily, p = d.pending;
      return { pending: p, cheapest: g.sim.boosters.extraCash(), cash: g.sim.state.cash, used: d.g.spin.used, slot: document.querySelector('#spinreward .amt').textContent };
    });
    await page.click('#spinreward [data-act="claim"]', { timeout: 5000 }).catch(() => {});
    const paid = await page.evaluate(() => ({ cash: window.__mmGame.sim.state.cash, rv: getComputedStyle(document.querySelector('#spinmenu .rv')).display !== 'none' }));
    check('the spin button waits for the blender; a free spin landing on the golden slot pays 3 x the cheapest mat, then Extra Spin shows',
      spinHidden && spun.pending && spun.pending.kind === 'cash' && spun.pending.amount === 3 * spun.cheapest && paid.cash === spun.cash + spun.pending.amount
      && spun.used === 1 && paid.rv, JSON.stringify({ spinHidden, ...spun, paid }));
    await page.goto(`${url}?fresh&mart=store2`);
    await page.waitForFunction(() => window.__mm && (window.__mm.ready || window.__mm.error), null, { timeout: 90000 });
    const wel = await page.evaluate(() => ({ open: document.querySelector('#martwelcome').classList.contains('open'), amt: document.querySelector('#martwelcome .amt').textContent, cash: window.__mmGame.sim.state.cash }));
    await page.click('#martwelcome [data-act="double"]', { timeout: 5000 }).catch(() => {});
    const wel2 = await page.evaluate(() => { dispatchEvent(new Event('pagehide')); return window.__mmGame.sim.state.cash; });
    await page.goto(`${url}?mart=store2`);
    await page.waitForFunction(() => window.__mm && (window.__mm.ready || window.__mm.error), null, { timeout: 90000 });
    const wel3 = await page.evaluate(() => document.querySelector('#martwelcome').classList.contains('open'));
    check('a first visit to Store 2 offers 300 cash, the ad button doubles it, and a reload does not offer it again',
      wel.open && wel.amt === '300' && wel2 === wel.cash + 600 && !wel3, JSON.stringify({ ...wel, after: wel2, again: wel3 }));

    // Shop (view/shop.js): the button waits for Store 1's cashier mat. Fresh Store 1 with only the cashier: 2 features
    // (cash bundles x1.2), StoreCashMultiplier 1, so the one-time bundle pays 300 and the free one 60, then waits 5 min.
    // Rolling offer: step 1 pays half the cheapest mat and the next card unlocks; both survive a reload.
    await page.goto(`${url}?fresh`);
    await page.waitForFunction(() => window.__mm && (window.__mm.ready || window.__mm.error), null, { timeout: 90000 });
    const shopHidden = await page.evaluate(() => getComputedStyle(document.querySelector('#shopbtn')).display === 'none');
    await page.evaluate(() => { const g = window.__mmGame; g.sim.step = () => {}; g.sim.completeMat(g.store.mats.find(m => m.name === 'Mat_Activate_Cashier')); g.sim.state.cash = 0; });
    await page.waitForTimeout(300);
    await page.click('#shopbtn', { timeout: 5000 }).catch(() => {});
    const cash0 = await page.evaluate(() => window.__mmGame.sim.state.cash);
    await page.click('[data-buy="coin_bundle_05"]', { timeout: 5000 }).catch(() => {});
    const cash1 = await page.evaluate(() => ({ cash: window.__mmGame.sim.state.cash, gone: !document.querySelector('[data-id="coin_bundle_05"]') }));
    await page.click('[data-buy="coin_bundle_02"]', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);
    const cash2 = await page.evaluate(() => {
      const s = document.querySelector('[data-id="coin_bundle_02"]');
      return { cash: window.__mmGame.sim.state.cash, wait: s.querySelector('.buy').textContent.trim(), skip: !!s.querySelector('.skip') };
    });
    await page.click('[data-buy="daily_deal_01"]', { timeout: 5000 }).catch(() => {});
    const deal = await page.evaluate(() => document.querySelector('[data-id="daily_deal_01"]').classList.contains('grey'));
    await page.click('#shopmenu [data-act="close"]', { timeout: 5000 }).catch(() => {});
    check('the shop opens after the cashier mat: the one-time bundle pays 300 and leaves, the free bundle pays 60 then waits 5 min with a gem skip, a daily deal greys out',
      shopHidden && cash1.cash === cash0 + 300 && cash1.gone && cash2.cash === cash1.cash + 60 && /0[45]:\d\d/.test(cash2.wait) && cash2.skip && deal,
      JSON.stringify({ shopHidden, cash0, cash1, cash2, deal }));
    // The shop button hangs under the counters: with the gem and gold rows showing it must not cover them.
    const stack = await page.evaluate(async () => {
      const g = window.__mmGame, gold0 = g.hud.martMap.global.gold;
      g.hud.martMap.global.gold = 20;
      await new Promise(r => setTimeout(r, 500));
      const r = id => document.querySelector(id).getBoundingClientRect();
      const out = { gold: Math.round(r('#goldc').bottom), gem: Math.round(r('#gemc').bottom), shop: Math.round(r('#shopbtn').top) };
      g.hud.martMap.global.gold = gold0;
      return out;
    });
    check('the shop button sits below the cash, gem and gold counters', stack.shop >= Math.max(stack.gem, stack.gold), JSON.stringify(stack));
    // Rolling offer, Customise and Map open at Store 1 tutorial steps 8, 10 and 14 (unlocks.js); each new button shows a
    // NEW! tip with the arrow until pressed, one tip at a time, and the unlocks survive a reload.
    const gate = await page.evaluate(async () => {
      const g = window.__mmGame, ids = ['#robtn', '#custombtn', '#mapbtn'], wait = ms => new Promise(r => setTimeout(r, ms));
      const vis = () => ids.map(id => getComputedStyle(document.querySelector(id)).display !== 'none');
      const tips = () => [...document.querySelectorAll('.newtip')].map(t => t.parentNode.id);
      const press = async () => { for (let k = 0; k < 6 && tips().length; k++) { document.querySelector('#' + tips()[0]).click(); g.hud.closeMenus(); await wait(250); } };
      const out = { start: vis() };
      g.sim.state.task.index = 9; await wait(300);
      out.at9 = vis(); out.tips9 = tips(); await press(); out.cleared9 = tips();
      g.sim.state.task.index = 11; await wait(300);
      out.at11 = vis(); out.tips11 = tips(); await press();
      g.sim.state.task.index = g.hud.tasks.list.length; await wait(300);
      out.end = vis(); out.tipsEnd = tips(); await press();
      out.state = { ...g.hud.martMap.global.unlocks };
      return out;
    });
    check('Rolling offer, Customise and Map open one by one at tutorial steps 8, 10 and 14, each with a NEW! tip that goes once pressed',
      gate.start.every(v => !v) && gate.at9.join() === 'true,false,false' && gate.tips9.length === 1 && gate.cleared9.length === 0
      && gate.at11.join() === 'true,true,false' && gate.tips11.join() === 'custombtn' && gate.end.every(Boolean) && gate.tipsEnd.join() === 'mapbtn'
      && ['rolling', 'custom', 'map'].every(k => gate.state[k] === 'seen'), JSON.stringify(gate));
    await page.click('#robtn', { timeout: 5000 }).catch(() => {});
    const ro0 =await page.evaluate(() => ({ cash: window.__mmGame.sim.state.cash, cheapest: window.__mmGame.shop.wallet.cheapest() }));
    await page.click('[data-claim="0"]', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const ro1 = await page.evaluate(() => {
      const top = [...document.querySelectorAll('#romenu .card')].find(c => c.getBoundingClientRect().top >= document.querySelector('#romenu .scroll').getBoundingClientRect().top - 2);
      return { cash: window.__mmGame.sim.state.cash, ro: window.__mmGame.shop.g.ro, top: top && top.dataset.i, locked: top && top.classList.contains('locked') };
    });
    // A worker booster of 1 hour (two 30-minute grants) must survive the reload: ShopItemPrefs keeps boosts in play time.
    const boostBefore = await page.evaluate(() => { const b = window.__mmGame.sim.boosters; b.grant('worker', 1800); b.grant('worker', 1800); dispatchEvent(new Event('pagehide')); return Math.round(b.left('worker')); });
    await page.goto(url);
    await page.waitForFunction(() => window.__mm && (window.__mm.ready || window.__mm.error), null, { timeout: 90000 });
    await page.waitForTimeout(500);
    const kept = await page.evaluate(() => ({ unlocked: ['#robtn', '#custombtn', '#mapbtn'].every(id => getComputedStyle(document.querySelector(id)).display !== 'none'), tips: document.querySelectorAll('.newtip').length, ro: window.__mmGame.shop.g.ro, once: !!window.__mmGame.shop.g.shop.bought.coin_bundle_05, btn: getComputedStyle(document.querySelector('#shopbtn')).display !== 'none',
      worker: Math.round(window.__mmGame.sim.boosters.left('worker')) }));
    check('the rolling offer pays half the cheapest mat, scrolls to the next card unlocked, and the ladder, shop, opened buttons and a 1-hour worker booster survive a reload',
      ro0.cheapest > 0 && ro1.cash === ro0.cash + Math.trunc(0.5 * ro0.cheapest) && ro1.ro === 1 && ro1.top === '1' && !ro1.locked
      && kept.ro === 1 && kept.once && kept.btn && kept.unlocked && kept.tips === 0 && boostBefore >= 3600 && Math.abs(kept.worker - boostBefore) <= 2, JSON.stringify({ ro0, ro1, kept, boostBefore }));

    // Seasonal marts (census-events.md): Halloween Mart loads from its own CSV (18 mats), greets with
    // martCashAmounts[13] = 1000, has no next-mart pad, and the map lists all six as open event marts with no prestige.
    await page.goto(`${url}?fresh&mart=hal22`);
    await page.waitForFunction(() => window.__mm && (window.__mm.ready || window.__mm.error), null, { timeout: 90000 });
    const hal = await page.evaluate(() => {
      const g = window.__mmGame, rows = g.hud.martMap.rows(), ev = rows.filter(r => r.seasonal);
      return { err: window.__mm.error, mats: g.store.mats.length, next: !!g.store.nextMart, welcome: document.querySelector('#martwelcome .amt').textContent,
        events: ev.map(r => r.name), open: ev.every(r => r.open && !r.prestige), here: rows.find(r => r.here).id };
    });
    check('Halloween Mart loads its 18 CSV mats, greets with 1,000, has no next-mart pad; the map lists six open event marts',
      !hal.err && hal.mats === 18 && !hal.next && hal.welcome === '1,000' && hal.events.length === 6 && hal.open && hal.here === 'hal22',
      JSON.stringify(hal));

    // Account save (js/cloud.js over the hub's HubSave): a stand-in HubSave keeps one cloud row per account in
    // localStorage key __cloud_<uid> and signs in as __uid. Account A saves, a second device (local save cleared) gets
    // A's progress back, account B on the same browser starts fresh with A's save parked, and A gets its own back.
    const size = await page.evaluate(async () => JSON.stringify((await import('./js/cloud.js')).localPayload()).length);
    check('the whole save fits the 100 KB cloud row after this session', size > 1000 && size < 102400, `${size} bytes`);
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx2.addInitScript(() => {
      const uid = () => localStorage.getItem('__uid');
      const fake = {
        isAvailable: () => !!uid(),
        whoAmI: () => ({ signedIn: !!uid(), userId: uid() }),
        loadSave: async () => {
          const row = localStorage.getItem(`__cloud_${uid()}`);
          return row ? { ok: true, found: true, payload: JSON.parse(row) } : { ok: true, found: false };
        },
        storeSave: async (id, payload) => { localStorage.setItem(`__cloud_${uid()}`, JSON.stringify(payload)); window.__pushes = (window.__pushes || 0) + 1; return { ok: true }; },
      };
      Object.defineProperty(window, 'HubSave', { get: () => fake, set: () => {}, configurable: true });
    });
    const cp = await ctx2.newPage();
    cp.on('pageerror', e => errors.push(e.message));
    // Leave the game for a plain same-origin file first: the game's pagehide save would undo the clearing.
    const blank = url.replace(/index\.html$/, 'art/sfx/sfx.json');
    const boot = async (uid, clearLocal) => {
      await cp.goto(blank);
      await cp.evaluate(([u, c]) => {
        localStorage.setItem('__uid', u);
        if (c) Object.keys(localStorage).filter(k => /^mmm-/.test(k)).forEach(k => localStorage.removeItem(k));
      }, [uid, clearLocal]);
      await cp.goto(url);
      await cp.waitForFunction(() => window.__mm && (window.__mm.ready || window.__mm.error), null, { timeout: 90000 });
      return cp.evaluate(() => {
        const g = window.__mmGame;
        return { cloud: window.__mm.cloud, cash: g.sim.state.cash, cashier: !!g.sim.state.mats.Mat_Activate_Cashier.done,
          backups: Object.keys(localStorage).filter(k => /^mmm-bak-/.test(k)) };
      });
    };
    const a0 = await boot('A', true);
    await cp.evaluate(() => {
      const g = window.__mmGame;
      g.sim.step = () => {};
      g.sim.completeMat(g.store.mats.find(m => m.name === 'Mat_Activate_Cashier'));
      g.sim.state.cash = 1234;
      dispatchEvent(new Event('pagehide'));
    });
    await cp.waitForTimeout(300);
    const row = await cp.evaluate(() => { const r = JSON.parse(localStorage.getItem('__cloud_A') || 'null'); return r && { cash: r.global.cash, owner: r.global.owner, marts: Object.keys(r.marts) }; });
    const a1 = await boot('A', true);
    const b1 = await boot('B', false);
    const a2 = await boot('A', false);
    check('the save follows the account: a second device gets A back, B starts fresh, A returns to its own',
      row && row.cash === 1234 && row.owner === 'A' && row.marts.includes('store1')
      && a1.cloud === 'cloud' && a1.cash === 1234 && a1.cashier
      && b1.cloud === 'fresh' && b1.cash !== 1234 && !b1.cashier && b1.backups.includes('mmm-bak-A')
      && a2.cloud === 'cloud' && a2.cash === 1234 && a2.cashier, JSON.stringify({ a0: a0.cloud, row, a1, b1, a2 }));
    // The upgrade menu's close button is on top (the right column of shop button and booster timers once covered it),
    // and Settings > Delete Account erases this browser's save and the account's cloud row: the reload starts fresh.
    const topX = await cp.evaluate(() => {
      window.__mmGame.sim.boosters.grant('worker', 600);
      document.querySelector('#upbtn').click();
      const x = document.querySelector('#upmenu .x'), r = x.getBoundingClientRect();
      return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === x;
    });
    await cp.click('#upmenu .x').catch(() => {});
    await cp.click('#setbtn').catch(() => {});
    await cp.click('#setmenu [data-del]').catch(() => {});
    await cp.click('#delconfirm [data-act="delete"]').catch(() => {});
    await cp.waitForFunction(() => window.__mm && window.__mm.ready && window.__mmGame && !window.__mmGame.sim.state.mats.Mat_Activate_Cashier.done, null, { timeout: 90000 }).catch(() => {});
    const wiped = await cp.evaluate(() => ({ cloud: window.__mm.cloud, cash: window.__mmGame.sim.state.cash, cashier: !!window.__mmGame.sim.state.mats.Mat_Activate_Cashier.done,
      row: (JSON.parse(localStorage.getItem('__cloud_A') || 'null') || {}).global === null, backups: Object.keys(localStorage).filter(k => /^mmm-bak-/.test(k)).length }));
    check('the upgrade menu close button is on top, and Delete Account wipes the save here and in the account',
      topX && wiped.cloud === 'cloud' && !wiped.cashier && wiped.cash !== 1234 && wiped.backups === 0, JSON.stringify({ topX, wiped }));
    await ctx2.close();

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
