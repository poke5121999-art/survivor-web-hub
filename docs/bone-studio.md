# Xưởng Xương (bone-studio/)

Editor animation 2D bằng bone chạy trên trình duyệt, kiểu thể loại skeletal animation: dựng rig (bone, slot, ảnh, skin),
key animation trên dopesheet, xuất JSON + atlas cho game trong hub. Có khung prompt để một agent Claude sửa rig và
animation **trực tiếp** trong lúc họa sĩ xem.

## Các mảnh

| Mảnh | Ở đâu | Việc |
|---|---|---|
| Editor | `bone-studio/index.html`, `bone-studio/src/editor/*` | setup/animate, dopesheet, lưu/mở, nhập/xuất, khung agent |
| Lõi dùng chung | `bone-studio/src/commands.js`, `src/tx.js`, `src/history.js` | tài liệu, bảng command, reducer thuần có inverse, undo/redo |
| Runtime | `bone-studio/runtime/xuong.js` | pose, timeline, IK, trộn animation, vẽ canvas2D, atlas. Game trong hub nhúng file này |
| Tự cắt part | `bone-studio/src/split/*` | ảnh nguyên con → part + bone (chạy cả trong trình duyệt lẫn bone-cli) |
| bone-cli | `bone-studio/cli/bone-cli.mjs` | đọc doc, áp command có kiểm tra, render PNG, cắt part, xuất. Editor, agent, test cùng đi qua đây |
| API + hàng đợi | `supabase/functions/bone-studio/index.ts` | bảng `bone_jobs`, `bone_events`, `bone_workers`, `bone_projects`, bucket `bone` |
| Worker | `tools/bone-worker/worker.mjs` | mỗi tài khoản Claude một tiến trình: nhận job, chạy `claude -p` với bone-cli, đẩy event |

## Tài liệu (doc)

Một dự án là một object JSON (định dạng `xuong`, `version: 1`), gần với JSON của Spine 4.x để nhập/xuất gần như một-một:

```js
doc = {
  format: "xuong", version: 1, name, fps: 30, pixelArt: false,
  images: { "<path>": { width, height } },                  // điểm ảnh lưu riêng (IndexedDB / images/<path>.png)
  bones: [{ name, parent, length, x, y, rotation, scaleX, scaleY, shearX, shearY, inherit, color, hidden? }],  // cha trước con
  slots: [{ name, bone, color: "rrggbbaa", dark?, attachment, blend, hidden? }],   // thứ tự = draw order, dưới → trên
  skins: [{ name: "default", attachments: { "<slot>": { "<tên>": { type: "region", path, x, y, rotation, scaleX, scaleY, width, height, color } } } }],
  ik: [{ name, bones: [cha, con], target, bendPositive, mix, softness, stretch, compress }],
  events: { "<tên>": { int, float, string } },
  animations: { "<tên>": {
    bones: { "<bone>": { rotate: [{ time, value, curve? }], translate: [{ time, x, y, curve? }], scale: [...], shear: [...] } },
    slots: { "<slot>": { attachment: [{ time, name }], rgba: [{ time, color, curve? }] } },
    drawOrder: [{ time, order: [slot dưới → trên] }],
    events: [{ time, name, int?, float?, string? }],
    ik: { "<ik>": [{ time, mix, softness, bendPositive, stretch, compress, curve? }] },
  } },
}
```

- Toạ độ thế giới y hướng lên, đơn vị = pixel. Góc theo độ, ngược chiều kim đồng hồ.
- Key bone tương đối với setup pose: rotate, translate, shear cộng; scale nhân. Thời gian theo giây.
- `curve`: thiếu = linear, `"stepped"`, hoặc `[x1, y1, x2, y2]` bezier chuẩn hoá 0..1 cho đoạn từ key này tới key sau.

## Constraint và attachment đặc biệt

- Transform constraint (`transform.add/set/remove`, key `{transform}`): bone chép xoay/dời/scale/shearY của target, 4 kiểu (thế giới hoặc cục bộ × trùng hoặc cộng thêm), lệch thêm, 6 mix. Chạy theo thứ tự chung với IK (`order`).
- Clipping (`type: "clipping"`, `end: <slot>`): cắt mọi slot vẽ sau nó tới hết slot `end`. Cắt tam giác ngay trong `drawList` (CPU), nên canvas2D, bone-cli và three.js đều có.
- Tint black: `slot.dark` (`rrggbb`), key `{slot, prop: "dark"}`; chỗ đen của ảnh thành màu tối, chỗ trắng thành màu slot. Xuất Spine thành timeline `rgba2`. Runtime three.js chưa vẽ tint black.
- Sequence: attachment có `sequence: { count, start, digits, setup }`, ảnh là `path + số`; key `{sequence: {skin, slot, attachment}}` với `mode` hold/once/loop/pingpong (+Reverse), `index`, `delay`.
- Bounding box, point: lưu và xuất như Spine; editor vẽ khung xanh (bounding box), đỏ nét đứt (clipping), dấu chữ thập (point).

## Command

