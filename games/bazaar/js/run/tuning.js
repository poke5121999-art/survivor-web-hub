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
    // Cấp 1 = 300 máu [ĐO TRÊN CLIP] https://youtu.be/PSP75k4R4Pk?t=123 ("Health is 300 at level 1"); mỗi cấp cộng theo BZ_MODE.levelUps
    // (bản demo; clip cũ https://youtu.be/wUzq6Q4u9Jc đầu ngày: C2 350, C3 450, C5 800, C7 1350, C9 2100 — bản vá khác, KHÔNG ép khớp).
    START_HP: 300,
    // Lựa chọn mở màn (thay cho "Start Run" của từng hero: bể thẻ bị xoá) [WIKI §1.1 start-of-run guide]
    START_INCOME_OPTION: { gold: 12, income: 2 },   // "+12 Gold, +2 Income" trên nền 8/5
    START_ITEM_SIZE: 'Small', // "Enchanted Start: one random Small, Bronze-start item enchanted, from the hero pool"

    // ---- lịch giờ (CODE-RUN §1.2-1.3; WIKI §1.2: giờ 0,1,3,4 tự do, giờ 2 quái, giờ 5 PvP) ----
    PVE_HOUR: 2,              // [WIKI §1.2] "The third encounter in each Day is always a PvE Monster fight"
    PVP_HOUR: 5,              // [WIKI §1.2] hour 5 = PvP ghost fight
    // Mỗi giờ tự do bày 3 thẻ: 1 thương nhân + 1 sự kiện + 1 tự do [ĐỀ XUẤT] theo EncounterBreakdown mặc định
    // (Merchant 1, Combat 1, Flex 1 — Models\BazaarDayByHourManager.cs:20-24) bỏ ô combat vì quái có giờ riêng (WIKI).
    HOUR_SLOTS: ['merchant', 'event', 'any'],

    // ---- tỉ lệ bậc theo ngày (ItemSkillSpawnTierPercantagesByDay bị xoá) ----
    // [ĐỀ XUẤT] CODE-RUN §3.2: dốc mượt theo dải ngày đo được (D1-3 Đồng, 4-6 Bạc, 7-9 Vàng, 10 Kim cương — §3.7).
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
    PVE_EXCLUDE: /PVE_|PvP|Hour 6|Dummy|Big Bad Wolf|Bounty Hunter|Sparring/,
    LOOT_PICKS: 3,            // [ĐỀ XUẤT] CODE-RUN §3.5: "offer 3 random distinct items/skills from the defeated monster's board"

    // ---- PvP bóng giờ 5 [ĐỀ XUẤT] (TGhost + máy chủ ghép trận không có trong bản demo) ----
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
    // Hết giờ (hoà) tính là thua cho người chơi [ĐỀ XUẤT: legacy BazaarCardDealer bàn 0 thua khi hết giờ, CODE-COMBAT §1.12]
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
    FATES_PICKS: 3,
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
    // [CONTENT-03] Bậc của thẻ gặp gỡ ở giờ tự do, thêm cột Legendary (Freiya, Statia, bệ Yetarian Tomb / Arcane Abyss / Sanguine Valley).
    // Cột: Bronze, Silver, Gold, Diamond, Legendary. Tỉ lệ thật nằm ở máy chủ [ĐỀ XUẤT]: Legendary chỉ từ ngày 8, 3% → 5% → 8%
    // (wiki chỉ thấy thương nhân Legendary ở cuối run); bốn cột đầu giữ như TIER_ODDS_BY_DAY.
    ENCOUNTER_TIER_ODDS_WITH_LEGENDARY: [
      [100, 0, 0, 0, 0], [80, 20, 0, 0, 0], [55, 40, 5, 0, 0], [25, 55, 20, 0, 0], [10, 50, 35, 5, 0],
      [5, 35, 45, 15, 0], [0, 20, 50, 30, 0], [0, 10, 45, 45, 3], [0, 5, 35, 60, 5], [0, 0, 25, 67, 8]
    ],
    // Tên nội bộ không đưa vào bể giờ tự do (sự kiện con / tiếp diễn của chuỗi sự kiện khác)
    ENCOUNTER_EXCLUDE: /Return|Rewards?$|^Greenheart|^Dungeon|^Fierce Competition|^Furry|Financial District - |Futura|Magic Mirror|The Cult|Chest$|Travel Agent/,
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
  // RUN-02: danh sách quái giờ PvE theo NGÀY, chép nguyên từ wiki Monsters https://thebazaar.wiki.gg/wiki/Monsters (đọc 2026-10-20).
  // Ngày 1 không có quái Vàng; ô không có quái đúng bậc trong danh sách ngày thì lấy quái bất kỳ còn lại của danh sách đó.
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
    'Enclave Revenant': 'Foundation Revenant' };
  // CONTENT-07: từ ngày 11 (sau bảng wiki, ngày vô hạn) bể quái thêm các quái cấp 15 mà "Day 10+" của wiki không liệt kê [ĐỀ XUẤT]
  TU.PVE_LATE_FROM_DAY = 11;
  TU.PVE_LATE_EXTRA = ['Morguloth', 'Void Golem', 'Lord Arken', 'Awakened District', 'Trash Titan'];
  // RUN-06: DB không có XP thua (RewardDefeat.ExperienceReward = 0 ở 170/170 thẻ trận; LossExperiencePoints chỉ ở bản legacy
  // BazaarCard.cs:145, mặc định 0). [ĐỀ XUẤT] theo Mobalytics beginner-guide ("even if you lose ... the additional XP is well worth it",
  // "Dealing enough Damage in a fight grants you additional XP"): thua mà trừ >= 50% máu quái thì nhận nguyên XP thưởng của quái.
  TU.PVE_LOSS_XP_MIN_DAMAGE = 0.5;
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
