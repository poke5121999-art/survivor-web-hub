// Thú cưng pet26 (Rùa Con): "Tư Thế Phòng Thủ" — hết HP thì rút vào mai, chặn mọi đòn như bức tường.
// [LOC pet_26_skill_0_desc]; HP rùa = [ĐO attr.max_hp] 10 qua hệ máu chung SK.petHp (js/pets.js). Đạn quái chạm rùa: trừ HP rùa bằng sát
// thương đạn, đạn biến mất; HP về 1 (sàn của pet) thì vào trạng thái defense (clip 'defense' thật) suốt lúc nghỉ 14~16 s [WIKI Pets], khi đó
// mọi đạn quái chạm đều bị chặn, không mất gì (guard); hết nghỉ thì đầy máu và ra khỏi mai.
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;

  SK.petRegister('pet26', {
    guard: true,
    init(G, a) { a.blocked = 0; },
    hurt(G, a, dmg) {
      if (a.rest > 0) { a.blocked++; return 0; }
      return dmg;
    },
    onRest(G, a) { a.st = 'defense'; a.stT = 0; },
    onWake(G, a) { a.st = 'ide'; a.stT = 0; },
    draw(ctx, G, a) {
      if (a.rest > 0) {
        ctx.save(); ctx.strokeStyle = 'rgba(120,255,160,' + (0.4 + 0.3 * Math.sin(a.rest * 10)) + ')'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(a.x, a.y - 4, 9, 7, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
    }
  });
})();