Mọi thay đổi (UI, agent, test) là một command `{ type, ...args }` trong `COMMANDS` (`src/commands.js`).
`apply(doc, cmd)` thuần, trả `{ doc, inverse }`. `bone-cli commands` in danh sách và tham số. Một nhóm command (một
thao tác kéo, một lượt agent) là một bước undo.

## Job agent: vòng đời

```
queued ──claim──▶ running ──complete──▶ done
   ▲                │  └──fail────────▶ failed ──retry──▶ queued
   │                ├──fail(requeue)──▶ queued   (worker hết hạn mức: trả job, không tính lượt)
   │                └──reaper─────────▶ queued   (heartbeat im > 180 s; lần thứ 3 thì failed)
   └─────── cancel từ queued/running ─▶ canceled
```

`stage` khi running: `setup` · `thinking` · `editing` · `checking` · `uploading`.

`params.mode`:
- `agent` (mặc định): agent làm theo prompt trên bản chụp dự án.
- `split`: agent nhìn ảnh nguyên con (`refs[0]`), đặt khớp bằng `bone-cli split grid`, rồi `bone-cli split auto --skeleton`.
  Khung xương: `joints` (pixel ảnh gốc) + `parts` (`name`, `from`, `to`, `parent`), mỗi part tuỳ chọn `claim` (đa giác: mọi
  pixel trong đó thuộc part), `only: true` (chỉ nhận đúng claim), `bind: [bone treo, bone kéo…]` + `hang` 0..1 (thành mesh
  weight treo: đỉnh theo bone treo, đáy trộn sang bone kéo). Luật cắt (đồ đội đầu theo đầu, tay chân chỉ chứa chính nó, giáp
  vai và nắm tay dùng claim, vải/giáp treo dùng only + bind) ở `bone-cli split help`. Kiểm bằng
  `node bone-studio/tools/pose-sheet.mjs <project> <out.png> --limbs` (tay ±120°, cẳng tay ±130°, đùi ±70°).

## Luồng event (sửa trực tiếp)

1. Trang tải **bản chụp dự án** (`bundle.json`: `{ doc, images: { path: "data:image/png;base64,..." } }`) lên Storage qua
   `upload_urls`, rồi `submit` với `project: <path>`.
2. Worker tải bản chụp về thư mục job (`doc.json`, `images/*.png`), chạy Claude. Claude gọi `bone-cli apply`, `bone-cli split`…;
   mỗi lần áp thành công bone-cli ghi một dòng vào `events.ndjson`.
3. Worker đọc `events.ndjson` (~300 ms một lần) và chữ Claude viết (stream-json), đẩy lên bằng `push_events`.
   Ảnh mới (part cắt ra) được tải lên Storage trước, event `image` mang đường dẫn Storage.
4. Trang gọi `events { id, since }` mỗi 0,5 s, áp event `cmds` vào **một nhóm undo** của job, nạp ảnh từ event `image`.
   Trong lúc job chạy, editor khoá sửa (vẫn xem, phát, chọn được) để doc của trang và của agent không lệch nhau.
5. `complete` kèm `result.doc` (đường dẫn doc cuối). Trang so doc của mình với doc cuối; lệch thì thay bằng doc cuối
   (vẫn trong cùng nhóm undo).

Event: `{ seq, t, kind, data }` với `kind`:

| kind | data |
|---|---|
| `say` | `{ text }`: chữ agent viết cho họa sĩ |
| `cmds` | `{ cmds: [command], note? }` |
| `image` | `{ name, path, width, height }`: `name` là path ảnh trong doc, `path` là file trên Storage |
| `stage` | `{ stage }` |
| `preview` | `{ path }`: PNG agent tự render để nhìn |

## API

Một endpoint: `POST {SUPABASE_URL}/functions/v1/bone-studio`, body `{ action, ... }`, header `apikey: <anon>`.
Trả `{ ok: true, ... }` hoặc `{ ok: false, error: { code, message } }`.

- Họa sĩ: `Authorization: Bearer <access token của hub>`, role `member`, `artist` hoặc `admin`.
- Worker: `x-bone-worker-key: <BONE_WORKER_KEY>` (secret của function; máy worker giữ ở `~/.bone-worker-key`, nếu không có thì đọc `~/.vfx-worker-key`).

### Họa sĩ

| action | vào | ra |
|---|---|---|
| `me` | | `{ user: { id, email, role }, isAdmin }` |
| `upload_urls` | `files: [{ name, type, size }]` (≤ 40 file, ≤ 20 MB/file; png, jpeg, webp, json) | `files: [{ path, uploadUrl, publicUrl }]` dưới `refs/<uid>/<stamp>/` |
| `submit` | `prompt`, `title?`, `project` (path bundle), `refs?: [{ path, kind, name }]`, `context?: { selection, anim, time }`, `params?: { mode, only_worker }` | `{ job }` |
| `list` | `mine?`, `page?`, `page_size?` | `{ jobs, total, page, page_size, pages }` |
| `get` | `id` | `{ job }` |
| `events` | `id`, `since` (seq, mặc định 0) | `{ events, job: { id, status, stage, error, result } }` |
| `cancel` | `id` | `{ job }` |
| `retry` | `id` | `{ job }` |
| `delete` | `id` | `{ deleted }` |
| `workers` | | `{ workers }` |
| `worker_update` | `id`, `patch: { enabled?, priority?, claim_delay_s?, model?, max_minutes?, label? }` (admin) | `{ worker }` |
| `project_list` | | `{ projects: [{ id, name, updated_at, versions }] }` của mình |
| `project_save` | `id?`, `name` | `{ project, upload: { path, uploadUrl } }` (phiên bản mới `projects/<uid>/<id>/v<n>.json`) |
| `project_commit` | `id`, `path`, `size` | `{ project }` |
| `project_get` | `id` | `{ project }` có `versions: [{ v, path, url, size, at }]` |

