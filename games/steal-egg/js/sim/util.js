// Small pure helpers shared by the sim modules: seeded random (state lives in sim state so save/load round-trips),
// XZ geometry and the oriented trigger boxes exported by tools/export_data.py ({c, ax:[x,y,z axes], h:[hx,hy,hz]}).

// mulberry32 over a uint32 kept in state.rng.
export function rand(state) {
  let a = (state.rng = (state.rng + 0x6D2B79F5) | 0);
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// UnityEngine.Random.Range(int min, int max): max exclusive.
export const randInt = (state, lo, hi) => lo + Math.min(hi - lo - 1, Math.floor(rand(state) * (hi - lo)));
export const randRange = (state, lo, hi) => lo + rand(state) * (hi - lo);

// Random.insideUnitCircle (rejection sampling).
export function insideUnitCircle(state) {
  for (;;) {
    const x = rand(state) * 2 - 1, y = rand(state) * 2 - 1;
    if (x * x + y * y <= 1) return [x, y];
  }
}

export const d2xz = (a, b) => (a[0] - b[0]) ** 2 + (a[2] - b[2]) ** 2;
export const dxz = (a, b) => Math.sqrt(d2xz(a, b));
export const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const copy = p => [p[0], p[1], p[2]];
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Yaw convention of js/sim/move.js: forward = (sin yaw, 0, cos yaw).
export const yawTo = (from, to) => Math.atan2(to[0] - from[0], to[2] - from[2]);

// Distance on the XZ plane from p to an oriented box (0 inside). Axes that point mostly up are ignored, so a floor
// zone is tested as a footprint whatever its height.
export function boxDistXZ(box, p) {
  const d = [p[0] - box.c[0], 0, p[2] - box.c[2]];
  let out = 0;
  for (let i = 0; i < 3; i++) {
    const a = box.ax[i];
    if (Math.abs(a[1]) > 0.7) continue;
    const proj = d[0] * a[0] + d[2] * a[2];
    const over = Math.abs(proj) - box.h[i];
    if (over > 0) out += over * over;
  }
  return Math.sqrt(out);
}
export const inBoxXZ = (box, p, pad = 0) => boxDistXZ(box, p) <= pad;

// Inside the footprint by at least `margin` metres (an agent of that radius standing fully inside).
export function insideBy(box, p, margin) {
  for (let i = 0; i < 3; i++) {
    const a = box.ax[i];
    if (Math.abs(a[1]) > 0.7) continue;
    if (Math.abs((p[0] - box.c[0]) * a[0] + (p[2] - box.c[2]) * a[2]) > box.h[i] - margin) return false;
  }
  return true;
}

// Axis-aligned XZ bounds of an oriented box (Collider.bounds as Unity reports it).
export function boxBounds(box) {
  let ex = 0, ey = 0, ez = 0;
  for (let i = 0; i < 3; i++) {
    const a = box.ax[i], h = box.h[i];
    ex += Math.abs(a[0]) * h; ey += Math.abs(a[1]) * h; ez += Math.abs(a[2]) * h;
  }
  return { min: [box.c[0] - ex, box.c[1] - ey, box.c[2] - ez], max: [box.c[0] + ex, box.c[1] + ey, box.c[2] + ez], ext: [ex, ey, ez] };
}

// Point at local box coordinates (u, w in [-1, 1] along the two horizontal axes) scaled by (h - pad).
export function boxPoint(box, u, w, pad = 0) {
  const hor = [0, 1, 2].filter(i => Math.abs(box.ax[i][1]) <= 0.7);
  const [i, j] = hor;
  const hi = Math.max(0, box.h[i] - Math.min(pad, 0.8 * box.h[i])), hj = Math.max(0, box.h[j] - Math.min(pad, 0.8 * box.h[j]));
  return [
    box.c[0] + box.ax[i][0] * u * hi + box.ax[j][0] * w * hj,
    box.c[1],
    box.c[2] + box.ax[i][2] * u * hi + box.ax[j][2] * w * hj,
  ];
}
