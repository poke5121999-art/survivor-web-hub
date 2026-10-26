// Car customer / phone order (rules/car-orders.md). Once `_ActivateCarCustomer` is active a car drives in on its own
// every carSpawnTimer s (Random 90..180, rolled once per mart load) unless a thief is out. It orders 1..4 of the item
// types whose machine and shelf are both open; the player drops them into the car like onto a shelf, then presses
// Collect for 5 x the order's price. The order expires 10 minutes after the car arrives.
import { Box, compose } from './math.js';

const SLIDE = 3, EXPIRE = 600, INCOME = 5;
// Count per type by number of types (CustomerManager.SetPhoneOrderDemand, libil2cpp rodata): [lo, hi) per r.
const COUNTS = { 1: [8, 11], 2: [4, 7], 3: [3, 5], 4: [1, 4] };
// MatCar's trigger is on the car prefab, which is not exported: a 10 m square around the parking spot (guess).
const ZONE = 10;

export class Cars {
  constructor(sim) {
    this.sim = sim;
    const s = sim.store;
    const cm = s.node('CUSTOMERS');
    const point = s.children[cm] ? s.children[cm].find(j => /^CarPoint/.test(s.nodes[j].n)) : null;
    this.point = point != null ? s.pos(point) : null;
    this.pointNode = point;
    this.every = 90 + sim.rng() * 90;
    if (this.point) {
      const m = compose([this.point.x, 0, this.point.z]);
      this.zone = new Box(m, { m_Center: { x: 0, y: 1, z: 0 }, m_Size: { x: ZONE, y: 4, z: ZONE } });
    }
    sim.state.car = { timer: 0, order: null };
    sim.cars = this;
  }

  // Item types with both an open producer and an open shelf (ProgressManager.GetObjectDemandAvailableList).
  available() {
    const sim = this.sim, s = sim.store;
    const made = new Set(s.producers.filter(p => sim.isActive(p.name)).map(p => p.out));
    return [...new Set(s.shelves.filter(sh => sim.isActive(sh.name) && made.has(sh.type)).map(sh => sh.type))];
  }

  step(dt, sim) {
    const st = sim.state.car;
    if (!this.point || !sim.isActive('_ActivateCarCustomer')) return;
    if (!st.order) {
      st.timer += dt;
      if (st.timer < this.every) return;
      st.timer = 0;
      if (sim.state.thief && sim.state.thief.agent) return;
      const avail = this.available();
      if (!avail.length) return;
      const r = 1 + Math.floor(sim.rng() * Math.min(avail.length, 4));
      const [lo, hi] = COUNTS[r];
      const items = [];
      for (let k = 0; k < r; k++) {
        const type = avail.splice(Math.floor(sim.rng() * avail.length), 1)[0];
        items.push({ type, n: lo + Math.floor(sim.rng() * (hi - lo)), got: 0 });
      }
      st.order = { items, arrive: sim.state.t + SLIDE, expires: sim.state.t + SLIDE + EXPIRE };
      sim.emit({ type: 'carArrive', items });
      return;
    }
    if (sim.state.t >= st.order.expires) {
      st.order = null;
      sim.emit({ type: 'carLeave', paid: false });
    }
  }

  ready() {
    const o = this.sim.state.car.order;
    return !!o && this.sim.state.t >= o.arrive;
  }

  needs(type) {
    const o = this.sim.state.car.order;
    return this.ready() && o.items.some(x => x.type === type && x.got < x.n);
  }

  give(type) {
    const it = this.sim.state.car.order.items.find(x => x.type === type && x.got < x.n);
    it.got++;
  }

  full() {
    const o = this.sim.state.car.order;
    return this.ready() && o.items.every(x => x.got >= x.n);
  }

  // Collect: trunc(5 x sum(trunc(price x count))) paid in one lump, the car leaves.
  collect() {
    if (!this.full()) return 0;
    const sim = this.sim, o = sim.state.car.order;
    const reward = o.items.reduce((a, x) => a + Math.trunc((sim.store.prices[x.type] || 0) * x.n), 0);
    const income = Math.trunc(INCOME * reward);
    sim.state.cash += income;
    sim.state.car.order = null;
    sim.emit({ type: 'carLeave', paid: true, amount: income });
    sim.emit({ type: 'coinPile', amount: income });
    return income;
  }
}
