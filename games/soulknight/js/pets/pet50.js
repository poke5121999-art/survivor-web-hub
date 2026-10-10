// Thú cưng pet50 (Tháp Phòng Ngọc Trai), kỹ năng "Màn Trình Diễn Laser" [LOC pet_50_skill_0_desc]: mỗi 30 giây vào chế độ Tháp Phòng
// Thủ, đứng yên bắn một vòng tia laser xoay quanh. 30 giây là [LOC, khớp WIKI Pets]. Còn lại [ƯỚC LƯỢNG]: 4 tia, quay 100 độ/s, dài 9 đv, kéo dài 6 s,
// mỗi tia 3 sát thương cho mỗi 0,25 s với mỗi kẻ địch (ctl.damage = 0 nên không có số gốc). Tia dừng ở tường. Tự vẽ tia (đạn gốc là
// tia tức thì, chưa lộ ra ngoài actors.js). Hoạt ảnh dùng clip skill thật của prefab.
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const U = SK.PPU, W = SK.world, EVERY = 30, DUR = 6, BEAMS = 4, ROT = 100 * Math.PI / 180, LEN = 9 * U, DMG = 3, TICK = 0.25;

  const foes = G => G.enemies.filter(e => e.st !== 'spawn' && e.st !== 'dead');
  function beamLen(G, a, ang) {
    let l = 0;
    while (l < LEN) { l += 4; if (W.solidAt(G.map, a.x + Math.cos(ang) * l, a.y + Math.sin(ang) * l)) return l - 4; }
    return LEN;
  }
  function beamAngles(a) { const r = []; for (let i = 0; i < BEAMS; i++) r.push(a.rot + i * 2 * Math.PI / BEAMS); return r; }

  SK.petRegister('pet50', {
    init(G, a) { a.turCd = EVERY; a.turT = 0; a.rot = 0; a.hitT = 0; a.laserHits = 0; a.turrets = 0; },
    tick(G, a, dt) {
      if (a.turT <= 0) {
        a.turCd -= dt;
        if (a.turCd > 0 || !foes(G).length) return false;
        a.turT = DUR; a.turCd = EVERY; a.hitT = 0; a.turrets++;
        a.st = 'pet_50_skin_0_skill'; a.stT = 0;
      }
      a.turT -= dt; a.stT += dt; a.rot += ROT * dt; a.hitT -= dt;
      if (a.hitT <= 0) {
        a.hitT = TICK;
        const ang = beamAngles(a), len = ang.map(t => beamLen(G, a, t));
        for (const e of foes(G)) {
          for (let i = 0; i < BEAMS; i++) {
            const dx = e.x - a.x, dy = e.y - 6 - a.y, c = Math.cos(ang[i]), s = Math.sin(ang[i]);
            const t = dx * c + dy * s, d = Math.abs(-dx * s + dy * c);
            if (t > 0 && t <= len[i] + (e.r || 6) && d <= (e.r || 6) + 3) { if (SK.hurtEnemy(G, e, DMG, false, ang[i], 0)) a.laserHits++; break; }
          }
        }
      }
      if (a.turT <= 0) { a.st = 'ide'; a.stT = 0; }
      return true;
    },
    draw(ctx, G, a) {
      if (a.turT <= 0) return;
      ctx.save(); ctx.lineCap = 'round';
      for (const t of beamAngles(a)) {
        const l = beamLen(G, a, t), x2 = a.x + Math.cos(t) * l, y2 = a.y + Math.sin(t) * l;
        ctx.strokeStyle = 'rgba(90,220,255,0.55)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(a.x, a.y - 6); ctx.lineTo(x2, y2 - 6); ctx.stroke();
        ctx.strokeStyle = '#eaffff'; ctx.lineWidth = 2; ctx.stroke();
      }
      ctx.restore();
    }
  });
})();
