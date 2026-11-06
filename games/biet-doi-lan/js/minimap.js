// Bản đồ nhỏ kiểu R.E.P.O. (games/repo2d/game.js prerenderMinimap / drawMinimap), nhìn ngang: x ngang, y lên.
// Mỗi ô lưới ~0,75 m tô MỘT LẦN lúc dựng chuyến lặn (đá: viền sáng 150,170,200, ruột tối; nước: 34,46,64). Chỉ ô đã "thấy"
// (trong 9 m quanh Dave và đồng đội còn sống) mới hiện, ô mới lộ được ghi dần vào ảnh ngoài màn hình, không vẽ lại cả lưới.
// Bản đồ cao tới ~210 m nên không ép vừa khung: cửa sổ ~60 m cuộn theo Dave như minimap của REPO. Mờ 0,60 lúc rảnh, 0,16 khi Dave
// nằm dưới góc đó trên màn hình (luật REPO), có chuyển dần. Hệ đăng ký vào BDL.systems, nạp sau hud.js.
(function (HX) {
  'use strict';
  var BDL = window.BDL = window.BDL || {};
  var T = window.HX_TUNING;

  var CELL = 0.75;              // mét mỗi ô
  var SEE = 12;                 // bán kính lộ ô (m), cỡ nửa khung camera: thấy tới đâu, bản đồ mở tới đó
  var VIEW = 60;                // cửa sổ vuông 60 m (~4,6 tầng)
  var IDLE_ALPHA = 0.60, FADED_ALPHA = 0.16;   // như MINIMAP_IDLE_ALPHA / MINIMAP_FADED_ALPHA của REPO
  var EDGE = [150, 170, 200], ROCK = [58, 70, 92], WATER = [34, 46, 64];
  var BOAT_X_FALLBACK = -48.5;

  var S = null, css = null;

  function ensureCss() {
    if (css) return;
    css = document.createElement('style');
    css.id = 'minimap-css';
    css.textContent = [
      '#minimap { position: absolute; left: max(calc(14px * var(--hk, 1)), env(safe-area-inset-left)); top: calc(60px * var(--hk, 1));',
      '  width: min(calc(156px * var(--hk, 1)), 33vh); height: min(calc(156px * var(--hk, 1)), 33vh); box-sizing: border-box; pointer-events: none; opacity: .6;',
      '  background: rgba(8, 10, 13, .82); border: 1.5px solid rgba(90, 120, 170, .7); }',
      '#minimap canvas { display: block; width: 100%; height: 100%; }',
      'body:not([data-phase="dive"]) #minimap { display: none; }',
    ].join('\n');
    document.head.appendChild(css);
  }

  function pack(c) { return (255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0]; }   // ImageData little-endian RGBA

  // Lưới: 0 = không khí (trên mặt nước), 1 = nước, 2 = đá ruột, 3 = đá sát nước (viền sáng)
  function buildGrid(G) {
    var bx = T.view.boundX + 2, x0 = -bx, y1 = T.water.surfaceY + 2, y0 = G.floors[G.floors.length - 1].y1 - 2;
    var cols = Math.ceil((2 * bx) / CELL), rows = Math.ceil((y1 - y0) / CELL), W = G.world, surf = T.water.surfaceY;
    var cells = new Uint8Array(cols * rows), r, c;
    for (r = 0; r < rows; r++) {
      var wy = y1 - (r + 0.5) * CELL;
      for (c = 0; c < cols; c++) {
        var wx = x0 + (c + 0.5) * CELL;
        cells[r * cols + c] = wy > surf ? 0 : (W.solid(wx, wy) ? 2 : 1);
      }
    }
    for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) {
      var i = r * cols + c;
      if (cells[i] !== 2) continue;
      var n = (c > 0 && cells[i - 1] === 1) || (c < cols - 1 && cells[i + 1] === 1) || (r > 0 && cells[i - cols] === 1) || (r < rows - 1 && cells[i + cols] === 1);
      if (n) cells[i] = 3;
    }
    return { cells: cells, cols: cols, rows: rows, x0: x0, y1: y1, y0: y0 };
  }

  function colorOf(v) { return v === 3 ? pack(EDGE) : v === 2 ? pack(ROCK) : v === 1 ? pack(WATER) : 0; }

  // lộ ô trong bán kính SEE quanh (x, y); trả số ô mới lộ
  function reveal(x, y) {
    var g = S.g, rc = Math.ceil(SEE / CELL), cc = Math.floor((x - g.x0) / CELL), cr = Math.floor((g.y1 - y) / CELL), add = 0;
    for (var r = Math.max(0, cr - rc); r <= Math.min(g.rows - 1, cr + rc); r++) {
      for (var c = Math.max(0, cc - rc); c <= Math.min(g.cols - 1, cc + rc); c++) {
        var i = r * g.cols + c;
        if (S.seen[i]) continue;
        var dx = (c + 0.5) * CELL - (x - g.x0), dy = (r + 0.5) * CELL - (g.y1 - y);
        if (dx * dx + dy * dy > SEE * SEE) continue;
        S.seen[i] = 1; S.px[i] = S.base[i]; S.count++; add++;
      }
    }
    if (add) S.dirty = true;
    return add;
  }

  function resize() {
    var el = S.el, d = Math.min(2, window.devicePixelRatio || 1), w = Math.max(40, Math.round(el.clientWidth * d));
    if (S.cv.width !== w) { S.cv.width = w; S.cv.height = w; }
    S.k = w / VIEW;
  }

  function draw(G, cx, cy, fadeT) {
    var g = S.g, ctx = S.ctx, W = S.cv.width, k = S.k, half = VIEW / 2;
    ctx.clearRect(0, 0, W, W);
    ctx.imageSmoothingEnabled = false;
    // cửa sổ (m) -> mảnh nguồn của ảnh ô; mảnh ngoài lưới tự cắt
    var vx0 = cx - half, vy1 = cy + half;
    ctx.drawImage(S.seenCv, 0, 0, g.cols, g.rows, (g.x0 - vx0) * k, (vy1 - g.y1) * k, g.cols * CELL * k, g.rows * CELL * k);
    var ex = function (x) { return (x - vx0) * k; }, ey = function (y) { return (vy1 - y) * k; };
    // vạch ranh giới tầng + số tầng
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(160,190,230,.28)'; ctx.fillStyle = 'rgba(200,220,245,.6)';
    ctx.font = '700 ' + Math.max(8, Math.round(W * 0.06)) + 'px system-ui, sans-serif'; ctx.textBaseline = 'top';
    for (var f = 0; f < G.floors.length; f++) {
      var yy = Math.round(ey(G.floors[f].y0)) + 0.5;
      if (yy < -10 || yy > W + 10) continue;
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke();
      ctx.fillText(String(f + 1), 3, yy + 2);
    }
    var by = Math.round(ey(G.floors[G.floors.length - 1].y1)) + 0.5;
    if (by >= 0 && by <= W) { ctx.beginPath(); ctx.moveTo(0, by); ctx.lineTo(W, by); ctx.stroke(); }
    var R = Math.max(2, W * 0.022), i, p;
    // cano ở mặt nước (điểm giao đồ); ngoài cửa sổ thì mũi tên ▲ ở mép trên
    var bx = ex(S.boatX), bsy = ey(T.water.surfaceY);
    ctx.fillStyle = '#7ee0a0';
    if (bsy >= 0) {
      ctx.beginPath(); ctx.moveTo(bx - R * 1.8, bsy - R * 0.6); ctx.lineTo(bx + R * 1.8, bsy - R * 0.6); ctx.lineTo(bx + R * 1.1, bsy + R * 0.9); ctx.lineTo(bx - R * 1.1, bsy + R * 0.9); ctx.closePath(); ctx.fill();
    } else {
      var ax = Math.max(R * 2, Math.min(W - R * 2, bx));
      ctx.beginPath(); ctx.moveTo(ax, 1); ctx.lineTo(ax - R * 1.3, R * 2.2); ctx.lineTo(ax + R * 1.3, R * 2.2); ctx.closePath(); ctx.fill();
    }
    // đồ cổ đã lộ (bỏ cái đã lên boong / mất)
    var loot = G.loot || [];
    ctx.fillStyle = '#ffd24a';
    for (i = 0; i < loot.length; i++) {
      var l = loot[i];
      if (!l || l.state === 'onDeck' || l.state === 'gone' || !S.found[l.id == null ? i : l.id]) continue;
      ctx.beginPath(); ctx.arc(ex(l.pos.x), ey(l.pos.y), R * 0.7, 0, 6.2832); ctx.fill();
    }
    // đồng đội: chấm xanh ngọc, ngã thì dấu × xám
    var mates = G.mates || [];
    for (i = 0; i < mates.length; i++) {
      var m = mates[i];
      if (!m || m.state === 'deck' || m.state === 'board') continue;
      p = { x: ex(m.pos.x), y: ey(m.pos.y) };
      if (m.alive) { ctx.fillStyle = '#4fd1c5'; ctx.beginPath(); ctx.arc(p.x, p.y, R * 0.9, 0, 6.2832); ctx.fill(); }
      else cross(ctx, p.x, p.y, R, '#9aa0a6');
    }
    // Dave: chấm sáng viền đen; chết thì × đỏ
    var d = G.diver;
    p = { x: ex(d.pos.x), y: ey(d.pos.y) };
    S.dot = { x: p.x / W * S.el.clientWidth, y: p.y / W * S.el.clientHeight };
    if (d.state === 'dead') cross(ctx, p.x, p.y, R * 1.2, '#ff5a4f');
    else {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(1, R * 0.4);
      ctx.beginPath(); ctx.arc(p.x, p.y, R * 1.15, 0, 6.2832); ctx.stroke(); ctx.fill();
    }
  }
  function cross(ctx, x, y, r, col) {
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, r * 0.55);
    ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); ctx.stroke();
  }

  var system = {
    name: 'minimap',
    build: function (G, map) {
      if (S) system.teardown(G);
      ensureCss();
      var host = document.getElementById('hud');
      if (!host) return;
      var g = buildGrid(G), n = g.cols * g.rows, el = document.createElement('div'), cv = document.createElement('canvas');
      el.id = 'minimap'; el.appendChild(cv); host.appendChild(el);
      var base = new Uint32Array(n);
      for (var i = 0; i < n; i++) base[i] = colorOf(g.cells[i]);
      // ảnh ô đã vẽ sẵn một lần (đá/nước); ảnh "đã thấy" bắt đầu trống và nhận từng ô khi lộ
      var seenCv = document.createElement('canvas'); seenCv.width = g.cols; seenCv.height = g.rows;
      var px = new Uint32Array(n);
      S = { G: G, g: g, el: el, cv: cv, ctx: cv.getContext('2d'), base: base, px: px, seen: new Uint8Array(n), count: 0, seenCv: seenCv, sctx: seenCv.getContext('2d'),
        img: new ImageData(new Uint8ClampedArray(px.buffer), g.cols, g.rows), dirty: false, acc: 0, fade: 0, k: 1, found: {}, dot: { x: 0, y: 0 }, cw: 0,
        boatX: (window.BDL_DEBUG && BDL_DEBUG.ship && BDL_DEBUG.ship.measure && BDL_DEBUG.ship.measure.BOAT_X) || BOAT_X_FALLBACK };
      resize();
      system.update(0.1, null, true);
      if (window.BDL_DEBUG) window.BDL_DEBUG.minimap = {
        info: function () {
          if (!S) return { seen: 0, cells: 0, rect: null, daveDot: null };
          var r = S.el.getBoundingClientRect();
          return { seen: S.count, cells: S.g.cols * S.g.rows, rect: { x: r.x, y: r.y, width: r.width, height: r.height }, daveDot: { x: S.dot.x, y: S.dot.y }, alpha: +getComputedStyle(S.el).opacity };
        },
      };
    },
    update: function (dt, input, force) {
      if (!S) return;
      var G = S.G, d = G.diver;
      if (!d) return;
      if (S.el.clientWidth !== S.cw) { S.cw = S.el.clientWidth; resize(); }
      S.acc += dt;
      if (S.acc >= 0.1 || force) {
        S.acc = 0;
        if (d.state !== 'dead') reveal(d.pos.x, d.pos.y);
        var mates = G.mates || [], i;
        for (i = 0; i < mates.length; i++) if (mates[i] && mates[i].alive) reveal(mates[i].pos.x, mates[i].pos.y);
        // đồ cổ lọt vào bán kính lộ của ai đó thì được ghi nhớ
        var src = [d].concat(mates.filter(function (m) { return m && m.alive; })), loot = G.loot || [];
        for (i = 0; i < loot.length; i++) {
          var l = loot[i], key = l.id == null ? i : l.id;
          if (!l || S.found[key]) continue;
          for (var j = 0; j < src.length; j++) if (Math.hypot(src[j].pos.x - l.pos.x, src[j].pos.y - l.pos.y) <= SEE) { S.found[key] = true; break; }
        }
        if (S.dirty) { S.dirty = false; S.sctx.putImageData(S.img, 0, 0); }
      }
      // mờ khi Dave nằm dưới góc bản đồ trên màn hình
      var want = 0;
      if (G.gfx && d.state !== 'dead') {
        var s = G.gfx.worldToScreen(d.pos.x, d.pos.y), r = S.el.getBoundingClientRect(), m = 40;
        if (s.x > r.left - m && s.x < r.right + m && s.y > r.top - m && s.y < r.bottom + m) want = 1;
      }
      S.fade += (want - S.fade) * Math.min(1, dt * 8 + (force ? 1 : 0));
      S.el.style.opacity = (IDLE_ALPHA + (FADED_ALPHA - IDLE_ALPHA) * S.fade).toFixed(3);
      // cửa sổ đặt giữa Dave, kẹp trong lưới (lưới nhỏ hơn cửa sổ thì canh giữa)
      var g = S.g, half = VIEW / 2, gx1 = g.x0 + g.cols * CELL, gy0 = g.y1 - g.rows * CELL;
      var cx = gx1 - g.x0 <= VIEW ? (g.x0 + gx1) / 2 : Math.max(g.x0 + half, Math.min(gx1 - half, d.pos.x));
      var cy = g.y1 - gy0 <= VIEW ? (g.y1 + gy0) / 2 : Math.max(gy0 + half, Math.min(g.y1 - half, d.pos.y));
      draw(G, cx, cy);
    },
    teardown: function (G) {
      if (!S) return;
      if (S.el.parentNode) S.el.parentNode.removeChild(S.el);
      if (window.BDL_DEBUG && BDL_DEBUG.minimap) delete BDL_DEBUG.minimap;
      S = null;
    },
  };
  (BDL.systems = BDL.systems || []).push(system);
})(window.HX = window.HX || {});
