// Voxel Lab - deterministic integer hashes (no global RNG stream, so the order of work cannot change a result).
// Techniques studied from Voxel Engine by mattshumer (spawn.co): destruction.md §10 "Randomness"; code is our own.

/** 32-bit avalanche */
export function mix32(h) {
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}
/** hash of three integers and a seed -> uint32 */
export function hash3(x, y, z, s = 0) {
  return mix32((Math.imul(x | 0, 0x1f1f1f1f) ^ Math.imul(y | 0, 0x3c6ef372) ^ Math.imul(z | 0, 0x2545f491) ^ Math.imul(s | 0, 0x9e3779b1)) | 0);
}
/** hash -> float in [0, 1) */
export function hash3f(x, y, z, s = 0) { return hash3(x, y, z, s) / 4294967296; }

/**
 * Seeded generator for content generation (buildings, mobs). Returns a function r() in [0,1) with helpers:
 * r.int(a, b) inclusive, r.pick(array), r.chance(p), r.range(a, b).
 */
export function rng(seed) {
  let s = mix32((seed | 0) ^ 0x6d2b79f5) || 1;
  const r = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  r.int = (a, b) => a + Math.floor(r() * (b - a + 1));
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  r.range = (a, b) => a + r() * (b - a);
  return r;
}

/** FNV-style digest of a byte array, for determinism checks */
export function digestBytes(u8, h = 0x811c9dc5) {
  for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
