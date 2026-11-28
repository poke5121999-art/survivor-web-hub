// Co-op voice chat (rules/voice.md). Host-relayed over the session's RAW channel (js/net/session.js): a guest sends kind 5
// to the host, the host checks it against that guest's rate gate, restamps kind 6 + the real speaker id and forwards it
// to every other guest, then plays it itself; the host's own voice goes out as kind 6 speaker 0 (voice.md G).
// Capture: getUserMedia -> AudioWorklet (20 ms mono frames) -> level / mode gate / pre-roll (B, C, D) -> WebCodecs Opus
// AudioEncoder -> 10-byte header (E) behind the RAW byte -> own rate gate (F). Receive: per-talker jitter buffer (H) ->
// AudioDecoder -> gain + soft clip -> scheduled AudioBufferSources -> per-talker gain -> panner (J) -> voice bus -> master.
//
// The top half of this file is pure (no DOM / WebAudio / WebCodecs) and runs in node: packet codec, rate gate, level,
// VAD, pre-roll, clock, jitter buffer, direction. The Voice class degrades to "receive and route only" when WebCodecs,
// WebAudio or the mic are missing, and never throws into the game loop.
import { RAW } from './session.js';

// ---------------------------------------------------------------------------------------------------------------
// E. Wire format (VoiceWire): [RAW] + kind u8, speaker u8, seq u16 LE, ts48 u32 LE, gain u8, flags u8, payload 1..1000
export const KIND_GUEST = 5, KIND_HOST = 6;
export const HEADER = 10, MAX_PAYLOAD = 1000;
export const FLAG_START = 1, FLAG_DEVPCM = 0x80;
export const CLOCK_RATE = 48000;
export const MODE = { OFF: 0, PTT: 1, OPEN: 2 };
export const modeOf = (m) => { m = Math.round(+m); return !(m >= 0) ? MODE.OFF : m > 2 ? MODE.OPEN : m; };   // ModeOf clamps

export const encodeGain = (g) => Math.max(0, Math.min(255, Math.round(Math.min(+g || 0, 2) * 64)));
export const decodeGain = (b) => Math.min(b / 64, 2);

export function writePacket({ kind, speaker, seq, ts, gain = 64, flags = 0, payload }) {
  const n = payload.length;
  if (n < 1 || n > MAX_PAYLOAD) return null;
  const b = new Uint8Array(1 + HEADER + n);
  b[0] = RAW; b[1] = kind; b[2] = speaker;
  b[3] = seq & 255; b[4] = (seq >> 8) & 255;
  b[5] = ts & 255; b[6] = (ts >>> 8) & 255; b[7] = (ts >>> 16) & 255; b[8] = (ts >>> 24) & 255;
  b[9] = gain & 255; b[10] = flags & 255;
  b.set(payload, 1 + HEADER);
  return b;
}
// null when malformed (TryRead: header + 1..1000 payload bytes)
export function readPacket(b) {
  if (!b || b[0] !== RAW || b.length < 1 + HEADER + 1 || b.length > 1 + HEADER + MAX_PAYLOAD) return null;
  return { kind: b[1], speaker: b[2], seq: b[3] | (b[4] << 8), ts: (b[5] | (b[6] << 8) | (b[7] << 16) | (b[8] << 24)) >>> 0,
    gain: b[9], flags: b[10], payload: b.subarray(1 + HEADER) };
}
// host relay: byte 0 = 6, byte 1 = the real peer (the claimed speaker is ignored)
export function restamp(b, kind, speaker) { const o = b.slice(); o[1] = kind; o[2] = speaker; return o; }

// ---------------------------------------------------------------------------------------------------------------
// F. Rate gate (VoiceRateGate): bytes 16384/s cap 8192, frames 80/s cap 40, 25 violations in 1 s -> 5 s ban
export const GATE = { bytesPerSec: 16384, byteCap: 8192, framesPerSec: 80, frameCap: 40, floodViolations: 25, floodWindow: 1, banSeconds: 5 };
export class RateGate {
  constructor() { this.reset(); }
  reset() { this.bytes = GATE.byteCap; this.frames = GATE.frameCap; this.t = null; this.vWin = -1e9; this.v = 0; this.banUntil = -1e9; }
  // n = whole message bytes; wellFormed false -> 'malformed'. Returns 'ok' | 'rate' | 'flood' | 'malformed'.
  admit(n, now, wellFormed = true) {
    if (this.t !== null) {
      const dt = Math.max(0, now - this.t);
      this.bytes = Math.min(GATE.byteCap, this.bytes + dt * GATE.bytesPerSec);
      this.frames = Math.min(GATE.frameCap, this.frames + dt * GATE.framesPerSec);
    }
    this.t = now;
    if (now < this.banUntil) return 'flood';
    if (wellFormed && n <= this.bytes && this.frames >= 1) { this.frames -= 1; this.bytes -= n; return 'ok'; }
    if (now - this.vWin > GATE.floodWindow) { this.vWin = now; this.v = 0; }
    if (++this.v >= GATE.floodViolations) { this.banUntil = now + GATE.banSeconds; this.v = 0; }
    return wellFormed ? 'rate' : 'malformed';
  }
}

