// Nhập liệu: WASD/mũi tên qua SK.input, chuột trái = vung theo hướng chuột (không auto aim), cảm ứng = joystick trái + chạm vung theo hướng đang quay.
(function () {
  'use strict';
  const TT = window.TT = window.TT || {};
  const SK = window.SK, T = 16;
  const mouse = { x: 0, y: 0, seen: false };

  TT.initInput = function (hudCanvas) {
    // UI trước: TT.uiHit(x,y) (css px) trả tên hành động ('skill'|'attack'|'ui') hoặc null; TT.uiDown/Up/Cancel cho hiệu ứng nhấn và bấm nút
    SK.bindPointer(hudCanvas, (x, y) => (TT.uiHit ? TT.uiHit(x, y) : null));
    hudCanvas.addEventListener('pointerdown', e => { if (TT.uiDown) TT.uiDown(e.clientX, e.clientY); });
    hudCanvas.addEventListener('pointerup', e => { if (TT.uiUp) TT.uiUp(e.clientX, e.clientY); });
    hudCanvas.addEventListener('pointercancel', () => { if (TT.uiCancel) TT.uiCancel(); });
    const track = e => { if (e.pointerType !== 'touch') { mouse.x = e.clientX; mouse.y = e.clientY; mouse.seen = true; } };
    hudCanvas.addEventListener('pointermove', track);
    hudCanvas.addEventListener('pointerdown', track);
  };

  // góc ngắm của người chơi theo chuột (toạ độ ô), hoặc hướng quay mặt nếu là cảm ứng
  TT.aimAngle = (m, a) => {
    if (SK.input.touchMode || !mouse.seen) return a.moving ? a.aim : (a.face < 0 ? Math.PI : 0);
    const s = SK.view.scale, wx = (mouse.x / s + TT.cam.x) / T, wy = (mouse.y / s + TT.cam.y) / T;
    return Math.atan2(wy - (a.y - 0.4), wx - a.x);
  };
  TT.mouse = mouse;
  let forced = null;
  TT.forceIntent = (ux, uy) => { forced = ux == null ? null : { x: ux, y: uy || 0 }; };   // kiểm thử: bỏ qua bàn phím

  // đọc phím/chuột vào ý định của người chơi trước mỗi bước
  TT.applyInput = function (m) {
    const I = SK.input, mv = forced || I.moveVec();
    m.intent.ux = mv.x; m.intent.uy = mv.y;
    if (I.hit('attack')) m.attackReq = TT.aimAngle(m, m.human);
    if (I.hit('skill')) m.skillReq = true;
  };
})();
