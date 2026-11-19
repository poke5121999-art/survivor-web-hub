# Xưởng 3D (gen3d.html)

Trang cho đội gửi 1 tới 4 ảnh (trước, sau, trái, phải) để máy trong văn phòng dựng model 3D bằng TripoSG chạy local.
Có model rồi thì xem 3D, bấm **Gen texture** hoặc **Gen xương**. Model có xương thì mở trang **Thử anim** (`gen3d-anim.html`)
để chạy các anim Mixamo lên model đó.

Kiến trúc chép từ Xưởng VFX (`docs/vfx-studio.md`): trang tĩnh trên Pages, Edge Function giữ hàng đợi và secret,
worker trên từng máy hỏi hàng đợi rồi chạy pipeline local.

## Ba mảnh

| Mảnh | Ở đâu | Việc |
|---|---|---|
| Trang | `gen3d.html`, `js/gen3d-studio.js`, `css/gen3d-studio.css`, `gen3d-anim.html`, `js/gen3d-anim.js` | gửi ảnh + config, xem tiến độ, xem model, bấm gen tiếp, thử anim |
| API + hàng đợi | `supabase/functions/gen3d-studio/index.ts` | bảng `gen3d_jobs`, `gen3d_workers`, bucket `gen3d` |
| Worker | `tools/gen3d-worker/worker.py` | mỗi máy một tiến trình Python: nhận job đúng loại máy làm được, chạy pipeline, tải kết quả lên |

## Mô hình dữ liệu

Một **model** là một chuỗi job. Job gốc luôn là `shape`. `texture` và `rig` là job con trỏ `parent_id` về job tạo ra mesh
nó dùng. Mỗi job là một phiên bản, nên gen texture lại với config khác là job anh em mới, không ghi đè.

```
shape ──▶ texture ──▶ rig        (rig trên mesh đã có màu)
   └────▶ rig                     (rig trên mesh trắng)
```

Vòng đời job giống Xưởng VFX:

```
queued ──claim──▶ running ──complete──▶ done
   ▲                │  └──fail────────▶ failed ──retry──▶ queued
   │                ├──fail(requeue)──▶ queued   (máy thiếu RAM/VRAM: trả job, không tính lượt)
   │                └──reaper─────────▶ queued   (heartbeat im > 180 s; lần thứ 3 thì failed)
   └─────── cancel từ queued/running ─▶ canceled ──retry──▶ queued
```

```js
job = {
  id, created_at, created_by, author, title,
  kind: "shape" | "texture" | "rig",
  parent_id: null | uuid,                 // bắt buộc với texture và rig: job done có result.files.glb
  root_id: uuid,                          // job shape gốc của chuỗi; shape thì root_id = id
  params,                                 // theo kind, xem dưới
  status, stage, worker, attempts, claimed_at, heartbeat_at, finished_at,
  log: [{ t, stage, msg }],
  preview: null | path,                   // ảnh tiến độ mới nhất
  result: null | {
    files: { glb, thumb, ... },           // path trong bucket gen3d
    stats: { tris, quads, verts, bytes, seconds, vram_peak_mb },
  },
  error: null | string,
}

// kind = "shape"
params = {
  views: { front?: path, back?: path, left?: path, right?: path },   // ít nhất 1, tối đa 4
  ultra: boolean,                 // Ultra Mesh Quality: lưới marching cubes dày hơn + nhiều bước khử nhiễu hơn
  topology: "triangle" | "quad",
  polycount: number,              // 500..2_000_000; với quad là số mặt tứ giác
  seed: number,
  texture: null | TextureParams,  // công tắc Texture bật thì worker chạy luôn texture sau shape, ra job con tự động
}

// kind = "texture"
TextureParams = {
  quality: "2K" | "4K" | "8K",    // cạnh atlas 2048 / 4096 / 8192
  ai_complete: boolean,           // vùng không ảnh nào nhìn thấy: tắt = tô màu lân cận, bật = model diffusion vẽ bù
  remove_lighting: boolean,       // khử bóng/đổ sáng có sẵn trong ảnh trước khi chiếu lên mesh
  pbr: boolean,                   // thêm metallic-roughness + normal map
}

// kind = "rig"
params = { skeleton: "mixamo" }   // tên xương mixamorig:* để anim Mixamo chạy thẳng không cần map
```

