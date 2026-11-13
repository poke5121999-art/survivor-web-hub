# Blockade Z

Game bắn zombie góc nhìn thứ nhất, kiểu khối pixel, chạy bằng three.js r160. Không có file ảnh, model hay âm thanh nào: texture vẽ bằng canvas, nhà cửa ghép từ khối hộp, zombie là các khối có khớp, tiếng súng và tiếng zombie tổng hợp từ noise. Làm theo skill `procedural-web-game` (cách Fable 5.2 dựng Saltline), còn phần nhìn học theo nguyên tắc của Pixel Gun 3D: texture phẳng màu, súng to ghép từ nhiều khối nhỏ, đêm có sương với các vùng đèn ấm.

## Cấu trúc

- `js/boot.js` nạp three.js và gán `window.THREE`. Các module sau chạy theo thứ tự thẻ `<script type="module">` trong `index.html`.
- `js/core.js` chứa RNG có seed (mulberry32), event bus, lò xo, các mức chất lượng, và phần lưu cài đặt.
- `js/art.js` vẽ texture pixel và có `BZ.Builder` gộp mọi khối cùng material thành một mesh.
- `js/world.js` giữ bảng bố cục thị trấn, va chạm AABB, lưới đi cho zombie (flow field BFS) và raycast.
- `js/zombies.js`, `js/weapons.js`, `js/player.js`, `js/fx.js`, `js/audio.js` và `js/ui.js` là các hệ thống còn lại.
- `js/main.js` lo khởi động, máy trạng thái (`title → select → playing ⇄ paused/pick → dead`), các đợt zombie, màn chọn nâng cấp và vòng lặp chính.

## Vũ khí và gore

- Mỗi nhân vật cầm đúng một vũ khí (`weapon` trong `js/heroes.js`), đạn dự trữ vô hạn. Lính thuê luôn cầm súng carbine của mình.
- Cận chiến (katana, rìu, kiếm ánh sáng) là bảng `KF` các tư thế khoá, mỗi nhát có ba đoạn: lấy đà, chém, thu về. Nhát chém trúng thì cả thế giới đứng hình vài khung (`G.hitStop`), riêng camera vẫn xoay.
- Gore ở `js/fx.js` (`gib`, `chunks`, `splat`, `spurt`) và `sever` / `burstHead` / `blowApart` trong `js/zombies.js`. Tay, chân, đầu rời ra thành khối riêng, văng, nảy rồi nằm phẳng trên đất; mất chân thì zombie bò. Kiếm ánh sáng cắt thì vết cắt cháy cam, không chảy máu.

## Nhân vật

`js/heroes.js` có 13 nhân vật tự nghĩ. Bộ kỹ năng theo khuôn của game bắn súng anh hùng (Overwatch, Marvel Rivals): một nội tại, hai kỹ năng hồi chiêu (`F`, `C`) và một chiêu tối thượng (`Q`). Tối thượng nạp bằng sát thương gây ra (Y Tá nạp cả bằng lượng máu hồi), mỗi giây tự nạp một ít, và nạp nhanh hơn với nâng cấp Tối thượng. Nhân vật và tên đều là của mình, không lấy từ game nào.

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
| Sói | Vồ cắn | Tru gọi bầy | Hoá Sói: thành người sói 12 giây |
| Nhện Đồng | Đu tơ (2 lượt) | Kéo tơ | Lưới Tơ Khổng Lồ |

Mỗi kỹ năng chạy trên máy người dùng nó: hình, tác động lên chính người đó, và sát thương qua `G.zombies.damage` (sát thương của người vào sau tự đi tới chủ phòng). Người khác thấy kỹ năng qua sự kiện `hx`. Phần chỉ chủ phòng được đổi (đóng băng, dựng tháp, kéo đòn không kích, tàng hình với zombie) nằm trong `host` của kỹ năng. Mọi độ trễ trong kỹ năng tính theo giờ trong game (`later`), không dùng `setTimeout`, nên dừng game hay `__sim` vẫn đúng.

Màn chọn nhân vật dựng 13 người đứng thành hàng giữa quảng trường. `?select=1` mở thẳng màn này, còn `?hero=<id>` chọn sẵn nhân vật khi đi kèm `?autostart=1`.

## Vũ khí riêng và cân bằng

Mỗi nhân vật cầm một vũ khí riêng, đạn dự trữ vô hạn. Mỗi món có mô hình ở góc nhìn thứ nhất, mô hình cầm tay ở góc nhìn thứ ba và co-op, và dáng cầm riêng trong `BZ.animHero`.

| Nhân vật | Vũ khí | Đặc điểm |
|---|---|---|
| Gió | katana | chém nhanh ba nhát |
| Thép | kiếm dài | hai tay, nhát vung rộng; nhát thứ ba bổ từ trên xuống ×1,6 |
| Y Tá | súng đôi | hai nòng bắn luân phiên |
| Mưa | minigun | quay nòng 0,4 giây rồi xả 1300 viên/phút; khi bắn đi chậm lại |
| Bóng | phi tiêu | ba ngôi sao xoè quạt, xuyên một con, cắm lại vào tường |
| Pháo Thủ | bazooka | nổ diện rộng |
| Băng | thương | đâm xa 3,9 m, xuyên cả hàng zombie |
| Hoả | nắm đấm | đấm liên hoàn; cú thứ ba là đấm móc ×2,6, hất bay; bộ đồ chống lửa giảm 40% sát thương nhận vào |
| Sấm | phi lao | ném theo đường cong, xuyên ba con rồi cắm lại |
| Độc | đại đao | vung dài; nhát thứ ba xoay một vòng 360° trúng cả phía sau |
| Kỹ Sư | shotgun | chín viên đạn chì |
| Sói | rìu săn | rìu một tay chém nhanh; khi hoá sói đổi sang vuốt |
| Nhện Đồng | nỏ tơ | nỏ buộc cổ tay, mũi tên xuyên hai con |

Mỗi vũ khí còn có một chiêu riêng (`weapons.js`):

