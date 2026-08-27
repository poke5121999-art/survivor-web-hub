/*
 * Nút "Tải lại bản mới" trên hub.
 *
 * WHY nó tồn tại: GitHub Pages trả `Cache-Control: max-age=600` cho mọi file tĩnh.
 *   Nghĩa là sau khi deploy, trình duyệt vẫn chạy bản CŨ tới mười phút, và không có
 *   cách nào bấm cho nó nhanh hơn từ phía người chơi — Ctrl+F5 chỉ làm mới ĐÚNG
 *   trang đang mở, không đụng tới file của các trang khác. Người chơi mở game từ hub
 *   thì cái được nạp lại là hub, còn game vẫn là bản cũ.
 *
 * Cách làm: fetch từng file với `cache: 'reload'`. Đó không phải là "tải về rồi bỏ
 *   đi" — nó bỏ qua bản trong cache khi GỬI, và GHI ĐÈ bản mới vào cache khi nhận.
 *   Nên sau vòng này, mọi lần điều hướng sau đó đều lấy được bản mới, kể cả sang
 *   trang khác.
 *
 * Và vì trang HTML của game khai file js kèm dấu build (`game.js?v=...`), chỉ nạp
 *   lại HTML là chưa đủ khi dấu build không đổi. Nên đọc luôn HTML vừa nạp, moi ra
 *   mọi <script src> / <link href> rồi nạp lại cả chúng.
 *
 * KHÔNG ĐỘNG VÀO localStorage. Đó là chỗ để tiến độ chơi, xác đã quay, vàng, đội
 *   hình. Một nút tên "xoá cache" mà xoá luôn tiến độ là một nút bẫy người dùng.
 */
(function (root) {
  'use strict';

  var btn  = document.getElementById('hub-refresh');
  var note = document.getElementById('hub-refresh-note');
  if (!btn) return;

  var GOC = note ? note.textContent : '';
  var SONG_SONG = 6;       // số file nạp cùng lúc — đủ nhanh mà không ép trình duyệt

  function noi(s) { if (note) note.textContent = s; }

  // Trang đang mở phải nằm trong danh sách bằng ĐƯỜNG DẪN THẬT của nó.
  // WHY: mở hub bằng "/" và bằng "/index.html" là HAI ô cache khác nhau. Chỉ nạp lại
  //   "index.html" thì người vào bằng "/" vẫn nhận bản cũ.
  function danhSach() {
    var ds = [location.pathname];
    ['index.html', 'login.html',
     'css/style.css', 'css/auth.css',
     'data/games.js',
     'js/session.js', 'js/supabase-config.js', 'js/supabase-auth.js',
     'js/save-sync.js', 'js/hub-profile.js', 'js/hub.js', 'js/cache-bust.js'
    ].forEach(function (u) { ds.push(u); });
    (root.HUB_GAMES || []).forEach(function (g) { if (g && g.path) ds.push(g.path); });
    return ds;
  }

  function napLai(url) {
    return fetch(url, { cache: 'reload', credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r : null; })
      .catch(function () { return null; });   // một file hỏng không được chặn cả vòng
  }

  // Moi mọi file mà một trang HTML khai ra, quy về đường dẫn tuyệt đối.
  function fileCuaTrang(html, base) {
    var ra = [];
    var re = /(?:src|href)\s*=\s*["']([^"']+)["']/gi, m;
    while ((m = re.exec(html))) {
      var u = m[1];
      if (!u || u.charAt(0) === '#' || /^(data:|blob:|mailto:|javascript:)/i.test(u)) continue;
      try {
        var abs = new URL(u, base);
        if (abs.origin !== location.origin) continue;   // chỉ file của chính mình
        ra.push(abs.href);
      } catch (e) { /* đường dẫn hỏng thì bỏ qua */ }
    }
    return ra;
  }

  function theoTung(ds, lam) {
    var i = 0, xong = 0;
    function keTiep() {
      if (i >= ds.length) return Promise.resolve();
      var u = ds[i++];
      return lam(u).then(function () { xong++; return keTiep(); });
    }
    var chay = [];
    for (var k = 0; k < Math.min(SONG_SONG, ds.length); k++) chay.push(keTiep());
    return Promise.all(chay).then(function () { return xong; });
  }

  btn.addEventListener('click', function () {
    if (btn.disabled) return;
    btn.disabled = true;

    // Mở bằng file:// thì không có cache HTTP để dọn, và fetch() cũng bị chặn.
    if (location.protocol === 'file:') {
      noi('Đang mở bằng file:// — không có cache của máy chủ để dọn. Nạp lại trang…');
      setTimeout(function () { location.reload(); }, 600);
      return;
    }

    var ds = danhSach(), daXem = {}, hang = [];
    ds.forEach(function (u) {
      try {
        var h = new URL(u, location.href).href;
        if (!daXem[h]) { daXem[h] = 1; hang.push(h); }
      } catch (e) {}
    });

    noi('Đang nạp lại ' + hang.length + ' file…');

    // 1) Dọn Cache Storage và mọi service worker, nếu có. Hub hiện không dùng cái
    //    nào, nhưng nếu sau này có thì nút này vẫn phải đúng nghĩa.
    var don = [];
    if (root.caches && caches.keys) {
      don.push(caches.keys().then(function (ks) {
        return Promise.all(ks.map(function (k) { return caches.delete(k); }));
      }).catch(function () {}));
    }
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      don.push(navigator.serviceWorker.getRegistrations().then(function (rs) {
        return Promise.all(rs.map(function (r) { return r.unregister(); }));
      }).catch(function () {}));
    }

    Promise.all(don)
      // 2) Nạp lại từng trang, và moi ra file con của mỗi trang HTML.
      .then(function () {
        var them = [];
        return theoTung(hang, function (u) {
          return napLai(u).then(function (r) {
            if (!r) return;
            var ct = r.headers.get('content-type') || '';
            if (ct.indexOf('html') < 0) return;
            return r.text().then(function (t) {
              fileCuaTrang(t, u).forEach(function (x) {
                if (!daXem[x]) { daXem[x] = 1; them.push(x); }
              });
            }).catch(function () {});
          });
        }).then(function () { return them; });
      })
      // 3) Nạp lại đám file con vừa moi được (js, css, ảnh của từng game).
      .then(function (them) {
        if (!them.length) return 0;
        noi('Đang nạp lại thêm ' + them.length + ' file của các game…');
        return theoTung(them, napLai);
      })
      .then(function (n) {
        var tong = Object.keys(daXem).length;
        noi('Xong — đã nạp lại ' + tong + ' file. Đang khởi động lại…');
        // Trang đang mở đã có bản mới trong cache ở bước 2, nên reload() thường là đủ.
        // Vẫn gắn thêm dấu thời gian: nếu máy chủ trung gian nào đó còn giữ bản cũ
        // thì một địa chỉ chưa từng thấy là cách chắc chắn nhất để đi vòng qua nó.
        setTimeout(function () {
          var u = location.pathname + '?fresh=' + Date.now();
          location.replace(u);
        }, 500);
      })
      .catch(function (e) {
        btn.disabled = false;
        noi('Không nạp lại được (' + (e && e.message ? e.message : 'lỗi mạng') +
            '). Thử lại, hoặc tắt hẳn tab rồi mở lại. ' + GOC);
      });
  });
})(window);
