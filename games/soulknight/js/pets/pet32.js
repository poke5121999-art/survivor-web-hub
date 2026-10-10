// Thú cưng pet32 (Hạt Dẻ): "Bảo hộ" — khi giáp của chủ vỡ (giáp = 0), Hạt Dẻ làm đạn quái bay tới chủ biến mất.
// [LOC pet_32_skill_0_desc]. Giáp = p.armor (armorMax > 0). [ƯỚC LƯỢNG]: đạn quái trong 4 đv quanh chủ bị xoá;
// giáp hồi lại > 0 thì thôi. Hồi chiêu 60 s [WIKI Pets]: tính từ lúc kích hoạt (viên đạn đầu bị chặn), hết hồi chiêu mới chặn lại được. Không xoá đòn cận chiến / vùng nổ / tia (b.melee, b.orbit, b.area).
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const U = SK.PPU, RAD = 4 * U, CD = 60;

  SK.petRegister('pet32', {
    init(G, a) { a.cleared = 0; a.fxT = 0; a.guardCd = 0; a.guarding = false; },
    tick(G, a, dt) {
      a.fxT = Math.max(0, a.fxT - dt); a.guardCd = Math.max(0, a.guardCd - dt);
      const p = G.player;
      if (!p || p.st === 'dead' || !(p.armorMax > 0) || p.armor > 0) { a.guarding = false; return false; }
      for (const b of G.bullets) {
        if (b.side !== 'e' || b.dead || b.melee || b.orbit || b.area) continue;
        if (Math.hypot(b.x - p.x, b.y - (p.y - 6)) > RAD) continue;
        if (!a.guarding) { if (a.guardCd > 0) continue; a.guarding = true; a.guardCd = CD; }
        if (b.fxh && b.fxh.stop) b.fxh.stop();
        b.dead = true; a.cleared++; a.fxT = 0.3; a.fxX = b.x; a.fxY = b.y;
      }
      return false;
    },
    draw(ctx, G, a) {
      if (a.fxT > 0) {
        ctx.save(); ctx.strokeStyle = 'rgba(190,150,90,' + (a.fxT / 0.3) + ')'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(a.fxX, a.fxY, 3 + (0.3 - a.fxT) * 20, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
    }
  });
})();
