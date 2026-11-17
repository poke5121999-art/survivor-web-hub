// Eggs and brainrots. Every item has exactly one location `at` (DESIGN.md):
//   {nest: animal, slot} | {ground: [x,y,z]} | {carried: actor} | {stowed: actor} | {farm: farmIdx, pos: [x,y,z]}
// Egg fields: eggType (EggItem prefab id), owner (animal index or null), secured, reservedBy (actor or null),
//   waitExit (requirePlayerExitAfterDrop pending), readyAt (unix s, on a farm), ready, hatch ({end, reward, auto}|null).
// Brainrot fields: seed (SeedData id), nextPay (sim t of the next income tick while on the player farm), reservedBy.
// EggState of the original is derived: Nest = at.nest, Carried = at.carried, Dropped = at.ground,
// Incubating/Ready = at.farm with ready false/true. Rules: rules/animals-eggs.md, carry-steal.md, farm-economy.md.
import { onEggStolen, onEggDroppedOutside, onEggSecured, onEggCommitted } from './animals.js';
import { copy } from './util.js';

export const LOC = Object.freeze({ NEST: 'nest', GROUND: 'ground', CARRIED: 'carried', STOWED: 'stowed', FARM: 'farm' });
export const where = item => (item.at.nest != null ? LOC.NEST : item.at.ground ? LOC.GROUND : item.at.carried != null ? LOC.CARRIED
  : item.at.stowed != null ? LOC.STOWED : LOC.FARM);

export function newItem(sim, fields) {
  const s = sim.state, id = 'i' + s.nextId++;
  s.items[id] = fields;
  return id;
}

export function removeItem(sim, id) {
  delete sim.state.items[id];
}

export function itemPos(sim, id) {
  const it = sim.state.items[id], at = it.at;
  switch (where(it)) {
    case LOC.NEST: return sim.state.animals[at.nest].nests[at.slot];
    case LOC.GROUND: return at.ground;
    case LOC.CARRIED: return sim.state.actors[at.carried].pos;
    case LOC.STOWED: return sim.state.actors[at.stowed].pos;
    default: return at.pos;
  }
}

export const carriedBy = (sim, a) => sim.state.actors[a].carry && sim.state.actors[a].carry.item;
export const isEmpty = (sim, a) => !sim.state.actors[a].carry;
export const carryKind = (sim, a) => {
  const id = carriedBy(sim, a);
  return id ? sim.state.items[id].kind : null;
};

function setCarry(sim, a, id) {
  const actor = sim.state.actors[a];
  actor.carry = id ? { item: id } : null;
  if (id) sim.state.items[id].at = { carried: a };
}

// --- eggs ---------------------------------------------------------------------------------------------------------

// EggItem.CanBeginSteal (EI.c:57): not secured, Nest or Dropped, not reserved by an AI, not waiting for the player to
// leave after a drop. The hand must be empty (PlayerCarryController.IsEmpty).
export function canBeginSteal(sim, a, id) {
  const it = sim.state.items[id];
  if (!it || it.kind !== 'egg' || it.secured || it.hatch) return false;
  const w = where(it);
  if (w !== LOC.NEST && w !== LOC.GROUND) return false;
  if (it.reservedBy != null) return false;
  if (w === LOC.GROUND && it.waitExit) return false;
  return isEmpty(sim, a);
}

// EggItem.CanAIPickup (EI.c:11): owned, not secured, Nest or Dropped, reservation free or mine.
export function canAIPickup(sim, a, id) {
  const it = sim.state.items[id];
  if (!it || it.kind !== 'egg' || it.secured || it.owner == null) return false;
  const w = where(it);
  if (w !== LOC.NEST && w !== LOC.GROUND) return false;
  return it.reservedBy == null || it.reservedBy === a;
}

export function tryReserveEgg(sim, a, id) {
  if (!canAIPickup(sim, a, id)) return false;
  sim.state.items[id].reservedBy = a;
  return true;
}

export function releaseEgg(sim, a, id) {
  const it = id && sim.state.items[id];
  if (it && it.reservedBy === a) it.reservedBy = null;
}

// TryPickEgg + EggItem.OnPickedUp / PickUpByAI: into the hand, owner animal starts chasing the thief.
export function pickEgg(sim, a, id) {
  const it = sim.state.items[id];
  cancelStealsOn(sim, id, a);
  it.waitExit = false;
  it.reservedBy = null;
  setCarry(sim, a, id);
  sim.emit('pick', { actor: a, item: id, kind: 'egg' });
  if (!it.secured && it.owner != null) onEggStolen(sim, it.owner, id, a);
  if (a === 0) sim.tutorial('StealAnimalEgg', id);
}

