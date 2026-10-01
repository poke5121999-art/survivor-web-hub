// Đồng đội lặn cùng (bot của biệt đội, như bot REPO): mỗi người là một Dave đổi màu đồ lặn theo crew, đứng trên boong cùng Dave,
// nhảy xuống sau Dave rồi làm việc theo chiến thuật (bảng JOBS, mỗi chiến thuật một máy trạng thái nhỏ).
// Khuân đồ dùng dây riêng của bot (không phải BDL.tether của Dave) với cùng lò xo / va đập của đồ cổ.
window.BDL = window.BDL || {};
(function (BDL) {
  'use strict';
  // run.js chỉ áp crewMul của REPO cho chỉ tiêu khi bot thật sự lặn và khuân đồ
  BDL.MATES_DIVE = true;

  var HX = window.HX, T = window.HX_TUNING, D = window.HX_ASSETS.dave;
  var SURF = T.water.surfaceY;
  var params = new URLSearchParams(location.search);
  // ?mates=loot,baoke,san,cuuho: trang thử (?map=N, không qua sảnh) có bot
  var DEV_TACTICS = params.has('mates') ? params.get('mates').split(',').map(function (s) { return s.trim(); }).filter(Boolean) : null;

  var S2 = D.scale || 1, CW = D.cell / D.ppu * S2;     // ô 120 px, ×2 như PlayerGroup gốc = 2,4 m
  var R = 0.25;                     // bán kính va chạm như Dave (T.diver.radius)
  var M_MATE = 80;                  // kg chịu lực dây, như Dave trong tether.js
  var REST = 1.8;                   // [ĐỀ XUẤT] dây của bot ngắn hơn dây Dave một chút
  var N_PER_STR = 7, SPEED_FLOOR = 0.35;   // cùng số của tether.js (REPO str → N, sàn tốc 35%)
  var ANCHOR_REACH = 2.2;           // tới gần đồ cổ chừng này là buộc dây
  var HEAL_O2 = 20, HEAL_CD = 25;   // Cứu hộ: +20 O₂, hồi 25 s
  var CD_CUT = 0.15;                // Tiếp tế: giảm 15% hồi chiêu của Dave mỗi lần tung
  var NAV = 1.0;                    // ô lưới tìm đường (m)

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
  function lerpAngle(a, b, k) { var d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI; return a + d * k; }
  function C() { return BDL.content; }

  // =====================================================================================================
  // HÌNH: sheet Dave đổi màu theo crew, sinh một lần (canvas), không tô mỗi khung
  // =====================================================================================================
  // Màu lấy từ chân dung REPO của crew (games/repo2d/art/crew/<id>.png): head = tóc / mũ, gear = bình + chân vịt,
  // stripe = vạch trên bình, detail = chi tiết trên đầu (nơ, mũ, vầng sáng) bám theo hướng đầu của từng khung.
  var PAL = {
    bao:   { head: '#2b2b33', gear: '#d23a3a', stripe: '#f2f2f2', detail: 'bow', dc: '#d8283c' },
    hue:   { head: '#2a2a30', gear: '#2e4482', stripe: '#e8e8e8' },
    tam:   { head: '#2c3c6c', gear: '#2c3c6c', stripe: '#e0c050', detail: 'cap', dc: '#e0c050' },
    ky:    { head: '#f2b434', gear: '#d0283c', stripe: '#f2b434', detail: 'bow', dc: '#d8283c' },
    linh:  { head: '#7a5a3e', gear: '#b89a76', stripe: '#3a2a20', detail: 'cap', dc: '#4a3424' },
    dung:  { head: '#ececf4', gear: '#9aa0b0', stripe: '#ffffff' },
    mai:   { head: '#2b2b33', gear: '#4e7a3a', stripe: '#7a5030', detail: 'bow', dc: '#d8283c' },
    phuc:  { head: '#d0302a', gear: '#d0302a', stripe: '#f0c838', detail: 'cap', dc: '#f0c838' },
    son:   { head: '#f8f8f8', gear: '#f4f4f4', stripe: '#2a2a2a', detail: 'chef', dc: '#ffffff' },
    nga:   { head: '#c42a3c', gear: '#c42a3c', stripe: '#ffffff' },
    khoi:  { head: '#5c3c8c', gear: '#5c3c8c', stripe: '#1e1e24', detail: 'hat', dc: '#5c3c8c' },
    van:   { head: '#9050a8', gear: '#c0a0d8', stripe: '#ffffff' },
    hai:   { head: '#24242a', gear: '#b0b8c8', stripe: '#d03030' },
    tuyet: { head: '#f4b83a', gear: '#f6f6f6', stripe: '#f0d060', detail: 'halo', dc: '#f8e070' },
  };

  // Clip gốc bot dùng (tên trong game → AnimationClip của PlayerAnimCtrl, như dave.js)
  var CLIP = { Idle: 'Idle', Hit: 'Hit', Diving: 'Diving', Die: 'Die', DieIdle: 'DieIdle', Melee: 'MeleeOneHandHorizontal' };
  ['Side', 'SideUp', 'SideDown', 'Up', 'Down'].forEach(function (v) { CLIP['Move' + v] = 'Move' + v; CLIP['BMove' + v] = 'B_Move' + v; });
  function clipOf(n) { return D.clips && D.clips[CLIP[n] || n] || null; }

  // Các hàng của sheet gốc mà bot dùng → sheet gọn (một hàng 120 px mỗi dãy)
  var USED = (function () {
    var rows = {}, maxCol = 0;
    Object.keys(CLIP).forEach(function (k) {
      var c = clipOf(k);
      if (c) c.frames.forEach(function (f) { rows[f[1]] = 1; maxCol = Math.max(maxCol, f[2]); });
    });
    ['Idle', 'MeleeDaggerAtk'].forEach(function (k) { var a = D.anims[k]; if (a) { rows[a.row] = 1; maxCol = Math.max(maxCol, a.n - 1); } });
    var list = Object.keys(rows).map(Number).sort(function (a, b) { return a - b; }), map = {};
    list.forEach(function (r, i) { map[r] = i; });
    return { rows: list, map: map, cols: maxCol + 1 };
  })();

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

  // Sinh sheet đổi màu cho một crew từ ảnh sheet gốc. Trả canvas (USED.cols × 120, USED.rows × 120).
  function genSheet(img, id, hue) {
    var P = PAL[id] || { head: '#303038', gear: '#808890', stripe: '#ffffff' };
    var cell = D.cell, W = USED.cols * cell, H = USED.rows.length * cell;
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var cx = cv.getContext('2d');
    cx.imageSmoothingEnabled = false;
    USED.rows.forEach(function (r, i) { cx.drawImage(img, 0, r * cell, W, cell, 0, i * cell, W, cell); });
    var im = cx.getImageData(0, 0, W, H), px = im.data;
    var head = hex(P.head), gear = hex(P.gear), stripe = hex(P.stripe), dc = P.dc ? hex(P.dc) : head;
    var kinds = new Uint8Array(cell * cell);
    function put(x, y, col, ox, oy) {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= cell || y >= cell) return;
      var o = ((oy + y) * W + ox + x) * 4;
      px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; px[o + 3] = 255;
    }
    for (var ry = 0; ry < USED.rows.length; ry++) for (var rx = 0; rx < USED.cols; rx++) {
      var ox = rx * cell, oy = ry * cell, n = 0, sk = [], sx = 0, sy = 0;
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
          var hx = x2 - fx, hy = y2 - fy, hd = Math.hypot(hx, hy);
          if (hasFace && hd <= 5.5) c = shade(head, 0.55 + hv[2] * 1.4);   // mũ trùm đầu = tóc / mũ của crew
          else c = hsv2rgb(hue / 360, 0.42, Math.min(1, hv[2] * 1.18));
        }
        if (c) { px[o2] = c[0]; px[o2 + 1] = c[1]; px[o2 + 2] = c[2]; }
      }
      if (!hasFace || !P.detail) continue;
      // chi tiết trên đỉnh đầu. Mọi dãy của sheet vẽ người nằm ngang quay về +x (trong game mới xoay theo hướng bơi),
      // nên "lên" của đầu luôn là phía trên ảnh; đỉnh đầu = điểm cao nhất quanh mặt, lùi về sau mặt một chút.
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
      if (P.detail === 'bow') {
        for (var s3 = -1; s3 <= 1; s3 += 2) for (var i2 = 0; i2 < 2; i2++) for (var j2 = 0; j2 < 2; j2++) put(ax + s3 * (1 + i2), ay - j2, dc, ox, oy);
        put(ax, ay, dark, ox, oy);
      } else if (P.detail === 'cap') {
        for (t = -4; t <= 3; t++) put(ax + t, ay + 2, dark, ox, oy);
        put(ax + 4, ay + 2, dark, ox, oy); put(ax + 5, ay + 2, dark, ox, oy);   // vành mũ chìa ra trước mặt
        put(ax, ay + 1, dc, ox, oy); put(ax + 1, ay + 1, dc, ox, oy);
      } else if (P.detail === 'hat') {
        for (t = 0; t <= 8; t++) {
          var w = 4.5 * (1 - t / 9), cxh = ax - t * 0.35;
          for (b2 = -w; b2 <= w; b2 += 0.5) put(cxh + b2, ay - t, t === 0 ? [30, 30, 36] : shade(dc, b2 > 0 ? 1.05 : 0.8), ox, oy);
        }
        for (b2 = -7; b2 <= 7; b2 += 0.5) put(ax + b2, ay + 1, dark, ox, oy);
      } else if (P.detail === 'chef') {
        for (var yy2 = -4; yy2 <= 4; yy2++) for (var xx2 = -4; xx2 <= 4; xx2++) if (xx2 * xx2 + yy2 * yy2 <= 17) put(ax + xx2, ay - 4 + yy2, xx2 * xx2 + yy2 * yy2 > 11 ? [200, 200, 210] : dc, ox, oy);
        for (t = -3; t <= 3; t++) put(ax + t, ay, dc, ox, oy);
      } else if (P.detail === 'halo') {
        for (var a3 = 0; a3 < Math.PI * 2; a3 += 0.12) put(ax + Math.cos(a3) * 4.5, ay - 4 + Math.sin(a3) * 1.4, dc, ox, oy);
      }
    }
    cx.putImageData(im, 0, 0);
    return cv;
  }

  // Ảnh sheet gốc nạp riêng (cùng tệp main.js đã nạp, trình duyệt lấy từ bộ đệm) để đọc điểm ảnh.
  var srcImg = null, srcReady = null;
  function sourceImage() {
    if (srcReady) return srcReady;
    srcReady = new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () { srcImg = im; res(im); };
      im.onerror = function () { rej(new Error('không nạp được sheet Dave ' + D.sheet)); };
      im.src = HX.ROOT + 'art/' + D.sheet;
    });
    return srcReady;
  }
  var sheetCache = {};   // crew id → { canvas, tex }
  function crewSheet(id, hue) {
    if (sheetCache[id]) return sheetCache[id];
    var cv = genSheet(srcImg, id, hue), tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
    return (sheetCache[id] = { canvas: cv, tex: tex, W: cv.width, H: cv.height, gen: true });
  }

  // =====================================================================================================
  // TRẠNG THÁI CHUNG
  // =====================================================================================================
  var G = null, S = null;
  function lastY1() { return G.floors[G.floors.length - 1].y1; }
  function dave() { return G.diver; }
  function daveInWater() { var d = G.diver; return !!d && !(G.deck && G.deck.on) && d.state !== 'dead' && d.state !== 'surfaced'; }

  // ---------- thuyền: đọc số đo của hệ thuyền (ship.js dựng sau hệ này) ----------
  function boat() {
    var sh = window.BDL_DEBUG && window.BDL_DEBUG.ship, Mz = sh && sh.measure;
    if (Mz && G.deck) {
      try {
        var a = Mz.world(Mz.HULL.x0, Mz.HULL.bottom), b = Mz.world(Mz.HULL.x1, 0);
        return { x0: a.x, x1: b.x, bot: a.y, x: (a.x + b.x) / 2, M: Mz };
      } catch (e) { /* thuyền đang dỡ */ }
    }
    var st = G.stack.layers[0].zone.start, x = st ? st[0] : 0;
    return { x0: x - 6, x1: x + 6, bot: SURF - 1, x: x, M: null };
  }
  function nearHull(x, y) {
    var B = boat(), dx = Math.max(B.x0 - x, 0, x - B.x1), dy = Math.max(B.bot - y, 0, y - (SURF + 0.8));
    return Math.hypot(dx, dy) <= 3;
  }
  // chỗ bơi tới để giao đồ: dưới đuôi thuyền (phía +x, nơi Dave leo lên)
  function dropPoint() { var B = boat(); return { x: B.x1 - 2.5, y: SURF - 2.2 }; }

  // =====================================================================================================
  // TÌM ĐƯỜNG: lưới ô nước 1 m, tính dần khi cần; A* 8 hướng, rồi kéo thẳng bằng tia có bề rộng
  // =====================================================================================================
  function navBuild() {
    var x0 = -T.view.boundX - 3, x1 = T.view.boundX + 3, y0 = lastY1() + 0.4, y1 = SURF - 0.6;
    var nx = Math.ceil((x1 - x0) / NAV), ny = Math.ceil((y1 - y0) / NAV);
    S.nav = { x0: x0, y0: y0, nx: nx, ny: ny, st: new Uint8Array(nx * ny), budget: 0, calls: 0 };
  }
  function cellOpen(i, j) {
    var N = S.nav;
    if (i < 0 || j < 0 || i >= N.nx || j >= N.ny) return false;
    var k = j * N.nx + i;
    if (!N.st[k]) N.st[k] = G.world.open(N.x0 + (i + 0.5) * NAV, N.y0 + (j + 0.5) * NAV, 0.32) ? 1 : 2;
    return N.st[k] === 1;
  }
  function cellOf(x, y) { var N = S.nav; return [Math.floor((x - N.x0) / NAV), Math.floor((y - N.y0) / NAV)]; }
  function nearestOpen(x, y) {
    var c = cellOf(x, y);
    for (var r = 0; r <= 3; r++) for (var a = -r; a <= r; a++) for (var b = -r; b <= r; b++) {
      if (Math.max(Math.abs(a), Math.abs(b)) !== r) continue;
      if (cellOpen(c[0] + a, c[1] + b)) return [c[0] + a, c[1] + b];
    }
    return null;
  }
  // đường thẳng có bề rộng ~0,5 m không chạm đá
  function clear(ax, ay, bx, by) {
    var W = G.world;
    if (W.raycast(ax, ay, bx, by)) return false;
    var l = Math.hypot(bx - ax, by - ay) || 1, px = -(by - ay) / l * 0.22, py = (bx - ax) / l * 0.22;
    return !W.raycast(ax + px, ay + py, bx + px, by + py) && !W.raycast(ax - px, ay - py, bx - px, by - py);
  }
  function findPath(sx, sy, tx, ty) {
    var N = S.nav;
    if (N.budget <= 0) return undefined;   // hết lượt tính khung này: giữ đường cũ
    N.budget--; N.calls++;
    var s = nearestOpen(sx, sy), t = nearestOpen(tx, ty);
    if (!s || !t) return null;
    var nx = N.nx, sk = s[1] * nx + s[0], tk = t[1] * nx + t[0];
    var g = new Map(), from = new Map(), heap = [[0, sk]], closed = new Set();
    g.set(sk, 0);
    var hfun = function (k) { var i = k % nx, j = (k - i) / nx, dx = Math.abs(i - t[0]), dy = Math.abs(j - t[1]); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
    var push = function (f, k) {
      heap.push([f, k]);
      for (var c = heap.length - 1; c > 0;) { var p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; var tmp = heap[p]; heap[p] = heap[c]; heap[c] = tmp; c = p; }
    };
    var pop = function () {
      var top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        for (var c = 0; ;) { var l = c * 2 + 1, r = l + 1, m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; var tmp = heap[m]; heap[m] = heap[c]; heap[c] = tmp; c = m; }
      }
      return top;
    };
    var found = false, iter = 0;
    while (heap.length && iter++ < 7000) {
      var k = pop()[1];
      if (closed.has(k)) continue;
      if (k === tk) { found = true; break; }
      closed.add(k);
      var i = k % nx, j = (k - i) / nx, gk = g.get(k);
      for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        var ni = i + dx, nj = j + dy;
        if (!cellOpen(ni, nj)) continue;
        if (dx && dy && (!cellOpen(i + dx, j) || !cellOpen(i, j + dy))) continue;
        var nk = nj * nx + ni, ng = gk + (dx && dy ? 1.414 : 1);
        if (closed.has(nk) || (g.has(nk) && g.get(nk) <= ng)) continue;
        g.set(nk, ng); from.set(nk, k);
        push(ng + hfun(nk), nk);
      }
    }
    if (!found) return null;
    var pts = [], kk = tk;
    while (kk !== undefined) { var ii = kk % nx, jj = (kk - ii) / nx; pts.push({ x: N.x0 + (ii + 0.5) * NAV, y: N.y0 + (jj + 0.5) * NAV }); kk = from.get(kk); }
    pts.reverse();
    pts.push({ x: tx, y: ty });
    return pts;
  }

  // Bơi tới (x, y) theo đường tìm được. near: tới trong chừng này thì đứng lại. Trả khoảng cách còn lại.
  function goTo(m, x, y, speed, dt, near) {
    var N = m.nav, d = dist(m.pos.x, m.pos.y, x, y);
    near = near || 0.4;
    if (d <= near) { steer(m, m.pos.x, m.pos.y, 0, dt); N.stuckT = 0; return d; }
    N.repT -= dt;
    var moved = !N.goal || dist(N.goal.x, N.goal.y, x, y) > 1.5;
    if (moved || N.repT <= 0 || N.stuckT > 1.2 || !N.path) {
      var p = clear(m.pos.x, m.pos.y, x, y) ? [{ x: x, y: y }] : findPath(m.pos.x, m.pos.y, x, y);
      if (p === undefined && !N.path) p = [{ x: x, y: y }];   // hết lượt tính đường khung này: tạm bơi thẳng
      if (p !== undefined) {
        N.goal = { x: x, y: y }; N.path = p || [{ x: x, y: y }]; N.i = 0; N.repT = moved ? 1.2 : 2.5;
        N.noPath = !p;
        if (N.stuckT > 1.2) { N.stuckT = 0; m.vel.x += (Math.random() - 0.5) * 2; m.vel.y += (Math.random() - 0.5) * 2; }
      }
    }
    var P = N.path;
    P[P.length - 1] = { x: x, y: y };
    while (N.i < P.length - 1 && dist(m.pos.x, m.pos.y, P[N.i].x, P[N.i].y) < 0.7) N.i++;
    N.skipT -= dt;
    if (N.skipT <= 0) { N.skipT = 0.25; while (N.i < P.length - 1 && clear(m.pos.x, m.pos.y, P[N.i + 1].x, P[N.i + 1].y)) N.i++; }
    var w = P[N.i], last = N.i === P.length - 1;
    steer(m, w.x, w.y, last ? speed * Math.min(1, (d - near) / 1.2 + 0.25) : speed, dt);
    var sp = Math.hypot(m.vel.x, m.vel.y);
    if (sp < 0.25) N.stuckT += dt; else N.stuckT = Math.max(0, N.stuckT - dt);
    return d;
  }

  function steer(m, tx, ty, speed, dt) {
    var dx = tx - m.pos.x, dy = ty - m.pos.y, l = Math.hypot(dx, dy), vx = 0, vy = 0;
    if (l > 0.02 && speed > 0) { vx = dx / l * speed; vy = dy / l * speed; }
    var k = Math.min(1, 5 * dt);
    m.vel.x += (vx - m.vel.x) * k; m.vel.y += (vy - m.vel.y) * k;
  }

  function integrate(m, dt) {
    var cap = 3.8;
    var sp = Math.hypot(m.vel.x, m.vel.y);
    if (sp > cap) { m.vel.x *= cap / sp; m.vel.y *= cap / sp; }
    G.world.move(m.pos, m.vel, R, dt);
    var top = SURF - 0.38 * S2, floor = lastY1() + 0.35;
    if (m.pos.y > top) { m.pos.y = top; if (m.vel.y > 0) m.vel.y = 0; }
    if (m.pos.y < floor) { m.pos.y = floor; if (m.vel.y < 0) m.vel.y = 0; }
    m.pos.x = clamp(m.pos.x, -T.view.boundX - 2, T.view.boundX + 2);
  }

  function speedOf(m, fast) { return T.diver.maxSpeed * (m.stats.spd || 1) * (fast ? 1.5 : 1) * (m.rope ? m.towMul : 1); }

  // =====================================================================================================
  // MỘT ĐỒNG ĐỘI
  // =====================================================================================================
  function Mate(i, row, tactic) {
    var self = this;
    this.i = i; this.id = row.id; this.name = row.name; this.hue = row.hue; this.tactic = tactic;
    this.tac = C().tacticById[tactic] || C().tacticById.loot;
    this.row = row;
    var st = BDL.meta && BDL.meta.charStats ? BDL.meta.charStats(row.id, tactic) : null;
    this.stats = st || { atk: row.atk, hp: row.hp, spd: row.spd, carry: row.carry, grit: row.grit || 0, eye: 1 };
    this.atkCdMax = row.atkCd || 0.9;
    this.o2Max = Math.round(100 * this.stats.hp / 105);
    this.o2 = this.o2Max;
    this.pos = { x: 0, y: 0 }; this.vel = { x: 0, y: 0 }; this.facing = -1; this.tilt = 0;
    this.state = 'deck'; this.job = { phase: 'start' }; this.target = null; this.rope = null; this.fight = null;
    this.nav = { goal: null, path: null, i: 0, repT: 0, skipT: 0, stuckT: 0 };
    this.anim = 'Idle'; this.animT = 0; this.lock = 0; this.invuln = 0; this.atkCd = 0; this.swing = null; this.towMul = 1;
    this.waitT = 0; this.jump = null; this.diveT = 0; this.bubT = Math.random();
    this.cd = { heal: 0 };
    this.stat = { delivered: 0, value: 0, hits: 0, kills: 0, refills: 0, revealed: 0, assists: 0, noises: 0, hurt: 0, snaps: 0 };
    this.hurtT = 99;
    this.lastHit = null;
    // hình
    this.root = new THREE.Group();
    this.sheet = { tex: G.gfx.tex(D.sheet), W: 0, H: 0, gen: false };
    var cols = Math.max.apply(null, Object.keys(D.anims).map(function (k) { return D.anims[k].n; }));
    this.sheet.W = D.cell * cols;
    this.sheet.H = D.cell * (1 + Math.max.apply(null, Object.keys(D.anims).map(function (k) { return D.anims[k].row; })));
    this.body = HX.gfx.sprite(this.sheet.tex, CW, CW, { alphaCut: 0.5, depthWrite: true });
    this.root.add(this.body);
    this.root.visible = false;
    G.gfx.scene.add(this.root);
    this.z = 0.07 - i * 0.004;
    // tên trên đầu
    var tag = document.createElement('div');
    tag.className = 'mates-tag';
    tag.style.setProperty('--mc', 'hsl(' + row.hue + ',80%,66%)');
    tag.innerHTML = '<span class="say"></span><span class="ic"></span><b class="nm"></b><i><s></s></i>';
    tag.querySelector('.ic').textContent = this.tac.icon;
    tag.querySelector('.nm').textContent = row.name;
    tag.title = this.tac.name;
    (document.getElementById('hud') || document.body).appendChild(tag);
    this.tag = { el: tag, say: tag.querySelector('.say'), bar: tag.querySelector('s'), sayT: 0, o2: -1 };
    Object.defineProperty(this, 'alive', { get: function () { return self.state !== 'downed' && self.state !== 'board' && self.state !== 'deck'; }, enumerable: true });
    this.useSheet();
  }

  Mate.prototype.useSheet = function () {
    if (this.sheet.gen || !srcImg) return;
    var sh = crewSheet(this.id, this.hue);
    this.sheet = sh;
    this.body.material.uniforms.map.value = sh.tex;
  };

  Mate.prototype.setCell = function (row, col) {
    var sh = this.sheet, c = D.cell, r = sh.gen ? USED.map[row] : row;
    if (r == null) r = sh.gen ? USED.map[D.anims.Idle.row] : row;
    this.body.material.uniforms.uvRect.value.set(col * c / sh.W, 1 - (r + 1) * c / sh.H, c / sh.W, c / sh.H);
  };

  Mate.prototype.play = function (name, restart) {
    if (this.anim === name && !restart) return;
    this.anim = name; this.animT = 0;
  };

  Mate.prototype.drawBody = function () {
    var name = this.anim, c = clipOf(name), t = this.animT;
    if (c && !c.loop && t >= c.length && name === 'Die') { this.anim = 'DieIdle'; this.animT = 0; c = clipOf('DieIdle'); t = 0; }
    if (c) {
      t = c.loop ? t % c.length : Math.min(t, c.length);
      var fr = c.frames[0];
      for (var i = 1; i < c.frames.length && c.frames[i][0] <= t + 1e-6; i++) fr = c.frames[i];
      this.setCell(fr[1], fr[2]);
      return;
    }
    var a = D.anims[name] || D.anims.Idle;
    this.setCell(a.row, Math.floor(t * (a.fps || 8)) % a.n);
  };

  Mate.prototype.say = function (txt, t) {
    this.tag.say.textContent = txt; this.tag.sayT = t || 2.6;
    this.tag.el.classList.add('talk');
  };

  // Quái / vụ nổ đánh trúng bot. Trả true nếu trúng.
  Mate.prototype.hurt = function (dmg, fromX, fromY) {
    if (!this.alive || this.invuln > 0 || !(dmg > 0)) return false;
    dmg *= 1 - clamp(this.stats.grit || 0, 0, 0.75);
    this.o2 = Math.max(0, this.o2 - dmg);
    this.invuln = 1.1; this.hurtT = 0; this.stat.hurt++;
    if (fromX != null) {
      var dx = this.pos.x - fromX, dy = this.pos.y - fromY, l = Math.hypot(dx, dy) || 1;
      this.vel.x = dx / l * 3; this.vel.y = dy / l * 3;
      this.lastHit = { x: fromX, y: fromY };
    }
    G.fx.spawn('blood', this.pos.x, this.pos.y, this.z + 0.05, 0, 0, 0.6);
    G.audio.play('dave_hit' + (1 + Math.floor(Math.random() * 3)), { vol: 0.45, rate: 1.15 });
    if (this.o2 <= 0) { down(this); return true; }
    this.lock = 0.4; this.play('Hit', true);
    // đang khuân mà bị đánh tới dưới 40% O₂: buông đồ để chống trả (REPO: bot thả đồ khi bị quái vồ); còn khoẻ thì cố kéo tiếp
    if (this.rope && this.o2 < this.o2Max * 0.4) dropRope(this, false);
    return true;
  };

  Mate.prototype.remove = function () {
    if (this.rope) dropRope(this, false);
    G.gfx.scene.remove(this.root);
    this.body.material.dispose();
    if (this.ropeMesh) { G.gfx.scene.remove(this.ropeMesh.rope); G.gfx.scene.remove(this.ropeMesh.head); this.ropeMesh.rope.geometry.dispose(); this.ropeMesh.rope.material.dispose(); this.ropeMesh.head.material.dispose(); }
    this.tag.el.remove();
  };

  // ---------- dây của bot ----------
  var anchorTex = null;
  function ropeMeshes(m) {
    if (m.ropeMesh) return m.ropeMesh;
    if (!anchorTex) {
      anchorTex = new THREE.TextureLoader().load('art/dtd/icon/GGSTAnchor_Thumbnail.png');
      anchorTex.magFilter = THREE.NearestFilter; anchorTex.minFilter = THREE.LinearMipmapLinearFilter;
    }
    var head = HX.gfx.sprite(anchorTex, 0.45, 0.3, { alphaCut: 0.5, depthWrite: true, pivot: [0.95, 0.5] });
    var PTS = 10, geo = new THREE.BufferGeometry(), idx = [];
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PTS * 2 * 3), 3));
    for (var i = 0; i < PTS - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geo.setIndex(idx);
    var rope = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.58, 0.45, 0.28), side: THREE.DoubleSide }));
    rope.frustumCulled = false;
    head.visible = rope.visible = false;
    G.gfx.scene.add(head); G.gfx.scene.add(rope);
    m.ropeMesh = { head: head, rope: rope, PTS: PTS };
    return m.ropeMesh;
  }
  function targetGone(t) {
    if (t.isLoot) return t.state === 'gone' || t.state === 'onDeck' || !!t.lifted;
    return t.state === 'reeled' || !t.root || !t.root.parent;
  }
  function anchorPt(t) { return t.isLoot ? { x: t.pos.x, y: t.pos.y + t.hh * 0.3 } : t.center(); }
  function massOf(t) { return clamp(t.mass || 2, 2, 260); }

  function anchor(m, t) {
    m.rope = { target: t, tension: 0, strain: 0, len: 0 };
    m.job.best = null;
    t.tethered = true;
    t.__mate = m;
    if (t.isLoot) { t.wake(); t.grace = G.t + 1.0; } else BDL.bodyVel(t);
    m.state = 'haul';
    var a = anchorPt(t);
    G.audio.play('harpoon_hit', { vol: 0.35, rate: 0.85 });
    G.fx.spawn('hit', a.x, a.y, 0.2, 0, 0, 0.4);
    if (BDL.noise) BDL.noise(a.x, a.y, 5, 0.6);
    m.say('Buộc dây!', 1.6);
  }

  function dropRope(m, snapped) {
    var r = m.rope;
    if (!r) return null;
    var t = r.target;
    m.rope = null; m.towMul = 1;
    if (t) {
      t.tethered = false;
      if (t.__mate === m) t.__mate = null;
      if (!targetGone(t)) { var v = BDL.bodyVel(t); v.x *= 0.5; if (v.y > 0) v.y *= 0.3; if (snapped) v.y = Math.min(v.y, -0.4); }
    }
    if (m.ropeMesh) { m.ropeMesh.rope.visible = false; m.ropeMesh.head.visible = false; }
    if (snapped) {
      m.stat.snaps++;
      m.say('Đứt dây!', 1.8);
      G.audio.play('harpoon_tap', { vol: 0.5, rate: 0.5 });
      if (t && t.isLoot) blacklist(t, 25);
    }
    if (m.state === 'haul') m.state = 'job';
    return t;
  }

  function ropeStep(m, dt) {
    var r = m.rope, t = r.target;
    if (targetGone(t)) { dropRope(m, false); return; }
    var a = anchorPt(t), ox = m.pos.x - m.facing * 0.12, oy = m.pos.y - 0.1;
    var dx = ox - a.x, dy = oy - a.y, len = Math.hypot(dx, dy) || 1e-3, ux = dx / len, uy = dy / len;
    var mT = massOf(t), tv = BDL.bodyVel(t), carry = m.stats.carry || 30, lim = N_PER_STR * carry;
    var stretch = len - REST, rate = (m.vel.x - tv.x) * ux + (m.vel.y - tv.y) * uy;
    var k = Math.min(600, mT * 150), c = Math.min(90, mT * 12);
    var Tn = stretch > 0 ? Math.max(0, k * stretch + c * rate) : 0;
    Tn = Math.min(Tn, lim * 4);
    tv.x += ux * Tn / mT * dt; tv.y += uy * Tn / mT * dt;
    m.vel.x -= ux * Tn / M_MATE * dt; m.vel.y -= uy * Tn / M_MATE * dt;
    if (t.isLoot && Tn > 0) t.wake();
    r.len = len;
    r.tension += (Tn - r.tension) * Math.min(1, dt * 6);
    var ratio = r.tension / lim;
    if (ratio > 1) r.strain = Math.min(1, r.strain + dt / 3 * Math.min(2.5, ratio));
    else if (ratio < 0.85) r.strain = Math.max(0, r.strain - dt * 0.5);
    m.towMul = Math.max(SPEED_FLOOR, 1 / (1 + mT / carry));
    // món mắc đá (dây căng quá 90% sức kéo hơn 0,5 s): thôi kéo về thuyền, bơi lên ngay trên món để nhấc nó ra
    if (ratio > 0.9) r.hotT = (r.hotT || 0) + dt; else r.hotT = 0;
    if (r.hotT > 0.5 && !(r.unsnag > 0)) { r.unsnag = 2.2; r.hotT = 0; }
    if (r.strain >= 1 || len > 9) dropRope(m, true);
  }

  function drawRope(m) {
    var r = m.rope;
    if (!r) return;
    var M = ropeMeshes(m), a = anchorPt(r.target), ox = m.pos.x - m.facing * 0.12, oy = m.pos.y - 0.1;
    var ang = Math.atan2(a.y - oy, a.x - ox);
    M.head.visible = M.rope.visible = true;
    M.head.position.set(a.x, a.y, 0.11); M.head.rotation.z = ang;
    var ex = a.x - Math.cos(ang) * 0.36, ey = a.y - Math.sin(ang) * 0.36;
    var p = M.rope.geometry.attributes.position.array, len = Math.hypot(ex - ox, ey - oy) || 1e-3;
    var px = -(ey - oy) / len, py = (ex - ox) / len, w = 0.025, slack = Math.max(0, REST - len), sag = Math.min(1.2, Math.sqrt(3 * len * slack / 8)) + 0.05;
    var sx = py > 0 ? -px : px, sy = py > 0 ? -py : py;
    if (Math.abs(sy) < 0.35) { sx *= 0.7; sy = -0.5; }
    for (var i = 0; i < M.PTS; i++) {
      var t = i / (M.PTS - 1), bell = Math.sin(t * Math.PI);
      var x = ox + (ex - ox) * t + sx * bell * sag, y = oy + (ey - oy) * t + sy * bell * sag;
      p[i * 6] = x - px * w; p[i * 6 + 1] = y - py * w; p[i * 6 + 2] = 0.1;
      p[i * 6 + 3] = x + px * w; p[i * 6 + 4] = y + py * w; p[i * 6 + 5] = 0.1;
    }
    M.rope.geometry.attributes.position.needsUpdate = true;
    M.rope.material.color.setRGB(0.58 + 0.37 * r.strain, 0.45 - 0.29 * r.strain, 0.28 - 0.18 * r.strain);
  }

  // Tới thuyền thì món buộc dây lên boong: đã bán, vào đống đồ của hệ thuyền qua BDL.onDeliver.
  function deliverRope(m) {
    var t = m.rope.target, item = t.isLoot ? t.deckItem() : (t.deckItem ? t.deckItem() : BDL.deckItemOf(t));
    dropRope(m, false);
    t.removeFromWorld();
    // đống đồ trên boong (BDL.onDeliver của hệ thuyền) lỗi thì món vẫn đã tính tiền; đừng để lỗi đó làm kẹt vòng của bot
    try { BDL.run.deliver(item); } catch (e) { G.errors.push('mates → onDeliver: ' + e.message); console.error(e); }
    m.stat.delivered++; m.stat.value += item.value;
    m.say('+' + BDL.fmt(item.value), 2.4);
    HX.hud.toast(m.name + ' đưa lên thuyền: ' + item.label + ' · +' + BDL.fmt(item.value));
    G.fx.burst('bubbleBig', m.pos.x, m.pos.y, 8, 1);
  }

  // =====================================================================================================
  // ĐÁNH: dao lặn như Dave (MeleeOneHandHorizontal), sát thương = atk của crew × cấp × chiến thuật
  // =====================================================================================================
  function foeOk(foe) { return !!foe && !foe.dead && !foe.immune && foe.body.alive() && !!foe.body.root && !!foe.body.root.parent; }

  function startFight(m, foe, leash) {
    if (m.fight && m.fight.foe === foe) return;
    if (m.rope) dropRope(m, false);
    m.fight = { foe: foe, t: 0, leash: leash || null };
    m.state = 'fight';
  }

  // Trả true khi trận đánh xong (quái chết, mất dấu, quá xa).
  function fightStep(m, dt) {
    var F = m.fight, foe = F.foe;
    F.t += dt;
    if (!foeOk(foe) || F.t > 30 || (F.leash && !F.leash(foe))) { m.fight = null; m.state = 'job'; return true; }
    var f = foe.body, c = f.center(), reach = f.hitTest(m.pos.x, m.pos.y, 0.85);
    if (dist(m.pos.x, m.pos.y, c.x, c.y) > 30) { m.fight = null; m.state = 'job'; return true; }
    if (!reach) goTo(m, c.x, c.y, speedOf(m, true), dt, 0.3);
    else { steer(m, c.x, c.y, 0.4, dt); }
    if (reach && m.atkCd <= 0 && !m.swing) {
      m.swing = { t: 0, hit: false, foe: foe };
      m.atkCd = m.atkCdMax * 1.15;
      m.facing = c.x > m.pos.x ? 1 : -1;
      m.lock = T.knife.time; m.play('Melee', true);
      G.audio.play('knife', { vol: 0.45 });
      G.fx.play(G.fx.dive('meleeBubble'), m.pos.x, m.pos.y, { scale: S2, z: 0.14, angle: 0, flip: m.facing < 0, name: 'mateMelee' });
    }
    return false;
  }

  function swingStep(m, dt) {
    var sw = m.swing;
    if (!sw) return;
    sw.t += dt;
    if (!sw.hit && sw.t >= T.knife.hitAt) {
      sw.hit = true;
      var foe = sw.foe;
      if (foeOk(foe) && foe.body.hitTest(m.pos.x, m.pos.y, 1.1)) {
        var dmg = Math.max(1, Math.round(m.stats.atk));
        var r = foe.body.damage(dmg, m.pos.x, m.pos.y);
        m.stat.hits++;
        if (r === 'dead') { m.stat.kills++; m.say('Hạ được!', 1.8); m.lastKill = foe; }
      }
    }
    if (sw.t >= T.knife.time) m.swing = null;
  }

  // Quái thức chạm vào bot thì bot mất O₂ (quái chỉ săn Dave; đòn vồ trúng bot đứng chắn đường).
  // Khi hệ quái tự nhắm bot (BDL.foes.targetsMates) thì bỏ phần này để khỏi trừ hai lần.
  function contactDamage(m) {
    if (!BDL.foes || BDL.foes.targetsMates || !m.alive || m.invuln > 0) return;
    var list = BDL.foes.list();
    for (var i = 0; i < list.length; i++) {
      var foe = list[i];
      if (foe.asleep || !foe.aware || (BDL.foes.stateOf && BDL.foes.stateOf(foe))) continue;
      if (foe.body.hitTest(m.pos.x, m.pos.y, 0.15)) { var c = foe.body.center(); if (m.hurt(foe.dmg * 0.45, c.x, c.y)) m.invuln = 1.6; return; }
    }
  }

  // Bị đánh trong 3 s qua và có quái thức trong 5 m: chống trả.
  function selfDefense(m) {
    if (m.fight || m.rope || m.hurtT > 3 || !BDL.foes) return false;
    var foe = BDL.foes.nearest(m.pos.x, m.pos.y, 5, { awake: true, filter: function (f) { return !f.immune; } });
    if (!foe) return false;
    startFight(m, foe, function (f) { var c = f.body.center(); return dist(c.x, c.y, m.pos.x, m.pos.y) < 9; });
    return true;
  }

  // =====================================================================================================
  // VIỆC THEO CHIẾN THUẬT
  // =====================================================================================================
  // Chỗ đứng quanh Dave: mỗi bot một góc để khỏi chồng lên nhau.
  var SLOTS = [[-1.8, 1.0], [1.6, 1.3], [-2.2, -0.9], [2.0, -1.1]];
  function escort(m, dt, far) {
    var d = dave(), sl = SLOTS[m.i % SLOTS.length], tx, ty;
    if (!daveInWater()) { var B = dropPoint(); tx = B.x + sl[0] * 1.5; ty = B.y - 1 + sl[1] * 0.6; }
    else { tx = d.pos.x + sl[0] * (far || 1) * (d.facing || 1); ty = d.pos.y + sl[1] * (far || 1); }
    if (!G.world.open(tx, ty, 0.3)) { tx = d.pos.x; ty = d.pos.y + 0.5; }
    var dd = dist(m.pos.x, m.pos.y, tx, ty);
    goTo(m, tx, ty, speedOf(m, dd > 4), dt, 0.6);
  }

  var blk = {};
  function blacklist(t, sec) { blk[t.id] = G.t + sec; }
  function lootFree(t, m) {
    if (!t || targetGone(t) || t.lifted) return false;
    if (t.tethered && t.__mate !== m) return false;
    if (t.__mate && t.__mate !== m && t.__mate.alive && t.__mate.job.target === t) return false;
    if ((blk[t.id] || 0) > G.t) return false;
    return t.pos.y >= lastY1() - 1.6;
  }
  function pickLoot(m) {
    var best = null, bs = -1, L = G.loot || [], B = dropPoint(), carry = m.stats.carry || 30;
    for (var i = 0; i < L.length; i++) {
      var t = L[i];
      if (t.state !== 'rest' && t.state !== 'sinking') continue;
      if (!lootFree(t, m) || t.mass > (m.stats.carry || 30) * 1.6) continue;   // REPO: món nặng quá sức một người phải hai người khiêng [ĐỀ XUẤT 1,6 × sức mang]
      // giá trên thời gian: bơi tới + kéo về (chậm theo khối lượng như REPO)
      var tow = Math.max(SPEED_FLOOR, 1 / (1 + t.mass / carry));
      var s = t.value / (dist(m.pos.x, m.pos.y, t.pos.x, t.pos.y) + dist(t.pos.x, t.pos.y, B.x, B.y) / tow + 8);
      if (s > bs) { bs = s; best = t; }
    }
    return best;
  }

  // Khuân đồ lên thuyền (dùng chung cho Khuân đồ và Săn quái).
  function haulStep(m, dt) {
    m.state = 'haul';
    var P = dropPoint(), J = m.job, r = m.rope;
    if (r.unsnag > 0) {
      r.unsnag -= dt;
      var a = anchorPt(r.target);
      goTo(m, a.x, a.y + REST, speedOf(m) * 0.6, dt, 0.3);
      return;
    }
    var d = goTo(m, P.x, P.y, speedOf(m), dt, 0.5);
    // 15 s không gần thuyền thêm được 2 m: món kẹt đá, buông ra tìm món khác
    if (J.best == null || d < J.best - 2) { J.best = d; J.stall = 0; }
    else if ((J.stall += dt) > 15) { var t = dropRope(m, false); if (t && t.isLoot) blacklist(t, 60); J.best = null; return; }
    if (nearHull(m.pos.x, m.pos.y) && m.pos.y > SURF - 3.5) deliverRope(m);
  }

  var JOBS = {
    // Khuân đồ: món đáng giá nhất theo giá / quãng đường, chưa bot nào nhận; buộc dây rồi kéo về thuyền.
    loot: function (m, dt) {
      var J = m.job;
      if (m.rope) { J.phase = 'haul'; haulStep(m, dt); return; }
      if (!lootFree(J.target, m) || (J.target && J.target.tethered)) { J.target = pickLoot(m); J.t = 0; if (J.target) J.target.__mate = m; }
      m.target = J.target;
      if (!J.target) { J.phase = 'idle'; escort(m, dt, 1.6); return; }
      J.phase = 'seek'; J.t += dt;
      var t = J.target, a = anchorPt(t);
      var d = goTo(m, a.x, a.y + 0.7, speedOf(m, true), dt, 0.5);
      if (d < ANCHOR_REACH && !G.world.raycast(m.pos.x, m.pos.y, a.x, a.y)) anchor(m, t);
      else if (J.t > 45 || m.nav.noPath && J.t > 6) { blacklist(t, 40); J.target = null; }
    },

    // Thủ thuyền: tuần quanh thuyền, đánh quái trong 12 m quanh thuyền.
    thu: function (m, dt) {
      var J = m.job, B = dropPoint();
      var foe = BDL.foes && BDL.foes.nearest(B.x, B.y, 12, { filter: function (f) { return !f.immune; } });
      if (foe) { startFight(m, foe, function (f) { var c = f.body.center(); return dist(c.x, c.y, B.x, B.y) < 18; }); return; }
      J.phase = 'patrol';
      if (!J.wp || dist(m.pos.x, m.pos.y, J.wp.x, J.wp.y) < 1 || (J.t = (J.t || 0) + dt) > 10) {
        J.side = -(J.side || 1); J.t = 0;
        J.wp = { x: B.x + J.side * (5 + Math.random() * 3), y: SURF - 2.5 - Math.random() * 4 };
        if (!G.world.open(J.wp.x, J.wp.y, 0.4)) J.wp = { x: B.x, y: SURF - 2.5 };
      }
      goTo(m, J.wp.x, J.wp.y, speedOf(m) * 0.7, dt, 0.6);
    },

    // Soi đáy: bơi xuống các tầng sâu, món đồ cổ nào lọt trong 8 m thì đánh dấu cho cả đội và hô lên.
    soi: function (m, dt) {
      var J = m.job;
      J.phase = 'scout';
      J.t = (J.t || 0) + dt;
      if (!J.goal || dist(m.pos.x, m.pos.y, J.goal.x, J.goal.y) < 1.5 || J.t > 35 || (m.nav.noPath && J.t > 4)) {
        J.goal = scoutSpot(m); J.t = 0;
      }
      if (J.goal) goTo(m, J.goal.x, J.goal.y, speedOf(m), dt, 1);
      else escort(m, dt, 2);
    },

    // Bảo kê: bám Dave trong ~4 m, đánh con nào đang rượt Dave.
    baoke: function (m, dt) {
      var d = dave();
      if (daveInWater() && BDL.foes) {
        var foe = BDL.foes.nearest(d.pos.x, d.pos.y, 9, { awake: true, filter: function (f) { return f.aware && !f.immune; } });
        if (foe) { startFight(m, foe, function (f) { var c = f.body.center(); return dist(c.x, c.y, d.pos.x, d.pos.y) < 11 && dist(m.pos.x, m.pos.y, d.pos.x, d.pos.y) < 10; }); return; }
      }
      m.job.phase = 'escort';
      escort(m, dt, 0.9);
    },

    // Cứu hộ: ở gần Dave; Dave dưới 50% O₂ thì bơi tới tiếp +20 O₂ (hồi 25 s).
    cuuho: function (m, dt) {
      var d = dave(), mx = G.loadout ? G.loadout.o2 : 100;
      if (daveInWater() && d.o2 < mx * 0.5 && m.cd.heal <= 0) {
        m.job.phase = 'rescue';
        var dd = goTo(m, d.pos.x, d.pos.y, speedOf(m, true), dt, 0.9);
        if (dd < 1.4) {
          d.o2 = Math.min(mx, d.o2 + HEAL_O2);
          m.cd.heal = HEAL_CD; m.stat.refills++;
          G.fx.spawn('glow', d.pos.x, d.pos.y, 0.3, 0, 0, 1.4);
          G.fx.burst('bubbleBig', d.pos.x, d.pos.y, 10, 1);
          G.audio.play('dave_grab', { vol: 0.6 });
          m.say('+' + HEAL_O2 + ' O₂', 2.4);
          HX.hud.toast(m.name + ' tiếp O₂ cho bạn · +' + HEAL_O2);
        }
        return;
      }
      m.job.phase = 'escort';
      escort(m, dt, 1.2);
    },

    // Nhử mồi: bơi ra chỗ xa Dave (18-30 m) gây tiếng động kéo quái đi.
    nhu: function (m, dt) {
      var J = m.job;
      J.t = (J.t || 0) + dt;
      if (!J.spot || J.t > 40 || (J.phase === 'ring' && J.ringT > 12) || (m.nav.noPath && J.t > 5)) {
        J.spot = lureSpot(m); J.t = 0; J.phase = 'go'; J.ringT = 0; J.tick = 0;
      }
      if (!J.spot) { escort(m, dt, 2); return; }
      var d = goTo(m, J.spot.x, J.spot.y, speedOf(m), dt, 1.2);
      if (d < 1.6) {
        J.phase = 'ring'; J.ringT += dt; J.tick -= dt;
        if (J.tick <= 0) {
          J.tick = 2.5;
          if (BDL.noise) BDL.noise(m.pos.x, m.pos.y, 14, 1.6);
          m.stat.noises++;
          G.fx.burst('bubbleBig', m.pos.x, m.pos.y + 0.3, 6, 1.2);
          G.audio.play('harpoon_tap', { vol: 0.35, rate: 1.6 });
          m.say('🔔', 1.2);
        }
      }
    },

    // Săn quái: đuổi đánh quái đang thức; giết xong kéo xác lên thuyền như đồ cổ (xác quái kind 'foe').
    san: function (m, dt) {
      var J = m.job;
      if (m.rope) { J.phase = 'haul'; haulStep(m, dt); return; }
      // xác vừa hạ: chờ hệ quái quyết có để xác hay không (onDeath chạy ở khung sau)
      var k = m.lastKill;
      if (k) {
        var f = k.body;
        if (k.corpse && f.corpse && f.corpse() && !f.tethered && BDL.run.sellable(k.key) && f.root && f.root.parent) {
          J.phase = 'corpse';
          var c = f.center(), d = goTo(m, c.x, c.y + 0.5, speedOf(m, true), dt, 0.5);
          if (d < ANCHOR_REACH) { anchor(m, f); m.lastKill = null; }
          J.ct = (J.ct || 0) + dt;
          if (J.ct > 30) { m.lastKill = null; J.ct = 0; }
          return;
        }
        J.ct = (J.ct || 0) + dt;
        if (J.ct > 1.5 || f.state === 'reeled') { m.lastKill = null; J.ct = 0; }
      }
      var foe = BDL.foes && BDL.foes.nearest(m.pos.x, m.pos.y, 45, { awake: true, filter: function (fo) { return !fo.immune; } });
      if (foe) { J.phase = 'hunt'; startFight(m, foe); return; }
      J.phase = 'idle';
      escort(m, dt, 1.8);
    },

    // Tiếp tế: giữ giữa đội cạnh Dave; mỗi lần Dave tung kỹ năng thì hồi chiêu giảm 15% (xem supplyHook).
    tiepte: function (m, dt) {
      m.job.phase = 'escort';
      escort(m, dt, 1.1);
    },
  };

  // Chỗ soi tiếp theo: một ô nước ở tầng sâu hơn Dave, chưa soi gần đó.
  function scoutSpot(m) {
    var J = m.job, fl = G.floors, n = fl.length, d = dave();
    J.seen = J.seen || [];
    var from = Math.min(n - 1, BDL.floorAt(daveInWater() ? d.pos.y : SURF, fl) + 1);
    for (var tries = 0; tries < 40; tries++) {
      // nghiêng về tầng sâu
      var f = from + Math.floor(Math.pow(Math.random(), 0.6) * (n - from));
      f = clamp(f, 0, n - 1);
      var x = (Math.random() * 2 - 1) * (T.view.boundX - 3), y = fl[f].y1 + 1 + Math.random() * (fl[f].y0 - fl[f].y1 - 2);
      if (!G.world.open(x, y, 0.6)) continue;
      var near = J.seen.some(function (p) { return dist(p.x, p.y, x, y) < 10; });
      if (near && tries < 30) continue;
      J.seen.push({ x: x, y: y });
      if (J.seen.length > 30) J.seen.shift();
      return { x: x, y: y };
    }
    return null;
  }
  function lureSpot(m) {
    var d = dave(), cx = daveInWater() ? d.pos.x : m.pos.x, cy = daveInWater() ? d.pos.y : m.pos.y;
    for (var tries = 0; tries < 40; tries++) {
      var a = Math.random() * Math.PI * 2, r = 18 + Math.random() * 12;
      var x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.6;
      if (y > SURF - 2 || y < lastY1() + 1 || Math.abs(x) > T.view.boundX - 2) continue;
      if (G.world.open(x, y, 0.6)) return { x: x, y: y };
    }
    return null;
  }

  // Soi: món trong tầm (8 m × mắt crew) thì đánh dấu, gom lời hô lại mỗi 4 s.
  function revealStep(m, dt) {
    if (m.tactic !== 'soi' || !m.alive) return;
    m.revT = (m.revT || 0) - dt;
    if (m.revT > 0) return;
    m.revT = 0.25;
    var r = 8 * (m.stats.eye || 1), L = G.loot || [];
    for (var i = 0; i < L.length; i++) {
      var t = L[i];
      if (S.revealed.indexOf(t) >= 0 || dist(m.pos.x, m.pos.y, t.pos.x, t.pos.y) > r) continue;
      S.revealed.push(t); m.stat.revealed++;
      G.fx.spawn('glow', t.pos.x, t.pos.y, 0.25, 0, 0, 1.2);
      (S.callout || (S.callout = { m: m, n: 0, v: 0, fl: 0, t: 0 }));
      S.callout.n++; S.callout.v += t.value; S.callout.fl = BDL.floorAt(t.pos.y, G.floors); S.callout.best = t;
    }
  }
  function calloutStep(dt) {
    S.callT -= dt;
    var c = S.callout;
    if (!c || S.callT > 0) return;
    S.callT = 4;
    var txt = c.n === 1 ? 'thấy ' + c.best.name + ' ' + BDL.fmt(c.v) : 'thấy ' + c.n + ' món · ' + BDL.fmt(c.v);
    HX.hud.toast(c.m.name + ': ' + txt + ' ở tầng ' + (c.fl + 1));
    c.m.say('🔦 ' + c.n, 2);
    S.callout = null;
  }
  function revealMarks() {
    S.revealed = S.revealed.filter(function (t) { return !targetGone(t) && (G.loot || []).indexOf(t) >= 0; });
    if (!HX.hud.marks) return;
    if (S.revealed.length) {
      HX.hud.marks(S.revealed.map(function (t) { return { x: t.pos.x, y: t.pos.y, kind: 'loot' }; }));
      S.marksOn = true;
    } else if (S.marksOn) { S.marksOn = false; HX.hud.marks(null); }
  }

  // Tiếp tế: hồi chiêu của Dave vừa nhảy lên (một lần tung) thì cắt 15%, nếu người tiếp tế đang ở gần (15 m).
  function supplyHook() {
    var sk = BDL.skill;
    if (!sk) return;
    var cd = sk.cdLeft || 0;
    if (S.lastCd != null && cd > S.lastCd + 0.2) {
      var d = dave(), helper = null;
      S.mates.forEach(function (m) { if (!helper && m.tactic === 'tiepte' && m.alive && d && dist(m.pos.x, m.pos.y, d.pos.x, d.pos.y) < 15) helper = m; });
      if (helper) {
        sk.cdLeft = Math.max(0, cd - CD_CUT * (sk.cdMax || cd));
        helper.stat.assists++;
        helper.say('−15% hồi chiêu', 2);
        cd = sk.cdLeft;
      }
    }
    S.lastCd = cd;
  }

  // =====================================================================================================
  // CÁC TRẠNG THÁI: boong → nhảy → lặn → việc / khuân / đánh → gục → nằm trên thuyền
  // =====================================================================================================
  var DECK_SLOT = [3.2, 2.2, 1.2, 0.2];
  // Trên boong: phóng ×1,35 cho bằng cỡ Dave của sheet dave_lobby (ship.js); tâm ô Idle cao hơn bàn chân 0,5 m × cỡ (đo trên sheet)
  var DECK_K = 1.35, FEET = 0.5 * DECK_K;
  function deckSpot(m) {
    var B = boat();
    if (!B.M) return null;
    var lx = DECK_SLOT[m.i % DECK_SLOT.length];
    var p = B.M.world(lx, B.M.deckY(lx));
    return { x: p.x, y: p.y + FEET };
  }

  function deckStep(m, dt) {
    var dk = G.deck;
    if (m.jump) {
      var j = m.jump;
      j.vy -= 22 * dt; m.pos.x += j.vx * dt; m.pos.y += j.vy * dt;
      m.play('Diving');
      m.tilt = lerpAngle(m.tilt, -1.0, Math.min(1, 5 * dt));
      if (j.vy < 0 && m.pos.y <= SURF + 0.1) enterWater(m);
      return;
    }
    var sp = deckSpot(m);
    if (!sp || !dk) { m.pos.x = dave().pos.x - 1 - m.i; m.pos.y = SURF - 0.3; enterWater(m); return; }
    m.pos.x = sp.x; m.pos.y = sp.y; m.facing = -1; m.tilt = 0;
    m.play('Idle');
    if (!dk.on) {
      m.waitT += dt;
      if (m.waitT >= m.jumpDelay) {
        m.jump = { vx: 2.4 + m.i * 0.35, vy: 6.6 + Math.random() * 0.8 };
        m.facing = 1;
        G.audio.play('boat_dive', { vol: 0.35 });
      }
    } else m.waitT = 0;
  }

  function enterWater(m) {
    m.jump = null;
    m.state = 'dive'; m.diveT = 0;
    m.pos.y = Math.min(m.pos.y, SURF - 0.3);
    m.vel.x = 0.4 * m.facing; m.vel.y = -2.6;
    m.tilt = -1.2;
    m.play('Diving', true);
    G.fx.burst('bubbleBig', m.pos.x, SURF - 0.1, 12, 2);
    G.fx.burst('puff', m.pos.x, SURF - 0.05, 3, 0.8);
    G.audio.play('boat_splash', { vol: 0.45 });
  }

  function down(m) {
    if (m.rope) dropRope(m, false);
    m.fight = null; m.swing = null;
    m.state = 'downed'; m.o2 = 0;
    m.play('Die', true); m.lock = 0;
    m.say('Hết O₂!', 3);
    HX.hud.toast(m.name + ' gục · nổi về thuyền, hết lượt lặn này');
    G.fx.burst('bubbleBig', m.pos.x, m.pos.y, 14, 1.4);
    m.body.material.uniforms.tint.value.setRGB(0.55, 0.6, 0.65);
    m.tag.el.classList.add('down');
  }

  // Gục: thân nổi dần về thuyền (theo đường nước), tới nơi thì nằm trên boong tới hết lượt lặn.
  function downedStep(m, dt) {
    var P = dropPoint();
    goTo(m, P.x, Math.min(SURF - 1, P.y + 1), 1.5, dt, 0.5);
    m.tilt = lerpAngle(m.tilt, 0, Math.min(1, 4 * dt));
    if (m.anim !== 'Die' && m.anim !== 'DieIdle') m.play('DieIdle');
    integrate(m, dt);
    if (nearHull(m.pos.x, m.pos.y) && m.pos.y > SURF - 3.5) {
      m.state = 'board';
      G.fx.burst('bubbleBig', m.pos.x, SURF - 0.1, 8, 1.2);
    }
  }
  function boardStep(m) {
    var sp = deckSpot(m);
    if (sp) { m.pos.x = sp.x; m.pos.y = sp.y - 0.15; }
    m.vel.x = m.vel.y = 0; m.tilt = 0;
    m.play('DieIdle');
  }

  function poseSwim(m, dt) {
    if (m.lock > 0) { m.tilt = lerpAngle(m.tilt, 0, Math.min(1, 10 * dt)); return; }
    var sp = Math.hypot(m.vel.x, m.vel.y);
    if (sp > 0.35) {
      if (m.vel.x > 0.05) m.facing = 1; else if (m.vel.x < -0.05) m.facing = -1;
      var a = Math.atan2(m.vel.y, Math.abs(m.vel.x));
      m.tilt = lerpAngle(m.tilt, a, Math.min(1, T.diver.turnRate * dt));
      var deg = m.tilt * 180 / Math.PI, pre = sp > 2.7 ? 'BMove' : 'Move';
      m.play(pre + (deg > 62 ? 'Up' : deg > 22 ? 'SideUp' : deg < -62 ? 'Down' : deg < -22 ? 'SideDown' : 'Side'));
    } else {
      m.tilt = lerpAngle(m.tilt, 0, Math.min(1, 6 * dt));
      m.play('Idle');
    }
  }

  function updateMate(m, dt) {
    m.animT += dt; m.lock = Math.max(0, m.lock - dt); m.invuln = Math.max(0, m.invuln - dt);
    m.atkCd -= dt; m.hurtT += dt; m.cd.heal = Math.max(0, m.cd.heal - dt);
    if (m.state === 'deck') deckStep(m, dt);
    else if (m.state === 'downed') downedStep(m, dt);
    else if (m.state === 'board') boardStep(m);
    else if (m.state === 'dive') {
      m.diveT += dt;
      m.vel.x *= Math.exp(-2 * dt); m.vel.y *= Math.exp(-1.2 * dt);
      integrate(m, dt);
      if (m.diveT > 1.1) { m.state = 'job'; }
    } else {
      // job / haul / fight
      selfDefense(m);
      if (m.fight) fightStep(m, dt);
      else (JOBS[m.tactic] || JOBS.loot)(m, dt);
      swingStep(m, dt);
      if (m.rope) ropeStep(m, dt);
      integrate(m, dt);
      poseSwim(m, dt);
      contactDamage(m);
      m.bubT -= dt;
      if (m.bubT <= 0) { m.bubT = 1.2 + Math.random(); G.fx.burst('bubble', m.pos.x + m.facing * 0.25, m.pos.y + 0.3, 2, 0.4); }
    }
    drawMate(m, dt);
  }

  function drawMate(m, dt) {
    m.useSheet();
    m.drawBody();
    m.root.visible = true;
    var onBoat = m.state === 'deck' || m.state === 'board';
    m.root.position.set(m.pos.x, m.pos.y, onBoat ? 0.4 : m.z);
    m.body.renderOrder = onBoat ? 8.5 : 0;   // trên boong phải vẽ sau thân thuyền (renderOrder 7)
    var sc = onBoat ? CW * DECK_K : CW;
    m.body.scale.set(sc * m.facing, sc, 1);
    m.body.rotation.z = m.facing > 0 ? m.tilt : -m.tilt;
    var blink = m.invuln > 0 && m.alive && Math.floor(m.invuln * 14) % 2 === 0;
    m.body.material.uniforms.flash.value = blink ? 0.5 : 0;
    drawRope(m);
    // nhãn tên
    var tg = m.tag, el = tg.el, s = G.gfx.worldToScreen(m.pos.x, m.pos.y + (m.state === 'deck' || m.state === 'board' ? 0.75 : 0.62));
    var on = s.x > -60 && s.x < innerWidth + 60 && s.y > -40 && s.y < innerHeight + 60;
    if (el.hidden === on) el.hidden = !on;
    if (on) el.style.transform = 'translate(' + s.x.toFixed(1) + 'px,' + s.y.toFixed(1) + 'px) translate(-50%,-100%)';
    var k = Math.round(m.o2 / m.o2Max * 100);
    if (k !== tg.o2) { tg.o2 = k; tg.bar.style.width = k + '%'; }
    if (tg.sayT > 0) { tg.sayT -= dt; if (tg.sayT <= 0) el.classList.remove('talk'); }
  }

  // =====================================================================================================
  // DỰNG / DỠ
  // =====================================================================================================
  function ensureCss() {
    if (document.getElementById('mates-css')) return;
    var st = document.createElement('style');
    st.id = 'mates-css';
    st.textContent = [
      '.mates-tag { position: absolute; left: 0; top: 0; pointer-events: none; white-space: nowrap; text-align: center;',
      '  font: 800 calc(11px * var(--px, 1))/1.2 system-ui, sans-serif; color: #fff; text-shadow: 0 1px 0 #000, 0 0 4px #000; }',
      '.mates-tag .nm { color: var(--mc); }',
      '.mates-tag .ic { margin-right: 3px; font-size: .95em; }',
      '.mates-tag i { display: block; margin: 2px auto 0; width: calc(34px * var(--px, 1)); height: 3px; border-radius: 2px; background: rgba(0,0,0,.6); overflow: hidden; }',
      '.mates-tag i s { display: block; height: 100%; width: 100%; background: var(--mc); }',
      '.mates-tag .say { display: none; margin-bottom: 1px; color: #ffe08a; font-size: calc(12px * var(--px, 1)); }',
      '.mates-tag.talk .say { display: block; }',
      '.mates-tag.down { opacity: .65; } .mates-tag.down .nm { color: #9aa; text-decoration: line-through; }',
    ].join('\n');
    document.head.appendChild(st);
  }

  // Trang thử: đủ người theo danh sách chiến thuật, bỏ Flare (người lặn mặc định = Dave)
  function devSquad(tactics) {
    var ok = C().tacticById, ids = C().crew.map(function (c) { return c.id; }).filter(function (id) { return id !== 'bao'; });
    return tactics.filter(function (t) { return ok[t]; }).slice(0, 4).map(function (t, i) { return { id: ids[i], tactic: t }; });
  }

  function squad() {
    var ca = BDL.run.ca;
    return ca && ca.crew && ca.crew.mates ? ca.crew.mates.slice(0, 4) : [];
  }

  function spawnSquad(list, midDive) {
    S.mates.forEach(function (m) { m.remove(); });
    S.mates = [];
    list.forEach(function (e, i) {
      var row = C().crewById[e.id];
      if (!row) return;
      var m = new Mate(S.mates.length, row, e.tactic || 'loot');
      m.jumpDelay = midDive ? 0.25 + 0.3 * i : 1.0 + 0.4 * i;
      S.mates.push(m);
    });
    G.mates = S.mates;
  }

  // Trước mọi hệ khác: trang thử ?mates=… điền tổ vào ca để chỉ tiêu (loot.js gọi setQuota) tính crewMul của REPO.
  BDL.systems = BDL.systems || [];
  BDL.systems.unshift({
    name: 'mates-seed',
    build: function () {
      var ca = BDL.run.ca;
      if (!ca || !DEV_TACTICS || (ca.crew && ca.crew.mates && ca.crew.mates.length)) return;
      ca.crew = ca.crew || {};
      ca.crew.mates = devSquad(DEV_TACTICS);
    },
  });

  function view(m) {
    return { i: m.i, id: m.id, name: m.name, hue: m.hue, tactic: m.tactic, state: m.state, phase: m.job.phase, alive: m.alive,
      x: m.pos.x, y: m.pos.y, o2: m.o2, o2Max: m.o2Max, rope: m.rope ? { loot: !!m.rope.target.isLoot, id: m.rope.target.id, strain: m.rope.strain } : null,
      fight: m.fight ? m.fight.foe.id : null, sheet: !!m.sheet.gen, tag: !m.tag.el.hidden && !!m.tag.el.parentNode, stat: Object.assign({}, m.stat),
      healCd: m.cd.heal, atk: m.stats.atk, carry: m.stats.carry, target: m.job.target ? m.job.target.id : null };
  }

  BDL.systems.push({
    name: 'mates',
    build: function (g) {
      G = g;
      ensureCss();
      S = { mates: [], revealed: [], marksOn: false, callout: null, callT: 0, lastCd: null };
      blk = {};
      navBuild();
      sourceImage().then(function () { /* sheet đổi màu sinh ở khung vẽ đầu tiên sau khi có ảnh */ }, function (e) { G.errors.push('mates: ' + e.message); });
      spawnSquad(squad(), false);
      window.BDL_DEBUG.mates = {
        list: function () { return S ? S.mates.map(view) : []; },
        job: function (i) { var m = S.mates[i]; return m ? Object.assign(view(m), { nav: { path: m.nav.path ? m.nav.path.length : 0, noPath: !!m.nav.noPath } }) : null; },
        setSquad: function (arr) {
          var ca = BDL.run.ca || BDL.run.start();
          ca.crew = ca.crew || {};
          ca.crew.mates = (arr || []).slice(0, 4).map(function (e, i) {
            if (typeof e === 'string') e = { tactic: e };
            return { id: e.id || devSquad(['loot', 'loot', 'loot', 'loot'])[i].id, tactic: e.tactic || 'loot' };
          });
          spawnSquad(ca.crew.mates, !(G.deck && G.deck.on));
          if (BDL.run.dive) BDL.run.setQuota(BDL.run.dive.lootTotal);
          return S.mates.map(view);
        },
        hurt: function (i, n) { var m = S.mates[i]; return m ? m.hurt(n, m.pos.x - 1, m.pos.y) : false; },
        teleport: function (i, x, y) { var m = S.mates[i]; if (m) { m.pos.x = x; m.pos.y = y; m.vel.x = m.vel.y = 0; m.nav.path = null; } },
        revealed: function () { return S.revealed.length; },
        nav: function () { return { calls: S.nav.calls, nx: S.nav.nx, ny: S.nav.ny }; },
        // bảng 14 crew đổi màu (ảnh dataURL) để duyệt hình
        crewSheet: function (scale) {
          scale = scale || 3;
          var list = C().crew, cell = D.cell, picks = [['Idle', 0], ['MoveSide', 2], ['MoveSideUp', 1], ['Melee', 2]];
          var cv = document.createElement('canvas'), cw = 70 * scale, ch = 64 * scale;
          cv.width = cw * picks.length + 120; cv.height = ch * list.length;
          var cx = cv.getContext('2d');
          cx.fillStyle = '#1d3a5c'; cx.fillRect(0, 0, cv.width, cv.height);
          cx.imageSmoothingEnabled = false;
          list.forEach(function (row, r) {
            var sh = crewSheet(row.id, row.hue);
            cx.fillStyle = 'hsl(' + row.hue + ',80%,66%)'; cx.font = 'bold 18px system-ui';
            cx.fillText(row.name, 8, r * ch + ch / 2); cx.fillStyle = '#cde'; cx.font = '13px system-ui'; cx.fillText(row.id, 8, r * ch + ch / 2 + 18);
            picks.forEach(function (p, k) {
              var c = clipOf(p[0]), fr = c ? c.frames[Math.min(p[1], c.frames.length - 1)] : [0, D.anims.Idle.row, 0];
              var rr = USED.map[fr[1]], sx = fr[2] * cell + 25, sy = rr * cell + 28;
              cx.drawImage(sh.canvas, sx, sy, 70, 64, 120 + k * cw, r * ch, cw, ch);
            });
          });
          return cv.toDataURL('image/png');
        },
      };
    },
    update: function (dt) {
      if (!S) return;
      S.nav.budget = 2;
      for (var i = 0; i < S.mates.length; i++) updateMate(S.mates[i], dt);
      for (var j = 0; j < S.mates.length; j++) revealStep(S.mates[j], dt);
      calloutStep(dt);
      revealMarks();
      supplyHook();
    },
    teardown: function (g) {
      if (!S) return;
      S.mates.forEach(function (m) { m.remove(); });
      if (S.marksOn && HX.hud.marks) HX.hud.marks(null);
      g.mates = [];
      S = null;
    },
  });
})(window.BDL);