// ---------------------------------------------------------------------------------------------------------------
// B/D. Level, VAD, pre-roll, clock, spurts
export const FLOOR_DB = -60;
// rms of float samples (= int16 rms / 32768), times the mic volume; 0 = -60 dBFS, 1 = 0 dBFS
export function levelOf(s, inputGain = 1) {
  let e = 0;
  for (let i = 0; i < s.length; i++) e += s[i] * s[i];
  const x = Math.sqrt(e / Math.max(1, s.length)) * inputGain;
  if (!(x > 1e-6)) return 0;
  return Math.max(0, Math.min(1, (20 * Math.log10(x) - FLOOR_DB) / -FLOOR_DB));
}
export const VAD = { threshold: 0.3, hangover: 0.4, preRoll: 3, spurtGap: 0.25, localHangover: 0.25, meterDecay: 0.15 };
export const thresholdOf = (v) => (Number.isFinite(+v) && v !== null && v !== '' ? Math.max(0, Math.min(1, +v)) : VAD.threshold);
export class Vad {
  constructor(hangover = VAD.hangover) { this.hangover = hangover; this.lastAbove = -1e9; this.isOpen = false; }
  // returns { open, opened, closed } for this chunk (closed/opened compare with the previous chunk's state)
  push(level, threshold, now) {
    const was = this.isOpen;
    if (level >= threshold) this.lastAbove = now;
    const open = this.isOpen = now - this.lastAbove <= this.hangover;
    return { open, opened: open && !was, closed: was && !open };
  }
}
export class PreRoll {
  constructor(cap = VAD.preRoll) { this.cap = cap; this.q = []; }
  push(x) { this.q.push(x); if (this.q.length > this.cap) this.q.shift(); }
  drain() { const q = this.q; this.q = []; return q; }
}
// VoiceClock.Stamp: 48 kHz timestamps, re-anchored to wall time after a 0.1 s gap or when 200 ms behind
export class VoiceClock {
  constructor() { this.ts = 0; this.last = -1e9; }
  stamp(samples, rate, now) {
    const dur = Math.round(samples * CLOCK_RATE / rate), wall = Math.floor(now * CLOCK_RATE);
    if (now - this.last > 0.1 || wall - this.ts > 9600) this.ts = Math.max(this.ts, wall - dur);
    this.last = now;
    const ts = this.ts >>> 0;
    this.ts += dur;
    return ts;
  }
}
// linear resample of one mono frame (only used when the AudioContext does not run at 48 kHz)
export function resample(src, n) {
  if (src.length === n) return src;
  const out = new Float32Array(n), k = (src.length - 1) / Math.max(1, n - 1);
  for (let i = 0; i < n; i++) { const x = i * k, j = Math.floor(x), f = x - j; out[i] = src[j] * (1 - f) + (src[Math.min(j + 1, src.length - 1)] * f); }
  return out;
}
// H. soft clip above |x| 0.8
export function softClip(x) {
  const a = Math.abs(x);
  if (a <= 0.8) return x;
  const y = (a - 0.8) * 5;
  return Math.sign(x) * (0.8 + 0.2 * y / (y + 1));
}

// ---------------------------------------------------------------------------------------------------------------
// H. Jitter buffer (VoiceJitterBuffer). Times: `now` in seconds (receiver wall clock), ts in 48 kHz samples, delays in
// ms. pull(now, fillMs) says what to decode now; `fillMs` is how much audio is already queued for playout.
export const JB = { slots: 32, minTargetMs: 60, maxTargetMs: 200, marginMs: 25, lowWaterMs: 30, catchUpMs: 200, maxConcealMs: 100,
  idleSeconds: 0.6, speakingHangover: 0.35, spikeDecayMsPerSec: 20, spikeCapMs: 250, jitterWindow: 128, fallMsPerSec: 15,
  startCapSeconds: 0.4, lateWindow: 64, frameSamples: 960 };
