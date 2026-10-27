#!/usr/bin/env node
/* My Mini Mart (games/casual-farm) render checks in a real browser. The bot plays Store 1 fast-forwarded in the page
 * while the scene graph is sampled every half sim-second:
 *   - player, customers and workers face where they walk (the carry slot sits in front of the body);
 *   - a customer pushes the trolley only for orders over limitToCarryByHand (3), and the goods ride in it;
 *   - every mat payment and every desk pickup throws a spinning cash bill;
 *   - no price tag floats over nothing (each one sits on a drawn mat; no walk-on upgrade pad in Store 1).
 * Screenshots of each moment go to MM_SHOTS (default shots/casual-farm-render) for a human look.
 *   node test/casual-farm-render.js
 *   MM_URL=https://poke5121999-art.github.io/survivor-web-hub/games/casual-farm/index.html node test/casual-farm-render.js
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.MM_SHOTS || path.join(ROOT, 'shots', 'casual-farm-render');
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

// Runs in the page: fast-forwards bot + sim + view, sampling the scene graph, until `until` names a moment that
// happened (or the time runs out). Returns the stats so far and the moment's screen point.
function installProbe() {
  const g = window.__mmGame, sim = g.sim, st = sim.state, view = g.view, hud = g.hud;
  const V = g.camera.position.constructor;
  const a = new V(), b = new V();
  const stats = window.__rs = {
    t: 0, samples: 0,
    face: { player: [0, 0], customer: [0, 0], worker: [0, 0] }, faceBad: [],
    trolley: { small: 0, smallShown: 0, big: 0, bigHidden: 0, inCart: 0 },
    pay: { events: 0, bills: 0, miss: [] }, collect: { events: 0, bills: 0, miss: [] },
    tags: { bad: [], upgrade: 0 },
    checkout: { packs: 0, boxes: 0, hopping: 0, leaving: 0, held: 0, faces: 0, desk: 0, deskBills: 0, stray: [] }, phantom: [],
    fx: { walk: 0, dust: 0, gone: 0, gonePuff: 0, pops: 0, popPuff: 0, levels: 0, confetti: 0, boostOn: 0, rings: 0 },
    doors: { busy: 0, open: 0, idle: 0, shut: 0 },
  };
  const ev = window.__ev = [];
  sim.listeners.push(e => ev.push(e));
  // Facing: the carry slot is in front of the chest, so (slot - root) points along the walk.
  const facing = (kind, root, slot, dir) => {
    if (!root || !slot || !root.visible) return;
    root.getWorldPosition(a); slot.getWorldPosition(b);
    const fx = b.x - a.x, fz = b.z - a.z, l = Math.hypot(fx, fz), dl = Math.hypot(dir.dirX, dir.dirZ);
    if (l < 0.3 || dl < 0.5) return;
    const dot = (fx * dir.dirX + fz * dir.dirZ) / l / dl;
    stats.face[kind][dot > 0.9 ? 0 : 1]++;
    if (dot <= 0.9 && stats.faceBad.length < 5) stats.faceBad.push(`${kind} dot ${dot.toFixed(2)}`);
  };
  const sample = () => {
    stats.samples++;
    g.scene.updateMatrixWorld(true);
    if (st.player.moving) facing('player', view.player, view.playerSlot, st.player);
    for (const c of st.customers || []) {
      const v = view.customerViews.get(c.id);
      if (!v) continue;
      if (c.moving && c.state !== 7) facing('customer', v.obj, v.obj.getObjectByName('BoxTransformSlot'), c);
      const shown = !!(v.trolley && v.trolley.visible);
      if (c.state < 5) {
        if (c.trolley) { stats.trolley.big++; if (!shown) stats.trolley.bigHidden++; }
        else { stats.trolley.small++; if (shown) stats.trolley.smallShown++; }
        const s = view.stacks.get(`cust${c.id}`);
        if (c.trolley && s && s.length && s.every(m => m.parent === v.trolley)) stats.trolley.inCart++;
      }
    }
    for (const w of st.workers || []) {
      const v = view.workerViews.get(w.name);
      if (v && w.moving && v.slot !== v.obj) facing('worker', v.obj, v.slot, w);
    }
    hud.update(0);
    for (const [k, t] of hud.tags) {
      if (k.startsWith('mat:')) {
        const o = g.world.byName.get(k.slice(4));
        if (!(o && o.visible) && stats.tags.bad.length < 5) stats.tags.bad.push(k);
      }
      if (k === 'upgrade') stats.tags.upgrade++;
    }
    // Doors: someone inside for a while means open; nobody near for long means shut again.
    for (const d of view.doors || []) {
      if (d.open && d.wait <= 0 && d.k >= 0.999) stats.doors.open++;
      if (d.open) { d.busyT = (d.busyT || 0) + 0.5; d.idleT = 0; if (d.busyT >= 1.5) stats.doors.busy++; }
      else { d.idleT = (d.idleT || 0) + 0.5; d.busyT = 0; if (d.idleT >= 6) { stats.doors.idle++; if (d.k <= 0.001) stats.doors.shut++; } }
    }
    const fx = stats.fx, parts = view.fx ? view.fx.parts : [];
    if (st.player.moving) { fx.walk++; if (parts.some(p => p.look === 'puff' && p.size < 2)) fx.dust++; }
    const b = sim.boosters;
    if (b && (b.on('player') || b.on('machine') || b.on('cash'))) { fx.boostOn++; if (parts.some(p => p.look === 'hexsheet' || p.look === 'ring')) fx.rings++; }
    const co = stats.checkout;
    for (const x of view.checkouts.values()) if (x.hops.length) co.hopping++;
    // Every item mesh in the scene is one the view tracks (a stack, a flight, a hop into a box).
    const known = new Set();
    for (const st2 of view.stacks.values()) st2.forEach(m => known.add(m));
    view.flights.forEach(f => f.ghost && known.add(f.ghost));
    for (const x of view.checkouts.values()) x.hops.forEach(h => known.add(h.g));
    let stray = 0;
    g.scene.traverse(o => { if (o.userData.type !== undefined && o.parent && !known.has(o)) stray++; });
    if (stray && stats.phantom.length < 3) stats.phantom.push(`t${stats.t.toFixed(0)} ${stray} untracked`);
    // Every box in the scene belongs to a checkout of a customer who is packing or leaving.
    let boxes = 0;
    g.scene.traverse(o => { if (o.name === 'PackagingBox' && o.parent) boxes++; });
    const owners = [...view.checkouts.keys()].map(id => (st.customers || []).find(c => c.id === id));
    if ((boxes !== view.checkouts.size || owners.some(c => !c || (c.state !== 5 && c.state !== 7))) && co.stray.length < 3)
      co.stray.push(`t${stats.t.toFixed(0)} boxes ${boxes} checkouts ${view.checkouts.size} states ${owners.map(c => c ? c.state : 'gone').join(',')}`);
    for (const c of st.customers || []) {
      if (c.state !== 7 || !view.checkouts.has(c.id)) continue;
      const x = view.checkouts.get(c.id);
      co.leaving++;
      if (x.phase === 'held' && x.box.parent && x.box.parent.name === 'BoxTransformSlot') co.held++;
      const t = hud.tags.get(`c:${c.id}`);
      if (t && /happyIcon|neutralIcon/.test(t.innerHTML)) co.faces++;
    }
  };
  // A pay or collect event must leave a spinning bill in flight.
  const bills = () => view.flights.filter(f => f.spin && f.type === 11).length;
  window.__ff = (seconds, until) => {
    const DT = 1 / 30;
    let next = 0;
    // Events from real-time frames between two calls were already drawn; only count what this loop steps.
    ev.length = 0;
    for (let t = 0; t < seconds; t += DT) {
      g.bot.step(DT);
      sim.step(DT, { nav: g.nav, grid: g.grid });
      const fresh = ev.splice(0);
      view.update(DT);
      for (const r of g.world.rigs) r.update(DT);
      for (const e of fresh) {
        if (e.type === 'payMat') { stats.pay.events++; if (bills() > 0) stats.pay.bills++; else if (stats.pay.miss.length < 3) stats.pay.miss.push(JSON.stringify(e)); }
        if (e.type === 'customerGone') { stats.fx.gone++; if (view.fx.parts.some(p => p.look === 'puff' && p.age < 0.05 && p.size >= 4)) stats.fx.gonePuff++; }
        if (e.type === 'levelUp' && e.slot.kind === 'producer') { stats.fx.levels++; window.__confettiAt = stats.t + 1.2; }
        if (e.type === 'customerPack') { stats.checkout.packs++; const x = view.checkouts.get(e.id); if (x && x.box.parent) stats.checkout.boxes++; }
        if (e.type === 'deskCash' && e.id != null && e.amount > 0) {
          stats.checkout.desk++;
          if (view.flights.some(f => f.key === `cash${e.cashier}`)) stats.checkout.deskBills++;
        }
        if (e.type === 'collect') { stats.collect.events++; if (bills() > 0) stats.collect.bills++; else if (stats.collect.miss.length < 3) stats.collect.miss.push(JSON.stringify(e)); }
      }
      if (window.__confettiAt && stats.t >= window.__confettiAt) {
        window.__confettiAt = 0;
        if (view.fx.parts.some(p => p.look === 'confetti')) stats.fx.confetti++;
      }
      stats.t += DT;
      if (stats.t >= next) { next = stats.t + 0.5; sample(); }
      const hit = until && until(fresh);
      if (hit) return { stats, hit };
    }
    return { stats, hit: null };
  };
}

// Runs in the page: freezes the game and points the camera (2x zoom) at a world point for a photo, then lets go.
function installHold() {
  const g = window.__mmGame, keep = {};
  window.__hold = p => {
    for (const [o, k] of [[g.sim, 'step'], [g.view, 'update'], [g.director, 'update']].concat(g.bot ? [[g.bot, 'step']] : [])) {
      keep[k + (o === g.director ? 'D' : o === g.bot ? 'B' : o === g.view ? 'V' : 'S')] = [o, k, o[k]];
      o[k] = () => ({ x: p.x, z: p.z, zoom: 0.4 });
    }
  };
  window.__release = () => { for (const [o, k, f] of Object.values(keep)) o[k] = f; };
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = process.env.MM_URL ? null : await serve();
  const url = process.env.MM_URL || `http://localhost:${srv.address().port}/games/casual-farm/index.html`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const kill = setTimeout(() => { console.log('  FAIL timed out after 420 s'); process.exit(1); }, 420000);
  const shots = [];
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const shot = async (name, at) => {
      const px = await page.evaluate(async p => {
        window.__hold(p);
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const s = window.__mmGame.hud.screen({ x: p.x, y: 3, z: p.z });
        return { x: Math.round(s.x), y: Math.round(s.y) };
      }, at);
      const file = path.join(SHOTS, `${name}.png`);
      await page.screenshot({ path: file });
      await page.evaluate(() => window.__release());
      shots.push({ name, file, at, px });
    };

    // Walking by keyboard: the body turns to each of the four directions.
    await page.goto(`${url}?fresh`);
    await page.waitForFunction(() => window.__mm && (window.__mm.ready || window.__mm.error), null, { timeout: 90000 });
    await page.evaluate(installHold);
    const turns = [];
    for (const key of ['KeyD', 'KeyW', 'KeyA', 'KeyS']) {
      await page.keyboard.down(key);
      await page.waitForTimeout(450);
      turns.push(await page.evaluate(() => {
        const g = window.__mmGame, st = g.sim.state.player, V = g.camera.position.constructor, a = new V(), b = new V();
        g.view.player.getWorldPosition(a); g.view.playerSlot.getWorldPosition(b);
        const fx = b.x - a.x, fz = b.z - a.z, l = Math.hypot(fx, fz) || 1;
        return { dot: +((fx * st.dirX + fz * st.dirZ) / l).toFixed(2), x: a.x, z: a.z };
      }));
      if (key === 'KeyD') await shot('walk-right', turns[0]);
      await page.keyboard.up(key);
    }
    check('the player faces each way it walks (WASD)', turns.every(t => t.dot > 0.9), turns.map(t => t.dot).join(' '));

    // Every texture ends sharp: the 16 px placeholder must never win the race with the full image (a second load
    // in the same context comes from the HTTP cache, where the full image tends to land first).
    const sharpness = async () => page.evaluate(async () => {
      await new Promise(r => setTimeout(r, 1500));
      const seen = new Map();
      window.__mmGame.scene.traverse(o => {
        if (!o.isMesh) return;
        for (const m of [].concat(o.material)) {
          const t = m.uniforms && m.uniforms.map && m.uniforms.map.value;
          if (t && t.image) seen.set(t.uuid, t.image.width);
        }
      });
      const w = [...seen.values()];
      return { textures: w.length, blurry: w.filter(x => x <= 16).length };
    });
    const first = await sharpness();
    await page.goto(`${url}?fresh`);
    await page.waitForFunction(() => window.__mm && (window.__mm.ready || window.__mm.error), null, { timeout: 90000 });
    const again = await sharpness();
    check('every texture is the full image, first load and cached reload', first.textures > 3 && first.blurry === 0 && again.blurry === 0,
      `first ${first.blurry}/${first.textures} blurry, reload ${again.blurry}/${again.textures}`);

    // The bot plays; each moment is caught as it happens and photographed. MM_QUICK=1 stops before this part.
    if (process.env.MM_QUICK) throw new Error('quick');
    await page.goto(`${url}?fresh&bot`);
    await page.waitForFunction(() => window.__mm && (window.__mm.ready || window.__mm.error), null, { timeout: 90000 });
    await page.waitForFunction(() => window.__mm.blur === 0, null, { timeout: 90000 });
    await page.waitForTimeout(800); // the canvas blur fades out over a 0.6 s CSS transition
    await page.evaluate(installProbe);
    await page.evaluate(installHold);
    const moment = async (name, seconds, cond) => {
      const r = await page.evaluate(([s, c]) => {
        const f = new Function('fresh', 'g', `return (${c})(fresh, g)`);
        const out = window.__ff(s, fresh => f(fresh, window.__mmGame));
        return { hit: out.hit, t: out.stats.t };
      }, [seconds, cond.toString()]);
      if (r.hit) await shot(name, r.hit);
      return r;
    };
    const payShot = await moment('pay-mat', 120, (fresh, g) => {
      const e = fresh.find(x => x.type === 'payMat');
      return e && g.store.mats.find(m => m.name === e.name).zone.middle;
    });
    check('a mat payment is caught on camera', !!payShot.hit, `at ${payShot.t.toFixed(0)} s`);
    const small = await moment('customer-by-hand', 240, (fresh, g) => {
      const c = (g.sim.state.customers || []).find(x => !x.trolley && x.carried.length > 0 && x.moving && x.state < 2);
      return c && { x: c.x, z: c.z };
    });
    check('a small order is carried by hand on camera', !!small.hit, `at ${small.t.toFixed(0)} s`);
    const pack = await moment('checkout-0-box', 240, fresh => {
      const e = fresh.find(x => x.type === 'customerPack');
      const c = e && window.__mmGame.sim.state.customers.find(x => x.id === e.id);
      if (c) window.__pack = { id: c.id, t0: window.__rs.t, close: e.close };
      return c && { x: c.x, z: c.z };
    });
    check('a checkout is caught on camera', !!pack.hit, `at ${pack.t.toFixed(0)} s`);
    // The same checkout, photographed as the goods hop in, as the sealed box arcs over, and as the customer leaves.
    for (const [name, at] of [['checkout-1-hop', 'p.t0 + 0.75'], ['checkout-2-lift', 'p.t0 + p.close + 1.0'], ['checkout-3-leave', 'p.t0 + p.close + 2.6']]) {
      await moment(name, 20, new Function('fresh', 'g', `const p = window.__pack, c = p && g.sim.state.customers.find(x => x.id === p.id);
        return c && window.__rs.t >= ${at} && { x: c.x, z: c.z };`));
    }
    await moment('fx-dust', 60, (fresh, g) => {
      const p = g.sim.state.player;
      return p.moving && g.view.fx.parts.filter(x => x.look === 'puff' && x.size < 2).length >= 3 && { x: p.x, z: p.z };
    });
    await moment('fx-poof', 240, (fresh, g) => {
      const p = fresh.some(x => x.type === 'customerGone') && g.view.fx.parts.find(x => x.look === 'puff' && x.size >= 4 && x.age < 0.05);
      return p && { x: p.pos.x, z: p.pos.z };
    });
    const collect = await moment('collect-cash', 240, (fresh, g) => {
      const e = fresh.find(x => x.type === 'collect');
      return e && { x: g.sim.state.player.x, z: g.sim.state.player.z };
    });
    check('a desk cash pickup is caught on camera', !!collect.hit, `at ${collect.t.toFixed(0)} s`);
    const big = await moment('customer-trolley', 900, (fresh, g) => {
      const c = (g.sim.state.customers || []).find(x => x.trolley && x.carried.length >= 2 && x.state < 2);
      return c && { x: c.x, z: c.z };
    });
    check('a big order with a trolley is caught on camera', !!big.hit, `at ${big.t.toFixed(0)} s`);
    await page.evaluate(() => window.__ff(300));
    // A machine upgrade bought outright (the bot rarely affords one this early): confetti must follow a second later.
    await page.evaluate(() => {
      const g = window.__mmGame, sim = g.sim;
      const i = g.store.producers.findIndex(p => p.upgradable && sim.isActive(p.name));
      if (i < 0) return;
      sim.state.cash += 100000;
      if (sim.buyUpgrade({ kind: 'producer', i })) { window.__rs.fx.levels++; window.__confettiAt = window.__rs.t + 1.2; }
      window.__ff(2);
    });

    const s = await page.evaluate(() => window.__rs);
    const f = s.face;
    check('the player faces where it walks', f.player[0] > 20 && f.player[1] === 0, `${f.player[0]} ok, ${f.player[1]} wrong`);
    check('customers face where they walk', f.customer[0] > 50 && f.customer[1] === 0, `${f.customer[0]} ok, ${f.customer[1]} wrong ${s.faceBad.join(', ')}`);
    check('workers face where they walk', f.worker[1] === 0, `${f.worker[0]} ok, ${f.worker[1]} wrong`);
    const tr = s.trolley;
    check('orders of 3 or fewer never show a trolley', tr.small > 50 && tr.smallShown === 0, `${tr.smallShown}/${tr.small} samples with a trolley`);
    check('orders over 3 always push a trolley with the goods inside', tr.big > 10 && tr.bigHidden === 0 && tr.inCart > 0,
      `${tr.bigHidden}/${tr.big} samples without, ${tr.inCart} with goods in the basket`);
    check('every mat payment throws a cash bill', s.pay.events > 20 && s.pay.bills === s.pay.events, `${s.pay.bills}/${s.pay.events} ${s.pay.miss.join(' ')}`);
    check('every desk pickup throws a cash bill', s.collect.events > 20 && s.collect.bills === s.collect.events, `${s.collect.bills}/${s.collect.events} ${s.collect.miss.join(' ')}`);
    const fx = s.fx;
    check('the player sheds dust while walking', fx.walk > 20 && fx.dust > fx.walk * 0.8, `${fx.dust}/${fx.walk} walking samples with dust`);
    check('a leaving customer vanishes in a smoke puff', fx.gone > 10 && fx.gonePuff === fx.gone, `${fx.gonePuff}/${fx.gone}`);
    check('a machine level-up throws confetti a second later', fx.levels > 0 && fx.confetti === fx.levels, `${fx.confetti}/${fx.levels}`);
    check('boost rings show while a booster runs', fx.boostOn > 10 && fx.rings > fx.boostOn * 0.8, `${fx.rings}/${fx.boostOn} samples`);
    const dr = s.doors;
    check('entrance doors open while someone walks through and shut after', dr.busy > 5 && dr.open >= dr.busy * 0.8 && dr.idle > 5 && dr.shut >= dr.idle * 0.98,
      `open ${dr.open}/${dr.busy} busy samples, shut ${dr.shut}/${dr.idle} idle samples`);
    const co = s.checkout;
    check('every checkout pops a box at the desk', co.packs > 10 && co.boxes === co.packs, `${co.boxes}/${co.packs}`);
    check('goods are seen hopping into the box', co.hopping > 5, `${co.hopping} samples`);
    check('customers leave holding the sealed box', co.leaving > 10 && co.held === co.leaving, `${co.held}/${co.leaving} samples`);
    check('no phantom item meshes in the scene', s.phantom.length === 0, s.phantom.join(' | ') || 'none');
    check('no stray box: each one is held by a packing or leaving customer', co.stray.length === 0, co.stray.join(' | ') || 'none');
    check('leaving customers show a face bubble', co.leaving > 10 && co.faces === co.leaving, `${co.faces}/${co.leaving} samples`);
    check('payment bills fly from the customer to the desk pile', co.desk > 10 && co.deskBills === co.desk, `${co.deskBills}/${co.desk}`);
    check('no price tag floats over an undrawn mat', s.tags.bad.length === 0, s.tags.bad.join(', ') || `${s.samples} samples`);
    check('Store 1 has no walk-on upgrade pad tag', s.tags.upgrade === 0, `${s.tags.upgrade} samples with one`);
    // NewVisualObjectActivator / NewVisualMeshRendererActivator: of each old/new prop pair exactly one set is drawn (the
    // old one, as in the gameplay clip): no red bin under a green one, no two office chairs.
    const vis = await page.evaluate(() => {
      const shown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
      const out = { old: 0, neu: 0, oldOff: [], neuOn: [] };
      for (const o of window.__mmGame.world.objects) {
        const k = o.userData.node.k || {};
        for (const c of ['__Funflare.Scripts.Helper.NewVisualObjectActivator', '__Funflare.Scripts.Helper.NewVisualMeshRendererActivator']) {
          if (!k[c]) continue;
          const isNew = !!(Array.isArray(k[c]) ? k[c][0] : k[c]).isNewVersion;
          const mesh = c.endsWith('RendererActivator') ? o.children.find(m => m.isMesh && !m.userData.node) : o;
          const on = mesh && shown(o) && mesh.visible;
          if (isNew) { out.neu++; if (on) out.neuOn.push(o.name); } else { out.old++; if (!on && shown(o.parent)) out.oldOff.push(o.name); }
        }
      }
      return out;
    });
    check('only the old prop set is drawn, never both old and new', vis.old > 5 && vis.neu > 5 && vis.neuOn.length === 0 && vis.oldOff.length === 0, JSON.stringify(vis));
    check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');
  } catch (e) {
    if (e.message !== 'quick') throw e;
  } finally {
    clearTimeout(kill);
    await browser.close();
    if (srv) srv.close();
  }
  fs.writeFileSync(path.join(SHOTS, 'shots.json'), JSON.stringify(shots, null, 1));
  console.log(`  shots: ${SHOTS}`);
  console.log(`PASS: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
