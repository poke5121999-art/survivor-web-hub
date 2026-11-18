/*
 * Phím báo lỗi chung cho mọi game trên hub: F9, hoặc nút máy ảnh nhỏ ở mép màn hình (điện thoại).
 * Bấm một lần là chụp màn hình + data log đúng lúc đó, rồi mở ngăn báo lỗi bên cạnh game (game vẫn chạy).
 *
 * Nạp ở đâu: js/game-gate.js tự nạp tệp này cho game có cổng; game không có cổng nhúng một dòng
 *   <script src="../../js/feedback-capture.js?v=..."></script> ngay đầu <head>.
 * Nạp càng sớm càng tốt: từ lúc chạy nó giữ vòng đệm console (300 dòng gần nhất), lỗi + stack,
 *   và đo FPS bằng cách bọc requestAnimationFrame.
 *
 * Ảnh WebGL: canvas WebGL mặc định (preserveDrawingBuffer=false) đọc ra trắng ngoài khung hình. Thay vì ép
 *   preserveDrawingBuffer (tốn một lần chép bộ đệm mỗi khung), tệp này bọc requestAnimationFrame và chép
 *   canvas NGAY SAU callback của game trong cùng khung hình, lúc bộ đệm còn nguyên. Lớp HUD bằng DOM được
 *   vẽ chồng bằng html2canvas 1.4.1 (cdnjs, chỉ tải khi bấm chụp); tải không được thì ghép canvas theo vị trí.
 *
 * Log lưu ở đâu: một tấm PNG "Data log" trong bucket hub-feedback, JSON nén trong chunk iTXt (xem
 *   FB.logPng ở js/feedback-core.js). Phiếu ghi đường dẫn tấm ấy ở env.log. Không cần đổi schema.
 *
 * Móc cho tác giả game: window.hubFeedbackState = function () { return { màn: ..., vàng: ... }; }
 *   Giá trị trả về (object JSON được, tối đa ~200 KB) nằm ở log.state. Xem README.md "Phím báo lỗi F9".
 */
