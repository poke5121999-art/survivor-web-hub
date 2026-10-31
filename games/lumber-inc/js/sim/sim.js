// Game rules of Lumber Inc map 1, pure JS (no THREE), from the decompiled original. Every number cites
// D:\lumber-ref\rules\{chop-carry,economy,workers-guide-camera}.md (CC / EC / WG + rule number).
import { statusOf, settle } from './buildings.js';
import { Forest, WOOD } from './forest.js';
import { Pack } from './pack.js';
import { apply, invertAffine, compose } from './math.js';
import { Crew } from './workers.js';
import { Missions } from './missions.js';
import { Guide } from './guide.js';
import { Extras } from './extras.js';
import { Town } from './town.js';

export const PEELED = 101, SQUARE = 102;
const STEP = 0.02; // fixed physics step: pads, deposits and pickups move one unit per step (EC 6, 13, 14)
const PAD = { init: 0.01, inc: 0.004, cap: 0.5 }; // EC 8
const FACTORY = { in: 48, out: 12, poll: 0.5, feed: 0.5 }; // EC 12, 17
const STORE_CAP = 84; // EC 21
const TRUCK = { base: 3, leadIn: 0.5, load: 0.12, queue: 9, speed: 5, gap: 5.5 }; // EC 22-25
const EXP = { unlockBuilding: 5 }; // EC 28
const STAR_GEMS = 10; // senior machine in UpgradeBuildingStarPanel_Item (AddPlayerItem -10 Gem)
const STAR_AD = { IncomeAdd: 'IncomeAddAd', CapacitAdd: 'CapacitAddAd', ProdSpdAddUI: 'ProdSpdAddAdUI' };
const SWING = 1.6667 / 2.5; // chop clip length / speed (CC B2)

// Upgrade tracks (AbstractUpgradeHandler, CC D): value = rows[level-1], cost of the next level = rows[level].CostVal.
export class Upgrades {
  constructor(config, levels) {
    this.levels = levels;
    const table = (name, field) => {
      const m = new Map();
      for (const r of config[name]) {
        if (!m.has(r.UpgradeId)) m.set(r.UpgradeId, []);
        m.get(r.UpgradeId).push({ v: r[field], cost: r.CostVal, cur: r.CostId });
      }
      return m;
    };
    this.tracks = new Map();
    for (const [t, f] of [['BackpackConf', 'Capacity'], ['MoveSpdConf', 'Speed'], ['WorkerToolConf', 'Damage'],
      ['ProdSpdConf', 'Efficiency'], ['ProdIncomeConf', 'Income']]) {
      for (const [id, rows] of table(t, f)) this.tracks.set(id, rows);
    }
  }

  level(id) { return this.levels[id] || 1; }
  value(id) { const r = this.tracks.get(id); return r ? r[Math.min(this.level(id), r.length) - 1].v : 0; }
  max(id) { return (this.tracks.get(id) || []).length; }
  nextCost(id) { const r = this.tracks.get(id); const l = this.level(id); return r && l < r.length ? r[l].cost : -1; }
}

// A pad's local frame for "is the player standing on it".
function padFrame(pad) {
  const m = compose([pad.center.x, 0, pad.center.z], [0, Math.sin(pad.yaw / 2), 0, Math.cos(pad.yaw / 2)]);
  return { inv: invertAffine(m), w: pad.w, d: pad.d };
}
const onPad = (f, p) => { const l = apply(f.inv, { x: p.x, y: 0, z: p.z }); return Math.abs(l.x) <= f.w / 2 && Math.abs(l.z) <= f.d / 2; };

