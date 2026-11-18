// Drives the real shift loop of games/repo3d through the UI: lobby -> CHƠI -> house 1 (carry loot to pads with the beam, escape,
// board) -> station (buy a health pack with the pay pad) -> house 2 -> houses 3-5 by labelled TEST HOOKS -> win run-end; then a
// revive check and the quota-unreachable lose case, and a down lose case. Asserts transitions, wallet math, text budget of the HUD,
// 0 console errors and fps >= 50. The driver is cheat-free for loot: the player may be teleported (between rooms / to a pedestal),
// loot only moves by the grab beam and physics. Usage: node games/repo3d/tools/run.js [outDir]
'use strict';
const fs = require('fs');
const path = require('path');
const { serve } = require('../../../tools/thumb-lib.js');
const { launch: pwLaunch } = require('./pw.js');
const OUT = process.argv[2] || require('./pw.js').scratch('run');
fs.mkdirSync(OUT, { recursive: true });
const failures = [];
const check = (ok, name, detail) => { if (!ok) failures.push(name); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== undefined && detail !== '' ? ' :: ' + detail : ''}`); };

// ---- page-side driver (runs in the game page)
const DRV = `window.__drv = (() => {
  const G = __G, P = G.player, IDLE = __IDLE;
  const norm = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const pos = () => P.body.translation();
  const faceErr = (tx, tz) => { const p = pos(); return norm(Math.atan2(-(tx - p.x), -(tz - p.z)) - P.yaw); };
  const tp = (x, z, yaw) => { P.body.setTranslation({ x, y: 0.85, z }, true); P.yaw = yaw; P.pitch = 0; P.vy = 0; __sim(0.1); };
  const inPad = (it, pad, m) => { const t = it.body.translation(); return Math.abs(t.x - pad.x) < pad.half - m && Math.abs(t.z - pad.z) < pad.half - m; };
  // follow waypoints; hold = item to carry (released when it rests inside 'pad'); returns { arrived, released, t }
  function follow(wp, o = {}) {
    let idx = 0, t = 0, released = false, stuck = 0, last = pos(), lastT = 0;
    const maxS = o.maxS || 40;
    const out = { arrived: false, released: false, t: 0 };
    for (let c = 0; c < maxS * 2; c++) {
      __sim(0.5, () => {
        const p = pos();
        while (idx < wp.length - 1 && Math.hypot(wp[idx].x - p.x, wp[idx].z - p.z) < 0.6) idx++;
        const g = wp[idx];
        if (o.hold && !released && !o.hold.dead && o.pad && inPad(o.hold, o.pad, 0.3)) { const v = o.hold.body.linvel(); if (Math.hypot(v.x, v.y, v.z) < 0.8) released = true; }
        const d = faceErr(g.x, g.z), dist = Math.hypot(g.x - p.x, g.z - p.z);
        const done = idx >= wp.length - 1 && dist < (o.tol || 0.45);
        return { ...IDLE, mz: (done || released || Math.abs(d) > 0.7) ? 0 : 1, dyaw: -d * 0.25, dpitch: o.hold ? (P.pitch + 0.3) * 0.2 : -P.pitch * 0.2, grab: !!o.hold && !released };
      });
      t += 0.5;
      const p = pos();
      if (Math.hypot(wp[wp.length - 1].x - p.x, wp[wp.length - 1].z - p.z) < (o.tol || 0.45)) { out.arrived = true; }
      if (released && !G.grab.held) { out.released = true; if (!o.afterRelease) break; }
      if (o.hold && o.hold.dead) break;
      if (out.arrived && !o.hold) break;
      if (t - lastT >= 4) { if (Math.hypot(p.x - last.x, p.z - last.z) < 0.3) stuck++; else stuck = 0; last = { x: p.x, z: p.z }; lastT = t; if (stuck >= 3) break; }
    }
    out.t = t; out.released = out.released || released; return out;
  }
  const route = (x, z) => { const p = pos(); return G.nav.path(p.x, p.z, x, z) || [{ x, z }]; };
  function aimAt(it) {
    const c = P.camPos, t = it.body.translation(), p = pos();
    P.yaw = Math.atan2(-(t.x - p.x), -(t.z - p.z)); __sim(0.05);
    P.pitch = Math.atan2(t.y - P.camPos.y, Math.hypot(t.x - P.camPos.x, t.z - P.camPos.z)); __sim(0.02);
  }
  // teleport the player next to the item on the side away from the goal, grab it
  function grabItem(it, goal) {
    const ip = it.body.translation(); let best = null;
    for (let k = 0; k < 16; k++) {
      const a = k * Math.PI / 8, x = ip.x + 1.4 * Math.cos(a), z = ip.z + 1.4 * Math.sin(a);
      const ci = Math.floor(z) * G.nav.W + Math.floor(x);
      if (!G.nav.ok(Math.floor(x), Math.floor(z)) || G.nav.near[ci] < 2) continue;
      const sc = Math.hypot(x - goal.x, z - goal.z);
      if (!best || sc > best.sc) best = { x, z, sc };
    }
    if (!best) return false;
    tp(best.x, best.z, 0); aimAt(it);
    return G.grab.tryGrab() && G.grab.held === it;
  }
  const pathLen = (a, b) => { const w = G.nav.path(a.x, a.z, b.x, b.z); if (!w) return 1e9; let s = 0, px = a.x, pz = a.z; for (const q of w) { s += Math.hypot(q.x - px, q.z - pz); px = q.x; pz = q.z; } return s; };
  // cash in the active pad: carry loot until its value reaches the quota, then stand on it for the 3 s hold
  function firePad() {
    const X = G.extract, start = X.active, pad = X.pads[start], rep = { trips: [], fired: false };
    for (let trip = 0; trip < 12 && X.active === start; trip++) {
      __sim(0.2);
      if (pad.value >= pad.quota) {
        const w = route(pad.x, pad.z); follow(w, { tol: 0.5 });
        for (let c = 0; c < 10 && X.active === start; c++) __sim(0.5, () => ({ ...IDLE }));
        continue;
      }
      const cands = G.loot.items.filter((i) => !i.dead && !i.held && !inPad(i, pad, 0.2) && i.value > 0);
      const need = pad.quota - pad.value;
      const scored = cands.filter((i) => !i.skip).map((i) => { const t = i.body.translation(), L = pathLen(t, pad), enough = i.value >= need && i.size !== 'big'; return { i, s: (enough ? 1e6 : 0) + (enough ? -L : i.value / (8 + L)) }; }).sort((a, b) => b.s - a.s);
      if (!scored.length) { rep.noLoot = true; break; }
      const it = scored[0].i, v0 = it.value;
      if (!grabItem(it, pad)) { rep.trips.push({ v: v0, grab: false }); it.skip = true; continue; }
      const w = route(pad.x, pad.z), prev = w.length > 1 ? w[w.length - 2] : pos(), dx = pad.x - prev.x, dz = pad.z - prev.z, dl = Math.hypot(dx, dz) || 1;
      w[w.length - 1] = { x: pad.x - dx / dl * 1.4, z: pad.z - dz / dl * 1.4 };   // the beam holds the item about 1.4 m ahead of the player
      const r = follow(w, { hold: it, pad, maxS: 70, afterRelease: false, tol: 0.3 });
      if (G.grab.held) G.grab.release(false);
      rep.trips.push({ v: v0, now: it.dead ? 0 : it.value, released: r.released, t: r.t });
    }
    rep.fired = X.active > start; rep.haul = X.haul; return rep;
  }
  return { follow, route, tp, aimAt, grabItem, firePad, inPad, pos };
})()`;

(async () => {
  const srv = await serve();
  const br = await pwLaunch();
  const kill = setTimeout(() => { console.log('FAIL hard timeout 600 s'); process.exit(2); }, 600000);
  const logs = [];
  try {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'x@test' })); } catch (e) {} });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
    page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
    const ev = (s) => page.evaluate(s);
    const shot = (n) => page.screenshot({ path: path.join(OUT, n + '.png') });
    const settle = (ph, ms = 90000) => page.waitForFunction(`__G.run.phase === '${ph}' && !__G.runner.busy`, null, { timeout: ms });
    const sleep = (ms) => page.waitForTimeout(ms);
    const press = async () => { // lobby -> modes -> first CHƠI (Ải 5 nhà)
      await page.locator('.ui-layer.lobby .playbtn').click();
      await sleep(400);
      await page.locator('.ui-layer.lobby button', { hasText: 'CHƠI' }).first().click();
    };
    // HUD rule (owner): gauges are bars, rings, icons; money is the only number. hudCheck counts the text left and asserts graphics.
    const vis = (sel) => `(() => { const e = document.querySelector('${sel}'); if (!e) return false; const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && !e.closest('[hidden], .hidden'); })()`;
    const hudCheck = async (label, gfx, sim = '__sim(0.05)') => {
      await ev(sim);
      const t = await hudText();
      check(t.n <= 20, `${label}: HUD text <= 20 chars (excluding $ amounts)`, `${t.n} chars: "${t.rest}" raw="${t.raw}"`);
      for (const [name, sel] of gfx) check(await ev(vis(sel)), `${label}: ${name} drawn as a graphic`, sel);
    };
    const hudText = () => ev(`(() => { const t = [...document.querySelectorAll('.ui-root .hud, .hx')].map((e) => e.innerText || '').join(' ');
      const rest = t.replace(/\\$\\s?[\\d,]+/g, '').replace(/\\s+/g, ''); return { raw: t.replace(/\\s+/g, ' ').trim(), n: rest.length, rest }; })()`);

    // ---------------------------------------------------------------- lobby
    await page.goto(srv.base + '/games/repo3d/index.html?seed=7');
    await page.waitForFunction('window.__ready === true || window.__fatal', null, { timeout: 60000 });
    check(!(await ev('window.__fatal || null')), 'boot');
    check((await ev('__G.run.phase')) === 'lobby', 'game page starts in the lobby');
    await sleep(500);
    await shot('01-lobby');
    await ev(DRV);
    await ev('__G.runner.opts.foeSleep = 1e6');   // foes asleep until a noise wakes them
    await press();
    await settle('loot');
    check((await ev('__G.run.house')) === 1, 'CHƠI starts house 1 (phase loot)');

    // ---------------------------------------------------------------- house 1: quota, HUD, fps
    const q1 = await ev(`(() => { const R = __G.run, X = __G.extract; return { total: R.quotaTotal, lootSum: R.lootSum0, level: R.level, pads: X.pads.length, per: X.pads[0].quota, wallet: R.wallet, themes: R.themes }; })()`);
    const expect1 = Math.round(q1.lootSum * 0.7 * 0.4 * 0.55);
    check(q1.level === 1 && q1.total === expect1, 'house 1 quotaTotal = round(sum value0 * 0.7 * 0.4 * 0.55)', JSON.stringify(q1));
    check(q1.wallet === 5000 && q1.themes.length === 5 && new Set(q1.themes).size === 5, 'wallet starts 5000, 5 themes shuffled', q1.themes.join(','));
    await sleep(2800);  // toasts are gone
    const f0 = await ev('__G.frames'); await sleep(3000); const f1 = await ev('__G.frames');
    check((f1 - f0) / 3 >= 50, 'fps >= 50 in house 1 at 1280x720', ((f1 - f0) / 3).toFixed(1));
    await ev('window.__paused = true');
    await ev('__sim(0.2)');
    await shot('02-hud-house1-1280x720');
    await page.setViewportSize({ width: 832, height: 384 }); await sleep(500);
    await shot('02-hud-house1-832x384');
    await hudCheck('house 1 at 832x384', [['hp bar', '.ui-root .hud .hp .fl'], ['stamina bar', '.ui-root .hud .st .fl'], ['noise segments', '.ui-root .hud .noise .seg'], ['detection eye', '.hx .eye svg'], ['house pips', '.hx .pips i'], ['pad icons', '.hx .pads b']]);
    await page.setViewportSize({ width: 1280, height: 720 }); await sleep(300);

    // ---------------------------------------------------------------- house 1: carry to the pad (the only pad, in the truck room)
    // a foe goes down first so the escape respawn is observable
    const killed = await ev(`(() => { const F = __G.foes, f = F.list.find((x) => !x.def.immune); if (!f) return null; F.hurtFoe(f, 1e6); return { id: f.id, kind: f.kind }; })()`);
    check(!!killed, 'a foe was taken down before the escape', JSON.stringify(killed));
    await ev(`(() => { const F = __G.foes; for (const f of [...F.list]) if (!f.dead) F.remove(f); })()`);   // harness: other foes are covered by tools/foes.js
    const w0 = await ev('__G.run.wallet');
    const rep1 = await ev('__drv.firePad()');
    console.log('  house 1 trips:', JSON.stringify(rep1.trips));
    // carrying can outlast the normal 45 s respawn: a foe already back on its feet is taken down again now, in the escape
    if (killed) console.log('  foe at escape start:', await ev(`(() => { const F = __G.foes, f = F.list.find((x) => x.id === ${killed.id}); const was = f.dead ? 'down' : 'respawned, down again'; if (!f.dead) F.hurtFoe(f, 1e6); return was; })()`));
    check(rep1.fired, 'house 1 pad fired by carrying loot', JSON.stringify(rep1));
    const st1 = await ev(`({ phase: __G.run.phase, wallet: __G.run.wallet, haul: __G.run.haul, houseHaul: __G.run.houseHaul, hp: __G.player.hp })`);
    check(st1.phase === 'escape', 'last pad cashed -> phase escape', st1.phase);
    check(st1.wallet === w0 + st1.haul && st1.haul >= q1.per, 'wallet = start + paid (final pad pays everything)', JSON.stringify(st1));

    // ---------------------------------------------------------------- escape
    await ev(`(() => { const T = __G.truck.button, P = __G.player; P.body.setTranslation({ x: T.x + 6, y: 0.85, z: T.z }, true); __sim(0.1); })()`);
    await ev('__sim(3.5)');
    const esc = await ev(`(() => { const R = __G.run, E = R.escape, F = __G.foes, L = __G.house.layout; const f = F.list.find((x) => x.id === ${killed ? killed.id : 0});
      const at = f && f.respawnAt, room = at && L.rooms.find((r) => at.x >= r.x && at.x < r.x + r.w && at.z >= r.y && at.z < r.y + r.h);
      const adj = new Set(); for (const d of L.doors) { if (d.a === 0) adj.add(d.b); if (d.b === 0) adj.add(d.a); }
      return { phase: R.phase, dim: +E.dim.toFixed(2), pings: E.pings, foeAlive: !!f && !f.dead, foeRoom: room ? room.id : null, adjacent: room ? adj.has(room.id) : false, noise: __G.noise.events.filter((e) => e.src === 'horn').length }; })()`);
    check(esc.phase === 'escape' && Math.abs(esc.dim - 0.16) < 0.01, 'escape: lights dim to 0.16', JSON.stringify(esc));
    check(esc.foeAlive && esc.adjacent, 'escape: the downed foe respawns in a room next to the truck room', JSON.stringify(esc));
    check(esc.pings >= 1, 'escape: horn pings', String(esc.pings));
    await ev('window.__paused = false'); await sleep(250); await ev('window.__paused = true');
    await shot('03-escape');
    await hudCheck('escape', [['truck + arrow to the button', '.hx .esc svg.tr'], ['arrow', '.hx .esc svg.ar']]);
    const hpBefore = await ev('(() => { __G.player.hurt(30); return __G.player.hp; })()');
    // walk to the truck button
    await ev(`(() => { const T = __G.truck.button; const P = __G.player; P.body.setTranslation({ x: T.x + 2.5, y: 0.85, z: T.z }, true); __sim(0.05); __drv.follow([{ x: T.x, z: T.z }], { tol: 0.3, maxS: 6 }); __sim(2.2, () => __IDLE); })()`);
    await settle('station');
    const heal = await ev(`__G.run.log.find((l) => l[0] === 'board')[2]`);
    check(heal.heal === 50 && heal.hp[1] === Math.min(100, hpBefore + 50), 'boarding heals 50 in house 1', JSON.stringify(heal));
    check((await ev('__G.run.cleared')) === 1, 'house 1 cleared');

    // ---------------------------------------------------------------- station: buy a health pack on the pay pad
    await ev('__sim(0.5); window.__paused = false'); await sleep(400); await ev('window.__paused = true');
    await shot('04-station');
    await hudCheck('station', [['hp bar', '.ui-root .hud .hp .fl']]);
    check(!(await ev(vis('.hx .esc'))), 'station: escape truck/arrow hidden');
    check(!(await ev(`document.querySelector('.ui-root .hud .quota').textContent`)), 'station: no "/ $0" quota next to the wallet');
    const sw = await ev('({ wallet: __G.run.wallet, haul: __G.run.haul, spent: __G.run.spent })');
    check(sw.wallet === 5000 + sw.haul - sw.spent, 'wallet math before shopping', JSON.stringify(sw));
    const buy = await ev(`(() => { const G = __G, S = G.station, P = G.player;
      const it = S.items.filter((i) => i.offer.id === 'pack25')[1];
      const it0 = it.body.translation();
      __drv.tp(it0.x, it0.z + 1.5, 0); __drv.aimAt(it);
      const grabbed = G.grab.tryGrab() && G.grab.held === it;
      const r = __drv.follow([{ x: S.pad.x, z: S.pad.z }], { hold: it, pad: S.pad, maxS: 40 });
      if (G.grab.held) G.grab.release(false);
      __sim(0.5, () => __IDLE);
      const onPad = S.itemsOnPad().length;
      __drv.follow([{ x: S.pad.x, z: S.pad.z }], { tol: 0.3, maxS: 8 });
      let mid = null;
      for (let k = 0; k < 14; k++) { __sim(0.5, () => __IDLE); if (k === 3) mid = S.payHold; if (G.run.packs[0] > 0) break; }
      return { grabbed, released: r.released, onPad, mid, packs: G.run.packs.slice(), wallet: G.run.wallet }; })()`);
    check(buy.grabbed && buy.onPad >= 1, 'pack carried onto the pay pad by the beam', JSON.stringify(buy));
    check(buy.packs[0] === 1 && buy.wallet === sw.wallet - 1800, 'pay pad hold buys the 25 hp pack (-$1800)', JSON.stringify(buy));
    const useR = await ev(`(() => { const P = __G.player; P.hurt(40); const h0 = P.hp; __G.input.pressed.add('Digit1'); __sim(0.05); __G.input.pressed.clear(); return { h0, h1: P.hp, packs: __G.run.packs.slice() }; })()`);
    check(useR.h1 === Math.min(100, useR.h0 + 25) && useR.packs[0] === 0, 'key 1 uses the pack: +25 hp', JSON.stringify(useR));
    // not enough money: the pay pad turns red, no purchase, no text (wallet lowered only for this check, then restored)
    const short = await ev(`(() => { const G = __G, S = G.station, R = G.run, w = R.wallet; R.wallet = 100;
      const it = S.items.find((i) => i.offer.id === 'pack25'); const t0 = it.body.translation();
      __drv.tp(t0.x, t0.z + 1.5, 0); __drv.aimAt(it); const grabbed = G.grab.tryGrab() && G.grab.held === it;
      __drv.follow([{ x: S.pad.x, z: S.pad.z }], { hold: it, pad: S.pad, maxS: 40 }); if (G.grab.held) G.grab.release(false);
      __sim(0.5, () => __IDLE); __drv.follow([{ x: S.pad.x, z: S.pad.z }], { tol: 0.3, maxS: 8 }); __sim(4, () => __IDLE);
      const r = { grabbed, onPad: S.itemsOnPad().length, short: S.short, packs: R.packs[0], wallet: R.wallet };
      r.w = w; return r; })()`);
    check(short.grabbed && short.onPad >= 1 && short.short && short.packs === 0 && short.wallet === 100, 'station: pad item over budget -> pad turns red, nothing bought', JSON.stringify(short));
    await ev('window.__paused = false'); await sleep(250); await ev('window.__paused = true');
    await shot('04b-station-short');
    await hudCheck('station short of money', []);
    await ev(`__G.run.wallet = ${short.w}`);
    await ev('__G.runner.opts.foes = "none"');
    const dep = await ev(`(() => { const B = __G.station.button; __drv.tp(B.x + 3, B.z - 1.5, 0); const r = __drv.follow([{ x: B.x, z: B.z }], { tol: 0.3, maxS: 8 });
      const p = __drv.pos(), hold0 = B.hold; __sim(2, () => __IDLE);
      return { r, btn: { x: B.x, z: B.z, half: B.half }, at: { x: +p.x.toFixed(2), z: +p.z.toFixed(2) }, hold0, phase: __G.run.phase }; })()`);
    check(dep.phase !== 'station', 'standing on the depart button leaves the station', JSON.stringify(dep));
    await settle('loot');
    check((await ev('__G.run.house')) === 2, 'depart button -> house 2');

    // ---------------------------------------------------------------- house 2: two pads, one by one
    const h2 = await ev(`({ pads: __G.extract.pads.length, quota: __G.run.quotaTotal, lootSum: __G.run.lootSum0, per: __G.run.padQuota, level: __G.run.level })`);
    check(h2.pads === 2 && h2.level === 3 && h2.quota === Math.round(h2.lootSum * 0.7 * (0.4 + 0.3 * 2 / 9) * 0.55), 'house 2: 2 pads, level 3 quota', JSON.stringify(h2));
    const carried = await ev(`(() => { const G = __G, pad = G.extract.pads[0]; const it = G.loot.items.filter((i) => !i.dead && i.size !== 'small').sort((a, b) => b.value - a.value)[0];
      const ok = __drv.grabItem(it, pad); return { ok, size: it.size }; })()`);
    check(carried.ok, 'house 2: beam holds an item for the carry HUD', JSON.stringify(carried));
    await hudCheck('carrying', [['carried value tag with loss bar', '.hx .tag .bar'], ['carry weight gauge', '.hx .wt']], '__sim(0.05, () => ({ ...__IDLE, grab: true }))');
    await ev('__G.grab.release(false); __sim(0.5, () => __IDLE)');
    const wh2 = await ev('__G.run.wallet');
    const repA = await ev('__drv.firePad()');
    console.log('  house 2 pad 1 trips:', JSON.stringify(repA.trips));
    const mid2 = await ev(`({ active: __G.extract.active, wallet: __G.run.wallet, bags: __G.loot.items.filter((i) => i.isBag).map((i) => ({ v: i.value, s: i.size })), phase: __G.run.phase })`);
    check(repA.fired && mid2.active === 1 && mid2.phase === 'loot', 'house 2: first pad cashed, second pad opens', JSON.stringify(mid2));
    check(mid2.wallet === wh2 + h2.per, 'house 2: non-final pad pays exactly its quota', `${wh2} -> ${mid2.wallet} (quota ${h2.per})`);
    if (mid2.bags.length) check(mid2.bags.every((b) => b.s === (b.v < 1100 ? 'small' : b.v < 3200 ? 'medium' : 'big')), 'surplus became a money bag sized by value', JSON.stringify(mid2.bags));
    else console.log('  (no surplus on pad 1, no bag)');
    const repB = await ev('__drv.firePad()');
    console.log('  house 2 pad 2 trips:', JSON.stringify(repB.trips));
    check(repB.fired, 'house 2: final pad cashed', JSON.stringify(repB));
    check((await ev('__G.run.phase')) === 'escape', 'house 2 -> escape');
    await ev('window.__paused = false'); await sleep(300); await ev('window.__paused = true');
    await ev(`(() => { const T = __G.truck.button, P = __G.player; P.body.setTranslation({ x: T.x + 2.5, y: 0.85, z: T.z }, true); __sim(0.05); __drv.follow([{ x: T.x, z: T.z }], { tol: 0.3, maxS: 6 }); __sim(2.2, () => __IDLE); })()`);
    await settle('station');
    check((await ev('__G.run.cleared')) === 2, 'house 2 boarded -> station');

    // ---------------------------------------------------------------- houses 3-5: TEST HOOKS complete the pads
    for (const n of [3, 4, 5]) {
      await ev('__G.runner.leaveStation && __G.run.phase === "station" && __G.runner.leaveStation()');
      if (n === 3) await settle('loot'); else await settle('loot');
      check((await ev('__G.run.house')) === n, `house ${n} loaded (TEST HOOK: leaveStation)`);
      const qn = await ev('({ pads: __G.extract.pads.length, total: __G.run.quotaTotal, lootSum: __G.run.lootSum0, level: __G.run.level, theme: __G.run.theme })');
      check(qn.pads >= 2 && qn.level === [1, 3, 6, 10, 15][n - 1], `house ${n}: ${qn.pads} pads, level ${qn.level}, ${qn.theme}`, JSON.stringify(qn));
      await ev('__G.runner.testCompletePads()');           // TEST HOOK: pads cashed as if delivered
      check((await ev('__G.run.phase')) === 'escape', `house ${n}: TEST HOOK cleared pads -> escape`);
      if (n === 5) await shot('05-house5-escape');
      await ev('__G.runner.testBoard()');                    // TEST HOOK: boarding
      if (n < 5) await settle('station'); else await page.waitForFunction("__G.run.phase === 'end'", null, { timeout: 20000 });
    }
    const end = await ev(`({ phase: __G.run.phase, win: __G.run.win, reason: __G.run.reason, cleared: __G.run.cleared, wallet: __G.run.wallet, haul: __G.run.haul, spent: __G.run.spent, shown: !document.querySelector('.runend-wrap').classList.contains('hidden') })`);
    check(end.phase === 'end' && end.win && end.cleared === 5 && end.shown, 'win run-end screen after house 5', JSON.stringify(end));
    check(end.wallet === 5000 + end.haul - end.spent, 'final wallet = 5000 + haul - spent', JSON.stringify(end));
    await sleep(500); await shot('06-run-end-win');
    await page.locator('.re-go').click();
    await page.waitForFunction("__G.run.phase === 'lobby'", null, { timeout: 10000 });
    check(true, 'run-end back-to-lobby button returns to the lobby');

    // ---------------------------------------------------------------- run 2: revive, then quota unreachable
    await press(); await settle('loot');
    await ev('window.__paused = true');
    const rev = await ev(`(() => { const G = __G, P = G.player, R = G.run; R.crew = 2;   // a mate exists, so a downed player is not the end
      P.hurt(999); __sim(0.3);
      window.__downHud = { head: !!document.querySelector('.hx svg.head') };
      const down = P.down, head = P.head; const pad = G.extract.pads[0];
      head.body.setTranslation({ x: pad.x, y: 0.5, z: pad.z }, true);   // stand-in for a mate carrying the head to the pad
      __sim(0.4);
      return { down, hp: P.hp, up: !P.down, headGone: !P.head, phase: R.phase }; })()`);
    check(rev.down && rev.up && rev.hp === 1 && rev.headGone, 'head on the active pad revives the player with 1 hp', JSON.stringify(rev));
    check(await ev('window.__downHud.head'), 'down: head icon drawn instead of text');
    await ev('__G.run.crew = 1');
    const lose = await ev(`(() => { const G = __G; for (const it of [...G.loot.items]) G.loot.destroy(it, true); __sim(0.1);
      let t = 0, rest = 0; const seen = [];
      for (let k = 0; k < 120 && G.run.phase === 'loot'; k++) { __sim(0.5, () => __IDLE); t += 0.5; seen.push(G.loot.items.length); }
      return { phase: G.run.phase, reason: G.run.reason, restocked: G.run.restocked, cap: 0.5 * G.run.quotaTotal, items: G.loot.items.length, t, quota: G.run.quotaTotal, win: G.run.win }; })()`);
    check(lose.phase === 'end' && lose.reason === 'quota' && lose.win === false, 'quota unreachable after breaking all loot -> lose run-end', JSON.stringify(lose));
    check(lose.restocked > 0 && lose.restocked <= lose.cap, 'restock topped up within its cap before giving up', `${lose.restocked} <= ${lose.cap}`);
    await sleep(500); await shot('07-run-end-lose');
    await page.locator('.re-go').click();
    await page.waitForFunction("__G.run.phase === 'lobby'", null, { timeout: 10000 });

    // ---------------------------------------------------------------- run 3: down with nobody to revive
    await press(); await settle('loot');
    await ev('window.__paused = true');
    const down = await ev(`(() => { const G = __G; G.player.hurt(999); for (let k = 0; k < 20 && G.run.phase === 'loot'; k++) __sim(0.5, () => __IDLE); return { phase: G.run.phase, reason: G.run.reason, win: G.run.win }; })()`);
    check(down.phase === 'end' && down.reason === 'down' && down.win === false, 'down with no one to revive -> lose run-end', JSON.stringify(down));

    const errs = await ev('__errors.slice()');
    check(errs.length === 0 && logs.length === 0, '0 console or page errors', JSON.stringify(errs.concat(logs)).slice(0, 500));
  } catch (e) {
    check(false, 'harness', (e && e.stack || String(e)).slice(0, 1200));
    try { console.log('  page state:', JSON.stringify(await br.contexts()[0].pages()[0].evaluate('({ phase: __G.run.phase, house: __G.run.house, busy: __G.runner.busy, errors: __errors.slice(0, 5), log: __G.run.log.slice(-4) })')).slice(0, 1500)); } catch (e2) {}
    if (logs.length) console.log('  console errors:', JSON.stringify(logs.slice(0, 5)).slice(0, 1500));
  } finally {
    clearTimeout(kill);
    await br.close();
    srv.close?.();
    console.log(failures.length ? `${failures.length} FAILED: ${failures.join('; ')}` : 'ALL PASS');
    process.exit(failures.length ? 1 : 0);
  }
})();
