# Slime Legion 4.5.0 — số liệu đào từ APK

> Nguồn: `Slime+Legion_4.5.0_APKPure.xapk` (836 MB), gói `com.hero.may.cry.adventure.game`.
> Unity **2022.3.62f2**, IL2CPP, có xLua. Ngày đo: 2026-09-03.
>
> Nhãn `[ĐO TỪ APK]` = đọc trực tiếp từ file cấu hình của game. **Đây là nguồn mạnh nhất
> trong cả thư mục research** — mạnh hơn `[ĐO ĐƯỢC]` (wiki/guide) ở 5 file kia.
> Chỗ nào file này mâu thuẫn với `slime-legion-core.md` / `slime-legion-units-skills.md`
> thì **file này đúng**.

## 0. Cách lấy được

Gói `.xapk` gồm 4 phần; dữ liệu nằm trong `install_time_pack.apk` (754 MB), thư mục
`assets/assetpack/`. Cấu hình nằm ở 3 bộ song song:

| Bộ | Trạng thái | Nội dung lấy được |
|---|---|---|
| `config/` (bộ chính) | **Mã hoá toàn file** | Không đọc được |
| `config_t1/` | `const` không mã hoá, còn lại mã hoá | `GamePlayConst`, `AdsConst` |
| `config_t3/` | **Không mã hoá gì cả** | `ChapterConfig`, `ChapterWave_1..5`, `ChapterBoxConfig`, `GiftTriggerConfig`, `GamePlayConst`, `AdsConst` |
| `config/dungeon`, `config/elitechapter` | Không mã hoá | `DungeonBuildingConfig`, `EliteChapterWave` |

Các file mã hoá (`config/table.bytes` 2,4 MB — chứa chỉ số hero/quái/skill; `config/json.bytes`
6,9 MB; `common_language.bytes`) bị mã hoá **toàn bộ**, không phải chỉ header: bản không mã hoá
còn chuỗi `UnityFS`, `2022.3.62f2`, `AssetBundle`, còn bản mã hoá không còn chuỗi thật nào.
Cipher đã xác định là **XXTEA** với **một khoá toàn cục 16 byte** — xem mục 8.1. Metadata IL2CPP
(`global-metadata.dat`, magic `AF1BB1FA`, version 31) **còn nguyên chưa mã hoá**, nhưng khoá
không nằm trong đó cũng không nằm trong các section dữ liệu của `libil2cpp.so` — xem mục 8.2.

⚠️ **Cảnh báo về `config_t3`**: đây là một biến thể A/B, không chắc trùng hoàn toàn với bộ
`config/` đang chạy live. Cấu trúc bảng và các hằng số toàn cục thì đáng tin; riêng con số
đếm chương và đường cong độ khó nên coi là "của biến thể t3".

---

## 1. Bàn cờ và thao tác — `GamePlayConst` `[ĐO TỪ APK]`

| Khoá | Giá trị | Nghĩa (dịch từ mô tả tiếng Trung trong file) |
|---|---|---|
| `BoardInitColumnCount` | **6** | Số cột khởi tạo của bàn |
| `BoardInitRowCount` | **6** | Số hàng khởi tạo của bàn |
| `SkipNeedStep` | 6 | Số bước cần để được bỏ qua |
| `RetainSkillLimitCount` | **8** | Giới hạn số kỹ năng được giữ lại |
| `SceneTransferHeroCount` | 6 | Số hero cơ bản khi chuyển cảnh |
| `DefaultHeroIds` | 101\|102\|104\|106 | 4 hero mặc định |
| `HeroThreeMergeOneMoreProbability` | **0,5** | Ghép 3 → 50% ra thêm 1 con |
| `HeroFourMergeExtraGradeProbability` | **0,5** | Ghép 4 → 50% lên thêm 1 cấp |
| `MergeTipThreshold` / `MergeTipDelay` | 1 / 5,0 s | Gợi ý ghép bật sau 5 giây |
| `RuleAddBoxPosition` | 2_2\|3_2\|1_2\|4_2\|0_2\|5_2 | Vị trí sinh rương — cột 0–5, **hàng 2**, ưu tiên từ giữa ra biên |

