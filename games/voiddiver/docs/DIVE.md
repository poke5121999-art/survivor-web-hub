# DIVE — lớp lặn (một chuyến vào hầm) của Void Diver bản web (2026-09-25)

Tài liệu này ghi luật của một chuyến lặn: từ lúc nạp bản đồ tới màn kết quả. Mọi luật đều lấy từ bảng gốc (`data/tables.js`) và Lua gốc (`data/lua.js`).

Mã nằm ở:
- `js/dive.js`: máy trạng thái, dựng bản đồ, sinh vật thể, luật lặn, LuaApi, kết quả.
- `js/inventory.js`: túi đồ, khe nhanh, bảng Tab (MenuPopup gốc), lục rương hé lộ từng ô (§11).
- `js/objects.js`: hình vật thể.
- `js/minimap.js`: bản đồ nhỏ.
- `js/tutorial.js`: bảng hướng dẫn nằm trên sàn của tutorial (§10).
- `js/profile.js`: hồ sơ. Lớp sảnh (lounge) cũng dùng tệp này.

Bài kiểm là `test/voiddiver-dive.js`. Ảnh chụp nằm ở `%TEMP%/voiddiver-dive-shots/`.
Bài đi bộ hết tutorial bằng WASD là `test/voiddiver-tutorial-walk.js`, ảnh ở `%TEMP%/voiddiver-tutorial-shots/`.

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
- **`dialog.js` từng chỉ gắn phím Ctrl (tua nhanh) ở lần dựng hộp thoại đầu tiên**, nên Ctrl giữ sẵn trước hộp thoại đầu bị bỏ lỡ.
  - Đã sửa (2026-09-25): Ctrl và Esc nghe từ lúc nạp `dialog.js`.
- **Chủ bẫy (`trapOwner`) là unit giả, phải có đủ `trigQ` / `run` / `bgRuns`.**
  - `Combat.applyDamage` gọi `Skill.fire(src, 'DamageProvideSkillTrigger')`. Nếu thiếu `trigQ` thì văng `reading 'push'` và vòng lặp game chết.
- **Giữ F để nhặt đồ rơi từng mở luôn cả rương bên cạnh.**
  - Cách sửa: xong một tương tác thì phải thả F. Riêng đồ rơi vẫn được giữ F để nhặt liền nhiều món. [SUY LUẬN]
- **Bài kiểm chuyến 101 có hỗ trợ ở hai chỗ:**
  - Đánh 40 hiệp mà chưa hạ được quái thì gọi `Combat.kill`.
  - Trong lúc chờ đợt quái ở buồng thì hồi máu và giết quái đợt trong 9 m. Thứ đang kiểm là luồng buồng thoát, không phải độ khó của đợt quái.
- **Phím Tab chỉ được xử lý ở listener DOM.**
  - Trước đây vòng update cũng bật/tắt theo `input.pressed.Inventory`, nên bảng vừa đóng lại mở ra.

## 10. Tutorial 1100: hướng dẫn trên màn hình (đo lại 2026-09-25)

Chủ dự án chơi tutorial và nói: "khó hiểu, không biết làm sao cho xong, bắt chạy xa, không giống bản gốc, cần nút bỏ qua cả đoạn thoại".
Mục này ghi bản gốc hướng dẫn người chơi thế nào và bản web làm lại ra sao.

Công cụ: `tools/ui_tutorial_rip.py` → `art/ui/tutorial/` (`guides.json`, `ImgTuto01..06.webp`, `key/*.webp`). Mã: `js/tutorial.js`,
`js/dialog.js` (bỏ qua), `js/hud.js` (bảng "Hướng Dẫn [O]"), `playerInput` trong `js/stage.js` (chạy bật/tắt).
Bài kiểm: `test/voiddiver-tutorial-walk.js` (đi thật bằng WASD) và phần tutorial của `test/voiddiver-dive.js`.

### 10.1 Nguyên nhân "khó hiểu, không biết đi đâu"

