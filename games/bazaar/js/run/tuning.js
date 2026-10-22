/* Chợ Phiên — mọi con số của vòng chơi mà bản demo KHÔNG chứa (máy chủ giữ: TStartingPlayer, TDayHourConfig,
   tierManager, TGhost, Fates...). Gom vào một chỗ để chỉnh khi chơi thử. Nguồn ghi từng dòng:
   - [WIKI] = D:\bazaar-ref\notes\WIKI.md (có URL gốc trong đó); [ĐO TRONG REPO] = dữ liệu/mã dịch ngược;
   - [ĐỀ XUẤT] = tự đặt, kèm lý do. Số đo được từ dữ liệu (giá, XP mỗi cấp, uy tín, phần thưởng quái, luật reroll của
     từng thương nhân) KHÔNG nằm ở đây: đọc thẳng từ data/mode.js, data/encounters.js, data/monsters.js. */
(function (root) {
  'use strict';
  var R = root.BZRun = root.BZRun || {};

  R.TUNING = {
    // ---- khởi đầu ----
    START_GOLD: 8,            // [WIKI §1.1] "base is 8 Gold + 5 Income for every hero" (mobalytics start-of-run guide)
    START_INCOME: 5,          // [WIKI §1.1]
    // Máu tối đa THEO CẤP (bảng tuyệt đối) [WIKI2 R2]: wiki không có bảng máu; Version 2.5.0 (21/05/2025) "Increased all Heroes' starting
    // health by 50" (cấp 1: 250 -> 300; clip PSP75k4R4Pk?t=123 cấp 1 = 300, cấp 2 = 350); clip wUzq6Q4u9Jc (build 1.0.4671, trước 2.5.0)
    // đầu ngày: C2 350, C3 450, C4 600, C5 800, C6 1050, C7 1350, C8 1700, C9 2100, C10 2550 (2.5.0 chỉ đổi cấp 1). Bước tăng
    // +50, +100, +150 ... = 50 x cấp đang rời; sau cấp 10 giữ đúng nhịp đó (C11 3050, C12 3600) [ĐỀ XUẤT: nối nhịp].
    // Bảng level_ups của bản demo (C2 400 ... C10 3200) lệch một cấp và tính từ nền 250 nên KHÔNG dùng nữa.
    START_HP: 300,
    HP_BY_LEVEL: [300, 350, 450, 600, 800, 1050, 1350, 1700, 2100, 2550],
    HP_STEP_PER_LEVEL: 50,
    // Lựa chọn mở màn (thay cho "Start Run" của từng hero: bể thẻ bị xoá) [WIKI §1.1 start-of-run guide]
    START_INCOME_OPTION: { gold: 12, income: 2 },   // "+12 Gold, +2 Income" trên nền 8/5
    START_ITEM_SIZE: 'Small', // Version 0.1.8: "3 Enchanted Small Bronze-tier Items"
    // wiki Start of Run (2025-05-24): "Choose an Enchanted (Non-Golden, Non-Radiant) Item (Choose 1 from 3) and + 6 Gold" (0.1.9 bỏ Golden,
    // 2.5.0 bỏ Radiant); "Choose a Gold-tier Skill (Choose 1 from 3)"; "counts as one of the six hours" (chọn xong là hết giờ 0).
    START_ITEM_PICKS: 3, START_ITEM_GOLD: 6, START_ITEM_NOT_ENCHANT: ['Golden', 'Radiant'],
    START_SKILL_TIER: 'Gold', START_SKILL_PICKS: 3,

    // ---- lịch giờ (CODE-RUN §1.2-1.3; WIKI §1.2: giờ 0,1,3,4 tự do, giờ 2 quái, giờ 5 PvP) ----
    PVE_HOUR: 2,              // [WIKI §1.2] "The third encounter in each Day is always a PvE Monster fight"
    PVP_HOUR: 5,              // [WIKI §1.2] hour 5 = PvP ghost fight
    // Mỗi giờ tự do bày 3 thẻ: 1 thương nhân + 1 sự kiện + 1 tự do [ĐỀ XUẤT] theo EncounterBreakdown mặc định
    // (Merchant 1, Combat 1, Flex 1 — Models\BazaarDayByHourManager.cs:20-24) bỏ ô combat vì quái có giờ riêng (WIKI).
    HOUR_SLOTS: ['merchant', 'event', 'any'],

    // ---- tỉ lệ bậc theo ngày (ItemSkillSpawnTierPercantagesByDay bị xoá) ----
    // [WIKI2 R6] wiki "Item Skill Spawn Tier Percentage by Day" là MỘT bảng chung cho mọi thẻ chia ra: đống đồ của sự kiện dùng chính
    // bảng bazaardb /shop-odds của thương nhân (R.shopTierWeights, data/shops.js tierOdds). Bảng dưới chỉ còn là dự phòng khi
    // không nạp data/shops.js. [ĐỀ XUẤT cũ] CODE-RUN §3.2: dốc mượt theo dải ngày (D1-3 Đồng, 4-6 Bạc, 7-9 Vàng, 10 Kim cương).
    // Cột: Bronze, Silver, Gold, Diamond. Dòng i = ngày i+1; ngày > 10 dùng dòng cuối.
    TIER_ODDS_BY_DAY: [
      [100, 0, 0, 0], [80, 20, 0, 0], [55, 40, 5, 0], [25, 55, 20, 0], [10, 50, 35, 5],
      [5, 35, 45, 15], [0, 20, 50, 30], [0, 10, 45, 45], [0, 5, 35, 60], [0, 0, 25, 75]
    ],
    // [ĐỀ XUẤT] bậc của thẻ gặp gỡ (EncounterSpawnTierPercentages bị xoá): dùng chung bảng trên.
    ENCOUNTER_TIER_ODDS_BY_DAY: null,
    // TDayHourConfig.NativeItemTierProbability mặc định 0.05 (Domain.Game\TDayHourConfig.cs) [ĐO TRONG REPO, giá trị mặc định]
    NATIVE_TIER_PROB: 0.05,
    // Dải bậc theo ngày cho phần thưởng sinh ra (Spawn/Deal không có bậc ghi rõ) [ĐO TRONG REPO CODE-RUN §3.7, ranh giới ngày]
    BAND_BY_DAY: ['Bronze', 'Bronze', 'Bronze', 'Silver', 'Silver', 'Silver', 'Gold', 'Gold', 'Gold', 'Diamond'],

    // ---- thương nhân ----
    // Giảm giá: TRangeValue 0..100 vào Custom_0, điều kiện Custom_0 >= 80, BuyPrice × 0.75 (cards.json Goldie 1f72700a) [ĐO TRONG REPO]
    DISCOUNT_CHANCE: 0.2,
    DISCOUNT_MULT: 0.75,
    // "Valpak: Always sells discounted items" — luật thật bị xoá [ĐỀ XUẤT]: luôn giảm một thẻ (xác suất 1)
    ALWAYS_DISCOUNT_CHANCE: 1,
    // Không có RerollRules (sự kiện bán hàng không gắn Merchant) [ĐỀ XUẤT]: không cho đổi hàng
    DEFAULT_REROLLS: 0,

    // ---- quái giờ 2 [ĐỀ XUẤT] ----
    // WIKI §1.5: "sets always contain one Bronze, one Silver, one Gold-or-higher"; cấp mẫu quái so với ngày lấy từ danh sách
    // quái theo ngày của wiki (Ngày 1: cấp 1; Ngày 2: Coconut Crab L2 B, Boarrior L3 S, Ventriloquist L4 G; Ngày 10: Hulking L10 B,
    // Trash Titan L11 S, Boss Harrow L12 G, Void Colossus L13 D). Khoảng [ngày + lo, ngày + hi] theo cấp mẫu (Player.Attributes.Level).
    PVE_SLOTS: [
      { tiers: ['Bronze'], lo: 0, hi: 1 },
      { tiers: ['Silver'], lo: 0, hi: 2 },
      { tiers: ['Gold', 'Diamond', 'Legendary'], lo: 1, hi: 3 }
    ],
    PVE_MAX_LEVEL_WIDEN: 6,   // nới khoảng cấp từng bước ±1 tới chừng này nếu không có quái đúng bậc
    // Thẻ quái không dùng cho giờ PvE: bóng PvP, bù nhìn, sự kiện riêng của hero (tên nội bộ)
    // "[DISABLED] Joyful Jack" (WIKI2 P5: không bản vá nào bật lại) cũng loại
    PVE_EXCLUDE: /PVE_|PvP|Hour 6|Dummy|Big Bad Wolf|Bounty Hunter|Sparring|\[DISABLED\]/,
    // Phần thưởng thắng quái theo bậc, Version 2.5.0: "Bronze Monsters: 2 gold, 2 XP; Silver 3 gold, 2 XP; Gold 4 gold, 2 XP;
    // Diamond 5 gold, 3 XP; Legendary 6 gold, 3 XP" (bỏ số trên thẻ của bản demo: 3/3/3/4/4 XP). [WIKI2 M-P1]
    PVE_REWARD_BY_TIER: { Bronze: { gold: 2, xp: 2 }, Silver: { gold: 3, xp: 2 }, Gold: { gold: 4, xp: 2 }, Diamond: { gold: 5, xp: 3 }, Legendary: { gold: 6, xp: 3 } },
    LOOT_PICKS: 3,            // [ĐỀ XUẤT] CODE-RUN §3.5: "offer 3 random distinct items/skills from the defeated monster's board"

    // ---- PvP bóng giờ 5 [ĐỀ XUẤT] (TGhost + máy chủ ghép trận không có trong bản demo) ----
    // [WIKI2 R3] wiki Day (2025-03-13): "a snapshotted version of their build after their fight" -> bóng từ data/ghosts.js mang MÁU CỦA
    // CHÍNH NÓ (healthMax trong bản ghi). GHOST_HP_BY_DAY dưới đây chỉ còn cho bóng dựng từ bàn quái khi không có bộ dữ liệu.
    // Bóng = bàn của một quái có cấp mẫu ≈ cấp người chơi mong đợi ở ngày đó; máu = máu của một người chơi cùng cấp
    // (START_HP + cộng dồn level_ups) vì bóng thật là ảnh chụp bàn người chơi. Cấp mong đợi: ~9-10 XP/ngày (5 giờ + 1 PvP + 3 PvE)
    // → +1,2 cấp/ngày → ngày d ≈ cấp d+1 (khớp bóng ngày 6 cấp 7 trong monsters.json).
    // Đo bằng quét bot (3x200 run): offset 1 → PvP thắng 29,3% (1497/5106); offset 0 → 40,1% (2109/5260) [ĐO TRONG REPO]
    GHOST_LEVEL_OFFSET: 0,
    // Máu bóng theo ngày [ĐO TRÊN CLIP] https://youtu.be/wUzq6Q4u9Jc?t=337 (ngày 2) ... ?t=2685 (ngày 11): đối thủ ngày 2..11 =
    // 400, 450, 700, 1025, 1500, 1850, 2330, 3120, 3365, 4062. Ngày 1 ngoại suy [ĐỀ XUẤT] 350 (lùi 50 như bước ngày 2→3);
    // sau ngày 11 cộng thêm mỗi ngày [ĐỀ XUẤT] 700 (bước trung bình hai ngày cuối).
    GHOST_HP_BY_DAY: [350, 400, 450, 700, 1025, 1500, 1850, 2330, 3120, 3365, 4062],
    GHOST_HP_STEP_AFTER: 700,
    // Ngày 6-7 ưu tiên ba bàn hero thật PVE_{Stelle,Jules,Karnok}_D6_001 (monsters.json, L7) [ĐỀ XUẤT CODE-RUN §1.4]
    GHOST_HERO_BOARDS: { days: [6, 7], match: /^PVE_(\w+)_D6_001$/ },
    // Hết giờ (hoà) tính là thua cho người chơi: legacy BazaarCardDealer.cs:4037 (người thắng mặc định là đối thủ, CODE-COMBAT §1.12);
    // CombatSim.cs:18 chỉ có Winner Player|Opponent. Bão cát legacy (sim/core.js BZ.SANDSTORM) làm trận kết thúc trước 120 s (R1-2, đợt 9e).
    DRAW_IS_LOSS: true,

    // ---- Fates (Futura aef5e7d8, CODE-RUN §1.5): uy tín về <= 0 lần đầu → về 1 rồi chọn 1 trong 3 phần thưởng mạnh ----
    // [ĐO TRÊN CLIP] https://youtu.be/PSP75k4R4Pk?t=245 ("first time it hits 0 it resets to 1 ... 3 powerful choices"),
    // https://youtu.be/oVtvrCdqHEE?t=765 (hồi sinh một lần, về 1 prestige, chọn 1 trong 3 buff, có thể enchant);
    // lần thứ hai về 0 thì hết run. Nội dung lấy từ DỮ LIỆU: sự kiện Futura (Limit 3, không reroll) có bốn bước thật
    // "Fate's Bounty" (+20 vàng, +5 XP: ability.1 / ability.0), "Fate's Crossroads" (địa điểm enchant ngẫu nhiên hoặc The Artist),
    // "Fate's Legacy" (Bronze + Silver → Gold), "Fate's Fortunes" (Transform mọi vật phẩm rồi enchant) [ĐO TRONG REPO cards.json].
    // Bày FATES_PICKS trong số bốn; số lấy từ chính các ability của bước (không còn con số tự đặt).
    FATES_PRESTIGE_AFTER: 1,
    FATES_EVENT: 'Futura',
    // [WIKI2 R15] wiki Futura (2025-05-08): luôn đúng ba lựa chọn Fate's Bounty (20 vàng + 5 XP), Fate's Crossroads, Fate's Legacy;
    // "Fate's Fortunes" của bản demo không có trên wiki -> không bày.
    FATES_PICKS: ["Fate's Bounty", "Fate's Crossroads", "Fate's Legacy"],
    // Khoá giao diện của từng bước Fate (id lựa chọn: giữ 'legacy' như bản cũ để giao diện cũ vẫn ra đúng hình)
    FATES_KEYS: { "Fate's Bounty": 'bounty', "Fate's Crossroads": 'crossroads', "Fate's Legacy": 'legacy', "Fate's Fortunes": 'fortunes' },

    // ---- lên cấp: bảng phần thưởng THEO CẤP (wiki Level_Up, trang ghi WIP: https://thebazaar.wiki.gg/wiki/Level_Up) ----
    // [ĐO TRONG REPO] hàng cấp 2..29 chép từ audit RUN-01 (đã fetch wiki); cấp > 29 lặp mẫu 26-29. Mỗi phần tử là MỘT lựa chọn
    // bày cho người chơi, viết `loại[:tham số]`; loại được giải bởi bảng LEVEL_SLOT_KINDS ở clock.js:
    //   pip|argenta|orlin|adira   thầy kỹ năng theo bậc (LEVEL_SLOT_EVENTS)
    //   trainer                   "Random Skill Trainer": một thầy chủ đề (Bjorn, Malafang...) hợp hero, không trùng ô khác
    //   heroTeacher               thầy riêng của hero (Cymon, Mr. Tuskari, Old Zane, Zosima...)
    //   item:<bậc>  loot:<bậc>    "Get a <bậc> Item / Loot" ('Gold|Diamond' = "Gold or Diamond")
    //   heroReward:<bậc>          "Random Character Reward": phần thưởng lên cấp riêng của hero theo bậc
    //   upgrade:<Bronze|Silver|Any>  bệ nâng bậc (B1&B2 / Sterling / Forja)
    //   enchantRandom             "Random Enchant Option": một địa điểm enchant ngẫu nhiên (bệ Diamond)
    //   artist                    The Artist: người chơi chọn loại enchant
    LEVEL_REWARDS: {
      2: ['pip'],
      3: ['item:Bronze', 'loot:Bronze', 'heroReward:Bronze'],
      4: ['upgrade:Bronze', 'pip'],
      5: ['argenta'],
      6: ['item:Silver', 'loot:Silver', 'heroReward:Silver'],
      7: ['upgrade:Silver', 'argenta'],
      8: ['orlin', 'trainer', 'trainer'],
      9: ['item:Silver', 'loot:Silver', 'heroReward:Silver'],
      10: ['enchantRandom', 'artist'],
      11: ['trainer', 'trainer', 'heroTeacher'],
      12: ['item:Gold', 'loot:Gold', 'heroReward:Gold'],
      13: ['upgrade:Any', 'orlin'],
      14: ['adira', 'trainer', 'trainer'],
      15: ['item:Gold', 'loot:Gold', 'heroReward:Gold'],
      16: ['upgrade:Any', 'orlin'],
      17: ['trainer', 'trainer', 'heroTeacher'],
      18: ['item:Gold|Diamond', 'loot:Gold|Diamond', 'heroReward:Gold|Diamond'],
      19: ['enchantRandom', 'enchantRandom', 'enchantRandom'],
      20: ['trainer', 'trainer', 'trainer'],
      21: ['item:Gold|Diamond', 'loot:Gold|Diamond', 'heroReward:Gold|Diamond'],
      22: ['upgrade:Any', 'orlin'],
      23: ['trainer', 'trainer', 'heroTeacher'],
      24: ['item:Gold|Diamond', 'loot:Gold|Diamond', 'heroReward:Gold|Diamond'],
      25: ['upgrade:Any', 'orlin'],
      26: ['trainer', 'trainer', 'trainer'],
      27: ['item:Gold|Diamond', 'loot:Gold|Diamond', 'heroReward:Gold|Diamond'],
      28: ['upgrade:Any', 'orlin'],
      29: ['trainer', 'trainer', 'heroTeacher']
    },
    LEVEL_REWARDS_LOOP: [26, 29],   // cấp > 29 lặp mẫu 26..29 [ĐỀ XUẤT: wiki chỉ liệt kê tới 29]
    // Thẻ gặp gỡ cố định theo InternalName (encounters.js): [bảng, tên]
    LEVEL_SLOT_EVENTS: {
      pip: ['events', 'Pip (Level Up)'], argenta: ['events', 'Argenta (Level Up)'], orlin: ['events', 'Orlin (Level Up)'],
      adira: ['events', 'Adira (Level Up)'], artist: ['pedestals', 'The Artist (Level Up)'],
      'upgrade:Bronze': ['pedestals', 'B1&B2 - Upgrade a Bronze-tier item (Level Up)'],
      'upgrade:Silver': ['pedestals', 'Sterling - Upgrade a Silver item (Level Up)'],
      'upgrade:Any': ['pedestals', 'Forja - Upgrade an item (Level Up)']
    },
    // Chỉ địa điểm enchant bậc Diamond ở "Random Enchant Option"; ba địa điểm Legendary chỉ tới qua giờ tự do muộn [ĐỀ XUẤT]
    LEVEL_ENCHANT_TIERS: ['Diamond'],

    // ---- sự kiện: phương án dự phòng [ĐỀ XUẤT] ----
    // Hành động không mô phỏng được (Transform, ExitReplacementSet, Spawn/Deal mà mô tả không đọc ra bộ lọc...) và sự kiện
    // chỉ có mô tả: thay bằng phần thưởng chung theo dải ngày (vàng ≈ "Cache of Riches" 3/5/... của data).
    GENERIC_GOLD_BY_BAND: { Bronze: 3, Silver: 5, Gold: 8, Diamond: 12, Legendary: 15 },
    GENERIC_XP: 2,            // "Study (Default Option) Gain 2 XP" (encounters.js) — mức XP sự kiện chung
    // Các loại sự kiện được bày ở giờ tự do. "unknown" (bước con không nối được theo tên) bị loại; sự kiện con (có `Parents`)
    // chỉ tới được qua sự kiện cha.
    EVENT_KINDS_IN_POOL: { pile: 1, instant: 1, choice: 1, fight: 1, chain: 1 },
    // "Fight a Monster" (Epic Battle / Deadly Duel: FightTier, thẻ trận cụ thể bị xoá) [ĐỀ XUẤT]: quái đúng bậc FightTier,
    // cấp mẫu trong [ngày + lo, ngày + hi] như ô Vàng+ của giờ PvE.
    FIGHT_EVENT_LEVEL: { lo: 1, hi: 3 },
    // Sự kiện có trận cố định (Treasure Chest (Mimic) L11) chỉ bày khi cấp quái ≤ ngày + chừng này [ĐỀ XUẤT: Mimic L11 vào ngày 7+]
    EVENT_FIGHT_LEVEL_SLACK: 4,
    // [WIKI2 E13] Giờ tự do KHÔNG còn gieo bậc theo bảng tự đặt: mỗi ô lấy ĐỀU trong các gặp gỡ đúng ngày (Category_Event 2025-06-04
    // "Day N+"). Ngày của một gặp gỡ, theo thứ tự: WIKI_DAYS (dưới, wiki xác nhận) -> bazaardb days_active (data/shops.js, mới hơn
    // wiki) -> Days trong tên (data/encounters.js) -> DAYS_BY_TIER theo bậc của thẻ [ĐỀ XUẤT: Category_Event cho thấy Bronze/Silver
    // "Day 1+", Gold "Day 2+", Diamond 5+..8+ (Hospital ?-5+, Forja ?-6+, The Cult 6+, Aldric ?-8+), Legendary Frozen Tomb "Day 10+"].
    DAYS_BY_TIER: { Bronze: [1, 99], Silver: [1, 99], Gold: [2, 99], Diamond: [6, 99], Legendary: [10, 99] },
    // [WIKI] ngày wiki xác nhận, khoá InternalName. Thắng cả bazaardb days_active vì là dòng confirmed của WIKI2.
    WIKI_DAYS: {
      Haddy: [8, 99],                         // Haddy / Category_Event: "Day 8+" [WIKI2 E2]
      'Study (Default Option)': [2, 99],      // Study: "Day 2, 4+"; 2.5.0 "No longer spawns on Day 3" (WIKI_SKIP_DAYS) [E6]
      Form: [7, 99],                          // Category_Event "Day 7+" [E15]
      Pol: [5, 99],                           // Version 0.1.3 "Pol (Large Merchant) no longer spawns on Day 3 and 4" [M7]
      'Treasure Chest (Mimic)': [10, 99],     // Treasure Chest: "(if it is Day 10+) Fight Mimic" [E12]
      // bệ yểm bùa: "Day 10+" (Bladeborn Badlands, Burning Caldera, Celestial Conduit, Guardian's Gorge, Languid Dunes = Gravity's
      // Altar, Murkwood Bayou, Tranquil Spring = Plains of Edin, Sanguine Valley, Frozen Tomb = Yetarian Tomb) [E14]
      'Bladeborn Badlands': [10, 99], 'Burning Caldera': [10, 99], 'Celestial Conduit': [10, 99], "Guardian's Gorge": [10, 99],
      "Gravity's Altar": [10, 99], 'Murkwood Bayou': [10, 99], 'Plains of Edin': [10, 99], 'Sanguine Valley': [10, 99], 'Yetarian Tomb': [10, 99]
    },
    WIKI_SKIP_DAYS: { 'Study (Default Option)': [3] },
    // ---- giá vàng của lựa chọn sự kiện [WIKI2 E1] (khoá InternalName của bước; 0 = miễn phí, bỏ huy hiệu bazaardb đặt nhầm chỗ) ----
    // Eating Contest (2024-11-29): "Basic: 5 bronze / (5 gold) Deluxe: 5 silver / (10 gold) Premium: 5 Gold-tier";
    // Form (2025-03-05): "Exploit / 5 Sharpen Weapon / 10 Upgrade / 20 Engrave"; Aldric, Botul (2025-05-18), D'fleck, Flambé (2025-05-08),
    // Mad Maddie (2025-05-31): "Exploit / Purify|New Coating|Reinforce|Temper|Extended Magazine 5 / Upgrade 10 / Enchant 20";
    // Economic Seminar: "(4 gold) Get 2"; Artisan Dunes (2025-05-18): "(5g) Find Better Craftsman";
    // Gumball Machine Event (2025-05-06): "purchasing a Gumball for 1 Gold" (gói 5 viên = 5 vàng, EVENT_COSTS_RE).
    // Chọn = trừ vàng trước khi chạy bước; thiếu vàng thì từ chối (R.legal không liệt kê).
    EVENT_COSTS: {
      'Basic Chocolate Bars (Eating Contest)': 0, 'Deluxe Chocolate Bars (Eating Contest)': 5, 'Premium Chocolate Bars (Eating Contest)': 10,
      'Exploit (Form)': 0, 'Sharpen (Form)': 5, 'Sharpen Weapon (Form)': 5, 'Upgrade (Form)': 10, 'Enhance (Form)': 10, 'Engrave (Form)': 20, 'Enchant (Form)': 20,
      'Exploit (Aldric)': 0, 'Purify (Aldric)': 5, 'Upgrade (Aldric)': 10, 'Enchant (Aldric)': 20,
      'Exploit (Botul)': 0, 'New Coating (Botul)': 5, 'Upgrade (Botul)': 10, 'Enchant (Botul)': 20,
      "Exploit (D'flek)": 0, "Reinforce (D'flek)": 5, "Upgrade (D'flek)": 10, "Enchant (D'flek)": 20,
      'Exploit (Flambe)': 0, 'Temper (Flambe)': 5, 'Upgrade (Flambe)': 10, 'Enchant (Flambe)': 20,
      'Exploit (Mad Maddie)': 0, 'Extended Magazine (Mad Maddie)': 5, 'Upgrade (Mad Maddie)': 10, 'Enchant (Mad Maddie)': 20,
      'The Financial District - Economic Seminar - Premium Pass': 4, 'Find Better Craftsman': 5
    },
    // Sự kiện chỉ bày một số bước: Haddy (2025-03-19) "One prize is randomly selected" -> chỉ "Spin the Wheel" (ra 1 trong 6 giải đều
    // nhau, gồm Magician's Top Hat: St.FX), không cho người chơi tự chọn giải [WIKI2 E2]
    EVENT_ONLY_STEPS: { Haddy: ['Haddy - Spin the Wheel'] },
    // Lựa chọn tự dựng cho sự kiện mà bản demo mất bước (kind 'generic', key giải ở R.GENERIC_FX, enc-step.js) [WIKI2 E12]
    EVENT_EXTRA_CHOICES: {
      "Finn's Big Bite": [
        { key: 'finn:gravy', name: "Guardian's Gravy Plate", desc: 'Permanently gain 5% Max Health. Your Shield items gain +10 Shield' },
        { key: 'finn:risotto', name: 'Restorative Risotto', desc: 'Permanently gain 5% Max Health. Your Heal items gain +10 Heal' },
        { key: 'finn:stew', name: 'Vitality Stew', desc: 'Permanently gain 5% Max Health and 5 Regen' }
      ]
    },
    EVENT_COSTS_RE: [[/^Get a Gumball \(\d+\)$/, 1], [/^Get 5 Gumballs \(\d+\)$/, 5]],
    // Bậc ép cho phần thưởng của bước [WIKI2 E7]: "All Gumballs are of Bronze tier" (Gumball Machine Event 2025-05-06)
    EVENT_REWARD_TIER_RE: [[/Gumballs? \(\d+\)$/, 'Bronze']],
    // Bản đồ đổi thẻ có luật reroll riêng mà dữ liệu thiếu [WIKI2 E9]: Pearl's Dig Site (2025-02-25) "infinite rerolls, first 1 gold,
    // each subsequent 1 more ... items from any hero and from the Monster pool"
    EVENT_PILE_RULES: { "Pearl's Dig Site": { rr: { TotalAllowedRerolls: 999, StartingCost: 1, CostIncrease: 1 }, hero: 'any', monsterLoot: true } },
    // Tên nội bộ không đưa vào bể giờ tự do (sự kiện con / tiếp diễn của chuỗi sự kiện khác).
    // Statia: chỉ ở lần uy tín về 0 đầu tiên (Futura / Category_Event "Prestige reaches 0 the first time") [WIKI2 E5].
    // Thieves Guild: chỉ tới khi bán Thieves Guild Medallion / qua Mysterious Portal (Category_Event); bản web không có ba lựa chọn
    // Hostile Takeover / Dodge Taxes / Raid the Vault nên loại khỏi giờ tự do [WIKI2 E11].
    ENCOUNTER_EXCLUDE: /Return|Rewards?$|^Greenheart|^Dungeon|^Fierce Competition|^Furry|Financial District - (?!Economic Seminar$)|Futura|Magic Mirror|The Cult|^\[Shrouded Figure\].*Chest$|Travel Agent|^Statia$|^Thieves Guild$/,
    // Treasure Chest (Category_Event "Day 1+", trang: "Get an item. (if it is Day 10+) Fight Mimic") [WIKI2 E12]: bản thường vào bể
    // từ ngày 1 (Bronze), bản Mimic chỉ từ ngày 10 (WIKI_DAYS). "The Financial District - Economic Seminar" (wiki Economic Seminar:
    // Pygmalien, Day 3-5, "Get an Economic item or skill; (4 gold) Get 2") được vào bể; các mục Financial District khác vẫn loại.
    // Gặp gỡ / bước NHÁP của bản demo: nói "Speed" (game không có chỉ số Speed; ability thật là +Crit Chance giữ chỗ), không có trong
    // bazaardb events.json (19.2) lẫn wiki (trang "Speed" đã {{delete}}; Tok's Clocks là thương nhân Bạc "Sells Haste, Slow and Cooldown
    // items"). Không bày ở giờ tự do, không bày làm lựa chọn (enc-event optionOk). Khoá InternalName.
    PLACEHOLDER_ENCOUNTERS: ["Tok's Clocks (Charged Up More)", 'Charged Up', 'Run a Race', 'Gain 10 Speed', 'Eat it - speed',
      'Greenheart Ambush Run Speed', 'Run With It'],
    // [CONTENT-02] Travel Agent "Sells Expedition Tickets": chế độ thám hiểm (BZ_ENCOUNTERS.expeditions) chưa có trong bản web, nên thương nhân
    // chỉ biết bán 3 vật phẩm ngẫu nhiên: loại khỏi bể cho tới khi có thám hiểm. Futura là thẻ Fates (FATES_EVENT), tới qua pha 'fates', không qua giờ tự do.
    // Magic Mirror cũng loại: "Get a copy of any item on your board" chưa có bản sao chạy đúng ở giờ tự do.

    // ---- rương mốc thắng 4 / 7 / 10 ----
    // [ĐO TRÊN CLIP] https://youtu.be/PSP75k4R4Pk?t=300 "4 wins bronze, 7 silver, 10 gold" — rương thật là phần thưởng tài khoản
    // (skin + gem, CompleteRunResult) nên bản web [ĐỀ XUẤT] đổi thành phần thưởng TRONG run: mở rương = chạy sự kiện
    // "<Bậc> Loot (Level Up)" của dữ liệu (encounters.js: "+N Gold" bằng ability 0, "a <Bậc>-tier Loot item") và bày
    // CHEST_PICKS thẻ Loot bậc đó để chọn 1. Thiếu sự kiện trong dữ liệu thì chia thẻ tag Loot đúng bậc.
    CHESTS: [
      { wins: 4, tier: 'Bronze', loot: 'Bronze Loot (Level Up)' },
      { wins: 7, tier: 'Silver', loot: 'Silver Loot (Level Up)' },
      { wins: 10, tier: 'Gold', loot: 'Gold Loot (Level Up)' }
    ],
    CHEST_PICKS: 3,           // [ĐỀ XUẤT] như LOOT_PICKS: chọn 1 trong 3

    // ---- thương nhân mua đồ giá cao ("Buys your X items at +N Value") ----
    // Aura "3" của Quixel 323e2c05 / Midsworth b8f55bb0 / Barkun 8f0aea10 trong cards.json [ĐO TRONG REPO]:
    // TAuraActionCardModifyAttribute SellPrice Add N, đích AbsolutePlayerHandAndStash lọc theo cỡ. data/encounters.js chưa
    // chở `Auras` của thẻ gặp gỡ nên chép lại đây; khi encounters.js có `Auras` thì đọc thẳng từ đó.
    MERCHANT_SELL_AURAS: {
      Quixel: [{ AttributeType: 'SellPrice', Operation: 'Add', Value: 3, Sizes: ['Large'] }],
      Midsworth: [{ AttributeType: 'SellPrice', Operation: 'Add', Value: 2, Sizes: ['Medium'] }],
      Barkun: [{ AttributeType: 'SellPrice', Operation: 'Add', Value: 1, Sizes: ['Small'] }]
    },

    // Số aura trong chữ của thẻ gặp gỡ mà dữ liệu chưa chở (Auras): "Pick a Chest containing up to {aura.9} XP/Gold" của Shrouded Figure
    // = thuộc tính Custom_0 của chính bước đó (cards.json `Attributes.Custom_0`: Knowledge 3, Wealth 30) [ĐO TRONG REPO].
    ENCOUNTER_AURA_VALUES: {
      // [CONTENT-12] Trò Bazball của Bex: {aura.3} = điểm Kyvers, {aura.4} = điểm Rogues, {aura.5} = tiền cược (cards.json Custom_2 = 5, TRangeValue 5..5).
      // Điểm thật là biến chạy 0..10 theo hiệp [ĐỀ XUẤT]: số cố định nhất quán với từng bước (Kyvers dẫn ở hiệp 1-3, thắng 8-5 / thua 5-8).
      '[Bex] 1st Quarter': { 3: 2, 4: 1 }, '[Bex] 2nd Quarter': { 3: 4, 4: 3 }, '[Bex] 3rd Quarter': { 3: 6, 4: 5 },
      '[Bex] Wins - Bet': { 3: 8, 4: 5, 5: 5 }, '[Bex] Wins - No Bet': { 3: 8, 4: 5 },
      '[Bex] Lose - Bet': { 3: 5, 4: 8, 5: 5 }, '[Bex] Lose No Bet': { 3: 5, 4: 8 },
      '[Shrouded Figure] Choose Knowledge': { 9: 3 },
      '[Shrouded Figure] Choose Wealth': { 9: 30 }
    },

    // ---- hiệu ứng "get a ..." của vật phẩm (Spawn/Deal; SpawnContext bị xoá) ----
    // [ĐỀ XUẤT] thẻ sinh ra theo bậc của thẻ nguồn (TSpawnBehaviorInheritTier có trong Domain.Spawning, giá trị bị xoá);
    // bậc đó không có trong thang của thẻ đích thì lùi xuống bậc gần nhất.
    SPAWN_INHERIT_TIER: true,

    // ---- hero chơi được khi chưa có danh sách hero (BZ_HEROES) ----
    // [ĐỀ XUẤT] hero có ít nhất chừng này vật phẩm trong data/cards.js = bể thẻ đã nạp đủ (bể đủ: 119-159 món, CODE-RUN §4.1;
    // hero chỉ có thẻ nằm trên bàn quái: ≤ 60 món).
    HERO_MIN_ITEMS: 90,

    // ---- giới hạn bàn ----
    // 6 ô kỹ năng quanh chân dung [ĐO TRÊN CLIP] https://youtu.be/PSP75k4R4Pk?t=110 ("skill slots as 6 round sockets around portrait") và thẻ hết run
    // 6 huy hiệu kỹ năng (wUzq6Q4u9Jc?t=2724); bản legacy BazaarBoard.cs:113 chỉ có 4 [FLOW-8]
    SKILL_SLOTS: 6,
    STASH_SLOTS: 10,          // BazaarBoard.cs:107; mở hết [ĐỀ XUẤT CODE-RUN §2.6: PlayerStorageHand không có mảng khoá]
    LOG_MAX: 400              // nhật ký run giữ tối đa chừng này dòng (localStorage)
  };
  R.TUNING.ENCOUNTER_TIER_ODDS_BY_DAY = R.TUNING.TIER_ODDS_BY_DAY;

  if (typeof module !== 'undefined' && module.exports) module.exports = R;
})(typeof window !== 'undefined' ? window : globalThis);

