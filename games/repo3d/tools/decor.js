// Decor colliders vs the decor's real shape (batch 6f, owner: "decor blocks the way, the box does not hug the model").
// For every furniture prop of houses 1-5 in the 5 themes: points on each of its colliders' surfaces, the distance each lies
// outside the union of the primitives furnish() drew (house3d.js Frame parts: boxes, cylinders, ellipsoids). The gate:
// no collider sticks out more than 3 cm. Also: floor share free of props per room (mean and lowest) and props per house.
// Usage: node tools/decor.js [--gate] [--houses 1,2,3,4,5] [--seed 7]
'use strict';
const { serve } = require('./serve.js');
const { launch: pwLaunch } = require('./pw.js');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const HOUSES = arg('--houses', '1,2,3,4,5').split(',').map(Number), SEED = +arg('--seed', 7), GATE = argv.includes('--gate');
const THEMES = ['vampire', 'pyramid', 'vietnam', 'spacestation', 'asylum'];

const MEASURE = `(() => { const G = __G, R = G.phys.R, H = G.house, L = H.layout, out = { props: 0, cols: 0, worst: [], over3: 0, max: 0, sum: 0, n: 0 };
  const sdf = (p, q, y0) => { // distance of point q outside primitive p (negative inside), p.y floor-relative
    if (p.t === 'box') { const dx = Math.max(p.x0 - q.x, q.x - p.x1, 0), dy = Math.max(p.y0 + y0 - q.y, q.y - (p.y1 + y0), 0), dz = Math.max(p.z0 - q.z, q.z - p.z1, 0);
      if (dx || dy || dz) return Math.hypot(dx, dy, dz); return -Math.min(q.x - p.x0, p.x1 - q.x, q.y - p.y0 - y0, p.y1 + y0 - q.y, q.z - p.z0, p.z1 - q.z); }
    if (p.t === 'cyl') { const t = Math.max(0, Math.min(1, (q.y - p.y - y0) / p.h)), r = p.r0 + (p.r1 - p.r0) * t, rad = Math.hypot(q.x - p.x, q.z - p.z) - r;
      const vy = Math.max(p.y + y0 - q.y, q.y - (p.y + y0 + p.h)); return Math.max(rad, vy) > 0 ? Math.hypot(Math.max(rad, 0), Math.max(vy, 0)) : Math.max(rad, vy); }
    const k = Math.hypot((q.x - p.x) / p.rx, (q.y - p.y - y0) / p.ry, (q.z - p.z) / p.rz); return (k - 1) * Math.min(p.rx, p.ry, p.rz); };
  const pts = (c) => { const sh = c.shape, t = c.translation(), r = c.rotation(), rot = (v) => { const x = v.x, y = v.y, z = v.z, qx = r.x, qy = r.y, qz = r.z, qw = r.w;
      const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
      return { x: ix * qw + iw * -qx + iy * -qz - iz * -qy + t.x, y: iy * qw + iw * -qy + iz * -qx - ix * -qz + t.y, z: iz * qw + iw * -qz + ix * -qy - iy * -qx + t.z }; };
    const o = [];
    if (sh.halfExtents) { const h = sh.halfExtents, b = sh.borderRadius || 0, hx = h.x + b, hy = h.y + b, hz = h.z + b; const N = 4;
      for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) { const a = -1 + 2 * i / N, c2 = -1 + 2 * j / N;
        for (const s of [-1, 1]) { o.push(rot({ x: s * hx, y: a * hy, z: c2 * hz })); o.push(rot({ x: a * hx, y: s * hy, z: c2 * hz })); o.push(rot({ x: a * hx, y: c2 * hy, z: s * hz })); } }
      if (b) for (const q of o) { /* rounded edges: pull corner samples in by the radius */ } }
    else if (sh.vertices) { const v = sh.vertices; for (let i = 0; i < v.length; i += 3) o.push(rot({ x: v[i], y: v[i + 1], z: v[i + 2] })); }
    else if (sh.radius !== undefined && sh.halfHeight !== undefined) { for (let a = 0; a < 12; a++) for (const yy of [-1, 0, 1]) o.push(rot({ x: Math.cos(a / 12 * 6.283) * sh.radius, y: yy * sh.halfHeight, z: Math.sin(a / 12 * 6.283) * sh.radius })); }
    else if (sh.radius !== undefined) { for (let a = 0; a < 12; a++) for (const yy of [-1, -0.5, 0, 0.5, 1]) { const rr = Math.sqrt(1 - yy * yy) * sh.radius; o.push(rot({ x: Math.cos(a / 12 * 6.283) * rr, y: yy * sh.radius, z: Math.sin(a / 12 * 6.283) * rr })); } }
    return o; };
  for (const pr of H.props) {
    if (!pr.bodies || !pr.bodies.length || !pr.parts.length) continue; out.props++;
    let worst = 0;
    for (const b of pr.bodies) for (let i = 0; i < b.numColliders(); i++) { const c = b.collider(i); out.cols++;
      for (const q of pts(c)) { let d = 1e9; for (const p of pr.parts) d = Math.min(d, sdf(p, q, pr.y0)); worst = Math.max(worst, d); } }
    out.max = Math.max(out.max, worst); out.sum += worst; out.n++; if (worst > 0.03) out.over3++;
    out.worst.push([+worst.toFixed(3), pr.n]);
  }
  out.worst.sort((a, b) => b[0] - a[0]); out.worst = out.worst.slice(0, 4); out.mean = +(out.sum / Math.max(1, out.n)).toFixed(3); out.max = +out.max.toFixed(3);
  // free floor per room: walkable floor cells not covered by a blocking prop, over the room's floor cells
  const free = []; for (const r of L.rooms) { let n = 0, f = 0; for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { const g = L.grid[y * L.w + x]; if (g !== 1) continue; n++; if (!L.block[y * L.w + x]) f++; } if (n > 8) free.push(f / n); }
  // every room: its doors joined by 2x2 free squares (a path >= 1.5 m wide)
  let rOk = 0, rAll = 0; const W = L.w;
  for (let ri = 0; ri < L.rooms.length; ri++) { const r = L.rooms[ri], doors = (L.doors || []).filter((d) => d.a === ri || d.b === ri); if (doors.length < 2) continue; rAll++;
    const inR = (x, y) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h && (L.grid[y * W + x] === 1 || L.grid[y * W + x] === 3) && !L.block[y * W + x];
    const sq = (x, y) => inR(x, y) && inR(x + 1, y) && inR(x, y + 1) && inR(x + 1, y + 1);
    const entry = (d) => { const o = []; for (let y = d.y0 - 2; y <= d.y0 + d.zh + 1; y++) for (let x = d.x0 - 2; x <= d.x0 + d.zw + 1; x++) if (sq(x, y)) o.push(y * W + x); return o; };
    const seen = new Set(entry(doors[0])), st = [...seen]; while (st.length) { const i = st.pop(), x = i % W, y = Math.floor(i / W); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = (y + dy) * W + x + dx; if (!seen.has(j) && sq(x + dx, y + dy)) { seen.add(j); st.push(j); } } }
    if (seen.size && doors.slice(1).every((d) => entry(d).some((i) => seen.has(i)))) rOk++; }
  out.paths = rOk + '/' + rAll; out.pathsBad = rAll - rOk;
  out.freeMean = +(free.reduce((a, b) => a + b, 0) / free.length).toFixed(3); out.freeMin = +Math.min(...free).toFixed(3); out.nProps = H.props.length; out.nBlocking = H.props.filter((p) => p.blocks).length;
  delete out.sum; delete out.n; return out; })()`;

