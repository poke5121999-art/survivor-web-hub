/*
 * data/enemies.js — bể quái.
 *
 * `dp` là ĐIỂM ĐỘ KHÓ, mượn nguyên hệ của Deep Rock Galactic: mỗi đợt có một
 * ngân sách điểm, đạo diễn tiêu ngân sách đó ra thành quái. Cân bằng bằng một
 * con số duy nhất cho mỗi loại thì rẻ hơn nhiều so với chỉnh tay từng đợt.
 * Thang gốc của DRG để đối chiếu: Swarmer 6 · Grunt 10 · Web Spitter 25 ·
 * Praetorian 90 · Bulk Detonator 120.
 *
 * BÀI HỌC CÂN BẰNG QUAN TRỌNG NHẤT của DRG: từ Hiểm 1 lên Hiểm 5, sát thương
 * quái ×5,6 và số lượng ×5,7, nhưng MÁU chỉ ×1,7 — và đứng yên từ Hiểm 4 sang 5.
 * Nhờ thế vũ khí không bao giờ có cảm giác yếu đi. Ở đây làm y hệt: `hpK` bé,
 * `dmgK` và số lượng gánh phần khó.
 *
 * `tell` = số giây "báo trước" của đòn nguy hiểm. Không có báo trước thì người
 * chơi thua mà không hiểu vì sao — trên màn dọc còn tệ hơn vì thấy ít.
 */
