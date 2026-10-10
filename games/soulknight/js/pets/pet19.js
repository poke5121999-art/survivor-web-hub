// Thú cưng pet19 (Rye): kỹ năng "Hỗ trợ" [LOC pet_19_skill_0_desc]: tốc độ tụ lực của người chơi +5% [WIKI Pets] (cung/vũ khí tụ lực:
// w.hold tăng thêm 5% mỗi khung; lõi actors.js cộng hold += dt × rateMul). Chỉ nhanh phần tụ lực, không đổi nhịp bắn.
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const BONUS = 0.05;
  SK.petRegister('pet19', {
    tick(G, a, dt) {
      const p = G.player, w = p && p.weapons && p.weapons[p.cur];
      if (w && w.charging) { w.hold += dt * BONUS * (p.rateMul || 1); a.boost = (a.boost || 0) + dt * BONUS; }
      return false;
    }
  });
})();
