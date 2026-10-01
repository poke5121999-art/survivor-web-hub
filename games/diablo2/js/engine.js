/* Ác Quỷ II - engine.js
 * Vẽ isometric, nạp ảnh theo manifest (D2_ASSETS), chọn khung hình hoạt ảnh,
 * sắp xếp chiều sâu ô vật cản + thực thể theo (x+y).
 * Hợp đồng: xem brain/plans/diablo2-flare.md
 */
(function () {
  'use strict';
  var D2 = window.D2 = window.D2 || {};
  var A = window.D2_ASSETS || { scale: 0.5, sheets: {}, tilesets: {}, autotile: {}, sfx: {}, music: {}, avatarLayers: { order: [] } };
  var W = 960, H = 540;
  var TILE_CENTER = 0.5;       // ô (i,j) vẽ tại tâm (i+.5, j+.5); chỉnh nếu ô lệch khi nhìn ảnh chụp

  var E = D2.E = {
    W: W, H: H, A: A, canvas: null, ctx: null,
    Z: 1,                      // ảnh đóng gói đã ở cỡ vẽ (96x48 một ô sàn ~ ô D2 80x40); chỉnh nếu muốn phóng to
    images: {}, grid: null,
    cam: { x: 0, y: 0 },       // toạ độ ô
    tw: 64, th: 32, shake: 0, ver: '', muted: false,
    view: 1                    // thu phóng khung hình (1 = bình thường; <1 = nhìn xa, dùng khi chụp ảnh/gỡ lỗi)
  };

  /* ---------------------------------------------------------------- nạp ảnh */
  E.img = function (path) {
    if (!path) return null;
    var rec = E.images[path];
    if (rec) return rec;
    rec = E.images[path] = { img: new Image(), ok: false, fail: false, cbs: [] };
    rec.img.onload = function () { rec.ok = true; rec.cbs.splice(0).forEach(function (f) { f(true); }); };
    rec.img.onerror = function () { rec.fail = true; rec.cbs.splice(0).forEach(function (f) { f(false); }); };
    rec.img.src = path + (E.ver ? '?v=' + E.ver : '');
    return rec;
  };
  function whenLoaded(path) {
    return new Promise(function (res) {
      var r = E.img(path);
      if (!r) return res(false);
      if (r.ok) return res(true);
      if (r.fail) return res(false);
      r.cbs.push(res);
    });
  }
  E.sheet = function (key) { return (A.sheets && A.sheets[key]) || null; };
  E.hasSheet = function (key) { return !!E.sheet(key); };
  E.ensure = function (keys) {
    var ps = [];
    keys.forEach(function (k) { var s = E.sheet(k); if (s && s.img) ps.push(whenLoaded(s.img)); });
    return Promise.all(ps);
  };
  E.ensureTileset = function (name) {
    var t = A.tilesets && A.tilesets[name];
    return t && t.img ? whenLoaded(t.img) : Promise.resolve(false);
  };
  E.ensureIcons = function () { return A.icons && A.icons.img ? whenLoaded(A.icons.img) : Promise.resolve(false); };
  E.ensurePrefix = function (prefixes) {
    var keys = Object.keys(A.sheets || {}).filter(function (k) {
      return prefixes.some(function (p) { return k.indexOf(p) === 0; });
    });
    return E.ensure(keys);
  };

  E.init = function (canvas) {
    E.canvas = canvas; canvas.width = W; canvas.height = H;
    E.ctx = canvas.getContext('2d');
  };

  /* ------------------------------------------------------------- hình học iso */
  E.setGrid = function (g) {
    E.grid = g;
    // Kích thước ô lấy từ chính ô sàn của bộ ô (hình thoi 2:1), để các ô khớp khít nhau.
    var ts = A.tilesets && A.tilesets[g.tileset], tw = g.tileW || 64, th = g.tileH || 32, found = false;
    if (ts && ts.tiles) {
      for (var i = 0; i < 64 && !found; i++) {
        var r = ts.tiles[g.bg[i]];
        if (r && r[2] === r[3] * 2 && r[4] === r[2] / 2) { tw = r[2] * E.Z; th = r[3] * E.Z; found = true; }
      }
      if (!found) { var r16 = ts.tiles[16]; if (r16) { tw = r16[2] * E.Z; th = r16[3] * E.Z; } }
    }
    E.tw = tw; E.th = th;
  };
  E.project = function (x, y) { return [(x - y) * E.tw / 2, (x + y) * E.th / 2]; };
  E.camPx = function () {
    var p = E.project(E.cam.x, E.cam.y), s = E.shake > 0 ? E.shake : 0;
    return [Math.round(p[0] + (s ? (Math.random() - .5) * s : 0)), Math.round(p[1] + (s ? (Math.random() - .5) * s : 0))];
  };
  var camCache = [0, 0];
  E.toScreen = function (x, y) {
    var c = camCache;
    return [Math.round((x - y) * E.tw / 2 - c[0] + W / 2), Math.round((x + y) * E.th / 2 - c[1] + H / 2)];
  };
  E.toWorld = function (sx, sy) {   // màn hình -> toạ độ ô (số thực)
    var c = camCache;
    var wx = sx - W / 2 + c[0], wy = sy - H / 2 + c[1];
    var a = wx / (E.tw / 2), b = wy / (E.th / 2);
    return [(a + b) / 2, (b - a) / 2];
  };
  E.updateCam = function () { var c = E.camPx(); camCache[0] = c[0]; camCache[1] = c[1]; };

  // Flare: hướng 0 = Tây (màn hình), tăng theo chiều kim đồng hồ: 0 W,1 NW,2 N,3 NE,4 E,5 SE,6 S,7 SW
  var DIR_BY_K = { '0': 4, '1': 5, '2': 6, '3': 7, '4': 0, '-4': 0, '-1': 3, '-2': 2, '-3': 1 };
  E.dirFromScreen = function (vx, vy) {
    var k = Math.round(Math.atan2(vy, vx) / (Math.PI / 4));
    return DIR_BY_K[String(k)];
  };
  E.dirFromTiles = function (dx, dy) {
    return E.dirFromScreen((dx - dy) * E.tw / 2, (dx + dy) * E.th / 2);
  };

  /* ------------------------------------------------------- khung hình hoạt ảnh */
  E.frameIndex = function (anim, t) {
    var n = anim.frames || (anim.f ? anim.f.length : 1);
    if (n <= 1) return 0;
    var dur = anim.dur || 1000, type = anim.type || 'looped';
    if (t < 0) t = 0;
    if (type === 'play_once') return Math.min(n - 1, Math.floor(t / dur * n));
    if (type === 'back_forth') {
      var m = 2 * n - 2, k = Math.floor(t / dur * m) % m;
      return k < n ? k : m - k;
    }
    return Math.floor(t / dur * n) % n;
  };
  E.animOf = function (sheetKey, name) {
    var s = E.sheet(sheetKey); return s && s.anims ? s.anims[name] || null : null;
  };
  E.pickAnim = function (sheetKey, names) {
    var s = E.sheet(sheetKey); if (!s || !s.anims) return null;
    for (var i = 0; i < names.length; i++) if (s.anims[names[i]]) return names[i];
    return null;
  };
  E.rectOf = function (anim, t, dir) {
    var fr = anim.f && anim.f[E.frameIndex(anim, t)];
    if (!fr) return null;
    return fr[dir] || fr[dir % fr.length] || fr[0] || null;
  };

  /* Vẽ sprite tại (sx,sy) = chân nhân vật: góc trên-trái = (sx - ox, sy - oy). */
  E.drawSprite = function (sheetKey, animName, t, dir, sx, sy, alpha) {
    var s = E.sheet(sheetKey); if (!s) return false;
    var rec = E.img(s.img); if (!rec.ok) return false;
    var anim = s.anims && s.anims[animName]; if (!anim) return false;
    var r = E.rectOf(anim, t, dir); if (!r) return false;
    var c = E.ctx, Z = E.Z;
    if (alpha != null && alpha < 1) c.globalAlpha = alpha;
    c.drawImage(rec.img, r[0], r[1], r[2], r[3], Math.round(sx - r[4] * Z), Math.round(sy - r[5] * Z), Math.round(r[2] * Z), Math.round(r[3] * Z));
    if (alpha != null && alpha < 1) c.globalAlpha = 1;
    return true;
  };

  /* Nhân vật nhiều lớp: layers = { feet:'avatar.female.feet', ... }, thứ tự theo avatarLayers.order[dir]. */
  E.drawAvatar = function (layers, animName, t, dir, sx, sy, alpha) {
    var ord = A.avatarLayers && A.avatarLayers.order && (A.avatarLayers.order[dir] || A.avatarLayers.order[0]);
    if (!ord) ord = Object.keys(layers);
    var any = false;
    for (var i = 0; i < ord.length; i++) {
      var key = layers[ord[i]];
      if (key && E.drawSprite(key, animName, t, dir, sx, sy, alpha)) any = true;
    }
    return any;
  };

  /* Bóng + hình thay thế khi thiếu art (để game vẫn chơi được). */
  var DX = [-1, -1, 0, 1, 1, 1, 0, -1], DY = [0, -1, -1, -1, 0, 1, 1, 1];
  E.drawBlob = function (sx, sy, color, r, dir, label) {
    var c = E.ctx;
    c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(sx, sy, r * 1.1, r * .5, 0, 0, 7); c.fill();
    c.fillStyle = color; c.beginPath(); c.ellipse(sx, sy - r * 1.2, r * .7, r * 1.3, 0, 0, 7); c.fill();
    c.strokeStyle = '#000'; c.lineWidth = 1; c.stroke();
    if (dir != null) {
      c.strokeStyle = '#fff'; c.beginPath(); c.moveTo(sx, sy - r * 1.4);
      c.lineTo(sx + DX[dir] * r, sy - r * 1.4 + DY[dir] * r * .5); c.stroke();
    }
    if (label) { c.fillStyle = '#fff'; c.font = '10px sans-serif'; c.textAlign = 'center'; c.fillText(label, sx, sy - r * 2.9); }
  };

  /* ------------------------------------------------------------- vẽ thế giới */
  E.drawTile = function (ts, id, i, j) {
    var tr = ts.tiles[id]; if (!tr) return;
    var rec = E.images[ts.img]; if (!rec || !rec.ok) return;
    var p = E.toScreen(i + TILE_CENTER, j + TILE_CENTER), Z = E.Z;
    var dx = Math.round(p[0] - tr[4] * Z), dy = Math.round(p[1] - tr[5] * Z), dw = Math.round(tr[2] * Z), dh = Math.round(tr[3] * Z);
    if (dx > vR || dy > vB || dx + dw < vL || dy + dh < vT) return;
    E.ctx.drawImage(rec.img, tr[0], tr[1], tr[2], tr[3], dx, dy, dw, dh);
  };

  var bnd = [0, 0, 0, 0], vL = 0, vR = W, vT = 0, vB = H;   // khung nhìn (toạ độ màn hình, trước thu phóng)
  function visibleRange(g) {
    var cs = [E.toWorld(vL - 100, vT - 60), E.toWorld(vR + 100, vT - 60), E.toWorld(vL - 100, vB + 280), E.toWorld(vR + 100, vB + 280)];
    var i0 = 1e9, i1 = -1e9, j0 = 1e9, j1 = -1e9;
    for (var k = 0; k < 4; k++) {
      i0 = Math.min(i0, cs[k][0]); i1 = Math.max(i1, cs[k][0]);
      j0 = Math.min(j0, cs[k][1]); j1 = Math.max(j1, cs[k][1]);
    }
    bnd[0] = Math.max(0, Math.floor(i0) - 1); bnd[1] = Math.min(g.w - 1, Math.ceil(i1) + 1);
    bnd[2] = Math.max(0, Math.floor(j0) - 1); bnd[3] = Math.min(g.h - 1, Math.ceil(j1) + 1);
    return bnd;
  }

  /* drawables: [{ k: x+y, x, y, draw: function(sx, sy, d) }] */
  E.renderWorld = function (drawables) {
    var g = E.grid, c = E.ctx;
    E.updateCam();
    var V = E.view || 1;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    if (!g) return;
    c.setTransform(V, 0, 0, V, W / 2 * (1 - V), H / 2 * (1 - V));
    vL = W / 2 - W / 2 / V; vR = W / 2 + W / 2 / V; vT = H / 2 - H / 2 / V; vB = H / 2 + H / 2 / V;
    var ts = (A.tilesets && A.tilesets[g.tileset]) || null;
    var haveArt = !!(ts && E.images[ts.img] && E.images[ts.img].ok);
    var r = visibleRange(g), i0 = r[0], i1 = r[1], j0 = r[2], j1 = r[3];
    var i, j, id;
    for (j = j0; j <= j1; j++) for (i = i0; i <= i1; i++) {
      id = g.bg[j * g.w + i];
      if (haveArt) { if (id > 0) E.drawTile(ts, id, i, j); }
      else E.fallbackTile(i, j, g);
    }
    drawables.sort(function (a, b) { return a.k - b.k; });
    var dn = drawables.length, di = 0;
    function flush(limit) {
      while (di < dn && drawables[di].k < limit) {
        var d = drawables[di++], p = E.toScreen(d.x, d.y);
        if (p[0] > vL - 240 && p[0] < vR + 240 && p[1] > vT - 120 && p[1] < vB + 320) d.draw(p[0], p[1], d);
      }
    }
    for (var d = i0 + j0; d <= i1 + j1; d++) {
      flush(d + 1);
      var a0 = Math.max(i0, d - j1), a1 = Math.min(i1, d - j0);
      for (i = a0; i <= a1; i++) {
        j = d - i; id = g.obj[j * g.w + i];
        if (haveArt) { if (id > 0) E.drawTile(ts, id, i, j); }
        else if (g.col[j * g.w + i] === 1) E.fallbackWall(i, j);
      }
    }
    flush(1e9);
    c.setTransform(1, 0, 0, 1, 0, 0);
  };
  var FLOOR = ['#2c3a24', '#33422a'];
  E.fallbackTile = function (i, j, g) {
    var c = E.ctx, p = E.toScreen(i + TILE_CENTER, j + TILE_CENTER), hw = E.tw / 2, hh = E.th / 2;
    if (p[0] < -hw || p[0] > W + hw || p[1] < -hh || p[1] > H + hh) return;
    c.fillStyle = g.col[j * g.w + i] === 2 ? '#1b3a5c' : FLOOR[(i + j) & 1];
    c.beginPath(); c.moveTo(p[0], p[1] - hh); c.lineTo(p[0] + hw, p[1]); c.lineTo(p[0], p[1] + hh); c.lineTo(p[0] - hw, p[1]); c.closePath(); c.fill();
  };
  E.fallbackWall = function (i, j) {
    var c = E.ctx, p = E.toScreen(i + TILE_CENTER, j + TILE_CENTER), hw = E.tw / 2, hh = E.th / 2;
    if (p[0] < -hw || p[0] > W + hw || p[1] < -hh - 40 || p[1] > H + hh + 40) return;
    c.fillStyle = '#555';
    c.beginPath(); c.moveTo(p[0], p[1] - hh - 28); c.lineTo(p[0] + hw, p[1] - 28); c.lineTo(p[0], p[1] + hh - 28); c.lineTo(p[0] - hw, p[1] - 28); c.closePath(); c.fill();
    c.fillStyle = '#3a3a3a';
    c.beginPath(); c.moveTo(p[0] - hw, p[1] - 28); c.lineTo(p[0], p[1] + hh - 28); c.lineTo(p[0], p[1] + hh); c.lineTo(p[0] - hw, p[1]); c.closePath(); c.fill();
    c.fillStyle = '#2a2a2a';
    c.beginPath(); c.moveTo(p[0] + hw, p[1] - 28); c.lineTo(p[0], p[1] + hh - 28); c.lineTo(p[0], p[1] + hh); c.lineTo(p[0] + hw, p[1]); c.closePath(); c.fill();
  };

  /* Icon (kho icons: { img, cell, cols, count }) -> chuỗi style CSS cho phần tử DOM cỡ `size` px */
  E.iconStyle = function (idx, size) {
    var ic = A.icons; if (!ic || idx == null || idx < 0) return '';
    var cols = ic.cols || 1, cell = ic.cell || 32, k = size / cell;
    var rows = Math.ceil((ic.count || cols) / cols);
    return 'background-image:url(' + ic.img + (E.ver ? '?v=' + E.ver : '') + ');background-repeat:no-repeat;background-size:' + (cols * cell * k) + 'px ' + (rows * cell * k) + 'px;' +
      'background-position:-' + ((idx % cols) * size) + 'px -' + (Math.floor(idx / cols) * size) + 'px;';
  };

  /* ----------------------------------------------------------------- âm thanh */
  var audioOn = false, musicEl = null, musicKey = null, sfxPool = {};
  E.audioUnlock = function () {
    if (audioOn) return; audioOn = true;
    if (musicKey) { var k = musicKey; musicKey = null; E.music(k); }
  };
  E.sfxFind = function (subs) {
    var m = A.sfx || {}, keys = Object.keys(m);
    for (var s = 0; s < subs.length; s++) {
      if (m[subs[s]]) return subs[s];
      for (var i = 0; i < keys.length; i++) if (keys[i].indexOf(subs[s]) >= 0) return keys[i];
    }
    return null;
  };
  E.sfx = function (subs, vol) {
    if (!audioOn || E.muted) return;
    if (typeof subs === 'string') subs = [subs];
    var k = E.sfxFind(subs); if (!k) return;
    try {
      var pool = sfxPool[k] || (sfxPool[k] = []), a = null;
      for (var i = 0; i < pool.length; i++) if (pool[i].ended || pool[i].paused) { a = pool[i]; break; }
      if (!a) { if (pool.length > 4) return; a = new Audio(A.sfx[k]); pool.push(a); }
      a.volume = vol == null ? 0.6 : vol; a.currentTime = 0;
      var pr = a.play(); if (pr && pr.catch) pr.catch(function () {});
    } catch (e) {}
  };
  E.music = function (key) {
    if (key === musicKey) return;
    musicKey = key;
    if (!audioOn) return;
    try {
      if (musicEl) { musicEl.pause(); musicEl = null; }
      var src = A.music && A.music[key]; if (!src || E.muted) return;
      musicEl = new Audio(src); musicEl.loop = true; musicEl.volume = 0.35;
      var pr = musicEl.play(); if (pr && pr.catch) pr.catch(function () {});
    } catch (e) {}
  };
})();
