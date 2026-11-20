// Movement feel numbers (batch 6f item 4, owner: "đi đứng, nhảy rất khó thao tác"). On one test house:
//  accel: time from rest to 90 % of walk speed; decel: from walk to under 10 % after letting go;
//  coyote: a jump pressed 0.08 s after walking off a ledge still jumps; buffer: a jump pressed 0.1 s before landing jumps
//  on landing; air control: how much of a sideways input change the body follows in 0.2 s in the air (target ~60 %);
//  step: walking up a 0.3 m step, the largest change of the camera's vertical speed between two frames (cm/frame per
//  frame, head bob held still; smooth = small);
//  wall: jump height while pressing into a wall vs in the open (no sticking = same);
//  ledge: share of run-and-jump tries from 0.6-1.6 m that end standing on a 0.8 m block.
// Then a walker over --houses houses (5 themes x house 1-5 x seeds) walks the nav path from the truck through every door
// and stair of the house and counts stalls (moving under 30 % of the commanded speed for over 0.15 s).
// Usage: node tools/feel.js [--seeds 7,8] [--walk 1] [--houses 1,2,3,4,5]
'use strict';
const { serve } = require('./serve.js');
const { launch: pwLaunch } = require('./pw.js');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SEEDS = arg('--seeds', '7,8').split(',').map(Number), HOUSES = arg('--houses', '1,2,3,4,5').split(',').map(Number), WALK = arg('--walk', '1') !== '0';
const THEMES = ['vampire', 'pyramid', 'vietnam', 'spacestation', 'asylum'];

