# Ghi công

Toàn bộ hình ảnh và âm thanh trong `games/diablo2/assets/` lấy từ **Flare** (flare-game), do cộng đồng Flare làm:

- Dự án: https://github.com/flareteam/flare-game (engine: https://github.com/flareteam/flare-engine)
- Tác giả: Clint Bellanger, Justin Jacobs và những người đóng góp art, nhạc, tiếng trong flare-game (danh sách đầy đủ ở `CREDITS.txt` trong kho flare-game).
- Giấy phép: **Creative Commons Attribution-ShareAlike 3.0 (CC-BY-SA 3.0)** — https://creativecommons.org/licenses/by-sa/3.0/

Phần art/tiếng đã chỉnh sửa này cũng được phát hành theo CC-BY-SA 3.0 (chia sẻ tương tự). Mã của game này không phải của Flare.

## Thư mục Flare đã dùng

Từ mod `fantasycore`:
- `animations/` + `images/` của `enemies`, `avatar/female`, `avatar/male`, `powers`, `npcs`, `loot`
- `images/tilesets` + `tilesetdefs` (grassland, cave, dungeon)
- `images/icons/icons.png`
- `soundfx/` (enemies, powers, inventory, steps, environment, âm nhân vật) và `music/` (town, overworld, cave, dungeon, boss)
- `engine/hero_layers.txt` (thứ tự vẽ lớp nhân vật)

Từ mod `empyrean_campaign`:
- `maps/*.txt` và `items/` chỉ để **đọc dữ liệu** (học bảng autotile, tên icon). Không có bản đồ Flare nào được dùng để chơi.

## Đã chỉnh sửa gì

- Mọi ảnh thu nhỏ còn 1/2 (Lanczos), cắt từng khung hình, đóng lại thành atlas mới và lưu WebP (chất lượng 80, có alpha). Toạ độ và độ lệch trong `assets/manifest.js` là sau khi thu nhỏ.
- Chỉ giữ một phần các lớp nhân vật, quái, kỹ năng; icon, tileset cũng đóng lại.
- Nhạc được mã hoá lại Ogg Vorbis mono 64 kbps. Tiếng hiệu ứng chép nguyên bản.
- Chỉnh sửa trên tile của `tileset_grassland`: ô nước 176..191 căn lại giữa ô; hai tile ván cầu 200/201 được sao thành 400/401 với phần nước tối bên dưới làm trong suốt; điểm ảnh đen đặc trong các tile vách đá (48..71, 144..159) đổi thành màu đá tối. Hàng rào, lều, đe, rương, lửa trại, cổng waypoint là tile Flare nguyên gốc (id ghi trong `townObjects` của manifest).
- Bảng autotile (`autotile` trong manifest) do `_tools/build_assets.py` tính từ bản đồ Flare; đó là số liệu thống kê, không phải nội dung bản đồ.

Chạy lại: `python games/diablo2/_tools/build_assets.py` (cần bản clone Flare ở `D:\flare-ref` hoặc biến môi trường `FLARE_REF`).
