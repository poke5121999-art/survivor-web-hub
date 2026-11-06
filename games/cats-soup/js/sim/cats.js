// Cat routine (D:/catsoup-ref/rules/cats.md section 1-2): a cook cat stays at its pot; a prep cat works its station,
// carries the ingredient to the pot of its line, puts it down, rests at a rest facility that has charges (that visit
// pays the energy, AddEnergyByRest), then walks back and reloads. Positions are in map cells; the view turns them into
// world positions and animator states. Not saved: rebuilt from the works on load.
const SPEED = 3.0 / 1.5;   // NavMeshAgent speed 3.0 world units/s while delivering, in cells/s
const WORK_SECONDS = 4.5;  // one round of 5 work-animation hits (GetWorkCount table not recovered: one round)
const PUT_SECONDS = 1.0;
const REST_SECONDS = 4.0;
const RELOAD_SECONDS = 0.5;
const KIT_SPEED = 1.2 / 1.5;   // kitten agent speed 1.2 world units/s (Kitty_Play, Behavior_Kitty_Play), in cells/s
const HOME_SECONDS = 13.5;     // sleep at home between behaviours: 3 work ticks of 4.5 s (Spawn.c:19268 _etc1 > 2; GetWorkCount not recovered) (inferred)
const KIT_REST_SECONDS = 4.0;  // like a cat's rest visit (inferred)
const DANCE_SECONDS = 6.0;     // joint dance length (inferred)

export class CatAI {
  constructor(game) {
    this.game = game;
    this.cats = new Map();
    this.kits = new Map();    // kitten walker id -> state (tickKittens)
    this.stage = { t: 0, mode: 'wander' };
  }

