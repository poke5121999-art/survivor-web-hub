// Tutorial (TutorialManager of the original), rules/tutorial.md. Pure ES module: reads sim state + sim events, never
// mutates the sim. Four one-time activities in fixed priority (egg delivery, hatch/place/sell, steal from AI, upgrade
// farm), then random steal hints; a recovery mode preempts everything when a rival carries a brainrot the player owned.
//
//   const tut = new Tutorial(sim.state, data, savedJson, { rng });       // rng() -> [0,1), default seeded mulberry32(1)
//   sim.listeners.push(e => tut.onEvents([e]));                          // or tut.onEvents(drainedEvents)
//   tut.update(dt, sim.state);  tut.view -> { activity, step, stepIndex, text, pointer, hint }
//   localStorage.setItem(k, JSON.stringify(tut.save()))                  // PlayerPrefs keys of the original (ints)
//
// pointer = {kind:'world', pos:[x,y,z]} | {kind:'ui', node} | null. Positions are the target's own position (the view
// adds the arrow height, TutorialPointer.heightAboveTarget 0 + bob). 'ui' is never produced: every original target is a
// world transform. activity: 'EggDelivery' | 'HatchPlaceSell' | 'StealFromAI' | 'UpgradeFarm' | 'Recovery' | null.
// Texts are the original English strings; the view translates them.

export const TUNING = Object.freeze({ startDelay: 2.0, refreshInterval: 0.2, stealHintChance: 0.35, stealHintCheckInterval: 15.0,
  stealHintCooldown: 60.0, stealHintDuration: 12.0 });

export const KEYS = Object.freeze({
  eggDone: 'tutorial_activity_egg_delivery_done', hatchDone: 'tutorial_activity_hatch_sell_done',
  stealDone: 'tutorial_activity_steal_ai_done', upgradeDone: 'tutorial_activity_upgrade_done',
  mainComplete: 'tutorial_main_activities_complete', eggState: 'tutorial_activity_egg_delivery_state',
  hatchState: 'tutorial_activity_hatch_sell_state', stealState: 'tutorial_activity_steal_ai_state',
});

export const T = Object.freeze({
  stealEgg: 'Steal an egg from the animal.',
  safeZone: 'Take the stolen egg to the safe zone.',
  placeEgg: 'Go to your farm and place the egg.',
  eggReady: 'Your egg is READY. Go to it and hatch the Brainrot.',
  eggWait: 'Wait for your egg to hatch.',
  placeBrainrot: 'Take the Brainrot to your farm and place it.',
  sell: 'Go to the Brainrot on your farm and sell it.',
  gateOpen: 'The AI gate is open. Steal a Brainrot.',
  placeStolen: 'Take the stolen Brainrot to your farm and place it.',
  upgrade: 'You have enough coins. Go to the farm upgrade point and upgrade your farm.',
  recGet: 'Someone stole your Brainrot! Hit the AI and get it back.',
  recDropped: 'Steal back your dropped Brainrot.',
  recReturn: 'Take your Brainrot back to your farm and place it.',
  recGate: 'Close your gate to protect the Brainrot.',
  hint: 'The AI gate is open. You can steal a Brainrot.',
});
export const TUTORIAL_TEXTS = Object.freeze(Object.values(T));

export const ACTIVITY = Object.freeze({ None: 0, EggDelivery: 1, HatchPlaceSell: 2, StealFromAI: 3, UpgradeFarm: 4 });
const ACT_NAME = [null, 'EggDelivery', 'HatchPlaceSell', 'StealFromAI', 'UpgradeFarm'];
const EGG_STEPS = ['StealEgg', 'ReachSafeZone', 'PlaceEgg'];
const HATCH_STEPS = ['HatchEgg', 'PlaceBrainrot', 'SellBrainrot'];
const STEAL_STEPS = ['StealBrainrot', 'PlaceBrainrot'];
const REC_STEPS = ['None', 'GetBackFromAI', 'RecoverDroppedBrainrot', 'ReturnToPlayerFarm', 'ClosePlayerGate'];
const DONE_KEY = [null, KEYS.eggDone, KEYS.hatchDone, KEYS.stealDone, KEYS.upgradeDone];

function mulberry32(a) {
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[2] - b[2]) ** 2;
const cp = p => [p[0], p[1], p[2]];

