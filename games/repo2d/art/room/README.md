# Bộ tile phòng ốc

Nguồn: **Modern Interiors — bản free v2.2** của **LimeZu** — https://limezu.itch.io/moderninteriors

## Giấy phép — đọc trước khi bán bất cứ thứ gì

`LICENSE-limezu.txt`, nguyên văn, nói được ba câu và cấm ba câu. Câu cấm quan trọng nhất:

> YOU CAN'T USE THE ASSET IN COMMERCIAL PROJECTS

**Bản free chỉ dùng được cho dự án PHI THƯƠNG MẠI**, kể cả bản đã sửa. Ngày nào hub này thu tiền
thì có đúng hai lối: mua bản đầy đủ (1,20 $ ở trang itch.io trên) và thay hai tệp `.png` này, hoặc
gỡ `phong.js` ra khỏi hai trang html — game vẫn chạy, chín kiểu phòng rơi về nước sơn vẽ bằng mã
ghi trong `FLOORS` / `WALLS`, không màn nào vỡ.

Ghi công nằm ở cuối Sổ tay trong game (xem chỗ `wk-nguon` trong `game.js`) chứ không chỉ ở đây:
một ràng buộc chỉ sống trong chú thích mã nguồn là một ràng buộc sẽ bị quên.

## Hai tệp

| Tệp | Gốc | Cỡ | Nội dung |
|---|---|---|---|
| `room-builder.png` | `Interiors_free/48x48/Room_Builder_free_48x48.png` | 816×1104 (17×23 ô) | sàn và tường |
| `interiors.png` | `Interiors_free/48x48/Interiors_free_48x48.png` | 768×4272 (16×89 ô) | đồ đạc |

Nội dung giữ nguyên từng điểm ảnh, chỉ đổi tên cho ngắn.

## Vì sao lấy bản 48×48 chứ không phải 16×16

`prerenderWorld()` vẽ cả thế giới ở `SS = 2`, tức mỗi ô 24 đơn vị thế giới được **48 điểm ảnh**
để vẽ. Bản 48 dán vào đúng một đổi một: không phóng, không thu, không một điểm ảnh nào phải qua
một phép nội suy. Lấy bản 16 rồi phóng ba lần cũng ra hình đó, nhưng mọi nét chéo trong tấm gỗ
xương cá sẽ nhoè đi một nấc — mà nét chính là thứ duy nhất bộ tile này bán cho ta.

Đổi lại: hai tệp nặng 229 KB thay vì 146 KB. Đó là cái giá, và nó rẻ.

## Lưới toạ độ

Bảng ô trong `../../phong.js` đếm bằng **Ô**, không bằng điểm ảnh, và lưới ô của bản 48 trùng khít
với bản 16. Nên muốn soi một miếng đồ thì cứ mở bản `16x16` trong bộ gốc ra đếm, số nào cũng dùng
lại được y nguyên.

### Trong `room-builder.png`

- **Sàn** — cột 11..13, mỗi kiểu chiếm 2 hàng: `5-6` gạch đỏ, `7-8` gạch men kem, `9-10` gạch men
  ngọc, `11-12` bê tông, `13-14` gỗ xương cá. Sáu ô của mỗi khối là **sáu biến thể lát được** của
  cùng một mặt sàn, không phải sáu mặt sàn khác nhau — ghép cạnh nhau thế nào cũng liền.
- **Tường** — mỗi kiểu chiếm 2 hàng, bắt đầu ở hàng `5, 7, 9, 11, 13, 15, 17, 19`. Trong một khối:
  - cột **5**, hàng trên = *thân tường*, không có viền hông, lát ngang bao nhiêu cũng liền;
  - cột **1**, hàng dưới = *mặt tường*, có sẵn dải chân tường ở đáy.

  `phong.js` chọn giữa hai cái đó bằng đúng một câu hỏi: ô ngay dưới bức tường này có phải sàn
  không. Có thì dán mặt tường, không thì dán thân tường.
- Cột 0..3 và 7..9 là cùng những bức tường ấy nhưng đã đóng sẵn viền hông và mảng trần trắng —
  dành cho bản đồ vẽ tay trong Tiled, không dùng ở đây vì tường trong game này chỉ dày một ô.

### Trong `interiors.png`

Xem thẳng bảng `M` trong `../../phong.js`: mỗi dòng là một họ đồ, mỗi miếng ghi
`[cột, hàng, rộng, cao]`. Hai điều đã đo và phải giữ:

- **Không miếng nào cao 3 ô.** Miếng cao 2 chiếm ô của nó và tràn một ô lên trên — đó là cách một
  cái tủ được nhìn từ 3/4. Tràn ba ô thì nó nuốt trọn bức tường phía trên, và cái tủ khi ấy không
  dựa vào tường nữa mà THAY tường.
- **Mỗi họ đồ dùng trong một kiểu phòng phải có ít nhất một miếng rộng đúng một ô.** Lý do viết
  ngay trên bảng `KIEU` trong `phong.js`, mục "LUAT MOT O".