- **Gió:** nhát katana thứ ba phóng lưỡi gió hình trăng khuyết bay 14 m, chém mọi con trên đường với 60% sát thương.
- **Thép:** giữ chuột phải giơ khiên tay trái; đòn từ phía trước trong góc 100° chỉ còn 20% (`G.weapons.takenMul`), đi chậm và không chém được khi giơ.
- **Y Tá:** súng trái bắn phi tiêu hồi máu; bay qua lính thuê hồi 10 máu, qua đồng đội co-op thì hồi qua `G.hero.send('healdart')`.
- **Mưa:** bắn lâu thì nòng nóng; trên 60% đạn đốt cháy zombie, tới 100% thì kẹt 1,2 giây và xả hơi.
- **Bóng:** phi tiêu đánh dấu zombie 4 giây; chuột phải dịch chuyển ra sau con bị đánh dấu, đòn kế chắc chắn chí mạng, hồi 6 giây.
- **Pháo Thủ:** rocket tách thành 3 bom con sau 0,35 giây; trúng vật cản sớm hơn thì đầu đạn nổ tại chỗ rồi bom con văng ra.
- **Băng:** mỗi cú đâm cộng một lớp lạnh, lớp thứ tư đóng băng; đâm con đang đóng băng thì nó vỡ vụn.
- **Hoả:** cú đấm gây cháy; cú móc thứ ba tạo vòng lửa 3,5 m đốt 3 giây.
- **Sấm:** phi lao trúng thì sét lan sang 4 con gần nhất trong 7 m với 50% sát thương.
- **Độc:** mỗi nhát đao để lại khí độc dọc đường chém, tồn tại 3 giây.
- **Kỹ Sư:** viên đạn trúng zombie đứng cách tường dưới 1,8 m thì ghim nó vào tường 1,2 giây.

Sau khi thêm chiêu riêng, Băng và Hoả vượt nhóm khoảng +220 sát thương/giây nên đã hạ: thương 64→54, nắm đấm 34→28, lửa yếu đi. Đo lại cả bộ: Băng 629, Hoả 664, các nhân vật khác trong khoảng 490–780.

`tools/balance.js` cho mỗi nhân vật một bot tự ngắm và đánh. Bot đứng 25 giây giữa dòng zombie đợt 6 (`CROWD=16`, tức 16 con cùng lúc), một lần chỉ dùng vũ khí, một lần dùng cả kỹ năng và chiêu tối thượng. Sát thương được tính bằng máu zombie mất đi, nên vụ nổ và kỹ năng đều được đếm. Đo lặp cùng bộ số vẫn lệch khoảng ±120 sát thương/giây.

Lần đo cuối, cột "chỉ vũ khí" và "cả bộ" là sát thương mỗi giây:

| Nhân vật | Chỉ vũ khí | Cả bộ | Kill |
|---|---|---|---|
| Gió | 358 | 618 | 50 |
| Thép | 494 | 680 | 49 |
| Y Tá | 243 | 316 | 30 |
| Mưa | 283 | 608 | 45 |
| Bóng | 208 | 485 | 45 |
| Pháo Thủ | 498 | 778 | 62 |
| Băng | 369 | 477 | 36 |
| Hoả | 296 | 513 | 41 |
| Sấm | 192 | 567 | 49 |
| Độc | 588 | 691 | 53 |
| Kỹ Sư | 177 | 680 | 56 |
| Sói | 365 | 564–636 | 47–50 |
| Nhện Đồng | 321 | 576 | 47 |

Đã chỉnh từ lần đo đầu:
- **Tăng sát thương:** súng đôi 26→46, phi tiêu 30→46, phi lao 130→170, thương 54→64, nắm đấm 22→34, shotgun 17→20; Mũi băng của Băng 60→110.
- **Hoả:** giảm 40% sát thương nhận vào.
- **Hạ:** rocket bazooka 480→400, nạp đạn 2,4→2,8 giây; nội tại nổ của Pháo Thủ 40%→25%.

Y Tá là người hồi máu nên cố ý thấp hơn nhóm gây sát thương. Băng thiên về khống chế (đóng băng).

## Sói và Nhện Đồng

Hai nhân vật thêm sau, đều tự nghĩ. Sói không lấy người sói của game nào, Nhện Đồng không lấy người nhện nào: không tên, không bộ đồ, không màu đỏ xanh.

**Sói** (`soi`, Hoá sói) là thợ săn áo da, khoác lông xám trên vai, mắt hổ phách, đeo răng sói ở thắt lưng.

- **Nội tại:** mỗi con zombie hạ được hồi 4 máu; chạy nhanh hơn 8%.
- **Rìu săn:** rìu một tay, 60 sát thương, chém 0,32 giây một nhát, chẻ 2 con. Cứ nhát thứ ba trúng thì mở vết chảy máu (status `bleed`, 14 sát thương mỗi giây trong 4 giây), hiện chữ CHẢY MÁU. Thanh dưới góc phải đếm 1/3, 2/3.
- **F Vồ cắn:** vồ 8 m tới chỗ tâm ngắm, ngửa nhìn lên thì vồ lên cao. Đáp xuống hoặc đâm vào zombie thì cắn: 90 sát thương cho con gần nhất, 54 cho hai con kế, kèm chảy máu, hồi 15 máu.
- **C Tru gọi bầy:** vòng sóng tru lan ra. Zombie trong 10 m sợ hãi bỏ chạy 2,5 giây (chủ phòng đặt `fearT`; boss không sợ). Ba con sói hồn màu xanh nhạt, trong suốt, phát sáng chạy ra cắn zombie gần nhất trong 8 giây, mỗi phát cắn 30.
- **Q Hoá Sói:** 12 giây thành người sói. Thân to thêm 30%, mọc lông, mõm, tai, đuôi, bàn chân có móng. Trong góc nhìn thứ nhất, hai tay thành tay lông cầm vuốt. Vũ khí đổi sang **vuốt sói**: hai nhát cào, mỗi nhát 70, chém lan 4 con. Trong lúc hoá sói: chạy nhanh hơn 35%, nhảy cao hơn 30%, chịu ít hơn 40% sát thương, hút 15% sát thương vuốt thành máu, Vồ cắn hồi nhanh gấp ba và cắn 120. Lúc hoá và lúc trở lại đều có tiếng tru và vòng sóng. Hết giờ, chết hoặc vào ván mới thì trở lại người, cầm lại rìu.