**Lưới của Slime Legion là 6×6.** Đây là số đo, không phải suy đoán — và nó là bằng chứng trực tiếp
rằng một game mobile dọc đang chạy thật dùng đúng 6 cột.

## 2. Chiến đấu — `GamePlayConst` `[ĐO TỪ APK]`

| Khoá | Giá trị | Nghĩa |
|---|---|---|
| `HeroMaxDefenseRatio` | **0,8** | Trần giảm sát thương của hero (80%) |
| `EnemyMaxDefenseRatio` | 0,8 | Trần giảm sát thương của quái |
| `TowerMaxDefenseRatio` | 0,8 | Trần giảm sát thương của thành |
| `AttackSpeedReduceMax` | 0,9 | Giảm tốc đánh tối đa 90% |
| `AttackSpeedAddMax` | 999 | Tăng tốc đánh gần như không trần |
| `HeroMinAttackInterval` | **0,5 s** | Khoảng cách đánh tối thiểu |
| `FightSpeedList` | 1,5 \| 2,0 \| 2,5 | Ba mức tốc độ trận |
| `PushFix` | 50 | Hệ số lực đẩy trong trận |
| `GameEnemyAppearYPoint` | −5,5 | Y quái xuất hiện |
| `GameEnemyArriveYPoint` | 1,5 | Y quái chạm thành |

→ Lấp được đúng chỗ `slime-legion-units-skills.md` ghi "KHÔNG TÌM ĐƯỢC NGUỒN" về công thức giáp:
**giáp là % giảm sát thương, trần cứng 80%**, áp cho cả ba phía.

## 3. Hồi sinh, kỹ năng, quảng cáo `[ĐO TỪ APK]`

| Khoá | Giá trị |
|---|---|
| `ResurgenceDiamondCost` | 30 kim cương |
| `ResurrectionCount` | 1 lần/trận |
| `ResurrectionADDailyCount` | 3 lần quảng cáo/ngày |
| `ResurrectionAdHealMaxHpRatio` | hồi 50% HP tối đa |
| `ResurrectionTimeCount` | đếm ngược 10 giây |
| `RefreshSkillDiamondCost` | 30 kim cương/lần đổi kỹ năng |
| `RefreshSkillDiamondCostCount` | 3 lần/trận |
| `SkillRefreshAdPlayCount` | 1 lần quảng cáo/trận |
| `SkillRefreshUnlockChapter` | mở ở chương 2 |
| `SafetySkills` | 104 \| 204 \| 3202 (kỹ năng bảo hiểm — cơ chế pity) |

`AdsConst`: rương quảng cáo thắng trận mở ở chương 2, 3 lần/ngày; quảng cáo tăng thu nhập
trước ải ×1,2, 3 lần; quảng cáo tua 3× trong trận 1 lần/ngày; interstitial CD 30 s (khi tạm dừng)
và 120 s (khi kết toán).

## 4. Cấu trúc ải — `ChapterConfig` (1.744 dòng) `[ĐO TỪ APK]`

Cột thật của bảng: `id, name, scenes, pass_day, transfer_day, boss_forecast_step, chapter_wave,
terrain, hp, hero_card_max, coin_max, hero_bag_id, fixed_location_day, item_per_day,
skill_box_1, skill_box_2, skill_box_3, victory_box, enemy_death_effect, skill_value_type`.

- **`hp` = 1000 ở cả 1.744 dòng.** Máu thành **không đổi** suốt game — toàn bộ độ khó đến từ
  hệ số máu/sát thương của quái, không từ việc buff thành. Đây là quyết định thiết kế đáng học.
- **`boss_forecast_step` = 10** ở 721/1.744 dòng (còn lại = 0): boss được **báo trước đúng 10 bước**.
- `pass_day` (số ngày để qua chương): 1 (675), 10 (474), 30 (342), 99 (100), 5 (52), 20 (40),
  40 (39), 50 (21). Cốt truyện chính chủ yếu **30 ngày/chương**.
