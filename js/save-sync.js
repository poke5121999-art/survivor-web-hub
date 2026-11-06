/*
 * HubSave — the game-side save contract (Phase 5.3 "Game-side bridge", unit C3).
 *
 * A tiny vanilla-JS layer a hub game calls to ask three things:
 *   whoAmI()               — is a real player signed in, and who are they?
 *   loadSave(gameId)       — pull this player's cloud save for one game
 *   storeSave(gameId, ...) — push this player's cloud save for one game
 *
 * Backed by the shared Supabase `game_saves` table over plain `fetch` (no supabase-js —
 * same zero-dependency / no-CDN invariant as supabase-auth.js). Requests carry the
 * signed-in player's JWT as `Authorization: Bearer`, so Supabase runs them as the
 * `authenticated` role and the owner-only Row Level Security policies restrict every
 * read/write to that player's own rows automatically.
 *   SEE: https://supabase.com/docs/guides/database/postgres/row-level-security
 *   SEE: https://docs.postgrest.org/en/v12/references/api/tables_views.html (upsert)
 *
 * WHY every function degrades instead of throwing:
 * ROOT-CAUSE: cloud save is an OPTIONAL layer UNDER the local save, never a replacement.
 *   A game may be opened offline, hosted split-origin, or run before the owner has
 *   provisioned Supabase. In all those cases the bridge must look "absent" so the game
 *   falls back to local-save-only and behaves exactly as it does today — so no code path
 *   here rejects or throws; each resolves a plain result object the caller can branch on.
 * SEE: docs/memory/local-save-single-owner.md, docs/source-of-truth/architecture.md
 *      (hub-account-gate: cloud save is a sync layer above the local save, never a replacement)
 *
 * The Unity WebGL side reaches these three functions through a .jslib shim; the exact
 * bridge contract (JS shape + the C# side) lives in web-hub/games/BRIDGE.md.
 */
