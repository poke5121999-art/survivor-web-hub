/*
 * Hub renderer — reads window.HUB_GAMES (data/games.js) and renders one card per
 * game into #game-grid. Pure vanilla JS, no dependencies, no network.
 *
 * WHY status-driven cards + placeholder launch:
 * ROOT-CAUSE: a game can be listed before its WebGL build exists in the repo;
 *   a naive link would 404. Each entry carries a status that decides whether the
 *   card launches the build, launches a "drop your build here" placeholder, or is
 *   shown as a disabled "coming soon" tile — so there is never a broken link.
 * SEE: docs/patches/phase-5.1-patch-1-web-game-hub.md (Chosen Approach)
 *
 * WHY the user hub renders ONLY status "available":
 * ROOT-CAUSE: players must never land on a dead/placeholder card. A game sits in
 *   the registry while its WebGL build is still missing ("build-pending") or as a
 *   teaser ("coming-soon"); both are dev-facing states, not player-facing. The
 *   public hub filters to "available" so a card appears only once a real build is
 *   present. Every status stays visible to the dev on admin.html instead.
 * SEE: admin dashboard addition 2026-07-28
 */
(function () {
  "use strict";

  var STATUS = {
    "available": { badge: null, launchable: true },
    "build-pending": { badge: "Cần thả build", launchable: true },
    "coming-soon": { badge: "Coming soon", launchable: false }
  };

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function renderTags(tags) {
    var wrap = el("ul", "card__tags");
    (tags || []).forEach(function (t) {
      wrap.appendChild(el("li", "card__tag", t));
    });
    return wrap;
  }

  function renderCard(game) {
    var meta = STATUS[game.status] || STATUS["coming-soon"];

    // Launchable games are anchors (real navigation, keyboard-accessible, opens
    // the game's own folder). Non-launchable games are inert divs.
    var card = meta.launchable
      ? el("a", "card card--launchable")
      : el("div", "card card--disabled");

    if (meta.launchable) {
      /* WHY the revision rides on the URL: GitHub Pages serves every file with
       * Cache-Control: max-age=600, and nothing busts a game's index.html. A
       * player who opened a game shortly before a deploy keeps getting the old
       * HTML - and the old HTML pulls the old scripts, so they can be playing a
       * build that no longer exists on the server for up to ten minutes, with
       * no way to tell. Tapping the card with ?v=<rev> asks for a URL the
       * browser has never seen, so the fresh HTML arrives on the first tap.
       * Bump `rev` in data/games.js whenever a game is redeployed. */
      card.href = game.rev
        ? game.path + (game.path.indexOf("?") < 0 ? "?" : "&") + "v=" + game.rev
        : game.path;
      card.setAttribute("aria-label", "Play " + game.title);
    } else {
      card.setAttribute("aria-disabled", "true");
    }
    // Tag the card with its stable id so hydrateLastPlayed() can find it after the async
    // profile fetch returns (cards render synchronously; last-played arrives later).
    if (game.id) card.setAttribute("data-game-id", game.id);

    var thumb = el("div", "card__thumb");
    if (game.thumbnail) {
      var img = el("img", "card__img");
      img.src = game.thumbnail;
      img.alt = "";            // decorative; title provides the accessible name
      img.loading = "lazy";
      thumb.appendChild(img);
    }
    if (meta.badge) {
      thumb.appendChild(el("span", "card__badge", meta.badge));
    }
    card.appendChild(thumb);

    var body = el("div", "card__body");
    body.appendChild(el("h2", "card__title", game.title));
    body.appendChild(el("p", "card__tagline", game.tagline));
    body.appendChild(renderTags(game.tags));
    // "Last played" line — hidden until hydrateLastPlayed() fills it for a signed-in member
    // who has a cloud save for this game. Guests / unconfigured hubs never populate it.
    var last = el("p", "card__lastplayed");
    last.hidden = true;
    body.appendChild(last);
    card.appendChild(body);

    return card;
  }

  // "5 phút trước" style relative time in Vietnamese. null for a falsy timestamp.
  function timeAgoVi(ms) {
    if (!ms) return null;
    var s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    if (s < 60) return "vừa xong";
    var m = Math.floor(s / 60); if (m < 60) return m + " phút trước";
    var h = Math.floor(m / 60); if (h < 24) return h + " giờ trước";
    var d = Math.floor(h / 24); if (d < 30) return d + " ngày trước";
    var mo = Math.floor(d / 30); if (mo < 12) return mo + " tháng trước";
    return Math.floor(mo / 12) + " năm trước";
  }

  // After the cards render, ask the shared DB when this player last saved each game and stamp
  // the matching card. A game the player has never saved (or that isn't shown on this hub) is
  // simply left without a last-played line — no row, no stamp. No-op for guests / unconfigured.
  function hydrateLastPlayed() {
    if (!window.HubProfile || !window.HubProfile.isAvailable()) return;
    window.HubProfile.listLastPlayed().then(function (r) {
      if (!r || !r.ok || !r.map) return;
      Object.keys(r.map).forEach(function (gameId) {
        var card = document.querySelector('[data-game-id="' + gameId + '"]');
        if (!card) return;
        var line = card.querySelector(".card__lastplayed");
        var label = timeAgoVi(r.map[gameId]);
        if (line && label) { line.textContent = "Chơi lần cuối " + label; line.hidden = false; }
      });
    });
  }

  function renderEmpty(grid) {
    var msg = el("div", "empty-state");
    msg.appendChild(el("p", "empty-state__title", "No games yet"));
    msg.appendChild(el("p", "empty-state__hint", "Add one by editing data/games.js."));
    grid.appendChild(msg);
  }

  // ---- Account chip ---------------------------------------------------------
  // Shows who is signed in (member name or "Khách") + a sign-out control. Guests
  // additionally get a hint that their progress is local-only. Reads the session
  // through HubSession so the real account service can swap in without changing UI.
  function renderAccount() {
    var slot = document.getElementById("hub-account");
    if (!slot || !window.HubSession) return;
    var session = window.HubSession.get();
    if (!session) return;

    var isGuest = session.kind === "guest";
    var name = session.name || (isGuest ? "Khách" : "Người chơi");

    var chip = el("div", "hub-account__chip");
    var avatar = el("span", "hub-account__avatar", name.charAt(0).toUpperCase());
    var info = el("div", "hub-account__info");
    var nameSpan = el("span", "hub-account__name", name);
    info.appendChild(nameSpan);
    info.appendChild(el("span", "hub-account__role", isGuest ? "Khách — lưu cục bộ" : "Đã đăng nhập"));
    chip.appendChild(avatar);
    chip.appendChild(info);

    // For a signed-in member, replace the JWT-derived name with the authoritative shared-profile
    // name (the one that follows them across devices), and let a click rename them everywhere.
    // Enrichment only — if the service is unconfigured/unreachable the chip keeps the session name.
    if (!isGuest && window.HubProfile && window.HubProfile.isAvailable()) {
      var applyName = function (n) {
        if (!n) return;
        nameSpan.textContent = n;
        avatar.textContent = n.charAt(0).toUpperCase();
      };
      window.HubProfile.getProfile().then(function (p) {
        if (p && p.ok) applyName(p.displayName);
      });
      nameSpan.classList.add("hub-account__name--editable");
      nameSpan.title = "Đổi tên hiển thị";
      nameSpan.addEventListener("click", function () {
        var next = window.prompt("Tên hiển thị mới:", nameSpan.textContent);
        if (next == null) return; // cancelled
        window.HubProfile.updateDisplayName(next).then(function (r) {
          if (r && r.ok) applyName(r.displayName);
          else if (r && r.reason === "unreachable") window.alert("Không kết nối được dịch vụ tài khoản. Thử lại sau.");
        });
      });
    }

    var action = el("button", "auth-btn auth-btn--ghost hub-account__action",
      isGuest ? "Đăng nhập" : "Đăng xuất");
    action.type = "button";
    action.addEventListener("click", function () {
      // Guest → go sign in (keeps guest session until they actually sign in).
      // Member → revoke server-side (best-effort), clear the local session, return to login.
      if (!isGuest) {
        if (window.HubAuth) window.HubAuth.signOut(session);
        window.HubSession.clear();
      }
      location.href = "login.html";
    });

    slot.appendChild(chip);
    slot.appendChild(action);
  }

  function init() {
    renderAccount();

    var grid = document.getElementById("game-grid");
    if (!grid) return;

    var games = window.HUB_GAMES;
    if (!Array.isArray(games) || games.length === 0) {
      renderEmpty(grid);
      return;
    }

    // Public hub shows only games with a real build. build-pending / coming-soon
    // are dev-only states and stay hidden here (visible on admin.html).
    var visible = games.filter(function (game) {
      return game.status === "available";
    });
    if (visible.length === 0) {
      renderEmpty(grid);
      return;
    }

    visible.forEach(function (game) {
      grid.appendChild(renderCard(game));
    });

    // Cloud "last played" arrives asynchronously and stamps whichever visible cards match.
    hydrateLastPlayed();
  }

  // Refresh an expired member token on load; if the refresh fails (invalid/expired
  // refresh token) clear the session and return to the login gate. If the service is
  // merely unreachable, keep showing the hub (offline-friendly) rather than bouncing.
  function boot() {
    var s = window.HubSession && window.HubSession.get();
    if (!s || s.kind !== "member" || !window.HubAuth || !window.HubSession.isExpired()) {
      init();
      return;
    }
    window.HubAuth.refresh(s).then(function (r) {
      if (r && r.ok) { window.HubSession.set(r.session); init(); }
      else if (r && r.unreachable) { init(); }
      else { window.HubSession.clear(); location.replace("login.html"); }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
