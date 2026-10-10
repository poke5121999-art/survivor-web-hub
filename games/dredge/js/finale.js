/*
 * W6a — luồng kết thúc (WORLD-GAPS.md §2.3, §6): chuyến đi cuối, ngọn hải đăng chỉ đường, cảnh kết, credits, về màn đầu.
 *
 * Nguồn (đọc trước khi sửa):
 *   DredgeDialogueRunner.cs:793-803  DoFinalePreparations = ForbidSave + ToggleFreezeTime(true) + FinaleVoyageStarted;
 *                                    DoFinaleCutscenePreparations = FinaleCutsceneStarted (AbilityBarUI.cs:96 cấm dùng năng lực)
 *   FinalePOIEnabler.cs:15-31        EnableBad/GoodFinalePOI: SetActive(true) cho Finale_Inspect (+ BadEndingBeam | ReturnLighthouseBeam);
 *                                    BadEndingBeam = hệ hạt (DRParticles 'BadEndingBeam'); ReturnLighthouseBeam (Glow + 2 tấm tia
 *                                    LighthouseReturnBeam_Mat, shader tia mờ dần theo khoảng cách gần) CHƯA dựng [ĐỀ XUẤT: việc còn mở]
 *   LighthouseBeam.cs:44-57          TogglePointToFinalePOI(bool): tắt ConstantlyRotateOnY, LookAtTarget nhìn finalePOI, DOScale 2,5 s
 *                                    tới pointingScale (120, 5, 5) (gốc 30, 10, 10), FrontFacingLight DOLocalMove tới (0,01, 0, 0) (gốc 0,05)
 *                                    — Game.unity &125078 (GameObject LighthouseBeam &1685); LookAtTarget &138656: speed 2, eulerOffset (0, −90, 1)
 *   FinaleLookAtCam.cs:12            ToggleLookAtFinaleVCam(bool): GreaterMarrowFinaleVCam (Game.unity &132818) — vị trí (47; 10,15; 6),
 *                                    LookAt "Docks/Greater Marrow/LookAt" (−1,4; 0; 2,7), FieldOfView 40, Priority 14
 *   FinaleCutsceneLogic.cs:93-115    PlayBad/GoodFinaleCutscene: Player.IgnoreDamage, CutsceneToggled(true), PlayableDirector chạy timeline;
 *                                    UnlockPlayerMovement: ClearAutoMoveTarget + ClearAutoRotateTarget
 *   FinaleCutsceneLogic &124229 (Game.unity) + SignalReceiver cùng GameObject: tín hiệu → phương thức (bảng RECEIVER dưới đây);
 *   MonoBehaviour/FinaleCutscene_Bad.playable, FinaleCutscene_Good.playable: mốc Signal Emitter (bảng TIMELINE dưới đây).
 *   CreditsController.cs: SHOWING_IN_GAME → hết credits / giữ Esc 1 s → LoadTitleFromGame (W7: DRMenus.credits.play({mode:'game'})).
 *
 * Lệnh Yarn đăng ký ở đây (DRYarn.command, ghi đè stub của yarn.js): DoFinalePreparations, DoFinaleCutscenePreparations,
 *   EnableBadFinalePOI, EnableGoodFinalePOI, TogglePointToFinalePOI, UnlockPlayerMovement, ToggleLookAtFinaleVCam,
 *   PlayBadFinaleCutscene, PlayGoodFinaleCutscene.
 * AutoMovePOI (Finale_Inspect): js/poi.js gọi DRPoi.onAutoMove(a) khi bắt đầu nói chuyện → DRBoat.autoMove tới autoMoveDestination,
 *   quay theo forward (includeRotation) — PlayerController.SetAutoMoveTarget / SetAutoRotateTarget.
 *
 * Mối nối cho W6b (js/finale_cut.js, nạp sau tệp này): nếu có DRFinaleCut.play(kind, api) và nó trả true thì timeline thật do W6b chạy;
 *   W6b gọi api.signal(tên SignalAsset) đúng mốc ('ToggleUI', 'ChangeWeather', 'CutToCredits'...) để dùng bộ nhận ở đây.
 *   Không có (hoặc trả false): chạy TIMELINE dưới đây — chỉ các mốc tín hiệu, không có track máy quay / hoạt cảnh / âm thanh của timeline
 *   [ĐỀ XUẤT] máy quay vẫn bám thuyền tới CutToCredits. DestroyGreaterMarrow gọi DRFinaleCut.destroyGreaterMarrow() nếu W6b có.
 *
 *   DRFinale.state()   { voyage, cut: {kind, t, fired[]}, ui, beam, vcam, ... } cho kiểm thử
 *   DRFinale.signal(tên) / DRFinale.methods   bộ nhận tín hiệu (SignalReceiver → FinaleCutsceneLogic)
 *   DRFinale.timeScale  nhân thời gian timeline dự phòng (kiểm thử; 1 = thời gian thật)
 * Sự kiện: DR.emit('finaleVoyageStarted') (GameEvents.TriggerFinaleVoyageStarted), DR.emit('finaleCutsceneStarted'),
 *   DR.emit('finaleCutscene', kind) khi timeline bắt đầu, DR.emit('finaleSignal', tên) mỗi mốc.
 */
