// Pet Shop Simulator rules, pure JS (runs in node for tests). Every number comes from data/game.json (tools/export_data.py,
// values serialized in level1 or read from libil2cpp.so method bodies, each with its "src") or data/layout.json (prefab
// geometry). Things the original does not have are not added; gaps are marked [PLACEHOLDER] / [GUESS].
//
// Units: product/furniture prices are cents; cash, licenses, expansions are whole dollars (original GameEconomy.Cash int).
// Space: three.js world coordinates (Unity z negated, done by the exporters).
import { NavGrid } from './nav.js';

export const ST = { None: 0, Rack: 1, Fridge: 2, Pet: 3, Reptile: 4, Fish: 5, Bird: 6 };
const SAVE_V = 1;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// UnityEngine.Random.Range(int min, int max): max exclusive, returns min when max <= min.
const rangeInt = (rnd, a, b) => (b <= a ? a : a + Math.floor(rnd() * (b - a)));

// PriceCalculator.CalculateCharge(currentPrice, marketPrice, maxPrice, minCharge, maxCharge) (disassembled):
// price <= market -> 0; max - market < 1 -> maxCharge; else clamp(ceil((price - market) / (max - market) * maxCharge), min, max).
export function priceCharge(price, market, max, minCharge, maxCharge) {
  if (price <= market) return 0;
  if (max - market < 1) return maxCharge;
  return clamp(Math.ceil((price - market) / (max - market) * maxCharge), minCharge, maxCharge);
}

// DeliveryBuilder.Build: each cart line i waits clamp(base + base/2 * (boxCount - 1) + add * i, 54, 300) seconds.
export function deliveryWait(G, boxCount, i) {
  const d = G.delivery;
  return clamp(d.base + d.base / 2 * (boxCount - 1) + d.add * i, d.min, d.max);
}

// StoreLevel.CalculatePointsToNextLevel.
export function pointsToNext(G, level) {
  const L = G.level;
  if (level >= 1 && level <= 3) return L.need[level];
  return level < 9 ? L.needBefore9 : L.needFrom9;
}

// Unity quaternion (save data) -> three.js yaw (rotation about +y of the +z axis).
export function unityYaw(q) {
  const x = -q.x, y = -q.y, z = q.z, w = q.w;
  // forward (0,0,1) rotated
  const fx = 2 * (x * z + y * w), fz = 1 - 2 * (x * x + y * y);
  return Math.atan2(fx, fz);
}

function rot(yaw, x, z) { const c = Math.cos(yaw), s = Math.sin(yaw); return [c * x + s * z, -s * x + c * z]; }

export class Sim {
  // G = data/game.json, L = data/layout.json, scene = art/store/scene.json (nodes), nav = art/store/navmesh.json
  constructor(G, L, scene, nav, opts = {}) {
    this.G = G; this.L = L; this.scene = scene;
    this.rnd = opts.rnd || Math.random;
    this.prod = new Map(G.products.map(p => [p.type, p]));
    this.byBox = new Map();
    for (const p of G.products) this.byBox.set(p.box, { kind: 'p', type: p.type });
    for (const f of G.furniture) this.byBox.set(f.box, { kind: 'f', type: f.type });
    for (const f of G.storage) this.byBox.set(f.box, { kind: 's', type: f.type });
    this.nav = nav ? new NavGrid(nav) : null;
    this.events = [];
    this.points = this.scenePoints();
    this.reset(opts.save);
  }