`result.files` theo kind:

| kind | files |
|---|---|
| shape | `glb` (mesh đã tối ưu theo polycount), `raw_glb` (mesh gốc model sinh), `thumb`, `views_clean/*` (ảnh đã tách nền) |
| texture | `glb` (mesh + atlas nhúng), `thumb`, `albedo`, `orm?`, `normal?` |
| rig | `glb` (skinned, xương mixamorig, đứng T-pose), `thumb` |

## Máy gen

```js
worker = {
  id: "pc:gen3d" | "linux:gen3d" | "linux2:gen3d", label, host,
  caps: ["shape", "texture", "rig"],      // loại job máy này làm được (tự báo lúc hello)
  enabled, priority, claim_delay_s,
  status: "idle" | "busy" | "paused" | "lowmem" | "offline",
  note, current_job, last_seen, jobs_done,
  gpu: { name, vram_total_mb, vram_free_mb }, mem: { commit_free_gb? , ram_free_gb },
}
```

Ưu tiên: PC priority 0, linux2 1, linux 2. Worker priority lớn nhường job trong `claim_delay_s` khi còn máy priority nhỏ hơn
online, rảnh và **có cap của kind đó**. Trước mỗi lần claim worker tự đo: PC cần commit trống ≥ 8 GB và VRAM trống ≥ 4 GB,
thiếu thì báo `lowmem` và không claim, job rơi sang máy sau. Máy chung với nhiều phiên Claude khác (xem
`principles/shared-machine-memory`), nên ngưỡng này là luật cứng trong worker chứ không là quy ước.

## Pipeline mỗi kind

| kind | Các bước | Model |
|---|---|---|
| shape | tách nền từng ảnh (BiRefNet) → TripoSG từ ảnh trước (hoặc ảnh duy nhất) → dọn mesh → giảm còn `polycount` (tam giác) hoặc remesh tứ giác (Instant Meshes) | TripoSG 1.5B (MIT) |
| texture | khử sáng (tuỳ) → chiếu các ảnh người dùng lên mesh theo hướng nhìn → vùng mù: tô lân cận hoặc diffusion vẽ bù → atlas theo quality → PBR (tuỳ) | chốt sau spike S3 |
| rig | đặt T-pose chuẩn → đoán xương humanoid tên mixamorig → skin weights → glb | chốt sau spike S2 |

TripoSG chỉ dựng hình từ một ảnh. Ảnh sau, trái, phải được dùng cho texture (chiếu thẳng màu thật từ ảnh lên mesh) và để
chọn ảnh rõ nhất làm đầu vào shape khi thiếu ảnh trước.

## Thử anim

`gen3d-anim.html?job=<id job rig>`: three.js nạp glb có xương, danh sách anim lấy từ `gen3d/mixamo/index.json` (mỗi anim
một file glb chỉ chứa track xương mixamorig, xuất từ FBX Mixamo "Without Skin"). Vì cả hai phía cùng tên xương, clip gắn
thẳng vào `AnimationMixer` của model, không cần retarget. Có tìm theo tên, tốc độ, lặp, in-place.

`gen3d/mixamo/index.json` là mảng `[{ id, name, file, duration, inplace, description?, thumb?, gif? }]`. `file` là tên file
glb cạnh index. `inplace = false` nghĩa là clip giữ root motion; trang Thử anim có công tắc **Tại chỗ** xoá X/Z của Hips lúc
chạy, nên không cần file riêng cho bản tại chỗ. `description`, `thumb`, `gif` lấy từ metadata Mixamo (`motions.json`); trang
tìm theo tên và mô tả, rê chuột lên một anim thì hiện GIF. Tạo bằng `tools/gen3d-worker/import-mixamo.mjs` (thư mục FBX
Mixamo "Without Skin", chạy lại chỉ thêm clip mới), dự phòng bằng `seed-mixamo.mjs` (clip của Soldier.glb + Xbot.glb mẫu three.js).

## Kiểm

