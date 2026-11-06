# Food Gang: các mode chơi và bộ chọn mode (2026-11-02, rev 20261102b)

## 1. Food Gang không phải SquadBlast

- `com.bloop.food` là **Food Gang** của Bloop Games, chính là game được làm lại ở đây.
- **SquadBlast** là game khác: game bắn súng màn ngang của **UltraHorse**, có trên Steam, App Store, Google Play (`com.ultrahorse.squadblast`) và Xbox Game Preview.
- Không nguồn nào nối hai game với nhau. Nguồn: [Dexerto](https://www.dexerto.com/gaming/squadblast-gameplay-platforms-everything-we-know-1942622), [Google Play](https://play.google.com/store/apps/details?id=com.ultrahorse.squadblast&hl=en).

## 2. Mode gốc của Food Gang (dữ liệu giải nén: `GameMode.json`, `MissionData.json`)

Bản gốc có mode mặc định `test` = Random/Random. Mỗi trận Quick Play bốc mode từ `GameModeDeck`: mỗi mode 2 lá, xáo trộn, hết bài thì xáo lại. Riêng 2 trận đầu tiên luôn là Gang Battle.

| # | Key | Tên (English.json) | Mục tiêu × đội | Luật (GAMEPLAY.md, mã dịch ngược) |
|---|---|---|---|---|
| 1 | `mission.dm.ffa` | Food Battle | DeathMatch × FreeForAll | 90 s, ai nhiều kill nhất thắng |
| 2 | `mission.dm.2vs2` | Gang Battle | DeathMatch × 2v2 | 90 s, đội nhiều kill nhất thắng |
| 3 | `mission.kill.ffa` | Fast Food | Kill5 × FreeForAll | không giờ, ai đạt 5 kill trước thắng |
| 4 | `mission.kill.2vs2` | Fast Gang | Kill5 × 2v2 | không giờ, đội đạt 9 kill trước thắng |
| 5 | `mission.survive.ffa` | Last Food Standing | LastSurvivor × FreeForAll | 3 mạng, người cuối còn sống thắng |
| 6 | `mission.survive.2vs2` | Last Gang Standing | LastSurvivor × 2v2 | 3 mạng mỗi người, đội cuối còn người thắng |
| 7 | `mission.killboss.1vs3` | Boss Rush | KillBoss × 1v3 | 60 s, boss chết một lần là phe người chơi thắng; hết giờ thì boss thắng |

Bảy tên này khớp đúng danh sách TouchArcade đã nêu.

## 3. Mode của SquadBlast (tìm trên web, 2026-11-02)

Trang Steam ghi "8 game modes", tối đa 5v5, có phòng tuỳ chỉnh. Các mode tìm thấy tên:

| Mode | Luật theo nguồn | Nguồn |
|---|---|---|
| Team Deathmatch | hai đội hạ nhau tính điểm | Google Play, patch 0.9.8.0 |
| King of the Hill | giữ một vùng để ghi điểm; có giới hạn điểm, trận 8–12 phút | patch 0.9.8.0 |
| Payload (Payload Struggle) | hai đội giành một khối hàng đang di chuyển, giữ quyền điều khiển càng lâu càng tốt | Dexerto preview, wiki Basics |
| Payload Extraction | 2 hiệp: bên công đẩy hàng tới điểm thoát, bên thủ chặn; đổi bên; đội đẩy nhanh hơn hoặc xa hơn thắng | patch 0.9.10.0 |
| Capture the Flag | cướp cờ | patch 0.9.8.0 |
| Capture the Point | chiếm điểm | Google Play |
| Conquest | chỉ 3v3/4v4; luật chi tiết không được ghi | patch 0.9.8.3/0.9.8.4 |
| Touchdown | giành bóng, mang vào khung thành địch; người cầm bóng chậm hơn, không dùng vũ khí | patch 0.9.14.0 |

SquadBlast **không có** mode "thủ nhà" (base defense) trong các nguồn tìm được. Mode gần nhất là Payload Extraction, cũng có một bên công và một bên thủ.

Các mode còn lại hợp với một game bắn súng đi cảnh 2D nếu muốn làm tiếp: King of the Hill, Capture the Flag, Touchdown.

## 4. Hai mode mới (chỉ có ở bản web) [ĐỀ XUẤT]

Chỉ mượn **luật** của SquadBlast. Art, nhân vật, map và engine đều là của Food Gang: cái tủ lạnh dùng chính sprite tủ lạnh thưởng `fridge_reward_01/03` của game.

### Push the Fridge (`GoalType.Payload` = 5, 2v2, 120 s)
- Tủ lạnh xuất phát giữa map, chạy theo một đường bám mặt sàn của từng map:
  - Kitchen: thẳng;
  - Dining table: leo qua chồng đĩa giữa sàn;
  - Pantry: xuống hố rồi lên lại.
- Một đội có người đứng cạnh tủ (trong 2,5 đơn vị) và đội kia không có ai thì tủ trôi về phía địch. Tốc độ là 1,6 đơn vị/giây với một người, 2,1 với hai người. Hai đội cùng đứng cạnh thì tủ đứng yên.
- Tủ qua vạch đích phía địch thì đội đẩy thắng. Vạch nằm ở 75 % quãng đường mỗi bên, trước khu hồi sinh, có cột màu của đội.
- Hết giờ: tủ đang ở bên nào thì đội đẩy về bên đó thắng; tủ ở giữa thì hoà.
- Mượn từ: Payload Struggle (giành khối hàng di chuyển) và Payload Extraction (đẩy về phía đối phương).

### Defend the Fridge (`GoalType.Siege` = 6, 2v2, 90 s)
- Đội thủ được chọn ngẫu nhiên bằng cờ `bossOnLeft` của matchmaking. Đội này có một tủ lạnh lớn 6500 máu ở cuối map phía mình, trên tủ có thanh máu.
- Đạn, vụ nổ và đòn cận chiến của đội công đều trừ máu tủ. Đòn của đội thủ đi xuyên qua tủ.
- Tủ vỡ (cửa bật mở) thì đội công thắng. Hết giờ thì đội thủ thắng.
- Bot: bên công kéo tới tủ và đánh khi không có địch ở gần; bên thủ đứng gác trước tủ.
- Mượn từ: hai bên công/thủ của Payload Extraction. Đây là cách người dùng gọi "thủ nhà".

Cân bằng đo bằng 18 trận toàn bot (3 map × 6):
- Push the Fridge: đội 1 thắng 10, đội 2 thắng 8; 3 trận về đích, còn lại phân theo phía khi hết giờ.
- Defend the Fridge: bên công thắng 10, bên thủ thắng 8.

### Phạm vi không đụng tới
- Bốn mục tiêu gốc chạy đúng đường mã cũ. Field state mới (`cartT`, `cartPush`, `objHp`, `objHpMax`) chỉ được tạo ra trong trận mode mới.
- Event mới mang số 17–18, nằm ngoài `SIM_EVENT_TYPE_COUNT` = 17 của bản C#.
- Bảng 200 trận bot của `test/food-gang-sim.js` cho ra cùng từng con số như trước khi thêm mode.
- Snapshot mạng thêm 4 field global. `PROTOCOL` tăng lên 2, nên client cũ bị từ chối với lý do `version`.

## 5. Bộ chọn mode (Play → chọn mode)

- Bấm BATTLE! ở menu thì mở `ScenePrivateConfiguration`. Đây là màn chọn mode duy nhất của bản gốc, vốn dùng cho phòng riêng.
  - Nút GAME MODE chuyển vòng qua: Random → 7 mode gốc → Push the Fridge → Defend the Fridge.
  - Dòng tiêu đề hiện luật của mode đang chọn.
  - Nút ARENA bị ẩn: Quick Play bốc map như bản gốc.
  - Chỗ nút BOT DIFFICULTY thành nút BATTLE!.
  - Nút Back quay về menu.
- Lựa chọn được nhớ trong `localStorage` `fg-mode-choice`.
  - **Random** giữ nguyên lần bốc bài của bản gốc.
  - Mode cụ thể thì xếp lại chỗ ngồi theo luật của mode đó (`js/game/modes.js` `applyMode`, dùng chung với `?mode=`).
- Nhiệm vụ tuần vẫn chơi mode của nhiệm vụ, không qua bộ chọn.
- Online: phòng Quick Play tách theo lựa chọn. Field `N1` của Lobby là `bracket + 10 × choice`, nên người chọn Push the Fridge chỉ gặp người cũng chọn Push the Fridge.
- Chưa làm: thêm 2 mode mới vào cấu hình phòng riêng (party). Phần đó cần sửa `MetaService._pickMode`, mà meta đang phải khớp từng byte với bản C#.

## 6. Kiểm

| Lệnh | Nội dung |
|---|---|
| `node test/food-gang-modes.js --node` | luật đẩy và giằng co, vạch đích, phân thắng khi hết giờ; tủ chỉ mất máu vì đội công; vỡ tủ thì đội công thắng; 18+18 trận bot không NaN và cả hai bên đều có thắng; codec |
| `node test/food-gang-modes.js --browser` | bộ chọn có 10 lựa chọn kèm dòng luật; Back; Push the Fridge vào đúng trận; nhớ lựa chọn; Defend the Fridge chạy x4 tới hết; Random ra mode gốc |
| `node test/food-gang-sim.js --skip-unit --skip-trace` | 4 mục tiêu gốc: bảng 200 trận không đổi |