  // Fixed points of the store scene the rules need (positions only; the view has the full nodes).
  scenePoints() {
    const N = this.scene.nodes;
    const W = []; // world positions
    const wp = i => {
      if (W[i]) return W[i];
      const n = N[i], t = n.t || [0, 0, 0];
      if (n.p < 0) return (W[i] = { t, r: n.r || [0, 0, 0, 1], s: n.s || [1, 1, 1] });
      const P = wp(n.p);
      const ts = [t[0] * P.s[0], t[1] * P.s[1], t[2] * P.s[2]];
      const v = qrot(P.r, ts);
      return (W[i] = { t: [P.t[0] + v[0], P.t[1] + v[1], P.t[2] + v[2]], r: qmul(P.r, n.r || [0, 0, 0, 1]), s: [P.s[0] * (n.s || [1, 1, 1])[0], P.s[1] * (n.s || [1, 1, 1])[1], P.s[2] * (n.s || [1, 1, 1])[2]] });
    };
    this.worldOf = wp;
    const comp = name => { const i = N.findIndex(n => n.k && n.k[name]); return i < 0 ? [null, null] : [i, N[i].k[name]]; };
    const [, npc] = comp('NPCPathHelper');
    const path = l => l.wayPointList.map(r => { const t = wp(r.n).t; return [t[0], t[2]]; });
    const [, chk] = comp('CheckOutCounter');
    const [, spawn] = comp('SpawnDeliveryHelper');
    const pt = r => { const t = wp(r.n).t; return [t[0], t[2]]; };
    return {
      enter: npc.enterPathList.map(path), exit: npc.exitPathList.map(path),
      queue: chk.standPosList.map(pt),
      counterItems: chk.productPosList.map(r => wp(r.n).t),
      delivery: spawn.deliveryPointList.map(r => wp(r.n).t),
    };
  }

  reset(save) {
    const G = this.G, S = G.start;
    const s = this.s = save && save.v === SAVE_V ? save : {
      v: SAVE_V, cash: S.coins, energy: S.energy, level: S.storeLevel, points: S.storePoints, day: 1,
      time: G.day.start, running: false, ended: false, open: false,
      licenses: G.licenses.filter(l => l.owned).map(l => l.type), expansions: S.savedExpansionLicenseList.slice(),
      prices: {}, furniture: [], boxes: [], pending: [], held: null, nextId: 1,
      stats: { customers: 0, income: 0, supply: 0 }, all: { days: 1, customers: 0, income: 0, supply: 0, profit: 0, tax: 0 },
      storeName: S.storeName, deliverIdx: 0, enterIdx: 0,
    };
    if (!save) {
      for (const f of S.furnitureDataList) {
        const p = { x: f.position.x, y: f.position.y, z: -f.position.z };
        this.addFurniture('f', f.type, p.x, p.z, unityYaw(f.rotation));
      }
    }
    // runtime only
    this.customers = [];
    this.spawnT = 0;
    this.poolNext = 0;
    this.checkout = { queue: [], cur: null, phase: 'idle', items: [], scanned: 0, bill: 0, change: 0, given: 0, card: '', fails: 0, wait: 0, using: false };
    this.rebuildNav();
  }

  emit(type, data) { this.events.push(Object.assign({ type }, data)); }

  // --- catalogue & money ---------------------------------------------------------------------------------------
  price(type) {
    const e = this.s.prices[type];
    return e ? e.price : this.prod.get(type).price;
  }

  licensed(type) { return this.s.licenses.includes(this.prod.get(type).license); }

  // CartUIHelper.ProcessPurchase: total in cents; Cash -= ceil(total / 100); supply cost += the same; each line
  // becomes a pending delivery (DeliverySystem.SubmitCart / DeliveryBuilder.Build).
  // lines: [{kind:'p'|'f'|'s', type, boxes}]
  buy(lines) {
    let cents = 0;
    for (const l of lines) cents += this.unitCost(l) * l.boxes;
    const dollars = Math.ceil(cents / 100);
    if (!lines.length) return { ok: false, why: 'Alert_CartEmpty' };
    if (lines.some(l => l.kind === 'p' && !this.licensed(l.type))) return { ok: false, why: 'license' };
    if (dollars > this.s.cash) { this.emit('lowCash'); return { ok: false, why: 'Alert_LowCash' }; }
    this.s.cash -= dollars;
    this.s.stats.supply += dollars;
    const queued = this.s.pending.length;
    lines.forEach((l, i) => {
      const info = this.lineInfo(l);
      const wait = deliveryWait(this.G, l.boxes, queued + i);
      this.s.pending.push({ bt: info.box, kind: l.kind, type: l.type, boxes: l.boxes, wait, left: wait });
    });
    this.emit('cash', { delta: -dollars });
    this.emit('cartBought');
    return { ok: true, dollars };
  }

