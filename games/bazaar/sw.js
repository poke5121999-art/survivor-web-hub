/* Chợ Phiên — service worker giữ tài nguyên đã tải trên máy (chủ dự án 2026-10-23: "down xong có cache lại không").
   GitHub Pages chỉ cho trình duyệt giữ 10 phút (Cache-Control: max-age=600); sau đó ~560 tệp của màn tải mỗi tệp một lượt hỏi lại.
   Luật:
   - URL có ?v=<rev> (script, ảnh art và ảnh JS gắn đều qua BZ_REV): lấy từ cache trước, chưa có mới tải rồi cất. Nội dung đổi thì
     rev đổi, URL đổi, nên không bao giờ trả nhầm bản cũ.
   - Tệp cùng nguồn không gắn ?v= (tiếng trong data/audio.js, ảnh trong url() của CSS): trả bản đã cất ngay, đồng thời tải lại ngầm để
     lần sau có bản mới nhất.
   - Điều hướng (index.html): mạng trước để luôn nhận rev mới; mất mạng thì trả bản đã cất.
   - Đăng ký bằng sw.js?v=<rev> (index.html): lên bản mới thì worker mới kích hoạt và xoá mọi mục có ?v= khác rev mới.
   Chỉ cất phản hồi 200 cùng nguồn hoặc CORS, không cất 206 (tiếng tải từng đoạn) hay phản hồi opaque. */
'use strict';
var REV = new URL(self.location.href).searchParams.get('v') || '0';
var CACHE = 'cho-phien';

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.keys().then(function (reqs) {
      return Promise.all(reqs.map(function (r) {
        var v = new URL(r.url).searchParams.get('v');
        return v && v !== REV ? c.delete(r) : null;
      }));
    });
  }).then(function () { return self.clients.claim(); }));
});

function keep(res) { return res && res.status === 200 && (res.type === 'basic' || res.type === 'cors'); }

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  var url = new URL(req.url);
  if (!/^https?:$/.test(url.protocol)) return;
  if (url.searchParams.has('v')) {
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) { if (keep(res)) c.put(req, res.clone()); return res; });
      });
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(function (res) {
      if (keep(res)) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    }, function () { return caches.open(CACHE).then(function (c) { return c.match(req, { ignoreSearch: true }); }); }));
    return;
  }
  e.respondWith(caches.open(CACHE).then(function (c) {
    return c.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) { if (keep(res)) c.put(req, res.clone()); return res; });
      if (hit) { e.waitUntil(net.catch(function () {})); return hit; }
      return net;
    });
  }));
});
