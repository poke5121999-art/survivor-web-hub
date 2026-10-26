/*
 * My Mini Mart (games/casual-farm), Store 1: dữ liệu vùng đi được + tìm đường.
 *   node test/casual-farm-nav.js
 * Nạp art/store1/navmesh.json và scene.json, ghép toạ độ thế giới của SpawnPoints / CashierDesk / Shelf02_Tomato,
 * kiểm mỗi điểm sinh khách chiếu lên lưới trong 1,5 m và có đường tới quầy thu ngân + kệ cà chua.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ART = path.resolve(__dirname, '..', 'games', 'casual-farm', 'art', 'store1');
const NAV_JS = path.resolve(__dirname, '..', 'games', 'casual-farm', 'js', 'sim', 'nav.js');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + name + (detail != null ? '  (' + detail + ')' : ''));
}

function qmul(a, b) {
  return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
}
function qrot(q, v) {
  const [x, y, z, w] = q;
  const cx = y * v[2] - z * v[1], cy = z * v[0] - x * v[2], cz = x * v[1] - y * v[0];
  const dx = y * cz - z * cy, dy = z * cx - x * cz, dz = x * cy - y * cx;
  return [v[0] + 2 * (w * cx + dx), v[1] + 2 * (w * cy + dy), v[2] + 2 * (w * cz + dz)];
}
function worldOf(nodes, i, cache) {
  if (cache[i]) return cache[i];
  const n = nodes[i];
  const t = n.t || [0, 0, 0], r = n.r || [0, 0, 0, 1], s = n.s || [1, 1, 1];
  let res;
  if (n.p < 0) res = { p: t, q: r, s };
  else {
    const par = worldOf(nodes, n.p, cache);
    const o = qrot(par.q, [t[0] * par.s[0], t[1] * par.s[1], t[2] * par.s[2]]);
    res = { p: [par.p[0] + o[0], par.p[1] + o[1], par.p[2] + o[2]], q: qmul(par.q, r), s: [s[0] * par.s[0], s[1] * par.s[1], s[2] * par.s[2]] };
  }
  return (cache[i] = res);
}
const pt = (a) => ({ x: a[0], y: a[1], z: a[2] });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

(async () => {
  // nav.js is an ES module and the repo has no package.json "type", so load it from a data: URL.
  const src = fs.readFileSync(NAV_JS, 'utf8');
  const { NavMesh, pathLength } = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
  const nm = new NavMesh(JSON.parse(fs.readFileSync(path.join(ART, 'navmesh.json'), 'utf8')));
  const nodes = JSON.parse(fs.readFileSync(path.join(ART, 'scene.json'), 'utf8')).nodes;
  const cache = {};
  const W = (i) => pt(worldOf(nodes, i, cache).p);
  const named = (name) => nodes.map((n, i) => (n.n === name ? i : -1)).filter((i) => i >= 0);

  console.log('navmesh: ' + nm.polys.length + ' polys, ' + nm.verts.length / 3 + ' verts, ' + nm.obstacles.length + ' obstacles');
  check('mesh has polygons', nm.polys.length > 100, nm.polys.length);
  check('obstacles exported', nm.obstacles.length === 30, nm.obstacles.length);
  let badAdj = 0;
  nm.adj.forEach((a, p) => a.forEach((q) => { if (q >= 0 && !nm.adj[q].includes(p)) badAdj++; }));
  check('adjacency is symmetric', badAdj === 0, badAdj + ' broken');

  const spawnGroup = named('SpawnPoints').find((i) => nodes.some((n) => n.p === i));
  const spawns = nodes.map((n, i) => (n.p === spawnGroup ? i : -1)).filter((i) => i >= 0);
  check('SpawnPoints has children', spawns.length === 6, spawns.length);
  const desk = W(named('CashierDesk')[0]);
  const shelf = W(named('Shelf02_Tomato')[0]);
  const deskN = nm.nearest(desk), shelfN = nm.nearest(shelf);
  console.log('  desk', JSON.stringify(desk), '-> walkable', JSON.stringify(deskN.point), ' shelf', JSON.stringify(shelf), '-> walkable', JSON.stringify(shelfN.point));
  check('CashierDesk within 8 m of the mesh', dist2(desk, deskN.point) < 8, dist2(desk, deskN.point).toFixed(2));
  check('Shelf02_Tomato within 8 m of the mesh', dist2(shelf, shelfN.point) < 8, dist2(shelf, shelfN.point).toFixed(2));

  for (const si of spawns) {
    const sp = W(si);
    const on = nm.nearest(sp);
    const label = 'spawn#' + si;
    check(label + ' projects onto mesh within 1.5 m', dist2(sp, on.point) <= 1.5, dist2(sp, on.point).toFixed(2));
    for (const [tn, tgt] of [['cashier', desk], ['tomato shelf', shelf]]) {
      const p = nm.path(sp, tgt);
      check(label + ' -> ' + tn + ' path exists', !!p && p.length >= 2, p ? p.length + ' points' : 'null');
      if (!p) continue;
      let off = 0;
      for (let i = 1; i < p.length; i++) {
        if (p.hops && p.hops.includes(i - 1)) continue; // marker-island hop onto the main floor, off the mesh by design
        // sample 5 interior points per segment, including the midpoint
        for (const t of [0.5, 0.25, 0.75]) {
          const m = { x: p[i - 1].x + (p[i].x - p[i - 1].x) * t, y: 0, z: p[i - 1].z + (p[i].z - p[i - 1].z) * t };
          if (dist2(m, nm.nearest(m).point) > 0.02) off++;
        }
      }
      check(label + ' -> ' + tn + ' segments stay on mesh', off === 0, off + ' samples off, hops ' + JSON.stringify(p.hops));
      const len = pathLength(p);
      const straight = dist(on.point, nm.nearest(tgt).point);
      check(label + ' -> ' + tn + ' length within [1x, 3x] straight', len >= straight - 1e-6 && len <= 3 * straight + 1e-6,
        len.toFixed(1) + ' vs ' + straight.toFixed(1));
    }
  }
  console.log((fail ? 'FAIL' : 'PASS') + ': ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FAIL: ' + (e && e.stack || e)); process.exit(1); });