const s16 = (d) => ((d & 0xffff) << 16) >> 16;
export class JitterBuffer {
  constructor({ blockMs = 1024 / 48 } = {}) {
    this.blockMs = blockMs;
    this.stats = { stored: 0, late: 0, dup: 0, resync: 0, lost: 0, catchup: 0, underrun: 0, concealMs: 0 };
    this.reset();
  }
  reset() {
    this.slots = new Array(JB.slots).fill(null);
    this.state = 'idle'; this.next = 0; this.fresh = false; this.fadeIn = false;
    this.offsets = []; this.nOff = 0; this.min = 0; this.jitter = 0; this.p99 = 0; this.peak = 0; this.target = JB.minTargetMs;
    this.lastArrival = -1e9; this.bufferingSince = 0; this.firstTs = null; this.expectTs = null; this.queued = 0;
  }
  clearSlots() { this.slots.fill(null); this.queued = 0; }
  // offset = receive time - sender time (ms): min removes the clock offset, the spread above it is the jitter
  observe(ts, now) {
    const o = now * 1000 - ts / 48;
    this.offsets.push(o); if (this.offsets.length > JB.jitterWindow) this.offsets.shift();
    if (++this.nOff % 8 === 0 || this.offsets.length < 16) {
      const s = this.offsets.slice().sort((a, b) => a - b), n = s.length;
      this.min = s[0];
      this.jitter = s[Math.min(n - 1, Math.floor(n * 0.95))] - this.min;
      this.p99 = s[Math.min(n - 1, Math.floor(n * 0.99))] - this.min;
    }
    this.peak = Math.max(this.peak, Math.min(JB.spikeCapMs, o - this.min));
    this.retarget(0);
  }
  retarget(dt) {
    const t = Math.max(JB.minTargetMs, Math.min(JB.maxTargetMs, Math.max(this.p99, this.peak) + this.blockMs + 10));
    this.target = t >= this.target ? t : Math.max(t, this.target - JB.fallMsPerSec * dt);
  }
  tick(dt) { this.peak = Math.max(0, this.peak - JB.spikeDecayMsPerSec * dt); this.retarget(dt); }
  resync(seq, now) {
    this.stats.resync++; this.clearSlots(); this.next = seq; this.fadeIn = true; this.expectTs = null;
    if (this.state !== 'playing') { this.state = 'buffering'; this.bufferingSince = now; this.firstTs = null; }
  }
  // p: { seq, ts, flags, payload, ... }; returns 'stored' | 'dup' | 'late' | 'resync'
  push(p, now) {
    this.lastArrival = now;
    this.observe(p.ts, now);
    let res = 'stored';
    if (this.state === 'idle') {
      this.clearSlots(); this.next = p.seq; this.state = 'buffering'; this.bufferingSince = now; this.firstTs = null;
      this.fresh = true; this.fadeIn = true; this.expectTs = null;
    }
    let d = s16(p.seq - this.next);
    if (this.fresh && d < 0 && d >= -(JB.slots - 1)) { this.next = p.seq; d = 0; }   // a late first packet of the spurt
    if (d < 0 && d >= -JB.lateWindow) {
      const jump = this.expectTs === null ? 0 : s16i(p.ts - this.expectTs);
      if (jump > ((p.flags & FLAG_START) ? 0 : 4800)) { this.resync(p.seq, now); res = 'resync'; d = 0; }
      else { this.stats.late++; return 'late'; }
    } else if (d < 0 || d >= JB.slots) { this.resync(p.seq, now); res = 'resync'; d = 0; }
    const i = p.seq & (JB.slots - 1), cur = this.slots[i];
    if (cur && cur.seq === p.seq) { this.stats.dup++; return 'dup'; }
    if (!cur) this.queued++;
    this.slots[i] = { ...p, at: now };
    if (this.state === 'buffering' && this.firstTs === null) this.firstTs = p.ts;
    this.stats.stored++;
    return res;
  }
  earliest() {
    let best = null, bd = 1e9;
    for (const s of this.slots) if (s) { const d = s16(s.seq - this.next); if (d < bd) { bd = d; best = s; } }
    return best;
  }
  take(seq) { const i = seq & (JB.slots - 1), s = this.slots[i]; if (s && s.seq === seq) { this.slots[i] = null; this.queued--; return s; } return null; }
  durMs(p) { return (p.dur || JB.frameSamples) / 48; }
  // actions: { type: 'frame', p, fadeIn, silenceMs }   (silenceMs = gap to fill before this frame)
  pull(now, fillMs = 0) {
    const out = [];
    if (this.state === 'buffering' && this.queued > 0) {
      const ready = this.firstTs === null ? now >= this.bufferingSince + this.target / 1000
        : now * 1000 >= Math.min(this.firstTs / 48 + this.target + this.min, (this.bufferingSince + JB.startCapSeconds) * 1000);
      if (ready) {
        if (!this.slots[this.next & (JB.slots - 1)] || this.slots[this.next & (JB.slots - 1)].seq !== this.next) { const e = this.earliest(); if (e) this.next = e.seq; }
        this.state = 'playing'; this.fresh = false;
      }
    }
    if (this.state === 'playing') {
      // catch-up: too much queued -> drop the oldest until target + margin
      if (this.queued * 20 + fillMs > this.target + JB.catchUpMs) {
        this.stats.catchup++;
        while (this.queued > 0 && this.queued * 20 + fillMs > this.target + JB.marginMs) {
          const e = this.earliest(); if (!e) { this.queued = 0; break; } this.take(e.seq); this.next = (e.seq + 1) & 0xffff; this.expectTs = e.ts + (e.dur || JB.frameSamples);
        }
        this.fadeIn = true;
      }
      let silence = 0;
      while (fillMs < this.target + JB.marginMs) {
        const p = this.take(this.next);
        if (p) {
          let gap = 0;
          if (this.expectTs !== null) { const g = s16i(p.ts - this.expectTs); if (g > 480 && g <= 4800) gap = g / 48; }
          silence += gap;
          out.push({ type: 'frame', p, fadeIn: this.fadeIn, silenceMs: silence });
          this.stats.concealMs += silence;
          fillMs += this.durMs(p) + silence; silence = 0;
          this.fadeIn = false; this.expectTs = p.ts + (p.dur || JB.frameSamples); this.next = (this.next + 1) & 0xffff;
          continue;
        }
        if (this.queued === 0) break;
        const e = this.earliest();
        if (!e) { this.queued = 0; break; }
        if (fillMs >= JB.lowWaterMs && now - e.at < this.target / 1000) break;   // still worth waiting for the missing one
        const lost = s16(e.seq - this.next);
        this.stats.lost += Math.max(0, lost);
        if (this.expectTs !== null) silence += Math.max(0, Math.min(JB.maxConcealMs, s16i(e.ts - this.expectTs) / 48));
        this.expectTs = null; this.next = e.seq; this.fadeIn = true;
      }
      if (fillMs <= 0 && this.queued === 0 && !out.length) {   // starved: back to buffering
        if (now - this.lastArrival < 0.05) this.stats.underrun++;
        this.state = 'buffering'; this.bufferingSince = now; this.firstTs = null;
      }
    }
    if (this.queued === 0 && fillMs < 2 && now - this.lastArrival > JB.idleSeconds && this.state !== 'idle') { this.state = 'idle'; this.expectTs = null; }
    return out;
  }
}
// signed 32-bit difference of two u32 timestamps
function s16i(d) { return d | 0; }

