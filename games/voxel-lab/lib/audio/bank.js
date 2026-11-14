// Techniques studied from Voxel Engine by mattshumer (spawn.co), analysis/audio-physical.md; code is our own.
// Sound bank recipes (doc §4, §5, §7, §8, §9). Each recipe is a generator that yields between stages so a
// scheduler can slice the render into small tasks. Rendered once, deterministically (seed id*131+v*17+1).
import {
  makeRng, buf, white, pink, brown, lp1, hp1, bq, svfLP, shape, decay, burst, ring, modal, noiseBP,
  grains, pulses, sweepSine, sat, mix, finish, loopable,
} from './dsp.js';

const HI = 48000, LO = 24000;
const TAU = Math.PI * 2;

// def: id, variants, sr, tau (loudness decay hint for stealing), prio, generator
export const DEFS = [];
const def = (id, variants, sr, tau, prio, gen) => DEFS.push({ id, variants, sr, tau, prio, gen });

// ---- modal impacts per material class (doc §4.4) ----
def('imp_stone', 3, LO, 0.07, 1, function* (rng, v, sr) {
  const out = buf(0.36, sr);
  const exc = burst(sr, 0.03, rng.range(0.0025, 0.004), rng, 4500);
  modal(out, exc, sr, [
    rng.range(66, 92), rng.range(0.045, 0.06), 0.4, rng.range(128, 176), rng.range(0.028, 0.04), 0.45,
    rng.range(236, 320), rng.range(0.016, 0.024), 0.6, rng.range(540, 800), rng.range(0.007, 0.012), 1.5,
    rng.range(1100, 1650), rng.range(0.004, 0.007), 1.5, rng.range(2100, 3100), rng.range(0.0025, 0.004), 1.0]);
  yield;
  grains(out, sr, rng, { n: 7 + v, t0: 0, span: 0.07, skew: 1, fmin: 1400, fmax: 4500, tmin: 0.003, tmax: 0.01, gain: 0.05 });
  return out;
});

def('imp_wood', 3, LO, 0.1, 1, function* (rng, v, sr) {
  const out = buf(0.4, sr);
  const f0 = rng.pick([176, 208, 242, 290]) * rng.range(0.96, 1.04);
  const ratios = [1, rng.range(1.85, 2.1), 2.76, rng.range(3.6, 4.1), 5.2], amps = [1, 0.7, 0.6, 0.38, 0.22];
  const exc = burst(sr, 0.02, rng.range(0.003, 0.005), rng, 2800);
  const tau0 = rng.range(0.05, 0.07);
  for (let i = 0; i < 5; i++) ring(out, exc, sr, f0 * ratios[i], tau0 / Math.pow(ratios[i], 0.8), amps[i]);
  yield;
  noiseBP(out, sr, rng, 0, rng.range(2200, 3400), 1.2, 0.002, 0.9 * 0.12, 0.006);
  return out;
});

def('imp_metal', 3, HI, 0.45, 1, function* (rng, v, sr) {
  const out = buf(1.2, sr);
  const R = [1, 1.506, 2.08, 2.756, 3.42, 4.31, 5.404, 6.27, 7.61, 8.933, 10.6, 12.4];
  const f0 = rng.pick([392, 466, 554, 330]) * rng.range(0.97, 1.03);
  const exc = burst(sr, 0.012, 0.0012, rng);
  for (let i = 0; i < R.length; i++) {
    const f = f0 * R[i] * rng.range(0.985, 1.015);
    if (f > 11000) continue;
    const tau = 0.9 * rng.range(0.75, 1.25) * Math.pow(R[i], -0.55), amp = rng.range(0.5, 1) * Math.pow(R[i], -0.25);
    ring(out, exc, sr, f, tau, amp);
    if (rng() < 0.5) ring(out, exc, sr, f * (1 + rng.range(0.003, 0.012)), tau * rng.range(0.7, 1), amp * 0.6);
    yield;
  }
  noiseBP(out, sr, rng, 0, rng.range(2500, 4000), 0.9, 0.006, 1.6 * 0.12, 0.02);
  return out;
});

def('imp_glass', 2, HI, 0.06, 1.2, function* (rng, v, sr) {
  const out = buf(0.28, sr);
  const exc = burst(sr, 0.002, 0.0006, rng);
  for (let i = 0; i < 6; i++) {
    const f = rng.log(1700, 9000);
    ring(out, exc, sr, f, rng.range(0.02, 0.06) * Math.pow(2000 / f, 0.3), 1);
  }
  ring(out, burst(sr, 0.012, 0.004, rng, 2000), sr, rng.range(380, 520), 0.012, 0.5);
  mix(out, exc, 0.5);
  return out;
});