- **[ĐO] Bản gốc dạy chơi bằng bảng nằm trên sàn, không bằng popup.**
  - Các bảng là con của chính prefab sector (`remote_prefab_assets_sector`):
    - `10009/StaticDecoration/TutorialGuides/{Keyboard,Gamepad}/…`
    - `10001/StaticDecoration/TutorialGuides/{Keyboard,Gamepad}/…`
    - `10004/StaticDecoration/TutorialGuide/DirectionTutorialGuide*`
  - `II_DeviceBasedObjectController` bật nhóm Keyboard hoặc Gamepad theo thiết bị. Không có MonoBehaviour nào ẩn/hiện bảng theo bước Lua, nên bảng luôn nằm đó.
  - Bản web trước đây không bóc các bảng này (công cụ sector bỏ qua Canvas), nên người chơi không có chỉ dẫn nào ngoài lời thoại.
- **[ĐO] Câu radio đầu của Elara nói đúng về các bảng này:** "Nhìn kỹ sàn nhà, bạn sẽ thấy thông tin hữu ích" (`LQ_1100_9201`, `TalkToEll_1`).
- **[ĐO] `TextMarkerSpawnDatas` không phải chữ trên sàn.**
  - Prefab `TextMarker` (`remote_prefab_assets_eventui`) được sinh dưới `TextMarkerRoot`, mà `TextMarkerRoot` nằm ở `StageScene/Canvas*/InGamePanel/MiniMapPanel!/Mask*/Viewport*/MinMap/`. Tức là chữ đó nằm trên bản đồ nhỏ.
  - Khoá chữ là `MiniMapMarker_<id>`. Chỉ 4 sector có: 4010–4013.
  - Tutorial không có TextMarker nào, nên vẫn giữ cách cũ: `minimap.label`.
- **[ĐO] `SendTutorialEvent` không nối với UI nào.**
  - C# có `TutorialEvent`, `SendTutorialStep`. Không prefab hay bảng nào nối tên sự kiện với UI.
  - [SUY LUẬN] Đây là analytics. Bản web chỉ ghi vào `VD.lua.trace`.

### 10.2 Các bảng trên sàn [ĐO — `guides.json`]

Toạ độ tính theo Unity, trong ô sector. Yaw tính bằng độ Unity (+ là quay từ +z sang +x).

| Sector | Bảng | Vị trí, yaw | Ảnh | Chữ (khoá LocalizedText) |
|---|---|---|---|---|
| 10009 | TutorialGuide_Move | (22.5, 15), 0 | ImgTuto01 (WASD + chuột) | UMoveTutorialGuide_Text "Di Chuyển + Nhìn" |
| 10009 | FHoldTutorialGuide | (22.8, 17.47), 0, ngay trước cửa kính 1004 | ImgTuto06 (F) | UFTutorialGuide_TextDoor "Giữ để Mở" |
| 10009 | AttackTutorialGuide | (14.59, 20.69), −45, scale z 1.5 | ImgTuto02 (LMB, RMB, Q) | ULmc "Đánh Thường", URmc "Kỹ Năng 1", UQ "Kỹ Năng 2" |
| 10009 | DirectionTutorialGuide | (8.5, 14), −90: mũi tên chỉ cửa sắt 2005 | ImgTuto05 | — |
| 10001 | DirectionTutorialGuide_2 | (3.5, 3.25), 0 | ImgTuto05 | — |
| 10001 | RunTutorialGuide | (5.66, 1.42), 0, đầu hành lang bẫy lửa | ImgTuto03 (Shift, Space bar) | URunTutorialGuide_TextRun "(Bật/Tắt) Chạy", …TextDash "Lướt" |
| 10001 | ItemTutorialGuide | (10.75, 22), 0, cạnh 3 rương | ImgTuto04 (Tab, F) | UItemTutorialGuide_Text "Túi đồ", UItemUseTutorialGuide_Text |
| 10001 | DirectionTutorialGuide, _1 | (13.5, 15) và (26, 3.5), 90 | ImgTuto05 | — |
| 10004 | DirectionTutorialGuide, _1 | (7.75, 6), 45 và (9.75, 14), 90 | ImgTuto05 | — |

- **[ĐO] Cấu tạo mỗi bảng.**
  - `WorldSpaceCanvas` xoay X +90°, nên nằm phẳng: trục y của canvas thành +z của bảng.
  - `RawImage` dùng material `Mtl_DE_WorldUI_Lit` (shader `LCArt/WorldUI/URP/Shader_DE_WorldUI_Lit`). Kích thước đo bằng mét: 3×1, 2×2, 1×1.
  - Chữ TMP: scale 0,01 (1 px = 1 cm), `m_fontSize` 20 tự co tới 12, màu (0,667; 0,667; 0,671), căn giữa trên. Riêng chữ "Giữ để Mở" căn trái.
