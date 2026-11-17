// Farms, rules/farm-economy.md (player farm = farm 0) and rules/ai-rivals.md 8 (EnemyFarmManager, farms 1..3).
// Player farm: PLACE button puts the carried egg or brainrot at a random free spot (25 tries, 0.8 m spacing); eggs have
// no cap, brainrots are capped by capacities[level]; a placed egg is READY at its wall-clock readyAt; an empty-handed
// player within 1.15 m of a ready egg hatches it (0.5 s, uniform reward) and the brainrot is auto-placed at the egg spot;
// every placed brainrot pays ratePerSecond each 1.0 s; selling pays MemeRotCharacter.price.
// Rival farms: eggs hatch by themselves at readyAt (cap 20 brainrots), brainrots earn nothing.
import { newBrainrot, carriedBy, isEmpty, placeEggOnFarm, rollReward, carryBrainrot, removeItem } from './items.js';
import { d2xz, d3, dxz, randRange, boxPoint, boxBounds, inBoxXZ, copy } from './util.js';
import { onBrainrotStolenFromMyFarm } from './rivals.js';
import { onFarmBrainrotStolen } from './gates.js';

export const capacity = (sim, level = sim.state.farms[0].level) => {
  const c = sim.D.farm.capacities;
  return c[Math.max(0, Math.min(level, c.length - 1))];
};
export const isMaxLevel = sim => sim.state.farms[0].level >= sim.D.farm.capacities.length - 1;
export const upgradeCost = sim => (isMaxLevel(sim) ? 0 : sim.D.farm.upgradePrices[Math.min(sim.state.farms[0].level, sim.D.farm.upgradePrices.length - 1)]);

export const farmItems = (sim, f, kind = null) => Object.keys(sim.state.items).filter(id => {
  const it = sim.state.items[id];
  return it.at.farm === f && (!kind || it.kind === kind);
});
export const placedBrainrots = (sim, f = 0) => farmItems(sim, f, 'brainrot');

function hasSpacing(sim, f, pos, ignore = null, xzOnly = false) {
  const min = f === 0 ? sim.D.farm.spacing : sim.D.rivalFarms[f - 1].spacing;
  if (min <= 0) return true;
  return farmItems(sim, f).every(id => id === ignore || (xzOnly ? d2xz(sim.state.items[id].at.pos, pos) >= min * min : d3(sim.state.items[id].at.pos, pos) >= min));
}

// PlayerFarmInteractionZone.GetRandomPlacementPosition + SnapToGround (+ groundOffset).
function randomFarmSpot(sim) {
  const F = sim.D.farm;
  const p = boxPoint(F.area, sim.rand() * 2 - 1, sim.rand() * 2 - 1, F.edgePadding);
  const g = sim.nav.closest(p);
  return [p[0], g[1] + F.groundOffset, p[2]];
}

// FarmManager.TryPlaceBrainrot: capacity, then spacing.
function tryPlaceBrainrot(sim, id, pos, quiet = false) {
  if (placedBrainrots(sim).length >= capacity(sim)) {
    if (!quiet) sim.toast('Farm is full. Upgrade capacity first');
    return 'full';
  }
  const p = [pos[0], pos[1] + sim.D.farm.yOffset, pos[2]];
  if (!hasSpacing(sim, 0, p, id)) return 'spacing';
  const it = sim.state.items[id];
  if (it.at.carried != null) sim.state.actors[it.at.carried].carry = null;
  it.at = { farm: 0, pos: p };
  it.reservedBy = null;
  it.nextPay = sim.state.t + sim.D.code.incomeInterval;
  sim.emit('place', { actor: 0, item: id, kind: 'brainrot', farm: 0, pos: copy(p) });
  sim.tutorial('PlaceBrainrotOnFarm', id);
  return 'ok';
}

function tryPlaceEgg(sim, id, pos) {
  if (!hasSpacing(sim, 0, pos, id)) return 'spacing';
  placeEggOnFarm(sim, 0, id, 0, pos);
  sim.tutorial('PlaceEggOnFarm', id);
  return 'ok';
}

// PLACE EGG / PLACE BRAINROT button (PlaceCurrentCarry): egg first, 25 random candidates.
export function placeCarried(sim) {
  const id = carriedBy(sim, 0);
  if (!id || !sim.state.ui.placeButton) return false;
  const kind = sim.state.items[id].kind;
  if (kind === 'brainrot' && placedBrainrots(sim).length >= capacity(sim)) {
    sim.toast('Farm is full. Upgrade capacity first');
    return false;
  }
  for (let k = 0; k < Math.max(1, sim.D.farm.attempts); k++) {
    const p = randomFarmSpot(sim);
    const r = kind === 'egg' ? tryPlaceEgg(sim, id, p) : tryPlaceBrainrot(sim, id, p);
    if (r === 'ok') return true;
  }
  sim.toast('Place it a little farther away');
  return false;
}