export class Sim {
  constructor(world, config, save = null, mapId = 0) {
    this.world = world;
    this.mapId = mapId;
    this.config = config;
    const s = save || {};
    this.state = {
      coins: s.coins ?? 0, gems: s.gems ?? 0, exp: s.exp ?? 0, level: s.level ?? 1,
      bought: s.bought || {}, paid: s.paid || {}, up: s.up || {}, guideMoney: s.guideMoney || false,
      stock: s.stock || {}, piles: s.piles || {}, firstTruck: s.firstTruck || false,
      player: s.player || { x: -1.5, z: 9, dir: 0 }, packItems: s.packItems || [], t: 0,
      hired: s.hired || {}, empLv: s.empLv || {}, stars: s.stars || {}, starAd: s.starAd || {}, task: s.task || 0,
      guide: s.guide || null, clock: s.clock || 0, boost: s.boost, bonus: s.bonus, order: s.order, town: s.town,
    };
    this.events = [];
    this.up = new Upgrades(config, this.state.up);
    this.role = config.RoleConf.find(r => r.Id === 1);
    this.pack = new Pack(this.up.value(this.role.PackUpId), this.state.packItems);
    this.state.packItems = this.pack.items;
    this.playerRole = { pack: this.pack };
    this.forest = new Forest(world.trees);
    this.levels = config.PlayerLevelUpgradeConf.filter(r => r.MapId === mapId);
    this.factoryConf = new Map(config.FactoryConf.map(r => [r.Id, r]));
    this.pads = new Map();
    for (const b of world.buildings.values()) if (b.pad) this.pads.set(b.id, padFrame(b.pad));
    this.padSpd = PAD.init;
    this.onPadId = null;
    this.machines = new Map(); // factory id -> { busy: seconds left or -1, poll }
    this.trucks = new Map(); // station id -> [{ cap, load, phase, pos, t }]
    this.stepAcc = 0;
    this.swingT = 0;
    this.chopping = false;
    this.mover = null;
    this.shown = () => true;
    settle(world, this.state);
    this.crew = new Crew(this);
    this.missions = new Missions(this);
    this.guide = new Guide(this);
    this.extras = new Extras(this);
    this.town = new Town(this);
    this.research = new Map();
    for (const r of config.ResearchUpgradeConf) {
      if (!this.research.has(r.BuildingId)) this.research.set(r.BuildingId, []);
      this.research.get(r.BuildingId).push(r);
    }
    for (const rows of this.research.values()) rows.sort((a, b) => a.Progress - b.Progress);
  }

  // ---- research stars ("Modify", ResearchUpgradeConf; rules/economy.md C20): 4 stars per machine or station, each
  // adding income per item, cutting seconds per item (the cumulative ProdSpdAddUI column) and output room.
  stars(id) { return this.state.stars[id] || 0; }
  starRow(id, n = this.stars(id)) { const r = this.research.get(id); return r && n > 0 ? r[Math.min(n, r.length) - 1] : null; }
  nextStar(id) { const r = this.research.get(id); return r ? r[this.stars(id)] || null : null; }
  starBlocked(id) {
    const r = this.nextStar(id);
    if (!r) return 'max';
    if (!this.active(id)) return 'locked';
    if (r.UnlockPreBuilding && (!this.active(r.UnlockPreBuilding) || this.stars(r.UnlockPreBuilding) < r.PreBuildingLevel)) return 'pre';
    if (this.state.level < r.UnlockPlayerLv) return 'level';
    return null;
  }
  buyStar(id) {
    const r = this.nextStar(id);
    if (this.starBlocked(id) || this.state.coins < r.Cost) return false;
    this.state.coins -= r.Cost;
    this.gainStar(id);
    return true;
  }
  // The star is paid on the research frame like an unlock pad (ResearchUpgadeRecorder.UpdateNeed); UpgradeBuildingStarPanel
  // then offers the machine for it: the normal one, or the senior one (the "Ad" columns) for 10 gems or an ad.
  gainStar(id) {
    delete this.state.paid[`r${id}`];
    this.state.stars[id] = this.stars(id) + 1;
    this.state.starAd[id] = false;
    this.addExp(4); // UpgradeFactory exp (EC 28)
    this.emit({ type: 'star', id, stars: this.stars(id) });
  }
  // UpgradeBuildingStarPanel_Item.OnClickChoice: 0 normal, 1 senior for 10 gems, 2 senior for an ad (the hub grants it at once).
  chooseMachine(id, index) {
    const r = this.starRow(id);
    if (!r || this.state.starAd[id]) return false;
    if (index === 0) return true;
    if (index === 1) {
      if (this.state.gems < STAR_GEMS) return false;
      this.state.gems -= STAR_GEMS;
    }
    this.state.starAd[id] = index; // which senior look (NewPrefab slot 1 or 2)
    this.addExp(r.StarAddAd);
    this.emit({ type: 'machine', id });
    return true;
  }
  // A star column, or its senior-machine twin when that machine was chosen.
  starVal(id, col) {
    const r = this.starRow(id);
    return r ? r[this.state.starAd[id] ? STAR_AD[col] : col] : 0;
  }
  outCap(id) { return FACTORY.out + this.starVal(id, 'CapacitAdd'); }

