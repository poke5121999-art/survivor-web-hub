// Static collision for the first-person player: oriented boxes (Unity BoxColliders) + the money pile heightfield.
// Pure math, no THREE: runs in node tests too. Space = three.js world (z already flipped by the exporter).

// box record: {m: column-major 4x4 world matrix, c: local center, s: local size}
export class BoxWorld {
  constructor(boxes) {
    this.boxes = [];
    for (const b of boxes) {
      if (b.trigger) continue;
      const m = b.m;
      // axes (columns) and their lengths = world scale
      const ax = [m[0], m[1], m[2]], ay = [m[4], m[5], m[6]], az = [m[8], m[9], m[10]];
      const lx = Math.hypot(...ax), ly = Math.hypot(...ay), lz = Math.hypot(...az);
      if (!(lx > 1e-6 && ly > 1e-6 && lz > 1e-6)) continue;
      const ux = ax.map(v => v / lx), uy = ay.map(v => v / ly), uz = az.map(v => v / lz);
      // world center = M * c
      const c = b.c;
      const wc = [m[12] + m[0] * c[0] + m[4] * c[1] + m[8] * c[2], m[13] + m[1] * c[0] + m[5] * c[1] + m[9] * c[2], m[14] + m[2] * c[0] + m[6] * c[1] + m[10] * c[2]];
      const h = [Math.abs(b.s[0] * lx) / 2, Math.abs(b.s[1] * ly) / 2, Math.abs(b.s[2] * lz) / 2];
      if (h[0] < 1e-4 || h[1] < 1e-4 || h[2] < 1e-4) continue;
      const r = Math.hypot(h[0], h[1], h[2]);
      this.boxes.push({ c: wc, u: [ux, uy, uz], h, r, path: b.path });
    }
  }

  // switch boxes on/off by path (the big door's blockers while it is open)
  setEnabled(re, on) { let n = 0; for (const b of this.boxes) if (re.test(b.path)) { b.off = !on; n++; } return n; }

  // closest point on box to p, returns [x,y,z]
  static closest(b, p) {
    const d = [p[0] - b.c[0], p[1] - b.c[1], p[2] - b.c[2]];
    const q = [b.c[0], b.c[1], b.c[2]];
    for (let i = 0; i < 3; i++) {
      const u = b.u[i];
      let t = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
      if (t > b.h[i]) t = b.h[i]; else if (t < -b.h[i]) t = -b.h[i];
      q[0] += u[0] * t; q[1] += u[1] * t; q[2] += u[2] * t;
    }
    return q;
  }

  // push a sphere out of all boxes; returns {x,y,z, ny (max ground normal y), hit}
  sphere(p, r, out) {
    let ny = -1, hit = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const b of this.boxes) {
        if (b.off) continue;
        const dx = p[0] - b.c[0], dy = p[1] - b.c[1], dz = p[2] - b.c[2];
        const rr = b.r + r;
        if (dx * dx + dy * dy + dz * dz > rr * rr) continue;
        const q = BoxWorld.closest(b, p);
        let nx = p[0] - q[0], nyy = p[1] - q[1], nz = p[2] - q[2];
        let d = Math.hypot(nx, nyy, nz);
        if (d >= r) continue;
        if (d < 1e-6) {
          // center inside box: push out along the axis of least penetration
          const loc = [0, 1, 2].map(i => dx * b.u[i][0] + dy * b.u[i][1] + dz * b.u[i][2]);
          let best = 0, bestPen = Infinity, sgn = 1;
          for (let i = 0; i < 3; i++) {
            const pen = b.h[i] - Math.abs(loc[i]);
            if (pen < bestPen) { bestPen = pen; best = i; sgn = loc[i] >= 0 ? 1 : -1; }
          }
          nx = b.u[best][0] * sgn; nyy = b.u[best][1] * sgn; nz = b.u[best][2] * sgn;
          const push = bestPen + r;
          p[0] += nx * push; p[1] += nyy * push; p[2] += nz * push;
          if (nyy > ny) ny = nyy;
        } else {
          nx /= d; nyy /= d; nz /= d;
          const push = r - d;
          p[0] += nx * push; p[1] += nyy * push; p[2] += nz * push;
          if (nyy > ny) ny = nyy;
        }
        hit = true; moved = true;
      }
      if (!moved) break;
    }
    if (out) { out.ny = ny; out.hit = hit; }
    return p;
  }

  // highest box top under (x,z) between yLo and yHi (for ground probing / step-up)
  groundAt(x, z, yLo, yHi, r = 0) {
    let best = -Infinity;
    for (const b of this.boxes) {
      if (b.off) continue;
      const dx = x - b.c[0], dz = z - b.c[2];
      if (dx * dx + dz * dz > (b.r + r) * (b.r + r)) continue;
      // only boxes whose "up" axis is roughly vertical give a flat top; ramps are handled by sphere push
      for (let i = 0; i < 3; i++) {
        const u = b.u[i];
        if (Math.abs(u[1]) < 0.9) continue;
        // test point (x,z) projected on the other two axes
        let inside = true;
        for (let j = 0; j < 3; j++) {
          if (j === i) continue;
          const uj = b.u[j];
          const t = dx * uj[0] + dz * uj[2] + 0;
          if (Math.abs(t) > b.h[j] + r) { inside = false; break; }
        }
        if (!inside) continue;
        const top = b.c[1] + Math.abs(u[1]) * b.h[i];
        if (top >= yLo && top <= yHi && top > best) best = top;
      }
    }
    return best;
  }
}
