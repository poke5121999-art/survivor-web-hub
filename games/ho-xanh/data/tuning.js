// Mọi con số của Hố Xanh. [DtD] = lấy từ bảng dữ liệu/bản gốc; [ĐỀ XUẤT] = tự chọn, chỉnh theo cảm giác.
// Đơn vị: 1 đơn vị thế giới = 1 m = 100 px ảnh gốc.
window.HX_TUNING = {
  view: {
    fov: 38,                 // [DtD] MainCamera gốc: phối cảnh 38°
    dist: 18.5,              // [DtD] CinemachineFramingTransposer.m_CameraDistance: khung nhìn cao ~12,7 m ở mặt z=0
    distShort: 12.5,         // [ĐỀ XUẤT] màn thấp (điện thoại ngang) kéo camera lại gần cho Dave khỏi bé
    shortH: 420,             // [ĐỀ XUẤT] màn cao từ mức này (px CSS) trở xuống dùng distShort
    tallH: 820,              // [ĐỀ XUẤT] từ mức này trở lên dùng dist gốc
    maxPixelRatio: 1.5,      // [ĐỀ XUẤT] trần mật độ điểm ảnh khi vẽ
    maxPixels: 2400000,      // [ĐỀ XUẤT] trần số điểm ảnh khung vẽ
    msaa: 4,                 // [ĐỀ XUẤT] khử răng cưa cạnh đá (WebGL2)
    follow: 2.6,             // [ĐỀ XUẤT] độ bám camera (1/s); gốc dùng damping 1 của Cinemachine
    lookahead: 0.45,         // [ĐỀ XUẤT] camera nhìn trước theo vận tốc (giây)
    lookaheadMax: 2.2,       // [ĐỀ XUẤT] m
    aimLead: 0.22,           // [ĐỀ XUẤT] camera dạt về phía điểm ngắm
    aimLeadMax: 1.6,         // [ĐỀ XUẤT]
    boundX: 55,              // [DtD] CameraBound gốc: x ∈ [-55, 55]
    cutRadius: 1.1,          // [ĐỀ XUẤT] đá tiền cảnh che Dave thì thưa đi trong bán kính này (m)
  },
  water: {
    surfaceY: 20.5,          // [ĐỀ XUẤT] cameraBound gốc chặn mép trên khung nhìn ở y=19; mặt nước đặt ngay trên đó
    fogMax: 1,               // [ĐỀ XUẤT] sương xa nhất che hẳn
    caustic: 0.55,           // [ĐỀ XUẤT] độ sáng vân nắng trên đá gần mặt
    causticDepth: 26,        // [ĐỀ XUẤT] vân nắng tắt hẳn ở độ sâu này (m)
  },
  dive: {
    entryY: 19,              // [ĐỀ XUẤT] mép vào của tầng dưới (toạ độ riêng) đặt chạm đáy tầng trên
    bands: { A: [0, 50], B: [50, 130], C: [130, 250] }, // [DtD wiki] dải mét của vùng nông / tầng giữa / vực sâu
    blend: 10,               // [ĐỀ XUẤT] trộn ánh sáng hai tầng trong khoảng này quanh ranh giới (m)
    surfaceBlend: 7,         // [ĐỀ XUẤT] hồ sơ màu Surface gốc phủ trong khoảng này dưới mặt nước (m)
    lampFrom: 95,            // [ĐỀ XUẤT] ban ngày, đèn đội đầu bật dần từ độ sâu này (m)
    lampFull: 150,           // [ĐỀ XUẤT]
    spriteDark: 0.35,        // [ĐỀ XUẤT] Dave, cá ở đáy sâu nhất còn sáng bằng này so với trên mặt
    lightGain: 1.4,          // [ĐỀ XUẤT] đá gốc sáng hơn ~1,4 lần so với màu môi trường + nắng (đo trên ảnh chụp Steam); đèn cảnh gốc không rút được
    ambientFloor: 0.5,       // [ĐỀ XUẤT] ánh sáng nền tối thiểu (C gốc 0,31 nhưng bù bằng đèn điểm trong cảnh)
    bloomScale: 0.35,        // [ĐỀ XUẤT] loá sáng rẻ bằng mipmap mạnh hơn chuỗi làm mờ của URP, nên thu nhỏ cường độ gốc
  },
  diver: {
    radius: 0.18,            // [ĐỀ XUẤT] bán kính va chạm
    accel: 9,                // [ĐỀ XUẤT] m/s²
    maxSpeed: 2.1,           // [ĐỀ XUẤT] m/s
    boostSpeed: 3.6,         // [ĐỀ XUẤT]
    aimSpeed: 1.0,           // [ĐỀ XUẤT] bơi chậm khi đang ngắm
    drag: 2.6,               // [ĐỀ XUẤT] lực cản nước (1/s)
    dashSpeed: 5.5,          // [ĐỀ XUẤT] vận tốc cú lướt
    dashTime: 0.32,          // [ĐỀ XUẤT] 5 khung × 12 fps ≈ 0.42s của ShortDash, cắt sớm cho gọn
    dashCooldown: 0.9,       // [ĐỀ XUẤT]
    turnRate: 10,            // [ĐỀ XUẤT] tốc độ xoay người theo hướng bơi
    hurtTime: 0.45,          // [ĐỀ XUẤT]
    bigHurtAt: 10,           // [ĐỀ XUẤT] sát thương từ mức này dùng Bigdamage
    invulnTime: 1.1,         // [ĐỀ XUẤT]
    knockback: 3.2,          // [ĐỀ XUẤT]
    enterTime: 1.2,          // [ĐỀ XUẤT] thời gian nhảy xuống nước đầu lượt
  },
  o2: {
    max: 100,                // [DtD] bình dưỡng khí cơ bản
    drain: 0.45,             // [ĐỀ XUẤT] mỗi giây ở mặt nước
    drainPerMeter: 0.0025,   // [ĐỀ XUẤT] cộng thêm mỗi mét sâu (mét hiển thị); ở 250 m đốt ~1,1/giây
    boostMul: 2.4,           // [ĐỀ XUẤT] bơi tăng tốc đốt khí nhanh hơn
    chestGain: 30,           // [ĐỀ XUẤT] một hòm dưỡng khí
    chestRange: 0.9,         // [ĐỀ XUẤT] tự mở khi chạm
    podRange: 0.8,           // [ĐỀ XUẤT] chạm khoang cứu hộ trong khoảng này là lên thuyền
    lowAt: 25,               // [ĐỀ XUẤT] báo động
    breatheEvery: 2.6,       // [ĐỀ XUẤT] tiếng thở gấp khi thiếu khí
  },
  harpoon: {
    damage: 3,               // [DtD] súng xiên cơ bản (Harpoon gun lv1)
    speed: 16,               // [ĐỀ XUẤT] m/s
    range: 5.5,              // [ĐỀ XUẤT] m
    returnSpeed: 20,         // [ĐỀ XUẤT]
    reelSpeed: 4.5,          // [ĐỀ XUẤT] kéo cá về
    minReady: 0.12,          // [ĐỀ XUẤT] HookAttackReady 2 khung × 10 fps
    fireHold: 0.14,          // [ĐỀ XUẤT] giữ dáng HookAttackFire
    gunTip: [0.14, -0.06],   // [ĐỀ XUẤT] đo trên ô HookAttackArm: đầu nòng so với khớp vai (m, khi quay phải)
  },
  tug: {
    minSize: 1,              // [ĐỀ XUẤT] cá từ cỡ này trở lên mới giằng co
    triggerHpFrac: 0.6,      // [ĐỀ XUẤT] trúng mà máu còn dưới mức này → giằng co
    time: 4.0,               // [ĐỀ XUẤT] giây
    tapGain: 0.075,          // [ĐỀ XUẤT] mỗi lần bấm đẩy thanh lên (với cá còn hpRef máu)
    hpRef: 12,               // [ĐỀ XUẤT] cá còn nhiều máu hơn mức này thì mỗi lần bấm được ít hơn (tối thiểu ×0.2)
    decay: 0.16,             // [ĐỀ XUẤT] thanh tụt mỗi giây
    pull: 1.6,               // [ĐỀ XUẤT] cá kéo Dave đi (m/s)
    perfectAt: 0.55,         // [ĐỀ XUẤT] xong trước mốc thời gian này = "hoàn hảo"
  },
  knife: {
    damage: 2,               // [ĐỀ XUẤT]
    range: 0.75,             // [ĐỀ XUẤT]
    time: 0.3,               // [DtD] MeleeDaggerAtk 4 khung × 15 fps ≈ 0.27s
    hitAt: 0.1,              // [ĐỀ XUẤT]
    cooldown: 0.4,           // [ĐỀ XUẤT]
  },
  fish: {
    pxToUnit: 0.01,          // [DtD] cùng mật độ điểm ảnh với Dave
    alive: [42, 56],         // [ĐỀ XUẤT] số cá quanh camera: [nông, sâu]
    spawnMin: 6.5,           // [ĐỀ XUẤT] khoảng cách tối thiểu từ camera khi sinh (ngoài mép khung nhìn)
    spawnMax: 17,            // [ĐỀ XUẤT]
    despawn: 30,             // [ĐỀ XUẤT]
    speed: [0.55, 0.8, 1.0], // [ĐỀ XUẤT] tốc độ bơi theo cỡ 0/1/2
    sprintMul: 3.2,          // [ĐỀ XUẤT]
    sight: 4.5,              // [ĐỀ XUẤT] cá hung dữ thấy Dave
    fleeRange: 2.6,          // [ĐỀ XUẤT] Dave bơi tăng tốc lại gần thì cá nhỏ chạy
    fleeTime: 2.2,           // [ĐỀ XUẤT]
    angryTime: 6,            // [ĐỀ XUẤT] cá có sát thương mà bị đánh thì cắn lại
    biteRange: 0.45,         // [ĐỀ XUẤT] tính thêm bán kính thân cá
    biteCooldown: 1.4,       // [ĐỀ XUẤT]
    school: [3, 6],          // [ĐỀ XUẤT] đàn cá nhỏ
    schoolMaxHp: 4,          // [ĐỀ XUẤT] cá máu ≤ mức này mới bơi đàn
    rareWeight: 0.35,        // [ĐỀ XUẤT] hệ số xuất hiện của cá hạng ≥ 3
    puffRange: 1.6,          // [ĐỀ XUẤT] cá nóc phồng khi Dave lại gần
    puffTime: 3,             // [ĐỀ XUẤT]
    puffHit: 0.5,            // [ĐỀ XUẤT] cá nóc phồng tròn ~0.7 m, chạm trong bán kính này là bị gai đâm
  },
  deco: {
    sway: { anemone: 0.05, waveweed: 0.22, kelp: 0.4 }, // [ĐỀ XUẤT] biên độ lắc theo sóng (m) của rong, hải quỳ
    rockLight: 1,            // [ĐỀ XUẤT] hệ số nắng trên đá (bản gốc _LightFactor 0,8 ở A, 0,5 ở C)
    rays: 10,                // [ĐỀ XUẤT] số vệt nắng
    dust: 420,               // [ĐỀ XUẤT] hạt bụi trôi
  },
  fx: {
    trailEvery: 0.16,        // [ĐỀ XUẤT] bọt khí từ bình
    boostTrailEvery: 0.06,   // [ĐỀ XUẤT]
    shake: 0.12,             // [ĐỀ XUẤT] biên độ rung khi bị cắn (m)
  },
};
