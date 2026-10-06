# Ác Quỷ II

Bản làm lại Diablo II bằng canvas/JS thuần, không engine, mở được từ `file://`.
Đủ 5 act: 131 khu sinh từ DS1 gốc (thiếu Moo Moo Farm và 5 khu phụ của Act V), bảy lớp với mọi kỹ năng,
triệu hồi và biến hình, lính đánh thuê, waypoint, rương, nhiệm vụ, trùm của cả 5 act, ba độ khó.

## Luật của chủ dự án

- 2026-10-06: **dùng bộ asset và config của Diablo II** từ bản D2R ở `D:\Diablo2`. Bỏ hẳn art Flare của ngày 2026-10-01.
- Hình, tiếng, bản đồ, số liệu đều lấy từ game gốc. Không vẽ tay, không tự chế số.

## Nguồn

Bản D2R 3.1.91636. Kho CASC được giải nén ở `D:\d2r-ref`, bóc ra `D:\d2r-ref\fs\data\data\{global,local}`.

| Phần | File gốc | Lever (chạy lại được) | Ra |
|---|---|---|---|
| Nhân vật, quái, NPC | `global/chars`, `global/monsters` (DCC + COF), `animdata.d2` | `_tools/build_sprites.py` | `m/hero_*`, `m/mon_*`, `m/npc_*` |
| Vật thể, đạn, overlay, đồ rơi | `global/objects`, `missiles`, `overlays`, `items/flp*` | `_tools/build_objects.py` | `m/obj_act*`, `m/mis`, `m/ovl`, `m/flp` |
| Tile, bản đồ mẫu | `global/tiles/act*/**` (DT1 + DS1), `lvlprest/lvltypes/lvlmaze.txt` | `_tools/build_world.py --acts 1,2,3,4,5` | `m/world_act*`, `m/maps_act*` |
| UI, icon đồ, icon kỹ năng, tiếng, nhạc | `global/ui` (DC6), `items/inv*`, `sfx/*.flac`, `music/*` | `_tools/build_ui.py` | `m/ui`, `a/sfx/`, `a/music/` |

Mọi đường ở cột cuối nằm trong `assets/`. Ảnh ở `assets/img/g/`. `assets/index.js` (`window.D2_INDEX`) cho biết
sheet, tileset, bản đồ nào nằm ở nhóm nào; engine chèn `<script>` của nhóm khi cần (`E.ensure*`). Hợp đồng v2 ở
`brain/plans/diablo2-d2r.md`.
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
| `js/drlg.js` | Sinh bản đồ: DS1 gốc cho khu preset, mê cung phòng theo `lvlmaze.txt`, ngoài trời ghép stamp DS1 như `act1_overworld.go` của OpenDiablo2 |
| `js/skills.js` | `D2S`: triệu hồi, lời nguyền, hào quang, biến hình, bẫy, võ thuật của 210 kỹ năng |
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
- `[BẪY ĐÃ SẬP]` HUD dựng trong `UI.init`, trước khi nhóm `m/ui` nạp xong, nên ra thiếu khung và cầu máu. Giờ `boot` gọi `UI.rebuildHud()` khi nhóm tới; suite có check riêng cho khung HUD.
- `[BẪY ĐÃ SẬP]` `build_ui.py` ghi tiếng ra `assets/a/sfx` nhưng chỉ mục vẫn trỏ `assets/sfx/`. Suite giờ ghi cả request hỏng (`requestfailed`), bỏ qua `ERR_ABORTED` vì đó là trình duyệt huỷ luồng nhạc khi đổi bài.
- `[ĐO TRONG REPO]` Trùm (Andariel, Blood Raven) không nằm trong đàn quái của khu; chúng là điểm đặt sẵn trong DS1 (`monpreset`). `spawnMonsters` đọc tên preset, so với `bosses` của khu.
- `[ĐO TRONG REPO]` Jerhyn không nằm trong DS1 nào của Act II; D2 đặt ông bằng script. Game đặt ông cạnh lối vào cung điện (`SCRIPTED_NPCS`).
- `[ĐO TRONG REPO]` Preset DS1 gọi superunique bằng tên hiện ("Radament") hoặc mã quái gốc ("summoner" = `the_summoner`).
- `[ĐO TRONG REPO]` TC rương là một thang trong nhóm 6 của TreasureClassEx (Act 1 Chest A level 0 tới Act 5 (H) Chest C level 85). `D2R.upgradeTc` nâng TC theo cấp, dùng cho cả quái.

## Kiểm

```sh
node test/diablo2-rules.js   # số liệu so với bảng 3.1
node test/diablo2-drlg.js    # 20 seed mỗi khu: tới được mọi lối ra và đàn quái
node test/diablo2-skills.js  # D2S: hiệu ứng từng loại kỹ năng
node test/diablo2-suite.js   # Playwright: chuột thật, cảm ứng 932×430
```

## Chưa có

- Moo Moo Farm; Matron's Den, Forgotten Sands, Furnace of Pain, Tristram (Act V), Colossal Summit: lever chưa đưa level 133–137 vào `maps_act5`.
- Valkyrie: `monsters/vk` của D2R chỉ có DCC giả, nên vẽ bằng thân Amazon giáp nặng.
- Baal ngồi ngai không đánh được; năm đợt quân đứng sẵn quanh ngai thay vì kéo tới theo đợt.
- Ba trùm giữ ấn ở Chaos Sanctuary đứng ở điểm xa lối vào; chưa có ấn để mở. Diablo ra khi cả ba đã chết.
- Vật phẩm nhiệm vụ chưa có hình trong túi đồ; Golden Bird trao ngay khi nhặt tượng ngọc.
- Đích "rescue/reach" của nhiệm vụ rút gọn thành "tới được khu".
- Hero chỉ 8 hướng, chưa có mode TH/KK/S1–S4. Ngân sách hình nhân vật là 22 MB.
- Đổi màu quái (champion, unique) theo colormap của D2.