// ---------------------------------------------------------------------------------------------------------------
// J. Direction: the source sits 1 m from the listener toward the talker's head (or at the head when closer than 1 m)
export function directionalPosition(listener, head, dist = 1) {
  const d = [head[0] - listener[0], head[1] - listener[1], head[2] - listener[2]], m = Math.hypot(d[0], d[1], d[2]);
  if (m <= dist || m < 1e-4) return head.slice();
  return [listener[0] + d[0] * dist / m, listener[1] + d[1] * dist / m, listener[2] + d[2] * dist / m];
}
// a world offset into listener space (x right, y up, -z forward); yaw 0 looks toward -z, pitch up positive
export function toListener(d, yaw, pitch = 0) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const x = d[0] * cy - d[2] * sy, z1 = d[0] * sy + d[2] * cy;   // rotate by -yaw around y: right = (cos, 0, -sin)
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  return [x, d[1] * cp - z1 * sp, d[1] * sp + z1 * cp];
}

// ---------------------------------------------------------------------------------------------------------------
// The service
const PLAYERS = 4;
const OPUS = { codec: 'opus', sampleRate: 48000, numberOfChannels: 1, bitrate: 24000, opus: { frameDuration: 20000, application: 'voip', usedtx: false } };
const FRAME_MS = 20;
const CAPTURE_WORKLET = `class C extends AudioWorkletProcessor{constructor(o){super();this.n=o.processorOptions.n;this.b=new Float32Array(this.n);this.i=0}
process(inp){const c=inp[0]&&inp[0][0];if(c){for(let k=0;k<c.length;k++){this.b[this.i++]=c[k];if(this.i===this.n){this.port.postMessage(this.b,[this.b.buffer]);this.b=new Float32Array(this.n);this.i=0}}}return true}}
registerProcessor('shred-voice-capture',C);`;
const wall = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
const HINT_KEY = 'shred-a-billion.voice.hint.v1';
const PAD_PTT = 14;   // <Gamepad>/dpad/left, shared by PushToTalk and VoiceMute

export class Voice {
  // opts: { T, root (#hud), audio (view/audio.js), settings: () => settings, nameOf(id) }
  constructor(opts = {}) {
    this.T = opts.T || ((k) => k); this.root = opts.root || null; this.audio = opts.audio || null;
    this.getSettings = opts.settings || (() => ({})); this.nameOf = opts.nameOf || ((id) => 'Player ' + (id + 1));
    this.link = null; this.me = 0;
    this.peers = new Map();       // speaker id -> talker state
    this.gates = new Map();       // host: guest pid -> RateGate
    this.ownGate = new RateGate();
    this.clock = new VoiceClock(); this.vad = new Vad(); this.pre = new PreRoll();
    this.seq = 0; this.inSpurt = false; this.lastSend = -1e9; this.localUntil = -1e9;
    this.micMuted = false; this.pttHeld = false; this.pttKey = false; this.pttTouch = false; this.padPrev = false; this.sharedMute = false;
    this.level = 0; this.mic = { state: 'none' };   // none | opening | on | failed
    this.typing = false; this.active = false; this.heads = new Map(); this.listener = null; this.t = wall();
    this.perPlayer = new Map();   // id -> { vol, muted } for this session (VoicePeerMemory)
    this.stats = { tx: 0, txBytes: 0, txFrames: 0, ownRate: 0, tooBig: 0, rx: 0, rxBytes: 0, relayed: 0, dropped: { rate: 0, flood: 0, malformed: 0, kind: 0, self: 0, dev: 0, muted: 0 }, decoded: 0, decodeErr: 0, encodeErr: 0 };
    this.txLog = [];              // [t, bytes] of the last few seconds for bytesPerSec()
    this.ui = null; this.uiReady = null;
    this.supported = typeof AudioEncoder !== 'undefined' && typeof AudioDecoder !== 'undefined' && typeof EncodedAudioChunk !== 'undefined';
    this.encOk = null; this.decOk = null;
    if (typeof window !== 'undefined') {
      this.onKey = (e) => this.key(e);
      addEventListener('keydown', this.onKey, true); addEventListener('keyup', this.onKey, true);
      this.onBlur = () => { this.pttKey = false; this.pttTouch = false; };
      addEventListener('blur', this.onBlur);
      if (this.root && typeof document !== 'undefined') this.uiReady = import('../view/voiceui.js').then(({ VoiceUi }) => { this.ui = new VoiceUi(this.root, this); }).catch(() => {});
      this.probeCodecs();
    }
  }

  get settings() { const s = this.getSettings() || {}; return s; }
  modeSetting() { const s = this.settings; return s.voiceMode === undefined ? MODE.PTT : modeOf(s.voiceMode); }
  // VoiceRules.Apply: mute sends Off
  mode() { return this.micMuted ? MODE.OFF : this.modeSetting(); }
  available() { return this.supported && this.encOk !== false && this.mic.state !== 'failed'; }
  attached() { return !!this.link; }

  async probeCodecs() {
    if (!this.supported) { this.encOk = this.decOk = false; return; }
    try { this.encOk = !!(await AudioEncoder.isConfigSupported(OPUS)).supported; } catch (e) { this.encOk = false; }
    try { this.decOk = !!(await AudioDecoder.isConfigSupported({ codec: 'opus', sampleRate: 48000, numberOfChannels: 1 })).supported; } catch (e) { this.decOk = false; }
  }

