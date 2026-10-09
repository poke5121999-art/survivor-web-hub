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
- `[BẪY ĐÃ SẬP]` `.git/index.lock` mồ côi [ĐO TRONG REPO, 2026-09-25]:
  - Hai tiến trình `git update-index --add --remove -z --stdin` (không phải của agent nào trong phiên) giữ khoá, rồi thoát mà không xoá nó.
  - Trước khi xoá: `Get-CimInstance Win32_Process -Filter "Name='git.exe'"` xem còn ai đang chạy `update-index`/`commit`. Không còn ai thì khoá rỗng ấy là mồ côi, xoá được.
  - Lệnh `git apply --cached` hỏng vì khoá thì KHÔNG có gì được stage; đừng tin chữ "pushed" in sau đó.
- Đẩy một phần việc khi cây đang có nhiều agent sửa dở [ĐO TRONG REPO, 2026-09-29, Soul Knight 8.6]:
  - `git worktree add --detach D:/sk-wt HEAD`, chép vào đó đúng các tệp của phần định đẩy, dựng lại dữ liệu sinh ra
    (vd `build_sk.py`) ngay trong worktree, chạy bộ kiểm với `SK_URL` trỏ vào server của worktree (cổng khác).
  - Stage ở repo chính bằng `git hash-object -w --path=<đường dẫn> <tệp trong worktree>` + `git update-index --add --cacheinfo`.
  - `[BẪY ĐÃ SẬP]` Dùng `--no-filters` thì CRLF không được chuẩn hoá: công cụ Edit từng ghi lại cả `sfx.js` thành CRLF, và diff
    2 dòng phình thành 494 dòng. Tệp chữ phải băm bằng `--path=`; `--no-filters` chỉ dành cho ảnh.
  - `grep -c $'\r'` trong Git Bash báo 0 dù tệp có CRLF; kiểm bằng `file <tệp>` hoặc `od -c`.
  - Dọn: dừng server của worktree trước (nó giữ thư mục), rồi `git worktree remove --force` và `rm -rf`.
- Remote đi trước trong khi cây có tệp dở của agent khác trùng tệp upstream đổi [ĐO TRONG REPO, 2026-10-09, Biển Mù 2b]:
  - `rebase`/`pull` đòi cây sạch; `merge` từ chối vì đè tệp dở (`data/games.js`, `brain/index.md`). Không stash.
  - Dựng commit chồng lên remote chỉ bằng object: `git merge-tree --write-tree --merge-base HEAD~1 origin/main HEAD` ra cây,
    `git log -1 --format=%B HEAD | git commit-tree <cây> -p origin/main`, so `git diff --stat` hai commit, rồi
    `git push origin <commit>:refs/heads/main`.
  - Đưa máy theo: `git update-ref refs/heads/main <mới> <cũ>`, `git reset -q` (chỉ index), `git checkout <mới> -- <tệp upstream đổi mà
    cây không dở>`, còn tệp dở thì `git apply --include=<tệp>` bản `git diff <cũ> <mới> -- <tệp>` lên cây.
  - `[BẪY ĐÃ SẬP]` `git apply` nhiều tệp là nguyên tử: một tệp hỏng thì không tệp nào được áp. Áp từng tệp; tệp nào lệch thì sửa tay.
- `[BẪY ĐÃ SẬP]` Lệnh `( … ) &` trong công cụ Bash không chết khi lệnh trả về [ĐO TRONG REPO, 2026-10-09]: nó chạy song song với lượt
  `run_in_background` gọi sau, hai lượt ghi chung log và chung thư mục ảnh, ra trượt giả (`sbs.py` đọc ảnh đang ghi dở). Chỉ dùng `run_in_background`.