(function () {
  "use strict";

  function cfg() { return window.SUPABASE_CONFIG || {}; }
  function isConfigured() {
    var c = cfg();
    return !!(c.url && c.anonKey);
  }
  function restBase() { return String(cfg().url || "").replace(/\/+$/, "") + "/rest/v1"; }

  // Effective per-save ceiling. The DB enforces pg_column_size(payload) <= 102400 on the
  // TOAST-compressed on-disk bytes; we gate on the raw UTF-8 byte size, which is always
  // >= the compressed size. So a save that passes this check always fits the DB check —
  // we trade a little compression headroom for a predictable client-side "too-large"
  // signal instead of a raw 400 from the database constraint.
  var MAX_PAYLOAD_BYTES = 102400;

  // Return the member session ONLY (guests have no cloud identity). null otherwise.
  function memberSession() {
    var s = window.HubSession && window.HubSession.get();
    return s && s.kind === "member" && s.accessToken ? s : null;
  }

  function byteLength(str) {
    // TextEncoder is available in every browser that can run a WebGL build; the catch is
    // only a defensive fallback (approximate, never throws).
    try { return new TextEncoder().encode(str).length; }
    catch (e) { return unescape(encodeURIComponent(str)).length; }
  }

  // Refresh an expired member token before a call so we don't waste a round-trip on a
  // guaranteed 401. Resolves the freshest usable session, or null if refresh failed.
  function ensureFresh(session) {
    if (!session) return Promise.resolve(null);
    var expired = window.HubSession && window.HubSession.isExpired && window.HubSession.isExpired();
    if (!expired || !window.HubAuth) return Promise.resolve(session);
    return window.HubAuth.refresh(session).then(function (r) {
      if (r && r.ok) { window.HubSession.set(r.session); return r.session; }
      // Unreachable → keep the (stale) token and let the call surface the network error;
      // hard-invalid → null so the caller degrades to no-account.
      return (r && r.unreachable) ? session : null;
    });
  }

  // Core REST call as the signed-in player. Resolves { ok, status, data } or
  // { ok:false, unreachable:true }. Retries ONCE after a token refresh on a 401, which
  // covers a token that expired between ensureFresh() and the request landing.
  function rest(method, path, opts, session, didRetry) {
    var headers = {
      "apikey": cfg().anonKey,
      "Authorization": "Bearer " + session.accessToken
    };
    opts = opts || {};
    if (opts.body != null) headers["Content-Type"] = "application/json";
    if (opts.prefer) headers["Prefer"] = opts.prefer;

    return fetch(restBase() + path, {
      method: method,
      headers: headers,
      body: opts.body != null ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      if (res.status === 401 && !didRetry && window.HubAuth) {
        // Token died mid-flight — refresh once and replay the exact same call.
        return window.HubAuth.refresh(session).then(function (r) {
          if (r && r.ok) { window.HubSession.set(r.session); return rest(method, path, opts, r.session, true); }
          return { ok: false, status: 401, data: {} };
        });
      }
      return res.text().then(function (t) {
        var data = null;
        try { data = t ? JSON.parse(t) : null; } catch (e) { data = null; }
        return { ok: res.ok, status: res.status, data: data };
      });
    }).catch(function () {
      return { ok: false, unreachable: true };
    });
  }

  window.HubSave = {
    // Is the cloud layer usable at all right now (configured + a member signed in)?
    isAvailable: function () { return isConfigured() && !!memberSession(); },

    // Synchronous identity read. signedIn is false for guests and unconfigured hubs, so a
    // game can decide "cloud or local-only" without a network call.
    whoAmI: function () {
      var s = memberSession();
      if (!isConfigured() || !s) {
        return { signedIn: false, userId: null, name: null, email: null };
      }
      return { signedIn: true, userId: s.userId, name: s.name || null, email: s.email || null };
    },

    // Pull the player's save for one game. Resolves:
    //   { ok:true,  found:true,  payload, version, updatedAt(ms) }
    //   { ok:true,  found:false }                              — signed in, no cloud row yet
    //   { ok:false, reason:"no-account" }                      — guest / unconfigured / signed out
    //   { ok:false, reason:"unreachable" }                     — network/CORS/service down
    //   { ok:false, reason:"error", status }                   — unexpected server response
    loadSave: function (gameId) {
      if (!isConfigured() || !memberSession()) {
        return Promise.resolve({ ok: false, reason: "no-account" });
      }
      if (!gameId) return Promise.resolve({ ok: false, reason: "error", status: 0 });
      return ensureFresh(memberSession()).then(function (s) {
        if (!s) return { ok: false, reason: "no-account" };
        // RLS already limits SELECT to the owner's rows, so filtering on game_id alone
        // returns at most this player's single row for that game.
        var q = "/game_saves?game_id=eq." + encodeURIComponent(gameId) +
                "&select=payload,version,updated_at";
        return rest("GET", q, null, s).then(function (r) {
          if (r.unreachable) return { ok: false, reason: "unreachable" };
          if (!r.ok) return { ok: false, reason: "error", status: r.status };
          var row = Array.isArray(r.data) && r.data.length ? r.data[0] : null;
          if (!row) return { ok: true, found: false };
          return {
            ok: true, found: true,
            payload: row.payload,
            version: row.version,
            updatedAt: Date.parse(row.updated_at) || null
          };
        });
      });
    },

    // Push the player's save for one game (insert-or-update on the (user_id, game_id) key).
    // opts.version = the monotonic save version to write (caller owns the counter; default 1).
    // Resolves:
    //   { ok:true,  version, updatedAt(ms) }
    //   { ok:false, reason:"no-account" | "unreachable" | "too-large" | "error", ... }
    storeSave: function (gameId, payload, opts) {
      if (!isConfigured() || !memberSession()) {
        return Promise.resolve({ ok: false, reason: "no-account" });
      }
      if (!gameId) return Promise.resolve({ ok: false, reason: "error", status: 0 });
      opts = opts || {};
      var body = {
        // user_id MUST be the caller's own id: the RLS WITH CHECK requires
        // auth.uid() = user_id, so a mismatched id is rejected server-side, not trusted.
        user_id: memberSession().userId,
        game_id: gameId,
        payload: (payload == null ? {} : payload),
        version: (typeof opts.version === "number" ? opts.version : 1)
      };
      var bytes = byteLength(JSON.stringify(body.payload));
      if (bytes > MAX_PAYLOAD_BYTES) {
        return Promise.resolve({ ok: false, reason: "too-large", bytes: bytes, max: MAX_PAYLOAD_BYTES });
      }
      return ensureFresh(memberSession()).then(function (s) {
        if (!s) return { ok: false, reason: "no-account" };
        body.user_id = s.userId; // use the refreshed session's id
        return rest("POST", "/game_saves?on_conflict=user_id,game_id", {
          body: body,
          prefer: "resolution=merge-duplicates,return=representation"
        }, s).then(function (r) {
          if (r.unreachable) return { ok: false, reason: "unreachable" };
          // The DB size-cap constraint surfaces as a 400 check violation — map it back to
          // the same too-large signal the client pre-check uses, so callers branch once.
          if (r.status === 400 && r.data && /payload_max_size/.test(JSON.stringify(r.data))) {
            return { ok: false, reason: "too-large", max: MAX_PAYLOAD_BYTES };
          }
          if (!r.ok) return { ok: false, reason: "error", status: r.status };
          var row = Array.isArray(r.data) && r.data.length ? r.data[0] : null;
          return {
            ok: true,
            version: row ? row.version : body.version,
            updatedAt: row ? (Date.parse(row.updated_at) || null) : null
          };
        });
      });
    },

    // Pure newer-wins reconciliation (no I/O) — the decision half of the sync policy. The
    // caller supplies local + cloud descriptors { updatedAt(ms), version }; each may be null
    // (no save on that side). An optional `base` (the descriptor last known common to both,
    // from the previous sync) turns an ambiguous both-sides-changed case into "conflict"
    // instead of silently overwriting — that is what a "keep this device / keep cloud"
    // prompt is for. Returns { winner: "local"|"cloud"|"none"|"conflict", reason }.
    reconcile: function (local, cloud, base) {
      if (!local && !cloud) return { winner: "none", reason: "no-save-either-side" };
      if (local && !cloud) return { winner: "local", reason: "only-local-exists" };
      if (cloud && !local) return { winner: "cloud", reason: "only-cloud-exists" };

      var lt = local.updatedAt || 0, ct = cloud.updatedAt || 0;

      if (base) {
        var localChanged = local.version !== base.version || (local.updatedAt || 0) !== (base.updatedAt || 0);
        var cloudChanged = cloud.version !== base.version || (cloud.updatedAt || 0) !== (base.updatedAt || 0);
        if (localChanged && cloudChanged && lt !== ct) {
          return { winner: "conflict", reason: "both-diverged-from-base" };
        }
      }

      if (lt === ct) return { winner: "none", reason: "same-timestamp" };
      return lt > ct ? { winner: "local", reason: "local-newer" } : { winner: "cloud", reason: "cloud-newer" };
    }
  };
})();
