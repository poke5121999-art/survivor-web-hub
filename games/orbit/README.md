# Quỹ Đạo — Mốc 1

Bản dựng thử, không phải game. Nó tồn tại để trả lời câu hỏi ở
[`RESEARCH.md`](RESEARCH.md) mục 9 — và chỉ trả lời được **bằng ngón cái**:

> Một game dây chuyền còn là game dây chuyền không, khi bỏ thao tác kéo băng
> chuyền, ép vào màn hình dọc và một joystick ở giữa?

```bash
cd games/orbit
python -m http.server 8000
# http://localhost:8000/index.html
```

Mở được cả bằng `file://` — không có tệp nào được nạp bằng `XMLHttpRequest`.

## Hai bản trong một tệp

| | Vận chuyển | Người chơi làm gì |
|---|---|---|
| **A · NỐI** | Máy nối máy bằng **hai cú chạm**. Băng thông tụt theo khoảng cách, mỗi máy có số cổng hữu hạn, hết cổng thì phải dựng nhà trung chuyển. | Đặt máy, nối, dời máy lại gần khi nghẽn |
| **B · KHO** | Máy độc lập, rút từ **kho chung**, trả về kho chung. Không có gì để nối. Mô hình Deep Town. | Đặt máy |

Hai bản dùng **chung mọi thứ** — cùng bản đồ (cùng seed `20260831`), cùng ba máy,
cùng công thức, cùng thời gian chế biến, cùng joystick, cùng 3 phút. Khác biệt
duy nhất là tầng vận chuyển. Lệch thêm bất cứ thứ gì thì so sánh hết đọc được.

Cuối phiên hiện ba con số mỗi bản: **điểm · số cú chạm · quãng đường đi**, và
**điểm trên mỗi cú chạm**. Điểm một mình không kết luận được gì.

## Điều khiển

- **Stick giữa đáy** — đi. Cố định, không nổi. Dải dưới cùng thuộc về stick; hai
  nút nằm hai bên, không có vùng tranh chấp (luật lấy từ `games/repo2d/game.js:6340`).
- **XÂY** (trái) — mở hàng chọn máy, rồi **chạm vào ô trong thế giới** để đặt.
  Chỉ đặt được trong tầm với, nên vẫn phải đi tới.
- **LÀM** (phải) — đổi đồ với máy đang đứng cạnh. Chỉ bản A cần.
- **Nối** (chỉ bản A) — chạm máy A rồi chạm máy B. Không có nút riêng.

Luật áp lên mọi thứ ở trên: việc **liên tục** nằm trên stick, việc **rời rạc** là
một cú chạm khi đứng yên. Không thao tác nào bắt vừa giữ stick vừa chạm chính xác.

## Bộ kiểm

```bash
node tools/smoke.js
```

Nó không phải trình duyệt — canvas bị đếm chứ không vẽ. Cái nó chứng minh là
phần hay gãy thật: tệp có parse không, một khung hình có vẽ mà không ném lỗi
không, cả hai bản có thật sự sản xuất trong 3 phút không, cổng hữu hạn có chặn
đúng không, và **ràng buộc khoảng cách có cắn không**.

Kết quả đo ngày 31/8/2026, một dây chuyền Khoan → Lò nung → Máy chế → Bến phóng:

| Đo | Kết quả |
|---|---|
| Nối gọn (mỗi bước 1 ô) | **33** bánh răng / 3 phút |
| Nối ẩu (mỗi bước 6 ô) | **27** bánh răng — thiệt 18% |
| Bản A nối gọn vs bản B | **33 vs 33** |

Con số cuối là thứ đáng đọc kỹ nhất, và nó có chủ ý: **bản A không cho sản lượng
miễn phí**. Bố trí tối ưu thì A bằng B; bố trí ẩu thì A phạt. Nghĩa là thứ bản A
bán cho người chơi là **quyết định**, không phải điểm số — còn bản B thì không có
gì để làm sai. Có đáng đánh đổi hay không là câu người cầm điện thoại trả lời,
không phải bảng này.

Hệ số băng thông đầu tiên (`5/(1+d/5)`) cho ra **33 vs 33 ở cả nối gọn lẫn nối
ẩu** — mọi liên kết, kể cả dài 16 ô, vẫn chở nhanh hơn thứ dây chuyền sinh ra.
Ràng buộc có mặt trên màn hình mà không cắn vào đâu. Đó đúng là cái bẫy
`RESEARCH.md` mục 9 Mốc 2 nêu, và nó bị bắt bằng bộ kiểm chứ không bằng mắt.

## Cái bản dựng thử này KHÔNG có

Không hành tinh, không tàu, không quality, không spoilage, không lưu game, không
âm thanh, không art — mọi thứ vẽ bằng code. Bốn hành tinh chỉ được bàn sau khi
Mốc 1 và Mốc 2 chơi được; bảng chuyển hoá đã sẵn ở `RESEARCH.md` mục 5.5.