(function (root) {
  'use strict';
  const D = root.DR;
  if (!D) return;
  const POI_ID = 'Finale_Root';
  const POI = ((root.DR_POI && root.DR_POI.points) || []).find(p => p.id === POI_ID) || { x: -300, z: 0 };   // Finale_Inspect (−300, 0, 0)
  // ---- số từ Game.unity (toạ độ đã đổi sang three.js: z đổi dấu)
  const BEAM = { pointScale: [120, 5, 5], origScale: [30, 10, 10], pointFront: 0.01, origFront: 0.05, tweenSec: 2.5, lookSpeed: 2, rollDeg: 1 };
  const VCAM_GM = { p: [47, 10.15, -6], look: [-1.4, 0, -2.7], fov: 40 };          // GreaterMarrowFinaleVCam
  const VCAM_CREDITS = { p: [62, 19, -15.5], look: [0, 3.6, 0], fov: 40 };         // CinematicCameraRigs/Credits/Credits_VCam → CreditsCamLookAt
  const CREDITS_POS = [42.22, -34.04];                                               // CreditsPlayerMovePosition (42,22; 0; 34,04)
  const SCRIM = { on: 0.1, off: 1.5 };                                               // scrimAppearDurationSec / scrimDisppearDurationSec
  const FLICKER_SEC = 3;                                                             // lightFlickerDurationSec
  const WEATHER_SEC = 10;                                                            // TransitionToWeather: TransitionDurationSec = 10
  const BLEND_SEC = 2;                                                               // CinemachineBrain mặc định: EaseInOut 2 s
  // lightFlickerCurve của FinaleCutsceneLogic &124229 [t, giá trị, inSlope, outSlope] (Hermite; ±∞ = bậc thang)
  const I = Infinity;
  const FLICKER = [[0, 1, -54.27632, -54.27632], [0.00373, 0.59525, I, I], [0.01997, 0.99343, -2.27586, -2.27586], [0.0489, 0.89333, -2.50081, -0.43205],
    [0.049, 0.59524, I, I], [0.06639, 0.88452, -0.45683, -0.42716], [0.49203, 0.42613, -2.1219, -2.1219], [0.49427, 0, I, I], [0.51081, 0.40348, -2.4208, -4.81919],
    [0.53369, 0.2932, -4.81919, -3.44397], [0.53378, 0, I, I], [0.55712, 0.35718, I, -6.55436], [0.58571, 0.1698, -6.55436, I], [0.58573, 0, I, I],
    [0.68196, 0.33183, I, -3.10847], [0.70171, 0.27041, -3.10847, I], [0.70292, 0, I, I], [0.72919, 0.33183, I, -1.23873], [0.7909, 0.25538, -1.23873, I],
    [0.79144, 0, I, I], [0.8143, 0.32957, I, -2.44534], [0.84402, 0.25688, -2.44534, I], [0.84464, 0, I, I], [0.87025, 0.30574, I, -5.73078],
    [0.88861, 0.20052, -5.73078, -0.52241], [0.94861, 0.16918, -0.52241, I], [0.95025, 0, I, I], [1, 0, I, I]];
  // SignalReceiver (GameObject của FinaleCutsceneLogic): SignalAsset → phương thức + đối số
  const RECEIVER = {
    FlickerLights: ['FlickerBoatLights', false], ChangeWeather: ['TransitionToWeather', 'FinaleStorm'], ToggleUI: ['ToggleGameUI', false],
    CutToCredits: ['CutToCredits'], ToggleScrimOff: ['ToggleScrim', false], ToggleScrimOn: ['ToggleScrim', true],
    ToggleEngineAudioOff: ['ToggleEngineAudio', false], ChangeWeatherToAurora: ['TransitionToWeather', 'FinaleAurora'],
    TurnOffBoatModel: ['ToggleBoatModel', false], FadeOutGameSFX: ['ToggleFinaleAudioSnapshot', 15], PlayGoodCreditsMusic: ['PlayGoodCreditsMusic'],
    DestroyGreaterMarrow: ['DestroyGreaterMarrow'], TurnOffLighthousePoint: ['ToggleLighthousePointing', false], PlayBadCreditsMusic: ['PlayBadCreditsMusic'],
    VibrationType1: ['Vibrate', 1], VibrationType2: ['Vibrate', 2], VibrationType3: ['Vibrate', 3], VibrationType4: ['Vibrate', 4], VibrationType5: ['Vibrate', 5]
  };
  // Signal Emitter của hai timeline (m_Time, giây); độ dài timeline: Bad 77,98 s, Good 300 s (track dài nhất)
  const TIMELINE = {
    bad: [[0, 'ToggleUI'], [3.983, 'ChangeWeather'], [7.5, 'FlickerLights'], [9.5, 'ToggleEngineAudioOff'], [20.5, 'FadeOutGameSFX'], [22, 'VibrationType1'],
      [25, 'VibrationType2'], [27.983, 'VibrationType3'], [45.5, 'ToggleScrimOn'], [50.2, 'CutToCredits'], [57.5, 'DestroyGreaterMarrow'],
      [58, 'PlayBadCreditsMusic'], [58.5, 'ToggleScrimOff']],
    good: [[0, 'ToggleUI'], [3.883, 'FlickerLights'], [3.883, 'VibrationType5'], [4, 'ToggleEngineAudioOff'], [17, 'VibrationType5'], [23.417, 'VibrationType4'],
      [24.15, 'TurnOffBoatModel'], [27, 'FadeOutGameSFX'], [28.5, 'ChangeWeatherToAurora'], [40, 'ToggleScrimOn'], [42, 'CutToCredits'],
      [43.033, 'TurnOffLighthousePoint'], [49.8, 'PlayGoodCreditsMusic'], [50.3, 'ToggleScrimOff']]
  };
  const bool = v => /^true$/i.test(String(v));
  const info = (m) => console.info('[finale] ' + m);
  const F = root.DRFinale = { timeScale: 1 };

  // ------------------------------------------------------------------ trạng thái lúc chạy (không lưu: ForbidSave)
  let voyage = null, cut = null, uiHidden = false, engineOff = false, boatHidden = false;
  let vcam = null;            // { def, w (0..1), dir (+1 vào / −1 ra), from: {p, q, fov} }
  let snap = null;            // { t, dur, from: {sfx, ui, voice} } snapshot MUSIC_ONLY
  let flick = null;           // { t, enableAfter }
  let weatherBefore = null, transitionSecBefore = null;
  const beam = { pointing: false, tw: 1, from: null, to: null, frontFrom: 0, frontTo: 0, orig: null };
  let scrimEl = null, styleEl = null, beacon = null;   // beacon: hệ hạt BadEndingBeam đang chạy

  // ------------------------------------------------------------------ giao diện: ẩn HUD (UI.ToggleGameUI) và tấm phủ (ToggleHUDCoverScrim)
  // opacity chứ không visibility: con có visibility:visible riêng (biểu tượng chuột của #dr-ab) vẫn hiện dưới cha visibility:hidden
  function ensureDom() {
    if (styleEl) return;
    styleEl = document.createElement('style'); styleEl.id = 'dr-finale-style';
    styleEl.textContent = 'body.dr-finale-noui #dr-hud,body.dr-finale-noui #dr-ab,body.dr-finale-noui #dr-poi,body.dr-finale-noui #dr-touch,' +
      'body.dr-finale-noui #dr-float,body.dr-finale-noui #dr-banner,body.dr-finale-noui #dr-greet,body.dr-finale-noui #dr-deploy,' +
      'body.dr-finale-noui #dr-tut,body.dr-finale-noui #dr-msg{opacity:0!important;pointer-events:none!important}' +
      '#dr-finale-scrim{position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:40;transition-property:opacity;transition-timing-function:linear}';
    document.head.appendChild(styleEl);
    scrimEl = document.createElement('div'); scrimEl.id = 'dr-finale-scrim';
    document.body.appendChild(scrimEl);
  }
  function toggleGameUI(on) { ensureDom(); uiHidden = !on; document.body.classList.toggle('dr-finale-noui', uiHidden); }
  function toggleScrim(on) {
    ensureDom();
    const sec = (on ? SCRIM.on : SCRIM.off) / Math.max(0.01, F.timeScale || 1);
    scrimEl.style.transitionDuration = sec.toFixed(3) + 's';
    scrimEl.style.opacity = on ? '1' : '0';
    scrimEl.dataset.on = on ? '1' : '0';
  }

  // ------------------------------------------------------------------ âm thanh
  function wrapAudio() {
    const A = root.DRAudio;
    if (!A || !A.loop || A.loop._finale) return;
    const o = A.loop;
    // PlayerEngineAudio tắt (ToggleBoatEngineAudio(false)): boat.js gọi loop('boat.engine.<tầng>', vol) mỗi khung → ép 0
    A.loop = function (key, vol, rate, bus) { return o.call(this, key, engineOff && /^boat\.engine\./.test(key) ? 0 : vol, rate, bus); };
    A.loop._finale = true;
  }
  // AudioPlayer.TransitionToSnapshot(MUSIC_ONLY, giây): kéo sfx / ui / voice về 0 trong `dur` giây, nhạc giữ nguyên
  function musicOnly(dur) {
    const A = root.DRAudio; if (!A || !A.volumes) return;
    const v = A.volumes();
    snap = { t: 0, dur: Math.max(0.01, dur), from: { sfx: v.sfx, ui: v.ui, voice: v.voice } };
  }
  function restoreAudio() {
    snap = null; engineOff = false;
    if (root.DRMenus && DRMenus.apply) DRMenus.apply();                       // âm lượng theo cài đặt của người chơi
    else if (root.DRAudio && DRAudio.setVolume) for (const k of ['sfx', 'ui', 'voice']) DRAudio.setVolume(k, 1);
  }
  function creditsMusic(kind) {
    const A = root.DRAudio; if (!A) return;
    // AudioPlayer.PlayMusic(goodCreditsTrackReference | bad…, AudioLayer.MUSIC_STINGER)
    if (A.stingerPlaying && A.stingerPlaying() && A.stopStinger) A.stopStinger(0.5);
    if (A.stinger) A.stinger('music.credits.' + kind, 1);
  }

  // ------------------------------------------------------------------ thuyền
  function ignoreDamage(on) {
    const B = root.DRBoat; if (!B) return;
    // Player.IgnoreDamage: boat.js chặn cú va / quái khi now <= lastHit + 1,5 s ⇒ lastHit = +∞ là miễn sát thương
    B.lastHit = on ? Infinity : 0;
  }
  function lockBoat(on) { const B = root.DRBoat; if (!B) return; if (on) { if (B.stop) B.stop(); } B.blocked = !!on; }
  function toggleBoatModel(on) { const B = root.DRBoat; boatHidden = !on; if (B && B.root) B.root.visible = !!on; }
  function flickerLights(enableAfter) {
    const B = root.DRBoat; if (!B) return;
    if (B.setLights) B.setLights(true);                                       // BeginFlicker: bật mọi đèn
    flick = { t: 0, enableAfter: !!enableAfter };
  }
  function unlockMovement() { const B = root.DRBoat; if (B) B.auto = null; }
  function autoMoveTo(a) {
    const B = root.DRBoat; if (!B || !B.autoMove || !a) return;
    // forward (fx, fz) ở toạ độ three.js; boat.js: forward = (−sin yaw, −cos yaw)
    B.autoMove({ x: a.x, z: a.z, yaw: a.norot ? null : Math.atan2(-a.fx, -a.fz), reach: 0.1, angle: 0.03 }, null);
  }

  // ------------------------------------------------------------------ máy quay ảo (DRCamera.override, giữ override trước đó)
  let prevOverride = null;
  const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  function camOverride(cam, dt, mode, env) {
    if (!vcam) { if (prevOverride) return prevOverride(cam, dt, mode, env); return false; }
    const T = root.THREE;
    vcam.w = Math.max(0, Math.min(1, vcam.w + vcam.dir * dt / BLEND_SEC));
    if (vcam.dir < 0 && vcam.w <= 0) { const p = prevOverride; vcam = null; restoreCamOverride(); return p ? p(cam, dt, mode, env) : false; }
    if (!vcam.from) vcam.from = { p: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov };
    const d = vcam.def, m = new T.Matrix4().lookAt(new T.Vector3(...d.p), new T.Vector3(...d.look), new T.Vector3(0, 1, 0));
    const q = new T.Quaternion().setFromRotationMatrix(m), k = ease(vcam.w);
    cam.position.copy(vcam.from.p).lerp(new T.Vector3(...d.p), k);
    cam.quaternion.copy(vcam.from.q).slerp(q, k);
    const fov = vcam.from.fov + (d.fov - vcam.from.fov) * k;
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    return true;
  }
  function restoreCamOverride() { if (root.DRCamera && DRCamera.override === camOverride) DRCamera.override = prevOverride; prevOverride = null; }
  function setVcam(def, on, cut0) {
    const C = root.DRCamera; if (!C) return;
    if (on) {
      if (C.override !== camOverride) { prevOverride = C.override; C.override = camOverride; }
      vcam = { def, w: cut0 ? 1 : (vcam && vcam.def === def ? vcam.w : 0), dir: 1, from: vcam && vcam.def === def ? vcam.from : null };
    } else if (vcam && vcam.def === def) vcam.dir = -1;
  }

  // ------------------------------------------------------------------ hải đăng Greater Marrow (DRWorld.ambient.beam của js/world.js)
  function beamRef() {
    const B = root.DRWorld && DRWorld.ambient && DRWorld.ambient.beam;
    if (!B) return null;
    if (!beam.orig) {
      const front = B.pivot.children.find(c => c.name === 'beam FrontFacingLight');
      beam.orig = { L: B.L, q0: B.q0.clone(), scale: B.pivot.scale.clone(), front, frontX: front ? front.matrix.elements[12] : 0 };
    }
    return B;
  }
  // LookAtTarget: rotation = Slerp(rotation, LookRotation(đích − vị trí) · Euler(0, −90, 1), 2·dt) ⇒ trục +x của tia chỉ về đích
  function beamLookQuat(B) {
    const T = root.THREE;
    B.pivot.updateWorldMatrix(true, false);
    const pos = new T.Vector3().setFromMatrixPosition(B.pivot.matrixWorld);
    const X = new T.Vector3(POI.x, 0, POI.z).sub(pos).normalize();
    const Z = new T.Vector3().crossVectors(X, new T.Vector3(0, 1, 0)).normalize();
    const Y = new T.Vector3().crossVectors(Z, X);
    const qw = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(X, Y, Z));
    qw.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), BEAM.rollDeg * Math.PI / 180));
    const qp = new T.Quaternion(); B.rootG.matrixWorld.decompose(new T.Vector3(), qp, new T.Vector3());
    return qp.invert().multiply(qw);
  }
  function pointBeam(on) {
    const B = beamRef(); if (!B) { beam.pointing = !!on; return; }
    const T = root.THREE, o = beam.orig;
    beam.pointing = !!on;
    if (on) {
      // ConstantlyRotateOnY.enabled = false: giữ góc đang có làm điểm xuất phát, dừng quay
      B.q0 = B.pivot.quaternion.clone(); B.angle = 0;
      B.L = Object.assign({}, o.L, { rotateSpeed: 0 });
    } else {
      // ConstantlyRotateOnY.enabled = true: quay tiếp từ góc hiện tại
      B.q0 = B.pivot.quaternion.clone(); B.angle = 0; B.L = o.L;
    }
    beam.from = B.pivot.scale.clone();
    beam.to = on ? new T.Vector3(...BEAM.pointScale) : o.scale.clone();
    beam.frontFrom = o.front ? o.front.matrix.elements[12] : 0;
    beam.frontTo = on ? BEAM.pointFront : o.frontX;
    beam.tw = 0;
  }
  function resetBeam() {
    const B = beamRef(); beam.pointing = false; beam.tw = 1;
    if (!B) return;
    const o = beam.orig;
    B.L = o.L; B.q0 = o.q0.clone(); B.angle = 0; B.pivot.scale.copy(o.scale);
    if (o.front) { o.front.matrix.elements[12] = o.frontX; o.front.matrixWorldNeedsUpdate = true; }
  }
  const outQuad = t => t * (2 - t);                                           // DOTween mặc định Ease.OutQuad
  function stepBeam(dt) {
    const B = beam.orig && beamRef(); if (!B) return;
    if (beam.tw < 1) {
      beam.tw = Math.min(1, beam.tw + dt / BEAM.tweenSec);
      const k = outQuad(beam.tw);
      B.pivot.scale.copy(beam.from).lerp(beam.to, k);
      if (beam.orig.front) { beam.orig.front.matrix.elements[12] = beam.frontFrom + (beam.frontTo - beam.frontFrom) * k; beam.orig.front.matrixWorldNeedsUpdate = true; }
    }
    if (beam.pointing) B.q0.slerp(beamLookQuat(B), Math.min(1, BEAM.lookSpeed * dt));
  }

  // ------------------------------------------------------------------ thời tiết (FinaleCutsceneLogic.TransitionToWeather)
  function transitionToWeather(name) {
    const W = root.DRSky && DRSky.weather, E = root.DR_ENV && DR_ENV.weather;
    if (E) { if (transitionSecBefore == null) transitionSecBefore = E.transitionSec; E.transitionSec = WEATHER_SEC; }
    if (W && W.change) W.change(name);
    else D.emit('weather', name);
  }

  // ------------------------------------------------------------------ bộ nhận tín hiệu (FinaleCutsceneLogic)
  const methods = F.methods = {
    ToggleGameUI: on => toggleGameUI(on),
    ToggleScrim: on => toggleScrim(on),
    TransitionToWeather: name => transitionToWeather(name),
    FlickerBoatLights: after => flickerLights(after),
    ToggleEngineAudio: on => { engineOff = !on; },
    ToggleBoatModel: on => toggleBoatModel(on),
    ToggleFinaleAudioSnapshot: sec => musicOnly(sec),
    ToggleRegularAudioSnapshot: () => restoreAudio(),
    PlayGoodCreditsMusic: () => creditsMusic('good'),
    PlayBadCreditsMusic: () => creditsMusic('bad'),
    ToggleLighthousePointing: on => pointBeam(on),
    DestroyGreaterMarrow: () => {
      if (root.DRFinaleCut && DRFinaleCut.destroyGreaterMarrow) DRFinaleCut.destroyGreaterMarrow();
      else info('DestroyGreaterMarrow: ruined Greater Marrow belongs to W6b (js/finale_cut.js), not built');
    },
    // VibrationManager.Vibrate: rung tay cầm; web không có rung toàn thân — bỏ qua (điện thoại: navigator.vibrate ngắn) [ĐỀ XUẤT]
    Vibrate: n => { try { if (navigator.vibrate) navigator.vibrate(120 + 40 * n); } catch (e) { /* không hỗ trợ */ } },
    CutToCredits: () => {
      setVcam(VCAM_CREDITS, true, true);                                      // creditsVCam.enabled = true (cắt, Priority cao)
      unlockMovement();
      const B = root.DRBoat; if (B && B.place) B.place(CREDITS_POS[0], CREDITS_POS[1], D.s.boat.yaw);
      if (cut) cut.credits = true;
      if (root.DRMenus && DRMenus.credits) DRMenus.credits.play({ mode: 'game' });
      else D.setMode('title');                                                // không có credits: LoadTitleFromGame ngay
    }
  };
  function signal(name) {
    const r = RECEIVER[name];
    if (!r) { info('signal "' + name + '" has no receiver'); return false; }
    if (cut) cut.fired.push(name);
    D.emit('finaleSignal', name);
    methods[r[0]](r[1]);
    return true;
  }
  F.signal = signal;

  // ------------------------------------------------------------------ cảnh kết
  function playCutscene(kind) {
    ignoreDamage(true); lockBoat(true);
    D.emit('cutsceneToggled', true);                                          // GameEvents.TriggerCutsceneToggled(showing: true)
    cut = { kind, t: 0, i: 0, fired: [], ext: false, credits: false };
    D.emit('finaleCutscene', kind);
    const W6b = root.DRFinaleCut;
    if (W6b && W6b.play && W6b.play(kind, { signal, timeline: TIMELINE[kind] })) { cut.ext = true; return; }
  }
  function stepCut(dt) {
    if (!cut || cut.ext) return;
    cut.t += dt * (F.timeScale || 1);
    const tl = TIMELINE[cut.kind];
    while (cut && cut.i < tl.length && tl[cut.i][0] <= cut.t) signal(tl[cut.i++][1]);
  }

  // ------------------------------------------------------------------ lệnh Yarn
  function register() {
    const Y = root.DRYarn;
    if (!Y || !Y.command) { console.warn('[finale] DRYarn.command missing: finale commands stay stubs'); return; }
    Y.command('DoFinalePreparations', () => {
      D.s.forbidSave = true;                                                  // SaveData.ForbidSave
      D.s.vars['time-frozen'] = true;                                         // Time.ToggleFreezeTime(true) (js/sky.js đọc cờ)
      if (!weatherBefore) weatherBefore = (root.DRSky && DRSky.weather && DRSky.weather.name) || D.s.weather || null;
      D.emit('finaleVoyageStarted');
    });
    Y.command('DoFinaleCutscenePreparations', () => { F.castingForbidden = true; D.emit('finaleCutsceneStarted'); });
    Y.command('EnableBadFinalePOI', () => {
      voyage = 'bad'; if (root.DRPoi) DRPoi.enable(POI_ID, true);
      // badEnableObjects: Finale_Inspect + BadEndingBeam (hai hệ hạt Beam/Beam2, RelicBeam_Mat; tools/particles.py NAMED). Finale_Inspect quay
      // −90° quanh y trong Unity ⇒ yaw +90° ở three.js
      if (root.DRParticles && !beacon) { try { beacon = DRParticles.spawn('BadEndingBeam', { pos: [POI.x, 0, POI.z], yaw: Math.PI / 2, loop: true }); } catch (e) { beacon = null; } }
    });
    Y.command('EnableGoodFinalePOI', () => { voyage = 'good'; if (root.DRPoi) DRPoi.enable(POI_ID, true); });
    Y.command('TogglePointToFinalePOI', a => pointBeam(bool(a[0])));
    Y.command('UnlockPlayerMovement', () => unlockMovement());
    Y.command('ToggleLookAtFinaleVCam', a => setVcam(VCAM_GM, bool(a[0])));
    Y.command('PlayBadFinaleCutscene', () => playCutscene('bad'));
    Y.command('PlayGoodFinaleCutscene', () => playCutscene('good'));
  }

  // ------------------------------------------------------------------ chặn điều khiển trong cảnh kết (lớp input cutscene)
  function blockInput(e) {
    if (!cut || e.code === 'Escape') return;                                  // Esc: W7 giữ 1 s để bỏ qua credits
    if (e.type === 'keydown' || e.type === 'keyup') { e.stopImmediatePropagation(); e.preventDefault(); return; }
    if (e.button === 2 || e.type === 'contextmenu') { e.stopImmediatePropagation(); e.preventDefault(); }   // năng lực (chuột phải)
  }
  for (const t of ['keydown', 'keyup', 'pointerdown', 'mousedown', 'contextmenu']) root.addEventListener(t, blockInput, true);

  // ------------------------------------------------------------------ về màn đầu: dọn mọi thứ (LoadTitleFromGame nạp lại cảnh)
  function cleanup() {
    const hadAny = voyage || cut || uiHidden || boatHidden || beam.pointing || vcam || snap || engineOff;
    cut = null; voyage = null; flick = null; F.castingForbidden = false;
    if (beacon) { try { beacon.stop(); } catch (e) { /* đã tắt */ } beacon = null; }
    if (!hadAny && transitionSecBefore == null) return;
    toggleGameUI(true);
    if (scrimEl) { scrimEl.style.transitionDuration = '0s'; scrimEl.style.opacity = '0'; scrimEl.dataset.on = '0'; }
    toggleBoatModel(true); ignoreDamage(false); lockBoat(false);
    if (root.DRBoat && DRBoat.lightOverride) DRBoat.lightOverride(null);
    resetBeam();
    vcam = null; restoreCamOverride();
    restoreAudio();
    if (root.DRAudio && DRAudio.stopStinger) DRAudio.stopStinger(1);
    if (transitionSecBefore != null && root.DR_ENV && DR_ENV.weather) DR_ENV.weather.transitionSec = transitionSecBefore;
    transitionSecBefore = null;
    if (weatherBefore && root.DRSky && DRSky.weather && DRSky.weather.set) DRSky.weather.set(weatherBefore);
    weatherBefore = null;
    D.emit('cutsceneToggled', false);
  }
  D.on('mode', m => { if (m === 'title') cleanup(); });
  D.on('load', cleanup); D.on('newgame', cleanup);

  // ------------------------------------------------------------------ nhịp riêng (đứng khi tạm dừng)
  const paused = () => { const e = document.getElementById('dr-pause'); return !!e && !e.hidden; };
  let last = 0;
  function frame(now) {
    root.requestAnimationFrame(frame);
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0); last = now;
    if (!D.s || D.mode === 'title' || paused()) return;
    stepCut(dt);
    stepBeam(dt);
    if (flick) {
      flick.t += dt * (F.timeScale || 1);
      const k = root.DRAnim && DRAnim.evalCurve ? DRAnim.evalCurve(FLICKER, Math.min(1, flick.t / FLICKER_SEC)) : 0;
      if (root.DRBoat && DRBoat.lightOverride) DRBoat.lightOverride(k);
      if (flick.t >= FLICKER_SEC) {
        if (root.DRBoat && DRBoat.lightOverride) DRBoat.lightOverride(null);
        if (!flick.enableAfter && root.DRBoat && DRBoat.setLights) DRBoat.setLights(false);
        flick = null;
      }
    }
    if (snap && root.DRAudio && DRAudio.setVolume) {
      snap.t += dt * (F.timeScale || 1);
      const k = Math.max(0, 1 - snap.t / snap.dur);
      for (const b of ['sfx', 'ui', 'voice']) DRAudio.setVolume(b, snap.from[b] * k);
      if (k <= 0) snap.t = snap.dur;
    }
  }

  function init() {
    register();
    wrapAudio();
    if (root.DRPoi) DRPoi.onAutoMove = a => autoMoveTo(a);                   // AutoMovePOI (js/poi.js mối nối của W3)
    root.requestAnimationFrame(frame);
  }
  if (document.body) init(); else document.addEventListener('DOMContentLoaded', init);

  F.state = () => ({
    voyage, beacon: !!(beacon && beacon.alive !== false), ui: !uiHidden, boatVisible: !boatHidden, engineOff, forbidSave: !!(D.s && D.s.forbidSave), frozen: !!(D.s && D.s.vars && D.s.vars['time-frozen']),
    poiOn: !!(D.s && D.s.poiOn && D.s.poiOn[POI_ID]),
    cut: cut ? { kind: cut.kind, t: +cut.t.toFixed(2), fired: cut.fired.slice(), ext: cut.ext, credits: cut.credits } : null,
    beam: { pointing: beam.pointing, tw: +beam.tw.toFixed(3), scale: beamRef() ? beamRef().pivot.scale.toArray().map(v => +v.toFixed(2)) : null },
    vcam: vcam ? { which: vcam.def === VCAM_GM ? 'GreaterMarrowFinaleVCam' : 'Credits_VCam', w: +vcam.w.toFixed(3), dir: vcam.dir } : null,
    scrim: scrimEl ? scrimEl.dataset.on === '1' : false, snapshot: snap ? +(1 - snap.t / snap.dur).toFixed(3) : null
  });
  F.TIMELINE = TIMELINE; F.RECEIVER = RECEIVER; F.POI = POI;
  F.beamDir = () => {
    const B = beamRef(); if (!B) return null;
    const T = root.THREE; B.pivot.updateWorldMatrix(true, false);
    const x = new T.Vector3(1, 0, 0).transformDirection(B.pivot.matrixWorld), p = new T.Vector3().setFromMatrixPosition(B.pivot.matrixWorld);
    const to = new T.Vector3(POI.x - p.x, 0, POI.z - p.z).normalize();
    return { dot: +(x.x * to.x + x.z * to.z).toFixed(4) };
  };
})(window);
