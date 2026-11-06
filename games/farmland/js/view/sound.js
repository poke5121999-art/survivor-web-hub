// Sim events -> original clips (art/sfx, exported by tools/export_audio.sh). WebAudio; nothing loads before the first
// touch/key (browsers block audio until then), and the music/ambience loops stream through <audio> after that.
const SFX = {
  seed: ['Seeding1', 'Seeding2', 'Seeding3'], water: ['Water'], harvest: ['ScytheSwing1', 'ScytheSwing2'],
  bikeOn: ['BikeBell'], bikeOff: ['GroundThud'], buy: ['PurchaseCompleteJingle'], hc: ['HCCollect'], gacha: ['Gacha'],
  charUnlock: ['CharUnlock'], plane: ['Plane'],
  pick: ['CropPlop'], sell: ['SingleCoin'], donate: ['SingleCoin'], unlock: ['ParcelUnlock'], bridge: ['BridgeUnlock'],
  tree: ['TreeShake1', 'TreeShake2', 'TreeShake3'], grow: ['PlantGrowing'], step: ['FootStepGrass'],
  Milk: ['Moo1', 'Moo2', 'Moo3'], Wool: ['Sheep1', 'Sheep2'], Egg: ['Chicken', 'Chick'], Honey: ['PlopAigu'],
};

export class Sound {
  constructor() {
    this.ctx = null;
    this.buf = new Map();
    this.last = new Map();
    this.muted = false;
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
    this.gain.gain.value = 0.8;
    this.gain.connect(this.ctx.destination);
    for (const list of Object.values(SFX)) for (const n of list) this.load(n);
    this.music = new Audio('art/sfx/music1.mp3');
    this.music.loop = true; this.music.volume = 0.35;
    this.music.play().catch(() => {});
    this.amb = new Audio('art/sfx/Ambient1.mp3');
    this.amb.loop = true; this.amb.volume = 0.25;
    this.amb.play().catch(() => {});
  }

  load(n) {
    if (this.buf.has(n)) return;
    this.buf.set(n, null);
    fetch(`art/sfx/${encodeURIComponent(n)}.mp3`).then(r => r.arrayBuffer()).then(a => this.ctx.decodeAudioData(a))
      .then(b => this.buf.set(n, b)).catch(() => {});
  }

  // minGap: same sound at most once per minGap seconds (selling 12 items/s should not be 12 coin clips)
  play(kind, { vol = 1, minGap = 0.06, rate = 1 } = {}) {
    if (!this.ctx || this.muted) return;
    const list = SFX[kind];
    if (!list) return;
    const now = this.ctx.currentTime;
    if (now - (this.last.get(kind) ?? -1) < minGap) return;
    this.last.set(kind, now);
    const b = this.buf.get(list[Math.floor(Math.random() * list.length)]);
    if (!b) return;
    const s = this.ctx.createBufferSource();
    s.buffer = b;
    s.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    s.connect(g).connect(this.gain);
    s.start();
  }

  event(e, farm) {
    switch (e.type) {
      case 'cell': this.play(['harvest', 'seed', 'water'][e.from === 2 ? 0 : e.from + 1], { minGap: 0.12, vol: 0.6 }); break;
      case 'pick': this.play('pick', { minGap: 0.05, vol: 0.5, rate: 0.9 + Math.random() * 0.3 }); break;
      case 'sell': this.play('sell', { minGap: 0.07, vol: 0.6 }); break;
      case 'donate': this.play('donate', { minGap: 0.09, vol: 0.4 }); break;
      case 'unlock': this.play(farm.parcels[e.p].d.bridge ? 'bridge' : 'unlock'); break;
      case 'tree': if (!e.ripe) this.play('tree'); break;
      // account layer (meta.js events): PlayerController.ToggleBike BikeBell 0.7 / GroundThud 0.1, purchases, diamonds
      case 'bikeToggle': this.play(e.on ? 'bikeOn' : 'bikeOff', { vol: e.on ? 0.7 : 0.1 }); break;
      case 'pet': case 'bike': this.play('buy', { vol: 0.7 }); break;
      case 'piggy': this.play('hc'); break;
      case 'skin': this.play('charUnlock'); break;
      case 'animal': if (!e.ready) this.play(farm.animals[e.a].d.loot, { vol: 0.7 }); break;
      default: break;
    }
  }
}
