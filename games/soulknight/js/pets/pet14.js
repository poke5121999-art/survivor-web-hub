// Thú cưng pet14 (Lai Phúc): "Hút Máu" — mỗi lần pet đánh trúng địch, hồi một chút HP cho Pet [LOC pet_14_skill_0_desc].
// HP riêng a.hp/a.hpMax (hpMax = [ĐO RoleAttributePet.max_hp] 10); mỗi cú cắn hồi +1, không quá hpMax [ƯỚC LƯỢNG lượng hồi].
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const HEAL = 1;

  SK.petRegister('pet14', {
    init(G, a) { const at = (a.info && a.info.attr) || {}; a.hpMax = at.max_hp || 10; a.hp = a.hpMax; a.healed = 0; },
    bite(G, a, e, dmg) {
      if (a.hp < a.hpMax) {
        const h = Math.min(HEAL, a.hpMax - a.hp);
        a.hp += h; a.healed += h;
        SK.num(G, a.x, a.y - 24, '+' + h, '#6cff6c');
      }
      return dmg;
    },
    draw(ctx, G, a) {
      if (a.hp >= a.hpMax) return;
      const w = 14, x = a.x - w / 2, y = a.y - 22;
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x - 1, y - 1, w + 2, 4);
      ctx.fillStyle = '#e04646'; ctx.fillRect(x, y, w * Math.max(0, a.hp) / a.hpMax, 2);
    }
  });
})();