  lineInfo(l) {
    if (l.kind === 'p') return this.prod.get(l.type);
    return (l.kind === 'f' ? this.G.furniture : this.G.storage).find(f => f.type === l.type);
  }

  unitCost(l) { const i = this.lineInfo(l); return i.cost * (l.kind === 'p' ? i.perBox : 1); }

  // DeliveryUI.InstantDelivery: pays reqBoostCount energy (the original raises it per boost up to maxBoostCount;
  // the rule of that rise is not decoded [GUESS: +1 per boost, capped]).
  boost() {
    const p = this.s.pending[0];
    if (!p) return false;
    const cost = Math.min((this.s.boosts || 0) + 1, this.G.delivery.maxBoost);
    if (this.s.energy < cost) { this.emit('lowEnergy'); return false; }
    this.s.energy -= cost;
    this.s.boosts = (this.s.boosts || 0) + 1;
    p.left = 0;
    this.emit('energy', { delta: -cost });
    return true;
  }

  // SpawnDeliveryHelper.SpawnDelivery: the boxes of one cart line appear at the delivery points.
  deliver(p) {
    const pts = this.points.delivery;
    for (let k = 0; k < p.boxes; k++) {
      const at = pts[this.s.deliverIdx % pts.length];
      const stack = this.s.boxes.filter(b => !b.held && Math.hypot(b.x - at[0], b.z - at[2]) < 0.3).length;
      this.s.deliverIdx++;
      const info = this.lineInfo(p);
      // SpawnDeliveryHelper drops the box from its point 5 m up (deliveryPointList y = 5) and the Rigidbody lands on
      // the floor; here it rests on the floor (or on the box already there) and the view plays the fall.
      this.s.boxes.push({ id: this.s.nextId++, bt: p.bt, kind: p.kind, type: p.type, n: p.kind === 'p' ? info.perBox : 1,
        x: at[0], y: 0.02 + stack * 0.36, z: at[2], yaw: 0, open: false, held: false, dropFrom: at[1] });
    }
    this.emit('delivered', { bt: p.bt, kind: p.kind, type: p.type });
  }

  // --- furniture & cabinets ----------------------------------------------------------------------------------------
  addFurniture(kind, type, x, z, yaw) {
    const lay = (kind === 'f' ? this.L.furniture : this.L.storage)[type];
    const f = { id: this.s.nextId++, kind, type, x, z, yaw, cab: lay.cabinets.map(() => ({ p: 0, n: 0 })) };
    this.s.furniture.push(f);
    this.rebuildNav();
    return f;
  }

  layoutOf(f) { return (f.kind === 'f' ? this.L.furniture : this.L.storage)[f.type]; }

  toWorld(f, v) { const [x, z] = rot(f.yaw, v[0], v.length === 3 ? v[2] : v[1]); return [f.x + x, f.z + z]; }

  cabinets() {
    const out = [];
    for (const f of this.s.furniture) {
      if (f.kind !== 'f') continue;
      this.layoutOf(f).cabinets.forEach((c, i) => out.push({ f, i, lay: c, st: f.cab[i] }));
    }
    return out;
  }

  cab(fid, i) { const f = this.s.furniture.find(x => x.id === fid); return f && { f, i, lay: this.layoutOf(f).cabinets[i], st: f.cab[i] }; }

  // RackCabinetInteraction.Interact (and the Fridge/Animal/... variants): with a box in hand, wrong storage type ->
  // "use the X" alert; empty box -> Alert_BoxEmpty; full cabinet -> Alert_CabinetFull; cabinet empty or holding the
  // same product -> one item moves box -> cabinet (BaseCabinet.Add); otherwise Alert_ItemMissMatch. Items never go back.
  place(fid, i) {
    const b = this.heldBox();
    const c = this.cab(fid, i);
    if (!b || !c) return { ok: false };
    if (b.kind !== 'p') return { ok: false, why: 'notProduct' };
    const prod = this.prod.get(b.type);
    if (prod.storage !== c.lay.storage) return { ok: false, why: 'wrongStorage', need: prod.storage };
    if (!b.open) return { ok: false, why: 'closed' };
    if (b.n <= 0) return { ok: false, why: 'Alert_BoxEmpty' };
    if (c.st.n >= c.lay.slots.length) return { ok: false, why: 'Alert_CabinetFull' };
    if (c.st.n > 0 && c.st.p !== b.type) return { ok: false, why: 'Alert_ItemMissMatch' };
    c.st.p = b.type;
    c.st.n++;
    b.n--;
    this.emit('placed', { fid, i, type: b.type });
    return { ok: true };
  }

