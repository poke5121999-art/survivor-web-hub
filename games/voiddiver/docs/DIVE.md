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
  - Đồ của quái bốc lúc sinh và nằm trong xác, không văng ra đất (§13).
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

Công cụ: `tools/ui_tutorial_rip.py` → `art/ui/tutorial/` (`guides.json`, `ImgTuto01..06[Pad].webp`, `key/*.webp`, `pad/*.webp`),
`tools/il2cpp_method.py` (đọc mã gốc, §10.10). Mã: `js/tutorial.js`, `js/dialog.js` (bỏ qua), `js/hud.js` (bảng "Hướng Dẫn [O]"),
`playerInput` trong `js/stage.js` (chạy bật/tắt, ngắm tay cầm), `js/core.js` (tay cầm, đổi thiết bị, ảnh phím).
Bài kiểm: `test/voiddiver-tutorial-walk.js` (đi thật bằng WASD), phần tutorial của `test/voiddiver-dive.js`,
`test/voiddiver-gamepad.js` (tay cầm giả, ảnh ở `%TEMP%/voiddiver-gamepad-shots/`).

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
- **[ĐO] `SendTutorialEvent` chỉ là analytics.** Đọc mã (`il2cpp_method.py LuaApi.SendTutorialEvent`, @0x1807ef7d0):
  - Thân hàm: `_eventSystem.Trigger(new TutorialEvent(eventName))` (GameEventSystem.Trigger).
  - Chỗ duy nhất đọc `TypeInfo(TutorialEvent)` ngoài LuaApi là `AnalyticsController.OnEventOccured` (`--usage TutorialEvent`):
    ghi log `'tutorialEvent:' + tên` và gửi GameAnalytics khi `EnvironmentSettings.UseGameAnalytics`.
  - `TutorialEvent.CalculateProgress(cond, cur, goal)` trả thẳng `goal` (dùng cho EventCondition của quest/thành tựu). Không bảng
    nào của bản demo có điều kiện kiểu TutorialEvent.
  - Không có UI nào nghe. Bản web chỉ ghi vào `VD.lua.trace`.

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
  - Chữ vẽ bằng canvas 200 px/m, font Pretendard.
- **Nhóm Gamepad** (`guides.json` `sectors.<id>.gamepad`): `MoveTutorialGuidePad` (ImgTuto01Pad: cần L + R), `AttackTutorialGuidePad`
  (ImgTuto02Pad: Y, X, RB), `FHoldTutorialGuidePad` (ImgTuto06Pad: A), `RunTutorialGuidePad` (ImgTuto03Pad: bấm cần L, B),
  `ItemTutorialGuidePad` (ImgTuto04Pad: Menu, D-pad). Mũi tên ImgTuto05 dùng chung. Web dựng cả hai nhóm và chỉ hiện nhóm của
  thiết bị đang dùng (`VD.tutorial.setDevice`, nghe `vd-device`), như `II_DeviceBasedObjectController`.

### 10.3 Chạy là bật/tắt [ĐO — mã GameAssembly]

- **Là tuỳ chọn, mặc định bật.** `RunToggleOn` là trường của `GamePlaySettingContextData` (tuỳ chọn Gameplay).
  `GamePlaySettingService.CreateDefault` (@0x1801cbbb0) ghi `word [+0x30] = 1` → RunToggleOn = true (AimSupportOn = AutoAttackOn = true,
  RstickAttackOn = LockMouseOn = AimLineOn = false, PadSensitivity = 40).
- **Bấm Run** (`PlayerInputController.OnRunStart`, @0x1807341a0): bật tuỳ chọn thì gửi `ReqInputRun.Run = !CharacterModel.TryRun`
  (bấm lần nữa là tắt); tắt tuỳ chọn thì gửi `Run = true` khi nhấn và `OnRunEnd` gửi `Run = false` khi thả (giữ để chạy).
- **Host nhận** (`CharacterController.OnInputRun`, @0x18061c1a0): `Run = true` chỉ bật khi `Stamina ≥ RunStaminaCost × deltaTime`,
  đặt hạn `model[+0x324] = TimeNow + Const.ToggleRunExpireDelay` rồi `TryRun = true`. `Run = false` → `TryRun = false`.
- **Tự tắt** (`CharacterController.UpdateRun` @0x1806347b0, chép lại trong `FixedUpdate`): đang TryRun mà trạng thái là Skill (3),
  CrowdControlled (7) hay Interact (9) thì dời hạn; trạng thái khác (Idle, …) mà `TimeNow > hạn` thì `TryRun = false`.
  - Đang đi (`CharacterMoveState.OnUpdate`): thiếu stamina (`< cost × dt`) thì tắt; đủ thì trừ stamina (StaminaDamageEvent) và dời hạn.
  - Rời trạng thái đi (`CharacterMoveState.OnExit`) cũng dời hạn một lần.
  - Tức là đứng yên quá 0,15 s là tắt, **kể cả bấm Shift lúc đang đứng** (bản web cũ đoán ngược: chờ tới khi đi mới tính giờ).
  - `Const.csv`: `ToggleRunExpireDelay 0.15` "thời gian công tắc chạy còn giữ sau khi ngừng di chuyển".
- **Cạn stamina** (`CharacterController.OnStaminaChanged` @0x180625660): stamina mới `≤ RunStaminaCost × fixedDeltaTime` thì `TryRun = false`
  và gửi `NtfUnitMonologueText` với `TLocalizedText.TooTiredToRun` ("Tôi kiệt sức rồi… Tôi không thể chạy thêm nữa…").
  - Web: bong bóng thoại trên đầu nhân vật (`hud.bubbleAt`), chỉ khi stamina vừa rơi qua ngưỡng. [SUY LUẬN: bản gốc gọi mỗi lần
    stamina đổi mà còn dưới ngưỡng; giao diện monologue gốc chưa đọc xem có lọc trùng không]
- Web chưa có trang tuỳ chọn, nên `VD.stage.runToggleOn = true` (mặc định gốc). Phím: Shift, tay cầm bấm cần trái.

### 10.4 Bỏ qua hội thoại

- **[ĐO] Hộp thoại gốc không có nút bỏ qua cả cuộc thoại.**
  - `DialogPopup/Keys[]` (`remote_prefab_assets_popup`) chỉ có hai nhóm:
    - [Space][F] "Tiếp theo" (`NextView`, action UI/Skip);
    - [Ctrl] "Bỏ qua nhanh" (`QuickView`, action UI/NextFlow).
  - Nút `SkipButton` duy nhất trong bundle popup nằm ở `StageResultPopup`.
- **[ĐO] Bỏ qua cả đoạn chỉ có ở cắt cảnh.**
  - `StageScene/CutsceneCanvas*/CutscenePanel`: góc trái dưới. Nền `gradient_circle_128` đen 80 %. Phím `Escape_Key` trong vòng đo `circle_38_gaugebg` / `circle_38_line_2px` (Image Filled Radial360). Chữ `CutSceneSkip` "Giữ để bỏ qua".
  - Phím: action `Cutscene/Skip` = `<Keyboard>/escape`. C# có `SkipHoldDuration`, `OnSkipStarted`, `RxSkipProgress`.
- **[ĐO] Giữ 1,0 s.** `GameCutsceneManager.SkipHoldDuration` là const float = 1.0 (`il2cpp_method.py --fields GameCutsceneManager`).
  `OnSkipStarted` (@0x18072ab90): ghi `startTime = Time.time`, rồi `Observable.EveryUpdate().Select(_ => clamp01(Time.time − startTime))`
  `.TakeWhile(p < 1.0)` → `RxSkipProgress`; xong thì `RxSkipProgress = 1` và `CutsceneTimelineObject.StopTimeline`. Thả sớm → `OnSkipCanceled`.
- **[ĐO] Ảnh phím của khung.** `KeyPrompt*` của CutscenePanel là `II_ImagePrompt` action `Ui/Escape` (Esc / X / B), không phải `Cutscene/Skip`.
  Bàn phím hiện Esc, tay cầm hiện B.
