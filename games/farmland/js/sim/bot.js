// Autoplay for tests and ?bot: sells, works the fields, shakes trees, then spends coins on the cheapest parcel on offer.
// Paths run over the parcel grid (BFS through walkable parcels), then straight to the target point.
import { RULES } from './farm.js';

const C = RULES.cell;

export class Bot {
  constructor(farm) {
    this.f = farm;
    this.goal = null;
    this.path = [];
    this.stuck = 0;
  }

  centre(p) { return { x: p.d.pos[0], z: p.d.pos[2] }; }

  // BFS from the player's parcel to `to`, moving through parcels the player can stand on.
  route(to) {
    const f = this.f, start = f.parcelAt(f.player.x, f.player.z);
    if (!start || !to) return null;
    const prev = new Map([[start.i, -1]]);
    const queue = [start];
    while (queue.length) {
      const p = queue.shift();
      if (p === to) break;
      for (const n of p.d.nb) {
        if (n < 0 || prev.has(n)) continue;
        const q = f.parcels[n];
        if (q !== to && !q.open) continue;
        prev.set(n, p.i);
        queue.push(q);
      }
    }
    if (!prev.has(to.i)) return null;
    const out = [];
    for (let i = to.i; i !== -1 && i !== start.i; i = prev.get(i)) out.unshift(this.centre(f.parcels[i]));
    return out;
  }

  setGoal(kind, parcel, point, extra = {}) {
    const path = this.route(parcel);
    if (!path) return false;
    path.push(point);
    this.goal = { kind, parcel, point, ...extra };
    this.path = path;
    return true;
  }

  choose() {
    const f = this.f, pl = f.player;
    const dist = p => Math.hypot(p.d.pos[0] - pl.x, p.d.pos[2] - pl.z);
    // 1. sell what a merchant wants
    for (const m of f.merchants) {
      if (m.parcel?.open && m.d.crops.some(c => f.bag[c] > 0) && this.setGoal('sell', m.parcel, { x: m.d.pos[0], z: m.d.pos[2] })) return;
    }
    // 2. trees with fruit, ready animals
    for (const t of f.trees) {
      if (t.parcel?.open && f.treeFruits(t) > 4 && this.setGoal('tree', t.parcel, { x: t.d.pos[0], z: t.d.pos[2] + 1.6 }, { tree: t })) return;
    }
    for (const a of f.animals) if (a.parcel?.open && a.d.loot && f.animalReady(a) && this.setGoal('animal', a.parcel, { x: a.x, z: a.z }, { animal: a })) return;
    // 2b. empty a barn with stock; hire the next worker when it costs less than the cheapest parcel on offer
    for (const b of f.barns) {
      const d = b.d.dock || b.d.pos;
      if (b.parcel?.open && f.barnStock(b) >= 20 && this.setGoal('barn', b.parcel, { x: d[0], z: d[2] }, { barn: b })) return;
    }
    const cheapest = Math.min(...f.parcels.filter(p => f.available(p)).map(p => f.price(p) - p.paid), Infinity);
    for (const b of f.barns) {
      if (!b.parcel?.open) continue;
      const k = b.workers.findIndex(v => v === 0);
      if (k >= 0 && f.workerPrice(b, k) <= f.coins && f.workerPrice(b, k) <= cheapest * 3) {
        const d = b.d.dock || b.d.pos;
        if (this.setGoal('hire', b.parcel, { x: d[0], z: d[2] }, { barn: b, k })) return;
      }
    }
    // 3. buy the cheapest parcel on offer we can afford: stand on the open neighbour, at its edge facing the parcel
    const offer = f.parcels.filter(p => f.available(p) && !(p.d.landPrice > f.land)).sort((a, b) => (f.price(a) - a.paid) - (f.price(b) - b.paid) || dist(a) - dist(b));
    if (offer.length && f.coins >= f.price(offer[0]) - offer[0].paid) {
      const p = offer[0];
      const from = p.d.nb.map(i => (i >= 0 ? f.parcels[i] : null)).filter(q => q?.open).sort((a, b) => dist(a) - dist(b))[0];
      if (from) {
        const dx = Math.sign(Math.round(p.d.pos[0] - from.d.pos[0])), dz = Math.sign(Math.round(p.d.pos[2] - from.d.pos[2]));
        const pt = { x: from.d.pos[0] + dx * 2.45, z: from.d.pos[2] + dz * 2.45 };
        if (this.setGoal('buy', from, pt, { buy: p })) return;
      }
    }
    // 4. field work: nearest open field, nearest cell still in the field's state; stand so the tool box (1.2 ahead) covers it
    const fields = f.fields.filter(x => x.parcel?.open).sort((a, b) => dist(a.parcel) - dist(b.parcel));
    for (const fl of fields) {
      const cell = fl.cells.filter(c => c.state === fl.state).sort((a, b) => Math.hypot(a.x - pl.x, a.z - pl.z) - Math.hypot(b.x - pl.x, b.z - pl.z))[0];
      if (!cell) continue;
      if (this.setGoal('field', fl.parcel, this.standFor(fl, cell), { field: fl, cell })) return;
    }
    this.goal = null;
  }