  // --- boxes in hand ------------------------------------------------------------------------------------------------
  heldBox() { return this.s.held ? this.s.boxes.find(b => b.id === this.s.held) : null; }

  pick(id) {
    if (this.s.held) return false;
    const b = this.s.boxes.find(x => x.id === id);
    if (!b) return false;
    b.held = true;
    this.s.held = id;
    this.emit('pick', { id });
    return true;
  }

  setOpen(open) { const b = this.heldBox(); if (b && b.kind === 'p') { b.open = open; this.emit(open ? 'open' : 'close'); } }

  // PlayerDeliveryBoxHandler.DropDeliveryBox: thrown forward from the hold point.
  drop(x, y, z, yaw) {
    const b = this.heldBox();
    if (!b) return false;
    Object.assign(b, { held: false, x, y, z, yaw });
    this.s.held = null;
    this.emit('drop', { id: b.id });
    return true;
  }

  // TrashBin: the held box goes into the bin (PlayerDeliveryBoxHandler.TrashBox). Only an empty one is accepted
  // [GUESS: the alert keys Alert_Trashbin / Alert_BoxesDiscard suggest a check; boxes with items are refused].
  trash() {
    const b = this.heldBox();
    if (!b) return { ok: false };
    if (b.kind === 'p' && b.n > 0) return { ok: false, why: 'Alert_Trashbin' };
    this.s.boxes = this.s.boxes.filter(x => x !== b);
    this.s.held = null;
    this.emit('trash');
    return { ok: true };
  }

  // --- price ----------------------------------------------------------------------------------------------------------
  // PricePanelHelper.HidePricePanel: charge = CalculateCharge(new price, market, max, 1, maxEnergy); energy < charge ->
  // low-energy panel and nothing changes; else energy -= charge, currentPrice = price, paidEnergyCount += charge.
  setPrice(type, price) {
    const p = this.prod.get(type);
    price = clamp(Math.round(price), p.min, p.max);
    const charge = priceCharge(price, p.market, p.max, 1, this.G.price.maxEnergy);
    if (this.s.energy < charge) { this.emit('lowEnergy'); return { ok: false, charge }; }
    this.s.energy -= charge;
    const e = this.s.prices[type] || (this.s.prices[type] = { price: p.price, paid: 0, highest: 0 });
    e.price = price;
    e.paid += charge;
    if (charge) this.emit('energy', { delta: -charge });
    this.emit('price', { type, price });
    return { ok: true, charge };
  }

  // --- licenses / expansions -------------------------------------------------------------------------------------
  // BuyProductLicense.OnClickBuyLicense / BuyExpansionLicense.OnClickBuyExpansion: level >= requiredLevel and cash.
  buyLicense(type) {
    const l = this.G.licenses.find(x => x.type === type);
    if (!l || this.s.licenses.includes(type)) return { ok: false };
    if (this.s.level < l.level) return { ok: false, why: 'Alert_LowLevel' };
    if (this.s.cash < l.price) { this.emit('lowCash'); return { ok: false, why: 'Alert_LowCash' }; }
    this.s.cash -= l.price;
    this.s.licenses.push(type);
    this.emit('cash', { delta: -l.price });
    this.emit('license', { type });
    return { ok: true };
  }

