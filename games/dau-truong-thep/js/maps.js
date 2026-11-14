// Hand-written arena layouts. Each map lists the features of the left half (team 0 side);
// compileMap() rotates them 180 degrees around the centre to make the right half, so both teams get the same ground.
// Pure data and geometry: no three.js here.

// wall:  [x, z, width(x), depth(z), height, kind]     kind: ruin | block | fence
// round: [x, z, radius, kind]                        kind: pillar | rock | tree  (blocks movement and shots)
// bush:  [x, z, radius]
// prop:  [x, z, kind]                                kind: crate | barrel | pot   (destructible)
// path:  [[x, z], ...]                               ground trail for the terrain shader
export const MAPS = {
  denrung: {
    name: 'Đền Rừng', theme: 'jungle', size: [78, 52],
    blurb: 'Phế tích đền cổ giữa rừng mưa. Ba lối đi, quảng trường trung tâm có bốn cột đá.',
    base: [-33, 0],
    spawns: [[-34, 0], [-33, -3], [-33, 3], [-35.5, -1.8], [-35.5, 1.8]],
    walls: [
      [-26.5, -8.5, 1.8, 7, 2.6, 'ruin'], [-26.5, 8.5, 1.8, 7, 2.6, 'ruin'],
      [-15, -11, 11, 1.8, 2.4, 'ruin'], [-15.5, 11.5, 9, 1.8, 2.4, 'ruin'],
      [-9.5, 0, 2.6, 6.5, 3.4, 'block'], [-19, 3.5, 3.2, 3.2, 3.8, 'block'],
      [-4, -17, 1.8, 6, 2.4, 'ruin'], [-5, 19, 5.5, 1.8, 2.2, 'ruin'],
      [-21, -19.5, 4, 1.6, 1.5, 'fence'], [-29, 17.5, 1.6, 4.5, 1.5, 'fence'],
    ],
    rounds: [
      [-4.6, -4.6, 0.95, 'pillar'], [-4.6, 4.6, 0.95, 'pillar'],
      [-21.5, -15, 1.5, 'rock'], [-11, 20.5, 1.3, 'rock'], [-31, -14.5, 1.6, 'rock'], [-30.5, 12.5, 1.2, 'rock'], [-14.5, -4.2, 1.1, 'rock'],
      [-22.5, -4.5, 0.5, 'tree'], [-13, 7, 0.5, 'tree'], [-7.5, -9, 0.5, 'tree'], [-17.5, 17.5, 0.5, 'tree'], [-1.8, 12.5, 0.5, 'tree'],
      [-10.5, -21, 0.5, 'tree'], [-24.5, 21.5, 0.5, 'tree'], [-34.5, -20.5, 0.5, 'tree'], [-35.5, 9.5, 0.5, 'tree'], [-27.5, -1.5, 0.45, 'tree'],
      [-2.5, -23, 0.5, 'tree'], [-18, -7.5, 0.45, 'tree'],
    ],
    bushes: [
      [-14, -18.5, 2.7], [-10.8, -16.8, 2.0], [-20.5, 9.5, 2.5], [-6.2, 8.5, 2.3], [-1.5, -12.3, 2.1],
      [-28, -18.5, 2.6], [-9.5, 15, 2.3], [-23, 15.5, 2.0], [-15.5, -1, 1.8],
    ],
    props: [
      [-17, -2.2, 'crate'], [-18.3, -3.1, 'crate'], [-7.2, -13.5, 'crate'], [-12.5, 14, 'crate'],
      [-12, -7, 'barrel'], [-3.2, 15.5, 'barrel'], [-23.5, -11, 'barrel'],
      [-22, 12.5, 'pot'], [-21, 13.6, 'pot'], [-6.5, 3.6, 'pot'], [-29.5, -5.5, 'pot'], [-2.4, -8.6, 'pot'],
    ],
    cratePoints: [[0, 0], [-15, -6.5], [0, -9.5], [-22.5, -15.5], [-8.5, 17], [-23, 7]],
    paths: [
      [[-37, 0], [-29, 0], [-22, -1], [-14, -1.5], [-12, -5.5], [-7, -6], [0, 0]],
      [[-29, 0], [-26, -13.5], [-20, -16], [-9, -14.5], [0, -14], [8, -15]],
      [[-29, 0], [-26, 14], [-18, 15.5], [-9, 17], [0, 15.5]],
      [[-9, -14.5], [-7, -6]], [[-12.5, 15.8], [-12.5, 7], [-14, -1.5]],
    ],
    plaza: [0, 0, 8.5],
  },
};

