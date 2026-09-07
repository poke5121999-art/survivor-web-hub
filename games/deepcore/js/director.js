/*
 * director.js — đạo diễn ván đấu: rải quái, chấm nhiệm vụ, dựng đoạn kết.
 *
 * Rải quái theo NGÂN SÁCH ĐIỂM, đúng cách Deep Rock Galactic làm: mỗi loại quái
 * có một giá (`dp`), mỗi đợt có một túi điểm, đạo diễn tiêu hết túi thì thôi.
 * Ưu điểm là chỉnh độ khó chỉ phải sửa một con số, và trộn quái ra tự nhiên.
 *
 * NHỊP mới là thứ quan trọng nhất, không phải số lượng. DRG để 350-500 giây
 * giữa hai đợt ở Hiểm 1 — tức là phần lớn thời gian KHÔNG có gì xảy ra, và
 * chính khoảng lặng đó làm đợt sau đáng sợ. Ván này nén còn 600 giây nên khoảng
 * lặng còn ~40-60 giây, cộng bốn "hố thở" đặt tay ở phút 2, 4, 8 và lúc gọi
 * khoang thoát.
 *
 * Quái luôn ra NGOÀI TẦM ĐÈN. Thấy nó hiện ra giữa màn hình thì không sợ, mà
 * bực.
 */
