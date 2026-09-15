# Biệt Đội web: ải 5 nhà chép từ bản Unity

- Nguồn: `D:\REPO_Topdown` (C#, dịch nguyên văn `game.js` rồi phát triển tiếp). Chép ngược lần đầu 2026-09-15 từ commit `1dba2fa`.
- Chi tiết đã chép / bỏ lại / bẫy: `games/repo2d/AI-5-NHA.md`.
- Lần sau đồng bộ tiếp:
  - Chỉ đọc phần **đã commit** bên Unity. Việc chưa commit là của agent khác đang làm dở.
  - Diff từ `1dba2fa`, lọc bỏ `Coop*`, `World/*` (prefab), `UiGo/*`, `Editor/*`.
  - Hàm C# giữ tên web (`// web: game.js:<dòng>`), nên grep đúng tên đó trong `game.js`. Số dòng thì đã lệch.
- Trang `games/repo2d` dùng chung `game.js`. Luật mới phải trung tính khi `S.house = 0`, xem [[codebase/multi-agent-git]].
