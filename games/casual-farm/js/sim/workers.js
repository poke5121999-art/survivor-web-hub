// Staff (PlayerWorkerAgentController / PlayerWorkerFarmController / PlayerWorkerChefController / WorkerCashierController).
// Lists, speeds and rates come from the scene; the decision loop is reconstructed (rules/customers.md: the shelver's
// target rule did not decompile) as: pick the emptiest target that one of my sources can feed, fill up, deliver, pause.
import { UPGRADE } from './sim.js';
import { BOOST } from './boosters.js';

const RADIUS = 1;
const PAUSE = 0.5;               // pauseAfterCompletingJob

export class Workers {
  constructor(sim, nav) {
    this.sim = sim;
    this.nav = nav;
    const s = sim.store;
    const prodByNode = new Map(s.producers.map((p, i) => [p.node, i]));
    const shelfByNode = new Map(s.shelves.map((x, i) => [x.node, i]));
    const cashByNode = new Map(s.cashiers.map((x, i) => [x.node, i]));
    const pm = s.comp(s.node('PROGRESS MANAGER'), 'ProgressManager') || {};
    const rest = key => (pm[key] || []).filter(r => r && r.n != null).map(r => s.pos(r.n));
    this.defs = [];
    s.nodes.forEach((n, i) => {
      const k = n.k || {};
      const cls = ['PlayerWorkerAgentController', 'PlayerWorkerFarmController', 'PlayerWorkerChefController'].find(c => k[c]);
      if (cls) {
        const f = k[cls];
        const role = cls === 'PlayerWorkerFarmController' ? 'farmer' : cls === 'PlayerWorkerChefController' ? 'chef' : 'shelver';
        const nodesOf = list => (list || []).map(r => r && r.n).filter(x => x != null);
        let sources = [...new Set(nodesOf(f.factorySourceList).map(j => prodByNode.get(j)).filter(x => x != null))];
        let shelves = nodesOf(f.shelfList).map(j => shelfByNode.get(j)).filter(x => x != null);
        let feeds = nodesOf(f.factoryDropOffList).map(j => prodByNode.get(j)).filter(x => x != null);
        // CheckOnFactorySourceAndDropOffList (rules/csv-worker-jobs.md): CSV-built marts leave the lists empty and the
        // worker fills them from responsibleObjectTypeList R over every shelf and factory of the scene. Shelver: the first
        // shelf of each type in R, sources = factories making a type in R. Chef / farmer: drop-off = machines (factoryType
        // 1) / animals (2) making a type in R, sources = factories making one of their inputs.
        const R = f.responsibleObjectTypeList || [];
        const making = types => s.producers.map((p, j) => j).filter(j => types.includes(s.producers[j].out));
        if (R.length && role === 'shelver') {
          if (!shelves.length) shelves = R.map(t => s.shelves.findIndex(x => x.type === t)).filter(j => j >= 0);
          if (!sources.length) sources = [...new Set(making(R))];
        } else if (R.length) {
          if (!feeds.length) feeds = making(R).filter(j => s.producers[j].factoryType === (role === 'chef' ? 1 : 2));
          if (!sources.length) sources = [...new Set(feeds.flatMap(j => making(s.producers[j].ins || [])))];
        }
        this.defs.push({
          name: n.n, node: i, role, speed: f.speed, pick: f.pickupRate, drop: f.dropOffRate, sources, shelves, feeds,
          rest: role === 'farmer' ? rest('farmerRestTransform') : role === 'chef' ? rest('chefRestTransform') : rest('shelfRestTransform'),
          start: s.pos(i),
        });
      } else if (k.WorkerCashierController) {
        const ci = cashByNode.get(k.WorkerCashierController.cashierInstance && k.WorkerCashierController.cashierInstance.n);
        if (ci != null) this.defs.push({ name: n.n, node: i, role: 'cashier', cashier: ci, speed: 9, start: s.pos(i) });
      }
    });
    this.list = [];
    sim.state.workers = this.list;
    sim.store.workerNames = new Set(this.defs.filter(d => d.role !== 'cashier').map(d => d.name));
  }

