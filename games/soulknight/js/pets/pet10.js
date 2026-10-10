// Thú cưng pet10 (Bồ Câu): "Chưa Có Mặt" — thỉnh thoảng né đòn tấn công của địch [LOC pet_10_skill_0_desc].
// Tỉ lệ né 20% = [ĐO Pet10Controller.skill1Rate 20]. Web chưa cho quái đánh pet, nên cú né áp lên đòn quái đánh chủ
// (pet bay chắn, chủ không mất máu) [ƯỚC LƯỢNG]. Clip 'atk skill1' của prefab là động tác né: phát khi né thành công.
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const FALLBACK = 20;

  SK.petRegister('pet10', {
    init(G, a) {
      const c = ((a.info && a.info.ctl) || {}).skill1Rate;
      a.rate = (c != null ? c : FALLBACK) / 100; a.dodges = 0; a.hits = 0;
    },
    playerHurt(G, a, dmg) {
      a.hits++;
      if (SK.rand() < a.rate) {
        a.dodges++;
        SK.num(G, G.player.x, G.player.y - 26, 'MISS', '#c9d2df');
        return 0;
      }
      return dmg;
    }
  });
})();
