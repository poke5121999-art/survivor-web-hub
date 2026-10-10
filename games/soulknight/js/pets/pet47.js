// Thú cưng pet47 (Đại Ca Bánh Chưng): kỹ năng "Bánh Chưng Thịt Muối Muôn Năm" [LOC pet_47_skill_0_desc]: vào trạng thái cuồng
// bạo, đôi AK47, tỷ lệ bạo kích, tốc độ đánh, tốc chạy tăng đáng kể. [ĐO ctl]: SkillAddMoveSpeedRate 1, SkillAddAtkSpeed 1,
// SkillAddCritRate 1 (đọc là +100% mỗi thứ [ƯỚC LƯỢNG]), damage 3, atk_cd 2. Thú bắn từ xa bằng bullet_0 [ƯỚC LƯỢNG prefab đạn]:
// thường 1 viên mỗi nhịp atk_cd; cuồng bạo (6 s [ƯỚC LƯỢNG] mỗi 40 s [WIKI Pets] khi có quái) bắn loạt 4 lần 2 nòng (đôi AK) và bạo kích
// chắc chắn (x2 sát thương). Không cắn; thú đứng gần chủ như mặc định.
(function () {
  'use strict';
  if (!window.SK || !SK.petRegister) return;
  const U = SK.PPU, RANGE = 10 * U, DUR = 6, EVERY = 40, GAP = 0.12, BURST = 4;
  const fighting = G => G.enemies.some(e => e.st !== 'dead' && e.st !== 'spawn');
  function foe(G, a) {
    let best = null, bd = RANGE;
    for (const e of G.enemies) {
      if (e.st === 'spawn' || e.st === 'dead') continue;
      const d = Math.hypot(e.x - a.x, e.y - a.y);
      if (d < bd && SK.world.los(G.map, a.x, a.y - 4, e.x, e.y - 4)) { best = e; bd = d; }
    }
    return best;
  }

  SK.petRegister('pet47', {
    init(G, a) {
      const c = (a.info && a.info.ctl) || {};
      a.c = { mv: c.SkillAddMoveSpeedRate || 1, as: c.SkillAddAtkSpeed || 1, cr: c.SkillAddCritRate || 1 };
      a.k = Object.assign({}, a.k); a.spd0 = a.k.spd;
      a.on = false; a.skillT = 0; a.skillIn = 3; a.fireCd = 1; a.burst = 0; a.burstT = 0; a.shots = 0; a.crits = 0; a.dual = 0;
    },
    tick(G, a, dt) {
      a.target = null;
      if (a.on) { a.skillT -= dt; if (a.skillT <= 0) { a.on = false; a.k.spd = a.spd0; a.skillIn = EVERY; } }
      else if (fighting(G)) {
        a.skillIn -= dt;
        if (a.skillIn <= 0) { a.on = true; a.skillT = DUR; a.k.spd = a.spd0 * (1 + a.c.mv); if (SK.num) SK.num(G, a.x, a.y - 24, 'Cuồng bạo!', '#ff5040'); }
      }
      const e = foe(G, a), asp = a.on ? 1 + a.c.as : 1;
      if (a.burst > 0) {
        a.burstT -= dt;
        if (a.burstT <= 0) {
          a.burstT = GAP / asp; a.burst--;
          const tg = a.bt && a.bt.st !== 'dead' ? a.bt : e;
          if (tg) {
            const ang = Math.atan2(tg.y - tg.hb.off[1] * tg.scale - (a.y - 8), tg.x - a.x);
            const crit = a.on && SK.rand() < Math.min(1, a.c.cr), dmg = a.k.dmg * (crit ? 2 : 1);
            const nb = a.on ? 2 : 1;                         // đôi AK47: hai nòng lệch trên/dưới
            for (let i = 0; i < nb; i++) {
              SK.spawnBullet86(G, 'p', 'bullet_0', a.x + a.face * 4, a.y - 8 + (nb === 2 ? (i ? 3 : -3) : 0), ang, { dmg, crit, repel: 1, spd: 18, h: 8, owner: a });
              a.shots++; if (crit) a.crits++;
            }
            if (nb === 2) a.dual++;
          }
        }
      }
      a.fireCd -= dt;
      if (e && a.fireCd <= 0 && a.burst <= 0) {
        a.fireCd = a.k.cd / asp; a.burst = a.on ? BURST : 1; a.burstT = 0; a.bt = e;
        a.face = e.x >= a.x ? 1 : -1; a.st = 'atk'; a.stT = 0; a.bit = true;
      }
      return false;
    },
    stage(G, a) { a.on = false; a.k.spd = a.spd0; a.skillIn = 3; }
  });
})();
