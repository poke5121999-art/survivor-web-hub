// Thú cưng pet16 (Thiên Cẩu Nhỏ): kỹ năng "Trạng Thái Tengu" [LOC pet_16_skill_0_desc]: trong chiến đấu thỉnh thoảng hoá Đại
// Thiên Cẩu, lao tới quái gần nhất rồi tung cú đấm mạnh (clip "atk skill1" của prefab). Số: damage 3 [ĐO ctl.damage] nhân 4 cho cú đấm
// [ƯỚC LƯỢNG], quét tròn 2,5 đv, đẩy lùi 6; hồi chiêu 16 s [WIKI Pets]; phóng to 1,8 lần khi hoá thân [ƯỚC LƯỢNG].
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const U = SK.PPU, W = SK.world;
  const PUNCH_K = 4, RADIUS = 2.5 * U, SEEK = 9 * U, BIG = 1.8, PUNCH_AT = 0.3, CD = 16;
  const clipOf = a => a.anim['atk skill1'] || a.anim.atk;
  function foe(G, a) {
    let best = null, bd = SEEK;
    for (const e of G.enemies) {
      if (e.st === 'spawn' || e.st === 'dead') continue;
      const d = Math.hypot(e.x - a.x, e.y - a.y);
      if (d < bd && W.los(G.map, a.x, a.y - 4, e.x, e.y - 4)) { best = e; bd = d; }
    }
    return best;
  }
  SK.petRegister('pet16', {
    init(G, a) { a.tg = { cd: CD, mode: 0, t: 0, hit: false }; },
    tick(G, a, dt) {
      const t = a.tg, p = G.player;
      if (!p || p.st === 'dead') { a.scale = 1; t.mode = 0; return false; }
      if (t.mode === 0) {
        a.scale = 1;
        t.cd -= dt;
        if (t.cd > 0) return false;
        const e = foe(G, a);
        if (!e) { t.cd = 0; return false; }   // chưa có quái thì chờ, thấy quái là hoá thân
        t.mode = 1; t.t = 0; t.e = e; t.hit = false; a.scale = BIG; a.cd = 1;
        SK.vfx.spawn(G, 'hit_white', a.x, a.y - 8, { scale: 2 });
        return true;
      }
      t.t += dt; a.stT += dt;
      const e = t.e;
      if (t.mode === 1) {   // lao tới
        if (!e || e.st === 'dead' || t.t > 3) { t.mode = 0; t.cd = CD; a.scale = 1; a.st = 'ide'; a.stT = 0; return true; }
        const dx = e.x - a.x, dy = e.y - a.y, d = Math.hypot(dx, dy);
        if (d <= 1.4 * U) { t.mode = 2; t.t = 0; a.face = dx >= 0 ? 1 : -1; a.st = 'atk skill1'; a.stT = 0; return true; }
        const s = Math.min(d, a.k.spd * 1.6 * dt);
        SK.moveBox(G.map, a, dx / d * s, dy / d * s, 3);
        a.face = dx >= 0 ? 1 : -1; if (a.st !== 'run') { a.st = 'run'; a.stT = 0; }
        return true;
      }
      // đấm
      if (!t.hit && t.t >= PUNCH_AT) {
        t.hit = true;
        const dmg = Math.round(a.k.dmg * PUNCH_K);
        for (const q of G.enemies.slice()) {
          if (q.st === 'dead' || q.st === 'spawn') continue;
          if (Math.hypot(q.x - a.x, q.y - a.y) <= RADIUS) SK.hurtEnemy(G, q, dmg, false, Math.atan2(q.y - a.y, q.x - a.x), 6);
        }
        G.shake = Math.max(G.shake, 3);
        SK.vfx.spawn(G, 'explode_s', a.x + a.face * 10, a.y - 8, { state: 'explode_small' });
        t.dealt = dmg;
      }
      if (t.t >= Math.max(PUNCH_AT + 0.1, SK.animLen(clipOf(a)))) { t.mode = 0; t.cd = CD; a.scale = 1; a.st = 'ide'; a.stT = 0; }
      return true;
    }
  });
})();
