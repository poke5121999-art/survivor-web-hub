# Todos

## Hắn Đang Tới
- [ ] Kiểm bằng mắt màn trận ở cỡ dọc 390×844 sau khi đổi `eh = min(h, w*0.9)` (commit `6c08ea3`).
  - Với hệ số 0,62 thì nhân vật chỉ cao khoảng 48px và nửa dưới màn là cỏ trống.
  - Đã đổi sang 0,9 nhưng chưa quay lại video để xem.
- [ ] Chưa ai nghe âm thanh trận đánh bằng tai.
  - Phiên máy chỉ kiểm được là không có lỗi.
  - Cần nghe: mức to tương đối giữa các tiếng, và nhạc trận/trùm có lấn tiếng đánh không.
- [ ] Sửa `shot.js`: khi đặt quái cạnh người chơi để ép trận, chọn ô đi được.
  - Chép bản mới của nó vào repo, để sau này chạy lại được.
- [ ] Thay các sprite đang chọn tạm.
  - Icon: mũ giáp, vương miện, khuyên tai.
  - Trùm: Gấu Cuồng Chiến (đang là con khỉ), Trùm Gỗ Giòn (đang là rồng lá), Hiệp Sĩ Đen và Golem (nhỏ quá so với trùm khác).
  - Danh sách ở `games/hic/art/sk/README.md`.
- [ ] Nước trên bản đồ là một tile phẳng, chưa có mép bờ hay sóng.

## Ghế Nóng
- [ ] Đo lại hai chỉnh chưa kiểm của commit `160d9fa`.
  - Bậc 5 `HE_SUC_MAY` = 0,50, đích chung kết thế giới ~20%: `HAT=0/5000/9000 CHI=w3,w4`.
  - Bùng Cuối +30%: `BIEN=the_bungcuoi`.
- [ ] Chạy `_tools/tuchoi.js` hết một mùa trên mã mô phỏng mới.
- [ ] Người chơi đọc màn xem trước sẽ không bao giờ tập NÃO (lối "tham" tới CKTG vẫn NÃO 75), dù NÃO giờ đáng ngang LỰC trong trận.
  - Hướng xử lý: cho sân NÃO ăn dày hơn, hoặc cho màn xem trước nói ra giá trị trong trận.
- [ ] Bố cục riêng cho máy hẹp: ở 844×390 khung co 0,54, nút chỉ khoảng 15px.
- [ ] Quay 10 chưa có hoạt ảnh lật thẻ; lên cấp thẻ chưa có phản hồi.
- [ ] "Giao cho trợ lý" chưa cho xem đội hình vừa chọn.
- [ ] Lời thoại trong trận lặp ("Tôi sai vị trí."); tên nhân vật đứng gần chồng lên nhau.

## Hố Xanh
- [ ] Chùm tia đèn pha của cano đêm chưa có (shader gốc của tia chỉ tách được phần ra màu trắng).
- [ ] Chuyến về bắt đầu ở x = 67; nước đêm trong (8 m) nên thấy đáy cát gần đảo, dễ bị đọc là lỗi. Cân nhắc dời điểm xuất phát ra xa.
- [ ] Bộ nạp phụ thuộc dùng chung của `rip.py` giữ mọi tổ hợp bundle trong bộ nhớ. `rip_bar.py` phải tự viết bộ nạp riêng để khỏi tràn RAM.
