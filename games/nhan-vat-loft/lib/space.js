// Parametric body space: a loft body = mean + sum_k w_k * sigma_k * PC_k, decoded into a loft table (lib/loft.js).
// table: { type:'space', layout, mean:[...], pcs:[[...]], sigma:[...], height, ref }   opts: { w:[...], height }
import { buildLoft } from './loft.js';

export function decode(space, w = [], height) {
  const x = space.mean.slice();
  space.pcs.forEach((pc, k) => { const a = (w[k] || 0) * space.sigma[k]; if (a) for (let i = 0; i < x.length; i++) x[i] += a * pc[i]; });
  const H = height || space.height, L = space.layout; let o = 0;
  const joints = {};
  for (const n of L.joints) { joints[n] = [x[o] * H, x[o + 1] * H, x[o + 2] * H]; o += 3; }
  const chains = L.chains.map((c) => {
    const ext = [Math.max(0.001, x[o] * H), Math.max(0.001, x[o + 1] * H)]; o += 2;
    const rings = []; for (let r = 0; r < c.nr; r++) { const row = []; for (let q = 0; q < L.ringLen; q++) row.push(x[o++] * H); rings.push(row); }
    const mat = []; for (let r = 0; r < c.nr; r++) mat.push(x[o++]);
    return { name: c.name, joints: c.joints, ext, counts: c.counts, bones: c.bones, ref: c.ref, kind: L.kind, rings, mat };
  });
  return { type: 'loft', kind: L.kind, height: H, ref: space.ref, joints, chains };
}
export function buildFromSpace(space, opts = {}) { const t = decode(space, opts.w || space.w, opts.height); const a = buildLoft(t, opts); a.joints = t.joints; return a; }
