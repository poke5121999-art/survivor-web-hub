// Employees (rules/workers-guide-camera.md A): each hut hires up to 12 workers in EmployeeConf order; a worker's speed,
// pack and axe come from its EmployeeUpgradeConf level (1 or 2, gems). Lumberjacks (hut suffix 01) chop the forest and
// carry logs to the line's peeler; porters (suffix 02) carry peeled logs to the squarer and squares to the sell store,
// then stand at the truck counter so trucks load. Both retry after 1 s when there is nothing to do.
import { Pack } from './pack.js';
import { WOOD } from './forest.js';

export const ST = { SUBMIT: 0, CARRY: 1, SEARCH: 2, WORK: 3, REST: 4, WALK: 5 };
const MOVE_TREE_DIS = 0.3; // A4
const SWING = 1.6667 / 2.5; // same chop clip as the player (TimberManSO chopWood)
const IN_TICK = 0.05, OUT_TICK = 0.1; // BuildingItemEntrance / Exit components (CC F3)
const REST = 1.0;
const PEELED = 101, SQUARE = 102;
const SPECIAL = { life: 180, gems: 10, timber: { speed: 3.4, pack: 12, dmg: 100 }, carrier: { speed: 4.0, pack: 12, dmg: 0 } };

export class Crew {
  constructor(sim) {
    this.sim = sim;
    const c = sim.config;
    this.rows = new Map();
    for (const r of c.EmployeeConf) {
      if (!this.rows.has(r.BuildingId)) this.rows.set(r.BuildingId, []);
      this.rows.get(r.BuildingId).push(r);
    }
    this.levelRows = new Map();
    for (const r of c.EmployeeUpgradeConf) {
      if (!this.levelRows.has(r.UpgradeId)) this.levelRows.set(r.UpgradeId, []);
      this.levelRows.get(r.UpgradeId).push(r);
    }
    const tbl = (name, field) => {
      const m = new Map();
      for (const r of c[name]) {
        if (!m.has(r.UpgradeId)) m.set(r.UpgradeId, []);
        m.get(r.UpgradeId).push(r[field]);
      }
      return m;
    };
    this.speedT = tbl('MoveSpdConf', 'Speed');
    this.packT = tbl('BackpackConf', 'Capacity');
    this.toolT = tbl('WorkerToolConf', 'Damage');
    const S = sim.state;
    S.hired = S.hired || {};
    S.empLv = S.empLv || {};
    this.workers = [];
    for (const [hut, n] of Object.entries(S.hired)) for (let i = 0; i < n; i++) this.spawn(+hut, i);
  }

  hutRows(hut) { return this.rows.get(hut) || []; }
  hired(hut) { return this.sim.state.hired[hut] || 0; }
  kind(hut) { return hut % 100 === 1 ? 'timber' : hut % 100 === 2 ? 'carrier' : 'builder'; }
  level(row) { return this.sim.state.empLv[row.Id] || 1; }

  // Only the next row in order can be hired (A2 6); CostType 1 = coins.
  hireCost(hut) {
    const row = this.hutRows(hut)[this.hired(hut)];
    return row ? row.CostNum : -1;
  }

  hire(hut) {
    const S = this.sim.state;
    const i = this.hired(hut);
    const row = this.hutRows(hut)[i];
    if (!row || !this.sim.active(hut) || S.coins < row.CostNum) return false;
    S.coins -= row.CostNum;
    S.hired[hut] = i + 1;
    this.spawn(hut, i);
    this.sim.addExp(4); // UnlockEmployee exp (EC 28)
    this.sim.emit({ type: 'hire', hut, index: i });
    return true;
  }

  upgradeCost(row) {
    const lv = this.level(row);
    const rows = this.levelRows.get(row.WorkerUpgradeId) || [];
    return lv < rows.length ? rows[lv].CostVal : -1;
  }

  upgrade(row) {
    const cost = this.upgradeCost(row);
    const S = this.sim.state;
    if (cost < 0 || S.gems < cost) return false;
    S.gems -= cost;
    S.empLv[row.Id] = this.level(row) + 1;
    const w = this.workers.find(x => x.row === row);
    if (w) this.stats(w);
    this.sim.emit({ type: 'empUpgrade', row: row.Id });
    return true;
  }

  stats(w) {
    const lv = this.level(w.row);
    const up = (this.levelRows.get(w.row.WorkerUpgradeId) || [])[lv - 1] || { SpdLv: 1, BackpackLv: 1, ToolLv: 1 };
    const pick = (t, id, l) => { const a = t.get(id) || []; return a[Math.max(0, Math.min(a.length, l) - 1)]; };
    w.speed = pick(this.speedT, w.row.SpdUpId, up.SpdLv) || 2;
    w.pack.max = pick(this.packT, w.row.WorkerPackUpId, up.BackpackLv) || 4;
    w.dmg = pick(this.toolT, w.row.ToolUpId, up.ToolLv) || 34;
    w.tool = up.ToolInfoId;
    w.buildTime = lv > 1 ? 1.2 : 1.5;
  }