- `hero_card_max` 25/35/45 — trần mảnh hero nhận trong 1 chương, tăng theo tiến trình.
- `coin_max` 220 (Chapter1) → 1.800–2.400 (Chapter 10–20): trần vàng mỗi chương.
- `terrain` (khu vực đặc biệt) có ở **537** chương, dạng `ngày:nhómĐịaHình`, ví dụ Chapter16 =
  `1:300010|11:300040|21:300050` → đổi địa hình ở ngày 1, 11, 21.
- `skill_value_type` trỏ tới **4 bảng giá trị kỹ năng riêng cho từng chế độ**:
  `skillvalueconfigtower` (579 dòng), `...boss` (327), `...pvp` (142), `...temple` (36).
  Cùng một kỹ năng có số khác nhau tuỳ chế độ chơi.

### 4.1 Các chế độ chơi và quy mô (đếm theo tiền tố tên) `[ĐO TỪ APK]`

| Chế độ | Số ải |
|---|---|
| ElementTrial | 320 |
| LostTempleChapter | 316 |
| Tower | 310 |
| Chapter (cốt truyện) | 300 |
| PVP | 140 |
| Thử thách hằng ngày | 50 |
| Ải vàng / Ải mảnh hero | 50 / 50 |
| GuildTeamDungeon + GuildExpedition | ~115 |
| LightingChallenge / Hunt / Rush / PoolParty | 28 / 26 / 21 / 8 |

→ `slime-legion-core.md` (dựa trên wiki) ghi "~120–140 chapter" — **sai**. Riêng cốt truyện đã 300 dòng
(Chapter1–Chapter50 lặp qua nhiều dải id = nhiều bậc độ khó), tổng cộng 9.300 ngày chơi ở dải cốt truyện.
Và **game có PvP** — không file research nào trước đó biết điều này.

## 5. Đường cong độ khó — `ChapterWave_*` `[ĐO TỪ APK]`

Cột thật: `day, type, skill_boxes, step_range, enemy_group, fixed_enemy_group, resistance_factor,
weakness_factor, hp_ratio, attack_ratio, attack_hero_ratio, step_hp_ratio_added,
step_attack_ratio_added, card_count, item_count, total_exp`.

**Chapter 1** (10 ngày):

| Ngày | Loại | step_range | hp_ratio | EXP |
|---|---|---|---|---|
| 1 | thường | **10** | 0,40 | 100 |
| 2 | thường | **10** | 0,70 | 150 |
| 3 | thường | **6** | 1,20 | 300 |
| 4 | thường | 6 | 1,50 | 250 |
| 5 | **BOSS** | 6 | 1,80 | — |
| 6 | thường | 6 | 2,26 | 400 |
| 7 | thường | 6 | 2,60 | 450 |
| 8 | thường | 6 | 2,98 | 500 |
| 9 | thường | 6 | 3,39 | 550 |
| 10 | **BOSS** | 6 | 3,84 | — |

**Chapter 5** (20 ngày): hp_ratio 1,40 → 13,03 ở ngày 12, boss ở ngày 10 và 20.

Quy luật rút ra `[ĐO TỪ APK]`:
- **Ngân sách bước: 10 bước cho 2 ngày đầu (dạy người chơi), sau đó cố định 6 bước/ngày.**
- `hp_ratio` tăng **~1,15×/ngày** ở đoạn ổn định (Chapter 1 ngày 6→10: 1,15/1,146/1,138/1,13).
  Chapter 5 khởi đầu dốc hơn (~1,27×) rồi hội tụ về ~1,15×.
- `attack_ratio` = 1 ở mọi ngày đã đọc → **chỉ máu quái tăng, sát thương quái không tăng.**
  Độ khó là bài toán "đủ DPS trong 6 bước", không phải "tránh chết".
- Boss rơi vào **ngày 5 và ngày 10** (chương 10 ngày), hoặc ngày 10 và 20 (chương 20 ngày)
  → **cứ 5 hoặc 10 ngày một boss**.
- `EliteChapterWave` có thêm `resistance_factor` / `weakness_factor` dạng `Dictionary<int,float>`
  → **xác nhận có hệ khắc chế theo nguyên tố**, dạng hệ số nhân theo id hệ.

## 6. Monetization — `GiftTriggerConfig` (119 dòng) `[ĐO TỪ APK]`