  step(dt, sim) {
    for (const d of this.defs) {
      if (!this.list.some(w => w.name === d.name) && sim.isActive(d.name)) {
        const restIdx = this.defs.filter(o => o.role === d.role).indexOf(d);
        this.list.push({
          name: d.name, def: d, x: d.start.x, y: 0, z: d.start.z, dirX: 0, dirZ: 1, path: [], moving: false,
          carry: [], job: null, phase: 'idle', timer: 0, restAt: d.rest && d.rest.length ? d.rest[restIdx % d.rest.length] : d.start,
        });
        sim.emit({ type: 'workerSpawn', name: d.name });
      }
    }
    for (const w of this.list) {
      if (w.def.role === 'cashier') this.stepCashier(w, dt);
      else this.stepCarrier(w, dt);
    }
  }

  goTo(w, p) {
    w.path = this.nav ? this.nav.path({ x: w.x, y: w.y, z: w.z }, p) : [p];
  }

  walk(w, dt) {
    if (!w.path.length) { w.moving = false; return true; }
    const extra = this.sim.boosters && this.sim.boosters.on('worker') ? BOOST.worker : 0;
    // ProgressManager.UpdateWorkerSpeed: (speed + booster) x FasterWorker.
    const ab = (this.sim.abilities || {}).worker || 1;
    let budget = ((w.def.role === 'cashier' ? w.def.speed : UPGRADE.WORKER_SPEED[this.sim.workerLevel(w.name).speed]) + extra) * ab * dt;
    while (budget > 0 && w.path.length) {
      const p = w.path[0], dx = p.x - w.x, dz = p.z - w.z, d = Math.hypot(dx, dz);
      if (d <= budget) { w.x = p.x; w.z = p.z; w.path.shift(); budget -= d; } else {
        w.x += dx / d * budget; w.z += dz / d * budget; w.dirX = dx / d; w.dirZ = dz / d; budget = 0;
      }
    }
    w.moving = w.path.length > 0;
    return !w.moving;
  }

  stepCashier(w, dt) {
    const ci = w.def.cashier, desk = this.sim.store.cashiers[ci];
    if (w.phase === 'idle') { this.goTo(w, desk.workerSlot); w.phase = 'walk'; }
    if (w.phase === 'walk' && this.walk(w, dt)) {
      w.phase = 'work';
      const look = desk.boxSlot;
      const dx = look.x - w.x, dz = look.z - w.z, d = Math.hypot(dx, dz) || 1;
      w.dirX = dx / d; w.dirZ = dz / d;
      this.sim.state.cashiers[ci].worker = true;
      this.sim.emit({ type: 'workerAtDesk', name: w.name, cashier: ci });
    }
  }

  limit(w) {
    return Math.min(3 + this.sim.workerLevel(w.name).stack, 6);
  }

  // A job: deliver type T from source producer S to target (shelf index or producer index for feeding).
  chooseJob(w) {
    const sim = this.sim, s = sim.store, st = sim.state, d = w.def;
    const jobs = [];
    const sourceFor = type => d.sources.filter(i => sim.isActive(s.producers[i].name) && s.producers[i].out === type)
      .map(i => ({ i, n: st.producers[i].out.filter(x => x != null).length })).filter(o => o.n > 0)
      .sort((a, b) => b.n - a.n)[0];
    d.shelves.forEach(si => {
      const sh = s.shelves[si];
      if (!sim.isActive(sh.name)) return;
      const space = sh.slots.length - st.shelves[si].count;
      if (space <= 0) return;
      const src = sourceFor(sh.type);
      if (src) jobs.push({ kind: 'shelf', target: si, type: sh.type, source: src.i, fill: st.shelves[si].count / sh.slots.length });
    });
    d.feeds.forEach(pi => {
      const p = s.producers[pi];
      if (!sim.isActive(p.name)) return;
      p.ins.forEach(t => {
        const space = sim.inputSpace(pi, t);
        if (space <= 0) return;
        const src = sourceFor(t);
        if (src) jobs.push({ kind: 'feed', target: pi, type: t, source: src.i, fill: 1 - space / sim.limitOf(pi) });
      });
    });
    jobs.sort((a, b) => a.fill - b.fill);
    return jobs[0] || null;
  }

