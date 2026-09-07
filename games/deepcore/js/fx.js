/*
 * fx.js — hạt, chữ bay, rung màn, vệt sáng.
 *
 * TRẦN CỨNG ĐẶT TỪ NGÀY ĐẦU. Deep Rock Galactic: Survivor hỏng đúng chỗ này —
 * càng về cuối ván màn hình càng đặc hiệu ứng tới mức không đọc nổi cái gì đang
 * xảy ra. Trên màn điện thoại dọc thì hỏng nhanh gấp đôi. Nên: tổng số hạt có
 * trần, vượt trần thì hạt CŨ NHẤT bị đạp ra, và mọi hiệu ứng đều có bậc ưu tiên.
 */
(function (G) {
  'use strict';

  var MAX_PARTS = 220;      // trần cứng
  var MAX_TEXTS = 14;

  function Fx() {
    this.parts = [];
    this.texts = [];
    this.rings = [];
    this.shake = 0;
    this.shakeT = 0;
    this.flash = 0;
    this.flashCol = '#fff';
    this.anims = [];        // hoạt ảnh sprite một-lần (nổ, tóe)
  }

  /* prio: 0 = vặt (bụi đào), 1 = thường (máu), 2 = quan trọng (nổ, chết boss).
   * Khi đầy thì hạt ưu tiên thấp chết trước. */
  Fx.prototype.part = function (x, y, o) {
    o = o || {};
    if (this.parts.length >= MAX_PARTS) {
      var worst = 0, wp = 9;
      for (var i = 0; i < this.parts.length; i++) {
        if (this.parts[i].prio < wp) { wp = this.parts[i].prio; worst = i; }
      }
      if (wp > (o.prio || 0)) return;    // cái mới còn kém hơn thì thôi khỏi thêm
      this.parts.splice(worst, 1);
    }
    this.parts.push({
      x: x, y: y,
      vx: o.vx || 0, vy: o.vy || 0,
      g: o.g === undefined ? 60 : o.g,
      life: o.life || 0.5, t: 0,
      r: o.r || 2, col: o.col || '#fff',
      prio: o.prio || 0,
      fade: o.fade !== false,
      shrink: o.shrink !== false,
      glow: !!o.glow
    });
  };

  Fx.prototype.burst = function (x, y, n, o) {
    o = o || {};
    var spd = o.spd || 70;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = spd * (0.35 + Math.random() * 0.9);
      this.part(x, y, {
        vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.75,
        life: (o.life || 0.45) * (0.6 + Math.random() * 0.8),
        r: o.r || 2, col: o.col, prio: o.prio, g: o.g, glow: o.glow
      });
    }
  };

  /* Chữ bay lên: sát thương, "+3 Nitra", "LÊN CẤP". Ít mà rõ hơn nhiều mà rối,
   * nên gộp chữ trùng chỗ lại thay vì chồng đống. */
  Fx.prototype.text = function (x, y, s, col, big) {
    for (var i = 0; i < this.texts.length; i++) {
      var t = this.texts[i];
      if (t.s === s && Math.abs(t.x - x) < 14 && Math.abs(t.y0 - y) < 14 && t.t < 0.25) {
        t.n++; t.t = 0; return;
      }
    }
    if (this.texts.length >= MAX_TEXTS) this.texts.shift();
    this.texts.push({ x: x, y: y, y0: y, s: s, col: col || '#fff', t: 0,
                      life: big ? 1.25 : 0.85, big: !!big, n: 1 });
  };

  Fx.prototype.ring = function (x, y, r0, r1, col, life) {
    if (this.rings.length > 12) this.rings.shift();
    this.rings.push({ x: x, y: y, r0: r0, r1: r1, col: col || '#fff',
                      t: 0, life: life || 0.35 });
  };

  /* Hoạt ảnh sprite một lần từ atlas (nổ slime, tóe máu, ...). */
  Fx.prototype.anim = function (key, x, y, o) {
    if (!G.Atlas.has(key)) return;
    o = o || {};
    if (this.anims.length > 26) this.anims.shift();
    this.anims.push({ key: key, x: x, y: y, t: 0,
                      fps: o.fps || 18, scale: o.scale || 1,
                      alpha: o.alpha === undefined ? 1 : o.alpha,
                      ay: o.ay === undefined ? 0.5 : o.ay,
                      n: G.Atlas.count(key) });
  };

  Fx.prototype.hit = function (amount, dir) {
    // Rung theo bậc, không rung theo sát thương thô: sát thương lớn ở cuối ván
    // mà rung tuyến tính thì màn hình lắc như động đất.
    var s = amount >= 3 ? 7 : amount >= 2 ? 4.5 : 2.4;
    if (s > this.shake) { this.shake = s; this.shakeT = 0.22; }
    if (dir !== undefined) this.shakeDir = dir;
  };

  Fx.prototype.screenFlash = function (col, a) {
    this.flashCol = col; this.flash = Math.max(this.flash, a === undefined ? 0.4 : a);
  };

  Fx.prototype.update = function (dt) {
    var i, p;
    for (i = this.parts.length - 1; i >= 0; i--) {
      p = this.parts[i];
      p.t += dt;
      if (p.t >= p.life) { this.parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += p.g * dt;
      p.vx *= 0.965; p.vy *= 0.985;
    }
    for (i = this.texts.length - 1; i >= 0; i--) {
      var t = this.texts[i];
      t.t += dt;
      if (t.t >= t.life) this.texts.splice(i, 1);
      else t.y = t.y0 - 22 * (t.t / t.life) - (t.big ? 6 : 0);
    }
    for (i = this.rings.length - 1; i >= 0; i--) {
      this.rings[i].t += dt;
      if (this.rings[i].t >= this.rings[i].life) this.rings.splice(i, 1);
    }
    for (i = this.anims.length - 1; i >= 0; i--) {
      var an = this.anims[i];
      an.t += dt;
      if (an.t * an.fps >= an.n) this.anims.splice(i, 1);
    }
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      if (this.shakeT <= 0) this.shake = 0;
    }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.6);
  };

  /* Vẽ ở TOẠ ĐỘ THẾ GIỚI (đã dịch camera). */
  Fx.prototype.draw = function (ctx) {
    var i, p;
    ctx.save();
    for (i = 0; i < this.anims.length; i++) {
      var an = this.anims[i];
      G.Atlas.draw(ctx, an.key, (an.t * an.fps) | 0, an.x, an.y,
        { scale: an.scale, alpha: an.alpha, ay: an.ay });
    }
    for (i = 0; i < this.rings.length; i++) {
      var rg = this.rings[i];
      var k = rg.t / rg.life;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = rg.col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(rg.x, rg.y, rg.r0 + (rg.r1 - rg.r0) * k, 0, 6.2832);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (i = 0; i < this.parts.length; i++) {
      p = this.parts[i];
      var k2 = p.t / p.life;
      ctx.globalAlpha = p.fade ? (1 - k2) : 1;
      if (p.glow) ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = p.col;
      var r = p.shrink ? p.r * (1 - k2 * 0.65) : p.r;
      ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
      if (p.glow) ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  };

  Fx.prototype.drawText = function (ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    for (var i = 0; i < this.texts.length; i++) {
      var t = this.texts[i];
      var k = t.t / t.life;
      ctx.globalAlpha = k > 0.72 ? (1 - k) / 0.28 : 1;
      ctx.font = (t.big ? 'bold 15px ' : 'bold 10px ') + 'ui-monospace, monospace';
      var s = t.s + (t.n > 1 ? ' x' + t.n : '');
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,.85)';
      ctx.strokeText(s, t.x, t.y);
      ctx.fillStyle = t.col;
      ctx.fillText(s, t.x, t.y);
    }
    ctx.restore();
  };

  Fx.prototype.clear = function () {
    this.parts.length = 0; this.texts.length = 0;
    this.rings.length = 0; this.anims.length = 0;
    this.shake = 0; this.flash = 0;
  };

  G.Fx = Fx;
})(window.DC = window.DC || {});
