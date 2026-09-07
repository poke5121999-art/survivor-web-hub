/*
 * actor.js — thân chung cho mọi thứ biết đi: người chơi, quái, linh thú, boss.
 *
 * Quy ước hoạt ảnh của kho art Core Keeper:
 *     <việc>          nhìn XUỐNG
 *     <việc>_side     nhìn PHẢI  (lật ngang để thành trái)
 *     <việc>_up       nhìn LÊN
 * Thiếu biến thể nào thì tự rơi về biến thể có — quái nhỏ nhiều con chỉ có mỗi
 * `move`, và như thế vẫn chạy được chứ không vỡ.
 */
(function (G) {
  'use strict';

  var T = 16;

  function Actor() {}

  Actor.prototype.initActor = function (x, y, o) {
    o = o || {};
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.r = o.r || 5;                 // bán kính va chạm với tường
    this.hp = this.hpMax = o.hp || 10;
    this.speed = o.speed || 40;
    this.face = 0;                     // 0 xuống, 1 phải, 2 lên, 3 trái
    this.art = o.art || null;          // ví dụ 'mob.caveling'
    this.anim = 'idle';
    this.animT = 0;
    this.fps = o.fps || 10;
    this.scale = o.scale || 1;
    this.dead = false;
    this.flash = 0;                    // chớp trắng khi trúng đòn
    this.kbx = 0; this.kby = 0;        // vận tốc bị hất
    this.stun = 0;
    this.slow = 0;                     // 0..1, giảm tốc tạm thời
    this.shadow = o.shadow !== false;
    this.z = 0;                        // độ cao (nhảy)
    this.vz = 0;
    return this;
  };

  Actor.prototype.setAnim = function (name) {
    if (this.anim !== name) { this.anim = name; this.animT = 0; }
  };

  /* Khoá sprite hiện tại + có phải lật ngang không. */
  Actor.prototype.frameKey = function () {
    var A = G.Atlas, b = this.art;
    if (!b) return null;
    var f = this.face;
    var suf = f === 2 ? '_up' : (f === 1 || f === 3) ? '_side' : '';
    var k = A.pick(b + '.' + this.anim + suf,
                   b + '.' + this.anim,
                   b + '.move' + suf, b + '.move',
                   b + '.idle' + suf, b + '.idle');
    return k;
  };

  Actor.prototype.faceFrom = function (dx, dy) {
    if (Math.abs(dx) > Math.abs(dy)) this.face = dx > 0 ? 1 : 3;
    else this.face = dy > 0 ? 0 : 2;
  };

  Actor.prototype.hurt = function (dmg, srcX, srcY, kb) {
    if (this.dead || this.invuln > 0) return 0;
    this.hp -= dmg;
    this.flash = 0.12;
    if (kb && srcX !== undefined) {
      var a = Math.atan2(this.y - srcY, this.x - srcX);
      this.kbx += Math.cos(a) * kb;
      this.kby += Math.sin(a) * kb;
    }
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
    return dmg;
  };

  /* Đi một bước có VA CHẠM VỚI TƯỜNG, tách hai trục để còn trượt dọc vách
   * thay vì dính cứng vào góc — đi bằng joystick mà dính góc là hỏng cảm giác. */
  Actor.prototype.move = function (w, dx, dy) {
    var nx = this.x + dx;
    if (!this.blocked(w, nx, this.y)) this.x = nx;
    else {
      // trượt: thử nhích theo trục kia một chút để lách qua khe
      this.x = this.snapAxis(w, nx, this.y, true);
    }
    var ny = this.y + dy;
    if (!this.blocked(w, this.x, ny)) this.y = ny;
    else this.y = this.snapAxis(w, this.x, ny, false);
  };

  Actor.prototype.snapAxis = function (w, nx, ny, isX) {
    return isX ? this.x : this.y;
  };

  Actor.prototype.blocked = function (w, x, y) {
    var r = this.r;
    var x0 = Math.floor((x - r) / T), x1 = Math.floor((x + r) / T);
    var y0 = Math.floor((y - r) / T), y1 = Math.floor((y + r) / T);
    for (var ty = y0; ty <= y1; ty++) {
      for (var tx = x0; tx <= x1; tx++) {
        if (w.solid(tx, ty)) return true;
      }
    }
    return false;
  };

  Actor.prototype.tileX = function () { return (this.x / T) | 0; };
  Actor.prototype.tileY = function () { return (this.y / T) | 0; };

  Actor.prototype.stepCommon = function (dt) {
    if (this.flash > 0) this.flash -= dt;
    if (this.stun > 0) this.stun -= dt;
    if (this.slow > 0) this.slow = Math.max(0, this.slow - dt * 0.8);
    if (this.invuln > 0) this.invuln -= dt;
    this.animT += dt;
    // đà bị hất tắt dần
    this.kbx *= Math.pow(0.0016, dt);
    this.kby *= Math.pow(0.0016, dt);
    if (this.z > 0 || this.vz !== 0) {
      this.vz -= 420 * dt;
      this.z += this.vz * dt;
      if (this.z <= 0) { this.z = 0; this.vz = 0; }
    }
  };

  Actor.prototype.applyKnock = function (w, dt) {
    if (Math.abs(this.kbx) > 1 || Math.abs(this.kby) > 1) {
      this.move(w, this.kbx * dt, this.kby * dt);
    }
  };

  Actor.prototype.drawShadow = function (ctx) {
    if (!this.shadow) return;
    var rr = this.r * 1.15 * this.scale;
    ctx.save();
    ctx.globalAlpha = 0.34 - Math.min(0.2, this.z * 0.006);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 1, rr, rr * 0.45, 0, 0, 6.2832);
    ctx.fill();
    ctx.restore();
  };

  Actor.prototype.draw = function (ctx) {
    var key = this.frameKey();
    if (!key) return;
    this.drawShadow(ctx);
    var n = G.Atlas.count(key) || 1;
    var i = (this.animT * this.fps) | 0;
    if (this.animOnce) i = Math.min(i, n - 1);
    G.Atlas.draw(ctx, key, i, this.x, this.y - this.z, {
      flip: this.face === 3,
      scale: this.scale,
      white: this.flash > 0,
      alpha: this.alpha
    });
  };

  /* Thanh máu nhỏ trên đầu. Theo bài học của DRG:S: quái thường KHÔNG có thanh
   * máu — nếu con nào cũng có thì màn hình thành rừng thanh đỏ, mà cái người
   * chơi cần biết chỉ là "con nào đáng sợ". */
  Actor.prototype.drawBar = function (ctx, w, dy) {
    if (this.hp >= this.hpMax) return;
    w = w || 20;
    var h = 3, x = this.x - w / 2, y = this.y - (dy || 26) - this.z;
    ctx.fillStyle = 'rgba(0,0,0,.7)';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = '#c0303a';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#e8d84a';
    ctx.fillRect(x, y, w * Math.max(0, this.hp / this.hpMax), h);
  };

  G.Actor = Actor;

  /* Trộn Actor vào một hàm khởi tạo khác. */
  G.extendActor = function (Ctor) {
    for (var k in Actor.prototype) {
      if (Object.prototype.hasOwnProperty.call(Actor.prototype, k) &&
          !Ctor.prototype[k]) {
        Ctor.prototype[k] = Actor.prototype[k];
      }
    }
    return Ctor;
  };
})(window.DC = window.DC || {});