  buyExpansion(type) {
    const e = this.G.expansions.find(x => x.type === type);
    if (!e || this.s.expansions.includes(type)) return { ok: false };
    if (this.s.level < e.level) return { ok: false, why: 'Alert_LowLevel' };
    if (this.s.cash < e.price) { this.emit('lowCash'); return { ok: false, why: 'Alert_LowCash' }; }
    this.s.cash -= e.price;
    this.s.expansions.push(type);
    this.emit('cash', { delta: -e.price });
    this.emit('expansion', { type });
    return { ok: true };
  }

  // --- level ------------------------------------------------------------------------------------------------------
  addPoints(p) {
    const s = this.s;
    if (s.level >= this.G.level.max) return;
    s.points += p;
    if (s.points >= pointsToNext(this.G, s.level)) {
      s.points = 0;
      s.level++;
      this.emit('levelUp', { level: s.level });
    }
  }

  // --- store sign & day -------------------------------------------------------------------------------------------
  // StoreSign.ChangeStoreStatus: opening starts the clock (DayNightCycle.StartDay); a store whose day has ended
  // stays closed until the next day.
  toggleOpen() {
    const s = this.s;
    if (s.ended) { this.emit('alert', { key: 'Alert_CloseStore' }); return false; }
    s.open = !s.open;
    if (s.open) s.running = true;
    this.emit(s.open ? 'storeOpen' : 'storeClose');
    return true;
  }

  // DayEndUIHelper.SetDataOnDayEnd numbers.
  dayReport() {
    const st = this.s.stats;
    const profit = st.income - st.supply;
    const tax = Math.round(Math.abs(profit) * this.G.tax.rate * 100) / 100;
    return { day: this.s.day, customers: st.customers, income: st.income, supply: st.supply, profit, tax, balance: this.s.cash };
  }

  // DayEndUIHelper.OnClickNextDay: tax paid, counters reset, DayNightCycle.SetUpSunRise (time back to the start hour).
  nextDay() {
    const r = this.dayReport();
    const s = this.s;
    const tax = Math.round(r.tax);   // [GUESS] Cash is an int; the panel shows the tax with cents
    s.cash -= tax;
    Object.assign(s.all, { days: s.all.days + 1, customers: s.all.customers + r.customers, income: s.all.income + r.income,
      supply: s.all.supply + r.supply, profit: s.all.profit + r.profit, tax: s.all.tax + tax });
    s.stats = { customers: 0, income: 0, supply: 0 };
    s.day++;
    s.time = this.G.day.start;
    s.running = false;
    s.ended = false;
    s.open = false;
    s.boosts = 0;
    this.emit('nextDay', { day: s.day, tax });
    return r;
  }

  // --- navigation -------------------------------------------------------------------------------------------------
  rebuildNav() {
    if (!this.nav) return;
    const obs = [];
    for (const f of this.s.furniture) {
      const o = this.layoutOf(f).obstacle;
      if (!o) continue;
      const [x, z] = this.toWorld(f, o.c);
      obs.push({ center: [x, 0, z], size: o.size, yaw: f.yaw + o.yaw });
    }
    this.nav.setDynamic(obs);
  }

  // --- customers --------------------------------------------------------------------------------------------------
  insideCount() { return this.customers.filter(c => c.inside).length; }

  nonEmptyCabinets() { return this.cabinets().filter(c => c.st.n > 0); }

  spawnCustomer() {
    const used = new Set(this.customers.map(c => c.model));
    const n = this.L.customers.length;
    let model = -1;
    for (let k = 0; k < n; k++) {
      const m = (this.poolNext + k) % n;
      if (!used.has(m)) { model = m; this.poolNext = m + 1; break; }
    }
    if (model < 0) return null;
    const pi = this.s.enterIdx++ % this.points.enter.length;   // NPCPathHelper.GetEnterPath rotates through the paths
    const path = this.points.enter[pi].slice();
    const c = { id: this.s.nextId++, model, pay: this.L.customers[model].pay, pi, x: path[0][0], z: path[0][1], yaw: 0,
      path: path.slice(1), st: 'enter', t: 0, cart: [], want: 0, cabs: [], inside: false, anim: 'Walk' };
    this.customers.push(c);
    this.emit('customerSpawn', { id: c.id });
    return c;
  }

