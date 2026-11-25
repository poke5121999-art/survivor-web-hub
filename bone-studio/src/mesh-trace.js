// Mesh from an image outline: trace the opaque area, simplify it, scatter interior points, Delaunay triangulate
// and keep the triangles inside the outline. Pure functions on { width, height, data } (RGBA) and uv points.

// outline of the largest opaque blob as a polygon in pixel corners (clockwise in image space), 1 px margin
export function traceOutline(img, { alpha = 8, margin = 1 } = {}) {
  const { width: w, height: h, data } = img, W = w + 2, H = h + 2;
  let m = new Uint8Array(W * H);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > alpha) m[(y + 1) * W + x + 1] = 1;
  for (let k = 0; k < margin; k++) { // grow so the outline does not cut anti-aliased edges
    const n = m.slice();
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (!m[y * W + x] && (m[y * W + x - 1] || m[y * W + x + 1] || m[(y - 1) * W + x] || m[(y + 1) * W + x])) n[y * W + x] = 1;
    m = n;
  }
  // keep the biggest 4-connected blob
  const lab = new Int32Array(W * H).fill(-1);
  let best = -1, bestN = 0, id = 0;
  for (let i = 0; i < W * H; i++) {
    if (!m[i] || lab[i] >= 0) continue;
    let n = 0; const st = [i]; lab[i] = id;
    while (st.length) { const j = st.pop(); n++; for (const k of [j - 1, j + 1, j - W, j + W]) if (k >= 0 && k < W * H && m[k] && lab[k] < 0) { lab[k] = id; st.push(k); } }
    if (n > bestN) { bestN = n; best = id; }
    id++;
  }
  if (best < 0) return [];
  const on = (x, y) => x >= 0 && y >= 0 && x < W && y < H && lab[y * W + x] === best;
  // boundary walk along pixel edges (square tracing on the corner grid), starting at the top-left pixel's top edge
  let sx = -1, sy = -1;
  for (let i = 0; i < W * H && sx < 0; i++) if (lab[i] === best) { sx = i % W; sy = (i / W) | 0; }
  const pts = [];
  let x = sx, y = sy, dir = 0; // corner (x, y), dir: 0 right, 1 down, 2 left, 3 up — the blob is on the right-hand side
  const D = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  // pixel on the right/left of moving from corner c in direction d
  const right = (cx, cy, d) => [[cx, cy], [cx - 1, cy], [cx - 1, cy - 1], [cx, cy - 1]][d];
  const left = (cx, cy, d) => [[cx, cy - 1], [cx, cy], [cx - 1, cy], [cx - 1, cy - 1]][d];
  for (let guard = 0; guard < 4 * W * H; guard++) {
    pts.push([x - 1, y - 1]); // back to image coordinates (the frame added 1 px)
    x += D[dir][0]; y += D[dir][1];
    if (x === sx && y === sy) break;
    // prefer turning left (into the blob boundary), then straight, then right
    for (const nd of [(dir + 3) % 4, dir, (dir + 1) % 4, (dir + 2) % 4]) {
      const [rx, ry] = right(x, y, nd), [lx, ly] = left(x, y, nd);
      if (on(rx, ry) && !on(lx, ly)) { dir = nd; break; }
    }
  }
  return dropCollinear(pts);
}
function dropCollinear(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[(i + pts.length - 1) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
    if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) !== 0) out.push(b);
  }
  return out;
}
// Douglas–Peucker on a closed polygon
export function simplify(poly, tol) {
  if (poly.length < 4) return poly.slice();
  // split at the two farthest-apart points so both halves are open polylines
  let a = 0, b = 0, best = -1;
  for (let i = 0; i < poly.length; i++) { const d = (poly[i][0] - poly[0][0]) ** 2 + (poly[i][1] - poly[0][1]) ** 2; if (d > best) { best = d; b = i; } }
  const dp = (pts) => {
    if (pts.length < 3) return pts;
    const [p, q] = [pts[0], pts[pts.length - 1]], L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1e-9;
    let k = -1, dmax = -1;
    for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs((q[0] - p[0]) * (p[1] - pts[i][1]) - (p[0] - pts[i][0]) * (q[1] - p[1])) / L; if (d > dmax) { dmax = d; k = i; } }
    return dmax <= tol ? [p, q] : [...dp(pts.slice(0, k + 1)).slice(0, -1), ...dp(pts.slice(k))];
  };
  const h1 = dp(poly.slice(a, b + 1)), h2 = dp([...poly.slice(b), poly[0]]);
  return [...h1.slice(0, -1), ...h2.slice(0, -1)];
}

