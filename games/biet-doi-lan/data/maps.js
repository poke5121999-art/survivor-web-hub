// Năm lượt lặn của một ca. Lộ trình đã kiểm bằng games/ho-xanh/tools/route-check.js (bơi từ mặt nước xuống được tới tầng cuối).
// floors = số phòng nhà REPO 1..5 (5/7/10/13/16). tiers = vùng cá được sinh (A nông, B giữa, C sâu).
window.BDL = window.BDL || {};
(function (BDL) {
  'use strict';
  var BAND = 13;   // một tầng = một khung camera (m thế giới)

  BDL.BAND = BAND;
  BDL.MAPS = [
    // 5 tầng = 65 m nhưng vùng A chỉ sâu 56,5 m: lộ trình phải thêm B để đủ độ sâu; cá thì chỉ sinh ở A (tiers).
    { id: 0, name: 'Rạn San Hô', theme: 'day', route: ['A01', 'B01'], tiers: 'A', floors: 5, level: 1, quotaMul: 1, lootMul: 1, hpMul: 1, dmgMul: 1 },
    { id: 1, name: 'Rừng Tảo', theme: 'kelp', route: ['A06', 'B03'], tiers: 'AB', floors: 7, level: 3, quotaMul: 1.15, lootMul: 1.1, hpMul: 1, dmgMul: 1 },
    { id: 2, name: 'Hoàng Hôn', theme: 'evening', route: ['A04', 'B06'], tiers: 'AB', floors: 10, level: 6, quotaMul: 1.35, lootMul: 1.2, hpMul: 1.15, dmgMul: 1.1 },
    { id: 3, name: 'Mưa Giông', theme: 'rain', route: ['A05', 'B02', 'C03'], tiers: 'ABC', floors: 13, level: 10, quotaMul: 1.6, lootMul: 1.35, hpMul: 1.3, dmgMul: 1.2 },
    // Chủ đề đêm gốc chỉ có A+B (không có C đêm): A03N→B04N đêm, rồi C03 ban ngày dùng ánh sáng đêm (dim, đèn đội đầu).
    { id: 4, name: 'Vực Đêm', theme: 'night', route: ['A03N', 'B04N', 'C03'], tiers: 'ABC', floors: 16, level: 15, quotaMul: 1.9, lootMul: 1.5, hpMul: 1.5, dmgMul: 1.35 },
  ];

  // Các tầng = dải 13 m kể từ mặt nước đi xuống. Chuỗi không đủ sâu cho số tầng thì ném lỗi (chọn lộ trình sâu hơn).
  BDL.floorsOf = function (stack, map) {
    var top = window.HX_TUNING.water.surfaceY, out = [];
    for (var i = 0; i < map.floors; i++) out.push({ i: i, y0: top - i * BAND, y1: top - (i + 1) * BAND });
    var last = out[out.length - 1];
    if (stack.minY > last.y1) throw new Error('lộ trình ' + map.route.join('+') + ' quá nông cho ' + map.floors + ' tầng (đáy y=' + stack.minY.toFixed(1) + ', cần ≤ ' + last.y1.toFixed(1) + ')');
    return out;
  };

  // Tầng chứa độ cao y (0-based); trên mặt nước tính tầng 0, dưới tầng cuối trả floors.length (vùng áp suất).
  // floors mặc định là BDL.floors (main.js đặt khi dựng lượt lặn).
  BDL.floorAt = function (y, floors) {
    floors = floors || BDL.floors || [];
    for (var i = 0; i < floors.length; i++) if (y >= floors[i].y1) return i;
    return floors.length;
  };
})(window.BDL);
