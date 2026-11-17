// Steal An Egg rules simulation. Pure ES module, no THREE, runs in node. Fixed step STEP = 1/30 s.
// One player (actor 0) and three AI rivals (actors 1..3 = AI_01..AI_03) play by the same item functions.
//
//   const sim = new Sim(data, nav, { seed, now })   data = data/game.json, nav = NavMesh from js/sim/nav.js (or null)
//   sim.input({ dir: [x, z], jump, sprint })        joystick in world space (js/sim/move.js)
//   sim.action(name, arg) -> bool                    buttons, see ACTIONS below
//   sim.step(dt = STEP)                              advance; read sim.state, drain sim.events
//   sim.save() -> JSON string; sim.load(json); sim.startSession()   (save.js; key SAVE_KEY 'steal-egg-v1')
//
// State (DESIGN.md): t, coins, actors[], items{id: {kind, at, ...}}, animals[], farms[{level?, gate}], upgrades,
// tutorial, settings, ui (derived each step: what the HUD shows), rng, nextId, v.
// Events (sim.events, {type, ...}): coins, animateCoin, toast, tutorial, pick, drop, stow, equip, secured, place,
//   stealStart, stealCancel, eggBatch, animalWake, animalReturn, animalSleep, animalHit, eggReady, hatchStart,
//   hatchCancel, hatch, income, sell, farmUpgrade, gate, attack, hit, stun, recover, death, deathPanel, revive, health,
//   rivalChase, rivalAttack, rivalObjective, rivalSteal, rivalStole, rivalBlocked, rivalCarry, rivalTookCarried,
//   rivalRecovered, rivalRevenge, rivalRevengeEnd, playerStole, speed, speedPlan, weapon, weaponUnlock, shopUnlock,
//   cosmetic, adsBreak.
import { newMover, stepMover, THIRD_PERSON } from './move.js';
import { navKit } from './navkit.js';
import { initAnimals, stepAnimals } from './animals.js';
import { initGates, stepGates, pathBlocked, playerCrossBlocked, insideGateTrigger, lockPlayerGate, unlockAIGate } from './gates.js';
import { newRivalBrain, stepRivals } from './rivals.js';
import { stepFarms, placeCarried, placeAt, pickPlacedBrainrot, sellPlaced, upgradeFarm, playerStealBrainrot, placedBrainrots, capacity, upgradeCost } from './farm.js';
import { newCombat, stepCombat, playerAttack, revive, refillHealth, COMBAT } from './combat.js';
import { newUpgrades, buySpeedPlan, pedestalBuy, pedestalAd, pedestalPick, batShopBuy, shopUnlock, shopPick } from './upgrades.js';
import { canBeginSteal, beginSteal, cancelSteal, pickEgg, secureCarriedEgg, carriedBy, stowBrainrot, equipBrainrot, where, LOC, itemPos } from './items.js';
import { serialize, deserialize, migrate, startSession, SAVE_VERSION } from './save.js';
import { newAdsBreak, stepAdsBreak, claimAdsBreakCoins, claimAdsBreakHealth } from './adsbreak.js';
import { rand, inBoxXZ, dxz, copy } from './util.js';

export const STEP = 1 / 30;

export class Sim {
  constructor(data, nav = null, { seed = 1, now = () => Date.now() / 1000 } = {}) {
    this.D = indexData(data);
    this.nav = navKit(nav);
    this.clock = now;
    this.events = [];
    this.listeners = [];
    this.inputState = { dir: [0, 0], jump: false, sprint: false };
    const D = this.D;
    const start = this.nav.closest(D.player.start);
    const player = Object.assign(newMover(start, D.player.startYaw), {
      id: 'player', kind: 'player', hp: D.player.hp, stunUntil: 0, moveSpeed: D.player.moveSpeed, carry: null,
      steal: null, attack: null, combat: newCombat(), near: [], inSafe: false,
    });
    this.state = {
      v: SAVE_VERSION, t: 0, coins: D.start.coins, rng: seed >>> 0, nextId: 1,
      actors: [player], items: {}, animals: [], farms: [],
      upgrades: newUpgrades(), tutorial: { tasks: {} }, settings: { ...D.settings }, adsBreak: newAdsBreak(D),
      ui: emptyUi(),
    };
    D.rivals.forEach((r, k) => {
      const a = this.state.actors.length;
      this.state.actors.push({ id: D.rivalFarms[r.farm].saveID, kind: 'rival', pos: copy(r.home), yaw: r.homeYaw, hp: null,
        stunUntil: 0, speed: 0, carry: null, moving: false, nav: null, inSafe: false, brain: null });
      this.state.actors[a].brain = newRivalBrain(this, a);
    });
    initGates(this);
    initAnimals(this);
    this.syncBlockers();
    this.refreshUi();
  }