  walk(c, dt) {
    const sp = this.G.customer.speed;
    let left = sp * dt;
    while (left > 0 && c.path.length) {
      const [tx, tz] = c.path[0];
      const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
      if (d <= left) { c.x = tx; c.z = tz; c.path.shift(); left -= d; } else {
        c.x += dx / d * left; c.z += dz / d * left; left = 0;
      }
      if (d > 1e-4) c.yaw = Math.atan2(dx, dz);
    }
    return c.path.length === 0;
  }

  navTo(c, x, z) {
    const p = this.nav ? this.nav.path(c.x, c.z, x, z) : null;
    c.path = p || [[x, z]];
  }

  customerStep(c, dt) {
    const s = this.s, G = this.G;
    switch (c.st) {
      case 'enter':   // CustomerWonderState along the enter path, then CustomerShopEnterDecision at its end
        if (!this.walk(c, dt)) return;
        if (s.open && this.insideCount() < 4 && !s.tooLate && this.nonEmptyCabinets().length) {
          // CustomerShopEnterSuccess: shuffled copy of the non-empty cabinets; CustomerResetState sized the basket.
          c.inside = true;
          c.want = clamp(rangeInt(this.rnd, 2, Math.min(s.level + 1, 10)), 2, 10);
          c.cabs = shuffle(this.nonEmptyCabinets().map(x => [x.f.id, x.i]), this.rnd);
          c.st = 'decide';
          this.emit('customerEnter', { id: c.id });
        } else {
          c.st = 'leave';        // CustomerShopEnterFail
          c.path = this.points.exit[c.pi].slice();
        }
        return;
      case 'decide': {       // CustomerShoppingDecision
        if (c.cart.length >= c.want || !c.cabs.length) { this.toCheckout(c); return; }
        const [fid, i] = c.cabs.shift();
        const cab = this.cab(fid, i);
        if (!cab || cab.st.n <= 0) return;
        // AnimalCabinet.CanPickProduct: no pet for a basket of more than 4, and at most one pet (AnimalProduct) each.
        if (cab.lay.kind === 'AnimalCabinet' && (c.cart.length > 4 || c.cart.some(it => (this.L.products[it.type] || {}).kind === 'AnimalProduct'))) return;
        c.target = [fid, i];
        const sp = cab.lay.stand[(c.id) % cab.lay.stand.length];
        const [x, z] = this.toWorld(cab.f, sp);
        this.navTo(c, x, z);
        c.st = 'toRack';
        c.anim = 'BasketWalk';
        return;
      }
      case 'toRack':
        if (!this.walk(c, dt)) return;
        { const cab = this.cab(...c.target); const [lx, lz] = this.toWorld(cab.f, [0, 0]); c.yaw = Math.atan2(lx - c.x, lz - c.z); }
        c.st = 'check'; c.t = G.customer.checkTime; c.anim = 'Idle';
        return;
      case 'check':          // CustomerCheckProductStatus 2 s, then CustomerPickProductFromRack
        if ((c.t -= dt) > 0) return;
        {
          const cab = this.cab(...c.target);
          if (cab && cab.st.n > 0) {
            cab.st.n--;
            const type = cab.st.p;
            if (cab.st.n === 0) cab.st.p = 0;
            c.cart.push({ type, price: this.price(type) });
            this.emit('customerPick', { id: c.id, fid: cab.f.id, i: cab.i, type });
            c.anim = 'PickProduct';
          }
        }
        c.st = 'feedback'; c.t = G.customer.feedbackTime;
        return;
      case 'feedback':       // CustomerProductFeedBackDecision 3 s
        if ((c.t -= dt) > 0) return;
        c.st = 'decide';
        return;
      case 'queue': {        // CustomerMoveToCheckOut / CustomerStandAtCheckOut: no patience timer, waits for ever
        const q = this.checkout.queue.indexOf(c.id);
        const spot = this.points.queue[Math.min(q, this.points.queue.length - 1)];
        if (!c.path.length && Math.hypot(c.x - spot[0], c.z - spot[1]) > 0.05) this.navTo(c, spot[0], spot[1]);
        const arrived = this.walk(c, dt);
        c.anim = arrived ? 'Idle' : 'BasketWalk';
        if (arrived) { const ci = this.points.counterItems[0]; c.yaw = Math.atan2(ci[0] - c.x, ci[2] - c.z); }
        if (arrived && q === 0 && this.checkout.cur == null && this.checkout.wait <= 0) this.submit(c);
        return;
      }
      case 'atCounter': case 'pay':
        return;              // the player scans and takes the payment (CustomerWaitForTransactionState / GivePayment)
      case 'exitFull': case 'exitEmpty': case 'leave':
        if (!this.walk(c, dt)) return;
        if (c.st === 'exitFull' || c.st === 'exitEmpty' || c.st === 'leave') {
          this.customers = this.customers.filter(x => x !== c);
          this.emit('customerGone', { id: c.id });
        }
    }
  }

