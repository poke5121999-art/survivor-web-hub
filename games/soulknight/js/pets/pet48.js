// Thú cưng pet48 (Mahhmot): kỹ năng "Á!" [LOC pet_48_skill_0_desc]: la lên, tung đòn sóng xung kích gây sát thương và đẩy lùi
// mọi kẻ địch trong vùng sóng. [ĐO ctl] damage 3, atk_cd 2 (WIKI Pets ghi hồi 30 s, mâu thuẫn nên giữ ĐO), followDistanceInBattle 5 (bám chủ 5 đv trong trận), bulletPrefab
// @bullet (không có prefab đạn riêng nên sóng vẽ bằng vòng tròn mở rộng). Bán kính 6 đv, lực đẩy 8, sóng lan 0,35 s,
// bắn khi có quái trong 4,8 đv: [ƯỚC LƯỢNG]. Thay cú cắn mặc định.
(function () {
  'use strict';
  if (!window.SK || !SK.petRegister) return;
  const U = SK.PPU, R = 6 * U, REPEL = 8, WAVE_T = 0.35, TRIG = 0.8 * R, SCREAM_AT = 0.15;
  const alive = e => e.st !== 'dead' && e.st !== 'spawn';

  SK.petRegister('pet48', {
    init(G, a) { a.scream = false; a.rings = []; a.screams = 0; a.pushed = 0; },
    tick(G, a, dt) {
      for (const r of a.rings) r.t += dt;
      a.rings = a.rings.filter(r => r.t < WAVE_T);
      a.target = null;
      if (a.scream) {
        if (a.stT >= SCREAM_AT) {
          a.scream = false; a.screams++;
          a.rings.push({ t: 0, x: a.x, y: a.y });
          for (const e of G.enemies) {
            if (!alive(e) || Math.hypot(e.x - a.x, e.y - a.y) > R + e.r) continue;
            SK.hurtEnemy(G, e, a.k.dmg, false, Math.atan2(e.y - a.y, e.x - a.x), REPEL); a.pushed++;
          }
        }
      } else if (a.cd <= 0 && a.st !== 'atk') {
        let e = null, bd = TRIG;
        for (const q of G.enemies) { const d = Math.hypot(q.x - a.x, q.y - a.y); if (alive(q) && d < bd) { e = q; bd = d; } }
        if (e) { a.face = e.x >= a.x ? 1 : -1; a.cd = a.k.cd; a.st = 'atk'; a.stT = 0; a.bit = true; a.scream = true; }
      }
      return false;
    },
    draw(ctx, G, a) {
      for (const r of a.rings) {
        const k = r.t / WAVE_T;
        ctx.save(); ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#ffe9a0'; ctx.lineWidth = 3 * (1 - k) + 1;
        ctx.beginPath(); ctx.ellipse(r.x, r.y - 6, R * k, R * k * 0.6, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
    }
  });
})();
