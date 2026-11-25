/*
 * Đăng nhập GameSpark như MỘT NGƯỜI CHƠI và gọi event, cho trang design khi trỏ vào môi trường hub không giữ khoá quản trị (LIVE).
 * Chỉ dùng khoá client (apiKey/apiSecret có trong mọi bản build), không bao giờ khoá server.
 *
 * Đăng nhập bằng thiết bị cố định của trình duyệt: deviceId (GUID) + deviceSecret lưu ở localStorage theo từng môi trường, đúng như
 * SDK Unity giữ trên WebGL. Gateway xoay deviceSecret mỗi lần AUTH_DEVICE, nên mã giữ phiên (accessToken, hạn) và chỉ đăng nhập
 * lại khi phiên hết hạn hay bị từ chối. Mất localStorage = một người chơi mới (playerId mới, phải thêm lại vào danh sách designer).
 * Chép deviceId sang máy khác KHÔNG chạy được (bí mật đã xoay): dùng một deviceId mỗi trình duyệt.
 *
 *   const p = GsPlayer.create({ base, project, apiKey, apiSecret, scope: "live" }, localStorage);
 *   await p.login();                         // { playerId }
 *   const r = await p.ev("LIVE_CONFIG_GET", { table: "*" });   // câu trả lời của gateway; r.ok === false → r.error { code, message }
 *
 * Chạy được cả trong Node 18+ (fetch + crypto.subtle) để smoke dùng đúng mã của trang.
 */
(function (root) {
  "use strict";

  var enc = new TextEncoder();
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
  function b64(buf) { var s = ""; new Uint8Array(buf).forEach(function (b) { s += String.fromCharCode(b); }); return btoa(s); }
  function subtle() { return (root.crypto || globalThis.crypto).subtle; }
  function rand(n) { var a = new Uint8Array(n); (root.crypto || globalThis.crypto).getRandomValues(a); return hex(a); }
  function guid() { var h = rand(16); return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20); }

  function create(cfg, store) {
    var path = "/rpc/" + cfg.project;
    var key = "hub.gsplayer." + cfg.project + "." + (cfg.scope || "live");
    var nextId = 1;
    function load() { try { return JSON.parse(store.getItem(key) || "{}") || {}; } catch (e) { return {}; } }
    function save(s) { try { store.setItem(key, JSON.stringify(s)); } catch (e) { /* phiên chỉ sống trong trang */ } }
    var st = load();
    if (!st.deviceId) { st.deviceId = "hub-design-" + guid(); save(st); }

    function post(type, body, token) {
      var text = JSON.stringify(Object.assign({ "@t": type, "@id": nextId++ }, body || {}));
      var headers = { "content-type": "application/json", "X-GS-Proto": "1" };
      var pre;
      if (token) { headers.Authorization = "Bearer " + token; pre = Promise.resolve(); }
      else {
        var ts = String(Math.floor(Date.now() / 1000)), nonce = rand(12);
        pre = subtle().digest("SHA-256", enc.encode(text)).then(function (d) {
          return subtle().importKey("raw", enc.encode(cfg.apiSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]).then(function (k) {
            return subtle().sign("HMAC", k, enc.encode(path + "\n" + ts + "\n" + nonce + "\n" + hex(d)));
          });
        }).then(function (sig) {
          headers["X-GS-Key"] = cfg.apiKey; headers["X-GS-Ts"] = ts; headers["X-GS-Nonce"] = nonce; headers["X-GS-Sign"] = b64(sig);
        });
      }
      return pre.then(function () {
        return fetch(cfg.base + path, { method: "POST", headers: headers, body: text });
      }).then(function (res) {
        return res.json().catch(function () { return { ok: false, error: { code: "HTTP_" + res.status, message: "GameSpark trả HTTP " + res.status } }; });
      }, function (e) {
        return { ok: false, error: { code: "NETWORK", message: "Không gọi được GameSpark: " + e.message } };
      });
    }

    function login(force) {
      if (!force && st.token && st.expiresAt && st.expiresAt * 1000 > Date.now() + 60000) return Promise.resolve({ ok: true, playerId: st.playerId });
      return post("AUTH_DEVICE", { deviceId: st.deviceId, deviceSecret: st.deviceSecret || "" }).then(function (r) {
        if (!r || r.ok === false || !r.accessToken) return { ok: false, error: (r && r.error) || { code: "AUTH", message: "đăng nhập hỏng" } };
        // Giữ bí mật mới TRƯỚC mọi thứ khác: gateway đã chuyển sang nó.
        if (r.deviceSecret) st.deviceSecret = r.deviceSecret;
        st.token = r.accessToken; st.expiresAt = r.expiresAt || 0; st.playerId = r.playerId; st.displayName = r.displayName || "";
        save(st);
        return { ok: true, playerId: r.playerId };
      });
    }

    function ev(type, body) {
      return login(false).then(function (l) {
        if (!l.ok) return { ok: false, error: l.error };
        return post(type, body, st.token).then(function (r) {
          if (r && r.ok === false && r.error && r.error.code === "UNAUTHENTICATED") {
            return login(true).then(function (l2) { return l2.ok ? post(type, body, st.token) : { ok: false, error: l2.error }; });
          }
          return r;
        });
      });
    }

    return {
      login: login, ev: ev,
      get playerId() { return st.playerId || ""; },
      get deviceId() { return st.deviceId; },
      forget: function () { st = { deviceId: "hub-design-" + guid() }; save(st); },
    };
  }

  var api = { create: create };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.GsPlayer = api;
})(typeof window !== "undefined" ? window : globalThis);
