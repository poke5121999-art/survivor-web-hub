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

`js/heroes.js` có 11 nhân vật tự nghĩ. Bộ kỹ năng theo khuôn của game bắn súng anh hùng (Overwatch, Marvel Rivals): một nội tại, hai kỹ năng hồi chiêu (`F`, `C`) và một chiêu tối thượng (`Q`). Tối thượng nạp bằng sát thương gây ra (Y Tá nạp cả bằng lượng máu hồi), mỗi giây tự nạp một ít, và nạp nhanh hơn với nâng cấp Tối thượng. Nhân vật và tên đều là của mình, không lấy từ game nào.

| Nhân vật | F | C | Q (tối thượng) |
|---|---|---|---|
| Gió | Lướt (3 lượt) | Lốc xoáy hất tung | Trảm Phong: chém liền qua 10 con |
| Thép | Khiên vàng bất tử | Húc 10 m | Động Đất |
| Y Tá | Hồi máu | Phi tiêu độc | Hồi Sinh cả đội, kéo người gục dậy |
| Mưa Đạn | Bão đạn | Lựu đạn chùm | Mưa Thép: hai súng vai tự bắn |
| Bóng | Bước bóng + bóng mồi | Phi tiêu xuyên | Ám Sát: tàng hình, gây gấp 2,5 |
| Pháo Thủ | Không kích | Mìn dính | Mưa Pháo 30 m |
| Băng | Sóng băng | Mũi băng xuyên | Kỷ Băng Hà |
| Hoả | Bom xăng | Phản lực (nhảy nổ) | Hoả Long phun lửa |
| Sấm | Cầu sét | Lôi phạt | Thiên Lôi |
| Độc | Mây độc | Hút sinh | Đại Dịch |
| Kỹ Sư | Dựng tháp (2 lượt) | Giáp khẩn | Pháo Đài: khẩu pháo bắn tên lửa |

Mỗi kỹ năng chạy trên máy người dùng nó: hình, tác động lên chính người đó, và sát thương qua `G.zombies.damage` (sát thương của người vào sau tự đi tới chủ phòng). Người khác thấy kỹ năng qua sự kiện `hx`. Phần chỉ chủ phòng được đổi (đóng băng, dựng tháp, kéo đòn không kích, tàng hình với zombie) nằm trong `host` của kỹ năng. Mọi độ trễ trong kỹ năng tính theo giờ trong game (`later`), không dùng `setTimeout`, nên dừng game hay `__sim` vẫn đúng.

Màn chọn nhân vật dựng 11 người đứng thành hàng giữa quảng trường. `?select=1` mở thẳng màn này, còn `?hero=<id>` chọn sẵn nhân vật khi đi kèm `?autostart=1`.

## Zombie đặc biệt, quái và tinh anh

`js/zkinds.js` thêm loại mới vào `BZ.ZOMBIES`. Mỗi loại có `kind` chọn hành vi, `parts` là mảnh gắn thêm lên thân dùng chung (túi axit, bụng phình, khiên, giáp, tóc), và `rig` thay cả thân (nhện, trứng). Mỗi loại đặc biệt xuất hiện lần đầu thì hiện băng rôn kèm cách khắc chế.

| Loại | Từ đợt | Luật |
|---|---|---|
| Kẻ Phun | 3 | đứng xa 4–17 m phun axit theo đường cong; vũng axit đốt máu và làm chậm |
| Chó Xác | 3 | chạy bốn chân theo đàn 3–5 con, vồ từ 2,5–6 m |
| Kẻ Phình | 4 | áp sát thì phình 0,9 giây rồi nổ; bị bắn chết cũng nổ, nổ lây sang con phình bên cạnh, để lại vũng axit |
| Kẻ Khiên | 5 | khiên chặn mọi phát bắn từ phía trước (hiện chữ CHẶN), trừ đầu và vụ nổ; rìu phá khiên nhanh gấp 2,5 |
| Kẻ Thét | 5 | dừng lại thét: zombie trong 11 m cuồng lên 6 giây (nhanh hơn, đánh dồn), gọi thêm 2 zombie chạy |
| Kẻ Giáp | 6 | giáp chỉ cho 30% sát thương qua cho tới khi vỡ; chân không có giáp; lửa và độc đốt xuyên giáp |
| Nhện Độc | 6 | bầy 4–6 con nhỏ, vồ ngắn, cắn làm chậm |
| Xác Cháy | 7 | miễn lửa, ăn băng gấp đôi; đi để lại vệt lửa; chết thì nổ cháy, châm lửa đám xung quanh |
| Xác Băng | 8 | miễn băng, sợ lửa; cắn làm chậm; chết thì nổ băng, đóng băng đám xung quanh (bắn điện vào là vỡ vụn) |
| Nhện Chúa (boss) | đợt boss | bắn tơ trói chân, đẻ trứng (trứng nở 3 nhện nếu không phá kịp), vồ xa |

