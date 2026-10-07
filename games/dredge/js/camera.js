/*
 * Camera bám thuyền kiểu CinemachineFreeLook của bản gốc (DR_BOAT.physics.cinemachine):
 *   3 quỹ đạo (cao, bán kính) Top (20, 14) / Middle (9,5, 15,5) / Bottom (2, 10), trục Y mặc định 0,2;
 *   BindingMode LockToTargetWithWorldUp ⇒ góc X tính theo hướng mũi thuyền, YawDamping 1,5;
 *   Composer ScreenY 0,84 / 0,75 / 0,55 (thuyền nằm thấp trên màn để thấy biển phía trước); FOV 40.
 *   PlayerCamera: đứng yên passiveRecenteringWaitTime (2 s) thì tự quay về sau lái trong passiveRecenteringDuration (2 s).
 *   DRCamera.init(camera)  DRCamera.orbit(dx, dy)  DRCamera.zoom(d)  DRCamera.update(dt, mode)  DRCamera.dock(dockInfo)
 */
(function (root) {
  'use strict';
  const T = root.THREE, PH = root.DR_BOAT.physics, C = PH.camera;
  const FL = PH.cinemachine['Player VCam'].CinemachineFreeLook;
  const RIGS = FL.m_Orbits.map(o => ({ h: o.m_Height, r: o.m_Radius })); // 0 top, 1 middle, 2 bottom
  const SCREEN_Y = ['TopRig/cm', 'MiddleRig/cm', 'BottomRig/cm'].map(k => PH.cinemachine[k].CinemachineComposer.m_ScreenY);
  const YAW_DAMP = PH.cinemachine['MiddleRig/cm'].CinemachineOrbitalTransposer.m_YawDamping;
  const POS_DAMP = PH.cinemachine['MiddleRig/cm'].CinemachineOrbitalTransposer.m_XDamping;

  const Cm = root.DRCamera = { cam: null, x: 0, y: FL.m_YAxis.Value, zoomK: 1, idle: 99, mode: 'follow', dockView: null };
  const tgt = new T.Vector3(), look = new T.Vector3(), want = new T.Vector3();
  let heading = 0, recentering = false, titleT = 0;

  function init(cam) { Cm.cam = cam; cam.fov = C.defaultFOV; cam.updateProjectionMatrix(); }

  // Cinemachine nội suy 3 vòng theo trục Y (0 đáy, 0,5 giữa, 1 đỉnh); bỏ qua độ cong spline 0,2.
  function rig(y) {
    const lerp = (a, b, k) => a + (b - a) * k;
    if (y <= 0.5) { const k = y / 0.5; return { h: lerp(RIGS[2].h, RIGS[1].h, k), r: lerp(RIGS[2].r, RIGS[1].r, k), sy: lerp(SCREEN_Y[2], SCREEN_Y[1], k) }; }
    const k = (y - 0.5) / 0.5;
    return { h: lerp(RIGS[1].h, RIGS[0].h, k), r: lerp(RIGS[1].r, RIGS[0].r, k), sy: lerp(SCREEN_Y[1], SCREEN_Y[0], k) };
  }

  function orbit(dx, dy) {
    Cm.x += dx; Cm.y = Math.max(FL.m_YAxis.m_MinValue, Math.min(FL.m_YAxis.m_MaxValue, Cm.y + dy));
    Cm.idle = 0; recentering = false;
  }
  // [ĐỀ XUẤT] FreeLook gốc không có zoom; cho phép co giãn bán kính 0,7–1,35
  function zoom(d) { Cm.zoomK = Math.max(0.7, Math.min(1.35, Cm.zoomK * (1 + d))); }
  function recenter() { recentering = true; }

  function update(dt, mode, env) {
    const cam = Cm.cam, D = root.DR, b = D.s && D.s.boat;
    if (!cam) return;
    if (mode === 'title') { titleView(dt); return; }
    if (mode === 'dock' && Cm.dockView) { dockView(dt); return; }
    if (!b) return;
    // hướng mũi thuyền (three.js: mũi = −z cục bộ); camera đứng sau lái
    let dh = b.yaw - heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    heading += dh * Math.min(1, dt / Math.max(0.05, YAW_DAMP * 0.35));
    Cm.idle += dt;
    if (Cm.idle > C.passiveRecenteringWaitTime) recentering = true;
    if (recentering) {
      const k = Math.min(1, dt / (C.passiveRecenteringDuration * 0.35));
      Cm.x += (0 - Cm.x) * k; Cm.y += (FL.m_YAxis.Value - Cm.y) * k;
      if (Math.abs(Cm.x) < 0.2 && Math.abs(Cm.y - FL.m_YAxis.Value) < 0.002) recentering = false;
    }
    const R = rig(Cm.y), ang = heading + T.MathUtils.degToRad(Cm.x);
    want.set(b.x, 0, b.z);
    tgt.lerp(want, Math.min(1, dt / Math.max(0.05, POS_DAMP * 0.25)));
    if (tgt.distanceToSquared(want) > 400) tgt.copy(want);
    const r = R.r * Cm.zoomK, h = R.h * Cm.zoomK;
    cam.position.set(tgt.x + Math.sin(ang) * r, h, tgt.z + Math.cos(ang) * r);
    look.set(tgt.x, 0.6, tgt.z);
    cam.lookAt(look);
    // Composer: đẩy thuyền xuống vị trí ScreenY (0,5 = giữa) bằng cách ngửa camera lên
    const tilt = Math.atan(Math.tan(T.MathUtils.degToRad(cam.fov / 2)) * (R.sy - 0.5) * 2);
    cam.rotateX(tilt);
    shake(dt);
  }

  function shake() {
    const k = root.DRBoat ? DRBoat.shake : 0;
    if (k <= 0) return;
    const t = performance.now() / 1000;
    Cm.cam.position.x += Math.sin(t * 47) * k * 0.25; Cm.cam.position.y += Math.sin(t * 61 + 1) * k * 0.2;
    Cm.cam.rotateZ(Math.sin(t * 53 + 2) * k * 0.02);
  }

  // [ĐỀ XUẤT] dockVCam gốc không có trong markers.json: đặt camera lệch ra biển, nhìn vào điểm LookAt của bến
  function dock(info) {
    if (!info) { Cm.dockView = null; return; }
    const sx = info.slot.x, sz = info.slot.z, lx = info.lookAt[0], lz = info.lookAt[2];
    let dx = sx - info.pos[0], dz = sz - info.pos[2];
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const side = 0.55; // xoay ~30° để thấy cả thuyền lẫn nhà
    const cx = dx * Math.cos(side) - dz * Math.sin(side), cz = dx * Math.sin(side) + dz * Math.cos(side);
    Cm.dockView = { pos: new T.Vector3(sx + cx * 14, 6.5, sz + cz * 14), look: new T.Vector3((sx + lx) / 2, 2.2, (sz + lz) / 2), t: 0 };
  }
  function dockView(dt) {
    const v = Cm.dockView, cam = Cm.cam;
    v.t = Math.min(1, v.t + dt * 1.2);
    const k = v.t * v.t * (3 - 2 * v.t);
    if (k < 1) { cam.position.lerp(v.pos, k * 0.25 + 0.02); } else cam.position.copy(v.pos);
    cam.lookAt(v.look);
  }

  function titleView(dt) {
    titleT += dt * 0.03;
    const cx = 10, cz = -10, r = 70;
    Cm.cam.position.set(cx + Math.cos(titleT) * r, 22, cz + Math.sin(titleT) * r);
    Cm.cam.lookAt(cx, 4, cz);
  }

  function snap() {
    const b = root.DR.s && root.DR.s.boat;
    if (!b) return;
    heading = b.yaw; tgt.set(b.x, 0, b.z); Cm.x = 0; Cm.y = FL.m_YAxis.Value;
  }

  Object.assign(Cm, { init, update, orbit, zoom, recenter, dock, snap, rig });
})(window);