  targetZone(job) {
    const s = this.sim.store;
    return job.kind === 'shelf' ? s.shelves[job.target].zone : s.producers[job.target].inputs.find(x => x.type === job.type).zone;
  }

  stepCarrier(w, dt) {
    const sim = this.sim, s = sim.store, st = sim.state;
    const here = { x: w.x, y: 0, z: w.z };
    switch (w.phase) {
      case 'idle': {
        // PauseWorker: an idle worker walks to its rest spot and takes no job until resumed.
        w.job = sim.workerLevel(w.name).paused ? null : this.chooseJob(w);
        if (!w.job) {
          if (Math.hypot(w.restAt.x - w.x, w.restAt.z - w.z) > 1 && !w.path.length) this.goTo(w, w.restAt);
          this.walk(w, dt);
          return;
        }
        this.goTo(w, s.producers[w.job.source].outZone.middle);
        w.phase = 'toSource';
        break;
      }
      case 'toSource': {
        const zone = s.producers[w.job.source].outZone;
        if (zone.contains(here, RADIUS) || this.walk(w, dt)) { w.phase = 'pick'; w.timer = 0; }
        break;
      }
      case 'pick': {
        const ps = st.producers[w.job.source];
        w.timer += dt;
        if (w.timer < w.def.pick) break;
        w.timer = 0;
        let k = -1;
        for (let j = ps.out.length - 1; j >= 0; j--) if (ps.out[j] === w.job.type) { k = j; break; }
        const zone = this.targetZone(w.job);
        const room = w.job.kind === 'shelf' ? s.shelves[w.job.target].slots.length - st.shelves[w.job.target].count : sim.inputSpace(w.job.target, w.job.type);
        if (k < 0 || w.carry.length >= this.limit(w) || w.carry.length >= room) {
          if (!w.carry.length) { w.phase = 'idle'; break; }
          this.goTo(w, zone.middle);
          w.phase = 'toTarget';
          break;
        }
        ps.out[k] = null;
        w.carry.push(w.job.type);
        sim.emit({ type: 'workerPick', name: w.name, producer: w.job.source, slot: k, item: w.job.type, index: w.carry.length - 1 });
        if (!ps.busy) sim.tryStart(w.job.source);
        break;
      }
      case 'toTarget': {
        if (this.targetZone(w.job).contains(here, RADIUS) || this.walk(w, dt)) { w.phase = 'drop'; w.timer = 0; }
        break;
      }
      case 'drop': {
        w.timer += dt;
        if (w.timer < w.def.drop) break;
        w.timer = 0;
        const z = w.job.kind === 'shelf' ? { kind: 'shelf', i: w.job.target } : { kind: 'producer', i: w.job.target, type: w.job.type };
        if (!w.carry.length || !sim.accepts(z, w.carry[w.carry.length - 1])) {
          w.carry.length = 0;
          w.phase = 'pause';
          break;
        }
        const type = w.carry.pop();
        const slot = z.kind === 'shelf' ? st.shelves[z.i].count : (st.producers[z.i].inputs[type] || 0);
        sim.dropInto(z, type);
        sim.emit({ type: 'workerDrop', name: w.name, item: type, to: z, slot, from: w.carry.length });
        if (!w.carry.length) w.phase = 'pause';
        break;
      }
      case 'pause':
        w.timer += dt;
        if (w.timer >= PAUSE) { w.timer = 0; w.phase = 'idle'; }
        break;
      default:
        w.phase = 'idle';
    }
  }
}
