// Bảng chỉnh mô phỏng Tốc Độ. Mỗi số có nguồn:
//   // src: <asset gốc trong ~/zingspeed-ref/dump/carparams>.<trường>   (đường cong AnimationCurve lấy các khoá, nội suy tuyến tính)
//   // chọn: số do ta chọn (gốc không có trường tương ứng, hoặc trường có nhưng không rõ đơn vị).
// Đơn vị: km/h cho tốc độ, độ cho góc, giây cho thời gian, trừ khi ghi khác. Đường cong = [[x, y], ...].
(function (G) {
  var TD = G.TD = G.TD || {};
  TD.TUNING = {
    dt: 1 / 120,                       // chọn: bước cố định của mô phỏng
    gravity: 63.75,                    // src: CheckPointConfig.CheckPointDataList[].Gravity.y (mọi map đã xem)
    halfWidth: 0.9,                    // src: CarChassis_00.m_boundSize.x 1.9 / 2, làm tròn xuống
    radius: 1.1,                       // chọn: bán kính va chạm xe–xe (CarChassis_00.m_boundSize 1.9 × 2.9)
    wheelbase: 2.0,                    // chọn: ~ m_boundSize.z 2.9 trừ phần nhô

    // --- Dọc ---
    topKmh: 198,                       // chọn: không có trường tốc độ tối đa trong CarEngine_*; m_driftHighKMPH_Curve (CarDrift_00) chạy 180–210
    accel: 15.5,                       // chọn: m/s² ở nấc lực 1.0 → 0–100 km/h ≈ 1.8 s
    powerChain: [[50, 1.0], [90, 0.05]], // src: CarEngine_00.m_powerChainFactorCurve (x = % tốc độ tối đa → hệ số lực)
    powerFloor: 0.16,                  // chọn: sàn hệ số lực để còn chạm tốc độ tối đa sau ~4 s
    brake: [[0, 80], [300, 200]],      // src: CarEngine_00.m_brakeReverseForceCurve (km/h → km/h mỗi giây)
    reverseTopKmh: 106.39,             // src: CarEngine_00.m_reverseTopKMPH
    reverseAccel: 9,                   // chọn: m/s²
    coastKmhS: 18,                     // chọn: nhả ga mất 18 km/h mỗi giây
    overTopKmhS: 9,                    // chọn: vượt trần (sau tăng tốc) tụt dần 9 km/h mỗi giây — giữ đà như bản gốc
    fallBehindTop: [[0, 0], [0.01, 3], [0.12, 17], [0.24, 19]],   // src: CarEngine_00.FallBehindCompeTopVelCurve (x = khoảng cách sau người dẫn / chiều dài vòng → +km/h trần), chỉ bot
    fallBehindAccel: [[0, 0], [0.01, 1.5], [0.12, 8.5], [0.24, 10.5]], // src: CarEngine_00.FallBehindCompeDynamicCurve (→ +km/h mỗi giây), chỉ bot

    // --- Lái ---
    maxSteerAngle: [[0, 32], [299.964, 20]],         // src: CarSteer_00.m_maxSteerAngleCurve (km/h → độ bánh)
    drivingMaxAngSpeed: [[0.24, 82], [0.7, 58], [0.95, 40]], // src: CarSteer_00.m_drivingMaxAngSpeedCurve (tốc độ/tối đa → độ/s)
    steerIntensity: [[0, 0.6], [0.8, 1.0]],          // src: CarSteer_00.m_JoystickHorizontalDrivingIntensityScale (|lái| → hệ số)
    steerTau: 0.07,                    // chọn: hằng thời gian làm mượt tốc độ quay (< 0.15 s cho cảm giác nhạy)
    grip: 14,                          // chọn: 1/s, hướng vận tốc bám theo đầu xe khi chạy thường
    airAngSpeed: 60,                   // src: CarLeap_00.m_leapMaxAngSpeed (độ/s khi bay)

    // --- Drift ---
    driftMinKmh: 45,                   // src: CarDrift_00.m_BrakeTimeEndGeneralDriftingMinMPH
    driftMaxAngSpeed: 175,             // src: CarDriftExt_00.m_driftMaxAngSpeed (độ/s, lái hết về phía drift)
    driftAngScale: [-0.2, 0.55, 1.0],    // chọn: hệ số trên driftMaxAngSpeed khi lái ngược / thả / cùng chiều drift (lái ngược hết thì đầu xe quay về, giữ được trượt dài)
    driftVelLerp: [[46, 3.5], [55, 0.85], [90, 0.85], [100, 2.0], [105, 2.2]], // src: CarDrift_00.m_slidingVelocityDirLerpCurve (VD độ → 1/s)
    driftVelLerpFloor: 3.0,            // chọn: sàn của đường cong trên
    driftVelLerpScale: 0.65,           // chọn: nhân đường cong trên → thả lái giữa VD ≈ 42° (vùng hoàn hảo), lái hết vào cua chạm driftVdMax
    driftVdMax: 80,                    // src: CarDrift_00.LongDriftingLessMaxVDAngle
    driftDecel: [[0, 0], [20, -80], [60, -100], [140, -320]], // src: CarDriftExt_00.m_driftAccelerationCurve (VD độ → km/h mỗi giây)
    driftDecelScale: 0.11,             // chọn: hệ số nhân đường cong trên (đơn vị gốc có khối lượng)
    driftSpeedFactor: [[83, 0.45], [96, 0.05]], // src: CarDriftExt_00.m_driftSpeedFactorCurve (% tốc độ tối đa → phần lực máy còn lại khi drift)
    driftEndBackSteer: 0.6,            // src: CarSteer_00.m_driftEndBackSteerSpeed (rad/s đầu xe quay ngược về hướng chạy khi nhả drift)
    driftCollEnd: 0.3,                 // chọn: va tường mạnh hơn mức này (0..1) thì dứt drift (gốc: CarDrift_00.m_driftCollisionEndDelay 0.1 s)

    // --- Nitro ---
    gaugeRate: 0.008,                  // chọn: bình đầy theo ∫ tốc độ(m/s)·sin(VD)·dt; ~4–5 cú drift tốt = 1 bình
    maxCharges: 2,                     // chọn: 2 ô nitro như HUD gốc
    nitroTime: 3.0,                    // chọn: giây
    nitroMul: 1.36,                    // chọn: trần × 1.36 (198 → 269 km/h)
    boostAccel: 18,                    // chọn: m/s² khi đang tăng tốc (nitro/phun nhỏ)
    miniWindow: 1.0,                   // src: CarTurbo_00.m_LastDriftKeyAndFirstMiniBoostTime
    miniTime: 1.4,                     // src: CarTurbo_00.m_miniBoostDelay
    miniMinVD: 35,                     // src: CarTurbo_00.m_miniBoostMinVDAngle (từ đây là "hoàn hảo")
    miniMaxVD: 50,                     // src: CarTurbo_00.m_miniBoostMaxVDAngle
    miniAnyVD: 10,                     // chọn: VD lúc nhả dưới mức này thì không có phun nhỏ
    miniKmh: 30,                       // chọn: +km/h trần lúc phun nhỏ thường
    miniPerfectKmh: 42,                // chọn: +km/h trần khi VD trong [miniMinVD, miniMaxVD]
    miniOnNitro: 0.3,                  // chọn: phun nhỏ khi đang nitro chỉ cộng 30% (trần nitro ≈ +36%, tối đa ~+42%)
    miniKick: 0.45,                    // chọn: phần của lượng trên cộng ngay vào tốc độ
    dualWindow: 0.2,                   // src: CarTurbo_00.mDualBoostDelayCheckTime
    stackCoef: [1.0, 0.5, 0.3, 0.2, 0.1, 0.0], // src: CarTurbo_00.mDeductExtraMaxKMPHCoef (phun thứ n trong chuỗi)
    startWindow: 0.25,                 // chọn: nhấn ga trong ±0.25 s quanh GO
    startKmh: 40,                      // chọn
    startTime: 1.2,                    // chọn

    // --- Va chạm ---
    wallKeep: [[0, 0.98], [80, 0.75]],       // src: CarCollision_00.m_fenceCollisionDumpTangVelCoef (góc va độ → phần vận tốc tiếp tuyến giữ lại)
    wallKeepFront: [[0, 0.5], [80, 0.3]],    // src: CarCollision_00.m_frontFenceCollisionDumpTangVelCoef
    wallFrontAngle: 60,                      // src: 180 − CarCollision_00.m_fenceCollHeadSideAngle 150 = 30° quanh pháp tuyến → góc va > 60°
    wallBounce: [[0, 0], [60, 22], [150, 70]], // src: CarCollision_00.m_fenceCollisionBounceKMPH (km/h vào tường → km/h bật ra)
    wallAlign: 0.9,                          // src: CarCollision_00.m_extraSteerCollWallTangentCoef (đầu xe xoay theo tiếp tuyến)
    carRestitution: 0.85,                    // src: CarCollision_00.m_collideRemoteCarRestitutionCoef

    // --- Bay ---
    landPowerVy: 25,                   // chọn: m/s rơi tương ứng power 1

    // --- Hồi sinh / luật ---
    respawnFreeze: 0.6,                // chọn
    ghostTime: 1.5,                    // chọn (đề bài)
    wrongWayTime: 4,                   // chọn (đề bài)
    stuckTime: 5,                      // chọn
    fallDepth: 8,                      // chọn: m dưới mặt đường
    offRoad: 6,                        // chọn: m ra ngoài mép mà không có tường chặn (mất ruy băng)
    countdown: 3,                      // chọn: 3-2-1-GO
    finishGrace: 10,                   // chọn: luật QQ Speed — sau người về nhất, người khác còn 10 s

    // --- Bot ---
    botSpeed: [0.92, 1.0],             // chọn (đề bài): trần bot / trần xe người chơi
  };
})(typeof window !== 'undefined' ? window : globalThis);
