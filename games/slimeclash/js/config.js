/*
 * SlimeClash — hằng số cân bằng. ĐÂY LÀ FILE DUY NHẤT chứa số cân bằng.
 *
 * Mỗi số có ghi nguồn:
 *   [APK]  = đo trực tiếp từ Slime Legion 4.5.0  (_research/slime-legion-apk-datamine.md)
 *   [CoH]  = Might & Magic: Clash of Heroes       (_research/clash-of-heroes-combat.md)
 *   [MOB]  = chuẩn mobile                          (_research/mobile-adaptation.md)
 *   [TUNE] = tự chọn, cần playtest. Suy dẫn ghi ngay tại chỗ.
 *
 * Luật sửa file này: đổi [TUNE] thoải mái. ĐỪNG đổi [APK] — đó là số của một game
 * đã cân bằng xong, đổi là mất điểm neo. Xem _research/00-tong-hop-thiet-ke.md mục 9.
 */
(function (root) {
  'use strict';

  var CFG = {
    board: {
      cols: 6,            // [APK] BoardInitColumnCount = 6
      rows: 6,            // [APK] BoardInitRowCount = 6
      colors: 3           // [CoH] 3 màu core mỗi phe
    },

    movesPerTurn: 3,      // [CoH] 3 move/lượt: nhấc-thả 1 quân, hoặc xoá 1 quân

    // [CoH] core 2-3 lượt, elite/champion 4-6. Rút xuống để trận còn 2-5 phút [MOB].
    charge: { core: 2, elite: 3, champion: 4 },

    // [CoH] fusion (chồng cột) +200%; link 2 formation cùng charge còn lại +230%.
    // Hai nguồn mâu thuẫn về link (xem combat.md 6.1) — số này cần playtest.
    fusionMul: 3.0,       // +200% => x3
    linkMul: 3.3,         // +230% => x3.3

    // [APK] HeroThreeMergeOneMoreProbability / HeroFourMergeExtraGradeProbability
    merge: { extraUnitChance: 0.5, extraGradeChance: 0.5, gradeMul: 1.5 },

    // [APK] HeroMaxDefenseRatio / EnemyMaxDefenseRatio / TowerMaxDefenseRatio = 0.8
    defenseCapRatio: 0.8,

    // [APK] RetainSkillLimitCount = 8
    retainSkillLimit: 8,

    // [APK] boss_forecast_step = 10 (721/1744 dòng cấu hình)
    bossForecastSteps: 10,

    chapter: {
      daysPerChapter: 10,     // [APK] pass_day = 10 ở Chapter 1-2
      bossDays: [5, 10],      // [APK] ChapterWave_1: type=2 ở ngày 5 và 10
      // [APK] step_range 10/10/6: hai ngày đầu rộng tay rồi siết lại. Giữ ĐÚNG TỈ LỆ
      // đó nhưng quy sang lượt, vì 1 "ngày" ở đây là trọn một trận Clash of Heroes
      // chứ không phải một wave ngắn. Số tuyệt đối chốt theo mục tiêu 2-5 phút [MOB].
      turnsFirstDays: 15,
      turnsNormal: 12,
      firstDaysCount: 2
    },

    // [APK] hp_ratio Chapter 1 theo ngày. Ngày 6-10 tăng ~1.15x/ngày.
    hpRatioByDay: [0.40, 0.70, 1.20, 1.50, 1.80, 2.26, 2.60, 2.98, 3.39, 3.84],
    hpRatioPerDayBeyond: 1.15,  // [APK] hệ số cho chương sau

    // [TUNE] Máu địch trong 1 chương tăng 9.6 lần (0.40 -> 3.84). Sức mạnh người chơi
    // phải tăng gần bằng, nếu không ngày 10 là bức tường. Chọn 1.25/ngày => 7.45 lần
    // sau 9 ngày, tức ngày 10 khó hơn ngày 1 đúng 1.29 lần. Đó là độ dốc muốn có.
    runPowerPerDay: 1.25,
    // [TUNE] Mỗi chương địch dày thêm 1.32 lần; đối trọng duy nhất là cấp Hero (1->10),
    // mà cấp Hero mua bằng vàng, mà vàng bị chặn bởi coin_max [APK]. Nhờ vậy kinh tế
    // và độ khó khoá chặt vào nhau: không cày đủ vàng thì không qua chương được.
    chapterHpMul: 1.32,
    // [APK] attack_ratio = 1 ở MỌI ngày -> sát thương địch KHÔNG tăng theo ngày.
    // Chỉ tăng theo chương. Giữ đúng vậy: độ khó là bài toán đủ DPS, không phải né chết.
    enemyPowerChapterMul: 1.32,

    hero: {
      // [TUNE] Chốt bằng mô phỏng, không đoán. Bot gây D ~= 60 sát thương/lượt với quân
      // cấp 1; sức mạnh trong run nhân 1.25/ngày. Số lượt cần để hạ địch:
      //     turns(d) = enemyHpBase * hpRatio(d) / (D * 1.25^(d-1))
      // Muốn ngày 1 ~9 lượt  => enemyHpBase = 9*60/0.40  = 1350
      // Kiểm ngày 10        => 1350*3.84 / (60*7.45)     = 11.6 lượt, sát trần 12.
      // Nhờ vậy độ khó TĂNG DẦN trong chương và thứ siết là ĐỒNG HỒ, đúng kết luận
      // đo được từ [APK]: "bài toán đủ DPS trong ngần ấy bước, không phải né chết".
      enemyHpBase: 1350,
      // [TUNE] Trận dài 9-12 lượt thì địch có nhiều thời gian đánh hơn hẳn bản trước,
      // nên máu người chơi phải nâng theo, nếu không thua vì bị giết chứ không vì hết giờ.
      playerHpBase: 400,
      playerHpLevelMul: 0.35,   // [TUNE] mỗi cấp Hero +35% máu
      maxLevel: 10              // [CoH] hero tối đa cấp 10
    },

    deck: {
      size: 5,                  // [CoH] mang tối đa 5 loại quân vào trận
      coreSlots: 3              // 3 core = 3 màu; 2 slot còn lại cho elite/champion
    },

    // [APK] bảng rơi hộp kỹ năng theo số ô ghép (skill_box_1/2/3), trọng số thật.
    skillBox: {
      3: [['atk', 50], ['charge', 50], ['jackpot', 1], ['heal', 5]],
      4: [['atk', 20], ['charge', 40], ['wall', 50], ['jackpot', 5], ['heal', 20]],
      5: [['atk', 5], ['charge', 15], ['wall', 50], ['pierce', 55], ['heal', 15], ['grade', 30]]
    },
    // [APK] SafetySkills = 104|204|3202 — bộ bảo hiểm khi RNG xấu.
    safetySkillAfterMisses: 6,  // [TUNE] 6 hộp liên tiếp không ra gì tốt thì ép ra 'heal'

    economy: {
      // [APK] coin_max theo chương: 220 (ch1) -> 1800 (từ ch10)
      coinMaxByChapter: [220, 240, 540, 720, 900, 1080, 1260, 1440, 2160, 1800],
      coinMaxDefault: 1800,
      // [APK] hero_card_max 25 / 35 / 45
      cardMaxByChapter: [25, 25, 35, 35, 35, 35, 35, 35, 45, 35],
      cardMaxDefault: 35,

      // [APK] mốc thưởng ChapterBoxConfig — ngày 5 vàng, ngày 10 gem + hero
      dayRewards: { 5: { gold: 200 }, 10: { gem: 10, shard: 4 } },

      // [APK] chi phí sink
      revivePriceGem: 30,       // ResurgenceDiamondCost
      reviveFreePerBattle: 1,   // ResurrectionCount
      reviveAdPerDay: 3,        // ResurrectionADDailyCount
      reviveHealRatio: 0.5,     // ResurrectionAdHealMaxHpRatio
      skillRerollGem: 30,       // RefreshSkillDiamondCost
      skillRerollPerBattle: 3,  // RefreshSkillDiamondCostCount

      // [TUNE] Tầng thay cho tiền thật — xem _research/economy-design.md mục 6-8.
      ticketsPerDay: 8,         // "Phiếu Ưu Đãi": ngân sách mở gói/ngày
      gemCapPerDay: 180,        // trần thu kim cương/ngày (chi tối đa 120/trận)
      heroPackPerDay: 3,
      epicHeroPackPerDay: 1,
      lowGoldPackPerDay: 2,
      failPackAfterLosses: 3,   // [APK] gói thất bại kích sau 3 lần thua
      winBoxPerDay: 3,          // [APK] ChapterWinBoxCount
      preBoostPerDay: 3,        // [APK] ChapterEnhanceCount
      preBoostMul: 1.2          // [APK] ChapterEnhanceItems 0:1.2|10:1.2
    },

    // [MOB] mục tiêu nhịp
    target: { battleSeconds: [120, 300] },

    ui: {
      cellPx: 46,               // [MOB] >= 48dp vùng chạm (ô 46 + khe 4 = 50)
      gapPx: 4
    },

    saveKey: 'slimeclash.save.v1',
    gameId: 'slimeclash'
  };

  CFG.coinMaxFor = function (chapter) {
    var a = CFG.economy.coinMaxByChapter;
    return chapter <= a.length ? a[chapter - 1] : CFG.economy.coinMaxDefault;
  };
  CFG.cardMaxFor = function (chapter) {
    var a = CFG.economy.cardMaxByChapter;
    return chapter <= a.length ? a[chapter - 1] : CFG.economy.cardMaxDefault;
  };
  // hp_ratio cho (chương, ngày). Chương 1 dùng bảng đo thật; chương sau nhân luỹ tiến.
  CFG.hpRatio = function (chapter, day) {
    var base = CFG.hpRatioByDay[Math.min(day, CFG.hpRatioByDay.length) - 1];
    return base * Math.pow(CFG.chapterHpMul, chapter - 1);
  };
  // Nhân sức mạnh của người chơi trong một lần chạy chương (roguelike, giống [APK]:
  // mỗi chương là một run 10 ngày, mạnh dần trong run rồi reset).
  CFG.runPowerMul = function (day) {
    return Math.pow(CFG.runPowerPerDay, Math.max(0, day - 1));
  };
  // Nhân sức mạnh vĩnh viễn, đến từ cấp Hero mua bằng vàng.
  // Chọn 1.30/cấp để bám sát chapterHpMul = 1.32/chương, nhưng CỐ Ý thấp hơn một chút:
  // qua 10 chương người chơi tụt lại 1.32^9/1.30^9 = 1.15 lần, tức về cuối phải chơi
  // khá hơn chứ không chỉ dựa vào nâng cấp. Nếu playtest thấy nghẹt thì nâng số này
  // trước, ĐỪNG hạ chapterHpMul.
  CFG.metaPowerMul = function (heroLevel) {
    return Math.pow(1.30, Math.max(0, (heroLevel || 1) - 1));
  };
  CFG.playerMaxHp = function (heroLevel) {
    return Math.round(CFG.hero.playerHpBase *
      (1 + CFG.hero.playerHpLevelMul * ((heroLevel || 1) - 1)));
  };
  CFG.turnsFor = function (day) {
    return day <= CFG.chapter.firstDaysCount
      ? CFG.chapter.turnsFirstDays : CFG.chapter.turnsNormal;
  };
  CFG.isBossDay = function (day) { return CFG.chapter.bossDays.indexOf(day) >= 0; };

  root.CFG = CFG;
  if (typeof module === 'object' && module.exports) module.exports = CFG;
})(typeof window !== 'undefined' ? window : globalThis);