  // CustomerCheckOutDescision: something bought -> counter queue; nothing -> CustomerShopExitEmpty.
  toCheckout(c) {
    if (!c.cart.length) {
      c.st = 'exitEmpty'; c.anim = 'Walk'; c.inside = false;
      this.navTo(c, ...this.points.exit[c.pi][0]);
      c.path = c.path.concat(this.points.exit[c.pi].slice(1));
      this.emit('customerSad', { id: c.id });
      return;
    }
    this.checkout.queue.push(c.id);
    c.st = 'queue';
  }

  // CheckOutCounter.SubmitProducts: the basket goes on the counter, one product per productPosList slot.
  submit(c) {
    const k = this.checkout;
    k.cur = c.id; k.items = c.cart.map(it => ({ type: it.type, price: it.price, scanned: false }));
    k.scanned = 0; k.bill = 0; k.phase = 'scan'; k.fails = 0; k.given = 0; k.card = '';
    c.st = 'atCounter'; c.anim = 'Idle';
    this.emit('submit', { id: c.id });
  }

  // CheckOutCounter.ScanProducts: tapping a product on the counter adds its price to the bill.
  scan(idx) {
    const k = this.checkout;
    if (k.phase !== 'scan') return false;
    const it = k.items[idx];
    if (!it || it.scanned) return false;
    it.scanned = true;
    k.scanned++;
    k.bill += it.price;
    this.emit('scan', { idx, price: it.price });
    if (k.scanned === k.items.length) {
      // CustomerGivePayment: the customer holds out cash or card (prefab's CustomerPaymentHelper.paymentMethod).
      k.phase = 'offer';
      const c = this.customers.find(x => x.id === k.cur);
      c.st = 'pay'; c.anim = 'GiveCard';
      this.emit('offer', { method: c.pay });
    }
    return true;
  }

  // CustomerPaymentHelper.OnInteractMethod -> PaymentManager.ShowPaymentScreen.
  takePayment() {
    const k = this.checkout;
    if (k.phase !== 'offer') return false;
    const c = this.customers.find(x => x.id === k.cur);
    k.method = c.pay;
    k.phase = 'pay';
    if (c.pay === 1) {
      // CashPayment.ShowPaymentScreen: change = first of the shuffled changeList; customer hands bill + change.
      const list = shuffle(this.G.cash.changeList.slice(), this.rnd);
      k.change = list[0];
      k.received = k.bill + k.change;
      k.given = 0;
    } else {
      k.card = '';
    }
    this.emit('payScreen', { method: c.pay, bill: k.bill, change: k.change, received: k.received });
    return true;
  }

  giveChange(cents) { const k = this.checkout; if (k.phase === 'pay' && k.method === 1) { k.given += cents; this.emit('give', { cents }); } }
  clearChange() { const k = this.checkout; if (k.phase === 'pay') { k.given = 0; k.card = ''; } }
  cardInput(ch) {
    const k = this.checkout;
    if (k.phase !== 'pay' || k.method !== 2) return;
    if (ch === 'back') k.card = k.card.slice(0, -1);
    else if (ch === '.') { if (!k.card.includes('.')) k.card += k.card ? '.' : '0.'; }
    else if (k.card.length < 9) k.card += ch;
  }

