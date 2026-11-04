// Pet Shop Simulator rules, pure JS (runs in node for tests). Every number comes from data/game.json (tools/export_data.py,
// values serialized in level1 or read from libil2cpp.so method bodies, each with its "src") or data/layout.json (prefab
// geometry). Things the original does not have are not added; gaps are marked [PLACEHOLDER] / [GUESS].
//
// Units: product/furniture prices are cents; cash, licenses, expansions are whole dollars (original GameEconomy.Cash int).
// Space: three.js world coordinates (Unity z negated, done by the exporters).
import { NavGrid } from './nav.js';
import { Placer } from './place.js';
import { Tutorial } from './tutorial.js';

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
    // furniture placement test (FurniturePlaceHelper.CanPlace) over art/store/colliders.json; solids() = the scene's
    // BoxColliders that are active right now (main.js passes the visible ones: walls of the current expansion etc.)
    this.placer = opts.colliders ? new Placer(opts.colliders) : null;
    this.solids = opts.solids || (() => []);
    this.events = [];
    this.tut = new Tutorial(this);
    this.points = this.scenePoints();
    this.opts0 = opts;
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
    const [, cs] = comp('CashierSystem');
    const [ti, tutK] = comp('Tutorial');
    let tutBox = null;
    if (tutK && tutK.deliveryBoxInterable) {
      const bi = tutK.deliveryBoxInterable.n, pb = N[bi].k.ProductDeliveryBox, t = wp(bi).t;
      const r = wp(bi).r;
      tutBox = { x: t[0], z: t[2], yaw: 2 * Math.atan2(r[1], r[3]), type: pb.productType || 1, n: pb.itemCount || (pb.positionList || []).length, node: bi };
    }
    const tutPts = {};
    if (tutK) for (const [k, v] of Object.entries(tutK)) if (v && v.n != null && /^(tut_|arrow|hudElement)/.test(k)) tutPts[k] = wp(v.n).t;
    const pts = l => (l || []).map(pt);
    return {
      cashier: cs ? { homeToHiring: pts(cs.homeToHiringList), hiringToHome: pts(cs.hiringToHomeList),
        hiringToCounter: pts(cs.hiringToCounterList), counterToHome: pts(cs.counterToHomeList) } : null,
      tutBox, tut: tutPts, counter: wp(N.findIndex(n => n.k && n.k.CheckOutCounter)).t,
      enter: npc.enterPathList.map(path), exit: npc.exitPathList.map(path),
      queue: chk.standPosList.map(pt),
      counterItems: chk.productPosList.map(r => wp(r.n).t),
      delivery: spawn.deliveryPointList.map(r => wp(r.n).t),
    };
  }

  reset(save, opts0 = this.opts0 || {}) {
    const G = this.G, S = G.start;
    const s = this.s = save && save.v === SAVE_V ? save : {
      v: SAVE_V, cash: S.coins, energy: S.energy, level: S.storeLevel, points: S.storePoints, day: 1,
      time: G.day.start, running: false, ended: false, open: false,
      licenses: G.licenses.filter(l => l.owned).map(l => l.type), expansions: S.savedExpansionLicenseList.slice(),
      prices: {}, furniture: [], boxes: [], pending: [], held: null, nextId: 1,
      stats: { customers: 0, income: 0, supply: 0 }, all: { days: 1, customers: 0, income: 0, supply: 0, profit: 0, tax: 0 },
      storeName: S.storeName, deliverIdx: 0, enterIdx: 0,
    };
    // Drop 2 fields (older saves get the defaults)
    const D2 = { storageService: false, cashierService: false, hire: null, task: 1, taskN: 0, color: 0, claims: {}, placing: null, boosts: 0 };
    for (const [k, v] of Object.entries(D2)) if (s[k] === undefined) s[k] = v;
    // GameSaveData.tutorialDone defaults to 0: a save without the field (Drop 1/2 had no tutorial) runs the tutorial,
    // as Tutorial.CheckTutorial does; the scene's tutorial box is there again for it
    const needTut = !!save && s.tutorialDone === undefined && !opts0.noTutorial;
    if (s.tutorialDone === undefined) Object.assign(s, { tutorialDone: true, tutStep: 0, tutCap: null, tutBox: 0, tutDelivered: [] });
    if (!save) {
      for (const f of S.furnitureDataList) {
        const p = { x: f.position.x, y: f.position.y, z: -f.position.z };
        this.addFurniture('f', f.type, p.x, p.z, unityYaw(f.rotation));
      }
    }
    // GameSavingManager.saveData.storageDataList: the Big Storage rack in the back room (identity rotation; the save
    // has w = 0, which Unity reads as identity). Saves from Drop 1 get it too.
    if (!s.furniture.some(f => f.kind === 's')) {
      for (const f of S.storageDataList || []) this.addFurniture('s', f.type, f.position.x, -f.position.z, 0);
    }
    if (!save || needTut) {
      // Tutorial: saveData.tutorialDone 0, tutorialStep 1; the scene's tutorial box (12 Dog Food) is the first stock
      if (opts0.noTutorial) Object.assign(s, { tutorialDone: true, tutStep: 0, tutCap: null, tutBox: 0, tutDelivered: [] });
      else this.tut.setupFresh(this.addTutorialBox());
    }
    // runtime only
    this.customers = [];
    this.spawnT = 0;
    this.poolNext = 0;
    this.checkout = { queue: [], cur: null, phase: 'idle', items: [], scanned: 0, bill: 0, change: 0, given: 0, card: '', fails: 0, wait: 0, using: false };
    this.cashier = null;       // the CashierNPC (runtime; s.hire keeps the paid shift)
    s.placing = null;          // a half-done placement is not resumed after a reload
    for (const f of s.furniture) delete f.moving;
    for (const b of s.boxes) if (b.held && b.id !== s.held) b.held = false;
    this.rebuildNav();
  }

  // payload "type" fields (product / license type) are kept as "what"
  // UI-side tutorial events (language confirmed, welcome tapped, name panel closed, look / move input, price panel
  // closed, counter entered / left, laptop opened)
  tutEvent(name, data) { this.tut.event(name, data); }

  addTutorialBox() {
    const tb = this.points.tutBox, s = this.s;
    if (!tb) return null;
    const prod = this.prod.get(tb.type);
    const box = { id: s.nextId++, bt: prod.box, kind: 'p', type: tb.type, n: tb.n, x: tb.x, y: 0.02, z: tb.z, yaw: tb.yaw, open: false, held: false };
    s.boxes.push(box);
    return box;
  }

  emit(type, data) { this.events.push(Object.assign({}, data, data && data.type !== undefined ? { what: data.type } : null, { type })); }

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
    // CartUIHelper.InvokeFurnitureProductEvent: a cart line with deliveryBoxType < 10 (a shelf) fires OnFurnitureBuyAction
    if (lines.some(l => l.kind === 'f')) this.taskDone(3);
    this.tut.event('cartBought');
    return { ok: true, dollars };
  }

  lineInfo(l) {
    if (l.kind === 'p') return this.prod.get(l.type);
    return (l.kind === 'f' ? this.G.furniture : this.G.storage).find(f => f.type === l.type);
  }

  unitCost(l) { const i = this.lineInfo(l); return i.cost * (l.kind === 'p' ? i.perBox : 1); }

  // DeliveryUI.UpdateTimerText: reqBoostCount = max(1, min(maxBoostCount, ceil(remaining * maxBoostCount / full time)))
  boostCost() {
    const p = this.s.pending[0];
    if (!p) return 0;
    const M = this.G.delivery.maxBoost;
    return Math.max(1, Math.min(M, Math.ceil(Math.max(0, p.left) * M / Math.max(1, p.wait))));
  }

  // DeliveryUI.InstantDelivery: energy >= reqBoostCount -> pay it, the timer ends at once
  boost() {
    const p = this.s.pending[0];
    if (!p) return false;
    const cost = this.boostCost();
    if (this.s.energy < cost) { this.emit('lowEnergy'); return false; }
    this.s.energy -= cost;
    p.left = 0;
    this.emit('energy', { delta: -cost });
    this.emit('boosted', { cost });
    return true;
  }

  // DeliveryUI.InstantAdDelivery (rewarded ad "Free" skip): free once a day here, like the other ad rewards [PLACEHOLDER]
  skipDelivery() {
    const p = this.s.pending[0], s = this.s;
    if (!p) return { ok: false };
    if (s.claims.deliverySkip === s.day) return { ok: false, why: 'claimed' };
    s.claims.deliverySkip = s.day;
    p.left = 0;
    this.emit('boosted', { cost: 0 });
    return { ok: true };
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
    if (this.tut.active()) { this.s.tutDelivered = this.s.boxes.slice(-p.boxes).map(b => b.id); this.tut.event('delivered'); }
  }

  // --- furniture & cabinets ----------------------------------------------------------------------------------------
  addFurniture(kind, type, x, z, yaw) {
    const lay = (kind === 'f' ? this.L.furniture : this.L.storage)[type];
    // StorageCabinet holds one ProductDeliveryBox (positionList has one point); shelves hold product count + type.
    const f = { id: this.s.nextId++, kind, type, x, z, yaw, cab: lay.cabinets.map(() => (kind === 's' ? { box: 0 } : { p: 0, n: 0 })) };
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
    // AnimalDeliveryBox has no IOpenBox: the animal goes straight from the carried box into the cage
    if (!b.open && !this.isAnimalBox(b)) return { ok: false, why: 'closed' };
    if (b.n <= 0) return { ok: false, why: 'Alert_BoxEmpty' };
    if (c.st.n >= c.lay.slots.length) return { ok: false, why: 'Alert_CabinetFull' };
    if (c.st.n > 0 && c.st.p !== b.type) return { ok: false, why: 'Alert_ItemMissMatch' };
    if (!this.tut.canPlace(fid, i)) return { ok: false };
    c.st.p = b.type;
    c.st.n++;
    b.n--;
    this.emit('placed', { fid, i, type: b.type });
    this.tut.event('productAdded');
    if (b.n === 0 && b.id === this.s.tutBox) this.tut.event('tutBoxEmpty');   // BaseDeliveryBox.OnBoxEmptyAction
    return { ok: true };
  }

  isAnimalBox(b) { return (this.L.boxes[b.bt] || {}).kind === 'AnimalDeliveryBox'; }

  // --- boxes in hand ------------------------------------------------------------------------------------------------
  heldBox() { return this.s.held ? this.s.boxes.find(b => b.id === this.s.held) : null; }

  pick(id) {
    if (this.s.held) return false;
    const b = this.s.boxes.find(x => x.id === id);
    if (!b) return false;
    if (b.stored) {        // StorageCabinet.RemoveBox when the box is picked off the rack
      const f = this.s.furniture.find(x => x.id === b.stored.fid);
      if (f) f.cab[b.stored.i].box = 0;
      delete b.stored;
    }
    b.held = true;
    this.s.held = id;
    this.emit('pick', { id });
    this.tut.event('pickTutBox', id);
    this.tut.event('pickDelivered', id);
    return true;
  }

  setOpen(open) { const b = this.heldBox(); if (b && b.kind === 'p' && !this.isAnimalBox(b)) { b.open = open; this.emit(open ? 'open' : 'close'); } }

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
    this.tut.event('trash');   // TrashBin.OnTrashColledEvent
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
    this.taskDone(2);
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
    this.taskDone(4);
    return { ok: true };
  }

  // StoreExpandHelper.OnExpansionUnlocked: only the walls of the largest owned expansion are active.
  wallsOn() { return Math.max(...this.s.expansions); }

  // --- tasks (TaskManager) -------------------------------------------------------------------------------------------
  // taskDataList: 1 "5 checkouts" (count 5, Task_1_0..4), 2 buy a license (LicenseManager.OnProductLicenseUnlockEvent),
  // 3 buy a shelf (CartUIHelper.OnFurnitureBuyAction), 4 buy an expansion (OnExpansionLicenseUnlockEvent), 5 the endless
  // "grow your store". CompleteTask only plays the UI tick and saves; no XP or cash is granted (none found in the code,
  // although the tutorial text promises "bonus XP").
  taskDone(n) {
    const s = this.s;
    if (!s.tutorialDone) return;   // TaskManager subscribes only after Tutorial.OnTutorialCompletedAction
    if (s.task !== n) return;
    // TaskData.count of task 1 is 5
    if (n === 1 && ++s.taskN < 5) { this.emit('task', { task: 1, n: s.taskN }); return; }
    s.task = n + 1; s.taskN = 0;
    this.emit('taskComplete', { task: n });
  }

  // --- furniture placement (PlayerObjectMover + FurniturePlaceHelper) --------------------------------------------------
  // FurnitureDeliveryBox / StorageDeliveryBox.OpenBox: the furniture leaves its box and follows the player
  // (StayFrontHelper) until Place (CanPlace true) or Cancel (back into the box in hand).
  beginPlaceBox() {
    const b = this.heldBox();
    if (!b || (b.kind !== 'f' && b.kind !== 's') || this.s.placing) return false;
    this.s.placing = { src: 'box', box: b.id, kind: b.kind, type: b.type, x: 0, z: 0, yaw: 0 };
    this.emit('placeStart', { kind: b.kind });
    return true;
  }

  // Holding interact for thresholdTime (1.25 s) on a placed furniture picks it up (Alert_MoveFurniture).
  beginMove(fid) {
    const f = this.s.furniture.find(x => x.id === fid);
    if (!f || this.s.held || this.s.placing) return false;
    f.moving = true;
    this.s.placing = { src: 'move', fid, kind: f.kind, type: f.type, x: f.x, z: f.z, yaw: f.yaw, orig: { x: f.x, z: f.z, yaw: f.yaw } };
    this.rebuildNav();
    this.emit('placeStart', { kind: f.kind });
    return true;
  }

  movePlacing(x, z) { const p = this.s.placing; if (p) { p.x = x; p.z = z; } }
  rotatePlacing(dir) { const p = this.s.placing; if (p) p.yaw += dir * Math.PI / 2; }

  solidBoxes(exceptId) {
    const out = this.solids().slice();
    for (const f of this.s.furniture) {
      if (f.id === exceptId) continue;
      const c = this.layoutOf(f).collider;
      if (!c) continue;
      const [x, z] = this.toWorld(f, c.c);
      out.push({ c: [x, z], size: [c.size[0], c.size[2]], yaw: f.yaw + c.yaw });
    }
    return out;
  }

  placeOk() {
    const p = this.s.placing;
    if (!p || !this.placer) return !!p;
    const lay = (p.kind === 'f' ? this.L.furniture : this.L.storage)[p.type];
    return this.placer.canPlace(lay, p.x, p.z, p.yaw, this.solidBoxes(p.fid));
  }

  confirmPlace() {
    const s = this.s, p = s.placing;
    if (!p) return { ok: false };
    if (!this.placeOk()) return { ok: false, why: 'Alert_WrongFurniture' };
    if (p.src === 'box') {
      s.boxes = s.boxes.filter(b => b.id !== p.box);
      s.held = null;
      this.addFurniture(p.kind, p.type, p.x, p.z, p.yaw);
    } else {
      const f = s.furniture.find(x => x.id === p.fid);
      Object.assign(f, { x: p.x, z: p.z, yaw: p.yaw });
      delete f.moving;
      for (const b of s.boxes) if (b.stored && b.stored.fid === f.id) this.storedPos(b);
    }
    s.placing = null;
    this.rebuildNav();
    this.emit('furniturePlaced', { kind: p.kind, type: p.type });
    return { ok: true };
  }

  cancelPlace() {
    const s = this.s, p = s.placing;
    if (!p) return false;
    if (p.src === 'move') { const f = s.furniture.find(x => x.id === p.fid); delete f.moving; }
    s.placing = null;
    this.rebuildNav();
    this.emit('placeCancel');
    return true;
  }

  // MoveObjButtons "Sell" (storage racks only): StorageFurniture.Start sets SellPrice = floor(costPrice / 100 * 0.5)
  // dollars; CanSellDirectly returns true without looking at the boxes inside and OnSellAction just drops the rack's
  // save entry, so boxes on a sold rack go with it. The cash credit call was not found in the disassembly
  // [GUESS: Cash += SellPrice].
  sellPlacing() {
    const s = this.s, p = s.placing;
    if (!p || p.kind !== 's') return { ok: false };
    const info = this.G.storage.find(x => x.type === p.type);
    const price = Math.floor(info.cost / 100 * 0.5);
    if (p.src === 'move') {
      const f = s.furniture.find(x => x.id === p.fid);
      s.furniture = s.furniture.filter(x => x !== f);
      s.boxes = s.boxes.filter(b => !(b.stored && b.stored.fid === f.id));   // the stored boxes go with the rack
    } else {
      s.boxes = s.boxes.filter(b => b.id !== p.box);
      s.held = null;
    }
    s.placing = null;
    s.cash += price;
    this.rebuildNav();
    this.emit('cash', { delta: price });
    this.emit('sold', { price });
    return { ok: true, price };
  }

  // --- storage room (StorageSystem / StorageCabinet) --------------------------------------------------------------------
  // StorageCabinetInteractable.Interact with a ProductDeliveryBox in hand: a full cabinet or an empty box is refused
  // (alert keys "StorageCabinetFull" / "StorageBoxEmpty", not in the I2 term table); otherwise the box leaves the hand
  // and sits on the cabinet. Animal boxes are AnimalDeliveryBox, not ProductDeliveryBox: they cannot be stored.
  storeBox(fid, i) {
    const s = this.s, b = this.heldBox();
    const f = s.furniture.find(x => x.id === fid);
    if (!b || !f || f.kind !== 's') return { ok: false };
    if (b.kind !== 'p' || (this.L.boxes[b.bt] || {}).kind !== 'ProductDeliveryBox') return { ok: false, why: 'Alert_WrongFurniture' };
    if (f.cab[i].box) return { ok: false, why: 'StorageCabinetFull' };
    if (b.n <= 0) return { ok: false, why: 'StorageBoxEmpty' };
    f.cab[i].box = b.id;
    b.held = false; b.open = false; b.stored = { fid, i };
    s.held = null;
    this.storedPos(b);
    this.emit('stored', { id: b.id });
    return { ok: true };
  }

  storedPos(b) {
    const f = this.s.furniture.find(x => x.id === b.stored.fid);
    const sl = this.layoutOf(f).cabinets[b.stored.i].slots[0];
    const [x, z] = this.toWorld(f, sl);
    Object.assign(b, { x, y: sl[1] + 0.047, z, yaw: f.yaw });
    delete b.dropFrom;
  }

  // StorageSystem.UnlockStorage (Service tab): store level >= reqLevel 11 and reqEnergy 25; the shutter opens.
  // CashierSystem: requiredLevel 10, requireEnergy 30. The Discard Boxes service removes every empty box lying around.
  buyService(kind) {
    const s = this.s;
    const def = kind === 'storage' ? { level: this.G.storageService.level, energy: this.G.storageService.energy, key: 'storageService' }
      : { level: this.G.cashier.level, energy: this.G.cashier.serviceEnergy, key: 'cashierService' };
    if (s[def.key]) return { ok: false };
    if (s.level < def.level) return { ok: false, why: 'Alert_LowLevel' };
    if (s.energy < def.energy) { this.emit('lowEnergy'); return { ok: false, why: 'Alert_LowEnergy' }; }
    s.energy -= def.energy;
    s[def.key] = true;
    this.emit('energy', { delta: -def.energy });
    this.emit('service', { kind });
    return { ok: true };
  }

  // Discard Boxes (Service tab): no energy deduction exists in its handler, although the card shows 10 (kept as found).
  discardEmptyBoxes() {
    const s = this.s;
    const empty = s.boxes.filter(b => b.kind === 'p' && b.n <= 0 && !b.held && !b.stored);
    if (!empty.length) return { ok: false, why: 'Alert_NoEmptyBox' };
    s.boxes = s.boxes.filter(b => !empty.includes(b));
    this.emit('discard', { n: empty.length });
    return { ok: true, n: empty.length };
  }

  // --- free rewards (rewarded ads in the original) ---------------------------------------------------------------------
  // AtmMachine (showAtLevel 2, $50), RewardMachine cash $30 / energy 10 (showAtLevel 2), ATM panel $20, LowCash +$10,
  // LowEnergy +10, Bank Free Cash $20 / Free Energy 10. Each was "watch an ad" with no limit; offline they are free and
  // limited to one claim per source per day [PLACEHOLDER policy].
  claim(src) {
    const R = this.G.rewards, s = this.s;
    const table = { atm: ['cash', R.atmMachine], cashMachine: ['cash', R.machines[0].value], energyMachine: ['energy', R.machines[1].value],
      lowCash: ['cash', R.lowCash], lowEnergy: ['energy', R.lowEnergy], bankCash: ['cash', R.freeCash], bankEnergy: ['energy', R.freeEnergy] };
    const t = table[src];
    if (!t) return { ok: false };
    if ((src === 'atm' || src.endsWith('Machine')) && s.level < R.atmLevel) return { ok: false, why: 'Alert_LowLevel' };
    if (s.claims[src] === s.day) return { ok: false, why: 'claimed' };
    s.claims[src] = s.day;
    s[t[0]] += t[1];
    this.emit(t[0], { delta: t[1] });
    return { ok: true, what: t[0], value: t[1] };
  }
  claimable(src) { return this.s.claims[src] !== this.s.day; }

  // --- store name (StoreNameChangeHelper): max 15 characters a-z 0-9 (the panel tip), 6 board colours -------------------
  setStoreName(name, color) {
    const n = String(name || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 15).trim();
    if (n) this.s.storeName = n;
    if (color != null) this.s.color = color;
    this.emit('storeName');
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
    if (s.open) this.tut.event('storeOpen');
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
        if (s.open && this.insideCount() < this.tut.capacity(4) && !s.tooLate && this.nonEmptyCabinets().length) {
          // CustomerShopEnterSuccess: shuffled copy of the non-empty cabinets; CustomerResetState sized the basket.
          c.inside = true;
          c.want = this.tut.basket(clamp(rangeInt(this.rnd, 2, Math.min(s.level + 1, 10)), 2, 10));
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
        if (c.animT > 0 && (c.animT -= dt) <= 0) c.anim = c.st === 'pay' ? 'GiveCard' : 'Idle';
        return;              // the player scans and takes the payment (CustomerWaitForTransactionState / GivePayment)
      case 'paid':
        if ((c.t -= dt) > 0) return;
        c.st = 'exitFull'; c.anim = 'BagWalk';
        this.navTo(c, ...this.points.exit[c.pi][0]);
        c.path = c.path.concat(this.points.exit[c.pi].slice(1));
        this.emit('checkoutChime');   // CheckOutRotine after processCheckOutTime: SoundManager.checkoutSuccessClip
        return;
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
    c.pay = this.tut.payMethod(c.pay);
    c.st = 'atCounter'; c.anim = 'Idle';
    this.emit('submit', { id: c.id, types: k.items.map(it => it.type) });   // BaseProduct.OnMoveToCheckOut per item
    // CheckOutCounter.FirstCustomerScenerio: the only customer drops products while nobody is at the register -> bell
    if (k.queue.length === 1 && !k.using) this.emit('bell');
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
      k.change = this.tut.change(list[0]);
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
      // CustomerReactionHelper.WrongPaymentReaction: wrongPaymentClip + CrossFade(HeadNo, 0.2)
      c.anim = 'HeadNo'; c.animT = 1.5;
      this.emit('reaction', { id: c.id, kind: 'WrongPayment', model: c.model });
      this.emit('payFail', { fails: k.fails, hint: k.fails >= this.G.checkout.maxFailedAttempts });
      return { ok: false, fails: k.fails };
    }
    c.reaction = extra ? 'FreeCash' : 'NormalCheckout';
    if (extra) this.emit('extraCash', { cents: k.given - k.change });   // CashPayment.ShowExtraCashAlert
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
    this.taskDone(1);      // CheckOutCounter.OnPaymentSuccesfull -> TaskManager sub task
    this.tut.event('paid');   // PaymentManager.OnPaymentSuccessAction
    this.emit('cash', { delta: dollars });
    this.emit('checkout', { id: c.id, bill: k.bill, dollars, extra });
    k.queue = k.queue.filter(id => id !== c.id);
    k.cur = null; k.phase = 'idle'; k.items = []; k.wait = this.G.checkout.processTime + this.G.checkout.nextCustomerWait;
    // CustomerReactionHelper.ShowReaction: thanks (HeadYes) or extra change (Happy) at the confirm tap; the customer stays
    // for processCheckOutTime (2 s) before going home with the bag, and the checkout chime plays then
    c.st = 'paid'; c.t = this.G.checkout.processTime; c.inside = false;
    c.anim = extra ? 'Happy' : 'HeadYes';
    this.emit('reaction', { id: c.id, kind: extra ? 'FreeCash' : 'NormalCheckout', model: c.model });
  }

  // --- cashier (CashierSystem / CashierNPC / CashierUIHelper / AutoCheckoutHelper) -----------------------------------
  // From store level spawnLevel 2 the cashier walks homeToHiring and waits at the hiring spot. With the Cashier Service
  // bought (level 10, 30 energy) talking to him opens HIRE CASHIER: salary slider between 0.6 x and 1 x hirePrice $320,
  // energy = CalculateEnergy(salary); HIRE pays both, he walks hiringToCounter and runs the counter for the 720 s shift
  // (12:00 "hours" on the panel), then walks counterToHome and comes back to be hired again.
  hireRange() { const P = this.G.cashier.price; return { min: Math.round(P * 0.6), mid: Math.round(P * 0.8), max: P }; }
  // CashierHireUIHelper.CalculateEnergy (maxEnergy 10, h = 5): >= max -> 0, <= min -> 10, else piecewise linear
  // through h at mid; C# Math.Round rounds halves to even
  hireEnergy(salary) {
    const { min, mid, max } = this.hireRange();
    const c01 = v => Math.max(0, Math.min(1, v));
    if (salary >= max) return 0;
    if (salary <= min) return 10;
    const v = salary >= mid ? 5 * (1 - c01((salary - mid) / (max - mid))) : 10 + (5 - 10) * c01((salary - min) / (mid - min));
    const f = Math.floor(v), r = v - f;
    return r > 0.5 || (r === 0.5 && f % 2 === 1) ? f + 1 : f;
  }

  hire(salary) {
    const s = this.s, k = this.cashier;
    if (!k || k.st !== 'hiring' || s.hire) return { ok: false };
    if (!s.cashierService) return { ok: false, why: 'service' };
    const { min, max } = this.hireRange();
    salary = clamp(Math.round(salary), min, max);
    const e = this.hireEnergy(salary);
    if (s.cash < salary) { this.emit('lowCash'); return { ok: false, why: 'Alert_LowCash' }; }
    if (s.energy < e) { this.emit('lowEnergy'); return { ok: false, why: 'Alert_LowEnergy' }; }
    s.cash -= salary; s.energy -= e;
    s.hire = { left: this.G.cashier.shift, salary };
    k.st = 'toCounter'; k.path = this.points.cashier.hiringToCounter.slice(); k.anim = 'Walk';
    this.emit('cash', { delta: -salary });
    if (e) this.emit('energy', { delta: -e });
    this.emit('hired', { salary, energy: e });
    return { ok: true, salary, energy: e };
  }

  cashierWorking() { return !!(this.cashier && this.cashier.st === 'work'); }

  cashierStep(dt) {
    const s = this.s, C = this.G.cashier, P = this.points.cashier;
    if (!P) return;
    let k = this.cashier;
    if (!k) {
      if (s.level < C.spawnLevel) return;
      // a reload during a paid shift puts him straight back at the counter
      const at = s.hire ? P.hiringToCounter[P.hiringToCounter.length - 1] : P.homeToHiring[0];
      k = this.cashier = { x: at[0], z: at[1], yaw: 0, path: s.hire ? [] : P.homeToHiring.slice(1), st: s.hire ? 'work' : 'toHiring', anim: 'Walk', t: 0 };
    }
    const walk = () => {
      let left = C.speed * dt;
      while (left > 0 && k.path.length) {
        const [tx, tz] = k.path[0], dx = tx - k.x, dz = tz - k.z, d = Math.hypot(dx, dz);
        if (d <= left) { k.x = tx; k.z = tz; k.path.shift(); left -= d; } else { k.x += dx / d * left; k.z += dz / d * left; left = 0; }
        if (d > 1e-4) k.yaw = Math.atan2(dx, dz);
      }
      return !k.path.length;
    };
    switch (k.st) {
      case 'toHiring': if (walk()) { k.st = 'hiring'; k.anim = 'Waving_0'; } return;
      case 'hiring': k.anim = 'Waving_0'; return;
      case 'toCounter':
        if (walk()) { k.st = 'work'; k.anim = 'Idle'; const ci = this.points.counterItems[0]; k.yaw = Math.atan2(ci[0] - k.x, ci[2] - k.z); }
        return;
      case 'work': {
        // CashierWorkingState.UpdateState: remainingShiftTime -= Time.deltaTime, no store-open or day check
        if (s.hire) s.hire.left -= dt;
        const ch = this.checkout;
        if (ch.cur == null) {
          k.anim = 'Idle';
          if (!s.hire || s.hire.left <= 0) {
            s.hire = null; k.st = 'toHome'; k.path = P.counterToHome.slice(); k.anim = 'Walk';
            this.emit('shiftOver');
          }
          return;
        }
        // AutoCheckoutHelper.StartAutoCheckout: if the player is using the register, ExitCheckOut first
        if (k.autoCur !== ch.cur) { k.autoCur = ch.cur; if (ch.using) this.emit('exitCheckout'); }
        this.autoCheckout(k, dt);
        return;
      }
      case 'toHome': if (walk()) { this.cashier = null; } return;
    }
  }

  // AutoCheckoutHelper: one item scanned every 1.5 s, 5 s to collect the payment, 5 s to process it.
  autoCheckout(k, dt) {
    const ch = this.checkout, C = this.G.cashier;
    k.anim = 'Checkout';
    k.t += dt;
    if (ch.phase === 'scan') {
      if (k.t >= C.scan) { k.t = 0; const i = ch.items.findIndex(it => !it.scanned); if (i >= 0) this.scan(i); }
    } else if (ch.phase === 'offer') {
      if (k.t >= C.collect) { k.t = 0; ch.phase = 'auto'; }
    } else if (ch.phase === 'auto') {
      if (k.t >= C.process) {
        k.t = 0;
        const c = this.customers.find(x => x.id === ch.cur);
        c.reaction = 'NormalCheckout';
        this.completeCheckout(c, false);
      }
    } else if (ch.phase === 'pay') {   // the player had opened the payment screen: the cashier finishes it
      ch.phase = 'auto'; k.t = 0;
    }
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
    this.cashierStep(dt);
    this.tut.step(dt);
  }

  // Day can be closed from the HUD (GameHudUIHelper EndDay button) once the clock has run out and the store is empty.
  canEndDay() { return this.s.ended && !this.customers.some(c => c.inside || c.st === 'queue' || c.st === 'atCounter' || c.st === 'pay' || c.st === 'paid'); }

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
