// Thú cưng pet8 (Tap): "Nhấp Nhấp" — khi bị nhấp vào, HP hiện tại của Pet +1 [LOC pet_8_skill_0_desc].
// HP riêng của pet: a.hp / a.hpMax (hpMax = [ĐO RoleAttributePet.max_hp] 10). Web chưa có sát thương lên pet nên HP chỉ tăng;
// mô tả không nói trần nên +1 không bị chặn ở hpMax [ƯỚC LƯỢNG]. Nhấp = pointerdown trên màn chơi trúng hộp thân pet.
(function () {
  'use strict';
  const SK = window.SK;
  if (!SK || !SK.petRegister) return;

  const HIT_X = 12, HIT_UP = 22, HIT_DN = 4;   // hộp nhấp quanh chân pet (px) [ƯỚC LƯỢNG]
  let bound = false;

  function tap(G, a) {
    a.hp += 1; a.taps = (a.taps || 0) + 1; a.tapT = 0.4;
    SK.num(G, a.x, a.y - 24, '+1', '#6cff6c');
    if (SK.vfx && window.SK_VFX && SK_VFX.effects.fx_heal) SK.vfx.spawn(G, 'fx_heal', a.x, a.y - 8, {});
  }

  function bind() {
    if (bound) return; bound = true;
    const hud = document.getElementById('sk-hud');
    if (!hud) { bound = false; return; }
    hud.addEventListener('pointerdown', e => {
      const G = SK.G, a = G && G.pet;
      if (!a || a.id !== 'pet8' || !G.view) return;
      const r = hud.getBoundingClientRect(), v = SK.view;
      const wx = G.view.x + (e.clientX - r.left) * v.w / r.width, wy = G.view.y + (e.clientY - r.top) * v.h / r.height;
      if (Math.abs(wx - a.x) <= HIT_X && wy >= a.y - HIT_UP && wy <= a.y + HIT_DN) tap(G, a);
    }, true);
  }

  SK.petRegister('pet8', {
    init(G, a) {
      const at = (a.info && a.info.attr) || {};
      a.hpMax = at.max_hp || 10; a.hp = a.hpMax; a.taps = 0;
      bind();
    },
    tick(G, a, dt) { if (a.tapT > 0) a.tapT -= dt; return false; },
    draw(ctx, G, a) {
      if (!(a.tapT > 0)) return;
      SK.text(ctx, 'HP ' + a.hp, a.x, a.y - 26 - (0.4 - a.tapT) * 10, 7, '#6cff6c', 'center', 'rgba(0,0,0,0.9)');
    }
  });
})();