Người chơi khác thấy hình sói qua chính vũ khí: hàng tư thế co-op mang `claws` thì `BZ.equipWeapon` cho thân lớn dần thành sói (`m.formWant`). Hết thì nó gửi `wolfend`.

**Nhện Đồng** (`nhen`, Đu tơ) mặc giáp đen viền đồng, ngực có hình nhện đồng. Mũ kín có tám mắt nhỏ phát sáng. Sau lưng có bốn chân nhện máy, mỗi chân hai đoạn, khớp đồng, mũi chân sáng. Lúc đứng, chân khẽ đung đưa và thỉnh thoảng giật. Lúc đu tơ, kéo tơ hay bắn thì chân xoè ra. Lúc tung lưới thì bốn chân đâm xuống lần lượt (`BZ.heroExtras`).

- **Nội tại:** chạy trên tường và nhảy hai lần như Bóng (`wallRun`, `doubleJump`).
- **Nỏ tơ:** nỏ buộc cổ tay phải. Mỗi phát 74 sát thương, 330 phát mỗi phút, xuyên 2 con. Mỗi mũi để lại một lớp tơ (status `web`), mỗi lớp làm chậm 18%. Lớp thứ ba trói chân zombie 1,5 giây (boss 0,5 giây).
- **F Đu tơ (2 lượt):** bắn tơ tới chỗ tâm ngắm chạm (tường, mái, đất) trong 30 m. Một sợi tơ trắng nối từ tay tới điểm móc, rồi anh ta đu theo cung tới đó. Ngắm vào tường ngay dưới mép mái thì đu lên đứng trên mái. Đáp xuống thì đá văng zombie quanh chân: 90 sát thương và một lớp tơ.
- **C Kéo tơ:** bắn tơ dính zombie dưới tâm ngắm, hoặc con gần nhất trong một nón hẹp. Nó bị giật về trước mặt rồi trói 2 giây. Hai con đứng cạnh nó bị trói tại chỗ. Con bị kéo nhận 110 sát thương, hai con kia 60.
- **Q Lưới Tơ Khổng Lồ:** tung tấm lưới rộng 12 m bay xoè ra phía trước rồi nằm xuống đất. Mọi zombie dưới lưới bị trói 3 giây, có sợi tơ nối từ lưới lên người chúng. Sau đó tơ siết lại, lưới co vào rồi nổ: 300 sát thương ở giữa, giảm dần ra mép.

Trói và sợ nằm trong `js/zombies.js` (`z.rootT`, `z.fearT`, status `root`, `web`, `bleed`). Trói giữ zombie đứng tại chỗ, nhưng con nào có người trong tầm thì vẫn đánh được. Với máy khách co-op, cờ trạng thái mang thêm 4096 (dính tơ hoặc bị trói), 8192 (chảy máu) và 16384 (sợ). Zombie dính tơ có sợi trắng quanh chân. Zombie chảy máu nhỏ giọt máu. Zombie sợ thì có đốm sáng trên đầu.

Cân bằng (`balance.js`, `CROWD=16`, 25 giây):
- **Sói:** chỉ vũ khí 365, cả bộ 564–636 sát thương mỗi giây (hai lần đo).
- **Nhện Đồng:** lần đầu chỉ được 123 / 175, nên đã nâng:
  - nỏ: sát thương 42 → 74, 300 → 330 phát mỗi phút, xuyên 2 con;
  - Kéo tơ: sát thương 60 → 110, hồi chiêu 9 → 7 giây;
  - Đu tơ: thêm cú đá 90 sát thương lúc đáp;
  - tối thượng: chi phí 1600 → 1300.
  
  Sau khi nâng: chỉ vũ khí 321, cả bộ 576. Cả hai nằm trong dải 490–780 của nhóm.

`skillcensus.js` (12 zombie, 6 giây), sát thương mỗi lần dùng:

| Kỹ năng | Sát thương |
|---|---|
| Vồ cắn | 366 |
| Tru gọi bầy | 968 |
| Kéo tơ | 230 |
| Lưới Tơ | 2280, hạ cả 12 con |

Hoá Sói và Đu tơ không gây sát thương khi dùng một mình.

`tools/heroshots.js` chụp hai nhân vật để duyệt hình. Ảnh gồm màn chọn, từng kỹ năng ở góc nhìn thứ nhất, từ sau lưng và từ chéo phía trước, thân sói, vuốt, sợi tơ đu lên mái, và tấm lưới lúc bay, lúc trói, lúc siết, lúc nổ. Mỗi nhân vật ghép thành một tấm `sheet-*.png`. `tools/roofspot.js` tìm chỗ tường có mái để đu thử.

## Kỹ năng ném và kỹ năng yếu

Kỹ năng ném gồm phi tiêu độc, lựu đạn chùm, mìn dính, bom xăng và mây độc. Cách dùng: giữ F hoặc C thì hiện đường bay chấm sáng màu nhân vật và vòng chỗ rơi, to đúng bằng vùng tác dụng; thả phím là ném. Đồ ném rơi đúng chỗ tâm ngắm chạm, ngắm lên trời thì rơi xa nhất ở tầm của kỹ năng. Nút trên điện thoại cũng giữ rồi thả như vậy.

`tools/skillcensus.js` tung từng kỹ năng một lần vào giữa 12 zombie đợt 6, rồi đo máu mất trong 6 giây. Đã nâng các kỹ năng yếu:

| Kỹ năng | Đổi | Sát thương / giây hồi chiêu |
|---|---|---|
| Lốc xoáy | 26 → 45 | 69 → 140 |
| Húc | 60 → 110 | 83 → 165 |
| Phi tiêu (kỹ năng) | 45 → 75 | 81 → 135 |
| Mũi băng | 110 → 170 | 55 → 85 |
| Cầu sét | 22 → 34 mỗi nhịp | 83 → 110 |
| Hút sinh | dùng được cả khi zombie chưa trúng độc (35, trúng độc 70) | trước không tung được |
| Động Đất (tối thượng) | 220 → 340 | 1081 → 1673 / 6 giây |
| Kỷ Băng Hà (tối thượng) | 10 → 16 mỗi nhịp | 1320 → 2112 / 6 giây |

Mìn dính 160→135 và Lôi phạt 150→125 bị hạ nhẹ, vì hai kỹ năng này mạnh nhất bảng.

