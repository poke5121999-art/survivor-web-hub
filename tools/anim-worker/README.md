# anim-worker

Worker của Xưởng Anim (`anim.html`). Hợp đồng API và vòng đời job: `docs/anim-studio.md`.

- `worker.mjs`: nhận job, đọc trần bộ nhớ, viết lại prompt bằng `claude -p`, chạy engine, đẩy tiến độ, tải khung hình lên.
- `fake-engine.mjs`: engine giả bằng ffmpeg, cùng hợp đồng CLI với `anim-gen`, để chạy cả chuỗi khi chưa có GPU.
- `start-linux.sh`: `linux:claude`, priority 0, nhận ngay (tmux session `anim`).
- `start-pc.ps1`: `pc:claude`, priority 1, nhường 20 s cho máy linux.

## Chạy

```
node worker.mjs --id linux:claude --priority 0 --delay 0            # engine = $ANIM_ENGINE_CMD hoặc ~/anim-studio/bin/anim-gen
ANIM_ENGINE_CMD="node fake-engine.mjs" node worker.mjs --id test:me  # thử không cần GPU
```

Cờ (hoặc biến môi trường `ANIM_*`): `--id host:account`, `--label`, `--priority`, `--delay`, `--max-minutes`, `--engine` (mặc định `auto`),
`--engine-cmd`, `--work-dir`, `--config-dir` (CLAUDE_CONFIG_DIR của tài khoản), `--claude-bin`, `--poll`, `--once`,
`--min-free-gb` (RAM/commit; có cờ này thì ghi đè cấu hình từ trang admin), `--min-free-vram` (mặc định 6).
Khoá worker đọc từ `ANIM_WORKER_KEY` hoặc `~/.anim-worker-key`.

## Hợp đồng engine

```
anim-gen --engine <auto|framepack|wan5b|ltx> --image in.png --prompt "<english>" --seconds N --seed S [--steps N] [--remove-bg] --out DIR
```

stdout: mỗi dòng một JSON `{"stage","step","total","msg"}` (`stage` thuộc `setup rewriting load sample decode frames bg uploading`).
Ghi `DIR/video.mp4`, `DIR/frames/0001.png…`, `DIR/meta.json` `{engine,fps,width,height,frames,seconds,seed,timings}`.
Lỗi: thoát khác 0 và in một dòng cuối ra stderr. Worker giết cả cây tiến trình khi job bị huỷ hoặc quá `max_minutes`.

## Trần bộ nhớ

Trước mỗi lần nhận job worker đo: Linux `MemAvailable`, Windows commit trống (`Win32_OperatingSystem.FreeVirtualMemory`), cả hai cộng VRAM trống
(`nvidia-smi --query-gpu=memory.free`). Dưới `min_free_gb` (mặc định 20) hoặc 6 GB VRAM thì trạng thái `lowmem` và không nhận job.