- **[SUY LUẬN] Ánh sáng.** Shader tên "Lit" nên bảng ăn ánh sáng.
  - Bản web cho qua `VD.render.patchSight`: ngoài nón đèn thì tối như sàn.
  - Màu được hạ ×0,62, vì bản vá tầm nhìn nhân sáng tới ×3 trong nón và chữ trắng sẽ cháy.
- **Web:** mỗi phần tử là một quad; góc được tính qua `VD.world.sectorPoint`, nên tự đúng khi sector xoay.
  - Chữ vẽ bằng canvas 200 px/m, font Pretendard. Chỉ dựng nhóm Keyboard; nhóm Gamepad (ImgTuto0xPad) đã bóc nhưng chưa dùng.

### 10.3 Chạy là bật/tắt [ĐO + SUY LUẬN]

- **[ĐO] Chạy là công tắc.**
  - C# có `RunToggleOn`, `SetRunToggleOn`, `RxRunToggleOn`. Chữ gốc là "(Bật/Tắt) Chạy" (`URunTutorialGuide_TextRun`, `UInGameKeyGuidePanel_Run_Desc`).
  - Phím vẫn là Shift (`PlayerFunc/Run` = `<Keyboard>/shift`). InputActionAsset không có interaction Hold/Toggle, nên việc bật/tắt nằm trong mã.
- **[SUY LUẬN] Tự tắt.**
  - `Const.ToggleRunExpireDelay` = 0,15: đứng yên quá 0,15 s thì tắt chạy. Bấm Shift lúc đang đứng thì chưa tính giờ tới khi bắt đầu đi.
  - Cạn stamina thì tắt.
- Bản web trước đây bắt giữ Shift để chạy. Đoạn bẫy lửa (`CallCollision_2`: "nên chạy") vì thế khó qua.

### 10.4 Bỏ qua hội thoại

- **[ĐO] Hộp thoại gốc không có nút bỏ qua cả cuộc thoại.**
  - `DialogPopup/Keys[]` (`remote_prefab_assets_popup`) chỉ có hai nhóm:
    - [Space][F] "Tiếp theo" (`NextView`, action UI/Skip);
    - [Ctrl] "Bỏ qua nhanh" (`QuickView`, action UI/NextFlow).
  - Nút `SkipButton` duy nhất trong bundle popup nằm ở `StageResultPopup`.
- **[ĐO] Bỏ qua cả đoạn chỉ có ở cắt cảnh.**
  - `StageScene/CutsceneCanvas*/CutscenePanel`: góc trái dưới. Nền `gradient_circle_128` đen 80 %. Phím `Escape_Key` trong vòng đo `circle_38_gaugebg` / `circle_38_line_2px` (Image Filled Radial360). Chữ `CutSceneSkip` "Giữ để bỏ qua".
  - Phím: action `Cutscene/Skip` = `<Keyboard>/escape`. C# có `SkipHoldDuration`, `OnSkipStarted`, `RxSkipProgress`.
- **Web [SUY LUẬN]:** dùng lại khung CutscenePanel cho mọi hộp thoại Lua (lặn và sảnh). Giữ Esc, hoặc giữ chuột trên khung, 1 s thì tua tới `CloseDialogAsync`.
  - [CHƯA RÕ] Giá trị `SkipHoldDuration` nằm trong mã. Đang dùng 1 s.
  - Cách tua: `D.skipAll` làm mọi `AppendDialogAsync` / `DelayDialogAsync` / `WaitDelayAsync` / `OpenNoteSystemPopup` trả task xong ngay. Lua gốc vẫn `await` từng dòng theo thứ tự, nên SetStep, SpawnMonster, SetCharacterStress, SetInGameHudActive, PlayBgm, ảnh nền, fade vẫn chạy đủ.
  - Gặp lựa chọn thì dừng tua, vì không chọn thay người chơi.
  - `OpenDialogAsync` / `CloseDialogAsync` xoá cờ tua. Chờ ngoài hộp thoại (radio `WaitDelayAsync` trong CallCollision_1/4) không bị tua.
  - Prologue kết thúc bằng `ForceStartStage` mà không `CloseDialogAsync`. `app.js` tự đóng hộp thoại (`D.open = false`), nên cờ tua hết tác dụng; `OpenDialogAsync` kế tiếp xoá hẳn.