const BASIC = `(() => { const G = __G, P = G.player, nav = G.foes.nav, Rp = G.phys.R, world = G.phys.world; window.__paused = true; __sim(0.5);
  const put = (x, z, yaw = 0, y) => { const h = y ?? G.house.heightAt(x, z); P.body.setTranslation({ x, y: h + 0.85, z }, true); P.body.setNextKinematicTranslation({ x, y: h + 0.85, z }); P.vy = 0; P.yaw = yaw; P.pitch = 0; __sim(0.3); };
  const open = () => { for (const i of nav.cells) { if (nav.near[i] < 3) continue; const c = nav.center(i); let ok = true; for (let k = -5; k <= 5 && ok; k += 0.5) for (const s of [-1.2, 0, 1.2]) if (!nav.okW(c.x + k, c.z + s) || G.house.heightAt(c.x + k, c.z + s) !== G.house.heightAt(c.x, c.z)) ok = false; if (ok) return c; } return null; };
  const o = open(), out = {}; const speedNow = () => P.horizSpeed;
  const walkV = 78 / 24;
  // accel / decel (yaw pi/2: walking toward -x, along the open row)
  put(o.x + 4, o.z, Math.PI / 2); let t = 0; for (let i = 0; i < 60; i++) { __sim(1 / 60, { ...__IDLE, mz: 1 }); t += 1 / 60; if (speedNow() >= 0.9 * walkV) break; } out.accel = +t.toFixed(3);
  __sim(0.5, { ...__IDLE, mz: 1 }); t = 0; for (let i = 0; i < 60; i++) { __sim(1 / 60, __IDLE); t += 1 / 60; if (speedNow() < 0.1 * walkV) break; } out.decel = +t.toFixed(3);
  // a 0.8 m block (fixed box) for ledges and the step tests
  const box = (x, z, hx, hy, hz) => G.phys.fixedBox(x, G.house.heightAt(x, z) + hy, z, hx, hy, hz);
  // coyote: stand on a 0.8 block, walk off its edge, press jump 0.08 s after leaving it
  let b = box(o.x, o.z, 0.6, 0.4, 2); put(o.x, o.z, Math.PI / 2, G.house.heightAt(o.x, o.z) + 0.82);
  let off = -1; for (let i = 0; i < 90 && off < 0; i++) { __sim(1 / 60, { ...__IDLE, mz: 1 }); if (!P.grounded) off = i; }
  __sim(0.08, { ...__IDLE, mz: 1 }); const vy0 = P.vy; __sim(1 / 60, { ...__IDLE, mz: 1, jump: true }); out.coyote = P.vy > 2 ? 'jumped' : 'no jump'; world.removeRigidBody(b); __sim(1);
  // buffer: fall from 1.5 m, press jump once about 0.1 s before touching down (feet < fall speed x 0.1), still in the air
  put(o.x, o.z, 0, G.house.heightAt(o.x, o.z) + 1.5); P.stamina = 100; let pressed = false, jumped = false, airAtPress = false;
  for (let i = 0; i < 90; i++) { const feet = P.position.y - 0.83 - G.house.heightAt(o.x, o.z); const press = !pressed && P.vy < -1 && feet < -P.vy * 0.1 && feet > 0.02; if (press) { pressed = true; airAtPress = !P.grounded; } __sim(1 / 60, { ...__IDLE, jump: press }); if (pressed && P.vy > 2) jumped = true; }
  out.buffer = !pressed ? 'not pressed' : !airAtPress ? 'pressed on the ground' : jumped ? 'jumped' : 'no jump'; __sim(1);
  // air control: the sideways push in the air over the one on the ground (walking forward, switch to sideways; side speed after 3 frames)
  const sideGain = (inAir) => { put(o.x + 4, o.z, Math.PI / 2); __sim(0.4, { ...__IDLE, mz: 1 }); if (inAir) { __sim(1 / 60, { ...__IDLE, mz: 1, jump: true }); __sim(0.1, { ...__IDLE, mz: 1 }); }
    let z0 = P.position.z, v = 0; for (let i = 0; i < 3; i++) { __sim(1 / 60, { ...__IDLE, mx: 1 }); v = Math.abs(P.position.z - z0) * 60; z0 = P.position.z; } __sim(1); P.stamina = 100; return v; };
  const gG = sideGain(false), gA = sideGain(true); out.air = +(gA / Math.max(1e-6, gG)).toFixed(2);
  // step: a 0.3 m slab across the way; the biggest one-frame camera rise while walking over it
  b = box(o.x, o.z, 1.0, 0.15, 2.5); put(o.x + 3, o.z, Math.PI / 2); let lastY = P.camPos.y, lastDy = 0, jerk = 0, up = 0, bob0 = P.bob;
  for (let i = 0; i < 90; i++) { __sim(1 / 60, { ...__IDLE, mz: 1 }); P.bob = 0; P.updateCamera(G.camera); const dy = P.camPos.y - lastY; if (i > 20) jerk = Math.max(jerk, Math.abs(dy - lastDy)); lastDy = dy; lastY = P.camPos.y; } up = P.camPos.y; world.removeRigidBody(b); out.stepJerk = +jerk.toFixed(3); __sim(0.5);
  // wall: jump pressing into a wall vs in the open
  const jumpH = (press) => { let top = -9; const y0 = P.position.y; __sim(1 / 60, { ...__IDLE, mz: press ? 1 : 0, jump: true }); for (let i = 0; i < 80; i++) { __sim(1 / 60, { ...__IDLE, mz: press ? 1 : 0 }); top = Math.max(top, P.position.y); } P.stamina = 100; return top - y0; };
  put(o.x, o.z); const free = jumpH(false); b = box(o.x - 0.9, o.z, 0.3, 1.5, 2); put(o.x, o.z, Math.PI / 2); __sim(0.3, { ...__IDLE, mz: 1 }); const wall = jumpH(true); world.removeRigidBody(b);
  out.wallJump = +(wall / free).toFixed(2);
  // ledge: run and jump onto a 0.8 m block from 0.6..1.6 m; success = stood on top at some point (running on walks off its far side)
  b = box(o.x - 2.2, o.z, 0.6, 0.4, 1.5); let okN = 0, n = 0;
  for (const d of [0.6, 0.8, 1.0, 1.2, 1.4, 1.6]) { n++; put(o.x - 2.2 + 0.6 + d + 0.31, o.z, Math.PI / 2); P.stamina = 100; __sim(0.15, { ...__IDLE, mz: 1 }); __sim(1 / 60, { ...__IDLE, mz: 1, jump: true }); let feet = 0; for (let i = 0; i < 72; i++) { __sim(1 / 60, { ...__IDLE, mz: 1 }); const f = P.position.y - 0.83 - G.house.heightAt(o.x, o.z); if (P.grounded) feet = Math.max(feet, f); } (out.ledgeFeet = out.ledgeFeet || []).push(+feet.toFixed(2)); if (feet > 0.7 && feet < 0.95) okN++; }
  world.removeRigidBody(b); out.ledge = okN + '/' + n;
  return out; })()`;

