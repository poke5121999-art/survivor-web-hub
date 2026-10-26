/*
 * Lớp mạng của Restaurant City trên hub.
 *
 * game.swf (qua Ruffle) gọi window.fetch cho mọi thứ nó tải: SWF asset, tệp .bin và RPC nhị phân của
 * PlayFish. Ruffle tra window.fetch lúc gọi (`e.fetch(_)` trong core.ruffle.*.js), nên bọc fetch ở đây
 * là bắt được hết mà không cần Service Worker:
 *   - .../g/rpc/..., /g/billing/..., /g/fbfeed/...  → POST thân y nguyên sang Edge Function rc-rpc,
 *     kèm access token của tài khoản hub. 401 thì làm mới token một lần rồi gửi lại.
 *   - /__api/profile-image/<uid>/<loại>.png (ảnh chân dung người chơi) → rc-rpc/profile-image/...
 *   - tệp asset (gọi theo tên ở gốc tên miền, vd /game_asset.swf) → ./assets/<tên>.
 * Mọi request khác đi qua như cũ.
 */
(function () {
  "use strict";

  var RPC_PATH = /\/g\/(?:rpc|billing|fbfeed)\//;
  var ASSETS = [
    "game_asset.swf", "avatar_asset.swf", "indoor_asset.swf", "ingredient_asset.swf", "outdoor_asset.swf",
    "perk_asset.swf", "sound_asset.swf", "preloader_asset.swf", "preloader.swf",
    "ingredient.bin", "model.bin", "perk.bin", "quiz.bin", "recipe.bin", "challenge.bin", "lang_en.bin",
    "lang_fr.bin", "avatar.bin", "front.bin", "restaurant.bin", "appointment.bin",
    "newsletter.xml", "resconfig.xml", "news0.png", "news1.png", "news2.png"
  ];

  function basename(pathname) {
    var i = pathname.lastIndexOf("/");
    return decodeURIComponent(pathname.slice(i + 1)).toLowerCase();
  }

  // opts: { fnUrl(path), anonKey, assetBase, rev, token(): Promise<string>, refresh(): Promise<string|null>, onExpired() }
  function install(opts) {
    var realFetch = window.fetch.bind(window);
    var known = {};
    ASSETS.forEach(function (n) { known[n] = true; });

    function rpc(body) {
      function send(token) {
        return realFetch(opts.fnUrl(""), {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + token,
            "apikey": opts.anonKey,
            "Content-Type": "application/octet-stream"
          },
          body: body
        });
      }
      return opts.token().then(send).then(function (res) {
        if (res.status !== 401) return res;
        return opts.refresh().then(function (token) {
          if (!token) { opts.onExpired(); return res; }
          return send(token);
        });
      }).then(function (res) {
        return res.arrayBuffer().then(function (buf) {
          return new Response(buf, {
            status: res.ok ? 200 : res.status,
            headers: { "Content-Type": "application/octet-stream" }
          });
        });
      });
    }

    window.fetch = function (input, init) {
      var isRequest = typeof Request !== "undefined" && input instanceof Request;
      var url;
      try { url = new URL(isRequest ? input.url : String(input), location.href); } catch (e) { return realFetch(input, init); }
      var sameHost = url.origin === location.origin || /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(url.host);
      if (!sameHost) return realFetch(input, init);

      if (RPC_PATH.test(url.pathname)) {
        var bodyPromise = isRequest ? input.arrayBuffer() : Promise.resolve(init && init.body);
        return bodyPromise.then(function (body) {
          if (body && !(body instanceof ArrayBuffer) && !(body instanceof Uint8Array) && typeof body !== "string") {
            return new Response(body).arrayBuffer().then(rpc);
          }
          return rpc(body);
        });
      }

      var portrait = url.pathname.match(/\/__api\/profile-image\/(.+)$/);
      if (portrait) return realFetch(opts.fnUrl("/profile-image/" + portrait[1]));

      var name = basename(url.pathname);
      if (known[name] && url.pathname.indexOf(opts.assetBase) === -1) {
        return realFetch(opts.assetBase + name + "?v=" + opts.rev, isRequest ? undefined : init);
      }
      return realFetch(input, init);
    };
  }

  window.RCNet = { install: install, ASSETS: ASSETS };
})();
