// Map buildings around the production line (D:\lumber-ref\rules\map1-extra.md, cited as X + rule number):
//   recycle   trash bins: an idle player loses one carried log per 0.15 s, no reward (X 1-7)
//   gas       gas station stores gas (unlimited); one gas held on a machine's gas frame for 2 s boosts it 150 s (X 8-18)
//   bike      motorbike rental: 180 s of +5.5 speed, first ride free, later an ad (granted at once here) (X 23-29)
//   orderMan  special orders from player level 2: deliver 10-20 logs of any kind for 60 x the whole factory's 5 s
//             output; 600 s to fill, 150 s between orders, 15 a day (X 30-37)
//   uav       drone rental: fells the nearest tree and drops its log at the station for 2 x the factory's 5 s output (X 42-46)
// Timed state (boosts, rentals, orders) runs on state.clock, the seconds the game has been running.
import { WOOD, TREE } from './forest.js';
import { Pack } from './pack.js';

export const GAS = 1001;
const LOGS = [WOOD, 101, 102];
const RECYCLE = { first: 0.1, every: 0.15 };
const BOOST = { perGas: 150, stand: 2, speed: 1.8, take: 0.5 };
const RENT = 180;
const BIKE_SPEED = 5.5; // SkinBikeConf 100 (Vespa) BuffVal, added to the walking speed
const ORDER = { minLv: 2, cd: 150, life: 600, daily: 15, tick: 0.01, ratio: 60 };
const UAV = { speed: 7, hover: 4, hit: 1000, money: 2 };
const DAY = 24 * 3600;

export class Extras {
  constructor(sim) {
    this.sim = sim;
    const s = sim.state;
    s.clock = s.clock || 0;
    s.boost = s.boost || {};
    s.bonus = s.bonus || { bike: 0, firstBike: false, uav: 0, firstUav: false };
    s.order = s.order || { cd: ORDER.cd, need: 0, cur: 0, ends: 0, day: 0, done: 0 };
    this.timers = new Map();
    this.drone = null;
  }

  get clock() { return this.sim.state.clock; }
  of(kind) { return [...this.sim.world.buildings.values()].filter(b => b.kind === kind && this.sim.active(b.id)); }

  // ---- gas
  gasHouse() { return this.of('gas')[0] || null; }
  gasStock() { return this.sim.stock('gas'); }
  addGas(n) { this.sim.addStock('gas', n); this.sim.emit({ type: 'gas', n }); }
  boostLeft(id) { return Math.max(0, (this.sim.state.boost[id] || 0) - this.clock); }
  speedMul(id) { return this.boostLeft(id) > 0 ? BOOST.speed : 1; }

  // ---- rentals
  get riding() { return this.sim.state.bonus.bike > this.clock; }
  get flying() { return this.sim.state.bonus.uav > this.clock; }
  speedAdd() { return this.riding ? BIKE_SPEED : 0; }
  rent(what) {
    const B = this.sim.state.bonus;
    B[what] = this.clock + RENT;
    B[what === 'bike' ? 'firstBike' : 'firstUav'] = true;
    this.sim.emit({ type: 'rent', what });
    this.sim.emit({ type: 'status' });
  }
  rentLeft(what) { return Math.max(0, this.sim.state.bonus[what] - this.clock); }

  // FarmMgr.GetMostValuableItemPrice: coins the active machines make in 5 s at their current speed.
  valuable() {
    let sum = 0;
    for (const b of this.of('factory')) sum += this.sim.income(b.id) / this.sim.duration(b.id) * 5;
    return Math.max(1, Math.round(sum));
  }

  // ---- orders
  orderReward(rate = 1) { return ORDER.ratio * this.valuable() * rate; }
  orderOpen() { const o = this.sim.state.order; return o.need > 0; }
  orderDone() { const o = this.sim.state.order; return o.need > 0 && o.cur >= o.need; }
  claimOrder(rate = 1) {
    const o = this.sim.state.order;
    if (!this.orderDone()) return false;
    this.sim.earn(this.orderReward(rate), 'order');
    o.need = o.cur = 0;
    o.done++;
    o.cd = ORDER.cd;
    this.sim.emit({ type: 'orderClaim' });
    return true;
  }

  newOrder() {
    const rows = this.sim.config.OrderTypeConf.filter(r => r.Num === 1);
    const r = rows[Math.floor(Math.random() * rows.length)];
    const o = this.sim.state.order;
    Object.assign(o, { need: +r.NumCombine, cur: 0, ends: this.clock + ORDER.life });
    this.sim.emit({ type: 'order', need: o.need });
  }

