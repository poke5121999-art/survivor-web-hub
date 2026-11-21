// First-person proof clip (batch 6f item 7): a scripted run, one sim step of 1/30 s per frame, each frame screenshotted with
// a time stamp and the segment's name drawn on the page, then joined into an mp4 by ffmpeg (30 fps, so clip time = sim time).
// Segments: walk through a furnished room, jumps, grab a light then a heavy item, push the cart through a door and up a stair,
// punch a foe, punch a wall, punch loot.
// Usage: node tools/clip.js [--house 3] [--seed 7] [--theme vampire] [--out <file.mp4>]
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { serve } = require('./serve.js');
const { launch: pwLaunch, scratch } = require('./pw.js');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const HOUSE = +arg('--house', 3), SEED = +arg('--seed', 7), THEME = arg('--theme', 'vampire');
const DIR = scratch('clip'), OUT = arg('--out', path.join(DIR, `fp-${THEME}-h${HOUSE}.mp4`));

const DIRECTOR = `(() => {
  const G = __G, P = G.player, nav = G.foes.nav, L = G.house.layout, W = L.w, C = G.cart, R = G.phys.R;
  window.__paused = true;
  const ov = document.createElement('div'); ov.style.cssText = 'position:fixed;left:12px;top:10px;z-index:99;font:600 20px/1.3 system-ui,sans-serif;color:#fff;background:rgba(0,0,0,.55);padding:4px 10px;border-radius:6px;pointer-events:none';
  document.body.appendChild(ov);
  const V = (x, y, z) => new (P.camPos.constructor)(x, y, z);
  const put = (x, z, yaw, pitch = 0) => { const h = G.house.heightAt(x, z); P.body.setTranslation({ x, y: h + 0.85, z }, true); P.body.setNextKinematicTranslation({ x, y: h + 0.85, z }); P.vy = 0; P.hv = { x: 0, z: 0 }; P.yaw = yaw; P.pitch = pitch; __sim(0.05); };
  const yawTo = (x, z) => Math.atan2(-(x - P.position.x), -(z - P.position.z));
  const turnTo = (want, k = 0.25) => { let d = want - P.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); return -d * k; };
  const pitchTo = (y, x, z, k = 0.25) => { const c = P.camPos; const want = Math.atan2(y - c.y, Math.hypot(x - c.x, z - c.z)); return (P.pitch - want) * k; };
  const roomOfCell = (x, y) => L.rooms.findIndex((r) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h);
  const route = (sx, sy, tx, ty) => { const N = W * L.h, dist = new Float32Array(N).fill(1e9), prev = new Int32Array(N).fill(-1), s0 = sy * W + sx, t0 = ty * W + tx, open = [s0]; dist[s0] = 0;
    while (open.length) { let bi = 0; for (let k = 1; k < open.length; k++) if (dist[open[k]] < dist[open[bi]]) bi = k; const i = open[bi]; open[bi] = open[open.length - 1]; open.pop(); if (i === t0) break;
      const x = i % W, y = Math.floor(i / W); for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) { if (!nav.ok(nx, ny)) continue; const j = ny * W + nx; if (!nav.step(i, j)) continue;
        const c = dist[i] + 1 + (nav.near[j] === 1 ? 6 : nav.near[j] === 2 ? 2 : 0); if (c < dist[j]) { if (dist[j] >= 1e9) open.push(j); dist[j] = c; prev[j] = i; } } }
    if (dist[t0] >= 1e9) return null; const out = []; for (let i = t0; i !== -1; i = prev[i]) out.push({ x: i % W + 0.5, z: Math.floor(i / W) + 0.5 }); return out.reverse(); };
  const see = (a, q) => { const dx = q.x - a.x, dz = q.z - a.z, d = Math.hypot(dx, dz); if (d < 0.3) return true; const ux = dx / d, uz = dz / d; let hp = G.house.heightAt(a.x, a.z);
    for (let u = 0.25; u <= d + 0.01; u += 0.25) { const x = a.x + ux * u, z = a.z + uz * u, h = G.house.heightAt(x, z); if (Math.abs(h - hp) > 0.2) return false; hp = h;
      for (const w of [-0.46, 0, 0.46]) { const px = x - uz * w, pz = z + ux * w; if (!nav.okW(px, pz) || Math.abs(G.house.heightAt(px, pz) - h) > 0.2) return false; } } return true; };
  const openNear = (x0, z0, ahead = 3) => { let best = null, bd = 1e9; for (const i of nav.cells) { if (nav.near[i] < 3) continue; const c = nav.center(i); const d = Math.hypot(c.x - x0, c.z - z0); if (d > bd) continue;
      for (let k = 0; k < 4; k++) { const dx = [0, 1, 0, -1][k], dz = [-1, 0, 1, 0][k]; let ok = true; for (let u = 0.5; u <= ahead && ok; u += 0.5) for (const w of [-0.8, 0, 0.8]) if (!nav.okW(c.x + dx * u - dz * w, c.z + dz * u + dx * w)) ok = false;
        if (ok && Math.abs(G.house.heightAt(c.x + dx * ahead, c.z + dz * ahead) - G.house.heightAt(c.x, c.z)) < 0.01) { bd = d; best = { x: c.x, z: c.z, yaw: Math.atan2(-dx, -dz) }; break; } } } return best; };
  const segs = []; let cartDoors = 0, cartLoad = [];
  let t = 0, label = '';
  // 1. walk through the room with the most furniture
  segs.push(function* walk() {
    label = 'đi qua phòng có decor';
    const cnt = L.rooms.map(() => 0); for (const pr of G.house.props) { const ri = roomOfCell(Math.floor(pr.x), Math.floor(pr.z)); if (ri >= 0 && pr.blocks) cnt[ri]++; }
    let best = -1; for (let i = 1; i < cnt.length; i++) if (best < 0 || cnt[i] > cnt[best]) best = i;
    const r = L.rooms[best], cells = [];
    for (let y = r.y + 1; y < r.y + r.h - 1; y++) for (let x = r.x + 1; x < r.x + r.w - 1; x++) if (nav.ok(x, y) && nav.near[y * W + x] >= 2) cells.push({ x: x + 0.5, z: y + 0.5 });
    let start = cells[0], b = cells[cells.length - 1], bd = 0; for (let a = 0; a < cells.length; a += 3) for (let k = cells.length - 1; k > a; k -= 3) { const d = Math.hypot(cells[a].x - cells[k].x, cells[a].z - cells[k].z); if (d > bd) { bd = d; start = cells[a]; b = cells[k]; } }
    put(start.x, start.z, yawTo(b.x, b.z), -0.08);
    const sc = nav.nearest(start.x, start.z, 3), ec = nav.nearest(b.x, b.z, 3); const path = route(sc % W, Math.floor(sc / W), ec % W, Math.floor(ec / W)) || [b]; let idx = 0;
    for (let f = 0; f < 260; f++) { const p = P.position; while (idx < path.length - 1 && Math.hypot(path[idx].x - p.x, path[idx].z - p.z) < 0.7) idx++; const w = path[idx], la = path[Math.min(path.length - 1, idx + 2)];
      if (idx >= path.length - 1 && Math.hypot(w.x - p.x, w.z - p.z) < 0.5) break; yield { mz: 1, dyaw: turnTo(yawTo(la.x, la.z), 0.15), dpitch: (P.pitch + 0.08) * 0.2 }; }
    for (let f = 0; f < 12; f++) yield {};
  });
  // 2. jumps: on the spot, forward, onto something low if one is near
  segs.push(function* jumps() {
    label = 'nhảy (coyote, nhớ phím, trên không 60 %)';
    { const q = openNear(P.position.x, P.position.z, 4); if (q) put(q.x, q.z, q.yaw, -0.05); }
    for (let k = 0; k < 2; k++) { yield { jump: true }; for (let f = 0; f < 24; f++) yield {}; }
    yield { mz: 1, jump: true }; for (let f = 0; f < 26; f++) yield { mz: 1, mx: f > 10 ? 1 : 0 }; for (let f = 0; f < 10; f++) yield {};
  });
  // 3. grab a light item, swing the view, drop it; then a heavy one
  const spawnAhead = (material, size, d) => { const f = P.forward(V()); const fl = Math.hypot(f.x, f.z) || 1; const x = P.position.x + f.x / fl * d, z = P.position.z + f.z / fl * d;
    const it = G.loot.spawn({ material, size, value: size === 'big' ? 6000 : 800, pos: { x, y: G.house.heightAt(x, z) + 0.5, z } }); __sim(0.6); return it; };
  segs.push(function* grabLight() {
    label = 'cầm đồ nhẹ bằng tia';
    const o = openNear(P.position.x, P.position.z, 3) || { ...nav.center(nav.nearest(P.position.x, P.position.z, 4)), yaw: P.yaw }; put(o.x, o.z, o.yaw, 0);
    const it = spawnAhead('ceramic', 'small', 1.7); for (let f = 0; f < 14; f++) { const q = it.body.translation(); yield { dyaw: turnTo(yawTo(q.x, q.z)), dpitch: pitchTo(q.y, q.x, q.z) }; }
    yield { grab: true, grabPressed: true };
    for (let f = 0; f < 20; f++) yield { grab: true, dpitch: (P.pitch - 0.05) * 0.2 };
    for (let f = 0; f < 22; f++) yield { grab: true, dyaw: 0.05 };
    for (let f = 0; f < 22; f++) yield { grab: true, dyaw: -0.05 };
    for (let f = 0; f < 10; f++) yield { grab: true };
    yield {}; for (let f = 0; f < 18; f++) yield {};
    label = 'cầm đồ nặng (trễ theo khối lượng)';
    { const q = openNear(P.position.x + 3, P.position.z, 3) || o; put(q.x, q.z, q.yaw, 0); } const big = spawnAhead('metal', 'big', 1.9); for (let f = 0; f < 14; f++) { const q = big.body.translation(); yield { dyaw: turnTo(yawTo(q.x, q.z)), dpitch: pitchTo(q.y, q.x, q.z) }; }
    yield { grab: true, grabPressed: true };
    for (let f = 0; f < 30; f++) yield { grab: true, dpitch: (P.pitch - 0.0) * 0.15 };
    for (let f = 0; f < 30; f++) yield { grab: true, dyaw: 0.03, mz: -0.6 };
    yield {}; for (let f = 0; f < 15; f++) yield {};
  });
  // 4. the cart: through a door and up a stair
  segs.push(function* cart() {
    label = 'đẩy xe chở 3 món qua 2 cửa, lên cầu thang';
    const st = (L.stairs || [])[0]; if (!st || !C) return;
    const mid = st.axis === 0 ? (st.y0 + st.y1) / 2 : (st.x0 + st.x1) / 2, at = (u) => (st.axis === 0 ? { x: u, z: mid } : { x: mid, z: u });
    const lowEnd = st.hD < st.hS ? st.e0 - st.sgn * 1.5 : st.e0 + st.sgn * 7.5, highEnd = st.hD < st.hS ? st.e0 + st.sgn * 7.5 : st.e0 - st.sgn * 1.5;
    const top = at(highEnd), bot = at(lowEnd); const tc = nav.nearest(top.x, top.z, 3), bc = nav.nearest(bot.x, bot.z, 3); if (tc < 0 || bc < 0) return;
    const stairRoom = roomOfCell(bc % W, Math.floor(bc / W));
    // a start whose cart route to the top of the stair passes through 2 doors (BFS out from the ramp's foot, every 4th cell tried)
    const doorCells = new Set(G.house.doorRecs.map((d) => Math.floor(d.cz) * W + Math.floor(d.cx)));
    const doorsOn = (pth) => { const seen = new Set(); for (const p of pth) for (const d of G.house.doorRecs) if (Math.hypot(d.cx - p.x, d.cz - p.z) < 0.8) seen.add(d); return seen.size; };
    const N = W * L.h, dist = new Int32Array(N).fill(-1), q = [bc]; dist[bc] = 0; let path = null, tried = 0, best = null;
    for (let h = 0; h < q.length && !path && tried < 120; h++) { const i = q[h], x = i % W, y = Math.floor(i / W); for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) { if (!nav.ok(nx, ny)) continue; const j = ny * W + nx; if (dist[j] >= 0 || !nav.step(i, j)) continue; dist[j] = dist[i] + 1; q.push(j);
      if (dist[j] >= 8 && nav.near[j] >= 3 && !doorCells.has(j) && dist[j] % 4 === 0) { tried++; const pth = route(nx, ny, tc % W, Math.floor(tc / W)); if (!pth) continue; const nd = doorsOn(pth); if (nd >= 2) { path = pth; break; } if (!best || nd > best.nd) best = { nd, pth }; } } }
    path = path || best?.pth; if (!path) return; cartDoors = doorsOn(path);
    const s0 = path[0], s1 = path[Math.min(3, path.length - 1)], dl = Math.hypot(s1.x - s0.x, s1.z - s0.z) || 1, ux = (s1.x - s0.x) / dl, uz = (s1.z - s0.z) / dl;
    if (G.grab.held) G.grab.release(false);
    const hC = G.house.heightAt(s0.x, s0.z); C.body.setTranslation({ x: s0.x, y: hC + 0.15, z: s0.z }, true); C.body.setRotation({ x: 0, y: Math.sin(Math.atan2(-uz, ux) / 2), z: 0, w: Math.cos(Math.atan2(-uz, ux) / 2) }, true); C.body.setLinvel({ x: 0, y: 0, z: 0 }, true); C.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    put(s0.x - ux * 1.9, s0.z - uz * 1.9, Math.atan2(ux, uz) + Math.PI, -0.2); __sim(0.3);
    { const ct = C.body.translation(), cy = Math.cos(Math.atan2(-uz, ux)), sy = Math.sin(Math.atan2(-uz, ux)), lp = (lx, lz) => ({ x: ct.x + lx * cy + lz * sy, z: ct.z - lx * sy + lz * cy });   // three items in the tub
      cartLoad = [['wood', 'medium', 0.27, 0], ['ceramic', 'small', -0.3, 0.16], ['metal', 'small', -0.3, -0.16]].map(([mat, size, lx, lz]) => { const p = lp(lx, lz); return G.loot.spawn({ material: mat, size, value: 2500, pos: { x: p.x, y: ct.y + 0.75, z: p.z } }); }); __sim(1.2); }
    for (let f = 0; f < 10; f++) { const b = C.bar.translation(); yield { dyaw: turnTo(yawTo(b.x, b.z)), dpitch: pitchTo(b.y, b.x, b.z) }; }
    yield { grab: true, grabPressed: true };
    let idx = 0, upT = 0;
    for (let f = 0; f < 1200; f++) {
      const cp = C.body.translation(); { let bd = 1e9, bi = idx; for (let k = idx; k < Math.min(path.length, idx + 8); k++) { const dd = Math.hypot(path[k].x - cp.x, path[k].z - cp.z); if (dd < bd) { bd = dd; bi = k; } } idx = bi; }
      if (idx >= path.length - 2) break; if (cp.y > Math.max(st.hD, st.hS) - 0.2 + G.house.heightAt(cp.x, cp.z) * 0 && G.house.heightAt(cp.x, cp.z) >= Math.max(st.hD, st.hS) - 0.05) { upT = (upT || 0) + 1; if (upT > 40) break; }
      let wi = idx, arc = 0; while (wi < path.length - 1 && arc < 2) { arc += Math.hypot(path[wi + 1].x - path[wi].x, path[wi + 1].z - path[wi].z); wi++; } while (wi > idx + 1 && !see(cp, path[wi])) wi--; const wp = path[wi];   // look along the corridor, round the corner once there (as cartdrive.js)
      const pp = P.position, pi = (() => { let b = 0, bd = 1e9; for (let k = Math.max(0, idx - 14); k <= idx; k++) { const d2 = Math.hypot(path[k].x - pp.x, path[k].z - pp.z) + Math.abs(G.house.heightAt(path[k].x, path[k].z) - (pp.y - 0.83)) * 3; if (d2 < bd) { bd = d2; b = k; } } return b; })(), bk = path[Math.min(pi + 2, Math.max(pi, idx - 1))], dd = Math.hypot(cp.x - pp.x, cp.z - pp.z) || 1, tgt = dd > 1.4 && Math.hypot(bk.x - pp.x, bk.z - pp.z) > 0.4 && pi < idx - 1 ? bk : cp, dx = tgt.x - pp.x, dz = tgt.z - pp.z, dm = Math.hypot(dx, dz) || 1, sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);   // walk the route behind the cart (a straight line to the cart cuts door jambs)
      let lag = 0; if (G.grab.held === C.rec) { const a = G.grab.anchorWorld(V()), tg = P.camPos.clone().addScaledVector(P.forward(V()), G.grab.dist), fw = P.forward(V()), fl = Math.hypot(fw.x, fw.z) || 1, ex = tg.x - a.x, ez = tg.z - a.z; lag = Math.max((ex * fw.x + ez * fw.z) / fl, Math.abs(ex * fw.z - ez * fw.x) / fl); } else { yield { grab: false }; const b = C.bar.translation(); P.yaw = yawTo(b.x, b.z); yield { grab: true, grabPressed: true }; continue; }
      const go = lag > 0.7 || dd < 1.0 ? 0 : 1;
      yield { grab: true, mz: go * (dx / dm * -sy + dz / dm * -cy), mx: go * (dx / dm * cy + dz / dm * -sy), dyaw: Math.max(-0.08, Math.min(0.08, turnTo(yawTo(wp.x, wp.z), 0.3))), dpitch: (P.pitch + 0.2) * 0.2 };
    }
    for (let f = 0; f < 10; f++) yield { grab: true };
    const cp2 = C.body.translation(); window.__clipInfo = { cartDoors, loadLeft: cartLoad.filter((it) => !it.dead && C.load().includes(it)).length, up: +(cp2.y - C.body.translation().y).toFixed(2), cartH: +G.house.heightAt(cp2.x, cp2.z).toFixed(2), topH: Math.max(st.hD, st.hS) };
    yield {}; for (let f = 0; f < 8; f++) yield {};
  });
  // 5-7. punches: a foe, a wall, loot
  const punch = function* (n) { for (let k = 0; k < n; k++) { yield { melee: true }; for (let f = 0; f < 13; f++) yield {}; } };
  segs.push(function* punches() {
    label = 'đấm quái (lệch tâm, tầm 1,6 m)';
    const o = nav.center(nav.nearest(P.position.x, P.position.z, 4)); let spot = null;
    for (const i of nav.cells) { if (nav.near[i] < 3) continue; const c = nav.center(i); if (Math.hypot(c.x - o.x, c.z - o.z) > 25) continue; let ok = true; for (let u = 0.5; u <= 3 && ok; u += 0.5) if (!nav.okW(c.x, c.z - u)) ok = false; if (ok) { spot = c; break; } }
    spot = spot || o; put(spot.x, spot.z, 0, -0.05);
    const f = G.foes.spawn('mummy', spot.x, spot.z - 1.9, { sleep: 99 }); f.hp = f.maxHp = 400; f.yaw = Math.PI;
    for (let k = 0; k < 6; k++) yield { dyaw: 0.012 };
    yield* punch(4); for (let k = 0; k < 12; k++) yield {};
    G.foes.remove(f);
    label = 'đấm tường';
    let wall = null; for (let a = 0; a < 8 && !wall; a++) { const dx = Math.cos(a * 0.785), dz = Math.sin(a * 0.785); P.yaw = Math.atan2(-dx, -dz); P.pitch = 0; __sim(1 / 60);
      const h = G.phys.world.castRay(new R.Ray(P.camPos, P.forward(V())), 6, true, R.QueryFilterFlags.EXCLUDE_SENSORS | R.QueryFilterFlags.EXCLUDE_DYNAMIC | R.QueryFilterFlags.EXCLUDE_KINEMATIC, undefined, P.col);
      const nearTruck = G.truck && h && Math.hypot(P.camPos.x + P.forward(V()).x * h.timeOfImpact - G.truck.x, P.camPos.z + P.forward(V()).z * h.timeOfImpact - G.truck.z) < 7;
      if (h && h.timeOfImpact > 1.3 && !nearTruck && !G.house.props.some((pr) => pr.bodies.some((bb) => bb.handle === h.collider.parent().handle))) { const u = h.timeOfImpact - 1.0, x = P.position.x + dx * u, z = P.position.z + dz * u; if (nav.okW(x, z)) wall = { x, z, yaw: Math.atan2(-dx, -dz) }; } }
    if (wall) { put(wall.x, wall.z, wall.yaw, 0); for (let k = 0; k < 8; k++) yield {}; yield* punch(2); }
    // three loot sizes one after another, one plain punch each, a second to watch it land; then a closed door
    const lootFx = [];
    for (const [mat, size, name] of [['ceramic', 'small', 'nhỏ'], ['wood', 'medium', 'vừa'], ['metal', 'big', 'to']]) {
      label = 'đấm loot ' + name + ' (' + mat + ')';
      put(spot.x, spot.z, 0, -0.35); const it = spawnAhead(mat, size, size === 'big' ? 1.35 : 1.15); it.spawnedAt = -99; const q0 = { ...it.body.translation() };
      for (let f2 = 0; f2 < 10; f2++) { const q = it.body.translation(); yield { dyaw: turnTo(yawTo(q.x, q.z)), dpitch: pitchTo(q.y, q.x, q.z) }; }
      yield { melee: true }; let far = 0; for (let k = 0; k < 40; k++) { yield {}; if (!it.dead) { const p2 = it.body.translation(); far = Math.max(far, Math.hypot(p2.x - q0.x, p2.z - q0.z)); } }
      lootFx.push(name + ' ' + far.toFixed(1) + ' m'); if (!it.dead) G.loot.destroy(it, false); }
    label = 'đấm cửa (bật mở)';
    { let dd = null; for (const d of G.house.doorRecs) { if (d.jammed || dd) continue; for (const [nx, nz] of [[1, 0], [0, 1]]) for (const sg of [-1, 1]) { if (dd) continue; const x = d.cx + nx * sg * 1.3, z = d.cz + nz * sg * 1.3; if (nav.okW(x, z) && Math.hypot(x - spot.x, z - spot.z) < 40) dd = { d, x, z, yaw: Math.atan2(nx * sg, nz * sg) }; } }
      if (dd) { put(dd.x, dd.z, dd.yaw, -0.1); dd.d.open = 0; dd.d.target = 0; yield { melee: true }; for (let k = 0; k < 30; k++) yield {}; } }
    window.__clipInfo = { ...(window.__clipInfo || {}), loot: lootFx };
  });
  let si = 0, gen = null;
  window.__D = { next() {
    while (true) {
      if (!gen) { if (si >= segs.length) return { done: true, t }; gen = segs[si++](); }
      const r = gen.next(); if (r.done) { gen = null; continue; }
      G.lastRender = performance.now() - 1000 / 30;
      const cmd = { ...__IDLE, ...r.value }; __sim(1 / 30, (i) => (i === 0 ? cmd : { ...cmd, jump: false, grabPressed: false, melee: cmd.melee && false }));
      t += 1 / 30; const s = Math.floor(t), cs = Math.floor((t - s) * 10);
      ov.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0') + '.' + cs + '  ' + label;
      return { done: false, t, label };
    } } };
  return true; })()`;