Cột: `id, des, group, trigger_type, trigger_value, trigger_param, cd_group, gift_chain`.
Gói nạp **được kích theo hành vi**, không phải bày sẵn trong shop:

| Gói | Điều kiện | CD |
|---|---|---|
| Gói hồi sinh | khi chết | 5 phút |
| Gói thất bại | **sau 3 lần thua** | 1.440 phút (24 giờ) |
| Gói tân thủ | ngay đầu game | ~vĩnh viễn |

`gift_chain` = chuỗi 9 gói nối tiếp (20001→20009) cho gói thất bại — người chơi thua càng nhiều
thì càng leo sâu vào chuỗi giá.

`ChapterBoxConfig` (747 dòng): mốc thưởng theo `chapter_id` + `day`. Chapter 1 có mốc ở **ngày 5**
(200 vàng) và **ngày 10** (10 gem + 4 hero 101/102/104/106) — mốc rương trùng đúng ngày boss.

---

## 7. Những chỗ file này bác bỏ research cũ

| Nội dung | 5 file research (wiki) | APK `[ĐO TỪ APK]` |
|---|---|---|
| Kích thước bàn | không có số | **6×6** |
| Số chương | ~120–140 | 300 dòng cốt truyện / 1.744 tổng |
| Giữ kỹ năng qua trận | "giữ 1 skill" | `RetainSkillLimitCount` = **8** |
| Công thức giáp | KHÔNG TÌM ĐƯỢC NGUỒN | % giảm sát thương, **trần 80%** |
| Hệ khắc chế | chỉ suy đoán tên hệ | xác nhận có, dạng `Dictionary<hệ, hệ số>` |
| Máu thành | không có số | **1000, không đổi toàn game** |
| PvP | không nhắc | **có, 140 ải** |
| Ngân sách bước/ngày | không có số | **10, 10, rồi 6 cố định** |
| Nhịp boss | "Day 10 có boss" | **ngày 5 và 10** (hoặc 10 và 20) |

## 8. Còn lại chưa lấy được

Nằm trong `config/table.bytes` + `config/json.bytes` (mã hoá):
chỉ số gốc 68 hero, chỉ số quái theo id, bảng kỹ năng đầy đủ, bảng talent, bảng khắc hệ cụ thể,
giá gold nâng cấp, tỉ lệ gacha, số Stamina.

### 8.1 Đã xác định được cơ chế mã hoá `[ĐO TỪ APK]`

- Cipher: **XXTEA**. Lớp `XXTEA` trong assembly `FQDev.AssetBundles`
  (package `com.fqdev.abmanager`, file `Runtime/XXTEA.cs`), các hàm
  `Xxtea`, `MX`, `ToUInt32Array`, `DecryptBase64String`, `DecryptToString`.
  Đây là bản port của thư viện **xxtea-dotnet**: word little-endian,
  `delta = 0x9E3779B9`, `rounds = 6 + 52/n`, khoá pad/cắt về đúng 16 byte.
- Bằng chứng độc lập: **cả 8 file mã hoá đều có kích thước chia hết cho 4**
  (nhưng không chia hết cho 8 hoặc 16) — đúng đặc trưng XXTEA, đồng thời loại trừ
  AES/TEA/XTEA dạng khối. Hằng số `0x9E3779B9` có mặt trong `libil2cpp.so`;
  **không** có S-box AES.
- Chỉ **8/8344** file `.bytes` bị mã hoá — đúng 8 file cấu hình, phần còn lại
  (prefab, hiệu ứng, UI) là UnityFS thường.
- Mã hoá **toàn file**, một khoá toàn cục duy nhất (không phải khoá theo từng file:
  XXTEA vốn cho ra ciphertext khác nhau hoàn toàn dù cùng khoá).
- 30 byte đầu của mọi bundle là hằng số (`UnityFS ` + version 8 + `5.x.x` +
  `2022.3.62f2`) → có sẵn known-plaintext để kiểm khoá.
- `App.Encryption.EncryptedInt` (hàm `EncryptDecrypt`) là bộ chống hack **số nguyên
  trong RAM**, không liên quan tới bundle — đừng nhầm.

