// Thú cưng pet24 (Trưởng Quan Liang): kỹ năng "Quất Roi" [LOC pet_24_skill_0_desc]: Liang ở cạnh thì tỉ lệ bạo kích của chủ +5
// [ĐO ctl.skill1_change = 5; mô tả "bạo kích +5"]. Cộng thẳng p.crit (đơn vị % như lõi), gỡ khi Liang rời xa quá 6 đv
// [ƯỚC LƯỢNG] hoặc đổi thú cưng. ctl.skill_duration 3 và hiệu ứng efxPrefab buff_critical chưa dùng (mô tả không nói theo nhịp).
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;
  const ADD = 5, NEAR = 6 * SK.PPU;
  function set(p, on) {
    const old = p._petCrit || 0, v = on ? ADD : 0;
    if (old !== v) { p.crit += v - old; p._petCrit = v; }
  }
  SK.petRegister('pet24', {
    tick(G, a, dt) {
      const p = G.player;
      if (p) set(p, Math.hypot(p.x - a.x, p.y - a.y) <= NEAR);
      return false;
    }
  });
  const gone = G => { if (G.player && (!G.pet || G.pet.id !== 'pet24')) set(G.player, false); };
  SK.on('stageEnter', gone);
  if (SK.petDebug) { const sp = SK.petDebug.spawn; SK.petDebug.spawn = id => { gone({ player: SK.G.player, pet: null }); return sp(id); }; }
})();
