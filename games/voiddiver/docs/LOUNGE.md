# LOUNGE — sảnh Balusha và luồng game của Void Diver bản web (2026-09-25)

Tài liệu này ghi luật của sảnh (lounge) và vòng chơi: tiêu đề → mở đầu → sảnh ⇄ lặn → sảnh. Luật lấy từ bảng gốc (`data/tables.js`), Lua gốc (`data/lua.js`) và prefab gốc.

Mã nằm ở:
- `js/app.js`: máy trạng thái luồng game (`VD.app`), màn tiêu đề, `toDive` / `toLounge`, khởi động theo URL.
- `js/lounge.js`: cảnh sảnh, NPC, bốt lặn, HUD sảnh, LuaApi phía sảnh, bộ máy LoungeQuest.
- `js/npc.js`: menu NPC (hội thoại Lua, chức năng NpcFunction, "Trò chuyện" NpcTalk), bảng handler theo `NpcFunction.Type`.
- `js/ui/*.js`: các bảng chức năng. `panel.js` là khung chung. `campaign.js`, `character.js`, `goods.js`, `progress.js`, `workshop.js` và `deal.js` là từng nhóm chức năng.
- `js/profile.js`: hồ sơ, lưu `localStorage`. Lớp lặn cũng dùng tệp này.
- `css/lounge.css`: giao diện.
- `data/npcs.js` + `art/spine/<NPC>/`: do `tools/rip_npc.py` sinh ra (§3).

Bài kiểm là `test/voiddiver-lounge.js`. Ảnh chụp nằm ở `%TEMP%/voiddiver-lounge-shots/`.

Nhãn:
- **[ĐO]**: có dữ liệu hoặc mã gốc chứng minh, kèm id/số.
- **[SUY LUẬN]**: đoán từ tên cột hoặc từ cách dữ liệu được dùng. Có ghi lý do.
- **[CHƯA RÕ]**: không đủ dữ liệu. Có ghi giá trị đang dùng.

---

## 0. Luồng game

```
title ─ Chơi mới ─▶ (reset hồ sơ, nhận Campaign 1100) ─▶ sảnh ─▶ OnLounge 1100 → ForceStartStage ─▶ lặn 1100
title ─ Tiếp tục ─▶ sảnh
sảnh ─ bốt lặn (F) ─▶ VD.app.toDive({campaignId, characterId, loadout, difficulty}) ─▶ dive ─▶ màn kết quả ─▶ VD.app.toLounge(result) ─▶ sảnh
```

- `VD.app.scene` có giá trị `'title' | 'lounge' | 'dive'`. Hàm LuaApi có ở cả hai cảnh sẽ rẽ theo biến này.
- URL:
  - `?lounge=1`: vào thẳng sảnh với hồ sơ đang có.
  - `?lounge=new`: vào sảnh với hồ sơ mới.
  - `?sandbox=1`, `?campaign=…` và `?menu`: giữ đường của lớp lặn.
- `toDive` làm các việc sau: đóng hội thoại, rời sảnh, gắn talent vào `VD.stage.charExtras`, lấy skill theo loadout của nhân vật, chuyển túi mang theo (`profile.pack`) thành đồ trong túi lặn, rồi gọi `VD.dive.start`.
  - Hàm `start` được giữ bản gốc lúc nạp trang. Lý do: `dive.js` ghi đè `D.start` bằng một vị trí.
- `toLounge(result)` xử lý kết quả chuyến lặn. Nếu kết quả không phải do dive.js tự ghi vào hồ sơ (`fromDive`), nó cộng EXP, đồ thu được, lượt qua màn và tiến độ nhiệm vụ. Hồ sơ được lưu sau mọi thay đổi.
- Chơi mới:
  - [ĐO] `Campaign/1100.lua` OnLounge gọi `ForceStartStage`, nên lượt đầu vào sảnh sẽ vào lặn ngay.
  - [ĐO] Sau khi thoát, `QuestComplete` cho +10 Coin và gọi `SetIsTutorial(false)`.
  - [ĐO] Tiếp theo là chuỗi LoungeQuest: 80200 (UnlockConditions `CampaignCleared:1100`) → 81101 → 80100 …
- Bỏ qua hội thoại (prologue, QuestComplete, mọi hội thoại NPC): giữ Esc hoặc giữ chuột trên khung "Giữ để bỏ qua" ở góc trái dưới 1 s.
  - Lua vẫn chạy hết từng dòng: prologue vẫn `SetString(110001,"prologue")` + `ForceStartStage`; QuestComplete vẫn `GiveCoin(10)` + `SetIsTutorial(false)`.
  - Gặp lựa chọn thì dừng tua. Nguồn gốc và giới hạn: `docs/DIVE.md` §10.4.

## 1. Toạ độ và camera

- [ĐO] `Const.LoungeStageId = 9001`: sector sảnh chính. Sector 9003 là phòng huấn luyện (Area 3).
- [SUY LUẬN] Sector 9001 đặt ở ô (0, 1), nên z_lua = z_sector + 30. Chứng cứ:
  - `Area.CameraPos` của khu 1 là `14:0:45`, xấp xỉ điểm xuất hiện (13,5; 14,7) cộng 30 theo z.
  - `LoungeQuest/80100` đặt `GUEST_POS` ở z = 40, nằm trong phòng khách của 9001 khi cộng 30.
  - Đổi sang three: `(x, 0, −z_lua)`.
