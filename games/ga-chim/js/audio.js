// Sound without files: a table of generators rendered offline into AudioBuffers (a slice per frame),
// buses -> lowpass -> compressor (-3 dB, 2:1) -> soft clip -> master, generated reverb for outdoor/indoor.
import { mulberry, hash32, clamp } from './rng.js';

const SR = 44100;
function noiseGen(seed) { const r = mulberry(seed); return () => r() * 2 - 1; }
function env(t, a, d) { return t < a ? t / a : Math.exp(-(t - a) / d); }
function lp(prev, x, k) { return prev + (x - prev) * k; }
// RBJ biquad, processed in place
function biquad(x, type, f, q) {
  const w = 2 * Math.PI * f / SR, c = Math.cos(w), al = Math.sin(w) / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const y = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x[i]; y2 = y1; y1 = y; x[i] = y; }
  return x;
}
function noiseBuf(n, seed) { const nz = noiseGen(seed); const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = nz(); return o; }
function shape(x, fn) { for (let i = 0; i < x.length; i++) x[i] *= fn(i / SR); return x; }
function addTo(o, x, g, off = 0) { for (let i = 0; i < x.length && i + off < o.length; i++) o[i + off] += x[i] * g; return o; }


// each generator fills a Float32Array (mono) of length n for variant v
const GEN = {
    rifle(n, v, seed) { const o = new Float32Array(n);
    // crack: very short high band burst
    addTo(o, shape(biquad(noiseBuf(n, seed), 'hp', 2500, 0.7), (t) => env(t, 0.0002, 0.0035)), 1.2);
    // blast body: mid band noise with a fast decay
    addTo(o, shape(biquad(biquad(noiseBuf(n, seed + 1), 'lp', 2200, 0.7), 'hp', 180, 0.7), (t) => env(t, 0.0006, 0.05) + 0.25 * env(t, 0.002, 0.16)), 1.6);
    // low thump: pitch-swept sine, short
    let ph = 0; for (let i = 0; i < n; i++) { const t = i / SR; ph += (110 * Math.exp(-t * 25) + 48) / SR * 6.283; o[i] += Math.sin(ph) * env(t, 0.001, 0.045) * 0.7; }
    // bolt cycling: two small metallic ticks
    for (const [at, f] of [[0.028 + v * 0.002, 3400], [0.062, 2600]]) addTo(o, shape(biquad(noiseBuf(Math.floor(SR * 0.03), seed + 7), 'bp', f, 6), (t) => env(t, 0.0003, 0.006)), 0.35, Math.floor(at * SR));
    for (let i = 0; i < n; i++) o[i] = Math.tanh(o[i] * 1.4);
    return o; },
    tail(n, v, seed) { const o = new Float32Array(n);
    // distant rumble plus slap-back from the wagons and sheds
    addTo(o, shape(biquad(biquad(noiseBuf(n, seed), 'lp', 600, 0.7), 'lp', 900, 0.7), (t) => env(t, 0.02, 0.9)), 1.4);
    const taps = [[0.09, 0.7], [0.21, 0.5], [0.37, 0.35], [0.62, 0.22], [0.95, 0.12]];
    for (const [at, g] of taps) addTo(o, shape(biquad(noiseBuf(Math.floor(SR * 0.4), seed + at * 1000 + v), 'bp', 700 + v * 90, 1.2), (t) => env(t, 0.004, 0.07)), g, Math.floor(at * SR));
    return o; },
    step(n, v, seed, kind) { const o = new Float32Array(n); const r = mulberry(seed + 3);
    // heel thud: low passed noise, no tonal component
    addTo(o, shape(biquad(noiseBuf(n, seed), 'lp', kind === 'concrete' ? 900 : 500, 0.8), (t) => env(t, 0.002, 0.035)), 1.0);
    if (kind === 'gravel') {
      // a cluster of tiny stone crunches
      for (let g = 0; g < 26; g++) { const at = Math.floor((0.004 + r() * 0.09) * SR); addTo(o, shape(biquad(noiseBuf(Math.floor(SR * 0.012), seed + g), 'bp', 1500 + r() * 3500, 3), (t) => env(t, 0.0003, 0.003)), 0.35 + r() * 0.4, at); }
    } else if (kind === 'water') {
      addTo(o, shape(biquad(biquad(noiseBuf(n, seed + 9), 'bp', 900 + v * 120, 0.9), 'hp', 300, 0.7), (t) => env(t, 0.012, 0.11)), 1.3);
      for (let g = 0; g < 6; g++) addTo(o, shape(biquad(noiseBuf(Math.floor(SR * 0.03), seed + 40 + g), 'bp', 2200 + r() * 2000, 8), (t) => env(t, 0.001, 0.01)), 0.25, Math.floor((0.03 + r() * 0.12) * SR));
    } else {
      // wet asphalt / concrete: sole slap with a little splash hiss
      addTo(o, shape(biquad(noiseBuf(n, seed + 5), 'hp', 2500, 0.7), (t) => env(t, 0.001, kind === 'concrete' ? 0.01 : 0.03)), kind === 'concrete' ? 0.5 : 0.35);
    }
    return o; },
  shell(n, v, seed) { const o = new Float32Array(n); const f = [3100, 4700, 6200].map((x) => x * (1 + v * 0.06));
    for (let i = 0; i < n; i++) { const t = i / SR; o[i] = (Math.sin(t * 6.283 * f[0]) * 0.5 + Math.sin(t * 6.283 * f[1]) * 0.3 + Math.sin(t * 6.283 * f[2]) * 0.2) * env(t, 0.0005, 0.05) * (1 + 0.5 * env(t - 0.07, 0.0005, 0.03) * (t > 0.07 ? 1 : 0)) * 0.35; }
    return o; },
  click(n, v, seed) { const o = new Float32Array(n); const nz = noiseGen(seed); let h = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; const w = nz(); h = w - lp(h, w, 0.3); o[i] = (h * 0.8 + Math.sin(t * 6.283 * (1800 + v * 300)) * 0.4) * env(t, 0.0005, 0.012); }
    return o; },
  thud(n, v, seed) { const o = new Float32Array(n); const nz = noiseGen(seed); let l = 0; let ph = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; l = lp(l, nz(), 0.05); ph += (90 * Math.exp(-t * 10) + 40) / SR * 6.283; o[i] = (Math.sin(ph) * 0.8 + l * 1.5) * env(t, 0.001, 0.08); }
    return o; },
  ping(n, v, seed) { const o = new Float32Array(n); const nz = noiseGen(seed); let h = 0; const f = 1200 + v * 450;
    for (let i = 0; i < n; i++) { const t = i / SR; const w = nz(); h = w - lp(h, w, 0.2); o[i] = (h * env(t, 0.0003, 0.01) + Math.sin(t * 6.283 * f) * env(t, 0.001, 0.12) * 0.45 + Math.sin(t * 6.283 * f * 2.76) * env(t, 0.001, 0.05) * 0.2); }
    return o; },
  boom(n, v, seed) { const o = new Float32Array(n); const nz = noiseGen(seed); let l = 0, l2 = 0; let ph = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; const w = nz(); l = lp(l, w, 0.03); l2 = lp(l2, l, 0.03); ph += (60 * Math.exp(-t * 4) + 25) / SR * 6.283;
      o[i] = (Math.sin(ph) * env(t, 0.002, 0.4) * 1.2 + l2 * env(t, 0.005, 0.9) * 6 + w * env(t, 0.0005, 0.03) * 0.6); }
    return o; },
  thunder(n, v, seed) { const o = new Float32Array(n); const nz = noiseGen(seed); let l = 0, l2 = 0; const r = mulberry(seed + 9);
    const cracks = Array.from({ length: 7 }, () => r() * 1.5);
    for (let i = 0; i < n; i++) { const t = i / SR; const w = nz(); l = lp(l, w, 0.012); l2 = lp(l2, l, 0.02);
      let c = 0; for (const ct of cracks) if (t > ct) c += Math.exp(-(t - ct) * 3);
      o[i] = l2 * (env(t, 0.15, 2.8) * 10 + c * 2) + (t < 0.2 ? w * env(t, 0.001, 0.05) * 0.2 : 0); }
    return o; },
    servo(n, v, seed) { const o = noiseBuf(n, seed);
    // hydraulic whine: a resonant band sweeping through noise, with a gear rattle
    const out = new Float32Array(n); let y1 = 0, y2 = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; const f = 600 + 900 * Math.sin(t * 5 + v) ** 2; const w = 2 * Math.PI * f / SR; const r = 0.995;
      const y = o[i] * (1 - r) + 2 * r * Math.cos(w) * y1 - r * r * y2; y2 = y1; y1 = y; out[i] = y * 6 * env(t, 0.03, 0.3) + (Math.sin(t * 6.283 * 38) > 0.6 ? 0.08 : 0) * env(t, 0.01, 0.2); }
    return out; },
    screech(n, v, seed) { const o = new Float32Array(n);
    // metal scrape: inharmonic partials plus a sweeping band of grit
    const parts = [431, 1173, 2079, 2861].map((f) => f * (1 + v * 0.07));
    for (let i = 0; i < n; i++) { const t = i / SR; let s = 0; for (let k = 0; k < parts.length; k++) s += Math.sin(t * 6.283 * parts[k] * (1 + 0.02 * Math.sin(t * 17 + k))) / (k + 1); o[i] = s * 0.25 * env(t, 0.02, 0.22); }
    addTo(o, shape(biquad(noiseBuf(n, seed), 'bp', 2400, 2), (t) => env(t, 0.01, 0.25)), 0.8);
    return o; },
  zap(n, v, seed) { const o = new Float32Array(n); const nz = noiseGen(seed); let h = 0; let ph = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; const w = nz(); h = w - lp(h, w, 0.15); ph += (1400 * Math.exp(-t * 30) + 300) / SR * 6.283;
      o[i] = (h * env(t, 0.0005, 0.02) * 0.9 + Math.sin(ph) * env(t, 0.001, 0.05) * 0.5); }
    return o; },
  hurt(n, v, seed) { const o = new Float32Array(n); const nz = noiseGen(seed); let l = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; l = lp(l, nz(), 0.08); o[i] = (l * 2 + Math.sin(t * 6.283 * 80) * 0.6) * env(t, 0.003, 0.12); }
    return o; },
  sting(n, v) { const o = new Float32Array(n); const base = [220, 277.2, 329.6, 440][v % 4];
    for (let i = 0; i < n; i++) { const t = i / SR; let s = 0; for (const m of [1, 1.5, 2, 3]) s += Math.sin(t * 6.283 * base * m * (1 + 0.002 * Math.sin(t * 5))) / m; o[i] = s * env(t, 0.05, 1.6) * 0.25; }
    return o; },
};

