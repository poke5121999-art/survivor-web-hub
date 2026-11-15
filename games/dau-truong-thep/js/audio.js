// Fully synthesised sound and music. No audio files: every buffer is rendered from seeded noise, filters, sweeps and envelopes.
import { mulberry, fnv } from './rng.js';

const TAU = Math.PI * 2;
const ex = Math.exp;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);
const ad = (t, a, d) => (t < a ? t / a : ex(-(t - a) / d));
const rnd = (r, a, b) => a + (b - a) * r();

// Pitch-dropping sine, closed form so it is stateless: the thump under almost everything.
const swp = (f0, f1, k) => (t) => Math.sin(TAU * (f1 * t + (f0 - f1) * (1 - ex(-k * t)) / k));
// Metallic ring: inharmonic partials R with decays T and gains A.
const ring = (f, R, T, A) => (t) => { let s = 0; for (let k = 0; k < R.length; k++) s += Math.sin(TAU * f * R[k] * t) * ex(-t / T[k]) * (A ? A[k] : 1 - k * 0.15); return s; };

// ---------- DSP helpers ----------
function lp1(sr, fc) {
  let y = 0;
  let a = 1 - ex(-TAU * fc / sr);
  return (x, f) => { if (f !== undefined) a = 1 - ex(-TAU * f / sr); y += a * (x - y); return y; };
}

// One-pole low-pass rescaled to unit variance for white-noise input, so a 90 Hz rumble is as loud as a 5 kHz hiss before mixing.
function nlp(sr, fc) {
  let y = 0, a = 0, c = 1;
  const set = (f) => { a = 1 - ex(-TAU * f / sr); c = Math.sqrt((2 - a) / a); };
  set(fc);
  return (x, f) => { if (f !== undefined) set(f); y += a * (x - y); return y * c; };
}

// TPT state-variable filter; cutoff may change every sample. bp has unity peak gain, nbp is rescaled for white noise input.
function svf(sr) {
  let s1 = 0, s2 = 0;
  const o = {
    lp: 0, bp: 0, hp: 0, nbp: 0,
    run(x, fc, q) {
      fc = clamp(fc, 20, sr * 0.45);
      const g = Math.tan(Math.PI * fc / sr), k = 1 / q;
      const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
      const v3 = x - s2, v1 = a1 * s1 + a2 * v3, v2 = s2 + a2 * s1 + a3 * v3;
      s1 = 2 * v1 - s1; s2 = 2 * v2 - s2;
      o.lp = v2; o.bp = v1 * k; o.hp = x - k * v1 - v2;
      o.nbp = o.bp * Math.sqrt(sr * q / (3.14 * fc));
      return v2;
    },
  };
  return o;
}

// A generator returns a lazy {n, fn}: fn(t, i) gives sample i. That lets the boot loader fill it in 1024-sample slices.
const mk = (sr, dur, fn) => ({ n: Math.round(sr * dur), fn });
const add = (R, f) => ({ n: R.n, fn: (t, i) => R.fn(t, i) + f(t, i) });
const map = (R, f) => ({ n: R.n, fn: (t, i) => f(R.fn(t, i), t, i) });
function* fill(R, sr, out) {
  for (let i = 0; i < R.n; i++) {
    out[i] = R.fn(i / sr, i);
    if ((i & 1023) === 1023) yield;
  }
}

// Removes DC drift, softens the first/last samples so buffers never click, then normalises to peak 0.9 (levels live in the table's `vol`).
function* finish(chans, sr, tailMs = 8, loop = false) {
  let peak = 0;
  for (const a of chans) {
    // A loop must reach its last sample and start at its first without a dip or a filter run-in.
    if (!loop) {
      let xp = 0, yp = 0;
      for (let i = 0; i < a.length; i++) {
        const x = a[i]; yp = x - xp + 0.995 * yp; xp = x; a[i] = yp;
        if ((i & 32767) === 32767) yield;
      }
      const nf = Math.min(a.length >> 1, Math.round(sr * tailMs / 1000));
      for (let i = 0; i < nf; i++) a[a.length - 1 - i] *= i / nf;
      for (let i = 0; i < 16 && i < a.length; i++) a[i] *= i / 16;
    }
    for (let i = 0; i < a.length; i++) {
      const v = Math.abs(a[i]); if (v > peak) peak = v;
      if ((i & 65535) === 65535) yield;
    }
  }
  const k = peak > 0 ? 0.9 / peak : 1;
  for (const a of chans) {
    for (let i = 0; i < a.length; i++) { a[i] *= k; if ((i & 65535) === 65535) yield; }
  }
  return chans;
}

// Shared explosion body: filtered noise sweeping down, a pitch-dropping thump, a hard crack, rumble and falling debris ticks.
function blast(sr, r, o) {
  const s = svf(sr), rum = nlp(sr, 110), hp = lp1(sr, 1800);
  let ph = 0;
  const ticks = [];
  for (let k = 0; k < (o.debris || 0); k++) ticks.push([o.dAt + r() * o.dSpan, 0.12 + r() * 0.25]);
  return (t) => {
    const x = r() * 2 - 1;
    const fc = o.fc0 * ex(-t * o.fk) + o.fc1;
    s.run(x, fc, 0.8);
    const body = s.lp * Math.min(7, Math.sqrt(sr / (2.5 * fc))) * ad(t, 0.002, o.dec) * 1.5;
    ph += TAU * (o.th1 + (o.th0 - o.th1) * ex(-t * o.thk)) / sr;
    const thump = Math.sin(ph) * ex(-t / o.thd) * o.thA;
    const hi = x - hp(x);
    let deb = 0;
    for (const [t0, a] of ticks) if (t > t0) deb += hi * a * ex(-(t - t0) / 0.008);
    const rumble = rum(r() * 2 - 1) * ex(-t / o.rum) * o.rumA;
    return Math.tanh(1.4 * (body + thump + hi * ex(-t / 0.025) * 0.7 + rumble + deb));
  };
}

// Tower collapse: structural cracks, a sub boom, grinding, a cascade of rubble that thins out, and settling dust.
function collapse(sr, r, D, big) {
  const hp = lp1(sr, 2200), grind = svf(sr), dust = nlp(sr, 1600), rum = nlp(sr, 90), sub = swp(big ? 52 : 62, 20, big ? 2.5 : 3.5), gr = svf(sr), body = nlp(sr, 600);
  const cracks = [], stones = [], groans = [];
  for (let k = 0; k < (big ? 14 : 9); k++) cracks.push([rnd(r, 0, 0.5), rnd(r, 0.4, 1)]);
  for (let k = 0; k < (big ? 120 : 70); k++) { const u = r(); stones.push([0.2 + u * u * D * 0.8, rnd(r, 500, 2200), rnd(r, 0.08, 0.3)]); }
  stones.sort((a, b) => a[0] - b[0]);
  for (let k = 0; k < (big ? 4 : 2); k++) groans.push({ t: rnd(r, 0.1, 1.4), f: rnd(r, 70, 140), d: rnd(r, 0.4, 0.9) });
  let lo = 0;
  return mk(sr, D, (t) => {
    const x = r() * 2 - 1, hi = x - hp(x);
    let c = 0;
    for (const [t0, a] of cracks) if (t > t0) c += hi * a * ex(-(t - t0) / 0.006);
    while (lo < stones.length && t - stones[lo][0] > 0.12) lo++;
    let st = 0;
    for (let k = lo; k < stones.length && stones[k][0] < t; k++) { const tt = t - stones[k][0]; st += (Math.sin(TAU * stones[k][1] * tt) * 0.5 + hi) * ex(-tt / 0.012) * stones[k][2] * 0.4; }
    grind.run(r() * 2 - 1, 260 - 120 * clamp(t / (D * 0.6), 0, 1), 1.2);
    let gs = 0;
    for (const q of groans) if (t > q.t) { const tt = t - q.t; gr.run(2 * ((q.f * (1 - 0.3 * tt) * tt) % 1) - 1, q.f * 4, 4); gs += gr.bp * ex(-tt / q.d) * 2; }
    const boom = sub(t) * ex(-t / (big ? 1.3 : 0.8)) * 1.2 + body(r() * 2 - 1) * ad(t, 0.002, 0.3) * 0.9;
    const gnd = grind.nbp * (0.6 + 0.4 * Math.sin(TAU * 7 * t)) * Math.min(1, t / 0.2) * ex(-t / (D * 0.35)) * 0.8;
    const tail = dust(r() * 2 - 1) * ad(t, 0.3, D * 0.3) * 0.15 + rum(r() * 2 - 1) * ex(-t / (D * 0.35)) * 1.0;
    return Math.tanh(1.3 * (c + st + boom + gnd + gs * 0.4 + tail)) * Math.min(1, (D - t) / 0.5);
  });
}

// A few decaying partials per note; `w` shapes one period of the voice.
const W = {
  sin: (p) => Math.sin(p),
  soft: (p) => Math.sin(p) + 0.25 * Math.sin(2 * p),
  bell: (p) => Math.sin(p) + 0.3 * Math.sin(2.76 * p) + 0.12 * Math.sin(5.4 * p),
  brass: (p) => Math.sin(p) + 0.5 * Math.sin(2 * p) + 0.33 * Math.sin(3 * p) + 0.25 * Math.sin(4 * p),
  sq: (p) => Math.sin(p) + Math.sin(3 * p) / 3 + Math.sin(5 * p) / 5,
  fm: (p) => Math.sin(p + 2 * Math.sin(2.4 * p)),
};
function tones(sr, D, list) {
  return mk(sr, D, (t) => {
    let s = 0;
    for (const n of list) {
      const tt = t - n.t;
      if (tt < 0) continue;
      s += n.w(TAU * n.f * tt) * ad(tt, n.a || 0.003, n.d) * (n.g || 1);
    }
    return s;
  });
}

// Nail gun: a pneumatic tchk with an air puff, a metal tink and a dull thunk. Variants shift pitch so a fast stream does not machine-gun one sample.
function rivet(sr, r, v, D, pitch = 1) {
  const bp = svf(sr), air = svf(sr), hp = lp1(sr, 3500), body = nlp(sr, 700), f = (1700 + v * 450 + rnd(r, 0, 80)) * pitch, th = swp(190 * pitch, 65 * pitch, 60);
  return mk(sr, D, (t) => {
    const x = r() * 2 - 1;
    bp.run(x, (3400 + v * 800) * pitch, 3);
    air.run(r() * 2 - 1, 2100 * pitch, 1);
    return (x - hp(x)) * ex(-t / 0.002) * 0.9 + bp.nbp * ex(-t / 0.006) * 0.8 + air.nbp * ex(-t / 0.014) * 0.5 + (Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * f * 2.43 * t)) * ex(-t / 0.035) * 0.35 +
      th(t) * ex(-t / 0.035) * 0.6 + body(r() * 2 - 1) * ex(-t / 0.03) * 0.3;
  });
}

