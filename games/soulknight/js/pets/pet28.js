// Thú cưng pet28 (Tailang): "Hành lý" — chủ động thu thập nguyên liệu gần đó giúp bạn.
// [LOC pet_28_skill_0_desc]. Nguyên liệu = đồ rơi kiểu 'material' (js/drops.js). Thú cưng chạy tới món gần nhất trong 10 đv
// quanh chủ [ƯỚC LƯỢNG], chạm tới thì nhặt vào kho hồ sơ như chủ nhặt (SK.pickupKinds.material.take), không cắn khi đang đi nhặt.
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const U = SK.PPU, RANGE = 10 * U, TAKE = 6;

  SK.petRegister('pet28', {
    init(G, a) { a.picked = 0; },
    tick(G, a, dt) {
      const p = G.player, M = SK.pickupKinds.material;
      if (!M || !p || p.st === 'dead' || a.st === 'atk') return false;
      let best = null, bd = 1e9;
      for (const k of G.pickups) {
        if (k.kind !== 'material' || k.gone || k.t < 0.4) continue;
        if (Math.hypot(k.x - p.x, k.y - p.y) > RANGE) continue;
        const d = Math.hypot(k.x - a.x, k.y - a.y);
        if (d < bd) { best = k; bd = d; }
      }
      if (!best) return false;
      a.stT += dt; a.cd -= dt; a.target = null;
      if (bd <= TAKE) { if (M.take(G, p, best)) { best.gone = true; a.picked++; SK.emit('pickup', G, best.kind); } if (a.st !== 'ide') { a.st = 'ide'; a.stT = 0; } return true; }
      const dx = best.x - a.x, dy = best.y - a.y, s = Math.min(bd, a.k.spd * dt);
      SK.moveBox(G.map, a, dx / bd * s, dy / bd * s, 3);
      if (Math.abs(dx) > 1) a.face = dx > 0 ? 1 : -1;
      if (a.st !== 'run') { a.st = 'run'; a.stT = 0; }
      return true;
    }
  });
})();
