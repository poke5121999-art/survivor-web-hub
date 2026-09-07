/*
 * game.js — vòng lặp, camera, ánh sáng, và chỗ nối mọi thứ lại.
 *
 * CAMERA: phóng theo BỘI SỐ NGUYÊN. Ảnh điểm ảnh mà phóng 1,67 lần thì có điểm
 * ảnh to 2, có cái to 1 — nhìn lấm tấm rất khó chịu. Chọn bội số nguyên gần nhất
 * sao cho bề ngang lọt ~16 ô: đủ rõ để thấy mặt con quái, đủ rộng để không bị
 * đánh úp từ ngoài rìa.
 *
 * ÁNH SÁNG: nền tối phủ kín, rồi KHOÉT LỖ bằng destination-out ở chỗ có nguồn
 * sáng. Đây là chữ ký của Core Keeper, và cũng là lý do "đèn" đáng để làm một ô
 * trang bị riêng: trong hang tối, tầm nhìn chính là sức mạnh.
 */
(function (G) {
  'use strict';

  var T = 16;

  function Game() {}

  // ---------------------------------------------------------------- khởi động

  Game.prototype.boot = function () {
    var self = this;
    this.cv = document.getElementById('cv');
    this.c = this.cv.getContext('2d', { alpha: false });
    this.uiEl = document.getElementById('ui');
    this.fx = new G.Fx();
    this.hud = new G.Hud();
    this.dpr = 1;   // resize() tính lại theo màn hình thật
    this.state = 'boot';
    this.lastT = 0;
    this.slowmo = 0;

    this.lightCv = document.createElement('canvas');
    this.lightG = this.lightCv.getContext('2d');

    window.addEventListener('resize', function () { self.resize(); });
    this.resize();
    this.bindInput();

    G.Meta.load();

    var fill = document.getElementById('bootfill');
    var tip = document.getElementById('boottip');
    G.Atlas.load(function (err) {
      if (err) {
        tip.textContent = 'Lỗi tải art: ' + err.message;
        return;
      }
      var b = document.getElementById('boot');
      b.classList.add('gone');
      setTimeout(function () { b.style.display = 'none'; }, 500);
      G.Screens.init(self);
      G.Screens.home();
      self.state = 'menu';
      requestAnimationFrame(function (t) { self.frame(t); });
    }, function (k) {
      fill.style.width = (k * 100) + '%';
      if (k > 0.6) tip.textContent = 'đang thắp đèn…';
    });
  };

  Game.prototype.resize = function () {
    var app = document.getElementById('app');
    var r = app.getBoundingClientRect();
    /* Khung ảnh phải trùng ĐÚNG lưới điểm ảnh thật của màn hình.
     *
     * Bản trước chặn dpr ở 2. Điện thoại phổ thông có dpr 3, nên khung ảnh
     * 2x bị màn hình kéo lên 1,5 lần: một điểm ảnh của art thành một-rưỡi
     * điểm ảnh máy, hàng thì dày hàng thì mỏng, và cả bộ pixel art trông
     * nhoè hẳn đi. Lấy đúng dpr (trần 3) thì khung ảnh và màn hình là 1:1.
     *
     * Khổ CSS cũng phải ép tay bằng đúng pw/dpr. Để trình duyệt tự căn theo
     * `width:100%` thì ô CSS lẻ vài phần mười điểm ảnh so với khung ảnh, và
     * chỉ chừng đó cũng đủ làm nhoè. */
    this.dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    var pw = Math.floor(r.width * this.dpr);
    var ph = Math.floor(r.height * this.dpr);
    this.cv.width = pw;
    this.cv.height = ph;
    this.cv.style.width = (pw / this.dpr) + 'px';
    this.cv.style.height = (ph / this.dpr) + 'px';
    this.cssW = pw / this.dpr; this.cssH = ph / this.dpr;
    this.lightCv.width = this.cv.width;
    this.lightCv.height = this.cv.height;
    // ~16 ô lọt bề ngang
    this.scale = Math.max(2, Math.min(6, Math.round(this.cv.width / 256)));
    this.c.imageSmoothingEnabled = false;
    var cs = getComputedStyle(document.documentElement);
    this.safeTop = 0;
    this.safeBot = 0;
  };

  // ---------------------------------------------------------------- điều khiển

  Game.prototype.bindInput = function () {
    var self = this;
    this.input = {
      stick: { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0, R: 46 },
      keys: {}
    };
    var cv = this.cv;

    function pos(e) {
      var r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function down(id, p) {
      if (self.state !== 'play') return;
      // Nút GỌI và ô tiếp tế bắt trước; phần còn lại của màn hình là cần gạt.
      var rb = self.hud.rallyBox;
      if (rb && Math.hypot(p.x - rb.x, p.y - rb.y) < rb.r) { self.rally(); return; }
      var sb = self.hud.supplyBox;
      if (sb && sb.ready && Math.hypot(p.x - sb.x, p.y - sb.y) < sb.r) {
        self.callSupply(); return;
      }
      var s = self.input.stick;
      if (s.active) return;
      s.active = true; s.id = id; s.ox = p.x; s.oy = p.y; s.dx = 0; s.dy = 0;
    }
    function move(id, p) {
      var s = self.input.stick;
      if (!s.active || s.id !== id) return;
      var dx = p.x - s.ox, dy = p.y - s.oy;
      var d = Math.hypot(dx, dy);
      if (d > s.R) {
        // Cần gạt "trôi": kéo quá vành thì tâm chạy theo, ngón không bị hụt.
        s.ox += dx * (1 - s.R / d);
        s.oy += dy * (1 - s.R / d);
        dx = dx * s.R / d; dy = dy * s.R / d;
        d = s.R;
      }
      s.dx = dx / s.R; s.dy = dy / s.R;
    }
    function up(id) {
      var s = self.input.stick;
      if (s.id === id) { s.active = false; s.id = null; s.dx = 0; s.dy = 0; }
    }

    cv.addEventListener('touchstart', function (e) {
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        down(t.identifier, pos(t));
      }
    }, { passive: false });
    cv.addEventListener('touchmove', function (e) {
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        move(t.identifier, pos(t));
      }
    }, { passive: false });
    function endT(e) {
      for (var i = 0; i < e.changedTouches.length; i++) up(e.changedTouches[i].identifier);
    }
    cv.addEventListener('touchend', endT);
    cv.addEventListener('touchcancel', endT);

    cv.addEventListener('mousedown', function (e) { down('m', pos(e)); });
    window.addEventListener('mousemove', function (e) { move('m', pos(e)); });
    window.addEventListener('mouseup', function () { up('m'); });

    // Bàn phím để thử trên máy tính. Không phải cách chơi chính.
    window.addEventListener('keydown', function (e) {
      self.input.keys[e.key.toLowerCase()] = true;
      if (e.key === ' ' && self.state === 'play') { e.preventDefault(); self.rally(); }
    });
    window.addEventListener('keyup', function (e) { self.input.keys[e.key.toLowerCase()] = false; });
  };

  Game.prototype.readDir = function () {
    var s = this.input.stick, k = this.input.keys;
    var x = s.active ? s.dx : 0, y = s.active ? s.dy : 0;
    if (k['a'] || k['arrowleft']) x -= 1;
    if (k['d'] || k['arrowright']) x += 1;
    if (k['w'] || k['arrowup']) y -= 1;
    if (k['s'] || k['arrowdown']) y += 1;
    var m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x: x, y: y };
  };

  // ---------------------------------------------------------------- vào ván

  Game.prototype.startRun = function (biomeId, level) {
    var st = G.Meta.stats();
    var save = G.Meta.s;
    var seed = (Date.now() ^ (level * 7919)) >>> 0;
    this.rng = new G.Rng(seed);

    this.world = new G.World().init(94, 126, biomeId, seed);
    this.world.generate(level);

    var start = this.world.rooms[0];
    var f = this.world.nearestFloor(start.x, start.y);
    this.player = new G.Player().init(f.x * T + 8, f.y * T + 8, st, save.look);
    var self = this;
    this.player.onOreBroken = function (ore) { self.mission.onOre(ore); };
    this.exit = { x: this.player.x, y: this.player.y };   // khoang hạ đúng chỗ vào

    this.level = level;
    this.biomeId = biomeId;
    this.enemies = [];
    this.pets = [];
    this.projs = [];
    this.zaps = [];
    this.drops = [];
    this.boss = null;
    this.escaping = false;
    this.fx.clear();
    this.hud.banners.length = 0;

    this.run = {
      st: st,
      pets: [],
      // Bể linh thú TRONG VÁN gồm CẢ MƯỜI con, không chỉ mấy con đã sở hữu.
      // Con đã sở hữu vào trận ở đúng bậc đã nâng; con chưa sở hữu vẫn gọi được
      // nhưng chỉ ở bậc 1. Lý do: nếu bể chỉ có mấy con đang sở hữu thì người
      // chơi mới có đúng hai con, và hệ thẻ "lên cấp chọn 1 trong 3" không còn
      // gì để mời — mỗi ván y hệt ván trước. Gacha vì thế không phải cái mở
      // khoá VIỆC CHƠI, nó chỉ quyết định con nào vào trận MẠNH SẴN.
      petPool: (function () {
        var own = save.team.filter(function (id) {
          return save.pets[id] && save.pets[id].own;
        });
        var rest = G.PETS.map(function (p) { return p.id; })
          .filter(function (id) { return own.indexOf(id) < 0; });
        return own.concat(rest);
      })(),
      taken: {},
      rallyCd: 0, rallyBoost: 0,
      sacBonus: 1,
      kills: 0, dugTiles: 0,
      auraAtk: 0, auraDr: 0, auraSpd: 0, petLight: 0, shred: 0
    };
    if (!this.run.petPool.length) this.run.petPool = ['rua', 'cho'];

    // HAI con đầu ra trận ngay, phần còn lại phải "gọi" bằng thẻ lên cấp.
    // Vì sao hai chứ không phải một: đo trong máy, vào ván với đúng một con thì
    // sát thương quá thấp để dọn kịp lứa quái đầu, người chơi chết trước khi
    // lên nổi cấp 2 — tức là vòng tiến bộ không bao giờ khởi động. Hai con là
    // ngưỡng thấp nhất mà ván tự đứng được.
    this.run.petPool.slice(0, 2).forEach(function (id) {
      this.addPet(id, save.pets[id] ? save.pets[id].tier : 1);
    }, this);

    this.mission = new G.Mission().init(this, G.pickMission(this.rng, level), level, this.rng);
    this._dir = new G.Director().init(this, level, this.rng);

    this.cam = { x: this.player.x, y: this.player.y, scale: this.scale };
    this.state = 'play';
    this.hud.setNote(this.mission.type.hint);
    this.hud.banner(this.mission.type.name, '#ffd24a', 2.6);
    G.Screens.hideAll();
  };

  Game.prototype.addPet = function (id, tier) {
    var def = G.PET[id];
    if (!def) return null;
    var p = new G.Pet().init(def, tier || 1, this.player, this.pets.length);
    p.hpMax *= this.run.st.petHp;
    p.hp = p.hpMax;
    p.visible = this.pets.length < G.PET_VISIBLE_MAX;
    this.pets.push(p);
    this.run.pets.push({ id: id, tier: tier || 1 });
    return p;
  };

  // ---------------------------------------------------------------- móc nối

  Game.prototype.spawn = function (key, x, y) {
    if (this.enemies.length > 40) return null;
    var m = Math.min(1, this._dir.t / G.RUN_TIME);
    var e = new G.Enemy().init(key, x, y, this.level, m);
    this.enemies.push(e);
    return e;
  };
  Game.prototype.spawnAt = function (key, x, y) { return this.spawn(key, x, y); };

  Game.prototype.spawnMini = function (x, y) {
    var m = new G.MiniBoss().init(x, y, this.level);
    this.enemies.push(m);
    return m;
  };

  Game.prototype.spawnBoss = function (kind, x, y) {
    var b = new G.Boss().init(kind, x, y, this.level, this);
    this.boss = b;
    this.enemies.push(b);
    return b;
  };

  Game.prototype.hitEnemy = function (e, dmg, sx, sy, kb) {
    if (e.dead) return;
    var arm = e.armorAt ? e.armorAt(sx, sy) : 0;
    arm = Math.max(-1, arm - (this.run.shred || 0));
    var d = Math.max(1, dmg * (1 - arm));
    e.hurt(d, sx, sy, kb);
    if (arm > 0.45) {
      // Chạm giáp: kêu "keng" bằng hình. Không nói ra thì người chơi tưởng
      // linh thú hỏng chứ không biết là phải đánh vòng ra sau.
      this.fx.text(e.x, e.y - 22, 'GIÁP', '#8a9aa8');
      this.fx.part(e.x, e.y - 8, { col: '#cfd8e8', r: 2, life: 0.25, g: 0, prio: 1 });
    }
    if (e.dead) this.onKill(e);
  };

  Game.prototype.onKill = function (e) {
    this.run.kills++;
    if (e.onDeath) e.onDeath(this.ctx());
    // Quái KHÔNG rơi viên kinh nghiệm để nhặt. Kinh nghiệm cộng thẳng, và phần
    // lớn kinh nghiệm đến từ ĐÀO chứ không từ giết — nhờ thế cây cuốc không bao
    // giờ là việc phụ, và người chơi không phải hút sạch sàn sau mỗi đợt.
    if (!e.noXp) this.giveXp((e.xp || 3) * this.run.st.xpMul);
    if (e.isBoss) {
      this.fx.screenFlash('#fff', 0.7);
      this.fx.hit(3);
      this.slowmo = 0.9;
      this.banner('HẠ ĐƯỢC CHỦ HANG', '#ffd24a', 3);
    }
    if (e.isMini) this.banner('HẠ MINI-BOSS', '#7dff9a', 2);
  };

  Game.prototype.giveXp = function (n) {
    var ups = this.player.gainXp(n);
    if (ups > 0) this.queueLevelUp(ups);
  };

  Game.prototype.hurtPlayer = function (dmg, sx, sy, kb) {
    var d = dmg * (1 - (this.run.auraDr || 0));
    var got = this.player.hurt(d, sx, sy, kb);
    if (got > 0) {
      this.hud.dmgFlash = 1;
      this.fx.hit(got >= 18 ? 3 : got >= 9 ? 2 : 1);
      this.fx.text(this.player.x, this.player.y - 30, '-' + got, '#ff5a5a');
    }
    if (this.player.dead) {
      if (this.run.st.revive > 0) {
        this.run.st.revive--;
        this.player.dead = false;
        this.player.hp = this.run.st.hp * 0.5;
        this.player.invuln = 2.2;
        this.fx.screenFlash('#ffd98a', 0.8);
        this.banner('ĐÈN DỰ PHÒNG BẬT', '#ffd98a', 2.4);
      } else {
        this.endRun(false, 'Đèn tắt. Không ai tìm thấy bạn.');
      }
    }
  };

  Game.prototype.banner = function (t, c, d) { this.hud.banner(t, c, d); };
  Game.prototype.note = function (t) { this.hud.setNote(t); };
  Game.prototype.alarm = function () { this.hud.alarm(); };
  Game.prototype.lightRadius = function () {
    return Math.max(this.player.lightR, this.run.petLight || 0);
  };

  Game.prototype.rally = function () {
    if (this.run.rallyCd > 0) return;
    this.run.rallyCd = this.run.st.rallyCd;
    this.run.rallyBoost = 2;
    var p = this.player;
    for (var i = 0; i < this.pets.length; i++) {
      var q = this.pets[i];
      q.x = p.x + (Math.random() - 0.5) * 22;
      q.y = p.y + (Math.random() - 0.5) * 22;
      q.hp = Math.min(q.hpMax, q.hp + q.hpMax * 0.25);
      q.stuck = 0;
    }
    this.fx.ring(p.x, p.y, 6, 96, '#ffd98a', 0.5);
    this.fx.burst(p.x, p.y, 14, { col: '#ffd98a', spd: 130, life: 0.5, r: 2, prio: 2, glow: true });
    this.banner('GỌI!', '#ffd98a', 1.1);
  };

  Game.prototype.callSupply = function () {
    var p = this.player;
    if ((p.carry.nitra || 0) < G.SUPPLY_COST) return;
    p.carry.nitra -= G.SUPPLY_COST;
    p.hp = Math.min(this.run.st.hp, p.hp + this.run.st.hp * 0.5);
    for (var i = 0; i < this.pets.length; i++) this.pets[i].hp = this.pets[i].hpMax;
    this.run.rallyCd = 0;
    this.fx.ring(p.x, p.y, 8, 80, '#7dff9a', 0.6);
    this.fx.screenFlash('#7dff9a', 0.3);
    this.banner('TIẾP TẾ — HỒI 50% MÁU', '#7dff9a', 2);
    this._dir.supplyUsed++;
  };

  Game.prototype.startEscape = function () {
    this.escaping = true;
    // Chạy thoát thì chạy nhanh hơn 25%. Vừa là cảm giác (adrenaline), vừa là
    // lời giải cho quãng đường: đoạn cuối phải căng vì QUÁI, không phải vì
    // bản đồ dài.
    this.run.st.speed *= 1.25;
    this.fx.screenFlash('#ffd24a', 0.5);
  };

  Game.prototype.endRun = function (won, why) {
    if (this.state !== 'play') return;
    this.state = 'over';
    var res = {
      won: won, why: why,
      carry: this.player.carry,
      kills: this.run.kills,
      level: this.level,
      biome: this.biomeId,
      // Chỉ những con THẬT SỰ RA TRẬN mới được mảnh, không phải cả bể. Bể trong
      // ván gồm cả mười con (để hệ thẻ có gì mà mời), nên lấy nhầm bể là phát
      // mảnh cho cả dàn — mất sạch ý nghĩa của việc chọn đội hình.
      team: this.run.pets.map(function (p) { return p.id; })
    };
    var reward = G.Meta.finishRun(res);
    G.Screens.results(res, reward);
  };

  Game.prototype.ctx = function () {
    return {
      world: this.world, player: this.player, enemies: this.enemies,
      pets: this.pets, projs: this.projs, zaps: this.zaps, fx: this.fx,
      run: this.run, dt: this._dt,
      hitEnemy: this.hitEnemy.bind(this),
      hurtPlayer: this.hurtPlayer.bind(this),
      spawnAt: this.spawnAt.bind(this),
      banner: this.banner.bind(this),
      onPetDig: this.onPetDig.bind(this)
    };
  };

  Game.prototype.onPetDig = function (res, pet) {
    if (!res.ore) return;
    var o = G.ORE[res.ore];
    this.player.addOre(res.ore, 1);
    this.giveXp(o.xp * this.run.st.xpMul);
    this.mission.onOre(res.ore);
    this.fx.text(res.x * T + 8, res.y * T, '+' + o.name, o.col);
  };

  // ---------------------------------------------------------------- lên cấp

  Game.prototype.queueLevelUp = function (n) {
    this.pendingLevels = (this.pendingLevels || 0) + n;
    if (this.state === 'play') this.openLevelUp();
  };

  Game.prototype.openLevelUp = function () {
    if (!this.pendingLevels) return;
    this.pendingLevels--;
    this.state = 'levelup';
    var cards = G.rollPerks(this.run, this.rng);
    this.lastCards = cards;
    var self = this;
    G.Screens.levelUp(cards, function (card) {
      self.applyCard(card);
      self.state = 'play';
      if (self.pendingLevels > 0) setTimeout(function () { self.openLevelUp(); }, 120);
    });
  };

  Game.prototype.applyCard = function (card) {
    var save = G.Meta.s;
    if (card.kind === 'summon') {
      var tier = (save.pets[card.id] && save.pets[card.id].own)
        ? save.pets[card.id].tier : 1;
      var p = this.addPet(card.id, tier);
      if (p) {
        this.fx.ring(p.x, p.y, 4, 40, '#ffd98a', 0.5);
        this.banner('TRIỆU: ' + card.name, '#ffd98a', 2);
      }
    } else if (card.kind === 'tier') {
      for (var i = 0; i < this.pets.length; i++) {
        if (this.pets[i].def.id === card.id) {
          var q = this.pets[i];
          q.tier = Math.min(5, q.tier + 1);
          q.st = G.petStats(q.def, q.tier);
          var ratio = q.hp / q.hpMax;
          q.hpMax = q.def.hp * G.PET_TIER[q.tier - 1].hp * this.run.st.petHp;
          q.hp = q.hpMax * Math.min(1, ratio + 0.25);
          this.fx.ring(q.x, q.y, 3, 26, '#7dff9a', 0.4);
        }
      }
      for (var j = 0; j < this.run.pets.length; j++) {
        if (this.run.pets[j].id === card.id) {
          this.run.pets[j].tier = Math.min(5, this.run.pets[j].tier + 1);
        }
      }
    } else if (card.kind === 'self') {
      var d = G.PERK_SELF_BY[card.id];
      if (d) { d.apply(this.run.st, this.player); this.run.taken[card.id] = true; }
      if (card.id === 'hp' || card.id === 'heal') {
        this.player.hp = Math.min(this.run.st.hp, this.player.hp);
      }
    } else if (card.kind === 'sacrifice') {
      for (var k = this.pets.length - 1; k >= 0; k--) {
        if (this.pets[k].def.id === card.id) {
          this.fx.burst(this.pets[k].x, this.pets[k].y, 18,
            { col: '#ff5a5a', spd: 150, life: 0.6, r: 2.5, prio: 2 });
          this.pets.splice(k, 1);
        }
      }
      this.run.pets = this.run.pets.filter(function (p) { return p.id !== card.id; });
      this.run.sacBonus = (this.run.sacBonus || 1) * 1.35;
      this.banner('HY SINH — CẢ BẦY MẠNH LÊN', '#ff8a5a', 2.4);
    }
    // sắp lại ô hiện hình
    for (var m = 0; m < this.pets.length; m++) {
      this.pets[m].slot = m;
      this.pets[m].visible = m < G.PET_VISIBLE_MAX;
    }
  };

  // ---------------------------------------------------------------- vòng lặp

  Game.prototype.frame = function (t) {
    var self = this;
    var dt = Math.min(0.05, (t - this.lastT) / 1000 || 0.016);
    this.lastT = t;
    if (this.state === 'play') {
      if (this.slowmo > 0) { this.slowmo -= dt; dt *= 0.35; }
      this.update(dt);
    } else if (this.state === 'levelup' || this.state === 'over') {
      this.fx.update(dt * 0.25);
    }
    if (this.world) this.draw();
    requestAnimationFrame(function (n) { self.frame(n); });
  };

  Game.prototype.update = function (dt) {
    this._dt = dt;
    var ctx = this.ctx();
    var i;

    this.run.auraAtk = 0; this.run.auraDr = 0; this.run.auraSpd = 0;
    this.run.petLight = 0; this.run.shred = 0;
    if (this.run.rallyCd > 0) this.run.rallyCd -= dt;
    if (this.run.rallyBoost > 0) this.run.rallyBoost -= dt;

    var d = this.readDir();
    this.player.update(dt, this.world, d, this.fx);
    if (this.player.pendingXp) { this.giveXp(this.player.pendingXp); this.player.pendingXp = 0; }
    if (this.player.moving) this.player.speedBoost = this.run.auraSpd;
    this.world.reveal(this.player.tileX(), this.player.tileY(),
                      Math.round(this.lightRadius() / T) + 2);

    for (i = 0; i < this.pets.length; i++) this.pets[i].update(dt, ctx);
    for (i = this.enemies.length - 1; i >= 0; i--) {
      var e = this.enemies[i];
      e.update(dt, ctx);
      if (e.dead) {
        if (e === this.boss) { /* giữ tham chiếu để đạo diễn biết */ }
        this.enemies.splice(i, 1);
      }
    }
    for (i = this.projs.length - 1; i >= 0; i--) {
      this.projs[i].update(dt, ctx);
      if (this.projs[i].dead) this.projs.splice(i, 1);
    }
    for (i = this.zaps.length - 1; i >= 0; i--) {
      this.zaps[i].t -= dt;
      if (this.zaps[i].t <= 0) this.zaps.splice(i, 1);
    }
    // linh thú chết -> biến mất, gọi lại bằng nút GỌI thì không, phải chờ hồi sinh
    for (i = this.pets.length - 1; i >= 0; i--) {
      var q = this.pets[i];
      if (q.dead) {
        q.reviveT = (q.reviveT || 8);
        q.reviveT -= dt;
        q.visible = false;
        if (q.reviveT <= 0) {
          q.dead = false; q.hp = q.hpMax * 0.6; q.reviveT = 0;
          q.x = this.player.x; q.y = this.player.y;
          q.visible = i < G.PET_VISIBLE_MAX;
          this.fx.ring(q.x, q.y, 3, 26, '#9ad8ff', 0.4);
        }
      }
    }
    // mảnh quặng rơi -> hút về
    for (i = this.drops.length - 1; i >= 0; i--) {
      var dp = this.drops[i];
      var dd = Math.hypot(this.player.x - dp.x, this.player.y - dp.y);
      if (dd < this.run.st.pickR) {
        dp.x += (this.player.x - dp.x) * Math.min(1, dt * 7);
        dp.y += (this.player.y - dp.y) * Math.min(1, dt * 7);
      }
      if (dd < 8) { this.drops.splice(i, 1); }
    }

    this.mission.update(dt, ctx);
    this._dir.update(dt);
    this.fx.update(dt);
    this.hud.update(dt);
    this.checkExit();
    this.updateCam(dt);
  };

  Game.prototype.checkExit = function () {
    if (!this.escaping) return;
    if (Math.hypot(this.player.x - this.exit.x, this.player.y - this.exit.y) < 26) {
      this.endRun(true, 'Lên khoang kịp.');
    }
  };

  Game.prototype.updateCam = function (dt) {
    var p = this.player;
    // Nhìn trước theo hướng đi: màn dọc rất dễ bị "quái từ mép màn hình nhảy ra",
    // đẩy camera về phía đang đi cho người chơi thấy trước.
    var d = this.readDir();
    var tx = p.x + d.x * 22, ty = p.y + d.y * 30;
    var k = 1 - Math.pow(0.001, dt);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
    var halfW = this.cv.width / 2 / this.scale, halfH = this.cv.height / 2 / this.scale;
    this.cam.x = Math.max(halfW, Math.min(this.world.W * T - halfW, this.cam.x));
    this.cam.y = Math.max(halfH, Math.min(this.world.H * T - halfH, this.cam.y));
    this.cam.scale = this.scale;
  };

  // ---------------------------------------------------------------- vẽ

  Game.prototype.draw = function () {
    var c = this.c, W = this.cv.width, H = this.cv.height, S = this.scale;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = this.world.bio.fog;
    c.fillRect(0, 0, W, H);
    c.imageSmoothingEnabled = false;

    var shx = 0, shy = 0;
    if (this.fx.shake > 0) {
      shx = (Math.random() - 0.5) * this.fx.shake * S;
      shy = (Math.random() - 0.5) * this.fx.shake * S;
    }
    /* LÀM TRÒN gốc toạ độ về số nguyên điểm ảnh máy.
     *
     * Máy quay chạy mượt nên cam.x là số lẻ; nhân với S rồi đưa thẳng vào
     * setTransform thì mọi sprite rơi vào giữa hai điểm ảnh, trình duyệt phải
     * nội suy lại, và toàn bộ art nhìn mờ và rung nhẹ khi đi. Chốt về số
     * nguyên là cách duy nhất để pixel art sắc. Máy quay vẫn mượt như cũ —
     * chỉ là nó dừng ở nấc nguyên thay vì nấc lẻ. */
    var ox = Math.round(-this.cam.x * S + W / 2 + shx);
    var oy = Math.round(-this.cam.y * S + H / 2 + shy);
    this.camOx = ox; this.camOy = oy;
    c.setTransform(S, 0, 0, S, ox, oy);

    this.world.draw(c, this.cam, W, H);
    this.player.drawMineMark(c, this.world);
    // Cua thoat la mot vet tren SAN, nen phai ve truoc dien vien -- ve sau thi
    // no dan de len nguoi choi dung o day dau van.
    this.drawExit(c);
    this.drawObjectives(c);
    this.fx.draw(c);

    // sắp theo trục Y để cái ở dưới che cái ở trên — bắt buộc với góc nhìn này
    var list = [this.player];
    var i;
    for (i = 0; i < this.pets.length; i++) if (!this.pets[i].dead) list.push(this.pets[i]);
    for (i = 0; i < this.enemies.length; i++) list.push(this.enemies[i]);
    list.sort(function (a, b) { return a.y - b.y; });
    for (i = 0; i < this.pets.length; i++) this.pets[i].drawRing(c);
    for (i = 0; i < list.length; i++) list[i].draw(c);

    for (i = 0; i < this.projs.length; i++) this.projs[i].draw(c);
    for (i = 0; i < this.zaps.length; i++) {
      var z = this.zaps[i];
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.strokeStyle = z.col;
      c.globalAlpha = z.t / 0.16;
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(z.x0, z.y0); c.lineTo(z.x1, z.y1); c.stroke();
      c.restore();
    }
    this.fx.drawText(c);

    this.drawLight(c, W, H, S, ox, oy);

    // HUD vẽ ở đơn vị "điểm ảnh CSS" để cỡ chữ không đổi theo máy
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.fx.flash > 0) {
      c.fillStyle = this.fx.flashCol;
      c.globalAlpha = this.fx.flash;
      c.fillRect(0, 0, this.cssW, this.cssH);
      c.globalAlpha = 1;
    }
    if (this.state === 'play' || this.state === 'levelup') {
      this.hud.draw(c, this, this.cssW, this.cssH);
    }
  };

  Game.prototype.drawObjectives = function (c) {
    var m = this.mission;
    for (var i = 0; i < m.points.length; i++) {
      var pt = m.points[i];
      if (pt.done) continue;
      if (pt.kind === 'nest') {
        var pulse = 1 + Math.sin(pt.t * 3) * 0.08;
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = 0.35;
        c.fillStyle = '#ff8a2c';
        c.beginPath(); c.arc(pt.x, pt.y, 18 * pulse, 0, 6.2832); c.fill();
        c.restore();
        var k = G.Atlas.pick('boss.sheet.boss_hiveMother_tentacles');
        if (k) G.Atlas.draw(c, k, 0, pt.x, pt.y + 8, { scale: 0.32 });
        c.fillStyle = '#ffb04a';
        c.beginPath(); c.ellipse(pt.x, pt.y, 9, 11, 0, 0, 6.2832); c.fill();
        c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 1.5; c.stroke();
        G.hudBar(c, pt.x - 12, pt.y - 20, 24, 3, pt.hp / pt.max, '#ff8a2c', '#a03a10');
      } else {
        // trụ khoan: vòng sáng = vùng phải đứng trong
        c.save();
        c.strokeStyle = pt.prog > 0 ? '#7dff9a' : '#8a7ab0';
        c.globalAlpha = 0.5;
        c.lineWidth = 2;
        c.beginPath(); c.arc(pt.x, pt.y, 46, 0, 6.2832); c.stroke();
        c.restore();
        var kk = G.Atlas.pick('items');
        if (kk) G.Atlas.draw(c, kk, 279, pt.x, pt.y + 6, { scale: 1.4 });
        G.hudBar(c, pt.x - 14, pt.y - 22, 28, 4, pt.prog / pt.need, '#7dff9a', '#2a8a4a');
      }
    }
  };

  Game.prototype.drawExit = function (c) {
    var e = this.exit;
    var on = this.escaping;
    c.save();
    if (on) {
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.30 + 0.2 * Math.sin(performance.now() / 180);
      c.fillStyle = '#7dff9a';
      c.beginPath(); c.arc(e.x, e.y, 40, 0, 6.2832); c.fill();
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
    }
    c.globalAlpha = on ? 1 : 0.55;
    var k = G.Atlas.pick('misc.coreBase');
    if (k) G.Atlas.draw(c, k, 0, e.x, e.y + 10, { scale: 0.55 });
    c.strokeStyle = on ? '#7dff9a' : '#5a6a5a';
    c.lineWidth = 2;
    c.beginPath(); c.ellipse(e.x, e.y + 2, 22, 11, 0, 0, 6.2832); c.stroke();
    c.restore();
  };

  /* Ánh sáng: một lớp tối phủ kín rồi khoét lỗ. Vẽ ở toạ độ MÀN HÌNH (không
   * theo camera) để gradient không bị kéo méo khi phóng. */
  Game.prototype.drawLight = function (c, W, H, S, ox, oy) {
    var lg = this.lightG, bio = this.world.bio;
    var self = this;
    lg.setTransform(1, 0, 0, 1, 0, 0);
    lg.clearRect(0, 0, W, H);
    lg.globalCompositeOperation = 'source-over';
    lg.fillStyle = bio.fog;
    lg.globalAlpha = bio.dark;
    lg.fillRect(0, 0, W, H);
    lg.globalAlpha = 1;
    lg.globalCompositeOperation = 'destination-out';

    function hole(wx, wy, r, soft) {
      // Dùng đúng gốc toạ độ đã chốt của lượt vẽ này, nếu không lỗ sáng lệch
      // khỏi ngọn đuốc đúng một điểm ảnh và viền tối trông như bị bóc.
      var sx = wx * S + ox;
      var sy = wy * S + oy;
      var R = r * S;
      if (sx < -R || sy < -R || sx > W + R || sy > H + R) return;
      var g = lg.createRadialGradient(sx, sy, R * (soft === undefined ? 0.22 : soft), sx, sy, R);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(0.62, 'rgba(0,0,0,.72)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      lg.fillStyle = g;
      lg.beginPath(); lg.arc(sx, sy, R, 0, 6.2832); lg.fill();
    }

    hole(this.player.x, this.player.y, this.player.lightR);
    if (this.run.petLight) {
      for (var i = 0; i < this.pets.length; i++) {
        if (this.pets[i].def.light && !this.pets[i].dead) {
          hole(this.pets[i].x, this.pets[i].y, this.pets[i].def.light * 0.75);
        }
      }
    }
    // quặng tự phát sáng nhẹ trong tầm: chính là thứ dẫn người chơi đi tiếp
    var w = this.world;
    var ptx = this.player.tileX(), pty = this.player.tileY();
    var tx0 = ((this.cam.x - W / 2 / S) / T) | 0, tx1 = ((this.cam.x + W / 2 / S) / T) | 0;
    var ty0 = ((this.cam.y - H / 2 / S) / T) | 0, ty1 = ((this.cam.y + H / 2 / S) / T) | 0;
    for (var ty = ty0; ty <= ty1; ty++) {
      for (var tx = tx0; tx <= tx1; tx++) {
        if (!w.inside(tx, ty)) continue;
        var id = w.idx(tx, ty);
        if (w.kind[id] === G.TK.ORE) {
          // chỉ quặng trong ~7 ô mới hắt sáng; xa hơn thì để tối, nếu không
          // cả hang sáng trưng và bóng tối — thứ làm nên cảm giác Core Keeper —
          // biến mất sạch
          var dd = (tx - ptx) * (tx - ptx) + (ty - pty) * (ty - pty);
          if (dd < 56) hole(tx * T + 8, ty * T + 8, 10, 0.05);
        }
        else if (w.kind[id] === G.TK.LIQ && w.ore[id] === 254) hole(tx * T + 8, ty * T + 8, 22, 0.05);
      }
    }
    if (this.escaping) hole(this.exit.x, this.exit.y, 70, 0.1);
    if (this.boss && !this.boss.dead) hole(this.boss.x, this.boss.y, 46, 0.1);

    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(this.lightCv, 0, 0);

    // quầng ấm trên nguồn sáng — chi tiết nhỏ nhưng nó là cả cái "cảm giác hang"
    c.globalCompositeOperation = 'lighter';
    var px = this.player.x * S + ox;
    var py = this.player.y * S + oy;
    var gg = c.createRadialGradient(px, py, 0, px, py, this.player.lightR * S * 0.8);
    gg.addColorStop(0, bio.glow + '30');
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gg;
    c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'source-over';
  };

  // ---------------------------------------------------------------- chạy

  var game = new Game();
  G.game = game;
  Object.defineProperty(game, 'dir', {
    get: function () { return this._dir; }
  });
  window.addEventListener('load', function () { game.boot(); });
})(window.DC = window.DC || {});
