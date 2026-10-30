// WebAudio playback of exported clips (audio/<key>.mp3), with a global mute that survives reloads.
import { stats } from './assets.js';

export class AudioSystem {
  constructor(assets) {
    this.assets = assets;
    this.ctx = null;
    this.buffers = new Map();
    this.muted = localStorage.getItem('fg-mute') === '1';
    this.master = null;
    this.playing = new Set();
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  setMute(m) {
    this.muted = !!m;
    localStorage.setItem('fg-mute', this.muted ? '1' : '0');
    if (this.master) this.master.gain.value = this.muted ? 0 : 1;
  }

  load(key) {
    if (!this.buffers.has(key)) {
      const a = this.assets.audio[key];
      if (!a) { if (!stats.audioMissing.includes(key)) stats.audioMissing.push(key); this.buffers.set(key, Promise.resolve(null)); }
      else {
        this.buffers.set(key, fetch(this.assets.base + a.file + (this.assets.rev || '')).then((r) => r.arrayBuffer())
          .then((b) => { const ctx = this.ensure(); return ctx ? ctx.decodeAudioData(b) : null; })
          .catch(() => null));
      }
    }
    return this.buffers.get(key);
  }

  async play(ref, opts = {}) {
    if (!ref) return null;
    const key = ref.startsWith('audio:') ? ref.slice(6) : ref;
    const ctx = this.ensure();
    if (!ctx) return null;
    const buf = await this.load(key);
    if (!buf) return null;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = !!opts.loop;
    src.playbackRate.value = opts.pitch ?? 1;
    const g = ctx.createGain();
    g.gain.value = opts.volume ?? 1;
    src.connect(g);
    if (opts.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = opts.pan; g.connect(p); p.connect(this.master); }
    else g.connect(this.master);
    src.start();
    const h = { src, gain: g, stop: () => { try { src.stop(); } catch { /* already stopped */ } this.playing.delete(h); } };
    this.playing.add(h);
    src.onended = () => this.playing.delete(h);
    return h;
  }

  stopAll() { for (const h of [...this.playing]) h.stop(); }
}
