// Âm thanh: một AudioContext, mở khoá ở lần nhập đầu tiên (chính sách autoplay của trình duyệt).
// Sự kiện Wwise -> ogg qua audio/index.json: events[name].switch (nhóm LandType) chọn bộ media theo landType ô,
// rồi bốc ngẫu nhiên một file (RanSeq random). Âm lượng = events[name].volume (dB đã đổi tuyến tính).
import { loadJSON, assetUrl } from './assets.js?v=20261021b';

// landType của ClientMapData -> tên case trong switch LandType (EXPORT_AUDIO.md, chữ hoa/thường như trong index).
const LAND_CASE = { 0: ['GROUND', 'Ground'], 1: ['GRASS', 'Grass'], 2: ['STONE', 'Stone'], 3: ['WATER', 'Water'], 4: ['Snow', 'SNOW'], 5: ['Sand', 'SAND'] };

export class Audio {
  constructor() {
    this.ctx = null; this.index = null; this.buf = new Map(); this.master = null; this.played = 0; this.log = [];
    this.ready = loadJSON('audio/index.json').then(j => (this.index = j)).catch(e => { console.warn(e.message); });
    const unlock = () => {
      if (!this.ctx) {
        const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
        this.ctx = new C(); this.master = this.ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    };
    for (const ev of ['keydown', 'pointerdown', 'touchstart']) addEventListener(ev, unlock, { capture: true });
  }
  get unlocked() { return !!this.ctx && this.ctx.state === 'running'; }

  _media(name, landType) {
    const e = this.index && this.index.events[name]; if (!e) return null;
    let ids = e.media;
    if (e.switch && e.switch.group === 'LandType') {
      const want = LAND_CASE[landType] || [e.switch.default];
      const k = want.find(w => e.switch.cases[w]) || e.switch.default;
      ids = e.switch.cases[k] || ids;
    }
    if (!ids || !ids.length) return null;
    const m = this.index.media[ids[Math.floor(Math.random() * ids.length)]];
    return m ? { file: m.file, volume: e.volume ?? 1 } : null;
  }
  async _buffer(file) {
    if (this.buf.has(file)) return this.buf.get(file);
    const p = fetch(assetUrl(file)).then(r => { if (!r.ok) throw new Error('audio load failed: ' + file + ' (http ' + r.status + ')'); return r.arrayBuffer(); })
      .then(a => this.ctx.decodeAudioData(a));
    this.buf.set(file, p); return p;
  }
  // phát một sự kiện Wwise; landType chọn case của switch LandType
  async play(name, { landType = 0, gain = 1 } = {}) {
    if (!this.ctx || !this.index) return;
    const m = this._media(name, landType); if (!m) return;
    try {
      const b = await this._buffer(m.file);
      const s = this.ctx.createBufferSource(); s.buffer = b;
      const g = this.ctx.createGain(); g.gain.value = m.volume * gain;
      s.connect(g).connect(this.master); s.start();
      this.played++; this.log.push([name, landType, m.file]); if (this.log.length > 50) this.log.shift();
    } catch (e) { console.warn(e.message); }
  }
}
