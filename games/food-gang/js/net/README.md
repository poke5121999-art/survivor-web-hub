# Food Gang online (`js/net`)

Chơi mạng thật cho bản web: ghép trận nhanh với người thật (hết giờ thì bot lấp chỗ trống như bản gốc) và trận riêng bằng mã phòng. Đi qua Unity Lobby + Relay bằng JS thuần, host giữ luật: trình duyệt host chạy sim JS, khách gửi phím và vẽ lại ảnh trạng thái host gửi về.

- Menu dùng `online.js` (`Online.available / quickMatch / createPrivate / joinPrivate`, hợp đồng ở đầu file). Sự kiện `start` trả `{request, runnerOptions}`; đưa thẳng vào `MatchScene.load(request, { runnerOptions })`.
- Trang dev: `net.html` (tham số ở đầu `dev.js`). Một trang là một người; `?render=game` dùng màn trận thật, mặc định là hình 2D để thử nhanh.
- Kiểm: `node test/food-gang-net.js` (phần A chạy trong node qua kênh BroadcastChannel, phần B mở Chromium thật qua Relay thật). `FG_A_NET=ugs` cho phần A đi qua Relay thật; `FG_NET=loop` cho phần B khỏi cần UGS.

## Bố cục

- `relay.js` chép từ `games/mini-mart-coop/js/net/relay.js` (giao thức tin Relay từng byte). `ugs.js` chỉnh từ bản mini mart: cùng project UGS với Boo Haul và mini mart, phòng Food Gang gắn `S5 = foodgang`, `N1` = bậc cấp skin, `N2` = phiên bản giao thức.
- `transport.js`: `ugsBackend()` (Lobby + Relay), `loopBackend()` (BroadcastChannel, cho test và hai tab cùng trình duyệt), `lossy()` (trễ, dao động, rớt gói để thử mạng xấu).
- `codec.js`: định dạng nhị phân. `hostnet.js`: phía host. `clientnet.js` + `game/match/ClientRunner.js`: phía khách. `devplayer.js`: một người chơi không có màn hình trận (test node và `net.html`).
- `MatchRunner` chỉ thêm móc `onStep`; `MatchScene.load` nhận `opts.runnerOptions` (3 dòng) và lấy `isOffline` từ `req.isOffline`.

## Giao thức

- Mọi gói bắt đầu bằng một byte loại. `CTRL` là JSON cắt khung 1100 byte (sảnh, `start`, keepalive 1 s). `INPUT` và `SNAP` là số nguyên varint.
- Khách → host: lấy phím 60 lần mỗi giây, gửi 30 gói mỗi giây (gửi ngay khi bấm nút hoặc đổi hướng), mỗi gói mang 8 khung gần nhất (rớt tới 3 gói liền vẫn đủ) cùng số thứ tự ảnh đã nhận.
- Host: mỗi khách một hàng đợi khung. Thiếu khung thì giữ phím cũ, hụt lỗ thì nhảy qua. Mỗi 2 giây bỏ các khung thừa (độ sâu nhỏ nhất trừ 1) để trễ không dồn lên. Quá 8 khung thì cắt còn 3.
- Host → khách: 30 ảnh mỗi giây. Mỗi thực thể (toàn cục, 4 agent, đạn) là một vector số đã lượng tử (vị trí 1/256, máu 1/16, đồng hồ 1/60 s). Gói ghi mặt nạ trường đổi cộng hiệu so với ảnh khách đã báo nhận. Chưa có ảnh gốc thì gửi đủ. Sự kiện sim gửi kèm mọi ảnh cho tới khi khách báo nhận ảnh chứa nó; khách bỏ bản trùng theo số thứ tự.
- Khách chạy `Match.create` với cùng setup, nên skin, đội, slot, chiêu lấy từ đó, không đi trên dây. Phần còn lại lấy từ ảnh, phát lại chậm sau đồng hồ host ít nhất 100 ms (thêm 4 lần dao động đo được) và nội suy giữa hai ảnh. Sự kiện được phát khi đồng hồ phát lại qua tick của nó.
- Agent của chính mình vẽ từ ảnh mới nhất, chỉ chậm 3 tick (`ownLead`, tắt bằng `&lead=0`). Không đoán trước (prediction): khách không có trạng thái bot và RNG của host.
- Người rời (`bye`, hoặc im 3 s trong trận, 8 s ở sảnh): host gọi `match.convertToBot` (GAMEPLAY §5.4), trận chạy tiếp. Host rời: khách chốt trận thành hòa trên ảnh cuối, phát `GameOverTriggered`, rồi phiên đóng với `host-left`. Không chuyển host được, vì khách không có trạng thái đầy đủ.
- Hết trận: sim ngừng bước quá 150 ms (màn trận đã đóng, trang bị nghẽn) thì host gửi lại ảnh cuối kèm các sự kiện khách chưa báo nhận, 100 ms một lần (`HostMatchNet.flushIdle`). Khách gửi gói INPUT rỗng chỉ để báo nhận khi không còn phím nào để gửi (`ClientMatchNet.ackNow`). `session.leave()` của host chờ mọi khách báo nhận hết sự kiện, tối đa 4 s (`LINGER`), rồi mới gửi `bye` và đóng Relay.
- Tab bị ẩn: `driver.js` mở một worker tick 16 ms. Timer của worker không bị trình duyệt làm chậm như timer của luồng chính. Khi `document.hidden`, worker gọi `runner.update()` thay cho vòng `requestAnimationFrame` của engine đã dừng. Host chạy `MatchRunner.wallClock` (lấy thời gian từ `performance.now()`), `ClientRunner` cũng vậy, nên engine và worker cùng gọi `update()` cũng không bước trùng một khoảng thời gian.