- **Web [SUY LUẬN]:** dùng lại khung CutscenePanel cho mọi hộp thoại Lua (lặn và sảnh). Giữ Esc (tay cầm: giữ B), hoặc giữ chuột trên
  khung, 1 s thì tua tới `CloseDialogAsync`.
  - Cách tua: `D.skipAll` làm mọi `AppendDialogAsync` / `DelayDialogAsync` / `WaitDelayAsync` / `OpenNoteSystemPopup` trả task xong ngay. Lua gốc vẫn `await` từng dòng theo thứ tự, nên SetStep, SpawnMonster, SetCharacterStress, SetInGameHudActive, PlayBgm, ảnh nền, fade vẫn chạy đủ.
  - Gặp lựa chọn thì dừng tua, vì không chọn thay người chơi.
  - `OpenDialogAsync` / `CloseDialogAsync` xoá cờ tua. Chờ ngoài hộp thoại (radio `WaitDelayAsync` trong CallCollision_1/4) không bị tua.
  - Prologue kết thúc bằng `ForceStartStage` mà không `CloseDialogAsync`. `app.js` tự đóng hộp thoại (`D.open = false`), nên cờ tua hết tác dụng; `OpenDialogAsync` kế tiếp xoá hẳn.

### 10.5 Bảng "Hướng Dẫn [O]" của HUD [ĐO]

- Gốc: `StageScene/Canvas*/InGamePanel/KeyGuidePanel!` (`InGameKeyGuidePanelView`).
  - Neo phải dưới, trên hàng ô đồ. Dòng `UInGameKeyGuidePanel_ControlGuide_Desc` [O] luôn hiện.
  - Nhóm `Toggle` (mặc định tắt trong prefab) liệt kê: Attack [LMB], Dash [Space], Run [LShift], MiniMap [M], Inventory [Tab], Emoji [T], Ping [Ctrl]. Bật/tắt bằng `InGame/ToggleKeyGuide` = O.
- Web: có trong `hud.js`, bấm O hoặc bấm vào dòng "Hướng Dẫn". Trạng thái mở lưu `localStorage`. Bỏ Emoji/Ping vì bản web chơi đơn.
- **Ảnh phím theo thiết bị** (`II_ImagePrompt` của từng dòng, `guides.json keyGuidePanel`): Attack Y, Dash B, Run bấm cần L, MiniMap View,
  Inventory Menu. `InGame/ToggleKeyGuide` chỉ có binding O, nên khi dùng tay cầm dòng "Hướng Dẫn" hiện ảnh `unboundData` của bộ icon.
  [SUY LUẬN: đó là cách InputIcons vẽ action thiếu binding; chưa chạy bản gốc với tay cầm để xem]

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

### 10.7 Tay cầm [ĐO — InputActionAsset + mã GameAssembly]

- **Binding nhóm GamePad** (InputActionAsset "InputActions" trong `dependencies_assets_input`, đọc bằng typetree; chỉ số nút theo
  "standard mapping" của trình duyệt):

| Hành động gốc | Nút | Web (`js/core.js`) |
|---|---|---|
| Player/MovePad, AimPad | cần trái, cần phải | `input.padMove`, `input.aimPad` |
| PlayerFunc/SkillBasicAttack, SkillOne | Y (3), X (2) | SkillBasicAttack, SkillOne |
| PlayerFunc/SkillTwo, SkillThree, SkillFour | RB (5), RT (7), LT (6) | như tên |
| PlayerFunc/SkillDash, Interact, Run | B (1), A (0), bấm cần trái (10) | như tên |
| PlayerFunc/SkillEquipment | D-pad xuống (13) | SkillEquipment |
| InGame/Minimap, InGame/Inventory | View (8), Menu (9) | Minimap; Menu do `js/ui/menu.js` đọc |
| InGamePad/QuickSlotMoveLeft/Right, QuickSlotUse | D-pad trái/phải (14/15), lên (12) | `input.padQuick`, `Item1..5` |
| Ui/Skip, Ui/NextFlow, Ui/Escape (hộp thoại) | A, RT, B | phát lại Space / Ctrl / Escape cho `dialog.js` |

  - Bỏ: SwapPingEmojiPad (LB), PingEmojiPad (bấm cần phải), PointMinimap (LT khi mở bản đồ) — chơi nhiều người / bản đồ lớn.
  - `SkillBasicAttackPadStick` (cần phải đẩy hết, StickDeadzone 0,95–1) chỉ chạy khi tuỳ chọn `RstickAttackOn`, mặc định tắt → bỏ.
- **Đổi thiết bị** (`De.Base InputManager.OnAnyInputEvent` @0x182d11430, `RxControlDevice`, EControlDevice Keyboard 1 / GamePad 2):
  - Sự kiện từ Gamepad tính là GamePad khi: cần trái/phải > `InputSettings.defaultDeadzoneMin`, cò > 0,1, hoặc một trong các nút mặt,
    vai, Start/Select, bấm cần, D-pad đang nhấn.
  - Sự kiện từ Keyboard → Keyboard. Chuột: nhích ≥ 20 px trong một sự kiện, hoặc trạng thái chuột khác mặc định (nút, lăn) → Keyboard.
  - Đổi khi khác thiết bị hiện tại và đã qua `DEVICE_SWITCH_COOLDOWN = 0,3` s (Time.realtimeSinceStartup) kể từ lần đổi trước.
    Khởi đầu Keyboard (`InputManager..ctor`).
  - [SUY LUẬN] Vùng chết cần 0,125 / 0,925 là mặc định InputSettings của Unity; tệp InputSettings của bản gốc chưa bóc.
  - Web: `VD.input.device` ('keyboard' | 'gamepad'), `body[data-input-device]`, sự kiện `vd-device`. Phím phát lại từ tay cầm
    (`e.vdPad`) không làm đổi về bàn phím.
- **Ảnh nút:** `II_ImagePrompt` lấy sprite theo binding của thiết bị hiện tại; bộ icon tay cầm mặc định là `IconSet_XBox_VoidDiver`
  (`fallbackGamepadIconSet` của `InputIconSetConfigurator`). Web: `VD.keyPrompt(kb, padPath, only)` + `VD.refreshPrompts()`;
  `deviceType` 1 (chỉ bàn phím) như phím F của DialogPopup thì ẩn khi dùng tay cầm. Ảnh ở `art/ui/tutorial/pad/` (34×34).
  - Chỗ đổi ảnh: bảng trên sàn, hàng phím hộp thoại + ghi chú, khung bỏ qua, ô skill HUD (Y X B RB RT LT thay LMB/RMB/Space/Q/E/R),
    bảng Hướng Dẫn, lời nhắc tương tác (A thay F), ô nhanh (khung chọn D-pad thay số 1–5).
- **Ngắm bằng cần phải** (`PlayerInputController.OnAimPad` @0x180733020, `FixedUpdate`, `GetAimScreenPoint` @0x180732a40):
  - Cần > 0,01: đích `_aimPadTarget = hướng × (1 − cos(độ lớn × π/2))`, `_isAimPadActive = true`. Thả: đích 0, tắt sau
    `AIM_PAD_DEACTIVATE_DELAY = 0,15` s.
  - Mỗi FixedUpdate: `_aimPadDir += (đích − dir) × clamp01(fixedDeltaTime × PadSensitivity/100 × 10)` (mặc định 40 → 4/s).
  - Điểm ngắm (màn hình): đang ngắm và `|dir|² ≥ 0,01` → tâm màn hình + dir × nửa màn hình. Không thì `AimSupportOn` (mặc định bật) →
    quái gần nhất trong `GameObjectManager._monstersInLocalSight`. Không có quái → hướng đi `_forward`.
  - Web: `playerInput` (stage.js) chiếu điểm màn hình xuống sàn (`screenToGround`). Tầm nhìn lấy nón SightAngle × SightRange + vòng
    SightBackRange. [SUY LUẬN: bản gốc còn tính tường chắn của PlaneSight]
