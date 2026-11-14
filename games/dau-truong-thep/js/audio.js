// Fully synthesised sound and music. No audio files: every buffer is rendered from seeded noise, filters, sweeps and envelopes.
import { mulberry, fnv } from './rng.js';

const TAU = Math.PI * 2;
const ex = Math.exp;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);
const ad = (t, a, d) => (t < a ? t / a : ex(-(t - a) / d));
const rnd = (r, a, b) => a + (b - a) * r();

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
function* finish(chans, sr, tailMs = 8) {
  let peak = 0;
  for (const a of chans) {
    let xp = 0, yp = 0;
    for (let i = 0; i < a.length; i++) {
      const x = a[i]; yp = x - xp + 0.995 * yp; xp = x; a[i] = yp;
      if ((i & 32767) === 32767) yield;
    }
    const nf = Math.min(a.length >> 1, Math.round(sr * tailMs / 1000));
    for (let i = 0; i < nf; i++) a[a.length - 1 - i] *= i / nf;
    for (let i = 0; i < 16 && i < a.length; i++) a[i] *= i / 16;
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

// ---------- Sound table ----------
// vol: playback level (buffers are all normalised); duck: how far the world and music bus drop under the player's own copy.
export const SOUNDS = {
  fire_shell: { n: 1, dur: 0.9, bus: 'gun', max: 3, pri: 7, vol: 1, duck: 0.3,
    gen: (sr, r, v, D) => {
      const a = nlp(sr, 1100), b = nlp(sr, 180), c = nlp(sr, 500);
      let ph = 0;
      return mk(sr, D, (t) => {
        ph += TAU * (36 + 95 * ex(-t * 22)) / sr;
        return Math.tanh(1.6 * (Math.sin(ph) * ex(-t / 0.22) + a(r() * 2 - 1) * ex(-t / 0.035) * 0.9 +
          b(r() * 2 - 1) * ex(-t / 0.3) * 0.7 + c(r() * 2 - 1) * ex(-t / 0.5) * 0.18));
      });
    } },
  fire_bullet: { n: 3, dur: 0.22, bus: 'gun', max: 6, pri: 4, vol: 0.62,
    gen: (sr, r, v, D) => {
      const l = lp1(sr, 1800 + v * 350), tail = nlp(sr, 2600 + v * 400);
      let ph = 0;
      return mk(sr, D, (t) => {
        const x = r() * 2 - 1;
        ph += TAU * (80 + (170 + v * 25) * ex(-t * 60)) / sr;
        return (x - l(x)) * ex(-t / (0.009 + v * 0.002)) * 1.1 + Math.sin(ph) * ex(-t / 0.03) * 0.7 + tail(r() * 2 - 1) * ex(-t / 0.07) * 0.22;
      });
    } },
  fire_rail: { n: 1, dur: 1.4, bus: 'gun', max: 2, pri: 7, vol: 0.9, duck: 0.25,
    gen: (sr, r, v, D) => {
      const l = lp1(sr, 3500), bp = svf(sr);
      let p1 = 0, p2 = 0, p3 = 0;
      return mk(sr, D, (t) => {
        const x = r() * 2 - 1;
        p1 += TAU * (320 + 3200 * ex(-t * 35)) / sr;
        p2 += TAU * (40 + 80 * ex(-t * 30)) / sr;
        p3 += TAU * (500 + 1500 * ex(-t * 2.2)) / sr;
        bp.run(r() * 2 - 1, 1300 + 500 * Math.sin(t * 5), 6);
        return Math.sin(p1) * ex(-t / 0.07) + (x - l(x)) * ex(-t / 0.012) * 1.1 + Math.sin(p2) * ex(-t / 0.15) * 0.8 +
          bp.nbp * ex(-t / 0.55) * 0.5 + Math.sin(p3) * ex(-t / 0.5) * 0.12;
      });
    } },
  fire_pulse: { n: 1, dur: 0.35, bus: 'gun', max: 4, pri: 4, vol: 0.6,
    gen: (sr, r, v, D) => {
      const nz = nlp(sr, 1500);
      let p = 0;
      return mk(sr, D, (t) => {
        p += TAU * (280 + 720 * ex(-t * 18)) / sr;
        return (Math.sin(p) + 0.35 * Math.sin(2 * p)) * ad(t, 0.003, 0.09) + nz(r() * 2 - 1) * ex(-t / 0.05) * 0.15 + Math.sin(TAU * 210 * t) * ex(-t / 0.15) * 0.3;
      });
    } },
  fire_rocket: { n: 1, dur: 0.9, bus: 'gun', max: 4, pri: 5, vol: 0.8,
    gen: (sr, r, v, D) => {
      const bp = svf(sr), rum = nlp(sr, 300), hi = lp1(sr, 4000);
      let ph = 0;
      return mk(sr, D, (t) => {
        const x = r() * 2 - 1;
        bp.run(x, 400 + 2000 * Math.sin(Math.PI * Math.min(t / 0.6, 1)), 1.1);
        ph += TAU * (55 + 105 * ex(-t * 40)) / sr;
        return bp.nbp * ad(t, 0.06, 0.28) * 1.2 + rum(r() * 2 - 1) * ex(-t / 0.4) + Math.sin(ph) * ex(-t / 0.06) * 0.9 + (x - hi(x)) * ad(t, 0.1, 0.25) * 0.25;
      });
    } },

  hit_metal: { n: 3, dur: 0.35, bus: 'world', max: 5, pri: 3, vol: 0.5,
    gen: (sr, r, v, D) => {
      const f0 = 520 + v * 130 + r() * 40, l = lp1(sr, 2000);
      const R = [1, 2.76, 5.4, 8.93], A = [1, 0.6, 0.35, 0.2], T = [0.09, 0.06, 0.04, 0.025];
      return mk(sr, D, (t) => {
        let s = 0;
        for (let k = 0; k < 4; k++) s += Math.sin(TAU * f0 * R[k] * t) * ex(-t / T[k]) * A[k];
        const x = r() * 2 - 1;
        return s + (x - l(x)) * ex(-t / 0.004) * 0.8 + Math.sin(TAU * 110 * t) * ex(-t / 0.02) * 0.5;
      });
    } },
  hit_wall: { n: 2, dur: 0.3, bus: 'world', max: 4, pri: 3, vol: 0.5,
    gen: (sr, r, v, D) => {
      const nz = nlp(sr, 1600), hp = lp1(sr, 2500);
      const ticks = [];
      for (let k = 0; k < 5; k++) ticks.push(rnd(r, 0.04, 0.22));
      let ph = 0;
      return mk(sr, D, (t) => {
        ph += TAU * (70 + 80 * ex(-t * 40)) / sr;
        const x = r() * 2 - 1, hi = x - hp(x);
        let deb = 0;
        for (const t0 of ticks) if (t > t0) deb += hi * ex(-(t - t0) / 0.006) * 0.3;
        return Math.sin(ph) * ex(-t / 0.05) + nz(r() * 2 - 1) * ex(-t / 0.03) + deb;
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

  expl_small: { n: 2, dur: 0.9, bus: 'world', max: 4, pri: 5, vol: 0.85,
    gen: (sr, r, v, D) => mk(sr, D, blast(sr, r, { fc0: 2800, fc1: 260, fk: 11, dec: 0.22, th0: 95, th1: 32, thk: 25, thd: 0.2, thA: 0.9, rum: 0.3, rumA: 0.5, debris: 4, dAt: 0.1, dSpan: 0.4 })) },
  expl_big: { n: 1, dur: 1.9, bus: 'world', max: 3, pri: 6, vol: 1,
    gen: (sr, r, v, D) => mk(sr, D, blast(sr, r, { fc0: 2000, fc1: 180, fk: 4.5, dec: 0.55, th0: 70, th1: 24, thk: 10, thd: 0.5, thA: 1.1, rum: 0.9, rumA: 1.2, debris: 14, dAt: 0.15, dSpan: 1.0 })) },
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
  death: { n: 1, dur: 2.2, bus: 'world', max: 3, pri: 8, vol: 1,
    gen: (sr, r, v, D) => {
      const base = blast(sr, r, { fc0: 2200, fc1: 200, fk: 4, dec: 0.5, th0: 75, th1: 26, thk: 10, thd: 0.5, thA: 1.1, rum: 0.9, rumA: 1.1, debris: 8, dAt: 0.15, dSpan: 1.0 });
      const clangs = [];
      for (let k = 0; k < 7; k++) clangs.push({ t: rnd(r, 0.1, 1.3), f: rnd(r, 200, 900), d: rnd(r, 0.15, 0.35), a: rnd(r, 0.35, 0.6) });
      return mk(sr, D, (t) => {
        let s = 0;
        for (const c of clangs) if (t > c.t) { const tt = t - c.t; s += (Math.sin(TAU * c.f * tt) + 0.6 * Math.sin(TAU * c.f * 2.7 * tt) + 0.3 * Math.sin(TAU * c.f * 5.2 * tt)) * ex(-tt / c.d) * c.a; }
        return base(t) + s * 0.6;
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
  win: { n: 1, dur: 2.6, bus: 'ui', max: 1, pri: 9, vol: 0.85,
    gen: (sr, r, v, D) => {
      const list = [261.6, 329.6, 392, 523.3, 659.3].map((f, i) => ({ f, t: [0, 0.14, 0.28, 0.42, 0.62][i], d: 0.5, w: W.brass, a: 0.01 }));
      for (const f of [523.3, 659.3, 784]) list.push({ f, t: 0.85, d: 0.9, w: W.brass, a: 0.02, g: 0.8 });
      list.push({ f: 2093, t: 1.0, d: 0.5, w: W.bell, g: 0.4 }, { f: 2637, t: 1.12, d: 0.5, w: W.bell, g: 0.35 });
      return tones(sr, D, list);
    } },
  lose: { n: 1, dur: 2.4, bus: 'ui', max: 1, pri: 9, vol: 0.8,
    gen: (sr, r, v, D) => {
      const list = [440, 392, 329.6, 220].map((f, i) => ({ f, t: i * 0.35, d: 0.45, w: (p) => W.brass(p) + 0.6 * Math.sin(p * 1.01), a: 0.02 }));
      list.push({ f: 110, t: 1.3, d: 1.1, w: W.brass, a: 0.05, g: 0.9 }, { f: 110 * 1.006, t: 1.3, d: 1.1, w: W.brass, a: 0.05, g: 0.7 });
      const l = lp1(sr, 900);
      return map(tones(sr, D, list), (x) => l(x));
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
  ui_start: { n: 1, dur: 1.0, bus: 'ui', max: 1, pri: 9, vol: 0.8,
    gen: (sr, r, v, D) => {
      const hp = lp1(sr, 2500);
      let p = 0, p2 = 0;
      return mk(sr, D, (t) => {
        const u = clamp(t / 0.55, 0, 1), pre = t < 0.55 ? u * u : 0, hit = t >= 0.55 ? t - 0.55 : -1;
        p += TAU * (150 + 550 * u * u) / sr;
        let s = (Math.sin(p) + 0.4 * Math.sin(2 * p)) * pre;
        if (hit >= 0) { p2 += TAU * (40 + 40 * ex(-hit * 20)) / sr; const x = r() * 2 - 1; s += Math.sin(p2) * ex(-hit / 0.2) * 1.2 + (x - hp(x)) * ex(-hit / 0.05) * 0.6; }
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
};

function* soundSteps(name, variant, sr) {
  const S = SOUNDS[name];
  const R = S.gen(sr, mulberry(fnv(name) + variant * 7919), variant, S.dur);
  const out = new Float32Array(R.n);
  yield* fill(R, sr, out);
  return (yield* finish([out], sr))[0];
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

const KEY_ROOTS = [33, 29, 36, 31, 33, 29, 31, 28];
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

function* leadStem(sr, r) {
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

export const STEMS = {
  m_drums: { scene: 'match', bpm: 104, ch: 1, vol: 0.85, lvl: (i) => clamp((i - 0.12) / 0.4, 0, 1), gen: drumStem },
  m_bass: { scene: 'match', bpm: 104, ch: 1, vol: 0.75, lvl: (i) => 0.35 + 0.65 * clamp(i / 0.4, 0, 1), gen: bassStem },
  m_pad: { scene: 'match', bpm: 104, ch: 2, vol: 0.5, lvl: () => 1, gen: (sr, r) => padStem(sr, r) },
  m_lead: { scene: 'match', bpm: 104, ch: 1, vol: 0.4, lvl: (i) => clamp((i - 0.6) / 0.3, 0, 1), gen: leadStem },
  u_pad: { scene: 'menu', bpm: 80, ch: 2, vol: 0.55, lvl: () => 1, gen: (sr, r) => padStem(sr, r, { bpm: 80, roots: MENU_ROOTS, qual: MENU_QUAL, att: 0.9, cut: 700 }) },
  u_arp: { scene: 'menu', bpm: 80, ch: 1, vol: 0.4, lvl: () => 1, gen: menuArpStem },
  u_bass: { scene: 'menu', bpm: 80, ch: 1, vol: 0.5, lvl: () => 1, gen: menuBassStem },
};

export function stemInfo(name, sr) { return { length: loopLen(STEMS[name].bpm, sr) }; }

export function renderStem(name, sr) {
  const it = STEMS[name].gen(sr, mulberry(fnv(name)));
  for (;;) { const s = it.next(); if (s.done) return { chans: s.value, sr }; }
}

// ---------- Event -> sound mapping (pure) ----------
export const SILENT_EVENTS = ['zoneEnd'];
// Skills whose sound comes from a companion event instead of the `skill` event itself.
export const SKILL_COMPANION = { rocket: 'fire', min: 'zone', truongcham: 'zone', vom: 'zone' };
const SKILL_SND = { giap: 'sk_shield', huc: 'sk_dash', diachan: 'sk_quake_wind', tangap: 'sk_buff', muahoa: 'fire_rocket', luot: 'sk_blink', tia: 'sk_beam_charge', hoiphuc: 'sk_heal' };

export function planEvent(e, m, me) {
  const out = [];
  const add = (s, x, z, own) => { if (SOUNDS[s]) out.push({ s, x, z, own: !!own }); };
  const unitPos = (id) => (m && m.units && m.units[id]) || null;
  switch (e.t) {
    case 'fire': add('fire_' + e.vis, e.x, e.z, e.id === me); break;
    case 'skill': add(SKILL_SND[e.skill], e.x, e.z, e.id === me); break;
    case 'impact':
      if (e.on === 'dome' || (e.on === 'wall' && e.vis === 'pulse')) add('hit_shield', e.x, e.z);
      else if (e.on === 'wall') add('hit_wall', e.x, e.z);
      if (e.splash > 0 && e.on !== 'dome') add('expl_small', e.x, e.z);
      break;
    case 'hit':
      add(e.absorbed > 0 && e.amt <= 0 ? 'hit_shield' : 'hit_metal', e.x, e.z, e.by === me || e.id === me);
      break;
    case 'heal': add('heal_tick', e.x, e.z, e.id === me); break;
    case 'death': add('death', e.x, e.z, e.id === me); break;
    case 'respawn': add('respawn', e.x, e.z, e.id === me); break;
    case 'explode':
      if (e.why === 'strike') add('expl_big', e.x, e.z);
      else if (e.why === 'barrel') add('expl_barrel', e.x, e.z);
      else if (e.why === 'mine') { add('sk_mine_zap', e.x, e.z); add('expl_small', e.x, e.z); }
      else add('expl_small', e.x, e.z);
      break;
    case 'nova': add('sk_quake_slam', e.x, e.z, e.id === me); break;
    case 'beam': add('sk_beam_fire', e.x0, e.z0, e.id === me); break;
    case 'ram': add('ram_clang', e.x, e.z, e.id === me); break;
    case 'shieldBreak': add('shield_break', e.x, e.z, e.id === me); break;
    case 'item': { const u = unitPos(e.id); add('sk_heal', u ? u.x : undefined, u ? u.z : undefined, e.id === me); break; }
    case 'zone': {
      if (e.kind === 'strike') add('sk_barrage_wind', e.x, e.z);
      else if (e.kind === 'mine') add('sk_mine_arm', e.x, e.z);
      else if (e.kind === 'dome') add('sk_dome', e.x, e.z);
      else if (e.kind === 'field') {
        const z = m && m.zones && m.zones.find((q) => q.id === e.id);
        if (z && z.vis === 'slow') add('sk_slow', e.x, e.z);
      }
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

const UI_MAP = { click: 'ui_click', hover: 'ui_hover', start: 'ui_start', countdown: 'ui_countdown', win: 'win', lose: 'lose', coin: 'ui_coin', levelup: 'ui_levelup', ready: 'ui_ready', deny: 'ui_deny', horn: 'horn' };
export const UI_NAMES = Object.keys(UI_MAP);

// ---------- Engine ----------
const METHODS = ['resume', 'setVolume', 'setMusic', 'mute', 'event', 'setListener', 'update', 'ui', 'setScene', 'stats'];
function noop() {
  const o = {};
  for (const k of METHODS) o[k] = () => (k === 'resume' ? Promise.resolve() : k === 'stats' ? { queued: 0, maxPumpMs: 0, noop: true } : undefined);
  return o;
}

const MAX_DIST = 32;
const POOL = 20;
const PRIORITY = ['fire_shell', ['fire_bullet', 3], 'fire_rail', 'fire_pulse', 'fire_rocket', ['hit_metal', 3], 'hit_wall', 'expl_small', 'ui_click'];

export async function makeAudio(G, onProgress) {
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if ((G && G.params && G.params.noaudio) || !AC) return noop();
  let ctx;
  try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { return noop(); }
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

  const bus = {}, duckers = {};
  for (const k of ['gun', 'world', 'ui', 'music']) bus[k] = ctx.createGain();
  bus.gun.connect(comp); bus.ui.connect(comp);
  for (const k of ['world', 'music']) { duckers[k] = ctx.createGain(); bus[k].connect(duckers[k]); duckers[k].connect(comp); }
  bus.music.gain.value = 0.55;

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
  const bufs = {};
  const stemBufs = {};
  const stats = { maxPumpMs: 0, maxStepMs: 0, slowest: '', queued: 0 };
  const queue = [];
  let scene = 'menu';
  const rankOf = (j) => (j.kind === 'stem' ? 2 + (STEMS[j.name].scene === scene ? 0 : 1) : j.prio ? 0 : 1);

  const putBuf = (name, v, data) => {
    const b = ctx.createBuffer(1, data.length, sr);
    b.copyToChannel(data, 0);
    bufs[name + '|' + v] = b;
  };
  const getBuf = (name, v) => {
    const k = name + '|' + v;
    if (!bufs[k]) putBuf(name, v, renderSound(name, v, sr));
    return bufs[k];
  };
  const jobs = [];
  const prioNames = new Set();
  for (const p of PRIORITY) { const [n, c] = Array.isArray(p) ? p : [p, 1]; for (let v = 0; v < c; v++) prioNames.add(n + '|' + v); }
  for (const name of Object.keys(SOUNDS)) {
    for (let v = 0; v < SOUNDS[name].n; v++) {
      const it = soundSteps(name, v, sr), key = name + '|' + v;
      jobs.push({ kind: 'sfx', name, v, prio: prioNames.has(key), step() {
        if (bufs[key]) return true;
        const s = it.next();
        if (s.done) putBuf(name, v, s.value);
        return s.done;
      } });
    }
  }
  for (const name of Object.keys(STEMS)) {
    const it = STEMS[name].gen(MUSIC_SR, mulberry(fnv(name)));
    jobs.push({ kind: 'stem', name, step() {
      const s = it.next();
      if (!s.done) return false;
      const chans = s.value, b = ctx.createBuffer(chans.length, chans[0].length, MUSIC_SR);
      chans.forEach((c, i) => b.copyToChannel(c, i));
      stemBufs[name] = b;
      return true;
    } });
  }
  queue.push(...jobs);
  queue.sort((a, b) => rankOf(a) - rankOf(b));
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

  stats.queued = queue.length;
  while (queue.length && queue[0].prio) {
    pump(6);
    if (onProgress) onProgress(1 - queue.filter((j) => j.prio).length / prioTotal);
    await new Promise((res) => nextFrame(res));
  }
  if (onProgress) onProgress(1);
  nextFrame(loop);

  // ----- voices -----
  const pools = { gun: [], world: [], ui: [] };
  const lastPlayed = {};
  const lastVariant = {};
  const lis = { x: 0, z: 0 };
  let muted = false, vol = 0.8;
  const now = () => ctx.currentTime;

  const kill = (v, fast) => {
    try { v.g.gain.setTargetAtTime(0, now(), 0.008); v.src.stop(now() + (fast ? 0.04 : 0)); } catch (e) { /* already stopped */ }
  };
  const duck = (depth) => {
    const t = now();
    for (const k of ['world', 'music']) {
      const g = duckers[k].gain;
      g.cancelScheduledValues(t);
      g.setTargetAtTime(1 - depth, t, 0.012);
      g.setTargetAtTime(1, t + 0.085, 0.1);
    }
  };

  function play(name, o) {
    const S = SOUNDS[name];
    if (!S || ctx.state !== 'running') return;
    let gain = S.vol, pan = 0, cutoff = 0, send = 0.05;
    if (o.x !== undefined && o.x !== null && !o.own) {
      const dx = o.x - lis.x, dz = o.z - lis.z, d = Math.hypot(dx, dz);
      if (d > MAX_DIST) return;
      gain *= 0.7 * (d < 3 ? 1 : Math.pow(1 - d / MAX_DIST, 1.6));
      pan = clamp(dx / 16, -1, 1) * 0.9;
      cutoff = 1800 + 14000 * ex(-d / 10);
      send = 0.2 + 0.4 * (d / MAX_DIST);
    } else if (o.own) gain *= 1.15;
    if (gain < 0.01) return;
    const t = performance.now() / 1000;
    if (S.gap && t - (lastPlayed[name] || 0) < S.gap) return;

    const pool = pools[S.bus];
    const same = pool.filter((v) => v.name === name);
    if (same.length >= S.max) {
      if (same[0].pri > S.pri) return;
      kill(same[0], true); pool.splice(pool.indexOf(same[0]), 1);
    }
    if (pool.length >= POOL) {
      let lo = pool[0];
      for (const v of pool) if (v.pri < lo.pri) lo = v;
      if (lo.pri > S.pri) return;
      kill(lo, true); pool.splice(pool.indexOf(lo), 1);
    }
    lastPlayed[name] = t;

    let v = 0;
    if (S.n > 1) { do { v = Math.floor(Math.random() * S.n); } while (v === lastVariant[name] && S.n > 1); lastVariant[name] = v; }
    const src = ctx.createBufferSource();
    src.buffer = getBuf(name, v);
    src.playbackRate.value = S.bus === 'ui' ? 1 : 1 + (Math.random() - 0.5) * 0.08;
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
    const voiceRec = { name, pri: S.pri + (o.own ? 1 : 0), src, g };
    pool.push(voiceRec);
    src.onended = () => { const i = pool.indexOf(voiceRec); if (i >= 0) pool.splice(i, 1); for (const n of nodes) { try { n.disconnect(); } catch (e) { /* gone */ } } };
    src.start();
    if (o.own && S.duck) duck(S.duck);
  }

  // ----- music -----
  const active = {};
  const epochs = {};
  let intensity = 0;
  function startStems() {
    if (ctx.state !== 'running') return;
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

  return {
    resume() { return ctx.resume().then(startStems); },
    setVolume(v) { vol = clamp(v, 0, 1); master.gain.value = muted ? 0 : vol; },
    setMusic(v) { bus.music.gain.value = clamp(v, 0, 1) * 0.7; },
    mute(b) { muted = !!b; master.gain.value = muted ? 0 : vol; },
    setListener(x, z) { lis.x = x; lis.z = z; },
    setScene(s) {
      if (s === scene) return;
      scene = s;
      queue.sort((a, b) => rankOf(a) - rankOf(b));
    },
    event(e, m, meId) {
      if (muted || ctx.state !== 'running') return;
      for (const p of planEvent(e, m, meId)) {
        if (p.global) { const t = performance.now(); if (t - (lastPlayed.__over || 0) < 4000) continue; lastPlayed.__over = t; play(p.s, {}); } else play(p.s, p);
      }
    },
    ui(name) {
      const s = UI_MAP[name];
      if (!s || muted) return;
      if (name === 'win' || name === 'lose') { const t = performance.now(); if (t - (lastPlayed.__over || 0) < 4000) return; lastPlayed.__over = t; }
      play(s, {});
    },
    update(dt, i) {
      intensity += (clamp(i || 0, 0, 1) - intensity) * (1 - ex(-dt / ((i || 0) > intensity ? 0.8 : 2.5)));
      if (queue.length) pump(2);
      startStems();
      const t = now();
      for (const name of Object.keys(active)) {
        const st = STEMS[name];
        active[name].g.gain.setTargetAtTime(st.scene === scene ? st.lvl(intensity) * st.vol : 0, t, 0.5);
      }
    },
    stats() { return { ...stats, queued: queue.length, state: ctx.state, rate: sr }; },
  };
}