(async () => {
  fs.rmSync(DIR, { recursive: true, force: true }); fs.mkdirSync(DIR, { recursive: true });
  const srv = await serve(); const br = await pwLaunch();
  const kill = setTimeout(() => { console.log('FAIL timeout 900 s'); process.exit(2); }, 900000);
  let n = 0;
  try {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'x@test' })); } catch (e) { /* private */ } });
    const page = await ctx.newPage(); const errs = []; page.on('console', (m) => { if (m.text().startsWith('cartdbg')) console.log(m.text()); }); page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(srv.base + `/games/repo3d/index.html?house=${HOUSE}&seed=${SEED}&theme=${THEME}&foes=none&bots=0&traps=0`);
    await page.waitForFunction('window.__ready === true || window.__fatal', null, { timeout: 60000 });
    await page.evaluate('window.__paused = true; __sim(1)');
    await page.evaluate(DIRECTOR);
    const marks = [];
    for (;;) {
      const r = await page.evaluate('__D.next()'); if (r.done) break;
      if (!marks.length || marks[marks.length - 1].label !== r.label) marks.push({ t: +r.t.toFixed(1), label: r.label });
      await page.screenshot({ path: path.join(DIR, `f${String(n).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 85 }); n++;
      if (n > 2400) break;
    }
    const info = await page.evaluate('window.__clipInfo');
    await ctx.close();
    console.log('info ' + JSON.stringify(info));
    console.log(`frames ${n} (${(n / 30).toFixed(1)} s)${errs.length ? '; page errors: ' + errs.slice(0, 3).join(' | ') : ''}`);
    for (const m of marks) console.log(`  ${String(m.t).padStart(5)} s  ${m.label}`);
  } catch (e) { console.log('FAIL run ' + e.message.slice(0, 300)); }
  clearTimeout(kill); await br.close(); srv.close();
  if (n) {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(DIR, 'f%05d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', OUT], { timeout: 300000 });
    console.log('clip ' + OUT);
  }
})();
