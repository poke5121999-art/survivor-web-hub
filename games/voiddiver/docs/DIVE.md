# DIVE — lớp lặn (một chuyến vào hầm) của Void Diver bản web (2026-09-25)

Tài liệu này ghi luật của một chuyến lặn: từ lúc nạp bản đồ tới màn kết quả. Mọi luật đều lấy từ bảng gốc (`data/tables.js`) và Lua gốc (`data/lua.js`).

Mã nằm ở:
- `js/dive.js`: máy trạng thái, dựng bản đồ, sinh vật thể, luật lặn, LuaApi, kết quả.
- `js/inventory.js`: túi đồ, khe nhanh, bảng Tab.
- `js/objects.js`: hình vật thể.
- `js/minimap.js`: bản đồ nhỏ.
- `js/profile.js`: hồ sơ. Lớp sảnh (lounge) cũng dùng tệp này.

Bài kiểm là `test/voiddiver-dive.js`. Ảnh chụp nằm ở `%TEMP%/voiddiver-dive-shots/`.

Nhãn:
- **[ĐO]**: có dữ liệu hoặc mã gốc chứng minh, kèm id/số.
- **[SUY LUẬN]**: đoán từ tên cột hoặc từ cách dữ liệu được dùng. Có ghi lý do.
- **[CHƯA RÕ]**: không đủ dữ liệu. Có ghi giá trị đang dùng.

---

## 1. Vòng đời

```
VD.dive.start({campaignId, characterId, loadout, difficulty, seed, inventory}) → Promise<result>
loading → intro → play → (escaping | dead) → result
VD.dive.onFinish(fn)   // fn(result) sau khi người chơi đóng màn kết quả
```

- **URL chạy thẳng:** `index.html?campaign=101&char=100001&diff=Normal&seed=11`.
- **Không có tham số:** hiện menu chọn chuyến, nhân vật và độ khó.
- **Sandbox cũ:** `?sandbox=1`.
- **`result`** gồm:
  - `escaped`, `forced`;
  - `exp {monster, box, escape, base, percent, total}`;
  - `loot` (đồ mang về), `lost` và `lostStored` (đồ thất lạc);
  - `tasks`, `cleared`, `stats` (số quái giết, rương mở, quái bóng).

## 2. Dựng bản đồ (Campaign.csv)

- **[ĐO] Ô cố định.** `MapSize [w,h]` và `FixedSectors [[x,y,id,rot]]` cho các ô cố định; `id = 0` là ô trống.
  - Chuyến 101 có 6×6 ô. Chỉ ô (4,4) cố định là 4011.
- **[ĐO] Ô trống được lấp theo hai bước:**
  1. `RandomPlacedSectorIds` (101: 4010, 4012, 4013) được đặt vào các ô trống, chọn ngẫu nhiên theo seed.
  2. Các ô còn trống lấy sector `Playable` cùng `ThemeType` (101: Country).
- **[SUY LUẬN] Luật viền.**
  - Khi bản đồ có ô ngẫu nhiên, thêm một hàng sector `Boundary=Bottom` ở cy = 0 và một hàng `Top` ở cy = h+1. Lưới thật dời lên một hàng.
  - Lý do: Sector.csv có loại Boundary Top/Bottom nhưng không có Left/Right. Các sector Playable có tường ở hai mép trái/phải nhưng hở ở trên/dưới.
  - Tutorial 1100 có đủ ô cố định nên không thêm viền.
- **[ĐO] Kích thước ô.** Mỗi ô 30×30 m. Ô (cx, cy) nằm ở x = 30·cx, z = −30·cy (three.js có z = −z của Unity).
- **[ĐO] Vùng cấm.**
  - `BoundarySpecialFieldId 3001` là BoxFogField, mang buff 3102 "Khu vực cấm".
  - Ra ngoài hình chữ nhật chơi được thì bị gắn buff đó, và buff được làm mới mỗi khung hình.

## 3. Sinh vật thể theo dòng Sector

Mỗi dòng Sector có các danh sách vị trí theo toạ độ Unity trong ô: MonsterSpawn, RewardBox, Trap, Entrance, BreakableProp, DisposableProp, SpecialField, NPC, ZonePoint, CollisionTrigger, TextMarker.

- **[ĐO] Số lượng.**
  - Có `SpawnAll` thì sinh hết.
  - Nếu không, lấy `SpawnCount` rồi nhân với phần trăm của Difficulty (`MonsterSpawnPercent`, `RewardBoxSpawnPercent`, …). Phần lẻ được dùng làm xác suất sinh thêm một cái.
