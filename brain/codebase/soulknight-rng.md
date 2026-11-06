# Soul Knight web: số ngẫu nhiên và bộ kiểm dựa vào seed

- `SK.rand` là một chuỗi chung (`js/engine.js`). Trước 2026-10-10 cả tầng dùng chung chuỗi: thêm nội dung vào một phòng (lính thuê, lồng nhốt
  ở phòng đặc biệt, rev 20261010i) tiêu thêm số → mọi phòng đánh sau đó ra quái khác dù cùng seed.
- Hậu quả: `test/soulknight-skills.js` (60+ ca, đánh trong "phòng đánh đầu tiên của seed 20260929") hỏng ~15 ca dù kỹ năng không đổi.
  Rev d đạt, rev i hỏng; thay `rooms.js` rev i bằng rev h thì hết. Tìm ra bằng worktree từng rev + máy chủ cổng riêng.
- Sửa ở game: `G.roomSeed = SK.peekSeed()` sau `W.generate` (chỉ đọc, không rút số) và `lockRoom` đặt seed theo (gốc, `r.id`) trước
  `buildWaves`. Kiểm: `test/soulknight-rng.js` (ép phòng đặc biệt tượng / lính thuê / lồng nhốt → đợt quái trùng; tắt dòng đặt seed thì hỏng).
- Bài học: bộ kiểm hành vi phải tự dựng hiện trường (quái mẫu, vị trí, seed sau khi khoá phòng), đừng dựa vào trận mà seed tình cờ sinh ra.
- Bẫy khi so rev bằng worktree: cổng 8812 có máy chủ cũ của phiên khác chiếm sẵn → `http.server` mới không mở được mà curl vẫn 200.
  Kiểm `ss -ltnp | grep :<cổng>` trước, và curl một tệp có chuỗi đặc trưng của rev đó.
