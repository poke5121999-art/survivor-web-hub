// Barn workers (WorkerController, RULES.md section 6): each hired worker works the open fields of its barn's World
// section (plant, water, harvest through the same FieldCell.Upgrade as the player), fills a purse of 50, carries it to
// the barn (Barn.AddToBarn, capped by capacity) and goes back. A full barn parks the worker until the player empties it.
import { RULES } from './farm.js';
import { route, standFor } from './path.js';

const lerp01 = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));

export class Workers {
  constructor(farm) {
    this.f = farm;
    this.list = [];
    for (const b of farm.barns) {
      b.d.workers.forEach((node, k) => {
        const w = farm.data.workers.find(x => x.node === node);
        this.list.push({ b, k, node, home: w ? { x: w.pos[0], z: w.pos[2] } : { x: b.d.pos[0], z: b.d.pos[2] },
          x: 0, z: 0, dirX: 0, dirZ: 1, state: 'off', purse: 0, crop: null, path: [], field: null, cell: null, moving: false, slow: false });
      });
    }
    this.sync();
  }

  hired(w) { return w.b.parcel?.open && w.b.workers[w.k] > 0; }

  sync() {
    for (const w of this.list) {
      if (this.hired(w) && w.state === 'off') {
        const d = w.b.d.dock || w.b.d.pos;
        Object.assign(w, { x: d[0], z: d[2], state: 'idle' });
        this.f.events.push({ type: 'worker', w: this.list.indexOf(w), hired: true });
      }
    }
  }

  speed(w) {
    const lvl = w.b.workers[w.k] - 1;
    return 3 * lerp01(RULES.workerSpeedMin, RULES.workerSpeedMax, lvl / RULES.workerLevels) * (w.slow ? RULES.fieldSlow : 1);
  }

  sectionFields(w) {
    const sec = w.b.parcel.d.sec;
    return this.f.fields.filter(fl => fl.parcel?.open && fl.parcel.d.sec === sec && (!w.purse || fl.crop === w.crop));
  }

  goTo(w, parcel, point) {
    const p = route(this.f, w.x, w.z, parcel);
    if (!p) return false;
    p.push(point);
    w.path = p;
    return true;
  }

  step(dt) {
    this.sync();
    for (const w of this.list) {
      if (w.state === 'off') continue;
      w.moving = false;
      if (w.path.length) { this.walk(w, dt); continue; }
      switch (w.state) {
        case 'idle': this.pickWork(w); break;
        case 'field': this.work(w, dt); break;
        case 'barn': this.deliver(w); break;
        case 'full': if (this.f.barnStock(w.b) < this.f.barnCapacity(w.b)) w.state = 'barn'; break;
        default: break;
      }
    }
  }

  walk(w, dt) {
    const t = w.path[0], dx = t.x - w.x, dz = t.z - w.z, l = Math.hypot(dx, dz);
    const sp = this.speed(w) * dt;
    w.moving = true;
    if (l <= sp) { w.x = t.x; w.z = t.z; w.path.shift(); }
    else { w.x += dx / l * sp; w.z += dz / l * sp; w.dirX = dx / l; w.dirZ = dz / l; }
    w.slow = this.f.fields.some(fl => fl.parcel?.open && Math.abs(w.x - fl.d.pos[0]) < 2.6 && Math.abs(w.z - fl.d.pos[2]) < 2.6);
  }

  pickWork(w) {
    if (w.purse >= RULES.workerPurse) { this.toBarn(w); return; }
    const fields = this.sectionFields(w).sort((a, b) => Math.hypot(a.d.pos[0] - w.x, a.d.pos[2] - w.z) - Math.hypot(b.d.pos[0] - w.x, b.d.pos[2] - w.z));
    for (const fl of fields) {
      const cells = fl.cells.filter(c => c.state === fl.state);
      if (!cells.length) continue;
      // JoinFarthestFieldCell spreads workers; we take a random cell of the field's current state
      const c = cells[Math.floor(this.f.rng() * cells.length)];
      if (this.goTo(w, fl.parcel, standFor(fl, c, w))) { w.state = 'field'; w.field = fl; w.cell = c; return; }
    }
    if (w.purse > 0) this.toBarn(w);
  }

  work(w, dt) {
    const fl = w.field, c = w.cell;
    if (c.state !== fl.state) { w.state = 'idle'; return; }
    const ax = c.x - w.x, az = c.z - w.z, l = Math.hypot(ax, az) || 1;
    w.dirX = ax / l; w.dirZ = az / l;
    w.tool = ['seed', 'water', 'scythe'][fl.state];
    if (!w.crop) w.crop = fl.crop;
    this.f.workField(fl, w.x + w.dirX * RULES.reach, w.z + w.dirZ * RULES.reach, 0.7, dt, w);
    if (w.purse >= RULES.workerPurse) this.toBarn(w);
  }

  toBarn(w) {
    const d = w.b.d.dock || w.b.d.pos;
    if (this.goTo(w, w.b.parcel, { x: d[0], z: d[2] })) w.state = 'barn';
    else w.state = 'idle';
  }

  deliver(w) {
    const f = this.f, room = f.barnCapacity(w.b) - f.barnStock(w.b);
    if (room <= 0) { w.state = 'full'; return; }
    const n = Math.min(room, w.purse);
    if (n > 0 && w.crop) {
      w.b.stock[w.crop] = (w.b.stock[w.crop] || 0) + n;
      f.events.push({ type: 'barnIn', b: w.b.i, crop: w.crop, n });
    }
    w.purse -= n;
    if (!w.purse) w.crop = null;
    w.state = w.purse ? 'full' : 'idle';
  }
}
