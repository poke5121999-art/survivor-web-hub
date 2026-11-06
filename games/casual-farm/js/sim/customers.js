// Customers (CustomerManager + CustomerAgentController + MatCustomer + CashierController checkout).
// Rules: D:\minimart-ref\rules\customers.md and production.md (cashier). Like CustomerPool.GetObject, a replacement
// spawns at once; when every unlocked pool object is still walking out, `agent` names a clone the view instantiates.
import { BOOST } from './boosters.js';
const SPEED = 10;                 // NavMeshAgent speed on _CustomerAgent_*
const PICK_RATE = 0.5;            // CustomerAgentController.pickupRate (scene)
const HAND_LIMIT = 3;             // limitToCarryByHand
const WAIT_TIME = 3;              // RC_PatienceTimer.customerItemWaitTime
const PATIENCE_TIME = 10;         // customerItemPatienceTime
// Checkout timeline (rules/checkout-anim.md): the box pops in over BOX_POP, one item leaves every PACK_RATE (the first one
// a full interval after the pop, the lid closes on the tick that finds none left), then PickUpBox: lift at +0.75, landed
// at +1.25, walk away and pay at +1.75.
const BOX_POP = 0.25;
const PACK_RATE = 0.3;            // BoxController.packingRate (PackagingBox prefab)
const PICKUP_WALK = 1.75;
const ARRIVE = 0.4;

export const CState = { Shelf: 0, ToCashier: 2, Queue: 3, Ready: 4, Packing: 5, Leaving: 7, WaitCashier: 8, WaitShelf: 9 };

export class Customers {
  constructor(sim, nav) {
    this.sim = sim;
    this.nav = nav;
    const c = sim.store.customers;
    this.def = c;
    this.list = [];
    this.nextId = 1;
    this.liveDemand = {};
    this.failed = {};
    this.unlocked = new Set();
    this.shelfQueue = sim.store.shelves.map(() => []);
    this.cashQueue = sim.store.cashiers.map(() => []);
    sim.state.customers = this.list;
  }

  freeAgent() {
    const used = new Set(this.list.map(c => c.agent));
    return this.def.agents.find(a => this.unlocked.has(a.name) && !used.has(a.name));
  }

  population() {
    return this.list.filter(c => c.state !== CState.Leaving).length;
  }

  step(dt, sim) {
    for (const a of this.def.agents) {
      if (!this.unlocked.has(a.name) && sim.isActive(a.name)) {
        this.unlocked.add(a.name);
      }
    }
    const extra = sim.boosters && sim.boosters.on('customer') ? BOOST.customer : 0;
    // Nothing on sale yet: a customer would have an empty order and turn straight back (and never count). No new
    // customers while the map is open (CustomerManager.c:4386, mapMode).
    while (!sim.state.mapMode && this.population() < this.unlocked.size + extra && this.available().length) {
      const agent = this.freeAgent();
      this.spawn(agent ? agent.name : `${[...this.unlocked][0]}#${this.nextId}`);
    }
    for (const c of [...this.list]) this.stepOne(c, dt);
  }

  // --- demand (CustomerManager.SetNextCustomerDemand / SetProceduralDemand) --------------------------------------
  available() {
    const s = this.sim.store;
    const types = new Set();
    s.shelves.forEach(sh => { if (this.sim.isActive(sh.name)) types.add(sh.type); });
    return [...types];
  }

  achievable(demand) {
    const av = new Set(this.available());
    return demand.every(d => av.has(d.type));
  }

  nextDemand() {
    const d = this.def, i = this.sim.state.demandIndex;
    if (i < d.demands.length && i < d.codeProceduralFrom) {
      const scripted = d.demands[i];
      if (i < d.basicUpTo || this.achievable(scripted)) return { items: scripted.map(x => ({ ...x })), scripted: true };
    }
    return { items: this.procedural(), scripted: false };
  }

