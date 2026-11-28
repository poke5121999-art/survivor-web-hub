// WebAudio playback of the original clips (audio/<name>.ogg, .m4a for Safari). Buses follow Game.Core.AudioBus.
import { V } from '../rev.js';
export class Audio {
  constructor(base) {
    this.base = base;
    this.ctx = null;
    this.buffers = new Map();
    this.loading = new Map();
    this.vol = { master: 0.8, music: 0.5, sfx: 0.8, voice: 0.8 };
    this.ext = (() => { try { return new window.Audio().canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'm4a'; } catch { return 'm4a'; } })();
    this.music = null;
    this.loops = new Map();
  }
  unlock() {
    if (!this.ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      this.ctx = new C();
      this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
      this.bus = {};
      for (const b of ['music', 'sfx', 'voice']) { const g = this.ctx.createGain(); g.connect(this.master); this.bus[b] = g; }
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.vol.master;
    for (const b in this.bus) this.bus[b].gain.value = this.vol[b];
  }
  load(name) {
    if (this.buffers.has(name)) return Promise.resolve(this.buffers.get(name));
    if (this.loading.has(name)) return this.loading.get(name);
    const p = fetch(`${this.base}${name}.${this.ext}${V}`).then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status))
      .then(ab => new Promise((res, rej) => { if (!this.ctx) { this.unlock(); } this.ctx.decodeAudioData(ab, res, rej); }))
      .then(buf => { this.buffers.set(name, buf); return buf; })
      .catch(() => null);
    this.loading.set(name, p);
    return p;
  }
  play(name, { vol = 1, pitch = 1, bus = 'sfx', pan = 0 } = {}) {
    if (!this.ctx) return;
    const buf = this.buffers.get(name);
    if (!buf) { this.load(name); return; }
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = pitch;
    const g = this.ctx.createGain(); g.gain.value = vol;
    let node = g;
    if (pan && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); node = p; }
    s.connect(g); node.connect(this.bus[bus] || this.bus.sfx);
    s.start();
    return s;
  }
  // random variant: names like hand_swish_1..6
  playAny(prefix, n, opts) { return this.play(`${prefix}${1 + Math.floor(Math.random() * n)}`, opts); }
  loop(name, vol = 1, bus = 'sfx') {
    if (!this.ctx) return null;
    let L = this.loops.get(name);
    if (!L) {
      const buf = this.buffers.get(name);
      if (!buf) { this.load(name); return null; }
      const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const g = this.ctx.createGain(); g.gain.value = 0;
      s.connect(g); g.connect(this.bus[bus]); s.start();
      L = { s, g }; this.loops.set(name, L);
    }
    L.g.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.08);
    return L;
  }
  setLoopPitch(name, p) { const L = this.loops.get(name); if (L) L.s.playbackRate.value = p; }
  playMusic(name, vol = 1) {
    if (!this.ctx) return;
    if (this.music && this.music.name === name) return;
    const prev = this.music;
    if (prev && prev.g) { prev.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.6); setTimeout(() => { try { prev.s.stop(); } catch { } }, 3000); }   // a track still loading has no nodes yet (its load sees the name changed and drops it)
    this.music = { name };
    this.load(name).then(buf => {
      if (!buf || !this.music || this.music.name !== name) return;
      const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const g = this.ctx.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.8);
      s.connect(g); g.connect(this.bus.music); s.start();
      Object.assign(this.music, { s, g });
    });
  }
}
