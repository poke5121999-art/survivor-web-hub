// Pháo Mây audio: every sound is synthesized into Float32Arrays from seeded noise and oscillators,
// then played through a WebAudio mixer. Generation needs no AudioContext, so diag() runs headless.
(function () {
  'use strict';
  const PM = (globalThis.PM = globalThis.PM || {});
  const TAU = Math.PI * 2;
  const SR = 32000;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  function noise(n, rng) { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = rng() * 2 - 1; return o; }
  function lp(x, fc, sr) {
    const a = 1 - Math.exp(-TAU * fc / sr); let y = 0;
    for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); x[i] = y; }
    return x;
  }
  function hp(x, fc, sr) {
    const a = 1 - Math.exp(-TAU * fc / sr); let y = 0;
    for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); x[i] -= y; }
    return x;
  }
  function svf(x, sr, fcOf, q, mode) {
    const o = new Float32Array(x.length), k = 1 / q, top = sr * 0.22;
    let lo = 0, bd = 0;
    for (let i = 0; i < x.length; i++) {
      const f = Math.min(1.2, 2 * Math.sin(Math.PI * Math.min(fcOf(i / sr), top) / sr));
      const h = x[i] - lo - k * bd;
      bd += f * h; lo += f * bd;
      o[i] = mode === 'lp' ? lo : mode === 'hp' ? h : bd * k;
    }
    return o;
  }
  function nrm(x, g) {
    let m = 0;
    for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > m) m = a; }
    if (m > 0) { const s = g / m; for (let i = 0; i < x.length; i++) x[i] *= s; }
    return x;
  }
  function env(x, sr, att, tau, hold) {
    const h = hold || 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      x[i] *= (att > 0 ? Math.min(1, t / att) : 1) * (t > h ? Math.exp(-(t - h) / tau) : 1);
    }
    return x;
  }
  // shape: 0 sine, 1 triangle, 2 soft saw (three integer harmonics, so loops stay seamless). fmR/fmD: phase modulation.
  function tone(n, sr, fOf, shape, fmR, fmD) {
    const o = new Float32Array(n); let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr; ph += TAU * fOf(t) / sr;
      const p = fmR ? ph + fmD(t) * Math.sin(ph * fmR) : ph;
      o[i] = shape === 1 ? (2 / Math.PI) * Math.asin(Math.sin(p)) : shape === 2 ? (Math.sin(p) + 0.5 * Math.sin(2 * p) + 0.33 * Math.sin(3 * p)) * 0.6 : Math.sin(p);
    }
    return o;
  }
  const sw = (f0, f1, k) => (t) => f1 + (f0 - f1) * Math.exp(-t / k);
  const flat = (f) => () => f;
  function at(dst, src, sr, off, g) {
    const s = Math.floor(off * sr);
    for (let i = 0; i < src.length && s + i < dst.length; i++) dst[s + i] += src[i] * g;
  }
  function thump(n, sr, f0, f1, k, tau, g) { return nrm(env(tone(n, sr, sw(f0, f1, k), 0), sr, 0.002, tau), g); }
  function crack(n, sr, rng, fc, tau, g) { return nrm(env(hp(noise(n, rng), fc, sr), sr, 0.0004, tau), g); }
  function rumble(n, sr, rng, fc, att, tau, g) { return nrm(env(lp(noise(n, rng), fc, sr), sr, att, tau), g); }
  function bell(n, sr, f, tau, g, inharm) {
    const o = new Float32Array(n), r = inharm || [1, 2.76, 5.4], a = [1, 0.45, 0.18];
    for (let j = 0; j < r.length; j++) {
      const w = TAU * f * r[j] / sr, tj = tau / (1 + j * 0.9);
      for (let i = 0; i < n; i++) o[i] += a[j] * Math.sin(w * i) * Math.exp(-i / sr / tj);
    }
    for (let i = 0; i < Math.min(n, 40); i++) o[i] *= i / 40;
    return nrm(o, g);
  }
  function notes(sr, total, list, voice) {
    const out = new Float32Array(Math.floor(total * sr));
    for (const [f, t0, len, g, tau] of list) {
      const n = Math.min(out.length - Math.floor(t0 * sr), Math.floor(len * sr));
      if (n <= 0) continue;
      const x = voice === 'bell' ? bell(n, sr, f, tau, g) : nrm(env(tone(n, sr, flat(f), voice === 'tri' ? 1 : 0), sr, 0.006, tau), g);
      at(out, x, sr, t0, 1);
    }
    return out;
  }
  function gate(x, rng, hold, lowGain) {
    let g = 1, c = 0;
    for (let i = 0; i < x.length; i++) {
      if (c-- <= 0) { g = rng() < 0.28 ? 1 : lowGain; c = hold + Math.floor(rng() * hold); }
      x[i] *= g;
    }
    return x;
  }

  function fireBase(f0, f1, crackFc, bodyTau, boomFc, scale) {
    return (sr, rng, row) => {
      const n = Math.floor(sr * row.dur), j = 1 + (rng() - 0.5) * 0.08, o = new Float32Array(n);
      at(o, thump(n, sr, f0 * j, f1, 0.06, bodyTau, 1), sr, 0, 0.9);
      at(o, crack(n, sr, rng, crackFc, 0.012, 1), sr, 0, 0.55);
      at(o, rumble(n, sr, rng, boomFc, 0.004, bodyTau * 0.9, 1), sr, 0, 0.7);
      if (scale > 1) at(o, thump(n, sr, f0 * 0.7, f1 * 0.8, 0.09, bodyTau * 1.4, 1), sr, 0.05, 0.5);
      return o;
    };
  }
  function genNay(sr, rng, row) {
    const n = Math.floor(sr * row.dur), o = fireBase(140, 48, 1800, 0.14, 280, 1)(sr, rng, row), v = 12 * (0.8 + rng() * 0.4);
    const tw = tone(n, sr, (t) => 430 + 90 * Math.exp(-t / 0.1) + v * Math.sin(TAU * 38 * t), 1, 2.76, (t) => 1.6 * Math.exp(-t / 0.15));
    at(o, nrm(env(tw, sr, 0.003, 0.22), 1), sr, 0.012, 0.42);
    return o;
  }
  function genMuacoc(sr, rng, row) {
    const n = Math.floor(sr * row.dur), o = fireBase(120, 34, 1500, 0.3, 240, 2)(sr, rng, row);
    const rate = 21 + rng() * 4;
    const gr = tone(n, sr, (t) => 78 * (1 - 0.35 * Math.min(1, t / 0.6)) * (1 + 0.25 * Math.sin(TAU * 7 * t)), 0, 1.5, (t) => 3.2 * Math.exp(-t / 0.35));
    for (let i = 0; i < n; i++) { const t = i / sr, p = Math.sin(Math.PI * rate * t); gr[i] *= p * p; }
    lp(gr, 900, sr);
    at(o, nrm(env(gr, sr, 0.02, 0.35, 0.15), 1), sr, 0.04, 0.8);
    return o;
  }
  function genKim(sr, rng, row) {
    const n = Math.floor(sr * row.dur), o = new Float32Array(n);
    at(o, crack(n, sr, rng, 2500, 0.02, 1), sr, 0, 0.8);
    at(o, nrm(env(svf(noise(n, rng), sr, flat(4200), 3, 'bp'), sr, 0.0003, 0.02), 1), sr, 0, 0.4);
    at(o, thump(n, sr, 118, 58, 0.04, 0.09, 1), sr, 0, 0.45);
    at(o, nrm(env(tone(n, sr, sw(2700, 1500, 0.25), 0), sr, 0.012, 0.22), 1), sr, 0.01, 0.22);
    return o;
  }
  function genCheba(sr, rng, row) {
    const n = Math.floor(sr * row.dur), o = new Float32Array(n);
    for (let k = 0; k < 3; k++) {
      const t0 = k * 0.075, j = 1 + (rng() - 0.5) * 0.2;
      at(o, crack(n, sr, rng, 2200 * j, 0.016, 1), sr, t0, 0.7);
      at(o, thump(n, sr, 135 * j, 68, 0.04, 0.07, 1), sr, t0, 0.55);
    }
    at(o, rumble(n, sr, rng, 260, 0.005, 0.12, 1), sr, 0.15, 0.4);
    return o;
  }
  function genFireTele(sr, rng, row) {
    const n = Math.floor(sr * row.dur), o = new Float32Array(n);
    at(o, nrm(env(svf(noise(n, rng), sr, (t) => 700 + 3000 * Math.min(1, t / 0.5), 2.2, 'bp'), sr, 0.14, 0.18), 1), sr, 0, 0.8);
    for (const f of [900, 1350, 1810]) {
      const sh = tone(n, sr, flat(f * (1 + (rng() - 0.5) * 0.01)), 0);
      for (let i = 0; i < n; i++) sh[i] *= 0.6 + 0.4 * Math.sin(TAU * (6 + rng() * 0.01) * i / sr);
      at(o, nrm(env(sh, sr, 0.1, 0.2), 1), sr, 0, 0.18);
    }
    return o;
  }
  function genBeam(sr, rng, row) {
    const n = Math.floor(sr * row.dur), o = new Float32Array(n), hold = Math.floor(sr * 0.0008);
    const z = svf(gate(noise(n, rng), rng, hold, 0.12), sr, (t) => 600 + 3600 * Math.exp(-t / 0.35), 5, 'bp');
    at(o, nrm(env(z, sr, 0.008, 0.45, 0.3), 1), sr, 0, 0.8);
    const bz = tone(n, sr, flat(60), 2); for (let i = 0; i < n; i++) bz[i] *= 0.7 + 0.3 * Math.sin(TAU * 120 * i / sr);
    at(o, nrm(env(bz, sr, 0.01, 0.4, 0.3), 1), sr, 0, 0.3);
    at(o, thump(n, sr, 85, 38, 0.08, 0.22, 1), sr, 0, 0.7);
    return o;
  }
  const BOOM_S = [0.7, 1, 1.35];
  function genBoom(sr, rng, row) {
    const n = Math.floor(sr * row.dur), s = BOOM_S[row.sz], o = new Float32Array(n);
    at(o, crack(n, sr, rng, 1200, 0.02 * s, 1), sr, 0, 0.6);
    at(o, thump(n, sr, 115 / s, 30, 0.09 * s, 0.35 * s, 1), sr, 0, 1);
    at(o, rumble(n, sr, rng, 200 + 80 / s, 0.02, 0.5 * s, 1), sr, 0, 0.8);
    const grains = Math.floor(18 * s);
    for (let i = 0; i < grains; i++) {
      const t0 = 0.1 + rng() * 0.6, len = Math.floor(sr * (0.008 + rng() * 0.017));
      const gx = lp(hp(noise(len, rng), 1200 + rng() * 800, sr), 3500 + rng() * 2500, sr);
      at(o, nrm(env(gx, sr, 0.001, 0.008), 1), sr, t0, (0.15 + rng() * 0.25) * (1 - (t0 - 0.1) / 0.8));
    }
    return o;
  }
  function genBounce(sr, rng, row) {
    const n = Math.floor(sr * row.dur), o = new Float32Array(n), j = 1 + (rng() - 0.5) * 0.12;
    at(o, nrm(env(tone(n, sr, flat(220 * j), 1, 2.3, (t) => 1.2 * Math.exp(-t / 0.1)), sr, 0.001, 0.12), 1), sr, 0, 0.7);
    [[310, 0.09], [740, 0.06], [1190, 0.04]].forEach(([f, tau]) => at(o, nrm(env(tone(n, sr, flat(f * j), 0), sr, 0.0008, tau), 1), sr, 0, 0.3));
    at(o, thump(n, sr, 95, 55, 0.04, 0.09, 1), sr, 0, 0.6);
    at(o, crack(n, sr, rng, 2500, 0.006, 1), sr, 0, 0.3);
    return o;
  }
  function genSplit(sr, rng, row) {
    const n = Math.floor(sr * row.dur), o = new Float32Array(n);
    at(o, thump(n, sr, 650, 200, 0.02, 0.05, 1), sr, 0, 0.7);
    at(o, crack(n, sr, rng, 1800, 0.012, 1), sr, 0, 0.5);
    const fl = svf(noise(n, rng), sr, (t) => 2500 - 800 * t, 3, 'bp');
    for (let i = 0; i < n; i++) fl[i] *= 0.5 + 0.5 * Math.sin(TAU * 28 * i / sr);
    at(o, nrm(env(fl, sr, 0.01, 0.12, 0.05), 1), sr, 0.03, 0.45);
    return o;
  }
  function genSplash(sr, rng, row) {
    const n = Math.floor(sr * row.dur), o = new Float32Array(n);
    at(o, rumble(n, sr, rng, 520, 0.05, 0.2, 1), sr, 0, 0.8);
    at(o, thump(n, sr, 95, 50, 0.1, 0.2, 1), sr, 0.02, 0.4);
    at(o, nrm(env(hp(noise(n, rng), 3000, sr), sr, 0.08, 0.22), 1), sr, 0, 0.14);
    return o;
  }
  function genLand(sr, rng, row) {
    const n = Math.floor(sr * row.dur), o = new Float32Array(n);
    at(o, thump(n, sr, 105, 45, 0.05, 0.12, 1), sr, 0, 1);
    at(o, rumble(n, sr, rng, 250, 0.002, 0.06, 1), sr, 0, 0.5);
    return o;
  }
  function genHit(sr, rng, row) {
    const n = Math.floor(sr * row.dur), o = new Float32Array(n), j = 1 + (rng() - 0.5) * 0.15;
    at(o, crack(n, sr, rng, 2000, 0.01, 1), sr, 0, 0.6);
    [[480, 0.08, 0.6], [1130, 0.05, 0.4], [1870, 0.03, 0.3]].forEach(([f, tau, g]) => at(o, nrm(env(tone(n, sr, flat(f * j), 0), sr, 0.0005, tau), 1), sr, 0, g));
    at(o, thump(n, sr, 200, 120, 0.03, 0.06, 1), sr, 0, 0.5);
    return o;
  }
  function genShieldPing(sr, rng, row) {
    const n = Math.floor(sr * row.dur), o = new Float32Array(n), j = 1 + (rng() - 0.5) * 0.04;
    [[1760, 0.5, 0.7], [2637 * 1.003, 0.4, 0.45], [3520 * 0.997, 0.3, 0.3], [4180, 0.2, 0.15]].forEach(([f, tau, g]) => at(o, nrm(env(tone(n, sr, flat(f * j), 0), sr, 0.0008, tau), 1), sr, 0, g));
    at(o, crack(n, sr, rng, 4000, 0.004, 1), sr, 0, 0.25);
    return o;
  }
  function genDie(sr, rng, row) {
    const n = Math.floor(sr * row.dur), o = new Float32Array(n);
    const gr = tone(n, sr, (t) => 35 + 150 * Math.exp(-t / 0.9) + 6 * Math.sin(TAU * 5 * t), 2, 1.5, (t) => 1.5 * Math.exp(-t / 0.8));
    lp(gr, 700, sr);
    at(o, nrm(env(gr, sr, 0.02, 0.9), 1), sr, 0, 0.8);
    at(o, thump(n, sr, 90, 28, 0.2, 0.5, 1), sr, 0.02, 0.6);
    at(o, nrm(env(svf(noise(n, rng), sr, flat(900), 1.5, 'bp'), sr, 0.002, 0.07), 1), sr, 0.02, 0.6);
    for (let i = 0; i < 7; i++) {
      const len = Math.floor(sr * (0.01 + rng() * 0.02)), t0 = 0.12 + rng() * 0.6;
      at(o, nrm(env(lp(hp(noise(len, rng), 700, sr), 4000, sr), sr, 0.001, 0.01), 1), sr, t0, 0.25 * (1 - t0 / 1.2));
    }
    at(o, nrm(env(tone(n, sr, flat(340), 0), sr, 0.001, 0.12), 1), sr, 0.4, 0.15);
    return o;
  }
  function genDieSea(sr, rng, row) {
    const n = Math.floor(sr * row.dur);
    return nrm(env(tone(n, sr, sw(1900, 280, 0.7), 0, 1.4, () => 0.6), sr, 0.05, 0.6, 0.15), 1);
  }
  const chime = (freqs, step, tau, voice) => (sr, rng, row) => notes(sr, row.dur, freqs.map((f, i) => [f, i * step, row.dur - i * step, 0.8, tau]), voice || 'sine');
  function genItemBoost(sr, rng, row) {
    const n = Math.floor(sr * row.dur);
    return nrm(env(tone(n, sr, (t) => 380 + 900 * Math.min(1, t / 0.18), 1), sr, 0.01, 0.1, 0.1), 1);
  }
  function genItemShield(sr, rng, row) {
    const n = Math.floor(sr * row.dur), o = new Float32Array(n);
    at(o, nrm(env(tone(n, sr, flat(1320), 0), sr, 0.001, 0.2), 1), sr, 0, 0.7);
    at(o, nrm(env(tone(n, sr, flat(1980.5), 0), sr, 0.001, 0.14), 1), sr, 0, 0.35);
    at(o, nrm(env(tone(n, sr, flat(220), 1), sr, 0.02, 0.15), 1), sr, 0, 0.3);
    return o;
  }
  function genItemCalm(sr, rng, row) {
    const n = Math.floor(sr * row.dur);
    return nrm(env(tone(n, sr, sw(466, 330, 0.12), 0), sr, 0.02, 0.15, 0.05), 1);
  }
  function genSparkle(sr, rng, row) {
    const n = Math.floor(sr * row.dur), o = new Float32Array(n), cnt = row.sparks;
    for (let i = 0; i < cnt; i++) {
      const len = Math.floor(sr * 0.14), t0 = rng() * row.dur * 0.55;
      at(o, nrm(env(tone(len, sr, flat(1200 + rng() * 2800), 0), sr, 0.002, 0.04), 1), sr, t0, 0.3 + rng() * 0.4);
    }
    if (row.rise) at(o, nrm(env(tone(n, sr, (t) => 300 + 1200 * Math.min(1, t / 0.35), 0), sr, 0.04, 0.15, 0.1), 1), sr, 0, 0.35);
    return o;
  }
  function genTick(sr, rng, row) {
    const n = Math.floor(sr * row.dur), o = new Float32Array(n);
    at(o, crack(n, sr, rng, 3000, 0.004, 1), sr, 0, 0.5);
    at(o, nrm(env(tone(n, sr, flat(1800), 0), sr, 0.0005, 0.012), 1), sr, 0, 0.6);
    return o;
  }
  function genBlip(f0, f1, tau) {
    return (sr, rng, row) => nrm(env(tone(Math.floor(sr * row.dur), sr, sw(f0, f1, tau * 0.6), 0), sr, 0.003, tau), 1);
  }
  function genClick(sr, rng, row) {
    const n = Math.floor(sr * row.dur), o = new Float32Array(n);
    at(o, nrm(env(tone(n, sr, sw(900, 600, 0.015), 0), sr, 0.0008, 0.02), 1), sr, 0, 0.8);
    at(o, crack(n, sr, rng, 3000, 0.004, 1), sr, 0, 0.3);
    return o;
  }
  function genDeny(sr, rng, row) {
    const n = Math.floor(sr * row.dur), o = new Float32Array(n);
    for (let k = 0; k < 2; k++) at(o, nrm(env(lp(tone(n, sr, flat(k ? 135 : 160), 2), 900, sr), sr, 0.004, 0.05), 1), sr, k * 0.1, 0.8);
    return o;
  }
  function genBuy(sr, rng, row) {
    const n = Math.floor(sr * row.dur), o = new Float32Array(n);
    at(o, bell(n, sr, 1568, 0.25, 1, [1, 1.5, 2.01]), sr, 0, 0.8);
    at(o, bell(n, sr, 2093, 0.4, 1, [1, 1.5, 2.01]), sr, 0.07, 0.8);
    at(o, crack(n, sr, rng, 5000, 0.015, 1), sr, 0, 0.15);
    return o;
  }
  function genStep(sr, rng, row) {
    const n = Math.floor(sr * row.dur), o = new Float32Array(n), j = 1 + (rng() - 0.5) * 0.2;
    at(o, thump(n, sr, 125 * j, 70, 0.04, 0.07, 1), sr, 0, 0.9);
    at(o, crack(n, sr, rng, 1500, 0.01, 1), sr, 0.005, 0.4);
    at(o, nrm(env(lp(tone(n, sr, sw(420 * j, 260, 0.08), 2), 1800, sr), sr, 0.01, 0.08), 1), sr, 0.01, 0.3);
    return o;
  }
  function genOverWin(sr, rng, row) {
    const seq = [[523, 0], [659, 0.18], [784, 0.36], [1047, 0.6], [880, 0.95], [1047, 1.15]];
    const l = seq.map(([f, t]) => [f, t, 0.9, 0.7, 0.4]);
    for (const f of [1047, 1319, 784, 523]) l.push([f, 1.45, row.dur - 1.45, 0.6, 1.0]);
    return notes(sr, row.dur, l, 'tri');
  }
  function genOverLose(sr, rng, row) {
    const seq = [[440, 0], [392, 0.45], [330, 0.9], [294, 1.35], [220, 1.8]];
    const l = seq.map(([f, t], i) => [f, t, row.dur - t, 0.65, i === 4 ? 0.9 : 0.4]);
    l.push([110, 1.8, row.dur - 1.8, 0.5, 0.9]);
    return lowpassed(notes(sr, row.dur, l, 'tri'), 2200, sr);
  }
  function lowpassed(x, fc, sr) { return lp(x, fc, sr); }
  function genCharge(sr, rng, row) {
    const n = Math.floor(sr * row.dur), o = tone(n, sr, flat(220), 2);
    for (let i = 0; i < n; i++) o[i] *= 0.75 + 0.25 * Math.sin(TAU * 16 * i / sr);
    return o;
  }
  function genHum(sr, rng, row) {
    const n = Math.floor(sr * row.dur), o = tone(n, sr, flat(140), 2);
    for (let i = 0; i < n; i++) o[i] *= 0.65 + 0.35 * Math.sin(TAU * 36 * i / sr);
    return o;
  }
  function genWind(sr, rng, row) {
    const n = Math.floor(sr * row.dur), xf = Math.floor(sr * 0.5);
    const a = noise(n + xf, rng), b = lp(a.slice(), 260, sr);
    for (let i = 0; i < a.length; i++) a[i] = a[i] * 0.35 + b[i] * 3;
    lp(a, 2500, sr);
    const o = a.subarray(0, n).slice();
    for (let i = 0; i < xf; i++) { const w = i / xf; o[i] = a[n + i] * (1 - w) + a[i] * w; }
    return o;
  }

  // sz selects the boom size class; sparks/rise parametrise the sparkle generator.
  const TABLE = {
    ui_click: { gen: genClick, n: 2, dur: 0.12, peak: 0.6, bus: 'ui', max: 3, pri: 3 },
    ui_hover: { gen: genBlip(1400, 1300, 0.02), n: 1, dur: 0.08, peak: 0.25, bus: 'ui', max: 2, pri: 1 },
    ui_deny: { gen: genDeny, n: 1, dur: 0.3, peak: 0.6, bus: 'ui', max: 1, pri: 4 },
    ui_buy: { gen: genBuy, n: 2, dur: 0.6, peak: 0.7, bus: 'ui', max: 2, pri: 4 },
    ui_tick: { gen: genTick, n: 1, dur: 0.12, peak: 0.6, bus: 'ui', max: 1, pri: 5 },
    select: { gen: genTick, n: 2, dur: 0.1, peak: 0.45, bus: 'ui', max: 2, pri: 3 },
    skip: { gen: genBlip(220, 150, 0.08), n: 1, dur: 0.2, peak: 0.5, bus: 'ui', max: 1, pri: 3 },
    turn_ai: { gen: chime([523, 392], 0.16, 0.45, 'bell'), n: 1, dur: 1.2, peak: 0.5, bus: 'ui', max: 1, pri: 6 },
    turn_me: { gen: chime([523, 784], 0.16, 0.5, 'bell'), n: 1, dur: 1.3, peak: 0.6, bus: 'ui', max: 1, pri: 7 },
    fire_coi: { gen: fireBase(150, 45, 1800, 0.16, 300, 1), n: 3, dur: 0.8, peak: 0.9, bus: 'shot', max: 3, pri: 8 },
    fire_nay: { gen: genNay, n: 3, dur: 0.8, peak: 0.9, bus: 'shot', max: 3, pri: 8 },
    fire_muacoc: { gen: genMuacoc, n: 3, dur: 1.1, peak: 0.95, bus: 'shot', max: 3, pri: 8 },
    fire_kim: { gen: genKim, n: 3, dur: 0.7, peak: 0.85, bus: 'shot', max: 3, pri: 8 },
    fire_cheba: { gen: genCheba, n: 3, dur: 0.6, peak: 0.85, bus: 'shot', max: 3, pri: 8 },
    fire_tele: { gen: genFireTele, n: 2, dur: 0.8, peak: 0.6, bus: 'shot', max: 2, pri: 7 },
    fire_default: { gen: fireBase(140, 48, 1600, 0.14, 280, 1), n: 2, dur: 0.7, peak: 0.8, bus: 'shot', max: 3, pri: 7 },
    beam: { gen: genBeam, n: 2, dur: 0.9, peak: 0.85, bus: 'shot', max: 2, pri: 8 },
    boom_s: { gen: genBoom, sz: 0, n: 3, dur: 1.2, peak: 0.85, bus: 'boom', max: 3, pri: 9 },
    boom_m: { gen: genBoom, sz: 1, n: 3, dur: 1.7, peak: 0.92, bus: 'boom', max: 3, pri: 9 },
    boom_l: { gen: genBoom, sz: 2, n: 3, dur: 2.3, peak: 0.98, bus: 'boom', max: 2, pri: 10 },
    bounce: { gen: genBounce, n: 3, dur: 0.35, peak: 0.7, bus: 'world', max: 3, pri: 5 },
    split: { gen: genSplit, n: 2, dur: 0.45, peak: 0.7, bus: 'world', max: 3, pri: 5 },
    splash: { gen: genSplash, n: 3, dur: 0.8, peak: 0.6, bus: 'world', max: 3, pri: 4 },
    land: { gen: genLand, n: 3, dur: 0.3, peak: 0.7, bus: 'world', max: 2, pri: 4 },
    hit: { gen: genHit, n: 3, dur: 0.4, peak: 0.8, bus: 'world', max: 4, pri: 6 },
    hit_shield: { gen: genShieldPing, n: 2, dur: 0.9, peak: 0.55, bus: 'world', max: 2, pri: 6 },
    die: { gen: genDie, n: 2, dur: 2.2, peak: 0.85, bus: 'world', max: 2, pri: 8 },
    die_sea: { gen: genDieSea, n: 1, dur: 1.4, peak: 0.5, bus: 'world', max: 2, pri: 6 },
    heal: { gen: chime([523, 659, 784, 1047], 0.09, 0.35, 'sine'), n: 1, dur: 1.2, peak: 0.6, bus: 'world', max: 2, pri: 6 },
    item_double: { gen: chime([660, 660], 0.09, 0.08, 'tri'), n: 1, dur: 0.3, peak: 0.55, bus: 'ui', max: 1, pri: 5 },
    item_boost: { gen: genItemBoost, n: 1, dur: 0.3, peak: 0.55, bus: 'ui', max: 1, pri: 5 },
    item_heal: { gen: chime([523, 784], 0.1, 0.2, 'sine'), n: 1, dur: 0.5, peak: 0.55, bus: 'ui', max: 1, pri: 5 },
    item_teamheal: { gen: chime([523, 659, 784], 0.08, 0.22, 'sine'), n: 1, dur: 0.6, peak: 0.55, bus: 'ui', max: 1, pri: 5 },
    item_shield: { gen: genItemShield, n: 1, dur: 0.5, peak: 0.5, bus: 'ui', max: 1, pri: 5 },
    item_calm: { gen: genItemCalm, n: 1, dur: 0.5, peak: 0.5, bus: 'ui', max: 1, pri: 5 },
    item_tele: { gen: genSparkle, sparks: 6, rise: false, n: 1, dur: 0.5, peak: 0.45, bus: 'ui', max: 1, pri: 5 },
    tele: { gen: genSparkle, sparks: 14, rise: true, n: 2, dur: 0.8, peak: 0.55, bus: 'world', max: 2, pri: 6 },
    step: { gen: genStep, n: 4, dur: 0.25, peak: 0.55, bus: 'world', max: 3, pri: 2 },
    over_win: { gen: genOverWin, n: 1, dur: 3.0, peak: 0.7, bus: 'ui', max: 1, pri: 10 },
    over_lose: { gen: genOverLose, n: 1, dur: 2.8, peak: 0.7, bus: 'ui', max: 1, pri: 10 },
    charge: { gen: genCharge, loop: true, n: 1, dur: 0.5, peak: 0.5, bus: 'world', max: 1, pri: 5 },
    hum: { gen: genHum, loop: true, n: 1, dur: 0.5, peak: 0.5, bus: 'world', max: 1, pri: 2 },
    wind: { gen: genWind, loop: true, sr: 16000, n: 1, dur: 4, peak: 0.5, bus: 'amb', max: 1, pri: 1 }
  };
  const NAMES = Object.keys(TABLE);
  const BUS_CAP = { shot: 6, boom: 6, world: 14, ui: 6, amb: 3, music: 2 };
  const REVERB_SEND = { shot: 0.22, boom: 0.3, world: 0.12 };
  const DUCKED = ['world', 'amb', 'music'];

  const cache = {};
  function render(name, v) {
    const c = cache[name] || (cache[name] = []);
    if (c[v]) return c[v];
    const row = TABLE[name], sr = row.sr || SR;
    const x = row.gen(sr, PM.rng(PM.hash(name) + v * 7919), row);
    let nan = false, m = 0;
    for (let i = 0; i < x.length; i++) {
      if (!Number.isFinite(x[i])) { nan = true; x[i] = 0; }
    }
    nrm(x, row.peak);
    if (!row.loop) {
      const f = Math.min(x.length, Math.floor(sr * 0.005));
      for (let i = 0; i < f; i++) x[x.length - 1 - i] *= i / f;
    }
    for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > m) m = a; }
    return (c[v] = { data: x, sr, nan, peak: m, clipped: m > 0.999 });
  }

  function createApi(G) {
    const queue = [];
    for (const name of NAMES) for (let v = 0; v < TABLE[name].n; v++) queue.push([name, v]);
    let qi = 0;
    let ctx = null, master = null, comp = null, buses = null, reverbIn = null, windGain = null, windFilter = null;
    let vol = 0.8, muted = false;
    const voices = {};
    const abCache = {};
    const lastVariant = {};
    let chargeSrc = null, chargeGain = null, humGain = null, lastX = null, stepAcc = 0;
    for (const b in BUS_CAP) voices[b] = [];

    function audioBuffer(name, v) {
      const k = name + '#' + v;
      if (abCache[k]) return abCache[k];
      const r = render(name, v), ab = ctx.createBuffer(1, r.data.length, r.sr);
      ab.copyToChannel(r.data, 0);
      return (abCache[k] = ab);
    }
    function applyMaster() { if (master) master.gain.setTargetAtTime(muted ? 0 : vol * 0.85, ctx.currentTime, 0.02); }

    function buildGraph() {
      const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Ctor) throw new Error('AudioContext unavailable in this browser');
      ctx = new Ctor();
      master = ctx.createGain();
      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(1024), norm = Math.tanh(1.3);
      for (let i = 0; i < 1024; i++) curve[i] = Math.tanh(1.3 * ((i / 1023) * 2 - 1)) / norm;
      shaper.curve = curve; shaper.oversample = '2x';
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -3; comp.ratio.value = 2; comp.knee.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
      comp.connect(shaper); shaper.connect(master); master.connect(ctx.destination);

      const conv = ctx.createConvolver(), rvOut = ctx.createGain(), sr = ctx.sampleRate, len = Math.floor(sr * 1.6);
      const imp = ctx.createBuffer(2, len, sr), rr = PM.rng(PM.hash('reverb'));
      for (let c = 0; c < 2; c++) {
        const d = imp.getChannelData(c); let y = 0;
        for (let i = 0; i < len; i++) {
          const t = i / sr, a = 0.55 * Math.exp(-t / 0.5) + 0.05;
          y += a * ((rr() * 2 - 1) - y);
          d[i] = t < 0.012 ? 0 : y * Math.exp(-t / 0.42) * 2.2;
        }
      }
      conv.buffer = imp; rvOut.gain.value = 0.8;
      conv.connect(rvOut); rvOut.connect(comp); reverbIn = conv;

      buses = {};
      const lvl = { shot: 1, boom: 1, world: 0.9, ui: 0.75, amb: 0.8, music: 0.7 };
      for (const name in BUS_CAP) {
        const input = ctx.createGain(), duck = ctx.createGain();
        input.gain.value = lvl[name];
        input.connect(duck); duck.connect(comp);
        if (REVERB_SEND[name]) { const s = ctx.createGain(); s.gain.value = REVERB_SEND[name]; input.connect(s); s.connect(conv); }
        buses[name] = { input, duck };
      }

      const wsrc = ctx.createBufferSource();
      wsrc.buffer = audioBuffer('wind', 0); wsrc.loop = true;
      windFilter = ctx.createBiquadFilter(); windFilter.type = 'lowpass'; windFilter.frequency.value = 500;
      windGain = ctx.createGain(); windGain.gain.value = 0;
      wsrc.connect(windFilter); windFilter.connect(windGain); windGain.connect(buses.amb.input);
      wsrc.start();
      applyMaster();
    }

    function duckBoom() {
      const t = ctx.currentTime;
      for (const name of DUCKED) {
        const g = buses[name].duck.gain;
        g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
        g.linearRampToValueAtTime(0.4, t + 0.012);
        g.setValueAtTime(0.4, t + 0.097);
        g.linearRampToValueAtTime(1, t + 0.347);
      }
    }
    function steal(list, v) {
      const t = ctx.currentTime;
      v.gain.gain.cancelScheduledValues(t); v.gain.gain.setTargetAtTime(0, t, 0.004);
      try { v.src.stop(t + 0.03); } catch (err) { /* already ended */ }
      list.splice(list.indexOf(v), 1);
    }
    function claim(row, name) {
      const list = voices[row.bus];
      let same = 0, oldest = null;
      for (const v of list) if (v.name === name) { same++; if (!oldest) oldest = v; }
      if (same >= row.max && oldest) steal(list, oldest);
      if (list.length >= BUS_CAP[row.bus]) {
        let low = null;
        for (const v of list) if (!low || v.pri < low.pri) low = v;
        if (low.pri > row.pri) return false;
        steal(list, low);
      }
      return list;
    }
    function camX() { return G.camera && G.camera.position ? G.camera.position.x : 84; }
    function xOf(ev) {
      if (typeof ev.x === 'number') return ev.x;
      const s = G.sim, u = s && ev.unit != null && s.units ? s.units[ev.unit] : null;
      return u ? u.x : null;
    }
    function play(name, x, gain) {
      if (!ctx || muted) return;
      const row = TABLE[name];
      if (!row) return;
      const list = claim(row, name);
      if (!list) return;
      let v = Math.floor(Math.random() * row.n);
      if (row.n > 1 && v === lastVariant[name]) v = (v + 1) % row.n;
      lastVariant[name] = v;
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = audioBuffer(name, v);
      let pan = 0, att = 1;
      if (x != null) { const dx = x - camX(); pan = clamp(dx / 45, -1, 1); att = 1 - 0.3 * Math.min(1, Math.abs(dx) / 120); }
      g.gain.value = (gain == null ? 1 : gain) * att;
      src.connect(g);
      if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(buses[row.bus].input); }
      else g.connect(buses[row.bus].input);
      const voice = { name, pri: row.pri, src, gain: g };
      list.push(voice);
      src.onended = () => { const i = list.indexOf(voice); if (i >= 0) list.splice(i, 1); };
      src.start();
      return voice;
    }

    function stopCharge() {
      if (!chargeSrc) return;
      const t = ctx.currentTime;
      chargeGain.gain.cancelScheduledValues(t); chargeGain.gain.setTargetAtTime(0, t, 0.03);
      try { chargeSrc.stop(t + 0.2); } catch (err) { /* already stopped */ }
      chargeSrc = null; chargeGain = null;
    }
    function startCharge() {
      stopCharge();
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = audioBuffer('charge', 0); src.loop = true; src.playbackRate.value = 0.6;
      g.gain.value = 0; g.gain.setTargetAtTime(0.22, ctx.currentTime, 0.03);
      src.connect(g); g.connect(buses.world.input); src.start();
      chargeSrc = src; chargeGain = g;
    }
    function ensureHum() {
      if (humGain) return;
      const src = ctx.createBufferSource();
      humGain = ctx.createGain(); humGain.gain.value = 0;
      src.buffer = audioBuffer('hum', 0); src.loop = true;
      src.connect(humGain); humGain.connect(buses.world.input); src.start();
    }

    function on(topic, fn) { const battle = topic.indexOf('sim:') === 0; G.bus.on(topic, (ev) => { if (ctx && !(battle && G.demo)) fn(ev || {}); }); }
    function wire() {
      on('sim:fire', (ev) => {
        stopCharge();
        if (ev.shot === 'tiasam') return;
        const name = TABLE['fire_' + ev.shot] ? 'fire_' + ev.shot : 'fire_default';
        play(name, xOf(ev), 0.55 + 0.45 * clamp((ev.power || 0) / 100, 0, 1));
      });
      on('sim:beam', (ev) => play('beam', typeof ev.x0 === 'number' ? ev.x0 : xOf(ev), 1));
      on('sim:boom', (ev) => {
        const r = ev.radius || 3.5;
        play(r < 3.2 ? 'boom_s' : r < 4.3 ? 'boom_m' : 'boom_l', xOf(ev), 0.75 + 0.1 * r);
        duckBoom();
      });
      on('sim:bounce', (ev) => play('bounce', xOf(ev)));
      on('sim:split', (ev) => play('split', xOf(ev)));
      on('sim:splash', (ev) => play('splash', xOf(ev)));
      on('sim:land', (ev) => { const f = ev.fall || 0; if (f >= 0.4) play('land', xOf(ev), clamp(0.25 + f / 6, 0, 1)); });
      on('sim:damage', (ev) => {
        const a = ev.amount || 0, x = xOf(ev);
        play('hit', x, (ev.blocked > 0 ? 0.6 : 1) * (0.4 + 0.6 * Math.min(1, a / 300)));
        if (ev.blocked > 0) play('hit_shield', x, 1);
      });
      on('sim:die', (ev) => { const x = xOf(ev); play('die', x, 1); if (ev.cause === 'sea') play('die_sea', x, 1); });
      on('sim:heal', (ev) => play('heal', xOf(ev)));
      on('sim:item', (ev) => play(TABLE['item_' + ev.item] ? 'item_' + ev.item : 'ui_click', null));
      on('sim:turn', (ev) => {
        const s = G.sim, u = s && s.units ? s.units[ev.unit] : null;
        play(u && !u.ai ? 'turn_me' : 'turn_ai', null);
      });
      on('sim:charge', () => { if (!muted) startCharge(); });
      on('sim:select', () => play('select', null));
      on('sim:skip', () => play('skip', null));
      on('sim:tele', (ev) => play('tele', xOf(ev)));
      on('sim:over', (ev) => play(ev.winner === G.playerTeam ? 'over_win' : 'over_lose', null));
      on('ui:click', () => play('ui_click', null));
      on('ui:hover', () => play('ui_hover', null));
      on('ui:deny', () => play('ui_deny', null));
      on('ui:buy', () => play('ui_buy', null));
      on('ui:tick', () => play('ui_tick', null));
    }

    function ambience(s) {
      const w = s ? Math.min(1, Math.abs(s.wind || 0) / 9) : 0.15, t = ctx.currentTime;
      const gust = 0.5 + 0.5 * Math.sin(t * 0.7) * Math.sin(t * 0.23 + 1);
      windGain.gain.setTargetAtTime(0.05 + 0.3 * w * (0.7 + 0.3 * gust), t, 0.2);
      windFilter.frequency.setTargetAtTime(350 + 1700 * w, t, 0.2);
    }
    function movement(s) {
      const u = s && s.active, mv = !!(s && s.phase === 'turn' && s.input && s.input.move !== 0 && u && u.grounded);
      const wantHum = mv && u.kind === 'chuon';
      if (wantHum) ensureHum();
      if (humGain) humGain.gain.setTargetAtTime(wantHum && !muted ? 0.16 : 0, ctx.currentTime, 0.06);
      if (mv && u.kind !== 'chuon') {
        if (lastX === null) { lastX = u.x; stepAcc = 0.6; }
        stepAcc += Math.abs(u.x - lastX); lastX = u.x;
        if (stepAcc >= 1.15) { stepAcc = 0; play('step', u.x, 0.8); }
      } else { lastX = null; stepAcc = 0; }
    }

    const api = {
      unlock() {
        try {
          if (!ctx) { buildGraph(); wire(); }
          if (ctx.state === 'suspended') ctx.resume();
        } catch (err) { PM.logError('audio context creation failed', err); }
      },
      update(dt) {
        const t0 = now();
        while (qi < queue.length && now() - t0 < 5) { render(queue[qi][0], queue[qi][1]); qi++; }
        if (!ctx || !buses) return;
        const s = G.sim;
        if (chargeSrc) {
          if (!s || !s.charge || !s.charge.on) stopCharge();
          else chargeSrc.playbackRate.setTargetAtTime(0.6 + 1.4 * clamp(s.charge.power / 100, 0, 1), ctx.currentTime, 0.03);
        }
        ambience(s);
        movement(s);
      },
      setVolume(v) { vol = clamp(+v || 0, 0, 1); applyMaster(); },
      setMuted(m) { muted = !!m; applyMaster(); },
      diag() {
        const out = [];
        for (const name of NAMES) {
          const row = TABLE[name];
          let peak = 0, clipped = false, nan = false;
          for (let v = 0; v < row.n; v++) {
            const r = render(name, v);
            peak = Math.max(peak, r.peak); clipped = clipped || r.clipped; nan = nan || r.nan;
          }
          out.push({ name, peak, clipped, nan, dur: render(name, 0).data.length / (row.sr || SR) });
        }
        return Promise.resolve(out);
      },
      get ready() { return qi >= queue.length; },
      get progress() { return queue.length ? qi / queue.length : 1; }
    };
    return api;
  }

  PM.Audio = {
    init(G) {
      if (PM.params && PM.params.noaudio) {
        return { unlock() {}, update() {}, setVolume() {}, setMuted() {}, diag() { return Promise.resolve([]); }, ready: true, progress: 1 };
      }
      return createApi(G);
    }
  };
})();
