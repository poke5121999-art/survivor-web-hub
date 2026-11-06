# Tốc Độ: việc còn lại (bàn giao 2026-10-09)

Bối cảnh: `brain/plans/toc-do.md` (yêu cầu, đích, bài học), `games/toc-do/README.md` (hợp đồng dữ liệu, cách chạy, bẫy).
Bản đang chạy trên Pages là commit `53306337`, rev `20261009a`:
`https://poke5121999-art.github.io/survivor-web-hub/games/toc-do/index.html`.

## 0. Trạng thái lúc bàn giao

- Đã đẩy và đã chạy trên Pages: sảnh → tải → intro → đếm ngược → đua 2 vòng → kết quả, cả 3 đường, 8 xe, 2 tay đua.
- Kiểm trên máy: `node test/toc-do-sim.js` 33/0, `node test/toc-do-assets.js` 8/0, `node test/toc-do-ui.js` 20/1.
  Test đỏ là nút chọn tay đua cao 29 px; CSS đã sửa trong commit `53306337`.
- Kiểm trên Pages (`TD_URL=... node test/toc-do-ui.js`, log ở `/tmp/claude-1000/pages-ui.log`): 20/1.
  - Phần cảm ứng 844×390 qua hết, kể cả `elementFromPoint` và phép thử chạm hai ngón.
  - Test đỏ duy nhất là "Esc mở bảng tạm dừng". Nghi do chờ cứng 300 ms trên máy ảo chậm: test tiếp theo bấm
    "Tiếp tục" vẫn qua, tức bảng có mở (xem mục 1).
- **Hai tệp sửa chưa commit, chưa kiểm:**
  - `games/toc-do/js/view/fx.js`: thêm pháo hoa vạch đích (`finish_firework` gốc, `fwSpark`/`fwFlash`).
  - `games/toc-do/js/main.js`: bỏ biến thừa `c` trong nhánh intro.

## 1. Việc phải làm trước (đóng bản hiện tại)

1. Sửa test Esc trong `test/toc-do-ui.js`: thay `waitForTimeout(300)` bằng `until(...)` chờ `TD.main.paused`, giống các test khác.
2. Kiểm pháo hoa: chạy `node /tmp/claude-1000/play.js` (hoặc viết lại theo `test/toc-do-ui.js`) tới màn kết quả, mở ảnh xem.
   - Trong `fx.js` số gốc đã thu lại (speed 9–16, size 0.5–0.9). Pháo nổ quá xa hoặc quá to thì chỉnh ở `F.reset`.
3. Tăng rev ở mọi chỗ cùng lúc:
   - `games/toc-do/index.html`: thay hết `?v=20261009a`, kể cả `window.TD = { REV }`.
   - `data/games.js`: trường `rev` của mục `toc-do`.
4. Commit: chỉ `git add` đúng tệp của mình (cây đang có việc dở của agent khác). Đẩy lên, chờ Pages, chạy lại
   `TD_URL=https://poke5121999-art.github.io/survivor-web-hub node test/toc-do-ui.js`.
   - Chạy nền, vì bài này mất khoảng 10 phút trên swiftshader.

## 2. Hình còn sai (đã thấy bằng ảnh chụp)

- **Phố Tàu:** đường đất cháy sáng vàng (`/tmp/toc-do-shots/chinatown-drift1-960.png`). Nghi lightmap ×2 cộng nắng cộng bloom
  trên texture địa hình hai lớp. Đo `lightonly`/`albedoonly` như mục "Bẫy đã sập" của `toc-do.md` rồi chỉnh theo
  `meta.sunScale` từng đường. Đừng hạ bloom chung.
- **Thành Troy:** không có lightmap nướng sẵn, nên mặt đường xám nâu và tối hơn `~/zingspeed-ref/work/track/ref_troycity.png`.
- **Thành Troy:** có lúc thấy một xe bot lơ lửng cao trên cầu vượt. Cần kiểm xem đó là đường trên cao thật hay bot rơi khỏi ruy băng.
  - Gợi ý: kiểm `k.loc.y` so với `k.y` và `k.grounded`.
