/* Màn hình trận đánh — hai nhân vật pixel đứng trên nền rừng, lao vào nhau.
 *
 * WHY: người chơi không bấm gì trong trận, nên 30 giây xem trận CHÍNH LÀ phần
 * thưởng cho những quyết định lúc còn sáng. Mỗi đòn đi theo nhịp của game hành
 * động: lấy đà -> lao (để lại dư ảnh) -> TRÚNG (khựng hình, camera giật, loé
 * trắng, bật lùi, số nảy) -> quay về. Số và thanh máu chỉ đổi ĐÚNG khoảnh khắc
 * trúng, không đổi lúc bắt đầu vung.
 * ROOT-CAUSE: nhật ký trận là một danh sách tức thời; muốn có lực thì mỗi dòng
 * phải được trải ra thành một chuỗi sự kiện có hẹn giờ (this.timers).
 *
 * Đợt 2 (2026-09-15) sau câu hỏi "anim, vfx, sfx đã chỉnh chu chưa":
 * - Hiệp sĩ Soul Knight không có khung tấn công, nên đòn đánh trông như lao thân
 *   vào húc. Giờ nhân vật CẦM đúng vũ khí đang lắp (icon của món ở ô 0) và vung
 *   nó theo cung; cung thì bắn tên thay vì lao tới.
 * - Món đồ vừa kích bật icon lên trên đầu người, không chỉ sáng ô dưới góc —
 *   mắt người xem đang nhìn nhân vật, không nhìn góc màn.
 * - Giáp có vỏ sáng khi còn, và VỠ ra (nổ xanh + tiếng kính) lúc về 0.
 * - Số sát thương dùng chữ số pixel HoloCure, số liền nhau không chồng lên nhau.
 * - Quái chết tan thành chính các điểm ảnh của nó; thắng thì xu nảy trên đất.
 */
