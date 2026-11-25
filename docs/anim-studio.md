# Xưởng Anim (anim.html)

Trang cho art tải **một ảnh nhân vật**, gõ chuyển động ngắn (tiếng Việt hay Anh), chọn số giây, seed, engine. Máy GPU chạy model
image-to-video cục bộ, tách clip thành khung PNG và tải lên. Art sửa từng khung ngay trong trình duyệt rồi xuất sprite sheet, JSON, ZIP, GIF.

Cùng khung với [Xưởng VFX](vfx-studio.md): Edge Function + bảng + bucket + worker. Khác ở chỗ: engine là CLI ngoài (đội khác dựng), worker chỉ điều phối.

## Ba mảnh

| Mảnh | Ở đâu | Việc |
|---|---|---|
| Trang | `anim.html`, `js/anim-studio.js`, `js/anim-mock.js`, `css/anim-studio.css` | gửi job, xem tiến độ (bước + step/total), sửa khung, xuất; admin chỉnh máy gen |
| API + hàng đợi | `supabase/functions/anim-studio/index.ts` | bảng `anim_jobs`, `anim_workers`, bucket Storage `anim`; tự tạo khi chạy lần đầu |
| Worker | `tools/anim-worker/worker.mjs` (+ `fake-engine.mjs`) | nhận job, đo bộ nhớ, viết lại prompt, chạy engine, tải khung lên |

Vai trò được dùng: `member`, `artist`, `admin` (như VFX). Worker xác thực bằng header `x-anim-worker-key` so với secret `ANIM_WORKER_KEY`
(máy giữ ở `~/.anim-worker-key`). Mọi ghi DB đi qua function; bảng bật RLS không policy.

## Vòng đời job

Giống hệt VFX: `queued → running → done`, `failed`, `canceled`; reaper trả job im quá 180 s về hàng đợi (lần thứ 3 thì `failed`);
`retry` từ failed/canceled; `fail` với `requeue: true` (hết hạn mức) trả job về hàng đợi và không tính lượt.
`stage` (khi running): `setup · rewriting · load · sample · decode · frames · bg · uploading`. `progress = { stage, step, total }` cho thanh tiến độ.

## Ưu tiên worker và trần bộ nhớ

`linux:claude` priority 0, nhận ngay. `pc:claude` priority 1, `claim_delay_s` 20: nhường job 20 s nếu còn máy priority nhỏ hơn đang bật, online và `idle`.
Máy `lowmem` không `idle` nên không chặn máy khác.

Trước **mỗi** lần claim, worker đo: Linux `MemAvailable`; Windows commit trống (`Win32_OperatingSystem.FreeVirtualMemory`, không phải RAM trống); cả hai thêm VRAM trống
(`nvidia-smi --query-gpu=memory.free`). Dưới `min_free_gb` (mặc định 20) hoặc 6 GB VRAM: heartbeat `lowmem` kèm lý do, không claim. Server cũng từ chối claim khi máy đang `lowmem`.
PC dùng chung nhiều phiên Claude: hết commit là tiến trình khác chết, nên đừng hạ ngưỡng.

## Hợp đồng engine

`ANIM_ENGINE_CMD` (mặc định Linux `~/anim-studio/bin/anim-gen`):

```
anim-gen --engine <e> --image in.png --prompt "<english>" --seconds N --seed S [--steps N] [--remove-bg] --out DIR
```

stdout mỗi dòng một JSON `{"stage","step","total","msg"}`. Ghi `DIR/video.mp4`, `DIR/frames/0001.png…`, `DIR/meta.json`
`{engine,fps,width,height,frames,seconds,seed,timings}`. Lỗi: thoát khác 0 và một dòng stderr. Worker chuyển tiếp tiến độ (≤ 1 lần / 2 s), giết cây tiến trình
khi job bị huỷ hoặc quá `max_minutes`, tải qua URL ký sẵn rồi `complete`. `fake-engine.mjs` làm đúng hợp đồng này bằng ffmpeg (phóng/xoay/dịch nhẹ, 16 fps) để chạy cả chuỗi không cần GPU.

Viết lại prompt (`params.rewrite`, mặc định bật): `claude -p --model haiku --setting-sources project,local --append-system-prompt "<luật>"`
(thiếu cờ này thì `claude -p` thừa hưởng CLAUDE.md, output style, hook của tài khoản). Ra một câu chuyển động tiếng Anh, lưu ở `prompt_en`; lỗi thì dùng nguyên văn.

## API