- **[SUY LUẬN] Quái sinh lười.** Quái chỉ được tạo khi người chơi tới gần trong vòng 42 m; trước đó nằm trong danh sách `dormant`.
  - Lý do: đỡ tốn CPU. Luật gốc không bị ảnh hưởng vì tầm nhìn quái tối đa ~12 m.
- **[ĐO] ZoneSpawn.**
  - Mỗi ZoneSpawn chọn một ZonePoint thoả `RequiredZoneFlags`, không dính `ExcludedZoneFlags`, và giữ khoảng cách `SpawnDistanceDatas`.
  - Loại `$type` được xử lý: ZoneExit, ZoneInteractiveTrigger, ZoneNpc, ZoneCustomMarker.
  - `ZoneSkillExecutor` (3001–3005) thiếu bảng, xem §8.
- **[ĐO] Bán kính tương tác** lấy từ collider trigger ở gốc prefab (`art/object/<Prefab>.json`).
- **[ĐO] Thời gian giữ phím F** (Const):

  | Hành động | Thời gian |
  |---|---|
  | Mở rương (`RewardBox.HoldingTime`) | 0.1 |
  | Mở cửa (`EntranceOpenTime`) | 0.4 |
  | Đóng cửa (`EntranceCloseTime`) | 0.2 |
  | Gọi buồng (`ExitActivateInteractionTime`) | 2 |
  | Thoát ở WaveExit (`ExitInteractionTime`) | 7 |
  | Thoát ở SafeExit (`SafeExitInteractionTime`) | 3 |
  | Nhặt đồ (`LootingInteractionTime`) | 0.1 |

- **[ĐO] Trigger.** Trigger đọc `_canTriggered`, `_coolTime` và `_holdingTime` từ component InteractiveTrigger của prefab. `rip_objects.py` ghi các giá trị này vào `fields`.
  - Ví dụ `InteractiveTrigger_inv`: `_canTriggered 0`, hold 0.5.
- **[ĐO] Cửa.**
  - Cửa có khoá cần khoá theo `Entrance.KeyTypes/KeyIds`.
  - Cửa đóng là vật chắn 2.27×0.25 m, lấy theo collider của prefab.
- **[SUY LUẬN] Bẫy.**
  - Bẫy có `DestroyAfterAction` nổ khi có người bước vào trong 1 m. Các bẫy khác bắn theo chu kỳ `CoolTime`.
  - Bẫy chỉ chạy khi người chơi ở trong 24 m.
  - Sát thương = `HitBoxAtk × Difficulty.TrapAtkPercent × VariantDifficulty.TrapAtkPercent`.

## 4. Lối thoát

- **[ĐO] WaveExit** đi qua bốn trạng thái:
  - **Chờ:** trạm Elara (Spine `NPC_Campaign`). Giữ F 2 s để gọi buồng.
  - **Đang gọi:** chạy các đợt quái của `Wave.csv` trong 15 s (`ExitActivatingTime`). Vùng SpecialField 4001 có bán kính `ExitSpecialFieldRange` = 5.
  - **Buồng đã tới:** buồng điện thoại (Spine `World_PhoneBooth`) ở lại 30 s (`ExitActivatedTime`). Giữ F 7 s để thoát.
  - **Hết:** hết 30 s mà không vào thì buồng rời đi.
- **[ĐO] SafeExit.**
  - Mở sẵn từ đầu, giữ F 3 s để thoát.
  - Tốn `ExitCost` (Item 10001) theo `Campaign.RecommendedLevel` [SUY LUẬN: cột Level của ExitCost ứng với RecommendedLevel].

## 5. Luật trong chuyến lặn (mỗi khung hình, `rulesTick`)

- **[ĐO] Đèn.**
  - Cứ `LightFuelInterval` = 5 s thì trừ `LightFuelTickDamage` = 1. Tối đa `LightFuelMax` = 100.
  - Passive 10000000 gắn buff 6101 (mù) ngay khi khởi tạo. Còn đèn thì bỏ 6101; hết đèn thì gắn lại.
  - Khi mù, tầm nhìn là `BlindSightRange` = 1 m (`setSight`).
- **[ĐO] Căng thẳng.** Mốc lấy theo `StressMax` của Stress.csv, là cận trên.

  | Trạng thái | Mức căng thẳng | Debuff | Debuff định kỳ |
  |---|---|---|---|
  | Alert | ≤ 49 | 7002 | — |
  | Fear | ≤ 99 | 7003 | 2001002, mỗi 180 s (sau 10 s) |
  | Despair | = 100 | 7004 + 7005 | 2001002, mỗi 40 s (sau 8 s) |

