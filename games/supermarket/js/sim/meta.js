// Drop 3 rules mixed into Sim: missions (main + daily), Fund level rewards, staff, daily price drift.
import { LAYOUT, slotById } from './layout.js';

const COUNTED = new Set([200002, 200003, 200004, 200007, 200012, 200013, 200014, 200015, 200019]);
// C# Math.Round(double) rounds half to even
const roundEven = x => { const f = Math.floor(x), d = x - f; return d > 0.5 || (d === 0.5 && f % 2 === 1) ? f + 1 : f; };

export const Meta = {
  // ---- missions --------------------------------------------------------------------------------------------------
  initMeta() {
    const s = this.s;
    s.energy ??= 0; s.fundClaimed ??= []; s.staff ??= { cashier: 0, clerk: 0 }; s.clerk ??= null;
    s.pw ??= null; s.pwHist ??= {};
    if (!s.tasks) s.tasks = { main: { id: this.data.missions.main[0].id, p: 0 }, daily: [], dailyDay: 0 };
    if (s.tasks.dailyDay !== s.day) this.rollDaily();
    this.refreshPrices();
  },
  taskDef(id) { const M = this.data.missions; return M.main.find(t => t.id === id) || M.daily.find(t => t.id === id); },
  target(cond) {
    const [type, ...a] = cond;
    if (type === 100001) return a[0];
    if (type === 200005 || type === 200009) return 1;
    return a[a.length - 1];
  },
  progressOf(task) { // live value for state conditions, counted value otherwise
    const t = this.taskDef(task.id), type = t.cond[0];
    if (type === 100001) return this.level;
    if (type === 200005) return this.s.licenses.some(id => this.lic(id) && this.lic(id).kind === 'product') ? 1 : 0;
    return task.p;
  },
  taskReady(task) { return task && !task.claimed && this.progressOf(task) >= this.target(this.taskDef(task.id).cond); },
  track(type, arg, n = 1) {
    const T = this.s.tasks; if (!T) return;
    const all = [T.main, ...T.daily].filter(x => x && x.id);
    for (const task of all) {
      if (task.claimed) continue;
      const c = this.taskDef(task.id).cond;
      if (c[0] !== type) continue;
      if (type === 200009) { task.p = 1; continue; }
      if (!COUNTED.has(type)) continue;
      if ((type === 200004 || type === 200007 || type === 200015) && c[1] !== arg) continue;
      task.p += n;
    }
  },
  taskText(task) {
    const t = this.taskDef(task.id), [type, ...a] = t.cond, target = this.target(t.cond), p = Math.min(this.progressOf(task), target);
    const furn = { 302: 'White shelves', 303: 'a Small refrigerator', 305: 'Yellow shelves' }, shop = { 102: 'furniture', 203: 'staff', 201: 'licenses', 202: 'sections' };
    switch (type) {
      case 100001: return `Reach store level ${target}`;
      case 200002: return `Order product boxes`;
      case 200003: return `Perform checkouts`;
      case 200004: return `Buy ${shop[a[0]] || 'items'} on the computer`;
      case 200005: return `Own a product license`;
      case 200007: return `Buy ${furn[a[0]] || 'furniture'}`;
      case 200009: return `Start a new day`;
      case 200012: return `Adjust prices`;
      case 200013: return `Use fast delivery`;
      case 200014: return `Throw away empty boxes`;
      case 200015: return `Hire a cashier`;
      case 200019: return `Earn $${target / 100}`;
      default: return this.data.missions.text[type] || String(type);
    }
  },
  taskProgress(task) { const t = this.taskDef(task.id), target = this.target(t.cond); return { p: Math.min(this.progressOf(task), target), target }; },
  claimTask(id) {
    const T = this.s.tasks;
    const task = T.main.id === id ? T.main : T.daily.find(x => x.id === id);
    if (!task || !this.taskReady(task)) return { ok: false, why: 'not finished' };
    const def = this.taskDef(id);
    const got = this.giveReward(def.reward);
    if (task === T.main) { T.main = def.next ? { id: def.next, p: 0 } : { id: 0, p: 0, claimed: true }; }
    else task.claimed = true;
    this.emit('taskDone', { id, got });
    return { ok: true, got };
  },
  // TaskSystem.StartDailyTask: 5 slots, slot i picks a group with weights Task_0i_weight, then a task of that group.
  rollDaily() {
    const M = this.data.missions, T = this.s.tasks, picked = [];
    for (const w of M.slotWeights) {
      let g = this.weighted(w.map((x, i) => [i + 1, x]));
      let pool = M.daily.filter(t => t.group === g && !picked.includes(t.id));
      if (!pool.length) pool = M.daily.filter(t => t.group === 3 && !picked.includes(t.id)); // group has only ads tasks here
      if (!pool.length) continue;
      picked.push(pool[this.ri(0, pool.length)].id);
    }
    T.daily = picked.map(id => ({ id, p: 0 })); T.dailyDay = this.s.day;
  },
  weighted(pairs) {
    const tot = pairs.reduce((a, [, w]) => a + w, 0); let r = this.rand() * tot;
    for (const [v, w] of pairs) { if ((r -= w) < 0) return v; }
    return pairs[pairs.length - 1][0];
  },
  giveReward(rid) {
    const r = this.data.rewards[String(rid)] || {}, got = [];
    if (r.cash) { this.s.money += r.cash; got.push(`$${(r.cash / 100).toFixed(0)}`); }
    if (r.energy) { this.s.energy += r.energy; got.push(`${r.energy}⚡`); }
    if (r.exp) { this.addExp(r.exp); got.push(`${r.exp} exp`); }
    for (const id of r.licenses || []) {
      if (!this.s.licenses.includes(id)) { this.s.licenses.push(id); this.emit(this.lic(id).kind === 'section' ? 'expand' : 'license', { id }); }
      got.push(this.lic(id).name);
    }
    for (const b of r.boxes || []) for (let i = 0; i < b.n; i++) {
      const pid = this.weighted(b.pool); this.addBox(pid, this.P.get(pid).load); got.push(`box of ${this.P.get(pid).name}`);
    }
    return got;
  },
  // ---- Fund (level track) --------------------------------------------------------------------------------------
  fundState(f) { return this.s.fundClaimed.includes(f.id) ? 'claimed' : this.level >= f.level ? 'ready' : 'locked'; },
  claimFund(id) {
    const f = this.data.fund.levels.find(x => x.id === id);
    if (!f || this.fundState(f) !== 'ready') return { ok: false, why: 'not ready' };
    this.s.fundClaimed.push(id);
    const got = this.giveReward(f.reward);
    this.emit('fund', { id, got });
    return { ok: true, got };
  },
  readyCount() {
    const T = this.s.tasks; let n = 0;
    if (T.main.id && this.taskReady(T.main)) n++;
    n += T.daily.filter(t => this.taskReady(t)).length;
    n += this.data.fund.levels.filter(f => this.fundState(f) === 'ready').length;
    return n;
  },
  // ---- staff ---------------------------------------------------------------------------------------------------
  hireState(kind) {
    const S = this.data.staff[kind];
    if (this.level < S.level) return `store level ${S.level}`;
    if (S.cost.cash && this.s.money < S.cost.cash) return 'not enough money';
    if (S.cost.energy && this.s.energy < S.cost.energy) return 'not enough energy';
    return 'hire';
  },
  hire(kind) {
    const st = this.hireState(kind); if (st !== 'hire') return { ok: false, why: st };
    const S = this.data.staff[kind];
    if (S.cost.cash) { this.s.money -= S.cost.cash; this.s.stats.salary += S.cost.cash; }
    if (S.cost.energy) this.s.energy -= S.cost.energy;
    this.s.staff[kind] += S.time; // AddTimeToNpc when already working, CreatANpcEmployer otherwise
    if (kind === 'clerk' && !this.s.clerk) this.s.clerk = { x: LAYOUT.door.x, z: LAYOUT.door.z - 0.6, state: 'idle', box: null, t: 0, path: [] };
    this.track(200015, S.npc); this.track(200004, 203);
    this.emit('hired', { kind });
    return { ok: true };
  },
  staffStep(dt) {
    const st = this.s.staff;
    for (const k of ['cashier', 'clerk']) if (st[k] > 0) { st[k] = Math.max(0, st[k] - dt); if (!st[k]) this.emit('staffEnd', { kind: k }); }
    // hired cashier works the register whenever the player is not standing at it (CashDeskLeaveForCheckerNode)
    const R = this.register;
    if (st.cashier > 0 && R && !this.playerAtRegister) {
      R.auto = (R.auto || 0) + dt;
      const per = this.data.staff.cashier.scanPerItem;
      while (R.phase === 'scan' && R.auto >= per) { R.auto -= per; this.scan(0); }
      if (this.register === R && R.phase === 'pay' && R.auto >= 1.0) this.finishSale(R.total); // ItemGetMoneyNode: exact amount
    }
    if (this.s.clerk) this.clerkStep(dt);
  },
  clerkWalk(c, dt) {
    const speed = c.speed || 1.35;
    const tgt = c.path.length ? c.path[0] : c.target; if (!tgt) return true;
    const dx = tgt.x - c.x, dz = tgt.z - c.z, d = Math.hypot(dx, dz);
    if (d < 0.05) { c.x = tgt.x; c.z = tgt.z; if (c.path.length) { c.path.shift(); return false; } return true; }
    const k = Math.min(1, speed * dt / d); c.x += dx * k; c.z += dz * k; c.dir = Math.atan2(dx, dz);
    return false;
  },
  clerkGo(c, dest) { c.path = LAYOUT.route(c, dest); c.target = dest; },
  clerkStep(dt) {
    const c = this.s.clerk, S = this.data.staff.clerk;
    c.speed ??= S.walk[0] + this.rand() * (S.walk[1] - S.walk[0]);
    const box = c.box ? this.box(c.box) : null;
    if (this.s.staff.clerk <= 0) { // time is up: leave the box where it is and go
      if (box) { box.where = 'floor'; box.x = Math.round(c.x * 10) / 10; box.z = Math.round(c.z * 10) / 10; box.y = 0; }
      this.s.clerk = null; return;
    }
    switch (c.state) {
      case 'idle': {
        if ((c.t -= dt) > 0) break;
        // GetUnEmptyBoxNode + WorkerGetShelfNode: a non-empty floor box that some shelf layer can take
        const b = this.s.boxes.find(x => x.where === 'floor' && x.count > 0 && !this.s.boxes.some(o => o.where === 'floor' && o.x === x.x && o.z === x.z && o.y > x.y) && this.layerFor(x.pid));
        if (!b) { c.t = 1; break; }
        c.box = b.id; b.where = 'clerk'; c.state = 'toBox'; this.clerkGo(c, { x: b.x, z: b.z + 0.5 });
        break;
      }
      case 'toBox': if (this.clerkWalk(c, dt)) { c.state = 'toShelf'; c.t = 0.2; } break;
      case 'toShelf': {
        if (!c.dest) { const L = this.layerFor(box.pid); if (!L) { c.state = 'drop'; break; } c.dest = L; this.clerkGo(c, slotById(L.shelf, this.sections).front); }
        if (this.clerkWalk(c, dt)) { c.state = 'put'; c.t = S.putEvery; }
        break;
      }
      case 'put': {
        if ((c.t -= dt) > 0) break;
        c.t = S.putEvery;
        const sh = this.s.shelves.find(x => x.id === c.dest.shelf), li = c.dest.li, p = this.P.get(box.pid), L = sh.layers[li];
        if (box.count > 0 && (!L || !L.count || L.pid === box.pid) && (!L || L.pid !== box.pid || L.count < p.cap)) {
          if (!L || L.pid !== box.pid) sh.layers[li] = { pid: box.pid, count: 0 };
          sh.layers[li].count++; box.count--;
        } else if (box.count > 0) { c.dest = null; c.state = 'toShelf'; break; }
        if (box.count === 0) { c.dest = null; c.state = 'toTrash'; this.clerkGo(c, { x: LAYOUT.trash.x - 0.6, z: LAYOUT.trash.z }); }
        break;
      }
      case 'toTrash': if (this.clerkWalk(c, dt)) { this.s.boxes = this.s.boxes.filter(o => o.id !== c.box); c.box = null; c.state = 'idle'; c.t = 1; } break; // NpcThrowBoxNode
      case 'drop': { // no layer can take it any more: put it back on the floor
        if (box) { box.where = 'floor'; box.x = Math.round(c.x * 10) / 10; box.z = Math.round(c.z * 10) / 10; box.y = 0; }
        c.box = null; c.dest = null; c.state = 'idle'; c.t = 1; break;
      }
    }
  },
  layerFor(pid) { // first layer that already holds pid with room, else an empty layer of the right kind
    const p = this.P.get(pid);
    for (const sh of this.s.shelves) if (sh.kind === p.shelf) for (let li = 0; li < 4; li++) { const L = sh.layers[li]; if (L && L.count && L.pid === pid && L.count < p.cap) return { shelf: sh.id, li }; }
    for (const sh of this.s.shelves) if (sh.kind === p.shelf) for (let li = 0; li < 4; li++) { const L = sh.layers[li]; if (!L || !L.count) return { shelf: sh.id, li }; }
    return null;
  },
  // ---- price drift (ItemSystem.Refresh_Today_PriceData / CalculateDiscountData) ------------------------------
  priceWarOn() { return this.s.day >= this.data.priceWar.openDay; },
  refreshPrices() {
    const s = this.s;
    if (!this.priceWarOn()) { s.pw = null; return; }
    if (s.pw && s.pw.day === s.day) return;
    const PW = this.data.priceWar, yesterday = s.pw ? s.pw.list.map(x => x.pid) : [];
    const owned = this.catalogue().filter(p => this.unlocked(p.id)).map(p => p.id);
    const nextLic = this.data.licenses.find(L => L.kind === 'product' && !s.licenses.includes(L.id));
    const next = nextLic ? this.catalogue().filter(p => p.license === nextLic.id).map(p => p.id) : [];
    const n = this.ri(...PW.count);
    const pick = (k, from) => { const pool = from.filter(id => !yesterday.includes(id)), out = []; while (out.length < k && pool.length) out.push(pool.splice(this.ri(0, pool.length), 1)[0]); return out; };
    let ids;
    if (next.length) ids = [...pick(Math.min(roundEven(n * PW.ownedShare), owned.length), owned), ...pick(Math.min(roundEven(n * PW.nextShare), next.length), next)];
    else ids = pick(Math.min(n, owned.length), owned);
    const r2 = x => Math.round(x * 100) / 100;
    const list = ids.map(pid => {
      const p = this.P.get(pid);
      const cf = r2(this.rf(1 - p.costDrift[0] * 0.01, 1 + p.costDrift[1] * 0.01)), mf = r2(this.rf(1 - p.marketDrift[0] * 0.01, 1 + p.marketDrift[1] * 0.01));
      return { pid, cost: Math.floor(cf * p.cost), market: Math.max(p.min, Math.min(p.max, Math.floor(mf * p.rec))) };
    });
    s.pw = { day: s.day, list };
    for (const it of list) { const h = (s.pwHist[it.pid] ||= []); h.push([s.day, it.cost, it.market]); if (h.length > 7) h.shift(); }
    this.emit('prices', { n: list.length });
  },
  todayPrice(pid) { return this.s.pw ? this.s.pw.list.find(x => x.pid === pid) : null; },
};
