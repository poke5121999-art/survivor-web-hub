/* ==========================================================================
 * META — hồ sơ người chơi, lò rèn, magi, gacha, nhiệm vụ, lưu game.
 * Tách khỏi js/game.js: file kia lo một trận đấu, file này lo mọi thứ giữa
 * các trận. Không đụng tới canvas.
 * ========================================================================== */
(function (G) {
  'use strict';

  var SAVE_KEY = 'dp.save.v2';
  var uidSeq = 1;
  function uid() { return 'u' + (uidSeq++) + '_' + ((Math.random() * 1e6) | 0); }

  /* ---------------------------------------------------------- NGẪU NHIÊN -- */
  // RNG có hạt giống, để một con boss luôn sinh ra cùng một bộ đồ với cùng ô Magi.
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
  var RANK_W = { SS: { p: 306, e: 656 }, S: { p: 210, e: 450 }, A: { p: 140, e: 300 }, B: { p: 85, e: 180 } };
  var RANK_A_MUL = { SS: 1.00, S: 0.68, A: 0.45, B: 0.28 };
  var ARMOR_BASE = {
    head: { hp: 252, pdef: 0,   edef: 148, patk: 0  },
    body: { hp: 0,   pdef: 327, edef: 199, patk: 0  },
    arm:  { hp: 52,  pdef: 112, edef: 151, patk: 45 },
    leg:  { hp: 120, pdef: 105, edef: 210, patk: 19 }
  };
  var EVO_MUL = [0.44, 0.895, 1.00];
  // Limit-break bonus cộng vào công vật lý, đúng số wiki: Normal +20/+42/+55, Heat +44/+66/+89.
  var LB_BONUS = { normal: [0, 20, 42, 55, 55], heat: [0, 44, 66, 89, 89], soul: [0, 32, 54, 72, 72] };
  var MAX_LV = 40, MAX_LB = 4, MAX_EVO = 2;

  G.MAX_LV = MAX_LV; G.MAX_LB = MAX_LB; G.MAX_EVO = MAX_EVO;

  /* ------------------------------------------------------ SINH TRANG BỊ --- */
  // Ô Magi của một món: vũ khí 2 ô (+1 khi limit break lần 4), giáp 1 ô (+1 nếu là Gold).
  function slotShapes(rng, kind) {
    var pool = ['star', 'star', 'heart', 'diamond'];
    if (kind === 'weapon') {
      var a = pool[(rng() * pool.length) | 0], b = pool[(rng() * pool.length) | 0], c = pool[(rng() * pool.length) | 0];
      return [a, b, c];
    }
    return ['circle', 'circle'];
  }

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
      lv: 1, evo: 0, lb: 0, gold: true,
      magi: [null, null, null]
    };
    if (kind === 'weapon') {
      g.wclass = b.weapon; g.wtype = b.type; g.el = b.el;
      g.name = weaponName(b, 0);
      g.shapes = slotShapes(rng, 'weapon');
      g.green = b.ability || null;      // ability cố định hiện chữ xanh lá
    } else {
      g.el = b.el; g.defEl = counterOf(b.el);
      g.name = armorName(b, kind);
      g.shapes = slotShapes(rng, 'armor');
    }
    g.abilities = [rollAbility(rng, kind), rollAbility(rng, kind)];
    return g;
  };

  function counterOf(el) { for (var k in G.ELEM_BEATS) if (G.ELEM_BEATS[k] === el) return k; return 'none'; }

  var W_SUFFIX = {
    sword: ['Blade', 'Legend', 'Aspect'], great: ['Cleaver', 'Ruin', 'Apex'],
    spear: ['Lance', 'Pursuit', 'Zenith'], dual: ['Fangs', 'Talons', 'Eclipse'],
    bow: ['Bow', 'Cantus', 'Requiem']
  };
  var A_SUFFIX = { head: 'Visor', body: 'Vest', arm: 'Gauntlets', leg: 'Leggings' };
  function shortName(b) { var p = b.n.split(' '); return p[p.length - 1]; }
  function weaponName(b, evo) { return shortName(b) + "'s " + W_SUFFIX[b.weapon][evo]; }
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

  G.gearSlots = function (g) {
    // Vũ khí: 2 ô, ô thứ 3 mở ở limit break lần 4 (đúng wiki).
    // Giáp Gold: 1 ô, ô thứ 2 mở ở limit break lần 4. Giáp Silver không có ô thứ 2.
    if (g.kind === 'weapon') return g.lb >= 4 ? 3 : 2;
    return (g.gold && g.lb >= 4) ? 2 : 1;
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
      mats: {}, gear: [], magi: [],
      loadout: { weapons: [null, null, null], head: null, body: null, arm: null, leg: null },
      story: { done: [] },
      daily: { date: '', picks: [], done: {} },
      weekly: { week: '', picks: [], done: {} },
      area: 'tior',
      cleared: {},           // { 'tior-1': true, ... } — ải đã phá
      bossKills: {}, seenBoss: {},
      inv: {}, potions: {},
      stats: { boss: 0, mob: 0, deaths: 0, parts: 0, gathers: 0, rerolls: 0, buys: 0, potions: 0, magiLv: 0, equipLv: 0 },
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
      s.gear.concat(s.magi).forEach(function (o) {
        var m = /^u(\d+)_/.exec(o.uid || ''); if (m) uidSeq = Math.max(uidSeq, +m[1] + 1);
      });
      return s;
    } catch (e) { return null; }
  };
  G.save = function (s) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) { /* hết chỗ thì thôi, không chặn chơi */ }
  };
  G.wipe = function () { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} };

  /* --------------------------------------------- BỘ ĐỒ ĐANG MẶC -> CHỈ SỐ - */
  G.equipped = function (s) {
    var byUid = {}; s.gear.forEach(function (g) { byUid[g.uid] = g; });
    return {
      weapons: s.loadout.weapons.map(function (u) { return u ? byUid[u] : null; }),
      head: byUid[s.loadout.head] || null, body: byUid[s.loadout.body] || null,
      arm: byUid[s.loadout.arm] || null,   leg: byUid[s.loadout.leg] || null
    };
  };

  G.magiByUid = function (s, u) {
    if (!u) return null;
    var inst = s.magi.find(function (m) { return m.uid === u; });
    if (!inst) return null;
    var def = G.magiById(inst.id);
    return def ? Object.assign({}, def, { uid: inst.uid, lv: inst.lv }) : null;
  };

  // Nhân hiệu quả Magi theo cấp: lv1 = 100%, lv max = 220%. [TÁI DỰNG]
  G.magiPower = function (m) {
    var max = G.MAGI_MAXLV[m.rank] || 20;
    return 1 + 1.2 * ((m.lv - 1) / Math.max(1, max - 1));
  };

  /* Tổng hợp toàn bộ chỉ số chiến đấu của người chơi. Đây là chỗ duy nhất
   * ability, passive magi và bộ đồ gặp nhau — game.js chỉ đọc kết quả. */
  G.buildStats = function (s) {
    var B = G.BAL, eq = G.equipped(s);
    var st = {
      hp: B.baseHp + B.hpPerLv * (s.lv - 1),
      atk: B.baseAtk + B.atkPerLv * (s.lv - 1),
      def: B.baseDef + B.defPerLv * (s.lv - 1),
      edef: 0,
      moveSpd: 1, dodge: 1, recovery: 1, magiCharge: 1, castSpd: 1, luck: 0,
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

    function applyPassive(m) {
      if (!m || !m.pas) return;
      var k = G.magiPower(m), p = m.pas;
      if (p.hp)  st.hp  += p.hp * k;
      if (p.atk) st.atk += p.atk * k;
      if (p.def) st.def += p.def * k;
      if (p.moveSpd) st.moveSpd += p.moveSpd;
      if (p.magiCharge) st.magiCharge += p.magiCharge;
      if (p.soul) st.soul += p.soul;
      if (p.heat) st.heat += p.heat;
      if (p.regen) st.regen += p.regen;
      if (p.edmg) for (var e in p.edmg) st.edmg[e] += p.edmg[e];
      if (p.watk) for (var w in p.watk) st.watk[w] += p.watk[w] * k;
    }

    // Bốn mảnh giáp
    var srcs = [];
    ['head', 'body', 'arm', 'leg'].forEach(function (k) {
      var g = eq[k]; if (!g) return;
      srcs.push(g.src);
      var gs = G.gearStats(g);
      st.hp += gs.hp; st.def += gs.pdef; st.edef += gs.edef; st.atk += gs.patk;
      (g.abilities || []).forEach(applyAbility);
      var n = G.gearSlots(g);
      for (var i = 0; i < n; i++) applyPassive(G.magiByUid(s, g.magi[i]));
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
  G.weaponProfile = function (s, g) {
    if (!g) return null;
    var W = G.WEAPONS[g.wclass], gs = G.gearStats(g);
    var prof = { g: g, W: W, patk: gs.patk, eatk: gs.eatk, el: g.el, wclass: g.wclass, wtype: g.wtype, extra: {} };
    (g.abilities || []).forEach(function (a) {
      var def = G.ABILITIES.find(function (x) { return x.id === a.id; });
      if (def) prof.extra[def.stat] = (prof.extra[def.stat] || 0) + a.v / 100;
    });
    prof.magi = [];
    var n = G.gearSlots(g);
    for (var i = 0; i < n; i++) { var m = G.magiByUid(s, g.magi[i]); if (m && m.shape !== 'circle') prof.magi.push(m); }
    return prof;
  };

  /* ------------------------------------------------------------ GACHA ---- */
  // Tỉ lệ THẬT: boss SS 3 / S 15 / A 55 / B 27 ; magi SS 3 / S 9 / A 48 / B 40.
  /* Gacha ra THẲNG trang bị. Tỉ lệ hạng giữ nguyên tỉ lệ thật của Quest Gacha bản
   * gốc (SS 3 / S 15 / A 55 / B 27) vì đó là con số có nguồn; chỉ đổi thứ rơi ra.
   * Trúng món đã có -> LÕI RỒNG, nguyên liệu độc quyền không cày được, dùng để tiến
   * hoá đồ S/SS. Xem G.DUPE_CORE trong data/gamedata.js. */
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

  G.summonMagi = function (s, count, guaranteed) {
    var out = [];
    for (var i = 0; i < count; i++) {
      var rank = (guaranteed && i === count - 1) ? 'SS' : G.rollRank(G.MAGI_RATES, Math.random);
      var pool = G.MAGI.filter(function (m) { return m.rank === rank; });
      var def = pool[(Math.random() * pool.length) | 0];
      var inst = { uid: uid(), id: def.id, lv: 1 };
      s.magi.push(inst);
      out.push(Object.assign({}, def, inst));
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
  G.magiEnhanceCost = function (m) {
    var k = { SS: 4, S: 2.4, A: 1.4, B: 1 }[m.rank] || 1;
    return { gold: Math.round((90 + m.lv * 55) * k), mat: { magi_frag: 1 + Math.floor(m.lv / 10) } };
  };
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
  G.enhanceMagi = function (s, inst) {
    var def = G.magiById(inst.id); if (!def) return { ok: false, why: '?' };
    var max = G.MAGI_MAXLV[def.rank] || 20;
    if (inst.lv >= max) return { ok: false, why: 'Đã tối đa cấp' };
    var c = G.magiEnhanceCost({ rank: def.rank, lv: inst.lv });
    if (!G.canPay(s, c)) return { ok: false, why: 'Không đủ Magi Fragment' };
    G.pay(s, c); inst.lv++; s.stats.magiLv++;
    return { ok: true };
  };
  // Rã trang bị -> Lapis cùng hạng (đúng bản gốc: Lapis từ việc rã đồ boss).
  G.dismantle = function (s, g) {
    var lap = { B: 'lapis_b', A: 'lapis_a', S: 'lapis_s', SS: 'lapis_ss' }[g.rank] || 'lapis_b';
    var n = 1 + g.lb + g.evo;
    G.addMat(s, lap, n);
    // Trả Magi đang lắp về kho
    g.magi = [null, null, null];
    for (var k in s.loadout) {
      if (Array.isArray(s.loadout[k])) s.loadout[k] = s.loadout[k].map(function (u) { return u === g.uid ? null : u; });
      else if (s.loadout[k] === g.uid) s.loadout[k] = null;
    }
    s.gear = s.gear.filter(function (x) { return x.uid !== g.uid; });
    return { ok: true, lapis: lap, n: n };
  };

  /* ------------------------------------------------------- MAGI LẮP ----- */
  G.equipMagi = function (s, g, slotIdx, magiUid) {
    var n = G.gearSlots(g);
    if (slotIdx >= n) return { ok: false, why: 'Ô này chưa mở' };
    if (magiUid) {
      var m = G.magiByUid(s, magiUid);
      if (!m) return { ok: false, why: 'Không có Magi này' };
      if (m.shape !== g.shapes[slotIdx]) return { ok: false, why: 'Hình dạng Magi không khớp ô' };
      // Một viên Magi chỉ lắp được vào một chỗ.
      s.gear.forEach(function (x) { x.magi = x.magi.map(function (u) { return u === magiUid ? null : u; }); });
    }
    g.magi[slotIdx] = magiUid || null;
    return { ok: true };
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
  G.starterKit = function (s) {
    var starter = 'grouton';
    var w = G.forgeGear('vaccahorn', 'weapon', 'starter');
    w.wclass = 'sword'; w.wtype = 'normal'; w.name = 'Guild Blade'; w.rank = 'B'; w.el = 'none';
    w.shapes = ['star', 'heart', 'diamond'];
    s.gear.push(w);
    s.loadout.weapons[0] = w.uid;
    ['head', 'body', 'arm', 'leg'].forEach(function (k) {
      var g = G.forgeGear(starter, k, 'starter');
      g.rank = 'B'; g.name = 'Guild ' + { head: 'Helm', body: 'Plate', arm: 'Wrists', leg: 'Sabatons' }[k];
      s.gear.push(g); s.loadout[k] = g.uid;
    });
    // Vài viên Magi mở màn, và một viên Attack để bấm được nút Magi ngay từ trận đầu
    var m1 = { uid: uid(), id: 'flame_slash', lv: 1 };
    var m2 = { uid: uid(), id: 'first_aid', lv: 1 };
    var m3 = { uid: uid(), id: 'crushing_mastery', lv: 1 };
    s.magi.push(m1, m2, m3);
    G.equipMagi(s, w, 0, m1.uid);
    G.equipMagi(s, w, 1, m2.uid);
    var head = s.gear.find(function (g) { return g.uid === s.loadout.head; });
    if (head) G.equipMagi(s, head, 0, m3.uid);
    G.addMat(s, 'str_stone', 8); G.addMat(s, 'magi_frag', 6); G.addMat(s, 'crystal', 2);
    return s;
  };
})(window.DP = window.DP || {});