### 8.2 Chỗ đã tìm khoá và không thấy

**Oracle dùng để thử khoá** (quan trọng — quyết định độ tin cậy của mọi kết quả âm tính dưới đây):

1. *Oracle nội dung*: 30 byte đầu mọi bundle là hằng số `UnityFS ` + version 8 + `5.x.x` + `2022.3.62f2`.
2. *Oracle độ dài* — **không phụ thuộc nội dung**: xxtea-dotnet ghi **độ dài gốc vào word cuối cùng**,
   và khi giải mã nó kiểm `len-7 ≤ m ≤ len-4`. Nghĩa là dù plaintext có phải bundle hay không
   (kể cả nếu pipeline nén trước rồi mới mã hoá), khoá đúng vẫn lộ ra.

Lúc đầu tôi chỉ dùng oracle 1 — nếu plaintext không phải bundle thì mọi lượt quét sẽ âm tính giả.
Đã bổ sung oracle 2 và chạy lại các vùng rẻ. Kết quả không đổi.

Tốc độ: **~13.000 khoá/giây** (XXTEA vector hoá theo chiều khoá bằng numpy, nhanh hơn ~300 lần
bản tuần tự). File oracle: `config_t1/chapter.bytes` (1.255 word — file mã hoá nhỏ nhất).

| Vùng đã vét | Số khoá | Kết quả |
|---|---|---|
| 24.948 string literal C# (thô, pad-0, cắt 16, md5, sha256, base64, hex, hex-của-md5, UTF-16LE) | ~410.000 | không |
| `global-metadata.dat` — field + param default values, mọi offset | 1,26 triệu | không |
| `libil2cpp.so` `.rodata`+`.data`+`.data.rel.ro`, mọi offset | 6,0 triệu | không |
| `libil2cpp.so` section `il2cpp` + `.text`, offset căn 4 | 10,7 triệu | không |
| Hằng số dựng bằng cặp ARM MOVW/MOVT (28.710 hằng, cửa sổ trượt 4) | 28.565 | không |
| Chuỗi byte dựng bằng `MOV Rd,#imm8` liên tiếp | 12.883 | không |
| Chuỗi trong **9 file DEX** (thô + md5 + hex-md5) | 1,55 triệu | không |
| ±4 KB quanh hằng số delta, cả 4 tổ hợp endian | 16.000 | không |
| Khoá dẫn xuất từ tên file/bundle/package/nhà phát hành | vài trăm | không |

Đã loại trừ thêm:
- **Không phải XOR khoá dài lưu sẵn**: 30 byte keystream của cả 8 file không xuất hiện trong
  `libil2cpp.so`, `libunity.so`, `libxlua.so`, `global-metadata.dat`.
- **Khoá không phải chuỗi C#**: namespace `App.Encryption` chỉ có `EncryptedInt`, game **không**
  có lớp obfuscated-string nào — nên nếu khoá là chuỗi thì nó phải là literal thường, mà literal
  đã vét sạch. → Khoá là `byte[]`.
- **Không phải AES/TEA/XTEA**: không có S-box AES trong binary; kích thước file chia hết cho 4
  nhưng không chia hết cho 8/16.

### 8.3 Còn lại

Đang quét section `il2cpp` (39 MB) và `.text`. Nếu vẫn không thấy thì khoá được **dựng
trong lúc chạy** bằng immediate ARM (MOVW/MOVT) chứ không nằm liền 16 byte trong file —
lúc đó phải dịch ngược mã ARM quanh hàm `XXTEA.Xxtea`, hoặc chạy game trong emulator rồi
dump khoá từ RAM.

---

## 9. Roster hero — 59 id + tên `[ĐO TỪ APK]`

Rút từ `GiftTriggerConfig` (cột `trigger_value` = hero id, cột `des` = tên). Đây là roster
**thật**, thay cho chỗ `slime-legion-units-skills.md` chỉ có 7/68 unit từ wiki.

