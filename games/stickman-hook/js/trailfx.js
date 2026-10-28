// Trail particles: the ParticleSystems of the equipped trail prefab (tools/build_trails.py -> data/trailfx/<name>.json,
// art/trailfx/<name>.webp), simulated on the CPU and drawn with Canvas 2D. Loaded by js/main.js only when the equipped
// trail has particles (`basic` and `pink` have none).
//
// Read from the prefabs (build_trails.py has the field list):
// - PlayerController.DisplayTrail [asm 0x1206c14..0x1206d3c] instantiates the prefab at the player's position as a child
//   of the player transform (scale 0.3); SpawnPlayer calls it after DestroyTrailIfExists, so every spawn starts empty.
// - Every system simulates in world space, emits by distance moved (some by time or bursts), plays on awake and loops.
// - Scaling mode Hierarchy multiplies start size and shape by the player's lossy scale (0.3 x the spawn growth);
//   Local ignores the parents (x 1).
// - Shapes: sphere (random direction in 3D, outward) and cone (base disc in the screen plane, axis +Z into the screen,
//   so only its spread angle moves particles on screen). No shape: the particle starts on the emitter, heading +Z.
// - Inherit velocity (Initial) adds k x the player's velocity at birth; gravity modifier x 9.81 (Physics.gravity).
// - Renderer: billboard or stretched billboard, pivot, max particle size (a fraction of the view height),
//   sorting order (trail line -5, rope 0, player 1); materials map to source-over / lighter / screen.
// [ĐỀ XUẤT], not measured in the original:
// - Start speed is not scaled by the hierarchy (like ConfettisLeft in main.js: scaled, the clouds were 3 x too small).
// - Limit velocity dampen applies once per 60 fps real frame (as main.js CONF), on the 3D velocity, before the
//   velocity-over-lifetime and noise terms, which are added to the motion each frame without accumulating.
// - Noise: a still smooth field (main.js confetti) of amplitude `strength` units/s, scrolled by scrollSpeed.
// - Particle rotation turns clockwise for positive values; a sprite-mode cell keeps its aspect inside the size square.
// - Stretched billboards: length (size x lengthScale + speed x velocityScale) x the on-screen share of the 3D velocity.
// - Prewarm is ignored: every prewarmed system emits by distance, and a prewarm happens with the emitter at rest.

const G = 9.81;
const rnd = Math.random;

// MinMaxCurve: number | {r: [a, b]} | {c: samples} | {c, d}; t in 0..1, r the particle's (or the frame's) random
function samp(c, t) {
  const n = c.length - 1, x = (t <= 0 ? 0 : t >= 1 ? 1 : t) * n, i = Math.min(n - 1, x | 0);
  return c[i] + (c[i + 1] - c[i]) * (x - i);
}
function ev(m, t, r) {
  if (typeof m === 'number') return m;
  if (m.r) return m.r[0] + (m.r[1] - m.r[0]) * r;
  const a = samp(m.c, t);
  return m.d ? a + (samp(m.d, t) - a) * r : a;
}

// Gradient {m: 0 blend | 1 fixed, c: [[t, r, g, b]], a: [[t, a]]} into out[0..3]
function keys(k, t, j, fixed) {
  if (t <= k[0][0]) return k[0][j];
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) {
      if (fixed) return k[i][j];
      const a = k[i - 1], b = k[i];
      return a[j] + ((b[j] - a[j]) * (t - a[0])) / (b[0] - a[0] || 1);
    }
  }
  return k[k.length - 1][j];
}
function gev(g, t, out) {
  const f = g.m === 1;
  out[0] = keys(g.c, t, 1, f); out[1] = keys(g.c, t, 2, f); out[2] = keys(g.c, t, 3, f); out[3] = keys(g.a, t, 1, f);
  return out;
}
const tmpA = [0, 0, 0, 0], tmpB = [0, 0, 0, 0];
// MinMaxGradient: [r,g,b,a] | {r: [c0, c1]} | {g} | {g, h} | {rc: G}
function cev(m, t, r, out) {
  if (Array.isArray(m)) { out[0] = m[0]; out[1] = m[1]; out[2] = m[2]; out[3] = m[3]; return out; }
  if (m.r) { for (let j = 0; j < 4; j++) out[j] = m.r[0][j] + (m.r[1][j] - m.r[0][j]) * r; return out; }
  if (m.rc) return gev(m.rc, r, out);
  if (m.h) {
    gev(m.g, t, tmpA); gev(m.h, t, tmpB);
    for (let j = 0; j < 4; j++) out[j] = tmpA[j] + (tmpB[j] - tmpA[j]) * r;
    return out;
  }
  return gev(m.g, t, out);
}

