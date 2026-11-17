// Save/load, rules/inventory-save.md. The whole sim state is plain JSON stored under localStorage key `steal-egg-v1`
// (DESIGN.md); Sim.load restores it exactly. Opening the game again is a new scene load in the original, so
// startSession() then applies what the original does NOT keep:
//   kept: coins (Coin), player farm level/eggs/brainrots with wall-clock readyAt (EggFarmSystem_FreePlacement_v1),
//         rival farms (EnemyFarmSystem_AI_0n), held + stowed brainrots as stowed inventory (InventoryData), speed plans
//         and saved speed, weapon/cosmetic unlocks and ad counters, settings, tutorial.
//   reset: player health, position and carried egg; rivals (home, idle, carried item lost); animals and their nests
//         (fresh batches); gates (1 s / 30 / 50 / 40 s closed again); hatch transitions; brainrot income restarts.
import { initAnimals, clearNests } from './animals.js';
import { initGates } from './gates.js';
import { newRivalBrain } from './rivals.js';
import { newCombat } from './combat.js';
import { applySavedSpeed, newUpgrades } from './upgrades.js';
import { newAdsBreak } from './adsbreak.js';
import { removeItem } from './items.js';
import { copy } from './util.js';

export const SAVE_KEY = 'steal-egg-v1';
export const SAVE_VERSION = 1;

export const serialize = state => JSON.stringify(state);

export function deserialize(json) {
  const s = typeof json === 'string' ? JSON.parse(json) : JSON.parse(JSON.stringify(json));
  if (!s || s.v !== SAVE_VERSION || !s.items || !s.actors) return null;
  return s;
}

// Saves written before Drop 2 (same version 1) lack the shop/settings fields: fill them with the original's defaults
// (nothing bought, bat in hand, SoundEnabled 1, MusicEnabled 1, sensitivity 10). There is no vibration setting in the
// original (rules/menus-flow.md 6): the Drop 1 placeholder key is dropped.
export function migrate(s, D) {
  const fresh = newUpgrades();
  s.upgrades = s.upgrades || fresh;
  const u = s.upgrades;
  for (const k of Object.keys(fresh)) if (u[k] == null) u[k] = fresh[k];
  for (const k of Object.keys(fresh.weapons)) if (u.weapons[k] == null) u.weapons[k] = fresh.weapons[k];
  for (const k of Object.keys(fresh.cosmetics)) if (u.cosmetics[k] == null) u.cosmetics[k] = fresh.cosmetics[k];
  s.settings = { ...D.settings, ...(s.settings || {}) };
  delete s.settings.vibration;
  if (!s.adsBreak) s.adsBreak = newAdsBreak(D);
  return s;
}

export function startSession(sim) {
  const s = sim.state, D = sim.D;
  // Items: keep farms and the player's brainrots; everything in the world or in a rival's hands goes.
  for (const id of Object.keys(s.items)) {
    const it = s.items[id];
    if (it.at.farm != null) {
      it.hatch = null;
      it.reservedBy = null;
      if (it.kind === 'brainrot') it.nextPay = it.at.farm === 0 ? s.t + D.code.incomeInterval : null;
      continue;
    }
    if (it.kind === 'brainrot' && (it.at.carried === 0 || it.at.stowed === 0)) { it.at = { stowed: 0 }; it.reservedBy = null; continue; }
    removeItem(sim, id);
  }
  const p = s.actors[0];
  const start = sim.nav.closest(D.player.start);
  Object.assign(p, {
    pos: start, yaw: D.player.startYaw, hp: D.player.hp, stunUntil: 0, carry: null, steal: null, attack: null,
    combat: newCombat(), near: [], inSafe: false, moveSpeed: D.player.moveSpeed, speed: 0, blend: 0, vy: 0,
  });
  for (let a = 1; a < s.actors.length; a++) {
    const r = D.rivals[a - 1];
    Object.assign(s.actors[a], { pos: copy(r.home), yaw: r.homeYaw, carry: null, stunUntil: 0, speed: 0, nav: null, moving: false, inSafe: false });
    s.actors[a].brain = newRivalBrain(sim, a);
  }
  clearNests(sim);
  initAnimals(sim);
  const levels = s.farms.map(f => f.level);
  initGates(sim);
  s.farms[0].level = levels[0] || 0;
  s.adsBreak = newAdsBreak(D);           // AdsBraker restarts its countdown with the scene; Rewardpanel's counter is static
  applySavedSpeed(sim);
}