  procedural() {
    const rng = this.sim.rng, quotas = this.sim.store.quotas;
    let avail = this.available();
    for (let k = avail.length - 1; k >= 1; k--) {
      const t = avail[k];
      if ((this.failed[t] || 0) > 5) { this.failed[t] = 0; this.liveDemand[t] = 0; }
      if ((this.liveDemand[t] || 0) >= (quotas[t] ?? 5)) {
        avail.splice(k, 1);
        this.failed[t] = (this.failed[t] || 0) + 1;
      }
    }
    if (!avail.length) avail = this.available().slice(0, 1);
    const n = 1 + Math.floor(rng() * Math.min(avail.length, 5));
    const maxAmount = n === 3 || n === 4 ? 3 : 2;
    const items = [];
    for (let k = 0; k < n && avail.length; k++) {
      const t = avail.splice(Math.floor(rng() * avail.length), 1)[0];
      items.push({ type: t, n: 1 + Math.floor(rng() * maxAmount) });
    }
    return items;
  }

  // --- lifecycle -------------------------------------------------------------------------------------------------
  spawn(agent) {
    const rng = this.sim.rng, d = this.def;
    const sp = d.spawns[Math.floor(rng() * d.spawns.length)];
    const dem = this.nextDemand();
    dem.items.forEach(x => { this.liveDemand[x.type] = (this.liveDemand[x.type] || 0) + 1; });
    const total = dem.items.reduce((a, x) => a + x.n, 0);
    const c = {
      id: this.nextId++, agent, x: sp.x, y: sp.y, z: sp.z, dirX: 0, dirZ: 1, path: [], moving: false,
      state: CState.Shelf, items: dem.items.map(x => ({ ...x, got: 0 })), di: 0, scripted: dem.scripted,
      trolley: total > HAND_LIMIT, carried: [], shelf: -1, slot: -1, cashier: -1, qslot: -1, timer: 0,
      wait: 0, patience: 0, patienceOn: false, angry: false, face: null, packT: 0, reward: 0,
    };
    this.list.push(c);
    this.sim.emit({ type: 'customerSpawn', id: c.id, agent });
    this.goNext(c);
  }

  goTo(c, p) {
    c.path = this.nav ? this.nav.path({ x: c.x, y: c.y, z: c.z }, p) : [p];
    c.target = p;
  }