// ---------- Sound table ----------
// vol: playback level (buffers are all normalised); duck: how far the world and music bus drop under the player's own copy.
export const SOUNDS = {
  fire_shell: { n: 3, dur: 1.1, bus: 'gun', max: 3, pri: 7, vol: 1, duck: 0.3,
    gen: (sr, r, v, D) => {
      const hp = lp1(sr, 1400), a = nlp(sr, 900 + v * 120), b = nlp(sr, 170), c = nlp(sr, 480), e1 = nlp(sr, 420), e2 = nlp(sr, 300);
      const th = swp(150 + v * 12, 31 + v * 2, 20), cl = ring(300 + v * 35, [1, 2.76, 5.4], [0.1, 0.05, 0.03], [1, 0.5, 0.25]);
      return mk(sr, D, (t) => {
        const x = r() * 2 - 1;
        const crack = (x - hp(x)) * ex(-t / 0.008) * 1.5;
        const body = a(r() * 2 - 1) * ex(-t / 0.05) * 1.2;
        const thump = th(t) * ex(-t / 0.26) * 0.9;
        const clank = t > 0.05 ? cl(t - 0.05) * 0.4 : 0;
        const slap = (t > 0.16 ? e1(r() * 2 - 1) * ex(-(t - 0.16) / 0.1) * 0.35 : 0) + (t > 0.33 ? e2(r() * 2 - 1) * ex(-(t - 0.33) / 0.14) * 0.22 : 0);
        const tail = b(r() * 2 - 1) * ex(-t / 0.32) * 0.45 + c(r() * 2 - 1) * ex(-t / 0.5) * 0.25;
        return Math.tanh(1.6 * (crack + body + thump + clank + slap + tail));
      });
    } },
  fire_bullet: { n: 4, dur: 0.24, bus: 'gun', max: 6, pri: 4, vol: 0.9,
    gen: (sr, r, v, D) => {
      const hp = lp1(sr, 2600 + v * 300), hp2 = lp1(sr, 3500), bp = svf(sr), tail = nlp(sr, 2200 + v * 400);
      const th = swp(280 + v * 20, 85, 55), metal = ring(3300 + v * 250, [1, 1.9], [0.012, 0.008], [0.3, 0.15]);
      const off = 0.007 + v * 0.0025; // twin barrels: the second report lags by a few ms
      return mk(sr, D, (t) => {
        const x = r() * 2 - 1, h2 = x - hp2(x);
        bp.run(x, 1100 + v * 140, 1.4);
        const c = (x - hp(x)) * ex(-t / 0.0028) + (t > off ? h2 * ex(-(t - off) / 0.0025) * 0.7 : 0);
        return c * 1.1 + bp.nbp * ex(-t / 0.018) * 0.8 + th(t) * ex(-t / 0.03) * 0.75 + metal(t) + tail(r() * 2 - 1) * ex(-t / 0.06) * 0.2;
      });
    } },
  fire_rail: { n: 3, dur: 1.6, bus: 'gun', max: 2, pri: 7, vol: 0.9, duck: 0.25,
    gen: (sr, r, v, D) => {
      const hp = lp1(sr, 4500), bp = svf(sr), air = nlp(sr, 900);
      const f0 = 1500 + v * 220, th = swp(130, 38, 28), R = [1, 1.37, 1.9, 2.6, 3.3];
      let p1 = 0;
      return mk(sr, D, (t) => {
        const x = r() * 2 - 1;
        p1 += TAU * (f0 * 0.25 + 7500 * ex(-t * 60)) / sr;
        bp.run(r() * 2 - 1, 1300 + 500 * Math.sin(t * 5) + v * 100, 7);
        let sh = 0;
        if (t > 0.02) for (let k = 0; k < 5; k++) sh += Math.sin(TAU * f0 * R[k] * t) * (0.5 + 0.5 * Math.sin(TAU * (3 + k) * t)) * ex(-t / (0.6 + 0.1 * k));
        return (x - hp(x)) * ex(-t / 0.0022) * 1.4 + Math.sin(p1) * ex(-t / 0.05) + th(t) * ex(-t / 0.16) * 0.9 + bp.nbp * ex(-t / 0.5) * 0.45 + sh * 0.05 + air(r() * 2 - 1) * ad(t, 0.02, 0.45) * 0.3;
      });
    } },
  fire_pulse: { n: 3, dur: 0.45, bus: 'gun', max: 4, pri: 4, vol: 0.6,
    gen: (sr, r, v, D) => {
      const f = [523.25, 587.33, 659.25][v], nz = nlp(sr, 2500);
      let p = 0, q = 0;
      return mk(sr, D, (t) => {
        const g = f * (0.75 + 0.5 * (1 - ex(-t * 60)));
        p += TAU * g / sr; q += TAU * g * 1.006 / sr;
        return (Math.sin(p) + 0.3 * Math.sin(2 * p) + 0.6 * Math.sin(q)) * ad(t, 0.004, 0.1) * 0.7 + Math.sin(TAU * f * 2 * t) * ex(-t / 0.12) * 0.3 + Math.sin(TAU * f * 3.01 * t) * ex(-t / 0.07) * 0.15 +
          Math.sin(TAU * f * 0.5 * t) * ex(-t / 0.1) * 0.3 + nz(r() * 2 - 1) * ex(-t / 0.02) * 0.25 + Math.sin(TAU * f * 4 * t) * ex(-t / 0.2) * 0.08 * (0.5 + 0.5 * Math.sin(TAU * 9 * t));
      });
    } },
  fire_rocket: { n: 2, dur: 0.9, bus: 'gun', max: 4, pri: 5, vol: 0.8,
    gen: (sr, r, v, D) => {
      const bp = svf(sr), rum = nlp(sr, 300), hi = lp1(sr, 4000), th = swp(160 + v * 15, 52, 40);
      return mk(sr, D, (t) => {
        const x = r() * 2 - 1;
        bp.run(x, 400 + 2000 * Math.sin(Math.PI * Math.min(t / 0.6, 1)), 1.1);
        return bp.nbp * ad(t, 0.06, 0.28) * 1.2 + rum(r() * 2 - 1) * ex(-t / 0.4) + th(t) * ex(-t / 0.06) * 0.9 + (x - hi(x)) * (ex(-t / 0.004) * 0.8 + ad(t, 0.1, 0.25) * 0.25);
      });
    } },

  fire_mortar: { n: 3, dur: 0.9, bus: 'gun', max: 2, pri: 6, vol: 0.85, duck: 0.25,
    gen: (sr, r, v, D) => {
      const a = nlp(sr, 260), b = nlp(sr, 1400), bp = svf(sr), e = nlp(sr, 220);
      const th = swp(95 + v * 8, 35, 18), tube = 360 + v * 20;
      let wh = 0;
      return mk(sr, D, (t) => {
        bp.run(r() * 2 - 1, 190 + v * 12, 9);
        wh += TAU * (800 + 800 * t / D) / sr;
        return Math.tanh(1.5 * (th(t) * ex(-t / 0.22) * 1.0 + a(r() * 2 - 1) * ex(-t / 0.09) * 0.45 + b(r() * 2 - 1) * ex(-t / 0.02) * 0.25 + bp.nbp * ex(-t / 0.2) * 0.8 +
          Math.sin(TAU * tube * t) * ex(-t / 0.18) * 0.7 + Math.sin(TAU * tube * 0.5 * t) * ex(-t / 0.25) * 0.5 + Math.sin(wh) * ad(t, 0.25, 0.3) * 0.2 + (t > 0.12 ? e(r() * 2 - 1) * ex(-(t - 0.12) / 0.2) * 0.25 : 0)));
      });
    } },
  mortar_whistle: { n: 1, dur: 0.85, bus: 'world', max: 3, pri: 5, vol: 0.5,
    gen: (sr, r, v, D) => {
      const bp = svf(sr);
      let p = 0;
      return mk(sr, D, (t) => {
        const u = t / D, f = 2600 - 1800 * Math.pow(u, 0.8);
        p += TAU * f * (1 + 0.01 * Math.sin(TAU * 9 * t)) / sr;
        bp.run(r() * 2 - 1, f, 6);
        return (Math.sin(p) + 0.25 * Math.sin(2 * p) + bp.nbp * 0.25) * Math.pow(u, 1.5);
      });
    } },
  fire_pellet: { n: 3, dur: 0.55, bus: 'gun', max: 3, pri: 6, vol: 0.8, duck: 0.15,
    gen: (sr, r, v, D) => {
      const a = nlp(sr, 2800 + v * 250), low = nlp(sr, 400), hp = lp1(sr, 2500), bp = svf(sr), tl = nlp(sr, 600);
      const crack = [];
      for (let k = 0; k < 5; k++) crack.push([r() * 0.02, 0.3 + r() * 0.3]);
      const th = swp(140, 55, 45);
      return mk(sr, D, (t) => {
        const x = r() * 2 - 1, hi = x - hp(x);
        let c = 0;
        for (const [t0, g] of crack) if (t > t0) c += hi * g * ex(-(t - t0) / 0.003);
        bp.run(r() * 2 - 1, 2500, 3);
        let pump = 0;
        for (const t0 of [0.27, 0.34]) if (t > t0) pump += bp.nbp * ex(-(t - t0) / 0.006) * 0.35;
        return Math.tanh(1.6 * (a(r() * 2 - 1) * ex(-t / (0.05 + v * 0.01)) + hi * ex(-t / 0.012) * 0.65 + th(t) * ex(-t / 0.09) * 0.5 + low(r() * 2 - 1) * ex(-t / 0.15) * 0.25 + c)) + pump + tl(r() * 2 - 1) * ex(-t / 0.18) * 0.15;
      });
    } },
  fire_frost: { n: 3, dur: 0.45, bus: 'gun', max: 4, pri: 4, vol: 0.85,
    gen: (sr, r, v, D) => {
      const f0 = 2300 + v * 450 + r() * 80, hp = lp1(sr, 5000), bp = svf(sr), R = [1, 1.51, 2.19, 3.07], T = [0.14, 0.1, 0.07, 0.05], th = swp(180, 80, 60);
      return mk(sr, D, (t) => {
        let s = 0;
        for (let k = 0; k < 4; k++) s += Math.sin(TAU * f0 * R[k] * t) * ex(-t / T[k]) * (0.8 - k * 0.15);
        const x = r() * 2 - 1;
        bp.run(r() * 2 - 1, 7000 * ex(-t * 9) + 2500, 1.2);
        return s * (0.75 + 0.25 * Math.sin(TAU * 45 * t)) * 0.8 + bp.nbp * ex(-t / 0.08) * 0.8 + th(t) * ex(-t / 0.035) * 0.9 + (x - hp(x)) * ex(-t / 0.004) * 0.7;
      });
    } },
  fire_rivet: { n: 3, dur: 0.25, bus: 'gun', max: 4, pri: 4, vol: 0.85, gen: rivet },
  fire_turret: { n: 3, dur: 0.25, bus: 'gun', max: 3, pri: 3, vol: 0.3, gen: (sr, r, v, D) => rivet(sr, r, v, D, 0.7) },

  hit_metal: { n: 4, dur: 0.35, bus: 'world', max: 5, pri: 3, vol: 0.5,
    gen: (sr, r, v, D) => {
      const f0 = 480 + v * 95 + r() * 40, l = lp1(sr, 2000), th = swp(160, 70, 40);
      const R = [1, 2.76, 5.4, 8.93], A = [1, 0.6, 0.35, 0.2], T = [0.09, 0.06, 0.04, 0.025];
      return mk(sr, D, (t) => {
        let s = 0;
        for (let k = 0; k < 4; k++) s += Math.sin(TAU * f0 * R[k] * t) * ex(-t / T[k]) * A[k];
        const x = r() * 2 - 1;
        return s + (x - l(x)) * ex(-t / 0.004) * 0.8 + th(t) * ex(-t / 0.03) * 0.7;
      });
    } },
  hit_wall: { n: 3, dur: 0.35, bus: 'world', max: 4, pri: 3, vol: 0.5,
    gen: (sr, r, v, D) => {
      const nz = nlp(sr, 1400 + v * 300), hp = lp1(sr, 2500), th = swp(150, 55, 38), grit = nlp(sr, 700);
      const ticks = [];
      for (let k = 0; k < 6; k++) ticks.push(rnd(r, 0.04, 0.25));
      return mk(sr, D, (t) => {
        const x = r() * 2 - 1, hi = x - hp(x);
        let deb = 0;
        for (const t0 of ticks) if (t > t0) deb += hi * ex(-(t - t0) / 0.006) * 0.3;
        return th(t) * ex(-t / 0.05) + nz(r() * 2 - 1) * ex(-t / 0.03) + deb + grit(r() * 2 - 1) * ex(-t / 0.12) * 0.3 + hi * ex(-t / 0.003) * 0.4;
      });
    } },
  hit_shield: { n: 1, dur: 0.45, bus: 'world', max: 4, pri: 3, vol: 0.5,
    gen: (sr, r, v, D) => {
      const bp = svf(sr);
      let p = 0;
      return mk(sr, D, (t) => {
        p += TAU * (900 + 1200 * (1 - ex(-t * 12))) / sr;
        bp.run(r() * 2 - 1, 3000, 2);
        return (Math.sin(p) + 0.4 * Math.sin(2.01 * p)) * ex(-t / 0.14) * (0.6 + 0.4 * Math.sin(TAU * 38 * t)) + bp.nbp * ex(-t / 0.04) * 0.5;
      });
    } },

  expl_small: { n: 3, dur: 1.0, bus: 'world', max: 4, pri: 5, vol: 0.85,
    gen: (sr, r, v, D) => mk(sr, D, blast(sr, r, { fc0: 2800 - v * 300, fc1: 260, fk: 11, dec: 0.22, th0: 95, th1: 32, thk: 25, thd: 0.2, thA: 1.1, rum: 0.3, rumA: 0.5, debris: 4 + v, dAt: 0.1, dSpan: 0.4 })) },
  expl_big: { n: 2, dur: 2.4, bus: 'world', max: 3, pri: 6, vol: 1,
    gen: (sr, r, v, D) => {
      const base = blast(sr, r, { fc0: 2000, fc1: 180, fk: 4.5, dec: 0.55, th0: 70, th1: 24, thk: 10, thd: 0.5, thA: 1.2, rum: 0.9, rumA: 1.2, debris: 14, dAt: 0.15, dSpan: 1.2 });
      const sub = swp(55 + v * 6, 22, 5), cr = nlp(sr, 400), e = nlp(sr, 250);
      return mk(sr, D, (t) => base(t) + sub(t) * ex(-t / 0.7) * 0.9 + (t > 0.28 ? e(r() * 2 - 1) * ex(-(t - 0.28) / 0.4) * 0.35 : 0) + cr(r() * 2 - 1) * ex(-t / 1.1) * 0.12);
    } },
  expl_barrel: { n: 1, dur: 1.4, bus: 'world', max: 3, pri: 6, vol: 1,
    gen: (sr, r, v, D) => {
      const base = blast(sr, r, { fc0: 2400, fc1: 220, fk: 7, dec: 0.38, th0: 80, th1: 28, thk: 14, thd: 0.35, thA: 1, rum: 0.6, rumA: 0.9, debris: 8, dAt: 0.15, dSpan: 0.7 });
      const bp = svf(sr);
      return mk(sr, D, (t) => {
        bp.run(r() * 2 - 1, 900, 1);
        return base(t) + (Math.sin(TAU * 310 * t) * ex(-t / 0.25) * 0.3 + Math.sin(TAU * 437 * t) * ex(-t / 0.18) * 0.25) + bp.nbp * ad(t, 0.05, 0.35) * 0.5;
      });
    } },

  sk_shield: { n: 1, dur: 0.8, bus: 'world', max: 2, pri: 6, vol: 0.8,
    gen: (sr, r, v, D) => {
      const bp = svf(sr);
      let p = 0;
      return mk(sr, D, (t) => {
        p += TAU * (260 + 700 * (1 - ex(-t * 6))) * (1 + 0.01 * Math.sin(TAU * 7 * t)) / sr;
        bp.run(r() * 2 - 1, 4200, 3);
        return (Math.sin(p) + 0.5 * Math.sin(2 * p) + 0.25 * Math.sin(3.01 * p)) * ad(t, 0.04, 0.28) + bp.nbp * ad(t, 0.01, 0.1) * 0.35 + Math.sin(TAU * 110 * t) * ex(-t / 0.4) * 0.4;
      });
    } },
  sk_dash: { n: 1, dur: 0.55, bus: 'world', max: 2, pri: 6, vol: 0.8,
    gen: (sr, r, v, D) => {
      const bp = svf(sr), l = lp1(sr, 600);
      let sw = 0;
      return mk(sr, D, (t) => {
        sw = (sw + 75 / sr) % 1;
        bp.run(r() * 2 - 1, 1400 * ex(-t * 5) + 250, 1.2);
        return bp.nbp * ad(t, 0.03, 0.2) * 1.2 + l(2 * sw - 1) * ex(-t / 0.2) * 0.6;
      });
    } },
  ram_clang: { n: 1, dur: 0.8, bus: 'world', max: 3, pri: 6, vol: 0.95,
    gen: (sr, r, v, D) => {
      const R = [1, 2.35, 3.71, 5.12, 6.9], T = [0.35, 0.25, 0.18, 0.12, 0.08], A = [1, 0.7, 0.5, 0.35, 0.25], l = lp1(sr, 2500);
      let ph = 0;
      return mk(sr, D, (t) => {
        let s = 0;
        for (let k = 0; k < 5; k++) s += Math.sin(TAU * 170 * R[k] * t) * ex(-t / T[k]) * A[k];
        ph += TAU * (45 + 65 * ex(-t * 25)) / sr;
        const x = r() * 2 - 1;
        return Math.tanh(1.3 * (s * 0.7 + Math.sin(ph) * ex(-t / 0.08) * 1.2 + (x - l(x)) * ex(-t / 0.006) * 0.9));
      });
    } },
  sk_quake_wind: { n: 1, dur: 0.75, bus: 'world', max: 1, pri: 7, vol: 0.9,
    gen: (sr, r, v, D) => {
      const nz = nlp(sr, 100);
      let p = 0;
      return mk(sr, D, (t) => {
        const u = t / D, env = u * u;
        p += TAU * (38 + 80 * Math.pow(u, 1.5)) / sr;
        return nz(r() * 2 - 1, 90 + 650 * u) * env + Math.sin(p) * env * 0.9;
      });
    } },
  sk_quake_slam: { n: 1, dur: 1.7, bus: 'world', max: 1, pri: 8, vol: 1, duck: 0.3,
    gen: (sr, r, v, D) => {
      const body = nlp(sr, 700), rum = nlp(sr, 110), hp = lp1(sr, 1800);
      const ticks = [];
      for (let k = 0; k < 18; k++) ticks.push([rnd(r, 0.1, 1.3), 0.1 + r() * 0.25]);
      let ph = 0;
      return mk(sr, D, (t) => {
        ph += TAU * (22 + 60 * ex(-t * 9)) / sr;
        const x = r() * 2 - 1, hi = x - hp(x);
        let deb = 0;
        for (const [t0, a] of ticks) if (t > t0) deb += hi * a * ex(-(t - t0) / 0.008);
        return Math.tanh(1.3 * (Math.sin(ph) * ex(-t / 0.5) * 1.2 + body(r() * 2 - 1) * ex(-t / 0.28) + hi * ex(-t / 0.02) + rum(r() * 2 - 1) * ex(-t / 0.9) * 1.3 + deb));
      });
    } },
  sk_buff: { n: 1, dur: 0.9, bus: 'world', max: 2, pri: 6, vol: 0.75,
    gen: (sr, r, v, D) => {
      const list = [220, 277.2, 329.6, 440].map((f, i) => ({ f, t: i * 0.09, d: 0.22, w: W.brass, a: 0.005 }));
      list.push({ f: 880, t: 0.3, d: 0.3, w: W.soft, g: 0.5 });
      let p = 0;
      return add(tones(sr, D, list), (t) => { p += TAU * (400 + 2000 * (t / 0.6)) / sr; return Math.sin(p) * ad(t, 0.4, 0.2) * 0.25; });
    } },
  sk_barrage_wind: { n: 1, dur: 1.0, bus: 'world', max: 3, pri: 5, vol: 0.55,
    gen: (sr, r, v, D) => {
      const bp = svf(sr);
      let p = 0;
      return mk(sr, D, (t) => {
        const f = 650 + 1900 * ex(-t * 2.6);
        p += TAU * f * (1 + 0.012 * Math.sin(TAU * 11 * t)) / sr;
        bp.run(r() * 2 - 1, f, 5);
        return (Math.sin(p) + 0.3 * Math.sin(2 * p) + bp.nbp * 0.3) * Math.pow(t / D, 1.2);
      });
    } },
  sk_mine_arm: { n: 1, dur: 0.55, bus: 'world', max: 3, pri: 4, vol: 0.55,
    gen: (sr, r, v, D) => {
      const beeps = [{ f: 1760, t: 0 }, { f: 1760, t: 0.2 }, { f: 2349, t: 0.38 }].map((b) => ({ ...b, d: 0.05, w: (p) => Math.sin(p) + 0.3 * Math.sin(3 * p) }));
      return add(tones(sr, D, beeps), (t, i) => (i < 40 ? (r() * 2 - 1) * 0.6 * (1 - i / 40) : 0));
    } },
  sk_mine_zap: { n: 1, dur: 0.6, bus: 'world', max: 3, pri: 6, vol: 0.85,
    gen: (sr, r, v, D) => {
      const hp = lp1(sr, 2000), step = Math.round(sr / 800);
      let gate = 1, p = 0, ph = 0;
      return mk(sr, D, (t, i) => {
        if (i % step === 0) gate = r() > 0.4 ? 1 : 0;
        const x = r() * 2 - 1;
        p += TAU * (2200 * ex(-t * 9) + 180) / sr;
        ph += TAU * (50 + 70 * ex(-t * 30)) / sr;
        return (x - hp(x)) * gate * ex(-t / 0.14) + Math.sin(p + 3 * Math.sin(TAU * 90 * t)) * ex(-t / 0.12) * 0.7 + x * ex(-t / 0.006) * 0.6 + Math.sin(ph) * ex(-t / 0.06) * 0.6;
      });
    } },
  sk_blink: { n: 1, dur: 0.55, bus: 'world', max: 2, pri: 5, vol: 0.7,
    gen: (sr, r, v, D) => {
      const bp = svf(sr), hp = lp1(sr, 3000);
      let p = 0;
      return mk(sr, D, (t) => {
        const x = r() * 2 - 1;
        bp.run(x, 300 + 3800 * Math.sin(Math.PI * clamp(t / 0.35, 0, 1)), 1.5);
        p += TAU * (300 + 900 * ex(-t * 12)) / sr;
        return bp.nbp * ad(t, 0.12, 0.12) * 1.2 + Math.sin(p) * ex(-t / 0.1) * 0.3 + (x - hp(x)) * ex(-t / 0.004) * 0.6;
      });
    } },
  sk_beam_charge: { n: 1, dur: 1.0, bus: 'world', max: 1, pri: 7, vol: 0.85,
    gen: (sr, r, v, D) => {
      const hp = lp1(sr, 3000);
      let p1 = 0, p2 = 0;
      return mk(sr, D, (t) => {
        const u = t / D, f = 180 + 2400 * Math.pow(u, 2.2), x = r() * 2 - 1;
        p1 += TAU * f / sr; p2 += TAU * f * 1.005 / sr;
        return (Math.sin(p1) + Math.sin(p2) + 0.4 * Math.sin(2 * p1)) * (0.2 + 0.8 * u) * (1 + 0.2 * Math.sin(TAU * 30 * t)) + (x - hp(x)) * u * u * 0.4;
      });
    } },
  sk_beam_fire: { n: 1, dur: 1.6, bus: 'world', max: 1, pri: 8, vol: 1, duck: 0.25,
    gen: (sr, r, v, D) => {
      const hp = lp1(sr, 600), f = svf(sr), bp = svf(sr);
      let s1 = 0, s2 = 0, ph = 0, p = 0;
      return mk(sr, D, (t) => {
        const x = r() * 2 - 1;
        s1 = (s1 + 110 / sr) % 1; s2 = (s2 + 220 / sr) % 1;
        f.run((2 * s1 - 1) + 0.5 * (2 * s2 - 1), 3000 * ex(-t * 2.5) + 300, 2);
        ph += TAU * (35 + 85 * ex(-t * 22)) / sr;
        p += TAU * (250 + 2950 * ex(-t * 6)) / sr;
        bp.run(r() * 2 - 1, 800, 1);
        return (x - hp(x)) * ex(-t / 0.12) + Math.sin(ph) * ex(-t / 0.2) + f.lp * ex(-t / 0.5) * 0.8 + Math.sin(p) * ex(-t / 0.35) * 0.6 + bp.nbp * ex(-t / 0.7) * 0.3;
      });
    } },
  sk_heal: { n: 1, dur: 1.1, bus: 'world', max: 2, pri: 5, vol: 0.6,
    gen: (sr, r, v, D) => tones(sr, D, [880, 1318.5, 1760, 2637].map((f, i) => ({ f, t: i * 0.09, d: 0.3, w: (p) => Math.sin(p) + 0.2 * Math.sin(2.01 * p), g: 0.85 - i * 0.12 }))) },
  sk_slow: { n: 1, dur: 1.0, bus: 'world', max: 2, pri: 4, vol: 0.7,
    gen: (sr, r, v, D) => {
      const nz = nlp(sr, 300);
      let p1 = 0, p2 = 0;
      return mk(sr, D, (t) => {
        const f = 210 * ex(-t * 0.9) + 70, env = ad(t, 0.1, 0.5) * (0.7 + 0.3 * Math.sin(TAU * 7 * t));
        p1 += TAU * f / sr; p2 += TAU * f * 1.02 / sr;
        return (Math.sin(p1) + 0.5 * Math.sin(p2) + nz(r() * 2 - 1) * 0.4) * env;
      });
    } },
  sk_dome: { n: 1, dur: 1.4, bus: 'world', max: 1, pri: 7, vol: 0.9,
    gen: (sr, r, v, D) => {
      const hp = lp1(sr, 5000);
      let p = 0;
      return mk(sr, D, (t) => {
        const u = clamp(t / 0.9, 0, 1), f = 150 * Math.pow(4, u), env = t < 0.9 ? Math.pow(u, 1.5) : ex(-(t - 0.9) / 0.25);
        p += TAU * f / sr;
        const x = r() * 2 - 1;
        const whump = t > 0.9 ? Math.sin(TAU * 70 * (t - 0.9)) * ex(-(t - 0.9) / 0.12) * 1.2 : 0;
        return (Math.sin(p) + Math.sin(1.5 * p) + 0.6 * Math.sin(2 * p)) * env * 0.6 + (x - hp(x)) * env * 0.2 + whump;
      });
    } },

  sk_smoke: { n: 1, dur: 1.4, bus: 'world', max: 2, pri: 5, vol: 0.7,
    gen: (sr, r, v, D) => {
      const bp = svf(sr), body = nlp(sr, 900), pop = nlp(sr, 1500);
      let p = 0;
      return mk(sr, D, (t) => {
        p += TAU * (70 + 150 * ex(-t * 40)) / sr;
        bp.run(r() * 2 - 1, 3600, 0.7);
        return Math.sin(p) * ex(-t / 0.06) * 1.1 + pop(r() * 2 - 1) * ex(-t / 0.03) * 0.8 + bp.nbp * ad(t, 0.15, 0.5) * 0.5 + body(r() * 2 - 1) * ad(t, 0.25, 0.4) * 0.3;
      });
    } },
  sk_recoil: { n: 1, dur: 0.6, bus: 'world', max: 2, pri: 7, vol: 0.9, duck: 0.2,
    gen: (sr, r, v, D) => {
      const base = blast(sr, r, { fc0: 2600, fc1: 300, fk: 14, dec: 0.15, th0: 110, th1: 40, thk: 30, thd: 0.15, thA: 1, rum: 0.2, rumA: 0.4, debris: 2, dAt: 0.05, dSpan: 0.2 });
      const bp = svf(sr);
      return mk(sr, D, (t) => { bp.run(r() * 2 - 1, 2500 * ex(-t * 9) + 400, 1.2); return base(t) + bp.nbp * ex(-t / 0.15) * 0.5; });
    } },
  sk_heavy_call: { n: 1, dur: 1.4, bus: 'world', max: 2, pri: 6, vol: 0.85, duck: 0.2,
    gen: (sr, r, v, D) => {
      const f = svf(sr), rum = nlp(sr, 150), th = swp(95, 36, 14);
      let s1 = 0, s2 = 0;
      return mk(sr, D, (t) => {
        s1 = (s1 + 98 / sr) % 1; s2 = (s2 + 147 / sr) % 1;
        let g = 0, sb = 0;
        for (const t0 of [0, 0.3, 0.6]) if (t > t0) { g += ad(t - t0, 0.01, 0.22); sb += th(t - t0) * ex(-(t - t0) / 0.18); }
        f.run((2 * s1 - 1) + 0.6 * (2 * s2 - 1), 450 + 700 * Math.min(g, 1), 1.2);
        return f.lp * g + rum(r() * 2 - 1) * ad(t, 0.2, 0.5) * 0.8 + sb * 0.7;
      });
    } },
  sk_pounce: { n: 1, dur: 0.45, bus: 'world', max: 2, pri: 6, vol: 0.75,
    gen: (sr, r, v, D) => {
      const bp = svf(sr), hp = lp1(sr, 3000);
      return mk(sr, D, (t) => {
        const x = r() * 2 - 1;
        bp.run(x, 3000 * ex(-t * 6) + 500, 1.8);
        const claw = (t < 0.01 ? 1 : 0) + (t > 0.05 ? ex(-(t - 0.05) / 0.004) : 0);
        return bp.nbp * ad(t, 0.02, 0.12) * 1.3 + (x - hp(x)) * claw * 0.6 + Math.sin(TAU * 90 * t) * ex(-t / 0.05) * 0.5;
      });
    } },
  sk_cloak: { n: 1, dur: 1.0, bus: 'world', max: 2, pri: 5, vol: 0.6,
    gen: (sr, r, v, D) => {
      const sh = [], bp = svf(sr);
      for (let k = 0; k < 7; k++) sh.push({ t: r() * 0.4, f: rnd(r, 1500, 5500), am: rnd(r, 9, 14), a: rnd(r, 0.3, 0.6) });
      let p = 0;
      return mk(sr, D, (t) => {
        let s = 0;
        for (const q of sh) if (t > q.t) s += Math.sin(TAU * q.f * (t - q.t)) * ex(-(t - q.t) / 0.35) * q.a * (0.6 + 0.4 * Math.sin(TAU * q.am * t));
        p += TAU * (2400 * ex(-t * 2.2) + 500) / sr;
        bp.run(r() * 2 - 1, 5000 * ex(-t * 2) + 1200, 1.5);
        return s + Math.sin(p) * ad(t, 0.1, 0.3) * 0.3 + bp.nbp * ad(t, 0.05, 0.25) * 0.25;
      });
    } },
  sk_spin: { n: 1, dur: 0.45, bus: 'world', max: 2, pri: 5, vol: 0.7,
    gen: (sr, r, v, D) => {
      const bp = svf(sr);
      return mk(sr, D, (t) => {
        const u = Math.sin(Math.PI * clamp(t / 0.4, 0, 1));
        bp.run(r() * 2 - 1, 700 + 700 * u, 1.6);
        const pass = 0.55 + 0.45 * Math.sin(TAU * 18 * t);
        const ring = (Math.sin(TAU * 1900 * t) + 0.5 * Math.sin(TAU * 4600 * t)) * Math.pow(Math.max(0, Math.sin(TAU * 9 * t)), 8) * 0.3;
        return bp.nbp * pass * u * 1.1 + ring * ex(-t / 0.4);
      });
    } },
  sk_ice_wall: { n: 1, dur: 1.0, bus: 'world', max: 2, pri: 6, vol: 0.85,
    gen: (sr, r, v, D) => {
      const cr = [], hp = lp1(sr, 3000), bp = svf(sr), rum = nlp(sr, 120);
      for (let k = 0; k < 6; k++) cr.push({ t: r() * 0.3, f: rnd(r, 1800, 4000), a: rnd(r, 0.4, 0.9) });
      return mk(sr, D, (t) => {
        const x = r() * 2 - 1, hi = x - hp(x);
        let s = 0;
        for (const q of cr) if (t > q.t) s += hi * ex(-(t - q.t) / 0.004) * q.a + Math.sin(TAU * q.f * (t - q.t)) * ex(-(t - q.t) / 0.1) * q.a * 0.4;
        bp.run(r() * 2 - 1, 250 + 750 * (t / D), 2);
        return s + bp.nbp * ad(t, 0.15, 0.3) * 0.7 + rum(r() * 2 - 1) * ad(t, 0.05, 0.3) * 0.9 + Math.sin(TAU * 55 * t) * ex(-t / 0.12) * 0.8;
      });
    } },
  sk_ice_break: { n: 1, dur: 0.5, bus: 'world', max: 3, pri: 4, vol: 0.5,
    gen: (sr, r, v, D) => {
      const pings = [], hp = lp1(sr, 4000);
      for (let k = 0; k < 8; k++) pings.push({ t: r() * 0.12, f: rnd(r, 3000, 8000), d: rnd(r, 0.05, 0.15), a: rnd(r, 0.3, 0.6) });
      return mk(sr, D, (t) => {
        let s = 0;
        for (const q of pings) if (t > q.t) s += Math.sin(TAU * q.f * (t - q.t)) * ex(-(t - q.t) / q.d) * q.a;
        const x = r() * 2 - 1;
        return s + (x - hp(x)) * ex(-t / 0.03) * 0.8;
      });
    } },
  sk_frost_nova: { n: 1, dur: 0.9, bus: 'world', max: 2, pri: 6, vol: 0.85,
    gen: (sr, r, v, D) => {
      const pings = [], hp = lp1(sr, 4000);
      for (let k = 0; k < 6; k++) pings.push({ t: rnd(r, 0.02, 0.2), f: rnd(r, 2500, 6000), a: rnd(r, 0.25, 0.5) });
      let p = 0, q = 0;
      return mk(sr, D, (t) => {
        p += TAU * (3500 * ex(-t * 8) + 400) / sr;
        q += TAU * (40 + 80 * ex(-t * 20)) / sr;
        let s = 0;
        for (const g of pings) if (t > g.t) s += Math.sin(TAU * g.f * (t - g.t)) * ex(-(t - g.t) / 0.25) * g.a;
        const x = r() * 2 - 1;
        return Math.sin(q) * ex(-t / 0.15) + Math.sin(p) * ex(-t / 0.3) * 0.6 + (x - hp(x)) * ex(-t / 0.05) * 0.7 + s;
      });
    } },
  sk_blizzard: { n: 1, dur: 2.4, bus: 'world', max: 1, pri: 6, vol: 0.7,
    gen: (sr, r, v, D) => {
      const bp = svf(sr), hp = lp1(sr, 3000);
      let p = 0;
      return mk(sr, D, (t) => {
        const env = Math.min(1, t / 0.5, (D - t) / 0.7);
        const gust = 0.65 + 0.35 * Math.sin(TAU * 0.9 * t + 1) * Math.sin(TAU * 0.37 * t);
        bp.run(r() * 2 - 1, 600 + 450 * Math.sin(TAU * 0.9 * t) + 300 * Math.sin(TAU * 2.3 * t), 0.9);
        p += TAU * (900 + 120 * Math.sin(TAU * 1.3 * t)) / sr;
        const x = r() * 2 - 1;
        return (bp.nbp * 0.9 * gust + Math.sin(p) * 0.1 * gust + (x - hp(x)) * 0.2) * env;
      });
    } },
  sk_turret: { n: 1, dur: 0.9, bus: 'world', max: 2, pri: 5, vol: 0.8,
    gen: (sr, r, v, D) => {
      const R = [1, 2.35, 3.7, 5.1], T = [0.2, 0.14, 0.1, 0.07], hp = lp1(sr, 2500);
      let p = 0;
      return mk(sr, D, (t) => {
        let s = 0;
        for (let k = 0; k < 4; k++) s += Math.sin(TAU * 310 * R[k] * t) * ex(-t / T[k]) * (0.9 - k * 0.15);
        const x = r() * 2 - 1, w = t - 0.18;
        let whirr = 0;
        if (w > 0) {
          p += TAU * (250 + 500 * (1 - ex(-w * 6))) / sr;
          whirr = (Math.sin(p) + 0.5 * Math.sin(2 * p) + 0.3 * Math.sin(3 * p)) * (1 + 0.4 * Math.sin(TAU * 38 * t)) * Math.min(1, w / 0.05) * ex(-w / 0.5) * 0.4;
        }
        const click = t > 0.62 ? (x - hp(x)) * ex(-(t - 0.62) / 0.004) * 0.8 : 0;
        return s * 0.6 + (x - hp(x)) * ex(-t / 0.006) * 0.8 + whirr + click;
      });
    } },
  sk_magnet: { n: 1, dur: 1.5, bus: 'world', max: 2, pri: 5, vol: 0.75,
    gen: (sr, r, v, D) => {
      const bp = svf(sr);
      let p = 0;
      return mk(sr, D, (t) => {
        const u = t / D, e2 = u * u;
        const hum = (Math.sin(TAU * 58 * t) + 0.5 * Math.sin(TAU * 116.5 * t) + 0.25 * Math.sin(TAU * 175 * t)) * (0.75 + 0.25 * Math.sin(TAU * 6 * t)) * Math.min(1, t / 0.1) * (t < 1.3 ? 1 : ex(-(t - 1.3) / 0.1));
        p += TAU * (120 + 780 * e2) / sr;
        bp.run(r() * 2 - 1, 200 + 2200 * e2, 1.4);
        const thud = t > 1.3 ? Math.sin(TAU * 60 * (t - 1.3)) * ex(-(t - 1.3) / 0.12) * 1.2 : 0;
        return hum * 0.6 + Math.sin(p) * e2 * 0.4 + bp.nbp * e2 * 0.6 + thud;
      });
    } },
  sk_minefield: { n: 1, dur: 1.0, bus: 'world', max: 2, pri: 5, vol: 0.65,
    gen: (sr, r, v, D) => {
      const hp = lp1(sr, 2500), bs = [];
      const pitch = [1760, 2093, 2349, 2637];
      for (let k = 0; k < 5; k++) bs.push({ t: 0.05 + k * 0.13 + r() * 0.05, f: pitch[Math.floor(r() * 4)] });
      return mk(sr, D, (t) => {
        const x = r() * 2 - 1;
        let s = 0;
        for (const b of bs) if (t > b.t) {
          const tt = t - b.t;
          s += (Math.sin(TAU * b.f * tt) + 0.3 * Math.sin(TAU * b.f * 3 * tt)) * ex(-tt / 0.05) * 0.6 + (x - hp(x)) * ex(-tt / 0.003) * 0.5 + Math.sin(TAU * 80 * tt) * ex(-tt / 0.03) * 0.4;
        }
        return s;
      });
    } },
  turret_break: { n: 1, dur: 0.55, bus: 'world', max: 3, pri: 5, vol: 0.6,
    gen: (sr, r, v, D) => {
      const R = [1, 2.7, 4.1, 6.3], bp = svf(sr), hp = lp1(sr, 2000), step = Math.round(sr / 800);
      let gate = 1;
      return mk(sr, D, (t, i) => {
        if (i % step === 0) gate = r() > 0.4 ? 1 : 0;
        let s = 0;
        for (let k = 0; k < 4; k++) s += Math.sin(TAU * 420 * R[k] * t) * ex(-t / (0.15 - k * 0.025)) * (0.8 - k * 0.15);
        bp.run(r() * 2 - 1, 1500, 1);
        const x = r() * 2 - 1;
        return s * 0.6 + bp.nbp * ex(-t / 0.12) * 0.9 + (x - hp(x)) * gate * (t < 0.15 ? 0.5 : 0) + Math.sin(TAU * 90 * t) * ex(-t / 0.05) * 0.6;
      });
    } },

  shield_break: { n: 1, dur: 0.9, bus: 'world', max: 3, pri: 6, vol: 0.85,
    gen: (sr, r, v, D) => {
      const pings = [];
      for (let k = 0; k < 9; k++) pings.push({ t: r() * 0.15, f: 2200 + r() * 5500, d: 0.08 + r() * 0.18, a: 0.3 + r() * 0.3 });
      const hp = lp1(sr, 4500);
      let p = 0;
      return mk(sr, D, (t) => {
        let s = 0;
        for (const q of pings) if (t > q.t) s += Math.sin(TAU * q.f * (t - q.t)) * ex(-(t - q.t) / q.d) * q.a;
        const x = r() * 2 - 1;
        p += TAU * (2000 * ex(-t * 5) + 150) / sr;
        return s + (x - hp(x)) * ex(-t / 0.04) * 0.9 + Math.sin(p) * ex(-t / 0.2) * 0.5 + Math.sin(TAU * 90 * t) * ex(-t / 0.05) * 0.4;
      });
    } },
  heal_tick: { n: 1, dur: 0.28, bus: 'world', max: 2, pri: 2, vol: 0.4, gap: 0.15,
    gen: (sr, r, v, D) => tones(sr, D, [{ f: 1568, t: 0, d: 0.07, w: W.sin }, { f: 2349, t: 0, d: 0.05, w: W.sin, g: 0.5 }, { f: 3136, t: 0.02, d: 0.04, w: W.sin, g: 0.25 }]) },
  death: { n: 2, dur: 2.9, bus: 'world', max: 3, pri: 8, vol: 1, duck: 0.3,
    gen: (sr, r, v, D) => {
      const base = blast(sr, r, { fc0: 2200, fc1: 200, fk: 4, dec: 0.5, th0: 75, th1: 26, thk: 10, thd: 0.5, thA: 1.2, rum: 1.0, rumA: 1.2, debris: 10, dAt: 0.15, dSpan: 1.4 });
      const clangs = [], popSub = swp(80, 30, 14), sub = swp(60 + v * 6, 21, 4), hp = lp1(sr, 2500), e = nlp(sr, 280);
      for (let k = 0; k < 8; k++) clangs.push({ t: rnd(r, 0.1, 1.6), f: rnd(r, 200, 900), d: rnd(r, 0.15, 0.4), a: rnd(r, 0.35, 0.6) });
      const fire = [];
      for (let k = 0; k < 26; k++) fire.push([rnd(r, 0.6, 2.5), rnd(r, 0.05, 0.2)]);
      return mk(sr, D, (t) => {
        let s = 0;
        for (const c of clangs) if (t > c.t) { const tt = t - c.t; s += (Math.sin(TAU * c.f * tt) + 0.6 * Math.sin(TAU * c.f * 2.7 * tt) + 0.3 * Math.sin(TAU * c.f * 5.2 * tt)) * ex(-tt / c.d) * c.a; }
        const x = r() * 2 - 1, hi = x - hp(x);
        let cr = 0;
        for (const [t0, a] of fire) if (t > t0) cr += hi * a * ex(-(t - t0) / 0.004);
        // second charge goes off while the frame is still falling
        const pop = t > 0.42 ? e(r() * 2 - 1) * ex(-(t - 0.42) / 0.25) * 0.8 + popSub(t - 0.42) * ex(-(t - 0.42) / 0.3) * 0.7 : 0;
        return base(t) + s * 0.6 + sub(t) * ex(-t / 0.9) * 1.0 + cr + pop;
      });
    } },
  respawn: { n: 1, dur: 1.3, bus: 'world', max: 2, pri: 5, vol: 0.8,
    gen: (sr, r, v, D) => {
      const bp = svf(sr);
      let p = 0;
      const sp = tones(sr, D, [{ f: 1568, t: 0.82, d: 0.25, w: W.bell }, { f: 2093, t: 0.9, d: 0.25, w: W.bell, g: 0.8 }]);
      return mk(sr, D, (t, i) => {
        const u = clamp(t / 0.8, 0, 1), env = t < 0.8 ? u : ex(-(t - 0.8) / 0.2);
        p += TAU * 180 * Math.pow(6, u) / sr;
        bp.run(r() * 2 - 1, 400 + 3000 * u, 2);
        return (Math.sin(p) + 0.5 * Math.sin(1.5 * p) + 0.3 * Math.sin(2 * p)) * env + bp.nbp * env * 0.2 + sp.fn(t, i) * 0.6;
      });
    } },
  prop_hit: { n: 1, dur: 0.28, bus: 'world', max: 4, pri: 3, vol: 0.55,
    gen: (sr, r, v, D) => {
      const bp = svf(sr), hp = lp1(sr, 3000);
      let p = 0;
      return mk(sr, D, (t) => {
        p += TAU * (130 + 110 * ex(-t * 50)) / sr;
        bp.run(r() * 2 - 1, 1100, 1.2);
        const x = r() * 2 - 1;
        return Math.sin(p) * ex(-t / 0.035) + bp.nbp * ex(-t / 0.03) * 0.9 + (x - hp(x)) * ex(-t / 0.003) * 0.5;
      });
    } },
  crate_break: { n: 1, dur: 0.8, bus: 'world', max: 3, pri: 4, vol: 0.8,
    gen: (sr, r, v, D) => {
      const planks = [], bp = svf(sr);
      for (let k = 0; k < 6; k++) planks.push({ t: r() * 0.14, d: rnd(r, 0.03, 0.08), a: rnd(r, 0.5, 1) });
      const ticks = [];
      for (let k = 0; k < 4; k++) ticks.push({ t: rnd(r, 0.2, 0.6), f: rnd(r, 700, 1100) });
      let p = 0;
      return mk(sr, D, (t) => {
        let g = 0;
        for (const q of planks) if (t > q.t) g += ex(-(t - q.t) / q.d) * q.a;
        bp.run(r() * 2 - 1, 1800 * ex(-t * 8) + 700, 0.9);
        p += TAU * (60 + 50 * ex(-t * 15)) / sr;
        let tk = 0;
        for (const q of ticks) if (t > q.t) tk += Math.sin(TAU * q.f * (t - q.t)) * ex(-(t - q.t) / 0.01) * 0.4;
        return bp.nbp * g + Math.sin(p) * ex(-t / 0.07) * 0.8 + tk;
      });
    } },
  pot_break: { n: 1, dur: 0.7, bus: 'world', max: 3, pri: 4, vol: 0.75,
    gen: (sr, r, v, D) => {
      const sh = [], hp = lp1(sr, 3500);
      for (let k = 0; k < 10; k++) sh.push({ t: r() * 0.22, f: rnd(r, 2500, 7000), d: rnd(r, 0.02, 0.07), a: rnd(r, 0.3, 0.7) });
      let p = 0;
      return mk(sr, D, (t) => {
        let s = 0;
        for (const q of sh) if (t > q.t) s += Math.sin(TAU * q.f * (t - q.t)) * ex(-(t - q.t) / q.d) * q.a;
        const x = r() * 2 - 1;
        p += TAU * (90 + 80 * ex(-t * 40)) / sr;
        return s + (x - hp(x)) * ex(-t / 0.03) + Math.sin(p) * ex(-t / 0.04) * 0.5;
      });
    } },
  crate_drop: { n: 1, dur: 3.3, bus: 'world', max: 2, pri: 3, vol: 0.5,
    gen: (sr, r, v, D) => {
      const bp = svf(sr), rus = nlp(sr, 250);
      let p = 0;
      return mk(sr, D, (t) => {
        p += TAU * (1700 - 700 * (t / D) + 40 * Math.sin(TAU * 5 * t)) / sr;
        const lfo = Math.pow(Math.abs(Math.sin(TAU * 9 * t + 2 * Math.sin(TAU * 1.3 * t))), 2);
        bp.run(r() * 2 - 1, 600 + 300 * Math.sin(TAU * 1.7 * t), 1.4);
        return (Math.sin(p) * 0.25 + bp.nbp * (0.4 + 0.6 * lfo) + rus(r() * 2 - 1) * 0.3) * Math.min(1, t / 0.3, (D - t) / 0.3);
      });
    } },
  crate_land: { n: 1, dur: 0.7, bus: 'world', max: 2, pri: 4, vol: 0.8,
    gen: (sr, r, v, D) => {
      const body = nlp(sr, 900), dust = nlp(sr, 2500);
      let p = 0;
      return mk(sr, D, (t) => {
        p += TAU * (45 + 55 * ex(-t * 12)) / sr;
        return Math.sin(p) * ex(-t / 0.12) * 1.2 + body(r() * 2 - 1) * ex(-t / 0.07) * 0.8 + (Math.sin(TAU * 520 * t) + 0.5 * Math.sin(TAU * 1340 * t)) * ex(-t / 0.12) * 0.15 + dust(r() * 2 - 1) * ad(t, 0.02, 0.25) * 0.25;
      });
    } },

  pickup_heal: { n: 1, dur: 0.9, bus: 'world', max: 2, pri: 5, vol: 0.7,
    gen: (sr, r, v, D) => tones(sr, D, [523.25, 659.25, 783.99, 1046.5].map((f, i) => ({ f, t: i * 0.07, d: 0.3, w: W.bell, g: 1 - i * 0.1 }))) },
  pickup_power: { n: 1, dur: 0.8, bus: 'world', max: 2, pri: 5, vol: 0.75,
    gen: (sr, r, v, D) => {
      const nz = nlp(sr, 600);
      return add(tones(sr, D, [220, 330, 440, 660].map((f, i) => ({ f, t: i * 0.06, d: 0.22, w: (p) => W.brass(p) + 0.3 * Math.sin(5 * p), a: 0.004 }))),
        (t) => nz(r() * 2 - 1) * ex(-t / 0.08) * 0.5);
    } },
  pickup_haste: { n: 1, dur: 0.6, bus: 'world', max: 2, pri: 5, vol: 0.7,
    gen: (sr, r, v, D) => {
      const bp = svf(sr);
      return add(tones(sr, D, [660, 880, 1320].map((f, i) => ({ f, t: i * 0.05, d: 0.12, w: W.sq }))),
        (t) => { bp.run(r() * 2 - 1, 500 + 4000 * t / 0.3, 1.5); return bp.nbp * ad(t, 0.1, 0.12) * 0.35; });
    } },
  pickup_refresh: { n: 1, dur: 0.9, bus: 'world', max: 2, pri: 5, vol: 0.65,
    gen: (sr, r, v, D) => {
      const pent = [1046.5, 1318.5, 1568, 1760, 2093, 2637, 3136, 3520, 4186];
      return tones(sr, D, pent.map((f, i) => ({ f, t: i * 0.05, d: 0.25, w: W.sin, g: 0.9 - i * 0.04 })));
    } },
  pickup_shield: { n: 1, dur: 0.9, bus: 'world', max: 2, pri: 5, vol: 0.7,
    gen: (sr, r, v, D) => {
      let p = 0;
      return add(tones(sr, D, [{ f: 392, t: 0, d: 0.35, w: W.fm }, { f: 587, t: 0.12, d: 0.4, w: W.fm }, { f: 1175, t: 0.12, d: 0.3, w: W.bell, g: 0.4 }]),
        (t) => { p += TAU * (1200 + 2400 * t) / sr; return Math.sin(p) * ad(t, 0.15, 0.2) * 0.2; });
    } },

  horn: { n: 1, dur: 2.2, bus: 'ui', max: 1, pri: 9, vol: 0.9,
    gen: (sr, r, v, D) => {
      const f = svf(sr), br = nlp(sr, 800);
      let a = 0, b = 0, c = 0;
      const gate = (t) => {
        const g1 = t < 0.5 ? Math.min(t / 0.05, 1) * (t > 0.4 ? (0.5 - t) / 0.1 : 1) : 0;
        const g2 = t >= 0.7 ? Math.min((t - 0.7) / 0.08, 1) * (t < 1.7 ? 1 : Math.max(0, 1 - (t - 1.7) / 0.5)) : 0;
        return Math.max(g1, g2);
      };
      return mk(sr, D, (t) => {
        const scoop = 0.96 + 0.04 * (1 - ex(-t * 12)), g = gate(t);
        a = (a + 116.5 * scoop / sr) % 1; b = (b + 116.5 * 1.003 * scoop / sr) % 1; c = (c + 174.6 * scoop / sr) % 1;
        f.run((2 * a - 1) + (2 * b - 1) + 0.6 * (2 * c - 1) + br(r() * 2 - 1) * 0.15, 700 + 900 * g, 1.4);
        return f.lp * g;
      });
    } },
  win: { n: 1, dur: 3.4, bus: 'ui', max: 1, pri: 9, vol: 0.85,
    gen: (sr, r, v, D) => {
      const list = [261.6, 329.6, 392, 523.3, 659.3].map((f, i) => ({ f, t: [0, 0.14, 0.28, 0.42, 0.62][i], d: 0.5, w: W.brass, a: 0.01 }));
      for (const f of [523.3, 659.3, 784]) list.push({ f, t: 0.85, d: 1.2, w: W.brass, a: 0.02, g: 0.8 });
      list.push({ f: 130.8, t: 0.85, d: 1.6, w: W.brass, a: 0.02, g: 0.9 }, { f: 65.4, t: 0.85, d: 1.6, w: W.soft, a: 0.02, g: 0.8 });
      list.push({ f: 2093, t: 1.0, d: 0.7, w: W.bell, g: 0.4 }, { f: 2637, t: 1.12, d: 0.7, w: W.bell, g: 0.35 }, { f: 3136, t: 1.3, d: 0.9, w: W.bell, g: 0.3 });
      const T = tones(sr, D, list), t1 = swp(110, 55, 14), t2 = swp(110, 52, 14), t3 = swp(100, 48, 12);
      return add(T, (t) => t1(t) * ex(-t / 0.22) * 0.9 + (t > 0.62 ? t2(t - 0.62) * ex(-(t - 0.62) / 0.22) * 0.7 : 0) + (t > 0.85 ? t3(t - 0.85) * ex(-(t - 0.85) / 0.5) * 1.0 : 0));
    } },
  lose: { n: 1, dur: 3.2, bus: 'ui', max: 1, pri: 9, vol: 0.8,
    gen: (sr, r, v, D) => {
      const list = [440, 392, 329.6, 220].map((f, i) => ({ f, t: i * 0.38, d: 0.5, w: (p) => W.brass(p) + 0.6 * Math.sin(p * 1.01), a: 0.02 }));
      list.push({ f: 110, t: 1.4, d: 1.5, w: W.brass, a: 0.05, g: 0.9 }, { f: 110 * 1.006, t: 1.4, d: 1.5, w: W.brass, a: 0.05, g: 0.7 }, { f: 82.4, t: 1.4, d: 1.7, w: W.soft, a: 0.05, g: 0.8 });
      const l = lp1(sr, 900), th = swp(80, 38, 8);
      return add(map(tones(sr, D, list), (x) => l(x)), (t) => (t > 1.4 ? th(t - 1.4) * ex(-(t - 1.4) / 0.6) * 0.8 : 0));
    } },

  ui_click: { n: 1, dur: 0.09, bus: 'ui', max: 3, pri: 8, vol: 0.55,
    gen: (sr, r, v, D) => {
      const hp = lp1(sr, 3000);
      let p = 0;
      return mk(sr, D, (t) => {
        p += TAU * (900 + 800 * ex(-t * 50)) / sr;
        const x = r() * 2 - 1;
        return Math.sin(p) * ex(-t / 0.012) * 0.8 + (x - hp(x)) * ex(-t / 0.002) * 0.4 + Math.sin(TAU * 220 * t) * ex(-t / 0.02) * 0.3;
      });
    } },
  ui_hover: { n: 1, dur: 0.07, bus: 'ui', max: 2, pri: 6, vol: 0.25,
    gen: (sr, r, v, D) => tones(sr, D, [{ f: 2200, t: 0, d: 0.012, w: W.sin }, { f: 3300, t: 0, d: 0.01, w: W.sin, g: 0.3 }]) },
  ui_start: { n: 1, dur: 1.4, bus: 'ui', max: 1, pri: 9, vol: 0.8,
    gen: (sr, r, v, D) => {
      const hp = lp1(sr, 2500), th = swp(80, 38, 12);
      const stab = tones(sr, D, [110, 164.8, 220, 329.6].map((f, i) => ({ f, t: 0.55, d: 0.5, w: W.brass, a: 0.01, g: i < 2 ? 0.7 : 0.5 })));
      let p = 0;
      return mk(sr, D, (t, i) => {
        const u = clamp(t / 0.55, 0, 1), pre = t < 0.55 ? u * u : 0, hit = t >= 0.55 ? t - 0.55 : -1;
        p += TAU * (150 + 550 * u * u) / sr;
        let s = (Math.sin(p) + 0.4 * Math.sin(2 * p)) * pre;
        if (hit >= 0) { const x = r() * 2 - 1; s += th(hit) * ex(-hit / 0.3) * 1.3 + (x - hp(x)) * ex(-hit / 0.05) * 0.6 + stab.fn(t, i) * 0.45; }
        return s;
      });
    } },
  ui_countdown: { n: 1, dur: 0.4, bus: 'ui', max: 1, pri: 9, vol: 0.7,
    gen: (sr, r, v, D) => {
      return add(tones(sr, D, [{ f: 880, t: 0, d: 0.11, w: (p) => Math.sin(p) + 0.4 * Math.sin(2 * p) + 0.2 * Math.sin(3 * p), a: 0.004 }, { f: 440, t: 0, d: 0.12, w: W.sin, g: 0.3 }]),
        (t, i) => (i < 60 ? (r() * 2 - 1) * 0.4 * (1 - i / 60) : 0));
    } },
  ui_coin: { n: 1, dur: 0.6, bus: 'ui', max: 2, pri: 7, vol: 0.6,
    gen: (sr, r, v, D) => tones(sr, D, [{ f: 1318.5, t: 0, d: 0.06, w: W.bell }, { f: 1975.5, t: 0.07, d: 0.35, w: W.bell }]) },
  ui_levelup: { n: 1, dur: 1.4, bus: 'ui', max: 1, pri: 9, vol: 0.75,
    gen: (sr, r, v, D) => {
      const list = [1046.5, 1174.7, 1318.5, 1568, 1760, 2093].map((f, i) => ({ f, t: i * 0.1, d: 0.35, w: W.bell }));
      for (const f of [1046.5, 1318.5, 1568]) list.push({ f, t: 0.62, d: 0.6, w: W.soft, g: 0.7 });
      return tones(sr, D, list);
    } },
  ui_ready: { n: 1, dur: 0.45, bus: 'ui', max: 2, pri: 7, vol: 0.5,
    gen: (sr, r, v, D) => tones(sr, D, [{ f: 1318.5, t: 0, d: 0.1, w: W.soft }, { f: 1975.5, t: 0.08, d: 0.25, w: W.bell }]) },
  ui_deny: { n: 1, dur: 0.35, bus: 'ui', max: 2, pri: 7, vol: 0.6,
    gen: (sr, r, v, D) => {
      const l = lp1(sr, 700);
      let s = 0;
      return mk(sr, D, (t) => {
        s = (s + (160 - 40 * clamp(t / 0.3, 0, 1)) / sr) % 1;
        const g = (t < 0.14 || (t > 0.17 && t < 0.32)) ? 1 : 0;
        return l((2 * s - 1) * g);
      });
    } },
  fire_tower: { n: 2, dur: 0.8, bus: 'gun', max: 2, pri: 6, vol: 0.85,
    gen: (sr, r, v, D) => {
      const hp = lp1(sr, 2000), bp = svf(sr), body = nlp(sr, 500), th = swp(115 + v * 8, 40, 18);
      let p = 0, q = 0;
      return mk(sr, D, (t) => {
        const x = r() * 2 - 1;
        p += TAU * (180 + 900 * ex(-t * 14)) / sr; q += TAU * (90 + 450 * ex(-t * 14)) / sr;
        bp.run(r() * 2 - 1, 2500 * ex(-t * 6) + 400, 3);
        return Math.tanh(1.4 * ((x - hp(x)) * ex(-t / 0.005) * 0.8 + th(t) * ex(-t / 0.3) * 0.6 + (Math.sin(p) + 0.5 * (2 * ((q / TAU) % 1) - 1)) * ex(-t / 0.2) * 1.0 +
          bp.nbp * ex(-t / 0.18) * 1.0 + body(r() * 2 - 1) * ex(-t / 0.1) * 0.3 + Math.sin(TAU * 1400 * t * (1 + 0.5 * ex(-t * 10))) * ex(-t / 0.15) * 0.35 + Math.sin(TAU * 220 * t) * ex(-t / 0.4) * 0.25));
      });
    } },
  hit_heavy: { n: 2, dur: 0.55, bus: 'world', max: 3, pri: 5, vol: 0.7,
    gen: (sr, r, v, D) => {
      const l = lp1(sr, 1500), body = nlp(sr, 600), th = swp(120, 42, 22), cl = ring(210 + v * 30, [1, 2.4, 3.9, 6.1], [0.22, 0.14, 0.09, 0.05], [1, 0.6, 0.4, 0.25]);
      return mk(sr, D, (t) => {
        const x = r() * 2 - 1;
        return Math.tanh(1.3 * (th(t) * ex(-t / 0.12) * 1.2 + body(r() * 2 - 1) * ex(-t / 0.05) * 0.8 + cl(t) * 0.7 + (x - l(x)) * ex(-t / 0.006) * 0.9));
      });
    } },
  hit_dome: { n: 2, dur: 0.6, bus: 'world', max: 3, pri: 3, vol: 0.5,
    gen: (sr, r, v, D) => {
      const bp = svf(sr);
      const f = 330 + v * 40;
      return mk(sr, D, (t) => {
        bp.run(r() * 2 - 1, 2400, 2);
        const beat = Math.sin(TAU * f * t) + Math.sin(TAU * f * 1.012 * t) + 0.5 * Math.sin(TAU * f * 3 * t);
        return beat * ex(-t / 0.22) * 0.5 + bp.nbp * ex(-t / 0.05) * 0.6 + Math.sin(TAU * (700 - 400 * ex(-t * 30)) * t) * ex(-t / 0.1) * 0.5;
      });
    } },
  imp_ice: { n: 2, dur: 0.3, bus: 'world', max: 3, pri: 2, vol: 0.4,
    gen: (sr, r, v, D) => {
      const pings = [], hp = lp1(sr, 4500);
      for (let k = 0; k < 5; k++) pings.push({ t: r() * 0.04, f: rnd(r, 3500, 8500), d: rnd(r, 0.02, 0.07), a: rnd(r, 0.3, 0.6) });
      return mk(sr, D, (t) => {
        let s = 0;
        for (const q of pings) if (t > q.t) s += Math.sin(TAU * q.f * (t - q.t)) * ex(-(t - q.t) / q.d) * q.a;
        const x = r() * 2 - 1;
        return s + (x - hp(x)) * ex(-t / 0.01);
      });
    } },
  imp_energy: { n: 2, dur: 0.3, bus: 'world', max: 3, pri: 2, vol: 0.4,
    gen: (sr, r, v, D) => {
      const nz = nlp(sr, 3000);
      let p = 0;
      return mk(sr, D, (t) => {
        p += TAU * (1400 + v * 300 - 900 * ex(-t * 25) * -1) / sr;
        return (Math.sin(p) + 0.4 * Math.sin(2.01 * p)) * ex(-t / 0.05) * 0.8 + nz(r() * 2 - 1) * ex(-t / 0.012) * 0.7 + Math.sin(TAU * 90 * t) * ex(-t / 0.05) * 0.4;
      });
    } },
  sk_rain: { n: 1, dur: 2.1, bus: 'world', max: 1, pri: 7, vol: 0.85, duck: 0.2,
    gen: (sr, r, v, D) => {
      // Windup: three rising lock-on beeps. Release: nine rockets leave the pods one by one.
      const bp = svf(sr), hi = lp1(sr, 3500), rum = nlp(sr, 250);
      const beeps = [0, 0.14, 0.28].map((t0, i) => ({ f: 1200 + i * 350, t: t0, d: 0.05, w: W.sq, a: 0.002 }));
      const lock = tones(sr, D, beeps);
      const pops = [];
      for (let k = 0; k < 9; k++) pops.push({ t: 0.5 + k * 0.17 + r() * 0.03, f: 600 + r() * 500, th: swp(150 + r() * 40, 50, 35) });
      return mk(sr, D, (t, i) => {
        const x = r() * 2 - 1;
        let s = lock.fn(t, i) * 0.5;
        bp.run(r() * 2 - 1, 300 + 1500 * ad(t, 0.4, 1.0), 1.2);
        let g = 0;
        for (const q of pops) if (t > q.t) {
          const tt = t - q.t;
          s += q.th(tt) * ex(-tt / 0.07) * 0.9 + (x - hi(x)) * ex(-tt / 0.005) * 0.5;
          g += ad(tt, 0.02, 0.18);
        }
        return s + bp.nbp * Math.min(1, g) * 0.5 + rum(r() * 2 - 1) * ad(t, 0.45, 0.8) * 0.5;
      });
    } },
  tower_hit: { n: 3, dur: 0.45, bus: 'world', max: 3, pri: 4, vol: 0.7, gap: 0.05,
    gen: (sr, r, v, D) => {
      const body = nlp(sr, 800), hp = lp1(sr, 2500), th = swp(105 + v * 10, 42, 30), cl = ring(150 + v * 20, [1, 2.1, 3.3, 4.8], [0.25, 0.14, 0.08, 0.05], [1, 0.6, 0.35, 0.2]);
      const ticks = [];
      for (let k = 0; k < 4; k++) ticks.push(rnd(r, 0.05, 0.3));
      return mk(sr, D, (t) => {
        const x = r() * 2 - 1, hi = x - hp(x);
        let deb = 0;
        for (const t0 of ticks) if (t > t0) deb += hi * ex(-(t - t0) / 0.005) * 0.25;
        return Math.tanh(1.3 * (th(t) * ex(-t / 0.1) * 1.2 + body(r() * 2 - 1) * ex(-t / 0.05) * 0.8 + cl(t) * 0.55 + hi * ex(-t / 0.004) * 0.6 + deb));
      });
    } },
  tower_block: { n: 2, dur: 0.7, bus: 'world', max: 3, pri: 5, vol: 0.75, gap: 0.08,
    gen: (sr, r, v, D) => {
      // The ward turns the shot away: bell strike, a falling "no" sweep and a sizzle of rejected energy.
      const bp = svf(sr), f = 1750 + v * 200;
      let p = 0;
      return mk(sr, D, (t) => {
        p += TAU * (300 + 900 * ex(-t * 11)) / sr;
        bp.run(r() * 2 - 1, 5200, 2);
        return (Math.sin(TAU * f * t) + 0.7 * Math.sin(TAU * f * 1.51 * t) + 0.4 * Math.sin(TAU * f * 2.33 * t)) * ex(-t / 0.2) * 0.45 + Math.sin(p) * ex(-t / 0.14) * 0.8 +
          bp.nbp * ex(-t / 0.08) * 0.6 + (Math.sin(TAU * 220 * t) + Math.sin(TAU * 223 * t)) * ex(-t / 0.35) * 0.3;
      });
    } },
  tower_down: { n: 1, dur: 3.6, bus: 'world', max: 2, pri: 9, vol: 1, duck: 0.35, gen: (sr, r, v, D) => collapse(sr, r, D, false) },
  tower_fall: { n: 1, dur: 5.4, bus: 'world', max: 1, pri: 10, vol: 1, duck: 0.45, gen: (sr, r, v, D) => collapse(sr, r, D, true) },
  ui_confirm: { n: 1, dur: 0.3, bus: 'ui', max: 2, pri: 8, vol: 0.55,
    gen: (sr, r, v, D) => add(tones(sr, D, [{ f: 660, t: 0, d: 0.08, w: W.soft }, { f: 990, t: 0.055, d: 0.17, w: W.bell }, { f: 1980, t: 0.055, d: 0.08, w: W.sin, g: 0.25 }]),
      (t) => Math.sin(TAU * 140 * t) * ex(-t / 0.03) * 0.4) },
  ui_back: { n: 1, dur: 0.22, bus: 'ui', max: 2, pri: 8, vol: 0.45,
    gen: (sr, r, v, D) => add(tones(sr, D, [{ f: 784, t: 0, d: 0.05, w: W.soft }, { f: 523, t: 0.045, d: 0.12, w: W.soft, g: 0.9 }]),
      (t) => Math.sin(TAU * 100 * t) * ex(-t / 0.025) * 0.35) },
  sting_final: { n: 1, dur: 2.4, bus: 'ui', max: 1, pri: 9, vol: 0.8,
    gen: (sr, r, v, D) => {
      // Thirty seconds left: a low minor-second swell, a hit, then a clock ticking into the music.
      const f = svf(sr), hp = lp1(sr, 2500), th = swp(90, 38, 14);
      let a = 0, b = 0;
      return mk(sr, D, (t) => {
        a = (a + 110 / sr) % 1; b = (b + 116.5 / sr) % 1;
        const sw = t < 1.0 ? (t / 1.0) ** 2 : ex(-(t - 1.0) / 0.5);
        f.run((2 * a - 1) + (2 * b - 1), 300 + 1400 * sw, 1.3);
        const hit = t >= 1.0 ? t - 1.0 : -1, x = r() * 2 - 1;
        let tick = 0;
        for (const t0 of [1.3, 1.6, 1.9, 2.2]) if (t > t0) tick += (x - hp(x)) * ex(-(t - t0) / 0.004) * 0.5 + Math.sin(TAU * (t0 === 1.3 || t0 === 1.9 ? 1250 : 980) * (t - t0)) * ex(-(t - t0) / 0.02) * 0.4;
        return f.lp * sw * 0.9 + (hit >= 0 ? th(hit) * ex(-hit / 0.4) * 1.3 + (x - hp(x)) * ex(-hit / 0.04) * 0.6 : 0) + tick;
      });
    } },
  sting_tower: { n: 1, dur: 1.9, bus: 'ui', max: 1, pri: 9, vol: 0.8,
    gen: (sr, r, v, D) => {
      // The base is about to fall: a three-pulse klaxon over a falling sub.
      const l = lp1(sr, 2200), th = swp(70, 32, 6);
      let s1 = 0, s2 = 0;
      return mk(sr, D, (t) => {
        const k = Math.floor(t / 0.5), tt = t - k * 0.5, on = k < 3 && tt < 0.38 ? Math.min(1, tt / 0.01) * (tt < 0.32 ? 1 : (0.38 - tt) / 0.06) : 0;
        s1 = (s1 + (k % 2 ? 392 : 523) / sr) % 1; s2 = (s2 + (k % 2 ? 392 : 523) * 1.5 / sr) % 1;
        return l((2 * s1 - 1) + 0.5 * (2 * s2 - 1)) * on * 0.8 + th(t) * ex(-t / 0.5) * 0.9 * (k === 0 ? 1 : 0.4);
      });
    } },

  // ---------- Addendum 5 and 6: the eight new mechs ----------
  // `ext` marks these for the listening export. `sustain` (seconds) makes a sound a held voice: each event extends it, so a 0.12 s flamethrower is one roar, not a click train.
  // `loop` is the cross-fade length (s) of a looping buffer; the generator is asked for dur + loop and the tail is folded into the head.
  fire_howitzer: { ext: true, n: 3, dur: 1.5, bus: 'gun', max: 2, pri: 7, vol: 0.85, duck: 0.35,
    gen: (sr, r, v, D) => {
      // All sub: a falling boom with a slow rumble and a low breech ring, no crack at all, so it cannot be mistaken for the shell.
      const sa = svf(sr), sb = svf(sr), se = svf(sr), mid = svf(sr); // two-pole, so the rumble falls away steeply above 100 Hz
      const th = swp(70 + v * 5, 18, 10), sub = swp(40, 15, 4), cl = ring(78 + v * 5, [1, 1.9, 3.1], [0.5, 0.3, 0.15], [1, 0.5, 0.25]);
      return mk(sr, D, (t) => {
        mid.run(r() * 2 - 1, 260 + v * 20, 1.2); sa.run(r() * 2 - 1, 95 + v * 8, 0.8); sb.run(r() * 2 - 1, 48, 0.8); se.run(r() * 2 - 1, 70, 0.8);
        const body = sa.lp * 14 * ex(-t / 0.18) * 1.6 + mid.nbp * ex(-t / 0.035) * 0.9; // a short low-mid knock so small speakers still hear it
        const thump = th(t) * ex(-t / 0.5) * 1.3 + sub(t) * ex(-t / 0.9) * 1.1;
        const clank = t > 0.08 ? cl(t - 0.08) * 0.6 : 0;
        const tail = sb.lp * 20 * ex(-t / 0.8) * 1.0 + (t > 0.35 ? se.lp * 17 * ex(-(t - 0.35) / 0.4) * 0.6 : 0);
        return body + thump + clank + tail;
      });
    } },
  fire_sabot: { ext: true, n: 3, dur: 0.55, bus: 'gun', max: 4, pri: 6, vol: 0.85, duck: 0.1,
    gen: (sr, r, v, D) => {
      // The N-wave of a supersonic round: two razor cracks a few ms apart, a thin ring and almost no body.
      const hp = lp1(sr, 5500), hp2 = lp1(sr, 3200), bp = svf(sr), air = nlp(sr, 3400 + v * 300);
      const th = swp(230, 80, 80), f = 4300 + v * 350;
      return mk(sr, D, (t) => {
        const x = r() * 2 - 1, y = r() * 2 - 1;
        bp.run(r() * 2 - 1, 6800 * ex(-t * 28) + 2600, 2.5);
        const c1 = (x - hp(x)) * ex(-t / 0.0011) * 1.7, c2 = t > 0.0034 ? (y - hp2(y)) * ex(-(t - 0.0034) / 0.0016) * 1.2 : 0;
        const rg = (Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * f * 1.93 * t)) * ex(-t / 0.075) * 0.32;
        return c1 + c2 + bp.nbp * ex(-t / 0.03) * 0.8 + rg + th(t) * ex(-t / 0.025) * 0.55 + air(r() * 2 - 1) * ex(-t / 0.14) * 0.3;
      });
    } },
  fire_slug: { ext: true, n: 3, dur: 0.45, bus: 'gun', max: 4, pri: 5, vol: 0.9, duck: 0.12,
    gen: (sr, r, v, D) => {
      // A thick thud-shot: the energy sits in the mids, a hollow tock at ~400 Hz with a short wooden knock on top.
      const hp = lp1(sr, 700), body = svf(sr), knock = nlp(sr, 1500);
      const f = 380 + v * 25;
      return mk(sr, D, (t) => {
        const x = r() * 2 - 1;
        body.run(r() * 2 - 1, 450, 1.4);
        return Math.tanh(1.5 * (body.nbp * ex(-t / 0.05) * 1.2 + Math.sin(TAU * f * t) * ex(-t / 0.06) * 0.9 + Math.sin(TAU * f * 0.5 * t) * ex(-t / 0.09) * 0.6 + knock(r() * 2 - 1) * ex(-t / 0.012) * 0.7 +
          (x - hp(x)) * ex(-t / 0.003) * 0.4));
      });
    } },
  fire_hook: { ext: true, n: 3, dur: 0.75, bus: 'gun', max: 3, pri: 5, vol: 0.85,
    gen: (sr, r, v, D) => {
      // A launch clank, then the chain paying out: a run of metal ticks that slows and thins.
      const cl = ring(500 + v * 40, [1, 2.7, 4.4, 6.1], [0.14, 0.1, 0.07, 0.05], [1, 0.6, 0.4, 0.25]), th = swp(210, 70, 40), hp = lp1(sr, 2500), bp = svf(sr);
      const links = [];
      let at = 0.05;
      for (let k = 0; k < 13; k++) { links.push({ t: at, f: rnd(r, 1700, 3300), a: 0.5 * ex(-k * 0.13) + 0.12 }); at += 0.032 + k * 0.004 + r() * 0.012; }
      return mk(sr, D, (t) => {
        const x = r() * 2 - 1;
        let s = 0;
        for (const q of links) if (t > q.t) { const tt = t - q.t; s += (Math.sin(TAU * q.f * tt) + 0.4 * Math.sin(TAU * q.f * 2.4 * tt)) * ex(-tt / 0.014) * q.a + (x - hp(x)) * ex(-tt / 0.002) * q.a * 0.6; }
        bp.run(r() * 2 - 1, 600 + 1500 * Math.min(1, t / 0.25), 1.2);
        return cl(t) * 0.7 + th(t) * ex(-t / 0.05) * 1.1 + s + bp.nbp * ad(t, 0.03, 0.12) * 0.35 + (x - hp(x)) * ex(-t / 0.003) * 0.6;
      });
    } },
  fire_wave: { ext: true, n: 3, dur: 0.32, bus: 'gun', max: 4, pri: 4, vol: 0.6,
    gen: (sr, r, v, D) => {
      // Phaser pulse: a fast falling chirp with FM shimmer.
      const nz = nlp(sr, 3500), f1 = 560 + v * 45;
      let p = 0, q = 0;
      return mk(sr, D, (t) => {
        const g = f1 + 2300 * ex(-t * 22);
        p += TAU * g / sr; q += TAU * g * 2.01 / sr;
        return (Math.sin(p + 1.7 * Math.sin(TAU * 86 * t)) * 0.8 + 0.3 * Math.sin(q)) * ad(t, 0.003, 0.085) + nz(r() * 2 - 1) * ex(-t / 0.012) * 0.3 + Math.sin(TAU * f1 * 0.5 * t) * ex(-t / 0.07) * 0.35;
      });
    } },
  fire_flame: { ext: true, n: 3, dur: 0.6, loop: 0.08, sustain: 0.22, bus: 'gun', max: 1, pri: 5, vol: 0.55,
    gen: (sr, r, v, D) => {
      const bp = svf(sr), hiss = svf(sr), lo = nlp(sr, 200), hp = lp1(sr, 3000);
      let pop = 0;
      return mk(sr, D, (t) => {
        const x = r() * 2 - 1;
        if (r() < 0.002) pop = 0.6 + r() * 0.4;
        pop *= ex(-1 / (sr * 0.003));
        const flut = 0.72 + 0.28 * Math.sin(TAU * (10 + v * 3) * t + 1.4 * Math.sin(TAU * 2.9 * t));
        bp.run(r() * 2 - 1, 1000 + 250 * Math.sin(TAU * 2.1 * t + v), 3);
        hiss.run(r() * 2 - 1, 4000, 0.8);
        return Math.tanh(1.3 * (bp.nbp * 1.0 * flut + hiss.nbp * 0.2 * flut + lo(r() * 2 - 1) * 0.1 + (x - hp(x)) * pop * 0.25));
      });
    } },
  fire_dart: { ext: true, n: 3, dur: 0.2, bus: 'gun', max: 6, pri: 3, vol: 1,
    gen: (sr, r, v, D) => {
      const hp = lp1(sr, 6500), bp = svf(sr), th = swp(300, 120, 100);
      let p = 0;
      return mk(sr, D, (t) => {
        const x = r() * 2 - 1;
        p += TAU * (3300 + v * 200 + 2600 * (1 - ex(-t * 90))) / sr;
        bp.run(r() * 2 - 1, 5200, 2);
        return (x - hp(x)) * ex(-t / 0.0014) * 1.2 + Math.sin(p) * ex(-t / 0.022) * 0.5 + bp.nbp * ex(-t / 0.01) * 0.45 + th(t) * ex(-t / 0.015) * 0.3;
      });
    } },
  fire_disc: { ext: true, n: 3, dur: 0.55, bus: 'gun', max: 4, pri: 5, vol: 0.8,
    gen: (sr, r, v, D) => {
      // A metal disc leaves the launcher: spin whirr that falls away, a shing and a short whoosh.
      const bp = svf(sr), hp = lp1(sr, 2500), th = swp(190, 80, 50), shing = ring(1450 + v * 110, [1, 2.32, 4.1, 6.4], [0.22, 0.15, 0.1, 0.06], [1, 0.6, 0.4, 0.25]);
      let p = 0;
      return mk(sr, D, (t) => {
        const x = r() * 2 - 1;
        p += TAU * (900 + 900 * ex(-t * 6)) / sr;
        bp.run(r() * 2 - 1, 500 + 3300 * (1 - ex(-t * 9)) * ex(-t * 1.5), 1.3);
        const spin = (Math.sin(p) + 0.4 * Math.sin(2.02 * p)) * (0.55 + 0.45 * Math.sin(TAU * 62 * t)) * ad(t, 0.012, 0.13);
        return spin * 0.55 + shing(t) * 0.55 + bp.nbp * ad(t, 0.02, 0.1) * 0.9 + th(t) * ex(-t / 0.03) * 0.6 + (x - hp(x)) * ex(-t / 0.003) * 0.6;
      });
    } },
  fire_lance: { ext: true, n: 3, dur: 1.1, bus: 'gun', max: 2, pri: 7, vol: 0.9, duck: 0.25,
    gen: (sr, r, v, D) => {
      // Charge-beam release: a shot of bright zap falling over a deep sub thump, then a long high burn with nothing in the middle.
      const hp = lp1(sr, 5000), hp2 = lp1(sr, 7000), th = swp(120, 34, 20);
      let p1 = 0;
      return mk(sr, D, (t) => {
        const x = r() * 2 - 1, y = r() * 2 - 1;
        p1 += TAU * (7500 * ex(-t * 10) + 520 + v * 30) / sr;
        return Math.sin(p1) * ex(-t / 0.3) * 0.6 + th(t) * ex(-t / 0.22) * 1.3 + (y - hp2(y)) * ad(t, 0.01, 0.45) * 0.9 + (x - hp(x)) * ex(-t / 0.005) * 0.9 + Math.sin(TAU * 62 * t) * ex(-t / 0.3) * 0.6;
      });
    } },
  charge_hum: { ext: true, n: 1, dur: 0.5, loop: 0, sustain: 0.14, bus: 'world', max: 1, pri: 5, vol: 0.4,
    // Whole cycles in 0.5 s so the loop is seamless; the engine bends the pitch up with the charge.
    gen: (sr, r, v, D) => mk(sr, D, (t) => {
      let s = 0;
      for (let k = 1; k <= 5; k++) s += Math.sin(TAU * 110 * k * t) / k;
      return s * 0.7 + Math.sin(TAU * 220 * t + 0.8) * 0.25 + Math.sin(TAU * 1400 * t) * (0.5 + 0.5 * Math.sin(TAU * 8 * t)) * 0.18;
    }) },

  ray_heal: { ext: true, n: 1, dur: 0.5, loop: 0, sustain: 0.38, bus: 'world', max: 1, pri: 4, vol: 0.32,
    gen: (sr, r, v, D) => mk(sr, D, (t) => (Math.sin(TAU * 660 * t) + 0.55 * Math.sin(TAU * 990 * t) + 0.2 * Math.sin(TAU * 1320 * t)) * (0.75 + 0.25 * Math.sin(TAU * 6 * t))) },
  ray_zap: { ext: true, n: 1, dur: 0.5, loop: 0.06, sustain: 0.38, bus: 'world', max: 1, pri: 4, vol: 0.4,
    gen: (sr, r, v, D) => {
      const hp = lp1(sr, 2500), step = Math.round(sr / 900);
      let gate = 1;
      return mk(sr, D, (t, i) => {
        if (i % step === 0) gate = r() > 0.35 ? 1 : 0;
        const x = r() * 2 - 1;
        return (x - hp(x)) * gate * 0.8 + Math.sin(TAU * 1900 * t + 3 * Math.sin(TAU * 97 * t)) * 0.25 * (0.6 + 0.4 * Math.sin(TAU * 13 * t)) + Math.sin(TAU * 100 * t) * 0.3;
      });
    } },
  ray_idle: { ext: true, n: 1, dur: 0.5, loop: 0.06, sustain: 0.38, bus: 'world', max: 1, pri: 3, vol: 0.3,
    gen: (sr, r, v, D) => {
      const bp = svf(sr);
      return mk(sr, D, (t) => { bp.run(r() * 2 - 1, 1500, 2); return bp.nbp * (0.7 + 0.3 * Math.sin(TAU * 4 * t)) * 0.6 + Math.sin(TAU * 440 * t) * 0.12; });
    } },
  beam_sweep: { ext: true, n: 1, dur: 0.5, loop: 0.08, sustain: 0.3, bus: 'world', max: 1, pri: 7, vol: 0.55,
    gen: (sr, r, v, D) => {
      // The Thiên Hỏa Tuyến pulses every 0.2 s: one furnace roar while it burns.
      const bp = svf(sr), hp = lp1(sr, 3500), lo = nlp(sr, 120);
      return mk(sr, D, (t) => {
        let s = 0;
        for (let k = 1; k <= 6; k++) s += Math.sin(TAU * 110 * k * t) / k;
        bp.run(r() * 2 - 1, 900 + 400 * Math.sin(TAU * 4 * t), 0.9);
        const x = r() * 2 - 1;
        return s * 0.5 * (0.8 + 0.2 * Math.sin(TAU * 12 * t)) + bp.nbp * 0.7 + (x - hp(x)) * 0.25 + lo(r() * 2 - 1) * 0.8;
      });
    } },

  imp_ping: { ext: true, n: 3, dur: 0.3, bus: 'world', max: 3, pri: 2, vol: 0.4, gap: 0.05,
    gen: (sr, r, v, D) => {
      const f0 = 2200 + v * 420 + r() * 80, hp = lp1(sr, 4000);
      const R = [1, 2.76, 5.4], T = [0.09, 0.05, 0.03];
      return mk(sr, D, (t) => { let s = 0; for (let k = 0; k < 3; k++) s += Math.sin(TAU * f0 * R[k] * t) * ex(-t / T[k]) * (1 - k * 0.3); const x = r() * 2 - 1; return s * 0.7 + (x - hp(x)) * ex(-t / 0.002) * 0.6; });
    } },
  imp_absorb: { ext: true, n: 2, dur: 0.4, bus: 'world', max: 3, pri: 3, vol: 0.45, gap: 0.04,
    gen: (sr, r, v, D) => {
      const bp = svf(sr), th = swp(165, 65, 40);
      let p = 0;
      return mk(sr, D, (t) => {
        p += TAU * (1900 * ex(-t * 7) + 340 + v * 40) / sr;
        bp.run(r() * 2 - 1, 1200, 1.5);
        return Math.sin(p) * ex(-t / 0.12) * (0.6 + 0.4 * Math.sin(TAU * 30 * t)) + bp.nbp * ex(-t / 0.05) * 0.5 + th(t) * ex(-t / 0.06) * 0.9;
      });
    } },
  imp_holo: { ext: true, n: 2, dur: 0.25, bus: 'world', max: 3, pri: 2, vol: 0.4, gap: 0.04,
    gen: (sr, r, v, D) => {
      const step = Math.round(sr / 3000);
      let held = 0, p = 0;
      return mk(sr, D, (t, i) => {
        if (i % step === 0) held = Math.round((r() * 2 - 1) * 4) / 4;
        p += TAU * (2400 * ex(-t * 14) + 300 + v * 60) / sr;
        return held * ex(-t / 0.03) * 0.9 + Math.round(Math.sin(p) * 4) / 4 * ex(-t / 0.07) * 0.5;
      });
    } },
  hook_clamp: { ext: true, n: 2, dur: 0.5, bus: 'world', max: 2, pri: 6, vol: 0.85,
    gen: (sr, r, v, D) => {
      // Two jaw halves close 22 ms apart, then the reel bites.
      const hp = lp1(sr, 2200), bp = svf(sr), th = swp(145, 48, 40), R = [1, 2.7, 4.4], T = [0.1, 0.07, 0.05];
      return mk(sr, D, (t) => {
        const x = r() * 2 - 1;
        let s = 0;
        for (const t0 of [0, 0.022]) if (t >= t0) { const tt = t - t0; for (let k = 0; k < 3; k++) s += Math.sin(TAU * (880 + v * 90) * R[k] * tt) * ex(-tt / T[k]) * (0.9 - k * 0.25); s += (x - hp(x)) * ex(-tt / 0.002) * 0.9; }
        bp.run(r() * 2 - 1, 2400, 1.5);
        return s * 0.6 + th(t) * ex(-t / 0.07) * 1.2 + (t > 0.05 ? bp.nbp * ex(-(t - 0.05) / 0.05) * 0.4 : 0);
      });
    } },
  sk_swap: { ext: true, n: 1, dur: 0.6, bus: 'world', max: 2, pri: 6, vol: 0.75,
    gen: (sr, r, v, D) => {
      // Two whooshes, one rising and one falling, as the mechs trade places.
      const bp = svf(sr), th = swp(130, 50, 40);
      return mk(sr, D, (t) => {
        const a = clamp(t / 0.28, 0, 1), b = clamp((t - 0.17) / 0.28, 0, 1);
        const e1 = t < 0.28 ? Math.pow(Math.sin(Math.PI * a), 2) : 0, e2 = t > 0.17 && t < 0.45 ? Math.pow(Math.sin(Math.PI * b), 2) : 0;
        bp.run(r() * 2 - 1, e2 > e1 ? 2800 - 2400 * b : 400 + 2400 * a, 1.4);
        return bp.nbp * (e1 + e2) * 1.1 + th(t) * ex(-t / 0.06) * 0.6 + (t > 0.17 ? th(t - 0.17) * ex(-(t - 0.17) / 0.06) * 0.5 : 0);
      });
    } },
  st_plant: { ext: true, n: 1, dur: 1.0, bus: 'world', max: 2, pri: 6, vol: 0.85, duck: 0.15,
    gen: (sr, r, v, D) => {
      // Hydraulic siege stance: an air hiss and a falling servo whine, then the legs hit the ground and lock.
      const bp = svf(sr), th = swp(112, 34, 18), c1 = ring(150, [1, 2.3, 3.7], [0.3, 0.2, 0.12]), c2 = ring(260, [1, 2.7, 4.1], [0.12, 0.08, 0.05]), hp = lp1(sr, 2000);
      let p = 0;
      return mk(sr, D, (t) => {
        const x = r() * 2 - 1;
        bp.run(r() * 2 - 1, 4200, 0.8);
        p += TAU * (900 - 650 * clamp(t / 0.2, 0, 1)) / sr;
        const hiss = bp.nbp * (t < 0.5 ? ad(t, 0.01, 0.22) : 0) * 0.6, whine = t < 0.2 ? Math.sin(p) * 0.35 * Math.min(1, t / 0.02) : 0;
        const land = t > 0.18 ? th(t - 0.18) * ex(-(t - 0.18) / 0.2) * 1.3 + c1(t - 0.18) * 0.5 + (x - hp(x)) * ex(-(t - 0.18) / 0.01) * 0.7 : 0;
        const lock = t > 0.36 ? c2(t - 0.36) * 0.6 + (x - hp(x)) * ex(-(t - 0.36) / 0.004) * 0.6 : 0;
        return hiss + whine + land + lock;
      });
    } },
  st_release: { ext: true, n: 1, dur: 0.7, bus: 'world', max: 2, pri: 5, vol: 0.7,
    gen: (sr, r, v, D) => {
      const bp = svf(sr), hp = lp1(sr, 2500), th = swp(95, 40, 25);
      let p = 0;
      return mk(sr, D, (t) => {
        const x = r() * 2 - 1;
        bp.run(r() * 2 - 1, 3000 + 1200 * clamp(t / 0.4, 0, 1), 0.9);
        p += TAU * (250 + 600 * clamp(t / 0.4, 0, 1)) / sr;
        let k = 0;
        for (const t0 of [0.05, 0.12]) if (t > t0) k += ((x - hp(x)) * 0.9 + Math.sin(TAU * 1500 * (t - t0)) * 0.5) * ex(-(t - t0) / 0.004);
        return bp.nbp * ad(t, 0.02, 0.2) * 0.5 + (t < 0.4 ? Math.sin(p) * 0.3 : 0) + k + (t > 0.42 ? th(t - 0.42) * ex(-(t - 0.42) / 0.1) * 0.8 : 0);
      });
    } },
  sk_bless_shield: { ext: true, n: 1, dur: 1.1, bus: 'world', max: 2, pri: 5, vol: 0.65,
    gen: (sr, r, v, D) => {
      const list = [1568, 2093, 2637, 3136, 4186].map((f, i) => ({ f, t: i * 0.07, d: 0.34, w: W.bell, g: 0.9 - i * 0.1 }));
      list.push({ f: 523.25, t: 0, d: 0.5, w: W.soft, a: 0.12, g: 0.4 }, { f: 783.99, t: 0.05, d: 0.5, w: W.soft, a: 0.12, g: 0.3 });
      return tones(sr, D, list);
    } },
  sk_bless_boost: { ext: true, n: 1, dur: 0.8, bus: 'world', max: 2, pri: 5, vol: 0.65,
    gen: (sr, r, v, D) => {
      const bp = svf(sr), list = [2349, 3136, 3951].map((f, i) => ({ f, t: 0.14 + i * 0.05, d: 0.22, w: W.bell, g: 0.8 }));
      let p = 0;
      return add(tones(sr, D, list), (t) => { p += TAU * (500 + 3500 * clamp(t / 0.22, 0, 1)) / sr; bp.run(r() * 2 - 1, 800 + 4000 * clamp(t / 0.22, 0, 1), 1.5); return t < 0.3 ? Math.sin(p) * Math.sin(Math.PI * clamp(t / 0.3, 0, 1)) * 0.4 + bp.nbp * Math.sin(Math.PI * clamp(t / 0.3, 0, 1)) * 0.3 : 0; });
    } },
  sk_rally: { ext: true, n: 1, dur: 1.8, bus: 'world', max: 2, pri: 6, vol: 0.75, duck: 0.15,
    gen: (sr, r, v, D) => {
      const list = [[220, 1], [277.18, 0.8], [329.63, 0.8], [440, 0.7], [554.37, 0.5]].map(([f, g], i) => ({ f, t: i * 0.03, d: 0.7, w: W.soft, a: 0.35, g }));
      list.push({ f: 110, t: 0, d: 0.8, w: W.sin, a: 0.3, g: 0.9 }, { f: 1760, t: 0.4, d: 0.6, w: W.bell, a: 0.05, g: 0.25 });
      return tones(sr, D, list);
    } },
  sk_leap: { ext: true, n: 1, dur: 0.6, bus: 'world', max: 2, pri: 6, vol: 0.8,
    gen: (sr, r, v, D) => {
      const bp = svf(sr), th = swp(145, 45, 40);
      let p = 0;
      return mk(sr, D, (t) => {
        bp.run(r() * 2 - 1, 250 + 2900 * Math.pow(clamp(t / 0.4, 0, 1), 1.5), 1.4);
        p += TAU * (170 + 430 * (1 - ex(-t * 10))) / sr;
        return th(t) * ex(-t / 0.07) * 1.1 + bp.nbp * Math.sin(Math.PI * clamp(t / 0.5, 0, 1)) * 0.9 + Math.sin(p) * ex(-t / 0.15) * 0.4;
      });
    } },
  sk_leap_land: { ext: true, n: 1, dur: 0.9, bus: 'world', max: 2, pri: 6, vol: 0.85, duck: 0.2,
    gen: (sr, r, v, D) => {
      const base = blast(sr, r, { fc0: 2200, fc1: 260, fk: 10, dec: 0.25, th0: 85, th1: 28, thk: 20, thd: 0.25, thA: 1.2, rum: 0.35, rumA: 0.6, debris: 5, dAt: 0.08, dSpan: 0.4 });
      const hp = lp1(sr, 3000);
      return mk(sr, D, (t) => {
        const x = r() * 2 - 1;
        let claw = 0;
        for (const t0 of [0.03, 0.06, 0.09]) if (t > t0) claw += ((x - hp(x)) + Math.sin(TAU * 1100 * (t - t0))) * ex(-(t - t0) / 0.005) * 0.3;
        return base(t) + claw;
      });
    } },
  sk_mark: { ext: true, n: 1, dur: 1.5, bus: 'world', max: 2, pri: 6, vol: 0.8,
    gen: (sr, r, v, D) => {
      // Death sentence: a tritone drone swells under two lock-on beeps and a heartbeat.
      const th = swp(80, 38, 18);
      const list = [{ f: 98, t: 0, d: 0.55, w: W.brass, a: 0.5, g: 0.7 }, { f: 138.6, t: 0, d: 0.55, w: W.brass, a: 0.5, g: 0.6 }, { f: 49, t: 0, d: 0.8, w: W.sin, a: 0.4, g: 0.8 }];
      let p = 0;
      return add(tones(sr, D, list), (t) => {
        let s = 0;
        for (const t0 of [0.45, 0.7]) if (t > t0) s += th(t - t0) * ex(-(t - t0) / 0.1) * 0.9;
        for (const [t0, f] of [[0.85, 1400], [1.0, 880]]) if (t > t0) { p = TAU * f * (t - t0); s += Math.sin(p) * ex(-(t - t0) / 0.06) * 0.5; }
        return s;
      });
    } },
  sk_warp: { ext: true, n: 1, dur: 0.4, bus: 'world', max: 3, pri: 5, vol: 0.7, gap: 0.05,
    gen: (sr, r, v, D) => {
      const th = swp(220, 60, 45), hp = lp1(sr, 3500);
      let p = 0;
      return mk(sr, D, (t) => {
        const x = r() * 2 - 1;
        p += TAU * (2600 * ex(-t * 40) + 260) / sr;
        return Math.sin(p) * ex(-t / 0.05) * 1.0 + (x - hp(x)) * ex(-t / 0.006) * 0.8 + th(t) * ex(-t / 0.05) * 0.8 + Math.sin(TAU * 3100 * t) * ex(-t / 0.15) * 0.2;
      });
    } },
  wire_zap: { ext: true, n: 3, dur: 0.5, bus: 'world', max: 3, pri: 5, vol: 0.75, gap: 0.04,
    gen: (sr, r, v, D) => {
      const hp = lp1(sr, 2500), step = Math.round(sr / 1100);
      let gate = 1, p = 0;
      return mk(sr, D, (t, i) => {
        if (i % step === 0) gate = r() > 0.45 ? 1 : 0;
        const x = r() * 2 - 1;
        p += TAU * (950 * ex(-t * 10) + 320 + v * 30) / sr;
        return (x - hp(x)) * ex(-t / 0.003) * 1.2 + (x - hp(x)) * gate * ex(-t / 0.1) * 0.6 + Math.sin(p + 4 * Math.sin(TAU * 131 * t)) * ex(-t / 0.15) * 0.6 + Math.sin(TAU * 100 * t) * ex(-t / 0.12) * 0.5;
      });
    } },
  hit_execute: { ext: true, n: 1, dur: 1.0, bus: 'world', max: 2, pri: 8, vol: 1, duck: 0.35,
    gen: (sr, r, v, D) => {
      const base = blast(sr, r, { fc0: 1800, fc1: 200, fk: 8, dec: 0.3, th0: 70, th1: 22, thk: 12, thd: 0.4, thA: 1.3, rum: 0.6, rumA: 0.9, debris: 6, dAt: 0.05, dSpan: 0.4 });
      const cr = ring(180, [1, 2.35, 3.71, 5.12], [0.5, 0.3, 0.2, 0.12], [1, 0.7, 0.5, 0.35]), hp = lp1(sr, 3000), bp = svf(sr);
      return mk(sr, D, (t) => {
        const x = r() * 2 - 1;
        bp.run(r() * 2 - 1, 3000 * ex(-t * 10) + 500, 1.2);
        return base(t) + cr(t) * 0.4 + (x - hp(x)) * ex(-t / 0.003) * 0.8 + bp.nbp * ex(-t / 0.12) * 0.6;
      });
    } },
  expl_decoy: { ext: true, n: 2, dur: 0.7, bus: 'world', max: 3, pri: 4, vol: 0.6,
    gen: (sr, r, v, D) => {
      // A hologram collapsing: bit-crushed static, a falling blip and a scatter of glassy pings.
      const th = swp(260, 70, 50), step = Math.round(sr / 4000), pings = [];
      for (let k = 0; k < 6; k++) pings.push({ t: r() * 0.12, f: rnd(r, 2500, 7000), d: rnd(r, 0.08, 0.2), a: rnd(r, 0.2, 0.4) });
      let held = 0, p = 0;
      return mk(sr, D, (t, i) => {
        if (i % step === 0) held = Math.round((r() * 2 - 1) * 4) / 4;
        p += TAU * (1800 * ex(-t * 10) + 200) / sr;
        let s = 0;
        for (const q of pings) if (t > q.t) s += Math.sin(TAU * q.f * (t - q.t)) * ex(-(t - q.t) / q.d) * q.a;
        return held * ex(-t / 0.09) * 0.8 + Math.sin(p) * ex(-t / 0.2) * 0.5 + th(t) * ex(-t / 0.04) * 0.8 + s;
      });
    } },
  decoy_spawn: { ext: true, n: 1, dur: 0.4, bus: 'world', max: 3, pri: 2, vol: 0.35, gap: 0.08,
    gen: (sr, r, v, D) => {
      const step = Math.round(sr * 0.012);
      let f = 600, p = 0;
      return mk(sr, D, (t, i) => {
        if (i % step === 0) f = 600 + 1800 * clamp(t / 0.2, 0, 1) * (0.9 + 0.2 * r());
        p += TAU * f / sr;
        return Math.round(Math.sin(p) * 6) / 6 * ad(t, 0.01, 0.1) * 0.8 + Math.sin(TAU * 3200 * t) * ex(-t / 0.1) * 0.2;
      });
    } },
  sk_decoy: { ext: true, n: 1, dur: 0.8, bus: 'world', max: 2, pri: 5, vol: 0.6,
    gen: (sr, r, v, D) => {
      const list = [880, 1318.5, 1760].map((f, i) => ({ f, t: 0.1 + i * 0.07, d: 0.25, w: W.fm, g: 0.7 }));
      const bp = svf(sr), th = swp(160, 60, 40);
      return add(tones(sr, D, list), (t) => { bp.run(r() * 2 - 1, 500 + 3500 * clamp(t / 0.25, 0, 1), 1.6); return bp.nbp * Math.sin(Math.PI * clamp(t / 0.35, 0, 1)) * 0.5 + th(t) * ex(-t / 0.05) * 0.5; });
    } },
  sk_mirage: { ext: true, n: 1, dur: 1.3, bus: 'world', max: 2, pri: 6, vol: 0.75,
    gen: (sr, r, v, D) => {
      const list = [];
      [[0, 659.25], [0.15, 880], [0.3, 1318.5]].forEach(([t, f]) => { list.push({ f, t, d: 0.5, w: W.fm, a: 0.05, g: 0.7 }, { f: f * 2.01, t: t + 0.04, d: 0.4, w: W.bell, g: 0.3 }); });
      const bp = svf(sr);
      return add(tones(sr, D, list), (t) => { bp.run(r() * 2 - 1, 600 + 4000 * clamp(t / 0.6, 0, 1), 1.4); return bp.nbp * Math.sin(Math.PI * clamp(t / 0.7, 0, 1)) * 0.5 + Math.sin(TAU * 110 * t) * ex(-t / 0.4) * 0.5; });
    } },
  sk_drone: { ext: true, n: 1, dur: 1.0, bus: 'world', max: 2, pri: 4, vol: 0.55,
    gen: (sr, r, v, D) => {
      const bp = svf(sr);
      let p = 0;
      return mk(sr, D, (t) => {
        p += TAU * (180 + 260 * (1 - ex(-t * 3))) / sr;
        bp.run(r() * 2 - 1, 2500, 1.5);
        return (Math.sin(p) + 0.5 * Math.sin(2 * p) + 0.25 * Math.sin(3 * p)) * (0.6 + 0.4 * Math.sin(TAU * 47 * t)) * ad(t, 0.25, 0.5) * 0.7 + bp.nbp * ad(t, 0.1, 0.3) * 0.3 + Math.sin(TAU * 2800 * t) * ex(-t / 0.08) * 0.3;
      });
    } },
  drone_down: { ext: true, n: 1, dur: 0.5, bus: 'world', max: 2, pri: 2, vol: 0.4,
    gen: (sr, r, v, D) => {
      let p = 0;
      return mk(sr, D, (t) => { p += TAU * (90 + 350 * ex(-t * 7)) / sr; return (Math.sin(p) + 0.4 * Math.sin(2 * p)) * (0.6 + 0.4 * Math.sin(TAU * 40 * t)) * ex(-t / 0.15); });
    } },
  sk_wire: { ext: true, n: 1, dur: 0.8, bus: 'world', max: 2, pri: 5, vol: 0.65,
    gen: (sr, r, v, D) => {
      const hp = lp1(sr, 2500);
      let p = 0;
      return mk(sr, D, (t) => {
        p += TAU * (150 + 80 * ex(-t * 8)) / sr;
        let s = 0;
        for (let k = 1; k <= 6; k++) s += Math.sin(p * k) / k;
        const x = r() * 2 - 1;
        let sp = 0;
        for (const t0 of [0.05, 0.12]) if (t > t0) sp += (x - hp(x)) * ex(-(t - t0) / 0.002) * 0.8;
        return s * ex(-t / 0.3) * 0.8 + sp + Math.sin(TAU * 120 * t) * ad(t, 0.2, 0.3) * 0.3;
      });
    } },
  wire_snap: { ext: true, n: 1, dur: 0.45, bus: 'world', max: 3, pri: 3, vol: 0.5,
    gen: (sr, r, v, D) => {
      const hp = lp1(sr, 3000);
      let p = 0;
      return mk(sr, D, (t) => {
        p += TAU * (600 * ex(-t * 12) + 200) / sr;
        const x = r() * 2 - 1;
        return (x - hp(x)) * ex(-t / 0.004) * 1.1 + Math.sin(TAU * 2400 * t) * ex(-t / 0.06) * 0.35 + Math.sin(p) * ex(-t / 0.15) * 0.6;
      });
    } },
  sk_cage: { ext: true, n: 1, dur: 1.2, bus: 'world', max: 2, pri: 6, vol: 0.85, duck: 0.15,
    gen: (sr, r, v, D) => {
      // Chains whip out and close faster and faster, then the ring slams shut.
      const hp = lp1(sr, 2200), cl = ring(210, [1, 2.35, 3.71, 5.12], [0.4, 0.28, 0.2, 0.12], [1, 0.7, 0.5, 0.35]), th = swp(115, 40, 25), links = [];
      let at = 0;
      for (let k = 0; k < 15; k++) { links.push({ t: at, f: rnd(r, 1500, 3000) }); at += 0.07 * Math.pow(0.9, k) + 0.012; }
      return mk(sr, D, (t) => {
        const x = r() * 2 - 1;
        let s = 0;
        for (const q of links) if (t > q.t) { const tt = t - q.t; s += (Math.sin(TAU * q.f * tt) + (x - hp(x))) * ex(-tt / 0.01) * 0.4; }
        const slam = t > 0.62 ? cl(t - 0.62) * 0.7 + th(t - 0.62) * ex(-(t - 0.62) / 0.12) * 1.2 + (x - hp(x)) * ex(-(t - 0.62) / 0.006) * 0.8 : 0;
        return s + slam;
      });
    } },
  sk_bastion: { ext: true, n: 1, dur: 1.4, bus: 'world', max: 2, pri: 7, vol: 0.8, duck: 0.2,
    gen: (sr, r, v, D) => {
      const gong = ring(140, [1, 1.59, 2.14, 2.65, 3.5], [0.9, 0.7, 0.5, 0.4, 0.3], [1, 0.8, 0.6, 0.5, 0.35]), th = swp(100, 36, 18);
      let p = 0;
      return mk(sr, D, (t) => {
        const u = clamp(t / 0.8, 0, 1);
        p += TAU * (80 + 320 * u * u) / sr;
        return gong(t) * 0.55 + th(t) * ex(-t / 0.15) * 1.0 + (Math.sin(p) + 0.4 * Math.sin(2 * p)) * u * u * ex(-Math.max(0, t - 0.8) / 0.2) * 0.45;
      });
    } },
  sk_screen: { ext: true, n: 1, dur: 0.9, bus: 'world', max: 2, pri: 5, vol: 0.6,
    gen: (sr, r, v, D) => {
      const bp = svf(sr);
      let p = 0;
      return mk(sr, D, (t) => {
        p += TAU * (300 + 1300 * (1 - ex(-t * 6))) / sr;
        bp.run(r() * 2 - 1, 3500, 3);
        const sh = (0.7 + 0.3 * Math.sin(TAU * 11 * t)) * ad(t, 0.15, 0.35);
        return Math.sin(p) * ad(t, 0.05, 0.25) * 0.5 + (Math.sin(TAU * 1400 * t) + 0.7 * Math.sin(TAU * 2100 * t) + 0.5 * Math.sin(TAU * 2800 * t)) * sh * 0.3 + bp.nbp * ad(t, 0.02, 0.1) * 0.3 + Math.sin(TAU * 220 * t) * ad(t, 0.1, 0.3) * 0.3;
      });
    } },
  sk_screen_off: { ext: true, n: 1, dur: 0.4, bus: 'world', max: 3, pri: 3, vol: 0.4,
    gen: (sr, r, v, D) => {
      let p = 0;
      return mk(sr, D, (t) => { p += TAU * (1600 * ex(-t * 8) + 300) / sr; return Math.sin(p) * ex(-t / 0.1) * 0.7 + Math.sin(TAU * 3300 * t) * ex(-t / 0.05) * 0.3; });
    } },
  sk_siege_call: { ext: true, n: 1, dur: 1.4, bus: 'world', max: 1, pri: 6, vol: 0.85, duck: 0.2,
    gen: (sr, r, v, D) => {
      // Fire order for the barrage: three tube thumps in a row, each with a whistle climbing away.
      const body = nlp(sr, 300), th = swp(92, 32, 18), bp = svf(sr);
      let p = 0;
      return mk(sr, D, (t) => {
        let s = 0, wh = 0;
        for (const t0 of [0, 0.24, 0.48]) if (t > t0) { const tt = t - t0; s += th(tt) * ex(-tt / 0.12) + body(r() * 2 - 1) * ex(-tt / 0.06) * 0.6; if (tt > 0.04 && tt < 0.7) wh += Math.sin(Math.PI * (tt - 0.04) / 0.66); }
        p += TAU * (700 + 1400 * clamp(t / 1.2, 0, 1)) / sr;
        bp.run(r() * 2 - 1, 1000 + 1500 * clamp(t / 1.2, 0, 1), 6);
        return Math.tanh(1.3 * (s + (Math.sin(p) * 0.15 + bp.nbp * 0.2) * Math.min(1, wh)));
      });
    } },
  sk_shell: { ext: true, n: 1, dur: 0.8, bus: 'world', max: 2, pri: 6, vol: 0.8,
    gen: (sr, r, v, D) => {
      const th = swp(100, 35, 16), cl = ring(210, [1, 2.3, 3.5, 5.2], [0.4, 0.3, 0.2, 0.12], [1, 0.7, 0.5, 0.3]), bp = svf(sr), hp = lp1(sr, 2800);
      return mk(sr, D, (t) => {
        const x = r() * 2 - 1;
        bp.run(r() * 2 - 1, 2500, 0.9);
        let k = 0;
        for (const t0 of [0.05, 0.12, 0.2]) if (t > t0) k += ((x - hp(x)) + Math.sin(TAU * 1700 * (t - t0))) * ex(-(t - t0) / 0.004) * 0.4;
        return th(t) * ex(-t / 0.2) * 1.1 + cl(t) * 0.4 + bp.nbp * ex(-t / 0.15) * 0.5 + k;
      });
    } },
  sk_rage: { ext: true, n: 1, dur: 1.0, bus: 'world', max: 2, pri: 6, vol: 0.8,
    gen: (sr, r, v, D) => {
      const f = svf(sr), nz = nlp(sr, 400), th = swp(85, 38, 20);
      let s1 = 0;
      return mk(sr, D, (t) => {
        const u = clamp(t / 0.9, 0, 1);
        s1 = (s1 + (60 + 40 * u) / sr) % 1;
        f.run((2 * s1 - 1) * (0.6 + 0.4 * Math.sign(Math.sin(TAU * 28 * t))), 300 + 900 * u, 1.5);
        let hb = 0;
        for (const t0 of [0, 0.19]) if (t > t0) hb += th(t - t0) * ex(-(t - t0) / 0.1);
        return Math.tanh(1.5 * (f.lp * ad(t, 0.05, 0.5) * 1.1 + nz(r() * 2 - 1) * ad(t, 0.1, 0.4) * 0.5 + hb));
      });
    } },
  sk_ricochet: { ext: true, n: 1, dur: 0.7, bus: 'world', max: 2, pri: 5, vol: 0.7,
    gen: (sr, r, v, D) => {
      const bp = svf(sr), hp = lp1(sr, 3000), shots = [];
      for (let k = 0; k < 5; k++) shots.push({ t: k * 0.055, f: rnd(r, 1800, 3000), w: 0.2 + k * 0.06 + r() * 0.04, g: rnd(r, 2300, 3600) });
      return mk(sr, D, (t) => {
        const x = r() * 2 - 1;
        bp.run(r() * 2 - 1, 3500, 2);
        let s = 0;
        for (const q of shots) {
          if (t > q.t) s += (Math.sin(TAU * q.f * (t - q.t)) * 0.4 + bp.nbp * 0.7) * ex(-(t - q.t) / 0.012) + (x - hp(x)) * ex(-(t - q.t) / 0.002) * 0.5;
          if (t > q.w) s += Math.sin(TAU * q.g * (t - q.w)) * ex(-(t - q.w) / 0.06) * 0.35;
        }
        return s;
      });
    } },
  sk_disc_storm: { ext: true, n: 1, dur: 1.2, bus: 'world', max: 2, pri: 6, vol: 0.8, duck: 0.15,
    gen: (sr, r, v, D) => {
      const bp = svf(sr), th = swp(150, 50, 30), pings = [];
      for (let k = 0; k < 14; k++) pings.push({ t: 0.1 + r() * 0.7, f: rnd(r, 1800, 4200), a: rnd(r, 0.15, 0.35) });
      let p = 0;
      return mk(sr, D, (t) => {
        const u = Math.sin(Math.PI * clamp(t / 1.0, 0, 1));
        p += TAU * (700 + 900 * u) / sr;
        bp.run(r() * 2 - 1, 500 + 3000 * u, 1.3);
        let s = 0;
        for (const q of pings) if (t > q.t) s += Math.sin(TAU * q.f * (t - q.t)) * ex(-(t - q.t) / 0.07) * q.a;
        return bp.nbp * u * 0.9 + Math.sin(p) * (0.55 + 0.45 * Math.sin(TAU * 90 * t)) * u * 0.4 + th(t) * ex(-t / 0.05) * 0.9 + s;
      });
    } },
  sk_overload: { ext: true, n: 1, dur: 0.9, bus: 'world', max: 2, pri: 6, vol: 0.8,
    gen: (sr, r, v, D) => {
      const hp = lp1(sr, 3000);
      let p = 0;
      return mk(sr, D, (t) => {
        const u = clamp(t / 0.65, 0, 1), x = r() * 2 - 1;
        p += TAU * (200 + 3000 * u * u) / sr;
        const ping = t > 0.68 ? (Math.sin(TAU * 3136 * (t - 0.68)) + Math.sin(TAU * 4186 * (t - 0.7)) * (t > 0.7 ? 1 : 0)) * ex(-(t - 0.68) / 0.1) * 0.6 : 0;
        return (Math.sin(p) + 0.4 * Math.sin(2 * p)) * (0.15 + 0.85 * u) * (t < 0.66 ? 1 : 0) + (x - hp(x)) * u * u * 0.3 + Math.sin(TAU * 60 * t) * (0.5 + 0.5 * Math.sin(TAU * 14 * t)) * u * 0.5 + ping;
      });
    } },
  sk_sweep_charge: { ext: true, n: 1, dur: 0.7, bus: 'world', max: 1, pri: 7, vol: 0.85, duck: 0.15,
    gen: (sr, r, v, D) => {
      // The furnace lights: two saws and a sub climb for the 0.5 s wind-up, then the roar takes over.
      const f = svf(sr), nz = nlp(sr, 700);
      let s1 = 0, s2 = 0, sb = 0;
      return mk(sr, D, (t) => {
        const u = clamp(t / 0.5, 0, 1);
        s1 = (s1 + (80 + 1100 * u * u) / sr) % 1; s2 = (s2 + (80 + 1100 * u * u) * 1.5 / sr) % 1; sb += TAU * (38 + 40 * u) / sr;
        f.run((2 * s1 - 1) + 0.6 * (2 * s2 - 1), 200 + 2800 * u * u, 1.6);
        return f.lp * (0.2 + 0.8 * u) * 0.8 + Math.sin(sb) * u * 0.7 + (t > 0.5 ? nz(r() * 2 - 1) * ex(-(t - 0.5) / 0.15) * 0.8 : 0);
      });
    } },
};

