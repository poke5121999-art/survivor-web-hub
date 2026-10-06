# Ác Quỷ II · Act I

Bản làm lại Act I của Diablo II bằng canvas/JS thuần, không engine, mở được từ `file://`.
Gồm Rogue Encampment, Blood Moor, Den of Evil. Ba lớp chơi được: Amazon, Sorceress, Barbarian. Bốn lớp còn lại đã có hình và số liệu nhưng đang khoá.

## Luật của chủ dự án

- 2026-10-06: **dùng bộ asset và config của Diablo II** từ bản D2R ở `D:\Diablo2`. Bỏ hẳn art Flare của ngày 2026-10-01.
- Hình, tiếng, bản đồ, số liệu đều lấy từ game gốc. Không vẽ tay, không tự chế số.

## Nguồn

Bản D2R 3.1.91636. Kho CASC được giải nén ở `D:\d2r-ref`, bóc ra `D:\d2r-ref\fs\data\data\{global,local}`.

| Phần | File gốc | Lever (chạy lại được) | Ra |
|---|---|---|---|
| Nhân vật, quái, NPC | `global/chars`, `global/monsters` (DCC + COF), `animdata.d2` | `_tools/build_sprites.py` | `assets/sprites.js`, `img/{hero,mon,npc}_*` |
| Vật thể, đạn, overlay, đồ rơi | `global/objects`, `missiles`, `overlays`, `items/flp*` | `_tools/build_objects.py` | `assets/sprites_obj.js`, `img/{obj,mis,ovl,flp}_*` |
| Tile, bản đồ mẫu | `global/tiles/act1/**` (DT1 + DS1), `lvlprest/lvltypes/lvlmaze.txt` | `_tools/build_world.py` | `assets/world.js`, `assets/maps.js`, `img/tiles_*` |
| UI, icon đồ, icon kỹ năng, tiếng, nhạc | `global/ui` (DC6), `items/inv*`, `sfx/*.flac`, `music/act1` | `_tools/build_ui.py` | `assets/ui.js`, `img/{ui,inv}_*`, `sfx/`, `music/` |
| Số liệu | `global/excel/*.txt` của 3.1, chuỗi `local/lng/strings` | `_tools/build_data.py` | `js/data.js` |

Bộ giải mã DCC, DC6, DT1, DS1, COF, palette là `_tools/d2fmt.py`, port từ OpenDiablo2. Bộ đóng atlas WebP là `_tools/d2pack.py`.
Hợp đồng dữ liệu giữa các lever và engine nằm ở `brain/plans/diablo2-d2r.md`.

Không sửa tay `js/data.js` hay `assets/`. Sửa lever rồi chạy lại:

```sh
PYTHONIOENCODING=utf-8 python games/diablo2/_tools/build_data.py
PYTHONIOENCODING=utf-8 python games/diablo2/_tools/build_sprites.py
PYTHONIOENCODING=utf-8 python games/diablo2/_tools/build_objects.py
PYTHONIOENCODING=utf-8 python games/diablo2/_tools/build_world.py
PYTHONIOENCODING=utf-8 python games/diablo2/_tools/build_ui.py      # cần ffmpeg
```

Đọc kho CASC: `D:\d2r-tools\CASCExplorer\CASCConsole` (WoW-Tools/CascLib có hỗ trợ D2R, product `osi`), build bằng `dotnet build -c Release -f net9.0`.
Ví dụ: `CASCConsole.exe -m Pattern -e "data/data/global/*" -d D:\d2r-ref\fs -l enUS -p osi -s <thư mục game>`. Đặt `CASC_LIST=1` thì chỉ liệt kê.

## Mã

| Tệp | Việc |
|---|---|
| `js/drlg.js` | Sinh bản đồ. Doanh trại là DS1 gốc. Blood Moor ghép stamp DS1 như `act1_overworld.go` của OpenDiablo2. Den of Evil là mê cung phòng 24×24 tile |
| `js/engine.js` | Vẽ tile theo 3 lượt như `d2maprenderer`, sprite 8/16 hướng, nhân vật ghép lớp theo COF |
| `js/rules.js` | Hàm thuần: nhân vật, chỉ số, trúng đòn, sát thương kỹ năng, XP, rơi đồ |
| `js/game.js` | Vòng lặp, máy trạng thái thực thể, AI quái, nhiệm vụ, lưu `localStorage` |
| `js/ui.js`, `js/input.js` | HUD, các bảng, chuột + bàn phím, cảm ứng ngang |

## Đơn vị

- Thế giới tính bằng **subtile** của D2. Một tile có 5×5 subtile.
- Chiếu ra màn hình: `sx = (x - y) * 16`, `sy = (x + y) * 8`. Tile vẽ 1:1 (160×80 px).
- Tốc độ lấy thẳng từ bảng (subtile/giây): `WalkVelocity` 6 và `RunVelocity` 9 của người chơi, `Velocity`/`Run` của quái.
- Hướng là số thực `[0, 8)`: 0 là Tây trên màn hình, tăng theo chiều kim đồng hồ. Sprite 8 hướng và 16 hướng dùng chung giá trị này.

## Bẫy

- `[BẪY ĐÃ SẬP]` Hình HD của D2R là mô hình 3D. Art 2D cổ (DCC, DT1...) vẫn nằm nguyên trong kho CASC, ở `data/data/global`.
- `[BẪY ĐÃ SẬP]` Lớp vật thể (lửa trại, đuốc) có phần trong suốt riêng ở `anim.fx`. Lúc đầu `sprites_obj.js` xếp khung theo `[hướng][khung]`, lửa trại chỉ hiện khung đầu. Giờ lever xoay về `[khung][hướng]` như hợp đồng.
- `[BẪY ĐÃ SẬP]` Stash trong objects.txt có tên lớp `Bank`, không phải `Stash`.
- `[BẪY ĐÃ SẬP]` Doanh trại D2 có hàng rào. Test đi thẳng tới lối ra sẽ kẹt, nên `test/diablo2-suite.js` bấm theo đường A* (`D2DBG.path`).
- `[ĐO TRONG REPO]` 3.1 đổi Sword Mastery thành Blade Mastery, AR 40 + 8/cấp (skills.txt `Param1`, `Param2`).
- Python ghi `game.js` đôi khi trả `OSError 22` trên Windows. File không bị hỏng, thử lại là được.

## Kiểm

```sh
node test/diablo2-rules.js   # số liệu so với bảng 3.1
node test/diablo2-drlg.js    # 50 seed mỗi khu: tới được mọi lối ra và đàn quái
node test/diablo2-suite.js   # Playwright: chuột thật, cảm ứng 932×430
```

## Chưa có

- HUD và các bảng vẫn là DOM tự vẽ. Art DC6 của D2 đã có trong `assets/ui.js` nhưng chưa dùng.
- Cold Plains, Burial Grounds, lính đánh thuê, Nightmare/Hell.
- Hero chỉ 8 hướng, chưa có mode TH/KK/S1–S4. Ngân sách hình nhân vật là 22 MB.
- Đổi màu quái (champion, unique) theo colormap của D2.
