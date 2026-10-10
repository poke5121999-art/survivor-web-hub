// Thú cưng pet18 (Aba): kỹ năng "Tránh Đường!" [LOC pet_18_skill_0_desc]: khi đi theo, thân Aba chạm kẻ địch gây 1 sát thương xung
// kích. Số 1 lấy từ mô tả; cự li chạm 1 đv và nhịp 0,5 s mỗi quái là [ƯỚC LƯỢNG]. Hành vi cắn mặc định giữ nguyên.
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const U = SK.PPU, DMG = 1, REACH = 1 * U, GAP = 0.5;
  SK.petRegister('pet18', {
    tick(G, a, dt) {
      for (const e of G.enemies) {
        if (e.st === 'dead' || e.st === 'spawn') continue;
        if (e._abaT > 0) { e._abaT -= dt; continue; }
        if (Math.hypot(e.x - a.x, e.y - a.y) <= REACH + (e.r || 0)) {
          e._abaT = GAP; a.rams = (a.rams || 0) + 1;
          SK.hurtEnemy(G, e, DMG, false, Math.atan2(e.y - a.y, e.x - a.x), 2);
        }
      }
      return false;
    }
  });
})();
