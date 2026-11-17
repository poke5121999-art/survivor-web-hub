// The three nav queries the rules need, over whatever js/sim/nav.js provides:
//   closest(p) -> [x,y,z] on the walkable area, path(a, b) -> [[x,y,z], ...] ending at b (null when unreachable),
//   clampMove(from, to) -> [x,y,z] where a body moving from `from` towards `to` ends up.
// nav.js may already implement them; otherwise they are built here on NavMesh.locate/clamp/heightIn and the polygon
// adjacency (adj[i][k] = polygon across edge k of polygon i, -1 for a border).

export function navKit(nav) {
  if (!nav) return flatKit();
  const kit = {
    closest: p => {
      if (typeof nav.closest === 'function') return toArr(nav.closest(p));
      const c = nav.clamp(p[0], p[2], p[1]);
      return [c.x, c.y, c.z];
    },
    clampMove: (from, to) => {
      if (typeof nav.clampMove === 'function') return toArr(nav.clampMove(from, to));
      const c = nav.clamp(to[0], to[2], from[1]);
      return [c.x, c.y, c.z];
    },
    path: (a, b) => (typeof nav.path === 'function' ? fixPath(nav.path(a, b)) : polyPath(nav, kit, a, b)),
    raw: nav,
  };
  return kit;
}

const toArr = p => (Array.isArray(p) ? [p[0], p[1], p[2]] : [p.x, p.y, p.z]);
const fixPath = pts => (pts ? pts.map(toArr) : null);

// No navmesh (unit tests of pure rules): straight lines on a flat floor.
function flatKit() {
  return { closest: p => [p[0], p[1], p[2]], clampMove: (f, t) => [t[0], t[1], t[2]], path: (a, b) => [[b[0], b[1], b[2]]], raw: null };
}

// A* over polygons (edge midpoints as nodes), then string pulling by walkable line of sight.
function polyPath(nav, kit, a, b) {
  const pa = nav.locate(a[0], a[2], a[1]) >= 0 ? nav.locate(a[0], a[2], a[1]) : nav.clamp(a[0], a[2], a[1]).poly;
  const bc = kit.closest(b);
  const pb = nav.locate(bc[0], bc[2], bc[1]) >= 0 ? nav.locate(bc[0], bc[2], bc[1]) : nav.clamp(bc[0], bc[2], bc[1]).poly;
  if (pa == null || pb == null || pa < 0 || pb < 0) return null;
  if (pa === pb) return [bc];
  const V = nav.verts;
  const mid = (pi, k) => {
    const p = nav.polys[pi], u = V[p[k]], v = V[p[(k + 1) % p.length]];
    return [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2, (u[2] + v[2]) / 2];
  };
  // Node = polygon; cost uses the entry point (edge midpoint) of each polygon.
  const open = [{ poly: pa, g: 0, f: 0, at: a }], came = new Map([[pa, null]]), gBest = new Map([[pa, 0]]);
  const h = p => Math.hypot(p[0] - bc[0], p[2] - bc[2]);
  let found = false;
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur.poly === pb) { found = true; break; }
    const adj = nav.adj[cur.poly];
    for (let k = 0; k < adj.length; k++) {
      const nb = adj[k];
      if (nb < 0) continue;
      const m = mid(cur.poly, k);
      const g = cur.g + Math.hypot(m[0] - cur.at[0], m[2] - cur.at[2]);
      if (gBest.has(nb) && gBest.get(nb) <= g) continue;
      gBest.set(nb, g);
      came.set(nb, { from: cur.poly, at: m });
      open.push({ poly: nb, g, f: g + h(m), at: m });
    }
  }
  if (!found) return null;
  const pts = [];
  for (let p = pb; came.get(p); p = came.get(p).from) pts.unshift(came.get(p).at);
  pts.push(bc);
  // String pulling: drop a corner when the straight segment stays on the mesh.
  const out = [];
  let from = a;
  for (let i = 0; i < pts.length; i++) {
    let j = pts.length - 1;
    while (j > i && !walkable(nav, from, pts[j])) j--;
    out.push(pts[j]);
    from = pts[j];
    i = j;
  }
  return out;
}

function walkable(nav, a, b) {
  const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.5));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (nav.locate(a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t) < 0) return false;
  }
  return true;
}
