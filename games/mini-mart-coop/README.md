# My Mini Mart Together (bản co-op)

Bản chơi chung của My Mini Mart, tối đa 4 người một cửa hàng, nối qua Unity Relay. Menu theo kiểu Supermarket Together: Cửa hàng mới, Tải cửa hàng, Vào cửa hàng, Tùy chọn. Chủ dự án giao ngày 2026-10-28, yêu cầu không đè lên bản solo và phải tải nhanh trên web.

- Chạy: mở `index.html`. Tham số: `?bot` cho máy tự chơi (để kiểm), `?nobg` bỏ cửa hàng chạy nền sau menu.
- Bản solo nằm ở `games/casual-farm` và không bị sửa. Bản này import thẳng module, dữ liệu và art của bản solo qua `../casual-farm/`, nên không chép lại 40 MB art.

## Vì sao làm thế này

- **Không dùng Unity runtime.** "Relay Unity" ở đây là dịch vụ Unity Relay (Unity Gaming Services), nói chuyện bằng REST và WebSocket từ JS thuần. Trang menu chỉ tải khoảng 45 KB JS và CSS rồi hiện ngay; three.js và cửa hàng 3D tải sau, mờ rồi rõ như bản solo. [ĐO TRONG REPO] menu hiện sau 139 đến 216 ms trong `test/mini-mart-coop-play.js`.
- **Cùng project UGS với Boo Haul** (`D:\REPO_Meta`, project `9d277ff8-6780-4d2e-99c5-624374fee3ef`, org `poke5121999`). Danh sách phòng của Boo Haul chỉ đọc phòng có field `joinCode` và chỉ dùng index S1 đến S4. Phòng mini mart cất mã relay ở field `relay` (chỉ thành viên đọc được) và gắn `game = minimart` ở index S5, nên hai game không thấy phòng của nhau.
- **Host giữ luật chơi.** Máy chủ phòng chạy `CoopSim` (Sim của bản solo cộng thêm người chơi). Khách tự đi trên máy mình (không trễ khi bấm) và gửi vị trí 15 lần mỗi giây. Host gửi phần trạng thái vừa đổi 10 lần mỗi giây. Ví chung một túi như Supermarket Together; mỗi người có chồng hàng riêng.

## Bố cục

- `js/boot.js` là điểm vào: dựng menu, cửa hàng chạy nền, tạo hoặc vào phòng, thanh dưới cùng (tên, mã phòng, ai đang ở trong, nút rời).
- `js/menu.js`, `css/menu.css` là menu kiểu Supermarket Together: tên cửa hàng, Riêng tư / Công khai, độ khó 0 đến 5 (mỗi bậc ô mua đắt thêm 50 %), bản đồ chọn vùng relay, danh sách 14 mart làm "Bố cục".
- `js/game.js` dựng một cửa hàng từ module của bản solo. Host có đủ phần meta của bản solo (bản đồ mart 3D, tiền lúc vắng, prestige, shop, vòng quay, rolling offer, xe van sang mart kế) chạy trên hồ sơ của cửa hàng co-op thay cho save solo. Mọi người có màn Customise riêng.
- Hồ sơ cửa hàng: `localStorage` `mmc-store-<id>` = "global" của bản solo cộng `marts: { id: save của sim }`. Đăng nhập hub thì `js/cloud.js` đẩy lên `game_saves` (`game_id` = `mini-mart-coop`), gộp theo từng cửa hàng, bản mới hơn thắng, các cửa hàng chơi gần nhất lên trước cho vừa trần 100 KB.
- Chuyển mart: xe van, nút GO trên bản đồ, prestige đều gọi `travel(id)` trong `boot.js`. Host lưu mart cũ, dựng mart mới, `HostNet.rebind` đưa mọi khách sang sim mới, khách nhận welcome mới rồi tự dựng lại mart. Mỗi khách giữ nguyên mã người chơi (`p1`...) và bộ đồ.
- Tủ đồ: `mmc-wardrobe`, lần đầu chép từ tủ đồ của bản solo (`mmm-global-v1.cosmetics`). Đồ mua bằng tiền chung; đồ trả vàng dùng vàng prestige của cửa hàng. Kỹ năng tốc độ của đồ là của từng người, kỹ năng toàn cửa hàng (máy, doanh thu) là của host.
- `js/coopsim.js`:
  - `CoopSim` là Sim của bản solo có thêm `state.remotes`. Người chơi khác bước qua đúng code của người chơi solo bằng cách tráo field `player`, `carry`, `acc`, `drain`, `upgrade`.
  - `MirrorSim` là bản sao trên máy khách, nhận trạng thái của host qua `adopt()`.
- `js/remotes.js` vẽ người chơi khác: bản sao rig người chơi mặc đúng đồ, mũ, thú cưng của người đó (`Looks` của bản solo), chồng hàng, nhãn tên, hàng và tiền bay.
- `js/net/`:
  - `ugs.js` gọi REST của Authentication (ẩn danh), Lobby và Relay.
  - `relay.js` là giao thức tin Relay trên WebSocket, chép theo từng byte từ `com.unity.transport` (`Runtime/Relay/Messages/*.cs`, `RelayServerData.ComputeBindHMAC`).
  - `room.js` lo vòng đời phòng: tạo, heartbeat Lobby 15 s, vào, rời.
  - `session.js` chứa `HostNet` / `GuestNet` (tin JSON cắt khung 1100 byte), `memoryPair()` cho test.
  - `mirror.js` lo diff/patch của trạng thái.
