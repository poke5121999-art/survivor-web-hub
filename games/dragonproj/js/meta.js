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
      g.wclass = G.wclassOf(b.weapon); g.wtype = b.type; g.el = b.el;
      g.name = weaponName(b, 0);
      g.green = b.ability || null;      // ability cố định hiện chữ xanh lá
    } else {
      g.el = b.el; g.defEl = counterOf(b.el);
      g.name = armorName(b, kind);
    }
    g.abilities = [rollAbility(rng, kind), rollAbility(rng, kind)];
    return g;
  };

  /* BỘ TRƯNG BÀY — sáu cây chọn tay, mỗi cây một lớp, để xem art và kỹ năng.
   *
   * Không phải cheat cho vui: mở khoá kỹ năng thứ hai cần Lv.8 và cả sáu hệ mới
   * thấy hết được lớp nguyên tố, mà cày tới đó thì lâu. Sáu cây này là SS, tối
   * cấp, limit break đủ và tiến hoá tối đa — tức là trạng thái mà mọi thứ đều
   * bật, xem một lần là biết game có gì.
   * Bấm lại không nhân bản: món nào đã có rồi thì bỏ qua. */
  var SHOWCASE = [
    { src: 'ayame',       note: 'katana lửa' },      // sword  · hoả
    { src: 'pandemonius', note: 'song dao sét' },    // dual   · lôi  -> Ảnh Độn có vệt điện
    { src: 'lunathalmus', note: 'thương sét' },      // spear  · lôi
    { src: 'galdrux',     note: 'đại kiếm vàng' },   // great  · lôi
    { src: 'ciel',        note: 'nỏ quang' },        // bow    · quang
    { src: 'amarok',      note: 'katana băng' }      // sword  · thuỷ
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

  var W_SUFFIX = {
    rifle:    ['Rifle', 'Cadence', 'Aspect'],
    shotgun:  ['Scattergun', 'Maw', 'Eclipse'],
    sniper:   ['Lance', 'Pursuit', 'Zenith'],
    bow:      ['Bow', 'Cantus', 'Requiem'],
    staff:    ['Scepter', 'Oracle', 'Apotheosis'],
    launcher: ['Mortar', 'Ruin', 'Apex']
  };
  var A_SUFFIX = { head: 'Visor', body: 'Vest', arm: 'Gauntlets', leg: 'Leggings' };
  function shortName(b) { var p = b.n.split(' '); return p[p.length - 1]; }
  // b.weapon còn là tên lớp CŨ trong bảng Behemoth (giữ nguyên vì nó là dữ liệu
  // lấy nguyên văn từ wiki). Đổi sang lớp mới ở đúng chỗ đọc.
  function weaponName(b, evo) { return shortName(b) + "'s " + W_SUFFIX[G.wclassOf(b.weapon)][evo]; }
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
      gold: 3000, gem: 30, ticket: 10, pikke: 0, medal: 0,
      mats: {}, gear: [],
      // roster: mọi nhân vật đã quay được. Mỗi người TỰ GIỮ trang bị của mình.
      heroes: [],
      // đội hình mang vào ải — tối đa ba người, đổi qua lại giữa trận.
      party: [null, null, null],
      story: { done: [] },
      daily: { date: '', picks: [], done: {} },
      weekly: { week: '', picks: [], done: {} },
      area: 'tior',
      cleared: {},           // { 'tior-1': true, ... } — ải đã phá
      bossKills: {}, seenBoss: {},
      inv: {}, potions: {},
      stats: { boss: 0, mob: 0, deaths: 0, parts: 0, gathers: 0, rerolls: 0, buys: 0, potions: 0, skillUse: 0, equipLv: 0 },
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
  G.migrateHeroes = function (s) {
    if (!s) return s;
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
    var st = {
      hero: hero,
      hp: (B.baseHp + B.hpPerLv * (s.lv - 1)) * hm,
      atk: (B.baseAtk + B.atkPerLv * (s.lv - 1)) * hm,
      def: (B.baseDef + B.defPerLv * (s.lv - 1)) * hm,
      edef: 0,
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
    st.hp = Math.round(st.hp); st.atk = Math.round(st.atk); st.def = Math.round(st.def);
    return st;
  };

  // Chỉ số riêng của MÓN VŨ KHÍ đang cầm — game.js gọi mỗi lần đổi vũ khí.
  G.weaponProfile = function (s, g, opt) {
    if (!g) return null;
    var W = G.WEAPONS[g.wclass], gs = G.gearStats(g);
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

  /* ------------------------------------------------------------ GACHA ---- */
  /* Gacha ra THẲNG trang bị. Tỉ lệ hạng giữ nguyên tỉ lệ thật của Quest Gacha bản
   * gốc (SS 3 / S 15 / A 55 / B 27) vì đó là con số có nguồn; chỉ đổi thứ rơi ra.
   * Trúng món đã có -> LÕI RỒNG, nguyên liệu độc quyền không cày được, dùng để tiến
   * hoá đồ S/SS. Xem G.DUPE_CORE trong data/gamedata.js. */
  /* Quay ra NGƯỜI. Trùng người thì cộng `dupes` cho người đó và trả Lõi Rồng —
   * cùng luật với trùng đồ ngày trước, chỉ đổi thứ rơi ra.
   * Tỉ lệ hạng vẫn là con số có nguồn của Quest Gacha bản gốc. */
  G.summonHeroes = function (s, count, guaranteed) {
    var out = [], order = ['SS', 'S', 'A', 'B'];
    s.heroes = s.heroes || [];
    for (var i = 0; i < count; i++) {
      var rank = (guaranteed && i === count - 1) ? 'SS' : G.rollRank(G.HERO_RATES, Math.random);
      var pool = G.heroesOfRank(rank);
      if (!pool.length) { rank = order[order.indexOf(rank) + 1] || 'B'; pool = G.heroesOfRank(rank); }
      var d = pool[(Math.random() * pool.length) | 0];
      if (G.hasHero(s, d.id)) {
        var n = G.DUPE_CORE[rank] || 1;
        G.addMat(s, 'dragon_core', n);
        var ex = s.heroes.filter(function (h) { return h.id === d.id; })[0];
        if (ex) ex.dupes = (ex.dupes || 0) + 1;
        out.push({ dupe: true, rank: rank, id: d.id, name: d.n, cores: n });
      } else {
        var h = G.mkHero(d.id);
        s.heroes.push(h);
        // Người mới về mà đội hình còn chỗ thì xếp vào luôn, khỏi bắt đi lắp tay.
        for (var k = 0; k < G.PARTY_MAX; k++) if (!s.party[k]) { s.party[k] = h.uid; break; }
        out.push({ dupe: false, rank: rank, id: d.id, name: d.n, hero: h });
      }
    }
    return out;
  };

  G.summonGear = function (s, count, guaranteed) {
    var out = [], order = ['SS', 'S', 'A', 'B'];
    for (var i = 0; i < count; i++) {
      var rank = (guaranteed && i === count - 1) ? 'SS' : G.rollRank(G.GEAR_RATES, Math.random);
      var pool = G.BEHEMOTHS.filter(function (b) { return b.rank === rank; });
      if (!pool.length) { rank = order[order.indexOf(rank) + 1] || 'B'; pool = G.BEHEMOTHS.filter(function (b) { return b.rank === rank; }); }
      var b = pool[(Math.random() * pool.length) | 0];
      var kind = G.GEAR_KINDS[(Math.random() * G.GEAR_KINDS.length) | 0];
      if (G.hasGear(s, b.id, kind)) {
        var n = G.DUPE_CORE[rank] || 1;
        G.addMat(s, 'dragon_core', n);
        out.push({ dupe: true, rank: rank, src: b.id, kind: kind,
                   name: (kind === 'weapon' ? weaponName(b, 0) : armorName(b, kind)), cores: n });
      } else {
        var g = G.forgeGear(b.id, kind, s.gear.length + '_' + i);
        s.gear.push(g);
        out.push({ dupe: false, rank: rank, gear: g, name: g.name, kind: kind });
      }
    }
    return out;
  };

  /* ------------------------------------------------------- RƠI ĐỒ ------- */
  G.rollMobDrop = function (tribe, elite, gold, luck) {
    var T = G.TRIBES[tribe];
    var tab = gold ? G.DROP_GOLD : elite ? G.DROP_ELITE : G.DROP_NORMAL;
    var lk = 1 + (luck || 0) * 0.02;
    var out = [];
    if (Math.random() < tab.D * lk) out.push(T.mat[0]);
    if (Math.random() < tab.C * lk) out.push(T.mat[1]);
    if (Math.random() < tab.B * lk) out.push(T.mat[2]);
    if (Math.random() < tab.hq * lk) out.push(T.mat[3]);
    if (Math.random() < tab.boss * lk) out.push('lapis_b');
    if (Math.random() < 0.06 * lk) out.push('str_stone');
    if (!out.length) out.push(T.mat[0]);
    return out;
  };

  G.rollBossDrop = function (b, partsBroken, luck) {
    var out = [], lk = 1 + (luck || 0) * 0.02;
    var byRank = { B: ['lapis_b'], A: ['lapis_a', 'crystal'], S: ['lapis_s', 'crystal'], SS: ['lapis_ss', 'crystal'] };
    (byRank[b.rank] || []).forEach(function (m) { if (Math.random() < 0.55 * lk) out.push(m); });
    var pool = ['stone_dragon_claw', 'frozen_tail', 'monster_claw', 'ice_core', 'grouton_core',
                'vaccahorn_horn', 'frogrid_tongue', 'galidon_heart', 'dofungo_sporecap'];
    var n = 2 + ((b.rank === 'SS') ? 3 : b.rank === 'S' ? 2 : b.rank === 'A' ? 1 : 0) + partsBroken;
    for (var i = 0; i < n; i++) out.push(pool[(Math.random() * pool.length) | 0]);
    out.push('str_stone');
    return out;
  };

  /* --------------------------------------------- CHI PHÍ NÂNG / RÈN ----- */
  var RANK_COST = { B: 1, A: 2.2, S: 4.5, SS: 8 };
  G.enhanceCost = function (g) {
    var k = RANK_COST[g.rank] || 1;
    var mat = { str_stone: 1 + Math.floor(g.lv / 8) };
    // Từ cấp 25 trở lên còn cần Equipment Crystal — thứ chỉ rơi ở ải và điểm khai
    // thác. Nâng cấp cuối đời phải đi cày, đúng như đã hẹn.
    if (g.lv >= 25) mat.crystal = 1 + Math.floor((g.lv - 25) / 5);
    return { gold: Math.round((180 + g.lv * 95) * k), mat: mat };
  };
  G.limitBreakCost = function (g) {
    var lap = { B: 'lapis_b', A: 'lapis_a', S: 'lapis_s', SS: 'lapis_ss' }[g.rank] || 'lapis_b';
    var m = {}; m[lap] = g.lb + 1;
    return { gold: Math.round(2500 * (RANK_COST[g.rank] || 1) * (g.lb + 1)), mat: m };
  };
  // Tiến hoá là bậc nâng cấp cao nhất và CHỈ mở bằng Lõi Rồng — thứ duy nhất không
  // cày được, chỉ có từ việc quay gacha trúng món đã có. Đây là chỗ những cú quay
  // trùng biến thành sức mạnh thật, thay vì thành một xấp Lapis mà đi cày cũng có.
  G.evolveCost = function (g) {
    var need = { S: 8, SS: 14 }[g.rank] || 6;
    return { gold: Math.round(9000 * (RANK_COST[g.rank] || 1)), mat: { dragon_core: need * (g.evo + 1) } };
  };
  G.rerollCost = function (g) { return { gold: Math.round(1200 * (RANK_COST[g.rank] || 1)) }; };
  G.canPay = function (s, cost) {
    if (cost.gold && s.gold < cost.gold) return false;
    if (cost.gem && s.gem < cost.gem) return false;
    if (cost.pikke && s.pikke < cost.pikke) return false;
    if (cost.medal && s.medal < cost.medal) return false;
    if (cost.ticket && s.ticket < cost.ticket) return false;
    if (cost.mat) for (var m in cost.mat) if ((s.mats[m] || 0) < cost.mat[m]) return false;
    return true;
  };
  G.pay = function (s, cost) {
    if (!G.canPay(s, cost)) return false;
    if (cost.gold) s.gold -= cost.gold;
    if (cost.gem) s.gem -= cost.gem;
    if (cost.pikke) s.pikke -= cost.pikke;
    if (cost.medal) s.medal -= cost.medal;
    if (cost.ticket) s.ticket -= cost.ticket;
    if (cost.mat) for (var m in cost.mat) s.mats[m] -= cost.mat[m];
    return true;
  };
  G.addMat = function (s, id, n) { s.mats[id] = (s.mats[id] || 0) + (n || 1); };

  /* Phát một GÓI phần thưởng. Bốn quầy trong tiệm (Pikke, Medal, đổi Gold, nạp)
   * đều dùng chung khuôn { gold, gem, ticket, pikke, medal, mat:{id:n}, item },
   * nên chỉ nên có ĐÚNG MỘT chỗ biết cách mở gói ra — thêm quầy thứ năm thì khỏi
   * phải nhớ chép lại đủ bảy dòng cộng tiền. */
  G.giveBundle = function (s, g) {
    if (!g) return;
    if (g.gold) s.gold += g.gold;
    if (g.gem) s.gem += g.gem;
    if (g.ticket) s.ticket += g.ticket;
    if (g.pikke) s.pikke += g.pikke;
    if (g.medal) s.medal += g.medal;
    if (g.mat) for (var m in g.mat) G.addMat(s, m, g.mat[m]);
    if (g.item) s.inv[g.item] = (s.inv[g.item] || 0) + 1;
  };

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
    if (!G.canPay(s, c)) return { ok: false, why: 'Không đủ nguyên liệu' };
    G.pay(s, c); g.lv++; s.stats.equipLv++;
    return { ok: true };
  };
  G.limitBreak = function (s, g) {
    if (g.lb >= MAX_LB) return { ok: false, why: 'Đã limit break tối đa' };
    var c = G.limitBreakCost(g);
    if (!G.canPay(s, c)) return { ok: false, why: 'Không đủ Lapis' };
    G.pay(s, c); g.lb++;
    return { ok: true, unlockedSlot: g.lb === 4 };
  };
  G.evolve = function (s, g) {
    if (!G.canEvolve(g)) return { ok: false, why: 'Chưa đủ điều kiện tiến hóa' };
    var c = G.evolveCost(g);
    if (!G.canPay(s, c)) return { ok: false, why: 'Không đủ Crystal' };
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
  // Rã trang bị -> Lapis cùng hạng (đúng bản gốc: Lapis từ việc rã đồ boss).
  G.dismantle = function (s, g) {
    var lap = { B: 'lapis_b', A: 'lapis_a', S: 'lapis_s', SS: 'lapis_ss' }[g.rank] || 'lapis_b';
    var n = 1 + g.lb + g.evo;
    G.addMat(s, lap, n);
    // Gỡ khỏi mọi nhân vật đang giữ nó, nếu không rã xong vẫn còn tham chiếu mồ côi.
    (s.heroes || []).forEach(function (h) {
      for (var k in h.gear) if (h.gear[k] === g.uid) h.gear[k] = null;
    });
    s.gear = s.gear.filter(function (x) { return x.uid !== g.uid; });
    return { ok: true, lapis: lap, n: n };
  };

  /* ------------------------------------------------------ NHIỆM VỤ ----- */
  function today() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function thisWeek() {
    var d = new Date(), o = new Date(d.getFullYear(), 0, 1);
    return d.getFullYear() + 'W' + Math.ceil(((d - o) / 86400000 + o.getDay() + 1) / 7);
  }
  function pickN(arr, n, seed) {
    var rng = seeded(seed), pool = arr.slice(), out = [];
    while (out.length < n && pool.length) out.push(pool.splice((rng() * pool.length) | 0, 1)[0].id);
    return out;
  }
  G.rollRecurrent = function (s) {
    var t = today(), w = thisWeek();
    if (s.daily.date !== t) { s.daily = { date: t, picks: pickN(G.DAILY, 3, 'd' + t), done: {} }; }
    if (s.weekly.week !== w) { s.weekly = { week: w, picks: pickN(G.WEEKLY, 4, 'w' + w), done: {}, dailyClears: s.weekly.dailyClears || 0 }; }
  };

  // Đếm tiến độ: game.js bắn sự kiện vào đây sau mỗi trận.
  G.track = function (s, ev) {
    var prog = s.progress = s.progress || {};
    for (var k in ev) prog[k] = (prog[k] || 0) + ev[k];
  };

  G.questProgress = function (s, q) {
    var p = s.progress || {}, need = q.need || q.goal || {};
    var have = 0, want = 0;
    for (var k in need) {
      if (k === 'n') continue;
      var w = (typeof need[k] === 'number') ? need[k] : (need.n || 1);
      var key = (k === 'bossWith') ? ('bossWith_' + need[k]) : k;
      want += w; have += Math.min(w, p[key] || 0);
    }
    return { have: have, want: want, done: have >= want };
  };

  G.grant = function (s, rw) {
    if (!rw) return;
    if (rw.gold) s.gold += rw.gold;
    if (rw.gem) s.gem += rw.gem;
    if (rw.ticket) s.ticket += rw.ticket;
    if (rw.pikke) s.pikke += rw.pikke;
    if (rw.medal) s.medal += rw.medal;
    if (rw.exp) G.addExp(s, rw.exp);
    if (rw.mat) G.addMat(s, rw.mat, 1);
    if (rw.item) s.inv[rw.item] = (s.inv[rw.item] || 0) + 1;
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
                  sniper: 'Guild Longshot', bow: 'Guild Shortbow', staff: 'Guild Scepter' };
    var SRC = { rifle: 'vaccahorn', launcher: 'vaccahorn', shotgun: 'shurak',
                sniper: 'grouton', bow: 'galidon', staff: 'frogrid' };

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
    G.addMat(s, 'str_stone', 8); G.addMat(s, 'skill_core', 6); G.addMat(s, 'crystal', 2);
    return s;
  };
})(window.DP = window.DP || {});
