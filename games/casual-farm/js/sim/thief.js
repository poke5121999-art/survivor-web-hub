// Thief (rules/sound-thief-nextmart.md): CustomerManager spawn loop, ThiefCashAgentController, CatchThiefController.
// Unlocked once `_ActivateThief` is active. Every thiefSpawnTimer s the first cashier with more than 10 coins on the
// desk and no player nearby gets a roll (Random.value > thiefProbabilty); the thief walks to the desk, takes one coin
// every 0.2 s up to 20, waits 2 s and runs to an exit. While it runs the player chases it with the net: touching it
// (2.5 m circle) freezes both for 2 s and the stolen coins come back; reaching the exit loses them.
const WALK = 10, RUN = 15, STEAL_RATE = 0.2, CARRY = 20, ESCAPE_DELAY = 2, CATCH_R = 2.5, FREEZE = 2, SCATTER = 0.5;
// isPlayerAroundTheSphereCollider: CashierDesk/PlayerDetector SphereCollider radius 20 around the desk node, plus the
// player's own trigger capsule (radius 1) (census-instore.md 3.5).
const NEAR_DESK = 20 + 1;

export class Thief {
  constructor(sim, nav) {
    this.sim = sim;
    this.nav = nav;
    const s = sim.store;
    const cm = s.comp(s.node('CUSTOMERS'), 'CustomerManager') || {};
    this.every = cm.thiefSpawnTimer || 300;
    this.prob = cm.thiefProbabilty ?? 0.5;
    this.exits = (cm.thiefExitPointList || []).filter(r => r && r.n != null).map(r => s.pos(r.n));
    this.desks = s.cashiers.map(c => {
      const f = s.comp(c.node, 'CashierController') || {};
      return { slot: f.thiefSlot ? s.pos(f.thiefSlot.n) : c.desk.middle, spawn: f.thiefSpawnSlot ? s.pos(f.thiefSpawnSlot.n) : c.desk.middle, at: s.pos(c.node) };
    });
    sim.state.thief = { timer: 0, agent: null, chasing: false };
  }

  step(dt, sim) {
    const st = sim.state.thief;
    if (!sim.isActive('_ActivateThief') || !this.exits.length) return;
    if (!st.agent) {
      st.timer += dt;
      if (st.timer < this.every) return;
      // SpawnNewThief refuses in map mode (CustomerManager.c:4588).
      if (sim.state.mapMode) return;
      // CustomerManager: once the timer is up the check runs every frame, and the timer restarts only when a cashier
      // qualifies (11+ coins on the desk, player outside its sphere), whether or not the roll spawns a thief.
      const p = sim.state.player;
      const ci = sim.store.cashiers.findIndex((c, i) => sim.isActive(c.name) && sim.state.cashiers[i].cash > 10
        && Math.hypot(this.desks[i].at.x - p.x, this.desks[i].at.z - p.z) > NEAR_DESK);
      if (ci < 0) return;
      st.timer = 0;
      if (sim.rng() > this.prob) this.spawn(ci);
      return;
    }
    const a = st.agent;
    a.timer += dt;
    switch (a.state) {
      case 'walk':
        if (this.walk(a, WALK, dt)) Object.assign(a, { state: 'steal', timer: 0 });
        break;
      case 'steal': {
        if (a.timer < STEAL_RATE) break;
        a.timer = 0;
        const desk = sim.state.cashiers[a.cashier];
        if (desk.cash > 0 && a.carried < CARRY) {
          desk.cash--;
          a.carried++;
          sim.emit({ type: 'thiefSteal', cashier: a.cashier, index: desk.cash });
        } else {
          Object.assign(a, { state: 'full', timer: 0 });
          sim.emit({ type: 'thiefFull' });
        }
        break;
      }
      case 'full':
        if (a.timer < ESCAPE_DELAY) break;
        Object.assign(a, { state: 'escape', timer: 0 });
        this.goTo(a, this.exits.reduce((b, e) => (Math.hypot(e.x - a.x, e.z - a.z) < Math.hypot(b.x - a.x, b.z - a.z) ? e : b)));
        st.chasing = true;
        sim.emit({ type: 'thiefEscape' });
        break;
      case 'escape': {
        const p = sim.state.player;
        if (Math.hypot(p.x - a.x, p.z - a.z) <= CATCH_R + 1) {
          Object.assign(a, { state: 'caught', timer: 0, moving: false });
          p.frozen = Math.max(p.frozen, FREEZE);
          st.chasing = false;
          sim.emit({ type: 'thiefCaught' });
        } else if (this.walk(a, RUN, dt)) {
          st.chasing = false;
          st.agent = null;
          sim.emit({ type: 'thiefEscaped', lost: a.carried });
        }
        break;
      }
      case 'caught':
        if (a.carried && a.timer >= SCATTER) {
          sim.state.cash += a.carried;
          sim.emit({ type: 'coinPile', amount: a.carried });
          a.carried = 0;
        }
        if (a.timer >= FREEZE) {
          st.agent = null;
          sim.emit({ type: 'thiefGone' });
        }
        break;
      default:
        break;
    }
  }

  spawn(ci) {
    const d = this.desks[ci];
    const a = { x: d.spawn.x, y: 0, z: d.spawn.z, dirX: 0, dirZ: 1, path: [], moving: false, state: 'walk', timer: 0, carried: 0, cashier: ci };
    this.sim.state.thief.agent = a;
    this.goTo(a, d.slot);
    this.sim.emit({ type: 'thiefSpawn', cashier: ci });
  }

  goTo(a, p) {
    a.path = this.nav ? this.nav.path({ x: a.x, y: a.y, z: a.z }, p) || [p] : [p];
  }

  walk(a, speed, dt) {
    let budget = speed * dt;
    while (budget > 0 && a.path.length) {
      const p = a.path[0], dx = p.x - a.x, dz = p.z - a.z, d = Math.hypot(dx, dz);
      if (d <= budget) { a.x = p.x; a.z = p.z; a.path.shift(); budget -= d; } else {
        a.x += dx / d * budget; a.z += dz / d * budget; a.dirX = dx / d; a.dirZ = dz / d; budget = 0;
      }
    }
    a.moving = a.path.length > 0;
    return !a.moving;
  }
}
