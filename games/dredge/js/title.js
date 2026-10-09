/*
 * Màn tiêu đề (Scenes/Title.unity, TitleScreenView.cs SetBaseGame):
 *  - vCam "VCam" FOV 40 đặt ở BaseCamPos (Unity 21,09 / 9,9 / −14,57), nhìn "CamLookAt" (34,14 / 8,7 / 20,96) = chân hải đăng;
 *    CinemachineComposer m_ScreenX = 0,4, m_ScreenY = 0,535 (baseGameCameraOffset) đẩy điểm nhìn lệch trái / xuống dưới giữa khung.
 *    Đổi sang three.js: z → −z. Camera đứng yên (không có chuyển động trong cảnh).
 *  - giờ trong ngày baseGameTime = 0,27 (DummyTimeProxy.fakeTime). DRSky chưa có ván cũng dùng 0,27.
 *  - Cài đặt / Giới thiệu: hai bảng nhỏ cạnh thanh menu; Quit gốc thay bằng nút về sảnh trò chơi (tab web không tự đóng).
 */
(function (root) {
  'use strict';
  const T = root.THREE;
  const POS = [21.09, 9.9, 14.57], LOOK = [34.14, 8.7, -20.96], FOV = 40, SX = 0.4, SY = 0.535;
  const d = document, $ = id => d.getElementById(id);

  function pose() {
    const cam = root.DRCamera && DRCamera.cam;
    if (!cam) return;
    if (cam.fov !== FOV) { cam.fov = FOV; cam.updateProjectionMatrix(); }
    cam.position.set(POS[0], POS[1], POS[2]);
    cam.lookAt(LOOK[0], LOOK[1], LOOK[2]);
    // Composer: điểm nhìn nằm ở (SX, SY) tính từ góc trái-trên ⇒ xoay camera ngược lại một góc theo tỉ lệ nửa khung
    const th = Math.tan(T.MathUtils.degToRad(FOV / 2));
    cam.rotateY(-Math.atan(th * cam.aspect * (0.5 - SX) * 2));
    cam.rotateX(Math.atan(th * (SY - 0.5) * 2));
  }
  if (root.DRCamera) {
    const base = DRCamera.update;
    DRCamera.update = function (dt, mode, env) {
      base.call(DRCamera, dt, mode, env);
      if (mode === 'title') pose();
    };
  }

  // ---- bảng Cài đặt / Giới thiệu ----
  function panel(id) {
    for (const p of d.querySelectorAll('#dr-title .tt-panel')) p.hidden = p.id !== id;
  }
  function muteLabel() { const b = $('btn-mute'); if (b && $('tt-mute')) $('tt-mute').textContent = b.textContent; }
  function bind() {
    const t = $('dr-title');
    if (!t) return;
    $('btn-settings').onclick = () => { muteLabel(); panel('tt-settings'); };
    $('btn-credits').onclick = () => panel('tt-credits');
    $('tt-mute').onclick = () => { $('btn-mute').click(); muteLabel(); };
    for (const b of t.querySelectorAll('[data-close]')) b.onclick = () => panel('');
    root.addEventListener('keydown', e => { if (e.code === 'Escape' && !t.hidden) panel(''); });
    new MutationObserver(() => { if (t.hidden) panel(''); }).observe(t, { attributes: true, attributeFilter: ['hidden'] });
  }
  bind();

  root.DRTitle = { pose, POS, LOOK, FOV, SX, SY };
})(window);
