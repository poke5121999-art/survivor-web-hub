// A greedy player for tests and the in-page autoplay (?bot): it only feeds sim.input (a joystick direction) and
// sim.action (HUD buttons), like a human. Loop: steal an egg from the easiest animal it can outrun, carry it home and
// place it, hatch ready eggs, keep the farm full (sell the weakest brainrot when full), upgrade the farm and the shoes,
// knock out rivals that come for its brainrots, revive when dead.
// Goals are a small table (GOALS) chosen by priority each tick; movement follows fence-aware nav routes.
import { route } from './agent.js';
import { where, LOC, itemPos, canBeginSteal } from './items.js';
import { placedBrainrots, capacity, upgradeCost, isMaxLevel, farmItems } from './farm.js';
import { OBJ } from './rivals.js';
import { dxz, boxPoint } from './util.js';

const ARRIVE = 0.35;      // waypoint reached (m)
const REPLAN = 1.0;       // seconds between route refreshes

export class Bot {
  constructor(sim) {
    this.sim = sim;
    this.goal = null;
    this.path = null;
    this.planAt = -1;
    this.lastPos = null;
    this.stuckT = 0;
    this.lastProgress = 0;
    this.stalls = [];
    this.wiggle = 0;
    sim.listeners.push(e => {
      if ((e.type === 'pick' && e.actor === 0) || (e.type === 'place' && e.actor === 0) || e.type === 'sell'
        || e.type === 'farmUpgrade' || e.type === 'speedPlan' || (e.type === 'hatch' && e.farm === 0)) this.lastProgress = sim.state.t;
    });
  }

  // One tick: decide, press buttons, return the joystick input for this step.
  input(sim = this.sim) {
    const s = sim.state, p = s.actors[0], ui = s.ui;
    if (ui.deathPanel) { sim.action('revive'); return idle(); }
    if (p.combat.state !== 'ok') return idle();
    if (p.hp <= 2 && ui.healthAd) sim.action('health');
    if (s.t - this.lastProgress > 120) {
      this.stalls.push({ t: s.t, goal: this.goal && this.goal.kind, pos: p.pos.map(v => +v.toFixed(1)) });
      this.lastProgress = s.t;
      this.goal = null;
    }
    const goal = this.choose();
    if (!this.goal || goal.kind !== this.goal.kind || goal.id !== this.goal.id) { this.goal = goal; this.path = null; }
    this.goal.at = goal.at;
    if (this.act(goal)) return idle();
    return this.steer(goal.at, goal.reach || ARRIVE);
  }

  choose() {
    const sim = this.sim, s = sim.state, D = sim.D, p = s.actors[0];
    const held = p.carry && s.items[p.carry.item];
    const farmIn = this.farmSpot();

    // Rivals walking to or stealing one of our brainrots get knocked out (+100, back home for 10 s).
    if (!held || held.kind === 'brainrot' || held.secured) {
      for (let a = 1; a < s.actors.length; a++) {
        const r = s.actors[a], b = r.brain;
        if (b.stun) continue;
        const coming = (b.objective === OBJ.GO_BRAINROT || b.objective === OBJ.STEAL_BRAINROT) && dxz(r.pos, D.farm.zone.c) < 25;
        if (coming || (b.revenge.active && dxz(r.pos, p.pos) < 8)) return { kind: 'fight', id: a, at: r.pos, reach: 0.9 };
      }
    }
    if (held && held.kind === 'egg') return { kind: 'placeEgg', at: farmIn };
    if (held && held.kind === 'brainrot') {
      if (placedBrainrots(sim).length < capacity(sim)) return { kind: 'placeBrainrot', at: farmIn };
      const weakest = this.weakest();
      return { kind: 'sell', id: weakest, at: s.items[weakest].at.pos, reach: 0.6 };
    }
    // Hatch a ready egg (hands are empty here).
    const ready = farmItems(sim, 0, 'egg').filter(id => s.items[id].ready && !s.items[id].hatch);
    if (ready.length) {
      if (placedBrainrots(sim).length >= capacity(sim)) {
        const weakest = this.weakest();
        return { kind: 'sell', id: weakest, at: s.items[weakest].at.pos, reach: 0.6 };
      }
      return { kind: 'hatch', id: ready[0], at: s.items[ready[0]].at.pos, reach: 0.5 };
    }
    if (!isMaxLevel(sim) && s.coins >= upgradeCost(sim)) return { kind: 'upgradeFarm', at: D.farm.upgradeZone.c, reach: 0.25 };
    const plan = D.speedPlans.find(x => !s.upgrades.speedPlans[x.plan]);
    if (plan && s.coins > plan.cost && s.farms[0].level >= 1) return { kind: 'speed', id: plan.plan, at: D.zones.shops.shoes.c, reach: 0.25 };
    const egg = this.pickEgg();
    if (egg) return { kind: 'steal', id: egg, at: itemPos(sim, egg), reach: 0.1 };
    return { kind: 'wait', at: farmIn };
  }

