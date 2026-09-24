// Mọi con số của Hố Xanh. [DtD] = lấy từ bảng dữ liệu/bản gốc; [ĐỀ XUẤT] = tự chọn, chỉnh theo cảm giác.
// Đơn vị: 1 đơn vị thế giới = 1 m = 100 px ảnh gốc.
window.HX_TUNING = {
  view: {
    fov: 26,                 // [ĐỀ XUẤT] bản gốc 38°; hẹp hơn để lùi camera ra xa, đá tiền cảnh bớt phình mà Dave vẫn đủ to
    height: 6.5,             // [ĐỀ XUẤT] bề cao khung nhìn ở mặt z=0 (m); đá tiền cảnh nhô tới z≈+10 nên camera phải lùi ≥ 12 m
    pxPerUnit: 100,          // [DtD] ppu của sprite: 1 px ảnh gốc = 1 px khung vẽ thấp ở mặt z=0
    maxRtHeight: 720,        // [ĐỀ XUẤT] trần độ phân giải khung vẽ thấp
    follow: 5,               // [ĐỀ XUẤT] độ bám camera (1/s)
    aimLead: 0.22,           // [ĐỀ XUẤT] camera dạt về phía điểm ngắm
    aimLeadMax: 1.4,         // [ĐỀ XUẤT]
    cutRadius: 0.9,          // [ĐỀ XUẤT] đá tiền cảnh che Dave thì thưa đi trong bán kính này (m)
  },
  water: {
    surfaceY: 20.5,          // [ĐỀ XUẤT] cameraBound gốc chặn mép trên khung nhìn ở y=19; mặt nước đặt ngay trên đó
    deepY: -34,              // [ĐỀ XUẤT] đáy hố trong các bản đồ A
    shallow: [0.16, 0.60, 0.74], // [ĐỀ XUẤT] màu nước sát mặt
    deep: [0.02, 0.08, 0.21],    // [ĐỀ XUẤT] màu nước đáy
    deepMul: [0.40, 0.52, 0.68], // [ĐỀ XUẤT] vật ở đáy tối đi bao nhiêu
    fogNear: 6,              // [ĐỀ XUẤT] tính từ camera (m)
    fogFar: 62,              // [ĐỀ XUẤT]
    fogMax: 0.92,            // [ĐỀ XUẤT]
    caustic: 0.55,           // [ĐỀ XUẤT] độ sáng vân nắng trên đá gần mặt
    causticDepth: 22,        // [ĐỀ XUẤT] vân nắng tắt hẳn ở độ sâu này (m)
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
    drain: 0.75,             // [ĐỀ XUẤT] mỗi giây ở mặt nước
    drainPerMeter: 0.012,    // [ĐỀ XUẤT] cộng thêm mỗi mét sâu
    boostMul: 2.4,           // [ĐỀ XUẤT] bơi tăng tốc đốt khí nhanh hơn
    chestGain: 30,           // [ĐỀ XUẤT] một hòm dưỡng khí
    chestRange: 0.9,         // [ĐỀ XUẤT] tự mở khi chạm
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
    zoneBDepth: 22,          // [ĐỀ XUẤT] từ độ sâu này cá vùng B bắt đầu xuất hiện
    zoneBFull: 40,           // [ĐỀ XUẤT] tới đây thì 75% là cá vùng B
    school: [3, 6],          // [ĐỀ XUẤT] đàn cá nhỏ
    schoolMaxHp: 4,          // [ĐỀ XUẤT] cá máu ≤ mức này mới bơi đàn
    rareWeight: 0.35,        // [ĐỀ XUẤT] hệ số xuất hiện của cá hạng ≥ 3
    puffRange: 1.6,          // [ĐỀ XUẤT] cá nóc phồng khi Dave lại gần
    puffTime: 3,             // [ĐỀ XUẤT]
    puffHit: 0.5,            // [ĐỀ XUẤT] cá nóc phồng tròn ~0.7 m, chạm trong bán kính này là bị gai đâm
  },
  deco: {
    everyMin: 0.5,           // [ĐỀ XUẤT] khoảng cách giữa hai vật trang trí trên mép đá (m)
    everyMax: 1.7,           // [ĐỀ XUẤT]
    scale: [1.2, 1.9],       // [ĐỀ XUẤT] phóng to san hô/rong so với 100 px/m để đọc được cạnh khối đá lớn
    maxSlope: 0.55,          // [ĐỀ XUẤT] mép dốc hơn thì không đặt
    spineChance: 0.22,       // [ĐỀ XUẤT] tỉ lệ rong Spine
    groupChance: 0.12,       // [ĐỀ XUẤT] tỉ lệ cụm san hô màu
    rays: 7,                 // [ĐỀ XUẤT] số vệt nắng
    dust: 260,               // [ĐỀ XUẤT] hạt bụi trôi
    farScale: 16,            // [ĐỀ XUẤT] phóng FarBG001-003 thành dãy núi xa
    farTint: 0x3d7f95,       // [ĐỀ XUẤT] màu bóng núi xa trước khi hoà vào sương
  },
  fx: {
    trailEvery: 0.16,        // [ĐỀ XUẤT] bọt khí từ bình
    boostTrailEvery: 0.06,   // [ĐỀ XUẤT]
    shake: 0.12,             // [ĐỀ XUẤT] biên độ rung khi bị cắn (m)
  },
};
