/* Màn hình trận đánh — hai nhân vật pixel đứng trên nền rừng, lao vào nhau.
 *
 * WHY: người chơi không bấm gì trong trận, nên 30 giây xem trận CHÍNH LÀ phần
 * thưởng cho những quyết định lúc còn sáng. Bản trước đúng luật nhưng đòn đánh
 * nhẹ bẫng: nhân vật trượt qua lại, số hiện ra cùng lúc với cú lao. Bản này làm
 * theo nhịp của game hành động: lấy đà -> lao -> TRÚNG (khựng hình vài chục ms,
 * loé trắng, bật lùi, số nảy) -> quay về. Số và thanh máu chỉ đổi ĐÚNG khoảnh
 * khắc trúng, không đổi lúc bắt đầu vung.
 * ROOT-CAUSE: nhật ký trận là một danh sách tức thời; muốn có lực thì mỗi dòng
 * phải được trải ra thành một chuỗi sự kiện có hẹn giờ (this.timers).
 *
 * Mỗi dòng nhật ký mang ảnh chụp chỉ số (a/b) và, từ bản này, tên gốc của món
 * gây ra nó (src) — dùng để chớp sáng đúng ô đồ vừa kích.
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

  function Fighter(side, role, name, isBoss) {
    this.side = side;               // 0 = người chơi (trái), 1 = địch (phải)
    this.role = role;               // vai trò trong atlas, hoặc null -> hình vector
    this.name = name;
    this.boss = !!isBoss;
    this.dx = side === 0 ? -400 : 400;   // bắt đầu ngoài màn, chạy vào
    this.dy = 0; this.sx = 1; this.sy = 1;
    this.flash = 0; this.anim = 'run'; this.animT = 0;
    this.dead = false; this.deadT = 0; this.alpha = 1;
    this.tween = null;
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
    this.shown = null;               // ảnh chụp đang HIỆN (đổi lúc trúng đòn)
    this.timers = [];
    this.fx = new FX.Layer();
    this.slowmo = 1; this.slowT = 0;
    this.flashScreen = 0; this.flashColor = '#fff';
    this.hooks = opts.hooks || {};
    this.fighters = [
      new Fighter(0, SPR && SPR.has('hero') ? 'hero' : null, 'Bạn', false),
      new Fighter(1, SPR ? SPR.creatureRole(foeName) : null, foeName, isBoss)
    ];
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
    // Màn dọc: cảnh cao hơn rộng, nên cỡ nhân vật tính theo "chiều cao hiệu dụng"
    // chứ không theo chiều cao thật — nếu không hai con to bằng nửa màn, trời trống trơn.
    this.eh = Math.min(this.h, this.w * 0.62);
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
    // Không để quái to quá nửa bề ngang màn.
    while (s > 1 && sz.w * s > this.w * 0.42) s--;
    return Math.max(side === 0 ? 2 : Math.max(2, this.k - 1), s);
  };

  Fight.prototype.homeX = function (side) { return this.w * (side === 0 ? 0.30 : 0.70); };

  /* ------------------------------------------------------------- lịch hẹn */

  Fight.prototype.after = function (ms, fn) { this.timers.push({ at: this.time + ms, fn: fn }); };

  Fight.prototype.tweenTo = function (f, props, dur, ease) {
    var from = {};
    for (var k in props) from[k] = f[k];
    f.tween = { from: from, to: props, t: 0, dur: dur, ease: ease || E.outCubic };
  };

  /* ------------------------------------------------------------- trợ giúp */

  Fight.prototype.center = function (side) {
    var f = this.fighters[side], sc = this.scales[side];
    var h = f.role ? SPR.size(f.role, 'idle').h * sc : this.h * 0.22;
    return { x: this.homeX(side) + f.dx, y: this.groundY - h * 0.5 + f.dy, h: h };
  };

  Fight.prototype.face = function (side) {
    // Sprite gốc nhìn sang phải (hoặc nhìn thẳng); địch đứng bên phải nên lật.
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
    if (this.hooks.snap) this.hooks.snap(ln, prev);
  };

  Fight.prototype.lightItem = function (side, src, strike) {
    if (this.hooks.trigger) this.hooks.trigger(side, strike ? '__weapon' : baseName(src));
  };

  /* ------------------------------------------------------------- mở màn */

  Fight.prototype.intro = function () {
    var self = this;
    this.fighters.forEach(function (f) {
      f.anim = 'run';
      self.tweenTo(f, { dx: 0 }, 520, E.outCubic);
    });
    this.after(540, function () { self.fighters.forEach(function (f) { f.anim = 'idle'; }); });
    this.after(80, function () { play('fightStart'); });
    if (this.isBoss) {
      this.after(420, function () {
        self.fx.shake(10);
        self.flashScreen = 0.5; self.flashColor = '#ff2a2a';
        play('boss');
        var c = self.center(1);
        self.fx.burst(c.x, self.groundY, 26, { color: ['#6b5040', '#8a6a50', '#3a2a20'], speed: 220, g: 500, life: 700, size: 4, angle: -Math.PI / 2, spread: 2.4 });
      });
    }
    // Chỉ lấy chỉ số để vẽ thanh máu, không lấy chữ — chữ dòng đầu hiện khi nó thật sự xảy ra.
    if (this.lines[0]) this.showSnap({ a: this.lines[0].a, b: this.lines[0].b });
  };

  /* ------------------------------------------------------------- một dòng */

  /* Đọc một dòng nhật ký và trải nó ra thành chuỗi sự kiện. Trả về số ms nên
     chờ trước khi đọc dòng kế tiếp. */
  Fight.prototype.step = function () {
    if (this.idx >= this.lines.length) { this.finish(); return 0; }
    var ln = this.lines[this.idx++];
    this.snap = ln;
    var self = this;
    /* Trận dài (hơn 40 dòng) tự tăng nhịp dần: người xem cần thấy mấy lượt đầu
       để hiểu trận, còn lượt thứ 30 thì chỉ cần thấy máu tụt. */
    var ramp = this.idx > 40 ? Math.max(0.45, 1 - (this.idx - 40) / 90) : 1;
    var hold = 380;

    switch (ln.k) {
      case 'strike':
        this.swing(ln.by, ln.i, null);
        hold = 620;
        this.after(210, function () { self.showSnap(ln); });
        break;
      case 'dmg':
        if (ln.strike && ln.by != null) {
          this.swing(ln.by, ln.i, ln);
          hold = 700;
        } else {
          this.zap(ln);
          hold = 520;
        }
        break;
      case 'heal':
        this.lightItem(ln.i, ln.src);
        this.showSnap(ln);
        this.pulse(ln.i, '#7dff8a');
        this.floatOn(ln.i, '+' + ln.v, '#7dff8a', false, -0.15);
        this.spriteOr('vfx.heal', ln.i, function (c) {
          self.fx.burst(c.x, c.y + c.h * 0.3, 14, { color: ['#7dff8a', '#d4ffb0'], speed: 40, lift: -90, g: -20, life: 700, size: 3, spread: Math.PI, angle: -Math.PI / 2, jitter: c.h * 0.5, shape: 'sq' });
        });
        play('heal');
        hold = 460;
        break;
      case 'armor':
        this.lightItem(ln.i, ln.src);
        this.showSnap(ln);
        this.pulse(ln.i, '#6fc2ff');
        this.floatOn(ln.i, '+' + ln.v + ' giáp', '#8fd0ff', false, 0.1);
        this.spriteOr('vfx.armor', ln.i, function (c) {
          self.fx.burst(c.x, c.y, 12, { color: ['#8fd0ff', '#e2f4ff'], speed: 90, life: 500, size: 3, glow: true });
        });
        play('armorUp');
        hold = 440;
        break;
      case 'armorloss':
        this.showSnap(ln);
        hold = 120;
        break;
      case 'thorns':
        this.showSnap(ln);
        if (ln.v > 0) {
          this.lightItem(ln.i, ln.src);
          this.floatOn(ln.i, '+' + ln.v + ' gai', '#b6f28a', false, 0.1);
          play('thorns');
          hold = 420;
        } else hold = 100;
        break;
      case 'atk':
        this.lightItem(ln.i, ln.src);
        this.showSnap(ln);
        this.floatOn(ln.i, (ln.v > 0 ? '+' : '') + ln.v + ' công', ln.v > 0 ? '#ffbe4d' : '#b9c7d3', false, -0.05);
        if (ln.v > 0) { this.pulse(ln.i, '#ffbe4d'); play('buff'); } else play('debuff');
        hold = 420;
        break;
      case 'spd':
        this.lightItem(ln.i, ln.src);
        this.showSnap(ln);
        this.floatOn(ln.i, (ln.v > 0 ? '+' : '') + ln.v + ' tốc', '#d4ff6b', false, 0.05);
        play(ln.v > 0 ? 'buff' : 'debuff');
        hold = 400;
        break;
      case 'stun': {
        this.showSnap(ln);
        this.floatOn(ln.i, 'CHOÁNG', '#ffe27a', true, 0);
        var sc = this.center(ln.i);
        this.spriteOr('vfx.stun', ln.i, function (c) {
          for (var s = 0; s < 5; s++) self.fx.particle({ x: c.x, y: c.y - c.h * 0.6, vx: Math.cos(s * 1.256) * 60, vy: Math.sin(s * 1.256) * 20 - 30, g: 0, drag: 0.92, life: 700, size: 5, color: '#ffe27a', shape: 'sq', glow: true });
        }, sc.y - sc.h * 0.55);
        this.fighters[ln.i].sy = 0.85;
        play('stun');
        hold = 700;
        break;
      }
      case 'death':
        this.kill(ln.i);
        this.showSnap(ln);
        hold = 1400;
        break;
      default:
        hold = 260;
    }
    return hold * ramp;
  };

  /* Một nhát đánh bằng vũ khí: lấy đà -> lao -> trúng -> về. */
  Fight.prototype.swing = function (by, target, ln) {
    var self = this, a = this.fighters[by], d = this.fighters[target];
    if (!a || !d) return;
    var dir = by === 0 ? 1 : -1;
    var gap = Math.abs(this.homeX(1) - this.homeX(0));
    // lấy đà
    a.anim = 'idle';
    this.tweenTo(a, { dx: -dir * this.k * 5, sx: 0.88, sy: 1.1 }, 110, E.outCubic);
    this.after(110, function () {
      a.anim = SPR && a.role && SPR.hasAnim(a.role, 'attack') ? 'attack' : 'run';
      a.animT = 0;
      self.tweenTo(a, { dx: dir * gap * 0.42, sx: 1.12, sy: 0.92 }, 100, E.inCubic);
      play('swing');
    });
    this.after(210, function () {
      if (ln) self.impact(ln);
      else {
        // vung hụt
        self.floatOn(target, 'hụt', '#b9c7d3', false, 0);
      }
    });
    this.after(300, function () {
      self.tweenTo(a, { dx: 0, sx: 1, sy: 1 }, 260, E.outCubic);
    });
    this.after(560, function () { if (!a.dead) a.anim = 'idle'; });
  };

  /* Sát thương không đến từ vũ khí (bom, gai, hiệu ứng đồ): một vệt sáng bay từ
     người gây ra sang người chịu, rồi mới nổ. */
  Fight.prototype.zap = function (ln) {
    var self = this;
    var from = ln.by != null ? ln.by : (ln.i === 0 ? 1 : 0);
    if (ln.src) this.lightItem(from, ln.src);
    if (from === ln.i) { this.impact(ln); return; }
    var a = this.center(from), b = this.center(ln.i);
    var n = 8;
    for (var s = 0; s < n; s++) {
      (function (s) {
        self.after(s * 14, function () {
          var t = s / n;
          self.fx.particle({ x: FX.lerp(a.x, b.x, t), y: FX.lerp(a.y, b.y, t) - Math.sin(t * Math.PI) * 30,
            vx: 0, vy: 0, life: 220, size: 6 - s * 0.4, color: '#ffcf6a', shape: 'sq', glow: true });
        });
      })(s);
    }
    play('swing');
    this.after(150, function () { self.impact(ln); });
  };

  Fight.prototype.impact = function (ln) {
    var self = this, t = ln.i, d = this.fighters[t];
    var c = this.center(t);
    var maxHp = t === 0 ? ln.a.maxHp : ln.b.maxHp;
    var big = ln.hp > 0 && ln.hp >= Math.max(3, maxHp * 0.25);
    var dir = t === 0 ? -1 : 1;
    if (ln.strike) this.lightItem(ln.by, null, true);

    this.showSnap(ln);
    // khựng hình: cả cảnh đứng yên một thoáng -> cảm giác va chạm
    this.fx.hitstop = big ? 110 : 60;
    d.flash = 1;
    d.anim = 'hit'; d.animT = 0;
    d.dx = dir * this.k * (big ? 9 : 5);
    d.sx = 1.15; d.sy = 0.86;
    this.tweenTo(d, { dx: 0, sx: 1, sy: 1 }, 320, E.outBack);
    this.after(260, function () { if (!d.dead) d.anim = 'idle'; });

    var slashRole = big ? 'vfx.crit' : 'vfx.slash';
    var usedSprite = this.fx.sprite(ln.strike ? slashRole : 'vfx.hit', c.x, c.y - c.h * 0.5, this.k * (big ? 1.4 : 1), { flip: t === 0, add: true });
    if (!usedSprite) {
      this.fx.burst(c.x, c.y, big ? 18 : 10, { color: ['#ffffff', '#ffe27a', '#ff9a4a'], speed: big ? 320 : 220, life: 260, size: 3, shape: 'spark', glow: true });
    }
    if (ln.ar > 0) {
      this.floatOn(t, '-' + ln.ar, '#8fd0ff', false, -0.25);
      this.fx.burst(c.x - dir * 6, c.y - c.h * 0.1, 10, { color: ['#dff2ff', '#6fc2ff'], speed: 260, life: 300, size: 3, shape: 'spark', glow: true, angle: dir > 0 ? Math.PI : 0, spread: 1.6 });
      play('armor');
    }
    if (ln.hp > 0) {
      this.floatOn(t, '-' + ln.hp, big ? '#ffec5a' : '#ff5a4a', big, 0.2);
      this.fx.burst(c.x, c.y, big ? 16 : 9, { color: ['#ff3a4a', '#a01020', '#ff7a6a'], speed: big ? 260 : 180, g: 700, life: 520, size: this.k * 1.2, angle: dir > 0 ? 0 : Math.PI, spread: 1.8 });
      this.fx.shake(big ? 9 : 4);
      if (big) { this.flashScreen = 0.25; this.flashColor = '#fff'; play('crit'); }
      else play('hit', Math.min(1, ln.hp / Math.max(1, maxHp) * 3));
    } else if (!(ln.ar > 0)) {
      this.floatOn(t, '0', '#b9c7d3', false, 0);
    }
    if (this.hooks.hurt) this.hooks.hurt(t, ln.hp || 0, ln.ar || 0);
  };

  Fight.prototype.kill = function (side) {
    var self = this, f = this.fighters[side];
    f.dead = true; f.deadT = 0; f.anim = 'dead'; f.animT = 0; f.flash = 1;
    this.fx.hitstop = 180;
    this.slowmo = 0.3; this.slowT = 700;
    this.fx.shake(12);
    var c = this.center(side);
    this.after(120, function () {
      play('death');
      var used = self.fx.sprite('vfx.death', c.x, c.y - c.h * 0.4, self.k * 1.2, {});
      self.fx.burst(c.x, c.y, 30, { color: side === 0 ? ['#ff5a4a', '#7a1020', '#fff'] : ['#ffffff', '#c9d6e2', '#6b7a88'], speed: 260, g: 300, life: 800, size: self.k * 1.3 });
      if (!used) self.fx.burst(c.x, c.y, 16, { color: 'rgba(200,210,220,.6)', speed: 80, g: -40, life: 900, size: self.k * 3, shape: 'circle' });
    });
    if (side === 1) {
      // Thắng: vàng văng ra rồi rơi xuống đất.
      this.after(360, function () {
        var gold = self.fighters[1].boss ? 18 : 8;
        for (var i = 0; i < gold; i++) {
          self.fx.particle({ x: c.x, y: c.y, vx: (Math.random() - 0.5) * 320, vy: -180 - Math.random() * 260, g: 900, drag: 0.99,
            life: 900 + Math.random() * 300, size: self.k * 2, color: i % 3 ? '#ffd452' : '#fff2a8', shape: 'sq', shrink: false });
        }
        play('coin');
        self.after(120, function () { play('coin'); });
      });
    }
  };

  Fight.prototype.pulse = function (side, color) {
    var f = this.fighters[side];
    f.flash = 0.7; f.flashColor = color;
    f.sy = 1.12; f.sx = 0.92;
    this.tweenTo(f, { sx: 1, sy: 1 }, 300, E.outBack);
  };

  Fight.prototype.floatOn = function (side, text, color, big, dxFrac) {
    var c = this.center(side);
    this.fx.number(c.x + (dxFrac || 0) * c.h, c.y - c.h * 0.55, text, {
      color: color, big: big, size: Math.round(Math.max(this.k * (big ? 10 : 8), (this.eh || this.h) * (big ? 0.085 : 0.06))), life: big ? 1100 : 900,
      rise: c.h * 0.5, vx: (side === 0 ? -1 : 1) * 10
    });
  };

  Fight.prototype.spriteOr = function (role, side, fallback, y) {
    var c = this.center(side);
    var it = this.fx.sprite(role, c.x, y != null ? y : c.y - c.h * 0.3, this.k, { add: true });
    if (!it) fallback(c);
  };

  Fight.prototype.finish = function () {
    if (this.done) return;
    this.done = true;
    if (this.lines.length) this.showSnap(this.lines[this.lines.length - 1]);
    play(this.res.playerWon ? 'win' : 'lose');
    if (this.onDone) this.onDone();
  };

  Fight.prototype.skip = function () {
    // Bỏ qua: chạy hết nhật ký không hiệu ứng, chỉ giữ cảnh cuối.
    this.timers.length = 0;
    this.fx.clear();
    this.idx = this.lines.length;
    var last = this.lines[this.lines.length - 1];
    this.fighters.forEach(function (f) { f.dx = 0; f.sx = f.sy = 1; f.tween = null; });
    if (last && last.k === 'death') {
      var f = this.fighters[last.i];
      f.dead = true; f.deadT = 2000; f.anim = 'dead';
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

    // mặt trời / trăng
    x.fillStyle = boss ? '#ff5a3a' : night ? '#e8ecff' : '#fff6c8';
    var mr = k * 9;
    x.beginPath(); x.arc(w * 0.82, gy * 0.26, mr, 0, 6.3); x.fill();
    if (night || boss) { x.fillStyle = 'rgba(255,255,255,.08)'; x.beginPath(); x.arc(w * 0.82, gy * 0.26, mr * 2, 0, 6.3); x.fill(); }

    // ba lớp rừng xa dần — khối pixel bậc thang để khớp art
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
        // cây thông bậc thang
        for (var step = 0; step < 5; step++) {
          var sw = tw * (1 - step * 0.18);
          x.fillRect(Math.round(px + (tw - sw) / 2), Math.round(base - th * (step + 1) / 5), Math.round(sw), Math.round(th / 5 + 1));
        }
        x.fillRect(Math.round(px), Math.round(base - 1), Math.round(tw), gy - base + 2);
        px += tw * (0.6 + R() * 0.5);
      }
    }

    // mặt đất: tile cỏ của atlas nếu có
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

    // viền tối
    var vg = x.createRadialGradient(w / 2, gy - h * 0.1, h * 0.2, w / 2, gy - h * 0.1, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.6)');
    x.fillStyle = vg; x.fillRect(0, 0, w, h);
    this.backdrop = c;
  };

  Fight.prototype.drawFighter = function (side) {
    var ctx = this.ctx, f = this.fighters[side], sc = this.scales[side];
    var x = this.homeX(side) + f.dx, y = this.groundY + f.dy;
    var idleBob = f.dead ? 0 : Math.sin(this.time / 380 + side * 1.7) * 0.03;
    var sx = f.sx * (1 - idleBob), sy = f.sy * (1 + idleBob);
    var alpha = 1;
    if (f.dead) {
      var p = FX.clamp(f.deadT / 900, 0, 1);
      alpha = 1 - p * 0.75;
      sy *= 1 - p * 0.15;
    }
    // bóng
    var shw = (f.role ? SPR.size(f.role, 'idle').w * sc : this.h * 0.2) * 0.42;
    ctx.save();
    ctx.globalAlpha = 0.35 * alpha;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(x, this.groundY + 2, shw * (1 - Math.min(0.5, Math.abs(f.dy) / 200)), shw * 0.22, 0, 0, 6.3); ctx.fill();
    ctx.restore();

    if (f.role) {
      SPR.draw(ctx, f.role, f.anim, f.animT, x, y, sc, {
        flip: this.face(side), sx: sx, sy: sy, alpha: alpha,
        flash: f.flash, flashColor: f.flashColor || '#ffffff', loop: f.anim !== 'dead'
      });
    } else {
      var s = this.h * 0.24 * (f.boss ? 1.4 : 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      ctx.scale(sx * (side === 1 ? -1 : 1), sy);
      if (side === 0) A.hero(ctx, -s / 2, -s, s); else A.mob(ctx, this.foeName, -s / 2, -s, s);
      if (f.flash > 0) {
        ctx.globalAlpha = f.flash * 0.8;
        if (side === 0) A.tintHero(ctx, -s / 2, -s, s, '#fff'); else A.tintMob(ctx, this.foeName, -s / 2, -s, s, '#fff');
      }
      ctx.restore();
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

    // hẹn giờ
    for (var i = 0; i < this.timers.length; i++) {
      if (this.timers[i].at <= this.time) {
        var tm = this.timers.splice(i, 1)[0]; i--;
        tm.fn();
      }
    }
    var self = this;
    this.fighters.forEach(function (f) {
      f.animT += dt;
      if (f.dead) f.deadT += dt;
      if (f.flash > 0) f.flash = Math.max(0, f.flash - dt / 180);
      if (f.tween) {
        var tw = f.tween;
        tw.t += dt;
        var p = FX.clamp(tw.t / tw.dur, 0, 1), e = tw.ease(p);
        for (var key in tw.to) f[key] = tw.from[key] + (tw.to[key] - tw.from[key]) * e;
        if (p >= 1) f.tween = null;
      }
    });
    if (!frozen) this.fx.update(dt);
    if (this.flashScreen > 0) this.flashScreen = Math.max(0, this.flashScreen - rawDt / 300);

    if (!this.backdrop) this.buildBackdrop();
    ctx.save();
    ctx.translate(Math.round(this.fx.shakeX), Math.round(this.fx.shakeY));
    ctx.drawImage(this.backdrop, 0, 0, this.w, this.h);
    this.drawMotes(dt);
    // người đánh vẽ sau cùng để nổi lên trên
    var attackerFront = this.snap && this.snap.by === 1 ? [0, 1] : [1, 0];
    this.drawFighter(attackerFront[0]);
    this.drawFighter(attackerFront[1]);
    this.fx.draw(ctx);
    ctx.restore();
    if (this.flashScreen > 0) {
      ctx.save();
      ctx.globalAlpha = this.flashScreen;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.restore();
    }
  };

  /* -------------------------------------------------------------- vòng lặp */

  Fight.prototype.run = function (onDone) {
    var self = this;
    this.onDone = onDone;
    this.fit();
    this.intro();
    // Một nhịp đứng nhìn nhau trước khi đánh.
    this.acc = this.isBoss ? 1300 : 900;
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
