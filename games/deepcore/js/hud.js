/*
 * hud.js — mọi thứ vẽ ở TOẠ ĐỘ MÀN HÌNH: cần điều khiển, thanh máu, bản đồ nhỏ,
 * ô nhiệm vụ, băng cảnh báo, hàng linh thú.
 *
 * LUẬT BỐ CỤC: TIN Ở TRÊN, NÚT Ở DƯỚI-PHẢI. Không có ngoại lệ.
 *
 * Chơi dọc bằng một tay thì cả nửa dưới màn hình nằm dưới lòng bàn tay và ngón
 * cái. Bản trước để hàng linh thú, dòng mách nước và ô "gọi tiếp tế" ở dưới —
 * đúng chỗ bị che — nên người chơi không bao giờ thấy con nào sắp chết, và cái
 * ô tiếp tế thì vừa bị che vừa nằm tận trên cùng lúc còn ở thanh Nitra, xa
 * ngón tay. Giờ tách hẳn:
 *
 *   NỬA TRÊN = chỉ để ĐỌC   máu, cấp, đồng hồ, bản đồ nhỏ, nhiệm vụ, Nitra,
 *                            hàng linh thú, mách nước — không có gì bấm được
 *   GIỮA     = ĐE DOẠ       băng cảnh báo, hiếm khi hiện, hiện thì to
 *   DƯỚI-PHẢI= chỉ để BẤM   nút GỌI và nút TIẾP TẾ, ngay dưới ngón cái
 *   còn lại  = cần gạt       chạm chỗ nào cũng thành cần gạt tại chỗ đó
 *
 * Và một luật: MỌI THỨ NHỊP NHANH LÀ THANH HOẶC VÒNG, KHÔNG PHẢI SỐ. Số chỉ
 * dùng cho thứ đọc thong thả (chỉ tiêu nhiệm vụ, đồng hồ).
 */