(function (global) {
  'use strict';

  var A = global.HIC_ART, SPR = global.HIC_SPR, SFX = global.HIC_SFX, FX = global.HIC_FX, E = FX.E;

  function play(n, a) { if (SFX) SFX.play(n, a); }
  function baseName(n) {
    if (!n) return n;
    if (n.indexOf('Golden ') === 0) return n.slice(7);
    if (n.indexOf('Diamond ') === 0) return n.slice(8);
    return n;
  }

  var BLADE = { 'icon.sword': 1, 'icon.dagger': 1, 'icon.spear': 1, 'icon.axe': 1, 'icon.whip': 1 };
  var WEAPON_KIND = function (role) {
    if (role === 'icon.bow') return 'bow';
    if (BLADE[role]) return 'blade';
    return 'blunt';
  };

  function Fighter(side, role, name, isBoss) {
    this.side = side;               // 0 = người chơi (trái), 1 = địch (phải)
    this.role = role;               // vai trò trong atlas, hoặc null -> hình vector
    this.name = name;
    this.boss = !!isBoss;
    this.dx = side === 0 ? -400 : 400;   // bắt đầu ngoài màn, chạy vào
    this.dy = 0; this.sx = 1; this.sy = 1; this.rot = 0;
    this.flash = 0; this.flashColor = '#fff'; this.anim = 'run'; this.animT = 0;
    this.dead = false; this.deadT = 0; this.gone = false;
    this.tweens = {};
    this.trail = []; this.trailOn = false;
    this.wAngle = -0.7; this.wTween = null;   // góc vũ khí trên tay
  }

  function Fight(canvas, res, foeName, isBoss, opts) {
    opts = opts || {};
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.res = res;
    this.foeName = foeName;
    this.isBoss = !!isBoss;
    this.night = !!opts.night;
    this.lines = res.log || [];
    this.idx = 0;
    this.speed = opts.speed || 1;
    this.acc = 0;
    this.time = 0;
    this.done = false;
    this.snap = this.lines.length ? this.lines[0] : null;
    this.shown = this.lines.length ? { a: this.lines[0].a, b: this.lines[0].b } : null;
    this.timers = [];
    this.fx = new FX.Layer();
    this.slowmo = 1; this.slowT = 0;
    this.flashScreen = 0; this.flashColor = '#fff';
    this.zoom = 1; this.zoomX = 0; this.zoomY = 0;
    this.gray = 0;
    this.hooks = opts.hooks || {};
    this.coins = [];
    this.stack = [{ n: 0, at: -1e9 }, { n: 0, at: -1e9 }];
    this.procN = 0;
    // vũ khí trên tay người chơi
    var w = opts.weapon || null;
    this.weaponRole = w && SPR ? SPR.iconRole(w) : null;
    if (this.weaponRole && !SPR.has(this.weaponRole)) this.weaponRole = null;
    this.weaponKind = WEAPON_KIND(this.weaponRole);
    this.itemRoles = {};
    var self = this;
    (opts.items || []).forEach(function (it) {
      var r = SPR && SPR.iconRole(it);
      if (r) self.itemRoles[baseName(it.name)] = r;
    });
    this.fighters = [
      new Fighter(0, SPR && SPR.has('hero') ? 'hero' : null, 'Bạn', false),
      new Fighter(1, SPR ? SPR.creatureRole(foeName) : null, foeName, isBoss)
    ];
    this.foeEffect = opts.foeEffect || null;
    var seed = 0;
    for (var i = 0; i < foeName.length; i++) seed = (seed * 31 + foeName.charCodeAt(i)) >>> 0;
    this.seed = seed;
    this.motes = [];
  }

  /* --------------------------------------------------------------- kích thước */

  Fight.prototype.fit = function () {
    var r = this.cv.getBoundingClientRect();
    var dpr = Math.min(2, global.devicePixelRatio || 1);
    this.dpr = dpr;
    this.w = Math.max(1, Math.round(r.width));
    this.h = Math.max(1, Math.round(r.height));
    this.cv.width = Math.round(this.w * dpr);
    this.cv.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    // Hệ số pixel chung: một điểm ảnh gốc = k điểm ảnh CSS.
    this.k = Math.max(2, Math.round(Math.min(this.h / 120, this.w / 200)));
    // Màn dọc: cỡ nhân vật tính theo "chiều cao hiệu dụng", nếu không hai con to bằng nửa màn.
    this.eh = Math.min(this.h, this.w * 0.9);
    this.groundY = Math.round(this.h > this.w ? this.h * 0.60 : this.h * 0.74);
    this.scales = [this.scaleFor(0), this.scaleFor(1)];
    this.backdrop = null;
  };

  Fight.prototype.scaleFor = function (side) {
    var f = this.fighters[side];
    if (!f.role) return this.k;
    var sz = SPR.size(f.role, 'idle');
    var eh = this.eh || this.h;
    var target = side === 0 ? eh * 0.20 : (f.boss ? eh * 0.36 : eh * 0.22);
    var s = Math.floor(target / sz.h);
    while (s > 1 && sz.w * s > this.w * 0.42) s--;
    return Math.max(side === 0 ? 2 : Math.max(2, this.k - 1), s);
  };

  /* Hệ số cho một VFX theo cỡ muốn thấy trên màn (CSS px), tính theo khung LỚN
     NHẤT của nó. WHY: khung đầu của spr_GlowExplosion chỉ 24px nhưng các khung
     vòng sóng sau rộng 93px — nhân theo hệ số pixel chung thì quầng nổ vỡ giáp
     phủ kín nửa màn. Làm tròn tới nửa đơn vị để pixel không vỡ quá nhiều. */
  Fight.prototype.vs = function (role, px) {
    var m = SPR && SPR.maxDim ? SPR.maxDim(role) : 0;
    if (!m) return this.k;
    return Math.max(0.5, Math.round(px / m * 2) / 2);
  };

  Fight.prototype.homeX = function (side) { return this.w * (side === 0 ? 0.30 : 0.70); };

  /* ------------------------------------------------------------- lịch hẹn */

  Fight.prototype.after = function (ms, fn) { this.timers.push({ at: this.time + ms, fn: fn }); };

  /* Tween theo TỪNG thuộc tính, để một cú bật lùi (dx) không huỷ cú nghiêng (rot)
     đang chạy — bản đầu dùng một tween cho cả nhóm và cú trúng đòn thứ hai
     giật nhân vật về tư thế cũ giữa chừng. */
  Fight.prototype.tweenTo = function (f, props, dur, ease) {
    for (var k in props) {
      f.tweens[k] = { from: f[k], to: props[k], t: 0, dur: dur, ease: ease || E.outCubic };
    }
  };

  /* ------------------------------------------------------------- trợ giúp */

  Fight.prototype.size = function (side) {
    var f = this.fighters[side], sc = this.scales[side];
    if (!f.role) return { w: this.h * 0.2, h: this.h * 0.22 };
    var s = SPR.size(f.role, 'idle');
    return { w: s.w * sc, h: s.h * sc };
  };

  Fight.prototype.center = function (side) {
    var f = this.fighters[side], s = this.size(side);
    return { x: this.homeX(side) + f.dx, y: this.groundY - s.h * 0.5 + f.dy, h: s.h, w: s.w };
  };

  Fight.prototype.face = function (side) {
    var f = this.fighters[side];
    if (!f.role) return false;
    var g = SPR.group(f.role);
    if (g && g.face === 'front') return false;
    if (g && g.face === 'left') return side === 0;
    return side === 1;
  };

  Fight.prototype.showSnap = function (ln) {
    if (!ln) return;
    var prev = this.shown;
    this.shown = ln;
    if (this.hooks.snap && ln.a) this.hooks.snap(ln, prev);
  };

  Fight.prototype.side = function (i) { return this.shown ? (i === 0 ? this.shown.a : this.shown.b) : null; };

  /* Món đồ vừa kích: sáng ô dưới góc (hook) VÀ bật icon lên trên đầu người. */
  Fight.prototype.lightItem = function (side, src, strike) {
    var key = strike ? '__weapon' : baseName(src);
    if (this.hooks.trigger) this.hooks.trigger(side, key);
    if (strike || !src) return;
    var c = this.center(side);
    var top = c.y - c.h * 0.5 - this.k * 6;
    var role = side === 0 ? this.itemRoles[key] : null;
    if (role && SPR.has(role)) {
      var id = SPR.frameN(role, 0), r = SPR.rect(id);
      var sc = Math.max(1, Math.round(this.k * 16 / Math.max(r[2], r[3], 16)));
      this.fx.popup(id, c.x + (this.procN % 2 ? 1 : -1) * this.k * 5, top, sc, { life: 720, rise: this.k * 8, glow: 'rgba(255,230,140,.35)' });
      this.fx.sprite('vfx.sparkle', c.x + this.k * 8, top - this.k * 4, this.vs('vfx.sparkle', c.h * 0.3), { add: true });
      play('proc', this.procN++);
    } else if (side === 1 && this.foeEffect) {
      this.fx.sprite('vfx.sparkle', c.x, top, this.vs('vfx.sparkle', c.h * 0.4), { add: true });
      play('proc', 3);
    }
  };

  Fight.prototype.handPos = function () {
    var f = this.fighters[0], s = this.size(0);
    return { x: this.homeX(0) + f.dx + s.w * 0.12 * f.sx, y: this.groundY + f.dy - s.h * 0.34 * f.sy };
  };

  /* ------------------------------------------------------------- mở màn */

  Fight.prototype.intro = function () {
    var self = this;
    this.fighters.forEach(function (f) {
      f.anim = 'run';
      self.tweenTo(f, { dx: 0 }, 520, E.outCubic);
    });
    this.after(540, function () {
      self.fighters.forEach(function (f) { f.anim = 'idle'; });
      [0, 1].forEach(function (s) {
        var c = self.center(s);
        self.fx.sprite('vfx.smoke', c.x - (s === 0 ? 1 : -1) * c.w * 0.3, self.groundY, self.vs('vfx.smoke', c.h * 0.9), { anchor: 'bottom', flip: s === 1, alpha: 0.8 });
      });
      play('thud');
    });
    this.after(80, function () { play('fightStart'); });
    if (this.isBoss) {
      this.after(380, function () {
        var c = self.center(1);
        self.fx.sprite('vfx.spawn', c.x, self.groundY, self.vs('vfx.spawn', c.h * 1.5), { anchor: 'bottom', add: true });
      });
      this.after(560, function () {
        self.fx.shake(12);
        self.flashScreen = 0.45; self.flashColor = '#ff2a2a';
        self.zoom = 1.06; self.zoomX = self.center(1).x; self.zoomY = self.groundY;
        play('roar');
        var c = self.center(1);
        self.fx.burst(c.x, self.groundY, 30, { color: ['#6b5040', '#8a6a50', '#3a2a20'], speed: 240, g: 600, life: 800, size: self.k * 1.5, angle: -Math.PI / 2, spread: 2.4 });
      });
    }
  };

  /* ------------------------------------------------------------- một dòng */

  Fight.prototype.step = function () {
    if (this.idx >= this.lines.length) { this.finish(); return 0; }
    var ln = this.lines[this.idx++];
    this.snap = ln;
    var self = this;
    /* Trận dài (hơn 40 dòng) tự tăng nhịp dần: mấy lượt đầu để hiểu trận, lượt
       thứ 30 thì chỉ cần thấy máu tụt. */
    var ramp = this.idx > 40 ? Math.max(0.45, 1 - (this.idx - 40) / 90) : 1;
    var hold = 380, c;

    switch (ln.k) {
      case 'strike':
        this.swing(ln.by, ln.i, null, ln);
        hold = 640;
        break;
      case 'dmg':
        if (ln.strike && ln.by != null) { this.swing(ln.by, ln.i, ln, ln); hold = 720; }
        else { this.zap(ln); hold = 560; }
        break;
      case 'heal':
        this.lightItem(ln.i, ln.src);
        this.showSnap(ln);
        this.pulse(ln.i, '#7dff8a');
        this.floatOn(ln.i, '+' + ln.v, '#7dff8a', false);
        c = this.center(ln.i);
        for (var h = 0; h < 12; h++) {
          this.fx.particle({ x: c.x + (Math.random() - 0.5) * c.w * 0.8, y: this.groundY - Math.random() * c.h * 0.4,
            vx: 0, vy: -40 - Math.random() * 60, g: -30, drag: 0.98, life: 700 + Math.random() * 400,
            size: this.k * 2, color: h % 3 ? '#7dff8a' : '#e8ffd8', shape: 'plus', shrink: false });
        }
        play('heal');
        hold = 480;
        break;
      case 'armor':
        this.lightItem(ln.i, ln.src);
        this.showSnap(ln);
        this.pulse(ln.i, '#6fc2ff');
        this.floatOn(ln.i, '+' + ln.v, '#8fd0ff', false, 'arm');
        c = this.center(ln.i);
        if (!this.fx.sprite('vfx.armor', c.x, c.y - c.h * 0.2, this.vs('vfx.armor', c.h * 0.6), { add: false })) {
          this.fx.burst(c.x, c.y, 12, { color: ['#8fd0ff', '#e2f4ff'], speed: 90, life: 500, size: 3, glow: true });
        }
        play('armorUp');
        hold = 460;
        break;
      case 'armorloss':
        this.showSnap(ln);
        hold = 100;
        break;
      case 'thorns':
        this.showSnap(ln);
        if (ln.v > 0) {
          this.lightItem(ln.i, ln.src);
          c = this.center(ln.i);
          this.fx.burst(c.x, c.y, 14, { color: ['#9be36a', '#4f9a3a'], speed: 160, life: 380, size: this.k, shape: 'spark' });
          this.statIcon(ln.i, null, '#9be36a');
          play('thorns');
          hold = 420;
        } else hold = 90;
        break;
      case 'atk':
        this.lightItem(ln.i, ln.src);
        this.showSnap(ln);
        if (ln.v > 0) { this.statIcon(ln.i, 0, '#ffbe4d'); this.pulse(ln.i, '#ffbe4d'); play('buff'); }
        else { this.statIcon(ln.i, -1, '#b9c7d3'); play('debuff'); }
        hold = 440;
        break;
      case 'spd':
        this.lightItem(ln.i, ln.src);
        this.showSnap(ln);
        if (ln.v > 0) { this.statIcon(ln.i, 1, '#d4ff6b'); this.pulse(ln.i, '#d4ff6b'); play('buff'); }
        else { this.statIcon(ln.i, -3, '#b9c7d3'); play('debuff'); }
        hold = 420;
        break;
      case 'stun':
        this.showSnap(ln);
        this.floatText(ln.i, 'CHOÁNG', '#ffe27a');
        this.fighters[ln.i].sy = 0.8;
        this.tweenTo(this.fighters[ln.i], { sy: 1 }, 400, E.outElastic);
        this.fighters[ln.i].rot = (ln.i === 0 ? -1 : 1) * 0.2;
        this.tweenTo(this.fighters[ln.i], { rot: 0 }, 700, E.outElastic);
        play('stun'); play('tweet');
        hold = 760;
        break;
      case 'death':
        this.kill(ln.i);
        this.showSnap(ln);
        hold = 1600;
        break;
      default:
        hold = 240;
    }
    return hold * ramp;
  };

  /* Icon tăng/giảm chỉ số bật lên (HoloCure spr_StatUpEffect / spr_statusEffects).
     n >= 0: khung tăng (0 công, 1 tốc, 5 máu); n < 0: khung giảm -(n+1). */
  Fight.prototype.statIcon = function (side, n, color) {
    var c = this.center(side), top = c.y - c.h * 0.5 - this.k * 4;
    var role = n == null ? null : (n >= 0 ? 'ui.statup' : 'ui.statdown');
    if (role && SPR && SPR.has(role)) {
      this.fx.popup(SPR.frameN(role, n >= 0 ? n : -(n + 1)), c.x + this.k * 9, top + this.k * 3, this.k, { life: 900, rise: this.k * 10, delay: 120 });
    }
    if (n != null && n < 0) this.fx.sprite('vfx.debuff', c.x, c.y - c.h * 0.1, this.vs('vfx.debuff', c.h * 0.7), {});
    else {
      for (var i = 0; i < 8; i++) {
        this.fx.particle({ x: c.x + (Math.random() - 0.5) * c.w, y: this.groundY - Math.random() * c.h * 0.3,
          vx: 0, vy: -90 - Math.random() * 70, g: 0, drag: 0.97, life: 520, size: this.k * 1.2, color: color, shape: 'spark', glow: true });
      }
    }
  };

  /* Một nhát đánh bằng vũ khí: lấy đà -> lao -> trúng -> về. */
  Fight.prototype.swing = function (by, target, ln, anyLn) {
    var self = this, a = this.fighters[by], d = this.fighters[target];
    if (!a || !d) return;
    var dir = by === 0 ? 1 : -1;
    var gap = Math.abs(this.homeX(1) - this.homeX(0));
    var bow = by === 0 && this.weaponKind === 'bow';

    // lấy đà: lùi, nén, vũ khí vung ra sau
    a.anim = 'idle';
    this.tweenTo(a, { dx: -dir * this.k * 6, sx: 0.86, sy: 1.12, rot: -dir * 0.12 }, 120, E.outCubic);
    if (by === 0) a.wTween = { from: a.wAngle, to: bow ? -0.05 : -2.3, t: 0, dur: 120, ease: E.outCubic };

    if (bow) {
      this.after(130, function () {
        play('swingBow');
        a.wTween = { from: a.wAngle, to: 0.15, t: 0, dur: 60, ease: E.outCubic };
        self.tweenTo(a, { dx: -self.k * 10, sx: 1.05, sy: 0.95, rot: 0.05 }, 90, E.outCubic);
        var hp = self.handPos(), tc = self.center(target);
        var n = 10;
        for (var s = 0; s < n; s++) {
          (function (s) {
            self.after(s * 11, function () {
              var t = (s + 1) / n;
              self.fx.particle({ x: FX.lerp(hp.x, tc.x, t), y: FX.lerp(hp.y, tc.y, t), vx: 0, vy: 0, life: 140,
                size: self.k * (s === n - 1 ? 2 : 1), color: s === n - 1 ? '#fff' : '#ffe9a8', shape: 'sq', glow: true });
            });
          })(s);
        }
      });
      this.after(250, function () { if (ln) self.impact(ln); else self.miss(target, anyLn); });
    } else {
      // lao tới: bật dư ảnh, vũ khí chém xuống
      this.after(120, function () {
        a.anim = SPR && a.role && SPR.hasAnim(a.role, 'attack') ? 'attack' : 'run';
        a.animT = 0;
        a.trailOn = true;
        self.tweenTo(a, { dx: dir * gap * 0.40, sx: 1.14, sy: 0.9, rot: dir * 0.1 }, 100, E.inCubic);
        if (by === 0) a.wTween = { from: a.wAngle, to: 1.05, t: 0, dur: 110, ease: E.inCubic };
        play(by === 0 ? (self.weaponKind === 'blade' ? 'swingBlade' : 'swingBlunt') : 'swingClaw');
        play('dash');
      });
      this.after(190, function () {
        var tc = self.center(target);
        self.fx.sprite('vfx.swipe', tc.x - dir * tc.w * 0.15, tc.y - tc.h * 0.05, self.vs('vfx.swipe', tc.h * 1.1), { flip: dir < 0, add: true, rot: dir * -0.3 });
      });
      this.after(220, function () { a.trailOn = false; if (ln) self.impact(ln); else self.miss(target, anyLn); });
    }
    this.after(bow ? 330 : 310, function () {
      self.tweenTo(a, { dx: 0, sx: 1, sy: 1, rot: 0 }, 280, E.outCubic);
      if (by === 0) a.wTween = { from: a.wAngle, to: -0.7, t: 0, dur: 320, ease: E.outBack };
    });
    this.after(600, function () { if (!a.dead) a.anim = 'idle'; });
  };

  Fight.prototype.miss = function (target, ln) {
    this.floatText(target, 'HỤT', '#b9c7d3');
    if (ln) this.showSnap(ln);
    var d = this.fighters[target];
    this.tweenTo(d, { dy: -this.k * 6 }, 120, E.outCubic);
    var self = this;
    this.after(130, function () { self.tweenTo(d, { dy: 0 }, 200, E.inCubic); });
  };

  /* Sát thương không đến từ vũ khí (bom, gai, hiệu ứng đồ): một vệt sáng bay từ
     người gây ra sang người chịu, rồi mới nổ. */
  Fight.prototype.zap = function (ln) {
    var self = this;
    var from = ln.by != null ? ln.by : (ln.i === 0 ? 1 : 0);
    var thorns = /gai$/.test(ln.src || '');
    if (ln.src && !thorns) this.lightItem(from, ln.src);
    if (from === ln.i) { this.impact(ln); return; }
    var a = this.center(from), b = this.center(ln.i);
    var col = thorns ? '#9be36a' : '#ffcf6a';
    var n = 9;
    for (var s = 0; s < n; s++) {
      (function (s) {
        self.after(s * 14, function () {
          var t = s / n;
          self.fx.particle({ x: FX.lerp(a.x, b.x, t), y: FX.lerp(a.y, b.y, t) - Math.sin(t * Math.PI) * a.h * 0.4,
            vx: 0, vy: 0, life: 240, size: self.k * (thorns ? 1.5 : 2.5) - s * 0.2, color: col, shape: thorns ? 'spark' : 'sq', glow: true });
        });
      })(s);
    }
    play(thorns ? 'thorns' : 'swingBlunt');
    this.after(150, function () { self.impact(ln); });
  };

  Fight.prototype.impact = function (ln) {
    var self = this, t = ln.i, d = this.fighters[t];
    var c = this.center(t);
    var maxHp = t === 0 ? ln.a.maxHp : ln.b.maxHp;
    var big = ln.hp > 0 && ln.hp >= Math.max(3, maxHp * 0.25);
    var dir = t === 0 ? -1 : 1;
    var prevArmor = (this.side(t) || {}).armor || 0;
    var nowArmor = t === 0 ? ln.a.armor : ln.b.armor;
    if (ln.strike) this.lightItem(ln.by, null, true);

    this.showSnap(ln);
    // khựng hình + camera giật về phía cú đánh
    this.fx.hitstop = big ? 120 : 65;
    this.zoom = big ? 1.07 : 1.035; this.zoomX = c.x; this.zoomY = c.y;
    d.flash = 1; d.flashColor = '#ffffff';
    d.anim = 'hit'; d.animT = 0;
    d.dx = dir * this.k * (big ? 12 : 6);
    d.sx = 1.2; d.sy = 0.84; d.rot = dir * (big ? 0.28 : 0.14);
    this.tweenTo(d, { dx: 0, sx: 1, sy: 1, rot: 0 }, 360, E.outBack);
    this.after(280, function () { if (!d.dead) d.anim = 'idle'; });

    var hitX = c.x - dir * c.w * 0.22, hitY = c.y - c.h * 0.05;
    if (big) {
      this.fx.sprite('vfx.boom', hitX, hitY, this.vs('vfx.boom', c.h * 1.3), { add: false });
      this.fx.sprite('vfx.crit', hitX, hitY, this.vs('vfx.crit', c.h * 1.1), { add: true, flip: t === 0 });
      this.flashScreen = 0.3; this.flashColor = '#fff';
    } else if (ln.strike) {
      var heroBlunt = ln.by === 0 && this.weaponKind === 'blunt';
      this.fx.sprite(heroBlunt ? 'vfx.boom' : 'vfx.hit', hitX, hitY, this.vs(heroBlunt ? 'vfx.boom' : 'vfx.hit', c.h * (heroBlunt ? 0.85 : 0.7)), { add: true, flip: t === 0 });
      if (ln.by === 0 && this.weaponKind === 'blade') this.fx.sprite('vfx.slash', c.x, c.y - c.h * 0.4, this.vs('vfx.slash', c.h * 1.0), { add: true, flip: t === 0 });
    } else {
      this.fx.sprite('vfx.hit', hitX, hitY, this.vs('vfx.hit', c.h * 0.6), { add: true });
    }
    this.fx.burst(hitX, hitY, big ? 16 : 9, { color: ['#ffffff', '#ffe27a', '#ff9a4a'], speed: big ? 360 : 240, life: 260, size: this.k, shape: 'spark', glow: true, angle: dir > 0 ? 0 : Math.PI, spread: 2.2 });
    // bụi dưới chân khi bị đẩy lùi
    this.fx.sprite('vfx.smoke', c.x - dir * c.w * 0.2, this.groundY, this.vs('vfx.smoke', c.h * (big ? 0.9 : 0.6)), { anchor: 'bottom', flip: dir < 0, alpha: 0.85 });

    if (ln.ar > 0) {
      this.floatOn(t, '-' + ln.ar, '#8fd0ff', false, 'arm');
      this.fx.sprite('vfx.spark', hitX, hitY - c.h * 0.1, this.vs('vfx.spark', c.h * 0.6), { add: true });
      this.fx.burst(hitX, hitY, 10, { color: ['#dff2ff', '#6fc2ff'], speed: 280, g: 500, life: 420, size: this.k * 1.2, angle: dir > 0 ? 0 : Math.PI, spread: 2 });
      play('armor');
      if (prevArmor > 0 && nowArmor <= 0) {
        this.after(60, function () {
          self.fx.sprite('vfx.glow', c.x, c.y, self.vs('vfx.glow', c.h * 1.3), { add: true });
          for (var s = 0; s < 18; s++) {
            var ang = Math.random() * Math.PI * 2;
            self.fx.particle({ x: c.x, y: c.y, vx: Math.cos(ang) * 260, vy: Math.sin(ang) * 260 - 120, g: 700, drag: 0.97,
              life: 700, size: self.k * 2, color: s % 2 ? '#bfe6ff' : '#5fb4ff', shape: 'sq', shrink: false });
          }
          self.floatText(t, 'VỠ GIÁP', '#8fd0ff');
          self.fx.shake(7);
          play('armorBreak');
        });
      }
    }
    if (ln.hp > 0) {
      this.floatOn(t, '-' + ln.hp, big ? '#ffe27a' : (t === 0 ? '#ff6a5a' : '#ffffff'), big);
      this.fx.burst(c.x, c.y, big ? 18 : 10, { color: ['#ff3a4a', '#a01020', '#ff7a6a'], speed: big ? 280 : 190, g: 800, life: 560, size: this.k * 1.2, angle: dir > 0 ? -0.3 : Math.PI + 0.3, spread: 1.6 });
      this.fx.shake(big ? 10 : 4);
      var p = Math.min(1, ln.hp / Math.max(1, maxHp) * 3);
      if (big) play('crit');
      if (ln.strike && ln.by === 0) play(this.weaponKind === 'blade' ? 'hitBlade' : 'hitBlunt', p);
      else play(this.fighters[t].boss || this.fighters[ln.by === 1 ? 1 : 0].boss ? 'hitBlunt' : 'hitFlesh', p);
    } else if (!(ln.ar > 0)) {
      this.floatOn(t, '0', '#b9c7d3', false);
      play('bump');
    }
    if (this.hooks.hurt) this.hooks.hurt(t, ln.hp || 0, ln.ar || 0);
  };

  Fight.prototype.kill = function (side) {
    var self = this, f = this.fighters[side];
    f.dead = true; f.deadT = 0; f.anim = 'dead'; f.animT = 0;
    this.fx.hitstop = 200;
    this.slowmo = 0.5; this.slowT = 520;
    this.fx.shake(12);
    var c = this.center(side);
    // ba lần chớp trắng rồi mới tan
    [0, 80, 160].forEach(function (ms) {
      self.after(ms, function () { f.flash = 1; f.flashColor = '#fff'; });
    });
    if (side === 1) {
      this.after(250, function () {
        play('death');
        self.disintegrate(1);
        f.gone = true;
        self.fx.sprite('vfx.death', c.x, c.y - c.h * 0.2, self.vs('vfx.death', c.h * 0.8), {});
        self.fx.sprite('vfx.smoke', c.x, self.groundY, self.vs('vfx.smoke', c.h * 1.1), { anchor: 'bottom' });
      });
      this.after(460, function () { self.spawnCoins(c.x, c.y, self.fighters[1].boss ? 16 : 7); });
      this.after(900, function () {
        // người chơi nhảy mừng, giơ vũ khí
        var h = self.fighters[0];
        h.wTween = { from: h.wAngle, to: -1.7, t: 0, dur: 200, ease: E.outBack };
        self.tweenTo(h, { dy: -self.k * 14 }, 180, E.outCubic);
        self.after(190, function () { self.tweenTo(h, { dy: 0 }, 180, E.inCubic); });
        self.after(420, function () { self.tweenTo(h, { dy: -self.k * 9 }, 150, E.outCubic); });
        self.after(580, function () { self.tweenTo(h, { dy: 0 }, 150, E.inCubic); play('thud'); });
      });
    } else {
      // người chơi gục: ngã nghiêng, tim vỡ, màn xám dần
      this.after(300, function () {
        play('death');
        play('heartbeat');
        self.tweenTo(f, { rot: -1.45, dy: self.k * 2 }, 520, E.outBack);
        self.fx.sprite('vfx.heart', c.x, c.y - c.h * 0.9, self.vs('vfx.heart', c.h * 0.5), { slow: 2 });
        self.fx.burst(c.x, c.y, 20, { color: ['#ff5a4a', '#7a1020'], speed: 200, g: 500, life: 800, size: self.k * 1.3 });
        self.grayTarget = 0.75;
      });
      this.after(1000, function () { play('heartbeat'); });
    }
  };

  /* Tan xác thành đúng các điểm ảnh của khung đang hiện. Đọc pixel từ atlas cần
     canvas không bị "bẩn" nguồn: trên Pages cùng nguồn nên đọc được; mở bằng
     file:// thì getImageData ném lỗi và ta lùi về một nắm hạt màu xám. */
  Fight.prototype.disintegrate = function (side) {
    var f = this.fighters[side], c = this.center(side), sc = this.scales[side];
    if (!f.role) return;
    var id = SPR.frameAt(f.role, 'idle', f.animT);
    var r = SPR.rect(id);
    var ok = false;
    try {
      var cv = document.createElement('canvas');
      cv.width = r[2]; cv.height = r[3];
      var x = cv.getContext('2d');
      SPR.drawId(x, id, r[2] / 2, r[3], 1, { flip: this.face(side) });
      var px = x.getImageData(0, 0, r[2], r[3]).data;
      var step = Math.max(1, Math.round(Math.max(r[2], r[3]) / 26));
      var left = c.x - r[2] * sc / 2, top = this.groundY - r[3] * sc;
      for (var yy = 0; yy < r[3]; yy += step) {
        for (var xx = 0; xx < r[2]; xx += step) {
          var o = (yy * r[2] + xx) * 4;
          if (px[o + 3] < 128) continue;
          var ang = Math.atan2(yy - r[3] / 2, xx - r[2] / 2);
          this.fx.particle({
            x: left + (xx + step / 2) * sc, y: top + (yy + step / 2) * sc,
            vx: Math.cos(ang) * (40 + Math.random() * 90) + (Math.random() - 0.5) * 40,
            vy: -60 - Math.random() * 140 + Math.sin(ang) * 30, g: -40, drag: 0.95,
            life: 600 + Math.random() * 700, size: sc * step, color: 'rgb(' + px[o] + ',' + px[o + 1] + ',' + px[o + 2] + ')',
            shape: 'sq', shrink: true
          });
        }
      }
      ok = true;
    } catch (e) { /* canvas bị bẩn nguồn khi mở bằng file:// */ }
    if (!ok) this.fx.burst(c.x, c.y, 40, { color: ['#ffffff', '#c9d6e2', '#6b7a88'], speed: 220, g: -60, life: 900, size: this.k * 2 });
  };

  /* Xu HoloCure: văng lên, rơi, nảy hai lần trên mặt đất rồi nằm lấp lánh. */
  Fight.prototype.spawnCoins = function (x, y, n) {
    for (var i = 0; i < n; i++) {
      this.coins.push({ x: x, y: y, vx: (Math.random() - 0.5) * 360, vy: -220 - Math.random() * 280, t: Math.random() * 500, bounces: 0 });
    }
    play('coin');
  };

  Fight.prototype.updateCoins = function (dt) {
    var s = dt / 1000;
    for (var i = 0; i < this.coins.length; i++) {
      var c = this.coins[i];
      c.t += dt;
      if (c.bounces >= 3) continue;
      c.vy += 1100 * s;
      c.x += c.vx * s; c.y += c.vy * s;
      if (c.y > this.groundY + 4 && c.vy > 0) {
        c.y = this.groundY + 4;
        c.vy *= -0.45; c.vx *= 0.6;
        c.bounces++;
        if (c.bounces === 1) play('coinBounce');
        if (c.bounces >= 3) { c.vy = 0; c.vx = 0; }
      }
    }
  };

  Fight.prototype.drawCoins = function () {
    var ctx = this.ctx;
    for (var i = 0; i < this.coins.length; i++) {
      var c = this.coins[i];
      if (SPR && SPR.has('vfx.coin')) {
        SPR.drawId(ctx, SPR.frameAt('vfx.coin', 'idle', c.t), c.x, c.y, this.vs('vfx.coin', this.size(0).h * 0.2), {});
      } else {
        ctx.fillStyle = '#ffd452';
        ctx.fillRect(Math.round(c.x - this.k * 2), Math.round(c.y - this.k * 4), this.k * 4, this.k * 4);
      }
    }
  };

  Fight.prototype.pulse = function (side, color) {
    var f = this.fighters[side];
    f.flash = 0.7; f.flashColor = color;
    f.sy = 1.14; f.sx = 0.9;
    this.tweenTo(f, { sx: 1, sy: 1 }, 320, E.outBack);
  };

  /* Số: chồng dọc nếu hai số ra sát nhau, để "-1 giáp" và "-3 máu" cùng một đòn
     không đè lên nhau. */
  Fight.prototype.floatOn = function (side, text, color, big, kind) {
    var c = this.center(side);
    var st = this.stack[side];
    if (this.time - st.at > 320) st.n = 0;
    st.at = this.time;
    var off = st.n++ * this.k * 9;
    var px = Math.max(2, Math.round(this.k * (big ? 1.34 : 1.1)));
    this.fx.number(c.x + (side === 0 ? -1 : 1) * this.k * (kind === 'arm' ? 10 : 2), c.y - c.h * 0.55 - off, text, {
      color: color, big: big, size: Math.round(this.k * (big ? 10 : 8)), life: big ? 1150 : 950,
      rise: c.h * 0.45, vx: (side === 0 ? -1 : 1) * this.k * 6, digits: true, px: px, yellow: big
    });
  };

  Fight.prototype.floatText = function (side, text, color) {
    var c = this.center(side);
    this.fx.number(c.x, c.y - c.h * 1.15, text, {
      color: color, big: true, size: Math.round(Math.max(this.k * 7, (this.eh || this.h) * 0.05)), life: 1000, rise: c.h * 0.25
    });
  };

  Fight.prototype.finish = function () {
    if (this.done) return;
    this.done = true;
    if (this.lines.length) this.showSnap(this.lines[this.lines.length - 1]);
    play(this.res.playerWon ? 'win' : 'lose');
    if (this.onDone) this.onDone();
  };

  Fight.prototype.skip = function () {
    this.timers.length = 0;
    this.fx.clear();
    this.idx = this.lines.length;
    var last = this.lines[this.lines.length - 1];
    var self = this;
    this.fighters.forEach(function (f) { f.dx = 0; f.sx = f.sy = 1; f.rot = 0; f.tweens = {}; f.trailOn = false; });
    if (last && last.k === 'death') {
      var f = this.fighters[last.i];
      f.dead = true; f.deadT = 2000; f.anim = 'dead';
      if (last.i === 1) { f.gone = true; this.spawnCoins(this.center(1).x, this.center(1).y, 6); }
      else { f.rot = -1.45; self.grayTarget = 0.75; }
    }
    this.finish();
  };

  /* ------------------------------------------------------------------ vẽ */

  Fight.prototype.buildBackdrop = function () {
    var w = this.w, h = this.h, k = this.k, gy = this.groundY;
    var c = document.createElement('canvas');
    c.width = Math.round(w * this.dpr); c.height = Math.round(h * this.dpr);
    var x = c.getContext('2d');
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    x.imageSmoothingEnabled = false;
    var boss = this.isBoss, night = this.night;
    var sky = x.createLinearGradient(0, 0, 0, gy);
    if (boss) { sky.addColorStop(0, '#1a060c'); sky.addColorStop(1, '#5a1a1e'); }
    else if (night) { sky.addColorStop(0, '#070a1c'); sky.addColorStop(1, '#1c2446'); }
    else { sky.addColorStop(0, '#3f7fb8'); sky.addColorStop(1, '#a9d7d2'); }
    x.fillStyle = sky; x.fillRect(0, 0, w, gy);

    x.fillStyle = boss ? '#ff5a3a' : night ? '#e8ecff' : '#fff6c8';
    var mr = k * 9;
    x.beginPath(); x.arc(w * 0.82, gy * 0.26, mr, 0, 6.3); x.fill();
    if (night || boss) { x.fillStyle = 'rgba(255,255,255,.08)'; x.beginPath(); x.arc(w * 0.82, gy * 0.26, mr * 2, 0, 6.3); x.fill(); }

    var rnd = this.seed || 1;
    function R() { rnd = (rnd * 1103515245 + 12345) >>> 0; return (rnd >>> 8) / 16777216; }
    var layers = boss ? ['#2a0c12', '#1c070c', '#12040a'] : night ? ['#1a2440', '#121a30', '#0c1222'] : ['#6aa39a', '#3f7a5c', '#2a5a3e'];
    for (var L = 0; L < 3; L++) {
      x.fillStyle = layers[L];
      var base = gy - (3 - L) * k * 10;
      var px = 0;
      while (px < w) {
        var tw = k * (6 + Math.floor(R() * 8));
        var th = k * (10 + Math.floor(R() * (18 + L * 6)));
        for (var step = 0; step < 5; step++) {
          var sw = tw * (1 - step * 0.18);
          x.fillRect(Math.round(px + (tw - sw) / 2), Math.round(base - th * (step + 1) / 5), Math.round(sw), Math.round(th / 5 + 1));
        }
        x.fillRect(Math.round(px), Math.round(base - 1), Math.round(tw), gy - base + 2);
        px += tw * (0.6 + R() * 0.5);
      }
    }

    var tileRole = SPR && SPR.has('terrain.grass') ? 'terrain.grass' : null;
    if (tileRole) {
      var tsc = Math.max(1, Math.round(k / 2));
      var ts = SPR.size(tileRole).w * tsc;
      for (var ty = gy; ty < h; ty += ts) {
        for (var tx = 0; tx < w; tx += ts) {
          var id = SPR.variant(tileRole, (tx / ts | 0) * 7 + (ty / ts | 0) * 13);
          SPR.drawId(x, id, tx + ts / 2, ty + ts, tsc, {});
        }
      }
      x.fillStyle = boss ? 'rgba(60,0,10,.45)' : night ? 'rgba(10,16,50,.5)' : 'rgba(0,0,0,.08)';
      x.fillRect(0, gy, w, h - gy);
    } else {
      var gg = x.createLinearGradient(0, gy, 0, h);
      gg.addColorStop(0, boss ? '#3a1a1a' : '#4f8a3a'); gg.addColorStop(1, boss ? '#1a0a0a' : '#2a4a22');
      x.fillStyle = gg; x.fillRect(0, gy, w, h - gy);
    }
    x.fillStyle = 'rgba(0,0,0,.35)';
    x.fillRect(0, gy, w, k);

    var vg = x.createRadialGradient(w / 2, gy - h * 0.1, h * 0.2, w / 2, gy - h * 0.1, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.6)');
    x.fillStyle = vg; x.fillRect(0, 0, w, h);
    this.backdrop = c;
  };

  Fight.prototype.spriteOpts = function (side, extra) {
    var f = this.fighters[side];
    var idleBob = f.dead ? 0 : Math.sin(this.time / 380 + side * 1.7) * 0.03;
    var o = { flip: this.face(side), sx: f.sx * (1 - idleBob), sy: f.sy * (1 + idleBob), rot: f.rot,
      flash: f.flash, flashColor: f.flashColor, loop: f.anim !== 'dead' };
    for (var k in extra) o[k] = extra[k];
    return o;
  };

  Fight.prototype.drawWeapon = function (alpha) {
    if (!this.weaponRole || this.fighters[0].gone) return;
    var f = this.fighters[0];
    if (f.dead && f.deadT > 200) return;
    var id = SPR.frameN(this.weaponRole, 0), r = SPR.rect(id);
    // vũ khí to cỡ nửa người, tối thiểu hệ số 1
    var s = this.size(0);
    var sc = Math.max(1, Math.round(s.h * 0.62 / Math.max(r[2], 16)));
    var hp = this.handPos();
    var bob = f.anim === 'idle' ? Math.sin(this.time / 380) * 0.06 : 0;
    var ang = f.wAngle + bob + f.rot;
    var pivotX = this.weaponKind === 'bow' ? 0.5 : 0.12;
    SPR.drawPivot(this.ctx, id, hp.x, hp.y, sc, { rot: ang, px: pivotX, py: 0.5, alpha: alpha, flash: f.flash * 0.6 });
  };

  Fight.prototype.drawFighter = function (side) {
    var ctx = this.ctx, f = this.fighters[side], sc = this.scales[side];
    if (f.gone) return;
    var x = this.homeX(side) + f.dx, y = this.groundY + f.dy;
    var s = this.size(side);

    // bóng
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(x, this.groundY + 2, s.w * 0.42 * (1 - Math.min(0.5, Math.abs(f.dy) / 200)), s.w * 0.1, 0, 0, 6.3); ctx.fill();
    ctx.restore();

    // dư ảnh khi lao
    if (f.role) {
      for (var i = 0; i < f.trail.length; i++) {
        var tr = f.trail[i];
        SPR.draw(ctx, f.role, f.anim, f.animT, tr.x, tr.y, sc, this.spriteOpts(side, { alpha: 0.12 + i * 0.08, flash: 1, flashColor: side === 0 ? '#9fd0ff' : '#ff9f9f' }));
      }
    }

    // vỏ giáp sáng khi còn giáp
    var st = this.side(side);
    if (st && st.armor > 0 && !f.dead) {
      var pul = 0.5 + Math.sin(this.time / 260) * 0.5;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.18 + pul * 0.12;
      var g = ctx.createRadialGradient(x, y - s.h * 0.45, s.h * 0.2, x, y - s.h * 0.45, s.h * 0.75);
      g.addColorStop(0, 'rgba(90,170,255,0)');
      g.addColorStop(0.7, 'rgba(90,170,255,.55)');
      g.addColorStop(1, 'rgba(90,170,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - s.h, y - s.h * 1.3, s.h * 2, s.h * 1.5);
      ctx.restore();
    }

    if (f.role) {
      SPR.draw(ctx, f.role, f.anim, f.animT, x, y, sc, this.spriteOpts(side, {}));
      if (st && st.armor > 0 && !f.dead) {
        SPR.draw(ctx, f.role, f.anim, f.animT, x, y, sc, this.spriteOpts(side, { alpha: 0.16 + 0.1 * Math.sin(this.time / 260), flash: 1, flashColor: '#7fc8ff' }));
      }
    } else {
      var vs = this.h * 0.24 * (f.boss ? 1.4 : 1);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(f.rot);
      ctx.scale(f.sx * (side === 1 ? -1 : 1), f.sy);
      if (side === 0) A.hero(ctx, -vs / 2, -vs, vs); else A.mob(ctx, this.foeName, -vs / 2, -vs, vs);
      if (f.flash > 0) {
        ctx.globalAlpha = f.flash * 0.8;
        if (side === 0) A.tintHero(ctx, -vs / 2, -vs, vs, '#fff'); else A.tintMob(ctx, this.foeName, -vs / 2, -vs, vs, '#fff');
      }
      ctx.restore();
    }
    if (side === 0) this.drawWeapon(1);

    // sao quay trên đầu khi đang choáng
    if (st && st.stun > 0 && !f.dead && SPR && SPR.has('vfx.stun')) {
      SPR.drawId(ctx, SPR.frameAt('vfx.stun', 'idle', this.time), x, y - s.h - this.k * 2, this.vs('vfx.stun', s.w * 0.6), {});
    }
  };

  Fight.prototype.drawMotes = function (dt) {
    var ctx = this.ctx;
    if (this.motes.length < 22) {
      this.motes.push({ x: Math.random() * this.w, y: this.groundY - Math.random() * this.h * 0.6,
        vx: (Math.random() - 0.5) * 14, vy: -6 - Math.random() * 10, t: 0, life: 3000 + Math.random() * 3000 });
    }
    var col = this.isBoss ? '#ff7a3a' : this.night ? '#d8ff7a' : '#ffffff';
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = this.motes.length - 1; i >= 0; i--) {
      var m = this.motes[i];
      m.t += dt; m.x += m.vx * dt / 1000 + Math.sin((m.t + i * 300) / 700) * 0.2; m.y += m.vy * dt / 1000;
      if (m.t > m.life) { this.motes.splice(i, 1); continue; }
      var a = Math.sin(Math.PI * m.t / m.life);
      ctx.globalAlpha = a * (this.night || this.isBoss ? 0.9 : 0.35);
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(m.x), Math.round(m.y), this.k, this.k);
    }
    ctx.restore();
  };

  Fight.prototype.render = function (rawDt) {
    var ctx = this.ctx;
    var frozen = this.fx.hitstop > 0;
    var dt = rawDt * this.speed * this.slowmo;
    if (this.slowT > 0) { this.slowT -= rawDt; if (this.slowT <= 0) this.slowmo = 1; }
    if (frozen) { this.fx.hitstop -= rawDt; dt = 0; }
    this.time += dt;

    for (var i = 0; i < this.timers.length; i++) {
      if (this.timers[i].at <= this.time) {
        var tm = this.timers.splice(i, 1)[0]; i--;
        tm.fn();
      }
    }
    var self = this;
    this.fighters.forEach(function (f, side) {
      f.animT += dt;
      if (f.dead) f.deadT += dt;
      if (f.flash > 0 && !frozen) f.flash = Math.max(0, f.flash - dt / 170);
      for (var key in f.tweens) {
        var tw = f.tweens[key];
        tw.t += dt;
        var p = FX.clamp(tw.t / tw.dur, 0, 1);
        f[key] = tw.from + (tw.to - tw.from) * tw.ease(p);
        if (p >= 1) delete f.tweens[key];
      }
      if (f.wTween) {
        var w = f.wTween;
        w.t += dt;
        var q = FX.clamp(w.t / w.dur, 0, 1);
        f.wAngle = w.from + (w.to - w.from) * w.ease(q);
        if (q >= 1) f.wTween = null;
      }
      if (f.trailOn && !frozen) {
        f.trail.push({ x: self.homeX(side) + f.dx, y: self.groundY + f.dy });
        if (f.trail.length > 4) f.trail.shift();
      } else if (f.trail.length && !frozen) f.trail.shift();
    });
    if (!frozen) { this.fx.update(dt); this.updateCoins(dt); }
    if (this.flashScreen > 0) this.flashScreen = Math.max(0, this.flashScreen - rawDt / 300);
    this.zoom = FX.damp(this.zoom, 1, frozen ? 0 : 10, rawDt);
    if (this.grayTarget) this.gray = FX.damp(this.gray, this.grayTarget, 2, rawDt);

    if (!this.backdrop) this.buildBackdrop();
    ctx.save();
    ctx.translate(Math.round(this.fx.shakeX), Math.round(this.fx.shakeY));
    if (this.zoom > 1.001) {
      ctx.translate(this.zoomX, this.zoomY);
      ctx.scale(this.zoom, this.zoom);
      ctx.translate(-this.zoomX, -this.zoomY);
    }
    ctx.drawImage(this.backdrop, 0, 0, this.w, this.h);
    this.drawMotes(dt);
    var front = this.snap && this.snap.by === 1 ? [0, 1] : [1, 0];
    this.drawFighter(front[0]);
    this.drawFighter(front[1]);
    this.drawCoins();
    this.fx.draw(ctx);
    ctx.restore();
    if (this.flashScreen > 0) {
      ctx.save();
      ctx.globalAlpha = this.flashScreen;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.restore();
    }
    if (this.gray > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'saturation';
      ctx.globalAlpha = this.gray;
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.restore();
    }
  };

  /* -------------------------------------------------------------- vòng lặp */

  Fight.prototype.run = function (onDone) {
    var self = this;
    this.onDone = onDone;
    this.fit();
    // Thanh máu phải có số ngay khung đầu, không để trống suốt màn chạy vào.
    if (this.shown && this.hooks.snap) this.hooks.snap(this.shown, null);
    this.intro();
    this.acc = this.isBoss ? 1500 : 950;
    var last = 0;
    function frame(ts) {
      if (self.stopped) return;
      var raw = last ? Math.min(50, ts - last) : 16;
      last = ts;
      var r = self.cv.getBoundingClientRect();
      if (Math.round(r.width) !== self.w || Math.round(r.height) !== self.h) self.fit();
      if (!self.done && self.fx.hitstop <= 0) {
        self.acc -= raw * self.speed * self.slowmo;
        var guard = 0;
        while (self.acc <= 0 && !self.done && guard++ < 6) self.acc += self.step();
      }
      self.render(raw);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  };

  Fight.prototype.stop = function () { this.stopped = true; };

  global.HIC_Fight = Fight;
})(window);
