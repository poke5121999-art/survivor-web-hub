// Burger Please! stage rules, pure JS (no THREE), runs in node for tests.
// Positions are three.js stage coordinates from data/<stage>.json (tools/export_data.py); only x/z matter here.
// Numbers marked [DATA] come from the extracted tables, [CODE] from the decompiled method named next to them,
// [GUESS] are placeholders until the decompile answers them (README "Còn hở").

import { NavGrid } from './nav.js';

export const ITEM = { money: 0, cup: 1, burger: 2, package: 3 };

const PICK_GAP = 0.08;        // [GUESS] seconds between two items flying onto / off the player's stack
const PAY_TIME = 1.2;         // [GUESS] a pad takes this long to fill while the player stands on it
const QUEUE_GAP = 1.1;        // [GUESS] metres between customers in the counter line
// Customer spawn: Stage.customerSpawnTime (3 s on stage 1) with no random range, and no new customer for a counter
// whose customerList reaches Stage.maxCustomerCount (10) [CODE CustomerSpawner.Update, CustomerSpawner.c:9273-9770].
// Order sizes [CODE Stage.InitData, Stage.c:7018-7058]: the counter's StageItem has minCount 1 / maxCount 2, the drive-thru
// package item 1 / 3; Random.Range(min, max + 1) [CODE Car.FoodOrderSet, Car.c:855]. While the tutorial is before step 20
// (GuideManager._currentGuideIndex < 0x14) a car orders one package.
const ORDER = { min: 1, max: 2 };
const CAR_ORDER = { min: 1, max: 3, tutorialBelow: 20 };
// Package table: a box holds four burgers (Package1 prefab PackageItem.tempItems[4]; PackageTable.PACKAGING_MAX_STEP 4).
const PACK_SIZE = 4;
// Drive-thru lane [CODE Car..ctor _speed 6.0; DriveCarCounter.GetTargetPos carSize 3.5 x index].
const CAR_SPEED = 6, CAR_GAP = 3.5;
// Kiosk [CODE Kiosk..ctor sellTimer 0.25; Kiosk.GetTargetPos CustomerSpawner.customerSize 1.2 per slot]. The kiosk
// hands one stored item per sellTimer to the head customer of each line by itself (WorkerSell1/2 start in OnEnable).
const KIOSK_SELL = 0.25, KIOSK_GAP = 1.2;
const CUSTOMER_SPEED = 3.5;   // [DATA] Customer prefab NavMeshAgent.m_Speed
// Staff speed is WorkerData._moveSpeed[level] in m/s, set straight on NavMeshAgent.speed [CODE Stage.WorkerMoveSpeed,
// Stage.c:5861; GameManager.c:5704].
const WORKER_BASE = 1;
const MAX_CUSTOMERS = 24;

const GUIDE_STEPS = new Set(['PickUp_Money', 'Create_Door', 'Create_Table', 'Create_Coffee_Machine', 'Create_Counter', 'PickUp_Coffee',
  'Put_It_Counter', 'Sell_Coffee', 'Clean_Table', 'Throw_EmptyCup', 'Hire_Cashier', 'Open_DistrictArea', 'Open_HROffice', 'Open_UpgradeOffice',
  'Create_DriveThru', 'Create_PackageTable', 'Put_It_PackageTable', 'PickUp_CoffeePackage', 'Put_It_Kiosk']);
const BUILD_STEP = { door: 'Create_Door', table: 'Create_Table', machine: 'Create_Coffee_Machine', counter: 'Create_Counter',
  district: 'Open_DistrictArea', hr: 'Open_HROffice', office: 'Open_UpgradeOffice', drive: 'Create_DriveThru', packer: 'Create_PackageTable' };

// Arc length of a polyline, and the point / heading at arc length t along it.
const polyLen = pts => pts.reduce((L, p, i) => (i ? L + Math.hypot(p[0] - pts[i - 1][0], p[2] - pts[i - 1][2]) : 0), 0);
function polyAt(pts, t) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[2] - a[2]);
    if (t <= l || i === pts.length - 1) {
      const k = l ? Math.min(1, t / l) : 0;
      return [a[0] + (b[0] - a[0]) * k, a[2] + (b[2] - a[2]) * k, Math.atan2(b[0] - a[0], b[2] - a[2])];
    }
    t -= l;
  }
  return [pts[0][0], pts[0][2], 0];
}
const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[2] - b[2]) ** 2;
export const inBox = (p, b, m = 0) => Math.abs(p[0] - b[0]) <= b[2] + m && Math.abs(p[2] - b[1]) <= b[3] + m;