export const MAP_ORDER = ['denrung'];

const CELL = 1;
const NAV_RADIUS = 1.25;

const rot = (p) => [-p[0], -p[1]];
const centred = (p) => Math.abs(p[0]) < 1e-6 && Math.abs(p[1]) < 1e-6;

export function compileMap(key) {
  const src = MAPS[key];
  const both = (list, flip) => list.concat(list.filter((it) => !centred(it)).map(flip));
  const walls = both(src.walls, (w) => [-w[0], -w[1], w[2], w[3], w[4], w[5]])
    .map((w, i) => ({ id: i, x: w[0], z: w[1], w: w[2], d: w[3], h: w[4], kind: w[5], x0: w[0] - w[2] / 2, x1: w[0] + w[2] / 2, z0: w[1] - w[3] / 2, z1: w[1] + w[3] / 2 }));
  const rounds = both(src.rounds, (c) => [-c[0], -c[1], c[2], c[3]]).map((c, i) => ({ id: i, x: c[0], z: c[1], r: c[2], kind: c[3] }));
  const bushes = both(src.bushes, (b) => [-b[0], -b[1], b[2]]).map((b, i) => ({ id: i, x: b[0], z: b[1], r: b[2] }));
  const props = both(src.props, (p) => [-p[0], -p[1], p[2]]).map((p, i) => ({ id: i, x: p[0], z: p[1], kind: p[2] }));
  const cratePoints = both(src.cratePoints, rot);
  const paths = src.paths.concat(src.paths.map((line) => line.map(rot)));
  const [W, D] = src.size;
  const map = {
    key, name: src.name, theme: src.theme, w: W, d: D, hw: W / 2, hd: D / 2,
    walls, rounds, bushes, props, cratePoints, paths, plaza: src.plaza,
    bases: [src.base, rot(src.base)],
    spawns: [src.spawns, src.spawns.map(rot)],
  };
  map.nav = buildNav(map);
  return map;
}

function buildNav(map) {
  const cols = Math.ceil(map.w / CELL), rows = Math.ceil(map.d / CELL);
  const blocked = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = -map.hw + (i + 0.5) * CELL, z = -map.hd + (j + 0.5) * CELL;
    blocked[j * cols + i] = solidAt(map, x, z, NAV_RADIUS) ? 1 : 0;
  }
  return { cols, rows, blocked, cell: CELL };
}

// True when a circle of radius r at (x, z) overlaps static geometry (walls, rounds, the map edge). Props are not included: they can be shot away.
export function solidAt(map, x, z, r) {
  if (x - r < -map.hw || x + r > map.hw || z - r < -map.hd || z + r > map.hd) return true;
  for (const w of map.walls) {
    const dx = Math.max(w.x0 - x, 0, x - w.x1), dz = Math.max(w.z0 - z, 0, z - w.z1);
    if (dx * dx + dz * dz < r * r) return true;
  }
  for (const c of map.rounds) {
    const dx = c.x - x, dz = c.z - z, rr = c.r + r;
    if (dx * dx + dz * dz < rr * rr) return true;
  }
  return false;
}

// First hit of the segment (x0,z0)->(x1,z1), swept with radius r, against walls and rounds. Returns the fraction 0..1, or 2 when clear.
export function castStatic(map, x0, z0, x1, z1, r) {
  let best = 2;
  const dx = x1 - x0, dz = z1 - z0;
  for (const w of map.walls) {
    const t = segBox(x0, z0, dx, dz, w.x0 - r, w.z0 - r, w.x1 + r, w.z1 + r);
    if (t < best) best = t;
  }
  for (const c of map.rounds) {
    const t = segCircle(x0, z0, dx, dz, c.x, c.z, c.r + r);
    if (t < best) best = t;
  }
  return best;
}

export function segBox(x0, z0, dx, dz, bx0, bz0, bx1, bz1) {
  let t0 = 0, t1 = 1;
  if (Math.abs(dx) < 1e-9) { if (x0 < bx0 || x0 > bx1) return 2; }
  else {
    let a = (bx0 - x0) / dx, b = (bx1 - x0) / dx; if (a > b) { const s = a; a = b; b = s; }
    if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return 2;
  }
  if (Math.abs(dz) < 1e-9) { if (z0 < bz0 || z0 > bz1) return 2; }
  else {
    let a = (bz0 - z0) / dz, b = (bz1 - z0) / dz; if (a > b) { const s = a; a = b; b = s; }
    if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return 2;
  }
  return t0;
}

