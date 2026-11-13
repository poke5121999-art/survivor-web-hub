// Destructible terrain as a signed-distance grid on the play plane (x right, y up, metres).
// sd < 0 is solid. Values are clamped to ±BAND, so they are only a true distance near the surface.
(function () {
  'use strict';
  const PM = globalThis.PM;
  const BAND = 2;

  PM.Terrain = function (map) {
    const cell = map.cell, nx = Math.round(map.w / cell) + 1, ny = Math.round(map.h / cell) + 1;
    const sd = new Float32Array(nx * ny), burn = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) sd[j * nx + i] = Math.max(-BAND, Math.min(BAND, map.sd(i * cell, j * cell)));

    const T = { w: map.w, h: map.h, cell, nx, ny, sd, burn, band: BAND, version: 0, changes: [] };

    T.sample = function (x, y) {
      const fx = x / cell, fy = y / cell;
      if (fx < 0 || fy < 0 || fx >= nx - 1 || fy >= ny - 1) return BAND;
      const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k = j * nx + i;
      const a = sd[k], b = sd[k + 1], c = sd[k + nx], d = sd[k + nx + 1];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
    T.solid = (x, y) => T.sample(x, y) < 0;

    T.normal = function (x, y) {
      const e = cell;
      let gx = T.sample(x + e, y) - T.sample(x - e, y), gy = T.sample(x, y + e) - T.sample(x, y - e);
      const l = Math.hypot(gx, gy);
      if (l < 1e-6) return { x: 0, y: 1 };
      return { x: gx / l, y: gy / l };
    };

    // First solid point on the segment, or null. t is the fraction along the segment.
    T.raycast = function (x0, y0, x1, y1) {
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (T.sample(x0, y0) < 0) return { x: x0, y: y0, t: 0 };
      const n = Math.max(1, Math.ceil(len / (cell * 0.5)));
      let pt = 0;
      for (let s = 1; s <= n; s++) {
        const t = s / n;
        if (T.sample(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t) < 0) {
          let lo = pt, hi = t;
          for (let k = 0; k < 7; k++) {
            const m = (lo + hi) * 0.5;
            if (T.sample(x0 + (x1 - x0) * m, y0 + (y1 - y0) * m) < 0) hi = m; else lo = m;
          }
          return { x: x0 + (x1 - x0) * lo, y: y0 + (y1 - y0) * lo, t: lo };
        }
        pt = t;
      }
      return null;
    };

    // Surface height straight below (x, yTop), searching down at most maxDrop.
    // Returns null when (x, yTop) is itself inside solid, or -Infinity when there is no ground in range.
    T.groundY = function (x, yTop, maxDrop) {
      if (T.sample(x, yTop) < 0) return null;
      const step = cell * 0.5, n = Math.ceil(maxDrop / step);
      for (let s = 1; s <= n; s++) {
        const y = yTop - s * step;
        if (T.sample(x, y) < 0) {
          let lo = y, hi = y + step;
          for (let k = 0; k < 6; k++) { const m = (lo + hi) * 0.5; if (T.sample(x, m) < 0) lo = m; else hi = m; }
          return hi;
        }
      }
      return -Infinity;
    };

    T.carve = function (cx, cy, r) {
      const reach = r + BAND;
      const i0 = Math.max(0, Math.floor((cx - reach) / cell)), i1 = Math.min(nx - 1, Math.ceil((cx + reach) / cell));
      const j0 = Math.max(0, Math.floor((cy - reach) / cell)), j1 = Math.min(ny - 1, Math.ceil((cy + reach) / cell));
      let changed = false;
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const k = j * nx + i, dist = Math.hypot(i * cell - cx, j * cell - cy);
          const v = Math.min(BAND, r - dist);
          if (v > sd[k]) { sd[k] = v; changed = true; }
          const b = 1 - Math.abs(dist - r) / 1.7;
          if (b > burn[k]) burn[k] = b;
        }
      }
      if (changed) { T.version++; T.changes.push({ i0, i1, j0, j1 }); }
      return changed;
    };

    return T;
  };
})();
