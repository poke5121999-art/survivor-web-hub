# Economy: copy Slime Legion, IAP thành mua-free

> Nhãn `[ĐO TỪ APK]` = số thật lấy từ file cấu hình Slime Legion 4.5.0 (xem
> `slime-legion-apk-datamine.md`). `[ĐỀ XUẤT]` = thiết kế của tài liệu này.
>
> Mục tiêu: giữ **nguyên** bộ máy kinh tế của Slime Legion, chỉ thay tầng thanh toán —
> mọi gói nạp vẫn hiện đúng như bản gốc (tên gói, nội dung, giá hiển thị) nhưng bấm mua
> là **nhận luôn, không tốn tiền thật**.

---

## 1. Vấn đề trung tâm — đọc mục này trước

Trong Slime Legion, tiền **không mua sức mạnh trực tiếp**. Tiền mua **thời gian**.
Mọi gói nạp đều bị chặn bởi hai lớp cùng lúc: **giá** và **cooldown**. Bỏ giá đi thì
chỉ còn cooldown, và cooldown một mình không đủ giữ nhịp:

| Gói `[ĐO TỪ APK]` | Cooldown | Nếu miễn phí, lấy được bao nhiêu/ngày |
|---|---|---|
| Gói thiếu vàng (`金币不足礼包`) | 65 phút | ~22 lần |
| Gói theo hero (46 hero khác nhau) | 240 phút | 6 lần × 46 hero = **276 lần** |
| Gói hero cao cấp (11 hero) | 720 phút | 2 lần × 11 = 22 lần |
| Gói thất bại | 1.440 phút | 1 lần |
| Gói hồi sinh | 5 phút | ~200 lần |

Cộng lại: một người chơi rảnh có thể quét **vài trăm gói/ngày**. Đường cong độ khó của
game là **máu quái ×1,15/ngày** `[ĐO TỪ APK]` — tức sức mạnh người chơi cần tăng ~15%/ngày.
Vài trăm gói/ngày sẽ vượt đường cong đó trong vài giờ, và **toàn bộ 300 chương cốt truyện
(9.300 ngày chơi) sụp trong một buổi chiều.**

**Cái cứu ta là Slime Legion đã có sẵn trần cứng theo chương** `[ĐO TỪ APK]`:

| Trần | Giá trị | Ý nghĩa |
|---|---|---|
| `coin_max` | 220 (ch1) → 1.800 (từ ch10 trở đi) | Trần **vàng** nhận được trong 1 chương |
| `hero_card_max` | 25 → 35 → 45 | Trần **mảnh hero** nhận trong 1 chương |
| `item_per_day` | `5:10` | 10 vật phẩm id 5 mỗi ngày |

→ **Nguyên tắc số 1 của thiết kế này:** phần thưởng từ gói miễn phí **đi qua đúng các trần
đó**, không đi vòng. Vàng và mảnh hero từ gói vẫn tính vào `coin_max` / `hero_card_max` của
chương hiện tại. Làm vậy thì dù mở bao nhiêu gói, thu nhập vẫn bị chặn ở đúng mức bản gốc,
và đường cong ×1,15/ngày còn nguyên giá trị. `[ĐỀ XUẤT]`

Chỉ **kim cương** là không có trần theo chương trong bản gốc (vì nó là thứ để bán) — nên
kim cương cần một trần riêng, xem mục 4.

---

## 2. Tiền tệ và vật phẩm `[ĐO TỪ APK]`

Id lấy từ cột `items` của `ChapterBoxConfig` (dạng `id:sốLượng`):

| Id | Là gì | Căn cứ |
|---|---|---|
| `0` | **Vàng** | Xuất hiện 497 lần, giá trị 200/300/400/500 — khớp `coin_max` |
| `1` | **Kim cương** | 250 lần, giá trị 10/15/20/30 — khớp chi phí hồi sinh 30 |
| `5` | Vật phẩm thường ngày | `item_per_day = 5:10` |
| `81` | Vật phẩm mốc chương | 199 lần, luôn đi kèm mốc ngày cuối chương |
| `82` | Vật phẩm mốc cao | 50 lần |
| `101–106`, `123` | Hero (mảnh/thẻ) | Thưởng ngày 10 chương 1 = `101:1\|102:1\|104:1\|106:1` |