- [SUY LUẬN] Sector 9003 chỉ được nạp khi khu 3 đã mở (`profile.areaOpen(3)`), đặt ở ô (0, 0). Nếu nạp sớm, camera nhìn vào một vùng trống lớn.
- [ĐO] Camera sảnh là camera người chơi, giống lúc lặn: FOV 10°, offset (25, 21, −25), bám người chơi, damping 1 s.
  - `GameCameraController.OnViewTargetChanged` gọi `CameraManager.ActivatePlayerCamera(target)` ở cả sảnh.
  - `CameraManager._interiorVCamTemplate` (FOV 15°) chỉ được đọc trong `CameraManager.FocusOnPosition`. Hàm này chỉ có `InteriorPopupPresenter.PlayInteriorTransition` gọi, khi mua nội thất. `Area.CameraPos` là điểm nhìn của cảnh chuyển đó.
  - Bẫy đã sập: bản trước đặt camera sảnh FOV 15° cố định ở `Area.CameraPos`. Kết quả là nhìn quá xa, cả phòng thu nhỏ, và camera không theo người chơi. Kiểm lại bằng `python tools/il2cpp_method.py --xref CameraManager.FocusOnPosition`.
- [ĐO] Sảnh không có nón đèn pin. Thông số ánh sáng:
  - Ánh nắng (0,77; 0,83; 1) × 0,6.
  - Ánh sáng nền (0,95; 0,86; 0,74) × 0,95.
  - Hậu kỳ: tương phản +20, bão hoà −10, phơi sáng −0,25.
  - Mọi thông số được trả lại khi rời sảnh.
### 1.1. Đánh và dùng skill trong sảnh (2026-09-28)

- [ĐO] Sảnh không chặn skill. `CharacterIdleState.GetNextStateEvent` nhận `UseSkillEvent` mà không xét `IsInLounge`, và `UnitModel.CheckSkill` không có luật riêng cho sảnh. Vì vậy `stage.js` chuyền đủ phím LMB/RMB/Space/Q/E/R ở sảnh.
- [ĐO] Khác biệt nằm ở `UnitModel.IsNonCombat` = `GameManager.IsInLounge` và không có buff mang hiệu ứng `TrainingRoom` (EBuffEffectType 68). Khi `IsNonCombat`:
  - `UnitController.CalculateDamage` trả 0, nên không mất máu.
  - `CharacterController.OnStaminaDamageEvent` / `OnStressDamageEvent` bỏ qua, nên thi triển không tốn thể lực hay căng thẳng.
  - `UnitController.UpdateRegenHp` / `UpdateSkillCharge` dừng: không hồi máu, không nạp tối thượng (tối thượng cần nạp đầy nên không dùng được ngoài phòng tập).
  - Anim: `CharacterView.GetIdleAnimation` / `GetMoveAnimation` dùng `default/*`; `UnitSkillState.GetAnimationName` dùng `nonCombatAnimationName` nếu có (chỉ lướt có: `default/dash`).
  - Bản web: `lounge.js combatTick` đặt `u.nonCombat` mỗi khung; `skill.js payCost` / hồi máu / nạp tối thượng / tên anim đọc cờ này; `stage.js` chọn bộ anim theo cờ.
- [ĐO] Buff `TrainingRoom` 62100003 chỉ đến từ SpecialField 5001 "TrainingField" (`CharacterBuffId` = `MonsterBuffId` = 62100003). Sector đặt nó ở `SpecialFieldSpawnGroupDatas`:
  - 9001: hộp 5 × 5 m tại (12,91; 22,43), không có bù nhìn.
  - 9003 (phòng tập, Area 3): hộp 9,5 × 11,3 m tại (23,65; 30,34), cùng 5 bù nhìn `MonsterSpawnGroupDatas` 820001/820002/820004/820006/820007 (Hp 10000, MoveSpeed 0, không skill Active, passive 40010007–9).
  - `lounge.js spawnTrainingDummies` sinh đúng các bù nhìn này khi 9003 được nạp. Sảnh 9001 không có bù nhìn, bản web không thêm.
- HUD người chơi ở sảnh là HUD lặn (`VD.hud`): pin đèn, máu, căng thẳng, dãy skill, ô đồ (Profile.quick, số lượng trong túi mang theo), bản đồ nhỏ (`VD.minimap`, lộ hết, dấu NPC), "Hướng dẫn [O]". Hàng chữ "WASD / F" cũ đã bỏ.
- Nhân vật ở sảnh luôn mang đúng đồ của hồ sơ (`VD.app.equipOf`: chỉ số, skin `weapon/<Equipment.WeaponSkinName>`) và talent (passive AddSkill). [ĐO] `ReqChangeCharacter` / `ReqChangeCharacterSkills` gốc gọi `GamePlayer.set_Character` ngay (`CharacterController.OnChangeCharacterSkills`). Bản web: `lounge.js combatTick` so chữ ký (nhân vật, đồ, talent) mỗi khung; khác thì `VD.app.refreshLoungePlayer` sinh lại unit tại chỗ. Đổi skill thì chỉ thay loadout.

## 2. NPC ở sảnh

