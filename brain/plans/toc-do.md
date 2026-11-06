# Tốc Độ: Zing Speed Mobile trên web (games/toc-do)

Yêu cầu chủ dự án 2026-10-09, nguyên văn:

> down apk zing speed về https://d.apkpure.com/b/XAPK/com.vng.speedvn?versionCode=1550037413 rồi làm 1 game giống vậy
> trên web, rút kinh ngiệm từ việc các game khác về việc thiếu asset, vfx, feeling, ... -> nhớ làm cho kỹ
>
> (nhắn thêm) bạn tự xử full đi

Hợp đồng dữ liệu, quy ước toạ độ, chủ sở hữu tệp: `games/toc-do/README.md`.

## Bài học mang sang (từ Dredge, Diablo2, Hố Xanh, Vực Săn)

1. Bóc từ game gốc, không vẽ bằng code. Thiếu cái gì thì ghi rõ là thiếu và vì sao.
2. Bóc xong phải nối dây: mỗi asset trong `data/*.js` có ít nhất một chỗ gọi, có bài kiểm đếm.
3. Số liệu cảm giác (lái, drift, phun) đọc từ `carparams` gốc, ghi nguồn từng số.
4. VFX đọc tham số ParticleSystem gốc, không đoán màu và cỡ.
5. Chụp ảnh và mở ra xem bằng mắt, ở 1366×650 và 844×390 cảm ứng.
6. Kiểm input bằng chuột, phím, chạm thật; thêm phép thử `elementFromPoint`.
7. Tiếng nạp sẵn khi mở khoá âm thanh. Có công tắc nhạc, tiếng, rung màn.
8. Xong là đã đẩy lên Pages và kiểm trên Pages.

## Đích (vị từ kiểm được)

1. Sảnh: chọn xe (≥ 6 xe kart gốc, có tên và chỉ số), chọn đường đua, bấm ĐUA.
2. Trận: 6 xe (1 người, 5 bot), đếm ngược 3-2-1 có tiếng, chạy đủ số vòng, bảng kết quả xếp hạng.
3. Lái: drift làm đầy thanh nitro, thả drift rồi bấm phun ra phun nhỏ, nitro 2 ô, đập tường mất tốc.
4. VFX gốc: tia lửa drift, khói lốp, vệt lốp, lửa ống xả khi phun, vệt tốc độ, rung camera, nới FOV khi phun.
5. Đường đua 3D gốc có lightmap; xe kart gốc; tay đua ngồi trong xe.
6. `node test/toc-do-*.js` xanh trên máy và trên Pages (`TD_URL`).

## Nhánh song song (pha 1, mỗi nhánh một tập tệp riêng)

| Nhánh | Tệp | Trạng thái |
|---|---|---|
| Đường đua | `tools/export_track.py`, `art/tracks/` | xong |
| Xe | `tools/export_cars.py`, `art/cars/`, `data/cars.js` | xong |
| Tay đua | `tools/export_driver.py`, `art/drivers/`, `data/drivers.js` | xong |
| Tiếng | `tools/export_audio.py`, `audio/`, `data/audio.js` | xong |
| VFX/UI | `tools/export_fx_ui.py`, `art/fx/`, `art/ui/`, `data/fx.js`, `data/ui.js` | xong |
| Mô phỏng | `tools/export_track_logic.py`, `data/tracks.js`, `js/sim/`, `test/toc-do-sim.js` | xong |
| UI gốc | `tools/build_ui.py`, `data/ugui.js`, `art/ugui/`, `js/ui/ugui.js` | xong |

Pha 2 (tích hợp, xong 2026-10-09): `index.html`, `js/main.js`, `js/view/*`, `js/ui/*`, `css/game.css`.
Kiểm: `node test/toc-do-sim.js` (33), `test/toc-do-assets.js` (8), `test/toc-do-ui.js` (21, phím 1366×650 + chạm 844×390).

## Còn mở

Danh sách bàn giao chi tiết: [[plans/toc-do-con-lai]].

- Chưa ai nghe tiếng bằng tai. Toàn bộ tiếng là bản thay thế (bank xe/nhạc gốc không có trong APK); tiếng máy, lốp rít tổng hợp.
- Texture trong APK là bản xem trước 128–256 px; bản HD tải sau khi cài. Phố Tàu nặng (350k tam giác, 8,5 MB).
- Thành Troy không có lightmap nướng sẵn nên mặt đường tối hơn tranh gốc.
- VFX gốc dạng mesh (lửa DTS, FenghenSmall) dựng lại bằng hình đơn giản mang texture gốc; 16/29 mục TD.FX chưa gọi.
- Tên xe là tên tự đặt (bảng tên gốc tải từ server); chỉ số xe theo bậc, chưa nối với carparams từng xe.

## Bẫy đã sập

- three r140 + WebGL2: texture GLTFLoader đánh dấu sRGB được tải dạng SRGB8_ALPHA8, GPU tự giải về tuyến tính lúc đọc.
  Shader đường đua tính trong gamma như bản gốc nên mọi albedo tối hẳn (mặt đường đo 0,31 trong ảnh, ra 0,08 trên màn).
  Sửa: đặt `encoding = LinearEncoding` cho texture của shader gamma (`js/view/track.js`). Đã thử nâng sáng riêng mặt đường
  trước đó: sai chỗ, đã gỡ.
- `index.jsonl` không có tên CAB nội bộ nên `zs.load_with_deps` không nạp được bundle phụ thuộc; mỗi bộ xuất tự dựng bảng
  CAB (cache ở `~/zingspeed-ref/work/*/cabmap.json`).
- `#boot { display: grid }` đè thuộc tính `hidden`: phải đặt `style.display = 'none'`.

## Đã biết từ APK

- Unity 2019.4.41f1, 13.769 bundle không mã hoá. Đường đua có cặp scene `Level_X_Art.unity` (hình) và `Level_X.unity`
  (logic); dữ liệu logic nằm ở `assets/artwork/environments/e_x/model/pick/` (CheckPointConfig mỗi 10 m có mép trái phải).
- Va chạm đường gốc là Havok HKX nén (`Pick_Track`, `Pick_Wall`), không đọc. Thay bằng ruy băng từ TrackPointDataList.
- Trọng lực đường 11CityNew: −63,75. Vòng chính dài 4.770 m.
- Bank tiếng lõi (xe, nhạc nền) không có trong APK: tải qua Puffer sau khi cài.