(function (G) {
  'use strict';

  var T = 16;

  function Director() {}

  Director.prototype.init = function (game, level, rng) {
    this.g = game;
    this.level = level;
    this.rng = rng;
    this.t = 0;
    this.beat = 0;
    this.trickle = 0.11;  // phút đầu cố ý thưa quái
    this.trickleAcc = 0;
    this.calmUntil = 0;
    this.warn = null;
    this.pending = [];          // đợt đã cảnh báo, chờ tới giờ thả
    this.phase = 'work';        // work -> boss -> escape -> done
    this.escapeT = 0;
    this.escapeAcc = 0;
    this.bossRef = null;
    this.supplyUsed = 0;
    return this;
  };

  // ---------------------------------------------------------------- chỗ thả

  /* Tìm ô sàn cách người chơi 150-280px và NGOÀI vùng đèn. Không tìm được thì
   * nới dần điều kiện chứ không bỏ cuộc — thà thả hơi gần còn hơn không có quái. */
  Director.prototype.spawnSpot = function (near, minD, maxD) {
    var w = this.g.world, p = near || this.g.player;
    var light = this.g.lightRadius();
    minD = minD || Math.max(light + 24, 150);
    maxD = maxD || 300;
    for (var relax = 0; relax < 3; relax++) {
      for (var i = 0; i < 40; i++) {
        var a = this.rng.f(0, 6.2832);
        var d = this.rng.f(minD, maxD);
        var x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
        var tx = (x / T) | 0, ty = (y / T) | 0;
        if (!w.inside(tx, ty)) continue;
        if (w.at(tx, ty) !== G.TK.FLOOR) continue;
        return { x: tx * T + 8, y: ty * T + 8 };
      }
      minD *= 0.72; maxD *= 1.35;
    }
    var f = w.nearestFloor(p.tileX() + this.rng.i(-8, 8), p.tileY() + this.rng.i(-8, 8));
    return { x: f.x * T + 8, y: f.y * T + 8 };
  };

  /* Tiêu một túi điểm thành quái. Trộn từ bể của quần thể; đợt to thì cho phép
   * một con tinh nhuệ chen vào. */
  Director.prototype.spend = function (dp, opts) {
    opts = opts || {};
    var bio = this.g.world.bio;
    var pool = bio.pool.slice();
    var g = this.g;
    var left = dp;
    var guard = 0;
    var spots = [];
    // Ba điểm thả như DRG, không phải rải đều 360° — quái ra thành CỤM mới đọc
    // được là "chúng đến từ hướng kia".
    var nSpot = opts.spread ? 4 : 3;
    for (var s = 0; s < nSpot; s++) spots.push(this.spawnSpot(opts.near));

    if (opts.elite && bio.elite.length) {
      var ek = this.rng.pick(bio.elite);
      var sp = spots[0];
      g.spawn(ek, sp.x, sp.y);
      left -= G.ENEMY[ek].dp;
    }
    while (left > 3 && guard++ < 90) {
      var k = this.rng.pick(pool);
      var def = G.ENEMY[k];
      if (!def || def.dp > left + 4) continue;
      var q = spots[guard % spots.length];
      g.spawn(k, q.x + this.rng.f(-14, 14), q.y + this.rng.f(-14, 14));
      left -= def.dp;
    }
  };

  // ---------------------------------------------------------------- vòng chạy

  Director.prototype.update = function (dt) {
    var g = this.g;
    this.t += dt;

    // đợt đã cảnh báo, tới giờ thì thả
    for (var i = this.pending.length - 1; i >= 0; i--) {
      var pd = this.pending[i];
      pd.t -= dt;
      if (pd.t <= 0) {
        this.spend(pd.dp, { spread: true });
        this.pending.splice(i, 1);
      }
    }

    if (this.phase === 'work') this.updateWork(dt);
    else if (this.phase === 'boss') this.updateBoss(dt);
    else if (this.phase === 'escape') this.updateEscape(dt);
  };

  Director.prototype.updateWork = function (dt) {
    var g = this.g;
    // mốc theo đồng hồ
    var B = G.MISSION_BEATS;
    while (this.beat < B.length && this.t >= B[this.beat].t) {
      this.fire(B[this.beat]);
      this.beat++;
    }
    // quái lẻ, đều đều, ngoài lúc "hố thở"
    if (this.t > this.calmUntil) {
      this.trickleAcc += dt * this.trickle;
      var cap = 16 + this.level * 2;
      while (this.trickleAcc >= 1 && g.enemies.length < cap) {
        this.trickleAcc -= 1;
        var sp = this.spawnSpot();
        var pool = g.world.bio.pool;
        g.spawn(this.rng.pick(pool), sp.x, sp.y);
      }
      if (this.trickleAcc > 3) this.trickleAcc = 3;
    }
    // nhiệm vụ xong -> chuyển pha
    if (g.mission.done && !g.mission.called) {
      g.mission.called = true;
      g.banner('ĐÃ GỌI KHOANG THOÁT', '#7dff9a');
      g.note('Khoang hạ xuống ĐÚNG CHỖ BẠN VÀO. Chạy về đó.');
      this.calmUntil = this.t + 6;           // hố thở thứ tư
      this.bossAt = this.t + G.MISSION_END.callDelay;
    }
    if (this.bossAt && this.t >= this.bossAt) this.startBoss();
    // hết giờ mà chưa xong -> vẫn cho thoát, nhưng không có thưởng nhiệm vụ
    if (this.t >= G.RUN_TIME - G.MISSION_END.escapeTime && !this.bossAt) {
      g.banner('HẾT GIỜ — CHẠY ĐI', '#ff7a4a');
      this.startEscape();
    }
  };

  /* Ải càng cao thì quái lẻ ra càng dày. Ải 1 giữ nguyên nhịp gốc. */
  Director.prototype.rate = function (r) {
    return r * (0.85 + this.level * 0.15);
  };

  Director.prototype.fire = function (b) {
    var g = this.g;
    if (b.k === 'note') { g.note(b.text); return; }
    if (b.k === 'trickle') { this.trickle = this.rate(b.rate); return; }
    if (b.k === 'calm') { this.calmUntil = this.t + b.time; return; }
    if (b.k === 'elite') {
      for (var i = 0; i < b.n; i++) {
        var sp = this.spawnSpot();
        g.spawn(this.rng.pick(g.world.bio.elite), sp.x, sp.y);
      }
      g.banner('TINH NHUỆ', '#b06aff');
      return;
    }
    if (b.k === 'swarm') {
      // Cảnh báo TRƯỚC 3,5 giây rồi mới thả — DRG báo trước 3,7 giây, và đó là
      // khoảng vừa đủ để đổi chỗ đứng chứ không đủ để chạy mất.
      g.banner(b.warn, '#ff7a4a', 2.6);
      g.alarm();
      this.pending.push({ dp: Math.round(b.dp * (1 + this.level * 0.12)), t: 3.5 });
      return;
    }
    if (b.k === 'mini') {
      g.banner(b.warn, '#ffd24a', 2.6);
      var s = this.spawnSpot(null, 170, 240);
      g.spawnMini(s.x, s.y);
      return;
    }
  };

  Director.prototype.startBoss = function () {
    var g = this.g;
    this.bossAt = 0;
    this.phase = 'boss';
    var s = this.spawnSpot(null, 120, 190);
    this.bossRef = g.spawnBoss(g.world.bio.boss, s.x, s.y);
    g.banner(G.MISSION_END.bossWarn, '#ff5a4a', 3);
    g.alarm();
  };

  Director.prototype.updateBoss = function (dt) {
    var g = this.g;
    // trong lúc đánh boss vẫn rỉ quái, nhưng thưa — nếu không thì boss lẻ loi
    this.trickleAcc += dt * 0.5;
    if (this.trickleAcc >= 1 && g.enemies.length < 20) {
      this.trickleAcc -= 1;
      var sp = this.spawnSpot();
      g.spawn(this.rng.pick(g.world.bio.pool), sp.x, sp.y);
    }
    if (this.bossRef && this.bossRef.dead) this.startEscape();
  };

  /* Pha chạy thoát. Luật của DRG: quái ra THEO ĐƯỜNG CHẠY, không phải quanh
   * người chơi — nghĩa là chúng CHẶN ĐẦU. Đó là cái làm đoạn chạy thoát căng
   * chứ không chỉ là đếm ngược. */
  Director.prototype.startEscape = function () {
    var g = this.g;
    this.phase = 'escape';
    this.escapeT = G.MISSION_END.escapeTime;
    g.startEscape();
    g.banner('KHOANG ĐANG CHỜ — CHẠY!', '#ffd24a', 3);
    g.alarm();
  };

  Director.prototype.updateEscape = function (dt) {
    var g = this.g;
    this.escapeT -= dt;
    if (this.escapeT <= 0) { g.endRun(false, 'Khoang bay mất. Bạn ở lại dưới đó.'); return; }
    this.escapeAcc += dt;
    if (this.escapeAcc >= G.MISSION_END.escapeEvery) {
      this.escapeAcc = 0;
      var ex = g.exit;
      // điểm giữa người chơi và cửa thoát, lệch ngẫu nhiên: chặn đầu
      var mid = {
        x: g.player.x + (ex.x - g.player.x) * this.rng.f(0.35, 0.8),
        y: g.player.y + (ex.y - g.player.y) * this.rng.f(0.35, 0.8)
      };
      this.spend(G.MISSION_END.escapeDp * (1 + this.level * 0.1),
                 { near: mid, spread: true });
    }
  };

  // ---------------------------------------------------------------- nhiệm vụ

  function Mission() {}

  Mission.prototype.init = function (game, type, level, rng) {
    this.g = game;
    this.type = type;
    this.need = type.amount(level);
    this.have = 0;
    this.done = false;
    this.called = false;
    this.points = [];        // ổ trứng / trụ khoan
    if (type.id === 'eggs') this.placeNests(rng);
    if (type.id === 'salvage') this.placePillars(rng);
    return this;
  };

  Mission.prototype.placeNests = function (rng) {
    var w = this.g.world;
    var rooms = w.rooms.filter(function (r) { return r.kind !== 'start'; });
    rng.shuffle(rooms);
    for (var i = 0; i < this.need && i < rooms.length; i++) {
      var r = rooms[i];
      var f = w.nearestFloor(r.x, r.y);
      this.points.push({ x: f.x * T + 8, y: f.y * T + 8, hp: 70, max: 70, done: false,
                         kind: 'nest', t: 0 });
    }
  };

  Mission.prototype.placePillars = function (rng) {
    var w = this.g.world;
    var rooms = w.rooms.filter(function (r) { return r.kind !== 'start'; });
    rng.shuffle(rooms);
    for (var i = 0; i < this.need && i < rooms.length; i++) {
      var r = rooms[i];
      var f = w.nearestFloor(r.x, r.y);
      this.points.push({ x: f.x * T + 8, y: f.y * T + 8, prog: 0, need: 9, done: false,
                         kind: 'pillar', t: 0 });
    }
  };

  Mission.prototype.onOre = function (name) {
    if (this.type.id !== 'mine' || this.done) return;
    if (name !== 'morkite') return;
    this.have++;
    this.check();
  };

  Mission.prototype.update = function (dt, ctx) {
    var p = ctx.player;
    for (var i = 0; i < this.points.length; i++) {
      var pt = this.points[i];
      pt.t += dt;
      if (pt.done) continue;
      if (pt.kind === 'nest') {
        // ổ trứng đẻ quái liên tục cho tới khi bị phá — sức ép để đi phá
        pt.spawnT = (pt.spawnT || 0) + dt;
        if (pt.spawnT > 6 && ctx.enemies.length < 30 &&
            Math.hypot(p.x - pt.x, p.y - pt.y) < 340) {
          pt.spawnT = 0;
          this.g.spawn('swarmer', pt.x + (Math.random() - .5) * 20, pt.y + (Math.random() - .5) * 20);
        }
      } else if (pt.kind === 'pillar') {
        if (Math.hypot(p.x - pt.x, p.y - pt.y) < 46) {
          pt.prog += dt;
          if (pt.prog >= pt.need) {
            pt.done = true; this.have++;
            this.g.banner('TRỤ ' + this.have + '/' + this.need + ' XONG', '#7dff9a');
            this.check();
          }
        } else if (pt.prog > 0) {
          pt.prog = Math.max(0, pt.prog - dt * 0.6);
        }
      }
    }
  };

  Mission.prototype.hitPoint = function (pt, dmg) {
    if (pt.kind !== 'nest' || pt.done) return;
    pt.hp -= dmg;
    if (pt.hp <= 0) {
      pt.done = true;
      this.have++;
      this.g.banner('PHÁ TỔ ' + this.have + '/' + this.need, '#7dff9a');
      this.check();
    }
  };

  Mission.prototype.check = function () {
    if (this.have >= this.need && !this.done) {
      this.done = true;
      this.g.banner('NHIỆM VỤ XONG', '#7dff9a', 2.6);
    }
  };

  Mission.prototype.label = function () {
    return this.type.short(this.need);
  };

  G.Director = Director;
  G.Mission = Mission;
})(window.DC = window.DC || {});
