// Foe signature moves (js/foe-moves.js). Gunner: aims (red line follows, then locks 0.25 s), fires a hitscan shot for its
// dmg; a sidestep during the lock makes it miss; a wall blocks the shot and it does not aim through walls; it keeps 6 m
// (backs off, never closes in) and shoots from <= 9 m; the shot hurts another foe in the line. Rook: locks a lane,
// stomps 3 times, charges straight at 8 m/s without steering; hits the player (dmg + shove), a sidestep makes it miss;
// a wall stops it dazed 1.2 s; it hurts foes in its lane; it charges the last seen spot. Pictures of the line and a charge.
// Usage: node tools/foe-moves.js [--out <dir>]
// (batch 6f: the wall test uses a 3 m panel across the line, a 0.6 m post let a gunner walk round it in 3 s once decor was
// trimmed; the back-off test needs 3.5 m clear behind the gunner, T.pair's 'back')
'use strict';
const fs = require('fs');
const path = require('path');
const { serve } = require('./serve.js');
const { launch: pwLaunch, scratch } = require('./pw.js');
const argv = process.argv.slice(2);
const OUT = (() => { const i = argv.indexOf('--out'); return i >= 0 ? argv[i + 1] : scratch('foe-moves'); })();
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (ok, name, detail) => { results.push({ ok, name, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + JSON.stringify(detail).slice(0, 400) : ''}`); };

const HELP = `(() => { const G = __G, nav = G.foes?.nav, P = G.player; window.__paused = true; __sim(1);
  const T = window.__T = {};
  // a: a spot, b: d m away along a clear, seen line, both flat on one floor; side: a step across the line from b is open too
  T.pair = (d, skip = 0, back = 0) => { for (let i = 0; i < nav.W * nav.H; i++) { if (!nav.walk[i] || nav.near[i] < 3) continue; const a = nav.center(i), h = G.house.heightAt(a.x, a.z);
    for (let k = 0; k < 8; k++) { const an = k * Math.PI / 4, dir = { x: Math.cos(an), z: Math.sin(an) }, b = { x: a.x + dir.x * d, z: a.z + dir.z * d };
      if (!nav.okW(b.x, b.z) || Math.abs(G.house.heightAt(b.x, b.z) - h) > 0.01 || !nav.clear(a.x, a.z, b.x, b.z, 0.7) || !nav.los(a.x, a.z, b.x, b.z)) continue;
      const s = { x: b.x - dir.z * 1.6, z: b.z + dir.x * 1.6 }; if (!nav.okW(s.x, s.z) || !nav.clear(b.x, b.z, s.x, s.z, 0.4)) continue;
      if (back && (!nav.okW(a.x - dir.x * back, a.z - dir.z * back) || !nav.clear(a.x, a.z, a.x - dir.x * back, a.z - dir.z * back, 0.6) || Math.abs(G.house.heightAt(a.x - dir.x * back, a.z - dir.z * back) - h) > 0.01)) continue;
      if (skip-- > 0) continue; return { a, b, dir, side: s }; } } return null; };
  T.put = (x, z, lx, lz) => { const h = G.house.heightAt(x, z); P.body.setTranslation({ x, y: h + 0.85, z }, true); P.body.setNextKinematicTranslation({ x, y: h + 0.85, z }); P.vy = 0; if (lx !== undefined) P.yaw = Math.atan2(-(lx - x), -(lz - z)); P.pitch = 0; };
  T.fresh = () => { for (const f of [...(G.foes?.list || [])]) G.foes.remove(f); P.hp = 100; P.stamina = 100; P.push = null; };
  T.foe = (kind, x, z, aware = true) => { const f = G.foes.spawn(kind, x, z, { sleep: 0 }); const p = P.position; f.yaw = Math.atan2(p.x - x, p.z - z);
    if (aware) { f.aware = 1; f.lastSeen = { x: p.x, z: p.z }; G.foes.setState(f, 'chase'); } return f; };
  T.logs = (k, n0) => G.foes.log.slice(n0).filter((e) => e[0] === k);
  T.wait = (cond, s) => { for (let i = 0; i < s * 60; i++) { if (cond()) return true; __sim(1 / 60); } return cond(); };
  return true; })()`;
const PRE = (c) => c.replace('(() => {', '(() => { const G = __G, T = __T, P = G.player, nav = G.foes?.nav, F = G.foes;');

const CASES = {
  'gunner: sees you at 7 m, red line, fires after 0.7 s for its dmg': `(() => { T.fresh(); const pr = T.pair(7); T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z); __sim(0.1);
    const f = T.foe('gunner', pr.a.x, pr.a.z), n0 = F.log.length; const aimed = T.wait(() => f.state === 'aim', 2); const tAim = F.time;
    __sim(0.3); const line = !!F.lasers && F.lasers.some((l) => l.tube.visible), laser = f.laser;
    T.wait(() => T.logs('shot', n0).length > 0, 1.5); const shot = T.logs('shot', n0)[0], tShot = F.time;
    return { ok: aimed && line && laser > 0.3 && !!shot && shot[2] === 'player' && Math.abs(P.hp - (100 - f.dmg)) < 0.01 && tShot - tAim > 0.6 && tShot - tAim < 0.85, dmg: f.dmg, hp: P.hp, shot, dt: +(tShot - tAim).toFixed(2) }; })()`,
  'gunner: a sidestep during the lock makes it miss': `(() => { T.fresh(); const pr = T.pair(7); T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z); __sim(0.1);
    const f = T.foe('gunner', pr.a.x, pr.a.z), n0 = F.log.length; T.wait(() => f.state === 'aim', 2); T.wait(() => f.aimT > 0.48, 1);
    T.put(pr.side.x, pr.side.z, pr.a.x, pr.a.z); T.wait(() => T.logs('shot', n0).length > 0, 1); const shot = T.logs('shot', n0)[0];
    return { ok: !!shot && shot[2] !== 'player' && P.hp === 100, shot, hp: P.hp }; })()`,
  'gunner: no aim through a wall; a wall that comes between takes the shot': `(() => { T.fresh(); const pr = T.pair(7); T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z); __sim(0.1);
    const f = T.foe('gunner', pr.a.x, pr.a.z), n0 = F.log.length; T.wait(() => f.state === 'aim', 2); T.wait(() => f.aimT > 0.48, 1);
    const mx = (pr.a.x + pr.b.x) / 2, mz = (pr.a.z + pr.b.z) / 2, wall = G.phys.fixedBox(mx, G.house.heightAt(mx, mz) + 1.2, mz, 1.5, 1.2, 0.15, { rotY: Math.atan2(pr.b.x - pr.a.x, pr.b.z - pr.a.z) });
    T.wait(() => T.logs('shot', n0).length > 0, 1); const shot = T.logs('shot', n0)[0], hp1 = P.hp;
    // a fresh gunner with the wall in the way never aims at you
    F.remove(f); const g = T.foe('gunner', pr.a.x, pr.a.z), n1 = F.log.length; __sim(3); const aims = g.state === 'aim' || T.logs('shot', n1).length;
    G.phys.world.removeRigidBody(wall);
    return { ok: !!shot && shot[2] === 'wall' && hp1 === 100 && !aims && P.hp === 100, shot, hp1, aims }; })()`,
  'gunner: keeps 6 m (backs off from 3 m), never closes in from 7.5 m': `(() => { T.fresh(); const pr = T.pair(3, 0, 3.5); T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z); __sim(0.1);
    const f = T.foe('gunner', pr.a.x, pr.a.z); let far = 0; const tr = []; for (let i = 0; i < 300; i++) { P.hp = 100; __sim(1 / 60); far = Math.max(far, F.dist(f, P.position)); if (i % 30 === 29) tr.push(+F.dist(f, P.position).toFixed(2) + ':' + f.state); }
    T.fresh(); const q = T.pair(7.5); T.put(q.b.x, q.b.z, q.a.x, q.a.z); __sim(0.1); const g = T.foe('gunner', q.a.x, q.a.z); let near = 99; for (let i = 0; i < 240; i++) { P.hp = 100; __sim(1 / 60); near = Math.min(near, F.dist(g, P.position)); }
    return { ok: far > 4.5 && near > 7.2, backedTo: +far.toFixed(2), closest: +near.toFixed(2), tr }; })()`,
  'gunner: a foe in the line takes the shot (friendly fire)': `(() => { T.fresh(); const pr = T.pair(7); T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z); __sim(0.1);
    const f = T.foe('gunner', pr.a.x, pr.a.z), n0 = F.log.length; T.wait(() => f.state === 'aim', 2); T.wait(() => f.aimT > 0.48, 1);
    const m = F.spawn('mummy', pr.a.x + pr.dir.x * 3.5, pr.a.z + pr.dir.z * 3.5, { sleep: 99 }), hp0 = m.hp;
    T.wait(() => T.logs('shot', n0).length > 0, 1); const shot = T.logs('shot', n0)[0];
    return { ok: !!shot && shot[2] === 'foe:mummy' && hp0 - m.hp > f.dmg - 0.01 && P.hp === 100, shot, lost: +(hp0 - m.hp).toFixed(1) }; })()`,
  'rook: locks a lane, stomps 3 times, charges at 8 m/s, hits for its dmg and shoves': `(() => { T.fresh(); const pr = T.pair(7); T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z); __sim(0.1);
    const f = T.foe('rook', pr.a.x, pr.a.z), n0 = F.log.length, stomps = []; G.events.on('foe:stomp', (e) => e.foe === f && stomps.push(F.time));
    const locked = T.wait(() => f.state === 'stomp', 2); const t0 = F.time; T.wait(() => f.state === 'charge', 2); const t1 = F.time; let vmax = 0, x0 = f.x, z0 = f.z;
    for (let i = 0; i < 90 && f.state === 'charge'; i++) { __sim(1 / 60); vmax = Math.max(vmax, f.moveSpeed); }
    const hit = T.logs('rookHit', n0).find((e) => e[1] === 'player');
    return { ok: locked && stomps.length === 3 && Math.abs(t1 - t0 - 0.96) < 0.1 && vmax > 7.5 && !!hit && Math.abs(P.hp - (100 - f.dmg)) < 0.01, stomps: stomps.length, windup: +(t1 - t0).toFixed(2), vmax: +vmax.toFixed(2), hp: P.hp, dmg: f.dmg }; })()`,
  'rook: cannot steer, a sidestep after the lock makes it miss; a wall stops it dazed 1.2 s': `(() => { T.fresh(); const pr = T.pair(7); T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z); __sim(0.1);
    const f = T.foe('rook', pr.a.x, pr.a.z), n0 = F.log.length; T.wait(() => f.state === 'stomp', 2); const lane = { ...f.lane.dir }, x0 = f.x, z0 = f.z;
    T.put(pr.side.x, pr.side.z, pr.a.x, pr.a.z); let side = 0; T.wait(() => f.state === 'charge', 2);
    for (let i = 0; i < 150 && f.state === 'charge'; i++) { __sim(1 / 60); side = Math.max(side, Math.abs((f.x - x0) * lane.z - (f.z - z0) * lane.x)); }
    const wall = T.logs('rookWall', n0).length, sx = f.x, sz = f.z; let still = true; for (let i = 0; i < 66; i++) { __sim(1 / 60); if (Math.hypot(f.x - sx, f.z - sz) > 0.15) still = false; }
    return { ok: P.hp === 100 && side < 0.3 && wall === 1 && f.dazed !== undefined && still, hp: P.hp, side: +side.toFixed(2), wall, still }; })()`,
  'rook: a foe in its lane is hit and thrown': `(() => { T.fresh(); const pr = T.pair(7); T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z); __sim(0.1);
    const f = T.foe('rook', pr.a.x, pr.a.z), n0 = F.log.length; T.wait(() => f.state === 'stomp', 2);
    const m = F.spawn('mummy', pr.a.x + pr.dir.x * 3.5, pr.a.z + pr.dir.z * 3.5, { sleep: 99 }), hp0 = m.hp;
    T.wait(() => T.logs('rookHit', n0).some((e) => e[1] === 'foe'), 3);
    return { ok: T.logs('rookHit', n0).some((e) => e[1] === 'foe' && e[2] === 'mummy') && hp0 - m.hp > f.dmg - 0.01, lost: +(hp0 - m.hp).toFixed(1) }; })()`,
  'rook: charges the last seen spot when you are out of sight': `(() => { T.fresh(); const pr = T.pair(7); T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z); __sim(0.1);
    const f = T.foe('rook', pr.a.x, pr.a.z); f.cdT = 0.5; const spot = { x: pr.b.x, z: pr.b.z };
    // you vanish (a far room, out of sight) right after it saw you there
    let far = null; for (const i of nav.cells) { const c = nav.center(i); if (Math.hypot(c.x - pr.a.x, c.z - pr.a.z) > 25 && !nav.los(pr.a.x, pr.a.z, c.x, c.z)) { far = c; break; } }
    T.put(far.x, far.z); f.lastSeen = spot; f.aware = 1; f.lostT = 0; const n0 = F.log.length;
    const locked = T.wait(() => f.state === 'stomp', 2.5), to = f.lane && f.lane.dir, want = { x: (spot.x - f.x), z: (spot.z - f.z) }, L = Math.hypot(want.x, want.z);
    return { ok: locked && !f.seen && to && (to.x * want.x + to.z * want.z) / L > 0.98, locked, seen: f.seen }; })()`,
};

async function open(br, srv, q) {
  const ctx = await br.newContext({ viewport: { width: 960, height: 540 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'x@test' })); } catch (e) { /* private */ } });
  const page = await ctx.newPage(); const logs = [];
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') logs.push('console: ' + m.text()); });
  await page.goto(srv.base + '/games/repo3d/index.html?' + q);
  await page.waitForFunction('window.__ready === true || window.__fatal', null, { timeout: 60000 });
  if (await page.evaluate('!!window.__fatal')) throw new Error('fatal: ' + await page.evaluate('String(window.__fatal)'));
  await page.evaluate(HELP);
  return { ctx, page, logs };
}

(async () => {
  const srv = await serve(); const br = await pwLaunch();
  const kill = setTimeout(() => { console.log('FAIL timeout 300 s'); process.exit(2); }, 300000);
  try {
    let { ctx, page, logs } = await open(br, srv, 'house=4&seed=7&foes=none&bots=0&passives=0');
    for (const [name, code] of Object.entries(CASES)) {
      let r; try { r = await page.evaluate(PRE(code)); } catch (e) { r = { ok: false, err: e.message.slice(0, 300) }; }
      check(!!r.ok, name, r);
    }
    const err = await page.evaluate('__errors.slice()');
    check(!err.length && !logs.length, 'cases: no console or page errors', err.concat(logs));
    await ctx.close();

    // pictures: the gunner's red line on you, a rook mid-charge (spacestation house 4, HUD hidden)
    ({ ctx, page, logs } = await open(br, srv, 'house=4&seed=7&foes=none&bots=0&passives=0&theme=spacestation'));
    await page.evaluate(`document.querySelectorAll('.ui-root, .hx, .scanx').forEach((e) => e.style.visibility = 'hidden')`);
    const shots = [];
    const snap = async (tag) => { const f = path.join(OUT, `foe-${tag}.png`); await page.waitForTimeout(80); await page.screenshot({ path: f }); shots.push(f); };
    await page.evaluate(PRE(`(() => { T.fresh(); const pr = T.pair(6); T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z); __sim(0.1); const f = T.foe('gunner', pr.a.x, pr.a.z); T.wait(() => f.state === 'aim', 2); __sim(0.35); return true; })()`));
    await snap('gunner-line');
    await page.evaluate(PRE(`(() => { const f = F.list[0]; T.wait(() => f.state !== 'aim', 1); __sim(1 / 60); return true; })()`));
    await snap('gunner-shot');
    await page.evaluate(PRE(`(() => { T.fresh(); const pr = T.pair(8); T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z); __sim(0.1); const f = T.foe('rook', pr.a.x, pr.a.z); T.wait(() => f.state === 'stomp', 2); __sim(0.4); return true; })()`));
    await snap('rook-stomp');
    await page.evaluate(PRE(`(() => { const f = F.list[0]; T.wait(() => f.state === 'charge', 2); __sim(0.3); return true; })()`));
    await snap('rook-charge');
    check(shots.length === 4, 'pictures', shots);
    console.log('  ' + shots.join('\n  '));
    await ctx.close();
  } catch (e) { check(false, 'run', e.message.slice(0, 400)); }
  clearTimeout(kill);
  await br.close(); srv.close();
  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} pass`);
  process.exit(bad.length ? 1 : 0);
})();
