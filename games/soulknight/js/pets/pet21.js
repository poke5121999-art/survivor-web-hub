// Thú cưng pet21 (Snow): kỹ năng "Yên Tâm" [LOC pet_21_skill_0_desc]: Snow ở cạnh chủ thì chủ miễn đóng băng. Bản web chưa có
// trạng thái đóng băng ở người chơi, nên ở đây đặt cờ p.freezeImmune = true (cho hệ thống băng sau này đọc) và dọn các trường
// băng thường gặp (p.frozenT, p.freezeT, p.iceT) về 0 mỗi khung. "Cạnh bạn" = trong 6 đv [ƯỚC LƯỢNG].
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const NEAR = 6 * SK.PPU;
  SK.petRegister('pet21', {
    tick(G, a, dt) {
      const p = G.player;
      if (!p) return false;
      p.freezeImmune = Math.hypot(p.x - a.x, p.y - a.y) <= NEAR;
      if (p.freezeImmune) for (const k of ['frozenT', 'freezeT', 'iceT']) if (p[k] > 0) { p[k] = 0; a.thawed = (a.thawed || 0) + 1; }
      return false;
    },
    stage(G, a) { if (G.player) G.player.freezeImmune = true; }
  });
  SK.on('stageEnter', G => { if (G.player && (!G.pet || G.pet.id !== 'pet21')) G.player.freezeImmune = false; });
})();
