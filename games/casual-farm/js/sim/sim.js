// The mart simulation: player carrying, unlock mats, producers, shelves, cashier cash, upgrades. Pure and
// deterministic given (store, rng, inputs). Rules and numbers: D:\minimart-ref\rules\{player,production,progression}.md.
// The view reads `state` and drains `events` each frame; customers and workers plug in as systems.
import { COIN } from './store.js';

const ITEM_HEIGHT = 1.3;
const COIN_PILE_RATE = 0.0182;      // PlayerHumanController.cashPickUpRate, one coin per tick (inferred)
const UPGRADE_BEGIN = 0.25;         // UpgradeActionZone.playerPresentDurationToBegin
const UPGRADE_SPEND = 0.65;         // playerPresentDurationToSpend
const UPGRADE_COOLDOWN = 2.5;
const DESK_CASH_LIMIT = 240;        // CashierController._cashLimitOnDesk
const PLAYER_RADIUS = 1;            // Player_Chef CapsuleCollider.m_Radius (trigger)

export function carryLimit(level) {
  return level < 4 ? level + 3 : 7;
}

export class Sim {
  constructor(store, { rng = Math.random, save = null } = {}) {
    this.store = store;
    this.rng = rng;
    this.events = [];
    this.listeners = [];
    this.timers = [];
    this.systems = [];
    const s = this.state = {
      t: 0, cash: 0, stackLevel: 0,
      player: { x: store.player.start.x, y: 0, z: store.player.start.z, dirX: 0, dirZ: 1, moving: false, frozen: 0 },
      carry: [],
      active: new Set(),
      mats: Object.fromEntries(store.mats.map(m => [m.name, { open: false, done: false, paid: 0, anim: 0, openAt: 0 }])),
      producers: store.producers.map(p => ({ out: new Array(p.outSlots.length).fill(null), inputs: {}, timer: 0, busy: false, making: null })),
      shelves: store.shelves.map(() => ({ count: 0 })),
      cashiers: store.cashiers.map(() => ({ cash: 0, worker: false, playerOn: false })),
      coins: store.coins.map(() => ({ taken: false })),
      upgrade: { present: 0, paid: 0, cooldownUntil: 0 },
      drain: { delay: 0, rate: 0, mult: 1, inc: 0, amount: 1, step: 0, stop: false, target: null },
      acc: { pick: 0, drop: 0, coin: 0 },
      tick: 0,
    };
    // Scene-inactive objects (a: 0) stay off unless a mat activates them; objects a mat unlocks start hidden.
    store.nodes.forEach(n => {
      if (n.a !== 0 && !store.activatedLater.has(n.n)) s.active.add(n.n);
    });
    store.mats.forEach(m => { if (m.startsOpen) this.openMat(m, 0); });
    if (save) this.load(save);
  }

  // A NavMeshObstacle blocks while every gameplay ancestor that a mat unlocks is active.
  isSolid = o => this.store.obstacleGates(o).every(n => this.state.active.has(n));

  emit(e) {
    this.events.push(e);
    for (const f of this.listeners) f(e);
  }

  after(delay, fn) {
    this.timers.push({ at: this.state.t + delay, fn });
  }

  isActive(name) {
    return this.state.active.has(name);
  }

  // --- activation (MatActivateController.ActivateObjects + MasterController.ActivateObject) -----------------------
  activate(name, delay) {
    const mat = this.store.mats.find(m => m.name === name);
    if (mat) {
      this.openMat(mat, delay);
      return;
    }
    this.after(delay, () => {
      if (this.state.active.has(name)) return;
      this.state.active.add(name);
      this.emit({ type: 'activate', name });
      const pi = this.store.producers.findIndex(p => p.name === name);
      if (pi >= 0 && this.store.producers[pi].kind === 'auto') this.tryStart(pi);
    });
  }

  openMat(mat, delay) {
    const ms = this.state.mats[mat.name];
    if (ms.open || ms.done) return;
    const waiting = mat.waitFor.filter(n => !this.state.mats[n] || !this.state.mats[n].done);
    if (waiting.length) {
      ms.waiting = true;
      return;
    }
    ms.waiting = false;
    ms.open = true;
    ms.openAt = this.state.t + delay + 0.25 + mat.noPayFor;
    this.after(delay, () => {
      this.state.active.add(mat.name);
      this.emit({ type: 'matOpen', name: mat.name });
    });
  }

  completeMat(mat) {
    const ms = this.state.mats[mat.name];
    ms.done = true;
    ms.open = false;
    this.state.active.delete(mat.name);
    this.emit({ type: 'matDone', name: mat.name, highlight: mat.highlight });
    mat.activate.forEach(a => this.activate(a.name, a.delay));
    this.store.mats.forEach(m => {
      const st = this.state.mats[m.name];
      if (st.waiting) this.openMat(m, 1);
    });
  }

