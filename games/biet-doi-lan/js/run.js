// Sổ của một ca (5 lượt lặn) và của lượt lặn đang chơi. Không phụ thuộc three.js; main.js và các hệ đọc/ghi qua đây.
// Luật tiền theo REPO (games/repo2d/game.js, gamespark-config của REPO_Meta):
// chỉ tiêu = Σ giá đồ cổ rải × 0,7 × curve(cấp) × 0,55 (một người) × quotaMul của map.
window.BDL = window.BDL || {};
(function (BDL) {
  'use strict';

  var QUOTA_FACTOR = 0.7, SOLO_CREW_MUL = 0.55, SELL_CAP = 3, DRONE_TRIPS = 3;

  // extract_quota.difficultyCurve: 0,4 ở cấp 1, 0,7 ở cấp 10, 1,0 từ cấp 20.
  BDL.curve = function (lv) {
    if (lv <= 1) return 0.4;
    if (lv <= 10) return 0.4 + (lv - 1) / 9 * 0.3;
    if (lv <= 20) return 0.7 + (lv - 10) / 10 * 0.3;
    return 1;
  };

  // Cá nhỏ vào túi tính theo ký. Ký ước từ chiều dài vì bảng cá gốc không có cân nặng [ĐỀ XUẤT].
  BDL.fishKg = function (sp) { return Math.max(0.1, Math.round(Math.pow(sp.cm / 100, 3) * 15 * 10) / 10); };
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
      run.ca = { mapIdx: 0, wallet: 0, total: 0, upg: {}, stash: [], kills: 0, skills: 0, floorsMax: 0, cleared: 0 };
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
      d.quota = Math.round(lootValueSum * QUOTA_FACTOR * BDL.curve(m.level) * SOLO_CREW_MUL * (m.quotaMul || 1) / 100) * 100;
      return d.quota;
    },

    // Một món lên boong: {kind: 'loot'|'fish'|'foe', key, label, value, icon}. Lên boong là đã bán, không lấy lại.
    deliver: function (item) {
      var d = run.dive;
      item.value = Math.max(0, Math.round(item.value));
      d.pile.push(item);
      d.onDeck += item.value;
      if (BDL.onDeliver) BDL.onDeliver(item);
      return item;
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
})(window.BDL);