def('imp_soft', 2, LO, 0.05, 1, function* (rng, v, sr) {
  const out = buf(0.3, sr);
  const body = white(Math.round(0.2 * sr), rng);
  lp1(body, rng.range(400, 540), sr); lp1(body, rng.range(400, 540), sr);
  decay(body, sr, rng.range(0.022, 0.03), 0.001);
  mix(out, body, 3);
  ring(out, burst(sr, 0.01, 0.004, rng), sr, rng.range(60, 85), 0.05, 0.09);
  noiseBP(out, sr, rng, 0.01, rng.range(1200, 2500), 0.8, 0.03, 0.12, 0.1);
  return out;
});

def('imp_leaf', 2, LO, 0.1, 0.8, function* (rng, v, sr) {
  const out = buf(0.36, sr);
  grains(out, sr, rng, { n: 18 + ((rng() * 8) | 0), t0: 0, span: 0.3, skew: 1.2, fmin: 2500, fmax: 7500, tmin: 0.006, tmax: 0.018, gain: 0.05 });
  const w = white(out.length, rng); bq(w, 'bp', rng.range(3000, 4200), 1, sr);
  shape(w, sr, (t) => Math.min(1, t / 0.04) * Math.exp(-t / 0.11));
  mix(out, w, 0.4);
  return out;
});

def('imp_plaster', 2, LO, 0.03, 1, function* (rng, v, sr) {
  const out = buf(0.25, sr);
  const exc = burst(sr, 0.012, 0.0025, rng, 4000);
  modal(out, exc, sr, [rng.range(260, 420), rng.range(0.014, 0.02), 0.8, rng.range(640, 900), rng.range(0.008, 0.012), 1.2,
    rng.range(1500, 2300), rng.range(0.004, 0.006), 1.2]);
  let t = 0;
  for (let k = 0; k < 3; k++) { noiseBP(out, sr, rng, t, rng.range(2000, 5200), 1, 0.004, 0.2, 0.012); t += rng.range(0.002, 0.007); }
  return out;
});

// ---- break / tear / crack recipes (doc §5) ----
def('brk_stone', 3, LO, 0.25, 1.2, function* (rng, v, sr) {
  const out = buf(0.8, sr);
  const c = white(Math.round(0.02 * sr), rng); decay(c, sr, 0.006, 0.0003); hp1(c, 800, sr); mix(out, c, 1.2);
  ring(out, burst(sr, 0.02, 0.004, rng, 600), sr, rng.range(75, 115), 0.045, 0.8);
  yield;
  grains(out, sr, rng, { n: 44 + 5 * v, t0: 0.01, span: 0.62, skew: 1.8, fmin: 500, fmax: 3600, tmin: 0.004, tmax: 0.018, gain: 0.07 });
  grains(out, sr, rng, { n: 10, t0: 0.01, span: 0.5, skew: 1.5, fmin: 140, fmax: 420, tmin: 0.01, tmax: 0.03, gain: 0.08 });
  yield;
  const d = pink(out.length, rng); hp1(d, 3000, sr); shape(d, sr, (t) => Math.exp(-t / 0.16)); mix(out, d, 0.12);
  return out;
});

def('brk_wood', 3, LO, 0.2, 1.2, function* (rng, v, sr) {
  const out = buf(0.52, sr);
  let t = 0;
  const snap = (f, g) => {
    const e = burst(sr, 0.006, 0.0012, rng);
    const at = Math.round(t * sr);
    ring(out, e, sr, f, 0.02, g, at); ring(out, e, sr, f * rng.range(2.1, 2.8), 0.011, g * 0.7, at);
    ring(out, e, sr, f * rng.range(4.2, 5.4), 0.005, g * 0.5, at);
  };
  snap(rng.range(420, 600), 1.2);
  while (t < 0.42) { t += -Math.log(1 - rng() * 0.999) * 0.022; if (t < 0.42) snap(rng.range(420, 900), rng.range(0.3, 0.9)); }
  yield;
  const tear = white(Math.round(0.22 * sr), rng); bq(tear, 'bp', rng.range(1500, 2200), 1.2, sr);
  let gate = 0;
  for (let i = 0; i < tear.length; i++) { if (rng() < 0.004) gate = 1; gate *= 0.994; tear[i] *= gate; }
  mix(out, tear, 0.5, Math.round(0.02 * sr));
  return out;
});

