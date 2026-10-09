/*
 * Hub renderer — reads window.HUB_GAMES (data/games.js) and renders the featured
 * game (newest rev), the genre filter, one card per game into #game-grid, and the
 * detail dialog. Pure vanilla JS, no dependencies, no network.
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

  // Filter chips render in this order. A game's `genre` in data/games.js must be one of these keys.
  // Labels come from js/i18n.js ("genre.<key>").
  var GENRES = {
    "hanh-dong": "⚔️", "kinh-di": "👻", "nhap-vai": "🧙", "chien-thuat": "♟️", "thu-gian": "🌿", "khac": "🧪"
  };
  var I = window.HubI18n;
  var t = I.t;
  var NEW_DAYS = 10;
  var FILTER_KEY = "hub.genre";

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /* WHY the revision rides on the URL: GitHub Pages serves every file with
   * Cache-Control: max-age=600, and nothing busts a game's index.html. A
   * player who opened a game shortly before a deploy keeps getting the old
   * HTML - and the old HTML pulls the old scripts, so they can be playing a
   * build that no longer exists on the server for up to ten minutes, with
   * no way to tell. Tapping the card with ?v=<rev> asks for a URL the
   * browser has never seen, so the fresh HTML arrives on the first tap.
   * Bump `rev` in data/games.js whenever a game is redeployed. */
  function playHref(game) {
    return game.rev
      ? game.path + (game.path.indexOf("?") < 0 ? "?" : "&") + "v=" + game.rev
      : game.path;
  }

  // rev is "YYYYMMDD" plus a letter; null when the game has no rev.
  function revDate(game) {
    var m = /^(\d{4})(\d{2})(\d{2})/.exec(game.rev || "");
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }

  function isNew(game) {
    var d = revDate(game);
    return !!d && Date.now() - d.getTime() < NEW_DAYS * 864e5;
  }

  function genreKey(game) {
    return GENRES[game.genre] ? game.genre : "khac";
  }

  function genrePill(game) {
    var k = genreKey(game);
    return GENRES[k] + " " + t("genre." + k);
  }

  function accentStyle(node, game) {
    if (game.accent) node.style.setProperty("--game-accent", game.accent);
  }

  function renderTags(tags, max) {
    var wrap = el("ul", "tags");
    (tags || []).slice(0, max || 99).forEach(function (tag) {
      wrap.appendChild(el("li", "tag", I.tag(tag)));
    });
    return wrap;
  }

  function renderCard(game) {
    var card = el("article", "card");
    accentStyle(card, game);
    card.setAttribute("data-game-id", game.id);
    card.setAttribute("data-genre", genreKey(game));

    var thumb = el("div", "card__thumb");
    if (game.thumbnail) {
      var img = el("img", "card__img");
      img.src = game.thumbnail;
      img.alt = "";            // decorative; title provides the accessible name
      img.loading = "lazy";
      thumb.appendChild(img);
    }
    thumb.appendChild(el("span", "pill card__genre", genrePill(game)));
    if (isNew(game)) thumb.appendChild(el("span", "card__new", t("card.new")));
    card.appendChild(thumb);

    var body = el("div", "card__body");
    var title = el("h2", "card__title");
    var link = el("a", "card__link", I.copy(game, "title"));
    link.href = playHref(game);
    title.appendChild(link);
    body.appendChild(title);
    body.appendChild(el("p", "card__tagline", I.copy(game, "tagline")));

    var foot = el("div", "card__foot");
    foot.appendChild(renderTags(game.tags, 3));
    var info = el("button", "card__info", t("card.about"));
    info.type = "button";
    info.setAttribute("aria-label", t("card.aboutAria", I.copy(game, "title")));
    info.addEventListener("click", function () { openDetail(game); });
    foot.appendChild(info);
    body.appendChild(foot);

    // "Last played" line — hidden until hydrateLastPlayed() fills it for a signed-in member
    // who has a cloud save for this game. Guests / unconfigured hubs never populate it.
    var last = el("p", "card__lastplayed");
    last.hidden = true;
    body.appendChild(last);
    card.appendChild(body);
    return card;
  }

  function playButton(game) {
    var a = el("a", "hub-btn hub-btn--primary", t("play"));
    a.href = playHref(game);
    return a;
  }

  function renderHero(game) {
    var hero = document.getElementById("hub-hero");
    if (!hero) return;
    accentStyle(hero, game);
    var bg = el("img", "hero__bg");
    bg.src = game.thumbnail; bg.alt = "";
    hero.appendChild(bg);

    var text = el("div", "hero__text");
    var d = revDate(game);
    var day = !d ? "" : I.lang() === "en"
      ? d.toLocaleDateString("en", { month: "short", day: "numeric" })
      : d.getDate() + "/" + (d.getMonth() + 1);
    text.appendChild(el("span", "pill hero__eyebrow", t("hero.updated") + (day ? " · " + day : "")));
    text.appendChild(el("h2", "hero__title", I.copy(game, "title")));
    text.appendChild(el("p", "hero__tagline", I.copy(game, "tagline")));
    if (game.desc) text.appendChild(el("p", "hero__desc", I.copy(game, "desc")));
    var actions = el("div", "hero__actions");
    actions.appendChild(playButton(game));
    var more = el("button", "hub-btn hub-btn--ghost", t("card.about"));
    more.type = "button";
    more.addEventListener("click", function () { openDetail(game); });
    actions.appendChild(more);
    text.appendChild(actions);
    hero.appendChild(text);

    var shot = el("a", "hero__shot");
    shot.href = playHref(game);
    shot.setAttribute("aria-label", t("playAria", I.copy(game, "title")));
    var img = el("img");
    img.src = game.thumbnail; img.alt = "";
    shot.appendChild(img);
    hero.appendChild(shot);
    hero.hidden = false;
  }

  function openDetail(game) {
    var dlg = document.getElementById("game-detail");
    if (!dlg || !dlg.showModal) { location.href = playHref(game); return; }
    dlg.textContent = "";
    accentStyle(dlg, game);
    var close = el("button", "detail__close", "✕");
    close.type = "button";
    close.setAttribute("aria-label", t("close"));
    close.addEventListener("click", function () { dlg.close(); });
    dlg.appendChild(close);
    if (game.thumbnail) {
      var img = el("img", "detail__img");
      img.src = game.thumbnail; img.alt = "";
      dlg.appendChild(img);
    }
    var body = el("div", "detail__body");
    body.appendChild(el("span", "pill", genrePill(game)));
    var h = el("h2", "detail__title", I.copy(game, "title"));
    h.id = "detail-title";
    body.appendChild(h);
    body.appendChild(el("p", "detail__tagline", I.copy(game, "tagline")));
    if (game.desc) body.appendChild(el("p", "detail__desc", I.copy(game, "desc")));
    body.appendChild(renderTags(game.tags));
    var actions = el("div", "detail__actions");
    actions.appendChild(playButton(game));
    body.appendChild(actions);
    dlg.appendChild(body);
    dlg.showModal();
  }

  function readFilter() {
    try { return sessionStorage.getItem(FILTER_KEY) || "all"; } catch (e) { return "all"; }
  }

  function renderFilter(games, grid) {
    var nav = document.getElementById("genre-filter");
    if (!nav) return;
    nav.setAttribute("aria-label", t("filter.label"));
    var counts = {};
    games.forEach(function (g) { var k = genreKey(g); counts[k] = (counts[k] || 0) + 1; });
    var chips = [{ key: "all", label: t("filter.all"), icon: "🎮", n: games.length }];
    Object.keys(GENRES).forEach(function (k) {
      if (counts[k]) chips.push({ key: k, label: t("genre." + k), icon: GENRES[k], n: counts[k] });
    });
    var current = readFilter();
    if (!chips.some(function (c) { return c.key === current; })) current = "all";

    function apply(key) {
      current = key;
      try { sessionStorage.setItem(FILTER_KEY, key); } catch (e) { /* storage blocked: filter lasts this page only */ }
      Array.prototype.forEach.call(nav.children, function (b) {
        b.setAttribute("aria-pressed", String(b.getAttribute("data-key") === key));
      });
      Array.prototype.forEach.call(grid.children, function (c) {
        c.hidden = key !== "all" && c.getAttribute("data-genre") !== key;
      });
    }

    chips.forEach(function (c) {
      var b = el("button", "chip");
      b.type = "button";
      b.setAttribute("data-key", c.key);
      b.appendChild(el("span", "chip__icon", c.icon));
      b.appendChild(document.createTextNode(c.label));
      b.appendChild(el("span", "chip__n", String(c.n)));
      b.addEventListener("click", function () { apply(c.key); });
      nav.appendChild(b);
    });
    apply(current);
  }

  // "5 phút trước" / "5 min ago". null for a falsy timestamp.
  function timeAgo(ms) {
    if (!ms) return null;
    var s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    if (s < 60) return t("ago.now");
    var m = Math.floor(s / 60); if (m < 60) return t("ago.min", m);
    var h = Math.floor(m / 60); if (h < 24) return t("ago.hour", h);
    var d = Math.floor(h / 24); if (d < 30) return t("ago.day", d);
    var mo = Math.floor(d / 30); if (mo < 12) return t("ago.month", mo);
    return t("ago.year", Math.floor(mo / 12));
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
        var label = timeAgo(r.map[gameId]);
        if (line && label) { line.textContent = t("card.lastPlayed", label); line.hidden = false; }
      });
    });
  }

  function renderEmpty(grid) {
    var msg = el("div", "empty-state");
    msg.appendChild(el("p", "empty-state__title", t("empty.title")));
    msg.appendChild(el("p", "empty-state__hint", t("empty.hint")));
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
    var name = isGuest ? t("account.guest") : (session.name || t("account.player"));

    var chip = el("div", "hub-account__chip");
    var avatar = el("span", "hub-account__avatar", name.charAt(0).toUpperCase());
    var info = el("div", "hub-account__info");
    var nameSpan = el("span", "hub-account__name", name);
    info.appendChild(nameSpan);
    info.appendChild(el("span", "hub-account__role", t(isGuest ? "account.guestRole" : "account.memberRole")));
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
      nameSpan.title = t("account.rename");
      nameSpan.addEventListener("click", function () {
        var next = window.prompt(t("account.renamePrompt"), nameSpan.textContent);
        if (next == null) return; // cancelled
        window.HubProfile.updateDisplayName(next).then(function (r) {
          if (r && r.ok) applyName(r.displayName);
          else if (r && r.reason === "unreachable") window.alert(t("account.unreachable"));
        });
      });
    }

    var action = el("button", "auth-btn auth-btn--ghost hub-account__action",
      t(isGuest ? "account.signIn" : "account.signOut"));
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

  // Static page text that lives in index.html.
  function renderStatic() {
    function set(id, text) { var n = document.getElementById(id); if (n) n.textContent = text; }
    set("hub-subtitle", t("subtitle.idle"));
    set("hub-footer-text", t("footer.text"));
    set("hub-refresh", t("refresh.button"));
    set("hub-feedback", t("feedback.link"));
    var note = document.getElementById("hub-refresh-note");
    if (note) note.innerHTML = t("refresh.note");
    var grid = document.getElementById("game-grid");
    if (grid) grid.setAttribute("aria-label", t("grid.label"));
  }

  function renderLangSwitch() {
    var slot = document.getElementById("hub-lang");
    if (!slot) return;
    slot.setAttribute("aria-label", t("lang.label"));
    Object.keys(I.LANGS).forEach(function (code) {
      var b = el("button", "hub-lang__opt", code.toUpperCase());
      b.type = "button";
      b.title = I.LANGS[code];
      b.lang = code;
      b.setAttribute("data-lang", code);
      b.setAttribute("aria-pressed", String(code === I.lang()));
      b.addEventListener("click", function () {
        if (code === I.lang()) return;
        I.set(code);
        render();
      });
      slot.appendChild(b);
    });
  }

  function render() {
    ["hub-account", "hub-lang", "hub-hero", "genre-filter", "game-grid"].forEach(function (id) {
      var n = document.getElementById(id);
      if (n) n.textContent = "";
    });
    var hero = document.getElementById("hub-hero");
    if (hero) hero.hidden = true;
    renderStatic();
    renderLangSwitch();
    init();
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

    var sub = document.getElementById("hub-subtitle");
    if (sub) sub.textContent = t("subtitle", visible.length);

    var newest = visible.filter(revDate).sort(function (a, b) { return a.rev < b.rev ? 1 : -1; })[0];
    if (newest) renderHero(newest);

    visible.forEach(function (game) {
      grid.appendChild(renderCard(game));
    });
    renderFilter(visible, grid);

    // Cloud "last played" arrives asynchronously and stamps whichever visible cards match.
    hydrateLastPlayed();
  }

  // Refresh an expired member token on load; if the refresh fails (invalid/expired
  // refresh token) clear the session and return to the login gate. If the service is
  // merely unreachable, keep showing the hub (offline-friendly) rather than bouncing.
  function boot() {
    var s = window.HubSession && window.HubSession.get();
    if (!s || s.kind !== "member" || !window.HubAuth || !window.HubSession.isExpired()) {
      render();
      return;
    }
    window.HubAuth.refresh(s).then(function (r) {
      if (r && r.ok) { window.HubSession.set(r.session); render(); }
      else if (r && r.unreachable) { render(); }
      else { window.HubSession.clear(); location.replace("login.html"); }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
