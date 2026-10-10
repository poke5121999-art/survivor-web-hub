// Thú cưng pet4 (Lobobo), kỹ năng "Sạc Dự Phòng" [LOC pet_4_skill_0_desc]: giới hạn giáp của chủ +2.
// [ĐO Pet4Controller.skill1DeltaHp = 2]. Cộng armorMax +2 và giáp hiện tại +2 (như buff "Giáp tối đa +1" ở rooms.js) một lần
// mỗi ván: cờ p._petArmor chặn cộng chồng khi sang ải mới (thú cưng được tạo lại mỗi ải).
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const DELTA = 2;
  SK.petRegister('pet4', {
    init(G, a) {
      const p = G.player;
      if (!p || p._petArmor) return;
      p._petArmor = DELTA; p.armorMax += DELTA; p.armor += DELTA;
    }
  });
})();