- **Ô nhanh:** `InGameQuickSlotPanelPresenter.OnQuickSlotMoveLeft` giảm `_selectedSlotIndex`, dưới 0 thì về ô cuối (vòng quanh).
  D-pad lên dùng ô đang chọn.

### 10.8 Mở màn và HUD [ĐO — mã + Timeline]

Chủ dự án thấy HUD hiện dưới thẻ tên 2 s rồi Step_00003 mới ẩn. Thứ tự gốc:

1. **Thẻ CampaignStartPopup** (tên sector / campaign / độ khó) mở ở **sảnh**, trong `LoungeScene.OnCampaignStarted`, trước khi nạp
   StageScene (TConst.StageEnterDelay 5 s). Khi `GameContext.IsTutorial` thì hàm thoát ngay, **tutorial không có thẻ** (@0x18086db77).
2. **Màn nạp** `GameLoadingPopup` đóng khi stage vào Intro (5) hoặc Playing (6) (`<OnOpenAsync>b__10_0`): tween tiến độ 0,3 s, mờ 0,25 s.
3. **Intro (5)**: `IntroTimelineObject` chơi `TL_World_OBJ_PhoneBooth_Intro` (11,67 s, 30 fps):
   - canvas phủ màn 0–5,53 s: video `Diveloading` (VideoPlayer ×1,25) dưới nền đen `blackMatte`. Độ mờ theo đường cong:
     blackMatte 1→0 (0–1 s), 0→1 (3–3,67 s); ảnh video 1→0 (3,67–4,33 s); cả nhóm Video 1→0 (4,67–5,5 s);
   - SFX `EnterLoading` 0 s, `BoothEnter` 5,33 s; buồng điện thoại (Spine `World_PhoneBooth`, `enter_start` / `enter_end`) + hạt
     `shadow` 5,33 s, `phonebooth_begin` 7,33 s, `phonebooth_end` 9,63 s; camera `cmCam` đứng yên, offset (25, 21, −25) = camera chơi.
   - Tín hiệu `IntroFinish` 8,3 s → `OnIntroFinished`: tắt vcam, gửi `ReqClientIntroFinished` → đủ người → Playing (6).
4. **Playing (6)** → `GameLuaController` gọi Lua `OnStage` (`<Start>b__21_2`: state == 6) → SetStep(3) → Step_00003 → `SetInGameHudActive(false)`.
- **HUD:** `GameManager.RxActiveInGameHud` khởi tạo `true` (GameManager..ctor), chỉ LuaApi.SetInGameHudActive đổi. Tức là HUD có sẵn
  nhưng nằm dưới lớp phủ đen/video của Intro; lúc lớp phủ tan (5,5 s) thì HUD lộ ra ~2,8 s rồi Step_00003 mới ẩn.
  [SUY LUẬN: đó cũng là hành vi gốc; chưa chạy bản gốc để quay lại]
- **Web** (`dive.js introStart/introTick`, `art/ui/tutorial/timeline.json`, `art/ui/tutorial/intro/Diveloading.webm`):
  - thẻ tên hiện trên màn nạp lúc bắt đầu `VD.dive.start` (thay cho sảnh), bỏ hẳn khi tutorial (`profile.isTutorial` + campaign 1100);
  - trạng thái `intro` dài tới `IntroFinish` (8,3 s), lớp phủ `.vd-introfade` theo đúng ba đường cong, SFX theo CutsceneSoundTrack;
  - chưa có: buồng điện thoại Spine + hạt (skeleton `World_PhoneBooth` chưa bóc), tiếng `EnterLoading` / `BoothEnter` (chưa có trong
    `audio/sfx`, cần `tools/rip_sfx_refs.py`).

### 10.9 Cắt cảnh boss tutorial [ĐO — Timeline]

- `LuaApi.PlayCutscene("IngameCutScene_Chapter_01_TutorialCampaign_1", pos)` → `GameCutsceneManager.OnPlayCutscene`: dựng prefab ở pos,
  chặn input (chỉ map Cutscene), `PopupManager.HideCanvas`, tắt bus `SFX_GAME`. Kết thúc (`FinishCutscene`): `FlushAllLuaSignals`
  (mọi tín hiệu đang đợi phát luôn), StopSfxAll, ShowCanvas, mở input.
- Timeline `TL_InGameCutScene_Chapter00_TutorialCampaign_1`, **10,8 s**. Tín hiệu Lua 1 = `CutsceneLuaSignalClip` (SignalId 1) bắt đầu ở
  **6,167 s** (`CutsceneLuaSignalBehaviour.OnBehaviourPlay` → EmitLuaSignal khi Playback) → Lua `PlayBgm("BossDarkYoung_Battle")`.
  `TimelineFinish` 10,8 s → `OnTimelineFinished` → Lua `WaitCutsceneEndAsync` xong → SpawnMonster 810001.
- Camera: `Vcam` (FOV 10) con của `VcamOffset` (yaw 315°), đường cong "Recorded" dời VcamOffset (~3,3→4,8 m) và kéo Vcam lại gần
  (y 15,6 → 11,7 → 13,7). `CinemachineStoryboard.m_Alpha`: 0,99 → 0 (0–2 s), 0 → 1 (9,6–10,67 s). Rung `m_AmplitudeGain` 6 xung.
- Diễn viên: `Spine_Gayoung` (Cha_Sword, `battle_run` → `cutscene_tutorial` 2,2–10,8 s), `Spine_DarkYoung` (Boss_DarkYoung, walk / idle /
  `skill_2` 7,43 s / `buff`), màu đen `CutsceneCharacterEffectClip` 0,37–7,1 s; hạt `effect_Roar` 8,27 s, 13 lần nhiễu màn hình;
  SFX `DarkYoung_Appear`. Nhóm `DummyPlayerAnimation` (nhân vật người chơi) bị tắt tiếng (muted).
- **Web** (`dive.js cutsceneStart/cutsceneTick`, `tutorial.js cutsceneCam`): độ dài, thời điểm tín hiệu, SFX, tâm và khoảng cách camera
  (`render.setView` + `snap`, giữ góc camera chơi), lớp che Storyboard (`.vd-cutboard`, ảnh gốc chưa đọc → đen), rung nhẹ.
  Giữ Esc / B 1 s → `cutsceneEnd` (như FinishCutscene), khung "Giữ để bỏ qua" riêng (`VD.dialog.setCutscene`).
  - Chưa có: hai diễn viên Spine của cắt cảnh, hạt, nhiễu màn hình, ảnh Storyboard, tiếng `DarkYoung_Appear`. Camera ghép offset theo
    TrackOffset là [SUY LUẬN]. HUD khi cắt cảnh [CHƯA RÕ]: HideCanvas chỉ ẩn canvas popup; web để HUD như cũ.
  - Prefab khác chưa bóc Timeline (vd `IngameCutScene_Chapter_01_Campaign_4`): như cũ (tín hiệu 1,2 s, hết 3 s), ghi vào `D.missing`.
  - Bỏ lớp viền đen + tối màn `body.vd-cutscene` tự chế trước đây (Timeline gốc không có).

### 10.10 Công cụ đọc mã gốc: `tools/il2cpp_method.py` (và `tools/ui_tutorial_timeline.py`)

- `ui_tutorial_timeline.py` bóc Timeline (track, clip, marker, đường cong AnimationTrack, transform nút) ra `timeline.json` và cắt video
  Diveloading bằng ffmpeg. Đường cong là StreamedClip của Unity (UnityPy không giải): khung `[time, số khoá, (chỉ số, a, b, c, d)…]`,
  giá trị `((a x + b) x + c) x + d`; tên đường cong khớp `crc32(đường dẫn)` / `crc32(thuộc tính)` với `genericBindings`, đường dẫn
  tính từ nút mang Animator của track (VcamOffset, Actors…), không phải từ gốc prefab.

