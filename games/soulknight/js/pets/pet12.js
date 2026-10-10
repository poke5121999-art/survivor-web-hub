// Thú cưng pet12 (Hải Cẩu Con): "Gọi Tỉnh" — vỗ bụng, gỡ 1 trạng thái bất lợi trên chủ [LOC pet_12_skill_0_desc].
// Web chưa có hệ trạng thái xấu trên người chơi; thứ duy nhất làm chủ yếu đi là tấm sàn giảm tốc (p.speedMul < 1 ở
// actors.js). Pet gỡ nó: nhân p.moveMul bù đúng 1/speedMul trong 3 s [ƯỚC LƯỢNG], hồi 20 s [WIKI Pets]. SK.petCleanse(G) là
// điểm cho hệ trạng thái sau này: xoá phần tử đầu của p.debuffs nếu có.
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const HOLD = 3, CD = 20;

  function unfix(p, a) { if (a.fix && a.fix !== 1) p.moveMul = (p.moveMul || 1) / a.fix; a.fix = 1; }

  SK.petCleanse = function (G) {
    const p = G.player;
    if (p && Array.isArray(p.debuffs) && p.debuffs.length) { p.debuffs.shift(); return true; }
    return false;
  };

  SK.petRegister('pet12', {
    init(G, a) { a.fix = 1; a.holdT = 0; a.cdT = 0; a.casts = 0; },
    stage(G, a) { unfix(G.player, a); a.holdT = 0; },
    tick(G, a, dt) {
      const p = G.player;
      if (!p || p.st === 'dead') return false;
      a.cdT -= dt;
      const slow = p.speedMul < 1 ? p.speedMul : 1;
      if (a.holdT <= 0 && a.cdT <= 0 && (slow < 1 || SK.petCleanse(G))) {
        a.holdT = HOLD; a.cdT = CD; a.casts++;
        a.st = 'action'; a.stT = 0;
        SK.num(G, p.x, p.y - 26, 'Gỡ!', '#6cd8ff');
      }
      if (a.holdT > 0) {
        a.holdT -= dt;
        unfix(p, a);
        if (a.holdT > 0 && slow < 1) { a.fix = 1 / slow; p.moveMul = (p.moveMul || 1) * a.fix; }
      } else unfix(p, a);
      return false;
    }
  });
})();