### Worker

| action | vào | ra |
|---|---|---|
| `hello` | `worker: { id, label, host, account, defaults }` | `{ config }` |
| `claim` | `worker_id` | `{ job \| null, config }` |
| `heartbeat` | `worker_id`, `status`, `note?`, `job_id?` | `{ config, job_status }` |
| `progress` | `worker_id`, `job_id`, `stage`, `msg?` | `{ job_status }` |
| `push_events` | `worker_id`, `job_id`, `events: [{ kind, data }]` | `{ seq, job_status }` |
| `upload_urls` | `job_id`, `files: [{ name, type }]` | `files: [{ path, uploadUrl, publicUrl }]` dưới `out/<job_id>/` |
| `complete` | `worker_id`, `job_id`, `result: { doc, summary }` | `{ job }` |
| `fail` | `worker_id`, `job_id`, `error`, `requeue?` | `{ job }` |
| `bye` | `worker_id` | `{ deleted }` |
| `test_submit` | `prompt`, `project`, `params` (bắt buộc `only_worker`) | `{ job }` (chỉ để test; người tạo ghi là `test`) |
| `test_events` | `id`, `since` | như `events` |
| `test_delete` | `id` | `{ deleted }` |

## Ưu tiên worker

Như Xưởng VFX: `linux:claude` priority 0, hai tài khoản PC priority 1 và 2, `claim_delay_s` 20 s. Worker priority lớn hơn
nhường job mới trong `claim_delay_s` giây nếu còn worker priority nhỏ hơn đang bật, online và rảnh. Admin chỉnh trên tab Máy.

## Chạy thử và kiểm

Mọi lệnh chạy từ thư mục repo. Trình duyệt headless cần `export PLAYWRIGHT_PATH=$HOME/.cache/pw-node/node_modules/playwright-core`.

| Lệnh | Kiểm gì |
|---|---|
| `node --test bone-studio/tools/test-core.mjs` | reducer, undo chính xác, world transform, IK, curve, đổi cha giữ vị trí, round-trip JSON Spine, atlas |
| `node bone-studio/tools/test-editor.mjs` | trình duyệt thật: nhập ảnh, tạo bone bằng chuột, Ctrl+click ảnh, xoay + undo, auto key, phát, xuất → nhập lại so từng pixel, lưu → mở lại, agent giả, tự cắt part. `BASE=https://poke5121999-art.github.io/survivor-web-hub` để chạy trên Pages |
| `node bone-studio/tools/test-agent-mock.mjs` | server giả + worker + fake-claude: event tới dần, job xong, doc cuối đúng, đo độ trễ |
| `node bone-studio/tools/test-agent-live.mjs [--mode split --sample pharaoh-raw]` | trang editor + server giả + worker + **Claude thật** (tốn token): canvas đổi dần, một undo bỏ cả lượt |
| `node bone-studio/tools/make-sample.mjs`, `make-pharaoh.mjs` | dựng lại hai dự án mẫu bằng command |
| `node bone-studio/tools/split-sheet.mjs <ảnh> <out.png> [--skeleton s.json]` | bảng duyệt tự cắt part |
| `node bone-studio/tools/bump.mjs` | đổi cache key `?v=` cho mọi file trình duyệt tải (chạy trước mỗi lần deploy) |

`?mock=1`: agent giả trong trang. `?api=http://127.0.0.1:<port>`: trỏ trang vào `tools/bone-worker/mock-server.mjs`.
`?sample=pharaoh|robo|empty`: mở mẫu.

## Deploy

1. Edge Function (cần Supabase access token):
   ```
   npx -y supabase@2.120.0 secrets set BONE_WORKER_KEY=<khoá> --project-ref jvdguaecnllejdmgytia
   timeout 400 npx -y supabase@2.120.0 functions deploy bone-studio --project-ref jvdguaecnllejdmgytia --use-api --no-verify-jwt
   ```
   Có thể dùng chung giá trị với `VFX_WORKER_KEY`; worker đọc `~/.bone-worker-key`, nếu không có thì `~/.vfx-worker-key`.
2. Worker: Linux `sh tools/bone-worker/start-linux.sh` (tmux `claude:bone-worker`), PC `powershell -File tools/bone-worker/start-pc.ps1`.
3. Trang tĩnh: `node bone-studio/tools/bump.mjs`, chạy các test ở trên, `git push origin HEAD:main`, đợi Pages ~70 s, chạy lại `test-editor.mjs` với `BASE=`.
