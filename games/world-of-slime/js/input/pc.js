// PC: WASD/mũi tên đi, giữ Shift chạy, Space dash, chuột trái đánh theo hướng chuột, Q/E/R skill, F tương tác,
// T huýt sáo gọi slime. Bảng phím theo việc được giao cho lát cắt này. Game gốc (SMActions, CODE.md §9) khác:
// LShift = dash + Slot1, Space = tương tác/đánh, C = đổi. Ghi lại để chỉnh khi chủ dự án chốt.
export function attachPC(intent, canvas, { onWheel } = {}) {
  const keys = new Set();
  const press = { Space: 'dash', KeyQ: 'skill0', KeyE: 'skill1', KeyR: 'skill2', KeyF: 'interact', KeyT: 'whistle' };
  const update = () => {
    const x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const y = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const l = Math.hypot(x, y) || 1;
    intent.move.x = x / l; intent.move.y = y / l;
    intent.run = keys.has('ShiftLeft') || keys.has('ShiftRight');
    intent.dash = keys.has('Space');
    intent.skill = [keys.has('KeyQ'), keys.has('KeyE'), keys.has('KeyR')];
    intent.interact = keys.has('KeyF');
    intent.whistle = keys.has('KeyT');
  };
  addEventListener('keydown', e => {
    if (/^(Arrow|Space)/.test(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code); intent.source = 'pc';
    if (press[e.code]) intent.pressed.add(press[e.code]);
    update();
  });
  addEventListener('keyup', e => { keys.delete(e.code); update(); });
  addEventListener('blur', () => { keys.clear(); update(); });
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    intent.attack = true; intent.pressed.add('attack'); intent.source = 'pc';
  });
  addEventListener('pointerup', e => { if (e.button === 0) intent.attack = false; });
  canvas.addEventListener('pointermove', e => { intent.mouse = { x: e.clientX, y: e.clientY }; });
  // CameraController: wheelZoomStep, WheelNotchValue = 120 (một nấc chuột = 120)
  canvas.addEventListener('wheel', e => { e.preventDefault(); onWheel && onWheel(e.deltaY / 120); }, { passive: false });
}
