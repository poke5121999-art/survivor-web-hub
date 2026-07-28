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
      card.href = game.path;
      card.setAttribute("aria-label", "Play " + game.title);
    } else {
      card.setAttribute("aria-disabled", "true");
    }

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
    card.appendChild(body);

    return card;
  }

  function renderEmpty(grid) {
    var msg = el("div", "empty-state");
    msg.appendChild(el("p", "empty-state__title", "No games yet"));
    msg.appendChild(el("p", "empty-state__hint", "Add one by editing data/games.js."));
    grid.appendChild(msg);
  }

  function init() {
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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
