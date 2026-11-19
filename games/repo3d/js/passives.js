// Passives of the 14 crew (design-inventory section 6). The source unlocks them at crew level 10; this game has no crew
// levels yet, so they are always on (URL flag passives=0 turns them off). A passive belongs to its owner: the player's
// lead (P.crewId) or a bot mate (b.crew), and "allies within r" is measured from that owner.
//   bao  Quen Đường: lamps in rooms the crew has seen are 40 % brighter
//   hue  Băng Gạc:   allies within 1.5 m heal 1 hp/s
//   tam  Vai U:      the weight slow-down of a carried item is cut to 70 %
//   ky   Tay Nghề:   jammed doors are pried open twice as fast (pry bar, js/gear.js)
//   linh Chân Mèo:   footstep noise radius halved
//   dung Lì Đòn:     a foe hitting you does not cut the value of the item you carry
//   mai  Tai Thính:  minimap shows foes within 8 m of the player
//   phuc Kéo Lê:     a head on the pad stands up twice as fast
//   son  Chắn:       allies within 2 m take 8 % less damage
//   nga  Bước Hụt:   3.5 s untouchable after a blink
//   khoi Đo Đạc:     the crew sees 15 % further (torch reach, scout sight)
//   van  Hơi Lạnh:   foes you hit are slowed 25 % for 2 s
//   hai  Hút Nhẹ:    grabbing at nothing pulls the nearest small item within 2 m into the beam
//   tuyet Rọi Sáng:  allies within 3 m survive a lethal hit with 1 hp, once per 30 s each
export const PASSIVE = {
  bao: { lampK: 1.4 }, hue: { r: 1.5, hps: 1 }, tam: { weightK: 0.7 }, ky: { pryK: 2 }, linh: { noiseK: 0.5 },
  dung: { keepValue: true }, mai: { r: 8 }, phuc: { reviveK: 2 }, son: { r: 2, dmgK: 0.92 }, nga: { invuln: 3.5 },
  khoi: { seeK: 1.15 }, van: { slow: 0.25, dur: 2 }, hai: { r: 2 }, tuyet: { r: 3, cd: 30 },
};

export class Passives {
  constructor(G, opts = {}) {
    this.G = G;
    this.on = opts.on !== false;
    this.saved = new Map();   // ally -> time of the last Seraph save
    this.log = [];
  }
  /** Living owners of passive id: the player (lead) and bots with that crew. */
  owners(id) {
    if (!this.on) return [];
    const G = this.G, P = G.player, out = [];
    if (P && P.crewId === id && !P.down) out.push(P);
    for (const b of G.bots?.list || []) if (b.crew === id && !b.down) out.push(b);
    return out;
  }
  has(id) { return this.owners(id).length > 0; }
  mine(actor, id) { return this.on && (actor.isBot ? actor.crew === id : this.G.player.crewId === id) && !actor.down; }
  pos(a) { return this.G.skills ? this.G.skills.pos(a) : (a.isBot ? a : a.position); }
  near(a, b, r) { const p = this.pos(a), q = this.pos(b); return Math.hypot(p.x - q.x, p.z - q.z) <= r; }

  /** Damage about to land on ally a: Barb's shield cuts it, Seraph's light refuses the lethal part. */
  onHurt(a, dmg) {
    if (!this.on || !(dmg > 0)) return dmg;
    if (a.invulnT > 0) return 0;   // Blink's after-step
    if (this.owners('son').some((o) => this.near(o, a, PASSIVE.son.r))) dmg *= PASSIVE.son.dmgK;
    if (dmg >= a.hp && !(a.noDownT > 0)) {
      const t = this.G.time, last = this.saved.get(a) ?? -1e9;
      if (t - last >= PASSIVE.tuyet.cd && this.owners('tuyet').some((o) => this.near(o, a, PASSIVE.tuyet.r))) {
        this.saved.set(a, t); this.log.push(['seraph', a.isBot ? a.crew : 'player', +t.toFixed(2)]);
        return Math.max(0, a.hp - 1);
      }
    }
    return dmg;
  }

  /** Halo's bandage, per physics tick. */
  step(dt) {
    if (!this.on) return;
    const S = this.G.skills; if (!S) return;
    for (const h of this.owners('hue')) for (const a of S.allies()) if (a !== h && !a.down && this.near(h, a, PASSIVE.hue.r)) S.heal(a, PASSIVE.hue.hps * dt);
  }

  weightMul(m, actor) { return this.mine(actor, 'tam') ? 1 - (1 - m) * PASSIVE.tam.weightK : m; }
  noiseMul() { return this.mine(this.G.player, 'linh') ? PASSIVE.linh.noiseK : 1; }
  keepsValue() { return this.mine(this.G.player, 'dung'); }
  reviveSec(base) { return base / (this.has('phuc') ? PASSIVE.phuc.reviveK : 1); }
  seeMul() { return this.has('khoi') ? PASSIVE.khoi.seeK : 1; }
  pryMul(actor) { return this.mine(actor, 'ky') ? PASSIVE.ky.pryK : 1; }
  lampMul(lamp) {
    if (!this.has('bao') || !lamp) return 1;
    const G = this.G, L = G.house?.layout, seen = G.run?.seen; if (!L || !seen) return 1;
    const r = L.rooms.find((q) => lamp.x >= q.x && lamp.x < q.x + q.w && lamp.z >= q.y && lamp.z < q.y + q.h);
    return r && seen.has(r.id) ? PASSIVE.bao.lampK : 1;
  }
  /** Mai's ears: is this foe drawn on the minimap? */
  heard(f) { if (!this.mine(this.G.player, 'mai')) return false; const p = this.G.player.position; return Math.hypot(f.x - p.x, f.z - p.z) <= PASSIVE.mai.r; }
  /** Frost's cold touch on a foe hit by actor. */
  chill(f, actor) { if (actor && this.mine(actor, 'van')) { f.slowT = PASSIVE.van.dur; this.log.push(['chill', f.kind]); } }
  /** Magnet's light pull: the nearest small loose item within 2 m, or null. */
  pullTarget() {
    const G = this.G, P = G.player; if (!this.mine(P, 'hai')) return null;
    const p = P.position; let best = null, bd = PASSIVE.hai.r;
    for (const it of G.loot.items) {
      if (it.dead || it.held || it.carrier || it.isHead || it.size !== 'small') continue;
      const t = it.body.translation(), d = Math.hypot(t.x - p.x, t.z - p.z);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }
}
