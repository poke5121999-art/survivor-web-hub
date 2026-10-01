# Cây Gia Phả

Dựng và gìn giữ gia phả dòng họ trên trình duyệt. Không engine, không bước build, không máy chủ.

- Chạy: mở `games/gia-pha/index.html` (qua HTTP hay `file://` đều được).
- Kiểm: `node test/gia-pha-suite.js`. Kiểm bản trên Pages: `GP_URL=https://poke5121999-art.github.io/survivor-web-hub/games/gia-pha/index.html node test/gia-pha-suite.js`.

## Tệp

| Tệp | Lo việc gì |
|---|---|
| `js/model.js` | Mô hình dữ liệu và mọi phép đổi (thêm, xoá, chuyển nhánh, đổi thứ tự). Thuần, chạy được trong node. |
| `js/layout.js` | Bố cục: doc vào, toạ độ thẻ và danh sách dây nối ra. Thuần. |
| `js/store.js` | IndexedDB (cây + tệp Blob), hoàn tác/làm lại, lưu chậm, xuất/nhập, dọn tệp mồ côi. |
| `js/view.js` | Khung cây: thẻ DOM, dây SVG, tween vị trí, camera, kéo thả thẻ, thả tệp lên thẻ. |
| `js/panel.js` | Bảng chi tiết: thông tin, ghi chú kiểu Word, tài liệu, ghi âm. |
| `js/app.js` | Vỏ: thanh trên, menu, tìm, hộp thoại, thông báo, trình xem tệp, hiệu ứng, phím tắt. |
| `vendor/mammoth.browser.min.js` | mammoth 1.8.0 (BSD-2), đọc `.docx` ra HTML. Chỉ tải khi xem hoặc nhập tệp Word. |

## Mô hình

```
Person = { id, name, gender:'m'|'f', born, died, place, note(html), photo(fileId|null), files:[fileId], parentUnion }
Union  = { id, a(người trong dòng), b(vợ/chồng|null), children:[personId] }
view   = { collapsed:{id:true}, focus, cam }   // không vào hoàn tác
```

Bất biến, mọi phép đổi trong `model.js` giữ nguyên:

- Người trong dòng là con của đúng một Union (hoặc là gốc). Vợ/chồng chỉ có mặt qua đúng một Union với tư cách `b`, không có cha mẹ trong cây.
- Một người có nhiều Union là nhiều đời vợ/chồng. Con gắn với đúng Union của cha mẹ ruột.
- Không có vòng tổ tiên. `normalize()` cắt vòng và gỡ tham chiếu treo; dữ liệu từ IndexedDB và từ tệp nhập đều đi qua nó.

Gia phả ở đây đi theo dòng (như gia phả họ Việt): chỉ thêm được cha/mẹ cho người đứng đầu nhánh, không thêm cha mẹ cho dâu/rể.

## Hoạt ảnh

Một tween JS chạy chung cho vị trí mọi thẻ, dây nối vẽ lại mỗi khung từ vị trí đang tween. Không dùng CSS transition cho vị trí, vì dây phải bám thẻ ở từng khung hình.

Một luật lo mọi trường hợp. Thẻ mới mọc ra từ tổ tiên gần nhất đang hiện. Thẻ biến mất thu về tổ tiên gần nhất còn lại. Luật này phủ cả mở/thu nhánh, thêm, xoá, xem riêng nhánh, hoàn tác.

## Bẫy đã sập khi kiểm (2026-10-01)

- `[BẪY ĐÃ SẬP]` Nút chọn Nam/Nữ nằm trong `<form>` mà thiếu `type="button"`. Khi đó Enter trong ô tên kích nút "Nam" (nút submit đầu tiên), mà nút này `preventDefault`, nên không trồng được người. Mọi `<button>` trong form phải ghi rõ `type`.
- `[BẪY ĐÃ SẬP]` "Vừa khung" cây 25 người trên màn 390px ra hệ số 0.15. Thẻ còn 27px, chạm vào là trúng nút thu/mở. Lần mở đầu dùng `fit(0, true)`: cây lớn thì phóng vừa đọc (0.62 trên điện thoại, 0.5 trên máy tính) và đặt cụ tổ ở đầu màn. Phím F vẫn thu toàn cảnh.
- `[BẪY ĐÃ SẬP]` Ghi chú mở toàn màn (`section.full`, `position: fixed; z-index: 90`) vẫn bị thanh trên (z 30) đè. Nguyên nhân là `.panel` có `z-index: 20` nên tạo stacking context riêng. Sửa bằng `.panel:has(section.full) { z-index: 90 }`.
- Hộp thoại xoá từng ghi "Xoá cả nhánh (N người)" mà không đếm dâu/rể sẽ bị xoá theo. Số trên nút phải là số thật sẽ mất.
- Esc khi đang gõ chỉ rời ô gõ, Esc lần hai mới đóng bảng. Bài kiểm phải bấm hai lần.
- Bài kiểm: mở bảng chi tiết làm camera dời theo thẻ đang chọn, nên toạ độ đo trước đó thành cũ. Bấm `F` (vừa khung) rồi mới đo hay bấm thẻ.
- Bài kiểm: nút `+N` của nhánh đang thu có hoạt ảnh nhún, Playwright chờ "stable" mãi. Nhún giới hạn 3 lần, bài kiểm bấm bằng toạ độ chuột.

## Bẫy do lượt kiểm độc lập tìm ra trên Pages (2026-10-02)

Một agent khác dùng thử bản trên mạng mà không đọc mã. Nó tìm ra 8 lỗi mà bộ kiểm của người viết không thấy, vì bộ kiểm ấy mang cùng giả định với mã. Mỗi lỗi giờ có phép thử riêng.

- `[BẪY ĐÃ SẬP]` Ẩn nút ☰ trên điện thoại cho đỡ chật là cắt mất cả tính năng "hiện tới đời N" và hướng dẫn. Gom chức năng vào menu, đừng ẩn lối vào menu.
- `[BẪY ĐÃ SẬP]` `<input>` trong ô lưới `1fr 1fr` có bề rộng tối thiểu theo nội dung, nên tràn khỏi bảng. Cần `min-width: 0; width: 100%`.
- `[BẪY ĐÃ SẬP]` `new Date().toISOString().slice(0, 10)` là ngày UTC. Ở Việt Nam (UTC+7), từ 0h tới 7h sáng nó ra ngày hôm trước.
- `execCommand('insertHTML', …<table>…)` để con trỏ ở sau bảng. Phải tự đặt range vào ô đầu.
- Chạm (không kéo) tay nắm tấm dưới phải đổi được chiều cao. Ngưỡng cũ 0.6 nhỏ hơn chiều cao mặc định 72vh, nên chạm không làm gì.
