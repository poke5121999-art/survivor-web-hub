# Stickman Hook: full game

Chủ dự án yêu cầu ngày 2026-10-28: "làm full game". Bản đầu (commit 8d7256d0) mới có chế độ Normal.
Nguồn bóc nằm ở `D:\stickman-hook-ref`. Kiểm kê chế độ và meta: `D:\stickman-hook-ref\FULLGAME.md`.

Nguyên tắc: vẫn "nhẹ, load nhanh".

- Màn đầu tiên không được nạp thêm byte nào so với bây giờ.
- Skin, trail, dây, chế độ nào thì nạp lười khi người chơi mở tới.
- Mỗi pha xong phải đẩy lên Pages và chạy bài kiểm trên Pages.

## Pha

1. **Tuỳ biến.** Gồm 95 skin (7 khung chơi + điệu nhảy về đích), 21 dây, 27 trail, trang Customization.
   - Mở khoá theo bảng gốc. Bản gốc không có xu mỗi màn (`FULLGAME.md`), nên chỉ có +10 XP.
   - Mỗi skin là một tệp webp riêng, nạp khi được chọn.
2. **Vỏ meta.** Gồm trang Home, thanh menu, tiền tệ, màn kết thúc Normal có thưởng, XP road.
3. **Chế độ phụ.** Challenge, Grapple, sự kiện Easter/Valentine, Pachinko. Thứ tự theo `FULLGAME.md`.
4. **Adventure.** Gồm skill, gravity zone, portal, gió, tường lửa.
5. **Tournament.** Đua với ghost từ 21 bản ghi có sẵn trong APK. Bảng xếp hạng thật cần online, nên chỉ làm bản offline.
6. **Thẻ bài, booster, chợ, vòng quay, heo đất.** Không có IAP thật: thứ gì cần tiền thật thì đổi bằng tiền trong game.

## Trạng thái

- [x] Normal: 64 màn + ngẫu nhiên. Bot `test/stickman-hook-sim.js` qua 96/96 màn.
- [x] Pha 1 (2026-10-28, rev 20261028b, commit d61ed6fe, đã kiểm trên Pages): tuỳ biến và vỏ meta. Chi tiết ở README, mục "Pha 1".
  - `tools/build_meta.py` → `data/meta.json`: 192 item, 62 bộ sưu tập, XP road, road màn Normal, chế độ, theme.
  - Theme đổi mỗi 5 màn. Bóng vẽ màu đặc đúng shader `SolidCol`.
  - Skin, dây, trail đang dùng vẽ trong màn. Về đích có điệu nhảy. 51 skin biến thể nướng hiệu ứng từ material.
  - Trang chính, Chế độ, Tuỳ biến, Đường XP.
  - Bài kiểm: `test/stickman-hook-play.js` 23/23, `test/stickman-hook-sim.js` 96/96. Màn đầu 585 KB thô.
  - Còn lại: hạt của trail, hiệu ứng động của skin biến thể, ảnh holder theo độ hiếm (đang dùng màu `rarity`), icon bộ sưu tập.
- [x] Pha 3 (một phần, 2026-10-28, rev 20261028c, commit 73691ee9, Playwright 38/38 trên Pages): Mechanical Grapple, Challenge, sự kiện Easter / Valentine's Day. Chi tiết ở README, mục "Chế độ phụ".
  - `build_data.py` dịch mọi chế độ bằng cùng `compile_pattern` → `data/mode-{grapple,challenge,seasonal}.json`, nạp khi mở chế độ.
  - Bảng chế độ `js/modes.js`. `js/grapple.js` đã soát lại theo asm: kẹp −5, `Vector2.SmoothDamp`, vận tốc SmoothDamp ban đầu.
  - `physics.js` thêm luật bumper `forceBounce`, thiếu luật này thì 6 màn Challenge không qua được. Bot thêm nước chờ/móc phía sau và thử lại với ngân sách gấp 2, gấp 3 cho Challenge và sự kiện.
  - Bài kiểm: `test/stickman-hook-sim.js` 189/189 (Normal 94, Grapple 51, Challenge 30, sự kiện 10). `test/stickman-hook-play.js` 38/38. Màn đầu 589 KB thô.
  - Còn lại của pha 3: Pachinko. Giới hạn 1 lượt/ngày của sự kiện cố ý bỏ.
