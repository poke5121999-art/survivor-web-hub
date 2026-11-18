// Checks js/house3d.js in headless Chrome: boots every theme at house 1 and 5, reports draw calls / colliders / build ms / fps,
// walks the player through 3 doors, and saves screenshots. Exit code 1 on any failed assertion.
// Usage: node games/repo3d/tools/house3d.js [--theme vampire] [--house 5] [--out <dir>]
'use strict';
const fs = require('fs');
const path = require('path');
const { serve } = require('../../../tools/thumb-lib.js');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright-core';
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const OUT = arg('out', 'C:/Users/tamph/AppData/Local/Temp/claude/a7152a95eaa758f0/2613c385-53ad-43a0-b0d1-220c4a45bc0d/scratchpad/house3d');
const THEMES = arg('theme') ? [arg('theme')] : ['vampire', 'pyramid', 'vietnam', 'spacestation', 'asylum'];
const HOUSES = arg('house') ? [Number(arg('house'))] : [1, 5];
const SEED = Number(arg('seed', 7));
fs.mkdirSync(OUT, { recursive: true });

const failures = [];
const check = (ok, name, detail) => { if (!ok) failures.push(name); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`); };

// runs inside the page: BFS route from spawn to a room 3 doors away, follow it, report how far it got
const WALK = `(() => {
  const G = __G, h = G.house, L = h.layout, W = L.w, H = L.h, P = G.player;
  const jam = new Set(); for (const d of L.doors) if (d.jammed) for (let yy = d.y0; yy < d.y0 + d.zh; yy++) for (let xx = d.x0; xx < d.x0 + d.zw; xx++) jam.add(yy * W + xx);
  const walk = (x, y) => !jam.has(y * W + x) && x >= 0 && y >= 0 && x < W && y < H && (L.grid[y * W + x] === 1 || L.grid[y * W + x] === 3) && !L.block[y * W + x];
  const clear = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!walk(x + dx, y + dy)) return false; return true; };
  // room graph depth through doors
  const adj = new Map(); for (const d of L.doors) { (adj.get(d.a) || adj.set(d.a, []).get(d.a)).push(d.b); (adj.get(d.b) || adj.set(d.b, []).get(d.b)).push(d.a); }
  const depth = new Map([[0, 0]]); const q = [0];
  while (q.length) { const r = q.shift(); for (const n of adj.get(r) || []) if (!depth.has(n)) { depth.set(n, depth.get(r) + 1); q.push(n); } }
  let goalRoom = [...depth.entries()].filter(([, d]) => d === 3).map(([r]) => r)[0];
  if (goalRoom === undefined) goalRoom = [...depth.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const room = h.rooms[goalRoom];
  const sx = Math.floor(h.spawn.x), sy = Math.floor(h.spawn.z);
  const rr = L.rooms[goalRoom];
  const bfs = (ok) => {
    const prev = new Int32Array(W * H).fill(-2); prev[sy * W + sx] = -1; const qq = [sy * W + sx];
    for (let qi = 0; qi < qq.length; qi++) {
      const i = qq[qi], x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (ok(nx, ny) && prev[ny * W + nx] === -2) { prev[ny * W + nx] = i; qq.push(ny * W + nx); } }
    }
    let goal = -1, best = 1e9;
    for (let y = rr.y; y < rr.y + rr.h; y++) for (let x = rr.x; x < rr.x + rr.w; x++) { const i = y * W + x; if (prev[i] !== -2 && L.grid[i] === 1) { const d = Math.hypot(x + 0.5 - room.cx, y + 0.5 - room.cz); if (d < best) { best = d; goal = i; } } }
    if (goal < 0) return null; const path = []; for (let i = goal; i >= 0; i = prev[i]) path.push([i % W + 0.5, ((i / W) | 0) + 0.5]); return path.reverse();
  };
  const route = bfs((x, y) => walk(x, y) && clear(x, y)) || bfs(walk);
  if (!route) return { error: 'no route to room ' + goalRoom };
  const start = P.body.translation(); const s0 = { x: start.x, z: start.z };
  let idx = 1, stuckT = 0, lastX = s0.x, lastZ = s0.z, ticks = 0, stuck = false;
  const doorHit = new Set();
  const cmd = () => {
    const p = P.body.translation();
    for (let k = 0; k < h.doors.length; k++) if (Math.hypot(h.doors[k].x - p.x, h.doors[k].z - p.z) < 1.3) doorHit.add(k);
    while (idx < route.length - 1 && Math.hypot(route[idx][0] - p.x, route[idx][1] - p.z) < 0.55) idx++;
    const g = route[Math.min(idx, route.length - 1)];
    const dx = g[0] - p.x, dz = g[1] - p.z; let d = Math.atan2(-dx, -dz) - P.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    if (++ticks % 60 === 0) { if (Math.hypot(p.x - lastX, p.z - lastZ) < 0.25) stuckT++; else stuckT = 0; lastX = p.x; lastZ = p.z; if (stuckT >= 4 && idx < route.length - 3) stuck = true; }
    const done = idx >= route.length - 1 && Math.hypot(dx, dz) < 0.5;
    return { ...__IDLE, mz: done || Math.abs(d) > 0.6 ? 0 : 1, dyaw: -d * 0.25, sprint: false };
  };
  for (let s = 0; s < 14 && !stuck && !(idx >= route.length - 1); s++) __sim(5, cmd);
  const e = P.body.translation();
  return { goalRoom, depth: depth.get(goalRoom), routeLen: route.length, idx, moved: Math.hypot(e.x - s0.x, e.z - s0.z), doorsPassed: doorHit.size, stuck, simSeconds: ticks / 60, end: { x: e.x, z: e.z }, roomKind: room.kind };
})()`;

(async () => {
  const srv = await serve();
  const br = await require(PW).chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const kill = setTimeout(() => { console.log('FAIL timeout 180 s'); process.exit(2); }, 180000);
  const rows = [];
  try {
    for (const theme of THEMES) for (const hi of HOUSES) {
      const tag = `${theme}-h${hi}`;
      const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
      await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'x@test' })); } catch (e) {} });
      const page = await ctx.newPage();
      const logs = [];
      page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
      page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
      try {
        const t0 = Date.now();
        await page.goto(`${srv.base}/games/repo3d/index.html?house=${hi}&theme=${theme}&seed=${SEED}`);
        await page.waitForFunction('window.__ready === true || window.__fatal', null, { timeout: 60000 });
        const fatal = await page.evaluate('window.__fatal || null');
        check(!fatal, `${tag} boot`, fatal || `${((Date.now() - t0) / 1000).toFixed(1)}s wall`);
        if (fatal) continue;
        const info = await page.evaluate(`(() => { const h = __G.house; return { stats: h.stats, rooms: h.rooms.length, doors: h.doors.length, jammed: h.doors.filter(d => d.jammed).length, pads: h.pads.map(p => p.quota), kinds: h.rooms.map(r => r.kind) }; })()`);
        // spawn view
        await page.evaluate('window.__paused = false');
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(OUT, `${tag}-spawn.png`) });
        const calls0 = await page.evaluate('({ c: __G.renderer.info.render.calls, t: __G.renderer.info.render.triangles })');
        const f0 = await page.evaluate('__G.frames');
        await page.waitForTimeout(3000);
        const f1 = await page.evaluate('__G.frames');
        const fps = (f1 - f0) / 3;
        await page.evaluate('window.__paused = true');
        // walk
        const walk = await page.evaluate(WALK);
        check(!walk.error && walk.moved > 8 && !walk.stuck, `${tag} walk through doors`, JSON.stringify(walk));
        await page.evaluate('window.__paused = false');
        await page.waitForTimeout(1200);
        await page.screenshot({ path: path.join(OUT, `${tag}-walk-end.png`) });
        const calls1 = await page.evaluate('({ c: __G.renderer.info.render.calls, t: __G.renderer.info.render.triangles })');
        // second room view: pick the largest non-truck room
        await page.evaluate('window.__paused = true');
        await page.evaluate(`(() => { const h = __G.house; const r = h.rooms.filter(q => q.kind !== 'truck' && q.kind !== 'corridor').sort((a, b) => b.w * b.h - a.w * a.h)[0] || h.rooms[2];
          const P = __G.player; P.body.setTranslation({ x: r.cx, y: 0.85, z: r.cz }, true); P.yaw = 0.7; P.pitch = -0.12; __sim(0.3); })()`);
        await page.evaluate('window.__paused = false');
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(OUT, `${tag}-room.png`) });
        const calls2 = await page.evaluate('({ c: __G.renderer.info.render.calls, t: __G.renderer.info.render.triangles })');
        const errs = await page.evaluate('__errors.slice()');
        check(errs.length === 0 && logs.length === 0, `${tag} no console errors`, JSON.stringify(errs.concat(logs)).slice(0, 300));
        const calls = Math.max(calls0.c, calls1.c, calls2.c), tris = Math.max(calls0.t, calls1.t, calls2.t);
        rows.push({ tag, calls, tris, colliders: info.stats.worldColliders ?? info.stats.colliders, buildMs: Math.round(info.stats.buildMs), fps: +fps.toFixed(1), loot: info.stats.loot, quota: info.pads[0], rooms: info.rooms, doors: info.doors, jammed: info.jammed, walkMoved: +(walk.moved || 0).toFixed(1) });
        check(fps >= 30, `${tag} fps`, fps.toFixed(1));
      } catch (e) {
        check(false, `${tag} harness`, e.message);
      } finally {
        await ctx.close();
      }
    }
  } finally {
    clearTimeout(kill);
    await br.close();
    srv.close?.();
    console.table(rows);
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(rows, null, 1));
    console.log(failures.length ? `${failures.length} FAILED: ${failures.join('; ')}` : 'ALL PASS');
    process.exit(failures.length ? 1 : 0);
  }
})();
