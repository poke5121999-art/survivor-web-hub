/* ==========================================================================
 * META — hồ sơ người chơi, lò rèn, gacha, nhiệm vụ, lưu game.
 * Tách khỏi js/game.js: file kia lo một trận đấu, file này lo mọi thứ giữa
 * các trận. Không đụng tới canvas.
 * ========================================================================== */
(function (G) {
  'use strict';

  var SAVE_KEY = 'dp.save.v2';
  var uidSeq = 1;
  function uid() { return 'u' + (uidSeq++) + '_' + ((Math.random() * 1e6) | 0); }

  /* ---------------------------------------------------------- NGẪU NHIÊN -- */
  // RNG có hạt giống, để một con boss luôn sinh ra cùng một bộ đồ.
  function seeded(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return function () { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
  }

  /* ------------------------------------------------ THANG CHỈ SỐ TRANG BỊ --
   * Số gốc là số THẬT của Cocytus Amarok (SS) trong wiki; các hạng thấp hơn
   * là hệ số rút xuống. Ba bậc evolve dùng đúng tỉ lệ đọc được từ cây vũ khí
   * Amarok: 135/306 = 0.44, 274/306 = 0.895, 306/306 = 1.00.
   */
  /* THANG NÉN LẠI. Bản cũ để SS/B = 306/85 = 3,6x công vật lý, CỘNG 656/180 =
   * 3,6x công hệ nữa — tức bậc hiếm cao mua số to hơn. Đó là cái Soul Knight cố
   * ý không làm: tính trên cả 500 vũ khí của nó, toàn bộ Trắng -> Magenta chỉ
   * chênh 2,4x DPS trung vị, và đường cong còn KHÔNG đơn điệu (Cam mạnh hơn Đỏ).
   * Wiki nói thẳng: "màu tên thể hiện XÁC SUẤT GẶP, nên không nhất thiết thể
   * hiện độ hữu dụng". Bậc cao mua CƠ CHẾ MỚI, không mua số.
   *
   * Số ở đây là ATK, và sát thương mỗi viên = W.dmg × ATK/10. SS ở cấp đồ tối
   * đa cho 46 ATK; cộng công nhân vật Lv60 (64) ra ~110, tức nhân 11 lần sát
   * thương gốc của cây súng. */
  // Công HỆ hạ thêm một nấc nữa. Ở 46/30 nó đóng góp 65% tổng sát thương, tức
  // hệ nguyên tố gánh nhiều hơn cả cây súng. Ở 46/16 nó còn ~35% — đủ để việc
  // chọn hệ là một quyết định thật, không đủ để nó át phần bắn.
  var RANK_W = { SS: { p: 46, e: 16 }, S: { p: 34, e: 12 }, A: { p: 24, e: 8 }, B: { p: 15, e: 5 } };
  var RANK_A_MUL = { SS: 1.00, S: 0.68, A: 0.45, B: 0.28 };
  var ARMOR_BASE = {
    head: { hp: 252, pdef: 0,   edef: 148, patk: 0  },
    body: { hp: 0,   pdef: 327, edef: 199, patk: 0  },
    arm:  { hp: 52,  pdef: 112, edef: 151, patk: 7 },
    leg:  { hp: 120, pdef: 105, edef: 210, patk: 3 }
  };
  var EVO_MUL = [0.44, 0.895, 1.00];
  // Limit-break bonus cộng vào công vật lý, đúng số wiki: Normal +20/+42/+55, Heat +44/+66/+89.
  // Chia theo cùng tỉ lệ với RANK_W (306 -> 46) để phần thưởng limit-break giữ
  // đúng trọng số cũ so với chỉ số nền, thay vì bỗng dưng gánh cả cây.
  var LB_BONUS = { normal: [0, 3, 6, 8, 8], heat: [0, 7, 10, 13, 13], soul: [0, 5, 8, 11, 11] };
  var MAX_LV = 40, MAX_LB = 4, MAX_EVO = 2;

  G.MAX_LV = MAX_LV; G.MAX_LB = MAX_LB; G.MAX_EVO = MAX_EVO;

  /* ------------------------------------------------------ SINH TRANG BỊ --- */

  function rollAbility(rng, kind) {
    var pool = G.ABILITIES.filter(function (a) {
      if (kind !== 'weapon' && /Dmg|Cleave|Lunge|Frenzy|Snipe|guard/.test(a.id)) {
        return /^(fire|water|earth|thun|hydro)/.test(a.id) || /Res$/.test(a.id);
      }
      return true;
    });
    var a = pool[(rng() * pool.length) | 0];
    var v = a.v[0] + Math.round(rng() * (a.v[1] - a.v[0]));
    return { id: a.id, v: v };
  }

  G.forgeGear = function (behemothId, kind, seedExtra) {
    var b = G.behemothById(behemothId);
    if (!b) return null;
    var rng = seeded(behemothId + '|' + kind + '|' + (seedExtra || ''));
    var g = {
      uid: uid(), kind: kind, src: behemothId, rank: b.rank,
      lv: 1, evo: 0, lb: 0, gold: true
    };
    if (kind === 'weapon') {
      g.wclass = G.wclassOfBehemoth(b); g.wtype = b.type; g.el = b.el;
      g.name = weaponName(b, 0);
      g.green = b.ability || null;      // ability cố định hiện chữ xanh lá
    } else {
      g.el = b.el; g.defEl = counterOf(b.el);
      g.name = armorName(b, kind);
    }
    g.abilities = [rollAbility(rng, kind), rollAbility(rng, kind)];
    return g;
  };

  /* BỘ TRƯNG BÀY — mười cây chọn tay, mỗi cây một lớp, để xem art và kỹ năng.
   *
   * Không phải cheat cho vui: mở khoá kỹ năng thứ hai cần Lv.8 và cả sáu hệ mới
   * thấy hết được lớp nguyên tố, mà cày tới đó thì lâu. Mười cây này là SS, tối
   * cấp, limit break đủ và tiến hoá tối đa — tức là trạng thái mà mọi thứ đều
   * bật, xem một lần là biết game có gì.
   * Bấm lại không nhân bản: món nào đã có rồi thì bỏ qua. */
  /* Bộ trưng bày phải phủ ĐỦ MƯỜI LỚP, mỗi lớp một cây — nếu không thì có lớp
   * người chơi không bao giờ được cầm thử. Danh sách này bám theo G.WCLASS_SPLIT:
   * đổi bảng tách lớp mà quên đổi đây thì bộ trưng bày lặng lẽ có hai cây trùng
   * lớp và thiếu một lớp, nên có phép kiểm khoá lại đúng chuyện đó. */
  var SHOWCASE = [
    { src: 'felnarog',    note: 'súng trường hoả' },   // rifle
    { src: 'ulkatron',    note: 'súng săn sét' },      // shotgun
    { src: 'magna',       note: 'bắn tỉa thổ' },       // sniper
    { src: 'carniva',     note: 'cung hoả' },          // bow
    { src: 'ayame',       note: 'gậy phép hoả' },      // staff (loại Soul)
    { src: 'lich',        note: 'súng phóng thổ' },    // launcher
    { src: 'gorynych',    note: 'tia nhiệt hoả' },     // laser
    { src: 'amarok',      note: 'kiếm khí thuỷ' },     // blade
    { src: 'pandemonius', note: 'lưỡi hái sét' },      // scythe
    { src: 'galdrux',     note: 'cầu lửa sét' }        // orb
  ];

  G.showcaseList = function () { return SHOWCASE.slice(); };

  G.grantShowcase = function (s) {
    var added = [];
    SHOWCASE.forEach(function (it) {
      if (s.gear.some(function (g) { return g.src === it.src && g.kind === 'weapon' && g.show; })) return;
      var g = G.forgeGear(it.src, 'weapon', 'showcase');
      if (!g) return;
      var b = G.behemothById(it.src);
      g.lv = MAX_LV; g.lb = 4; g.evo = MAX_EVO; g.show = true;
      g.name = weaponName(b, MAX_EVO);
      s.gear.push(g);
      added.push(g);
    });
    return added;
  };

  function counterOf(el) { for (var k in G.ELEM_BEATS) if (G.ELEM_BEATS[k] === el) return k; return 'none'; }

  /* Hậu tố tên theo LỚP, ba bậc tiến hoá. Bốn dòng cuối là bốn lớp mới, và
   * chúng phải có mặt ở đây: tên món tra thẳng vào bảng này, thiếu một dòng là
   * món đó mang tên `undefined`. Mỗi bộ ba đi từ đồ vật (bậc 0) sang khái niệm
   * (bậc 2), đúng nhịp sáu dòng cũ. */
  var W_SUFFIX = {
    rifle:    ['Rifle', 'Cadence', 'Aspect'],
    shotgun:  ['Scattergun', 'Maw', 'Eclipse'],
    sniper:   ['Lance', 'Pursuit', 'Zenith'],
    bow:      ['Bow', 'Cantus', 'Requiem'],
    staff:    ['Scepter', 'Oracle', 'Apotheosis'],
    launcher: ['Mortar', 'Ruin', 'Apex'],
    laser:    ['Prism', 'Meridian', 'Daybreak'],
    blade:    ['Ionblade', 'Crescent', 'Severance'],
    scythe:   ['Reaper', 'Gyre', 'Harvest'],
    orb:      ['Censer', 'Ember', 'Conflagration']
  };
  var A_SUFFIX = { head: 'Visor', body: 'Vest', arm: 'Gauntlets', leg: 'Leggings' };
  function shortName(b) { var p = b.n.split(' '); return p[p.length - 1]; }
  /* Tên món phải đi qua ĐÚNG hàm mà forgeGear dùng để đặt lớp.
   *
   * `G.wclassOf(b.weapon)` chỉ dịch tên lớp cũ sang lớp cũ tương ứng, nên nó
   * KHÔNG biết chuyện tách đôi: con Amarok bị băm về `blade` mà tên vẫn là
   * "Amarok's Rifle" — cầm một cây kiếm khí đọc chữ Rifle. `wclassOfBehemoth`
   * là hàm duy nhất biết bảng tách, nên tên gọi nó, y như forgeGear. */
  function weaponName(b, evo) {
    return shortName(b) + "'s " + W_SUFFIX[G.wclassOfBehemoth(b)][evo];
  }
  function armorName(b, kind) { return shortName(b) + ' ' + A_SUFFIX[kind]; }

  /* --------------------------------------------------- TÍNH CHỈ SỐ MÓN --- */
  G.gearStats = function (g) {
    var lvT = (g.lv - 1) / (MAX_LV - 1);            // 0 ở lv1, 1 ở lv40
    var scale = 0.35 + 0.65 * lvT;                  // lv1 = 35% chỉ số max
    if (g.kind === 'weapon') {
      var R = RANK_W[g.rank] || RANK_W.B;
      var evoM = EVO_MUL[g.evo] || EVO_MUL[0];
      var lbTab = LB_BONUS[g.wtype] || LB_BONUS.normal;
      return {
        patk: Math.round(R.p * evoM * scale) + (lbTab[g.lb] || 0),
        eatk: Math.round(R.e * evoM * scale),
        el: g.el
      };
    }
    // Giáp: wiki chỉ liệt kê MỘT bộ số cho mỗi mảnh (không có ba bậc evolve như vũ khí),
    // nên số đó được hiểu là giá trị ở Lv.40 chưa tiến hóa. Tiến hóa cộng thêm 25% mỗi bậc.
    var m = (RANK_A_MUL[g.rank] || 0.28) * (1 + 0.25 * g.evo) * scale;
    var B = ARMOR_BASE[g.kind] || ARMOR_BASE.head;
    var lbA = [0, 0.06, 0.13, 0.21, 0.21][g.lb] || 0;
    return {
      hp:   Math.round(B.hp   * m * (1 + lbA)),
      pdef: Math.round(B.pdef * m * (1 + lbA)),
      edef: Math.round(B.edef * m * (1 + lbA)),
      patk: Math.round(B.patk * m * (1 + lbA)),
      defEl: g.defEl
    };
  };

  G.gearMaxLv = function () { return MAX_LV; };
  G.canEvolve = function (g) { return g.lv >= MAX_LV && g.evo < MAX_EVO && (g.rank === 'S' || g.rank === 'SS'); };

  /* ------------------------------------------------------------ HỒ SƠ ----- */
  G.newSave = function (name) {
    return {
      v: 2, name: name || 'Hound',
      gender: 0, face: 0, skin: 2, hair: 0, hairColor: 0, voice: 0,
      lv: 1, exp: 0,
      // HAI đồng tiền. `core` (Lõi Rồng) không phải đồng thứ ba: nó không mua
      // được gì trong tiệm, chỉ có từ quay trúng đồ đã có, và chỉ tiêu được vào
      // Tinh Luyện với Tiến Hoá. Nó là con dấu ghi lại số lần quay thừa.
      gold: 3000, gem: 1600, core: 0,
      gear: [],
      // roster: mọi nhân vật đã quay được. Mỗi người TỰ GIỮ trang bị của mình.
      heroes: [],
      // đội hình mang vào ải — tối đa ba người, đổi qua lại giữa trận.
      party: [null, null, null],
      // Tiến Hoá: cấp của bốn nhánh, dùng chung cho MỌI nhân vật.
      evol: {},
      // Pity của từng banner: { n, guar, fate, target }
      pity: {},
      area: 'tior',
      cleared: {},           // { 'tior-1': true, ... } — ải đã phá
      bossKills: {}, seenBoss: {},
      inv: {}, potions: {},
      stats: { boss: 0, mob: 0, deaths: 0, parts: 0, gathers: 0, rerolls: 0, buys: 0,
               potions: 0, skillUse: 0, equipLv: 0, pulls: 0 },
      log: []
    };
  };

  G.load = function () {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || s.v !== 2) return null;
      // uid sinh sau khi nạp phải không đụng uid cũ
      s.gear.forEach(function (o) {
        var m = /^u(\d+)_/.exec(o.uid || ''); if (m) uidSeq = Math.max(uidSeq, +m[1] + 1);
      });
      (s.heroes || []).forEach(function (o) {
        var m = /^h(\d+)_/.exec(o.uid || ''); if (m) uidSeq = Math.max(uidSeq, +m[1] + 1);
      });
      G.migrateHeroes(s);
      return s;
    } catch (e) { return null; }
  };
  G.save = function (s) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) { /* hết chỗ thì thôi, không chặn chơi */ }
  };
  G.wipe = function () { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} };

  /* ======================= NHÂN VẬT (NPC) ==============================
   *
   * Gacha quay ra NGƯỜI. Mỗi người gắn cứng một lớp vũ khí (= một bộ move set và
   * hai kỹ năng), một hệ, và GIỮ TRANG BỊ CỦA RIÊNG MÌNH: một ô vũ khí đúng lớp
   * của mình cộng bốn ô giáp. Đội hình ba người, đổi qua lại giữa trận.
   *
   * Một món đồ chỉ nằm ở MỘT người tại một thời điểm — lắp cho người này là tự
   * gỡ khỏi người kia, chứ không nhân bản chỉ số.
   */
  var HERO_MUL = { SS: 1.30, S: 1.16, A: 1.06, B: 1.00 };
  G.heroMul = function (rank) { return HERO_MUL[rank] || 1; };

  G.mkHero = function (id) {
    var d = G.heroById(id); if (!d) return null;
    return { uid: 'h' + (uidSeq++) + '_' + ((Math.random() * 1e6) | 0),
             id: id, lv: 1, dupes: 0,
             gear: { weapon: null, head: null, body: null, arm: null, leg: null } };
  };
  G.hasHero = function (s, id) {
    return (s.heroes || []).some(function (h) { return h.id === id; });
  };
  G.heroOf = function (s, uid) {
    var a = s.heroes || [];
    for (var i = 0; i < a.length; i++) if (a[i].uid === uid) return a[i];
    return null;
  };
  G.heroDef = function (h) { return h ? G.heroById(h.id) : null; };

  /* Ba người đang mang theo. Ô trống thì null — game.js tự bỏ qua. */
  G.party = function (s) {
    return (s.party || []).map(function (u) { return u ? G.heroOf(s, u) : null; });
  };

  /* Món này người này có lắp được không.
   * Vũ khí phải ĐÚNG LỚP của nhân vật — đó là cả điểm của việc gắn lớp vào người.
   * Giáp thì ai mặc cũng được. */
  G.canEquip = function (h, g) {
    if (!h || !g) return false;
    if (g.kind !== 'weapon') return true;
    var d = G.heroDef(h);
    return !!d && d.wclass === g.wclass;
  };

  /* Lắp món vào một người. Tự gỡ khỏi mọi người khác trước, vì một món chỉ nằm
     ở một chỗ. Trả false nếu sai lớp. */
  G.equipOn = function (s, h, g) {
    if (!G.canEquip(h, g)) return false;
    var slot = g.kind === 'weapon' ? 'weapon' : g.kind;
    (s.heroes || []).forEach(function (o) {
      for (var k in o.gear) if (o.gear[k] === g.uid) o.gear[k] = null;
    });
    h.gear[slot] = g.uid;
    return true;
  };
  G.unequipFrom = function (h, slot) { if (h && h.gear) h.gear[slot] = null; };

  /* Ai đang giữ món này (để giao diện nói rõ "đang ở chỗ Fubuki"). */
  G.holderOf = function (s, uid) {
    var a = s.heroes || [];
    for (var i = 0; i < a.length; i++) {
      for (var k in a[i].gear) if (a[i].gear[k] === uid) return a[i];
    }
    return null;
  };

  /* --------------------------------------------- BỘ ĐỒ ĐANG MẶC -> CHỈ SỐ - */
  /* Trang bị của MỘT người. Không truyền người thì lấy người đứng đầu đội hình,
     để mấy chỗ cũ chỉ cần "bộ đồ đang mặc" vẫn gọi được. */
  G.equippedOf = function (s, h) {
    var byUid = {}; s.gear.forEach(function (g) { byUid[g.uid] = g; });
    var e = { weapon: null, head: null, body: null, arm: null, leg: null };
    if (h && h.gear) for (var k in e) e[k] = byUid[h.gear[k]] || null;
    return e;
  };
  G.equipped = function (s, h) {
    h = h || G.party(s).filter(Boolean)[0] || null;
    var e = G.equippedOf(s, h);
    // `weapons` giữ lại hình dạng cũ (ba khe) nhưng giờ nó là VŨ KHÍ CỦA BA NGƯỜI
    // trong đội hình, không phải ba cây của một người.
    e.weapons = G.party(s).map(function (x) {
      return x ? (G.equippedOf(s, x).weapon || null) : null;
    });
    return e;
  };

  /* Chuyển hồ sơ cũ (ba khe vũ khí của MỘT người) sang hồ sơ mới (ba NGƯỜI).
     Chạy mỗi lần nạp; đã có roster thì không đụng gì. */
  /* Đồ trong hồ sơ cũ còn mang tên lớp CŨ ('sword', 'great', ...). Đổi ngay ở
   * đây, MỘT LẦN, rồi ghi đè lại vào món đồ — chứ không đổi ở từng chỗ đọc.
   * Nếu chỉ đổi lúc đọc thì sẽ có chỗ quên, và chỗ quên đó là một cây vũ khí
   * người chơi cũ không lắp được cho ai nữa. */
  G.migrateGearClass = function (s) {
    if (!s || !s.gear) return s;
    s.gear.forEach(function (g) {
      if (g.kind === 'weapon' && g.wclass && !G.WEAPONS[g.wclass]) {
        g.wclass = G.wclassOf(g.wclass);
      }
    });
    return s;
  };

  G.migrateHeroes = function (s) {
    if (!s) return s;
    G.migrateGearClass(s);
    s.heroes = s.heroes || [];
    s.party = s.party || [null, null, null];
    if (s.heroes.length) return s;

    var old = s.loadout || {};
    var oldW = (old.weapons || []).map(function (u) {
      return (s.gear || []).filter(function (g) { return g.uid === u; })[0] || null;
    });
    // Ba người đầu tiên: chọn theo LỚP của ba cây đang lắp, để người chơi cũ mở
    // game lên vẫn thấy đúng ba lối đánh mình đang dùng.
    var picked = [];
    oldW.forEach(function (w) {
      if (!w) return;
      var cand = G.HEROES.filter(function (d) {
        return d.wclass === w.wclass && picked.indexOf(d.id) < 0;
      });
      if (cand.length) picked.push(cand[cand.length - 1].id);   // hạng thấp = người mở đầu
    });
    G.STARTER_HEROES.forEach(function (id) {
      if (picked.length < 3 && picked.indexOf(id) < 0) picked.push(id);
    });
    picked.slice(0, 3).forEach(function (id, i) {
      var h = G.mkHero(id); if (!h) return;
      s.heroes.push(h); s.party[i] = h.uid;
      var w = oldW[i];
      if (w && G.canEquip(h, w)) h.gear.weapon = w.uid;
      if (i === 0) ['head', 'body', 'arm', 'leg'].forEach(function (k) { h.gear[k] = old[k] || null; });
    });
    // Cây nào không ai cầm được thì vẫn nằm trong túi, không mất.
    return s;
  };

  /* Tổng hợp toàn bộ chỉ số chiến đấu của người chơi. Đây là chỗ duy nhất
   * ability và bộ đồ gặp nhau — game.js chỉ đọc kết quả. */
  G.buildStats = function (s, hero) {
    var B = G.BAL;
    hero = hero || G.party(s).filter(Boolean)[0] || null;
    var eq = G.equippedOf(s, hero);
    // Hạng nhân vật nhân thẳng vào chỉ số gốc — đó là thứ làm một con SS đáng quay
    // hơn một con B, chứ không phải chỉ khác cái ảnh.
    var hm = G.heroMul(hero ? (G.heroDef(hero) || {}).rank : 'B');
    /* TIẾN HOÁ nhân vào NỀN, và nhân TRƯỚC hệ số hạng. Thứ tự đó quyết định ý
     * nghĩa của cả hệ: nhân trước thì một con SS hưởng nhiều hơn một con B đúng
     * theo tỉ lệ hạng của nó, tức Tiến Hoá nâng ĐỀU tất cả. Cộng sau khi nhân
     * hạng thì mọi hạng nhận cùng một lượng tuyệt đối, và nó âm thầm thành thứ
     * thu hẹp khoảng cách giữa các hạng — ngược hẳn ý định. */
    var ev = { hp: G.evolMul(s, 'hp'), atk: G.evolMul(s, 'atk'),
               def: G.evolMul(s, 'def'), edef: G.evolMul(s, 'edef') };
    var st = {
      hero: hero,
      hp: (B.baseHp + B.hpPerLv * (s.lv - 1)) * ev.hp * hm,
      atk: (B.baseAtk + B.atkPerLv * (s.lv - 1)) * ev.atk * hm,
      def: (B.baseDef + B.defPerLv * (s.lv - 1)) * ev.def * hm,
      edef: 0,
      evolEdef: ev.edef,
      moveSpd: 1, dodge: 1, recovery: 1, skillCd: 0, skillDmg: 0, luck: 0,
      guard: 0, cleave: 0, cleaveSpd: 0, lunge: 0, frenzy: 0, snipe: 0, snipeSpd: 0,
      soul: 0, heat: 0, regen: 0,
      wdmg: { sword: 0, great: 0, spear: 0, dual: 0, bow: 0 },
      watk: { sword: 0, great: 0, spear: 0, dual: 0, bow: 0 },
      edmg: { fire: 0, water: 0, earth: 0, thunder: 0, light: 0, dark: 0 },
      res:  { burn: 0, poison: 0, paralysis: 0, slow: 0 },
      setBonus: null
    };

    function applyAbility(a) {
      var def = G.ABILITIES.find(function (x) { return x.id === a.id; });
      if (!def) return;
      var path = def.stat.split('.'), v = a.v / 100;
      if (path[0] === 'wdmg') st.wdmg[path[1]] += v;
      else if (path[0] === 'edmg') {
        if (path[1] === 'hydro') { st.edmg.water += v; st.edmg.thunder += v; }
        else st.edmg[path[1]] += v;
      } else if (path[0] === 'res') st.res[path[1]] += v;
      else if (def.stat === 'luck') st.luck += a.v;
      else st[def.stat] = (st[def.stat] || 0) + v;
    }

    // Bốn mảnh giáp
    var srcs = [];
    ['head', 'body', 'arm', 'leg'].forEach(function (k) {
      var g = eq[k]; if (!g) return;
      srcs.push(g.src);
      var gs = G.gearStats(g);
      st.hp += gs.hp; st.def += gs.pdef; st.edef += gs.edef; st.atk += gs.patk;
      (g.abilities || []).forEach(applyAbility);
    });
    // Bonus mặc đủ bộ (wiki: "Hunters wearing a full armor set may receive bonus stats")
    if (srcs.length === 4 && srcs.every(function (x) { return x === srcs[0]; })) {
      st.hp *= 1.10; st.atk *= 1.08; st.def *= 1.10;
      st.setBonus = srcs[0];
    }
    // Ability của vũ khí đang mang (cả 3 khe đều tính — bản gốc tính theo món đang cầm,
    // nhưng ở đây đổi vũ khí liên tục nên tính theo món cầm được xử lý trong game.js)
    // Kháng hệ chỉ tới từ giáp nên nó phải nhân SAU khi cộng xong bốn mảnh —
    // nhân trước thì nhân với số 0 và cả nhánh Kháng Hệ không làm gì cả.
    st.edef *= st.evolEdef;
    st.hp = Math.round(st.hp); st.atk = Math.round(st.atk); st.def = Math.round(st.def);
    st.edef = Math.round(st.edef);
    return st;
  };

  // Chỉ số riêng của MÓN VŨ KHÍ đang cầm — game.js gọi mỗi lần đổi vũ khí.
  G.weaponProfile = function (s, g, opt) {
    if (!g) return null;
    var W = G.weaponOf(g.wclass), gs = G.gearStats(g);
    var prof = { g: g, W: W, patk: gs.patk, eatk: gs.eatk, el: g.el, wclass: g.wclass, wtype: g.wtype, extra: {} };
    (g.abilities || []).forEach(function (a) {
      var def = G.ABILITIES.find(function (x) { return x.id === a.id; });
      if (def) prof.extra[def.stat] = (prof.extra[def.stat] || 0) + a.v / 100;
    });
    // Kỹ năng thuộc về VŨ KHÍ, không phải viên đá cắm vào nó. Đổi vũ khí là đổi
    // hẳn hai đòn — đó mới là lý do để mang ba khe.
    prof.skills = G.skillsOf(g.wclass).filter(function (sk, i) {
      return i === 0 || g.lv >= G.SKILL_RULES.unlockLv2;
    });
    prof.hero = opt && opt.hero ? opt.hero : null;
    // Hệ của NGƯỜI đứng sau hệ của MÓN: cây trần (hệ 'none') thì lấy hệ của nhân
    // vật, nên Kiara cầm cây tập sự vẫn ra lửa. Món có hệ riêng thì món thắng —
    // đó là lý do để đi tìm đồ.
    if (prof.el === 'none' && prof.hero) {
      var hd = G.heroDef(prof.hero);
      if (hd && hd.el && hd.el !== 'none') prof.el = hd.el;
    }
    return prof;
  };

  /* ========================================================= QUAY =========
   * Ba banner, một bộ máy. Trạng thái pity nằm trong `s.pity[bannerId]`:
   *
   *   { n, guar, fate, target }
   *     n      — đã quay bao nhiêu lượt kể từ lần SS gần nhất
   *     guar   — lần SS tới CHẮC CHẮN là đồ rate-up (do đã thua 50/50)
   *     fate   — Điểm Định Mệnh của banner vũ khí
   *     target — cây vũ khí đã chọn làm mục tiêu
   *
   * PITY MỀM là phần dễ làm sai nhất. Nó KHÔNG phải "tới lượt N thì bảo đảm";
   * nó là cộng thêm một lượng vào tỉ lệ SS cho mỗi lượt vượt qua mốc mềm, cho
   * tới khi chạm mốc cứng thì thành 100%. Genshin: mềm ~74, cứng 90, tức mềm bắt
   * đầu ở 82% quãng đường. Giữ đúng tỉ lệ đó, kéo về thang ngắn hơn cho hợp với
   * tỉ lệ gốc 3% (cao gấp năm lần Genshin).
   * ==================================================================== */
  function pityOf(s, id) {
    s.pity = s.pity || {};
    if (!s.pity[id]) s.pity[id] = { n: 0, guar: false, fate: 0, target: null };
    return s.pity[id];
  }
  G.pityOf = pityOf;
  G.bannerById = function (id) {
    return G.BANNERS.filter(function (b) { return b.id === id; })[0] || G.BANNERS[0];
  };

  /* Tỉ lệ SS THẬT ở lượt quay tiếp theo, đã tính pity mềm và pity cứng. Tách ra
   * thành hàm riêng vì màn hình quay hiện chính con số này — người chơi phải
   * thấy pity đang làm việc, không thì nó chỉ là một lời hứa trong tài liệu. */
  G.ssRateNow = function (bn, pity) {
    var n = pity.n + 1;
    if (n >= bn.hard) return 1;
    var r = bn.rates.SS;
    if (n > bn.soft) r += (n - bn.soft) * bn.softStep;
    return Math.min(1, r);
  };

  function rollRankFor(bn, pity) {
    if (Math.random() < G.ssRateNow(bn, pity)) return 'SS';
    // Ba hạng còn lại chia lại phần còn thừa theo đúng tỉ lệ tương đối của chúng.
    var rest = 1 - bn.rates.SS, r = Math.random() * rest, acc = 0;
    var order = ['S', 'A', 'B'];
    for (var i = 0; i < order.length; i++) {
      acc += bn.rates[order[i]];
      if (r < acc) return order[i];
    }
    return 'B';
  }

  function addHero(s, id) {
    var d = G.heroById(id);
    if (!d) return null;
    if (G.hasHero(s, id)) {
      var n = G.DUPE_CORE[d.rank] || 1;
      s.core = (s.core || 0) + n;
      var ex = s.heroes.filter(function (h) { return h.id === id; })[0];
      if (ex) ex.dupes = (ex.dupes || 0) + 1;
      return { kind: 'hero', id: id, name: d.n, rank: d.rank, dupe: true, cores: n };
    }
    var h = G.mkHero(id);
    if (h) s.heroes.push(h);
    return { kind: 'hero', id: id, name: d.n, rank: d.rank, dupe: false, uid: h && h.uid };
  }

  /* TRÙNG ĐỒ KHÔNG ĐỔI RA LÕI — và đây là một quyết định, không phải thiếu sót.
   *
   * Bản trước: quay trúng món đã có thì món đó biến thành Lõi Rồng, vì túi đồ
   * không cho phép hai món giống hệt nhau. Luật đó chết ngay khi ĐỘT PHÁ đổi
   * sang ăn chính trang bị: nếu mọi món trùng đều tan thành Lõi thì không bao
   * giờ có đồ thừa để mà nướng, và cả một bậc nâng cấp trở thành bất khả thi.
   *
   * Nên giờ: TRÙNG NGƯỜI ra Lõi Rồng, TRÙNG ĐỒ ra một món thật. Đó cũng đúng
   * mô hình Survivor.io, nơi mọi bậc hiếm phía trên đều phải ghép từ một đống
   * đồ cấp dưới chứ không mua thẳng (_research/survivorio.md §4.3): túi đầy đồ
   * trùng không phải rác, nó là kho nguyên liệu.
   *
   * Hệ quả phải chấp nhận: Lõi Rồng chỉ còn một nguồn duy nhất là trùng NGƯỜI.
   * Với 43 nhân vật thì nguồn đó vẫn dồi dào sau vài chục lượt quay, và nó giữ
   * cho hai bậc cao nhất (Tinh Luyện, Tiến Hoá) khoá vào đúng cú quay chứ không
   * vào việc đi cày. */
  function addGear(s, bid, kind) {
    var g = G.forgeGear(bid, kind, 'gacha' + Date.now() + Math.random());
    if (!g) return null;
    var had = G.hasGear(s, bid, kind);
    s.gear.push(g);
    return { kind: 'gear', id: bid, name: g.name, rank: g.rank, gkind: kind,
             wclass: g.wclass, el: g.el, uid: g.uid, dupe: false, spare: had };
  }

  /* Một lượt quay trên một banner. Trả về một bản ghi mô tả thứ vừa ra, kèm cờ
   * `up` (có phải đồ rate-up không) để màn hình kết quả nói được điều đó. */
  function pullOne(s, bn) {
    var pity = pityOf(s, bn.id);
    var rank = rollRankFor(bn, pity);
    pity.n = rank === 'SS' ? 0 : pity.n + 1;

    // ---- banner NHÂN VẬT ----
    if (bn.kind === 'hero') {
      var id;
      if (rank === 'SS') {
        var feat = bn.featured[0];
        // 50/50, và bảo hiểm: thua một lần thì lần SS sau chắc chắn trúng.
        var win = pity.guar || Math.random() < 0.5;
        pity.guar = !win;
        id = win ? feat : pickHeroRank(rank, feat);
        var r0 = addHero(s, id); if (r0) r0.up = win;
        return r0;
      }
      id = pickHeroRank(rank, null);
      return addHero(s, id);
    }

    // ---- banner VŨ KHÍ ----
    if (bn.kind === 'weapon') {
      if (rank === 'SS') {
        var target = pity.target || bn.featured[0];
        var hit;
        if (pity.fate >= 1) { hit = target; pity.fate = 0; }
        else {
          // Trúng một trong hai cây rate-up thì tính là "trúng banner"; trúng cây
          // KHÔNG PHẢI mục tiêu đã chọn thì vẫn +1 Điểm Định Mệnh, đúng luật
          // Epitomized Path: điểm đếm theo MỤC TIÊU, không theo banner.
          var onBanner = Math.random() < 0.75;
          hit = onBanner ? bn.featured[(Math.random() * bn.featured.length) | 0]
                         : pickBehemothRank('SS', null);
          if (hit !== target) pity.fate++; else pity.fate = 0;
        }
        var rw = addGear(s, hit, 'weapon');
        if (rw) { rw.up = hit === target; rw.fate = pity.fate; }
        return rw;
      }
      return addGear(s, pickBehemothRank(rank, null), 'weapon');
    }

    // ---- banner TIÊU CHUẨN ----
    if (Math.random() < bn.heroChance) return addHero(s, pickHeroRank(rank, null));
    var kinds = G.GEAR_KINDS;
    return addGear(s, pickBehemothRank(rank, null),
                   kinds[(Math.random() * kinds.length) | 0]);
  }

  // Một người hạng `rank`, ưu tiên người CHƯA CÓ nếu có thể. `avoid` để loại
  // đúng người rate-up ra khỏi nhánh "thua 50/50" — không loại thì thua 50/50
  // vẫn có thể ra chính người đó, và cả cơ chế mất nghĩa.
  function pickHeroRank(rank, avoid) {
    var pool = G.heroesOfRank(rank).filter(function (d) { return d.id !== avoid; });
    if (!pool.length) pool = G.heroesOfRank(rank);
    if (!pool.length) pool = G.HEROES;
    return pool[(Math.random() * pool.length) | 0].id;
  }
  function pickBehemothRank(rank, avoid) {
    var pool = G.BEHEMOTHS.filter(function (b) { return b.rank === rank && b.id !== avoid; });
    if (!pool.length) pool = G.BEHEMOTHS.filter(function (b) { return b.rank === rank; });
    if (!pool.length) pool = G.BEHEMOTHS;
    return pool[(Math.random() * pool.length) | 0].id;
  }

  /* Quay `count` lượt. Trả về { ok, results, cost, why }.
   * Trừ tiền MỘT LẦN ở đầu, không trừ từng lượt: trừ từng lượt thì một lượt mười
   * mà hết gem giữa chừng sẽ để lại nửa gói, và người chơi không có cách nào biết
   * mình đã nhận được gì. */
  G.pull = function (s, bannerId, count) {
    var bn = G.bannerById(bannerId);
    var cost = count >= 10 ? G.REWARD.pull10 : G.REWARD.pull * count;
    if (s.gem < cost) return { ok: false, why: 'Không đủ Gem', cost: cost };
    s.gem -= cost;
    var out = [];
    for (var i = 0; i < count; i++) {
      var r = pullOne(s, bn);
      if (r) out.push(r);
    }
    s.stats.pulls = (s.stats.pulls || 0) + count;
    return { ok: true, results: out, cost: cost, banner: bn, pity: pityOf(s, bn.id) };
  };

  // Chọn cây mục tiêu trên banner vũ khí. Đổi mục tiêu thì Điểm Định Mệnh về 0 —
  // đúng luật Epitomized Path, và nếu không reset thì người chơi tích điểm bằng
  // một cây rồi đổi sang cây kia để lấy bảo hiểm miễn phí.
  G.setFateTarget = function (s, bid) {
    var pity = pityOf(s, 'weapon');
    if (pity.target !== bid) { pity.target = bid; pity.fate = 0; }
    return pity;
  };

  /* ======================================================= TIẾN HOÁ =======
   * Cộng vào NỀN của mọi nhân vật. Đọc trong buildStats trước khi nhân hệ số
   * hạng — thứ tự đó quan trọng: cộng SAU khi nhân hạng thì một con SS và một
   * con B nhận cùng một lượng tuyệt đối, và Tiến Hoá âm thầm thành thứ thu hẹp
   * khoảng cách giữa các hạng thay vì nâng đều tất cả.
   * ==================================================================== */
  G.evolLv = function (s, id) { return (s.evol && s.evol[id]) || 0; };
  G.evolMul = function (s, statId) {
    var t = G.EVOL.tracks.filter(function (x) { return x.stat === statId; })[0];
    if (!t) return 1;
    return 1 + t.per * G.evolLv(s, t.id);
  };
  G.evolCost = function (s, id) {
    var lv = G.evolLv(s, id);
    if (lv >= G.EVOL.max) return null;
    var n = lv + 1;
    return { gold: G.EVOL.cost(n), core: G.EVOL.core(n) };
  };
  G.evolUp = function (s, id) {
    var c = G.evolCost(s, id);
    if (!c) return { ok: false, why: 'Đã tối đa' };
    if (!G.canPay(s, c)) return { ok: false, why: c.core && (s.core || 0) < c.core ? 'Không đủ Lõi Rồng' : 'Không đủ Gold' };
    G.pay(s, c);
    s.evol = s.evol || {};
    s.evol[id] = G.evolLv(s, id) + 1;
    return { ok: true, lv: s.evol[id], cost: c };
  };
  // Tổng số cấp đã nâng — một con số duy nhất để khoe trên màn hình chính.
  G.evolTotal = function (s) {
    var n = 0;
    G.EVOL.tracks.forEach(function (t) { n += G.evolLv(s, t.id); });
    return n;
  };

  /* ------------------------------------------------------- RƠI ĐỒ -------
   * Quái và trùm không rơi nguyên liệu nữa — chúng rơi GOLD. Bảng tỉ lệ rơi
   * nguyên liệu thật của wiki (Small monsters) đã bỏ cùng với cả hệ nguyên liệu:
   * nó mô tả một trò chơi mà bạn nhặt Jelly Dew để chế đồ, và trò chơi đó không
   * còn ở đây nữa. Giữ lại một bảng tỉ lệ không ai đọc là giữ một lời nói dối.
   * ==================================================================== */
  G.rollMobDrop = function (tribe, elite, gold, luck, lv) {
    var lk = 1 + (luck || 0) * 0.02;
    return { gold: Math.round(G.REWARD.mobGold(lv || 1, elite, gold) * lk) };
  };

  G.rollBossDrop = function (b, partsBroken, luck, lv) {
    var lk = 1 + (luck || 0) * 0.02;
    // Bộ phận phá được cộng thẳng vào tiền thưởng: đó là chỗ trả công cho việc
    // chịu khó đánh vào điểm yếu thay vì bổ bừa vào thân.
    var mul = 1 + 0.22 * (partsBroken || 0);
    return { gold: Math.round(G.REWARD.bossGold(lv || 1, b.rank) * mul * lk) };
  };

  /* ============================================ CHI PHÍ NÂNG CẤP ==========
   * Ba bậc, và mỗi bậc tiêu MỘT thứ khác nhau — đó là cái làm ba bậc thành ba
   * quyết định chứ không phải ba lần bấm cùng một nút:
   *
   *   NÂNG CẤP (lv 1..40)   tiêu GOLD           — cày ải là ra
   *   ĐỘT PHÁ  (lb 0..4)    tiêu ĐỒ TRÙNG       - phải HY SINH món khác
   *   TINH LUYỆN (evo 0..2) tiêu LÕI RỒNG       — chỉ có từ quay trúng đồ đã có
   *
   * Bậc giữa là chỗ đổi lớn nhất so với bản cũ: trước đây nó tiêu Lapis, tức là
   * đi cày. Giờ nó tiêu chính TRANG BỊ — đúng cơ chế merge của Survivor.io, nơi
   * mọi bậc hiếm phía trên đều phải ghép từ đồ cấp dưới chứ không mua thẳng
   * (_research/survivorio.md §4.3). Nó biến mọi món rác quay được thành nguyên
   * liệu, nên không có cú quay nào là vô nghĩa, và nó buộc người chơi phải chọn:
   * giữ ba món hạng A để dùng, hay nướng cả ba cho một món hạng S.
   * ==================================================================== */
  var RANK_COST = { B: 1, A: 2.2, S: 4.5, SS: 8 };

  G.enhanceCost = function (g) {
    var k = RANK_COST[g.rank] || 1;
    return { gold: Math.round((180 + g.lv * 95) * k) };
  };

  // Số món phải nướng cho lần đột phá thứ (lb+1), và hạng tối thiểu của chúng.
  G.breakFodder = function (g) {
    return { n: g.lb + 1, rank: g.rank };
  };
  G.limitBreakCost = function (g) {
    return { gold: Math.round(2500 * (RANK_COST[g.rank] || 1) * (g.lb + 1)),
             fodder: G.breakFodder(g) };
  };
  /* Món nào đủ tư cách làm nguyên liệu đột phá cho món `g`:
   * cùng hạng trở lên, không phải chính nó, chưa lắp lên ai, và không phải đồ
   * trưng bày. "Chưa lắp lên ai" là điều kiện quan trọng nhất — nướng nhầm cây
   * đang cầm là mất một buổi chơi, và không có nút hoàn tác. */
  G.fodderFor = function (s, g) {
    var order = G.RANK_ORDER.indexOf(g.rank);
    return (s.gear || []).filter(function (x) {
      if (x.uid === g.uid || x.show) return false;
      if (G.holderOf(s, x.uid)) return false;
      return G.RANK_ORDER.indexOf(x.rank) >= order;
    });
  };

  G.evolveCost = function (g) {
    var need = { S: 8, SS: 14 }[g.rank] || 6;
    return { gold: Math.round(9000 * (RANK_COST[g.rank] || 1)), core: need * (g.evo + 1) };
  };
  G.rerollCost = function (g) { return { gold: Math.round(1200 * (RANK_COST[g.rank] || 1)) }; };

  G.canPay = function (s, cost) {
    if (cost.gold && s.gold < cost.gold) return false;
    if (cost.gem && s.gem < cost.gem) return false;
    if (cost.core && (s.core || 0) < cost.core) return false;
    return true;
  };
  G.pay = function (s, cost) {
    if (!G.canPay(s, cost)) return false;
    if (cost.gold) s.gold -= cost.gold;
    if (cost.gem) s.gem -= cost.gem;
    if (cost.core) s.core -= cost.core;
    return true;
  };

  /* Phát một GÓI phần thưởng. Khuôn { gold, gem, core, exp, item } — bốn chỗ
   * phát thưởng (phá ải, tiệm, quay trùng, rương trong ải) đi qua đúng một hàm,
   * nên thêm chỗ thứ năm không phải nhớ chép lại đủ mấy dòng cộng tiền. */
  G.giveBundle = function (s, g) {
    if (!g) return;
    if (g.gold) s.gold += g.gold;
    if (g.gem) s.gem += g.gem;
    if (g.core) s.core = (s.core || 0) + g.core;
    if (g.exp) G.addExp(s, g.exp);
    if (g.item) s.inv[g.item] = (s.inv[g.item] || 0) + 1;
  };
  G.grant = G.giveBundle;

  /* --------------------------------------------------------- MỞ ẢI ------- */
  // Ải đầu tiên của game luôn mở; mọi ải sau chỉ mở khi ải LIỀN TRƯỚC đã phá.
  // Một chuỗi thẳng, không có nhánh — nhìn danh sách là biết đi tới đâu.
  G.stageOpen = function (s, st) {
    var i = G.STAGES.indexOf(st);
    if (i <= 0) return true;
    return !!s.cleared[G.STAGES[i - 1].id];
  };
  G.nextStage = function (s) {
    for (var i = 0; i < G.STAGES.length; i++) if (!s.cleared[G.STAGES[i].id]) return G.STAGES[i];
    return G.STAGES[G.STAGES.length - 1];
  };

  /* ------------------------------------------------------ SỞ HỮU ĐỒ ------ */
  // Hệ Tablet + lò rèn chế đồ của bản gốc ĐÃ BỎ: gacha ra thẳng trang bị. Hàm này
  // ở lại vì gacha cần biết món sắp ra đã có chưa, để quy đổi thành Lõi Rồng.
  G.hasGear = function (s, bid, kind) {
    return s.gear.some(function (g) { return g.src === bid && g.kind === kind; });
  };

  /* ---------------------------------------------- NÂNG CẤP TRANG BỊ ----- */
  G.enhance = function (s, g) {
    if (g.lv >= MAX_LV) return { ok: false, why: 'Đã tối đa cấp' };
    var c = G.enhanceCost(g);
    if (!G.canPay(s, c)) return { ok: false, why: 'Không đủ Gold' };
    G.pay(s, c); g.lv++; s.stats.equipLv++;
    return { ok: true };
  };

  /* ĐỘT PHÁ giờ nướng ĐỒ, không tiêu nguyên liệu.
   *
   * `fodder` là mảng uid do người chơi tự chọn — KHÔNG tự chọn hộ. Tự chọn hộ là
   * cách chắc chắn nhất để một ngày nào đó nướng nhầm món người ta đang để dành,
   * và không có nút hoàn tác nào cho việc đó. Hàm này chỉ kiểm tra lại danh sách
   * gửi lên có hợp lệ không rồi mới nướng. */
  G.limitBreakReady = function (s, g, fodder) {
    var need = G.breakFodder(g);
    if (!fodder || fodder.length !== need.n) return false;
    var ok = G.fodderFor(s, g);
    for (var i = 0; i < fodder.length; i++) {
      if (fodder.indexOf(fodder[i]) !== i) return false;         // trùng uid
      if (!ok.some(function (x) { return x.uid === fodder[i]; })) return false;
    }
    return true;
  };
  G.limitBreak = function (s, g, fodder) {
    if (g.lb >= MAX_LB) return { ok: false, why: 'Đã đột phá tối đa' };
    var c = G.limitBreakCost(g);
    if (!G.limitBreakReady(s, g, fodder))
      return { ok: false, why: 'Cần đúng ' + c.fodder.n + ' món hạng ' + c.fodder.rank +
                               ' trở lên, chưa lắp lên ai' };
    if (!G.canPay(s, { gold: c.gold })) return { ok: false, why: 'Không đủ Gold' };
    G.pay(s, { gold: c.gold });
    fodder.forEach(function (uid) { G.destroyGear(s, uid); });
    g.lb++;
    return { ok: true, burned: fodder.length, unlockedSlot: g.lb === 4 };
  };

  G.evolve = function (s, g) {
    if (!G.canEvolve(g)) return { ok: false, why: 'Chưa đủ điều kiện tinh luyện' };
    var c = G.evolveCost(g);
    if (!G.canPay(s, c)) return { ok: false, why: (s.core || 0) < c.core ? 'Không đủ Lõi Rồng' : 'Không đủ Gold' };
    G.pay(s, c); g.evo++; g.lv = 1;
    var b = G.behemothById(g.src);
    if (b && g.kind === 'weapon') g.name = weaponName(b, g.evo);
    return { ok: true };
  };
  G.reroll = function (s, g) {
    var c = G.rerollCost(g);
    if (!G.canPay(s, c)) return { ok: false, why: 'Không đủ Gold' };
    G.pay(s, c);
    var rng = function () { return Math.random(); };
    g.abilities = [rollAbility(rng, g.kind), rollAbility(rng, g.kind)];
    s.stats.rerolls++;
    return { ok: true };
  };

  // Xoá một món khỏi túi và khỏi tay mọi người đang giữ nó. Gọi từ cả đột phá
  // (nướng làm nguyên liệu) lẫn rã đồ — một chỗ duy nhất biết cách gỡ tham chiếu,
  // nếu không thì món đã biến mất vẫn còn nằm trong h.gear và ô đó khoá cứng.
  G.destroyGear = function (s, uid) {
    (s.heroes || []).forEach(function (h) {
      for (var k in h.gear) if (h.gear[k] === uid) h.gear[k] = null;
    });
    s.gear = s.gear.filter(function (x) { return x.uid !== uid; });
  };

  // Rã trang bị -> GOLD. Trả lại theo hạng và theo công đã đổ vào nó, để việc rã
  // một món đã nâng không phải là một cú mất trắng.
  G.dismantle = function (s, g) {
    var back = Math.round(600 * (RANK_COST[g.rank] || 1) * (1 + g.lb * 0.5 + g.evo) +
                          (g.lv - 1) * 40 * (RANK_COST[g.rank] || 1));
    s.gold += back;
    G.destroyGear(s, g.uid);
    return { ok: true, gold: back };
  };

  /* Đếm tiến độ. Hệ nhiệm vụ ngày/tuần/cốt truyện đã bỏ, nhưng bộ đếm thì ở lại:
   * màn Hồ Sơ vẫn đọc nó, và nó không tốn gì. Cái bỏ đi là ba màn hình bắt người
   * chơi quay lại vào ngày mai — một game chạy trong localStorage không có ngày
   * mai để mà quay lại. */
  G.track = function (s, ev) {
    var prog = s.progress = s.progress || {};
    for (var k in ev) prog[k] = (prog[k] || 0) + ev[k];
  };

  G.addExp = function (s, n) {
    s.exp += n;
    var lvUp = 0;
    while (s.exp >= G.BAL.expToLv(s.lv) && s.lv < 80) { s.exp -= G.BAL.expToLv(s.lv); s.lv++; lvUp++; }
    return lvUp;
  };

  /* -------------------------------------------------------- POTION ----- */
  G.usePotion = function (s, id) {
    if ((s.inv[id] || 0) < 1) return { ok: false, why: 'Không có bình này' };
    var it = G.ITEMS[id]; if (!it) return { ok: false, why: '?' };
    s.inv[id]--; s.stats.potions++;
    s.potions[id] = Date.now() + it.ms;
    return { ok: true };
  };
  G.potionMul = function (s, key) {
    var m = 1, now = Date.now();
    for (var id in s.potions) {
      if (s.potions[id] < now) continue;
      var it = G.ITEMS[id];
      if (it && it.eff[key]) m += it.eff[key];
    }
    return m;
  };

  /* -------------------------------------------------- KHỞI ĐỘNG MỚI ---- */
  // Bản gốc cho người chơi bắt đầu bằng Kiếm & Khiên ("The player starts off with
  // this weapon type"). Ở đây tặng luôn một bộ giáp B để có gì mà mặc.
  /* Bộ khởi đầu. Phát ĐỦ CẢ NĂM cây: mỗi cây một bộ đòn khác hẳn nhau, mà cái
   * hay của game này nằm ở chỗ đổi vũ khí giữa trận — bắt người chơi cày mấy
   * tiếng mới được thử cây thứ hai thì họ chẳng bao giờ biết game có gì. */
  /* Ba người mở đầu: ba lối đánh KHÁC HẲN nhau, để ngay ván đầu đã hiểu vì sao
     phải mang ba người và đổi giữa trận. Kiếm cận chiến có đỡ, đại kiếm chậm mà
     nặng, cung đứng xa — không ai làm thay được ai. */
  G.STARTER_HEROES = ['sora', 'mel', 'risu'];

  G.starterKit = function (s) {
    var starter = 'grouton';
    var NAMES = { rifle: 'Guild Carbine', launcher: 'Guild Mortar', shotgun: 'Guild Scattergun',
                  sniper: 'Guild Longshot', bow: 'Guild Shortbow', staff: 'Guild Scepter',
                  laser: 'Guild Emitter', blade: 'Guild Edge', scythe: 'Guild Reaper',
                  orb: 'Guild Ember' };
    var SRC = { rifle: 'mumu', launcher: 'landaronba', shotgun: 'dodonki',
                sniper: 'grouton', bow: 'galidon', staff: 'frogrid',
                laser: 'kyulmar', blade: 'frogrid', scythe: 'dofungos', orb: 'vaccahorn' };

    s.heroes = []; s.party = [null, null, null];
    G.STARTER_HEROES.forEach(function (id, i) {
      var d = G.heroById(id); if (!d) return;
      var h = G.mkHero(id);
      s.heroes.push(h); s.party[i] = h.uid;
      // Mỗi người một cây ĐÚNG LỚP của mình — lắp sẵn, khỏi bắt đi tìm.
      var w = G.forgeGear(SRC[d.wclass], 'weapon', 'starter_' + id);
      w.wclass = d.wclass; w.wtype = 'normal'; w.name = NAMES[d.wclass];
      w.rank = 'B'; w.el = 'none';
      s.gear.push(w);
      h.gear.weapon = w.uid;
    });

    // Cây dự phòng cho những lớp chưa có người, để lúc quay được người lớp đó là
    // có ngay đồ mà lắp.
    G.WEAPON_ORDER.forEach(function (cls) {
      if (s.heroes.some(function (h) { return (G.heroDef(h) || {}).wclass === cls; })) return;
      var g = G.forgeGear(SRC[cls], 'weapon', 'spare_' + cls);
      g.wclass = cls; g.wtype = 'normal'; g.name = NAMES[cls]; g.rank = 'B'; g.el = 'none';
      s.gear.push(g);
    });

    // Bộ giáp mở đầu về người đứng đầu đội hình.
    var h0 = s.heroes[0];
    ['head', 'body', 'arm', 'leg'].forEach(function (k) {
      var g = G.forgeGear(starter, k, 'starter');
      g.rank = 'B'; g.name = 'Guild ' + { head: 'Helm', body: 'Plate', arm: 'Wrists', leg: 'Sabatons' }[k];
      s.gear.push(g);
      if (h0) h0.gear[k] = g.uid;
    });
    return s;
  };
})(window.DP = window.DP || {});
