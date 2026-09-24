// Bảng nâng cấp một ngày trọn vòng: trang bị lặn, súng phụ, quán sushi, giá món. Chỉ dữ liệu và hàm thuần, không đụng DOM.
// Trang bị lặn và súng phụ lấy số [DtD] từ data/gear_sheet.js (bóc từ bản gốc, xem tools/README-boat.md); phải nạp tệp ấy trước.
// [DtD] = số bản gốc; [ĐỀ XUẤT] = tự chọn.
(function (root) {
  'use strict';

  var SHEET = root.HX_GEAR_SHEET;
  if (!SHEET || !SHEET.gear || !SHEET.guns) throw new Error('HX_GEAR_SHEET not loaded: data/gear_sheet.js must come before data/meta.js');
  var BOAT = root.HX_BOAT_ASSETS || null;

  function lv(pairs) { return pairs.map(function (p) { return { cost: p[0], value: p[1] }; }); }

  // Một hàng SubEquipment gốc → một cấp. Giá gốc là [vàng, b]; b chưa rõ là gì nên chỉ lấy vàng.
  // Hàng không nâng số (đồ lặn lv7: bộ đồ mới 540 m bằng lv6) thì bỏ, để mỗi lần mua đều mạnh hơn.
  function fromSheet(rows, field) {
    var out = [];
    rows.forEach(function (r) {
      var v = +r[field];
      if (!isFinite(v)) throw new Error('gear sheet row ' + r.tid + ' has no ' + field);
      if (out.length && v <= out[out.length - 1].value) return;
      out.push({ cost: out.length ? +r.price[0] : 0, value: v });
    });
    return out;
  }
  function icon(key) { return BOAT && BOAT.gearIcons && BOAT.gearIcons[key] || null; }

  // Cấp 0 = hàng lv1 của bản gốc (đồ khởi đầu của Dave, giá 0).
  var S = SHEET.gear;
  var GEAR = {
    o2: { name: 'Bình dưỡng khí', desc: 'Dưỡng khí tối đa mỗi lượt lặn', unit: 'O₂', icon: icon('o2'),
      levels: fromSheet(S.o2, 'maxO2') },                  // [DtD] 90 → 530, 11 cấp
    cargo: { name: 'Túi đựng cá', desc: 'Số cá mang theo được; túi đầy thì cá xiên được cũng phải thả', unit: 'con', icon: icon('cargo'),
      levels: fromSheet(S.cargo, 'weight') },              // [DtD] số của bảng là kg (9 → 185); game đếm theo con vì cá chưa có cân nặng gốc
    suit: { name: 'Đồ lặn', desc: 'Độ sâu an toàn; xuống quá mức này dưỡng khí tụt ×2,5', unit: 'm', icon: icon('suit'),
      levels: fromSheet(S.suit, 'maxDepth') },             // [DtD] 40 → 800 m; cấp 1 (80 m) bản gốc tặng theo cốt truyện nên giá 0
    knife: { name: 'Dao', desc: 'Sát thương mỗi nhát dao', unit: 'st', icon: icon('knife'),
      levels: fromSheet(S.knife, 'damage') },              // [DtD] 3 → 17
    harpoon: { name: 'Súng xiên', desc: 'Sát thương mỗi phát xiên', unit: 'st', icon: icon('harpoon'),
      levels: fromSheet(S.harpoon, 'damage') },            // [DtD] 3 → 40
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

  // ---------- súng phụ ----------
  // Số lấy từ GunSpecData_Normal_<Tên>_Lv1..5 [DtD]. Bảng gốc không có giá nâng cấp súng (nâng ở chỗ Duff bằng nguyên liệu),
  // nên chỉ mua một lần với giá chế tạo `craftPrice`, và mọi súng bắn ở Lv1. `levels` giữ đủ 5 cấp để dùng về sau.
  // mode: bullet = một viên thẳng; spread = nhiều viên toả; pierce = đạn xuyên; sleep = đạn ngủ; net = lưới bắt sống; grenade = đạn cầu vồng nổ.
  var PLAY = {
    speedPerPower: 0.02,    // [ĐỀ XUẤT] vận tốc đạn = Power × 0,02 s (AddForce một lần, khối lượng 1, bước vật lý mặc định của Unity)
    sleepTime: 5,           // [ĐỀ XUẤT] giây cá ngủ ở Lv1, +1 giây mỗi cấp; thời lượng buff 14080403..07 không có trong bảng dữ liệu
    netRadius: 1.0,         // [ĐỀ XUẤT] bán kính lưới bung ra (m); lưới gốc là vải vật lý Obi, không xuất được
    grenadeGravity: 4,      // [ĐỀ XUẤT] m/s² kéo đạn lựu xuống thành đường cầu vồng
    fuse: 2.5,              // [ĐỀ XUẤT] đạn lựu bay quá lâu mà chưa chạm gì thì tự nổ (giây)
  };
  var GUN_TEXT = {
    rifle: { name: 'Súng trường nước', desc: 'Một viên thẳng, sát thương khá' },
    shotgun: { name: 'Súng hoa cải', desc: 'Ba viên toả rộng, tầm gần' },
    sniper: { name: 'Súng bắn tỉa', desc: 'Đạn xuyên qua mọi con trên đường bay, tầm rất xa' },
    sleep: { name: 'Súng gây mê', desc: 'Cá trúng đạn ngủ, đứng yên một lúc' },
    net: { name: 'Súng lưới', desc: 'Lưới bung ra bắt sống cả đàn cá nhỏ vào túi' },
    grenade: { name: 'Súng phóng lựu', desc: 'Đạn bay cầu vồng, nổ trúng mọi con quanh đó' },
  };
  var GUN_MODE = { rifle: 'bullet', shotgun: 'spread', sniper: 'pierce', sleep: 'sleep', net: 'net', grenade: 'grenade' };

  function gunLevel(id, r) {
    var mode = GUN_MODE[id];
    var spread = mode === 'spread' ? r.maxAimAngle - r.minAimAngle : 0;   // [ĐỀ XUẤT] 3 nòng chia đều góc Min/MaxAimAngle (±20°)
    return {
      dmg: mode === 'grenade' ? r.explosionSplashDamage : r.damage,     // [DtD] lựu: sát thương nằm ở ExplosionSplashDamage
      ammo: r.ammoCount, range: r.distance,
      speed: r.power * PLAY.speedPerPower,
      pellets: r.muzzleCount, spreadDeg: spread,
      pierce: mode === 'pierce',
      blast: r.exposionRadius,
      netSize: mode === 'net' ? r.captrueSize : 0, netCount: mode === 'net' ? r.captureCount : 0,
      sleep: mode === 'sleep' ? PLAY.sleepTime + (r.lv - 1) : 0,
      recoil: r.recoilForce, cooldown: r.recoilTime,                    // [DtD] giật lùi (m/s) và thời gian giật, dùng làm nhịp bắn
      arc: r.gunAimType === 1,
    };
  }

  var GUNS = {};
  Object.keys(GUN_MODE).forEach(function (id) {
    var src = SHEET.guns[id];
    if (!src || !Array.isArray(src.levels) || !src.levels.length) throw new Error('gear sheet has no gun "' + id + '"');
    var art = BOAT && BOAT.guns && BOAT.guns[id];
    var levels = src.levels.map(function (r) { return gunLevel(id, r); });
    var g = {
      id: id, name: GUN_TEXT[id].name, desc: GUN_TEXT[id].desc, mode: GUN_MODE[id],
      cost: +src.craftPrice, sell: +src.sellPrice,
      icon: art ? art.icon : null, thumb: art ? art.thumb : null,
      levels: levels,
    };
    // cấp đang bắn (Lv1) chép lên mặt ngoài cho màn chuẩn bị
    ['dmg', 'pellets', 'spreadDeg', 'speed', 'range', 'ammo', 'cooldown'].forEach(function (f) { g[f] = levels[0][f]; });
    GUNS[id] = g;
  });

  var SUIT_OVER_MUL = 2.5;   // [ĐỀ XUẤT] quá độ sâu an toàn của đồ lặn thì dưỡng khí tụt nhanh gấp chừng này

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
  // Số bắn của một khẩu ở cấp lv (1..5, mặc định 1).
  function gunStat(id, lv) {
    var L = gun(id).levels;
    return L[Math.max(0, Math.min(L.length - 1, (lv || 1) - 1))];
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

  // Trang bị của một lượt lặn, đọc một lần lúc dựng lượt: số của từng món, cộng súng đang chọn (hoặc null).
  function loadout(save) {
    var L = {};
    Object.keys(GEAR).forEach(function (k) { L[k] = stat(save, k); });
    var id = save && save.guns && save.guns.equipped;
    L.gun = id && GUNS[id] ? Object.assign({ id: id, lv: 1, mode: GUNS[id].mode }, gunStat(id, 1)) : null;
    return L;
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
    GEAR: GEAR, BAR: BAR, GUNS: GUNS, GUN_PLAY: PLAY, SUIT_OVER_MUL: SUIT_OVER_MUL,
    defaults: defaults, table: table, slot: function (key) { table(key); return SLOT[key]; },
    maxLevel: maxLevel, level: level, stat: stat, nextCost: nextCost, buy: buy,
    gunStat: gunStat, buyGun: buyGun, equipGun: equipGun, loadout: loadout, dishOf: dishOf, servingsOf: servingsOf,
  };
})(typeof window !== 'undefined' ? window : globalThis);