  spawn(hut, index) {
    const row = this.hutRows(hut)[index];
    const b = this.sim.world.buildings.get(hut);
    if (!row || !b) return;
    const home = b.pad ? b.pad.center : b.pos;
    const w = { hut, index, row, kind: this.kind(hut), line: b.line, prefab: row.Prefab,
      x: home.x + (index % 3) - 1, z: home.z + 1 + Math.floor(index / 3) * 0.8, dir: 0,
      pack: new Pack(4), state: ST.SEARCH, rest: 0, target: null, tree: null, building: null, timer: 0, moving: false,
      stuck: 0, side: 0 };
    this.stats(w);
    this.workers.push(w);
  }

  // Super workers (SpecialWorkerCtrller spots, A 23-26): hired for an ad or 10 gems, fixed stats, gone after 180 s.
  special(spot) { return this.workers.find(w => w.spot === spot) || null; }

  hireSpecial(b, gems) {
    const S = this.sim.state;
    const kind = b.workerType === 1 ? 'timber' : b.workerType === 2 ? 'carrier' : null;
    if (!kind || this.special(b.id) || !this.sim.active(b.id)) return false;
    if (gems) {
      if (S.gems < SPECIAL.gems) return false;
      S.gems -= SPECIAL.gems;
    }
    const st = SPECIAL[kind];
    this.workers.push({ hut: b.id, spot: b.id, index: 0, row: null, kind, line: b.line, prefab: b.prefab, x: b.pos.x, z: b.pos.z, dir: 0,
      pack: new Pack(st.pack), speed: st.speed, dmg: st.dmg, left: SPECIAL.life, state: ST.SEARCH, rest: 0, target: null, tree: null,
      building: null, timer: 0, moving: false, stuck: 0, side: 0 });
    this.sim.emit({ type: 'special', id: b.id });
    return true;
  }

  tick(dt) {
    for (const w of this.workers) if (w.spot && (w.left -= dt) <= 0) { this.sim.forest.release(w); w.gone = true; }
    if (this.workers.some(w => w.gone)) this.workers = this.workers.filter(w => !w.gone);
    for (const w of this.workers) {
      w.moving = false;
      w.chopping = false;
      if (w.kind === 'timber') this.timber(w, dt);
      else if (w.kind === 'carrier') this.carrier(w, dt);
      else if (w.kind === 'builder') this.builder(w, dt);
    }
  }

  // Straight walk with the world's colliders; a blocked worker sidesteps for a moment.
  walk(w, to, dt, near = 0.3) {
    const dx = to.x - w.x, dz = to.z - w.z;
    const d = Math.hypot(dx, dz);
    if (d <= near) return true;
    const step = Math.min(d, w.speed * this.sim.town.ratio.workers * dt); // residents' WorkerSpeed buff (H G4)
    let mx = dx / d, mz = dz / d;
    if (w.side > 0) { w.side -= dt; const s = w.sideSign; [mx, mz] = [mx * 0.3 - mz * s, mz * 0.3 + mx * s]; }
    const bx = w.x, bz = w.z;
    this.sim.moveBody(w, mx * step, mz * step);
    const moved = Math.hypot(w.x - bx, w.z - bz);
    w.stuck = moved < step * 0.3 ? w.stuck + dt : 0;
    if (w.stuck > 0.4) { w.side = 0.7; w.sideSign = Math.random() < 0.5 ? 1 : -1; w.stuck = 0; }
    w.dir = Math.atan2(mx, mz);
    w.moving = true;
    return false;
  }

  rest(w) { w.state = ST.REST; w.rest = REST; }

  // Builder (EmpBuildCtrller, WG 22): while the site needs squares, fill the pack at build store 30, walk to the
  // site's builder spot and hand in one square per build time (1.5 s, 1.2 s at level 2).
  builder(w, dt) {
    const sim = this.sim, town = sim.town;
    const site = town.site, store = town.store;
    if (!site || !store || !town.needsBuilders()) { if (w.state !== ST.REST) this.rest(w); w.rest -= dt; if (w.rest <= 0) this.rest(w); return; }
    const key = town.storeKey();
    if (!w.pack.count || (w.state === ST.WORK && !w.pack.full && sim.stock(key) > 0)) {
      if (!this.walk(w, store.outBox.middle, dt, 1.2)) return;
      w.state = ST.WORK;
      w.timer -= dt;
      if (w.timer > 0) return;
      w.timer = OUT_TICK;
      if (!w.pack.full && sim.stock(key) > 0) { sim.addStock(key, -1); w.pack.add(SQUARE); return; }
      if (!w.pack.count) { this.rest(w); return; }
    }
    w.state = ST.SUBMIT;
    const spot = site.empPos != null ? sim.world.pos(site.empPos) : site.buildBox.middle;
    if (!this.walk(w, spot, dt, 0.5)) return;
    w.building = site;
    w.timer -= dt;
    if (w.timer > 0) return;
    w.timer = w.buildTime || 1.5;
    town.builderAdd(w.pack);
  }