  // ---- world services for roles (player and workers)
  moveBody(o, dx, dz) {
    if (this.mover) this.mover.step(o, dx, dz, this.shown, 0.35);
    else { o.x += dx; o.z += dz; }
  }

  // The forest a work line chops: line 1 (and 0) -> forest building 1.
  lineForest(line) {
    const forests = [...this.world.buildings.values()].filter(b => b.kind === 'forest' && this.active(b.id));
    return (forests.find(f => f.line === line) || forests[0] || { id: 1 }).id;
  }

  // FarmMgr.GetCarryInBuildingId: an active building of the line that takes this item and has room.
  carryIn(type, line) {
    let best = null;
    for (const b of this.world.buildings.values()) {
      if (!this.active(b.id) || b.line !== line) continue;
      if (b.kind === 'factory' && b.typeIn === type && this.stock(`${b.id}:in`) < FACTORY.in) {
        if (!best || this.stock(`${b.id}:in`) < this.stock(`${best.id}:in`)) best = b;
      } else if (b.kind === 'warehouse' && b.type === type && this.stock(`${b.id}:in`) < STORE_CAP && !best) best = b;
    }
    return best;
  }

  // FarmMgr.GetCarryOutBuildingId: the fullest output of the line holding one of these items, in preference order.
  carryOut(types, line) {
    for (const type of types) {
      let best = null;
      for (const b of this.world.buildings.values()) {
        if (b.kind !== 'factory' || !this.active(b.id) || b.line !== line || b.typeOut !== type) continue;
        if (this.stock(`${b.id}:out`) > 0 && this.carryIn(type, line) && (!best || this.stock(`${b.id}:out`) > this.stock(`${best.id}:out`))) best = b;
      }
      if (best) return best;
    }
    return null;
  }

  station(line) {
    return [...this.world.buildings.values()].find(b => b.kind === 'truckStation' && b.line === line && this.active(b.id)) || null;
  }

  // One item from a role's pack into a building (machine input pays its income at deposit, EC 15).
  deposit(b, pack) {
    if (b.kind === 'factory') {
      if (this.stock(`${b.id}:in`) >= FACTORY.in || !pack.take(b.typeIn)) return false;
      this.addStock(`${b.id}:in`, 1);
      this.pileAdd(b.id, this.income(b.id));
    } else if (b.kind === 'warehouse') {
      if (this.stock(`${b.id}:in`) >= STORE_CAP || !pack.take(b.type)) return false;
      this.addStock(`${b.id}:in`, 1);
    } else return false;
    this.emit({ type: 'deposit', id: b.id, item: b.typeIn || b.type });
    return true;
  }

  take(b, pack) {
    if (b.kind !== 'factory' || this.stock(`${b.id}:out`) <= 0 || pack.full) return false;
    this.addStock(`${b.id}:out`, -1);
    pack.add(b.typeOut);
    this.emit({ type: 'pickup', id: b.id, item: b.typeOut });
    return true;
  }

