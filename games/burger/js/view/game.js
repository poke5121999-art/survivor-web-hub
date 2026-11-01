// Draws the sim: switches the stage's GameObjects on/off like the original CreateArea/DistrictArea do, keeps item
// stacks (grill, counter, hands, money, table trash) and moves the people.
import * as THREE from 'three';
import * as SkeletonUtils from '../../vendor/SkeletonUtils.js';
import { Rig } from './anim.js';
import { ITEM } from '../sim/sim.js';

// Pool prefab roots in art/pool/scene.json (tools/export_store.py sharedassets1.assets pool --prefabs ...).
// Cars: ObjectPoolManager._carObjectData[Stage.driveCarType] = Car01..Car05.
// Pool prefabs by GameObject name (art/pool, tools/export_items.py); items by ItemType through data/items.json.
const POOL = { customer: 'Customer', customerVip: 'CustomerVIP', garbage: ['Garbage01', 'Garbage02', 'Garbage03'],
  cars: ['Car01', 'Car02', 'Car03', 'Car04', 'Car05'], vipCars: ['CarVIP01', 'CarVIP02'], arrow: 'Waypoint Arrow' };
// Guide arrow (sharedassets1 "Waypoint Arrow", GuideArrow): hangs over the current guide step's transform and bobs
// (a DOTween on _modelTransform; height and bob [GUESS], the tween values are not in the data).
const ARROW_Y = 2.2, ARROW_BOB = 0.3, ARROW_HZ = 1.2;
// Stack step = Item/PackageItem.itemSizeY of the item's prefab; money bills (CurrencyItem) 0.1 [GUESS], cups 0.3.
const STEP_FALLBACK = { [ITEM.money]: 0.1, [ITEM.cup]: 0.3 };
const MONEY_BILL = 5;   // one bill on a money pile per this much cash (the original stacks one bill per sale unit)

