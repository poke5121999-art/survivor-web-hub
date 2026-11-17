// Walkable area of the GamePlay map: the NavMeshSurface polygons exported by tools/export_navmesh.py, already reduced to
// the region that holds Env/playerPos. Pure JS (no THREE), three.js world coordinates, usable from node.

export class NavMesh {
  constructor(json) {
    const v = json.verts;
    this.verts = [];
    for (let i = 0; i < v.length; i += 3) this.verts.push([v[i], v[i + 1], v[i + 2]]);
    this.polys = json.polys;
    this.adj = json.adj;
    this.obstacles = json.obstacles || [];
    this.solids = [];
    this.byId = new Map();
    if (json.colliders) this.setColliders(json.colliders);
    this.boxes = this.polys.map(p => {
      const xs = p.map(i => this.verts[i][0]), zs = p.map(i => this.verts[i][2]);
      return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
    });
  }

  contains(pi, x, z) {
    const p = this.polys[pi], V = this.verts;
    const b = this.boxes[pi];
    if (x < b[0] - 1e-6 || z < b[1] - 1e-6 || x > b[2] + 1e-6 || z > b[3] + 1e-6) return false;
    let inside = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const a = V[p[i]], c = V[p[j]];
      if ((a[2] > z) !== (c[2] > z) && x < (c[0] - a[0]) * (z - a[2]) / (c[2] - a[2]) + a[0]) inside = !inside;
    }
    return inside;
  }

  // Polygon under (x, z) whose height is closest to y (the map has no overlapping floors in this region, but keep it honest).
  locate(x, z, y = null) {
    let best = -1, bestDy = Infinity;
    for (let i = 0; i < this.polys.length; i++) {
      if (!this.contains(i, x, z)) continue;
      const dy = y == null ? 0 : Math.abs(this.heightIn(i, x, z) - y);
      if (dy < bestDy) { best = i; bestDy = dy; }
    }
    return best;
  }

  // Height on polygon pi at (x, z): barycentric on the fan triangle that holds the point.
  heightIn(pi, x, z) {
    const p = this.polys[pi], V = this.verts, a = V[p[0]];
    for (let k = 1; k + 1 < p.length; k++) {
      const b = V[p[k]], c = V[p[k + 1]];
      const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
      if (Math.abs(d) < 1e-9) continue;
      const wa = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d;
      const wb = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d;
      const wc = 1 - wa - wb;
      if (wa >= -1e-4 && wb >= -1e-4 && wc >= -1e-4) return wa * a[1] + wb * b[1] + wc * c[1];
    }
    return p.reduce((s, i) => s + V[i][1], 0) / p.length;
  }

  height(x, z, y = null) {
    const pi = this.locate(x, z, y);
    return pi < 0 ? null : this.heightIn(pi, x, z);
  }

  // Nearest walkable point to (x, z): itself when inside, else the closest point on any polygon's outline. Moving to
  // the clamped point slides along the edge like the original CharacterController sliding along a wall.
  clamp(x, z, y = null) {
    const pi = this.locate(x, z, y);
    if (pi >= 0) return { x, z, y: this.heightIn(pi, x, z), poly: pi };
    let best = null, bestD = Infinity;
    for (let i = 0; i < this.polys.length; i++) {
      const b = this.boxes[i];
      const bx = Math.max(b[0] - x, 0, x - b[2]), bz = Math.max(b[1] - z, 0, z - b[3]);
      if (bx * bx + bz * bz >= bestD) continue;
      const p = this.polys[i];
      for (let k = 0; k < p.length; k++) {
        const a = this.verts[p[k]], c = this.verts[p[(k + 1) % p.length]];
        const ex = c[0] - a[0], ez = c[2] - a[2], L = ex * ex + ez * ez;
        const t = L > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[2]) * ez) / L)) : 0;
        const px = a[0] + ex * t, pz = a[2] + ez * t, d = (px - x) ** 2 + (pz - z) ** 2;
        if (d < bestD) { bestD = d; best = { x: px, z: pz, poly: i }; }
      }
    }
    // Step a hair inside so the next locate() finds the polygon.
    const cx = this.boxes[best.poly][0] + this.boxes[best.poly][2], cz = this.boxes[best.poly][1] + this.boxes[best.poly][3];
    const k = 1e-3 / Math.max(1e-6, Math.hypot(cx / 2 - best.x, cz / 2 - best.z));
    best.x += (cx / 2 - best.x) * k;
    best.z += (cz / 2 - best.z) * k;
    best.y = this.heightIn(best.poly, best.x, best.z);
    return best;
  }

  // art/world/colliders.json (tools/export_colliders.py): oriented boxes / vertical cylinders of the static scene objects.
  // Each becomes an XZ footprint plus a world height range; `gate` ids can be switched with setBlocker(id, on).
  setColliders(json) {
    this.solids = [];
    this.byId = new Map();
    for (const e of json.boxes || []) {
      const s = { id: e.gate ?? null, name: e.path || e.n, on: true, shape: e.shape, cx: e.c[0], cz: e.c[2] };
      if (e.shape === 'cyl') {
        s.r = e.r; s.y0 = e.c[1] - e.hh; s.y1 = e.c[1] + e.hh;
      } else {
        const R = quatMat(e.q), h = e.h;
        // world half height and the horizontal footprint
        const hy = Math.abs(R[1][0]) * h[0] + Math.abs(R[1][1]) * h[1] + Math.abs(R[1][2]) * h[2];
        s.y0 = e.c[1] - hy; s.y1 = e.c[1] + hy;
        const up = [0, 1, 2].find(k => Math.abs(R[1][k]) > 0.99);
        if (up != null) {
          // an axis points up: exact oriented rectangle from the other two axes
          const [a, b] = [0, 1, 2].filter(k => k !== up);
          const ax = Math.hypot(R[0][a], R[2][a]);
          s.ux = R[0][a] / ax; s.uz = R[2][a] / ax; s.a = h[a]; s.b = h[b];
        } else {
          // tilted box: axis-aligned footprint of its corners
          s.ux = 1; s.uz = 0;
          s.a = Math.abs(R[0][0]) * h[0] + Math.abs(R[0][1]) * h[1] + Math.abs(R[0][2]) * h[2];
          s.b = Math.abs(R[2][0]) * h[0] + Math.abs(R[2][1]) * h[1] + Math.abs(R[2][2]) * h[2];
        }
      }
      s.reach = s.shape === 'cyl' ? s.r : Math.hypot(s.a, s.b);
      this.solids.push(s);
      if (s.id != null) { if (!this.byId.has(s.id)) this.byId.set(s.id, []); this.byId.get(s.id).push(s); }
    }
    return this;
  }

  // Dynamic blockers (sliding gates): on = the collider exists. Unknown ids are ignored.
  setBlocker(id, on) {
    for (const s of this.byId.get(id) || []) s.on = !!on;
  }

  gateIds() {
    return [...this.byId.keys()];
  }

  // Push the circle (x, z, radius r) standing on floor height y out of every solid whose height range overlaps the
  // body [y + step, y + height]. Pushing along the contact normal makes the mover slide along walls.
  pushOut(x, z, y, r, height = 0.72, step = 0.1) {
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      for (const s of this.solids) {
        if (!s.on || s.y1 <= y + step || s.y0 >= y + height) continue;
        const dx = x - s.cx, dz = z - s.cz;
        if (dx * dx + dz * dz > (s.reach + r) * (s.reach + r)) continue;
        let nx, nz, pen;
        if (s.shape === 'cyl') {
          const d = Math.hypot(dx, dz);
          if (d >= s.r + r) continue;
          nx = d > 1e-9 ? dx / d : 1; nz = d > 1e-9 ? dz / d : 0; pen = s.r + r - d;
        } else {
          const lu = dx * s.ux + dz * s.uz, lv = -dx * s.uz + dz * s.ux; // box frame: u = (ux, uz), v = (-uz, ux)
          const qu = Math.max(-s.a, Math.min(s.a, lu)), qv = Math.max(-s.b, Math.min(s.b, lv));
          const ex = lu - qu, ev = lv - qv, d = Math.hypot(ex, ev);
          let pu, pv;
          if (d > 1e-9) {
            if (d >= r) continue;
            pu = ex / d; pv = ev / d; pen = r - d;
          } else { // centre inside the footprint: leave through the nearest side
            const du = s.a - Math.abs(lu), dv = s.b - Math.abs(lv);
            if (du < dv) { pu = Math.sign(lu) || 1; pv = 0; pen = du + r; } else { pu = 0; pv = Math.sign(lv) || 1; pen = dv + r; }
          }
          nx = pu * s.ux - pv * s.uz; nz = pu * s.uz + pv * s.ux;
        }
        x += nx * pen; z += nz * pen; moved = true;
      }
      if (!moved) break;
    }
    return { x, z };
  }
}

function quatMat(q) {
  const [x, y, z, w] = q;
  return [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]];
}
