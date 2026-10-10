// Thú cưng pet39 (Chiêu Tài / Zhaocai): "Chiêu Tài Tiến Bảo" — đánh dấu ngẫu nhiên 1 địch; hạ nó trong thời gian giới hạn thì
// rơi Vàng ngẫu nhiên [LOC pet_39_skill_0_desc]. Mỗi ải rơi tối đa limitCoinOfLevel 20 vàng [ĐO Pet39Controller.limitCoinOfLevel].
// Thời hạn 8 s mỗi dấu và số xu mỗi lần 2-5 [ƯỚC LƯỢNG]; đánh dấu mới sau hồi chiêu 30 s [WIKI Pets] kể từ khi dấu cũ hết/được hạ. Cắn thường như mặc định.
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const LIMIT_T = 8, MARK_CD = 30;

  SK.on('enemyKill', (G, e) => {
    const a = G.pet;
    if (!a || a.id !== 'pet39' || a.mark !== e) return;
    a.mark = null; a.markCd = MARK_CD;
    if (a.markT <= 0) return;
    let n = SK.randi(2, 5); n = Math.min(n, a.coinCap - a.coinStage);
    for (let i = 0; i < n; i++) SK.dropPickup(G, 'coin', e.x, e.y - 4);
    a.coinStage += Math.max(0, n); a.coinTotal += Math.max(0, n); if (n > 0) a.rewards++;
  });

  SK.petRegister('pet39', {
    init(G, a) {
      const m = ((a.parts[0] || {}).mbs || {}).Pet39Controller || {};
      a.coinCap = m.limitCoinOfLevel || 20; a.coinStage = 0; a.coinTotal = 0; a.rewards = 0; a.mark = null; a.markT = 0; a.markCd = 0.5; a.marks = 0;
    },
    stage(G, a) { a.coinStage = 0; a.mark = null; a.markCd = 0.5; },
    tick(G, a, dt) {
      if (a.mark) {
        a.markT -= dt;
        if (a.mark.st === 'dead' || a.markT <= 0) { a.mark = null; a.markCd = MARK_CD; }
      } else {
        a.markCd -= dt;
        if (a.markCd <= 0) {
          const alive = G.enemies.filter(e => e.st !== 'spawn' && e.st !== 'dead');
          if (alive.length) { a.mark = alive[SK.randi(0, alive.length - 1)]; a.markT = LIMIT_T; a.marks++; }
          else a.markCd = 0.5;
        }
      }
      return false;
    },
    draw(ctx, G, a) {
      const e = a.mark; if (!e) return;
      const k = Math.max(0, a.markT) / LIMIT_T, x = e.x, y = e.y - 30 - Math.sin(G.t * 6) * 1.5;
      ctx.save();
      ctx.fillStyle = '#ffd200'; ctx.strokeStyle = '#7a4a00'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = k > 0.3 ? '#ffd200' : '#ff4040'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
      ctx.restore();
    }
  });
})();
