// Thú cưng pet13 (Lỗ Thủng Tổ Truyền): "Uôi! Kinh!" — địch sợ: bớt muốn tấn công (hồi chiêu chậm đi) và đạn bay chậm hơn
// [LOC pet_13_skill_0_desc]. Mọi quái còn sống bị đánh dấu e._fear: bộ đếm hồi chiêu e.cd chạy chậm còn 75% (cộng ngược
// 25% mỗi nhịp), đạn phe 'e' của chúng bị trừ 5 đơn vị tốc (5 × PPU px/s, [WIKI Pets]) một lần lúc sinh, không xuống dưới 1 đơn vị (sàn [ƯỚC LƯỢNG]).
// Hệ số 0,75 cho hồi chiêu vẫn là [ƯỚC LƯỢNG] (wiki không nêu số).
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const CD_SLOW = 0.75, BUL_CUT = 5 * SK.PPU, BUL_MIN = SK.PPU;

  SK.petRegister('pet13', {
    init(G, a) { a.slowed = 0; },
    tick(G, a, dt) {
      for (const e of G.enemies) {
        if (e.st === 'spawn' || e.st === 'dead') continue;
        e._fear = true;
        if (typeof e.cd === 'number' && e.cd > 0 && e.st !== 'aim' && e.st !== 'attack') e.cd += dt * (1 - CD_SLOW);
      }
      for (const b of G.bullets) {
        if (b.side !== 'e' || b._fear || b.dead) continue;
        b._fear = true;
        if (b.owner && b.owner._fear && (b.vx || b.vy)) { const v = Math.hypot(b.vx, b.vy), k = Math.max(BUL_MIN, v - BUL_CUT) / v; b._v0 = v; b.vx *= k; b.vy *= k; a.slowed++; }
      }
      return false;
    },
    stage(G, a) { a.slowed = 0; }
  });
})();