Ba tiền tệ chính: **Vàng** (nâng cấp), **Kim cương** (hồi sinh / đổi kỹ năng / gacha),
**Mảnh hero** (mở & lên sao hero).

## 3. Nguồn thu — lịch thưởng thật `[ĐO TỪ APK]`

`ChapterBoxConfig` (747 dòng) — mốc thưởng theo `chapter_id` + `day`. Mốc rơi vào
**ngày 5/10/15/20/30/40**, tức **trùng đúng ngày boss** (boss ở ngày 5 và 10, hoặc 10 và 20).

| Chương | Mốc | Thưởng |
|---|---|---|
| 1 | ngày 5 | 200 vàng |
| 1 | ngày 10 | 10 kim cương + hero 101, 102, 104, 106 |
| 2 | ngày 10 | 15 kim cương + vật phẩm 81 |
| 3 | ngày 10 / 20 | 300 vàng / 20 kim cương + 81 |
| 4 | ngày 10 / 15 / 20 | 400 vàng / 500 vàng + 3 thẻ / 30 kim cương + 81 |
| 5 | ngày 10 / 15 / 20 | 500 vàng / 500 vàng + 3 thẻ / 30 kim cương + 81 |

Quy luật: **vàng ở mốc giữa, kim cương + vật phẩm hiếm ở mốc cuối chương.** Kim cương mỗi
chương chỉ **10–30** — rất ít so với chi phí hồi sinh 30/lần. Đó là chỗ bản gốc ép nạp.

Thu nhập trong trận: `total_exp` 100→550 tăng dần theo ngày, `card_count` 1 mảnh/ngày `[ĐO TỪ APK]`.

## 4. Chỗ tiêu (sink) `[ĐO TỪ APK]`

| Sink | Giá | Giới hạn |
|---|---|---|
| Hồi sinh giữa trận | **30 kim cương** | 1 lần/trận |
| Đổi bộ kỹ năng trong trận | **30 kim cương** | 3 lần/trận |
| Hồi sinh bằng quảng cáo | 0 | 3 lần/ngày, hồi 50% HP |
| Nâng cấp hero / talent / trang bị | Vàng | Trần `coin_max`/chương |

Chi tối đa mỗi trận = 30 + 3×30 = **120 kim cương**. Thu mỗi chương = 10–30 kim cương.
→ Bản gốc cố ý để **thâm hụt kim cương gấp ~4–12 lần**. Đó là động cơ nạp.

**Khi IAP thành free, thâm hụt này biến mất — và đó là thứ phải thay bằng trần ngày.** `[ĐỀ XUẤT]`

## 5. Bộ máy gói nạp — `GiftTriggerConfig` 119 dòng `[ĐO TỪ APK]`

Gói **không bày sẵn trong shop**. Chúng được **kích theo hành vi người chơi**:

| `trigger_type` | Số dòng | Điều kiện kích | CD | Chuỗi gói |
|---|---|---|---|---|
| 1 | 6 | Tân thủ / qua chương mốc (ch5, ch10) | vĩnh viễn hoặc 0 | 1–4 |
| 2 | 1 | **Thua 3 lần liên tiếp** | 1.440 phút (24 h) | **9 gói** |
| 3 | 1 | Vừa chết (màn hình hồi sinh) | 5 phút | 1 |
| 4 | 44 | Nhận/dùng một hero cụ thể | 240 / 720 phút | 6 hoặc 3 |
| 5 | 1 | **Đang thiếu vàng** | 65 phút | 5 |
| 6 | 15 | Hero nhóm thường | 240 phút | 4 |
| 7 | 31 | Hero chủ lực (kênh thứ hai) | 240 phút | 6 |
| 8 | 20 | (chưa xác định) | — | — |

`gift_chain` là **thang giá tăng dần**: thua càng nhiều thì leo càng sâu vào chuỗi 9 gói.
Đây là thiết kế bán hàng, không phải thiết kế chơi.

---

## 6. Chuyển đổi sang "mua free" `[ĐỀ XUẤT]`

