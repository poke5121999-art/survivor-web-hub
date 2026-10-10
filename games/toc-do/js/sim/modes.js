// Chế độ chơi: một bảng mô tả, mọi chỗ khác (dựng trận, luật, kết toán, HUD, sảnh) đọc bảng này thay vì rẽ nhánh theo tên.
// Tên hiển thị là chuỗi Localization_VN_Base gốc (hash trong ngoặc). Thuần JS.
//   karts      số xe trong trận (người chơi + bot)
//   teams      0 = đua đơn; n = n đội chia đều theo ô xuất phát (2 = Đỏ/Xanh, 3 = cặp đôi), người chơi luôn đội 1
//   match      true = hiện ở màn "Chọn kiểu phòng đua" (Xuất Phát → Ghép phòng)
//   items      true = có hộp đạo cụ (js/sim/items.js)
//   ranked     true = cộng/trừ sao xếp hạng (js/sim/rank.js)
//   practice   'free' = Huấn luyện tự do (một mình, không về đích, cắm cờ); 'shadow' = đua với bóng kỷ lục của mình
//   laps       null = theo đường đua; số = ép số vòng
(function (G) {
  var TD = G.TD = G.TD || {};

  TD.MODES = {
    speed: { id: 'speed', match: true, name: 'Tốc Độ-Đơn', karts: 6, teams: 0, items: false },            // a439eb0f
    speedTeam: { id: 'speedTeam', match: true, name: 'Tốc Độ-Đội', karts: 6, teams: 2, items: false },     // 0c7e0450
    item: { id: 'item', match: true, name: 'Đạo Cụ-Đơn', karts: 6, teams: 0, items: true },               // 3de1661e
    itemTeam: { id: 'itemTeam', match: true, name: 'Đạo Cụ-Đội', karts: 6, teams: 2, items: true },        // 0da89674
    ranked: { id: 'ranked', name: 'X.Hạng-Tốc Độ', karts: 6, teams: 0, items: false, ranked: true }, // 3e677851
    free: { id: 'free', name: 'Huấn luyện tự do', karts: 1, teams: 0, items: false, practice: 'free', laps: 99 }, // 1638d0c5
    itemPractice: { id: 'itemPractice', name: 'Khu Luyện Tập Đạo Cụ', karts: 4, teams: 0, items: true, practice: 'items' }, // 0cb4e1ca
    shadow: { id: 'shadow', name: 'Thách Đấu Ảo Ảnh', karts: 1, teams: 0, items: false, practice: 'shadow' }, // 8a2d4038
  };

  // Điểm đội theo hạng về đích. chọn: bảng 8 người của đua đội QQ Speed (10, 8, 6, 5, 4, 3, 2, 1) cắt còn 6 hạng.
  TD.TEAM_POINTS = [0, 10, 8, 6, 5, 4, 3, 2, 1];
  TD.TEAMS = [{ name: 'Đội Đỏ', c: '#ff4b4b' }, { name: 'Đội Xanh', c: '#3c9bff' }, { name: 'Đội Vàng', c: '#ffc83c' }];
  // Đội của ô xuất phát i khi người chơi ở ô slot: xen kẽ theo ô, người chơi luôn đội 1.
  TD.teamOf = function (i, slot, teams) { return ((i - slot + 1) % teams + teams) % teams; };

  // Tổng điểm các đội sau trận (hoặc giữa trận theo hạng hiện tại). Hoà thì đội có người về nhất thắng.
  TD.teamScore = function (R) {
    var n = R.mode.teams || 2, s = [], first = -1;
    for (var t = 0; t < n; t++) s.push(0);
    R.karts.forEach(function (k) {
      if (k.team == null) return;
      s[k.team] += TD.TEAM_POINTS[k.place] || 0;
      if (k.place === 1) first = k.team;
    });
    var top = Math.max.apply(null, s), best = [];
    s.forEach(function (v, i) { if (v === top) best.push(i); });
    return { pts: s, win: best.length > 1 && best.indexOf(first) >= 0 ? first : best[0] };
  };
})(typeof window !== 'undefined' ? window : globalThis);
