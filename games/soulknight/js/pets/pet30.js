// Thú cưng pet30 (Bong Bóng): "Tập Trung" — ở bên cạnh thì tốc độ tụ lực của chủ tăng nhanh.
// [LOC pet_30_skill_0_desc]. Tụ lực = w.hold của vũ khí cung/tụ lực (actors.js cộng dt*rateMul mỗi khung).
// [WIKI Pets]: tốc độ tụ lực +5% (wiki ghi thêm "Cooldown: 3 giây" nhưng hiệu ứng là tăng tốc liên tục nên không áp hồi chiêu).
// Bản trước +100% [ƯỚC LƯỢNG] đã sửa. Cạnh chủ (trong 5 đv) là [ƯỚC LƯỢNG]; chỉ tụ lực, không đổi nhịp bắn.
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const U = SK.PPU, NEAR = 5 * U, BONUS = 0.05;

  SK.petRegister('pet30', {
    init(G, a) { a.extra = 0; },
    tick(G, a, dt) {
      const p = G.player;
      if (!p || p.st === 'dead' || Math.hypot(p.x - a.x, p.y - a.y) >= NEAR) return false;
      for (const w of p.weapons) {
        if (w && w.charging && w.hold != null) { const add = dt * BONUS * (p.rateMul || 1); w.hold += add; a.extra += add; }
      }
      return false;
    }
  });
})();
