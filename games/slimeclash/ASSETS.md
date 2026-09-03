# Art của SlimeClash

## Tình trạng: ART TẠM

Tất cả PNG trong `assets/` là **ảnh rip từ APK Slime Legion 4.5.0** (Perfeggs Technology).
Đây là **chỗ để vẽ đè**, không phải art cuối. Bản quyền thuộc Perfeggs — thay hết bằng art
tự vẽ trước khi coi game này là xong.

Lý do dùng tạm thay vì để ô màu trơn: ô màu trơn không đọc được ai là ai, và không có
cách nào đánh giá bố cục/độ tương phản khi chưa có hình thật trong ô.

## Lấy từ đâu

| Thứ | Số lượng | Nguồn trong APK |
|---|---|---|
| **Dải sprite theo CẤP** `assets/units/<id>.png` | 96 | sprite `<slug>_1` … `<slug>_6` trong `assets/assetpack/res/heroes/<id>_<slug>.bytes` |
| Chân dung `assets/heads/<id>.png` | 94 | sprite `Headicon_<bậc>_<id>` trong `assets/assetpack/ui/avataricon.bytes`, gốc 208×208 |
| Hình quái `assets/enemies/<slug>.png` | 48 | `assets/assetpack/res/enemyicon/<slug>.bytes` |
| id → slug (96 hero) | — | tên file `res/heroes/<id>_<slug>.bytes` |
| Bậc icon | — | tiền tố `<bậc>` của tên sprite `Headicon` — chỉ có hai giá trị 1 và 4 |

Xử lý: cắt viền trong suốt → đặt vào khung vuông → thu nhỏ → giảm còn 128 màu → PNG optimize.
Tổng ~2,5 MB.

Hai hero (`122 goblins`, `134 wolf`) không có `Headicon` nên không có chân dung; chúng tự
rơi về ô màu trơn.

### Đính chính: `res/heroes` là NHÂN VẬT, không phải vũ khí

Bản đầu tôi viết ở đây rằng các khung `_0.._6` trong `res/heroes/<id>_<slug>.bytes` là
"hoạt ảnh vũ khí/đạn" và bỏ cả bộ. **Sai.** Tôi chỉ lấy mẫu khung `_0` — khung đó đúng là
dạng trứng/sơ khai nên nhìn không ra nhân vật. Các khung `_1` … `_6` **chính là nhân vật ở
cấp 1 đến 6**, càng lên cấp càng nhiều giáp/phụ kiện. Đó là bộ art quan trọng nhất của cả
game này, vì gộp lên cấp là phần thưởng thị giác của cơ chế lõi.

## Dải khung theo cấp hoạt động thế nào

`assets/units/<id>.png` là **một dải ngang 6 khung**, mỗi khung 72×72:

```
[ cấp 1 ][ cấp 2 ][ cấp 3 ][ cấp 4 ][ cấp 5 ][ cấp 6 ]
```

Chọn khung bằng CSS, không cắt ảnh lúc chạy. `Atlas.unitStyle(heroId, grade)` là **chỗ duy
nhất** biết cách cắt:

```css
background-image: url(assets/units/110.png);
background-size: 600% 100%;      /* 6 khung */
background-position: 40% 0;      /* khung thứ 3 */
```

Muốn đổi số khung thì sửa `SLIME_ART_FRAMES` trong `assets/asset-map.js` — `atlas.js` đọc
từ đó, không có số 6 nào chôn trong code.

## Luật đổi art

> **Đổi art = thay file PNG + sửa `assets/asset-map.js`. KHÔNG đụng vào code.**

Trong toàn bộ code không có lấy một tên file ảnh nào — chỉ có khoá kiểu `unit.110`,
`head.110`, `foe.anubis`. `js/atlas.js` là chỗ duy nhất tra khoá → đường dẫn, và nó đọc
`assets/asset-map.js`.

Thiếu ảnh thì `Atlas.unit()` trả `null` và ô **tự rơi về ô màu trơn** — không vỡ, không
log rác. Nên xoá bừa một file PNG cũng không làm hỏng game.

Thêm hero mới có art:

1. Bỏ dải PNG vào `assets/units/<id>.png` (6 khung vuông xếp ngang, nền trong suốt).
2. Thêm một dòng vào `assets/asset-map.js`: `"unit.<id>": "assets/units/<id>.png",`
3. Xong. Không cần sửa `data.js`, `ui.js` hay bất cứ file nào khác.

Thêm quái mới: bỏ `assets/enemies/<slug>.png`, thêm `"foe.<slug>"` vào asset-map, rồi thêm
một dòng `{ slug, name }` vào `js/foes.js`. `FOES.usable()` tự lọc bỏ con nào chưa có ảnh.

`Atlas.missing()` trả về danh sách khoá đã bị hỏi mà không có — tiện khi thêm hero mà
quên thêm ảnh.

## Vì sao ô cờ trộn màu (`mix-blend-mode: luminosity`)

Sprite rip từ APK **có nền màu riêng** — khung bậc hiếm của game gốc (vàng, cam, tím,
xanh…). Để nguyên thì màu nền ấy át mất màu của ô, mà **màu ô mới là thứ người chơi phải
nhìn để ghép**. Đã thử để nguyên + viền màu 3px: viền gần như vô hình, đọc nhầm màu liên tục.

Nên ô cờ dùng `mix-blend-mode: luminosity`: giữ **độ sáng** của hình, lấy **màu** từ nền ô.
Kết quả là ô đỏ/lục/lam đọc được ngay từ xa mà vẫn thấy hình nhân vật.

Trong **danh sách đội hình/nâng cấp thì KHÔNG trộn** — ở đó người chơi muốn nhìn nhân vật
thật, và không phải ghép gì cả. Hình quái cũng không trộn.

Khi vẽ đè art mới: nếu art của anh **nền trong suốt và một tông** thì có thể bỏ hẳn dòng
`mix-blend-mode` trong `css/style.css` để hiện màu thật.

## Thứ chưa lấy

Còn nằm trong APK, chưa dùng đến:

- `res/skillicon` (973 file) — icon kỹ năng, hiện đang dùng emoji thay.
- `res/enemyicon` — mới lấy 48/250; `res/enemies/spines` (308) chưa động tới.
- `res/terrain` (35), `res/scenes/tiles` (238) — nền bàn cờ.
- `ui/gameplay.bytes` — khung bàn cờ của bản gốc.
- `res/audios` (525) — âm thanh.