- Đọc `global-metadata.dat` v39 (Il2CppDumper 6.x chưa đọc được) và dịch ngược `GameAssembly.dll` bằng capstone. Cách dùng ở đầu tệp.
  - `Kiểu.Method` (cả lớp lồng: `'GameCutsceneManager.<>c__DisplayClass31_0.<OnSkipStarted>b__0'`), `--find REGEX`, `--type REGEX`,
    `--fields Kiểu` (offset trường + hằng const), `--xref Kiểu.Method` (ai gọi), `--strref REGEX` (ai dùng chuỗi), `--usage REGEX`
    (ai dùng TypeInfo/Method/Field…), `--addr 0x…`.
  - Lần đầu mỗi bản game ~20 s (dò codegen module + Il2CppMetadataRegistration), cache ở `tools/__pycache__/il2cpp_method_*.json`;
    sau đó ~2 s. `--xref` / `--usage` quét cả mục mã ~25 s.
- **Bẫy đã sập:**
  - v39 co chỉ số nhỏ lại 2 byte: `method.declaringType` u16 @4 (method 32 B), `typeDef.genericContainerIndex` u16 @20 (typeDef 82 B),
    `image.typeStart/typeCount` u16 @8/@10 (đọc u32 như v31 thì ra số rác, mọi địa chỉ thành 0).
  - Mã game nằm ở mục PE `il2cpp`, không phải `.text` (quét `.text` thì `--xref` rỗng).
  - `m_Action` của binding trong InputActionAsset là **tên** action, không phải id.
  - Tên kiểu trùng (`Extensions`, `InputManager`): khớp tên đầy đủ trước, không có method thì mới tới khớp đuôi.
  - Getter tự sinh dùng chung thân (COMDAT: `get_RxIsPlaying` trùng với hàng trăm getter khác) → `--xref` ra người gọi lạc đề;
    lúc đó tìm theo trường (`--fields`) hoặc đọc hàm Start của lớp nghe.
  - Chú thích `this.<trường>` chỉ theo dõi thanh ghi tuyến tính (bỏ qua nhánh); ghi đè `mov [reg+..]` lên đối tượng mới cấp phát không
    được chú thích. Gọi ảo chỉ in offset. Đọc kỹ trước khi tin.

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

- **Sắp xếp (R), thời gian giữ F nhặt đồ:** đã đo lại từ mã, xem §12.7.
- **[SUY LUẬN] Bấm trái lên ô túi khi không lục rương = chọn ô (Selected!).** Tay cầm dùng A cầm/đặt (§12.6).
- **Các trang khác của MenuPopup, tooltip trang bị, BagPanel, Highlight, tay cầm:** đã làm, xem §12.
- **Rương MedicalBox / Briefcase / HiddenStash:** đã sửa ở `rip_objects.py` (§12.8); `boxSfx` bỏ đường vòng `InteractionLooting_<Prefab>`.

### 11.4 Kiểm trên trang thật (1280×720, 844×390)

- `node test/voiddiver-loot.js` (phần MenuPopup ở §12): đo nhịp giữa `Looting_Loop` và tiếng hé lộ trên giờ game: Rare 1,08, Elite 2,20, Epic 3,10, Legend 4,00 s, tiếng đúng bậc; đóng giữa chừng thì ô đang hé lộ về chưa hé lộ; Shift/Ctrl + trái; kéo thả; chuột phải; phím số; R; Esc; 844×390 mọi khối trong màn, ô ≥ 40 px.

### 11.5 Bẫy đã sập

- **Chữ phím trong prefab Hàn ngược với bản dịch.** Prefab: `1개 넣기` (thêm 1) ở chuột trái, nhưng khoá `SlotInsertOne` trong LocalizedText (en "Add All", vi "Bỏ vào tất cả") và `SlotInsertAll` ("Insert 1"). Làm theo chữ đã dịch (bản phát hành), không theo chữ mặc định của prefab.
- **`dive.js sfx()` bỏ im lặng clip không có trong `VD.ASSETS.sfx`.** Clip mới bóc bằng `ui_inventory_rip.py` chưa vào `data/assets.js` tới khi chạy lại `build_assets.py`; `audio.js` vẫn tìm được theo đường `audio/sfx/<tên>.mp3`, nên các chỗ mới gọi thẳng `VD.audio.sfx`.
- **`url()` trong biến CSS đặt ở `style=""` được giải theo tệp CSS dùng `var()`, không theo trang.** `--m:url(art/…)` trong HTML thành `css/art/…` → 404. Phải viết `url(../art/…)`.
- **Swiftshader chụp một ảnh mất vài giây giờ game.** Bài kiểm chờ "ô 2 đang hé lộ" sau khi chụp thì ô 2 đã xong từ lâu → treo. Chờ "một ô giữa đang hé lộ" thay vì cố định ô.
- **Đồ vừa vứt nằm dưới chân gần hơn rương.** Giữ F sau khi vứt sẽ nhặt lại đồ, không mở rương (đúng luật gần nhất); bài kiểm phải đứng sang phía kia rương.
- **global-metadata.dat v39 (Unity 6):** Il2CppDumper 6.7 không đọc được. Tự đọc: header là bộ ba (offset, size, count); method 32 byte; image 36 byte; `Il2CppCodeGenModule` tìm qua con trỏ tới chuỗi tên dll; literal chuỗi là `0xA0000000 | (idx << 1) | 1`. Xem `tools/ui_inventory_il2cpp.py`.

## 12. MenuPopup: các trang khác, tooltip trang bị, túi phụ, Highlight, tay cầm (đo lại 2026-09-26)

Chủ dự án: "làm hết phần còn lại". Mục này ghi 7 thẻ của MenuPopup gốc là gì, bản web dựng thế nào, và những gì cố ý không làm.

Công cụ:
- `tools/ui_inventory_dump.py MenuPopup` và `QuestSlot ArchiveSlot MenuBuffSlot TextSlot KeySettingSlotRow`. Các ô danh sách nằm ở `dependencies_assets_prefab`; tìm tên qua `_cellViewPrefab` của các `*ScrollerPresenter`.
- `tools/ui_inventory_rip.py`: thêm Deco*, OptionMenu*, Menu*, phím bàn phím, nút XBox_*, tiếng `Fail`. Chạy lại `tools/build_assets.py` sau khi thêm tiếng.
- `tools/ui_inventory_il2cpp.py`: in thêm 5 mục đo trong mã (§12.7). Cần `numpy` để tìm nơi gọi; chạy khoảng 30 s.

Mã:
- `js/ui/menu.js`: khung, thẻ, khoá thẻ, tay cầm, đổi hình phím.
- `js/ui/menu_pages.js`: 6 trang.
- `js/inventory.js`: trang Túi đồ, túi phụ, tooltip, Organize.
- `css/dive.css`: khối "MenuPopup gốc".
- `js/dive.js`: Esc/X mở menu, thời gian giữ F.

Bài kiểm: phần "MenuPopup" của `test/voiddiver-loot.js`. Ảnh ở `%TEMP%/voiddiver-loot-shots/menu-*.png`.

### 12.1 Bảy thẻ [ĐO — `MenuPopup/Contents*/Tabs[]` + `Pages[]`, `EPageCategory`]

