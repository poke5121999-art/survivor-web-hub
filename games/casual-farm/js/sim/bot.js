// A greedy player for tests and the in-page autoplay check: walks the real nav mesh and plays the Store 1 loop
// (coins → mats → harvest → stock → checkout → collect → upgrade). It only feeds Sim.setInput, like a joystick.
import { carryLimit } from './sim.js';

export class Bot {
  constructor(sim, nav) {
    this.sim = sim;
    this.nav = nav;
    this.goal = null;
    this.path = [];
    this.repath = 0;
    this.stuck = 0;
    this.last = null;
  }

  needs() {
    const s = this.sim.store, st = this.sim.state, need = new Map();
    s.shelves.forEach((sh, i) => {
      if (this.sim.isActive(sh.name) && st.shelves[i].count < sh.slots.length) need.set(sh.type, (need.get(sh.type) || 0) + sh.slots.length - st.shelves[i].count);
    });
    s.producers.forEach((p, i) => {
      if (!this.sim.isActive(p.name)) return;
      p.ins.forEach(t => { const sp = this.sim.inputSpace(i, t); if (sp > 0) need.set(t, (need.get(t) || 0) + sp); });
    });
    return need;
  }

  choose() {
    const sim = this.sim, s = sim.store, st = sim.state, me = st.player;
    const d = p => (p.x - me.x) ** 2 + (p.z - me.z) ** 2;
    const nearest = list => list.sort((a, b) => d(a.at) - d(b.at))[0];
    const carry = st.carry;
    const lim = carryLimit(st.stackLevel);

    // Chase an escaping thief: the stolen coins come back on a catch.
    const thief = st.thief && st.thief.chasing && st.thief.agent;
    if (thief) return { kind: 'thief', at: { x: thief.x, y: 0, z: thief.z } };

    const customers = st.customers || [];
    const waiting = s.cashiers.map((c, i) => customers.some(cu => cu.cashier === i && (cu.state === 4 || cu.state === 3 || cu.state === 2)) && !st.cashiers[i].worker);
    const deskJobs = s.cashiers.map((c, i) => ({ at: c.desk.middle, i })).filter(j => waiting[j.i] && sim.isActive(s.cashiers[j.i].name));
    if (deskJobs.length && customers.some(cu => cu.state === 4 && !st.cashiers[cu.cashier].worker)) return { kind: 'desk', ...nearest(deskJobs), hold: 1.5 };

    if (carry.length) {
      const drops = [];
      s.shelves.forEach((sh, i) => {
        if (sim.isActive(sh.name) && carry.includes(sh.type) && st.shelves[i].count < sh.slots.length) drops.push({ at: sh.zone.middle, kind: 'drop' });
      });
      s.producers.forEach((p, i) => {
        if (sim.isActive(p.name)) p.inputs.forEach(inp => { if (inp.zone && carry.includes(inp.type) && sim.inputSpace(i, inp.type) > 0) drops.push({ at: inp.zone.middle, kind: 'drop' }); });
      });
      if (drops.length && (carry.length >= lim || !this.pickable(carry.length < lim))) return nearest(drops);
      if (!drops.length && carry.length >= lim) {
        const bins = s.trash.filter(t => sim.isActive(t.name)).map(t => ({ at: t.zone.middle, kind: 'trash' }));
        if (bins.length) return nearest(bins);
      }
    }

    const coins = s.coins.map((c, i) => ({ at: c.pos, kind: 'coin' })).filter((c, i) => !st.coins[i].taken);
    if (coins.length) return nearest(coins);

    const cash = s.cashiers.map((c, i) => ({ at: c.cashZone.middle, kind: 'cash', i })).filter(c => st.cashiers[c.i].cash > 0 && sim.isActive(s.cashiers[c.i].name));
    if (cash.length && (st.cashiers.reduce((a, c) => a + c.cash, 0) >= 10 || !this.pickable(true))) return nearest(cash);

    const mats = s.mats.filter(m => st.mats[m.name].open && sim.isActive(m.name)).map(m => ({ at: m.zone.middle, kind: 'mat', m, rem: m.cost - st.mats[m.name].paid }));
    const affordable = mats.filter(m => m.rem <= st.cash);
    if (affordable.length) return { ...affordable.sort((a, b) => a.rem - b.rem)[0], hold: 0.5 };

    const prices = s.player.stackPrices;
    if (st.stackLevel < prices.length && st.cash >= prices[st.stackLevel] - st.upgrade.paid && s.player.upgradeZone && sim.isActive('UpgradeZone_Player')) {
      return { at: s.player.upgradeZone.middle, kind: 'upgrade', hold: 1.5 };
    }

    const pick = this.pickable(carry.length < lim);
    if (pick) return pick;
    if (cash.length) return nearest(cash);
    if (mats.length && st.cash > 0) return { ...mats.sort((a, b) => a.rem - b.rem)[0], hold: 0.5 };
    return null;
  }

