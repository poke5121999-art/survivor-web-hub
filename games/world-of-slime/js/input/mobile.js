// Mobile (nhánh IsStandalone() = false): MainJoystick bên trái (JoystickPack: tay cầm chạy trong bán kính = nửa nền),
// các nút bên phải là của HUD (data-act, vị trí defaultPosition của PlaySceneButtonBatch), chụm hai ngón để zoom
// (CameraController.CollectPinchTouchPositions). Độ đẩy cần = speedStep 0..10 (CODE.md §8): đẩy nhẹ thì đi chậm.
export function attachMobile(intent, root, hud, { onPinch } = {}) {
  const E = hud.el;
  let joyId = null, cx = 0, cy = 0, R = 1;
  const setHandle = (dx, dy) => { E.joyHandle.style.transform = `translate(${dx / hud.s}px, ${-dy / hud.s}px)`; };
  const joyMove = t => {
    let dx = t.clientX - cx, dy = t.clientY - cy; const l = Math.hypot(dx, dy);
    if (l > R) { dx *= R / l; dy *= R / l; }
    setHandle(dx, -dy);
    intent.move.x = dx / R; intent.move.y = -dy / R; intent.source = 'touch';
  };
  E.joyArea.addEventListener('touchstart', e => {
    for (const t of e.changedTouches) {
      if (joyId !== null) break;
      joyId = t.identifier;
      const r = E.joyBg.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; R = r.width / 2;
      joyMove(t);
    }
    e.preventDefault();
  }, { passive: false });
  addEventListener('touchmove', e => {
    if (joyId === null) return;
    for (const t of e.changedTouches) if (t.identifier === joyId) joyMove(t);
    e.preventDefault();
  }, { passive: false });
  const joyEnd = e => {
    for (const t of e.changedTouches) if (t.identifier === joyId) { joyId = null; setHandle(0, 0); intent.move.x = intent.move.y = 0; }
  };
  addEventListener('touchend', joyEnd); addEventListener('touchcancel', joyEnd);

  // nút HUD (data-act) nhận pointerdown, Chrome phát pointer cho cả cảm ứng nên không cần touchstart riêng

  // chụm zoom: hai ngón trên vùng trống (không phải cần/nút)
  const pinch = new Map(); let lastD = 0;
  root.addEventListener('touchstart', e => {
    for (const t of e.changedTouches) pinch.set(t.identifier, t);
    if (pinch.size === 2) { const [a, b] = [...pinch.values()]; lastD = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }
  }, { passive: true });
  root.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) if (pinch.has(t.identifier)) pinch.set(t.identifier, t);
    if (pinch.size === 2) {
      const [a, b] = [...pinch.values()]; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (lastD > 0 && onPinch) onPinch(lastD / d);
      lastD = d;
    }
  }, { passive: true });
  const pend = e => { for (const t of e.changedTouches) pinch.delete(t.identifier); if (pinch.size < 2) lastD = 0; };
  root.addEventListener('touchend', pend); root.addEventListener('touchcancel', pend);
}
