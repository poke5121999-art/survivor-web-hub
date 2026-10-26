# rc-rpc

Server RPC nhị phân PlayFish của Restaurant City, chạy trên Supabase Edge cho người chơi đăng nhập bằng tài khoản hub. Hàm này chạy **chính mã RPC + lưu trữ của server gốc** ([Dippys/Restaurant-City-Server](https://github.com/Dippys/Restaurant-City-Server), bản clone ở `D:\rc-ref\server`), không viết lại. Dữ liệu nằm trong schema `rc` của Postgres hub (37 bảng theo `prisma/schema.postgresql.prisma` của server gốc, cộng 2 bảng hàng đợi sự kiện của hàm này).

Mọi file trong thư mục này (trừ README) là **sinh ra**, đừng sửa tay: sửa ở `games/restaurant-city/tools/rpc-shims/` rồi build lại.

## Giao kèo HTTP

| Gọi | Auth | Trả |
|---|---|---|
| `POST /functions/v1/rc-rpc`, body = byte RPC thô, `Content-Type: application/octet-stream` | `Authorization: Bearer <access token hub>` + `apikey: <anon>` | 200 + byte trả về đúng như `handleRpc` của server gốc. Lỗi trong responder vẫn 200 `[0,0,0]` như bản gốc, kèm header `x-rc-error` |
| `GET /functions/v1/rc-rpc/me` | như trên | `{"ok":true,"username","networkUid","playfishUid"}`, tạo tài khoản + hồ sơ nếu chưa có |
| `GET /functions/v1/rc-rpc/profile-image/<uid>/<type>.png` | không cần | PNG chân dung (như `/__api/profile-image/...` gốc) hoặc 404; `Cache-Control: public, max-age=60` |
| `POST /functions/v1/rc-rpc/social-links`, JSON mẫu `{kind, itemId?, ingredientId?, legacyUrl?, quantity?}` | bắt buộc | 201 `{"ok":true,"slug"}` (`createPlayerLink` gốc); mẫu sai 400 `{"ok":false,"error"}`; quá 20 link/phút 429 |
| `GET /functions/v1/rc-rpc/social-links/<slug>` | không bắt buộc (có token thì biết người xem đã nhận chưa) | `{"ok":true,"link":{...publicLink gốc, itemName}}` hoặc 404 |
| `POST .../social-links/<slug>/actions`, JSON `{action, idempotencyKey}` | bắt buộc | kết quả `actOnLink` gốc: 200 `{ok:true,outcome}`, 409 `ALREADY_DONE`, 400 `{ok:false,code}` |
| `POST .../social-links/<slug>/cancel` | bắt buộc, chỉ người tạo | 200, trả đồ trong escrow về |

Token sai/hết hạn: 401 `{"ok":false,"error":"session expired"}`. Tài khoản bị khoá: 403. CORS: origin `*`, header `authorization, apikey, content-type, x-client-info, idempotency-key`, method `GET, POST, OPTIONS`. Mỗi trả lời RPC có `Server-Timing` (thời gian từng pha + số truy vấn) để đo.

## Bên trong

- `index.ts` (từ `rpc-shims/index.ts`): CORS, kiểm token bằng `GET /auth/v1/user` (cache theo sha256 token 60 s), rồi mới `import()` bundle, nên OPTIONS/401 không tốn cold start Prisma.
- `rpc.bundle.js`: esbuild gói `rpc-shims/rpc-main.ts` + 38 mô-đun gốc (`rpc/*`, `db/profile-store`, `db/rpc-store`, `moderation/*`, `social-links/service`...) + Prisma client sinh cho Deno. `rpc-main` gọi nguyên `buildResponse` gốc.
- Tài khoản hub → `rc."Account"`: `id` = id user hub; username lấy từ `user_metadata.display_name` (không có thì phần trước `@` của email), bỏ dấu, lọc theo luật `cleanUsername` gốc (3-24 ký tự `[A-Za-z0-9_.-]`), trùng thì thêm `_2`, `_3`...; networkUid/playfishUid theo `accountFromUsername` gốc (FNV-1a), đụng UID thì lấy tên kế tiếp. PIN đóng (`pinEnabled=false`). Hồ sơ tạo bằng `ensureLoginAccount` gốc.
- `rc."Session"`: `id` = claim `session_id` của JWT hub, `tokenHash` = sha256(session_id). Hàng rào lưu (save fence) của `init` nằm ở đây như bản gốc.
- Đồ thay thế (shim) trong `games/restaurant-city/tools/rpc-shims/`:
  - `db-client.ts` thay `src/db/client.ts`: Prisma client Deno + `@prisma/adapter-pg`, schema `rc`, pool 4.
  - `live-events.ts` thay `src/live-events.ts`: hàng đợi trong Postgres (`rc.rc_live_online`, `rc.rc_live_event`), giữ nguyên chữ ký đồng bộ. Trước request có `pollEvents` thì nạp hàng đợi của người gọi; sau `buildResponse` thì ghi các thay đổi (ack, gửi đi, thư mới) **trước khi trả lời**, nên thư A gửi tới được lần `pollEvents` kế của B. "Online" = poll trong 150 s.
  - `fs.ts` thay `node:fs` cho mã gốc: các file `public/data/*.xml` của server gốc được nhúng vào bundle; đường dẫn khác coi như không có file. `public/data` bị `.gitignore` ở repo server, nên phải có sẵn 7 file trong `CATALOG_FILES` của `db/item-catalog.ts` (tải từ `https://rc-reborn.uk/<tên>.xml`); thiếu file nào build dừng.
  - `sharp.cjs`: chỉ dùng cho ảnh thông báo Discord, không bao giờ chạy.
- Sửa lúc build (vá chữ, mỗi chỗ phải khớp đúng 1 lần, không khớp là build lỗi): `rpc-store.ts` `minPollInterval` bất đồng bộ 5000 → 60000 ms (đồng bộ giữ 30000), mỗi người chơi poll khoảng 1 lần/phút; `buyMysteryBox` không phân giải token nữa (client không gửi RPC 32, token là id thuần từng tặng không món đồ). Bộ mã PNG (`encodeArgbPng`..`CRC32_TABLE`) được nhấc nguyên văn khỏi `http-server.ts`.
- Việc lúc khởi động của bản gốc: `ensureEconomyCatalog` vốn đã chạy lười trong `economyCatalog()`; xoay nguyên liệu chợ hằng ngày (`runDailyIngredientRotation`, idempotent) chạy ở request đầu tiên của mỗi isolate trong mỗi ngày UTC sau 12:00 UTC.
- Social link (thay khung Facebook: tặng snack, chia sẻ, mời bạn, xin nguyên liệu, Food King) chạy `social-links/service` gốc; trang nhận là `games/restaurant-city/index.html?link=<slug>`. Giới hạn 20 link/phút, 60 thao tác/phút tính theo isolate.
- Không chạy: HTTP server, trang admin, Discord (OAuth, DM, webhook), lịch quét moderation định kỳ, quét escrow hết hạn (`sweepExpiredEscrow`), đo hiệu năng, ghi log request. Quét moderation sau mỗi lần lưu (`schedulePlayerScan`) và ghi hoạt động (`activity-buffer`) vẫn chạy, nền qua `EdgeRuntime.waitUntil`.

## Build và deploy

```
node games/restaurant-city/tools/build-rpc.mjs            # in ra git HEAD của D:/rc-ref/server
cd D:/survivor-web-hub
timeout 400 npx -y supabase@2.120.0 functions deploy rc-rpc --project-ref jvdguaecnllejdmgytia --use-api --no-verify-jwt
node test/restaurant-city-rpc.js                          # chạy vào bản đã deploy
```

`--server <dir>` / `--out <dir>` đổi chỗ đọc/ghi. Build cần `npm install` sẵn trong server gốc (dùng Prisma CLI của nó); esbuild 0.25.10 tự cài vào `%LOCALAPPDATA%/rc-rpc-build`. Bắt buộc `--no-verify-jwt`: hàm tự kiểm token, và route ảnh chân dung không có token.

## Bẫy đã gặp

- Prisma 7 trên Edge: generator `prisma-client`, `runtime = "deno"`, đuôi `.ts`; trong `generated/internal/class.ts` hai `import()` runtime phải đổi sang `npm:@prisma/client@7.8.0/runtime/query_compiler_fast_bg.postgresql(.wasm-base64).mjs` (build làm việc này, không thấy chỗ cần đổi là dừng).
- `process.pid` không có trên Edge mà Prisma cần: `index.ts` gán `pid=1` **trước** khi import bundle.
- Truyền `pg.Pool` vào `PrismaPg` thì hỏng (hai bản `pg` khác nhau → ECONNREFUSED): truyền object cấu hình.
- Schema `rc` đã có sẵn, đừng xoá. Bảng phụ tạo bằng `create table if not exists` lúc khởi động.
- CLI cắt request deploy ở 60 s. Khi `generated/` (3 MB TS) còn là file rời, phía Supabase bundle quá 60 s và deploy hỏng thật; giờ client Prisma nằm trong `rpc.bundle.js`, deploy ~30 s. Kiểm bằng `functions list` (số `version` tăng), đừng tin dòng báo lỗi hay báo xong. Token CLI không chạy được SQL, không đọc được log, nên lỗi được trả trong body/header (`detail`, `x-rc-error`).
- Trễ: DB ở **ap-northeast-1** (Tokyo), còn Edge chạy ở vùng gần người gọi (từ VN là ap-northeast-2, Seoul). Mỗi truy vấn ~26 ms qua vùng, batch `getUserProfile` của mã gốc tốn ~75-120 truy vấn, nên ~2-4 s. Ép vùng bằng `?forceFunctionRegion=ap-northeast-1` thì phần chạy mã còn ~0,3-0,7 s.
- Capture `D:/rc-ref/capture.jsonl` mang token phiên RPC cũ; test thay bằng token mà `init` vừa trả (cùng 32 ký tự) để `saveProfile` qua được save fence.
