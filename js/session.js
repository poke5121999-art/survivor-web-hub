/*
 * Hub session — the single source of truth for "who is signed in", shared by the
 * login screen (auth.js), the hub (index.html gate + hub.js), and admin.html.
 *
 * A session is either a real member (created by supabase-auth.js — carries the
 * Supabase JWT + refresh token + expiry) or a guest (the offline/degrade path). Every
 * screen reads "who am I" through this one interface, so swapping the auth source never
 * touches the gate or the chip.
 *
 * WHY a tiny head-loadable module with no DOM dependency:
 * ROOT-CAUSE: index.html and admin.html must decide "signed in, or redirect" BEFORE
 *   markup renders, otherwise a signed-out visitor sees a flash of protected content
 *   before being bounced. A pure-state module can run in <head>, ahead of any DOM.
 * SEE: hub account gate — sign-in on entry + guest fallback (architecture, 2026-07-28)
 */
(function () {
  "use strict";

  var KEY = "hub.session.v1";
  // In-memory fallback so the page still works if localStorage is blocked (some
  // file:// contexts / private modes). Lasts only for the current page load.
  var mem = null;

  function read() {
    try {
      var raw = window.localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : mem;
    } catch (e) {
      return mem;
    }
  }

  function write(session) {
    mem = session;
    try {
      if (session) window.localStorage.setItem(KEY, JSON.stringify(session));
      else window.localStorage.removeItem(KEY);
    } catch (e) {
      /* storage blocked — mem holds it for this page load */
    }
  }

  window.HubSession = {
    get: read,
    set: function (session) { write(session); },
    clear: function () { write(null); },
    // A stored session (member OR guest) counts as signed-in for gate purposes. An
    // expired member token does NOT bounce the gate — hub.js refreshes it on load and
    // only then clears + redirects if the refresh fails (avoids a redirect loop).
    isSignedIn: function () { return !!read(); },
    isGuest: function () {
      var s = read();
      return !!s && s.kind === "guest";
    },
    // True when a member's access token is past (or within 60s of) its expiry.
    isExpired: function () {
      var s = read();
      if (!s || s.kind !== "member" || !s.expiresAt) return false;
      return Date.now() > (s.expiresAt - 60000);
    }
  };
})();
