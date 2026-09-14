# Ghế Nóng — bẫy trong mô phỏng

- Trong vòng tick, `cs` là `chiSoNguoi(n)`, tức chỉ số **tướng**, không có `nao`/`li`. Chỉ số HLV nằm ở `n.cs`.
  - Viết nhầm `cs.nao` ra `NaN`, và người ấy không bao giờ nghĩ lại nữa.
- Thêm trường cho người trong trận thì **khai trong `taoTran`**. Gắn thêm giữa trận làm đổi hidden class của V8, và cả bộ đo chậm hẳn.
- Hình học bản đồ: khoảng giữa hai trụ ngoài phải rộng hơn 2 × tầm trụ (130). Không thì chỗ lính gặp nhau nằm trong tầm cả hai trụ.
- Mốc giai đoạn trong `hesoDoi` (hiện 8 / 15 phút) phải khớp độ dài trận thật (~20 phút). Không thì thưởng "cuối trận" không bao giờ tới lượt.
- Rồng hồi 2 phút một lần, 600 vàng đội, và hết giờ thì phân thắng bằng vàng. Lệnh nào bỏ quái lớn là thua.
- Sửa một lỗi hành vi thì **đo lại mọi con số đã chỉnh dựa trên lỗi ấy**. Ngưỡng rút đã sập bẫy này nhiều lần (`RESEARCH.md` §8.4).
- Chỉ số làm AI liều hơn thì bị phạt: trong sim, rút sớm là lối an toàn. LÌ từng thắng 27% vì thế.
- Mọi thứ in trên màn hình (thẻ thế trận, hệ số năng khiếu) phải lần tới tận `cauHinhTa`, xem có đi xuống trận thật không.
- Chỉ số người chơi thay đổi → chỉnh `HE_SUC_MAY` (`giai.js`). Không đụng `suc` của 24 đội, vì bảng xếp hạng tính bằng số ấy.