  // --- services used by the rule modules ----------------------------------------------------------------------------
  emit(type, payload = {}) {
    const e = { type, t: this.state.t, ...payload };
    this.events.push(e);
    for (const f of this.listeners) f(e);
  }
  toast(text) { this.emit('toast', { text }); }
  tutorial(task, item) {
    this.state.tutorial.tasks[task] = (this.state.tutorial.tasks[task] || 0) + 1;
    this.emit('tutorial', { task, item });
  }
  addCoins(n, reason, quiet = false) {
    this.state.coins += n;
    this.emit('coins', { delta: n, reason, coins: this.state.coins });
    if (n > 0 && !quiet) this.emit('animateCoin', { reason });
  }
  rand() { return rand(this.state); }
  now() { return this.clock(); }
  pathBlocked(from, to) { return pathBlocked(this, from, to); }

  // --- player input -------------------------------------------------------------------------------------------------
  input(i) { this.inputState = { dir: i.dir || [0, 0], jump: !!i.jump, sprint: !!i.sprint }; }

  action(name, arg = {}) {
    const f = ACTIONS[name];
    if (!f) throw new Error(`unknown action "${name}"`);
    this.refreshUi();
    const ok = !!f(this, arg || {});
    this.refreshUi();
    return ok;
  }

  // --- save ---------------------------------------------------------------------------------------------------------
  save() { return serialize(this.state); }
  load(json) {
    const s = deserialize(json);
    if (!s) return false;
    migrate(s, this.D);
    this.state = s;
    this.syncBlockers();
    this.refreshUi();
    return true;
  }
  startSession() { startSession(this); this.syncBlockers(); this.refreshUi(); }

  // --- step ---------------------------------------------------------------------------------------------------------
  step(dt = STEP) {
    const s = this.state;
    if (s.actors[0].combat.state === COMBAT.DEAD) {       // Time.timeScale = 0: only wall-clock egg timers move
      stepFarms(this, 0);
      this.refreshUi();
      return;
    }
    s.t += dt;                 // every system sees the time at the end of this step (WaitForSeconds semantics)
    this.stepPlayer(dt);
    stepCombat(this, dt);
    stepRivals(this, dt);
    this.safeZones();
    stepAnimals(this, dt);
    stepFarms(this, dt);
    stepGates(this, dt);
    stepAdsBreak(this, dt);
    this.syncBlockers();
    this.refreshUi();
  }

  stepPlayer(dt) {
    const s = this.state, p = s.actors[0];
    if (p.combat.state === COMBAT.OK) {
      const prev = copy(p.pos);
      const tune = { ...THIRD_PERSON, moveSpeed: p.moveSpeed };
      stepMover(p, this.inputState, this.nav.raw || FLAT, dt, tune);
      if (playerCrossBlocked(this, prev, p.pos)) { p.pos[0] = prev[0]; p.pos[2] = prev[2]; p.speed = 0; }
    }
    this.playerTriggers();
    // Steal fill completes -> TryPickEgg / GetMemeRot.
    if (p.steal && s.t + 1e-9 >= p.steal.t0 + p.steal.dur) {
      const id = p.steal.item, it = s.items[id];
      p.steal = null;
      if (it && it.kind === 'egg' && canBeginSteal(this, 0, id)) pickEgg(this, 0, id);
      else if (it && it.kind === 'brainrot') playerStealBrainrot(this, id);
    }
  }

