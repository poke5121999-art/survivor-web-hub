# Season Mode — dựng bản đồ chơi được từ ảnh tổng quan

Lever: `build_season.py` (chạy `PYTHONIOENCODING=utf-8 python games/soulknight/tools/season/build_season.py`, ~10 giây).
Ra `data/season-data.js` (`window.SK_SEASON.world`) và `art/season/world/world0.png` (atlas riêng, ~170 KB).
Mã chạy: `js/season/world.js` (bản đồ, vẽ, khỉ, thùng, điểm rút lui) và `js/season/season.js` (máy trạng thái).
Kiểm: `node test/soulknight-season-world.js`.

## Tỉ lệ ảnh map so với thế giới [ĐO]

Không có dump scene cho các bản đồ escape; chỉ có ảnh tổng quan `escape_map/Init.png` (căn cứ) và `Scene1.png`
(Ngoại ô căn cứ). Tỉ lệ đo bằng khớp mẫu (sai số bình phương trung bình theo mặt nạ alpha, quét vị trí ± vài px,
quét tỉ lệ từng 0.005) sprite thật trong `~/Downloads/sk-ref/all/escape/` lên ảnh map:

| Ảnh | Sprite khớp | Tỉ lệ ảnh/sprite | Sai số | → 1 px ảnh = |
|---|---|---|---|---|
| Init 1151x688 | Building_4 (quầy mái tím) | 0.825 | 724 | 1.212 px thế giới |
| Init | Tree_2 (thông) | 0.825 | 417 | (xác nhận) |
| Scene1 1024x1024 | Tent_1 | 0.185 | 1498 | 5.405 px thế giới |
| Scene1 | ApeArea_2 | 0.185 | 1337 | (xác nhận) |

1 px sprite = 1 px thế giới vì hiệp sĩ cao 28 px trong atlas và cao ~60 px trên ảnh chụp `e_0929_101229.jpg`
(1386x640), còn quầy Building_4 rộng 70 px sprite thì rộng ~150 px trên ảnh chụp: cùng hệ số 2.14.
Tile 32x32 của bộ escape là 2x2 ô va chạm 16 px của engine.

Kết quả: căn cứ 88x53 ô (1395x834 px), Ngoại ô 346x346 ô (5535 px mỗi cạnh). Ngoại ô rộng thật: hiệp sĩ
(6.5 đơn vị/giây) băng qua mất ~50 giây. Khung nhìn trong game gốc ~647x300 px thế giới (ảnh e / 2.14); engine của
bản web giữ chiều cao lôgic ~225 px nên cửa sổ 1300x560 cho ~650x280, gần giống.

Nhận xét cũ trong RESEARCH.md ("Scene1 1024 = 32 tile x 32, 1 px ảnh = 1 px sprite") là SAI: cây trên Scene1 chỉ
rộng ~9 px ảnh trong khi Tree_* rộng 50 px.

## Cách dựng

- Phân loại từng điểm ảnh theo màu [ĐO bảng màu]: cỏ (141,158,59), đất (r≥145, r-g≥18, g-b≥40), nước sâu
  (xanh đậm), nước nông (xanh ngọc sáng), còn lại = rừng/vật thể. Mỗi ô 16 px lấy lớp chiếm đa số.
- Nhà trên ảnh là lớp "khác" → xoá về cỏ trong khung sprite trước khi đếm, rồi đặt lại sprite thật đúng chỗ.
- Rừng: ô "khác" ≥ 50%; lấp khe < 10 ô, bỏ bụi lẻ < 6 ô.
- Gốc cây (ô mọc cây) = rừng lùi xuống 3 ô (48 px) so với mép trên, vì ảnh chụp từ trên, tán Tree_* cao 63 px
  che lên phía bắc. Dải tán ('f') vẫn chắn đi lại để người chơi đứng ngoài mép tán, không lọt vào dưới tán.
- Màu tán (xanh ngọc / xanh lá / vàng) lấy từ ảnh ngay trên gốc, nên rừng giữ đúng mảng màu như ảnh gốc.
  Thông vàng không có sprite riêng: `Tree_Y` = Tree_1 đổi 5 màu lá theo 5 màu lá vàng đo trên Init.
- Nền vẽ bằng tile thật 32 px: cỏ `grass_*` trơn, đường `dirt_*`, nước `water_shallow_*` + `water_deep_*`
  theo luật blob 3x3 (cạnh N/E/S/W, góc ngoài, góc khuyết). Vai trò từng tile tự dò từ ảnh (xem `tile_role`).
  Đường tối thiểu 2 ô 32 px (bộ tile viền cần 2 ô) → đường rộng hơn ảnh gốc chút (64 px so với ~50 px).
- Cây vẽ theo lưới so le 24x18 px, lệch cố định theo băm vị trí; không lưu toạ độ cây.

## Bẫy đã sập

- **Nhà trên Init bị lật gương**: Building_5, 6, 7 khớp mẫu sai số 9355/3429/10164 khi để thẳng, 1180/1234/552
  khi lật. Building_4 thì thẳng. Trại trên Scene1 đều thẳng. Luôn thử cả hai chiều khi khớp mẫu.
- **Tile bị cắt viền trong suốt khi rip** (vd `dirt_0` còn 27x25): phải đoán góc neo theo phía có nhiều điểm đặc
  (`trimmed_offset`), nếu không đường đất lệch vài px ở mọi góc.
- **`sg_*` tối hơn `grass_*`** ((128,145,55) so với (141,158,59)): trộn vào nền thành ô cờ, nên bỏ.
- **Ổ đĩa Windows không phân biệt hoa thường**: `Tree_0.png` và `tree_0.png` trong manifest là hai sprite nhưng
  trên đĩa chỉ còn một tệp. Dùng Tree_1/Tree_2 (thông) là chắc.
- Vài tile "full" của `water_deep` còn vệt sóng ở góc; lát lặp thành hoa văn. Lever chỉ giữ biến thể trơn nhất.
- `WoodBridge_*` là sàn đá có hoa văn, không phải gỗ; sàn gỗ nâu là `WoodBridgeDark_*`.

## Phần đoán / ước lượng

- Vị trí thùng (ảnh không có dữ liệu thùng): 4 thùng quanh mỗi trại + rải cạnh bìa rừng cách nhau ≥ 260 px [ƯỚC LƯỢNG].
- Loại thùng → sprite `Chest_*` đoán theo hình (bao tải = thức ăn, hộp trắng = y tế, tím = thùng quái).
- Số quái mỗi trại (3 + tinh anh ở vài trại) và tuần tra [ƯỚC LƯỢNG]; HP Brawler 50/80, Cannoneer/Gunner/
  Researcher 40 [WIKI]; Wizard 40, Guardian 60 [ƯỚC LƯỢNG].
- Ánh xạ sprite → loại khỉ: macaque_1 = Gunner (có khung né), macaque_2 = Wizard, macaque_3 = Researcher,
  ape_1 = Brawler, ape_2 = Cannoneer, ape_3 = Guardian [ĐOÁN theo hình].
- Khung hoạt ảnh khỉ: 0-7 đứng, 8-15 chạy, 16 chết [ĐO trên sheet 17 khung].
- Ba điểm rút lui ở ba đầu đường cụt rìa bản đồ, đứng 5 giây [ĐOÁN, brief].