  // --- producers (FactoryAutoProduceController / FactoryInputProduceController) ---------------------------------
  tryStart(pi) {
    const p = this.store.producers[pi], ps = this.state.producers[pi];
    if (ps.busy || !this.state.active.has(p.name)) return;
    const free = this.freeOutSlot(pi);
    if (free < 0) return;
    if (p.kind !== 'auto') {
      if (!p.ins.every(t => (ps.inputs[t] || 0) > 0)) return;
      p.ins.forEach(t => { ps.inputs[t]--; });
      this.emit({ type: 'consume', producer: pi, items: p.ins });
    }
    ps.busy = true;
    ps.timer = 0;
    this.emit({ type: 'produceStart', producer: pi });
  }

  freeOutSlot(pi) {
    const p = this.store.producers[pi], ps = this.state.producers[pi];
    for (let k = 0; k < Math.min(ps.out.length, p.limit); k++) if (ps.out[k] == null) return k;
    return -1;
  }

  stepProducers(dt) {
    this.store.producers.forEach((p, pi) => {
      const ps = this.state.producers[pi];
      if (!ps.busy) return;
      ps.timer += dt;
      if (ps.timer < p.time) return;
      ps.busy = false;
      const k = this.freeOutSlot(pi);
      if (k < 0) return;
      ps.out[k] = p.out;
      this.emit({ type: 'produced', producer: pi, slot: k, item: p.out, move: p.moveTime });
      this.after(p.moveTime, () => this.tryStart(pi));
      this.emit({ type: 'produceStop', producer: pi });
    });
  }

  inputSpace(pi, type) {
    const p = this.store.producers[pi], ps = this.state.producers[pi];
    if (!p.ins.includes(type)) return 0;
    return p.limit - (ps.inputs[type] || 0);
  }

  // --- player ---------------------------------------------------------------------------------------------------
  setInput(dx, dz) {
    const pl = this.state.player;
    const m = Math.hypot(dx, dz);
    pl.moving = m > 0.01 && pl.frozen <= 0;
    pl.inputMag = m;
    if (pl.moving) {
      pl.dirX = dx / Math.max(m, 1);
      pl.dirZ = dz / Math.max(m, 1);
    }
  }

  stepPlayer(dt, nav) {
    const pl = this.state.player;
    pl.frozen = Math.max(0, pl.frozen - dt);
    if (!pl.moving) return;
    const speed = this.store.player.speed * Math.min(pl.inputMag, 1);
    let nx = pl.x + pl.dirX * speed * dt, nz = pl.z + pl.dirZ * speed * dt;
    if (nav) {
      const p = nav.clamp({ x: pl.x, y: pl.y, z: pl.z }, { x: nx, y: pl.y, z: nz }, 1.2, this.isSolid);
      nx = p.x; nz = p.z; pl.y = p.y;
    }
    pl.x = nx; pl.z = nz;
  }

  zones() {
    const p = { x: this.state.player.x, y: 0, z: this.state.player.z };
    const s = this.store, st = this.state, R = PLAYER_RADIUS;
    const inputs = [], outputs = [];
    s.producers.forEach((pr, i) => {
      if (!st.active.has(pr.name)) return;
      if (pr.inZone && pr.inZone.contains(p, R)) inputs.push({ kind: 'producer', i });
      if (pr.outZone && pr.outZone.contains(p, R)) outputs.push({ kind: 'producer', i });
    });
    s.shelves.forEach((sh, i) => {
      if (st.active.has(sh.name) && sh.zone && sh.zone.contains(p, R)) inputs.push({ kind: 'shelf', i });
    });
    s.trash.forEach((tr, i) => {
      if (st.active.has(tr.name) && tr.zone && tr.zone.contains(p, R)) inputs.push({ kind: 'trash', i });
    });
    const cash = [];
    s.cashiers.forEach((c, i) => {
      st.cashiers[i].playerOn = st.active.has(c.name) && !!c.desk && c.desk.contains(p, R);
      if (st.active.has(c.name) && c.cashZone && c.cashZone.contains(p, R)) cash.push(i);
    });
    const mat = s.mats.find(m => st.mats[m.name].open && st.active.has(m.name) && m.zone && m.zone.contains(p, R));
    const upgrade = s.player.upgradeZone && st.active.has('UpgradeZone_Player') && s.player.upgradeZone.contains(p, R);
    return { inputs, outputs, cash, mat, upgrade };
  }

  accepts(z, type) {
    if (z.kind === 'producer') return this.inputSpace(z.i, type) > 0;
    if (z.kind === 'shelf') {
      const sh = this.store.shelves[z.i];
      return sh.type === type && this.state.shelves[z.i].count < sh.slots.length;
    }
    return z.kind === 'trash';
  }

