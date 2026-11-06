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
- Bản đồ trận là bản 5v5 của TFM2 (RESEARCH §13): `_tools/build_bando.py` → `js/data-bando.js` (`window.BAN_DO`: tường, bụi, bảng đi thẳng, đường, trụ, bãi) + `art/tfm/ban-{duoi,tren,nho}.png`.
  - Đi lại trong sim phải qua `buocToi` (vòng tường); gán thẳng `n.x/n.y` là xuyên tường. Kiểm: `SO_TRAN=6 node _tools/soiAI-node.js _tools/kiemTuong.js`.
  - Bên đỏ = lật (x,y)→(y,x) của bên xanh, không phải quay 180°.
- `js/ui-clb.js`: màn ngoài (Home/gacha/nuôi thẻ). `js/util.js`: `G.hop` (hộp mới trả Promise của hộp cũ), `G.bangLon`.
- `js/save.js`: khoá `ghenong.save.v1`. Đọc lỗi thì cất chuỗi cũ sang `.hong`.
- Mở nhanh bằng hash: `#ca`, `#draft`, `#tran`, `#tran:600` (tua sẵn 600 tick), `#gacha`, `#nuoi`.
- Asset thật (RESEARCH §12):
  - `art/tfm/hinh.*` sprite TFM2 (tướng, lính, trụ, quái, 41 hiệu ứng) — `_tools/build_tfm.py`, vẽ qua `G.veHinh` / `G.veFX`.
  - `art/uma/ui.*` icon Uma ngoài trận — `_tools/build_uma.py`, lấy qua `G.oUma` / `G.oSoUma`.
  - `am/*` tiếng + nhạc — `_tools/build_tieng.py`; `js/tieng.js` phát (`G.tieng`, `G.nhac`).
  - Kiểm: `_tools/kiemTieng.js` (tiếng, nhạc, lỗi trang khi chạy trận ×6), `_tools/xemfx.html` (bảng 40 chiêu).