| # | Thẻ | Icon | Trang | Nội dung gốc | Bản web |
|---|---|---|---|---|---|
| 0 | QuestTab | MenuQuest1 + MenuQuest2 | QuestPageView | Danh sách `QuestSlot` 620×80 bên trái. `QuestInfoPanel` bên phải: loại, tên, Lv., mô tả, "Mục tiêu" với từng điều kiện `n/goal`, "Thưởng hoàn thành" ô 60. Nút "Hiển thị trên UI" (G), "Xem hội thoại" (F), "Hủy Chọn". | Campaign đang lặn (CampaignTask) và LoungeQuest đang làm (`profile.loungeQuest == 2`). "Xem hội thoại" khoá. |
| 1 | InventoryManagementTab | MenuInventory | InventoryManagementPageView | §11, cộng ví Coin/Gold góc phải trên và BagPanel | Đủ |
| 2 | CharacterTab | MenuCharacter | CharacterPageView | CharacterInfoPanel: tên/danh hiệu, chỉ số (R đổi Cơ Bản/Chi Tiết), Spine đứng trên DecoFloor1, cột ô trang bị 90×90. Thẻ con "Nghịch Lý · Buff" / "Kỹ Năng". Có Equipment-/Paradox-/Buff-/SkillTooltip. | Đủ. Spine dựng bằng một SkeletonMesh riêng trên canvas nhỏ, giữ suốt phiên. |
| 3 | ArchiveTab | MenuEncyclopedia | ArchivePageView | 8 hạng mục `EArchiveCategory` (ArchiveSlot 640×130) và danh sách TextSlot. Bấm một mục mở popup riêng (ArchiveGoods/Monster/Glossary/Quest/DialogPopup). | Chi tiết hiện trong khung tooltip ở cột phải; không dựng 5 popup. |
| 4 | SquadTab | MenuSquad | SquadPageView | Tổ đội chơi mạng: "DS Phòng Công Khai", "Tạo Sảnh", "Tuyển thành viên nhóm…" | **Chơi mạng.** Dựng NotJoinedPanel đúng chữ gốc, hai nút Disabled! (ổ khoá). Thẻ khoá như gốc (§12.7). |
| 5 | OptionTab | **MenuSystem** | OptionPageView | 5 thẻ dọc: Graphic, Sound, GamePlay, Keyboard, Pad | §12.4 |
| 6 | SystemTab | **MenuOption** | SystemPageView | Tiếp tục, Buộc Thoát Lặn, (Rời Sảnh Co-op), Về màn hình chính, Sổ Tay Vận Hành, Thoát Game. Hai bàn tay DecoMenuSystemHand. | §12.5 |

- **[ĐO] Icon thẻ 5 và 6 tréo tên.** OptionTab dùng sprite `MenuSystem`, SystemTab dùng `MenuOption`. Web làm đúng prefab.
- **[ĐO] Phím.**
  - Đổi thẻ: `UiPad/TabLeft` = LT, `TabRight` = RT; bàn phím Q/E.
  - Đóng: Esc/X/B (UI/Escape) và Tab/Start (UI/CloseMenu).
  - Mở: Esc/X khi đang chơi (InGame/Menu) mở thẻ **Mục tiêu**; Tab/Start (InGame/Inventory) mở **Túi đồ** (§12.7).
- **[ĐO] Q/E không vòng quanh và nhảy qua thẻ khoá.**
- Mỗi trang có dải phím riêng ở (80, 1019) theo `KeyGuide!` của trang đó.
- Màn thấp (844×390): khung gọn 1420×700. Thẻ thành cột dọc bên trái, mọi trang dời sang phải 180 px và xếp lại trong 1240×700.

### 12.2 Tooltip trang bị [ĐO — `GoodsTooltip/Equipment` = EquipmentTooltipView]

