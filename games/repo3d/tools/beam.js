// Grab beam and push cart check (js/grab.js, js/beam.js, js/cart.js): the beam snaps on a wall between the eye and the
// grip and when stretched, two pullers add strength, the carrier cannot ride the item it holds, a charged throw flies
// faster, R + mouse turns the item without turning the view, the crosshair changes on a grabbable item, an item dragged
// on the floor throws sparks; the cart weighs (cart + load) / 3.4, takes loot up a stair without loss at a walk, shoves
// a foe, spins its wheels. Pictures: the beam at three strains, the cart with loot on a stair. fps >= 50 with 3 bots.
// Usage: node tools/beam.js [--out <dir>] [--no-fps]
'use strict';
const fs = require('fs');
const path = require('path');
const { serve } = require('./serve.js');
const { launch: pwLaunch, scratch } = require('./pw.js');
const argv = process.argv.slice(2);
const OUT = (() => { const i = argv.indexOf('--out'); return i >= 0 ? argv[i + 1] : scratch('beam'); })();
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (ok, name, detail) => { results.push({ ok, name, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + JSON.stringify(detail).slice(0, 320) : ''}`); };
const BOTS = 'bots=tam:loot,dung:thu,khoi:soi';

const HELP = `(() => { const G = __G, nav = G.foes?.nav, P = G.player; window.__paused = true; __sim(1);
  const T = window.__T = {};
  T.pair = (d, open = true) => { const sp = G.house.spawn; for (let i = 0; i < nav.W * nav.H; i++) { if (!nav.walk[i] || nav.near[i] < (open ? 3 : 2)) continue; const a = nav.center(i); if (Math.hypot(a.x - sp.x, a.z - sp.z) < 6) continue;
    for (let k = 0; k < 8; k++) { const an = k * Math.PI / 4, dir = { x: Math.cos(an), z: Math.sin(an) }, b = { x: a.x + dir.x * d, z: a.z + dir.z * d }, j = nav.nearest(b.x, b.z, 0);
      if (j < 0 || nav.near[j] < 2) continue;
      if (open ? nav.clear(a.x, a.z, b.x, b.z, 0.6) && nav.los(a.x, a.z, b.x, b.z) : !nav.los(a.x, a.z, b.x, b.z) && nav.floorAt(a.x, a.z) === nav.floorAt(b.x, b.z)) return { a, b, dir }; } } return null; };
  T.put = (x, z, lx, lz, ly) => { const h = G.house.heightAt(x, z); P.body.setTranslation({ x, y: h + 0.85, z }, true); P.body.setNextKinematicTranslation({ x, y: h + 0.85, z }); P.vy = 0;
    P.yaw = Math.atan2(-(lx - x), -(lz - z)); P.pitch = ly === undefined ? -0.1 : Math.atan2(ly - (h + 1.2), Math.hypot(lx - x, lz - z)); __sim(0.05); };
  T.fresh = () => { if (G.grab.held) G.grab.release(false); P.hp = 100; P.str = 30; P.stamina = 100; for (const f of [...(G.foes?.list || [])]) G.foes.remove(f); (G.bots?.list || []).forEach((b) => { b.hold = true; G.bots.teleport(b, G.house.spawn.x, G.house.spawn.z); }); };
  T.item = (x, z, size = 'medium', mat = 'wood', value) => G.loot.spawn({ material: mat, size, value, pos: { x, y: G.house.heightAt(x, z) + ({ small: 0.17, medium: 0.28, big: 0.46 })[size] * 1.3 + 0.05, z } });
  T.grabIt = (it) => { const t = it.body.translation(); P.pitch = Math.atan2(t.y - P.camPos.y, Math.hypot(t.x - P.camPos.x, t.z - P.camPos.z)); P.yaw = Math.atan2(-(t.x - P.position.x), -(t.z - P.position.z)); __sim(0.05); return G.grab.tryGrab() && G.grab.held === it; };
  return true; })()`;
const PRE = (c) => c.replace('(() => {', '(() => { const G = __G, T = __T, P = G.player, nav = G.foes?.nav, Gr = G.grab;');

const CASES = {
  'snap: a wall between the eye and the grip breaks the beam within 0.3 s': `(() => { T.fresh(); const pr = T.pair(1.6); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z); const it = T.item(pr.a.x + pr.dir.x * 1.4, pr.a.z + pr.dir.z * 1.4, 'small'); __sim(0.5);
    const ok0 = T.grabIt(it); let w = null; for (const d of [3, 2.5, 3.5, 4]) { w = T.pair(d, false); if (w) break; } { const hh = G.house.heightAt(w.a.x, w.a.z); P.body.setTranslation({ x: w.a.x, y: hh + 0.85, z: w.a.z }, true); P.body.setNextKinematicTranslation({ x: w.a.x, y: hh + 0.85, z: w.a.z }); P.yaw = Math.atan2(-(w.b.x - w.a.x), -(w.b.z - w.a.z)); } it.body.setTranslation({ x: w.b.x, y: G.house.heightAt(w.b.x, w.b.z) + 1.2, z: w.b.z }, true); it.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    const n0 = Gr.log.length; let t = 0; while (Gr.held && t < 0.6) { __sim(1 / 60, { ...__IDLE, grab: true }); t += 1 / 60; } const s = Gr.log.slice(n0).find((e) => e[0] === 'snap');
    return { ok: ok0 && !Gr.held && !!s && t <= 0.32, grabbed: ok0, snap: s, t: +t.toFixed(2) }; })()`,
  'snap: stretched past breakDist (the item pinned, the carrier walks off)': `(() => { T.fresh(); const pr = T.pair(4); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z); const it = T.item(pr.a.x + pr.dir.x * 1.4, pr.a.z + pr.dir.z * 1.4, 'small'); __sim(0.5);
    const ok0 = T.grabIt(it); it.body.setBodyType(G.phys.R.RigidBodyType.Fixed, true); const n0 = Gr.log.length; for (let i = 0; i < 240 && Gr.held; i++) __sim(1 / 60, () => ({ ...__IDLE, grab: true, mz: -1 }));
    it.body.setBodyType(G.phys.R.RigidBodyType.Dynamic, true); const s = Gr.log.slice(n0).find((e) => e[0] === 'snap'); return { ok: ok0 && !!s && s[1] === 'stretch', ok0, snap: s, lastBreak: Gr.lastBreak }; })()`,
  'help: a bot next to the item adds its strength (Atlas carry 46)': `(() => { T.fresh(); const pr = T.pair(4); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z); const it = T.item(pr.a.x + pr.dir.x * 1.5, pr.a.z + pr.dir.z * 1.5, 'big'); __sim(0.6);
    const lift = (help) => { const b = G.bots.list.find((q) => q.crew === 'tam'); G.bots.teleport(b, help ? pr.a.x + pr.dir.x * 2.6 : G.house.spawn.x, help ? pr.a.z + pr.dir.z * 2.6 : G.house.spawn.z);
      it.body.setTranslation({ x: pr.a.x + pr.dir.x * 1.5, y: G.house.heightAt(pr.a.x, pr.a.z) + 0.65, z: pr.a.z + pr.dir.z * 1.5 }, true); it.body.setLinvel({ x: 0, y: 0, z: 0 }, true); __sim(0.4);
      T.grabIt(it); P.pitch = 0.25; let s = 0; for (let i = 0; i < 30; i++) { __sim(1 / 60, { ...__IDLE, grab: true }); s += Gr.strain; } const r = { str: Gr.strength(), strain: +(s / 30).toFixed(2), helpers: Gr.helpers.length }; Gr.release(false); __sim(0.5); return r; };
    const solo = lift(false), duo = lift(true); return { ok: solo.helpers === 0 && duo.helpers === 1 && duo.str === 30 + 46 && duo.strain < solo.strain * 0.75, solo, duo }; })()`,
  'no riding: standing on a crate and pulling it up does not lift the carrier': `(() => { T.fresh(); const pr = T.pair(3); const it = T.item(pr.b.x, pr.b.z, 'big'); __sim(0.8); const t = it.body.translation();
    P.body.setTranslation({ x: t.x, y: t.y + 0.46 + 0.9, z: t.z }, true); P.body.setNextKinematicTranslation({ x: t.x, y: t.y + 0.46 + 0.9, z: t.z }); __sim(0.4); const y0 = P.body.translation().y;
    P.pitch = -1.4; __sim(0.05); const ok0 = G.grab.tryGrab() && Gr.held === it; let ymax = y0; for (let i = 0; i < 120; i++) { __sim(1 / 60, { ...__IDLE, grab: true, dpitch: -0.02 }); ymax = Math.max(ymax, P.body.translation().y); }
    if (Gr.held) Gr.release(false); return { ok: ok0 && ymax <= y0 + 0.05, grabbed: ok0, y0: +y0.toFixed(2), ymax: +ymax.toFixed(2), floor: +G.house.heightAt(t.x, t.z).toFixed(2) }; })()`,
  'charged throw: held 0.8 s flies x1.6 a tap throw': `(() => { T.fresh(); const pr = T.pair(4); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z); const speed = (charge) => { const it = T.item(pr.a.x + pr.dir.x * 1.3, pr.a.z + pr.dir.z * 1.3, 'small'); __sim(0.5); T.grabIt(it); P.pitch = 0; __sim(0.3, { ...__IDLE, grab: true });
      if (charge) { __sim(0.8, { ...__IDLE, grab: true, melee: true }); __sim(1 / 60, { ...__IDLE, grab: true }); } else __sim(1 / 60, { ...__IDLE, grab: true, throwIt: true }); const e = Gr.log.filter((q) => q[0] === 'throw').slice(-1)[0]; return e; };
    const base = (m) => Math.max(130 / 24, 560 / 24 * 30 / (30 + 2.2 * m)); const a = speed(false), b = speed(true);
    return { ok: !!a && !!b && Math.abs(a[1] - base(a[3])) < 0.02 && b[2] > 0.95 && Math.abs(b[1] - base(b[3]) * (1 + 0.6 * b[2])) < 0.05, tap: a, charged: b }; })()`,
  'turn: R + mouse spins the item, the view stays': `(() => { T.fresh(); const pr = T.pair(4); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z); const it = T.item(pr.a.x + pr.dir.x * 1.4, pr.a.z + pr.dir.z * 1.4, 'medium'); __sim(0.5); T.grabIt(it); __sim(0.3, { ...__IDLE, grab: true });
    const q0 = it.body.rotation(), yaw0 = P.yaw; __sim(0.5, { ...__IDLE, grab: true, rotate: true, rx: 0.03, ry: 0 }); const q1 = it.body.rotation();
    const dot = Math.abs(q0.x * q1.x + q0.y * q1.y + q0.z * q1.z + q0.w * q1.w), ang = 2 * Math.acos(Math.min(1, dot)) * 180 / Math.PI; Gr.release(false);
    return { ok: ang > 30 && Math.abs(P.yaw - yaw0) < 1e-6, turned: +ang.toFixed(1) }; })()`,
  'crosshair: a ring on a grabbable item, a dot on a wall': `(() => { T.fresh(); const pr = T.pair(3); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z); const it = T.item(pr.a.x + pr.dir.x * 1.3, pr.a.z + pr.dir.z * 1.3, 'medium'); __sim(0.5);
    const t = it.body.translation(); P.pitch = Math.atan2(t.y - P.camPos.y, Math.hypot(t.x - P.camPos.x, t.z - P.camPos.z)); __sim(0.02); Gr.updateBeam(0.016); const c1 = document.querySelector('.xhair').className;
    P.yaw += Math.PI; P.pitch = 0; __sim(0.02); Gr.updateBeam(0.016); const c2 = document.querySelector('.xhair').className; return { ok: c1 === 'xhair can' && c2 === 'xhair', onItem: c1, away: c2 }; })()`,
  'drag: an item heavier than the beam can lift (str 12: 8.3 m/s2 spare < g) pulled along the floor throws sparks': `(() => { T.fresh(); const pr = T.pair(4); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z); const it = T.item(pr.a.x + pr.dir.x * 1.5, pr.a.z + pr.dir.z * 1.5, 'big', 'metal'); __sim(0.6);
    T.grabIt(it); P.str = 12; const n0 = Gr.log.length; __sim(2, () => ({ ...__IDLE, grab: true, mz: -1, dpitch: (P.pitch + 0.6) * 0.2 })); const d = Gr.log.slice(n0).filter((e) => e[0] === 'drag').length; Gr.release(false); P.str = 30;
    return { ok: d >= 3, drags: d }; })()`,
  'cart: weight = (cart 14 + load) / 3.4': `(() => { T.fresh(); const c = G.cart, t = c.body.translation(); const a = T.item(t.x, t.z, 'medium'), b = T.item(t.x + 0.25, t.z, 'small'); a.body.setTranslation({ x: t.x - 0.2, y: t.y + 0.6, z: t.z }, true); b.body.setTranslation({ x: t.x + 0.25, y: t.y + 0.6, z: t.z }, true); __sim(1);
    const n = c.load().length; c.step(0); const mass = c.rec.mass, want = (14 + 24 + 8) / 3.4; a.body.setTranslation({ x: t.x, y: t.y + 5, z: t.z + 9 }, true); b.body.setTranslation({ x: t.x + 1, y: t.y + 5, z: t.z + 9 }, true); __sim(0.1); a.dead = b.dead = true;
    return { ok: n === 2 && Math.abs(mass - want) < 0.01, inTub: n, mass: +mass.toFixed(3), want: +want.toFixed(3) }; })()`,
  'cart: an item in the tub is safe from a wall knock, the same knock outside costs value': `(() => { T.fresh(); const c = G.cart, t = c.body.translation(); const it = T.item(t.x, t.z, 'medium', 'ceramic', 2000); it.body.setTranslation({ x: t.x, y: t.y + 0.6, z: t.z }, true); __sim(1); it.spawnedAt = -99; it.hitAt = -99; it.grabbedAt = -99;
    const v0 = it.value, inTub = it.inCart; it.body.setLinvel({ x: 0, y: -9, z: 0 }, true); __sim(0.2); const v1 = it.value;
    it.body.setTranslation({ x: t.x + 3, y: t.y + 1.5, z: t.z }, true); __sim(0.05); it.hitAt = -99; it.body.setLinvel({ x: 0, y: -9, z: 0 }, true); __sim(0.6); const v2 = it.dead ? 0 : it.value; it.dead = true;
    return { ok: inTub && v1 === v0 && v2 < v1, inTub, before: v0, inCart: v1, outside: v2 }; })()`,
  'cart: rolling into a foe shoves it, the wheels spin': `(() => { T.fresh(); const c = G.cart, t = c.body.translation(); const q = c.body.rotation(), fx = 1 - 2 * (q.y * q.y + q.z * q.z), fz = 2 * (q.x * q.z - q.w * q.y);
    const f = G.foes.spawn('mummy', t.x + fx * 1.6, t.z + fz * 1.6, { sleep: 99 }); const r0 = c.roll; const x0 = f.x, z0 = f.z;
    for (let i = 0; i < 40; i++) { c.body.setLinvel({ x: fx * 3, y: c.body.linvel().y, z: fz * 3 }, true); __sim(1 / 60); c.render(1 / 60); }
    const s = c.log.find((e) => e[0] === 'shove'), stun = f.stunT; __sim(0.4); const moved = Math.hypot(f.x - x0, f.z - z0); return { ok: !!s && moved > 0.3 && Math.abs(c.roll - r0) > 3 && stun > 0, stun: +(stun || 0).toFixed(2), shove: s, moved: +moved.toFixed(2), spin: +(c.roll - r0).toFixed(1) }; })()`,
};

// the cart takes two items up (or down) a stair at a walk: beam on the bar, the carrier walks behind it
const STAIR_CART = `(() => { const G = __G, T = __T, P = G.player, Gr = G.grab, nav = G.foes.nav; T.fresh();
  const st = G.house.layout.stairs[0]; G.house.unjam(st.door.x0 + st.door.zw / 2, st.door.y0 + st.door.zh / 2, 0.5); nav.refreshJams();
  const mid = st.axis === 0 ? (st.y0 + st.y1) / 2 : (st.x0 + st.x1) / 2, at = (u) => (st.axis === 0 ? { x: u, z: mid } : { x: mid, z: u });
  // walk up: from the low end to the high end of the ramp
  const upFromDoor = st.hS > st.hD, s0 = upFromDoor ? -2.6 : 6 + 2.6, s1 = upFromDoor ? 6 + 1.6 : -1.6, dirU = upFromDoor ? st.sgn : -st.sgn;
  const yaw = st.axis === 0 ? Math.atan2(-dirU, 0) : Math.atan2(0, -dirU);
  const c = G.cart, cp = at(st.e0 + st.sgn * s0), h0 = G.house.heightAt(cp.x, cp.z);
  c.body.setTranslation({ x: cp.x, y: h0 + 0.16, z: cp.z }, true); c.body.setLinvel({ x: 0, y: 0, z: 0 }, true); c.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  const ca = st.axis === 0 ? (dirU > 0 ? 0 : Math.PI) : (dirU > 0 ? -Math.PI / 2 : Math.PI / 2); c.body.setRotation({ x: 0, y: Math.sin(ca / 2), z: 0, w: Math.cos(ca / 2) }, true);
  __sim(0.5);
  const items = [T.item(cp.x, cp.z, 'medium', 'ceramic', 3000), T.item(cp.x, cp.z, 'small', 'ceramic', 900)];
  items[0].body.setTranslation({ x: cp.x + (st.axis === 0 ? 0.15 * dirU : 0), y: h0 + 0.75, z: cp.z + (st.axis === 1 ? 0.15 * dirU : 0) }, true);
  items[1].body.setTranslation({ x: cp.x - (st.axis === 0 ? 0.3 * dirU : 0), y: h0 + 0.75, z: cp.z - (st.axis === 1 ? 0.3 * dirU : 0) }, true);
  __sim(1.2); const inTub0 = c.load().length;
  const pp = at(st.e0 + st.sgn * s0 - dirU * 1.9 * (st.sgn === dirU ? 1 : -1)); const pp2 = at(st.e0 + st.sgn * (s0) - dirU * 1.9);
  const ph = G.house.heightAt(pp2.x, pp2.z); P.body.setTranslation({ x: pp2.x, y: ph + 0.85, z: pp2.z }, true); P.body.setNextKinematicTranslation({ x: pp2.x, y: ph + 0.85, z: pp2.z }); P.yaw = yaw; __sim(0.2);
  const bar = c.bar.translation(); P.pitch = Math.atan2(bar.y - P.camPos.y, Math.hypot(bar.x - P.camPos.x, bar.z - P.camPos.z)); __sim(0.02);
  const ok0 = Gr.tryGrab() && Gr.held === c.rec; Gr.dist = 1.5;
  const along = () => { const t = c.body.translation(); return ((st.axis === 0 ? t.x : t.z) - st.e0) * st.sgn; };
  let t = 0; while (t < 14 && (upFromDoor ? along() < s1 : along() > s1)) { __sim(0.25, () => ({ ...__IDLE, grab: true, mz: 1, dpitch: (P.pitch + 0.25) * 0.2 })); t += 0.25; }
  Gr.release(false); __sim(1);
  const ct = c.body.translation();
  return { ok0, inTub0, inTub1: c.load().length, values: items.map((i) => (i.dead ? 0 : i.value)), t, from: +h0.toFixed(2), to: +G.house.heightAt(ct.x, ct.z).toFixed(2), climb: +(st.hS - st.hD).toFixed(1), up: upFromDoor };
})()`;

async function open(br, srv, q) {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'x@test' })); } catch (e) { /* private */ } });
  const page = await ctx.newPage(); const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  await page.goto(srv.base + '/games/repo3d/index.html?' + q);
  await page.waitForFunction('window.__ready === true || window.__fatal', null, { timeout: 60000 });
  const fatal = await page.evaluate('window.__fatal || null'); if (fatal) throw new Error('fatal: ' + fatal);
  await page.evaluate(HELP);
  return { ctx, page, logs };
}

(async () => {
  const srv = await serve(); const br = await pwLaunch();
  const kill = setTimeout(() => { console.log('FAIL timeout 400 s'); process.exit(2); }, 400000);
  try {
    let { ctx, page, logs } = await open(br, srv, `house=1&seed=7&foes=none&passives=0&${BOTS}`);
    for (const [name, code] of Object.entries(CASES)) {
      let r; try { r = await page.evaluate(PRE(code)); } catch (e) { r = { ok: false, err: e.message.slice(0, 300) }; }
      check(!!r.ok, name, r);
    }
    const r = await page.evaluate(STAIR_CART);
    check(r.ok0 && r.inTub0 === 2 && r.inTub1 === 2 && r.values[0] === 3000 && r.values[1] === 900 && Math.abs(r.to - r.from) > 2.5, 'cart: two ceramic items ride a stair at a walk, both stay in the tub at full value', r);
    const err = await page.evaluate('__errors.slice()');
    check(!err.length && !logs.length, 'cases: no console or page errors', err.concat(logs));
    await ctx.close();

    // pictures: the beam at three strains (str lowered to show orange and red), then the cart with loot on a stair
    ({ ctx, page, logs } = await open(br, srv, 'house=1&seed=7&foes=none&bots=0&theme=spacestation'));
    await page.evaluate(`document.querySelectorAll('.ui-root, .hx, .scanx').forEach((e) => e.style.visibility = 'hidden')`);
    for (const [tag, size, str] of [['light', 'small', 30], ['heavy', 'big', 22], ['over', 'big', 9]]) {
      const s = await page.evaluate(PRE(`(() => { T.fresh(); const pr = T.pair(4); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z); for (const it of G.loot.items) if (Math.hypot(it.body.translation().x - pr.a.x, it.body.translation().z - pr.a.z) < 4) it.seen = true;
        const it = T.item(pr.a.x + pr.dir.x * 1.8, pr.a.z + pr.dir.z * 1.8, '${size}', 'metal'); __sim(0.6); T.grabIt(it); P.str = ${str}; Gr.dist = 2;
        __sim(0.8, () => ({ ...__IDLE, grab: true, mx: 0.4, dpitch: (P.pitch - 0.05) * 0.2 })); Gr.updateBeam(0.016); return { strain: +Gr.strain.toFixed(2) }; })()`));
      await page.waitForTimeout(150); await page.screenshot({ path: path.join(OUT, `beam-${tag}.png`) });
      await page.evaluate('__T.fresh()');
      console.log(`  beam-${tag}.png strain ${s.strain}`);
      check(tag === 'light' ? s.strain < 0.35 : tag === 'heavy' ? s.strain >= 0.5 && s.strain < 0.95 : s.strain >= 0.95, `picture: the ${tag} beam strain ${s.strain} matches its colour band`, s);
    }
    await ctx.close();
    ({ ctx, page, logs } = await open(br, srv, 'house=1&seed=7&foes=none&bots=0&theme=vietnam'));
    await page.evaluate(`document.querySelectorAll('.ui-root, .hx, .scanx').forEach((e) => e.style.visibility = 'hidden')`);
    await page.evaluate(STAIR_CART.replace("Gr.release(false); __sim(1);", "window.__cartShot = true;").replace("while (t < 14 &&", "while (t < 3.5 &&"));
    // step back down the ramp 3 m behind the cart, beam still on (no sim between: the carrier is placed, then one frame)
    await page.evaluate(`(() => { const G = __G, P = G.player, c = G.cart.body.translation(), st = G.house.layout.stairs[0], up = st.hS > st.hD ? st.sgn : -st.sgn;
      const x = st.axis === 0 ? c.x - up * 2.6 : c.x, z = st.axis === 1 ? c.z - up * 2.6 : c.z, h = G.house.heightAt(x, z) + 0.85;
      P.body.setTranslation({ x, y: h, z }, true); P.body.setNextKinematicTranslation({ x, y: h, z }); P.yaw = Math.atan2(-(c.x - x), -(c.z - z)); P.pitch = Math.atan2(c.y + 0.3 - (h + 0.35), 2.6);
      G.grab.dist = 2.4; __sim(2 / 60, { ...__IDLE, grab: true }); return true; })()`);
    await page.waitForTimeout(200); await page.screenshot({ path: path.join(OUT, 'cart-stair.png') });
    await ctx.close();

    if (!argv.includes('--no-fps')) {
      ({ ctx, page, logs } = await open(br, srv, `house=1&seed=7&${BOTS}`));
      await page.evaluate(PRE(`(() => { const pr = T.pair(4); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z); const it = T.item(pr.a.x + pr.dir.x * 1.5, pr.a.z + pr.dir.z * 1.5, 'big'); __sim(0.6); T.grabIt(it);
        window.__paused = false; G.cmdOverride = { ...__IDLE, grab: true, mx: 0.3 }; return true; })()`));
      await page.waitForTimeout(2500);
      const f0 = await page.evaluate('__G.frames'); await page.waitForTimeout(4000); const f1 = await page.evaluate('__G.frames');
      const fps = (f1 - f0) / 4, held = await page.evaluate('!!__G.grab.held');
      check(fps >= 50 && held, 'fps >= 50 with 3 bots while carrying on the beam', { fps, held });
      await ctx.close();
    }
  } catch (e) { check(false, 'harness', e.stack || e.message); }
  finally {
    clearTimeout(kill); await br.close(); srv.close();
    const bad = results.filter((r) => !r.ok);
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
    console.log(`out: ${OUT}`);
    console.log(bad.length ? `${bad.length} FAILED` : `ALL PASS (${results.length})`);
    process.exit(bad.length ? 1 : 0);
  }
})();
