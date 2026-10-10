// Thú cưng pet42 (Đạo Diễn Tiêu Đen): kỹ năng "Linh Cảm" [LOC pet_42_skill_0_desc]: trong chiến đấu liên tục móc ra vật phẩm
// ngẫu nhiên. Vật phẩm là loại nhặt sẵn có của trò chơi (vàng, năng lượng, máu, bình máu, bình năng lượng). Nhịp 8 s/lần [WIKI Pets]
// và tỷ lệ các loại là [ƯỚC LƯỢNG] (ctl chỉ có damage 3, atk_cd 2 và không chứa bảng vật phẩm); vẫn cắn như mặc định.
(function () {
  'use strict';
  if (!window.SK || !SK.petRegister) return;
  const EVERY = 8;                                    // giây giữa hai lần móc [WIKI Pets]
  const POOL = ['coin', 'coin', 'coin', 'energy', 'energy', 'hp_pot', 'hp_pot', 'en_pot'];   // [ƯỚC LƯỢNG] "máu" của mô tả = bình máu (web không có cầu máu)
  const fighting = G => G.enemies.some(e => e.st !== 'dead' && e.st !== 'spawn');

  SK.petRegister('pet42', {
    init(G, a) { a.pull = 2; a.pulled = 0; },
    tick(G, a, dt) {
      if (fighting(G)) {
        a.pull -= dt;
        if (a.pull <= 0) {
          a.pull = EVERY; a.pulled++;
          SK.dropPickup(G, POOL[Math.floor(SK.rand() * POOL.length)], a.x, a.y - 6);
          if (SK.vfx && SK.vfx.spawn) { try { SK.vfx.spawn(G, 'hit_white', a.x, a.y - 10, { scale: 0.8 }); } catch (_) {} }
        }
      }
      return false;
    }
  });
})();