### 6.1 Ba luật xương sống

1. **Thưởng từ gói đi qua trần chương.** Vàng và mảnh hero từ gói vẫn trừ vào `coin_max` /
   `hero_card_max`. Hết trần thì gói vẫn mở được nhưng phần vàng/mảnh bị cắt về 0 và báo rõ
   *"đã chạm trần chương này"*. Không có đường vòng.
2. **Một ngân sách mở gói chung cho cả ngày.** Thêm một tài nguyên duy nhất — *Phiếu Ưu Đãi* —
   thay cho tiền. Mỗi lần mở gói tốn 1 phiếu. **8 phiếu/ngày**, hồi đầy lúc 0h.
   Cooldown gốc của từng gói **giữ nguyên** và chạy song song.
3. **Chuỗi gói đổi từ thang giá sang thang tiến trình.** `gift_chain` 9 bậc không còn mở khoá
   bằng việc mua bậc trước, mà bằng **số chương đã qua**: bậc *k* mở khi đã qua ⌈k × 300/9⌉ chương.
   Giữ được cảm giác "gói xịn dần" mà không có thanh toán.

### 6.2 Bảng chuyển đổi từng loại gói

| Gói gốc | Bản mua-free | Lý do |
|---|---|---|
| Tân thủ (type 1) | Giữ nguyên, **miễn phí, không tốn phiếu** | Là quà onboarding, vốn đã 1 lần |
| Qua chương mốc (type 1) | Giữ nguyên, không tốn phiếu | Thưởng tiến trình, đã tự giới hạn |
| **Thua 3 lần** (type 2) | Giữ trigger + CD 24 h, **không tốn phiếu**, chuỗi 9 bậc theo tiến trình | Đây là cơ chế **chống ức chế** rất tốt — miễn phí lại càng đúng |
| Hồi sinh (type 3) | **Bỏ hẳn gói**, thay bằng: hồi sinh miễn phí 1 lần/trận | Bản gốc bán đúng lúc người chơi cay — bỏ |
| **Thiếu vàng** (type 5) | Giữ trigger, **tối đa 2 lần/ngày**, tốn 1 phiếu | CD 65 phút mà miễn phí thì thành 22 lần/ngày |
| Hero thường (type 6) | 1 phiếu, CD 240 phút, **tối đa 3 gói hero/ngày tổng** | 46 hero × 6 lần = 276 lần/ngày nếu không chặn |
| Hero chủ lực (type 4+7) | Như trên, chung hạn mức 3 gói hero/ngày | |
| Hero cao cấp (type 4, CD 720) | Như trên nhưng **1 gói/ngày** | Giữ cảm giác hiếm — 11 hero xịn nhất |

### 6.3 Quảng cáo → nhận thẳng

Game trên hub không có quảng cáo thật. Giữ **nguyên số lần**, bỏ phần xem quảng cáo `[ĐỀ XUẤT]`:

| Slot gốc `[ĐO TỪ APK]` | Bản mua-free |
|---|---|
| Rương thắng trận: 3 lần/ngày, mở ở chương 2 | Nhận thẳng, 3 lần/ngày, mở ở chương 2 |
| Tăng thu nhập trước ải ×1,2: 3 lần/ngày | Nhận thẳng, 3 lần/ngày |
| Tua 3× trong trận: 1 lần/ngày | **Mở vĩnh viễn** — tua nhanh là tiện ích, không nên tính lần |
| Hồi sinh bằng quảng cáo: 3 lần/ngày, hồi 50% HP | 3 lần/ngày, hồi 50% HP |
| Interstitial CD 30 s / 120 s | Bỏ hẳn |

### 6.4 Shop và giá hiển thị

Giữ nguyên bố cục shop và **giá hiển thị** của bản gốc (supply pack $4.99–19.99, battle pass
$9.99–14.99, growth fund $6.99) `[ĐO ĐƯỢC]`, nhưng gạch ngang giá và ghi **FREE**. Bấm mua =
nhận ngay, trừ 1 phiếu. Lý do giữ giá gạch: nó là mốc để người chơi cảm được "gói này to cỡ nào",
và là thứ phân biệt gói lớn/nhỏ khi tất cả đều free. `[ĐỀ XUẤT]`

