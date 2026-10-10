// Thú cưng pet15 (Hà Mã Hồng): "Phân" — cứ 8 s để lại một đống phân trên đất, địch đạp phải chịu 2 sát thương
// [LOC pet_15_skill_0_desc]; chu kỳ 8 s và 2 sát thương được wiki xác nhận [WIKI Pets]. Mỗi đống nổ một lần khi quái (không phải xác/đang sinh ra) bước vào bán kính thân + 6 px;
// tối đa 5 đống, mỗi đống tồn 30 s, đống mất khi sang ải. Bán kính trúng, số đống, hạn 30 s [ƯỚC LƯỢNG]; hình vẽ bằng nét vẽ tay.
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const EVERY = 8, DMG = 2, MAX = 5, LIFE = 30, REACH = 6;

  SK.petRegister('pet15', {
    init(G, a) { a.poos = []; a.pooT = EVERY; a.dropped = 0; a.slips = 0; },
    stage(G, a) { a.poos = []; a.pooT = EVERY; },
    tick(G, a, dt) {
      a.pooT -= dt;
      if (a.pooT <= 0) {
        a.pooT += EVERY;
        a.poos.push({ x: a.x - a.face * 6, y: a.y, t: 0 }); a.dropped++;
        if (a.poos.length > MAX) a.poos.shift();
      }
      for (const q of a.poos) {
        q.t += dt;
        for (const e of G.enemies) {
          if (e.st === 'spawn' || e.st === 'dead') continue;
          if (Math.hypot(e.x - q.x, e.y - q.y) <= (e.r || 6) + REACH) {
            q.gone = true; a.slips++;
            SK.hurtEnemy(G, e, DMG, false, Math.atan2(e.y - q.y, e.x - q.x), 0);
            break;
          }
        }
        if (q.t > LIFE) q.gone = true;
      }
      a.poos = a.poos.filter(q => !q.gone);
      return false;
    },
    draw(ctx, G, a) {
      for (const q of a.poos) {
        ctx.fillStyle = '#5a3a1e'; ctx.fillRect(q.x - 4, q.y - 2, 8, 3);
        ctx.fillStyle = '#6e4624'; ctx.fillRect(q.x - 3, q.y - 4, 6, 3);
        ctx.fillStyle = '#82552b'; ctx.fillRect(q.x - 1, q.y - 6, 3, 3);
      }
    }
  });
})();