const WALKER = `(() => { const G = __G, P = G.player, nav = G.foes.nav, L = G.house.layout; window.__paused = true; __sim(0.3);
  for (const d of G.house.doorRecs || []) if (d.jammed) G.house.unjam(d.cx, d.cz, 0.5); nav.refreshJams?.();
  const sp = G.house.spawn; const h0 = G.house.heightAt(sp.x, sp.z); P.body.setTranslation({ x: sp.x, y: h0 + 0.85, z: sp.z }, true); P.body.setNextKinematicTranslation({ x: sp.x, y: h0 + 0.85, z: sp.z }); __sim(0.3);
  const goals = []; for (const d of L.doors) { const c = d.dir === 0 ? [{ x: d.x - 1.5, z: d.y + 0.5 }, { x: d.x + 2.5, z: d.y + 0.5 }] : [{ x: d.x + 0.5, z: d.y - 1.5 }, { x: d.x + 0.5, z: d.y + 2.5 }]; goals.push(...c); }
  for (const st of L.stairs || []) { const mid = st.axis === 0 ? (st.y0 + st.y1) / 2 : (st.x0 + st.x1) / 2; const at = (u) => (st.axis === 0 ? { x: u, z: mid } : { x: mid, z: u }); goals.push(at(st.e0 - st.sgn * 1.5), at(st.e0 + st.sgn * 7.5)); }
  const res = { legs: 0, stalls: 0, stuck: 0, metres: 0, at: [] };
  for (const g of goals) {
    if (!nav.okW(g.x, g.z)) continue; const p0 = P.position, path = nav.path(p0.x, p0.z, g.x, g.z); if (!path) continue; res.legs++;
    let idx = 0, low = 0, t = 0, stallOpen = false, lp = { ...P.position };
    while (t < 40) { const p = P.position; while (idx < path.length - 1 && Math.hypot(path[idx].x - p.x, path[idx].z - p.z) < 0.5) idx++; const w = path[idx];
      if (idx >= path.length - 1 && Math.hypot(w.x - p.x, w.z - p.z) < 0.4) break;
      const want = Math.atan2(-(w.x - p.x), -(w.z - p.z)); let d = want - P.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); P.yaw += d;   // face it (a player turns instantly with the mouse)
      __sim(1 / 30, () => ({ ...__IDLE, mz: 1 })); t += 1 / 30; const np = P.position, v = Math.hypot(np.x - lp.x, np.z - lp.z) * 30; res.metres += v / 30; lp = { ...np };
      if (t > 0.3 && v < 0.3 * (78 / 24)) { low += 1 / 30; if (low > 0.15 && !stallOpen) { stallOpen = true; res.stalls++; if (res.at.length < 6) res.at.push([+np.x.toFixed(1), +np.z.toFixed(1)]); } } else { low = 0; stallOpen = false; }
      if (low > 3) { res.stuck++; const hg = G.house.heightAt(g.x, g.z); P.body.setTranslation({ x: g.x, y: hg + 0.85, z: g.z }, true); P.body.setNextKinematicTranslation({ x: g.x, y: hg + 0.85, z: g.z }); __sim(0.2); break; } }   // stuck: carry on from the goal (do not count one spot again)
  }
  res.metres = +res.metres.toFixed(0); return res; })()`;

async function open(br, srv, q) {
  const ctx = await br.newContext({ viewport: { width: 480, height: 270 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'x@test' })); } catch (e) { /* private */ } });
  const page = await ctx.newPage();
  await page.goto(srv.base + '/games/repo3d/index.html?' + q);
  await page.waitForFunction('window.__ready === true || window.__fatal', null, { timeout: 60000 });
  return { ctx, page };
}

(async () => {
  const srv = await serve(); let br = await pwLaunch();
  const kill = setTimeout(() => { console.log('FAIL timeout 3000 s'); process.exit(2); }, 3000000);
  try {
    let { ctx, page } = await open(br, srv, 'house=3&seed=7&foes=none&bots=0&traps=0&passives=0');
    const b = await page.evaluate(BASIC); await ctx.close();
    console.log(`accel to 90 %: ${b.accel} s; decel to 10 %: ${b.decel} s; coyote 0.08 s: ${b.coyote}; jump buffer 0.1 s: ${b.buffer}; air control: ${b.air} of ground; step camera jerk: ${(b.stepJerk * 100).toFixed(1)} cm/frame2; wall jump: ${b.wallJump} of open; ledge 0.8 m: ${b.ledge} (feet ${JSON.stringify(b.ledgeFeet)})`);
    if (WALK) {
      const tot = { houses: 0, legs: 0, stalls: 0, stuck: 0, metres: 0 };
      for (const theme of THEMES) for (const hi of HOUSES) for (const seed of SEEDS) {
        let r;
        try { ({ ctx, page } = await open(br, srv, `house=${hi}&seed=${seed}&foes=none&bots=0&traps=0&passives=0&theme=${theme}`)); r = await page.evaluate(WALKER); await ctx.close(); }
        catch (e) { console.log(`  ${theme}-h${hi}-s${seed}: run error ${e.message.slice(0, 80)}`); tot.errors = (tot.errors || 0) + 1; try { await br.close(); } catch (e2) { /* gone */ } br = await pwLaunch(); continue; }
        tot.houses++; for (const k of ['legs', 'stalls', 'stuck', 'metres']) tot[k] += r[k];
        if (r.stalls || r.stuck) console.log(`  ${theme}-h${hi}-s${seed}: legs ${r.legs}, stalls ${r.stalls}, stuck ${r.stuck} at ${JSON.stringify(r.at)}`);
      }
      console.log(`walker: houses ${tot.houses}, legs ${tot.legs}, metres ${tot.metres}, stalls ${tot.stalls}, stuck ${tot.stuck}, run errors ${tot.errors || 0}`);
    }
  } catch (e) { console.log('FAIL run ' + e.message.slice(0, 300)); }
  clearTimeout(kill); await br.close(); srv.close();
})();