Battle pass: mở sẵn cả hai nhánh (free + premium), tiến trình vẫn phải cày. `[ĐỀ XUẤT]`

## 7. Trần kim cương — con số cần chốt `[ĐỀ XUẤT]`

Kim cương là tài nguyên duy nhất bản gốc **không** chặn theo chương, vì nó là thứ để bán.
Khi free thì phải tự đặt trần.

Tính từ số đo: chi tối đa **120 kim cương/trận** (hồi sinh 30 + 3 lần đổi kỹ năng 30).
Một phiên chơi mobile hợp lý là **6–10 trận/ngày**.

→ Đề xuất **trần thu 180 kim cương/ngày** (gồm mọi nguồn: mốc chương, gói, rương).
Ở mức đó người chơi đủ hồi sinh ~1–2 trận khó và đổi kỹ năng vài lần, nhưng **không đủ để
brute-force mọi trận** — vẫn phải chơi cho tử tế. Nếu playtest thấy nghẹt, nâng lên 240
trước khi nới trần vàng.

## 8. Bảng ngân sách ngày — bản chốt `[ĐỀ XUẤT]`

| Nguồn | Mức/ngày | Ghi chú |
|---|---|---|
| Phiếu Ưu Đãi | **8** | Ngân sách mở gói chung |
| Gói hero | tối đa **3** (cao cấp tính riêng, **1**) | Trừ vào phiếu |
| Gói thiếu vàng | tối đa **2** | Trừ vào phiếu |
| Gói thua-3-lần | 1 | **Không** trừ phiếu |
| Rương thắng trận | 3 | Không trừ phiếu |
| Tăng thu nhập trước ải | 3 | Không trừ phiếu |
| Hồi sinh miễn phí | 1/trận + 3/ngày | |
| Trần kim cương | **180** | Mọi nguồn cộng lại |
| Trần vàng | **theo `coin_max` chương** (220 → 1.800) | Giữ nguyên số đo |
| Trần mảnh hero | **theo `hero_card_max`** (25/35/45) | Giữ nguyên số đo |

## 9. Cách kiểm thiết kế này có đúng không

Chỉ có một phép thử, và nó dựa trên số đo chứ không dựa trên cảm tính:

> Sức mạnh đội hình của người chơi phải tăng **≈1,15× mỗi ngày trong game**, khớp với
> `hp_ratio` của quái `[ĐO TỪ APK]`.

Cách đo: dựng một script mô phỏng người chơi tiêu hết ngân sách ngày ở mục 8, cộng dồn
vàng/mảnh/kim cương theo trần chương, quy ra chỉ số đội hình, rồi vẽ đường tăng trưởng.
Nếu đường đó dốc hơn 1,15×/ngày → giảm phiếu trước (từ 8 xuống 6), **đừng động vào trần
vàng** vì trần vàng là số đo thật của một game đã cân bằng xong.

Nếu thoải hơn 1,15× → nới trần kim cương trước, vì kim cương chỉ mua *cơ hội làm lại*
chứ không mua chỉ số.

## 10. Chỗ còn thiếu số

- **Stamina/Energy**: Slime Legion có tồn tại (`Stamina` xác nhận có) nhưng **trần, tốc hồi và
  chi phí mỗi lượt không nằm trong phần config đọc được** — đang mã hoá. Dùng đề xuất ở
  `00-tong-hop-thiet-ke.md` mục 5.4 (5/trận, trần 30, hồi 1/6 phút) cho tới khi giải mã được.
- **Giá gold nâng cấp hero/talent theo cấp**: nằm trong `config/table.bytes` (mã hoá).
- **Tỉ lệ gacha triệu hồi**: nằm trong `config/table.bytes` (mã hoá).
- Nội dung cụ thể từng `gift_chain` (mỗi bậc cho gì): nằm trong bảng gói, chưa đọc được.

→ Ba con số trên là thứ **duy nhất** còn chặn việc dựng economy đúng 1:1. Mọi thứ khác trong
tài liệu này đã có số thật.