Một endpoint `POST {SUPABASE_URL}/functions/v1/anim-studio`, body `{ "action": "...", ... }`, header `apikey`. Trả `{ ok: true, ... }` hoặc `{ ok: false, error: { code, message } }`.

Art (`Authorization: Bearer <token hub>`): `me`, `upload_urls` (đúng 1 file png/jpeg/webp ≤ 15 MB), `submit` (`prompt`, `title?`, `image: {path,name,w,h}`, `params`, `parent_id?`),
`list` (`mine?`, `page?`, `page_size?`), `get` (kèm `family`), `cancel`, `retry`, `delete` (dọn `out/<job>/` và ảnh nếu không job nào khác dùng), `workers`, `worker_update` (admin:
`enabled, priority, claim_delay_s, max_minutes, engine_default, min_free_gb, label`).

Worker (`x-anim-worker-key`): `hello`, `claim`, `heartbeat` (`status` thêm `lowmem`), `progress` (`stage, step, total, msg, prompt_en`), `upload_urls` (tên `video.mp4`, `meta.json`, `frames/0001.png`), `complete`, `fail`, `bye`.

```js
job = {
  id, created_at, created_by, author, title, prompt, prompt_en,           // prompt_en: prompt tiếng Anh máy đã dùng
  image: { path, name, w, h },                                            // refs/<user>/…; một ảnh
  params: { engine: "auto"|"framepack"|"wan5b"|"ltx", seconds: 1..5 (mặc định 2, bước 0,5), seed: int|null,
            steps: int|null, remove_bg: bool, rewrite: bool, only_worker: null|string },   // only_worker: chỉ để test
  parent_id, status, stage, worker, attempts, claimed_at, heartbeat_at, finished_at,
  progress: null | { stage, step, total },
  log: [{ t, stage, msg }],                                               // 200 dòng cuối
  result: null | { engine, fps, width, height, frames, seconds, seed, timings,
                   files: { video, frames: ["out/<id>/frames/0001.png", …], meta } },   // bucket anim
  error,
}
worker = { id, label, host, account, enabled, priority, claim_delay_s, max_minutes, engine_default, min_free_gb,
           status: idle|busy|paused|quota|lowmem|offline, note, current_job, last_seen, jobs_done }
```

## Trình sửa khung hình

Khi job `done`, trang nạp toàn bộ khung rồi cho: phát/dừng theo fps, cắt vào/ra, giữ mỗi N khung, bật/tắt từng khung, chế độ lặp hoặc đi-và-về, onion skin (khung trước),
nền ô caro/tối/sáng/màu, phóng to nearest-neighbour. Phím: Space, ←/→, X (bật/tắt), I/O (đặt vào/ra). Trạng thái lưu `localStorage` theo job (`anim-editor:<id>`), không có cũng chạy.
Xuất ở trình duyệt, đúng các khung đang giữ: sprite sheet PNG (chọn số cột), JSON kiểu Aseprite (`frames` + `meta.frameTags`), ZIP khung (JSZip 3.10.1), GIF (gifenc 1.0.3, nền trong suốt hoặc màu đang chọn, có đi-và-về).
`?mock=1` chạy API giả với khung vẽ bằng canvas.

## Kiểm

- `node test/anim-studio-api.js`: gọi function đã deploy (cần `~/.anim-worker-key`, `~/.rc-bot-password`): tải ảnh, submit, ưu tiên nhường, lowmem, progress, complete, requeue, fail, retry, cancel, xoá. 
- Chuỗi trọn trên một máy: `ANIM_ENGINE_CMD="node tools/anim-worker/fake-engine.mjs" node tools/anim-worker/worker.mjs --id test:me --once --min-free-gb 0 --min-free-vram 0` với job có `only_worker: "test:me"`.
- Deploy: `timeout 400 npx -y supabase@2.120.0 functions deploy anim-studio --project-ref jvdguaecnllejdmgytia --use-api --no-verify-jwt`; secret: `supabase secrets set ANIM_WORKER_KEY=<khoá> --project-ref jvdguaecnllejdmgytia`.
- Bucket `anim` giới hạn 50 MB mỗi file (trần của dự án; 100 MB bị từ chối).

## Worker đang chạy ở đâu