  // ---- session link
  attach({ role, me = 0, hn = null, gn = null }) {
    try {
      if (this.link) this.unhook();
      this.link = { role, hn, gn }; this.me = role === 'host' ? 0 : me | 0;
      this.ownGate.reset(); this.gates.clear();
      for (const p of this.peers.values()) this.resetPeer(p);
      this.inSpurt = false;
      if (role === 'host' && hn) hn.onRaw = (pid, b) => this.hostReceive(pid, b);
      if (role === 'guest' && gn) gn.onRaw = (b) => this.guestReceive(b);
      this.syncMic();
    } catch (e) { this.warn('attach', e); }
  }
  unhook() {
    const l = this.link; if (!l) return;
    if (l.hn) l.hn.onRaw = () => {};
    if (l.gn) l.gn.onRaw = () => {};
  }
  detach() {
    try {
      this.unhook(); this.link = null;
      this.closeMic();
      for (const id of [...this.peers.keys()]) this.release(id);
      this.gates.clear(); this.perPlayer.clear(); this.ownGate.reset();
      this.micMuted = false; this.pttHeld = this.pttKey = this.pttTouch = false; this.localUntil = -1e9; this.inSpurt = false;
      if (this.ui) this.ui.update(0);
    } catch (e) { this.warn('detach', e); }
  }
  setSettings(s) {
    if (!this.link) return;
    if (this.modeSetting() === MODE.OFF) this.micMuted = false;   // switching to Off clears mute
    this.syncMic();
    for (const p of this.peers.values()) this.applyPeerVolume(p);
    if (this.bus) this.bus.gain.value = this.busGain();
  }
  warn(where, e) { try { (typeof window !== 'undefined' && window.__log ? window.__log : []).push('voice ' + where + ' ' + (e && e.message || e)); } catch (x) { /* ignore */ } }

  // ---- receive and relay (G)
  hostReceive(pid, b) {
    const now = wall();
    if (!(pid >= 1 && pid < PLAYERS)) { this.stats.dropped.kind++; return; }
    let g = this.gates.get(pid); if (!g) this.gates.set(pid, g = new RateGate());
    const p = readPacket(b);
    const v = g.admit(b.length, now, !!p);
    if (v !== 'ok') { this.stats.dropped[v]++; return; }
    if (p.kind !== KIND_GUEST) { this.stats.dropped.kind++; return; }
    if (p.flags & FLAG_DEVPCM) { this.stats.dropped.dev++; return; }
    const out = restamp(b, KIND_HOST, pid);
    try { this.link.hn.broadcastRaw(out, pid); this.stats.relayed++; } catch (e) { this.warn('relay', e); }
    this.play(pid, readPacket(out), out.length, now);
  }
  guestReceive(b) {
    const p = readPacket(b);
    if (!p) { this.stats.dropped.malformed++; return; }
    if (p.kind !== KIND_HOST || p.speaker >= PLAYERS) { this.stats.dropped.kind++; return; }
    if (p.speaker === this.me) { this.stats.dropped.self++; return; }
    this.play(p.speaker, p, b.length, wall());
  }
  peer(id) {
    let p = this.peers.get(id);
    if (!p) {
      p = { id, jb: new JitterBuffer(), dec: null, decFail: false, meta: [], pending: 0, nextT: 0, endWall: -1e9, gainNode: null, panner: null, centered: null,
        rx: 0, rxBytes: 0, heard: -1e9, decoded: 0 };
      this.peers.set(id, p);
    }
    return p;
  }
  pp(id) { let m = this.perPlayer.get(id); if (!m) this.perPlayer.set(id, m = { vol: 1, muted: false }); return m; }
  resetPeer(p) { p.jb.reset(); p.meta.length = 0; p.endWall = -1e9; if (p.dec) { try { p.dec.reset(); this.configureDecoder(p); } catch (e) { p.dec = null; } } p.pending = 0; }
  release(id) {
    const p = this.peers.get(id); if (!p) return;
    try { if (p.dec && p.dec.state !== 'closed') p.dec.close(); } catch (e) { /* closed */ }
    try { if (p.gainNode) p.gainNode.disconnect(); if (p.panner) p.panner.disconnect(); } catch (e) { /* gone */ }
    this.peers.delete(id);
  }
  play(id, pkt, n, now) {
    if (this.pp(id).muted) { this.stats.dropped.muted++; return; }
    const p = this.peer(id);
    p.rx++; p.rxBytes += n; p.heard = now; this.stats.rx++; this.stats.rxBytes += n;
    p.jb.push(pkt, now);
    this.pump(p, now);
  }
  // fill = audio already scheduled for playout + frames waiting in the decoder
  fillMs(p, now) {
    const ctx = this.audio && this.audio.ctx;
    if (ctx && p.gainNode) return Math.max(0, p.nextT - ctx.currentTime) * 1000 + p.pending * FRAME_MS;
    return Math.max(0, p.endWall - now) * 1000;
  }
  pump(p, now) {
    const acts = p.jb.pull(now, this.fillMs(p, now));
    for (const a of acts) {
      if (this.canPlay(p)) this.decode(p, a);
      else p.endWall = Math.max(p.endWall, now) + (a.silenceMs || 0) / 1000 + FRAME_MS / 1000;   // headless: a virtual playout clock
    }
  }

