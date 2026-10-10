// Thú cưng pet9 (Douwa): "Oh oh oh!!!" — biến thành hạt đậu khổng lồ và tấn công liên tục trong một khoảng thời gian
// [LOC pet_9_skill_0_desc]. Khi có quái trong tầm và hết hồi: thân to ×2,5, cắn dồn (hồi cắn 2 s → 0,4 s), sát thương ×2,
// kéo dài 5 s rồi thu nhỏ. Cơ sở cắn [ĐO Pet9Controller damage 3, atk_cd 2]; hệ số to/nhanh/thời gian [ƯỚC LƯỢNG]; hồi chiêu 10 s [WIKI Pets].
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const BIG = 2.5, DUR = 5, CD = 10, FAST = 0.4, DMG_MUL = 2;

  function end(a) { a.big = false; a.scale = 1; a.k.cd = a.baseCd; a.skillCd = CD; }

  SK.petRegister('pet9', {
    init(G, a) { a.baseCd = a.k.cd; a.big = false; a.bigT = 0; a.skillCd = 3; a.bites = 0; a.casts = 0; },
    stage(G, a) { if (a.big) end(a); },
    tick(G, a, dt) {
      if (a.big) {
        a.bigT -= dt;
        a.k.cd = FAST;
        if (a.bigT <= 0) end(a);
      } else {
        a.skillCd -= dt;
        if (a.skillCd <= 0 && a.target && a.target.st !== 'dead') {
          a.big = true; a.bigT = DUR; a.scale = BIG; a.casts++; a.cd = 0;
          SK.num(G, a.x, a.y - 30, '!!!', '#ffe06a');
        }
      }
      return false;
    },
    bite(G, a, e, dmg) { a.bites++; return a.big ? dmg * DMG_MUL : dmg; }
  });
})();
