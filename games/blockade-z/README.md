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

## Kiểm

```
PLAYWRIGHT_PATH=<thư mục playwright-core> node games/blockade-z/tools/smoke.js <thư mục ảnh>
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