// FarmGround tap: place the carried thing at the tapped farm point.
export function placeAt(sim, pos) {
  const id = carriedBy(sim, 0);
  if (!inBoxXZ(sim.D.farm.area, pos)) return false;
  if (!id) { sim.toast('Carry an egg or Brainrot first'); return false; }
  const g = sim.nav.closest(pos), p = [pos[0], g[1], pos[2]];
  const r = sim.state.items[id].kind === 'egg' ? tryPlaceEgg(sim, id, p) : tryPlaceBrainrot(sim, id, p);
  if (r === 'spacing') sim.toast('Place it a little farther away');
  return r === 'ok';
}

// FarmBrainrotPickup.OnPointerClick -> FarmManager.TryPickBrainrot (a tap, no distance limit in the original).
export function pickPlacedBrainrot(sim, id) {
  const it = sim.state.items[id];
  if (!it || it.kind !== 'brainrot' || it.at.farm !== 0) return false;
  if (!isEmpty(sim, 0)) { sim.toast('Your hands are not empty'); return false; }
  return carryBrainrot(sim, 0, id);
}

// PlayerManager.SellCharacter on the brainrot whose sell trigger the player stands in.
export function sellPlaced(sim, id = sim.state.ui.sellTarget) {
  const it = id && sim.state.items[id];
  if (!it || it.kind !== 'brainrot' || it.at.farm !== 0) return false;
  const price = sim.D.seedIndex.get(it.seed).price;
  removeItem(sim, id);
  sim.addCoins(price, 'sell');
  sim.emit('sell', { item: id, seed: it.seed, price });
  sim.tutorial('SellFarmBrainrot', id);
  return true;
}

// FarmManager.UpgradeFarm (button in the FarmUpgradeZone panel).
export function upgradeFarm(sim) {
  if (isMaxLevel(sim)) { sim.toast('Farm is already max level'); return false; }
  const cost = upgradeCost(sim);
  if (sim.state.coins < cost) { sim.toast('Not enough coins'); return false; }
  sim.addCoins(-cost, 'farmUpgrade');
  sim.state.farms[0].level++;
  sim.toast('Farm capacity upgraded');
  sim.emit('farmUpgrade', { level: sim.state.farms[0].level, capacity: capacity(sim) });
  sim.tutorial('FarmUpgrade', null);
  return true;
}

// --- per frame: income, readiness, hatching -------------------------------------------------------------------------

export function stepFarms(sim, dt) {
  const s = sim.state, now = Math.floor(sim.now()), interval = sim.D.code.incomeInterval;
  for (const id of Object.keys(s.items)) {
    const it = s.items[id];
    if (!it || it.at.farm == null) continue;
    if (it.kind === 'brainrot') {
      if (it.at.farm === 0 && it.nextPay != null) {
        while (s.t >= it.nextPay - 1e-9) {
          it.nextPay += interval;
          const rate = sim.D.seedIndex.get(it.seed).rate;
          if (rate > 0) { sim.addCoins(rate, 'income', true); sim.emit('income', { item: id, amount: rate }); }
        }
      }
      continue;
    }
    // FarmPlacedEgg (player): ready when readyAt - now < 1. EnemyFarmPlacedEgg: now >= readyAt.
    if (!it.ready && it.readyAt - now < 1) {
      it.ready = true;
      sim.emit('eggReady', { item: id, farm: it.at.farm });
      if (it.at.farm === 0) sim.tutorial('WaitForEggHatch', id);
    }
    if (it.hatch && s.t >= it.hatch.end) completeHatch(sim, id);
    else if (it.ready && !it.hatch && it.at.farm > 0) tryEnemyHatch(sim, id);
  }
  autoHatch(sim);
}

// ReadyEggAutoPlaceTrigger: an empty-handed player within 1.15 m of a ready egg starts TryHatchEgg.
function autoHatch(sim) {
  const s = sim.state, player = s.actors[0];
  if (player.gone || player.carry || player.combat.state !== 'ok') return;
  const r = sim.D.code.readyEggTriggerRadius + sim.D.player.radius;
  if (farmItems(sim, 0, 'egg').some(id => s.items[id].hatch)) return;
  for (const id of farmItems(sim, 0, 'egg')) {
    const it = s.items[id];
    if (!it.ready || it.hatch || dxz(player.pos, it.at.pos) > r) continue;
    it.hatch = { end: s.t + Math.max(0.01, sim.D.eggIndex.get(it.eggType).transition), reward: rollReward(sim, it.eggType), auto: true };
    sim.emit('hatchStart', { item: id, farm: 0, reward: it.hatch.reward });
    return;
  }
}

