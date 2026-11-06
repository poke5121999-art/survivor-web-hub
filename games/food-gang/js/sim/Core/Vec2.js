// Vec2 + SMath. C# floats are float32 and .NET evaluates each operation in single precision, so every
// arithmetic result goes through Math.fround (double rounding of + - * / sqrt is innocuous for float32).
// Vec2 values are plain {x, y} objects owned by whoever holds them: operations return new objects and
// assignments from another owner must copy (C# copies the struct).
import { sinf, cosf } from './CrtMath.js';

export const f = Math.fround;

export const FLOAT_MAX = 3.4028234663852886e38;
export const FLOAT_MIN = -3.4028234663852886e38;
/** MathF.PI / 180f, folded by the C# compiler in float. */
export const DEG2RAD = f(f(Math.PI) / 180);

const EPS9 = f(1e-9);

export const Vec2 = Object.freeze({
  make: (x, y) => ({ x, y }),
  zero: () => ({ x: 0, y: 0 }),
  up: () => ({ x: 0, y: 1 }),
  right: () => ({ x: 1, y: 0 }),
  left: () => ({ x: -1, y: 0 }),
  copy: (v) => ({ x: v.x, y: v.y }),
  add: (a, b) => ({ x: f(a.x + b.x), y: f(a.y + b.y) }),
  sub: (a, b) => ({ x: f(a.x - b.x), y: f(a.y - b.y) }),
  neg: (a) => ({ x: -a.x, y: -a.y }),
  scale: (a, k) => ({ x: f(a.x * k), y: f(a.y * k) }),
  eq: (a, b) => a.x === b.x && a.y === b.y,
  dot: (a, b) => f(f(a.x * b.x) + f(a.y * b.y)),
  sqrMagnitude: (a) => f(f(a.x * a.x) + f(a.y * a.y)),
  magnitude: (a) => f(Math.sqrt(f(f(a.x * a.x) + f(a.y * a.y)))),
  normalized(a) {
    const m = Vec2.magnitude(a);
    return m > EPS9 ? { x: f(a.x / m), y: f(a.y / m) } : { x: 0, y: 0 };
  },
  distance(a, b) {
    const x = f(a.x - b.x), y = f(a.y - b.y);
    return f(Math.sqrt(f(f(x * x) + f(y * y))));
  },
  reflect: (d, n) => Vec2.sub(d, Vec2.scale(n, f(2 * Vec2.dot(d, n)))),
  /** Counter-clockwise rotation by degrees (BulletSystem.RotateVector). */
  rotate(v, deg) {
    if (deg === 0) return { x: v.x, y: v.y };
    const r = f(deg * DEG2RAD);
    const c = cosf(r), s = sinf(r);
    return { x: f(f(v.x * c) - f(v.y * s)), y: f(f(v.x * s) + f(v.y * c)) };
  },
});

export const SMath = Object.freeze({
  clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v),
  clamp01: (v) => (v < 0 ? 0 : v > 1 ? 1 : v),
  lerp: (a, b, t) => f(a + f(f(b - a) * (t < 0 ? 0 : t > 1 ? 1 : t))),
  /** (int)MathF.Round(v, MidpointRounding.AwayFromZero) */
  roundToInt: (v) => (v < 0 ? -Math.floor(-v + 0.5) : Math.floor(v + 0.5)) | 0,
  sign: (v) => (v > 0 ? 1 : v < 0 ? -1 : 0),
});