function* soundSteps(name, variant, sr) {
  const S = SOUNDS[name];
  const R = S.gen(sr, mulberry(fnv(name) + variant * 7919), variant, S.dur + (S.loop || 0));
  let out = new Float32Array(R.n);
  yield* fill(R, sr, out);
  if (S.loop === undefined) return (yield* finish([out], sr))[0];
  // Looping sound: the last `loop` seconds are folded into the first, so the buffer's end flows into its start.
  const X = Math.round(sr * S.loop), n = out.length - X;
  if (X > 0) {
    const res = out.slice(0, n);
    for (let j = 0; j < X; j++) { const w = (j / X) * Math.PI / 2; res[j] = out[j] * Math.sin(w) + out[n + j] * Math.cos(w); }
    out = res;
  }
  return (yield* finish([out], sr, 0, true))[0];
}
export function renderSound(name, variant, sr) {
  const it = soundSteps(name, variant, sr);
  for (;;) { const s = it.next(); if (s.done) return s.value; }
}

// ---------- Music ----------
// Stems loop exactly: every note is written with wrap-around, so tails from the end of bar 8 land on bar 1.
export const MUSIC_SR = 24000;
const loopLen = (bpm, sr) => Math.round(32 * 60 / bpm * sr);

function* voice(out, N, s0, len, sr, fn) {
  for (let i = 0; i < len; i++) {
    out[(s0 + i) % N] += fn(i / sr, i);
    if ((i & 2047) === 2047) yield;
  }
}

