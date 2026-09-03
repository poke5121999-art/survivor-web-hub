/*
 * SlimeClash — roster và bảng tra.
 *
 * TÊN VÀ ID HERO LÀ SỐ THẬT, rút từ APK Slime Legion 4.5.0 (GiftTriggerConfig,
 * cột trigger_value = id, cột des = tên). Xem _research/slime-legion-apk-datamine.md mục 9.
 *
 * CHỈ SỐ THÌ KHÔNG PHẢI SỐ THẬT. Bảng chỉ số gốc nằm trong config/table.bytes bị mã hoá
 * XXTEA và chưa giải được (mục 8 của tài liệu đó). Nên chỉ số ở đây được DỰNG theo thang
 * 38 unit của Clash of Heroes — thang đã cross-check 2 nguồn độc lập
 * (_research/clash-of-heroes-units.md mục 5.2):
 *     core      HP 1-2 -> 2-3      power 3-6  -> 8-11
 *     elite     HP 2-4 -> 4-6      power 9-20 -> 21-32
 *     champion  HP 9-18 -> 20-29   power 45-70-> 90-115
 * Ai đọc file này: ĐỪNG tưởng các con số dưới đây là của Slime Legion.
 *
 * BẬC HIẾM thì suy từ APK: game phân tầng hero bằng độ dài chuỗi gói + cooldown
 * (chuỗi 4/CD240 = thường, chuỗi 6/CD240 = hiếm, chuỗi 3/CD720 = cao cấp).
 * Đó là ĐỘ HIẾM THƯƠNG MẠI, không phải sức mạnh gameplay — tier list cộng đồng
 * KHÔNG xác nhận hai thứ này trùng nhau (_research/wiki-gacha-packs.md).
 */