  status(b) { return statusOf(b, this.state); }
  active(id) { return !!this.state.bought[id]; }
  stock(key) { return this.state.stock[key] || 0; }
  addStock(key, n) { this.state.stock[key] = this.stock(key) + n; }
  emit(e) { this.events.push(e); }

  // ---- economy helpers
  earn(n, why) { this.state.coins += n; this.emit({ type: 'coins', n, why }); }
  pileAdd(id, n) { this.state.piles[id] = (this.state.piles[id] || 0) + n; this.emit({ type: 'pile', id, n }); }
  addExp(n) {
    const s = this.state;
    s.exp += n;
    const row = this.levels[s.level - 1];
    // One level per call; surplus waits for the next gain (EC 29).
    if (row && s.level < this.levels.length && s.exp >= row.NeedExp) {
      s.exp -= row.NeedExp;
      s.level++;
      this.earn(row.LevelUpRewardCoin, 'levelUp');
      if (row.LevelUpRewardGas) this.extras.addGas(row.LevelUpRewardGas); // into the gas station (X 13)
      this.emit({ type: 'levelUp', level: s.level, reward: row.LevelUpRewardCoin });
      this.recheck();
    }
  }
  needExp() { const r = this.levels[this.state.level - 1]; return r ? r.NeedExp : 0; }

  recheck() {
    for (const id of settle(this.world, this.state)) this.emit({ type: 'unlock', id, free: true });
    this.emit({ type: 'status' });
  }

  buy(b) {
    this.state.bought[b.id] = true;
    delete this.state.paid[b.id];
    this.emit({ type: 'unlock', id: b.id });
    if (b.kind === 'factory') this.addExp(EXP.unlockBuilding);
    this.recheck();
  }

  // ---- player
  get speed() { return this.up.value(this.role.SpdUpId) + this.extras.speedAdd(); }
  get damage() { return this.up.value(this.role.ToolUpId); }

  buyUpgrade(id) {
    const cost = this.up.nextCost(id);
    if (cost < 0 || this.state.coins < cost) return false;
    this.state.coins -= cost;
    this.state.up[id] = this.up.level(id) + 1;
    this.pack.max = this.up.value(this.role.PackUpId);
    this.addExp(2); // PlayerUpgrade (EC 28)
    this.emit({ type: 'upgrade', id });
    return true;
  }

  // ---- per frame
  tick(dt, moving, mover, shown) {
    const e0 = this.events.length;
    this.rules(dt, moving, mover, shown);
    this.guide.tick(dt, this.events.slice(e0));
  }

  rules(dt, moving, mover, shown) {
    const s = this.state;
    s.t += dt;
    const p = s.player;
    const idle = !moving;
    const ev = this.events;

    // Chopping: an idle player next to a choppable tree swings; each swing hits every tree in reach (CC B2-B3).
    const forestOpen = id => id == null || this.active(id);
    const targets = this.forest.choppable(p, forestOpen);
    this.chopping = idle && targets.length > 0 && !this.pack.full;
    if (this.chopping) {
      this.swingT += dt;
      if (this.swingT >= SWING) {
        this.swingT -= SWING;
        this.forest.swing(p, this.damage, forestOpen, ev, this.playerRole);
      }
    } else {
      this.swingT = SWING * 0.56; // the clip's hit event sits at 0.735 / 1.667 of the swing
    }
    this.forest.tick(dt, (tree, n) => {
      const pack = (tree.chopper || this.playerRole).pack;
      let took = 0;
      while (took < n && !pack.full) { pack.add(WOOD); took++; }
      return took;
    }, ev);
    this.crew.tick(dt);
    this.extras.tick(dt, p, idle);
    this.town.tick(dt, p, idle);
    if (this.forest.near(p, 1.2).some(t => t.ground > 0)) {
      const got = this.forest.pickup(p, this.pack.room, ev);
      for (let i = 0; i < got; i++) this.pack.add(WOOD);
    }

    // Fixed-step transfers (pads, deposits, pickups) at 50 per second.
    this.stepAcc += dt;
    while (this.stepAcc >= STEP) {
      this.stepAcc -= STEP;
      this.fixedStep(p, idle);
    }

    this.tickMachines(dt);
    this.tickTrucks(dt);
    const z = this.zoneAt(p);
    const key = z ? `${z.kind}:${z.id}` : null;
    if (key !== this.zoneKey) {
      this.zoneKey = key;
      this.emit({ type: 'zone', zone: z });
    }
  }

