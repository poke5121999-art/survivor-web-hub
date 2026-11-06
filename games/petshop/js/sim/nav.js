// Walkable grid of one stage: the baked NavMeshData polygons (art/<stage>/navmesh.json, tools/export_navmesh.py)
// minus every NavMeshObstacle whose GameObject is active in the current game state, grown by the agent radius
// (Unity carves obstacles into the navmesh the same way). A* over 8-neighbour cells, then string-pulled.
const CELL = 0.25;
const RADIUS = 0.3;   // [GUESS] carve margin; Customer/Player NavMeshAgent radius is 0.25

export class NavGrid {
  constructor(nav) {
    this.nav = nav;
    const b = nav.bounds;
    this.x0 = b.min[0] - 0.5; this.z0 = b.min[2] - 0.5;
    this.w = Math.ceil((b.max[0] - this.x0 + 0.5) / CELL);
    this.h = Math.ceil((b.max[2] - this.z0 + 0.5) / CELL);
    this.base = new Uint8Array(this.w * this.h);
    const v = nav.verts;
    for (const poly of nav.polys) {
      const pts = poly.map(i => [v[i * 3], v[i * 3 + 2]]);
      let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
      for (const [x, z] of pts) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); minz = Math.min(minz, z); maxz = Math.max(maxz, z); }
      for (let gz = this.gz(minz); gz <= this.gz(maxz); gz++) for (let gx = this.gx(minx); gx <= this.gx(maxx); gx++) {
        const [cx, cz] = this.center(gx, gz);
        if (inPoly(pts, cx, cz)) this.base[gz * this.w + gx] = 1;
      }
    }
    this.cells = this.base.slice();
    this.key = '';
  }

  gx(x) { return Math.max(0, Math.min(this.w - 1, Math.floor((x - this.x0) / CELL))); }
  gz(z) { return Math.max(0, Math.min(this.h - 1, Math.floor((z - this.z0) / CELL))); }
  center(gx, gz) { return [this.x0 + (gx + 0.5) * CELL, this.z0 + (gz + 0.5) * CELL]; }

  // Pet Shop: furniture is placed at runtime; its NavMeshObstacle boxes ({center, size, yaw}) carve like scene ones.
  setDynamic(obs) { this.dyn = obs; this.key = null; this.update(() => true); }

  // isOn(nodeIndex) says whether an obstacle's GameObject is active now; only rebuilt when that set changes.
  update(isOn) {
    const act = this.nav.obstacles.filter(o => o.on && o.carve && isOn(o.node));
    const key = act.map(o => o.node).join(',');
    if (key === this.key) return false;
    this.key = key;
    this.cells = this.base.slice();
    const yawOf = q => Math.atan2(2 * (q[3] * q[1] + q[0] * q[2]), 1 - 2 * (q[1] * q[1] + q[0] * q[0]));
    for (const o of act.map(o => ({ center: o.center, size: o.size, yaw: yawOf(o.rot) })).concat(this.dyn || [])) {
      const yaw = o.yaw;
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const hx = o.size[0] / 2 + RADIUS, hz = o.size[2] / 2 + RADIUS;
      const ex = Math.abs(c * hx) + Math.abs(s * hz), ez = Math.abs(s * hx) + Math.abs(c * hz);
      const [ox, oz] = [o.center[0], o.center[2]];
      for (let gz = this.gz(oz - ez); gz <= this.gz(oz + ez); gz++) for (let gx = this.gx(ox - ex); gx <= this.gx(ox + ex); gx++) {
        const [cx, cz] = this.center(gx, gz);
        const dx = cx - ox, dz = cz - oz;
        // three.js yaw rotates +z toward +x: local = R(-yaw) * d
        const lx = c * dx - s * dz, lz = s * dx + c * dz;
        if (Math.abs(lx) <= hx && Math.abs(lz) <= hz) this.cells[gz * this.w + gx] = 0;
      }
    }
    return true;
  }

  ok(x, z) {
    const gx = Math.floor((x - this.x0) / CELL), gz = Math.floor((z - this.z0) / CELL);
    return gx >= 0 && gz >= 0 && gx < this.w && gz < this.h && this.cells[gz * this.w + gx] === 1;
  }

  // Player movement: slide along blocked cells.
  move(ox, oz, nx, nz) {
    if (!this.ok(ox, oz)) return [nx, nz];   // spawned inside something just built: walk out
    if (this.ok(nx, nz)) return [nx, nz];
    if (this.ok(nx, oz)) return [nx, oz];
    if (this.ok(ox, nz)) return [ox, nz];
    return [ox, oz];
  }

  nearest(gx, gz) {
    if (this.cells[gz * this.w + gx]) return [gx, gz];
    for (let r = 1; r < 24; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const x = gx + dx, z = gz + dz;
      if (x >= 0 && z >= 0 && x < this.w && z < this.h && this.cells[z * this.w + x]) return [x, z];
    }
    return [gx, gz];
  }

  // Path of [x, z] points from a to b (both snapped onto walkable cells), or null.
  path(ax, az, bx, bz) {
    const [sx, sz] = this.nearest(this.gx(ax), this.gz(az));
    const [tx, tz] = this.nearest(this.gx(bx), this.gz(bz));
    const W = this.w, start = sz * W + sx, goal = tz * W + tx;
    if (start === goal) return [[bx, bz]];
    // Float64: float32 rounding made ng < g[n] true again for the same cell and the search churned for seconds.
    const g = new Float64Array(W * this.h).fill(Infinity);
    const closed = new Uint8Array(W * this.h);
    const from = new Int32Array(W * this.h).fill(-1);
    const heap = new Heap();
    g[start] = 0;
    heap.push(start, 0);
    const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    let found = false;
    while (heap.size) {
      const cur = heap.pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (cur === goal) { found = true; break; }
      const cx = cur % W, cz = (cur - cx) / W;
      for (const [dx, dz, cost] of D) {
        const x = cx + dx, z = cz + dz;
        if (x < 0 || z < 0 || x >= W || z >= this.h) continue;
        const n = z * W + x;
        if (!this.cells[n] || closed[n]) continue;
        if (dx && dz && (!this.cells[cz * W + x] || !this.cells[z * W + cx])) continue;
        const ng = g[cur] + cost;
        if (ng < g[n]) {
          g[n] = ng; from[n] = cur;
          heap.push(n, ng + Math.hypot(x - tx, z - tz));
        }
      }
    }
    if (!found) return null;
    const cellsPath = [];
    for (let c = goal; c !== -1; c = from[c]) cellsPath.push(c);
    cellsPath.reverse();
    const pts = cellsPath.map(c => this.center(c % W, (c - c % W) / W));
    pts[pts.length - 1] = [bx, bz];
    // String pulling: keep a point only when the straight line to the next kept one is blocked.
    const out = [];
    let i = 0;
    const startPt = [ax, az];
    let anchor = startPt;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !this.clear(anchor[0], anchor[1], pts[j][0], pts[j][1])) j--;
      out.push(pts[j]);
      anchor = pts[j];
      i = j + 1;
    }
    return out;
  }

  // Every cell the segment touches must be walkable (grid traversal, Amanatides & Woo). Sampling points along the
  // line missed blocked cells it only clips at a corner, and the player then pushed into that corner for ever.
  clear(ax, az, bx, bz) {
    let x = Math.floor((ax - this.x0) / CELL), z = Math.floor((az - this.z0) / CELL);
    const tx = Math.floor((bx - this.x0) / CELL), tz = Math.floor((bz - this.z0) / CELL);
    const dx = bx - ax, dz = bz - az;
    const sx = Math.sign(dx), sz = Math.sign(dz);
    const fx = (ax - this.x0) / CELL - x, fz = (az - this.z0) / CELL - z;
    const ddx = dx ? Math.abs(CELL / dx) : Infinity, ddz = dz ? Math.abs(CELL / dz) : Infinity;
    let mx = dx ? (sx > 0 ? 1 - fx : fx) * ddx : Infinity, mz = dz ? (sz > 0 ? 1 - fz : fz) * ddz : Infinity;
    const cell = (gx, gz) => gx >= 0 && gz >= 0 && gx < this.w && gz < this.h && this.cells[gz * this.w + gx] === 1;
    for (let k = 0; k < 4 * (this.w + this.h); k++) {
      if (!cell(x, z)) return false;
      if (x === tx && z === tz) return true;
      if (Math.abs(mx - mz) < 1e-9) {          // through a corner: both neighbours must be open
        if (!cell(x + sx, z) || !cell(x, z + sz)) return false;
        x += sx; z += sz; mx += ddx; mz += ddz;
      } else if (mx < mz) { x += sx; mx += ddx; } else { z += sz; mz += ddz; }
    }
    return true;
  }
}

function inPoly(pts, x, z) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

class Heap {
  constructor() { this.a = []; this.p = []; }
  get size() { return this.a.length; }
  push(v, pr) {
    const a = this.a, p = this.p;
    a.push(v); p.push(pr);
    let i = a.length - 1;
    while (i > 0) {
      const j = (i - 1) >> 1;
      if (p[j] <= p[i]) break;
      [a[i], a[j]] = [a[j], a[i]]; [p[i], p[j]] = [p[j], p[i]];
      i = j;
    }
  }
  pop() {
    const a = this.a, p = this.p, top = a[0];
    const lv = a.pop(), lp = p.pop();
    if (a.length) {
      a[0] = lv; p[0] = lp;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && p[l] < p[m]) m = l;
        if (r < a.length && p[r] < p[m]) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]]; [p[i], p[m]] = [p[m], p[i]];
        i = m;
      }
    }
    return top;
  }
}