export function segCircle(x0, z0, dx, dz, cx, cz, r) {
  const fx = x0 - cx, fz = z0 - cz;
  const c = fx * fx + fz * fz - r * r;
  if (c <= 0) return 0;
  const a = dx * dx + dz * dz;
  if (a < 1e-12) return 2;
  const b = 2 * (fx * dx + fz * dz);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return 2;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : 2;
}

export const losClear = (map, x0, z0, x1, z1, r = 0.2) => castStatic(map, x0, z0, x1, z1, r) > 1;

const cellOf = (nav, map, x, z) => {
  const i = Math.min(nav.cols - 1, Math.max(0, Math.floor((x + map.hw) / nav.cell)));
  const j = Math.min(nav.rows - 1, Math.max(0, Math.floor((z + map.hd) / nav.cell)));
  return j * nav.cols + i;
};

function nearestOpen(nav, idx) {
  if (!nav.blocked[idx]) return idx;
  const ci = idx % nav.cols, cj = (idx / nav.cols) | 0;
  for (let ring = 1; ring < 8; ring++) {
    for (let dj = -ring; dj <= ring; dj++) for (let di = -ring; di <= ring; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== ring) continue;
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= nav.cols || j >= nav.rows) continue;
      if (!nav.blocked[j * nav.cols + i]) return j * nav.cols + i;
    }
  }
  return idx;
}

// A* on the 1 m grid. Returns world waypoints [[x, z], ...] from just after the start to the goal, already string-pulled with losClear.
export function findPath(map, x0, z0, x1, z1) {
  const nav = map.nav, cols = nav.cols, n = cols * nav.rows;
  const start = nearestOpen(nav, cellOf(nav, map, x0, z0)), goal = nearestOpen(nav, cellOf(nav, map, x1, z1));
  if (start === goal) return [[x1, z1]];
  const g = new Float32Array(n).fill(Infinity), from = new Int32Array(n).fill(-1), closed = new Uint8Array(n);
  const heap = [];
  const push = (idx, f) => { heap.push([f, idx]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; const s = heap[p]; heap[p] = heap[k]; heap[k] = s; k = p; } };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; const s = heap[m]; heap[m] = heap[k]; heap[k] = s; k = m; } }
    return top[1];
  };
  const gi = goal % cols, gj = (goal / cols) | 0;
  const h = (idx) => { const di = Math.abs((idx % cols) - gi), dj = Math.abs(((idx / cols) | 0) - gj); return Math.max(di, dj) + 0.414 * Math.min(di, dj); };
  g[start] = 0; push(start, h(start));
  let found = false;
  while (heap.length) {
    const cur = pop();
    if (cur === goal) { found = true; break; }
    if (closed[cur]) continue;
    closed[cur] = 1;
    const ci = cur % cols, cj = (cur / cols) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= cols || j >= nav.rows) continue;
      const nb = j * cols + i;
      if (nav.blocked[nb] || closed[nb]) continue;
      if (di && dj && (nav.blocked[cj * cols + i] || nav.blocked[j * cols + ci])) continue;
      const cost = g[cur] + (di && dj ? 1.414 : 1);
      if (cost < g[nb]) { g[nb] = cost; from[nb] = cur; push(nb, cost + h(nb)); }
    }
  }
  if (!found) return [[x1, z1]];
  const cells = [];
  for (let c = goal; c !== start && c !== -1; c = from[c]) cells.push(c);
  cells.reverse();
  const pts = cells.map((c) => [-map.hw + ((c % cols) + 0.5) * nav.cell, -map.hd + (((c / cols) | 0) + 0.5) * nav.cell]);
  pts[pts.length - 1] = solidAt(map, x1, z1, NAV_RADIUS) ? pts[pts.length - 1] : [x1, z1];
  const out = [];
  let ax = x0, az = z0, k = 0;
  while (k < pts.length) {
    let far = k;
    for (let q = Math.min(pts.length - 1, k + 14); q > k; q--) if (losClear(map, ax, az, pts[q][0], pts[q][1], NAV_RADIUS - 0.1)) { far = q; break; }
    out.push(pts[far]); ax = pts[far][0]; az = pts[far][1]; k = far + 1;
  }
  return out;
}