def('brk_metal', 2, HI, 0.4, 1.2, function* (rng, v, sr) {
  const out = buf(0.8, sr);
  const dur = rng.range(0.26, 0.36), r0 = rng.range(80, 110), r1 = rng.range(210, 280);
  const exc = pulses(Math.round(dur * sr), sr, rng, (t) => r0 + (r1 - r0) * (t / dur), 0.05, (t) => Math.sin(Math.PI * Math.min(1, t / dur)));
  const freqs = [rng.range(900, 1200), rng.range(1500, 1900), rng.range(2400, 2900), rng.range(3200, 3800)];
  for (const f of freqs) ring(out, exc, sr, f, 0.02, 0.5);
  yield;
  const R = [1, 1.506, 2.756, 3.42, 5.404, 7.61, 8.933], f0 = rng.range(330, 470), e2 = burst(sr, 0.01, 0.0015, rng);
  for (const r of R) ring(out, e2, sr, f0 * r, 0.35 * Math.pow(r, -0.5), 0.9 * Math.pow(r, -0.25), Math.round(dur * 0.8 * sr));
  return out;
});

def('brk_glass', 3, HI, 0.3, 1.5, function* (rng, v, sr) {
  const out = buf(0.7, sr);
  const c = white(Math.round(0.02 * sr), rng); decay(c, sr, 0.005, 0.0002); mix(out, c, 1);
  const wash = white(Math.round(0.3 * sr), rng); hp1(wash, 3000, sr); decay(wash, sr, 0.05, 0.001); mix(out, wash, 0.25);
  yield;
  const n = 32 + ((rng() * 13) | 0);
  for (let k = 0; k < n; k++) {
    const t = 0.004 + 0.6 * Math.pow(rng(), 2), f = rng.log(3000, 11000);
    const e = burst(sr, 0.0015, 0.0005, rng), at = Math.round(t * sr);
    ring(out, e, sr, f, rng.range(0.01, 0.045) * Math.pow(4000 / f, 0.4), 0.8, at);
    ring(out, e, sr, f * rng.range(1.4, 2.6), rng.range(0.006, 0.02), 0.5, at);
  }
  return out;
});

def('tinkle', 2, HI, 0.4, 1.2, function* (rng, v, sr) {
  const out = buf(0.7, sr);
  const n = 14 + ((rng() * 9) | 0);
  for (let k = 0; k < n; k++) {
    const t = 0.62 * Math.pow(rng(), 1.4), f = rng.log(3000, 10000), e = burst(sr, 0.0015, 0.0005, rng), at = Math.round(t * sr);
    ring(out, e, sr, f, rng.range(0.01, 0.04), 0.8, at); ring(out, e, sr, f * rng.range(1.4, 2.6), 0.01, 0.4, at);
  }
  return out;
});

def('brk_soft', 2, LO, 0.15, 1, function* (rng, v, sr) {
  const out = buf(0.5, sr);
  const b = white(Math.round(0.3 * sr), rng); lp1(b, 450, sr); lp1(b, 450, sr); decay(b, sr, 0.07, 0.002); mix(out, b, 3);
  grains(out, sr, rng, { n: 26, t0: 0, span: 0.4, skew: 1.5, fmin: 250, fmax: 1600, tmin: 0.006, tmax: 0.02, gain: 0.05 });
  return out;
});

def('brk_plaster', 2, LO, 0.1, 1, function* (rng, v, sr) {
  const out = buf(0.4, sr);
  const n = 4 + ((rng() * 4) | 0);
  for (let k = 0; k < n; k++) noiseBP(out, sr, rng, k * rng.range(0.008, 0.04), rng.range(1800, 5000), 1, 0.005, 0.25, 0.015);
  const d = white(Math.round(0.3 * sr), rng); hp1(d, 2500, sr); decay(d, sr, 0.08, 0.003); mix(out, d, 0.1);
  return out;
});

def('crack_stone', 2, LO, 0.1, 1, function* (rng, v, sr) {
  const out = buf(0.3, sr);
  const e = white(Math.round(0.012 * sr), rng); decay(e, sr, 0.003, 0.0002); hp1(e, 600, sr);
  mix(out, e, 0.8); ring(out, e, sr, rng.range(110, 160), 0.05, 0.7); ring(out, e, sr, rng.range(900, 1500), 0.03, 0.7);
  return out;
});

