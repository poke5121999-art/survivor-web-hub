// Frame cost of the voxel prototype with a crowd: 32 walkers closing on the player in front of the voxel block, with and
// without ?vox=1, at the low and medium tiers, desktop 1280x720 and phone 390x844, on the GPU and on SwiftShader (a lower
// bound). Reports fps over real animation frames (headless Chrome caps at 60) and ms per frame measured around
// tick + draw + gl.finish() (not capped). Also checks pathing after the block is blasted: no walker inside a voxel wall,
// none stuck for 3 s.
// Usage: PLAYWRIGHT_PATH=<playwright-core> [SWIFT=1] [ONLY=vox|base] node games/blockade-z/tools/voxperf.js [extra query for vox runs]
'use strict';
const { serve } = require('../../../tools/thumb-lib.js');
const E = process['env'];
const kill = setTimeout(() => { console.log('TIMEOUT'); process.exit(3); }, +(E.TMO || 280000));
const STAGE = `(() => { const G = __G; const P = G.player; G.god = true; G.wave.toSpawn = 0; G.wave.total = 999; G.wave.bossAt = -1; G.zombies.clear(); G.allies.clear();
  P.pos.set(-24, 0, 3); P.yaw = 0.25; P.pitch = 0.02; P.vel.set(0, 0, 0);
  let n = 0; for (let i = 0; i < 32; i++) { const a = -0.9 + (i % 16) / 15 * 1.8; const r = 7 + (i % 4) * 2.2; const z = G.zombies.spawn('walker', 3, { x: 0, z: 0, dir: [0, 1], name: 't' }); if (!z) continue; z.pos.set(P.pos.x + Math.sin(a) * r - Math.sin(P.yaw) * 2, 0, P.pos.z - Math.cos(a) * r * 0.55 + 2); n++; }
  __sim(0.5); return n; })()`;
const MEASURE = `(async () => { const G = __G; const gl = G.renderer.getContext();
  // uncapped: ms around tick + draw + finish
  const t = []; for (let i = 0; i < 90; i++) { const a = performance.now(); __sim(1 / 60); gl.finish(); t.push(performance.now() - a); if (i % 30 === 29) await new Promise((r) => setTimeout(r, 0)); }
  t.sort((a, b) => a - b); const ms = t[t.length >> 1]; const p95 = t[Math.floor(t.length * 0.95)];
  // real frames
  let f = 0; const t0 = performance.now(); await new Promise((res) => { const step = () => { f++; if (performance.now() - t0 < 3000) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
  const fps = f / ((performance.now() - t0) / 1000);
  return { ms: +ms.toFixed(2), p95: +p95.toFixed(2), fps: +fps.toFixed(1), alive: G.zombies.aliveCount(), voxZ: G.zombies.list.filter((z) => z.alive && z.vox).length, draws: __stats.draws, tris: __stats.tris, q: G.quality.name, voxq: G.vox ? G.vox.q : '-', errs: __errors.length }; })()`;
const PATH = `(async () => { const G = __G; const W = G.world; const P = G.player;
  for (const [x, z] of [[-29, -6], [-24.5, -5.5], [-20, -6]]) G.gear.explode(new THREE.Vector3(x, 1.2, z), 6.5, 400);
  __sim(5); P.pos.set(-24, 0, -9.5); G.zombies.clear();
  for (let i = 0; i < 24; i++) { const z = G.zombies.spawn('walker', 3, { x: 0, z: 0, dir: [0, 1], name: 't' }); if (z) z.pos.set(-31 + (i % 12) * 1.25, 0, 0.5 + (i > 11 ? 2 : 0)); }
  const start = new Map(); const still = new Map(); let inside = 0; let samples = 0; let reached = 0;
  for (let s = 0; s < 16; s++) { __sim(0.5);
    for (const z of G.zombies.list) { if (!z.alive) continue; samples++;
      const m = [z.pos.x - 0.12, z.pos.y + 0.6, z.pos.z - 0.12]; const M = [z.pos.x + 0.12, z.pos.y + 1.3, z.pos.z + 0.12]; const o = W.overlaps(m, M); if (o && o.vox) inside++;
      const d = Math.hypot(z.pos.x - P.pos.x, z.pos.z - P.pos.z); if (d < 1.8) reached++;
      const k = start.get(z); if (!k || Math.hypot(z.pos.x - k[0], z.pos.z - k[1]) > 0.5 || d < 2.2) { start.set(z, [z.pos.x, z.pos.z]); still.set(z, 0); } else still.set(z, (still.get(z) || 0) + 0.5); }
    if (s % 4 === 3) await new Promise((r) => setTimeout(r, 0)); }
  const stuck = [...still.values()].filter((v) => v >= 3).length;
  return { alive: G.zombies.aliveCount(), stuckFor3s: stuck, samplesInsideVoxelWall: inside, samples, reachedPlayerSamples: reached, solids: G.vox && G.vox.street ? G.vox.street.debug().solids : 0, rebuildMs: G.vox && G.vox.street ? G.vox.street.debug().rebuildMs : 0, errs: __errors.slice(0, 4) }; })()`;
(async () => {
  const srv = await serve();
  const args = E.SWIFT ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'];
  const br = await require(E.PLAYWRIGHT_PATH || 'playwright-core').chromium.launch({ channel: 'chrome', headless: true, args: args.concat(['--disable-background-timer-throttling', '--disable-renderer-backgrounding']) });
  const rows = [];
  try {
    const cases = [];
    for (const [vp, touch] of [['1280x720', false], ['390x844', true]]) for (const q of ['low', 'medium']) for (const vox of [false, true]) { if (E.ONLY === 'vox' && !vox) continue; if (E.ONLY === 'base' && vox) continue; if (E.SWIFT && (vp === '1280x720' || q === 'medium')) continue; cases.push([vp, touch, q, vox]); }
    for (const [vp, touch, q, vox] of cases) {
      const [w, h] = vp.split('x').map(Number);
      const ctx = await br.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
      await ctx.addInitScript(() => localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'perf@t' })));
      const page = await ctx.newPage(); const bad = [];
      page.on('pageerror', (e) => bad.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) bad.push(m.text().slice(0, 200)); });
      await page.goto(srv.base + '/games/blockade-z/index.html?lang=vi&fp=1&autostart=1&nolock=1&noaudio=1&seed=4&hero=mua&tod=0.45&weather=clear&q=' + q + (vox ? '&vox=1' + (process.argv[2] || '') : ''));
      await page.waitForFunction('window.__ready === true', null, { timeout: 90000 });
      const n = await page.evaluate(STAGE); const m = await page.evaluate(MEASURE);
      const row = { gpu: E.SWIFT ? 'swiftshader' : 'd3d11', vp, q, vox, spawned: n, ...m, problems: bad.length }; rows.push(row); console.log(JSON.stringify(row)); if (bad.length) console.log('  ' + bad.slice(0, 3).join(' | '));
      if (vox && vp === '1280x720' && !E.SWIFT) { const p = await page.evaluate(PATH); console.log('path ' + q + ' ' + JSON.stringify(p)); }
      await ctx.close();
    }
  } catch (e) { console.log('FAIL ' + (e && e.stack || e)); }
  finally { await br.close(); srv.close(); clearTimeout(kill); }
})();