(function () {
  "use strict";
  if (window.__hubCapture) return;

  var VERSION = "20261118b";
  var HOTKEY = "F9";
  var MAX_LINES = 300, MAX_LINE = 600, MAX_ERRORS = 60, MAX_STATE = 200000, MAX_SIDE = 1600;
  var H2C_URL = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
  var POS_KEY = "hub.capture.pos";
  var SESSION_KEY = "hub.session.v1";

  var me = document.currentScript;
  var ROOT = me && me.src ? me.src.replace(/js\/feedback-capture\.js.*$/, "") : location.origin + "/survivor-web-hub/";

  // open(): chụp + mở ngăn như bấm F9. lastLog(): log của lần chụp gần nhất (cho bộ kiểm).
  var api = window.__hubCapture = {
    version: VERSION,
    open: function () { capture(); },
    lastLog: function () { return state.log; }
  };

  // ---- Vòng đệm console + lỗi ------------------------------------------------------------
  var lines = [], errors = [];

  function clip(s, n) { s = String(s); return s.length > n ? s.slice(0, n) + "…(+" + (s.length - n) + ")" : s; }

  function brief(v, d) {
    if (v === null || v === undefined) return String(v);
    var ty = typeof v;
    if (ty === "string") return d ? JSON.stringify(clip(v, 200)) : v;
    if (ty !== "object" && ty !== "function") return String(v);
    if (ty === "function") return "ƒ " + (v.name || "anonymous");
    try {
      if (v instanceof Error) return v.stack && v.stack.indexOf(v.message) >= 0 ? v.stack : v.name + ": " + v.message + (v.stack ? "\n" + v.stack : "");
      if (v.nodeType === 1) return "<" + v.tagName.toLowerCase() + (v.id ? "#" + v.id : "") + ">";
      var isList = Array.isArray(v) || ArrayBuffer.isView(v);
      if (d >= 2) return isList ? "[…" + v.length + "]" : "{…}";
      if (isList) {
        var a = Array.prototype.slice.call(v, 0, 20).map(function (x) { return brief(x, d + 1); });
        return "[" + a.join(", ") + (v.length > 20 ? ", …+" + (v.length - 20) : "") + "]";
      }
      var keys = Object.keys(v), out = [];
      for (var i = 0; i < keys.length && i < 20; i++) out.push(keys[i] + ": " + brief(v[keys[i]], d + 1));
      return "{" + out.join(", ") + (keys.length > 20 ? ", …+" + (keys.length - 20) : "") + "}";
    } catch (e) {
      return "[object]";
    }
  }

  function now() { return Math.round(performance.now()); }

  function addLine(level, msg) {
    msg = clip(msg, MAX_LINE);
    var last = lines[lines.length - 1];
    if (last && last.l === level && last.m === msg) { last.n = (last.n || 1) + 1; last.t2 = now(); return; }
    lines.push({ t: now(), l: level, m: msg });
    if (lines.length > MAX_LINES) lines.shift();
  }

  function fromArgs(args) {
    var list = Array.prototype.slice.call(args);
    // console.log("%cchữ", "color:red") — bỏ %c và đối số kiểu chữ đi kèm.
    if (typeof list[0] === "string" && list[0].indexOf("%c") >= 0) {
      var n = list[0].split("%c").length - 1;
      list[0] = list[0].split("%c").join("");
      list.splice(1, n);
    }
    return list.map(function (x) { return brief(x, 0); }).join(" ");
  }

  ["log", "info", "warn", "error", "debug"].forEach(function (lv) {
    var orig = console[lv];
    if (typeof orig !== "function") return;
    console[lv] = function () {
      try { addLine(lv, fromArgs(arguments)); } catch (e) { /* log hỏng thì bỏ dòng ấy */ }
      return orig.apply(this, arguments);
    };
  });

  function addError(item) {
    item.t = now();
    errors.push(item);
    if (errors.length > MAX_ERRORS) errors.shift();
    addLine("uncaught", item.m + (item.src ? " @ " + item.src : ""));
  }

  window.addEventListener("error", function (e) {
    var tg = e.target;
    if (tg && tg !== window && tg.tagName) {
      addError({ type: "resource", m: "load failed: <" + tg.tagName.toLowerCase() + "> " + clip(tg.currentSrc || tg.src || tg.href || "", 300) });
      return;
    }
    addError({
      type: "error",
      m: clip(e.message || "error", MAX_LINE),
      src: e.filename ? e.filename + ":" + e.lineno + ":" + e.colno : undefined,
      stack: e.error && e.error.stack ? clip(e.error.stack, 3000) : undefined
    });
  }, true);

  window.addEventListener("unhandledrejection", function (e) {
    var r = e.reason;
    addError({ type: "rejection", m: clip(brief(r, 0), MAX_LINE), stack: r && r.stack ? clip(r.stack, 3000) : undefined });
  });

  // ---- Khung hình: đo FPS + chỗ chụp canvas WebGL ----------------------------------------
  var frames = [], lastTs = -1, grabber = null;

  function onFrame(ts) {
    if (ts === lastTs) return;
    lastTs = ts;
    frames.push(ts);
    if (frames.length > 240) frames.shift();
  }

  var rafOrig = window.requestAnimationFrame;
  if (typeof rafOrig === "function") {
    window.requestAnimationFrame = function (cb) {
      if (typeof cb !== "function") return rafOrig.call(window, cb);
      return rafOrig.call(window, function (ts) {
        onFrame(ts);
        try { return cb(ts); } finally { if (grabber) { try { grabber(ts); } catch (e) { /* chụp hỏng không làm hỏng game */ } } }
      });
    };
  }

  // Ghi loại context của từng canvas (đọc lại sau mà không phải gọi getContext, vì gọi là tạo context mới).
  var getContextOrig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type) {
    var ctx = getContextOrig.apply(this, arguments);
    if (ctx && !this.__hubCtx) { try { this.__hubCtx = String(type); } catch (e) { /* canvas đóng băng */ } }
    return ctx;
  };

  function perf() {
    var t = performance.now();
    var recent = frames.filter(function (f) { return t - f < 3000; });
    var out = { fps: null, frameMsAvg: null, frameMsMax: null, sinceLastFrameMs: frames.length ? Math.round(t - frames[frames.length - 1]) : null };
    if (recent.length >= 2) {
      var span = recent[recent.length - 1] - recent[0], max = 0;
      for (var i = 1; i < recent.length; i++) max = Math.max(max, recent[i] - recent[i - 1]);
      out.fps = Math.round((recent.length - 1) * 10000 / span) / 10;
      out.frameMsAvg = Math.round(span / (recent.length - 1) * 10) / 10;
      out.frameMsMax = Math.round(max * 10) / 10;
    }
    var m = performance.memory;
    if (m) {
      out.heapUsedMB = Math.round(m.usedJSHeapSize / 104857.6) / 10;
      out.heapLimitMB = Math.round(m.jsHeapSizeLimit / 104857.6) / 10;
    }
    return out;
  }

  // ---- Thông tin game / người chơi -------------------------------------------------------
  function gameId() {
    var m = /\/games\/([a-z0-9-]{1,40})(\/|$)/.exec(location.pathname);
    return m ? m[1] : "hub";
  }

  function gameRev() {
    if (window.GAME_REV) return String(window.GAME_REV);
    var dir = location.href.replace(/[?#].*$/, "").replace(/[^/]*$/, "");
    var els = document.querySelectorAll("script[src], link[href]");
    for (var i = 0; i < els.length; i++) {
      var u = els[i].src || els[i].href || "";
      var m = /[?&]v=([\w.-]{1,40})/.exec(u);
      if (m && u.indexOf(dir) === 0) return m[1];
    }
    var q = /[?&]v=([\w.-]{1,40})/.exec(location.search);
    return q ? q[1] : null;
  }

  function session() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch (e) { return null; }
  }

  function lang() {
    try { return localStorage.getItem("hub.lang") === "en" ? "en" : "vi"; } catch (e) { return "vi"; }
  }

  function gameState() {
    if (typeof window.hubFeedbackState !== "function") return { state: undefined };
    try {
      var seen = typeof WeakSet === "function" ? new WeakSet() : null;
      var json = JSON.stringify(window.hubFeedbackState(), function (k, v) {
        if (v && typeof v === "object" && seen) {
          if (seen.has(v)) return "[cycle]";
          seen.add(v);
        }
        return v;
      });
      if (json === undefined) return { state: null };
      if (json.length > MAX_STATE) return { state: { truncated: true, json: json.slice(0, MAX_STATE) } };
      return { state: JSON.parse(json) };
    } catch (e) {
      return { stateError: clip(e && e.stack || String(e), 2000) };
    }
  }

  function canvasInfo(list, shots) {
    return list.map(function (c) {
      var r = c.getBoundingClientRect(), s = shots.get(c);
      return {
        id: c.id || undefined, ctx: c.__hubCtx || "unknown", w: c.width, h: c.height,
        css: Math.round(r.width) + "x" + Math.round(r.height), grabbed: !!s, blank: s ? s.__blank : undefined
      };
    });
  }

  function buildLog(when, p, list, shots) {
    var s = session() || {};
    var st = gameState();
    var conn = navigator.connection || {};
    var log = {
      kind: "hub-feedback-log",
      v: 1,
      at: new Date(when).toISOString(),
      uptimeSec: Math.round(performance.now() / 100) / 10,
      game: { id: gameId(), rev: gameRev(), title: document.title, url: location.href.slice(0, 500) },
      user: s.kind ? { kind: s.kind, name: s.name || null, role: s.role || null } : null,
      env: {
        ua: navigator.userAgent, lang: navigator.language, platform: navigator.platform,
        screen: screen.width + "x" + screen.height, viewport: innerWidth + "x" + innerHeight,
        dpr: window.devicePixelRatio || 1, orientation: screen.orientation ? screen.orientation.type : null,
        touchPoints: navigator.maxTouchPoints || 0, deviceMemoryGB: navigator.deviceMemory || null,
        cores: navigator.hardwareConcurrency || null, net: conn.effectiveType || null,
        visible: document.visibilityState, fullscreen: !!document.fullscreenElement
      },
      perf: p,
      canvases: canvasInfo(list, shots),
      errors: errors.slice(),
      console: lines.slice()
    };
    if ("state" in st && st.state !== undefined) log.state = st.state;
    if (st.stateError) log.stateError = st.stateError;
    return log;
  }

  // ---- Chụp màn hình ------------------------------------------------------------------
  function visibleCanvases() {
    return Array.prototype.filter.call(document.querySelectorAll("canvas"), function (c) {
      if (!c.width || !c.height || host && host.contains(c)) return false;
      var r = c.getBoundingClientRect();
      return r.width > 1 && r.height > 1 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
    });
  }

  function isBlank(snap) {
    var t = document.createElement("canvas");
    t.width = t.height = 24;
    var g = t.getContext("2d");
    g.drawImage(snap, 0, 0, 24, 24);
    var d = g.getImageData(0, 0, 24, 24).data;
    for (var i = 0; i < d.length; i += 4) if (d[i + 3] && (d[i] || d[i + 1] || d[i + 2])) return false;
    return true;
  }

  function copyCanvas(c) {
    var s = document.createElement("canvas");
    s.width = c.width;
    s.height = c.height;
    s.getContext("2d").drawImage(c, 0, 0);
    return s;
  }

  // Chép mọi canvas đang thấy. Canvas WebGL chép trong khung hình kế tiếp, ngay sau callback rAF của game.
  function grabCanvases(list) {
    var shots = new Map();
    function takeAll() {
      list.forEach(function (c) { try { shots.set(c, copyCanvas(c)); } catch (e) { shots.delete(c); } });
    }
    function mark() { shots.forEach(function (s) { try { s.__blank = isBlank(s); } catch (e) { s.__blank = false; } }); }
    takeAll();
    var gl = list.filter(function (c) { return c.__hubCtx !== "2d"; });
    var animating = frames.length && performance.now() - frames[frames.length - 1] < 500;
    if (!gl.length || !animating) { mark(); return Promise.resolve(shots); }

    return new Promise(function (resolve) {
      var tries = 0, timer = null;
      function done() {
        grabber = null;
        clearTimeout(timer);
        clearTimeout(guard);
        mark();
        resolve(shots);
      }
      var guard = setTimeout(done, 1500);
      // Mỗi callback rAF chép lại; setTimeout chạy sau khi khung hình vẽ xong, lúc đó bản chép cuối cùng là đủ.
      grabber = function () {
        takeAll();
        clearTimeout(timer);
        timer = setTimeout(function () {
          tries++;
          var blank = gl.some(function (c) { var s = shots.get(c); return !s || isBlank(s); });
          if (!blank || tries >= 6) done();
        }, 0);
      };
    });
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error("script load failed: " + src)); };
      document.head.appendChild(s);
    });
  }

  var h2cPromise = null;
  function html2canvasLib() {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    if (!h2cPromise) h2cPromise = loadScript(H2C_URL).then(function () { return window.html2canvas; });
    return h2cPromise;
  }

  function pageBackground() {
    var b = document.body && getComputedStyle(document.body).backgroundColor;
    if (b && b !== "rgba(0, 0, 0, 0)" && b !== "transparent") return b;
    var h = getComputedStyle(document.documentElement).backgroundColor;
    return h && h !== "rgba(0, 0, 0, 0)" && h !== "transparent" ? h : "#000";
  }

  // Dự phòng khi không có html2canvas: chỉ ghép các canvas theo vị trí trên màn hình.
  function composeCanvases(list, shots, scale) {
    var out = document.createElement("canvas");
    out.width = Math.round(innerWidth * scale);
    out.height = Math.round(innerHeight * scale);
    var g = out.getContext("2d");
    g.fillStyle = pageBackground();
    g.fillRect(0, 0, out.width, out.height);
    list.forEach(function (c) {
      var s = shots.get(c);
      if (!s) return;
      var r = c.getBoundingClientRect();
      g.drawImage(s, r.left * scale, r.top * scale, r.width * scale, r.height * scale);
    });
    return out;
  }

  function composeDom(list, shots, scale) {
    var all = Array.prototype.slice.call(document.querySelectorAll("canvas")).filter(function (c) { return !host || !host.contains(c); });
    return html2canvasLib().then(function (h2c) {
      var job = h2c(document.documentElement, {
        scale: scale, useCORS: true, logging: false, backgroundColor: pageBackground(),
        x: window.scrollX, y: window.scrollY, width: innerWidth, height: innerHeight,
        windowWidth: innerWidth, windowHeight: innerHeight,
        ignoreElements: function (el) { return el === host; },
        onclone: function (doc) {
          // Canvas trong bản sao cùng thứ tự với bản gốc; vẽ bản chép (đã có WebGL) vào thay.
          var cloned = doc.querySelectorAll("canvas");
          all.forEach(function (c, i) {
            var s = shots.get(c), cc = cloned[i];
            if (!s || !cc || cc.tagName !== "CANVAS") return;
            try {
              var g = cc.getContext("2d");
              if (!g) return;
              cc.width = c.width;
              cc.height = c.height;
              g.drawImage(s, 0, 0);
            } catch (e) { /* bỏ canvas này */ }
          });
        }
      });
      var timeout = new Promise(function (_, reject) { setTimeout(function () { reject(new Error("html2canvas timeout")); }, 10000); });
      return Promise.race([job, timeout]);
    });
  }

  function toBlob(canvas) {
    function enc(type, q) { return new Promise(function (r) { canvas.toBlob(r, type, q); }); }
    return enc("image/webp", 0.85).then(function (b) {
      if (b && b.type === "image/webp") return b;
      return enc("image/jpeg", 0.85);
    }).then(function (b) {
      if (b && b.size > 1400000) return enc(b.type, 0.6);
      return b;
    });
  }

  function screenshot() {
    var when = Date.now();
    var p = perf();
    var list = visibleCanvases();
    var scale = Math.min(window.devicePixelRatio || 1, MAX_SIDE / Math.max(innerWidth, innerHeight));
    return grabCanvases(list).then(function (shots) {
      var log = buildLog(when, p, list, shots);
      var t0 = performance.now();
      return composeDom(list, shots, scale).then(function (c) { return { canvas: c, how: "html2canvas" }; }, function (e) {
        log.captureNote = "DOM overlay skipped: " + (e && e.message || e);
        return { canvas: composeCanvases(list, shots, scale), how: "canvas-only" };
      }).then(function (r) {
        log.capture = { how: r.how, ms: Math.round(performance.now() - t0), size: r.canvas.width + "x" + r.canvas.height };
        return toBlob(r.canvas).then(function (blob) { return { blob: blob, log: log }; });
      });
    });
  }

  // ---- Nạp phần gửi phiếu (js/feedback-core.js) ------------------------------------------
  var corePromise = null;
  function core() {
    if (corePromise) return corePromise;
    var prev = window.FB;
    corePromise = Promise.resolve()
      .then(function () { return window.HubSession ? null : loadScript(ROOT + "js/session.js"); })
      .then(function () { return window.SUPABASE_CONFIG ? null : loadScript(ROOT + "js/supabase-config.js"); })
      .then(function () {
        if (prev && prev.logPng) return prev;
        return loadScript(ROOT + "js/feedback-core.js?v=" + VERSION).then(function () {
          var fb = window.FB;
          if (prev) window.FB = prev; // game có biến FB riêng thì trả lại
          return fb;
        });
      });
    corePromise.catch(function () { corePromise = null; });
    return corePromise;
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 15) | 64;
    b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join("");
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
  }

  // ---- Giao diện: nút + ngăn báo lỗi (Shadow DOM, không đụng CSS của game) --------------
  var TEXT = {
    vi: {
      btn: "Chụp màn hình và báo lỗi (F9)", title: "Báo lỗi / góp ý", close: "Đóng (Esc)", capturing: "Đang chụp…",
      bug: "🐞 Báo lỗi", feedback: "💡 Góp ý", titleLabel: "Tiêu đề", titlePh: "Ví dụ: Nhân vật kẹt ở góc tường",
      body: "Chi tiết", bodyPh: "Bạn đang làm gì, thấy gì, lẽ ra phải thấy gì?", name: "Tên bạn", namePh: "Để trống thì hiện là Khách",
      withShot: "Kèm ảnh chụp", withLog: "Kèm data log", logSum: "{0} dòng console · {1} lỗi · {2} FPS",
      view: "Xem", hide: "Ẩn", send: "Gửi phiếu", sending: "Đang gửi…", sent: "Đã gửi phiếu #{0}. Cảm ơn bạn!",
      short: "Tiêu đề cần ít nhất 3 ký tự.", failed: "Gửi không được: {0}", shotFailed: "Chụp không được: {0}",
      page: "Trang phiếu ↗", again: "Chụp lại"
    },
    en: {
      btn: "Screenshot and report (F9)", title: "Bug report / feedback", close: "Close (Esc)", capturing: "Capturing…",
      bug: "🐞 Bug", feedback: "💡 Feedback", titleLabel: "Title", titlePh: "e.g. Player stuck in the wall corner",
      body: "Details", bodyPh: "What were you doing, what happened, what did you expect?", name: "Your name", namePh: "Leave blank to show as Guest",
      withShot: "Attach screenshot", withLog: "Attach data log", logSum: "{0} console lines · {1} errors · {2} FPS",
      view: "View", hide: "Hide", send: "Send report", sending: "Sending…", sent: "Report #{0} sent. Thank you!",
      short: "The title needs at least 3 characters.", failed: "Could not send: {0}", shotFailed: "Capture failed: {0}",
      page: "Reports page ↗", again: "Retake"
    }
  };
  function tr(key) {
    var s = (TEXT[lang()] || TEXT.vi)[key] || key;
    for (var i = 1; i < arguments.length; i++) s = s.split("{" + (i - 1) + "}").join(arguments[i]);
    return s;
  }

  var CSS = [
    ":host{all:initial}",
    "*{box-sizing:border-box;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}",
    ".cam{position:fixed;z-index:2147483646;width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,255,255,.35);",
    "background:rgba(20,24,31,.55);color:#fff;display:flex;align-items:center;justify-content:center;opacity:.45;",
    "touch-action:none;user-select:none;-webkit-user-select:none;cursor:pointer;transition:opacity .2s;padding:0}",
    ".cam:hover,.cam.drag{opacity:1}",
    ".cam svg{width:18px;height:18px;pointer-events:none}",
    ".panel{position:fixed;z-index:2147483647;background:#14181f;color:#e8ecf2;display:flex;flex-direction:column;",
    "box-shadow:0 0 32px rgba(0,0,0,.55);font-size:14px;line-height:1.35}",
    ".panel[hidden]{display:none}",
    ".side{top:0;right:0;bottom:0;width:min(380px,46vw);border-left:1px solid #2a3140;",
    "padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) 0}",
    ".sheet{left:0;right:0;bottom:0;max-height:62vh;border-top:1px solid #2a3140;border-radius:14px 14px 0 0;",
    "padding:0 env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}",
    "header{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #2a3140}",
    "header b{flex:1;font-size:15px}",
    ".game{color:#9aa1ad;font-size:12px;max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    "button{font:inherit;color:inherit;cursor:pointer}",
    ".x{background:none;border:0;font-size:22px;line-height:1;padding:2px 6px;color:#9aa1ad}",
    ".body{flex:1;overflow:auto;padding:10px 12px;display:flex;flex-direction:column;gap:8px;overscroll-behavior:contain}",
    ".shot{position:relative;border:1px solid #2a3140;border-radius:8px;overflow:hidden;background:#0b0e13;min-height:60px}",
    ".shot img{display:block;width:100%;max-height:30vh;object-fit:contain}",
    ".shot .wait{padding:20px;text-align:center;color:#9aa1ad}",
    ".row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;color:#c9cfd8}",
    ".row .sum{color:#9aa1ad;flex:1;min-width:0}",
    ".link{background:none;border:0;color:#6ea8fe;padding:0;text-decoration:underline}",
    "pre{margin:0;max-height:28vh;overflow:auto;background:#0b0e13;border:1px solid #2a3140;border-radius:6px;padding:6px;",
    "font:11px/1.35 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-all;color:#c9cfd8}",
    "label.f{display:flex;flex-direction:column;gap:4px;font-size:12px;color:#9aa1ad;font-weight:600}",
    "input[type=text],textarea{font:inherit;font-size:16px;color:#e8ecf2;background:#0b0e13;border:1px solid #2a3140;",
    "border-radius:6px;padding:7px 9px;width:100%}",
    "textarea{resize:vertical;min-height:70px}",
    "input:focus,textarea:focus{outline:2px solid #6ea8fe;outline-offset:-1px}",
    ".kind{display:flex;gap:14px;font-size:14px}",
    "footer{display:flex;align-items:center;gap:10px;padding:10px 12px;border-top:1px solid #2a3140}",
    "footer a{color:#9aa1ad;font-size:12px}",
    ".msg{flex:1;font-size:12px;margin:0;color:#4ade80;min-width:0}",
    ".msg.err{color:#f87171}",
    ".send{background:#3b6fe0;border:0;border-radius:8px;padding:9px 16px;font-weight:700;color:#fff}",
    ".send:disabled{opacity:.5;cursor:default}"
  ].join("");

  var CAMERA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';

  var host = null, root = null, cam = null, panel = null, ui = {};
  var state = { open: false, busy: false, shot: null, log: null, shotUrl: null };

  function q(sel) { return root.querySelector(sel); }

  function mount() {
    if (host || !document.documentElement) return;
    host = document.createElement("div");
    host.id = "hub-feedback-capture";
    host.setAttribute("data-version", VERSION);
    root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    root.innerHTML = "<style>" + CSS + "</style>" +
      '<button class="cam" type="button" data-act="cam">' + CAMERA + "</button>" +
      '<aside class="panel" role="dialog" aria-modal="false" hidden>' +
      '<header><b data-t="title"></b><span class="game"></span><button class="x" type="button" data-act="close">×</button></header>' +
      '<form class="body" novalidate>' +
      '<div class="shot"><div class="wait" data-t="capturing"></div><img alt="" hidden></div>' +
      '<div class="row"><label><input type="checkbox" name="withShot" checked> <span data-t="withShot"></span></label>' +
      '<button class="link" type="button" data-act="again" data-t="again"></button></div>' +
      '<div class="row"><label><input type="checkbox" name="withLog" checked> <span data-t="withLog"></span></label>' +
      '<span class="sum"></span><button class="link" type="button" data-act="view" data-t="view"></button></div>' +
      "<pre hidden></pre>" +
      '<div class="kind"><label><input type="radio" name="kind" value="bug" checked> <span data-t="bug"></span></label>' +
      '<label><input type="radio" name="kind" value="feedback"> <span data-t="feedback"></span></label></div>' +
      '<label class="f"><span data-t="titleLabel"></span><input type="text" name="title" maxlength="120" autocomplete="off"></label>' +
      '<label class="f"><span data-t="body"></span><textarea name="body" rows="4" maxlength="4000"></textarea></label>' +
      '<label class="f"><span data-t="name"></span><input type="text" name="name" maxlength="40" autocomplete="nickname"></label>' +
      "</form>" +
      '<footer><p class="msg" role="status"></p><a target="_blank" rel="noopener" data-t="page"></a>' +
      '<button class="send" type="button" data-act="send" data-t="send"></button></footer>' +
      "</aside>";
    cam = q(".cam");
    panel = q(".panel");
    ui = {
      form: q("form"), img: q(".shot img"), wait: q(".shot .wait"), sum: q(".sum"), pre: q("pre"),
      msg: q(".msg"), send: q(".send"), game: q(".game"), page: q("footer a")
    };
    ui.form.addEventListener("submit", function (e) { e.preventDefault(); send(); });
    document.documentElement.appendChild(host);
    placeCam(readPos());
    applyText();
    document.addEventListener("fullscreenchange", followFullscreen);
    // Đừng để click trong ngăn nổi bọt ra document/window của game.
    host.addEventListener("click", function (e) { e.stopPropagation(); });
  }

  function applyText() {
    root.querySelectorAll("[data-t]").forEach(function (n) { n.textContent = tr(n.getAttribute("data-t")); });
    cam.title = tr("btn");
    cam.setAttribute("aria-label", tr("btn"));
    q(".x").title = tr("close");
    ui.form.elements.title.placeholder = tr("titlePh");
    ui.form.elements.body.placeholder = tr("bodyPh");
    ui.form.elements.name.placeholder = tr("namePh");
  }

  // Ngăn nằm trong phần tử đang toàn màn hình, nếu không sẽ bị che mất.
  function followFullscreen() {
    var fs = document.fullscreenElement;
    var want = fs && !/^(CANVAS|VIDEO|IMG|IFRAME)$/.test(fs.tagName) ? fs : document.documentElement;
    if (host.parentNode !== want) want.appendChild(host);
  }

  // Vị trí nút: bám mép trái/phải, y theo tỉ lệ chiều cao, nhớ theo từng game.
  function readPos() {
    try {
      var all = JSON.parse(localStorage.getItem(POS_KEY) || "{}");
      return all[gameId()] || { side: "left", y: 0.38 };
    } catch (e) { return { side: "left", y: 0.38 }; }
  }
  function savePos(p) {
    try {
      var all = JSON.parse(localStorage.getItem(POS_KEY) || "{}");
      all[gameId()] = p;
      localStorage.setItem(POS_KEY, JSON.stringify(all));
    } catch (e) { /* không nhớ được thì thôi */ }
  }
  function placeCam(p) {
    cam.style.top = "calc(" + (p.y * 100).toFixed(2) + "% - 17px)";
    cam.style.left = p.side === "left" ? "max(2px, env(safe-area-inset-left))" : "auto";
    cam.style.right = p.side === "right" ? "max(2px, env(safe-area-inset-right))" : "auto";
  }

  var drag = null;
  function camPointer(e) {
    if (e.type === "pointerdown") {
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
      try { cam.setPointerCapture(e.pointerId); } catch (err) { /* không bắt được thì thôi */ }
      e.preventDefault();
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    if (e.type === "pointermove") {
      if (!drag.moved && Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 8) return;
      drag.moved = true;
      cam.classList.add("drag");
      cam.style.top = Math.max(0, Math.min(innerHeight - 34, e.clientY - 17)) + "px";
      cam.style.left = Math.max(0, Math.min(innerWidth - 34, e.clientX - 17)) + "px";
      cam.style.right = "auto";
      return;
    }
    if (e.type === "pointerup" || e.type === "pointercancel") {
      var moved = drag.moved;
      drag = null;
      cam.classList.remove("drag");
      if (moved) {
        var p = { side: e.clientX < innerWidth / 2 ? "left" : "right", y: Math.max(0.03, Math.min(0.97, e.clientY / innerHeight)) };
        placeCam(p);
        savePos(p);
      } else if (e.type === "pointerup") {
        capture();
      }
    }
  }

  function layout() {
    var side = innerWidth >= innerHeight;
    panel.className = "panel " + (side ? "side" : "sheet");
  }

  function setMsg(text, err) {
    ui.msg.textContent = text || "";
    ui.msg.className = "msg" + (err ? " err" : "");
  }

  function capture() {
    if (state.busy) return;
    mount();
    if (!host) return;
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
    state.busy = true;
    var wasOpen = state.open;
    cam.style.visibility = "hidden";
    if (!wasOpen) panel.hidden = true; // ngăn không lọt vào ảnh (html2canvas cũng bỏ qua host)
    screenshot().then(function (r) {
      if (state.shotUrl) URL.revokeObjectURL(state.shotUrl);
      state.shot = r.blob;
      state.log = r.log;
      state.shotUrl = r.blob ? URL.createObjectURL(r.blob) : null;
      openPanel();
    }, function (e) {
      state.shot = null;
      state.log = null;
      openPanel();
      setMsg(tr("shotFailed", e && e.message || e), true);
    }).then(function () { state.busy = false; });
  }

  function openPanel() {
    var gid = gameId();
    followFullscreen();
    var fs = document.fullscreenElement;
    if (fs && !fs.contains(host) && document.exitFullscreen) document.exitFullscreen();
    layout();
    applyText();
    ui.game.textContent = document.title || gid;
    ui.page.href = ROOT + "feedback.html?game=" + encodeURIComponent(gid);
    ui.wait.hidden = !!state.shotUrl;
    ui.wait.textContent = state.shotUrl ? "" : tr("shotFailed", "-");
    ui.img.hidden = !state.shotUrl;
    if (state.shotUrl) ui.img.src = state.shotUrl;
    ui.form.elements.withShot.checked = !!state.shot;
    ui.form.elements.withShot.disabled = !state.shot;
    var log = state.log;
    ui.form.elements.withLog.checked = !!log;
    ui.form.elements.withLog.disabled = !log;
    ui.sum.textContent = log ? tr("logSum", log.console.length, log.errors.length, log.perf.fps == null ? "-" : log.perf.fps) : "";
    ui.pre.hidden = true;
    q('[data-act="view"]').textContent = tr("view");
    var s = session();
    if (!ui.form.elements.name.value && s && s.kind === "member") ui.form.elements.name.value = String(s.name || "").slice(0, 40);
    if (!state.open) setMsg("");
    ui.send.disabled = false;
    panel.hidden = false;
    cam.style.visibility = "hidden";
    state.open = true;
    setTimeout(function () { try { ui.form.elements.title.focus({ preventScroll: true }); } catch (e) { /* bỏ qua */ } }, 30);
  }

  function closePanel() {
    if (!host) return;
    panel.hidden = true;
    state.open = false;
    cam.style.visibility = "";
    if (root.activeElement && root.activeElement.blur) root.activeElement.blur();
  }

  function toggleView() {
    var btn = q('[data-act="view"]');
    if (!ui.pre.hidden) { ui.pre.hidden = true; btn.textContent = tr("view"); return; }
    if (!state.log) return;
    var L = state.log;
    var head = [L.at, L.game.id + (L.game.rev ? " rev " + L.game.rev : ""), L.env.viewport + "@" + L.env.dpr,
      "fps " + L.perf.fps + (L.perf.heapUsedMB != null ? " · heap " + L.perf.heapUsedMB + " MB" : "")].join("\n");
    var errs = L.errors.map(function (e) { return "✖ " + e.m + (e.src ? " @ " + e.src : ""); }).join("\n");
    var cons = L.console.slice(-80).map(function (c) {
      return (c.t / 1000).toFixed(1) + "s " + c.l.toUpperCase() + " " + c.m + (c.n ? " ×" + c.n : "");
    }).join("\n");
    ui.pre.textContent = head + (errs ? "\n\n" + errs : "") + "\n\n" + cons + (L.state !== undefined ? "\n\nstate: " + clip(JSON.stringify(L.state), 4000) : "");
    ui.pre.hidden = false;
    btn.textContent = tr("hide");
  }

  function send() {
    if (state.sending) return;
    var f = ui.form.elements;
    var title = f.title.value.trim();
    if (title.length < 3) { setMsg(tr("short"), true); f.title.focus(); return; }
    var gid = gameId();
    var withShot = f.withShot.checked && state.shot;
    var withLog = f.withLog.checked && state.log;
    state.sending = true;
    ui.send.disabled = true;
    setMsg(tr("sending"));
    var paths = [], logPath = null, FB = null;
    core().then(function (fb) {
      FB = fb;
      if (!withShot) return null;
      var ext = state.shot.type === "image/webp" ? ".webp" : ".jpg";
      return FB.uploadShot(gid + "/" + uuid() + ext, state.shot).then(function (p) { paths.push(p); });
    }).then(function () {
      if (!withLog) return null;
      var L = state.log;
      var summary = gid + " · " + L.at.slice(0, 19).replace("T", " ");
      return FB.logPng(L, summary).then(function (blob) {
        return FB.uploadShot(gid + "/" + uuid() + ".png", blob);
      }).then(function (p) { paths.push(p); logPath = p; });
    }).then(function () {
      var L = state.log || {};
      var perfInfo = L.perf || {};
      return FB.api("POST", "hub_feedback?select=id", {
        game_id: gid,
        kind: f.kind.value,
        title: title,
        body: f.body.value.trim(),
        reporter_name: f.name.value.trim() || null,
        shots: paths,
        env: {
          ua: navigator.userAgent.slice(0, 300),
          screen: innerWidth + "x" + innerHeight + "@" + (window.devicePixelRatio || 1),
          rev: (L.game && L.game.rev) || gameRev(),
          lang: lang(),
          via: "capture",
          log: logPath,
          fps: perfInfo.fps == null ? null : perfInfo.fps,
          heapMB: perfInfo.heapUsedMB == null ? null : perfInfo.heapUsedMB,
          errors: L.errors ? L.errors.length : null
        }
      });
    }).then(function (rows) {
      var id = rows && rows[0] && rows[0].id;
      api.lastTicket = id;
      setMsg(tr("sent", id));
      f.title.value = "";
      f.body.value = "";
      setTimeout(function () { if (state.open && ui.msg.textContent === tr("sent", id)) closePanel(); }, 2500);
    }, function (err) {
      var m = err && (err.message || err.kind) || String(err);
      if (FB && err && err.kind) m = FB.errorText(err);
      setMsg(tr("failed", m), true);
      ui.send.disabled = false;
    }).then(function () { state.sending = false; });
  }

  // ---- Chặn input của game khi gõ trong ngăn + phím F9 -----------------------------------
  // Nghe ở pha capture của window và được đăng ký trước game (tệp này nạp sớm trong <head>), nên
  // stopImmediatePropagation chặn được mọi listener của game. Không preventDefault: chữ vẫn gõ được,
  // ô vẫn nhận focus, checkbox vẫn bật tắt.
  function fromUs(e) { return host && (e.target === host || (e.composedPath && e.composedPath().indexOf(host) >= 0)); }

  function onKey(e) {
    var ours = fromUs(e);
    if (e.type === "keydown" && (e.key === HOTKEY || e.code === HOTKEY) && !e.repeat) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (state.open) closePanel(); else capture();
      return;
    }
    if (e.key === HOTKEY || e.code === HOTKEY) { e.stopImmediatePropagation(); return; }
    // Esc khi ngăn đang mở thì đóng ngăn dù focus đang ở đâu: có game giành focus về canvas ngay sau khi ngăn mở
    // (farmland), Esc lúc ấy rơi vào game và ngăn không đóng.
    if (!ours && state.open && e.key === "Escape") {
      e.stopImmediatePropagation();
      if (e.type === "keydown") { e.preventDefault(); closePanel(); }
      return;
    }
    if (!ours) return;
    e.stopImmediatePropagation();
    if (e.type === "keydown" && e.key === "Escape") { e.preventDefault(); closePanel(); }
    if (e.type === "keydown" && e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); }
  }

  function actOf(e) {
    var path = e.composedPath ? e.composedPath() : [];
    for (var i = 0; i < path.length && path[i] !== host; i++) {
      if (path[i].getAttribute && path[i].getAttribute("data-act")) return path[i].getAttribute("data-act");
    }
    return null;
  }

  function onPointer(e) {
    if (!fromUs(e)) return;
    var act = actOf(e);
    if (act === "cam" && /^pointer/.test(e.type)) camPointer(e);
    else if (drag && /^pointer/.test(e.type)) camPointer(e);
    if (e.type === "click" && act) {
      if (act === "close") closePanel();
      else if (act === "send") send();
      else if (act === "view") toggleView();
      else if (act === "again") capture();
    }
    e.stopImmediatePropagation();
  }

  ["keydown", "keyup", "keypress"].forEach(function (t) { window.addEventListener(t, onKey, true); });
  ["pointerdown", "pointermove", "pointerup", "pointercancel", "mousedown", "mousemove", "mouseup", "touchstart",
    "touchmove", "touchend", "wheel", "click", "dblclick", "contextmenu"].forEach(function (t) {
    // touch/wheel để passive: listener không passive ở window bắt trình duyệt chờ JS mỗi lần chạm vào game.
    window.addEventListener(t, onPointer, /^(touch|wheel)/.test(t) ? { capture: true, passive: true } : true);
  });
  window.addEventListener("resize", function () { if (state.open) layout(); });

  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
