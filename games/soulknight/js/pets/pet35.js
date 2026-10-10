// Thú cưng pet35 (Mèo Thất Lạc / Rosemary Cat): "Mèo Của Schrödinger" — sau khi chủ dùng kỹ năng nhân vật, mèo đổi hình thái
// và giúp hồi khiên HOẶC năng lượng [LOC pet_35_skill_0_desc]. Mỗi lần dùng kỹ năng tung đồng xu: hình A hồi 1 khiên,
// hình B (ma) hồi 5 năng lượng, hình A (xương) hồi 1 khiên, hồi chiêu 3 s [WIKI Pets]; prefab không có clip hình thái nên chỉ nảy + đổi sắc nhẹ). Dùng sự kiện 'skill' của lõi.
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const ARMOR = 1, ENERGY = 5, CD = 3;   // [WIKI Pets]

  SK.on('skill', (G, p) => {
    const a = G.pet;
    if (!a || a.id !== 'pet35' || !p || p.st === 'dead' || a.cdT > 0) return;
    a.cdT = CD;
    a.form = SK.rand() < 0.5 ? 'armor' : 'energy';
    a.formT = 1.2;
    a.casts++;
    if (a.form === 'armor') { const b = p.armor; p.armor = Math.min(p.armorMax, p.armor + ARMOR); a.gainArmor += p.armor - b; }
    else { const b = p.energy; p.energy = Math.min(p.energyMax, p.energy + ENERGY); a.gainEnergy += p.energy - b; }
    SK.num(G, p.x, p.y - 20, a.form === 'armor' ? '+' + ARMOR : '+' + ENERGY, a.form === 'armor' ? '#d0d0d0' : '#4aa8ff', false);
  });

  SK.petRegister('pet35', {
    init(G, a) { a.cdT = 0; a.form = null; a.formT = 0; a.casts = 0; a.gainArmor = 0; a.gainEnergy = 0; },
    tick(G, a, dt) {
      if (a.cdT > 0) a.cdT -= dt;
      if (a.formT > 0) { a.formT -= dt; a.scale = 1 + 0.25 * Math.sin(Math.max(0, a.formT) / 1.2 * Math.PI); if (a.formT <= 0) a.scale = 1; }
      return false;
    },
    draw(ctx, G, a) {
      if (!(a.formT > 0)) return;
      ctx.save(); ctx.globalAlpha = Math.min(1, a.formT) * 0.8; ctx.fillStyle = a.form === 'armor' ? '#d8d8d8' : '#4aa8ff';
      ctx.beginPath(); ctx.arc(a.x, a.y - 22 - (1.2 - a.formT) * 6, 2.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  });
})();
