// Account save: the hub's HubSave layer (js/save-sync.js, Supabase game_saves) under the local save. localStorage stays
// the save the game reads and writes; this module copies every mmm-*-v1 record into one cloud payload and back.
// Guests, an offline hub or a hub without Supabase make every call a no-op, and the game runs on the local save alone.
// A themed game (window.MM_THEME, games/cho-viet) keeps its own key prefix and its own cloud row.
const THEME = window.MM_THEME || null;
const GAME_ID = THEME ? THEME.id : 'casual-farm';
const NS = THEME ? THEME.id : 'mmm';
const GLOBAL_KEY = `${NS}-global-v1`;
const MART_RE = new RegExp(`^${NS}-(store\\d+)-v1$`);
const PUSH_EVERY = 20000;

const hub = () => { try { return window.HubSave && window.HubSave.isAvailable() ? window.HubSave : null; } catch (e) { return null; } };
const read = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } };
const keys = () => { try { return Object.keys(localStorage); } catch (e) { return []; } };
const withTimeout = (p, ms) => Promise.race([p, new Promise(ok => setTimeout(() => ok({ ok: false, reason: 'timeout' }), ms))]);

export function localPayload() {
  const marts = {};
  for (const k of keys()) {
    const m = k.match(MART_RE);
    if (m) marts[m[1]] = read(k);
  }
  const g = read(GLOBAL_KEY);
  return { v: 1, at: (g && g.savedAt) || 0, global: g, marts };
}

function replaceLocal(p) {
  for (const k of keys()) if (MART_RE.test(k)) { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } }
  for (const [id, d] of Object.entries(p.marts || {})) if (d) write(`${NS}-${id}-v1`, d);
  if (p.global) write(GLOBAL_KEY, p.global); else { try { localStorage.removeItem(GLOBAL_KEY); } catch (e) { /* storage unavailable */ } }
}

// Before the game reads its save. The local save carries the account it belongs to (global.owner):
// - another account's local save is parked under mmm-bak-<owner> and replaced by this account's cloud save, or by
//   nothing (a fresh game) when it has none;
// - this account's save (or a guest's, which the account then adopts) gives way to a newer cloud save.
// Resolves 'cloud', 'local', 'fresh' or 'off'.
export async function pull() {
  const h = hub();
  if (!h) return 'off';
  const me = h.whoAmI().userId;
  const local = localPayload();
  const owner = local.global && local.global.owner;
  const r = await withTimeout(h.loadSave(GAME_ID), 5000);
  if (!r.ok) return 'off';
  const cloud = r.found && r.payload && r.payload.v === 1 ? r.payload : null;
  if (owner && owner !== me) {
    write(`${NS}-bak-${owner}`, local);
    replaceLocal(cloud || { marts: {} });
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

// Delete Account: every mmm-* record goes, and the account's cloud row is overwritten by an empty save stamped now, so
// the next pull on any device starts a fresh game (HubSave has no delete call).
export async function wipe() {
  for (const k of keys()) if (k.startsWith(`${NS}-`)) { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } }
  const h = hub();
  if (h) await withTimeout(h.storeSave(GAME_ID, { v: 1, at: Date.now(), global: null, marts: {} }, { version: 0 }).catch(() => null), 5000);
}

let last = 0, inFlight = null;
// After a local save: at most one upload per PUSH_EVERY ms unless forced (page hidden, mart change).
export function push(force = false) {
  const h = hub();
  if (!h || (!force && Date.now() - last < PUSH_EVERY)) return Promise.resolve(null);
  last = Date.now();
  const p = localPayload();
  if (!p.global) return Promise.resolve(null);
  inFlight = h.storeSave(GAME_ID, p, { version: (p.global.ver || 0) }).catch(() => null);
  return inFlight;
}
