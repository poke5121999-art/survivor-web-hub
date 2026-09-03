# Art của SlimeClash

## Tình trạng: ART TẠM

94 chân dung trong `assets/units/` là **ảnh rip từ APK Slime Legion 4.5.0** (Perfeggs
Technology). Đây là **chỗ để vẽ đè**, không phải art cuối. Bản quyền thuộc Perfeggs —
thay hết bằng art tự vẽ trước khi coi game này là xong.

Lý do dùng tạm thay vì để ô màu trơn: ô màu trơn không đọc được ai là ai, và không có
cách nào đánh giá bố cục/độ tương phản khi chưa có hình thật trong ô.

## Lấy từ đâu

| Thứ | Nguồn trong APK |
|---|---|
| Chân dung 94 hero | sprite `Headicon_<bậc>_<id>` trong `assets/assetpack/ui/avataricon.bytes`, gốc 208×208 |
| id → slug (96 hero) | tên file `assets/assetpack/res/heroes/<id>_<slug>.bytes` |
| Bậc icon | chính tiền tố `<bậc>` của tên sprite — chỉ có hai giá trị 1 và 4 |

Xử lý: cắt viền trong suốt → đặt vào khung vuông → thu về **96×96** (gấp đôi ô 46px cho
màn retina) → PNG optimize. Trung bình ~18 KB/ảnh, tổng ~1,7 MB.

Hai hero (`122 goblins`, `134 wolf` — theo `res/heroes`) không có `Headicon` nên không có
ảnh; chúng tự rơi về ô màu trơn.

**KHÔNG dùng**: sprite trong `res/heroes/<id>_<slug>.bytes`. Đã thử — các khung `_0.._6`
ở đó là **hoạt ảnh vũ khí/đạn**, không phải nhân vật.

## Luật đổi art

> **Đổi art = thay file PNG + sửa `assets/asset-map.js`. KHÔNG đụng vào code.**

Trong toàn bộ code không có lấy một tên file ảnh nào — chỉ có khoá kiểu `unit.110`.
`js/atlas.js` là chỗ duy nhất tra khoá → đường dẫn, và nó đọc `assets/asset-map.js`.

Thiếu ảnh thì `Atlas.unit()` trả `null` và ô **tự rơi về ô màu trơn** — không vỡ, không
log rác. Nên xoá bừa một file PNG cũng không làm hỏng game.

Thêm hero mới có art:

1. Bỏ PNG vào `assets/units/<id>.png` (nên vuông, ≥96×96, nền trong suốt).
2. Thêm một dòng vào `assets/asset-map.js`: `"unit.<id>": "assets/units/<id>.png",`
3. Xong. Không cần sửa `data.js`, `ui.js` hay bất cứ file nào khác.

`Atlas.missing()` trả về danh sách khoá đã bị hỏi mà không có — tiện khi thêm hero mà
quên thêm ảnh.

## Vì sao ô cờ trộn màu (`mix-blend-mode: luminosity`)

Chân dung rip từ APK **có nền màu riêng** — đó là khung bậc hiếm của game gốc (vàng, cam,
tím, xanh…). Để nguyên thì màu nền ấy át mất màu của ô, mà **màu ô mới là thứ người chơi
phải ghép**. Đã thử để nguyên + viền màu 3px: viền gần như vô hình, đọc nhầm màu liên tục.

Nên ô cờ dùng `mix-blend-mode: luminosity`: giữ **độ sáng** của chân dung, lấy **màu** từ
nền ô. Kết quả là ô đỏ/lục/lam đọc được ngay từ xa mà vẫn thấy hình nhân vật.

Trong **danh sách đội hình/nâng cấp thì KHÔNG trộn** — ở đó người chơi muốn nhìn nhân vật
thật, và không phải ghép gì cả.

Khi vẽ đè art mới: nếu art của anh **nền trong suốt và một tông** thì có thể bỏ hẳn dòng
`mix-blend-mode` trong `css/style.css` để hiện màu thật.

## Thứ chưa lấy

Còn nằm trong APK, chưa dùng đến:

- `res/skillicon` (973 file) — icon kỹ năng, hiện đang dùng emoji thay.
- `res/enemyicon` (250), `res/enemies/spines` (308) — quái và spine.
- `res/terrain` (35), `res/scenes/tiles` (238) — nền bàn cờ.
- `ui/gameplay.bytes` — khung bàn cờ của bản gốc.
- `res/audios` (525) — âm thanh.
