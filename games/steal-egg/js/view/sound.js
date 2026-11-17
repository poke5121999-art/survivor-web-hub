// Sound by sim event, clips from art/sfx (sfx.json: clip -> mp3, AudioSource volume and loop of the original).
// WebAudio starts on the first touch / key / click (browser autoplay rule); the music "sonami music" (SoundManager
// BackGroundSound, volume 0.5, loop) starts then. Positional sources (animal snore / run loops, rival hits) fade with
// distance from the player: the AudioSource 3D settings were not exported, so the rolloff is an approximation.
const MUSIC = 'sonami_music';

export class Sound {
  constructor({ sfxJson, base, version, muted = false }) {
    this.clips = sfxJson.clips;
    this.base = base;
    this.q = version ? `?v=${version}` : '';
    this.muted = muted;
    this.ctx = null;
    this.buffers = new Map();
    this.loading = new Map();
    this.loops = new Map();
    this.settings = { music: true, sound: true };
    this.played = [];                      // last events, for tests: [name, t]
    this.names = new Set();                // every clip name requested so far, for tests
    const unlock = () => this.start();
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, unlock, { capture: true, passive: true });
  }

  start() {
    if (this.muted) return;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      for (const name of Object.keys(this.clips)) if (this.clips[name].kind !== 'music') this.load(name);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.settings.music && !this.loops.has(MUSIC)) this.loop(MUSIC, true);
  }

  // Settings panel: SoundEnabled (every one-shot and loop effect) and MusicEnabled (SoundManager.PlayMusic / PauseMusic).
  setSettings({ sound = this.settings.sound, music = this.settings.music } = {}) {
    this.settings.sound = !!sound;
    const was = this.settings.music;
    this.settings.music = !!music;
    if (was && !music) this.loop(MUSIC, false);
    if (!was && music && this.ctx) this.loop(MUSIC, true);
    // effect loops (snores, runs) follow SoundEnabled; they restart by themselves from the next frame's loop() call
    if (!this.settings.sound) for (const key of [...this.loops.keys()]) if (key !== MUSIC) this.loop(null, false, key);
  }

  load(name) {
    const c = this.clips[name];
    if (!c || !this.ctx) return Promise.resolve(null);
    if (this.buffers.has(name)) return Promise.resolve(this.buffers.get(name));
    if (!this.loading.has(name)) {
      this.loading.set(name, fetch(`${this.base}/sfx/${c.mp3}${this.q}`).then(r => r.arrayBuffer())
        .then(b => this.ctx.decodeAudioData(b)).then(buf => { this.buffers.set(name, buf); return buf; }).catch(() => null));
    }
    return this.loading.get(name);
  }

  volumeOf(name) {
    const c = this.clips[name], s = c && c.sources && c.sources[0];
    return s ? s.volume : 1;
  }

  // One shot. vol multiplies the AudioSource volume.
  play(name, vol = 1) {
    this.played.push([name, performance.now()]);
    this.names.add(name);
    if (this.played.length > 50) this.played.shift();
    if (!this.ctx || !this.settings.sound || this.muted) return;
    const go = buf => {
      if (!buf) return;
      const src = this.ctx.createBufferSource(), g = this.ctx.createGain();
      src.buffer = buf;
      g.gain.value = this.volumeOf(name) * vol;
      src.connect(g).connect(this.master);
      src.start();
    };
    const b = this.buffers.get(name);
    if (b) go(b); else this.load(name).then(go);
  }

  // Looping source on/off (SetActive of an AudioSource object). key lets one clip loop on several objects.
  loop(name, on, key = name, vol = 1) {
    const cur = this.loops.get(key);
    if (on && name !== MUSIC && !this.settings.sound) on = false;
    if (!on) {
      if (cur) { try { cur.src && cur.src.stop(); } catch (e) { /* not started */ } this.loops.delete(key); }
      return;
    }
    if (cur) { cur.want = vol; if (cur.g) cur.g.gain.value = this.volumeOf(name) * vol; return; }
    const entry = { want: vol };
    this.loops.set(key, entry);
    if (!this.ctx || this.muted) return;
    this.load(name).then(buf => {
      if (!buf || this.loops.get(key) !== entry) return;
      const src = this.ctx.createBufferSource(), g = this.ctx.createGain();
      src.buffer = buf;
      src.loop = true;
      g.gain.value = this.volumeOf(name) * entry.want;
      src.connect(g).connect(this.master);
      src.start();
      entry.src = src; entry.g = g;
    });
  }

  // Distance rolloff for positional sources (logarithmic like Unity's default, min distance 2 m, silent past 40 m).
  static falloff(d) {
    if (d <= 2) return 1;
    if (d >= 40) return 0;
    return Math.max(0, 2 / d - 2 / 40) / (1 - 2 / 40);
  }
}