  // Inside the player farm, a fixed spot in its south-east quarter (clear of the gate and the upgrade pad).
  farmSpot() {
    if (!this._farm) this._farm = this.sim.nav.closest(boxPoint(this.sim.D.farm.area, 0.2, -0.3));
    return this._farm;
  }

  weakest() {
    const s = this.sim.state, D = this.sim.D;
    return placedBrainrots(this.sim).sort((a, b) => D.seedIndex.get(s.items[a].seed).rate - D.seedIndex.get(s.items[b].seed).rate)[0];
  }

  // Eggs whose animal the bot outruns, nearest first; a sleeping animal far from its eggs also counts.
  pickEgg() {
    const sim = this.sim, s = sim.state, p = s.actors[0];
    let best = null, bd = Infinity;
    for (const id of Object.keys(s.items)) {
      const it = s.items[id];
      if (it.kind !== 'egg' || (where(it) !== LOC.NEST && where(it) !== LOC.GROUND) || it.owner == null) continue;
      if (!canBeginSteal(sim, 0, id) && !(where(it) === LOC.GROUND && it.waitExit)) continue;
      if (sim.D.animals[it.owner].chaseSpeed >= p.moveSpeed) continue;
      const d = dxz(p.pos, itemPos(sim, id));
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }

  // Buttons; returns true when the bot should stand still this tick.
  act(goal) {
    const sim = this.sim, s = sim.state, p = s.actors[0], ui = s.ui;
    switch (goal.kind) {
      case 'placeEgg':
      case 'placeBrainrot':
        if (ui.placeButton && dxz(p.pos, goal.at) < 3) { sim.action('place'); return true; }
        return false;
      case 'sell':
        if (ui.sellTarget === goal.id) { sim.action('sell'); return true; }
        return false;
      case 'upgradeFarm':
        if (ui.upgradePanel) { sim.action('upgradeFarm'); return true; }
        return false;
      case 'speed':
        if (ui.shop === 'shoes') { sim.action('buySpeed', { plan: goal.id }); return true; }
        return false;
      case 'steal': {
        const it = s.items[goal.id];
        if (p.steal) return true;                                  // stand in the trigger while the fill runs
        if (it && where(it) === LOC.GROUND && it.waitExit && dxz(p.pos, goal.at) < 1.5) {
          goal.at = [goal.at[0] + 2.5, goal.at[1], goal.at[2]];    // step out so the drop can be entered again
        }
        return false;
      }
      case 'fight': {
        const r = s.actors[goal.id];
        if (dxz(p.pos, r.pos) < 1.4 && !p.attack) {
          const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
          if ((r.pos[0] - p.pos[0]) * fx + (r.pos[2] - p.pos[2]) * fz > 0) sim.action('attack');
        }
        return false;
      }
      case 'hatch':
      case 'wait':
        return dxz(p.pos, goal.at) < (goal.reach || ARRIVE);
    }
    return false;
  }

  steer(target, reach) {
    const sim = this.sim, s = sim.state, p = s.actors[0];
    if (dxz(p.pos, target) <= reach) return idle();
    if (!this.path || s.t - this.planAt > REPLAN) {
      this.path = route(sim, p.pos, target) || [target];
      this.planAt = s.t;
    }
    while (this.path.length > 1 && dxz(p.pos, this.path[0]) < ARRIVE) this.path.shift();
    const w = this.path[0] || target;
    let dx = w[0] - p.pos[0], dz = w[2] - p.pos[2];
    // Unstick: if the body has not moved for a second, push sideways for a moment and re-plan.
    if (this.lastPos && dxz(this.lastPos, p.pos) < 0.01) this.stuckT += 1 / 30; else this.stuckT = 0;
    this.lastPos = p.pos.slice();
    if (this.stuckT > 1) { this.wiggle = 0.6; this.stuckT = 0; this.path = null; }
    if (this.wiggle > 0) { this.wiggle -= 1 / 30; [dx, dz] = [dz, -dx]; }
    const L = Math.hypot(dx, dz) || 1;
    return { dir: [dx / L, dz / L], jump: false, sprint: false };
  }
}

const idle = () => ({ dir: [0, 0], jump: false, sprint: false });
