// Thú cưng pet11 (Bổ Nhào): "Đánh Xa" — luôn tấn công kẻ địch xa chủ nhất [LOC pet_11_skill_0_desc].
// Mỗi lần chọn mục tiêu, lấy quái còn sống xa người chơi nhất trong tầm pets.js cho phép đuổi (nửa max_follow_distance
// [ĐO Pet11Controller 20 → 10 đv]; xa hơn pets.js bỏ mục tiêu). Cắn dùng damage 3 / atk_cd 2 [ĐO].
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;

  SK.petRegister('pet11', {
    init(G, a) { a.pick = null; },
    tick(G, a, dt) {
      const p = G.player;
      if (!p || p.st === 'dead' || a.st === 'atk' || a.target || a.cd > 0) return false;
      let best = null, bd = -1;
      const lim = a.k.far * 0.5;
      for (const e of G.enemies) {
        if (e.st === 'spawn' || e.st === 'dead') continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d <= lim && d > bd) { best = e; bd = d; }
      }
      if (best) { a.target = best; a.pick = { d: bd, e: best }; }
      return false;
    }
  });
})();
