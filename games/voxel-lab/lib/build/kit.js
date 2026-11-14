// Voxel Lab - building kit: a small voxel canvas that generators draw into.
// Techniques studied from Voxel Engine by mattshumer (spawn.co); code is our own.
//
// Local coordinates: x = width, y = up (y = 0 is the first voxel layer ABOVE the ground surface),
// z = depth. One voxel is 0.1 m. The FRONT of a building faces -z (z = 0 is the street side).
// All boxes are [min, max): min inclusive, max exclusive.
import { M } from '../materials.js';
import { hash3, rng } from '../hash.js';

export { M, rng, hash3 };

export class Canvas {
  constructor(sx, sy, sz) {
    this.sx = sx | 0; this.sy = sy | 0; this.sz = sz | 0;
    this.v = new Uint8Array(this.sx * this.sy * this.sz);
    /** ground patches painted on the yard surface around/under the building: {x0,z0,x1,z1,m} (may exceed the footprint by up to 20 voxels) */
    this.groundPatches = [];
  }
  inside(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz; }
  idx(x, y, z) { return x + this.sx * (z + this.sz * y); }
  get(x, y, z) { return this.inside(x, y, z) ? this.v[x + this.sx * (z + this.sz * y)] : 0; }
  set(x, y, z, m) { x |= 0; y |= 0; z |= 0; if (this.inside(x, y, z)) this.v[x + this.sx * (z + this.sz * y)] = m; }
  /** fill [x0,x1) x [y0,y1) x [z0,z1) with material m (0 clears) */
  box(x0, y0, z0, x1, y1, z1, m) {
    x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0); z0 = Math.max(0, z0 | 0);
    x1 = Math.min(this.sx, x1 | 0); y1 = Math.min(this.sy, y1 | 0); z1 = Math.min(this.sz, z1 | 0);
    for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) { const o = this.sx * (z + this.sz * y); for (let x = x0; x < x1; x++) this.v[o + x] = m; }
  }
  /** like box but only writes where the canvas is empty */
  boxIfEmpty(x0, y0, z0, x1, y1, z1, m) {
    x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0); z0 = Math.max(0, z0 | 0);
    x1 = Math.min(this.sx, x1 | 0); y1 = Math.min(this.sy, y1 | 0); z1 = Math.min(this.sz, z1 | 0);
    for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) { const o = this.sx * (z + this.sz * y); for (let x = x0; x < x1; x++) if (!this.v[o + x]) this.v[o + x] = m; }
  }
  /** replace material a by b inside a box */
  replace(x0, y0, z0, x1, y1, z1, a, b) {
    x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0); z0 = Math.max(0, z0 | 0);
    x1 = Math.min(this.sx, x1 | 0); y1 = Math.min(this.sy, y1 | 0); z1 = Math.min(this.sz, z1 | 0);
    for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) { const o = this.sx * (z + this.sz * y); for (let x = x0; x < x1; x++) if (this.v[o + x] === a) this.v[o + x] = b; }
  }
  /** four walls of thickness t around [x0,x1) x [z0,z1), from y0 to y1 (no floor, no lid) */
  walls(x0, y0, z0, x1, y1, z1, m, t = 2) {
    this.box(x0, y0, z0, x1, y1, z0 + t, m); this.box(x0, y0, z1 - t, x1, y1, z1, m);
    this.box(x0, y0, z0, x0 + t, y1, z1, m); this.box(x1 - t, y0, z0, x1, y1, z1, m);
  }
  /** vertical cylinder (axis y) centred at (cx, cz) with radius r voxels; hollow if rin > 0 */
  cylY(cx, cz, r, y0, y1, m, rin = 0) {
    for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
      if (d <= r && d >= rin) for (let y = y0; y < y1; y++) this.set(x, y, z, m);
    }
  }
  /** solid sphere / ellipsoid */
  sphere(cx, cy, cz, rx, m, ry = rx, rz = rx) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, dz = (z + 0.5 - cz) / rz;
      if (dx * dx + dy * dy + dz * dz <= 1) this.set(x, y, z, m);
    }
  }
  /** thick 3D line from a to b (voxel coords), square cross-section of side t */
  line(ax, ay, az, bx, by, bz, m, t = 1) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay), Math.abs(bz - az)) * 1.5));
    const h = t / 2;
    for (let i = 0; i <= n; i++) {
      const k = i / n, x = ax + (bx - ax) * k, y = ay + (by - ay) * k, z = az + (bz - az) * k;
      this.box(Math.round(x - h), Math.round(y - h), Math.round(z - h), Math.round(x - h) + t, Math.round(y - h) + t, Math.round(z - h) + t, m);
    }
  }
  /** paint the yard surface (grass by default) under/around the building, e.g. an asphalt forecourt */
  ground(x0, z0, x1, z1, m) { this.groundPatches.push({ x0: x0 | 0, z0: z0 | 0, x1: x1 | 0, z1: z1 | 0, m }); }
  count() { let n = 0; for (let i = 0; i < this.v.length; i++) if (this.v[i]) n++; return n; }
  /**
   * Number of solid voxels NOT connected (6-neighbour) to the y = 0 layer. Must be 0, otherwise that part
   * falls the moment the building is spawned.
   */
  floating() {
    const { sx, sy, sz, v } = this, seen = new Uint8Array(v.length), st = [];
    for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) { const i = x + sx * z; if (v[i]) { seen[i] = 1; st.push(i); } }
    const L = sx * sz;
    while (st.length) {
      const i = st.pop(), x = i % sx, z = ((i / sx) | 0) % sz, y = (i / L) | 0;
      const t = (j) => { if (v[j] && !seen[j]) { seen[j] = 1; st.push(j); } };
      if (x > 0) t(i - 1); if (x < sx - 1) t(i + 1); if (z > 0) t(i - sx); if (z < sz - 1) t(i + sx); if (y > 0) t(i - L); if (y < sy - 1) t(i + L);
    }
    let n = 0; for (let i = 0; i < v.length; i++) if (v[i] && !seen[i]) n++;
    return n;
  }
}