- **[ĐO] Căng thẳng tự nhiên.**
  - Cứ 18–24 s thì cộng 1–2 × `Sector.StressIntervalPercent`/100.
  - Mọi sector đang có đều mang giá trị 0, nên thực tế không cộng gì.
- **[ĐO] Căng thẳng khi mất máu.**
  - Mất mỗi `StressDamageTriggerHpPercent` = 30 % máu thì cộng `StressDamageOnHpDamaged` = 3.
  - [SUY LUẬN] Tính theo mỗi 30 % máu tối đa bị mất, cộng dồn.
- **[ĐO] Quái bóng tối.** Dòng `ShadowMonsterSpawn` được chọn theo (Difficulty, StressState).
  - Mỗi `ShadowSpawnInterval` thì tung `ShadowSpawnPercent` %.
  - Nếu trúng: sinh `Min..Max` con, cách nhau 1.5 s, trong vòng 3.5 m quanh người chơi, rồi lao vào đánh ngay.
- **[ĐO] Ô nhiễm.**
  - Ô nhiễm = Σ `Equipment.Corruption` của cổ vật mang theo − chỉ số `CorruptionMax`.
  - Mốc Corruption.csv: Caution ≥ 1, Alert ≥ 31, Serious ≥ 76. Mỗi mốc gắn debuff 7101/7102/7103 và cộng 1 căng thẳng mỗi 9/4/2 s.
- **[ĐO] Rơi đồ (`DropReward`).**
  - Mỗi lượt chọn theo `NormalBp` / `ArtifactBp`.
  - `PickGradeBeforeProbability`: nhân trọng số bậc với `Difficulty.*ItemPickPercent`, trừ khi có `IgnoreDifficulty`.
  - Vũ khí đúng loại của nhân vật được +300 % trọng số (`CharacterWeaponTypeDropWeightBonusPercent`).
  - Cổ vật đi qua `DropRewardArtifactProbability`.
  - [SUY LUẬN] Đồ loại Quest chỉ rơi khi có CampaignTask cần nó.
- **[ĐO] EXP.**
  - Quái thường 8+2, boss 250+30, rương 15, thoát 650 (`HasEscapeExpReward`).
  - Tổng nhân `Difficulty.UserExpPercent × VariantDifficulty.UserExpPercent`.
  - Tutorial 1100 ra đúng 665 EXP.
- **[ĐO] Chết.**
  - Mất mọi đồ, trừ khe an toàn.
  - Tối đa `LostGoodsStorageDefaultSlotCount` = 7 món vào kho "đồ thất lạc", chọn theo trọng số `LostGoodsGrade*` × `LostGoods{Artifact|Equipment|Consumable|Bag}WeightMultiplier`.
  - Giá chuộc = Worth × 0.3–1.5 (cổ vật 0.5–2). Món đồ được giữ qua 3 lần thoát.
- **[ĐO] Nhiệm vụ.**
  - CampaignTask hiện qua `VD.hud.setQuest`.
  - Chuyến 101 có TeamTotalWorth ≥ 10000, tính bằng tổng `Worth` trong túi.
- **[ĐO] Hoàn thành chuyến.**
  - Chuyến thường: thoát được và xong mọi task.
  - Tutorial: thoát được và `step ≥ 10`.
- **[SUY LUẬN] Nhạc nền.**
  - Chạy `Sector.Bgm`. Có quái đang đánh người chơi thì đổi sang `CombatBgm` hoặc `BossBgm` (theo `BgmPriority`).
  - Hết giao chiến 4 s thì về nhạc êm.
  - Lua `PlayBgm` / `StopBgm` được ưu tiên hơn cả.

## 6. Lua

- **[ĐO] Gửi OnEvent.** `OnEvent(type, value)` được gửi tới `Campaign/<id>` và mọi `LoungeQuest/<id>` đang làm (trạng thái 2).
  - Loại sự kiện: MonsterKill, InteractiveTrigger, CollisionTrigger, TalkNpc, ItemAcquire, WaveEnd, ….
  - `OnStage()` được gọi một lần khi vào `play`.
- **[ĐO] `SetStep(n)`** gọi `Step_%05d`.
  - Các lời gọi LuaApi phát ra từ bên trong Lua được xếp hàng (`luaQueue`) và chạy ở khung hình kế tiếp, để tránh gọi lồng.
- **[SUY LUẬN] Cắt cảnh (`PlayCutscene`).** Không có dữ liệu Timeline, nên đang giả lập như sau:
  - Camera đi tới điểm cắt cảnh; hiện viền đen; khoá điều khiển; gắn `CutsceneStateBuffId`.
  - Phát signal ở 1.2 s, kết thúc ở 3 s.
  - Trong lúc cắt cảnh, tầm nhìn là vòng 6 m, 360°, quanh điểm cắt cảnh.