Các khối trong `Body*` (VerticalLayout cách 8, lề trên 80), theo thứ tự:
1. `Owned` / `NewTag` (thẻ "NEW" #A45646 25 %) và `CharacterSpecificCanEquip_`.
2. `Title_`: bậc màu, tên 28, TypeIcon.
3. `ArtifactTagGroup_`:
   - thẻ loại cổ vật: viền tròn #706E63, nền #292923, chữ #888376;
   - tiền tố tốt: #47663D / #252E27 / #5A804D; tiền tố xấu: #804040 / #2E2120 / #994C4C.
4. `EffectGroup_`:
   - `Skills[]` (EquipmentSkillText): hiệu ứng trang bị và hiệu ứng bộ;
   - `Stats[]` (SubEffectText): chỉ số;
   - chấm 4×4 #707070, chữ 16 #707070.
5. `ArtifactCorruption_`, rồi `ArtifactPrice_` (Coin, kèm Gold trong ngoặc).
6. `Attack_` (24 #DCDCDC), `Elemental_`, `Durability_` ("cur / max").
7. `Description_`, `Price_` (Gold), `StashAmount_`.

Dữ liệu web dùng:
- `Equipment.Stats`; món hỏng (`dur == 0`) dùng `BrokenStats`.
- `EquipmentEffectIds` → `TEquipmentEffect_Desc_<id>`, qua `VD.ui.rich`.
- `EquipmentSetGroupId` → dòng `EquipmentSet`.
- Tiền tố cổ vật `g.prefixes` (ArtifactPrefix, Id ≥ 20000 là tiền tố xấu) và chỉ số của tiền tố.

Ghi chú:
- **[ĐO] Không món nào của bản demo có `EquipmentSetGroupId`.** Ba dòng EquipmentSet là chữ giữ chỗ. Web vẫn dựng dòng bộ nếu có.
- **[SUY LUẬN] Định dạng chỉ số:** `<EStatType_X> +v`, thêm `%` nếu tên kết thúc bằng Percent. Không có khoá LocalizedText cho mẫu "이동 속도 +5% 증가" của prefab.
- **[SUY LUẬN] Giá cổ vật bằng Coin** = `VD.uiDeal.basePrice(g)` (công thức của sảnh, LOUNGE.md §5).
- **[SUY LUẬN] Thẻ NEW:** món lần đầu vào hồ sơ. Web lưu ở `localStorage voiddiver.archive.v1`; gốc có `IsNewArchiveItem/Equipment`. Tắt khi rê chuột qua.
- **BagTooltip:** tên kèm "(đang chứa/số ô)" như mẫu "#향긋한 약초 주머니 (2/6)"; giá = túi + đồ bên trong.
- Cùng một mẫu tooltip dùng ở: trang Túi đồ, cột trang bị trang Nhân vật, chi tiết trang Lưu trữ, thưởng trang Mục tiêu.

### 12.3 Túi phụ (Bag) và BagPanel [ĐO]

- **Túi là một món hàng trong túi đồ, không phải ô cộng thêm.**
  - Mô tả `TBag_Desc_*`: "Sử dụng vật phẩm để xem bên trong túi; nhấn Hủy để chỉ đóng túi lại".
  - Mở: chỉ bằng Use (F / X tay cầm) lên món túi (`OnUseButtonClick` → `UseBag`).
  - `UseBag` mở BagPanel và ẩn QuickSlotSettingPanel; `CloseBagPanel` hiện lại.
  - Đóng: Esc/Back, hoặc khi ô chứa túi đổi (`RefreshBagPanelFromHolder`).
- **Mỗi loại túi mang được một cái.**
  - `HasDuplicateBagType` xét cả túi đồ và khe an toàn.
  - Nhặt thêm túi cùng loại → `CannotCarrySameBagType`. Kéo túi cùng loại vào túi → `SameBagAlreadyOwned`.
  - `EBagType`: None 0, Material 1, Key 2, Artifact 3.
- **Nhặt đồ** (`PlayerInventory.PushGoods`): Item chồng vào chồng sẵn có trong túi phụ trước (`StackIntoExistingBags`), phần còn lại vào túi đồ.
  - [SUY LUẬN theo tên hàm `StackIntoExistingBagSlots`] Ô trống của túi phụ không tự nhận hàng; người chơi kéo vào.
- **Ô túi phụ** chỉ nhận hàng có `BagType` trùng: sai loại → `GoodsNotAllowedInBag`; túi trong túi → `CannotPutBagInBag`.
- **BagPanel:** cùng toạ độ (690, 854) với QuickSlotSettingPanel.
  - Khung 580: bóng gradient_square đen 85 %, Mtl_DE_UI_DefaultFrame, viền 2px #434343.
  - Top* 40 là tên túi; hàng `ItemSlot_1..4` ô 80 cách 12.
- **Web:**
  - Món Bag mang `g.inner = [{ bag: Type, g }]`, nên túi đi cùng đồ bên trong khi kéo, vứt, cất kho, mất khi chết.
  - `VD.inventory.goods()` trả lớp ngoài; `allGoods()` trải phẳng để đếm, tính ô nhiễm, giá trị.
  - Esc/X/B đóng túi trước, lần sau mới đóng bảng.
  - Bỏ tuỳ chọn cũ `bags: [Bag.Id]` (ô túi phụ gắn thẳng vào lưới); nếu vẫn truyền thì thành món Bag.

### 12.4 Tuỳ chọn [ĐO bố cục; web làm được một phần]

- **Bố cục gốc.**
  - Hàng 1478×90, caption 18 #898989 ở x 402.
  - Toggle 200×50 (dòng màn hình 320×50) căn phải tới x 1800.
  - Thanh trượt 718×16, `Slider 0–10` số nguyên: nền #222322, viền #383838, phần đầy #A25D4D (#434343 khi tắt tiếng), tay nắm `img_slider_handle`, nút ImgSoundOn/Off.
  - "Đặt lại" 200×60.
- **Làm được** (lưu ở `localStorage voiddiver.option.v1`, áp khi nạp trang):
  - âm lượng tổng / BGM / hiệu ứng, nhân vào mức trộn sẵn của `audio.js` (0,9 / 0,55 / 0,9);
  - tắt tiếng từng dòng;
  - rung màn hình (bọc `VD.render.shake`);
  - Toàn màn hình / Cửa sổ.
- **Khoá, hiện giá trị web đang dùng:**
  - chất lượng, V-Sync, FPS, gamma, độ phân giải: trình duyệt quyết;
  - ngôn ngữ: web chỉ có tiếng Việt;
  - tự đánh, kiểu chạy, đường ngắm, khoá chuột, tấn công cần phải, hỗ trợ ngắm, độ nhạy tay cầm: cần sửa `stage.js` / `core.js`, thuộc phần khác.
- **Thẻ Keyboard / Pad:** bảng `InputAction.csv` (tên `TInputAction_Name_<Id>`), hình phím theo binding trong InputActionAsset. Chỉ xem, không đổi phím. Hàng `IsRebindable = false` có ổ khoá.

### 12.5 Hệ thống

- **Tiếp tục** đóng bảng.
- **Buộc Thoát Lặn** hỏi `GiveUpDescription` ("tính là thoát thất bại"), rồi gọi `VD.lua.api.ForceReturnToTitle`. Trong web, lệnh này là `finish('abandon')`: mất đồ như chết, trừ khe an toàn. [SUY LUẬN]
- **Về màn hình chính** hỏi `ReturnToTitleDescription`, rồi đi cùng đường trên.
- **Rời Sảnh Co-op** chỉ có ở sảnh chơi mạng, nên không hiện.
- **Sổ Tay Vận Hành** (HelpPopup) và **Thoát Game** khoá.

### 12.6 Highlight và tay cầm

- **[ĐO] `InventoryGoodsSlot/Highlight`.**
  - `Glow`: rectangle_line_glow (9-slice 23) #A45646, material Additive, tràn 13 px.
  - `Line`: rectangle_line_2px trắng, Additive, tràn 2 px.
  - Cả hai là `DOTweenAnimation` Fade tới 0,6 trong 1 s, Linear, Yoyo, lặp vô hạn.
  - Web: `.vs.glow` với `mix-blend-mode: plus-lighter` và `-webkit-mask-box-image`.
- **[ĐO] Khi nào sáng** (`RxHighlightOn`):
  - Mọi ô của túi phụ đang mở sáng khi món đang kéo không phải túi và `PushableBagType == Bag.Type` (`RxIsDragAcceptable`).
  - Ô trang bị cùng loại sáng khi kéo trang bị (§14).
- **Tay cầm** (map UI + UiPad của InputActionAsset, `~/Downloads/vd-ref/cache/input_strings.txt`):

  | Nút | Hành động gốc | Web |
  |---|---|---|
  | Start | InGame/Inventory, UI/CloseMenu | mở trang Túi đồ / đóng |
  | LT / RT | UiPad/TabLeft / TabRight | đổi thẻ |
  | d-pad, cần trái | UiPad/MoveScroll, OptionLeft/Right | dời ô chọn theo hình học (như Selectable của uGUI); trái/phải chỉnh thanh trượt |
  | cần phải | UiPad/MovePanel | nhảy sang panel bên cạnh |
  | A | UiPad/Submit, DragAndDrop | bấm; trong túi: cầm lên / đặt xuống ô đang chọn |
  | B | UI/Escape | thả món đang cầm → đóng túi phụ → đóng bảng |
  | X | UI/UseItem | dùng / mở túi phụ |
  | Y | UiPad/InsertGoods, MuteToggle | sang phía bên kia khi lục rương; tắt tiếng dòng âm lượng |
  | LB (giữ) | UI/InventorySelectOne | Y/RB chỉ lấy 1 món |
  | RB | UiPad/DropGoods | vứt |
  | View | UI/MarkGoods | yêu thích |
  | RS bấm | UI/Organize | sắp xếp; trang Nhân vật: Cơ Bản/Chi Tiết |

- **Hình phím đổi theo thiết bị** như `II_DeviceBasedObjectController` (lớp `.vd-inv.pad`).
  - Nguồn thiết bị duy nhất là `core.js` (InputManager.OnAnyInputEvent gốc: `VD.input.device`, sự kiện `vd-device`, hãm đổi 0,3 s); menu chỉ nghe, và khi bảng mở thì báo nút tay cầm ngược về `VD.input.setDevice`.
  - Ảnh nút tay cầm lấy từ bộ IconSet_XBox_VoidDiver của `core.js` (`VD.padIconUrl`, cùng bộ với `VD.keyPrompt`) theo đường binding; sprite XBox_* ở `art/ui/inventory/` chỉ là dự phòng.
  - InventoryKeyGuide: hàng "nửa" (Shift) chỉ có ở bàn phím; hàng A "Chọn" chỉ có ở tay cầm.
- **Đọc tay cầm:** khi bảng mở, `core.js` không chuyển nút nào vào game và để Start cùng mọi nút cho menu. Menu tự đọc `navigator.getGamepads()`: vòng rAF khi bảng mở; `inventory.step` khi bảng đóng, để bắt Start. Không thêm hành động nào vào `core.js`.

### 12.7 Đo trong mã GameAssembly [ĐO — `tools/ui_inventory_il2cpp.py` mục 1–5]

- **Thời gian giữ F.**
  - `DropGoods.get_HoldingTime` chỉ đọc trường `_holdingTime` của prefab: 0,25 s. Hàm dựng đặt 0,5 khi prefab không ghi.
  - `RewardBox.get_HoldingTime` đọc cột `RewardBox.HoldingTime` (0,1 / 1,2).
  - `Const.LootingInteractionTime` (0,1) chỉ được `MonsterBody.get_HoldingTime` (xác quái) gọi.
  - Không có hệ số nhân: `CharacterInteractState.OnEnter` lấy thẳng giá trị trên.
  - Web: đồ rơi 0,25 (đọc `art/object/DropGoods.json`); rương dùng đúng cột bảng.
- **Sắp xếp** (`InventoryExtensions.Organize`), khoá theo thứ tự:
  1. `OrderBy(ô rỗng)`: ô có đồ trước;
  2. `ThenBy(EGoodsType)` tăng;
  3. `ThenByDescending(Grade)`: bậc cao trước;
  4. `ThenBy(Id)` tăng.
  - Sắp xếp ổn định, **không gộp chồng**.
  - `EGoodsType`: None 0, Gold, Coin, Exp, Consumable, Valuable, Misc, Note, Blueprint, MusicDisc, Weapon, Accessory, Artifact, Bag 13.
  - `EGoodsGradeType`: None 0 … Unique 6.
  - Chỉ sắp khu của ô đang chọn: túi (`ReqOrganizeInventorySlots`) hoặc khe an toàn (`ReqOrganizeInventorySafeSlots`). Ô túi phụ, rương, trang bị, ô nhanh: không làm gì. Không có ô chọn, hoặc đang kéo: không làm gì.
  - Web coi ô đang rê chuột, ô Selected! hoặc ô tay cầm chọn là "ô đang chọn".
- **InGame/Menu.**
  - `InGameScene.OnMenuClick` mở MenuPopup với `PageCategory` 0 = Mục tiêu; `OnInventoryClick` mở 1 = Túi đồ.
  - Không mở khi bản đồ lớn đang hiện; web: Esc/X lúc đó chỉ đóng bản đồ lớn.
  - Thứ tự thẻ = `EPageCategory`: Quest 0, InventoryManagement 1, Character 2, Archive 3, Squad 4, Option 5, System 6.
- **Khoá thẻ.** Chỉ thẻ Tổ đội khoá được: `IsSquadTabLocked = !CheckStateConditions(Npc[700012].UnlockConditions) || IsTutorial`.
  - Npc 700012 là người gác cổng co-op, điều kiện `UserLevel:2`.
  - Bấm thẻ khoá: toast `SquadTabLockedMessage` và tiếng `Fail`.
  - Có hay không có tổ đội không ảnh hưởng.
- **Highlight, BagPanel:** xem §12.3 và §12.6.
- **[CHƯA RÕ]** `backSelect`, `questMark`, `missionMark`, `subIcon` của ô hàng chưa lần theo.

### 12.8 Rương MedicalBox / Briefcase / HiddenStash (`tools/rip_objects.py`)

- **[ĐO] Mỗi prefab rương có hai GameObject gốc cùng tên** trong `remote_prefab_assets_object`: bản `RewardBox` và bản `MimicObject`.
  - `cmd_prefabs` cũ dùng `setdefault`, nên bản nào gặp trước thắng.
- **Sửa:** `root_score` ưu tiên bản có RewardBox, sau đó bản không có gì, cuối cùng MimicObject.
- **Chạy lại đổi 9 prefab:** MedicalBox, Briefcase, HiddenStash, BrownBoxPile, DeadManBox_03, ElectronicsKit, LoungeBox (cả glb), LoungeBox2, OfficeLocker. Các prefab khác giữ nguyên byte.
- **Tiếng giữ F nay đúng prefab:** `InteractionLooting_MedicalBox` / `_Briefcase` / `_HiddenStash`.
  - `boxSfx` bỏ đường vòng `InteractionLooting_<Prefab>`.
  - DeadManBox_03 ghi `InteractionLooting` trần: không có clip trùng tên (có lẽ là tên nhóm MasterAudio), nên dùng `InteractionLooting_Default`. [SUY LUẬN]

### 12.9 Bẫy đã sập

- **Chromium bắn `pointermove` giả** (movement 0) khi bố cục đổi dưới con trỏ đứng yên. Bản đầu tự bắt chuột để đổi thiết bị nên mất tiêu điểm tay cầm ngay sau Start. Nay dùng bộ đổi thiết bị của `core.js` (ngưỡng chuột 20 px).
- **Gamepad API không đệm nút.** Menu đọc mỗi khung; cú bấm ngắn hơn một khung bị khựng thì mất. Trên swiftshader khung khựng tới vài trăm ms, nên bài kiểm giữ nút giả 400 ms và chờ 0,4 s sau phím bàn phím cuối (hãm đổi thiết bị 0,3 s).
- **Tạo một WebGL context mỗi lần mở thẻ Nhân vật** làm khựng cả khung. Giữ một renderer suốt phiên.
- **Esc/X mở menu phải `stopImmediatePropagation`.** Không thì bộ nghe phím của `inventory.js` (đăng ký sau) nhận chính phím X đó và đóng bảng ngay.
- **Tooltip của trang khác dùng lại khung `.vd-inv-tip`** bằng cách chuyển nó sang trang đang mở. `hideTip()` trả nó về trang Túi đồ.

## 13. Xác quái (MonsterBody) — đồ quái nằm trong xác (đo lại 2026-09-28)

Chủ dự án: "quái nếu có loot thì phải là loot xác". Bản cũ bốc `DropReward` lúc quái chết rồi văng từng món ra đất thành
DropGoods ("F Nhặt"), xác biến sau 3 s. Bản gốc không văng gì: đồ nằm trong kho của xác, lục như rương.

Đo bằng `tools/il2cpp_method.py`. Phương thức interface có dấu chấm trong tên (vd `MonsterBody.IInteractiveObject.CanInteract`)
không tra được bằng `Kiểu.Method`: lấy tên đầy đủ bằng `--find MonsterBody` rồi gọi `disasm(i)` từ một script nhỏ theo tên đó.

- **[ĐO] Bốc đồ lúc sinh, không phải lúc chết.** `MonsterController.OnNetworkSpawn` (host): nhóm = `MonsterSpawn.DropRewardGroupId`
  nếu quái sinh từ dòng MonsterSpawn, không thì `Monster.DropRewardGroupId`; với mỗi `LootingInventory` trên prefab (một kho cho
  mỗi người chơi) gọi `CreateInventorySlots(nhóm)` → `Extensions.PickRewards(…, campaignId, missionIds, difficulty, partyWeaponTypes)`.
  Web: `spawnMonster` gán `u.lootItems = rollGroup(u.dropGroup)`.
- **[ĐO] Tương tác được khi** (`MonsterBody.IInteractiveObject.CanInteract`): quái ở `EActionState.Dead` (5), `NextPhaseMonsterId ≤ 0`,
  chưa `IsLifeTimeFinished` (quái bóng), người lục là nhân vật, và kho của người đó không `IsEmpty`. Kho rỗng thì không có lời nhắc.
- **[ĐO] Giữ F:** `MonsterBody.get_HoldingTime` = `Const.LootingInteractionTime` (0,1 s); `get_HoldingSfx` = `_holdingSfx` của prefab,
  rỗng thì chuỗi cứng `"DoorInteractied2"` (clip bóc bằng `tools/ui_inventory_rip.py audio DoorInteractied2`). `OnStartInteraction`
  → `LootingInventory.StartLooting` (cùng cơ chế hé lộ từng ô như rương, §11.2); `OnEndInteraction` → `EndLooting`.
  Hoàn tất: `get_InteractionSfx` = `_interactionSfx` của prefab; rỗng thì web phát `LootingCompleted` như rương. [SUY LUẬN]
- **[ĐO] Hoạt ảnh người lục:** `CharacterView.GetInteractionAnimation` chỉ trả `battle/search` cho RewardBox / MimicObject /
  InteractiveTrigger; MonsterBody ra `default/idle`. Web: lục xác không bật `battle/search` (`openLoot({ search: false })`).
- **[ĐO] Lời nhắc** (`InGameInteractionPromptPresenter.UpdateUi`): tiêu đề `DeadMonsterFormat` "Xác {Monster.Name}", thêm
  " (Đã kiểm tra)" (`Revealed`) khi `MonsterBody.IsAllRevealed`; chữ nút `Inspect` "Kiểm tra". Rương cũng có tiêu đề (tên RewardBox)
  nhưng web chưa hiện; chỉ xác quái dùng dòng `.ttl` mới của `.vd-prompt`.
- **[ĐO] Viền sáng:** `MonsterController.OnStateChanged` bật `OutlineObject` khi quái Dead và kho không rỗng, và nghe thay đổi kho
  (`OnDead` đăng ký `<OnDead>b__55_0`) để tắt khi lục hết. Web chưa có hệ viền cho vật/quái nên không vẽ. [CHƯA LÀM]
- **[ĐO] Xác sống bao lâu** (`MonsterDeadState.OnEnter` hẹn `Monster.DeadDuration`; `GetNextStateEvent`): hết DeadDuration mà quái
  không phải Boss/MiniBoss (`EnumExtensions.IsBoss`: MonsterType 2 hoặc 3), và (không có kho, hoặc hết LifeTime, hoặc mọi ô mọi kho
  rỗng và không ai đang lục) → `ReservedDespawn`: `NetworkObject.Despawn` sau 3 s (`MonsterReservedDespawn.OnEnter`: TimeNow + 3).
  Xác Boss/MiniBoss không bao giờ biến. DeadDuration là 0 ở mọi quái thường, 2 ở vài boss.
  Web: xác có đồ (hoặc xác Boss/MiniBoss) → thực thể `corpse` trong dive.js, gỡ unit khỏi `stage.deadQueue` để stage không xoá sau
  3 s; lục hết và đóng bảng → hẹn 3 s rồi xoá unit và thực thể. Xác rỗng của quái thường vẫn theo `stage.deadQueue` (3 s) như cũ.
- **[ĐO] Tan xác:** `UnitVisualEffectView.OnReservedDespawn` chạy `DOVirtual.Float(0→1, 2 s)` trễ 1 s (shader dissolve).
  Web chưa có shader dissolve cho Spine: xác biến hẳn ở giây 3. [CHƯA LÀM]
- **Kiểm:** `test/voiddiver-dive.js` phần 2 (`corpseAndGear`): giết bằng chuột trái, không có DropGoods, xác còn sau 4 s, lời nhắc
  "Xác Kkamong / Kiểm tra" 0,1 s, giữ F mở bảng + LootingInventory của xác, bấm trái lấy hết, 3 s sau xác biến.

## 14. Trang bị trong lượt lặn (EquipmentInventoryPanel) (đo lại 2026-09-28)

Chủ dự án: "không tháo đổi weapon/equip được trong lúc đang đi ải". Bản cũ vẽ 6 ô trang bị chỉ để xem: bấm, kéo, F đều bỏ qua.

- **[ĐO] Mô hình:** `Character` có `WeaponSlots[2]` + `ActiveWeaponIndex`, `AccessorySlots` (`Const.CharacterAccessorySlotCount` 3),
  `ArtifactSlots` (`CharacterArtifactSlotCount` 2). Web: `VD.inventory.gear = { weapon: [g, g], active, acc: [3], art: [2] }`, dựng
  từ loadout (`weaponId`, `equipmentIds`) lúc `reset`. `equipList()` vẫn trả 6 ô (vũ khí đang cầm, 3 phụ kiện, 2 cổ vật) cho trang
  Nhân vật; `subWeapon()` là ô thứ 7 (`data-k="6"`).
- **[ĐO] Bố cục** (prefab `EquipmentInventoryPanel`, `EquipmentInventoryPanelView`): `WeaponSlot` 80×80 tại (40, −40); `SubWeapon_`
  110×110 tại (25, −55) đứng trước trong cây (vẽ sau lưng) gồm `WeaponSlot` 70×70 lệch (−20, −20), `KeyPrompt` V_Key 40×40 tại
  (−43, 33), `IconSwap` Swap 32×22 #707070 (pivot 1,1) tại (51, −29), `Dim` #1B1B1B 70 % 46×46 lệch (−8, −8). HUD
  (`InGameQuickSlotPanel`): `WeaponSwapSlot` 90×90 + `SubWeapon_` 70×70 phía sau, `SwapedFX` khi đổi. Web HUD thu theo ô đồ 40 px.
- **[ĐO] Thao tác** (`InventoryManagementPagePresenter`):

  | Thao tác | Mã gốc | Web |
  |---|---|---|
  | Kéo món từ túi / khe an toàn / rương vào ô trang bị | `HandleEquipSlot` → `CheckEquipable` → `ReqEquip{Inventory,Safe,Looting}Slot` | `I.equipFrom(a, k, ô)` |
  | F lên trang bị trong túi / khe an toàn | `OnUseButtonClick` → `EquipInventorySlot` / `EquipSafeSlot` (ô đích −1) | `useRef` → `I.equipFrom(a, k)` |
  | F, bấm trái, bấm phải lên ô trang bị | `UnequipToInventorySlot` (bấm trái khi túi phụ mở: `TransferEquipmentSlotToBagSlot`) | `I.unequip(k)` |
  | Kéo ô trang bị ra túi / khe an toàn / rương | `ReqUnequipTo{Inventory,Safe,Looting}Slot` | `I.unequip(k, a, ô)` |
  | Kéo ô trang bị sang ô trang bị | cùng loại `ReqSwapEquipmentSlots`; khác loại `EquipementSlotTypeMismatch` | `I.swapGear(k1, k2)` |
  | V trong bảng / khi đang chơi | `OnSwapWeaponButtonClick` (không khi `_isDragging`) / `PlayerInputController.OnSwapWeaponPerformed` → `ReqSwapWeapon` | `I.swapWeapon()` |

- **[ĐO] `CheckEquipable`:** loại ô của món (`EnumExtensions.GetSlotCategory`) khác ô đích → `NotEquipableEquipmentType`; vũ khí có
  `Equipment.WeaponType` khác `Character.WeaponType` → `NotEquipableWeaponType`; `Equipment.EquipPartGroup` > 0 trùng một món đang
  đeo ở ô khác (`HasDuplicateEquipPartGroup` quét cả 3 mảng, bỏ ô sắp bị thay) → `DuplicateEquipPartGroup`.
- **[ĐO] Máy chủ** (`CharacterController`): `OnEquipInventorySlot` kéo món ra (`TryPullSlot`), `Equip`, rồi đẩy món vừa tháo vào
  đúng ô nguồn. `Equip` với ô −1: vũ khí → `ActiveWeaponIndex`; phụ kiện/cổ vật → ô trống đầu tiên (`FirstOrDefault`); hết ô trống
  thì web lấy ô 0 [SUY LUẬN: nhánh thứ hai chưa đọc]. `Unequip` không chặn ô vũ khí: vũ khí tháo ra được; khoá `CannotUnequipWeapon`
  ("Vũ khí chỉ có thể hoán đổi.") không có chỗ gọi trong bản demo. `UnequipToInventorySlot` cần một ô túi trống, không thì
  `NotEnoughInventorySlots`. `OnSwapWeapon`: `AllowEmpty = false` nên ô kia trống thì không đổi. Không có điều kiện trạng thái (đang
  đánh, đang niệm) ở cả client lẫn host.
- **[ĐO] Tiếng:** `PlayEquipSound` "Equip", ô cổ vật "Equip2"; tháo "ItemRelease". Bóc bằng `tools/ui_inventory_rip.py audio Equip Equip2`.
- **[ĐO] Highlight:** `RxHighlightOn`: ô trang bị cùng loại sáng khi đang cầm trang bị (chuột kéo hoặc A tay cầm).
- **[ĐO] Hiệu lực ngay:** chỉ số tính lại bằng `Stats.base` với vũ khí đang cầm (hỏng thì `BrokenStats`) + phụ kiện + cổ vật; máu và
  thể lực kẹp theo giá trị tối đa mới. Da vũ khí theo `Extensions.UpdateCharacterSkin`: skin `"weapon/" + Equipment.WeaponSkinName`,
  không vũ khí thì `"weapon/dummy"` (bộ Spine demo không có skin này nên không vẽ vũ khí). Ô vũ khí HUD vẽ lại.
- **[CHƯA LÀM]** `Equipment.EquipmentEffectIds` → `EquipmentEffect.BuffId / SkillIds` (hiệu ứng phụ kiện/cổ vật) chưa được web áp,
  kể cả với loadout từ sảnh; vũ khí demo không có hiệu ứng nào. Skill trang bị (`Character.EquipmentActiveSkillId`, phím C) cũng chưa.
- **[CHƯA RÕ]** Chết thì trang bị đang đeo ra sao: chưa đọc được. Web: thoát được thì ghi `profile.equip[nhân vật] = { weapon, sub, acc, art }`;
  chết thì hồ sơ giữ bộ cũ như trước.
- **Kiểm:** `test/voiddiver-loot.js` (sai loại vũ khí, sai ô, trùng EquipPartGroup, đổi ô, túi đầy, F tháo, chuột phải tháo vũ khí,
  ô phụ + V) và `test/voiddiver-dive.js` (F lên kiếm lấy từ xác, kéo kiếm cũ vào ô phụ có Highlight, V ngoài bảng: Atk, da, HUD).
- **Bẫy:** ô vũ khí phụ nằm sau ô chính và tâm của nó bị ô chính che. Thả chuột vào phần lộ ra bên trái (bài kiểm dùng x + 10).
- **Bẫy:** bốn bước tay cầm cuối của `voiddiver-loot.js` (RT/LT, X mở túi phụ, B, d-pad) hỏng cả khi chạy mã ở HEAD 13e8baa trên máy
  đang chạy 4 agent: Gamepad API đọc theo rAF, máy nặng thì mất hoặc lặp nút. Không phải do phần trang bị.