### 10.5 Bảng "Hướng Dẫn [O]" của HUD [ĐO]

- Gốc: `StageScene/Canvas*/InGamePanel/KeyGuidePanel!` (`InGameKeyGuidePanelView`).
  - Neo phải dưới, trên hàng ô đồ. Dòng `UInGameKeyGuidePanel_ControlGuide_Desc` [O] luôn hiện.
  - Nhóm `Toggle` (mặc định tắt trong prefab) liệt kê: Attack [LMB], Dash [Space], Run [LShift], MiniMap [M], Inventory [Tab], Emoji [T], Ping [Ctrl]. Bật/tắt bằng `InGame/ToggleKeyGuide` = O.
- Web: có trong `hud.js`, bấm O hoặc bấm vào dòng "Hướng Dẫn". Trạng thái mở lưu `localStorage`. Bỏ Emoji/Ping vì bản web chơi đơn.

### 10.6 Bản đồ, điểm xuất phát, quãng đường [ĐO]

- **Khớp Campaign 1100.** `FixedSectors [[0,0,10009,0],[1,0,3903,0],[0,1,10001,0],[1,1,10004,0]]`, mọi rot 0.
  - PlayerSpawn là ZonePoint của 10009 (23.16, 13.52). Elara 1 là ZoneSpawn 11002 ở cờ Custom1 (21.66, 12.52).
  - Elara 2 (11003) ở Custom3 của 10004. Điểm boss (11001) ở Custom4.
- **Cửa.**
  - 1004 `ThinFramedGlassEntrance`: đóng, không khoá. Bảng "Giữ để Mở" nằm ngay trước.
  - 2005 `SteelEntrance`: khoá bằng Key 300000, lấy trong rương 1002 cạnh va chạm 100099.
  - Hai cửa đều đúng bảng Entrance, không có cửa nào đáng lẽ phải mở sẵn.
- **CampaignTask 11001** `LuaProgress:11001` "Trốn thoát an toàn". HUD gốc `HudCampaignQuestSlot` hiện huy hiệu độ khó (EDifficulty_*) + tên campaign + dòng task, khớp HUD web.
- **Đi thật bằng WASD, seed 7:**
  - Hết tutorial với 120–150 m đi bộ, 120–170 s thời gian game (tuỳ đoạn đánh quái). Lần đo cuối: 148,9 m, 118 s, có bật chạy từ hành lang bẫy.
  - Không kẹt ở đâu. Không có đường vòng nào do cửa hoặc collider.
  - Chuỗi 12 sự kiện `tutorial:*` đúng thứ tự Lua.
- **[SUY LUẬN] "Chạy xa" đến từ không biết đi đâu, không phải từ bản đồ.**
  - Quãng BFS trên lưới đi theo thứ tự trigger là ≈155 m, dài hơn đường người chơi thật đi vì lưới 0,5 m đi zigzag.
  - Bản gốc có 8 mũi tên trên sàn chỉ đường.

## 11. Túi đồ (Tab) và lục rương (đo lại 2026-09-25)

Chủ dự án: "để ý UI/UX của túi đồ và lục rương, phải giống bản gốc". Bản cũ là một bảng DOM tự vẽ, bấm F lấy hết đồ.
Mục này ghi bản gốc làm thế nào (đo từ prefab, bảng, và mã GameAssembly) và bản web dựng lại ra sao.

Công cụ (chạy trong `tools/`, `PYTHONIOENCODING=utf-8`):
- `ui_inventory_dump.py [Prefab…]` → `%TEMP%/voiddiver-rip/ui_inventory/<Prefab>.json|.txt`: cây RectTransform (anchor, pivot, size, pos), Image (sprite, màu, material), chữ TMP (cỡ, màu, font), khoá `LocalizationText`, field MonoBehaviour. Chỉ để đọc.
- `ui_inventory_rip.py` → `art/ui/inventory/*.webp` + `sprites.json` (kích thước, border 9-slice), và `audio/sfx/` (InventoryPopupOpen, Looting_Loop, Looting_low/middle/high/veryhigh, LootingCompleted, ItemDrop, ItemRelease, ButtonClick, PopUpOpen).
- `ui_inventory_il2cpp.py` (cần `pip install capstone pefile`) → in lại GetRevealTime / GetRevealSfx / màu bậc từ mã máy.

