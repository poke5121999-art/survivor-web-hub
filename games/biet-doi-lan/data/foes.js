// Bảng quái REPO trên cá / cá mập DtD. Số hp, dmg, thời gian lấy từ REPO_Meta (foes, stage_houses, run_timers);
// tốc độ (m/s), tầm nhìn / nghe (m) là [ĐỀ XUẤT] đổi từ ô gạch của REPO sang mét. Thân quái chỉ dùng cá và cá mập của Dave the Diver.
window.BDL = window.BDL || {};
(function (BDL) {
  'use strict';

  var K = {
    // Kẻ húc: báo trước 3 s rồi lao thẳng; đâm vào đá thì choáng 6 s.
    rook: { key: 'rook', name: 'Kẻ húc', species: 'Longnosesaw_Shark', bodies: [[1, 'Longnosesaw_Shark'], [10, 'Smooth_Hammershark']], brain: 'rook',
      hp: 100, dmg: 26, speed: 2.6, sight: 11, hear: 6, pack: 0, minLevel: 1, weight: 3,
      telegraph: 3, chargeSpeed: 8, chargeTime: 2.2, stun: 6 },
    // Cá mập săn: AI đuổi + cắn gốc của cá mập DtD.
    chaser: { key: 'chaser', name: 'Cá mập săn', species: 'Whitetip_Reefshark', bodies: [[1, 'Whitetip_Reefshark'], [6, 'Blacktip_Reefshark'], [10, 'Shortfin_Mako']], brain: 'chaser',
      hp: 95, dmg: 25, speed: 1.2, sight: 12, hear: 8, pack: 0, minLevel: 3, weight: 3 },
    // Kẻ bắn: giữ cách 6 m, bắn gai (22 st).
    gunner: { key: 'gunner', name: 'Kẻ bắn', species: 'Longspine_Porcupinefish', bodies: [[1, 'Longspine_Porcupinefish'], [6, 'Stellate_Puffer'], [10, 'Threetooth_Puffer']], brain: 'gunner',
      hp: 66, dmg: 22, speed: 2.2, sight: 11, hear: 6, pack: 0, minLevel: 6, weight: 2,
      keep: 6, aim: 1.05, cooldown: 2.4, shotRange: 10, shotSpeed: 7 },
    // Bom con: bầy 4 con nhỏ bơi tới Dave, ngòi 3,2 s rồi nổ bán kính 3 m. Không có xác.
    banger: { key: 'banger', name: 'Bom con', species: 'Longspine_Squirrelfish', brain: 'banger',
      hp: 15, dmg: 30, speed: 2.8, sight: 7, hear: 5.5, pack: 4, minLevel: 1, maxLevel: 12, weight: 3, noCorpse: true,
      fuse: 3.2, blast: 3, fuseNear: 2.2 },
    // Lũ rỉa: bầy 3 con tí hon rất nhanh, cắn món đồ Dave đang kéo (x9) hơn là cắn Dave.
    gnome: { key: 'gnome', name: 'Lũ rỉa', species: 'Ruby_CardinalFish', brain: 'gnome',
      hp: 10, dmg: 5, speed: 4.2, sight: 8.5, hear: 6, pack: 3, minLevel: 10, weight: 2, noCorpse: true,
      lootMul: 9, biteCd: 0.7 },
    // Kẻ cướp: giật món đồ Dave đang kéo (buộc dây) rồi bơi biến.
    brat: { key: 'brat', name: 'Kẻ cướp', species: 'Bigeye_Scad', brain: 'brat',
      hp: 30, dmg: 6, speed: 4, sight: 9.5, hear: 7, pack: 0, minLevel: 15, weight: 2, noCorpse: true, carryTime: 25 },
    // Sứa ma: trôi chậm xuyên đá, chỉ đông đá / gây mê / sốc điện mới làm gì được; chạm vào là đau.
    ghost: { key: 'ghost', name: 'Sứa ma', species: 'Box_JellyFish', bodies: [[1, 'Box_JellyFish'], [10, 'Bloodbelly_Comb_Jelly']], brain: 'ghost',
      hp: 999, dmg: 40, speed: 0.9, sight: 16, hear: 6, pack: 0, minLevel: 15, weight: 1, noCorpse: true, immune: true },
  };
  var ORDER = ['rook', 'banger', 'chaser', 'gunner', 'gnome', 'brat', 'ghost'];

  // Nhà REPO 1..5 → số loại quái, số ổ quái (một bầy tính một ổ), theo stage_houses (kindCount 2→6, foeCount 3→11).
  var STAGES = [
    { level: 1, kinds: 2, count: 3 },
    { level: 3, kinds: 3, count: 5 },
    { level: 6, kinds: 4, count: 7 },
    { level: 10, kinds: 5, count: 9 },
    { level: 15, kinds: 6, count: 11 },
  ];

  BDL.FOES = {
    kinds: K, order: ORDER, stages: STAGES,
    RESPAWN: 45,                    // run_timers.foeRespawn
    MIN_SPAWN_DIST: 30,             // m, cách Dave và cách điểm xuất phát của thuyền
    HIT_MAX_FRAC: 0.72,             // một đòn tối đa 72% dưỡng khí tối đa khi còn đầy (REPO HIT_MAX_FRAC)
    DMG_PER_LEVEL: 0.05,            // run_timers.foeDmgPerLevel
    RELOCATE_AFTER: 150, RELOCATE_DIST: 16,
    TIRE_AT: 2.5, TIRED_AT: 8, GIVE_UP_AT: 12, REST: 6, TIRED_SPEED: 0.6,
    SIGHT_CONE: 1.1, SIGHT_NEAR: 3,
    CORPSE_TIME: 90,                // xác quái nằm lại lâu hơn xác cá (40 s) vì còn phải kéo lên thuyền
    sleep: { min: 40, max: 60, endLevel: 11, exp: 2.9, skipChance: 0.2 },   // run_timers.initialSleep
  };

  // Thân của một loại quái ở cấp level: bảng `bodies` chọn loài sâu hơn khi cấp cao.
  BDL.foeBody = function (row, level) {
    var id = row.species;
    (row.bodies || []).forEach(function (b) { if (level >= b[0]) id = b[1]; });
    return id;
  };

  // Bộ quái của một map: { kinds: [row...] (theo thứ tự xuất hiện), count: số ổ, hpMul, dmgMul (đã gồm 1 + 0,05 × (cấp − 1)), level }.
  BDL.foeRoster = function (map) {
    var st = STAGES[0];
    STAGES.forEach(function (s) { if (map.level >= s.level) st = s; });
    var kinds = ORDER.map(function (k) { return K[k]; }).filter(function (r) {
      return map.level >= r.minLevel && (!r.maxLevel || map.level <= r.maxLevel);
    }).slice(0, st.kinds);
    return {
      kinds: kinds, count: st.count, level: map.level,
      hpMul: map.hpMul || 1, dmgMul: (map.dmgMul || 1) * (1 + BDL.FOES.DMG_PER_LEVEL * (map.level - 1)),
    };
  };
})(window.BDL);
