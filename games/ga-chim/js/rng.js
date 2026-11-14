// Seeded randomness shared by every generator: same name -> same prop, texture, sound.
export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rng(name) {
  const r = mulberry(typeof name === 'number' ? name : hash32(String(name)));
  r.range = (a, b) => a + (b - a) * r();
  r.int = (a, b) => Math.floor(a + (b - a + 1) * r());
  r.pick = (arr) => arr[Math.floor(r() * arr.length) % arr.length];
  r.sign = () => (r() < 0.5 ? -1 : 1);
  return r;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const damp = (a, b, k, dt) => b + (a - b) * Math.exp(-k * dt);

// Critically-tunable damped spring on one scalar axis. Firing adds velocity; the spring settles by itself.
export class Spring {
  constructor(k, c) { this.k = k; this.c = c; this.x = 0; this.v = 0; this.t = 0; }
  kick(v) { this.v += v; }
  update(dt) {
    const steps = Math.max(1, Math.ceil(dt / 0.004));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = -this.k * (this.x - this.t) - this.c * this.v;
      this.v += a * h; this.x += this.v * h;
    }
    return this.x;
  }
}