## Luật ghép trận (META §12–13)

- Ghép nhanh lọc theo bậc `clamp((cấp skin − 1) / 5, 0, 3)`, đúng điều kiện phòng của `QuantumMatchmaker.StartOnlineAsync` (bản gốc không lọc theo cúp). Phòng khóa ở giây 9, vào trận ở giây 10, đủ 4 người thì nhảy tới giây 9. Hết giờ mà vẫn một mình thì đánh offline với bot (`runnerOptions = null`). Khách chờ quá 20 s không thấy `start` thì bỏ.
- Hai người cùng không tìm thấy phòng sẽ mỗi người tạo một phòng. Host đang một mình hỏi lại mỗi 3 s; thấy phòng cũ hơn thì gộp vào đó.
- Slot theo `slotRemap(seed)` và thứ tự vào phòng. Bot giữ cấp và độ hung tính theo host.
- Trận riêng: mã phòng là mã Lobby, 6 ký tự (Lobby trả `400 16010` cho ký tự lạ như `Z`). Cấu hình là `CustomMatchOptions`. Bot lấy cấp trung bình của phòng (`_botLevelsAndAggros`). Trận bắt đầu khi có từ 2 người và ai cũng đã `setReady()`; `setReady` của host thay cho nút Launch.

## Số đo `[ĐO TRONG REPO]` (2026-10-31, `asia-southeast1`, từ Việt Nam, PC văn phòng đang tải)

- Ảnh trạng thái: đủ ~160–270 B, hiệu ~70–110 B. Băng thông mỗi khách, tính cả đầu tin Relay 38 B: xuống 3,3–5,5 KB/s, lên ~2,0 KB/s.
- RTT qua Relay p50 55 ms. Từ lúc bấm tới lúc host nhận (`inputAck`, gồm cả đường về) p50 ~100–110 ms. Khách thấy agent của mình phản ứng (`inputVisible`) p50 ~160 ms; tắt `ownLead` thì ~220 ms.
- Rớt 10 % gói, trễ một chiều 80 + U(0,120) ms: vẫn chơi được tới hết. Thời gian phát lại tự giãn lên ~150 ms, cuối trận điểm và máu khớp host.
- Khách tắt ngang thì sau ~3,3 s agent của khách thành bot.

## Bẫy đã sập

- `[BẪY ĐÃ SẬP]` Phòng ghép nhanh đóng bằng `room.close()` lúc vào trận, kéo theo đóng luôn link Relay. Giờ chỉ gỡ dòng Lobby (`room.unlist()`), link giữ tới hết trận.
- `[BẪY ĐÃ SẬP]` `setReady()` gọi trong handler `lobby` đầu tiên của host chạy trước khi `session.role` có giá trị, nên bị mất. Giờ trạng thái sẵn sàng nằm ở phiên (`wantReady`).
- `[BẪY ĐÃ SẬP]` Trận riêng 4 người: người thứ hai vừa sẵn sàng là host bắt đầu ngay với 2 người, người thứ ba bị đá `started`. Trang dev và test cho host chỉ sẵn sàng khi phòng đã đủ `&players=N`.
- `[BẪY ĐÃ SẬP]` Đo bằng `dx` của host không đáng tin: agent bị đẩy lùi hoặc hồi sinh. Test kiểm `directionX` của agent trên host, là phím của khách.
- `[BẪY ĐÃ SẬP]` Trang host bị ẩn (tab nền) thì `requestAnimationFrame` dừng, trận đứng theo. `[ĐO TRONG REPO]` Không có driver: ẩn 6 s chỉ chạy được 1 tick, khách nhận 0 ảnh mỗi giây. Có driver: 364 tick trong 6,1 s, 30–31 ảnh mỗi giây, khách không phải đứng hình. Chromium headless không bao giờ ẩn trang (đã thử tab khác lên trước, thu nhỏ cửa sổ qua CDP, Emulation focus), nên `B/hidden` giả lập ngay trong trang: `document.hidden`, chặn rAF, timer luồng chính tối đa 1 lần mỗi giây.
- `[BẪY ĐÃ SẬP]` Test so `lastEvent` của khách với `eventSeq` của host đọc ở một thời điểm khác. Sau GAME OVER host vẫn bước, đạn còn bay vẫn hết hạn và sinh sự kiện, nên trên máy tải nặng con số lệch 728/729. Giờ test so với `eventsThrough(tick của ảnh mới nhất của khách)`, rồi kiểm riêng lúc host rời (dừng sim, `leave`): khách phải có đủ toàn bộ sự kiện.
- `[BẪY ĐÃ SẬP]` Ghép nhanh rút mode từ bộ bài; Kill5 và LastSurvivor không có đồng hồ, nên `&short` không kết thúc được trận và test chờ hết giờ. Trang dev nhận `&mode=` cho cả ghép nhanh, test ghim mode 1 (DM 2v2).
