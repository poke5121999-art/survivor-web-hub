// Thú cưng pet56 (Khỉ Điên Nhỏ), kỹ năng "Bắn Tỉa Chí Mạng" [LOC pet_56_skill_0_desc]: trong chiến đấu thỉnh thoảng lấy súng bắn tỉa
// 「Mị Ảnh」 ra bắn kẻ địch. Số [ĐO ctl]: ngắm 0,5 s trước phát bắn (skillFireWait), cất súng 1 s sau phát bắn (skillClearWeaponWait).
// [ƯỚC LƯỢNG]: thỉnh thoảng = 20 s một lần [WIKI Pets] (lần đầu sau 5 s), tầm 12 đv, đạn 'bullet_golden_sniper' 28 đv/s, sát thương 15 chí mạng,
// xuyên 3 mục tiêu. Đòn thường dùng súng (atkFireWait 0,1 / atkClearWeaponWait 1,5) chưa làm: vẫn là cắn mặc định.
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const U = SK.PPU, W = SK.world, RANGE = 12 * U, EVERY = 20, FIRST = 5, DMG = 15;

  SK.petRegister('pet56', {
    init(G, a) {
      const c = a.info.ctl;
      a.fireWait = c.skillFireWait || 0.5; a.clearWait = c.skillClearWeaponWait || 1;
      a.sk = null; a.skT = 0; a.skCd = FIRST; a.snipes = 0; a.tgt = null;
    },
    tick(G, a, dt) {
      const p = G.player;
      if (!p || p.st === 'dead') return false;
      if (!a.sk) {
        a.skCd -= dt;
        if (a.skCd > 0) return false;
        let best = null, bd = RANGE;
        for (const e of G.enemies) {
          if (e.st === 'spawn' || e.st === 'dead') continue;
          const d = Math.hypot(e.x - a.x, e.y - a.y);
          if (d < bd && W.los(G.map, a.x, a.y - 4, e.x, e.y - 4)) { best = e; bd = d; }
        }
        if (!best) return false;
        a.sk = 'aim'; a.skT = 0; a.tgt = best; a.st = 'atk'; a.stT = 0;
      }
      a.skT += dt; a.stT += dt;
      const e = a.tgt;
      if (a.sk === 'aim') {
        if (e && e.st !== 'dead') a.face = e.x >= a.x ? 1 : -1;
        if (a.skT >= a.fireWait) {
          a.sk = 'clear'; a.skT = 0; a.snipes++;
          if (e && e.st !== 'dead') {
            SK.spawnBullet86(G, 'p', 'bullet_golden_sniper', a.x, a.y - 8, Math.atan2(e.y - 6 - (a.y - 8), e.x - a.x),
              { dmg: DMG, crit: true, spd: 28, repel: 3, owner: a, h: 8, life: 1.5, thr: 3 });
          }
        }
      } else if (a.skT >= a.clearWait) { a.sk = null; a.skCd = EVERY; a.st = 'ide'; a.stT = 0; }
      return true;
    },
    draw(ctx, G, a) {
      const e = a.tgt;
      if (a.sk !== 'aim' || !e) return;
      ctx.save(); ctx.strokeStyle = 'rgba(255,60,60,0.7)'; ctx.setLineDash([3, 3]); ctx.beginPath();
      ctx.moveTo(a.x, a.y - 8); ctx.lineTo(e.x, e.y - 6); ctx.stroke(); ctx.restore();
    }
  });
})();
