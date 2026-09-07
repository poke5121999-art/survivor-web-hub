/*
 * boss.js — trùm hang và mini-boss.
 *
 * Chiêu thức dựng lại theo đúng bản gốc Core Keeper (nguồn: research/CORE-KEEPER.md):
 *
 *   Glurch    chỉ có MỘT chiêu — nhảy vồ — cộng vũng nhớt để lại chỗ tiếp đất,
 *             và cuồng nộ khi máu ≤30%. Đúng vậy: một chiêu. Cái làm nó khó là
 *             vũng nhớt tích lại dần và cắt nhỏ chỗ đứng, chứ không phải số chiêu.
 *   Hive      đứng yên, mưa axit mỗi 4-5 giây, và ĐẺ TRỨNG ở một trong năm vị
 *   Mother    trí, trứng nở sau 7,4 giây ra ấu trùng. Nó không đuổi ai — nó bắt
 *             người chơi phải chọn: diệt trứng hay đánh boss.
 *   Shrooman  lao thẳng, đâm vách thì CHOÁNG và HỞ SƯỜN. Cửa sổ phản đòn là
 *   (mini)    phần thưởng cho việc dụ nó đâm vào đá.
 *
 * MỘT CHỖ CỐ Ý LỆCH BẢN GỐC: Glurch ở đây tách ra slime con khi máu ≤50%. Bản
 * gốc không có. Lý do: game gốc là sandbox, đánh Glurch xong còn cả thế giới;
 * ở đây nó là điểm kết của một ván 10 phút, mà một chiêu duy nhất thì đoạn cao
 * trào phẳng lì.
 */