## Anim kỹ năng

`js/castanim.js` cho cả 39 kỹ năng một động tác riêng trên thân nhân vật, diễn ở góc nhìn thứ ba và trên người chơi khác trong co-op. Mỗi động tác khai báo:
- thời lượng: kỹ năng thường 0,4–0,9 giây, chiêu tối thượng 1,1–1,5 giây;
- dáng từng khớp, được trộn mượt từ dáng đang chạy vào rồi trả ra;
- đồ cầm tay: búa, cờ lê, ống tiêm, lọ, lựu đạn, chai, mìn, bộ đàm, phi tiêu, bình;
- các nhịp bắn tia lửa, vòng sáng hoặc tia điện ở tay.

Ví dụ:
- Kỹ Sư quỳ gõ búa bốn nhát, mỗi nhát toé lửa và kêu keng. Bản thiết kế xanh của turret lớn dần theo từng nhát, rồi turret rơi xuống, nảy và co giãn.
- Thép húc vai, giơ hai tay đập đất cho Động Đất. Cú đập trúng đất trễ 0,3 giây cho khớp với động tác.
- Pháo Thủ gọi bộ đàm khi gọi pháo.

Các hiệu ứng lướt, lưỡi xoay, bất tử, hồi máu, bão, drone, thương băng và gọi sét đều được làm rõ hơn. `tools/castanim.js` chụp mỗi nhân vật 3 kỹ năng × 3 thời điểm.

Kỹ năng có hướng đi theo hướng ngắm, kể cả góc ngửa:
- Ngửa nhìn lên rồi lướt thì bay lên khoảng 8 m.
- Dịch chuyển lên được mái nhà.
- Húc vai lúc ngửa thành cú húc bật lên.
- Quả cầu sét bay theo góc ngắm.

`kits.js` kiểm cả ba việc lướt, dịch chuyển và quả cầu khi ngửa nhìn lên.

## Góc nhìn thứ ba và thân nhân vật

Mặc định chơi ở góc nhìn thứ nhất. Phím `V`, hoặc nút `V · NGÔI 1` ở góc phải trên, đổi sang góc nhìn thứ ba qua vai phải, kiểu game bắn súng anh hùng. `?tp=1` vào thẳng góc nhìn thứ ba.

`js/tps.js` lo phần góc nhìn thứ ba:

- **Camera:** đặt sau đầu, lệch sang vai phải. Bắn tỉa (chuột phải) thì camera kéo gần vào. Có tường phía sau hoặc bên vai thì camera rút vào trước mặt tường.
- **Ngắm:** tâm ngắm vẫn ở giữa màn hình. Phát bắn tìm điểm tâm ngắm đang chạm (tường hoặc zombie), rồi bay từ vai nhân vật tới đúng điểm đó. Zombie đứng giữa camera và nhân vật không bị bắn trúng; vật chắn giữa nhân vật và mục tiêu thì chặn đạn.
- **Thân nhân vật trên màn hình:** chạy, nhảy, ngắm theo tâm, giật súng, nạp đạn, chém và vung tay khi tung kỹ năng.

Thân nhân vật (`BZ.heroModel`) có cột sống, hông, đùi, đầu gối, cổ chân, vai, khuỷu tay và bàn tay. `BZ.animHero` là bộ anim dùng chung cho nhân vật của mình và cho người chơi khác trong co-op:

- Khi chạy, đầu gối gập lúc chân vung qua và bàn chân miết đất. Hông xoay ngược với vai, thân trên nghiêng theo tốc độ, chạy nhanh thì hạ súng.
- Khi chém, cả thân xoắn theo nhát chém, có kéo vai, duỗi khuỷu tay rồi thu về.
- Đầu luôn nhìn theo hướng ngắm.
- Khớp nào cũng được làm mượt, nên các trạng thái chuyển sang nhau không bị giật.

`tools/tps.js` chụp nhân vật đứng, chạy, bắn, chém và nhảy. Nó kiểm phát bắn trúng thứ dưới tâm ngắm, kiểm camera không lọt vào tường ở 40 chỗ sát mép bản đồ, và kiểm phím `V` cùng nút trên màn hình.

### Jetpack

Có nâng cấp jetpack (`P.hasJet`) thì nhân vật đeo một bộ jetpack sau lưng ở góc nhìn thứ ba và trên avatar co-op (`BZ.heroJet` trong `js/heroes.js`: bình nhiên liệu, hai ống phụt, dây đeo, gắn vào `spine`). Khi bay, mỗi ống phụt lửa lõi sáng có quầng và nhả khói (`fx.jet`), có đèn hắt xuống; nhiên liệu dưới mức thấp thì lửa chập chờn, hết thì tắt kèm một phụt khói (`fx.jetOut`). Góc nhìn thứ nhất thấy quầng lửa ở mép dưới màn hình (`#jetfx`). Co-op gửi hai bit trong `flags` của tư thế: 4 là có jetpack, 8 là đang phụt. `tools/tps.js` kiểm model hiện khi có jetpack, có hạt lửa khói khi bay và tắt khi thôi.

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

Tinh anh (`BZ.ELITE`) từ đợt 3, tỉ lệ `1,5% × số đợt` tối đa 12%: Nhanh, Trâu, Tự hồi (lửa hoặc độc chặn hồi), Bùng nổ (chết thì nổ), Hút máu, Cuồng (dưới nửa máu). Tinh anh có hào quang, viên đá màu xoay trên đầu, thanh máu vàng, và cho điểm gấp ba.

Co-op: hàng trạng thái của zombie mang thêm cờ 256 khiên, 512 giáp, 1024 cuồng, 2048 đang ra chiêu, và cột thứ 9 là tinh anh. Đạn axit, tơ, vũng nguy hiểm, tiếng thét, nổ băng đi qua sự kiện `zk`. Chậm và trói chân đến máy người vào sau cùng tin nhắn `hurt`.

## Boss lớn và combo chiêu

`js/bosses.js` là khung chung cho boss có thân riêng. Mỗi boss một file `js/boss-<id>.js`, đăng ký bằng `BZ.bossKit(id, { type, rig, pose, idle, moves, combos, rageCombos, hits })`. Boss nối 2–3 chiêu thành một combo, nghỉ khoảng một giây, rồi chọn combo kế. Dưới nửa máu thì nghỉ ngắn hơn, chiêu nhanh hơn và có thêm combo 3 chiêu. Tên chiêu hiện trên đầu boss lúc ra đòn.

