// Plays the stage through the same input as a person (a joystick vector), for tests and ?bot.
import { inBox, ITEM } from './sim.js';

export class Bot {
  // opt.shop = false: never buy from the office / HR menus (tests click those buttons themselves).
  constructor(sim, opt = {}) {
    this.sim = sim;
    this.shop = opt.shop !== false;
    this.goal = null;
    this.why = '';
    this.wait = 0;
  }

  // Returns the joystick vector for this frame.
  input(dt) {
    const sim = this.sim, s = sim.s, d = sim.d, p = s.player.pos;
    const g = this.choose();
    this.goal = g && g.pos;
    this.why = g ? g.why : 'idle';
    if (!g) return { x: 0, z: 0 };
    // Re-plan when the goal moves or every 2 s (something may have been built across the way).
    this.replan = (this.replan || 0) - dt;
    if (sim.grid && (!this.route || this.route.goal[0] !== g.pos[0] || this.route.goal[2] !== g.pos[2] || this.replan <= 0)) {
      this.route = { goal: g.pos, pts: sim.grid.path(p[0], p[2], g.pos[0], g.pos[2]) || [[g.pos[0], g.pos[2]]] };
      this.replan = 2;
    }
    let tgt = [g.pos[0], g.pos[2]];
    if (this.route) {
      while (this.route.pts.length > 1 && Math.hypot(this.route.pts[0][0] - p[0], this.route.pts[0][1] - p[2]) < 0.2) this.route.pts.shift();
      tgt = this.route.pts[0] || tgt;
    }
    const dx = tgt[0] - p[0], dz = tgt[1] - p[2];
    const len = Math.hypot(dx, dz);
    if (len < 0.15) return { x: 0, z: 0 };
    // Slow down on the last step so the stick does not overshoot a small pad.
    const k = Math.min(1, len / (sim.speed * dt * 1.5));
    return { x: dx / len * k, z: dz / len * k };
  }