  // PaymentManager.CheckPaymentStatus.
  confirmPayment() {
    const k = this.checkout;
    if (k.phase !== 'pay') return { ok: false };
    let ok, extra = false;
    if (k.method === 1) {
      const d = k.given - k.change;                 // CashPayment.CheckPayment: 0 <= given - change < 101
      ok = d >= 0 && d < 101;
      extra = d > 0 && d < 101;                     // IsGivingExtraChange -> FreeCash reaction
    } else {
      // CardPayment.CheckPayment: input == bill as "0.00" text, or float(input) == bill / 100
      ok = k.card === (k.bill / 100).toFixed(2) || (k.card !== '' && Math.abs(parseFloat(k.card) - k.bill / 100) < 1e-6);
    }
    const c = this.customers.find(x => x.id === k.cur);
    if (!ok) {
      k.fails++;
      c.reaction = 'WrongPayment';
      this.emit('payFail', { fails: k.fails, hint: k.fails >= this.G.checkout.maxFailedAttempts });
      return { ok: false, fails: k.fails };
    }
    c.reaction = extra ? 'FreeCash' : 'NormalCheckout';
    this.completeCheckout(c, extra);
    return { ok: true, extra };
  }

  // CheckOutCounter.CheckOutComplete / <CheckOutRotine>: receipt, +10 level points, Cash += ceil(bill / 100),
  // satisfied customers +1, then the next customer is called after nextCustomerCallWait.
  completeCheckout(c, extra) {
    const k = this.checkout, s = this.s;
    const dollars = Math.ceil(k.bill / 100);
    s.cash += dollars;
    s.stats.income += dollars;
    s.stats.customers++;
    this.addPoints(this.G.level.pointsPerCheckout);
    this.emit('cash', { delta: dollars });
    this.emit('checkout', { id: c.id, bill: k.bill, dollars, extra });
    k.queue = k.queue.filter(id => id !== c.id);
    k.cur = null; k.phase = 'idle'; k.items = []; k.wait = this.G.checkout.processTime + this.G.checkout.nextCustomerWait;
    c.st = 'exitFull'; c.anim = 'BagWalk'; c.inside = false;
    this.navTo(c, ...this.points.exit[c.pi][0]);
    c.path = c.path.concat(this.points.exit[c.pi].slice(1));
  }

  // --- main step ---------------------------------------------------------------------------------------------------
  step(dt) {
    const s = this.s, G = this.G;
    // delivery queue: only the head counts down (DeliveryTimer on the first pending item)
    const head = s.pending[0];
    if (head) {
      head.left -= dt;
      if (head.left <= 0) { s.pending.shift(); this.deliver(head); }
    }
    // clock (DayNightCycle.Update) while the day runs
    if (s.running && !s.ended) {
      s.time += G.day.speed * dt / (G.day.minutes * 60) * (G.day.end - G.day.start);
      if (s.time >= G.day.end - G.day.tooLateBefore) s.tooLate = true;
      if (s.time >= G.day.end) {
        s.time = G.day.end; s.running = false; s.ended = true; s.open = false;
        this.emit('dayEnd');
      }
    }
    if (!s.ended && s.time < G.day.end - G.day.tooLateBefore) s.tooLate = false;
    // customers (NpcSpawner.<LetsMove>: one every 5 s while the store is open)
    if (s.open) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) { this.spawnT = G.customer.spawnEvery; this.spawnCustomer(); }
    }
    if (this.checkout.wait > 0) this.checkout.wait -= dt;
    for (const c of this.customers.slice()) this.customerStep(c, dt);
  }

  // Day can be closed from the HUD (GameHudUIHelper EndDay button) once the clock has run out and the store is empty.
  canEndDay() { return this.s.ended && !this.customers.some(c => c.inside || c.st === 'queue' || c.st === 'atCounter' || c.st === 'pay'); }

  save() { return JSON.parse(JSON.stringify(this.s)); }
}

function shuffle(a, rnd) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function qmul(a, b) { return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]]; }
function qrot(q, v) {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}
