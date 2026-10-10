// Thú cưng pet7 (Heo Lulu), kỹ năng "Giáp Sắt" [LOC pet_7_skill_0_desc "HP Pet +2"].
// HP gốc 10 [ĐO RoleAttributePet.max_hp] + 2 [ĐO Pet7Controller.skill1DeltaHp] = a.hpMax 12. Máu, nhận đòn, về 1 HP thì nghỉ và hồi đầy
// sau 14~16 s do hệ máu chung SK.petHp (js/pets.js) lo [WIKI Pets]; tệp này chỉ cộng +2 HP. Sang ải mới cũng hồi đầy.
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const DELTA = 2;
  SK.petRegister('pet7', {
    init(G, a) { SK.petHp.init(a, a.hpMax + DELTA); },
    stage(G, a) { SK.petHp.heal(G, a); }
  });
})();
