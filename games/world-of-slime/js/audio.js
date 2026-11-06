// Âm thanh: một AudioContext, mở khoá ở lần nhập đầu tiên (chính sách autoplay của trình duyệt).
// Sự kiện Wwise -> ogg qua audio/index.json: events[name].switch (nhóm LandType) chọn bộ media theo landType ô,
// rồi bốc ngẫu nhiên một file (RanSeq random). Âm lượng = events[name].volume (dB đã đổi tuyến tính).
import { loadJSON, assetUrl } from './assets.js?v=20261022f';

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
      if (this.ctx.state === 'suspended') this.ctx.resume().then(() => { if (this._bgmPending) this._bgmStart(); });
      else if (this._bgmPending) this._bgmStart();
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
  // Nhạc nền: ClientMapData.bgm là tên sự kiện Wwise (bgm_town_larus). Bank BGM chỉ giữ id = FNV-1 32 bit của tên
  // viết thường, nên audio/index.json ghi 'BGM__<hex id>' (EXPORT_AUDIO.md). media[] phát nối nhau, lặp cả danh sách.
  // bgm null (kho 478) = giữ nhạc đang phát [ĐỀ XUẤT]. Chưa mở khoá âm thanh thì đợi lần nhập đầu.
  bgmEvent(name) {
    if (!this.index || !name) return null;
    if (this.index.events[name]) return this.index.events[name];
    let h = 2166136261;
    for (const c of new TextEncoder().encode(name.toLowerCase())) { h = Math.imul(h, 16777619) >>> 0; h = (h ^ c) >>> 0; }
    return this.index.events['BGM__' + h.toString(16).padStart(8, '0')] || null;
  }
  async playBgm(name) {
    if (!name || name === this.bgmName) return;
    await this.ready;
    const e = this.bgmEvent(name);
    if (!e || !e.media || !e.media.length) { console.warn('bgm event not found: ' + name); return; }
    this.bgmName = name; this.bgmFiles = e.media.map(id => this.index.media[id]).filter(Boolean).map(m => m.file);
    this.bgmVol = e.volume ?? 1;
    this._bgmStart();
  }
  async _bgmStart() {
    if (!this.ctx || this.ctx.state !== 'running') { this._bgmPending = true; return; }
    this._bgmPending = false;
    if (this.bgmSrc) { try { this.bgmSrc.onended = null; this.bgmSrc.stop(); } catch (e) { /* đã dừng */ } }
    const name = this.bgmName; let i = 0;
    const next = async () => {
      if (name !== this.bgmName) return;
      const b = await this._buffer(this.bgmFiles[i++ % this.bgmFiles.length]).catch(e => { console.warn(e.message); return null; });
      if (!b || name !== this.bgmName) return;
      const s = this.ctx.createBufferSource(); s.buffer = b;
      const g = this.ctx.createGain(); g.gain.value = 0.45 * this.bgmVol;   // [ĐỀ XUẤT] nhạc nhỏ hơn tiếng hiệu ứng
      s.connect(g).connect(this.master); s.onended = next; s.start();
      this.bgmSrc = s; this.bgmPlaying = this.bgmFiles[(i - 1) % this.bgmFiles.length];
    };
    next();
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
