/* Màn hình trận đánh — hai nhân vật đứng trên nền, lao vào nhau, số bay lên.
 *
 * WHY: bản đầu tiên chỉ đổ nhật ký trận ra thành một danh sách chữ. Nó ĐÚNG
 * nhưng nó là một cái app đọc log, không phải một game. Trong một auto-battler
 * người chơi không bấm gì cả — nên 30 giây xem trận diễn ra CHÍNH LÀ phần
 * thưởng cho những quyết định họ đã đưa ra lúc còn sáng. Bỏ nó đi là bỏ mất
 * chỗ duy nhất mà bộ đồ của họ được nhìn thấy hoạt động.
 * ROOT-CAUSE: bộ máy trả về nhật ký dạng chữ, và chữ là thứ dễ hiển thị nhất.
 *
 * Cách chạy: bộ máy giờ gắn vào mỗi dòng nhật ký một mô tả có cấu trúc
 * ({k: 'dmg', i: ai chịu, by: ai gây, v: bao nhiêu}), nên chỗ này không phải
 * đoán ý từ chữ. Mỗi dòng là một nhịp; nhịp nào cũng có thể sinh ra cú lao,
 * cú giật, con số bay lên và rung màn hình.
 */
(function (global) {
  'use strict';

  var A = global.HIC_ART;

  function Fight(canvas, res, foeName, isBoss) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.res = res;
    this.foeName = foeName;
    this.isBoss = !!isBoss;
    this.lines = res.log || [];
    this.idx = 0;
    this.speed = 1;
    this.acc = 0;
    this.fx = [];
    this.shake = 0;
    this.time = 0;
    this.done = false;
    this.snap = this.lines.length ? this.lines[0] : null;
    this.trees = [];
    for (var i = 0; i < 9; i++) {
      // Bóng cây nền, cố định theo tên địch để mỗi trận trông khác nhau một chút.
      var seed = (foeName.charCodeAt(i % foeName.length) * (i + 7)) % 97;
      this.trees.push({ x: (seed % 100) / 100, h: 0.5 + (seed % 37) / 74, w: 0.05 + (seed % 11) / 90 });
    }
    this.trees.sort(function (a, b) { return a.x - b.x; });
  }

  Fight.prototype.fit = function () {
    var r = this.cv.getBoundingClientRect();
    var dpr = Math.min(2, global.devicePixelRatio || 1);
    this.w = Math.round(r.width);
    this.h = Math.round(r.height);
    this.cv.width = Math.round(this.w * dpr);
    this.cv.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  };

  /* ------------------------------------------------------------- hiệu ứng */

  Fight.prototype.addFloat = function (who, text, color, big) {
    this.fx.push({ kind: 'float', who: who, text: text, color: color, t: 0,
      dur: big ? 1100 : 850, big: !!big, ox: (Math.random() - 0.5) * 26 });
  };
  Fight.prototype.addLunge = function (who) {
    this.fx.push({ kind: 'lunge', who: who, t: 0, dur: 300 });
  };
  Fight.prototype.addFlash = function (who) {
    this.fx.push({ kind: 'flash', who: who, t: 0, dur: 240 });
  };
  Fight.prototype.addSpark = function (who, color, n) {
    for (var i = 0; i < (n || 8); i++) {
      this.fx.push({ kind: 'spark', who: who, t: 0, dur: 420 + Math.random() * 220,
        a: Math.random() * Math.PI * 2, sp: 40 + Math.random() * 90, color: color });
    }
  };

  /* Một nhịp: đọc một dòng nhật ký và biến nó thành thứ nhìn thấy được. */
  Fight.prototype.step = function () {
    if (this.idx >= this.lines.length) { this.finish(); return 0; }
    var ln = this.lines[this.idx++];
    this.snap = ln;
    var hold = 300;

    switch (ln.k) {
      case 'strike':
        if (ln.by != null) this.addLunge(ln.by);
        hold = 260;
        break;
      case 'dmg': {
        var victim = ln.i;
        if (ln.strike && ln.by != null) this.addLunge(ln.by);
        this.addFlash(victim);
        if (ln.ar > 0) {
          this.addFloat(victim, '-' + ln.ar, '#9fc4f5');
          this.addSpark(victim, '#9fc4f5', 6);
        }
        if (ln.hp > 0) {
          var maxHp = victim === 0 ? ln.a.maxHp : ln.b.maxHp;
          var big = ln.hp >= Math.max(3, maxHp * 0.2);
          this.addFloat(victim, '-' + ln.hp, '#ff6a52', big);
          this.addSpark(victim, '#ff6a52', big ? 14 : 8);
          this.shake = Math.min(14, (big ? 9 : 4) + ln.hp * 0.2);
        }
        hold = ln.strike ? 420 : 300;
        break;
      }
      case 'heal':
        this.addFloat(ln.i, '+' + ln.v, '#8ed177');
        this.addSpark(ln.i, '#8ed177', 6);
        break;
      case 'armor':
        this.addFloat(ln.i, '+' + ln.v + ' giáp', '#9fc4f5');
        break;
      case 'armorloss':
        break;
      case 'thorns':
        if (ln.v > 0) this.addFloat(ln.i, '+' + ln.v + ' gai', '#8ed177');
        break;
      case 'atk':
        this.addFloat(ln.i, (ln.v > 0 ? '+' : '') + ln.v + ' công', ln.v > 0 ? '#f5d24b' : '#c3d3e0');
        break;
      case 'spd':
        this.addFloat(ln.i, (ln.v > 0 ? '+' : '') + ln.v + ' tốc', '#b57ad6');
        break;
      case 'stun':
        this.addFloat(ln.i, 'choáng', '#f5d24b');
        hold = 380;
        break;
      case 'death':
        this.addSpark(ln.i, '#ff6a52', 20);
        this.shake = 16;
        hold = 700;
        break;
      default:
        hold = 240;
    }
    return hold;
  };

  Fight.prototype.finish = function () {
    if (this.done) return;
    this.done = true;
    if (this.lines.length) this.snap = this.lines[this.lines.length - 1];
    if (this.onDone) this.onDone();
  };

  Fight.prototype.skip = function () {
    while (this.idx < this.lines.length) this.step();
    this.fx.length = 0;
    this.finish();
  };

  /* ------------------------------------------------------------------ vẽ */

  Fight.prototype.groundY = function () { return this.h * 0.70; };

  Fight.prototype.fighterBox = function (who) {
    var s = Math.min(this.w * 0.36, this.h * 0.32);
    return {
      x: who === 0 ? this.w * 0.26 - s / 2 : this.w * 0.74 - s / 2,
      y: this.groundY() - s * 0.94,
      s: s
    };
  };

  Fight.prototype.drawBackdrop = function () {
    var ctx = this.ctx, w = this.w, h = this.h;
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, this.isBoss ? '#2a0f14' : '#101a24');
    g.addColorStop(0.55, this.isBoss ? '#160a10' : '#0b1219');
    g.addColorStop(1, '#070a0e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // vầng sáng sau lưng địch, để mắt biết ai là mối đe doạ
    var gy = this.groundY();
    var rg = ctx.createRadialGradient(w * 0.76, gy - h * 0.10, 0, w * 0.76, gy - h * 0.10, w * 0.42);
    rg.addColorStop(0, this.isBoss ? 'rgba(195,65,65,.30)' : 'rgba(120,150,190,.16)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);

    // bóng cây
    ctx.fillStyle = 'rgba(6,12,10,.85)';
    for (var i = 0; i < this.trees.length; i++) {
      var t = this.trees[i];
      var tx = t.x * w, th = t.h * h * 0.34, tw = t.w * w;
      ctx.beginPath();
      ctx.moveTo(tx, gy);
      ctx.lineTo(tx - tw, gy - th * 0.55);
      ctx.lineTo(tx - tw * 0.45, gy - th * 0.55);
      ctx.lineTo(tx - tw * 0.8, gy - th);
      ctx.lineTo(tx + tw * 0.8, gy - th);
      ctx.lineTo(tx + tw * 0.45, gy - th * 0.55);
      ctx.lineTo(tx + tw, gy - th * 0.55);
      ctx.closePath();
      ctx.fill();
    }

    // mặt đất
    var gg = ctx.createLinearGradient(0, gy, 0, h);
    gg.addColorStop(0, '#24402c');
    gg.addColorStop(1, '#12211a');
    ctx.fillStyle = gg;
    ctx.fillRect(0, gy, w, h - gy);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(0, gy, w, 2);

    // Vài túm cỏ để mặt đất không phải một dải màu chết.
    ctx.fillStyle = 'rgba(87,168,92,.55)';
    for (var t2 = 0; t2 < 26; t2++) {
      var sx = ((t2 * 137) % 100) / 100 * w;
      var sy = gy + 8 + ((t2 * 53) % 100) / 100 * (h - gy - 14);
      var sh = 3 + ((t2 * 29) % 5);
      ctx.fillRect(sx, sy, 2, sh);
      ctx.fillRect(sx + 3, sy + 1, 2, sh - 1);
    }

    // Viền tối quanh mép, kéo mắt vào giữa.
    var vg = ctx.createRadialGradient(w / 2, gy - h * 0.12, h * 0.12, w / 2, gy - h * 0.12, h * 0.62);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  };

  Fight.prototype.drawFighter = function (who) {
    var ctx = this.ctx, box = this.fighterBox(who);
    var dx = 0, flash = 0, dead = false;
    var snapSide = who === 0 ? (this.snap && this.snap.a) : (this.snap && this.snap.b);
    if (snapSide && snapSide.hp <= 0) dead = true;

    for (var i = 0; i < this.fx.length; i++) {
      var f = this.fx[i];
      if (f.who !== who) continue;
      var p = f.t / f.dur;
      if (f.kind === 'lunge') {
        // lao tới rồi về: nửa đầu đi, nửa sau lùi
        var k = p < 0.5 ? p * 2 : (1 - p) * 2;
        dx += (who === 0 ? 1 : -1) * k * box.s * 0.42;
      } else if (f.kind === 'flash') {
        flash = Math.max(flash, 1 - p);
        dx += (who === 0 ? -1 : 1) * Math.sin(p * Math.PI * 4) * box.s * 0.06 * (1 - p);
      }
    }

    var bob = Math.sin(this.time / 420 + who) * box.s * 0.02;
    var x = box.x + dx, y = box.y + bob;

    A.shadow(ctx, x, y, box.s);
    ctx.save();
    if (dead) ctx.globalAlpha = 0.35;
    if (who === 0) A.hero(ctx, x, y, box.s);
    else A.mob(ctx, this.foeName, x, y, box.s);
    ctx.restore();

    if (flash > 0) {
      ctx.save();
      ctx.globalAlpha = flash * 0.85;
      if (who === 0) A.tintHero(ctx, x, y, box.s, '#ffffff');
      else A.tintMob(ctx, this.foeName, x, y, box.s, '#ffffff');
      ctx.restore();
    }
  };

  Fight.prototype.drawSparks = function () {
    var ctx = this.ctx;
    for (var i = 0; i < this.fx.length; i++) {
      var f = this.fx[i];
      if (f.kind !== 'spark') continue;
      var box = this.fighterBox(f.who), p = f.t / f.dur;
      var d = f.sp * p;
      var x = box.x + box.s / 2 + Math.cos(f.a) * d;
      var y = box.y + box.s * 0.5 + Math.sin(f.a) * d + p * p * 40;
      ctx.globalAlpha = 1 - p;
      ctx.fillStyle = f.color;
      var sz = Math.max(2, box.s * 0.05 * (1 - p));
      ctx.fillRect(x, y, sz, sz);
      ctx.globalAlpha = 1;
    }
  };

  Fight.prototype.drawFloats = function () {
    var ctx = this.ctx;
    for (var i = 0; i < this.fx.length; i++) {
      var f = this.fx[i];
      if (f.kind !== 'float') continue;
      var box = this.fighterBox(f.who), p = f.t / f.dur;
      var x = box.x + box.s / 2 + f.ox;
      var y = box.y + box.s * 0.30 - p * box.s * 0.75;
      ctx.save();
      ctx.globalAlpha = p < 0.75 ? 1 : (1 - p) * 4;
      ctx.font = '700 ' + Math.round(box.s * (f.big ? 0.34 : 0.24)) + 'px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = Math.max(3, box.s * 0.055);
      ctx.strokeStyle = 'rgba(4,7,10,.9)';
      ctx.strokeText(f.text, x, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, x, y);
      ctx.restore();
    }
  };

  /* Thanh máu kiểu game đối kháng: máu ở dưới, giáp là một dải xanh CHỒNG lên
     trên máu, vì trong game này giáp đúng là lớp nằm trước máu. */
  Fight.prototype.drawBars = function () {
    var ctx = this.ctx, w = this.w, pad = Math.round(w * 0.035);
    var bw = (w - pad * 3) / 2, bh = Math.round(this.h * 0.030);
    var top = Math.round(this.h * 0.035);
    var sides = [
      { s: this.snap && this.snap.a, name: 'Bạn', x: pad, ally: true },
      { s: this.snap && this.snap.b, name: this.vnFoe || this.foeName, x: pad * 2 + bw, ally: false }
    ];
    for (var i = 0; i < 2; i++) {
      var d = sides[i], s = d.s;
      if (!s) continue;
      ctx.font = '600 ' + Math.round(bh * 0.78) + 'px system-ui,sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#e6eef5';
      ctx.fillText(d.name, d.x, top - 4);

      ctx.fillStyle = 'rgba(0,0,0,.6)';
      A.roundRect(ctx, d.x, top, bw, bh, bh * 0.4);
      ctx.fill();
      var frac = Math.max(0, Math.min(1, s.hp / Math.max(1, s.maxHp)));
      ctx.fillStyle = d.ally ? '#4fbf5a' : '#c03535';
      A.roundRect(ctx, d.x, top, Math.max(2, bw * frac), bh, bh * 0.4);
      ctx.fill();
      if (s.armor > 0) {
        var af = Math.min(1, s.armor / Math.max(1, s.maxHp));
        ctx.fillStyle = 'rgba(159,196,245,.92)';
        A.roundRect(ctx, d.x, top, Math.max(2, bw * af), bh, bh * 0.4);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(230,238,245,.35)';
      ctx.lineWidth = 1;
      A.roundRect(ctx, d.x + 0.5, top + 0.5, bw - 1, bh - 1, bh * 0.4);
      ctx.stroke();

      // dòng chỉ số dưới thanh
      var bits = [s.hp + '/' + s.maxHp];
      if (s.armor) bits.push('giáp ' + s.armor);
      if (s.thorns) bits.push('gai ' + s.thorns);
      if (s.stun) bits.push('choáng ' + s.stun);
      bits.push('công ' + s.attack);
      ctx.font = '500 ' + Math.round(bh * 0.66) + 'px system-ui,sans-serif';
      ctx.fillStyle = '#a9bccd';
      ctx.fillText(bits.join('  ·  '), d.x, top + bh + Math.round(bh * 0.85));
    }
  };

  Fight.prototype.render = function (dt) {
    var ctx = this.ctx;
    this.time += dt;
    for (var i = this.fx.length - 1; i >= 0; i--) {
      this.fx[i].t += dt;
      if (this.fx[i].t >= this.fx[i].dur) this.fx.splice(i, 1);
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 0.05);

    ctx.save();
    if (this.shake > 0.4) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }
    this.drawBackdrop();
    this.drawFighter(1);
    this.drawFighter(0);
    this.drawSparks();
    this.drawFloats();
    ctx.restore();
    this.drawBars();
  };

  /* -------------------------------------------------------------- vòng lặp */

  Fight.prototype.run = function (onDone) {
    var self = this;
    this.onDone = onDone;
    this.fit();
    var last = 0;
    function frame(ts) {
      if (self.stopped) return;
      var dt = last ? Math.min(64, ts - last) : 16;
      last = ts;
      if (!self.done) {
        self.acc -= dt * self.speed;
        while (self.acc <= 0 && !self.done) self.acc += self.step();
      }
      self.render(dt);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  };

  Fight.prototype.stop = function () { this.stopped = true; };

  global.HIC_Fight = Fight;
})(window);