  pickable(hasRoom) {
    if (!hasRoom) return null;
    const sim = this.sim, s = sim.store, st = sim.state, me = st.player;
    const need = this.needs();
    st.carry.forEach(t => need.set(t, (need.get(t) || 0) - 1));
    const options = [];
    s.producers.forEach((p, i) => {
      if (!sim.isActive(p.name) || !p.outZone) return;
      const items = st.producers[i].out.filter(x => x != null);
      if (items.length && (need.get(p.out) || 0) > 0) options.push({ at: p.outZone.middle, kind: 'pick', score: -items.length });
    });
    if (!options.length) return null;
    const d = p => (p.x - me.x) ** 2 + (p.z - me.z) ** 2;
    return options.sort((a, b) => d(a.at) - d(b.at))[0];
  }

  // The goal's trigger box already touches the player (the box middle may sit inside an obstacle).
  near(goal) {
    const z = this.sim.zone;
    if (!z) return false;
    if (goal.kind === 'desk') return this.sim.state.cashiers.some(c => c.playerOn);
    if (goal.kind === 'mat') return !!z.mat;
    if (goal.kind === 'drop' || goal.kind === 'trash') return z.inputs.length > 0;
    if (goal.kind === 'pick') return z.outputs.length > 0;
    if (goal.kind === 'cash') return z.cash.length > 0;
    if (goal.kind === 'upgrade') return !!z.upgrade;
    return false;
  }

  // Upgrade menu: buy a step when it costs less than a third of the cheapest mat still to buy (half for the carry),
  // but never while an open mat is affordable or just after one completes (the next one opens 1 s later).
  shop(dt) {
    this.shopT = (this.shopT || 0) + dt;
    if (this.shopT < 3) return;
    this.shopT = 0;
    const sim = this.sim, s = sim.store, st = sim.state;
    if (s.mats.some(m => st.mats[m.name].open && m.cost - st.mats[m.name].paid <= st.cash)) { this.calm = 0; return; }
    this.calm = (this.calm || 0) + 3;
    if (this.calm < 6) return;
    const next = Math.min(...s.mats.filter(m => !st.mats[m.name].done).map(m => m.cost), Infinity);
    const slots = [{ kind: 'player' }];
    s.producers.forEach((p, i) => { if (p.upgradable && sim.isActive(p.name)) slots.push({ kind: 'producer', i }); });
    (st.workers || []).forEach(w => { if (w.def.role !== 'cashier') slots.push({ kind: 'worker', name: w.name, base: s.unlockCost(w.name) }); });
    const best = slots.map(slot => ({ slot, offer: sim.upgradeOffer(slot) }))
      .filter(x => x.offer && x.offer.price > 0 && x.offer.price <= st.cash && x.offer.price <= next / (x.slot.kind === 'player' ? 2 : 3))
      .sort((a, b) => a.offer.price - b.offer.price)[0];
    if (best) sim.buyUpgrade(best.slot);
  }

  step(dt) {
    const sim = this.sim, me = sim.state.player;
    this.shop(dt);
    this.repath -= dt;
    if (!this.goal || this.repath <= 0) {
      const g = this.choose();
      if (!g) { sim.setInput(0, 0); return; }
      if (!this.goal || g.kind !== this.goal.kind || Math.hypot(g.at.x - this.goal.at.x, g.at.z - this.goal.at.z) > 0.5) {
        this.goal = g;
        this.path = this.nav ? (this.nav.path({ x: me.x, y: me.y, z: me.z }, g.at) || [g.at]) : [g.at];
        this.held = 0;
      }
      this.repath = this.goal.kind === 'thief' ? 0.15 : 0.5;
    }
    while (this.path.length && Math.hypot(this.path[0].x - me.x, this.path[0].z - me.z) < 0.6) this.path.shift();
    if (!this.path.length && this.goal && Math.hypot(this.goal.at.x - me.x, this.goal.at.z - me.z) > 3 && !this.near(this.goal)) {
      this.path = this.nav ? this.nav.path({ x: me.x, y: me.y, z: me.z }, this.goal.at) : [this.goal.at];
    }
    if (this.path.length) {
      const p = this.path[0];
      sim.setInput(p.x - me.x, p.z - me.z);
      const moved = this.last ? Math.hypot(me.x - this.last.x, me.z - this.last.z) : 1;
      this.stuck = moved < 0.01 ? this.stuck + dt : 0;
      if (this.stuck > 1) { this.path.shift(); this.stuck = 0; }
    } else {
      sim.setInput(0, 0);
      this.held += dt;
      if (this.held > (this.goal.hold || 0.3)) this.repath = 0;
    }
    this.last = { x: me.x, z: me.z };
  }
}
