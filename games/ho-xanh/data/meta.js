// Bảng nâng cấp một ngày trọn vòng: trang bị lặn, súng phụ, quán sushi, giá món. Chỉ dữ liệu và hàm thuần, không đụng DOM.
// Mọi con số cấp 0 bằng đúng data/tuning.js để chưa nâng gì thì lặn y như trước.
// [DtD] = lấy từ data/gear_sheet.js (bóc từ bản gốc) nếu có; [ĐỀ XUẤT] = tự chọn.
(function (root) {
  'use strict';

  function lv(pairs) { return pairs.map(function (p) { return { cost: p[0], value: p[1] }; }); }

  var GEAR = {
    o2: { name: 'Bình dưỡng khí', desc: 'Dưỡng khí tối đa mỗi lượt lặn', unit: 'O₂',
      levels: lv([[0, 100], [300, 120], [800, 140], [1800, 170], [3500, 200], [6000, 250]]) },      // [ĐỀ XUẤT] cấp 0 = tuning.o2.max
    cargo: { name: 'Túi đựng cá', desc: 'Số cá mang theo được; túi đầy thì cá xiên được cũng phải thả', unit: 'con',
      levels: lv([[0, 8], [200, 10], [600, 12], [1400, 15], [2800, 18], [5000, 22]]) },            // [ĐỀ XUẤT]
    suit: { name: 'Đồ lặn', desc: 'Độ sâu an toàn; xuống quá mức này dưỡng khí tụt ×2,5', unit: 'm',
      levels: lv([[0, 130], [500, 160], [1500, 190], [3000, 220], [6000, 250]]) },                 // [ĐỀ XUẤT] cấp 0 vừa hết tầng giữa
    knife: { name: 'Dao', desc: 'Sát thương mỗi nhát dao', unit: 'st',
      levels: lv([[0, 2], [250, 3], [800, 4], [2000, 6], [4500, 8]]) },                             // [ĐỀ XUẤT] cấp 0 = tuning.knife.damage
    harpoon: { name: 'Súng xiên', desc: 'Sát thương mỗi phát xiên', unit: 'st',
      levels: lv([[0, 3], [300, 4], [900, 6], [2000, 8], [4000, 11], [7500, 15]]) },               // [DtD] cấp 0 = Harpoon gun lv1; các cấp sau [ĐỀ XUẤT]
    engine: { name: 'Động cơ cano', desc: 'Cano chạy nhanh hơn, ra khơi và về quán sớm hơn', unit: '×',
      levels: lv([[0, 1], [300, 1.15], [900, 1.3], [2000, 1.5], [4000, 1.75]]) },                   // [ĐỀ XUẤT]
  };

  var BAR = {
    seats: { name: 'Ghế khách', desc: 'Số khách ngồi cùng lúc', unit: 'ghế',
      levels: lv([[0, 3], [400, 4], [1200, 5], [3000, 6]]) },                                       // [ĐỀ XUẤT]
    chef: { name: 'Đầu bếp', desc: 'Bancho làm món nhanh hơn', unit: '×',
      levels: lv([[0, 1], [300, 1.2], [900, 1.4], [2000, 1.7], [4000, 2]]) },                       // [ĐỀ XUẤT]
    decor: { name: 'Trang trí', desc: 'Nhân tiền tip và nhịp khách vào quán', unit: '×',
      levels: lv([[0, 1], [250, 1.1], [800, 1.2], [1800, 1.35], [3600, 1.5]]) },                    // [ĐỀ XUẤT]
    tea: { name: 'Trà xanh', desc: 'Giá một chén trà rót cho khách', unit: 'vàng',
      levels: lv([[0, 10], [150, 15], [500, 20], [1200, 30], [2500, 40]]) },                        // [ĐỀ XUẤT]
  };

  // mode: bullet = đạn thẳng, spread = chùm đạn toả, net = lưới bắt sống cá nhỏ, sleep = đạn ngủ làm cá đứng yên.
  var GUNS = {
    pistol: { name: 'Súng lục', desc: 'Nhẹ, bắn nhanh, sát thương thấp', cost: 300, mode: 'bullet',
      dmg: 2, pellets: 1, spreadDeg: 0, speed: 22, range: 7, ammo: 30, cooldown: 0.35 },            // [ĐỀ XUẤT]
    rifle: { name: 'Súng trường', desc: 'Một phát mạnh, tầm xa, nạp chậm', cost: 1200, mode: 'bullet',
      dmg: 6, pellets: 1, spreadDeg: 0, speed: 30, range: 10, ammo: 12, cooldown: 0.9 },           // [ĐỀ XUẤT]
    shotgun: { name: 'Súng hoa cải', desc: 'Năm viên toả rộng, tầm gần', cost: 1500, mode: 'spread',
      dmg: 2, pellets: 5, spreadDeg: 30, speed: 18, range: 4.5, ammo: 10, cooldown: 1.0 },         // [ĐỀ XUẤT]
    net: { name: 'Súng lưới', desc: 'Bắt sống cá nhỏ, không cần hạ', cost: 900, mode: 'net',
      dmg: 0, pellets: 1, spreadDeg: 0, speed: 9, range: 5, ammo: 5, cooldown: 1.5 },              // [ĐỀ XUẤT]
    sleep: { name: 'Súng ngủ', desc: 'Cá trúng đạn đứng yên một lúc', cost: 1000, mode: 'sleep',
      dmg: 0, pellets: 1, spreadDeg: 0, speed: 16, range: 7, ammo: 8, cooldown: 1.2 },             // [ĐỀ XUẤT]
  };

  var SUIT_OVER_MUL = 2.5;   // [ĐỀ XUẤT] quá độ sâu an toàn của đồ lặn thì dưỡng khí tụt nhanh gấp chừng này

  // ---------- số từ bản gốc, nếu luồng bóc asset đã ghi ra data/gear_sheet.js ----------
  // Chưa biết hình dạng tệp ấy: chỉ nhận khi rõ ràng là [{cost, value}] đủ số, cấp 0 miễn phí.
  function validLevels(a) {
    return Array.isArray(a) && a.length >= 2 && a[0] && a[0].cost === 0 && a.every(function (l) {
      return l && isFinite(l.cost) && isFinite(l.value) && l.cost >= 0;
    });
  }
  var GUN_NUM = ['cost', 'dmg', 'pellets', 'spreadDeg', 'speed', 'range', 'ammo', 'cooldown'];
  function mergeSheet(sheet) {
    if (!sheet || typeof sheet !== 'object') return;
    [GEAR, BAR].forEach(function (tab) {
      Object.keys(tab).forEach(function (k) {
        var src = sheet[k] || (sheet.gear && sheet.gear[k]) || (sheet.bar && sheet.bar[k]);
        var levels = src && (Array.isArray(src) ? src : src.levels);
        if (validLevels(levels)) tab[k].levels = levels.map(function (l) { return { cost: +l.cost, value: +l.value }; });
      });
    });
    var guns = sheet.guns;
    if (guns && typeof guns === 'object') Object.keys(GUNS).forEach(function (id) {
      var g = guns[id];
      if (!g || typeof g !== 'object') return;
      GUN_NUM.forEach(function (f) { if (isFinite(g[f]) && g[f] !== null && g[f] !== '') GUNS[id][f] = +g[f]; });
    });
  }
  mergeSheet(root.HX_GEAR_SHEET);

  // ---------- sổ lưu: dạng mặc định, mọi nâng cấp tra bảng nào ----------
  var SLOT = {};
  Object.keys(GEAR).forEach(function (k) { SLOT[k] = 'gear'; });
  Object.keys(BAR).forEach(function (k) { SLOT[k] = 'bar'; });

  function zeros(tab) { var o = {}; Object.keys(tab).forEach(function (k) { o[k] = 0; }); return o; }
  function defaults() {
    return {
      v: 1, day: 1, stage: 'prep', gold: 0,
      gear: zeros(GEAR), guns: { owned: [], equipped: null },
      fridge: {}, bar: zeros(BAR), dex: {}, stats: { served: 0, earned: 0 },
    };
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function table(key) {
    var t = GEAR[key] || BAR[key];
    if (!t) throw new Error('không có nâng cấp "' + key + '"');
    return t;
  }

  function maxLevel(key) { return table(key).levels.length - 1; }
  function level(save, key) {
    table(key);
    var n = save && save[SLOT[key]] ? save[SLOT[key]][key] : 0;
    return Math.max(0, Math.min(maxLevel(key), n | 0));
  }
  function stat(save, key) { return table(key).levels[level(save, key)].value; }
  function nextCost(save, key) {
    var i = level(save, key) + 1;
    return i > maxLevel(key) ? null : table(key).levels[i].cost;
  }

  // Mua trả về sổ mới; sổ đưa vào giữ nguyên.
  function buy(save, key) {
    var cost = nextCost(save, key);
    if (cost === null) return { ok: false, reason: 'đã tối đa' };
    if (save.gold < cost) return { ok: false, reason: 'thiếu tiền' };
    var s = clone(save);
    s[SLOT[key]][key] = level(save, key) + 1;
    s.gold -= cost;
    return { ok: true, save: s, cost: cost };
  }

  function gun(id) {
    if (!GUNS[id]) throw new Error('không có súng "' + id + '"');
    return GUNS[id];
  }
  function buyGun(save, id) {
    var g = gun(id);
    if (save.guns.owned.indexOf(id) >= 0) return { ok: false, reason: 'đã có' };
    if (save.gold < g.cost) return { ok: false, reason: 'thiếu tiền' };
    var s = clone(save);
    s.guns.owned.push(id);
    s.gold -= g.cost;
    if (!s.guns.equipped) s.guns.equipped = id;
    return { ok: true, save: s, cost: g.cost };
  }
  function equipGun(save, id) {
    if (id !== null) {
      gun(id);
      if (save.guns.owned.indexOf(id) < 0) return { ok: false, reason: 'chưa mua' };
    }
    var s = clone(save);
    s.guns.equipped = id;
    return { ok: true, save: s };
  }

  // ---------- món ăn ----------
  // Tệp bóc từ bản gốc (data/bar_assets.js) có thể có món riêng cho từng loài, khoá theo tid hoặc id.
  function dishAsset(sp) {
    var A = root.HX_BAR_ASSETS, d = A && A.dishes && (A.dishes[sp.tid] || A.dishes[sp.id]);
    return d && typeof d === 'object' ? d : null;
  }
  function round5(n) { return Math.round(n / 5) * 5; }
  // [ĐỀ XUẤT] giá theo hạng và cỡ: cá hề (hạng 1, 15 cm) 50 vàng, cá mú chấm (2, 60 cm) 95, cá khế vây vàng (4, 150 cm) 190.
  function dishOf(sp, fishName) {
    var d = dishAsset(sp), rank = Math.max(1, sp.rank | 0);
    return {
      name: d && typeof d.name === 'string' && d.name ? d.name : 'Sushi ' + (fishName || sp.name.replace(/_/g, ' ')).toLowerCase(),
      price: d && isFinite(d.price) && d.price > 0 ? +d.price : round5(20 + 20 * rank + 0.6 * (sp.cm || 0)),
      img: d && typeof d.img === 'string' ? d.img : null,
    };
  }
  // [ĐỀ XUẤT] cá to thì làm được nhiều suất: mỗi 40 cm thêm một suất, tối đa 6.
  function servingsOf(sp) { return Math.max(1, Math.min(6, 1 + Math.floor((sp.cm || 0) / 40))); }

  root.HX_META = {
    GEAR: GEAR, BAR: BAR, GUNS: GUNS, SUIT_OVER_MUL: SUIT_OVER_MUL,
    defaults: defaults, table: table, slot: function (key) { table(key); return SLOT[key]; },
    maxLevel: maxLevel, level: level, stat: stat, nextCost: nextCost, buy: buy,
    buyGun: buyGun, equipGun: equipGun, dishOf: dishOf, servingsOf: servingsOf,
  };
})(typeof window !== 'undefined' ? window : globalThis);
