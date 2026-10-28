# So bản web với Stickman Hook gốc

Ngày so: 2026-10-28, chụp lại 2026-10-29. Bản web: Pages `?v=20261028f`, local `?v=20261028i`, khung điện thoại 390×844, DPR 2, chụp bằng Playwright.
Mỗi cặp ảnh nằm ở `shots/stickman-hook/parity/<key>.png` (web bên trái, tối đa 2 khung gốc bên phải, vùng đo viền xanh lơ).
Số đo màu lấy từ `shots/stickman-hook/parity/report.json`. Nhãn từng cặp ở `D:/stickman-hook-ref/parity/verdicts.tsv`, cổng `parity.py check` thoát 0.

## Vòng sửa 20261028i (2026-10-29)

Chụp lại phía web trên server local (`?v=20261028i`) cho cả 33 cặp, dựng lại ảnh ghép, xem từng cặp đã sửa. Cổng `parity.py check`: ok 27, version 16, not-built 6, web-bug 0.
Cảnh chụp mới: `l44_finish` / `l44_finish_late` (màn 44, skin Stick Hat, khung 360×800 = tỉ lệ clip 576×1280, đặt người chơi trước vạch, chụp +0.45 s / +0.9 s).
`map.tsv`: n02 → `l44_finish`, n03 → `l44_finish_late`. Khung gốc n03 0:14.9 là cảnh khác (clip cắt), dời sang `parity/ref_off/`.

| Key | Trạng thái 20261028i |
|---|---|
| n02, n03 | **Zoom khớp.** Web zoom đúng từ trước (ZoomOnPlayer 2 trong 0.5 s); ảnh cũ chụp màn 1 lúc +0.25 s (zoom 3.34). Clip qua vạch ~0:13.25 (chữ STAGE hiện), khung 0:13.7 = +0.45 s. Cùng thời điểm, cùng skin thì người chơi to như gốc |
| n02 | **Chữ hai dòng khớp.** `FinishText` rộng bằng canvas: 600 đơn vị ở 9:20, "Stage 44 Completed" 613.6 → hai dòng; "Stage 1 Completed" 562.9 vừa một dòng ở cả gốc. Không đổi code |
| p05, n03, o04, r03 | **Đã sửa** pháo giấy: prefab thật `ConfettisLeft` của `PlayerController`, nón 20° theo hướng bay, 70 mảnh, 5 màu gốc, mảnh bo góc lật 3D, dampen mỗi khung. Hết `web-bug` |
| n05, p07 | **Đã làm** trang chính bằng art gốc (HomePage, MenuBar, XpRoadHomeBar). Còn `not-built`: VIP Bundle / No Ads, thẻ bài |
| n06, p12 | **Đã làm** Tuỳ biến bằng art gốc. Còn `not-built`: lật trang (web cuộn), nút FIND |
| n11 | **Đã làm** Đường XP bằng art gốc. Còn `not-built`: thẻ thưởng đúng prefab lúc chạy |
| n12 | **Đã làm** Chế độ bằng art gốc (thẻ GameModeItemUi + ảnh minh hoạ). Chế độ không có thẻ gốc vẽ thẻ thấp |
| n09 | **Đã làm** trang Đua bằng art gốc. Còn `not-built`: avatar skin, nút quảng cáo +1 vé / SKIP |
| n10 | Không đổi (`ok`) |

Lệch màu nền còn lại (n01, n07, n13, p01-p04, p08, r01-r03, n02 nền) đều là `version`: bộ màu 2019 / server 2026 khác APK.

## Vòng sửa 20261028h

Chụp lại phía web trên server local (`?v=20261028h`) cho 24 cặp gameplay, dựng lại ảnh ghép, xem từng ảnh. Cổng: ok 18, version 15, not-built 6, web-bug 2.
Cảnh chụp mới trong `tools/extract/capture-web.js` (bản của `D:/stickman-hook-ref/clips/tools/` thêm cảnh; `SH_URL` trỏ server local; `map.tsv` đã trỏ): `l1_finish_late` (+0.8 s), `l1_piggy`, `l1_podium`, `race_finish_jump` (đặt người chơi lên vạch).
Bảng dưới (cột "Khác") là trạng thái lúc so lần đầu `20261028f`; trạng thái mới ở đây.

