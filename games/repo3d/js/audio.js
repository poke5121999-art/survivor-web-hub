// Sound made in code: every sample is synthesized into Float32 buffers at start (no audio files), played through
// HRTF panners placed in the world, an indoor convolution reverb (generated impulse response), compressor + limiter.
// Sounds: footsteps by floor (wood / stone / tile / metal), loot hits and breaks by material, foe steps and roars,
// door creaks, pad hold ticks and cash chord, heartbeat when a foe hunts close, hurt, skill cast, revive.
// Every trigger is logged in audio.log even with sound off (?audio=0) or before the context starts, so tests can count them.
const SR = 44100;
const FLOOR = { vampire: 'wood', pyramid: 'stone', vietnam: 'tile', spacestation: 'metal', asylum: 'tile', station: 'metal' };

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 * 2 - 1; }; }
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));
function lowpass(x, k) { let y = 0; for (let i = 0; i < x.length; i++) { y += k * (x[i] - y); x[i] = y; } return x; }
function highpass(x, k) { let y = 0, px = 0; for (let i = 0; i < x.length; i++) { y = k * (y + x[i] - px); px = x[i]; x[i] = y; } return x; }
function norm(x, peak = 0.9) { let m = 0; for (const v of x) m = Math.max(m, Math.abs(v)); if (m > 0) for (let i = 0; i < x.length; i++) x[i] *= peak / m; return x; }
const buf = (sec) => new Float32Array(Math.max(1, Math.round(sec * SR)));
const partials = (x, list, seed = 1) => { const n = rng(seed); for (const [f, a, d] of list) { const ph = n() * 3; for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] += a * Math.sin(6.2831853 * f * t + ph) * Math.exp(-t / d); } } return x; };
const noise = (x, a, att, dec, seed = 7) => { const n = rng(seed); for (let i = 0; i < x.length; i++) x[i] += a * n() * env(i / SR, att, dec); return x; };