export const KEY_ROOTS = [33, 29, 36, 31, 33, 29, 31, 28];
const QUAL = [3, 4, 4, 4, 3, 4, 4, 4];
const chordOf = (bar, roots, qual) => { const b = roots[bar] + 24; return [b, b + qual[bar], b + 7]; };
const MENU_ROOTS = [33, 29, 36, 31, 33, 29, 38, 28];
const MENU_QUAL = [3, 4, 4, 4, 3, 4, 3, 4];

function* kickHit(out, N, s0, sr, vel, r) {
  let ph = 0;
  yield* voice(out, N, s0, Math.round(0.4 * sr), sr, (t) => {
    ph += TAU * (46 + 120 * ex(-t * 30)) / sr;
    return (Math.sin(ph) * ex(-t / 0.13) + (r() * 2 - 1) * ex(-t / 0.002) * 0.25) * vel;
  });
}
function* snareHit(out, N, s0, sr, vel, r) {
  const bp = svf(sr);
  yield* voice(out, N, s0, Math.round(0.3 * sr), sr, (t) => {
    bp.run(r() * 2 - 1, 1900, 0.7);
    return (Math.sin(TAU * 185 * t) * ex(-t / 0.06) * 0.5 + bp.nbp * ex(-t / 0.09) * 0.9) * vel;
  });
}
function* hatHit(out, N, s0, sr, vel, r, open) {
  const l = lp1(sr, 6000);
  yield* voice(out, N, s0, Math.round((open ? 0.3 : 0.08) * sr), sr, (t) => {
    const x = r() * 2 - 1;
    return (x - l(x)) * ex(-t / (open ? 0.1 : 0.018)) * vel * 0.5;
  });
}

