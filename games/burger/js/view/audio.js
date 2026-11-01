// Sound: the original AudioStorage clips (tools/export_audio.py -> art/audio). Music is BGMId.USA, which
// Counter.OnEnable starts once a counter exists (MainBGMId.USA on stage 1), over the AmbientBGMId.Ambient loop.
// Effects follow sim events. Calls found in the decompile: BuildComplete on CreateArea/Node builds, Upgrade on
// UpgradeArea and the office/HR buttons, GetMoney in GameManager money pickups. The other ids (GaugeFill,
// GaugeMoneyFill, Trash, CarHorns) are named for what they do but their callers are not decompiled [GUESS mapping].
// Browsers block audio until the first tap or key, so everything starts on the first input.

const KEY = 'bp-sound';
const GAP = { GaugeFill: 0.07, GaugeMoneyFill: 0.09, GetMoney: 0.25, Trash: 0.15, CarHorns: 1.5, BuildComplete: 0.3, Upgrade: 0.3 };

export class Sound {
  constructor(base, meta) {
    this.base = base;
    this.meta = meta;
    this.buffers = {};
    this.last = {};
    this.t = 0;
    this.on = true;
    try { this.on = localStorage.getItem(KEY) !== 'off'; } catch (e) { /* storage blocked: default on */ }
    this.ctx = null;
    this.music = [];
    this.bgm = null;
    this.bgmWanted = false;
    const start = () => { this.unlock(); removeEventListener('pointerdown', start); removeEventListener('keydown', start); };
    addEventListener('pointerdown', start);
    addEventListener('keydown', start);
  }

  unlock() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.gain = this.ctx.createGain();
    this.gain.gain.value = this.on ? 1 : 0;
    this.gain.connect(this.ctx.destination);
    for (const [id, file] of Object.entries(this.meta.sfx)) {
      fetch(`${this.base}/${file}`).then(r => r.arrayBuffer()).then(b => this.ctx.decodeAudioData(b)).then(buf => { this.buffers[id] = buf; })
        .catch(() => { /* a missing clip stays silent */ });
    }
    const loop = (file, vol, play) => {
      const a = new Audio(`${this.base}/${file}`);
      a.loop = true;
      a.volume = vol;
      a.muted = !this.on;
      if (play) a.play().catch(() => { /* blocked until a later gesture */ });
      this.music.push(a);
      return a;
    };
    if (this.meta.ambient) loop(this.meta.ambient, 0.35, true);
    if (this.meta.bgm.USA) this.bgm = loop(this.meta.bgm.USA, 0.5, this.bgmWanted);
  }

  // The stage music runs once the counter is built (Counter.OnEnable -> PlayBGM).
  setMusic(wanted) {
    if (wanted === this.bgmWanted) return;
    this.bgmWanted = wanted;
    if (this.bgm && wanted) this.bgm.play().catch(() => {});
  }

  toggle() {
    this.on = !this.on;
    try { localStorage.setItem(KEY, this.on ? 'on' : 'off'); } catch (e) { /* not remembered */ }
    if (this.gain) this.gain.gain.value = this.on ? 1 : 0;
    for (const a of this.music) {
      a.muted = !this.on;
      if (this.on && a.paused && (a !== this.bgm || this.bgmWanted)) a.play().catch(() => {});
    }
    return this.on;
  }

  play(id) {
    if (!this.ctx || !this.on) return;
    const buf = this.buffers[id];
    if (!buf || this.t - (this.last[id] ?? -9) < (GAP[id] ?? 0.1)) return;
    this.last[id] = this.t;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gain);
    src.start();
  }

  // Sim events of one step -> effects.
  events(list, dt) {
    this.t += dt;
    for (const e of list) {
      if (e.type === 'build') this.play('BuildComplete');
      else if (e.type === 'grade' || e.type === 'upgrade' || e.type === 'hire') this.play('Upgrade');
      else if (e.type === 'money' && e.from !== 'offline') this.play('GetMoney');
      else if (e.type === 'pay') this.play('GaugeMoneyFill');
      else if ((e.type === 'pick' || e.type === 'drop') && e.who === 'player') this.play('GaugeFill');
      else if (e.type === 'trash' && e.who === 'player') this.play('Trash');
      else if (e.type === 'paid' && e.car) this.play('CarHorns');
    }
  }
}
