// Giữ bản ĐÃ GIẢI NÉN của tệp .data/.wasm trong Cache Storage: lần mở sau loader nhận tệp thô (không có dấu
// "UnityWeb Compressed Content") nên bỏ hẳn bước giải nén brotli bằng JS (~5,6 s trên Galaxy S20+, đo 2026-10-24).
// Không bao giờ giải nén trên đường tải: chỉ làm khi trang báo đã vào game được một lúc (tin nhắn "warm").
importScripts("TemplateData/brotli-decode.js");
var CACHE = "repo2d-raw-v1";
var BUILD_FILE = /\/Build\/[^/]+\.(data|wasm)\.unityweb$/;

self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf("repo2d-raw-") === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET" || !BUILD_FILE.test(new URL(e.request.url).pathname)) return;
  e.respondWith(caches.open(CACHE).then(function (c) { return c.match(e.request.url); }).then(function (hit) {
    return hit || fetch(e.request);
  }).catch(function () { return fetch(e.request); }));
});

function storeRaw(cache, url) {
  return cache.match(url).then(function (hit) {
    if (hit) return;
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error("fetch " + res.status + " " + url);
      return res.arrayBuffer();
    }).then(function (buf) {
      var t0 = Date.now(), raw = self.BrotliDecode(new Int8Array(buf));
      var type = /\.wasm\.unityweb$/.test(url) ? "application/wasm" : "application/octet-stream";
      return cache.put(url, new Response(raw, { headers: { "Content-Type": type, "Content-Length": String(raw.length) } })).then(function () {
        return { url: url, ms: Date.now() - t0, bytes: raw.length };
      });
    });
  });
}

self.addEventListener("message", function (e) {
  var d = e.data || {};
  if (d.type !== "warm" || !d.urls) return;
  e.waitUntil(caches.open(CACHE).then(function (cache) {
    return cache.keys().then(function (keys) {
      var keep = d.urls.map(function (u) { return new URL(u, self.registration.scope).href; });
      return Promise.all(keys.filter(function (k) { return keep.indexOf(k.url) < 0; }).map(function (k) { return cache.delete(k); })).then(function () {
        return keep.reduce(function (p, u) { return p.then(function () { return storeRaw(cache, u); }).then(function (r) { if (r && e.source) e.source.postMessage({ type: "warm-done", r: r }); }); }, Promise.resolve());
      });
    });
  }).catch(function (err) { if (e.source) e.source.postMessage({ type: "warm-error", error: String(err) }); }));
});