function* drumStem(sr, r) {
  const N = loopLen(104, sr), S = 60 / 104 / 4 * sr, out = new Float32Array(N);
  for (let bar = 0; bar < 8; bar++) {
    const kicks = bar % 2 ? [0, 3, 6, 10, 14] : [0, 6, 10];
    for (let st = 0; st < 16; st++) {
      const s0 = Math.round((bar * 16 + st) * S);
      if (kicks.includes(st)) yield* kickHit(out, N, s0, sr, st === 0 ? 1 : 0.8, r);
      if ((bar === 3 || bar === 7) && st >= 12 && st % 2 === 1) yield* tomHit(out, N, s0, sr, 0.7, st < 14 ? 140 : 110);
      if (st === 4 || st === 12) yield* snareHit(out, N, s0, sr, 0.9, r);
      else if (bar === 7 && st > 12) yield* snareHit(out, N, s0, sr, 0.4 + (st - 12) * 0.15, r);
      else if (bar === 3 && st === 15) yield* snareHit(out, N, s0, sr, 0.25, r);
      if (st % 2 === 0) yield* hatHit(out, N, s0, sr, st % 4 === 2 ? 0.7 : 0.5, r, bar % 2 === 1 && st === 14);
      else if (bar >= 4) yield* hatHit(out, N, s0, sr, 0.25, r, false);
      yield;
    }
  }
  return yield* finish([out], sr);
}

