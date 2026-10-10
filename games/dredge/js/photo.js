/*
 * Chế độ chụp ảnh của năng lực Máy ảnh (W9, WORLD-GAPS.md §6). Theo CameraAbility.cs (+ PlayerContainer.prefab: CameraAbilityCam,
 * Game.unity: PhotoModeCanvas, DredgeControlBindings.cs:565-632):
 *   - Chọn "camera" trên vòng năng lực, chuột phải (X tay cầm) = Activate: tắt Game canvas (HUD), bật PhotoModeCanvas (4 góc khung +
 *     2 đường dọc + 2 đường ngang chia ba), Time.timeScale = 0, bàn phím chuyển sang lớp PHOTO_MODE.
 *   - Camera tự do "CameraAbilityCam" (CinemachineVirtualCamera ưu tiên 11, m_InheritPosition = 1: bắt đầu đúng chỗ camera thuyền đang đứng;
 *     Aim = CinemachinePOV, chuột nhìn quanh: ngang −180..180 vòng, dọc −90..90; FOV 40, Dutch 0 mỗi lần vào = ResetCamera).
 *       W/S tiến/lùi theo hướng nhìn · A/D sang ngang · Q lên / E xuống (trục Y thế giới) · ← → xoay máy (rollSensitivity 15 °/s, ±45°)
 *       ↑ ↓ thu phóng (zoomSensitivity 10 °/s, FOV 20..60) · T bật/tắt khung · F chụp (Interact) · chuột phải / Esc thoát.
 *     panSensitivity 5 m/s; RestrictMovement: vị trí cục bộ so với thuyền bị kẹp trong confinementRadius 25 m, độ cao ≥ floorHeight 1,5 m
 *     (giá trị đọc từ DR_BOAT.physics.abilities.CameraAbility, nguồn PlayerContainer.prefab). Mọi trục tính theo giờ thật (unscaledDeltaTime).
 *   - Chụp (DoTakePhoto): chờ 0,25 s giờ thật, chụp màn hình, phát ngẫu nhiên một trong 3 tiếng "Camera Ability - Capture". Bản gốc giao cho
 *     Steam; bản web lưu PNG tải về (khung ngắm đang bật thì nằm trong ảnh, như ảnh chụp màn hình của bản gốc).
 *   - Thoát (Deactivate): bật lại HUD, Time.timeScale = 1, camera trộn về camera thuyền theo m_DefaultBlend của CinemachineBrain
 *     (Custom 2 s, đường cong (0,0) (0,304; 0,357) (1,1): Main Camera Blends không có dòng nào cho CameraAbilityCam).
 *   DRPhoto.state()  DRPhoto.shoot()  DRPhoto.toggleOverlay()  DRPhoto.active  DRPhoto.shots
 * [ĐỀ XUẤT] bản web: con lăn chuột cũng thu phóng; nút trên màn hình cho cảm ứng; âm thanh không bị tạm dừng (AudioListener.pause).
 */