Khung lo phần nhìn dùng chung, cho mọi chiêu đều đọc được và né được:

- **Đạn (`orb`):** lõi sáng, quầng to, vệt sáng phía sau. Có dạng cầu, mảnh tinh thể, dơi và bọ hung; có loại đuổi theo người và loại rơi theo trọng lực.
- **Cảnh báo dưới đất (`warn`):** vòng tròn hoặc dải đầy dần trước khi đòn rơi xuống.
- **Tia (`beam`):** quét từ điểm này sang điểm kia, đốt nền.
- **Vòng chấn động (`shock`):** lan ra từ chân boss, nhảy qua được.
- **Chớp nổ, rung màn hình**, và cái chết nổ tung thành từng khối kèm chuỗi vụ nổ.

| Boss | Thân | Chiêu |
|---|---|---|
| Rồng Hư Không | rồng đen tím bay vòng trên phố | mưa cầu hư không, bổ nhào theo làn đã báo, đáp xuống phun hơi thở quét, gọi sao băng, quật đuôi |
| Pharaoh Xác Ướp | vua xác ướp lơ lửng, khăn vàng lam, gậy ngọc bọ hung | bầy bọ hung, trụ cát hành quân, lời nguyền vàng, gọi xác ướp, chìm cát trồi sau lưng, vòng cầu cát |
| Bá Tước Máu | quý tộc nhợt nhạt, áo choàng đỏ đen bay phần phật | bầy dơi máu, lao huyết hút máu, bão huyết, sương máu dịch chuyển, mưa máu, hút sinh lực |
| Kẻ Xâm Lăng | người ngoài hành tinh bốn tay, súng plasma | loạt đạn plasma, tia laser sạc, lựu hấp dẫn, dịch chuyển, mìn axit, gọi trinh sát |
| Đĩa Bay | đĩa bay lớn, vành đèn xoay, phi công trong vòm kính | tia hút, đợt ong bom, vòng laser xoay, đội xâm lăng, sóng xung điện từ, loạt cầu tìm |
| Hộ Vệ Cổ Đại | tượng đá khổng lồ, rune xanh, vòng đá rune xoay sau lưng | đập đôi, tia mắt cổ, mưa đá, gai đá, tràn rune, xung kích |

Năm boss cũ to hơn, nhanh hơn và có thêm hiệu ứng:

- **Đô Con Khổng Lồ:** báo trước chỗ đáp, dội vòng chấn động có tường sáng.
- **Kẻ Ném:** báo trước chỗ đá rơi; dưới nửa máu thì ném 3 tảng một lúc.
- **Bóng Ma:** dịch chuyển có chớp sáng, vòng chấn động và loạt mảnh tinh thể đuổi theo.

Đợt boss đi từ dễ tới khó, mỗi 5 đợt một con: Khổng Lồ, Kẻ Ném Đá, Bóng Ma, Nhện Chúa, Chúa Dơi, Bá Tước Máu, Kẻ Xâm Lăng, Pharaoh, Đĩa Bay, Hộ Vệ Cổ Đại, Rồng Hư Không. Từ đợt 6 có thể có thêm một con ngẫu nhiên, chỉ chọn trong những con đã gặp.

Co-op: chủ phòng chạy chiêu và tính trúng. Máy khách nhận từng chiêu (`zk` loại `bm`), từng viên đạn, cảnh báo, tia và vòng (`bo`, `bt`, `bb`, `bw`), rồi tự diễn lại phần nhìn.

Đạn thường cũng rõ hơn. Axit, tơ, đá ném, rocket và đạn kỹ năng đều có quầng sáng, vệt dài và chớp khi trúng; vệt đạn súng có lớp sáng bọc ngoài. `tools/projshots.js` chụp cận các loại đạn đang bay.

## Cảm giác đòn (polish)

- `js/polish.js`: dùng kỹ năng thì màn hình loé màu nhân vật và súng chúc xuống một nhịp (`S.castT` trong `js/weapons.js`); tối thượng loé to hơn, khựng thời gian 0,12 giây; tối thượng đầy thì viền màn hình sáng lên một lần; chọn nâng cấp thì thẻ nảy và toé tia.
- Zombie chết ngã ba kiểu (`fall` trong `js/zombies.js`): ngã ngửa vung tay, đổ sấp về phía người bắn, khuỵu gối rồi đổ nghiêng.

## Đánh bóng: hình, menu, điện thoại

- **Không gì treo trên không** (`js/fx.js`): vết cháy, vòng chấn động và bụi của vụ nổ nằm trên sàn ngay bên dưới (`fx.floorY`), nổ cao quá thì không để lại vết. Vũng máu và vũng axit, lửa cũng rơi xuống sàn bên dưới. Mảnh xác nằm trên mặt rộng nhất, nằm 14 giây (tấm lớn như cánh rồng 4,5 giây) rồi chìm đi; chỗ tựa bị phá thì mảnh xác, vũng máu và vết cháy rơi tiếp. Khói xác xe là quầng khói mềm bay lên rồi tan. `fx.floaters()` liệt kê thứ còn lơ lửng, `tools/bosses.js` và `tools/destruct.js` kiểm nó rỗng.
- **Vũng máu** nhỏ hơn, sẫm hơn và khô sau 16 giây, nên giết ba chục con một chỗ không còn sơn đỏ cả quảng trường.
- **Bloom** (`js/post.js`): khung hình vẽ vào target float, phần sáng được thu nhỏ ba lần, làm nhoè rồi cộng lại. Chỉ bật ở mức đồ hoạ vừa và cao; `?post=0` tắt, `?post=1` ép bật. Ban đêm bloom mạnh, ban ngày nhẹ.
- **HUD:** số sát thương nảy ra, phát kết liễu làm hitmarker đỏ và to lên, thanh máu của người chơi và boss có vệt trắng tụt trễ, boss vào trận có sọc cảnh báo ở hai mép màn hình, băng rôn đợt có dải nền.
- **Menu:** logo vẽ lại có viền và khối nổi, bảng phím thu vào nút "Phím điều khiển", thẻ nâng cấp tô màu theo nhánh, màn thua đếm số, nền mờ đi khi tạm dừng.
- **Âm thanh:** stem nhạc riêng khi boss còn sống (khớp nhịp với stem trống), nhịp tim khi máu dưới 35, còi khi boss vào, tiếng click menu.
- **Điện thoại:** pad cảm ứng chỉ hiện khi đang đánh, cụm nút nằm gọn góc phải dưới, màn chọn nhân vật cuộn được và luôn thấy nút "Vào trận", cầm dọc thì hiện nhắc xoay ngang. `tools/phone.js` kiểm ở 844×390 và 667×375.
- `tools/review.js` chụp bộ ảnh duyệt (menu, giao tranh, nổ, boss, chọn nâng cấp, màn thua, điện thoại); `tools/clip.js` quay một đoạn bot đánh thành frame, mp4 và contact sheet.

