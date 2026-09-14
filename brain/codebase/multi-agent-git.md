# Nhiều agent chung một cây làm việc

- Mỗi agent làm một game trong `games/`, cùng chạy trên `D:\survivor-web-hub`.
- Không dùng `git add -A`, `git stash` trơn, `git checkout .` — chỉ đụng đúng tệp mình sửa.
- Liệt kê tệp trong mọi lệnh: `git add <tệp…>`. Xem `git status` trước khi commit.
  - Tệp lạ của agent khác: không dọn, không báo là rác.
- `git commit -- <tệp>` với pathspec có lần báo "nothing to commit" sau `add --renormalize`.
  - Stage bằng `git add` rồi `git commit` không kèm pathspec.
- Commit đẩy thẳng lên `main`. Tiêu đề theo mẫu `[fix|feat|chore/<game>] - <mô tả tiếng Việt>`.
- Tài liệu trong repo viết tiếng Việt, dẫn nguồn, dùng nhãn `[ĐO TRONG REPO]` / `[BẪY ĐÃ SẬP]`.
