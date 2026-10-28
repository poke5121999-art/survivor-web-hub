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
