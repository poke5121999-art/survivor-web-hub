// Thú cưng pet27 (Bài Ca Ban Đêm): "Tìm Tế Bào" — lúc chiến đấu cùng người chơi nhặt được Tế Bào.
// [LOC pet_27_skill_0_desc]. "Tế Bào" = vật liệu material_cell (Sinh Khối) trong kho hồ sơ (data/sk-items.js), rơi như vật liệu từ quái.
// [ƯỚC LƯỢNG]: khi còn quái sống trong phòng, cứ 8 s thú cưng diễn clip 'exhibit' (0,68 s) rồi đánh rơi 1 Sinh Khối cạnh nó.
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const CD = 8;

  SK.petRegister('pet27', {
    init(G, a) { a.cellT = CD; a.cells = 0; a.exT = 0; },
    tick(G, a, dt) {
      if (a.exT > 0) {
        a.exT -= dt; a.stT += dt; a.st = 'exhibit';
        if (a.exT <= 0) {
          a.st = 'ide'; a.stT = 0;
          if (SK.pickupKinds.material) { SK.dropPickup(G, 'material', a.x, a.y - 4, { key: 'material_cell', n: 1 }); a.cells++; }
        }
        return true;
      }
      if (G.enemies.some(e => e.st !== 'spawn' && e.st !== 'dead')) {
        a.cellT -= dt;
        if (a.cellT <= 0 && a.st !== 'atk') { a.cellT = CD; a.exT = SK.animLen(a.anim.exhibit) || 0.68; a.st = 'exhibit'; a.stT = 0; }
      }
      return false;
    }
  });
})();
