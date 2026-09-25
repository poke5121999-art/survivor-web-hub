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
- [ĐO] Camera dùng InteriorVCamTemplate với FOV 15°. Hướng lệch giống lúc lặn. Tâm nhìn là `Area.CameraPos` của khu đang mở gần người chơi nhất, có damping.
- [ĐO] Sảnh không có nón đèn pin. Thông số ánh sáng:
  - Ánh nắng (0,77; 0,83; 1) × 0,6.
  - Ánh sáng nền (0,95; 0,86; 0,74) × 0,95.
  - Hậu kỳ: tương phản +20, bão hoà −10, phơi sáng −0,25.
  - Mọi thông số được trả lại khi rời sảnh.
- Người chơi đi bằng anim `default/*` và chỉ chạy được. Ở sảnh, `stage.js` không chuyền phím đánh hay skill.

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
- Kết quả ghi vào `data/npcs.js` (`VD.NPCS`, 98 NPC) và 37 bộ Spine NPC/`Cha_*` trong `art/spine/`.
- Các Spine trang trí được tách riêng: `World_Cat` (anim `SE/sit_2`), `World_Pendulum`, `World_Butterfly` và `World_LoungeBG` (scale 4,35, xoay y π/4).
- Bộ nhớ đệm nằm ở `%TEMP%/voiddiver-rip/npc_prefabs_v1.json`. Xoá tệp này nếu muốn quét lại.
- NPC dạng lưới 3D (700002 máy Antikythera, 700004 sofa, 700151 máy hát, 701xxx) chưa được xuất. Chúng chỉ hiện tên.

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
- [SUY LUẬN] Số ô skill = 2 + tổng Talent `SkillSlotCount` (tối đa 4). Lý do: ảnh Steam ss05/ss07 có 4 ô RMB/Q/E/R, lúc đầu mở 2 ô.
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

## 7. Chưa làm và dữ liệu thiếu

- **Tycoon / TycoonSalesSlot / Employee:** chưa làm. `VD.T` không có các bảng Employee, EmployeeLevel, EmployeeSkill, TycoonSalesSlot, AreaDecoration và FeatureUnlock. Menu hiện các chức năng này dạng mờ.
- **Ảnh hội thoại chưa tách:** `dialogimage` (bg_prologue_13, bg_Lounge, bg_LoungeDesk). Thiếu chân dung của 700005 Chủ nhân và Player. `dialog.js` kiểm tra ảnh có tồn tại không, nếu thiếu thì để lộ cảnh sảnh 3D.
- **Tiếng:** chưa có SFX giao diện và NPC (NPC_AI, NPC_Sofa, Train, Paper, DoorKey …). Phần lớn bản nhạc của LoungeBgm cũng chưa có, nên bảng chỉ liệt kê bài đã có.
- **Màn tiêu đề:** chưa có logo tiêu đề gốc, nên đang dùng LogoNemo.
- **Lỗi phía dive.js (không sửa ở đây):**
  - dive.js chưa gán tiền tố cổ vật, nên deal.js tự gán.
  - `SetLoungeQuestState` trong dive.js gửi id thay cho trạng thái.
  - `D.start` bị ghi đè; app.js đã né lỗi này.
- **Trang bị:** chưa có giao diện mặc trang bị.

## 8. Bẫy đã sập

- **NBSP trong Lua gốc:** `LoungeQuest/80100` (dòng 179) và `810800` có ký tự U+00A0 nên fengari báo lỗi cú pháp. `lua.js` đổi ký tự này thành dấu cách trước khi nạp.
- **Chữ `\n` trong văn bản gốc:** nhiều chuỗi chứa `\n` dạng hai ký tự. `L.text` đổi chúng thành xuống dòng.
- **Xuống dòng CRLF:** `js/dialog.js` dùng CRLF, nên thay chuỗi kiểu LF sẽ không khớp.
- **Viết regex qua heredoc:** dấu `\` bị mất. Hãy sửa bằng công cụ Edit.
- **Test sau `PingToNpc`:** script đổi step sau một khoảng trễ. Bài kiểm phải chờ `step == 2`, không kiểm ngay.
