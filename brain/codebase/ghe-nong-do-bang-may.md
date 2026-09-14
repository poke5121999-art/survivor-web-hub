# Ghế Nóng — đo bằng máy

Mọi thay đổi ở `sim.js` hay độ khó phải đo lại. Nhìn trận không thấy được lỗi cân bằng.

- Chạy trong Node qua `node _tools/soiAI-node.js <kịch bản>`, nhanh gấp khoảng 16 lần trình duyệt, ~1,1 giây một trận.
  - Máy có 12 lõi: chia việc thành nhiều tiến trình song song.
- `soiAI.js` (`SO_TRAN=150`) đo bộ não: số mạng, tập trung hoả lực, chết dưới trụ, hết giờ, chết khi rút.
- `donhay.js` (`BIEN=… SO_TRAN=80`) đo **quyết định của người chơi đổi được trận bao nhiêu**.
  - Hai đội giống hệt, đổi một biến, mỗi hạt đá hai bên sân.
  - `ct_` = chỉ lệnh, `hs_` = chỉ hệ số, `tt_SR_R` = một bậc thông thạo.
- `canbang.js 400` (node thẳng, không qua soiAI-node) đo tỉ lệ thắng từng tướng, ngưỡng lệch 12%.
- `tileThang.js` (`CHI=g1,w4`, `HAT=`, `LOI=tham|deu`) đo đường cong thắng từng giải.
  - Đủ 8 giải mất ~35 phút: chia mỗi giải một tiến trình.
- `_tools/tuchoi.js` tự chơi hết một mùa qua giao diện thật, bắt lỗi ở chỗ nối giữa các màn.
- Sai số: 40 giải ±7,5 điểm; 160 trận ±3,5.
  - Hạt cố định cho ra cùng một số mỗi lần chạy, nhưng số ấy không vì thế mà đúng. Gộp nhiều dãy `HAT`.
- **Con số tổng che mất phân bố.** "23 mạng/trận" hoá ra có 10 mạng chết oan trong 2 phút đầu.
  - Chia theo mốc giờ và theo "ai giết" trước khi tin một trung bình.
