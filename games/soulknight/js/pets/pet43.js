// Thú cưng pet43 (Lỗ Hổng Tấn Công): kỹ năng "Cống hiến Lỗ Thủng của ta!" [LOC pet_43_skill_0_desc]: lấy máy tính sửa gấp lỗ
// thủng, thành công thì chủ nhận ngẫu nhiên 1 buff, thất bại thì nhận 1 debuff. Không có số trong mô tả/ctl (chỉ damage 2,
// atk_cd 2 [ĐO]) nên nhịp 25 s [WIKI Pets], sửa 2 s, thành công 50%, buff/debuff +-20% trong 10 s là [ƯỚC LƯỢNG]. Chỉ sửa khi có quái.
(function () {
  'use strict';
  if (!window.SK || !SK.petRegister) return;
  const EVERY = 25, FIX = 2, LAST = 10, OK = 0.5, F = 0.2;
  // Mỗi hiệu ứng: [tên, áp, gỡ]. Nhân rồi chia lại để không đè các nguồn khác (bosses.js cũng đổi p.moveMul).
  const mul = (k, m) => [p => { p[k] = (p[k] || 1) * m; }, p => { p[k] = (p[k] || 1) / m; }];
  const BUFFS = [['dmgMul', ...mul('dmgMul', 1 + F)], ['moveMul', ...mul('moveMul', 1 + F)], ['rateMul', ...mul('rateMul', 1 + F)], ['heal', p => { p.hp = Math.min(p.hpMax, p.hp + 2); }, null]];
  const DEBUFFS = [['dmgMul', ...mul('dmgMul', 1 - F)], ['moveMul', ...mul('moveMul', 1 - F)], ['rateMul', ...mul('rateMul', 1 - F)], ['energy', p => { p.energy = Math.max(0, p.energy - 20); }, null]];
  const fighting = G => G.enemies.some(e => e.st !== 'dead' && e.st !== 'spawn');

  SK.petRegister('pet43', {
    init(G, a) {
      // Gỡ hiệu ứng còn dính từ con trước (đổi thú / qua ải) rồi bắt đầu danh sách mới, lưu ở G để không mồ côi.
      if (G._p43 && G.player) for (const f of G._p43) f.off(G.player);
      a.active = G._p43 = []; a.fixIn = 4; a.fixT = 0; a.result = null;
    },
    tick(G, a, dt) {
      const p = G.player;
      for (let i = a.active.length - 1; i >= 0; i--) {
        const f = a.active[i]; f.t -= dt;
        if (f.t <= 0) { f.off(p); a.active.splice(i, 1); }
      }
      if (a.fixT > 0) {                              // đang gõ máy tính: đứng yên ở chỗ
        a.fixT -= dt; a.stT += dt;
        if (a.fixT <= 0) {
          const win = a.force != null ? a.force === 'win' : SK.rand() < OK;
          const pool = win ? BUFFS : DEBUFFS, e = a.forcePick != null ? pool[a.forcePick] : pool[Math.floor(SK.rand() * pool.length)];
          e[1](p); if (e[2]) a.active.push({ t: LAST, off: e[2], name: e[0], win });
          a.result = { win, name: e[0] }; a.fixes = (a.fixes || 0) + 1; a.fixIn = EVERY;
          if (SK.num) SK.num(G, p.x, p.y - 28, win ? 'Sửa xong!' : 'Lỗi!', win ? '#6cff6c' : '#ff6a6a');
          a.st = 'ide'; a.stT = 0;
        }
        return true;
      }
      if (fighting(G) && p && p.st !== 'dead') {
        a.fixIn -= dt;
        if (a.fixIn <= 0) { a.fixT = FIX; if (a.anim.action) { a.st = 'action'; a.stT = 0; } return true; }
      }
      return false;
    },
    stage(G, a) { a.fixIn = 4; }
  });
})();
