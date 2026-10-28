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
- [x] Pha 1 (2026-10-28, rev 20261028b, chưa đẩy lên Pages): tuỳ biến và vỏ meta. Chi tiết ở README, mục "Pha 1".
  - `tools/build_meta.py` → `data/meta.json`: 192 item, 62 bộ sưu tập, XP road, road màn Normal, chế độ, theme.
  - Theme đổi mỗi 5 màn. Bóng vẽ màu đặc đúng shader `SolidCol`.
  - Skin, dây, trail đang dùng vẽ trong màn. Về đích có điệu nhảy. 51 skin biến thể nướng hiệu ứng từ material.
  - Trang chính, Chế độ, Tuỳ biến, Đường XP.
  - Bài kiểm: `test/stickman-hook-play.js` 23/23, `test/stickman-hook-sim.js` 96/96. Màn đầu 585 KB thô.
  - Còn lại: hạt của trail, hiệu ứng động của skin biến thể, ảnh holder theo độ hiếm (đang dùng màu `rarity`), icon bộ sưu tập.
  - `data/games.js` chưa đổi `rev`.
