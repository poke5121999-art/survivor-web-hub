/*
 * Trang "Tải bản PC" (downloads.html): một thẻ cho mỗi dòng của window.HUB_DOWNLOADS (data/downloads.js),
 * tên và ảnh lấy từ window.HUB_GAMES (data/games.js), chữ từ window.HubI18n (js/i18n.js).
 *
 * Cổng đăng nhập: cùng luật với js/game-gate.js (chỉ member/admin), chạy ngay khi script nạp trong <head>.
 * game-gate.js chỉ gác đường dẫn dưới /games/, nên trang này tự gác: chưa đăng nhập hoặc là khách thì về
 * login.html?next=downloads.html; tài khoản pending/blocked thì về index.html?gate=<role> để hub hiện lời nhắn.
 * Đây là cổng UX như game-gate.js (fail-open), không phải access control: file trên GitHub Releases là công khai.
 */
(function () {
  "use strict";

  // ---- gate (khớp js/game-gate.js) ----
  var SESSION_KEY = "hub.session.v1";
  var ALLOW = { member: 1, admin: 1 };
  try {
    var raw = null;
    try { raw = window.localStorage.getItem(SESSION_KEY); } catch (e) { raw = null; }
    var session = null;
    if (raw) { try { session = JSON.parse(raw); } catch (e) { session = null; } }
    var role = session && session.role;
    var ok = !session ? false : role ? !!ALLOW[role] : session.kind === "member";
    if (!ok) {
      if (session && session.kind === "member") location.replace("index.html?gate=" + encodeURIComponent(role || "pending"));
      else location.replace("login.html?next=downloads.html");
      return;
    }
  } catch (e) {
    /* fail-open */
  }

  var I = window.HubI18n;
  var t = function (k) { return I ? I.t.apply(null, arguments) : k; };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function size(bytes) {
    var mb = bytes / 1048576;
    return mb >= 1024 ? (mb / 1024).toFixed(2) + " GB" : Math.round(mb) + " MB";
  }

  function platformName(p) { return t("dl.platform." + p); }

  function gameOf(id) {
    var list = window.HUB_GAMES || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return { id: id, title: id };
  }

  function card(row) {
    var g = gameOf(row.game);
    var lang = I ? I.lang() : "vi";
    var c = el("article", "dl-card");
    if (g.accent) c.style.setProperty("--dl-accent", g.accent);

    if (g.thumbnail) {
      var img = el("img", "dl-card__thumb");
      img.src = g.thumbnail; img.alt = ""; img.loading = "lazy";
      c.appendChild(img);
    }
    var body = el("div", "dl-card__body");
    body.appendChild(el("h2", "dl-card__title", I ? I.copy(g, "title") : g.title));
    var meta = el("p", "dl-card__meta");
    meta.textContent = [platformName(row.platform), t("dl.version", row.version), row.date, size(row.bytes)].join(" · ");
    body.appendChild(meta);
    var note = row.note && (row.note[lang] || row.note.vi);
    if (note) body.appendChild(el("p", "dl-card__note", note));

    var actions = el("div", "dl-card__actions");
    var a = el("a", "dl-btn", t("dl.button", size(row.bytes)));
    a.href = row.url; a.rel = "noopener";
    actions.appendChild(a);
    var play = el("a", "dl-link", t("dl.playWeb"));
    if (g.path) { play.href = g.path; play.rel = "noopener"; actions.appendChild(play); }
    body.appendChild(actions);

    var sum = el("details", "dl-sum");
    sum.appendChild(el("summary", null, t("dl.sha")));
    var code = el("code", "dl-sum__hash", row.sha256);
    sum.appendChild(code);
    var copy = el("button", "dl-sum__copy", t("dl.copy"));
    copy.type = "button";
    copy.addEventListener("click", function () {
      var done = function () { copy.textContent = t("dl.copied"); setTimeout(function () { copy.textContent = t("dl.copy"); }, 1500); };
      if (navigator.clipboard) navigator.clipboard.writeText(row.sha256).then(done, function () {});
    });
    sum.appendChild(copy);
    sum.appendChild(el("p", "dl-sum__how", t("dl.shaHow")));
    body.appendChild(sum);

    c.appendChild(body);
    return c;
  }

  function render() {
    document.title = t("dl.pageTitle") + " · Game Hub";
    var set = function (id, text) { var n = document.getElementById(id); if (n) n.textContent = text; };
    set("dl-title", t("dl.pageTitle"));
    set("dl-subtitle", t("dl.subtitle"));
    set("dl-back", t("dl.back"));
    set("dl-howto-title", t("dl.howTitle"));
    var how = document.getElementById("dl-howto-list");
    if (how) {
      how.textContent = "";
      ["dl.how1", "dl.how2", "dl.how3"].forEach(function (k) { how.appendChild(el("li", null, t(k))); });
    }
    var list = document.getElementById("dl-list");
    list.textContent = "";
    var rows = (window.HUB_DOWNLOADS || []).slice();
    if (!rows.length) list.appendChild(el("p", "dl-empty", t("dl.empty")));
    rows.forEach(function (r) { list.appendChild(card(r)); });
    var langs = document.querySelectorAll("#dl-lang button");
    for (var i = 0; i < langs.length; i++) langs[i].setAttribute("aria-pressed", String(langs[i].getAttribute("data-lang") === (I ? I.lang() : "vi")));
  }

  document.addEventListener("DOMContentLoaded", function () {
    var langs = document.querySelectorAll("#dl-lang button");
    for (var i = 0; i < langs.length; i++) {
      langs[i].addEventListener("click", function () { if (I) { I.set(this.getAttribute("data-lang")); render(); } });
    }
    render();
  });
})();
