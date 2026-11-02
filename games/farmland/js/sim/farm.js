// Farm Land rules, no THREE: runs in node (test/farmland-sim.js) and in the page.
// Sources: RULES.md (~/farmland-ref/rules, cited as File.c:line of the decompile) and the exported prefab data.
// Coordinates are three.js space (Unity z mirrored); parcels are 6x6 on x = 3 + 6*gx, z = -3 - 6*gz.

export const RULES = {
  cell: 6,
  half: 3,
  padding: 2.5,            // Parcel.Padding: how far from the centre the player may go toward a closed side
  fieldSide: 5,            // Field.NB_FIELD_CELLS_SIDE
  startCoins: 7,           // seen in the first frame of a fresh game (clip buyciZObYbc t=0); GameController ctor says 0, the save sets it
  speed: 7,                // FarmScene PlayerController.BaseSpeed
  // Planting pace: remake divergence on user feel-test (rev 20261101f), the original values are in the comments.
  // Target (user): sow AND water while walking, one smooth pass covers the whole field, almost no slow-down.
  fieldSlow: 0.95,         // original 0.4: GameController.GetSpeedMultiplierForDetectableType(FieldCell) (GameController.c:18060)
  plantTimerScale: 0.1,    // player's Seed/Water cell timers x0.1 (CropData.Timers 0.5 s -> 0.05 s); harvest and workers unchanged
  slowEase: 0.15,          // remake: seconds to ease 1 <-> fieldSlow (the original switches at once; a hard switch read as "stuck")
  planeR: 2.76 + 0.5,       // Hydravion SphereCollider radius + the player's reach (inferred)
  reach: 1.2,              // tool boxes sit at position + forward*1.2 (PlayerController.c:7564)
  toolR: [2.2, 2.2, 1.75],  // original seed box 0.7 (1.2 wide), water 0.9 (0.8-1.5); harvest sphere 1.75 kept (PlayerController.c:~8410)
  growBeat: 1.2,           // remake: a freshly watered field can be harvested after 1.2 s, so one fast pass sows + waters
                           // but does not cut the plants it just grew (the original's slow tools made this implicit)
  autoComplete: 13,        // original 4: fewer than N cells left in Seed/Water complete themselves (Field.c:6218)
  dropDelay: 0.2,          // Drop.Collect(0.2, 1) (FieldCell+__c.c:42)
  donateNear: 1.0,         // player overlap sphere vs the LockedSprite trigger (radius not recovered, inferred)
  donateSlice: 4,          // price * dt / 4 per frame (Parcel.c:20349)
  donateBoostEvery: 2,     // _timeToIncreaseDonation (Parcel.c:14181)
  donateBoost: 3.5,
  merchantR: 1.53 + 0.8,   // Marchand SphereCollider radius + player reach
  treeR: 1.87 + 0.6,       // tree CapsuleCollider radius
  treeMinFruits: 4,        // GameController.MinFruitNumberToHarvest; shakeable above this
  shakeTime: 1.6,          // MiniGameTree replaced by a short automatic shake (inferred pacing)
  animalR: 0.75 + 1.0,
  barnR: 1.8,              // player at the barn's DockingSpot
  barnCapMin: 100, barnCapMax: 10000, barnLevels: 100,     // GameController ctor (GameController.c:~5900)
  workerLevels: 20, workerSpeedMin: 1, workerSpeedMax: 1.5, // worker speed factor; fill per minute 20..50
  workerPurse: 50,         // WorkerController._purseCapacity (WorkerController.c:12744)
};

import { Workers } from './workers.js';

const key = (gx, gz) => `${gx},${gz}`;
const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));

