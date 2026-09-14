# Bẫy khi kiểm giao diện bằng Playwright

- Playwright: `require('C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright')`. Node ở `/d/NodeJs/node`.
- **Luôn kiểm thêm một khung nhỏ hơn khung thiết kế** (ví dụ 844×390 và 1366×650).
  - Ghế Nóng chụp ở 1280×760 thì hệ số co `k = 1`, nên lỗi khung lệch khi co không bao giờ lộ.
- `page.goto(url + '#hash')` khi URL chỉ khác phần hash thì **không tải lại trang**. Phải `goto('about:blank')` trước.
- Game bọc trong `(function (G) {...})(window)`, nên trong trang không có biến `G`.
  - Dùng `addInitScript(() => { window.G = window; })`.
- Game có sự kiện ngẫu nhiên, và hạt giống trên Pages khác ở máy.
  - Bài kiểm phải chờ đúng hộp mình cần, gặp hộp khác thì bấm qua. Không được coi "có hộp nào đó" là đạt.
- Bắt đủ `pageerror`, console error, response ≥ 400.
- Ảnh chụp phải mở ra xem bằng mắt: chữ tràn, nút bị đè, thanh không tắt đều không ném lỗi.