(function (G) {
  'use strict';

  var T = 16;

  function Boss() {}
  G.extendActor(Boss);

  var DEFS = {
    glurch: {
      name: 'GLURCH — KHỐI NHỚT GHÊ TỞM',
      sheet: 'boss.sheet.boss_slime',
      hp: 900, dmg: 22, r: 26, scale: 1,
      idle: [0, 8], squash: [8, 14], air: [14, 19],
      col: '#ff8a3c', poolCol: 'rgba(255,138,60,.35)'
    },
    kingslime: {
      name: 'SLIME VƯƠNG',
      sheet: 'boss.sheet.king_slime',
      hp: 1050, dmg: 24, r: 27, scale: 1,
      idle: [0, 8], squash: [8, 14], air: [14, 19],
      col: '#4aa8ff', poolCol: 'rgba(74,168,255,.35)'
    },
    hive: {
      name: 'MẸ TỔ',
      sheet: 'boss.sheet.boss_hiveMother_mouth',
      base: 'boss.sheet.boss_hiveMother_base',
      hp: 1150, dmg: 20, r: 30, scale: 1,
      idle: [0, 7], open: [7, 15],
      col: '#ff9a7a', stationary: true
    },
    scarab: {
      name: 'BỌ HUNG CHÚA',
      sheet: 'boss.sheet.Scarab_boss',
      hp: 1000, dmg: 23, r: 28, scale: 0.8,
      idle: [0, 8], squash: [8, 14], air: [14, 20],
      col: '#e0c060', poolCol: 'rgba(224,192,96,.30)'
    }
  };

  Boss.prototype.init = function (kind, x, y, level, ctx) {
    var d = DEFS[kind] || DEFS.glurch;
    var hp = Math.round(d.hp * (1 + level * 0.16));
    this.initActor(x, y, { r: d.r, hp: hp, speed: 42, shadow: true });
    this.kind = kind;
    this.D = d;
    this.dmg = Math.round(d.dmg * (1 + level * 0.10));
    this.state = 'wake';
    this.stateT = 0;
    this.cd = 2.4;
    this.pools = [];
    this.eggs = [];
    this.phase = 1;
    this.enraged = false;
    this.isBoss = true;
    this.elite = true;
    this.frameT = 0;
    return this;
  };

  Boss.prototype.frame = function (range) {
    var n = range[1] - range[0];
    return range[0] + (((this.frameT * 11) | 0) % n);
  };

  Boss.prototype.update = function (dt, ctx) {
    this.stepCommon(dt);
    // Boss an hang chuc don moi giay; de nguyen 0,12 giay nhu quai thuong thi
    // co chop khong bao gio ve 0. Rut xuong con mot nhip rat ngan.
    if (this.flash > 0.05) this.flash = 0.05;
    this.frameT += dt;
    if (this.dead) return;
    var p = ctx.player;
    this.stateT += dt;

    // Cuồng nộ ở 30% — đúng ngưỡng của bản gốc.
    if (!this.enraged && this.hp <= this.hpMax * 0.3) {
      this.enraged = true;
      ctx.fx.screenFlash(this.D.col, 0.5);
      ctx.fx.hit(3);
      ctx.banner('CUỒNG NỘ', this.D.col);
    }
    if (this.phase === 1 && this.hp <= this.hpMax * 0.5) {
      this.phase = 2;
      ctx.banner('NÓ ĐANG TÁCH RA', this.D.col);
    }

    this.updatePools(dt, ctx);
    this.updateEggs(dt, ctx);

    if (this.D.stationary) this.aiHive(dt, ctx, p);
    else this.aiLeaper(dt, ctx, p);
  };

  // ---------------------------------------------------------------- Glurch

  Boss.prototype.aiLeaper = function (dt, ctx, p) {
    var rate = this.enraged ? 0.62 : 1;
    if (this.state === 'wake') {
      this.z = Math.max(0, 40 - this.stateT * 60);
      if (this.stateT > 0.8) { this.state = 'idle'; this.stateT = 0; }
      return;
    }
    if (this.state === 'squash') {
      // lên gân: bẹp xuống, vòng đích hiện dưới chân người chơi
      if (this.stateT >= 0.75 * rate) {
        this.state = 'air'; this.stateT = 0;
        this.tx = p.x; this.ty = p.y;
        this.sx = this.x; this.sy = this.y;
        this.flightT = Math.min(0.85, Math.max(0.42,
          Math.hypot(this.tx - this.sx, this.ty - this.sy) / 320));
      }
      return;
    }
    if (this.state === 'air') {
      var k = Math.min(1, this.stateT / this.flightT);
      this.x = this.sx + (this.tx - this.sx) * k;
      this.y = this.sy + (this.ty - this.sy) * k;
      this.z = Math.sin(k * Math.PI) * 46;
      if (k >= 1) { this.land(ctx, p); }
      return;
    }
    // idle: bò chậm về phía người chơi rồi lại nhảy
    var d = Math.hypot(p.x - this.x, p.y - this.y);
    if (d > 40) {
      var a = Math.atan2(p.y - this.y, p.x - this.x);
      this.move(ctx.world, Math.cos(a) * 34 * dt, Math.sin(a) * 34 * dt);
    }
    this.cd -= dt / rate;
    if (this.cd <= 0) {
      this.cd = this.enraged ? 1.9 : 3.1;
      this.state = 'squash'; this.stateT = 0;
      this.markT = 0.75 * rate;
      this.markX = p.x; this.markY = p.y;
    }
  };

  Boss.prototype.land = function (ctx, p) {
    this.state = 'idle'; this.stateT = 0; this.z = 0;
    ctx.fx.hit(3);
    ctx.fx.ring(this.x, this.y, 8, 70, this.D.col, 0.42);
    ctx.fx.burst(this.x, this.y, 16, { col: this.D.col, spd: 130, life: 0.5, r: 3, prio: 2 });
    var k = G.Atlas.pick('fx.SlimeExplosion', 'fx.WhiteSlimeExplosion');
    if (k) ctx.fx.anim(k, this.x, this.y, { scale: 1.5, fps: 22 });
    if (Math.hypot(p.x - this.x, p.y - this.y) < 60) {
      ctx.hurtPlayer(this.dmg, this.x, this.y, 220);
    }
    for (var i = 0; i < ctx.pets.length; i++) {
      var q = ctx.pets[i];
      if (Math.hypot(q.x - this.x, q.y - this.y) < 60) q.hurt(this.dmg * 0.5, this.x, this.y, 160);
    }
    // vũng nhớt: thứ thật sự giết người chơi, vì nó cắt dần chỗ đứng
    this.pools.push({ x: this.x, y: this.y, r: 34, t: 0, life: this.enraged ? 11 : 8 });
    if (this.pools.length > 9) this.pools.shift();

    if (this.phase === 2) {
      var n = this.enraged ? 3 : 2;
      for (var j = 0; j < n; j++) {
        var a = Math.random() * 6.283;
        ctx.spawnAt('swarmer', this.x + Math.cos(a) * 26, this.y + Math.sin(a) * 26);
      }
    }
  };

  Boss.prototype.updatePools = function (dt, ctx) {
    for (var i = this.pools.length - 1; i >= 0; i--) {
      var pl = this.pools[i];
      pl.t += dt;
      if (pl.t > pl.life) { this.pools.splice(i, 1); continue; }
      var p = ctx.player;
      if (Math.hypot(p.x - pl.x, p.y - pl.y) < pl.r) {
        p.slow = Math.max(p.slow, 0.5);
        pl.dmgT = (pl.dmgT || 0) + dt;
        if (pl.dmgT > 0.7) { pl.dmgT = 0; ctx.hurtPlayer(this.dmg * 0.25, pl.x, pl.y, 0); }
      }
    }
  };

  // ---------------------------------------------------------------- Mẹ Tổ

  Boss.prototype.aiHive = function (dt, ctx, p) {
    if (this.state === 'wake') {
      if (this.stateT > 1) { this.state = 'idle'; this.stateT = 0; }
      return;
    }
    this.cd -= dt * (this.enraged ? 1.5 : 1);
    if (this.cd <= 0) {
      // luân phiên: mưa axit -> đẻ trứng -> mưa axit -> ...
      this.turn = (this.turn || 0) + 1;
      if (this.turn % 2 === 1) {
        this.cd = 4.5;
        this.state = 'open'; this.stateT = 0;
        this.acidRain(ctx, p);
      } else {
        this.cd = 5.0;
        this.layEggs(ctx);
      }
    }
    if (this.state === 'open' && this.stateT > 0.7) { this.state = 'idle'; this.stateT = 0; }
  };

  Boss.prototype.acidRain = function (ctx, p) {
    var n = this.enraged ? 14 : 9;
    ctx.banner('MƯA AXIT', '#8fe6c8');
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.283;
      var sp = 90 + Math.random() * 70;
      ctx.projs.push(new G.Projectile(this.x, this.y - 10,
        Math.cos(a) * sp, Math.sin(a) * sp, {
          r: 4, col: '#8fe6c8', dmg: this.dmg * 0.55, friendly: false, life: 3.4
        }));
    }
    // thêm một loạt nhắm thẳng người chơi để không đứng yên né được
    for (var j = -1; j <= 1; j++) {
      var b = Math.atan2(p.y - this.y, p.x - this.x) + j * 0.24;
      ctx.projs.push(new G.Projectile(this.x, this.y - 10,
        Math.cos(b) * 150, Math.sin(b) * 150, {
          r: 4, col: '#8fe6c8', dmg: this.dmg * 0.6, friendly: false, life: 3.4
        }));
    }
  };

  Boss.prototype.layEggs = function (ctx) {
    var slots = 5, put = 0;
    for (var i = 0; i < slots && put < 2; i++) {
      var a = (i / slots) * 6.283 + this.stateT;
      var d = 58 + Math.random() * 40;
      var x = this.x + Math.cos(a) * d, y = this.y + Math.sin(a) * d;
      if (ctx.world.solid((x / T) | 0, (y / T) | 0)) continue;
      this.eggs.push({ x: x, y: y, t: 0, hp: 26 });
      put++;
    }
    if (put) ctx.banner('ĐANG ĐẺ TRỨNG — PHÁ ĐI', '#ffb04a');
  };

  Boss.prototype.updateEggs = function (dt, ctx) {
    for (var i = this.eggs.length - 1; i >= 0; i--) {
      var e = this.eggs[i];
      e.t += dt;
      if (e.hp <= 0) {
        ctx.fx.burst(e.x, e.y, 8, { col: '#ffb04a', spd: 80, life: 0.4, r: 2, prio: 1 });
        this.eggs.splice(i, 1);
        ctx.run.eggsKilled = (ctx.run.eggsKilled || 0) + 1;
        continue;
      }
      if (e.t >= 7.4) {          // đúng 7,4 giây của bản gốc
        ctx.spawnAt('swarmer', e.x, e.y);
        ctx.spawnAt('grunt', e.x + 8, e.y);
        ctx.fx.ring(e.x, e.y, 3, 20, '#ffb04a', 0.3);
        this.eggs.splice(i, 1);
      }
    }
  };

  // ---------------------------------------------------------------- vẽ

  Boss.prototype.draw = function (ctx) {
    var D = this.D;
    // vũng nhớt vẽ TRƯỚC mọi thứ
    for (var i = 0; i < this.pools.length; i++) {
      var pl = this.pools[i];
      var k = 1 - pl.t / pl.life;
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.25 * k;
      ctx.fillStyle = D.poolCol || 'rgba(255,138,60,.35)';
      ctx.beginPath();
      ctx.ellipse(pl.x, pl.y, pl.r, pl.r * 0.6, 0, 0, 6.2832);
      ctx.fill();
      ctx.restore();
    }
    // trứng
    for (var j = 0; j < this.eggs.length; j++) {
      var e = this.eggs[j];
      var kk = e.t / 7.4;
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#ffb04a';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y, 7 + kk * 3, 9 + kk * 3, 0, 0, 6.2832);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,90,60,' + (0.3 + 0.5 * Math.abs(Math.sin(e.t * 6))) + ')';
      ctx.fillRect(e.x - 8, e.y - 15, 16 * kk, 2);
      ctx.restore();
    }
    // vòng đích khi lên gân nhảy
    if (this.state === 'squash') {
      var k2 = 1 - this.stateT / 0.75;
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = D.col;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(this.markX, this.markY, 30 + k2 * 34, (30 + k2 * 34) * 0.55, 0, 0, 6.2832);
      ctx.stroke();
      ctx.restore();
    }

    this.drawShadow(ctx);
    if (D.base && G.Atlas.has(D.base)) {
      G.Atlas.draw(ctx, D.base, this.frame([0, 8]), this.x, this.y + 6,
        { scale: D.scale, white: this.flash > 0 });
    }
    var rng = this.state === 'squash' ? (D.squash || D.idle)
            : this.state === 'air' ? (D.air || D.idle)
            : this.state === 'open' ? (D.open || D.idle) : D.idle;
    G.Atlas.draw(ctx, D.sheet, this.frame(rng), this.x, this.y - this.z, {
      scale: D.scale, white: this.flash > 0
    });
  };

  // ---------------------------------------------------------------- mini-boss

  function Mini() {}
  G.extendActor(Mini);

  Mini.prototype.init = function (x, y, level) {
    this.initActor(x, y, {
      r: 14, hp: Math.round(260 * (1 + level * 0.15)), speed: 52,
      art: 'boss.shrooman', fps: 10, scale: 1
    });
    this.dmg = Math.round(15 * (1 + level * 0.1));
    this.state = 'idle';
    this.stateT = 0;
    this.cd = 1.8;
    this.elite = true;
    this.isMini = true;
    this.xp = 90;
    return this;
  };

  Mini.prototype.update = function (dt, ctx) {
    this.stepCommon(dt);
    if (this.dead) return;
    this.stateT += dt;
    var p = ctx.player;
    this.applyKnock(ctx.world, dt);

    if (this.state === 'wind') {
      this.setAnim('chargeAnticipation');
      this.tellT = 0.6;
      if (this.stateT >= 0.7) {
        this.state = 'dash'; this.stateT = 0;
        var a = Math.atan2(p.y - this.y, p.x - this.x);
        this.dvx = Math.cos(a) * 300; this.dvy = Math.sin(a) * 300;
        this.faceFrom(this.dvx, this.dvy);
      }
      return;
    }
    if (this.state === 'dash') {
      this.setAnim('charge');
      var bx = this.x, by = this.y;
      this.move(ctx.world, this.dvx * dt, this.dvy * dt);
      if (Math.abs(this.x - bx) < 0.3 && Math.abs(this.y - by) < 0.3) {
        // đâm vách -> HỞ SƯỜN. Đây là phần thưởng cho việc dụ nó vào đá.
        this.state = 'vuln'; this.stateT = 0;
        ctx.fx.hit(3);
        ctx.fx.burst(this.x, this.y, 14, { col: '#c8b090', spd: 130, life: 0.5, r: 2.4, prio: 2 });
        ctx.banner('HỞ SƯỜN — ĐÁNH ĐI', '#ffd24a');
        var tx = (this.x / T) | 0, ty = (this.y / T) | 0;
        for (var y = ty - 1; y <= ty + 1; y++)
          for (var x = tx - 1; x <= tx + 1; x++) ctx.world.dig(x, y, 999);
        return;
      }
      if (Math.hypot(p.x - this.x, p.y - this.y) < this.r + p.r) {
        ctx.hurtPlayer(this.dmg, this.x, this.y, 200);
      }
      if (this.stateT > 1.3) { this.state = 'idle'; this.stateT = 0; }
      return;
    }
    if (this.state === 'vuln') {
      this.setAnim('vulnerable');
      this.vuln = 0.6;                 // nhận thêm 60% sát thương
      if (this.stateT > 2.6) { this.state = 'idle'; this.stateT = 0; this.vuln = 0; }
      return;
    }
    this.vuln = 0;
    var d = Math.hypot(p.x - this.x, p.y - this.y);
    this.cd -= dt;
    if (this.cd <= 0 && d < 230) {
      this.cd = 3.4; this.state = 'wind'; this.stateT = 0;
      return;
    }
    var a2 = Math.atan2(p.y - this.y, p.x - this.x);
    this.move(ctx.world, Math.cos(a2) * this.speed * dt, Math.sin(a2) * this.speed * dt);
    this.faceFrom(Math.cos(a2), Math.sin(a2));
    this.setAnim('move');
    if (d < this.r + p.r + 2) {
      this.atkCd = (this.atkCd || 0) - dt;
      if (this.atkCd <= 0) { this.atkCd = 1.1; ctx.hurtPlayer(this.dmg * 0.7, this.x, this.y, 110); }
    }
  };

  Mini.prototype.armorAt = function () { return this.state === 'vuln' ? -0.6 : 0.15; };

  Mini.prototype.draw = function (ctx) {
    if (this.state === 'wind') {
      var k = this.stateT / 0.7;
      ctx.save();
      ctx.globalAlpha = 0.4 + 0.35 * Math.sin(k * 20);
      ctx.strokeStyle = '#ffd24a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y + 2, 24 + k * 12, (24 + k * 12) * 0.5, 0, 0, 6.2832);
      ctx.stroke();
      ctx.restore();
    }
    G.Actor.prototype.draw.call(this, ctx);
    this.drawBar(ctx, 40, 42);
  };

  G.Boss = Boss;
  G.MiniBoss = Mini;
  G.BOSS_DEFS = DEFS;
})(window.DC = window.DC || {});
