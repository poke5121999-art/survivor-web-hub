// Thú cưng pet53 (Khối Lạnh), kỹ năng "Bắn! Đạn Nguyên Khí!" [LOC pet_53_skill_0_desc]: cầm súng bắn Đạn Nguyên Khí bảo vệ Đá Phép.
// Con số [ĐO ctl]: sát thương 3 (damage), bắn mỗi 1 s (skillShootInterval), ngắm 1 s trước phát đầu (focus_time), đứng cách mục tiêu
// 3 đến 10 đv (back_min/back_max), atk_mode 0. Đạn 'bullet_MageBall' bay 14 đv/s [ƯỚC LƯỢNG]. Không cắn: thú bắn xa nên bỏ bước cắn
// mặc định khi có kẻ địch trong tầm. "Tích hợp sức sống đồng đội" không có số liệu nên chưa làm.
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const U = SK.PPU, W = SK.world, RANGE = 10 * U;

  SK.petRegister('pet53', {
    init(G, a) {
      const c = a.info.ctl;
      a.iv = c.skillShootInterval || 1; a.focus = c.focus_time || 1; a.min = (c.back_min || 3) * U; a.max = (c.back_max || 10) * U;
      a.fireT = a.focus; a.tgt = null; a.shots = 0; a.atkT = 0;
    },
    tick(G, a, dt) {
      const p = G.player;
      if (!p || p.st === 'dead') return false;
      let best = null, bd = RANGE;
      for (const e of G.enemies) {
        if (e.st === 'spawn' || e.st === 'dead') continue;
        const d = Math.hypot(e.x - a.x, e.y - a.y);
        if (d < bd && W.los(G.map, a.x, a.y - 4, e.x, e.y - 4)) { best = e; bd = d; }
      }
      if (!best) { a.tgt = null; a.fireT = a.focus; return false; }
      if (Math.hypot(p.x - a.x, p.y - a.y) > a.k.far) return false;   // quá xa chủ: về bước mặc định
      if (!a.tgt || a.tgt.st === 'dead') a.fireT = Math.max(a.fireT, a.focus);
      a.tgt = best;
      a.stT += dt; a.fireT -= dt; a.atkT -= dt;
      a.face = best.x >= a.x ? 1 : -1;
      const dx = best.x - a.x, dy = best.y - a.y, d = bd || 1;
      let mv = 0;
      if (d < a.min) mv = -1; else if (d > a.max * 0.9) mv = 1;
      if (mv) { SK.moveBox(G.map, a, dx / d * mv * a.k.spd * dt, dy / d * mv * a.k.spd * dt, 3); if (a.st !== 'run') { a.st = 'run'; a.stT = 0; } }
      else if (a.atkT <= 0 && a.st !== 'ide') { a.st = 'ide'; a.stT = 0; }
      if (a.fireT <= 0) {
        a.fireT = a.iv; a.shots++; a.atkT = 0.3; a.st = 'atk'; a.stT = 0;
        SK.spawnBullet86(G, 'p', 'bullet_MageBall', a.x, a.y - 8, Math.atan2(best.y - 6 - (a.y - 8), dx),
          { dmg: a.info.ctl.damage || 3, spd: 14, repel: 1, owner: a, h: 8, life: 2 });
      }
      return true;
    }
  });
})();