const BLEND = { alpha: 'source-over', add: 'lighter', screen: 'screen' };

class TrailFx {
  constructor(def, img) {
    this.name = def.name;
    this.line = def.line; // the TrailRenderer is drawn (goldcandy, goldsmoke, thunder: no)
    this.cells = def.cells.map(([x, y, w, h]) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w, h);
      return c;
    });
    this.tints = new Map();
    this.sys = def.systems.map((d) => ({ d, ps: [], accT: 0, accD: 0, t: 0, last: 0, delay: 0 }));
    this.prev = null;
    this.reset();
  }

  // DestroyTrailIfExists + a new instance: at every spawn, respawn and level start
  reset() {
    this.prev = null;
    for (const s of this.sys) {
      s.ps.length = 0; s.accT = 0; s.accD = 0; s.t = 0; s.last = -1e-6;
      s.delay = ev(s.d.delay, 0, rnd());
    }
  }

  get count() { let n = 0; for (const s of this.sys) n += s.ps.length; return n; }

  stats() {
    return { name: this.name, line: this.line, count: this.count,
      systems: this.sys.map((s) => ({ name: s.d.name, order: s.d.order, count: s.ps.length, max: s.d.max })) };
  }

  // dt: scaled seconds (particles follow Time.deltaTime, so the finish slow motion slows them); real: real seconds
  update(dt, real, pl) {
    const sc = 0.3 * pl.scale();
    const x = pl.x, y = pl.y;
    let px = x, py = y;
    if (this.prev) { px = this.prev[0]; py = this.prev[1]; }
    let dist = Math.hypot(x - px, y - py);
    if (dist > 5) { dist = 0; px = x; py = y; } // a teleport is not a path
    this.prev = [x, y];
    for (const s of this.sys) {
      this.simulate(s, dt, real);
      if (dt > 0) this.emit(s, dt, dist, px, py, x, y, pl, sc);
    }
  }

  emit(s, dt, dist, px, py, x, y, pl, sc) {
    const d = s.d;
    s.t += dt;
    const st = s.t - s.delay;
    if (st < 0) return;
    const nt = (st % d.dur) / d.dur;
    s.accT += ev(d.rate.t, nt, rnd()) * dt;
    s.accD += ev(d.rate.d, nt, rnd()) * dist;
    const n = Math.floor(s.accT) + Math.floor(s.accD);
    s.accT -= Math.floor(s.accT); s.accD -= Math.floor(s.accD);
    // spread over this frame's path, aged by the part of the frame they lived
    for (let i = 0; i < n; i++) {
      const k = (i + 1) / n;
      this.spawn(s, px + (x - px) * k, py + (y - py) * k, (1 - k) * dt, nt, pl, sc);
    }
    // bursts at `time` of every loop, `cycles` times `interval` apart
    for (const b of d.bursts) {
      const [bt, count, cycles, interval, prob] = b;
      const k0 = Math.max(0, Math.floor(s.last / d.dur)), k1 = Math.floor(st / d.dur);
      for (let k = k0; k <= k1; k++) {
        for (let c = 0; c < Math.max(1, cycles); c++) {
          const at = k * d.dur + bt + c * interval;
          if (at > s.last && at <= st && rnd() < prob) {
            const m = Math.round(ev(count, nt, rnd()));
            for (let j = 0; j < m; j++) this.spawn(s, x, y, st - at, nt, pl, sc);
          }
        }
      }
    }
    s.last = st;
  }

  spawn(s, x, y, age, nt, pl, sc) {
    const d = s.d;
    if (s.ps.length >= d.max) return;
    const k = d.scaling === 'h' ? sc : 1;
    let ox = 0, oy = 0, dx = 0, dy = 0, dz = 1;
    const sh = d.shape;
    if (sh && sh.t === 'sphere') {
      const z = 2 * rnd() - 1, ph = 2 * Math.PI * rnd(), q = Math.sqrt(1 - z * z);
      dx = q * Math.cos(ph); dy = q * Math.sin(ph); dz = z;
      const in3 = Math.pow(1 - sh.th, 3), rr = sh.r * Math.cbrt(in3 + (1 - in3) * rnd()) * k;
      ox = dx * rr; oy = dy * rr;
    } else if (sh) {
      const ph = 2 * Math.PI * rnd(), in2 = (1 - sh.th) * (1 - sh.th), rn = Math.sqrt(in2 + (1 - in2) * rnd());
      const th = sh.ang * rn, sn = Math.sin(th);
      dx = sn * Math.cos(ph); dy = sn * Math.sin(ph); dz = Math.cos(th);
      ox = Math.cos(ph) * sh.r * rn * k; oy = Math.sin(ph) * sh.r * rn * k;
    }
    const v = ev(d.speed, nt, rnd());
    let vx = dx * v, vy = dy * v;
    if (d.inherit != null) { const ki = ev(d.inherit, nt, rnd()); vx += pl.vx * ki; vy += pl.vy * ki; }
    const p = {
      x: x + ox + d.off[0] * sc, y: y + oy + d.off[1] * sc, vx, vy, vz: dz * v, age: 0, life: ev(d.life, nt, rnd()),
      size: ev(d.size, nt, rnd()) * k, rot: ev(d.rot, nt, rnd()), g: ev(d.grav, nt, rnd()),
      lim: d.limit ? ev(d.limit.m, nt, rnd()) : 0, c: cev(d.color, nt, rnd(), [0, 0, 0, 0]),
      r1: rnd(), r2: rnd(), r3: rnd(), r4: rnd(), r5: rnd(), r6: rnd(), sf: d.uv ? ev(d.uv.sf, nt, rnd()) : 0,
    };
    if (p.life <= 0) return;
    s.ps.push(p);
    if (age > 0) this.step(s, p, age, 0);
  }

  simulate(s, dt, real) {
    if (!s.ps.length) return;
    s.ps = s.ps.filter((p) => this.step(s, p, dt, real));
  }

  // one step of a particle; false once it is dead
  step(s, p, dt, real) {
    const d = s.d;
    p.age += dt;
    if (p.age >= p.life) return false;
    const t = p.age / p.life;
    p.vy -= G * p.g * dt;
    if (d.limit && real > 0) {
      const sp = Math.hypot(p.vx, p.vy, p.vz);
      if (sp > p.lim) {
        const damp = 1 - Math.pow(1 - d.limit.d, real * 60), ns = sp - (sp - p.lim) * damp;
        const f = sp > 0 ? ns / sp : 0;
        p.vx *= f; p.vy *= f; p.vz *= f;
      }
    }
    let mx = p.vx, my = p.vy;
    if (d.vol) { mx += ev(d.vol.x, t, p.r5); my += ev(d.vol.y, t, p.r6); }
    if (d.noise) {
      const n = ev(d.noise.s, t, p.r5), k = d.noise.f * 2 * Math.PI, sc = ev(d.noise.sc, t, p.r6) * s.t;
      mx += n * Math.sin(k * p.y + 1.3 + sc) * Math.cos(k * 0.7 * p.x);
      my += n * Math.cos(k * p.x + 0.4) * Math.sin(k * 0.6 * p.y + 2.1 + sc);
      // [ĐỀ XUẤT] with a limit too (fruits: noise 22.74, limit 1 dampen 1) the noise motion is limited as well;
      // unlimited, the fruits fly off screen within a second instead of trailing like the shop icon
      if (d.limit && real > 0) {
        const sp = Math.hypot(mx, my, p.vz);
        if (sp > p.lim) {
          const damp = 1 - Math.pow(1 - d.limit.d, real * 60), f = (sp - (sp - p.lim) * damp) / sp;
          mx *= f; my *= f;
        }
      }
    }
    p.x += mx * dt; p.y += my * dt;
    if (d.rol != null) p.rot += ev(d.rol, t, p.r2) * dt;
    return true;
  }

  // a cell multiplied by a colour (4 bits per channel), cached
  tinted(i, r, g, b) {
    const qr = Math.round(r * 15), qg = Math.round(g * 15), qb = Math.round(b * 15);
    if (qr === 15 && qg === 15 && qb === 15) return this.cells[i];
    const key = (i << 12) | (qr << 8) | (qg << 4) | qb;
    let c = this.tints.get(key);
    if (c) return c;
    if (this.tints.size > 800) this.tints.clear();
    const src = this.cells[i];
    c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'multiply';
    x.fillStyle = `rgb(${(qr * 17)},${(qg * 17)},${(qb * 17)})`;
    x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(src, 0, 0);
    this.tints.set(key, c);
    return c;
  }

  // systems whose sorting order is in lo..hi (main.js: under the trail line, between it and the rope, over the player)
  draw(R, zoom, lo, hi) {
    const { ctx } = R;
    const v = R.viewMatrix();
    const col = [0, 0, 0, 0];
    let any = false;
    for (const s of this.sys) {
      const d = s.d;
      if (d.order < lo || d.order > hi || !s.ps.length) continue;
      any = true;
      ctx.globalCompositeOperation = BLEND[d.blend];
      const maxSize = d.maxSize * 2 * zoom, ncell = d.cells.length;
      for (const p of s.ps) {
        const t = p.age / p.life;
        let size = p.size * (d.sol != null ? ev(d.sol, t, p.r1) : 1);
        if (size > maxSize) size = maxSize;
        if (!(size > 1e-4)) continue;
        col[0] = p.c[0]; col[1] = p.c[1]; col[2] = p.c[2]; col[3] = p.c[3];
        if (d.col) {
          cev(d.col, t, p.r3, tmpB);
          col[0] *= tmpB[0]; col[1] *= tmpB[1]; col[2] *= tmpB[2]; col[3] *= tmpB[3];
        }
        let a = col[3] * d.gain;
        if (a < 0.004) continue;
        let ci = 0;
        if (d.uv && ncell > 1) {
          let f = ev(d.uv.fot, t, p.r4) * d.uv.cyc + p.sf;
          f -= Math.floor(f);
          ci = Math.min(ncell - 1, Math.floor(f * ncell));
        }
        const cell = d.cells[ci];
        const img = this.tinted(cell, Math.min(1, col[0] * d.tint[0]), Math.min(1, col[1] * d.tint[1]), Math.min(1, col[2] * d.tint[2]));
        let m0, m1, m2, m3, cx = p.x, cy = p.y;
        if (d.mode === 1) {
          // stretched billboard along the velocity seen on screen
          const sp = Math.hypot(p.vx, p.vy, p.vz), sxy = Math.hypot(p.vx, p.vy);
          if (sxy < 1e-5) continue;
          const len = (size * d.len + sp * d.vel) * (sxy / sp), ux = p.vx / sxy, uy = p.vy / sxy;
          m0 = ux * len; m1 = uy * len; m2 = uy * size; m3 = -ux * size;
          cx += ux * d.pivot[0] * len; cy += uy * d.pivot[0] * len;
        } else {
          const th = -p.rot, c = Math.cos(th), sn = Math.sin(th);
          let w = size, h = size;
          const asp = d.aspect && d.aspect[ci];
          if (asp) { if (asp > 1) h = size / asp; else w = size * asp; }
          m0 = c * w; m1 = sn * w; m2 = sn * h; m3 = -c * h;
          if (d.pivot[0] || d.pivot[1]) {
            cx += (c * d.pivot[0] - sn * d.pivot[1]) * size; cy += (sn * d.pivot[0] + c * d.pivot[1]) * size;
          }
        }
        ctx.setTransform(v[0] * m0, v[3] * m1, v[0] * m2, v[3] * m3, v[0] * cx + v[4], v[3] * cy + v[5]);
        // material factors above 1 (legacy additive: 2 x _TintColor.a x 2) draw again
        for (; a > 0.004; a -= 1) {
          ctx.globalAlpha = a > 1 ? 1 : a;
          ctx.drawImage(img, -0.5, -0.5, 1, 1);
        }
      }
    }
    if (any) { ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
  }
}

// def + art of a trail; V: the cache-busting query of main.js
export async function loadTrailFx(name, V) {
  const r = await fetch('./data/trailfx/' + name + '.json' + V);
  if (!r.ok) throw new Error('trailfx ' + name + ' ' + r.status);
  const def = await r.json();
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error(def.img));
    i.src = './' + def.img + V;
  });
  return new TrailFx(def, img);
}

export { ev, cev };