// ---- the sound table: name -> () => Float32Array (mono)
const SYNTH = {
  step_wood: () => norm(partials(lowpass(noise(buf(0.12), 1, 0.002, 0.02, 3), 0.25), [[110, 0.6, 0.03], [240, 0.25, 0.02]], 3), 0.7),
  step_stone: () => norm(highpass(noise(buf(0.09), 1, 0.001, 0.014, 5), 0.9), 0.55),
  step_tile: () => norm(partials(highpass(noise(buf(0.1), 1, 0.001, 0.008, 9), 0.85), [[880, 0.25, 0.03], [1960, 0.12, 0.02]], 9), 0.55),
  step_metal: () => norm(partials(noise(buf(0.25), 0.5, 0.001, 0.01, 11), [[430, 0.5, 0.09], [1170, 0.35, 0.07], [2310, 0.2, 0.05], [95, 0.5, 0.04]], 11), 0.6),
  hit_wood: () => norm(partials(lowpass(noise(buf(0.25), 1, 0.001, 0.03, 13), 0.3), [[160, 0.8, 0.06], [410, 0.4, 0.04], [730, 0.2, 0.03]], 13)),
  hit_metal: () => norm(partials(noise(buf(1.1), 0.4, 0.001, 0.01, 17), [[312, 0.7, 0.5], [847, 0.5, 0.35], [1591, 0.35, 0.25], [2650, 0.2, 0.15], [3921, 0.1, 0.1]], 17)),
  hit_ceramic: () => norm(partials(highpass(noise(buf(0.4), 0.6, 0.001, 0.008, 19), 0.9), [[2140, 0.6, 0.12], [3310, 0.4, 0.08], [5020, 0.2, 0.05]], 19)),
  hit_soul: () => norm(partials(buf(1.2), [[880, 0.5, 0.5], [1320, 0.35, 0.4], [1760, 0.2, 0.3], [2637, 0.1, 0.2]], 23), 0.6),
  break_ceramic: () => { const x = buf(0.9); const n = rng(29); for (let k = 0; k < 26; k++) { const t0 = Math.abs(n()) * 0.35, f = 1800 + Math.abs(n()) * 4200, s = Math.round(t0 * SR); for (let i = s; i < x.length; i++) { const t = (i - s) / SR; x[i] += 0.3 * Math.sin(6.2831853 * f * t) * Math.exp(-t / 0.05); } } return norm(highpass(noise(x, 0.8, 0.001, 0.06, 29), 0.8)); },
  break_wood: () => norm(partials(lowpass(noise(noise(buf(0.6), 1, 0.001, 0.02, 31), 0.6, 0.03, 0.12, 37), 0.4), [[90, 0.6, 0.12]], 31)),
  break_soul: () => { const x = SYNTH.break_ceramic(); partials(x, [[660, 0.3, 0.6], [990, 0.2, 0.5]], 41); return norm(x); },
  foe_step: () => norm(partials(lowpass(noise(buf(0.35), 0.8, 0.002, 0.03, 43), 0.2), [[58, 1, 0.09], [240, 0.3, 0.06], [690, 0.25, 0.12], [1430, 0.12, 0.08]], 43)),
  roar: () => {   // rusted robot growl: detuned saws with a slow FM wobble, bit-crushed, rising then falling
    const x = buf(1.5), n = rng(47); let p1 = 0, p2 = 0, p3 = 0, hold = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / SR, a = env(t, 0.25, 0.45), f = 62 + 40 * Math.sin(Math.min(1, t / 1.1) * Math.PI) + 9 * Math.sin(t * 37);
      p1 += f / SR; p2 += f * 1.507 / SR; p3 += f * 0.497 / SR;
      let v = (p1 % 1) * 2 - 1 + 0.6 * ((p2 % 1) * 2 - 1) + 0.8 * ((p3 % 1) * 2 - 1) + 0.5 * n();
      v = Math.tanh(v * 2.2);
      if (i % 3 === 0) hold = Math.round(v * 9) / 9;
      x[i] = hold * a;
    }
    return norm(lowpass(x, 0.35), 0.85);
  },
  door_creak: () => {   // stick-slip: friction pulses whose rate drifts up and down
    const x = buf(1.0), n = rng(53); let ph = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / SR, rate = 38 + 30 * Math.sin(t * 4.1) + 12 * Math.sin(t * 11.3);
      ph += rate / SR; const pulse = Math.exp(-((ph % 1) * 9));
      x[i] = pulse * (Math.sin(6.2831853 * (420 + 120 * Math.sin(t * 3)) * t) + 0.3 * n()) * env(t, 0.06, 0.4);
    }
    return norm(highpass(x, 0.97), 0.5);
  },
  pad_tick: () => norm(partials(buf(0.12), [[1320, 0.6, 0.03], [2640, 0.2, 0.02]], 59), 0.4),
  pad_cash: () => { const x = buf(1.4); [523.25, 659.25, 783.99, 1046.5].forEach((f, k) => { const s = Math.round(k * 0.09 * SR); for (let i = s; i < x.length; i++) { const t = (i - s) / SR; x[i] += 0.3 * (Math.sin(6.2831853 * f * t) + 0.3 * Math.sin(6.2831853 * f * 2 * t)) * Math.exp(-t / 0.45); } }); return norm(x, 0.6); },
  heartbeat: () => { const x = buf(0.6); for (const [t0, a] of [[0, 1], [0.2, 0.7]]) { const s = Math.round(t0 * SR); for (let i = s; i < x.length; i++) { const t = (i - s) / SR; x[i] += a * Math.sin(6.2831853 * (52 - 18 * t) * t) * env(t, 0.01, 0.07); } } return norm(lowpass(x, 0.2), 0.9); },
  hurt: () => norm(partials(lowpass(noise(buf(0.4), 1, 0.001, 0.05, 61), 0.5), [[140, 0.8, 0.1], [97, 0.5, 0.15]], 61), 0.8),
  skill: () => { const x = buf(0.9); let ph = 0; for (let i = 0; i < x.length; i++) { const t = i / SR; ph += (500 + 1400 * t) / SR; x[i] = (Math.sin(6.2831853 * ph) + 0.4 * Math.sin(6.2831853 * ph * 2.01)) * env(t, 0.02, 0.3); } return norm(x, 0.45); },
  // melee (js/melee.js): swings are a band-passed noise sweep; a fist on a robot is a metal clank over a low body thud
  whoosh: () => { const x = buf(0.24), n = rng(71); let y = 0, z = 0; for (let i = 0; i < x.length; i++) { const t = i / SR, k = 0.04 + 0.5 * Math.sin(Math.PI * Math.min(1, t / 0.2)) ** 2; y += k * (n() - y); z += 0.5 * (y - z); x[i] = (y - z) * Math.sin(Math.PI * Math.min(1, t / 0.22)); } return norm(x, 0.6); },
  whoosh_bat: () => { const x = buf(0.36), n = rng(73); let y = 0, z = 0; for (let i = 0; i < x.length; i++) { const t = i / SR, k = 0.02 + 0.3 * Math.sin(Math.PI * Math.min(1, t / 0.32)) ** 2; y += k * (n() - y); z += 0.35 * (y - z); x[i] = (y - z) * Math.sin(Math.PI * Math.min(1, t / 0.34)); } return norm(x, 0.7); },
  whiff: () => norm(highpass(noise(buf(0.12), 1, 0.01, 0.04, 79), 0.6), 0.3),
  punch_hit: () => { const x = buf(0.5); partials(x, [[880, 0.5, 0.06], [1610, 0.35, 0.05], [2790, 0.2, 0.035], [4100, 0.1, 0.02]], 83); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] += 1.1 * Math.sin(6.2831853 * (95 - 40 * t) * t) * env(t, 0.002, 0.07); } noise(x, 0.35, 0.001, 0.012, 85); return norm(x, 0.95); },
  bat_hit: () => { const x = buf(0.6); partials(x, [[640, 0.45, 0.08], [1220, 0.3, 0.06], [2350, 0.15, 0.04]], 87); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] += 1.3 * Math.sin(6.2831853 * (70 - 25 * t) * t) * env(t, 0.002, 0.09); } lowpass(noise(x, 0.6, 0.001, 0.02, 89), 0.6); return norm(x, 1); },
  punch_wall: () => { const x = buf(0.35); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] += Math.sin(6.2831853 * (120 - 60 * t) * t) * env(t, 0.002, 0.05); } lowpass(noise(x, 0.5, 0.001, 0.03, 91), 0.35); return norm(x, 0.8); },
  punch_door: () => { const x = buf(0.45); partials(x, [[190, 0.8, 0.09], [410, 0.5, 0.06], [760, 0.25, 0.04]], 93); lowpass(noise(x, 0.4, 0.001, 0.02, 95), 0.4); return norm(x, 0.85); },
  // grab beam: a hum that loops (integer cycles in 0.5 s), clicks on grip / release, a crack when it snaps, a floor scrape
  hum: () => { const x = buf(0.5); for (let i = 0; i < x.length; i++) { const t = i / SR, am = 0.8 + 0.2 * Math.sin(6.2831853 * 4 * t); x[i] = am * (0.6 * Math.sin(6.2831853 * 110 * t) + 0.3 * Math.sin(6.2831853 * 220 * t + 0.4) + 0.12 * Math.sin(6.2831853 * 330 * t + 1.1) + 0.05 * Math.sin(6.2831853 * 880 * t)); } return norm(x, 0.5); },
  beam_on: () => norm(partials(highpass(noise(buf(0.12), 0.6, 0.001, 0.008, 97), 0.8), [[1760, 0.5, 0.03], [2640, 0.3, 0.02]], 97), 0.5),
  beam_off: () => norm(partials(highpass(noise(buf(0.1), 0.5, 0.001, 0.006, 99), 0.8), [[1320, 0.5, 0.025], [990, 0.3, 0.03]], 99), 0.45),
  beam_snap: () => { const x = buf(0.4); noise(x, 1, 0.001, 0.03, 101); highpass(x, 0.7); partials(x, [[2200, 0.4, 0.05], [3700, 0.25, 0.03], [600, 0.4, 0.08]], 101); return norm(x, 0.9); },
  scrape: () => norm(highpass(noise(noise(buf(0.25), 0.7, 0.01, 0.08, 103), 0.4, 0.04, 0.1, 107), 0.85), 0.45),
  roll_wood: () => norm(lowpass(noise(buf(1), 1, 0, 9, 109), 0.06), 0.5),
  roll_stone: () => norm(lowpass(noise(buf(1), 1, 0, 9, 111), 0.12), 0.5),
  roll_tile: () => { const x = lowpass(noise(buf(1), 1, 0, 9, 113), 0.1); for (let i = 0; i < x.length; i++) x[i] += 0.4 * Math.sin(6.2831853 * 8 * i / SR) ** 40; return norm(x, 0.5); },
  roll_metal: () => { const x = lowpass(noise(buf(1), 1, 0, 9, 117), 0.15); partials(x, [[180, 0.15, 9], [410, 0.08, 9]], 117); return norm(x, 0.5); },
  // landing thumps by floor: a low body thud plus the floor's own click
  land_wood: () => norm(partials(lowpass(noise(buf(0.35), 1, 0.002, 0.04, 121), 0.25), [[75, 1, 0.08], [160, 0.5, 0.05]], 121), 0.85),
  land_stone: () => norm(partials(lowpass(noise(buf(0.3), 0.8, 0.001, 0.025, 123), 0.4), [[60, 1, 0.06]], 123), 0.8),
  land_tile: () => norm(partials(highpass(noise(buf(0.3), 0.6, 0.001, 0.02, 125), 0.6), [[70, 1, 0.06], [900, 0.2, 0.02]], 125), 0.8),
  land_metal: () => norm(partials(noise(buf(0.6), 0.5, 0.001, 0.02, 127), [[70, 1, 0.08], [380, 0.5, 0.15], [1020, 0.3, 0.1]], 127), 0.85),
  // foe moves: the gunner's lock beep and shot, the rook's stomp
  aim_beep: () => norm(partials(buf(0.18), [[1760, 1, 0.05], [2640, 0.4, 0.04]], 131), 0.5),
  gun_foe: () => norm(partials(lowpass(noise(buf(0.45), 1, 0.001, 0.06, 133), 0.5), [[110, 0.8, 0.07], [55, 0.6, 0.12]], 133), 0.95),
  stomp: () => norm(partials(lowpass(noise(buf(0.5), 0.7, 0.002, 0.05, 135), 0.15), [[48, 1, 0.14], [96, 0.4, 0.08]], 135), 0.95),
  ping: () => { const x = buf(0.7); for (const [f, a, d] of [[1568, 0.55, 0.22], [2349, 0.3, 0.16], [3136, 0.12, 0.08]]) for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] += a * Math.sin(6.2831853 * f * (t + 0.004 * Math.sin(t * 40))) * env(t, 0.004, d); } return norm(x, 0.5); },   // loot scan: glassy bell, pitch set per play
  revive: () => norm(partials(buf(1.2), [[392, 0.4, 0.6], [587.3, 0.35, 0.6], [784, 0.3, 0.5]], 67), 0.5),
};
export const SOUNDS = Object.keys(SYNTH);