export class Tutorial {
  constructor(simState, data, saved = null, opts = {}) {
    this.s = simState;
    this.D = data;
    this.rng = opts.rng || mulberry32(opts.seed == null ? 1 : opts.seed);
    let sv = saved;
    if (typeof sv === 'string') { try { sv = JSON.parse(sv); } catch (e) { sv = null; } }
    sv = sv || {};
    const flag = k => (sv[k] === 1 ? 1 : 0);
    this.done = [0, flag(KEYS.eggDone), flag(KEYS.hatchDone), flag(KEYS.stealDone), flag(KEYS.upgradeDone)];
    this.mainComplete = flag(KEYS.mainComplete) === 1 || this.done.slice(1).every(v => v === 1);   // RestoreSavedActivityState
    const clamp2 = v => Math.max(0, Math.min(2, v | 0));
    this.eggState = clamp2(sv[KEYS.eggState]);
    this.hatchState = clamp2(sv[KEYS.hatchState]);
    this.stealState = (sv[KEYS.stealState] | 0) > 0 ? 1 : 0;
    this.active = ACTIVITY.None;
    this.activityEgg = null; this.activityBrainrot = null;
    this.t = 0; this.nextTick = TUNING.startDelay;
    this.guide = null;                         // {text, pos} currently shown
    this.known = new Set(); this.lastCarried = null;
    this.recovery = 0; this.thief = null; this.stolen = null; this.paused = ACTIVITY.None;
    this.hintState = 0; this.hintBrainrot = null; this.hintEnd = 0;     // 0 None, 1 StealAIBrainrot, 2 PlaceOnPlayerFarm
    this.nextHintCheck = 0; this.nextHintAllowed = 0;
    this.dirty = false;
  }

  // --- persistence ----------------------------------------------------------------------------------------------
  save() {
    const o = {};
    [1, 2, 3, 4].forEach(a => { if (this.done[a]) o[DONE_KEY[a]] = 1; });
    if (this.mainComplete) o[KEYS.mainComplete] = 1;
    if (!this.done[1] && this.eggState) o[KEYS.eggState] = this.eggState;
    if (!this.done[2] && this.hatchState) o[KEYS.hatchState] = this.hatchState;
    if (!this.done[3] && this.stealState) o[KEYS.stealState] = this.stealState;
    return o;
  }

  // --- read helpers ---------------------------------------------------------------------------------------------
  get player() { return this.s.actors[0]; }
  item(id) { return id != null ? this.s.items[id] || null : null; }
  carriedId() { const c = this.player.carry; return c ? c.item : null; }
  carriedKind() { const it = this.item(this.carriedId()); return it ? it.kind : null; }
  pos(id) {
    const it = this.s.items[id], at = it.at;
    if (at.nest != null) return this.s.animals[at.nest].nests[at.slot];
    if (at.ground) return at.ground;
    if (at.carried != null) return this.s.actors[at.carried].pos;
    if (at.stowed != null) return this.s.actors[at.stowed].pos;
    return at.pos;
  }
  nearest(ids) {
    const pp = this.player.pos;
    let best = null, bd = Infinity;
    for (const id of ids) { const d = d2(pp, this.pos(id)); if (d < bd) { bd = d; best = id; } }
    return best;
  }
  ids(f) { return Object.keys(this.s.items).filter(id => f(this.s.items[id], id)); }
  onFarm(it) { return it.at.farm === 0; }
  onEnemyFarm(it) { return it.at.farm != null && it.at.farm > 0; }
  farmTarget() { return cp(this.D.farm.area.c); }           // placedItemsParent: the farm's placement area
  safeZone() { return cp(this.D.zones.safe.c); }
  availableEgg() {
    const ok = this.ids((it, id) => it.kind === 'egg' && !it.secured && !it.hatch && it.reservedBy == null && (it.at.nest != null || (it.at.ground && !it.waitExit)));
    return this.nearest(ok);
  }
  farmEgg(readyOnly) { return this.nearest(this.ids(it => it.kind === 'egg' && this.onFarm(it) && (!readyOnly || it.ready))); }
  farmBrainrot() { return this.nearest(this.ids(it => it.kind === 'brainrot' && this.onFarm(it))); }
  openGateBrainrot() {
    return this.nearest(this.ids(it => it.kind === 'brainrot' && this.onEnemyFarm(it) && this.s.farms[it.at.farm] && this.s.farms[it.at.farm].gate.open));
  }
  canAffordUpgrade() {
    const f = this.D.farm, lvl = this.s.farms[0].level, max = lvl >= f.capacities.length - 1;
    return !max && this.s.coins >= f.upgradePrices[Math.min(lvl, f.upgradePrices.length - 1)];
  }
  isMaxLevel() { return this.s.farms[0].level >= this.D.farm.capacities.length - 1; }

  // --- guidance -------------------------------------------------------------------------------------------------
  show(text, pos) { this.guide = { text, pos: pos ? cp(pos) : null }; }
  hide() { this.guide = null; }

