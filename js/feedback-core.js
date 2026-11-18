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

  // ---- Data log đính kèm (phím F9 trong game, js/feedback-capture.js) ----------------------
  // Bucket hub-feedback chỉ nhận ảnh (db/feedback.sql), nên log JSON đi trong một ảnh PNG thật:
  // một tấm thẻ nhỏ ghi "Data log", JSON nén zlib nằm trong chunk iTXt từ khoá LOG_KEYWORD.
  // Không cần đổi schema; exiftool / tools/feedback.js đọc ra được. Đường dẫn tấm này nằm ở env.log.
  var LOG_KEYWORD = "hub-feedback-log";
  var crcTable = null;

  function crc32(bytes) {
    if (!crcTable) {
      crcTable = new Uint32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        crcTable[n] = c >>> 0;
      }
    }
    var crc = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function concat(parts) {
    var len = parts.reduce(function (s, p) { return s + p.length; }, 0);
    var out = new Uint8Array(len), at = 0;
    parts.forEach(function (p) { out.set(p, at); at += p.length; });
    return out;
  }

  function u32(n) { return new Uint8Array([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]); }

  function pngChunk(type, data) {
    var td = concat([new TextEncoder().encode(type), data]);
    return concat([u32(data.length), td, u32(crc32(td))]);
  }

  function streamBytes(bytes, stream) {
    return new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()
      .then(function (b) { return new Uint8Array(b); });
  }

  // Trả { iend: vị trí chunk IEND, log: dữ liệu iTXt của log hoặc null }.
  function walkPng(bytes) {
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var at = 8, found = { iend: -1, log: null };
    while (at + 12 <= bytes.length) {
      var len = view.getUint32(at);
      var type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
      if (type === "IEND") { found.iend = at; break; }
      if (type === "iTXt") {
        var data = bytes.subarray(at + 8, at + 8 + len);
        var zero = data.indexOf(0);
        if (zero > 0 && new TextDecoder().decode(data.subarray(0, zero)) === LOG_KEYWORD) found.log = data.subarray(zero + 1);
      }
      at += 12 + len;
    }
    return found;
  }

  function logCard(summary) {
    var c = document.createElement("canvas");
    c.width = 480;
    c.height = 120;
    var g = c.getContext("2d");
    g.fillStyle = "#14181f";
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#6ea8fe";
    g.fillRect(0, 0, 8, c.height);
    g.fillStyle = "#e8ecf2";
    g.font = "bold 26px system-ui, sans-serif";
    g.fillText("Data log", 28, 46);
    g.fillStyle = "#9aa1ad";
    g.font = "18px system-ui, sans-serif";
    g.fillText(String(summary || "").slice(0, 48), 28, 86);
    return new Promise(function (resolve) { c.toBlob(resolve, "image/png"); })
      .then(function (b) { return b.arrayBuffer(); })
      .then(function (b) { return new Uint8Array(b); });
  }

  // obj → Blob image/png chứa JSON. summary là dòng chữ hiện trên thẻ.
  function logPng(obj, summary) {
    var text = new TextEncoder().encode(JSON.stringify(obj));
    var zipped = window.CompressionStream ? streamBytes(text, new CompressionStream("deflate")) : Promise.resolve(null);
    return Promise.all([zipped, logCard(summary)]).then(function (r) {
      var z = r[0], png = r[1];
      var head = concat([new TextEncoder().encode(LOG_KEYWORD), new Uint8Array([0, z ? 1 : 0, 0, 0, 0])]);
      var chunk = pngChunk("iTXt", concat([head, z || text]));
      var iend = walkPng(png).iend;
      return new Blob([png.subarray(0, iend), chunk, png.subarray(iend)], { type: "image/png" });
    });
  }

  // URL hoặc Blob của tấm PNG log → object JSON. Hỏng thì reject Error có message rõ.
  function readLog(src) {
    var bytes = typeof src === "string"
      ? fetch(src).then(function (r) {
        if (!r.ok) throw new Error("log file not found: HTTP " + r.status);
        return r.arrayBuffer();
      })
      : src.arrayBuffer();
    return bytes.then(function (b) {
      var data = walkPng(new Uint8Array(b)).log;
      if (!data) throw new Error("log chunk missing from image");
      // data: cờ nén, phương thức, ngôn ngữ\0, từ khoá dịch\0, nội dung
      var flag = data[0];
      var at = data.indexOf(0, 2);
      at = data.indexOf(0, at + 1) + 1;
      var body = data.subarray(at);
      return flag ? streamBytes(body, new DecompressionStream("deflate")) : body;
    }).then(function (body) { return JSON.parse(new TextDecoder().decode(body)); });
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

    logPng: logPng,
    readLog: readLog,
    // Đường dẫn tấm PNG log của phiếu (gửi bằng phím F9 trong game), hoặc null.
    logPath: function (x) {
      var p = x && x.env && x.env.log;
      return p && (x.shots || []).indexOf(p) >= 0 ? p : null;
    },
    // Ảnh chụp thật của phiếu, bỏ tấm log ra.
    photos: function (x) {
      var log = window.FB.logPath(x);
      return (x.shots || []).filter(function (p) { return p !== log; });
    },

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