function* bassStem(sr, r) {
  const N = loopLen(104, sr), S = 60 / 104 / 4 * sr, out = new Float32Array(N);
  const pat = [[0, 3], [3, 3], [6, 2], [8, 3], [11, 3], [14, 2]];
  for (let bar = 0; bar < 8; bar++) {
    for (const [st, len] of pat) {
      const midi = KEY_ROOTS[bar] + (st === 11 && bar % 2 ? 12 : 0), f = mtof(midi), L = Math.round(len * S), s = svf(sr);
      let ph = 0;
      yield* voice(out, N, Math.round((bar * 16 + st) * S), L + Math.round(0.12 * sr), sr, (t) => {
        ph = (ph + f / sr) % 1;
        s.run(2 * ph - 1, 180 + 1100 * ex(-t / 0.1), 1.5);
        const g = Math.min(1, t / 0.004) * (t < L / sr ? 1 : ex(-(t - L / sr) / 0.05)) * (0.6 + 0.4 * ex(-t / 0.15));
        return (s.lp * 0.8 + Math.sin(TAU * f * t) * 0.7) * g;
      });
    }
  }
  return yield* finish([out], sr);
}

function* padStem(sr, r, o = {}) {
  const bpm = o.bpm || 104, N = loopLen(bpm, sr), bar = N / 8, roots = o.roots || KEY_ROOTS, qual = o.qual || QUAL;
  const att = o.att || 0.35, cut = o.cut || 1100, L = [new Float32Array(N), new Float32Array(N)];
  for (let b = 0; b < 8; b++) {
    const chord = chordOf(b, roots, qual);
    for (let ch = 0; ch < 2; ch++) {
      for (const n of chord) {
        const f = mtof(n), s = svf(sr), d1 = ch ? 0.996 : 1.004, d2 = ch ? 1.003 : 0.997;
        let a = 0, c = 0;
        const body = Math.round(bar), len = body + Math.round(0.7 * sr);
        yield* voice(L[ch], N, Math.round(b * bar), len, sr, (t, i) => {
          a = (a + f * d1 / sr) % 1; c = (c + f * d2 / sr) % 1;
          s.run((2 * a - 1) + (2 * c - 1), cut, 0.8);
          const g = i < body ? Math.min(1, t / att) : Math.min(1, t / att) * ex(-(i - body) / sr / 0.4);
          return s.lp * g * 0.4;
        });
      }
    }
  }
  return yield* finish(L, sr);
}

function* pluck(out, N, s0, sr, f, amp, len) {
  const s = svf(sr);
  let ph = 0;
  yield* voice(out, N, s0, len, sr, (t) => {
    ph = (ph + f / sr) % 1;
    s.run((2 * ph - 1) * 0.6 + (ph < 0.5 ? 0.4 : -0.4), 500 + 3000 * ex(-t / 0.08), 1.2);
    return s.lp * ex(-t / 0.18) * Math.min(1, t / 0.002) * amp;
  });
}

function* arpStem(sr, r) {
  const N = loopLen(104, sr), S = 60 / 104 / 4 * sr, out = new Float32Array(N);
  const seq = [0, 1, 2, 3, 2, 1, 2, 1];
  for (let bar = 0; bar < 8; bar++) {
    const ch = chordOf(bar, KEY_ROOTS, QUAL).map((n) => n + 12);
    const tones4 = [ch[0], ch[1], ch[2], ch[0] + 12];
    const dense = bar === 3 || bar === 7, stepLen = dense ? 1 : 2;
    for (let k = 0; k * stepLen < 16; k++) {
      const st = k * stepLen, f = mtof(tones4[seq[k % 8]]), s0 = Math.round((bar * 16 + st) * S), L = Math.round(0.4 * sr);
      const vel = st % 4 === 0 ? 1 : 0.7;
      yield* pluck(out, N, s0, sr, f, vel, L);
      yield* pluck(out, N, s0 + Math.round(3 * S), sr, f, vel * 0.3, L);
      yield* pluck(out, N, s0 + Math.round(6 * S), sr, f, vel * 0.12, L);
    }
  }
  return yield* finish([out], sr);
}

function* menuArpStem(sr, r) {
  const bpm = 80, N = loopLen(bpm, sr), S = 60 / bpm / 4 * sr, out = new Float32Array(N);
  for (let bar = 0; bar < 8; bar++) {
    const ch = chordOf(bar, MENU_ROOTS, MENU_QUAL).map((n) => n + 24);
    for (const st of [0, 3, 6, 10]) {
      const f = mtof(r() < 0.2 ? ch[0] + 14 : ch[Math.floor(r() * 3)]), s0 = Math.round((bar * 16 + st) * S);
      for (const [dly, g] of [[0, 1], [6, 0.3], [12, 0.12]]) {
        yield* voice(out, N, s0 + Math.round(dly * S), Math.round(2.2 * sr), sr, (t) =>
          (Math.sin(TAU * f * t) * ex(-t / 0.9) + 0.25 * Math.sin(TAU * f * 2.76 * t) * ex(-t / 0.25)) * Math.min(1, t / 0.003) * g);
      }
      yield;
    }
  }
  return yield* finish([out], sr);
}

function* menuBassStem(sr, r) {
  const bpm = 80, N = loopLen(bpm, sr), bar = N / 8, out = new Float32Array(N);
  for (let b = 0; b < 8; b++) {
    const f = mtof(MENU_ROOTS[b] + 12), body = Math.round(bar);
    yield* voice(out, N, Math.round(b * bar), body + Math.round(0.8 * sr), sr, (t, i) =>
      (Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * f * 2 * t)) * Math.min(1, t / 0.3) * (i < body ? 1 : ex(-(i - body) / sr / 0.35)));
  }
  return yield* finish([out], sr);
}

function* tomHit(out, N, s0, sr, vel, f) {
  const th = swp(f * 1.6, f, 18);
  yield* voice(out, N, s0, Math.round(0.35 * sr), sr, (t) => th(t) * ex(-t / 0.12) * vel);
}

// Lead motif in A minor over Am F C G | Am F G E: a [step, midi, length] list per bar. Bar 1-2 state the idea, 3-4 answer, 5-6 lift it, 7-8 climb into the loop.
export const MOTIF = [
  [[0, 76, 3], [3, 74, 1], [4, 72, 4], [8, 69, 2], [10, 72, 2], [12, 76, 4]],
  [[0, 77, 3], [3, 76, 1], [4, 72, 4], [8, 69, 4], [12, 72, 2], [14, 74, 2]],
  [[0, 76, 3], [3, 79, 1], [4, 76, 4], [8, 72, 2], [10, 74, 2], [12, 76, 4]],
  [[0, 74, 3], [3, 71, 1], [4, 67, 4], [8, 71, 2], [10, 74, 2], [12, 79, 4]],
  [[0, 76, 3], [3, 74, 1], [4, 72, 4], [8, 69, 2], [10, 72, 2], [12, 81, 4]],
  [[0, 81, 3], [3, 79, 1], [4, 77, 4], [8, 72, 4], [12, 77, 2], [14, 76, 2]],
  [[0, 74, 2], [2, 76, 2], [4, 79, 4], [8, 83, 4], [12, 81, 2], [14, 79, 2]],
  [[0, 80, 4], [4, 76, 2], [6, 80, 2], [8, 83, 6], [14, 80, 2]],
];
function* motifNote(out, N, s0, sr, f, L, amp, cut) {
  const s = svf(sr), tot = L + Math.round(0.12 * sr);
  let a = 0, b = 0;
  yield* voice(out, N, s0, tot, sr, (t) => {
    const fv = f * (1 + 0.006 * Math.sin(TAU * 5.5 * t) * Math.min(1, t / 0.25));
    a = (a + fv * 1.004 / sr) % 1; b = (b + fv * 0.997 / sr) % 1;
    s.run((2 * a - 1) * 0.6 + (2 * b - 1) * 0.6 + (a < 0.5 ? 0.3 : -0.3), cut + 2200 * ex(-t / 0.12), 1);
    const g = Math.min(1, t / 0.008) * (t < L / sr ? 1 : ex(-(t - L / sr) / 0.05));
    return s.lp * g * amp;
  });
}
function* leadMotifStem(sr, r) {
  const N = loopLen(104, sr), S = 60 / 104 / 4 * sr, out = new Float32Array(N);
  for (let bar = 0; bar < 8; bar++) {
    for (const [st, midi, len] of MOTIF[bar]) {
      const f = mtof(midi), s0 = Math.round((bar * 16 + st) * S), L = Math.round(len * S * 0.92);
      yield* motifNote(out, N, s0, sr, f, L, 0.7, 1400);
      if (len >= 2) {
        yield* motifNote(out, N, s0 + Math.round(3 * S), sr, f, Math.round(S), 0.18, 900);
        yield* motifNote(out, N, s0 + Math.round(6 * S), sr, f, Math.round(S), 0.07, 700);
      }
    }
  }
  return yield* finish([out], sr);
}

// Tension: a driving sixteenth-note ostinato on the bar's root, a minor-second stab on 2 and 4, a clock tick, and a noise riser into every fourth bar.
function* tensionStem(sr, r) {
  const N = loopLen(104, sr), S = 60 / 104 / 4 * sr, out = new Float32Array(N);
  for (let bar = 0; bar < 8; bar++) {
    const root = KEY_ROOTS[bar] + 12;
    for (let st = 0; st < 16; st++) {
      const s0 = Math.round((bar * 16 + st) * S), f = mtof(root + (st === 7 || st === 15 ? 12 : st === 11 ? 7 : 0)), accent = st % 4 === 0 ? 1 : 0.55;
      const s = svf(sr);
      let ph = 0;
      yield* voice(out, N, s0, Math.round(0.11 * sr), sr, (t) => {
        ph = (ph + f / sr) % 1;
        s.run(2 * ph - 1, 350 + 2400 * accent * ex(-t / 0.035), 2);
        return s.lp * ex(-t / 0.05) * Math.min(1, t / 0.002) * accent;
      });
      if (st === 4 || st === 12) {
        for (const iv of [24, 25, 30]) {
          const fs = mtof(root + iv), sb = svf(sr);
          let q = 0;
          yield* voice(out, N, s0, Math.round(0.22 * sr), sr, (t) => {
            q = (q + fs / sr) % 1;
            sb.run(2 * q - 1, 1500 + 2500 * ex(-t / 0.05), 1.2);
            return sb.lp * ex(-t / 0.09) * 0.35;
          });
        }
      }
      if (st % 2 === 0) yield* hatHit(out, N, s0, sr, st % 4 === 0 ? 0.9 : 0.55, r, false);
      yield;
    }
    if (bar % 4 === 3) {
      const rs0 = Math.round((bar * 16 + 8) * S), rl = Math.round(8 * S), bp = svf(sr);
      yield* voice(out, N, rs0, rl, sr, (t, i) => { bp.run(r() * 2 - 1, 500 + 6000 * (i / rl) ** 2, 1.4); return bp.nbp * (i / rl) ** 2 * 0.8; });
    }
  }
  return yield* finish([out], sr);
}

// Menu: a slow answer to the match motif on bell pluck, and a soft pulse underneath.
export const MENU_MOTIF = [
  [[0, 81, 8], [8, 79, 4], [12, 76, 4]], [[0, 77, 8], [8, 76, 4], [12, 72, 4]], [[0, 76, 8], [8, 79, 8]], [[0, 74, 8], [8, 71, 8]],
  [[0, 81, 6], [6, 83, 2], [8, 84, 8]], [[0, 81, 8], [8, 77, 4], [12, 76, 4]], [[0, 74, 8], [8, 77, 8]], [[0, 76, 4], [4, 80, 4], [8, 83, 8]],
];
function* menuLeadStem(sr, r) {
  const bpm = 80, N = loopLen(bpm, sr), S = 60 / bpm / 4 * sr, out = new Float32Array(N);
  for (let bar = 0; bar < 8; bar++) {
    for (const [st, midi] of MENU_MOTIF[bar]) {
      const f = mtof(midi), s0 = Math.round((bar * 16 + st) * S);
      for (const [dly, g] of [[0, 1], [6, 0.28], [12, 0.1]]) {
        yield* voice(out, N, s0 + Math.round(dly * S), Math.round(1.6 * sr), sr, (t) =>
          (Math.sin(TAU * f * t) * ex(-t / 0.7) + 0.35 * Math.sin(TAU * f * 2.76 * t) * ex(-t / 0.18) + 0.15 * Math.sin(TAU * f * 5.4 * t) * ex(-t / 0.08)) * Math.min(1, t / 0.004) * g * 0.8);
      }
      yield;
    }
  }
  return yield* finish([out], sr);
}
function* menuPercStem(sr, r) {
  const bpm = 80, N = loopLen(bpm, sr), S = 60 / bpm / 4 * sr, out = new Float32Array(N);
  for (let bar = 0; bar < 8; bar++) {
    for (let st = 0; st < 16; st++) {
      const s0 = Math.round((bar * 16 + st) * S);
      if (st === 0 || (st === 8 && bar % 2)) yield* kickHit(out, N, s0, sr, 0.6, r);
      if (st % 2 === 0) yield* hatHit(out, N, s0, sr, st % 4 === 2 ? 0.55 : 0.3, r, false);
      if (st === 12 && bar % 2) {
        const bp = svf(sr);
        yield* voice(out, N, s0, Math.round(0.12 * sr), sr, (t) => { bp.run(r() * 2 - 1, 1900, 3); return bp.nbp * ex(-t / 0.025) * 0.5; });
      }
      yield;
    }
  }
  return yield* finish([out], sr);
}

export const STEMS = {
  m_drums: { scene: 'match', bpm: 104, ch: 1, vol: 0.85, lvl: (i, t) => Math.max(clamp((i - 0.12) / 0.4, 0, 1), t * 0.9), gen: drumStem },
  m_bass: { scene: 'match', bpm: 104, ch: 1, vol: 0.75, lvl: (i) => 0.35 + 0.65 * clamp(i / 0.4, 0, 1), gen: bassStem },
  m_pad: { scene: 'match', bpm: 104, ch: 2, vol: 0.5, lvl: (i, t) => 1 - 0.4 * t, gen: (sr, r) => padStem(sr, r) },
  m_arp: { scene: 'match', bpm: 104, ch: 1, vol: 0.35, lvl: (i, t) => clamp((i - 0.3) / 0.3, 0, 1) * (1 - 0.6 * t), gen: arpStem },
  m_lead: { scene: 'match', bpm: 104, ch: 1, vol: 0.45, lvl: (i, t) => Math.max(clamp((i - 0.55) / 0.3, 0, 1), t * 0.6), gen: leadMotifStem },
  m_tension: { scene: 'match', bpm: 104, ch: 1, vol: 0.6, lvl: (i, t) => clamp((t - 0.05) / 0.4, 0, 1), gen: tensionStem },
  u_pad: { scene: 'menu', bpm: 80, ch: 2, vol: 0.55, lvl: () => 1, gen: (sr, r) => padStem(sr, r, { bpm: 80, roots: MENU_ROOTS, qual: MENU_QUAL, att: 0.9, cut: 700 }) },
  u_arp: { scene: 'menu', bpm: 80, ch: 1, vol: 0.4, lvl: () => 1, gen: menuArpStem },
  u_bass: { scene: 'menu', bpm: 80, ch: 1, vol: 0.5, lvl: () => 1, gen: menuBassStem },
  u_lead: { scene: 'menu', bpm: 80, ch: 1, vol: 0.4, lvl: () => 1, gen: menuLeadStem },
  u_perc: { scene: 'menu', bpm: 80, ch: 1, vol: 0.45, lvl: () => 1, gen: menuPercStem },
};

export function stemInfo(name, sr) { return { length: loopLen(STEMS[name].bpm, sr) }; }

export function renderStem(name, sr) {
  const it = STEMS[name].gen(sr, mulberry(fnv(name)));
  for (;;) { const s = it.next(); if (s.done) return { chans: s.value, sr }; }
}

// ---------- Ambience beds ----------
// One 16 s stereo loop per theme. Steady layers are generated a second past the end and crossfaded into the start, so the seam is invisible;
// every modulation runs on `T` (time inside the loop) with whole-cycle rates, and sparse calls wrap around the end.
export const BED_SR = 24000;
const BED_LEN = 16;
const FOLD = 1;
const TWO_PI_OVER = (k) => TAU * k / BED_LEN;

// fn(T, i) -> sample. Fills `out` (adds) with a seamless loop.
function* layer(out, sr, gain, fn) {
  const N = out.length, F = Math.round(FOLD * sr), tmp = new Float32Array(N + F);
  for (let i = 0; i < N + F; i++) {
    tmp[i] = fn((i % N) / sr);
    if ((i & 2047) === 2047) yield;
  }
  for (let i = 0; i < N; i++) {
    if (i < F) { const a = Math.PI / 2 * i / F; out[i] += gain * (tmp[i] * Math.sin(a) + tmp[N + i] * Math.cos(a)); } else out[i] += gain * tmp[i];
    if ((i & 32767) === 32767) yield;
  }
}
// A call at time t0 (wraps past the loop end), panned -1..1.
function* call(chans, sr, t0, len, pan, gain, fn) {
  const N = chans[0].length, s0 = Math.round(t0 * sr) % N, ang = (pan + 1) * Math.PI / 4, gl = Math.cos(ang) * gain, gr = Math.sin(ang) * gain;
  for (let i = 0; i < len; i++) {
    const x = fn(i / sr, i), j = (s0 + i) % N;
    chans[0][j] += x * gl; chans[1][j] += x * gr;
    if ((i & 2047) === 2047) yield;
  }
}
// RMS-normalise (the bed is mostly noise, so peak normalising would bury it) and soft-limit.
function* finishBed(chans, target) {
  let sq = 0, n = 0;
  for (const a of chans) {
    let m = 0;
    for (let i = 0; i < a.length; i++) m += a[i];
    m /= a.length;
    for (let i = 0; i < a.length; i++) { a[i] -= m; sq += a[i] * a[i]; n++; if ((i & 32767) === 32767) yield; }
  }
  const k = target / Math.sqrt(sq / n);
  for (const a of chans) for (let i = 0; i < a.length; i++) { a[i] = Math.tanh(a[i] * k * 0.9) / 0.9; if ((i & 32767) === 32767) yield; }
  return chans;
}
const gust = (T, k, ph) => { const s = 0.5 + 0.5 * Math.sin(TWO_PI_OVER(k) * T + ph); return 0.25 + 0.75 * s * s; };
const rb = (r, a, b) => a + (b - a) * r();

// Bird-like glide: pitch goes from f0 to f1 with a little vibrato; shape is a soft pluck.
const chirp = (f0, f1, dur, vib) => { let p = 0; return (t) => { const u = clamp(t / dur, 0, 1); p += TAU * (f0 + (f1 - f0) * u + vib * Math.sin(TAU * 38 * t)) / BED_SR; return Math.sin(p) * Math.sin(Math.PI * u) ** 0.7; }; };

