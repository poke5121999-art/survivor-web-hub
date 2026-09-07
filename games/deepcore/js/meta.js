/*
 * meta.js — mọi thứ NGOÀI ván: túi tiền, gacha, nâng cấp, trang bị, tiến độ ải.
 *
 * Hai loại tiền, đúng như Survivor.io:
 *   VÀNG  luôn có, tiêu vào nâng cấp vĩnh viễn và lên bậc linh thú
 *   NGỌC  luôn thiếu, chỉ đi vào gacha
 * Tách theo CHỨC NĂNG chứ không theo độ hiếm — nhờ thế người chơi không bao giờ
 * phải phân vân "để dành cái nào", và cũng không có cảm giác tiêu nhầm.
 *
 * Vì sao có "nâng ngoài ván": ải khó là ải mà kỹ năng không gánh nổi. Không có
 * đường tiến bộ vĩnh viễn thì người chơi kẹt vĩnh viễn. Nâng ngoài ván biến
 * "chưa qua nổi" thành "chưa đủ mạnh, cày thêm chút nữa" — đó là toàn bộ lý do
 * thể loại này giữ chân được người chơi phổ thông.
 *
 * Lưu bằng localStorage, và NẾU hub có cầu lưu đám mây (window.HubSave) thì
 * đẩy thêm lên đó. Cầu mây là lớp NẰM DƯỚI bản lưu máy, không bao giờ thay thế
 * nó — hub quy định vậy (games/BRIDGE.md).
 */
