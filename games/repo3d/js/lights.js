// Horror lighting cues on top of house3d's lamp pool and the camera torch (idea from games/ga-chim/js/lights.js:
// a small rig that hands moods to real lights, no extra lights added):
//   torch: steady; stutters when a foe hunts within 8 m, browns out at low hp
//   lamps: about one in five buzzes and flickers on its own; any lamp with a foe under it (4 m) flickers hard
// Also feeds the post chain its hurt / low-hp state. URL flag flicker=0 turns the cues off.
const hash = (i) => { let h = (i * 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; return (h >>> 0) / 4294967296; };

export class Lights {
  constructor(G, opts = {}) {
    this.G = G;
    this.on = opts.flicker !== false;
    this.t = 0;
    this.dread = 0;
    this.torch0 = G.torch ? G.torch.intensity : 18;
    this.foesNear = new Map();
  }

  /** Multiplier for lamp index i of the house's lamp list (house3d calls this when it powers a pooled light). */
  lampK(i, lamp) {
    const pm = this.G.passives?.lampMul(lamp) ?? 1;   // Flare's passive
    if (!this.on || !lamp) return pm;
    const h = hash(i + 1), t = this.t;
    let k = 1;
    if (h < 0.2 || lamp.buzz) {   // buzzing lamp (and every basement bulb): short dropouts at its own rhythm
      const ph = t * (3 + h * 9) + h * 50;
      const n = Math.sin(ph) * Math.sin(ph * 2.31 + 1.3) * Math.sin(ph * 0.71 + 4.1);
      k = n > 0.25 ? 0.08 : 0.85 + 0.15 * Math.sin(t * 60 + h * 9);
    }
    const near = this.nearFoe(lamp);
    if (near > 0) { const s = Math.sin(t * 37 + h * 11) * Math.sin(t * 23.7 + h * 3); k *= s > 0.1 * (1 - near) ? 0.05 + 0.3 * (1 - near) : 1; }
    return k * pm;
  }

  nearFoe(lamp) {
    const list = this.G.foes?.list; if (!list) return 0;
    let best = 0;
    for (const f of list) {
      if (f.dead || f.state === 'sleep') continue;
      const d = Math.hypot(f.x - lamp.x, f.z - lamp.z);
      if (d < 4) best = Math.max(best, 1 - d / 4);
    }
    return best;
  }

  /** Per render frame. */
  step(dt) {
    const G = this.G, P = G.player;
    this.t += dt;
    let hunt = 0;
    if (P && !P.down) {
      const p = P.position;
      for (const f of G.foes?.list || []) {
        if (f.dead || !(f.state === 'chase' || f.state === 'attack')) continue;
        const d = Math.hypot(f.x - p.x, f.z - p.z);
        if (d < 8) hunt = Math.max(hunt, 1 - d / 8);
      }
    }
    this.dread += (hunt - this.dread) * Math.min(1, dt * 3);
    const maxHp = G.run?.hpMax ?? 100, hpK = P ? P.hp / maxHp : 1;
    const low = P && !P.down ? Math.max(0, Math.min(1, (0.35 - hpK) / 0.35)) : 0;
    if (G.torch) {
      let k = 1;
      if (this.on) {
        const t = this.t;
        if (this.dread > 0.05) { const s = Math.sin(t * 31) * Math.sin(t * 17.3 + 1) * Math.sin(t * 7.1 + 2); if (s > 0.35 - 0.3 * this.dread) k *= 0.15 + 0.5 * (1 - this.dread); }
        if (low > 0) k *= 1 - 0.35 * low * (0.5 + 0.5 * Math.sin(t * 2.2));
      }
      G.torch.intensity = this.torch0 * k * ((P?.torchOffT || 0) > 0 ? 0 : 1);   // the angel's swipe puts the torch out
    }
    if (G.post) {
      const S = G.post.state;
      S.damage = P ? Math.min(1, (P.hurtT || 0) / 0.35) : 0;
      S.lowHealth = low;
    }
  }
}
