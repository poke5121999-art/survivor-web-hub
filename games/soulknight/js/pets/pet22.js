// Thú cưng pet22 (Papa): kỹ năng "Quan Tâm" [LOC pet_22_skill_0_desc]: mỗi khi chủ đã dùng đủ 20 năng lượng thì hồi ngẫu
// nhiên 0-5 năng lượng. Theo dõi tụt năng lượng mỗi khung (không hook lõi), cộng dồn đến 20 thì trả lại một lần.
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  SK.petRegister('pet22', {
    init(G, a) { a.spent = 0; a.last = G.player ? G.player.energy : 0; a.refunded = 0; },
    tick(G, a, dt) {
      const p = G.player;
      if (!p) return false;
      if (p.energy < a.last) a.spent += a.last - p.energy;
      while (a.spent >= 20) {
        a.spent -= 20;
        const n = SK.randi(0, 5);
        if (n > 0) { p.energy = Math.min(p.energyMax, p.energy + n); a.refunded += n; SK.num(G, p.x, p.y - 26, '+' + n, '#5ad0ff'); }
      }
      a.last = p.energy;
      return false;
    }
  });
})();
