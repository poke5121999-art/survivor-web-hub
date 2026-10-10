// Thú cưng pet1 (Vượng Tài), kỹ năng "Thịnh Vượng" [LOC pet_1_skill_0_desc]: trong chiến đấu có cơ hội phát hiện thêm vàng.
// [WIKI Pets] đòn cắn của Buddy có 20% khiến mục tiêu rơi một đồng vàng trị giá 5 xu; hồi chiêu 10 giây.
// (trước đây là mỗi quái chết rơi thêm 1 xu [ĐO skill1FindCoinRate = 20]; nay theo wiki: gắn vào đòn cắn, có hồi chiêu.)
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const def = {
    rate: 0.2, value: 5, cd: 10,   // [WIKI Pets]
    init(G, a) { a.coinCd = 0; },
    tick(G, a, dt) { if (a.coinCd > 0) a.coinCd -= dt; return false; },
    bite(G, a, e, dmg) {
      if (a.coinCd > 0 || SK.rand() >= def.rate) return dmg;
      a.coinCd = def.cd; a.found = (a.found || 0) + 1;
      SK.dropPickup(G, 'coin', e.x, e.y - 4, { value: def.value });
      SK.num(G, e.x, e.y - 24, '+$' + def.value, '#f0b43a');
      return dmg;
    }
  };
  SK.petRegister('pet1', def);
})();
