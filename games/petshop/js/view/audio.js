// Original AudioClips (art/audio, tools/export_audio.py) by clip name. Music "Cat's Day (trimmed)" loops and the bird
// ambience plays until DayNightCycle.endBirdsHour, as the original SoundManager / DayNightCycle.birdAudioSource do.
// Browsers start audio only after a user gesture: unlock() on the first tap/click.
export class Sound {
  constructor(base) {
    this.base = base;
    this.map = null;
    this.cache = new Map();
    this.on = true;
    try { this.on = localStorage.getItem('ps-sound') !== '0'; } catch (e) { /* storage unavailable */ }
    fetch(`${base}/audio.json`).then(r => r.json()).then(m => { this.map = m; }).catch(() => {});
    this.unlocked = false;
  }
  url(name) { return this.map && this.map[name] ? `${this.base}/${this.map[name]}` : null; }
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    const u = this.url("Cat's Day (trimmed)");
    if (u) { this.music = new Audio(u); this.music.loop = true; this.music.volume = 0.5; if (this.on) this.music.play().catch(() => {}); }
    const b = this.url('birds-chirping-ambiance-26052');
    if (b) { this.birds = new Audio(b); this.birds.loop = true; this.birds.volume = 0.5; }
  }
  birdsOn(on) { if (!this.birds) return; if (on && this.on && this.birds.paused) this.birds.play().catch(() => {}); if ((!on || !this.on) && !this.birds.paused) this.birds.pause(); }
  sfx(name) {
    if (!this.on || !this.unlocked) return;
    const u = this.url(name);
    if (!u) return;
    let a = this.cache.get(name);
    if (!a) { a = new Audio(u); this.cache.set(name, a); }
    const n = a.paused ? a : a.cloneNode();
    n.currentTime = 0;
    n.play().catch(() => {});
  }
  toggle() {
    this.on = !this.on;
    try { localStorage.setItem('ps-sound', this.on ? '1' : '0'); } catch (e) { /* storage unavailable */ }
    if (this.music) { if (this.on) this.music.play().catch(() => {}); else this.music.pause(); }
    if (!this.on && this.birds) this.birds.pause();
  }
}