| id / tên | id / tên | id / tên |
|---|---|---|
| 103 IronBull | 128 Titanum | 150 Nobody |
| 107 ThunderRobot | 129 Spikeweed | 151 Oliver |
| 108 WarriorBull | 130 Monkey | 152 Mina |
| 109 Enchantress | 131 Undine | 153 Prophet |
| 110 Vampire (吸血鬼) | 132 Ghost | 154 Silanui |
| 111 Lord | 133 Fattie | 155 Pilot |
| 112 Totem | 135 Yuffie | 156 Guardian |
| 113 Joker | 136 Hades | 157 Laplace |
| 114 Engineer | 137 WaterDragon | 158 Finer |
| 115 Succubus | 138 RockDragon | 159 DarkKnight |
| 116 Witch | 139 Luby | 160 Nox |
| 117 Medusa | 141 Venom | 161 Hemera |
| 118 Naga | 142 RockBull | 162 Panda |
| 119 Siren | 143 PinkBeer | 163 Medea |
| 120 Nova | 144 Amy | 164 Navier |
| 121 NightElf | 145 Spider | 165 Drogon |
| 124 Cactus | 146 GhostMonkey | 166 ElynSea |
| 125 StoneMan | 147 Bella | 183 Giant Rock Tortoise |
| 126 Zombie | 148 WhiteOni | 185 Unicorn |
| 127 Chomper | 149 Judge | |

Id 101/102/104/105/106 là 4 hero mặc định + 1 (xem `DefaultHeroIds` = 101\|102\|104\|106 và
phần thưởng ngày 10 chương 1). Khoảng trống id (104–106, 122–123, 134, 140, 167–182, 184)
là hero chưa lộ tên trong bảng này — tên đầy đủ nằm trong `common_language.bytes` (còn mã hoá).

**Phân tầng theo cách game bán hero** `[ĐO TỪ APK]` — suy ra từ `trigger_type` và độ dài chuỗi gói:

| Nhóm | Số hero | Chuỗi gói | CD | Ý nghĩa |
|---|---|---|---|---|
| `type 6` | 15 | 4 gói | 240 phút | Hero thường |
| `type 4+7` | 31 | 6 gói | 240 phút | Hero chủ lực (có 2 kênh trigger) |
| `type 4` chuỗi ngắn | 11 | 3 gói | **720 phút** | Hero cao cấp (Medusa, Mina, Prophet, Silanui, Nox, Hemera, Panda, Medea, Navier, Drogon, ElynSea) |

→ Bậc hiếm lộ ra qua **độ dài chuỗi gói và cooldown**, không cần bảng rarity.

## 10. Bảng rơi hộp kỹ năng `[ĐO TỪ APK]`

`skill_box_1/2/3` trong `ChapterConfig` = hộp kỹ năng rơi khi ghép 3 / 4 / 5 ô.
Định dạng `skillId_trọngSố`, chọn theo trọng số.

| Hộp | Bộ dùng cho cốt truyện (895 chương) | Bộ khác |
|---|---|---|
| Ghép 3 | `101_50 \| 102_50 \| 103_1 \| 104_5` | `1901_10\|1902_40\|1903_10\|1904_20\|1905_40\|1906_50` (579 ch), `2106_50\|2107_50` (258 ch) |
| Ghép 4 | `201_20 \| 202_40 \| 203_50 \| 204_5 \| 205_20` | `1901_15\|1902_60\|1903_20\|1904_20\|1905_30\|1906_30`, `2103_50\|2104_50\|2105_50` |
| Ghép 5 | `301_5 \| 302_15 \| 303_50 \| 304_55 \| 305_15 \| 306_30` (568 ch) | `1901_100`, `2401_5\|2402_15`, `2101_65\|2102_35` |

Đọc ra được hai điều:
- **Ghép càng nhiều ô, bảng rơi càng tốt** — hộp ghép-3 có 4 kỹ năng, hộp ghép-5 có 6 kỹ năng
  và trọng số dồn vào 2 kỹ năng mạnh (`303` w50, `304` w55).
- Kỹ năng `103` có trọng số **1/106 ≈ 0,9%** ở hộp ghép-3 — kỹ năng hiếm nhất, dùng làm
  "khoảnh khắc may mắn". Trong khi `SafetySkills = 104|204|3202` là bộ bảo hiểm khi RNG xấu.