(function (G) {
  'use strict';

  var E = {
    /* ---- rác: lấp không gian, ép người chơi phải đi chứ không đứng ---- */
    swarmer: {
      name: 'Ấu Trùng', art: 'mob.larva', dp: 6, ai: 'chase',
      hp: 9, dmg: 4, spd: 74, r: 4, scale: 1, xp: 2, fps: 12
    },
    swarmerRed: {
      name: 'Ấu Trùng Đỏ', art: 'mob.larva_red', dp: 7, ai: 'chase',
      hp: 8, dmg: 5, spd: 92, r: 4, scale: 1, xp: 2, fps: 14
    },
    critter: {
      name: 'Bọ Hang', art: 'mob.cockroach', dp: 2, ai: 'flee',
      hp: 3, dmg: 0, spd: 60, r: 3, scale: 1, xp: 1, fps: 12, harmless: true
    },

    /* ---- xương sống: quái cận chiến chuẩn ---- */
    grunt: {
      name: 'Ấu Trùng Lớn', art: 'mob.bigLarva', dp: 10, ai: 'chase',
      hp: 22, dmg: 7, spd: 58, r: 6, scale: 1, xp: 4, fps: 10, atkAnim: true
    },
    gruntVamp: {
      name: 'Ấu Trùng Hút', art: 'mob.bigLarvaVampire', dp: 14, ai: 'chase',
      hp: 26, dmg: 8, spd: 60, r: 6, scale: 1, xp: 5, fps: 10, leech: 0.5
    },
    caveling: {
      name: 'Người Hang', art: 'mob.caveling', dp: 10, ai: 'chase',
      hp: 20, dmg: 7, spd: 62, r: 5, scale: 1, xp: 4, fps: 10, atkAnim: true
    },
    spearman: {
      name: 'Người Hang Giáo', art: 'mob.cavelingSpearman', dp: 16, ai: 'poke',
      hp: 28, dmg: 10, spd: 55, r: 6, scale: 1, xp: 6, fps: 9,
      reach: 34, tell: 0.45
    },
    skirmisher: {
      name: 'Người Hang Lẻn', art: 'mob.cavelingSkirmisher', dp: 14, ai: 'hitrun',
      hp: 18, dmg: 8, spd: 84, r: 5, scale: 1, xp: 5, fps: 12, backoff: 70
    },
    infected: {
      name: 'Kẻ Nhiễm Mốc', art: 'mob.infectedCaveling', dp: 20, ai: 'chase',
      hp: 34, dmg: 9, spd: 44, r: 6, scale: 1, xp: 7, fps: 8,
      deathBurst: { r: 46, dmg: 8, col: '#8fe6c8' }
    },

    /* ---- ép đổi chỗ đứng: bắn từ xa ---- */
    hunter: {
      name: 'Thợ Săn Hang', art: 'mob.cavelingHunter', dp: 25, ai: 'ranged',
      hp: 22, dmg: 9, spd: 50, r: 5, scale: 1, xp: 8, fps: 10,
      shootRange: 190, keep: 130, cd: 2.1, tell: 0.5,
      proj: { spd: 155, col: '#e8d07a', r: 3 }
    },
    shaman: {
      name: 'Pháp Sư Hang', art: 'mob.cavelingShaman', dp: 30, ai: 'caster',
      hp: 30, dmg: 11, spd: 44, r: 6, scale: 1, xp: 10, fps: 9,
      shootRange: 210, keep: 160, cd: 2.6, tell: 0.65,
      proj: { spd: 120, col: '#b06aff', r: 4, homing: 0.9 },
      healAlly: { amt: 6, cd: 4, r: 130 }
    },
    scholar: {
      name: 'Học Sĩ Hang', art: 'mob.cavelingScholar', dp: 28, ai: 'support',
      hp: 26, dmg: 6, spd: 48, r: 5, scale: 1, xp: 9, fps: 9,
      buff: { r: 140, atk: 0.3, spd: 0.25 }
    },
    assassin: {
      name: 'Sát Thủ Hang', art: 'mob.cavelingAssassin', dp: 22, ai: 'hitrun',
      hp: 20, dmg: 12, spd: 96, r: 5, scale: 1, xp: 8, fps: 12,
      backoff: 90, tell: 0.35
    },
    golem: {
      name: 'Gộc Đá Cổ', art: 'mob.ancientGolem', dp: 45, ai: 'ranged',
      hp: 70, dmg: 13, spd: 34, r: 8, scale: 1, xp: 16, fps: 8,
      shootRange: 220, keep: 150, cd: 2.8, tell: 0.7, armorFront: 0.5,
      proj: { spd: 135, col: '#8ad8ff', r: 4 }
    },

    /* ---- phạt sai lầm không gian ---- */
    exploder: {
      name: 'Bọ Nổ', art: 'mob.bombScarab', dp: 12, ai: 'exploder',
      hp: 12, dmg: 26, spd: 80, r: 5, scale: 1, xp: 5, fps: 12,
      fuse: 0.85, blast: 52, tell: 0.85
    },
    charger: {
      name: 'Tinh Thể Lao', art: 'mob.mimiteCrystal', dp: 26, ai: 'charger',
      hp: 34, dmg: 14, spd: 52, r: 6, scale: 1, xp: 10, fps: 10,
      dashSpd: 260, dashTime: 0.7, wind: 0.75, tell: 0.75
    },
    roller: {
      name: 'Bọ Cuộn', art: 'mob.rolyPoly', dp: 30, ai: 'charger',
      hp: 48, dmg: 12, spd: 40, r: 7, scale: 1, xp: 12, fps: 12,
      dashSpd: 210, dashTime: 1.1, wind: 0.6, tell: 0.6, armor: 0.25
    },
    acid: {
      name: 'Sâu Axit', art: 'mob.acidLarva', dp: 20, ai: 'burrow',
      hp: 24, dmg: 11, spd: 105, r: 5, scale: 1, xp: 8, fps: 12,
      burrowT: 1.6, surfaceT: 2.2, tell: 0.5
    },
    pest: {
      name: 'Rận Điện', art: 'mob.ElectroPestEnemy', dp: 16, ai: 'hopper',
      hp: 18, dmg: 9, spd: 70, r: 5, scale: 1, xp: 6, fps: 11,
      hop: 150, hopCd: 1.4, tell: 0.4
    },
    flyer: {
      name: 'Ruồi Mũi', art: 'mob.snootFly', dp: 18, ai: 'flyer',
      hp: 16, dmg: 8, spd: 92, r: 5, scale: 1, xp: 7, fps: 14, fly: true
    },

    /* ---- tinh nhuệ: đổi cả bố cục trận, không chỉ đổi con số ---- */
    brute: {
      name: 'Hộ Vệ Hang', art: 'mob.cavelingBrute', dp: 90, ai: 'tank',
      hp: 180, dmg: 20, spd: 40, r: 11, scale: 1, xp: 34, fps: 8,
      armorFront: 0.75, tell: 0.8, elite: true, slam: { r: 60, dmg: 16, cd: 4.5 }
    }
  };

  /* Thang độ khó. Máu tăng CHẬM, sát thương và số lượng tăng nhanh — xem chú
   * thích đầu file. Trong một ván 10 phút, `m` chạy từ 0 tới 1. */
  function scale(def, level, m) {
    // Ải 1 KHÔNG có phụ trội nào: dùng (level-1) chứ không phải level. Ải đầu
    // tiên của quần thể đầu tiên phải là ải người mới thắng được bằng đồ khởi
    // đầu — không thì cả cỗ máy "nâng ngoài ván" chẳng có chỗ mà bám vào.
    // `m` là tiến độ ván (0 → 1); nó gánh phần lớn độ khó nhưng đã bị hạ từ
    // 0,85 xuống 0,55 vì đo được người chơi chết đều ở phút 5.
    var hpK = 1 + (level - 1) * 0.14 + m * 0.45;
    var dmgK = 1 + (level - 1) * 0.11 + m * 0.55;
    return {
      hp: Math.round(def.hp * hpK),
      dmg: Math.round(def.dmg * dmgK),
      spd: def.spd * (1 + m * 0.10)
    };
  }

  G.ENEMY = E;
  G.enemyScale = scale;
})(window.DC = window.DC || {});
