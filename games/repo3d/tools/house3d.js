// Checks js/house3d.js in headless Chrome: boots every theme at house 1 and 5, reports draw calls / colliders / build ms / fps,
// walks the player through 3 doors, and saves screenshots. Exit code 1 on any failed assertion.
// Usage: node games/repo3d/tools/house3d.js [--theme vampire] [--house 5] [--out <dir>]
'use strict';
const fs = require('fs');
const path = require('path');
const { serve } = require('./serve.js');
const { launch: pwLaunch } = require('./pw.js');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const OUT = arg('out', require('./pw.js').scratch('house3d'));
const THEMES = arg('theme') ? [arg('theme')] : ['vampire', 'pyramid', 'vietnam', 'spacestation', 'asylum'];
const HOUSES = arg('house') ? [Number(arg('house'))] : [1, 5];
const SEED = Number(arg('seed', 7));
fs.mkdirSync(OUT, { recursive: true });

const failures = [];
const check = (ok, name, detail) => { if (!ok) failures.push(name); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`); };

// The house loads with foes=none: this walk checks walls, doors and the truck; a sleeping foe on the route would block it
// (foes passing doors is covered by tools/foes.js (h)).
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
  const sx = Math.floor(h.spawn.x), sy = Math.floor(h.spawn.z);
  let goalRoom, room, rr;
  const bfs = (ok) => {
    const prev = new Int32Array(W * H).fill(-2); prev[sy * W + sx] = -1; const qq = [sy * W + sx];
    for (let qi = 0; qi < qq.length; qi++) {
      const i = qq[qi], x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (L.hcell && !__G.floorsStep(i, ny * W + nx)) continue; if (ok(nx, ny) && prev[ny * W + nx] === -2) { prev[ny * W + nx] = i; qq.push(ny * W + nx); } }
    }
    let goal = -1, best = 1e9;
    for (let y = rr.y; y < rr.y + rr.h; y++) for (let x = rr.x; x < rr.x + rr.w; x++) { const i = y * W + x; if (prev[i] !== -2 && L.grid[i] === 1) { const d = Math.hypot(x + 0.5 - room.cx, y + 0.5 - room.cz); if (d < best) { best = d; goal = i; } } }
    if (goal < 0) return null; const path = []; for (let i = goal; i >= 0; i = prev[i]) path.push([i % W + 0.5, ((i / W) | 0) + 0.5]); return path.reverse();
  };
  // the room 3 doors deep (nearest to 3 when none) that is reachable without a jammed door
  let route = null;
  for (const [r] of [...depth.entries()].sort((a, b) => Math.abs(a[1] - 3) - Math.abs(b[1] - 3) || b[1] - a[1])) {
    if (r === 0) continue; goalRoom = r; room = h.rooms[r]; rr = L.rooms[r];
    route = bfs((x, y) => walk(x, y) && clear(x, y)) || bfs(walk); if (route) break;
  }
  if (!route) return { error: 'no route to any room' };
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
  return { goalRoom, depth: depth.get(goalRoom), routeLen: route.length, idx, moved: Math.hypot(e.x - s0.x, e.z - s0.z), doorsPassed: doorHit.size, stuck, simSeconds: ticks / 60, end: { x: e.x, z: e.z }, roomKind: room.kind, truck: G.truck && { x: +G.truck.x.toFixed(1), z: +G.truck.z.toFixed(1), yaw: +G.truck.yaw.toFixed(2) }, spawn: { x: h.spawn.x, z: h.spawn.z }, path3: route.slice(0, 6), near: { foes: (G.foes ? G.foes.list : []).filter((f) => !f.dead && Math.hypot(f.x - e.x, f.z - e.z) < 3).map((f) => [f.kind, f.state, +Math.hypot(f.x - e.x, f.z - e.z).toFixed(2)]), doors: h.doors.map((d, k) => [k, +Math.hypot(d.x - e.x, d.z - e.z).toFixed(2), d.jammed ? "J" : "", +(d.open ?? -1).toFixed(2), d.target]).filter((r) => r[1] < 3), next: route.slice(idx, idx + 3) } };
})()`;

// floors: walk up and back down every stair of the house (at most 3) with the walk key only; the feet must end on the
// room's floor height past the ramp, then back on the door's floor height
const STAIRS = `(() => {
  const G = __G, P = G.player, L = G.house.layout, C = { hh: 0, r: 0 }, out = [];
  const feet = () => { const t = P.body.translation(); return t.y - P.camPos.y + t.y; };
  for (const st of (L.stairs || []).slice(0, 3)) {
    const mid = st.axis === 0 ? (st.y0 + st.y1) / 2 : (st.x0 + st.x1) / 2, at = (u) => (st.axis === 0 ? { x: u, z: mid } : { x: mid, z: u });
    const a = at(st.e0 - st.sgn * 1.6), yawUp = st.axis === 0 ? Math.atan2(-st.sgn, 0) : Math.atan2(0, -st.sgn);
    const h0 = G.house.heightAt(a.x, a.z);
    G.house.unjam(st.door.x0 + st.door.zw / 2, st.door.y0 + st.door.zh / 2, 0.5);   // a jammed stair door (lockDoors) needs the pry bar
    const along = () => { const t = P.body.translation(); return ((st.axis === 0 ? t.x : t.z) - st.e0) * st.sgn; };
    const go = (stop) => (i) => ({ ...__IDLE, mz: stop() ? 0 : 1 });
    P.body.setTranslation({ x: a.x, y: h0 + 0.9, z: a.z }, true); P.body.setNextKinematicTranslation({ x: a.x, y: h0 + 0.9, z: a.z }); P.yaw = yawUp; P.pitch = 0; P.vy = 0; __sim(0.3);
    const f0 = __G.player.feetY ? __G.player.feetY() : null;
    const yA = P.body.translation().y;
    __sim(6, go(() => along() > 6 + 1.2));
    const t1 = P.body.translation(), gA = G.house.heightAt(t1.x, t1.z), yB = t1.y;
    P.yaw = yawUp + Math.PI; __sim(0.2);
    __sim(6, go(() => along() < -1.2));
    const t2 = P.body.translation(), gB = G.house.heightAt(t2.x, t2.z), yC = t2.y;
    out.push({ room: st.room, hD: st.hD, hS: st.hS, start: +(yA - 0.85).toFixed(2), up: +(yB - yA).toFixed(2), groundUp: +gA.toFixed(2), back: +(yC - yA).toFixed(2), groundBack: +gB.toFixed(2) });
  }
  return out; })()`;

(async () => {
  const srv = await serve();
  const br = await pwLaunch();
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
        await page.goto(`${srv.base}/games/repo3d/index.html?house=${hi}&theme=${theme}&seed=${SEED}&foes=none`);
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
        const sts = await page.evaluate(STAIRS);
        // feet on the floor under them (start + climbed = ground there) and that floor is the far level, then home again
        for (const r of sts) check(Math.abs(r.start + r.up - r.groundUp) < 0.2 && Math.abs(r.groundUp - r.hS) < 0.35 && Math.abs(r.start + r.back - r.groundBack) < 0.2 && Math.abs(r.groundBack - r.hD) < 0.35,
          `${tag} stair in room ${r.room}: walked ${r.hS > r.hD ? 'up' : 'down'} ${r.hS - r.hD} m and back`, JSON.stringify(r));
        if (hi > 1 || sts.length) check(sts.length > 0, `${tag} has stairs`, String(sts.length));
        await page.evaluate('window.__paused = false');
        await page.waitForTimeout(1200);
        await page.screenshot({ path: path.join(OUT, `${tag}-walk-end.png`) });
        const calls1 = await page.evaluate('({ c: __G.renderer.info.render.calls, t: __G.renderer.info.render.triangles })');
        // second room view: pick the largest non-truck room
        await page.evaluate('window.__paused = true');
        await page.evaluate(`(() => { const h = __G.house; const r = h.rooms.filter(q => q.kind !== 'truck' && q.kind !== 'corridor').sort((a, b) => b.w * b.h - a.w * a.h)[0] || h.rooms[2];
          const P = __G.player, y0 = h.heightAt(r.cx, r.cz); P.body.setTranslation({ x: r.cx, y: y0 + 0.85, z: r.cz }, true); P.yaw = 0.7; P.pitch = -0.12; __sim(0.3); })()`);
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
