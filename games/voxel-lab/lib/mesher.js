// Voxel Lab - greedy mesher: one 32^3 chunk -> axis-aligned rectangles of up to 32x32 voxels.
// Each quad carries face, material, "fresh fracture" / "loose" flags from the pristine mask and which of its
// edges are convex edges that existed when built (only those get a bevel).
// Techniques studied from Voxel Engine by mattshumer (spawn.co), analysis/voxel-render.md §1.2, §3.4, §13.1; code is our own.
import { isTransparent } from './materials.js';

const P3 = 34 * 34 * 34;
const mats = new Uint8Array(P3), pris = new Uint8Array(P3);
const mask = new Int32Array(32 * 32);
const AX_A = [2, 0, 0], AX_B = [1, 2, 1], CROSS = [-1, -1, 1];
const STR = [1, 34 * 34, 34]; // padded strides for x, y, z

class Buf {
  constructor() { this.cap = 4096; this.pos = new Float32Array(this.cap * 12); this.info = new Uint8Array(this.cap * 16); this.quad = new Uint8Array(this.cap * 16); this.n = 0; }
  grow() { this.cap *= 2; const p = new Float32Array(this.cap * 12); p.set(this.pos); this.pos = p; const i = new Uint8Array(this.cap * 16); i.set(this.info); this.info = i; const q = new Uint8Array(this.cap * 16); q.set(this.quad); this.quad = q; }
  take() {
    const n = this.n; if (!n) return null;
    const idx = n * 4 > 65535 ? new Uint32Array(n * 6) : new Uint16Array(n * 6);
    for (let q = 0, o = 0; q < n; q++, o += 6) { const v = q * 4; idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2; idx[o + 3] = v; idx[o + 4] = v + 2; idx[o + 5] = v + 3; }
    return { n, pos: this.pos.slice(0, n * 12), info: this.info.slice(0, n * 16), quad: this.quad.slice(0, n * 16), idx };
  }
}
const opaque = new Buf(), glass = new Buf();
const c = [0, 0, 0];

/** @returns {{opaque: object|null, glass: object|null}} */
export function meshChunk(grid, id) {
  opaque.n = 0; glass.n = 0;
  if (!grid.count[id]) return { opaque: null, glass: null };
  grid.padded(id, mats, pris);
  const bx = (id % grid.cx) * 32, bz = (((id / grid.cx) | 0) % grid.cz) * 32, by = ((id / (grid.cx * grid.cz)) | 0) * 32;
  const base = [bx, by, bz];
  for (let d = 0; d < 3; d++) {
    const a = AX_A[d], b = AX_B[d], sd = STR[d], sa = STR[a], sb = STR[b];
    for (let s = 0; s < 2; s++) {
      const face = d * 2 + s, nd = s ? sd : -sd;
      const aligned = (s === 1) === (CROSS[d] > 0);
      for (let k = 0; k < 32; k++) {
        // build the mask of this slice
        let any = false;
        const o0 = 1 + 34 + 34 * 34 + k * sd; // padded index of voxel (0,0,0) in-plane, k along d
        for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) {
          const p = o0 + i * sa + j * sb, m = mats[p];
          let key = 0;
          if (m) {
            const nb = mats[p + nd], tm = isTransparent[m];
            if (nb === 0 || (!tm && isTransparent[nb])) {
              key = m | (tm << 10);
              if (!pris[p]) key |= 512; else if (nb === 0 && pris[p + nd]) key |= 256;
              any = true;
            }
          }
          mask[i + 32 * j] = key;
        }
        if (!any) continue;
        for (let j = 0; j < 32; j++) for (let i = 0; i < 32;) {
          const key = mask[i + 32 * j];
          if (!key) { i++; continue; }
          let w = 1; while (i + w < 32 && mask[i + w + 32 * j] === key) w++;
          let h = 1;
          outer: for (; j + h < 32; h++) for (let q = 0; q < w; q++) if (mask[i + q + 32 * (j + h)] !== key) break outer;
          for (let jj = 0; jj < h; jj++) for (let q = 0; q < w; q++) mask[i + q + 32 * (j + jj)] = 0;
          // convex built edges
          let edges = 0;
          if (!(key & 768)) {
            const p00 = o0 + i * sa + j * sb;
            let ok = true; for (let q = 0; q < h && ok; q++) { const p = p00 - sa + q * sb; if (mats[p] || pris[p]) ok = false; } if (ok) edges |= 1;
            ok = true; for (let q = 0; q < h && ok; q++) { const p = p00 + w * sa + q * sb; if (mats[p] || pris[p]) ok = false; } if (ok) edges |= 2;
            ok = true; for (let q = 0; q < w && ok; q++) { const p = p00 - sb + q * sa; if (mats[p] || pris[p]) ok = false; } if (ok) edges |= 4;
            ok = true; for (let q = 0; q < w && ok; q++) { const p = p00 + h * sb + q * sa; if (mats[p] || pris[p]) ok = false; } if (ok) edges |= 8;
          }
          const B = (key & 1024) ? glass : opaque;
          if (B.n >= B.cap) B.grow();
          const qn = B.n++, vo = qn * 12, io = qn * 16;
          // corners: (0,0) (w,0) (w,h) (0,h), reversed when the natural winding faces inward
          for (let v = 0; v < 4; v++) {
            const vv = aligned ? v : (v === 1 ? 3 : v === 3 ? 1 : v);
            const du = (vv === 1 || vv === 2) ? w : 0, dv = vv >= 2 ? h : 0;
            c[d] = base[d] + k + s; c[a] = base[a] + i + du; c[b] = base[b] + j + dv;
            B.pos[vo + v * 3] = c[0]; B.pos[vo + v * 3 + 1] = c[1]; B.pos[vo + v * 3 + 2] = c[2];
            B.info[io + v * 4] = face; B.info[io + v * 4 + 1] = key & 255; B.info[io + v * 4 + 2] = (key >> 8) & 3; B.info[io + v * 4 + 3] = edges;
            B.quad[io + v * 4] = du; B.quad[io + v * 4 + 1] = dv; B.quad[io + v * 4 + 2] = w; B.quad[io + v * 4 + 3] = h;
          }
          i += w;
        }
      }
    }
  }
  return { opaque: opaque.take(), glass: glass.take() };
}
