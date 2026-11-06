// Ghép lại tệp <tên>.data.unityweb mà hub.sh đã chia thành <tên>.data.unityweb.part0..N-1.
// WHY: GitHub từ chối mọi tệp > 100 MiB (GH001); bản 2f27378e có .data 106,9 MB nên không đẩy lên hub được (2026-11-06).
//
// Chạy ở HAI nơi, cùng một tệp: trang game (<script src>) và service worker (importScripts). Trước khi nạp tệp này,
// nơi gọi đặt   self.__repoParts = { "<tên>.data.unityweb": { n: <số phần>, size: <tổng byte> } }
// rồi tệp này bọc fetch: một yêu cầu GET tới đúng tên ấy (đường nào, ?query nào cũng được) được trả bằng một Response
// ghép từ các phần — tải SONG SONG, nhả byte ĐÚNG THỨ TỰ (phần 0 nhả ngay khi tới, phần sau nhả khi phần trước xong),
// Content-Length = tổng byte. Loader Unity không biết gì: dataUrl giữ nguyên, nó vẫn đọc luồng có tiến độ, vẫn thấy dấu
// "UnityWeb Compressed Content (brotli)" ở đầu phần 0 rồi tự giải nén (GitHub Pages không gửi Content-Encoding).
// Không có self.__repoParts (bản nhỏ, không chia) thì tệp này không làm gì.
//
// Trang: service worker đang giữ bản ĐÃ GIẢI NÉN của chính URL ấy (sw.js, "warm") thì để fetch gốc đi qua service
// worker; chưa có thì trang tự ghép, kể cả khi service worker đang chạy là bản cũ không biết chia phần.
// Bộ nhớ đệm IndexedDB của Unity (khi chưa có service worker): Response ghép mang ETag riêng; lượt kiểm lại
// (If-None-Match đúng ETag ấy) được trả 304 ngay, vì tên tệp mang băm nội dung nên nội dung không bao giờ đổi.
(function (g) {
  var parts = g.__repoParts;
  if (!parts || g.__repoPartsWrapped || typeof g.fetch !== "function") return;
  g.__repoPartsWrapped = true;
  var orig = g.fetch.bind(g);
  var isPage = typeof document !== "undefined";

  function find(input) {
    var u = typeof input === "string" ? input : (input && input.url);
    if (!u) return null;
    var url;
    try { url = new URL(u, isPage ? document.baseURI : g.location.href); } catch (e) { return null; }
    var name = url.pathname.slice(url.pathname.lastIndexOf("/") + 1);
    var p = Object.prototype.hasOwnProperty.call(parts, name) ? parts[name] : null;
    return p ? { url: url, name: name, n: p.n, size: p.size } : null;
  }
  function header(input, init, k) {
    var h = init && init.headers;
    if (h) {
      if (typeof h.get === "function") return h.get(k);
      if (Array.isArray(h)) { for (var i = 0; i < h.length; i++) if (String(h[i][0]).toLowerCase() === k.toLowerCase()) return h[i][1]; return null; }
      for (var key in h) if (key.toLowerCase() === k.toLowerCase()) return h[key];
      return null;
    }
    return input && typeof input !== "string" && input.headers ? input.headers.get(k) : null;
  }
  function etag(f) { return '"parts-' + f.name + "-" + f.size + '"'; }

  function joined(f) {
    var urls = [];
    for (var i = 0; i < f.n; i++) { var x = new URL(f.url.href); x.pathname += ".part" + i; urls.push(x.href); }
    return Promise.all(urls.map(function (x) {
      return orig(x).then(function (r) {
        if (!r.ok || !r.body) throw new TypeError("data part " + r.status + " " + x);
        return r;
      });
    })).then(function (rs) {
      var q = rs.map(function () { return []; }), done = rs.map(function () { return false; });
      var k = 0, sent = 0, over = false, ctl;
      function fail(e) { if (!over) { over = true; ctl.error(e); } }
      function flush() {
        if (over) return;
        while (k < rs.length) {
          while (q[k].length) { var c = q[k].shift(); sent += c.byteLength; ctl.enqueue(c); }
          if (!done[k]) return;
          k++;
        }
        if (sent !== f.size) return fail(new TypeError("data parts " + f.name + ": " + sent + " of " + f.size + " bytes"));
        over = true; ctl.close();
      }
      var body = new ReadableStream({ start: function (c) {
        ctl = c;
        rs.forEach(function (r, i) {
          var rd = r.body.getReader();
          (function pump() {
            rd.read().then(function (x) {
              if (x.done) done[i] = true; else q[i].push(x.value);
              flush();
              if (!x.done && !over) pump();
            }, fail);
          })();
        });
      } });
      return new Response(body, { status: 200, headers: {
        "Content-Type": "application/octet-stream", "Content-Length": String(f.size), "ETag": etag(f) } });
    });
  }

  g.fetch = function (input, init) {
    var f = find(input);
    var method = String((init && init.method) || (input && typeof input !== "string" && input.method) || "GET").toUpperCase();
    if (!f || method !== "GET") return orig(input, init);
    if (header(input, init, "If-None-Match") === etag(f)) return Promise.resolve(new Response(null, { status: 304, headers: { ETag: etag(f) } }));
    var sw = isPage && g.caches && g.navigator && g.navigator.serviceWorker && g.navigator.serviceWorker.controller;
    var hit = sw ? g.caches.match(f.url.href).catch(function () { return null; }) : Promise.resolve(null);
    return hit.then(function (h) { return h ? orig(input, init) : joined(f); });
  };
})(self);