// name: [gen, variants, seconds, bus, gain, extra]
const TABLE = {
  rifle: ['rifle', 4, 0.35, 'gun', 0.9], tail: ['tail', 3, 2.0, 'tail', 0.35],
  step_gravel: ['step', 6, 0.14, 'near', 0.35, 'gravel'], step_water: ['step', 6, 0.22, 'near', 0.55, 'water'],
  step_concrete: ['step', 6, 0.14, 'near', 0.45, 'concrete'], step_asphalt: ['step', 6, 0.14, 'near', 0.45, 'asphalt'],
  shell: ['shell', 4, 0.2, 'near', 0.25], click: ['click', 4, 0.06, 'near', 0.5], thud: ['thud', 3, 0.3, 'world', 0.6],
  ping: ['ping', 4, 0.3, 'world', 0.45], boom: ['boom', 2, 2.5, 'world', 1.0], thunder: ['thunder', 3, 5, 'amb', 0.9],
  servo: ['servo', 4, 0.5, 'world', 0.45], screech: ['screech', 3, 0.5, 'world', 0.55], zap: ['zap', 3, 0.15, 'world', 0.6],
  hurt: ['hurt', 3, 0.2, 'near', 0.6], sting: ['sting', 4, 2.5, 'music', 0.25],
};

