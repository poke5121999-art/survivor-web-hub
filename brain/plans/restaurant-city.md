# Restaurant City online trên hub

Nguồn: `Dippys/Restaurant-City-client` (AS3 decompile của `game.swf` 0.9.143a + vá RC Reborn) và
`Dippys/Restaurant-City-Server` (Node/TS + Prisma). Clone ở `D:\rc-ref\client`, `D:\rc-ref\server`.
Asset SWF/.bin không nằm trong repo nào: tải từ `https://rc-reborn.uk/<tên>` về `D:\rc-ref\assets` [ĐO 2026-10-26].

Chủ dự án muốn chơi online bằng tài khoản hub (2026-10-26), biết client có khoá tên miền của tác giả.

## Kiến trúc

- Trang `games/restaurant-city/` chạy Ruffle, nạp `game.swf` build lại (gỡ khoá tên miền, base URL theo thư mục SWF).
- Ruffle gọi `window.fetch` động (`e.fetch(_)` trong core.ruffle.*.js), nên trang bọc `fetch`:
  request `.../g/rpc/cooking` được chuyển sang Edge Function `rc-rpc` kèm access token hub.
- `rc-rpc` = codec + responders + profile-store + rpc-store của server gốc, bundle cho Deno, Prisma adapter-pg
  nối `SUPABASE_DB_URL`, bảng nằm trong schema `rc` (PostgREST không lộ ra, anon key không đụng được).
- Tài khoản: token hub → `auth/v1/user` → `rc."Account"` (tạo lần đầu). Server vẫn là nơi quyết định (trade, mua, lưu).

## Giai đoạn

1. Toolchain SWF: Flex SDK 4.16.1 + playerglobal 25.0 ở `D:\flex`; build lại khớp `client/bin/game.swf`; vá Engine.as.
2. Thử Prisma 7 + adapter-pg trong Supabase Edge (Deno). Hỏng thì quay về viết lại store trên PostgREST.
3. Schema `rc` trên Supabase từ `schema.postgresql.prisma`.
4. Edge Function `rc-rpc`: bundle, auth hub, bỏ Discord/moderation/admin.
5. Trang game + hook fetch + Ruffle vendored; chạy local trỏ vào function thật.
6. Polish avatar 3D (Away3D Phong vẽ ra gãy cạnh, má tối trong Ruffle).
7. Thẻ hub, ảnh thẻ, `rev`, test Playwright, push, chơi thử trên Pages bằng 2 tài khoản.

## Trạng thái 2026-10-26

- Xong 1-5 và 7 (lần đẩy đầu). `rc-rpc` deploy, `test/restaurant-city-rpc.js` 415 PASS; `test/restaurant-city-play.js` 7/7 ở máy.
- 6 (avatar, rev 20261026b): so 3 biến thể ở màn tạo nhân vật, 2x, function thật. Phong vẽ đường kẻ sáng chéo
  qua mặt trong Ruffle; đổ bóng một lớp (`WhiteShadingBitmapMaterial`) cháy trắng; texture phẳng sạch nhất →
  `patches/0003-avatar-flat-skin-texture.diff` (tóc vẫn Phong, không lỗi). Nhịp bấm tới màn avatar trên function
  thật: X, X, bong bóng, tờ báo, chờ 8 s (`rc-page-drive.js` trong scratchpad phiên 2026-10-26).
- Độ trễ: batch `getUserProfile` 2-4 s vì Edge ở Seoul còn DB ở Tokyo; trang gửi `forceFunctionRegion=ap-northeast-1`.

## Bẫy đã gặp

- Ruffle cần một cú bấm đầu để nhận focus; trước đó nút trong game không ăn [ĐO 2026-10-26].
- Server gốc rate-limit đăng ký theo IP; khởi động lại để reset khi test.