  dropInto(z, type) {
    if (z.kind === 'producer') {
      const ps = this.state.producers[z.i];
      ps.inputs[type] = (ps.inputs[type] || 0) + 1;
      this.after(0.35, () => this.tryStart(z.i));
    } else if (z.kind === 'shelf') {
      this.state.shelves[z.i].count++;
    }
  }

  stepCarry(dt, zone) {
    const st = this.state, acc = st.acc, lim = carryLimit(st.stackLevel);
    if (zone.inputs.length && st.carry.length) {
      acc.drop += dt;
      if (acc.drop >= this.store.player.dropOffRate) {
        acc.drop = 0;
        outer: for (let k = st.carry.length - 1; k >= 0; k--) {
          for (const z of zone.inputs) {
            if (!this.accepts(z, st.carry[k])) continue;
            const type = st.carry.splice(k, 1)[0];
            const slot = z.kind === 'shelf' ? this.state.shelves[z.i].count : (this.state.producers[z.i] ? (this.state.producers[z.i].inputs[type] || 0) : 0);
            this.dropInto(z, type);
            this.emit({ type: 'drop', item: type, from: k, to: z, slot });
            break outer;
          }
        }
      }
    } else acc.drop = 0;

    if (zone.outputs.length && st.carry.length < lim) {
      acc.pick += dt;
      if (acc.pick >= this.store.player.pickupRate) {
        for (const z of zone.outputs) {
          const ps = this.state.producers[z.i];
          let k = -1;
          for (let j = ps.out.length - 1; j >= 0; j--) if (ps.out[j] != null) { k = j; break; }
          if (k < 0) continue;
          const type = ps.out[k];
          ps.out[k] = null;
          st.carry.push(type);
          acc.pick = 0;
          this.emit({ type: 'pickup', item: type, producer: z.i, slot: k, index: st.carry.length - 1 });
          if (!ps.busy) this.tryStart(z.i);
          break;
        }
      }
    } else acc.pick = 0;
  }

  // Cash drain into a mat or the upgrade zone (PlayerHumanController.HumanDroppingCash and its Update block).
  stepPay(dt, target, remaining, pay) {
    const d = this.state.drain;
    if (d.target !== target) {
      Object.assign(d, { target, delay: 0, rate: 0, mult: 1, inc: 0, amount: 1, stop: remaining <= 10, step: Math.floor(remaining / 1000) });
    }
    d.delay += dt;
    if (d.delay < this.store.player.cashDelay) return;
    d.inc += dt;
    if (d.inc >= 0.01) {
      if (!d.stop) d.amount += d.step;
      d.inc = 0;
    }
    d.rate += dt * d.mult;
    d.mult += dt * this.store.player.cashAccel;
    if (d.rate < this.store.player.cashRate) return;
    d.rate = 0;
    if (this.state.cash < 1) {
      this.emit({ type: 'noCash' });
      return;
    }
    let amount = remaining <= 10 ? 1 : d.amount;
    if (amount >= this.state.cash || amount >= remaining) d.stop = true;
    amount = Math.max(1, Math.min(amount, this.state.cash, remaining));
    this.state.cash -= amount;
    pay(amount);
  }

  stepMoney(dt, zone) {
    const st = this.state;
    const mat = zone.mat;
    if (mat) {
      const ms = st.mats[mat.name];
      const remaining = mat.cost - ms.paid;
      if (st.t >= ms.openAt && remaining > 0) {
        this.stepPay(dt, mat.name, remaining, amount => {
          ms.paid += amount;
          this.emit({ type: 'payMat', name: mat.name, amount, paid: ms.paid, cost: mat.cost });
          // Completion keys off the coin animation counter (MatActivateController DisplayClass66: ~0.35 s later).
          this.after(0.35, () => {
            ms.anim += amount;
            if (!ms.done && ms.anim >= mat.cost) this.completeMat(mat);
          });
        });
      }
    } else if (zone.upgrade) {
      this.stepUpgrade(dt);
    } else {
      st.drain.target = null;
    }
    if (!zone.upgrade) st.upgrade.present = 0;

    if (zone.cash.length) {
      st.acc.coin += dt;
      while (st.acc.coin >= COIN_PILE_RATE) {
        st.acc.coin -= COIN_PILE_RATE;
        const ci = zone.cash.find(i => st.cashiers[i].cash > 0);
        if (ci == null) { st.acc.coin = 0; break; }
        st.cashiers[ci].cash--;
        st.cash++;
        this.emit({ type: 'collect', cashier: ci, index: st.cashiers[ci].cash });
      }
    } else st.acc.coin = 0;

    const p = { x: st.player.x, y: 0, z: st.player.z };
    this.store.coins.forEach((c, i) => {
      if (st.coins[i].taken || !c.zone.contains(p)) return;
      st.coins[i].taken = true;
      st.cash += c.amount;
      this.emit({ type: 'coinPile', coin: i, amount: c.amount });
    });
  }

