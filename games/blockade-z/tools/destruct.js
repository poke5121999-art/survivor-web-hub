// Breakable town: a rocket blows a hole in the apartment wall (cracks around it, the hole lets shots and zombies
// through), knocking out the ground floor brings the floor above crashing down on a zombie, a boss slam breaks
// what it lands next to, and a new run rebuilds everything. Screenshots of each step for review.
// Usage: PLAYWRIGHT_PATH=<playwright-core> node games/blockade-z/tools/destruct.js <outDir>
'use strict';
const path = require('path');
const fs = require('fs');
const { serve } = require('../../../tools/thumb-lib.js');
const OUT = process.argv[2] || path.join(__dirname, '..', '..', '..', '.destruct-blockade-z'); fs.mkdirSync(OUT, { recursive: true });
const fails = [];
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };

(async () => {
  const srv = await serve();
  const br = await require(process.env.PLAYWRIGHT_PATH || 'playwright-core').chromium.launch({ channel: 'chrome', headless: true });
  try {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'brk@test' })); } catch (e) {} });
    const page = await ctx.newPage();
    const problems = [];
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    await page.goto((process.env.BZ_BASE || srv.base) + '/games/blockade-z/index.html?autostart=1&nolock=1&seed=4&noaudio=1&tod=0.45&weather=clear');
    await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
    const shot = async (name) => { await page.evaluate("for (const id of ['banner','announce']) { const e = document.getElementById(id); if (e) e.classList.remove('on'); }"); await page.waitForTimeout(200); await page.screenshot({ path: path.join(OUT, `brk-${name}.png`) }); };
    // look at the guard post's south face (z = -22, x 14..28) from the forecourt
    const look = `const P = G.player; const look = (x, y, z, tx, ty, tz) => { P.pos.set(x, y, z); P.vel.set(0, 0, 0); const dx = tx - x; const dz = tz - z; P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(ty - y - 1.6, Math.hypot(dx, dz)); };`;
    const base = `const G = __G; G.state = 'playing'; G.god = true; G.wave.toSpawn = 0; G.wave.total = 999; G.wave.bossAt = -1; G.zombies.clear(); G.allies.clear(); ${look}`;
    const info = await page.evaluate(`(() => { ${base} return { n: G.destruct.pieces.length }; })()`);
    check(info.n > 300, `the town has breakable pieces (${info.n})`);
    await page.evaluate(`(() => { ${base} look(18.6, 0, -16.5, 18.6, 2, -22); __sim(0.1); G.state = 'paused'; })()`);
    await shot('0-before');

    // a rocket into the apartment's front wall
    const r1 = await page.evaluate(`(() => { ${base} look(18.6, 0, -16.5, 18.6, 2, -22); const W = G.world; const s0 = W.solids.length; const o = new G.THREE.Vector3(18.6, 1.6, -17); const d = new G.THREE.Vector3(0, 0, -1);
      const before = W.raycast(o, d, 20); G.gear.explode(new G.THREE.Vector3(18.6, 1.4, -21.6), 6.5, 480); __sim(0.4);
      const after = W.raycast(o, d, 20); const D = G.destruct.debug(); G.state = 'paused';
      return { removed: s0 - W.solids.length, before: before && +before.t.toFixed(1), after: after ? +after.t.toFixed(1) : null, D, cracked: G.destruct.pieces.filter((p) => p.stage > 0 && !p.broken).length }; })()`);
    console.log('rocket', JSON.stringify(r1));
    await shot('1-rocket');
    check(r1.removed >= 1 && r1.D.broken >= 1, `a rocket breaks a section of wall (${r1.D.broken} pieces broken, ${r1.removed} solids gone)`);
    check(r1.after === null || r1.after > r1.before + 0.5, `a shot now passes through the hole (wall at ${r1.before} m, then ${r1.after} m)`);
    check(r1.cracked >= 1, `pieces near the blast crack without breaking (${r1.cracked})`);

    // knock out the ground floor of a shophouse: the floor above falls on a zombie standing inside
    const r2 = await page.evaluate(`(() => { ${base} const D = G.destruct; const P0 = D.pieces;
      const slab = P0.find((p) => !p.broken && p.tag === 'stone' && Math.abs(p.min[1] - 3.2) < 0.05 && p.min[0] > -31.2 && p.max[0] < -26.2 && (p.max[0] - p.min[0]) > 4);
      if (!slab) return { err: 'no slab' };
      const z = G.zombies.spawn('walker', 1, { x: -28.7, z: -9, dir: [0, 1] }); z.pos.set(-28.7, 0, -9); z.speed = 0; z.hp = z.maxHp = 200;
      look(-28.7, 0, 2, -28.7, 3, -9);
      // loose chunks dropped on that floor come to rest up there, three metres above the street
      const cm = [new G.THREE.MeshLambertMaterial({ color: 0x888888 })];
      for (let i = 0; i < 8; i++) { const m = new G.THREE.Mesh(new G.THREE.BoxGeometry(0.3, 0.2, 0.3), cm[0]); m.position.set(-28.7 + (i % 4 - 1.5) * 0.5, 4, -9 + (i < 4 ? -0.4 : 0.4)); m.updateMatrixWorld(); G.fx.gib(m, new G.THREE.Vector3(0, 0, 0), { shared: true }); }
      __sim(2.5); const restTop = G.fx.debug().restTop;
      for (const q of slab.sup) D.breakPiece(q, new G.THREE.Vector3(0, 0, -1));
      let fell = 0; for (let i = 0; i < 12; i++) { __sim(0.05); fell = Math.max(fell, D.debug().falling); }
      const mid = D.debug(); G.state = 'paused'; return { restTop, sup: slab.sup.length, fell, mid, slab: slab.id, zi: G.zombies.list.indexOf(z) }; })()`);
    console.log('collapse', JSON.stringify(r2));
    await shot('2-collapse');
    const r2b = await page.evaluate(`(() => { const G = __G; G.state = 'playing'; __sim(2); const D = G.destruct.debug(); const z = G.zombies.list[${r2.zi}]; const slab = G.destruct.pieces[${r2.slab}]; G.state = 'paused';
      G.state = 'playing'; __sim(2.5); G.state = 'paused'; const fl = G.fx.floaters(); const top = G.fx.debug().restTop;
      return { fl, top, D, zAlive: z.alive && z.type === 'walker', zhp: Math.round(z.hp), slabBroken: slab.broken, inSolids: G.world.solids.includes(slab.solid) }; })()`);
    console.log('landed', JSON.stringify(r2b));
    await shot('3-rubble');
    check(r2.fell >= 1 && r2b.slabBroken && !r2b.inSolids, `the floor above falls once its walls are gone (${r2.sup} supports broken, ${r2.fell} falling)`);
    check(!r2b.zAlive || r2b.zhp < 200, `the falling floor crushes the zombie under it (${r2b.zAlive ? r2b.zhp + ' hp left' : 'dead'})`);
    check(r2.restTop > 3 && r2b.fl.length === 0, `chunks and blood pools on that floor go down with it instead of hanging in the air (rested at ${r2.restTop} m, floating ${JSON.stringify(r2b.fl.slice(0, 3))})`);
    check(r2b.D.rubble >= 1 && r2b.D.falling === 0, `it lands and leaves rubble (${r2b.D.rubble} piles)`);

    // a boss slam next to the church wall breaks it
    const r3 = await page.evaluate(`(() => { ${base} const D = G.destruct; const b0 = D.debug().broken; const C = G.zombies.kinds.bosses().ctx;
      C.boom(new G.THREE.Vector3(-18.7, 0.8, 18), 3.5, [0x40f0ff, 0xc0ffff, 0xffffff]); __sim(0.3); return { more: D.debug().broken - b0 }; })()`);
    check(r3.more >= 1, `a boss slam breaks the wall it lands against (${r3.more} pieces)`);
    // bullets chip a wooden crate apart
    const r4 = await page.evaluate(`(() => { ${base} const W = G.world; const s = W.solids.find((q) => q.piece && q.tag === 'wood' && q.min[1] < 0.1); const p = s.piece; let n = 0;
      while (!p.broken && n < 400) { G.destruct.hit(s, new G.THREE.Vector3(), 34); n++; } return { n, broken: p.broken }; })()`);
    check(r4.broken && r4.n > 3, `pistol shots chip a wooden piece apart (${r4.n} shots)`);
    // a new run rebuilds the town
    const r5 = await page.evaluate(`(() => { const G = __G; const s0 = G.world.solids.length; G.events.emit('game:new'); __sim(0.1); const D = G.destruct.debug(); return { s0, s1: G.world.solids.length, broken: G.destruct.pieces.filter((p) => p.broken).length, D }; })()`);
    check(r5.broken === 0 && r5.s1 > r5.s0 && r5.D.rubble === 0, `a new run rebuilds every piece (${r5.s0} -> ${r5.s1} solids)`);
    await page.evaluate(`(() => { const G = __G; ${look} look(18.6, 0, -16.5, 18.6, 2, -22); G.state = 'playing'; __sim(0.1); G.state = 'paused'; })()`);
    await shot('4-rebuilt');
    // windows: a pane of glass stops a shot, stars on a light hit, breaks on the next, and then lets shots through;
    // a blast takes out the panes around it; nothing is left hanging; a new run puts every pane back
    const gl = await page.evaluate(`(() => { const G = __G; const T = G.THREE; __newGame(); G.wave.toSpawn = 0; G.zombies.clear(); G.god = true; __sim(0.2);
      const D = G.destruct; const panes = D.pieces.filter((p) => p.tag === 'glass'); const p = panes.find((q) => q.min[1] < 2 && q.max[0] - q.min[0] < 0.2) || panes.find((q) => q.min[1] < 2);
      const thinX = p.max[0] - p.min[0] < p.max[2] - p.min[2]; const c = new T.Vector3((p.min[0] + p.max[0]) / 2, (p.min[1] + p.max[1]) / 2, (p.min[2] + p.max[2]) / 2);
      const dir = thinX ? new T.Vector3(1, 0, 0) : new T.Vector3(0, 0, 1); const from = c.clone().addScaledVector(dir, -2.5);
      const ray = () => { const h = G.world.raycast(from, dir, 5); return h ? +h.t.toFixed(2) : 99; };
      const r = { panes: panes.length, lit: panes.filter((q) => /lit/.test(q.boxes[0].mats)).length, before: ray() };
      D.hit(p.solid, c, 40, dir.clone()); r.stage = p.stage; r.brokenAfter1 = p.broken; r.mid = ray();
      const P = G.player; P.pos.set(from.x, Math.max(0, from.y - 1.5), from.z); P.yaw = Math.atan2(-dir.x, -dir.z); P.pitch = 0; G.state = 'playing'; __sim(0.3); r.shot = 'see 4-glass-cracked';
      return r; })()`);
    await shot('4-glass-cracked');
    const gl2 = await page.evaluate(`(() => { const G = __G; const T = G.THREE; const D = G.destruct; const p = D.pieces.find((q) => q.tag === 'glass' && q.stage > 0 && !q.broken);
      const thinX = p.max[0] - p.min[0] < p.max[2] - p.min[2]; const c = new T.Vector3((p.min[0] + p.max[0]) / 2, (p.min[1] + p.max[1]) / 2, (p.min[2] + p.max[2]) / 2);
      const dir = thinX ? new T.Vector3(1, 0, 0) : new T.Vector3(0, 0, 1); const from = c.clone().addScaledVector(dir, -2.5); const g0 = G.fx.debug().gibs;
      D.hit(p.solid, c, 40, dir.clone()); const r = { broken: p.broken, shards: G.fx.debug().gibs - g0, inSolids: G.world.solids.includes(p.solid) }; const h = G.world.raycast(from, dir, 3.2); r.after = h ? +h.t.toFixed(2) : 99;
      __sim(0.25); return r; })()`);
    await shot('5-glass-broken');
    const gl3 = await page.evaluate(`(() => { const G = __G; const T = G.THREE; const D = G.destruct; __sim(3); const r = { floating: G.fx.floaters().length };
      const left = D.pieces.filter((q) => q.tag === 'glass' && !q.broken); const a = left[0]; const at = new T.Vector3((a.min[0] + a.max[0]) / 2, (a.min[1] + a.max[1]) / 2, (a.min[2] + a.max[2]) / 2);
      const near = left.filter((q) => Math.hypot((q.min[0] + q.max[0]) / 2 - at.x, (q.min[2] + q.max[2]) / 2 - at.z) < 5).length;
      D.blast(at, 6, 120); r.near = near; r.blown = left.filter((q) => q.broken).length; __sim(3.5); r.floating2 = G.fx.floaters().length;
      __newGame(); G.wave.toSpawn = 0; r.restored = D.pieces.filter((q) => q.tag === 'glass' && (q.broken || q.stage > 0)).length; return r; })()`);
    console.log('glass', JSON.stringify(gl), JSON.stringify(gl2), JSON.stringify(gl3));
    check(gl.panes >= 20 && gl.before < 2.6 && gl.stage === 2 && !gl.brokenAfter1 && gl.mid < 2.6, `${gl.panes} window panes; one stops a shot (ray ${gl.before} m) and a light hit only stars it`);
    check(gl2.broken && gl2.shards >= 6 && !gl2.inSolids && gl2.after > 2.6, `the next hit breaks it into ${gl2.shards} shards and shots pass through the opening (ray ${gl2.after} m)`);
    check(gl3.blown >= 1 && gl3.blown >= Math.min(2, gl3.near) && gl3.floating === 0 && gl3.floating2 === 0, `a blast breaks the panes around it (${gl3.blown} of ${gl3.near} within 5 m) and no shard is left hanging`);
    check(gl3.restored === 0, 'a new run puts every pane back');
    // doors: open lets a ray through, shut blocks it, it will not shut on someone standing in it, the player's key works the
    // nearest one, zombies pressed against a shut door break it down, and a new run hangs every door again
    const dr = await page.evaluate(`(() => { const G = __G; const T = G.THREE; __newGame(); G.wave.toSpawn = 0; G.zombies.clear(); G.god = true; G.state = 'playing'; __sim(0.2);
      const X = G.destruct; const D = X.doors[0]; if (!D) return { n: 0 }; const m = D.solid; const thinX = m.max[0] - m.min[0] < m.max[2] - m.min[2];
      const dir = thinX ? new T.Vector3(1, 0, 0) : new T.Vector3(0, 0, 1); const from = D.at.clone().addScaledVector(dir, -1.5); from.y = 1;
      const ray = () => { const h = G.world.raycast(from, dir, 3); return h ? +h.t.toFixed(2) : 99; }; const P = G.player;
      const r = { n: X.doors.length, open: ray() }; P.pos.set(D.at.x, 0, D.at.z); r.refused = !X.setDoor(D, 1) && D.state === 0;
      P.pos.set(from.x, 0, from.z); P.yaw = Math.atan2(-dir.x, -dir.z); P.pitch = 0; r.near = X.nearDoor() === D; r.used = X.useDoor(); r.state = D.state; r.shut = ray(); r.inSolids = G.world.solids.includes(m);
      __sim(0.6); r.swing = +Math.abs(D.pivot.rotation.y - D.yaw0).toFixed(2); r.shot = 1; return r; })()`);
    await shot('6-door-shut');
    const dr2 = await page.evaluate(`(() => { const G = __G; const X = G.destruct; const D = X.doors[0]; const m = D.solid; const thinX = m.max[0] - m.min[0] < m.max[2] - m.min[2];
      const r = { hp0: D.hp }; X.hit(m, D.at, 40); r.hpShot = D.hp; const t = Object.keys(BZ.ZOMBIES).find((k) => !BZ.ZOMBIES[k].boss && !BZ.ZOMBIES[k].fly);
      const zs = []; for (let i = 0; i < 3; i++) { const x = D.at.x + (thinX ? 0.8 : i * 0.5 - 0.5); const z = D.at.z + (thinX ? i * 0.5 - 0.5 : 0.8); const q = G.zombies.spawn(t, 2, { x, z, dir: [0, 1], name: 't' }); if (q) { q.pos.set(x, 0, z); q.hold = [x, z]; zs.push(q); } }
      G.player.pos.set(D.at.x + (thinX ? -3 : 0), 0, D.at.z + (thinX ? 0 : -3)); let secs = 0;
      while (D.state === 1 && secs < 12) { __sim(0.1); secs += 0.1; for (const q of zs) if (q.alive) { q.pos.x = q.hold[0]; q.pos.z = q.hold[1]; q.pos.y = 0; } }
      r.zs = zs.length; r.secs = +secs.toFixed(1); r.state = D.state; r.inSolids = G.world.solids.includes(m); r.visible = D.pivot.visible; G.zombies.clear(); __sim(3); r.floating = G.fx.floaters().length;
      __newGame(); G.wave.toSpawn = 0; r.restored = X.doors.every((d) => d.state === 0 && d.pivot.visible && d.hp > 200) && !G.world.solids.includes(m); return r; })()`);
    console.log('doors', JSON.stringify(dr), JSON.stringify(dr2));
    check(dr.n >= 4 && dr.open > 1.7 && dr.refused, `${dr.n} doors hang open (ray ${dr.open} m) and one will not shut on someone standing in it`);
    check(dr.near && dr.used && dr.state === 1 && dr.shut < 1.7 && dr.inSolids && dr.swing < 0.3, `the use key shuts the door in front of the player and it blocks (ray ${dr.shut} m)`);
    check(dr2.hpShot < dr2.hp0 && dr2.state === 2 && !dr2.inSolids && !dr2.visible && dr2.secs > 1 && dr2.floating === 0, `${dr2.zs} zombies break a shut door down in ${dr2.secs} s and nothing is left hanging`);
    check(dr2.restored, 'a new run hangs every door again, open');
    check(problems.length === 0, 'no console errors' + (problems.length ? ': ' + problems.slice(0, 3).join(' | ') : ''));
  } finally { await br.close(); srv.close(); }
  console.log(fails.length ? fails.length + ' FAIL' : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
