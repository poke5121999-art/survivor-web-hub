// Thú cưng pet2 (Ham), kỹ năng "Không Kén Ăn" [LOC pet_2_skill_0_desc]: khi đầy MP mà dùng bình hồi MP thì tăng 1 HP.
// Bình năng lượng rơi (pickup 'en_pot') vốn bị từ chối khi MP đầy (actors.js take trả false); ở đây thú cưng "ăn" nó:
// chủ đứng sát bình, MP đầy, HP chưa đầy -> bình biến mất, HP +1 (không vượt HP tối đa). Số +1 là [LOC].
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  SK.petRegister('pet2', {
    tick(G, a, dt) {
      const p = G.player;
      if (!p || p.st === 'dead' || p.energy < p.energyMax || p.hp >= p.hpMax) return false;
      for (const k of G.pickups) {
        if (k.kind !== 'en_pot' || k.gone || k.t < 0.2) continue;
        if (Math.hypot(p.x - k.x, p.y - 6 - k.y) >= 8) continue;
        k.gone = true; p.hp = Math.min(p.hpMax, p.hp + 1); a.ate = (a.ate || 0) + 1;
        SK.num(G, p.x - 4, p.y - 26, '+1', '#ff6a6a');
        break;
      }
      return false;
    }
  });
})();