function impulse(ctx, sec = 1.6) {
  const n = Math.round(sec * ctx.sampleRate), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c), r = rng(101 + c); let y = 0; for (let i = 0; i < n; i++) { y += 0.35 * (r() - y); d[i] = y * Math.exp(-i / (n * 0.22)) * (i < 60 ? i / 60 : 1); } }
  return b;
}

export class Audio {
  constructor(G, opts = {}) {
    this.G = G;
    this.enabled = opts.audio !== false;
    this.log = [];
    this.ctx = null;
    this.buffers = {};
    this.t = 0;
    this.stepPhase = 0; this.beatT = 0; this.tickT = 0; this.lastHurt = 0;
    this.foeStep = new Map();
    this.vol = 0.9;
    this.hook();
  }

  /** Create the context and synthesize the table (needs a user gesture in a browser; tests call it after a click). */
  start() {
    if (!this.enabled || this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    const ctx = this.ctx = new AC({ sampleRate: SR });
    this.master = ctx.createGain(); this.master.gain.value = this.vol;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 1024;
    this.master.connect(comp); comp.connect(this.analyser); this.analyser.connect(ctx.destination);
    this.verb = ctx.createConvolver(); this.verb.buffer = impulse(ctx);
    this.verbGain = ctx.createGain(); this.verbGain.gain.value = 0.32;
    this.verb.connect(this.verbGain); this.verbGain.connect(this.master);
    const t0 = performance.now();
    for (const [k, fn] of Object.entries(SYNTH)) { const d = fn(), b = ctx.createBuffer(1, d.length, SR); b.copyToChannel(d, 0); this.buffers[k] = b; }
    this.synthMs = performance.now() - t0;
    if (ctx.state !== 'running') ctx.resume?.();
    return ctx;
  }

  /** Mean absolute level at the output right now (tests). */
  level() {
    if (!this.analyser) return 0;
    const a = new Float32Array(this.analyser.fftSize); this.analyser.getFloatTimeDomainData(a);
    let s = 0; for (const v of a) s += Math.abs(v); return s / a.length;
  }

  /** One-shot. at: {x, y, z} world position or null (head-locked). */
  play(name, at = null, vol = 1, rate = 1) {
    this.log.push([name, +this.t.toFixed(2)]);
    if (this.log.length > 4000) this.log.splice(0, 2000);
    const ctx = this.ctx, b = this.buffers[name];
    if (!ctx || !b || ctx.state !== 'running' || !(vol > 0.002)) return;
    const src = ctx.createBufferSource(); src.buffer = b; src.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = Math.min(2, vol);
    src.connect(g);
    let out = g;
    if (at) {
      const p = ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 1.5; p.rolloffFactor = 1.3; p.maxDistance = 40;
      p.positionX.value = at.x; p.positionY.value = at.y ?? 1; p.positionZ.value = at.z;
      g.connect(p); out = p;
    }
    out.connect(this.master);
    const send = ctx.createGain(); send.gain.value = 0.6; out.connect(send); send.connect(this.verb);
    src.start();
  }

  /** A looping sound by name (one voice per name): vol 0 silences it; rate and position follow every call. */
  loopSet(name, vol, rate = 1, at = null) {
    if (name === 'roll') name = 'roll_' + this.floor();
    const ctx = this.ctx, L = (this.loops ||= new Map()).get(name);
    if (!ctx || ctx.state !== 'running') return;
    if (!L) {
      if (!(vol > 0.002)) return;
      const b = this.buffers[name]; if (!b) return;
      const src = ctx.createBufferSource(); src.buffer = b; src.loop = true;
      const g = ctx.createGain(); g.gain.value = 0; src.connect(g);
      let out = g, p = null;
      if (at) { p = ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 1.5; p.rolloffFactor = 1.3; g.connect(p); out = p; }
      out.connect(this.master); src.start();
      this.loops.set(name, { src, g, p }); this.log.push(['loop:' + name, +this.t.toFixed(2)]);
      return this.loopSet(name, vol, rate, at);
    }
    L.g.gain.setTargetAtTime(Math.max(0, Math.min(1.5, vol)), ctx.currentTime, 0.05);
    L.src.playbackRate.setTargetAtTime(rate, ctx.currentTime, 0.05);
    if (at && L.p) { L.p.positionX.value = at.x; L.p.positionY.value = at.y ?? 1; L.p.positionZ.value = at.z; }
  }

  hook() {
    const E = this.G.events; if (!E) return;
    const pos = (it) => { const t = it.body.translation(); return { x: t.x, y: t.y, z: t.z }; };
    E.on('loot:hit', (e) => { if (e.item.dead) return; this.play('hit_' + (SYNTH['hit_' + e.item.material] ? e.item.material : 'wood'), e.point || pos(e.item), Math.min(1.2, 0.25 + e.dv * 0.18), 0.9 + Math.random() * 0.2); });
    E.on('loot:break', (e) => this.play('break_' + (SYNTH['break_' + e.item.material] ? e.item.material : 'wood'), e.point, 1));   // the body is already removed here
    E.on('pad:extract', (e) => this.play('pad_cash', { x: e.pad.x, y: (e.pad.y || 0) + 0.5, z: e.pad.z }, 1));
    E.on('foe:spot', (e) => this.play('roar', { x: e.foe.x, y: e.foe.h * 0.8, z: e.foe.z }, e.foe.def.speed > 0 ? 1.1 : 0.7, 1.15 - Math.min(0.35, (e.foe.robot.height - 1.2) * 0.25)));
    E.on('door:open', (e) => this.play('door_creak', { x: e.x, y: 1.2, z: e.z }, 0.7, 0.85 + Math.random() * 0.3));
    E.on('skill:cast', () => this.play('skill', null, 0.8));
    E.on('run:revive', () => this.play('revive', null, 0.9));
  }

  floor() { const G = this.G; return FLOOR[G.station ? 'station' : G.house?.theme] || 'wood'; }

  /** Per render frame: listener, footsteps, foe steps, heartbeat, pad ticks, hurt. */
  step(dt) {
    const G = this.G, P = G.player, cam = G.camera;
    this.t += dt;
    const L = this.ctx?.listener;
    if (L && cam) {
      const e = cam.matrixWorld.elements;
      if (L.positionX && e.every(Number.isFinite)) { L.positionX.value = e[12]; L.positionY.value = e[13]; L.positionZ.value = e[14]; L.forwardX.value = -e[8]; L.forwardY.value = -e[9]; L.forwardZ.value = -e[10]; L.upX.value = e[4]; L.upY.value = e[5]; L.upZ.value = e[6]; }
    }
    if (!P) return;
    // player footsteps: one per half bob cycle (the head bob is driven by distance walked)
    if (!P.down && P.grounded && (P.horizSpeed || 0) > 0.4) {
      const ph = Math.floor((P.bob || 0) / Math.PI);
      if (ph !== this.stepPhase) {
        this.stepPhase = ph;
        const sneak = P.eye < 0.975, run = P.sprinting;   // midway between the stand (1.2) and crouch (0.75) eye
        const p = P.position;
        this.play('step_' + this.floor(), { x: p.x, y: 0.05, z: p.z }, (sneak ? 0.25 : run ? 0.95 : 0.55) * (P.invisT > 0 ? 0 : 1), 0.9 + Math.random() * 0.2);
      }
    }
    // foe steps within 22 m, cadence from speed and size
    const p = P.position;
    let hunt = 0;
    for (const f of G.foes?.list || []) {
      if (f.dead) continue;
      const d = Math.hypot(f.x - p.x, f.z - p.z);
      if ((f.state === 'chase' || f.state === 'attack') && !P.down && !f.quiet) hunt = Math.max(hunt, 1 - d / 9);
      if (d > 22 || f.def.beh === 'ghost' || !(f.moveSpeed > 0.3)) continue;
      const stride = 0.55 * Math.max(0.6, f.robot.height / 1.6);
      const acc = (this.foeStep.get(f) || 0) + f.moveSpeed * dt / stride;
      if (acc >= 1) { this.play('foe_step', { x: f.x, y: 0.05, z: f.z }, Math.min(1.4, 0.5 * f.robot.height / 1.4), 1.25 - Math.min(0.5, f.robot.height * 0.15)); this.foeStep.set(f, acc - 1); }
      else this.foeStep.set(f, acc);
    }
    // heartbeat while something hunts within 9 m: faster and louder as it closes in
    this.hunt = Math.max(0, hunt);
    if (this.hunt > 0) {
      this.beatT -= dt;
      if (this.beatT <= 0) { this.beatT = 1.05 - 0.6 * this.hunt; this.play('heartbeat', null, 0.35 + 0.65 * this.hunt); }
    } else this.beatT = 0;
    // pad hold: a tick every 0.5 s, pitch rising with the hold
    const X = G.extract, pad = X?.pads?.[X.active];
    if (pad && pad.hold > 0) { this.tickT -= dt; if (this.tickT <= 0) { this.tickT = 0.5; this.play('pad_tick', { x: pad.x, y: (pad.y || 0) + 0.4, z: pad.z }, 0.6, 1 + pad.hold / 3); } } else this.tickT = 0;
    // hurt
    if ((P.hurtT || 0) > this.lastHurt + 0.05) this.play('hurt', null, 0.9);
    this.lastHurt = P.hurtT || 0;
  }
}
