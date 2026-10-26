// Sound effects and music (rules/sound-thief-nextmart.md): one clip picked at random per event from art/sfx/sfx.json,
// at the original volumes. World sounds fade with distance from the player like the pooled 3D AudioSources
// (full up to ~20 m, silent past ~30 m). Music is one looping track at 0.8. Audio starts on the first input
// (browser autoplay rule); the speaker button mutes both and is remembered per browser.
const NEAR = 20, FAR = 30, MIN_GAP = { cashDrop: 0.06, cashPick: 0.06, pick: 0.04, drop: 0.04 };
const MUTE_KEY = 'mmm-mute';

export class Sound {
  constructor(base, sim, store, v = '') {
    this.base = base;
    this.v = v;
    this.sim = sim;
    this.store = store;
    this.ctx = null;
    this.table = null;
    this.buffers = new Map();
    this.last = {};
    try { this.muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { this.muted = false; }
    fetch(`${base}/sfx.json?v=${v}`).then(r => (r.ok ? r.json() : null)).then(t => { this.table = t; }).catch(() => {});
    const start = () => this.unlock();
    window.addEventListener('pointerdown', start, { once: true });
    window.addEventListener('keydown', start, { once: true });
    sim.listeners.push(e => this.on(e));
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend(); else if (!this.muted) this.ctx.resume();
    });
  }

  unlock() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    this.startMusic();
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch (e) { /* storage unavailable */ }
    if (this.master) this.master.gain.value = m ? 0 : 1;
  }

  buffer(file) {
    if (!this.buffers.has(file)) {
      this.buffers.set(file, fetch(`${this.base}/${file}?v=${this.v}`).then(r => r.arrayBuffer())
        .then(b => new Promise((ok, no) => this.ctx.decodeAudioData(b, ok, no))).catch(() => null));
    }
    return this.buffers.get(file);
  }

  async startMusic() {
    const ev = this.table && this.table.music;
    if (!ev || !ev.files.length) { setTimeout(() => this.startMusic(), 1000); return; }
    const buf = await this.buffer(ev.files[0]);
    if (!buf) return;
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain();
    src.buffer = buf;
    src.loop = true;
    g.gain.value = ev.volume;
    src.connect(g).connect(this.master);
    src.start();
  }

  // `at` is a world point; omitted means at the player (the 2D UI sounds and the player's own pick/drop/cash).
  async play(name, { at = null, index = null } = {}) {
    if (!this.ctx || !this.table || this.muted) return;
    const ev = this.table[name];
    if (!ev || !ev.files.length) return;
    const now = this.ctx.currentTime;
    if (MIN_GAP[name] && now - (this.last[name] || -1) < MIN_GAP[name]) return;
    this.last[name] = now;
    let vol = ev.volume;
    if (at) {
      const p = this.sim.state.player, d = Math.hypot(at.x - p.x, at.z - p.z);
      vol *= d <= NEAR ? 1 : Math.max(0, 1 - (d - NEAR) / (FAR - NEAR));
      if (vol <= 0.01) return;
    }
    const file = ev.files[index != null ? Math.min(index, ev.files.length - 1) : Math.floor(Math.random() * ev.files.length)];
    const buf = await this.buffer(file);
    if (!buf) return;
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain();
    src.buffer = buf;
    g.gain.value = vol;
    src.connect(g).connect(this.master);
    src.start();
  }

  on(e) {
    const s = this.store;
    switch (e.type) {
      case 'pickup': this.play('pick'); break;
      case 'drop': this.play('drop'); break;
      case 'payMat': case 'payUpgrade': this.play('cashDrop'); break;
      case 'collect': case 'coinPile': this.play('cashPick'); break;
      case 'matDone': {
        const m = s.mats.find(x => x.name === e.name);
        const worker = m && m.activate.some(a => /_Worker_/.test(a.name));
        this.play(/Tile/i.test(e.name) ? 'tile' : worker ? 'worker' : 'unlock');
        break;
      }
      case 'upgraded': this.play('upgrade'); break;
      case 'levelUp': this.play('factoryUpgrade'); break;
      case 'produceStart': {
        const p = s.producers[e.producer];
        const kind = /Chicken/i.test(p.name) ? 'chicken' : /Cow/i.test(p.name) ? 'cow' : /Pig/i.test(p.name) ? 'pig' : /Goat/i.test(p.name) ? 'goat' : null;
        if (kind) this.play(kind, { at: s.pos(p.node) });
        break;
      }
      case 'customerPack': this.play('box', { at: s.cashiers[e.cashier].boxSlot }); break;
      case 'customerPay': this.play('kaching', { at: s.cashiers[e.cashier].boxSlot }); break;
      case 'activate': if (s.nextMart && e.name === s.nextMart.name) this.play('honk', { at: s.nextMart.zone.middle }); break;
      case 'depart': this.play('drive'); break;
      case 'thiefCaught': this.play('cashBurst', { index: 0 }); break;
      case 'carArrive': this.play('honk', { at: this.sim.cars && this.sim.cars.point }); break;
      case 'carLeave': if (e.paid) this.play('cashBurst', { index: e.amount < 1000 ? 0 : e.amount < 5000 ? 1 : e.amount < 10000 ? 2 : 3 }); break;
      default: break;
    }
  }
}