- NPC xuất hiện khi `Npc.UnlockConditions` đạt. Chủ nhân 700005 chỉ hiện sau `CampaignCleared:1101`.
- NPC do Lua gọi `SpawnNpc` sẽ xuất hiện ở vị trí mà Lua đưa.
- [SUY LUẬN] Mỗi lần vào sảnh, 2 khách vãng lai (NPC có chức năng TycoonCustomer/ArtifactDeal) được sinh ngẫu nhiên tại `GuestSpawnDatas`, khi UserLevel ≥ 2.
- Tên nổi trên đầu NPC gồm `TNpc_SubName_*` và `TNpc_Name_*`. Chữ phụ có thẻ `<color>` ("[VIP]") nên được đưa qua `VD.ui.rich`.
- Dấu "!" hiện trên NPC có hội thoại nhiệm vụ.
- Tương tác: đứng gần trong 1,6 m rồi bấm F.
  - F gửi `ELuaEvent.NpcInteraction` (giá trị NpcId) tới mọi script đang chạy.
  - [ĐO] `Campaign/None.lua` nghe sự kiện này.
- Menu NPC có ba nhóm mục, theo thứ tự:
  1. Hội thoại Lua (`AddDialog` / `AddLoungeDialog`). Mục nhiệm vụ đứng trước, sau đó xếp theo `Priority`.
     - [SUY LUẬN] Một mục được coi là nhiệm vụ nếu `Type = "Quest"`, hoặc `Purpose` là Start/Complete. Lý do: `AddLoungeDialog` trong Common.lua dùng `Type "Lounge"` cho cả mục giao việc và mục trả việc của 82100.
  2. Chức năng NpcFunction đủ UnlockConditions. Loại chưa có handler hiện mờ, kèm "(chưa có ở bản web)". Các loại `Multiplay*`, `TycoonCustomer` và `Dialog` bị bỏ qua vì không dùng ở bản chơi đơn.
  3. "Trò chuyện": các dòng NpcTalk đủ AddConditions và chưa dính RemoveConditions. Mỗi dòng gọi hàm `TalkDialog_*` trong `NpcTalk/NpcTalk.lua`.
- Danh sách hội thoại lưu ở `profile.dialogs`, dùng chung với dive.js và được khử trùng lặp.
- Bốt lặn: [SUY LUẬN] là prefab PhoneBooth đặt cạnh NPC 700105 "혼령". Lý do: Lua gọi `PingToNpc(700105)` với chữ "lặn".

## 3. Tách hình NPC (`tools/rip_npc.py`)

- Công cụ quét các prefab `remote_prefab_assets_object` có tên 6000xx, 70xxxx hoặc 710xxx. Mỗi prefab có `NpcObject` và `SkeletonAnimation`, từ đó lấy skeleton, skin, anim, scale, lật hình và bán kính capsule.
- Kết quả ghi vào `data/npcs.js` (`VD.NPCS`, 114 NPC) và các bộ Spine NPC/`Cha_*` trong `art/spine/`. Mỗi dòng: `spine`, `dir`
  (NW/SW theo tên SkeletonData), `skins`, `anim`, `scale`, `flip`, `off` (vị trí SkeletonAnimation so với chân, toạ độ three),
  `mesh` (prefab có lưới 3D đi kèm), `radius`, `holdSfx`, `useSfx`.
- Các Spine trang trí được tách riêng: `World_Cat` (anim `SE/sit_2`), `World_Pendulum`, `World_Butterfly` và `World_LoungeBG` (scale 4,35, xoay y π/4).
- Bộ nhớ đệm nằm ở `%TEMP%/voiddiver-rip/npc_prefabs_v2.json`. Chạy `python tools/rip_npc.py --rescan --manifest` để quét lại.
- Luật gốc [ĐO il2cpp, 2026-09-28]:
  - `GameObjectManager.SpawnNpc`: Instantiate prefab, `Transform.set_position(vị trí spawn)`, `set_localScale(Vector3.one)`, giữ xoay
    prefab. `Sector.NpcSpawnDatas` không có cột hướng. Vị trí gốc prefab (vd 700013 còn 13,24/15,25 của editor) bị bỏ.
  - `NpcObject.Awake`: `_skeletonAnimation = GetComponentInChildren<SkeletonAnimation>()`, tức con **đang bật** đầu tiên. Đa số là
    `SkeletonAnimation_SW`; 700408/700409 bật `_NW` (quay lưng). NpcObject không có LookAt, không lật theo người chơi. Chỉ
    `EmployeeNpcObject.ApplyEmployeeVisual` gọi `SetSkeletonScaleX`.
  - Dời và lật nằm trong prefab: 700013 Narcis SW ở y 0,58, scale x −0,9 (lật), xoay y −90 (shader billboard nên xoay không đổi hình);
    700011 cú: `Model` ở (0,55; 0,4; −0,15), ngồi trên bàn; 700012 Gatekeeper SW ở (0,067; 0,141; −0,091).
- Dựng hình: `VD.npc.visual(target, id, pos)` (js/npc.js), sảnh (`lounge.js addNpc`) và màn lặn (`dive.js spawnNpc`) dùng chung.
  Trước 2026-09-28 màn lặn tra `VD.ASSETS.units` (không có NPC nào) nên NPC trong màn lặn vô hình (vd 700404 Alex của 1102).