  get view() {
    const g = this.guide;
    let activity = null, step = null, stepIndex = null, hint = null;
    if (this.recovery) { activity = 'Recovery'; stepIndex = this.recovery; step = REC_STEPS[this.recovery]; }
    else if (!this.mainComplete && this.active) {
      activity = ACT_NAME[this.active];
      stepIndex = this.active === 1 ? this.eggState : this.active === 2 ? this.hatchState : this.active === 3 ? this.stealState : 0;
      step = this.active === 1 ? EGG_STEPS[stepIndex] : this.active === 2 ? HATCH_STEPS[stepIndex] : this.active === 3 ? STEAL_STEPS[stepIndex] : 'Upgrade';
    } else if (this.mainComplete && this.hintState) {
      hint = { kind: this.hintState === 1 ? 'StealAIBrainrot' : 'PlaceOnPlayerFarm', until: this.hintState === 1 ? this.hintEnd : null };
    }
    return { activity, step, stepIndex, text: g ? g.text : null, pointer: g && g.pos ? { kind: 'world', pos: cp(g.pos) } : null, hint };
  }

  // --- events (EventManager.OnTutorialActivity) ----------------------------------------------------------------
  onEvents(events) {
    for (const e of events) if (e.type === 'tutorial') this.onTask(e.task, e.item);
  }

  onTask(task, itemId) {
    const it = this.item(itemId);
    switch (task) {
      case 'StealAnimalEgg':
        if (this.active === 1 && this.eggState === 0) { this.activityEgg = itemId; this.setEgg(1); }
        break;
      case 'ReachSafeZone':
        if (this.active === 1 && this.eggState === 1 && this.carriedKind() === 'egg') { this.activityEgg = this.carriedId(); this.setEgg(2); }
        break;
      case 'PlaceEggOnFarm':
        if (this.active === 1) this.complete(1);
        break;
      case 'CarryHatchedBrainrot':
        if (this.done[2] !== 1) {
          this.active = 2;
          if (it) { this.activityBrainrot = itemId; this.known.add(itemId); this.setHatch(1); }
        }
        break;
      case 'PlaceBrainrotOnFarm':
        if (this.mainComplete && this.hintState === 2 && (this.hintBrainrot == null || itemId == null || itemId === this.hintBrainrot)) this.stopHint();
        else if (this.active === 3 && this.stealState === 1 && (itemId == null || this.activityBrainrot == null || itemId === this.activityBrainrot)) this.complete(3);
        break;
      case 'SellFarmBrainrot':
        if (this.active === 2 && this.hatchState === 2) this.complete(2);
        break;
      case 'StealAIBrainrot':
        if (it) this.known.add(itemId);
        if (this.mainComplete && this.hintState === 1 && (this.hintBrainrot == null || itemId == null || itemId === this.hintBrainrot)) {
          if (itemId != null) this.hintBrainrot = itemId;
          this.hintEnd = 0; this.hintState = 2;
        } else if (this.active === 3 && this.stealState === 0 && it) { this.activityBrainrot = itemId; this.setStealState(1); }
        break;
      case 'FarmUpgrade':
        if (this.done[4] !== 1) this.complete(4);
        break;
      default: break;     // WaitForEggHatch, BrainrotCoinIncome, ... are ignored by the original too
    }
  }

  setEgg(v) { this.eggState = v; this.dirty = true; }
  setHatch(v) { this.hatchState = v; this.dirty = true; }
  setStealState(v) { this.stealState = v; this.dirty = true; }

  complete(a) {
    this.done[a] = 1;
    if (this.active === a) this.active = ACTIVITY.None;
    if (a === 1) { this.eggState = 0; this.activityEgg = null; }
    if (a === 2) { this.hatchState = 0; this.activityBrainrot = null; }
    if (a === 3) { this.stealState = 0; this.activityBrainrot = null; }
    this.dirty = true;
    this.hide();
    if (this.done.slice(1).every(v => v === 1)) this.finish();
  }

  finish() {
    this.mainComplete = true; this.active = ACTIVITY.None; this.dirty = true;
    this.nextHintCheck = this.t + Math.max(5, TUNING.stealHintCheckInterval);
    this.hide();
  }

  // --- loop: 2 s start delay, then every 0.2 s ------------------------------------------------------------------
  update(dt, simState) {
    if (simState) this.s = simState;
    this.t += dt;
    while (this.t + 1e-9 >= this.nextTick) {
      this.tick();
      this.nextTick += TUNING.refreshInterval;
    }
  }

