// Voxel town destruction (the default mode; tools/destruct.js covers the old boxes under ?vox=0): a rocket carves a hole in
// a tube house's wall (shots get through), bullets chip, glass breaks, a building whose supports are blown out
// comes down in chunks and rubble (nothing lands as one intact block), rubble becomes collision, the perimeter wall can be
// breached, a car is wrecked but not erased by one grenade, fuel drums cook off, signs go with their wall, zombies still find the
// player across the rubble, and a new run rebuilds the town.
// Usage: PLAYWRIGHT_PATH=<playwright-core> node games/blockade-z/tools/voxdestruct.js [outDir] [extra query]
'use strict';
const path = require('path'); const fs = require('fs');
const { serve } = require('../../../tools/thumb-lib.js');
const E = process['env'];
const OUT = process.argv[2] || path.join(__dirname, '..', '.vox-shots', 'chk', 'voxdestruct'); fs.mkdirSync(OUT, { recursive: true });
const fails = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const kill = setTimeout(() => { console.log('TIMEOUT'); process.exit(3); }, +(E.TMO || 280000));
const PRE = `const G = __G; const T = THREE; const W = G.world; const S = G.vox.street; const P = G.player;
  const reg = (n) => S.find(n)[0]; const solidOf = (R) => R.world.grid.solid - R.ground;
  const above = (R, y) => { let n = 0; const y0 = Math.floor(R.vy(y)); R.world.grid.forEach((x, yy) => { if (yy >= y0) n++; }); return n; };
  const ray = (ox, oy, oz, dx, dy, dz) => { const d = new T.Vector3(dx, dy, dz).normalize(); return W.raycast(new T.Vector3(ox, oy, oz), d, 60); };
  const settle = (max) => { let t = 0; while (t < max) { __sim(0.5); t += 0.5; if (!S.debug().active) break; } return t; };
  const stage = () => { G.god = true; G.state = 'playing'; G.wave.toSpawn = 0; G.wave.total = 999; G.wave.bossAt = -1; G.zombies.clear(); G.allies.clear(); };`;