/* ---- Khối của nhánh rulesB (PvE theo ngày, XP khi thua, kỹ năng hợp nhất, bể quái muộn) ---- */
(function (root) {
  'use strict';
  var TU = root.BZRun.TUNING;
  // RUN-02 / WIKI2 P2-P4: danh sách quái giờ PvE theo NGÀY nay do tools/data.py sinh vào data/encounters.js `pveDays` (wiki Monsters
  // ghép theo (tên, bậc), đủ bốn tên đổi: Tempest Flamedancer, Shock Trooper, Death Knight Reaper, Veteran Octopus; phần thưởng theo
  // bậc 2.5.0; máu wiki khi phải mượn thẻ bậc khác). Bảng tên dưới chỉ còn để dự phòng khi dữ liệu cũ chưa có pveDays.
  TU.PVE_BY_DAY = [
    ['Banannabal', 'Fanged Inglet', 'Haunted Kimono', 'Kyver Drone', 'Pyro', 'Viper'],
    ['Coconut Crab', 'Giant Mosquito', 'Covetous Thief', 'Rogue Scrapper', 'Boarrior', 'Ventriloquist'],
    ['Dabbling Apprentice', 'Tempest Flamedancer', 'Rogue Scrapper', 'Frost Street Challenger', 'Street Gamer', 'Eccentric Etherwright', 'Hooverbike Hooligan'],
    ['Boilerroom Brawler', 'Outlands Dervish', 'Bloodreef Raider', 'Retiree', 'Hellbilly', 'Ahexa', 'Prince Marianas', 'Flame Juggler'],
    ['Preening Duelist', 'Sabretooth', 'Flame Juggler', 'Harkuvian Rocket Trooper', 'Infernal Envoy', 'Kyver Commander', 'Gorgon Noble', 'Mod Squad', 'Trashtown Mayor', 'Scovyle'],
    ['Dire Inglet', 'Dire Mosquito', 'Zookeeper', 'Foreman', 'Trash Golem', 'Enclave Weeper', 'Loan Shark', 'Infernal', 'Lich'],
    ['Sergeant Suds', 'Viper Tyrant', 'Cosmic Roc', 'Joyful Jack', 'Thug', 'Treasure Turtle', 'Chilly Charles', 'Shock Trooper', 'Ghost Pepper', 'Radiant Corsair'],
    ['Cosmic Roc', 'Joyful Jack', 'Infernal Frigate', 'Bouncertron', 'Car Conductor', 'Oasis Guardian', 'Burninator Bot', 'Dr. Vortex', 'Wandering Shoal', 'Dragon'],
    ['Yerdan', 'Bloodreef Captain', 'Oasis Guardian', 'Elite Duelist', 'Roaming Isle', 'Ferros Khan', 'Weapons Platform', 'Enclave Revenant', 'Death Knight Reaper'],
    ['Boss Harrow', 'Hulking Experiment', 'Master Alchemist', 'Lord of the Wastes', 'Trash Titan', 'Volkas Enforcer', 'Property Baron', 'Frost Street Champion',
      'Void Colossus', 'Awakened District', 'Void Golem', 'Lord Arken', 'Veteran Octopus']
  ];
  // Tên wiki khác tên trong dữ liệu (chính tả / đổi tên giữa bản vá) [ĐỀ XUẤT]: khớp sau khi đổi sang tên dữ liệu
  TU.PVE_NAME_ALIAS = { 'Banannabal': 'Banannibal', 'Hooverbike Hooligan': 'Hoverbike Hooligan', 'Enclave Weeper': 'Foundation Weeper',
    'Enclave Revenant': 'Foundation Revenant', 'Tempest Flamedancer': 'Tempest Bravo', 'Shock Trooper': 'Annex Trooper',
    'Death Knight Reaper': 'Void Knight', 'Veteran Octopus': 'Eight Arm Davvy' };
  // CONTENT-07: từ ngày 11 (sau bảng wiki, ngày vô hạn) bể quái thêm các quái cấp 15 mà "Day 10+" của wiki không liệt kê [ĐỀ XUẤT]
  TU.PVE_LATE_FROM_DAY = 11;
  TU.PVE_LATE_EXTRA = ['Morguloth', 'Void Golem', 'Lord Arken', 'Awakened District', 'Trash Titan'];
  // RUN-06 / WIKI2 R14: thua quái KHÔNG có XP. wiki Monsters (2025-07-10): "the rewards for winning that fight ... gold, XP and one of the
  // Monster's items"; DB: RewardDefeat.ExperienceReward = 0 ở 170/170 thẻ trận. (Bản cũ [ĐỀ XUẤT] trả nguyên XP khi trừ >= 50% máu quái.)
  TU.PVE_LOSS_XP_MIN_DAMAGE = Infinity;
  // CONTENT-05: thầy dạy cấp (Pip, Argenta...) không có bộ lọc tag đọc ra gì thì chia kỹ năng của hero thuộc dải bậc [ĐỀ XUẤT]
  TU.SKILL_ORPHAN_FALLBACK = true;
  TU.SKILL_ANY_CHANCE = 0.2;   // mỗi ô kỹ năng của thầy dạy không khoá bậc: xác suất chia từ MỌI bậc khởi đầu
  // W-40 / CONTENT-08: thẻ có dữ liệu nhưng KHÔNG có art trong game (không có thư mục thẻ, không ArtKey dùng được) nên bản web
  // không có hình để vẽ: ẩn khỏi mọi bể (thương nhân, sự kiện, đống đồ, đồ rơi sau trận, thầy dạy). [ĐO TRONG REPO]
  // D:azaar-refix6data.md CONTENT-08 ("11 items + Virulent Research have no art in game"). Khi có art thì xoá dòng.
  TU.HIDDEN_CARDS = [
    { name: 'Cyclops Eye', reason: 'không có art trong game' },
    { name: 'Sonic Cannon', reason: 'không có art trong game' },
    { name: 'Holo-Disguise Generator', reason: 'không có art trong game' },
    { name: 'Old Barrel', reason: 'không có art trong game' },
    { name: 'Yeti Claw', reason: 'không có art trong game' },
    { name: 'Acid Sprayer', reason: 'không có art trong game' },
    { name: 'Pyro Gauntlet', reason: 'không có art trong game' },
    { name: 'Plasma Whip', reason: 'không có art trong game' },
    { name: 'Javalin', reason: 'không có art trong game' },
    { name: 'Poison Blades', reason: 'không có art trong game' },
    { name: 'Cybernetic Implants', reason: 'không có art trong game' },
    { name: 'Virulent Research', reason: 'kỹ năng không có art trong game' }
  ];
})(typeof window !== 'undefined' ? window : globalThis);
