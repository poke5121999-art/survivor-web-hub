# Worker Xưởng VFX

Mỗi tài khoản Claude chạy một tiến trình `worker.mjs`. Nó hỏi hàng đợi (Edge Function `vfx-studio`) xem có job không,
chạy `claude -p` với skill pixelfx để viết effect, render, đóng gói bằng esbuild, tải kết quả lên Storage rồi báo xong.
Hợp đồng API: `docs/vfx-studio.md`.

## Cài đặt

Cần Node 18 trở lên, git, ffmpeg (không có thì bỏ GIF và khung từ clip, vẫn chạy được) và Claude Code đã đăng nhập.

1. Chép khoá worker vào `~/.vfx-worker-key` (một dòng, đúng secret `VFX_WORKER_KEY` của function).
2. Lần chạy đầu worker tự `git clone https://github.com/patch-gg/pixelfx` về `<work-dir>/pixelfx-<account>`, checkout
   `5294518`, `npm ci`. Cần mạng, mất vài chục giây.

Không cần cài gói nào cho chính worker.

## Bật / tắt

- Linux: `sh tools/vfx-worker/start-linux.sh`. Chạy trong tmux phiên `vfx`, cửa sổ `worker`, thư mục `~/vfx-worker`. Chạy lại
  khi đã bật thì không làm gì. Tắt: `tmux send-keys -t vfx:worker C-c`.
- PC: `powershell -File tools\vfx-worker\start-pc.ps1`. Mở hai cửa sổ thu nhỏ `pc:claude` (`~\.claude`, priority 1, trễ 20 s) và
  `pc:claude2` (`~\.claude-acc2`, priority 2, trễ 40 s), thư mục `D:\vfx-worker`. Cái nào chạy rồi thì bỏ qua. Tắt: đóng cửa sổ
  hoặc Ctrl+C.
- Tắt khi đang gen: worker trả job về hàng đợi với lý do "máy gen tắt" rồi mới thoát.
- Gỡ hẳn một máy khỏi trang: gọi action `bye`.

## Cấu hình

Tham số dòng lệnh (có biến môi trường thay thế):

| Tham số | Biến môi trường | Mặc định |
|---|---|---|
| `--id` | `VFX_WORKER_ID` | `<hostname>:claude` (dạng `máy:tài khoản`) |
| `--label`, `--account` | `VFX_LABEL`, `VFX_ACCOUNT` | id; phần sau dấu `:` |
| `--priority`, `--delay`, `--model`, `--max-minutes` | `VFX_PRIORITY`, `VFX_DELAY`, `VFX_MODEL`, `VFX_MAX_MINUTES` | 0, 0, opus, 25 |
| `--work-dir` | `VFX_WORK_DIR` | `~/vfx-worker` |
| `--claude-bin` | `VFX_CLAUDE_BIN` | `claude` (Windows: `~\.local\bin\claude.exe`) |
| `--config-dir` | `VFX_CONFIG_DIR` | không đặt; đặt thì gán `CLAUDE_CONFIG_DIR` cho Claude con |
| `--poll` | `VFX_POLL` | 4 (giây) |
| `--once` | | thoát sau một job (để test) |

Bốn tham số priority, delay, model, max-minutes chỉ là giá trị mặc định gửi trong `hello`. Cấu hình thật do admin chỉnh trên trang
(tab Máy gen) và worker đọc lại ở mỗi lần claim hoặc heartbeat.

Nhật ký: `<work-dir>/worker-<account>.log`. Mỗi job còn có `<work-dir>/jobs/<id>/` (ảnh tham khảo, `brief.txt` đã điền, bundle).
Thư mục này không tự xoá, dọn tay khi đầy.

## Khi gặp sự cố

- **`thiếu VFX_WORKER_KEY`**: chưa có `~/.vfx-worker-key`.
- **`hello lỗi: ... unauthorized`**: khoá sai. Worker thử lại với thời gian chờ tăng dần.
- **Trạng thái `quota`, ghi chú "hết hạn mức, thử lại lúc HH:MM"**: Claude báo hết hạn mức. Job được trả về hàng đợi, worker
  nghỉ tới giờ đó (mặc định 15 phút) rồi nhận tiếp. Máy khác sẽ nhận job trong lúc này.
- **Trạng thái `paused`, ghi chú "cần /login cho <account>"**: chạy `claude` bằng đúng tài khoản đó (`CLAUDE_CONFIG_DIR=<config-dir> claude`)
  rồi `/login`. Worker thử lại mỗi 10 phút.
- **Job fail "quá N phút"**: vượt `max_minutes`. Tăng trên trang hoặc rút gọn yêu cầu.
- **Job fail "Claude không ghi ra ..."**: xem `brief.txt` và nhật ký. Thường do Claude dừng sớm hoặc lỗi mô hình.
- **`npm ci lỗi` / `git clone lỗi`**: không có mạng tới GitHub. Xoá `<work-dir>/pixelfx-<account>` nếu clone dở rồi chạy lại.
- **Không có GIF**: thiếu ffmpeg trong PATH. Effect vẫn xong, chỉ thiếu `gif`.
- **Tải lên chậm**: GIF vài MB đi qua Storage, mạng yếu có thể mất hàng chục giây. Tiến độ vẫn chạy, không phải treo.
- **Job treo ở `running` sau khi worker chết**: function tự trả về hàng đợi khi heartbeat im quá 180 s.
- **Check chưa sạch**: worker cho Claude sửa một lần (`--resume`). Vẫn chưa sạch thì nhận kết quả và ghi `CẢNH BÁO` vào nhật ký.
