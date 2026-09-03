# SlimeClash

Ghép ô theo lượt trên **hai lưới 6×6 xếp chồng dọc**. Lấy tiến trình và kinh tế của
**Slime Legion** (Perfeggs, 2023), thay pha thủ thành auto-battle bằng chiến đấu lưới của
**Might & Magic: Clash of Heroes** (Capybara/Ubisoft, 2009).

Chạy được từ `file://`, không engine, không phụ thuộc mạng.

## Chơi thế nào

- **3 bước mỗi lượt.** Chạm một quân rảnh của bạn để nhấc, chạm **▼** dưới một cột để thả.
  Chạm lại quân đang cầm để bỏ nhấc — **không tốn bước**.
- **3 quân cùng màu theo CỘT** → đội hình tấn công, nạp 2–4 lượt tuỳ loại quân.
- **3 quân cùng màu theo HÀNG** → tường, máu bằng tổng máu các quân tạo ra nó.
- Đòn bay **thẳng theo cột**, trừ dần máu từng quân trên đường đi; dư bao nhiêu mới đánh
  vào hero địch.
- Hai đội hình cùng cột bắn chung → **×3**. Nhiều đội hình bắn cùng lượt → **×3.3**.
- Ghép 3+ ô cho **hộp kỹ năng**, giữ tối đa 8.
- **Thua khi hết ngân sách lượt mà chưa hạ được địch** — không chỉ khi bị giết.

## Vì sao các con số là thế

Toàn bộ số cân bằng nằm trong `js/config.js`, mỗi dòng có nhãn nguồn:

| Nhãn | Nghĩa |
|---|---|
| `[APK]` | Đo trực tiếp từ file cấu hình Slime Legion 4.5.0 |
| `[CoH]` | Từ Clash of Heroes |
| `[MOB]` | Chuẩn thiết kế mobile |
| `[TUNE]` | Tự chọn, có ghi suy dẫn ngay tại chỗ |

Những số `[APK]` đáng chú ý — **đây là số của một game đã cân bằng xong, đừng sửa**:

- **Lưới 6×6** — `BoardInitColumnCount` / `BoardInitRowCount`.
- **Ngân sách bước 10 / 10 / 6** mỗi ngày — hai ngày đầu rộng tay để dạy người chơi.
- **Máu quái ×1,15/ngày**, còn **sát thương quái không tăng** (`attack_ratio` = 1 ở mọi ngày).
  Vì thế độ khó là bài toán *đủ sát thương trong ngần ấy bước*, không phải bài toán né đòn.
- **Trần giảm sát thương 80%** cho cả ba phía (hero / quái / thành).
- **Boss báo trước đúng 10 bước** — `boss_forecast_step`, có ở 721/1.744 dòng cấu hình ải.
- **Máu thành 1000, bất biến ở cả 1.744 dòng** — họ không buff thành lấy một lần nào.
- **Trần vàng và mảnh theo chương** — `coin_max` 220 → 1.800, `hero_card_max` 25/35/45.
- **Bảng trọng số rơi hộp kỹ năng** — ghép càng nhiều ô, bảng càng tốt.
- **96 hero kèm id và slug thật**, 94 con có chân dung.

Cách lấy được và toàn bộ dẫn chứng: `_research/slime-legion-apk-datamine.md`.

## Art

94 chân dung trong `assets/units/` là **ảnh TẠM rip từ APK Slime Legion** — chỗ để vẽ đè.
Đổi art = thay PNG + sửa `assets/asset-map.js`, **không đụng code**. Chi tiết và lý do ô cờ
phải trộn màu: `ASSETS.md`.

## Chỗ KHÔNG phải số thật

`js/roster.js` có **96 hero** (id 101–196) với **tên, slug và bậc icon thật**, nhưng
**chỉ số thì không**. Bảng chỉ số gốc
nằm trong `config/table.bytes` bị mã hoá XXTEA và chưa giải được. Bốn agent research đã xác
nhận HP/sát thương/tốc đánh của các hero này **không tồn tại ở bất kỳ nguồn công khai nào** —
wiki fandom chỉ có 8 trang hero, đều nằm ngoài roster này.

Nên chỉ số được dựng theo thang 38 unit của Clash of Heroes (thang này đã cross-check hai
nguồn độc lập). Header của `data.js` ghi rõ điều đó. **Đừng ai đọc nhầm thành số của Slime Legion.**

37/96 hero chỉ có tên **suy từ slug** trong APK (ví dụ `firedragon` → "Firedragon") chứ chưa
xác nhận tên hiển thị thật; những con đó bị đánh dấu `named:false` và hiện dấu `*` trong game.

