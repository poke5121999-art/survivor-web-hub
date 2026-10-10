// Thú cưng pet20 (Meow): kỹ năng "Tránh Xa Người Lạ" [LOC pet_20_skill_0_desc]: kẻ địch đang đi tới gần chủ thì bị Meow gầm
// doạ nên khựng lại (về trạng thái đứng yên idle 1,2 s). Không doạ trùm. Hồi chiêu 10 s cho cả kỹ năng [WIKI Pets]: mỗi lần
// gầm, mọi quái đang đi trong tầm đều khựng. Tầm 5 đv và thời gian khựng 1,2 s là [ƯỚC LƯỢNG]; chuyển 'move' -> 'idle' vì mọi AI quái đều xử lý idle (đứng chờ stT rồi mới đi tiếp).
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const U = SK.PPU, RANGE = 5 * U, HOLD = 1.2, CD = 10;
  SK.petRegister('pet20', {
    init(G, a) { a.meowCd = 0; },
    tick(G, a, dt) {
      const p = G.player;
      if (!p || p.st === 'dead') return false;
      if (a.meowCd > 0) a.meowCd -= dt;
      if (a.meowCd > 0) return false;
      let roared = false;
      for (const e of G.enemies) {
        if (e.st !== 'move' || e.arena || e.isBoss || /^boss/i.test(e.id || '')) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) <= RANGE) {
          e.st = 'idle'; e.stT = HOLD; e._meowT = HOLD; a.scared = (a.scared || 0) + 1;
          if (!roared) { roared = true; a.st = 'atk'; a.stT = 0; a.face = e.x >= a.x ? 1 : -1; }   // Meow gầm (clip atk)
          SK.vfx.spawn(G, 'hit_white', e.x, e.y - 12, { scale: 0.8 });
        }
      }
      if (roared) a.meowCd = CD;
      return false;
    }
  });
})();
