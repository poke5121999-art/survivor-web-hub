// Điều khiển: bàn phím và cảm ứng ghi chung một Intent cho xe người chơi.
// Như Zing Speed Mobile, xe tự tăng ga; người chơi chỉ lái, drift, phun, phanh.
// Phím: ←/→ hoặc A/D lái, Shift drift, Space hoặc Ctrl phun, ↓/S phanh, R hồi về đường, Esc/P tạm dừng.
// Cảm ứng: nút lấy hình chữ nhật từ provider (bố cục operatingmode_oneside / twoside của HUD gốc), đa chạm bằng pointer events.
(function (TD) {
  'use strict';
  const I = { keys: {}, touch: {}, pointers: new Map(), rects: null, nitroQ: 0, resetQ: 0, pauseQ: 0, enabled: true, lastSrc: 'key' };

  const DRIFT = ['ShiftLeft', 'ShiftRight'], NITRO = ['Space', 'ControlLeft', 'ControlRight'];
  const LEFT = ['ArrowLeft', 'KeyA'], RIGHT = ['ArrowRight', 'KeyD'], BRAKE = ['ArrowDown', 'KeyS'];
  const any = (codes) => codes.some((c) => I.keys[c]);

  I.bind = function (el) {
    addEventListener('keydown', (e) => {
      if (e.repeat) { if (NITRO.includes(e.code) || e.code === 'Space') e.preventDefault(); return; }
      I.keys[e.code] = true; I.lastSrc = 'key';
      if (NITRO.includes(e.code)) I.nitroQ++;
      if (e.code === 'KeyR') I.resetQ++;
      if (e.code === 'Escape' || e.code === 'KeyP') I.pauseQ++;
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      if (TD.audio) TD.audio.unlock();
    });
    addEventListener('keyup', (e) => { I.keys[e.code] = false; });
    addEventListener('blur', () => { I.keys = {}; I.pointers.clear(); I.touch = {}; });
    const down = (e) => {
      if (TD.audio) TD.audio.unlock();
      if (e.pointerType === 'mouse' && !I.rects) return;
      const id = I.hit(e.clientX, e.clientY);
      if (!id) return;
      e.preventDefault();
      I.lastSrc = 'touch';
      I.pointers.set(e.pointerId, id);
      if (id === 'nitro') I.nitroQ++;
      if (id === 'reset') I.resetQ++;
      if (id === 'pause') I.pauseQ++;
      I.recount();
    };
    const move = (e) => {
      if (!I.pointers.has(e.pointerId)) return;
      const id = I.hit(e.clientX, e.clientY);
      const was = I.pointers.get(e.pointerId);
      // Trượt ngón giữa nút trái và phải đổi hướng ngay, như cần gạt hai bên của bản gốc.
      if (id && id !== was && (id === 'left' || id === 'right') && (was === 'left' || was === 'right')) { I.pointers.set(e.pointerId, id); I.recount(); }
    };
    const up = (e) => { if (I.pointers.delete(e.pointerId)) I.recount(); };
    el.addEventListener('pointerdown', down, { passive: false });
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  };

  I.recount = function () {
    I.touch = {};
    for (const id of I.pointers.values()) I.touch[id] = true;
  };

  // rects: () => [{ id, x, y, w, h }] theo pixel CSS; null khi không có nút cảm ứng trên màn (sảnh, kết quả).
  I.setRects = function (fn) { I.rects = fn; };
  I.hit = function (x, y) {
    if (!I.rects) return null;
    let best = null, bd = 1e9;
    for (const r of I.rects()) {
      const pad = Math.min(r.w, r.h) * 0.18;
      if (x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad) {
        const d = Math.hypot(x - (r.x + r.w / 2), y - (r.y + r.h / 2));
        if (d < bd) { bd = d; best = r.id; }
      }
    }
    return best;
  };

  // Ghi vào kart.input; nitro là xung (mỗi lần bấm một lần), các nút khác là trạng thái giữ.
  I.apply = function (input) {
    const t = I.touch;
    const l = any(LEFT) || t.left, r = any(RIGHT) || t.right;
    input.steer = (r ? 1 : 0) - (l ? 1 : 0);
    input.drift = !!(any(DRIFT) || t.drift);
    input.brake = !!(any(BRAKE) || t.brake);
    input.throttle = input.brake ? 0 : 1;
    input.nitro = I.nitroQ > 0;
    I.nitroQ = 0;
  };
  I.takeReset = function () { const v = I.resetQ > 0; I.resetQ = 0; return v; };
  I.takePause = function () { const v = I.pauseQ > 0; I.pauseQ = 0; return v; };
  I.isTouch = function () { return matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window; };

  TD.input = I;
})(globalThis.TD = globalThis.TD || {});
