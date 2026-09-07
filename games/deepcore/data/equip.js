/*
 * data/equip.js — sáu ô trang bị.
 *
 * Ba ô GIÁP (mũ / áo / quần) đổi luôn HÌNH NHÂN VẬT: mỗi bộ giáp là một lớp vẽ
 * trong bộ art Core Keeper, cùng khổ 234x156, cùng 39 khung với thân người. Đội
 * mũ vào là thấy cái mũ — không phải hiệu ứng, mà là thật, vì paperdoll gốc làm
 * đúng như vậy. Màn hình trang bị phải phô ra được điều đó.
 *
 * Ba ô CÔNG CỤ:
 *   cuốc  sức đào + tốc đào. Không có bậc chặn: cuốc nào cũng đục được mọi
 *         loại đá, cuốc xịn chỉ đục nhanh hơn.
 *   đèn   bán kính nhìn. Trong hang tối, tầm nhìn LÀ sức mạnh.
 *   nhẫn  linh tinh: máu, giáp, tốc chạy, sức linh thú.
 */
(function (G) {
  'use strict';

  var SLOTS = [
    { id: 'helm',  name: 'Mũ',   icon: 454 },
    { id: 'chest', name: 'Áo',   icon: 455 },
    { id: 'pants', name: 'Quần', icon: 458 },
    { id: 'pick',  name: 'Cuốc', icon: 577 },
    { id: 'lamp',  name: 'Đèn',  icon: 547 },
    { id: 'ring',  name: 'Nhẫn', icon: 581 }
  ];

  var RARE = [
    { k: 1, name: 'Thường', col: '#8a9a85' },
    { k: 2, name: 'Tốt',    col: '#5a8ad0' },
    { k: 3, name: 'Hiếm',   col: '#a86ee0' },
    { k: 4, name: 'Sử Thi', col: '#e0a03c' },
    { k: 5, name: 'Huyền',  col: '#e05a5a' }
  ];

  /* Các BỘ GIÁP — thứ tự đây cũng là thứ tự mạnh dần. Mỗi tên khớp một bộ lớp
   * có thật trong atlas ('pc.helm.<id>', 'pc.chest.<id>', 'pc.pants.<id>'). */
  var SETS = [
    { id: 'wood',      name: 'Gỗ',          rare: 1 },
    { id: 'copper',    name: 'Đồng',        rare: 1 },
    { id: 'miner',     name: 'Thợ Mỏ',      rare: 2 },
    { id: 'iron',      name: 'Sắt',         rare: 2 },
    { id: 'ranger',    name: 'Kiểm Lâm',    rare: 2 },
    { id: 'scarab',    name: 'Bọ Hung',     rare: 2 },
    { id: 'mold',      name: 'Nấm Mốc',     rare: 3 },
    { id: 'scarlet',   name: 'Chu Sa',      rare: 3 },
    { id: 'ninja',     name: 'Ẩn Sĩ',       rare: 3 },
    { id: 'sorcerer',  name: 'Thuật Sĩ',    rare: 3 },
    { id: 'chieftain', name: 'Tù Trưởng',   rare: 3 },
    { id: 'hivebone',  name: 'Xương Tổ',    rare: 3 },
    { id: 'octarine',  name: 'Bát Sắc',     rare: 4 },
    { id: 'golem',     name: 'Gộc Đá',      rare: 4 },
    { id: 'lava',      name: 'Nham Thạch',  rare: 4 },
    { id: 'guardian',  name: 'Hộ Vệ',       rare: 4 },
    { id: 'monk',      name: 'Tu Sĩ',       rare: 4 },
    { id: 'blast',     name: 'Phá Nổ',      rare: 4 },
    { id: 'tamer',     name: 'Thuần Thú',   rare: 4 },
    { id: 'galaxite',  name: 'Thiên Hà',    rare: 5 },
    { id: 'crystal',   name: 'Pha Lê',      rare: 5 },
    { id: 'grim',      name: 'U Minh',      rare: 5 },
    { id: 'warden',    name: 'Ngục Tốt',    rare: 5 },
    { id: 'hydra',     name: 'Xương Hydra', rare: 5 },
    { id: 'alien',     name: 'Dị Tộc',      rare: 5 },
    { id: 'commander', name: 'Chỉ Huy Lõi', rare: 5 },
    { id: 'godsent',   name: 'Thiên Tứ',    rare: 5 }
  ];

  /* Cuốc. KHÔNG CÒN "bậc cuốc" chặn cửa: mọi cây cuốc đục được mọi loại đá, cây
   * xịn chỉ đục nhanh hơn. Bậc cuốc là một cái cửa vô hình — người chơi đứng đục
   * mãi không vỡ mà chẳng ai nói cho biết vì sao, và cảm giác chỉ là "game này
   * đào chậm". `tier` giữ lại để hiển thị chứ không còn ảnh hưởng gì tới tốc độ. */
  var CUOC = [
    { id: 'p_wood',     name: 'Cuốc Gỗ',        rare: 1, tier: 0, power: 14, rate: 2.6, icon: 643 },
    { id: 'p_copper',   name: 'Cuốc Đồng',      rare: 1, tier: 1, power: 19, rate: 2.8, icon: 577 },
    { id: 'p_tin',      name: 'Cuốc Thiếc',     rare: 2, tier: 1, power: 25, rate: 3.0, icon: 577 },
    { id: 'p_iron',     name: 'Cuốc Sắt',       rare: 2, tier: 2, power: 33, rate: 3.2, icon: 577 },
    { id: 'p_scarlet',  name: 'Cuốc Chu Sa',    rare: 3, tier: 2, power: 44, rate: 3.4, icon: 577 },
    { id: 'p_octarine', name: 'Cuốc Bát Sắc',   rare: 4, tier: 3, power: 58, rate: 3.6, icon: 577 },
    { id: 'p_galaxite', name: 'Cuốc Thiên Hà',  rare: 4, tier: 3, power: 76, rate: 3.8, icon: 577 },
    { id: 'p_solarite', name: 'Cuốc Nhật Diệu', rare: 5, tier: 4, power: 98, rate: 4.0, icon: 577 }
  ];

  var DEN = [
    { id: 'l_torch',   name: 'Đuốc',           rare: 1, light: 88,  icon: 1000 },
    { id: 'l_lamp',    name: 'Đèn Bão',        rare: 2, light: 104, icon: 548 },
    { id: 'l_gold',    name: 'Đèn Đồng',       rare: 3, light: 122, icon: 547 },
    { id: 'l_crystal', name: 'Đèn Pha Lê',     rare: 4, light: 142, icon: 979 },
    { id: 'l_core',    name: 'Đèn Lõi',        rare: 5, light: 168, icon: 981 }
  ];

  var NHAN = [
    { id: 'r_iron',  name: 'Nhẫn Sắt',      rare: 1, st: { hp: 12 },               icon: 581 },
    { id: 'r_swift', name: 'Nhẫn Nhanh',    rare: 2, st: { speed: 0.06 },          icon: 581 },
    { id: 'r_stone', name: 'Nhẫn Đá',       rare: 2, st: { armor: 0.05 },          icon: 581 },
    { id: 'r_beast', name: 'Nhẫn Thú',      rare: 3, st: { petDmg: 0.10 },         icon: 580 },
    { id: 'r_deep',  name: 'Nhẫn Đáy Hang', rare: 4, st: { petDmg: 0.08, hp: 25 }, icon: 580 },
    { id: 'r_core',  name: 'Nhẫn Lõi',      rare: 5, st: { petDmg: 0.15, speed: 0.08, armor: 0.05 }, icon: 244 }
  ];

  /* Giáp: chỉ số suy ra từ bậc hiếm + cấp nâng, không lưu bảng riêng cho 81 món.
   * Ba mảnh khác nhau ở TỈ TRỌNG: mũ thiên về giáp, áo thiên về máu, quần thiên
   * về tốc chạy. */
  var PIECE_MIX = {
    helm:  { armor: 1.0, hp: 0.6, speed: 0.0 },
    chest: { armor: 0.7, hp: 1.4, speed: 0.0 },
    pants: { armor: 0.4, hp: 0.6, speed: 1.0 }
  };

  function armorStats(setDef, slot, lv) {
    var mix = PIECE_MIX[slot];
    var k = setDef.rare * (1 + (lv - 1) * 0.22);
    return {
      armor: +(mix.armor * 0.022 * k).toFixed(4),
      hp: Math.round(mix.hp * 9 * k),
      speed: +(mix.speed * 0.014 * k).toFixed(4)
    };
  }

  function toolStats(def, lv) {
    var k = 1 + (lv - 1) * 0.20;
    if (def.power !== undefined) {
      return { minePower: def.power * k, mineRate: def.rate * (1 + (lv - 1) * 0.06),
               pickTier: def.tier };
    }
    if (def.light !== undefined) return { light: def.light * (1 + (lv - 1) * 0.09) };
    var out = {};
    for (var s in def.st) out[s] = def.st[s] * k;
    return out;
  }

  /* Bảng tra mọi món theo id. Món giáp có id kiểu "<set>:<slot>". */
  var ALL = {};
  SETS.forEach(function (s) {
    ['helm', 'chest', 'pants'].forEach(function (slot) {
      var id = s.id + ':' + slot;
      ALL[id] = { id: id, slot: slot, set: s.id,
                  name: s.name + ' — ' + (slot === 'helm' ? 'Mũ' : slot === 'chest' ? 'Áo' : 'Quần'),
                  rare: s.rare, armorSet: true };
    });
  });
  CUOC.forEach(function (d) { d.slot = 'pick'; ALL[d.id] = d; });
  DEN.forEach(function (d) { d.slot = 'lamp'; ALL[d.id] = d; });
  NHAN.forEach(function (d) { d.slot = 'ring'; ALL[d.id] = d; });

  function statsOf(id, lv) {
    var d = ALL[id];
    if (!d) return {};
    if (d.armorSet) {
      var sd = SETS.filter(function (s) { return s.id === d.set; })[0];
      return armorStats(sd, d.slot, lv || 1);
    }
    return toolStats(d, lv || 1);
  }

  function iconOf(id) {
    var d = ALL[id];
    if (!d) return 0;
    if (d.armorSet) return d.slot === 'helm' ? 454 : d.slot === 'chest' ? 455 : 458;
    return d.icon;
  }

  G.EQ_SLOTS = SLOTS;
  G.EQ_RARE = RARE;
  G.EQ_SETS = SETS;
  G.EQ_ALL = ALL;
  G.eqStats = statsOf;
  G.eqIcon = iconOf;
})(window.DC = window.DC || {});