- **Phố Tàu nặng:** 350k tam giác, 8,5 MB, phần lớn là cây LOD0. `tools/export_track.py` nên lấy LOD1 cho cây.
- **Lửa drift:** đốm lửa bay ngược về gần camera trông to (`fireSheet`, `fire` trong `fx.js`). Bản gốc tia lửa sát bánh.
  - Thử bỏ `inheritVel` hoặc giảm đời sống.
- **Màu lightmap:** khu xuất phát Thành Phố 11 nằm dưới bóng công trình xanh nên tối; chưa so với tranh gốc.

## 3. Còn thiếu so với bản gốc

- **Tiếng (chưa ai nghe bằng tai):**
  - Bank xe và nhạc nền gốc (`Default_Vehicle.bnk`, `BGM_Default.bnk`, `InGameBase.bnk`) không có trong APK.
    Game tải chúng qua Puffer sau khi cài.
  - Tiếng máy, lốp rít là tổng hợp ở `js/view/audio.js`; phun, va chạm, nhạc là tiếng mượn (`subst` trong `data/audio.js`).
  - Không có giọng đếm ngược 3-2-1; đang dùng tiếng bíp.
  - Cần một người nghe: mức to tương đối, nhạc có lấn tiếng không, tiếng máy có chói không.
- **VFX gốc dạng mesh** (lửa DTS theo từng xe, `wind_trail`, `land_dust`, `wall_scrape`, `boost_flash`) chưa dựng.
  - `test/toc-do-assets.js` in ra 16/29 mục `TD.FX` chưa gọi.
- **Camera mở màn:** bản gốc có camera bay theo đường (`scenedynamicloadobj/scenecamerapath/level_11cityclassic.prefab`);
  bản web chỉ quay vòng quanh đoàn xe.
- **Xe:** tên xe là tên tự đặt (bảng tên gốc nằm trên server); chỉ số theo bậc, chưa nối với `carparams` riêng từng xe.
  - Bản gốc có biến thể màu sơn (`paint` trong `data/cars.js`) nhưng chưa có chỗ đổi màu.
- **Vật thể trên đường:** robot động, màn hình quảng cáo, thác nước của Thành Phố 11 bị bỏ khi xuất (xem `export.log`).
- **Chế độ chơi:** chỉ có đua tốc độ đơn. Không có đua đạo cụ, không có xếp hạng. Trận không có cảnh "về đích chậm" như gốc.
- **Lưu đám mây:** chưa nối `HubSave` (`games/BRIDGE.md`); hiện chỉ lưu `localStorage['td.save.v1']`.

## 4. Lệnh hay dùng

```sh
cd ~/survivor-web-hub
node test/toc-do-sim.js && node test/toc-do-assets.js
node test/toc-do-ui.js                                   # máy, ~10 phút, ảnh ở /tmp/toc-do-shots
TD_URL=https://poke5121999-art.github.io/survivor-web-hub node test/toc-do-ui.js
~/zingspeed-ref/venv/bin/python -I games/toc-do/tools/export_track.py Level_ChinaTown_New_Art.unity chinatown
python3 -m http.server 8811   # rồi mở http://localhost:8811/games/toc-do/tools/trackview.html?id=11citynew
```

Trong trình duyệt: `TD.main.timeScale = 4` để tua. Cho xe mình tự lái:
`TD.main.me.ctrl = 'bot'; TD.Bot.init(TD.main.me, TD.main.race, 0.9)`.

## 5. Khác biệt rút từ clip gốc (2026-10-09, skill watch-game-clips)

Khung hình: scratchpad phiên `c96d80b0…/game-clips/` (không vào git). Đã tự mở và xác nhận các mục đánh [thấy].

