// Sound without files: a table of generators rendered offline into AudioBuffers (a slice per frame),
// buses -> lowpass -> compressor (-3 dB, 2:1) -> soft clip -> master, generated reverb for outdoor/indoor.
import { mulberry, hash32, clamp } from './rng.js';

const SR = 44100;
function noiseGen(seed) { const r = mulberry(seed); return () => r() * 2 - 1; }
function env(t, a, d) { return t < a ? t / a : Math.exp(-(t - a) / d); }
function lp(prev, x, k) { return prev + (x - prev) * k; }

// each generator fills a Float32Array (mono) of length n for variant v
const GEN = {
  rifle(n, v, seed) { const o = new Float32Array(n); const nz = noiseGen(seed); let l1 = 0, l2 = 0, h = 0, ph = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; const w = nz();
      h = w - lp(h, w, 0.08); // high crack
      l1 = lp(l1, w, 0.04); l2 = lp(l2, l1, 0.05);
      const f = 160 * Math.exp(-t * 18) + 45; ph += f / SR * 6.283;
      o[i] = h * env(t, 0.0005, 0.012) * 0.9 + Math.sin(ph) * env(t, 0.001, 0.07) * 0.9 + l2 * env(t, 0.002, 0.18) * 4.5; }
    return o; },
  tail(n, v, seed) { const o = new Float32Array(n); const nz = noiseGen(seed); let l = 0, l2 = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; const w = nz(); l = lp(l, w, 0.03); l2 = lp(l2, l, 0.04);
      const echo = Math.exp(-t * 2.2) * (1 + 0.6 * Math.sin(t * 9 + v)); o[i] = l2 * echo * 3.0 * env(t, 0.03, 1.2); }
    return o; },
  step(n, v, seed, kind) { const o = new Float32Array(n); const nz = noiseGen(seed); let l = 0, b = 0, b2 = 0;
    const k = kind === 'gravel' ? 0.5 : kind === 'water' ? 0.25 : kind === 'concrete' ? 0.12 : 0.18;
    for (let i = 0; i < n; i++) { const t = i / SR; const w = nz(); l = lp(l, w, 0.06); b = lp(b, w, k); b2 = b - lp(b2, b, 0.2);
      let s = Math.sin(t * 6.283 * 70) * env(t, 0.002, 0.03) * 0.6 + l * env(t, 0.003, 0.06) * 1.4;
      if (kind === 'gravel') s += b2 * env(t, 0.004, 0.09) * (0.6 + 0.4 * Math.sin(t * 900 * (1 + v * 0.1))) * 1.2;
      if (kind === 'water') s += (b2 * 1.6 + Math.sin(t * 6.283 * (900 + 400 * Math.sin(t * 40))) * 0.1) * env(t, 0.01, 0.12);
      if (kind === 'concrete') s += b2 * env(t, 0.001, 0.02) * 1.2;
      o[i] = s * 0.8; }
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
  servo(n, v, seed) { const o = new Float32Array(n); let ph = 0; const nz = noiseGen(seed); let l = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; const f = 300 + 500 * Math.sin(t * 7 + v) * Math.sin(t * 3); ph += f / SR * 6.283; l = lp(l, nz(), 0.2);
      o[i] = (Math.sin(ph) * 0.25 + Math.sin(ph * 2.01) * 0.12 + l * 0.15) * env(t, 0.02, 0.25); }
    return o; },
  screech(n, v, seed) { const o = new Float32Array(n); let ph = 0; const nz = noiseGen(seed); let b = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; const f = 900 + 1400 * t + Math.sin(t * 90) * 120; ph += f / SR * 6.283; b = lp(b, nz(), 0.4);
      o[i] = (Math.sign(Math.sin(ph)) * 0.18 + Math.sin(ph * 1.5) * 0.2 + b * 0.25) * env(t, 0.01, 0.3); }
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
  rifle: ['rifle', 4, 0.5, 'gun', 0.9], tail: ['tail', 3, 2.2, 'tail', 0.45],
  step_gravel: ['step', 6, 0.18, 'near', 0.5, 'gravel'], step_water: ['step', 6, 0.22, 'near', 0.55, 'water'],
  step_concrete: ['step', 6, 0.14, 'near', 0.45, 'concrete'], step_asphalt: ['step', 6, 0.14, 'near', 0.45, 'asphalt'],
  shell: ['shell', 4, 0.2, 'near', 0.25], click: ['click', 4, 0.06, 'near', 0.5], thud: ['thud', 3, 0.3, 'world', 0.6],
  ping: ['ping', 4, 0.3, 'world', 0.45], boom: ['boom', 2, 2.5, 'world', 1.0], thunder: ['thunder', 3, 5, 'amb', 0.9],
  servo: ['servo', 4, 0.5, 'world', 0.45], screech: ['screech', 3, 0.5, 'world', 0.55], zap: ['zap', 3, 0.15, 'world', 0.6],
  hurt: ['hurt', 3, 0.2, 'near', 0.8], sting: ['sting', 4, 2.5, 'music', 0.6],
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
      for (let i = 0; i < len; i++) { const w = nz(); l = lp(l, w, 0.35); l2 = lp(l2, w, 0.02); d[i] = l * 0.25 + l2 * 0.9; if (r() < 0.0009) { for (let j = 0; j < 300 && i + j < len; j++) d[i + j] += Math.sin(j * 0.6) * Math.exp(-j / 60) * 0.3 * (r() + 0.3); } } }
    const src = C.createBufferSource(); src.buffer = b; src.loop = true;
    const f = C.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 5200;
    this.rainG = C.createGain(); this.rainG.gain.value = 0.32;
    src.connect(f); f.connect(this.rainG); this.rainG.connect(this.bus.amb); src.start();
    // low drone for tension
    this.droneG = C.createGain(); this.droneG.gain.value = 0.0; this.droneG.connect(this.bus.music);
    for (const fr of [55, 82.4, 110.3]) { const o = C.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; const lf = C.createBiquadFilter(); lf.type = 'lowpass'; lf.frequency.value = 260; o.connect(lf); lf.connect(this.droneG); o.start(); }
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
