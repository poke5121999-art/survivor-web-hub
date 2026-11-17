# Xưởng VFX (vfx.html)

Trang cho art gõ yêu cầu (chữ, ảnh, GIF, clip ngắn) để máy gen ra **pixel art VFX** dạng code, chơi ngay trên trang,
chỉnh màu/seed/lật, rồi tải sprite sheet (PNG + JSON kiểu Aseprite), GIF hay file `.js`.

Người gen là **Claude Code chạy headless** trên các máy của đội, dùng engine và skill của
[pixelfx](https://github.com/patch-gg/pixelfx) (MIT, Patch + Hugo Duprez): mỗi effect là một file
`src/fx/studio/<slug>.js` có `meta` + `draw(p, t, o)` (hoặc `create(o)`), vẽ vào hai buffer color và light.

Thư viện tham khảo thứ hai là [Pixel VFX Codex](https://github.com/888wing/pixel-vfx-codex) (MIT, 138 effect, engine diorama 3D khác hẳn).
Worker clone nó cạnh pixelfx (commit `7636ee6`) và brief cho Claude đọc `timeline`/`layers` của từng effect làm ý tưởng. Job có
`base_effect: "codex/<id>"` thì Claude dựng lại effect đó thành effect pixelfx 2D. Danh mục cho tab Thư viện:
`node tools/vfx-worker/build-codex-catalog.mjs <clone>` ra `vfx/codex-catalog.json`.

## Ba mảnh

| Mảnh | Ở đâu | Việc |
|---|---|---|
| Trang | `vfx.html`, `js/vfx-studio.js`, `css/vfx-studio.css`, `vfx/pixelfx-lib.js` | art gửi job, xem tiến độ, chơi kết quả, chỉnh, tải; admin chỉnh worker |
| API + hàng đợi | `supabase/functions/vfx-studio/index.ts` (Edge Function) | bảng `vfx_jobs`, `vfx_workers`, bucket Storage `vfx`; tự tạo bảng khi chạy |
| Worker | `tools/vfx-worker/worker.mjs` | mỗi tài khoản Claude một tiến trình: nhận job, chạy `claude -p`, render, tải kết quả lên |

Host tĩnh (GitHub Pages) không giữ được secret, nên mọi ghi vào DB đi qua Edge Function. Bảng bật RLS không policy:
anon key không đọc được gì, chỉ function (quyền postgres) đụng tới.

## Vòng đời một job

```
queued ──claim──▶ running ──complete──▶ done
   ▲                │  └──fail────────▶ failed ──retry──▶ queued
   │                ├──fail(requeue)──▶ queued   (worker hết hạn mức: trả job, không tính lượt)
   │                └──reaper─────────▶ queued   (heartbeat im > 180 s; lần thứ 3 thì failed)
   └─────── cancel từ queued/running ─▶ canceled ──retry──▶ queued
```

`stage` (chỉ khi running): `setup` · `drafting` · `refining` · `checking` · `rendering` · `uploading`.

Sửa tiếp một effect đã xong = job mới có `parent_id`; worker đặt file `.js` của job cha vào chỗ rồi bảo Claude sửa
theo góp ý. Mỗi job là một phiên bản.

## Ưu tiên worker

Mỗi worker có `priority` (số nhỏ đi trước) và `claim_delay_s`. Job mới vào hàng, worker có priority lớn hơn sẽ **nhường**
job đó trong `claim_delay_s` giây nếu còn một worker priority nhỏ hơn đang bật, online (`last_seen` < 45 s) và rảnh.
Mặc định: `linux:claude` priority 0; hai tài khoản PC priority 1 và 2, delay 20 s. Nên linux nhận trước, PC chỉ nhận khi
linux bận, tắt, hoặc hết hạn mức.

Admin đổi `enabled`, `priority`, `claim_delay_s`, `model`, `max_minutes` ngay trên trang (tab Máy gen). Worker đọc lại
cấu hình mỗi lần poll, không phải khởi động lại.

## Kiểm

`node test/vfx-studio-api.js` gọi vào function đã deploy: tải ảnh, gửi job, máy test nhận, nhường ưu tiên, xong, huỷ,
chạy lại, xoá. Cần `~/.vfx-worker-key` và `~/.rc-bot-password`. Deploy:

```
timeout 400 npx -y supabase@2.120.0 functions deploy vfx-studio --project-ref jvdguaecnllejdmgytia --use-api --no-verify-jwt
```

## API

Một endpoint: `POST {SUPABASE_URL}/functions/v1/vfx-studio`, body JSON `{ "action": "...", ... }`, header `apikey: <anon>`.
Trả `{ ok: true, ... }` hoặc `{ ok: false, error: { code, message } }`.

- Art: `Authorization: Bearer <access token của hub>`, role `member` hoặc `admin`.
- Worker: `x-vfx-worker-key: <VFX_WORKER_KEY>` (secret của function; máy worker giữ ở `~/.vfx-worker-key`).

### Art

| action | vào | ra |
|---|---|---|
| `me` | | `{ user: { id, email, role }, isAdmin }` |
| `upload_urls` | `files: [{ name, type, size }]` (≤ 6 file, ≤ 15 MB/file; png, jpeg, webp, gif, mp4, webm) | `files: [{ path, uploadUrl, publicUrl }]`; `PUT uploadUrl` với body là file, header `content-type` |
| `submit` | `prompt`, `title?`, `refs: [{ path, kind, name }]`, `params`, `base_effect?`, `parent_id?` | `{ job }` |
| `list` | `mine?`, `limit?` (mặc định 60) | `{ jobs }` (không có `log`) |
| `get` | `id` | `{ job }` (có `log`) |
| `cancel` | `id` (chủ job hoặc admin) | `{ job }` |
| `retry` | `id` (failed/canceled) | `{ job }` |
| `delete` | `id` (chủ job hoặc admin, job không đang gen) | `{ deleted }` |
| `workers` | | `{ workers }` |
| `worker_update` | `id`, `patch: { enabled?, priority?, claim_delay_s?, model?, max_minutes?, label? }` (admin) | `{ worker }` |

### Worker

| action | vào | ra |
|---|---|---|
| `hello` | `worker: { id, label, host, account, defaults: { priority, claim_delay_s, model, max_minutes } }` | `{ config }` (tạo dòng nếu chưa có; dòng có rồi thì giữ cấu hình admin đã chỉnh) |
| `claim` | `worker_id` | `{ job \| null, config }` |
| `heartbeat` | `worker_id`, `status`, `note?`, `job_id?` | `{ config, job_status }` (`job_status = "canceled"` thì dừng Claude) |
| `progress` | `worker_id`, `job_id`, `stage`, `msg`, `preview?` (path đã tải lên) | `{ job_status }` |
| `upload_urls` | `job_id`, `files: [{ name, type }]` | `files: [{ path, uploadUrl, publicUrl }]` dưới `out/<job_id>/` |
| `complete` | `worker_id`, `job_id`, `result` | `{ job }` |
| `fail` | `worker_id`, `job_id`, `error`, `requeue?` | `{ job }` |
| `bye` | `worker_id` | `{ deleted }` (gỡ máy gen; job đang chạy trả về hàng đợi) |

File công khai đọc ở `{SUPABASE_URL}/storage/v1/object/public/vfx/<path>`.

### Hình dạng dữ liệu

```js
job = {
  id, created_at, created_by, author,            // author: phần trước @ của email
  title, prompt,
  refs: [{ path, kind: "image" | "gif" | "video", name }],
  params: {
    kind: "auto" | "oneshot" | "loop",
    size: "auto" | "S" | "M" | "L",              // S ≈ 32 px, M ≈ 64 px, L ≈ 128 px cạnh dài
    duration: null | number,                     // giây
    fps: null | number,
    palette: null | ["#rrggbb", ...],            // tối → sáng
    actor: "auto" | "yes" | "no",                // có nhân vật diễn (wind-up, freeze, recovery) hay không
    category: null | string,                     // gợi ý nhóm pixelfx: fire, ice, ui, ...
    only_worker: null | string,                  // "id1,id2": chỉ các máy này được nhận, và chỉ nhường nhau (dùng cho test)
  },
  base_effect: null | "fire/campfire" | "codex/fireball",  // dựa trên effect pixelfx, hoặc effect Codex (dựng lại thành pixelfx)
  parent_id: null | uuid,                        // sửa tiếp từ job này
  status, stage, worker, attempts, claimed_at, heartbeat_at, finished_at,
  log: [{ t, stage, msg }],                      // 200 dòng cuối
  preview: null | "out/<id>/live-contact.png",   // contact sheet mới nhất trong lúc gen
  result: null | {
    effect_id: "studio/<slug>", name, desc,
    meta: { size, origin, duration, loop, fps, options },
    files: { src, bundle, gif, contact, sheet_png, sheet_json },   // path trong bucket
  },
  error: null | string,
}

worker = {
  id: "linux:claude", label, host, account,
  enabled, priority, claim_delay_s, model, max_minutes,
  status: "idle" | "busy" | "paused" | "quota" | "offline",     // offline = suy ra từ last_seen > 45 s
  note, current_job, last_seen, jobs_done,
}
```

`result.files.bundle` là một ES module tự đủ (esbuild gói effect + core pixelfx): `import(url)` ra
`{ fx, createFx, createAct, createFrame, clearFrame, composite, backdrop, ... }`, với `fx` là module effect.
