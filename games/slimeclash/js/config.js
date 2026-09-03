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
      // [TUNE] 18/36 ô. Để 14 thì bàn nhìn trống hoác, không ra dáng game ghép ô —
      // và ít quân thì cũng ít cơ hội xếp được hàng ngay từ lượt đầu.
      startUnits: 18,
      spawnPerTurn: 3     // [TUNE] quân mới mỗi lượt
    },

    movesPerTurn: 3,      // [CoH] 3 move/lượt: nhấc-thả 1 quân, hoặc xoá 1 quân

    /* GỘP — cơ chế lõi, lấy của Slime Legion.
     * Xếp >= minRun quân CÙNG LOẠI CÙNG CẤP thành hàng (ngang hoặc dọc) -> gộp thành
     * MỘT quân cấp cao hơn.
     *
     * gradePowerMul PHẢI LỚN HƠN minRun. Bản đầu tôi để 2.2 với lập luận "ô là tài
     * nguyên khan hiếm nên lỗ lực vẫn đáng" — SAI, và mô phỏng bắt được: gộp 3 con
     * (lực 3P) ra 2.2P là LỖ THẲNG, mà bàn 6x6 thì ô lại tự đầy nhờ spawn, nên nước
     * đi tối ưu thành "không bao giờ gộp". Lực trên sân đứng yên ở 36 x P suốt trận
     * và mọi ngày từ ngày 5 trở đi đều 0% thắng.
     * Để 3.6 thì gộp 3 con = 3.6P, lại giải phóng 2 ô cho quân mới -> gộp luôn là
     * nước đi tốt, và trần lực của bàn tăng theo cấp thay vì kẹt ở số ô.
     * [APK] HeroThreeMergeOneMoreProbability / HeroFourMergeExtraGradeProbability = 0.5 */
    merge: {
      minRun: 3,
      gradePowerMul: 3.6,     // [TUNE] > minRun, xem lập luận ngay trên
      extraUnitChance: 0.5,   // [APK] gộp 3 -> 50% sinh thêm 1 quân
      extraGradeChance: 0.5   // [APK] gộp 4+ -> 50% thêm 1 cấp
    },
    maxGrade: 6,              // sprite trong APK có đúng 6 khung cấp

    /* QUÁI — một con, không phải một sân địch. */
    foe: {
      atkBase: 90,                // [TUNE] đủ để xoá vài quân trong cột bị nhắm
      /* [TUNE] 1.12, KHÔNG phải 1.35 như bản đầu.
       * hpRatioByDay [APK] đã là máu của ĐÚNG ngày đó, kể cả ngày boss — bảng chạy
       * mượt 1.20/1.50/1.80 chứ không nhảy ở ngày 5. Nhân thêm 1.35 lên ngày boss là
       * tôi cộng hai lần: mô phỏng cho ra ngày 5 (16% thắng) KHÓ HƠN ngày 8 (88%),
       * tức độ khó răng cưa trong chương. Chỉ giữ một chút để boss vẫn "nặng" hơn. */
      bossHpMul: 1.12,
      bossAtkMul: 1.35,           // [TUNE] boss đánh đau hơn, đó mới là chỗ nó khác
      /* [TUNE] 9 bước = đúng 3 lượt (3 bước/lượt), sát với boss_forecast_step = 10 [APK].
       * Để 6 thì quái thường đánh mỗi 2 lượt còn boss đánh mỗi 3.3 lượt — mô phỏng cho
       * ra NGÀY BOSS lại là ngày DỄ NHẤT chương ở chương 12 (100% so với 40%), vì ở đó
       * người chơi thua do bị đánh chết chứ không do hết giờ. */
      normalForecastSteps: 9
    },

    // [APK] HeroMaxDefenseRatio / EnemyMaxDefenseRatio / TowerMaxDefenseRatio = 0.8
    defenseCapRatio: 0.8,

    // [APK] RetainSkillLimitCount = 8
    retainSkillLimit: 8,

    // [APK] boss_forecast_step = 10 (721/1744 dòng cấu hình)
    bossForecastSteps: 10,

    chapter: {
      daysPerChapter: 10,     // [APK] pass_day = 10 ở Chapter 1-2
      bossDays: [5, 10],      // [APK] ChapterWave_1: type=2 ở ngày 5 và 10
      /* [APK] step_range 10/10/6: hai ngày đầu rộng tay rồi siết lại. Giữ ĐÚNG TINH
       * THẦN đó nhưng SIẾT DẦN thay vì cắt một nhát.
       * Bản đầu là 12 lượt cho ngày 1-2 rồi tụt thẳng xuống 9 từ ngày 3. Mô phỏng cho
       * ra ngày 3 là ngày khó nhất chương (72% thắng) trong khi ngày 5, 8, 10 đều gần
       * 100% — răng cưa, vì máu quái mới tăng 1.7 lần mà ngân sách lượt đã mất 25%.
       * Bảng dưới siết đều, nên độ khó đi lên trơn theo ngày.
       * Số tuyệt đối chốt theo mục tiêu 2-5 phút mỗi trận [MOB]. */
      turnsByDay: [12, 11, 10, 10, 10, 10, 9, 9, 9, 9],
      turnsBeyond: 9
    },

    // [APK] hp_ratio Chapter 1 theo ngày. Ngày 6-10 tăng ~1.15x/ngày.
    hpRatioByDay: [0.40, 0.70, 1.20, 1.50, 1.80, 2.26, 2.60, 2.98, 3.39, 3.84],
    hpRatioPerDayBeyond: 1.15,  // [APK] hệ số cho chương sau

    /* [TUNE] Sức mạnh của người chơi trong một chương BÁM THEO ĐÚNG HÌNH của hpRatio,
     * không phải một hệ số cố định mỗi ngày.
     *
     * Vì sao: hpRatio [APK] dốc đứng ở đầu chương (0.40 -> 1.80, gấp 4.5 lần trong 4
     * ngày) rồi thoải hẳn ở cuối (1.80 -> 3.84, gấp 2.1 lần trong 5 ngày). Một hệ số
     * cố định kiểu x1.28/ngày không thể vừa khớp đoạn dốc vừa khớp đoạn thoải: mô
     * phỏng cho ra ngày 5 chỉ 15% thắng còn ngày 10 lại 85%.
     *   runPowerMul(d) = (hpRatio(d) / hpRatio(1)) ^ runPowerFollow
     * runPowerFollow < 1 nghĩa là người chơi luôn đuổi HỤT máu quái một chút, đều đặn
     * ở mọi ngày — đó chính là "độ khó tăng dần" mà không có ngày nào thành bức tường.
     *
     * KÈM THEO: sát thương quái nhân đúng hệ số này. Máu quân cũng nhân theo nó, nên
     * nếu đòn quái đứng yên thì bàn không bao giờ thủng và ngày cuối chương hoá ra dễ
     * nhất — mô phỏng đã bắt đúng lỗi đó ở bản trước. */
    runPowerFollow: 1.00,
    // [TUNE] Mỗi chương địch dày thêm 1.32 lần; đối trọng duy nhất là cấp Hero (1->10),
    // mà cấp Hero mua bằng vàng, mà vàng bị chặn bởi coin_max [APK]. Nhờ vậy kinh tế
    // và độ khó khoá chặt vào nhau: không cày đủ vàng thì không qua chương được.
    chapterHpMul: 1.24,
    // [APK] attack_ratio = 1 ở MỌI ngày -> sát thương địch KHÔNG tăng theo ngày.
    // Chỉ tăng theo chương. Giữ đúng vậy: độ khó là bài toán đủ DPS, không phải né chết.
    enemyPowerChapterMul: 1.24,

    hero: {
      /* [TUNE] Chốt bằng mô phỏng (_test/sim.js), không đoán.
       * Mô hình gộp làm lực trên sân TĂNG trong chính trận đấu, nên tổng sát thương
       * không tuyến tính theo số lượt — dải chuyển từ "thắng chắc" sang "thua chắc"
       * hẹp: đo được 3200 -> gần 100% thắng, 3600 -> khoảng 30%. Chọn 3200 để bot
       * tham lam 1 nước (yếu hơn người chơi thật) vẫn đi được, và để chỗ thua nằm ở
       * chỗ đáng thua: khi hệ số theo chương vượt qua trần vàng.
       * Trận dài 7-9 lượt, khớp mục tiêu 2-5 phút [MOB]. */
      enemyHpBase: 3200,
      // [TUNE] Máu gốc; nhân theo metaPowerMul, xem CFG.playerMaxHp.
      playerHpBase: 400,
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
    var d = CFG.hpRatioByDay;
    var here = d[Math.min(day, d.length) - 1];
    return Math.pow(here / d[0], CFG.runPowerFollow);
  };
  // Nhân sức mạnh vĩnh viễn, đến từ cấp Hero mua bằng vàng.
  // Chọn 1.30/cấp để bám sát chapterHpMul = 1.32/chương, nhưng CỐ Ý thấp hơn một chút:
  // qua 10 chương người chơi tụt lại 1.32^9/1.30^9 = 1.15 lần, tức về cuối phải chơi
  // khá hơn chứ không chỉ dựa vào nâng cấp. Nếu playtest thấy nghẹt thì nâng số này
  // trước, ĐỪNG hạ chapterHpMul.
  CFG.metaPowerMul = function (heroLevel) {
    return Math.pow(1.30, Math.max(0, (heroLevel || 1) - 1));
  };
  /* Máu người chơi đi theo ĐÚNG metaPowerMul, không phải một đường tuyến tính.
   * Bản trước là playerHpBase * (1 + 0.35*(cấp-1)) — tuyến tính, trần 1660 ở cấp 10 —
   * trong khi sát thương quái nhân 1.24 mỗi chương, tức hàm mũ. Mô phỏng bắt được hệ
   * quả: từ chương 10 trở đi, NGÀY 1 là ngày khó nhất chương (0% thắng) vì người chơi
   * bị đánh chết ở lượt 6-7, còn ngày 5 và 10 lại 60% — độ khó trong chương đảo ngược.
   * Cho máu đi cùng hàm mũ với lực thì trục sống-chết và trục DPS cùng một nhịp. */
  CFG.playerMaxHp = function (heroLevel) {
    return Math.round(CFG.hero.playerHpBase * CFG.metaPowerMul(heroLevel));
  };
  CFG.turnsFor = function (day) {
    var t = CFG.chapter.turnsByDay;
    return day <= t.length ? t[day - 1] : CFG.chapter.turnsBeyond;
  };
  CFG.isBossDay = function (day) { return CFG.chapter.bossDays.indexOf(day) >= 0; };

  root.CFG = CFG;
  if (typeof module === 'object' && module.exports) module.exports = CFG;
})(typeof window !== 'undefined' ? window : globalThis);
