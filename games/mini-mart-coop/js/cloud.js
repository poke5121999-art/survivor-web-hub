// Account save for co-op stores: the hub's HubSave (js/save-sync.js, Supabase game_saves, game_id mini-mart-coop) under
// the local records, like games/casual-farm/js/cloud.js does for the solo game. Only a host's stores are saved: a guest
// plays on someone else's. Records merge one by one, newest savedAt wins, so two devices of one account keep both
// sets of stores. Without a signed-in hub account every call is a no-op.
const GAME_ID = 'mini-mart-coop';
const PUSH_EVERY = 20000;
const hub = () => { try { return window.HubSave && window.HubSave.isAvailable() ? window.HubSave : null; } catch (e) { return null; } };
const withTimeout = (p, ms) => Promise.race([p, new Promise(ok => setTimeout(() => ok({ ok: false, reason: 'timeout' }), ms))]);

// stores: () => { id: record }, put(record): writes one record locally.
export async function pull(stores, put, drop = () => {}) {
  const h = hub();
  if (!h) return 'off';
  const r = await withTimeout(h.loadSave(GAME_ID), 5000);
  if (!r.ok || !r.found || !r.payload || r.payload.v !== 1) return r.ok ? 'empty' : 'off';
  const mine = stores();
  // Delete Account elsewhere: stores saved before it go here too.
  const wiped = r.payload.wipedAt || 0;
  wipedAt = Math.max(wipedAt, wiped);
  if (wiped) for (const rec of Object.values(mine)) if ((rec.savedAt || 0) < wiped) drop(rec.id);
  let n = 0;
  for (const rec of Object.values(r.payload.stores || {})) {
    const cur = mine[rec.id];
    if (!cur || (rec.savedAt || 0) > (cur.savedAt || 0)) { put(rec); n++; }
  }
  return n ? 'cloud' : 'local';
}

let last = 0, ver = 0, wipedAt = 0;
export function push(stores, force = false) {
  const h = hub();
  if (!h || (!force && Date.now() - last < PUSH_EVERY)) return Promise.resolve(null);
  last = Date.now();
  // The hub caps a save at 100 KB: the most recently played stores go up first, the rest stay on this device.
  const keep = {};
  let bytes = 0;
  for (const rec of Object.values(stores()).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))) {
    const n = JSON.stringify(rec).length;
    if (bytes + n > 90000) continue;
    keep[rec.id] = rec;
    bytes += n;
  }
  return h.storeSave(GAME_ID, { v: 1, at: last, wipedAt, stores: keep }, { version: ++ver }).catch(() => null);
}

// Settings > Delete Account (as games/casual-farm/js/cloud.js wipe): the cloud row becomes an empty save marked
// wipedAt, so other devices drop their older stores on their next pull.
export async function wipe() {
  wipedAt = Date.now();
  const h = hub();
  if (h) await withTimeout(h.storeSave(GAME_ID, { v: 1, at: wipedAt, wipedAt, stores: {} }, { version: ++ver }).catch(() => null), 5000);
}