  reset() { this.cats.clear(); this.kits.clear(); this.stage = { t: 0, mode: 'wander' }; }

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
      const home = this.workOf(cat);
      if (!home) continue;
      const c = this.ensure(cat);
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
        if (rest) g.claimRest(rest, cat);
        c.rest = null;
        this.walk(c, home.pos, 'reload');
      } else if (c.phase === 'reload' && c.t >= RELOAD_SECONDS) {
        c.phase = 'work';
        c.t = 0;
      }
    }
    for (const id of this.cats.keys()) if (!g.state.cats.some(c => c.id === id)) this.cats.delete(id);
    this.tickKittens(dt);
  }

  // ---- kittens (rules/kitty.md section 12, cats.md section 5) ----
  // A second list of actors: game.feat.kitty.walkers(game) = [{ id, type, house, stage, wander, scale }] (kittens not on a
  // trip). They never touch the soup loop. UnitFactory.ChoiceKittyBehavior picks Home / Play / Rest; Play hops between
  // free cells and other works (Spawn+_Kitty_Play_d__317); Rest walks to a kitty-rest prop (Work type 14) and pays
  // AddEnergyByRest; dance-stage kittens (house 406) roam `wander` s, then gather and dance together.
  // Units here are map cells; the NavMeshAgent speed 1.2 world units/s is 0.8 cells/s.
  kitHomeCell(c) {
    const g = this.game;
    if (c.home && g.inField(c.home[0], c.home[1]) && !g.workAt(c.home[0], c.home[1])) return c.home;
    // The houses are not facilities of this forest, so a kitten sleeps on a free cell from the end of the field that
    // autoCell() does not build on, one cell per house (inferred).
    const taken = new Set([...this.kits.values()].filter(o => o !== c && o.home).map(o => `${o.home[0]},${o.home[1]}`));
    const cells = g.emptyCells();
    if (g.state.mapSize % 2 === 0) cells.reverse();
    const cell = cells.find(([x, y]) => !taken.has(`${x},${y}`)) || cells[0] || [0, 0];
    c.home = [cell[0], cell[1]];
    return c.home;
  }

  restProp() {
    const g = this.game;
    const busy = new Set([...this.kits.values()].map(o => o.rest).filter(Boolean));
    return g.state.works.find(w => g.work.get(w.a).type === 14 && !busy.has(w.id)) || null;
  }

  // UnitFactory.c:507 ChoiceKittyBehavior: 0 Home, 1 Play, 2 Rest.
  choose(c, w) {
    const g = this.game, hasRest = g.state.works.some(x => g.work.get(x.a).type === 14);
    let b;
    if (w.stage) {
      b = 1 + Math.floor(g.rng() * 2);
      if (b === 2 && !hasRest) b = 1;
    } else {
      b = Math.floor(g.rng() * 3);
      if (b === c.prev) b += 1;
      if (b > 2) b = 0;
      if (b === 2 && !hasRest) b = c.prev === 0 ? 1 : 0;
    }
    c.prev = b;
    return b;
  }

  kitWalk(c, to, next) {
    c.phase = 'walk';
    c.from = [c.x, c.y];
    c.to = to;
    c.dist = Math.hypot(to[0] - c.x, to[1] - c.y);
    c.t = 0;
    c.next = next;
  }

  // One Play hop (Kitty_Play MoveNext, case 5): the first two hops always visit another work, later ones draw
  // i = rand(10): <= 2 go home, 3..5 a free cell, > 5 another work (never the one visited last).
  playHop(c) {
    const g = this.game;
    c.hops += 1;
    let i = Math.floor(g.rng() * 10);
    if (c.hops < 3) i = Math.max(i, 6);
    if (i <= 2) { this.kitWalk(c, this.kitHomeCell(c), 'home'); return; }
    if (i > 5) {
      const cand = g.state.works.filter(x => x.id !== c.lastWork)
        .map(x => ({ x, cells: [[1, 0], [-1, 0], [0, 1], [0, -1]].map(d => [x.pos[0] + d[0], x.pos[1] + d[1]])
          .filter(([cx, cy]) => g.inField(cx, cy) && !g.workAt(cx, cy)) })).filter(o => o.cells.length);
      if (cand.length) {
        const o = cand[Math.floor(g.rng() * cand.length)];
        c.lastWork = o.x.id;
        this.kitWalk(c, o.cells[Math.floor(g.rng() * o.cells.length)], 'idle');
        return;
      }
    }
    const free = g.emptyCells();
    if (!free.length) { this.kitWalk(c, this.kitHomeCell(c), 'home'); return; }
    this.kitWalk(c, free[Math.floor(g.rng() * free.length)].slice(), 'idle');
  }

  // Next behaviour once the kitten has slept at home.
  startBehavior(c, w) {
    const b = this.choose(c, w);
    c.hops = 0;
    c.lastWork = null;
    c.behavior = b;
    if (b === 2) {
      const prop = this.restProp();
      if (prop) { c.rest = prop.id; this.kitWalk(c, prop.pos.slice(), 'rest'); return; }
    }
    if (b === 0) { c.phase = 'home'; c.t = 0; } else this.playHop(c);
  }

  tickKittens(dt) {
    const g = this.game;
    const f = g.feat && g.feat.kitty;
    const list = f && f.walkers ? f.walkers(g) : [];
    if (!list.length && !this.kits.size) return;
    const ids = new Set(list.map(w => w.id));
    for (const id of [...this.kits.keys()]) if (!ids.has(id)) this.kits.delete(id);
    for (const w of list) {
      let c = this.kits.get(w.id);
      if (!c) {
        c = { id: w.id, w, type: w.type, phase: 'home', t: w.stage ? HOME_SECONDS : g.rng() * HOME_SECONDS, x: 0, y: 0, prev: 0, hops: 0,
          lastWork: null, rest: null, home: null, from: null, to: null, dist: 0, next: null, wait: 0, behavior: 0 };
        this.kits.set(w.id, c);
        const h = this.kitHomeCell(c);
        c.x = h[0]; c.y = h[1];
      }
      c.w = w;
      c.type = w.type;
      if (c.rest && !g.state.works.some(x => x.id === c.rest)) { c.rest = null; if (c.phase === 'rest') { c.phase = 'idle'; c.t = 0; } }
      this.stepKitten(c, w, dt);
    }
    this.stepStage(dt, list.filter(w => w.stage).map(w => this.kits.get(w.id)));
  }

  stepKitten(c, w, dt) {
    const g = this.game;
    c.t += dt;
    if (c.phase === 'home') {
      const h = this.kitHomeCell(c);
      c.x = h[0]; c.y = h[1];
      if (c.t >= HOME_SECONDS) this.startBehavior(c, w);
    } else if (c.phase === 'walk') {
      const k = c.dist > 0 ? Math.min(1, (c.t * KIT_SPEED) / c.dist) : 1;
      c.x = c.from[0] + (c.to[0] - c.from[0]) * k;
      c.y = c.from[1] + (c.to[1] - c.from[1]) * k;
      if (k >= 1) {
        c.phase = c.next;
        c.t = 0;
        c.wait = 0.5 + g.rng() * 1.5;   // Random.Range(0.5, 2.0) s idle between hops
        if (c.phase === 'home') { const h = this.kitHomeCell(c); c.x = h[0]; c.y = h[1]; }
      }
    } else if (c.phase === 'idle') {
      if (c.t >= c.wait && !(w.stage && this.stage.mode !== 'wander')) this.playHop(c);
    } else if (c.phase === 'rest') {
      if (c.t >= KIT_REST_SECONDS) {
        const prop = g.state.works.find(x => x.id === c.rest);
        if (prop) g.claimRest(prop, null);
        c.rest = null;
        this.kitWalk(c, this.kitHomeCell(c), 'home');
      }
    }
  }

  // Dance stage (KittyGatherDirector): wander 50 s (CatUnlock.wanderTime), gather, joint dance, disperse.
  stepStage(dt, kits) {
    const st = this.stage;
    if (!kits.length) { st.t = 0; st.mode = 'wander'; return; }
    st.t += dt;
    if (st.mode === 'wander' && st.t >= kits[0].w.wander) {
      st.mode = 'gather';
      st.t = 0;
      const base = this.kitHomeCell(kits[0]);
      kits.forEach((c, i) => this.kitWalk(c, [base[0] + (i % 2), base[1] + Math.floor(i / 2)], 'dance'));
    } else if (st.mode === 'gather' && kits.every(c => c.phase === 'dance')) {
      st.mode = 'dance';
      st.t = 0;
    } else if (st.mode === 'dance' && st.t >= DANCE_SECONDS) {
      st.mode = 'wander';
      st.t = 0;
      for (const c of kits) { c.phase = 'idle'; c.t = 0; c.wait = 0.5; c.hops = 0; }
    }
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