def('crack_wood', 2, LO, 0.1, 1, function* (rng, v, sr) {
  const out = buf(0.3, sr);
  const t2 = rng.range(0.015, 0.04);
  for (const t of [0, t2]) {
    const e = burst(sr, 0.006, 0.0012, rng), at = Math.round(t * sr);
    ring(out, e, sr, rng.range(500, 900), 0.02, 1, at); ring(out, e, sr, rng.range(1400, 2400), 0.008, 0.6, at);
  }
  return out;
});

def('crack_metal', 2, HI, 0.3, 1, function* (rng, v, sr) {
  const out = buf(0.5, sr);
  const e = burst(sr, 0.004, 0.0008, rng);
  for (let k = 0; k < 4; k++) ring(out, e, sr, rng.range(1200, 6200), rng.range(0.1, 0.3), 0.7);
  return out;
});

def('tear', 2, LO, 0.3, 1.4, function* (rng, v, sr) {
  const out = buf(0.9, sr);
  const rip = brown(Math.round(0.8 * sr), rng, sr); bq(rip, 'bp', rng.range(260, 560), 1, sr);
  shape(rip, sr, (t) => { const s = Math.sin(Math.PI * Math.min(1, t / 0.8)); return s * s; });
  mix(out, rip, 1.5);
  let t = rng.range(0.05, 0.07), gap = t;
  for (let k = 0; k < 11 + ((rng() * 6) | 0); k++) {
    const e = burst(sr, 0.008, 0.0015, rng), at = Math.round(t * sr);
    ring(out, e, sr, rng.range(300, 900), 0.02, 0.9, at); ring(out, e, sr, rng.range(1200, 2400), 0.008, 0.5, at);
    gap = Math.max(0.012, gap * 0.82); t += gap;
  }
  return out;
});

def('rumble_hit', 2, LO, 0.45, 2, function* (rng, v, sr) {
  const n = Math.round(1.0 * sr);
  const s = sweepSine(n, sr, rng.range(78, 92), rng.range(42, 50), 0.16);
  shape(s, sr, (t) => Math.exp(-t / 0.3)); sat(s, 2.0);
  const p = pink(n, rng); lp1(p, 190, sr); shape(p, sr, (t) => Math.exp(-t / 0.25));
  const out = new Float32Array(n); mix(out, s, 1); mix(out, p, 1.5);
  grains(out, sr, rng, { n: 12, t0: 0, span: 0.6, skew: 1.5, fmin: 150, fmax: 900, tmin: 0.008, tmax: 0.03, gain: 0.05 });
  return out;
});

// ---- structural groans: stick-slip (doc §7) ----
def('creak_wood', 2, LO, 0.5, 1.1, function* (rng, v, sr) {
  const len = 1.4, n = Math.round(len * sr), out = buf(len, sr);
  const base = rng.range(34, 68), wob = rng.range(0.9, 1.8);
  const exc = pulses(n, sr, rng, (t) => base * (1 + 0.45 * Math.sin(TAU * wob * t) + t / len), 0.08, (t) => Math.sin(Math.PI * t / len));
  modal(out, exc, sr, [rng.range(420, 620), 0.006, 1, rng.range(900, 1300), 0.005, 0.7, rng.range(1700, 2300), 0.004, 0.5, rng.range(2900, 3500), 0.003, 0.3]);
  return out;
});

def('creak_metal', 2, LO, 0.6, 1.1, function* (rng, v, sr) {
  const len = 1.6, n = Math.round(len * sr), out = buf(len, sr);
  const base = rng.range(55, 95);
  const exc = pulses(n, sr, rng, (t) => base * (1 + 0.5 * Math.sin(TAU * 1.1 * t) + 0.3 * Math.sin(TAU * 2.7 * t)), 0.03, (t) => Math.sin(Math.PI * t / len));
  for (let k = 0; k < 6; k++) ring(out, exc, sr, rng.log(180, 2800), rng.range(0.05, 0.15), 1);
  return out;
});

def('creak_stone', 2, LO, 0.5, 1.1, function* (rng, v, sr) {
  const len = 1.4, n = Math.round(len * sr), out = brown(n, rng, sr);
  const c0 = rng.range(150, 240), w1 = rng.range(1.2, 2.6), w2 = rng.range(4, 7);
  svfLP(out, sr, (t) => c0 * (1 + 0.4 * Math.sin(TAU * w1 * t) + 0.2 * Math.sin(TAU * w2 * t)) + 150, 2.5);
  shape(out, sr, (t) => Math.sin(Math.PI * t / len));
  grains(out, sr, rng, { n: 7, t0: 0.1, span: 1.1, skew: 1, fmin: 300, fmax: 900, tmin: 0.004, tmax: 0.012, gain: 0.04 });
  return out;
});

