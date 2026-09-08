# Bộ khung giao diện tủ đồ

Nguồn: **Free Inventory** của **ElvGames** (https://twitter.com/ElvGames).
Giấy phép nằm ngay cạnh, ở `LICENSE-elvgames.txt`: được dùng cho dự án cá nhân lẫn
thương mại, được sửa, **không** được bán lại bộ hình và **không** được nhận là của mình.
Tên tệp đã đổi cho ngắn, nội dung ảnh giữ nguyên từng điểm ảnh.

| Tệp | Gốc | Cỡ | Dùng ở đâu |
|---|---|---|---|
| `inv-panel.png` | `Inventory_background.png` | 20×20 | khung ván gỗ bọc cả bảng tủ, và mặt nút "Đóng tủ" |
| `inv-slot.png` | `Inventory_Slot.png` | 20×20 | một ô đồ — ba ô trên tay lẫn mọi ô trong ba lô |
| `inv-select.png` | `Inventory_select.png` | 20×20 | viền ô đang cầm, và viền ô đang được nhắm khi kéo |
| `inv-bar.png` | `Inventory_Bar.png` | 203×32 | **chưa dùng** — thanh 9 ô cỡ cố định, giữ lại phòng khi làm thanh đồ nhanh |

## Cách ba tấm 20×20 được kéo giãn

Cả ba đều là hình **9 mảnh** (`border-image`), không phải ảnh nền: bốn góc giữ nguyên,
bốn cạnh kéo dài, ruột lặp lại. Nhờ vậy một ô 20×20 bọc được một cái bảng rộng 460 px
mà góc không bị méo.

Mấy con số cắt (`border-image-slice`) đọc thẳng ra từ điểm ảnh, đừng đoán lại:

- `inv-panel.png` — **cắt 5**. Bốn hàng ngoài là khung nâu (`#332018` / `#4c3024` / `#99603f`
  / `#b2714a`), hàng thứ năm là vành vàng đậm `#e5b75b`, ruột là `#fed37f`.
- `inv-slot.png` — **cắt 2**. Hàng 0 và hàng 19 là mép, hàng 1 vàng đậm `#e5b75b` (bóng trên),
  hàng 18 vàng nhạt `#ffe5b2` (sáng dưới) — ánh sáng của bộ này hắt từ **dưới trái** lên.
- `inv-select.png` — **cắt 2, KHÔNG `fill`**. Ruột trong suốt vì nó là cái viền chồng lên
  một ô đã vẽ sẵn. Bốn góc là hai điểm vàng chói `#ffff00` / `#ffd400` — đó là thứ làm
  cái viền đọc ra là "đang chọn" chứ không phải "ô này đậm hơn tí".

Hệ số phóng là **3** ở khắp nơi (`--o-vien: 6px` = 2×3, `--khung-vien: 15px` = 5×3), và mọi
chỗ dùng đều kèm `image-rendering: pixelated`. Đổi hệ số thì đổi cả hai con số cùng lúc,
nếu không góc sẽ nhoè ở đúng một chỗ mà cạnh thì không.

Luật CSS ở `../../tu-do.css`.
