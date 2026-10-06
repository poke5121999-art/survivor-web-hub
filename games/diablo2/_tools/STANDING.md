# Lệnh thường trực cho agent làm games/diablo2

1. Repo `D:\survivor-web-hub` có nhiều agent sửa cùng lúc. Không chạy `git add/commit/checkout/stash/reset/restore`. Chỉ ghi các tệp trong phạm vi được giao.
2. Python 3.8 + numpy + Pillow. Đặt `PYTHONIOENCODING=utf-8`.
   - Python 3.8 có thể báo "Non-UTF-8 code" với dòng mã nguồn rất dài chứa tiếng Việt, nên giữ dòng ngắn.
   - Ghi tệp trên Windows đôi khi trả `OSError 22`; thử lại.
3. Heredoc trong bash ở máy này nuốt dấu `\`. Viết script ra tệp bằng công cụ Write rồi mới chạy.
4. Nguồn gốc: `D:\d2r-ref\fs\data\data\global\` (dữ liệu 2D cổ của D2R 3.1 đã bóc). Hợp đồng: `brain/plans/diablo2-d2r.md`, đọc mục "Hợp đồng v2" và "Mã khu".
5. Bộ giải mã `_tools/d2fmt.py`, bộ đóng atlas `_tools/d2pack.py`, bộ gộp chỉ mục `_tools/build_index.py` (gọi `write_fragment(tên, dict)`). Không sửa ba tệp này; thấy lỗi thì báo.
6. Kiểm trên sản phẩm thật: mở ảnh xem trước bằng Read, chạy test. Báo đúng lệnh đã chạy và kết quả thật.
7. Chú thích chỉ giải thích lý do không hiển nhiên. Báo cáo cuối tối đa 15 dòng.