- `tools/stamp.js <rev>` ghi lại import map (module của bản này lẫn của bản solo) với `?v=<rev>`. Chạy mỗi lần tăng `rev` trong `data/games.js`.

## Kiểm

Chạy bên máy `linux` khi PC bận (xem bộ nhớ dự án). Ba bộ:

- `node test/mini-mart-coop-relay.js` gọi UGS thật: đăng nhập ẩn danh hai người, Lobby, Relay, 20 lần dội tin. [ĐO TRONG REPO] RTT p50 60 ms qua `asia-southeast1` từ Việt Nam.
- `node test/mini-mart-coop-sim.js` (`MMC_MINUTES=20`) cho host và khách cùng chơi bằng bot của bản solo qua kết nối trong bộ nhớ. [ĐO TRONG REPO] 20 phút mô phỏng mở 33/40 ô (bản solo một người 23/40), bản của khách khớp host, 7,4 KB/s mỗi khách. Sau đó kiểm bộ đồ của khách tới host, thú cưng chỉ cộng sức mang cho chính người đó, và cả phòng sang Store 2 (`HostNet.rebind`) mà khách giữ mã người chơi, tiền chung và bộ đồ. In số lần trộm bị bắt (25 phút: 3 lần, 1 do khách) và byte theo từng phần trạng thái; khách hàng trong cửa hàng tốn nhiều nhất.
- `node test/mini-mart-coop-play.js` mở hai trình duyệt thật qua Relay thật. A tạo phòng công khai, B tìm thấy trong Vào cửa hàng rồi vào, hai bên chơi bằng bot. Rồi B đổi mũ và A thấy, A đưa cả phòng sang Store 2, socket relay của B bị đóng và B tự nối lại, cuối cùng B rời. Cần `PLAYWRIGHT=<đường dẫn playwright>`; thêm `MMC_URL=<Pages>` để kiểm bản trên mạng.

## Bẫy đã sập

- `[BẪY ĐÃ SẬP]` Hai bot kẹt ở quầy, cửa hàng đứng ở 3/40 ô. `zones()` của host chạy đầu mỗi tick và ghi lại `cashiers[].playerOn`, rồi hệ khách hàng mới đọc cờ ấy. Nếu người chơi khác bước sau `Sim.step`, khách đứng quầy không bao giờ được tính, còn bot host đọc cờ cũ và tưởng đã tới quầy. Người chơi khác phải bước trong `stepNextMart`, tức là sau host và trước các hệ.
- `[BẪY ĐÃ SẬP]` Relay không chuyển tin DISCONNECT của khách sang host. Host coi khách đã rời khi nhận `bye` hoặc khi 8 s không nghe gì, rồi tự xoá ghế Lobby của khách (`room.free`).
- `[BẪY ĐÃ SẬP]` Hai tab cùng trình duyệt dùng chung phiên UGS thì tab thứ hai không vào được phòng của tab đầu, vì cùng một player id. Phiên UGS giữ trong `sessionStorage` (riêng mỗi tab).
- `[BẪY ĐÃ SẬP]` `Hud` dựng lại toàn bộ `#hud` khi được tạo, nên lớp nhãn tên phải gắn sau `Hud`.
- `[BẪY ĐÃ SẬP]` Lệnh của khách (nâng cấp, mua đồ) tới đúng lúc host đang nạp mart mới thì `session.game` đang rỗng và trang host ném lỗi. Giữa hai mart, lệnh bị bỏ.
- `[BẪY ĐÃ SẬP]` Canvas không xin được WebGL lần hai sau `forceContextLoss`; mỗi lần vào mart `enterStore` thay `#game` bằng canvas mới.
- `[BẪY ĐÃ SẬP]` Nút bản đồ và nút đồ của host theo luật solo `featuresOn` (`hud.js`): chỉ hiện sau hướng dẫn Store 1 hoặc khi đã tới mart thứ hai. Test kiểm sau khi sang Store 2.
- `[BẪY ĐÃ SẬP]` Sửa file bằng `String.replace` trong `node -e`: chuỗi thay thế chứa `$'` là mẫu đặc biệt ("phần sau chỗ khớp"), làm `mirror.js` bị chép thừa nửa file. Dùng `split(a).join(b)` hoặc công cụ Edit.

## Còn hở

- Bản này dựa vào bên trong `Sim` của bản solo (`stepNextMart`, `zones`, `stepCarry`, `stepMoney`, field `player`/`carry`/`acc`/`drain`/`upgrade`, `petCarry`) và hằng số của `thief.js` (`CATCH_R`, `FREEZE`, chép vào `coopsim.js`). Bản solo đổi những chỗ đó thì chạy lại `test/mini-mart-coop-sim.js`.
- Host rời thì cửa hàng đóng (khách về menu, tiến độ nằm ở hồ sơ của host). Chưa có chuyển host.
- Khách rớt mạng thì tự nối lại tối đa 3 lần vào đúng allocation cũ, nhưng vào như người mới: hàng đang cầm mất, host thấy người cũ hết hạn sau 8 s.
- Trộm chỉ sinh khi host đứng xa quầy (luật solo chỉ xét `state.player`); khách bắt trộm được.
- Băng thông mỗi khách 3–8 KB/s chưa nén; nén deflate là bước sau nếu tốn tiền relay.