## Chọn nâng cấp và đường build

- Không có shop, không có tiền. Hết mỗi đợt, mỗi người chơi được chọn 1 trong 3 nâng cấp (`G.build.offer`, ưu tiên ba nhánh khác nhau), bấm thẻ hoặc phím 1, 2, 3. Chọn xong thì vào đợt sau ngay. Trong co-op, đợt sau chỉ bắt đầu khi mọi người đã chọn (khách gửi `picked` lên chủ phòng); nếu một người bỏ máy quá 60 giây thì vẫn đi tiếp.
- `js/build.js` giữ bảng `UP`, chia 5 nhánh: Hoả lực, Sinh tồn, Kỹ năng, Nguyên tố, Hỗ trợ. Mỗi nâng cấp cộng một cấp qua `grant`.
- Nguyên tố là hiệu ứng gắn lên zombie khi bắn trúng: lửa cháy theo thời gian, băng chồng 4 lớp thì đóng băng, điện nhảy sang con bên cạnh, độc rỉ máu. Hai nguyên tố gặp nhau thì phản ứng: nổ hơi, vỡ vụn, nổ khí độc, lan độc. Trong co-op, phản ứng do hai người khác nhau gây ra là **phối hợp** và mạnh gấp rưỡi.
- Hai nhánh đủ cấp thì mở cộng hưởng (`RES`). Màn chọn ghi rõ nâng cấp nào sẽ mở cộng hưởng nào.
- Mỗi nhân vật cầm đúng một vũ khí suốt trận (`weapon` trong `js/heroes.js`), đạn dự trữ vô hạn. Không đổi, không nhặt, không bỏ vũ khí, không có bom ném, zombie không rơi đồ. Đầu mỗi đợt hồi 35% máu.
- Quái mạnh dần theo đợt (`BZ.WAVE.hpMul`, `dmgMul`, `speedMul`). Sát thương bắt đầu ở 0,8 lần, mỗi đợt tăng 5%, tối đa 1,7 lần. Mỗi đợt có `12 + 4 × đợt` zombie (tối đa 100), trên sân cùng lúc tối đa `14 + 2 × đợt` con (tối đa 30). Đòn của boss lớn bị giảm còn 65% con số ghi trong từng file boss. Trong co-op, mỗi người thêm làm đợt đông hơn 60%, zombie trâu hơn 35%, và số zombie trên sân cùng lúc tăng 40%.

## Ngày đêm, thời tiết, vụ nổ

- `js/sky.js` giữ một đồng hồ chạy 8 phút cho một ngày: mặt trời mọc và lặn, ban đêm có mặt trăng và sao, đèn đường với cửa sổ sáng chỉ bật khi tối. Ban đêm zombie nhanh hơn 15%. `?tod=0.5` (0 = nửa đêm, 0.5 = trưa) và `?daylen=<giây>` dùng khi thử.
- Đầu mỗi đợt tung ra một kiểu thời tiết, kiểu nào cũng có luật riêng: mưa (zombie chậm 10%), bão sét (sét đánh zombie), sương mù (điểm gấp rưỡi), tuyết (zombie chậm 20%), trăng máu chỉ ra ban đêm (zombie trâu hơn, điểm gấp đôi), gió tro (đạn lệch). `?weather=<id>` ép một kiểu. Không có mưa thiên thạch.
- Vụ nổ ở `fx.explosion`: chớp sáng, quả cầu lửa, vòng sóng xung kích trên đất, tàn lửa, gạch đá văng, khói đứng lại vài giây, vết cháy, màn hình loé trắng khi nổ gần. Lửa và khói là hai `InstancedMesh` billboard (một lớp cộng sáng, một lớp alpha), nên mỗi lớp chỉ tốn một draw call.

## Chơi cùng bạn (co-op)

- Màn đầu có nút **Chơi cùng bạn**: tạo phòng (ra mã 6 ký tự), vào bằng mã, hoặc chọn trong danh sách phòng đang mở. Tối đa 4 người. Người vào sau chọn nhân vật rồi nhảy thẳng vào trận đang đánh.
- Mạng là Unity Relay gọi bằng JS thuần, chép từ `games/mini-mart-coop/js/net/` sang `js/net/`. `relay.js` giữ nguyên; `ugs.js` và `room.js` đổi nhãn phòng sang `blockadez` ở index S5, nên danh sách phòng không lẫn với Boo Haul hay Mini Mart Together.
- `js/coop.js`: chủ phòng giữ zombie, đợt, thời tiết và lính thuê, gửi ảnh chụp trạng thái 15 lần mỗi giây kèm sự kiện (zombie chết với kiểu gore đã chọn, đứt chi, vụ nổ, sét, kỹ năng, thông báo đợt). Người vào sau tự đi và tự bắn trên máy mình, tự thử trúng zombie mình thấy, rồi gửi phát trúng lên chủ phòng. Điểm thuộc về người ra đòn kết liễu. Zombie đuổi người sống gần nhất. Gục thì chờ hồi sinh ở đợt sau; cả phòng gục thì hết trận.
- `?fakenet=1` thay Relay bằng `BroadcastChannel` để hai tab cùng trình duyệt chơi với nhau khi không có mạng (dùng cho test).
- Còn hở: bóng mồi của nhân vật Bóng chỉ nhử được zombie khi chủ phòng là Bóng; tên lửa đang bay của người khác không hiện, chỉ thấy vụ nổ; chủ phòng rời thì phòng đóng (chưa chuyển chủ).