- **Tutorial 1100** chạy hết 12 bước. Chuỗi tới `ForceEscapeStage` được kiểm bằng `VD.lua.trace`.

## 7. Hình vật thể (`tools/rip_objects.py`)

- **Đầu ra:**
  - `art/object/<Prefab>.glb` (gltfpack) và `.json`. Tệp json chứa nhóm sprite, collider, Spine, đèn, hạt, animator, và behaviour kèm field cơ bản.
  - `data/objects.js` (`VD.OBJECTS`).
  - Hiện có 75 prefab, 2 Spine (`World_PhoneBooth`, `NPC_Campaign`) và 40 ảnh minimap.
- **[SUY LUẬN] Nhóm Front/Back.** Nhóm được chọn theo hướng prefab so với camera. Khi cần lật thì dùng ma trận đổi x↔z. Cửa bật/tắt nhóm Open/Close.
- **[SUY LUẬN] Đồ rơi** hiện thành icon gốc (quad 0.6 m) có bóng tròn.
  - Hiệu ứng lấp lánh `DropItemFX_*` chưa được xuất.

## 8. Còn thiếu hoặc đang tạm

- **[CHƯA RÕ] Skill của vật phẩm dùng được.** Skill 50002xxx/50003xxx không có trong `VD.T.Skill`, nên thuốc/đèn không dùng được; bấm vào chỉ hiện thông báo.
- **[CHƯA RÕ] Thánh địa (ZoneSkillExecutor).** Không có bảng `SkillExecutor.csv`, nên thánh địa ZoneSpawn 3001–3005 bị bỏ qua.
- **[CHƯA RÕ] Không có luật quá tải.**
  - Buff 10001/10002 (quá tải) không có, kể cả trong bản tham chiếu.
  - Bảng Item không có cột cân nặng.
- **[CHƯA RÕ] Quái tuần tra** (`PatrolMonsterId/Count`) chưa được sinh.
- **[CHƯA RÕ] Các phần khác chưa có:**
  - `AnomalyGroupSpawnId` của quái bóng tối bị bỏ qua.
  - Prefab `SampleBox` không tìm thấy.
  - Chưa có VFX của bẫy lửa, lấp lánh đồ rơi và vòng SphereFieldExit.
  - `VD.ASSETS.units` chưa có Spine NPC.
- **[SUY LUẬN] Điểm xuất phát.** Nếu không có ZonePoint `PlayerSpawn`, người chơi bắt đầu ở ZonePoint `Outside` xa lối thoát nhất.
- **[SUY LUẬN] Chìa khoá** bị tiêu hao khi mở cửa.

## 9. Bẫy đã sập (ghi lại để khỏi sập lại)

- **Sector JSON không có `navVolumes`, nên người chơi đi xuyên tường.**
  - `world.js` đã được sửa để lấy collider cao / non-trigger làm vật chắn khi thiếu navVolumes.
- **`world.js` dùng CRLF.** Muốn vá bằng node thì đổi sang LF, sửa, rồi đổi lại CRLF.
- **`dialog.js` chỉ gắn phím Ctrl (tua nhanh) ở lần dựng hộp thoại đầu tiên.** Bài kiểm phải nhấn lại Ctrl sau khi hộp thoại đầu hiện ra.
- **Chủ bẫy (`trapOwner`) là unit giả, phải có đủ `trigQ` / `run` / `bgRuns`.**
  - `Combat.applyDamage` gọi `Skill.fire(src, 'DamageProvideSkillTrigger')`. Nếu thiếu `trigQ` thì văng `reading 'push'` và vòng lặp game chết.
- **Giữ F để nhặt đồ rơi từng mở luôn cả rương bên cạnh.**
  - Cách sửa: xong một tương tác thì phải thả F. Riêng đồ rơi vẫn được giữ F để nhặt liền nhiều món. [SUY LUẬN]
- **Bài kiểm chuyến 101 có hỗ trợ ở hai chỗ:**
  - Đánh 40 hiệp mà chưa hạ được quái thì gọi `Combat.kill`.
  - Trong lúc chờ đợt quái ở buồng thì hồi máu và giết quái đợt trong 9 m. Thứ đang kiểm là luồng buồng thoát, không phải độ khó của đợt quái.
- **Phím Tab chỉ được xử lý ở listener DOM.**
  - Trước đây vòng update cũng bật/tắt theo `input.pressed.Inventory`, nên bảng vừa đóng lại mở ra.