// ForceDropEgg (player, waitExit true, +2.0 up) / DropAtByAI (rival, waitExit false, +0.2 up). The egg falls to the
// floor under that point; `from` keeps the release height for the view.
export function dropEgg(sim, a, { waitExit, height, notifyAnimal = true }) {
  const actor = sim.state.actors[a], id = carriedBy(sim, a);
  if (!id) return null;
  const it = sim.state.items[id];
  actor.carry = null;
  it.secured = false;
  it.hatch = null;
  it.reservedBy = null;
  const floor = sim.nav.closest(actor.pos);
  it.at = { ground: floor };
  it.waitExit = !!waitExit && sim.D.eggIndex.get(it.eggType).requireExit;
  sim.emit('drop', { actor: a, item: id, kind: 'egg', pos: copy(floor), from: [actor.pos[0], actor.pos[1] + height, actor.pos[2]] });
  if (notifyAnimal && it.owner != null) onEggDroppedOutside(sim, it.owner, id);
  return id;
}

// SafeZone / rival return point: OnSafeZoneEntered -> AnimalEggController.OnPlayerReachedSafeZone -> MarkSecured.
export function secureCarriedEgg(sim, a) {
  const id = carriedBy(sim, a);
  if (!id) return false;
  const it = sim.state.items[id];
  if (it.kind !== 'egg' || it.secured || it.owner == null) return false;
  const owner = it.owner;
  it.secured = true;
  it.owner = null;
  sim.emit('secured', { actor: a, item: id, animal: owner });
  onEggSecured(sim, owner, id);
  return true;
}

// EggItem.PlaceOnFarm / PlaceOnEnemyFarm: Incubating with a wall-clock ready time (FarmPlacedEgg.InitializeNew).
export function placeEggOnFarm(sim, a, id, farm, pos) {
  const it = sim.state.items[id], def = sim.D.eggIndex.get(it.eggType);
  sim.state.actors[a].carry = null;
  const owner = it.owner;
  it.at = { farm, pos: copy(pos) };
  it.hatch = null;
  it.reservedBy = null;
  it.waitExit = false;
  it.readyAt = Math.floor(sim.now()) + Math.max(sim.D.code.hatchMinSeconds, Math.trunc(def.hatch));
  it.ready = false;
  it.secured = true;
  it.owner = null;
  if (owner != null) onEggCommitted(sim, owner, id);
  sim.emit('place', { actor: a, item: id, kind: 'egg', farm, pos: copy(pos), readyAt: it.readyAt });
}

// EggItem.GetRandomRewardData: uniform over the non-null rewardOptions.
export function rollReward(sim, eggType) {
  const opts = sim.D.eggIndex.get(eggType).options;
  return opts[Math.min(opts.length - 1, Math.floor(sim.rand() * opts.length))];
}

// --- brainrots ----------------------------------------------------------------------------------------------------

export function newBrainrot(sim, seed, at) {
  return newItem(sim, { kind: 'brainrot', seed, at, nextPay: null, reservedBy: null });
}

// PlayerCarryController.TryPickBrainrot / AI carry: hand must be empty.
export function carryBrainrot(sim, a, id) {
  if (!isEmpty(sim, a)) return false;
  const it = sim.state.items[id];
  cancelStealsOn(sim, id, a);
  it.nextPay = null;
  it.reservedBy = null;
  setCarry(sim, a, id);
  sim.emit('pick', { actor: a, item: id, kind: 'brainrot' });
  return true;
}

// StowCurrentBrainrot: the held brainrot goes to the hidden stowed list (inventory bar button stays).
export function stowBrainrot(sim, a) {
  const id = carriedBy(sim, a);
  if (!id || sim.state.items[id].kind !== 'brainrot') return false;
  sim.state.actors[a].carry = null;
  sim.state.items[id].at = { stowed: a };
  sim.emit('stow', { actor: a, item: id });
  return true;
}

// EquipStowedBrainrot: only with empty hands.
export function equipBrainrot(sim, a, id) {
  const it = sim.state.items[id];
  if (!it || it.at.stowed !== a) return false;
  if (!isEmpty(sim, a)) {
    sim.toast('You can carry only one Egg or Brainrot');
    return false;
  }
  setCarry(sim, a, id);
  sim.emit('equip', { actor: a, item: id });
  return true;
}

// Inventory bar order = held and stowed brainrots of the player, oldest first.
export function inventory(sim, a = 0) {
  return Object.keys(sim.state.items).filter(id => {
    const it = sim.state.items[id];
    return it.kind === 'brainrot' && (it.at.carried === a || it.at.stowed === a);
  }).sort((x, y) => +x.slice(1) - +y.slice(1));
}

// --- steal fill (player only: the circular "Steal it" timer) ---------------------------------------------------------

export function beginSteal(sim, a, id, duration) {
  const actor = sim.state.actors[a];
  if (actor.steal && actor.steal.item === id) return;
  cancelSteal(sim, a);
  actor.steal = { item: id, t0: sim.state.t, dur: duration };
  sim.emit('stealStart', { actor: a, item: id, duration });
}

export function cancelSteal(sim, a, id = null) {
  const actor = sim.state.actors[a];
  if (!actor.steal || (id && actor.steal.item !== id)) return;
  const was = actor.steal.item;
  actor.steal = null;
  sim.emit('stealCancel', { actor: a, item: was });
}

function cancelStealsOn(sim, id, except) {
  sim.state.actors.forEach((actor, a) => { if (a !== except && actor.steal && actor.steal.item === id) cancelSteal(sim, a, id); });
}