- [thấy] Drift gốc (cả xe kart thường): hai vệt sáng XANH mảnh kéo dài từ bánh sau, phun là tia xanh mảnh.
  Không có cụm lửa cam, khói, vệt lốp đen. https://youtu.be/7PlXVey-gBI?t=380 , https://youtu.be/p1ecZRtMGYI?t=244
- [thấy] Nitro gốc: một tia xanh, không có vạch trắng xuyên tâm nặng, không nhoè. https://youtu.be/p1ecZRtMGYI?t=485
- [thấy] HUD gốc: danh sách hạng có tên bên trái; đồng hồ lớn góc phải kèm "Kỷ lục"/"Vòng đơn"; nhãn trạng thái cạnh tốc độ
  ("Drift Thẳng Nhanh", "CW Boots", "Duy trì Nitro"); pad lái hình thoi một khối bên trái, nút DRIFT cam rất to bên phải.
  https://youtu.be/7PlXVey-gBI?t=345
- [thấy] Về đích: chữ GOAL khi xe còn chạy, rồi camera cận thấp ba phần tư vào tay đua ăn mừng, dải thống kê
  (drift, boost, va chạm, tốc độ TB), băng "kỷ lục mới". Sau đó cắt sang sân khấu bục 1-2-3 "CHAMPION", thẻ thưởng
  XP/xu, bảng xếp hạng (thời gian, số drift, số boost). https://youtu.be/7PlXVey-gBI?t=448 → t=482
- [thấy] Đếm ngược: số vàng nhỏ cạnh xe, không to giữa màn; vòng xoáy vàng ở xe lúc "1". Intro ~25 s giới thiệu từng
  tay đua có bảng tên. https://youtu.be/7PlXVey-gBI?t=308 , t=333
- [thấy] Camera gốc xa và rộng hơn (xe ~8% bề ngang), drift xe xoay 35–50° so với trục camera; bản web ~10–15°.
- [nói] Phun xuất phát cộng cả nitro; drift quá ngắn không được phun; phun đôi cách ~0,3 s. https://youtu.be/92kbCuZvo4Y?t=7 , t=140
- [thấy] Có chế độ luyện tập cắm cờ hồi về (chưa làm). https://youtu.be/wz6r3nirB7c?t=40

## 6. Đã làm ở rev 20261009b (2026-10-09)

Mục 1, phần lớn mục 2–3 và mục 5 đã xong: xe biến mất khi về đích (lò xo nảy phân kỳ khi dt lớn), pháo hoa bám xe,
Phố Tàu hết cháy (shader tuyến tính cho NssTerrain2Layer), khe cầu vượt Troy, VFX drift xanh, 24/29 mục TD.FX đã gọi,
camera mở màn gốc (11citynew), màu sơn + HubSave, HUD OneSide gốc + bảng hạng + giờ + nhãn trạng thái,
luật drift theo video (đánh dấu "chọn" trong tuning.js), chuỗi về đích GOAL → cận cảnh → bục `Podium.unity` → thẻ XP → bảng.
Kiểm trên máy: sim 47/0, assets 9/0, ui 21/0.

Còn mở:
- Tay đua trên bục đứng lệch ra sau bục (ảnh `finish-w-3pod-b.png`).
- Phố Tàu vẫn nặng: cây chỉ có LOD0 trong APK; hướng tiếp là instancing cây lặp (một bụi lặp 205 lần).
- `NssStandard` thiếu reflection probe nên chưa chuyển sang công thức tuyến tính.
- CWW cắt drift bằng Nitro + Drift, trữ 2 phun trong một drift: không có tham số gốc, chưa làm.
- Chế độ luyện tập cắm cờ, đua đạo cụ, xếp hạng; giọng đếm ngược (bank lõi không có trong APK).
- Lưu đám mây mới thử với HubSave giả, chưa thử tài khoản thật.