## Phố phá được: nứt, gãy, sập

`js/destruct.js` cho mọi tường, sàn, mái và đồ vật bên trong tường rào bị phá. Chỉ tường rào vòng ngoài không phá được. Có 695 mảng; tường dài được chia thành từng cột khoảng 2 m, để một vụ nổ chỉ khoét một đoạn chứ không xoá cả mặt nhà.

- **Nguồn sát thương:** vụ nổ (rocket, bom chùm, nổ xác), đòn đập và đạn nổ của boss, và đạn súng. Đạn súng chỉ làm mẻ, chủ yếu phá được đồ gỗ.
- **Nứt:** mảng mất 30% độ bền thì hiện vết nứt; mất 65% thì nứt dày thêm và bắn vụn.
- **Vỡ:** mảng vỡ thành khối văng ra, bụi cuộn lên, dưới chân để lại gạch vụn. Đường bắn, đường đi của zombie và chỗ đứng đều mở ra qua lỗ thủng.
- **Sập:** mảng mất hơn hai phần ba chỗ tựa (tường dưới sàn, cột dưới mái) thì rơi xuống cả khối. Nó đè người và zombie bên dưới, và có thể kéo sập luôn tầng trên.
- **Đồ gắn theo:** bảng hiệu, song cửa và kính đi theo mảng tường gần nhất, nên không còn lơ lửng sau khi tường đổ.
- **Không làm game chậm:** mảng vỡ vẫn nằm trong lưới gộp của cả bản đồ, nên không thêm lượt vẽ nào. Lúc vỡ, các đỉnh của nó được thu về một điểm.
- **Mỗi ván mới:** phố được dựng lại nguyên vẹn.
- **Co-op:** chủ phòng quyết định mảng nào vỡ hay đổ, khách diễn lại y như vậy. Cứ 3 giây chủ phòng gửi lại danh sách mảng đã vỡ cho người vào sau. Chỉ đạn và vụ nổ phía chủ phòng làm hỏng địa hình.
- **Kính cửa sổ:** `wall()` trong `js/world.js` tự đặt một ô kính (mảng có tag `glass`) cùng khung vào mỗi ô cửa sổ, cứ ba ô thì một ô sáng đèn. Kính chặn đạn. Đòn nhẹ làm nứt hình sao, đòn từ 20 sát thương hoặc đòn thứ hai làm vỡ thành mảnh (`shatter()`), sau đó đạn bay qua. Vụ nổ và nhát chém cũng làm vỡ. Kính không chống đỡ gì; mảng tường quanh nó sập thì kính vỡ theo chứ không rơi nguyên tấm. Mảnh kính, mảnh tường và vũ khí rơi là mảnh "khô": không để vệt máu hay vũng máu.
- **Cửa ra vào:** mỗi ô cửa sát đất (`W.doors`) có một cánh cửa gắn bản lề, lúc đầu mở. Đứng trong tầm 2,4 m, phím `E` đóng hoặc mở (trên điện thoại chạm vào nhãn "Đóng cửa / Mở cửa"). Cửa không đóng khi có người hay zombie đứng giữa ô cửa. Cửa đóng chặn người và đạn, nhưng không ghi vào bản đồ đường đi (`noGrid`), nên zombie vẫn kéo tới rồi đập: mỗi con 30 sát thương mỗi giây, tối đa tính 5 con, cửa 240 máu. Đạn và vụ nổ cũng làm hỏng cửa. Cửa vỡ thì mất tới ván sau.
- **Co-op của cửa và kính:** khách gửi `act` (`k: 'door'`, `k: 'glass'`) lên chủ phòng; chủ phòng phát `tbrk` và gửi lại trạng thái cửa trong lượt đồng bộ 3 giây.

`tools/destruct.js` kiểm các việc sau và chụp ảnh từng bước:
- rocket khoét thủng tường bốt gác, đạn bay xuyên qua lỗ, mảng xung quanh nứt;
- phá tầng trệt nhà phố thì sàn trên rơi đè chết zombie;
- boss đập đất phá tường nhà thờ;
- súng lục bắn vỡ đồ gỗ;
- ván mới dựng lại phố;
- kính: đòn nhẹ chỉ nứt, đòn sau vỡ và đạn bay qua, vụ nổ làm vỡ kính quanh đó, không mảnh nào treo lại, ván mới lành lại;
- cửa: mở thì tia đi qua, đóng thì chặn, không đóng lên người đứng giữa, phím dùng đóng đúng cửa trước mặt, 3 zombie đập vỡ cửa, ván mới treo lại cửa.

## Đường đi của zombie

`js/world.js` dựng ba lưới đường đi 1 m, mỗi lưới cho một cỡ thân: khoảng hở 0,36 m cho zombie thường, 0,52 m cho kẻ to (Kẻ Phình, Kẻ Khiên, Kẻ Giáp, Đô Con), 0,86 m cho boss. Ô chỉ mở khi thân cỡ đó đứng giữa ô không chạm tường, nên con to không bị dẫn vào khe chỉ con nhỏ lọt. Kẹt quá 0,35 giây thì zombie bước ngang 0,7 giây, lần sau bước sang phía kia; đứng một chỗ quá 6 giây ở chỗ người chơi không nhìn thấy thì đi vào lại từ cổng gần thứ nhì.

`tools/stuck.js` cho người chơi bất tử đứng 90 giây ở năm chỗ trên bản đồ (đợt 6) và đếm zombie đứng yên quá 3 giây. Trước khi sửa: 7 con kẹt. Sau khi sửa: 0 con kẹt, 0 lần phải về cổng, 231/233 con tới sát người chơi.

## Màn home: triệu hồi, nâng cấp, cửa hàng giả lập

`js/meta.js` thêm ba cửa ở màn title: **Triệu hồi**, **Nhân vật**, **Cửa hàng**. Tài khoản lưu trong `localStorage` khoá `blockadez.meta.v1`; không có thanh toán thật nào, nút mua chỉ cộng số.