// Deterministic RNG so the node test and a replay agree.
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export class Sim {
  constructor(data, nav = null, save = null, seed = 7) {
    this.d = data;
    this.grid = nav ? new NavGrid(nav) : null;
    this.rand = rng(seed);
    this.events = [];
    this.pads = new Map(data.pads.map(p => [p.id, p]));
    this.byTarget = new Map();
    for (const list of [data.machines, data.counters, data.tables, data.packers, data.drives, data.kiosks]) for (const o of list) this.byTarget.set(o.id, o);
    // Guide steps 24/25 reuse the counter texts (Put_It_Counter, Sell_Coffee) but point at the drive-thru window.
    this.driveNodes = new Set(data.drives.flatMap(x => [x.itemsNode, x.boardNode]));
    // The kiosk's guide steps (the PickUp_Coffee before Put_It_Kiosk, then Put_It_Kiosk) only wake once a kiosk exists:
    // Kiosk.OnEnable calls GameManager.GuideActiveEvent(true) when the guide sits at step 26 [CODE Kiosk.c].
    const pk = data.guide.findIndex(g => g.text === 'Put_It_Kiosk');
    this.kioskGuideFrom = pk > 0 ? pk - 1 : Infinity;
    // Everything a Stage._stageFlows progress creates (or whose grade pad it wakes) starts switched off.
    this.flowCreated = new Set(data.flows.flatMap(f => f.flatMap(p => [...p.create, ...p.upgrade])));
    this.features = new Set(data.unbuiltFeatures);
    this.districts = new Map(data.districts.map(x => [x.id, x]));
    this.s = save ? this.restore(save) : this.fresh();
    this.nextSpawn = 1;
    this.stepFlows();
    this.refreshNav();
  }

  // Active flag of the stage's GameObjects in the current state, by node index (what Unity's SetActive calls would
  // have left): prefab default, then the tutorial's hidden list, the flows, built objects and their grade models,
  // district pads, and the features this build does not have.
  overrides() {
    const s = this.s, d = this.d, o = new Map([[0, true]]);
    const g = d.guide[s.guide];
    if (g) for (const n of g.hide) o.set(n, false);
    for (const n of this.flowCreated) o.set(n, false);
    for (const [n, v] of Object.entries(s.flowSet)) o.set(+n, v);
    for (const [n, gi] of Object.entries(d.guideUpgrade)) if (s.guide >= gi) o.set(+n, true);
    o.set(d.door.node, !!s.built.door1);
    o.set(d.door.block, !s.built.door1);
    for (const list of [d.machines, d.counters, d.tables, d.packers, d.drives, d.kiosks]) for (const e of list) {
      const on = !!s.built[e.pad];
      o.set(e.machine ?? e.counter ?? e.table ?? e.kiosk, on);
      const gr = s.grade[e.id] || 0;
      if (on && e.grades) e.grades.forEach((n, k) => { if (n != null) o.set(n, k === gr); });
    }
    // Kiosk.InitFoodList switches on foodParent[n - 1] for a stage with n food kinds (one, burgers, on stage 1).
    for (const k of d.kiosks) if (s.built[k.pad]) o.set(k.foodNode, true);
    o.set(d.hr.room, !!s.built.hr1);
    o.set(d.office.room, !!s.built.office1);
    for (const x of d.districts) {
      o.set(x.opened, !!s.built[x.id]);
      if (s.built[x.id]) o.set(x.area, false);
    }
    for (const n of this.features) o.set(n, false);
    return o;
  }

  nodeOn(i) {
    const tree = this.d.tree, o = this._ov || (this._ov = this.overrides());
    for (let j = i; j >= 0; j = tree[j][0]) {
      const v = o.get(j);
      if (v === false || (v === undefined && !tree[j][1])) return false;
    }
    return true;
  }

  // A flow check on something inside a feature the web build lacks (drive-thru, package table...) counts as done.
  skipCheck(i) {
    for (let j = i; j >= 0; j = this.d.tree[j][0]) if (this.features.has(j)) return true;
    return false;
  }

  // Stage._stageFlows: each flow advances one Progress at a time once all its checkObjects are active.
  stepFlows() {
    const s = this.s;
    let changed = false, again = true;
    while (again) {
      again = false;
      this.d.flows.forEach((f, fi) => {
        const p = f[s.flows[fi]];
        if (!p || (p.star && s.star < p.star)) return;
        this._ov = null;
        if (!p.check.every(n => this.skipCheck(n) || this.nodeOn(n))) return;
        for (const n of [...p.create, ...p.upgrade]) s.flowSet[n] = true;
        for (const n of p.disable) s.flowSet[n] = false;
        for (const n of p.district) for (const x of this.d.districts) if (x.area === n) s.unlocked[x.id] = true;
        s.flows[fi]++;
        again = changed = true;
      });
    }
    this._ov = null;
    return changed;
  }

  refreshNav() {
    this._ov = null;
    if (this.grid) this.grid.update(i => this.nodeOn(i));
    for (const a of [...this.s.customers, ...this.s.workers]) a.route = null;
  }

  fresh() {
    const d = this.d;
    return {
      t: 0,
      money: 0,
      startPile: d.startMoney.amount,
      player: { pos: [...d.player.start], carry: [], pickT: 0 },
      lv: { speed: 0, cap: 0, price: 0 },
      wlv: { speed: 0, cap: 0, employ: 0 },
      built: {},          // pad id -> true
      paid: {},           // pad id -> money already put in
      grade: {},          // machine/counter/table id -> 0..2 (built objects only)
      machine: {},        // id -> { n, t }
      counter: {},        // id -> { n, sellT, money }
      table: {},          // id -> { cups, money, seats: [customer id|null] }
      packer: {},         // package table id -> { in: burgers waiting, out: boxes ready, t }
      drive: {},          // drive-thru id -> { n: boxes in the window, sellT, money }
      kiosk: {},          // kiosk id -> { n: burgers stored, money }
      customers: [],
      cars: [],
      workers: [],
      nextId: 1,
      guide: 0,
      flows: this.d.flows.map(() => 0),   // current Progress of each Stage._stageFlows list
      flowSet: {},                        // node -> active, as left by applied progresses
      unlocked: {},                       // district pad id -> true once a progress lists its area
      exp: 0,
      star: 0,
      earned: 0,
      served: 0,
    };
  }

  restore(save) {
    const s = Object.assign(this.fresh(), JSON.parse(JSON.stringify(save)));
    s.customers = [];            // people do not survive a reload; their food money is already counted
    s.cars = [];
    for (const c of Object.values(s.drive)) c.sellT = 0;
    for (const k of Object.values(s.kiosk)) k.sellT = [0, 0];
    for (const c of Object.values(s.counter)) c.sellT = 0;
    for (const t of Object.values(s.table)) t.seats = t.seats.map(() => null);
    s.workers = s.workers.map(w => ({ id: w.id, pos: w.pos, carry: [], task: null, pickT: 0 }));
    s.player.carry = s.player.carry.filter(i => i !== ITEM.money);
    return s;
  }

  save() {
    const s = JSON.parse(JSON.stringify(this.s));
    delete s.customers;
    delete s.cars;
    s.savedAt = Date.now();
    return s;
  }

  // ---- derived values ----
  get price() { return this.d.price + this.d.player.priceUp[this.s.lv.price]; }
  get speed() { return this.d.player.speed[this.s.lv.speed]; }
  get cap() { return this.d.player.cap[this.s.lv.cap]; }
  workerSpeed() { return WORKER_BASE * this.d.worker.speed[this.s.wlv.speed]; }
  workerCap() { return this.d.worker.cap[this.s.wlv.cap]; }
  isBuilt(id) { return !!this.s.built[this.byTarget.get(id)?.pad || id]; }

  // Pads shown now: a create pad while its GameObject is active and not built yet (Node.Update), a grade pad while its
  // UpgradeArea is active and a next grade exists (UpgradeArea.Update), a district pad once a progress unlocked it.
  visiblePads() {
    const s = this.s, out = [];
    for (const p of this.d.pads) {
      if (p.kind === 'district') { if (s.unlocked[p.id] && !s.built[p.id]) out.push(p.id); continue; }
      if (p.kind === 'upgrade') { if (this.nodeOn(p.node) && this.upgradeCost(p.id) != null) out.push(p.id); continue; }
      if (!s.built[p.id] && this.nodeOn(p.node) && this.nodeOn(p.vis)) out.push(p.id);
    }
    return out;
  }

  // District pads stay locked below their star level (DistrictArea.Set: StarLevelData reward Region<k>UnLock).
  canBuy(padId) {
    const x = this.districts.get(padId);
    return !x || this.s.star >= x.star;
  }

  // Money a grade pad asks for next, or null when maxed / not applicable.
  upgradeCost(padId) {
    const p = this.pads.get(padId);
    if (!p) return null;
    if (p.kind !== 'upgrade') return this.s.built[padId] ? null : p.cost;
    const o = this.byTarget.get(p.target);
    if (!this.isBuilt(o.id)) return null;
    const g = this.s.grade[o.id] || 0;
    return g + 1 < o.cost.length ? o.cost[g + 1] : null;
  }

  // ---- main step ----
  step(dt, input = { x: 0, z: 0 }) {
    const s = this.s;
    s.t += dt;
    this.movePlayer(dt, input);
    this.pickStartPile();
    this.payPads(dt);
    this.stepMachines(dt);
    this.stepCounters(dt);
    this.spawnCustomers(dt);
    this.stepCustomers(dt);
    this.stepPackers(dt);
    this.stepDrives(dt);
    this.spawnCars(dt);
    this.stepCars(dt);
    this.spawnKiosk(dt);
    this.stepKiosk(dt);
    this.stepWorkers(dt);
    this.carryZones(this.s.player, dt, this.cap);
  }

  movePlayer(dt, input) {
    const p = this.s.player;
    const len = Math.hypot(input.x, input.z);
    if (len < 1e-3) { p.moving = false; return; }
    const k = Math.min(1, len) * this.speed * dt / len;
    const nx = p.pos[0] + input.x * k, nz = p.pos[2] + input.z * k;
    const [x, z] = this.grid ? this.grid.move(p.pos[0], p.pos[2], nx, nz) : [nx, nz];
    p.dir = Math.atan2(input.x, input.z);
    p.pos[0] = x; p.pos[2] = z;
    p.moving = true;
  }

  pickStartPile() {
    const s = this.s;
    if (s.startPile <= 0) return;
    const p = this.d.startMoney.pos;
    if (dist2(s.player.pos, p) < 2.5 * 2.5) {
      this.gain(s.startPile, 'start');
      s.startPile = 0;
      this.advanceGuide('PickUp_Money');
    }
  }

  gain(n, from) {
    this.s.money += n;
    this.s.earned += n;
    this.events.push({ type: 'money', n, from });
  }

  // Standing on a pad feeds it money until it is paid, then the thing it builds appears.
  payPads(dt) {
    const s = this.s;
    const here = this.visiblePads().find(id => inBox(s.player.pos, this.pads.get(id).box));
    if (!here || s.player.moving) return;
    const cost = this.upgradeCost(here);
    if (cost == null || !this.canBuy(here)) return;
    const paid = s.paid[here] || 0;
    const want = Math.min(cost - paid, s.money, Math.max(1, Math.ceil(cost * dt / PAY_TIME)));
    if (want <= 0) return;
    s.money -= want;
    s.paid[here] = paid + want;
    this.events.push({ type: 'pay', pad: here, n: want });
    if (s.paid[here] >= cost) this.complete(here);
  }

  complete(padId) {
    const s = this.s, p = this.pads.get(padId);
    s.paid[padId] = 0;
    if (p.kind !== 'district') this.gainExp(this.d.expPerBuild);
    if (p.kind === 'upgrade') {
      s.grade[p.target] = (s.grade[p.target] || 0) + 1;
      this.events.push({ type: 'grade', id: p.target, grade: s.grade[p.target] });
      if (padId === 'upgrade6') this.advanceGuide('Hire_Cashier');
      this.stepFlows();
      this.refreshNav();
      return;
    }
    s.built[padId] = true;
    if (p.target) {
      s.grade[p.target] = 0;
      if (p.kind === 'machine') s.machine[p.target] = { n: 0, t: 0 };
      if (p.kind === 'counter') s.counter[p.target] = { n: 0, sellT: 0, money: 0 };
      if (p.kind === 'table') s.table[p.target] = { cups: 0, money: 0, seats: this.byTarget.get(p.target).seats.map(() => null) };
      if (p.kind === 'packer') s.packer[p.target] = { in: 0, out: 0, t: 0 };
      if (p.kind === 'drive') s.drive[p.target] = { n: 0, sellT: 0, money: 0 };
      if (p.kind === 'kiosk') s.kiosk[p.target] = { n: 0, money: 0, sellT: [0, 0] };
    }
    if (p.kind === 'hr' && !s.workers.length) this.hire();
    if (BUILD_STEP[p.kind]) this.advanceGuide(BUILD_STEP[p.kind]);
    this.stepFlows();
    this.refreshNav();
    this.events.push({ type: 'build', pad: padId, target: p.target || null });
  }

  // Stage._stageGuide: a step ends when its own action happens; empty steps are skipped, and the line stops at the
  // first step about a feature this build does not have yet (drive-thru, package table, kiosk, toilet).
  // Star exp: StarExpData gives 3 per purchase (CreateArea/TableArea/UpgradeArea... AcquireExp); a level's reward
  // money (StarLevelData currency type 1) is paid on reaching it.
  gainExp(n) {
    const s = this.s, rows = this.d.star;
    s.exp += n;
    while (rows[s.star] && rows[s.star + 1] && s.exp >= rows[s.star].exp) {
      s.exp -= rows[s.star].exp;
      s.star++;
      const r = rows[s.star];
      if (r.money) this.gain(r.money, 'star');
      this.events.push({ type: 'star', star: s.star });
    }
  }

  // False while the current guide step waits for a feature that is not there yet (its line is hidden meanwhile).
  guideActive() {
    return this.s.guide < this.kioskGuideFrom || this.d.kiosks.some(k => this.s.built[k.pad]);
  }

  advanceGuide(text, node = null) {
    const g = this.d.guide;
    let i = this.s.guide;
    if (!g[i] || g[i].text !== text || !this.guideActive()) return;
    if (node != null ? g[i].node !== node : this.driveNodes.has(g[i].node)) return;
    i++;
    while (g[i] && !g[i].text) i++;
    if (g[i] && !GUIDE_STEPS.has(g[i].text)) i = g.length;
    this.s.guide = i;
    this._ov = null;
    this.stepFlows();
    this.refreshNav();
  }

  // ---- grills ----
  stepMachines(dt) {
    for (const m of this.d.machines) {
      const st = this.s.machine[m.id];
      if (!st) continue;
      const g = this.s.grade[m.id] || 0;
      const max = m.max[g];
      if (st.n >= max) { st.t = 0; continue; }
      st.t += dt;
      if (st.t >= m.delay[g]) { st.t -= m.delay[g]; st.n++; this.events.push({ type: 'cook', id: m.id }); }
    }
  }

  // ---- carrying: grill -> player stack -> counter; table cups -> player -> trash ----
  carryZones(a, dt, cap) {
    a.pickT = Math.max(0, (a.pickT || 0) - dt);
    if (a.pickT > 0) return;
    const s = this.s;
    const holding = a.carry.length ? a.carry[0] : null;
    for (const m of this.d.machines) {
      const st = s.machine[m.id];
      if (!st || !st.n || !inBox(a.pos, m.zone, 1.0)) continue;
      if (holding !== null && holding !== m.item) continue;
      if (a.carry.length >= cap) return;
      st.n--; a.carry.push(m.item); a.pickT = PICK_GAP;
      this.events.push({ type: 'pick', who: a.id || 'player', from: m.id, item: m.item });
      if (!a.id) this.advanceGuide('PickUp_Coffee');
      return;
    }
    for (const c of this.d.counters) {
      const st = s.counter[c.id];
      if (!st) continue;
      if (holding !== null && c.items.includes(holding) && inBox(a.pos, c.storage, 0.4) && st.n < c.maxItems) {
        a.carry.pop(); st.n++; a.pickT = PICK_GAP;
        this.events.push({ type: 'drop', who: a.id || 'player', to: c.id });
        if (!a.id) this.advanceGuide('Put_It_Counter');
        return;
      }
      if (!a.id && st.money > 0 && inBox(a.pos, c.money, 0.3)) {
        this.gain(st.money, c.id); st.money = 0;
        return;
      }
    }
    for (const k of this.d.packers) {
      const st = s.packer[k.id];
      if (!st) continue;
      if (holding !== null && k.ingredients.includes(holding) && st.in < k.maxIn && inBox(a.pos, k.storage, 0.3)) {
        a.carry.pop(); st.in++; a.pickT = PICK_GAP;
        this.events.push({ type: 'drop', who: a.id || 'player', to: k.id });
        if (!a.id) this.advanceGuide('Put_It_PackageTable');
        return;
      }
      if (st.out > 0 && (holding === null || holding === k.item) && a.carry.length < cap && inBox(a.pos, k.pickup, 0.3)) {
        st.out--; a.carry.push(k.item); a.pickT = PICK_GAP;
        this.events.push({ type: 'pick', who: a.id || 'player', from: k.id, item: k.item });
        if (!a.id) this.advanceGuide('PickUp_CoffeePackage');
        return;
      }
    }
    for (const k of this.d.kiosks) {
      const st = s.kiosk[k.id];
      if (!st) continue;
      if (holding !== null && k.itemTypes.includes(holding) && st.n < k.maxItems && inBox(a.pos, k.storage, 0.3)) {
        a.carry.pop(); st.n++; a.pickT = PICK_GAP;
        this.events.push({ type: 'drop', who: a.id || 'player', to: k.id });
        if (!a.id) this.advanceGuide('Put_It_Kiosk');
        return;
      }
      if (!a.id && st.money > 0 && inBox(a.pos, k.money, 0.3)) { this.gain(st.money, k.id); st.money = 0; return; }
    }
    for (const k of this.d.drives) {
      const st = s.drive[k.id];
      if (!st) continue;
      if (holding === k.item && st.n < k.maxItems && inBox(a.pos, k.storage, 0.3)) {
        a.carry.pop(); st.n++; a.pickT = PICK_GAP;
        this.events.push({ type: 'drop', who: a.id || 'player', to: k.id });
        if (!a.id) this.advanceGuide('Put_It_Counter', k.itemsNode);
        return;
      }
      if (!a.id && st.money > 0 && inBox(a.pos, k.money, 0.3)) { this.gain(st.money, k.id); st.money = 0; return; }
    }
    for (const t of this.d.tables) {
      const st = s.table[t.id];
      if (!st) continue;
      if (!a.id && st.money > 0 && t.money && inBox(a.pos, t.money, 0.3)) { this.gain(st.money, t.id); st.money = 0; }
      if (st.cups > 0 && (holding === null || holding === ITEM.cup) && a.carry.length < cap && inBox(a.pos, t.zone, 0.6)) {
        st.cups--; a.carry.push(ITEM.cup); a.pickT = PICK_GAP;
        this.events.push({ type: 'pick', who: a.id || 'player', from: t.id, item: ITEM.cup });
        if (!a.id && st.cups === 0) this.advanceGuide('Clean_Table');
        return;
      }
    }
    if (holding === ITEM.cup) {
      for (const tb of this.d.trash) {
        if (!tb.active || !inBox(a.pos, tb.box, 0.5)) continue;
        a.carry.pop(); a.pickT = PICK_GAP;
        this.events.push({ type: 'trash', who: a.id || 'player' });
        if (!a.id && !a.carry.length) this.advanceGuide('Throw_EmptyCup');
        return;
      }
    }
  }

  // ---- counter: the cashier (player on the board, or the hired one) hands burgers to the head of the line ----
  cashierHere(c) {
    const g = this.s.grade[c.id] || 0;
    if (g >= c.employGrade) return true;
    return dist2(this.s.player.pos, c.cashier) < 1.3 * 1.3;
  }

  stepCounters(dt) {
    for (const c of this.d.counters) {
      const st = this.s.counter[c.id];
      if (!st) continue;
      const head = this.s.customers.find(x => x.counter === c.id && x.state === 'queue' && x.slot === 0 && x.arrived);
      if (!head || !st.n || !this.cashierHere(c)) { st.sellT = 0; continue; }
      const g = this.s.grade[c.id] || 0;
      st.sellT += dt;
      if (st.sellT < c.sell[g]) continue;
      st.sellT = 0;
      st.n--; head.got++;
      this.events.push({ type: 'sell', id: c.id, customer: head.id });
      if (head.got >= head.want) {
        const pay = this.price * head.want;
        st.money += pay;
        this.s.served++;
        head.state = 'seat';
        this.events.push({ type: 'paid', id: c.id, n: pay, customer: head.id });
        this.advanceGuide('Sell_Coffee');
      }
    }
  }

  spawnCustomers(dt) {
    const s = this.s;
    if (!s.built.door1) return;
    for (const c of this.d.counters) {
      if (!s.counter[c.id]) continue;
      const T = this.d.tuning;
      const line = s.customers.filter(x => x.counter === c.id && x.state === 'queue').length;
      if (line >= T.maxCustomerCount || s.customers.length >= MAX_CUSTOMERS) continue;
      this.nextSpawn -= dt;
      if (this.nextSpawn > 0) continue;
      this.nextSpawn = T.customerSpawnTime;
      const want = ORDER.min + Math.floor(this.rand() * (ORDER.max - ORDER.min + 1));
      s.customers.push({ id: s.nextId++, counter: c.id, state: 'queue', want, got: 0, pos: [...c.path[0]], way: 1, slot: line, arrived: false, seat: null, eatT: 0 });
    }
  }

  // Customers walk the counter path, line up behind Path2, get served, find a free clean seat, eat, leave cups and go.
  stepCustomers(dt) {
    const s = this.s;
    const done = [];
    for (const c of this.d.counters) {
      const line = s.customers.filter(x => x.counter === c.id && x.state === 'queue');
      line.forEach((x, i) => { x.slot = i; });
    }
    for (const x of s.customers) {
      if (x.kiosk) continue;
      const c = this.byTarget.get(x.counter);
      if (x.state === 'queue') {
        const target = this.queueSpot(c, x.slot);
        x.arrived = this.walkPath(x, c.path, target, CUSTOMER_SPEED * dt);
      } else if (x.state === 'seat') {
        const seat = this.freeSeat();
        if (!seat) { x.waiting = true; continue; }
        x.waiting = false;
        s.table[seat.t].seats[seat.i] = x.id;
        x.seat = seat; x.state = 'toSeat';
      } else if (x.state === 'toSeat') {
        const t = this.byTarget.get(x.seat.t);
        if (this.goTo(x, t.seats[x.seat.i].pos, CUSTOMER_SPEED * dt)) {
          x.state = 'eat';
          x.eatT = t.eat[s.grade[t.id] || 0] * x.want;
        }
      } else if (x.state === 'eat') {
        x.eatT -= dt;
        if (x.eatT <= 0) {
          const st = s.table[x.seat.t];
          st.seats[x.seat.i] = null;
          st.cups += x.want;
          this.events.push({ type: 'leave', customer: x.id, table: x.seat.t });
          x.state = 'exit';
        }
      } else if (x.state === 'exit') {
        const exit = c.out;
        if (this.goTo(x, exit, CUSTOMER_SPEED * dt)) done.push(x);
      }
    }
    if (done.length) s.customers = s.customers.filter(x => !done.includes(x));
  }

  // ---- kiosk: its own spawner and two lines; take-away customers ----
  // CustomerSpawner.Update: a separate countdown of Stage.kioskCustomerSpawnTime; a customer goes to the line with the
  // fewest people (ties to the first) while that line is under Stage.maxKioskCustomerCount.
  spawnKiosk(dt) {
    const s = this.s, T = this.d.tuning;
    for (const k of this.d.kiosks) {
      if (!s.kiosk[k.id]) continue;
      const counts = k.paths.map((_, i) => s.customers.filter(x => x.kiosk === k.id && x.line === i && x.state !== 'exit').length);
      const free = counts.map((n, i) => [n, i]).filter(([n]) => n < T.maxKioskCustomerCount).sort((a, b) => a[0] - b[0] || a[1] - b[1])[0];
      if (!free || s.customers.length >= MAX_CUSTOMERS) continue;
      this.nextKiosk = (this.nextKiosk ?? 0) - dt;
      if (this.nextKiosk > 0) continue;
      this.nextKiosk = T.kioskCustomerSpawnTime;
      const line = free[1];
      const want = ORDER.min + Math.floor(this.rand() * (ORDER.max - ORDER.min + 1));
      s.customers.push({ id: s.nextId++, kiosk: k.id, line, state: 'kq', want, got: 0, pos: [...k.paths[line][0]], way: 1, slot: counts[line],
        arrived: false, orderT: 0 });
    }
  }

  // The head of a line orders (Kiosk.orderTime [GUESS: KioskWait waits it]), then the kiosk hands over one stored burger
  // every sellTimer; the customer pays the burger price per item into the kiosk's MoneyArea and leaves (no chair is
  // taken for kiosk customers; customerOutPoint is the line's start) [GUESS price = counter price, Kiosk.GetFoodPrice
  // not decompiled].
  stepKiosk(dt) {
    const s = this.s, done = [];
    for (const k of this.d.kiosks) {
      const st = s.kiosk[k.id];
      if (!st) continue;
      k.paths.forEach((path, li) => {
        const line = s.customers.filter(x => x.kiosk === k.id && x.line === li && x.state !== 'exit');
        line.forEach((x, i) => {
          x.slot = i;
          const a = path[path.length - 1], b = path[path.length - 2];
          const len = Math.sqrt(dist2(a, b)), off = Math.min(i * KIOSK_GAP, len) / len;
          const spot = [a[0] + (b[0] - a[0]) * off, 0, a[2] + (b[2] - a[2]) * off];
          x.arrived = this.walkPath(x, path, spot, CUSTOMER_SPEED * dt);
        });
        const head = line[0];
        if (!head || !head.arrived) { st.sellT[li] = 0; return; }
        if (head.orderT < k.orderTime) { head.orderT += dt; head.state = 'kq'; return; }
        head.state = 'kwait';
        if (!st.n) { st.sellT[li] = 0; return; }
        st.sellT[li] += dt;
        if (st.sellT[li] < KIOSK_SELL) return;
        st.sellT[li] = 0;
        st.n--; head.got++;
        this.events.push({ type: 'sell', id: k.id, customer: head.id });
        if (head.got >= head.want) {
          const pay = this.price * head.want;
          st.money += pay;
          s.kioskServed = (s.kioskServed || 0) + 1;
          head.state = 'exit';
          this.events.push({ type: 'paid', id: k.id, n: pay, customer: head.id, kiosk: true });
        }
      });
      for (const x of s.customers) if (x.kiosk === k.id && x.state === 'exit' && this.goTo(x, k.out, CUSTOMER_SPEED * dt)) done.push(x);
    }
    if (done.length) s.customers = s.customers.filter(x => !done.includes(x));
  }

  // Order balloons (OrderBalloonManager keeps one per counter zone, per car lane and per kiosk line): who is waiting at
  // the head of each line, which item icon (index into the stage's TMP sprite asset ItemIcon1: 1 burger, 2 burger box)
  // and how many are still owed [GUESS: the count falls as items are handed over].
  balloons() {
    const s = this.s, out = [];
    for (const c of this.d.counters) {
      const x = s.customers.find(y => y.counter === c.id && y.state === 'queue' && y.slot === 0 && y.arrived);
      if (x) out.push({ key: `c${c.id}`, kind: 'customer', pos: x.pos, icon: 1, count: x.want - x.got });
    }
    for (const k of this.d.drives) {
      const x = s.cars.find(y => y.drive === k.id && y.state === 'wait' && y.slot === 0 && y.arrived);
      if (x) out.push({ key: `d${k.id}`, kind: 'car', pos: x.pos, icon: 2, count: x.want - x.got });
    }
    for (const k of this.d.kiosks) {
      for (const x of s.customers) {
        if (x.kiosk === k.id && x.slot === 0 && x.arrived && (x.state === 'kq' || x.state === 'kwait')) {
          out.push({ key: `k${k.id}${x.line}`, kind: 'customer', pos: x.pos, icon: 1, count: x.want - x.got });
        }
      }
    }
    return out;
  }

  queueSpot(c, slot) {
    // Head stands at the last path point (in front of the counter); the line runs back toward Path1.
    const [a, b] = [c.path[c.path.length - 1], c.path[c.path.length - 2]];
    const len = Math.sqrt(dist2(a, b));
    const k = Math.min(slot * QUEUE_GAP, len) / len;
    const p = [a[0] + (b[0] - a[0]) * k, 0, a[2] + (b[2] - a[2]) * k];
    if (slot * QUEUE_GAP > len) {
      const c2 = c.path[c.path.length - 3], over = slot * QUEUE_GAP - len, l2 = Math.sqrt(dist2(b, c2));
      const k2 = Math.min(over, l2) / l2;
      return [b[0] + (c2[0] - b[0]) * k2, 0, b[2] + (c2[2] - b[2]) * k2];
    }
    return p;
  }

  walkPath(x, path, target, step) {
    // Follow path points until the line's segment, then walk to the queue spot.
    while (x.way < path.length - 1) {
      if (this.walkTo(x, path[x.way], step)) x.way++;
      else return false;
      step = 0;
    }
    return this.walkTo(x, target, step);
  }

  walkTo(a, p, step) {
    const dx = p[0] - a.pos[0], dz = p[2] - a.pos[2];
    const d = Math.hypot(dx, dz);
    if (d < 0.05) { a.moving = false; return true; }
    a.dir = Math.atan2(dx, dz);
    a.moving = true;
    if (d <= step) { a.pos[0] = p[0]; a.pos[2] = p[2]; return true; }
    a.pos[0] += dx / d * step; a.pos[2] += dz / d * step;
    return false;
  }

  // Walk along a navgrid route to p; true once there.
  goTo(a, p, step) {
    if (!this.grid) return this.walkTo(a, p, step);
    if (!a.route || a.route.goal[0] !== p[0] || a.route.goal[2] !== p[2]) {
      a.route = { goal: p, pts: this.grid.path(a.pos[0], a.pos[2], p[0], p[2]) || [[p[0], p[2]]] };
    }
    const pts = a.route.pts;
    while (pts.length) {
      const q = [pts[0][0], 0, pts[0][1]];
      const d = Math.sqrt(dist2(a.pos, q));
      if (this.walkTo(a, q, step)) { pts.shift(); step -= d; if (step <= 0 && pts.length) return false; continue; }
      return false;
    }
    a.moving = false;
    return true;
  }

  freeSeat() {
    const s = this.s;
    for (const t of this.d.tables) {
      const st = s.table[t.id];
      if (!st || st.cups > 0) continue;
      // A table seats a new group only once the last one has left and it is cleaned.
      const i = st.seats.findIndex(v => v === null);
      if (i >= 0) return { t: t.id, i };
    }
    return null;
  }

  // ---- package table: four burgers in, one box out, while someone works the table ----
  // Packing runs while the player stands at the table's work spot (PackageTable trigger, OnTriggerExit -> PackagingEnd)
  // or once the hired packer is there (grade >= PackageTableData._employGrade turns workerObject on, PackageTableNode.SetGrade).
  // One box per DelayLevel seconds ("PackageTable_Delay", StageObjectAbility type 10), up to MaxItemValueLevel boxes waiting.
  packerHere(k) {
    if ((this.s.grade[k.id] || 0) >= k.employGrade) return true;
    return inBox(this.s.player.pos, k.zone, 0.2);
  }

  stepPackers(dt) {
    for (const k of this.d.packers) {
      const st = this.s.packer[k.id];
      if (!st) continue;
      const g = this.s.grade[k.id] || 0;
      if (st.in < PACK_SIZE || st.out >= k.maxOut[g] || !this.packerHere(k)) { st.t = 0; continue; }
      st.t += dt;
      if (st.t < k.delay[g]) continue;
      st.t = 0;
      st.in -= PACK_SIZE; st.out++;
      this.events.push({ type: 'pack', id: k.id });
    }
  }

  // ---- drive-thru: cars queue on driveInPath, the window hands boxes over, the car leaves by driveOutPath ----
  // The window's own trigger is where the player both drops boxes and sells; the hired cashier (grade >= _employGrade)
  // sells on DriveCarCounterData._workerSellTimer. [GUESS] the player sells on the same timer (FoodSell not decompiled),
  // and a car pays Stage_1_BurgerPackage_Price per box (GetFoodPrice not decompiled; _sellPriceLevel unused).
  driveSellerHere(k) {
    if ((this.s.grade[k.id] || 0) >= k.employGrade) return true;
    return inBox(this.s.player.pos, k.storage, 0.2);
  }

  stepDrives(dt) {
    for (const k of this.d.drives) {
      const st = this.s.drive[k.id];
      if (!st) continue;
      const head = this.s.cars.find(c => c.drive === k.id && c.state === 'wait' && c.slot === 0 && c.arrived);
      if (!head || !st.n || !this.driveSellerHere(k)) { st.sellT = 0; continue; }
      st.sellT += dt;
      if (st.sellT < k.sell) continue;
      st.sellT = 0;
      st.n--; head.got++;
      this.events.push({ type: 'sell', id: k.id, car: head.id });
      if (head.got >= head.want) {
        const pay = this.d.packagePrice * head.want;
        st.money += pay;
        this.s.carsServed = (this.s.carsServed || 0) + 1;
        head.state = 'out'; head.s = 0;
        this.events.push({ type: 'paid', id: k.id, n: pay, car: head.id });
        this.advanceGuide('Sell_Coffee', k.boardNode);
      }
    }
  }

  // DriveCarSpawner.Update: one car per Stage.carSpawnTime while the window's line is under Stage.maxCarCount; the car
  // type is a random entry of Stage.driveCarType.
  spawnCars(dt) {
    const s = this.s, T = this.d.tuning;
    for (const k of this.d.drives) {
      if (!s.drive[k.id]) continue;
      const line = s.cars.filter(c => c.drive === k.id && c.state === 'wait').length;
      if (line >= T.maxCarCount) continue;
      this.nextCar = (this.nextCar ?? 0) - dt;
      if (this.nextCar > 0) continue;
      this.nextCar = T.carSpawnTime;
      let want = CAR_ORDER.min + Math.floor(this.rand() * (CAR_ORDER.max - CAR_ORDER.min + 1));
      if (s.guide < CAR_ORDER.tutorialBelow) want = 1;
      const type = T.driveCarType[Math.floor(this.rand() * T.driveCarType.length)];
      s.cars.push({ id: s.nextId++, drive: k.id, type, state: 'wait', want, got: 0, s: 0, slot: line, arrived: false,
        pos: [...k.pathIn[0]], dir: 0 });
      this.events.push({ type: 'car', id: k.id });
    }
  }

  stepCars(dt) {
    const s = this.s, gone = [];
    for (const k of this.d.drives) s.cars.filter(c => c.drive === k.id && c.state === 'wait').forEach((c, i) => { c.slot = i; });
    for (const c of s.cars) {
      const k = this.byTarget.get(c.drive);
      const path = c.state === 'wait' ? k.pathIn : k.pathOut;
      const len = polyLen(path);
      const goal = c.state === 'wait' ? Math.max(0, len - c.slot * CAR_GAP) : len;
      const was = c.s;
      c.s = Math.min(goal, c.s + CAR_SPEED * dt);
      c.moving = c.s > was + 1e-6;
      const [x, z, dir] = polyAt(path, c.s);
      c.pos[0] = x; c.pos[2] = z; c.dir = dir;
      c.arrived = c.state === 'wait' && c.s >= goal - 1e-3;
      if (c.state === 'out' && c.s >= len) gone.push(c);
    }
    if (gone.length) s.cars = s.cars.filter(c => !gone.includes(c));
  }

  // ---- staff (HR office) ----
  hire() {
    const s = this.s;
    if (s.workers.length > this.d.worker.max) return false;
    s.workers.push({ id: `w${s.workers.length + 1}`, pos: [...this.d.hr.spawn], carry: [], task: null, pickT: 0 });
    this.events.push({ type: 'hire', n: s.workers.length });
    return true;
  }

  stepWorkers(dt) {
    const s = this.s;
    for (const w of s.workers) {
      const step = this.workerSpeed() * dt;
      const cap = this.workerCap();
      if (!w.task) w.task = this.pickTask(w, cap);
      if (!w.task) { w.moving = false; continue; }
      const T = w.task;
      if (T.kind === 'burger') {
        const m = this.byTarget.get(T.from), c = this.byTarget.get(T.to);
        if (T.phase === 'get') {
          if (this.goTo(w, [m.zone[0], 0, m.zone[1] + m.zone[3] + 0.6], step)) {
            this.carryZones(w, dt, cap);
            if (w.carry.length >= cap || !s.machine[m.id].n) T.phase = w.carry.length ? 'put' : (w.task = null, 'get');
          }
        } else if (T.phase === 'put') {
          const spot = T.to[0] === 'p' || T.to[0] === 'k' ? [c.storage[0], 0, c.storage[1]] : [c.storage[0] + 0.6, 0, c.storage[1] + 1.2];
          if (this.goTo(w, spot, step)) {
            this.carryZones(w, dt, cap);
            if (!w.carry.length) w.task = null;
          }
        }
      } else if (T.kind === 'package') {
        const k = this.byTarget.get(T.from), dv = this.byTarget.get(T.to);
        if (T.phase === 'get') {
          if (this.goTo(w, [k.pickup[0], 0, k.pickup[1]], step)) {
            this.carryZones(w, dt, cap);
            if (w.carry.length >= cap || !s.packer[k.id].out) T.phase = w.carry.length ? 'put' : (w.task = null, 'get');
          }
        } else if (this.goTo(w, [dv.storage[0], 0, dv.storage[1]], step)) {
          this.carryZones(w, dt, cap);
          if (!w.carry.length || s.drive[dv.id].n >= dv.maxItems) w.task = null;
        }
      } else if (T.kind === 'clean') {
        const t = this.byTarget.get(T.table);
        if (T.phase === 'get') {
          if (this.goTo(w, [t.zone[0], 0, t.zone[1] + t.zone[3] + 0.3], step)) {
            this.carryZones(w, dt, cap);
            if (!s.table[t.id].cups || w.carry.length >= cap) T.phase = 'put';
          }
        } else {
          const tb = this.d.trash.find(b => b.active);
          if (this.goTo(w, [tb.box[0], 0, tb.box[1] + tb.box[3] + 0.3], step)) {
            this.carryZones(w, dt, cap);
            if (!w.carry.length) w.task = null;
          }
        }
      }
    }
  }

  pickTask(w, cap) {
    const s = this.s;
    const taken = new Set(s.workers.filter(o => o !== w && o.task).map(o => o.task.table || o.task.from));
    const dirty = this.d.tables.find(t => s.table[t.id] && s.table[t.id].cups > 0 && !taken.has(t.id));
    if (dirty) return { kind: 'clean', table: dirty.id, phase: 'get' };
    // [GUESS] order after cleaning: keep the counter stocked, carry boxes to the drive-thru, feed the package table
    // (EWorkingType lists CounterCheck, DriveThruCheck, PackageTableItemCheck; Worker's Idle state is not decompiled).
    const c = this.d.counters.find(k => s.counter[k.id] && s.counter[k.id].n < 12);
    const m = this.d.machines.filter(k => s.machine[k.id] && s.machine[k.id].n > 0 && !taken.has(k.id)).sort((a, b) => s.machine[b.id].n - s.machine[a.id].n)[0];
    if (c && m) return { kind: 'burger', from: m.id, to: c.id, phase: 'get' };
    const dv = this.d.drives.find(k => s.drive[k.id] && s.drive[k.id].n < 12);
    const pk = this.d.packers.find(k => s.packer[k.id] && s.packer[k.id].out > 0 && !taken.has(k.id));
    if (dv && pk) return { kind: 'package', from: pk.id, to: dv.id, phase: 'get' };
    const feed = this.d.packers.find(k => s.packer[k.id] && s.packer[k.id].in < 2 * PACK_SIZE);
    if (feed && m) return { kind: 'burger', from: m.id, to: feed.id, phase: 'get' };
    // Worker_State MoveToKiosk / KioskStorage restock the kiosk.
    const ko = this.d.kiosks.find(k => s.kiosk[k.id] && s.kiosk[k.id].n < 10);
    if (ko && m) return { kind: 'burger', from: m.id, to: ko.id, phase: 'get' };
    return null;
  }

  // ---- upgrade office / HR menus ----
  upgradeOffer() {
    const p = this.d.player, w = this.d.worker, s = this.s;
    const row = (lv, costs, values) => ({ level: lv, value: values[lv], next: values[lv + 1] ?? null, cost: costs[lv] ?? null });
    return {
      player: { speed: row(s.lv.speed, p.speedCost, p.speed), cap: row(s.lv.cap, p.capCost, p.cap), price: row(s.lv.price, p.priceCost, p.priceUp) },
      worker: { employ: { level: s.workers.length, cost: w.employCost[s.workers.length] ?? null, max: w.max }, speed: row(s.wlv.speed, w.speedCost, w.speed), cap: row(s.wlv.cap, w.capCost, w.cap) },
    };
  }

  // kind: player.speed | player.cap | player.price | worker.speed | worker.cap | worker.employ
  buyUpgrade(kind) {
    const s = this.s, o = this.upgradeOffer();
    const [who, what] = kind.split('.');
    const row = o[who][what];
    if (row.cost == null || row.cost > s.money) return false;
    if (what !== 'employ' && row.next == null) return false;
    s.money -= row.cost;
    if (who === 'player') s.lv[what]++;
    else if (what === 'employ') {
      if (!this.hire()) { s.money += row.cost; return false; }
    } else s.wlv[what]++;
    // Office and HR purchases are star-exp facilities too (EStarLevelFacilityType PlayerUpgrade 8 / WorkerUpgrade 9).
    this.gainExp(this.d.expPerBuild);
    this.stepFlows();
    this.refreshNav();
    this.events.push({ type: 'upgrade', kind });
    return true;
  }

  // Money earned while away [CODE GameManager.c:1983-2050]: offline seconds / OFFLINE_REWARD_UNIT (10) x the stage's
  // offline plus (StageData.offline_reward_plus, 4 on stage 1; the world-map plus upgrades are not in this build),
  // capped at _offlineMaxMinutes (10) x plus x OFFLINE_REWARD_MAX_UNIT (6). [GUESS] the popup needs _offlineMinMinutes.
  offlineReward(ms) {
    const o = this.d.offline, sec = ms / 1000;
    if (sec < o.minMinutes * 60) return 0;
    return Math.min(Math.floor(sec / o.unit * o.plus), o.maxMinutes * o.plus * o.maxUnit);
  }

}
