/*
 * Hub session — the single source of truth for "who is signed in", shared by the
 * login screen (auth.js) and the hub (index.html gate + hub.js account chip).
 *
 * SCAFFOLD ONLY: this persists a local session object; it does NOT authenticate
 * against any server yet. When the real account service lands (one hosted
 * per-player database, per the hub account gate decision), replace how a session
 * is CREATED (in auth.js) — every screen reads "who am I" through this same
 * interface, so the rest of the UI does not change.
 *
 * WHY a tiny head-loadable module with no DOM dependency:
 * ROOT-CAUSE: index.html must decide "signed in, or redirect to login" BEFORE the
 *   hub markup renders, otherwise a signed-out visitor sees a flash of the games
 *   grid before being bounced. A pure-state module can run in <head>, ahead of
 *   any DOM.
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
    isSignedIn: function () { return !!read(); },
    isGuest: function () {
      var s = read();
      return !!s && s.kind === "guest";
    }
  };
})();
