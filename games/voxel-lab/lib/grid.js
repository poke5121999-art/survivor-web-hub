// Voxel Lab - chunked voxel store: 0.1 m voxels in 32^3 chunks with a pristine ("solid as built") mask.
// Techniques studied from Voxel Engine by mattshumer (spawn.co), analysis/destruction.md §1 and §12.1; code is our own.

export const CH = 32, CH3 = CH * CH * CH;
export const VOXEL = 0.1;

export class VoxelGrid {
  /** dims in voxels (rounded up to whole chunks) */
  constructor(sx, sy, sz) {
    this.cx = Math.max(1, Math.ceil(sx / CH)); this.cy = Math.max(1, Math.ceil(sy / CH)); this.cz = Math.max(1, Math.ceil(sz / CH));
    this.sx = this.cx * CH; this.sy = this.cy * CH; this.sz = this.cz * CH;
    const n = this.cx * this.cy * this.cz;
    this.nChunks = n;
    this.chunks = new Array(n).fill(null);   // Uint8Array(32768) material ids, index x + 32*(z + 32*y)
    this.pris = new Array(n).fill(null);     // Uint8Array(4096) bitset: voxel was solid when built
    this.count = new Int32Array(n);          // solid voxels per chunk
    this.meshDirty = new Uint8Array(n);
    this.densDirty = new Uint8Array(n);
    this.dirtyList = [];                     // chunk ids with meshDirty
    this.densList = [];
    this.solid = 0;                          // total solid voxels
    this.onSet = null;                       // optional hook (x, y, z, old, now)
  }
  inside(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz; }
  cid(x, y, z) { return (x >> 5) + this.cx * ((z >> 5) + this.cz * (y >> 5)); }
  get(x, y, z) {
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return 0;
    const c = this.chunks[(x >> 5) + this.cx * ((z >> 5) + this.cz * (y >> 5))];
    return c ? c[(x & 31) + 32 * ((z & 31) + 32 * (y & 31))] : 0;
  }
  wasSolid(x, y, z) {
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return 0;
    const p = this.pris[(x >> 5) + this.cx * ((z >> 5) + this.cz * (y >> 5))];
    if (!p) return 0;
    const i = (x & 31) + 32 * ((z & 31) + 32 * (y & 31));
    return (p[i >> 3] >> (i & 7)) & 1;
  }
  markDirty(id) {
    if (!this.meshDirty[id]) { this.meshDirty[id] = 1; this.dirtyList.push(id); }
    if (!this.densDirty[id]) { this.densDirty[id] = 1; this.densList.push(id); }
  }
  /** set a voxel; returns the old material. `pristine`: 1 marks it as built, 0 leaves the mask, -1 clears the bit */
  set(x, y, z, m, pristine = 0) {
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return 0;
    const id = (x >> 5) + this.cx * ((z >> 5) + this.cz * (y >> 5));
    let c = this.chunks[id];
    const lx = x & 31, ly = y & 31, lz = z & 31, i = lx + 32 * (lz + 32 * ly);
    if (!c) { if (!m) return 0; c = this.chunks[id] = new Uint8Array(CH3); }
    const old = c[i];
    if (pristine) {
      let p = this.pris[id]; if (!p) p = this.pris[id] = new Uint8Array(CH3 >> 3);
      if (pristine > 0 && m) p[i >> 3] |= 1 << (i & 7); else p[i >> 3] &= ~(1 << (i & 7));
    }
    if (old === m) { if (pristine) this.markDirty(id); return old; }
    c[i] = m;
    if (!old) { this.count[id]++; this.solid++; } else if (!m) { this.count[id]--; this.solid--; }
    this.markDirty(id);
    // faces on a chunk border belong to the neighbour's mesh too
    if (lx === 0 && x > 0) this.markDirty(id - 1); else if (lx === 31 && x < this.sx - 1) this.markDirty(id + 1);
    if (lz === 0 && z > 0) this.markDirty(id - this.cx); else if (lz === 31 && z < this.sz - 1) this.markDirty(id + this.cx);
    const L = this.cx * this.cz;
    if (ly === 0 && y > 0) this.markDirty(id - L); else if (ly === 31 && y < this.sy - 1) this.markDirty(id + L);
    if (this.onSet) this.onSet(x, y, z, old, m);
    return old;
  }
  /** iterate solid voxels: fn(x, y, z, m) */
  forEach(fn) {
    for (let id = 0; id < this.nChunks; id++) {
      const c = this.chunks[id]; if (!c || !this.count[id]) continue;
      const bx = (id % this.cx) * 32, bz = (((id / this.cx) | 0) % this.cz) * 32, by = ((id / (this.cx * this.cz)) | 0) * 32;
      for (let i = 0; i < CH3; i++) { const m = c[i]; if (m) fn(bx + (i & 31), by + (i >> 10), bz + ((i >> 5) & 31), m); }
    }
  }
  /** fill a 34^3 padded copy of a chunk (materials and pristine flags) for the mesher */
  padded(id, mats, pris) {
    const cxi = id % this.cx, czi = ((id / this.cx) | 0) % this.cz, cyi = (id / (this.cx * this.cz)) | 0;
    const bx = cxi * 32 - 1, by = cyi * 32 - 1, bz = czi * 32 - 1;
    const c = this.chunks[id], p = this.pris[id];
    for (let y = 0; y < 34; y++) for (let z = 0; z < 34; z++) {
      const o = 34 * (z + 34 * y);
      const core = y >= 1 && y <= 32 && z >= 1 && z <= 32;
      if (core && c) {
        const ci = 32 * ((z - 1) + 32 * (y - 1));
        for (let x = 1; x <= 32; x++) { const i = ci + x - 1; mats[o + x] = c[i]; pris[o + x] = p ? (p[i >> 3] >> (i & 7)) & 1 : 0; }
        mats[o] = this.get(bx, by + y, bz + z); pris[o] = this.wasSolid(bx, by + y, bz + z);
        mats[o + 33] = this.get(bx + 33, by + y, bz + z); pris[o + 33] = this.wasSolid(bx + 33, by + y, bz + z);
      } else {
        for (let x = 0; x < 34; x++) { mats[o + x] = this.get(bx + x, by + y, bz + z); pris[o + x] = this.wasSolid(bx + x, by + y, bz + z); }
      }
    }
  }
}