(async () => {
  const srv = await serve();
  const br = await require(E.PLAYWRIGHT_PATH || 'playwright-core').chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  try {
    const ctx = await br.newContext({ viewport: { width: 960, height: 600 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'voxdestruct@test' })); } catch (e) {} });
    const page = await ctx.newPage(); const bad = [];
    page.on('pageerror', (e) => bad.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) bad.push('console: ' + m.text().slice(0, 300)); });
    await page.goto((E.BZ_BASE || srv.base) + '/games/blockade-z/index.html?lang=vi&tp=1&autostart=1&nolock=1&seed=4&noaudio=1&tod=0.45&weather=clear' + (process.argv[3] || ''));
    await page.waitForFunction('window.__ready === true', null, { timeout: 90000 });
    const ev = (body) => page.evaluate(`(() => { ${PRE} ${body} })()`);
    const shot = async (name, cam) => { await page.evaluate(`(() => { const c = __G.camera; __G.state = 'paused'; c.fov = 55; c.updateProjectionMatrix(); c.position.set(${cam[0]}, ${cam[1]}, ${cam[2]}); c.rotation.set(0, 0, 0); c.lookAt(${cam[3]}, ${cam[4]}, ${cam[5]}); c.updateMatrixWorld(); __sim(0); __G.state = 'playing'; })()`); await page.screenshot({ path: path.join(OUT, name + '.png') }); };

    // 1. the town
    const t = await ev(`stage(); const d = S.debug(); return { regions: d.regions, voxels: d.voxels, pieces: W.pieces.length, solids: d.solids, empty: S.regions.filter((R) => !R.solids.length && R.c.bb[4] > 0.3).length, names: ['shophouses', 'apartment', 'pagoda', 'gas', 'office', 'market', 'cafe', 'warehouse', 'house', 'watertower', 'poles', 'motorbike', 'kiosk', 'tree', 'lamp', 'car'].filter((n) => !reg(n)), rows: S.find('shophouses').length, walls: S.regions.filter((R) => /^wall/.test(R.name)).length, S: d.S };`);
    check(t.regions >= 60 && t.voxels > (t.S > 0.15 ? 500000 : 4000000) && t.names.length === 0 && t.rows === 7, `the whole town is voxel: ${t.regions} regions, ${t.voxels} voxels at ${t.S} m, ${t.rows} tube houses and every other kind of lot present (missing: ${t.names.join(',') || 'none'})`);
    check(t.pieces === 0, `no box pieces are left for destruct.js (${t.pieces})`);
    check(t.walls >= 16 && t.empty === 0 && t.solids > 500, `perimeter is ${t.walls} wall regions; every region has collision (${t.solids} boxes, ${t.empty} regions without)`);

    // 2-4. a rocket on the side wall of the first tube house (the west end of the shop row)
    const a = await ev(`const R = reg('shophouses'); const zc = (R.tz0 + R.tz1) / 2; const v0 = solidOf(R); const before = ray(R.tx0 - 2.2, 1.3, zc, 1, 0, 0); const blk0 = W.isBlocked(R.tx0 + 0.15, zc);
      G.gear.explode(new T.Vector3(R.tx0 - 0.3, 1.2, zc), 5.5, 240); const awake = S.debug().awake; const secs = settle(20);
      const after = ray(R.tx0 - 2.2, 1.3, zc, 1, 0, 0); return { removed: v0 - solidOf(R), awake, secs, t0: before && before.t, vox0: !!(before && before.s && before.s.vox), t1: after ? after.t : 99, blk0, blk1: W.isBlocked(R.tx0 + 0.15, zc), active: S.debug().active, leak: R.world.ledger().leak };`);
    check(a.removed > 500 && a.awake >= 1, `a rocket carves the tube house's brick side wall: ${a.removed} voxels gone, ${a.awake} region(s) awake, at rest after ${a.secs} s`);
    check(a.vox0 && a.t0 < 2.6 && a.t1 > a.t0 + 0.5, `a shot goes through the hole: the wall stopped it at ${a.t0 && a.t0.toFixed(2)} m, now it flies ${a.t1.toFixed(2)} m (into the rooms behind)`);
    check(a.blk0, `the intact wall blocks the walk grid (${a.blk0}); after the rocket the cell is ${a.blk1 ? 'still blocked by rubble over 0.5 m (zombies climb it)' : 'open'}`);
    check(!a.active && a.leak === 0, `the region goes back to sleep and no voxel is lost by the ledger (leak ${a.leak})`);
    await shot('1-rocket-hole', [-37.5, 4, -6, -33, 1.5, -12]);

    // 5. bullets chip
    const c = await ev(`const R = reg('shophouses'); const v0 = solidOf(R); let hits = 0; for (let i = 0; i < 6; i++) { const z = R.tz0 + 2 + i * 0.15; const h = ray(R.tx0 - 2.2, 1.6, z, 1, 0, 0); if (h && h.s && h.s.vox) { hits++; G.destruct.hit(h.s, new T.Vector3(R.tx0 - 2.2 + h.t, 1.6, z), 45, new T.Vector3(1, 0, 0)); } __sim(0.2); }
      settle(6); return { hits, removed: v0 - solidOf(R) }; `);
    check(c.hits === 6 && c.removed > 6, `bullets chip the brick: ${c.hits} hits removed ${c.removed} voxels`);

    // 6. glass: the cafe's shop front
    const g = await ev(`const R = reg('cafe'); let h0 = null; let gx = 0; for (let x = R.tx0 + 1; x < R.tx1 - 1 && !h0; x += 0.15) { const h = ray(x, 1.9, R.tz0 - 1, 0, 0, 1); if (h && h.tag === 'glass') { h0 = h; gx = x; } } if (!h0) return { tag0: 'none', t0: 0, t1: 0 };
      G.destruct.hit(h0.s, new T.Vector3(gx, 1.9, R.tz0 - 1 + h0.t), 200, new T.Vector3(0, 0, 1)); settle(5); const h1 = ray(gx, 1.9, R.tz0 - 1, 0, 0, 1); return { tag0: h0.tag, t0: h0.t, t1: h1 ? h1.t : 99 };`);
    check(g.tag0 === 'glass' && g.t1 > g.t0 + 0.5, `the cafe's shop front is glass and breaks: hit '${g.tag0}' at ${g.t0 && g.t0.toFixed(2)} m, afterwards the shot reaches ${g.t1.toFixed(2)} m`);

    // 7. collapse: blow out the ground floor of the first tube house all round and inside
    const k = await ev(`const R = reg('shophouses'); const up0 = above(R, 3.6); const v0 = solidOf(R); const sh0 = S.debug().shatters; const sg0 = R.signs.filter((o) => o.g.visible).length;
      const pts = []; for (let z = R.tz0 + 0.5; z <= R.tz1; z += 2.2) pts.push([R.tx0 + 0.3, z], [R.tx1 - 0.3, z], [(R.tx0 + R.tx1) / 2, z]);
      for (const [x, z] of pts) { G.gear.explode(new T.Vector3(x, 1.2, z), 6.5, 400); __sim(0.2); }
      let maxBodies = 0; let t = 0; while (t < 60) { __sim(0.5); t += 0.5; const d = S.debug(); if (d.bodies > maxBodies) maxBodies = d.bodies; if (!d.active) break; }
      let big = 0; for (const b of R.world.bodies.list) if (b.voxels > 4000) big++;
      const d = S.debug(); return { up0, up1: above(R, 3.6), removed: v0 - solidOf(R), shatters: d.shatters - sh0, maxBodies, secs: t, active: d.active, big, signs0: sg0, signs1: R.signs.filter((o) => o.g.visible).length, leak: R.world.ledger().leak, solids: R.solids.length };`);
    check(k.up1 < k.up0 * 0.3, `the upper floors of the tube house come down: ${k.up0} voxels above 3.6 m -> ${k.up1}`);
    check(k.shatters >= 10 && k.maxBodies >= 20, `what falls breaks up on impact: ${k.shatters} shatters, up to ${k.maxBodies} pieces in the air at once`);
    check(!k.active && k.big === 0, `it all comes to rest in ${k.secs} s and nothing is left as one intact block (${k.big} big pieces)`);
    check(k.signs0 > 0 && k.signs1 === 0, `the shop sign goes with its wall (${k.signs0} -> ${k.signs1})`);
    check(Math.abs(k.leak) <= 32, `ledger after the collapse: ${k.leak} voxels unaccounted for out of ${k.removed} moved (rotated pieces baked back gain or lose a few)`);
    await shot('2-tubehouse-down', [-26, 9, 6, -31, 2, -11]);

    // 8. rubble is collision; nobody is trapped; zombies cross it
    const p = await ev(`const R = reg('shophouses'); P.pos.set((R.tx0 + R.tx1) / 2, 0, (R.tz0 + R.tz1) / 2); for (let i = 0; i < 30; i++) { const o = W.overlaps([P.pos.x - 0.3, P.pos.y + 0.05, P.pos.z - 0.3], [P.pos.x + 0.3, P.pos.y + 1.7, P.pos.z + 0.3]); if (!o) break; P.pos.y = o.max[1] + 0.02; }
      const py = P.pos.y; let low = 0; for (const s of R.solids) if (s.max[1] < 1.2 && s.min[1] < 0.05) low++;
      for (let i = 0; i < 16; i++) { const z = G.zombies.spawn('walker', 3, { x: 0, z: 0, dir: [0, 1], name: 't' }); if (z) z.pos.set(-12 + (i % 8) * 0.9, 0, 1 + (i > 7 ? 1.2 : 0)); }
      const start = new Map(); const still = new Map(); let inside = 0; let samples = 0; let reached = 0;
      for (let s = 0; s < 64; s++) { __sim(0.5); for (const z of G.zombies.list) { if (!z.alive) continue; samples++; const o = W.overlaps([z.pos.x - 0.1, z.pos.y + 0.7, z.pos.z - 0.1], [z.pos.x + 0.1, z.pos.y + 1.2, z.pos.z + 0.1]); if (o && o.vox) inside++;
        const d = Math.hypot(z.pos.x - P.pos.x, z.pos.z - P.pos.z); if (d < 2) reached++; const k0 = start.get(z); if (!k0 || Math.hypot(z.pos.x - k0[0], z.pos.z - k0[1]) > 0.5 || d < 4) { start.set(z, [z.pos.x, z.pos.z]); still.set(z, 0); } else still.set(z, (still.get(z) || 0) + 0.5); } }
      const far = (z) => Math.hypot(z.pos.x - P.pos.x, z.pos.z - P.pos.z) > 15; const r = { py, low, alive: G.zombies.aliveCount(), stuck: [...still.entries()].filter(([z, v]) => v >= 3 && !far(z)).length, elsewhere: [...still.entries()].filter(([z, v]) => v >= 3 && far(z)).length, inside, samples, reached, climbs: S.debug().climbs || 0, where: [...still.entries()].filter(([z, v]) => v >= 3).map(([z, v]) => [+z.pos.x.toFixed(1), +z.pos.y.toFixed(1), +z.pos.z.toFixed(1), v]), pp: [+P.pos.x.toFixed(1), +P.pos.y.toFixed(1), +P.pos.z.toFixed(1)] }; G.zombies.clear(); return r;`);
    check(p.low > 20, `rubble is collision: ${p.low} low boxes where the house stood (player stands at y ${p.py.toFixed(2)})`);
    check(p.alive > 0 && p.stuck === 0 && p.inside === 0 && p.reached > 0, `zombies cross the rubble to the player: ${p.alive} alive, ${p.stuck} stuck 3 s on or around the rubble (4 to 15 m from the player; nearer is the crowd waiting its turn), ${p.elsewhere} standing still elsewhere on the map (the game's own re-gate picks those up), ${p.inside}/${p.samples} samples inside a voxel wall, ${p.reached} samples at the player, ${p.climbs} climb assists${p.where.length ? '; stuck at ' + JSON.stringify(p.where) + ', player at ' + JSON.stringify(p.pp) : ''}`);

    // 9. the perimeter wall
    const w = await ev(`const h0 = ray(-12.4, 1.5, 35.1, 0, 0, 1); for (const x of [-13.4, -12.4, -11.4]) { G.gear.explode(new T.Vector3(x, 1.4, 36.2), 6.5, 400); __sim(0.2); } settle(15); const h1 = ray(-12.4, 1.5, 35.1, 0, 0, 1); return { t0: h0 && h0.t, vox: !!(h0 && h0.s && h0.s.vox), t1: h1 ? h1.t : 99 };`);
    check(w.vox && w.t0 < 1.2 && w.t1 > 2.1, `the perimeter wall is voxel and can be breached: stopped a shot at ${w.t0 && w.t0.toFixed(2)} m, afterwards ${w.t1.toFixed(2)} m`);
    await shot('3-wall-breach', [-6, 5, 26, -12.4, 2, 36.5]);

    // 10. a car: wrecked, not erased, by one grenade
    const car = await ev(`const R = reg('car'); if (!R) return { none: true }; const v0 = solidOf(R); G.gear.explode(new T.Vector3(R.tx1 + 1.6, 0.6, (R.tz0 + R.tz1) / 2), 5.5, 240); settle(10); return { v0, v1: solidOf(R) };`);
    check(!car.none && car.v1 < car.v0 * 0.97 && car.v1 > car.v0 * 0.3, `a grenade beside a car wrecks it without erasing it: ${car.v0} -> ${car.v1} voxels`);

    // 11. fuel drums cook off: a blast at the drums in the yard sets off the sim's own explosions, which hurt what stands near
    const fu = await ev(`const R = reg('barrels'); if (!R) return { none: true }; const v0 = solidOf(R); const f0 = S.debug().fuel || 0; const cx = (R.tx0 + R.tx1) / 2; const cz = (R.tz0 + R.tz1) / 2; const z = G.zombies.spawn('walker', 1, { x: 0, z: 0, dir: [0, 1], name: 't' }); if (z) { z.pos.set(cx + 1.2, 0, cz - 2.6); z.speed = 0; } const hp0 = z ? z.hp : 0;
      G.gear.explode(new T.Vector3(cx, 0.6, cz), 2.5, 100); const hpA = z && z.alive ? z.hp : 0; settle(12); const r = { v0, v1: solidOf(R), fuel: (S.debug().fuel || 0) - f0, hp0, hpA, hp1: z && z.alive ? z.hp : 0 }; G.zombies.clear(); return r;`);
    check(!fu.none && fu.fuel >= 1 && fu.v1 < fu.v0 * 0.6 && fu.hp1 < fu.hpA, `fuel drums explode: ${fu.fuel} cook-offs, ${fu.v0} -> ${fu.v1} voxels; a zombie beside them: ${fu.hp0} hp, ${fu.hpA} after the first blast, ${fu.hp1} after the drums went up`);

    // 12. a new run rebuilds the town
    const n = await ev(`const d0 = S.debug(); __newGame(); stage(); __sim(0.3); const d = S.debug(); return { v0: d0.solid, built: d.voxels, solid: d.solid, log: d.log, step: d.step, solids: d.solids, chunks: d.chunks, signs: S.regions.every((R) => R.signs.every((o) => o.g.visible)) };`);
    check(n.solid === n.built && n.v0 < n.built && n.log === 0 && n.step === 0 && n.chunks === 0, `a new run rebuilds the town: ${n.v0} -> ${n.solid} of ${n.built} voxels, command log ${n.log}, live chunks ${n.chunks}`);
    check(n.signs, `signs are back (${n.signs})`);
    check(bad.length === 0, 'no console errors' + (bad.length ? ': ' + bad.slice(0, 4).join(' | ') : ''));
  } catch (e) { console.log('FAIL ' + (e && e.stack || e)); fails.push('threw'); }
  finally { await br.close(); srv.close(); clearTimeout(kill); }
  console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})();