  // Egg pickup triggers (enter/exit) and rival-farm brainrot steal triggers (enter/stay) around the player.
  playerTriggers() {
    const s = this.state, p = s.actors[0], D = this.D, R = D.player.radius;
    const near = [];
    for (const id of Object.keys(s.items)) {
      const it = s.items[id], w = where(it);
      if (it.kind === 'egg' && (w === LOC.NEST || w === LOC.GROUND)) {
        const e = itemPos(this, id), h = D.eggIndex.get(it.eggType).trigger || [0.5, 0.5];
        const ox = Math.max(0, Math.abs(p.pos[0] - e[0]) - h[0]), oz = Math.max(0, Math.abs(p.pos[2] - e[2]) - h[1]);
        if (Math.hypot(ox, oz) <= R) near.push(id);
      } else if (it.kind === 'brainrot' && ((it.at.farm != null && it.at.farm > 0) || w === LOC.GROUND)) {
        if (dxz(p.pos, itemPos(this, id)) <= D.code.enemyStealTriggerRadius + R) near.push(id);
      }
    }
    for (const id of p.near) {
      if (near.includes(id)) continue;
      cancelSteal(this, 0, id);
      const it = s.items[id];
      if (it && it.kind === 'egg') it.waitExit = false;
    }
    const ok = p.combat.state === COMBAT.OK;
    for (const id of near) {
      const it = s.items[id];
      if (it.kind === 'egg') {
        if (!p.near.includes(id) && ok && canBeginSteal(this, 0, id)) beginSteal(this, 0, id, D.player.eggStealDuration);
      } else if (ok && !p.carry && !p.steal) {
        // PLACEHOLDER player.brainrotStealDuration: PlayerManager.SetCurrentMemeRot's tween length is lost; 2.0 s reused.
        beginSteal(this, 0, id, D.placeholders.find(x => x.key === 'player.brainrotStealDuration').value);
      }
    }
    p.near = near;
  }

  // SafeZone.OnTriggerEnter for the player and the rivals: an unsecured egg in hand is secured.
  safeZones() {
    const box = this.D.zones.safe;
    this.state.actors.forEach((a, i) => {
      const inside = inBoxXZ(box, a.pos, i === 0 ? this.D.player.radius : this.D.rivals[i - 1].radius);
      if (inside && !a.inSafe) {
        const id = carriedBy(this, i);
        if (i === 0 && id && this.state.items[id].kind === 'egg') this.tutorial('ReachSafeZone', id);
        secureCarriedEgg(this, i);
      }
      a.inSafe = inside;
    });
  }

  // Closed gates are solid for the player capsule (nav.js colliders, ids = gate node indices in art/world/scene.json).
  syncBlockers() {
    const raw = this.nav.raw;
    if (!raw || typeof raw.setBlocker !== 'function') return;
    const G = this.D.gates;
    this.state.farms.forEach((f, i) => raw.setBlocker((i === 0 ? G.player : G.ai[i - 1]).node, !f.gate.open));
  }

  // What the HUD shows this frame (derived; recomputed after every step and action).
  refreshUi() {
    const s = this.state, p = s.actors[0], D = this.D, R = D.player.radius, ok = p.combat.state === COMBAT.OK;
    const ui = emptyUi();
    const held = carriedBy(this, 0), kind = held && s.items[held] ? s.items[held].kind : null;
    if (kind && inBoxXZ(D.farm.zone, p.pos, R)) ui.placeButton = kind === 'egg' ? D.farm.placeEggText : D.farm.placeBrainrotText;
    if (ok) {
      let best = null, bd = Infinity;
      for (const id of placedBrainrots(this, 0)) {
        const d = dxz(p.pos, s.items[id].at.pos);
        if (d <= D.code.sellTriggerRadius + R && d < bd) { bd = d; best = id; }
      }
      ui.sellTarget = best;
    }
    ui.upgradePanel = inBoxXZ(D.farm.upgradeZone, p.pos, R);
    ui.capacity = { placed: placedBrainrots(this, 0).length, max: capacity(this), cost: upgradeCost(this) };
    for (const [name, box] of Object.entries(D.zones.shops)) if (inBoxXZ(box, p.pos, R)) ui.shop = name;
    // weaponManager.ChangeWapon hides the equipped weapon's pedestal (envWeapons[type]) and with it its UnlockManager trigger
    const wp = s.upgrades.weapons, hidden = wp.changed ? wp.equipped : -1;
    D.weapons.pedestals.forEach((w, i) => { if (w.weapon !== hidden && inBoxXZ(w.trigger, p.pos, R)) ui.pedestal = i; });
    ui.gateLock = s.farms[0].gate.open && insideGateTrigger(this, 0, p.pos);
    for (let f = 1; f < s.farms.length; f++) if (!s.farms[f].gate.open && insideGateTrigger(this, f, p.pos)) ui.aiGateUnlock = f;
    if (p.steal) ui.stealFill = { item: p.steal.item, progress: Math.min(1, (s.t - p.steal.t0) / p.steal.dur) };
    ui.deathPanel = p.combat.state === COMBAT.DEAD;
    ui.healthAd = p.hp < D.player.hp && !ui.deathPanel;
    s.ui = ui;
  }
}

