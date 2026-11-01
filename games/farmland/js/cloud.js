// Account save: the hub's HubSave layer (../../js/save-sync.js, Supabase game_saves) under the local save, as in
// casual-farm. localStorage stays the save the game reads and writes; this module copies the meta record and every
// farmland-<world>-v1 record into one cloud payload and back. Guests, an offline hub or a hub without Supabase make
// every call a no-op, and the game runs on the local save alone.
const GAME_ID = 'farmland';
export const META_KEY = 'farmland-meta-v1';
const WORLD_RE = /^farmland-([a-z0-9]+)-v1$/;
const PUSH_EVERY = 20000;

const hub = () => { try { return window.HubSave && window.HubSave.isAvailable() ? window.HubSave : null; } catch (e) { return null; } };
const read = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } };
const remove = k => { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } };
const keys = () => { try { return Object.keys(localStorage); } catch (e) { return []; } };
const withTimeout = (p, ms) => Promise.race([p, new Promise(ok => setTimeout(() => ok({ ok: false, reason: 'timeout' }), ms))]);
const worldKeys = () => keys().filter(k => k !== META_KEY && WORLD_RE.test(k));

export function localPayload() {
  const worlds = {};
  for (const k of worldKeys()) worlds[k.match(WORLD_RE)[1]] = read(k);
  const meta = read(META_KEY);
  return { v: 1, at: (meta && meta.savedAt) || 0, meta, worlds };
}

function replaceLocal(p) {
  for (const k of worldKeys()) remove(k);
  for (const [id, d] of Object.entries(p.worlds || {})) if (d) write(`farmland-${id}-v1`, d);
  if (p.meta) write(META_KEY, p.meta); else remove(META_KEY);
}

// Before the game reads its save. The local save carries the account it belongs to (meta.owner):
// - another account's local save is parked under farmland-bak-<owner> and replaced by this account's cloud save, or by
//   nothing (a fresh game) when it has none;
// - this account's save (or a guest's, which the account then adopts) gives way to a newer cloud save.
// Resolves 'cloud', 'local', 'fresh' or 'off'.
export async function pull() {
  const h = hub();
  if (!h) return 'off';
  const me = h.whoAmI().userId;
  const local = localPayload();
  const owner = local.meta && local.meta.owner;
  const r = await withTimeout(h.loadSave(GAME_ID), 5000);
  if (!r || !r.ok) return 'off';
  const cloud = r.found && r.payload && r.payload.v === 1 ? r.payload : null;
  if (owner && owner !== me) {
    write(`farmland-bak-${owner}`, local);
    replaceLocal(cloud || { worlds: {} });
    return cloud ? 'cloud' : 'fresh';
  }
  if (cloud && (cloud.at || 0) > local.at) { replaceLocal(cloud); return 'cloud'; }
  return 'local';
}

// The signed-in account, stamped on the local save so the next pull knows whose it is (null for a guest).
export function owner() {
  const h = hub();
  return h ? h.whoAmI().userId : null;
}

let last = 0;
// After a local save: at most one upload per PUSH_EVERY ms unless forced (page hidden, island change).
export function push(force = false) {
  const h = hub();
  if (!h || (!force && Date.now() - last < PUSH_EVERY)) return Promise.resolve(null);
  last = Date.now();
  const p = localPayload();
  if (!p.meta) return Promise.resolve(null);
  return h.storeSave(GAME_ID, p, { version: p.meta.ver || 0 }).catch(() => null);
}
