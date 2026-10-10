// Thú cưng pet29 (Pudding): "Đôi Chân Nhanh Nhạy" — ở cạnh chủ thì chủ chạy nhanh, thỉnh thoảng tăng tốc thêm một lúc ngắn.
// [LOC pet_29_skill_0_desc]. [WIKI Pets] tốc chạy +25% trong 2 s, hồi chiêu 8 s (diễn clip 'action run'); không có phần tăng nền
// khi đứng cạnh (bản trước có ×1,1 [ƯỚC LƯỢNG], bỏ vì wiki không nói). "Cạnh chủ" trong 5 đv vẫn là [ƯỚC LƯỢNG].
// Nhân vào p.moveMul và chỉ gỡ đúng phần mình đã nhân (như holdMove trong actors.js); thú cưng bị thay/mất thì gỡ ngay.
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const U = SK.PPU, NEAR = 5 * U, BURST = 1.25, CD = 8, DUR = 2;

  function setF(p, a, f) {
    const cur = p.moveMul == null ? 1 : p.moveMul;
    p.moveMul = cur / (a.sp || 1) * f; a.sp = f;
  }

  SK.petRegister('pet29', {
    init(G, a) {
      a.sp = 1; a.burstT = 0; a.burstCd = 3;
      G.props.push({ x: 0, y: -1e9, draw() {}, update(G2, q) {
        if (G2.pet !== a && a.sp !== 1) { if (G2.player) setF(G2.player, a, 1); }
        if (G2.pet !== a) q.gone = true;
      } });
    },
    tick(G, a, dt) {
      const p = G.player;
      if (!p || p.st === 'dead') { if (p) setF(p, a, 1); return false; }
      const near = Math.hypot(p.x - a.x, p.y - a.y) < NEAR;
      if (near) {
        a.burstCd -= dt;
        if (a.burstT > 0) a.burstT -= dt;
        else if (a.burstCd <= 0) { a.burstT = DUR; a.burstCd = CD; a.bursts = (a.bursts || 0) + 1; }
      } else a.burstT = 0;
      const f = near && a.burstT > 0 ? BURST : 1;
      if (f !== a.sp) setF(p, a, f);
      return false;
    }
  });
})();
