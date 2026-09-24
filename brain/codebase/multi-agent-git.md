# Nhiều agent chung một cây làm việc

- Mỗi agent làm một game trong `games/`, cùng chạy trên `D:\survivor-web-hub`.
- Không dùng `git add -A`, `git stash` trơn, `git checkout .` — chỉ đụng đúng tệp mình sửa.
- Liệt kê tệp trong mọi lệnh: `git add <tệp…>`. Xem `git status` trước khi commit.
  - Tệp lạ của agent khác: không dọn, không báo là rác.
- `git commit -- <tệp>` với pathspec có lần báo "nothing to commit" sau `add --renormalize`.
  - Stage bằng `git add` rồi `git commit` không kèm pathspec.
- Commit đẩy thẳng lên `main`. Tiêu đề theo mẫu `[fix|feat|chore/<game>] - <mô tả tiếng Việt>`.
- Tài liệu trong repo viết tiếng Việt, dẫn nguồn, dùng nhãn `[ĐO TRONG REPO]` / `[BẪY ĐÃ SẬP]`.
- Tệp dùng chung (`data/games.js`) đang có sửa đổi của agent khác: chỉ stage đúng khúc của mình.
  - `git diff -U0 data/games.js > all.patch`, giữ phần đầu tệp và các khúc `@@` của mình, rồi `git apply --cached --unidiff-zero mine.patch`.
- Cần đẩy gấp một bản sửa nhỏ khi cây đang dở việc lớn [ĐO TRONG REPO, 2026-09-24, Hố Xanh cá bơi giật lùi]:
  - Dựng commit trong chỉ mục tạm: `GIT_INDEX_FILE=<tạm> git read-tree HEAD`, sửa bản `git show HEAD:<tệp>` ra tệp tạm, `git hash-object -w` + `git update-index --cacheinfo`, rồi `git write-tree` / `git commit-tree -p HEAD` / `git update-ref refs/heads/main`.
  - Sau đó `git reset -q HEAD -- <các tệp đó>` cho chỉ mục thật khớp HEAD mới. Nhớ chép cùng dòng đổi `rev` vào bản đang sửa dở, kẻo lần commit sau kéo ngược số bản.
  - Cây làm việc và việc của agent khác không bị đụng tới.
