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
      for (const q of slab.sup) D.breakPiece(q, new G.THREE.Vector3(0, 0, -1));
      let fell = 0; for (let i = 0; i < 12; i++) { __sim(0.05); fell = Math.max(fell, D.debug().falling); }
      const mid = D.debug(); G.state = 'paused'; return { sup: slab.sup.length, fell, mid, slab: slab.id, zi: G.zombies.list.indexOf(z) }; })()`);
    console.log('collapse', JSON.stringify(r2));
    await shot('2-collapse');
    const r2b = await page.evaluate(`(() => { const G = __G; G.state = 'playing'; __sim(2); const D = G.destruct.debug(); const z = G.zombies.list[${r2.zi}]; const slab = G.destruct.pieces[${r2.slab}]; G.state = 'paused';
      return { D, zAlive: z.alive && z.type === 'walker', zhp: Math.round(z.hp), slabBroken: slab.broken, inSolids: G.world.solids.includes(slab.solid) }; })()`);
    console.log('landed', JSON.stringify(r2b));
    await shot('3-rubble');
    check(r2.fell >= 1 && r2b.slabBroken && !r2b.inSolids, `the floor above falls once its walls are gone (${r2.sup} supports broken, ${r2.fell} falling)`);
    check(!r2b.zAlive || r2b.zhp < 200, `the falling floor crushes the zombie under it (${r2b.zAlive ? r2b.zhp + ' hp left' : 'dead'})`);
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
    check(problems.length === 0, 'no console errors' + (problems.length ? ': ' + problems.slice(0, 3).join(' | ') : ''));
  } finally { await br.close(); srv.close(); }
  console.log(fails.length ? fails.length + ' FAIL' : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