  // Stand 1.2 from the cell on the field-centre side, so the spot is always on open ground and the tool box covers it.
  standFor(fl, cell) {
    let ax = cell.x - fl.d.pos[0], az = cell.z - fl.d.pos[2];
    if (Math.hypot(ax, az) < 0.1) { ax = cell.x - this.f.player.x; az = cell.z - this.f.player.z; }
    const l = Math.hypot(ax, az) || 1;
    return { x: cell.x - ax / l * 1.2, z: cell.z - az / l * 1.2 };
  }

  input(dt) {
    // stuck guard: no progress for 1.5 s while walking a path -> drop the goal
    const pl0 = this.f.player;
    if (this.path.length) {
      const moved = this.lastP ? Math.hypot(pl0.x - this.lastP[0], pl0.z - this.lastP[1]) : 1;
      this.still = moved < 1e-4 ? (this.still || 0) + dt : 0;
      if (this.still > 1.5) { this.still = 0; this.goal = null; this.path = []; }
    }
    this.lastP = [pl0.x, pl0.z];
    const f = this.f, pl = f.player, g = this.goal;
    if (g?.kind === 'field' && g.cell.state !== g.field.state) this.goal = null;
    if (g?.kind === 'buy' && g.buy.open) this.goal = null;
    if (g?.kind === 'sell' && !g.parcel.open) this.goal = null;
    if (this.goal?.kind === 'hire' && !this.path.length) { f.hireWorker(this.goal.barn, this.goal.k); this.goal = null; }
    if (!this.goal || !this.path.length) {
      // stay on the goal while it is still working (selling, donating, cell timer)
      if (this.goal?.kind === 'sell' && f.merchants.some(m => m.parcel === this.goal.parcel && m.d.crops.some(c => f.bag[c] > 0))) return { x: 0, z: 0 };
      if (this.goal?.kind === 'buy' && !this.goal.buy.open && f.coins > 0) return { x: 0, z: 0 };
      if (this.goal?.kind === 'tree' && f.treeFruits(this.goal.tree) > 4) return { x: 0, z: 0 };
      if (this.goal?.kind === 'field' && this.goal.cell.state === this.goal.field.state) {
        // face the cell so the tool box (1.2 ahead) covers it: a tiny push turns without walking away
        const c = this.goal.cell, ax = c.x - f.player.x, az = c.z - f.player.z, l = Math.hypot(ax, az) || 1;
        if (l > 0.6 && l < 1.8) return { x: ax / l * 0.06, z: az / l * 0.06 };
        this.path = [this.standFor(this.goal.field, c)];
        if (Math.hypot(this.path[0].x - f.player.x, this.path[0].z - f.player.z) < 0.15) { this.goal = null; this.path = []; }
        return { x: 0, z: 0 };
      }
      this.choose();
      if (!this.goal) return { x: 0, z: 0 };
    }
    const t = this.path[0];
    const dx = t.x - pl.x, dz = t.z - pl.z, len = Math.hypot(dx, dz);
    if (len < 0.15) { this.path.shift(); return { x: 0, z: 0 }; }
    const before = [pl.x, pl.z];
    this.lastPos = before;
    const k = Math.min(1, len / (RULES.speed * dt));
    return { x: dx / len * k, z: dz / len * k };
  }
}
