// Shared helpers: seeded RNG, event bus, springs, settings, quality tiers.
const BZ = (window.BZ = window.BZ || {});

BZ.hash = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

BZ.rng = (seed) => {
  let a = (typeof seed === 'string' ? BZ.hash(seed) : seed) >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    sign: () => (next() < 0.5 ? -1 : 1),
  };
};

BZ.events = () => {
  const map = new Map();
  return {
    on(topic, fn) {
      if (!map.has(topic)) map.set(topic, []);
      map.get(topic).push(fn);
    },
    emit(topic, data) {
      const list = map.get(topic);
      if (!list) return;
      for (const fn of list) {
        try { fn(data); } catch (e) { console.error(`[events] handler for "${topic}" threw`, e); }
      }
    },
  };
};

// Damped spring: kick it by adding to v; it settles back to target on its own.
BZ.spring = (k, d) => ({
  x: 0, v: 0,
  step(dt, target = 0) {
    const n = dt > 1 / 90 ? 2 : 1;
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (-k * (this.x - target) - d * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  },
  reset() { this.x = 0; this.v = 0; },
});

BZ.clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
BZ.lerp = (a, b, t) => a + (b - a) * t;
BZ.smooth = (t) => t * t * (3 - 2 * t); // smoothstep of a 0..1 value
BZ.damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
BZ.wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

BZ.params = Object.fromEntries(new URLSearchParams(location.search));
BZ.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

// Tiers. Default is medium on desktop and low on touch: Saltline's lesson was
// that "high by default" makes mid-range machines stutter.
BZ.QUALITY = {
  low: { name: 'low', scale: 0.6, maxDpr: 1, shadow: 0, particles: 0.5, far: 70 },
  medium: { name: 'medium', scale: 0.85, maxDpr: 1.25, shadow: 1024, particles: 0.8, far: 95 },
  high: { name: 'high', scale: 1, maxDpr: 2, shadow: 2048, particles: 1, far: 120 },
};

// every setting and what it starts as (js/settings.js draws the popup and applies them)
BZ.SETTINGS_DEF = { view: 'fp', showDmg: true, showFps: false,
  quality: 'auto', resScale: 1, fpsCap: 0, shadows: true, bloom: true, shake: 1, fxDensity: 1, fov: 78,
  volume: 0.8, music: 1, sfx: 1, voice: 1, muteBlur: true,
  sens: 1, adsSens: 1, invertY: false, adsToggle: false, keys: {},
  hudScale: 1, xhair: 'cross', xhairColor: 'white', touchOpacity: 1, touchScale: 1, colorBlind: false };
const SETTINGS_KEY = 'blockadez.settings.v1';
const BEST_KEY = 'blockadez.best.v1';
BZ.store = {
  load() {
    const def = { ...BZ.SETTINGS_DEF };
    try { return { ...def, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { return def; }
  },
  save(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {} },
  best() { try { return JSON.parse(localStorage.getItem(BEST_KEY) || 'null') || { wave: 0, score: 0 }; } catch { return { wave: 0, score: 0 }; } },
  saveBest(b) { try { localStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch {} },
};

BZ.pickQuality = (setting) => {
  const want = BZ.params.q || setting;
  if (BZ.QUALITY[want]) return { ...BZ.QUALITY[want] };
  return { ...(BZ.isTouch ? BZ.QUALITY.low : BZ.QUALITY.medium) };
};

window.__errors = [];
const origError = console.error.bind(console);
console.error = (...args) => {
  try { window.__errors.push(args.map((a) => (a && a.stack) || String(a)).join(' ').slice(0, 400)); } catch {}
  origError(...args);
};
