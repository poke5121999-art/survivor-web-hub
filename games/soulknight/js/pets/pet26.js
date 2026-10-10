// Thú cưng pet26 (Rùa Con): "Tư Thế Phòng Thủ" — hết HP thì rút vào mai, chặn mọi đòn như bức tường.
// [LOC pet_26_skill_0_desc]; HP rùa = [ĐO attr.max_hp] 10 (web chưa có HP thú cưng nên giữ riêng a.hp ở tệp này).
// Đạn quái chạm rùa: trừ HP rùa bằng sát thương đạn, đạn biến mất; HP về 0 thì vào trạng thái defense (clip 'defense' thật),
// khi đó mọi đạn quái chạm đều bị chặn, không mất gì. [ƯỚC LƯỢNG] giữ mai 5 s rồi hồi đầy HP; trúng đạn khi cách rùa 7 px.
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const DEF_T = 5, HIT_R = 7;

  SK.petRegister('pet26', {
    init(G, a) {
      const m = (a.info && a.info.attr) || {};
      a.hpMax = m.max_hp || 10; a.hp = a.hpMax; a.defT = 0; a.blocked = 0;
    },
    tick(G, a, dt) {
      for (const b of G.bullets) {
        if (b.side !== 'e' || b.dead || b.melee || b.orbit || b.area) continue;
        if (Math.hypot(b.x - a.x, b.y - (a.y - 4)) > HIT_R) continue;
        if (b.fxh && b.fxh.stop) b.fxh.stop();
        b.dead = true; a.blocked++;
        if (a.defT <= 0) {
          a.hp -= Math.max(1, b.dmg || 1);
          if (a.hp <= 0) { a.hp = 0; a.defT = DEF_T; a.st = 'defense'; a.stT = 0; a.target = null; }
        }
      }
      if (a.defT > 0) {
        a.defT -= dt; a.stT += dt; a.st = 'defense';
        if (a.defT <= 0) { a.hp = a.hpMax; a.st = 'ide'; a.stT = 0; }
        return true;
      }
      return false;
    },
    draw(ctx, G, a) {
      if (a.defT > 0) {
        ctx.save(); ctx.strokeStyle = 'rgba(120,255,160,' + (0.4 + 0.3 * Math.sin(a.defT * 10)) + ')'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(a.x, a.y - 4, 9, 7, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
    }
  });
})();
