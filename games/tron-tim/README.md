# Trốn Tìm

Dựng lại **Hide And Seek** (Heallios, Unity 2020.3, build ngày 2021-05-03), game trường cũ của chủ dự án.
Project Unity gốc đã mất. Mọi thứ của game gốc được bóc lại từ APK `PhanMinhTam.apk`.
Bản này là **solo**: 1 người chơi, 9 bot. Thiết kế và dạng dữ liệu: `DESIGN.md`.

Mở chơi: `games/tron-tim/index.html`. Vào thẳng trận: `?play=1`. Cố định bản đồ và vai: `?seed=N`.

## Phần nào lấy từ đâu

| Phần | Nguồn |
|---|---|
| Luật, số liệu, thời gian | Code C# của game gốc, dịch ngược bằng ilspycmd. Có dẫn dòng trong `D:\phanminhtam-ref\notes\gameplay.md` và `meta.md` |
| Bố cục bản đồ | Prefab `MapRandom1..3` và scene `mapgenerate`, qua `tools/build_map.py` |
| Toàn bộ UI | Cây RectTransform của game gốc, qua `tools/build_ui.py`, vẽ bằng `js/sk/ugui.js` |
| Nhân vật, hoạt ảnh, VFX, tiếng, ô bản đồ | Dữ liệu đã bóc của `games/soulknight`, qua `tools/extract_sk.js` |
| Kỹ năng | Hành vi viết mới trong `js/skills.js`. Số hồi chiêu, thời lượng lấy từ `TT_SKILLS86` của Soul Knight |

`D:\phanminhtam-ref` nằm ngoài git. README ở đó ghi cách dựng lại project Unity bằng AssetRipper.

## Dựng lại dữ liệu

```sh
node games/tron-tim/tools/extract_sk.js                              # data/sk-subset.js, art/sk, art/vfx, art/audio
PYTHONIOENCODING=utf-8 python -I games/tron-tim/tools/build_ui.py    # data/hs-ui.js, art/ui
PYTHONIOENCODING=utf-8 python -I games/tron-tim/tools/build_map.py   # data/hs-map.js, tools/map_preview.png
```

Soát bằng mắt (server tĩnh ở gốc repo):
- `tools/sk_viewer.html` cho nhân vật, ô, prefab, VFX;
- `tools/ui_preview.html` cho từng màn hình UI gốc.

## Mã

| Tệp | Việc |
|---|---|
| `js/match.js` | Máy trạng thái trận: intro, countdown, playing, ending. Có vai, đồng hồ, bo, cổng, quét, hộp. `TT.stepLayers` cho hệ thống ngoài |
| `js/actors.js` | Thực thể. `life` là enum, hiệu ứng là danh sách, tốc độ chỉ tính ở `TT.speedOf` |
| `js/bots.js` | Máy trạng thái bot theo `CaseBot` của game gốc. Đường đi Dijkstra theo ô |
| `js/map.js`, `js/render.js` | Ghép 3x3 ô bản đồ, vẽ bằng bộ ô rừng của SK. `TT.worldLayers` cho lớp vẽ thêm |
| `js/skills.js`, `js/audio.js` | 8 kỹ năng và bộ phát tiếng WebAudio riêng |
| `js/menu.js`, `js/hud.js`, `js/ui.js`, `js/save.js` | Menu, HUD, màn kết quả, tiến độ lưu ở `localStorage` (`tron-tim.save.v1`) |
| `js/sk/*` | Chép từ `games/soulknight/js`. `ugui.js` có sửa `canvasRect` cho CanvasScaler match 0.5 |

## Kiểm

```sh
python -m http.server 8814 & python -m http.server 8815 &
node test/tron-tim-core.js     # 53 ca: pha, vai, bắt, cứu, bo, cổng, hộp, bot tự chơi
node test/tron-tim-skills.js   # 60 ca: 8 kỹ năng, hồi chiêu
node test/tron-tim-ui.js       # 112 ca: menu, HUD, kết quả, tiền thưởng, chọn nhân vật, ngôn ngữ
```

Các bộ kiểm chạy được trên Pages bằng biến `TT_URL`.

## Khác game gốc

- Bàn không vỡ sau 4 lần nhảy.
- Trượt vũng rác kéo dài 1 giây. Mã gốc không có số này.
- Bo co tuyến tính, chưa dùng đường cong `ZoneCirclesSizeCurve`.
- Bot nhìn xuyên tường. Game gốc cũng chỉ xét tầm 9, không kiểm tầm nhìn.
- Nút Tham gia, Tạo, Bạn bè, Cửa hàng chỉ báo "Chế độ solo: chưa có".
- Thêm nút đổi Trốn/Tìm trong màn Thời trang để chọn nhân vật SK cho từng vai.
- Game gốc không có code kỹ năng trong bản build. 8 kỹ năng ở đây lấy từ Soul Knight.

## Bẫy đã gặp

- `[BẪY ĐÃ SẬP]` Đo kỹ năng ở chế độ `?manual=1` rồi bấm phím Space thì không thấy gì. Vòng lặp SK xoá cạnh phím mỗi khung hình, kể cả khi không bước trận. Muốn kiểm phím thật thì dùng `?play=1`; ở `manual` thì gọi `TT.skillPress()`.
- UTM_Neutra, font tiếng Việt của game gốc, không có tệp TTF trong APK. Thay bằng Pusia-Bold.
- Unity 2020.3.0f1 cài được trên máy nhưng license đã hết hạn, nên chưa chụp được UI gốc từ Unity để so.
