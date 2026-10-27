/*
 * Trang Restaurant City: kiểm tài khoản hub, cắm lớp mạng (rc-net.js), rồi dựng Ruffle chạy game.swf.
 * Game chơi online qua Edge Function rc-rpc nên bắt buộc đăng nhập bằng tài khoản thành viên của hub.
 * ?link=<slug> mở một social link (quà, lời mời) trước khi vào quán, xem rc-social.js.
 * ?rpc=<url> thay địa chỉ function, ?swf=<tên>.swf nạp bản SWF khác trong swf/ (chạy thử).
 */
(function () {
  "use strict";

  var REV = "20261027d";
  var cfg = window.SUPABASE_CONFIG || {};
  var FN = new URLSearchParams(location.search).get("rpc") ||
    (String(cfg.url || "").replace(/\/+$/, "") + "/functions/v1/rc-rpc");
  // DB của hub ở Tokyo; để Supabase tự chọn thì function chạy ở Seoul và mỗi truy vấn tốn thêm ~26 ms.
  var REGION = /supabase\.co\//.test(FN) ? "?forceFunctionRegion=ap-northeast-1" : "";
  function fnUrl(path) { return FN + (path || "") + REGION; }

  function member() {
    var s = window.HubSession && window.HubSession.get();
    return s && s.kind === "member" && s.accessToken ? s : null;
  }

  var refreshing = null;
  function refresh() {
    var s = member();
    if (!s) return Promise.resolve(null);
    if (!refreshing) {
      refreshing = window.HubAuth.refresh(s).then(function (r) {
        refreshing = null;
        if (!r.ok) return null;
        window.HubSession.set(r.session);
        return r.session.accessToken;
      });
    }
    return refreshing;
  }

  function token() {
    var s = member();
    if (!s) return Promise.resolve("");
    if (window.HubSession.isExpired()) return refresh().then(function (t) { return t || ""; });
    return Promise.resolve(s.accessToken);
  }

  function $(id) { return document.getElementById(id); }

  function showPanel(text, opts) {
    opts = opts || {};
    $("panel").classList.remove("hidden");
    $("panelText").textContent = text;
    $("loginLink").classList.toggle("hidden", !opts.login);
    $("panelErr").textContent = opts.error || "";
  }

  function me() {
    function call(t) {
      return fetch(fnUrl("/me"), { headers: { "Authorization": "Bearer " + t, "apikey": cfg.anonKey } });
    }
    return token().then(call).then(function (res) {
      if (res.status !== 401) return res;
      return refresh().then(function (t) { return t ? call(t) : res; });
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (res.status === 401) return { expired: true };
        if (!res.ok || !body.ok) throw new Error(body.error || ("HTTP " + res.status));
        return body;
      });
    });
  }

  // game.swf gọi ra trang qua ExternalInterface. Đăng tường, mời bạn, tặng quà thành social link (rc-social.js);
  // nạp tiền thật và bookmark Facebook không còn chỗ để đi, nên báo "không làm" để game tự đóng hộp thoại.
  function flashCallback(ok) {
    var player = document.querySelector("ruffle-player, ruffle-object");
    try { if (player && typeof player.sendToActionScript === "function") player.sendToActionScript([!!ok]); } catch (e) { /* game không chờ callback */ }
  }
  [
    "callBookmark", "addBookmark", "addPermission", "addPurchaseIFrame", "addPurchaseIFramePaymo",
    "addPurchaseIFrameMoneybookers", "addPurchaseIFrameSuperRewards", "addPurchaseIFrameOnebip",
    "addPurchaseIFrameTrialPayCurrency", "submitFacebookOrder"
  ].forEach(function (name) {
    window[name] = function () { setTimeout(function () { flashCallback(false); }, 0); };
  });
  window.hide = function () {};

  window.rcIsFullscreen = function () { return !!(document.fullscreenElement || document.webkitFullscreenElement); };
  window.rcExitFullscreen = function () {
    if (!window.rcIsFullscreen()) return;
    var exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (exit) Promise.resolve(exit.call(document)).catch(function () {});
  };
  window.rcToggleFullscreen = function () {
    if (window.rcIsFullscreen()) { window.rcExitFullscreen(); return; }
    var target = document.querySelector("#stage ruffle-player, #stage ruffle-object") || $("stage");
    var request = target.requestFullscreen || target.webkitRequestFullscreen;
    if (request) request.call(target, { navigationUI: "hide" });
  };

  function mount() {
    var ruffle = window.RufflePlayer.newest();
    var player = ruffle.createPlayer();
    $("stage").appendChild(player);
    var swf = new URLSearchParams(location.search).get("swf");
    var options = { url: "swf/" + (/^[\w-]+\.swf$/.test(swf || "") ? swf : "game.swf") + "?v=" + REV, allowScriptAccess: true };
    var api = typeof player.ruffle === "function" ? player.ruffle() : player;
    return Promise.resolve(api.load(options)).then(function () {
      $("panel").classList.add("hidden");
      try { player.focus(); } catch (e) { /* trình duyệt chặn focus: người chơi bấm một lần là được */ }
      window.__rcPlayer = player;
    });
  }

  function boot() {
    $("fullscreen").addEventListener("click", window.rcToggleFullscreen);
    if (!window.HubAuth || !window.HubAuth.isConfigured()) {
      showPanel("Máy chủ tài khoản của hub chưa cấu hình, nên chưa chơi online được.");
      return;
    }
    var link = window.RCSocial.pendingSlug();
    if (!member()) {
      showPanel(link ? "Có người gửi bạn một link Restaurant City. Đăng nhập tài khoản hub để nhận."
        : "Restaurant City chơi online: nhà hàng, bạn bè, thư và đổi nguyên liệu đều lưu theo tài khoản hub.", { login: true });
      return;
    }
    window.RCSocial.install({
      fnUrl: fnUrl,
      anonKey: cfg.anonKey,
      token: token,
      refresh: refresh,
      callback: flashCallback,
      refocus: function () { try { if (window.__rcPlayer) window.__rcPlayer.focus(); } catch (e) { /* bấm vào game là được */ } }
    });
    window.RCNet.install({
      fnUrl: fnUrl,
      anonKey: cfg.anonKey,
      assetBase: new URL("assets/", location.href).pathname,
      rev: REV,
      token: token,
      refresh: refresh,
      onExpired: function () { showPanel("Phiên đăng nhập đã hết hạn.", { login: true }); }
    });
    showPanel("Đang mở nhà hàng…");
    me().then(function (account) {
      if (account.expired) { showPanel("Phiên đăng nhập đã hết hạn.", { login: true }); return; }
      $("who").textContent = "Chủ quán: " + account.username;
      if (!link) return mount();
      $("panelBody").classList.add("hidden");
      $("linkCard").classList.remove("hidden");
      return window.RCSocial.claimCard(link, $("linkCard")).then(function () {
        $("linkCard").classList.add("hidden");
        $("panelBody").classList.remove("hidden");
        showPanel("Đang mở nhà hàng…");
        return mount();
      });
    }).catch(function (err) {
      showPanel("Không mở được nhà hàng.", { error: String(err && err.message || err) });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