(function (G) {
  'use strict';

  var KEY = 'deepcore.save.v1';

  var UPGRADES = [
    { id: 'hp',      name: 'Thể Lực',     icon: 733, max: 20, base: 120, step: 1.35,
      txt: function (n) { return '+' + (n * 8) + ' máu tối đa'; } },
    { id: 'armor',   name: 'Da Dày',      icon: 455, max: 15, base: 200, step: 1.42,
      txt: function (n) { return '+' + (n * 1.2).toFixed(1) + '% giảm sát thương'; } },
    { id: 'speed',   name: 'Chân Nhanh',  icon: 458, max: 15, base: 180, step: 1.40,
      txt: function (n) { return '+' + (n * 1.5).toFixed(1) + '% tốc chạy'; } },
    { id: 'power',   name: 'Tay Khoẻ',    icon: 577, max: 20, base: 150, step: 1.34,
      txt: function (n) { return '+' + (n * 4) + '% sức đào'; } },
    { id: 'rate',    name: 'Nhịp Cuốc',   icon: 577, max: 15, base: 220, step: 1.40,
      txt: function (n) { return '+' + (n * 2.5).toFixed(1) + '% tốc đào'; } },
    { id: 'light',   name: 'Mắt Quen Tối', icon: 547, max: 12, base: 240, step: 1.45,
      txt: function (n) { return '+' + (n * 3) + '% bán kính đèn'; } },
    { id: 'petdmg',  name: 'Huấn Thú',    icon: 988, max: 25, base: 260, step: 1.36,
      txt: function (n) { return '+' + (n * 3) + '% sát thương linh thú'; } },
    { id: 'pethp',   name: 'Nuôi Béo',    icon: 580, max: 20, base: 200, step: 1.36,
      txt: function (n) { return '+' + (n * 5) + '% máu linh thú'; } },
    { id: 'greed',   name: 'Mắt Lái Buôn', icon: 153, max: 15, base: 300, step: 1.48,
      txt: function (n) { return '+' + (n * 4) + '% vàng nhận được'; } }
  ];
  var UP_BY = {};
  UPGRADES.forEach(function (u) { UP_BY[u.id] = u; });

  function upCost(u, lv) {
    return Math.round(u.base * Math.pow(u.step, lv));
  }

  // ---------------------------------------------------------------- bản lưu

  function fresh() {
    return {
      v: 1,
      gold: 400, gem: 60,
      frag: {},
      pets: { rua: { own: true, tier: 1 }, cho: { own: true, tier: 1 } },
      team: ['rua', 'cho'],
      inv: { 'p_wood': { lv: 1 }, 'l_torch': { lv: 1 }, 'wood:helm': { lv: 1 },
             'wood:chest': { lv: 1 }, 'wood:pants': { lv: 1 } },
      eq: { pick: 'p_wood', lamp: 'l_torch',
            helm: 'wood:helm', chest: 'wood:chest', pants: 'wood:pants', ring: null },
      look: { hair: '1', female: false },
      up: {},
      stage: { dirt: 1 },
      pity: 0,
      stats: { runs: 0, wins: 0, kills: 0, dug: 0 }
    };
  }

  var S = null;

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      S = raw ? JSON.parse(raw) : fresh();
    } catch (e) { S = fresh(); }
    // vá bản lưu cũ: thiếu trường nào thì lấy của bản mới
    var f = fresh();
    for (var k in f) if (S[k] === undefined) S[k] = f[k];
    return S;
  }

  var saveT = 0;
  function save(now) {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
    // Cầu lưu đám mây của hub, nếu có. Không có thì im lặng bỏ qua — luật bất
    // biến của hub: mọi thứ phải chạy được kể cả khi không có tài khoản.
    if (window.HubSave && window.HubSave.push) {
      try { window.HubSave.push('deepcore', S); } catch (e) {}
    }
  }

  // ---------------------------------------------------------------- chỉ số

  /* Gộp: chỉ số gốc + trang bị + nâng cấp vĩnh viễn -> bảng dùng trong ván. */
  function buildStats() {
    var st = {
      hp: 145, speed: 118, armor: 0,
      minePower: 10, mineRate: 1.7, pickTier: 0, pickIcon: 643,
      light: 88,
      petDmg: 1, petHp: 1, petRate: 1,
      nearR: 120, rallyCd: 6, pickR: 34,
      xpMul: 1, goldMul: 1,
      eq: {}
    };
    var e = S.eq;
    ['helm', 'chest', 'pants'].forEach(function (slot) {
      var id = e[slot];
      if (!id || !S.inv[id]) return;
      var d = G.EQ_ALL[id];
      if (!d) return;
      st.eq[slot] = d.set;
      var s = G.eqStats(id, S.inv[id].lv);
      st.armor += s.armor || 0;
      st.hp += s.hp || 0;
      st.speed *= 1 + (s.speed || 0);
    });
    if (e.pick && S.inv[e.pick]) {
      var ps = G.eqStats(e.pick, S.inv[e.pick].lv);
      st.minePower = ps.minePower;
      st.mineRate = ps.mineRate;
      st.pickTier = ps.pickTier;
      st.pickIcon = G.EQ_ALL[e.pick].icon;
    }
    if (e.lamp && S.inv[e.lamp]) st.light = G.eqStats(e.lamp, S.inv[e.lamp].lv).light;
    if (e.ring && S.inv[e.ring]) {
      var rs = G.eqStats(e.ring, S.inv[e.ring].lv);
      st.hp += rs.hp || 0;
      st.armor += rs.armor || 0;
      st.speed *= 1 + (rs.speed || 0);
      st.petDmg *= 1 + (rs.petDmg || 0);
    }
    var u = S.up;
    st.hp += (u.hp || 0) * 8;
    st.armor += (u.armor || 0) * 0.012;
    st.speed *= 1 + (u.speed || 0) * 0.015;
    st.minePower *= 1 + (u.power || 0) * 0.04;
    st.mineRate *= 1 + (u.rate || 0) * 0.025;
    st.light *= 1 + (u.light || 0) * 0.03;
    st.petDmg *= 1 + (u.petdmg || 0) * 0.03;
    st.petHp *= 1 + (u.pethp || 0) * 0.05;
    st.goldMul *= 1 + (u.greed || 0) * 0.04;
    st.armor = Math.min(0.62, st.armor);
    return st;
  }

  // ---------------------------------------------------------------- gacha

  /* Hai quầy. Không giấu tỉ lệ: bảng in thẳng trên màn hình, và có "bảo hiểm"
   * sau 10 lần — Survivor.io cũng chỉ công bố mỗi cái bảo hiểm đó, và đúng là
   * cái người chơi quan tâm nhất. */
  var BANNERS = {
    pet: {
      id: 'pet', name: 'TRỨNG LINH THÚ', icon: 452,
      one: 60, ten: 540,
      table: [[52, 1], [30, 2], [13, 3], [5, 4]],
      pity: 'Mỗi 10 lần chắc chắn có ít nhất bậc Hiếm.'
    },
    gear: {
      id: 'gear', name: 'HÒM TRANG BỊ', icon: 453,
      one: 50, ten: 450,
      table: [[48, 1], [30, 2], [15, 3], [6, 4], [1, 5]],
      pity: 'Mỗi 10 lần chắc chắn có ít nhất bậc Hiếm.'
    }
  };

  function rollRare(table, floor) {
    var tot = 0, i;
    for (i = 0; i < table.length; i++) tot += table[i][0];
    var r = Math.random() * tot;
    for (i = 0; i < table.length; i++) {
      r -= table[i][0];
      if (r <= 0) return Math.max(floor || 0, table[i][1]);
    }
    return table[table.length - 1][1];
  }

  function pullPet(floor) {
    var pool = G.PETS.filter(function (p) { return p.rare <= 4; });
    var rare = rollRare(BANNERS.pet.table, floor);
    var cands = pool.filter(function (p) { return p.rare === rare; });
    if (!cands.length) cands = pool;
    var d = cands[(Math.random() * cands.length) | 0];
    var rec = S.pets[d.id];
    var dup = !!(rec && rec.own);
    if (!dup) {
      S.pets[d.id] = { own: true, tier: 1 };
      if (S.team.length < 6) S.team.push(d.id);
    } else {
      // trùng thì thành MẢNH của chính con đó — không có "quay ra rác"
      S.frag[d.id] = (S.frag[d.id] || 0) + 12 + d.rare * 6;
    }
    return { kind: 'pet', id: d.id, name: d.name, rare: d.rare, art: d.art,
             dup: dup, frag: dup ? 12 + d.rare * 6 : 0 };
  }

  function pullGear(floor) {
    var rare = rollRare(BANNERS.gear.table, floor);
    var ids = Object.keys(G.EQ_ALL).filter(function (k) {
      var d = G.EQ_ALL[k];
      var r = d.armorSet ? G.EQ_SETS.filter(function (s) { return s.id === d.set; })[0].rare : d.rare;
      return r === rare;
    });
    if (!ids.length) ids = Object.keys(G.EQ_ALL);
    var id = ids[(Math.random() * ids.length) | 0];
    var d = G.EQ_ALL[id];
    var dup = !!S.inv[id];
    if (dup) {
      // trùng trang bị -> lên cấp món đó, tối đa 10
      S.inv[id].lv = Math.min(10, S.inv[id].lv + 1);
    } else {
      S.inv[id] = { lv: 1 };
    }
    var rr = d.armorSet ? G.EQ_SETS.filter(function (s) { return s.id === d.set; })[0].rare : d.rare;
    return { kind: 'gear', id: id, name: d.name, rare: rr, icon: G.eqIcon(id),
             dup: dup, lv: S.inv[id].lv };
  }

  function pull(bannerId, times) {
    var b = BANNERS[bannerId];
    var cost = times === 10 ? b.ten : b.one;
    if (S.gem < cost) return null;
    S.gem -= cost;
    var out = [];
    for (var i = 0; i < times; i++) {
      S.pity++;
      var floor = 0;
      if (S.pity >= 10) { floor = 3; S.pity = 0; }
      out.push(bannerId === 'pet' ? pullPet(floor) : pullGear(floor));
      if (out[out.length - 1].rare >= 3) S.pity = 0;
    }
    save();
    return out;
  }

  // ---------------------------------------------------------------- thao tác

  function equip(slot, id) {
    if (!S.inv[id]) return false;
    S.eq[slot] = id;
    save();
    return true;
  }

  function upgradePet(id) {
    var rec = S.pets[id];
    if (!rec || !rec.own || rec.tier >= 5) return false;
    var c = G.PET_UP_COST[rec.tier];
    if ((S.frag[id] || 0) < c.frag || S.gold < c.gold) return false;
    S.frag[id] -= c.frag;
    S.gold -= c.gold;
    rec.tier++;
    save();
    return true;
  }

  function buyUpgrade(id) {
    var u = UP_BY[id];
    var lv = S.up[id] || 0;
    if (!u || lv >= u.max) return false;
    var c = upCost(u, lv);
    if (S.gold < c) return false;
    S.gold -= c;
    S.up[id] = lv + 1;
    save();
    return true;
  }

  /* Kết thúc một ván: quy quặng ra vàng, cộng ngọc nếu lần đầu qua ải. */
  function finishRun(res) {
    S.stats.runs++;
    var gold = 0;
    for (var k in res.carry) {
      var o = G.ORE[k];
      if (o && o.gold) gold += o.gold * res.carry[k];
      S.stats.dug += res.carry[k];
    }
    gold += res.kills * 2;
    if (res.won) gold = Math.round(gold * 1.5);
    gold = Math.round(gold * buildStats().goldMul);
    S.gold += gold;
    S.stats.kills += res.kills;

    var gem = 0;
    var cur = S.stage[res.biome] || 1;
    if (res.won) {
      S.stats.wins++;
      if (res.level >= cur) {
        gem = 20;                       // lần đầu qua ải
        S.stage[res.biome] = res.level + 1;
        // mở quần thể kế tiếp khi qua ải 3 của quần thể hiện tại
        if (res.level >= 3) {
          var idx = G.BIOMES.map(function (b) { return b.id; }).indexOf(res.biome);
          var nx = G.BIOMES[idx + 1];
          if (nx && !S.stage[nx.id]) { S.stage[nx.id] = 1; res.unlocked = nx; }
        }
      } else gem = 4;
    }
    S.gem += gem;

    // mảnh linh thú: chỉ rơi cho con MANG THEO — thưởng cho việc chọn đội hình
    var frags = {};
    if (res.won) {
      res.team.forEach(function (id) {
        var n = 6 + res.level * 2;
        S.frag[id] = (S.frag[id] || 0) + n;
        frags[id] = n;
      });
    }
    save();
    return { gold: gold, gem: gem, frags: frags, unlocked: res.unlocked };
  }

  G.Meta = {
    load: load, save: save,
    get s() { return S; },
    stats: buildStats,
    UPGRADES: UPGRADES, upCost: upCost, buyUpgrade: buyUpgrade,
    BANNERS: BANNERS, pull: pull,
    equip: equip, upgradePet: upgradePet,
    finishRun: finishRun,
    reset: function () { S = fresh(); save(); }
  };
})(window.DC = window.DC || {});
