# Blockade Z

Game bắn zombie góc nhìn thứ nhất, kiểu khối pixel, chạy bằng three.js r160. Không có file ảnh, model hay âm thanh nào: texture vẽ bằng canvas, nhà cửa ghép từ khối hộp, zombie là các khối có khớp, tiếng súng và tiếng zombie tổng hợp từ noise. Làm theo skill `procedural-web-game` (cách Fable 5.2 dựng Saltline), còn phần nhìn học theo nguyên tắc của Pixel Gun 3D: texture phẳng màu, súng to ghép từ nhiều khối nhỏ, đêm có sương với các vùng đèn ấm.

## Cấu trúc

- `js/boot.js` nạp three.js và gán `window.THREE`. Các module sau chạy theo thứ tự thẻ `<script type="module">` trong `index.html`.
- `js/core.js` chứa RNG có seed (mulberry32), event bus, lò xo, các mức chất lượng, và phần lưu cài đặt.
- `js/art.js` vẽ texture pixel và có `BZ.Builder` gộp mọi khối cùng material thành một mesh.
- `js/world.js` giữ bảng bố cục thị trấn, va chạm AABB, lưới đi cho zombie (flow field BFS) và raycast.
- `js/zombies.js`, `js/weapons.js`, `js/player.js`, `js/fx.js`, `js/audio.js` và `js/ui.js` là các hệ thống còn lại.
- `js/main.js` lo khởi động, máy trạng thái (`title → playing ⇄ paused/shop → dead`), các đợt zombie, kinh tế và vòng lặp chính.

## Vũ khí và gore

- Người chơi cầm tối đa 2 món (`S.inv` trong `js/weapons.js`, khởi đầu SMG + katana). Mua món thứ ba thì món đang cầm rơi xuống đất. `X` bỏ món đang cầm, `E` nhặt món dưới chân.
- Vũ khí dưới đất (`ground` trong `js/weapons.js`) nằm đó tới hết ván. Trần 60 món để máy yếu không nghẽn; quá trần thì món cũ nhất chưa ai nhắm tới biến mất.
- Lính thuê tự đi nhặt vũ khí trong bán kính 14 m quanh mình (không xa người chơi quá 20 m) rồi dùng luôn, kể cả bazooka và đồ cận chiến. Lính chết hay hết đạn thì vũ khí rơi lại xuống đất.
- Cận chiến (katana, rìu, kiếm ánh sáng) là bảng `KF` các tư thế khoá, mỗi nhát có ba đoạn: lấy đà, chém, thu về. Nhát chém trúng thì cả thế giới đứng hình vài khung (`G.hitStop`), riêng camera vẫn xoay.
- Gore ở `js/fx.js` (`gib`, `chunks`, `splat`, `spurt`) và `sever` / `burstHead` / `blowApart` trong `js/zombies.js`. Tay, chân, đầu rời ra thành khối riêng, văng, nảy rồi nằm phẳng trên đất; mất chân thì zombie bò. Kiếm ánh sáng cắt thì vết cắt cháy cam, không chảy máu.

## Nhân vật

`js/heroes.js` có 7 nhân vật tự nghĩ (không lấy từ game nào): Gió (lướt, 3 lượt), Thép (bất tử 5 giây, 150 máu), Y Tá (hồi máu, tự hồi khi không trúng đòn), Mưa Đạn (bão đạn: bắn nhanh gấp đôi, không tốn đạn, toả đạn lạc), Bóng (dịch chuyển để lại bóng mồi; chạy trên tường, chạy lên tường, đạp tường, nhảy hai lần), Pháo Thủ (không kích 6 quả pháo, bom to hơn) và Băng (đóng băng 9 m, xác đóng băng vỡ vụn). Bấm `F` hoặc nút tròn trên HUD để dùng kỹ năng. Màn chọn nhân vật dựng 7 người đứng thành hàng giữa quảng trường; `?select=1` mở thẳng màn này, `?hero=<id>` chọn sẵn nhân vật khi `?autostart=1`.

## Ngày đêm, thời tiết, vụ nổ