Mã: `js/inventory.js` (mô hình + bảng + hé lộ), phần rương/nhặt đồ trong `js/dive.js` (`boxInteract`, `boxSfx`, `boxOpen`, `searchAnim`, ca `drop` của `use`), `css/dive.css` (khối "túi đồ + lục rương").
Bài kiểm: `test/voiddiver-loot.js` (24 mục, có đo nhịp hé lộ) và phần rương của `test/voiddiver-dive.js`. Ảnh ở `%TEMP%/voiddiver-loot-shots/`.

### 11.1 Bố cục gốc [ĐO — prefab `remote_prefab_assets_popup`]

- **Túi đồ trong lượt lặn là một trang của menu, không phải bảng riêng.** `MenuPopup/Contents*/Pages[]/InventoryManagementPage`.
  - Nền `MenuPopup/Background`: đen 25 % + `GrayDimmer` #262626 75 % + `gradient_horizontal_down` đen. Bấm nền để đóng.
  - `Tabs[]`: 7 thẻ 160×64 cách 10, tâm y 84 (Quest, **InventoryManagement**, Character, Archive, Squad, Option, System), icon `Menu*` #898989, phím LT/RT (Q/E trên bàn phím). Bản web chỉ mở thẻ Túi đồ.
  - `Body*`: trái `MyInventory` (PlayerInventoryPanelView), giữa `InventoryKeyGuide*` + `QuickSlotSettingPanel`, phải `LootingInventory` (chỉ bật khi đang lục rương). Tooltip `GoodsTooltip` nằm ở cột giữa, cách panel 55.
  - Khung tham chiếu 1920×1080. Bản web dựng đúng toạ độ đó rồi thu cả khung (`fit()`); màn thấp hơn 480 px dùng khung gọn 1240×700 (bỏ thẻ menu, bảng phím, ô nhiễm; ô nhanh thành cột).
