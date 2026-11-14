// Techniques studied from Voxel Engine by mattshumer (spawn.co), analysis/audio-physical.md; code is our own.
// Tiny deterministic DSP kit on Float32Array (doc §4, §13 step 2). No Web Audio here.

export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  const r = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  r.range = (a, b) => a + (b - a) * r();
  r.log = (a, b) => a * Math.pow(b / a, r()); // ratio-scale uniform
  r.pick = (arr) => arr[(r() * arr.length) | 0];
  return r;
}

export const buf = (sec, sr) => new Float32Array(Math.max(1, Math.round(sec * sr)));

export function white(n, rng) {
  const o = new Float32Array(n);
  for (let i = 0; i < n; i++) o[i] = rng() * 2 - 1;
  return o;
}

export function pink(n, rng) { // Kellet economy filter
  const o = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = rng() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.0990460;
    b1 = 0.96300 * b1 + w * 0.2965164;
    b2 = 0.57000 * b2 + w * 1.0526913;
    o[i] = (b0 + b1 + b2 + w * 0.1848) * 0.25;
  }
  return o;
}

export function brown(n, rng, sr) { // leaky integrator, rolled off under ~30 Hz (no infrasound)
  const o = new Float32Array(n);
  const leak = Math.exp(-2 * Math.PI * 25 / sr);
  let y = 0;
  for (let i = 0; i < n; i++) { y = y * leak + (rng() * 2 - 1) * 0.1; o[i] = y * 3; }
  return hp1(o, 30, sr);
}

export function lp1(x, fc, sr) {
  const a = 1 - Math.exp(-2 * Math.PI * fc / sr);
  let y = 0;
  for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); x[i] = y; }
  return x;
}

export function hp1(x, fc, sr) {
  const a = Math.exp(-2 * Math.PI * fc / sr);
  let px = 0, py = 0;
  for (let i = 0; i < x.length; i++) { const v = x[i]; py = a * (py + v - px); px = v; x[i] = py; }
  return x;
}

// RBJ biquad, in place. type: 'lp' | 'hp' | 'bp'
export function bq(x, type, f, q, sr) {
  const w = 2 * Math.PI * Math.min(f, sr * 0.45) / sr, c = Math.cos(w), al = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
  else { b0 = al; b1 = 0; b2 = -al; }
  const a0 = 1 + al, a1 = -2 * c / a0, a2 = (1 - al) / a0;
  b0 /= a0; b1 /= a0; b2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i], y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y;
  }
  return x;
}

// state-variable low-pass, cutoff function of time re-evaluated every 32 samples
export function svfLP(x, sr, fcFn, q = 0.7) {
  let lo = 0, bd = 0, f = 0;
  const damp = 1 / q;
  for (let i = 0; i < x.length; i++) {
    if ((i & 31) === 0) f = 2 * Math.sin(Math.PI * Math.min(fcFn(i / sr), sr / 6) / sr);
    lo += f * bd;
    const hi = x[i] - lo - damp * bd;
    bd += f * hi;
    x[i] = lo;
  }
  return x;
}

export function shape(x, sr, fn) { for (let i = 0; i < x.length; i++) x[i] *= fn(i / sr); return x; }

// exp envelope with raised-cosine attack
export function decay(x, sr, tau, attack = 0.0003) {
  const na = Math.max(1, Math.round(attack * sr));
  for (let i = 0; i < x.length; i++) {
    const a = i < na ? 0.5 - 0.5 * Math.cos(Math.PI * i / na) : 1;
    x[i] *= a * Math.exp(-i / (tau * sr));
  }
  return x;
}

// contact burst: decaying white noise, optionally low-passed twice (contact time)
export function burst(sr, len, tau, rng, lp) {
  const x = white(Math.max(2, Math.round(len * sr)), rng);
  decay(x, sr, tau, 0.0002);
  if (lp) { lp1(x, lp, sr); lp1(x, lp, sr); }
  return x;
}

// one decaying two-pole resonant mode added into out at sample offset `at`
export function ring(out, exc, sr, f, tau, amp, at = 0, gain = 1) {
  const w = 2 * Math.PI * f / sr;
  if (!(w < 2.8) || !(tau > 0) || at >= out.length) return;
  const r = Math.exp(-1 / (tau * sr)), a1 = 2 * r * Math.cos(w), a2 = -r * r, g = amp * gain * Math.sin(w);
  const n = Math.min(out.length - at, exc.length + Math.ceil(11.5 * tau * sr));
  let y1 = 0, y2 = 0;
  for (let i = 0; i < n; i++) {
    const y = a1 * y1 + a2 * y2 + (i < exc.length ? g * exc[i] : 0);
    y2 = y1; y1 = y; out[at + i] += y;
  }
}

