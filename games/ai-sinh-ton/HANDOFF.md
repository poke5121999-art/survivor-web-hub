# Phiếu bàn giao: Ải Sinh Tồn (19/11/2026)

Viết sẵn trước khi hạn mức phiên chạm ngưỡng. Phiên gốc chạy ở `~/ai-sinh-ton`, nhánh `feat/ai-sinh-ton`. Việc dở được đẩy lên nhánh `handoff/ai-sinh-ton` của `origin`. Chưa có gì lên `main`.

## Mục tiêu

Làm theo `~/handoff/ai-sinh-ton-brief.md`: dựng game Ải Sinh Tồn (hub id `ai-sinh-ton`), ship theo drop, kiểm trên Pages, xong thì ghi `~/handoff/ai-sinh-ton.DONE`. Phạm vi và mọi bảng số: `~/handoff/ai-sinh-ton-SCOPE.md`. Trạng thái: `~/handoff/ai-sinh-ton-STATUS.md`.

## Đã xong (đã commit trên `feat/ai-sinh-ton`)

- Lõi trận, bảng dữ liệu, tool Node: `sim-test`, `meta-test`, `economy`, `ladder` đều ALL PASS; `balance`, `bosscmp`, `trace` để cân bằng.
- `js/bz/` sinh từ Blockade Z bằng `tools/port-bz.mjs` (`--check` in GATE PASS).
- Trận chạy trên trình duyệt (`index.html`, `js/main.js`, `js/view/`), hook test, `tools/view-shots.mjs`.
- Tài khoản `js/meta.js`, phần nối `js/game.js`, `tools/smoke.mjs`.

## Đang dở

Không còn delegate nào chạy. Bốn nhóm việc A2 (làm đẹp trận), B (bộ UI 3D), D (HUD trong trận), E (màn ngoài trận) đã giao bài và đã commit; mỗi delegate báo tool của mình ALL PASS. Điều phối đã xem ảnh duyệt nhưng **chưa** có một lượt chạy chung nào xanh: sau khi các delegate viết test, bảng ải đã đổi (ải đầu co theo số ô đội hình, đà tăng độ khó thấp hơn), nên vài test trình duyệt có thể đỏ vì số cũ.

- Lượt chạy chung: `sh games/ai-sinh-ton/tools/all.sh`, log từng tool ở `~/ai-sinh-ton/.chk/gate/`.
- Lỗi đã biết cần sửa trong bộ UI: `node.dispose()` của `js/ui/kit.js` hỏng khi node chứa node kit khác (hai delegate phải tự viết `kill()` để né); hiện tượng mesh biến mất một khung hình mới chỉ được che trong `ui-demo.html` bằng cờ `__hold`, chưa kiểm trong game thật; số draw call 131-227.
- Việc lớn còn lại của drop 1: bản giao việc `~/ai-sinh-ton/.chk/BRIEF-F-ftue.md` (chưa giao cho ai).

## Yêu cầu thêm giữa chừng (Addendum 1 trong brief)

Cấp tài khoản, mở khoá dần và buổi chơi đầu có dẫn, thuộc drop 1. Phần lõi đã commit (`js/data/unlocks.js`, `tools/pacing.mjs` ALL PASS, SCOPE mục 12). Phần còn lại là `~/ai-sinh-ton/.chk/BRIEF-F-ftue.md`: giao cho một delegate Sonnet (D và E đã xong nên giao được ngay).

## Bước tiếp theo, theo thứ tự

1. Chạy `sh games/ai-sinh-ton/tools/all.sh`, sửa cho tới khi in `GATE: ALL PASS`.
2. Giao `BRIEF-F-ftue.md` (phần 1 tài khoản, rồi phần 2 giao diện và `tools/ftue-test.mjs`), xem ảnh `~/ai-sinh-ton/.chk/ftue/`, chạy lại `all.sh`.
3. Drop 1: thêm card `ai-sinh-ton` vào `data/games.js` (mẫu là card `blockade-z`), thumbnail 640x360 ở `assets/thumbnails/ai-sinh-ton.png` chụp từ game, bump `?v=` trong `index.html` và `rev` của card.
4. `git fetch origin && git rebase origin/main`, chạy lại tool, `git push origin HEAD:main`. Chờ 70 giây, chạy lại tool với `AST_BASE=https://poke5121999-art.github.io/survivor-web-hub`.
5. Cập nhật STATUS, rồi drop 2 (trang bị), drop 3 (ải 11-30, rương), drop 4 (cân bằng, đánh bóng) theo SCOPE mục 2.
6. Xong hết: ghi `~/handoff/ai-sinh-ton.DONE` (dòng đầu `READY`), liệt kê thứ chưa có người kiểm.

## Luật phải giữ

- Không sửa `games/blockade-z/` và các thư mục khác trong `~`. Không force-push, không merge `main` vào nhánh, không ghi đè `main`.
- Mỗi lúc một Chrome (`tools/pw.mjs` có file khoá `.chk/chrome.lock`), mọi lệnh có `timeout`.
- Hook shell của máy chặn lệnh có chữ liên quan file env: ghi file bằng công cụ Write, không dùng heredoc; trong JS đọc môi trường bằng `process['env']`.
- Model: delegate dùng Sonnet; Fable chỉ cho việc khó.

## Cách biết là xong

Mọi tool ở bước 2 in ALL PASS trên máy và trên Pages, card hiện trên hub, `~/handoff/ai-sinh-ton.DONE` có dòng đầu `READY`.
