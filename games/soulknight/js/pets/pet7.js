// Thú cưng pet7 (Heo Lulu), kỹ năng "Giáp Sắt" [LOC pet_7_skill_0_desc "HP Pet +2"].
// HP gốc 10 [ĐO RoleAttributePet.max_hp] + 2 [ĐO Pet7Controller.skill1DeltaHp] = a.hpMax 12. Web chưa có HP thú cưng nên tự chứa ở đây:
// đạn quái (side 'e') lọt vào 5 px quanh thú cưng trừ a.hp (đạn không bị chặn, mỗi viên tính một lần). Hết HP thì thú cưng nằm
// nghỉ 8 s [ƯỚC LƯỢNG] rồi đầy máu trở lại; sang ải mới cũng hồi đầy. Thanh máu nhỏ hiện trên đầu khi đã mất máu.
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const BASE = 10, DELTA = 2, REST = 8, R = 5;
  function revive(a) { a.hp = a.hpMax; a.down = 0; a.hidden = false; }
  SK.petRegister('pet7', {
    init(G, a) { a.hpMax = BASE + DELTA; revive(a); },
    stage(G, a) { revive(a); },
    tick(G, a, dt) {
      if (a.down > 0) { a.down -= dt; if (a.down <= 0) revive(a); return true; }
      for (const b of G.bullets) {
        if (b.side !== 'e' || b.dead || b._p7 === a) continue;
        if (Math.abs(b.x - a.x) > R || Math.abs(b.y - (a.y - 4)) > R) continue;
        b._p7 = a;
        a.hp = Math.max(0, a.hp - Math.max(1, b.dmg || 1));
        SK.num(G, a.x, a.y - 20, '-' + Math.max(1, b.dmg || 1), '#ff9a4a');
        if (a.hp <= 0) { a.down = REST; a.hidden = true; a.target = null; break; }
      }
      return false;
    },
    draw(ctx, G, a) {
      if (a.hidden || a.hp >= a.hpMax) return;
      const w = 14, x = a.x - w / 2, y = a.y - 22;
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x - 1, y - 1, w + 2, 4);
      ctx.fillStyle = '#e04848'; ctx.fillRect(x, y, w * a.hp / a.hpMax, 2);
    }
  });
})();