export class Audio {
  constructor(G) { this.G = G; this.ready = false; this.buf = {}; this.queue = Object.keys(TABLE); this.vol = 0.8; }
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    if (this.G.params.noaudio) return;
    const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SR });
    this.master = C.createGain(); this.master.gain.value = this.vol;
    const clip = C.createWaveShaper(); const curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 1.2) / Math.tanh(1.2); } clip.curve = curve;
    const comp = C.createDynamicsCompressor(); comp.threshold.value = -3; comp.ratio.value = 2; comp.attack.value = 0.003; comp.release.value = 0.15;
    this.lowpass = C.createBiquadFilter(); this.lowpass.type = 'lowpass'; this.lowpass.frequency.value = 20000;
    this.lowpass.connect(comp); comp.connect(clip); clip.connect(this.master); this.master.connect(C.destination);
    // reverb from generated impulse responses
    const ir = (sec, decay, seed) => { const b = C.createBuffer(2, SR * sec, SR); for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); const nz = noiseGen(seed + c); for (let i = 0; i < d.length; i++) d[i] = nz() * Math.pow(1 - i / d.length, decay); } return b; };
    this.revOut = C.createConvolver(); this.revOut.buffer = ir(2.6, 3.5, 11); this.revIn = C.createConvolver(); this.revIn.buffer = ir(1.4, 2.2, 23);
    this.revOutG = C.createGain(); this.revInG = C.createGain(); this.revOutG.gain.value = 0.35; this.revInG.gain.value = 0;
    this.revOut.connect(this.revOutG); this.revIn.connect(this.revInG); this.revOutG.connect(this.lowpass); this.revInG.connect(this.lowpass);
    this.bus = {};
    for (const b of ['gun', 'tail', 'near', 'world', 'amb', 'music']) {
      const g = C.createGain(); g.gain.value = b === 'music' ? 0.5 : 1; g.connect(this.lowpass);
      if (b !== 'music' && b !== 'amb') { const s = C.createGain(); s.gain.value = b === 'gun' ? 0.5 : 0.25; g.connect(s); s.connect(this.revOut); s.connect(this.revIn); }
      this.bus[b] = g;
    }
    this.duck = this.bus.world; // ducked under each shot
    this.startRain();
  }
  startRain() {
    const C = this.ctx;
    const len = SR * 4; const b = C.createBuffer(2, len, SR);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); const nz = noiseGen(77 + c); let l = 0, l2 = 0; const r = mulberry(91 + c);
      for (let i = 0; i < len; i++) { const w = nz(); l = lp(l, w, 0.35); l2 = lp(l2, w, 0.02); d[i] = l * 0.18 + l2 * 0.8; if (r() < 0.002) { const g = r() * 0.25; for (let j = 0; j < 90 && i + j < len; j++) d[i + j] += (r() * 2 - 1) * Math.exp(-j / 14) * g; } } }
    const src = C.createBufferSource(); src.buffer = b; src.loop = true;
    const f = C.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3800;
    this.rainG = C.createGain(); this.rainG.gain.value = 0.32;
    src.connect(f); f.connect(this.rainG); this.rainG.connect(this.bus.amb); src.start();
    // low drone for tension
    this.droneG = C.createGain(); this.droneG.gain.value = 0.0; this.droneG.connect(this.bus.music);
    for (const fr of [41.2, 61.7, 82.4]) { const o = C.createOscillator(); o.type = 'sine'; o.frequency.value = fr; o.connect(this.droneG); o.start(); }
  }
  // render a few generators per frame, at most ~6 ms
  pump() {
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < 6) {
      const name = this.queue.shift(); const [gen, vars, sec, , , extra] = TABLE[name];
      this.buf[name] = [];
      for (let v = 0; v < vars; v++) {
        const n = Math.floor(sec * SR); const data = GEN[gen](n, v, hash32(name) + v * 7919, extra);
        let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(data[i]));
        const k = peak > 0 ? 0.9 / peak : 1; for (let i = 0; i < n; i++) data[i] *= k;
        this.buf[name].push(data);
      }
    }
    if (!this.queue.length) this.ready = true;
  }
  play(name, opts = {}) {
    if (!this.ctx || !this.buf[name]) return;
    const C = this.ctx; const [, , , bus, gain] = TABLE[name];
    const arr = this.buf[name]; const data = arr[Math.floor(Math.random() * arr.length)];
    if (!data.ab) { data.ab = C.createBuffer(1, data.length, SR); data.ab.copyToChannel(data, 0); }
    const src = C.createBufferSource(); src.buffer = data.ab; src.playbackRate.value = (opts.rate || 1) * (1 + (Math.random() - 0.5) * 0.08);
    const g = C.createGain(); let vol = gain * (opts.vol ?? 1);
    let node = src;
    if (opts.pos) {
      const cam = this.G.camera; const d = opts.pos.distanceTo(cam.position); vol *= clamp(1 / (1 + d * 0.12), 0, 1);
      const pan = C.createStereoPanner();
      const rel = opts.pos.clone().sub(cam.position).applyQuaternion(cam.quaternion.clone().invert());
      pan.pan.value = clamp(rel.x / (Math.abs(rel.z) + 2), -0.9, 0.9);
      const lpf = C.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = clamp(18000 / (1 + d * 0.08), 1200, 18000);
      src.connect(lpf); lpf.connect(pan); node = pan;
    }
    g.gain.value = vol; node.connect(g); g.connect(this.bus[bus]); src.start();
    if (bus === 'gun') { const dg = this.duck.gain; const t = C.currentTime; dg.cancelScheduledValues(t); dg.setValueAtTime(dg.value, t); dg.linearRampToValueAtTime(0.55, t + 0.012); dg.setValueAtTime(0.55, t + 0.097); dg.linearRampToValueAtTime(1, t + 0.2); }
  }
  update(dt, st) {
    this.pump();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.revInG.gain.setTargetAtTime(st.indoor ? 0.5 : 0, t, 0.3); this.revOutG.gain.setTargetAtTime(st.indoor ? 0.1 : 0.35, t, 0.3);
    this.rainG.gain.setTargetAtTime(st.indoor ? 0.12 : 0.32, t, 0.4);
    this.droneG.gain.setTargetAtTime(0.05 * clamp(st.combat, 0, 1), t, 1.2);
    this.lowpass.frequency.setTargetAtTime(st.dead ? 600 : st.hurt > 0.5 ? 4000 : 20000, t, 0.2);
  }
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; }
}
