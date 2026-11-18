# Phím báo lỗi F9 trong game (js/feedback-capture.js)

- F9 chọn vì `dau-truong-thep` đã dùng F8 (bảng thông số mạng). Đổi phím thì grep `games/` trước.
- Nạp: `js/game-gate.js` `document.write` thẻ script khi trang còn parse, để kit bọc `console`/`requestAnimationFrame`
  và nghe phím ở pha capture của `window` trước game. 15 game không có cổng nhúng thẳng một dòng sau `<meta charset>`.
  - Game ở repo Pages `hub-games` nạp `/survivor-web-hub/js/game-gate.js` nên cũng có kit.
- Ảnh WebGL: không ép `preserveDrawingBuffer`. Kit chép canvas ngay sau mỗi callback rAF của game (bộ đệm còn nguyên),
  `setTimeout(0)` chạy sau khi khung vẽ xong thì lấy bản chép cuối. Game không chạy rAF thì chép ngay, có thể đen.
- HUD DOM: html2canvas 1.4.1 từ cdnjs, chỉ tải khi bấm; `onclone` vẽ bản chép vào canvas trong bản sao theo thứ tự.
- Log không cần đổi schema: bucket `hub-feedback` chỉ nhận ảnh, nên log là tấm PNG "Data log" có JSON nén trong chunk
  iTXt `hub-feedback-log`; `env.log` trỏ tới nó. Đọc: `FB.readLog` (trình duyệt) hoặc `node tools/feedback.js log <id>`.
- Kiểm: `test/feedback-capture.js` (Playwright, gửi phiếu thật rồi xoá bằng khoá triage). Chạy trên linux2 bằng
  `~/.twt-slot-C.lock` (khoá riêng cho test hub), mỗi lần ≤ 600 s.
  - [BẪY ĐÃ SẬP 2026-11-18] Bấm F9 khi ngăn còn mở là ĐÓNG ngăn; test phải chờ ngăn tự đóng sau khi gửi rồi mới bấm lại.
  - SwiftShader headless vẽ ga-chim chậm tới mức FPS trong log ra `null`; không phải lỗi bọc rAF.
