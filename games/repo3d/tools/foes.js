// Foe check: boots houses headless and runs deterministic foe scenarios through __sim, saves screenshots of foes
// chasing in the torch, then runs 60 s of house 2 with every foe awake and measures fps. Exit 1 on any failure.
// Usage: node games/repo3d/tools/foes.js [--out <dir>] [--seed 7] [--soak 60]
'use strict';
const fs = require('fs');
const path = require('path');
const { serve } = require('./serve.js');
const { launch: pwLaunch } = require('./pw.js');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const OUT = arg('out', require('./pw.js').scratch('foes'));
const SEED = Number(arg('seed', 7));
const SOAK = Number(arg('soak', 60));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (ok, name, detail) => { results.push({ ok, name, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`); };

// in-page helpers: open spot pairs, player placement, aiming
const HELPERS = `(() => {
  const G = __G, nav = G.foes.nav, P = G.player;
  const T = window.__T = {};
  T.lootNear = (x, z, r) => G.loot.items.filter((i) => !i.dead && Math.hypot(i.body.translation().x - x, i.body.translation().z - z) < r);
  // A (player) and B (foe) d metres apart on open floor with a clear straight line; optional loot-free radius, min distance from spawn
  T.pair = (d, o = {}) => {
    const sp = G.house.spawn;
    for (const i of nav.cells) {
      if (nav.near[i] < 3) continue;
      const a = nav.center(i);
      if (o.farFromSpawn && Math.hypot(a.x - sp.x, a.z - sp.z) < o.farFromSpawn) continue;
      if (o.nearSpawn && Math.hypot(a.x - sp.x, a.z - sp.z) > o.nearSpawn) continue;
      for (let k = 0; k < 8; k++) {
        const an = k * Math.PI / 4, b = { x: a.x + Math.cos(an) * d, z: a.z + Math.sin(an) * d };
        const j = nav.nearest(b.x, b.z, 0); if (j < 0 || nav.near[j] < 2) continue;
        if (!nav.clear(a.x, a.z, b.x, b.z, 0.7) || !nav.los(a.x, a.z, b.x, b.z)) continue;
        if (o.noLoot && (T.lootNear(a.x, a.z, o.noLoot).length || T.lootNear(b.x, b.z, o.noLoot).length)) continue;
        return { a, b };
      }
    }
    return null;
  };
  T.put = (x, z, lookX, lookZ, pitch = -0.05) => {
    P.body.setTranslation({ x, y: (__G.house?.heightAt ? __G.house.heightAt(x, z) : 0) + 0.85, z }, true);
    P.yaw = Math.atan2(-(lookX - x), -(lookZ - z)); P.pitch = pitch;
    __sim(0.05);
  };
  T.face = (f, x, z) => { f.yaw = Math.atan2(x - f.x, z - f.z); };
  T.clearFoes = () => { for (const f of [...G.foes.list]) G.foes.remove(f); };
  T.aimAt = (pt) => { const c = P.camPos; P.yaw = Math.atan2(-(pt.x - c.x), -(pt.z - c.z)); P.pitch = Math.atan2(pt.y - c.y, Math.hypot(pt.x - c.x, pt.z - c.z)); };
  T.until = (sec, pred, cmd) => { const h = 1 / 60; for (let i = 0; i < sec * 60; i++) { __sim(h, cmd || __IDLE); if (pred()) return (i + 1) * h; } return -1; };
  return true;
})()`;

async function openPage(br, srv, query) {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'x@test' })); } catch (e) { /* private */ } });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  await page.goto(srv.base + '/games/repo3d/index.html?' + query);
  await page.waitForFunction('window.__ready === true || window.__fatal', null, { timeout: 60000 });
  const fatal = await page.evaluate('window.__fatal || null');
  if (fatal) throw new Error('fatal: ' + fatal);
  await page.evaluate('window.__paused = true; __sim(3.5)');
  await page.evaluate(HELPERS);
  return { ctx, page, logs };
}

(async () => {
  const srv = await serve();
  const br = await pwLaunch();
  const kill = setTimeout(() => { console.log('FAIL timeout 180 s'); process.exit(2); }, 180000);
  try {
    // ---------------------------------------------------------------- house 1, no roster: scripted scenarios
    let { ctx, page, logs } = await openPage(br, srv, `house=1&seed=${SEED}&foes=none`);

    const a = await page.evaluate(`(() => {
      const G = __G, T = __T, FS = G.foes, nav = FS.nav;
      const pr = T.pair(1.8, { farFromSpawn: 14, noLoot: 2.5 });
      if (!pr) return { err: 'no spot' };
      const f = FS.spawn('gnome', pr.b.x, pr.b.z, { sleep: 60 });
      const it = G.loot.items.find((i) => i.material === 'ceramic');
      it.body.setTranslation({ x: pr.a.x, y: 2.6, z: pr.a.z }, true); it.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      const woke = T.until(2, () => f.state !== 'sleep');
      const st = f.state;
      const d0 = Math.hypot(f.x - pr.a.x, f.z - pr.a.z);
      const tgt = f.target && { ...f.target };
      __sim(1.5);
      const d1 = Math.hypot(f.x - pr.a.x, f.z - pr.a.z);
      const r = { woke, st, d0: +d0.toFixed(2), d1: +d1.toFixed(2), tgt, hits: G.log.filter((l) => l[0] === 'hit').length, log: FS.log.slice(-3) };
      T.clearFoes();
      return r;
    })()`);
    check(a.woke > 0 && a.st === 'investigate' && a.d1 < a.d0 - 0.4, '(a) sleeping gnome wakes from a loot impact and walks toward it', JSON.stringify(a));

    const b = await page.evaluate(`(() => {
      const G = __G, T = __T, FS = G.foes, P = G.player;
      const pr = T.pair(5, { noLoot: 0 });
      const out = {};
      for (const crouch of [false, true]) {
        T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z);
        P.hp = 100;
        const cmd = { ...__IDLE, crouch };
        __sim(0.8, cmd);
        const f = FS.spawn('mummy', pr.b.x, pr.b.z, { state: 'patrol' });
        f.waitT = 99; T.face(f, pr.a.x, pr.a.z);
        const t = T.until(5, () => f.aware >= 1, cmd);
        out[crouch ? 'crouch' : 'stand'] = +t.toFixed(2);
        T.clearFoes();
      }
      // dark side: out of the cone it never builds
      T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z);
      const g = FS.spawn('mummy', pr.b.x, pr.b.z, { state: 'patrol' }); g.waitT = 99; T.face(g, pr.b.x + (pr.b.x - pr.a.x), pr.b.z + (pr.b.z - pr.a.z));
      out.behind = T.until(2.5, () => g.aware >= 1);
      T.clearFoes();
      out.where = G.house.layout.rooms.find((r) => pr.a.x >= r.x && pr.a.x < r.x + r.w && pr.a.z >= r.y && pr.a.z < r.y + r.h)?.kind;
      return out;
    })()`);
    check(b.stand >= 0.75 && b.stand <= 1.4, '(b1) standing player in view is spotted in about 1 s', JSON.stringify(b));
    check(b.crouch >= 2.2 && b.crouch <= 3.0, '(b2) crouched player is spotted only after about 2.5 s', JSON.stringify(b));
    check(b.behind < 0, '(b3) a foe looking away does not spot a still player', JSON.stringify(b));

    const c = await page.evaluate(`(() => {
      const G = __G, T = __T, FS = G.foes, P = G.player;
      const pr = T.pair(6, { noLoot: 9 });
      if (!pr) return { err: 'no spot' };
      T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z, -0.35);
      const it = G.loot.items.find((i) => i.material === 'wood' && i.size === 'medium') || G.loot.items.find((i) => i.material === 'wood');
      const fw = P.forward(new (P.camPos.constructor)());
      it.body.setTranslation({ x: P.camPos.x + fw.x * 1.6, y: 0.35, z: P.camPos.z + fw.z * 1.6 }, true); it.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      __sim(0.6);
      T.aimAt(it.body.translation()); __sim(0.02);
      const grabbed = G.grab.tryGrab();
      const hold = { ...__IDLE, grab: true };
      __sim(0.5, hold);
      const f = FS.spawn('brat', pr.b.x, pr.b.z, { state: 'patrol' }); T.face(f, pr.a.x, pr.a.z);
      const t = T.until(10, () => it.carrier === f, hold);
      const stolen = it.carrier === f, beamLost = G.grab.held !== it;
      __sim(1.5, hold);
      const fled = Math.hypot(f.x - P.position.x, f.z - P.position.z);
      const r = { grabbed, t: +t.toFixed(2), stolen, beamLost, fled: +fled.toFixed(2), state: f.state, log: FS.log.filter((l) => l[0] === 'steal') };
      return r;
    })()`);
    check(c.grabbed && c.stolen && c.beamLost && c.fled > 2, '(c) brat steals the crate out of the beam and runs off', JSON.stringify(c));
    // let it finish: breath, throw at the player
    const c2 = await page.evaluate(`(() => { const G = __G, T = __T, FS = G.foes; const t = T.until(14, () => FS.log.some((l) => l[0] === 'throw')); const r = { t: +t.toFixed(2), log: FS.log.filter((l) => l[0] === 'throw' || l[0] === 'thrownHit'), hp: G.player.hp }; T.clearFoes(); G.player.hp = 100; return r; })()`);
    check(c2.t > 0, '(c+) brat catches breath then throws the item at the player', JSON.stringify(c2));

    const d = await page.evaluate(`(() => {
      const G = __G, T = __T, FS = G.foes, P = G.player;
      const pr = T.pair(4.5, { noLoot: 6 });
      T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z);
      P.hp = 100;
      const it = G.loot.items.find((i) => i.material === 'ceramic' && !i.dead);
      const v0 = it.value;
      const mx = (pr.a.x * 0.7 + pr.b.x * 0.3), mz = (pr.a.z * 0.7 + pr.b.z * 0.3);
      it.body.setTranslation({ x: mx + 0.6, y: 0.4, z: mz + 0.6 }, true); it.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      __sim(1.2);
      const f = FS.spawn('banger', pr.b.x, pr.b.z, { state: 'patrol' }); f.waitT = 99; T.face(f, pr.a.x, pr.a.z);
      const t = T.until(9, () => f.dead);
      const r = { t: +t.toFixed(2), dead: f.dead, item: { v0, v: it.dead ? 0 : it.value, broke: !!it.dead }, hp: +P.hp.toFixed(1), blast: FS.log.filter((l) => l[0] === 'blast' || l[0] === 'fuse') };
      T.clearFoes(); P.hp = 100;
      return r;
    })()`);
    check(d.dead && d.item.v < d.item.v0 && d.hp < 100, '(d) banger lights its fuse, explodes, damages the player and nearby loot', JSON.stringify(d));

    const e = await page.evaluate(`(() => {
      const G = __G, T = __T, FS = G.foes, P = G.player;
      const pr = T.pair(3.4, { noLoot: 5 });
      T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z, -0.3);
      const it = G.loot.items.find((i) => !i.dead && i.size === 'medium' && (i.material === 'wood' || i.material === 'metal'));
      const fw = P.forward(new (P.camPos.constructor)());
      it.body.setTranslation({ x: P.camPos.x + fw.x * 1.3, y: 0.4, z: P.camPos.z + fw.z * 1.3 }, true); it.body.setLinvel({ x: 0, y: 0, z: 0 }, true); it.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      __sim(0.6);
      T.aimAt(it.body.translation()); __sim(0.02);
      const grabbed = G.grab.tryGrab();
      const g = FS.spawn('gnome', pr.b.x, pr.b.z, { sleep: 99 }); T.face(g, pr.a.x, pr.a.z);
      const hp0 = g.hp;
      // lift and aim at the gnome's middle
      __sim(0.6, (i) => { T.aimAt({ x: g.x, y: 0.9, z: g.z }); return { ...__IDLE, grab: true }; });
      T.aimAt({ x: g.x, y: 0.55, z: g.z });
      __sim(1 / 60, { ...__IDLE, grab: true, throwIt: true });
      const x0 = g.x, z0 = g.z;
      const t = T.until(1.5, () => g.hp < hp0 || g.dead);
      const hit = FS.log.filter((l) => l[0] === 'foeHit');
      const r = { grabbed, material: it.material, t: +t.toFixed(2), hp0, hp: Math.max(0, +g.hp.toFixed(1)), dead: g.dead, moved: +Math.hypot(g.x - x0, g.z - z0).toFixed(2), hit };
      // orb from a kind that drops one: mummy at house 1 -> round((240*9 + 18*60)/50)*50 = 3250 -> big -> clamped to 4200
      const m = FS.spawn('mummy', pr.b.x, pr.b.z, { sleep: 99 });
      const n0 = G.loot.items.length;
      FS.hurtFoe(m, 9999, { x: 1, z: 0 }, 1);
      const orb = G.loot.items.length > n0 ? G.loot.items[G.loot.items.length - 1] : null;
      r.orb = orb && { material: orb.material, size: orb.size, value: orb.value };
      T.clearFoes();
      return r;
    })()`);
    check(e.grabbed && e.hp < e.hp0, '(e) a thrown medium crate hurts (and knocks back) a gnome', JSON.stringify(e));
    check(e.orb && e.orb.material === 'soul' && e.orb.value === 4200 && e.orb.size === 'big', '(e+) a taken-down mummy drops a soul orb valued by the source formula', JSON.stringify(e.orb));

    const f = await page.evaluate(`(() => {
      const G = __G, T = __T, FS = G.foes, P = G.player;
      const pr = T.pair(1.4, { noLoot: 0 });
      T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z);
      P.hp = 10;
      const m = FS.spawn('mummy', pr.b.x, pr.b.z, { state: 'patrol' }); T.face(m, pr.a.x, pr.a.z);
      const t = T.until(6, () => P.down);
      __sim(1.5);
      const h = P.head && P.head.body.translation();
      const r = { t: +t.toFixed(2), down: P.down, hp: P.hp, head: !!P.head, headGrabbable: !!(P.head && P.head.grabbable), headMass: P.head && P.head.mass, camY: +G.camera.position.y.toFixed(2), headY: h && +h.y.toFixed(2), camOnHead: h && Math.hypot(G.camera.position.x - h.x, G.camera.position.z - h.z) < 0.05, runLost: !!G.runLost, foeState: m.state };
      return r;
    })()`);
    check(f.down && f.head && f.headGrabbable && f.headMass === 9 && f.camOnHead && f.camY < 0.6 && f.runLost, '(f) player at 0 hp goes down, the camera drops into a grabbable head, run lost (solo)', JSON.stringify(f));
    await page.screenshot({ path: path.join(OUT, 'down-head.png') });
    const err1 = await page.evaluate('__errors.slice()');
    check(err1.length === 0 && logs.length === 0, 'house 1 scenarios: no console or page errors', JSON.stringify(err1.concat(logs)).slice(0, 400));
    await ctx.close();

    // ---------------------------------------------------------------- house 2, screenshots of each kind chasing in the torch
    ({ ctx, page, logs } = await openPage(br, srv, `house=2&seed=${SEED}&foes=none`));
    const kinds = ['banger', 'brat', 'gnome', 'minelayer', 'ghost', 'mummy', 'rook'];
    for (const k of kinds) {
      await page.evaluate(`(() => {
        const G = __G, T = __T, FS = G.foes, P = G.player;
        T.clearFoes();
        const pr = T.pair(3.3, { noLoot: 3, farFromSpawn: 14 }) || T.pair(3.3, {});
        T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z, -0.04);
        P.hp = 100;
        const f = FS.spawn('${k}', pr.b.x, pr.b.z, { state: 'chase' }); T.face(f, pr.a.x, pr.a.z);
        f.aware = 1; f.lastSeen = { x: pr.a.x, z: pr.a.z }; f.seen = true;
        for (let i = 0; i < 20; i++) __sim(1 / 60);
        f.x = pr.b.x; f.z = pr.b.z; T.face(f, pr.a.x, pr.a.z); f.moveSpeed = f.speed * 1.25;
        __sim(1 / 60);
        return true;
      })()`);
      await page.screenshot({ path: path.join(OUT, `chase-${k}.png`) });
    }
    // the same meeting with the house lights out: only the player's torch, foe 3 m away (how the owner judges menace)
    for (const k of ['gunner', 'rook', 'banger', 'gnome', 'mimic', 'ghost', 'mummy', 'brat', 'headthrower', 'minelayer', 'gacha', 'hunter', 'angel', 'mirror']) {
      await page.evaluate(`(() => {
        const G = __G, T = __T, FS = G.foes, P = G.player;
        T.clearFoes(); G.house.setDim(0.02);
        const pr = T.pair(3.0, { noLoot: 3, farFromSpawn: 14 }) || T.pair(3.0, {});
        T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z, -0.02);
        P.hp = 100;
        const f = FS.spawn('${k}', pr.b.x, pr.b.z, { state: 'chase' }); T.face(f, pr.a.x, pr.a.z);
        f.aware = 1; f.lastSeen = { x: pr.a.x, z: pr.a.z }; f.seen = true;
        for (let i = 0; i < 20; i++) __sim(1 / 60);
        f.x = pr.b.x; f.z = pr.b.z; T.face(f, pr.a.x, pr.a.z);
        __sim(1 / 60);
        return true;
      })()`);
      await page.screenshot({ path: path.join(OUT, `dark-${k}.png`) });
    }
    await page.evaluate('__T.clearFoes(); __G.house.setDim(1)');
    const err2 = await page.evaluate('__errors.slice()');
    check(err2.length === 0 && logs.length === 0, 'house 2 screenshots: no console or page errors', JSON.stringify(err2.concat(logs)).slice(0, 400));
    await ctx.close();

    // ---------------------------------------------------------------- house 2 roster, all awake, real-time soak
    // (i) floors: a hunting foe follows the player up or down a stair; a noise on another floor carries half as far
    ({ ctx, page, logs } = await openPage(br, srv, `house=3&seed=${SEED}&foes=none`));
    const fl = await page.evaluate(`(() => { const G = __G, P = G.player, L = G.house.layout, nav = G.foes.nav; window.__paused = true;
      const out = [];
      for (const st of L.stairs.slice(0, 2)) {
        G.house.unjam(st.door.x0 + st.door.zw / 2, st.door.y0 + st.door.zh / 2, 0.5); nav.refreshJams();
        const mid = st.axis === 0 ? (st.y0 + st.y1) / 2 : (st.x0 + st.x1) / 2, at = (u) => (st.axis === 0 ? { x: u, z: mid } : { x: mid, z: u });
        for (const f of [...G.foes.list]) G.foes.remove(f);
        const pp = at(st.e0 + st.sgn * 7.5), hp = G.house.heightAt(pp.x, pp.z);
        P.body.setTranslation({ x: pp.x, y: hp + 0.9, z: pp.z }, true); P.body.setNextKinematicTranslation({ x: pp.x, y: hp + 0.9, z: pp.z }); P.hp = 100; __sim(0.2);
        const fp = at(st.e0 - st.sgn * 2.5);
        // a melee chaser (the gunner now holds 6-9 m and shoots)
        const f = G.foes.spawn('mimic', fp.x, fp.z, { state: 'chase' }); f.aware = 1; f.lastSeen = { x: pp.x, z: pp.z }; f.target = P;
        const g0 = f.gy; let mid2 = false, t = 0;
        for (; t < 16; t += 0.25) { __sim(0.25); P.hp = 100; if (Math.abs(f.gy - st.hD) > 0.4 && Math.abs(f.gy - st.hS) > 0.4) mid2 = true; if (Math.hypot(f.x - P.position.x, f.z - P.position.z) < 1.6 && Math.abs(f.gy - hp) < 0.3) break; }
        out.push({ room: st.room, from: +g0.toFixed(2), to: +f.gy.toFixed(2), player: +hp.toFixed(2), onRamp: mid2, t, d: +Math.hypot(f.x - P.position.x, f.z - P.position.z).toFixed(2) });
      }
      // noise of reach 5 m: a listener 4 m away (plan distance) on the same floor hears it, on another floor does not
      const pair = (same) => { for (const i of nav.cells) { const a = nav.center(i), fa = nav.floorAt(a.x, a.z); for (const j of nav.cells) { const c = nav.center(j), d = Math.hypot(c.x - a.x, c.z - a.z); if (d < 3.8 || d > 4.2) continue; if ((nav.floorAt(c.x, c.z) === fa) === same) return { a, c, d }; } } return null; };
      const ps = pair(true), po = pair(false);
      const e1 = G.noise.emit({ x: ps.a.x, z: ps.a.z, r: 5, str: 1, src: 'test' }), hs = !!G.noise.heard(ps.c.x, ps.c.z, 5, e1.id - 1);
      const e2 = G.noise.emit({ x: po.a.x, z: po.a.z, r: 5, str: 1, src: 'test' }), ho = !!G.noise.heard(po.c.x, po.c.z, 5, e2.id - 1);
      const srcFloor = e2.floor;
      return { out, noise: { sameFloorAt4m: hs, otherFloorAt4m: ho, srcFloor, listenerFloor: nav.floorAt(po.c.x, po.c.z), d: +po.d.toFixed(2) } }; })()`);
    for (const r of fl.out) check(r.onRamp && Math.abs(r.to - r.player) < 0.3 && r.d < 1.6, `(i) a hunting chaser follows the player ${r.player > r.from ? 'up' : 'down'} the stair in room ${r.room}`, JSON.stringify(r));
    check(fl.noise.sameFloorAt4m === true && fl.noise.otherFloorAt4m === false && fl.noise.srcFloor !== fl.noise.listenerFloor, '(i) a noise of reach 5 m is not heard 4 m away on another floor (half: 2.5 m)', JSON.stringify(fl.noise));
    const errI = await page.evaluate('__errors.slice()');
    check(errI.length === 0 && logs.length === 0, '(i) floors: no console or page errors', JSON.stringify(errI.concat(logs)).slice(0, 300));
    await ctx.close();

    ({ ctx, page, logs } = await openPage(br, srv, `house=2&seed=${SEED}&foeSleep=0`));
    const roster = await page.evaluate('__G.foes.summary().map((f) => f.kind)');
    await page.evaluate(`window.__roomsSeen = {}; window.__roomTimer = setInterval(() => {
      for (const f of __G.foes.list) {
        if (f.dead || f.def.beh === 'ghost') continue;
        const r = __G.house.rooms.find((q) => f.x >= q.x && f.x < q.x + q.w && f.z >= q.y && f.z < q.y + q.h);
        if (r) (window.__roomsSeen[f.id ?? f.kind] ||= new Set()).add(r.id);
      }
    }, 250)`);
    await page.evaluate('window.__paused = false');
    const f0 = await page.evaluate('[__G.frames, performance.now()]');
    await page.waitForTimeout(SOAK * 1000);
    const f1 = await page.evaluate('[__G.frames, performance.now()]');
    const fps = (f1[0] - f0[0]) / ((f1[1] - f0[1]) / 1000);
    const soak = await page.evaluate('({ foes: __G.foes.summary().map((f) => f.kind + ":" + f.state), log: __G.foes.log.slice(-6), hp: __G.player.hp, down: __G.player.down })');
    await page.screenshot({ path: path.join(OUT, 'soak-end.png') });
    const err3 = await page.evaluate('__errors.slice()');
    check(fps >= 50, `(g) ${SOAK} s of house 2 with all foes awake keeps >= 50 fps`, `${fps.toFixed(1)} fps, roster ${roster.join(',')}, ${JSON.stringify(soak)}`);
    const rooms = await page.evaluate('(clearInterval(__roomTimer), Object.fromEntries(Object.entries(__roomsSeen).map(([k, v]) => [k, v.size])))');
    check(Object.values(rooms).some((n) => n >= 2), '(h) walking foes pass doors into other rooms during the soak', JSON.stringify(rooms));
    check(err3.length === 0 && logs.length === 0, '(g) soak: no console or page errors', JSON.stringify(err3.concat(logs)).slice(0, 400));
    await ctx.close();
  } catch (e) {
    check(false, 'harness', e.message);
  } finally {
    clearTimeout(kill);
    await br.close();
    srv.close?.();
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
    const bad = results.filter((r) => !r.ok).length;
    console.log(bad ? `${bad} FAILED` : 'ALL PASS');
    process.exit(bad ? 1 : 0);
  }
})();