- **Tài khoản mới** có Gió, Thép, Mưa Đạn, 3.000 vàng, 1.600 kim cương. Mỗi ngày đăng nhập +100 kim cương và một lượt triệu hồi miễn phí.
- **Triệu hồi:** 150 kim cương một lượt, 1.350 cho mười lượt (mười lượt chắc chắn có SR trở lên). Tỉ lệ SSR 2,5% (ra nhân vật, trùng thì 25 mảnh), SR 12% (8 mảnh), R 35,5% (3 mảnh), N 50% (vàng). Lượt thứ 60 không ra SSR thì chắc chắn ra. Banner đổi nhân vật nổi bật mỗi ngày, một nửa SSR ra nhân vật đó.
- **Nhân vật chưa có** bị khoá ở màn chọn; ghép 40 mảnh hoặc mở ngay bằng 1.980 kim cương.
- **Lên cấp** bằng vàng, cấp tối đa 10 + 4 × số sao (tới 30). **Lên sao** bằng mảnh: 10, 20, 35, 60, 100.
- **Sức mạnh vào trận:** mỗi cấp +3,5% sát thương, +2,5% máu; mỗi sao +12% sát thương, +8% máu; mỗi bậc VIP +3% sát thương, +2% máu. Sát thương nhân ở `zombies.damage` cho mọi đòn của người chơi trên máy này; đòn khách co-op gửi lên đã nhân sẵn.
- **Cửa hàng giả lập:** gói kim cương 22.000đ–1.990.000đ (lần đầu x2), gói khởi đầu (một lần, có vé SSR), thẻ tháng (90 kim cương mỗi ngày trong 30 ngày), Gói Bá Chủ (nhân vật đang chọn lên ngay cấp 30 ★5). Tổng tiền nạp giả lập lên VIP 1–5 ở mốc 100k, 500k, 1,5 triệu, 4 triệu, 10 triệu; VIP còn cộng 20% vàng mỗi trận.
- **Hết trận** nhận vàng theo số kill và đợt, từ đợt 5 có thêm kim cương; số nhận hiện ở màn thua.

Chạy dưới Playwright (`navigator.webdriver`) thì lớp này tắt: mọi nhân vật mở, hệ số bằng 1, để các test khác không lệch. `?meta=1` bật lại, `?meta=0` tắt hẳn.

## Kiểm

```
PLAYWRIGHT_PATH=<thư mục playwright-core> node games/blockade-z/tools/smoke.js <thư mục ảnh>
PLAYWRIGHT_PATH=<thư mục playwright-core> [FAKE=0] node games/blockade-z/tools/coop-test.js <thư mục ảnh>
PLAYWRIGHT_PATH=<thư mục playwright-core> node games/blockade-z/tools/shots.js <thư mục ảnh>
PLAYWRIGHT_PATH=<thư mục playwright-core> node games/blockade-z/tools/zoo.js <thư mục ảnh>
PLAYWRIGHT_PATH=<thư mục playwright-core> node games/blockade-z/tools/kits.js <thư mục ảnh>
PLAYWRIGHT_PATH=<thư mục playwright-core> node games/blockade-z/tools/stuck.js <thư mục ảnh>
PLAYWRIGHT_PATH=<thư mục playwright-core> [BOSSES=dragon,ufo] node games/blockade-z/tools/bosses.js <thư mục ảnh>
PLAYWRIGHT_PATH=<thư mục playwright-core> node games/blockade-z/tools/projshots.js <thư mục ảnh>
PLAYWRIGHT_PATH=<thư mục playwright-core> node games/blockade-z/tools/tps.js <thư mục ảnh>
PLAYWRIGHT_PATH=<thư mục playwright-core> node games/blockade-z/tools/destruct.js <thư mục ảnh>
PLAYWRIGHT_PATH=<thư mục playwright-core> node games/blockade-z/tools/castanim.js <thư mục ảnh> [gio,ky]
PLAYWRIGHT_PATH=<thư mục playwright-core> node games/blockade-z/tools/weapons.js <thư mục ảnh>
PLAYWRIGHT_PATH=<thư mục playwright-core> node games/blockade-z/tools/meta.js <thư mục ảnh>
PLAYWRIGHT_PATH=<thư mục playwright-core> node games/blockade-z/tools/phone.js <thư mục ảnh>
PLAYWRIGHT_PATH=<thư mục playwright-core> [ONLY=title,fight] [MOB=1] node games/blockade-z/tools/review.js <thư mục ảnh>
PLAYWRIGHT_PATH=<thư mục playwright-core> [QUERY="fp=1&hero=mua&wave=4"] [SECS=6] node games/blockade-z/tools/clip.js <thư mục ảnh>
PLAYWRIGHT_PATH=<thư mục playwright-core> node games/blockade-z/tools/heroshots.js <thư mục ảnh>
PLAYWRIGHT_PATH=<thư mục playwright-core> [HEROES=hoa,mua] node games/blockade-z/tools/skillcensus.js <thư mục ảnh>
PLAYWRIGHT_PATH=<thư mục playwright-core> [HEROES=gio,phao] [CROWD=16] [SECS=25] node games/blockade-z/tools/balance.js <thư mục ảnh>
```

`smoke.js` dùng Chrome thật: một bot tự ngắm và đánh hết đợt 1, chọn nâng cấp bằng phím 2 rồi vào đợt 2, kiểm bắn vỡ đầu, chém katana, rụng chân thành zombie bò, nổ nát xác, mỗi nhân vật một vũ khí, lính thuê bắn, và kiểm không có lỗi console. `shots.js` chụp cận zombie, từng khẩu súng, màn title và màn điện thoại để duyệt hình.

Tham số URL dùng khi thử:

- `?autostart=1` vào thẳng trận.
- `?nolock=1` tắt pointer lock.
- `?god=1` cho bất tử.
- `?wave=N` bắt đầu từ đợt N.
- `?q=low|medium|high` chọn mức đồ hoạ.
- `?noaudio=1` tắt âm thanh.
- `?meta=1` bật màn home dưới Playwright; `?meta=0` tắt.

Trong trang có sẵn `window.__G`, `__sim(giây)`, `__setShot(tên)`, `__stats` và `__errors`.

Đổi mã thì tăng `?v=` của mọi thẻ script trong `index.html`, cùng `rev` của thẻ trong `data/games.js`.
