// Walkable-area pathfinding over the baked Unity NavMesh (art/store1/navmesh.json). No DOM, no THREE.
// Polygons are convex and counter-clockwise seen from +Y; adj[p][e] is the polygon across edge e (vertex e -> e+1) or -1.
// path(): A* over polygon adjacency (cost between edge midpoints), then a simple stupid funnel on the XZ plane.

const EPS = 1e-9;

// z component of (b-a)x(c-a) in the (x,z) plane: > 0 when c is left of a->b (counter-clockwise in x,z).
function area(ax, az, bx, bz, cx, cz) {
  return (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
}

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(item, key) {
    const a = this.a;
    a.push([key, item]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top[1];
  }
}

// Ground footprint of an obstacle box as a 2D oriented rectangle: of the box's three world axes, keep the two that lie
// most horizontally (meshes exported from Blender are often rotated 90 degrees about X, so the box's local z is up).
export function footprint(o) {
  if (o._fp) return o._fp;
  const [x, y, z, w] = o.rot || [0, 0, 0, 1];
  const cols = [
    [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)],
    [2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w)],
    [2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)],
  ];
  const axes = cols.map((c, i) => ({ hx: c[0] * o.size[i] / 2, hz: c[2] * o.size[i] / 2, up: Math.abs(c[1]) }))
    .sort((a, b) => a.up - b.up).slice(0, 2);
  const [a, b] = axes;
  const la = Math.hypot(a.hx, a.hz), lb = Math.hypot(b.hx, b.hz);
  if (la < 1e-4 || lb < 1e-4) {
    o._fp = { cx: o.center[0], cz: o.center[2], ux: 1, uz: 0, hu: la, vx: 0, vz: 1, hv: lb };
    return o._fp;
  }
  o._fp = { cx: o.center[0], cz: o.center[2], ux: a.hx / la, uz: a.hz / la, hu: la, vx: b.hx / lb, vz: b.hz / lb, hv: lb };
  return o._fp;
}

