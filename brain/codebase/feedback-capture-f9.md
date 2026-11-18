# Phím báo lỗi F9 trong game (js/feedback-capture.js)

- F9 chọn vì `dau-truong-thep` đã dùng F8 (bảng thông số mạng). Đổi phím thì grep `games/` trước.
- Nạp: `js/game-gate.js` `document.write` thẻ script khi trang còn parse, để kit bọc `console`/`requestAnimationFrame`
  và nghe phím ở pha capture của `window` trước game. 15 game không có cổng nhúng thẳng một dòng sau `<meta charset>`.
  - Game ở repo Pages `hub-games` nạp `/survivor-web-hub/js/game-gate.js` nên cũng có kit — trừ `farmland` (không có cổng),
    nhúng thẳng `/survivor-web-hub/js/feedback-capture.js` (hub-games 8aee877).
  - `voiddiver-webgl` (Unity) nhúng thẳng ở `index.html` (ef19a3d). Bản build Unity mới ghi đè `index.html` (WebGLBuild.AddLogCollector)
    thì mất dòng ấy: thêm vào bước build hoặc nhúng lại.
  - Không có F9: `walking-trade-bevy` (twt-bevy-web) và `walking-trade-proc` (twt-proc-web) — repo riêng của agent khác.
  - [BẪY ĐÃ SẬP 2026-11-18] Chủ dự án: "F9 xong về hub mở game khác thì F9 không chạy". Thẻ trỏ sang Pages khác không qua
    game-gate.js nên không có kit. Thêm thẻ mới mà không nạp game-gate → `node test/feedback-coverage.js` đỏ.
    Đường đi thật hub → A → F9 → hub → B: `test/feedback-roundtrip.js` (linux2, slot C).
  - Esc đóng ngăn dù focus ở đâu khi ngăn mở (farmland giành focus về canvas nên Esc từng rơi vào game).
  - Slot C trên linux2 bị agent twt dùng chung (job tới 3000 s): xếp hàng bằng `timeout 3400 flock` bọc ngoài,
    `timeout 580` cho node ở trong, đừng để timeout ngắn ăn cả thời gian chờ khoá.
  - Đổi `game-gate.js` mà không tăng `?v=` ở thẻ script của game thì 10 phút đầu sau deploy game có thể chạy cổng cũ (không kit).
- Ảnh WebGL: không ép `preserveDrawingBuffer`. Kit chép canvas ngay sau mỗi callback rAF của game (bộ đệm còn nguyên),
  `setTimeout(0)` chạy sau khi khung vẽ xong thì lấy bản chép cuối. Game không chạy rAF thì chép ngay, có thể đen.
- HUD DOM: html2canvas 1.4.1 từ cdnjs, chỉ tải khi bấm; `onclone` vẽ bản chép vào canvas trong bản sao theo thứ tự.
- Log không cần đổi schema: bucket `hub-feedback` chỉ nhận ảnh, nên log là tấm PNG "Data log" có JSON nén trong chunk
  iTXt `hub-feedback-log`; `env.log` trỏ tới nó. Đọc: `FB.readLog` (trình duyệt) hoặc `node tools/feedback.js log <id>`.
- Kiểm: `test/feedback-capture.js` (Playwright, gửi phiếu thật rồi xoá bằng khoá triage). Chạy trên linux2 bằng
  `~/.twt-slot-C.lock` (khoá riêng cho test hub), mỗi lần ≤ 600 s.
  - [BẪY ĐÃ SẬP 2026-11-18] Bấm F9 khi ngăn còn mở là ĐÓNG ngăn; test phải chờ ngăn tự đóng sau khi gửi rồi mới bấm lại.
  - SwiftShader headless vẽ ga-chim chậm tới mức FPS trong log ra `null`; không phải lỗi bọc rAF.