export function modal(out, exc, sr, modes, at = 0, gain = 1) {
  for (let i = 0; i + 2 < modes.length; i += 3) ring(out, exc, sr, modes[i], modes[i + 1], modes[i + 2], at, gain);
}

// short band-passed decaying noise burst added at time t0 (grain / tick / crack primitive)
export function noiseBP(out, sr, rng, t0, f, q, tau, amp, len) {
  const at = Math.round(t0 * sr);
  const n = Math.min(Math.round((len || 5 * tau) * sr), out.length - at);
  if (n < 4 || at < 0) return;
  const w = 2 * Math.PI * Math.min(f, sr * 0.45) / sr, al = Math.sin(w) / (2 * q), a0 = 1 + al;
  const b0 = al / a0, a1 = -2 * Math.cos(w) / a0, a2 = (1 - al) / a0;
  const na = Math.max(2, Math.round(0.0004 * sr));
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < n; i++) {
    const env = (i < na ? i / na : 1) * Math.exp(-i / (tau * sr));
    const v = (rng() * 2 - 1) * env;
    const y = b0 * (v - x2) - a1 * y1 - a2 * y2;
    x2 = x1; x1 = v; y2 = y1; y1 = y;
    out[at + i] += y * amp;
  }
}

// granular cloud: grains at t0 + span*u^skew
export function grains(out, sr, rng, o) {
  for (let k = 0; k < o.n; k++) {
    const u = rng(), a = rng();
    const t = o.t0 + o.span * Math.pow(u, o.skew || 1);
    const amp = o.gain * (0.25 + 0.75 * a * a) * (1 - (o.fall || 0) * u) * 3;
    noiseBP(out, sr, rng, t, rng.log(o.fmin, o.fmax), 1.4, rng.log(o.tmin, o.tmax), amp);
  }
}

// irregular stick-slip pulse train; rateFn(t) in Hz
export function pulses(n, sr, rng, rateFn, jitter, envFn) {
  const o = new Float32Array(n);
  let t = 0;
  while (t < n / sr) {
    const i = Math.round(t * sr);
    const amp = (0.6 + 0.4 * rng()) * (envFn ? envFn(t) : 1);
    if (i > 0 && i + 1 < n) { o[i - 1] += 0.5 * amp; o[i] += amp; o[i + 1] += 0.5 * amp; }
    t += (1 / Math.max(5, rateFn(t))) * (1 + jitter * (rng() * 2 - 1));
  }
  return o;
}

export function sweepSine(n, sr, f0, f1, tauGlide) { // exponentially gliding sine
  const o = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const f = f1 + (f0 - f1) * Math.exp(-i / (tauGlide * sr));
    ph += 2 * Math.PI * f / sr; o[i] = Math.sin(ph);
  }
  return o;
}

export function sat(x, drive) {
  const nrm = 1 / Math.tanh(drive);
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(drive * x[i]) * nrm;
  return x;
}

export function mix(dst, src, gain = 1, at = 0) {
  const n = Math.min(src.length, dst.length - at);
  for (let i = 0; i < n; i++) dst[at + i] += src[i] * gain;
}

// trim tail <0.15% of peak, 4 ms pad, 12 ms fade, normalise to 0.9
export function finish(x, sr, peakTo = 0.9) {
  let pk = 0;
  for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > pk) pk = a; }
  if (!(pk > 0)) return new Float32Array(Math.round(0.01 * sr));
  const thr = pk * 0.0015;
  let last = x.length - 1;
  while (last > 0 && Math.abs(x[last]) < thr) last--;
  const len = Math.min(x.length, last + 1 + Math.round(0.004 * sr));
  const o = x.slice(0, len), nf = Math.min(len, Math.round(0.012 * sr)), s = peakTo / pk;
  for (let i = 0; i < len; i++) o[i] *= s;
  for (let i = 0; i < nf; i++) o[len - 1 - i] *= i / nf;
  return o;
}

// equal-power crossfade of the overhang into the head -> seamless loop
export function loopable(x, ov) {
  const n = x.length - ov, o = x.slice(0, n);
  for (let i = 0; i < ov; i++) {
    const t = (i + 0.5) / ov;
    o[i] = o[i] * Math.sin(t * Math.PI / 2) + x[n + i] * Math.cos(t * Math.PI / 2);
  }
  return o;
}
