/*
 * Điều khiển: bàn phím (WASD/mũi tên, Space tương tác, giữ E vòng chọn năng lực, Tab/I khoang, Esc tạm dừng), chuột (giữ trái kéo
 * xoay camera, chuột phải dùng năng lực, nút giữa về sau lái, lăn chuột zoom), cảm ứng (cần ảo bên trái, nút bên phải, kéo nửa phải
 * để xoay camera; chạm ô năng lực = dùng, chạm nhãn vòng chọn = mở/đóng), tay cầm (tuỳ chọn).
 * Năng lực theo DredgeControlBindings.cs:288-290, 333-335: RadialSelectShow = E / LB, DoAbility = chuột phải / Action3 (X),
 *   Confirm (chuột trái) khi vòng chọn mở = đóng vòng; RadialSelect = cần phải. ToggleCargo tay cầm = Action4 (Y).
 *   Phím L của bản gốc là Bách khoa (chưa có trên web): không còn bật đèn — đèn là năng lực Lights (js/abilities.js).
 *   DRInput.axes() → { x: rẽ −1..1 (phải = +), y: ga −1..1 }
 *   DRInput.on('interact' | 'interactUp' | 'cargo' | 'pause', fn)
 */
(function (root) {
  'use strict';
  const I = root.DRInput = { keys: new Set(), stick: { x: 0, y: 0, id: null }, pad: { x: 0, y: 0, cx: 0, cy: 0 }, touch: false };
  const fns = {};
  I.on = (ev, fn) => { (fns[ev] = fns[ev] || []).push(fn); };
  const fire = ev => { for (const fn of fns[ev] || []) fn(); };

  const typing = e => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };
  // Phím do UI agent dùng khi có cửa sổ mở thì để yên (Esc đóng cửa sổ, Tab đổi tab...).
  const uiOpen = () => root.DR && (DR.mode === 'cargo' || DR.mode === 'harvest');
  const AB = () => root.DRAbilities || null;

  root.addEventListener('keydown', e => {
    if (typing(e)) return;
    I.keys.add(e.code);
    if (e.repeat) return;
    switch (e.code) {
      case 'Space': e.preventDefault(); fire('interact'); break;
      case 'KeyE': if (AB()) AB().radialDown(); break;
      case 'Tab': case 'KeyI': if (!uiOpen()) { e.preventDefault(); fire('cargo'); } break;
      case 'Escape': if (!uiOpen() && !(AB() && AB().back())) fire('pause'); break;
      case 'KeyM': fire('mute'); break;
    }
  });
  root.addEventListener('keyup', e => {
    I.keys.delete(e.code);
    if (e.code === 'Space') fire('interactUp');
    if (e.code === 'KeyE' && AB()) AB().radialUp();
  });
  root.addEventListener('blur', () => {
    I.keys.clear();
    if (AB()) { AB().radialUp(); AB().abilityUp(); }
  });

  function axes() {
    const k = I.keys;
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    if (I.stick.id !== null) { x = I.stick.x; y = I.stick.y; }
    pollPad();
    if (Math.abs(I.pad.x) > Math.abs(x)) x = I.pad.x;
    if (Math.abs(I.pad.y) > Math.abs(y)) y = I.pad.y;
    return { x, y };
  }

  // ---- chuột: giữ nút trái kéo để xoay camera (CameraMoveButton = Mouse.LeftButton, chế độ cameraFreelook 0 của bản gốc),
  //      nút giữa về sau lái (CameraRecenter = Mouse.MiddleButton), lăn zoom ----
  // [ĐỀ XUẤT] bản PC mặc định cameraFreelook 1 (rê chuột không cần giữ nút); trên web cần khoá con trỏ, vướng UI khoang hàng
  let drag = null;
  function bindMouse(el) {
    el.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse') return;
      if (e.button === 1) { if (root.DRCamera) DRCamera.recenter(); e.preventDefault(); return; }
      if (e.button !== 0) return;
      // Confirm khi vòng chọn mở: đóng vòng (AbilityRadial.ToggleRadial); ống nhòm đang bật thì chuột trái không kéo camera thường
      if (AB() && AB().radialConfirm()) { e.preventDefault(); return; }
      if (AB() && AB().spyglassActive) return;
      drag = { x: e.clientX, y: e.clientY };
      if (root.DRCamera && DRCamera.hold) DRCamera.hold(true);
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', e => {
      if (!drag || e.pointerType !== 'mouse') return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY };
      if (root.DRCamera) DRCamera.look(dx, dy);
    });
    const up = () => { drag = null; if (root.DRCamera && DRCamera.hold) DRCamera.hold(false); };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', e => { if (root.DRCamera) DRCamera.zoom(Math.sign(e.deltaY) * 0.08); e.preventDefault(); }, { passive: false });
    el.addEventListener('contextmenu', e => e.preventDefault());
    // chuột phải = DoAbility; mousedown/mouseup bắn riêng cho từng nút (pointerdown không bắn khi nút trái đang giữ)
    el.addEventListener('mousedown', e => { if (e.button === 2 && AB()) { e.preventDefault(); AB().abilityDown(); } });
    root.addEventListener('mouseup', e => { if (e.button === 2 && AB()) AB().abilityUp(); });
  }

  // ---- cảm ứng ----
  let ui = null, camTouch = null;
  function buildTouch() {
    if (ui) return;
    I.touch = true;
    ui = document.getElementById('dr-touch');
    if (!ui) return;
    ui.innerHTML = '<div class="joy"><i></i></div><div class="tbtns">' +
      '<button data-a="interact" class="big">Tương tác</button><button data-a="cargo">Khoang</button><button data-a="pause">II</button></div>';
    ui.classList.add('on');
    for (const btn of ui.querySelectorAll('button')) {
      btn.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); fire(btn.dataset.a); }, { passive: false });
      btn.addEventListener('touchend', e => { e.preventDefault(); if (btn.dataset.a === 'interact') fire('interactUp'); }, { passive: false });
    }
  }
  const R = 60; // bán kính cần ảo (px)
  function bindTouch(el) {
    el.addEventListener('touchstart', e => {
      buildTouch();
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth * 0.45 && I.stick.id === null) {
          I.stick = { x: 0, y: 0, id: t.identifier, ox: t.clientX, oy: t.clientY };
          const j = ui && ui.querySelector('.joy');
          if (j) { j.style.left = (t.clientX - R) + 'px'; j.style.top = (t.clientY - R) + 'px'; j.classList.add('on'); }
        } else if (camTouch === null) camTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
      e.preventDefault();
    }, { passive: false });
    el.addEventListener('touchmove', e => {
      for (const t of e.changedTouches) {
        if (t.identifier === I.stick.id) {
          let dx = (t.clientX - I.stick.ox) / R, dy = (t.clientY - I.stick.oy) / R;
          const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
          I.stick.x = Math.abs(dx) < 0.15 ? 0 : dx; I.stick.y = Math.abs(dy) < 0.15 ? 0 : -dy;
          const k = ui && ui.querySelector('.joy i');
          if (k) k.style.transform = 'translate(' + (dx * R * 0.6) + 'px,' + (dy * R * 0.6) + 'px)';
        } else if (camTouch && t.identifier === camTouch.id) {
          if (root.DRCamera) DRCamera.look(t.clientX - camTouch.x, t.clientY - camTouch.y);
          camTouch.x = t.clientX; camTouch.y = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });
    const end = e => {
      for (const t of e.changedTouches) {
        if (t.identifier === I.stick.id) {
          I.stick = { x: 0, y: 0, id: null };
          const j = ui && ui.querySelector('.joy'); if (j) { j.classList.remove('on'); j.querySelector('i').style.transform = ''; }
        }
        if (camTouch && t.identifier === camTouch.id) camTouch = null;
      }
    };
    el.addEventListener('touchend', end); el.addEventListener('touchcancel', end);
  }

  // ---- tay cầm ----
  const prevBtn = {};
  function pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = pads && [...pads].find(Boolean);
    if (!p) { I.pad.x = I.pad.y = 0; if (root.DRCamera && DRCamera.stick) DRCamera.stick(0, 0); return; }
    const dz = v => Math.abs(v) < 0.18 ? 0 : v;
    I.pad.x = dz(p.axes[0] || 0); I.pad.y = -dz(p.axes[1] || 0);
    const rt = p.buttons[7] ? p.buttons[7].value : 0, lt = p.buttons[6] ? p.buttons[6].value : 0;
    if (rt || lt) I.pad.y = rt - lt;
    const cx = dz(p.axes[2] || 0), cy = dz(p.axes[3] || 0);
    // cần phải: giá trị −1..1 như trục InControl (RightStick*), nhân maxSpeed·dt trong DRCamera
    // vòng chọn mở: cần phải là RadialSelect (góc chọn nêm) thay vì xoay camera
    const radial = AB() && AB().radialOpen;
    if (radial) AB().radialStick(cx, -cy);
    if (root.DRCamera && DRCamera.stick) DRCamera.stick(radial ? 0 : cx, radial ? 0 : cy);
    // giữ nút: 4 = LB (RadialSelectShow), 2 = X (Action3, DoAbility)
    for (const [i, dn, upFn] of [[4, 'radialDown', 'radialUp'], [2, 'abilityDown', 'abilityUp']]) {
      const down = !!(p.buttons[i] && p.buttons[i].pressed);
      if (AB() && down !== !!prevBtn[i]) AB()[down ? dn : upFn]();
      prevBtn[i] = down;
    }
    const map = { 0: 'interact', 3: 'cargo', 9: 'pause' };
    for (const [i, ev] of Object.entries(map)) {
      const down = !!(p.buttons[i] && p.buttons[i].pressed);
      if (down && !prevBtn[i]) fire(ev);
      if (!down && prevBtn[i] && ev === 'interact') fire('interactUp');
      prevBtn[i] = down;
    }
  }

  function bind(el) { bindMouse(el); bindTouch(el); }
  Object.assign(I, { axes, bind, fire });
})(window);
