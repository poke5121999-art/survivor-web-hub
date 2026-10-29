// Player progress, kept in localStorage under one key. Version 1 saves (level/best/sound only) upgrade in place.
// Item names are the item id without its kind prefix ('skin.ice_cream' -> owned.skins 'ice_cream').
// claimed: {roadResource: highest claimed threshold value}; flags: {flagId: qty}; collections: completed ids;
// pending: rewards granted by a road whose system is not built yet (boosters, ...), kept for the phase that adds it.
// modes: {modeId: {unlocked?, levels?, level, best, done: [level indices finished]}}; Normal keeps level/best at the top.
// inv: other quantities, keyed by the original resource id (currency.skip_tickets, progression.lucky_wheel_claims,
// progression.piggy_bank_progress / _claims / _skips). periodic: {periodicResourceId: day id of its last claim}.
// The day's skipped levels live in flags as flag.nb_levels_skipped_<day id>, as in the original.
// installed: ms of the first run (js/ads.js welcome / No Ads offers); older saves get the time they are first read.

const KEY = 'stickman-hook';

export const DEFAULT_EQUIP = { skins: 'basic', ropes: 'basic', trails: 'basic' };

function fresh() {
  return {
    v: 2, level: 0, best: 0, sound: true, coins: 0, xp: 0, installed: Date.now(),
    owned: { skins: ['basic'], ropes: ['basic'], trails: ['basic'] },
    equipped: { ...DEFAULT_EQUIP },
    modes: {}, claimed: {}, flags: {}, collections: [], pending: [], inv: {}, periodic: {},
  };
}

export function readSave() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch { /* private mode or bad JSON */ }
  const base = fresh();
  if (!s || typeof s !== 'object') return base;
  return {
    ...base, ...s, v: 2, installed: s.installed || base.installed,
    owned: { ...base.owned, ...(s.owned || {}) },
    equipped: { ...base.equipped, ...(s.equipped || {}) },
    modes: { ...(s.modes || {}) },
    claimed: { ...(s.claimed || {}) },
    flags: { ...(s.flags || {}) },
    collections: [...(s.collections || [])],
    pending: [...(s.pending || [])],
    inv: { ...(s.inv || {}) },
    periodic: { ...(s.periodic || {}) },
  };
}

export function writeSave(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ }
}

export function owns(s, kind, name) { return s.owned[kind].includes(name); }

export function grant(s, kind, name) {
  if (!owns(s, kind, name)) s.owned[kind].push(name);
}