(function (root) {
  'use strict';

  var COMMON = [ // [APK] trigger_type 6 — chuỗi 4 gói, CD 240 phút
    [103, 'IronBull'], [107, 'ThunderRobot'], [108, 'WarriorBull'], [109, 'Enchantress'],
    [112, 'Totem'], [113, 'Joker'], [114, 'Engineer'], [115, 'Succubus'],
    [118, 'Naga'], [119, 'Siren'], [124, 'Cactus'], [125, 'StoneMan'],
    [130, 'Monkey'], [133, 'Fattie'], [151, 'Oliver']
  ];
  var RARE = [ // [APK] trigger_type 4+7 — chuỗi 6 gói, CD 240 phút
    [110, 'Vampire'], [111, 'Lord'], [116, 'Witch'], [120, 'Nova'], [121, 'NightElf'],
    [126, 'Zombie'], [127, 'Chomper'], [128, 'Titanum'], [129, 'Spikeweed'],
    [131, 'Undine'], [132, 'Ghost'], [135, 'Yuffie'], [136, 'Hades'],
    [137, 'WaterDragon'], [138, 'RockDragon'], [139, 'Luby'], [141, 'Venom'],
    [142, 'RockBull'], [143, 'PinkBeer'], [144, 'Amy'], [145, 'Spider'],
    [146, 'GhostMonkey'], [147, 'Bella'], [148, 'WhiteOni'], [149, 'Judge'],
    [150, 'Nobody'], [155, 'Pilot'], [156, 'Guardian'], [157, 'Laplace'],
    [158, 'Finer'], [159, 'DarkKnight'], [183, 'Giant Rock Tortoise'], [185, 'Unicorn']
  ];
  var EPIC = [ // [APK] trigger_type 4 chuỗi 3 gói, CD 720 phút
    [117, 'Medusa'], [152, 'Mina'], [153, 'Prophet'], [154, 'Silanui'],
    [160, 'Nox'], [161, 'Hemera'], [162, 'Panda'], [163, 'Medea'],
    [164, 'Navier'], [165, 'Drogon'], [166, 'ElynSea']
  ];
  // [APK] DefaultHeroIds = 101|102|104|106 — 4 hero người chơi có sẵn.
  var STARTER = [[101, 'Slime'], [102, 'Egg Thrower'], [104, 'Frost'], [106, 'Goblin']];

  var COLORS = ['red', 'green', 'blue'];
  var COLOR_VI = { red: 'Đỏ', green: 'Lục', blue: 'Lam' };

  // Chỉ số theo lớp, cấp 1 -> cấp 5, nội suy tuyến tính. Thang [CoH].
  var CLASS_STATS = {
    core:     { hp: [1, 3],  power: [5, 10],  charge: 2, need: 2 },
    elite:    { hp: [3, 5],  power: [14, 26], charge: 3, need: 2 },
    champion: { hp: [12, 22], power: [55, 100], charge: 4, need: 4 }
  };

  // Biến thiên nhẹ theo id để mỗi hero khác nhau chút, nhưng tất định (cùng id ra cùng số).
  function jitter(id, spread) {
    var h = (id * 2654435761) % 1000 / 1000;   // hash tất định
    return 1 + (h - 0.5) * 2 * spread;
  }

  function build(list, rarity, klass) {
    return list.map(function (e, i) {
      var id = e[0], name = e[1];
      var s = CLASS_STATS[klass];
      var f = jitter(id, 0.15);
      return {
        id: id,
        name: name,
        rarity: rarity,                 // 'starter' | 'common' | 'rare' | 'epic'
        klass: klass,                   // 'core' | 'elite' | 'champion'
        color: COLORS[(id + i) % COLORS.length],
        hp1: Math.max(1, Math.round(s.hp[0] * f)),
        hp5: Math.max(2, Math.round(s.hp[1] * f)),
        pw1: Math.max(1, Math.round(s.power[0] * f)),
        pw5: Math.max(2, Math.round(s.power[1] * f)),
        charge: s.charge,
        need: s.need                    // số core cần xếp phía sau (elite 2, champion 4)
      };
    });
  }

  var HEROES = []
    .concat(build(STARTER, 'starter', 'core'))
    .concat(build(COMMON, 'common', 'core'))
    .concat(build(RARE, 'rare', 'elite'))
    .concat(build(EPIC, 'epic', 'champion'));

  var BY_ID = {};
  HEROES.forEach(function (h) { BY_ID[h.id] = h; });

  function statAt(h, level) {
    var t = (Math.max(1, Math.min(5, level)) - 1) / 4;
    return {
      hp: Math.round(h.hp1 + (h.hp5 - h.hp1) * t),
      power: Math.round(h.pw1 + (h.pw5 - h.pw1) * t)
    };
  }

  // Kỹ năng nhặt trong trận. Tên khoá khớp bảng trọng số trong CFG.skillBox.
  var SKILLS = {
    atk:     { name: 'Cường Kích', desc: '+25% sát thương mọi đội hình lượt này', icon: '⚔' },
    charge:  { name: 'Thúc Trận', desc: 'Giảm 1 lượt nạp cho mọi đội hình', icon: '⏩' },
    wall:    { name: 'Thành Luỹ', desc: 'Tường của bạn +100% máu', icon: '🧱' },
    pierce:  { name: 'Xuyên Phá', desc: 'Đòn kế bỏ qua tường địch', icon: '🏹' },
    heal:    { name: 'Hồi Phục', desc: 'Hồi 15% máu tối đa', icon: '💚' },
    grade:   { name: 'Thăng Cấp', desc: 'Một đội hình ngẫu nhiên +1 cấp', icon: '⭐' },
    jackpot: { name: 'Đại Cát', desc: 'Sát thương x2 cho đòn kế tiếp', icon: '🎰' }
  };

  root.DATA = {
    HEROES: HEROES, BY_ID: BY_ID, SKILLS: SKILLS,
    COLORS: COLORS, COLOR_VI: COLOR_VI,
    statAt: statAt,
    starterIds: STARTER.map(function (e) { return e[0]; })
  };
  if (typeof module === 'object' && module.exports) module.exports = root.DATA;
})(typeof window !== 'undefined' ? window : globalThis);