export const BEDS = {
  jungle: { vol: 0.9, gen: function* (sr, r) {
    // Warm rain on broad leaves, cicadas, and birds calling across the canopy.
    const C = [new Float32Array(sr * BED_LEN), new Float32Array(sr * BED_LEN)];
    for (let c = 0; c < 2; c++) {
      const rain = nlp(sr, 5200), hp = lp1(sr, 2600), low = nlp(sr, 420);
      yield* layer(C[c], sr, 0.32, (T) => { const x = r() * 2 - 1; const h = x - hp(x); return rain(x) * 0.45 * (0.8 + 0.2 * Math.sin(TWO_PI_OVER(2) * T)) + h * h * h * 2.2 + low(r() * 2 - 1) * 0.25; });
      yield* layer(C[c], sr, 0.22, (T) => {
        const sw = gust(T, 1 + c, c * 2), am = 0.5 + 0.5 * Math.sin(TAU * (62 + c * 4) * T);
        return Math.sin(TAU * (5600 + c * 260) * T) * am * sw + Math.sin(TAU * (4300 + c * 90) * T) * (0.5 + 0.5 * Math.sin(TAU * 46 * T)) * gust(T, 3, c) * 0.5;
      });
    }
    for (let k = 0; k < 13; k++) {
      const t0 = rb(r, 0, BED_LEN), kind = k % 3, pan = rb(r, -0.9, 0.9), base = rb(r, 0.8, 1.3);
      const notes = kind === 0 ? 3 : kind === 1 ? 2 : 8;
      for (let n = 0; n < notes; n++) {
        const f = kind === 0 ? chirp(2200 * base, 3400 * base, 0.11, 60) : kind === 1 ? chirp(1700 * base, 950 * base, 0.28, 30) : chirp(4300 * base, 4500 * base, 0.035, 0);
        yield* call(C, sr, t0 + n * (kind === 2 ? 0.055 : 0.2), Math.round(sr * (kind === 1 ? 0.3 : 0.16)), pan, kind === 1 ? 0.6 : 0.45, (t) => f(t));
      }
    }
    for (let k = 0; k < 26; k++) {
      const f = rb(r, 900, 1500), t0 = rb(r, 0, BED_LEN);
      yield* call(C, sr, t0, Math.round(sr * 0.06), rb(r, -1, 1), 0.07, (t) => Math.sin(TAU * f * (1 + 0.6 * t / 0.06) * t) * ex(-t / 0.012));
    }
    return yield* finishBed(C, 0.16);
  } },
  desert: { vol: 0.95, gen: function* (sr, r) {
    // A steady dry wind with long gusts, sand hiss riding the gusts, a thin whistle and heat hum.
    const C = [new Float32Array(sr * BED_LEN), new Float32Array(sr * BED_LEN)];
    for (let c = 0; c < 2; c++) {
      const w = svf(sr), hiss = svf(sr), wh = svf(sr);
      yield* layer(C[c], sr, 1, (T) => {
        const g = gust(T, 2, c * 0.8), x = r() * 2 - 1;
        w.run(x, 320 + 260 * g + 90 * Math.sin(TWO_PI_OVER(3) * T), 0.9);
        hiss.run(r() * 2 - 1, 3400 + 900 * g, 0.7);
        return w.nbp * (0.35 + 0.65 * g) * 0.9 + hiss.nbp * g * g * 0.28 + Math.sin(TAU * (820 + 70 * Math.sin(TWO_PI_OVER(5) * T)) * T) * g * g * g * 0.05 + Math.sin(TAU * 47 * T) * 0.1;
      });
      yield* layer(C[c], sr, 0.5, (T) => { wh.run(r() * 2 - 1, 1500 + 700 * gust(T, 1, c), 14); return wh.nbp * 0.5 * gust(T, 1, c + 1) ** 2; });
    }
    for (let k = 0; k < 5; k++) {
      const t0 = rb(r, 0, BED_LEN), f = rb(r, 400, 520);
      yield* call(C, sr, t0, Math.round(sr * 0.9), rb(r, -0.8, 0.8), 0.07, (t) => Math.sin(TAU * f * t * (1 + 0.2 * Math.sin(t * 4))) * Math.sin(Math.PI * t / 0.9));
    }
    return yield* finishBed(C, 0.14);
  } },
  ice: { vol: 0.95, gen: function* (sr, r) {
    // Thin high wind over frozen ground, deep ice groans and sharp cracks.
    const C = [new Float32Array(sr * BED_LEN), new Float32Array(sr * BED_LEN)];
    for (let c = 0; c < 2; c++) {
      const w = svf(sr), h = svf(sr), lo = nlp(sr, 150);
      yield* layer(C[c], sr, 1, (T) => {
        const g = gust(T, 3, c * 1.7);
        w.run(r() * 2 - 1, 950 + 450 * g + 200 * Math.sin(TWO_PI_OVER(4) * T), 3.2);
        h.run(r() * 2 - 1, 5200, 0.8);
        return w.nbp * (0.4 + 0.6 * g) * 0.9 + h.nbp * g * 0.18 + lo(r() * 2 - 1) * 0.18;
      });
    }
    for (let k = 0; k < 5; k++) {
      const t0 = rb(r, 0, BED_LEN), up = r() < 0.5, f0 = rb(r, 150, 230), dur = rb(r, 0.8, 1.5), pan = rb(r, -0.8, 0.8), bp = svf(sr);
      let ph = 0;
      yield* call(C, sr, t0, Math.round(sr * dur), pan, 0.5, (t) => {
        const u = t / dur, f = f0 * (up ? 1 + 1.2 * u : 2.2 - 1.2 * u) * (1 + 0.03 * Math.sin(TAU * 11 * t));
        ph = (ph + f / sr) % 1;
        bp.run(2 * ph - 1, f * 3 + 300, 6);
        return bp.bp * Math.sin(Math.PI * u) ** 1.5 * 3;
      });
    }
    for (let k = 0; k < 7; k++) {
      const t0 = rb(r, 0, BED_LEN), f = rb(r, 1800, 3500), hp = lp1(sr, 3500);
      yield* call(C, sr, t0, Math.round(sr * 0.25), rb(r, -1, 1), 0.3, (t) => { const x = r() * 2 - 1; return (x - hp(x)) * ex(-t / 0.004) + Math.sin(TAU * f * t) * ex(-t / 0.09) * 0.5; });
    }
    return yield* finishBed(C, 0.14);
  } },
  lava: { vol: 0.95, gen: function* (sr, r) {
    // A deep furnace rumble with beating sub tones, steam hiss, glooping bubbles and crackle.
    const C = [new Float32Array(sr * BED_LEN), new Float32Array(sr * BED_LEN)];
    for (let c = 0; c < 2; c++) {
      const rum = nlp(sr, 75), mid = nlp(sr, 260), st = svf(sr), cr = lp1(sr, 3000);
      yield* layer(C[c], sr, 1, (T) => {
        const g = 0.65 + 0.35 * Math.sin(TWO_PI_OVER(2) * T + c);
        st.run(r() * 2 - 1, 3200, 0.8);
        const x = r() * 2 - 1, h = x - cr(x);
        return rum(r() * 2 - 1) * g * 0.9 + (Math.sin(TAU * 38 * T) + Math.sin(TAU * 41 * T) + 0.6 * Math.sin(TAU * 55 * T)) * 0.25 + mid(r() * 2 - 1) * 0.2 * g + st.nbp * gust(T, 4, c * 2) * 0.16 + h * h * h * h * h * 6;
      });
    }
    for (let k = 0; k < 24; k++) {
      const t0 = rb(r, 0, BED_LEN), big = r() < 0.3, f0 = big ? rb(r, 60, 90) : rb(r, 110, 180), dur = big ? 0.22 : 0.1, pan = rb(r, -0.9, 0.9);
      let p = 0;
      yield* call(C, sr, t0, Math.round(sr * (dur + 0.05)), pan, big ? 0.6 : 0.4, (t) => {
        p += TAU * (f0 * (1 + 1.6 * clamp(t / dur, 0, 1))) / sr;
        return Math.sin(p) * Math.sin(Math.PI * clamp(t / dur, 0, 1)) * (t < dur ? 1 : 0) + (t > dur ? (r() * 2 - 1) * ex(-(t - dur) / 0.008) * 0.3 : 0);
      });
    }
    return yield* finishBed(C, 0.2);
  } },
  city: { vol: 0.8, gen: function* (sr, r) {
    // Distant city: mains hum, a wash of far traffic, a ventilation fan, passing cars and a faraway horn.
    const C = [new Float32Array(sr * BED_LEN), new Float32Array(sr * BED_LEN)];
    for (let c = 0; c < 2; c++) {
      const tr = nlp(sr, 260), tr2 = nlp(sr, 700), fan = svf(sr);
      yield* layer(C[c], sr, 1, (T) => {
        fan.run(r() * 2 - 1, 1100 + 20 * Math.sin(TAU * 3 * T), 2.5);
        const hum = Math.sin(TAU * 50 * T) + 0.6 * Math.sin(TAU * 100 * T + c) + 0.4 * Math.sin(TAU * 150 * T) + 0.25 * Math.sin(TAU * 200 * T);
        return hum * 0.18 + tr(r() * 2 - 1) * (0.45 + 0.35 * Math.sin(TWO_PI_OVER(2) * T + c)) + tr2(r() * 2 - 1) * 0.12 * gust(T, 3, c) + fan.nbp * 0.07;
      });
    }
    for (let k = 0; k < 4; k++) {
      const t0 = rb(r, 0, BED_LEN), dur = rb(r, 1.0, 1.8), bp = svf(sr), dir = r() < 0.5 ? -1 : 1;
      yield* call(C, sr, t0, Math.round(sr * dur), dir * 0.8, 0.5, (t) => { const u = t / dur; bp.run(r() * 2 - 1, 500 + 700 * Math.sin(Math.PI * u) , 1.5); return bp.nbp * Math.sin(Math.PI * u) ** 2; });
    }
    for (let k = 0; k < 2; k++) {
      const t0 = rb(r, 0, BED_LEN), f = rb(r, 300, 380), pan = rb(r, -0.9, 0.9), lp = lp1(sr, 1400);
      yield* call(C, sr, t0, Math.round(sr * 0.9), pan, 0.18, (t) => lp((2 * ((f * t) % 1) - 1) + (2 * ((f * 1.26 * t) % 1) - 1)) * Math.min(1, t / 0.05) * (t < 0.5 ? 1 : ex(-(t - 0.5) / 0.1)));
    }
    return yield* finishBed(C, 0.13);
  } },
  swamp: { vol: 0.95, gen: function* (sr, r) {
    // Night swamp: crickets in several time signatures, frogs croaking, drops plopping into still water.
    const C = [new Float32Array(sr * BED_LEN), new Float32Array(sr * BED_LEN)];
    for (let c = 0; c < 2; c++) {
      const wat = nlp(sr, 320);
      yield* layer(C[c], sr, 0.5, (T) => wat(r() * 2 - 1) * 0.4 * gust(T, 2, c) + Math.sin(TAU * (7000 + 150 * Math.sin(TAU * 4 * T)) * T) * 0.03 * gust(T, 1, c));
      for (const [rate, fc, g] of [[2.5, 4300 + c * 140, 0.5], [3.125, 5100 - c * 120, 0.35], [1.875, 3700 + c * 90, 0.3]]) {
        yield* layer(C[c], sr, g * 0.5, (T) => {
          const ph = (T * rate) % 1, u = ph < 0.42 ? (ph / 0.42) * 3 : -1;
          const env = u < 0 ? 0 : Math.sin(Math.PI * (u % 1)) ** 2;
          return Math.sin(TAU * fc * T) * env;
        });
      }
    }
    for (let k = 0; k < 9; k++) {
      const t0 = rb(r, 0, BED_LEN), f = rb(r, 140, 250), n = 2 + Math.floor(r() * 3), pan = rb(r, -0.9, 0.9), lp = lp1(sr, 900);
      for (let j = 0; j < n; j++) {
        const rate = 14 + (k % 3) * 3;
        yield* call(C, sr, t0 + j * 0.42, Math.round(sr * 0.34), pan, 0.55, (t) => {
          const u = t / 0.34, sawv = 2 * ((f * (1 + 0.35 * Math.sin(Math.PI * u)) * t) % 1) - 1;
          return lp(sawv) * (0.5 + 0.5 * Math.sin(TAU * rate * t)) * Math.sin(Math.PI * u) ** 0.6;
        });
      }
    }
    for (let k = 0; k < 6; k++) {
      const t0 = rb(r, 0, BED_LEN), f = rb(r, 380, 700);
      yield* call(C, sr, t0, Math.round(sr * 0.12), rb(r, -1, 1), 0.3, (t) => Math.sin(TAU * f * (1 + 2 * t / 0.1) * t) * ex(-t / 0.03));
    }
    return yield* finishBed(C, 0.13);
  } },
  autumn: { vol: 0.95, gen: function* (sr, r) {
    // A cool breeze through dry trees: gusts of rustling leaves, a distant crow, creaking branches.
    const C = [new Float32Array(sr * BED_LEN), new Float32Array(sr * BED_LEN)];
    for (let c = 0; c < 2; c++) {
      const w = svf(sr), lf = svf(sr), hp = lp1(sr, 5000);
      yield* layer(C[c], sr, 1, (T) => {
        const g = gust(T, 3, c * 1.3), x = r() * 2 - 1, h = x - hp(x);
        w.run(r() * 2 - 1, 620 + 280 * g, 1);
        lf.run(r() * 2 - 1, 4200 + 1200 * g, 0.9);
        return w.nbp * (0.3 + 0.7 * g) * 0.7 + lf.nbp * g * g * 0.35 + h * h * h * g * 9;
      });
    }
    for (let k = 0; k < 2; k++) {
      const t0 = rb(r, 0, BED_LEN - 3), f = rb(r, 480, 560), pan = rb(r, -0.8, 0.8);
      for (let j = 0; j < 3; j++) {
        const bp = svf(sr), lp = lp1(sr, 2300);
        yield* call(C, sr, t0 + j * 0.34, Math.round(sr * 0.22), pan, 0.4, (t) => { const u = t / 0.2; bp.run(2 * ((f * (1 - 0.3 * u) * t) % 1) - 1 + (r() * 2 - 1) * 0.25, 1000, 2.5); return lp(bp.lp) * Math.sin(Math.PI * clamp(u, 0, 1)) ** 0.5 * 2; });
      }
    }
    for (let k = 0; k < 3; k++) {
      const t0 = rb(r, 0, BED_LEN), f = rb(r, 120, 180);
      yield* call(C, sr, t0, Math.round(sr * 0.7), rb(r, -0.8, 0.8), 0.18, (t) => Math.sin(TAU * f * (1 + 0.5 * Math.sin(TAU * 3 * t)) * t) * Math.sin(Math.PI * t / 0.7) ** 2 * (0.6 + 0.4 * Math.sin(TAU * 31 * t)));
    }
    for (let k = 0; k < 4; k++) {
      const f = rb(r, 3000, 4200), t0 = rb(r, 0, BED_LEN);
      yield* call(C, sr, t0, Math.round(sr * 0.2), rb(r, -0.9, 0.9), 0.12, chirp(f, f * 1.25, 0.1, 40));
    }
    return yield* finishBed(C, 0.14);
  } },
  canyon: { vol: 0.95, gen: function* (sr, r) {
    // Wind funnelling through rock: low moan, a hollow cavity hum, whistles whose echoes come back off the walls.
    const C = [new Float32Array(sr * BED_LEN), new Float32Array(sr * BED_LEN)];
    for (let c = 0; c < 2; c++) {
      const w = svf(sr), hi = svf(sr);
      yield* layer(C[c], sr, 1, (T) => {
        const g = gust(T, 2, c * 1.1);
        w.run(r() * 2 - 1, 210 + 120 * g + 50 * Math.sin(TWO_PI_OVER(5) * T), 1.3);
        hi.run(r() * 2 - 1, 1500 + 400 * g, 2);
        return w.nbp * (0.4 + 0.6 * g) * 0.95 + Math.sin(TAU * 88 * T) * 0.12 * g + hi.nbp * g * g * 0.1;
      });
    }
    const echoes = [[0, 1, 1400], [1.15, 0.42, 1000], [2.4, 0.2, 700], [3.9, 0.09, 520]];
    for (let k = 0; k < 4; k++) {
      const t0 = rb(r, 0, BED_LEN), f = rb(r, 300, 480), pan = rb(r, -0.8, 0.8), dur = rb(r, 1.0, 1.6);
      for (const [dt, g, fc] of echoes) {
        const lp = lp1(sr, fc);
        yield* call(C, sr, t0 + dt, Math.round(sr * dur), pan * (dt ? -1 : 1) * 0.8, 0.3 * g, (t) => { const u = t / dur; return lp(Math.sin(TAU * f * (1 + 0.25 * Math.sin(Math.PI * u)) * t) + 0.3 * Math.sin(TAU * f * 2 * t)) * Math.sin(Math.PI * u) ** 2; });
      }
    }
    for (let k = 0; k < 4; k++) {
      const t0 = rb(r, 0, BED_LEN), hp = lp1(sr, 2000);
      for (const [dt, g] of echoes) yield* call(C, sr, t0 + dt, Math.round(sr * 0.05), rb(r, -0.8, 0.8), 0.25 * g, (t) => { const x = r() * 2 - 1; return (x - hp(x)) * ex(-t / 0.006); });
    }
    return yield* finishBed(C, 0.14);
  } },
};
export function* bedSteps(name) {
  const B = BEDS[name], chans = yield* B.gen(BED_SR, mulberry(fnv('bed_' + name)));
  return { chans, sr: BED_SR };
}
export function renderBed(name) {
  const it = bedSteps(name);
  for (;;) { const s = it.next(); if (s.done) return s.value; }
}

// ---------- Event -> sound mapping (pure) ----------
// zoneEnd is silent except for the wall and turret kinds.
export const SILENT_EVENTS = ['zoneEnd'];
// Skills whose sound comes from a companion event instead of the `skill` event itself.
export const SKILL_COMPANION = {
  rocket: 'fire', min: 'zone', truongcham: 'zone', vom: 'zone',
  khoi: 'zone', baotuyet: 'zone', hotu: 'zone', tuongbang: 'zone', usung: 'zone',
  xungbang: 'nova', locthep: 'nova',
  camchot: 'stance', danxuyen: 'fire', mocxich: 'fire', hoanvi: 'swap', longxich: 'zone', khientang: 'bless', thanhdong: 'zone', vo: 'leap', dautu: 'mark',
  xuyentuong: 'warp', ongtho: 'zone', tiepsuc: 'bless', vongsang: 'rally', daydien: 'zone', mansang: 'zone',
};
const SKILL_SND = {
  giap: 'sk_shield', huc: 'sk_dash', diachan: 'sk_quake_wind', tangap: 'sk_buff', muahoa: 'sk_rain', luot: 'sk_blink', tia: 'sk_beam_charge', hoiphuc: 'sk_heal',
  giatlui: 'sk_recoil', thienloi: 'sk_heavy_call', vomoi: 'sk_pounce', nguytrang: 'sk_cloak', baimin: 'sk_minefield',
  oanhtac: 'sk_siege_call', mairua: 'sk_shell', cuongno: 'sk_rage', phanthan: 'sk_decoy', vudieu: 'sk_mirage', chumnay: 'sk_ricochet', baodia: 'sk_disc_storm',
  quatai: 'sk_overload', thienhoa: 'sk_sweep_charge',
};
// Field zones sound by their `vis`; the zone event carries only the id.
const FIELD_SND = { slow: 'sk_slow', smoke: 'sk_smoke', blizzard: 'sk_blizzard', magnet: 'sk_magnet', cage: 'sk_cage', bastion: 'sk_bastion' };
// The nova event has no skill id, so the caster's mech picks the sound.
const NOVA_SND = { bocap: 'sk_spin', bang: 'sk_frost_nova', hacho: 'sk_leap_land' };
// A bless event names its skill: the shield gift and the speed boost shimmer differently.
const BLESS_SND = { khientang: 'sk_bless_shield', tiepsuc: 'sk_bless_boost' };
// What a projectile does to a wall. A flame is already roaring and says nothing.
const WALL_SND = { pulse: 'imp_energy', wave: 'imp_energy', frost: 'imp_ice', flame: null };
const UNIT_SND = { frost: 'imp_ice', pulse: 'imp_energy', wave: 'imp_energy' };
const ZONE_END_SND = { turret: 'turret_break', wall: 'sk_ice_break', drone: 'drone_down', wire: 'wire_snap' };

// `memo` (optional, owned by the engine) remembers what a zone was when it began: its end event carries neither `vis` nor `screen`, and the zone is gone by then.
export function planEvent(e, m, me, memo) {
  const out = [];
  // `key` names a held voice: later events with the same key extend it instead of starting another.
  const add = (s, x, z, own, far, key, rate) => { if (SOUNDS[s]) out.push({ s, x, z, own: !!own, far: !!far, key: SOUNDS[s].sustain ? key || s : undefined, rate }); };
  const unitPos = (id) => (m && m.units && m.units[id]) || null;
  switch (e.t) {
    case 'fire': add('fire_' + e.vis, e.x, e.z, e.id === me, false, 'fire:' + e.id); break;
    case 'ray': add(e.on === 'ally' ? 'ray_heal' : e.on === 'foe' || e.on === 'tower' ? 'ray_zap' : 'ray_idle', e.x0, e.z0, e.id === me, false, 'ray:' + e.id); break;
    case 'hook': add('hook_clamp', e.x, e.z, e.id === me); break;
    case 'swap': add('sk_swap', e.x0, e.z0, e.id === me || e.other === me); break;
    case 'stance': add(e.on ? 'st_plant' : 'st_release', e.x, e.z, e.id === me); break;
    case 'bless': add(BLESS_SND[e.skill] || 'sk_bless_boost', e.x, e.z, e.id === me || e.to === me); break;
    case 'rally': add('sk_rally', e.x, e.z, e.id === me); break;
    case 'leap': add('sk_leap', e.x0, e.z0, e.id === me); break;
    case 'mark': add('sk_mark', e.x, e.z, e.id === me); break;
    case 'warp': add('sk_warp', e.x0, e.z0, e.id === me); add('sk_warp', e.x, e.z, e.id === me); break;
    case 'zap': add('wire_zap', e.x, e.z, e.id === me); break;
    case 'execute': add('hit_execute', e.x, e.z, e.by === me || e.id === me); break;
    case 'turretFire': add('fire_turret', e.x, e.z); break;
    case 'towerFire': add('fire_tower', e.x, e.z); break;
    case 'towerHit': add('tower_hit', e.x, e.z, e.by === me); break;
    case 'towerBlock': add('tower_block', e.x, e.z); break;
    case 'towerDown': add(e.kind === 'main' ? 'tower_fall' : 'tower_down', e.x, e.z, false, true); break;
    case 'skill': add(SKILL_SND[e.skill], e.x, e.z, e.id === me); break;
    case 'impact':
      if (e.on === 'dome') add('hit_dome', e.x, e.z);
      else if (e.on === 'wall') add(e.vis in WALL_SND ? WALL_SND[e.vis] : 'hit_wall', e.x, e.z);
      else if (e.on === 'turret') add('hit_metal', e.x, e.z);
      else if (e.on === 'bounce') add('imp_ping', e.x, e.z);
      else if (e.on === 'screen') add('imp_absorb', e.x, e.z);
      else if (e.on === 'decoy') add('imp_holo', e.x, e.z);
      else if (e.on === 'unit') { if (UNIT_SND[e.vis]) add(UNIT_SND[e.vis], e.x, e.z); }
      if (e.splash > 0 && e.on !== 'dome') add('expl_small', e.x, e.z);
      break;
    case 'hit':
      add(e.absorbed > 0 && e.amt <= 0 ? 'hit_shield' : e.amt >= 220 ? 'hit_heavy' : 'hit_metal', e.x, e.z, e.by === me || e.id === me);
      break;
    case 'heal': add('heal_tick', e.x, e.z, e.id === me); break;
    case 'death': add('death', e.x, e.z, e.id === me); break;
    case 'respawn': add('respawn', e.x, e.z, e.id === me); break;
    case 'explode':
      if (e.why === 'strike') add('expl_big', e.x, e.z);
      else if (e.why === 'barrel') add('expl_barrel', e.x, e.z);
      else if (e.why === 'mine') { add('sk_mine_zap', e.x, e.z); add('expl_small', e.x, e.z); }
      else if (e.why === 'decoy') add('expl_decoy', e.x, e.z);
      else add('expl_small', e.x, e.z);
      break;
    case 'nova': { const u = unitPos(e.id); add((u && NOVA_SND[u.mech]) || 'sk_quake_slam', e.x, e.z, e.id === me); break; }
    case 'beam': {
      const u = unitPos(e.id);
      if (u && u.cast && u.cast.skill && u.cast.skill.do === 'sweep') add('beam_sweep', e.x0, e.z0, e.id === me, false, 'sweep:' + e.id);
      else if (u && (u.def && u.def.weapon ? u.def.weapon.charge : u.mech === 'hoalong')) break; // a released lance already sounded as its `fire`
      else add('sk_beam_fire', e.x0, e.z0, e.id === me);
      break;
    }
    case 'ram': add('ram_clang', e.x, e.z, e.id === me); break;
    case 'shieldBreak': add('shield_break', e.x, e.z, e.id === me); break;
    case 'item': { const u = unitPos(e.id); add('sk_heal', u ? u.x : undefined, u ? u.z : undefined, e.id === me); break; }
    case 'zone': {
      const z = m && m.zones && m.zones.find((q) => q.id === e.id);
      if (e.kind === 'strike') add(z && z.lob ? 'mortar_whistle' : 'sk_barrage_wind', e.x, e.z);
      else if (e.kind === 'mine') add('sk_mine_arm', e.x, e.z);
      else if (e.kind === 'dome') add('sk_dome', e.x, e.z);
      else if (e.kind === 'wall') { const screen = !!(z && z.screen); if (memo) memo.set(e.id, { screen }); add(screen ? 'sk_screen' : 'sk_ice_wall', e.x, e.z); }
      else if (e.kind === 'turret') add('sk_turret', e.x, e.z);
      else if (e.kind === 'decoy') add('decoy_spawn', e.x, e.z);
      else if (e.kind === 'drone') add('sk_drone', e.x, e.z);
      else if (e.kind === 'wire') add('sk_wire', e.x, e.z);
      else if (e.kind === 'field') add(FIELD_SND[(z && z.vis) || e.vis], e.x, e.z);
      break;
    }
    // A decoy's end is its `explode` (why: decoy), so its zoneEnd stays quiet.
    case 'zoneEnd': {
      const k = memo && memo.get(e.id);
      if (memo) memo.delete(e.id);
      add(e.kind === 'wall' && k && k.screen ? 'sk_screen_off' : ZONE_END_SND[e.kind], e.x, e.z);
      break;
    }
    case 'propHit': add('prop_hit', e.x, e.z); break;
    case 'propBreak': add(e.kind === 'pot' ? 'pot_break' : e.kind === 'crate' ? 'crate_break' : null, e.x, e.z); break;
    case 'crateDrop': add('crate_drop', e.x, e.z); break;
    case 'crateLand': add('crate_land', e.x, e.z); break;
    case 'pickup': add('pickup_' + e.type, e.x, e.z, e.id === me); break;
    case 'over': {
      const u = unitPos(me);
      out.push({ s: u && e.winner === u.team ? 'win' : 'lose', global: true });
      break;
    }
    default: break;
  }
  return out;
}