export class NavMesh {
  constructor(json) {
    this.verts = json.verts;
    this.polys = json.polys;
    this.adj = json.adj;
    this.bounds = json.bounds;
    this.obstacles = json.obstacles || [];
    const n = this.polys.length;
    this.centers = new Array(n);
    this.box = new Array(n);
    for (let i = 0; i < n; i++) {
      const ps = this.polys[i];
      let cx = 0, cy = 0, cz = 0, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const v of ps) {
        const x = this.verts[v * 3], y = this.verts[v * 3 + 1], z = this.verts[v * 3 + 2];
        cx += x; cy += y; cz += z;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
      }
      this.centers[i] = { x: cx / ps.length, y: cy / ps.length, z: cz / ps.length };
      this.box[i] = [x0, z0, x1, z1];
    }
    // Connected components. The bake also contains small isolated pieces (spawn/exit marker quads sitting 1.5 to 3 m off
    // the floor), so path() can hop from such an island onto the main mesh.
    this.comp = new Int32Array(n).fill(-1);
    this.compSize = [];
    for (let i = 0; i < n; i++) {
      if (this.comp[i] >= 0) continue;
      const id = this.compSize.length, st = [i];
      let cnt = 0;
      this.comp[i] = id;
      while (st.length) {
        const p = st.pop();
        cnt++;
        for (const q of this.adj[p]) if (q >= 0 && this.comp[q] < 0) { this.comp[q] = id; st.push(q); }
      }
      this.compSize.push(cnt);
    }
    this.mainComp = this.compSize.indexOf(Math.max(...this.compSize, 0));
  }

  // Height of polygon `pi` at (x,z), by the fan triangle containing the point (nearest fan triangle if outside).
  heightAt(pi, x, z) {
    const ps = this.polys[pi], V = this.verts;
    const a = ps[0] * 3;
    let best = this.centers[pi].y, bestOut = Infinity;
    for (let k = 1; k + 1 < ps.length; k++) {
      const b = ps[k] * 3, c = ps[k + 1] * 3;
      const d = (V[b + 2] - V[c + 2]) * (V[a] - V[c]) + (V[c] - V[b]) * (V[a + 2] - V[c + 2]);
      if (Math.abs(d) < EPS) continue;
      const w0 = ((V[b + 2] - V[c + 2]) * (x - V[c]) + (V[c] - V[b]) * (z - V[c + 2])) / d;
      const w1 = ((V[c + 2] - V[a + 2]) * (x - V[c]) + (V[a] - V[c]) * (z - V[c + 2])) / d;
      const w2 = 1 - w0 - w1;
      const out = Math.max(0, -w0, -w1, -w2);
      if (out < bestOut) {
        bestOut = out;
        best = w0 * V[a + 1] + w1 * V[b + 1] + w2 * V[c + 1];
      }
    }
    return best;
  }

  contains(pi, x, z) {
    const b = this.box[pi];
    if (x < b[0] - 1e-6 || x > b[2] + 1e-6 || z < b[1] - 1e-6 || z > b[3] + 1e-6) return false;
    const ps = this.polys[pi], V = this.verts;
    for (let e = 0; e < ps.length; e++) {
      const a = ps[e] * 3, c = ps[(e + 1) % ps.length] * 3;
      // CCW seen from +Y == clockwise in (x,z) as area() sees it, so an inside point has area <= 0 for every edge.
      if (area(V[a], V[a + 2], V[c], V[c + 2], x, z) > 1e-6) return false;
    }
    return true;
  }

  // Closest point to p on the mesh. A point inside several stacked polygons picks the one nearest in y.
  // `comp` (optional) restricts the search to one connected component.
  nearest(p, comp = -1) {
    let inside = -1, dy = Infinity;
    for (let i = 0; i < this.polys.length; i++) {
      if (comp >= 0 && this.comp[i] !== comp) continue;
      if (!this.contains(i, p.x, p.z)) continue;
      const d = Math.abs(this.heightAt(i, p.x, p.z) - (p.y || 0));
      if (d < dy) { dy = d; inside = i; }
    }
    if (inside >= 0) return { poly: inside, point: { x: p.x, y: this.heightAt(inside, p.x, p.z), z: p.z } };
    let best = -1, bd = Infinity, bx = 0, bz = 0;
    const V = this.verts;
    for (let i = 0; i < this.polys.length; i++) {
      if (comp >= 0 && this.comp[i] !== comp) continue;
      const ps = this.polys[i];
      for (let e = 0; e < ps.length; e++) {
        const a = ps[e] * 3, c = ps[(e + 1) % ps.length] * 3;
        const ex = V[c] - V[a], ez = V[c + 2] - V[a + 2];
        const l2 = ex * ex + ez * ez;
        let t = l2 > EPS ? ((p.x - V[a]) * ex + (p.z - V[a + 2]) * ez) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = V[a] + ex * t, qz = V[a + 2] + ez * t;
        const d = (qx - p.x) * (qx - p.x) + (qz - p.z) * (qz - p.z);
        if (d < bd) { bd = d; best = i; bx = qx; bz = qz; }
      }
    }
    if (best < 0) return null;
    return { poly: best, point: { x: bx, y: this.heightAt(best, bx, bz), z: bz } };
  }

  // Player movement: keep `to` on the main walkable component and outside NavMeshObstacle boxes (the bake ignores
  // obstacles; Unity carves them at runtime). `radius` is the agent's clearance from an obstacle face.
  clamp(from, to, radius = 1, isSolid = null) {
    let p = { x: to.x, y: to.y || 0, z: to.z };
    for (const o of this.obstacles) {
      if (isSolid && !isSolid(o)) continue;
      const f = footprint(o);
      const dx = p.x - f.cx, dz = p.z - f.cz;
      const lu = dx * f.ux + dz * f.uz, lv = dx * f.vx + dz * f.vz;
      const hu = f.hu + radius, hv = f.hv + radius;
      if (Math.abs(lu) >= hu || Math.abs(lv) >= hv) continue;
      const pushU = hu - Math.abs(lu) < hv - Math.abs(lv);
      const nu = pushU ? Math.sign(lu || 1) * hu : lu, nv = pushU ? lv : Math.sign(lv || 1) * hv;
      p = { x: f.cx + f.ux * nu + f.vx * nv, y: p.y, z: f.cz + f.uz * nu + f.vz * nv };
    }
    const n = this.nearest(p, this.mainComp);
    return n ? n.point : { x: from.x, y: from.y || 0, z: from.z };
  }

  _mid(pi, e) {
    const ps = this.polys[pi], V = this.verts;
    const a = ps[e] * 3, c = ps[(e + 1) % ps.length] * 3;
    return { x: (V[a] + V[c]) / 2, y: (V[a + 1] + V[c + 1]) / 2, z: (V[a + 2] + V[c + 2]) / 2 };
  }

  // Polygon sequence from poly `s` to `g` or null. Cost accumulates between entry points (start, edge midpoints, goal).
  _astar(s, g, from, to) {
    if (s === g) return [s];
    const n = this.polys.length;
    const gs = new Float64Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    const px = new Float64Array(n), py = new Float64Array(n), pz = new Float64Array(n);
    const closed = new Uint8Array(n);
    gs[s] = 0; px[s] = from.x; py[s] = from.y; pz[s] = from.z;
    const h = (x, y, z) => Math.hypot(to.x - x, to.y - y, to.z - z);
    const open = new Heap();
    open.push(s, h(from.x, from.y, from.z));
    while (open.size) {
      const cur = open.pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (cur === g) {
        const out = [];
        for (let c = g; c >= 0; c = prev[c]) out.push(c);
        return out.reverse();
      }
      const nb = this.adj[cur];
      for (let e = 0; e < nb.length; e++) {
        const q = nb[e];
        if (q < 0 || closed[q]) continue;
        const m = this._mid(cur, e);
        let cost = gs[cur] + Math.hypot(m.x - px[cur], m.y - py[cur], m.z - pz[cur]);
        if (q === g) cost += Math.hypot(to.x - m.x, to.y - m.y, to.z - m.z);
        if (cost < gs[q]) {
          gs[q] = cost; prev[q] = cur;
          px[q] = m.x; py[q] = m.y; pz[q] = m.z;
          open.push(q, cost + (q === g ? 0 : h(m.x, m.y, m.z)));
        }
      }
    }
    return null;
  }

  // Portal between consecutive polygons a -> b as {lx,lz,ly,rx,rz,ry}; "left" is the CCW (in x,z) end seen from inside a.
  _portal(a, b) {
    const nb = this.adj[a];
    const e = nb.indexOf(b);
    const ps = this.polys[a], V = this.verts;
    const i0 = ps[e] * 3, i1 = ps[(e + 1) % ps.length] * 3;
    const c = this.centers[a];
    // Orient so that `left` is counter-clockwise (x,z) of `right` as seen from the centre of a.
    if (area(c.x, c.z, V[i0], V[i0 + 2], V[i1], V[i1 + 2]) > 0) {
      return { rx: V[i0], ry: V[i0 + 1], rz: V[i0 + 2], lx: V[i1], ly: V[i1 + 1], lz: V[i1 + 2] };
    }
    return { rx: V[i1], ry: V[i1 + 1], rz: V[i1 + 2], lx: V[i0], ly: V[i0 + 1], lz: V[i0 + 2] };
  }

  // Points from `from` to `to`, or null. When the two ends lie in different components, the end in the smaller one is
  // re-snapped onto the larger one and joined by a straight hop; the result's `hops` lists those segment indices
  // (0 and/or last), which are the only segments allowed off the mesh.
  path(from, to) {
    let a = this.nearest(from), b = this.nearest(to);
    if (!a || !b) return null;
    const hops = [];
    let head = null, tail = null;
    if (this.comp[a.poly] !== this.comp[b.poly]) {
      const ca = this.comp[a.poly], cb = this.comp[b.poly];
      if (this.compSize[ca] < this.compSize[cb]) { head = a.point; a = this.nearest(a.point, cb); }
      else { tail = b.point; b = this.nearest(b.point, ca); }
    }
    const res = this._path(a, b);
    if (!res) return null;
    if (head) { res.unshift(head); hops.push(0); }
    if (tail) { res.push(tail); hops.push(res.length - 2); }
    res.hops = hops;
    return res;
  }

  _path(a, b) {
    const seq = this._astar(a.poly, b.poly, a.point, b.point);
    if (!seq) return null;
    if (seq.length === 1) return [a.point, b.point];

    // portals: start point, one per polygon crossing, goal point (as degenerate portals)
    const P = [{ lx: a.point.x, ly: a.point.y, lz: a.point.z, rx: a.point.x, ry: a.point.y, rz: a.point.z }];
    for (let i = 0; i + 1 < seq.length; i++) P.push(this._portal(seq[i], seq[i + 1]));
    P.push({ lx: b.point.x, ly: b.point.y, lz: b.point.z, rx: b.point.x, ry: b.point.y, rz: b.point.z });

    const out = [a.point];
    let ax = a.point.x, ay = a.point.y, az = a.point.z;
    let lx = ax, lz = az, ly = ay, rx = ax, rz = az, ry = ay;
    let li = 0, ri = 0;
    for (let i = 1; i < P.length; i++) {
      const p = P[i];
      // tighten right side
      if (area(ax, az, rx, rz, p.rx, p.rz) >= 0) {
        if ((ax === rx && az === rz) || area(ax, az, lx, lz, p.rx, p.rz) < 0) {
          rx = p.rx; ry = p.ry; rz = p.rz; ri = i;
        } else {
          out.push({ x: lx, y: ly, z: lz });
          ax = lx; ay = ly; az = lz;
          rx = ax; ry = ay; rz = az;
          const k = li;
          li = k; ri = k;
          i = k;
          continue;
        }
      }
      // tighten left side
      if (area(ax, az, lx, lz, p.lx, p.lz) <= 0) {
        if ((ax === lx && az === lz) || area(ax, az, rx, rz, p.lx, p.lz) > 0) {
          lx = p.lx; ly = p.ly; lz = p.lz; li = i;
        } else {
          out.push({ x: rx, y: ry, z: rz });
          ax = rx; ay = ry; az = rz;
          lx = ax; ly = ay; lz = az;
          const k = ri;
          li = k; ri = k;
          i = k;
          continue;
        }
      }
    }
    const last = out[out.length - 1];
    if (last.x !== b.point.x || last.z !== b.point.z) out.push(b.point);
    return out;
  }
}

export function pathLength(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
  return s;
}
