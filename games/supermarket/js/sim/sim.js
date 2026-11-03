// Shop rules with no THREE: day clock, customers, shelves, orders, register, day report. Runs in node for tests.
// Positions are metres on the floor plane (x right, z towards the street). Money is in cents, as in the data.
import { LAYOUT } from './layout.js';

export const DENOMS = [1, 5, 10, 25, 50, 100, 500, 1000, 2000, 5000];
const SAVE_VERSION = 1;

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class Sim {
  constructor(data, opts = {}) {
    this.data = data;
    this.rand = opts.rand || (opts.seed != null ? mulberry(opts.seed) : Math.random);
    this.P = new Map(data.products.map(p => [p.id, p]));
    this.events = [];
    this.customers = [];
    this.nextId = 1;
    this.register = null;
    if (opts.save) this.load(opts.save); else this.fresh();
  }

  // ---- random helpers: ranges are [min, max) like UnityEngine.Random.Range(int, int) ----------------------------
  ri(a, b) { return a + Math.floor(this.rand() * Math.max(1, b - a)); }
  rf(a, b) { return a + this.rand() * (b - a); }

  fresh() {
    const S = this.data.settings;
    this.s = {
      v: SAVE_VERSION, day: 1, money: S.initialMoney, exp: 0, time: S.dayStart, phase: 'prep',
      prices: {}, ordered: {}, served: 0,
      shelves: LAYOUT.shelves.map((sh, i) => ({ id: 'sh' + i, kind: 302, layers: [null, null, null, null] })),
      boxes: [], deliveries: [], carry: null, nextBox: 1,
      stats: this.blankStats(), lastReport: null,
    };
    // SettingConfig.InitalItem: the game starts with one box of instant noodles at the delivery spot.
    this.addBox(S.initialItem, this.P.get(S.initialItem).load);
  }

  blankStats() {
    return { customers: 0, served: 0, sat: 0, unableFind: 0, tooExpensive: 0, lessMoney: 0, income: 0, cost: 0,
      upgrade: 0, salary: 0, startMoney: this.s ? this.s.money : this.data.settings.initialMoney, spawned: 0, expGained: 0 };
  }

  save() { return JSON.parse(JSON.stringify(this.s)); }
  load(save) {
    this.fresh();
    if (!save || save.v !== SAVE_VERSION) return;
    Object.assign(this.s, save);
    if (this.s.phase === 'open' || this.s.phase === 'closing') this.s.phase = this.s.time >= this.data.settings.dayEnd ? 'closing' : 'open';
  }

  emit(type, o = {}) { this.events.push({ type, ...o }); }

  // ---- derived -------------------------------------------------------------------------------------------------
  get level() { let l = 1; for (const t of this.data.levels) { if (this.s.exp >= t) l++; else break; } return l; }
  levelSpan() {
    const L = this.data.levels, l = this.level;
    const lo = l === 1 ? 0 : L[l - 2], hi = L[l - 1] ?? lo;
    return { lo, hi, level: l };
  }
  price(pid) { return this.s.prices[pid] ?? this.P.get(pid).rec; }
  market(pid) { return this.P.get(pid).rec; }
  boxPrice(pid) { const p = this.P.get(pid); return p.cost * p.load; } // guess: unit cost x box load
  hour() { return Math.floor(this.s.time / 3600); }
  unlocked(pid) { const p = this.P.get(pid); return p.shop === 101 && p.license === 0; }
  catalogue() { return this.data.products.filter(p => p.shop === 101); }
  addExp(n) {
    const before = this.level; this.s.exp += n; this.s.stats.expGained += n;
    if (this.level > before) this.emit('levelup', { level: this.level });
  }

  // ---- boxes, deliveries, stocking -------------------------------------------------------------------------------
  addBox(pid, count) {
    const slot = this.s.boxes.filter(b => b.where === 'floor').length;
    const D = LAYOUT.delivery, col = slot % D.cols, row = Math.floor(slot / D.cols) % D.rows, lift = Math.floor(slot / (D.cols * D.rows));
    const b = { id: this.s.nextBox++, pid, count, where: 'floor', x: D.x + col * D.dx, z: D.z + row * D.dz, y: lift };
    this.s.boxes.push(b);
    return b;
  }
  box(id) { return this.s.boxes.find(b => b.id === id); }
  carried() { return this.s.carry ? this.box(this.s.carry) : null; }

  order(cart) { // cart: {pid: boxes}
    const lines = Object.entries(cart).filter(([, n]) => n > 0).map(([pid, n]) => [Number(pid), n]);
    if (!lines.length) return { ok: false, why: 'empty cart' };
    for (const [pid] of lines) if (!this.unlocked(pid)) return { ok: false, why: 'product locked' };
    const total = lines.reduce((a, [pid, n]) => a + this.boxPrice(pid) * n, 0);
    if (total > this.s.money) return { ok: false, why: 'not enough money' };
    this.s.money -= total; this.s.stats.cost += total;
    for (const [pid, n] of lines) {
      const p = this.P.get(pid);
      const t = this.s.ordered[pid] ? p.delivNormal : p.delivFirst;
      this.s.ordered[pid] = true;
      this.s.deliveries.push({ pid, boxes: n, remain: t, total: t });
      this.addExp(this.data.settings.expPerOrder);
    }
    this.emit('order', { total });
    return { ok: true, total };
  }

  pickBox(id) {
    if (this.s.carry) return { ok: false, why: 'hands full' };
    const b = this.box(id); if (!b || b.where !== 'floor') return { ok: false, why: 'box not found' };
    b.where = 'hand'; this.s.carry = id;
    // boxes stacked on top of this one drop down a level
    for (const o of this.s.boxes) if (o.where === 'floor' && o.x === b.x && o.z === b.z && o.y > b.y) o.y--;
    return { ok: true };
  }
  dropBox(x, z) {
    const b = this.carried(); if (!b) return { ok: false, why: 'nothing carried' };
    const under = this.s.boxes.filter(o => o.where === 'floor' && Math.hypot(o.x - x, o.z - z) < 0.3);
    b.where = 'floor'; b.x = under.length ? under[0].x : x; b.z = under.length ? under[0].z : z; b.y = under.length;
    this.s.carry = null;
    return { ok: true };
  }
  trashBox() {
    const b = this.carried(); if (!b) return { ok: false, why: 'nothing carried' };
    if (b.count > 0) return { ok: false, why: 'box is not empty' };
    this.s.boxes = this.s.boxes.filter(o => o !== b); this.s.carry = null;
    this.emit('trash');
    return { ok: true };
  }

  layer(shelfId, li) { return this.s.shelves.find(s => s.id === shelfId).layers[li]; }
  canStock(shelfId, li) {
    const b = this.carried(); if (!b) return 'carry a box first';
    if (b.count <= 0) return 'the box is empty';
    const sh = this.s.shelves.find(s => s.id === shelfId), p = this.P.get(b.pid);
    if (p.shelf !== sh.kind) return 'needs a different shelf';
    const L = sh.layers[li];
    if (L && L.pid !== b.pid && L.count > 0) return 'layer holds another product';
    if (L && L.pid === b.pid && L.count >= p.cap) return 'layer is full';
    return null;
  }
  stock(shelfId, li, n = 1) {
    let put = 0;
    while (put < n && !this.canStock(shelfId, li)) {
      const b = this.carried(), sh = this.s.shelves.find(s => s.id === shelfId);
      if (!sh.layers[li] || sh.layers[li].pid !== b.pid) sh.layers[li] = { pid: b.pid, count: 0 };
      sh.layers[li].count++; b.count--; put++;
    }
    if (put) this.emit('stock', { shelfId, li, put });
    return { ok: put > 0, put, why: put ? null : this.canStock(shelfId, li) };
  }
  setPrice(pid, cents) {
    const p = this.P.get(pid);
    const c = Math.round(cents);
    if (c < p.min || c > p.max) return { ok: false, why: `price must be ${p.min}..${p.max}` };
    this.s.prices[pid] = c;
    return { ok: true };
  }
  stockOf(pid) { let n = 0; for (const sh of this.s.shelves) for (const L of sh.layers) if (L && L.pid === pid) n += L.count; return n; }
  onShelfIds() { const ids = new Set(); for (const sh of this.s.shelves) for (const L of sh.layers) if (L && L.count > 0) ids.add(L.pid); return [...ids]; }
  takeFromShelf(pid, want) {
    let got = 0;
    for (const sh of this.s.shelves) for (const L of sh.layers) {
      if (!L || L.pid !== pid) continue;
      const k = Math.min(L.count, want - got); L.count -= k; got += k;
      if (got >= want) return got;
    }
    return got;
  }
  returnToShelf(pid, n) {
    for (const sh of this.s.shelves) for (let i = 0; i < 4 && n > 0; i++) {
      const L = sh.layers[i]; if (!L || L.pid !== pid) continue;
      const k = Math.min(n, this.P.get(pid).cap - L.count); L.count += k; n -= k;
    }
  }
  shelfFront(pid) { // where a customer stands to take pid
    for (let i = 0; i < this.s.shelves.length; i++) {
      const sh = this.s.shelves[i];
      if (sh.layers.some(L => L && L.pid === pid && L.count > 0)) return { ...LAYOUT.shelves[i].front, shelf: sh.id };
    }
    return null;
  }

  // ---- day -------------------------------------------------------------------------------------------------------
  openStore() {
    if (this.s.phase !== 'prep') return { ok: false, why: 'store is not closed' };
    this.s.phase = 'open'; this.spawnTimer = 0; this.s.stats.startMoney = this.s.money;
    this.emit('open');
    return { ok: true };
  }
  nextDay() {
    if (this.s.phase !== 'report') return { ok: false, why: 'the day is not over' };
    this.s.day++; this.s.time = this.data.settings.dayStart; this.s.phase = 'prep';
    this.s.stats = this.blankStats();
    this.emit('newday', { day: this.s.day });
    return { ok: true };
  }
  dailyCap() { for (const [d, n] of this.data.spawn.dailyCap) if (this.s.day <= d) return n; return 60; }
  waveFor(day) { const W = this.data.spawn.waves; return W[String(day)] || W.default; }
  spawnDelay(count) { // ShopNpcBirth: inside a burst the next customer comes soon, between bursts later
    const w = this.waveFor(this.s.day);
    const inBurst = w.burst.some(([a, b]) => count > a && count <= b);
    return inBurst ? [w.inBurst, w.inBurstAt] : [w.between, w.betweenAt];
  }

  step(dt) {
    const S = this.data.settings;
    for (const d of this.s.deliveries) d.remain -= dt;
    for (const d of this.s.deliveries.filter(d => d.remain <= 0)) {
      for (let i = 0; i < d.boxes; i++) this.addBox(d.pid, this.P.get(d.pid).load);
      this.emit('delivered', { pid: d.pid, boxes: d.boxes });
    }
    this.s.deliveries = this.s.deliveries.filter(d => d.remain > 0);

    if (this.s.phase === 'open' || this.s.phase === 'closing') {
      this.s.time = Math.min(S.dayEnd, this.s.time + dt * S.timeRate);
      if (this.s.phase === 'open' && this.s.time >= S.dayEnd) { this.s.phase = 'closing'; this.emit('closing'); }
      if (this.s.phase === 'open') this.spawnStep(dt);
      for (const c of [...this.customers]) this.customerStep(c, dt);
      if (this.s.phase === 'closing' && !this.customers.length) this.endDay();
    }
  }

  spawnStep(dt) {
    const sp = this.data.spawn;
    if (this.hour() < sp.openHour || this.hour() >= sp.closeHour) return;
    if (this.s.stats.spawned >= this.dailyCap()) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    if (this.queueLen() >= sp.queueLimit) { this.spawnTimer = 1; return; }
    const n = this.s.stats.spawned;
    const at = n === 0 ? 'first' : this.spawnDelay(n)[1];
    this.spawnCustomer(at);
    this.spawnTimer = this.spawnDelay(this.s.stats.spawned)[0];
  }

  shoppingFor(day) {
    const sh = this.data.shopping;
    if (day <= 1) return { units: this.ri(...sh.day1.units), refuse: sh.day1.refuse, per: null };
    if (day <= 3) return { units: this.ri(...sh.day2.units), refuse: sh.day2.refuse, per: null };
    const r = sh.day4, u = day < r.lateFromDay ? r.units : r.unitsLate;
    return { units: this.ri(...u), refuse: r.refuse, per: r.perProduct };
  }

  spawnCustomer(at) {
    const L = LAYOUT.spawn[at] || LAYOUT.spawn.far;
    const plan = this.shoppingFor(this.s.day);
    const c = { id: this.nextId++, x: L.x, z: L.z, look: this.ri(0, 1000), state: 'enter', target: { ...LAYOUT.door },
      want: plan.units, refuse: plan.refuse, per: plan.per, cart: [], wait: 0, bubble: null, timer: 0, path: [] };
    this.customers.push(c);
    this.s.stats.spawned++; this.s.stats.customers++;
    this.emit('spawn', { id: c.id });
    return c;
  }

  say(c, text, kind) { c.bubble = { text, kind, t: 4 }; this.emit('bubble', { id: c.id, text, kind }); }
  sat(eventId) { this.s.stats.sat += this.data.shopping.satisfaction[eventId]; }
  held(c) { return c.cart.reduce((a, it) => a + it.n, 0); }
  queueLen() { return this.customers.filter(c => c.state === 'queue' || c.state === 'toQueue' || c.state === 'register').length; }

  moveTo(c, dt) {
    const speed = this.data.shopping.walkSpeed;
    const t = c.target, dx = t.x - c.x, dz = t.z - c.z, d = Math.hypot(dx, dz);
    if (d < 0.05) { c.x = t.x; c.z = t.z; return true; }
    const k = Math.min(1, speed * dt / d);
    c.x += dx * k; c.z += dz * k; c.dir = Math.atan2(dx, dz);
    return k >= 1;
  }
  walk(c, dt) { // follow c.path (waypoints) then c.target
    if (c.path.length) { const save = c.target; c.target = c.path[0]; if (this.moveTo(c, dt)) c.path.shift(); c.target = save; return false; }
    return this.moveTo(c, dt);
  }
  routeTo(c, dest) { c.path = LAYOUT.route(c, dest); c.target = dest; }

  nextPick(c) {
    if (this.held(c) >= c.want) return this.toCheckout(c);
    const on = this.onShelfIds();
    if (!on.length) {
      // RandomCargoIdNode: asks for something the store does not have on display
      const cat = this.catalogue().filter(p => this.unlocked(p.id));
      const p = cat[this.ri(0, cat.length)];
      this.say(c, `Can't find ${p.name}`, 'bad'); this.sat(1); this.s.stats.unableFind++;
      return this.toCheckout(c);
    }
    const pid = on[this.ri(0, on.length)];
    const front = this.shelfFront(pid);
    c.pick = { pid, n: c.per ? Math.min(this.ri(...c.per), c.want - this.held(c)) : 1 };
    c.state = 'toShelf'; this.routeTo(c, { x: front.x, z: front.z });
  }

  toCheckout(c) {
    if (!c.cart.length) return this.leave(c);
    if (this.queueLen() >= this.data.spawn.queueLimit) {
      this.say(c, 'Too many people queuing', 'bad');
      for (const it of c.cart) this.returnToShelf(it.pid, it.n);
      c.cart = []; return this.leave(c);
    }
    c.state = 'toQueue'; c.wait = 0;
    this.layoutQueue();
  }
  leave(c) { c.state = 'leave'; this.routeTo(c, { ...LAYOUT.exit }); }

  layoutQueue() {
    const q = this.customers.filter(c => c.state === 'queue' || c.state === 'toQueue' || c.state === 'register');
    q.sort((a, b) => (a.qn ?? 1e9) - (b.qn ?? 1e9) || a.id - b.id);
    q.forEach((c, i) => { c.qn = i; const p = LAYOUT.queue(i); if (c.state !== 'register') { c.target = p; c.path = []; } });
  }

  customerStep(c, dt) {
    if (c.bubble && (c.bubble.t -= dt) <= 0) c.bubble = null;
    switch (c.state) {
      case 'enter':
        if (this.walk(c, dt)) { if (this.s.phase !== 'open') { this.say(c, 'The store is closed', 'bad'); this.leave(c); } else this.nextPick(c); }
        break;
      case 'toShelf':
        if (this.walk(c, dt)) { c.state = 'pick'; c.timer = this.rf(...this.data.shopping.pickTime); }
        break;
      case 'pick': {
        if ((c.timer -= dt) > 0) break;
        const { pid, n } = c.pick, p = this.P.get(pid);
        if (!this.stockOf(pid)) { this.say(c, `Can't find ${p.name}`, 'bad'); this.sat(1); this.s.stats.unableFind++; return this.nextPickOrPay(c); }
        // GetCargoMarketPremiumRatioNode: refuse when the premium over market % >= a random threshold
        const premium = Math.floor((this.price(pid) - this.market(pid)) * 100 / this.market(pid));
        if (premium >= this.ri(...c.refuse)) {
          this.say(c, `${p.name} is too expensive`, 'bad'); this.sat(2); this.s.stats.tooExpensive++;
          c.refused = (c.refused || 0) + 1;
          return c.refused >= 2 || this.held(c) ? this.toCheckout(c) : this.nextPick(c);
        }
        const got = this.takeFromShelf(pid, n);
        const it = c.cart.find(x => x.pid === pid); if (it) it.n += got; else c.cart.push({ pid, n: got });
        this.emit('take', { id: c.id, pid, n: got });
        this.nextPick(c);
        break;
      }
      case 'toQueue':
        if (this.walk(c, dt)) c.state = 'queue';
        c.wait += dt;
        break;
      case 'queue':
        c.wait += dt;
        if (c.qn === 0 && !this.register) this.startRegister(c);
        else if (c.qn > 0) this.walk(c, dt);
        if (c.wait > this.data.shopping.patience && c.qn > 0) {
          this.say(c, 'Waited too long', 'bad');
          for (const it of c.cart) this.returnToShelf(it.pid, it.n);
          c.cart = []; c.qn = null; this.leave(c); this.layoutQueue();
        }
        break;
      case 'register':
        this.walk(c, dt);
        break;
      case 'leave':
        if (this.walk(c, dt)) { this.customers = this.customers.filter(o => o !== c); this.emit('gone', { id: c.id }); }
        break;
    }
  }
  nextPickOrPay(c) { return this.held(c) ? this.toCheckout(c) : this.nextPick(c); }

  // ---- register ---------------------------------------------------------------------------------------------------
  startRegister(c) {
    c.state = 'register'; c.target = LAYOUT.queue(0);
    const belt = [];
    for (const it of c.cart) for (let i = 0; i < it.n; i++) belt.push(it.pid);
    this.register = { cid: c.id, belt, scanned: [], total: 0, phase: 'scan', method: null, paid: 0, given: [], tries: 0 };
    this.emit('register', { id: c.id });
  }
  scan(i) {
    const R = this.register; if (!R || R.phase !== 'scan') return { ok: false, why: 'nothing to scan' };
    if (i == null) i = 0;
    if (i < 0 || i >= R.belt.length) return { ok: false, why: 'no such item' };
    const pid = R.belt.splice(i, 1)[0];
    const price = this.price(pid);
    R.scanned.push({ pid, price }); R.total += price;
    this.emit('scan', { pid, price });
    if (!R.belt.length) this.toPayment();
    return { ok: true, price };
  }
  toPayment() {
    const R = this.register;
    R.phase = 'pay';
    const first = this.data.shopping.firstDayPay;
    R.method = this.s.day === 1 && this.s.stats.served < first.length ? first[this.s.stats.served] : (this.rand() < 0.5 ? 'cash' : 'card');
    if (R.method === 'cash') R.paid = this.cashFor(R.total);
    this.emit('pay', { method: R.method, paid: R.paid, total: R.total });
  }
  // Npc_GiveChange ["0_0","5_100","500_1000","2000_4000","5000_9500"] — guess: for a total >= a, the customer hands
  // over the total plus up to b cents, rounded up to whole dollars.
  cashFor(total) {
    let extra = 0;
    for (const [a, b] of this.data.settings.giveChange) if (total >= a) extra = b;
    const paid = Math.ceil((total + this.ri(0, extra + 1)) / 100) * 100;
    return Math.max(paid, Math.ceil(total / 100) * 100);
  }
  card(cents) {
    const R = this.register; if (!R || R.phase !== 'pay' || R.method !== 'card') return { ok: false, why: 'not a card payment' };
    if (Math.round(cents) !== R.total) { R.tries++; this.emit('cardWrong', { typed: cents, total: R.total }); return { ok: false, why: 'wrong amount' }; }
    return this.finishSale(R.total);
  }
  giveChange(denom) {
    const R = this.register; if (!R || R.method !== 'cash' || R.phase !== 'pay') return { ok: false };
    if (denom < 0) R.given.pop(); else R.given.push(denom);
    return { ok: true, given: R.given.reduce((a, b) => a + b, 0) };
  }
  changeDue() { const R = this.register; return R ? R.paid - R.total : 0; }
  confirmChange() {
    const R = this.register; if (!R || R.method !== 'cash' || R.phase !== 'pay') return { ok: false, why: 'not a cash payment' };
    const given = R.given.reduce((a, b) => a + b, 0), due = R.paid - R.total;
    if (given < due) { // CheckoutAiGraph Cash_Less_Money -> "Change error"; NpcSatisfactionConfig 3: -3
      const c = this.customers.find(o => o.id === R.cid);
      if (c) this.say(c, 'Change error', 'bad');
      this.sat(3); this.s.stats.lessMoney++; R.tries++;
      this.emit('changeWrong', { given, due });
      return { ok: false, why: 'not enough change' };
    }
    return this.finishSale(R.paid - given);
  }
  finishSale(net) {
    const R = this.register, c = this.customers.find(o => o.id === R.cid);
    this.s.money += net; this.s.stats.income += net; this.s.stats.served++; this.s.served++;
    this.addExp(this.data.settings.expPerCheckout);
    if (c) { this.say(c, 'Check out successful', 'good'); c.qn = null; this.leave(c); }
    this.register = null;
    this.emit('sale', { net, total: R.total });
    this.layoutQueue();
    return { ok: true, net };
  }

  endDay() {
    const st = this.s.stats;
    this.s.lastReport = { day: this.s.day, ...st, rent: this.data.rent, profit: st.income - st.cost - st.upgrade - st.salary - this.data.rent,
      balance: this.s.money - this.data.rent, level: this.level, exp: this.s.exp, satisfaction: Math.max(0, 100 + st.sat) };
    this.s.money -= this.data.rent;
    this.s.phase = 'report';
    this.emit('report', this.s.lastReport);
  }
}