  choose() {
    const sim = this.sim, s = sim.s, d = sim.d;
    const at = (x, z, why) => ({ pos: [x, 0, z], why });
    if (s.startPile > 0) return at(d.startMoney.pos[0], d.startMoney.pos[2], 'start money');
    // New things first (in the order the game shows them), grade upgrades only with spare money.
    const pads = sim.visiblePads().map(id => ({ id, kind: sim.pads.get(id).kind, cost: sim.upgradeCost(id) - (s.paid[id] || 0) }))
      .filter(x => x.cost != null && sim.canBuy(x.id) && x.cost <= s.money * (x.kind === 'upgrade' && x.id !== 'upgrade6' ? 0.5 : 1))
      .sort((a, b) => (a.kind === 'upgrade') - (b.kind === 'upgrade') || a.cost - b.cost);
    // Office / HR purchases (a person walks in and taps; the bot calls the same Sim.buyUpgrade): when no pad is
    // affordable, buy the cheapest row it can pay for. They also earn star exp, which gates the district pads.
    if (this.shop && !pads.length) {
      const rows = [];
      const o = sim.upgradeOffer();
      if (s.built.office1) for (const f of ['cap', 'speed', 'price']) if (o.player[f].cost != null && o.player[f].next != null) rows.push([`player.${f}`, o.player[f].cost]);
      if (s.built.hr1) {
        if (o.worker.employ.cost != null && s.workers.length < o.worker.employ.max) rows.push(['worker.employ', o.worker.employ.cost]);
        for (const f of ['cap', 'speed']) if (o.worker[f].cost != null && o.worker[f].next != null) rows.push([`worker.${f}`, o.worker[f].cost]);
      }
      rows.sort((a, b) => a[1] - b[1]);
      if (rows.length && rows[0][1] <= s.money) sim.buyUpgrade(rows[0][0]);
    }
    const carry = s.player.carry;
    // Paying a pad does not need empty hands; requiring them looped for ever when the way to the pad passed a grill
    // (the stack refills on the way, the bot walked back to drop it, and so on). Cups go to the trash first.
    if (pads.length && (!carry.length || carry[0] !== ITEM.cup)) { const b = sim.pads.get(pads[0].id).box; return at(b[0], b[1], `pad ${pads[0].id}`); }
    // Money waiting on the counter.
    for (const c of d.counters) {
      const st = s.counter[c.id];
      if (st && st.money >= 30 && !carry.length) return at(c.money[0], c.money[1], 'collect');
    }
    for (const k of d.drives) {
      const st = s.drive[k.id];
      if (st && st.money >= 30 && !carry.length) return at(k.money[0], k.money[1], 'collect drive');
    }
    for (const k of d.kiosks) {
      const st = s.kiosk[k.id];
      if (st && st.money >= 30 && !carry.length) return at(k.money[0], k.money[1], 'collect kiosk');
    }
    if (carry.length && carry[0] === ITEM.cup) { const b = d.trash.find(t => t.active).box; return at(b[0], b[1] + b[3] + 0.2, 'trash'); }
    const c = d.counters.find(k => s.counter[k.id]);
    const head = c && s.customers.find(x => x.counter === c.id && x.state === 'queue' && x.slot === 0 && x.arrived);
    const dv = d.drives.find(k => s.drive[k.id]);
    const pk = d.packers.find(k => s.packer[k.id]);
    const ps = pk && s.packer[pk.id], ds = dv && s.drive[dv.id];
    if (carry.length && carry[0] === ITEM.package && dv) return at(dv.storage[0], dv.storage[1], 'drop boxes');
    if (c) {
      const st = s.counter[c.id];
      // Burgers go to the package table while it is short and the counter has some (and always during guide steps 20-21).
      // Boxes still owed to waiting cars beyond what is packed or on the window.
      const owed = dv && pk ? s.cars.filter(x => x.drive === dv.id && x.state === 'wait').reduce((n, x) => n + x.want - x.got, 0) - ds.n - ps.out - Math.floor(ps.in / 4) : 0;
      const toPack = pk && ps.in < 2 * 4 && ((s.guide >= 20 && s.guide <= 21) || owed > 0 || st.n >= 8);
      // The kiosk sells by itself; keep it stocked while people wait at it (and for guide step 27).
      const ko = d.kiosks.find(k => s.kiosk[k.id]);
      const kn = ko && s.kiosk[ko.id].n;
      const toKiosk = ko && kn < 6 && (s.guide === 26 || s.guide === 27 || s.customers.some(x => x.kiosk === ko.id && x.state !== 'exit'));
      if (carry.length && carry[0] === ITEM.burger && toKiosk && !(s.guide >= 20 && s.guide <= 21)) return at(ko.storage[0], ko.storage[1], 'feed kiosk');
      if (carry.length && carry[0] === ITEM.burger) return toPack ? at(pk.storage[0], pk.storage[1], 'feed packer') : at(c.storage[0], c.storage[1], 'drop burgers');
      const hired = (s.grade[c.id] || 0) >= c.employGrade;
      if (!hired && head && st.n > 0) return at(c.cashier[0], c.cashier[2], 'sell');
    }
    if (dv) {
      const car = s.cars.find(x => x.drive === dv.id && x.state === 'wait' && x.slot === 0 && x.arrived);
      if (car && ds.n > 0 && (s.grade[dv.id] || 0) < dv.employGrade) return at(dv.storage[0], dv.storage[1], 'sell drive');
    }
    if (pk) {
      const g = s.grade[pk.id] || 0;
      if (ps.in >= 4 && ps.out < pk.maxOut[g] && g < pk.employGrade && !carry.length) return at(pk.zone[0], pk.zone[1], 'pack');
      if (ps.out > 0 && dv && ds.n < 10 && (!carry.length || carry[0] === ITEM.package)) return at(pk.pickup[0], pk.pickup[1], 'pick boxes');
    }
    const dirty = d.tables.find(t => s.table[t.id] && s.table[t.id].cups > 0 && !s.workers.some(w => w.task && w.task.table === t.id));
    if (dirty && !carry.length) return at(dirty.zone[0], dirty.zone[1] + dirty.zone[3] + 0.3, 'clean');
    if (c && (s.counter[c.id].n < 20 || (pk && ps.in < 8))) {
      const m = d.machines.filter(k => s.machine[k.id] && s.machine[k.id].n > 0).sort((a, b) => s.machine[b.id].n - s.machine[a.id].n)[0];
      if (m) return at(m.zone[0], m.zone[1] + m.zone[3] + 0.6, 'grill');
    }
    for (const c2 of d.counters) if (s.counter[c2.id] && s.counter[c2.id].money > 0) return at(c2.money[0], c2.money[1], 'collect');
    for (const k of d.drives) if (s.drive[k.id] && s.drive[k.id].money > 0) return at(k.money[0], k.money[1], 'collect drive');
    for (const k of d.kiosks) if (s.kiosk[k.id] && s.kiosk[k.id].money > 0) return at(k.money[0], k.money[1], 'collect kiosk');
    if (c && !((s.grade[c.id] || 0) >= c.employGrade)) return at(c.cashier[0], c.cashier[2], 'wait at counter');
    return null;
  }
}
