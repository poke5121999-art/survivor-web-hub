// The single shared RNG stream (splitmix64), bit-identical to FG.Sim.SimRng. The 64-bit state is kept as a
// decimal string so MatchState stays JSON-serializable and matches the C# dump ("state": "<ulong>").
import { f } from './Vec2.js';

const GOLDEN = 0x9E3779B97F4A7C15n;
const MIX1 = 0xBF58476D1CE4E5B9n;
const MIX2 = 0x94D049BB133111EBn;
const INV53 = 1.0 / 9007199254740992.0;

/** new SimRng(seed); seed is a BigInt or number taken modulo 2^64. */
export function createSimRng(seed) {
  const s = BigInt.asUintN(64, BigInt(seed));
  return { state: (s === 0n ? GOLDEN : s).toString() };
}

export function cloneSimRng(r) {
  return { state: r.state };
}

function nextU64(r) {
  const s = BigInt.asUintN(64, BigInt(r.state) + GOLDEN);
  r.state = s.toString();
  let z = BigInt.asUintN(64, (s ^ (s >> 30n)) * MIX1);
  z = BigInt.asUintN(64, (z ^ (z >> 27n)) * MIX2);
  return z ^ (z >> 31n);
}

/** Uniform float in [min, max). min, max are float32 values. */
export function next(r, min, max) {
  const u = Number(nextU64(r) >> 11n) * INV53;
  const v = f(min + f(max - min) * u);
  return v >= max && max > min ? min : v;
}

/** Uniform int in [min, max). */
export function nextInt(r, min, max) {
  if (max <= min) return min;
  return min + Number(nextU64(r) % BigInt(max - min));
}

export const SimRng = Object.freeze({ create: createSimRng, clone: cloneSimRng, next, nextInt });
