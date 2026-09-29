// Bảng chỉnh số viết tay. Một agent khác sẽ thay file này bằng số kéo từ wiki,
// nên giữ nguyên HÌNH DẠNG: heroes / weapons / rules / waves.
// Nhãn nguồn: [WIKI] = tools/wiki/heroes.json; [ƯỚC LƯỢNG] = nhớ từ game gốc.
window.SK_DESIGN = {
  heroes: {
    knight: {
      name: 'Hiệp Sĩ',
      // [ƯỚC LƯỢNG] 7/6/180, sẽ thay bằng số wiki. [WIKI] ghi gốc 6 máu / 5 giáp / 5% chí mạng (trước nâng cấp).
      hp: 7, armor: 6, energy: 180, crit: 0,
      speed: 6.5,                 // đơn vị/giây [ƯỚC LƯỢNG]
      skill: { id: 'dual_wield', name: 'Song Thủ', cd: 10, dur: 5 }, // [WIKI] cd 10, 5 giây
      weapon: 'bad_pistol',
      hand: [3, 6],               // px từ chân, y hướng lên [ƯỚC LƯỢNG] đo bằng mắt trên knight_0_0
      hurt: { size: [10, 14], off: [0, 7] },
      body: { r: 5 },             // nửa bề ngang hộp chân (px)
      shadow: 'shadow2'
    }
  },

  // kind quyết định hành vi (bảng WEAPON_KINDS trong actors.js); còn lại là số.
  weapons: {
    bad_pistol: { name: 'Súng Lục Cùi', kind: 'gun', dmg: 3, cost: 0, crit: 0, spread: 5, rps: 3.28,
      bulletSpeed: 18, pellets: 1, repel: 1, sprite: 'weapons_28', bullet: 'yellow' },   // [WIKI] + tốc đạn [ƯỚC LƯỢNG]
    old_shotgun: { name: 'Súng Săn Cũ', kind: 'gun', dmg: 3, cost: 1, crit: 0, spread: 22, rps: 1.6,
      bulletSpeed: 16, pellets: 4, repel: 2, sprite: 'weapons3_31', bullet: 'yellow' },   // [ƯỚC LƯỢNG]
    smg: { name: 'Súng Tiểu Liên', kind: 'gun', dmg: 2, cost: 1, crit: 0, spread: 9, rps: 8,
      bulletSpeed: 20, pellets: 1, repel: 0.5, sprite: 'weapons_21', bullet: 'yellow' },   // [ƯỚC LƯỢNG]
    short_sword: { name: 'Kiếm Ngắn', kind: 'melee', dmg: 5, cost: 0, crit: 5, rps: 2.4,
      range: 26, arc: 120, repel: 4, sprite: 'weapons_s_01' },                           // [ƯỚC LƯỢNG]
    apprentice_staff: { name: 'Gậy Phép Tập Sự', kind: 'staff', dmg: 5, cost: 2, crit: 0, spread: 3, rps: 2.2,
      bulletSpeed: 11, pellets: 1, repel: 2, radius: 5, sprite: 'weapons_139', bullet: 'violet' } // [ƯỚC LƯỢNG]
  },

  // Rương vũ khí bốc ngẫu nhiên từ đây.
  chestPool: ['old_shotgun', 'smg', 'short_sword', 'apprentice_staff'],

  rules: {
    hurtInvuln: 0.8,       // giây bất tử sau khi trúng đòn [ƯỚC LƯỢNG]
    armorDelay: 3.0,       // giây không trúng đòn trước khi giáp hồi [ƯỚC LƯỢNG]
    armorTick: 0.8,        // giây / 1 điểm giáp [ƯỚC LƯỢNG]
    critMult: 2,           // chí mạng = gấp đôi [ƯỚC LƯỢNG]
    autoAimRange: 230,     // px; SK tự ngắm con gần nhất trong tầm nhìn [ƯỚC LƯỢNG]
    enemyAtkScale: 0.5,    // atk trong prefab là số chế độ khó; 1-1 thường mất 1 giáp/viên [ƯỚC LƯỢNG]
    enemyMoveScale: 0.7,   // quái đi dạo chậm hơn speed prefab [ƯỚC LƯỢNG]
    telegraph: 0.45,       // quái đứng khựng rồi mới bắn (giây) [ƯỚC LƯỢNG]
    // Viên năng lượng / đồng xu / bình: số thật đọc từ prefab (energy, coin_2, health_pot,
    // energy_pot) trong actors.js; dưới đây chỉ là số dự phòng khi prefab vắng.
    energyOrb: 8, coinValue: 1, potionHp: 2, potionEnergy: 80,
    magnet: 96,            // px (RGEnergy.range 6 đơn vị)
    rewardChestChance: 0.5,
    eliteScale: 1.25,      // quái "badass" vẽ to hơn [ƯỚC LƯỢNG]
    eliteBurst: 3,         // [WIKI Forest] quái tinh anh bắn 3 viên liền
    enemyBulletMaxSpeed: 30 // đơn vị/giây; EGunEliteArcher ghi 65, chặn lại cho khỏi xuyên tường
  },

  // Phòng đánh lấy bố cục + ngân sách thật từ SK_DATA.patterns (pts, waves, ex).
  // Chỉ dùng số dưới đây khi thiếu pattern. [ƯỚC LƯỢNG]
  waves: { count: 2, pts: 16, ex: 10 },

  rooms: {
    // cỡ thật: r_start 15, r_end 19, r_chest_big 11, r_statue 11, r_boss 21 (prefab RGRoomX)
    start: 15, end: 19, chest: 11, special: 11, boss: 21, battle: 15,
    corridor: 5,            // ô sàn bề ngang hành lang = bề ngang prefab door_n (80 px)
    grid: 5                 // "ranks 5|5" của MapManager
  },

  themeNames: { forest: 'Rừng Rậm', castle: 'Lâu Đài', volcano: 'Núi Lửa', glacier: 'Sông Băng' },

  // Chuỗi màn: tầng 1 rừng, tầng 2 lâu đài, tầng 3 núi lửa.
  run: [['forest', 1], ['castle', 2], ['volcano', 3]]
};