  // The panel zone the player stands in: a worker hut or the player cabin.
  zoneAt(p) {
    for (const b of this.world.buildings.values()) {
      if (!this.active(b.id)) continue;
      if ((b.kind === 'employeeHouse' || b.kind === 'playerHouse') && b.showBox && b.showBox.contains(p, 0.3)) return { id: b.id, kind: b.kind };
      if (b.kind === 'bike' && !this.extras.riding && b.funcBox && b.funcBox.contains(p, 0.3)) return { id: b.id, kind: b.kind };
      if (b.kind === 'uav' && !this.extras.flying && b.funcBox && b.funcBox.contains(p, 0.3)) return { id: b.id, kind: b.kind };
      if (b.kind === 'special' && b.workerType !== 3 && !this.crew.special(b.id) && b.manBox && b.manBox.contains(p, 0.3)) return { id: b.id, kind: b.kind };
      if (b.kind === 'construction' && b.enterBox && b.enterBox.contains(p, 0.3)) return { id: b.id, kind: b.kind };
      if (b.kind === 'orderMan' && this.extras.orderDone() && b.manBox && b.manBox.contains(p, 0.3)) return { id: b.id, kind: b.kind };
    }
    return null;
  }

  // What the player pays into where they stand: an open unlock pad, or the research frame of a machine whose next star
  // is open. Partial payments stay in state.paid under the building id, or r<id> for a star.
  payTarget(p) {
    for (const [id, f] of this.pads) {
      const b = this.world.buildings.get(id);
      if (onPad(f, p) && this.status(b) === 'locked') return { key: id, cost: b.cost, done: () => this.buy(b) };
    }
    for (const b of this.world.buildings.values()) {
      if (!b.researchBox || !this.research.has(b.id) || this.starBlocked(b.id) || !b.researchBox.contains(p)) continue;
      return { key: `r${b.id}`, cost: this.nextStar(b.id).Cost, done: () => this.gainStar(b.id) };
    }
    return null;
  }

