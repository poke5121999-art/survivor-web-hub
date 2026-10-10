// Thú cưng pet31 (Poch): "Quyết Tâm" — gây sát thương và đánh lui quái trong vòng tròn quanh nó.
// [LOC pet_31_skill_0_desc]; sát thương = [ĐO ctl.damage 3] × [ĐO ctl.skillDamage 1].
// Hồi chiêu 8 s [WIKI Pets]. [ƯỚC LƯỢNG]: bán kính 4 đv, tự phát khi có quái trong vòng; đánh lui như đạn repel 5.
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const U = SK.PPU, RAD = 4 * U, CD = 8, REPEL = 5;

  SK.petRegister('pet31', {
    init(G, a) { a.skT = 1; a.bursts = 0; a.ringT = 0; a.skHits = 0; },
    tick(G, a, dt) {
      a.skT -= dt; a.ringT = Math.max(0, a.ringT - dt);
      if (a.skT > 0 || a.st === 'atk') return false;
      const hit = G.enemies.filter(e => e.st !== 'spawn' && e.st !== 'dead' && Math.hypot(e.x - a.x, (e.y - a.y) * 1.4) < RAD);
      if (!hit.length) return false;
      a.skT = CD; a.bursts++; a.ringT = 0.5; a.st = 'action'; a.stT = 0;
      const dmg = a.k.dmg * ((a.info && a.info.ctl && a.info.ctl.skillDamage) || 1);
      for (const e of hit) { SK.hurtEnemy(G, e, dmg, false, Math.atan2(e.y - a.y, e.x - a.x), REPEL); a.skHits++; }
      return false;
    },
    draw(ctx, G, a) {
      if (a.ringT > 0) {
        const k = 1 - a.ringT / 0.5;
        ctx.save(); ctx.strokeStyle = 'rgba(255,230,140,' + (1 - k) + ')'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(a.x, a.y - 3, RAD * k, RAD * k / 1.4, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
    }
  });
})();
