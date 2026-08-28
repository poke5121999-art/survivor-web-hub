/* ==========================================================================
 * TRẬN ĐẤU — field (đi săn quái thường) và boss (Behemoth).
 * File này chỉ lo MỘT trận: sinh quái, đánh nhau, vẽ, và trả kết quả về ui.js.
 * Mọi thứ trên màn hình vẽ bằng code — không có một file ảnh nào.
 *
 * Ba thứ quyết định "feel" của bản gốc và được tái dựng ở đây:
 *   1. Punicon (js/punicon.js) — một ngón làm hết.
 *   2. Năm bộ move set khác hẳn nhau khi GIỮ, không phải năm bộ đổi con số.
 *   3. Vòng WEAK point -> thanh gục -> boss nằm ra 8 giây -> xả toàn bộ đòn mạnh.
 * ========================================================================== */
(function (G) {
  'use strict';

  var W = 540, H = 960;              // khung dọc 9:16, đúng tỉ lệ máy điện thoại
  var TAU = Math.PI * 2;

  function ang(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }

  /* ====================================================================== */
  function Battle(cv, save, opts, cb) {
    this.cv = cv; this.ctx = cv.getContext('2d');
    this.s = save; this.o = opts || {}; this.cb = cb || {};
    this.mode = this.o.mode || 'field';       // 'field' | 'boss'
    this.running = false;
    this.t = 0; this.last = 0;
    this.msgs = [];       // số sát thương bay lên
    this.fx = [];         // hiệu ứng
    this.chests = [];
    this.projs = [];
    this.telegraphs = [];
    this.shake = 0;
    this.paused = false;
    this.result = null;

    this.stats = G.buildStats(save);
    this.setupWorld();
    this.setupPlayer();
    this.setupPunicon();
  }

  /* --------------------------------------------------------------- THẾ GIỚI */
  Battle.prototype.setupWorld = function () {
    var area = G.areaById(this.o.areaId || this.s.area) || G.AREAS[0];
    this.area = area;
    this.map = area.maps[clamp(this.o.mapIdx || 0, 0, area.maps.length - 1)];
    this.bg = area.bg;
    if (this.mode === 'boss') {
      this.wW = 1150; this.wH = 1150;
    } else {
      this.wW = 1500; this.wH = 1900;
    }
    this.decor = [];
    var n = this.mode === 'boss' ? 26 : 60;
    for (var i = 0; i < n; i++) {
      this.decor.push({ x: Math.random() * this.wW, y: Math.random() * this.wH, r: 6 + Math.random() * 22, k: (Math.random() * 3) | 0 });
    }
    this.mobs = [];
    this.gathers = [];
    this.killed = 0;
    this.needKills = this.map.kills || 8;
    this.portalOpen = false;
    this.timeLeft = G.BAL.questMs;

    if (this.mode === 'field') {
      this.portal = { x: this.wW * 0.5, y: 90 };
      for (var g = 0; g < 4; g++) {
        this.gathers.push({ x: 120 + Math.random() * (this.wW - 240), y: 240 + Math.random() * (this.wH - 400), used: false });
      }
      this.spawnWave(10);
      // Xác suất gặp Sudden Behemoth (bản gốc: gặp ngẫu nhiên khi đang farm).
      this.suddenAt = 12000 + Math.random() * 26000;
      this.suddenDone = false;
    } else {
      this.spawnBehemoth(this.o.behemothId, this.o.level || this.map.lv);
    }
    this.allies = [];
    for (var a = 0; a < 3; a++) {
      this.allies.push({
        name: G.ALLY_NAMES[a], x: this.wW / 2 + (a - 1) * 60, y: this.wH * (this.mode === 'boss' ? 0.72 : 0.86) + 40,
        hp: this.stats.hp * 0.85, maxHp: this.stats.hp * 0.85, r: 13, facing: -Math.PI / 2,
        atkCd: 500 + a * 220, down: false, downT: 0, kind: ['sword', 'bow', 'spear'][a],
        dmg: this.stats.atk * 0.55, hitT: 0, dodgeT: 0
      });
    }
  };

  Battle.prototype.spawnWave = function (n) {
    var tribes = this.map.tribes || ['purun'];
    var lv = this.map.lv;
    for (var i = 0; i < n; i++) {
      var tribe = pick(tribes);
      var elite = Math.random() < 0.16;
      var gold = this.map.gold || (tribe === 'purun' && Math.random() < 0.05);
      this.mobs.push(this.makeMob(tribe, lv, elite, gold));
    }
  };

  Battle.prototype.makeMob = function (tribe, lv, elite, gold) {
    var T = G.TRIBES[tribe];
    var v = pick(G.MOB_VARIANTS);
    var hp = (32 + lv * 14) * T.hp * (elite ? 3.4 : 1) * (gold ? 2.2 : 1);
    var px, py, tries = 0;
    do {
      px = 70 + Math.random() * (this.wW - 140);
      py = 180 + Math.random() * (this.wH - 340);
      tries++;
    } while (this.player && dist({ x: px, y: py }, this.player) < 260 && tries < 20);
    return {
      tribe: tribe, T: T, el: v.el, elite: elite, gold: gold, lv: lv,
      name: (gold ? 'Gold ' : v.pre) + T.en + (elite ? 'ron' : ''),
      x: px, y: py, hp: hp, maxHp: hp, r: T.r * (elite ? 1.5 : 1) * (gold ? 1.3 : 1),
      atk: (7 + lv * 2.1) * T.atk * (elite ? 1.6 : 1),
      spd: T.spd * (elite ? 0.9 : 1), facing: 0,
      cd: 600 + Math.random() * 900, hitT: 0, flash: 0, status: {}, agro: 0
    };
  };

  Battle.prototype.spawnBehemoth = function (id, lv) {
    var b = G.behemothById(id) || G.BEHEMOTHS[0];
    lv = lv || 10;
    var scale = 0.55 + lv * 0.055;
    var self = this;
    // Bộ phận rải QUANH VIỀN thân, không chụm vào giữa — có vậy mới nhắm được bằng
    // cách đứng vào đúng phía, tức là mới có "vị trí" trong trận đánh.
    var names = (b.parts || []).slice();
    var wpNames = b.wp || [];
    // đưa điểm yếu ra phía TRƯỚC mặt boss (góc 0 = hướng boss đang quay)
    names.sort(function (x, y) { return (wpNames.indexOf(y) >= 0) - (wpNames.indexOf(x) >= 0); });
    var n = names.length;
    var parts = names.map(function (nm, i) {
      var isWp = wpNames.indexOf(nm) >= 0;
      var a = (i / n) * TAU;
      if (a > Math.PI) a -= TAU;
      return {
        n: nm, a: a, d: b.r * 0.82,
        hp: b.hp * scale * G.BAL.partHpFrac, maxHp: b.hp * scale * G.BAL.partHpFrac,
        broken: false, weak: isWp, r: Math.max(17, b.r * 0.28)
      };
    });
    if (!parts.some(function (p) { return p.weak; }) && parts.length) parts[0].weak = true;
    this.boss = {
      def: b, lv: lv, n: b.n, el: b.el, rank: b.rank,
      x: this.wW / 2, y: this.wH * 0.35,
      hp: b.hp * scale, maxHp: b.hp * scale, r: b.r,
      atk: b.atk * (0.6 + lv * 0.05), spd: b.spd,
      facing: Math.PI / 2, parts: parts,
      fatigue: 0, down: 0, stagger: 0,
      state: 'idle', stateT: 0, pattern: null, patIdx: 0,
      cd: 1400, flash: 0, status: {}, dot: [],
      partsBroken: 0, marks: []   // marks: điểm ngắm của cung Heat
    };
    // Điểm yếu chỉ lộ ra từng đợt — đây là nhịp chính của trận boss.
    this.boss.wpTimer = 4000;
    this.boss.wpOn = false;
  };

  /* ------------------------------------------------------------ NGƯỜI CHƠI */
  Battle.prototype.setupPlayer = function () {
    var st = this.stats;
    this.player = {
      x: this.wW / 2, y: this.wH * (this.mode === 'boss' ? 0.78 : 0.9),
      r: 13, facing: -Math.PI / 2,
      hp: st.hp, maxHp: st.hp,
      state: 'idle', stateT: 0, stateDur: 0, hitDone: false,
      combo: 0, comboT: 0,
      dodgeCd: 0, iframe: 0, iframeFromDodge: false, rollHit: false, counterUntil: 0,
      guardT: 0, guardBlocked: false, guardPerfect: false,
      charge: 0, aimX: 0, aimY: 0, aimD: 0,
      magi: 0, heat: 0, soul: 0,
      shield: 0, buffs: [],
      status: {}, dot: [],
      wIdx: 0, switchT: 0,
      revives: G.BAL.reviveCount, down: false, downT: 0,
      deaths: 0, usedMagi: false, partsBroken: 0
    };
    this.setWeapon(0, true);
  };

  Battle.prototype.setWeapon = function (i, instant) {
    var eq = G.equipped(this.s);
    var list = eq.weapons.filter(Boolean);
    if (!list.length) return;
    i = ((i % 3) + 3) % 3;
    var g = eq.weapons[i];
    if (!g) { // khe trống -> nhảy sang khe có đồ
      for (var k = 0; k < 3; k++) { if (eq.weapons[(i + k) % 3]) { i = (i + k) % 3; g = eq.weapons[i]; break; } }
    }
    if (!g) return;
    this.player.wIdx = i;
    this.wp = G.weaponProfile(this.s, g);
    this.W = G.WEAPONS[this.wp.wclass];
    // Dual Blades Heat: thanh Heat ĐẦY SẴN khi vào trận (đúng wiki).
    if (this.wp.wclass === 'dual' && this.wp.wtype === 'heat') this.player.heat = 100;
    // Đổi vũ khí giữa trận có độ trễ, đứng yên và hở sườn.
    if (!instant) { this.player.switchT = 420; this.player.state = 'switch'; this.player.stateT = 0; this.player.stateDur = 420; }
    if (this.puni) this.syncHotspots();
    if (this.cb.onWeapon) this.cb.onWeapon(this.wp, i);
  };

  /* ------------------------------------------------------------- PUNICON -- */
  Battle.prototype.setupPunicon = function () {
    var self = this, p = this.player;
    this.puni = new G.Punicon(this.cv, {}, {
      onTap: function () { self.tryAttack(); },
      onFlick: function (dx, dy) { self.tryDodge(dx, dy); },
      onHoldStart: function (dx, dy) { self.holdStart(dx, dy); },
      onHoldTick: function (ms, dx, dy) { self.holdTick(ms, dx, dy); },
      onHoldEnd: function (dx, dy, ms) { self.holdEnd(dx, dy, ms); },
      onSkillSlide: function (id) { self.holdCancel(); self.castMagi(id); },
      onCancel: function () { self.holdCancel(); }
    });
    // Toạ độ TÂM hai nút Magi trong hệ 540x960 — khớp với .magi-col trong index.html
    // (right:6px, top:270px, ô 74x74, cách nhau 14px). Punicon dùng chúng làm HƯỚNG
    // để nhận lệnh "giữ rồi trượt về nút", chứ ngón không cần chạm tới.
    this.puni.hotspots = [
      { id: 0, x: 540 - 6 - 37, y: 270 + 37 },
      { id: 1, x: 540 - 6 - 37, y: 270 + 74 + 14 + 37 }
    ];
    this.syncHotspots();
  };

  // Nút Magi trống thì tắt hướng trượt của nó đi, không thì trượt vào chỗ chết.
  Battle.prototype.syncHotspots = function () {
    for (var i = 0; i < 2; i++) {
      if (this.puni.hotspots[i]) this.puni.hotspots[i].off = !(this.wp && this.wp.magi[i]);
    }
  };

  Battle.prototype.busy = function () {
    var st = this.player.state;
    return st === 'attack' || st === 'dodge' || st === 'cleave' || st === 'lunge' ||
           st === 'ranbu' || st === 'lag' || st === 'switch' || st === 'cast' || st === 'hurt';
  };

  /* ---- CHẠM: đánh thường, bấm liên tục thì nối combo ---- */
  Battle.prototype.tryAttack = function () {
    var p = this.player;
    if (p.down || this.paused) return;

    // PHẢN ĐÒN sau khi né chuẩn. Ngữ pháp gốc của Punicon (wiki Shironeko, Fencer):
    // vẩy để né đúng lúc -> dấu "!!" hiện trên đầu -> CHẠM trong lúc dấu còn đó.
    // Đây là thứ biến "né" từ hành động phòng thủ thành cơ hội tấn công.
    if (p.counterUntil > this.t) { p.counterUntil = 0; this.doCounter(true); return; }

    // ĐÁNH KHI ĐANG LĂN (Rolling Attack). Nguyên văn: "Flick the screen and tap
    // while moving to attack." Không hủy cú lăn — đòn ra NGAY TRONG lúc lăn, nên
    // vẫn giữ nguyên khung bất tử.
    if (p.state === 'dodge' && !p.rollHit) { this.doRollingAttack(); return; }

    if (p.state === 'guard' || p.state === 'charge' || p.state === 'aim') { this.holdCancel(); }
    if (this.busy()) {
      // Bấm sớm trong lúc đang vung -> đệm vào cửa sổ nối combo (bản gốc cho spam).
      if (p.state === 'attack' && p.stateT > p.stateDur * 0.55) { p.queued = true; }
      // Đại Kiếm Heat: Pulverize — bấm đúng nhịp sau cú chém để nối đòn 2, 3.
      if (p.state === 'cleave' && this.wp.wtype === 'heat' && p.pulver < 2 && p.stateT > p.stateDur * 0.5) {
        p.pulverQueued = true;
      }
      return;
    }
    this.doAttack();
  };

  Battle.prototype.doAttack = function () {
    var p = this.player, W = this.W;
    if (this.t - p.comboT > G.PUNI.comboMs) p.combo = 0;
    p.state = 'attack'; p.stateT = 0; p.hitDone = false; p.queued = false;
    p.stateDur = W.swingMs / this.atkSpeed();
    p.comboIdx = p.combo % W.combo.length;
    p.combo++;
    p.comboT = this.t + p.stateDur;
    // Đòn cuối của Thương quét vòng quanh (4Gamer: 周囲をなぎ払う)
    p.sweep = !!(W.finalSweep && p.comboIdx === W.combo.length - 1);
  };

  Battle.prototype.atkSpeed = function () {
    var m = 1;
    this.player.buffs.forEach(function (b) { if (b.atkSpd) m += b.atkSpd; });
    if (this.player.overdrive > 0) m += 0.35;
    if (this.wp && this.wp.wtype === 'soul' && this.player.soul >= 100) m += 0.3;
    return m;
  };

  /* ---- VẨY: né ---- */
  Battle.prototype.tryDodge = function (dx, dy) {
    var p = this.player;
    if (p.down || this.paused || p.dodgeCd > 0) return;
    if (p.state === 'cleave' || p.state === 'ranbu') return;   // chém nạp không hủy được
    this.holdCancel();
    var teleport = p.buffs.some(function (b) { return b.blink; });
    p.state = 'dodge'; p.stateT = 0;
    p.stateDur = G.BAL.dodgeMs / (this.W.dodgeMul || 1);
    p.iframe = G.BAL.dodgeIFrameMs;
    p.iframeFromDodge = true;   // chỉ khung bất tử của NÉ mới mở được cửa sổ phản đòn
    p.rollHit = false;          // mỗi cú lăn cho đúng một Rolling Attack
    p.dodgeCd = G.BAL.dodgeCdMs;
    p.dodgeVX = dx; p.dodgeVY = dy;
    p.dodgeDist = G.BAL.dodgeDist * (this.W.dodgeMul || 1) * (1 + (this.stats.dodge - 1));
    p.facing = Math.atan2(dy, dx);
    if (teleport) {   // Mercury's Blessing: né biến thành dịch chuyển tức thời
      p.x = clamp(p.x + dx * p.dodgeDist * 1.6, 30, this.wW - 30);
      p.y = clamp(p.y + dy * p.dodgeDist * 1.6, 30, this.wH - 30);
      p.state = 'idle'; p.iframe = 260;
      this.puff(p.x, p.y, '#7fd4ff');
    }
    this.fx.push({ k: 'dust', x: p.x, y: p.y, t: 0, ms: 260 });
  };

  /* ---- GIỮ: đặc thù từng vũ khí ---- */
  Battle.prototype.holdStart = function (dx, dy) {
    var p = this.player, c = this.W.special;
    if (p.down || this.paused || this.busy()) return;
    p.charge = 0; p.aimD = 0; p.aimX = 0; p.aimY = 0;
    if (c === 'guard') {
      p.state = 'guard'; p.guardT = 0; p.guardBlocked = false; p.guardPerfect = false;
    } else if (c === 'cleave') {
      p.state = 'charge';
    } else if (c === 'lunge') {
      p.state = 'aim'; p.aimKind = this.wp.wtype === 'heat' ? 'skyfall' : 'lunge';
    } else if (c === 'snipe') {
      p.state = 'aim'; p.aimKind = 'snipe';
      if (this.wp.wtype === 'heat' && this.boss) this.spawnMarks();
    } else if (c === 'ranbu') {
      p.state = 'charge';                 // Song Kiếm tự phát sau windup, không đợi nhả
      p.ranbuWind = 0;
    }
  };

  Battle.prototype.holdTick = function (ms, dx, dy) {
    var p = this.player;
    p.charge = ms;
    var d = Math.hypot(dx, dy);
    if (d > 6) { p.facing = Math.atan2(dy, dx); }
    if (p.state === 'aim') {
      var R = p.aimKind === 'snipe' ? this.W.snipeAimRadius : (p.aimKind === 'skyfall' ? 220 : this.W.lungeDist);
      var k = Math.min(1, d / (G.PUNI.ringR * 1.1));
      p.aimD = k;
      p.aimX = p.x + Math.cos(p.facing) * R * (p.aimKind === 'lunge' ? 1 : k);
      p.aimY = p.y + Math.sin(p.facing) * R * (p.aimKind === 'lunge' ? 1 : k);
    }
    if (p.state === 'guard') p.guardT += 16;
    // Song Kiếm Normal: giữ đủ lâu là TỰ nhảy lên loạn vũ.
    if (p.state === 'charge' && this.W.special === 'ranbu' && this.wp.wtype !== 'heat') {
      if (ms >= this.W.ranbuWindupMs) this.startRanbu();
    }
    // Song Kiếm Heat: giữ khi thanh Heat >= 50% -> bật Overdrive ngay.
    if (p.state === 'charge' && this.W.special === 'ranbu' && this.wp.wtype === 'heat') {
      if (ms >= 240 && p.heat >= 50) this.startOverdrive();
    }
  };

  Battle.prototype.holdEnd = function (dx, dy, ms) {
    var p = this.player, c = this.W.special;
    if (p.state === 'guard') {
      // Nhả sau một cú đỡ thành công -> PHẢN ĐÒN (nhát chém tím của bản gốc).
      if (p.guardBlocked) this.doCounter();
      else { p.state = 'idle'; }
      return;
    }
    if (p.state === 'charge' && c === 'cleave') { this.doCleave(ms); return; }
    if (p.state === 'aim') {
      if (p.aimKind === 'lunge') this.doLunge(ms);
      else if (p.aimKind === 'skyfall') this.doSkyfall(ms);
      else if (p.aimKind === 'snipe') this.doSnipe(ms);
      return;
    }
    if (p.state === 'charge') p.state = 'idle';
  };

  Battle.prototype.holdCancel = function () {
    var p = this.player;
    if (p.state === 'guard' || p.state === 'charge' || p.state === 'aim') { p.state = 'idle'; p.charge = 0; }
  };

  /* ------------------------------------------- CÁC ĐÒN ĐẶC THÙ CỤ THỂ ---- */
  // Đòn phản. Hai đường vào: nhả tay sau một cú ĐỠ thành công (Kiếm & Khiên),
  // hoặc chạm khi dấu "!!" hiện lên sau một cú NÉ chuẩn (mọi vũ khí).
  Battle.prototype.doCounter = function (fromDodge) {
    var p = this.player, W = this.W;
    p.state = 'attack'; p.stateT = 0; p.hitDone = false;
    p.stateDur = 280; p.comboIdx = -1;   // -1 đánh dấu là đòn phản
    p.counterHits = (!fromDodge && this.wp.wtype === 'heat') ? 2 : 1;
    p.counterFromDodge = !!fromDodge;
    p.guardBlocked = false;
    p.iframe = Math.max(p.iframe, 220);
    this.toast(fromDodge ? 'PHẢN ĐÒN SAU NÉ!' : 'PHẢN ĐÒN!', '#c88cff');
    this.gainMagi(6);
  };

  // Rolling Attack: đòn nhẹ hơn nhưng ra ngay trong lúc lăn, và không tốn khung né.
  Battle.prototype.doRollingAttack = function () {
    var p = this.player, W = this.W;
    p.rollHit = true;
    var mul = W.combo[0] * 0.9;
    if (W.ranged) {
      this.projs.push({ k: 'arrow', x: p.x, y: p.y, a: p.facing, spd: W.arrowSpeed, life: 600,
        mul: mul, pierce: false, from: { x: p.x, y: p.y }, hitSet: [] });
    } else {
      this.meleeHit(mul, W.arc * 1.1, W.reach * 0.95, {});
      this.fx.push({ k: 'slash', x: p.x, y: p.y, a: p.facing, arc: W.arc * 1.1, r: W.reach, t: 0, ms: 170, col: '#bfe4ff' });
    }
  };

  Battle.prototype.doCleave = function (ms) {
    var p = this.player, W = this.W;
    var spd = 1 + (this.stats.cleaveSpd || 0) + (this.wp.extra.cleaveSpd || 0);
    var k = clamp(ms / (W.chargeMs / spd), 0, 1);
    p.state = 'cleave'; p.stateT = 0; p.hitDone = false;
    p.stateDur = 520 / this.atkSpeed();
    p.cleaveK = k;
    p.pulver = 0; p.pulverQueued = false;
    this.shake = Math.max(this.shake, 6 * k);
  };

  Battle.prototype.doLunge = function (ms) {
    var p = this.player, W = this.W;
    p.state = 'lunge'; p.stateT = 0; p.hitDone = false;
    p.stateDur = W.lungeMs;
    p.lungeFrom = { x: p.x, y: p.y };
    var d = W.lungeDist * (1 + (this.stats.lunge || 0) + (this.wp.extra.lunge || 0) * 0.5);
    p.lungeTo = { x: clamp(p.x + Math.cos(p.facing) * d, 30, this.wW - 30),
                  y: clamp(p.y + Math.sin(p.facing) * d, 30, this.wH - 30) };
    // Normal-type: kéo căng chỉ hướng -> sát thương HỆ tới ×4 (wiki).
    p.lungeElem = (this.wp.wtype === 'normal') ? 1 + (W.lungeElemBonus - 1) * p.aimD : 1;
    p.lungeBuff = p.lungeElem;   // combo ngay sau đó cũng ăn theo
  };

  Battle.prototype.doSkyfall = function (ms) {
    var p = this.player;
    var bars = Math.floor(p.heat / 33.4);           // Heat Spear: tối đa 3 vạch
    if (bars < 1) { p.state = 'idle'; this.toast('Chưa đủ Heat', '#ffb37a'); return; }
    p.heat -= bars * 33.4; if (p.heat < 0) p.heat = 0;
    p.state = 'lag'; p.stateT = 0; p.stateDur = 780; p.iframe = 640;
    var tx = p.aimX, ty = p.aimY, self = this;
    var radius = 90 + bars * 34, mul = 2.2 + bars * 1.5;
    this.telegraphs.push({ k: 'circle', friendly: true, x: tx, y: ty, r: radius, t: 0, windup: 520, active: 140,
      onHit: function () {
        self.aoeDamage(tx, ty, radius, mul, { fatigue: 2.4, note: 'SKY FALL' });
        self.shake = 10; self.puff(tx, ty, '#ffd23f');
      } });
    p.x = p.x; p.y = p.y;
  };

  Battle.prototype.startRanbu = function () {
    var p = this.player, W = this.W;
    p.state = 'ranbu'; p.stateT = 0; p.stateDur = W.ranbuMs;
    p.ranbuHit = 0; p.iframe = W.ranbuMs;      // bất tử suốt chuỗi (wiki)
    this.toast('LOẠN VŨ', '#7fd4ff');
  };

  Battle.prototype.startOverdrive = function () {
    var p = this.player;
    p.state = 'idle';
    p.overdrive = p.heat * 90;                 // heat càng đầy buff càng dài
    p.overdriveChain = 0;
    this.toast('OVERDRIVE', '#ff7a3c');
  };

  Battle.prototype.doSnipe = function (ms) {
    var p = this.player, W = this.W;
    var spd = 1 + (this.stats.snipeSpd || 0) + (this.wp.extra.snipeSpd || 0);
    var k = clamp(ms / (W.snipeChargeMs / spd), 0, 1);
    var mul = W.snipeMin + (W.snipeMax - W.snipeMin) * k;
    p.state = 'lag'; p.stateT = 0; p.stateDur = 300;
    var full = k >= 0.98;
    this.projs.push({
      k: 'arrow', x: p.x, y: p.y, a: p.facing, spd: 16, life: 900,
      mul: mul * (1 + (this.stats.snipe || 0) + (this.wp.extra.snipe || 0)),
      pierce: true, full: full, from: { x: p.x, y: p.y }, hitSet: []
    });
    this.puff(p.x + Math.cos(p.facing) * 20, p.y + Math.sin(p.facing) * 20, '#e8f2ff');
  };

  Battle.prototype.spawnMarks = function () {
    // Cung Heat: hiện nhiều điểm ngắm trên thân quái; bắn trúng đủ -> Lockdown.
    var b = this.boss; if (!b || b.marks.length) return;
    for (var i = 0; i < 5; i++) {
      b.marks.push({ a: (i / 5) * TAU + Math.random(), d: b.r * (0.4 + Math.random() * 0.5), hit: false });
    }
  };

  /* ------------------------------------------------------------- MAGI ---- */
  Battle.prototype.castMagi = function (idx) {
    var p = this.player;
    if (p.down || this.paused || this.busy()) return;
    var m = this.wp && this.wp.magi[idx];
    if (!m) return;
    if (p.magi < m.cost) { this.toast('Magi chưa đầy', '#8fa3b5'); return; }
    p.magi -= m.cost; p.usedMagi = true;
    var k = G.magiPower(m);
    p.state = 'cast'; p.stateT = 0; p.stateDur = 520 / (this.stats.castSpd || 1);
    if (m.invuln) p.iframe = p.stateDur + 120;

    if (m.shape === 'star') {
      var tx = p.x + Math.cos(p.facing) * (m.kind === 'ranged' ? 150 : 60);
      var ty = p.y + Math.sin(p.facing) * (m.kind === 'ranged' ? 150 : 60);
      if (this.boss && (m.kind === 'ranged' || m.kind === 'aoe')) { tx = this.boss.x; ty = this.boss.y; }
      var self = this;
      this.aoeDamage(tx, ty, m.radius, m.mul * k, {
        el: m.el, fatigue: (m.fatigue || 0) * k, status: m.status,
        partMul: m.partMul || 1, note: m.n, magi: true
      });
      this.fx.push({ k: 'magi', x: tx, y: ty, r: m.radius, t: 0, ms: 620, col: G.ELEMENTS[m.el || 'none'].color });
      this.shake = 8;
    } else if (m.shape === 'heart') {
      var heal = (m.heal || 0) * k * (this.stats.recovery || 1);
      this.heal(p, heal);
      this.allies.forEach(function (a) { if (!a.down) a.hp = Math.min(a.maxHp, a.hp + heal * 0.7); });
      if (m.cleanse) p.status = {};
      if (m.revive) p.reviveBuff = true;
      if (m.hot) p.dot.push({ heal: (m.hot.amount || m.heal * 0.06) * k, left: m.hot.ticks, ms: m.hot.ms, t: 0 });
      if (m.magiBack) p.magi = Math.min(100, p.magi + m.magiBack);
      this.fx.push({ k: 'heal', x: p.x, y: p.y, r: 90, t: 0, ms: 700 });
    } else if (m.shape === 'diamond') {
      if (m.shield) p.shield = p.maxHp * m.shield * k;
      if (m.heal) this.heal(p, m.heal * k);
      if (m.hot) p.dot.push({ heal: (m.hot.amount || 40) * k, left: m.hot.ticks, ms: m.hot.ms, t: 0 });
      if (m.buff) {
        var b = Object.assign({}, m.buff);
        b.until = this.t + (b.ms || 20000);
        p.buffs.push(b);
      }
      if (m.trap) {
        this.telegraphs.push({ k: 'trap', friendly: true, x: p.x, y: p.y, r: 60, t: 0, windup: 0, active: 12000,
          mul: m.mul * k, el: m.el, status: m.status });
      }
      this.fx.push({ k: 'buff', x: p.x, y: p.y, r: 70, t: 0, ms: 800 });
    }
    this.toast(m.n, G.ELEMENTS[m.el || 'none'].color);
  };

  Battle.prototype.gainMagi = function (n) {
    var p = this.player;
    p.magi = Math.min(100, p.magi + n * (this.stats.magiCharge || 1));
  };

  /* ------------------------------------------------------- SÁT THƯƠNG ---- */
  Battle.prototype.playerDamage = function (baseMul, opt) {
    opt = opt || {};
    var st = this.stats, wp = this.wp;
    var phys = (st.atk + wp.patk + (st.watk[wp.wclass] || 0));
    var wdmg = 1 + (st.wdmg[wp.wclass] || 0);
    var elemAmt = wp.eatk * (1 + (st.edmg[wp.el] || 0));
    var atkPct = 1, flatAtk = 0;
    this.player.buffs.forEach(function (b) {
      if (b.atkPct) atkPct += b.atkPct;
      if (b.atk) flatAtk += b.atk;
      if (b.edmg && b.edmg[wp.el]) elemAmt *= (1 + b.edmg[wp.el]);
      if (b.normalDmg && !opt.magi) atkPct += b.normalDmg;
    });
    if (this.player.overdrive > 0) atkPct += 0.25 + 0.5 * Math.min(7, this.player.overdriveChain) / 7;
    if (wp.wtype === 'soul' && this.player.soul >= 100) atkPct += 0.35;
    var elemMul = opt.elemMul || 1;
    return { phys: (phys + flatAtk) * wdmg * baseMul * atkPct, elem: elemAmt * baseMul * elemMul * atkPct, el: opt.el || wp.el };
  };

  Battle.prototype.dealToBoss = function (dmgObj, hitX, hitY, opt) {
    var b = this.boss; if (!b || b.hp <= 0) return 0;
    opt = opt || {};
    var mul = G.elemMult(dmgObj.el, b.el);
    var raw = dmgObj.phys + dmgObj.elem * mul;

    // Trúng bộ phận nào?
    var hitPart = null, weak = false;
    for (var i = 0; i < b.parts.length; i++) {
      var pt = b.parts[i], px = b.x + Math.cos(pt.a + b.facing) * pt.d, py = b.y + Math.sin(pt.a + b.facing) * pt.d;
      if (Math.hypot(hitX - px, hitY - py) < pt.r + 16) { hitPart = pt; break; }
    }
    if (hitPart) {
      if (hitPart.weak && (b.wpOn || b.down > 0)) { weak = true; raw *= G.BAL.weakMul; }
      if (hitPart.broken) raw *= G.BAL.partBrokenMul;
      if (!hitPart.broken) {
        hitPart.hp -= raw * (opt.partMul || 1);
        if (hitPart.hp <= 0) {
          hitPart.broken = true; b.partsBroken++; this.player.partsBroken++;
          this.toast('PHÁ BỘ PHẬN: ' + hitPart.n, '#f2d24b');
          this.chests.push({ x: b.x + (Math.random() - 0.5) * 60, y: b.y + 40, kind: 'red', t: 0, mat: null, part: true });
          // Phá bộ phận hủy trạng thái tê liệt (đúng ghi chú của wiki).
          delete b.status.paralysis;
          this.shake = 12;
        }
      }
    }
    if (b.down > 0) raw *= G.BAL.downDmgMul;

    b.hp -= raw; b.flash = 1;
    // Thanh gục CHỈ nạp mạnh khi đánh vào điểm yếu (đúng bản gốc).
    var fat = (weak ? G.BAL.fatigueWeakGain : G.BAL.fatigueNormalGain) * (opt.fatigue ? opt.fatigue : 1);
    if (b.down <= 0) {
      b.fatigue = Math.min(G.BAL.fatigueMax, b.fatigue + fat);
      if (b.fatigue >= G.BAL.fatigueMax) {
        b.fatigue = 0; b.down = G.BAL.downMs; b.state = 'down'; b.stateT = 0;
        this.clearTelegraphs();
        this.toast('BEHEMOTH GỤC!', '#ffd23f'); this.shake = 16;
      }
    }
    if (opt.stagger && weak && b.down <= 0) { b.stagger = 900; b.state = 'idle'; b.stateT = 0; this.clearTelegraphs(); this.toast('CHÙN!', '#7fd4ff'); }
    if (opt.status && Math.random() < (opt.status === 'paralysis' ? (G.PARALYZE_CHANCE[b.el] || 0.4) : 0.6)) {
      this.applyStatus(b, opt.status);
    }
    if (opt.dot) b.dot.push({ dmg: raw * opt.dot.dps, left: Math.floor(opt.dot.ms / 500), ms: 500, t: 0 });

    this.number(hitX, hitY, Math.round(raw), weak ? 'weak' : (mul > 1 ? 'adv' : mul < 1 ? 'dis' : 'norm'));
    this.gainMagi(G.BAL.magiChargeOnHit);
    if (this.wp.wtype === 'heat') this.player.heat = Math.min(100, this.player.heat + 1.6);
    if (this.wp.wtype === 'soul') this.player.soul = Math.min(100, this.player.soul + 1.4);
    if (this.player.overdrive > 0) this.player.overdriveChain++;
    var self = this;
    this.player.buffs.forEach(function (bf) {
      if (bf.lifesteal) self.heal(self.player, Math.min(bf.lifestealCap || 999, raw * bf.lifesteal));
      if (bf.enchant && Math.random() < 0.35) self.applyStatus(b, bf.enchant);
    });
    if (b.hp <= 0) this.bossDown();
    return raw;
  };

  Battle.prototype.dealToMob = function (m, dmgObj, opt) {
    opt = opt || {};
    var mul = G.elemMult(dmgObj.el, m.el);
    var raw = (dmgObj.phys + dmgObj.elem * mul);
    m.hp -= raw; m.flash = 1;
    this.number(m.x, m.y - m.r, Math.round(raw), mul > 1 ? 'adv' : mul < 1 ? 'dis' : 'norm');
    this.gainMagi(G.BAL.magiChargeOnHit * 0.6);
    if (this.wp.wtype === 'heat') this.player.heat = Math.min(100, this.player.heat + 1.0);
    if (this.wp.wtype === 'soul') this.player.soul = Math.min(100, this.player.soul + 0.9);
    if (opt.status) this.applyStatus(m, opt.status);
    if (m.hp <= 0) this.killMob(m);
  };

  Battle.prototype.aoeDamage = function (x, y, r, mul, opt) {
    opt = opt || {};
    var d = this.playerDamage(mul, opt);
    if (this.boss && this.boss.hp > 0 && Math.hypot(this.boss.x - x, this.boss.y - y) < r + this.boss.r) {
      // Magi diện rộng ưu tiên đánh vào bộ phận gần tâm nổ nhất
      var b = this.boss, best = null, bd = 1e9;
      b.parts.forEach(function (pt) {
        var px = b.x + Math.cos(pt.a + b.facing) * pt.d, py = b.y + Math.sin(pt.a + b.facing) * pt.d;
        var dd = Math.hypot(px - x, py - y); if (dd < bd) { bd = dd; best = { x: px, y: py }; }
      });
      this.dealToBoss(d, best ? best.x : b.x, best ? best.y : b.y, opt);
    }
    var self = this;
    this.mobs.forEach(function (m) {
      if (m.hp > 0 && Math.hypot(m.x - x, m.y - y) < r + m.r) self.dealToMob(m, d, opt);
    });
  };

  /* Vùng chém hình quạt của đòn thường. */
  Battle.prototype.meleeHit = function (mul, arc, reach, opt) {
    opt = opt || {};
    var p = this.player, d = this.playerDamage(mul, opt), self = this;
    var hit = false;
    function inArc(tx, ty, tr) {
      var dd = Math.hypot(tx - p.x, ty - p.y);
      if (dd > reach + tr) return false;
      if (arc >= TAU - 0.01) return true;
      var a = Math.atan2(ty - p.y, tx - p.x);
      return Math.abs(ang(a - p.facing)) < arc / 2 + Math.atan2(tr, Math.max(20, dd));
    }
    if (this.boss && this.boss.hp > 0) {
      var b = this.boss;
      // Với boss, tìm bộ phận nằm trong vùng chém — đây là chỗ WEAK point ăn tiền.
      var target = null, best = 1e9;
      b.parts.forEach(function (pt) {
        var px = b.x + Math.cos(pt.a + b.facing) * pt.d, py = b.y + Math.sin(pt.a + b.facing) * pt.d;
        if (!inArc(px, py, pt.r)) return;
        // Ưu tiên điểm yếu đang lộ; nếu không thì lấy bộ phận gần nhất.
        var score = Math.hypot(px - p.x, py - p.y) - ((pt.weak && (b.wpOn || b.down > 0)) ? 400 : 0);
        if (score < best) { best = score; target = { x: px, y: py }; }
      });
      if (!target && inArc(b.x, b.y, b.r)) target = { x: b.x + Math.cos(p.facing) * b.r * 0.6, y: b.y + Math.sin(p.facing) * b.r * 0.6 };
      if (target) { this.dealToBoss(d, target.x, target.y, opt); hit = true; }
    }
    this.mobs.forEach(function (m) {
      if (m.hp > 0 && inArc(m.x, m.y, m.r)) { self.dealToMob(m, d, opt); hit = true; }
    });
    if (hit) this.shake = Math.max(this.shake, 2 + mul);
    return hit;
  };

  /* --------------------------------------------------- NHẬN SÁT THƯƠNG --- */
  Battle.prototype.hurtPlayer = function (amount, opt) {
    var p = this.player;
    if (p.down) return;
    if (p.iframe > 0) {
      // Né TRÚNG một đòn thật -> mở cửa sổ phản đòn, hiện dấu "!!" trên đầu.
      if (p.iframeFromDodge) {
        p.iframeFromDodge = false;
        p.counterUntil = this.t + 900;
        this.fx.push({ k: 'bang', x: p.x, y: p.y, t: 0, ms: 900 });
      }
      return;
    }
    opt = opt || {};
    var W = this.W;
    var cut = 1;
    var perfect = false;
    if (p.state === 'guard') {
      // Đỡ ĐÚNG LÚC (trong 220ms đầu của thế thủ) -> giảm 90%, đúng wiki.
      perfect = p.guardT <= W.perfectMs;
      cut = perfect ? W.perfectCut : W.guardCut;
      cut += -(this.stats.guard || 0) * 0.5;
      cut = clamp(cut, 0.02, 1);
      p.guardBlocked = true;
      if (perfect) { this.toast('ĐỠ CHUẨN!', '#7fd4ff'); this.gainMagi(8); }
      // Heat: đỡ nạp thanh Heat.
      if (this.wp.wtype === 'heat') p.heat = Math.min(100, p.heat + (perfect ? 18 : 9));
    } else if (p.state === 'cleave') {
      cut = 1 - W.cleaveDR;     // chém nạp: giảm 50% sát thương nhận, không bị ngắt
    }
    var def = this.stats.def, defPct = 1;
    p.buffs.forEach(function (b) { if (b.defPct) defPct += b.defPct; if (b.def) def += b.def; });
    var dmg = Math.max(1, amount * cut * (1 - clamp(def / (def + 900), 0, 0.72)) / defPct);

    if (p.shield > 0) {
      var absorb = Math.min(p.shield, dmg); p.shield -= absorb; dmg -= absorb;
      this.number(p.x, p.y - 24, Math.round(absorb), 'shield');
      if (dmg <= 0) return;
    }
    p.hp -= dmg;
    this.number(p.x, p.y - 24, Math.round(dmg), 'take');
    this.gainMagi(G.BAL.magiChargeOnTake);
    this.shake = Math.max(this.shake, 5);
    var antiStagger = p.buffs.some(function (b) { return b.antiStagger; });
    if (!antiStagger && p.state !== 'guard' && p.state !== 'cleave' && p.state !== 'ranbu' && dmg > p.maxHp * 0.06) {
      p.state = 'hurt'; p.stateT = 0; p.stateDur = 320; p.iframe = 300; p.iframeFromDodge = false;
    }
    if (opt.status) this.applyStatus(p, opt.status, true);
    if (p.hp <= 0) this.playerDown();
  };

  Battle.prototype.heal = function (e, n) {
    if (n <= 0) return;
    e.hp = Math.min(e.maxHp, e.hp + n);
    this.number(e.x, e.y - 30, '+' + Math.round(n), 'heal');
  };

  Battle.prototype.applyStatus = function (e, id, isPlayer) {
    var S = G.STATUS[id]; if (!S) return;
    var ms = S.ms;
    if (isPlayer) ms *= (1 - (this.stats.res[id] || 0));
    if (ms <= 0) return;
    e.status = e.status || {};
    e.status[id] = this.t + ms;
  };

  Battle.prototype.playerDown = function () {
    var p = this.player;
    p.hp = 0; p.deaths++;
    if (p.reviveBuff) {   // Angel's Embrace: sống lại 50% máu, một lần mỗi trận
      p.reviveBuff = false; p.hp = p.maxHp * 0.5;
      this.toast('HỒI SINH (Angel\'s Embrace)', '#ffd8e8');
      return;
    }
    p.down = true; p.downT = 0; p.state = 'idle';
    this.toast('BẤT TỈNH — đồng đội tới cứu', '#c34141');
    if (this.cb.onDown) this.cb.onDown();
  };

  Battle.prototype.revivePlayer = function (frac) {
    var p = this.player;
    p.down = false; p.hp = p.maxHp * (frac || 0.6); p.iframe = 900; p.downT = 0;
    this.toast('ĐỨNG DẬY!', '#7fd07f');
    if (this.cb.onRevive) this.cb.onRevive();
  };

  Battle.prototype.gemRevive = function () {
    if (this.s.gem < 5) { this.toast('Không đủ Gem', '#c34141'); return false; }
    this.s.gem -= 5; this.revivePlayer(1.0);
    return true;
  };

  /* ------------------------------------------------------ QUÁI CHẾT ----- */
  Battle.prototype.killMob = function (m) {
    m.hp = 0; m.dead = true;
    this.killed++;
    this.s.stats.mob++;
    var mats = G.rollMobDrop(m.tribe, m.elite, m.gold, this.stats.luck);
    this.chests.push({
      x: m.x, y: m.y, t: 0, mats: mats,
      kind: m.gold ? 'gold' : m.elite ? 'red' : 'silver',
      gold: Math.round((12 + m.lv * 5) * (m.gold ? 8 : m.elite ? 3 : 1) * G.potionMul(this.s, 'gold')),
      exp: Math.round((4 + m.lv * 2.2) * (m.elite ? 3 : 1) * G.potionMul(this.s, 'exp'))
    });
    this.puff(m.x, m.y, G.ELEMENTS[m.el].color);
    if (this.mode === 'field' && this.killed >= this.needKills && !this.portalOpen) {
      this.portalOpen = true;
      this.toast('CỔNG ĐÃ MỞ', '#f2d24b');
    }
    // Field giữ mật độ quái — bản gốc map luôn có quái đi lại.
    if (this.mode === 'field') {
      var self = this;
      setTimeout(function () {
        if (self.running && self.mobs.filter(function (x) { return !x.dead; }).length < 9) {
          self.mobs.push(self.makeMob(pick(self.map.tribes), self.map.lv, Math.random() < 0.16, self.map.gold));
        }
      }, 2200);
    }
  };

  Battle.prototype.bossDown = function () {
    var b = this.boss; if (!b || this.result) return;
    b.hp = 0;
    this.shake = 20;
    this.puff(b.x, b.y, '#ffd23f');
    var self = this;
    var elapsed = G.BAL.questMs - this.timeLeft;
    // Ba điều kiện thưởng gem của Sudden Behemoth trong bản gốc, + 1 gem bonus nếu đủ cả ba.
    var conds = {
      noDeath: this.player.deaths === 0,
      usedMagi: this.player.usedMagi,
      fast: elapsed <= G.BAL.gemFastMs
    };
    var gems = (conds.noDeath ? 1 : 0) + (conds.usedMagi ? 1 : 0) + (conds.fast ? 1 : 0);
    if (gems === 3) gems += G.BAL.gemAllBonus;
    var drops = G.rollBossDrop(b.def, b.partsBroken, this.stats.luck);
    setTimeout(function () {
      self.finish({
        win: true, boss: b.def, gems: gems, conds: conds, drops: drops,
        tablet: 1, parts: b.partsBroken, elapsed: elapsed,
        gold: Math.round((900 + b.lv * 180) * ({ B: 1, A: 2, S: 4, SS: 8 }[b.rank] || 1) * G.potionMul(self.s, 'gold')),
        exp: Math.round((70 + b.lv * 22) * ({ B: 1, A: 2, S: 3.5, SS: 6 }[b.rank] || 1) * G.potionMul(self.s, 'exp')),
        medal: ({ B: 2, A: 5, S: 12, SS: 30 }[b.rank] || 2)
      });
    }, 1200);
  };

  /* -------------------------------------------------------- KẾT THÚC ---- */
  Battle.prototype.finish = function (r) {
    if (this.result) return;
    this.result = r;
    this.running = false;
    if (this.cb.onFinish) this.cb.onFinish(r);
  };

  Battle.prototype.leaveField = function () {
    this.finish({ win: true, field: true, killed: this.killed, bag: this.bag || {} });
  };

  /* ============================================================ VÒNG LẶP == */
  Battle.prototype.start = function () {
    this.running = true; this.last = performance.now();
    var self = this;
    this.raf = requestAnimationFrame(function f(t) {
      if (!self.running) return;
      self.step(t);
      self.raf = requestAnimationFrame(f);
    });
  };
  Battle.prototype.stop = function () {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.puni) this.puni.destroy();
  };

  Battle.prototype.step = function (now) {
    var dt = Math.min(50, now - this.last);
    this.last = now; this.t = now;
    if (!this.paused) this.update(dt);
    this.render();
    if (this.cb.onHud) this.cb.onHud(this);
  };

  Battle.prototype.update = function (dt) {
    var p = this.player, self = this;

    this.timeLeft -= dt;
    if (this.timeLeft <= 0 && this.mode === 'boss' && !this.result) {
      this.finish({ win: false, timeout: true, boss: this.boss.def });
      return;
    }

    // ---- trạng thái bất lợi của người chơi ----
    var stunned = false, slowMul = 1;
    for (var k in p.status) {
      if (p.status[k] < this.t) { delete p.status[k]; continue; }
      var S = G.STATUS[k];
      if (S.stun) stunned = true;
      if (S.spd) slowMul = Math.min(slowMul, S.spd);
      if (S.dps) p.hp -= p.maxHp * S.dps * dt / 1000;
    }
    if (p.hp <= 0 && !p.down) this.playerDown();

    // ---- hồi phục theo thời gian (dot/hot) ----
    for (var i = p.dot.length - 1; i >= 0; i--) {
      var d = p.dot[i]; d.t += dt;
      if (d.t >= d.ms) { d.t = 0; d.left--; if (d.heal) this.heal(p, d.heal); if (d.left <= 0) p.dot.splice(i, 1); }
    }
    // Đỡ bằng Kiếm & Khiên hồi máu nhanh hơn (Normal-type, wiki).
    if (this.stats.regen || p.state === 'guard') {
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * ((this.stats.regen || 0) + (p.state === 'guard' ? 0.012 : 0)) * dt / 1000);
    }
    p.buffs = p.buffs.filter(function (b) { return b.until > self.t; });
    if (p.overdrive > 0) { p.overdrive -= dt; p.heat = Math.max(0, p.heat - dt * 0.02); if (p.overdrive <= 0) p.overdriveChain = 0; }
    p.magi = Math.min(100, p.magi + G.BAL.magiRegenPerSec * (this.stats.magiCharge || 1) * dt / 1000);
    if (p.iframe > 0) p.iframe -= dt;
    if (p.dodgeCd > 0) p.dodgeCd -= dt;

    // ---- di chuyển / hành động ----
    var mv = this.puni.tick(this.t);
    if (p.down) {
      p.downT += dt;
      // Đồng đội tới vòng cứu; hết lượt cứu thì thua (đúng luật Tower của bản gốc).
      if (p.downT > 12000) {
        if (this.mode === 'boss') { this.finish({ win: false, wipe: true, boss: this.boss.def }); return; }
        this.revivePlayer(0.5);
      }
    } else if (!stunned) {
      this.updateAction(dt, mv, slowMul);
    }

    // ---- entities ----
    if (this.mode === 'boss') this.updateBoss(dt); else this.updateField(dt);
    this.updateMobs(dt);
    this.updateAllies(dt);
    this.updateProjectiles(dt);
    this.updateTelegraphs(dt);

    // ---- fx ----
    for (var f = this.fx.length - 1; f >= 0; f--) { this.fx[f].t += dt; if (this.fx[f].t > this.fx[f].ms) this.fx.splice(f, 1); }
    for (var m2 = this.msgs.length - 1; m2 >= 0; m2--) { this.msgs[m2].t += dt; if (this.msgs[m2].t > 900) this.msgs.splice(m2, 1); }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 0.04);
  };

  Battle.prototype.updateAction = function (dt, mv, slowMul) {
    var p = this.player, W = this.W;
    p.stateT += dt;

    switch (p.state) {
      case 'attack': {
        var hitAt = p.stateDur * 0.34;
        if (!p.hitDone && p.stateT >= hitAt) {
          p.hitDone = true;
          var isCounter = p.comboIdx === -1;
          var mul = isCounter ? W.counterMul : W.combo[p.comboIdx];
          var arc = isCounter ? W.counterArc : (p.sweep ? TAU : W.arc);
          var reach = isCounter ? W.counterReach : (p.sweep ? W.reach * 0.9 : W.reach);
          var elemMul = p.lungeBuff || 1; p.lungeBuff = 1;
          if (W.ranged) {
            this.projs.push({ k: 'arrow', x: p.x, y: p.y, a: p.facing, spd: W.arrowSpeed, life: 700,
              mul: mul, pierce: false, from: { x: p.x, y: p.y }, hitSet: [] });
          } else {
            this.meleeHit(mul, arc, reach, { elemMul: elemMul });
            this.fx.push({ k: 'slash', x: p.x, y: p.y, a: p.facing, arc: arc, r: reach, t: 0, ms: 190,
              col: isCounter ? '#c88cff' : '#ffffff' });
          }
          if (isCounter && p.counterHits > 1) { p.counterHits--; p.hitDone = false; p.stateT = 0; p.stateDur = 200; }
        }
        if (p.stateT >= p.stateDur) {
          p.state = 'idle';
          if (p.queued) { p.queued = false; this.doAttack(); }
        }
        break;
      }
      case 'cleave': {
        if (!p.hitDone && p.stateT >= p.stateDur * 0.45) {
          p.hitDone = true;
          var k = p.cleaveK;
          var mul = W.cleaveMin + (W.cleaveMax - W.cleaveMin) * k;
          mul *= 1 + (this.stats.cleave || 0) + (this.wp.extra.cleave || 0);
          // Normal-type: chém nạp gây ×4 sát thương HỆ.
          var em = (this.wp.wtype === 'normal') ? (1 + (W.cleaveElemBonus - 1) * k) : 1;
          this.meleeHit(mul, W.cleaveArc, W.cleaveReach, { elemMul: em, fatigue: W.cleaveFatigue });
          this.fx.push({ k: 'slash', x: p.x, y: p.y, a: p.facing, arc: W.cleaveArc, r: W.cleaveReach, t: 0, ms: 300, col: '#ffd8a0', big: true });
          this.shake = 8 + 8 * k;
        }
        if (p.stateT >= p.stateDur) {
          // Heat: Pulverize — nối tối đa 3 nhát nếu bấm đúng nhịp.
          if (p.pulverQueued && p.pulver < 2) {
            p.pulver++; p.pulverQueued = false; p.stateT = 0; p.hitDone = false;
            p.stateDur = 420 / this.atkSpeed(); p.cleaveK *= 0.85;
            this.toast('PULVERIZE ' + (p.pulver + 1), '#ff7a3c');
          } else { p.state = 'lag'; p.stateT = 0; p.stateDur = 260; }
        }
        break;
      }
      case 'lunge': {
        var t = clamp(p.stateT / p.stateDur, 0, 1);
        p.x = p.lungeFrom.x + (p.lungeTo.x - p.lungeFrom.x) * t;
        p.y = p.lungeFrom.y + (p.lungeTo.y - p.lungeFrom.y) * t;
        if (!p.hitDone && t > 0.35) {
          p.hitDone = true;
          var lm = W.lungeMul * (1 + (this.stats.lunge || 0) + (this.wp.extra.lunge || 0));
          this.meleeHit(lm, 1.1, W.reach * 1.1, { elemMul: p.lungeElem, stagger: W.lungeStagger, fatigue: 1.6 });
          this.fx.push({ k: 'lunge', x: p.x, y: p.y, a: p.facing, t: 0, ms: 240 });
        }
        if (t >= 1) { p.state = 'lag'; p.stateT = 0; p.stateDur = W.lungeLagMs; }  // khoảng hở sau khi lao
        break;
      }
      case 'ranbu': {
        var per = p.stateDur / W.ranbuHits;
        while (p.ranbuHit < W.ranbuHits && p.stateT >= per * (p.ranbuHit + 1)) {
          p.ranbuHit++;
          var rm = W.ranbuMul * (1 + (this.stats.frenzy || 0) + (this.wp.extra.frenzy || 0));
          this.meleeHit(rm, TAU, W.ranbuReach, {});
          this.fx.push({ k: 'ring', x: p.x, y: p.y, r: W.ranbuReach, t: 0, ms: 150, col: '#7fd4ff' });
        }
        if (p.stateT >= p.stateDur) { p.state = 'lag'; p.stateT = 0; p.stateDur = W.ranbuLandLagMs; } // độ cứng tiếp đất
        break;
      }
      case 'dodge': {
        var td = clamp(p.stateT / p.stateDur, 0, 1);
        var ease = 1 - Math.pow(1 - td, 3);
        var step = p.dodgeDist * (ease - (p.lastEase || 0)); p.lastEase = ease;
        p.x = clamp(p.x + p.dodgeVX * step, 24, this.wW - 24);
        p.y = clamp(p.y + p.dodgeVY * step, 24, this.wH - 24);
        if (td >= 1) { p.state = 'idle'; p.lastEase = 0; }
        break;
      }
      case 'lag': case 'hurt': case 'cast': case 'switch':
        if (p.stateT >= p.stateDur) p.state = 'idle';
        break;
      case 'guard':
        p.guardT += dt;
        // fallthrough: guard vẫn đi được nhưng chậm
      case 'aim': case 'charge': case 'idle': {
        var mul = (p.state === 'guard') ? W.guardMoveMul : (p.state === 'idle' ? 1 : 0);
        if (mv.m > 0 && mul > 0) {
          var spd = G.BAL.baseSpd * W.moveMul * (this.stats.moveSpd || 1) * mul * mv.m * slowMul;
          var bs = 1; p.buffs.forEach(function (b) { if (b.moveSpd) bs += b.moveSpd; });
          if (p.overdrive > 0) bs += 0.25;
          spd *= bs;
          p.x = clamp(p.x + mv.x * spd * dt / 16.67, 24, this.wW - 24);
          p.y = clamp(p.y + mv.y * spd * dt / 16.67, 24, this.wH - 24);
          p.facing = Math.atan2(mv.y, mv.x);
          p.moving = true;
        } else p.moving = false;
        break;
      }
    }
  };

  /* -------------------------------------------------------- FIELD ------- */
  Battle.prototype.updateField = function (dt) {
    var p = this.player, self = this;
    // Rương: chạm vào mới nhặt, và biến mất sau một lúc (đúng bản gốc).
    this.bag = this.bag || { mats: {}, gold: 0, exp: 0 };
    for (var i = this.chests.length - 1; i >= 0; i--) {
      var c = this.chests[i]; c.t += dt;
      if (c.t > 22000) { this.chests.splice(i, 1); continue; }
      if (dist(p, c) < 32) {
        (c.mats || []).forEach(function (m) { self.bag.mats[m] = (self.bag.mats[m] || 0) + 1; G.addMat(self.s, m, 1); });
        this.bag.gold += c.gold || 0; this.s.gold += c.gold || 0;
        this.bag.exp += c.exp || 0;
        G.addExp(this.s, c.exp || 0);
        this.toast('+' + (c.gold || 0) + ' Gold', '#f2d24b');
        this.chests.splice(i, 1);
      }
    }
    // Điểm khai thác (nhiệm vụ ngày "Thu thập 2 lần")
    this.gathers.forEach(function (g) {
      if (!g.used && dist(p, g) < 34) {
        g.used = true; self.s.stats.gathers++;
        G.track(self.s, { gather: 1 });
        var m = pick(['str_stone', 'magi_frag', 'crystal', 'lapis_b']);
        G.addMat(self.s, m, 1);
        self.toast('Thu được ' + G.MATERIALS[m].n, '#7fd07f');
        self.puff(g.x, g.y, '#7fd07f');
      }
    });
    // Sudden Behemoth: đang farm thì gặp boss (bản gốc gọi là Sudden Massive Monster)
    if (!this.suddenDone) {
      this.suddenAt -= dt;
      if (this.suddenAt <= 0) {
        this.suddenDone = true;
        var rare = Math.random() < 0.22;
        var pool = rare ? (this.area.rare || this.area.sudden) : this.area.sudden;
        var bid = pick(pool);
        if (this.cb.onSudden) this.cb.onSudden(bid, rare);
      }
    }
    // Cổng sang map kế
    if (this.portalOpen && dist(p, this.portal) < 40) {
      this.finish({ win: true, field: true, portal: true, killed: this.killed, bag: this.bag });
    }
  };

  /* --------------------------------------------------------- BOSS AI ---- */
  Battle.prototype.updateBoss = function (dt) {
    var b = this.boss, p = this.player, self = this;
    if (!b || b.hp <= 0) return;
    b.flash = Math.max(0, b.flash - dt * 0.004);

    for (var i = b.dot.length - 1; i >= 0; i--) {
      var d = b.dot[i]; d.t += dt;
      if (d.t >= d.ms) { d.t = 0; d.left--; b.hp -= d.dmg; this.number(b.x, b.y, Math.round(d.dmg), 'dot'); if (d.left <= 0) b.dot.splice(i, 1); }
    }
    var stun = false;
    for (var k in b.status) {
      if (b.status[k] < this.t) { delete b.status[k]; continue; }
      var S = G.STATUS[k];
      if (S.stun) stun = true;
      if (S.dps) b.hp -= b.maxHp * S.dps * 0.35 * dt / 1000;
    }
    if (b.hp <= 0) { this.bossDown(); return; }

    if (b.down > 0) { b.down -= dt; if (b.down <= 0) { b.state = 'idle'; b.cd = 900; b.wpOn = false; } return; }
    if (b.stagger > 0) { b.stagger -= dt; return; }
    if (stun) return;
    if (b.lockdown > 0) { b.lockdown -= dt; return; }

    // Chu kỳ lộ điểm yếu — nhịp chính của trận đánh.
    b.wpTimer -= dt;
    if (b.wpTimer <= 0) {
      b.wpOn = !b.wpOn;
      b.wpTimer = b.wpOn ? 3200 : (5200 + Math.random() * 2600);
      if (b.wpOn) this.toast('WEAK!', '#ffd23f');
    }

    b.stateT += dt;
    if (b.state === 'idle') {
      // Đi tới người chơi
      var tgt = this.nearestTarget(b);
      var a = Math.atan2(tgt.y - b.y, tgt.x - b.x);
      b.facing += ang(a - b.facing) * 0.06;
      var dd = dist(b, tgt);
      if (dd > b.r + 70) {
        b.x += Math.cos(b.facing) * b.spd * dt / 16.67;
        b.y += Math.sin(b.facing) * b.spd * dt / 16.67;
      }
      b.cd -= dt;
      if (b.cd <= 0) this.bossAttack();
    } else if (b.state === 'attack') {
      var pat = b.pattern;
      if (pat.move && b.stateT > pat.windup && b.stateT < pat.windup + pat.active) {
        var mv = (pat.range || 200) / pat.active * dt;
        b.x = clamp(b.x + Math.cos(b.aimA) * mv, 60, this.wW - 60);
        b.y = clamp(b.y + Math.sin(b.aimA) * mv, 60, this.wH - 60);
      }
      if (b.stateT >= pat.windup + pat.active + pat.recover) {
        b.state = 'idle'; b.cd = 700 + Math.random() * 900;
      }
    }
  };

  Battle.prototype.nearestTarget = function (b) {
    var best = this.player, bd = this.player.down ? 1e9 : dist(b, this.player);
    this.allies.forEach(function (a) { if (!a.down) { var d = dist(b, a); if (d < bd) { bd = d; best = a; } } });
    return best;
  };

  Battle.prototype.bossAttack = function () {
    var b = this.boss, self = this;
    var list = b.def.patterns || ['slam'];
    var id = list[(b.patIdx++) % list.length];
    if (Math.random() < 0.35) id = pick(list);
    var pat = G.PATTERNS[id]; if (!pat) return;
    b.state = 'attack'; b.stateT = 0; b.pattern = pat;
    var tgt = this.nearestTarget(b);
    b.aimA = Math.atan2(tgt.y - b.y, tgt.x - b.x);
    b.facing = b.aimA;

    var dmg = b.atk * pat.dmg;
    var tel = {
      k: pat.tel, x: b.x, y: b.y, a: b.aimA, t: 0,
      windup: pat.windup, active: pat.active,
      r: pat.radius, range: pat.range, w: pat.w, arc: pat.arc,
      tick: pat.tick, dmg: dmg, hostile: true, name: pat.vi,
      status: pat.status === true ? (b.el === 'fire' ? 'burn' : b.el === 'thunder' ? 'paralysis' : b.el === 'water' ? 'freeze' : 'poison') : pat.status
    };
    if (pat.tel === 'circle' && pat.move) { tel.x = tgt.x; tel.y = tgt.y; }
    if (pat.tel === 'circle' && !pat.move) { tel.x = tgt.x; tel.y = tgt.y; }
    if (pat.tel === 'multi') {
      for (var i = 0; i < (pat.count || 5); i++) {
        var a2 = Math.random() * TAU, r2 = 60 + Math.random() * 180;
        this.telegraphs.push(Object.assign({}, tel, { k: 'circle', x: tgt.x + Math.cos(a2) * r2, y: tgt.y + Math.sin(a2) * r2, r: pat.radius, windup: pat.windup + i * 110 }));
      }
    } else if (pat.tel !== 'none') {
      this.telegraphs.push(tel);
    }
    if (pat.summon) {
      for (var s = 0; s < pat.summon; s++) {
        var m = this.makeMob(pick(this.map.tribes || ['purun']), b.lv, false, false);
        m.x = b.x + (Math.random() - 0.5) * 160; m.y = b.y + (Math.random() - 0.5) * 160;
        this.mobs.push(m);
      }
      this.toast(b.n + ' gọi tay sai!', '#c34141');
    }
  };

  Battle.prototype.clearTelegraphs = function () {
    this.telegraphs = this.telegraphs.filter(function (t) { return !t.hostile; });
  };

  Battle.prototype.updateTelegraphs = function (dt) {
    var self = this, p = this.player;
    for (var i = this.telegraphs.length - 1; i >= 0; i--) {
      var t = this.telegraphs[i];
      t.t += dt;
      var inActive = t.t >= t.windup && t.t < t.windup + t.active;
      if (inActive) {
        if (t.hostile) {
          var doHit = t.tick ? true : !t.hit;
          if (doHit) {
            if (!t.tick) t.hit = true;
            var mulT = t.tick ? dt / 1000 * 2.4 : 1;
            if (this.inTelegraph(t, p.x, p.y, p.r)) this.hurtPlayer(t.dmg * mulT, { status: t.status });
            this.allies.forEach(function (a) {
              if (!a.down && self.inTelegraph(t, a.x, a.y, a.r)) {
                a.hp -= t.dmg * mulT * 0.6;
                if (a.hp <= 0) { a.down = true; a.downT = 0; a.hp = 0; }
              }
            });
          }
        } else if (t.onHit && !t.hit) { t.hit = true; t.onHit(); }
        else if (t.k === 'trap') {
          // Bẫy của Support Magi: nổ khi địch chạm vào
          var hitAny = false;
          if (this.boss && this.boss.hp > 0 && dist(this.boss, t) < t.r + this.boss.r) hitAny = true;
          this.mobs.forEach(function (m) { if (!m.dead && dist(m, t) < t.r + m.r) hitAny = true; });
          if (hitAny) { this.aoeDamage(t.x, t.y, t.r, t.mul, { el: t.el, status: t.status }); t.t = t.windup + t.active; }
        }
      }
      if (t.t >= t.windup + t.active) this.telegraphs.splice(i, 1);
    }
  };

  Battle.prototype.inTelegraph = function (t, x, y, r) {
    r = r || 0;
    if (t.k === 'circle') return Math.hypot(x - t.x, y - t.y) < t.r + r;
    if (t.k === 'ring') return Math.hypot(x - t.x, y - t.y) < t.r + r;
    if (t.k === 'cone') {
      var d = Math.hypot(x - t.x, y - t.y);
      if (d > t.range + r) return false;
      return Math.abs(ang(Math.atan2(y - t.y, x - t.x) - t.a)) < t.arc / 2;
    }
    if (t.k === 'line') {
      var dx = x - t.x, dy = y - t.y;
      var along = dx * Math.cos(t.a) + dy * Math.sin(t.a);
      if (along < -r || along > t.range + r) return false;
      var perp = Math.abs(-dx * Math.sin(t.a) + dy * Math.cos(t.a));
      return perp < t.w / 2 + r;
    }
    return false;
  };

  /* ----------------------------------------------------------- QUÁI ---- */
  Battle.prototype.updateMobs = function (dt) {
    var p = this.player, self = this;
    this.mobs.forEach(function (m) {
      if (m.dead) return;
      m.flash = Math.max(0, m.flash - dt * 0.005);
      var stun = false;
      for (var k in m.status) {
        if (m.status[k] < self.t) { delete m.status[k]; continue; }
        if (G.STATUS[k].stun) stun = true;
        if (G.STATUS[k].dps) { m.hp -= m.maxHp * G.STATUS[k].dps * dt / 1000; }
      }
      if (m.hp <= 0) { self.killMob(m); return; }
      if (stun) return;
      var tgt = p.down ? (self.allies.find(function (a) { return !a.down; }) || p) : p;
      var d = dist(m, tgt);
      if (d < 340) m.agro = 1;
      if (!m.agro) return;
      var a = Math.atan2(tgt.y - m.y, tgt.x - m.x);
      m.facing = a;
      if (m.hitT > 0) { m.hitT -= dt; return; }
      if (d > m.r + tgt.r + 8) {
        var sp = m.spd * (m.T.hopper ? (Math.sin(self.t / 300) > 0 ? 2.0 : 0.1) : 1) * dt / 16.67;
        m.x = clamp(m.x + Math.cos(a) * sp, 20, self.wW - 20);
        m.y = clamp(m.y + Math.sin(a) * sp, 20, self.wH - 20);
      } else {
        m.cd -= dt;
        if (m.cd <= 0) {
          m.cd = 900 + Math.random() * 900; m.hitT = 340;
          if (tgt === p) self.hurtPlayer(m.atk, { status: m.T.poisoner && Math.random() < 0.3 ? 'poison' : null });
          else { tgt.hp -= m.atk * 0.6; if (tgt.hp <= 0) { tgt.down = true; tgt.hp = 0; tgt.downT = 0; } }
          self.fx.push({ k: 'ring', x: m.x, y: m.y, r: m.r + 14, t: 0, ms: 180, col: '#ff6a6a' });
        }
      }
    });
    this.mobs = this.mobs.filter(function (m) { return !m.dead || m.hp > 0; });
  };

  /* --------------------------------------------------- ĐỒNG ĐỘI NPC ---- */
  // Thay cho co-op 4 người của bản gốc: 3 NPC đánh, né, và tới cứu khi bạn ngã.
  Battle.prototype.updateAllies = function (dt) {
    var self = this, p = this.player;
    this.allies.forEach(function (a) {
      if (a.down) {
        a.downT += dt;
        if (a.downT > 9000) { a.down = false; a.hp = a.maxHp * 0.5; }
        return;
      }
      // Ưu tiên tuyệt đối: cứu người chơi.
      if (p.down) {
        var d = dist(a, p);
        if (d > G.BAL.reviveRadius) {
          var ar = Math.atan2(p.y - a.y, p.x - a.x);
          a.x += Math.cos(ar) * 3.1 * dt / 16.67; a.y += Math.sin(ar) * 3.1 * dt / 16.67;
        } else {
          a.reviveT = (a.reviveT || 0) + dt;
          if (a.reviveT >= G.BAL.reviveMs) { a.reviveT = 0; self.revivePlayer(0.6); }
        }
        return;
      }
      a.reviveT = 0;
      // Né vùng báo đỏ
      var danger = self.telegraphs.find(function (t) { return t.hostile && t.t < t.windup && self.inTelegraph(t, a.x, a.y, a.r + 20); });
      if (danger && a.dodgeT <= 0) {
        a.dodgeT = 700;
        var away = Math.atan2(a.y - danger.y, a.x - danger.x) + (Math.random() - 0.5);
        a.dvx = Math.cos(away); a.dvy = Math.sin(away);
      }
      if (a.dodgeT > 0) {
        a.dodgeT -= dt;
        a.x = clamp(a.x + a.dvx * 4.2 * dt / 16.67, 20, self.wW - 20);
        a.y = clamp(a.y + a.dvy * 4.2 * dt / 16.67, 20, self.wH - 20);
        return;
      }
      // Tìm mục tiêu
      var tgt = null, bd = 1e9;
      if (self.boss && self.boss.hp > 0) { tgt = self.boss; bd = dist(a, self.boss); }
      self.mobs.forEach(function (m) { if (!m.dead) { var d2 = dist(a, m); if (d2 < bd) { bd = d2; tgt = m; } } });
      if (!tgt) {
        var dp = dist(a, p);
        if (dp > 130) { var ap = Math.atan2(p.y - a.y, p.x - a.x); a.x += Math.cos(ap) * 2.2 * dt / 16.67; a.y += Math.sin(ap) * 2.2 * dt / 16.67; }
        return;
      }
      var want = a.kind === 'bow' ? 220 : (a.kind === 'spear' ? 90 : 60);
      var ta = Math.atan2(tgt.y - a.y, tgt.x - a.x);
      a.facing = ta;
      var dd = dist(a, tgt) - (tgt.r || 14);
      if (Math.abs(dd - want) > 24) {
        var dir = dd > want ? 1 : -1;
        a.x = clamp(a.x + Math.cos(ta) * dir * 2.5 * dt / 16.67, 20, self.wW - 20);
        a.y = clamp(a.y + Math.sin(ta) * dir * 2.5 * dt / 16.67, 20, self.wH - 20);
      }
      a.atkCd -= dt;
      if (a.atkCd <= 0 && dd <= want + 20) {
        a.atkCd = a.kind === 'bow' ? 900 : a.kind === 'spear' ? 700 : 550;
        a.hitT = 200;
        var dmgO = { phys: a.dmg, elem: 0, el: 'none' };
        if (tgt === self.boss) {
          // NPC đánh vào thân, không ăn bonus WEAK — người chơi mới là người tìm điểm yếu.
          self.dealToBoss(dmgO, tgt.x + Math.cos(ta + Math.PI) * tgt.r * 0.5, tgt.y + Math.sin(ta + Math.PI) * tgt.r * 0.5, {});
        } else self.dealToMob(tgt, dmgO, {});
        self.fx.push({ k: 'slash', x: a.x, y: a.y, a: ta, arc: 1.3, r: want + 20, t: 0, ms: 150, col: '#a8c8e8' });
      }
    });
  };

  /* ------------------------------------------------------- ĐẠN BAY ---- */
  Battle.prototype.updateProjectiles = function (dt) {
    var self = this, W = this.W;
    for (var i = this.projs.length - 1; i >= 0; i--) {
      var pr = this.projs[i];
      pr.life -= dt;
      pr.x += Math.cos(pr.a) * pr.spd * dt / 16.67;
      pr.y += Math.sin(pr.a) * pr.spd * dt / 16.67;
      if (pr.life <= 0 || pr.x < 0 || pr.y < 0 || pr.x > this.wW || pr.y > this.wH) { this.projs.splice(i, 1); continue; }

      // Cung: CÀNG GẦN BẮN CÀNG ĐAU — tính theo quãng đường mũi tên đã bay.
      var travelled = Math.hypot(pr.x - pr.from.x, pr.y - pr.from.y);
      var closeK = 1 + (W.snipeCloseBonus || 0) * clamp(1 - travelled / (W.snipeCloseRange || 340), 0, 1);
      var d = this.playerDamage(pr.mul * closeK, {});

      var hitSomething = false;
      if (this.boss && this.boss.hp > 0 && pr.hitSet.indexOf('boss') < 0) {
        var b = this.boss;
        // Ưu tiên trúng điểm ngắm (Heat bow) rồi tới bộ phận
        var hitPos = null;
        for (var mi = 0; mi < b.marks.length; mi++) {
          var mk = b.marks[mi];
          var mx = b.x + Math.cos(mk.a + b.facing) * mk.d, my = b.y + Math.sin(mk.a + b.facing) * mk.d;
          if (!mk.hit && Math.hypot(pr.x - mx, pr.y - my) < 26) {
            mk.hit = true; hitPos = { x: mx, y: my };
            if (b.marks.every(function (q) { return q.hit; })) {
              b.lockdown = 4000; b.marks = []; this.toast('LOCKDOWN!', '#ffd23f'); this.clearTelegraphs();
            }
            break;
          }
        }
        if (!hitPos) {
          for (var pi = 0; pi < b.parts.length; pi++) {
            var pt = b.parts[pi];
            var px = b.x + Math.cos(pt.a + b.facing) * pt.d, py = b.y + Math.sin(pt.a + b.facing) * pt.d;
            if (Math.hypot(pr.x - px, pr.y - py) < pt.r + 12) { hitPos = { x: px, y: py }; break; }
          }
        }
        if (!hitPos && Math.hypot(pr.x - b.x, pr.y - b.y) < b.r) hitPos = { x: pr.x, y: pr.y };
        if (hitPos) {
          var wpHit = false;
          b.parts.forEach(function (pt) {
            var px2 = b.x + Math.cos(pt.a + b.facing) * pt.d, py2 = b.y + Math.sin(pt.a + b.facing) * pt.d;
            if (pt.weak && Math.hypot(hitPos.x - px2, hitPos.y - py2) < pt.r + 12) wpHit = true;
          });
          var opt = {};
          // Nạp đầy + trúng WEAK -> mũi tên trắng cắm lại gây sát thương theo thời gian.
          if (pr.full && wpHit) { opt.dot = { dps: W.snipeDotDps, ms: W.snipeDotMs }; this.toast('MŨI TÊN TRẮNG', '#e8f2ff'); }
          this.dealToBoss(d, hitPos.x, hitPos.y, opt);
          pr.hitSet.push('boss'); hitSomething = true;
        }
      }
      this.mobs.forEach(function (m) {
        if (m.dead || pr.hitSet.indexOf(m) >= 0) return;
        if (Math.hypot(pr.x - m.x, pr.y - m.y) < m.r + 8) { self.dealToMob(m, d, {}); pr.hitSet.push(m); hitSomething = true; }
      });
      if (hitSomething && !pr.pierce) this.projs.splice(i, 1);
    }
  };

  /* ---------------------------------------------------------- HIỆU ỨNG -- */
  Battle.prototype.number = function (x, y, v, kind) {
    this.msgs.push({ x: x, y: y, v: v, kind: kind, t: 0, dx: (Math.random() - 0.5) * 24 });
  };
  Battle.prototype.toast = function (txt, col) {
    if (this.cb.onToast) this.cb.onToast(txt, col);
  };
  Battle.prototype.puff = function (x, y, col) {
    this.fx.push({ k: 'puff', x: x, y: y, t: 0, ms: 420, col: col || '#ffffff' });
  };

  /* ============================================================== VẼ ==== */
  Battle.prototype.render = function () {
    var ctx = this.ctx, p = this.player;
    var camX = clamp(p.x - W / 2, 0, Math.max(0, this.wW - W));
    var camY = clamp(p.y - H * 0.58, 0, Math.max(0, this.wH - H));
    if (this.wW < W) camX = (this.wW - W) / 2;
    this.camX = camX; this.camY = camY;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    ctx.translate(-camX, -camY);

    this.drawGround();
    this.drawDecor();
    // báo đỏ vẽ DƯỚI nhân vật để không che
    this.drawTelegraphs();
    if (this.mode === 'field') this.drawFieldStuff();

    var ents = [];
    this.mobs.forEach(function (m) { if (!m.dead) ents.push({ y: m.y, d: m, k: 'mob' }); });
    this.allies.forEach(function (a) { ents.push({ y: a.y, d: a, k: 'ally' }); });
    if (this.boss && this.boss.hp > 0) ents.push({ y: this.boss.y, d: this.boss, k: 'boss' });
    ents.push({ y: p.y, d: p, k: 'player' });
    ents.sort(function (a, b) { return a.y - b.y; });
    for (var i = 0; i < ents.length; i++) {
      var e = ents[i];
      if (e.k === 'mob') this.drawMob(e.d);
      else if (e.k === 'ally') this.drawAlly(e.d);
      else if (e.k === 'boss') this.drawBoss(e.d);
      else this.drawPlayer(e.d);
    }
    this.drawProjectiles();
    this.drawFx();
    this.drawNumbers();
    ctx.restore();

    // Punicon vẽ ở toạ độ MÀN HÌNH, không theo camera.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawAimOverlay();
    this.puni.draw(ctx);
  };

  var BG = {
    grass:  ['#3f6b3a', '#4a7a42', '#365e32'],
    desert: ['#8a7147', '#9a8054', '#7a633e'],
    jungle: ['#2f5c3d', '#3a6d47', '#274d34'],
    snow:   ['#8fa8b8', '#a3bccc', '#7d94a3'],
    ruins:  ['#5a5a62', '#67676f', '#4e4e56']
  };

  Battle.prototype.drawGround = function () {
    var ctx = this.ctx, c = BG[this.bg] || BG.grass;
    ctx.fillStyle = c[0];
    ctx.fillRect(0, 0, this.wW, this.wH);
    // ô lát mờ để mắt bắt được chuyển động — bản gốc là 3D, ở đây thay bằng lưới
    ctx.fillStyle = c[1]; ctx.globalAlpha = 0.35;
    for (var y = 0; y < this.wH; y += 120) {
      for (var x = ((y / 120) % 2) * 60; x < this.wW; x += 120) ctx.fillRect(x, y, 60, 60);
    }
    ctx.globalAlpha = 1;
    // viền sân
    ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, this.wW - 8, this.wH - 8);
  };

  Battle.prototype.drawDecor = function () {
    var ctx = this.ctx, c = BG[this.bg] || BG.grass;
    this.decor.forEach(function (d) {
      ctx.save(); ctx.translate(d.x, d.y);
      ctx.fillStyle = 'rgba(0,0,0,.22)';
      ctx.beginPath(); ctx.ellipse(0, d.r * 0.32, d.r * 0.95, d.r * 0.34, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = c[2];
      if (d.k === 0) { ctx.beginPath(); ctx.arc(0, 0, d.r, 0, TAU); ctx.fill(); }
      else if (d.k === 1) {
        ctx.beginPath();
        for (var i = 0; i < 6; i++) { var a = i / 6 * TAU; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * d.r, Math.sin(a) * d.r * 0.8); }
        ctx.closePath(); ctx.fill();
      } else {
        ctx.fillRect(-d.r * 0.35, -d.r, d.r * 0.7, d.r * 1.6);
        ctx.beginPath(); ctx.arc(0, -d.r, d.r * 0.8, 0, TAU); ctx.fill();
      }
      ctx.restore();
    });
  };

  Battle.prototype.drawFieldStuff = function () {
    var ctx = this.ctx, self = this;
    // cổng
    var po = this.portalOpen;
    ctx.save(); ctx.translate(this.portal.x, this.portal.y);
    ctx.globalAlpha = 0.35 + 0.25 * Math.sin(this.t / 300);
    ctx.fillStyle = po ? '#f2d24b' : '#4a5a6a';
    ctx.beginPath(); ctx.ellipse(0, 0, 46, 26, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = po ? '#fff0a0' : '#7b8b9b'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(0, 0, 46, 26, 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(po ? 'CỔNG MỞ' : 'còn ' + Math.max(0, this.needKills - this.killed) + ' con', 0, -36);
    ctx.restore();

    this.gathers.forEach(function (g) {
      if (g.used) return;
      ctx.save(); ctx.translate(g.x, g.y);
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(0, 8, 16, 6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#7fd07f';
      ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(13, 6); ctx.lineTo(-13, 6); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#d8ffd8'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    });

    this.chests.forEach(function (c) {
      var fade = c.t > 18000 ? (Math.sin(self.t / 90) > 0 ? 0.35 : 1) : 1;
      ctx.save(); ctx.globalAlpha = fade; ctx.translate(c.x, c.y);
      var col = c.kind === 'gold' ? ['#f2d24b', '#a8860f'] : c.kind === 'red' ? ['#d05050', '#8a2020'] : ['#e0e6ec', '#98a4b0'];
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(0, 9, 15, 6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = col[1]; ctx.fillRect(-13, -6, 26, 14);
      ctx.fillStyle = col[0]; ctx.fillRect(-13, -13, 26, 8);
      ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1.5; ctx.strokeRect(-13, -13, 26, 21);
      ctx.restore();
    });
  };

  Battle.prototype.drawTelegraphs = function () {
    var ctx = this.ctx, self = this;
    this.telegraphs.forEach(function (t) {
      var pre = t.t < t.windup;
      var k = pre ? t.t / t.windup : 1;
      ctx.save();
      // Vùng càng lớn thì tô càng nhạt: một cú Sóng Xung bán kính 230px tô đậm sẽ
      // nhuộm đỏ cả màn hình và che mất chính con boss.
      var area = (t.r || t.range || 120);
      var fade = clamp(120 / area, 0.35, 1);
      ctx.globalAlpha = (pre ? (0.13 + 0.22 * k) : 0.40) * fade;
      var col = t.hostile ? '#ff3b30' : (t.k === 'trap' ? '#a06fe0' : '#ffd23f');
      ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 3;
      if (t.k === 'circle' || t.k === 'ring' || t.k === 'trap') {
        ctx.beginPath(); ctx.ellipse(t.x, t.y, t.r, t.r * 0.72, 0, 0, TAU);
        ctx.fill(); ctx.globalAlpha = 0.85; ctx.stroke();
        if (pre) {   // vòng thu nhỏ báo thời điểm nổ
          ctx.globalAlpha = 0.9; ctx.lineWidth = 4; ctx.beginPath();
          ctx.ellipse(t.x, t.y, t.r * (1 - k), t.r * 0.72 * (1 - k), 0, 0, TAU); ctx.stroke();
        }
      } else if (t.k === 'cone') {
        ctx.beginPath(); ctx.moveTo(t.x, t.y);
        ctx.arc(t.x, t.y, t.range, t.a - t.arc / 2, t.a + t.arc / 2);
        ctx.closePath(); ctx.fill(); ctx.globalAlpha = 0.9; ctx.stroke();
      } else if (t.k === 'line') {
        ctx.translate(t.x, t.y); ctx.rotate(t.a);
        ctx.fillRect(0, -t.w / 2, t.range, t.w);
        ctx.globalAlpha = 0.9; ctx.strokeRect(0, -t.w / 2, t.range, t.w);
      }
      ctx.restore();
    });
  };

  /* -- Nhân vật vẽ bằng vài hình khối: thân, đầu, và vũ khí theo hướng quay -- */
  // Bốn màu mức nạp là quy ước của Punicon từ White Cat (Overcharge/Combo Charge):
  // trắng -> vàng -> lục -> đỏ, vẽ thành VÒNG DƯỚI CHÂN nhân vật, không phải thanh
  // ở rìa màn hình. Mắt liếc xuống chân là biết đã nạp tới đâu mà không rời mục tiêu.
  var CHARGE_COL = ['#ffffff', '#ffd23f', '#8fd14f', '#ff3b30'];
  Battle.prototype.chargeLevel = function () {
    var p = this.player, W = this.W, full = 0;
    if (p.state === 'charge' && W.special === 'cleave') full = W.chargeMs;
    else if (p.state === 'aim' && W.special === 'snipe') full = W.snipeChargeMs;
    else if (p.state === 'charge' && W.special === 'ranbu') full = W.ranbuWindupMs;
    else if (p.state === 'aim' && W.special === 'lunge') return p.aimD;
    else return -1;
    return clamp(p.charge / full, 0, 1);
  };

  Battle.prototype.drawPlayer = function (p) {
    var ctx = this.ctx;
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(0, 10, 15, 6, 0, 0, TAU); ctx.fill();

    // vòng mức nạp dưới chân
    var ck = this.chargeLevel();
    if (ck >= 0) {
      var lvl = ck >= 0.999 ? 3 : ck >= 0.66 ? 2 : ck >= 0.33 ? 1 : 0;
      ctx.save();
      ctx.strokeStyle = CHARGE_COL[lvl];
      ctx.lineWidth = 3 + lvl;
      ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.ellipse(0, 10, 24, 9.5, 0, -Math.PI / 2, -Math.PI / 2 + TAU * ck); ctx.stroke();
      if (lvl === 3) {
        ctx.globalAlpha = 0.35 + 0.35 * Math.sin(this.t / 70);
        ctx.beginPath(); ctx.ellipse(0, 10, 30, 12, 0, 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }
    if (p.down) {
      ctx.rotate(1.35);
      ctx.fillStyle = '#7b5a4a'; ctx.fillRect(-13, -6, 26, 12);
      ctx.restore();
      // vòng cứu
      ctx.save(); ctx.translate(p.x, p.y);
      ctx.strokeStyle = '#7fd07f'; ctx.lineWidth = 3; ctx.globalAlpha = 0.5 + 0.4 * Math.sin(this.t / 200);
      ctx.beginPath(); ctx.ellipse(0, 6, G.BAL.reviveRadius, G.BAL.reviveRadius * 0.55, 0, 0, TAU); ctx.stroke();
      ctx.restore();
      return;
    }
    if (p.iframe > 0) ctx.globalAlpha = 0.5 + 0.5 * Math.sin(this.t / 50);
    // khiên chắn của Support Magi
    if (p.shield > 0) {
      ctx.strokeStyle = '#7fd4ff'; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.arc(0, -4, 26, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
    }
    if (p.overdrive > 0) {
      ctx.strokeStyle = '#ff7a3c'; ctx.lineWidth = 2; ctx.globalAlpha = 0.55 + 0.3 * Math.sin(this.t / 90);
      ctx.beginPath(); ctx.arc(0, -4, 30, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
    }
    var lean = (p.state === 'dodge') ? Math.sin(p.stateT / p.stateDur * Math.PI) * 1.1 : 0;
    ctx.rotate(lean);
    // thân
    ctx.fillStyle = '#3b6ea5'; ctx.beginPath(); ctx.ellipse(0, 0, 10, 13, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2a4f78'; ctx.fillRect(-9, 2, 18, 8);
    // đầu
    var skin = ['#f0d0b0', '#e8c098', '#d8a878', '#c08858', '#9a6a42', '#7a5030', '#5c3a22', '#f8e0c8'][this.s.skin || 2];
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(0, -12, 8, 0, TAU); ctx.fill();
    ctx.fillStyle = ['#2a2a2a', '#6a4a2a', '#c8a850', '#c04040', '#4060c0', '#40a060', '#a050c0', '#e8e8e8',
                     '#f08040', '#40c0c0', '#8a5a3a', '#d8d040'][this.s.hairColor || 0];
    ctx.beginPath(); ctx.arc(0, -14, 8.4, Math.PI, TAU); ctx.fill();
    // vũ khí
    ctx.rotate(p.facing + Math.PI / 2);
    this.drawWeapon(ctx, p);
    ctx.restore();

    // Dấu "!!" — lời mời CHẠM để phản đòn. Ngôn ngữ chung của Punicon: hễ thấy "!!"
    // trên đầu là bấm ngay, bất kể đang cầm vũ khí nào.
    if (p.counterUntil > this.t) {
      var left = (p.counterUntil - this.t) / 900;
      ctx.save();
      ctx.translate(p.x, p.y - 44 - Math.sin(this.t / 90) * 3);
      ctx.font = 'bold 26px system-ui'; ctx.textAlign = 'center';
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.9)';
      ctx.strokeText('!!', 0, 0);
      ctx.fillStyle = '#ffd23f'; ctx.fillText('!!', 0, 0);
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(-18, 5, 36, 4);
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(-18, 5, 36 * left, 4);
      ctx.restore();
    }
  };

  Battle.prototype.drawWeapon = function (ctx, p) {
    var c = this.wp ? this.wp.wclass : 'sword';
    var col = G.ELEMENTS[this.wp ? this.wp.el : 'none'].color;
    var swing = 0;
    if (p.state === 'attack' || p.state === 'cleave') swing = Math.sin(clamp(p.stateT / p.stateDur, 0, 1) * Math.PI) * 1.5;
    ctx.save();
    if (c === 'sword') {
      ctx.rotate(-0.5 + swing);
      ctx.fillStyle = '#dfe8f0'; ctx.fillRect(9, -22, 4, 24);
      ctx.fillStyle = col; ctx.fillRect(9, -22, 4, 6);
      ctx.fillStyle = '#8fa3b5'; // khiên
      if (p.state === 'guard') { ctx.fillStyle = p.guardT <= this.W.perfectMs ? '#7fd4ff' : '#b8c8d8'; }
      ctx.beginPath(); ctx.ellipse(-12, -8, 8, 12, 0, 0, TAU); ctx.fill();
    } else if (c === 'great') {
      ctx.rotate(-0.9 + swing * 1.3);
      ctx.fillStyle = '#e8eef4'; ctx.fillRect(6, -40, 9, 42);
      ctx.fillStyle = col; ctx.fillRect(6, -40, 9, 10);
      ctx.fillStyle = '#6a5a4a'; ctx.fillRect(8, 0, 5, 10);
    } else if (c === 'spear') {
      ctx.rotate(-0.3 + swing * 0.7);
      ctx.fillStyle = '#8a6a4a'; ctx.fillRect(9, -44, 3, 52);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(10.5, -56); ctx.lineTo(16, -40); ctx.lineTo(5, -40); ctx.closePath(); ctx.fill();
    } else if (c === 'dual') {
      ctx.rotate(-0.4 + swing);
      ctx.fillStyle = '#e0e8f0'; ctx.fillRect(10, -18, 3, 20); ctx.fillRect(-13, -18, 3, 20);
      ctx.fillStyle = col; ctx.fillRect(10, -18, 3, 5); ctx.fillRect(-13, -18, 3, 5);
    } else {
      ctx.rotate(-0.2);
      ctx.strokeStyle = '#8a6a4a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(4, -6, 18, -1.1, 1.1); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(4 + 18 * Math.cos(-1.1), -6 + 18 * Math.sin(-1.1));
      ctx.lineTo(4 + 18 * Math.cos(1.1), -6 + 18 * Math.sin(1.1)); ctx.stroke();
    }
    ctx.restore();
  };

  Battle.prototype.drawAlly = function (a) {
    var ctx = this.ctx;
    ctx.save(); ctx.translate(a.x, a.y);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(0, 9, 13, 5, 0, 0, TAU); ctx.fill();
    if (a.down) { ctx.rotate(1.3); ctx.fillStyle = '#6a5a5a'; ctx.fillRect(-12, -5, 24, 10); ctx.restore(); return; }
    ctx.fillStyle = ['#7a4a8a', '#4a7a5a', '#8a6a3a'][this.allies.indexOf(a)] || '#6a6a8a';
    ctx.beginPath(); ctx.ellipse(0, 0, 9, 12, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e8c098'; ctx.beginPath(); ctx.arc(0, -11, 7, 0, TAU); ctx.fill();
    ctx.restore();
    // Biển tên + máu treo trên đầu, giống bản gốc. Lệch cao theo thứ tự đội hình để
    // ba biển không chồng lên nhau khi cả tổ đứng sát nhau đánh cùng một bộ phận.
    ctx.save(); ctx.translate(a.x, a.y - 30 - this.allies.indexOf(a) * 13);
    ctx.font = '9px system-ui'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(-30, -10, 60, 11);
    ctx.fillStyle = '#cfe0f0'; ctx.fillText('[NPC] ' + a.name, 0, -1);
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(-24, 2, 48, 3);
    ctx.fillStyle = '#5fd06a'; ctx.fillRect(-24, 2, 48 * clamp(a.hp / a.maxHp, 0, 1), 3);
    ctx.restore();
  };

  Battle.prototype.drawMob = function (m) {
    var ctx = this.ctx, T = m.T;
    ctx.save(); ctx.translate(m.x, m.y);
    ctx.fillStyle = 'rgba(0,0,0,.32)';
    ctx.beginPath(); ctx.ellipse(0, m.r * 0.55, m.r * 0.95, m.r * 0.34, 0, 0, TAU); ctx.fill();
    var base = m.gold ? '#f2d24b' : G.ELEMENTS[m.el].color;
    ctx.fillStyle = m.flash > 0 ? '#ffffff' : base;
    var r = m.r;
    if (T.shape === 'blob') {
      var sq = 1 + Math.sin(this.t / 220 + m.x) * 0.09;
      ctx.beginPath(); ctx.ellipse(0, 0, r * sq, r / sq, 0, 0, TAU); ctx.fill();
    } else if (T.shape === 'bull') {
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.78, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#f0e8d8';
      ctx.beginPath(); ctx.moveTo(-r * 0.8, -r * 0.5); ctx.lineTo(-r * 1.25, -r * 0.95); ctx.lineTo(-r * 0.55, -r * 0.75); ctx.fill();
      ctx.beginPath(); ctx.moveTo(r * 0.8, -r * 0.5); ctx.lineTo(r * 1.25, -r * 0.95); ctx.lineTo(r * 0.55, -r * 0.75); ctx.fill();
    } else if (T.shape === 'frog') {
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.72, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-r * 0.4, -r * 0.5, r * 0.28, 0, TAU); ctx.arc(r * 0.4, -r * 0.5, r * 0.28, 0, TAU); ctx.fill();
    } else if (T.shape === 'bat') {
      ctx.beginPath(); ctx.arc(0, 0, r * 0.7, 0, TAU); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.quadraticCurveTo(-r * 1.6, -r * 0.7, -r * 1.9, r * 0.3); ctx.quadraticCurveTo(-r, r * 0.2, 0, 0);
      ctx.moveTo(0, 0); ctx.quadraticCurveTo(r * 1.6, -r * 0.7, r * 1.9, r * 0.3); ctx.quadraticCurveTo(r, r * 0.2, 0, 0);
      ctx.fill();
    } else if (T.shape === 'bird') {
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.8, r, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#f0a030';
      ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.5, -r * 1.35); ctx.lineTo(0, -r * 0.7); ctx.fill();
    } else {
      ctx.fillStyle = '#e8dcc0'; ctx.fillRect(-r * 0.28, -r * 0.1, r * 0.56, r);
      ctx.fillStyle = m.flash > 0 ? '#fff' : base;
      ctx.beginPath(); ctx.ellipse(0, -r * 0.2, r, r * 0.62, 0, Math.PI, TAU); ctx.fill();
    }
    if (m.elite) { ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r + 4, 0, TAU); ctx.stroke(); }
    ctx.restore();
    // biển tên + thanh máu xanh trên đầu — đúng như ảnh chụp bản gốc
    if (m.agro || dist(m, this.player) < 300) {
      ctx.save(); ctx.translate(m.x, m.y - m.r - 16);
      ctx.font = '9px system-ui'; ctx.textAlign = 'center';
      var label = m.name + ' Lv.' + m.lv;
      var w = ctx.measureText(label).width + 10;
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(-w / 2, -10, w, 11);
      ctx.fillStyle = m.gold ? '#f2d24b' : '#dfe8f0'; ctx.fillText(label, 0, -1);
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(-22, 2, 44, 3);
      ctx.fillStyle = '#5fd06a'; ctx.fillRect(-22, 2, 44 * clamp(m.hp / m.maxHp, 0, 1), 3);
      ctx.restore();
    }
  };

  /* Thân boss. Hệ toạ độ đã xoay sao cho -y là HƯỚNG BOSS ĐANG QUAY, nên mọi hình
   * đều vẽ "đầu ở trên, đuôi ở dưới" rồi để phép xoay lo phần còn lại.
   * Mỗi hình đều có nét viền tối: nền sân là màu phẳng, không có viền thì con quái
   * chìm vào nền và người chơi không đọc được nó đang quay về hướng nào. */
  Battle.prototype.drawBossBody = function (ctx, b, r) {
    var col = b.flash > 0 ? '#ffffff' : G.ELEMENTS[b.el].color;
    var dark = shade(col, -0.34), light = shade(col, 0.24);
    var bone = '#efe6d2';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.lineWidth = Math.max(2, r * 0.055);
    function P(fn, fill) { ctx.beginPath(); fn(); ctx.fillStyle = fill; ctx.fill(); ctx.stroke(); }
    function ell(x, y, rx, ry, rot, fill) { P(function () { ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU); }, fill); }
    function tri(ax, ay, bx, by, cx, cy, fill) {
      P(function () { ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.closePath(); }, fill);
    }
    function box(x, y, w, h, fill) { P(function () { ctx.rect(x, y, w, h); }, fill); }
    function eyes(y, sp, rr) {
      ctx.fillStyle = '#fff2a0'; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(-sp, y, rr, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(sp, y, rr, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = Math.max(2, r * 0.055);
    }
    var s = b.def.body;

    if (s === 'drake') {
      // cánh trước (vẽ dưới thân)
      P(function () { ctx.moveTo(-r * .35, -r * .1); ctx.quadraticCurveTo(-r * 1.75, -r * .95, -r * 1.55, r * .45);
        ctx.quadraticCurveTo(-r * .95, r * .1, -r * .35, r * .35); ctx.closePath(); }, dark);
      P(function () { ctx.moveTo(r * .35, -r * .1); ctx.quadraticCurveTo(r * 1.75, -r * .95, r * 1.55, r * .45);
        ctx.quadraticCurveTo(r * .95, r * .1, r * .35, r * .35); ctx.closePath(); }, dark);
      tri(0, r * .55, r * .3, r * 1.6, -r * .3, r * 1.6, dark);      // đuôi
      ell(0, r * .05, r * .58, r * .92, 0, col);                      // thân
      ell(0, -r * .55, r * .3, r * .42, 0, light);                    // cổ
      ell(0, -r * 1.02, r * .38, r * .32, 0, col);                    // đầu
      tri(-r * .3, -r * 1.2, -r * .52, -r * 1.72, -r * .05, -r * 1.36, bone);
      tri(r * .3, -r * 1.2, r * .52, -r * 1.72, r * .05, -r * 1.36, bone);
      eyes(-r * 1.06, r * .19, r * .075);
    } else if (s === 'serpent') {
      for (var i = 5; i >= 1; i--) {
        var yy = r * (0.12 + i * 0.36), rr = r * (0.62 - i * 0.085);
        ell(Math.sin(this.t / 420 + i) * r * .18, yy, rr, rr * .9, 0, i % 2 ? dark : col);
      }
      ell(0, -r * .1, r * .62, r * .78, 0, col);
      ell(0, -r * .82, r * .44, r * .38, 0, light);
      tri(-r * .42, -r * .95, -r * .78, -r * 1.5, -r * .12, -r * 1.1, bone);
      tri(r * .42, -r * .95, r * .78, -r * 1.5, r * .12, -r * 1.1, bone);
      eyes(-r * .88, r * .2, r * .08);
    } else if (s === 'golem' || s === 'knight') {
      box(-r * 1.02, -r * .55, r * .38, r * 1.15, dark);              // tay trái
      box(r * .64, -r * .55, r * .38, r * 1.15, dark);                // tay phải
      box(-r * .62, -r * .62, r * 1.24, r * 1.45, col);               // thân
      box(-r * .34, -r * 1.12, r * .68, r * .55, light);              // đầu
      if (s === 'golem') { ell(0, -r * .05, r * .24, r * .24, 0, '#fff2a0'); }
      else { box(-r * .16, -r * 1.02, r * .32, r * .12, '#2a2a2a'); box(r * .96, -r * 1.4, r * .2, r * 2.2, bone); }
      eyes(-r * .92, r * .16, r * .07);
    } else if (s === 'bull' || s === 'beast' || s === 'ape') {
      ell(-r * .42, r * .62, r * .2, r * .3, 0, dark); ell(r * .42, r * .62, r * .2, r * .3, 0, dark);
      ell(0, r * .12, r * .82, r * .74, 0, col);                      // thân
      ell(0, -r * .68, r * .46, r * .4, 0, light);                    // đầu
      if (s === 'ape') { ell(-r * .62, -r * .72, r * .2, r * .22, 0, dark); ell(r * .62, -r * .72, r * .2, r * .22, 0, dark); }
      else {
        tri(-r * .38, -r * .9, -r * .95, -r * 1.4, -r * .12, -r * 1.02, bone);
        tri(r * .38, -r * .9, r * .95, -r * 1.4, r * .12, -r * 1.02, bone);
      }
      eyes(-r * .72, r * .2, r * .085);
    } else if (s === 'bird' || s === 'phoenix' || s === 'angel') {
      P(function () { ctx.moveTo(-r * .3, -r * .2); ctx.quadraticCurveTo(-r * 1.5, -r * .85, -r * 1.7, r * .05);
        ctx.quadraticCurveTo(-r * 1.1, r * .3, -r * .28, r * .3); ctx.closePath(); }, dark);
      P(function () { ctx.moveTo(r * .3, -r * .2); ctx.quadraticCurveTo(r * 1.5, -r * .85, r * 1.7, r * .05);
        ctx.quadraticCurveTo(r * 1.1, r * .3, r * .28, r * .3); ctx.closePath(); }, dark);
      for (var f = -1; f <= 1; f++) tri(f * r * .2, r * .5, f * r * .34 + r * .06, r * 1.5, f * r * .34 - r * .06, r * 1.5, light);
      ell(0, 0, r * .48, r * .82, 0, col);
      ell(0, -r * .78, r * .3, r * .28, 0, light);
      tri(0, -r * .82, r * .12, -r * 1.28, -r * .12, -r * 1.28, '#f0a030');
      eyes(-r * .82, r * .15, r * .07);
    } else if (s === 'plant') {
      for (var pI = 0; pI < 8; pI++) {
        var pa = pI / 8 * TAU;
        ell(Math.cos(pa) * r * .78, Math.sin(pa) * r * .78, r * .38, r * .2, pa, pI % 2 ? dark : light);
      }
      ell(0, 0, r * .52, r * .52, 0, col);
      ell(0, 0, r * .24, r * .24, 0, '#fff2a0');
    } else if (s === 'samurai' || s === 'demon' || s === 'lich' || s === 'anubis') {
      if (s === 'demon') {
        P(function () { ctx.moveTo(-r * .3, -r * .2); ctx.quadraticCurveTo(-r * 1.4, -r * .9, -r * 1.5, r * .2);
          ctx.quadraticCurveTo(-r * .9, r * .1, -r * .3, r * .2); ctx.closePath(); }, dark);
        P(function () { ctx.moveTo(r * .3, -r * .2); ctx.quadraticCurveTo(r * 1.4, -r * .9, r * 1.5, r * .2);
          ctx.quadraticCurveTo(r * .9, r * .1, r * .3, r * .2); ctx.closePath(); }, dark);
      }
      box(-r * .48, -r * .55, r * .96, r * 1.35, col);                // thân
      box(-r * .62, r * .8, r * .5, r * .5, dark); box(r * .12, r * .8, r * .5, r * .5, dark);
      ell(0, -r * .82, r * .34, r * .34, 0, light);                   // đầu
      if (s === 'lich' || s === 'anubis') {
        box(r * .58, -r * 1.5, r * .12, r * 2.3, bone);
        ell(r * .64, -r * 1.55, r * .26, r * .18, 0, col);
      } else {
        box(r * .55, -r * 1.35, r * .14, r * 1.9, bone);
      }
      tri(-r * .34, -r * 1.0, -r * .56, -r * 1.5, -r * .1, -r * 1.12, bone);
      tri(r * .34, -r * 1.0, r * .56, -r * 1.5, r * .1, -r * 1.12, bone);
      eyes(-r * .84, r * .13, r * .065);
    } else if (s === 'turtle') {
      for (var lI = 0; lI < 4; lI++) {
        var la = (lI < 2 ? -1 : 1) * 0.75 + Math.PI * (lI % 2);
        ell(Math.cos(la) * r * .9, Math.sin(la) * r * .82, r * .26, r * .18, la, dark);
      }
      ell(0, -r * .95, r * .28, r * .24, 0, light);
      ell(0, 0, r * .98, r * .88, 0, col);
      ctx.strokeStyle = dark; ctx.lineWidth = Math.max(3, r * 0.07);
      for (var tI = 1; tI <= 3; tI++) { ctx.beginPath(); ctx.ellipse(0, 0, r * (tI * 0.24), r * (tI * 0.215), 0, 0, TAU); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(0,0,0,.55)';
      eyes(-r * .98, r * .12, r * .06);
    } else if (s === 'shroom') {
      box(-r * .24, -r * .1, r * .48, r * 1.0, '#e8dcc0');
      P(function () { ctx.ellipse(0, -r * .18, r * .98, r * .66, 0, Math.PI, TAU); ctx.closePath(); }, col);
      ctx.fillStyle = light;
      for (var sI = -2; sI <= 2; sI++) { ctx.beginPath(); ctx.arc(sI * r * .3, -r * .42, r * .12, 0, TAU); ctx.fill(); }
    } else if (s === 'frog') {
      ell(-r * .62, r * .5, r * .28, r * .2, -0.5, dark); ell(r * .62, r * .5, r * .28, r * .2, 0.5, dark);
      ell(0, 0, r * .95, r * .74, 0, col);
      ell(-r * .4, -r * .5, r * .26, r * .26, 0, '#fff'); ell(r * .4, -r * .5, r * .26, r * .26, 0, '#fff');
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(-r * .4, -r * .5, r * .12, 0, TAU); ctx.arc(r * .4, -r * .5, r * .12, 0, TAU); ctx.fill();
    } else if (s === 'bat') {
      P(function () { ctx.moveTo(0, 0); ctx.quadraticCurveTo(-r * 1.7, -r * .9, -r * 1.95, r * .25);
        ctx.quadraticCurveTo(-r * 1.1, r * .05, 0, r * .3); ctx.closePath(); }, dark);
      P(function () { ctx.moveTo(0, 0); ctx.quadraticCurveTo(r * 1.7, -r * .9, r * 1.95, r * .25);
        ctx.quadraticCurveTo(r * 1.1, r * .05, 0, r * .3); ctx.closePath(); }, dark);
      ell(0, 0, r * .5, r * .58, 0, col);
      tri(-r * .3, -r * .5, -r * .5, -r * 1.15, -r * .05, -r * .62, light);
      tri(r * .3, -r * .5, r * .5, -r * 1.15, r * .05, -r * .62, light);
      eyes(-r * .18, r * .16, r * .07);
    } else {  // blob, fluff
      var sq = 1 + Math.sin(this.t / 260) * 0.06;
      ell(0, 0, r * sq, r / sq, 0, col);
      ell(0, -r * .2, r * .55, r * .34, 0, light);
      eyes(-r * .12, r * .24, r * .1);
    }
  };

  // Trộn màu về sáng/tối, để mỗi con quái có ba tông từ một màu hệ duy nhất.
  function shade(hex, k) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    var m = k < 0 ? 0 : 255, t = Math.abs(k);
    r = Math.round(r + (m - r) * t); g = Math.round(g + (m - g) * t); b = Math.round(b + (m - b) * t);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  Battle.prototype.drawBoss = function (b) {
    var ctx = this.ctx, r = b.r;
    ctx.save(); ctx.translate(b.x, b.y);
    ctx.fillStyle = 'rgba(0,0,0,.42)';
    ctx.beginPath(); ctx.ellipse(0, r * 0.5, r * 1.05, r * 0.4, 0, 0, TAU); ctx.fill();
    ctx.save();
    ctx.rotate(b.facing + Math.PI / 2);
    if (b.down > 0) ctx.rotate(0.9);
    this.drawBossBody(ctx, b, r);
    ctx.restore();

    // Bộ phận + điểm yếu — vẽ SAU thân để luôn nhìn thấy.
    var self = this;
    b.parts.forEach(function (pt) {
      var px = Math.cos(pt.a + b.facing) * pt.d, py = Math.sin(pt.a + b.facing) * pt.d;
      ctx.save(); ctx.translate(px, py);
      if (pt.broken) {
        ctx.strokeStyle = 'rgba(120,120,120,.75)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, pt.r, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-pt.r * .7, -pt.r * .7); ctx.lineTo(pt.r * .7, pt.r * .7);
        ctx.moveTo(pt.r * .7, -pt.r * .7); ctx.lineTo(-pt.r * .7, pt.r * .7); ctx.stroke();
      } else {
        var on = pt.weak && (b.wpOn || b.down > 0);
        ctx.globalAlpha = on ? 0.9 : 0.5;
        ctx.strokeStyle = on ? '#ffd23f' : 'rgba(255,255,255,.6)';
        ctx.lineWidth = on ? 3 : 1.5;
        ctx.beginPath(); ctx.arc(0, 0, pt.r * (on ? 1 + 0.08 * Math.sin(self.t / 120) : 1), 0, TAU); ctx.stroke();
        // thanh máu bộ phận
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(-pt.r, pt.r + 3, pt.r * 2, 3);
        ctx.fillStyle = on ? '#ffd23f' : '#e08a3c';
        ctx.fillRect(-pt.r, pt.r + 3, pt.r * 2 * clamp(pt.hp / pt.maxHp, 0, 1), 3);
        if (on) { ctx.globalAlpha = 1; ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center'; ctx.fillText('WEAK', 0, -pt.r - 5); }
      }
      ctx.restore();
    });
    // điểm ngắm của cung Heat
    b.marks.forEach(function (mk) {
      if (mk.hit) return;
      var mx = Math.cos(mk.a + b.facing) * mk.d, my = Math.sin(mk.a + b.facing) * mk.d;
      ctx.save(); ctx.translate(mx, my); ctx.strokeStyle = '#ff5a5a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(16, 0); ctx.moveTo(0, -16); ctx.lineTo(0, 16); ctx.stroke();
      ctx.restore();
    });
    if (b.down > 0) {
      ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 16px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('GỤC!', 0, -r - 22);
    }
    ctx.restore();
  };

  Battle.prototype.drawProjectiles = function () {
    var ctx = this.ctx;
    this.projs.forEach(function (p) {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
      ctx.strokeStyle = p.full ? '#ffffff' : '#e8d8a0'; ctx.lineWidth = p.full ? 3 : 2;
      ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(10, 0); ctx.stroke();
      ctx.fillStyle = p.full ? '#ffffff' : '#e8d8a0';
      ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(6, -4); ctx.lineTo(6, 4); ctx.fill();
      ctx.restore();
    });
  };

  Battle.prototype.drawFx = function () {
    var ctx = this.ctx;
    this.fx.forEach(function (f) {
      var k = f.t / f.ms;
      ctx.save(); ctx.globalAlpha = 1 - k;
      if (f.k === 'slash') {
        ctx.translate(f.x, f.y);
        ctx.strokeStyle = f.col; ctx.lineWidth = f.big ? 10 : 5; ctx.lineCap = 'round';
        var a0 = f.a - f.arc / 2 + f.arc * k, a1 = a0 + f.arc * 0.5;
        ctx.beginPath(); ctx.arc(0, 0, f.r * 0.85, a0, a1); ctx.stroke();
      } else if (f.k === 'ring' || f.k === 'magi') {
        ctx.strokeStyle = f.col || '#ffffff'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r * (0.5 + k * 0.8), f.r * 0.72 * (0.5 + k * 0.8), 0, 0, TAU); ctx.stroke();
        if (f.k === 'magi') { ctx.globalAlpha = (1 - k) * 0.3; ctx.fillStyle = f.col; ctx.fill(); }
      } else if (f.k === 'puff') {
        ctx.fillStyle = f.col;
        for (var i = 0; i < 6; i++) {
          var a = i / 6 * TAU;
          ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * 30 * k, f.y + Math.sin(a) * 30 * k, 6 * (1 - k), 0, TAU); ctx.fill();
        }
      } else if (f.k === 'heal' || f.k === 'buff') {
        ctx.strokeStyle = f.k === 'heal' ? '#7fd07f' : '#7fd4ff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r * (0.3 + k), f.r * 0.6 * (0.3 + k), 0, 0, TAU); ctx.stroke();
      } else if (f.k === 'dust') {
        ctx.fillStyle = 'rgba(220,220,200,.6)';
        ctx.beginPath(); ctx.ellipse(f.x, f.y + 8, 20 * (0.4 + k), 7 * (0.4 + k), 0, 0, TAU); ctx.fill();
      } else if (f.k === 'bang') {
        // chớp sáng lúc né trúng đòn, để mắt bắt được rằng cửa sổ phản đòn vừa mở
        ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, 30 + 46 * k, (30 + 46 * k) * 0.6, 0, 0, TAU); ctx.stroke();
      } else if (f.k === 'lunge') {
        ctx.translate(f.x, f.y); ctx.rotate(f.a);
        ctx.fillStyle = 'rgba(255,255,255,.7)';
        ctx.fillRect(-60, -4, 70, 8);
      }
      ctx.restore();
    });
  };

  var NUM_COL = { weak: '#ffd23f', adv: '#ff9a4a', dis: '#8fa3b5', norm: '#ffffff', take: '#ff5a5a', heal: '#7fd07f', shield: '#7fd4ff', dot: '#c8a0ff' };
  Battle.prototype.drawNumbers = function () {
    var ctx = this.ctx;
    this.msgs.forEach(function (m) {
      var k = m.t / 900;
      ctx.save();
      ctx.globalAlpha = 1 - k * k;
      ctx.translate(m.x + m.dx, m.y - 34 * k - 8);
      ctx.font = 'bold ' + (m.kind === 'weak' ? 22 : 17) + 'px system-ui';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)';
      ctx.strokeText(m.v, 0, 0);
      ctx.fillStyle = NUM_COL[m.kind] || '#fff';
      ctx.fillText(m.v, 0, 0);
      if (m.kind === 'weak') {
        ctx.font = 'bold 10px system-ui'; ctx.strokeText('WEAK', 0, 12); ctx.fillText('WEAK', 0, 12);
      }
      ctx.restore();
    });
  };

  /* Vòng ngắm của cung / thương-heat + thanh nạp của đại kiếm — vẽ ở lớp thế giới
   * nhưng cần camera, nên gọi trước khi restore ở render(). Ở đây vẽ lại theo
   * camera thủ công để giữ mọi thứ ngắm gọn trong một hàm. */
  Battle.prototype.drawAimOverlay = function () {
    var ctx = this.ctx, p = this.player;
    var ox = -this.camX, oy = -this.camY;
    if (p.state === 'aim') {
      ctx.save(); ctx.translate(ox, oy);
      ctx.strokeStyle = p.aimKind === 'snipe' ? '#ff5a5a' : '#ffd23f'; ctx.lineWidth = 2;
      if (p.aimKind === 'lunge') {
        ctx.setLineDash([8, 6]);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.aimX, p.aimY); ctx.stroke();
        ctx.setLineDash([]);
        // độ căng chỉ hướng = mức bonus sát thương hệ (Normal spear, tới ×4)
        ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center';
        if (this.wp.wtype === 'normal') ctx.fillText('HỆ ×' + (1 + 3 * p.aimD).toFixed(1), p.aimX, p.aimY - 14);
      } else {
        ctx.beginPath(); ctx.arc(p.aimX, p.aimY, 22, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p.aimX - 30, p.aimY); ctx.lineTo(p.aimX + 30, p.aimY);
        ctx.moveTo(p.aimX, p.aimY - 30); ctx.lineTo(p.aimX, p.aimY + 30); ctx.stroke();
        ctx.setLineDash([4, 5]); ctx.globalAlpha = 0.4;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.aimKind === 'snipe' ? this.W.snipeAimRadius : 220, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }
    // Thanh nạp nổi ngay trên đầu nhân vật (đại kiếm / cung).
    if (p.state === 'charge' || p.state === 'aim') {
      var W2 = this.W, full = 0, k = 0;
      if (W2.special === 'cleave') { full = W2.chargeMs; k = clamp(p.charge / full, 0, 1); }
      else if (W2.special === 'snipe') { full = W2.snipeChargeMs; k = clamp(p.charge / full, 0, 1); }
      else if (W2.special === 'ranbu') { full = W2.ranbuWindupMs; k = clamp(p.charge / full, 0, 1); }
      if (full) {
        var bx = p.x + ox - 28, by = p.y + oy - 44;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(bx, by, 56, 7);
        ctx.fillStyle = k >= 1 ? '#ffd23f' : '#e8f2ff'; ctx.fillRect(bx + 1, by + 1, 54 * k, 5);
        if (k >= 1) { ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 1.5; ctx.strokeRect(bx - 1, by - 1, 58, 9); }
        ctx.restore();
      }
    }
  };

  G.Battle = Battle;
  G.VIEW = { W: W, H: H };
})(window.DP = window.DP || {});