(async () => {
  const srv = await serve(); const br = await pwLaunch();
  const kill = setTimeout(() => { console.log('FAIL timeout 600 s'); process.exit(2); }, 600000);
  const rows = []; let bad = 0;
  try {
    for (const theme of THEMES) for (const hi of HOUSES) {
      const ctx = await br.newContext({ viewport: { width: 640, height: 360 } });
      await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'x@test' })); } catch (e) { /* private */ } });
      const page = await ctx.newPage();
      await page.goto(srv.base + `/games/repo3d/index.html?house=${hi}&seed=${SEED}&foes=none&bots=0&traps=0&theme=${theme}`);
      await page.waitForFunction('window.__ready === true || window.__fatal', null, { timeout: 60000 });
      await page.evaluate('window.__paused = true; __sim(0.1)');
      const r = await page.evaluate(MEASURE); r.tag = `${theme}-h${hi}`; rows.push(r);
      console.log(`${r.tag}: props ${r.nProps} (blocking ${r.nBlocking}), colliders ${r.cols}, stick-out max ${(r.max * 100).toFixed(1)} cm mean ${(r.mean * 100).toFixed(1)} cm, over 3 cm ${r.over3}/${r.props}; free floor mean ${(r.freeMean * 100).toFixed(0)} % min ${(r.freeMin * 100).toFixed(0)} %, door paths 1.5 m ${r.paths}; worst ${JSON.stringify(r.worst)}`);
      if (r.max > 0.03) bad++;
      await ctx.close();
    }
  } catch (e) { console.log('FAIL run ' + e.message.slice(0, 300)); bad++; }
  clearTimeout(kill); await br.close(); srv.close();
  const all = (k) => rows.map((r) => r[k]);
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  console.log(`\nTOTAL houses ${rows.length}: props ${sum(all('nProps'))} (blocking ${sum(all('nBlocking'))}), stick-out max ${(Math.max(...all('max')) * 100).toFixed(1)} cm, mean ${(sum(all('mean')) / rows.length * 100).toFixed(1)} cm, props over 3 cm ${sum(all('over3'))}/${sum(all('props'))}; free floor per room mean ${(sum(all('freeMean')) / rows.length * 100).toFixed(1)} %, lowest ${(Math.min(...all('freeMin')) * 100).toFixed(1)} %; rooms without a 1.5 m path between their doors ${sum(all('pathsBad'))}`);
  if (GATE) { console.log(bad ? `FAIL ${bad} houses with a collider more than 3 cm outside its prop` : 'PASS every prop collider within 3 cm of its model'); process.exit(bad ? 1 : 0); }
})();
