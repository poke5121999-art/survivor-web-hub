# Đẩy lên hub và số bản

- Hub chạy trên GitHub Pages: `https://poke5121999-art.github.io/survivor-web-hub/`.
- Vào thẳng một game bằng `.../games/<game>/index.html` để bỏ qua cổng đăng nhập.
- Xong = đã commit, đã push, và đã kiểm trên Pages. Kiểm bằng `file:///` không tính.
- Pages xây lại khoảng 70 giây sau push. Trong lúc đó bản cũ vẫn được phục vụ, nên bộ kiểm chạy lúc ấy sẽ báo sai.
  - Đừng dùng `sleep` cố định. Lặp `curl` cho tới khi grep thấy dòng mới.
- Chống đệm: mọi `<script>`/`<link>` trong `index.html` của game gắn `?v=<rev>`, và `data/games.js` có `rev:` trùng số ấy.
  - Đổi mã mà quên tăng `rev` thì người chơi cũ vẫn nhận bản cũ.
- Đầu dòng trong repo:
  - `data/games.js` là **LF** từ commit `1a177ce`.
  - Trước khi dùng `-c core.autocrlf=false`, đo bằng `git show HEAD:<tệp>` rồi đếm `\r\n`.
  - 2026-09-14 dùng nhầm cờ ấy ra diff 1206 dòng; sửa lại bằng `git add --renormalize`.
- Máy không có `gh` CLI.
- Tệp của chính hub (`css/style.css`, `js/i18n.js`, `js/hub.js`, `js/cache-bust.js`, `data/games.js`) gắn `?v=` trong `index.html`.
  - Đổi một trong số đó thì tăng số `?v=` theo, kẻo người chơi nhận HTML mới đi với CSS cũ trong 10 phút.
- `css/style.css` được nạp cả ở `admin.html`, `design.html`, `login.html` [BẪY SUÝT SẬP 2026-10-09].
  - `admin.css` có sẵn `.btn`/`.btn--ghost`; class chung kiểu `.btn` thêm vào style.css sẽ đè nút admin. Nút của hub tên `.hub-btn`.
- Lời giới thiệu thẻ (tagline/desc/genre/accent/en) ghi bằng `node tools/hub-copy.js`; ảnh thẻ chụp bằng `games/<id>/tools/thumb.js` dựa trên `tools/thumb-lib.js`.
  - Kiểm: `node test/hub-ui.js`. Ảnh mới phải mở ra so với ảnh cũ ở cỡ thẻ ~340px; game màn dọc cần cắt vùng + `scale: 2`, chụp cả màn thì nhân vật chỉ còn vài pixel.
