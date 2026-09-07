/*
 * player.js — người thợ.
 *
 * Người chơi KHÔNG TỰ ĐÁNH. Toàn bộ sát thương đến từ linh thú mang theo
 * (xem pets.js). Việc của người chơi chỉ có ba: ĐI, ĐÀO, và ĐỨNG ĐÚNG CHỖ.
 * Đó là lý do phần này không có một dòng nào về vũ khí.
 *
 * Nhân vật ghép LỚP đúng kiểu Core Keeper: da → quần → áo → mắt → tóc → mũ.
 * Mọi lớp dùng chung một tấm 234x156, cùng một bảng 39 khung, nên "đội mũ vào
 * thì thấy cái mũ" là chuyện miễn phí: chỉ là vẽ thêm một lớp nữa.
 */
(function (G) {
  'use strict';

  var T = 16;

  // Bảng khung của tấm nhân vật (đã dò từ rect của Unity, xem _tools/).
  var F = {
    idleDown: [0, 1, 2],
    walkDown: [3, 4, 5, 6, 7, 8],
    walkSide: [9, 10, 11, 12, 13, 14],
    walkUp: [15, 16, 17, 18, 19, 20]
  };

  function Player() {}
  G.extendActor(Player);

  Player.prototype.init = function (x, y, stats, look) {
    this.initActor(x, y, { r: 5, hp: stats.hp, speed: stats.speed, shadow: true });
    this.st = stats;
    this.look = look || {};
    this.invuln = 0;
    this.mineT = 0;             // đồng hồ vung cuốc
    this.mineTile = null;       // ô đang đục {x,y}
    this.swing = 0;             // 0..1 pha vung cuốc, để vẽ
    this.walkT = 0;
    this.moving = false;
    this.xp = 0; this.level = 1;
    this.xpNeed = 22;
    this.carry = {};            // quặng đã đào trong ván
    this.lightR = stats.light;
    this.lightPulse = 0;
    return this;
  };

  Player.prototype.gainXp = function (n) {
    this.xp += n;
    var ups = 0;
    while (this.xp >= this.xpNeed) {
      this.xp -= this.xpNeed;
      this.level++;
      // Đường cong TUYẾN TÍNH, không phải bậc hai. Đo trong một ván 10 phút:
      // đào ~250 ô tường + ~60 vỉa quặng + ~150 con quái ra tổng cỡ 1200 điểm.
      // Với 18 + 6·cấp thì cộng dồn tới cấp 16 là ~1000 — vừa khớp. Dùng bậc hai
      // như bản đầu thì tới cấp 15 phải cần gần 3000 điểm, tức là cả ván chỉ lên
      // được 6-7 cấp và người chơi không bao giờ dựng nổi đội hình.
      this.xpNeed = Math.round(18 + this.level * 6);
      ups++;
    }
    return ups;
  };

  Player.prototype.addOre = function (name, n) {
    this.carry[name] = (this.carry[name] || 0) + (n || 1);
  };

  /* dir = {x, y} đã chuẩn hoá từ cần điều khiển (0..1). */
  Player.prototype.update = function (dt, w, dir, fx) {
    this.stepCommon(dt);
    if (this.dead) return;

    var sp = this.st.speed * (1 - this.slow * 0.55);
    var mag = Math.hypot(dir.x, dir.y);
    this.moving = mag > 0.12;

    if (this.moving) {
      this.faceFrom(dir.x, dir.y);
      this.walkT += dt;
      var mv = Math.min(1, mag);
      this.move(w, dir.x * sp * mv * dt, dir.y * sp * mv * dt);
    }
    this.applyKnock(w, dt);

    // Chất lỏng dưới chân: nước thì chậm, nham thì chậm và đau.
    var tk = w.at(this.tileX(), this.tileY());
    if (tk === G.TK.LIQ) {
      var lava = w.ore[w.idx(this.tileX(), this.tileY())] === 254;
      this.slow = Math.max(this.slow, lava ? 0.55 : 0.4);
      if (lava) {
        this.lavaT = (this.lavaT || 0) + dt;
        if (this.lavaT > 0.5) {
          this.lavaT = 0;
          this.hurt(4, this.x, this.y + 8, 0);
          fx.text(this.x, this.y - 20, '-4', '#ff7a3c');
          fx.screenFlash('#ff5a20', 0.22);
        }
      }
    }

    this.mine(dt, w, dir, fx);

    // Đèn thở nhẹ. Ánh sáng bất động trông như một hình tròn dán lên màn hình;
    // cho nó nhấp nháy khẽ thì mới ra ngọn đèn.
    this.lightPulse += dt;
    this.lightR = this.st.light * (1 + Math.sin(this.lightPulse * 2.3) * 0.025);
  };

  /* ĐÀO: không có nút. Đẩy cần điều khiển vào vách là đục — đúng kiểu
   * DRG:Survivor (tự đào khi đứng sát) nhưng bám theo HƯỚNG ĐẨY nên người chơi
   * vẫn chủ động chọn đục ô nào. */
  Player.prototype.mine = function (dt, w, dir, fx) {
    var mag = Math.hypot(dir.x, dir.y);
    if (mag < 0.25) { this.mineTile = null; this.swing = 0; return; }

    var dx = dir.x / mag, dy = dir.y / mag;
    var probe = this.r + 5;
    var tx = ((this.x + dx * probe) / T) | 0;
    var ty = ((this.y + dy * probe) / T) | 0;

    if (!w.diggable(tx, ty)) {
      // thử trục trội, tránh chuyện đứng chéo thì không đục được gì
      tx = ((this.x + (Math.abs(dx) > Math.abs(dy) ? Math.sign(dx) * probe : 0)) / T) | 0;
      ty = ((this.y + (Math.abs(dy) >= Math.abs(dx) ? Math.sign(dy) * probe : 0)) / T) | 0;
      if (!w.diggable(tx, ty)) { this.mineTile = null; this.swing = 0; return; }
    }

    var id = w.idx(tx, ty);
    var isOre = w.kind[id] === G.TK.ORE;
    var oreName = isOre ? w.oreList[w.ore[id] - 1] : null;
    var oreDef = oreName ? G.ORE[oreName] : null;

    // Cuốc yếu thì đá cứng đục rất chậm chứ không phải không đục được — chặn
    // cứng thì người chơi kẹt và không hiểu vì sao; chậm thì hiểu ngay.
    var tierGap = (oreDef && oreDef.hp > 2.4 ? 2 : 1) - this.st.pickTier;
    var pen = tierGap > 0 ? Math.pow(0.42, tierGap) : 1;

    this.mineTile = { x: tx, y: ty };
    this.mineT += dt;
    var rate = 1 / this.st.mineRate;     // giây mỗi nhát
    this.swing = (this.mineT % rate) / rate;

    if (this.mineT >= rate) {
      this.mineT = 0;
      var res = w.dig(tx, ty, this.st.minePower * pen);
      this.pendingXp = (this.pendingXp || 0) + 0.35 * this.st.xpMul;   // mỗi nhát cuốc
      var cx = tx * T + 8, cy = ty * T + 8;
      fx.burst(cx - dx * 5, cy - dy * 5, 4,
        { col: oreDef ? oreDef.col : '#8a7360', spd: 55, life: 0.35, r: 1.6 });
      if (res) {
        fx.burst(cx, cy, 12, { col: oreDef ? oreDef.col : '#7a6350',
                               spd: 95, life: 0.5, r: 2, prio: 1 });
        fx.ring(cx, cy, 3, 16, oreDef ? oreDef.col : '#aa9a88', 0.28);
        this.onBreak(res, oreDef, fx, cx, cy);
      }
    }
  };

  Player.prototype.onBreak = function (res, oreDef, fx, cx, cy) {
    // Đục vỡ một ô ĐÁ THƯỜNG cũng cho kinh nghiệm. Không cho thì cái động từ
    // trung tâm của game — đào — lại không nuôi tiến bộ, và người chơi cấp 1
    // đứng đào cả phút vẫn cấp 1 rồi chết vì chưa kịp gọi linh thú nào.
    if (!res.ore) {
      this.pendingXp = (this.pendingXp || 0) + 1.2 * this.st.xpMul;
      return;
    }
    this.addOre(res.ore, 1);
    var xp = oreDef.xp * this.st.xpMul;
    this.pendingXp = (this.pendingXp || 0) + xp;
    // Báo cho nhiệm vụ. Không có dòng này thì chỉ tiêu Morkite chỉ nhích khi
    // LINH THÚ đào hộ — người chơi tự tay đào cả ván mà bảng vẫn 0/18. Lỗi này
    // ẩn được lâu vì bản chạy thử nào có con Gấu Nước trong đội thì vẫn xong.
    if (this.onOreBroken) this.onOreBroken(res.ore);
    fx.text(cx, cy - 6, '+' + oreDef.name, oreDef.col);
    if (res.ore === 'redsugar') {
      // Đường Đỏ của DRG: cuốc vào là hồi máu ngay tại chỗ, không vào túi.
      // Một động từ (đào) phục vụ hai hệ thống (kinh tế + sinh tồn).
      var heal = Math.min(this.st.hp - this.hp, 12 + this.st.hp * 0.09);
      if (heal > 0) {
        this.hp += heal;
        fx.text(this.x, this.y - 26, '+' + Math.round(heal), '#7dff9a');
        fx.ring(this.x, this.y, 4, 22, '#7dff9a', 0.32);
      }
    }
  };

  Player.prototype.hurt = function (dmg, sx, sy, kb) {
    if (this.invuln > 0 || this.dead) return 0;
    var d = Math.max(1, Math.round(dmg * (1 - this.st.armor)));
    this.hp -= d;
    this.flash = 0.14;
    this.invuln = 0.62;
    if (kb && sx !== undefined) {
      var a = Math.atan2(this.y - sy, this.x - sx);
      this.kbx += Math.cos(a) * kb; this.kby += Math.sin(a) * kb;
    }
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
    return d;
  };

  // ---------------------------------------------------------------- vẽ

  Player.prototype.frameIndex = function () {
    if (!this.moving) {
      if (this.face === 0) return F.idleDown[(this.animT * 4) % 3 | 0];
      if (this.face === 2) return F.walkUp[0];
      return F.walkSide[0];
    }
    var i = (this.walkT * 9) % 6 | 0;
    if (this.face === 0) return F.walkDown[i];
    if (this.face === 2) return F.walkUp[i];
    return F.walkSide[i];
  };

  /* Thứ tự lớp — đổi thứ tự là hỏng hình, mũ chui xuống dưới tóc. */
  Player.prototype.layers = function () {
    var L = this.look, e = this.st.eq || {};
    var out = [];
    var body = L.female ? 'f_' : '';
    out.push('pc.' + body + 'skin');
    out.push(e.pants ? 'pc.pants.' + e.pants : 'pc.pants');
    out.push(e.chest ? 'pc.chest.' + e.chest : 'pc.' + body + 'shirt');
    out.push('pc.' + body + 'eyes');
    // Có mũ thì tóc phải dùng bản "bẹp dưới mũ", nếu không tóc đâm xuyên mũ.
    out.push((e.helm ? 'pc.hairhelm.' : 'pc.hair.') + (L.hair || '1'));
    if (e.helm) out.push('pc.helm.' + e.helm);
    return out;
  };

  Player.prototype.draw = function (ctx) {
    this.drawShadow(ctx);
    // Quầng ấm dưới chân: giữa một đám linh thú và bầy quái trên màn dọc, thứ
    // người chơi hay mất dấu nhất chính là CHÍNH MÌNH. Một vòng sáng mờ dưới
    // chân rẻ hơn mọi cách khác và không che mất hình nhân vật.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var gg = ctx.createRadialGradient(this.x, this.y - 2, 1, this.x, this.y - 2, 17);
    gg.addColorStop(0, 'rgba(255,232,180,.55)');
    gg.addColorStop(1, 'rgba(255,228,170,0)');
    ctx.fillStyle = gg;
    ctx.fillRect(this.x - 18, this.y - 20, 36, 36);
    ctx.restore();
    // vòng chân trắng: cùng ngôn ngữ với vòng đỏ của quái và vòng màu-vai của
    // linh thú, nên ba loại nhân vật tách nhau ngay từ cái liếc đầu tiên
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#fff2cf';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 1, 8, 3.6, 0, 0, 6.2832);
    ctx.stroke();
    ctx.restore();
    var i = this.frameIndex();
    var flip = this.face === 3;
    var ls = this.layers();
    for (var k = 0; k < ls.length; k++) {
      if (!G.Atlas.has(ls[k])) continue;
      G.Atlas.draw(ctx, ls[k], i, this.x, this.y + 3, {
        flip: flip, white: this.flash > 0,
        alpha: this.invuln > 0 && ((this.invuln * 22) | 0) % 2 ? 0.45 : 1
      });
    }
    if (this.mineTile) this.drawPick(ctx);
  };

  /* Cây cuốc vẽ RIÊNG và xoay theo nhát vung — bộ art không có sẵn khung đào,
   * mà vẽ cuốc quay thì lại hoá ra rõ hơn: người chơi thấy ngay mình đang đục. */
  Player.prototype.drawPick = function (ctx) {
    var key = 'items';
    if (!G.Atlas.has(key)) return;
    var icon = this.st.pickIcon || 577;
    var dirx = this.face === 3 ? -1 : 1;
    var a = -0.9 + Math.sin(this.swing * Math.PI) * 1.9;
    var ox = this.face === 2 ? 0 : dirx * 7;
    var oy = this.face === 2 ? -12 : -6;
    ctx.save();
    ctx.translate(this.x + ox, this.y + oy);
    ctx.rotate(a * dirx);
    G.Atlas.draw(ctx, key, icon, 0, 0, { ax: 0.3, ay: 0.7, scale: 1 });
    ctx.restore();
  };

  /* Khung sáng quanh ô đang đục — không có nó thì người chơi không biết mình
   * đang đục ô nào, nhất là khi đứng chéo. */
  Player.prototype.drawMineMark = function (ctx, w) {
    if (!this.mineTile) return;
    var t = this.mineTile;
    var id = w.idx(t.x, t.y);
    if (!w.diggable(t.x, t.y)) return;
    var px = t.x * T, py = t.y * T;
    var k = 1 - w.hp[id] / w.hpMax[id];
    ctx.save();
    ctx.strokeStyle = 'rgba(255,220,140,.75)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, T - 1, T - 1);
    ctx.fillStyle = 'rgba(255,210,120,.85)';
    ctx.fillRect(px + 1, py + T - 3, (T - 2) * k, 2);
    ctx.restore();
  };

  G.Player = Player;
  G.PC_FRAMES = F;
})(window.DC = window.DC || {});
