# gs-design

Proxy cho trang design editor: trình duyệt không gọi thẳng được admin API của GameSpark (không có CORS), nên hàm này giữ khóa, ký HMAC và đọc/ghi các bảng metadata `md_<table>`.

**Khóa là MCP key của project `repo-2d-topdown` trên DEV. Tuyệt đối không commit khóa/secret vào repo.**

## Đặt secret

```
supabase secrets set GS_BASE=https://gamespark-dev.hlo.vn GS_PROJECT=repo-2d-topdown GS_KEY=... GS_SECRET=... DESIGNER_EMAILS=a@x.com,b@y.com
```

`DESIGNER_EMAILS`: danh sách email được sửa, cách nhau bằng dấu phẩy, không phân biệt hoa thường. `SUPABASE_URL` và `SUPABASE_ANON_KEY` do nền tảng cấp sẵn.

## Deploy

```
supabase functions deploy gs-design --no-verify-jwt
```

Bắt buộc `--no-verify-jwt`: cổng JWT của nền tảng chặn preflight CORS; hàm tự kiểm tra token bên trong.

## Chạy local

```
node supabase/functions/gs-design/dev-server.mjs
```

Đọc khóa từ `%USERPROFILE%/.hlo-gs/credentials`, nghe `127.0.0.1:8787` (đổi bằng `PORT`), không xác thực. Chỉ dùng trên máy mình.

## Kiểm thử

- `node test/design-proxy.js`: core.js với GameSpark DEV thật, chỉ dryRun, không ghi gì.
- `node test/design-live.js` (cần dev server đang chạy): mở `design.html` thật, GHI `quests/daily.pick` +1 lên DEV rồi hoàn lại.
- `node test/design-editor.js`: giao diện với proxy giả trong bộ nhớ, không chạm mạng.

Khoá MCP tạo được bảng metadata nhưng KHÔNG xoá được (`data/collections/drop` trả 403, chỉ mở cho phiên đăng nhập người). Bảng tạo nhầm phải xoá tay ở Data Explorer.