- [~] Pha 6, phần 1 (2026-10-28, rev 20261028d, CHƯA đẩy lên Pages, CHƯA kiểm trên Pages): vòng quay, heo đất, xu miễn phí mỗi ngày, vé bỏ qua, nút bỏ qua màn. Chi tiết ở README, mục "Vòng quay, heo đất, chợ, vé bỏ qua".
  - `tools/build_meta.py` thêm `data/bonus.json`, `art/wheel.webp` (138 KB), `art/piggy.webp` (41 KB), `art/skip.webp` (5 KB) và 3 icon trong `menu.webp`.
  - `js/bonus.js` nạp lười (trang chính, lần chết đầu, hoặc qua màn Normal). Vòng quay và Chợ ở `js/menus.js`.
  - Luật đã đọc từ asm: giá vòng quay [0, 500] tính suốt đời, không có lượt free mỗi ngày. Thưởng ép Potatoz khi chưa có. Heo +10 rồi +3, đầy mà không mở thì mất ở màn sau. Bỏ qua màn = hiệu ứng thẻ `skip_level`.
  - Quảng cáo có thưởng đổi thành 1 vé bỏ qua (`skipPrice` gốc). Gói vé bán bằng xu, 50 xu/vé `[ĐỀ XUẤT]`.
  - Bài kiểm: `test/stickman-hook-play.js` 55/55 chạy local. Màn đầu 592 KB thô.
  - Việc còn lại: đẩy lên Pages, tăng `rev` trong `data/games.js`, chạy bài kiểm trên Pages với `SH_URL`.
  - Phần còn lại của Pha 6: thẻ bài, booster (đang nằm trong `save.pending`), chợ đen, xu đổi quảng cáo.
- [~] Pha 5 (2026-10-28, rev 20261028e, CHƯA đẩy lên Pages, CHƯA kiểm trên Pages): Đua (Tournament). Chi tiết ở README, mục "Đua (Tournament)".
  - `build_data.py` thêm `data/mode-race.json` (21 map, cấu hình đua và bảng ngày). `tools/build_race.py` giải 505 bản ghi ghost, lấy mẫu 10 Hz → `data/race/<map>.json` (1.2 MB thô cả 21 file, mỗi cuộc đua nạp 1 file 40–103 KB) và `art/race.webp`.
  - `js/race.js` nạp lười: trang bảng xếp hạng ngày, đếm ngược 3-2-1-GO, tối đa 4 ghost trong suốt theo skin của bản ghi, hạng theo thứ tự về đích, thua cả 4 thì bị ép về đích, xu [10,7,5,3,1] và cúp [10,5,3,2,1], 2 lượt miễn phí/ngày rồi 1 vé.
  - Bảng ngày offline: seed từ nửa đêm, 9 AI bằng `System.Random(seed)`, điểm AI theo easing và đoạn hạng, chốt bảng cũ khi mở trang (thưởng theo hạng có nội suy, skin hạng 1).
  - Ba UNKNOWN của `FULLGAME.md` đã giải: `RefineLevel` [asm 0x12aac08], fallback độ khó 4 = ô trống [asm 0x12205a0], `GetNbWins` = `leaderboard.tournament_win` [asm 0x12b8af0].
  - Bài kiểm: `test/stickman-hook-sim.js` 295/295 (thêm 21 map × 5 ô xuất phát), `test/stickman-hook-play.js` 70/70, `test/stickman-hook-pachinko.js` 27/27 (26/26 khi bi rơi vào ô xu). Màn đầu 595 KB thô (trước 592–593 KB).
  - Chưa làm: nút quảng cáo nhân xu ở màn kết thúc, thẻ của Tournament, đường VIP. Việc còn lại: đẩy lên Pages, tăng `rev` trong `data/games.js`, chạy bài kiểm trên Pages với `SH_URL`.
- [~] Pha 4 (2026-10-28, rev 20261028g, CHƯA đẩy lên Pages, CHƯA kiểm trên Pages): Phiêu lưu (Adventure). Chi tiết ở README, mục "Phiêu lưu (Adventure)".
  - `tools/build_adventure.py` → `data/mode-adventure.json` (8 tầng, 189 pattern, 6 kỹ năng, giá, đường kỷ lục 105 mốc, bảng tuần) + `art/adventure.webp`. `build_data.compile_pattern(adv=True)` thêm điểm móc/bumper có cờ INITIAL; `levels.json` và atlas không đổi byte nào.
  - `js/advrun.js` (luật, không DOM) + `js/adventure.js` (trang, vòng lặp, vẽ, màn kết thúc), nạp lười. Tổng 564 KB thô, khoảng 220 KB gzip.
  - `UnityEngine.Random` port từ `libunity.so` (Xorshift128). Ghép đường theo seed tuần, điểm móc 5 loại, bumper 5 loại, vùng gió, cổng dịch chuyển, độ dài dây, tường lửa kéo dây 30 m, điểm theo mét, vận tốc tối đa 35, một mạng.
  - Mọi UNKNOWN Adventure của `FULLGAME.md` đã giải bằng asm. `FULLGAME.md` đã sửa: giá nâng cấp, trần kỹ năng 100, tường lửa sinh ở (0, 0) và không có trần tốc, cổng thưởng, xu cuối lượt = số mét.
  - `[ĐỀ XUẤT]`: tuần bắt đầu thứ Hai giờ máy, bộ đếm tĩnh về 0 mỗi lượt, camera, hạt/ánh sáng làm phẳng (chưa có clip Adventure của bản gốc để so), thưởng bảng tuần theo cách của Đua.
  - Bài kiểm: `test/stickman-hook-sim.js` 304/304 (thêm 9 của Phiêu lưu; sau đó thêm 2 kiểm cổng và tường lửa, chạy riêng `SH_MODES=adventure` 16/16), `test/stickman-hook-play.js` 79/79, `test/stickman-hook-pachinko.js` 27/27. Màn đầu 594 KB thô (trước 595 KB).
  - Chưa làm: thẻ tăng xu phiêu lưu, gói khởi đầu tuần, nhân xu bằng quảng cáo. Việc còn lại: đẩy lên Pages, tăng `rev` trong `data/games.js` lên 20261028g, chạy bài kiểm trên Pages với `SH_URL`.
