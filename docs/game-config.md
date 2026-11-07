# Trang sửa thông số game (game-config)

Trang `game-config.html?game=<id>` (mặc định `pocket-auto-battler-pet`) cho admin sửa các con số của một game
mà không phải sửa code. Lưu trên Supabase của hub, không qua GameSpark.

## Luồng

1. Game có số **gốc** (default) trong code. Trang chỉ lưu phần **ghi đè**.
2. Admin sửa trên trang, bấm "Xem lại & lưu", xem diff, lưu. Trang gửi `POST /rest/v1/game_config` (upsert) kèm
   token người dùng; RLS chỉ cho `public.is_admin()` ghi. Mỗi lần lưu tự chép vào `game_config_history`.
3. Ô đưa về đúng số mặc định thì khoá bị **gỡ** khỏi ghi đè (không lưu số trùng gốc).
4. Game đọc khi khởi động.

## Chạy SQL (một lần)

Supabase Dashboard > SQL Editor > dán `db/game-config.sql` > Run. Cần `db/roles.sql` đã chạy (hàm `is_admin()`).
Chạy lại an toàn.

## Game đọc ghi đè thế nào

```
GET {SUPABASE_URL}/rest/v1/game_config?game_id=eq.<id>&select=data
headers: apikey: <anon key>, Authorization: Bearer <anon key>
-> [{"data":{"run":{"startGold":700},"gacha":{"pullCost":160}}}]   (mảng rỗng = chưa ghi đè gì)
```

Rồi **deep-merge** `data` lên bảng số gốc: đối tượng thì trộn từng khoá, mảng và số và chuỗi thì thay nguyên.
Bảng (`table`) và danh sách (`list`) luôn được lưu **nguyên mảng** (không trộn từng dòng).
Lỗi mạng hay hàng chưa có thì dùng số gốc.

```js
function merge(base, over) {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return over === undefined ? base : over;
  const out = Object.assign({}, base);
  for (const k of Object.keys(over)) out[k] = (base && typeof base[k] === 'object' && !Array.isArray(base[k])) ? merge(base[k], over[k]) : over[k];
  return out;
}
```

## Hợp đồng schema: `games/<id>/config.schema.json`

Game (bước build) sinh file này; `games/pocket-auto-battler-pet/config.schema.json` hiện là bản MẪU.

```json
{"game":"pocket-auto-battler-pet","version":1,
 "tabs":[{"id":"run","label":"Lượt train","blurb":"...","fields":[
   {"key":"run.startGold","label":"Gold khởi đầu","help":"...","type":"int","min":0,"max":100000,"unit":"gold","default":500}]}]}
```

- `key`: đường dẫn có dấu chấm; chính là đường dẫn trong `data` lồng nhau. `default`: số gốc (bắt buộc).
- `type`: `int`, `number`, `bool`, `text`, `enum` (`options:[{v,label}]`), `list` (mảng số hoặc chuỗi, nhập cách nhau dấu phẩy;
  `items:"number"|"string"`, `min`/`max` cho từng phần tử số), `table` (`columns:[{key,label,type,min,max,unit,options}]`,
  `default` là mảng đối tượng; sửa, thêm, xoá dòng được; kiểu cột như trên trừ list/table).
- `label`, `help`, `unit`, `min`, `max` đều tuỳ chọn.

## Thêm game mới

1. Game sinh `games/<id>/config.schema.json` theo hợp đồng trên (mã game chỉ gồm chữ, số, `-`, `_`).
2. Mở `game-config.html?game=<id>`. Không cần đổi SQL: một hàng `game_config` cho mỗi `game_id`, tự tạo ở lần lưu đầu.
3. Game gọi REST ở mục trên với `game_id` của nó.

## Khôi phục

Tab "Lịch sử" liệt kê 20 lần lưu gần nhất (chỉ admin xem được). "khôi phục bản này" ghi lại bản đó làm bản ghi đè hiện tại
(và thành một dòng lịch sử mới, nên khôi phục cũng hoàn tác được).

## Kiểm

`node test/game-config-editor.js` (Playwright + Supabase REST giả trong tiến trình; ảnh chụp vào `SHOTS`).
