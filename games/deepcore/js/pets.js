/*
 * pets.js — bộ não của linh thú, và đạn bay.
 *
 * BA LỖI KINH ĐIỂN CỦA MINION mà file này cố ý tránh:
 *
 * 1. "Minion bị bỏ lại." Trong Path of Exile, dây xích (leash) chỉ được kiểm
 *    khi minion đang ở trạng thái ĐI THEO — đang đánh nhau thì không kiểm, nên
 *    chủ chạy đi là nó ở lại đánh tới chết. Ở đây leash kiểm ở MỌI trạng thái,
 *    không có ngoại lệ.
 * 2. "Minion kẹt đường." Không có tìm đường, chỉ có lái theo hướng + trượt vách.
 *    Bù lại: kẹt quá 1,1 giây hoặc xa quá 1,6 lần dây xích thì DỊCH CHUYỂN về
 *    bên chủ. Xấu về lý thuyết, nhưng người chơi không bao giờ mất linh thú.
 * 3. "Không hiểu con nào đang làm gì." Nên mỗi con có một LUẬT NGẮM viết thành
 *    câu, in thẳng lên thẻ, và khi ra đòn có vạch nối tới mục tiêu.
 */
(function (G) {
  'use strict';

  var T = 16;

  // ---------------------------------------------------------------- đạn
  function Projectile(x, y, vx, vy, o) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.r = o.r || 3;
    this.col = o.col || '#fff';
    this.dmg = o.dmg || 1;
    this.life = o.life || 2.2;
    this.t = 0;
    this.friendly = !!o.friendly;
    this.pierce = o.pierce || 0;
    this.homing = o.homing || 0;
    this.wallPass = !!o.wallPass;
    this.onHit = o.onHit || null;
    this.hitList = [];
    this.dead = false;
    this.trail = o.trail !== false;
  }

  Projectile.prototype.update = function (dt, ctx) {
    this.t += dt;
    if (this.t > this.life) { this.dead = true; return; }
    if (this.homing) {
      var tgt = this.friendly ? nearest(ctx.enemies, this.x, this.y, 200)
                              : ctx.player;
      if (tgt && !tgt.dead) {
        var a = Math.atan2(tgt.y - this.y, tgt.x - this.x);
        var sp = Math.hypot(this.vx, this.vy);
        var ca = Math.atan2(this.vy, this.vx);
        var d = ((a - ca + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        ca += Math.max(-this.homing * dt * 3, Math.min(this.homing * dt * 3, d));
        this.vx = Math.cos(ca) * sp; this.vy = Math.sin(ca) * sp;
      }
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (!this.wallPass && ctx.world.solid((this.x / T) | 0, (this.y / T) | 0)) {
      this.dead = true;
      ctx.fx.burst(this.x, this.y, 4, { col: this.col, spd: 40, life: 0.22, r: 1.5 });
      return;
    }
    if (this.trail && Math.random() < 0.55) {
      ctx.fx.part(this.x, this.y, { col: this.col, r: 1.4, life: 0.2, g: 0, prio: 0 });
    }

    var list = this.friendly ? ctx.enemies : [ctx.player];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || e.dead || this.hitList.indexOf(e) >= 0) continue;
      var rr = (e.r || 6) + this.r;
      if ((e.x - this.x) * (e.x - this.x) + (e.y - this.y) * (e.y - this.y) < rr * rr) {
        this.hitList.push(e);
        if (this.onHit) this.onHit(e, this, ctx);
        else ctx.hitEnemy ? ctx.hitEnemy(e, this.dmg, this.x, this.y, 40) : e.hurt(this.dmg, this.x, this.y, 40);
        ctx.fx.burst(this.x, this.y, 5, { col: this.col, spd: 70, life: 0.25, r: 1.6, prio: 1 });
        if (this.pierce > 0) this.pierce--;
        else { this.dead = true; return; }
      }
    }
  };

  Projectile.prototype.draw = function (ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = this.col;
    ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 2.1, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, 6.2832); ctx.fill();
    ctx.restore();
  };

  // ---------------------------------------------------------------- tìm mục tiêu
  function nearest(list, x, y, maxD) {
    var best = null, bd = maxD * maxD;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.dead || e.harmless) continue;
      var d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /* Chỗ ĐÔNG nhất: chấm điểm mỗi con bằng số bạn bè quanh nó trong 70px.
   * Đủ rẻ cho vài chục con, và cho ra đúng cái người chơi mong: bom rơi vào đám. */
  function crowdiest(list, x, y, maxD) {
    var best = null, bs = -1;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.dead || e.harmless) continue;
      var dx = e.x - x, dy = e.y - y;
      if (dx * dx + dy * dy > maxD * maxD) continue;
      var s = 0;
      for (var j = 0; j < list.length; j++) {
        var o = list[j];
        if (o.dead || o.harmless) continue;
        var ex = o.x - e.x, ey = o.y - e.y;
        if (ex * ex + ey * ey < 4900) s++;
      }
      if (s > bs) { bs = s; best = e; }
    }
    return best;
  }

  function extremeHp(list, x, y, maxD, low) {
    var best = null, bv = low ? 1e9 : -1;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.dead || e.harmless) continue;
      var dx = e.x - x, dy = e.y - y;
      if (dx * dx + dy * dy > maxD * maxD) continue;
      if (low ? e.hp < bv : e.hp > bv) { bv = e.hp; best = e; }
    }
    return best;
  }

  // ---------------------------------------------------------------- linh thú
  function Pet() {}
  G.extendActor(Pet);

  Pet.prototype.init = function (def, tier, owner, slot) {
    var s = G.petStats(def, tier);
    this.initActor(owner.x, owner.y, {
      r: 5, hp: s.hp, speed: def.spd, art: def.art, fps: 11, shadow: true
    });
    this.def = def;
    this.tier = tier;
    this.st = s;
    this.owner = owner;
    this.slot = slot;
    this.orbit = slot * (Math.PI * 2 / 4) + Math.random();
    this.cd = Math.random() * def.nhip;
    this.stuck = 0;
    this.lastX = this.x; this.lastY = this.y;
    this.target = null;
    this.visible = true;
    this.attackFlash = 0;
    this.beam = null;         // vạch nối tới mục tiêu khi vừa ra đòn
    this.pulseT = 0;
    this.wallT = 0;
    return this;
  };

  Pet.prototype.aimAt = function (ctx) {
    var d = this.def, R = 320;
    switch (d.ngam) {
      case 'nearOwner': return nearest(ctx.enemies, this.owner.x, this.owner.y, R);
      case 'nearSelf': return nearest(ctx.enemies, this.x, this.y, R);
      case 'lowHp': return extremeHp(ctx.enemies, this.x, this.y, R, true);
      case 'highHp': return extremeHp(ctx.enemies, this.x, this.y, R, false);
      case 'crowd': return crowdiest(ctx.enemies, this.owner.x, this.owner.y, R);
      case 'ore': return null;      // xử lý riêng: nó đục quặng chứ không đánh
      default: return nearest(ctx.enemies, this.x, this.y, R);
    }
  };

  /* Chỗ nó MUỐN đứng. Đây mới là thứ phân biệt các linh thú với nhau về mặt
   * nhìn — cùng sát thương nhưng đứng khác chỗ thì cảm giác khác hẳn. */
  Pet.prototype.homeSpot = function (ctx, dt) {
    var o = this.owner, d = this.def;
    if (d.bam === 'front') {
      // chen vào giữa chủ và cụm quái đông nhất
      var t = crowdiest(ctx.enemies, o.x, o.y, 260) || this.target;
      var a = t ? Math.atan2(t.y - o.y, t.x - o.x) : (o.face === 2 ? -Math.PI / 2 : o.face === 0 ? Math.PI / 2 : o.face === 1 ? 0 : Math.PI);
      return { x: o.x + Math.cos(a) * d.hold, y: o.y + Math.sin(a) * d.hold };
    }
    if (d.bam === 'orbit') {
      this.orbit += dt * 1.15;
      return { x: o.x + Math.cos(this.orbit) * d.hold,
               y: o.y + Math.sin(this.orbit) * d.hold * 0.72 };
    }
    if (d.bam === 'stick') {
      var ang = this.slot * 1.6 + 2.2;
      return { x: o.x + Math.cos(ang) * d.hold, y: o.y + Math.sin(ang) * d.hold * 0.7 };
    }
    return null;    // 'free' — tự lo
  };

  Pet.prototype.update = function (dt, ctx) {
    this.stepCommon(dt);
    if (this.attackFlash > 0) this.attackFlash -= dt;
    if (this.beam) { this.beam.t -= dt; if (this.beam.t <= 0) this.beam = null; }
    var o = this.owner, d = this.def;
    if (o.dead) return;

    // --- DÂY XÍCH: kiểm ở MỌI trạng thái, kể cả đang đánh nhau. Đây là chỗ
    // Path of Exile làm sai và đẻ ra cả một lớp lỗi "minion ở lại chết một mình".
    var dx = o.x - this.x, dy = o.y - this.y;
    var dist = Math.hypot(dx, dy);
    var leash = d.leash || 200;
    if (dist > leash * 1.6 || this.stuck > 1.1) {
      this.x = o.x + (Math.random() - 0.5) * 14;
      this.y = o.y + (Math.random() - 0.5) * 14;
      this.stuck = 0;
      ctx.fx.burst(this.x, this.y, 6, { col: '#9ad8ff', spd: 60, life: 0.3, r: 1.6 });
      ctx.fx.ring(this.x, this.y, 2, 14, '#9ad8ff', 0.25);
    }

    // --- chọn mục tiêu
    if (!this.target || this.target.dead ||
        Math.hypot(this.target.x - o.x, this.target.y - o.y) > 360) {
      this.target = this.aimAt(ctx);
    }

    // --- đi
    var goal = null;
    var engaging = false;
    if (d.ngam === 'ore') {
      goal = this.oreGoal(ctx);
    } else if (this.target && d.nhip > 0) {
      var td = Math.hypot(this.target.x - this.x, this.target.y - this.y);
      if (td > d.range * 0.82) {
        goal = { x: this.target.x, y: this.target.y };
        engaging = true;
      } else {
        engaging = true;
        goal = this.homeSpot(ctx, dt);
        if (goal && d.range < 60) goal = null;   // cận chiến thì đứng yên mà đánh
      }
    }
    if (!goal) goal = this.homeSpot(ctx, dt);

    // Kéo về phía chủ nếu đang lang thang quá xa, bất kể đang làm gì.
    if (dist > leash) {
      goal = { x: o.x, y: o.y };
      engaging = false;
    }

    if (goal) {
      var gx = goal.x - this.x, gy = goal.y - this.y;
      var gd = Math.hypot(gx, gy);
      if (gd > 4) {
        var sp = d.spd * (engaging ? 1.12 : 1);
        this.faceFrom(gx, gy);
        this.move(ctx.world, gx / gd * sp * dt, gy / gd * sp * dt);
        this.setAnim('move');
      } else this.setAnim('idle');
    } else this.setAnim('idle');

    // --- phát hiện kẹt
    if (Math.abs(this.x - this.lastX) < 0.35 && Math.abs(this.y - this.lastY) < 0.35 &&
        (goal && Math.hypot(goal.x - this.x, goal.y - this.y) > 18)) {
      this.stuck += dt;
    } else this.stuck = 0;
    this.lastX = this.x; this.lastY = this.y;

    // --- ra đòn / hào quang
    this.pulseT += dt;
    if (d.nhip > 0) {
      this.cd -= dt * ctx.run.st.petRate * (this.tier >= 5 && d.id === 'cho' ? (1 + (this.stacks || 0) * 0.06) : 1);
      if (this.cd <= 0 && this.target && !this.target.dead) {
        var reach = d.range + this.r + (this.target.r || 6);
        if (Math.hypot(this.target.x - this.x, this.target.y - this.y) <= reach) {
          this.cd = d.nhip;
          this.strike(ctx);
        }
      }
    }
    this.aura(dt, ctx);
  };

  /* Con đào: tìm ô quặng gần nhất trong tầm và đục hộ. Đây là linh thú duy nhất
   * không đánh nhau — và cũng là con duy nhất trực tiếp đẻ ra kinh nghiệm, vì
   * trong game này đào mới là nguồn lên cấp. */
  Pet.prototype.oreGoal = function (ctx) {
    var w = ctx.world;
    if (this.oreTile && w.diggable(this.oreTile.x, this.oreTile.y)) {
      var cx = this.oreTile.x * T + 8, cy = this.oreTile.y * T + 8;
      if (Math.hypot(cx - this.x, cy - this.y) < this.def.range + 8) {
        this.mineT = (this.mineT || 0) + ctx.dt;
        if (this.mineT >= this.def.nhip) {
          this.mineT = 0;
          var res = w.dig(this.oreTile.x, this.oreTile.y,
                          this.def.mine * G.PET_TIER[this.tier - 1].dmg);
          ctx.fx.burst(cx, cy, 3, { col: '#c8b090', spd: 45, life: 0.3, r: 1.4 });
          this.attackFlash = 0.16;
          if (res) {
            ctx.onPetDig(res, this);
            this.oreTile = null;
          }
        }
        return null;
      }
      return { x: cx, y: cy };
    }
    // tìm ô quặng mới quanh chủ
    var o = this.owner;
    var otx = (o.x / T) | 0, oty = (o.y / T) | 0;
    var best = null, bd = 1e9;
    var R = 11;
    for (var y = oty - R; y <= oty + R; y++) {
      for (var x = otx - R; x <= otx + R; x++) {
        if (!w.inside(x, y) || w.kind[w.idx(x, y)] !== G.TK.ORE) continue;
        var dd = (x - otx) * (x - otx) + (y - oty) * (y - oty);
        if (dd < bd) { bd = dd; best = { x: x, y: y }; }
      }
    }
    this.oreTile = best;
    return best ? { x: best.x * T + 8, y: best.y * T + 8 } : null;
  };

  Pet.prototype.strike = function (ctx) {
    var d = this.def, t = this.target;
    this.attackFlash = 0.18;
    this.setAnim('attack');
    this.animT = 0;
    this.faceFrom(t.x - this.x, t.y - this.y);

    var dmg = this.st.dmg * ctx.run.st.petDmg * (ctx.run.sacBonus || 1);
    // LUẬT "KỀ BÊN": quái đứng gần NGƯỜI CHƠI thì ăn thêm đòn. Đây là toàn bộ
    // chiều sâu của một game mà người chơi không được nhắm: vị trí thay cho ngắm.
    var near = Math.hypot(t.x - this.owner.x, t.y - this.owner.y) < ctx.run.st.nearR;
    if (near) dmg *= 1.25;
    if (ctx.run.rallyBoost > 0) dmg *= 1.35;

    if (d.proj) {
      var a = Math.atan2(t.y - this.y, t.x - this.x);
      var pr = d.proj;
      var self = this;
      ctx.projs.push(new Projectile(this.x, this.y - 6,
        Math.cos(a) * pr.spd, Math.sin(a) * pr.spd, {
          r: pr.r, col: pr.col, dmg: dmg, friendly: true,
          pierce: (pr.pierce || 0) + (this.tier >= 3 && d.id === 'khoan' ? 1 : 0),
          onHit: d.web ? function (e, p, c) { self.webHit(e, p, c, dmg); } : null
        }));
      return;
    }
    if (d.chain) {
      this.chainZap(ctx, t, dmg);
      return;
    }
    if (d.aoe) {
      this.boom(ctx, t, dmg);
      return;
    }
    // cận chiến
    ctx.hitEnemy(t, dmg, this.x, this.y, d.kb || 10);
    this.beam = { x: t.x, y: t.y, t: 0.1, col: '#ffe8b0' };
    ctx.fx.burst(t.x, t.y - 4, 4, { col: '#ffd8a0', spd: 60, life: 0.22, r: 1.6, prio: 1 });
    if (d.taunt && Math.random() < d.taunt) t.taunt = { by: this, t: 3 };
    if (d.leech) {
      var h = Math.min(dmg * d.leech, this.owner.st.hp - this.owner.hp);
      if (h > 0.5) {
        this.owner.hp += h;
        ctx.fx.text(this.owner.x, this.owner.y - 28, '+' + Math.round(h), '#7dff9a');
      }
    }
    if (t.dead && d.id === 'cho' && this.tier >= 5) {
      this.stacks = Math.min(10, (this.stacks || 0) + 1);
    }
  };

  Pet.prototype.webHit = function (e, p, ctx, dmg) {
    var W = this.def.web;
    for (var i = 0; i < ctx.enemies.length; i++) {
      var q = ctx.enemies[i];
      if (q.dead) continue;
      if (Math.hypot(q.x - p.x, q.y - p.y) < W.r) {
        q.slow = Math.max(q.slow, W.slow);
        q.webbed = W.time;
        if (this.tier >= 3) q.vuln = 0.15;
        ctx.run.slowCount = (ctx.run.slowCount || 0) + 1;
      }
    }
    ctx.fx.ring(p.x, p.y, 4, W.r, '#d8e8ff', 0.4);
    ctx.hitEnemy(e, dmg, p.x, p.y, 0);
  };

  Pet.prototype.chainZap = function (ctx, first, dmg) {
    var d = this.def.chain;
    var hops = d.hops + (this.tier >= 5 ? (ctx.run.chainBonus || 0) : 0);
    var cur = first, from = this, seen = [];
    for (var i = 0; i < hops && cur; i++) {
      ctx.hitEnemy(cur, dmg * Math.pow(1 - d.falloff, i), from.x, from.y, 4);
      ctx.fx.part(cur.x, cur.y, { col: d.col, r: 2, life: 0.25, g: 0, glow: true, prio: 1 });
      this.zap(ctx, from.x, from.y - 6, cur.x, cur.y - 6, d.col);
      seen.push(cur);
      from = cur;
      var nx = null, bd = d.range * d.range;
      for (var j = 0; j < ctx.enemies.length; j++) {
        var e = ctx.enemies[j];
        if (e.dead || seen.indexOf(e) >= 0) continue;
        var dd = (e.x - cur.x) * (e.x - cur.x) + (e.y - cur.y) * (e.y - cur.y);
        if (dd < bd) { bd = dd; nx = e; }
      }
      cur = nx;
    }
  };

  Pet.prototype.zap = function (ctx, x0, y0, x1, y1, col) {
    ctx.zaps.push({ x0: x0, y0: y0, x1: x1, y1: y1, col: col, t: 0.16 });
  };

  Pet.prototype.boom = function (ctx, t, dmg) {
    var d = this.def;
    var R = d.aoe;
    ctx.fx.anim(G.Atlas.pick('fx.SlimeExplosion', 'fx.BloodExplosion'), t.x, t.y, { scale: R / 40, fps: 22 });
    ctx.fx.ring(t.x, t.y, 6, R, '#ffb04a', 0.32);
    ctx.fx.hit(2);
    for (var i = 0; i < ctx.enemies.length; i++) {
      var e = ctx.enemies[i];
      if (e.dead) continue;
      if (Math.hypot(e.x - t.x, e.y - t.y) < R) {
        ctx.hitEnemy(e, dmg, t.x, t.y, 45);
        if (this.tier >= 3) e.burn = { t: 3, dps: dmg * 0.22 };
        if (e.dead) ctx.run.mineKills = (ctx.run.mineKills || 0) + 1;
      }
    }
  };

  /* Hào quang: chạy liên tục, không theo nhịp đánh. */
  Pet.prototype.aura = function (dt, ctx) {
    var d = this.def, o = this.owner;
    if (d.aura) {
      ctx.run.auraAtk = Math.max(ctx.run.auraAtk || 0, d.auraAtk);
      ctx.run.auraDr = Math.max(ctx.run.auraDr || 0, d.auraDr);
      if (this.tier >= 3) ctx.run.auraSpd = 0.12;
      if (this.tier >= 5) {
        this.pulseCd = (this.pulseCd || 12) - dt;
        if (this.pulseCd <= 0) {
          this.pulseCd = 12;
          ctx.freeStrike = true;
          ctx.fx.ring(o.x, o.y, 10, d.aura, '#ffd98a', 0.5);
        }
      }
    }
    if (d.light) {
      ctx.run.petLight = Math.max(ctx.run.petLight || 0, d.light);
      if (this.tier >= 5) {
        for (var i = 0; i < ctx.enemies.length; i++) {
          var e = ctx.enemies[i];
          if (!e.dead && Math.hypot(e.x - this.x, e.y - this.y) < d.light) {
            e.slow = Math.max(e.slow, 0.2);
          }
        }
      }
    }
    if (d.shred) ctx.run.shred = d.shred;
    if (d.id === 'doi' && this.tier >= 3) {
      this.healCd = (this.healCd || 3) - dt;
      if (this.healCd <= 0) {
        this.healCd = 3;
        for (var j = 0; j < ctx.pets.length; j++) {
          var p = ctx.pets[j];
          if (p.hp < p.hpMax) { p.hp = Math.min(p.hpMax, p.hp + 8); }
        }
        ctx.fx.ring(this.x, this.y, 4, 40, '#7dff9a', 0.35);
      }
    }
  };

  Pet.prototype.draw = function (ctx) {
    if (!this.visible) return;
    if (this.beam) {
      ctx.save();
      ctx.strokeStyle = this.beam.col;
      ctx.globalAlpha = this.beam.t / 0.1 * 0.5;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y - 6);
      ctx.lineTo(this.beam.x, this.beam.y - 4);
      ctx.stroke();
      ctx.restore();
    }
    var key = this.frameKey();
    this.drawShadow(ctx);
    if (!key) return;
    var n = G.Atlas.count(key) || 1;
    var i = (this.animT * (this.anim === 'attack' ? 16 : 10)) | 0;
    if (this.anim === 'attack' && i >= n) { this.setAnim('idle'); i = 0; }
    // Viền sáng nhẹ để tách linh thú khỏi bầy quái — trên màn dọc mà không tách
    // thì người chơi không biết cái gì là của mình.
    // Nảy to một nhịp khi vừa ra đòn. Bản trước tô TRẮNG cả con, và trên màn
    // nhỏ thì một con vật trắng trơn không còn nhận ra là con gì nữa.
    var pop = this.attackFlash > 0 ? 1 + this.attackFlash * 0.7 : 1;
    G.Atlas.draw(ctx, key, i, this.x, this.y, {
      flip: this.face === 3, scale: (this.def.scale || 1) * pop,
      white: this.flash > 0
    });
    if (this.hp < this.hpMax) this.drawBar(ctx, 16, 20);
  };

  /* Vòng sáng dưới chân, màu theo VAI — nhìn một cái là biết con nào lo việc gì. */
  var ROLE_COL = {
    'Chặn': '#8ad8ff', 'Cận chiến': '#ff9a6a', 'Tầm xa': '#7ad8ff',
    'Nổ diện': '#ffb04a', 'Hồi máu': '#7dff9a', 'Tăng sức': '#ffd98a',
    'Đào hộ': '#c8b090', 'Soi sáng': '#fff0b0', 'Khống chế': '#d8e8ff',
    'Dây chuyền': '#9affd8'
  };
  Pet.prototype.drawRing = function (ctx) {
    if (!this.visible) return;
    var c = ROLE_COL[this.def.role] || '#fff';
    ctx.save();
    ctx.globalAlpha = 0.30;
    ctx.strokeStyle = c;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 1, this.r + 3, (this.r + 3) * 0.45, 0, 0, 6.2832);
    ctx.stroke();
    ctx.restore();
  };

  G.Pet = Pet;
  G.Projectile = Projectile;
  G.findNearest = nearest;
  G.findCrowd = crowdiest;
})(window.DC = window.DC || {});
