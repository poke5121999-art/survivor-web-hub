/*
 * Phần chung của feedback.html và feedback-admin.html (window.FB): ngôn ngữ, danh sách game,
 * gọi Supabase (bảng hub_feedback, bucket hub-feedback, các hàm fb_* trong db/feedback.sql).
 */
(function () {
  "use strict";

  var STRINGS = {
    en: {
      hubGame: "Hub (general)",
      guest: "Guest",
      noBody: "(no description)",
      open: "New",
      doing: "In progress",
      closed: "Fixed",
      wontfix: "Won't fix",
      missing: "The inbox is not set up yet: the hub owner needs to run db/feedback.sql in Supabase.",
      offline: "Cannot reach the report server. Check your connection and reload.",
      httpError: "The report server returned an error: {0}"
    },
    vi: {
      hubGame: "Trang hub (chung)",
      guest: "Khách",
      noBody: "(không có mô tả)",
      open: "Mới",
      doing: "Đang sửa",
      closed: "Đã xong",
      wontfix: "Không sửa",
      missing: "Hộp thư chưa mở: chủ hub cần chạy db/feedback.sql trong Supabase.",
      offline: "Không kết nối được máy chủ phiếu. Kiểm tra mạng rồi tải lại trang.",
      httpError: "Máy chủ phiếu báo lỗi: {0}"
    }
  };
  var LOCALE = { en: "en-GB", vi: "vi-VN" };
  var LANG_KEY = "hub.feedback.lang";
  var BUCKET = "hub-feedback";

  var GAMES = [{ id: "hub", thumbnail: "assets/favicon.svg" }].concat(
    (window.HUB_GAMES || []).filter(function (g) { return g.status === "available"; })
  );
  var byId = {};
  GAMES.forEach(function (g) { byId[g.id] = g; });

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (e) { /* storage blocked */ }
    return null;
  }

  var wanted = new URLSearchParams(location.search).get("lang") || store(LANG_KEY);
  var lang = STRINGS[wanted] ? wanted : "en";

  function t(key) {
    var s = STRINGS[lang][key];
    if (s == null) return key;
    for (var i = 1; i < arguments.length; i++) s = s.split("{" + (i - 1) + "}").join(arguments[i]);
    return s;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function cfg() { return window.SUPABASE_CONFIG || {}; }
  function base() { return String(cfg().url || "").replace(/\/+$/, ""); }

  function authToken() {
    var s = window.HubSession && window.HubSession.get();
    if (s && s.kind === "member" && s.accessToken && !window.HubSession.isExpired()) return s.accessToken;
    return cfg().anonKey;
  }

  // Lỗi trả về luôn có dạng { kind: "missing" | "offline" | "http" | "key", message }.
  function call(path, init) {
    if (!base() || !cfg().anonKey) return Promise.reject({ kind: "missing" });
    init.headers = init.headers || {};
    init.headers.apikey = cfg().anonKey;
    init.headers.Authorization = "Bearer " + authToken();
    return fetch(base() + path, init).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
        if (data && (data.code === "PGRST205" || data.code === "PGRST202")) throw { kind: "missing" };
        if (data && /feedback manage denied/.test(data.message || "")) throw { kind: "key" };
        if (!res.ok) throw { kind: "http", message: (data && (data.message || data.error)) || ("HTTP " + res.status) };
        return data;
      });
    }, function () { throw { kind: "offline" }; });
  }

  window.FB = {
    STATUSES: ["open", "doing", "closed", "wontfix"],
    GROUP: { open: "active", doing: "active", closed: "done", wontfix: "done" },
    KIND_ICON: { bug: "🐞", feedback: "💡" },
    COLUMNS: "id,game_id,kind,title,body,status,resolution,reporter_name,shots,env,created_at,updated_at",
    GAMES: GAMES,
    game: function (id) { return byId[id]; },
    el: el,
    store: store,
    t: t,
    lang: function () { return lang; },

    strings: function (more) {
      Object.keys(more).forEach(function (l) {
        Object.keys(more[l]).forEach(function (k) { STRINGS[l][k] = more[l][k]; });
      });
    },

    gameTitle: function (id) { return id === "hub" ? t("hubGame") : (byId[id] || { title: id }).title; },

    // Điền chữ cho mọi [data-i18n] / [data-i18n-ph] và đánh dấu nút ngôn ngữ đang chọn.
    applyStatic: function () {
      document.documentElement.lang = lang;
      document.title = t("docTitle");
      document.querySelectorAll("[data-i18n]").forEach(function (n) { n.textContent = t(n.dataset.i18n); });
      document.querySelectorAll("[data-i18n-ph]").forEach(function (n) { n.placeholder = t(n.dataset.i18nPh); });
      document.querySelectorAll("[data-lang]").forEach(function (b) {
        b.setAttribute("aria-pressed", String(b.dataset.lang === lang));
      });
    },

    bindLangSwitch: function (root, onChange) {
      root.addEventListener("click", function (e) {
        var l = e.target.dataset && e.target.dataset.lang;
        if (!STRINGS[l] || l === lang) return;
        lang = l;
        store(LANG_KEY, l);
        onChange();
      });
    },

    errorText: function (err) {
      return err.kind === "missing" ? t("missing") : err.kind === "offline" ? t("offline") : t("httpError", err.message || err.kind);
    },

    fmtDate: function (iso) {
      var d = new Date(iso);
      return d.toLocaleDateString(LOCALE[lang], { day: "2-digit", month: "2-digit" }) + " " +
        d.toLocaleTimeString(LOCALE[lang], { hour: "2-digit", minute: "2-digit" });
    },

    api: function (method, route, body) {
      return call("/rest/v1/" + route, {
        method: method,
        headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        body: body ? JSON.stringify(body) : undefined
      });
    },

    rpc: function (name, args) {
      return call("/rest/v1/rpc/" + name, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args)
      });
    },

    uploadShot: function (path, blob) {
      return call("/storage/v1/object/" + BUCKET + "/" + path, {
        method: "POST",
        headers: { "Content-Type": blob.type, "x-upsert": "false" },
        body: blob
      }).then(function () { return path; });
    },

    shotUrl: function (path) { return base() + "/storage/v1/object/public/" + BUCKET + "/" + path; },

    shotLinks: function (paths) {
      var row = el("div", "fb-item__shots");
      paths.forEach(function (p) {
        var a = el("a");
        a.href = window.FB.shotUrl(p);
        a.target = "_blank";
        a.rel = "noopener";
        var img = el("img");
        img.src = a.href;
        img.alt = "";
        img.loading = "lazy";
        a.appendChild(img);
        row.appendChild(a);
      });
      return row;
    }
  };
})();