export const UI_MAP = { click: 'ui_click', hover: 'ui_hover', confirm: 'ui_confirm', back: 'ui_back', error: 'ui_deny', deny: 'ui_deny', start: 'ui_start', countdown: 'ui_countdown', win: 'win', lose: 'lose', coin: 'ui_coin', levelup: 'ui_levelup', ready: 'ui_ready', horn: 'horn', final: 'sting_final', towerwarn: 'sting_tower' };
export const UI_NAMES = Object.keys(UI_MAP);

// ---------- Engine ----------
const METHODS = ['resume', 'setVolume', 'setMusic', 'mute', 'event', 'setListener', 'update', 'ui', 'setScene', 'stats'];
function noop() {
  const o = {};
  for (const k of METHODS) o[k] = () => (k === 'resume' ? Promise.resolve() : k === 'stats' ? { queued: 0, maxPumpMs: 0, noop: true } : undefined);
  return o;
}

const MAX_DIST = 32;
// Voices allowed per bus. Ten mechs firing share the gun bus: the loudest, nearest and highest-priority ones win.
export const POOL = { gun: 14, world: 20, ui: 6 };
const PRIORITY = ['fire_howitzer', 'fire_sabot', 'fire_slug', 'fire_hook', 'fire_wave', 'fire_flame', 'fire_dart', 'fire_disc', 'fire_lance', 'fire_shell', 'fire_bullet', 'fire_rail', 'fire_pulse', 'fire_rocket', 'fire_mortar', 'fire_pellet', 'fire_frost', 'fire_rivet', 'hit_metal', 'hit_wall', 'expl_small', 'ui_click', 'ui_hover', 'ui_confirm', 'ui_back'];

// How tense the match is, 0..1: the last 30 seconds, or a main tower close to falling in `nha`.
export function tensionOf(m, meId) {
  if (!m || m.over) return 0;
  let t = 0;
  const left = m.duration > 0 && Number.isFinite(m.duration) ? m.duration - m.time : Infinity;
  if (left <= 30) t = 0.55 + 0.45 * clamp(1 - left / 30, 0, 1);
  if (m.towers && m.towers.length) {
    const ratio = (team) => { const k = m.towers.find((q) => q.kind === 'main' && q.team === team); return k && k.alive ? k.hp / k.maxHp : 1; };
    const me = m.units && m.units[meId], mine = me ? ratio(me.team) : 1, foe = me ? ratio(1 - me.team) : 1;
    t = Math.max(t, 0.9 * clamp((0.4 - Math.min(mine, foe)) / 0.3, 0, 1));
  }
  return t;
}

export async function makeAudio(G, onProgress, opts = {}) {
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!opts.ctx && ((G && G.params && G.params.noaudio) || !AC)) return noop();
  let ctx;
  if (opts.ctx) ctx = opts.ctx; else { try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { return noop(); } }
  const offline = !!opts.ctx;
  const live = () => offline || ctx.state === 'running';
  const sr = ctx.sampleRate;

  const master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(ctx.destination);
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(2048);
  for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh((i / (curve.length - 1)) * 2 - 1);
  shaper.curve = curve;
  shaper.oversample = '2x';
  shaper.connect(master);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -3; comp.ratio.value = 2; comp.knee.value = 6; comp.attack.value = 0.004; comp.release.value = 0.16;
  comp.connect(shaper);

  // gun and ui go straight to the compressor; world, music and ambience pass a ducker first.
  const bus = {}, duckers = {};
  for (const k of ['gun', 'world', 'ui', 'music', 'amb']) bus[k] = ctx.createGain();
  bus.gun.connect(comp); bus.ui.connect(comp);
  for (const k of ['world', 'music', 'amb']) { duckers[k] = ctx.createGain(); bus[k].connect(duckers[k]); duckers[k].connect(comp); }
  bus.music.gain.value = 0.55;
  bus.amb.gain.value = 0.6;

  // Short damped tail: highs die first, like sound under jungle canopy.
  const revIn = ctx.createGain(), conv = ctx.createConvolver(), revOut = ctx.createGain();
  {
    const len = Math.round(sr * 1.2), buf = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch), rr = mulberry(fnv('ir') + ch * 7919);
      let y = 0, peak = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr, a = 1 - ex(-TAU * (7000 * ex(-t * 2.5) + 600) / sr);
        y += a * ((rr() * 2 - 1) - y);
        d[i] = y * Math.sqrt((2 - a) / a) * ex(-t / 0.26) * Math.min(1, t / 0.005);
      }
      for (const t0 of [0.011, 0.023, 0.037, 0.052]) d[Math.round(t0 * sr)] += (rr() < 0.5 ? -1 : 1) * 1.5;
      for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
      for (let i = 0; i < len; i++) d[i] *= 0.5 / peak;
    }
    conv.buffer = buf;
    revOut.gain.value = 0.5;
    revIn.connect(conv); conv.connect(revOut); revOut.connect(comp);
  }

  // ----- lazy rendering -----
  // Nothing renders synchronously while playing: a sound whose buffer is not ready yet is skipped (and moved to the front of the queue).
  const bufs = {};
  const stemBufs = {};
  const bedBufs = {};
  const stats = { maxPumpMs: 0, maxStepMs: 0, slowest: '', queued: 0, stolen: 0, dropped: 0, notReady: 0, ducks: 0, ui: {}, peakVoices: { gun: 0, world: 0, ui: 0 } };
  const cache = opts.cache || null; // test-only: lets several offline contexts share one synthesis
  const queue = [];
  let scene = 'menu', theme = null;
  const rankOf = (j) => {
    if (j.prio) return 0;
    // In the menu the music is the first thing heard; in a match the first shots are.
    if (j.kind === 'stem') return STEMS[j.name].scene !== scene ? 4 : scene === 'menu' ? 0.5 : 1.5;
    if (j.kind === 'bed') return j.name === theme ? 1.6 : 5;
    return j.v === 0 ? 1 : 3;
  };
  const resort = () => queue.sort((a, b) => rankOf(a) - rankOf(b));

  const putBuf = (name, v, data) => {
    const b = ctx.createBuffer(1, data.length, sr);
    b.copyToChannel(data, 0);
    bufs[name + '|' + v] = b;
  };
  const prioNames = new Set(PRIORITY.map((n) => n + '|0'));
  for (const name of Object.keys(SOUNDS)) {
    for (let v = 0; v < SOUNDS[name].n; v++) {
      const it = soundSteps(name, v, sr), key = name + '|' + v;
      queue.push({ kind: 'sfx', name, v, prio: prioNames.has(key), step() {
        if (cache && cache[key]) { putBuf(name, v, cache[key]); return true; }
        const s = it.next();
        if (s.done) { putBuf(name, v, s.value); if (cache) cache[key] = s.value; }
        return s.done;
      } });
    }
  }
  const toBuffer = (chans, rate) => {
    const b = ctx.createBuffer(chans.length, chans[0].length, rate);
    chans.forEach((c, i) => b.copyToChannel(c, i));
    return b;
  };
  for (const name of Object.keys(STEMS)) {
    const it = STEMS[name].gen(MUSIC_SR, mulberry(fnv(name)));
    queue.push({ kind: 'stem', name, step() {
      if (cache && cache['stem|' + name]) { stemBufs[name] = toBuffer(cache['stem|' + name], MUSIC_SR); return true; }
      const s = it.next();
      if (s.done) { stemBufs[name] = toBuffer(s.value, MUSIC_SR); if (cache) cache['stem|' + name] = s.value; }
      return s.done;
    } });
  }
  const bedQueued = {};
  const queueBed = (name) => {
    if (!BEDS[name] || bedQueued[name]) return;
    bedQueued[name] = true;
    const it = bedSteps(name);
    queue.push({ kind: 'bed', name, step() {
      if (cache && cache['bed|' + name]) { bedBufs[name] = toBuffer(cache['bed|' + name], BED_SR); return true; }
      const s = it.next();
      if (s.done) { bedBufs[name] = toBuffer(s.value.chans, s.value.sr); if (cache) cache['bed|' + name] = s.value.chans; }
      return s.done;
    } });
    resort();
  };
  resort();
  const prioTotal = queue.filter((j) => j.prio).length;

  const pump = (budget) => {
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < budget) {
      const t1 = performance.now(), job = queue[0];
      const done = job.step();
      const dt = performance.now() - t1;
      if (dt > stats.maxStepMs) { stats.maxStepMs = dt; stats.slowest = job.name; }
      if (done) queue.shift();
    }
    stats.maxPumpMs = Math.max(stats.maxPumpMs, performance.now() - t0);
    stats.queued = queue.length;
  };
  const nextFrame = (f) => ((typeof requestAnimationFrame === 'function' && typeof document !== 'undefined' && !document.hidden) ? requestAnimationFrame(f) : setTimeout(f, 40));
  const loop = () => { pump(6); if (queue.length) nextFrame(loop); };
  // A sound that was asked for before it was ready jumps the queue.
  const want = (name) => {
    let moved = false;
    for (let i = queue.length - 1; i > 0; i--) if (queue[i].name === name && queue[i].kind === 'sfx') { const [j] = queue.splice(i, 1); queue.unshift(j); moved = true; }
    return moved;
  };

  stats.queued = queue.length;
  while (queue.length && queue[0].prio) {
    pump(6);
    if (onProgress) onProgress(1 - queue.filter((j) => j.prio).length / prioTotal);
    await new Promise((res) => nextFrame(res));
  }
  if (onProgress) onProgress(1);
  if (!offline) nextFrame(loop);

  // ----- voices -----
  const pools = { gun: [], world: [], ui: [] };
  const lastPlayed = {};
  const lastVariant = {};
  const lis = { x: 0, z: 0 };
  let muted = false, vol = 0.8;
  const now = () => ctx.currentTime;

  const kill = (v, T, fast) => {
    try { v.g.gain.setTargetAtTime(0, T, 0.008); v.src.stop(T + (fast ? 0.04 : 0)); } catch (e) { /* already stopped */ }
  };
  // Attack 12 ms, hold 85 ms, release 100 ms: the world dips under a shot and comes back before the next one.
  const duck = (depth, T) => {
    stats.ducks++;
    for (const k of ['world', 'music', 'amb']) {
      const g = duckers[k].gain, d = k === 'amb' ? Math.min(0.8, depth * 1.3) : depth;
      g.cancelScheduledValues(T);
      g.setTargetAtTime(1 - d, T, 0.012);
      g.setTargetAtTime(1, T + 0.085, 0.1);
    }
  };

  // Level, pan, distance filter and reverb send of a sound at a place; null when it is out of earshot.
  function spatial(S, o) {
    let gain = S.vol, pan = 0, cutoff = 0, send = 0.05, near = 1;
    if (o.x !== undefined && o.x !== null && !o.own) {
      const dx = o.x - lis.x, dz = o.z - lis.z, d = Math.hypot(dx, dz);
      near = d < 3 ? 1 : Math.pow(1 - d / MAX_DIST, 1.6);
      if (o.far) near = Math.max(near, 0.5); else if (d > MAX_DIST) return null;
      gain *= 0.7 * near;
      pan = clamp(dx / 16, -1, 1) * 0.9;
      cutoff = 1800 + 14000 * ex(-d / 10);
      send = 0.2 + 0.4 * (d / MAX_DIST);
    } else if (o.own) gain *= 1.3;
    return gain < 0.01 ? null : { gain, pan, cutoff, send, near };
  }

  function play(name, o) {
    const S = SOUNDS[name];
    if (!S || !live()) return;
    const T = o.at !== undefined ? o.at : now();
    const sp = spatial(S, o);
    if (!sp) return;
    let { gain } = sp;
    const { pan, cutoff, send, near } = sp;
    if (S.gap && T - (lastPlayed[name] || -9) < S.gap) return;

    const pool = pools[S.bus];
    for (let i = pool.length - 1; i >= 0; i--) if (pool[i].end <= T) pool.splice(i, 1);
    const score = S.pri + (o.own ? 3 : 0) + near * 2;
    const same = pool.filter((v) => v.name === name);
    if (same.length >= S.max) {
      let lo = same[0];
      for (const v of same) if (v.score < lo.score) lo = v;
      if (lo.score > score) { stats.dropped++; return; }
      kill(lo, T, true); pool.splice(pool.indexOf(lo), 1); stats.stolen++;
    }
    if (pool.length >= POOL[S.bus]) {
      let lo = pool[0];
      for (const v of pool) if (v.score < lo.score) lo = v;
      if (lo.score > score) { stats.dropped++; return; }
      kill(lo, T, true); pool.splice(pool.indexOf(lo), 1); stats.stolen++;
    }
    const ready = [];
    for (let k = 0; k < S.n; k++) if (bufs[name + '|' + k]) ready.push(k);
    if (!ready.length) { stats.notReady++; want(name); return; }
    lastPlayed[name] = T;
    // The more copies already sounding, the quieter each new one: a stream of shots stays a stream, not a wall.
    gain /= Math.sqrt(1 + 0.3 * same.length);

    let v = ready[0];
    if (ready.length > 1) { do { v = ready[Math.floor(Math.random() * ready.length)]; } while (v === lastVariant[name]); lastVariant[name] = v; }
    const src = ctx.createBufferSource();
    src.buffer = bufs[name + '|' + v];
    const rate = S.bus === 'ui' ? 1 : 1 + (Math.random() - 0.5) * 0.08;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    let tail = src;
    const nodes = [src, g];
    if (cutoff) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; tail.connect(f); tail = f; nodes.push(f); }
    tail.connect(g);
    let out = g;
    if (ctx.createStereoPanner && S.bus !== 'ui') { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; nodes.push(p); }
    out.connect(bus[S.bus]);
    if (S.bus !== 'ui') { const s = ctx.createGain(); s.gain.value = send; g.connect(s); s.connect(revIn); nodes.push(s); }
    const voiceRec = { name, score, src, g, end: T + src.buffer.duration / rate };
    pool.push(voiceRec);
    if (pool.length > stats.peakVoices[S.bus]) stats.peakVoices[S.bus] = pool.length;
    src.onended = () => { const i = pool.indexOf(voiceRec); if (i >= 0) pool.splice(i, 1); for (const n of nodes) { try { n.disconnect(); } catch (e) { /* gone */ } } };
    src.start(T);
    // The player's own heavy shots duck the world hard, any own shot a little, a heavy one nearby half as much.
    if (o.own) duck(S.duck || (S.bus === 'gun' ? 0.1 : 0), T);
    else if (S.duck && near > 0.5) duck(S.duck * 0.5, T);
  }

  // ----- held voices -----
  // A flamethrower fires every 0.12 s and a link ray every 0.25 s: each event extends one looping voice that fades out `sustain` seconds after the last one.
  const held = {};
  const MAX_HELD = 8;
  function sustain(name, o) {
    const S = SOUNDS[name];
    if (!S || !live()) return;
    const T = o.at !== undefined ? o.at : now();
    const sp = spatial(S, o);
    if (!sp) return;
    const key = o.key || name;
    let rec = held[key];
    if (rec && (rec.name !== name || rec.end < T)) { if (rec.name !== name) { try { rec.g.gain.cancelScheduledValues(T); rec.g.gain.setTargetAtTime(0, T, 0.02); rec.src.stop(T + 0.12); } catch (e) { /* gone */ } } delete held[key]; rec = null; }
    if (!rec) {
      if (Object.keys(held).length >= MAX_HELD && !o.own) return;
      const ready = [];
      for (let k = 0; k < S.n; k++) if (bufs[name + '|' + k]) ready.push(k);
      if (!ready.length) { stats.notReady++; want(name); return; }
      const src = ctx.createBufferSource();
      src.buffer = bufs[name + '|' + ready[Math.floor(Math.random() * ready.length)]];
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      const nodes = [src, g];
      let tail = src, filt = null, pn = null;
      if (sp.cutoff) { filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = sp.cutoff; tail.connect(filt); tail = filt; nodes.push(filt); }
      tail.connect(g);
      let out = g;
      if (ctx.createStereoPanner) { pn = ctx.createStereoPanner(); pn.pan.value = sp.pan; g.connect(pn); out = pn; nodes.push(pn); }
      out.connect(bus[S.bus]);
      const sd = ctx.createGain(); sd.gain.value = sp.send; g.connect(sd); sd.connect(revIn); nodes.push(sd);
      rec = { name, src, g, filt, pn, end: T };
      held[key] = rec;
      src.onended = () => { if (held[key] === rec) delete held[key]; for (const n of nodes) { try { n.disconnect(); } catch (e) { /* gone */ } } };
      src.start(T, Math.random() * src.buffer.duration);
    }
    rec.end = T + S.sustain + 0.4;
    try {
      rec.g.gain.cancelScheduledValues(T);
      rec.g.gain.setTargetAtTime(sp.gain, T, 0.03);
      rec.g.gain.setTargetAtTime(0, T + S.sustain, 0.07);
      rec.src.stop(rec.end);
      if (rec.pn) rec.pn.pan.setTargetAtTime(sp.pan, T, 0.05);
      if (rec.filt && sp.cutoff) rec.filt.frequency.setTargetAtTime(sp.cutoff, T, 0.05);
      if (o.rate) rec.src.playbackRate.setTargetAtTime(o.rate, T, 0.06);
    } catch (e) { /* source already ended */ }
  }

  // ----- music and ambience -----
  const active = {};
  const epochs = {};
  let intensity = 0, tension = 0, bedRec = null, bedName = null;
  function startStems() {
    if (!live()) return;
    for (const name of Object.keys(STEMS)) {
      const st = STEMS[name], b = stemBufs[name];
      if (!b || active[name]) continue;
      if (epochs[st.scene] === undefined) epochs[st.scene] = now();
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(bus.music);
      const src = ctx.createBufferSource();
      src.buffer = b; src.loop = true;
      src.connect(g);
      src.start(0, ((now() - epochs[st.scene]) % b.duration));
      active[name] = { g, src };
    }
  }
  function syncBed(t) {
    const want = (G && G.match && G.match.map && G.match.map.theme) || null;
    if (want !== theme) { theme = want; if (want) { queueBed(want); resort(); } }
    if (want === bedName && bedRec) return;
    if (!want || !bedBufs[want]) { if (!want && bedRec) { bedRec.g.gain.setTargetAtTime(0, t, 0.6); const r = bedRec; setTimeout(() => { try { r.src.stop(); } catch (e) { /* gone */ } }, 4000); bedRec = null; bedName = null; } return; }
    if (bedRec) { bedRec.g.gain.setTargetAtTime(0, t, 0.6); const r = bedRec; setTimeout(() => { try { r.src.stop(); } catch (e) { /* gone */ } }, 4000); }
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(bus.amb);
    const src = ctx.createBufferSource();
    src.buffer = bedBufs[want]; src.loop = true;
    src.connect(g);
    src.start(0, Math.random() * src.buffer.duration);
    bedRec = { g, src, vol: BEDS[want].vol };
    bedName = want;
  }

  // The UI never calls the audio object for clicks, so the engine listens to the page itself.
  const BACK = new Set(['back', 'close', 'cancel', 'no', 'kcancel', 'quit']);
  const OK = new Set(['yes', 'play', 'create', 'again', 'lobby', 'buy', 'resume', 'joinCode']);
  function wireDom() {
    if (offline || typeof document === 'undefined') return;
    const SEL = 'button, [role="button"], .btn, [data-a], [data-tab], [data-r]';
    let last = null;
    const find = (e) => (e.target && e.target.closest ? e.target.closest(SEL) : null);
    document.addEventListener('pointerover', (e) => {
      if (e.pointerType === 'touch') return;
      const el = find(e);
      if (el === last) return;
      last = el;
      if (el && !el.disabled) api.ui('hover');
    }, true);
    document.addEventListener('pointerdown', (e) => {
      const el = find(e);
      if (el && (el.disabled || el.getAttribute('aria-disabled') === 'true')) api.ui('deny');
    }, true);
    document.addEventListener('click', (e) => {
      const el = find(e);
      if (!el || el.disabled) return;
      const r = el.dataset && el.dataset.r;
      if (el.classList.contains('poor') || el.getAttribute('aria-disabled') === 'true') api.ui('deny');
      else if (BACK.has(r)) api.ui('back');
      else if (OK.has(r) || el.classList.contains('primary') || (el.dataset && (el.dataset.a === 'start' || el.dataset.a === 'ready'))) api.ui('confirm');
      else api.ui('click');
    }, true);
  }

  const zoneMemo = new Map();
  let lastMatch = null, final30 = false, towerWarn = false, lastSec = 99, chargeAcc = 0;
  const api = {
    resume() { return ctx.resume().then(startStems); },
    setVolume(v) { vol = clamp(v, 0, 1); master.gain.value = muted ? 0 : vol; },
    setMusic(v) { bus.music.gain.value = clamp(v, 0, 1) * 0.7; },
    mute(b) { muted = !!b; master.gain.value = muted ? 0 : vol; },
    setListener(x, z) { lis.x = x; lis.z = z; },
    setScene(s) {
      if (s === scene) return;
      scene = s;
      resort();
    },
    // `at` (seconds on the context clock) is for the offline mixdown test; the game never passes it.
    event(e, m, meId, at) {
      if (muted || !live()) return;
      for (const p of planEvent(e, m, meId, zoneMemo)) {
        if (p.global) { const t = performance.now(); if (!offline && t - (lastPlayed.__over || 0) < 4000) continue; lastPlayed.__over = t; play(p.s, { at }); }
        else if (SOUNDS[p.s].sustain) sustain(p.s, { ...p, at });
        else play(p.s, { ...p, at });
      }
    },
    ui(name) {
      const s = UI_MAP[name];
      if (!s) return;
      stats.ui[name] = (stats.ui[name] || 0) + 1;
      if (muted) return;
      if (name === 'win' || name === 'lose') { const t = performance.now(); if (t - (lastPlayed.__over || 0) < 4000) return; lastPlayed.__over = t; }
      play(s, {});
    },
    update(dt, i) {
      intensity += (clamp(i || 0, 0, 1) - intensity) * (1 - ex(-dt / ((i || 0) > intensity ? 0.8 : 2.5)));
      const m = G && G.match;
      if (m !== lastMatch) { lastMatch = m; final30 = false; towerWarn = false; lastSec = 99; tension = 0; }
      const tt = scene === 'match' && !(G && G.attract) ? tensionOf(m, G && G.me) : 0;
      tension += (tt - tension) * (1 - ex(-dt / (tt > tension ? 1.5 : 3)));
      if (queue.length) pump(2);
      startStems();
      const t = now();
      for (const name of Object.keys(active)) {
        const st = STEMS[name];
        active[name].g.gain.setTargetAtTime(st.scene === scene ? st.lvl(Math.max(intensity, tension * 0.5), tension) * st.vol : 0, t, 0.5);
      }
      syncBed(t);
      if (bedRec) bedRec.g.gain.setTargetAtTime(bedRec.vol * (scene === 'match' ? 1 : 0.45), t, 0.8);
      // A charge weapon hums while its trigger is held; the pitch climbs with the charge (the host and the single player see u.charge, a guest's mirror does not carry it).
      chargeAcc += dt;
      if (chargeAcc >= 0.05) {
        chargeAcc = 0;
        if (scene === 'match' && m && !m.over && live() && m.units) {
          for (const u of m.units) {
            const C = u.alive && u.charge > 0 && u.def && u.def.weapon && u.def.weapon.charge;
            if (C) sustain('charge_hum', { x: u.x, z: u.z, own: u.id === (G && G.me), key: 'charge:' + u.id, rate: 0.6 + 1.5 * clamp(u.charge / C.max, 0, 1) });
          }
        }
      }
      if (scene === 'match' && m && !m.over && live()) {
        const left = m.duration > 0 && Number.isFinite(m.duration) ? m.duration - m.time : Infinity;
        if (left <= 30 && !final30 && m.time > 5) { final30 = true; play('sting_final', {}); }
        const sec = Math.ceil(left);
        if (left <= 10 && sec < lastSec && sec >= 1) play('ui_countdown', {});
        lastSec = Math.min(lastSec, sec);
        if (m.towers && m.towers.length && !towerWarn) {
          const me = m.units[G.me], k = me && m.towers.find((q) => q.kind === 'main' && q.team === me.team);
          if (k && k.alive && k.hp / k.maxHp < 0.3) { towerWarn = true; play('sting_tower', {}); }
        }
      }
    },
    stats() { return { ...stats, queued: queue.length, state: ctx.state, rate: sr, tension, bed: bedName }; },
  };
  wireDom();
  return api;
}
