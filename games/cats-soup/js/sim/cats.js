// Cat routine (D:/catsoup-ref/rules/cats.md section 1-2): a cook cat stays at its pot; a prep cat works its station,
// carries the ingredient to the pot of its line, puts it down, rests at a rest facility that has charges (that visit
// pays the energy, AddEnergyByRest), then walks back and reloads. Positions are in map cells; the view turns them into
// world positions and animator states. Not saved: rebuilt from the works on load.
const SPEED = 3.0 / 1.5;   // NavMeshAgent speed 3.0 world units/s while delivering, in cells/s
const WORK_SECONDS = 4.5;  // one round of 5 work-animation hits (GetWorkCount table not recovered: one round)
const PUT_SECONDS = 1.0;
const REST_SECONDS = 4.0;
const RELOAD_SECONDS = 0.5;

export class CatAI {
  constructor(game) {
    this.game = game;
    this.cats = new Map();
  }

  reset() { this.cats.clear(); }

  workOf(cat) { return this.game.state.works.find(w => w.id === cat.work); }

  ensure(cat) {
    let c = this.cats.get(cat.id);
    if (!c) {
      const w = this.workOf(cat);
      c = { id: cat.id, phase: 'work', t: this.game.rng() * WORK_SECONDS, x: w.pos[0], y: w.pos[1], from: null, to: null,
        dir: 0, rest: null, at: w.id };
      this.cats.set(cat.id, c);
    }
    return c;
  }

  walk(c, to, next) {
    c.phase = 'walk';
    c.from = [c.x, c.y];
    c.to = to;
    c.dist = Math.hypot(to[0] - c.x, to[1] - c.y);
    c.t = 0;
    c.next = next;
    c.dir = Math.atan2(to[0] - c.x, to[1] - c.y);
  }

  tick(dt) {
    const g = this.game;
    for (const cat of g.state.cats) {
      const c = this.ensure(cat);
      const home = this.workOf(cat);
      if (!home) continue;
      const a = g.work.get(home.a);
      if (a.type === 1) {
        c.phase = 'work';
        c.x = home.pos[0];
        c.y = home.pos[1];
        c.at = home.id;
        continue;
      }
      c.t += dt;
      if (c.phase === 'work' && c.t >= WORK_SECONDS) {
        const cook = g.state.works.find(w => w.a === [0, 7, 17][home.line]);
        if (cook) this.walk(c, cook.pos, 'put');
        else c.t = 0;
      } else if (c.phase === 'walk') {
        const k = c.dist > 0 ? Math.min(1, (c.t * SPEED) / c.dist) : 1;
        c.x = c.from[0] + (c.to[0] - c.from[0]) * k;
        c.y = c.from[1] + (c.to[1] - c.from[1]) * k;
        if (k >= 1) { c.phase = c.next; c.t = 0; }
      } else if (c.phase === 'put' && c.t >= PUT_SECONDS) {
        const rest = this.readyRest(c);
        if (rest) { c.rest = rest.id; this.walk(c, rest.pos, 'rest'); } else this.walk(c, home.pos, 'reload');
      } else if (c.phase === 'rest' && c.t >= REST_SECONDS) {
        const rest = g.state.works.find(w => w.id === c.rest);
        if (rest) g.claimRest(rest);
        c.rest = null;
        this.walk(c, home.pos, 'reload');
      } else if (c.phase === 'reload' && c.t >= RELOAD_SECONDS) {
        c.phase = 'work';
        c.t = 0;
      }
    }
    for (const id of this.cats.keys()) if (!g.state.cats.some(c => c.id === id)) this.cats.delete(id);
  }

  // Nearest rest facility with a charge that no other cat is resting at.
  readyRest(c) {
    const busy = new Set([...this.cats.values()].map(o => o.rest).filter(Boolean));
    let best = null, bd = Infinity;
    for (const w of this.game.state.works) {
      if (this.game.work.get(w.a).type !== 3 || !w.v || busy.has(w.id)) continue;
      const d = Math.hypot(w.pos[0] - c.x, w.pos[1] - c.y);
      if (d < bd) { bd = d; best = w; }
    }
    return best;
  }
}
