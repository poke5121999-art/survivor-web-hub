/*
 * SlimeClash — bảng tra, dựng trên roster sinh tự động (js/roster.js).
 *
 * ROSTER LÀ SỐ THẬT: 96 hero, id 101-196, tên + slug + bậc icon đều đọc từ APK
 * Slime Legion 4.5.0. Xem header của roster.js để biết từng trường lấy ở đâu.
 *
 * CHỈ SỐ THÌ KHÔNG PHẢI SỐ THẬT. Bảng chỉ số gốc nằm trong config/table.bytes bị mã
 * hoá XXTEA, chưa giải được (_research/slime-legion-apk-datamine.md mục 8). Bốn agent
 * research cũng xác nhận HP/sát thương/tốc đánh của các hero này không tồn tại ở bất
 * kỳ nguồn công khai nào (_research/wiki-hero-stats.md).
 *
 * Nên chỉ số dưới đây dựng theo thang 38 unit của Clash of Heroes — thang đã cross-check
 * hai nguồn độc lập (_research/clash-of-heroes-units.md mục 5.2):
 *     core      HP 1-2 -> 2-3       power 3-6   -> 8-11
 *     elite     HP 2-4 -> 4-6       power 9-20  -> 21-32
 *     champion  HP 9-18 -> 20-29    power 45-70 -> 90-115
 * AI ĐỌC FILE NÀY: ĐỪNG tưởng các con số dưới đây là của Slime Legion.
 */
(function (root) {
  'use strict';

  var ROSTER = root.SLIME_ROSTER || require('./roster.js');

  var COLORS = ['red', 'green', 'blue'];
  var COLOR_VI = { red: 'Đỏ', green: 'Lục', blue: 'Lam' };
  var RARITY_VI = {
    starter: 'khởi đầu', common: 'thường', rare: 'hiếm', epic: 'cao cấp'
  };

  // Chỉ số theo lớp, cấp 1 -> cấp 5. Thang [CoH].
  var CLASS_STATS = {
    core:     { hp: [1, 3],   power: [5, 10],   charge: 2, need: 2 },
    elite:    { hp: [3, 5],   power: [14, 26],  charge: 3, need: 2 },
    champion: { hp: [12, 22], power: [55, 100], charge: 4, need: 4 }
  };

  // Biến thiên nhẹ theo id để mỗi hero khác nhau chút, nhưng TẤT ĐỊNH.
  function jitter(id, spread) {
    var h = (id * 2654435761) % 1000 / 1000;
    return 1 + (h - 0.5) * 2 * spread;
  }

  var HEROES = ROSTER.map(function (e) {
    var s = CLASS_STATS[e.klass] || CLASS_STATS.core;
    var f = jitter(e.id, 0.15);
    return {
      id: e.id,
      name: e.name,
      slug: e.slug,
      named: e.named !== false,     // false = tên suy từ slug, chưa xác nhận
      art: !!e.art,
      rarity: e.rarity,
      klass: e.klass,
      color: e.color,
      hp1: Math.max(1, Math.round(s.hp[0] * f)),
      hp5: Math.max(2, Math.round(s.hp[1] * f)),
      pw1: Math.max(1, Math.round(s.power[0] * f)),
      pw5: Math.max(2, Math.round(s.power[1] * f)),
      charge: s.charge,
      need: s.need
    };
  });

  var BY_ID = {};
  HEROES.forEach(function (h) { BY_ID[h.id] = h; });

  function statAt(h, level) {
    var t = (Math.max(1, Math.min(5, level)) - 1) / 4;
    return {
      hp: Math.round(h.hp1 + (h.hp5 - h.hp1) * t),
      power: Math.round(h.pw1 + (h.pw5 - h.pw1) * t)
    };
  }

  /* Kỹ năng nhặt trong trận. Khoá khớp bảng trọng số trong CFG.skillBox, và mô tả
   * phải khớp ĐÚNG việc Battle.useSkill làm — bản trước còn nói "tường", "đội hình",
   * "bỏ qua tường địch", đều là chữ của mô hình hai-sân đã bỏ. */
  var SKILLS = {
    atk:     { name: 'Cường Kích', desc: '+25% sát thương cho loạt bắn cuối lượt', icon: '⚔' },
    charge:  { name: 'Hoãn Đòn',  desc: 'Đẩy lùi đòn của quái thêm 3 bước', icon: '⏳' },
    wall:    { name: 'Thành Luỹ', desc: 'Hồi đầy máu cho mọi quân trên sân', icon: '🧱' },
    pierce:  { name: 'Xuyên Phá', desc: 'Bắn ngay một đòn bằng 50% lực sân', icon: '🏹' },
    heal:    { name: 'Hồi Phục', desc: 'Hồi 15% máu tối đa của bạn', icon: '💚' },
    grade:   { name: 'Thăng Cấp', desc: 'Một quân ngẫu nhiên +1 cấp', icon: '⭐' },
    jackpot: { name: 'Đại Cát', desc: 'Sát thương x2 cho loạt bắn cuối lượt', icon: '🎰' }
  };

  // [APK] DefaultHeroIds = 101|102|104|106
  var starterIds = ROSTER.filter(function (e) { return e.rarity === 'starter'; })
                         .map(function (e) { return e.id; });
  if (!starterIds.length) starterIds = [101, 102, 104, 106];

  root.DATA = {
    HEROES: HEROES, BY_ID: BY_ID, SKILLS: SKILLS,
    COLORS: COLORS, COLOR_VI: COLOR_VI, RARITY_VI: RARITY_VI,
    statAt: statAt, starterIds: starterIds
  };
  if (typeof module === 'object' && module.exports) module.exports = root.DATA;
})(typeof window !== 'undefined' ? window : globalThis);
