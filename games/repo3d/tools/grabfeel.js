// Beam feel numbers (batch 6f item 5, owner: "cầm đồ rất khó thao tác"). On an open spot of house 3:
//  reach: time for a light / medium / heavy item, grabbed 2 m ahead on the floor, to come within 15 cm of its hold point;
//  turn: mean and peak distance from the hold point while the camera turns at 3 rad/s for 0.5 s (medium item);
//  spin: the fastest the held item turns on its own while walking (rad/s);
//  aim: share of grabs that catch a small item when the aim is 5 degrees off it (8 directions);
//  push: how far the player is shoved while looking down at a held medium item at its feet for 1 s.
// Usage: node tools/grabfeel.js
'use strict';
const { serve } = require('./serve.js');
const { launch: pwLaunch } = require('./pw.js');

const MEASURE = `(() => { const G = __G, P = G.player, nav = G.foes.nav, B = G.grab; window.__paused = true; __sim(0.5);
  let o = null; for (const i of nav.cells) { if (nav.near[i] < 3) continue; const c = nav.center(i); let ok = true; for (let a = 0; a < 8 && ok; a++) for (const r of [1, 1.8]) if (!nav.okW(c.x + Math.cos(a * 0.785) * r, c.z + Math.sin(a * 0.785) * r)) ok = false; for (let u = 0.5; u <= 3.2 && ok; u += 0.25) for (const s of [-0.6, 0, 0.6]) if (!nav.okW(c.x + s, c.z - u)) ok = false; if (ok && G.house.heightAt(c.x, c.z) === G.house.heightAt(c.x, c.z - 3)) { o = c; break; } }   // open all round to 1.8 m, and 3.2 m clear ahead (-z)
  const h = G.house.heightAt(o.x, o.z);
  const put = () => { P.body.setTranslation({ x: o.x, y: h + 0.85, z: o.z }, true); P.body.setNextKinematicTranslation({ x: o.x, y: h + 0.85, z: o.z }); P.vy = 0; P.yaw = 0; P.pitch = 0; __sim(0.2); };
  const look = (x, y, z) => { const c = P.camPos; P.yaw = Math.atan2(-(x - c.x), -(z - c.z)); P.pitch = Math.atan2(y - c.y, Math.hypot(x - c.x, z - c.z)); };
  const items = []; const spawn = (size) => { const it = G.loot.spawn({ material: 'wood', size, value: 1000, pos: { x: o.x, y: h + 0.6, z: o.z - 2 } }); items.push(it); return it; };
  const clear = () => { if (B.held) B.release(false); for (const it of items) if (!it.dead) G.loot.destroy(it, false); items.length = 0; };
  const out = { reach: {} };
  for (const size of ['small', 'medium', 'big']) {
    clear(); put(); const it = spawn(size); __sim(0.8); const t0 = it.body.translation(); look(t0.x, t0.y, t0.z); __sim(0.02); look(t0.x, t0.y, t0.z);
    const grabbed = B.tryGrab() && B.held === it; P.pitch = 0; let t = 0, done = false;
    // hold point: 2 m ahead at eye height after the grab (look level)
    for (let i = 0; i < 240 && grabbed; i++) { __sim(1 / 60, { ...__IDLE, grab: true }); t += 1 / 60; if (!B.held) break; const a = B.anchorWorld(new (P.camPos.constructor)()), tg = P.camPos.clone().addScaledVector(P.forward(new (P.camPos.constructor)()), B.dist); if (a.distanceTo(tg) < 0.15) { done = true; break; } }
    out.reach[size] = grabbed ? (done ? +t.toFixed(2) : '>4 s') : 'no grab';
  }
  // turning fast with a medium item
  clear(); put(); let it = spawn('medium'); __sim(0.8); let tt = it.body.translation(); look(tt.x, tt.y, tt.z); __sim(0.02); look(tt.x, tt.y, tt.z); out.grabMedium = B.tryGrab() && B.held === it; P.pitch = 0; __sim(1.5, { ...__IDLE, grab: true }); out.heldBeforeTurn = B.held === it;
  let sum = 0, peak = 0, n = 0; for (let i = 0; i < 30; i++) { __sim(1 / 60, { ...__IDLE, grab: true, dyaw: 3 / 60 }); if (!B.held) break; const a = B.anchorWorld(new (P.camPos.constructor)()), tg = P.camPos.clone().addScaledVector(P.forward(new (P.camPos.constructor)()), B.dist), e = a.distanceTo(tg); sum += e; n++; peak = Math.max(peak, e); }
  out.snap = B.lastBreak; out.turnMean = +(sum / Math.max(1, n)).toFixed(2); out.turnPeak = +peak.toFixed(2); out.heldAfterTurn = B.held === it;
  // spin while walking
  P.yaw = 0; P.pitch = 0; __sim(0.8, { ...__IDLE, grab: true });   // face the clear lane again (the turn swung it toward the room), let it settle
  let spin = 0; for (let i = 0; i < 60; i++) { __sim(1 / 60, { ...__IDLE, grab: true, mz: 1 }); const w = it.body.angvel(); spin = Math.max(spin, Math.hypot(w.x, w.y, w.z)); } out.spin = +spin.toFixed(2);
  // pushed by the item at the feet
  put(); if (B.held !== it) { const q = it.body.translation(); look(q.x, q.y, q.z); B.tryGrab(); } __sim(0.5, { ...__IDLE, grab: true }); const p0 = { ...P.position }; P.pitch = -1.1; __sim(1, { ...__IDLE, grab: true }); out.push = +Math.hypot(P.position.x - p0.x, P.position.z - p0.z).toFixed(2);
  // aim 5 degrees off a small item at 2 m (8 directions)
  let hits = 0, tries = 0;
  for (let k = 0; k < 8; k++) { clear(); put(); const s = spawn('small'); __sim(0.8); const q = s.body.translation(); look(q.x, q.y, q.z); const a = k * Math.PI / 4, off = 5 * Math.PI / 180; P.yaw += Math.cos(a) * off; P.pitch += Math.sin(a) * off; __sim(1 / 60); tries++; if (B.tryGrab() && B.held === s) hits++; }
  clear(); out.aim5 = hits + '/' + tries;
  return out; })()`;

(async () => {
  const srv = await serve(); const br = await pwLaunch();
  const kill = setTimeout(() => { console.log('FAIL timeout 300 s'); process.exit(2); }, 300000);
  try {
    const ctx = await br.newContext({ viewport: { width: 480, height: 270 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'x@test' })); } catch (e) { /* private */ } });
    const page = await ctx.newPage();
    await page.goto(srv.base + '/games/repo3d/index.html?house=3&seed=7&foes=none&bots=0&traps=0&passives=0');
    await page.waitForFunction('window.__ready === true || window.__fatal', null, { timeout: 60000 });
    const r = await page.evaluate(MEASURE);
    console.log(`to the hold point (15 cm): light ${r.reach.small} s, medium ${r.reach.medium} s, heavy ${r.reach.big} s; fast turn (3 rad/s) error mean ${r.turnMean} m peak ${r.turnPeak} m (grabbed ${r.grabMedium}, held before ${r.heldBeforeTurn}, after ${r.heldAfterTurn}, snap ${JSON.stringify(r.snap)}); spin while walking ${r.spin} rad/s; player shoved by the item ${r.push} m; grabs at 5 deg off: ${r.aim5}`);
    await ctx.close();
  } catch (e) { console.log('FAIL run ' + e.message.slice(0, 300)); }
  clearTimeout(kill); await br.close(); srv.close();
})();
