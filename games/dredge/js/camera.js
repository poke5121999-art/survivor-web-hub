/*
 * Camera bám thuyền kiểu CinemachineFreeLook của bản gốc (DR_BOAT.physics.cinemachine):
 *   3 quỹ đạo (cao, bán kính) Top (20, 14) / Middle (9,5, 15,5) / Bottom (2, 10), trục Y mặc định 0,2;
 *   BindingMode LockToTargetWithWorldUp ⇒ góc X tính theo hướng mũi thuyền (Heading TargetForward), YawDamping 1,5;
 *   Composer ScreenY Top 0,55 / Middle 0,75 / Bottom 0,84 (thuyền nằm thấp trên màn để thấy biển phía trước); FOV 40.
 *   Giảm chấn kiểu Cinemachine (Damper.Damp): mỗi khung đi được 1 − e^(−4,605·dt/damping) phần còn lại (99 % sau damping giây).
 *   Chuột (CinemachineFreeLookInputProvider + InControl): giá trị trục = pixel·0,05 (MouseBindingSource.ScaleX, Raw);
 *     X: m_MaxSpeed = baseSensitivityX 300 × cameraSensitivityX 0,5 = 150 °/s mỗi đơn vị; Y: 3 × 0,5 = 1,5 /s, đảo trục (cameraInvertY 1).
 *   Tự quay về sau lái (cameraRecenter 1 ⇒ m_RecenterToTargetHeading): chỉ trục X, đợi passiveRecenteringWaitTime 2 s kể từ lần
 *     chạm chuột cuối, rồi SmoothDamp về 0 trong passiveRecenteringDuration 2 s. Nút giữa = về ngay (forceRecenteringDuration 0,15 s,
 *     xong khi |X| < forceRecenteringCompleteThreshold 1°). Trục Y không tự về (m_YAxisRecentering tắt).
 *   DRCamera.init(camera)  DRCamera.look(px, py) (pixel chuột cộng dồn trong khung)  DRCamera.stick(x, y) (cần −1..1)
 *   DRCamera.orbit(dx°, dy)  DRCamera.zoom(d)
 *   DRCamera.update(dt, mode)  DRCamera.dock(dockInfo)  DRCamera.recenter()
 *   Móc cho camera của năng lực (ống nhòm, tăng tốc), để module khác không phải sửa tệp này:
 *     DRCamera.override = function (cam, dt, mode, env) { ...; return true; }  trả true thì camera thường bỏ qua khung đó; null để trả lại
 *     DRCamera.fovAdd = độ cộng thêm vào FOV của rig đang dùng (tăng tốc: hasteFOV − defaultFOV, nội suy bởi bên gọi)
 * Lúc thu hoạch (DR.mode 'harvest' = Harvester.enabled bật harvestVCam, Harvester.cs:81) camera chuyển sang "HarvestClearShot VCam"
 *   (PlayerContainer.prefab, tools/harvest_ui.py -> DR_HARVEST_UI.cam): ClearShot chọn camera con ưu tiên cao nhất có góc nhìn sạch
 *   = "Harvest VCam Top High" (ưu tiên 16): Transposer LockToTargetWithWorldUp, FollowOffset (0, 20, −5) quanh ColliderCenter
 *   (Player + (0; 0,3; 0)), giảm chấn vị trí 1/1/1 s, Composer nhìn thẳng tâm (ScreenX/Y 0,5), FOV 40 ⇒ cao 20 m, chúc 76°.
 *   [ĐỀ XUẤT] không thử che khuất của CinemachineCollider (luôn Top High; trên biển trống camera 20 m hầu như không bị che).
 *   Blend vào/ra là blend của CinemachineBrain (Manager.unity): Main Camera Blends không có dòng nào cho "HarvestClearShot VCam" nên
 *   dùng m_DefaultBlend = Custom 2 s, đường cong (0,0) (0,304; 0,357) (1,1); m_DefaultBlend EaseInOut 1 s của ClearShot chỉ dùng giữa
 *   các camera con. Trộn như CameraState.Lerp: vị trí lerp, điểm nhìn lerp, độ lệch khung (ScreenY) lerp, FOV lerp.
 */
