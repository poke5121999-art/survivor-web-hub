// Thú cưng pet0 (Liang), kỹ năng "Hân Hoan" [LOC pet_0_skill_0_desc]: thỉnh thoảng hồi một lượng MP nhất định cho chủ.
// [WIKI Pets] chủ trong bán kính 3 ô quanh Chilly thì hồi ngẫu nhiên 1, 3 hoặc 5 năng lượng; hồi chiêu 8 giây.
// 1 ô = SK.TILE = 16 px (engine.js) nên bán kính 48 px. Bước mặc định (đi theo, cắn) giữ nguyên.
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const EVERY = 8, AMOUNTS = [1, 3, 5], RADIUS = 3 * SK.TILE;   // [WIKI Pets]
  SK.petRegister('pet0', {
    init(G, a) { a.mpT = EVERY; },
    tick(G, a, dt) {
      const p = G.player;
      if (!p || p.st === 'dead') return false;
      a.mpT -= dt;
      if (a.mpT <= 0 && !a.hidden && Math.hypot(p.x - a.x, p.y - a.y) <= RADIUS) {
        a.mpT = EVERY;
        if (p.energy < p.energyMax) {
          const n = Math.min(AMOUNTS[Math.floor(SK.rand() * AMOUNTS.length)], p.energyMax - p.energy);
          p.energy += n; a.mpGot = (a.mpGot || 0) + n;
          SK.num(G, p.x, p.y - 30, '+' + n, '#6ac8ff');
        }
      }
      return false;
    }
  });
})();