export class Farm {
  constructor(data, opts = {}) {
    this.data = data;
    this.rng = opts.rng || Math.random;
    this.events = [];
    this.time = 0;           // sim seconds; trees/animals use it as their clock (offline time is added on load)
    this.coins = RULES.startCoins;
    this.land = 0;           // HUD "land" counter: parcels unlocked with AddPointWhenUnlock
    this.bag = {};
    this.inflation = data.inflation || 1;
    this.parcels = data.parcels.map((p, i) => ({ i, d: p, open: !p.locked, paid: 0 }));
    this.grid = new Map();
    for (const p of this.parcels) if (p.d.g) this.grid.set(key(p.d.g[0], p.d.g[1]), p);
    const byObj = k => { const m = new Map(); this.parcels.forEach(p => { if (p.d[k] != null) m.set(p.d[k], p); }); return m; };
    const fieldP = byObj('field'), treeP = byObj('tree'), merchP = byObj('merchant'), animalP = byObj('animal'), barnP = byObj('barn');
    this.fields = data.fields.map((f, i) => {
      const n = RULES.fieldSide, h = (n - 1) / 2, cells = [];
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) cells.push({ x: f.pos[0] + a - h, z: f.pos[2] + b - h, state: 0, timer: 0 });
      return { i, d: f, crop: f.crop, parcel: fieldP.get(f.node), state: 0, cells };
    });
    for (const p of this.parcels) if (p.d.field != null) p.field = this.fields.find(f => f.d.node === p.d.field);
    this.trees = data.trees.map((t, i) => ({ i, d: t, crop: t.crop, parcel: treeP.get(t.node), ratio: 1, since: 0, shake: 0, fruits: t.fruits.length || 8 }));
    this.merchants = data.merchants.map((m, i) => ({ i, d: m, parcel: merchP.get(m.node), happy: 0 }));
    this.animals = data.animals.map((a, i) => ({ i, d: a, parcel: animalP.get(a.node), last: -1e9, x: a.pos[0], z: a.pos[2] }));
    this.barns = data.barns.map((b, i) => ({ i, d: b, parcel: barnP.get(b.node), level: 0, stock: {}, workers: [0, 0, 0] }));
    this.drops = [];
    this.workers = new Workers(this);
    const s = data.playerStart;
    this.player = { x: s[0], z: s[2], dirX: 0, dirZ: 1, moving: false, tool: null, slow: false };
    this.donating = null;
    // account-wide modifiers set by the meta layer (js/sim/meta.js): cat x1.25 sale coins, dog x1.3 barn collect, bike x1.7
    this.mods = { coin: 1, barn: 1, speed: 1 };
    // SectionFinal: once its bridge parcels are open the player can walk to the Hydravion (SphereCollider r 2.76),
    // which flies to the next World (Hydravion.c:96, WorldController.ChangeWorld(min(index + 1, last)))
    this.final = data.final ? { parcels: data.final.parcels.map(i => this.parcels[i]), x: data.final.planePos[0], z: data.final.planePos[2] } : null;
    this.traveled = false;
    this.refreshLevels();
    if (opts.save) this.load(opts.save, opts.offline || 0);
    this.workers.sync();
    this.wasNear = this.nearPlane();
    this.events.length = 0;
  }

  // ---- queries -------------------------------------------------------------------------------------------------
  parcelAt(x, z) {
    return this.grid.get(key(Math.round((x - 3) / RULES.cell), Math.round((-3 - z) / RULES.cell))) || null;
  }

  // Parcel.RefreshSouldShowParcel: a locked parcel is on offer when its ParcelDependencies are all open (Parcel.c:454,
  // AND inferred); we also require it to touch an open parcel, which RefreshParcelAround re-evaluates on every unlock.
  available(p) {
    if (p.open) return false;
    if (!p.d.deps.every(i => this.parcels[i].open)) return false;
    return p.d.nb.some(i => i >= 0 && this.parcels[i].open);
  }

  price(p) { return Math.round(p.d.price * this.inflation); }

  // Crop level = number of open parcels producing it (WorldController.c:5698); price GameController.c:7801/9160.
  refreshLevels() {
    const lv = {};
    for (const p of this.parcels) {
      if (!p.open) continue;
      const c = this.parcelCrop(p);
      if (c) lv[c] = (lv[c] || 0) + 1;
    }
    this.levels = lv;
  }

  parcelCrop(p) {
    if (p.d.field != null) return this.data.fields.find(f => f.node === p.d.field)?.crop;
    if (p.d.animal != null) return this.data.animals.find(a => a.node === p.d.animal)?.loot;
    if (p.d.tree != null) return this.data.trees.find(t => t.node === p.d.tree)?.crop;
    return null;
  }

  cropPrice(name) {
    const c = this.data.crops[name];
    if (!c) return 0;
    const lvl = Math.max(0, (this.levels[name] || 1) - 1);
    return Math.round(c.dropValue + c.levelExtraValue * lvl) * this.inflation;
  }

  // Position clamp (EntityController.c:216-290, Parcel.IsSideBlocked): inside an open parcel, and no further than
  // Padding from its centre toward a side whose neighbour is not open.
  walkable(x, z) {
    const p = this.parcelAt(x, z);
    if (!p || !p.open) return false;
    const dx = x - p.d.pos[0], dz = z - p.d.pos[2], pad = RULES.padding;
    const open = n => n >= 0 && this.parcels[n].open;
    // Neighbors = [UP, RIGHT, DOWN, LEFT] in Unity space: UP = +z Unity = -z here, RIGHT = +x
    if (dz < -pad && !open(p.d.nb[0])) return false;
    if (dx > pad && !open(p.d.nb[1])) return false;
    if (dz > pad && !open(p.d.nb[2])) return false;
    if (dx < -pad && !open(p.d.nb[3])) return false;
    return true;
  }

  bridgeDone() { return !!this.final && this.final.parcels.every(p => p.open); }
  nearPlane() { return !!this.final && Math.hypot(this.player.x - this.final.x, this.player.z - this.final.z) < RULES.planeR; }

  // ---- step ----------------------------------------------------------------------------------------------------
  step(dt, input = { x: 0, z: 0 }) {
    this.time += dt;
    this.movePlayer(dt, input);
    // OnTriggerEnter: only stepping into the plane's sphere flies (a save that stands on it must not re-trigger)
    const near = this.nearPlane();
    if (near && !this.wasNear && !this.traveled && this.bridgeDone()) {
      this.traveled = true;
      this.events.push({ type: 'travel' });
    }
    this.wasNear = near;
    this.updateFields(dt);
    this.updateDonation(dt);
    this.updateMerchants(dt);
    this.updateTrees(dt);
    this.updateAnimals(dt);
    this.updateBarns(dt);
    this.workers.step(dt);
    this.updateDrops(dt);
  }

  movePlayer(dt, input) {
    const pl = this.player;
    const len = Math.hypot(input.x, input.z);
    // field slow-down factor eases toward its target (RULES.slowEase) instead of snapping 1 -> 0.4
    const target = pl.slow ? RULES.fieldSlow : 1, rate = (1 - RULES.fieldSlow) / RULES.slowEase * dt;
    pl.slowF = pl.slowF == null ? target : pl.slowF + Math.max(-rate, Math.min(rate, target - pl.slowF));
    pl.moving = len > 0.05;
    pl.speed = 0;
    if (!pl.moving) return;
    const sp = RULES.speed * this.mods.speed * pl.slowF * Math.min(1, len);
    pl.speed = sp;
    pl.dirX = input.x / len; pl.dirZ = input.z / len;
    const vx = pl.dirX * sp * dt, vz = pl.dirZ * sp * dt;
    if (this.walkable(pl.x + vx, pl.z + vz)) { pl.x += vx; pl.z += vz; }
    else if (this.walkable(pl.x + vx, pl.z)) pl.x += vx;
    else if (this.walkable(pl.x, pl.z + vz)) pl.z += vz;
  }

  // Player tool boxes: centre = position + forward * 1.2; the cell under the player sets FieldTool.
  // Remake divergence: the original slows the player (x0.4) on any field cell; here the slow-down only applies while a
  // cell of the field's current state is inside the tool box, so crossing a finished field walks at full speed.
  updateFields(dt) {
    const pl = this.player;
    pl.tool = null; pl.slow = false;
    const cx = pl.x + pl.dirX * RULES.reach, cz = pl.z + pl.dirZ * RULES.reach;
    for (const f of this.fields) {
      if (!f.parcel?.open) continue;
      if (Math.abs(pl.x - f.d.pos[0]) > 3.4 || Math.abs(pl.z - f.d.pos[2]) > 3.4) continue;
      const over = Math.abs(pl.x - f.d.pos[0]) < 2.6 && Math.abs(pl.z - f.d.pos[2]) < 2.6;
      if (over) pl.tool = ['seed', 'water', 'scythe'][f.state];
      if (this.workField(f, cx, cz, RULES.toolR[f.state], dt, null) > 0) pl.slow = true;
    }
  }

  // FieldCell.Interact for every cell in reach (FieldCell.c:1041): timer runs while touched, Upgrade at Timers[state].
  workField(f, cx, cz, r, dt, worker) {
    const base = this.data.crops[f.crop]?.timers || [0.5, 0.5, 0.1];
    const timers = worker ? base : [base[0] * RULES.plantTimerScale, base[1] * RULES.plantTimerScale, base[2]];
    if (f.state === 2 && this.time < (f.readyAt || 0)) return 0;   // growBeat
    let touched = 0;
    for (const c of f.cells) {
      if (c.state !== f.state) continue;
      if (Math.hypot(c.x - cx, c.z - cz) > r) continue;
      touched++;
      if (c.timer >= timers[f.state]) this.upgradeCell(f, c, worker, true);
      else c.timer += dt;
    }
    this.checkField(f);
    return touched;
  }

  upgradeCell(f, c, worker, spawn) {
    c.timer = 0;
    const from = c.state;
    c.state = (c.state + 1) % 3;
    this.events.push({ type: 'cell', f: f.i, c: f.cells.indexOf(c), from, state: c.state, worker: !!worker });
    if (from === 2 && spawn) {
      const cd = this.data.crops[f.crop];
      const n = cd.dropAmount[0] + Math.floor(this.rng() * (cd.dropAmount[1] - cd.dropAmount[0] + 1));
      if (worker) worker.purse = Math.min(RULES.workerPurse, worker.purse + n);   // FieldCell.c:571
      else this.spawnDrops(f.crop, c.x, c.z, n);
    }
  }

  // Field.OnCellStateChanged (Field.c:6218): advance when no cell is left; < 4 left in Seed/Water finish by themselves.
  checkField(f) {
    const left = f.cells.filter(c => c.state === f.state);
    if (left.length > 0 && left.length < RULES.autoComplete && f.state !== 2) {
      for (const c of left) this.upgradeCell(f, c, null, false);
    }
    if (f.cells.every(c => c.state !== f.state)) {
      f.state = (f.state + 1) % 3;
      if (f.state === 2) f.readyAt = this.time + RULES.growBeat;
      this.events.push({ type: 'field', f: f.i, state: f.state });
    }
  }

  spawnDrops(crop, x, z, n) {
    for (let k = 0; k < n; k++) {
      const a = this.rng() * Math.PI * 2, r = 1.5 + this.rng() * 1.75;   // radial offset 1.5-3.25 (FieldCell.c:1135)
      const d = { id: this.dropId = (this.dropId || 0) + 1, crop, x, z, tx: x + Math.cos(a) * r * 0.5, tz: z + Math.sin(a) * r * 0.5, age: 0 };
      this.drops.push(d);
      this.events.push({ type: 'drop', drop: d });
    }
  }

  // Drop.Collect(delay 0.2, value 1): no magnet; every drop lands in the inventory after the delay.
  updateDrops(dt) {
    for (let k = this.drops.length - 1; k >= 0; k--) {
      const d = this.drops[k];
      d.age += dt;
      if (d.age < RULES.dropDelay + 0.25) continue;   // 0.25 s hop before the fly-in (visual)
      this.drops.splice(k, 1);
      this.bag[d.crop] = (this.bag[d.crop] || 0) + 1;
      this.events.push({ type: 'pick', drop: d });
    }
  }

  // Parcel.Interact (Parcel.c:20261): per frame give min(price*dt/4, coins*dt/4), at least _amountToGive, which starts at
  // 1 and is multiplied by 3.5 every 2 s of continuous standing. Wallet persists per parcel.
  updateDonation(dt) {
    const pl = this.player;
    let target = null;
    for (const p of this.parcels) {
      if (p.open || !this.available(p)) continue;
      const dx = Math.max(Math.abs(pl.x - p.d.pos[0]) - RULES.half, 0), dz = Math.max(Math.abs(pl.z - p.d.pos[2]) - RULES.half, 0);
      if (Math.hypot(dx, dz) <= RULES.donateNear) { target = p; break; }
    }
    if (!target || this.coins <= 0 || (target.d.landPrice > 0 && this.land < target.d.landPrice)) { this.donating = null; return; }
    if (this.donating?.p !== target) this.donating = { p: target, give: 1, t: RULES.donateBoostEvery };
    const dn = this.donating;
    dn.t -= dt;
    if (dn.t <= 0) { dn.t = RULES.donateBoostEvery; dn.give *= RULES.donateBoost; }
    const price = this.price(target);
    const cap = Math.min(Math.round(price * dt / RULES.donateSlice), this.coins * dt / RULES.donateSlice);
    if (dn.give < cap) dn.give = cap;
    const amount = Math.min(Math.ceil(dn.give), price - target.paid, this.coins);
    if (amount <= 0) return;
    this.coins -= amount;
    target.paid += amount;
    this.events.push({ type: 'donate', p: target.i, amount });
    if (target.paid >= price) this.unlock(target);
  }

  unlock(p) {
    p.open = true;
    p.paid = 0;
    this.donating = null;
    if (p.d.addPoint) this.land++;
    this.refreshLevels();
    // Tree starts full, animal ready (Parcel.Init -> Tree.Init / AnimalController)
    for (const t of this.trees) if (t.parcel === p) { t.ratio = 1; t.since = this.time; }
    for (const a of this.animals) if (a.parcel === p) a.last = -1e9;
    this.events.push({ type: 'unlock', p: p.i });
  }

  // GameController.Sell (GameController.c:10631): one crop type per frame, n = (100-2)*clamp01(count/500)+2.
  updateMerchants(dt) {
    const pl = this.player;
    for (const m of this.merchants) {
      m.happy = Math.max(0, m.happy - dt);
      if (!m.parcel?.open) continue;
      if (Math.hypot(pl.x - m.d.pos[0], pl.z - m.d.pos[2]) > RULES.merchantR) continue;
      const crop = Object.keys(this.bag).find(c => m.d.crops.includes(c) && this.bag[c] > 0);
      if (!crop) continue;
      const count = this.bag[crop];
      let n = Math.floor(98 * Math.min(1, count / 500) + 2);
      if (count > 1000 && count / n > 15) n = Math.max(n, Math.floor(count / 15));
      const sold = Math.min(n, count);
      this.bag[crop] -= sold;
      if (!this.bag[crop]) delete this.bag[crop];
      const gain = Math.round(sold * this.cropPrice(crop) * this.mods.coin);
      this.coins += gain;
      m.happy = m.d.happy;
      this.events.push({ type: 'sell', m: m.i, crop, n: sold, value: gain });
    }
  }

  // Tree.c:899: ratio = clamp01(lastRatio + elapsed / DropGenericTime); fruits = round(ratio * slots).
  treeFruits(t) {
    const g = this.data.crops[t.crop]?.dropGenericTime || 600;
    const r = Math.min(1, t.ratio + Math.max(0, this.time - t.since) / g);
    return Math.round(r * t.fruits);
  }

  updateTrees(dt) {
    const pl = this.player;
    for (const t of this.trees) {
      if (!t.parcel?.open) continue;
      const near = Math.hypot(pl.x - t.d.pos[0], pl.z - t.d.pos[2]) < RULES.treeR;
      const n = this.treeFruits(t);
      if (!near || n <= RULES.treeMinFruits) { t.shake = 0; continue; }
      t.shake += dt;
      if (t.shake === dt) this.events.push({ type: 'shake', t: t.i });
      if (t.shake < RULES.shakeTime) continue;
      // MiniGameTree end: DropAllFruits, lastRatio = 0, each fruit = 1 item (Tree.c:3159)
      t.shake = 0; t.ratio = 0; t.since = this.time;
      this.spawnDrops(t.crop, t.d.pos[0], t.d.pos[2], n);
      this.events.push({ type: 'tree', t: t.i, n });
    }
  }

  animalReady(a) {
    return this.time > a.last + (this.data.crops[a.d.loot]?.dropGenericTime || 60);
  }

  // AnimalController: ready DropGenericTime after LastCollected; walking up collects Random(Min..Max) items.
  updateAnimals(dt) {
    const pl = this.player;
    for (const a of this.animals) {
      if (!a.parcel?.open || !a.d.loot || !this.animalReady(a)) continue;
      if (Math.hypot(pl.x - a.x, pl.z - a.z) > RULES.animalR) continue;
      a.last = this.time;
      const cd = this.data.crops[a.d.loot];
      const n = cd.dropAmount[0] + Math.floor(this.rng() * (cd.dropAmount[1] - cd.dropAmount[0] + 1));
      this.spawnDrops(a.d.loot, a.x, a.z, n);
      this.events.push({ type: 'animal', a: a.i, n });
    }
  }

  barnStock(b) { return Object.values(b.stock).reduce((a, n) => a + n, 0); }
  // Barn.c:2918 / 4576: next barn level and worker prices, times EconomyInflation; worker level 0 = not hired yet
  barnPrice(b) { return b.level >= RULES.barnLevels - 1 ? Infinity : Math.round(b.d.prices[Math.min(b.level, b.d.prices.length - 1)] * this.inflation); }
  workerPrice(b, k) {
    const lv = b.workers[k], list = b.d.worker[k];
    return lv >= RULES.workerLevels ? Infinity : Math.round(list[Math.min(lv, list.length - 1)] * this.inflation);
  }
  buy(price) {
    if (!(price <= this.coins)) return false;
    this.coins -= price;
    return true;
  }
  upgradeBarn(b) {
    const price = this.barnPrice(b);
    if (!this.buy(price)) return false;
    b.level++;
    this.events.push({ type: 'barnLevel', b: b.i, level: b.level, price });
    return true;
  }
  // Workers are hired in order (PopupWorker shows worker k+1 once worker k is hired)
  hireWorker(b, k) {
    if (k > 0 && !b.workers[k - 1]) return false;
    const price = this.workerPrice(b, k);
    if (!this.buy(price)) return false;
    b.workers[k]++;
    this.workers.sync();
    this.events.push({ type: 'workerLevel', b: b.i, k, level: b.workers[k], price });
    return true;
  }

  barnNear(b) {
    const d = b.d.dock || b.d.pos;
    return Math.hypot(this.player.x - d[0], this.player.z - d[2]) < RULES.barnR;
  }

  // Barn.Interact -> TransferToPlayer (Barn.c:18726): everything in the barn goes to the inventory.
  updateBarns() {
    for (const b of this.barns) {
      if (!b.parcel?.open || !this.barnNear(b)) continue;
      for (const [crop, n] of Object.entries(b.stock)) {
        if (!n) continue;
        const got = Math.floor(n * this.mods.barn);   // Barn.TransferToPlayer: (int)(qty * DogBarnMultiplier) with the dog
        this.bag[crop] = (this.bag[crop] || 0) + got;
        this.events.push({ type: 'barnOut', b: b.i, crop, n: got });
      }
      b.stock = {};
    }
  }

  barnCapacity(b) { return Math.round(lerp(RULES.barnCapMin, RULES.barnCapMax, b.level / RULES.barnLevels)); }

  // ---- save ----------------------------------------------------------------------------------------------------
  save() {
    return {
      v: 2, t: this.time, coins: this.coins, land: this.land, bag: this.bag, at: Date.now(),
      open: this.parcels.filter(p => p.open && p.d.locked).map(p => p.i),
      paid: Object.fromEntries(this.parcels.filter(p => p.paid && !p.open).map(p => [p.i, p.paid])),
      fields: this.fields.map(f => [f.state, f.cells.map(c => c.state).join('')]),
      trees: this.trees.map(t => [t.ratio, t.since]),
      animals: this.animals.map(a => a.last),
      barns: this.barns.map(b => [b.level, b.workers, b.stock]),
      workers: this.workers.list.map(w => [w.purse, w.crop]),
      player: [this.player.x, this.player.z],
    };
  }

  load(s, offline = 0) {
    if (!s || s.v !== 2) return;
    this.time = (s.t || 0) + offline;
    this.coins = s.coins; this.land = s.land || 0; this.bag = { ...s.bag };
    const open = new Set(s.open);
    for (const p of this.parcels) { p.open = !p.d.locked || open.has(p.i); p.paid = s.paid?.[p.i] || 0; }
    s.fields?.forEach(([st, cells], i) => {
      const f = this.fields[i]; if (!f) return;
      f.state = st; [...cells].forEach((ch, k) => { f.cells[k].state = +ch; });
    });
    s.trees?.forEach((v, i) => { const t = this.trees[i]; if (t) { t.ratio = v[0]; t.since = v[1]; } });
    s.animals?.forEach((v, i) => { const a = this.animals[i]; if (a) a.last = v; });
    s.barns?.forEach((v, i) => { const b = this.barns[i]; if (b) { b.level = v[0]; b.workers = v[1]; b.stock = v[2] || {}; } });
    s.workers?.forEach((v, i) => { const w = this.workers.list[i]; if (w) { w.purse = v[0]; w.crop = v[1]; } });
    if (s.player && this.walkable(s.player[0], s.player[1])) { this.player.x = s.player[0]; this.player.z = s.player[1]; }
    this.refreshLevels();
  }
}
