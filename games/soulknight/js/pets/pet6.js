// Thú cưng pet6 (Benben), kỹ năng "Lông Xù Xù" [LOC pet_6_skill_0_desc]: ở cạnh chủ thì độ chính xác vũ khí +5.
// Độ chính xác trong web = độ lệch đạn `spread` (độ, thẻ vũ khí hiển thị "accurate"), nên +5 = giảm spread 5 độ (tối thiểu 0).
// (ctl skill1_change -50 attr 7 [ĐO] không rõ đơn vị, theo mô tả chính thức +5.) Chỉ hiệu lực khi thú cưng trong 6 đv quanh chủ
// [ƯỚC LƯỢNG "ở cạnh"]; vũ khí đang cầm được thay def bằng bản sao đã giảm spread (w._pet6 giữ def gốc), trả lại khi xa/ải mới.
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const ACC = 5, NEAR = 6 * SK.PPU;
  function weapons(p) { return (p.weapons || []).concat(p.extraW ? [p.extraW] : []).filter(Boolean); }
  function release(p) { for (const w of weapons(p)) if (w._pet6) { w.def = w._pet6; w._pet6 = null; } }
  SK.petRegister('pet6', {
    tick(G, a) {
      const p = G.player;
      if (!p) return false;
      const near = p.st !== 'dead' && !a.hidden && Math.hypot(p.x - a.x, p.y - a.y) <= NEAR;
      if (!near) { release(p); return false; }
      for (const w of weapons(p)) {
        if (w._pet6 || !w.def) continue;
        w._pet6 = w.def;
        w.def = Object.assign({}, w.def, { spread: Math.max(0, (w.def.spread || 0) - ACC) });
      }
      return false;
    },
    stage(G) { if (G.player) release(G.player); }
  });
})();
