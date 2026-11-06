/* Hiệu ứng dùng chung cho bản đồ và trận đánh: hạt, hoạt ảnh VFX chạy một
 * lần, số bay, rung màn hình, hàm nội suy.
 *
 * WHY: "mượt" không nằm ở một hiệu ứng lớn mà ở hàng chục thứ nhỏ cùng dùng một
 * nhịp: cùng một hàm ease, cùng một cách rung. Để mỗi màn tự viết lấy thì bản
 * đồ nảy một kiểu, trận đánh nảy một kiểu, và cả game trông lắp ghép.
 * Rung màn hình có công tắc tắt: người chơi He Is Coming bản Steam phàn nàn
 * đúng chuyện rung không tắt được (luồng thảo luận Steam app 2824490).
 */
(function (global) {
  'use strict';

  var SPR = global.HIC_SPR;
  var PKEY = 'hic.prefs.v1';
  var prefs = { shake: true, dpad: true, fast: 1 };
  try { var p = JSON.parse(localStorage.getItem(PKEY) || 'null'); if (p) for (var k in p) prefs[k] = p[k]; } catch (e) { /* riêng tư */ }

  var E = {
    linear: function (t) { return t; },
    outCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
    inCubic: function (t) { return t * t * t; },
    inOutSine: function (t) { return -(Math.cos(Math.PI * t) - 1) / 2; },
    outBack: function (t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    outElastic: function (t) {
      if (t === 0 || t === 1) return t;
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
    }
  };

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  var FX_clamp = clamp;

  /* Số sát thương bằng chữ số pixel của HoloCure (5×7, viền đen có sẵn trong
     sprite). Không dùng strokeText: nhoè và không khớp lưới pixel. Số to thì rung
     nhẹ trong 160ms đầu. Dấu +/- tự vẽ bằng khối vì bộ chữ số không có dấu. */
  function drawDigits(ctx, it, p) {
    var role = it.yellow ? 'ui.digit_y' : 'ui.digit';
    var s = it.px;
    var pop = it.t < 90 ? 1 + (it.big ? 0.9 : 0.6) * (1 - it.t / 90) : (it.t < 220 ? 1 + 0.12 * Math.sin((it.t - 90) / 130 * Math.PI) : 1);
    var sc = Math.max(1, Math.round(s * pop));
    var rise = E.outCubic(clamp(p * 1.6, 0, 1)) * it.rise + (p > 0.6 ? (p - 0.6) * it.rise * 0.6 : 0);
    var alpha = p < 0.72 ? 1 : 1 - (p - 0.72) / 0.28;
    var str = it.text.replace(/[^0-9]/g, '');
    var gw = 6 * sc, total = str.length * gw;
    var jx = it.big && it.t < 160 ? (Math.random() - 0.5) * sc * 2 : 0;
    var x0 = Math.round(it.x + it.vx * p - total / 2 + jx), y0 = Math.round(it.y - rise);
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    var sign = it.text.charAt(0);
    if (sign === '+' || sign === '-') {
      // dấu vẽ bằng khối — bộ chữ số không có dấu
      ctx.fillStyle = '#000';
      ctx.fillRect(x0 - 5 * sc, y0 - 4 * sc - sc, 5 * sc, 3 * sc);
      if (sign === '+') ctx.fillRect(x0 - 4 * sc, y0 - 6 * sc, 3 * sc, 7 * sc);
      ctx.fillStyle = it.color;
      ctx.fillRect(x0 - 4 * sc, y0 - 4 * sc, 3 * sc, sc);
      if (sign === '+') ctx.fillRect(x0 - 3 * sc, y0 - 5 * sc, sc, 3 * sc);
    }
    for (var k = 0; k < str.length; k++) {
      var id = SPR.frameN(role, +str[k]);
      var gx = x0 + k * gw + 2.5 * sc, gy = y0;
      var r = SPR.rect(id);
      // Sprite đã có viền đen sẵn; chỉ nhuộm ruột trắng bằng phép nhân.
      var colored = it.color && !it.yellow && it.color !== '#fff' && it.color !== '#ffffff' ? SPR.tintedMul(id, it.color) : null;
      if (colored) ctx.drawImage(colored, Math.round(gx - r[2] * sc / 2), Math.round(gy - r[3] * sc / 2), r[2] * sc, r[3] * sc);
      else SPR.drawPivot(ctx, id, gx, gy, sc, {});
    }
    ctx.restore();
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  /* Nội suy theo thời gian thực, không phụ thuộc tốc độ khung hình:
     cùng một "độ bám" cho ra cùng một chuyển động ở 30 lẫn 120 hình/giây. */
  function damp(a, b, rate, dt) { return lerp(b, a, Math.exp(-rate * dt / 1000)); }

  /* ------------------------------------------------------------------ lớp */

  function Layer() {
    this.items = [];
    this.shakeAmt = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.hitstop = 0;
  }

  /* Hạt: {x,y,vx,vy,g,life,size,color,shape:'sq'|'circle'|'spark'|'text'} */
  Layer.prototype.particle = function (o) {
    o.kind = 'p';
    o.t = 0;
    o.life = o.life || 600;
    o.g = o.g == null ? 0 : o.g;
    o.drag = o.drag == null ? 0.9 : o.drag;
    this.items.push(o);
    return o;
  };

  Layer.prototype.burst = function (x, y, n, o) {
    for (var i = 0; i < n; i++) {
      var a = (o.angle != null ? o.angle : 0) + (Math.random() - 0.5) * (o.spread != null ? o.spread : Math.PI * 2);
      var sp = (o.speed || 120) * (0.4 + Math.random() * 0.8);
      this.particle({
        x: x + (Math.random() - 0.5) * (o.jitter || 0), y: y + (Math.random() - 0.5) * (o.jitter || 0),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + (o.lift || 0),
        g: o.g, drag: o.drag, life: (o.life || 500) * (0.7 + Math.random() * 0.6),
        size: (o.size || 3) * (0.6 + Math.random() * 0.8),
        color: Array.isArray(o.color) ? o.color[(Math.random() * o.color.length) | 0] : o.color,
        shape: o.shape || 'sq', fade: o.fade !== false, shrink: o.shrink !== false, glow: o.glow
      });
    }
  };

  /* Hoạt ảnh VFX từ atlas, chạy một lần rồi tự xoá. Trả null khi atlas không có
     vai trò đó, để người gọi tự vẽ hạt thay thế. */
  Layer.prototype.sprite = function (role, x, y, scale, o) {
    if (!SPR || !SPR.has(role)) return null;
    o = o || {};
    var dur = SPR.duration(role, 'idle') * (o.slow || 1);
    var it = { kind: 's', role: role, x: x, y: y, scale: scale, t: 0, life: Math.max(120, dur),
      flip: o.flip, rot: o.rot || 0, alpha: o.alpha == null ? 1 : o.alpha, add: o.add, slow: o.slow || 1,
      anchor: o.anchor || 'center', vy: o.vy || 0 };
    this.items.push(it);
    return it;
  };

  /* Số bay: nảy to ra rồi co về, bay lên, mờ dần. */
  Layer.prototype.number = function (x, y, text, o) {
    o = o || {};
    this.items.push({ kind: 'n', x: x + (o.dx || 0), y: y, text: String(text), color: o.color || '#fff',
      size: o.size || 22, t: 0, life: o.life || 900, big: !!o.big, vx: o.vx || 0, icon: o.icon || null,
      rise: o.rise == null ? 46 : o.rise, digits: !!o.digits && /^[+-]?\d+$/.test(String(text)),
      px: o.px || 3, yellow: !!o.yellow });
  };

  /* Icon bật lên trên đầu (món đồ vừa kích, mũi tên tăng chỉ số): nảy to, lơ lửng, mờ. */
  Layer.prototype.popup = function (id, x, y, scale, o) {
    o = o || {};
    this.items.push({ kind: 'i', id: id, x: x, y: y, scale: scale, t: 0, life: o.life || 900,
      rise: o.rise == null ? 18 : o.rise, delay: o.delay || 0, glow: o.glow });
  };

  Layer.prototype.shake = function (amt) {
    if (!prefs.shake) return;
    this.shakeAmt = Math.max(this.shakeAmt, amt);
  };

  Layer.prototype.update = function (dt) {
    if (this.hitstop > 0) { this.hitstop -= dt; }
    var s = dt / 1000;
    for (var i = this.items.length - 1; i >= 0; i--) {
      var it = this.items[i];
      it.t += dt;
      if (it.kind === 'p') {
        var d = Math.pow(it.drag, dt / 16.7);
        it.vx *= d; it.vy = it.vy * d + it.g * s;
        it.x += it.vx * s; it.y += it.vy * s;
      } else if (it.kind === 's') {
        it.y += it.vy * s;
      }
      if (it.t >= it.life) this.items.splice(i, 1);
    }
    if (this.shakeAmt > 0) {
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 0.045 * (1 + this.shakeAmt * 0.08));
      this.shakeX = (Math.random() - 0.5) * 2 * this.shakeAmt;
      this.shakeY = (Math.random() - 0.5) * 2 * this.shakeAmt;
    } else { this.shakeX = this.shakeY = 0; }
  };

  Layer.prototype.draw = function (ctx, font) {
    for (var i = 0; i < this.items.length; i++) {
      var it = this.items[i], p = it.t / it.life;
      if (it.kind === 'p') {
        ctx.save();
        ctx.globalAlpha = it.fade ? clamp(1 - p * p, 0, 1) : 1;
        if (it.glow) ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = it.color;
        var sz = it.shrink ? it.size * (1 - p * 0.7) : it.size;
        if (it.shape === 'plus') {
          var u = Math.max(1, Math.round(sz / 3));
          ctx.fillRect(Math.round(it.x - u * 1.5), Math.round(it.y - u / 2), u * 3, u);
          ctx.fillRect(Math.round(it.x - u / 2), Math.round(it.y - u * 1.5), u, u * 3);
        } else if (it.shape === 'circle') {
          ctx.beginPath(); ctx.arc(it.x, it.y, sz, 0, 6.2832); ctx.fill();
        } else if (it.shape === 'spark') {
          var len = Math.min(18, Math.hypot(it.vx, it.vy) * 0.045) + sz;
          var ang = Math.atan2(it.vy, it.vx);
          ctx.translate(it.x, it.y); ctx.rotate(ang);
          ctx.fillRect(-len, -sz / 2, len, sz);
        } else {
          ctx.fillRect(Math.round(it.x - sz / 2), Math.round(it.y - sz / 2), Math.ceil(sz), Math.ceil(sz));
        }
        ctx.restore();
      } else if (it.kind === 's') {
        var fr = SPR.frames(it.role, 'idle');
        var n = Math.min(fr.length - 1, Math.floor(p * fr.length));
        var r = SPR.rect(fr[n]);
        var yy = it.anchor === 'bottom' ? it.y : it.y + r[3] * it.scale / 2;
        ctx.save();
        if (it.add) ctx.globalCompositeOperation = 'lighter';
        SPR.drawId(ctx, fr[n], it.x, yy, it.scale, { flip: it.flip, rot: it.rot, alpha: it.alpha });
        ctx.restore();
      } else if (it.kind === 'i') {
        var tt = it.t - it.delay;
        if (tt < 0) continue;
        var pp = tt / (it.life - it.delay);
        var bounce = tt < 220 ? E.outBack(tt / 220) : 1;
        var ia = pp < 0.75 ? 1 : 1 - (pp - 0.75) / 0.25;
        ctx.save();
        if (it.glow) {
          ctx.globalAlpha = 0.5 * ia;
          ctx.fillStyle = it.glow;
          ctx.beginPath();
          ctx.arc(it.x, it.y - it.rise * E.outCubic(Math.min(1, pp * 2)), it.scale * 12 * bounce, 0, 6.2832);
          ctx.fill();
        }
        ctx.restore();
        SPR.drawPivot(ctx, it.id, it.x, it.y - it.rise * E.outCubic(Math.min(1, pp * 2)), it.scale * bounce, { alpha: FX_clamp(ia, 0, 1) });
      } else if (it.kind === 'n' && it.digits && SPR && SPR.has('ui.digit')) {
        drawDigits(ctx, it, p);
      } else if (it.kind === 'n') {
        var pop = it.t < 140 ? E.outBack(it.t / 140) : 1;
        var sc = (it.big ? 1.9 : 1.35) - (it.big ? 0.9 : 0.35) * pop;
        if (it.t < 60) sc = (it.big ? 2.2 : 1.6) * (it.t / 60);
        var rise = E.outCubic(clamp(p * 1.4, 0, 1)) * it.rise;
        var alpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
        ctx.save();
        ctx.globalAlpha = clamp(alpha, 0, 1);
        ctx.translate(Math.round(it.x + it.vx * p), Math.round(it.y - rise));
        ctx.scale(sc, sc);
        ctx.font = (it.size) + 'px ' + (font || '"VT323",monospace');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(3, it.size * 0.22);
        ctx.strokeStyle = '#000';
        ctx.strokeText(it.text, 0, 0);
        ctx.fillStyle = it.color;
        ctx.fillText(it.text, 0, 0);
        ctx.restore();
      }
    }
  };

  Layer.prototype.clear = function () { this.items.length = 0; this.shakeAmt = 0; };

  function savePrefs() { try { localStorage.setItem(PKEY, JSON.stringify(prefs)); } catch (e) { /* riêng tư */ } }

  global.HIC_FX = {
    Layer: Layer, E: E, clamp: clamp, lerp: lerp, damp: damp,
    prefs: prefs,
    setPref: function (k, v) { prefs[k] = v; savePrefs(); }
  };
})(window);