  // ---- playback (H, I, J)
  canPlay(p) {
    const ctx = this.audio && this.audio.ctx;
    if (!ctx || !this.supported || this.decOk === false || p.decFail) return false;
    if (!this.bus) {
      this.bus = ctx.createGain(); this.bus.gain.value = this.busGain();
      this.bus.connect(this.audio.master || ctx.destination);
    }
    if (!p.gainNode) {
      p.gainNode = ctx.createGain();
      p.panner = ctx.createPanner ? new PannerNode(ctx, { panningModel: 'equalpower', distanceModel: 'linear', refDistance: 2, maxDistance: 40, rolloffFactor: 0 }) : null;
      if (p.panner) p.panner.connect(this.bus);
      p.centered = null; this.route(p);
      this.applyPeerVolume(p);
    }
    if (!p.dec) {
      try { p.dec = new AudioDecoder({ output: (ad) => this.decoded(p, ad), error: (e) => { this.stats.decodeErr++; this.warn('decoder', e); p.dec = null; p.pending = 0; p.meta.length = 0; } }); this.configureDecoder(p); }
      catch (e) { p.decFail = true; this.warn('decoder', e); return false; }
    }
    return true;
  }
  configureDecoder(p) { p.dec.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: 1 }); }
  // voice bus = voiceVolume² (VoiceVolume mixer param: dB = 20·log10(v²)); master follows audio.master
  busGain() { const v = this.settings.voiceVolume; const x = v === undefined ? 1 : Math.max(0, Math.min(1, +v)); return x <= 0.01 ? 0 : x * x; }
  // per-talker volume split (I): AudioSource part min(v, 1), the > 1 part as digital gain with soft clip
  playerGain(id) { const m = this.pp(id); return m.muted ? 0 : m.vol; }
  applyPeerVolume(p) { if (p.gainNode) p.gainNode.gain.value = Math.min(1, this.playerGain(p.id)); }
  route(p) {
    const centered = !!this.settings.voiceGlobal || !p.panner;
    if (centered === p.centered) return;
    p.centered = centered;
    try { p.gainNode.disconnect(); } catch (e) { /* first time */ }
    p.gainNode.connect(centered ? this.bus : p.panner);
  }
  decode(p, a) {
    try {
      p.meta.push({ gain: a.p.gain, fadeIn: a.fadeIn, silenceMs: a.silenceMs || 0 });
      p.pending++;
      p.dec.decode(new EncodedAudioChunk({ type: 'key', timestamp: Math.round(a.p.ts * 1e6 / CLOCK_RATE), data: a.p.payload }));
    } catch (e) { p.pending = Math.max(0, p.pending - 1); p.meta.pop(); this.stats.decodeErr++; }
  }
  decoded(p, ad) {
    const m = p.meta.shift() || { gain: 64, fadeIn: false, silenceMs: 0 };
    p.pending = Math.max(0, p.pending - 1);
    try {
      const ctx = this.audio && this.audio.ctx; if (!ctx || !p.gainNode) return;
      const n = ad.numberOfFrames, rate = ad.sampleRate, s = new Float32Array(n);
      ad.copyTo(s, { planeIndex: 0, format: 'f32-planar' });
      const scale = decodeGain(m.gain) * Math.max(1, Math.min(2, this.playerGain(p.id)));
      if (scale !== 1) for (let i = 0; i < n; i++) s[i] = softClip(s[i] * scale);
      if (m.fadeIn) { const f = Math.min(n, Math.round(rate * 96 / 48000)); for (let i = 0; i < f; i++) s[i] *= i / f; }
      const buf = ctx.createBuffer(1, n, rate); buf.copyToChannel(s, 0);
      const t0 = ctx.currentTime;
      if (p.nextT < t0 + 0.005) p.nextT = t0 + 0.005;
      else if (m.silenceMs) p.nextT += m.silenceMs / 1000;
      const src = ctx.createBufferSource(); src.buffer = buf; src.connect(p.gainNode); src.start(p.nextT);
      p.nextT += n / rate;
      p.endWall = wall() + (p.nextT - t0);
      p.decoded++; this.stats.decoded++;
    } catch (e) { this.warn('play', e); } finally { try { ad.close(); } catch (e) { /* closed */ } }
  }

  // ---- capture (B, C, D)
  wantMic() {
    if (!this.link || !this.supported || this.encOk === false) return false;
    const m = this.mode();
    return m === MODE.OPEN || (m === MODE.PTT && (this.pttHeld || this.mic.state !== 'none'));
  }
  syncMic() {
    const m = this.mode();
    if (this.mic.state === 'on' && this.mic.track) this.mic.track.enabled = m === MODE.OPEN || (m === MODE.PTT && this.pttHeld);
    if (m === MODE.OFF && this.mic.state === 'on' && this.modeSetting() === MODE.OFF) this.closeMic();
    if (this.mic.state === 'none' && this.wantMic()) this.openMic();
  }
  async openMic() {
    if (this.mic.state !== 'none') return;
    const ctx = this.audio && this.audio.ctx;
    if (!ctx) return;   // the AudioContext is not unlocked yet: try again next frame
    const mic = this.mic = { state: 'opening' };
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('no getUserMedia');
      if (this.encOk === null) await this.probeCodecs();
      if (!this.encOk) throw new Error('no Opus encoder');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (this.mic !== mic || !this.link) { stream.getTracks().forEach(t => t.stop()); return; }
      if (!Voice.workletUrl) { Voice.workletUrl = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: 'text/javascript' })); }
      if (!ctx.__voiceWorklet) ctx.__voiceWorklet = ctx.audioWorklet.addModule(Voice.workletUrl);
      await ctx.__voiceWorklet;
      if (this.mic !== mic) { stream.getTracks().forEach(t => t.stop()); return; }
      const n = Math.round(ctx.sampleRate * FRAME_MS / 1000);
      const src = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, 'shred-voice-capture', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: { n } });
      const sink = ctx.createGain(); sink.gain.value = 0;
      src.connect(node); node.connect(sink); sink.connect(ctx.destination);
      const enc = new AudioEncoder({ output: (c) => this.encoded(c), error: (e) => { this.stats.encodeErr++; this.warn('encoder', e); } });
      enc.configure(OPUS);
      Object.assign(mic, { state: 'on', stream, track: stream.getAudioTracks()[0], src, node, sink, enc, rate: ctx.sampleRate, q: [] });
      node.port.onmessage = (e) => this.frame(e.data);
      this.syncMic();
    } catch (e) {
      this.warn('mic', e);
      if (this.mic === mic) this.mic = { state: 'failed', why: String(e && (e.name || e.message) || e) };
    }
  }
  closeMic() {
    const m = this.mic; this.mic = { state: m.state === 'failed' ? 'failed' : 'none', why: m.why };
    try { if (m.node) { m.node.port.onmessage = null; m.node.disconnect(); } if (m.src) m.src.disconnect(); if (m.sink) m.sink.disconnect(); } catch (e) { /* gone */ }
    try { if (m.stream) m.stream.getTracks().forEach(t => t.stop()); } catch (e) { /* gone */ }
    try { if (m.enc && m.enc.state !== 'closed') m.enc.close(); } catch (e) { /* gone */ }
  }
  inputGain() { const g = this.settings.voiceInputGain; return g === undefined ? 1 : Math.max(0, Math.min(2, +g || 0)); }
  // one 20 ms PCM frame from the worklet
  frame(pcm) {
    const mic = this.mic; if (mic.state !== 'on' || !this.link) return;
    const now = wall(), mode = this.mode();
    const level = levelOf(pcm, this.inputGain());
    this.level = Math.max(this.level, level);
    const send = mode === MODE.OPEN || (mode === MODE.PTT && this.pttHeld);
    if (!send) { if (this.inSpurt) this.endSpurt(); this.pre.drain(); return; }
    const data = mic.rate === 48000 ? pcm : resample(pcm, 960);
    const ts = this.clock.stamp(data.length, 48000, now);
    mic.q.push({ ts, level, mode });
    try { const ad = new AudioData({ format: 'f32', sampleRate: 48000, numberOfFrames: data.length, numberOfChannels: 1, timestamp: Math.round(ts * 1e6 / CLOCK_RATE), data }); mic.enc.encode(ad); ad.close(); }
    catch (e) { mic.q.pop(); this.stats.encodeErr++; }
  }
  encoded(chunk) {
    const mic = this.mic; const meta = mic.q ? mic.q.shift() : null;
    if (!meta || !this.link) return;
    const payload = new Uint8Array(chunk.byteLength); chunk.copyTo(payload);
    this.chunk(payload, meta.ts, meta.level, meta.mode, wall());
  }
  // gate one encoded chunk (also the test entry point: chunk(bytes, ts, level, mode, now))
  chunk(payload, ts, level, mode, now) {
    if (payload.length > MAX_PAYLOAD || payload.length < 1) { this.stats.tooBig++; this.endSpurt(); return; }
    if (mode === MODE.PTT) { this.transmit(payload, ts, now); return; }
    if (mode !== MODE.OPEN) return;
    const g = this.vad.push(level, thresholdOf(this.settings.voiceVadThreshold ?? VAD.threshold), now);
    if (g.open) {
      if (g.opened) for (const c of this.pre.drain()) this.transmit(c.payload, c.ts, now);
      this.transmit(payload, ts, now);
    } else {
      this.pre.push({ payload, ts });
      if (g.closed) this.endSpurt();
    }
  }
  endSpurt() { this.inSpurt = false; }
  transmit(payload, ts, now) {
    if (!this.link) return false;
    const start = !this.inSpurt || now - this.lastSend > VAD.spurtGap;
    const b = writePacket({ kind: this.link.role === 'host' ? KIND_HOST : KIND_GUEST, speaker: this.me, seq: this.seq, ts, gain: encodeGain(this.inputGain()), flags: start ? FLAG_START : 0, payload });
    if (!b) { this.stats.tooBig++; this.endSpurt(); return false; }
    if (this.ownGate.admit(b.length, now) !== 'ok') { this.stats.ownRate++; this.endSpurt(); return false; }
    this.seq = (this.seq + 1) & 0xffff; this.lastSend = now; this.inSpurt = true; this.localUntil = now + VAD.localHangover;
    try {
      if (this.link.role === 'host') this.link.hn.broadcastRaw(b); else this.link.gn.sendRaw(b);
    } catch (e) { this.warn('send', e); return false; }
    this.stats.tx++; this.stats.txBytes += b.length; this.txLog.push([now, b.length]);
    return true;
  }
  // bytes/s sent over the last `win` seconds
  bytesPerSec(win = 2) { const now = wall(); let s = 0; for (const [t, n] of this.txLog) if (now - t <= win) s += n; return s / win; }

  // ---- keys and pad (C)
  key(e) {
    if (e.code !== 'KeyV' && e.code !== 'KeyM') return;
    if (!this.link) return;
    const tag = e.target && e.target.tagName;
    const typing = this.typing || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable);
    const down = e.type === 'keydown';
    if (e.code === 'KeyV') {
      if (!down) { this.pttKey = false; return; }
      if (typing || e.repeat) return;
      this.pttKey = true; this.pttEdge();
    } else if (down && !typing && !e.repeat) this.toggleMute();
  }
  pttEdge() {
    this.pttPressedAt = wall();
    if (this.ui) this.ui.pttPressed();
    if (this.micMuted && this.modeSetting() !== MODE.OFF && this.ui) this.ui.denied();
    if (this.modeSetting() === MODE.PTT && this.mic.state === 'none') this.openMicSoon = true;
  }
  toggleMute() {
    if (this.modeSetting() === MODE.OFF) return;
    this.micMuted = !this.micMuted;
    if (this.audio && this.audio.ctx) try { this.audio.play('sfx_ui_click', { bus: 'sfx', vol: 0.48 }); /* UiClick (data/sfx.json) */; } catch (e) { /* no clip */ }
    this.syncMic();
    if (this.ui) this.ui.flashMute(this.micMuted);
  }
  setPtt(on) { const was = this.pttTouch; this.pttTouch = !!on; if (on && !was) this.pttEdge(); }
  pollPad() {
    let pressed = false;
    try { const pads = navigator.getGamepads ? navigator.getGamepads() : []; for (const g of pads) if (g && g.buttons[PAD_PTT] && g.buttons[PAD_PTT].pressed) pressed = true; } catch (e) { /* no pads */ }
    const rise = pressed && !this.padPrev; this.padPrev = pressed;
    if (rise && !this.typing) {
      // shared button: talks when PTT mode and not muted, else it is the mute toggle and PTT waits for release
      if (this.modeSetting() === MODE.PTT && !this.micMuted) { this.sharedMute = false; this.pttEdge(); }
      else { this.sharedMute = true; this.toggleMute(); }
    }
    if (!pressed) this.sharedMute = false;
    return pressed && !this.sharedMute && !this.typing;
  }

  // ---- per frame
  update(dt, { listener = null, heads = null, typing = false, active = false } = {}) {
    try {
      const now = wall(); this.t = now;
      this.typing = !!typing; this.active = !!active; this.listener = listener; if (heads) this.heads = heads;
      if (!this.link) { if (this.ui) this.ui.update(dt); return; }
      const pad = typeof navigator !== 'undefined' ? this.pollPad() : false;
      const ptt = (this.pttKey || this.pttTouch || pad) && !this.typing && !this.micMuted && this.modeSetting() === MODE.PTT;
      if (ptt !== this.pttHeld) { this.pttHeld = ptt; this.syncMic(); }
      if (this.openMicSoon || (this.mic.state === 'none' && this.wantMic())) { this.openMicSoon = false; this.syncMic(); }
      this.level *= Math.exp(-dt / VAD.meterDecay);
      while (this.txLog.length && now - this.txLog[0][0] > 5) this.txLog.shift();
      this.presence(now);
      for (const p of this.peers.values()) { p.jb.tick(dt); this.pump(p, now); this.place(p); }
      if (typeof window !== 'undefined' && window.__remotes) window.__remotes.voiceCentered = !!this.settings.voiceGlobal;
      if (this.ui) this.ui.update(dt);
    } catch (e) { this.warn('update', e); }
  }
  // TrackPresence: release talkers that left the session
  presence(now) {
    const l = this.link; let alive = null;
    if (l.role === 'host' && l.hn) { alive = new Set(); for (const p of l.hn.peers.values()) alive.add(p.pid); }
    for (const [id, p] of this.peers) {
      const gone = alive ? !alive.has(id) : !this.heads.has(id) && now - p.heard > 5;
      if (gone) { this.release(id); this.perPlayer.delete(id); this.gates.delete(id); }
    }
    if (alive) for (const id of [...this.gates.keys()]) if (!alive.has(id)) this.gates.delete(id);
  }
  place(p) {
    if (!p.gainNode || !p.panner) return;
    this.route(p);
    if (p.centered) return;
    const head = this.heads.get(p.id), L = this.listener;
    let rel = [0, 0, -1];
    if (head && L && L.pos) {
      const s = directionalPosition(L.pos, head, 1);
      rel = toListener([s[0] - L.pos[0], s[1] - L.pos[1], s[2] - L.pos[2]], L.yaw || 0, L.pitch || 0);
    }
    const t = this.audio.ctx.currentTime;
    if (p.panner.positionX) { p.panner.positionX.setValueAtTime(rel[0], t); p.panner.positionY.setValueAtTime(rel[1], t); p.panner.positionZ.setValueAtTime(rel[2], t); }
    else p.panner.setPosition(rel[0], rel[1], rel[2]);
  }

  // ---- queries for the HUD, roster and nameplates
  speaking(id) { const p = this.peers.get(id); return !!p && this.t < p.endWall + JB.speakingHangover; }
  localLive() {
    if (!this.link || this.micMuted || !this.available()) return false;
    const m = this.mode();
    return m === MODE.PTT ? this.pttHeld : m === MODE.OPEN ? this.t < this.localUntil : false;
  }
  // ShowSpeaking for remote players; the local row is MicLive
  talking(id) {
    if (!this.link) return false;
    if (id === this.me) return this.localLive();
    if (this.modeSetting() === MODE.OFF) return false;
    const m = this.pp(id);
    return !m.muted && m.vol > 0.001 && this.speaking(id);
  }
  // per-player controls (Q), session-only
  playerVolume(id) { return this.pp(id).vol; }
  playerMuted(id) { return this.pp(id).muted; }
  setPlayerVolume(id, v) { this.pp(id).vol = Math.max(0, Math.min(2, Math.round((+v || 0) * 20) / 20)); const p = this.peers.get(id); if (p) this.applyPeerVolume(p); }
  setPlayerMuted(id, on) {
    this.pp(id).muted = !!on;
    const p = this.peers.get(id); if (p) { this.resetPeer(p); this.applyPeerVolume(p); }
  }
  meter() { return Math.max(0, Math.min(1, this.level)); }
  note() { return !this.available() ? 'settings.voice.note.unavailable' : !this.link ? 'settings.voice.note.coop' : null; }
  together() { return !!this.link && this.heads && this.heads.size > 0; }
  hintFlag(set) {
    try { if (set) localStorage.setItem(HINT_KEY, '1'); return localStorage.getItem(HINT_KEY) === '1'; } catch (e) { return !!set; }
  }
}