| Key | Trạng thái 20261028h |
|---|---|
| p01, p02, o03 | **Đã sửa.** Vòng nét đứt quanh điểm móc gần nhất, vòng sáng FX_Spawn lúc xuất hiện, HUD pause + "1 ▬ 2". Đáy nền 2019 xanh ngọc là bộ màu khác (`version`) |
| p03, n01 | **Đã sửa.** Dây mặc định trắng 0.03 đơn vị |
| p04, n02 | **Đã sửa.** "STAGE n COMPLETED" hiện ngay ở 20 %, #9FFF54 + trắng. "LEVEL CLEARED" của 2019/2023 là `version` |
| p05, n03 | **Đã sửa** tư thế bay suốt slow-mo, không nhảy, không "tap to continue". **Còn lệch:** pháo giấy toả về phía trước, gốc toả quanh người (`web-bug`, prefab chưa tìm thấy) |
| p06, o05 | **Đã làm** trang kết thúc 9.9.60 (so clip 2026 0:27.6). Khung 2019/2023 là `version` |
| n04 | **Đã làm** màn heo đất toàn màn hình. **Chưa làm:** thanh bộ sưu tập khi đầy, nút VIP Skip |
| p08 | **Đã sửa.** Người chơi ở 0.30 bề ngang (ForwardFocus 0.25 đọc từ scene) |
| p09, p10, p13, o01 | **Đã sửa.** Đáy nền mang màu effect của theme |
| o02 | **Đã sửa.** Màn 93-96 tím: theme đổi mỗi 4 màn |
| n07, n13 | `version`: bộ màu server 2026 khác APK |
| r01 | **Đã sửa.** Số đếm đỏ trên vòng ô của người chơi |
| r02, r03 | **Đã sửa.** "1ST" ngay khi về đích, danh sách "#n tên" góc phải theo 9.9.60 ("ME: n" của 2019 là `version`) |
| p07, p12, n05, n06, n09, n11, n12, r04 | Chưa đụng (vỏ menu, mục 8 của đề bài) |

## Clip đã dùng