  tick(dt, p, idle) {
    const sim = this.sim, s = sim.state;
    s.clock += dt;
    const inside = (b, box) => box && box.contains(p, 0.3);
    const every = (key, on, first, period) => {
      if (!on) { this.timers.delete(key); return false; }
      const t = (this.timers.has(key) ? this.timers.get(key) : first) - dt;
      this.timers.set(key, t < 0 ? period : t);
      return t < 0;
    };

    for (const b of this.of('recycle')) {
      if (every(`rc${b.id}`, idle && inside(b, b.funcBox) && LOGS.some(t => sim.pack.has(t)), RECYCLE.first, RECYCLE.every)) {
        const t = LOGS.find(x => sim.pack.has(x));
        sim.pack.take(t);
        sim.emit({ type: 'recycle', id: b.id, item: t });
      }
    }

    const gh = this.gasHouse();
    if (gh) {
      if (idle && inside(gh, gh.inBox)) while (sim.pack.take(GAS)) this.addGas(1);
      if (every('gasOut', idle && inside(gh, gh.outBox) && this.gasStock() > 0 && !sim.pack.full, 0, BOOST.take)) {
        sim.addStock('gas', -1);
        sim.pack.add(GAS);
        sim.emit({ type: 'pickup', id: gh.id, item: GAS });
      }
    }
    for (const b of this.of('factory')) {
      const on = idle && inside(b, b.gasBox) && sim.pack.has(GAS);
      if (every(`gas${b.id}`, on, BOOST.stand, BOOST.stand)) {
        sim.pack.take(GAS);
        s.boost[b.id] = Math.max(s.boost[b.id] || 0, this.clock) + BOOST.perGas;
        sim.emit({ type: 'boost', id: b.id });
      }
    }

    // Orders: one at a time, from player level 2, refreshed daily (OrderData.ResetDaily).
    const o = s.order;
    const day = Math.floor(this.clock / DAY);
    if (day !== o.day) { o.day = day; o.done = 0; }
    const man = this.of('orderMan')[0];
    if (man && s.level >= ORDER.minLv) {
      if (o.need > 0 && o.cur < o.need && this.clock > o.ends) {
        o.need = o.cur = 0;
        o.cd = ORDER.cd;
        sim.emit({ type: 'orderExpire' });
      } else if (o.need === 0 && o.done < ORDER.daily) {
        o.cd -= dt;
        if (o.cd <= 0) this.newOrder();
      }
      if (o.need > 0 && o.cur < o.need && inside(man, man.manBox)) {
        this.orderAcc = (this.orderAcc || 0) + dt;
        while (this.orderAcc >= ORDER.tick && o.cur < o.need) {
          this.orderAcc -= ORDER.tick;
          const t = LOGS.find(x => sim.pack.has(x));
          if (t == null) break;
          sim.pack.take(t);
          o.cur++;
          sim.emit({ type: 'orderAdd', item: t });
        }
      } else this.orderAcc = 0;
    }

    this.tickDrone(dt);
  }

  // The drone: take off, book the nearest standing tree, fell it in one blow, carry its log back and drop it on the
  // station's money frame, which pays 2 x the 5 s output (UAV_MONEYRADIO).
  tickDrone(dt) {
    const sim = this.sim;
    const st = this.of('uav')[0];
    if (!st) return;
    const home = st.moneyBox ? st.moneyBox.middle : st.pos;
    if (!this.drone) this.drone = { x: home.x, z: home.z, y: 0, phase: 'rest', tree: null, carry: false, pack: new Pack(1) };
    const d = this.drone;
    const fly = (to, h) => {
      const dx = to.x - d.x, dz = to.z - d.z, L = Math.hypot(dx, dz), step = UAV.speed * dt;
      d.y += Math.sign(h - d.y) * Math.min(Math.abs(h - d.y), 4 * dt);
      if (L <= step) { d.x = to.x; d.z = to.z; return Math.abs(d.y - h) < 0.05; }
      d.x += dx / L * step; d.z += dz / L * step;
      return false;
    };
    if (d.phase === 'rest') {
      fly(home, 0);
      if (!this.flying) return;
      d.tree = sim.forest.reserve(d, 1);
      if (d.tree) d.phase = 'go';
    } else if (d.phase === 'go') {
      if (d.tree.state !== TREE.STAND) { d.phase = 'rest'; return; }
      if (fly(d.tree.pos, UAV.hover)) {
        sim.forest.hit(d.tree, UAV.hit, d, sim.events);
        d.phase = 'wait';
      }
    } else if (d.phase === 'wait') {
      if (d.tree.state === TREE.STUMP) {
        d.tree.ground = 0;
        d.pack.items.length = 0;
        sim.forest.release(d);
        d.carry = true;
        d.phase = 'back';
      }
    } else if (d.phase === 'back') {
      if (fly(home, UAV.hover)) {
        d.carry = false;
        sim.pileAdd(st.id, UAV.money * this.valuable());
        d.phase = 'rest';
      }
    }
  }
}
