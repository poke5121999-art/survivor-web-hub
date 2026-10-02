// Sổ của một ca (5 lượt lặn) và của lượt lặn đang chơi. Không phụ thuộc three.js; main.js và các hệ đọc/ghi qua đây.
// Luật tiền theo REPO (games/repo2d/game.js, gamespark-config của REPO_Meta):
// chỉ tiêu = Σ giá đồ cổ rải × 0,7 × curve(cấp) × 0,55 (một người) × quotaMul của map.
window.BDL = window.BDL || {};
(function (BDL) {
  'use strict';

  var QUOTA_FACTOR = 0.7, SOLO_CREW_MUL = 0.55, SELL_CAP = 3, DRONE_TRIPS = 3;
  // Quỹ tiền của một map = 3 × chỉ tiêu, không hơn (chủ dự án, 2026-10-02). Chia cho đồ cổ / cá / xác quái theo SHARE [ĐỀ XUẤT];
  // nguồn nào map không có thì phần của nó chia lại cho nguồn còn lại.
  var POOL_MUL = 3;
  var SHARE = { loot: 0.6, fish: 0.25, foe: 0.15 };

  // Giá gốc của mọi cá bán được còn trong allocator (cá cảnh không tính).
  function fishRawOf(G) {
    var sum = 0;
    (G.fishes ? G.fishes.allocs : []).forEach(function (a) {
      if (a.sp && BDL.fishRole(a.sp) !== 'decor') sum += a.left * BDL.fishRaw(a.sp);
    });
    return sum;
  }
  // Xác quái bán được: mỗi loài có xác tối đa SELL_CAP lần, giá theo hp/dmg đã nhân của map (như js/foes.js makeFoe).
  function foeRawOf(map) {
    var R = BDL.foeRoster ? BDL.foeRoster(map) : { kinds: [] };
    return R.kinds.reduce(function (sum, row) {
      if (row.noCorpse || row.pack) return sum;
      return sum + SELL_CAP * BDL.foeValue(Math.max(1, Math.round(row.hp * R.hpMul)), Math.round(row.dmg * R.dmgMul * 10) / 10);
    }, 0);
  }

  // extract_quota.difficultyCurve: 0,4 ở cấp 1, 0,7 ở cấp 10, 1,0 từ cấp 20.
  BDL.curve = function (lv) {
    if (lv <= 1) return 0.4;
    if (lv <= 10) return 0.4 + (lv - 1) / 9 * 0.3;
    if (lv <= 20) return 0.7 + (lv - 10) / 10 * 0.3;
    return 1;
  };

  // Cá nhỏ vào túi tính theo ký. Ký ước từ chiều dài vì bảng cá gốc không có cân nặng [ĐỀ XUẤT].
  // Cá vào túi nặng tối đa 8 kg [ĐỀ XUẤT]: cá vừa dài tới 1,7 m theo công thức này nặng 26–73 kg, túi 20 kg không nhận nổi một con.
  BDL.fishKg = function (sp) {
    var kg = Math.max(0.1, Math.round(Math.pow(sp.cm / 100, 3) * 15 * 10) / 10);
    return BDL.fishRole(sp) === 'bag' ? Math.min(kg, 8) : kg;
  };
  BDL.fishValue = function (sp) {
    var r = sp.rank || 1;
    return Math.round((60 + r * r * 40) * (1 + sp.cm / 60) / 10) * 10;
  };
  // Xác quái: công thức orb của REPO (foeLootValue), làm tròn 50.
  BDL.foeValue = function (hp, dmg) { return Math.max(50, Math.round((hp * 9 + dmg * 60) / 50) * 50); };

  var run = {
    ca: null,     // cả ca: {mapIdx, wallet, total, upg{}, stash[], kills, floorsMax, cleared}
    dive: null,   // lượt đang lặn: {map, quota, lootTotal, onDeck, pile[], sold{}, droneLeft, kills}

    start: function () {
      // bought/shopRoll: trạm (shop.js) đếm số lần mua từng nâng cấp và giữ đồ bày của lần ghé đang dở
      run.ca = { mapIdx: 0, wallet: 0, total: 0, upg: {}, stash: [], kills: 0, skills: 0, floorsMax: 0, cleared: 0, bought: {}, shopRoll: null };
      run.dive = null;
      return run.ca;
    },

    beginDive: function (map) {
      if (!run.ca) run.start();
      run.ca.mapIdx = map.id;
      run.dive = { map: map, quota: 0, lootTotal: 0, onDeck: 0, pile: [], sold: {}, droneLeft: DRONE_TRIPS, kills: 0 };
      return run.dive;
    },

    // Hệ đồ cổ gọi một lần sau khi rải xong, với tổng giá gốc của mọi món đã rải.
    setQuota: function (lootValueSum) {
      var d = run.dive, m = d.map;
      d.lootTotal = lootValueSum;
      d.quota = Math.round(lootValueSum * QUOTA_FACTOR * BDL.curve(m.level) * run.crewMul() * (m.quotaMul || 1) / 100) * 100;
      return d.quota;
    },

    // Hệ đồ cổ gọi một lần sau khi rải: đặt chỉ tiêu REPO rồi chia quỹ 3 × chỉ tiêu cho ba nguồn tiền.
    // Trả tỉ lệ { loot, fish, foe } nhân vào giá gốc; mọi giá bán trong lượt lặn đi qua run.price.
    settle: function (G, map, lootRaw) {
      var d = run.dive, raw = { loot: lootRaw, fish: fishRawOf(G), foe: foeRawOf(map) }, w = 0, k;
      run.setQuota(lootRaw);
      d.pool = d.quota * POOL_MUL;
      for (k in SHARE) if (raw[k] > 0) w += SHARE[k];
      d.raw = raw; d.rate = {};
      for (k in SHARE) d.rate[k] = raw[k] > 0 ? d.pool * SHARE[k] / w / raw[k] : 0;
      return d.rate;
    },

    // Giá bán thật của một món có giá gốc raw. Làm tròn xuống 10 cho tổng không vượt quỹ.
    price: function (kind, raw) {
      var d = run.dive, r = d && d.rate ? d.rate[kind] : 1;
      return Math.floor(raw * r / 10) * 10;
    },

    // Một món lên boong: {kind: 'loot'|'fish'|'foe', key, label, value, icon}. Lên boong là đã bán, không lấy lại.
    deliver: function (item) {
      var d = run.dive;
      item.value = Math.max(0, Math.round(item.value));
      d.pile.push(item);
      d.onDeck += item.value;
      if (item.kind === 'foe') run.markSold(item.key);
      if (BDL.onDeliver) BDL.onDeliver(item);
      return item;
    },

    // extract_quota.crewMul của REPO: 0,4 + 0,15 × min(số người, 4). Chỉ tính cả tổ khi đồng đội lặn cùng thật
    // (js/mates.js đặt BDL.MATES_DIVE = true lúc nạp); chưa có thì như lặn một mình.
    crewMul: function () {
      var mates = BDL.MATES_DIVE && run.ca && run.ca.crew ? run.ca.crew.mates.length : 0;
      return mates ? 0.4 + 0.15 * Math.min(1 + mates, 4) : SOLO_CREW_MUL;
    },

    quotaMet: function () { return !!run.dive && run.dive.onDeck >= run.dive.quota; },

    // Trần bán quái REPO: mỗi loài bán tối đa 3 lần trong một lượt lặn; quá thì xác tan.
    sellable: function (kind) { return (run.dive.sold[kind] || 0) < SELL_CAP; },
    markSold: function (kind) { run.dive.sold[kind] = (run.dive.sold[kind] || 0) + 1; },

    // Hết lượt lặn bằng khoang lái: tiền trên boong vào ví ca, sang map sau.
    endDive: function () {
      var c = run.ca, d = run.dive;
      c.wallet += d.onDeck; c.total += d.onDeck; c.kills += d.kills; c.cleared++;
      c.mapIdx++;
      run.dive = null;
      return c;
    },
  };
  BDL.run = run;
  BDL.systems = BDL.systems || [];
  BDL.SELL_CAP = SELL_CAP;
  BDL.POOL_MUL = POOL_MUL;
})(window.BDL);
