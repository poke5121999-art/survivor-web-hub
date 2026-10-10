// Thú cưng pet51 (Giáo Quan Nhỏ), kỹ năng "Ta đến trợ giúp ngươi!" [LOC pet_51_skill_0_desc]: khi Hộ Giáp của chủ về 0, xoá sạch đạn
// (địch) xung quanh rồi rút Ống Hỏa Tiễn bắn dữ dội kẻ địch trong {0} giây. Số: thời gian 5 s [ĐO ctl.skillTime], hồi 20 s
// [ĐO ctl.skillCd = WIKI Pets 20 s], sát thương 4 [ĐO ctl.damage], 6 phát mỗi 1,25 s [ĐO ctl.atkCount/duration] tức mỗi ~0,21 s, đạn rocket chuột
// 'bullet_mouse_gun!' (ctl.mouse0 = fx_mouse_gun_0). Bán kính xoá đạn 7,5 đv [ƯỚC LƯỢNG, lấy ctl.trainerDis]. Không có vụ nổ diện rộng của
// ống hỏa tiễn gốc (đạn tên này trúng một mục tiêu).
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const U = SK.PPU, W = SK.world, CLEAR_R = 7.5 * U, RANGE = 12 * U;

  const foes = G => G.enemies.filter(e => e.st !== 'spawn' && e.st !== 'dead');
  function trigger(G, a) {
    const p = G.player; let n = 0;
    for (const b of G.bullets) if (b.side === 'e' && !b.dead && Math.hypot(b.x - p.x, b.y - p.y) <= CLEAR_R) { b.dead = true; n++; }
    a.cleared += n; a.skT = a.skillTime; a.skCd = a.skillCd; a.fireT = 0; a.casts++;
    SK.num(G, a.x, a.y - 30, 'Ta đến!', '#ffd24a');
  }

  SK.petRegister('pet51', {
    init(G, a) {
      const c = a.info.ctl;
      a.skillTime = c.skillTime || 5; a.skillCd = c.skillCd || 20; a.fireIv = (c.duration || 1.25) / (c.atkCount || 6);
      a.skT = 0; a.skCd = 0; a.cleared = 0; a.casts = 0; a.shots = 0; a.fireT = 0;
    },
    playerHurt(G, a, dmg) {
      const p = G.player;
      if (a.skCd <= 0 && a.skT <= 0 && p.armor > 0 && dmg >= p.armor) trigger(G, a);
      return dmg;
    },
    tick(G, a, dt) {
      a.skCd -= dt;
      if (a.skT <= 0) return false;
      a.skT -= dt; a.stT += dt; a.fireT -= dt;
      let best = null, bd = RANGE;
      for (const e of foes(G)) { const d = Math.hypot(e.x - a.x, e.y - a.y); if (d < bd && W.los(G.map, a.x, a.y - 4, e.x, e.y - 4)) { best = e; bd = d; } }
      a.st = best ? 'atk' : 'skill_idle';
      if (best) {
        a.face = best.x >= a.x ? 1 : -1;
        if (a.fireT <= 0) {
          a.fireT = a.fireIv; a.shots++;
          SK.spawnBullet86(G, 'p', 'bullet_mouse_gun!', a.x, a.y - 8, Math.atan2(best.y - 6 - (a.y - 8), best.x - a.x),
            { dmg: a.info.ctl.damage || 4, spd: 16, repel: 2, owner: a, h: 8, life: 2 });
        }
      }
      if (a.skT <= 0) { a.st = 'ide'; a.stT = 0; }
      return true;
    }
  });
})();