export function inPolygon(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const segDist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1e-12, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
export function edgeDist(poly, x, y) { let d = Infinity; for (let i = 0; i < poly.length; i++) d = Math.min(d, segDist([x, y], poly[i], poly[(i + 1) % poly.length])); return d; }

// Bowyer–Watson Delaunay; points [[x, y]], returns triangle index triples (counter-clockwise)
export function delaunay(points) {
  const n = points.length;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of points) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const d = Math.max(x1 - x0, y1 - y0) || 1, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const P = [...points, [cx - 20 * d, cy - d], [cx, cy + 20 * d], [cx + 20 * d, cy - d]];
  const circ = (a, b, c) => {
    const [ax, ay] = P[a], [bx, by] = P[b], [qx, qy] = P[c], D = 2 * (ax * (by - qy) + bx * (qy - ay) + qx * (ay - by)) || 1e-12;
    const ux = ((ax * ax + ay * ay) * (by - qy) + (bx * bx + by * by) * (qy - ay) + (qx * qx + qy * qy) * (ay - by)) / D;
    const uy = ((ax * ax + ay * ay) * (qx - bx) + (bx * bx + by * by) * (ax - qx) + (qx * qx + qy * qy) * (bx - ax)) / D;
    return { a, b, c, x: ux, y: uy, r2: (ax - ux) ** 2 + (ay - uy) ** 2 };
  };
  let tris = [circ(n, n + 1, n + 2)];
  for (let i = 0; i < n; i++) {
    const [px, py] = P[i], bad = [], keep = [];
    for (const t of tris) ((px - t.x) ** 2 + (py - t.y) ** 2 < t.r2 * (1 + 1e-12) ? bad : keep).push(t);
    const edges = new Map();
    for (const t of bad) for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) { const k = u < v ? `${u},${v}` : `${v},${u}`; edges.set(k, edges.has(k) ? null : [u, v]); }
    tris = keep;
    for (const e of edges.values()) if (e) tris.push(circ(e[0], e[1], i));
  }
  const out = [];
  for (const t of tris) {
    if (t.a >= n || t.b >= n || t.c >= n) continue;
    const [ax, ay] = P[t.a], [bx, by] = P[t.b], [qx, qy] = P[t.c];
    out.push((bx - ax) * (qy - ay) - (by - ay) * (qx - ax) > 0 ? [t.a, t.b, t.c] : [t.a, t.c, t.b]);
  }
  return out;
}

// outline (uv, v down) + interior points every `spacing` (uv units) at least spacing/2 from the edge →
// { uvs, triangles, hull } with the outline points first (hull = outline length)
export function meshFromOutline(outline, { spacing = 0.2, aspect = 1 } = {}) {
  const pts = outline.map((p) => p.slice());
  if (spacing > 0) {
    const sx = spacing, sy = spacing * aspect;
    for (let v = sy / 2; v < 1; v += sy) for (let u = sx / 2; u < 1; u += sx) if (inPolygon(outline, u, v) && edgeDist(outline, u, v) > spacing * 0.45) pts.push([u, v]);
  }
  const tris = delaunay(pts).filter(([a, b, c]) => {
    const mx = (pts[a][0] + pts[b][0] + pts[c][0]) / 3, my = (pts[a][1] + pts[b][1] + pts[c][1]) / 3;
    return inPolygon(outline, mx, my);
  });
  const r = (x) => Math.round(x * 1e4) / 1e4;
  return { uvs: pts.flatMap(([u, v]) => [r(u), r(v)]), triangles: tris.flat(), hull: outline.length };
}
