// Every sound is synthesized from seeded noise and simple waveforms, rendered into
// AudioBuffers a slice at a time (<= 6 ms per frame) so boot never hitches.
(() => {
  const BZ = window.BZ;
  const TAU = Math.PI * 2;

  class BP { // RBJ band-pass (constant skirt), retunable per sample block
    constructor(sr) { this.sr = sr; this.x1 = this.x2 = this.y1 = this.y2 = 0; this.set(1000, 1); }
    set(fc, q) {
      const w = TAU * Math.min(fc, this.sr * 0.45) / this.sr; const al = Math.sin(w) / (2 * q); const a0 = 1 + al;
      this.b0 = al / a0; this.b2 = -al / a0; this.a1 = (-2 * Math.cos(w)) / a0; this.a2 = (1 - al) / a0;
    }
    run(x) { const y = this.b0 * x + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2; this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y; }
  }
  const lpK = (fc, sr) => 1 - Math.exp((-TAU * fc) / sr);

  function finish(buf, peak) {
    let m = 0;
    for (let i = 0; i < buf.length; i++) { buf[i] = Math.tanh(buf[i] * 1.2); m = Math.max(m, Math.abs(buf[i])); }
    const k = m > 0 ? peak / m : 0;
    for (let i = 0; i < buf.length; i++) buf[i] *= k;
    const fade = Math.min(64, buf.length >> 2);
    for (let i = 0; i < fade; i++) buf[buf.length - 1 - i] *= i / fade;
    return buf;
  }

  // ---- generators: (rng, sr, opts) -> Float32Array ----
  function gunshot(rng, sr, o) {
    const len = Math.floor(sr * (o.boom + o.tail + 0.05));
    const out = new Float32Array(len);
    const lp = lpK(o.lp * rng.range(0.9, 1.1), sr); const hp = lpK(o.hp, sr);
    let lpS = 0; let hpS = 0; let ph = 0;
    const f0 = o.f0 * rng.range(0.92, 1.08); const f1 = o.f1;
    for (let i = 0; i < len; i++) {
      const t = i / sr; const n = rng.next() * 2 - 1;
      hpS += hp * (n - hpS);
      const crack = (n - hpS) * Math.exp(-t / o.crack) * 0.9;
      const f = f1 + (f0 - f1) * Math.exp(-t / (o.thump * 0.35));
      ph += f / sr;
      const thump = Math.sin(TAU * ph) * Math.exp(-t / (o.thump * 0.45)) * 1.1;
      lpS += lp * (n - lpS);
      const boom = lpS * 3.2 * (1 - Math.exp(-t / 0.002)) * Math.exp(-t / (o.boom * 0.4));
      let slap = 0;
      for (const [d, g] of o.echo) { const tt = t - d; if (tt > 0) slap += lpS * g * Math.exp(-tt / (o.tail * 0.3)); }
      out[i] = crack + thump + boom + slap;
    }
    return finish(out, o.peak || 0.95);
  }
  function click(rng, sr, o) {
    const len = Math.floor(sr * o.len);
    const out = new Float32Array(len);
    const bp = new BP(sr);
    for (const [at, f, q, g] of o.taps) {
      bp.set(f * rng.range(0.92, 1.08), q);
      const s0 = Math.floor(at * sr);
      for (let i = s0; i < Math.min(len, s0 + sr * 0.05); i++) {
        const t = (i - s0) / sr;
        out[i] += bp.run(rng.next() * 2 - 1) * Math.exp(-t / 0.008) * g;
      }
    }
    return finish(out, o.peak || 0.7);
  }
  function thud(rng, sr, o) {
    const len = Math.floor(sr * o.len); const out = new Float32Array(len);
    const lp = lpK(o.lp * rng.range(0.85, 1.15), sr); let s = 0; let ph = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr; s += lp * (rng.next() * 2 - 1 - s);
      const f = o.f1 + (o.f0 - o.f1) * Math.exp(-t / 0.03); ph += f / sr;
      out[i] = (s * 2.5 * (o.noise || 1) + Math.sin(TAU * ph) * 0.8) * Math.exp(-t / (o.len * 0.3));
    }
    return finish(out, o.peak || 0.6);
  }
  function squelch(rng, sr, o) {
    const len = Math.floor(sr * o.len); const out = new Float32Array(len);
    const bp = new BP(sr); let ph = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      if (i % 32 === 0) bp.set(o.f * (1 - 0.6 * t / o.len) * rng.range(0.97, 1.03), 3);
      ph += (90 + 60 * Math.exp(-t / 0.02)) / sr;
      out[i] = (bp.run(rng.next() * 2 - 1) * 2.5 + Math.sin(TAU * ph) * 0.5) * Math.exp(-t / (o.len * 0.35));
    }
    return finish(out, o.peak || 0.7);
  }
  function voice(rng, sr, o) { // zombie groan: breathy buzz through two moving formants
    const dur = o.dur * rng.range(0.8, 1.2); const len = Math.floor(sr * dur); const out = new Float32Array(len);
    const f1 = new BP(sr); const f2 = new BP(sr); let ph = 0; let walk = 0;
    const base = o.f0 * rng.range(0.88, 1.12); const vib = rng.range(4, 7);
    const F1 = o.F1 * rng.range(0.9, 1.1); const F2 = o.F2 * rng.range(0.9, 1.1);
    for (let i = 0; i < len; i++) {
      const t = i / sr; const p = t / dur;
      if (i % 64 === 0) {
        walk = BZ.clamp(walk + (rng.next() - 0.5) * 0.08, -0.2, 0.2);
        f1.set(F1 * (1 + 0.25 * Math.sin(p * 5 + 1)), 5); f2.set(F2 * (1 + 0.2 * Math.sin(p * 3.3)), 7);
      }
      const f = base * (1 + 0.05 * Math.sin(TAU * vib * t) + walk) * (1 - o.drop * p);
      ph += f / sr;
      const src = (2 * (ph % 1) - 1) * 0.8 + (rng.next() * 2 - 1) * o.breath;
      const env = Math.min(1, t / 0.12) * Math.min(1, (dur - t) / 0.25);
      out[i] = (f1.run(src) * 1.4 + f2.run(src) * 0.9) * env;
    }
    return finish(out, o.peak || 0.75);
  }
  function whoosh(rng, sr, o) {
    const len = Math.floor(sr * o.len); const out = new Float32Array(len); const bp = new BP(sr);
    for (let i = 0; i < len; i++) {
      const t = i / sr; const p = t / o.len;
      if (i % 32 === 0) bp.set(o.f0 + (o.f1 - o.f0) * p, 2);
      out[i] = bp.run(rng.next() * 2 - 1) * Math.sin(Math.PI * p);
    }
    return finish(out, o.peak || 0.5);
  }
  function hum(rng, sr, o) { // light-blade hum: detuned saws, pitch bends with the swing
    const len = Math.floor(sr * o.len); const out = new Float32Array(len); const bp = new BP(sr);
    let a = 0; let b = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr; const p = t / o.len;
      const f = o.f0 + (o.f1 - o.f0) * Math.sin(Math.PI * p);
      a += f / sr; b += (f * 1.012) / sr;
      if (i % 32 === 0) bp.set(f * 3 + 300 * Math.sin(Math.PI * p), 1.4);
      const src = (2 * (a % 1) - 1) + (2 * (b % 1) - 1) * 0.8 + (rng.next() * 2 - 1) * (o.noise || 0.15);
      const env = o.env === 'up' ? Math.min(1, p * 4) * Math.min(1, (1 - p) * 6) : Math.sin(Math.PI * p);
      out[i] = (bp.run(src) * 1.5 + src * 0.12) * env;
    }
    return finish(out, o.peak || 0.55);
  }
  function chop(rng, sr, o) { // blade into flesh: wet crunch, a low body thump, a bone crack on top
    const len = Math.floor(sr * o.len); const out = new Float32Array(len);
    const bp = new BP(sr); const hp = new BP(sr); let s = 0; let ph = 0; const lp = lpK(700, sr);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      if (i % 32 === 0) { bp.set(o.f * (1 - 0.5 * t / o.len) * rng.range(0.95, 1.05), 2.5); hp.set(3200, 4); }
      s += lp * (rng.next() * 2 - 1 - s); ph += (o.thump * (1 + 1.5 * Math.exp(-t / 0.015))) / sr;
      const crack = t < 0.012 ? hp.run(rng.next() * 2 - 1) * 3 * (1 - t / 0.012) : 0;
      out[i] = (bp.run(rng.next() * 2 - 1) * 2 + s * 3 + Math.sin(TAU * ph) * 0.9) * Math.exp(-t / (o.len * 0.3)) + crack * (o.crack || 1);
    }
    return finish(out, o.peak || 0.8);
  }
  function sizzle(rng, sr, o) { // saber burn: crackling high noise that fizzles out
    const len = Math.floor(sr * o.len); const out = new Float32Array(len); const bp = new BP(sr); let pop = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      if (i % 32 === 0) bp.set(rng.range(2500, 6000), 2);
      if (rng.next() < 0.004) pop = 1; pop *= 0.995;
      out[i] = bp.run(rng.next() * 2 - 1) * (0.6 + pop * 2.5) * Math.exp(-t / (o.len * 0.4));
    }
    return finish(out, o.peak || 0.6);
  }
  function rain(rng, sr, o) { // steady hiss with random droplet ticks, loops
    const len = Math.floor(sr * o.len); const out = new Float32Array(len); const bp = new BP(sr); const hp = new BP(sr); bp.set(2400, 0.6); hp.set(5200, 3);
    for (let i = 0; i < len; i++) { out[i] = bp.run(rng.next() * 2 - 1) * 0.5 + (rng.next() < 0.002 ? hp.run(1) * 3 : hp.run(0)); }
    return loopify(finish(out, o.peak || 0.4), sr, 0.4);
  }
  function thunder(rng, sr, o) { // a crack, then a long rolling rumble
    const len = Math.floor(sr * o.len); const out = new Float32Array(len); let s = 0; let s2 = 0; const lp = lpK(140, sr); const lp2 = lpK(900, sr);
    for (let i = 0; i < len; i++) {
      const t = i / sr; const n = rng.next() * 2 - 1; s += lp * (n - s); s2 += lp2 * (n - s2);
      const roll = 0.6 + 0.4 * Math.sin(t * 7 + Math.sin(t * 2.3) * 3);
      out[i] = s * 9 * Math.exp(-t / (o.len * 0.45)) * roll + s2 * 3 * Math.exp(-t / 0.08);
    }
    return finish(out, o.peak || 0.95);
  }
  function tones(rng, sr, o) { // short square/triangle notes for pickups and UI
    const len = Math.floor(sr * o.notes.reduce((a, n) => a + n[1], 0) + sr * 0.05); const out = new Float32Array(len);
    let at = 0;
    for (const [f, d, g = 1] of o.notes) {
      const s0 = Math.floor(at * sr); const n = Math.floor(d * sr);
      for (let i = 0; i < n + sr * 0.04 && s0 + i < len; i++) {
        const t = i / sr; const ph = (f * t) % 1;
        const w = o.wave === 'tri' ? 4 * Math.abs(ph - 0.5) - 1 : ph < 0.5 ? 1 : -1;
        out[s0 + i] += w * g * 0.4 * Math.exp(-t / (d * 0.9));
      }
      at += d;
    }
    return finish(out, o.peak || 0.45);
  }
  function horn(rng, sr, o) {
    const len = Math.floor(sr * o.len); const out = new Float32Array(len); let s = 0; const k = lpK(700, sr);
    for (let i = 0; i < len; i++) {
      const t = i / sr; const p = t / o.len;
      let x = 0; for (const f of o.freqs) x += 2 * ((f * t * (1 + 0.003 * Math.sin(TAU * 5 * t))) % 1) - 1;
      s += k * (x - s);
      out[i] = s * Math.min(1, t / 0.25) * Math.min(1, (o.len - t) / 0.5) * (0.8 + 0.2 * Math.sin(p * 6));
    }
    return finish(out, o.peak || 0.6);
  }
  function wind(rng, sr, o) {
    const len = Math.floor(sr * o.len); const out = new Float32Array(len); const bp = new BP(sr);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      if (i % 64 === 0) bp.set(380 + 200 * Math.sin(TAU * t / o.len * 3) + 120 * Math.sin(TAU * t / o.len * 7), 1.4);
      out[i] = bp.run(rng.next() * 2 - 1) * (0.6 + 0.4 * Math.sin(TAU * t / o.len * 2));
    }
    return loopify(finish(out, o.peak || 0.35), sr, 0.4);
  }
  // Music: 100 BPM, 4 bars. Stems are mixed by game intensity.
  const BEAT = 0.6; const BARS = 4; const LOOP = BEAT * 4 * BARS;
  function drone(rng, sr) {
    const len = Math.floor(sr * (LOOP + 0.5)); const out = new Float32Array(len); let s = 0;
    const roots = [55, 55, 49, 51.9];
    for (let i = 0; i < len; i++) {
      const t = i / sr; const bar = Math.floor(t / (BEAT * 4)) % BARS; const f = roots[bar];
      const k = lpK(260 + 140 * Math.sin(TAU * t / LOOP), sr);
      const x = (2 * ((f * t) % 1) - 1) + (2 * ((f * 1.007 * t) % 1) - 1) + 0.6 * (2 * ((f * 1.5 * t) % 1) - 1);
      s += k * (x - s);
      out[i] = s;
    }
    return loopify(finish(out, 0.5), sr, 0.5);
  }
  function perc(rng, sr) {
    const len = Math.floor(sr * (LOOP + 0.5)); const out = new Float32Array(len);
    const hit = (at, fn, n) => { const s0 = Math.floor(at * sr); for (let i = 0; i < n * sr && s0 + i < len; i++) out[s0 + i] += fn(i / sr); };
    let hpS = 0; const hk = lpK(6000, sr);
    for (let b = 0; b < 4 * BARS; b++) {
      const at = b * BEAT;
      if (b % 2 === 0) { let ph = 0; hit(at, (t) => { ph += (45 + 90 * Math.exp(-t / 0.03)) / sr; return Math.sin(TAU * ph) * Math.exp(-t / 0.12) * 1.2; }, 0.35); }
      if (b % 4 === 3 && b % 8 === 7) { let ph = 0; hit(at + BEAT * 0.5, (t) => { ph += (45 + 90 * Math.exp(-t / 0.03)) / sr; return Math.sin(TAU * ph) * Math.exp(-t / 0.1); }, 0.3); }
      if (b % 2 === 1) hit(at, (t) => (rng.next() * 2 - 1) * Math.exp(-t / 0.07) * 0.55, 0.25);
      for (const off of [0, 0.5]) hit(at + off * BEAT, (t) => { const n = rng.next() * 2 - 1; hpS += hk * (n - hpS); return (n - hpS) * Math.exp(-t / 0.02) * 0.3; }, 0.06);
    }
    return loopify(finish(out, 0.55), sr, 0.02);
  }
  function loopify(buf, sr, xf) { // crossfade the tail past the loop point into the head
    const n = Math.floor(xf * sr); const L = buf.length - n; const out = new Float32Array(L);
    for (let i = 0; i < L; i++) out[i] = buf[i];
    for (let i = 0; i < n; i++) { const a = i / n; out[i] = buf[i] * a + buf[L + i] * (1 - a); }
    return out;
  }
  function impulse(rng, sr) {
    const len = Math.floor(sr * 1.4); const L = new Float32Array(len); const R = new Float32Array(len);
    let sl = 0; let sr2 = 0; const k = lpK(3500, sr);
    for (let i = 0; i < len; i++) {
      const t = i / sr; const e = Math.exp(-t / 0.32) * (t < 0.012 ? t / 0.012 : 1);
      sl += k * (rng.next() * 2 - 1 - sl); sr2 += k * (rng.next() * 2 - 1 - sr2);
      L[i] = sl * e; R[i] = sr2 * e;
    }
    return [L, R];
  }

  const shot = (o) => ({ gen: gunshot, o });
  const SOUNDS = {
    pistol: { n: 3, bus: 'gun', max: 4, ...shot({ hp: 2800, crack: 0.004, f0: 190, f1: 60, thump: 0.09, lp: 2600, boom: 0.16, tail: 0.25, echo: [[0.06, 0.18], [0.11, 0.1]], peak: 0.85 }) },
    shotgun: { n: 3, bus: 'gun', max: 3, ...shot({ hp: 2200, crack: 0.006, f0: 130, f1: 38, thump: 0.16, lp: 1700, boom: 0.32, tail: 0.45, echo: [[0.08, 0.28], [0.17, 0.16]], peak: 0.97 }) },
    smg: { n: 4, bus: 'gun', max: 6, ...shot({ hp: 3200, crack: 0.003, f0: 220, f1: 80, thump: 0.06, lp: 3000, boom: 0.1, tail: 0.18, echo: [[0.05, 0.12]], peak: 0.8 }) },
    rifle: { n: 4, bus: 'gun', max: 5, ...shot({ hp: 2600, crack: 0.004, f0: 170, f1: 50, thump: 0.11, lp: 2300, boom: 0.2, tail: 0.32, echo: [[0.07, 0.2], [0.13, 0.12]], peak: 0.92 }) },
    rocket: { n: 2, bus: 'gun', max: 3, ...shot({ hp: 900, crack: 0.012, f0: 75, f1: 30, thump: 0.25, lp: 800, boom: 0.45, tail: 0.6, echo: [[0.1, 0.3]], peak: 0.95 }) },
    boom: { n: 2, bus: 'gun', max: 4, ...shot({ hp: 1500, crack: 0.01, f0: 90, f1: 28, thump: 0.35, lp: 900, boom: 0.7, tail: 0.9, echo: [[0.12, 0.35], [0.26, 0.2]], peak: 0.98 }) },
    turret: { n: 3, bus: 'world', max: 6, ...shot({ hp: 4200, crack: 0.003, f0: 260, f1: 110, thump: 0.04, lp: 3600, boom: 0.06, tail: 0.1, echo: [[0.04, 0.1]], peak: 0.6 }) },
    jet: { n: 2, bus: 'world', max: 3, gen: whoosh, o: { len: 0.22, f0: 700, f1: 500, peak: 0.45 } },
    crit: { n: 1, bus: 'ui', gen: tones, o: { notes: [[1568, 0.04], [2349, 0.08]], peak: 0.3 } },
    headshot: { n: 1, bus: 'ui', gen: tones, o: { wave: 'tri', notes: [[1047, 0.05], [1568, 0.05], [2093, 0.1]], peak: 0.35 } },
    streak: { n: 1, bus: 'ui', gen: tones, o: { notes: [[523, 0.07], [659, 0.07], [784, 0.07], [1047, 0.07], [1319, 0.18]], peak: 0.45 } },
    casing: { n: 3, bus: 'world', max: 4, gen: click, o: { len: 0.1, taps: [[0, 4200, 9, 0.8], [0.03, 5200, 9, 0.5], [0.06, 3800, 9, 0.3]], peak: 0.3 } },
    empty: { n: 1, bus: 'gun', gen: click, o: { len: 0.06, taps: [[0, 3200, 6, 1]] } },
    mag_out: { n: 2, bus: 'gun', gen: click, o: { len: 0.12, taps: [[0, 1800, 4, 1], [0.04, 900, 3, 0.6]] } },
    mag_in: { n: 2, bus: 'gun', gen: click, o: { len: 0.14, taps: [[0, 1400, 4, 0.8], [0.05, 2600, 6, 1]] } },
    rack: { n: 2, bus: 'gun', gen: click, o: { len: 0.2, taps: [[0, 1200, 3, 0.8], [0.09, 2200, 5, 1]] } },
    shell_in: { n: 2, bus: 'gun', gen: click, o: { len: 0.08, taps: [[0, 1600, 4, 0.9], [0.025, 700, 3, 0.5]] } },
    switch: { n: 1, bus: 'gun', gen: click, o: { len: 0.12, taps: [[0, 900, 3, 0.7], [0.05, 1900, 5, 0.6]] } },
    step: { n: 4, bus: 'world', max: 3, gen: thud, o: { len: 0.12, lp: 600, f0: 110, f1: 55, peak: 0.35 } },
    land: { n: 2, bus: 'world', gen: thud, o: { len: 0.2, lp: 500, f0: 90, f1: 40, peak: 0.55 } },
    hit: { n: 4, bus: 'world', max: 6, gen: squelch, o: { len: 0.16, f: 700 } },
    head: { n: 3, bus: 'world', max: 4, gen: squelch, o: { len: 0.24, f: 1300, peak: 0.85 } },
    impact: { n: 4, bus: 'world', max: 6, gen: click, o: { len: 0.08, taps: [[0, 2400, 2, 1], [0.01, 900, 2, 0.5]], peak: 0.4 } },
    groan: { n: 6, bus: 'world', max: 5, gen: voice, o: { dur: 1.1, f0: 95, F1: 520, F2: 980, breath: 0.35, drop: 0.25 } },
    screech: { n: 4, bus: 'world', max: 3, gen: voice, o: { dur: 0.7, f0: 170, F1: 800, F2: 1700, breath: 0.6, drop: 0.1 } },
    roar: { n: 3, bus: 'world', max: 2, gen: voice, o: { dur: 1.5, f0: 52, F1: 380, F2: 760, breath: 0.5, drop: 0.3, peak: 0.85 } },
    die: { n: 4, bus: 'world', max: 4, gen: voice, o: { dur: 0.8, f0: 85, F1: 480, F2: 900, breath: 0.45, drop: 0.6 } },
    swipe: { n: 3, bus: 'world', max: 3, gen: whoosh, o: { len: 0.22, f0: 500, f1: 2400 } },
    slash: { n: 3, bus: 'gun', max: 3, gen: whoosh, o: { len: 0.2, f0: 2600, f1: 700, peak: 0.7 } },
    heavy: { n: 2, bus: 'gun', max: 2, gen: whoosh, o: { len: 0.34, f0: 300, f1: 1300, peak: 0.75 } },
    chop: { n: 4, bus: 'world', max: 5, gen: chop, o: { len: 0.26, f: 900, thump: 80, peak: 0.9 } },
    cleave: { n: 2, bus: 'world', max: 3, gen: chop, o: { len: 0.4, f: 520, thump: 55, crack: 1.6, peak: 1 } },
    gore: { n: 3, bus: 'world', max: 4, gen: squelch, o: { len: 0.32, f: 420, peak: 0.85 } },
    saber_on: { n: 1, bus: 'gun', gen: hum, o: { len: 0.55, f0: 70, f1: 130, env: 'up', peak: 0.6 } },
    saber_swing: { n: 3, bus: 'gun', max: 3, gen: hum, o: { len: 0.32, f0: 95, f1: 190, noise: 0.25, peak: 0.65 } },
    saber_hit: { n: 3, bus: 'world', max: 4, gen: sizzle, o: { len: 0.35, peak: 0.7 } },
    clank: { n: 2, bus: 'world', max: 3, gen: click, o: { len: 0.18, taps: [[0, 1700, 6, 1], [0.04, 2900, 8, 0.6], [0.09, 1300, 6, 0.35]], peak: 0.55 } },
    hurt: { n: 3, bus: 'world', gen: thud, o: { len: 0.3, lp: 900, f0: 140, f1: 50, noise: 1.6, peak: 0.7 } },
    marker: { n: 1, bus: 'ui', gen: tones, o: { wave: 'tri', notes: [[1760, 0.03]], peak: 0.25 } },
    coin: { n: 1, bus: 'ui', gen: tones, o: { notes: [[988, 0.06], [1319, 0.12]], peak: 0.3 } },
    pickup: { n: 1, bus: 'ui', gen: tones, o: { wave: 'tri', notes: [[523, 0.07], [659, 0.07], [784, 0.07], [1047, 0.14]], peak: 0.4 } },
    buy: { n: 1, bus: 'ui', gen: tones, o: { notes: [[1319, 0.05], [1568, 0.05], [2093, 0.16]], peak: 0.35 } },
    deny: { n: 1, bus: 'ui', gen: tones, o: { notes: [[196, 0.09], [147, 0.16]], peak: 0.35 } },
    wave_start: { n: 1, bus: 'ui', gen: horn, o: { len: 1.8, freqs: [110, 164.8, 220.5] } },
    wave_clear: { n: 1, bus: 'ui', gen: tones, o: { wave: 'tri', notes: [[392, 0.12], [523, 0.12], [659, 0.12], [784, 0.3]], peak: 0.45 } },
    wind: { n: 1, bus: 'amb', loop: true, gen: wind, o: { len: 9 } },
    rain: { n: 1, bus: 'amb', loop: true, gen: rain, o: { len: 6 } },
    thunder: { n: 3, bus: 'world', max: 2, gen: thunder, o: { len: 3.2 } },
    music_drone: { n: 1, bus: 'music', loop: true, gen: drone, o: {} },
    music_perc: { n: 1, bus: 'music', loop: true, gen: perc, o: {} },
  };
  const ORDER = ['marker', 'coin', 'pistol', 'empty', 'mag_out', 'mag_in', 'switch', 'step', 'land', 'hit', 'head', 'impact', 'groan', 'die', 'swipe', 'hurt',
    'screech', 'roar', 'boom', 'rocket', 'turret', 'jet', 'casing', 'crit', 'headshot', 'streak', 'shotgun', 'rack', 'shell_in', 'smg', 'rifle', 'pickup', 'buy', 'deny', 'wave_start', 'wave_clear', 'slash', 'heavy', 'chop', 'cleave', 'gore', 'saber_on', 'saber_swing', 'saber_hit', 'clank', 'thunder', 'wind', 'rain', 'music_drone', 'music_perc'];

  BZ.makeAudio = (G) => {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || BZ.params.noaudio) {
      const nop = () => {};
      return { ready: () => 1, update: nop, play: nop, playAt: nop, unlock: nop, setVolume: nop, setMusic: nop, duck: nop, ctx: null };
    }
    const ctx = new AC();
    const sr = ctx.sampleRate;
    const master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    // gentle: Saltline's one-shot squashed everything with -10 dB / 6:1
    comp.threshold.value = -6; comp.knee.value = 6; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.15;
    master.connect(comp); comp.connect(ctx.destination);
    const verb = ctx.createConvolver(); const verbOut = ctx.createGain(); verbOut.gain.value = 0.32;
    verb.connect(verbOut); verbOut.connect(master);
    const bus = {}; const send = {};
    for (const [name, g, s] of [['gun', 0.9, 0.12], ['world', 0.85, 0.28], ['ui', 0.6, 0], ['amb', 0.35, 0.2], ['music', 0.42, 0]]) {
      bus[name] = ctx.createGain(); bus[name].gain.value = g; bus[name].connect(master);
      if (s) { send[name] = ctx.createGain(); send[name].gain.value = s; bus[name].connect(send[name]); send[name].connect(verb); }
    }
    const base = { world: 0.85, music: 0.42, amb: 0.35 };
    const ir = impulse(BZ.rng('ir'), sr);
    const irBuf = ctx.createBuffer(2, ir[0].length, sr); irBuf.copyToChannel(ir[0], 0); irBuf.copyToChannel(ir[1], 1); verb.buffer = irBuf;

    const bufs = {}; const active = {};
    const queue = [];
    for (const name of ORDER) for (let v = 0; v < SOUNDS[name].n; v++) queue.push([name, v]);
    const total = queue.length;
    function genSome(budgetMs) {
      const t0 = performance.now();
      while (queue.length && performance.now() - t0 < budgetMs) {
        const [name, v] = queue.shift();
        const S = SOUNDS[name];
        try {
          const data = S.gen(BZ.rng(BZ.hash(name) + v * 7919), sr, S.o);
          const b = ctx.createBuffer(1, data.length, sr); b.copyToChannel(data, 0);
          (bufs[name] = bufs[name] || [])[v] = b;
          if (S.loop && !loops[name]) startLoop(name);
        } catch (e) { console.error('[audio] generate ' + name + ' failed', e); }
      }
    }
    const loops = {};
    function startLoop(name) {
      const src = ctx.createBufferSource(); src.buffer = bufs[name][0]; src.loop = true;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(g); g.connect(bus[SOUNDS[name].bus]); src.start();
      loops[name] = g;
      applyMusic();
    }
    let musicMix = { music_drone: 0.5, music_perc: 0, wind: 1 };
    function applyMusic() {
      for (const [name, g] of Object.entries(loops)) g.gain.setTargetAtTime(musicMix[name] ?? 0, ctx.currentTime, 0.8);
    }
    function play(name, opts = {}) {
      const list = bufs[name];
      if (!list || !list.length || ctx.state !== 'running') return;
      const S = SOUNDS[name];
      active[name] = active[name] || [];
      active[name] = active[name].filter((s) => !s.done);
      if (S.max && active[name].length >= S.max) { const old = active[name].shift(); try { old.stop(); } catch {} }
      const src = ctx.createBufferSource();
      src.buffer = list[Math.floor(Math.random() * list.length)];
      src.playbackRate.value = (opts.rate || 1) * (1 + (Math.random() - 0.5) * (opts.jitter ?? 0.06));
      const g = ctx.createGain(); g.gain.value = opts.gain ?? 1;
      let node = src;
      if (opts.pan) { const p = ctx.createStereoPanner(); p.pan.value = BZ.clamp(opts.pan, -1, 1); node.connect(p); node = p; }
      node.connect(g); g.connect(bus[S.bus]);
      src.onended = () => { src.done = true; };
      src.start();
      active[name].push(src);
    }
    function playAt(name, pos, opts = {}) {
      const L = G.player; if (!L) return;
      const dx = pos.x - L.pos.x; const dz = pos.z - L.pos.z;
      const d = Math.hypot(dx, dz);
      const gain = (opts.gain ?? 1) / (1 + Math.pow(d / 7, 1.5));
      if (gain < 0.02) return;
      const pan = d > 0.01 ? (dx * Math.cos(L.yaw) - dz * Math.sin(L.yaw)) / d : 0;
      play(name, { ...opts, gain, pan: pan * 0.8 });
    }
    function duck() {
      const t = ctx.currentTime;
      for (const name of ['world', 'music', 'amb']) {
        const p = bus[name].gain; p.cancelScheduledValues(t); p.setValueAtTime(p.value, t);
        p.linearRampToValueAtTime(base[name] * 0.6, t + 0.012); p.setTargetAtTime(base[name], t + 0.08, 0.1);
      }
    }
    return {
      ctx,
      ready: () => 1 - queue.length / total,
      update() { if (queue.length) genSome(6); },
      play, playAt, duck,
      unlock() { if (ctx.state !== 'running') ctx.resume().catch(() => {}); },
      setVolume(v) { master.gain.setTargetAtTime(v, ctx.currentTime, 0.05); },
      setMusic(mix) { musicMix = { ...musicMix, ...mix }; applyMusic(); },
      debug: () => ({ state: ctx.state, ready: Object.keys(bufs).length, queued: queue.length }),
    };
  };
})();