  fixedStep(p, idle) {
    const s = this.state;
    // Unlock pad (EC 6-8): pay = ceil(min(coins, remaining) * min(spd, 0.5)); spd ramps 0.004 per step from 0.01.
    const on = this.payTarget(p);
    if ((on && on.key) !== this.onPadId) { this.padSpd = PAD.init; this.onPadId = on && on.key; }
    if (on && idle) {
      this.padSpd += PAD.inc;
      const remaining = on.cost - (s.paid[on.key] || 0);
      const pay = Math.ceil(Math.min(s.coins, remaining) * Math.min(this.padSpd, PAD.cap));
      if (pay > 0) {
        s.coins -= pay;
        s.paid[on.key] = (s.paid[on.key] || 0) + pay;
        this.emit({ type: 'padPay', id: on.key, n: pay });
        if (s.paid[on.key] >= on.cost) on.done();
      }
    }
    if (!idle) return;

    for (const b of this.world.buildings.values()) {
      if (!this.active(b.id)) continue;
      if (b.kind === 'guideMoney') {
        if (!s.guideMoney && b.moneyBox && b.moneyBox.contains(p, 0.4)) {
          s.guideMoney = true;
          this.earn(b.amount, 'guide');
          this.emit({ type: 'status' });
        }
      } else if (b.kind === 'factory') {
        // Deposit one input item per step; income is paid at deposit into the factory's pile (EC 13, 15).
        if (b.inBox && b.inBox.contains(p, 0.4) && this.stock(`${b.id}:in`) < FACTORY.in && this.pack.take(b.typeIn)) {
          this.addStock(`${b.id}:in`, 1);
          this.pileAdd(b.id, this.income(b.id));
          this.emit({ type: 'deposit', id: b.id, item: b.typeIn });
        }
        if (b.outBox && b.outBox.contains(p, 0.4) && this.stock(`${b.id}:out`) > 0 && !this.pack.full) {
          this.addStock(`${b.id}:out`, -1);
          this.pack.add(b.typeOut);
          this.emit({ type: 'pickup', id: b.id, item: b.typeOut });
        }
        if (b.moneyBox && b.moneyBox.contains(p, 0.4)) this.collect(b.id);
      } else if (b.kind === 'warehouse') {
        if (b.inBox && b.inBox.contains(p, 0.4) && this.stock(`${b.id}:in`) < STORE_CAP && this.pack.take(b.type)) {
          this.addStock(`${b.id}:in`, 1);
          this.emit({ type: 'deposit', id: b.id, item: b.type });
        }
        // Build store 30 only lets squares out (H B7).
        if (!b.inBox && b.outBox && b.outBox.contains(p, 0.4) && this.stock(`${b.id}:in`) > 0 && !this.pack.full) {
          this.addStock(`${b.id}:in`, -1);
          this.pack.add(b.type);
          this.emit({ type: 'pickup', id: b.id, item: b.type });
        }
      } else if (b.kind === 'truckStation') {
        if (b.exitBox && b.exitBox.contains(p, 0.4)) this.collect(b.id);
      } else if (b.kind === 'uav') {
        if (b.moneyBox && b.moneyBox.contains(p, 0.4)) this.collect(b.id);
      }
    }
  }

  collect(id) {
    const n = Math.floor(this.state.piles[id] || 0);
    if (n <= 0) return;
    this.state.piles[id] = 0;
    this.earn(n, 'pile');
    this.emit({ type: 'collect', id, n });
  }

  income(id) {
    const c = this.factoryConf.get(id);
    // Residents' MachineRevenue buff multiplies it (H G4).
    return ((c ? this.up.value(c.IncomeUpId) : 0) + this.starVal(id, 'IncomeAdd')) * this.town.ratio.income;
  }

  duration(id) {
    const c = this.factoryConf.get(id);
    // A gas boost runs the machine 1.8x as fast (X 17).
    return Math.max(0.1, ((c ? this.up.value(c.EfficiencyUpId) : 6) - this.starVal(id, 'ProdSpdAddUI')) / this.extras.speedMul(id) / this.town.ratio.speed);
  }

  // One machine per factory: every 0.5 s it takes one input if output has room, then feeds (0.5 s) and processes
  // GetProdDuration seconds (EC 16-17).
  tickMachines(dt) {
    for (const b of this.world.buildings.values()) {
      if (b.kind !== 'factory' || !this.active(b.id)) continue;
      let m = this.machines.get(b.id);
      if (!m) { m = { left: -1, poll: 0 }; this.machines.set(b.id, m); }
      if (m.left >= 0) {
        m.left -= dt;
        if (m.left < 0) {
          this.addStock(`${b.id}:out`, 1);
          this.emit({ type: 'produced', id: b.id, item: b.typeOut });
        }
        continue;
      }
      m.poll -= dt;
      if (m.poll > 0) continue;
      m.poll = FACTORY.poll;
      if (this.stock(`${b.id}:in`) > 0 && this.stock(`${b.id}:out`) < this.outCap(b.id)) {
        this.addStock(`${b.id}:in`, -1);
        m.left = FACTORY.feed + this.duration(b.id);
        m.total = m.left;
        this.emit({ type: 'machineStart', id: b.id });
      }
    }
  }

