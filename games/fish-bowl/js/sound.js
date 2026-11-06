// Web Audio over art/sfx (tools/export_audio.py: one mp3 per original AudioClip, keyed by the clip name).
// Buffers load on first use; the context unlocks on the first pointer/key event (mobile autoplay rules).
export class Sound {
  constructor(base, table) {
    this.base = base;
    this.table = table;
    this.buffers = new Map();
    this.volume = 1;
    this.music = null;
    const unlock = () => { this.ctx?.resume(); };
    addEventListener('pointerdown', unlock, { passive: true });
    addEventListener('keydown', unlock);
  }

  get ctx() {
    if (!this._ctx && window.AudioContext) {
      this._ctx = new AudioContext();
      this.out = this._ctx.createGain();
      this.out.gain.value = this.volume;
      this.out.connect(this._ctx.destination);
    }
    return this._ctx;
  }

  setVolume(v) {
    this.volume = v;
    if (this.out) this.out.gain.value = v;
  }

  load(name) {
    const e = this.table[name];
    if (!e || !this.ctx) return Promise.resolve(null);
    if (!this.buffers.has(name)) {
      this.buffers.set(name, fetch(`${this.base}/${e.file}`).then(r => r.arrayBuffer())
        .then(b => this.ctx.decodeAudioData(b)).catch(() => null));
    }
    return this.buffers.get(name);
  }

  async play(name, { offset = 0, loop = false, volume = 1 } = {}) {
    const buf = await this.load(name);
    if (!buf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = loop;
    const g = this.ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(this.out);
    src.start(0, Math.min(offset, buf.duration - 0.01));
    return { stop: () => { try { src.stop(); } catch (e) { /* already stopped */ } }, gain: g.gain };
  }

  async playMusic(name, volume = 0.5) {
    if (this.musicName === name) return;
    this.music?.stop();
    this.musicName = name;
    this.music = await this.play(name, { loop: true, volume });
  }

  stopMusic() {
    this.music?.stop();
    this.music = null;
    this.musicName = null;
  }
}