| Mã | Clip | Ngày đăng | Khung | Ghi chú |
|---|---|---|---|---|
| `p` | [FjyN689e-Eg](https://www.youtube.com/watch?v=FjyN689e-Eg) GoGy Games, "Full Gameplay Walkthrough", 1:05:23 | 2019-01-02 | 1280×720 ngang | **Clip chủ dự án gửi, nguồn chính.** Là bản chạy trên trình duyệt (góc phải ghi "ALSO FREE ON App Store / Google Play", nút CLASSIC). Màn Normal 1-11, Challenge từ khoảng phút 49 |
| `n` | [8qpsOxGtjz8](https://www.youtube.com/watch?v=8qpsOxGtjz8) Soz | 2026-06-19 | 576×1280 dọc | Bản Android mới nhất tìm được, gần 9.9.60 nhất. Màn 44-55, Challenge 3, trang chủ, tuỳ biến, vòng quay, Tournament |
| `o` | [P-oO2JGKUo8](https://www.youtube.com/watch?v=P-oO2JGKUo8) NOE GamePlay | 2023-01-04 | 720×1280 dọc | Màn 91-100 |
| `r` | [FPXloLY_12g](https://www.youtube.com/watch?v=FPXloLY_12g) Amy Fallowfield, "Race" | 2019-01-13 | 608×1080 dọc | Chế độ Đua bản 2019 |

Clip 2019 và 2026 khác nhau nhiều ở UI và bộ màu. Khác biệt chỉ có ở một phiên bản được ghi nhãn `version`, không sửa theo.

## Từng khoảnh khắc

Mức: **gameplay** (đổi cách chơi hoặc thông tin người chơi cần), **look** (nhìn thấy rõ), **minor**.

| Key | Gốc | Khớp | Khác | Mức |
|---|---|---|---|---|
| p01-l1-spawn | [p 0:05.8](https://youtu.be/FjyN689e-Eg?t=5) | Bố cục màn 1 | Đáy nền web `#F8FDFF` gần trắng, gốc `#1FCB9E`. Gốc có vòng sáng lúc xuất hiện, web không có gì. HUD khác (xem p03) | look |
| p02-l1-bounce | [p 0:06.4](https://youtu.be/FjyN689e-Eg?t=6) | Thanh nảy biến dạng thành vòm khi đáp, có ở cả hai | Gốc vẽ vòng nét đứt quanh điểm móc gần nhất, web không vẽ | gameplay |
| p03-l1-swing | [p 0:08.2](https://youtu.be/FjyN689e-Eg?t=8) | Bục trái, 1 điểm móc, vạch đích, sàn. Vòng móc cao ~4.5-4.9 % màn ở cả hai, nên zoom 5 đúng | Dây gốc trắng mảnh, web đen `#0d1b2a` dày. HUD gốc: nút pause và thanh tiến độ "1 ▬ 2"; web: ⌂ ☰ LEVEL 1 ♪ ↻ ★ | look |
| p04-l1-finish | [p 0:08.8](https://youtu.be/FjyN689e-Eg?t=8) | Slow-mo, zoom vào người chơi, tư thế bay ngang, pháo giấy nhiều màu | Gốc hiện "LEVEL CLEARED!" ở ~15 % chiều cao ngay lúc chạm vạch. Web lúc +0.25 s chưa có chữ | look |
| p05-l1-finish-late | [p 0:10.0](https://youtu.be/FjyN689e-Eg?t=10) | Pháo giấy | Gốc vẫn bay ngang trong slow-mo. Web nhảy múa từ 0.6 s, chữ "LEVEL 1 COMPLETED" ở 30 %, "TAP TO CONTINUE" ở 62 % | look |
| p06-podium | [p 0:10.6](https://youtu.be/FjyN689e-Eg?t=10) | — | Gốc sang màn podium: "STICKMAN HOOK / LEVEL 1/5", skin nhảy trên bục caro, nút ▶. Web không có màn này | look |
| p07-title | [p 0:01](https://youtu.be/FjyN689e-Eg?t=1) | Chữ STICKMAN HOOK | Trang chủ bản trình duyệt 2019 (`version`) | minor |
| p08-l3-swing | [p 0:27.5](https://youtu.be/FjyN689e-Eg?t=27) | Vòng móc, tư thế khi móc | Gốc giữ người chơi ở ~30 % bề ngang khi bay sang phải. Web ở ~50 % (log: x 11.58, camera 11.40) | gameplay |
| p09-l6-orange | [p 1:00](https://youtu.be/FjyN689e-Eg?t=60) | Đỉnh `#FAC860` / `#F9C758` | Đáy gốc hồng `#DD7B6E`, web trắng `#FFFEFA` | look |
| p10-l11-green | [p 2:15](https://youtu.be/FjyN689e-Eg?t=135) | Đỉnh `#9EC962` / `#9ECD5D`, tâm điểm móc vàng | Đáy gốc vàng `#CEBE50`, web trắng | look |
| p12-skin-select | [p 2:09](https://youtu.be/FjyN689e-Eg?t=129) | — | Dải skin "FINISH LEVELS" của bản 2019 (`version`) | minor |
| p13-challenge | [p 49:10](https://youtu.be/FjyN689e-Eg?t=2950) | Đỉnh `#35C1CC`, điểm móc tâm đỏ, mũi tên ⇨⇨⇨ | Đáy gốc hồng (effect `#FD6AA3`), web trắng | look |
| n01-l45-swing | [n 1:06](https://youtu.be/8qpsOxGtjz8?t=66) | Đỉnh `#08B6F5` gần `#00B4FC` | Bộ màu 2026 khác (đáy vàng), hình màn 45 khác (`version`). Dây gốc trắng, web đen | look |
| n02-finish | [n 0:13.7](https://youtu.be/8qpsOxGtjz8?t=13) | Slow-mo, zoom, pháo giấy, tư thế bay | "STAGE 44 COMPLETED" hiện ngay ở ~15 %. Web chưa có chữ | look |
| n03-finish-late | [n 0:14.9](https://youtu.be/8qpsOxGtjz8?t=14) | Pháo giấy | Gốc không nhảy múa, không có "tap to continue" | look |
| n04-piggy | [n 0:18](https://youtu.be/8qpsOxGtjz8?t=18) | Có heo đất sau màn | Gốc: màn heo toàn màn hình (bóng skin + %), đầy thì popup UNLOCK / LOSE IT. Web: khung nhỏ (README ghi `[ĐỀ XUẤT]`) | look |
| n05-home | [n 3:18](https://youtu.be/8qpsOxGtjz8?t=198) | Xu, vé, thanh hạng | Gốc: skin lớn giữa màn, nút PLAY xanh lá có số màn, VIP/No Ads/Lucky Drop hai bên, thanh tab dưới. Web: chữ tiêu đề, nút Chơi vàng | look |
| n06-shop | [n 0:30](https://youtu.be/8qpsOxGtjz8?t=30) | Nhóm bộ sưu tập, icon gốc | Gốc: khung xem trước dây/skin/vệt, tab ROPES/SKINS/TRAILS, trang 1-7, thẻ vàng/xanh. Web: bảng DOM tối | look |
| n07-ch3-swing | [n 2:09](https://youtu.be/8qpsOxGtjz8?t=129) | Đỉnh `#3AB8C2` / `#3BC3C8`, mũi tên gợi ý | Đáy 2026 vàng (`version`). Dây web đen | look |
| n09-tournament | [n 3:21](https://youtu.be/8qpsOxGtjz8?t=201) | 10 người, cúp, thưởng | Gốc: trang tím, TOP PRIZES #1/#2/#3, avatar. Web: bảng DOM | look |
| n10-wheel | [n 4:35](https://youtu.be/8qpsOxGtjz8?t=275) | Art gốc: khung hồng, dải ô, xúc xắc, nút vàng | Chữ nút khác vì lượt đầu miễn phí | minor |
| n11-road | [n 0:16](https://youtu.be/8qpsOxGtjz8?t=16) | Thứ tự mốc thưởng | Gốc: cột dọc tím, thẻ thưởng lớn. Web: danh sách xanh lá | look |
| n12-modes | [n 4:22](https://youtu.be/8qpsOxGtjz8?t=262) | Danh sách chế độ | Gốc: thẻ ngang có ảnh nền theo chế độ. Web: danh sách DOM | look |
| n13-l47-yellow | [n 5:48](https://youtu.be/8qpsOxGtjz8?t=348) | Đỉnh `#FAC860` / `#FAC659` | 2026: màn 47-50 vàng trơn (`version`) | minor |
| o01-l91-green | [o 0:08](https://youtu.be/P-oO2JGKUo8?t=8) | Đỉnh `#A2CD63` / `#A5D860` | Đáy gốc vàng `#ECD84E`, web trắng | look |
| o02-l93-purple | [o 1:04](https://youtu.be/P-oO2JGKUo8?t=64) | — | Gốc màn 93-94 tím→xanh (`#7B449F`→`#5C78E1`), web xanh lá | look |
| o03-l97-blue | [o 2:56](https://youtu.be/P-oO2JGKUo8?t=176) | Vòng nét đứt quanh điểm móc gần nhất có ở gốc | Gốc màn 97-98 xanh lơ→xanh đậm (`#0EBFF5`→`#0A75E0`), web tím. Web không có vòng nét đứt | look |
| o04-stage-cleared | [o 3:36](https://youtu.be/P-oO2JGKUo8?t=216) | Slow-mo, zoom, pháo giấy | "LEVEL CLEARED" trắng ở ~8 % ngay khi chạm vạch, tư thế bay. Web khác chữ, vị trí, có nhảy múa | look |
| o05-podium | [o 1:36](https://youtu.be/P-oO2JGKUo8?t=96) | Như o04 | HUD gốc vẫn giữ thanh tiến độ "94 ▬ 95" lúc về đích | look |
| r01-race-start | [r 0:26](https://youtu.be/FPXloLY_12g?t=26) | 5 ô xuất phát có mặt ghost, ô người chơi khác màu | Gốc 2019: số đếm nằm trong vòng ô của người chơi, 5 ô xếp sát. Web: số "3" lớn giữa màn. Đáy nền web trắng, gốc xanh lá | minor |
| r02-race-mid | [r 0:28.5](https://youtu.be/FPXloLY_12g?t=28) | Ghost trong suốt có dây | Gốc có "ME: n" góc phải, web có "n/5" dưới tên màn | minor |
| r03-race-finish | [r 0:18](https://youtu.be/FPXloLY_12g?t=18) | Slow-mo, zoom, pháo giấy | Gốc hiện "1ST" lớn ở ~12 % và "ME: 1". Web không có chữ hạng lúc về đích | look |
| r04-race-result | [r 0:19.5](https://youtu.be/FPXloLY_12g?t=19) | Bảng thứ hạng, xu thưởng | Gốc: bục 1-2-3 có skin, nút x5. Web: khung DOM (README đã ghi chưa làm) | minor |

## Những gì đo được ngoài ảnh ghép

- **Gradient nền dùng màu "effect" của theme.** Đáy nền gốc trùng màu thứ hai của `theme.levelColors`, ở cả bốn bộ:
  - xanh → `#006EE7` (o03 đo được `#0A75E0`);
  - cam → `#FF7D79` (p09: `#DD7B6E`);
  - xanh lá → `#F3D248` (o01: `#ECD84E`);
  - tím → `#577DE9` (o02: `#5C78E1`);
  - Challenge → `#FD6AA3` (p13: hồng).

  Web vẽ `GradientVertical` màu trắng, nên đáy mọi màn gần như trắng (`#F8FDFF`, `#FFFEFA`, `#FCFEFA`).
- **Theme đổi mỗi 4 màn, không phải 5.** Ba clip của ba phiên bản đều cho thấy như vậy:
  - 2019: màn 1-4 xanh, 5-8 cam, 9 trở đi xanh lá. Đọc từ chữ "LEVEL n/m" trên podium.
  - 2023: màn 89-92 xanh lá, 93-96 tím, 97-100 xanh. Đọc từ HUD.
  - 2026: màn 43-46, 47-50, 51-54.

  `SetGameModeTheme` chia `GetMaxLevelAchieved` cho `nbLevelsPerTheme` [asm 0x118fb64..0x118fc00], nên công thức đúng. Chỉ có số 5 lấy từ `remote_settings_default.json` là lệch: server trả 4.
  Đã sửa: `tools/build_meta.py` đặt `NB_LEVELS_PER_THEME = 4`.
- **Điểm móc gần nhất không có phản hồi.** `A_PlotNearestFeedback` không có trong `atlas.webp`, dù đã bóc ra ở `D:/stickman-hook-ref/sprites/`. Vì thế `R.sprite` không vẽ gì, cả vòng nét đứt lẫn hiệu ứng xuất hiện.
  - Ảnh cận cảnh: `D:/stickman-hook-ref/parity/view/nearest.jpg`. Ba điểm móc web không có vòng, gốc 2023 có vòng nét đứt trắng.
- **Dây mặc định.** Texture `basic` trong `ropes.webp` là trắng (668/1278 điểm ảnh trắng đặc). Web vẽ dây mặc định bằng nét đen.
- **Vị trí người chơi theo chiều ngang khi đang bay sang phải.**
  - Gốc: 0.26-0.37 bề ngang (o02 0.32, o03 0.26, n 0:08.9 0.33, n 0:10.5 0.30, n01 0.31-0.35).
  - Web: 0.46-0.59 (log của l1, l6, l11, l94).
  - Người chơi web thấy phía trước ít hơn khoảng 0.2 bề ngang màn hình, tức ~0.9 đơn vị.
- **Không đo được bằng clip:** vận tốc đu trên màn hình (không có cặp màn cùng hình học cùng thời điểm), góc lật lúc nhả dây, chết và hồi sinh (clip không có cảnh rơi khỏi màn), tiếng.

## Chưa so

- Mechanical Grapple, Lucky Drop (Pachinko), Adventure, sự kiện Easter/Valentine: không tìm được clip có cảnh chơi.
  - Clip `n` chỉ có màn podium "GRAPPLE STAGE 54 COMPLETED" (4:21) và trang Lucky Drop (4:25).
- Màn Normal 1-20 trên bản dọc: chỉ có bản trình duyệt ngang 2019. Clip dọc tìm được (2018) chưa tải.
- Khung hình lúc bắt đầu màn: ở web, điểm móc đầu của màn 1 và 3 nằm sát mép phải (x 374/390). Không có clip dọc màn 1-3 để đối chiếu.

## Thứ tự nên sửa (lần so đầu; 1-10 đã sửa ở 20261028h, 11 làm ở 20261028i)

1. **Gradient nền trắng thay vì màu effect của theme.** Mức look, thấy ở mọi màn mọi chế độ, đã đo.
   - `js/render.js:88-98`: `drawBackgroundGradient` vẽ ảnh không tô màu.
   - `js/meta.js:198-200`: `colors()` bỏ mất `c[1]`.
2. **Điểm móc gần nhất không có vòng nét đứt, xuất hiện không có vòng sáng.** Mức gameplay: người chơi không biết sẽ móc vào điểm nào.
   - `tools/build_data.py:30`: danh sách sprite thêm không có `A_PlotNearestFeedback`.
   - Chỗ vẽ: `js/main.js:320-323`, `js/main.js:352-354`.
3. **Camera dẫn trước quá ít** (người chơi ở giữa màn thay vì ~30 % bên trái). Mức gameplay.
   - `js/main.js:282-284`: lead `0.2·vx` kẹp ±1.2, đuổi theo với hệ số `dt*6`, nên ở 8-10 đơn vị/s bị trễ ~1.5 đơn vị. Đây là số `[ĐỀ XUẤT]` trong README.
4. **Theme đổi mỗi 5 màn, gốc đổi mỗi 4.** Mức look.
   - `data/meta.json` `theme.perTheme` (từ `tools/build_meta.py:263`), dùng ở `js/meta.js:60`.
5. **Dây mặc định đen và dày, gốc trắng mảnh.** Mức look. `js/main.js:349` (`R.line(..., 0.045, '#0d1b2a')`).
6. **Về đích: web nhảy múa trên sân.** Gốc giữ tư thế bay ngang trong slow-mo, điệu nhảy chỉ có ở màn podium. Mức look. `js/main.js:14` (`DANCE_AFTER`), `js/main.js:334`.
7. **Chữ về đích.** Mức look. `js/main.js:392-398`.
   - Gốc hiện ngay khi chạm vạch, ở 8-15 % chiều cao: "LEVEL CLEARED(!)" (2019/2023) hoặc "STAGE n / COMPLETED" hai dòng, chữ trên xanh-vàng (2026). Không có "tap to continue".
   - Web hiện sau 0.9 s, ở 30 % chiều cao.
8. **HUD trong màn.** Gốc chỉ có nút pause và thanh tiến độ "n ▬ n+1" chạy theo vị trí người chơi. Web có chữ "LEVEL n" cùng 5 nút. Mức look. `js/main.js:386-391`, `index.html:68-76`.
9. **Màn sau khi về đích chưa có.** Mức look.
   - Gốc có màn heo đất toàn màn hình, rồi podium "STICKMAN HOOK / LEVEL n" hoặc "STAGE n COMPLETED!" với skin trên bục caro và nút ▶ xanh lá.
   - Web chạm sân là sang màn.
10. **Đua: không có chữ hạng "1ST/2ND" lúc về đích.** Đếm ngược của bản 2019 nằm trong vòng ô xuất phát. Mức minor. `js/race.js` (`hud`, phần đếm ngược).
11. **Vỏ menu là DOM tiếng Việt thay vì art gốc:** trang chủ, Tuỳ biến, Đường XP, Chế độ, trang Tournament. Mức look, tốn công nhất. `js/menus.js`, `js/race.js:288`, `index.html`.

Cách dựng lại: khung gốc ở `D:/stickman-hook-ref/parity/ref/<key>/`, script chụp web ở `D:/stickman-hook-ref/clips/tools/capture-web.js`, bảng clip↔ảnh web ở `D:/stickman-hook-ref/parity/map.tsv`.
