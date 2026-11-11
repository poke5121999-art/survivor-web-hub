/* Chợ Phiên đã chuyển sang https://poke5121999-art.github.io/hub-games/games/bazaar/ (2026-11-10).
   Worker cũ đăng ký ở đường này nhận bản này ở lần kiểm cập nhật kế: xoá các mục cache của đường cũ
   (cache "cho-phien" dùng chung tên với worker ở chỗ mới nên chỉ xoá URL dưới scope cũ) rồi tự gỡ. */
'use strict';
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  var scope = self.registration.scope;
  e.waitUntil(caches.open('cho-phien').then(function (c) {
    return c.keys().then(function (reqs) {
      return Promise.all(reqs.map(function (r) { return r.url.indexOf(scope) === 0 ? c.delete(r) : null; }));
    });
  }).catch(function () {}).then(function () { return self.registration.unregister(); }));
});
