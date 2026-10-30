// AudioSystem + AudioDB of the game: keys ("Jump", "Death", "WeaponRiffle"...) pick one clip of their list at
// random; positional sfx fade with the distance to the listener (the camera target) and pan by x.
export class GameAudio {
  constructor(engine, audioDb) {
    this.engine = engine;
    this.sys = engine.audio;
    this.db = new Map();
    for (const e of (audioDb && audioDb.fields.m_entries) || []) this.db.set(e.m_key, (e.m_clipList || []).filter(Boolean));
    this.listener = [0, 0];
    this.maxDist = 60;
    this.music = null;
    this.musicKey = null;
    this.played = 0;
    this.lastKeys = [];
    this.sfxMute = false;
    this.musicMute = false;
  }

  // AudioSystem.MuteMusic / MuteSFX (Settings): music keeps its key so unmuting restarts it
  setMute(music, sfx) {
    this.sfxMute = !!sfx;
    if (!!music !== this.musicMute) {
      this.musicMute = !!music;
      const k = this.musicKey, v = this.musicVol;
      if (this.musicMute) { if (this.music) this.music.stop(); this.music = null; }
      else if (k) { this.musicKey = null; this.playMusic(k, v); }
    }
  }

  clip(key) {
    const l = this.db.get(key);
    if (!l || !l.length) return null;
    return l[Math.floor(Math.random() * l.length)];
  }

  // decode ahead so the first shot of a match is not silent
  preload(keys) { for (const k of keys) for (const c of this.db.get(k) || []) this.sys.load(c.slice(6)); }

  note(key) { this.played++; this.lastKeys.push(key); if (this.lastKeys.length > 12) this.lastKeys.shift(); }

  sfx(key, opts = {}) {
    if (this.sfxMute) return null;
    const c = key && this.clip(key);
    if (!c) return null;
    this.note(key);
    return this.sys.play(c, opts);
  }

  sfxAt(key, x, y, pitch = 1) {
    if (this.sfxMute) return null;
    const c = key && this.clip(key);
    if (!c) return null;
    const d = Math.hypot(x - this.listener[0], y - this.listener[1]);
    const vol = Math.max(0, Math.min(1, 1 - d / this.maxDist));
    if (vol <= 0.01) return null;
    this.note(key);
    return this.sys.play(c, { volume: vol, pitch, pan: Math.max(-0.6, Math.min(0.6, (x - this.listener[0]) / this.maxDist)) });
  }

  loop(key, volume = 1) {
    if (this.sfxMute && !this._musicLoop) return null;
    const c = key && this.clip(key);
    if (!c) return null;
    const h = { stopped: false, handle: null, stop() { this.stopped = true; if (this.handle) this.handle.stop(); } };
    this.sys.play(c, { loop: true, volume }).then((x) => { h.handle = x; if (h.stopped && x) x.stop(); });
    return h;
  }

  playMusic(key, volume = 0.5) {
    if (this.musicKey === key) return;
    this.stopMusic();
    this.musicKey = key;
    this.musicVol = volume;
    if (this.musicMute) return;
    this._musicLoop = true;
    this.music = this.loop(key, volume);
    this._musicLoop = false;
  }

  stopMusic() {
    if (this.music) this.music.stop();
    this.music = null;
    this.musicKey = null;
  }
}
