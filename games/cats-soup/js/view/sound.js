// Sound: art/sfx (tools/export_audio.py, subset kept in the repo). Music starts on the first tap (autoplay policy) and
// cycles the five "normal" forest tracks; effects follow sim events.
const MUSIC = ['026_normal_01', '027_normal_02', '028_normal_03', '029_normal_04', '030_normal_05'];
const EVENT = {
  sell: '002_Coins 2', upgrade: '007_Powerup upgrade 35', build: 'SFX_Pop_Mouth_Med_1', expand: 'UI_ForestUpgrade',
  recipe: '048_bubble pop', energy: '040_balloon_popping', jar: '006_Notification sound 15',
};
const MEOW = ['Cat meow 1', 'Cat meow 2', 'Cat meow 3'];

export class Sound {
  constructor(base, list) {
    this.base = base;
    this.list = list;
    this.cache = new Map();
    this.music = null;
    this.track = Math.floor(Math.random() * MUSIC.length);
    this.on = localStorage.getItem('cats-soup-mute') !== '1';
    this.last = new Map();
    addEventListener('pointerdown', () => this.startMusic(), { once: true });
  }

  url(name) { const e = this.list[name]; return e && `${this.base}/art/sfx/${e.file}`; }

  play(name, volume = 0.6) {
    if (!this.on) return;
    const now = performance.now();
    if (now - (this.last.get(name) || 0) < 120) return;
    this.last.set(name, now);
    const u = this.url(name);
    if (!u) return;
    const a = new Audio(u);
    a.volume = volume;
    a.play().catch(() => {});
  }

  startMusic() {
    if (!this.on || this.music) return;
    const next = () => {
      const u = this.url(MUSIC[this.track++ % MUSIC.length]);
      this.music = new Audio(u);
      this.music.volume = 0.35;
      this.music.onended = next;
      this.music.play().catch(() => {});
    };
    next();
  }

  toggle() {
    this.on = !this.on;
    localStorage.setItem('cats-soup-mute', this.on ? '0' : '1');
    if (!this.on && this.music) { this.music.pause(); this.music = null; } else this.startMusic();
  }

  event(e) {
    if (e.type === 'sell' && e.auto) return;
    if (e.type === 'cat') return this.play(MEOW[Math.floor(Math.random() * MEOW.length)], 0.5);
    if (EVENT[e.type]) this.play(EVENT[e.type], e.type === 'energy' ? 0.3 : 0.6);
  }
}