Tinh anh (`BZ.ELITE`) từ đợt 3, tỉ lệ `1,5% × số đợt` tối đa 12%: Nhanh, Trâu, Tự hồi (lửa hoặc độc chặn hồi), Bùng nổ (chết thì nổ), Hút máu, Cuồng (dưới nửa máu). Tinh anh có hào quang, viên đá màu xoay trên đầu, thanh máu vàng, rơi súng 35% và trả xu, điểm gấp ba.

Co-op: hàng trạng thái của zombie mang thêm cờ 256 khiên, 512 giáp, 1024 cuồng, 2048 đang ra chiêu, và cột thứ 9 là tinh anh. Đạn axit, tơ, vũng nguy hiểm, tiếng thét, nổ băng đi qua sự kiện `zk`. Chậm và trói chân đến máy người vào sau cùng tin nhắn `hurt`.

## Shop nâng cấp và đường build

- Shop (`B` hoặc giữa hai đợt) chỉ bán nâng cấp chỉ số, không bán súng. `js/build.js` giữ bảng `UP` gồm 25 nâng cấp chia 5 nhóm: Hoả lực (sát thương, chí mạng, tốc bắn, nạp đạn, băng đạn, cận chiến), Sinh tồn (máu, hồi máu, giáp, tốc chạy, hút xu), Kỹ năng (hồi chiêu, sức mạnh chiêu, nạp tối thượng), Nguyên tố và Hỗ trợ. Giá tăng theo cấp (`base·grow^lv`).
- Nguyên tố là hiệu ứng gắn lên zombie khi bắn trúng: lửa cháy theo thời gian, băng chồng 4 lớp thì đóng băng, điện nhảy sang con bên cạnh (mưa bão nhảy xa hơn), độc rỉ máu. Hai hiệu ứng gặp nhau thì phản ứng: nổ hơi (lửa + băng), vỡ vụn (điện vào zombie đang đóng băng), nổ khí độc (lửa + độc), lan độc (điện + độc). Hút máu và nổ xác là hai nhánh còn lại.
- Hai nhóm đủ cấp thì mở cộng hưởng (`RES`, 10 cái), ví dụ Siêu dẫn (băng + điện), Pháo đài (kỹ sư + giáp), Bất tử (hồi máu + giáp: gục một lần mỗi đợt thì đứng dậy).
- Lính thuê, tháp súng, bom và jetpack không còn mua lẻ mà là nhánh Hỗ trợ: Chỉ huy thuê lính mỗi đợt, Kỹ sư dựng tháp quanh người chơi đầu đợt, Bom nâng số bom mang được, Jetpack mở ba lô bay.
- Mỗi nhân vật có sẵn vài cấp miễn phí ở nhánh hợp mình (`AFFINITY`): Gió tốc chạy, Thép giáp, Băng nguyên tố băng…
- Súng có từ zombie rơi (boss chắc chắn, zombie tinh anh 35%, zombie to 20%, thường 2,5%) và từ thùng tiếp tế thả dù sau mỗi đợt, vỡ ra 2 súng cùng đạn và máu.
- Co-op: phản ứng do hai người khác nhau gây ra là **phối hợp**, nổ mạnh gấp rưỡi và hiện chữ PHỐI HỢP. Hiệu ứng nguyên tố đi trong ảnh chụp trạng thái dưới dạng cờ bit, phát trúng của khách mang theo nguyên tố của họ.

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
PLAYWRIGHT_PATH=<thư mục playwright-core> node games/blockade-z/tools/zoo.js <thư mục ảnh>
PLAYWRIGHT_PATH=<thư mục playwright-core> node games/blockade-z/tools/kits.js <thư mục ảnh>
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
