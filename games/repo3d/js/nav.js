// Grid navigation on a housegen layout. Cell (x, y) is world (x + 0.5, z = y + 0.5), 1 tile = 1 m.
// Walkable: floor or door zone, no blocking prop, not inside a jammed door. A* with 8 directions, no corner cutting,
// a cost penalty next to walls (keeps capsules off the walls), string-pulled waypoints. One Nav per layout (cached).
import { heightAt as hAt, stepOK } from './floors.js';
const SQ2 = Math.SQRT2;
const cache = new WeakMap();

export function navFor(layout) {
  let n = cache.get(layout);
  if (!n) { n = new Nav(layout); cache.set(layout, n); }
  return n;
}

export class Nav {
  constructor(L) {
    const W = this.W = L.w, H = this.H = L.h;
    this.L = L;
    this.hc = L.hcell || null;   // floors: cell heights; neighbours further apart than STEP_MAX are not connected
    const walk = this.walk = new Uint8Array(W * H);
    const opaque = this.opaque = new Uint8Array(W * H);
    const jam = new Uint8Array(W * H);
    this.doorOf = new Int16Array(W * H).fill(-1);
    L.doors.forEach((d, di) => {
      for (let y = d.y0; y < d.y0 + d.zh; y++) for (let x = d.x0; x < d.x0 + d.zw; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (d.jammed) jam[y * W + x] = 1;
        this.doorOf[y * W + x] = di;
      }
    });
    for (let i = 0; i < W * H; i++) {
      const g = L.grid[i];
      walk[i] = (g === 1 || g === 3) && !L.block[i] && !jam[i] ? 1 : 0;
      opaque[i] = g === 0 || g === 2 ? 1 : 0;
    }
    // distance to the nearest non-walkable cell (chebyshev, capped 3) -> extra cost
    const near = this.near = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (!walk[i]) continue;
      let d = 3;
      for (let r = 1; r < 3 && d === 3; r++) for (let dy = -r; dy <= r && d === 3; dy++) for (let dx = -r; dx <= r; dx++) if (!this.ok(x + dx, y + dy)) { d = r; break; }
      near[i] = d;
    }
    this.g = new Float32Array(W * H);
    this.from = new Int32Array(W * H);
    this.seen = new Uint32Array(W * H);
    this.stamp = 0;
    this.heap = new Int32Array(W * H + 8);
    this.f = new Float32Array(W * H);
    this.pathCache = new Map();
    this.cells = [];
    for (let i = 0; i < W * H; i++) if (walk[i] && near[i] >= 2) this.cells.push(i);
  }

  /** Doors unjammed after build (Pick's unlock): make their tiles walkable again. */
  refreshJams() {
    const L = this.L, W = this.W;
    for (const d of L.doors) {
      if (d.jammed) continue;
      for (let y = d.y0; y < d.y0 + d.zh; y++) for (let x = d.x0; x < d.x0 + d.zw; x++) {
        if (x < 0 || y < 0 || x >= W || y >= this.H) continue;
        const i = y * W + x, g = L.grid[i];
        this.walk[i] = (g === 1 || g === 3) && !L.block[i] ? 1 : 0;
      }
    }
    this.pathCache.clear();
  }

  /** Floor height at a world point (ramps interpolate), 0 without floors. */
  heightAt(x, z) { return this.hc ? hAt(this.L, x, z) : 0; }
  /** Floor level (-1, 0, 1) of the cell under a world point. */
  floorAt(x, z) { const f = this.L.floorOf; if (!f) return 0; const cx = Math.floor(x), cy = Math.floor(z); return cx < 0 || cy < 0 || cx >= this.W || cy >= this.H ? 0 : f[cy * this.W + cx]; }
  step(i, j) { return !this.hc || stepOK(this.L, i, j); }

  ok(x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.H && this.walk[y * this.W + x] === 1; }
  okW(x, z) { return this.ok(Math.floor(x), Math.floor(z)); }
  center(i) { return { x: (i % this.W) + 0.5, z: Math.floor(i / this.W) + 0.5 }; }

  /** Nearest walkable cell index to a world point (spiral up to r cells), or -1. */
  nearest(x, z, r = 4) {
    const cx = Math.floor(x), cy = Math.floor(z);
    if (this.ok(cx, cy)) return cy * this.W + cx;
    let best = -1, bd = 1e9;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (!this.ok(cx + dx, cy + dy)) continue;
      const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = (cy + dy) * this.W + cx + dx; }
    }
    return best;
  }

  /** Grid line of sight between two world points: walls and void block; door zones count as open. */
  los(ax, az, bx, bz) {
    const W = this.W;
    let x = Math.floor(ax), y = Math.floor(az);
    const tx = Math.floor(bx), ty = Math.floor(bz);
    const dx = bx - ax, dz = bz - az;
    const sx = Math.sign(dx), sy = Math.sign(dz);
    const tdx = sx ? Math.abs(1 / dx) : Infinity, tdy = sy ? Math.abs(1 / dz) : Infinity;
    let mx = sx > 0 ? (x + 1 - ax) * tdx : sx < 0 ? (ax - x) * tdx : Infinity;
    let my = sy > 0 ? (y + 1 - az) * tdy : sy < 0 ? (az - y) * tdy : Infinity;
    const hc = this.hc, ha = hc ? this.heightAt(ax, az) : 0, hb = hc ? this.heightAt(bx, bz) : 0, lo = Math.min(ha, hb) - 0.7, hi = Math.max(ha, hb) + 0.7;
    for (let n = 0; n < 400; n++) {
      if (x < 0 || y < 0 || x >= W || y >= this.H || this.opaque[y * W + x]) return false;
      if (hc && (hc[y * W + x] < lo || hc[y * W + x] > hi)) return false;   // a floor slab or a stairwell edge in between
      if (x === tx && y === ty) return true;
      if (mx < my) { mx += tdx; x += sx; } else { my += tdy; y += sy; }
    }
    return false;
  }

  /** A capsule of radius r can walk straight from a to b (samples the corridor every 0.25 m). */
  clear(ax, az, bx, bz, r = 0.4) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 0.25));
    const px = -(bz - az) / (L || 1) * r, pz = (bx - ax) / (L || 1) * r;
    let hp = this.hc ? this.heightAt(ax, az) : 0;
    for (let i = 0; i <= n; i++) {
      const k = i / n, x = ax + (bx - ax) * k, z = az + (bz - az) * k;
      if (!this.okW(x, z) || !this.okW(x + px, z + pz) || !this.okW(x - px, z - pz)) return false;
      if (this.hc) {   // no step along the corridor or across its width (the ramp's edge)
        const h0 = this.heightAt(x, z);
        if (Math.abs(h0 - hp) > 0.3 || Math.abs(this.heightAt(x + px, z + pz) - h0) > 0.45 || Math.abs(this.heightAt(x - px, z - pz) - h0) > 0.45) return false;
        hp = h0;
      }
    }
    return true;
  }

  /** World-space waypoints from a to b (last point = b's cell centre or b itself), or null. */
  path(ax, az, bx, bz, maxExpand = 9000) {
    const W = this.W;
    const s = this.nearest(ax, az), t = this.nearest(bx, bz, 3);
    if (s < 0 || t < 0) return null;
    const key = s * 65536 + t;
    const hit = this.pathCache.get(key);
    if (hit) return hit.map((p) => ({ ...p }));
    const st = ++this.stamp, g = this.g, f = this.f, from = this.from, seen = this.seen, heap = this.heap;
    const tx = t % W, ty = (t / W) | 0;
    const h = (i) => { const x = i % W, y = (i / W) | 0, dx = Math.abs(x - tx), dy = Math.abs(y - ty); return Math.max(dx, dy) + (SQ2 - 1) * Math.min(dx, dy); };
    let hn = 0;
    const push = (i) => { let k = hn++; heap[k] = i; while (k > 0) { const p = (k - 1) >> 1; if (f[heap[p]] <= f[i]) break; heap[k] = heap[p]; heap[p] = i; k = p; } };
    const pop = () => { const top = heap[0]; const last = heap[--hn]; let k = 0; heap[0] = last; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < hn && f[heap[l]] < f[heap[m]]) m = l; if (r < hn && f[heap[r]] < f[heap[m]]) m = r; if (m === k) break; heap[k] = heap[m]; heap[m] = last; k = m; } return top; };
    seen[s] = st; g[s] = 0; f[s] = h(s); from[s] = -1; push(s);
    const closed = st + 0x80000000;
    let found = false, n = 0;
    while (hn > 0 && n++ < maxExpand) {
      const i = pop();
      if (i === t) { found = true; break; }
      if (seen[i] === closed) continue;
      seen[i] = closed;
      const x = i % W, y = (i / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (!this.ok(nx, ny)) continue;
        if (dx && dy && (!this.ok(x + dx, y) || !this.ok(x, y + dy))) continue;
        const j = ny * W + nx;
        if (this.hc && (!this.step(i, j) || (dx && dy && (!this.step(i, y * W + nx) || !this.step(i, ny * W + x))))) continue;
        if (seen[j] === closed) continue;
        const pen = this.near[j] === 1 ? 2.5 : this.near[j] === 2 ? 0.4 : 0;
        const ng = g[i] + (dx && dy ? SQ2 : 1) + pen;
        if (seen[j] === st && ng >= g[j]) continue;
        seen[j] = st; g[j] = ng; f[j] = ng + h(j); from[j] = i; push(j);
      }
    }
    if (!found) return null;
    const cells = [];
    for (let i = t; i >= 0; i = from[i]) cells.push(i);
    cells.reverse();
    // string pull: keep a waypoint only when the straight capsule walk from the last kept one is blocked
    const pts = [];
    let a = this.center(cells[0]);
    for (let k = 1; k < cells.length; k++) {
      const c = this.center(cells[k]);
      if (k === cells.length - 1 || !this.clear(a.x, a.z, this.center(cells[k + 1]).x, this.center(cells[k + 1]).z)) { pts.push(c); a = c; }
    }
    if (!pts.length) pts.push(this.center(t));
    if (this.pathCache.size > 256) this.pathCache.clear();
    this.pathCache.set(key, pts.map((p) => ({ ...p })));
    return pts;
  }

  /** A random walkable cell (with clearance) between rmin and rmax metres from (x, z). */
  randomNear(rng, x, z, rmin, rmax, tries = 40) {
    for (let k = 0; k < tries; k++) {
      const a = rng() * Math.PI * 2, r = rmin + (rmax - rmin) * rng();
      const i = this.nearest(x + Math.cos(a) * r, z + Math.sin(a) * r, 1);
      if (i >= 0 && this.near[i] >= 2) return this.center(i);
    }
    return null;
  }
}
