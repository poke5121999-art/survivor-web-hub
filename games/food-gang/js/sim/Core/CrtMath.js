// MathF.Sin / MathF.Cos as .NET 8 on Windows x64 computes them: coreclr calls the UCRT sinf/cosf, whose FMA3
// path (taken on every CPU with FMA3) evaluates a double polynomial that is not correctly rounded, so
// Math.fround(Math.sin(x)) differs in ~0.1 % of inputs near |r| = pi/4. Ported instruction by instruction from
// ucrtbase.dll (sinf @0xac360, cosf @0xa7f70); test/food-gang-sim.js checks it against a .NET dump.

const dv = new DataView(new ArrayBuffer(8));

function decompose(d) {
  dv.setFloat64(0, d);
  const hi = dv.getUint32(0), lo = dv.getUint32(4);
  const exp = (hi >>> 20) & 0x7ff;
  let m = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let e;
  if (exp === 0) e = -1074;
  else { m |= 1n << 52n; e = exp - 1075; }
  return [hi >>> 31 ? -m : m, e];
}

/** Double fused multiply-add a*b+c with one rounding (exact BigInt sum, Number() rounds to nearest even). */
export function fma(a, b, c) {
  if (a === 0 || b === 0 || !Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) return a * b + c;
  if (c === 0) return a * b;
  const [ma, ea] = decompose(a), [mb, eb] = decompose(b), [mc, ec] = decompose(c);
  const ep = ea + eb;
  const e = ep < ec ? ep : ec;
  const sum = ((ma * mb) << BigInt(ep - e)) + (mc << BigInt(ec - e));
  if (sum === 0n) return 0;
  return Number(sum) * Math.pow(2, e);
}

const fr = Math.fround;
const S3 = -0.16666666666666666, S5 = 0.008333333333333333, S7 = -0.0001984126984126984, S9 = 2.7557319223985893e-06;
const C4 = 0.041666666666666664, C6 = -0.0013888888888888887, C8 = 2.4801587301587298e-05, C10 = -2.755731922398589e-07;
const TWO_BY_PI = 0.6366197723675814, PI_BY_2_HEAD = 1.5707963267341256, PI_BY_2_TAIL = 6.077100506506192e-11;

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

function sinPoly(x) {
  const x2 = x * x;
  let p = fma(x2, S9, S7);
  p = fma(p, x2, S5);
  p = fma(p, x2, S3);
  return fma(p, x * x2, x);
}

// sinf's cosine branch fuses 1 - x^2/2; cosf's does not
function cosPolyFused(x) {
  const x2 = x * x;
  const h = fma(x2, -0.5, 1.0);
  let p = fma(x2, C10, C8);
  p = fma(p, x2, C6);
  p = fma(p, x2, C4);
  return fma(p, x2 * x2, h);
}

function cosPolyPlain(x) {
  const x2 = x * x;
  const h = 1.0 - x2 * 0.5;
  let p = fma(x2, C10, C8);
  p = fma(p, x2, C6);
  p = fma(p, x2, C4);
  return fma(p, x2 * x2, h);
}

let reducedR = 0;
function reduce(ax) {
  const n = Math.trunc(fma(ax, TWO_BY_PI, 0.5));
  const r = fma(-n, PI_BY_2_HEAD, ax);
  reducedR = r - n * PI_BY_2_TAIL;
  return n & 3;
}

export function sinf(x) {
  f32[0] = x;
  const ab = u32[0] & 0x7fffffff;
  if (ab >= 0x7f800000) return NaN;
  if (ab <= 0x3f490fdb) {
    if (ab < 0x39000000) return x;
    if (ab < 0x3c000000) return fr(fma(-(x * x * x), 0.16666666666666666, x));
    return fr(sinPoly(x));
  }
  if (ab >= 0x4b800456) throw new Error('sinf: argument ' + x + ' beyond the ported range reduction');
  const region = reduce(Math.abs(x));
  let v = region & 1 ? cosPolyFused(reducedR) : sinPoly(reducedR);
  if (region >= 2) v = -v;
  if (x < 0) v = -v;
  return fr(v);
}

export function cosf(x) {
  f32[0] = x;
  const ab = u32[0] & 0x7fffffff;
  if (ab >= 0x7f800000) return NaN;
  if (ab <= 0x3f490fdb) {
    if (ab < 0x39000000) return 1;
    if (ab < 0x3c000000) return fr(fma(-(x * 0.5), x, 1.0));
    return fr(cosPolyPlain(x));
  }
  if (ab >= 0x4f490fdb) throw new Error('cosf: argument ' + x + ' beyond the ported range reduction');
  const region = reduce(Math.abs(x));
  let v = region & 1 ? sinPoly(reducedR) : cosPolyPlain(reducedR);
  if (((region + 1) >> 1) & 1) v = -v;
  return fr(v);
}