  walk(c, dt) {
    if (!c.path.length) { c.moving = false; return true; }
    let budget = SPEED * dt;
    while (budget > 0 && c.path.length) {
      const p = c.path[0];
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz);
      if (d <= budget) {
        c.x = p.x; c.z = p.z; c.y = p.y ?? c.y;
        c.path.shift();
        budget -= d;
      } else {
        c.x += dx / d * budget; c.z += dz / d * budget;
        c.dirX = dx / d; c.dirZ = dz / d;
        budget = 0;
      }
    }
    c.moving = c.path.length > 0;
    return !c.moving;
  }

  shelfFor(type) {
    const s = this.sim.store;
    let best = -1, bestCount = -1;
    s.shelves.forEach((sh, i) => {
      if (sh.type !== type || !this.sim.isActive(sh.name)) return;
      const n = this.sim.state.shelves[i].count;
      if (n > bestCount) { best = i; bestCount = n; }
    });
    return best;
  }

  goNext(c) {
    while (c.di < c.items.length && c.items[c.di].got >= c.items[c.di].n) c.di++;
    if (c.di >= c.items.length) {
      if (c.carried.length) this.toCashier(c);
      else this.leave(c, false);
      return;
    }
    const si = this.shelfFor(c.items[c.di].type);
    if (si < 0) { this.releaseShelf(c); c.shelf = -1; c.state = CState.WaitShelf; return; }
    this.releaseShelf(c);
    c.shelf = si;
    this.requestShelfSlot(c);
  }

  requestShelfSlot(c) {
    const sh = this.sim.store.shelves[c.shelf];
    const used = new Set(this.list.filter(o => o !== c && o.shelf === c.shelf && o.slot >= 0).map(o => o.slot));
    const k = sh.queue.findIndex((q, i) => !used.has(i));
    if (k < 0) { c.state = CState.WaitShelf; c.slot = -1; return; }
    c.slot = k;
    c.state = CState.Shelf;
    c.atShelf = false;
    const rng = this.sim.rng, q = sh.queue[k].pos;
    this.goTo(c, { x: q.x + (rng() * 2 - 1), y: q.y, z: q.z + (rng() * 2 - 1) });
  }

  releaseShelf(c) {
    if (c.shelf >= 0) {
      const q = this.shelfQueue[c.shelf];
      const k = q.indexOf(c.id);
      if (k >= 0) q.splice(k, 1);
    }
    c.slot = -1;
    c.atShelf = false;
  }

  toCashier(c) {
    this.releaseShelf(c);
    c.shelf = -1;
    const s = this.sim.store;
    let best = -1, bd = Infinity;
    s.cashiers.forEach((ca, i) => {
      if (!this.sim.isActive(ca.name)) return;
      const d = (ca.queue[0].pos.x - c.x) ** 2 + (ca.queue[0].pos.z - c.z) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    c.cashier = best;
    c.state = CState.WaitCashier;
    if (!c.doneEmitted) {
      c.doneEmitted = true;
      this.sim.emit({ type: 'customerDone', id: c.id });
    }
    if (best >= 0) this.requestCashierSlot(c);
  }

  requestCashierSlot(c) {
    const q = this.cashQueue[c.cashier];
    if (!q.includes(c.id)) {
      if (q.length >= this.sim.store.cashiers[c.cashier].queue.length) { c.state = CState.WaitCashier; return; }
      q.push(c.id);
    }
    this.placeInQueue(c);
  }

  placeInQueue(c) {
    const q = this.cashQueue[c.cashier];
    c.qslot = q.indexOf(c.id);
    c.state = CState.ToCashier;
    this.goTo(c, this.sim.store.cashiers[c.cashier].queue[c.qslot].pos);
  }

  leave(c, paid) {
    this.releaseShelf(c);
    if (c.cashier >= 0) {
      const q = this.cashQueue[c.cashier];
      const k = q.indexOf(c.id);
      if (k >= 0) {
        q.splice(k, 1);
        for (const o of this.list) if (o.cashier === c.cashier && q.includes(o.id)) this.placeInQueue(o);
        for (const o of this.list) if (o !== c && o.cashier === c.cashier && o.state === CState.WaitCashier) this.requestCashierSlot(o);
      }
    }
    c.items.forEach(x => { this.liveDemand[x.type] = Math.max(0, (this.liveDemand[x.type] || 0) - 1); });
    if (paid && !c.unachievable) this.sim.state.demandIndex++;
    c.state = CState.Leaving;
    c.cashier = -1;
    const ex = this.def.exits;
    let best = ex[0], bd = Infinity;
    ex.forEach(e => { const d = (e.x - c.x) ** 2 + (e.z - c.z) ** 2; if (d < bd) { bd = d; best = e; } });
    this.goTo(c, best);
    this.sim.emit({ type: 'customerLeave', id: c.id, paid });
  }

  stepOne(c, dt) {
    const sim = this.sim;
    switch (c.state) {
      case CState.WaitShelf:
        if (c.shelf < 0) this.goNext(c);
        else this.requestShelfSlot(c);
        break;
      case CState.Shelf: {
        if (!c.atShelf) {
          if (!this.walk(c, dt)) return;
          c.atShelf = true;
          this.shelfQueue[c.shelf].push(c.id);
          c.wait = 0; c.patience = 0; c.patienceOn = false;
          const look = sim.store.shelves[c.shelf].queue[c.slot].look;
          const dx = look.x - c.x, dz = look.z - c.z, d = Math.hypot(dx, dz) || 1;
          c.dirX = dx / d; c.dirZ = dz / d;
        }
        const item = c.items[c.di];
        const shelfState = sim.state.shelves[c.shelf];
        const myTurn = this.shelfQueue[c.shelf][0] === c.id;
        const onShelf = shelfState.count - (shelfState.landing || 0);
        if (myTurn && onShelf > 0) {
          c.timer += dt;
          if (c.timer >= PICK_RATE) {
            c.timer = 0;
            shelfState.count--;
            item.got++;
            c.carried.push(item.type);
            c.wait = 0; c.patience = 0; c.patienceOn = false;
            sim.emit({ type: 'customerPick', id: c.id, shelf: c.shelf, slot: onShelf - 1, item: item.type, index: c.carried.length - 1 });
            if (item.got >= item.n) {
              const q = this.shelfQueue[c.shelf];
              q.splice(q.indexOf(c.id), 1);
              c.di++;
              this.goNext(c);
            }
          }
          return;
        }
        c.timer = 0;
        if (!c.patienceOn) {
          c.wait += dt;
          if (c.wait >= WAIT_TIME) { c.patienceOn = true; c.patience = 0; sim.emit({ type: 'customerPatience', id: c.id }); }
        } else {
          c.patience += dt;
          if (c.patience >= PATIENCE_TIME) {
            // OnPatienceTimerComplete -> GoToNext: give up on this item only and move on to the next one; after the
            // last one, pay for what was taken or go home empty-handed.
            c.angry = true;
            c.angryAt = sim.state.t;
            item.n = item.got;
            const q = this.shelfQueue[c.shelf];
            if (q.indexOf(c.id) >= 0) q.splice(q.indexOf(c.id), 1);
            c.di++;
            this.goNext(c);
          }
        }
        break;
      }
      case CState.WaitCashier:
        if (c.cashier < 0) this.toCashier(c);
        else this.requestCashierSlot(c);
        break;
      case CState.ToCashier:
        if (!this.walk(c, dt)) return;
        c.state = c.qslot === 0 ? CState.Ready : CState.Queue;
        break;
      case CState.Queue:
        break;
      case CState.Ready: {
        const cs = sim.state.cashiers[c.cashier];
        if (!(cs.playerOn || cs.worker)) return;
        c.state = CState.Packing;
        c.packT = 0;
        const n = c.carried.length;
        c.closeAt = BOX_POP + (n + 1) * PACK_RATE;
        c.packDur = c.closeAt + PICKUP_WALK;
        c.reward = c.items.reduce((a, x) => a + Math.trunc((sim.store.prices[x.type] ?? 1) * x.got), 0);
        // GameManager.IsCashBoosted: the reward is doubled before rounding.
        if (sim.boosters && sim.boosters.on('cash')) c.reward *= BOOST.cash;
        // RevenueBoost outfit: round(m x pay) after the ad x2 (cashBoosterMultiplier).
        const rev = (sim.abilities || {}).revenue || 1;
        if (rev !== 1) c.reward = Math.round(c.reward * rev);
        sim.emit({ type: 'customerPack', id: c.id, cashier: c.cashier, items: c.carried.slice(), duration: c.packDur, close: c.closeAt });
        break;
      }
      case CState.Packing:
        c.packT += dt;
        // PickUpBox OnStart: the sealed box lifts off the desk (PlayBoxPickUpSfx) 0.75 s after the lid closes.
        if (!c.lifted && c.packT >= c.closeAt + 0.75) { c.lifted = true; sim.emit({ type: 'boxPick', id: c.id }); }
        if (c.packT < c.packDur) return;
        sim.giveCash(c.cashier, c.reward, c.id);
        sim.emit({ type: 'customerPay', id: c.id, cashier: c.cashier, amount: c.reward });
        c.face = c.angry ? 'neutral' : 'happy';
        this.leave(c, true);
        break;
      case CState.Leaving:
        if (this.walk(c, dt)) {
          this.list.splice(this.list.indexOf(c), 1);
          sim.emit({ type: 'customerGone', id: c.id, agent: c.agent });
        }
        break;
      default:
        break;
    }
  }
}