  stepUpgrade(dt) {
    const st = this.state, up = st.upgrade, prices = this.store.player.stackPrices;
    if (st.stackLevel >= prices.length) return;
    if (st.t < up.cooldownUntil) return;
    if (!st.player.moving) up.present += dt;
    if (up.present < UPGRADE_BEGIN + UPGRADE_SPEND) {
      this.emit({ type: 'upgradeFill', value: Math.max(0, up.present - UPGRADE_BEGIN) / UPGRADE_SPEND });
      return;
    }
    const price = prices[st.stackLevel];
    const remaining = price - up.paid;
    this.stepPay(dt, 'upgrade', remaining, amount => {
      up.paid += amount;
      this.emit({ type: 'payUpgrade', amount, paid: up.paid, cost: price });
      if (up.paid >= price) {
        st.stackLevel++;
        up.paid = 0;
        up.present = 0;
        up.cooldownUntil = st.t + UPGRADE_COOLDOWN;
        st.drain.target = null;
        this.emit({ type: 'upgraded', level: st.stackLevel, limit: carryLimit(st.stackLevel) });
      }
    });
  }

  // Customers pay at the desk: coins pile up to the desk limit, the excess goes straight to the player.
  giveCash(ci, amount) {
    const c = this.state.cashiers[ci];
    const room = Math.max(0, DESK_CASH_LIMIT - c.cash);
    const onDesk = Math.min(amount, room, 80);
    c.cash += onDesk;
    this.state.cash += amount - onDesk;
    this.emit({ type: 'deskCash', cashier: ci, amount: onDesk, total: c.cash });
  }

  step(dt, { nav = null, grid = null } = {}) {
    const st = this.state;
    if (grid) grid.refresh(this.isSolid);
    st.t += dt;
    st.tick++;
    for (let k = 0; k < this.timers.length;) {
      if (this.timers[k].at <= st.t) {
        const t = this.timers.splice(k, 1)[0];
        t.fn();
      } else k++;
    }
    this.stepPlayer(dt, nav);
    const zone = this.zones();
    this.zone = zone;
    this.stepCarry(dt, zone);
    this.stepMoney(dt, zone);
    this.stepProducers(dt);
    for (const sys of this.systems) sys.step(dt, this);
  }

  // --- save -----------------------------------------------------------------------------------------------------
  save() {
    const st = this.state;
    return {
      v: 1, cash: st.cash, stackLevel: st.stackLevel, player: { x: st.player.x, z: st.player.z },
      mats: Object.fromEntries(Object.entries(st.mats).filter(([, m]) => m.paid || m.done).map(([k, m]) => [k, { paid: m.paid, done: m.done }])),
      active: [...st.active].filter(n => this.store.activatedLater.has(n)),
      producers: st.producers.map(p => ({ out: p.out.filter(x => x != null).length, inputs: p.inputs })),
      shelves: st.shelves.map(s => s.count), desk: st.cashiers.map(c => c.cash),
      coins: st.coins.map(c => c.taken ? 1 : 0), carry: st.carry, task: st.task,
    };
  }

  load(d) {
    const st = this.state, s = this.store;
    st.cash = d.cash; st.stackLevel = d.stackLevel; st.carry = d.carry || [];
    if (d.task) st.task = { ...d.task, showAt: Math.min(d.task.showAt, 1) };
    if (d.player) { st.player.x = d.player.x; st.player.z = d.player.z; }
    (d.active || []).forEach(n => st.active.add(n));
    s.mats.forEach(m => {
      const ms = st.mats[m.name], sv = d.mats[m.name];
      ms.open = false; ms.done = false; ms.paid = 0; ms.anim = 0;
      if (sv) { ms.paid = sv.paid; ms.anim = sv.paid; ms.done = !!sv.done; }
    });
    s.mats.forEach(m => {
      const ms = st.mats[m.name];
      if (ms.done) st.active.delete(m.name);
      else if (st.active.has(m.name) || m.startsOpen) { ms.open = true; ms.openAt = 0; st.active.add(m.name); }
    });
    (d.producers || []).forEach((p, i) => {
      const ps = st.producers[i];
      for (let k = 0; k < p.out && k < ps.out.length; k++) ps.out[k] = s.producers[i].out;
      ps.inputs = p.inputs || {};
    });
    s.producers.forEach((p, i) => this.tryStart(i));
    (d.shelves || []).forEach((c, i) => { st.shelves[i].count = c; });
    (d.desk || []).forEach((c, i) => { st.cashiers[i].cash = c; });
    (d.coins || []).forEach((c, i) => { st.coins[i].taken = !!c; });
  }
}

export { ITEM_HEIGHT, COIN };