// ---- explosion layers (doc §8.1) ----
def('exp_crack', 2, HI, 0.12, 4, function* (rng, v, sr) {
  const x = white(Math.round(0.45 * sr), rng);
  shape(x, sr, (t) => Math.min(1, t / 0.0003) * (0.7 * Math.exp(-t / 0.012) + 0.3 * Math.exp(-t / 0.09)));
  hp1(x, 150, sr); lp1(x, 5200, sr); return sat(x, 2.0);
});

def('exp_sub', 2, LO, 0.32, 4, function* (rng, v, sr) {
  const n = Math.round(1.3 * sr);
  const s = v ? sweepSine(n, sr, 110, 36, 0.09) : sweepSine(n, sr, 90, 30, 0.09);
  shape(s, sr, (t) => Math.exp(-t / 0.32)); return sat(s, 2.2);
});

def('exp_body', 2, LO, 0.7, 3.5, function* (rng, v, sr) {
  const n = Math.round(2.8 * sr);
  const b = brown(n, rng, sr);
  yield;
  const p = pink(n, rng);
  yield;
  for (let i = 0; i < n; i++) b[i] += 1.6 * p[i];
  hp1(b, 45, sr);
  yield;
  svfLP(b, sr, (t) => 220 + 2600 * Math.exp(-t / 0.5));
  yield;
  const f1 = rng.range(6, 9), f2 = rng.range(11, 14);
  shape(b, sr, (t) => (0.7 * Math.exp(-t / 0.35) + 0.3 * Math.exp(-t / 1.1)) * (1 + 0.22 * Math.sin(TAU * f1 * t)) * (1 + 0.13 * Math.sin(TAU * f2 * t)));
  yield;
  return sat(b, 1.5);
});

def('exp_far', 1, LO, 1.2, 3, function* (rng, v, sr) {
  const n = Math.round(3.6 * sr), p = pink(n, rng);
  yield;
  lp1(p, 160, sr); lp1(p, 160, sr); hp1(p, 38, sr);
  yield;
  shape(p, sr, (t) => Math.exp(-t / 1.2) * (1 + 0.3 * Math.sin(TAU * 4 * t)) * (1 + 0.2 * Math.sin(TAU * 6.5 * t)));
  return p;
});

def('exp_debris', 1, LO, 0.8, 2, function* (rng, v, sr) {
  const out = buf(2.4, sr);
  grains(out, sr, rng, { n: 60, t0: 0.25, span: 1.9, skew: 1.6, fmin: 300, fmax: 3600, tmin: 0.004, tmax: 0.02, gain: 0.07 });
  for (let k = 0; k < 8; k++) ring(out, burst(sr, 0.01, 0.003, rng, 800), sr, rng.range(80, 170), 0.05, 0.8, Math.round((0.25 + 1.9 * Math.pow(rng(), 1.6)) * sr));
  return out;
});

// ---- gun (doc §8.2) ----
def('gun', 2, HI, 0.15, 3, function* (rng, v, sr) {
  const n = Math.round(0.5 * sr), out = new Float32Array(n);
  const c = white(n, rng); shape(c, sr, (t) => Math.min(1, t / 0.0002) * Math.exp(-t / rng.range(0.003, 0.005)));
  const body = c.slice(); bq(body, 'lp', rng.range(3400, 4400), 0.7, sr);
  mix(out, c, 0.5); mix(out, body, 1);
  yield;
  const th = sweepSine(n, sr, rng.range(150, 175), 55, 0.03); shape(th, sr, (t) => Math.exp(-t / 0.05)); mix(out, th, 0.8);
  yield;
  const tail = white(n, rng); bq(tail, 'bp', 1200, 1, sr); shape(tail, sr, (t) => Math.exp(-t / 0.08)); mix(out, tail, 0.25);
  return sat(out, 3);
});

// ---- fire (doc §8.3) ----
def('ignite', 1, LO, 0.4, 1, function* (rng, v, sr) {
  const n = Math.round(0.9 * sr), p = pink(n, rng);
  svfLP(p, sr, (t) => 300 + 1200 * Math.sin(Math.PI * Math.min(1, t / 0.6)));
  shape(p, sr, (t) => Math.min(1, t / 0.08) * Math.exp(-t / 0.3));
  for (let k = 0; k < 20; k++) { const i = (rng() * n * 0.7) | 0, c = (rng() - 0.5) * 0.4 * Math.exp(-i / sr / 0.3); p[i] += c; p[Math.min(n - 1, i + 1)] -= c; }
  return p;
});

