/*
 * HubProfile — the hub-level shared player profile + per-game "last played" (Phase 5.3, unit C4).
 *
 * Reads the signed-in player's `profiles` row (display name / avatar, shared across every
 * device and every game on the hub) and their `game_saves` timestamps (to show "last played"
 * on each game card). Lets the player rename themselves once, and the new name follows them
 * everywhere because it lives in the shared database, not in this browser.
 *
 * Same transport as the rest of the hub: plain `fetch` to Supabase PostgREST (no supabase-js),
 * carrying the member JWT as `Authorization: Bearer` + `apikey`, so owner-only Row Level Security
 * restricts every read/write to this player's own rows. Mirrors the authenticated-call shape in
 * save-sync.js on purpose (kept as a sibling copy rather than a shared abstraction, so neither
 * module can regress the other in a repo with no JS test harness — see docs/memory/no-automated-tests).
 *   SEE: web-hub/db/policies.sql (profiles_*_own / game_saves_*_own), web-hub/js/save-sync.js
 *
 * WHY every method degrades to a plain result instead of throwing:
 * ROOT-CAUSE: the hub must render for guests and for an unprovisioned/offline hub exactly as it
 *   does today — the shared profile is an enrichment layer, never a gate. So no method here rejects;
 *   guest / unconfigured / signed-out all collapse to { ok:false, reason:"no-account" } and the hub
 *   simply falls back to the session name and shows no last-played.
 * SEE: docs/source-of-truth/architecture.md (hub-account-gate: guest fallback), hub-save-contract-c3
 */
(function () {
  "use strict";

  function cfg() { return window.SUPABASE_CONFIG || {}; }
  function isConfigured() { var c = cfg(); return !!(c.url && c.anonKey); }
  function restBase() { return String(cfg().url || "").replace(/\/+$/, "") + "/rest/v1"; }

  function memberSession() {
    var s = window.HubSession && window.HubSession.get();
    return s && s.kind === "member" && s.accessToken ? s : null;
  }

  // Refresh an expired member token before a call; null if refresh hard-fails (→ no-account).
  function ensureFresh(session) {
    if (!session) return Promise.resolve(null);
    var expired = window.HubSession && window.HubSession.isExpired && window.HubSession.isExpired();
    if (!expired || !window.HubAuth) return Promise.resolve(session);
    return window.HubAuth.refresh(session).then(function (r) {
      if (r && r.ok) { window.HubSession.set(r.session); return r.session; }
      return (r && r.unreachable) ? session : null;
    });
  }

  // Authenticated REST call as the signed-in player. Resolves { ok, status, data } or
  // { ok:false, unreachable:true }; retries once after a token refresh on a 401.
  function rest(method, path, opts, session, didRetry) {
    var headers = { "apikey": cfg().anonKey, "Authorization": "Bearer " + session.accessToken };
    opts = opts || {};
    if (opts.body != null) headers["Content-Type"] = "application/json";
    if (opts.prefer) headers["Prefer"] = opts.prefer;
    return fetch(restBase() + path, {
      method: method,
      headers: headers,
      body: opts.body != null ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      if (res.status === 401 && !didRetry && window.HubAuth) {
        return window.HubAuth.refresh(session).then(function (r) {
          if (r && r.ok) { window.HubSession.set(r.session); return rest(method, path, opts, r.session, true); }
          return { ok: false, status: 401, data: null };
        });
      }
      return res.text().then(function (t) {
        var data = null;
        try { data = t ? JSON.parse(t) : null; } catch (e) { data = null; }
        return { ok: res.ok, status: res.status, data: data };
      });
    }).catch(function () { return { ok: false, unreachable: true }; });
  }

  // Run `fn(session)` with a fresh member session, or resolve the no-account result if there
  // is none. Shared guard for all three public reads/writes.
  function withMember(fn) {
    if (!isConfigured() || !memberSession()) return Promise.resolve({ ok: false, reason: "no-account" });
    return ensureFresh(memberSession()).then(function (s) {
      return s ? fn(s) : { ok: false, reason: "no-account" };
    });
  }

  window.HubProfile = {
    isAvailable: function () { return isConfigured() && !!memberSession(); },

    // The player's shared profile row. Resolves:
    //   { ok:true, displayName, avatarUrl, createdAt(ms) }
    //   { ok:false, reason:"no-account" | "unreachable" | "error", status? }
    getProfile: function () {
      return withMember(function (s) {
        // RLS SELECT is owner-only, so this returns just this player's row.
        return rest("GET", "/profiles?select=display_name,avatar_url,created_at", null, s).then(function (r) {
          if (r.unreachable) return { ok: false, reason: "unreachable" };
          if (!r.ok) return { ok: false, reason: "error", status: r.status };
          var row = Array.isArray(r.data) && r.data.length ? r.data[0] : null;
          return {
            ok: true,
            displayName: row ? row.display_name : null,
            avatarUrl: row ? row.avatar_url : null,
            createdAt: row && row.created_at ? (Date.parse(row.created_at) || null) : null
          };
        });
      });
    },

    // Rename the player. The new name is stored in the shared DB, so it follows them across
    // devices and games. Resolves { ok:true, displayName } or { ok:false, reason }.
    updateDisplayName: function (name) {
      var clean = (name == null ? "" : String(name)).trim();
      if (!clean) return Promise.resolve({ ok: false, reason: "empty" });
      if (clean.length > 40) clean = clean.slice(0, 40); // keep it a label, not a paragraph
      return withMember(function (s) {
        // Filter by the caller's own id AND rely on RLS WITH CHECK — either alone is enough,
        // both together make the intent explicit and index-backed (id is the primary key).
        return rest("PATCH", "/profiles?id=eq." + encodeURIComponent(s.userId), {
          body: { display_name: clean },
          prefer: "return=representation"
        }, s).then(function (r) {
          if (r.unreachable) return { ok: false, reason: "unreachable" };
          if (!r.ok) return { ok: false, reason: "error", status: r.status };
          var row = Array.isArray(r.data) && r.data.length ? r.data[0] : null;
          return { ok: true, displayName: row ? row.display_name : clean };
        });
      });
    },

    // Every game this player has a cloud save for, keyed to when it was last written (≈ last
    // played, since the game pushes its save on run-end / leaving / tab-hidden). Resolves:
    //   { ok:true, map: { <gameId>: <updatedAtMs> } }
    //   { ok:false, reason:"no-account" | "unreachable" | "error", status? }
    listLastPlayed: function () {
      return withMember(function (s) {
        return rest("GET", "/game_saves?select=game_id,updated_at", null, s).then(function (r) {
          if (r.unreachable) return { ok: false, reason: "unreachable" };
          if (!r.ok) return { ok: false, reason: "error", status: r.status };
          var map = {};
          (Array.isArray(r.data) ? r.data : []).forEach(function (row) {
            if (row && row.game_id) map[row.game_id] = Date.parse(row.updated_at) || null;
          });
          return { ok: true, map: map };
        });
      });
    }
  };
})();
