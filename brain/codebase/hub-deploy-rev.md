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