  tick() {
    this.updateKnown();
    if (!this.recovery) this.tryStartRecovery();
    if (!this.recovery) {
      if (!this.mainComplete) this.updateMain(); else this.updateHints();
    } else this.updateRecovery();
  }

  updateMain() {
    if (this.done.slice(1).every(v => v === 1)) { this.finish(); return; }
    if (this.active === ACTIVITY.None) this.active = this.select();
    if (this.active === ACTIVITY.None) { this.hide(); return; }
    for (let i = 0; i < 4; i++) {            // a state change re-runs the activity within the same tick
      const before = this.active * 10 + this.eggState + this.hatchState + this.stealState;
      if (this.active === 1) this.tickEgg();
      else if (this.active === 2) this.tickHatch();
      else if (this.active === 3) this.tickSteal();
      else if (this.active === 4) this.tickUpgrade();
      if (this.active === ACTIVITY.None || before === this.active * 10 + this.eggState + this.hatchState + this.stealState) break;
    }
  }

  select() {
    const d = this.done;
    if (d[1] !== 1 && (this.carriedKind() === 'egg' || this.availableEgg() != null)) return 1;
    if (d[2] !== 1 && (this.hatchState !== 0 || this.carriedKind() === 'brainrot' || this.farmEgg(false) != null)) return 2;
    if (d[3] !== 1 && (this.stealState === 1 || this.openGateBrainrot() != null)) return 3;
    if (d[4] !== 1 && this.canAffordUpgrade()) return 4;
    return 0;
  }

  tickEgg() {
    if (this.carriedKind() === 'egg') this.activityEgg = this.carriedId();
    if (this.eggState === 0) {
      if (this.carriedKind() === 'egg') { this.setEgg(1); return; }                // [GUESS] already carrying when selected
      const e = this.availableEgg();
      if (e == null) { this.active = 0; this.hide(); return; }
      this.show(T.stealEgg, this.pos(e));
    } else if (this.eggState === 1) {
      const e = this.item(this.activityEgg);
      if (this.carriedKind() !== 'egg') { this.setEgg(0); return; }                // [GUESS] dropped on the way: start over
      if (e && e.secured) { this.setEgg(2); return; }
      this.show(T.safeZone, this.safeZone());
    } else {
      if (this.carriedKind() === 'egg') this.show(T.placeEgg, this.farmTarget());
      else {
        const e = this.item(this.activityEgg);
        if (e && e.at.farm === 0) this.complete(1);                              // Incubating / Ready
        else this.setEgg(0);
      }
    }
  }

  tickHatch() {
    const carrying = this.carriedKind() === 'brainrot';
    if (this.hatchState === 0) {
      if (carrying) { this.activityBrainrot = this.carriedId(); this.known.add(this.activityBrainrot); this.setHatch(1); return; }
      let e = this.farmEgg(true), ready = e != null;
      if (!ready) e = this.farmEgg(false);
      if (e == null) { this.active = 0; this.hide(); return; }
      this.show(ready ? T.eggReady : T.eggWait, this.pos(e));
    } else if (this.hatchState === 1) {
      if (carrying) { this.activityBrainrot = this.carriedId(); this.known.add(this.activityBrainrot); this.show(T.placeBrainrot, this.farmTarget()); return; }
      const b = this.item(this.activityBrainrot);
      if (b && this.onFarm(b)) { this.setHatch(2); return; }
      const f = this.farmBrainrot();
      if (f == null) { this.setHatch(0); this.activityBrainrot = null; return; }
      this.activityBrainrot = f; this.setHatch(2);                                  // [GUESS] adopt, then sell it
    } else {
      let b = this.item(this.activityBrainrot);
      if (!b || !this.onFarm(b)) {
        const f = this.farmBrainrot();
        if (f == null) { this.setHatch(0); this.activityBrainrot = null; return; }
        this.activityBrainrot = f; b = this.item(f);
      }
      this.known.add(this.activityBrainrot);
      this.show(T.sell, this.pos(this.activityBrainrot));
    }
  }

  tickSteal() {
    if (this.stealState === 0) {
      const b = this.openGateBrainrot();
      if (b == null) { this.activityBrainrot = null; this.active = 0; this.hide(); return; }
      this.activityBrainrot = b;
      this.show(T.gateOpen, this.pos(b));
      return;
    }
    const b = this.item(this.activityBrainrot);
    if (b && this.onFarm(b)) { this.complete(3); return; }
    if (this.carriedKind() === 'brainrot') {
      if (this.activityBrainrot == null || !b) this.activityBrainrot = this.carriedId();
      this.known.add(this.activityBrainrot);
      this.show(T.placeStolen, this.farmTarget());
      return;
    }
    if (b && !this.onEnemyFarm(b)) return;                                           // dropped / held elsewhere: keep showing
    this.setStealState(0); this.activityBrainrot = null; this.active = 0; this.hide();
  }

