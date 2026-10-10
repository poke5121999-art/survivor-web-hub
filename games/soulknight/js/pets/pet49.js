// Thú cưng pet49 (Chú Heo Con), kỹ năng "Ngơ ngác" [LOC pet_49_skill_0_desc]: tới gần kẻ địch, vào tầm cận chiến thì Ngủ và Chế Giễu
// kẻ địch xung quanh; bị tấn công nhiều lần thì Nổi Giận (đánh nhanh hơn, chạy nhanh hơn, dễ Bạo Kích hơn).
// Con số: số đòn để nổi giận 8 [ĐO ctl.skillGetHurtTarget], HP 15 [ĐO attr.max_hp], sát thương cắn 5 [ĐO ctl.damage],
// hệ số bạo kích 2 [ĐO ctl.criticalFactor]. Chưa có trong ctl nên là [ƯỚC LƯỢNG]: ngủ 2 s, hồi ngủ 30 s [WIKI Pets], tầm chế giễu 8 đv, nổi giận
// 10 s (đi ×1,5, hồi chiêu cắn ÷1,5, 30% bạo kích). Kẻ địch web chỉ nhắm chủ nên "chế giễu" = kéo đạn địch đang bay quanh heo về phía heo;
// heo nhận sát thương từ đạn địch trúng nó (HP riêng a.hp, không chết: giữ tối thiểu 1).
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const U = SK.PPU, HITS = 8, NAP = 2, NAP_CD = 30, TAUNT_R = 8 * U, RAGE = 10, RAGE_SPD = 1.5, RAGE_CRIT = 0.3;

  function rage(a, on) {
    a.angry = on; a.rageT = on ? RAGE : 0;
    a.k.spd = a.base.spd * (on ? RAGE_SPD : 1);
    a.k.cd = a.base.cd / (on ? RAGE_SPD : 1);
  }

  SK.petRegister('pet49', {
    init(G, a) {
      a.hpMax = a.hp = (a.info && a.info.attr.max_hp) || 15;
      a.hits = 0; a.sleepT = 0; a.napCd = 0; a.angry = false; a.rageT = 0; a.naps = 0;
      a.base = { spd: a.k.spd, cd: a.k.cd };
    },
    tick(G, a, dt) {
      a.napCd -= dt;
      // đạn địch trúng heo: mất máu, đếm số đòn
      for (const b of G.bullets) {
        if (b.side !== 'e' || b.dead) continue;
        if (Math.abs(b.x - a.x) > 6 + (b.r || 2) || Math.abs(b.y - (a.y - 7)) > 7 + (b.r || 2)) continue;
        b.dead = true; a.hp = Math.max(1, a.hp - (b.dmg || 1)); a.hits++;
        SK.num(G, a.x, a.y - 22, b.dmg || 1, '#ff9a4a');
        if (a.hits >= HITS && !a.angry) rage(a, true);
      }
      if (a.angry) { a.rageT -= dt; if (a.rageT <= 0) { rage(a, false); a.hits = 0; } }
      if (a.sleepT > 0) {
        a.sleepT -= dt; a.stT += dt; a.st = 'action idle';
        for (const b of G.bullets) {   // chế giễu: đạn địch quanh heo quay mũi về phía heo
          if (b.side !== 'e' || b.dead || Math.hypot(b.x - a.x, b.y - a.y) > TAUNT_R) continue;
          const sp = Math.hypot(b.vx, b.vy), d = Math.hypot(a.x - b.x, a.y - 7 - b.y) || 1;
          if (sp > 0.01) { b.vx = (a.x - b.x) / d * sp; b.vy = (a.y - 7 - b.y) / d * sp; b.taunted = true; }
        }
        if (a.sleepT <= 0) { a.st = 'ide'; a.stT = 0; }
        return true;
      }
      return false;
    },
    bite(G, a, e, dmg) {
      if (a.napCd <= 0) { a.sleepT = NAP; a.napCd = NAP_CD; a.naps++; SK.num(G, a.x, a.y - 30, 'Zzz', '#9fd0ff'); }
      return a.angry && SK.rand() < RAGE_CRIT ? dmg * (a.info.ctl.criticalFactor || 2) : dmg;
    },
    draw(ctx, G, a) {
      if (a.angry) { ctx.save(); ctx.strokeStyle = 'rgba(255,60,40,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(a.x, a.y - 7, 11, 9, 0, 0, 7); ctx.stroke(); ctx.restore(); }
      if (a.sleepT > 0) { ctx.save(); ctx.fillStyle = '#cfe6ff'; ctx.font = 'bold 9px sans-serif'; ctx.fillText('z z', a.x + 6, a.y - 26 - Math.sin(a.stT * 4) * 2); ctx.restore(); }
    }
  });
})();