- **MyInventory** (cột 530 ở x 80, đỉnh 155): `Corruption_` 530×35 ("Độ ô nhiễm Cổ vật" `cur / max`, icon Safety/Caution/Alert/Serious, màu #898989/#E7B700/#B24C00/#990000); `Top*` "Túi đồ" + `GoodsCountText` "`n`<#535353>/`max`"; `EquipmentInventoryPanel` (vũ khí, 3 phụ kiện, 2 cổ vật; ô trống hiện icon Weapon/Accessory/Artifact #666666); `Page_` (mũi tên + chấm trang, `InventoryPageSlotCount` 24); lưới 6 cột ô 80, cách 10; `SafeInventoryPanel` "Automaton (Khe an toàn)" 6 ô, mở `SafeInventorySlotBaseCount` = 1 ô.
  - 23 ô (`CharacterInventorySlotCount`) trên trang 24 ô: ô thứ 24 là ô khoá (hai đường chéo #434343).
- **LootingInventory** (580×810, neo phải −55, đỉnh 200): `Top*` "Kết quả Tìm kiếm" (khoá `LootingInventory`) + "n/30"; `Page!` 38 với vạch #535353; `Slots[]` **30 ô, lưới 6×5**, ô 80 cách 10, đệm trên 16.
- **QuickSlotSettingPanel**: "Ô Nhanh" + gợi ý `UQuickSlotSettingPanel_Top_GuideText`; 1 ô khoá (chỗ ô vũ khí phụ của HUD) rồi **5 ô** cách 12, số phím 1–5 dưới mỗi ô. HUD gốc mới (`InGameQuickSlotPanel`) cũng 5 ô; ảnh Steam cũ 6 ô.
- **InventoryKeyGuide** (lưới 2 cột 265×43). Chữ đi theo khoá LocalizedText, **không** theo chữ Hàn mặc định trong prefab (xem bẫy 11.5):

  | Phím | Khoá | Chữ (vi) | Việc |
  |---|---|---|---|
  | Chuột trái | SlotInsertOne | Bỏ vào tất cả | chuyển cả chồng sang phía bên kia (rương ↔ túi) |
  | Ctrl + trái | SlotInsertAll | Bỏ vào 1 | chuyển 1 |
  | Shift + trái | SlotInsertHalf | Bỏ vào một nửa | chuyển nửa (làm tròn lên) |
  | Chuột phải | SlotDiscardOne | Vứt bỏ tất cả | vứt cả chồng xuống đất (ItemDrop) |
  | Ctrl / Shift + phải | SlotDiscardAll / Half | Vứt bỏ 1 / nửa | |
  | R | SlotSort | Sắp xếp | |
  | N | SlotMarking | Yêu thích | dấu IconFavorite #EF7767 góc trên trái |
  | F | SlotUse | Trang bị & Tháo / Dùng | dùng Item có `CanUseFromInventory` |
  | Esc, X | UI_Close_Esc | Đóng | (Tab cũng đóng) |

  - Chuột phải ở ô rương: toast `CannotDropInLootInventory` "Bạn chỉ có thể vứt bỏ vật phẩm từ Túi đồ của mình." (có trong mã: `get_CannotDropInLootInventory`).
  - Kéo thả: `InventoryGoodsSlotPresenter._dragThreshold` = 10 px, ô kéo `DraggingGoodsSlot` 60×60. Mã có `ReqLootingSlotToInventorySlot`, `…ToSafeSlot`, `ReqInventorySlotToLootingSlot`, `ReqSafeSlotToLootingSlot`, `ReqSwapLootingSlots`, `ReqEquipLootingSlot`: đồ đi được hai chiều giữa rương, túi, khe an toàn.
  - Phím số khi rê lên đồ = gán ô nhanh (tiếng `ItemRelease`, `TryRegisterItem`).
- **Ô hàng `InventoryGoodsSlot` (80×80)** — lớp từ dưới lên: `BackLine` rectangle_line_2px #434343; `Normal*` #272727; `LevelBg` `deco_slotlevel` (nền chấm) tô màu bậc; `Artifact_` khung góc `deco_frame_artifact_01/02/03` #636363 (cổ vật); `Icon` 8–92 %; `Count_` hộp #1B1B1B cao 30 góc phải dưới, chữ 20 đậm #898989; `ItemMark` (yêu thích); `Focused!` viền 2px #BA6351 + 1px #A45646 (rê chuột); `Selected!` thêm viền trong 1px cách 4 + mũi `triangle_16`; `Unrevealed` / `Revealing_`; `Highlight` (glow DOTween Fade 0,6 yoyo 1 s); `LineFX` (LineConfirm 0,33 s khi ô nhận hàng).
- **Tooltip `ItemTooltip`** rộng 540, lề 50/50/50/30, khung material `Mtl_DE_UI_DefaultFrame` (shader khói + chấm nhiễu, grabpass; `_SmokeColor` 0,1, `_DitheringColor` 0,245, viền 2px #434343). `Title_` #272727 cao 60: `GradeText` 18 thường màu bậc nằm trên mép trên, `Name` 28 đậm #DCDCDC, `TypeIcon` 30 #707070 bên phải. Rồi mô tả 18 #898989, các dòng caption 16 #707070 / giá trị 20 đậm #DCDCDC ngăn bằng vạch 2px #313131: "Giá Trị" (icon Gold), "SL Trong Túi" `n / InventoryCountMax`. Bản web thêm dòng Độ bền và chỉ số `Stats` cho Equipment (EquipmentTooltip gốc dài hơn nhiều, chưa dựng hết).
- **Chữ:** Pretendard Bold/Regular (font gốc). Màu chính #DCDCDC, phụ #898989, mờ #707070 / #535353.

### 11.2 Lục rương là hé lộ từng ô [ĐO — mã GameAssembly]

- **Luồng:** giữ F `RewardBox.HoldingTime` (0,1 s; tiếng `_holdingSfx` của prefab, nhân vật chơi `battle/search` — `GetInteractionAnimation`) → mở MenuPopup trang túi đồ kèm LootingInventory (tiếng `InventoryPopupOpen`) → ô chứa đồ ban đầu **chưa hé lộ** → lần lượt từng ô:
  - `LootingInventory.TryReveal(mult)` (De.InGame): lấy ô **đầu tiên chưa hé lộ và không rỗng**, hẹn giờ `GetRevealTime(grade) × mult`, hết giờ thì hé lộ và gọi lại TryReveal. Ô rỗng bỏ qua.
  - `EnumExtensions.GetRevealTime(EGoodsGradeType)` (De.Base, switch 7 nhánh): **None/Normal 0,8 s; Rare 1,1; Elite 2,2; Epic 3,1; Legend/Unique 4,0**.
  - `GetRevealDelayMultiplier` = `max(0, 1 − Σ LootingSpeedAmplifier.Percent / 100)` theo buff của người lục (Buff 40122 −15, 41020 +12, 42119 −30, 65003007 +15 — nghịch lý / talent). Bản web đọc `u.buffs.sum('LootingSpeedAmplifier', 'Percent')`.
  - Ô đang hé lộ (`InventoryGoodsSlotView.UpdateLayout`): `RevealingAnimator.SetTrigger("StartTrigger")` + `PlaySfx("Looting_Loop")`. Xong (`OnGoodsSlotChanged`): `StopSound` vòng lặp, `PlaySfx(GetRevealSfx(grade))`, trigger `EndTrigger`.
  - `GetRevealSfx`: **None/Normal Looting_low; Rare Looting_middle; Elite/Epic Looting_high; Legend/Unique Looting_veryhigh**.
  - Ô chưa hé lộ không lấy / kéo được (goods trả null).
  - `StartLooting` / `EndLooting` gắn với người đang mở bảng (`_activeLooters`): đóng bảng thì bộ hẹn giờ bị huỷ; mở lại thì TryReveal lấy lại ô chưa xong từ đầu. Ô đã hé lộ giữ nguyên (kho rương sống trên thực thể: `e.lootInv`).
- **Hình ô** (AnimationClip gốc, giải từ `m_StreamedClip`):
  - `Unrevealed`: nền #272727, `ImgItemSlotEmpty` (hình thoi lồng ô vuông) #464646 50 % lùi 3 px, `Eye3` (mí mắt nhắm 62×16) #464646 50 % dưới tâm 6,5.
  - `SlotRevealingLoop` 2 s lặp: thêm `Eye1` (mắt mở 66×36) + `Eye2` (con ngươi 24×24) #898989 scale 0,9; con ngươi chạy x 0 → −6 (0,5 s) → +6 (1,5 s) → 0 (2 s). Nền #272727 75,7 %.
  - `SlotRevealingEnd` 0,5 s: mắt và ngươi chớp (alpha 0,1 ở 0,017–0,117 s), mắt dãn dọc 0,9 → 1,127 → 1,294 và tan ở 0,333 s; hoa văn tan ở 0,25 s; nền 75,7 % → 22,4 % rồi tắt ở 0,483 s.
- **Màu bậc** (`EnumExtensions.ToColor`, Color32 dựng trong `.cctor`): **Normal #898989, Rare #2E9B8F, Elite #3E7FE0, Epic #C141CC, Legend #FF8F2B, Unique #FFF691**.
  - Ô hàng: `SetItemFrameColor` tô `LevelBg` bằng màu bậc, giữ alpha 0,376 của prefab, và chỉ bật khi bậc > Normal. Tooltip: chữ bậc.
- **[SUY LUẬN] Thứ tự enum `EGoodsGradeType`** None=0 … Unique=6 lấy theo thứ tự cột `*Weight` của DropReward.csv; khớp với nhóm tiếng (Elite+Epic cùng "high", Legend+Unique cùng "veryhigh").
- **Tiếng giữ F / xong:**
  - `RewardBox._holdingSfx` / `_lockedHoldingSfx` / `_interactionSfx` của prefab (BrownBox → InteractionLooting_PaperBox2, SafeBox → Vault2, ToolBox → Toolbox, SealedJewelryBox → Vault, CursedBox, VendingMachine…).
  - [SUY LUẬN] `_interactionSfx` rỗng (mọi rương, cả DropGoods) thì dùng nhóm MasterAudio `LootingCompleted` (hằng `LOOTING_COMPLETED` trong lớp hằng tiếng; giá trị hằng đọc từ fieldDefaultValues). Web phát `LootingCompleted` khi giữ F xong ở rương và khi nhặt đồ rơi (trước đây gọi `ItemPickUp` — clip không tồn tại).
  - `ItemDrop` = `DropInventoryGoods` / `DropSafeGoods`; `ItemRelease` = gán/bỏ ô nhanh.

### 11.3 Bản web làm khác / còn thiếu

- **[SUY LUẬN] "Sắp xếp" (R):** gộp chồng cùng Item, xếp yêu thích trước, rồi bậc giảm dần, loại, id. Chưa đo thứ tự của mã gốc.
- **[SUY LUẬN] Bấm trái lên ô túi khi không lục rương = chọn ô (Selected!).** Chưa làm thanh công cụ cho tay cầm.
- **[CHƯA RÕ] `DropGoods._holdingTime` = 0,25** trong prefab, còn luật nhặt đang dùng `Const.LootingInteractionTime` = 0,1. Chưa biết bên nào thắng.
- **Chưa làm:** trang thẻ khác của MenuPopup (Quest, Character…), tooltip Equipment đầy đủ (hiệu ứng, bộ), `BagPanel` (túi phụ hiện ngay trong lưới, trang sau), `Highlight` glow, thao tác tay cầm, `OpenInventoryBag`.
- **Rương MedicalBox / Briefcase / HiddenStash:** `art/object/<Prefab>.json` là bản `MimicObject` (không có `_holdingSfx`). Web lấy clip `InteractionLooting_<Prefab>` nếu có, không thì `InteractionLooting_Default`. [SUY LUẬN] Cần sửa `rip_objects.py` để lấy đúng biến thể RewardBox.

### 11.4 Kiểm trên trang thật (1280×720, 844×390)

- `node test/voiddiver-loot.js`: đo nhịp giữa `Looting_Loop` và tiếng hé lộ trên giờ game: Rare 1,08, Elite 2,20, Epic 3,10, Legend 4,00 s, tiếng đúng bậc; đóng giữa chừng thì ô đang hé lộ về chưa hé lộ; Shift/Ctrl + trái; kéo thả; chuột phải; phím số; R; Esc; 844×390 mọi khối trong màn, ô ≥ 40 px.

### 11.5 Bẫy đã sập

- **Chữ phím trong prefab Hàn ngược với bản dịch.** Prefab: `1개 넣기` (thêm 1) ở chuột trái, nhưng khoá `SlotInsertOne` trong LocalizedText (en "Add All", vi "Bỏ vào tất cả") và `SlotInsertAll` ("Insert 1"). Làm theo chữ đã dịch (bản phát hành), không theo chữ mặc định của prefab.
- **`dive.js sfx()` bỏ im lặng clip không có trong `VD.ASSETS.sfx`.** Clip mới bóc bằng `ui_inventory_rip.py` chưa vào `data/assets.js` tới khi chạy lại `build_assets.py`; `audio.js` vẫn tìm được theo đường `audio/sfx/<tên>.mp3`, nên các chỗ mới gọi thẳng `VD.audio.sfx`.
- **`url()` trong biến CSS đặt ở `style=""` được giải theo tệp CSS dùng `var()`, không theo trang.** `--m:url(art/…)` trong HTML thành `css/art/…` → 404. Phải viết `url(../art/…)`.
- **Swiftshader chụp một ảnh mất vài giây giờ game.** Bài kiểm chờ "ô 2 đang hé lộ" sau khi chụp thì ô 2 đã xong từ lâu → treo. Chờ "một ô giữa đang hé lộ" thay vì cố định ô.
- **Đồ vừa vứt nằm dưới chân gần hơn rương.** Giữ F sau khi vứt sẽ nhặt lại đồ, không mở rương (đúng luật gần nhất); bài kiểm phải đứng sang phía kia rương.
- **global-metadata.dat v39 (Unity 6):** Il2CppDumper 6.7 không đọc được. Tự đọc: header là bộ ba (offset, size, count); method 32 byte; image 36 byte; `Il2CppCodeGenModule` tìm qua con trỏ tới chuỗi tên dll; literal chuỗi là `0xA0000000 | (idx << 1) | 1`. Xem `tools/ui_inventory_il2cpp.py`.