  tickUpgrade() {
    if (this.isMaxLevel()) { this.complete(4); return; }
    if (this.canAffordUpgrade()) this.show(T.upgrade, this.D.farm.upgradeZone.c);
    else { this.active = 0; this.hide(); }
  }

  // --- recovery (preempts everything) --------------------------------------------------------------------------
  updateKnown() {
    for (const id of [...this.known]) if (!this.s.items[id]) this.known.delete(id);
    for (const id of this.ids(it => it.kind === 'brainrot' && this.onFarm(it))) this.known.add(id);
    if (this.carriedKind() === 'brainrot') { this.lastCarried = this.carriedId(); this.known.add(this.lastCarried); }
  }

  holder(id) {
    for (let a = 1; a < this.s.actors.length; a++) { const c = this.s.actors[a].carry; if (c && c.item === id) return a; }
    return null;
  }

  tryStartRecovery() {
    for (let a = 1; a < this.s.actors.length; a++) {
      const c = this.s.actors[a].carry, it = c && this.item(c.item);
      if (it && it.kind === 'brainrot' && (this.known.has(c.item) || c.item === this.lastCarried)) {
        this.hintStopSilently();
        this.thief = a; this.paused = this.active; this.stolen = c.item; this.recovery = 1;
        return;
      }
    }
  }

  endRecovery() {
    this.recovery = 0; this.thief = null; this.stolen = null;
    this.active = this.paused; this.paused = ACTIVITY.None;
    this.hide();
  }

  updateRecovery() {
    const b = this.item(this.stolen);
    if (!b || this.onEnemyFarm(b)) { this.endRecovery(); return; }
    if (this.carriedId() === this.stolen) this.recovery = 3;
    else { const h = this.holder(this.stolen); if (h != null) { this.thief = h; this.recovery = 1; } else if (!this.onFarm(b)) this.recovery = 2; }
    if (this.recovery === 1) {
      if (this.thief == null) this.recovery = 2;
      else { this.show(T.recGet, this.s.actors[this.thief].pos); return; }
    }
    if (this.recovery === 2) {
      if (this.carriedId() === this.stolen) this.recovery = 3;
      else { this.show(T.recDropped, this.pos(this.stolen)); return; }
    }
    if (this.recovery === 3) {
      if (this.onFarm(b)) { this.recovery = 4; this.hide(); return; }
      this.show(T.recReturn, this.farmTarget());
      return;
    }
    if (this.recovery === 4) {
      if (!this.s.farms[0].gate.open) { this.endRecovery(); return; }
      this.show(T.recGate, this.D.gates.player.pos);
    }
  }

  // --- post-tutorial steal hints ---------------------------------------------------------------------------------
  hintStopSilently() { this.hintState = 0; this.hintBrainrot = null; this.hintEnd = 0; this.nextHintAllowed = this.t + Math.max(5, TUNING.stealHintCooldown); this.hide(); }
  stopHint() { this.hintStopSilently(); }

  updateHints() {
    if (this.hintState) { this.updateActiveHint(); return; }
    this.hide();
    const now = this.t;
    if (now + 1e-9 >= this.nextHintAllowed && now + 1e-9 >= this.nextHintCheck) {
      this.nextHintCheck = now + Math.max(3, TUNING.stealHintCheckInterval);
      const roll = this.rng() <= Math.max(0, Math.min(1, TUNING.stealHintChance));
      const b = this.openGateBrainrot();
      if (roll && b != null) {
        this.hintBrainrot = b; this.hintState = 1; this.hintEnd = now + Math.max(3, TUNING.stealHintDuration);
        this.updateActiveHint();                 // show in the same tick so hint != null always comes with a text
      }
    }
  }

  updateActiveHint() {
    if (this.hintBrainrot != null && !this.item(this.hintBrainrot)) { this.stopHint(); return; }
    const b = this.item(this.hintBrainrot);
    if (this.hintState === 1) {
      if (!b || !this.onEnemyFarm(b) || !this.s.farms[b.at.farm].gate.open || this.t > this.hintEnd) { this.stopHint(); return; }
      this.show(T.hint, this.pos(this.hintBrainrot));
    } else {
      if (!b || this.onFarm(b) || this.onEnemyFarm(b)) { this.stopHint(); return; }
      this.show(T.placeStolen, this.farmTarget());
    }
  }
}