  // Trucks queue along the in-segment; the front one stops at the bay (last waypoint) and is loaded while the player
  // stands at the counter, one item per 0.12 s from the station's store; full, it leaves on the out-segment and
  // pays capacity x income into the station's pile (EC 22-26). The very first truck ever carries 1.
  tickTrucks(dt) {
    const s = this.state;
    const p = s.player;
    for (const b of this.world.buildings.values()) {
      if (b.kind !== 'truckStation' || !this.active(b.id) || b.pathIn.length < 2) continue;
      let q = this.trucks.get(b.id);
      if (!q) { q = []; this.trucks.set(b.id, q); }
      while (q.filter(t => t.phase !== 'out').length < TRUCK.queue) {
        q.push({ phase: 'in', d: -q.length * TRUCK.gap - 8, load: 0, cap: 0, money: 0, t: 0, model: Math.floor(Math.random() * 3) });
      }
      const len = pathLen(b.pathIn);
      const waiting = q.filter(t => t.phase !== 'out');
      waiting.forEach((t, i) => {
        const stop = len - i * TRUCK.gap;
        if (t.phase === 'in') {
          t.d = Math.min(stop, t.d + TRUCK.speed * dt);
          if (i === 0 && t.d >= len - 1e-3) {
            t.phase = 'bay';
            t.cap = !s.firstTruck ? 1 : Math.trunc(TRUCK.base * this.levels[s.level - 1].CarCapacityRatio);
            t.t = TRUCK.leadIn;
            this.emit({ type: 'truckArrive', id: b.id, cap: t.cap });
          }
        } else if (t.phase === 'bay') {
          const there = (b.inBox && b.inBox.contains(p, 0.4)) || this.crew.workers.some(w => w.atCounter === b.id);
          const store = b.storeId;
          if (there && t.load < t.cap && this.stock(`${store}:in`) > 0) {
            t.t -= dt;
            if (t.t <= 0) {
              t.t = TRUCK.load;
              this.addStock(`${store}:in`, -1);
              t.load++;
              t.money += this.truckIncome(b.id);
              this.emit({ type: 'truckLoad', id: b.id, load: t.load, cap: t.cap });
            }
          }
          if (t.load >= t.cap) {
            t.phase = 'out';
            t.d = 0;
            s.firstTruck = true;
            this.pileAdd(b.id, t.money);
            this.emit({ type: 'truckGo', id: b.id, money: t.money });
            this.town.truckSold(t.load);
          }
        }
      });
      for (const t of q) if (t.phase === 'out') t.d += TRUCK.speed * 2 * dt;
      const outLen = pathLen(b.pathOut);
      for (let i = q.length - 1; i >= 0; i--) if (q[i].phase === 'out' && q[i].d > outLen) q.splice(i, 1);
    }
  }

  truckIncome(id) {
    const c = this.factoryConf.get(id);
    return (c ? this.up.value(c.IncomeUpId) : 20) + this.starVal(id, 'IncomeAdd');
  }

  save() {
    const s = this.state;
    return { v: 1, coins: s.coins, gems: s.gems, exp: s.exp, level: s.level, bought: s.bought, paid: s.paid, up: s.up,
      guideMoney: s.guideMoney, stock: s.stock, piles: s.piles, firstTruck: s.firstTruck, player: s.player,
      packItems: this.pack.items, hired: s.hired, empLv: s.empLv, stars: s.stars, starAd: s.starAd, task: s.task,
      guide: s.guide, clock: s.clock, boost: s.boost, bonus: s.bonus, order: s.order, town: s.town };
  }
}

export function pathLen(path) {
  let l = 0;
  for (let i = 1; i < path.length; i++) l += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
  return l;
}

export function pathAt(path, d) {
  if (d <= 0) {
    const a = path[0], b = path[1];
    const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: a.x + (b.x - a.x) / L * d, z: a.z + (b.z - a.z) / L * d, dir: Math.atan2(b.x - a.x, b.z - a.z) };
  }
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    if (d <= L || i === path.length - 1) {
      const k = L ? Math.min(d, L) / L : 0;
      return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, dir: Math.atan2(b.x - a.x, b.z - a.z) };
    }
    d -= L;
  }
  return { ...path[path.length - 1], dir: 0 };
}
