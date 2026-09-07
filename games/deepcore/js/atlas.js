/*
 * atlas.js — đọc assets/atlas.json + các trang atlas*.png.
 *
 * LUẬT: trong toàn bộ code game KHÔNG có một tên file ảnh nào, chỉ có khoá
 * kiểu 'mob.caveling.move'. Đổi art = chạy lại _tools/build_atlas.py, không
 * đụng code. Thiếu khoá thì vẽ ô hồng báo lỗi chứ không ném lỗi làm chết vòng lặp.
 */
(function (G) {
  'use strict';

  var pages = [];
  var spr = Object.create(null);
  var tileSize = 16;
  var ready = false;

  // Bộ nhớ đệm ảnh đã nhuộm trắng (dùng cho chớp trúng đòn). Vẽ silhouette
  // bằng globalCompositeOperation mỗi khung thì tốn; đệm lại theo khoá+khung.
  var flashCache = Object.create(null);
  var flashCount = 0;

  /*
   * Bản đồ atlas vào bằng THẺ <script> (assets/atlas-data.js đặt window.DC_ATLAS),
   * không phải fetch/XHR. Lý do đúng như hub đã ghi lại ở data/games.js: mở
   * trang bằng file:// thì gốc là "null", trình duyệt chặn sạch mọi lần đọc
   * file cục bộ, và trang thành màn hình đen mà chẳng báo gì. Ảnh <img> thì
   * không bị chặn, nên chỉ có bảng dữ liệu là phải đi đường này.
   */
  function load(cb, onProgress) {
    var base = 'assets/';
    var data = window.DC_ATLAS;
    if (!data || !data.sprites) {
      cb(new Error('thiếu assets/atlas-data.js — chạy lại _tools/build_atlas.py'));
      return;
    }
    spr = data.sprites;
    tileSize = data.tile || 16;
    var n = data.pages.length, done = 0, failed = false;
    pages = new Array(n);
    if (n === 0) { ready = true; cb(null); return; }
    data.pages.forEach(function (name, i) {
      var im = new Image();
      im.onload = function () {
        pages[i] = im;
        done++;
        if (onProgress) onProgress(done / n);
        if (done === n && !failed) { ready = true; cb(null); }
      };
      im.onerror = function () {
        if (!failed) { failed = true; cb(new Error('không tải được ' + name)); }
      };
      im.src = base + name + '?v=1';
    });
  }

  function get(key) { return spr[key]; }
  function has(key) { return !!spr[key]; }

  /* Số khung của một hoạt ảnh. 0 nếu không có khoá. */
  function count(key) {
    var s = spr[key];
    return s ? s.f.length : 0;
  }

  /* Kích thước một khung, trả về mảng [w,h]. */
  function size(key, i) {
    var s = spr[key];
    if (!s) return [16, 16];
    var f = s.f[((i | 0) % s.f.length + s.f.length) % s.f.length];
    return [f[2], f[3]];
  }

  /* Khoá đầu tiên có thật trong danh sách — dùng để rơi về ảnh dự phòng. */
  function pick() {
    for (var i = 0; i < arguments.length; i++) {
      if (arguments[i] && spr[arguments[i]]) return arguments[i];
    }
    return null;
  }

  function whiteVersion(key, idx) {
    var ck = key + '#' + idx;
    var c = flashCache[ck];
    if (c) return c;
    var s = spr[key];
    if (!s) return null;
    var f = s.f[idx];
    var cv = document.createElement('canvas');
    cv.width = f[2];
    cv.height = f[3];
    var g = cv.getContext('2d');
    g.drawImage(pages[s.p], f[0], f[1], f[2], f[3], 0, 0, f[2], f[3]);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = '#fff';
    g.fillRect(0, 0, f[2], f[3]);
    // Đệm có trần: quá nhiều thì xoá sạch, thà dựng lại còn hơn phình bộ nhớ.
    if (flashCount > 400) { flashCache = Object.create(null); flashCount = 0; }
    flashCache[ck] = cv;
    flashCount++;
    return cv;
  }

  /*
   * Vẽ một khung.
   *   key   khoá sprite
   *   idx   số thứ tự khung (tự cuộn vòng)
   *   x, y  vị trí trên canvas
   *   o     { ax, ay, scale, flip, alpha, white, rot }
   *         ax/ay là điểm neo trong khung, tính theo tỉ lệ 0..1.
   *         Mặc định neo ĐÁY-GIỮA (0.5, 1) vì quái đứng trên nền.
   */
  function draw(ctx, key, idx, x, y, o) {
    var s = spr[key];
    if (!s) { missing(ctx, x, y); return; }
    o = o || {};
    var n = s.f.length;
    var i = ((idx | 0) % n + n) % n;
    var f = s.f[i];
    var sc = o.scale || 1;
    var w = f[2] * sc, h = f[3] * sc;
    var ax = o.ax === undefined ? 0.5 : o.ax;
    var ay = o.ay === undefined ? 1 : o.ay;
    var dx = x - w * ax, dy = y - h * ay;
    var img = pages[s.p];
    if (!img) return;
    var sx = f[0], sy = f[1];

    var needRestore = false;
    if (o.alpha !== undefined && o.alpha < 1) {
      ctx.save(); needRestore = true; ctx.globalAlpha *= o.alpha;
    }
    if (o.flip || o.rot) {
      if (!needRestore) { ctx.save(); needRestore = true; }
      ctx.translate(x, y - h * ay + h * (o.ry === undefined ? 1 : o.ry));
      if (o.rot) ctx.rotate(o.rot);
      if (o.flip) ctx.scale(-1, 1);
      ctx.drawImage(img, sx, sy, f[2], f[3],
        -w * ax, -h * (o.ry === undefined ? 1 : o.ry), w, h);
    } else {
      ctx.drawImage(img, sx, sy, f[2], f[3], dx | 0, dy | 0, w, h);
    }
    if (needRestore) ctx.restore();

    // Chớp trúng đòn: PHỦ trắng lên chứ không THAY bằng bóng trắng. Bản trước
    // thay hẳn, và con boss bị sáu linh thú đánh liên tục thì cờ chớp không bao
    // giờ tắt — cả con hoá một khối trắng vô hình dạng suốt trận. Phủ ở
    // alpha 0,75 thì vẫn thấy rõ là "vừa ăn đòn" mà không mất hình.
    if (o.white) {
      var wimg = whiteVersion(key, i);
      if (wimg) {
        ctx.save();
        ctx.globalAlpha = (ctx.globalAlpha || 1) * (o.whiteA === undefined ? 0.75 : o.whiteA);
        if (o.flip || o.rot) {
          ctx.translate(x, y - h * ay + h * (o.ry === undefined ? 1 : o.ry));
          if (o.rot) ctx.rotate(o.rot);
          if (o.flip) ctx.scale(-1, 1);
          ctx.drawImage(wimg, 0, 0, f[2], f[3],
            -w * ax, -h * (o.ry === undefined ? 1 : o.ry), w, h);
        } else {
          ctx.drawImage(wimg, 0, 0, f[2], f[3], dx | 0, dy | 0, w, h);
        }
        ctx.restore();
      }
    }
  }

  function missing(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,0,180,.55)';
    ctx.fillRect(x - 8, y - 16, 16, 16);
    ctx.restore();
  }

  G.Atlas = {
    load: load,
    get: get,
    has: has,
    pick: pick,
    count: count,
    size: size,
    draw: draw,
    get tile() { return tileSize; },
    get ready() { return ready; },
    page: function (i) { return pages[i]; }
  };
})(window.DC = window.DC || {});