- Lưới 3D đi kèm (`mesh: true`): 700002 máy Antikythera, 700004 sofa, 700151 máy hát, 700012 cổng Gatekeeper, 700013 đế gương
  Narcis, 700106–700109 đế tủ trưng bày + dây chắn, 701001–701018 đống xác/đồ trong màn lặn. `python tools/rip_objects.py --npc`
  xuất chúng thành `art/object/<NpcId>.glb`; `VD.objects.create(id, {noSpine: true})` dựng (Spine do js/npc.js dựng).
  - Prefab bật cả mắt mở lẫn mắt nhắm (`*.close`), Animator gốc bật/tắt luân phiên. Bản web ẩn nhóm `.close`.
  - **Bẫy SkinnedMeshRenderer:** Unity vẽ SMR theo xương (`Σ w·xương.localToWorld·bindpose·v`), không theo transform của SMR.
    Đặt SMR theo transform của nó thì `Sofa_tenBase` (nằm dưới `Armature/root`, scale 100) bay lên 58 m. `rip_objects.py` skin sẵn
    đỉnh theo tư thế xương trong prefab.
    `CursedBox` (rương mimic, 16 SMR) cũng đổi khi xuất lại (nắp mở lên thay cho xúc tu toả ra); bản trong repo vẫn là bản
    xuất cũ vì chưa lấy mẫu clip `Anim_Map_CursedBox_*_Closed` để biết tư thế nào đúng lúc chơi.

## 4. LoungeQuest

Bộ máy LoungeQuest được dựng lại, vì phần C# gốc không có. [SUY LUẬN] Các luật được đoán từ cách Lua gọi API:

- Trạng thái 0 None → 1 NotStarted khi UnlockConditions đạt.
- Trạng thái 2 InProgress → 3 NotCompleted tự động khi mọi task có `Goal > 0` đã đạt.
  - Task có `Goal = 0` do script tự đẩy.
- Mỗi lần đổi trạng thái, `OnEvent(241, trạng thái mới)` chỉ được gửi tới script của chính quest đó.
- Khi vào sảnh, các trạng thái 1..3 được bắn lại một lần mỗi phiên, để script gốc đăng ký lại hội thoại.
- Khi sang trạng thái 4 Completed, `Rewards` được đưa vào kho.
- Loại task đã làm:
  - `UserLevel`
  - `LuaProgress` (`SetProgress`)
  - `CampaignClear`
  - `LoungeQuestCleared`
  - `MyItemCountTotal`
- Lời gọi Lua được xếp hàng (`luaQueue`) và chạy trong `update`. Cách này tránh gọi lồng vào Lua đang chạy.

### 4.1. Chỉ dẫn trong sảnh: bảng nhiệm vụ, "việc kế tiếp", mũi chỉ, dải dẫn đường (2026-09-28)