function completeHatch(sim, id) {
  const s = sim.state, it = s.items[id], h = it.hatch, f = it.at.farm, pos = copy(it.at.pos);
  if (f === 0) {
    // CompletePlayerEggHatch: into the hands, then the auto routine places it where the egg was.
    if (!isEmpty(sim, 0)) {
      it.hatch = null;
      sim.toast('Your hands are not empty');
      sim.emit('hatchCancel', { item: id });
      return;
    }
    removeItem(sim, id);
    const b = newBrainrot(sim, h.reward, { carried: 0 });
    s.actors[0].carry = { item: b };
    sim.emit('hatch', { egg: id, item: b, seed: h.reward, farm: 0, pos });
    sim.tutorial('CarryHatchedBrainrot', b);
    if (h.auto) {
      const g = sim.nav.closest(pos);
      tryPlaceBrainrot(sim, b, [pos[0], g[1] + sim.D.farm.groundOffset, pos[2]]);
    }
    return;
  }
  // CompleteEnemyEggHatch
  const F = sim.D.rivalFarms[f - 1];
  if (F.maxBrainrots > 0 && placedBrainrots(sim, f).length >= F.maxBrainrots) {
    it.hatch = null;
    return;
  }
  removeItem(sim, id);
  const b = newBrainrot(sim, h.reward, { farm: f, pos });
  sim.emit('hatch', { egg: id, item: b, seed: h.reward, farm: f, pos });
}

// EnemyFarmManager.TryAutoHatchEgg: waits while the farm holds maxBrainrots.
function tryEnemyHatch(sim, id) {
  const it = sim.state.items[id], f = it.at.farm, F = sim.D.rivalFarms[f - 1];
  if (F.maxBrainrots > 0 && placedBrainrots(sim, f).length >= F.maxBrainrots) return;
  it.hatch = { end: sim.state.t + Math.max(0.01, sim.D.eggIndex.get(it.eggType).transition), reward: rollReward(sim, it.eggType), auto: false };
  sim.emit('hatchStart', { item: id, farm: f, reward: it.hatch.reward });
}

// --- rival farms ----------------------------------------------------------------------------------------------------

// EnemyFarmManager.FindPlacementPosition: uniform in the farm area bounds, 0.8 m XZ spacing, 30 tries, else centre.
function enemySpot(sim, f) {
  const F = sim.D.rivalFarms[f - 1], b = boxBounds(F.area);
  const y = F.area.c[1] + b.ext[1] + F.yOffset;
  for (let k = 0; k < Math.max(1, F.attempts); k++) {
    const p = [randRange(sim.state, b.min[0], b.max[0]), y, randRange(sim.state, b.min[2], b.max[2])];
    if (hasSpacing(sim, f, p, null, true)) return p;
  }
  return [F.area.c[0], y, F.area.c[2]];
}

export function enemyPlaceEgg(sim, a, id) {
  const f = sim.D.rivals[a - 1].farm + 1;
  placeEggOnFarm(sim, a, id, f, enemySpot(sim, f));
  return true;
}

export function enemyPlaceBrainrot(sim, a, id) {
  const f = sim.D.rivals[a - 1].farm + 1, F = sim.D.rivalFarms[f - 1];
  if (F.maxBrainrots > 0 && placedBrainrots(sim, f).length >= F.maxBrainrots) return false;
  const it = sim.state.items[id];
  sim.state.actors[a].carry = null;
  it.at = { farm: f, pos: enemySpot(sim, f) };
  it.nextPay = null;
  it.reservedBy = null;
  sim.emit('place', { actor: a, item: id, kind: 'brainrot', farm: f, pos: copy(it.at.pos) });
  return true;
}

// FarmManager.ReserveClosestBrainrotForAI / ReleaseBrainrotAIReservation / TryEnemyStealBrainrot.
export function reserveClosestBrainrotForAI(sim, a) {
  const me = sim.state.actors[a].pos;
  let best = null, bd = Infinity;
  for (const id of placedBrainrots(sim, 0)) {
    const it = sim.state.items[id];
    if (it.reservedBy != null && it.reservedBy !== a) continue;
    const d = d2xz(me, it.at.pos);
    if (d < bd) { bd = d; best = id; }
  }
  if (best) sim.state.items[best].reservedBy = a;
  return best;
}

export function releaseBrainrot(sim, a, id) {
  const it = id && sim.state.items[id];
  if (it && it.reservedBy === a) it.reservedBy = null;
}

export function tryEnemyStealBrainrot(sim, id) {
  const it = sim.state.items[id];
  if (!it || it.at.farm !== 0) return false;
  it.nextPay = null;
  return true;
}

// Player completes the steal fill on a rival-farm (or loose) brainrot: GetMemeRot -> OnStealMemeRotCharacter.
export function playerStealBrainrot(sim, id) {
  const it = sim.state.items[id];
  if (!it || it.kind !== 'brainrot' || it.at.farm === 0 || !isEmpty(sim, 0)) return false;
  const from = it.at.farm;
  carryBrainrot(sim, 0, id);
  sim.emit('playerStole', { item: id, from: from == null ? null : from });
  sim.tutorial('StealAIBrainrot', id);
  if (from != null && from > 0) {
    const owner = sim.D.rivals.findIndex(r => r.farm + 1 === from) + 1;
    if (owner > 0) onBrainrotStolenFromMyFarm(sim, owner, id);
    onFarmBrainrotStolen(sim, from);
  }
  return true;
}