`node test/gen3d-studio-api.js` gọi vào function đã deploy: tải ảnh, gửi shape, lọc caps, nhường ưu tiên, lowmem, xong,
texture con, chặn texture thiếu cha, tự ra texture khi bật công tắc, chain, huỷ, chạy lại, xoá cả nhánh. Cần
`~/.gen3d-worker-key` và `~/.rc-bot-password`. Deploy:

```
timeout 400 npx -y supabase@2.120.0 functions deploy gen3d-studio --project-ref jvdguaecnllejdmgytia --use-api --no-verify-jwt
```

Secret `GEN3D_WORKER_KEY` đặt bằng `npx supabase@2.120.0 secrets set GEN3D_WORKER_KEY=... --project-ref jvdguaecnllejdmgytia`;
máy worker giữ cùng giá trị ở `~/.gen3d-worker-key`.

## API

Một endpoint: `POST {SUPABASE_URL}/functions/v1/gen3d-studio`, body `{ "action": "...", ... }`, header `apikey: <anon>`.
Trả `{ ok: true, ... }` hoặc `{ ok: false, error: { code, message } }`. Art: `Authorization: Bearer <access token hub>`, role
`member`, `artist` hoặc `admin`. Worker: `x-gen3d-worker-key: <GEN3D_WORKER_KEY>`. File công khai:
`{SUPABASE_URL}/storage/v1/object/public/gen3d/<path>`.

### Art

| action | vào | ra |
|---|---|---|
| `me` | | `{ user, isAdmin }` |
| `upload_urls` | `files: [{ name, type, size }]` (1–4 ảnh png/jpeg/webp, ≤ 15 MB) | `files: [{ path, uploadUrl, publicUrl }]` dưới `refs/<user>/` |
| `submit` | `kind`, `title?`, `params`, `parent_id?` (bắt buộc với texture/rig) | `{ job }`; job con không ghi `title` thì lấy tên job gốc |
| `list` | `mine?`, `limit?` | `{ jobs }` (không có `log`) |
| `get` | `id` | `{ job }` (có `log`) |
| `chain` | `id` (job bất kỳ trong chuỗi) | `{ root_id, jobs }` mọi phiên bản cùng `root_id`, cũ trước |
| `cancel` / `retry` | `id` | `{ job }` |
| `delete` | `id` | `{ deleted }`; xoá luôn mọi phiên bản con; từ chối khi job hay con nào đang gen |
| `workers` | | `{ workers }` |
| `worker_update` | `id`, `patch: { enabled?, priority?, claim_delay_s?, label? }` (admin) | `{ worker }` |

`params.only_worker = "id1,id2"` (mọi kind): chỉ các máy này nhận và chỉ nhường nhau; dùng cho test. Job con không ghi thì
kế của cha.

`stage` khi running: shape `setup · segment · generate · optimize · uploading`; texture `setup · delight · project · inpaint ·
bake · uploading`; rig `setup · skeleton · skin · uploading`.

### Worker

| action | vào | ra |
|---|---|---|
| `hello` | `worker: { id, label, host, caps, gpu, mem, defaults: { priority, claim_delay_s } }` | `{ config }`; caps/gpu/mem ghi đè, ưu tiên admin đã chỉnh thì giữ |
| `claim` | `worker_id` | `{ job \| null, config }`; chỉ kind trong `caps`; job con kèm `job.parent` (có `result.files.glb`) và `job.root` (có `params.views`) |
| `heartbeat` | `worker_id`, `status` (idle/busy/paused/lowmem), `note?`, `job_id?`, `gpu?`, `mem?` | `{ config, job_status }` |
| `progress` | `worker_id`, `job_id`, `stage`, `msg`, `preview?` | `{ job_status }` |
| `upload_urls` | `job_id`, `files: [{ name, type }]` (glb, png, jpeg, webp, json; `name` được có `/`) | dưới `out/<job_id>/` |
| `mixamo_upload_urls` | `files: [{ name, type }]` (glb, json) | dưới `mixamo/` |
| `complete` | `worker_id`, `job_id`, `result: { files, stats }` (bắt buộc `files.glb`) | `{ job, child_id }`; shape có `params.texture` thì `child_id` là job texture vừa tự tạo |
| `fail` | `worker_id`, `job_id`, `error`, `requeue?` | `{ job }` |
| `bye` | `worker_id` | `{ deleted }` |
