// Walkable grid for agents: the baked NavMesh (main component) rasterised at CELL metres, minus the NavMeshObstacle
// boxes that are currently solid (Unity carves them at runtime; the bake ignores them). A* over 8-neighbour cells,
// then line-of-sight smoothing. Rebuild the obstacle mask with `refresh()` when objects unlock.
import { footprint } from './nav.js';

const CELL = 0.5;

export class GridNav {
  constructor(nav, { radius = 1.2, margin = 4 } = {}) {
    this.nav = nav;
    this.radius = radius;
    const box = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
    nav.polys.forEach((ps, i) => {
      if (nav.comp[i] !== nav.mainComp) return;
      const b = nav.box[i];
      box.x0 = Math.min(box.x0, b[0]); box.z0 = Math.min(box.z0, b[1]);
      box.x1 = Math.max(box.x1, b[2]); box.z1 = Math.max(box.z1, b[3]);
    });
    this.x0 = box.x0 - margin; this.z0 = box.z0 - margin;
    this.w = Math.ceil((box.x1 - box.x0 + 2 * margin) / CELL);
    this.h = Math.ceil((box.z1 - box.z0 + 2 * margin) / CELL);
    this.base = new Uint8Array(this.w * this.h);
    nav.polys.forEach((ps, i) => {
      if (nav.comp[i] !== nav.mainComp) return;
      const b = nav.box[i];
      const cx0 = Math.max(0, Math.floor((b[0] - this.x0) / CELL)), cx1 = Math.min(this.w - 1, Math.ceil((b[2] - this.x0) / CELL));
      const cz0 = Math.max(0, Math.floor((b[1] - this.z0) / CELL)), cz1 = Math.min(this.h - 1, Math.ceil((b[3] - this.z0) / CELL));
      for (let cz = cz0; cz <= cz1; cz++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const k = cz * this.w + cx;
          if (!this.base[k] && nav.contains(i, this.x0 + (cx + 0.5) * CELL, this.z0 + (cz + 0.5) * CELL)) this.base[k] = 1;
        }
      }
    });
    this.walk = this.base.slice();
    this.solidKey = '';
  }

  // isSolid(obstacle) decides which NavMeshObstacle boxes block; cheap to call every frame (only rebuilds on change).
  refresh(isSolid) {
    const solid = this.nav.obstacles.map(o => (isSolid(o) ? 1 : 0));
    const key = solid.join('');
    if (key === this.solidKey) return;
    this.solidKey = key;
    this.walk = this.base.slice();
    this.nav.obstacles.forEach((o, i) => {
      if (!solid[i]) return;
      const f = footprint(o);
      const hu = f.hu + this.radius, hv = f.hv + this.radius;
      const ext = Math.hypot(hu, hv);
      const cx0 = Math.max(0, Math.floor((f.cx - ext - this.x0) / CELL)), cx1 = Math.min(this.w - 1, Math.ceil((f.cx + ext - this.x0) / CELL));
      const cz0 = Math.max(0, Math.floor((f.cz - ext - this.z0) / CELL)), cz1 = Math.min(this.h - 1, Math.ceil((f.cz + ext - this.z0) / CELL));
      for (let cz = cz0; cz <= cz1; cz++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const dx = this.x0 + (cx + 0.5) * CELL - f.cx, dz = this.z0 + (cz + 0.5) * CELL - f.cz;
          const lu = dx * f.ux + dz * f.uz, lv = dx * f.vx + dz * f.vz;
          if (Math.abs(lu) < hu && Math.abs(lv) < hv) this.walk[cz * this.w + cx] = 0;
        }
      }
    });
  }

  cell(p) {
    return [Math.floor((p.x - this.x0) / CELL), Math.floor((p.z - this.z0) / CELL)];
  }

  ok(cx, cz) {
    return cx >= 0 && cz >= 0 && cx < this.w && cz < this.h && this.walk[cz * this.w + cx] === 1;
  }

  nearestOpen(cx, cz) {
    if (this.ok(cx, cz)) return [cx, cz];
    for (let r = 1; r < 60; r++) {
      let best = null, bd = Infinity;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r || !this.ok(cx + dx, cz + dz)) continue;
          const d = dx * dx + dz * dz;
          if (d < bd) { bd = d; best = [cx + dx, cz + dz]; }
        }
      }
      if (best) return best;
    }
    return null;
  }

  los(a, b) {
    const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (!this.ok(Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t))) return false;
    }
    return true;
  }

  // Waypoints from `from` to `to` (both {x,z}); the last point is the exact target when it is walkable.
  path(from, to) {
    const s = this.nearestOpen(...this.cell(from)), g = this.nearestOpen(...this.cell(to));
    if (!s || !g) return [to];
    const W = this.w, N = W * this.h;
    const gScore = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const si = s[1] * W + s[0], gi = g[1] * W + g[0];
    const heap = [[0, si]];
    gScore[si] = 0;
    const hfn = k => Math.hypot(k % W - g[0], Math.floor(k / W) - g[1]);
    const push = (f, k) => {
      heap.push([f, k]);
      let i = heap.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
        }
      }
      return top;
    };
    let found = false;
    while (heap.length) {
      const [, k] = pop();
      if (closed[k]) continue;
      if (k === gi) { found = true; break; }
      closed[k] = 1;
      const cx = k % W, cz = (k - cx) / W;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx, nz = cz + dz;
          if (!this.ok(nx, nz)) continue;
          if (dx && dz && (!this.ok(cx + dx, cz) || !this.ok(cx, cz + dz))) continue;
          const nk = nz * W + nx, ng = gScore[k] + (dx && dz ? 1.4142 : 1);
          if (ng < gScore[nk]) { gScore[nk] = ng; came[nk] = k; push(ng + hfn(nk), nk); }
        }
      }
    }
    if (!found) return [to];
    const cells = [];
    for (let k = gi; k !== -1; k = came[k]) cells.push([k % W, Math.floor(k / W)]);
    cells.reverse();
    const pts = [];
    let anchor = cells[0];
    for (let i = 1; i < cells.length; i++) {
      if (!this.los(anchor, cells[i])) { anchor = cells[i - 1]; pts.push(anchor); }
    }
    const out = pts.map(([cx, cz]) => ({ x: this.x0 + (cx + 0.5) * CELL, y: 0, z: this.z0 + (cz + 0.5) * CELL }));
    out.push(this.ok(...this.cell(to)) ? { x: to.x, y: 0, z: to.z } : { x: this.x0 + (g[0] + 0.5) * CELL, y: 0, z: this.z0 + (g[1] + 0.5) * CELL });
    return out;
  }
}
