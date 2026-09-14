# Ghế Nóng — bản đồ mã

Nuôi quân kiểu Uma Musume, thi đấu kiểu Teamfight Manager 2. Web thuần, khung cố định 1280×720 co bằng `transform:scale`.

- Tài liệu: `DESIGN.md` là quyết định thiết kế, `RESEARCH.md` là số đo và các bẫy (§10 đánh bóng, §11 mô phỏng).
- `js/sim.js`: mô phỏng trận. Không đụng DOM khi `tran.veHinh` tắt, nên chạy được trong Node.
  - Bộ não nằm ở `chonHanhDong`; chọn mục tiêu ở `mucTieuTot`; vòng tick ở `G.tickTran`.
- `js/giai.js`: một giải = báo cáo → cấm chọn → chiến thuật → trận.
  - `cauHinhTa` / `cauHinhDich` biến ca và đội máy thành cấu hình trận.
  - `HE_SUC_MAY` là núm độ khó theo bậc giải.
- `js/ui-ca.js`: màn huấn luyện.
  - Phần còn nợ của lượt (`ca.giaiDo`, `ca.choCamHung`) nằm trong bản lưu; `tiepLuot` trả nợ, kể cả khi mở lại ca.
- `js/ui-draft.js`: cấm chọn (chạm 2 lần mới chốt) và `THE_TRAN`, bốn thế trận.
  - Tệp này cần DOM, nên Node không nạp. `_tools/donhay.js` giữ một bản sao hệ số — sửa một bên thì sửa cả hai.
- `js/ui-tran.js`: màn xem trận. Canvas và DOM cập nhật 5 lần/giây. Một trận kết thúc đúng một lần (`daKet`).
- `js/ui-clb.js`: màn ngoài (Home/gacha/nuôi thẻ). `js/util.js`: `G.hop` (hộp mới trả Promise của hộp cũ), `G.bangLon`.
- `js/save.js`: khoá `ghenong.save.v1`. Đọc lỗi thì cất chuỗi cũ sang `.hong`.
- Mở nhanh bằng hash: `#ca`, `#draft`, `#tran`, `#tran:600` (tua sẵn 600 tick), `#gacha`, `#nuoi`.
