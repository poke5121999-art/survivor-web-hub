/*
 * enemies.js — hành vi quái.
 *
 * Nguyên tắc từ Deep Rock Galactic: phân vai theo LOẠI ÁP LỰC chứ không theo
 * lượng sát thương. Mỗi con phải ép người chơi làm MỘT việc khác nhau:
 *   chase    lấp không gian, buộc phải di chuyển
 *   poke     tầm với dài, buộc phải lùi
 *   ranged   buộc phải đổi chỗ đứng / núp sau vách
 *   exploder buộc phải rời chỗ đang đứng NGAY
 *   charger  buộc phải nhìn báo trước rồi né ngang
 *   burrow   buộc phải không đứng yên
 *   tank     giáp MẶT TRƯỚC, buộc phải đi vòng ra sau
 *   support  buộc phải chọn giết ai trước
 *
 * Mọi đòn nguy hiểm đều có BÁO TRƯỚC nhìn thấy được (`tell`). Không báo trước
 * thì người chơi thua mà không hiểu vì sao — trên màn dọc lại càng mù.
 */
(function (G) {
  'use strict';

  var T = 16;

  function Enemy() {}
  G.extendActor(Enemy);

  Enemy.prototype.init = function (key, x, y, level, m) {
    var d = G.ENEMY[key];
    var s = G.enemyScale(d, level, m);
    this.initActor(x, y, {
      r: d.r, hp: s.hp, speed: s.spd, art: d.art, fps: d.fps || 10,
      scale: d.scale || 1
    });
    this.key = key;
    this.def = d;
    this.dmg = s.dmg;
    this.xp = d.xp;
    this.elite = !!d.elite;
    this.harmless = !!d.harmless;
    this.state = 'idle';
    this.stateT = 0;
    this.cd = Math.random() * 1.5;
    this.atkCd = 0;
    this.tellT = 0;
    this.vuln = 0;
    this.stuckT = 0;
    this.avoid = 0;
    this.buffAtk = 0;
    return this;
  };

  Enemy.prototype.dangerCol = function () {
    // Mã màu của DRG:Survivor: cam = SẮP NỔ, tím = bậc cao. Người chơi đọc màu
    // nhanh hơn đọc chữ, và trên màn nhỏ thì đó là khác biệt sống chết.
    if (this.state === 'fuse') return '#ff8a2c';
    if (this.state === 'wind' || this.tellT > 0) return '#ffd24a';
    if (this.elite) return '#b06aff';
    return null;
  };

  /* Đi về phía (tx,ty) có lách vách: bị chặn thì thử lệch ±60°, chọn hướng đi
   * được. Không có tìm đường thật — hang toàn hành lang ngắn nên lách là đủ,
   * và nó rẻ hơn A* hàng chục lần với vài chục con. */
  Enemy.prototype.steer = function (w, tx, ty, dt, spd) {
    var dx = tx - this.x, dy = ty - this.y;
    var d = Math.hypot(dx, dy) || 1;
    var base = Math.atan2(dy, dx);
    var order = [0, this.avoid || 1, -(this.avoid || 1), 2, -2];
    for (var i = 0; i < order.length; i++) {
      var a = base + order[i] * 0.62;
      var nx = Math.cos(a) * spd * dt, ny = Math.sin(a) * spd * dt;
      if (!this.blocked(w, this.x + nx, this.y + ny)) {
        this.x += nx; this.y += ny;
        this.faceFrom(Math.cos(a), Math.sin(a));
        if (i > 0) this.avoid = order[i] > 0 ? 1 : -1;
        this.stuckT = 0;
        return true;
      }
    }
    this.stuckT += dt;
    // Quái to đục được tường — chống việc người chơi tự nhốt mình trong hốc rồi
    // đứng cười. DRG:Survivor cũng cho Praetorian phá tường vì đúng lý do đó.
    if (this.def.ai === 'tank' && this.stuckT > 0.5) {
      var wx = ((this.x + Math.cos(base) * (this.r + 6)) / T) | 0;
      var wy = ((this.y + Math.sin(base) * (this.r + 6)) / T) | 0;
      if (w.diggable(wx, wy)) { w.dig(wx, wy, 44 * dt); }
    }
    return false;
  };

  Enemy.prototype.update = function (dt, ctx) {
    this.stepCommon(dt);
    if (this.dead) return;
    var p = ctx.player, w = ctx.world;
    this.stateT += dt;
    if (this.tellT > 0) this.tellT -= dt;
    if (this.vuln > 0) this.vuln = Math.max(0, this.vuln - dt * 0.5);
    if (this.webbed > 0) this.webbed -= dt;
    if (this.burn) {
      this.burn.t -= dt;
      this.hpBurnAcc = (this.hpBurnAcc || 0) + this.burn.dps * dt;
      if (this.hpBurnAcc >= 1) {
        ctx.hitEnemy(this, this.hpBurnAcc, this.x, this.y, 0);
        this.hpBurnAcc = 0;
      }
      if (Math.random() < 0.4) {
        ctx.fx.part(this.x + (Math.random() - .5) * 8, this.y - 4,
          { col: '#ff8a3c', r: 1.5, life: 0.3, g: -30, prio: 0 });
      }
      if (this.burn.t <= 0) this.burn = null;
    }
    this.applyKnock(w, dt);
    if (this.stun > 0) return;

    // Mục tiêu: bình thường là người chơi, nhưng khiêu khích thì đổi sang linh thú.
    var tgt = p;
    if (this.taunt) {
      this.taunt.t -= dt;
      if (this.taunt.t <= 0 || this.taunt.by.dead) this.taunt = null;
      else tgt = this.taunt.by;
    }
    var spd = this.speed * (1 - this.slow * 0.6) * (1 + (this.buffSpd || 0));
    this.buffSpd = 0;
    this.buffAtk = 0;

    var fn = this['ai_' + this.def.ai];
    if (fn) fn.call(this, dt, ctx, tgt, spd);
    else this.ai_chase(dt, ctx, tgt, spd);
  };

  // ---------------------------------------------------------------- các lối AI

  Enemy.prototype.ai_chase = function (dt, ctx, t, spd) {
    var d = Math.hypot(t.x - this.x, t.y - this.y);
    var reach = this.r + (t.r || 6) + 3;
    if (d > reach) {
      this.steer(ctx.world, t.x, t.y, dt, spd);
      this.setAnim('move');
    } else {
      this.setAnim(this.def.atkAnim ? 'attack' : 'move');
      this.tryMelee(ctx, t, 1.05);
    }
  };

  Enemy.prototype.ai_flee = function (dt, ctx, t, spd) {
    var d = Math.hypot(t.x - this.x, t.y - this.y);
    if (d < 60) this.steer(ctx.world, this.x * 2 - t.x, this.y * 2 - t.y, dt, spd);
    else if (Math.random() < 0.02) this.wanderA = Math.random() * 6.283;
    else if (this.wanderA !== undefined) {
      this.steer(ctx.world, this.x + Math.cos(this.wanderA) * 40,
                 this.y + Math.sin(this.wanderA) * 40, dt, spd * 0.4);
    }
    this.setAnim('move');
  };

  /* Giáo: đứng ngoài tầm ôm, chọc bằng đòn có tầm với dài và có báo trước. */
  Enemy.prototype.ai_poke = function (dt, ctx, t, spd) {
    var d = Math.hypot(t.x - this.x, t.y - this.y);
    var reach = this.def.reach;
    if (this.state === 'wind') {
      if (this.stateT >= this.def.tell) {
        this.state = 'idle'; this.stateT = 0;
        if (Math.hypot(t.x - this.x, t.y - this.y) < reach + 8) {
          this.hitTarget(ctx, t, this.dmg, 60);
        }
        ctx.fx.ring(this.x + (t.x - this.x) * 0.4, this.y + (t.y - this.y) * 0.4,
                    4, 20, '#ffd24a', 0.2);
      }
      return;
    }
    if (d > reach * 0.85) { this.steer(ctx.world, t.x, t.y, dt, spd); this.setAnim('move'); }
    else {
      this.setAnim('attack'); this.animT = 0;
      if ((this.atkCd -= dt) <= 0) {
        this.atkCd = 1.6; this.state = 'wind'; this.stateT = 0; this.tellT = this.def.tell;
        this.faceFrom(t.x - this.x, t.y - this.y);
      }
    }
  };

  /* Đánh rồi lùi: ép người chơi không đứng yên chờ. */
  Enemy.prototype.ai_hitrun = function (dt, ctx, t, spd) {
    var d = Math.hypot(t.x - this.x, t.y - this.y);
    if (this.state === 'back') {
      this.steer(ctx.world, this.x * 2 - t.x, this.y * 2 - t.y, dt, spd * 1.1);
      this.setAnim('move');
      if (this.stateT > 0.9) { this.state = 'idle'; this.stateT = 0; }
      return;
    }
    if (d > this.r + (t.r || 6) + 2) {
      this.steer(ctx.world, t.x, t.y, dt, spd);
      this.setAnim('move');
    } else {
      this.setAnim('attack'); this.animT = 0;
      if (this.tryMelee(ctx, t, 1.1)) { this.state = 'back'; this.stateT = 0; }
    }
  };

  Enemy.prototype.ai_ranged = function (dt, ctx, t, spd) {
    var d = Math.hypot(t.x - this.x, t.y - this.y);
    var D = this.def;
    if (this.state === 'aim') {
      if (this.stateT >= D.tell) {
        this.state = 'idle'; this.stateT = 0;
        this.shoot(ctx, t);
      }
      this.setAnim('rangedAttack');
      return;
    }
    if (d > D.shootRange) { this.steer(ctx.world, t.x, t.y, dt, spd); this.setAnim('move'); }
    else if (d < D.keep * 0.7) {
      this.steer(ctx.world, this.x * 2 - t.x, this.y * 2 - t.y, dt, spd * 0.9);
      this.setAnim('move');
    } else {
      this.setAnim('idle');
      if ((this.atkCd -= dt) <= 0) {
        this.atkCd = D.cd;
        this.state = 'aim'; this.stateT = 0; this.tellT = D.tell;
        this.faceFrom(t.x - this.x, t.y - this.y);
      }
    }
  };

  /* Pháp sư: bắn như ranged, và HỒI MÁU cho đồng bọn — buộc người chơi phải
   * quyết định giết ai trước, thay vì cứ đánh con nào gần nhất. */
  Enemy.prototype.ai_caster = function (dt, ctx, t, spd) {
    this.ai_ranged(dt, ctx, t, spd);
    var H = this.def.healAlly;
    if (!H) return;
    if ((this.healCd = (this.healCd === undefined ? H.cd : this.healCd) - dt) <= 0) {
      this.healCd = H.cd;
      var did = false;
      for (var i = 0; i < ctx.enemies.length; i++) {
        var e = ctx.enemies[i];
        if (e === this || e.dead || e.hp >= e.hpMax) continue;
        if (Math.hypot(e.x - this.x, e.y - this.y) < H.r) {
          e.hp = Math.min(e.hpMax, e.hp + H.amt);
          ctx.fx.part(e.x, e.y - 8, { col: '#b06aff', r: 2, life: 0.5, g: -40, glow: true, prio: 1 });
          did = true;
        }
      }
      if (did) ctx.fx.ring(this.x, this.y, 4, H.r, '#b06aff', 0.45);
    }
  };

  Enemy.prototype.ai_support = function (dt, ctx, t, spd) {
    var B = this.def.buff;
    var d = Math.hypot(t.x - this.x, t.y - this.y);
    // Học sĩ NÚP SAU đồng bọn: giữ khoảng cách với người chơi.
    if (d < 150) this.steer(ctx.world, this.x * 2 - t.x, this.y * 2 - t.y, dt, spd);
    else if (d > 260) this.steer(ctx.world, t.x, t.y, dt, spd * 0.8);
    this.setAnim('move');
    for (var i = 0; i < ctx.enemies.length; i++) {
      var e = ctx.enemies[i];
      if (e === this || e.dead) continue;
      if (Math.hypot(e.x - this.x, e.y - this.y) < B.r) {
        e.buffAtk = B.atk; e.buffSpd = B.spd;
      }
    }
    this.auraPhase = (this.auraPhase || 0) + dt;
  };

  Enemy.prototype.ai_exploder = function (dt, ctx, t, spd) {
    var D = this.def;
    var d = Math.hypot(t.x - this.x, t.y - this.y);
    if (this.state === 'fuse') {
      this.setAnim('startExplode');
      // vẫn lết tới trong lúc cháy ngòi — nên né phải né SỚM
      this.steer(ctx.world, t.x, t.y, dt, spd * 0.55);
      if (this.stateT >= D.fuse) this.detonate(ctx);
      return;
    }
    if (d < D.blast * 0.55) { this.state = 'fuse'; this.stateT = 0; this.tellT = D.fuse; }
    else { this.steer(ctx.world, t.x, t.y, dt, spd); this.setAnim('move'); }
  };

  Enemy.prototype.detonate = function (ctx) {
    var D = this.def;
    ctx.fx.anim(G.Atlas.pick('fx.SlimeExplosion', 'fx.BloodExplosion'),
                this.x, this.y, { scale: D.blast / 42, fps: 24 });
    ctx.fx.ring(this.x, this.y, 6, D.blast, '#ff8a2c', 0.35);
    ctx.fx.hit(3);
    var p = ctx.player;
    if (Math.hypot(p.x - this.x, p.y - this.y) < D.blast) {
      ctx.hurtPlayer(this.dmg, this.x, this.y, 130);
    }
    for (var i = 0; i < ctx.pets.length; i++) {
      var q = ctx.pets[i];
      if (Math.hypot(q.x - this.x, q.y - this.y) < D.blast) q.hurt(this.dmg * 0.6, this.x, this.y, 90);
    }
    // Nổ cũng phá tường — làm ván không bao giờ tắc, và thưởng cho việc dụ nó
    // vào đúng chỗ mình muốn thông.
    var tx = (this.x / T) | 0, ty = (this.y / T) | 0;
    for (var y = ty - 1; y <= ty + 1; y++) {
      for (var x = tx - 1; x <= tx + 1; x++) ctx.world.dig(x, y, 999);
    }
    this.dead = true;
    this.noXp = true;
  };

  Enemy.prototype.ai_charger = function (dt, ctx, t, spd) {
    var D = this.def;
    var d = Math.hypot(t.x - this.x, t.y - this.y);
    if (this.state === 'wind') {
      this.setAnim('chargeAnticipation');
      if (this.stateT >= D.wind) {
        this.state = 'dash'; this.stateT = 0;
        var a = Math.atan2(t.y - this.y, t.x - this.x);
        this.dvx = Math.cos(a) * D.dashSpd;
        this.dvy = Math.sin(a) * D.dashSpd;
      }
      return;
    }
    if (this.state === 'dash') {
      this.setAnim('charge');
      var before = this.x, beforeY = this.y;
      this.move(ctx.world, this.dvx * dt, this.dvy * dt);
      if (Math.abs(this.x - before) < 0.2 && Math.abs(this.y - beforeY) < 0.2) {
        // đâm vách: choáng, đây là cửa sổ để phản đòn
        this.state = 'idle'; this.stateT = 0; this.stun = 1.1;
        ctx.fx.burst(this.x, this.y, 8, { col: '#c8b090', spd: 90, life: 0.4, r: 2, prio: 1 });
        ctx.fx.hit(2);
        return;
      }
      if (Math.hypot(t.x - this.x, t.y - this.y) < this.r + (t.r || 6)) {
        this.hitTarget(ctx, t, this.dmg, 150);
        this.state = 'idle'; this.stateT = 0;
      }
      if (this.stateT > D.dashTime) { this.state = 'idle'; this.stateT = 0; }
      return;
    }
    if (d < 190 && (this.atkCd -= dt) <= 0) {
      this.atkCd = 3.2;
      this.state = 'wind'; this.stateT = 0; this.tellT = D.wind;
      this.faceFrom(t.x - this.x, t.y - this.y);
      return;
    }
    this.steer(ctx.world, t.x, t.y, dt, spd);
    this.setAnim('move');
  };

  /* Chui đất: dưới đất thì miễn sát thương và đi xuyên vách; trồi lên đúng chỗ
   * người chơi vừa đứng. Trị đúng bệnh đứng-yên-đào. */
  Enemy.prototype.ai_burrow = function (dt, ctx, t, spd) {
    var D = this.def;
    if (this.state === 'under') {
      this.invuln = 0.2;
      this.x += (t.x - this.x) * Math.min(1, dt * 1.6);
      this.y += (t.y - this.y) * Math.min(1, dt * 1.6);
      if (Math.random() < 0.5) {
        ctx.fx.part(this.x + (Math.random() - .5) * 10, this.y + 4,
          { col: '#8a6a4a', r: 1.6, life: 0.35, g: 20, prio: 0 });
      }
      if (this.stateT >= D.burrowT) {
        this.state = 'up'; this.stateT = 0; this.tellT = D.tell;
        ctx.fx.ring(this.x, this.y, 3, 18, '#c8a070', 0.3);
      }
      return;
    }
    if (this.state === 'up') {
      this.setAnim('move');
      this.steer(ctx.world, t.x, t.y, dt, spd * 0.85);
      this.tryMelee(ctx, t, 0.8);
      if (this.stateT >= D.surfaceT) { this.state = 'under'; this.stateT = 0; }
      return;
    }
    this.state = 'up'; this.stateT = 0;
  };

  Enemy.prototype.ai_hopper = function (dt, ctx, t, spd) {
    var D = this.def;
    if (this.state === 'hop') {
      this.setAnim('jump');
      this.move(ctx.world, this.dvx * dt, this.dvy * dt);
      if (this.stateT > 0.4) { this.state = 'idle'; this.stateT = 0; this.z = 0; this.vz = 0; }
      else this.z = Math.sin(this.stateT / 0.4 * Math.PI) * 14;
      if (Math.hypot(t.x - this.x, t.y - this.y) < this.r + (t.r || 6) + 2) {
        this.hitTarget(ctx, t, this.dmg, 90);
      }
      return;
    }
    var d = Math.hypot(t.x - this.x, t.y - this.y);
    if (d < D.hop && (this.atkCd -= dt) <= 0) {
      this.atkCd = D.hopCd;
      var a = Math.atan2(t.y - this.y, t.x - this.x);
      this.dvx = Math.cos(a) * 210; this.dvy = Math.sin(a) * 210;
      this.state = 'hop'; this.stateT = 0; this.vz = 1;
      return;
    }
    this.steer(ctx.world, t.x, t.y, dt, spd * 0.55);
    this.setAnim('move');
  };

  /* Bay: bỏ qua vách. Đây là câu trả lời cho "đục hầm rồi trốn trong đó" —
   * DRG dùng Mactera đúng vào việc này. */
  Enemy.prototype.ai_flyer = function (dt, ctx, t, spd) {
    var a = Math.atan2(t.y - this.y, t.x - this.x);
    this.x += Math.cos(a) * spd * dt;
    this.y += Math.sin(a) * spd * dt;
    this.faceFrom(Math.cos(a), Math.sin(a));
    this.z = 8 + Math.sin(this.animT * 6) * 2;
    this.setAnim('move');
    if (Math.hypot(t.x - this.x, t.y - this.y) < this.r + (t.r || 6)) {
      this.tryMelee(ctx, t, 0.7);
    }
  };

  /* Hộ vệ: giáp MẶT TRƯỚC. Đứng trước mặt nó thì đánh gần như vô ích; phải đi
   * vòng ra sau. Đây là mô-típ ưa thích của DRG (Praetorian, Oppressor) và nó
   * chuyển sang 2D rất hợp vì hướng là thứ nhìn thấy được. */
  Enemy.prototype.ai_tank = function (dt, ctx, t, spd) {
    var d = Math.hypot(t.x - this.x, t.y - this.y);
    var S = this.def.slam;
    if (this.state === 'slam') {
      this.setAnim('attack');
      if (this.stateT >= this.def.tell) {
        this.state = 'idle'; this.stateT = 0;
        ctx.fx.ring(this.x, this.y, 8, S.r, '#ff7a4a', 0.4);
        ctx.fx.hit(3);
        if (Math.hypot(t.x - this.x, t.y - this.y) < S.r) {
          this.hitTarget(ctx, t, S.dmg, 170);
        }
      }
      return;
    }
    if (d < S.r * 0.8 && (this.atkCd -= dt) <= 0) {
      this.atkCd = S.cd;
      this.state = 'slam'; this.stateT = 0; this.tellT = this.def.tell;
      this.faceFrom(t.x - this.x, t.y - this.y);
      return;
    }
    this.steer(ctx.world, t.x, t.y, dt, spd);
    this.setAnim('move');
  };

  // ---------------------------------------------------------------- tiện ích

  Enemy.prototype.tryMelee = function (ctx, t, cd) {
    if ((this.atkCd -= ctx.dt) > 0) return false;
    this.atkCd = cd;
    this.hitTarget(ctx, t, this.dmg, 70);
    return true;
  };

  Enemy.prototype.hitTarget = function (ctx, t, dmg, kb) {
    var d = dmg * (1 + (this.buffAtk || 0));
    if (t === ctx.player) ctx.hurtPlayer(d, this.x, this.y, kb);
    else {
      t.hurt(d, this.x, this.y, kb);
      ctx.fx.burst(t.x, t.y - 4, 4, { col: '#ff6a5a', spd: 55, life: 0.25, r: 1.6, prio: 1 });
    }
    if (this.def.leech) {
      this.hp = Math.min(this.hpMax, this.hp + d * this.def.leech);
    }
  };

  Enemy.prototype.shoot = function (ctx, t) {
    var pr = this.def.proj;
    var a = Math.atan2(t.y - this.y, t.x - this.x);
    ctx.projs.push(new G.Projectile(this.x, this.y - 6,
      Math.cos(a) * pr.spd, Math.sin(a) * pr.spd, {
        r: pr.r, col: pr.col, dmg: this.dmg * (1 + (this.buffAtk || 0)),
        friendly: false, homing: pr.homing || 0, life: 3.2
      }));
    ctx.fx.burst(this.x + Math.cos(a) * 8, this.y - 6 + Math.sin(a) * 8, 3,
      { col: pr.col, spd: 40, life: 0.2, r: 1.4 });
  };

  /* Giáp mặt trước: đòn tới từ phía nó đang nhìn thì bị chặn phần lớn. */
  Enemy.prototype.armorAt = function (sx, sy) {
    var a = this.def.armorFront || 0;
    var flat = this.def.armor || 0;
    if (a > 0 && sx !== undefined) {
      var fv = [[0, 1], [1, 0], [0, -1], [-1, 0]][this.face];
      var dx = sx - this.x, dy = sy - this.y;
      var m = Math.hypot(dx, dy) || 1;
      if ((dx / m) * fv[0] + (dy / m) * fv[1] > 0.35) flat = Math.max(flat, a);
    }
    return Math.max(0, flat - (this.vuln || 0));
  };

  Enemy.prototype.onDeath = function (ctx) {
    var D = this.def;
    ctx.fx.burst(this.x, this.y - 4, 9,
      { col: '#c04a4a', spd: 95, life: 0.45, r: 2, prio: 1 });
    var k = G.Atlas.pick('fx.BloodExplosion', 'fx.SlimeExplosion');
    if (k && Math.random() < 0.5) ctx.fx.anim(k, this.x, this.y, { scale: 0.55, fps: 22 });
    if (D.deathBurst) {
      var B = D.deathBurst;
      ctx.fx.ring(this.x, this.y, 5, B.r, B.col, 0.4);
      if (Math.hypot(ctx.player.x - this.x, ctx.player.y - this.y) < B.r) {
        ctx.hurtPlayer(B.dmg, this.x, this.y, 80);
      }
    }
  };

  Enemy.prototype.draw = function (ctx) {
    var key = this.frameKey();
    this.drawShadow(ctx);
    if (!key) return;
    // VÒNG CHÂN ĐỎ cho mọi con thù địch. Người Hang trong bộ art này có dáng
    // người y hệt người chơi, và giữa một đám sáu linh thú thì không ai kịp
    // phân biệt bạn với thù bằng cách nhìn mặt. Màu theo mã của DRG:Survivor:
    // cam = sắp nổ, vàng = đang lên gân, tím = tinh nhuệ, đỏ = thường.
    if (!this.harmless) {
      var dc = this.dangerCol() || '#d0404a';
      ctx.save();
      ctx.globalAlpha = this.tellT > 0 ? 0.75 : 0.34;
      ctx.strokeStyle = dc;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y + 1, this.r + 2, (this.r + 2) * 0.45, 0, 0, 6.2832);
      ctx.stroke();
      ctx.restore();
    }
    var n = G.Atlas.count(key) || 1;
    var i = (this.animT * this.fps) | 0;
    var alpha = this.state === 'under' ? 0.22 : 1;

    // Vòng báo trước dưới chân: to dần trong lúc "lên gân". Đây là toàn bộ khả
    // năng đọc trận của người chơi trên màn nhỏ.
    if (this.tellT > 0) {
      var D = this.def;
      var full = this.state === 'fuse' ? D.fuse : this.state === 'wind' ? D.wind : (D.tell || 0.5);
      var k = 1 - this.tellT / Math.max(0.01, full);
      ctx.save();
      ctx.globalAlpha = 0.45 + 0.35 * Math.sin(k * 18);
      ctx.strokeStyle = this.state === 'fuse' ? '#ff8a2c' : '#ffd24a';
      ctx.lineWidth = 2;
      var rr = (this.state === 'fuse' ? this.def.blast : this.r + 16) * (0.35 + k * 0.65);
      ctx.beginPath();
      ctx.ellipse(this.x, this.y + 1, rr, rr * 0.5, 0, 0, 6.2832);
      ctx.stroke();
      ctx.restore();
    }

    G.Atlas.draw(ctx, key, i, this.x, this.y - this.z, {
      flip: this.face === 3, scale: this.scale,
      white: this.flash > 0, alpha: alpha
    });

    if (this.elite || this.hp < this.hpMax * 0.999) {
      if (this.elite) this.drawBar(ctx, 30, 30);
    }
    if (this.webbed > 0) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#d8e8ff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(this.x, this.y - 4, this.r + 3, 0, 6.2832);
      ctx.stroke();
      ctx.restore();
    }
  };

  G.Enemy = Enemy;
})(window.DC = window.DC || {});
