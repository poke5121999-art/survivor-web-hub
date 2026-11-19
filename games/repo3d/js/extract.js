import { CFG } from './config.js';

// A pad counts the loot resting on it; holding the floor button for 3 s with value >= quota cashes it in.
// Run rules (run.js drives the phases): a non-final pad pays its quota and the surplus comes back as a money bag
// (event `surplus`, run.js spawns the bag); the final pad pays everything on it. A downed player's head resting on the
// active pad revives them (event `pad:revive`). `remainingQuota()` / `lootRemaining()` feed the unreachable-quota check
// and the restock rule (RESTOCK_MARGIN 1.12, one item per 1.5 s, see run.js).
export class Extraction {
  constructor(loot, events) {
    this.loot = loot;
    this.events = events;
    this.pads = [];
    this.haul = 0;
    this.active = 0;
  }

  setPads(pads) {
    this.pads = pads.map((p, i) => ({ ...p, value: 0, hold: 0, done: false, final: i === pads.length - 1 }));
    this.active = 0;
  }

  onPad(pad, pos) {
    return Math.abs(pos.x - pad.x) <= pad.half && Math.abs(pos.z - pad.z) <= pad.half && pos.y - (pad.y || 0) < 1.6;   // floors: measured from the pad's own floor
  }

  get finished() { return this.pads.length > 0 && this.active >= this.pads.length; }

  step(dt, playerPos) {
    const pad = this.pads[this.active];
    if (!pad || pad.done) return;
    const items = this.loot.items.filter((i) => !i.held && !i.dead && this.onPad(pad, i.body.translation()));
    pad.value = items.reduce((s, i) => s + i.value, 0);
    pad.items = items;
    const standing = this.onPad(pad, playerPos);
    if (standing && pad.value >= pad.quota) {
      pad.hold += dt;
      if (pad.hold >= CFG.extract.hold) this.fire(pad);
    } else {
      pad.hold = 0;
    }
  }

  fire(pad) {
    pad.done = true;
    const pay = pad.final ? pad.value : Math.min(pad.value, pad.quota);
    const surplus = pad.value - pay;
    this.haul += pay;
    for (const it of pad.items) this.loot.destroy(it, false);
    this.active++;
    this.events.emit('pad:extract', { pad, value: pay, surplus, final: pad.final });
  }

  /** The downed player's head lying on the active pad brings them back (R.E.P.O. rule). Returns true once. */
  checkHead(player) {
    const pad = this.pads[this.active];
    if (!pad || pad.done || !player.down || !player.head || player.head.dead || player.head.held) return false;
    if (!this.onPad(pad, player.head.body.translation())) return false;
    this.events.emit('pad:revive', { pad });
    return true;
  }

  /** Quota still to pay on pads not yet cashed in. */
  remainingQuota() {
    let q = 0;
    for (const p of this.pads) if (!p.done) q += p.quota;
    return q;
  }

  /** Value of all loot still in play (resting, held, on the active pad). */
  lootRemaining() {
    let v = 0;
    for (const it of this.loot.items) if (!it.dead) v += it.value;
    return v;
  }
}