const FLAT = { clamp: (x, z, y) => ({ x, y: y == null ? 0 : y, z }) };

function emptyUi() {
  return { placeButton: null, sellTarget: null, upgradePanel: false, capacity: null, shop: null, pedestal: null,
    gateLock: false, aiGateUnlock: null, stealFill: null, deathPanel: false, healthAd: false };
}

function indexData(data) {
  if (data.seedIndex) return data;
  const D = Object.assign({}, data);
  D.seedIndex = new Map(data.brainrots.map(b => [b.seed, b]));
  D.eggIndex = new Map(data.eggs.map(e => [e.id, e]));
  return D;
}

// Buttons of the original HUD, by name. Each returns whether it did something.
export const ACTIONS = {
  place: sim => placeCarried(sim),                                   // PLACE EGG / PLACE BRAINROT
  placeAt: (sim, a) => placeAt(sim, a.pos),                          // tap on the farm ground
  sell: (sim, a) => sellPlaced(sim, a.item || sim.state.ui.sellTarget),
  pickBrainrot: (sim, a) => pickPlacedBrainrot(sim, a.item),         // tap a brainrot on the player farm
  inventory: (sim, a) => (carriedBy(sim, 0) === a.item ? stowBrainrot(sim, 0) : equipBrainrot(sim, 0, a.item)),
  attack: sim => playerAttack(sim),
  upgradeFarm: sim => sim.state.ui.upgradePanel && upgradeFarm(sim),
  lockGate: (sim, a) => lockPlayerGate(sim, !!a.long),               // "lock" 60 s / "3mints lock" 180 s (ad)
  unlockAiGate: (sim, a) => unlockAIGate(sim, a.farm),               // "Unlock" (ad)
  buySpeed: (sim, a) => buySpeedPlan(sim, a.plan, !!a.ad),
  weaponBuy: sim => pedestalBuy(sim),
  weaponAd: sim => pedestalAd(sim),
  weaponPick: sim => pedestalPick(sim),
  batBuy: (sim, a) => batShopBuy(sim, a.i, !!a.ad),
  shopUnlock: (sim, a) => shopUnlock(sim, a.key),
  shopPick: (sim, a) => shopPick(sim, a.key),
  revive: sim => revive(sim, false),                                 // "Revive me" (ad)
  noThanks: sim => revive(sim, true),
  health: sim => refillHealth(sim),                                  // health ad panel
  adCoins: sim => { sim.addCoins(sim.D.code.adCoins, 'ad'); return true; },
  adsBreakCoins: sim => claimAdsBreakCoins(sim),                     // ads panel "Get it" (ad): +25/50/75/100
  adsBreakHealth: sim => claimAdsBreakHealth(sim),                   // ads panel (1) "Get it" (ad): full health
  // Settings panel: SoundEnabled / MusicEnabled toggles, sensitivity slider (int, rules/menus-flow.md 6)
  settings: (sim, a) => {
    const st = sim.state.settings;
    if (a.sound != null) st.sound = !!a.sound;
    if (a.music != null) st.music = !!a.music;
    if (a.sensitivity != null) st.sensitivity = Math.max(0, Math.min(10, Math.trunc(+a.sensitivity) || 0));
    return true;
  },
};
