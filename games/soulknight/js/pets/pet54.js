// Thú cưng pet54 (Lai Tài), kỹ năng "Thức Tỉnh Bản Tướng" [LOC pet_54_skill_0_desc]: đối mặt kẻ địch mạnh thì tạm thời đánh thức
// sức mạnh năm xưa, lộ chân thân. ctl không có số (damage 0, atkCount 1) nên toàn bộ là [ƯỚC LƯỢNG]: "kẻ địch mạnh" = tinh anh, trùm,
// hoặc máu tối đa >= 40 trong 8 đv; chân thân kéo 8 s (hồi 40 s [WIKI Pets]): thân to ×1,5, sát thương cắn ×4 (3 -> 12), đi ×1,5, cắn nhanh gấp đôi.
// Chưa có clip chân thân riêng: dùng cùng prefab phóng to + quầng sáng vàng.
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const U = SK.PPU, DUR = 8, CD = 40, SEE = 8 * U, HP_STRONG = 40, SCALE = 1.5, DMG_X = 4, SPD_X = 1.5, CD_X = 0.5;

  const strong = e => e.boss || e.elite || (e.hpMax || 0) >= HP_STRONG;
  function form(a, on) {
    a.form = on ? DUR : 0; a.scale = on ? SCALE : undefined;
    a.k.dmg = a.base.dmg * (on ? DMG_X : 1); a.k.spd = a.base.spd * (on ? SPD_X : 1); a.k.cd = a.base.cd * (on ? CD_X : 1);
    if (on) a.awakes++; else a.fCd = CD;
  }

  SK.petRegister('pet54', {
    init(G, a) { a.base = { dmg: a.k.dmg, spd: a.k.spd, cd: a.k.cd }; a.form = 0; a.fCd = 0; a.awakes = 0; },
    stage(G, a) { if (a.form > 0) form(a, false); },
    tick(G, a, dt) {
      if (a.form > 0) { a.form -= dt; if (a.form <= 0) form(a, false); return false; }
      a.fCd -= dt;
      if (a.fCd > 0) return false;
      for (const e of G.enemies) {
        if (e.st === 'spawn' || e.st === 'dead' || !strong(e) || Math.hypot(e.x - a.x, e.y - a.y) > SEE) continue;
        form(a, true); SK.num(G, a.x, a.y - 34, 'Chân thân!', '#ffd24a'); break;
      }
      return false;
    },
    draw(ctx, G, a) {
      if (a.form <= 0) return;
      ctx.save(); ctx.fillStyle = 'rgba(255,210,70,' + (0.18 + 0.08 * Math.sin(a.stT * 12)) + ')';
      ctx.beginPath(); ctx.ellipse(a.x, a.y - 10, 16, 18, 0, 0, 7); ctx.fill(); ctx.restore();
    }
  });
})();
