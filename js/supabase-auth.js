/*
 * HubAuth — the hub's authentication layer, talking to Supabase Auth (GoTrue) over
 * its REST API with plain fetch. No third-party library.
 *
 * WHY raw fetch instead of the supabase-js library:
 * ROOT-CAUSE: the hub is a zero-dependency, no-CDN static site (the same no-network
 *   ethos as the games). Pulling in supabase-js (a large third-party bundle) would
 *   break that invariant. The auth surface the hub needs is three REST calls, so
 *   fetch is enough and keeps the page self-contained.
 * SEE: docs/patches/phase-5.3-patch-2-hub-signin-gate.md (Options Considered A vs B/C)
 *
 * Endpoints: POST {url}/auth/v1/signup, POST {url}/auth/v1/token?grant_type=
 *   password|refresh_token, POST {url}/auth/v1/logout. `apikey: <anon>` header on all.
 * SEE: https://supabase.com/docs/reference/self-hosting-auth/start
 */
(function () {
  "use strict";

  function cfg() { return window.SUPABASE_CONFIG || {}; }
  function isConfigured() {
    var c = cfg();
    return !!(c.url && c.anonKey);
  }
  function base() { return String(cfg().url || "").replace(/\/+$/, ""); }

  // Turn a GoTrue token response into the session shape the rest of the hub stores.
  function toSession(data) {
    var user = data.user || {};
    var meta = user.user_metadata || {};
    var email = user.email || "";
    var name = meta.display_name || meta.name || (email ? email.split("@")[0] : "Người chơi");
    // GoTrue returns expires_in (seconds) and usually expires_at (epoch seconds).
    var nowSec = Math.floor(Date.now() / 1000);
    var expiresAtSec = data.expires_at || (nowSec + (data.expires_in || 3600));
    return {
      kind: "member",
      userId: user.id || null,
      email: email,
      name: name,
      accessToken: data.access_token || null,
      refreshToken: data.refresh_token || null,
      expiresAt: expiresAtSec * 1000  // store as ms so Date.now() comparisons are direct
    };
  }

  // POST helper. Resolves { ok, status, data } normally, or { ok:false, unreachable:true }
  // on a network/CORS failure so the caller can distinguish "service down" from "bad input".
  function post(path, body, extraHeaders) {
    var headers = { "Content-Type": "application/json", "apikey": cfg().anonKey };
    if (extraHeaders) {
      Object.keys(extraHeaders).forEach(function (k) { headers[k] = extraHeaders[k]; });
    }
    return fetch(base() + path, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body || {})
    }).then(function (res) {
      return res.text().then(function (t) {
        var data = {};
        try { data = t ? JSON.parse(t) : {}; } catch (e) { data = {}; }
        return { ok: res.ok, status: res.status, data: data };
      });
    }).catch(function () {
      return { ok: false, unreachable: true };
    });
  }

  // GoTrue error text arrives under different keys depending on the endpoint.
  function errMsg(r) {
    var d = r.data || {};
    return d.error_description || d.msg || d.message || d.error || ("Lỗi " + (r.status || ""));
  }

  window.HubAuth = {
    isConfigured: isConfigured,

    signInWithPassword: function (email, password) {
      if (!isConfigured()) return Promise.resolve({ ok: false, notConfigured: true });
      return post("/auth/v1/token?grant_type=password", { email: email, password: password })
        .then(function (r) {
          if (r.unreachable) return { ok: false, unreachable: true };
          if (!r.ok) return { ok: false, error: errMsg(r) };
          return { ok: true, session: toSession(r.data) };
        });
    },

    signUp: function (email, password, displayName) {
      if (!isConfigured()) return Promise.resolve({ ok: false, notConfigured: true });
      var body = { email: email, password: password };
      if (displayName) body.data = { display_name: displayName };
      return post("/auth/v1/signup", body).then(function (r) {
        if (r.unreachable) return { ok: false, unreachable: true };
        if (!r.ok) return { ok: false, error: errMsg(r) };
        // Email-confirmation ON (the Supabase default): a user is returned but there is
        // NO access_token — the player must confirm via the emailed link before they can
        // sign in. WHY this branch exists: without it, sign-up would silently look like a
        // no-op. The owner can disable confirmation in the dashboard for instant sign-in.
        if (!r.data.access_token) return { ok: true, needsConfirmation: true };
        return { ok: true, session: toSession(r.data) };
      });
    },

    refresh: function (session) {
      if (!isConfigured() || !session || !session.refreshToken) return Promise.resolve({ ok: false });
      return post("/auth/v1/token?grant_type=refresh_token", { refresh_token: session.refreshToken })
        .then(function (r) {
          if (r.unreachable) return { ok: false, unreachable: true };
          if (!r.ok || !r.data.access_token) return { ok: false };
          return { ok: true, session: toSession(r.data) };
        });
    },

    signOut: function (session) {
      // Best-effort server-side revoke; the caller clears the local session regardless.
      if (!isConfigured() || !session || !session.accessToken) return Promise.resolve();
      return post("/auth/v1/logout", {}, { "Authorization": "Bearer " + session.accessToken })
        .then(function () {}, function () {});
    }
  };
})();