- Máy `linux` (ssh), tmux session `anim-worker`, thư mục `~/anim-worker/app/` (chép `worker.mjs` + `fake-engine.mjs`, không phải cả repo); log `~/anim-worker/stdout.log`; khoá `~/.anim-worker-key`.
- Id `linux:claude`, priority 0, engine mặc định `framepack` (đặt qua `--engine framepack`; job chọn "Tự chọn" thì dùng giá trị này). `wan5b` và `ltx` chọn được nhưng ghi "thử nghiệm" trên trang: wan5b chuyển động nhẹ và có khung lỗi, ltx hay zoom và đổi nhân vật.
- Engine thật: `~/anim-studio/bin/anim-gen` (ComfyUI cổng 8190). FramePack ~11 phút cho clip 2 s, cần MemAvailable sàn ~13 GB. Worker `lowmem` khi VRAM trống dưới 6 GB: nếu ComfyUI 8190 còn nằm trong VRAM thì `anim-gen --stop-server` trước.
- Bật: `sh ~/anim-worker/app/start-linux.sh` (bản trong repo: `tools/anim-worker/start-linux.sh`). Còn session `anim-worker` là coi như đang chạy.
- Tự bật lại: cron trên linux gọi `~/bin/hub-workers-up.sh` (repo `tools/hub-workers-up.sh`) lúc khởi động máy và 5 phút một lần, bật
  cả worker Xưởng VFX lẫn Xưởng Anim nếu chúng không chạy; log `~/hub-workers-up.log`. Trên PC là Task Scheduler `hub-workers-up`
  gọi `C:\hub-workers\hub-workers-up.ps1` (repo `tools/hub-workers-up.ps1`) lúc đăng nhập và 5 phút một lần.
- PC `HOB-THOR` (RTX 3050 8 GB): worker `pc:gpu` priority 0 (linux đã tắt worker; Claude gọi qua tài khoản linux bằng `claude-linux.mjs`), engine riêng ở `C:nim-studio\` (mục "Cài trên PC" bên dưới).
- Mượn GPU để thử engine: `touch ~/anim-worker/PAUSE` rồi `tmux kill-session -t anim-worker`; xong thì `rm ~/anim-worker/PAUSE` và
  chạy lại start script. Thiếu bước PAUSE thì cron bật worker lại trong 5 phút và hai bên giành GPU.
- Tuỳ chọn trang "Giữ lưới pixel" (tắt/2/3/4) truyền `params.pixel_snap` thành `--pixel-snap K`.

## Cài trên PC (HOB-THOR, ổ C:)

- `C:nim-studio\`: `venv\` (uv, Python 3.12, torch 2.14.1+cu126, diffusers 0.33.1 và accelerate 1.16.0 ghim đúng bản linux), `ComfyUI\` (commit `1f13e29b` như linux, `extra_model_paths.yaml` trỏ `models\`),
  node `ComfyUI-FramePackWrapper` (`a0eeaa69`), `workflows\*.json` (chép từ linux), `binnim-gen.py` + `binnim-gen.cmd` (bản Windows của `anim-gen`: `ANIM_HOME` đổi thư mục gốc, `FFMPEG` đổi ffmpeg,
  `ANIM_COMFY_FLAGS` đổi cờ ComfyUI, mặc định `--disable-smart-memory`; `--stop-server` dùng `taskkill`), `bin\sample-run.py` (đo commit/VRAM mỗi 2 s, tự giết ComfyUI của mình khi commit trống < 4 GB).
  Chỉ engine `framepack`. Trọng số (~27 GB, chép bằng `scp` từ linux): transformer fp8 16 GB, llava_llama3 fp8 9 GB, clip_l, VAE HunyuanVideo, sigclip, BiRefNet.
- Worker chạy từ `C:nim-workerpp\` (`worker.mjs` + `start-pc.ps1`, chép từ `tools/anim-worker/`). Task `hub-workers-up` gọi `start-pc.ps1` lúc đăng nhập và mỗi 5 phút; script
  bỏ qua nếu đã có node chạy đúng đường dẫn `C:nim-workerpp\worker.mjs` (id `pc:claude` trùng worker Bone/VFX nên không dò theo id) và thoát khi có file `C:nim-worker\PAUSE`.
- Khởi động lại: tắt node có `C:nim-workerpp\worker.mjs` trong dòng lệnh, chạy `C:nim-studioinnim-gen.cmd --stop-server`, rồi `powershell -File C:nim-workerpp\start-pc.ps1` (hoặc chờ task 5 phút).
  Log: `C:nim-studio\worker\worker-console.log`, `worker-claude.log`; ComfyUI: `C:nim-studio\out\comfyui.log`.
- Trần: `start-pc.ps1 -MinFreeGb N` (commit trống) và `--min-free-vram 6`; số đo và ngưỡng đang dùng ở cuối mục này.