- [~] Vòng giống bản gốc (2026-10-28, rev 20261028h, CHƯA đẩy lên Pages, CHƯA kiểm trên Pages): sửa theo `docs/PARITY.md`. Chi tiết ở README ("Luật gốc đã dùng", heo đất, Đua).
  - Vòng nét đứt quanh điểm móc gần nhất (Halo, appear 0.1 s), vòng sáng FX_Spawn, người chơi xuất hiện ngay (`ParticleSystem.time` = 0).
  - Camera ForwardFocus 0.25 / SmoothDamp 0.5 đọc từ scene `level2` (`js/camera.js`, bot dùng chung): người chơi ở ~0.3 bề ngang.
  - Về đích: giữ tư thế bay, chữ "STAGE n COMPLETED" ngay ở 20 %, sau 1.0 s màn heo đất toàn màn hình rồi trang kết thúc (skin nhảy, nút Play) trong `js/endgame.js` + `art/ui.webp` (nạp lười).
  - Nền tô màu effect của theme; theme đổi mỗi 4 màn (server ghi đè 5 của APK). Dây mặc định trắng mảnh.
  - HUD: nút pause + thanh "n ▬ n+1" theo CanvasScaler 750×1334 khớp chiều cao; chọn màn/chơi lại/âm thanh/về hub vào menu pause. Đua: "1ST", danh sách "#n tên", số đếm trên vòng ô xuất phát.
  - Màn đầu 576 KB thô (trước 594): `levels.json` bỏ `sh`/`o` mặc định (−48 KB), atlas +16 KB.
  - Bài kiểm: `test/stickman-hook-sim.js` 306/306, `test/stickman-hook-play.js` 83/83 (luồng về đích, pause, heo đất viết lại theo UI gốc), `test/stickman-hook-pachinko.js` 27/27.
  - Còn lệch: pháo giấy toả về phía trước (prefab của Player chưa tìm thấy), heo đất đầy chưa có thanh bộ sưu tập và nút VIP Skip.
  - Chưa làm (mục 8): vỏ menu bằng art gốc (trang chủ, Tuỳ biến, Đường XP, Chế độ, Tournament) vẫn là DOM.
  - Việc còn lại: đẩy lên Pages, tăng `rev` trong `data/games.js` lên 20261028h, chạy bài kiểm trên Pages với `SH_URL`.
- [~] Vòng giống bản gốc lần hai (2026-10-29, rev 20261028i, CHƯA đẩy lên Pages, CHƯA kiểm trên Pages): chi tiết ở `docs/PARITY.md` mục "Vòng sửa 20261028i".
  - Pháo giấy = prefab gốc `ConfettisLeft` (nón 20°, 70 mảnh, 5 màu, xoay 3D). Zoom về đích đã đúng, ảnh cũ chụp sớm. Chữ về đích xuống dòng theo bề ngang như TMP.
  - Trang chính, Chế độ, Đường XP, Tuỳ biến, trang Đua dựng bằng art gốc (`js/home.js`, `js/uikit.js`, `tools/build_menus.py`, `art/m-*.webp`).
  - Kiểm: play 83/83, pachinko 27/27, sim xem PARITY.md. Màn đầu 580 KB. Cổng parity: ok 27, version 16, not-built 6, web-bug 0.
  - Còn lại: VIP/No Ads, thẻ bài, thẻ thưởng Đường XP đúng prefab, avatar trên bảng Đua, lật trang Tuỳ biến.
  - Việc còn lại: đẩy lên Pages, tăng `rev` trong `data/games.js` lên 20261028i, chạy bài kiểm và chụp lại cặp trên Pages với `SH_URL`.