  timber(w, dt) {
    const sim = this.sim;
    switch (w.state) {
      case ST.REST:
        w.rest -= dt;
        if (w.rest <= 0) w.state = ST.SEARCH;
        break;
      case ST.SEARCH: {
        if (w.pack.full) { w.state = ST.CARRY; break; }
        const tree = sim.forest.reserve(w, sim.lineForest(w.line));
        if (!tree) { this.rest(w); break; }
        w.tree = tree;
        const dx = w.x - tree.pos.x, dz = w.z - tree.pos.z, d = Math.hypot(dx, dz) || 1;
        w.target = { x: tree.pos.x + dx / d * (0.6 + MOVE_TREE_DIS), z: tree.pos.z + dz / d * (0.6 + MOVE_TREE_DIS) };
        w.state = ST.WALK;
        w.next = ST.WORK;
        break;
      }
      case ST.WALK:
        if (this.walk(w, w.target, dt, 0.25)) w.state = w.next;
        break;
      case ST.WORK: {
        const t = w.tree;
        if (!t || t.state !== 0) {
          if (t && t.state === 3) break; // falling: wait for the logs
          if (t && t.ground > 0) { const got = sim.forest.pickupTree(t, w.pack.room); for (let i = 0; i < got; i++) w.pack.add(WOOD); }
          sim.forest.release(w);
          w.tree = null;
          w.state = w.pack.full ? ST.CARRY : ST.SEARCH;
          break;
        }
        w.chopping = true;
        w.dir = Math.atan2(t.pos.x - w.x, t.pos.z - w.z);
        w.timer += dt;
        if (w.timer >= SWING) { w.timer -= SWING; sim.forest.hit(t, w.dmg, w, sim.events); }
        break;
      }
      case ST.CARRY: {
        const b = sim.carryIn(WOOD, w.line);
        if (!b) { this.rest(w); w.state = ST.REST; break; }
        w.building = b;
        w.target = b.inBox.middle;
        w.state = ST.SUBMIT;
        break;
      }
      case ST.SUBMIT: {
        const b = w.building;
        if (!this.walk(w, w.target, dt, 1.2)) break;
        w.timer -= dt;
        if (w.timer > 0) break;
        w.timer = IN_TICK;
        if (w.pack.count && sim.deposit(b, w.pack)) break;
        if (!w.pack.count) w.state = ST.SEARCH;
        else this.rest(w);
        break;
      }
      default:
        w.state = ST.SEARCH;
    }
  }

  // Porter: squares from a squarer to the sell store (then wait at the counter while trucks load), else peeled logs
  // from a peeler to a squarer.
  carrier(w, dt) {
    const sim = this.sim;
    switch (w.state) {
      case ST.REST:
        w.rest -= dt;
        if (w.rest <= 0) w.state = ST.SEARCH;
        break;
      case ST.SEARCH: {
        if (w.pack.count) { w.state = ST.CARRY; break; }
        const src = sim.carryOut([SQUARE, PEELED], w.line);
        if (!src) { this.counter(w) || this.rest(w); break; }
        w.building = src;
        w.target = src.outBox.middle;
        w.state = ST.WORK;
        break;
      }
      case ST.WORK: {
        if (!this.walk(w, w.target, dt, 1.2)) break;
        w.timer -= dt;
        if (w.timer > 0) break;
        w.timer = OUT_TICK;
        if (!w.pack.full && sim.take(w.building, w.pack)) break;
        w.state = w.pack.count ? ST.CARRY : ST.SEARCH;
        break;
      }
      case ST.CARRY: {
        const type = w.pack.items[w.pack.items.length - 1];
        const b = sim.carryIn(type, w.line);
        if (!b) { this.rest(w); break; }
        w.building = b;
        w.target = b.inBox.middle;
        w.state = ST.SUBMIT;
        break;
      }
      case ST.SUBMIT: {
        if (!this.walk(w, w.target, dt, 1.2)) break;
        w.timer -= dt;
        if (w.timer > 0) break;
        w.timer = IN_TICK;
        if (w.pack.count && sim.deposit(w.building, w.pack)) break;
        if (w.pack.count) { this.rest(w); break; }
        w.state = ST.SEARCH;
        if (w.building.kind === 'warehouse') this.counter(w);
        break;
      }
      case ST.WALK:
        if (this.walk(w, w.target, dt, 0.4)) { w.state = ST.REST; w.rest = 4; w.atCounter = w.station; }
        break;
      default:
        w.state = ST.SEARCH;
    }
    if (w.state !== ST.REST) w.atCounter = null;
  }

  // Stand at the line's truck counter so waiting trucks load (EC 23: player OR a worker in the trigger).
  counter(w) {
    const st = this.sim.station(w.line);
    if (!st || !this.sim.stock(`${st.storeId}:in`)) return false;
    w.station = st.id;
    w.target = st.inBox.middle;
    w.state = ST.WALK;
    return true;
  }

  save() { return null; }
}
