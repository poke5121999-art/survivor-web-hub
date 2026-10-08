// Lớp vẽ: sheet thợ lặn đổi màu. Port genSheet của games/biet-doi-lan/js/mates.js, bảng màu lấy ở VS.DIVERS[id].pal
// (null = Dave gốc). Sheet gốc 2760×7320 nên chỉ gói các khung lớp vẽ dùng tới vào một lưới 16 cột (≈ 1920×840),
// sinh một lần cho mỗi thợ lặn (canvas), không tô lại mỗi khung.
(function (VS) {
  'use strict';
  var HX = window.HX, D = window.HX_ASSETS.dave;

  // Tên hoạt ảnh trong lớp vẽ → AnimationClip gốc của PlayerAnimCtrl.
  var CLIP = {
    Idle: 'Idle', Hit: 'Hit', Bigdamage: 'Bigdamage', Die: 'Die', DieIdle: 'DieIdle',
    AimIdle: 'RangeWeaponAim', AimMove: 'RangeWeaponFire_Move', Fire: 'RangeWeaponFire',
  };
  ['Side', 'SideUp', 'SideDown', 'Up', 'Down'].forEach(function (v) { CLIP['Move' + v] = 'Move' + v; CLIP['BMove' + v] = 'B_Move' + v; });
  // Shock (giật điện / choáng) không có AnimationClip gốc: dựng từ dãy khung đều D.anims.Shock.
  var SYN = {};
  (function () {
    var a = D.anims.Shock;
    if (!a) return;
    var frames = [];
    for (var i = 0; i < a.n; i++) frames.push([i / a.fps, a.row, i]);
    SYN.Shock = { length: a.n / a.fps, loop: true, frames: frames };
  })();
  function clipOf(name) { return SYN[name] || D.clips[CLIP[name] || name] || null; }
  // Khung lẻ (D.anims) của lớp tay cầm súng.
  var ARMS = ['AttackReadyArms', 'AttackReadyRightArm'];

  // Danh sách khung (hàng, cột của sheet gốc) → ô trong lưới gói.
  var PACK = (function () {
    var list = [], idx = {};
    function add(row, col) { var k = row * 1000 + col; if (idx[k] == null) { idx[k] = list.length; list.push([row, col]); } }
    Object.keys(CLIP).concat(Object.keys(SYN)).forEach(function (k) { var c = clipOf(k); if (c) c.frames.forEach(function (f) { add(f[1], f[2]); }); });
    ARMS.forEach(function (n) { var a = D.anims[n]; for (var i = 0; i < a.n; i++) add(a.row, i); });
    var cols = 16;
    return { list: list, idx: idx, cols: cols, rows: Math.ceil(list.length / cols) };
  })();

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
  function rgb2hsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (d > 1e-6) {
      if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h /= 6; if (h < 0) h += 1;
    }
    return [h, mx ? d / mx : 0, mx];
  }
  function hsv2rgb(h, s, v) {
    var i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s), r, g, b;
    switch (((i % 6) + 6) % 6) { case 0: r = v; g = t; b = p; break; case 1: r = q; g = v; b = p; break; case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break; case 4: r = t; g = p; b = v; break; default: r = v; g = p; b = q; }
    return [r * 255, g * 255, b * 255];
  }
  function shade(col, k) { return [clamp(col[0] * k, 0, 255), clamp(col[1] * k, 0, 255), clamp(col[2] * k, 0, 255)]; }

  // Phân loại điểm ảnh của Dave: da mặt, khung kính / bình / chân vịt (vàng), đồ lặn (xanh xám tối), viền.
  var K_NONE = 0, K_SKIN = 1, K_YEL = 2, K_SUIT = 3, K_GREY = 4;
  function kindOf(r, g, b, a) {
    if (a < 128) return K_NONE;
    var h = rgb2hsv(r, g, b), deg = h[0] * 360;
    if (h[2] < 0.12) return K_NONE;
    if (deg >= 8 && deg < 34 && h[1] > 0.15 && h[1] < 0.62 && h[2] > 0.72) return K_SKIN;
    if (deg >= 34 && deg < 70 && h[1] > 0.45 && h[2] > 0.4) return K_YEL;
    if (h[1] < 0.2 && h[2] >= 0.3 && h[2] < 0.75) return K_GREY;
    if (h[1] < 0.5 && h[2] < 0.62) return K_SUIT;
    return K_NONE;
  }

  // Chép các khung frames ([hàng, cột] của sheet gốc) vào lưới cols cột rồi đổi màu theo pal (null = giữ màu gốc).
  function genCells(img, pal, frames, cols) {
    var cell = D.cell, rows = Math.ceil(frames.length / cols), W = cols * cell, H = rows * cell;
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    // canvas ở bộ nhớ CPU: getImageData trên canvas GPU phải chờ GPU vẽ xong hoạt ảnh sảnh, trên SwiftShader tới 3-6 s
    var cx = cv.getContext('2d', { willReadFrequently: true });
    cx.imageSmoothingEnabled = false;
    frames.forEach(function (f, i) { cx.drawImage(img, f[1] * cell, f[0] * cell, cell, cell, (i % cols) * cell, Math.floor(i / cols) * cell, cell, cell); });
    if (!pal) return cv;
    var im = cx.getImageData(0, 0, W, H), px = im.data;
    var head = hex(pal.head || '#303038'), gear = hex(pal.gear || '#808890'), stripe = hex(pal.stripe || '#ffffff');
    var dc = pal.dc ? hex(pal.dc) : head, hue = pal.suit == null ? 200 : pal.suit;
    var kinds = new Uint8Array(cell * cell);
    function put(x, y, col, ox, oy) {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= cell || y >= cell) return;
      var o = ((oy + y) * W + ox + x) * 4;
      px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; px[o + 3] = 255;
    }
    for (var ci = 0; ci < frames.length; ci++) {
      var ox = (ci % cols) * cell, oy = Math.floor(ci / cols) * cell, n = 0, sk = [], sx = 0, sy = 0;
      for (var y = 0; y < cell; y++) for (var x = 0; x < cell; x++) {
        var o = ((oy + y) * W + ox + x) * 4, k = kindOf(px[o], px[o + 1], px[o + 2], px[o + 3]);
        kinds[y * cell + x] = k;
        if (px[o + 3] >= 128) n++;
        if (k === K_SKIN) { sk.push(x, y); sx += x; sy += y; }
      }
      if (!n) continue;
      var hasFace = sk.length >= 6, fx = 0, fy = 0;
      if (hasFace) { fx = sx / (sk.length / 2); fy = sy / (sk.length / 2); }
      var nearSkin = function (x, y, r) {
        for (var i = 0; i < sk.length; i += 2) if (Math.abs(sk[i] - x) <= r && Math.abs(sk[i + 1] - y) <= r) return true;
        return false;
      };
      for (var y2 = 0; y2 < cell; y2++) for (var x2 = 0; x2 < cell; x2++) {
        var k2 = kinds[y2 * cell + x2];
        if (k2 === K_NONE || k2 === K_SKIN) continue;
        var o2 = ((oy + y2) * W + ox + x2) * 4, hv = rgb2hsv(px[o2], px[o2 + 1], px[o2 + 2]), c = null;
        if (k2 === K_YEL) {
          // khung kính quanh mặt giữ màu vàng cho dễ nhìn; còn lại là bình và chân vịt
          if (hasFace && nearSkin(x2, y2, 2)) continue;
          c = shade(gear, hv[2] / 0.82);
        } else if (k2 === K_GREY) {
          // vạch xám ngang bình: có ít nhất 3 điểm vàng (bình) quanh nó
          var yel = 0;
          for (var dy = -1; dy <= 1; dy++) for (var dx = -2; dx <= 2; dx++) {
            var xx = x2 + dx, yy = y2 + dy;
            if (xx >= 0 && yy >= 0 && xx < cell && yy < cell && kinds[yy * cell + xx] === K_YEL) yel++;
          }
          if (yel >= 3) c = shade(stripe, 0.75 + hv[2] * 0.4);
          else if (hv[2] < 0.62) k2 = K_SUIT;   // xám tối là thân đồ lặn, xám sáng (khoá, đai) giữ nguyên
        }
        if (k2 === K_SUIT) {
          var hd = Math.hypot(x2 - fx, y2 - fy);
          if (hasFace && hd <= 5.5) c = shade(head, 0.55 + hv[2] * 1.4);   // mũ trùm đầu
          else c = hsv2rgb(hue / 360, 0.42, Math.min(1, hv[2] * 1.18));
        }
        if (c) { px[o2] = c[0]; px[o2 + 1] = c[1]; px[o2 + 2] = c[2]; }
      }
      if (!hasFace || !pal.detail) continue;
      // chi tiết trên đỉnh đầu. Mọi dãy của sheet vẽ người nằm ngang quay về +x, nên "lên" của đầu luôn là phía trên ảnh;
      // bơi ngang thì bình dưỡng khí nằm cao hơn đầu: chỉ leo cột liền mạch từ mặt lên, không tính điểm vàng của bình
      var top = Math.round(fy), topX = Math.round(fx);
      for (var x3 = Math.max(0, Math.round(fx) - 5); x3 <= Math.min(cell - 1, Math.round(fx) + 2); x3++) {
        for (var y3 = Math.round(fy); y3 >= Math.max(0, Math.round(fy) - 9); y3--) {
          var kk = kinds[y3 * cell + x3];
          if (px[((oy + y3) * W + ox + x3) * 4 + 3] < 128 || (kk === K_YEL && !nearSkin(x3, y3, 2))) break;
          if (y3 < top) { top = y3; topX = x3; }
        }
      }
      var ax = (topX + fx) / 2 - 1, ay = top, dark = shade(dc, 0.55), t, b2;
      if (pal.detail === 'bow') {
        for (var s3 = -1; s3 <= 1; s3 += 2) for (var i2 = 0; i2 < 2; i2++) for (var j2 = 0; j2 < 2; j2++) put(ax + s3 * (1 + i2), ay - j2, dc, ox, oy);
        put(ax, ay, dark, ox, oy);
      } else if (pal.detail === 'cap') {
        for (t = -4; t <= 3; t++) put(ax + t, ay + 2, dark, ox, oy);
        put(ax + 4, ay + 2, dark, ox, oy); put(ax + 5, ay + 2, dark, ox, oy);   // vành mũ chìa ra trước mặt
        put(ax, ay + 1, dc, ox, oy); put(ax + 1, ay + 1, dc, ox, oy);
      } else if (pal.detail === 'hat') {
        for (t = 0; t <= 8; t++) {
          var w = 4.5 * (1 - t / 9), cxh = ax - t * 0.35;
          for (b2 = -w; b2 <= w; b2 += 0.5) put(cxh + b2, ay - t, t === 0 ? [30, 30, 36] : shade(dc, b2 > 0 ? 1.05 : 0.8), ox, oy);
        }
        for (b2 = -7; b2 <= 7; b2 += 0.5) put(ax + b2, ay + 1, dark, ox, oy);
      } else if (pal.detail === 'chef') {
        for (var yy2 = -4; yy2 <= 4; yy2++) for (var xx2 = -4; xx2 <= 4; xx2++) if (xx2 * xx2 + yy2 * yy2 <= 17) put(ax + xx2, ay - 4 + yy2, xx2 * xx2 + yy2 * yy2 > 11 ? [200, 200, 210] : dc, ox, oy);
        for (t = -3; t <= 3; t++) put(ax + t, ay, dc, ox, oy);
      } else if (pal.detail === 'halo') {
        for (var a3 = 0; a3 < Math.PI * 2; a3 += 0.12) put(ax + Math.cos(a3) * 4.5, ay - 4 + Math.sin(a3) * 1.4, dc, ox, oy);
      }
    }
    cx.putImageData(im, 0, 0);
    return cv;
  }

  // Ảnh sheet gốc nạp riêng để đọc điểm ảnh.
  var srcImg = null, srcReady = null;
  function load() {
    if (srcReady) return srcReady;
    srcReady = new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () { srcImg = im; res(im); };
      im.onerror = function () { srcReady = null; rej(new Error('dave sheet not found: ' + D.sheet)); };
      im.src = HX.ROOT + 'art/' + D.sheet;
    });
    return srcReady;
  }

  // Một sheet đã gói của thợ lặn id: { canvas, tex, W, H, uv(row, col, vec4) }. Cần load() xong trước.
  var cache = {};
  function get(id) {
    if (cache[id]) return cache[id];
    if (!srcImg) throw new Error('dave sheet not loaded');
    var def = VS.DIVERS[id] || {}, cv = genCells(srcImg, def.pal || null, PACK.list, PACK.cols);
    var tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
    var cell = D.cell, W = cv.width, H = cv.height;
    var sh = cache[id] = {
      id: id, canvas: cv, tex: tex, W: W, H: H,
      // ô của khung (hàng, cột) sheet gốc → uvRect (u, v, du, dv) của sprite; khung không gói thì về Idle đầu
      uv: function (row, col, out) {
        var i = PACK.idx[row * 1000 + col];
        if (i == null) i = PACK.idx[D.anims.Idle.row * 1000];
        var x = i % PACK.cols, y = Math.floor(i / PACK.cols);
        return out.set(x * cell / W, 1 - (y + 1) * cell / H, cell / W, cell / H);
      },
    };
    return sh;
  }
  function dispose(id) {
    var sh = cache[id];
    if (!sh) return;
    sh.tex.dispose();
    sh.canvas.width = sh.canvas.height = 0;
    delete cache[id];
  }
  function disposeAll() { Object.keys(cache).forEach(dispose); }

  // Chân dung cho sảnh: khung Idle đầu tiên đã đổi màu, cắt sát hình, phóng điểm ảnh vừa ô px × px.
  var portraits = {};
  function portrait(id, px) {
    px = px || 96;
    return load().then(function (img) {
      var key = id + '@' + px;
      if (portraits[key]) return portraits[key];
      var def = VS.DIVERS[id] || {}, src = genCells(img, def.pal || null, [[D.anims.Idle.row, 0]], 1);
      var cx = src.getContext('2d'), d = cx.getImageData(0, 0, src.width, src.height).data;
      var x0 = src.width, y0 = src.height, x1 = -1, y1 = -1;
      for (var y = 0; y < src.height; y++) for (var x = 0; x < src.width; x++) {
        if (d[(y * src.width + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      var out = document.createElement('canvas'); out.width = out.height = px;
      if (x1 >= x0) {
        // phóng nguyên lần khi được ≥ 2 (điểm ảnh đều), nhỏ hơn thì phóng lẻ cho vừa ô
        var w = x1 - x0 + 1, h = y1 - y0 + 1, k = px * 0.92 / Math.max(w, h);
        if (k >= 2) k = Math.floor(k);
        var o = out.getContext('2d');
        o.imageSmoothingEnabled = false;
        o.drawImage(src, x0, y0, w, h, Math.round((px - w * k) / 2), Math.round((px - h * k) / 2), Math.round(w * k), Math.round(h * k));
      }
      portraits[key] = out;
      return out;
    });
  }

  VS.diverSheet = { load: load, get: get, dispose: dispose, disposeAll: disposeAll, portrait: portrait, clipOf: clipOf, CLIP: CLIP, PACK: PACK };
})(window.VS = window.VS || {});
