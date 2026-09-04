# Còn lại — bàn giao 2026-09-04

Bản vừa push: `be01f45` — bot biết đánh trả · bịch tiền lên xe · tàng hình mờ người · bớt chớp chớp.
Dấu build đã lên `?v=20260904a` (cả `repo2d/index.html`, `repo-squad/index.html` và hằng `BUILD`
trong `game.js` — ba chỗ này phải bằng nhau, xem chú thích ở đầu thẻ `<script>`).

---

## 1. VIỆC CHƯA XONG — làm trước

**Chơi thử trên Pages.** Đây là việc còn thiếu duy nhất của bản vừa push. Bảng test xanh không
thay chỗ này được: bốn thứ vừa sửa đều là thứ chỉ ĐỌC ĐƯỢC BẰNG MẮT.

- poke5121999-art.github.io/survivor-web-hub/games/repo2d/ (Ca Trực Đêm)
- poke5121999-art.github.io/survivor-web-hub/games/repo-squad/ (Biệt Đội)
- Pages xây xong khoảng 70 giây sau khi push. Nếu vẫn thấy bản cũ thì kiểm `?v=` trên thẻ script.

Bốn thứ cần nhìn tận mắt, và câu hỏi cụ thể cho từng thứ:

| Nhìn cái gì | Làm sao thấy | Câu hỏi |
|---|---|---|
| Bớt chớp | Ném 2–3 quả bom liền nhau vào một chỗ | Ba quả cho MỘT quầng sáng dài hay vẫn thấy ba nhịp rời? |
| Rung màn | Để Kẻ húc lao trúng mình | Màn đưa đi về trên một trục, hay vẫn giật lung tung? |
| Tàng hình | Biệt Đội, bấm chiêu Tàng Hình | "Mờ mờ" đã đúng độ chưa — hay còn quá rõ / quá mất? |
| Bịch tiền | Hạ Kẻ húc rồi đẩy xe tới chỗ đồ nó rơi | Có lên xe được không, và dòng chữ hiện ra có đúng không? |

**Chỉnh độ mờ ở đâu** (nếu tối về thấy chưa vừa mắt): `games/repo2d/game.js`, ngay trên
`playerDrawPos()` — `INVIS_DAY` (0.30, người chơi) và `INVIS_DAY_M` (0.20, đồng đội). Số càng
lớn càng rõ người. `INVIS_TAN` là mấy giây mờ đi, `INVIS_HIEN` là mấy giây cuối hiện lại.

**Chỉnh độ chớp ở đâu**: cùng tệp, khối `CHỚP CẢ MÀN HÌNH` (tìm `FLASH_TRAN`). Bốn số:
trần sáng, hệ số hạ chung, tốc độ dựng lên, tốc độ tắt, và quãng nghỉ giữa hai cú loé.
Cú rung ở ngay dưới (`SHAKE_NHIP`).

---

## 2. TEST CHƯA CHẠY LẠI

Đã chạy sau bản này: `repo-suite` 320/320 · `guns-suite` 52/52 · `bike-suite` 36/36.

Chưa chạy lại: `stuck-suite`, `land-suite`, `bot-suite`.
Không có lý do nào để nghĩ chúng hỏng — bản này không đụng vào đường đi lại hay va chạm — nhưng
chưa chạy thì chưa nói được. Chạy: `node test/stuck-suite.js`.

**Lưu ý về `bot-suite`: nó vốn đã hỏng 10 phép TỪ TRƯỚC bản này.** Đã dựng một `git worktree` ở
HEAD cũ để đối chứng, kết quả y hệt (15 đạt / 10 hỏng). Đừng mất buổi tối đi sửa tưởng là mình
vừa làm hỏng.

---

## 3. MẤY CHỖ CHỚP CÒN LẠI — cố ý chưa đụng

Đợt này chỉ đụng vào thứ NHẤP NHÁY ĐỘ SÁNG kéo dài. Ba chỗ còn lại đã cân nhắc rồi và để nguyên:

- **Kẻ húc giậm chân** (`game.js`, trong `drawFoeOne`, nhánh `m.type === 'rook'`): rung 11Hz cộng
  một chút ngẫu nhiên mỗi khung. Để nguyên vì nó chỉ chạy 0,28 giây và biên độ 2,6 điểm ảnh — nó
  là một nhịp lấy đà, không phải một cái đèn nháy. Nếu tối về vẫn thấy gắt thì hạ số `70` xuống.
- **Lớp hiệu ứng cộng sáng** (`drawVfx` lớp `'sang'`): mỗi tấm chỉ chạy một lần rồi tắt.
- **Vòng sáng khép lại theo nhịp tim**: đã hạ quầng đỏ một nửa, nhưng cái vòng tối KHÉP LẠI thì
  giữ nguyên — đó là thứ nói "có gì đang tới gần", bỏ đi là mất tin.

---

## 4. VIỆC CŨ CÒN TREO (không thuộc bản này)

- **Chuyến Tàu Cuối vẫn im tiếng.** `G.onSfx` được gọi ở 14 chỗ nhưng chưa ai gán hàm vào. Đang
  chờ chủ dự án quyết làm tiếng kiểu gì.

---

## 5. BẪY KHI SỬA `game.js` BẰNG SCRIPT

Tệp `game.js` nằm trong repo với đầu dòng CRLF, trong khi `core.autocrlf=true`. Sửa nó bằng
Python/script rồi `git add` bình thường là git đổi cả tệp sang LF — diff phình lên 25.000 dòng và
nuốt mất phần thay đổi thật. Thêm vào đó, nhiều agent chạy song song trên cùng cây thư mục này,
nên một diff cả tệp là một cú xung đột chắc chắn.

Cách thoát: `git -c core.autocrlf=false add games/repo2d/game.js`. Nếu git đã ghi nhầm rồi thì
phải `git rm --cached` tệp ấy trước, không thì git thấy nội dung y hệt nên không băm lại.