const v3 = new THREE.Vector3();
const fmt = n => (n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}K` : `${Math.floor(n)}`);
// Pad price: the pad's own TextMeshPro (white, size 6, Bumpo SDF; the font ships only as an SDF atlas) drawn on a
// canvas texture on a quad at that node, so it lies on the floor like the original. TMP size 6 ~ 0.6 world units.
const PRICE_FONT = "'Bumpo', 'Bakbak One', 'Arial Black', sans-serif";
const PRICE_H = 0.9, PRICE_W = 2.4;

export class GameView {
  constructor({ world, pool, sim, anim, scene3, items }) {
    this.roots = new Map();
    pool.objects.forEach((o, i) => { const n = o.userData.node; if (n && n.p < 0 && !this.roots.has(n.n)) this.roots.set(n.n, i); });
    this.itemNames = items.items;
    this.world = world;
    this.pool = pool;
    this.sim = sim;
    this.anim = anim;
    this.scene3 = scene3;
    this.O = world.objects;
    this.d = sim.d;
    this.people = new Map();
    this.cars = new Map();
    this.trays = new Map();
    this.prices = new Map();
    this.arrow = this.prefab(POOL.arrow);
    world.root.add(this.arrow);
    this.arrowT = 0;
    this.stacks = new Map();
    this.rigs = new Map(world.rigs.map(r => [r.root, r]));
    this.player = this.O[this.d.player.node];
    this.playerRig = this.rigUnder(this.player);
    this.workerObjs = this.O.filter(o => o.userData.node.k && o.userData.node.k.Worker);
    this.padNodes = new Map(this.d.pads.map(p => [p.id, this.O[p.vis]]));
    // Player props the original only shows during boosts / purchases (Player.moveSpeedBoostObject, the IAP ride,
    // the speed-up wind, the money prop); the tray shows while carrying (Player._tray).
    const pc = this.player.userData.node.k.Player;
    for (const f of ['moveSpeedBoostObject', 'moveSpeedPurchaseObject', 'capacityPurchaseObject', 'capacityBoostObject', '_speedUpParticle', '_clothChangeFX']) {
      if (pc[f] && pc[f].n != null) this.O[pc[f].n].visible = false;
    }
    this.O.forEach(o => { if (o.parent === this.player && o.name === 'Money') o.visible = false; });
    this.playerTray = this.O[pc._tray.n];
    // The starting cash pile (MoneyArea.moneyCount, spawned at run time in the original).
    this.startPile = new THREE.Group();
    this.startPile.position.fromArray(this.d.startMoney.pos);
    world.root.add(this.startPile);
    this.syncNodes(true);
  }

  rigUnder(root) {
    let found = null;
    root.traverse(o => { if (!found && this.rigs.has(o)) found = this.rigs.get(o); });
    return found;
  }

  // A fresh copy of a pool prefab (skinned ones keep their own skeleton) with its Animator playing.
  // Pool root index of a prefab name, or of an ItemType number.
  root(nameOrItem) {
    const name = typeof nameOrItem === 'number' ? this.itemNames[nameOrItem] : nameOrItem;
    const i = this.roots.get(name);
    if (i == null) throw new Error(`pool prefab missing: ${name}`);
    return i;
  }

  itemStep(item) {
    const k = this.pool.objects[this.root(item)].userData.node.k || {};
    const c = k.Item || k.PackageItem;
    return c && c.itemSizeY ? c.itemSizeY : STEP_FALLBACK[item] ?? 0.35;
  }

  prefab(i) {
    if (typeof i === 'string') i = this.root(i);
    const src = this.pool.objects[i];
    const o = SkeletonUtils.clone(src);
    o.visible = true;
    o.traverse(c => {
      const k = c.userData.node && c.userData.node.k;
      if (k && k.Animator) {
        const ctrl = this.anim.controller(k.Animator.m_Controller);
        if (ctrl) c.userData.rigNew = new Rig(this.anim, c, ctrl);
      }
    });
    let rig = null;
    o.traverse(c => { if (!rig && c.userData.rigNew) rig = c.userData.rigNew; });
    o.userData.rigInst = rig;
    return o;
  }

  // ---- GameObject switches ----
  syncNodes(first = false) {
    const sim = this.sim;
    for (const [i, on] of sim.overrides()) {
      const o = this.O[i];
      if (!o) continue;
      if (on && !o.visible && !first) this.appear(o);
      o.visible = on;
    }
    const vis = new Set(sim.visiblePads());
    for (const [id, o] of this.padNodes) o.visible = vis.has(id);
    // Hired cashier stands behind the counter from the employ grade on (Counter.workerObject).
    // Same for the package table's packer and the drive-thru window (workerObject, PackageTableNode/DriveCarCounterNode.SetGrade).
    for (const c of [...this.d.counters, ...this.d.drives]) {
      const o = this.O[c.cashierNode];
      if (o) o.visible = (sim.s.grade[c.id] || 0) >= c.employGrade && !!sim.s.built[c.pad];
    }
    for (const k of this.d.packers) {
      const o = this.O[k.packerNode];
      if (o) o.visible = (sim.s.grade[k.id] || 0) >= k.employGrade && !!sim.s.built[k.pad];
    }
    // Grade models: gradeObjects[g] shows for the current grade only.
    for (const list of [this.d.machines, this.d.counters, this.d.tables, this.d.packers, this.d.drives]) {
      for (const e of list) {
        const g = sim.s.grade[e.id] || 0;
        e.grades.forEach((n, k) => { if (n != null && this.O[n]) this.O[n].visible = k === g; });
      }
    }
    if (sim.s.startPile <= 0) this.O[this.d.startMoney.node].visible = false;
    if (first) {
      // Appear animators start in "Init" (scale 0); things already built show their final pose.
      // Only under something the save says is built (an override node switched on); the rest keep their default.
      const on = new Set([...sim.overrides()].filter(([i, v]) => v && i !== 0).map(([i]) => this.O[i]));
      const built = o => { for (let p = o; p; p = p.parent) if (on.has(p)) return true; return false; };
      for (const r of this.world.rigs) if (r.has('Created_object') && built(r.root)) r.play('Created_object', 0);
      for (const r of this.world.rigs) if (r.has('Coffee_machine_on')) r.play('Coffee_machine_on', 0);
    }
  }

  appear(o) {
    o.traverse(c => {
      const r = this.rigs.get(c);
      if (r && r.has('Appear_object')) { r.play('Init', 0); r.play('Appear_object', 0); }
    });
    o.scale.multiplyScalar(1);
  }

  // ---- stacks of item meshes ----
  stack(key, parent, item, n, opt = {}) {
    let st = this.stacks.get(key);
    if (!st) {
      st = { list: [], parent };
      this.stacks.set(key, st);
    }
    if (st.item !== item) { while (st.list.length) st.parent.remove(st.list.pop()); st.item = item; }
    const proto = this.root(item);
    const cols = opt.cols || 1, step = this.itemStep(item), max = opt.max || 60;
    n = Math.min(n, max);
    while (st.list.length > n) st.parent.remove(st.list.pop());
    while (st.list.length < n) {
      const k = st.list.length;
      const o = this.prefab(proto);
      const col = k % cols, row = Math.floor(k / cols);
      const gx = opt.gx || 0.75, gz = opt.gz || 0.4;
      o.position.set(cols > 1 ? ((col % 2) - 0.5) * gx : 0, row * step + (opt.y || 0), cols > 2 ? (Math.floor(col / 2) - 0.5) * gz : 0);
      parent.add(o);
      st.list.push(o);
    }
    return st;
  }

  // ---- per-frame ----
  update(dt) {
    const sim = this.sim, s = sim.s, d = this.d;
    for (const e of sim.events) if (e.type === 'build' || e.type === 'grade' || e.type === 'hire') this.dirty = true;
    if (this.dirty) { this.syncNodes(); this.dirty = false; }
    else {
      const vis = new Set(sim.visiblePads());
      for (const [id, o] of this.padNodes) o.visible = vis.has(id);
    }
    this.updatePrices();
    this.updateArrow(dt);

    // Player
    this.place(this.player, s.player);
    if (this.playerRig) { this.playerRig.play(s.player.moving ? 'Run' : 'Idle'); }
    const pk = this.d.player.node;
    const hand = this.handOf(this.player);
    this.stack('p', hand, s.player.carry[0] ?? ITEM.cup, s.player.carry.length);
    this.playerTray.visible = s.player.carry.length > 0;
    this.stack('start', this.startPile, ITEM.money, Math.ceil(s.startPile / MONEY_BILL), { cols: 4, max: 60 });

    // Grills, counter, money
    for (const m of d.machines) {
      const st = s.machine[m.id];
      if (st) this.stack(`m${m.id}`, this.O[m.stackNode], m.item, st.n);
    }
    for (const c of d.counters) {
      const st = s.counter[c.id];
      if (!st) continue;
      this.stack(`c${c.id}`, this.O[c.storageNode], c.items[0], st.n, { cols: 2, y: 1.0, gx: 0.5, max: 40 });
      this.stack(`$${c.id}`, this.O[c.moneyNode], ITEM.money, Math.ceil(st.money / MONEY_BILL), { cols: 4, max: 80 });
    }
    // Package table: burgers waiting on the storage side, boxes on the pickup side, and the box being filled on the
    // tray (PackageItem.tempItems light up one burger at a time while packing runs).
    for (const k of d.packers) {
      const st = s.packer[k.id];
      if (!st) continue;
      this.stack(`pi${k.id}`, this.O[k.burgersNode], k.ingredients[0], st.in, { cols: 2, gx: 0.45, max: 50 });
      this.stack(`po${k.id}`, this.O[k.itemsNode], k.item, st.out, { max: 20 });
      let tray = this.trays.get(k.id);
      if (!tray) {
        tray = this.prefab(this.root(k.item));
        tray.userData.slots = [];
        tray.traverse(c => { if (/^Coffee/.test(c.name)) tray.userData.slots.push(c); });
        this.O[k.trayNode].add(tray);
        this.trays.set(k.id, tray);
      }
      const g = s.grade[k.id] || 0;
      tray.visible = st.in >= 4 && st.out < k.maxOut[g] && sim.packerHere(k);
      const fill = Math.ceil(Math.min(1, st.t / k.delay[g]) * 4);
      tray.userData.slots.forEach((c, i) => { c.visible = i < fill; });
    }
    // Drive-thru window: boxes on the shelf, money pile, cars along the lane.
    for (const k of d.drives) {
      const st = s.drive[k.id];
      if (!st) continue;
      this.stack(`di${k.id}`, this.O[k.itemsNode], k.item, st.n, { cols: 2, gx: 0.5, max: 50 });
      this.stack(`d$${k.id}`, this.O[k.moneyNode], ITEM.money, Math.ceil(st.money / MONEY_BILL), { cols: 4, max: 80 });
    }
    // Kiosk: burgers waiting in the machine, its money pile.
    for (const k of d.kiosks) {
      const st = s.kiosk[k.id];
      if (!st) continue;
      this.stack(`ki${k.id}`, this.O[k.itemsNode], k.itemTypes[0], st.n, { cols: 2, gx: 0.45, max: 50 });
      this.stack(`k$${k.id}`, this.O[k.moneyNode], ITEM.money, Math.ceil(st.money / MONEY_BILL), { cols: 4, max: 80 });
    }
    // Restroom: dirty toilet / clean sign per stall (RestRoom.ToiletRefresh), garbage in its trash box, money pile.
    for (const r of d.restrooms || []) {
      const st = s.restroom[r.id];
      if (!st) continue;
      r.toilets.forEach((t, k) => {
        const dirty = st.dirty[k] > 0;
        if (this.O[t.dirty]) this.O[t.dirty].visible = dirty;
        if (this.O[t.clean]) this.O[t.clean].visible = !dirty;
        t.garbage.forEach(g => { if (this.O[g]) this.O[g].visible = dirty; });
      });
      this.stack(`r$${r.id}`, this.O[r.moneyNode], ITEM.money, Math.ceil(st.money / MONEY_BILL), { cols: 4, max: 80 });
    }
    // Cleaner robots: shown from the CleanBotUnlock star level, moving with the sim; garbage on board while carrying.
    const unlocked = sim.cleanerUnlocked();
    d.cleaners.forEach((c, i) => {
      if (this.O[c.root]) this.O[c.root].visible = unlocked;
      const b = s.bots[i], o = this.O[c.node];
      if (!b || !o) return;
      this.place(o, b);
      const gk = (o.userData.node.k.Cleaner || {})._garbage;
      const g = gk && this.findNode(o, gk);
      if (g) g.visible = b.carry > 0;
    });
    const carsAlive = new Set();
    for (const c of s.cars) {
      carsAlive.add(c.id);
      let o = this.cars.get(c.id);
      if (!o) {
        o = this.prefab(c.vip ? POOL.vipCars[c.type % 2] : POOL.cars[c.type] ?? POOL.cars[0]);
        this.world.root.add(o);
        this.cars.set(c.id, o);
      }
      o.position.set(c.pos[0], 0, c.pos[2]);
      o.rotation.y = c.dir + Math.PI;
      if (o.userData.rigInst) o.userData.rigInst.update(dt);
    }
    for (const [id, o] of this.cars) if (!carsAlive.has(id)) { o.parent.remove(o); this.cars.delete(id); }

    // Table trash: a garbage prefab sized by the cups left.
    for (const t of d.tables) {
      const st = s.table[t.id];
      if (!st) continue;
      const want = st.cups <= 0 ? -1 : st.cups <= 2 ? 0 : st.cups <= 4 ? 1 : 2;
      const cur = this.stacks.get(`g${t.id}`);
      if (!cur || cur.kind !== want) {
        if (cur && cur.obj) cur.obj.parent.remove(cur.obj);
        const rec = { kind: want, obj: null };
        if (want >= 0) {
          rec.obj = this.prefab(POOL.garbage[want]);
          rec.obj.position.set(t.items[0], 0.92, t.items[2]);
          this.world.root.add(rec.obj);
        }
        this.stacks.set(`g${t.id}`, rec);
      }
    }

    // Customers
    const alive = new Set();
    for (const x of s.customers) {
      alive.add(x.id);
      let o = this.people.get(x.id);
      if (!o) {
        o = this.prefab(x.vip ? POOL.customerVip : POOL.customer);
        this.world.root.add(o);
        this.people.set(x.id, o);
      }
      this.place(o, x);
      o.visible = x.state !== 'inToilet';
      const rig = o.userData.rigInst;
      const sitting = x.state === 'eat';
      if (rig) rig.play(sitting ? 'Sit' : x.moving ? 'Run' : 'Idle');
      if (sitting && x.seat) {
        const seat = d.tables.find(t => t.id === x.seat.t).seats[x.seat.i];
        o.rotation.y = seat.yaw + Math.PI;
      }
      const carrying = x.kiosk ? (x.state === 'exit' ? x.want : x.got)
        : x.state === 'toSeat' || x.state === 'seat' ? x.want : x.state === 'queue' ? x.got : 0;
      this.stack(`x${x.id}`, this.handOf(o), x.item ?? this.d.foods['1'], carrying);
      const tray = o.userData.trayObj ?? (o.userData.trayObj = this.findNode(o, (o.userData.node.k.CustomerNormal || o.userData.node.k.CustomerVIP || {})._tray));
      if (tray) tray.visible = carrying > 0;
      if (rig) rig.update(dt);
    }
    for (const [id, o] of this.people) if (!alive.has(id)) {
      o.parent.remove(o);
      this.people.delete(id);
      this.stacks.delete(`x${id}`);
    }

    // Staff: the stage's own Worker objects, one per hire.
    s.workers.forEach((w, k) => {
      const o = this.workerObjs[k];
      if (!o) return;
      o.visible = true;
      this.place(o, w);
      const r = this.rigUnder(o);
      if (r) r.play(w.moving ? 'Run' : 'Idle');
      this.stack(`w${k}`, this.handOf(o), w.carry[0] ?? ITEM.cup, w.carry.length);
    });

    for (const r of this.world.rigs) r.update(dt);
  }

  updateArrow(dt) {
    const sim = this.sim, step = this.d.guide[sim.s.guide];
    const target = step && step.text && sim.guideActive() && step.node != null ? this.O[step.node] : null;
    this.arrow.visible = !!target;
    if (!target) return;
    this.arrowT += dt;
    target.updateWorldMatrix(true, false);
    target.getWorldPosition(v3);
    this.world.root.worldToLocal(v3);
    this.arrow.position.set(v3.x, v3.y + ARROW_Y + ARROW_BOB * (0.5 + 0.5 * Math.sin(this.arrowT * Math.PI * 2 * ARROW_HZ)), v3.z);
  }

  // Remaining price on every visible pad (district pads below their star level show the lock instead, see hud.js).
  updatePrices() {
    const sim = this.sim, s = sim.s;
    const vis = new Set(sim.visiblePads());
    for (const p of this.d.pads) {
      if (p.price == null) continue;
      const cost = vis.has(p.id) ? sim.upgradeCost(p.id) : null;
      const locked = !sim.canBuy(p.id);
      const label = cost == null || locked ? '' : fmt(cost - (s.paid[p.id] || 0));
      let m = this.prices.get(p.id);
      if (!label) { if (m) m.visible = false; continue; }
      if (!m) {
        const cv = document.createElement('canvas');
        cv.width = 256; cv.height = 96;
        const tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;
        m = new THREE.Mesh(new THREE.PlaneGeometry(PRICE_W, PRICE_H),
          new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
        m.renderOrder = 60;
        m.userData.cv = cv;
        const host = this.O[p.price];
        if (!host) continue;
        host.add(m);
        this.prices.set(p.id, m);
      }
      m.visible = true;
      if (m.userData.label !== label) {
        m.userData.label = label;
        const cv = m.userData.cv, g = cv.getContext('2d');
        g.clearRect(0, 0, cv.width, cv.height);
        g.font = `64px ${PRICE_FONT}`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = '#fff';
        g.fillText(label, cv.width / 2, cv.height / 2 + 4, cv.width - 8);
        m.material.map.needsUpdate = true;
      }
    }
  }

  // Item parent of a character (Player/Worker/Customer _itemParent), found by the component field.
  handOf(o) {
    if (o.userData.hand) return o.userData.hand;
    const k = o.userData.node.k || {};
    const comp = k.Player || k.Worker || k.CustomerNormal || k.CustomerVIP;
    let hand = o;
    const want = comp && comp._itemParent && comp._itemParent.n;
    if (want != null) o.traverse(c => { if (c.userData.i === want) hand = c; });
    o.userData.hand = hand;
    return hand;
  }

  findNode(root, ref) {
    let hit = null;
    if (ref && ref.n != null) root.traverse(c => { if (c.userData.i === ref.n) hit = c; });
    return hit;
  }

  // Characters face -z in their own space (Unity +z), so a heading (dx, dz) is atan2(dx, dz) + PI.
  place(o, a) {
    const p = o.parent;
    v3.set(a.pos[0], a.pos[1] || 0, a.pos[2]);
    if (p && p !== this.world.root) { p.updateMatrixWorld(); p.worldToLocal(v3); }
    o.position.copy(v3);
    if (a.dir != null && a.moving) o.rotation.y = a.dir + Math.PI;
  }
}
