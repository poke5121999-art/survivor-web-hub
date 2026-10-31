// Building lifecycle (BuildingCtrller.CheckBuildingState): every building is in exactly one status, derived from the
// save (which buildings are bought) and the player level:
//   hidden       a prerequisite (m_PreBuildings) is not bought yet: lockRoot shows, no pad
//   levelLocked  prerequisites met but player level < m_LockPlayerLv: the lockPlayerLv sign shows
//   locked       prerequisites and level met, m_HasLock: the unlock pad (Pre_LockFrame) takes coins
//   active       bought, or never locked (no pad, no cost): activeRoot shows
export const STATUS = ['hidden', 'levelLocked', 'locked', 'active'];

export function statusOf(b, state) {
  if (state.bought[b.id]) return 'active';
  if (!b.pre.every(p => state.bought[p])) return 'hidden';
  if (state.level < b.lv) return 'levelLocked';
  if (b.hasLock && b.cost > 0) return 'locked';
  return 'active';
}

// Buildings that became active without a pad (no lock, prerequisites met) are recorded as bought so later checks
// and the save see them; returns the ids that changed this call.
export function settle(world, state) {
  const opened = [];
  let again = true;
  while (again) {
    again = false;
    for (const b of world.buildings.values()) {
      if (state.bought[b.id]) continue;
      if (statusOf(b, state) === 'active') {
        state.bought[b.id] = true;
        opened.push(b.id);
        again = true;
      }
    }
  }
  return opened;
}