- **Bảng nhiệm vụ** (`js/hud.js` `renderQuest`, kiểu `.vd-qtrack` ở `css/ui.css`, dùng chung cho sảnh và lúc lặn):
  - [ĐO] Theo prefab `InGameQuestPanel` (tools/ui_inventory_dump.py InGameQuestPanel HudCampaignQuestSlot HudLoungeQuestSlot):
    gốc neo trái trên @(0, −57), slot rộng 550, lề trái 80, slot cách nhau 12, tên → việc 6, việc → việc 8, ô ◇ 13 px xoay 45°,
    biểu tượng MainQuestIcon 32 px lệch −6 bên trái tên (Main có "!", Sub không), nền `gradient_circle_128` đen 50 % 2000×1000.
  - [ĐO ảnh Steam 1080p `ss_67066307…`] Cỡ chữ bản phát hành lớn hơn prefab demo: độ khó 18, tên 24 đậm, việc 19 (#b8b8b8),
    số hiện tại #eee đậm. Nhãn "Normal" trên ảnh màu vàng (#9fa100); prefab demo ghi xanh (0, .467, 0). Web theo ảnh.
  - Co giãn: `--q = max(min(100vw/1920, 100vh/1080), 0.75px)` (sàn 0,75 để còn đọc ở 1280×720), màn thấp ≤ 480 px dùng 0,6.
  - Nội dung sảnh (`L.questSlots`): slot campaign đang nhận (độ khó + tên + việc CampaignTask), rồi LoungeQuest có `Display`
    đang chạy (1..3), Main trước Sub — như `InGameQuestPanelPresenter` / `GetDisplayLoungeQuestIds`.
- **Bản web thêm để sảnh không bao giờ trống** (không có slot gốc tương ứng):
  - Không có slot nào thì hiện LoungeQuest Main ẩn đang chạy có việc đếm được (vd 81101 "Lần lặn đầu tiên" sau khi xong 80200).
    Bản gốc lúc này để trống bảng, chỉ có mũi chỉ trên Elara (`None.lua` OnLounge) — đó là chỗ người chơi kêu "không biết làm gì".
  - Luôn có dòng "việc kế tiếp" (`L.nextStep`). Chữ là câu thoại `PingToNpc` gốc (`Common.lua` `_PingData`, `LCommon_40x1`:
    "Tôi nên nói chuyện với Elara.", "Tôi nên đến Buồng lặn." …). NPC không có câu `_PingData` thì hiện tên NPC.
    Thứ tự chọn đích: hội thoại Quest của campaign → của LoungeQuest Main → NPC do Lua bật `SetNpcNavigationActive` →
    bốt lặn (đã nhận campaign) → hội thoại Quest của LoungeQuest Sub → Elara (chưa nhận campaign).
- **Mũi chỉ trên đầu NPC**: [ĐO] prefab `Object/Etc/PointerArrow` (UI/Hud/Cursor: tam giác viền 80×72, tam giác đặc 16×14, vòng
  16 px, hai vòng 50 px mờ) vẽ lại bằng SVG trong `css/lounge.css`. Hiện khi Lua gọi `SpawnPointerArrow`, khi NPC bật navigation,
  và trên đích "việc kế tiếp" (nhãn `.target`). NPC đã có `SpawnPointerArrow` sát bên thì nhãn không vẽ thêm mũi thứ hai.
- **Dải dẫn đường dưới sàn** (`js/groundnav.js`): [ĐO] `NpcObject.SetNavigationActive` bật `GroundNavigation` (ribbon rộng 0,5 m,
  cao 0,05, uvTiling 2, cắt 0,5 m đầu, cập nhật 0,25 s, vật liệu alpha clip 0,5 cuộn `_Speed` 0,3, texture
  `Img_DE_GroundNavigationPattern`) — tools/rip_groundnav.py → `art/object/GroundNavigation.{json,webp}`.
  - [ĐO GenerateMesh] v = quãng "nhìn thấy" tới đích × uvTiling; quãng mỗi đoạn nhân (1 + (0,7 − 1)·|dot(đoạn, _cameraDirection)|).
  - [SUY LUẬN] Bề rộng nở ×1,5 khi đoạn nằm ngang với camera (`_widthPerspectiveScale`); phần này của GenerateMesh chưa đọc hết.
  - Web tìm đường bằng BFS trên lưới đi của world.js thay NavMesh. Bản web vẽ dải tới đích "việc kế tiếp" (bản gốc chỉ khi Lua bật
    navigation), tắt khi đứng trong 2 m hoặc đang mở hội thoại/bảng.
- Bảng phím "Hướng Dẫn [O]" không đưa vào sảnh: các dòng của nó (đánh, lướt, túi đồ, bản đồ) không dùng được ở sảnh bản web.

## 5. Campaign

[ĐO] Luồng theo script gốc:

1. Nhận campaign ở Elara. Bản ghi được tạo với step 0, state 1.
2. `OnLounge` chạy `OnLoungeCommon`, gọi `SetStep(1)`, rồi `Step_00001` hiện hội thoại giao việc.
3. Người chơi vào bốt lặn.
4. Sau chuyến lặn, `OnLoungeCommon` gọi `IsAllTaskAchieved` rồi `SetStep(10)`, tới hội thoại `QuestComplete`.
5. `SetQuestState(4)` phát thưởng: RepeatRewards, FirstRewards (chỉ lần đầu) và `Campaign.GainedExp`.

Các luật dựng thêm:
- [SUY LUẬN] Một campaign chơi được ở bản web khi mọi FixedSectors có art, và nếu bản đồ còn ô trống thì có sector cùng ThemeType để lấp.
- [CHƯA RÕ] LocalizedText không có nhãn nhóm campaign, nên nhãn tự đặt: "Hướng dẫn", "Cốt truyện", "Thường".
- [ĐO] Số ô skill = `GamePlayer.ActiveSlotCount` = 2 + tổng Talent `SkillSlotCount` (ETalentEffectType 4). Ô 0–3 là RMB/Q/E/R. Chi tiết ở §6.2.
- [SUY LUẬN] Nhân vật khác 100001 mở sau khi qua 1100.

## 6. Kinh tế và chức năng NPC

- Lên cấp (Chủ nhân 700005):
  - [ĐO] `Level.NeedExp` cộng dồn, trả phí bằng `ConsumeGoodsData`. Lên cấp 2 tốn 3 Coin.
  - [ĐO] `Const.LevelMax = 7`.
  - Lời thoại lấy từ `Dialog_LevelUp_*`.
- Kho: [ĐO] `StashSlotCount = 60` + Talent StashSlotCount. Túi mang theo: `CharacterInventorySlotCount = 23`.
- Shop (Lucas và các NPC bán hàng):
  - [ĐO] ShopProduct gom theo nhóm `Value1` của NpcFunction.
  - [SUY LUẬN] Mỗi món được tung `AppearProbability` lại sau mỗi chuyến lặn. Số lượng giới hạn theo `StockCount`.
  - Đồ không phải cổ vật bán lại được theo `SellPrice`.
- Pim: [ĐO] mua cổ vật với giá Worth × `ArtifactShopCostMultiplier` (0,7) Gold.
- Đổi xu (CoinExchange): [CHƯA RÕ] đang dùng tỉ lệ Item 10001 ↔ Coin là 1:1.
- Nghỉ (Sofa):
  - [SUY LUẬN] Phí = `RestCost` (400) × `RestCostMultiplier` (2,5)^n, với n là số lần nghỉ kể từ chuyến lặn trước.
  - Mỗi lần nghỉ xoá ngẫu nhiên một Nghịch lý.
- ParadoxPurify / ParadoxLock: phí theo `ParadoxLevel`.
- Talent:
  - Cây vẽ theo `DisplayPoint`. Phí lấy từ dòng Talent.
  - Nhãn nhóm: `Talent_Group_<Value1>`.
  - [CHƯA RÕ] Các hiệu ứng InventorySlotCount, SafeInventorySlotCount, RecoveryItemCount, LightFuelEfficiency và ShopProductGradeAppearBonus đã lưu nhưng lớp lặn chưa áp dụng.
- Chế tạo:
  - Công thức Crafting lấy nguyên liệu từ kho và đưa thành phẩm vào kho.
  - `RegisterItemUsed` đếm cho điều kiện `ItemUsed`.
- DangerLevel: [SUY LUẬN] đặt độ khó mặc định cho chuyến lặn sau.
- Interior: mua InteriorShop để mở `NpcLevel` / `Area` / `AreaDecoration`.

### 6.1. Đàm phán cổ vật (ArtifactDeal, khách 6000xx)

[ĐO] Các hằng số:

| Hằng số | Giá trị |
| --- | --- |
| Số lá trên tay | 5 |
| Lượt đề xuất | 5 |
| Đổi lại | 2 lần × rút 3 lá |
| Thẻ ưa thích tối đa | 8 |
| Tỉ lệ thành công | 5–95 % |
| Hệ số khớp thẻ | ×1,1 (2 khớp), 1,25, 1,35, 1,5, 1,7, 1,95, ×2,3 (≥ 8 khớp) |
| `CoinToGoldRate` | 48 |
| `ArtifactPriceMinPercent` | 30 |
| `ArtifactDealCardRelevanceWeightPercent` | 300 |

[SUY LUẬN] Công thức giá:
- Giá gốc (Coin) = Worth × (1 + Σ PriceMultiplier của tiền tố) / 48, không thấp hơn 30 % của Worth / 48.
- Tiền tố của cổ vật được gán lần đầu, với số lượng từ `ArtifactPrefixMin/Max<Bậc>`. Mỗi tiền tố có 30 % là tiền tố xấu.
- Tiền tố khớp thẻ ưa thích được cộng giá. Tiền tố khớp thẻ ghét bị trừ giá.
- Lá bài có ích với tình huống hiện tại được rút nhiều hơn (trọng số ×3).
- Khi chốt giao dịch:
  - Người chơi nhận Coin bằng giá chốt.
  - EXP = giá × 48 × `ArtifactDeal<Bậc>ExpMultiplier`.
  - Script nhận `ELuaEvent.ArtifactDeal` (giá trị là NpcId của khách).
- Lời thoại bong bóng lấy từ các cột `ArtifactDeal *:Localized`.

### 6.2. Chọn kỹ năng (SkillSelectPopup) và bảng nhân vật (CharacterSettingPopup) (2026-09-28)

Mã: `js/ui/character.js`, kiểu ở `css/lounge.css`. Cây prefab đo bằng `python tools/ui_inventory_dump.py SkillSelectPopup CharacterSettingPopup SkillSelectInfoSlot SkillInfoDisplaySlot`.

- [ĐO] NpcFunction: CharacterSelect (Narcis 700013) mở CharacterSettingPopup; CharacterSkill (Felix 700008) mở SkillSelectPopup. Nút "Chọn kỹ năng" của CharacterSettingPopup cũng mở SkillSelectPopup (`OnSkillSettingButtonClick`).
- [ĐO] CharacterSettingPopup:
  - Bấm chân dung là đổi nhân vật ngay (`OnCharacterSlotClick` → `SetCharacter` gửi `ReqChangeCharacter`). Không có nút "Chọn", không có bảng chỉ số.
  - Ô chưa ra mắt báo `FeatureComingSoon`.
  - Hộp "Kỹ năng đang được chọn" (`UpdateSkillInfo`) chỉ hiện `ActiveSlotCount` ô 50 × 50, không nhãn phím, không ổ khoá.
- [ĐO] SkillSelectPopup, bố cục 1920 × 1080:
  - Trái trên (x 80–720, y 140): dải "Kỹ năng của {tên}" (`SkillOwnerFormat`) + "Có thể thay thế sau khi chọn kỹ năng", mặt nhân vật 140 × 90, 5 ô 90 × 90 cách 10 với phím RMB/Q/E/R/C phía trên.
  - Dưới (y 334): thông tin skill của ô đang chọn (`SkillInfoDisplaySlot`: icon 90, tên 22, ô căng thẳng / máu / hồi chiêu "{0:0.0}", mô tả 16), mũi tên chỉ sang phải.
  - Phải (x 816–1840, y 140–1000): "Chọn kỹ năng để thay thế kỹ năng bên dưới." + danh sách `SkillSelectInfoSlot`. Thẻ "Ô hiện tại đang hoạt động" / "Đã áp dụng vào ô".
  - Không có ví. Dải phím: Esc X Đóng, chuột trái "Chọn ô rồi chọn kỹ năng.".
- [ĐO] Luật (`SkillSelectPopupPresenter`):
  - `OnOpenAsync`: 4 ô Active (`SelectedActiveSkillIds[i]`, khoá khi i ≥ ActiveSlotCount) + ô Equipment chỉ khi `Character.EquipmentActiveSkillId` > 0. `_targetIndex` = 0.
  - Ô khoá → `ShowLocked` (chữ SlotLocked, ẩn danh sách). Ô Equipment → `ShowReadOnlySkillInfo` (thông tin + "Kỹ năng trang bị không thể thay thế.", ẩn danh sách).
  - `OnSkillSelectInfoSlotClick`: ô khác đang giữ skill cùng gốc bị tháo (−1) kèm toast `SkillUnequippedFormat`. Sau đó đặt skill vào ô đang chọn. Không đổi chỗ.
  - `CloseWithSave` (Esc / X / nền) gửi `ReqChangeCharacterSkills`. Bản web lưu hồ sơ khi đóng bảng rồi `refreshLoungePlayer`.
- [ĐO] Danh sách = `GamePlayer.GetSelectableActiveSkillIds`: `TCharacter.ActiveSkillIds` + Talent AddSkill (skill Active) / UnlockSkillMode / ChangeSkill. Bảng demo không có talent nào thêm skill Active, nên chỉ còn ActiveSkillIds. `SkillSelectScrollerPresenter.BuildSlotModels` xếp theo id gốc → skill chế độ → Id, tức theo Id tăng dần.
- [ĐO] `EquipmentActiveSkillId` = skill Active trong `EquipmentEffect.SkillIds` của trang bị đang mặc (vd phụ kiện 26011 → 30010000 "Chữa lành I"). `VD.app.equipSkillId` tính giá trị này. Bản web chưa dùng được skill ô C khi đánh (`Skill.slotSkill` chưa có ô này).
- [CHƯA RÕ] Loadout mặc định của nhân vật mới do server gốc cấp. Bản web lấy `stage.defaultLoadout`: RMB = ActiveSkillIds[0], Q = [1]. Hai ô này khớp ảnh sảnh (Noah: khiên, đá nổ) và ảnh bảng nhân vật (Gayoung: Xung Phong, Bùa Trấn Áp). Ô E/R ẩn giữ skill mặc định cho tới khi mở ô.

### 6.3. Túi đồ ở sảnh (Tab) (2026-09-29)

- [ĐO] Sảnh gốc cũng là `InGameScene`. `OnInventoryClick` (Tab / Start) mở MenuPopup ở trang Túi đồ với bố cục `IsInLounge ? InventoryStash : InventoryOnly` (`python tools/ui_inventory_il2cpp.py`, mục [3]).
- Bản web dùng lại trang Túi đồ của `inventory.js`. `lounge.js openInventory`:
  - `inventory.reset({ pack, safe, quick, equip, lounge: true })` nạp **bản sao** hồ sơ. Túi có `CharacterInventorySlotCount` + Talent `InventorySlotCount` ô.
  - Cột phải là kho: `openLoot({ stash: true })`, `StashSlotCount` + Talent ô, hiện sẵn, không lục. Khung 5 hàng cuộn dọc. [ĐỀ XUẤT — prefab kho chưa đo]
  - Đóng bảng (Tab / Esc / X / rời sảnh) gọi `inventory.onClose`, ghi ngược `pack`, `safe`, `quick`, `stash` và `equip[nhân vật]`. Đổi trang bị thì `refreshLoungePlayer` sinh lại người chơi.
- [ĐO] `InventoryManagementPagePresenter.OnDropGoods` rẽ theo `SlotCategory`: túi → `DropInventoryGoods`, khe an toàn → `DropSafeGoods`, rương → `CannotDropInLootInventory`, kho → `CannotDropWarehouseItem`.
- Ở sảnh bản web chặn vứt đồ từ túi (chỉ phát `Fail`), vì sảnh chưa có hàng rơi dưới sàn nên vứt là mất. [CHƯA RÕ bản gốc có rơi xuống sàn sảnh không]
- Dùng đồ trong túi ở sảnh báo `CannotUseInLounge` ("Vật phẩm này không thể sử dụng trong sảnh."). Chữ này có trong bảng gốc. [SUY LUẬN là chỗ dùng]
- Hàng còn trong túi (chưa cất kho) theo người chơi vào ải. `app.toDive` gửi `inventory: { pack, slots }` và `dive.js` nạp bằng `reset({ pack })`, nên trong ải túi y như lúc ở sảnh: đủ từng chồng, cùng số ô (có Talent `InventorySlotCount`). Thoát ra thì cả túi vào kho, chết thì mất (trừ khe an toàn).
- Vũ khí phụ (`equip[nhân vật].sub`) vào ải qua `loadout.subWeaponId`. Trước 2026-09-29 nó không được truyền vào, nên lặn xong hồ sơ ghi `sub: 0` và mất vũ khí phụ.
- Tay cầm (Start) ở sảnh chưa mở túi: `inventory.step` chỉ chạy trong lượt lặn.
- Kiểm: `node test/voiddiver-lounge.js --only=lobbybag` (Tab thật, bấm ô kho thật, đếm tổng món trước và sau).

## 7. Chưa làm và dữ liệu thiếu

- **Tycoon / TycoonSalesSlot / Employee:** chưa làm. `VD.T` không có các bảng Employee, EmployeeLevel, EmployeeSkill, TycoonSalesSlot, AreaDecoration và FeatureUnlock. Menu hiện các chức năng này dạng mờ.
- **Ảnh hội thoại chưa tách:** `dialogimage` (bg_prologue_13, bg_Lounge, bg_LoungeDesk). Thiếu chân dung của 700005 Chủ nhân và Player. `dialog.js` kiểm tra ảnh có tồn tại không, nếu thiếu thì để lộ cảnh sảnh 3D.
- **Tiếng:** chưa có SFX giao diện và NPC (NPC_AI, NPC_Sofa, Train, Paper, DoorKey …). Phần lớn bản nhạc của LoungeBgm cũng chưa có, nên bảng chỉ liệt kê bài đã có.
- **Màn tiêu đề:** chưa có logo tiêu đề gốc, nên đang dùng LogoNemo.
- **Lỗi phía dive.js (không sửa ở đây):**
  - dive.js chưa gán tiền tố cổ vật, nên deal.js tự gán.
  - `SetLoungeQuestState` trong dive.js gửi id thay cho trạng thái.
  - `D.start` bị ghi đè; app.js đã né lỗi này.
- **CharacterSettingPopup:** chưa có khu đổi skin (tên skin, xem trước Spine, chấm phân trang, `CharacterSkin` / `CharacterSkinPreset`).
- **Tiếng giao diện:** `select` / `select2` / `TalentOpen` của SkillSelectPopup chưa bóc.

## 8. Bẫy đã sập

- **NBSP trong Lua gốc:** `LoungeQuest/80100` (dòng 179) và `810800` có ký tự U+00A0 nên fengari báo lỗi cú pháp. `lua.js` đổi ký tự này thành dấu cách trước khi nạp.
- **Chữ `\n` trong văn bản gốc:** nhiều chuỗi chứa `\n` dạng hai ký tự. `L.text` đổi chúng thành xuống dòng.
- **Xuống dòng CRLF:** `js/dialog.js` dùng CRLF, nên thay chuỗi kiểu LF sẽ không khớp.
- **Viết regex qua heredoc:** dấu `\` bị mất. Hãy sửa bằng công cụ Edit.
- **Tab ở sảnh không làm gì (tới 2026-09-29):** phím Tab chỉ được nghe trong `dive.js` (điều kiện `D.state === 'play'`), nên sảnh không có ai mở túi.
- **Nạp túi hồ sơ qua `inventory.add` là mất đồ:** `add` cắt tổng một loại Item theo `InventoryCountMax` và từ chối túi phụ cùng loại. `pack` của hồ sơ (do `goods.js` xếp) được phép vượt trần. Sảnh dùng `reset({ pack })`, đặt nguyên từng món vào từng ô.
- **Chạy bài kiểm trên mã cũ để thấy nó hỏng:** dựng worktree sparse ngoài repo, rồi chép bài kiểm mới vào đó.
  - Lệnh: `git worktree add --no-checkout <dir> HEAD`, rồi `MSYS_NO_PATHCONV=1 git sparse-checkout set --no-cone '/games/voiddiver/' '/test/'`.
  - Thiếu `MSYS_NO_PATHCONV` thì Git Bash đổi `/games/...` thành `C:/Program Files/Git/games/...`, và worktree rỗng.
- **Test sau `PingToNpc`:** script đổi step sau một khoảng trễ. Bài kiểm phải chờ `step == 2`, không kiểm ngay.
- **Hàng trăm món đồ rải khắp sàn sảnh (2026-09-28):** đó là tấm thảm (`Mtl_2DBG_BaseCamp01_Prop_1_Decal`) vẽ nhầm vùng atlas.
  - gltfpack lượng tử UV theo từng material và ghi `KHR_texture_transform` riêng. `Prop_1`, `Prop_1_Decal`, `Plant_Potted`, `Plant_InBox` dùng chung ảnh `Img_25D_BG_Basecamp01_Prop_1` nhưng khác offset/scale.
  - `world.js shareTex` trước đây gộp texture chỉ theo ảnh, nên thảm dùng transform của `Prop_1`. Nay khoá gồm cả offset/repeat/rotation. Các bản clone vẫn chung `Source`, nên GPU vẫn chỉ nạp ảnh một lần.
- **Tường sọc xanh chanh, tủ trưng bày trắng đục:** cả hai là kính.
  - `Mtl_2DBG_BaseCamp01_Tile_Glasses02` có `_Surface` 1 và `_BaseColor.a` 0, nhưng không có texture. `rip.py` trước đây chỉ đặt BLEND khi có texture, nên kính thành khối xanh đục.
  - Kính trong atlas được đánh dấu ở kênh B của `_EmissionMap`. Shader ghi: "Multi Map (R: Emission, G: Dissolve Mask, B: Glass, RB: Fresnel)". `rip.py sector` tách điểm ảnh kính thành primitive BLEND riêng (ảnh `<tên>_glass.webp`, alpha `GLASS_ALPHA`). Phần còn lại dùng ảnh `<tên>_solid.webp`.
- **Spine đứng im hiện đôi:** `MeshRenderer` của `SkeletonAnimation` chỉ là ảnh chụp lưới Spine lúc lưu prefab. `rip.py sector` bỏ qua chúng, vì Spine thật do `lounge.js spawnDecor` dựng.
- **Bảng chọn kỹ năng co thành cột 50 px (2026-09-28):** thân bảng mang lớp `vd-skill`, trùng lớp ô skill của HUD (`css/ui.css .vd-skill { width: 50px }`). Bảng mới dùng lớp `vd-sks`. Đặt tên lớp mới thì grep `css/` trước.
- **Bù nhìn phòng tập không có hình (thư mục `art/spine/Target_*` rỗng):** năm bộ `Target_*` dùng chung một atlas `Target_Training_Atlas`, không có atlas mang tên bộ. `rip.py` trước đây tìm atlas theo tên nên bỏ qua. Nay nó theo `SkeletonDataAsset.atlasAssets`. Bóc lại vài bộ mà không đụng manifest: `python rip.py spine-names Target_Zombie,...`, rồi `rip.py unit-view` và `build_assets.py`.
- **Hồi chiêu không hiện trên HUD:** `skill.js` giữ `u.cd[id]` là số giây còn lại, không phải mốc thời gian. `hud.js` trước đây lấy `cd − A.time`, nên luôn âm.
- **Kiểm bằng Playwright + swiftshader:** mô phỏng 60 Hz có thể trễ so với giờ thật. Chờ theo trạng thái (`waitFor` hồi chiêu / máu bù nhìn), đừng chờ theo mili giây.
- **`il2cpp_method.py --find 'A|B'` qua shim `python` của pyenv:** dấu `|` bị cmd.exe hiểu là ống dẫn. Gọi thẳng `~/.pyenv/pyenv-win/versions/3.8.10/python.exe` (bản có capstone) từ Git Bash.
