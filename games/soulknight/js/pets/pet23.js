// Thú cưng pet23 (Cowboy): kỹ năng "Không Lãng Phí" [LOC pet_23_skill_0_desc]: đầy HP mà dùng thuốc hồi HP thì được +10 năng
// lượng. Lõi không nhặt bình máu khi đầy HP, nên ở đây Cowboy tự "uống" bình máu rơi dưới chân chủ lúc đầy HP (xoá bình, cộng 10).
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const GAIN = 10;
  SK.petRegister('pet23', {
    tick(G, a, dt) {
      const p = G.player;
      if (!p || p.st === 'dead' || p.hp < p.hpMax) return false;
      for (const k of G.pickups) {
        if (k.kind !== 'hp_pot' || k.gone || !(k.t > 0.2)) continue;
        if (Math.hypot(p.x - k.x, p.y - k.y) < 8) {
          k.gone = true; a.wasted = (a.wasted || 0) + 1;
          p.energy = Math.min(p.energyMax, p.energy + GAIN);
          SK.num(G, p.x, p.y - 26, '+' + GAIN, '#5ad0ff');
          SK.emit('pickup', G, 'hp_pot');
          break;
        }
      }
      return false;
    }
  });
})();