- [~] Pha 6, phần 2 (2026-10-29, rev 20261028j, CHƯA đẩy lên Pages, CHƯA kiểm trên Pages): thẻ bài, booster, Chợ Đen. Chi tiết ở README, mục "Thẻ bài, booster, Chợ Đen".
  - `tools/build_cards.py` → `data/cards.json` (33 thẻ, 7 booster, đơn giá Chợ Đen, `resource_boosting`, road perk). Art `m-cards.webp` + `m-boost.webp` qua `build_menus.py`.
  - `js/cards.js` (luật) + `js/cardsui.js` (trang thẻ, popup mở booster, Chợ Đen và gói thẻ trong Chợ), nạp lười; màn đầu không nạp.
  - Luật đọc asm (4 lượt dịch song song): cấp thẻ, perk, rút booster (XXHash64 + Xorshift128, độ hiếm không seed), double_cards, extra_draw, +1 Card (1 vé),
    Chợ Đen 6 h, cộng tài nguyên theo thẻ, Second Chance 4 chế độ, Extra Lucky Wheel, Lucky Drop (x10, người que phụ, Bumper Resistance), thẻ Phiêu lưu.
  - Thay chỗ đứng tạm: lượt bỏ qua màn theo cờ welcome booster → theo cấp thẻ `skip_level`; booster nằm `save.pending` → mở bằng popup; booster vòng quay → qua GetFallback;
    chốt x10/người que chỉ có với `?pbonus` → theo thẻ; thẻ Đua và thẻ xu/kỹ năng Phiêu lưu "chưa có" → có.
  - `[ĐỀ XUẤT]`: giá gói thẻ theo đơn giá Chợ Đen (3800 / 9800 / 49000), lượt quay thêm có thưởng (bản gốc quay mà không nhận), nhịp đếm ngược hồi sinh.
  - Lucky Drop Limit không có tác dụng trong 9.9.60 (giá trị thử không ai đọc); giới hạn lượt/ngày của Lucky Drop vẫn bỏ như trước.
  - Bài kiểm (local): `test/stickman-hook-play.js` 109/109, `test/stickman-hook-sim.js` 306/306, `test/stickman-hook-pachinko.js` 26/26 (ván rơi ô xu). Màn đầu 584 KB thô (trước 580).
  - Việc còn lại: đẩy lên Pages, tăng `rev` trong `data/games.js` lên 20261028j, chạy bài kiểm trên Pages với `SH_URL`. (Nâng kỹ năng ngẫu nhiên: xong ở 20261028k.)
- [~] Luật lối chơi còn lệch (2026-10-29, rev 20261028k, CHƯA đẩy lên Pages, CHƯA kiểm trên Pages): chi tiết ở README (địa chỉ asm), `docs/PARITY.md` mục 20261028k, `docs/PACHINKO.md`.
  - Phiêu lưu: một nút giữ-để-lặp nâng kỹ năng ngẫu nhiên (`LevelUpRandomSkill` [asm 0x126a3f4], `HoldButton` 0.6 → 0.1 s, easing t²). Bộ đếm `_targetsCount/_bumpersCount` sống suốt phiên trang.
  - `js/daily.js` (mới, nạp lười): `FormatDateId` = `yyyy-MM-dd`; giới hạn ngày `GameModesService` (Lucky Drop 1 + 2 vé, sự kiện 1 + vé không trần, Đua 2 + vé); vòng một màn mỗi ngày của sự kiện (`SeasonalEventState`), nhận quà hôm nay thì hết hôm nay. Bàn Lucky Drop bốc lại mỗi ngày.
  - Vùng chết = hộp `CameraLimitsBottom/Left` (`CameraService.PlaceBorder` [asm 0x127a1b0]): 9:16 chết dưới −6.695 / trái −5.853 quanh tâm camera (`camera.js deathLimits`, bot dùng chung). Thay số `[ĐỀ XUẤT]` 0.3.
  - Extra Lucky Wheel: lượt quay thêm không phát thưởng như bản gốc.
  - Còn `[ĐỀ XUẤT]` luật: mở Grapple/Challenge theo XP (gốc cần nhận mốc Đường XP), thưởng sự kiện (server), đồng hồ server, giá gói vé/gói thẻ (tiền thật), heo đất chỉ lần đầu qua màn, popup booster cấp đúng cái đã hiện.
  - Chưa làm: hạt của trail, hiệu ứng động của skin biến thể (mục 4).
  - Bài kiểm (local): `test/stickman-hook-play.js` 119/119, `test/stickman-hook-sim.js` 307/307, `test/stickman-hook-pachinko.js` 30/30. Màn đầu 589 KB thô (trước 584).
  - Việc còn lại: đẩy lên Pages, tăng `rev` trong `data/games.js` lên 20261028k, chạy bài kiểm trên Pages với `SH_URL`.