(function (root) {
  'use strict';
  const T = root.THREE, D = root.DR, B = root.DR_BOAT;
  if (!T || !D || !B || !root.DRAbilities || !root.DRCamera) return;
  const CA = B.physics.abilities.CameraAbility;                    // panSensitivity 5, rollSensitivity 15, ±45, zoom 10, 20..60, floor 1,5, radius 25
  const DEG = Math.PI / 180;
  const FOV0 = 40;                                                 // CameraAbilityCam m_Lens.FieldOfView
  const POV_SPEED = 200 * 0.5;                                     // CameraSensitivitySettingResponder: baseSensitivity 200 × cameraSensitivity 0,5
  const MOUSE_SCALE = 0.05 / 60;                                   // InControl 0,05/px, chuẩn hoá 60 khung/giây như camera.js
  const WAIT_SHOT = 0.25;                                          // DoTakePhoto: WaitForSecondsRealtime(0.25)
  const BLEND_OUT = { time: 2, k: [[0, 0, 0, 0], [0.3036645, 0.35680634, 2.5336566, 2.5336566], [1, 1, 0, 0]] }; // Manager.unity m_DefaultBlend
  const CLIPS = ['fish.camera.capture', 'fish.camera.capture.2', 'fish.camera.capture.3'];
  const sprite = n => new URL('art/ui/sprites/' + n + '.webp', document.baseURI).href;

  const P = root.DRPhoto = { active: false, shots: 0, overlay: true, last: null };
  const st = { p: new T.Vector3(), yaw: 0, pitch: 0, dutch: 0, fov: FOV0 };
  const keys = new Set();                                          // phím / nút đang giữ (mã KeyboardEvent)
  let ui = null, shooting = false, rt0 = 0, out = null, locked = false, toastT = 0;
  const _e = new T.Euler(0, 0, 0, 'YXZ'), _zq = new T.Quaternion(), _z = new T.Vector3(0, 0, 1);
  const _f = new T.Vector3(), _r = new T.Vector3(), _bp = new T.Vector3(), _qa = new T.Quaternion();
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const axis = (neg, pos) => (keys.has(pos) ? 1 : 0) - (keys.has(neg) ? 1 : 0);

  // ------------------------------------------------------------------------------------------------ camera
  function poseQ(q) { _e.set(st.pitch, st.yaw, 0); q.setFromEuler(_e); q.multiply(_zq.setFromAxisAngle(_z, st.dutch * DEG)); return q; }
  function boatPos() {
    const br = root.DRBoat && DRBoat.root;
    if (br) return _bp.copy(br.position);
    const b = D.s && D.s.boat; return _bp.set(b ? b.x : 0, 0, b ? b.z : 0);
  }
  // CameraAbility.Update + RestrictMovement
  function step(dt) {
    poseQ(_qa);
    _r.set(1, 0, 0).applyQuaternion(_qa); _f.set(0, 0, -1).applyQuaternion(_qa);
    const ax = axis('KeyA', 'KeyD'), az = axis('KeyS', 'KeyW'), ay = axis('KeyE', 'KeyQ'); // Q lên (+), E xuống (−)
    const roll = axis('ArrowLeft', 'ArrowRight'), zoom = axis('ArrowDown', 'ArrowUp');
    const pan = CA.panSensitivity * dt;
    st.p.addScaledVector(_r, ax * pan).addScaledVector(_f, az * pan);
    st.p.y += ay * pan;
    st.dutch = clamp(st.dutch - roll * CA.rollSensitivity * dt, CA.minRoll, CA.maxRoll);
    st.fov = clamp(st.fov - zoom * CA.zoomSensitivity * dt, CA.minZoom, CA.maxZoom);
    const bp = boatPos();
    _f.copy(st.p).sub(bp);
    if (_f.length() > CA.confinementRadius) st.p.copy(bp).addScaledVector(_f.setLength(CA.confinementRadius), 1);
    st.p.y = Math.max(CA.floorHeight, st.p.y);
  }
  function hermite(def, u) {
    u = clamp(u, 0, 1);
    const k = def.k;
    for (let i = 1; i < k.length; i++) if (u <= k[i][0]) {
      const a = k[i - 1], b = k[i], d = b[0] - a[0], s = (u - a[0]) / d, s2 = s * s, s3 = s2 * s;
      return (2 * s3 - 3 * s2 + 1) * a[1] + (s3 - 2 * s2 + s) * a[3] * d + (-2 * s3 + 3 * s2) * b[1] + (s3 - s2) * b[2] * d;
    }
    return 1;
  }
  const poseN = { p: new T.Vector3(), q: new T.Quaternion(), fov: FOV0 };
  function override(cam, dt, mode, env) {
    const now = performance.now(), rdt = Math.min(0.1, rt0 ? (now - rt0) / 1000 : 0.016); rt0 = now;
    if (P.active) {
      step(rdt);
      cam.position.copy(st.p); poseQ(cam.quaternion);
      if (cam.fov !== st.fov) { cam.fov = st.fov; cam.updateProjectionMatrix(); }
      return true;
    }
    if (!out) { DRCamera.override = null; return false; }
    // trộn về camera thuyền: camera thường vẫn chạy để có điểm cuối của phép trộn
    DRCamera.override = null; DRCamera.update(dt, mode, env); DRCamera.override = override;
    poseN.p.copy(cam.position); poseN.q.copy(cam.quaternion); poseN.fov = cam.fov;
    out.t += rdt;
    if (out.t >= BLEND_OUT.time) { out = null; DRCamera.override = null; return true; }
    const k = hermite(BLEND_OUT, out.t / BLEND_OUT.time);
    cam.position.lerpVectors(out.p, poseN.p, k);
    cam.quaternion.copy(out.q).slerp(poseN.q, k);
    const fov = out.fov + (poseN.fov - out.fov) * k;
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    return true;
  }

  // ------------------------------------------------------------------------------------------------ vào / ra
  function sfx(k) { try { if (root.DRAudio) DRAudio.play(k); } catch (e) { /* tiếng không bắt buộc */ } }
  function lockPointer(on) {
    try {
      const c = document.getElementById('dr-canvas');
      if (on && c && c.requestPointerLock && matchMedia('(pointer: fine)').matches) {
        const r = c.requestPointerLock(); if (r && r.catch) r.catch(() => {});
      } else if (!on && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
    } catch (e) { /* khoá con trỏ không bắt buộc */ }
  }
  function enter() {
    const sg = root.DRAbilities.ability('spyglass');
    if (sg && sg.isActive) sg.deactivate();
    const cam = DRCamera.cam;
    // m_InheritPosition: bắt đầu từ chỗ camera đang đứng; POV lấy hướng nhìn hiện tại; ResetCamera: Dutch 0, FOV 40
    _e.setFromQuaternion(cam.quaternion, 'YXZ');
    st.p.copy(cam.position); st.yaw = _e.y; st.pitch = clamp(_e.x, -89.9 * DEG, 89.9 * DEG); st.dutch = 0; st.fov = FOV0;
    out = null; keys.clear(); rt0 = 0;
    P.active = true;
    DRCamera.override = override;
    document.body.classList.add('dr-photo');                       // ToggleGameCanvasShow(false)
    ui.root.hidden = false;
    ui.frame.classList.toggle('off', !P.overlay);                  // TogglePhotoModeCanvasShow(shouldShowOverlay)
    sync();
    if (root.DRBook) DRBook.modalOn('photo', () => root.DRAbilities.ability('camera').deactivate(), onKey); // Time.timeScale = 0 (DR.holdTime 'book'), lớp PHOTO_MODE
    lockPointer(true);
    sfx('fish.camera.open');
  }
  function leave() {
    if (!P.active) return;
    P.active = false;
    poseQ(_qa);
    out = { t: 0, p: st.p.clone(), q: _qa.clone(), fov: st.fov };  // Brain trộn từ camera ảnh về camera thuyền
    keys.clear();
    if (root.DRBook) DRBook.modalOff('photo');
    document.body.classList.remove('dr-photo');
    ui.root.hidden = true;
    lockPointer(false);
    sfx('fish.camera.close');
  }
  const base = root.DRAbilities.Ability;
  root.DRAbilities.register('camera', class Photo extends base {
    activate() {
      if (this.isActive) { this.deactivate(); return false; }
      if (!root.DRCamera.cam || !ui) return false;
      this.isActive = true;
      enter();
      return this.baseActivate();
    }
    deactivate() {
      if (this.isActive) leave();
      this.baseDeactivate(true);                                   // tiếng đóng do leave() phát (deactivateClip)
    }
  });

  // ------------------------------------------------------------------------------------------------ chụp
  function loadImg(n) { return new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = sprite(n); }); }
  // PhotoModeCanvas: 4 góc 180 px (Corner0 trên-trái 0°, Corner1 trên-phải −90°, Corner2 dưới-phải 180°, Corner3 dưới-trái +90°, chốt ở góc trên-trái
  // của ảnh), lề 10 px, 2 đường dọc/ngang ở 1/3 và 2/3 dày 4 px; lưới chuẩn 1920×1080 theo chiều cao (CanvasScaler match height)
  async function drawOverlay(g, W, H) {
    const [c, lv, lh] = await Promise.all([loadImg('Corner'), loadImg('Line'), loadImg('Line_Horizontal')]);
    const k = H / 1080, s = 180 * k, m = 10 * k, lw = Math.max(1, 4 * k);
    if (c) for (const [x, y, a] of [[m, m, 0], [W - m, m, 90], [W - m, H - m, 180], [m, H - m, -90]]) {
      g.save(); g.translate(x, y); g.rotate(a * DEG); g.drawImage(c, 0, 0, s, s); g.restore();
    }
    for (const f of [1 / 3, 2 / 3]) {
      if (lv) g.drawImage(lv, W * f - lw / 2, 0, lw, H);
      if (lh) g.drawImage(lh, 0, H * f - lw / 2, W, lw);
    }
  }
  async function shoot() {
    if (!P.active || shooting) return null;
    shooting = true;
    ui.root.classList.add('shooting');
    await new Promise(r => setTimeout(r, WAIT_SHOT * 1000));       // DoTakePhoto: WaitForSecondsRealtime(0.25f)
    try {
      const dbg = root.DR_DEBUG, canvas = document.getElementById('dr-canvas');
      if (dbg && dbg.renderer) dbg.renderer.render(dbg.scene, dbg.camera);  // vẽ lại ngay để đọc được bộ đệm (không preserveDrawingBuffer)
      const W = canvas.width, H = canvas.height, c2 = document.createElement('canvas');
      c2.width = W; c2.height = H;
      const g = c2.getContext('2d');
      g.drawImage(canvas, 0, 0);
      if (P.overlay) await drawOverlay(g, W, H);
      const blob = await new Promise(r => c2.toBlob(r, 'image/png'));
      if (!blob) throw new Error('canvas toBlob returned null');
      const d = new Date(), z = n => String(n).padStart(2, '0');
      const name = 'bien-mu-' + d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes()) + z(d.getSeconds()) + '.png';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name; a.style.display = 'none';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      P.shots++;
      P.last = { name, w: W, h: H, bytes: blob.size, overlay: P.overlay };
      sfx(CLIPS[Math.floor(Math.random() * CLIPS.length)]);
      flash(); toast('Đã lưu ảnh ' + name);
      return P.last;
    } catch (e) {
      console.error('[DREDGE] photo failed:', e);
      toast('Không chụp được ảnh');
      return null;
    } finally {
      shooting = false;
      if (ui) ui.root.classList.remove('shooting');
    }
  }
  function flash() { ui.flash.classList.remove('go'); void ui.flash.offsetWidth; ui.flash.classList.add('go'); }
  function toast(t) {
    ui.toast.textContent = t; ui.toast.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => ui.toast.classList.remove('on'), 2600);
  }
  function toggleOverlay() {
    P.overlay = !P.overlay;
    ui.frame.classList.toggle('off', !P.overlay);
    sync();
  }

  // ------------------------------------------------------------------------------------------------ vào ra giao diện
  // Tên phím theo prompt.photo-camera.* / settings.binding.* (dịch)
  const CHIPS = [
    { cls: 'act', keys: [['KeyF', 'F']], label: 'Chụp ảnh', fn: () => shoot() },
    { cls: 'act', keys: [['KeyT', 'T']], label: 'Khung ngắm', fn: () => toggleOverlay(), id: 'ov' },
    { keys: [['KeyW', 'W'], ['KeyS', 'S']], label: 'Tiến / Lùi' },
    { keys: [['KeyA', 'A'], ['KeyD', 'D']], label: 'Trái / Phải' },
    { keys: [['KeyQ', 'Q'], ['KeyE', 'E']], label: 'Lên / Xuống' },
    { keys: [['ArrowLeft', '←'], ['ArrowRight', '→']], label: 'Xoay máy' },
    { keys: [['ArrowUp', '↑'], ['ArrowDown', '↓']], label: 'Thu phóng' },
    { cls: 'mouse', keys: [], cap: 'Chuột', label: 'Nhìn quanh' },
    { cls: 'act exit', keys: [], cap: 'Esc', label: 'Thoát', fn: () => root.DRAbilities.ability('camera').deactivate() }
  ];
  function buildUI() {
    const el = (t, c, p) => { const e = document.createElement(t); if (c) e.className = c; if (p) p.appendChild(e); return e; };
    const r = el('div', '', document.body); r.id = 'dr-photo'; r.hidden = true;
    const pad = el('div', 'ph-pad', r);                           // kéo để nhìn quanh (cảm ứng / chuột chưa khoá)
    const frame = el('div', 'ph-frame', r);
    for (let i = 0; i < 4; i++) el('i', 'ph-c ph-c' + i, frame);
    for (const c of ['ph-v1', 'ph-v2', 'ph-h1', 'ph-h2']) el('i', 'ph-l ' + c, frame);
    const flashEl = el('div', 'ph-flash', r), toastEl = el('div', 'ph-toast', r), bar = el('div', 'ph-bar', r);
    const chips = {};
    for (const c of CHIPS) {
      const g = el('div', 'ph-chip ' + (c.cls || ''), bar);
      const caps = el('span', 'ph-caps', g);
      for (const [code, txt] of c.keys) {
        const b = el('button', 'ph-key', caps); b.type = 'button'; b.textContent = txt; b.dataset.code = code; chips[code] = b;
        if (c.fn) b.addEventListener('click', c.fn);
        else {
          b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); try { b.setPointerCapture(e.pointerId); } catch (x) { /* chạm */ } keys.add(code); sync(); });
          const up = () => { keys.delete(code); sync(); };
          b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
        }
      }
      if (c.cap) { const b = el('button', 'ph-key wide', caps); b.type = 'button'; b.textContent = c.cap; if (c.fn) b.addEventListener('click', c.fn); }
      el('span', 'ph-lab', g).textContent = c.label;
      if (c.id) chips[c.id] = g;
    }
    ui = { root: r, pad, frame, flash: flashEl, toast: toastEl, bar, chips };
    // nhìn quanh bằng kéo (cảm ứng): CinemachinePOV, input = pixel · 0,05 · maxSpeed
    let drag = null;
    pad.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button !== 0) return; drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; try { pad.setPointerCapture(e.pointerId); } catch (x) { /* chạm */ } });
    pad.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      look(e.clientX - drag.x, e.clientY - drag.y); drag.x = e.clientX; drag.y = e.clientY;
    });
    const end = () => { drag = null; };
    pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
    pad.addEventListener('mousedown', e => { if (e.button === 2) { e.preventDefault(); root.DRAbilities.ability('camera').deactivate(); } }); // chuột phải = DoAbility = Back
    pad.addEventListener('contextmenu', e => e.preventDefault());
  }
  function sync() {
    if (!ui) return;
    for (const [code, b] of Object.entries(ui.chips)) if (b.dataset && b.dataset.code) b.classList.toggle('on', keys.has(code));
    if (ui.chips.ov) ui.chips.ov.classList.toggle('on', P.overlay);
  }
  // POV: ngang quay phải = góc three.js giảm; dọc: chuột lên = ngước lên (m_InvertInput = 1 ⇒ chuột lên giảm Value, Value dương = cúi)
  function look(dx, dy) {
    st.yaw -= dx * MOUSE_SCALE * POV_SPEED * DEG;
    st.yaw = ((st.yaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; // m_Wrap
    st.pitch = clamp(st.pitch - dy * MOUSE_SCALE * POV_SPEED * DEG, -89.9 * DEG, 89.9 * DEG);
  }

  // ------------------------------------------------------------------------------------------------ nhập liệu
  const HELD = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
  function onKey(e) {                                              // DRBook.modalOn keyFn: keydown (không lặp), Esc/X đã đóng ở DRBook
    if (e.code === 'KeyF') shoot();
    else if (e.code === 'KeyT') toggleOverlay();
    else if (HELD.has(e.code)) { keys.add(e.code); sync(); }
  }
  addEventListener('keyup', e => { if (P.active && keys.delete(e.code)) sync(); });
  addEventListener('blur', () => { if (keys.size) { keys.clear(); sync(); } });
  addEventListener('pointermove', e => { if (P.active && e.pointerType === 'mouse' && (locked || !e.buttons)) look(e.movementX || 0, e.movementY || 0); });
  addEventListener('wheel', e => {                                 // [ĐỀ XUẤT] con lăn = thu phóng
    if (!P.active) return;
    e.preventDefault(); e.stopImmediatePropagation();
    st.fov = clamp(st.fov + Math.sign(e.deltaY) * 2, CA.minZoom, CA.maxZoom);
  }, { passive: false, capture: true });
  // Esc khi con trỏ đang khoá: trình duyệt nhả khoá và không chuyển phím cho trang ⇒ coi như Back (như ống nhòm)
  document.addEventListener('pointerlockchange', () => {
    const now = !!document.pointerLockElement;
    if (!now && locked && P.active) root.DRAbilities.ability('camera').deactivate();
    locked = now;
  });

  P.state = () => ({
    active: P.active, p: [st.p.x, st.p.y, st.p.z], yaw: st.yaw / DEG, pitch: st.pitch / DEG, dutch: st.dutch, fov: st.fov,
    overlay: P.overlay, shots: P.shots, last: P.last, blending: !!out, timeScale: D.timeScale == null ? 1 : D.timeScale
  });
  P.shoot = shoot; P.toggleOverlay = toggleOverlay;
  P.limits = CA;

  if (document.body) buildUI(); else document.addEventListener('DOMContentLoaded', buildUI);
})(window);
