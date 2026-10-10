// Thú cưng pet33 (Lửa Đỏ / Yanyan): "Lửa Rồng" — phóng ngọn lửa tầm trung [LOC pet_33_skill_0_desc].
// Không chạy tới cắn: đứng yên thở lửa vào quái trong tầm. Một đợt = 5 quả cầu lửa quạt hẹp, tổng sát thương
// fireDamage 10 [ĐO Pet33Controller.fireDamage] chia đều (2 mỗi quả); nhịp mỗi atk_cd 2 s [ĐO ctl.atk_cd; WIKI Pets ghi hồi 10 s, mâu thuẫn nên giữ ĐO];
// đạn là prefab 'fireball' thật trong bullets 8.6 (phe 'p'). Tầm 6 đv, thời gian thở 0,4 s [ƯỚC LƯỢNG].
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const U = SK.PPU, W = SK.world;
  const RANGE = 6 * U, PUFFS = 5, BREATH = 0.4;

  function nearest(G, a) {
    let best = null, bd = RANGE;
    for (const e of G.enemies) {
      if (e.st === 'spawn' || e.st === 'dead') continue;
      const d = Math.hypot(e.x - a.x, e.y - a.y);
      if (d < bd && W.los(G.map, a.x, a.y - 4, e.x, e.y - 4)) { best = e; bd = d; }
    }
    return best;
  }

  SK.petRegister('pet33', {
    init(G, a) {
      const m = ((a.parts[0] || {}).mbs || {}).Pet33Controller || {};
      a.k.fireDamage = m.fireDamage || 10;   // [ĐO]
      a.fireCd = 1; a.breath = 0; a.puffs = 0; a.fired = 0; },
    bite() { return 0; },
    tick(G, a, dt) {
      const p = G.player;
      a.target = null;                                   // không đuổi theo để cắn
      if (!p || p.st === 'dead') return false;
      a.fireCd -= dt;
      if (a.breath > 0) {                                // đang thở lửa
        a.breath -= dt; a.stT += dt; a.st = 'atk';
        const want = Math.ceil((1 - Math.max(0, a.breath) / BREATH) * PUFFS);
        while (a.puffs < want) {
          const t = a.fireTgt && a.fireTgt.st !== 'dead' ? a.fireTgt : null;
          const ang0 = t ? Math.atan2(t.y - a.y, t.x - a.x) : (a.face > 0 ? 0 : Math.PI);
          const ang = ang0 + SK.deg((a.puffs - (PUFFS - 1) / 2) * 5);
          SK.spawnBullet86(G, 'p', 'fireball', a.x + Math.cos(ang) * 8, a.y - 6 + Math.sin(ang) * 8, ang,
            { dmg: Math.max(1, Math.round(a.k.fireDamage / PUFFS)), repel: 1, h: 6, owner: a, life: 0.6 });
          a.puffs++; a.fired++;
        }
        if (a.breath <= 0) { a.st = 'ide'; a.stT = 0; }
        return true;
      }
      if (a.fireCd <= 0) {
        const e = nearest(G, a);
        if (e) {
          a.fireTgt = e; a.face = e.x >= a.x ? 1 : -1; a.breath = BREATH; a.puffs = 0; a.fireCd = a.k.cd; a.st = 'atk'; a.stT = 0;
          return true;
        }
        a.fireCd = 0.25;
      }
      return false;
    }
  });
})();
