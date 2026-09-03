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

  /* CAMERA GẦN LẠI. Trước đây khung nhìn là 1:1 với sân, tức nhân vật cao 34px
   * trên một khung 540 bề ngang — chiếm 6% chiều rộng. Survivor.io giữ nhân vật
   * quanh 11–13% bề ngang màn hình, và đó là lý do đọc được cái gì đang xảy ra
   * quanh chân mình mà không phải căng mắt.
   *
   * Đổi bằng ZOOM chứ không bằng cách phóng to sprite: phóng sprite thì tầm bắn,
   * tầm quái và mọi con số va chạm đứng nguyên trong khi ẢNH to ra — hai thứ lệch
   * nhau và game trông sai. Zoom camera thì mọi thứ trong sân to lên cùng một hệ
   * số, không có gì lệch pha; cái mất là khung nhìn hẹp lại, và đó là cái phải
   * bù bằng việc kéo camera nhìn xa hơn về phía trước theo hướng đang ngắm. */
  var ZOOM = 1.30;

  function ang(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }

  /* ====================================================================== */
  function Battle(cv, save, opts, cb) {
    this.cv = cv; this.ctx = cv.getContext('2d');
    this.s = save; this.o = opts || {}; this.cb = cb || {};
    this.mode = 'stage';   // một ải: chặng quái rồi tới chặng boss
    this.running = false;
    this.t = 0; this.last = 0;
    this.msgs = [];       // số sát thương bay lên
    this.fx = [];         // hiệu ứng
    this.chests = [];
    this.projs = [];
    this.telegraphs = [];
    this.shake = 0;
    this.freeze = 0;      // hitstop: mili-giây còn phải đóng băng mô phỏng
    this.paused = false;
    this.result = null;

    this.stats = G.buildStats(save);
    this.setupWorld();
    this.setupPlayer();
    this.setupPunicon();
  }

  /* --------------------------------------------------------------- THẾ GIỚI */
  /* MỘT ẢI = hai chặng liền nhau trong cùng một trận:
   *   chặng 'mobs' — dọn đủ số quái thường mà ải yêu cầu
   *   chặng 'boss' — Behemoth cuối ải xuất hiện, hạ nó là phá ải
   * Vào MỘT MÌNH. Không có đồng đội NPC, nên không có ai tới cứu khi bạn ngã —
   * bù lại người chơi có sẵn mấy lượt tự đứng dậy (xem playerDown).
   */
  Battle.prototype.setupWorld = function () {
    var st = G.stageById(this.o.stageId) || G.STAGES[0];
    this.stage = st;
    var area = G.areaById(st.area) || G.AREAS[0];
    this.area = area;
    this.map = { n: st.sub, lv: st.lv, tribes: st.tribes, kills: st.kills };
    this.bg = area.bg;
    this.wW = G.ARENA.w; this.wH = G.ARENA.h;

    this.decor = [];
    for (var i = 0; i < 34; i++) {
      this.decor.push({
        x: Math.random() * this.wW, y: Math.random() * this.wH,
        r: 6 + Math.random() * 22, k: (Math.random() * 3) | 0,
        // p chọn MÓN, flip lật ngang. Chọn ở đây chứ không tra atlas ngay, vì
        // lúc dựng trận ảnh có thể chưa nạp xong; drawDecor tra sau, ổn định.
        p: Math.random(), flip: Math.random() < 0.5
      });
    }
    this.mobs = [];
    this.gathers = [];
    this.killed = 0;
    this.needKills = st.kills;
    this.phase = 'mobs';
    this.boss = null;
    this.timeLeft = G.BAL.questMs;
    // Đồng đội NPC đã bỏ — ải là solo. Mảng để rỗng vì vài vòng lặp khác còn duyệt nó.
    this.allies = [];

    for (var g = 0; g < 3; g++) {
      this.gathers.push({ x: 140 + Math.random() * (this.wW - 280), y: 240 + Math.random() * (this.wH - 420), used: false });
    }
    this.spawnWave(G.ARENA.wave);
  };

  /* Dọn đủ quái thì Behemoth cuối ải ra. Quái còn sót bị dọn sạch để sân trống hẳn —
   * trận boss phải đọc được, không lẫn với một đám quái lẻ chạy vòng vòng. */
  Battle.prototype.startBossPhase = function () {
    if (this.phase !== 'mobs') return;
    this.phase = 'boss';
    var self = this;
    this.mobs.forEach(function (m) { if (!m.dead) { m.dead = true; m.hp = 0; self.puff(m.x, m.y, '#cfd8e2'); } });
    this.mobs = [];
    this.spawnBehemoth(this.stage.boss, this.stage.bossLv);
    var b = this.boss;
    b.x = this.wW / 2; b.y = this.player.y - 340;
    if (b.y < 140) b.y = 140;
    this.shake = 18;
    this.puff(b.x, b.y, G.ELEMENTS[b.el].color);
    this.toast('BEHEMOTH XUẤT HIỆN — ' + b.n, '#e33b30');
    if (this.cb.onPhase) this.cb.onPhase('boss');
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
    var B = G.BAL;
    var hp = (B.mobHpBase + lv * B.mobHpPerLv) * T.hp
           * (elite ? B.eliteHpMul : 1) * (gold ? B.goldHpMul : 1);
    var px, py, tries = 0;
    do {
      px = 60 + Math.random() * (this.wW - 120);
      py = 120 + Math.random() * (this.wH - 240);
      tries++;
    } while (this.player && dist({ x: px, y: py }, this.player) < 170 && tries < 20);
    return {
      tribe: tribe, T: T, el: v.el, elite: elite, gold: gold, lv: lv,
      name: (gold ? 'Gold ' : v.pre) + T.en + (elite ? 'ron' : ''),
      x: px, y: py, hp: hp, maxHp: hp, r: T.r * (elite ? 1.5 : 1) * (gold ? 1.3 : 1),
      // Công quái tăng CHẬM HƠN HẲN máu quái. Risk of Rain 2 làm đúng thế — máu
      // boss theo coeff/2,5 còn sát thương boss theo coeff/30, chậm hơn mười hai
      // lần. Lý do: quái sống lâu gấp bốn năm lần thì nó cũng BẮN vào người chơi
      // lâu gấp bốn năm lần, và ngân sách sát thương nhận vào tự nhân lên theo.
      atk: (B.mobAtkBase + lv * B.mobAtkPerLv) * T.atk * (elite ? 1.6 : 1),
      // Thẻ đánh: con nào không giữ thẻ thì vẫn đi lại, vẫn doạ, nhưng không ra
      // đòn. Chuẩn ngành, và nó là cái giữ cho màn dọc đọc được.
      token: false, wantToken: 0,
      spd: T.spd * (elite ? 0.9 : 1), facing: 0,
      cd: 600 + Math.random() * 900, hitT: 0, flash: 0, status: {}, agro: 0,
      // --- lớp phản ứng khi trúng đòn ---
      poise: (T.poise || 30) * (elite ? 2.2 : 1),
      poiseMax: (T.poise || 30) * (elite ? 2.2 : 1),
      stagger: 0,                 // loạng choạng: không đánh trả được
      kbX: 0, kbY: 0,             // vận tốc văng, tắt dần
      z: 0, vz: 0,                // độ cao khi bị hất tung
      squash: 0,                  // bẹp người lúc ăn đòn
      // --- AI ---
      ai: T.ai || 'swarm', phase: 'idle', pt: 0, aim: 0
    };
  };

  Battle.prototype.spawnBehemoth = function (id, lv) {
    var b = G.behemothById(id) || G.BEHEMOTHS[0];
    lv = lv || 10;
    /* Máu boss SUY RA TỪ máu quái thường ở cùng cấp, không phải một bảng số tự
     * do. Bản cũ để hai đường cong độc lập (boss 2.400–46.000 trong khi quái
     * thường 46–872) nên chúng lệch nhau ngay từ đầu và không bao giờ gặp lại.
     * Tỉ lệ boss/quái ~40x là con số nhất quán đến bất ngờ giữa các game cùng
     * khổ màn hình: Enter the Gungeon 700/15 = 47x, Soul Knight 480/8 = 60x. */
    var trashHp = G.BAL.mobHpBase + lv * G.BAL.mobHpPerLv;
    var bossHp = trashHp * (G.BAL.bossHpMul[b.rank] || 40);
    var scale = bossHp / b.hp;      // giữ nguyên chênh lệch tương đối trong cùng hạng
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
    // Hệ của giáp thân (rơi về giáp đầu, rồi 'none'): quyết định màu thân nhân vật.
    var eq = G.equipped(this.s);
    var arm = eq.body || eq.head || eq.arm || eq.leg;
    this.bodyEl = arm ? arm.el : 'none';
    this.player = {
      x: this.wW / 2, y: this.wH * 0.86,
      r: 13, facing: -Math.PI / 2,
      hp: st.hp, maxHp: st.hp,
      state: 'idle', stateT: 0, stateDur: 0, hitDone: false,
      combo: 0, comboT: 0,
      dodgeCd: 0, iframe: 0, iframeFromDodge: false, rollHit: false, counterUntil: 0,
      fury: 0,          // hạn của cửa sổ tay nhanh sau khi đỡ chuẩn
      guardT: 0, guardBlocked: false, guardPerfect: false,
      charge: 0, aimX: 0, aimY: 0, aimD: 0,
      heat: 0, soul: 0,
      // kỹ năng vũ khí: hai khe, mỗi khe một đồng hồ hồi chiêu riêng
      skCd: [0, 0], skIdx: -1, skAim: null, sk: null,
      fade: 1, fadeUntil: 0, backstabUntil: 0, armorUntil: 0, chargeDR: 0, z: 0,
      shield: 0, buffs: [],
      status: {}, dot: [],
      wIdx: 0, switchT: 0,
      revives: G.BAL.reviveCount, down: false, downT: 0,
      deaths: 0, usedSkill: false, partsBroken: 0
    };
    this.setWeapon(0, true);
  };

  /* ĐỔI KHE = ĐỔI NGƯỜI.
   *
   * Khe không còn là "cây vũ khí thứ i của tôi" mà là "người thứ i trong đội".
   * Đổi khe là đổi cả: ảnh nhân vật, lớp vũ khí (tức move set), hai kỹ năng, hệ,
   * và chỉ số — vì giáp là của riêng từng người. Tên hàm giữ nguyên `setWeapon`
   * để bot và mấy chỗ gọi cũ không phải sửa; `setHero` là tên đọc đúng nghĩa.
   */
  Battle.prototype.setHero =
  Battle.prototype.setWeapon = function (i, instant) {
    var party = G.party(this.s);
    if (!party.filter(Boolean).length) return;
    i = ((i % 3) + 3) % 3;
    var h = party[i];
    if (!h) { for (var k = 0; k < 3; k++) { if (party[(i + k) % 3]) { i = (i + k) % 3; h = party[i]; break; } } }
    if (!h) return;
    var g = G.equippedOf(this.s, h).weapon;
    if (!g) {
      // Người không cầm gì thì vẫn ra trận được, nhưng đánh bằng lớp của mình với
      // một cây trần — thà vậy còn hơn đứng im không đánh được.
      var d = G.heroDef(h) || {};
      g = { uid: 'bare_' + h.uid, kind: 'weapon', wclass: d.wclass || 'sword',
            wtype: 'normal', el: d.el || 'none', rank: 'B', lv: 1, evo: 0, lb: 0,
            name: 'Tay không', abilities: [] };
    }
    this.player.wIdx = i;
    this.hero = h;
    this.heroDef = G.heroDef(h);
    this.stats = G.buildStats(this.s, h);
    this.wp = G.weaponProfile(this.s, g, { hero: h });
    this.W = G.weaponOf(this.wp.wclass);
    // Mỗi người một thanh máu riêng (giáp là của riêng họ, hạng cũng khác nhau).
    // Đổi người thì giữ nguyên TỈ LỆ máu đang còn — không thì đổi qua đổi lại là
    // một cách hồi máu miễn phí, mà đổi vào lúc sắp chết cũng không cứu được.
    if (this.player && this.player.maxHp) {
      var ratio = clamp(this.player.hp / this.player.maxHp, 0, 1);
      this.player.maxHp = this.stats.hp;
      this.player.hp = Math.max(1, Math.round(this.stats.hp * ratio));
    }
    // Dual Blades Heat: thanh Heat ĐẦY SẴN khi vào trận (đúng wiki).
    if (this.wp.wclass === 'dual' && this.wp.wtype === 'heat') this.player.heat = 100;
    // Đổi vũ khí giữa trận có độ trễ, đứng yên và hở sườn.
    if (!instant) { this.player.switchT = 420; this.player.state = 'switch'; this.player.stateT = 0; this.player.stateDur = 420; }
    if (this.cb.onWeapon) this.cb.onWeapon(this.wp, i, h);
  };

  /* ------------------------------------------------------------- PUNICON -- */
  Battle.prototype.setupPunicon = function () {
    var self = this, p = this.player;
    this.puni = new G.Punicon(this.cv, {}, {
      onTap: function () { self.tryAttack(); },
      onFlick: function (dx, dy) { self.tryDodge(dx, dy); },
      // return là BẮT BUỘC: Punicon dựa vào giá trị này để biết đòn đặc thù có được
      // nhận hay không. Nuốt mất giá trị thì nó tưởng được nhận và khoá cứng ngón tay.
      onHoldStart: function (dx, dy) { return self.holdStart(dx, dy); },
      onHoldTick: function (ms, dx, dy) { self.holdTick(ms, dx, dy); },
      onHoldEnd: function (dx, dy, ms) { self.holdEnd(dx, dy, ms); },
      onCancel: function () { self.holdCancel(); }
    });
  };

  Battle.prototype.busy = function () {
    var st = this.player.state;
    /* BA TRẠNG THÁI GIỮ (autofire / charge / steady) CỐ Ý KHÔNG NẰM TRONG ĐÂY.
     *
     * Chúng không phải hành động đã cam kết — holdCancel() thoát khỏi chúng tự
     * do. Bản trước tôi đã nhét chúng vào đây và nó làm người chơi kẹt cứng ở
     * 'autofire': đo được state=autofire vẫn nguyên sau 2 giây. */
    return st === 'fire' || st === 'dodge' || st === 'lag' || st === 'switch' ||
           st === 'cast' || st === 'hurt' || st === 'skill';
  };

  /* ---- CHẠM: đánh thường, bấm liên tục thì nối combo ---- */
  /* ========================= BẮN — LÕI CHIẾN ĐẤU MỚI =======================
   * Ngữ pháp Punicon giữ nguyên một ngón, chỉ đổi cái nó điều khiển:
   *
   *   CHẠM              -> bắn một phát
   *   GIỮ (cây auto)    -> bắn liên tục theo nhịp của cây
   *   GIỮ (cây nạp)     -> nạp lực; nhả ra thì bắn
   *   GIỮ (cây còn lại) -> GHÌ SÚNG: đi chậm lại, tản đạn thu về 0, nhả ra một
   *                        phát chắc tay
   *   VẨY               -> né (giữ nguyên)
   *   VẨY rồi CHẠM      -> bắn ngay trong lúc lăn, vẫn giữ khung bất tử
   *
   * Ba luật cảm giác lấy nguyên từ Monster Hunter (Kiranico MHW Bow), vì đây là
   * chỗ bow của MH làm tốt hơn mọi game khác:
   *   1. NẠP KHÔNG LÀM CHẬM DI CHUYỂN — chỉ khi NGẮM mới chậm. Tách hai thứ đó
   *      ra là quyết định cảm giác hay nhất trong cả bộ nghiên cứu: chạy vòng
   *      vòng tích lực thoải mái, chỉ trả giá cơ động ở khoảnh khắc chốt mục tiêu.
   *   2. NÉ HUỶ NẠP LÀ MIỄN PHÍ — không bắn ra, không tốn gì. Nếu huỷ mà mất
   *      tài nguyên thì người chơi thôi nạp lúc nguy hiểm, và cả vòng lặp sụp.
   *   3. NẠP MANG SANG — phát sau khi né bắt đầu cao hơn một nấc.
   * ====================================================================== */

  Battle.prototype.tryAttack = function () {
    var p = this.player;
    if (p.down || this.paused) return;

    // Bắn ngay trong lúc đang lăn. Không huỷ cú lăn — đạn ra NGAY, nên vẫn giữ
    // nguyên khung bất tử. Nguyên văn bản gốc: "Flick the screen and tap while
    // moving to attack."
    if (p.state === 'dodge' && !p.rollHit) { p.rollHit = true; this.fire({ roll: true }); return; }

    if (p.state === 'charge' || p.state === 'steady' || p.state === 'autofire') { this.holdCancel(); }
    if (this.busy()) {
      // Bấm sớm trong lúc còn đuôi -> đệm lại, bắn ngay khi hết đuôi.
      if (p.state === 'fire' && p.stateT > p.stateDur * 0.5) p.queued = true;
      return;
    }
    this.fire({});
  };

  /* Một phát bắn. Mọi đường ra đạn — chạm, giữ, nạp, lăn, ụ súng — đều đi qua
   * đây, nên không có đường nào lách được luật tản đạn hay luật hồi chiêu. */
  Battle.prototype.fire = function (o) {
    o = o || {};
    var p = this.player, W = this.W;
    this.faceTarget();

    /* NIỆM của gậy phép. Wiki Soul Knight nói thẳng cái giá: "Niệm gậy mất một
     * khoảng thời gian để hiệu ứng phát tác. NẾU ĐỘNG TÁC NIỆM BỊ NGẮT, KHÔNG CÓ
     * GÌ XẢY RA." Đó là bản sắc của lớp, và là cái đổi lấy việc bắn năm tia một
     * lúc. Bị đánh trúng lúc đang niệm là mất trắng — xem hurtPlayer. */
    if (W.castMs && !o.fromCast && !o.roll) {
      p.state = 'cast'; p.stateT = 0; p.stateDur = W.castMs / this.atkSpeed();
      p.queued = false;
      this.fx.push({ k: 'ring', x: p.x, y: p.y, r: 30, t: 0, ms: W.castMs, col: '#c9a8ff' });
      return true;
    }

    var lvl = o.chargeLv === undefined ? -1 : o.chargeLv;
    var mul = 1, shots = W.shots, crit = 0, elemMul = 1;
    if (W.charge && lvl >= 0) {
      mul     = W.chargeMul[lvl];
      shots   = W.chargeShots[lvl];
      crit    = W.chargeCrit[lvl];
      elemMul = W.chargeElem[lvl] / W.chargeMul[lvl];   // đường cong hệ PHẲNG hơn vật lý
    } else if (W.charge) {
      mul = W.chargeMul[0]; shots = W.chargeShots[0]; crit = W.chargeCrit[0];
    }
    if (o.steady) { mul *= 1.35; crit += 0.20; }        // ghì súng: chắc tay hơn

    var spread = o.steady ? 0 : (W.spread || 0);
    if (!o.steady) spread += p.bloom || 0;              // giữ cò lâu thì toè ra
    var side = W.sideMul === undefined ? 1 : W.sideMul;
    var base = W.dmg * mul;
    var self = this;

    for (var i = 0; i < shots; i++) {
      // Quạt CỐ ĐỊNH (arcGap) khác hẳn jitter NGẪU NHIÊN (spread): quạt cố định
      // là một bức tường ngắm được và học được, jitter là một đám mây không học
      // được. Cái nào cũng có chỗ dùng, nhưng đừng lẫn hai cái.
      var off = shots > 1 ? (i - (shots - 1) / 2) * (W.arcGap || 0) * Math.PI / 180 : 0;
      off += (Math.random() - 0.5) * spread * Math.PI / 180;
      // Viên GIỮA ăn trọn, viên PHỤ bị thuế — luật của Archero: mũi bắn về hướng
      // mới thì miễn phí, mũi bắn cùng hướng thì phải trả.
      var dmgMul = (shots > 1 && i !== ((shots - 1) / 2 | 0)) ? side : 1;
      this.projs.push({
        k: 'shot', wclass: W.id,
        x: p.x + Math.cos(p.facing) * 14, y: p.y + Math.sin(p.facing) * 14,
        a: p.facing + off, spd: W.spd, life: W.life, r: W.r,
        mul: base * dmgMul, critBonus: crit + (o.critBonus || 0),
        pierce: !!W.pierce, pierceFall: W.pierceFall || 0.33, hits: 0,
        homing: W.homing || 0, explode: W.explode || null,
        noCrit: !!W.noCrit, critDist: W.critDist || null,
        from: { x: p.x, y: p.y }, hitSet: [],
        // Đạn hiện dần, CHƯA CÓ HITBOX. Không phải trang trí: đây là bảo đảm
        // công bằng chống chết-do-đạn-sinh-ra-trên-đầu (luật của Danmakufu).
        fade: G.DANMAKU.fadeInMs
      });
    }

    // Bốn kênh phản hồi RIÊNG, không gộp (Nuclear Throne scr_screenshake.gml):
    // đá camera có hướng · rung ngẫu nhiên · giật sprite súng · đẩy lùi người chơi.
    this.kickX = (this.kickX || 0) - Math.cos(p.facing) * (W.kick || 0);
    this.kickY = (this.kickY || 0) - Math.sin(p.facing) * (W.kick || 0);
    this.shake = Math.min(G.FEEL.shakeMax, (this.shake || 0) + (W.shake || 0));
    p.recoil = W.recoil || 0;
    if (W.knock) {
      p.kbX = (p.kbX || 0) - Math.cos(p.facing) * W.knock;
      p.kbY = (p.kbY || 0) - Math.sin(p.facing) * W.knock;
    }
    p.bloom = Math.min(W.bloomMax || 0, (p.bloom || 0) + (W.bloomPer || 0));
    p.bloomT = 260;

    // Không đè trạng thái khi phát bắn này đến TỪ một thế đang giữ: giữ cò thì
    // trạng thái phải ở lại 'autofire' cho tới khi nhả tay, chứ không nhảy sang
    // 'fire' rồi tự về 'idle' sau 200ms — làm thế thì nút giữ mất tác dụng.
    if (!o.roll && !o.sustained) {
      p.state = 'fire'; p.stateT = 0; p.queued = false;
      p.stateDur = W.shotMs / this.atkSpeed();
    }
    p.chargeLv = -1; p.chargeT = 0;
    if (W.id) this.moveName = { n: W.vi, t: this.t };
    return true;
  };

  /* Đòn "phản" sau khi né chuẩn giữ nguyên vị trí trong ngữ pháp, nhưng giờ nó
   * là một phát bắn chắc tay chứ không phải một nhát chém. */
  Battle.prototype.doCounter = function () {
    var p = this.player;
    p.counterUntil = 0;
    this.fire({ steady: true, critBonus: 0.25 });
  };

  /* ============================ HƯỚNG NHÌN (luật của White Cat Project) ====
   * ĐANG DI CHUYỂN -> đòn bay theo HƯỚNG ĐI, không tự ngắm ai cả.
   * ĐỨNG YÊN        -> tự quay về phía mục tiêu gần nhất rồi mới ra đòn.
   *
   * Nguồn: GameWith tổng hợp thay đổi thao tác 19/02/2020 của 白猫プロジェクト —
   *   "チャージアクションで発生する敵のターゲットが、移動中は無くなり、進行方向に放つように変更"
   *   (mục tiêu tự động biến mất khi đang di chuyển, đòn bay theo hướng đi)
   *   "その場で停止して使う場合は敵の方向を向くので、慣れるまで注意しておこう"
   *   (đứng yên tại chỗ mà dùng thì nhân vật sẽ quay về phía địch)
   * Và 週刊アスキー về ぷにコン: "攻撃は画面のどこをタップしても大丈夫" — chạm chỗ nào
   * cũng được. Câu đó CHỈ đúng khi đứng yên bấm là tự trúng; không có luật này thì
   * người chơi phải vừa chỉ hướng vừa bấm, tức là hỏng mất cái lõi một-ngón.
   *
   * Wiki Shironeko cũng ghi rõ nhiều đòn "in the direction of the closest target",
   * "Automatically attacks a targeted enemy", "Targets the closest enemy".
   */
  Battle.prototype.faceTarget = function () {
    var p = this.player;
    if (p.moving) return;                  // đang chạy: giữ nguyên hướng đi
    var W = this.W;
    // Tầm khoá: đủ rộng để không phải canh hướng, đủ hẹp để không tự quay sang một
    // con ở tận đầu kia sân. Cung thì bắn xa nên khoá xa hơn hẳn.
    // Tầm khoá mục tiêu bám theo TẦM BẮN của cây, cộng một chút để không phải
    // canh sát mép. Súng săn tầm 149px thì không tự quay sang con ở tận đầu sân.
    var lim = Math.min(W.range * 1.15, 560);
    var best = null, bd = lim;
    var b = this.boss;
    if (b && b.hp > 0) {
      var d = Math.hypot(b.x - p.x, b.y - p.y) - b.r;
      if (d < bd) { bd = d; best = b; }
    }
    this.mobs.forEach(function (m) {
      if (m.dead) return;
      var d2 = Math.hypot(m.x - p.x, m.y - p.y) - m.r;
      if (d2 < bd) { bd = d2; best = m; }
    });
    if (best) p.facing = Math.atan2(best.y - p.y, best.x - p.x);
  };

  /* Tên cũ, giữ lại vì bot và test còn gọi. Giờ nó chỉ là một phát bắn. */
  Battle.prototype.doAttack = function () { return this.fire({}); };

  Battle.prototype.atkSpeed = function () {
    var m = 1;
    if (this.player.fury > this.t) m += G.FEEL.furySpd;   // vừa đỡ chuẩn -> tay nhanh hẳn
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
    if (p.state === 'skill') return;                           // đang diễn kỹ năng thì chịu hết
    this.skillAimCancel();                                     // đang chỉ hướng mà vẩy né thì bỏ ngắm, không mất gì
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
  // Trả về FALSE khi không nhận được đòn đặc thù. Punicon đọc giá trị này để biết
  // mình chưa được vào thế giữ — nếu không nó sẽ tự nhận là đang giữ và khoá cứng
  // ngón tay lại, người chơi không đi được cho tới khi nhấc tay ra.
  /* ------------------------------------------------- GIỮ: ba nghĩa --------
   *   cây AUTO (súng trường, gậy phép)  -> bắn liên tục theo nhịp của cây
   *   cây NẠP  (cung)                   -> nạp bốn nấc, nhả ra thì bắn
   *   cây còn lại                       -> GHÌ SÚNG: chậm lại, tản đạn về 0
   *
   * Kéo tay trong lúc giữ vẫn NGẮM lại được, đúng như bản gốc cho ngắm bằng cần
   * gạt. Và nhân vật KHÔNG bị khoá chân khi nạp — chỉ khi ghì súng mới chậm. */
  Battle.prototype.holdStart = function (dx, dy) {
    var p = this.player, W = this.W;
    if (p.down || this.paused || this.busy()) return false;
    this.faceTarget();
    p.charge = 0; p.chargeT = 0;
    // Cây nạp đi lại bình thường trong lúc nạp (luật Monster Hunter); cây ghì
    // súng thì phải đứng lại, vì cái nó mua là ĐỘ CHÍNH XÁC.
    this.puni.holdMoves = true;
    if (W.auto) {
      p.state = 'autofire'; p.autoT = 0;
      this.fire({ sustained: true });      // phát đầu ra ngay, không đợi nhịp
    } else if (W.charge) {
      p.state = 'charge';
      // Nạp mang sang: vừa né xong thì bắt đầu ở nấc cao hơn một bậc.
      p.chargeLv = p.carryCharge || 0; p.carryCharge = 0;
    } else {
      p.state = 'steady';
    }
    return true;
  };

  Battle.prototype.holdTick = function (ms, dx, dy) {
    var p = this.player, W = this.W;
    p.charge = ms;
    var d = Math.hypot(dx, dy);
    if (d > 6) p.facing = Math.atan2(dy, dx);

    if (p.state === 'autofire') {
      p.autoT += 16;
      if (p.autoT >= W.shotMs / this.atkSpeed()) { p.autoT = 0; this.fire({ sustained: true }); }
    } else if (p.state === 'charge') {
      // Bốn nấc, và nấc 1 cố ý TỆ (0,40x) — chưa tới một nửa nấc 2. Monster
      // Hunter làm thế để nhả sớm là một quyết định thật, chứ không phải một
      // lựa chọn miễn phí.
      var lv = 0;
      for (var i = W.chargeMs.length - 1; i >= 0; i--) {
        if (ms >= W.chargeMs[i]) { lv = i; break; }
      }
      lv = Math.min(W.chargeMs.length - 1, Math.max(lv, p.chargeLv || 0));
      if (lv !== p.chargeLv) {
        p.chargeLv = lv;
        this.fx.push({ k: 'ring', x: p.x, y: p.y, r: 26 + lv * 5, t: 0, ms: 180,
                       col: lv >= 3 ? '#ffd23f' : '#8fd4ff' });
      }
    } else if (p.state === 'steady') {
      p.steadyK = Math.min(1, ms / 550);
    }
  };

  Battle.prototype.holdEnd = function (dx, dy, ms) {
    var p = this.player, W = this.W;
    if (p.state === 'autofire') { p.state = 'idle'; return; }
    if (p.state === 'charge') { this.fire({ chargeLv: p.chargeLv || 0 }); return; }
    if (p.state === 'steady') {
      // Ghì đủ lâu mới được thưởng. Chưa đủ thì vẫn bắn, chỉ là bắn thường —
      // không phạt, chỉ là không thưởng (luật bất đối xứng của dải chí mạng).
      this.fire({ steady: (p.steadyK || 0) >= 0.999 });
      p.steadyK = 0; return;
    }
    p.state = 'idle';
  };

  Battle.prototype.holdCancel = function () {
    var p = this.player;
    if (p.state === 'autofire' || p.state === 'charge' || p.state === 'steady') {
      // HUỶ NẠP LÀ MIỄN PHÍ: không bắn ra, không mất gì. Nếu huỷ mà mất tài
      // nguyên thì người chơi thôi nạp lúc nguy hiểm, và cả vòng lặp sụp.
      p.state = 'idle'; p.charge = 0; p.steadyK = 0;
      // Nhưng nấc đang nạp được GIỮ LẠI một bậc cho phát sau cú né.
      if (this.W.charge && this.W.dodgeKeepsCharge) {
        p.carryCharge = Math.min(this.W.chargeMs.length - 1,
          Math.max(0, (p.chargeLv || 0) + (this.W.dodgeChargeBonus || 0) - 1));
      }
      p.chargeLv = -1;
    }
  };

  /* ------------------------------------------- CÁC ĐÒN ĐẶC THÙ CỤ THỂ ---- */
  // Đòn phản. Hai đường vào: nhả tay sau một cú ĐỠ thành công (Kiếm & Khiên),
  // hoặc chạm khi dấu "!!" hiện lên sau một cú NÉ chuẩn (mọi vũ khí).
  Battle.prototype.doCounter = function (fromDodge) {
    var p = this.player, W = this.W;
    this.faceTarget();                  // "Automatically attacks a targeted enemy"
    p.state = 'attack'; p.stateT = 0; p.hitDone = false;
    p.stateDur = 280; p.comboIdx = -1;   // -1 đánh dấu là đòn phản
    p.counterHits = (!fromDodge && this.wp.wtype === 'heat') ? 2 : 1;
    p.counterFromDodge = !!fromDodge;
    p.guardBlocked = false;
    p.iframe = Math.max(p.iframe, 220);
    this.toast(fromDodge ? 'PHẢN ĐÒN SAU NÉ!' : 'PHẢN ĐÒN!', '#c88cff');
  };

  // Rolling Attack: đòn nhẹ hơn nhưng ra ngay trong lúc lăn, và không tốn khung né.
  /* Vẩy để lăn rồi tap ngay trong lúc còn đang lăn: ĐÒN LƯỚT, mỗi cây một kiểu,
   * và KHÔNG mất khung bất tử của cú lăn. (White Cat: Rolling Attack) */
  /* Muzzle flash + vệt đạn. Thay cho slashFx của bản cận chiến: thứ cần đọc
   * bây giờ là HƯỚNG NÒNG và NHỊP, không phải một cung quét. */
  Battle.prototype.muzzleFx = function (col, big) {
    var p = this.player;
    this.fx.push({ k: 'muzzle', x: p.x + Math.cos(p.facing) * 16,
                   y: p.y + Math.sin(p.facing) * 16, a: p.facing,
                   t: 0, ms: big ? 130 : 80, col: col || '#ffe6a0', big: !!big });
  };

  // Tên cũ, giữ lại cho skills.js và bot: giờ nó vẽ chớp nòng.
  Battle.prototype.slashFx = function (arc, reach, col, big) { this.muzzleFx(col, big); };

  /* Overdrive giữ nguyên vị trí trong hệ Heat/Soul — nó là buff, không phải một
   * đòn cận chiến, nên nó sống sót qua việc đổi sang bắn. */
  Battle.prototype.startOverdrive = function () {
    var p = this.player;
    p.heat = 0; p.overdrive = 8000; p.overdriveChain = 0;
    this.toast('OVERDRIVE!', '#ff7a3c');
    this.fx.push({ k: 'ring', x: p.x, y: p.y, r: 90, t: 0, ms: 420, col: '#ff7a3c' });
  };

  /* ================================ SÁT THƯƠNG ============================
   * baseMul giờ là SÁT THƯƠNG GỐC tính bằng đơn vị của W.dmg — tức đọc thẳng
   * ra được: 4 là một viên súng trường, 256 là cả một lần xả kỹ năng. Trước đây
   * nó là một hệ số nhân lên trên tổng công đã lớn sẵn, và đó là gốc của việc
   * quái chết trong nửa phát.
   *
   *     sát thương = baseMul × (ATK / 10)
   *
   * ATK là CHỈ SỐ SỨC MẠNH (nhân vật + vũ khí + theo lớp), không phải sát
   * thương thô. Lv1 ~16 -> nhân 1,6. Lv60 đồ SS ~110 -> nhân 11. Máu quái đi
   * theo cùng nhịp đó, nên SỐ PHÁT ĐỂ GIẾT giữ nguyên ~5 suốt cả game thay vì
   * trôi từ 0,5 tới 1,0 rồi về 0,5.
   */
  Battle.prototype.playerDamage = function (baseMul, opt) {
    opt = opt || {};
    var st = this.stats, wp = this.wp, D = G.BAL.atkDiv;
    var atk = (st.atk + wp.patk + (st.watk[wp.wclass] || 0)) / D;
    var phys = baseMul * atk;
    var wdmg = 1 + (st.wdmg[wp.wclass] || 0);
    var elemAmt = baseMul * (wp.eatk / D) * (1 + (st.edmg[wp.el] || 0));
    var atkPct = 1, flatAtk = 0;
    this.player.buffs.forEach(function (b) {
      if (b.atkPct) atkPct += b.atkPct;
      if (b.atk) flatAtk += b.atk;
      if (b.edmg && b.edmg[wp.el]) elemAmt *= (1 + b.edmg[wp.el]);
      if (b.normalDmg && !opt.skill) atkPct += b.normalDmg;
    });
    if (this.player.overdrive > 0) atkPct += 0.25 + 0.5 * Math.min(7, this.player.overdriveChain) / 7;
    if (wp.wtype === 'soul' && this.player.soul >= 100) atkPct += 0.35;
    if (opt.skill) atkPct += (st.skillDmg || 0);
    // Tàn Ảnh: ba giây sau khi tan vào bóng thì nhát nào cũng tính là đâm lén.
    if (this.player.backstabUntil > this.t) atkPct += 1.20;
    // Thành Trì: đứng sau tường thì nặng tay hơn.
    if (this.wallBonus) atkPct += this.wallBonus();
    var elemMul = opt.elemMul || 1;
    return { phys: (phys + flatAtk) * wdmg * atkPct, elem: elemAmt * elemMul * atkPct,
             el: opt.el || wp.el, noCrit: !!opt.noCrit };
  };

  /* Phương sai + chí mạng + giáp, gộp một chỗ để không có đường nào đi vòng.
   *
   * GIÁP LÀ PHẦN TRĂM, không trừ thẳng. Với max(1, dmg − armor), giáp 3 điểm
   * làm khẩu 4 sát thương mất 75% sức mạnh còn khẩu 22 sát thương chỉ mất 12%
   * — xoá sổ nguyên một dòng vũ khí một cách vô tình. Công thức nhân thì bất
   * biến theo thang: nó đối xử với viên 4 và viên 22 hoàn toàn tương xứng.
   *
   * CHÍ MẠNG hệ số THẤP (1,75× chứ không phải 3×) và tỉ lệ VỪA. Với số nhỏ, ×2
   * biến 5 thành 10 — nguyên một phát bắn, tức một cú nhảy rất cục. Nhiều lần
   * nhỏ giữ phương sai số-phát-để-chết thấp hơn hẳn.
   */
  Battle.prototype.roll = function (raw, target, opt) {
    opt = opt || {};
    var B = G.BAL;
    var v = 1 + (Math.random() * 2 - 1) * B.dmgVariance;
    var crit = false;
    if (!opt.noCrit && !(this.W && this.W.noCrit)) {
      var p = (this.W && this.W.crit !== undefined ? this.W.crit : B.critBase)
            + (this.stats.crit || 0) + (opt.critBonus || 0);
      if (opt.forceCrit || Math.random() < p) { crit = true; v *= B.critMul; }
    }
    var armor = (target && target.armor) || 0;
    v *= B.armorK / (B.armorK + armor);
    return { dmg: Math.max(1, raw * v), crit: crit };
  };

  Battle.prototype.dealToBoss = function (dmgObj, hitX, hitY, opt) {
    var b = this.boss; if (!b || b.hp <= 0) return 0;
    opt = opt || {};
    // Boss không văng và không hất tung được, nên toàn bộ cảm giác "chém trúng một
    // khối thịt" dồn hết vào hitstop và cú loé — thiếu nó là chém vào không khí.
    var _mv = opt.move || {};
    this.impact(hitX, hitY, _mv.hs || G.FEEL.hitstop.mid, G.FEEL.shake.mid, "#ffe6a0");
    var mul = G.elemMult(dmgObj.el, b.el);
    var raw = dmgObj.phys + dmgObj.elem * mul;
    var bMarked = b.marked && b.marked > this.t;
    if (opt.falloff) raw *= opt.falloff;
    if (opt.distMul && !bMarked) raw *= opt.distMul;
    var rl = this.roll(raw, b, { noCrit: dmgObj.noCrit || opt.noCrit,
                                 critBonus: opt.critBonus,
                                 forceCrit: opt.forceCrit || bMarked });
    raw = rl.dmg;

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
          this.chests.push({ x: b.x + (Math.random() - 0.5) * 60, y: b.y + 40, kind: 'red', t: 0, part: true,
            mats: G.rollBossDrop(b.def, 0, this.stats.luck).slice(0, 2), gold: 0, exp: 0 });
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

    this.number(hitX, hitY, Math.round(raw),
      weak ? 'weak' : rl.crit ? 'crit' : (mul > 1 ? 'adv' : mul < 1 ? 'dis' : 'norm'));
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
    var F = G.FEEL, mv = opt.move || {};
    var mul = G.elemMult(dmgObj.el, m.el);
    var raw = (dmgObj.phys + dmgObj.elem * mul);
    /* ĐÁNH DẤU (kỹ năng Điểm Danh của bắn tỉa). Con có dấu thì mọi phát bắn vào
     * nó đều tính là chí mạng, và KHÔNG bị trừ sát thương theo khoảng cách. Ý
     * lấy nguyên từ Tracer Arrow của MH Wilds: đóng dấu một lần rồi mọi mũi sau
     * đó được miễn luật vị trí — nó là một CỬA SỔ BURST, không phải một buff
     * cộng phần trăm. */
    var marked = m.marked && m.marked > this.t;
    if (opt.falloff) raw *= opt.falloff;          // xuyên / nảy: −33% / −30% mỗi lần
    if (opt.distMul && !marked) raw *= opt.distMul;   // dải chí mạng của cung
    // Đang lơ lửng thì ăn nặng hơn — đó là phần thưởng cho việc giữ được nhịp juggle.
    if (m.z > 2) raw *= F.airDmgMul;
    var rl = this.roll(raw, m, { noCrit: dmgObj.noCrit || opt.noCrit,
                                 critBonus: opt.critBonus,
                                 forceCrit: opt.forceCrit || marked });
    raw = rl.dmg;
    m.hp -= raw; m.flash = 1; m.squash = 1;
    this.lastDealt = raw;
    /* Hitstop trên MỌI cú trúng, không chỉ khi vỡ thế. Sát thương mỗi viên giờ
     * nhỏ hơn hẳn, nên cái bán cảm giác "trúng" không còn là con số mà là phản
     * hồi: đứng hình một nhịp rất ngắn + loé + văng. Thang Nuclear Throne, và
     * hitstop leo thang theo SỰ KIỆN chứ không theo sát thương — trúng thường
     * 10ms, chí mạng 30ms, giết 60ms, giết elite 80ms. */
    var F2 = G.FEEL.hitstop;
    var hs2 = (m.hp <= 0) ? (m.elite ? F2.elite : F2.kill) : (rl.crit ? F2.crit : (mv.hs || F2.light));
    this.impact(m.x, m.y, hs2, rl.crit ? G.FEEL.shake.mid : G.FEEL.shake.light,
                rl.crit ? '#ff4f7a' : '#e8f2ff');
    this.number(m.x, m.y - m.r - m.z, Math.round(raw),
      rl.crit ? 'crit' : (mul > 1 ? 'adv' : mul < 1 ? 'dis' : 'norm'));
    if (this.wp.wtype === 'heat') this.player.heat = Math.min(100, this.player.heat + 1.0);
    if (this.wp.wtype === 'soul') this.player.soul = Math.min(100, this.player.soul + 0.9);
    if (opt.status) this.applyStatus(m, opt.status);

    // --- văng ra theo hướng đòn ---
    var a = (opt.from !== undefined) ? opt.from : Math.atan2(m.y - this.player.y, m.x - this.player.x);
    var kb = (mv.kb || 6) * (m.elite ? 0.45 : 1) * (m.T.ai === 'tank' ? 0.35 : 1);
    m.kbX += Math.cos(a) * kb; m.kbY += Math.sin(a) * kb;

    // --- poise: đục cho vỡ thì nó đứng chết trân gần một giây ---
    m.poise -= (mv.poise || 8);
    if (m.poise <= 0) {
      m.poise = m.poiseMax;
      m.stagger = F.breakStagger;
      m.phase = 'idle'; m.pt = 0;
      this.number(m.x, m.y - m.r - 14, 'VỠ THẾ', 'break');
      this.impact(m.x, m.y, G.FEEL.hitstop.heavy, G.FEEL.shake.heavy, '#ffd23f');
      this.fx.push({ k: 'ring', x: m.x, y: m.y, r: m.r + 26, t: 0, ms: 320, col: '#ffd23f' });
    } else {
      m.stagger = Math.max(m.stagger, 120);
    }

    // --- hất tung ---
    if (mv.launch && m.z <= 0.5 && !m.elite) {
      m.vz = mv.launch * G.FEEL.airLaunch;
      m.stagger = Math.max(m.stagger, 500);
      this.fx.push({ k: 'ring', x: m.x, y: m.y, r: m.r + 12, t: 0, ms: 240, col: '#8fd4ff' });
    }

    if (m.hp <= 0) this.killMob(m);
  };

  Battle.prototype.aoeDamage = function (x, y, r, mul, opt) {
    opt = opt || {};
    var d = this.playerDamage(mul, opt);
    if (this.boss && this.boss.hp > 0 && Math.hypot(this.boss.x - x, this.boss.y - y) < r + this.boss.r) {
      // Đòn diện rộng ưu tiên đánh vào bộ phận gần tâm nổ nhất
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
      if (m.hp > 0 && inArc(m.x, m.y, m.r)) {
        opt.from = Math.atan2(m.y - p.y, m.x - p.x);
        self.dealToMob(m, d, opt);
        hit = true;
      }
    });
    if (hit) {
      var mv = opt.move || {};
      this.impact(p.x + Math.cos(p.facing) * reach * 0.6, p.y + Math.sin(p.facing) * reach * 0.6,
                  mv.hs || G.FEEL.hitstop.light,
                  Math.max(G.FEEL.shake.light, Math.min(G.FEEL.shake.finish, 2 + mul * 2.2)));
    }
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
      cut = perfect ? (W.perfectCut || 0.10) : (W.guardCut || 0.40);
      cut += -(this.stats.guard || 0) * 0.5;
      cut = clamp(cut, 0.02, 1);
      p.guardBlocked = true;
      if (perfect) {
        this.toast('ĐỠ CHUẨN!', '#7fd4ff');
        // Đỡ chuẩn MỞ RA một nhịp tay nhanh, chứ không chỉ là "đỡ được rồi thôi".
        p.fury = this.t + G.FEEL.furyMs;
        this.impact(p.x, p.y, G.FEEL.hitstop.heavy, G.FEEL.shake.heavy, '#8fe4ff');
        this.fx.push({ k: 'ring', x: p.x, y: p.y, r: 34, t: 0, ms: 340, col: '#8fe4ff' });
      }
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
    // Solo: không có ai tới cứu. Còn lượt thì tự đứng dậy sau vài giây, hết lượt là
    // thua ải. Đây là thứ thay cho vòng cứu của đồng đội trong bản gốc.
    if (p.revives > 0) this.toast('NGÃ — tự đứng dậy sau ' + (G.BAL.selfReviveMs / 1000) + 's', '#c34141');
    else this.toast('NGÃ — hết lượt đứng dậy', '#c34141');
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
    if (this.phase === 'mobs') {
      if (this.killed >= this.needKills) {
        this.startBossPhase();
      } else {
        // Bù quái để sân không bao giờ trống trước khi đủ chỉ tiêu.
        var self = this;
        setTimeout(function () {
          if (self.running && self.phase === 'mobs' &&
              self.mobs.filter(function (x) { return !x.dead; }).length < G.ARENA.maxMobs - 4) {
            var n = 1 + ((Math.random() * 2) | 0);
            for (var q = 0; q < n; q++) {
              self.mobs.push(self.makeMob(pick(self.map.tribes), self.map.lv, Math.random() < 0.16, false));
            }
          }
        }, 900);
      }
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
      usedSkill: this.player.usedSkill,
      fast: elapsed <= G.BAL.gemFastMs
    };
    var gems = (conds.noDeath ? 1 : 0) + (conds.usedSkill ? 1 : 0) + (conds.fast ? 1 : 0);
    if (gems === 3) gems += G.BAL.gemAllBonus;
    var drops = G.rollBossDrop(b.def, b.partsBroken, this.stats.luck);
    var st = this.stage;
    var firstClear = !this.s.cleared[st.id];
    setTimeout(function () {
      self.finish({
        win: true, stage: st, firstClear: firstClear,
        boss: b.def, gems: gems, conds: conds, drops: drops,
        parts: b.partsBroken, elapsed: elapsed, killed: self.killed,
        bag: self.bag || { mats: {}, gold: 0, exp: 0 },
        gold: Math.round(st.gold * G.potionMul(self.s, 'gold')),
        exp: Math.round(st.exp * G.potionMul(self.s, 'exp')),
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

  Battle.prototype.leaveStage = function () {
    this.finish({ win: false, quit: true, stage: this.stage, killed: this.killed, bag: this.bag || {} });
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

  /* Gọi mỗi khi một đòn CHẠM. Đóng băng mô phỏng vài chục mili-giây để mắt kịp
   * đăng ký cú va, rung màn hình, và loé trắng chỗ trúng.
   *
   * Ba điều phải giữ đúng, nếu không thì hitstop biến từ "đã tay" thành "lag":
   *  1. CÓ TRẦN. Chém trúng bảy con một lúc mà cộng dồn thì game đứng hình.
   *  2. KHÔNG ăn input. Tap trong lúc đóng băng vẫn phải vào hàng đợi — chính cái
   *     khựng này là thứ NỚI cửa sổ bấm nối, đúng như Street Fighter 2 dùng nó.
   *  3. FX và rung màn hình vẫn chạy, chỉ nhân vật và quái là đứng. */
  Battle.prototype.impact = function (x, y, hs, shake, col) {
    this.freeze = Math.min(G.FEEL.hitstopMax, Math.max(this.freeze, hs || 0));
    if (shake) this.shake = Math.max(this.shake, shake);
    if (x !== undefined) this.fx.push({ k: 'spark', x: x, y: y, t: 0, ms: 190, col: col || '#ffffff' });
  };

  Battle.prototype.step = function (now) {
    // Chặn CẢ HAI đầu. Trần 50ms để một khung hình rớt không đẩy nhân vật xuyên
    // tường; sàn 0 vì dt ÂM (đồng hồ bị chỉnh, hoặc ai đó gọi step với mốc thời
    // gian tương lai) sẽ cho vật lý chạy NGƯỢC — quái đang bay bị kéo tụt xuống đất.
    var dt = clamp(now - this.last, 0, 50);
    this.last = now; this.t = now;
    if (!this.paused) {
      if (this.freeze > 0) {
        // ĐANG HITSTOP: nhân vật và quái đứng im, nhưng fx, rung màn hình và
        // ĐỒNG HỒ NHẬP LỆNH vẫn chạy. Cái khựng này phải NỚI cửa sổ bấm nối chứ
        // không được nuốt mất cú tap của người chơi.
        this.freeze = Math.max(0, this.freeze - dt);
        this.updateFx(dt);
      } else {
        this.update(dt);
      }
    }
    this.render();
    if (this.cb.onHud) this.cb.onHud(this);
  };

  Battle.prototype.update = function (dt) {
    var p = this.player, self = this;

    this.timeLeft -= dt;
    if (this.timeLeft <= 0 && !this.result) {
      this.finish({ win: false, timeout: true, stage: this.stage, boss: this.boss && this.boss.def });
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
    this.updateSkills(dt);
    if (p.iframe > 0) p.iframe -= dt;
    if (p.dodgeCd > 0) p.dodgeCd -= dt;

    // ---- di chuyển / hành động ----
    var mv = this.puni.tick(this.t);
    if (p.down) {
      p.downT += dt;
      if (p.revives <= 0) {
        this.finish({ win: false, wipe: true, stage: this.stage, boss: this.boss && this.boss.def, killed: this.killed });
        return;
      }
      if (p.downT >= G.BAL.selfReviveMs) { p.revives--; this.revivePlayer(0.6); }
    } else if (!stunned) {
      this.updateAction(dt, mv, slowMul);
    }

    // ---- entities ----
    if (this.phase === 'boss') this.updateBoss(dt); else this.updateStage(dt);
    this.updateChests(dt);
    this.updateMobs(dt);
    this.updateProjectiles(dt);
    this.updateTelegraphs(dt);

    this.updateFx(dt);
  };

  /* Hiệu ứng, số bay lên và rung màn hình — thứ DUY NHẤT vẫn chạy trong hitstop. */
  Battle.prototype.updateFx = function (dt) {
    for (var f = this.fx.length - 1; f >= 0; f--) { this.fx[f].t += dt; if (this.fx[f].t > this.fx[f].ms) this.fx.splice(f, 1); }
    for (var m2 = this.msgs.length - 1; m2 >= 0; m2--) { this.msgs[m2].t += dt; if (this.msgs[m2].t > 900) this.msgs.splice(m2, 1); }
    /* Rung mạnh giảm theo hàm mũ, rung NHẸ giảm TUYẾN TÍNH — mẹo của Nuclear
     * Throne, và nó có một hệ quả rất tiện: vì mất đúng 1 đơn vị mỗi khung, CON
     * SỐ BIÊN ĐỘ ĐỒNG THỜI LÀ THỜI LƯỢNG tính bằng khung. Mỗi khẩu chỉ phải
     * chỉnh một số thay vì hai. */
    if (this.shake > 10) this.shake *= Math.pow(0.8, dt / 16.67);
    else if (this.shake > 0) this.shake = Math.max(0, this.shake - dt / 16.67);
    // Đá camera hồi −40% mỗi khung: nửa đời ~1,35 khung, tan hẳn trong ~5 khung.
    var kd = Math.pow(1 - G.FEEL.kickDecay, dt / 16.67);
    this.kickX = Math.abs((this.kickX || 0) * kd) < 0.2 ? 0 : this.kickX * kd;
    this.kickY = Math.abs((this.kickY || 0) * kd) < 0.2 ? 0 : this.kickY * kd;
    // Sprite súng lùi rồi hồi 1px mỗi khung.
    if (this.player.recoil > 0) {
      this.player.recoil = Math.max(0, this.player.recoil - G.FEEL.recoilRecover * dt / 16.67);
    }
  };

  Battle.prototype.updateAction = function (dt, mv, slowMul) {
    var p = this.player, W = this.W;
    p.stateT += dt;

    switch (p.state) {
      /* Đuôi của một phát bắn. Ngắn hơn hẳn đuôi của một nhát chém, vì cái phạt
       * ở đây là NHỊP và TẢN ĐẠN chứ không phải thời gian đứng chôn chân.
       *
       * VÀ NÓ KHÔNG KHOÁ CHÂN. Đây là chỗ khác nhau lớn nhất giữa một game chém
       * và một game bắn: chém thì cả người phải xoay theo nhát chém nên đứng lại
       * là đúng, còn bắn thì vừa đi vừa bắn là hành vi mặc định. Để nguyên luật
       * cũ thì bắn 5 phát/giây với đuôi 200ms mỗi phát = chôn chân vĩnh viễn,
       * trong một game mà né đạn là kỹ năng chính. Đi hơi chậm lại (85%) để cú
       * bắn vẫn có một chút sức nặng. */
      case 'fire': {
        this.moveStep(p, mv, slowMul, dt, 0.85);
        if (p.stateT >= p.stateDur) {
          p.state = 'idle';
          if (p.queued) { p.queued = false; this.fire({}); }
        }
        break;
      }

      /* Giữ cò: bắn liên tục. Đi lại bình thường — cái giá là tản đạn nở ra
       * (bloom), không phải chân bị khoá. */
      case 'autofire': {
        this.moveStep(p, mv, slowMul, dt, 1);
        break;
      }

      /* NẠP: đi lại BÌNH THƯỜNG. Đây là luật của Monster Hunter và là quyết định
       * cảm giác quan trọng nhất của cây cung — "Charging an arrow does not slow
       * movement. Instead, movement only slows when the player aims their shot."
       * Tách nạp khỏi ngắm cho phép chạy vòng vòng tích lực rồi mới chốt. */
      case 'charge': {
        this.moveStep(p, mv, slowMul, dt, W.chargeMoveMul === undefined ? 1 : W.chargeMoveMul);
        break;
      }

      /* GHÌ SÚNG: đây mới là chỗ chậm lại, vì cái nó mua là ĐỘ CHÍNH XÁC. */
      case 'steady': {
        this.moveStep(p, mv, slowMul, dt, W.aimMoveMul || 0.45);
        break;
      }

      /* NIỆM của gậy phép: ngắt được. Bị đánh trúng trong lúc niệm thì mất trắng
       * — đó là cái giá của việc bắn năm tia một lúc. */
      case 'cast': {
        this.moveStep(p, mv, slowMul, dt, W.castMoveMul || 0.55);
        if (p.stateT >= p.stateDur) { p.state = 'idle'; this.fire({ fromCast: true }); }
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
      case 'lag': case 'hurt': case 'switch':
        if (p.stateT >= p.stateDur) p.state = 'idle';
        break;
      case 'idle': {
        this.moveStep(p, mv, slowMul, dt, 1);
        break;
      }
    }
  };

  /* Một bước đi, dùng chung cho mọi trạng thái còn đi được. Trước đây đoạn này
   * nằm lặp trong từng case và đã có lần lệch nhau. */
  Battle.prototype.moveStep = function (p, mv, slowMul, dt, mul) {
    var W = this.W;
    if (!(mv.m > 0) || !(mul > 0)) { p.moving = false; return; }
    var spd = G.BAL.baseSpd * W.moveMul * (this.stats.moveSpd || 1) * mul * mv.m * slowMul;
    var bs = 1; p.buffs.forEach(function (b) { if (b.moveSpd) bs += b.moveSpd; });
    if (p.overdrive > 0) bs += 0.25;
    spd *= bs;
    p.x = clamp(p.x + mv.x * spd * dt / 16.67, 24, this.wW - 24);
    p.y = clamp(p.y + mv.y * spd * dt / 16.67, 24, this.wH - 24);
    p.facing = Math.atan2(mv.y, mv.x);
    p.moving = true;
  };


  /* Rương rơi ra khi giết quái và khi phá bộ phận boss.
   *
   * Hai chỗ từng sai và đã sửa:
   *  - Bán kính nhặt cũ là 32px, trong khi tầm với vũ khí là 62-96px (cung 420).
   *    Nghĩa là đánh cận chiến xong, rương rơi ngay ngoài tầm nhặt và người chơi
   *    phải bước thêm mấy bước mới lấy được. Giờ rương HÚT về phía người chơi khi
   *    vào khoảng 130px — vẫn phải tới gần, nhưng không còn cảnh đứng sát mà không
   *    nhặt được.
   *  - Vòng này trước nằm trong updateField(), nên rương phá bộ phận trong trận
   *    boss hiện lên rồi nằm đó vĩnh viễn, không nhặt được và không biến mất.
   *    Giờ gọi từ update() nên chạy ở CẢ hai chế độ.
   */
  Battle.prototype.updateChests = function (dt) {
    var p = this.player, self = this;
    this.bag = this.bag || { mats: {}, gold: 0, exp: 0 };
    for (var i = this.chests.length - 1; i >= 0; i--) {
      var c = this.chests[i];
      c.t += dt;
      if (c.t > 22000) { this.chests.splice(i, 1); continue; }
      var d = dist(p, c);
      // d > 1 là BẮT BUỘC: rương phá bộ phận có thể rơi đúng ngay chỗ người chơi
      // đang đứng, lúc đó d = 0 và phép chia cho d biến toạ độ rương thành NaN —
      // rương treo vĩnh viễn trên sân, không nhặt được và không biến mất.
      /* BÁN KÍNH HÚT BÁM THEO TẦM BẮN, không phải một con số cố định.
       *
       * 130px là con số của bản CẬN CHIẾN, khi tầm với chỉ 48–96px nên chỗ quái
       * chết luôn nằm sát chân người chơi. Giờ người chơi giết từ 210px (súng
       * trường) hoặc xa hơn nhiều (bắn tỉa 1269px) — rương rơi ngoài tầm hút, và
       * cả trận biến thành: bắn một phát, chạy tới nhặt, chạy về. Đó là đúng cái
       * vòng lặp mà một game bắn phải tránh.
       *
       * Nên bán kính hút = 75% tầm bắn, sàn 130 (giữ nguyên hành vi cũ cho cây
       * tầm ngắn), trần 420 để không thành "nhặt cả sân từ chỗ đứng". */
      var mag = clamp((this.W.range || 180) * 0.75, 130, 420);
      if (d > 1 && d < mag && !p.down) {
        var pull = Math.min(d, (1 - d / mag) * 8.4 * dt / 16.67);
        c.x += (p.x - c.x) / d * pull;
        c.y += (p.y - c.y) / d * pull;
        d = dist(p, c);
      }
      if (d < 34) {
        (c.mats || []).forEach(function (m) { self.bag.mats[m] = (self.bag.mats[m] || 0) + 1; G.addMat(self.s, m, 1); });
        this.bag.gold += c.gold || 0; this.s.gold += c.gold || 0;
        this.bag.exp += c.exp || 0;
        G.addExp(this.s, c.exp || 0);
        if (c.gold) this.toast('+' + c.gold + ' Gold', '#f2d24b');
        else if (c.part) this.toast('Nhặt được nguyên liệu bộ phận', '#f2d24b');
        this.chests.splice(i, 1);
      }
    }
  };

  /* -------------------------------------------------------- FIELD ------- */
  Battle.prototype.updateStage = function (dt) {
    var p = this.player, self = this;
    // Điểm khai thác (nhiệm vụ ngày "Thu thập 2 lần", và là chỗ ra Equipment Crystal
    // — thứ mà nâng cấp từ cấp 25 trở lên bắt buộc phải có)
    this.gathers.forEach(function (g) {
      if (!g.used && dist(p, g) < 34) {
        g.used = true; self.s.stats.gathers++;
        G.track(self.s, { gather: 1 });
        var m = pick(G.GATHER_MATS);
        G.addMat(self.s, m, 1);
        self.toast('Thu được ' + G.MATERIALS[m].n, '#7fd07f');
        self.puff(g.x, g.y, '#7fd07f');
      }
    });
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
        b.state = 'idle';
        b.cd = (700 + Math.random() * 900) * (b.raged ? 0.6 : 1);
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
    var list = (G.BOSS_EXTRA && G.BOSS_EXTRA[b.def.id]) || b.def.patterns || ['slam'];
    // NỔI ĐIÊN: dưới nửa máu thì ra đòn dồn hơn hẳn. Đây là chỗ trận đấu đổi nhịp —
    // người chơi vừa quen tay thì con trùm đổi bài.
    if (b.hp < b.maxHp * 0.5 && !b.raged) {
      b.raged = true;
      this.toast(b.n + ' NỔI ĐIÊN!', '#e33b30');
      this.impact(b.x, b.y, G.FEEL.hitstop.finish, G.FEEL.shake.quake, '#ff6a5a');
    }
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
          // Bẫy đặt sẵn: nổ khi địch chạm vào
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
  /* Văng, rơi, bẹp, hồi poise — chạy cho MỌI con, kể cả con đang loạng choạng.
   * Tách khỏi phần AI vì đây là vật lý, không phải quyết định. */
  Battle.prototype.mobReact = function (m, dt) {
    var F = G.FEEL, k = dt / 16.67;
    m.flash = Math.max(0, m.flash - dt * 0.005);
    m.squash = Math.max(0, m.squash - dt * 0.006);
    if (m.kbX || m.kbY) {
      m.x = clamp(m.x + m.kbX * k, 20, this.wW - 20);
      m.y = clamp(m.y + m.kbY * k, 20, this.wH - 20);
      var d = Math.pow(F.kbDecay, k);
      m.kbX *= d; m.kbY *= d;
      if (Math.abs(m.kbX) < 0.05) m.kbX = 0;
      if (Math.abs(m.kbY) < 0.05) m.kbY = 0;
    }
    if (m.z > 0 || m.vz > 0) {
      m.z += m.vz * dt;
      m.vz -= F.airGrav * dt;
      if (m.z <= 0) {                       // chạm đất: nảy nhẹ rồi nằm
        m.z = 0;
        if (m.vz < -0.25) {
          m.vz = -m.vz * F.airBounce;
          m.stagger = Math.max(m.stagger, F.landStagger);
          this.impact(m.x, m.y, G.FEEL.hitstop.light, G.FEEL.shake.light, '#cfd8e2');
          this.fx.push({ k: 'dust', x: m.x, y: m.y, t: 0, ms: 260 });
        } else { m.vz = 0; }
      }
    }
    if (m.stagger > 0) m.stagger = Math.max(0, m.stagger - dt);
    else if (m.poise < m.poiseMax) m.poise = Math.min(m.poiseMax, m.poise + F.poiseRegen * dt / 1000);
  };

  /* Phát thẻ đánh mỗi khung. Ai đang ra đòn thì giữ thẻ tới khi xong; số thẻ
   * còn lại về tay những con GẦN NHẤT đang muốn đánh — gần nhất chứ không phải
   * ngẫu nhiên, vì con đứng sát mặt mà đứng im nhìn thì trông hỏng. */
  Battle.prototype.updateTokens = function () {
    var p = this.player, self = this;
    var alive = this.mobs.filter(function (m) { return !m.dead && m.hp > 0; });
    var cap = Math.min(G.TOKENS.max, G.TOKENS.byCount(alive.length));
    var holders = [];
    alive.forEach(function (m) {
      // Trả thẻ khi đã đánh xong và hết nhịp hở.
      if (m.token && m.phase === 'idle') m.token = false;
      if (m.token) holders.push(m);
    });
    if (holders.length >= cap) return;
    var want = alive.filter(function (m) { return !m.token && m.agro; });
    want.sort(function (u, v) {
      return (Math.hypot(u.x - p.x, u.y - p.y)) - (Math.hypot(v.x - p.x, v.y - p.y));
    });
    for (var i = 0; i < want.length && holders.length < cap; i++) {
      want[i].token = true; holders.push(want[i]);
    }
  };

  Battle.prototype.updateMobs = function (dt) {
    var p = this.player, self = this;
    this.updateTokens();
    this.mobs.forEach(function (m) {
      if (m.dead) return;
      self.mobReact(m, dt);
      var stun = false;
      for (var k in m.status) {
        if (m.status[k] < self.t) { delete m.status[k]; continue; }
        if (G.STATUS[k].stun) stun = true;
        if (G.STATUS[k].dps) { m.hp -= m.maxHp * G.STATUS[k].dps * dt / 1000; }
      }
      if (m.hp <= 0) { self.killMob(m); return; }
      if (stun || m.stagger > 0 || m.z > 2) return;   // loạng choạng hoặc đang bay: không làm gì được
      self.mobAI(m, p, dt);
    });
    this.mobs = this.mobs.filter(function (m) { return !m.dead || m.hp > 0; });
  };

  /* ======================================================================
   * SÁU LỐI ĐÁNH
   *
   * Con nào cũng chạy cùng một khung: idle -> tell (báo trước) -> act (ra đòn)
   * -> rest (hở, đây là lúc phạt nó). Cái quan trọng không phải con quái làm gì,
   * mà là NÓ CÓ BÁO TRƯỚC KHÔNG — có báo thì mới có gì để đọc, có đọc thì né mới
   * là kỹ năng chứ không phải may rủi. Bản trước không con nào báo cả, nên đánh
   * nhau chỉ còn là bấm cho hết máu.
   * ====================================================================== */
  Battle.prototype.mobAI = function (m, p, dt) {
    var d = dist(m, p);
    if (d < 380) m.agro = 1;
    if (!m.agro) return;
    var a = Math.atan2(p.y - m.y, p.x - m.x);
    var sp = m.spd * dt / 16.67;
    var self = this;

    function walk(mult, ang) {
      var s = sp * (mult === undefined ? 1 : mult);
      m.x = clamp(m.x + Math.cos(ang === undefined ? a : ang) * s, 20, self.wW - 20);
      m.y = clamp(m.y + Math.sin(ang === undefined ? a : ang) * s, 20, self.wH - 20);
    }
    // Vùng báo trước: đỏ dần lên rồi mới nổ. Đây là hợp đồng với người chơi.
    /* THẺ ĐÁNH. Con nào không giữ thẻ thì vẫn đi lại, vẫn áp sát, vẫn trông
     * hung hăng — nhưng KHÔNG ra đòn. Đây là chuẩn ngành và nó giải đúng hai
     * việc cùng lúc: giữ cho màn hình đọc được, và giữ cho ngân sách sát thương
     * nhận vào không nổ tung khi quái sống lâu gấp bốn năm lần.
     *
     * Không có nó thì cả chín con cùng đánh, và người chơi không theo dõi nổi
     * con nào đang báo đòn — nhất là trên màn dọc, nơi một phần năm phía dưới đã
     * bị ngón cái che mất. */
    function tell(ms, r, ox, oy) {
      if (!m.token) { m.wantToken = self.t; return; }
      m.phase = 'tell'; m.pt = ms; m.aim = a;
      self.fx.push({ k: 'tell', x: m.x + (ox || 0), y: m.y + (oy || 0), r: r, t: 0, ms: ms });
    }
    function hitPlayer(mul, opt) {
      if (dist(m, p) < m.r + p.r + (opt && opt.reach || 10)) {
        self.hurtPlayer(m.atk * (mul || 1), opt || {});
      }
    }

    if (m.phase === 'tell') {
      m.pt -= dt;
      m.facing = m.aim;
      if (m.pt > 0) return;
      m.phase = 'act'; m.pt = 0;
    }
    if (m.phase === 'rest') {
      m.pt -= dt;
      if (m.pt <= 0) { m.phase = 'idle'; m.cd = 300 + Math.random() * 400; }
      return;               // ĐANG HỞ — chỗ để dồn đòn
    }

    switch (m.ai) {

      /* Đông và yếu. Bâu vào, chạm là trừ máu. Có để mà chém cho đã tay. */
      case 'swarm':
        m.facing = a;
        if (d > m.r + p.r + 6) { walk(); }
        else { m.cd -= dt; if (m.cd <= 0) { m.cd = 900 + Math.random() * 700; m.phase = 'rest'; m.pt = 340;
          hitPlayer(1); this.fx.push({ k: 'ring', x: m.x, y: m.y, r: m.r + 14, t: 0, ms: 180, col: '#ff6a6a' }); } }
        break;

      /* HÚC. Vạch đỏ dài báo trước gần một giây, rồi lao thẳng — né sang NGANG là
       * thoát. Húc xong đơ 900ms: cửa sổ phạt rộng nhất trong đám quái thường. */
      case 'charger': {
        var T = m.T;
        if (m.phase === 'act') {
          m.pt += dt;
          walk(T.dashSpd / m.spd, m.aim);
          hitPlayer(1.6, { reach: 14 });
          if (m.pt >= T.dashMs) { m.phase = 'rest'; m.pt = T.recover;
            this.fx.push({ k: 'dust', x: m.x, y: m.y, t: 0, ms: 300 }); }
          break;
        }
        m.facing = a;
        if (d > 240) walk(0.9);
        else { m.cd -= dt; if (m.cd <= 0) { m.cd = 1800; tell(T.tell, m.r + 20,
          Math.cos(a) * 90, Math.sin(a) * 90); } }
        break;
      }

      /* NHẢY. Bay theo vòng cung, ĐANG BAY KHÔNG ĐỔI HƯỚNG — nên né được bằng
       * cách bước sang bên đúng lúc nó rời đất. Chạm đất nổ một vòng nhỏ. */
      case 'hopper': {
        var T2 = m.T;
        if (m.phase === 'act') {
          m.pt += dt;
          var k = clamp(m.pt / T2.hopMs, 0, 1);
          walk((T2.hopDist / T2.hopMs) * 16.67 / m.spd, m.aim);
          m.z = Math.sin(k * Math.PI) * 26;
          if (k >= 1) {
            m.z = 0; m.phase = 'rest'; m.pt = 520;
            this.fx.push({ k: 'ring', x: m.x, y: m.y, r: T2.shockR, t: 0, ms: 260, col: '#8fd14f' });
            if (dist(m, p) < T2.shockR) this.hurtPlayer(m.atk * 1.2, { status: null });
            this.impact(m.x, m.y, 0, G.FEEL.shake.mid);
          }
          break;
        }
        m.facing = a;
        if (d > 190) walk(0.55);
        else { m.cd -= dt; if (m.cd <= 0) { m.cd = 1500; tell(T2.tell, T2.shockR,
          Math.cos(a) * T2.hopDist, Math.sin(a) * T2.hopDist); } }
        break;
      }

      /* LƯỢN rồi BỔ NHÀO. Bay vòng quanh ở bán kính cố định nên khó chạm, tới lúc
       * bổ thì mới vào tầm — canh đúng nhịp đó mà chém. */
      case 'flyer': {
        var T3 = m.T;
        if (m.phase === 'act') {
          m.pt += dt;
          walk(T3.diveSpd / m.spd, m.aim);
          hitPlayer(1.1, { reach: 8 });
          if (m.pt >= T3.diveMs) { m.phase = 'rest'; m.pt = 460; }
          break;
        }
        m.facing = a;
        var orbA = a + Math.PI + Math.sin(this.t / 420 + m.r) * 0.9;
        if (d > T3.orbit + 30) walk(1.0);
        else if (d < T3.orbit - 30) walk(1.0, orbA);
        else walk(0.9, a + Math.PI / 2);
        m.cd -= dt;
        if (m.cd <= 0) { m.cd = 1700; tell(T3.tell, m.r + 12, Math.cos(a) * 60, Math.sin(a) * 60); }
        break;
      }

      /* BẮN. Giữ khoảng cách, nhả ba viên toè ra. Muốn giết thì phải xông vào —
       * nó lùi, nên đây là con bắt người chơi phải di chuyển. */
      case 'ranged': {
        var T4 = m.T;
        if (m.phase === 'act') {
          for (var s4 = 0; s4 < T4.shots; s4++) {
            var off = (s4 - (T4.shots - 1) / 2) * T4.spread;
            // r từ 6 lên 15: 6px trên sân rộng 820 là 0,73% bề ngang, trong khi
            // Touhou dùng ~1% TRÊN MÀN HÌNH DESKTOP. Nghiên cứu IEEE GEM 2014 đo
            // được rằng giữ nguyên kích thước phần tử khi màn hình nhỏ lại cho ra
            // game "khó hơn nhiều" — và người chơi nhận ra rồi bực.
            this.projs.push({ k: 'mobshot', x: m.x, y: m.y, a: m.aim + off, spd: T4.projSpd,
              life: 2600, dmg: m.atk * 0.55, r: 15, col: G.ELEMENTS[m.el].color,
              fade: G.DANMAKU.fadeInMs });
          }
          m.phase = 'rest'; m.pt = 700;
          break;
        }
        m.facing = a;
        if (d < T4.keep - 40) walk(1.0, a + Math.PI);
        else if (d > T4.keep + 60) walk(0.9);
        m.cd -= dt;
        if (m.cd <= 0) { m.cd = 1900; tell(T4.tell, 16, Math.cos(a) * 40, Math.sin(a) * 40); }
        break;
      }

      /* LÌ. Poise dày gấp ba, gần như không văng. Phải đục cho VỠ THẾ mới đánh
       * vào được tử tế — chính nó là con dạy người chơi để ý thanh lì đòn. */
      case 'tank': {
        var T5 = m.T;
        if (m.phase === 'act') {
          this.fx.push({ k: 'ring', x: m.x, y: m.y, r: T5.slamR, t: 0, ms: 300, col: '#b06fd0' });
          if (dist(m, p) < T5.slamR) this.hurtPlayer(m.atk * 1.5,
            { status: Math.random() < 0.5 ? 'poison' : null });
          this.impact(m.x, m.y, 0, G.FEEL.shake.heavy);
          m.phase = 'rest'; m.pt = 900;
          break;
        }
        m.facing = a;
        if (d > T5.slamR - 16) walk(1.0);
        else { m.cd -= dt; if (m.cd <= 0) { m.cd = 2200; tell(T5.tell, T5.slamR); } }
        break;
      }
    }
  };

  /* ------------------------------------------------------- ĐẠN BAY ----
   * Một vòng lặp, mọi hành vi. Thứ tự giải quyết CÓ CHỦ Ý:
   *
   *   hiện dần (chưa hitbox) -> đuổi -> bay -> hết đời -> va chạm -> nổ
   *
   * XUYÊN và NẢY giải quyết theo THỨ TỰ ƯU TIÊN, không đồng thời (luật của
   * Archero): nảy nếu có mục tiêu gần để nảy, không thì xuyên. Cho phép cả hai
   * cùng lúc là mở cửa cho bùng nổ tổ hợp mà không ai kiểm soát nổi.
   *
   * Mọi falloff hội tụ về "phát cuối còn khoảng một phần ba phát đầu":
   *   xuyên −33%/con (0,67³ = 30,1%) · nảy −30%/lần, tối đa 3 (0,70³ = 34,3%)
   */
  Battle.prototype.updateProjectiles = function (dt) {
    var self = this;
    for (var i = this.projs.length - 1; i >= 0; i--) {
      var pr = this.projs[i];

      // Đạn hiện dần và CHƯA CÓ HITBOX. Đây là bảo đảm công bằng chống chết-do-
      // đạn-sinh-ra-trên-đầu, không phải hiệu ứng trang trí.
      if (pr.fade > 0) { pr.fade -= dt; continue; }

      // Đuổi theo TỐC ĐỘ QUAY CÓ TRẦN, không phải bám dính. Bán kính vòng tối
      // thiểu R = v/radian(ω) là cái người chơi luôn có thể chạy ra khỏi — đó là
      // chỗ khác nhau giữa "đạn đuổi" và "đạn không né được".
      if (pr.homing) {
        var tgt = this.nearestHostile(pr.x, pr.y, 340);
        if (tgt) {
          var want = Math.atan2(tgt.y - pr.y, tgt.x - pr.x);
          var dd = ang(want - pr.a);
          var w = pr.homing * Math.PI / 180 * dt / 16.67;
          pr.a += clamp(dd, -w, w);
        }
      }

      pr.life -= dt;
      pr.x += Math.cos(pr.a) * pr.spd * dt / 16.67;
      pr.y += Math.sin(pr.a) * pr.spd * dt / 16.67;
      if (pr.life <= 0 || pr.x < -20 || pr.y < -20 || pr.x > this.wW + 20 || pr.y > this.wH + 20) {
        if (pr.explode && pr.life <= 0) this.boom(pr);
        this.projs.splice(i, 1); continue;
      }

      // Đạn của QUÁI: bay tới người chơi, né được bằng cú lăn như mọi đòn khác.
      if (pr.k === 'mobshot') {
        if (Math.hypot(pr.x - this.player.x, pr.y - this.player.y) < this.player.r + pr.r) {
          this.hurtPlayer(pr.dmg, {});
          this.fx.push({ k: 'spark', x: pr.x, y: pr.y, t: 0, ms: 180, col: pr.col });
          this.projs.splice(i, 1);
        }
        continue;
      }

      /* DẢI CHÍ MẠNG của cung. Phạt BẤT ĐỐI XỨNG, đúng bảng của Monster Hunter
       * thế hệ 4: quá gần chỉ MẤT thưởng (về 1,0×), không bao giờ tụt dưới gốc;
       * quá xa mới BỊ PHẠT (0,8× rồi 0,5×). Bất đối xứng đó là cái đẩy người
       * chơi tiến vào chỗ nguy hiểm thay vì lùi ra đứng bắn. */
      var distMul = 1;
      if (pr.critDist) {
        var travelled = Math.hypot(pr.x - pr.from.x, pr.y - pr.from.y);
        var B = pr.critDist.bands;
        distMul = pr.critDist.mul[pr.critDist.mul.length - 1];
        for (var bi = 0; bi < B.length - 1; bi++) {
          if (travelled < B[bi + 1]) { distMul = pr.critDist.mul[bi]; break; }
        }
      }
      var fall = Math.pow(1 - (pr.pierceFall || 0), pr.hits || 0);
      var d = this.playerDamage(pr.mul, { noCrit: pr.noCrit });
      var opt = { falloff: fall, distMul: distMul, critBonus: pr.critBonus || 0,
                  noCrit: pr.noCrit, from: pr.a,
                  move: { hs: G.FEEL.hitstop.light, kb: this.W.kb, poise: this.W.poise } };

      var hitSomething = false;
      if (this.boss && this.boss.hp > 0 && pr.hitSet.indexOf('boss') < 0) {
        var b = this.boss, hitPos = null;
        for (var pi = 0; pi < b.parts.length; pi++) {
          var pt = b.parts[pi];
          var px = b.x + Math.cos(pt.a + b.facing) * pt.d, py = b.y + Math.sin(pt.a + b.facing) * pt.d;
          if (Math.hypot(pr.x - px, pr.y - py) < pt.r + pr.r) { hitPos = { x: px, y: py }; break; }
        }
        if (!hitPos && Math.hypot(pr.x - b.x, pr.y - b.y) < b.r) hitPos = { x: pr.x, y: pr.y };
        if (hitPos) {
          this.dealToBoss(d, hitPos.x, hitPos.y, opt);
          pr.hitSet.push('boss'); pr.hits = (pr.hits || 0) + 1; hitSomething = true;
        }
      }
      for (var mi = 0; mi < this.mobs.length; mi++) {
        var m = this.mobs[mi];
        if (m.dead || pr.hitSet.indexOf(m) >= 0) continue;
        if (Math.hypot(pr.x - m.x, pr.y - m.y) < m.r + pr.r) {
          this.dealToMob(m, d, opt);
          pr.hitSet.push(m); pr.hits = (pr.hits || 0) + 1; hitSomething = true;
          this.impact(pr.x, pr.y, G.FEEL.hitstop.light, G.FEEL.shake.light, '#e8f2ff');
          if (!pr.pierce) break;
        }
      }

      if (hitSomething) {
        if (pr.explode) { this.boom(pr); this.projs.splice(i, 1); continue; }
        if (!pr.pierce) { this.projs.splice(i, 1); continue; }
      }
    }
  };

  /* Quả nổ của súng phóng. Explosive KHÔNG BAO GIỜ chí mạng (luật của Soul
   * Knight) — đó là cái ngăn diện rộng và chí mạng nhân chồng lên nhau. */
  Battle.prototype.boom = function (pr) {
    var e = pr.explode; if (!e) return;
    this.aoeDamage(pr.x, pr.y, e.r, e.dmg, { noCrit: true });
    this.fx.push({ k: 'ring', x: pr.x, y: pr.y, r: e.r, t: 0, ms: 300, col: '#ffb45a' });
    this.impact(pr.x, pr.y, G.FEEL.hitstop.boom, G.FEEL.shake.quake, '#ffb45a');
  };

  /* Mục tiêu thù địch gần nhất một điểm — dùng cho đạn đuổi, ụ súng và sét nảy. */
  Battle.prototype.nearestHostile = function (x, y, lim) {
    var best = null, bd = lim === undefined ? 1e9 : lim;
    if (this.boss && this.boss.hp > 0) {
      var db = Math.hypot(this.boss.x - x, this.boss.y - y) - this.boss.r;
      if (db < bd) { bd = db; best = this.boss; }
    }
    this.mobs.forEach(function (m) {
      if (m.dead || m.hp <= 0) return;
      var dm = Math.hypot(m.x - x, m.y - y) - m.r;
      if (dm < bd) { bd = dm; best = m; }
    });
    return best;
  };

  /* ---------------------------------------------------------- HIỆU ỨNG -- */
  /* Một đòn diện rộng đánh trúng bảy con cùng lúc thì bảy con số bung ra chồng khít
   * lên nhau và không đọc được cái nào — đúng cái bẫy đã dìm mấy game cùng thể loại
   * ("screen of rainbows filled with damage numbers"). Nên số mới phải TỰ TRÁNH số
   * cũ còn đang bay: chồng chỗ thì đẩy lên trên một nấc. */
  Battle.prototype.number = function (x, y, v, kind) {
    var dx = (Math.random() - 0.5) * 24, dy = 0, tries = 0;
    for (var i = this.msgs.length - 1; i >= 0 && tries < 6; i--) {
      var m = this.msgs[i];
      if (m.t > 260) break;                       // số đã bay xa thì thôi, không tránh nữa
      if (Math.abs(m.x + m.dx - (x + dx)) < 34 && Math.abs(m.y + (m.dy || 0) - (y + dy)) < 17) {
        dy -= 19; tries++; i = this.msgs.length;  // đẩy lên một nấc rồi dò lại từ đầu
      }
    }
    this.msgs.push({ x: x, y: y, v: v, kind: kind, t: 0, dx: dx, dy: dy });
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
    /* Khung nhìn THẬT (đơn vị sân) nhỏ hơn khung canvas đúng bằng hệ số zoom. Mọi
     * phép kẹp camera phải tính trên khung này, không phải trên W/H — tính nhầm
     * thì mép sân lòi ra một dải đen ở đúng lúc người chơi chạy sát biên. */
    var VW = W / ZOOM, VH = H / ZOOM;
    var camX = clamp(p.x - VW / 2, 0, Math.max(0, this.wW - VW));
    var camY = clamp(p.y - VH * 0.56, 0, Math.max(0, this.wH - VH));
    if (this.wW < VW) camX = (this.wW - VW) / 2;
    if (this.wH < VH) camY = (this.wH - VH) / 2;
    this.camX = camX; this.camY = camY; this.camZ = ZOOM;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    /* HAI KÊNH RIÊNG, không gộp (Nuclear Throne scr_screenshake.gml):
     *   - ĐÁ CAMERA có hướng, hất ngược lại phía nòng súng. Nó nói "khẩu này
     *     nặng", và vì có hướng nên nó đọc được là một cú giật chứ không phải
     *     một cái rung chung chung.
     *   - RUNG ngẫu nhiên, không hướng. Nó nói "vừa có gì đó nổ".
     * Gộp hai thứ này làm một là mất luôn phần thông tin của cái thứ nhất. */
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    if (this.kickX || this.kickY) ctx.translate(this.kickX || 0, this.kickY || 0);
    // Rung và đá camera đo bằng PIXEL MÀN HÌNH nên phải nằm NGOÀI phép zoom, không
    // thì cùng một con số rung sẽ mạnh yếu khác nhau tuỳ mức zoom.
    ctx.scale(ZOOM, ZOOM);
    ctx.translate(-camX, -camY);

    this.drawGround();
    this.drawDecor();
    // Vệt nguyên tố, vũng trơn, mưa tên sắp rơi — nằm trên mặt đất, dưới mọi thứ khác.
    if (this.drawSkillGround) this.drawSkillGround();
    // báo đỏ vẽ DƯỚI nhân vật để không che
    this.drawTelegraphs();
    this.drawStageStuff();
    this.drawChests();

    var ents = [];
    this.mobs.forEach(function (m) { if (!m.dead) ents.push({ y: m.y, d: m, k: 'mob' }); });
    if (this.boss && this.boss.hp > 0) ents.push({ y: this.boss.y, d: this.boss, k: 'boss' });
    ents.push({ y: p.y, d: p, k: 'player' });
    ents.sort(function (a, b) { return a.y - b.y; });
    for (var i = 0; i < ents.length; i++) {
      var e = ents[i];
      if (e.k === 'mob') this.drawMob(e.d);
      else if (e.k === 'boss') this.drawBoss(e.d);
      else this.drawPlayer(e.d);
    }
    this.drawProjectiles();
    // Tường chắn và ảo ảnh đứng ngang tầm nhân vật, vẽ sau khi đã xếp lớp xong.
    if (this.drawSkillEntities) this.drawSkillEntities();
    this.drawFx();
    // Bảng trên đầu vẽ SAU hiệu ứng: một cú nổ trùm lên đúng lúc mất máu mà lại
    // che mất thanh máu thì thanh máu đó vô dụng ở đúng khoảnh khắc cần nó nhất.
    this.drawPlayerPlate(p);
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
    var e = G.Atlas && G.Atlas.get('ground.' + this.bg);

    if (e) {
      // Ô lát đã được vá cho liền mạch từ lúc đóng gói (xem seamless_img trong
      // _tools/pack.py), nên cứ xếp thẳng — KHÔNG lật, không xoay: lật một ô là
      // mép nối thành ảnh soi gương và cái lưới hiện ra ngay.
      var tw = e.w, th = e.h;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, this.wW, this.wH); ctx.clip();
      for (var ty = 0; ty < this.wH; ty += th) {
        for (var tx = 0; tx < this.wW; tx += tw) {
          ctx.drawImage(e.img, 0, 0, tw, th, tx, ty, tw, th);
        }
      }
      ctx.restore();
    } else {
      // Chưa đóng gói art thì vẫn phải chơi được: lưới ô vuông như cũ.
      ctx.fillStyle = c[0];
      ctx.fillRect(0, 0, this.wW, this.wH);
      ctx.fillStyle = c[1]; ctx.globalAlpha = 0.35;
      for (var y = 0; y < this.wH; y += 120) {
        for (var x = ((y / 120) % 2) * 60; x < this.wW; x += 120) ctx.fillRect(x, y, 60, 60);
      }
      ctx.globalAlpha = 1;
    }

    // Tối bốn mép sân: hút mắt vào giữa, và nói rõ "hết đường rồi" mà không cần
    // vẽ tường.
    var vig = ctx.createLinearGradient(0, 0, 0, this.wH);
    vig.addColorStop(0, 'rgba(0,0,0,.34)');
    vig.addColorStop(0.14, 'rgba(0,0,0,0)');
    vig.addColorStop(0.86, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,.34)');
    ctx.fillStyle = vig; ctx.fillRect(0, 0, this.wW, this.wH);
    var vh = ctx.createLinearGradient(0, 0, this.wW, 0);
    vh.addColorStop(0, 'rgba(0,0,0,.30)');
    vh.addColorStop(0.16, 'rgba(0,0,0,0)');
    vh.addColorStop(0.84, 'rgba(0,0,0,0)');
    vh.addColorStop(1, 'rgba(0,0,0,.30)');
    ctx.fillStyle = vh; ctx.fillRect(0, 0, this.wW, this.wH);

    // viền sân
    ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, this.wW - 8, this.wH - 8);
  };

  Battle.prototype.drawDecor = function () {
    var ctx = this.ctx, c = BG[this.bg] || BG.grass;

    var keys = G.Atlas ? G.Atlas.keysUnder('doodads.' + this.bg) : [];
    if (keys.length) {
      this.decor.forEach(function (d) {
        // p*p thiên về đầu danh sách, mà đầu danh sách là mấy món nhỏ — nên
        // sân đầy cỏ vụn với dăm ba cái cây, chứ không phải rừng cây chắn hết
        // tầm nhìn. Thứ tự nhỏ-trước nằm trong asset-map, không nằm ở đây.
        var e = G.Atlas.get(keys[Math.min(keys.length - 1, (d.p * d.p * keys.length) | 0)]);
        if (!e) return;
        var sc = e.scale || 1;
        var w = e.w * sc, h = e.h * sc;
        ctx.save(); ctx.translate(d.x, d.y);
        ctx.fillStyle = 'rgba(0,0,0,.20)';
        ctx.beginPath(); ctx.ellipse(0, -1, w * 0.34, w * 0.13, 0, 0, TAU); ctx.fill();
        if (d.flip) ctx.scale(-1, 1);
        ctx.drawImage(e.img, 0, 0, e.w, e.h,
                      -e.ox * sc, -e.oy * sc, w, h);
        ctx.restore();
      });
      return;
    }

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

  Battle.prototype.drawStageStuff = function () {
    var ctx = this.ctx, self = this;

    this.gathers.forEach(function (g) {
      if (g.used) return;
      ctx.save(); ctx.translate(g.x, g.y);
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(0, 8, 16, 6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#7fd07f';
      ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(13, 6); ctx.lineTo(-13, 6); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#d8ffd8'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    });

  };

  Battle.prototype.drawChests = function () {
    var ctx = this.ctx, self = this;
    this.chests.forEach(function (c) {
      // Sắp hết hạn thì nhấp nháy — nhắc rằng rương sẽ biến mất.
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
  /* ======================================================================
   * NHÂN VẬT NHÌN THẲNG TỪ TRÊN XUỐNG — ngôn ngữ hình của dòng .io (Starve.io)
   *
   * Một khối BO GÓC làm thân, HAI MẮT ở mặt trước cho biết đang quay hướng nào,
   * và HAI BÀN TAY là hai khối nhỏ nổi ở hai bên. Vũ khí mọc ra từ bàn tay chứ
   * không phải từ rốn, nên cú vung là bàn tay quét thật một vòng cung.
   *
   * Vì sao chọn kiểu này: game nhìn thẳng từ trên xuống, mà người que thì phải vẽ
   * đứng như nhìn ngang — hai góc nhìn đá nhau, và ở cỡ 30px thì đám tay chân
   * thành một mớ nét rối. Khối bo góc + hai mắt đọc được hướng quay ngay lập tức
   * kể cả khi nhân vật chỉ to bằng đầu ngón tay, còn mọi trạng thái thì diễn bằng
   * BIẾN DẠNG cả khối (bẹp, xoay, nảy, nhấc lên) — thứ vẫn thấy rõ ở cỡ đó.
   * ====================================================================== */
  var SKIN = ['#f0d0b0', '#e8c098', '#d8a878', '#c08858', '#9a6a42', '#7a5030', '#5c3a22', '#f8e0c8'];
  var HAIRC = ['#2a2a2a', '#6a4a2a', '#c8a850', '#c04040', '#4060c0', '#40a060', '#a050c0', '#e8e8e8',
               '#f08040', '#40c0c0', '#8a5a3a', '#d8d040'];

  /* Màu THÂN lấy theo hệ của bộ GIÁP đang mặc, không phải một màu chết cứng: đổi
   * giáp là thấy ngay trên người, khỏi phải mở bảng chỉ số ra kiểm. Toàn màu nhạt
   * để hai mắt và vũ khí vẫn nổi lên trên. */
  var BODY_TINT = { none: '#dceaf4', fire: '#f7c6ad', water: '#bcdff5', earth: '#d8e6b6',
                    thunder: '#f5e5ae', light: '#f8f1da', dark: '#d2c7e6' };
  G.bodyTint = function (el) { return BODY_TINT[el] || BODY_TINT.none; };
  /* Hộp va chạm của người chơi là r=13 (setupPlayer). Thân vẽ ra phải to xấp xỉ
   * ngần đó, nếu không thì "trông thì hụt mà vẫn ăn đòn". ART là hệ số phóng cho
   * cả khối, đặt ở một chỗ để chỉnh một lần là xong. */
  var ART = 1.22;
  var HW = 9.4, HH = 8.6;    // nửa bề ngang / nửa bề dọc của thân
  var EX = 5.4, EY = 4.0;    // vị trí hai mắt trong hệ toạ độ thân
  var HR = 12.7;             // bán kính đặt hai bàn tay quanh thân

  /* Khối bo góc: nền của cả thân lẫn bàn tay. Tự vẽ chứ không dùng ctx.roundRect
   * vì game phải mở được từ file:// trên trình duyệt cũ. */
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* o: { facing, state, k, t, moving, body, hand, hair, cloth, weapon, elem, guardPerfect }
   *    body = màu thân (theo hệ giáp), hand = tông da của hai bàn tay. */
  function drawChar(ctx, o) {
    var st = o.state, k = o.k || 0, t = o.t || 0;
    var W = G.weaponOf(o.weapon) || {};
    var swing = Math.sin(k * Math.PI);

    // ---- biến dạng cả khối theo trạng thái ----
    var lift = 0;        // nhấc khỏi mặt đất (bóng co lại)
    var spin = 0;        // xoay quanh trục đứng
    var sx = 1, sy = 1;  // bẹp/giãn
    var push = 0;        // đẩy tới/lui theo hướng quay
    if (st === 'dodge') { spin = k * TAU; sx = 1.20; sy = 0.80; lift = Math.sin(k * Math.PI) * 4; }
    else if (st === 'ranbu') { spin = t / 40; lift = 11 + swing * 6; sx = sy = 1.06; }
    else if (st === 'fire') { push = -(o.recoil || 0) * 0.35; sx = 1 + swing * 0.05; sy = 1 - swing * 0.04; }
    else if (st === 'autofire') { push = -(o.recoil || 0) * 0.30; }
    else if (st === 'steady') { push = 1.5; sx = 0.97; sy = 1.03; }
    else if (st === 'lunge') { push = 6; sx = 1.26; sy = 0.82; }
    else if (st === 'charge') { var tr = Math.sin(t / 40) * (0.3 + 1.6 * (o.charge || 0)); push = -2 + tr * 0.4; sx = 0.94; sy = 1.06; }
    else if (st === 'guard') { push = 1.5; sx = 0.96; sy = 1.02; }
    else if (st === 'hurt') { push = -4; sx = 1.1; sy = 0.92; }
    else if (st === 'down') { sx = 1.30; sy = 0.66; }
    else if (o.moving) { lift = Math.abs(Math.sin(t / 105)) * 1.6; }   // nhún theo nhịp bước
    else { var br = Math.sin(t / 620) * 0.02; sx = 1 + br; sy = 1 - br; }

    // ---- bóng: co lại khi nhấc lên, đó là thứ cho biết đang ở trên không ----
    var shK = 1 - Math.min(0.55, lift / 22);
    ctx.fillStyle = 'rgba(0,0,0,' + (0.42 * shK) + ')';
    ctx.beginPath(); ctx.ellipse(0, 8, HW * ART * 1.3 * shK, HW * ART * 0.5 * shK, 0, 0, TAU); ctx.fill();

    ctx.save();
    ctx.translate(Math.cos(o.facing) * push, Math.sin(o.facing) * push - lift);
    ctx.rotate(o.facing + spin);
    ctx.scale(sx * ART, sy * ART);

    /* ---- HAI BÀN TAY ----
     * Tay đặt theo GÓC quanh thân, nên cú vung là tay quét thật một vòng cung chứ
     * không phải lưỡi kiếm tự xoay quanh rốn. Tay cầm vũ khí đi đúng cung mà vệt
     * chém vẽ ra, nhờ vậy nhìn tay là đoán được đòn sẽ quét tới đâu. */
    var bob = o.moving ? Math.sin(t / 105) * 0.20 : 0;
    var wA = handAngle(st, k, W, bob, o.arc);  // góc tay CẦM vũ khí
    var offA = (st === 'guard' ? -0.72 : -0.88) - bob;   // tay còn lại
    // SONG KIẾM: mỗi tay MỘT lưỡi, và hai tay soi gương nhau. Lúc vung, tay này
    // quét xuôi thì tay kia quét ngược, nên hai lưỡi cắt chéo qua nhau — đó mới là
    // hình ảnh đọc ra "song đao", chứ ôm cả hai lưỡi trong một tay thì nhìn như
    // cầm một bó dao.
    // Lệch pha một chút khi vung: nếu soi gương y hệt thì đúng giữa cú chém hai
    // lưỡi chồng khít lên nhau thành một, mất luôn cái nhìn "hai lưỡi cắt chéo".
    if (o.weapon === 'dual') offA = -wA + ((st === 'attack' || st === 'cleave') ? 0.34 : 0);

    drawHand(ctx, offA, o, st, o.weapon === 'sword');    // tay trái (đeo khiên nếu có)
    // Lưỡi của tay trái vẽ TRƯỚC thân: nó nằm phía sau, cho khối có chiều sâu.
    if (o.weapon === 'dual') drawHeldWeapon(ctx, 'dual', o.elem, o, offA, k, st, true);

    // ---- thân ----
    ctx.fillStyle = o.body;
    roundRect(ctx, -HW, -HH, HW * 2, HH * 2, 5.6); ctx.fill();
    ctx.strokeStyle = shade(o.body, -0.45); ctx.lineWidth = 2; ctx.stroke();
    // dải tóc ở mép SAU, cắt theo thân: giữ cho ô màu tóc còn ý nghĩa
    ctx.save();
    roundRect(ctx, -HW, -HH, HW * 2, HH * 2, 5.6); ctx.clip();
    ctx.fillStyle = o.hair;
    ctx.fillRect(-HW - 1, -HH - 1, 3.8, HH * 2 + 2);
    // khăn quàng màu áo vắt ngang, để ô màu áo cũng còn ý nghĩa
    ctx.fillStyle = o.cloth;
    ctx.fillRect(-HW + 3.4, -HH - 1, 2.0, HH * 2 + 2);
    ctx.restore();

    // ---- hai mắt ở mặt trước: thứ nói cho biết đang quay hướng nào ----
    // Chớp mắt ~4,2 giây một lần. Nhăn mặt khi ăn đòn thì cũng dùng đúng khung này.
    var blink = (t % 4200) < 130 || st === 'hurt';
    ctx.fillStyle = '#14181c';
    if (st === 'down') {                       // ngã: hai dấu nhân
        [-1, 1].forEach(function (s) {
          ctx.save(); ctx.translate(EX, s * EY); ctx.lineWidth = 1.6; ctx.strokeStyle = '#14181c';
          ctx.beginPath(); ctx.moveTo(-1.8, -1.8); ctx.lineTo(1.8, 1.8);
          ctx.moveTo(1.8, -1.8); ctx.lineTo(-1.8, 1.8); ctx.stroke(); ctx.restore();
        });
    } else if (blink) {
      [-1, 1].forEach(function (s) { ctx.fillRect(EX - 2.8, s * EY - 0.8, 5.6, 1.6); });
    } else {
      [-1, 1].forEach(function (s) {
        ctx.beginPath(); ctx.ellipse(EX, s * EY, 2.8, 3.2, 0, 0, TAU); ctx.fill();
      });
      ctx.fillStyle = '#ffffff';
      [-1, 1].forEach(function (s) {
        ctx.beginPath(); ctx.arc(EX + 0.9, s * EY - 1.1, 1.0, 0, TAU); ctx.fill();
      });
    }

    // ---- tay cầm vũ khí, vẽ SAU thân để lưỡi nằm trên ----
    drawHand(ctx, wA, o, st, false);
    if (o.weapon) drawHeldWeapon(ctx, o.weapon, o.elem, o, wA, k, st);

    ctx.restore();

    // ---- vệt quét của cú vung, vẽ ngoài phép scale để không bị méo ----
    if ((st === 'attack' || st === 'cleave') && swing > 0.05) {
      var arc = W.arc || 1.7;
      var reach = W.reach || 62;
      ctx.save();
      ctx.rotate(o.facing);
      ctx.globalAlpha = swing * 0.5;
      ctx.strokeStyle = st === 'cleave' ? '#ffd8a0' : '#e8f4ff';
      ctx.lineWidth = st === 'cleave' ? 9 : 5; ctx.lineCap = 'round';
      var a0 = -arc / 2 + arc * k;
      ctx.beginPath(); ctx.arc(0, 0, reach * 0.72, a0 - arc * 0.22, a0 + arc * 0.22); ctx.stroke();
      ctx.restore();
    }
    // ---- vòng khiên khi đang đỡ: một cung dày chắn ngay trước mặt ----
    if (st === 'guard') {
      ctx.save(); ctx.rotate(o.facing);
      ctx.strokeStyle = o.guardPerfect ? '#8fe4ff' : '#c2d4e6';
      ctx.lineWidth = 4.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0, HW * ART + 7, -0.85, 0.85); ctx.stroke();
      ctx.globalAlpha = 0.28; ctx.lineWidth = 10;
      ctx.beginPath(); ctx.arc(0, 0, HW * ART + 7, -0.85, 0.85); ctx.stroke();
      ctx.restore();
    }
  }

  /* GÓC BÀN TAY CẦM VŨ KHÍ, tính theo trạng thái.
   *
   * Đây là trái tim của cảm giác "chém": tay quét thật một vòng cung, nên lưỡi
   * đi ĐÚNG cung mà vệt chém vẽ ra — nhìn tay là đoán được đòn quét tới đâu.
   * Tách riêng ra vì cả hai đường vẽ đều cần: thân vẽ-bằng-code (drawChar) và
   * thân vẽ-bằng-ảnh (drawPlayer). Trước đây bản ảnh truyền cứng 0, thành ra
   * vũ khí đứng im như dán vào người trong khi vệt chém quét ngang — hai thứ
   * nói hai chuyện khác nhau. */
  function handAngle(st, k, W, bob, mvArc) {
    bob = bob || 0;
    // mvArc = cung của ĐÒN ĐANG RA, không phải cung mặc định của vũ khí. Đại Kiếm
    // mặc định quét 2.30 rad nhưng "Bổ dọc" chỉ 1.15 — lấy nhầm con số là tay đi
    // một đường còn vệt chém đi một đường khác.
    if (st === 'fire') { var ar = mvArc || W.arc || 0; return -ar / 2 + ar * k; }
    if (st === 'cleave') { var cr = W.cleaveArc || 2.5; return -cr / 2 + cr * k; }
    if (st === 'ranbu') return -2.2 + (k * 6.0) % TAU;   // loạn vũ: quay tít
    if (st === 'charge') return -1.75;                   // giơ ra sau nạp lực
    if (st === 'guard') return 1.05;
    if (st === 'aim' || st === 'lunge') return 0.34;
    if (st === 'down') return 1.5;
    return 0.88 + bob;
  }

  /* Một bàn tay = một khối bo góc nhỏ cùng màu thân, đặt ở góc `a` quanh thân. */
  function drawHand(ctx, a, o, st, shield) {
    var hx = Math.cos(a) * HR, hy = Math.sin(a) * HR;
    if (shield) {                      // Kiếm & Khiên: khiên nằm ở bàn tay rảnh
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(a);
      ctx.fillStyle = st === 'guard' ? (o.guardPerfect ? '#8fe4ff' : '#c2d4e6') : '#93a7ba';
      roundRect(ctx, -2.6, -6.4, 5.2, 12.8, 2.2); ctx.fill();
      ctx.strokeStyle = shade('#93a7ba', -0.5); ctx.lineWidth = 1.4; ctx.stroke();
      ctx.restore();
    }
    var hc = o.hand || o.body;
    ctx.fillStyle = hc;
    roundRect(ctx, hx - 2.9, hy - 2.9, 5.8, 5.8, 2.6); ctx.fill();
    ctx.strokeStyle = shade(hc, -0.45); ctx.lineWidth = 1.6; ctx.stroke();
  }

  /* Vũ khí mọc RA TỪ BÀN TAY (góc `wA`), chĩa gần như thẳng về phía trước.
   * `second` = lưỡi thứ hai của Song Kiếm (tay trái), chỉ khác tông kim loại. */
  function drawHeldWeapon(ctx, cls, elCol, o, wA, k, st, second) {
    var swing = Math.sin((k || 0) * Math.PI);
    ctx.save();
    ctx.translate(Math.cos(wA) * HR, Math.sin(wA) * HR);
    /* Lưỡi nghiêng theo tay. Lúc ĐỨNG thì chỉ nghiêng nửa vời, vì cầm hờ trước
     * mặt mới ra dáng thủ thế. Lúc VUNG thì nghiêng gần hết theo góc tay: lưỡi
     * nằm dọc theo bán kính, tức là vuông góc với hướng đi — đó mới là hình
     * ảnh của một nhát CHÉM chứ không phải một cú đâm đưa ngang.
     * Cộng thêm một cú lắc cổ tay ở giữa cung, để mũi lưỡi vượt lên trước bàn
     * tay rồi tụt lại — thiếu nó thì cả cây vũ khí trôi cứng như một cây kim
     * đồng hồ. */
    var sweep = (st === 'attack' || st === 'cleave' || st === 'ranbu');
    ctx.rotate(wA * (sweep ? 0.98 : 0.55) + (sweep ? swing * 0.42 : 0));

    /* Có ảnh vũ khí thì vẽ ảnh. Ba số rot/len/grip nằm trong asset-map chứ không
     * nằm ở đây, vì chúng là thuộc tính của TẤM ẢNH: biểu tượng kiếm vẽ đứng
     * (mũi lên) nên phải xoay 90°, nỏ vẽ nằm nên xoay 0°. Thay ảnh khác hướng =
     * sửa số trong manifest, không sửa hàm này. */
    var we = G.Atlas && G.Atlas.get('weapons.' + cls + '.' + ((o && o.el) || 'none'));
    if (!we && G.Atlas) we = G.Atlas.get('weapons.' + cls + '.none');
    if (we && we.len) {
      var up = Math.abs(we.rot) > 0.1;          // ảnh vẽ đứng hay nằm
      var axis = up ? we.h : we.w;              // cạnh chạy dọc thân vũ khí
      var sc = we.len / Math.max(1, axis);
      var iw = we.w * sc, ih = we.h * sc;
      ctx.rotate(we.rot);
      // GIẬT SÚNG: kéo cây súng lùi dọc chính trục của nó. Kênh thứ ba, tách hẳn
      // khỏi đá camera và rung — nó là cái duy nhất nói riêng về KHẨU SÚNG chứ
      // không phải về cả khung hình.
      var rc = (o && o.recoil) || 0;
      if (rc) ctx.translate(0, up ? rc : 0), ctx.translate(up ? 0 : -rc, 0);
      // đặt sao cho ĐIỂM NẮM rơi đúng vào bàn tay (gốc toạ độ)
      if (up) ctx.drawImage(we.img, 0, 0, we.w, we.h, -iw / 2, -we.grip * ih, iw, ih);
      else    ctx.drawImage(we.img, 0, 0, we.w, we.h, -(1 - we.grip) * iw, -ih / 2, iw, ih);
      ctx.restore();
      return;
    }

    function bar(x, y, w, h, fill) {
      ctx.fillStyle = 'rgba(12,16,20,.8)'; ctx.fillRect(x - 0.9, y - 0.9, w + 1.8, h + 1.8);
      ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
    }
    if (cls === 'sword') {
      bar(-1, -1.6, 15, 3.2, '#e4edf5'); bar(9, -1.6, 5, 3.2, elCol);
      ctx.fillStyle = '#6a5030'; ctx.fillRect(-3.6, -1.2, 3, 2.4);   // chuôi
    } else if (cls === 'great') {
      bar(-1, -3.4, 26 + swing * 5, 6.8, '#e8eef4');
      bar(18 + swing * 5, -3.4, 7, 6.8, elCol);
      ctx.fillStyle = '#6a5030'; ctx.fillRect(-4.6, -1.6, 4, 3.2);
    } else if (cls === 'spear') {
      bar(-11, -1.2, 36, 2.4, '#8a6a4a');
      ctx.fillStyle = 'rgba(12,16,20,.8)';
      ctx.beginPath(); ctx.moveTo(32, 0); ctx.lineTo(23, -4.8); ctx.lineTo(23, 4.8); ctx.fill();
      ctx.fillStyle = elCol;
      ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(23, -3.5); ctx.lineTo(23, 3.5); ctx.fill();
    } else if (cls === 'dual') {
      // MỘT lưỡi cho MỘT tay — hàm này được gọi hai lần khi cầm Song Kiếm.
      bar(-1.5, -1.2, 13, 2.4, second ? '#cfd8e2' : '#e6eef6');
      bar(8, -1.2, 4.5, 2.4, elCol);
      ctx.fillStyle = '#6a5030'; ctx.fillRect(-3.4, -1, 2.4, 2);   // chuôi
    } else if (cls === 'bow') {
      var pull = (st === 'aim') ? 6 : 0;
      ctx.strokeStyle = 'rgba(12,16,20,.8)'; ctx.lineWidth = 4.4;
      ctx.beginPath(); ctx.arc(0, 0, 12, -1.3, 1.3); ctx.stroke();
      ctx.strokeStyle = '#8a6a4a'; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.arc(0, 0, 12, -1.3, 1.3); ctx.stroke();
      var tx = 12 * Math.cos(1.3), ty = 12 * Math.sin(1.3);
      ctx.strokeStyle = '#e8f2ff'; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(tx, -ty); ctx.lineTo(tx - pull, 0); ctx.lineTo(tx, ty); ctx.stroke();
      if (pull) {
        ctx.strokeStyle = elCol; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(tx - pull, 0); ctx.lineTo(tx + 18, 0); ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Bốn màu mức nạp là quy ước của Punicon từ White Cat  // Bốn màu mức nạp là quy ước của Punicon từ White Cat (Overcharge/Combo Charge):
  // trắng -> vàng -> lục -> đỏ, vẽ thành VÒNG DƯỚI CHÂN nhân vật, không phải thanh
  // ở rìa màn hình. Mắt liếc xuống chân là biết đã nạp tới đâu mà không rời mục tiêu.
  var CHARGE_COL = ['#ffffff', '#ffd23f', '#8fd14f', '#ff3b30'];
  Battle.prototype.chargeLevel = function () {
    var p = this.player, W = this.W, full = 0;
    // Thanh nạp dưới chân: cây nạp thì đo tới nấc cuối, cây ghì súng thì đo tới
    // mốc 550ms — vượt mốc đó mới được thưởng.
    if (p.state === 'charge' && W.chargeMs) full = W.chargeMs[W.chargeMs.length - 1];
    else if (p.state === 'steady') full = 550;
    else return -1;
    return clamp(p.charge / full, 0, 1);
  };

  Battle.prototype.drawPlayer = function (p) {
    var ctx = this.ctx;
    // Bóng dưới chân co lại khi bay lên — trong một game nhìn thẳng từ trên xuống
    // đây là thứ DUY NHẤT nói cho biết nhân vật đang ở trên không.
    var pz = p.z || 0, shK = 1 - Math.min(0.6, pz / 110);
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,' + (0.4 * shK) + ')';
    ctx.beginPath(); ctx.ellipse(0, 10, 15 * shK, 6 * shK, 0, 0, TAU); ctx.fill();
    // Chìm vào bóng (Ảnh Độn / Tàn Ảnh): mờ đi và hơi ngả tím.
    if (p.fade !== undefined && p.fade < 1) ctx.globalAlpha = Math.max(0.12, p.fade);
    if (pz > 0) { ctx.translate(0, -pz); ctx.scale(1 + pz / 900, 1 + pz / 900); }

    /* CỬA SỔ ĐÒN NẶNG. Cơ chế nào người chơi không THẤY thì coi như không có:
     * ngưng tay đúng nhịp là một vòng vàng nở ra dưới chân, tap trong lúc vòng còn
     * đó thì ra đòn nặng. Vẽ luôn ở chân nhân vật, cùng chỗ với vòng mức nạp, để
     * mắt không phải rời mục tiêu. */
    if (p.heavyFrom && this.t >= p.heavyFrom && this.t <= p.heavyTo) {
      var hk = (this.t - p.heavyFrom) / Math.max(1, p.heavyTo - p.heavyFrom);
      ctx.save();
      ctx.globalAlpha = 0.9 - hk * 0.45;
      ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.ellipse(0, 10, 26 + hk * 12, 10 + hk * 5, 0, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.ellipse(0, 10, 26, 10, 0, 0, TAU); ctx.stroke();
      ctx.restore();
    }

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
      ctx.rotate(1.42); ctx.translate(0, -6);
      drawChar(ctx, { facing: 0, state: 'down', moving: false, t: this.t, k: 0,
        body: '#9fb0be', hand: SKIN[this.s.skin || 2], hair: HAIRC[this.s.hairColor || 0],
        cloth: '#5a6a7a', weapon: null, elem: '#888', el: 'none' });
      ctx.restore();
      // Vòng đếm ngược tự đứng dậy: vành vơi dần cho biết còn bao lâu.
      if (p.revives > 0) {
        var kk = clamp(p.downT / G.BAL.selfReviveMs, 0, 1);
        ctx.save(); ctx.translate(p.x, p.y);
        ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.ellipse(0, 6, 34, 19, 0, 0, TAU); ctx.stroke();
        ctx.strokeStyle = '#7fd07f'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.ellipse(0, 6, 34, 19, 0, -Math.PI / 2, -Math.PI / 2 + TAU * kk); ctx.stroke();
        ctx.restore();
      }
      return;
    }
    if (p.iframe > 0) ctx.globalAlpha = 0.5 + 0.5 * Math.sin(this.t / 50);
    // khiên chắn
    if (p.shield > 0) {
      ctx.strokeStyle = '#7fd4ff'; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.arc(0, -4, 26, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
    }
    if (p.overdrive > 0) {
      ctx.strokeStyle = '#ff7a3c'; ctx.lineWidth = 2; ctx.globalAlpha = 0.55 + 0.3 * Math.sin(this.t / 90);
      ctx.beginPath(); ctx.arc(0, -4, 30, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
    }
    /* Có ảnh thì vẽ ảnh. Ảnh chỉ lo phần THÂN — vũ khí vẫn là hình học xoay theo
     * góc ngắm, đúng công thức Enter the Gungeon / Nuclear Throne: thân lật
     * trái/phải, vũ khí là vật thể riêng quay tự do 360°. Sprite bốn hướng không
     * làm được chuyện đó, mà canvas thì xoay miễn phí. */
    var drawn = false;
    if (G.Atlas) {
      var st = p.state;
      // Ảnh theo NGƯỜI đang cầm. Không có người (save cũ, hoặc lỗi) thì về bộ
      // 'player.*' như trước, nên đổi trục sang NPC không làm vỡ đường vẽ.
      var hp_ = this.heroDef ? 'heroes.' + this.heroDef.id : 'player';
      var key = (st === 'attack' || st === 'skill') ? hp_ + '.attack'
              : (st === 'dodge') ? hp_ + '.dodge'
              : (p.moving ? hp_ + '.run' : hp_ + '.idle');
      // Lăn thì mượn khung CHẠY (chân co, đọc ra động tác hơn khung đứng);
      // mọi trạng thái khác thiếu ảnh thì về khung đứng như cũ.
      var pe = G.Atlas.get(key)
            || (st === 'dodge' ? G.Atlas.get(hp_ + '.run') : null)
            || G.Atlas.get(hp_ + '.idle')
            || G.Atlas.get('player.idle');
      if (pe) {
        // ĐÒN LĂN: kho không có sprite lăn nào cho nhân vật người chơi, mà cũng
        // không cần — quay nguyên người đúng MỘT vòng trong quãng lăn là mắt đọc
        // ra ngay, đây là cách hầu hết game 2D nhìn từ trên xuống vẫn làm. Ép
        // ngang giãn dọc một chút ở giữa vòng cho ra lực, và nhấc nhẹ khỏi mặt
        // đất để nó bật lên chứ không trượt.
        var rk = (st === 'dodge' && p.stateDur) ? clamp(p.stateT / p.stateDur, 0, 1) : -1;
        ctx.save();
        if (rk >= 0) {
          var bump = Math.sin(rk * Math.PI);
          ctx.translate(0, -5 - bump * 5);          // -5 = tâm thân, ảnh neo ở chân
          ctx.rotate(rk * TAU);
          ctx.scale(1 + bump * 0.18, 1 - bump * 0.18);
          ctx.translate(0, 5);
        }
        drawn = G.Atlas.draw(ctx, pe, 0, 12, {
          ms: (st === 'attack' || st === 'dodge') ? p.stateT : this.t,
          loop: !(st === 'attack' || st === 'dodge'),
          flip: Math.cos(p.facing) < 0,
          scale: 34 / Math.max(1, pe.h)
        });
        if (drawn && this.wp) {
          /* Vũ khí xoay theo hướng thật, và QUÉT theo cú vung — cùng một công
           * thức góc tay mà thân vẽ-bằng-code dùng, nên lưỡi đi đúng cung của
           * vệt chém. Nó cũng nằm trong phép quay của cú lăn nên lăn theo người.
           */
          var kk = p.stateDur ? clamp(p.stateT / p.stateDur, 0, 1) : 0;
          var WD = G.weaponOf(this.wp.wclass) || {};
          var bob2 = p.moving ? Math.sin(this.t / 105) * 0.20 : 0;
          var wA = handAngle(st, kk, WD, bob2, p.move && p.move.arc);
          var wo = { state: st, el: this.wp.el, k: kk };
          var wcol = G.ELEMENTS[this.wp.el].color;
          ctx.save(); ctx.rotate(p.facing);
          // Song Kiếm: lưỡi tay trái soi gương lưỡi tay phải, lệch pha một chút
          // khi vung để hai lưỡi cắt chéo nhau chứ không chồng khít thành một.
          if (this.wp.wclass === 'dual') {
            var oA = -wA + ((st === 'attack' || st === 'cleave') ? 0.34 : 0);
            drawHeldWeapon(ctx, 'dual', wcol, wo, oA, kk, st, true);
          }
          drawHeldWeapon(ctx, this.wp.wclass, wcol, wo, wA, kk, st);
          ctx.restore();
        }
        ctx.restore();
      }
    }
    if (!drawn) drawChar(ctx, {
      facing: p.facing, state: p.state, moving: p.moving, t: this.t,
      k: p.stateDur ? clamp(p.stateT / p.stateDur, 0, 1) : 0,
      charge: this.chargeLevel() > 0 ? this.chargeLevel() : 0,
      body: G.bodyTint(this.bodyEl), hand: SKIN[this.s.skin || 2],
      hair: HAIRC[this.s.hairColor || 0], cloth: '#3b6ea5',
      weapon: this.wp ? this.wp.wclass : 'rifle',
      recoil: p.recoil || 0,
      elem: G.ELEMENTS[this.wp ? this.wp.el : 'none'].color,
      el: this.wp ? this.wp.el : 'none',
      arc: p.move ? p.move.arc : 0,
      guardPerfect: p.state === 'guard' && p.guardT <= this.W.perfectMs
    });
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

  /* ================================================ BẢNG TRẠNG THÁI NGƯỜI CHƠI ==
   * Máu, thanh nạp và hai đồng hồ kỹ năng nằm NGAY TRÊN ĐẦU nhân vật, không nằm
   * dưới chân màn hình.
   *
   * Vì sao dời: trên màn dọc điện thoại, mắt bám vào nhân vật gần như suốt trận —
   * đó là chỗ mọi thứ nguy hiểm xảy ra. Thanh máu ở mép dưới bắt mắt phải rời mục
   * tiêu, đi hết chiều dọc màn hình, đọc, rồi quay lại; trong một trận mà cửa sổ
   * né chỉ 0,4 giây thì quãng đường đó là quãng đường bị ăn đòn. Survivor.io,
   * Archero và mọi game cùng khổ màn đều gắn thanh máu vào chân nhân vật đúng vì
   * lý do này.
   *
   * Thanh dưới chân màn hình VẪN GIỮ — nó là bảng số chi tiết (số máu, EXP, cấp).
   * Cái trên đầu là bảng CẢNH BÁO: chỉ ba thứ, đọc bằng màu và bằng bề dài.
   * ======================================================================== */
  Battle.prototype.drawPlayerPlate = function (p) {
    if (p.down) return;
    var ctx = this.ctx;
    var hk = clamp(p.hp / p.maxHp, 0, 1);
    // Màu đổi theo NGƯỠNG chứ không nội suy trơn: một dải màu chuyển dần thì
    // không có mốc nào để nhận ra, còn ba bậc thì "đang đỏ" là một sự kiện.
    var hcol = hk > 0.5 ? '#5fd06a' : hk > 0.25 ? '#f2c94b' : '#ff4f4f';
    var BW = 52, y = -34;

    ctx.save();
    ctx.translate(p.x, p.y);

    // ---- máu ----
    ctx.fillStyle = 'rgba(0,0,0,.62)';
    ctx.fillRect(-BW / 2 - 1, y - 1, BW + 2, 7);
    ctx.fillStyle = hcol;
    ctx.fillRect(-BW / 2, y, BW * hk, 5);
    // Khiên chồng LÊN TRÊN thanh máu chứ không nối tiếp: nó là lớp đệm đứng
    // trước máu, và vẽ đúng như vậy thì không phải giải thích.
    if (p.shield > 0) {
      var sk = clamp(p.shield / p.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(127,212,255,.85)';
      ctx.fillRect(-BW / 2, y, BW * sk, 5);
    }
    // Vạch chia mỗi 25% để ước lượng được "còn mấy đòn nữa thì chết".
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    for (var q = 1; q < 4; q++) ctx.fillRect(-BW / 2 + BW * q / 4, y, 1, 5);

    // ---- thanh NẠP, ngay dưới thanh máu ----
    // Một thanh duy nhất cho cả nạp vũ khí lẫn nạp kỹ năng: hai thứ không bao giờ
    // xảy ra cùng lúc, nên hai thanh riêng chỉ tổ chiếm chỗ.
    var ck = -1, ccol = '#e8f2ff', full = false;
    var wk = this.chargeLevel();
    if (wk >= 0) { ck = wk; ccol = '#ffd23f'; full = wk >= 0.999; }
    if (ck >= 0) {
      ctx.fillStyle = 'rgba(0,0,0,.62)';
      ctx.fillRect(-BW / 2 - 1, y + 7, BW + 2, 5);
      ctx.fillStyle = full ? '#ffffff' : ccol;
      ctx.fillRect(-BW / 2, y + 8, BW * ck, 3);
      if (full) {
        // Nạp đầy phải NHÁY, không chỉ đổi màu: mắt ngoại vi bắt được nhấp nháy
        // ở chỗ nó không bắt được một sắc độ.
        ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(this.t / 90));
        ctx.strokeStyle = ccol; ctx.lineWidth = 1.2;
        ctx.strokeRect(-BW / 2 - 2, y + 6, BW + 4, 7);
        ctx.globalAlpha = 1;
      }
    }

    // ---- hai đồng hồ kỹ năng, nằm TRÊN thanh máu ----
    // Hình tròn vơi dần, không phải con số: đọc một hình quạt nhanh hơn đọc chữ số,
    // và ở cỡ này chữ số cũng không đọc nổi.
    var n = 0, i;
    for (i = 0; i < 2; i++) if (this.skillDef(i)) n++;
    if (n) {
      var R = 6.5, gap = 17, x0 = -(n - 1) * gap / 2, j = 0;
      for (i = 0; i < 2; i++) {
        var sd = this.skillDef(i); if (!sd) continue;
        var cx = x0 + j * gap, cy = y - 12; j++;
        var left = this.skillCdLeft(i), cdFull = this.skillCdOf(sd);
        var ready = left <= 0;
        ctx.beginPath(); ctx.arc(cx, cy, R + 1.5, 0, TAU);
        ctx.fillStyle = 'rgba(0,0,0,.62)'; ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU);
        ctx.fillStyle = ready ? '#6fd4ff' : 'rgba(120,140,160,.55)'; ctx.fill();
        if (!ready) {
          // Phần TỐI là phần còn phải chờ — nó vơi đi, và cái vơi đi là cái mắt bắt.
          var k2 = clamp(left / Math.max(1, cdFull), 0, 1);
          ctx.beginPath(); ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + TAU * k2);
          ctx.closePath();
          ctx.fillStyle = 'rgba(10,16,24,.78)'; ctx.fill();
        } else {
          ctx.globalAlpha = 0.35 + 0.35 * Math.abs(Math.sin(this.t / 110));
          ctx.strokeStyle = '#bdefff'; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.arc(cx, cy, R + 3, 0, TAU); ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.fillStyle = ready ? '#062430' : 'rgba(220,235,245,.75)';
        ctx.font = 'bold 8px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), cx, cy + 0.5);
        ctx.textBaseline = 'alphabetic';
      }
    }
    ctx.restore();
  };

  Battle.prototype.drawMob = function (m) {
    var ctx = this.ctx, T = m.T;
    // Bóng co lại khi con quái bị hất lên trời — đó là thứ duy nhất cho biết nó
    // đang lơ lửng trong một game nhìn thẳng từ trên xuống.
    var z = m.z || 0, shK = 1 - Math.min(0.55, z / 40);
    ctx.save(); ctx.translate(m.x, m.y);
    ctx.fillStyle = 'rgba(0,0,0,' + (0.32 * shK) + ')';
    ctx.beginPath(); ctx.ellipse(0, m.r * 0.55, m.r * 0.95 * shK, m.r * 0.34 * shK, 0, 0, TAU); ctx.fill();
    ctx.translate(0, -z);
    // Bẹp người một nhịp ngay lúc ăn đòn: mắt đọc ra cú va trước cả con số máu.
    if (m.squash > 0) ctx.scale(1 + m.squash * 0.22, 1 - m.squash * 0.18);
    var base = m.gold ? '#f2d24b' : G.ELEMENTS[m.el].color;
    ctx.fillStyle = m.flash > 0 ? '#ffffff' : base;
    var r = m.r;

    /* Có ảnh thì vẽ ảnh, không thì rơi về hình học bên dưới. Nhờ cái rẽ nhánh này
     * mà thay art được TỪNG CON MỘT — làm xong con nào là con đó lên ảnh, mấy con
     * còn lại vẫn chạy bình thường, không phải chờ đủ bộ mới bật được. */
    if (G.Atlas) {
      var sprKey = 'mobs.' + m.tribe + '.idle';
      var se = G.Atlas.get(sprKey);
      if (se) {
        var moving = Math.abs(m.kbX) + Math.abs(m.kbY) > 0.2 || m.phase === 'move' || m.agro;
        var runKey = G.Atlas.get('mobs.' + m.tribe + '.move');
        var ent = (moving && runKey) ? runKey : se;
        // Thân chỉ lật trái/phải — luật rẻ nhất và đúng nhất cho top-down.
        var faceLeft = Math.cos(m.facing || 0) < 0;
        // Chuẩn hoá cỡ: hitbox là m.r, nên ảnh phải co về đúng đường kính đó,
        // không thì con quái to gấp đôi vùng ăn đòn của chính nó.
        var sc = (r * 2.15) / Math.max(1, ent.h);
        G.Atlas.draw(ctx, ent, 0, r * 0.55, {
          ms: this.t + m.x * 7, flip: faceLeft, scale: sc,
          tint: m.flash > 0 ? '#ffffff' : (m.gold ? '#f2d24b' : null),
          tintA: m.flash > 0 ? m.flash * 0.9 : 0.45
        });
        ctx.restore();
        this.drawMobPlate(m);
        return;
      }
    }

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
    this.drawMobPlate(m);
  };

  /* Thanh máu thì con nào cũng có, nhưng BIỂN TÊN chỉ hiện cho con đáng để ý:
   * con đang trong tầm với, con elite, con vàng. Sân chật mà con nào cũng đeo
   * biển thì chữ chồng lên nhau, che mất chính cái đang cần nhìn là vùng đỏ và
   * xác quái. */
  Battle.prototype.drawMobPlate = function (m) {
    var ctx = this.ctx;
    var near = dist(m, this.player) < 300;
    if (m.agro || near) {
      var showName = m.elite || m.gold || dist(m, this.player) < 150;
      ctx.save(); ctx.translate(m.x, m.y - (m.z || 0) - m.r - 16);
      ctx.font = '9px system-ui'; ctx.textAlign = 'center';
      if (showName) {
        var label = m.name + ' Lv.' + m.lv;
        var w = ctx.measureText(label).width + 10;
        ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(-w / 2, -10, w, 11);
        ctx.fillStyle = m.gold ? '#f2d24b' : '#dfe8f0'; ctx.fillText(label, 0, -1);
      }
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(-22, 2, 44, 3);
      ctx.fillStyle = '#5fd06a'; ctx.fillRect(-22, 2, 44 * clamp(m.hp / m.maxHp, 0, 1), 3);
      ctx.restore();
      this.drawPoise(m, -m.r - 10);
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
    // Quầng sáng theo HỆ dưới chân. Ảnh boss là ảnh có sẵn, không nhuộm được theo
    // hệ mà không phá nát bảng màu của nó — nên hệ nói bằng cái quầng này.
    var ecol = G.ELEMENTS[b.el].color;
    ctx.globalAlpha = 0.30 + 0.10 * Math.sin(this.t / 260);
    ctx.fillStyle = ecol;
    ctx.beginPath(); ctx.ellipse(0, r * 0.5, r * 0.92, r * 0.34, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;

    /* Ảnh boss tra theo DÁNG THÂN (blob/drake/golem/…), không theo từng con:
     * 56 Behemoth chỉ có 21 dáng, nên một tấm ảnh phục vụ cả họ. Tên, thanh máu,
     * quầng hệ và bộ phận điểm yếu lo phần phân biệt. Thiếu ảnh dáng nào thì dáng
     * đó rơi về hình học cũ — không phải chờ đủ bộ mới bật được. */
    var drawn = false;
    if (G.Atlas && b.def) {
      var bk = 'bosses.' + b.def.body + '.';
      var ent = (b.state === 'attack' && G.Atlas.get(bk + 'attack')) || G.Atlas.get(bk + 'idle');
      if (ent) {
        ctx.save();
        // Gục: đổ nghiêng và bẹp xuống, cùng ngôn ngữ với con quái thường.
        if (b.down > 0) { ctx.rotate(0.42); ctx.scale(1.06, 0.86); }
        // Khớp cỡ vào hitbox: lấy cạnh DÀI hơn làm chuẩn, nếu không con cá mập
        // dài 123px sẽ tràn ra gấp đôi vùng ăn đòn của chính nó.
        var sc = (r * 2.45) / Math.max(1, ent.h, ent.w * 0.66);
        G.Atlas.draw(ctx, ent, 0, r * 0.5, {
          ms: this.t, flip: Math.cos(b.facing) < 0, scale: sc,
          tint: b.flash > 0 ? '#ffffff' : null,
          tintA: b.flash > 0 ? b.flash * 0.9 : 0
        });
        ctx.restore();
        drawn = true;
      }
    }
    if (!drawn) {
      ctx.save();
      ctx.rotate(b.facing + Math.PI / 2);
      if (b.down > 0) ctx.rotate(0.9);
      this.drawBossBody(ctx, b, r);
      ctx.restore();
    }

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

  /* Thanh LÌ ĐÒN dưới thanh máu: người chơi phải THẤY mình sắp đục vỡ tới nơi,
   * không thì cơ chế poise chỉ là một con số giấu trong code. */
  Battle.prototype.drawPoise = function (m, y) {
    if (m.poise >= m.poiseMax - 0.5 && m.stagger <= 0) return;
    var ctx = this.ctx, w = m.r * 1.8;
    ctx.save(); ctx.translate(m.x - w / 2, m.y - (m.z || 0) + y);
    if (m.stagger > 0) {
      ctx.fillStyle = '#f2d24b';
      ctx.fillRect(0, 0, w, 3);
    } else {
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, w, 3);
      ctx.fillStyle = '#c8a0ff'; ctx.fillRect(0, 0, w * (m.poise / m.poiseMax), 3);
    }
    ctx.restore();
  };

  Battle.prototype.drawFx = function () {
    var ctx = this.ctx;
    this.fx.forEach(function (f) {
      var k = f.t / f.ms;
      ctx.save(); ctx.globalAlpha = 1 - k;
      // Hiệu ứng của hệ kỹ năng nằm ở js/skills.js — hàm này trả về true nếu đã vẽ.
      if (G.drawSkillFx && G.drawSkillFx(ctx, f, k)) { ctx.restore(); return; }
      if (f.k === 'slash') {
        /* VỆT CHÉM = một dải VUỐT NHỌN, không phải một nét cung dày đều.
         *
         * Mép DẪN của dải nằm đúng chỗ bàn tay đang ở (cùng công thức handAngle
         * dùng), nên lưỡi kiếm chạy trong lòng vệt chứ không rời nhau. Bề dày
         * phình hết cỡ ở mép dẫn rồi vuốt về 0 ở đuôi — mắt đọc ra ngay hướng
         * quét và tốc độ, thứ mà một nét cung dày đều không nói được.
         * Vẽ chồng: một lớp dày mờ làm thân vệt, một nét mảnh trắng ở mép dẫn
         * làm ánh thép. Lớp sáng bật 'lighter' để chồng lên nhau thì rực hơn. */
        ctx.translate(f.x, f.y);
        // kk = tiến độ QUÉT (kẹp lại ở 1 khi cung đã đi hết), k = tiến độ TAN.
        var kk = f.sweep ? Math.min(1, k / f.sweep) : k;
        var k0 = f.k0 || 0;
        var arc = f.arc, aL = f.a - arc / 2 + arc * (k0 + (1 - k0) * kk);
        var tail = arc * (f.big ? 0.62 : 0.5);
        var aT = arc > 6 ? aL - tail
                         : Math.max(f.a - arc / 2 + arc * k0, aL - tail);
        var rOut = f.r * (f.big ? 1.0 : 0.94), rIn = f.r * 0.20;
        var N = 16, i, u, a, ri;
        ctx.beginPath();
        for (i = 0; i <= N; i++) {
          a = aT + (aL - aT) * (i / N);
          ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rOut, Math.sin(a) * rOut);
        }
        for (i = N; i >= 0; i--) {
          u = i / N; a = aT + (aL - aT) * u;
          ri = rOut - (rOut - rIn) * Math.pow(u, 0.85);
          ctx.lineTo(Math.cos(a) * ri, Math.sin(a) * ri);
        }
        ctx.closePath();
        ctx.globalAlpha = (1 - k) * 0.55;
        ctx.fillStyle = f.col; ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (1 - k) * 0.55;
        ctx.strokeStyle = f.col; ctx.lineWidth = f.big ? 3.5 : 2.4; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, 0, rOut, aT, aL, false); ctx.stroke();
        // ánh thép ở mép dẫn: một gạch ngắn nối trong ra ngoài, đúng chỗ lưỡi
        ctx.globalAlpha = (1 - k) * 0.9; ctx.lineWidth = f.big ? 4 : 2.6;
        ctx.beginPath();
        ctx.moveTo(Math.cos(aL) * rIn, Math.sin(aL) * rIn);
        ctx.lineTo(Math.cos(aL) * rOut, Math.sin(aL) * rOut);
        ctx.stroke();
      } else if (f.k === 'ring') {
        ctx.strokeStyle = f.col || '#ffffff'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r * (0.5 + k * 0.8), f.r * 0.72 * (0.5 + k * 0.8), 0, 0, TAU); ctx.stroke();
      } else if (f.k === 'puff') {
        ctx.fillStyle = f.col;
        for (var i = 0; i < 6; i++) {
          var a = i / 6 * TAU;
          ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * 30 * k, f.y + Math.sin(a) * 30 * k, 6 * (1 - k), 0, TAU); ctx.fill();
        }
      } else if (f.k === 'heal' || f.k === 'buff') {
        ctx.strokeStyle = f.k === 'heal' ? '#7fd07f' : '#7fd4ff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r * (0.3 + k), f.r * 0.6 * (0.3 + k), 0, 0, TAU); ctx.stroke();
      } else if (f.k === 'tell') {
        // Vùng báo trước của quái: viền đỏ dày dần, và một vòng trong thu lại cho
        // biết còn bao lâu thì nổ — cùng ngôn ngữ với vùng đỏ của Behemoth.
        // ĐỎ chỉ dành cho thứ sắp đánh vào NGƯỜI CHƠI. Vùng đổ bộ của chính mình
        // dùng vàng — nếu không thì hai thứ trái ngược nhau chung một màu, và người
        // chơi mất đúng cái tín hiệu quan trọng nhất trên sân.
        var tCol = f.friendly ? '#f2c14e' : '#e33b30';
        var tCol2 = f.friendly ? '#ffe74c' : '#ff6a5a';
        ctx.globalAlpha = 0.20 + 0.45 * k;
        ctx.fillStyle = tCol;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = tCol2; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 - k), 0, TAU); ctx.stroke();
      } else if (f.k === 'spark') {
        // Loé trắng ngay chỗ lưỡi chạm: mắt bắt được điểm va trước khi kịp đọc số.
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = f.col || '#ffffff';
        var sr = 4 + 16 * k;
        ctx.beginPath(); ctx.arc(f.x, f.y, sr * (1 - k * 0.5), 0, TAU); ctx.fill();
        ctx.strokeStyle = f.col || '#ffffff'; ctx.lineWidth = 2 * (1 - k);
        for (var si = 0; si < 5; si++) {
          var sa = (f.x + si) * 1.7 + si * 1.257;
          ctx.beginPath();
          ctx.moveTo(f.x + Math.cos(sa) * sr * 0.7, f.y + Math.sin(sa) * sr * 0.7);
          ctx.lineTo(f.x + Math.cos(sa) * (sr + 14 * k), f.y + Math.sin(sa) * (sr + 14 * k));
          ctx.stroke();
        }
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

  /* Chí mạng phải là một LOẠI SỰ KIỆN KHÁC, không phải một con số to hơn: nếu
   * người chơi phải nhìn kỹ mới phân biệt được thì phản hồi coi như hỏng. Nên
   * nó đổi cả màu, cỡ chữ lẫn độ đậm cùng lúc. */
  var NUM_COL = { weak: '#ffd23f', crit: '#ff4f7a', adv: '#ff9a4a', dis: '#8fa3b5', norm: '#ffffff', take: '#ff5a5a', heal: '#7fd07f', shield: '#7fd4ff', dot: '#c8a0ff' };
  var NUM_SIZE = { weak: 22, crit: 24, norm: 17 };
  Battle.prototype.drawNumbers = function () {
    var ctx = this.ctx;
    this.msgs.forEach(function (m) {
      var k = m.t / 900;
      ctx.save();
      ctx.globalAlpha = 1 - k * k;
      ctx.translate(m.x + m.dx, m.y + (m.dy || 0) - 34 * k - 8);
      ctx.font = (m.kind === 'crit' ? '900 ' : 'bold ') + (NUM_SIZE[m.kind] || 17) + 'px system-ui';
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
    // Lớp ngắm vẽ ở toạ độ SÂN nhưng được gọi sau khi camera đã trả về gốc, nên
    // nó phải tự dựng lại đúng phép zoom — nếu không thì vòng ngắm lệch khỏi chân
    // nhân vật đúng bằng hệ số zoom, và lệch càng xa khi chạy ra mép sân.
    ctx.save(); ctx.scale(this.camZ || 1, this.camZ || 1);
    if (this.drawSkillAim) this.drawSkillAim(ox, oy);
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
    ctx.restore();
  };

  // Màn menu dùng lại đúng người que này, để nhân vật ở sân guild và nhân vật
  // trong trận là MỘT — đổi giáp thấy ngay ở cả hai chỗ.
  G.drawChar = drawChar;
  if (G.installSkills) G.installSkills(Battle);

  G.Battle = Battle;
  G.VIEW = { W: W, H: H };
})(window.DP = window.DP || {});
