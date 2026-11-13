// Pháo Mây core: namespace, seeded RNG, noise, event bus, URL params, settings.
// Runs in the browser and in node (tools/sim-test.js), so nothing here touches the DOM at load.
(function () {
  'use strict';
  const PM = (globalThis.PM = globalThis.PM || {});

  PM.hash = function (str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };

  PM.rng = function (seed) {
    let s = (typeof seed === 'string' ? PM.hash(seed) : seed) >>> 0;
    const next = function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.range = (a, b) => a + (b - a) * next();
    next.int = (a, b) => Math.floor(a + (b - a + 1) * next());
    next.pick = (arr) => arr[Math.floor(next() * arr.length)];
    next.gauss = () => { let u = 0; for (let i = 0; i < 4; i++) u += next(); return (u - 2) * 1.2247; };
    next.state = () => s;
    next.setState = (v) => { s = v >>> 0; };
    return next;
  };

  const lattice = (ix, iy, seed) => {
    let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const smooth = (t) => t * t * (3 - 2 * t);
  PM.noise2 = function (x, y, seed) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
    const a = lattice(ix, iy, seed), b = lattice(ix + 1, iy, seed), c = lattice(ix, iy + 1, seed), d = lattice(ix + 1, iy + 1, seed);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  PM.fbm = function (x, y, seed, oct) {
    let v = 0, amp = 0.5, f = 1;
    for (let i = 0; i < (oct || 4); i++) { v += amp * PM.noise2(x * f, y * f, seed + i * 101); amp *= 0.5; f *= 2.03; }
    return v;
  };

  PM.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  PM.lerp = (a, b, t) => a + (b - a) * t;
  PM.smoothstep = (a, b, x) => { const t = PM.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  PM.spring = function (k, c, x0) {
    return { x: x0 || 0, v: 0, target: x0 || 0, k, c,
      step(dt) { const a = -this.k * (this.x - this.target) - this.c * this.v; this.v += a * dt; this.x += this.v * dt; return this.x; },
      kick(v) { this.v += v; } };
  };

  PM.Bus = function () {
    const map = new Map();
    return {
      on(topic, fn) { if (!map.has(topic)) map.set(topic, []); map.get(topic).push(fn); },
      emit(topic, data) {
        const list = map.get(topic);
        if (!list) return;
        for (const fn of list) {
          try { fn(data); } catch (err) { PM.logError('[events] handler for "' + topic + '" threw', err); }
        }
      }
    };
  };

  PM.errors = [];
  PM.logError = function (tag, err) {
    const msg = tag + ': ' + (err && err.stack ? err.stack : err);
    PM.errors.push(msg);
    if (typeof console !== 'undefined') console.error(msg);
  };

  PM.params = (function () {
    const out = {};
    try {
      const sp = new URLSearchParams(globalThis.location ? globalThis.location.search : '');
      for (const [k, v] of sp) out[k] = v === '' ? '1' : v;
    } catch (err) { /* node */ }
    return out;
  })();

  PM.store = {
    read(key, fallback) {
      try { const raw = globalThis.localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (err) { return fallback; }
    },
    write(key, value) {
      try { globalThis.localStorage.setItem(key, JSON.stringify(value)); return true; } catch (err) { return false; }
    }
  };
})();
