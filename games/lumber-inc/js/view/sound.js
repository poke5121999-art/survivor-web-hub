// Original clips (art/sfx, tools/export_audio.py) played on sim events through WebAudio; music (bgm_forest) starts on
// the first touch or key, as browsers require. Mapping from event to clip follows the clip names (audio_treefall on a
// fall, schop_wood on a chop hit, audio_unlock on a bought pad...); the original wires them in code we did not port.
const EVENTS = {
  treeHit: 'schop_wood', treeFall: 'audio_treefall', unlock: 'audio_unlock', upgrade: 'audio_upgrade', star: 'audio_researchMachine',
  levelUp: 'audio_levelup', hire: 'audio_purchase', task: 'audio_win1', collect: 'InsertCoin', truckGo: 'audio_truck',
  padPay: 'audio_beep',
};
const THROTTLE = { treeHit: 0.08, padPay: 0.18, collect: 0.2, deposit: 0.06 };

export class Sound {
  constructor(base, list) {
    this.base = base;
    this.list = list;
    this.buffers = new Map();
    this.last = new Map();
    this.ctx = null;
    this.on = true;
    const start = () => {
      if (this.ctx) return;
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      this.ctx = new C();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
      this.music('bgm_forest');
    };
    addEventListener('pointerdown', start, { once: true });
    addEventListener('keydown', start, { once: true });
  }

  async buffer(name) {
    if (this.buffers.has(name)) return this.buffers.get(name);
    const e = this.list[name];
    if (!e || !this.ctx) return null;
    const p = fetch(`${this.base}/${e.file}`).then(r => r.arrayBuffer()).then(b => this.ctx.decodeAudioData(b)).catch(() => null);
    this.buffers.set(name, p);
    return p;
  }

  async play(name, vol = 1) {
    if (!this.ctx || !this.on) return;
    const buf = await this.buffer(name);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.master);
    src.start();
  }

  async music(name) {
    const buf = await this.buffer(name);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = 0.35;
    src.connect(g).connect(this.master);
    src.start();
  }

  events(list, now) {
    if (!this.ctx) return;
    for (const e of list) {
      const name = EVENTS[e.type];
      if (!name) continue;
      const gap = THROTTLE[e.type] || 0.05;
      if (now - (this.last.get(e.type) || -1) < gap) continue;
      this.last.set(e.type, now);
      this.play(name, e.type === 'padPay' ? 0.4 : 1);
    }
  }
}
