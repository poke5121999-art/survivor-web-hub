// Generator (a): per-chain lofts of ring profiles -> one skinned triangle mesh on the canonical skeleton.
// Input: a table written by tools/fit.mjs (or composed by hand / by the PCA space). Output: plain typed arrays;
// lib/three-glue.js turns them into a THREE.SkinnedMesh.
import { v3, makePolyline, plPoint, plTangent, frame, ringTs, profR, crom } from './loft-core.js';

export const CANON = ['Root_M', 'Chest_M', 'Neck_M', 'Head_M', 'Shoulder_L', 'Elbow_L', 'Wrist_L', 'Shoulder_R', 'Elbow_R', 'Wrist_R',
  'Hip_L', 'Knee_L', 'Ankle_L', 'Hip_R', 'Knee_R', 'Ankle_R'];
export const PARENT = { Root_M: null, Chest_M: 'Root_M', Neck_M: 'Chest_M', Head_M: 'Neck_M', Shoulder_L: 'Chest_M', Elbow_L: 'Shoulder_L', Wrist_L: 'Elbow_L',
  Shoulder_R: 'Chest_M', Elbow_R: 'Shoulder_R', Wrist_R: 'Elbow_R', Hip_L: 'Root_M', Knee_L: 'Hip_L', Ankle_L: 'Knee_L', Hip_R: 'Root_M', Knee_R: 'Hip_R', Ankle_R: 'Knee_R' };

const sstep = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export function chainPolyline(table, ch) { return makePolyline(ch.joints.map((n) => table.joints[n]), ch.ext); }

// opts: { seg: angular segments (32), sub: rings inserted between table rings (2), kind: override profile kind }
export function buildLoft(table, opts = {}) {
  const S = opts.seg || 32, sub = opts.sub === undefined ? 2 : opts.sub;
  const pos = [], idx = [], si = [], sw = [], partOf = [], col = [];
  const SKIN = opts.skin || [0.95, 0.80, 0.70], CLOTH = opts.cloth || [0.48, 0.56, 0.72];
  const boneIx = Object.fromEntries(CANON.map((n, i) => [n, i]));
  const chains = opts.only ? table.chains.filter((c) => opts.only.includes(c.name)) : table.chains;
  for (const ch of chains) {
    const pl = chainPolyline(table, ch), kind = ch.kind, ref = table.ref[ch.ref];
    const ts = ringTs(pl, ch.counts), R = ch.rings;
    // upsample rings with Catmull-Rom on [t, ...params]
    const rows = R.map((p, i) => [ts[i], ch.mat ? ch.mat[i] : 0, ...p]);
    const up = [];
    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[Math.max(0, i - 1)], b = rows[i], c = rows[i + 1], d = rows[Math.min(rows.length - 1, i + 2)];
      for (let k = 0; k <= sub; k++) up.push(k === 0 ? b : crom(a, b, c, d, k / (sub + 1)));
    }
    up.push(rows[rows.length - 1]);
    const base = pos.length / 3, ringStart = [];
    const joints = ch.joints.length; // interior joints of the extended polyline are P[1..joints]
    for (const row of up) {
      const t = row[0], cm = Math.min(1, Math.max(0, row[1])), p = row.slice(2);
      const rc = [0, 1, 2].map((i) => SKIN[i] + (CLOTH[i] - SKIN[i]) * cm);
      const O = plPoint(pl, t), T = plTangent(pl, t), { u, v } = frame(T, ref);
      const C = v3.add(O, v3.add(v3.scl(u, p[0]), v3.scl(v, p[1])));
      // skin: bone of the extended segment, blended across interior joints
      let seg = 0; while (seg < pl.D.length - 1 && t > pl.S[seg + 1]) seg++;
      let b0 = ch.bones[seg], b1 = b0, w1 = 0;
      for (let k = 1; k < pl.P.length - 1; k++) {
        const w = 0.35 * Math.min(pl.S[k] - pl.S[k - 1], pl.S[k + 1] - pl.S[k]);
        if (w > 1e-9 && Math.abs(t - pl.S[k]) < w) { b0 = ch.bones[k - 1]; b1 = ch.bones[k]; w1 = sstep((t - (pl.S[k] - w)) / (2 * w)); break; }
      }
      ringStart.push(pos.length / 3);
      for (let a = 0; a < S; a++) {
        const th = (a / S) * Math.PI * 2, r = profR(kind, p, th);
        const q = v3.add(C, v3.add(v3.scl(u, r * Math.cos(th)), v3.scl(v, r * Math.sin(th))));
        pos.push(q[0], q[1], q[2]);
        si.push(boneIx[b0], boneIx[b1], 0, 0); sw.push(1 - w1, w1, 0, 0);
        partOf.push(ch.name); col.push(...rc);
      }
    }
    const nr = up.length;
    for (let r = 0; r < nr - 1; r++) for (let a = 0; a < S; a++) {
      const i0 = ringStart[r] + a, i1 = ringStart[r] + (a + 1) % S, j0 = ringStart[r + 1] + a, j1 = ringStart[r + 1] + (a + 1) % S;
      idx.push(i0, i1, j0, i1, j1, j0);
    }
    // caps: fan to the ring centroid
    for (const [r, flip] of [[0, true], [nr - 1, false]]) {
      let c = [0, 0, 0]; for (let a = 0; a < S; a++) c = v3.add(c, pos.slice((ringStart[r] + a) * 3, (ringStart[r] + a) * 3 + 3));
      c = v3.scl(c, 1 / S); const ci = pos.length / 3; pos.push(...c);
      si.push(...si.slice(ringStart[r] * 4, ringStart[r] * 4 + 4)); sw.push(...sw.slice(ringStart[r] * 4, ringStart[r] * 4 + 4)); partOf.push(ch.name); col.push(...col.slice(ringStart[r] * 3, ringStart[r] * 3 + 3));
      for (let a = 0; a < S; a++) { const i0 = ringStart[r] + a, i1 = ringStart[r] + (a + 1) % S; if (flip) idx.push(ci, i1, i0); else idx.push(ci, i0, i1); }
    }
    void base; void joints;
  }
  return { position: new Float32Array(pos), index: new Uint32Array(idx), skinIndex: new Uint16Array(si), skinWeight: new Float32Array(sw), color: new Float32Array(col), partOf };
}

// number of stored numbers in a table (what the code carries)
export function paramCount(table) {
  let n = CANON.length * 3;
  for (const ch of table.chains) { n += 2 + ch.rings.length * (ch.rings[0].length + (ch.mat ? 1 : 0)); if (ch.tip) n += 3; }
  return n;
}
