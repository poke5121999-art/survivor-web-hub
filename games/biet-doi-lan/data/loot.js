// Bảng đồ cổ bỏ hoang dưới biển (hệ đồ cổ + móc dây). Ảnh là sprite DtD đã bóc ở art/dtd/loot (tools/dtd-sprite-index.md).
// Cỡ, khối lượng, giá theo bảng SIZES của REPO (games/repo2d/game.js:1482): nhỏ 8 kg 400–1100, vừa 24 kg 1400–3200, to 58 kg 4200–9000.
// Xác thuyền đắm nặng và đắt hơn món "to" [ĐỀ XUẤT]: dây móc với sức kéo gốc không chịu nổi nếu bơi vội.
// len = cạnh dài thân vật lý (m): nhỏ ≈ 0,4, vừa ≈ 0,8, to ≈ 1,4, xác thuyền 2–3; quyết định vòng va chạm, lọt hang.
// draw = cạnh dài của ảnh khi vẽ: 1,5 / 1,75 / 2 lần thân Dave cho nhỏ / vừa / to (chủ dự án, 2026-10-02: đồ cổ quá bé, khó thấy).
window.BDL = window.BDL || {};
(function (BDL) {
  'use strict';

  // REPO đo va đập bằng px/s trên ô 24 px; người chơi REPO đi bộ 92 px/s, Dave bơi thường 2,1 m/s (HX_TUNING.diver.maxSpeed).
  // Quy đổi theo tốc độ đi so với tốc độ bơi: 1 m/s ≈ 92 / 2,1 ≈ 43,8 px/s REPO. Ngưỡng dưới đây là px/s gốc chia cho số này.
  var PX_PER_M = 92 / 2.1;
  BDL.LOOT_PX_PER_M = PX_PER_M;

  // Chất liệu (REPO MATERIALS game.js:1460): thresh = ngưỡng va đập, frag = độ giòn, shatter = mòn tới 12% giá gốc thì vỡ hẳn.
  // gốm 95/1,0 vỡ, gỗ 155/0,5, kim loại 260/0,18 là số REPO; đá 200/0,3 và ngọc 120/0,6 vỡ [ĐỀ XUẤT].
  BDL.LOOT_MATS = {
    gom: { name: 'gốm', thresh: 95 / PX_PER_M, frag: 1.0, shatter: true },
    go: { name: 'gỗ', thresh: 155 / PX_PER_M, frag: 0.5, shatter: false },
    kim: { name: 'kim loại', thresh: 260 / PX_PER_M, frag: 0.18, shatter: false },
    da: { name: 'đá', thresh: 200 / PX_PER_M, frag: 0.3, shatter: false },
    ngoc: { name: 'ngọc', thresh: 120 / PX_PER_M, frag: 0.6, shatter: true },
  };

  var S = [
    { mass: 8, vmin: 400, vmax: 1100, len: 0.4 },
    { mass: 24, vmin: 1400, vmax: 3200, len: 0.8 },
    { mass: 58, vmin: 4200, vmax: 9000, len: 1.4 },
  ];
  BDL.LOOT_SIZES = S;

  // Thân Dave khi bơi ngang dài 62 px × 0,02 m = 1,24 m (ô MoveSide của ho-xanh/art/dave/dave.png, ppu 100 × scale 2); đứng cao 1,06 m.
  var BODY = 1.2, DRAW_MUL = [1.5, 1.75, 2];
  BDL.LOOT_BODY = BODY;

  // Cỡ ảnh gốc (px) để dựng tấm vẽ và vòng va chạm trước khi ảnh nạp xong.
  var PX = {
    extrasmall_gold: [44, 44], Small_gold_Thumbnail: [54, 64], Item_Pearl: [28, 28], Materials_Amethyst: [24, 24],
    Materials_Aquamarine: [24, 24], Materials_Diamond: [24, 24], Materials_Ruby: [24, 24], Materials_Topaz: [24, 24],
    Materials_Opal: [24, 24], Materials_Copper: [24, 24], Materials_Iron: [24, 24], Materials_Ttorbernite: [24, 24],
    Item_Flask: [23, 31], Item_ScrapIronPlate: [29, 27], Item_Bone: [58, 46], Item_Mike: [64, 64], Drone_Chip: [60, 44],
    Drone_Lens: [46, 50], Drone_Motor: [46, 50], Item_GoldCup: [58, 59], Item_GoldFishStatue: [64, 64],
    Item_JadeFishStatue: [68, 72], Item_StoneArtifacts: [64, 64], Item_StonePlate_WeddingSong: [64, 64],
    Item_Glacial_Passage_Key: [64, 64], Item_Unidentified_ExtraTime: [64, 61], Item_Unidentified_ShortDash: [64, 64],
    Item_Unidentified_LongDash: [60, 64], Item_Unidentified_WeaponDMG_UP: [73, 78], SeaPeaple_Rebreather_Thumnail: [58, 57],
    Item_Skull: [64, 56], Item_MermanCuju: [64, 62], Item_Maki_Tablet: [78, 66], Item_Pinkbox_Thumbnail: [62, 50],
    Crates03: [58, 22], Crates05: [77, 14], Bacon_Relic: [36, 44], Crates01: [60, 91], Crates02: [59, 44], Crates04: [105, 23],
    Wreck_Boat01: [312, 110], Wreck_Boat02: [164, 103], Wreck_Boat03: [151, 36],
  };

  function row(key, name, file, size, mat, extra) {
    var s = S[size], r = { key: key, name: name, sprite: 'art/dtd/loot/' + file + '.png', size: size, mat: mat,
      vmin: s.vmin, vmax: s.vmax, mass: s.mass, len: s.len, px: PX[file] };
    for (var k in extra) r[k] = extra[k];
    r.draw = Math.max(r.len, BODY * DRAW_MUL[size]);
    return r;
  }

  BDL.LOOT = [
    // ---- nhỏ ----
    row('coin', 'Đồng xu vàng', 'extrasmall_gold', 0, 'kim', { len: 0.32 }),
    row('goldbar', 'Thỏi vàng nhỏ', 'Small_gold_Thumbnail', 0, 'kim'),
    row('pearl', 'Ngọc trai', 'Item_Pearl', 0, 'ngoc', { len: 0.3 }),
    row('amethyst', 'Thạch anh tím', 'Materials_Amethyst', 0, 'ngoc', { len: 0.34 }),
    row('aquamarine', 'Ngọc xanh biển', 'Materials_Aquamarine', 0, 'ngoc', { len: 0.34 }),
    row('diamond', 'Kim cương thô', 'Materials_Diamond', 0, 'ngoc', { len: 0.34 }),
    row('ruby', 'Hồng ngọc', 'Materials_Ruby', 0, 'ngoc', { len: 0.34 }),
    row('topaz', 'Hoàng ngọc', 'Materials_Topaz', 0, 'ngoc', { len: 0.34 }),
    row('opal', 'Đá opal', 'Materials_Opal', 0, 'ngoc', { len: 0.34 }),
    row('copper', 'Quặng đồng', 'Materials_Copper', 0, 'kim', { len: 0.34 }),
    row('iron', 'Quặng sắt', 'Materials_Iron', 0, 'kim', { len: 0.34 }),
    row('torbernite', 'Quặng torbernit', 'Materials_Ttorbernite', 0, 'da', { len: 0.34 }),
    row('flask', 'Lọ thuỷ tinh', 'Item_Flask', 0, 'gom'),
    row('scrap', 'Tấm sắt vụn', 'Item_ScrapIronPlate', 0, 'kim'),
    row('bone', 'Xương ống', 'Item_Bone', 0, 'gom', { len: 0.45 }),
    row('mic', 'Micrô bộ đàm', 'Item_Mike', 0, 'kim', { len: 0.45 }),
    row('chip', 'Chip máy tính', 'Drone_Chip', 0, 'kim', { len: 0.45 }),
    row('lens', 'Ống kính máy quay', 'Drone_Lens', 0, 'gom'),
    row('motor', 'Mô-tơ', 'Drone_Motor', 0, 'kim'),
    // ---- vừa ----
    row('goldcup', 'Chén vàng', 'Item_GoldCup', 1, 'kim', { len: 0.7 }),
    row('goldfish', 'Tượng cá vàng', 'Item_GoldFishStatue', 1, 'kim'),
    row('jadefish', 'Tượng cá ngọc bích', 'Item_JadeFishStatue', 1, 'gom'),
    row('slab', 'Phiến đá Người Biển', 'Item_StoneArtifacts', 1, 'da'),
    row('weddingslab', 'Phiến đá Khúc Hôn Lễ', 'Item_StonePlate_WeddingSong', 1, 'da'),
    row('icekey', 'Chìa khoá Lối Băng', 'Item_Glacial_Passage_Key', 1, 'da'),
    row('relic', 'Cổ vật Người Biển', 'Item_Unidentified_ExtraTime', 1, 'da'),
    row('bracelet', 'Vòng tay bạch tuộc gỉ', 'Item_Unidentified_ShortDash', 1, 'kim'),
    row('necklace', 'Dây chuyền cá heo gỉ', 'Item_Unidentified_LongDash', 1, 'kim'),
    row('charm', 'Bùa vũ khí gỉ', 'Item_Unidentified_WeaponDMG_UP', 1, 'kim'),
    row('rebreather', 'Bình thở Người Biển', 'SeaPeaple_Rebreather_Thumnail', 1, 'kim'),
    row('skull', 'Hộp sọ', 'Item_Skull', 1, 'gom'),
    row('cuju', 'Quả cầu Người Cá', 'Item_MermanCuju', 1, 'go', { len: 0.7 }),
    row('tablet', 'Khung ảnh Maki', 'Item_Maki_Tablet', 1, 'gom'),
    row('pinkbox', 'Hộp giao hàng hồng', 'Item_Pinkbox_Thumbnail', 1, 'go'),
    row('plank', 'Thùng gỗ dẹt', 'Crates03', 1, 'go', { len: 0.9 }),
    row('decking', 'Mảnh boong tàu', 'Crates05', 1, 'go', { len: 1.1 }),
    // ---- to ----
    row('statue', 'Tượng Người Biển', 'Bacon_Relic', 2, 'da', { len: 1.3 }),
    row('cratestack', 'Chồng thùng gỗ', 'Crates01', 2, 'go', { len: 1.5 }),
    row('crates', 'Thùng gỗ đôi', 'Crates02', 2, 'go'),
    row('cargo', 'Kiện hàng dài', 'Crates04', 2, 'go', { len: 1.8 }),
    // ---- xác thuyền: món to đặc biệt, chỉ ở các tầng sâu ----
    row('wreck', 'Xác thuyền lớn', 'Wreck_Boat01', 2, 'go', { len: 3.0, mass: 200, vmin: 11000, vmax: 16000, wreck: true }),
    row('bow', 'Mũi thuyền đắm', 'Wreck_Boat02', 2, 'go', { len: 2.0, mass: 150, vmin: 9000, vmax: 13000, wreck: true }),
    row('hull', 'Mạn thuyền đắm', 'Wreck_Boat03', 2, 'go', { len: 2.2, mass: 130, vmin: 8500, vmax: 12000, wreck: true }),
  ];
  BDL.LOOT_BY_KEY = {};
  BDL.LOOT.forEach(function (r) { BDL.LOOT_BY_KEY[r.key] = r; });

  // Trần đồ cổ mỗi lượt lặn = lootCap(cấp) của REPO (game.js:214): tổng giá 46k→150k, số món 14→50, món to 2→12, vừa 5→22 từ cấp 1→20.
  BDL.lootCap = function (lv) {
    var k = Math.max(0, Math.min(1, (lv - 1) / 19));
    var mix = function (a, b) { return Math.round(a + (b - a) * k); };
    return { value: mix(46000, 150000), count: Math.min(50, mix(14, 50)), big: mix(2, 12), med: mix(5, 22) };
  };
})(window.BDL);