Bậc hiếm có **hai tín hiệu từ APK và chúng không trùng nhau**:
- nhóm icon `Headicon_<bậc>_<id>` — chỉ có hai giá trị, 1 và 4 (33 hero thuộc nhóm 4);
- cấu hình gói nạp — 11 hero được xếp riêng (chuỗi 3 gói, cooldown 720 phút).

Chọn: 11 hero kia làm **champion**, nhóm icon 4 còn lại làm **elite**, phần còn lại **core**.
Đây là quyết định thiết kế trên hai nguồn đo lệch nhau, không phải số đo — và cả hai đều đo
**độ hiếm thương mại**, không phải sức mạnh gameplay. Tier list cộng đồng không xác nhận hai
thứ đó trùng nhau.

## IAP mua-free

Giữ nguyên bộ máy gói nạp kích-theo-hành-vi của bản gốc (gói tân thủ, gói sau **3 lần thua**,
gói khi **thiếu vàng**), nhưng mua đều **miễn phí**. Giá USD vẫn hiện, gạch ngang, để người
chơi so được độ lớn giữa các gói.

Vấn đề khi bỏ giá: trong bản gốc mỗi gói bị chặn bởi **giá** *và* **cooldown**. Bỏ giá thì chỉ
còn cooldown, mà cooldown gốc cho phép **~276 lượt mở gói/ngày** — trong khi đường cong độ khó
chỉ ×1,15/ngày. Không chặn thì 300 chương sụp trong một buổi chiều.

Ba lớp chặn thay thế:

1. **Thưởng đi qua đúng trần chương của bản gốc.** Hết trần thì gói vẫn mở nhưng phần vàng/mảnh
   cắt về 0 và báo rõ. Không có đường vòng.
2. **Phiếu Ưu Đãi 8/ngày** — ngân sách mở gói chung, thay chỗ của tiền.
3. **Trần kim cương 180/ngày** — kim cương là thứ duy nhất bản gốc không chặn theo chương,
   vì nó là món để bán.

Hai chỗ cố ý làm khác bản gốc: **bỏ hẳn gói hồi sinh** (bản gốc bán đúng lúc người chơi cay)
và **mở vĩnh viễn nút tua nhanh**. Gói "thua 3 lần" thì giữ và cho miễn phí hẳn — nó vốn là
cơ chế chống ức chế tốt. Lý lẽ đầy đủ: `_research/economy-design.md`.

## Kiểm

```
node games/slimeclash/_test/sim.js
```

Bot đấu bot, kiểm bất biến bàn cờ (không quân lơ lửng, không quân máu ≤ 0 còn trên bàn,
không đội hình ma), đo nhịp trận và kiểm các trần kinh tế có thủng không.

Kết quả hiện tại: trận **7–10 lượt ≈ 2,0–2,8 phút** (mục tiêu mobile là 2–5 phút), bot thắng
52–93% tuỳ ngày. Cân bằng cho **người thật thì chưa playtest** — bot tham lam một bước, không
biết dùng fusion/link có chủ đích, nên con số này chỉ là chặn dưới.

## Còn thiếu

- Chỉ số gốc từng hero, giá nâng cấp, tỉ lệ gacha, stamina — nằm trong file mã hoá XXTEA.
  Đã vét literal C#, metadata IL2CPP, mọi section của `libil2cpp.so`, 12 thư viện `.so` khác
  và 9 file DEX; chưa ra khoá. Danh sách đã tìm ở đâu: `_research/slime-legion-apk-datamine.md`
  mục 8.2 — để lần sau khỏi mò lại.
- Chưa có hệ Talent, trang bị, Lord, PvP (bản gốc có 140 ải PvP).
- Chưa playtest với người thật.

## Cấu trúc

```
index.html            vỏ + thứ tự nạp script
css/style.css         bố cục dọc, lưới địch trên / lưới ta dưới
assets/units/*.png    94 chân dung (art TẠM, rip từ APK)
assets/asset-map.js   khoá art -> đường dẫn; sửa ở đây khi vẽ đè
js/atlas.js           tra art theo khoá, thiếu thì rơi về ô màu trơn
js/config.js          TOÀN BỘ số cân bằng, mỗi dòng có nhãn nguồn
js/roster.js          96 hero, SINH TỰ ĐỘNG từ APK — đừng sửa tay
js/data.js            chỉ số dựng trên roster
js/engine.js          bàn cờ, đội hình, sát thương xuyên tuyến, vòng lượt
js/ai.js              AI địch (tham lam 1 bước — cố ý không mạnh)
js/economy.js         tiền tệ, trần chương, gói mua-free
js/save.js            localStorage + cầu HubSave của hub
js/ui.js              render + thao tác chạm
js/main.js            nối vòng lặp nhà → trận → thưởng
_test/sim.js          test headless
_research/            12 tài liệu nguồn
ASSETS.md             art: nguồn, luật đổi, vì sao ô cờ trộn màu
```
