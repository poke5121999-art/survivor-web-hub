// Thú cưng pet14 (Lai Phúc): "Hút Máu" — mỗi lần pet đánh trúng địch, hồi một chút HP cho Pet [LOC pet_14_skill_0_desc].
// HP: a.hp/a.hpMax của hệ máu chung SK.petHp (hpMax = [ĐO RoleAttributePet.max_hp] 10; wiki: thanh máu pet không hiện); mỗi cú cắn hồi +1, không quá hpMax [ƯỚC LƯỢNG lượng hồi].
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const HEAL = 1;

  SK.petRegister('pet14', {
    init(G, a) { a.healed = 0; },
    bite(G, a, e, dmg) {
      if (a.hp < a.hpMax) {
        const h = Math.min(HEAL, a.hpMax - a.hp);
        a.hp += h; a.healed += h;
        SK.num(G, a.x, a.y - 24, '+' + h, '#6cff6c');
      }
      return dmg;
    }
  });
})();