def('loop_fire', 1, LO, 99, 1, function* (rng, v, sr) {
  const ov = Math.round(0.4 * sr), n = Math.round(3.2 * sr) + ov;
  const roar = brown(n, rng, sr); lp1(roar, 650, sr);
  yield;
  const hiss = white(n, rng); bq(hiss, 'bp', 2800, 1, sr);
  yield;
  const out = new Float32Array(n);
  let tgt = 1, cur = 1;
  for (let i = 0; i < n; i++) {
    if (i % 4096 === 0) tgt = rng.range(0.45, 1.3);
    cur += 0.0006 * 4 * (tgt - cur);
    out[i] = roar[i] * 0.45 * cur + hiss[i] * 0.06;
  }
  yield;
  let t = 0;
  while (t < n / sr) {
    t += -Math.log(1 - rng() * 0.999) / 24;
    noiseBP(out, sr, rng, t, rng.range(1200, 6500), 1, 0.003, (0.3 + 2.2 * Math.pow(rng(), 3)) * 0.06, 0.01);
  }
  return loopable(out, ov);
});

def('loop_brown', 1, LO, 99, 1, function* (rng, v, sr) {
  const ov = Math.round(0.4 * sr);
  return loopable(brown(Math.round(2.4 * sr) + ov, rng, sr), ov);
});

// procedural stereo impulse response, outdoor (doc §9.1, one IR only: gap vs the two-IR design)
export function* renderIR(sr = LO) {
  const rng = makeRng(777), n = Math.round(1.1 * sr), pre = Math.round(0.012 * sr), ch = [];
  for (let c = 0; c < 2; c++) {
    const h = white(n, rng); hp1(h, 150, sr);
    const lo = h.slice(); lp1(lo, 900, sr); const hi = h.slice(); for (let i = 0; i < n; i++) hi[i] -= lo[i];
    yield;
    for (let i = 0; i < n; i++) {
      const t = i / sr, ramp = Math.min(1, t / 0.03);
      h[i] = (lo[i] * Math.exp(-t * Math.log(1000) / 1.35) + hi[i] * Math.exp(-t * Math.log(1000) / 0.6)) * ramp;
    }
    yield;
    const o = new Float32Array(n);
    for (let i = pre; i < n; i++) o[i] = h[i - pre];
    [[0.058, 0.5], [0.097, 0.42], [0.163, 0.3], [0.241, 0.2], [0.37, 0.1]].forEach(([t, g], k) => {
      const at = Math.round((t + (c ? 0.004 : 0)) * sr);
      for (let j = 0; j < Math.round(0.006 * sr) && at + j < n; j++) o[at + j] += (rng() * 2 - 1) * g * 0.25 * Math.exp(-j / (0.002 * sr));
    });
    let e = 0; for (let i = 0; i < n; i++) e += o[i] * o[i];
    const s = 1 / Math.sqrt(e);
    for (let i = 0; i < n; i++) o[i] *= s;
    ch.push(o);
    yield;
  }
  return ch;
}

// Render order: player-caused first (doc §9)
export const ORDER = ['imp_stone', 'brk_stone', 'crack_stone', 'exp_crack', 'exp_sub', 'exp_body', 'rumble_hit', 'gun',
  'imp_wood', 'imp_metal', 'imp_glass', 'imp_soft', 'imp_leaf', 'imp_plaster', 'brk_wood', 'brk_metal', 'brk_glass', 'tinkle',
  'brk_soft', 'brk_plaster', 'crack_wood', 'crack_metal', 'tear', 'creak_wood', 'creak_metal', 'creak_stone',
  'exp_far', 'exp_debris', 'ignite', 'loop_fire', 'loop_brown'];

// Render one variant (generator). Returns Float32Array via generator return.
export function* renderVariant(d, v) {
  const idx = DEFS.indexOf(d);
  const rng = makeRng(idx * 131 + v * 17 + 1);
  const raw = yield* d.gen(rng, v, d.sr);
  if (/^loop_/.test(d.id)) {
    let pk = 0;
    for (let i = 0; i < raw.length; i++) { const a = Math.abs(raw[i]); if (a > pk) pk = a; }
    const s = pk > 0 ? 0.9 / pk : 1;
    for (let i = 0; i < raw.length; i++) raw[i] *= s;
    return raw;
  }
  return finish(raw, d.sr);
}