- `js/sky.js` giữ một đồng hồ chạy 8 phút cho một ngày: mặt trời mọc và lặn, ban đêm có mặt trăng và sao, đèn đường với cửa sổ sáng chỉ bật khi tối. Ban đêm zombie nhanh hơn 15%. `?tod=0.5` (0 = nửa đêm, 0.5 = trưa) và `?daylen=<giây>` dùng khi thử.
- Đầu mỗi đợt tung ra một kiểu thời tiết, kiểu nào cũng có luật riêng: mưa (zombie chậm 10%), bão sét (sét đánh zombie), sương mù (xu gấp rưỡi), tuyết (zombie chậm 20%), trăng máu chỉ ra ban đêm (zombie trâu hơn, xu gấp đôi), gió tro (đạn lệch), mưa sao băng (thiên thạch nổ, có vòng đỏ báo trước). `?weather=<id>` ép một kiểu.
- Vụ nổ ở `fx.explosion`: chớp sáng, quả cầu lửa, vòng sóng xung kích trên đất, tàn lửa, gạch đá văng, khói đứng lại vài giây, vết cháy, màn hình loé trắng khi nổ gần. Lửa và khói là hai `InstancedMesh` billboard (một lớp cộng sáng, một lớp alpha), nên mỗi lớp chỉ tốn một draw call.

## Chơi cùng bạn (co-op)

- Màn đầu có nút **Chơi cùng bạn**: tạo phòng (ra mã 6 ký tự), vào bằng mã, hoặc chọn trong danh sách phòng đang mở. Tối đa 4 người. Người vào sau chọn nhân vật rồi nhảy thẳng vào trận đang đánh.
- Mạng là Unity Relay gọi bằng JS thuần, chép từ `games/mini-mart-coop/js/net/` sang `js/net/`. `relay.js` giữ nguyên; `ugs.js` và `room.js` đổi nhãn phòng sang `blockadez` ở index S5, nên danh sách phòng không lẫn với Boo Haul hay Mini Mart Together.
- `js/coop.js`: chủ phòng giữ zombie, đợt, thời tiết, vũ khí dưới đất và lính thuê, gửi ảnh chụp trạng thái 15 lần mỗi giây kèm sự kiện (zombie chết với kiểu gore đã chọn, đứt chi, vụ nổ, sét, thiên thạch, vũ khí rơi và được nhặt, thông báo đợt). Người vào sau tự đi và tự bắn trên máy mình, tự thử trúng zombie mình thấy, rồi gửi phát trúng lên chủ phòng. Xu và điểm thuộc về người ra đòn kết liễu. Zombie đuổi người sống gần nhất. Gục thì chờ hồi sinh ở đợt sau; cả phòng gục thì hết trận.
- `?fakenet=1` thay Relay bằng `BroadcastChannel` để hai tab cùng trình duyệt chơi với nhau khi không có mạng (dùng cho test).
- Còn hở: bóng mồi của nhân vật Bóng chỉ nhử được zombie khi chủ phòng là Bóng; tên lửa đang bay và quả bom đang lăn của người khác không hiện, chỉ thấy vụ nổ; chủ phòng rời thì phòng đóng (chưa chuyển chủ).

## Kiểm

```
PLAYWRIGHT_PATH=<thư mục playwright-core> node games/blockade-z/tools/smoke.js <thư mục ảnh>
PLAYWRIGHT_PATH=<thư mục playwright-core> [FAKE=0] node games/blockade-z/tools/coop-test.js <thư mục ảnh>
PLAYWRIGHT_PATH=<thư mục playwright-core> node games/blockade-z/tools/shots.js <thư mục ảnh>
```

`smoke.js` dùng Chrome thật: một bot tự ngắm và đánh hết đợt 1, mua shotgun, kiểm bắn vỡ đầu, chém katana, rụng chân thành zombie bò, nổ nát xác, bỏ và nhặt vũ khí, lính nhặt bazooka rồi bắn, và kiểm không có lỗi console. `shots.js` chụp cận zombie, từng khẩu súng, màn title và màn điện thoại để duyệt hình.

Tham số URL dùng khi thử:

- `?autostart=1` vào thẳng trận.
- `?nolock=1` tắt pointer lock.
- `?god=1` cho bất tử.
- `?wave=N` bắt đầu từ đợt N.
- `?coins=N` cho sẵn N xu.
- `?q=low|medium|high` chọn mức đồ hoạ.
- `?noaudio=1` tắt âm thanh.

Trong trang có sẵn `window.__G`, `__sim(giây)`, `__setShot(tên)`, `__stats` và `__errors`.

Đổi mã thì tăng `?v=` của mọi thẻ script trong `index.html`, cùng `rev` của thẻ trong `data/games.js`.