(function (root) {
  'use strict';
  const T = root.THREE, PH = root.DR_BOAT.physics, C = PH.camera;
  const FL = PH.cinemachine['Player VCam'].CinemachineFreeLook;
  const RIGS = FL.m_Orbits.map(o => ({ h: o.m_Height, r: o.m_Radius })); // 0 top, 1 middle, 2 bottom
  const SCREEN_Y = ['TopRig/cm', 'MiddleRig/cm', 'BottomRig/cm'].map(k => PH.cinemachine[k].CinemachineComposer.m_ScreenY);
  const YAW_DAMP = PH.cinemachine['MiddleRig/cm'].CinemachineOrbitalTransposer.m_YawDamping;
  const POS_DAMP = PH.cinemachine['MiddleRig/cm'].CinemachineOrbitalTransposer.m_XDamping;
  const MOUSE_SCALE = 0.05; // InControl MouseBindingSource.ScaleX/ScaleY
  const SENS = 0.5;         // SettingsSaveDataTemplate.cameraSensitivityX/Y (PC)
  const MAX_X = 300 * SENS, MAX_Y = 3 * SENS; // CameraSensitivitySettingResponder.baseSensitivityX/Y (Player VCam)
  const INVERT_Y = 1;       // SettingsSaveDataTemplate.cameraInvertY
  const damp = (dt, t) => t <= 0 ? 1 : 1 - Math.exp(-4.605170186 * dt / t); // Cinemachine Damper.Damp

  const Cm = root.DRCamera = { cam: null, x: 0, y: FL.m_YAxis.Value, zoomK: 1, idle: 99, mode: 'follow', dockView: null, override: null, fovAdd: 0, harvestW: 0 };
  const tgt = new T.Vector3(), look = new T.Vector3(), want = new T.Vector3();
  let heading = 0, forced = false, titleT = 0, recVel = 0, lookX = 0, lookY = 0, holding = false;

  // ---- HarvestClearShot VCam
  const HC = root.DR_HARVEST_UI && root.DR_HARVEST_UI.cam;
  const SHOT = HC && HC.shots && HC.shots[0];                     // shots xếp theo m_Priority giảm dần: Top High
  const hPos = new T.Vector3(), hIdeal = new T.Vector3(), hLook = new T.Vector3(), cPos = new T.Vector3(), cLook = new T.Vector3(), tmpV = new T.Vector3();
  const blend = { from: 0, to: 0, p: 1, def: null };
  let hValid = false;
  // CinemachineBlendDefinition: 0 Cut, 1 EaseInOut, 2 EaseIn, 3 EaseOut, 4 HardIn, 5 HardOut, 6 Linear, 7 Custom
  function blendCurve(def, u) {
    u = Math.max(0, Math.min(1, u));
    const h = (m0, m1) => { const u2 = u * u, u3 = u2 * u; return (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) + (u3 - u2) * m1; };
    switch (def ? def.style : 1) {
      case 0: return 1;
      case 2: return h(0, 1); case 3: return h(1, 0); case 4: return h(0, 3); case 5: return h(3, 0);
      case 6: return u;
      case 7: {
        const k = def.curve || [];
        for (let i = 1; i < k.length; i++) if (u <= k[i][0]) {
          const a = k[i - 1], b = k[i], d = b[0] - a[0], s = (u - a[0]) / d, s2 = s * s, s3 = s2 * s;
          if (a[3] == null || b[2] == null) return a[1];
          return (2 * s3 - 3 * s2 + 1) * a[1] + (s3 - 2 * s2 + s) * a[3] * d + (-2 * s3 + 3 * s2) * b[1] + (s3 - s2) * b[2] * d;
        }
        return k.length ? k[k.length - 1][1] : u;
      }
      default: return h(0, 0);                                   // AnimationCurve.EaseInOut(0,0,1,1)
    }
  }
  function harvestTarget(on) {
    const to = on ? 1 : 0;
    if (blend.to === to) return;
    blend.from = Cm.harvestW; blend.to = to; blend.p = 0;
    blend.def = HC ? (on ? HC.brain.in : HC.brain.out) : null;
    if (on && blend.from <= 0) hValid = false;                    // vcam vừa bật: PreviousStateIsValid = false ⇒ vào thẳng vị trí lý tưởng
  }
  // Transposer LockToTargetWithWorldUp: FollowOffset (Unity, z tới) quay theo hướng mũi thuyền; ColliderCenter = Player + target.pos
  function harvestPose(dt, b) {
    const by = root.DRBoat && DRBoat.root ? DRBoat.root.position.y : 0;
    const tp = HC.target ? HC.target.pos : [0, 0.3, 0];
    hLook.set(b.x + tp[0], by + tp[1], b.z - tp[2]);
    const o = SHOT.transposer.offset;
    tmpV.set(o[0], o[1], -o[2]).applyAxisAngle(AXIS_Y, b.yaw);
    hIdeal.copy(hLook).add(tmpV);
    if (!hValid) { hPos.copy(hIdeal); hValid = true; }
    const dp = SHOT.transposer.damp;
    hPos.x += (hIdeal.x - hPos.x) * damp(dt, dp[0]); hPos.y += (hIdeal.y - hPos.y) * damp(dt, dp[1]); hPos.z += (hIdeal.z - hPos.z) * damp(dt, dp[2]);
  }
  const AXIS_Y = new T.Vector3(0, 1, 0);

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
    Cm.idle = 0;
  }
  // chuột: pixel cộng dồn trong khung (trình duyệt: y xuống là dương; Unity: y lên là dương)
  function lookInput(px, py) { lookX += px; lookY += py; }
  // cần analog −1..1 (trình duyệt: lên = −1)
  let stickX = 0, stickY = 0;
  function stick(x, y) { stickX = x; stickY = y; }
  function hold(on) { holding = on; }
  // [ĐỀ XUẤT] FreeLook gốc không có zoom; cho phép co giãn bán kính 0,7–1,35
  function zoom(d) { Cm.zoomK = Math.max(0.7, Math.min(1.35, Cm.zoomK * (1 + d))); }
  function recenter() { forced = true; recVel = 0; }

  // Mathf.SmoothDamp
  function smoothDamp(cur, target, smoothTime, dt) {
    smoothTime = Math.max(0.0001, smoothTime);
    const o = 2 / smoothTime, x = o * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const ch = cur - target, tmp = (recVel + o * ch) * dt;
    recVel = (recVel - o * tmp) * e;
    let out = target + (ch + tmp) * e;
    if ((target - cur > 0) === (out > target)) { out = target; recVel = (out - target) / dt; }
    return out;
  }

  function update(dt, mode, env) {
    const cam = Cm.cam, D = root.DR, b = D.s && D.s.boat;
    if (!cam) return;
    // HarvestClearShot: bật khi thu hoạch, tắt khi rời; trọng số blend theo blend của Brain (Custom 2 s)
    if (SHOT) {
      harvestTarget(mode === 'harvest');
      if (blend.p < 1) {
        blend.p = Math.min(1, blend.p + dt / Math.max(1e-3, blend.def ? blend.def.time : 1));
        Cm.harvestW = blend.from + (blend.to - blend.from) * blendCurve(blend.def, blend.p);
      } else Cm.harvestW = blend.to;
    }
    const w = Cm.harvestW;
    const fov = (C.defaultFOV + Cm.fovAdd) * (1 - w) + (SHOT ? SHOT.fov : C.defaultFOV) * w;
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    if (Cm.override && Cm.override(cam, dt, mode, env)) { lookX = lookY = 0; return; }
    if (mode === 'title') { titleView(dt); lookX = lookY = 0; return; }
    if (mode === 'dock' && Cm.dockView) { dockView(dt); lookX = lookY = 0; return; }
    if (!b) return;
    // AxisState (SpeedMode MaxSpeed): giá trị += input · maxSpeed · dt; input = pixel · 0,05
    // Chuột: delta pixel của khung × dt nên bản gốc nhạy theo fps; [ĐỀ XUẤT] chuẩn hoá về 60 khung/giây (bản PC khoá vsync)
    //   ⇒ 0,05 · 150 / 60 = 0,125°/px ngang, 0,05 · 1,5 / 60 = 0,00125/px dọc. Cần analog (tay cầm) dùng dt thật.
    const ix = lookX * MOUSE_SCALE / 60 + stickX * dt, iy = (-lookY * MOUSE_SCALE / 60 - stickY * dt) * (INVERT_Y ? -1 : 1);
    if ((ix || iy) && !forced) orbit(-ix * MAX_X, iy * MAX_Y); // three.js: X tăng = quay ngược chiều kim đồng hồ ⇒ đổi dấu
    lookX = lookY = 0;
    // hướng mũi thuyền (three.js: mũi = −z cục bộ); camera đứng sau lái, quay theo thuyền với YawDamping
    let dh = b.yaw - heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    heading += dh * damp(dt, YAW_DAMP);
    Cm.idle += dt;
    // RecenterToTargetHeading: chỉ trục X; đang giữ nút kéo camera thì tắt
    const waitT = forced ? 0 : C.passiveRecenteringWaitTime;
    const recT = forced ? C.forceRecenteringDuration : C.passiveRecenteringDuration;
    if ((forced || !holding) && Cm.idle >= waitT && Cm.x !== 0) {
      let x = ((Cm.x + 180) % 360 + 360) % 360 - 180; // m_Wrap
      x = smoothDamp(x, 0, recT, Math.max(dt, 1e-4));
      Cm.x = Math.abs(x) < 1e-3 ? 0 : x;
    } else if (!forced) recVel = 0;
    if (forced && Math.abs(Cm.x) < C.forceRecenteringCompleteThreshold) forced = false;
    const R = rig(Cm.y), ang = heading + T.MathUtils.degToRad(Cm.x);
    // Follow = Player.transform (gồm cả nhấp nhô), giảm chấn vị trí X/Y/Z = 1 s
    want.set(b.x, root.DRBoat && DRBoat.root ? DRBoat.root.position.y : 0, b.z);
    tgt.lerp(want, damp(dt, POS_DAMP));
    if (tgt.distanceToSquared(want) > 400) tgt.copy(want);
    const r = R.r * Cm.zoomK, h = R.h * Cm.zoomK;
    cPos.set(tgt.x + Math.sin(ang) * r, tgt.y + h, tgt.z + Math.cos(ang) * r);
    cLook.set(tgt.x, tgt.y + 0.6, tgt.z);
    // Composer: đẩy thuyền xuống vị trí ScreenY (0,5 = giữa) bằng cách ngửa camera lên
    let tilt = Math.atan(Math.tan(T.MathUtils.degToRad((C.defaultFOV + Cm.fovAdd) / 2)) * (R.sy - 0.5) * 2);
    if (SHOT && (w > 0 || mode === 'harvest')) {
      harvestPose(dt, b);
      // CameraState.Lerp: vị trí và điểm nhìn lerp, góc lệch khung của Composer lerp (Top High: ScreenY 0,5 ⇒ 0)
      cPos.lerp(hPos, w); cLook.lerp(hLook, w);
      tilt *= 1 - w;
    } else hValid = false;
    cam.position.copy(cPos);
    cam.lookAt(cLook);
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
    heading = b.yaw; tgt.set(b.x, root.DRBoat && DRBoat.root ? DRBoat.root.position.y : 0, b.z); Cm.x = 0; Cm.y = FL.m_YAxis.Value; recVel = 0; forced = false;
    hValid = false;
  }

  Object.assign(Cm, { init, update, orbit, look: lookInput, stick, hold, zoom, recenter, dock, snap, rig, get forced() { return forced; },
    harvestShot: () => SHOT && { name: SHOT.name, fov: SHOT.fov, offset: SHOT.transposer.offset, blend: blend.def, w: Cm.harvestW } });
})(window);
