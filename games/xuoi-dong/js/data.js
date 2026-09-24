/*
 * Xuôi Dòng — mọi con số và bảng của game. Code ở game.js/render.js chỉ đọc các bảng này,
 * không rẽ nhánh theo tên khúc sông, tên cá hay tên giờ trong ngày.
 * Nhãn: [FC] = lấy từ Farming Camp Demo (scene level9 / bảng chữ tiếng Anh của game),
 *       [ĐỀ XUẤT] = tự cân cho nhịp "chill".
 */
(function (XD) {
  'use strict';

  XD.TUNE = {
    cruise: 72,          // px/giây khi thả trôi [ĐỀ XUẤT]: một vòng ROUTE ≈ 9 phút
    slow: 34, fast: 128, boost: 190,
    steer: 150,          // px/giây tối đa khi lái lên/xuống
    riverHalf: 110,      // nửa bề ngang lòng sông, px ảo
    blend: 900,          // px chuyển cảnh giữa hai chặng
    dayLen: 420,         // giây cho một vòng ngày đêm
    startT: 0.30,
  };

  // Mỗi khúc sông: ảnh bờ (bank_<bank>_top/bot.png do rip.py nướng từ level9), độ mở bờ
  // (0 = sông, 1 = biển), màu nhân lên đáy, bảng sinh vật thể và bảng cá.
  XD.BIOMES = {
    canyon: {
      name: 'Hẻm đá đỏ', bank: 'canyon', open: 0, floor: [1, 1, 1], deep: 0, swell: 0,
      spawn: { rock: 3, mossRock: 1, log: 2, barrel: 2, crate: 1, boost: 1, leaf: 2, turtle: 0.5 },
      fish: { A: 5, C: 3, F: 2, H: 2, J: 0.3 },
      birds: 1, butterflies: 1, fireflies: 1, sea: 0,
    },
    forest: {
      name: 'Rừng thông', bank: 'forest', open: 0, floor: [0.92, 1, 0.95], deep: 0, swell: 0,
      spawn: { rock: 1, mossRock: 3, log: 3, barrel: 1, crate: 1, boost: 1, leaf: 4, turtle: 1 },
      fish: { A: 4, C: 3, I: 3, F: 1, H: 1, J: 0.3 },
      birds: 1.2, butterflies: 1.3, fireflies: 1.4, sea: 0,
    },
    // [FC] level9 nhuộm đáy khúc đầm (1, 0.553, 0.42); ở đây nhẹ tay hơn vì còn nhân thêm giờ trong ngày.
    swamp: {
      name: 'Đầm lầy', bank: 'swamp', open: 0, floor: [1, 0.78, 0.66], deep: 0.05, swell: 0,
      spawn: { mossRock: 2, log: 3, alligator: 1, lily: 5, frog: 2, boost: 1, leaf: 1 },
      fish: { A: 3, I: 4, F: 2, J: 0.4 },
      birds: 0.8, butterflies: 1, fireflies: 2, sea: 0,
    },
    cave: {
      name: 'Hang đá', bank: 'cave', open: 0, floor: [0.8, 0.9, 1], deep: 0.25, swell: 0, dark: 0.45,
      spawn: { rock: 4, mossRock: 1, barrel: 3, crate: 2, boost: 1 },
      fish: { A: 3, C: 2, H: 2, J: 1 },
      birds: 0, butterflies: 0, fireflies: 0.6, sea: 0,
    },
    estuary: {
      name: 'Cửa sông', bank: 'forest', open: 0.25, floor: [0.9, 1, 1.05], deep: 0.1, swell: 0.4,
      spawn: { rock: 2, log: 1, barrel: 2, crate: 2, boost: 1, turtle: 1 },
      fish: { A: 2, H: 4, E: 2, F: 1, J: 0.3 },
      birds: 0.8, butterflies: 0.3, fireflies: 0.3, sea: 0.5,
    },
    sea: {
      name: 'Biển', bank: null, open: 1, floor: [0.68, 0.92, 1.0], deep: 0.16, swell: 1,
      spawn: { rock: 2, barrel: 3, crate: 3, boost: 1, turtle: 1.5 },
      fish: { D: 3, E: 4, G: 3, H: 1, J: 0.25 },
      birds: 0.4, butterflies: 0, fireflies: 0, sea: 1,
    },
  };

  // Lộ trình lặp mãi. Độ dài tính bằng px thế giới.
  XD.ROUTE = [
    { biome: 'canyon', len: 5200 },
    { biome: 'forest', len: 5200 },
    { biome: 'swamp', len: 4600 },
    { biome: 'cave', len: 3200 },
    { biome: 'canyon', len: 4200 },
    { biome: 'estuary', len: 3600 },
    { biome: 'sea', len: 7200 },
    { biome: 'estuary', len: 3000 },
    { biome: 'forest', len: 4200 },
  ];

  // Cá. name = tiếng Việt hiển thị, en = tên gốc [FC] nếu bảng chữ của demo có.
  // jump = khung nhảy (ló đầu → vọt → lặn); sprite _0 của A là bóng, của các loài khác là lúc ló đầu.
  XD.FISH = {
    A: { name: 'Cá chép', en: '', pts: 4, jump: ['FishA_1', 'FishA_2', 'FishA_3', 'FishA_4', 'FishA_5'], night: 1 },
    C: { name: 'Cá hồi suối', en: 'Trout', pts: 6, jump: 'FishC', night: 1 },
    D: { name: 'Cá hồng', en: '', pts: 12, jump: 'FishD', night: 1.5 },
    E: { name: 'Cá thu', en: '', pts: 8, jump: 'FishE', night: 1 },
    F: { name: 'Cá vược', en: 'Bass', pts: 8, jump: 'FishF', night: 1.3 },
    G: { name: 'Cá mú', en: 'Grouper', pts: 12, jump: 'FishG', night: 1.5 },
    H: { name: 'Cá hồi', en: 'Salmon', pts: 10, jump: 'FishH', night: 1 },
    I: { name: 'Cá tứ vân', en: 'Tiger Barb', pts: 6, jump: 'FishI', night: 0.8 },
    J: { name: 'Cá hồi vàng', en: 'Golden Trout', pts: 25, jump: 'FishJ', night: 5, rare: true },
  };

  // Vật thể trôi. anims = các biến thể (tên nhóm khung trong atlas), hit = nửa khung va
  // chạm tính theo phần kích thước khung, touch = chuyện gì xảy ra khi thuyền chạm.
  XD.KINDS = {
    rock: { anims: ['WaterRock', 'WaterRockB', 'WaterRockC'], fps: 3, hit: [0.36, 0.2], touch: 'bump', drift: 0, obstacle: true, perch: 0.35 },
    mossRock: { anims: ['MossyWaterRock', 'MossyWaterRockB', 'MossyWaterRockC'], fps: 3, hit: [0.36, 0.2], touch: 'bump', drift: 0, obstacle: true, perch: 0.35 },
    log: { anims: ['FloatingLog'], fps: 2.5, hit: [0.42, 0.28], touch: 'bump', drift: 14, bob: 1, obstacle: true, perch: 0.25 },
    alligator: { anims: ['AlligatorIdle'], fps: 2, hit: [0.4, 0.25], touch: 'bump', drift: 6, bob: 1, obstacle: true },
    barrel: { anims: ['FloatingBarrelA', 'FloatingBarrelB'], fps: 3, hit: [0.4, 0.3], touch: 'scoop', drift: 18, bob: 1, pts: 3 },
    crate: { anims: ['FloatingCrate'], fps: 3, hit: [0.4, 0.3], touch: 'scoop', drift: 16, bob: 1, pts: 3 },
    boost: { anims: ['SpeedBoat'], fps: 8, hit: [0.4, 0.35], touch: 'boost', drift: 0, bob: 2 },
    lily: { frames: ['VitoriaRegea_A', 'VitoriaRegea_B', 'VitoriaRegea_C', 'VitoriaRegea_D'], drift: 4, decor: true, under: true },
    leaf: { anims: ['Leaf_vfx_sheet'], fps: 5, drift: 22, decor: true, under: true },
    turtle: { anims: ['Turtle'], fps: 4, drift: -20, decor: true, under: true, shy: true },
    frog: { anims: ['Frog'], frameRange: [0, 5], fps: 5, decor: true, startle: 'frog' },
    bird: { decor: true, startle: 'bird' },
    fish: { touch: 'catch' },
  };

  // Chim đậu: khung đứng/hót và dải bay tương ứng trong tấm VFX_Bird (0 xám, 2 xanh, 4 đỏ, 6 vàng; dải lẻ là bóng).
  XD.BIRDS = [
    { idle: ['Bird_idle_0', 'Bird_idle_1', 'Bird_idle_2', 'Bird_idle_3'], sing: ['Bird_sing_0', 'Bird_sing_1', 'Bird_sing_2', 'Bird_sing_3', 'Bird_sing_4', 'Bird_sing_5'], fly: 4 },
    { idle: ['BirdsB_20', 'BirdsB_21', 'BirdsB_22', 'BirdsB_23'], sing: ['BirdsB_20', 'BirdsB_21', 'BirdsB_22', 'BirdsB_23'], fly: 2 },
    { idle: ['BirdsB_50', 'BirdsB_51', 'BirdsB_52', 'BirdsB_53'], sing: ['BirdsB_54', 'BirdsB_55', 'BirdsB_56', 'BirdsB_57', 'BirdsB_58', 'BirdsB_59'], fly: 6 },
  ];

  // Thuyền. Mọi biến thể cùng khung 180x153, cùng mốc neo (rip.py ép pivot về (0.5, 0.2)).
  // Các điểm tính từ mốc neo, px ảo: [FC] ống khói = vị trí BoatWhistle trừ BoatSprite trong level9.
  XD.BOATS = {
    solo: { name: 'Một mình', note: 'chỉ người lái trong cabin', anim: ['Boat_0', 'Boat_1', 'Boat_2', 'Boat_1'] },
    pink: { name: 'Cô bạn áo hồng', note: 'ngồi mũi thuyền', anim: 'BoatJP' },
    red: { name: 'Anh bạn tóc đỏ', note: 'đứng boong sau', anim: 'BoatJefferson' },
  };
  XD.BOAT_PTS = {
    chimney: [55, -106],
    window: [45, -42],
    deckLamp: [30, 6],
    net: [78, -4],
    hull: [-80, -24, 72, 16],        // x0 y0 x1 y1 quanh mốc neo
    netBox: [60, -34, 98, 22],
  };

  // Ngày đêm: t ∈ [0,1), 0 = nửa đêm. grade = màu nhân lên cả khung hình (bộ đệm ánh sáng).
  XD.DAY = [
    { t: 0.00, name: 'Khuya', icon: 2, grade: [0.34, 0.38, 0.6], lamp: 1, godray: 0, fireflies: 0.8, stars: 1, music: 'night', tone: [40, 70, 150, 0.05], amb: { night: 1, rivnight: 0.8, owls: 1 } },
    { t: 0.19, name: 'Rạng đông', icon: 2, grade: [0.52, 0.46, 0.62], lamp: 0.8, godray: 0, fireflies: 0.2, stars: 0.5, music: 'dawn', tone: [255, 130, 170, 0.08], amb: { night: 0.4, rivnight: 0.3, morning: 0.3 } },
    { t: 0.25, name: 'Bình minh', icon: 1, grade: [1.0, 0.8, 0.84], lamp: 0.15, godray: 0.5, fireflies: 0, stars: 0, music: 'dawn', tone: [255, 140, 160, 0.15], amb: { morning: 1, birds: 1 } },
    { t: 0.33, name: 'Buổi sáng', icon: 0, grade: [1, 0.98, 0.94], lamp: 0, godray: 0.85, fireflies: 0, stars: 0, music: 'day', tone: [255, 240, 200, 0.03], amb: { morning: 1, birds: 1 } },
    { t: 0.48, name: 'Giữa trưa', icon: 0, grade: [1, 1, 1], lamp: 0, godray: 0.6, fireflies: 0, stars: 0, music: 'day', tone: [255, 255, 240, 0.02], amb: { morning: 0.5, afternoon: 0.6, birds: 0.8 } },
    { t: 0.60, name: 'Buổi chiều', icon: 0, grade: [1, 0.93, 0.82], lamp: 0, godray: 0.8, fireflies: 0, stars: 0, music: 'golden', tone: [255, 190, 110, 0.06], amb: { afternoon: 1, birds: 0.8 } },
    { t: 0.69, name: 'Nắng vàng', icon: 1, grade: [1.0, 0.8, 0.56], lamp: 0.2, godray: 1, fireflies: 0.1, stars: 0, music: 'golden', tone: [255, 140, 40, 0.26], amb: { afternoon: 1, birds: 0.6 } },
    { t: 0.75, name: 'Chạng vạng', icon: 1, grade: [0.62, 0.48, 0.64], lamp: 0.85, godray: 0.1, fireflies: 0.5, stars: 0.3, music: 'night', tone: [200, 90, 150, 0.08], amb: { afternoon: 0.3, night: 0.7, rivnight: 0.5 } },
    { t: 0.82, name: 'Đêm', icon: 2, grade: [0.34, 0.38, 0.6], lamp: 1, godray: 0, fireflies: 1, stars: 1, music: 'night', tone: [40, 70, 150, 0.05], amb: { night: 1, rivnight: 1, owls: 1 } },
  ];

  // Thời tiết: máy trạng thái có hẹn giờ. Bão hiếm và ngắn.
  XD.WEATHER = {
    clear: { name: 'Trời quang', dur: [100, 200], next: { cloudy: 1 }, dim: 0, rain: 0, clouds: 0.35, wind: 0.15 },
    cloudy: { name: 'Nhiều mây', dur: [45, 90], next: { clear: 0.55, rain: 0.45 }, dim: 0.14, rain: 0, clouds: 1, wind: 0.4 },
    rain: { name: 'Mưa', dur: [45, 80], next: { cloudy: 0.85, storm: 0.15 }, dim: 0.28, rain: 1, clouds: 1, wind: 0.5 },
    storm: { name: 'Giông', dur: [16, 26], next: { rain: 1 }, dim: 0.4, rain: 1.6, clouds: 1, wind: 1, thunder: 1 },
  };

  // Bộ trộn: âm lượng mỗi lớp (0..1) trước khi nhân bus. Nền môi trường đã được rip.py kéo về cùng mức -30 dB.
  XD.MIX = {
    bus: { master: 0.9, music: 0.5, amb: 0.9, sfx: 0.8 },
    music_keys: { dawn: 'mus_dawn', day: 'mus_day', golden: 'mus_golden', night: 'mus_night' },
    beds: {
      water: { key: 'amb_water', gain: 0.55 },
      sea: { key: 'amb_sea', gain: 0.7 },
      morning: { key: 'amb_morning', gain: 0.6 },
      afternoon: { key: 'amb_afternoon', gain: 0.5 },
      night: { key: 'amb_night', gain: 0.55 },
      rivnight: { key: 'amb_river_night', gain: 0.45 },
      rain: { key: 'amb_rain', gain: 0.7 },
      wind: { key: 'amb_wind', gain: 0.5 },
      hull: { key: 'amb_hull', gain: 0.35 },
    },
    sfx: {
      whistle: { keys: ['whistle1', 'whistle2', 'whistle3'], gain: 0.55 },
      hit: { keys: ['hit1', 'hit2', 'hit3'], gain: 0.5 },
      crack: { keys: ['crack1', 'crack2'], gain: 0.35 },
      fish: { keys: ['fish1', 'fish2', 'fish3', 'fish4'], gain: 0.55 },
      rare: { keys: ['fish_rare'], gain: 0.5 },
      scoop: { keys: ['collect'], gain: 0.45 },
      pickup: { keys: ['pickup'], gain: 0.4 },
      boost: { keys: ['boost'], gain: 0.5 },
      splash: { keys: ['splash1', 'splash2', 'splash3'], gain: 0.5 },
      bird: { keys: ['bird1', 'bird2', 'bird3', 'bird4'], gain: 0.28 },
      frog: { keys: ['frog1', 'frog2'], gain: 0.4 },
      owl: { keys: ['owl1', 'owl2'], gain: 0.3 },
      thunder: { keys: ['thunder1', 'thunder2', 'thunder3'], gain: 0.45 },
      click: { keys: ['click'], gain: 0.4 },
      notify: { keys: ['notify'], gain: 0.35 },
    },
  };
})(window.XD = window.XD || {});