(function (G) {
  'use strict';

  var T = 16;

  function Hud() {
    this.banners = [];
    this.note = null;
    this.mini = null;
    this.miniT = 0;
    this.alarmT = 0;
    this.dmgFlash = 0;
  }

  Hud.prototype.banner = function (text, col, time) {
    this.banners.push({ text: text, col: col || '#ffd24a', t: 0, life: time || 2.2 });
    if (this.banners.length > 3) this.banners.shift();
  };
  Hud.prototype.setNote = function (text) {
    this.note = { text: text, t: 0, life: 6 };
  };
  Hud.prototype.alarm = function () { this.alarmT = 1.4; };

  Hud.prototype.update = function (dt) {
    for (var i = this.banners.length - 1; i >= 0; i--) {
      this.banners[i].t += dt;
      if (this.banners[i].t >= this.banners[i].life) this.banners.splice(i, 1);
    }
    if (this.note) { this.note.t += dt; if (this.note.t > this.note.life) this.note = null; }
    if (this.alarmT > 0) this.alarmT -= dt;
    if (this.dmgFlash > 0) this.dmgFlash -= dt * 2.2;
    this.oreT = (this.oreT || 0) + dt;
    this.miniT += dt;
  };

  // ---------------------------------------------------------------- tiện ích vẽ

  function bar(c, x, y, w, h, k, colA, colB, label) {
    c.fillStyle = 'rgba(0,0,0,.62)';
    c.fillRect(x - 2, y - 2, w + 4, h + 4);
    c.fillStyle = '#1a1420';
    c.fillRect(x, y, w, h);
    var g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, colA); g.addColorStop(1, colB);
    c.fillStyle = g;
    c.fillRect(x, y, Math.max(0, Math.min(1, k)) * w, h);
    c.strokeStyle = 'rgba(255,255,255,.16)';
    c.lineWidth = 1;
    c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    if (label) {
      c.font = 'bold 9px ui-monospace, monospace';
      c.textAlign = 'left';
      c.fillStyle = 'rgba(0,0,0,.8)';
      c.fillText(label, x + 4, y + h - 3 + 1);
      c.fillStyle = '#fff';
      c.fillText(label, x + 3, y + h - 3);
    }
  }

  function panel(c, x, y, w, h, a) {
    c.fillStyle = 'rgba(10,8,14,' + (a === undefined ? 0.72 : a) + ')';
    c.fillRect(x, y, w, h);
    c.strokeStyle = 'rgba(120,96,160,.5)';
    c.lineWidth = 2;
    c.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }

  // ---------------------------------------------------------------- bản đồ nhỏ

  Hud.prototype.drawMini = function (c, g, x, y, size) {
    var w = g.world;
    // Vẽ lại bản đồ 5 lần/giây là đủ; mỗi khung vẽ 17k ô thì máy nào cũng chết.
    if (!this.mini || this.miniT > 0.2) {
      this.miniT = 0;
      if (!this.mini) {
        this.mini = document.createElement('canvas');
        this.mini.width = w.W; this.mini.height = w.H;
        this.miniG = this.mini.getContext('2d');
      }
      var mg = this.miniG;
      var img = mg.createImageData(w.W, w.H);
      var d = img.data;
      for (var i = 0; i < w.W * w.H; i++) {
        var o = i * 4;
        var k = w.kind[i];
        if (!w.seen[i]) {
          // chưa khám phá: chỉ lộ vỉa quặng NHIỆM VỤ, mờ
          if (k === G.TK.ORE && w.oreList[w.ore[i] - 1] === 'morkite') {
            d[o] = 30; d[o + 1] = 120; d[o + 2] = 104; d[o + 3] = 150;
          } else d[o + 3] = 0;
          continue;
        }
        d[o + 3] = 255;
        if (k === G.TK.FLOOR) { d[o] = 62; d[o + 1] = 54; d[o + 2] = 72; }
        else if (k === G.TK.ORE) {
          var od = G.ORE[w.oreList[w.ore[i] - 1]];
          var col = od ? od.col : '#fff';
          d[o] = parseInt(col.substr(1, 2), 16);
          d[o + 1] = parseInt(col.substr(3, 2), 16);
          d[o + 2] = parseInt(col.substr(5, 2), 16);
        } else if (k === G.TK.LIQ) { d[o] = 40; d[o + 1] = 90; d[o + 2] = 160; }
        else { d[o] = 26; d[o + 1] = 22; d[o + 2] = 32; }
      }
      mg.putImageData(img, 0, 0);
    }

    panel(c, x - 3, y - 3, size + 6, size + 6, 0.8);
    c.save();
    c.beginPath(); c.rect(x, y, size, size); c.clip();
    // Ống nhòm: cuộn theo người chơi thay vì thu cả bản đồ — thu hết thì ở tỉ lệ
    // này chẳng thấy gì.
    var zoom = 2.1;
    var cx = g.player.x / T, cy = g.player.y / T;
    var sx = cx - size / (2 * zoom), sy = cy - size / (2 * zoom);
    c.imageSmoothingEnabled = false;
    c.fillStyle = '#0a0810';
    c.fillRect(x, y, size, size);
    c.drawImage(this.mini, sx, sy, size / zoom, size / zoom, x, y, size, size);

    function put(wx, wy, col, r, ring) {
      var px = x + (wx / T - sx) * zoom, py = y + (wy / T - sy) * zoom;
      if (px < x - 4 || py < y - 4 || px > x + size + 4 || py > y + size + 4) return;
      c.fillStyle = col;
      c.beginPath(); c.arc(px, py, r, 0, 6.2832); c.fill();
      if (ring) { c.strokeStyle = col; c.lineWidth = 1; c.beginPath(); c.arc(px, py, r + 2.5, 0, 6.2832); c.stroke(); }
    }
    // mốc nhiệm vụ
    for (var m = 0; m < g.mission.points.length; m++) {
      var pt = g.mission.points[m];
      if (!pt.done) put(pt.x, pt.y, '#ffd24a', 2.6, true);
    }
    /* Dấu hốc kín. Chỉ hiện khi hốc nằm trong 11 ô quanh người chơi — đủ gần
     * để "có cái gì đó dưới kia" thành một lời mời cụ thể, đủ xa để không biến
     * cả bản đồ thành một danh sách việc phải làm. Không có dấu này thì hốc
     * chôn trong đá là phần thưởng không ai biết mà tìm, và việc đục vào lòng
     * khối đá lại quay về chỗ vô nghĩa như cũ. */
    var cl = g.world.caches || [];
    var ptx = g.player.tileX(), pty = g.player.tileY();
    for (var ci = 0; ci < cl.length; ci++) {
      var cc = cl[ci];
      if (cc.taken) continue;
      if (Math.abs(cc.tx - ptx) > 11 || Math.abs(cc.ty - pty) > 11) continue;
      c.globalAlpha = 0.5 + 0.4 * Math.sin(performance.now() / 300 + ci);
      put(cc.x, cc.y, '#ffd98a', 2.4, true);
      c.globalAlpha = 1;
    }
    // cửa thoát
    if (g.exit) put(g.exit.x, g.exit.y, g.escaping ? '#7dff9a' : '#6a8a7a', 3, g.escaping);
    // boss
    if (g.boss && !g.boss.dead) put(g.boss.x, g.boss.y, '#ff4a4a', 3.4, true);
    for (var e = 0; e < g.enemies.length; e++) {
      var en = g.enemies[e];
      if (en.dead || en.harmless) continue;
      put(en.x, en.y, en.elite ? '#b06aff' : '#c8404a', en.elite ? 2.2 : 1.4);
    }
    put(g.player.x, g.player.y, '#ffffff', 2.4, true);
    c.restore();

    c.strokeStyle = 'rgba(180,150,220,.6)';
    c.lineWidth = 2;
    c.strokeRect(x - 1, y - 1, size + 2, size + 2);
  };

  // ---------------------------------------------------------------- toàn cảnh

  Hud.prototype.draw = function (c, g, W, H) {
    var p = g.player, pad = 10;
    var top = pad + (g.safeTop || 0);

    // ---- viền đỏ khi trúng đòn: đọc nhanh hơn bất kỳ con số nào
    if (this.dmgFlash > 0) {
      var gr = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28,
                                      W / 2, H / 2, Math.max(W, H) * 0.62);
      gr.addColorStop(0, 'rgba(200,20,20,0)');
      gr.addColorStop(1, 'rgba(200,20,20,' + (this.dmgFlash * 0.5) + ')');
      c.fillStyle = gr;
      c.fillRect(0, 0, W, H);
    }
    // ---- báo động: viền vàng nhấp nháy
    if (this.alarmT > 0) {
      c.strokeStyle = 'rgba(255,180,60,' + (0.25 + 0.35 * Math.abs(Math.sin(this.alarmT * 12))) + ')';
      c.lineWidth = 6;
      c.strokeRect(3, 3, W - 6, H - 6);
    }

    // ---- TRÊN-TRÁI: bản thân
    /* Không còn thanh kinh nghiệm và không còn chữ "Cấp N": trong ván đã bỏ
     * hẳn cấp độ. Chỗ trống dành cho thanh máu to hơn — thứ duy nhất ở góc này
     * mà người chơi thật sự phải liếc giữa lúc đánh nhau. Bên dưới là số HỐC
     * KÍN đã tìm được, vì đó mới là đường sức mạnh của ván bây giờ. */
    var bw = Math.min(170, W * 0.46);
    bar(c, pad, top, bw, 17, p.hp / p.st.hp, '#ff6a5a', '#a02030',
        Math.ceil(p.hp) + ' / ' + Math.round(p.st.hp));
    // Thanh mốc quặng: đầy thì bầy mạnh lên một nấc. Đây là thứ thay chỗ thanh
    // kinh nghiệm cũ, nhưng nó đo đúng cái người chơi đang làm — đục đá.
    var per = 16;
    var k = ((g.run.oreMined || 0) % per) / per;
    bar(c, pad, top + 21, bw, 6, k, '#7dff9a', '#2a8a4a');
    var cs = g.world.caches || [];
    var got = 0;
    for (var ci = 0; ci < cs.length; ci++) if (cs[ci].taken) got++;
    c.font = 'bold 11px ui-monospace, monospace';
    c.textAlign = 'left';
    c.fillStyle = got ? '#ffd98a' : '#8a7f9c';
    c.fillText('Hốc kín ' + got + '/' + cs.length, pad, top + 40);

    // ---- TRÊN-PHẢI: bản đồ nhỏ + đồng hồ
    var ms = Math.min(112, W * 0.30);
    this.drawMini(c, g, W - pad - ms, top, ms);
    var left = Math.max(0, (g.dir.phase === 'escape' ? g.dir.escapeT : G.RUN_TIME - g.dir.t));
    var mm = (left / 60) | 0, ss = (left % 60) | 0;
    c.font = 'bold 15px ui-monospace, monospace';
    c.textAlign = 'right';
    var tcol = g.dir.phase === 'escape' ? (left < 15 ? '#ff5a4a' : '#ffd24a') : '#cfc3dd';
    c.fillStyle = 'rgba(0,0,0,.7)';
    c.fillText(mm + ':' + (ss < 10 ? '0' : '') + ss, W - pad + 1, top + ms + 19);
    c.fillStyle = tcol;
    c.fillText(mm + ':' + (ss < 10 ? '0' : '') + ss, W - pad, top + ms + 18);

    // ---- ô NHIỆM VỤ: to, rõ, luôn hiện. Người chơi phải biết mình đang làm gì
    // mà không cần mở menu — DRG in mục tiêu ngay trên HUD vì đúng lý do đó.
    this.drawQuest(c, g, pad, top + 46, W - pad * 2 - ms - 8);

    // ---- hàng linh thú: NGAY DƯỚI KHỐI TIN, không phải dưới đáy màn hình.
    // Đây là thứ phải liếc thấy giữa lúc đánh nhau; để dưới đáy thì bàn tay che
    // mất và người chơi chỉ biết linh thú chết khi nó đã chết rồi.
    var petY = Math.max(top + ms + 26, top + 136);
    this.drawPets(c, g, W, petY);

    // ---- GIỮA-TRÊN: băng cảnh báo
    this.drawBanners(c, W, H * 0.30);

    // ---- mũi tên chỉ mục tiêu: chạy thoát thì chỉ khoang, còn lại chỉ mốc
    // nhiệm vụ gần nhất. Không có nó thì trên màn dọc người chơi đi lạc cả ván.
    if (g.escaping && g.exit) this.drawArrow(c, g, W, H, g.exit, '#7dff9a');
    else {
      var tgt = this.questTarget(g);
      if (tgt) this.drawArrow(c, g, W, H, tgt, '#ffd24a');
    }

    // ---- cần gạt + nút GỌI
    this.drawStick(c, g);
    this.drawRally(c, g, W, H);

    // ---- mách nước
    if (this.note) {
      var a = Math.min(1, Math.min(this.note.t, this.note.life - this.note.t) * 2.5);
      c.globalAlpha = a;
      c.font = 'bold 11px ui-monospace, monospace';
      c.textAlign = 'center';
      var ty = petY + 52;
      var tw = c.measureText(this.note.text).width + 20;
      panel(c, W / 2 - tw / 2, ty - 14, tw, 22, 0.72);
      c.fillStyle = '#d8ccec';
      c.fillText(this.note.text, W / 2, ty);
      c.globalAlpha = 1;
    }
  };

  Hud.prototype.drawQuest = function (c, g, x, y, w) {
    var m = g.mission;
    var h = 40;
    panel(c, x, y, w, h, 0.74);
    c.textAlign = 'left';
    c.font = 'bold 10px ui-monospace, monospace';
    c.fillStyle = m.done ? '#7dff9a' : '#ffd24a';
    c.fillText(m.type.name, x + 8, y + 14);
    c.font = 'bold 12px ui-monospace, monospace';
    c.fillStyle = '#fff3d8';
    var txt = m.done ? 'XONG — CHẠY VỀ KHOANG' : m.type.short(m.need);
    c.fillText(txt, x + 8, y + 29);
    if (!m.done) {
      c.textAlign = 'right';
      c.font = 'bold 15px ui-monospace, monospace';
      c.fillStyle = '#fff';
      c.fillText(m.have + '/' + m.need, x + w - 8, y + 27);
      bar(c, x + 8, y + h - 7, w - 16, 3, m.have / m.need, '#ffd24a', '#a06a10');
    }
    // nhiệm vụ phụ: Nitra -> tiếp tế
    var n = g.player.carry.nitra || 0;
    var need = G.SUPPLY_COST;
    var y2 = y + h + 4;
    panel(c, x, y2, w, 20, 0.62);
    c.textAlign = 'left';
    c.font = 'bold 10px ui-monospace, monospace';
    c.fillStyle = n >= need ? '#7dff9a' : '#c8a070';
    c.fillText('NITRA ' + Math.min(n, need) + '/' + need +
               (n >= need ? '  — ĐỦ RỒI, BẤM NÚT TIẾP TẾ' : '  → tiếp tế'), x + 8, y2 + 14);
    bar(c, x + 8, y2 + 17, w - 16, 2, n / need, '#7dff9a', '#2a8a4a');
    // Chỉ để ĐỌC. Nút bấm nằm dưới-phải cùng nút GỌI — xem drawRally().
    this.supplyReady = n >= need;
  };

  Hud.prototype.drawBanners = function (c, W, y) {
    c.textAlign = 'center';
    for (var i = 0; i < this.banners.length; i++) {
      var b = this.banners[i];
      var k = b.t / b.life;
      var a = Math.min(1, Math.min(b.t * 5, (1 - k) * 4));
      var yy = y + i * 30 - (1 - Math.min(1, b.t * 6)) * 14;
      c.globalAlpha = a;
      c.font = 'bold 17px ui-monospace, monospace';
      var tw = c.measureText(b.text).width;
      c.fillStyle = 'rgba(8,6,12,.82)';
      c.fillRect(W / 2 - tw / 2 - 14, yy - 17, tw + 28, 26);
      c.fillStyle = b.col;
      c.fillRect(W / 2 - tw / 2 - 14, yy - 17, 3, 26);
      c.fillRect(W / 2 + tw / 2 + 11, yy - 17, 3, 26);
      c.fillText(b.text, W / 2, yy);
      c.globalAlpha = 1;
    }
  };

  /* Hàng linh thú: ảnh + thanh máu + bậc. Đủ để biết con nào sắp chết mà về gọi,
   * không đủ để rối. */
  Hud.prototype.drawPets = function (c, g, W, y) {
    var list = g.pets;
    if (!list.length) return;
    var n = Math.min(list.length, 6);
    var cw = 34, gap = 4;
    var tot = n * cw + (n - 1) * gap;
    var x0 = W / 2 - tot / 2;
    for (var i = 0; i < n; i++) {
      var p = list[i];
      var x = x0 + i * (cw + gap);
      panel(c, x, y, cw, 30, p.visible ? 0.7 : 0.4);
      var key = G.Atlas.pick(p.def.art + '.idle', p.def.art + '.move');
      if (key) {
        var sz = G.Atlas.size(key, 0);
        var s = Math.min(1, 18 / Math.max(sz[0], sz[1]));
        G.Atlas.draw(c, key, 0, x + cw / 2, y + 22, { scale: s, alpha: p.visible ? 1 : 0.5 });
      }
      bar(c, x + 3, y + 24, cw - 6, 3, p.hp / p.hpMax, '#7dff9a', '#2a8a4a');
      c.font = 'bold 8px ui-monospace, monospace';
      c.textAlign = 'right';
      c.fillStyle = '#ffd98a';
      c.fillText('b' + p.tier, x + cw - 3, y + 9);
    }
  };

  /* Mũi tên bám mép màn hình, chỉ về phía khoang thoát, kèm số ô còn lại.
   * Bản đồ nhỏ đã có chấm xanh, nhưng lúc hoảng thì không ai nhìn bản đồ —
   * cần một thứ nằm ngay giữa tầm mắt. */
  /* Mốc nhiệm vụ gần nhất. Với nhiệm vụ đào thì đó là vỉa Morkite gần nhất —
   * tìm trong bán kính rộng, nhưng chỉ chỉ đường khi ở khá xa, để không có mũi
   * tên lơ lửng ngay trước mặt suốt ván. */
  Hud.prototype.questTarget = function (g) {
    var m = g.mission, p = g.player, i;
    if (m.done) return null;
    var best = null, bd = 1e9;
    for (i = 0; i < m.points.length; i++) {
      var pt = m.points[i];
      if (pt.done) continue;
      var d = Math.hypot(pt.x - p.x, pt.y - p.y);
      if (d < bd) { bd = d; best = pt; }
    }
    if (best) return bd > 90 ? best : null;
    if (m.type.id !== 'mine') return null;
    // vỉa Morkite gần nhất — tính lại 3 lần/giây thôi, quét cả bản đồ không rẻ
    if (!this.oreT || this.oreT > 0.33) {
      this.oreT = 0;
      var w = g.world, tx = p.tileX(), ty = p.tileY(), b2 = null, bd2 = 1e9;
      for (var y = 0; y < w.H; y += 1) {
        for (var x = 0; x < w.W; x += 1) {
          var id = w.idx(x, y);
          if (w.kind[id] !== G.TK.ORE) continue;
          if (w.oreList[w.ore[id] - 1] !== 'morkite') continue;
          var dd = (x - tx) * (x - tx) + (y - ty) * (y - ty);
          if (dd < bd2) { bd2 = dd; b2 = { x: x * T + 8, y: y * T + 8 }; }
        }
      }
      this.oreHint = b2;
    }
    if (!this.oreHint) return null;
    return Math.hypot(this.oreHint.x - p.x, this.oreHint.y - p.y) > 110
      ? this.oreHint : null;
  };

  Hud.prototype.drawArrow = function (c, g, W, H, goal, col) {
    var dx = goal.x - g.player.x, dy = goal.y - g.player.y;
    var d = Math.hypot(dx, dy);
    var a = Math.atan2(dy, dx);
    var cx = W / 2, cy = H * 0.52;
    var rad = Math.min(W, H) * 0.30;
    var x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
    c.save();
    c.translate(x, y);
    c.rotate(a);
    var pulse = 0.7 + 0.3 * Math.sin(performance.now() / 160);
    c.globalAlpha = pulse;
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(16, 0); c.lineTo(-10, -11); c.lineTo(-5, 0); c.lineTo(-10, 11);
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,.7)'; c.lineWidth = 2; c.stroke();
    c.restore();
    c.save();
    c.font = 'bold 12px ui-monospace, monospace';
    c.textAlign = 'center';
    c.fillStyle = 'rgba(0,0,0,.8)';
    c.fillText(Math.round(d / 16) + ' ô', x + 1, y + 27);
    c.fillStyle = col;
    c.fillText(Math.round(d / 16) + ' ô', x, y + 26);
    c.restore();
  };

  Hud.prototype.drawStick = function (c, g) {
    var s = g.input.stick;
    if (!s.active) return;
    c.save();
    c.globalAlpha = 0.34;
    c.strokeStyle = '#fff';
    c.lineWidth = 3;
    c.beginPath(); c.arc(s.ox, s.oy, s.R, 0, 6.2832); c.stroke();
    c.globalAlpha = 0.55;
    c.fillStyle = '#ffd98a';
    c.beginPath(); c.arc(s.ox + s.dx * s.R, s.oy + s.dy * s.R, 17, 0, 6.2832); c.fill();
    c.restore();
  };

  /* Nút GỌI — nút DUY NHẤT trong ván. Gom linh thú về, hồi cho chúng, và tăng
   * sát thương 2 giây. Một nút thì người chơi không phải học gì, mà vẫn có một
   * quyết định thật để đưa ra. */
  /* Hai nút duy nhất của màn chơi, xếp dọc ở góc dưới-phải — vùng ngón cái
   * phải với tới được. Mọi thứ CHỈ ĐỂ ĐỌC đã dời hết lên nửa trên. */
  Hud.prototype.drawRally = function (c, g, W, H) {
    var r = 34;
    var x = W - r - 22, y = H - (g.safeBot || 0) - r - 30;
    this.rallyBox = { x: x, y: y, r: r + 8 };

    // ---- nút TIẾP TẾ, nằm ngay trên nút GỌI, chỉ hiện khi đủ Nitra
    var sr = 27, sy = y - r - sr - 14;
    this.supplyBox = { x: x, y: sy, r: sr + 8, ready: !!this.supplyReady };
    if (this.supplyReady) {
      c.save();
      var pulse = 0.5 + 0.5 * Math.sin(performance.now() / 240);
      c.fillStyle = 'rgba(10,8,14,.78)';
      c.beginPath(); c.arc(x, sy, sr, 0, 6.2832); c.fill();
      c.strokeStyle = '#7dff9a';
      c.lineWidth = 3;
      c.globalAlpha = 0.6 + 0.4 * pulse;
      c.beginPath(); c.arc(x, sy, sr, 0, 6.2832); c.stroke();
      c.globalAlpha = 1;
      c.font = 'bold 10px ui-monospace, monospace';
      c.textAlign = 'center';
      c.fillStyle = '#bfffd0';
      c.fillText('TIẾP', x, sy - 1);
      c.fillText('TẾ', x, sy + 10);
      c.restore();
    }

    var k = 1 - Math.max(0, g.run.rallyCd) / g.run.st.rallyCd;
    c.save();
    c.fillStyle = 'rgba(10,8,14,.72)';
    c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill();
    c.strokeStyle = k >= 1 ? '#ffd98a' : '#4a3a63';
    c.lineWidth = 3;
    c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.stroke();
    if (k < 1) {
      c.strokeStyle = '#8a7ab0';
      c.lineWidth = 4;
      c.beginPath(); c.arc(x, y, r - 3, -Math.PI / 2, -Math.PI / 2 + k * 6.2832); c.stroke();
    } else {
      c.globalAlpha = 0.35 + 0.25 * Math.sin(performance.now() / 260);
      c.fillStyle = '#ffd98a';
      c.beginPath(); c.arc(x, y, r - 4, 0, 6.2832); c.fill();
      c.globalAlpha = 1;
    }
    c.font = 'bold 14px ui-monospace, monospace';
    c.textAlign = 'center';
    c.fillStyle = k >= 1 ? '#fff' : '#8a7ab0';
    c.fillText('GỌI', x, y + 5);
    c.restore();
  };

  G.Hud = Hud;
  G.hudPanel = panel;
  G.hudBar = bar;
})(window.DC = window.DC || {});
