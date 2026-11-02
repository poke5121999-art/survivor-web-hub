// Account save: the hub's HubSave layer (js/save-sync.js, Supabase game_saves) under the local save, as in
// games/casual-farm/js/cloud.js. localStorage stays the save the game reads and writes; the cloud row holds a copy.
// Guests, an offline hub or a hub without Supabase make every call a no-op.
const GAME_ID = 'cats-soup';
const PUSH_EVERY = 20000;

const hub = () => { try { return window.HubSave && window.HubSave.isAvailable() ? window.HubSave : null; } catch (e) { return null; } };
const withTimeout = (p, ms) => Promise.race([p, new Promise(ok => setTimeout(() => ok({ ok: false, reason: 'timeout' }), ms))]);

// The signed-in account (null for a guest), stamped on the local save so the next pull knows whose it is.
export function owner() {
  const h = hub();
  return h ? h.whoAmI().userId : null;
}

// Before the game reads its save. Returns the save to start from and where it came from:
// - another account's local save is parked under <key>-bak-<owner> and gives way to this account's cloud save, or to
//   a fresh game when the account has none;
// - this account's (or a guest's) local save gives way to a newer cloud save.
export async function pull(key, local) {
  const h = hub();
  if (!h) return { save: local, from: 'off' };
  const me = h.whoAmI().userId;
  const r = await withTimeout(h.loadSave(GAME_ID), 5000);
  if (!r.ok) return { save: local, from: 'off' };
  const cloud = r.found && r.payload && r.payload.v === 1 && r.payload.state ? r.payload.state : null;
  if (local && local.owner && local.owner !== me) {
    try { localStorage.setItem(`${key}-bak-${local.owner}`, JSON.stringify(local)); } catch (e) { /* storage unavailable */ }
    return { save: cloud, from: cloud ? 'cloud' : 'fresh' };
  }
  if (cloud && (cloud.savedAt || 0) > ((local && local.savedAt) || 0)) return { save: cloud, from: 'cloud' };
  return { save: local, from: 'local' };
}

let last = 0;
// After a local save: at most one upload per PUSH_EVERY ms unless forced (page hidden).
export function push(state, force = false) {
  const h = hub();
  if (!h || !state || (!force && Date.now() - last < PUSH_EVERY)) return Promise.resolve(null);
  last = Date.now();
  return h.storeSave(GAME_ID, { v: 1, state }, { version: Math.floor((state.savedAt || 0) / 1000) }).catch(() => null);
}
