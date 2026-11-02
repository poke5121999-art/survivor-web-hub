// BigNumber as the game stores it (D:/catsoup-ref/rules/economy.md section 1, BigNumber.c): value = f * 10^e with
// 1 <= |f| < 10. Below 10^4 the game keeps exact integers and truncates fractions after every operation; here values
// under 10^4 are truncated the same way. Plain objects {f, e} so a save is JSON. Prices reach 10^2400.
const GAP = 9; // an addend 9+ orders of magnitude smaller is dropped (BigNumber.c:73)

export function big(f = 0, e = 0) {
  return norm({ f, e });
}

export function fromNumber(n) {
  return norm({ f: n, e: 0 });
}

export function norm(a) {
  let { f, e } = a;
  if (!f || !Number.isFinite(f)) return { f: 0, e: 0 };
  const s = Math.sign(f);
  f = Math.abs(f);
  const k = Math.floor(Math.log10(f));
  f /= 10 ** k;
  e += k;
  if (f >= 10) { f /= 10; e += 1; }
  if (e < 4) {
    const i = Math.trunc(s * f * 10 ** e + s * 1e-9);
    if (!i) return { f: 0, e: 0 };
    return norm2(i);
  }
  return { f: s * f, e };
}

function norm2(i) {
  const s = Math.sign(i), a = Math.abs(i);
  const k = Math.floor(Math.log10(a));
  return { f: (s * a) / 10 ** k, e: k };
}

export const isZero = a => !a.f;
export const ZERO = { f: 0, e: 0 };

export function add(a, b) {
  if (!a.f) return norm(b);
  if (!b.f) return norm(a);
  const d = a.e - b.e;
  if (d >= GAP) return a;
  if (d <= -GAP) return b;
  return d >= 0 ? norm({ f: a.f + b.f / 10 ** d, e: a.e }) : norm({ f: a.f / 10 ** -d + b.f, e: b.e });
}

export const sub = (a, b) => add(a, { f: -b.f, e: b.e });

export function mul(a, k) {
  if (typeof k === 'number') return norm({ f: a.f * k, e: a.e });
  return norm({ f: a.f * k.f, e: a.e + k.e });
}

export function div(a, k) {
  if (typeof k === 'number') return k ? norm({ f: a.f / k, e: a.e }) : a;
  return k.f ? norm({ f: a.f / k.f, e: a.e - k.e }) : a;
}

export function pow10(x) {
  const e = Math.floor(x);
  return norm({ f: 10 ** (x - e), e });
}

export function cmp(a, b) {
  const sa = Math.sign(a.f), sb = Math.sign(b.f);
  if (sa !== sb) return sa > sb ? 1 : -1;
  if (!sa) return 0;
  if (a.e !== b.e) return (a.e > b.e ? 1 : -1) * sa;
  return Math.sign(a.f - b.f);
}

export const gte = (a, b) => cmp(a, b) >= 0;
export const lt = (a, b) => cmp(a, b) < 0;
export const log10 = a => (a.f > 0 ? Math.log10(a.f) + a.e : -Infinity);
export const toNumber = a => a.f * 10 ** a.e;

const U = 'abcdefghijklmnopqrstuvwxyz';

// GameManager.GetStringNumber: 2-4 truncated digits, one letter per x1000 (a = 10^3 ... z, then aa).
export function format(a) {
  if (!a.f) return '0';
  if (a.e < 4) return String(Math.trunc(a.f * 10 ** a.e));
  const e1 = a.e - 1;
  const idx = Math.trunc(e1 / 3) - 1;
  const k = (e1 % 3) + 1;
  const digits = Math.trunc(a.f * 10 ** k + 1e-9);
  const hi = Math.trunc(idx / 26) - 1;
  const unit = (hi >= 0 ? U[hi % 26] : '') + (idx >= 0 ? U[idx % 26] : '');
  return String(digits) + unit;
}
