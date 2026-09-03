# Tổng hợp: ghép Slime Legion × Clash of Heroes cho mobile

> Tài liệu tổng hợp từ 6 file research cùng thư mục. Đây là file **duy nhất** chứa đề xuất thiết kế;
> 5 file kia chỉ chứa dữ kiện có nguồn.
>
> Nhãn: `[ĐO ĐƯỢC]` = có nguồn trong file research (xem file gốc để lấy link).
> `[ĐỀ XUẤT]` = quyết định thiết kế của tài liệu này, **không có nguồn**, cần playtest.

> ## ⚠ BẢN DỰNG CUỐI ĐÃ ĐI KHÁC TÀI LIỆU NÀY
>
> Mọi `[ĐỀ XUẤT]` bên dưới lấy pha thao tác lưới của **Clash of Heroes** làm lõi: hai sân đối
> đầu, đội hình dọc có **bộ đếm lượt nạp** trên đầu từng quân, tường ngang, sát thương xuyên
> tuyến. Bản đó **đã dựng xong và đã bị bỏ**.
>
> Lý do bỏ: hai sân đối đầu là hình dạng của một game **PvP**, không phải PvE — người chơi
> chỉ ra đúng một câu để thấy điều đó. Bản đang chạy là:
>
> - **một lưới 6×6 của người chơi**, đối thủ là **một con quái to** có thanh máu riêng;
> - **gộp kiểu Slime Legion**: ≥3 quân cùng loại **cùng cấp** thành hàng → một quân cấp cao hơn,
>   đổi luôn sprite; gộp dây chuyền;
> - **không có bộ đếm nạp trên đầu quân**; hết bước thì cả sân bắn, rồi quái đánh trả vào một
>   cột đã báo trước.
>
> Tài liệu này vẫn giữ nguyên vì phần `[ĐO ĐƯỢC]` của nó là dữ kiện, và vì phần `[ĐỀ XUẤT]`
> là bản ghi của một hướng đã thử và đã sai — có ích hơn là xoá đi. Thiết kế đang chạy nằm ở
> `games/slimeclash/README.md`; số cân bằng nằm ở `js/config.js`.

## 0. Bản đồ nguồn

| File | Nội dung | Số mục có nguồn | Lỗ hổng |
|---|---|---|---|
| `slime-legion-core.md` | Core loop, ải, kinh tế, monetization | 38 | Stamina, giá gold, tỉ lệ gacha, idle |
| `slime-legion-units-skills.md` | 68 unit, merge, talent | 30 | Chỉ 7/68 unit có chỉ số; chỉ Dracula đủ bảng |
| `clash-of-heroes-combat.md` | Lưới, move, formation, sát thương | 61 | Toughness core/elite, HP hero, link 3+ |
| `clash-of-heroes-units.md` | 5 phe, 38 unit, 50 artifact | 80 | HP/mana hero, giá đơn vị, bảng màu |
| `clash-of-heroes-pve.md` | Campaign, 5 loại trận, boss | 58 | Số trận/chiến dịch, vật cản lưới |
| `mobile-adaptation.md` | Chuẩn mobile, 5 game tham chiếu | 43 | Thời lượng trận PQ/MPQ |
| **`slime-legion-apk-datamine.md`** | **Đào thẳng từ APK 4.5.0** | — | Bảng chỉ số hero/quái còn mã hoá |
| **`economy-design.md`** | **Kinh tế Slime Legion + chuyển IAP sang mua-free** | — | Stamina, giá nâng cấp, tỉ lệ gacha |

Tổng: **310 mục có nguồn**, **59 chỗ ghi thẳng "KHÔNG TÌM ĐƯỢC NGUỒN"** thay vì bịa.

> **Cập nhật sau khi đào APK Slime Legion 4.5.0** — file `slime-legion-apk-datamine.md` đo trực tiếp
> từ file cấu hình của game, nên **thắng mọi nguồn wiki** ở đâu có mâu thuẫn. Tài liệu này đã được
> sửa theo. Xem mục 7 của file đó để biết danh sách chỗ research cũ bị bác bỏ.

Hai wiki chính (`slime-legion.fandom.com`, `mightandmagic.fandom.com`) chặn fetch trực tiếp (402/403)
trong suốt phiên research — số liệu từ đó lấy qua snippet WebSearch. Riêng Clash of Heroes có
`clash.acidcave.net` fetch được và **khớp gần như tuyệt đối** với wiki, nên bảng 38 unit độ tin cậy cao.
Slime Legion không có nguồn thứ hai để đối chiếu → độ tin cậy thấp hơn hẳn.

---

## 1. Phát hiện quan trọng nhất

**Slime Legion vốn đã là match-3 + thủ thành, không phải thủ thành thuần.** `[ĐO ĐƯỢC]`
Vòng lặp của nó là: pha Preparation (xếp/merge ô, có bộ đếm Turns) → pha Defense (auto-battle) →
tăng Day → lặp tới Day 10 gặp boss.

Nghĩa là yêu cầu "bỏ thủ thành, đánh PvE như Clash of Heroes" **chỉ thay đúng pha Defense**.
Pha Preparation của Slime Legion và pha thao tác lưới của Clash of Heroes là **cùng một thứ** —
xếp ô cùng loại để tạo lực lượng. Đây là ghép nối tự nhiên hơn nhiều so với dự kiến ban đầu.

Bảng ánh xạ trực tiếp:

| Slime Legion `[ĐO ĐƯỢC]` | Clash of Heroes `[ĐO ĐƯỢC]` | Kết luận |
|---|---|---|
| 3 ô cùng hàng → 1 quái cấp cao, **50% ra thêm 1 con** `[ĐO TỪ APK]` | 3 core cùng màu dọc → đội hình tấn công | Giữ cả hai, hợp nhất thành 1 luật |
| 4 ô → **50% lên thêm 1 cấp** `[ĐO TỪ APK]` | 4+ core → vẫn 1 đội hình, phần dư rơi lại | Lấy luật Slime Legion (thưởng nhiều hơn) |
| 3 quái cùng loại/cấp → evolve | elite = elite + 2 core; champion = champion + 4 core | Lấy luật CoH (rõ hơn về chi phí) |
| Bộ đếm Turns ở pha chuẩn bị | 3 move/lượt | Lấy 3 move/lượt của CoH |
| Auto-battle pha Defense | — | **BỎ** |
| — | Tường ngang, link, fusion, sát thương xuyên tuyến | **THÊM VÀO** |

---

## 2. Giữ gì / bỏ gì

### Giữ nguyên từ Slime Legion `[ĐO ĐƯỢC]`
- Roster 68 unit, hệ bậc hiếm, gacha bằng Summon Ticket.
- Hệ Talent (từ ver 1.5.0) — 8 loại × 5 cấp, mẫu lấy từ Dracula.
- Trang bị mở ở Chapter 5.
- Cấu trúc ải: **300 dòng cốt truyện** (Chapter1–50 × nhiều bậc độ khó), phần lớn **30 ngày/chương**;
  cộng ElementTrial 320, LostTemple 316, Tower 310, **PvP 140**, thử thách ngày 50 `[ĐO TỪ APK]`.
- Nhịp boss: **ngày 5 và ngày 10** (chương 10 ngày) `[ĐO TỪ APK]`.
- **Máu thành 1000, không đổi ở cả 1.744 dòng cấu hình** — độ khó chỉ đến từ hệ số máu quái `[ĐO TỪ APK]`.
- Giữ kỹ năng qua trận: `RetainSkillLimitCount` = **8** `[ĐO TỪ APK]`.
- Monetization: gói nạp **kích theo hành vi** (gói thất bại bật sau **3 lần thua**, CD 24 giờ,
  chuỗi 9 gói nối tiếp) `[ĐO TỪ APK]`; supply pack $4.99–19.99, battle pass $9.99–14.99.

### Bỏ
- Pha Defense auto-battle và toàn bộ việc đặt/nâng trụ.
- Khái niệm "wave quái tự chạy tới".

### Lấy từ Clash of Heroes `[ĐO ĐƯỢC]`
- 3 move/lượt; move = di chuyển quân ở đáy cột **hoặc** xoá 1 quân bất kỳ.
- Formation dọc (tấn công) / ngang (tường, HP = tổng HP quân tạo thành).
- Fusion (chồng cột) **+200%**; link 2 formation cùng charge còn lại **+230%**.
- Sát thương xuyên tuyến: trừ dần HP từng quân trên đường đi, dư bao nhiêu đánh thẳng hero.
- Quân đang charge phải bị trừ đúng hết mới chết; quân idle chết ngay nhưng vẫn ăn bớt power.
- 5 loại trận PvE (mục 4).
- Thang chỉ số 38 unit làm khung cân bằng (mục 5).

---

## 3. Ba xung đột thiết kế và cách giải

### 3.1 Lưới 8 cột (CoH) vs "không quá 8 cột" (chuẩn mobile)

Bản gốc **8 cột × 6 hàng mỗi bên** `[ĐO ĐƯỢC]`. Chuẩn chạm là Material ≥48dp / Apple HIG ≥44pt,
và các game lưới mobile thành công dùng 6–7 cột `[ĐO ĐƯỢC]`. 8 cột nằm ngay mép giới hạn.

**Chốt bằng số đo, không còn phải đoán:** Slime Legion dùng `BoardInitColumnCount = 6`,
`BoardInitRowCount = 6` — **lưới 6×6** `[ĐO TỪ APK]`. Tức là một game mobile dọc đang chạy thật,
cùng thể loại xếp ô, đã chọn đúng 6 cột. Không cần cân nhắc thêm.

→ **6 cột × 6 hàng mỗi bên.** Trên màn 6" dọc (~360dp ngang), 6 cột = 60dp/ô, vượt thoải mái
ngưỡng 48dp. Đánh đổi so với bản gốc CoH: mất 2 cột nghĩa là ít không gian xếp song song hơn,
đội hình 4 ô ngang của champion sẽ chiếm 4/6 cột thay vì 4/8 — champion trở nên **đắt đỏ hơn
tương đối**. Cần giảm charge time champion để bù (mục 5).

### 3.2 Hai lưới đối đầu vs màn dọc một tay

Agent research mobile đề xuất bỏ mô hình 2 lưới, chỉ để "quái ở trên, lưới thao tác ở dưới".
**Không nhận đề xuất này.** Lý do: lưới của địch không phải trang trí — phá đội hình đang charge
của địch là một nửa chiến thuật CoH. Bỏ nó là bỏ game.

→ `[ĐỀ XUẤT]` **Hai lưới xếp chồng dọc: lưới địch trên, lưới người chơi dưới.**
Đây chính là bố cục gốc của bản DS (màn trên = địch, màn dưới = người chơi) — tức bản gốc
vốn đã là bố cục dọc, chỉ là chưa ai port đúng. Lưới người chơi nằm nửa dưới màn hình = vùng
ngón cái với tới `[ĐO ĐƯỢC]`.

```
┌─────────────────┐
│  HERO ĐỊCH  ▓▓░ │  ← thanh HP
│ ┌─┬─┬─┬─┬─┬─┐   │
│ │ │ │▲│ │ │ │   │  lưới địch 6×6
│ │ │ │▲│ │█│ │   │  ▲ = đội hình đang charge
│ ├─┼─┼─┼─┼─┼─┤   │  █ = tường
│ └─┴─┴─┴─┴─┴─┘   │
│ ─ ─ ─ ─ ─ ─ ─ ─ │  ← sát thương bay dọc qua đây
│ ┌─┬─┬─┬─┬─┬─┐   │
│ │ │ │ │ │ │ │   │  lưới người chơi 6×6
│ │ │▲│ │ │ │ │   │  (nửa dưới = vùng ngón cái)
│ └─┴─┴─┴─┴─┴─┘   │
│  HERO TA ▓▓▓░   │
│  Move: ●●○      │  ← 3 move/lượt
└─────────────────┘
```

### 3.3 Nhặt–thả (CoH) vs swap 2 ô (Empires & Puzzles)

Agent mobile đề xuất đổi sang swap-2-ô cho dễ chạm. **Không nhận.** Nhặt–thả quân trong cột là
cơ chế đặc trưng của CoH; swap-2-ô biến nó thành match-3 thường.

→ `[ĐỀ XUẤT]` Giữ nhặt–thả, xử lý vấn đề chạm bằng: ô 60dp, vùng chạm nới thêm 8dp mỗi bên,
quân được nhấc lên thì hiện bóng mờ ở mọi cột hợp lệ, thả hụt trả về chỗ cũ **không tốn move**.
Bản port mobile 2013 bị chê nặng vì chạm trên iPhone (iPad thì ổn) `[ĐO ĐƯỢC]` — nguyên nhân là
bê nguyên UI stylus chứ không phải do cơ chế nhặt–thả sai.

---

## 4. Năm loại trận PvE — thay chỗ pha thủ thành

Lấy nguyên từ CoH `[ĐO ĐƯỢC]`, ánh xạ vào cấu trúc chapter của Slime Legion:

| Loại | Luật | Dùng ở đâu `[ĐỀ XUẤT]` |
|---|---|---|
| Trận thường | Đấu hero AI tới khi 1 bên hết HP | Trận 1–9 của mỗi chapter |
| **Puzzle** | Đội hình dàn sẵn, thắng trong **đúng 1 lượt** (3 move + chain) | 1 trận/chapter, thưởng gem |
| **Boss** | Boss có cơ chế riêng, chiếm nhiều ô | **Ngày 5 và ngày 10** `[ĐO TỪ APK]` |
| Mục tiêu phụ | Bảo vệ vật thể / đẩy mục tiêu vào vị trí | Sự kiện, Lost Temple |
| Địa hình | Vật cản cố định trên lưới | Slime Legion có: **537 chương đổi địa hình** theo ngày `[ĐO TỪ APK]` |

Bốn mẫu boss có nguồn, dùng làm khung cho boss Day-10 `[ĐO ĐƯỢC]`:
- **Count Carlyle** — ăn xác quân chết để tự hồi máu (phạt người chơi khi để quân chết).
- **Ludmilla** — triệu hồi Bone Dragon giữa trận (thêm mối đe doạ mới).
- **Azh-Rafir** — triệu hồi Rakshasa/Phoenix theo chu kỳ lượt.
- **Lord Bloodcrown** — chiếm gần hết chiều rộng lưới, **đếm 3 lượt trước đòn lớn**.

Mẫu Bloodcrown là mẫu nên dùng nhiều nhất: bộ đếm lượt tạo đúng cảm giác "dồn sức chặn đòn"
mà pha thủ thành cũ mang lại, nhưng bằng thao tác chủ động thay vì đặt trụ rồi ngồi xem.

**Slime Legion đã làm đúng cơ chế này và có sẵn con số:** `boss_forecast_step = 10` ở 721/1.744 dòng
cấu hình — boss được **báo trước đúng 10 bước** `[ĐO TỪ APK]`. Dùng 10 bước thay vì đoán 3 lượt.

---

## 5. Bộ số khởi điểm đề xuất

### 5.1 Khung trận

| Thông số | Giá trị | Căn cứ |
|---|---|---|
| Lưới | **6 cột × 6 hàng** mỗi bên | `[ĐO TỪ APK]` — Slime Legion dùng đúng số này |
| Move/lượt | 3 | `[ĐO ĐƯỢC]` giữ nguyên CoH |
| Số loại quân mang vào | 5 | `[ĐO ĐƯỢC]` CoH (Slime Legion mâu thuẫn 4 vs 6) |
| Charge core | 2 lượt | `[ĐO ĐƯỢC]` CoH là 2–3, chọn cận dưới |
| Charge elite | 3 lượt | `[ĐỀ XUẤT]` — CoH 4–6, rút để trận ngắn lại |
| Charge champion | 4 lượt | `[ĐỀ XUẤT]` — bù cho lưới hẹp 6 cột (mục 3.1) |
| Fusion | +200% | `[ĐO ĐƯỢC]` |
| Link 2 formation | +230% | `[ĐO ĐƯỢC]` — xem cảnh báo 6.1 |
| HP hero Lv1 → Lv10 | 60 → 200 | `[ĐỀ XUẤT]` — CoH không công bố; hiệu chỉnh theo 5.3 |
| Cấp tối đa hero | 10 | `[ĐO ĐƯỢC]` |
| Cấp tối đa đơn vị | 5 | `[ĐO ĐƯỢC]` |

### 5.2 Thang chỉ số đơn vị (khung từ 38 unit CoH, cấp 1 → cấp 5) `[ĐO ĐƯỢC]`

| Loại | Ô chiếm | HP (Toughness) | Sát thương (Power) |
|---|---|---|---|
| Core | 1 | 1–2 → 2–3 | 3–6 → 8–11 |
| Elite | 2 | 2–4 → 4–6 | 9–20 → 21–32 |
| Champion | 4 | 9–18 → 20–29 | 45–70 → 90–115 |

Đây là thang **dùng được ngay** vì đã cross-check 2 nguồn độc lập. Roster 68 slime của Slime Legion
sẽ được gán vào thang này, **không** dùng chỉ số gốc của Slime Legion (vốn chỉ có Dracula là đủ:
sát thương Lv1→Lv8 = 30→190 `[ĐO ĐƯỢC]`, thang khác hẳn và không có unit thứ hai để đối chiếu).

### 5.3 Hiệu chỉnh thời lượng trận

Mục tiêu: **2–5 phút/trận** `[ĐO ĐƯỢC]` (chuẩn mobile; trung vị phiên chơi ngành ~6 phút).

Tính thử `[ĐỀ XUẤT]`: hero Lv1 60 HP, mỗi lượt người chơi tạo được ~1,5 formation core
(3 move, mỗi formation tốn ~2 move), formation core Lv1 gây ~6 sát thương, một phần bị quân địch
chặn → ~4 lọt vào hero. → 60 / (1,5 × 4) ≈ **10 lượt**. Với ~15–20 giây/lượt = **2,5–3,5 phút**. Đạt.

Nếu playtest thấy dài hơn: **giảm HP hero trước, đừng tăng sát thương** — tăng sát thương làm
champion mất giá trị tương đối.

### 5.4 Kinh tế ngoài trận `[ĐỀ XUẤT]`

Slime Legion không công bố số Stamina, nên lấy chuẩn ngành:

| Thông số | Giá trị | Căn cứ |
|---|---|---|
| Energy/trận | 5, **cố định** | `[ĐỀ XUẤT]` — E&P dùng 3–7 luỹ tiến và **bị chê** `[ĐO ĐƯỢC]` |
| Trần energy | 30 (6 trận) | `[ĐỀ XUẤT]` |
| Tốc hồi | 1 điểm / 6 phút (đầy sau 3 giờ) | `[ĐỀ XUẤT]` — nhanh hơn E&P (1/10 phút) |
| Ải đã qua | Auto-battle + quét, **không tốn energy** | `[ĐỀ XUẤT]` |
| Trận puzzle | Không tốn energy, chơi lại vô hạn | `[ĐỀ XUẤT]` |

### 5.5 Số đo lấy thẳng từ Slime Legion — dùng luôn, khỏi đoán `[ĐO TỪ APK]`

| Thông số | Giá trị đo được | Ghi chú |
|---|---|---|
| Ngân sách bước/ngày | **10, 10, rồi 6 cố định** | 2 ngày đầu rộng tay để dạy người chơi |
| Nhịp tăng máu quái | **~1,15×/ngày** ở đoạn ổn định | Chapter 5 mở màn ~1,27× rồi hội tụ về 1,15× |
| Sát thương quái | **không tăng theo ngày** (`attack_ratio` = 1) | Độ khó = bài toán đủ DPS trong 6 bước, không phải né chết |
| Máu thành | **1000, bất biến** | Toàn bộ độ khó dồn vào hệ số máu quái |
| Boss báo trước | **10 bước** | `boss_forecast_step` |
| Trần giảm sát thương | **80%** cho hero / quái / thành | Giáp là % giảm, có trần cứng |
| Giãn cách đánh tối thiểu | **0,5 s** | Trần tốc đánh |
| Giảm tốc đánh tối đa | **90%** | Trần debuff |
| Tốc độ trận | **1,5× / 2,0× / 2,5×** | Ba nấc, mở dần |
| Hồi sinh | 30 gem, **1 lần/trận**, quảng cáo 3 lần/ngày hồi 50% HP | |
| Đổi kỹ năng trong trận | 30 gem, 3 lần/trận + 1 lần quảng cáo | Mở ở chương 2 |
| Vị trí sinh rương | cột 0–5, **hàng 2**, ưu tiên từ giữa ra biên | `RuleAddBoxPosition` |

Ba con số đáng bê nguyên: **6 bước/ngày**, **máu quái ×1,15/ngày**, **trần giảm sát thương 80%**.
Cả ba đều là thứ tự cân bằng lâu mới ra, và đều đã chạy thật trên một game mobile cùng thể loại.

---

## 6. Cảnh báo trước khi code

### 6.1 Hai nguồn mâu thuẫn về công thức link — chưa giải được
Một nguồn ghi link 2 formation = **+230%**; nguồn khác ghi bonus theo loại quân dẫn đầu
(core +15% / elite +25% / champion +50%). Không rõ hai cái cộng dồn hay cái này thay cái kia,
và link 3+ formation bằng bao nhiêu thì **không nguồn nào có**. Cả hai đều `[ĐO ĐƯỢC]`, chưa hợp nhất.
→ Phải tự chốt bằng playtest. Đừng code như thể đã biết.

### 6.2 Roster Slime Legion gần như không có chỉ số
Chỉ 7/68 unit có trang wiki đầy đủ; chỉ **Dracula** có bảng gốc trọn vẹn. APK đã lấp được
công thức giáp (trần 80%) và xác nhận có bảng khắc hệ, nhưng **chỉ số từng unit vẫn nằm trong
file mã hoá** `config/table.bytes`. → Toàn bộ chỉ số 68 slime sẽ là **số tự dựng**
theo thang 5.2, không phải số copy. Ghi rõ điều này trong data file để sau này không ai nhầm.

### 6.3 Mâu thuẫn nội bộ chưa giải
- Slime Legion: giới hạn đội hình **4 hay 6** unit — 2 nguồn lệch. Đã chọn 5 theo CoH.
- CoH: Academy có **3 elite/2 champion** hay **2 elite/3 champion** — trang tổng hợp lệch với
  danh sách đặt tên thật.
- Knight (Haven): khiên khi charge = **50%** (acidcave) hay **40%** (wiki).

### 6.4 Chưa có nguồn, phải tự thiết kế
Vật cản cố định trên lưới; HP/mana hero và chi phí từng phép; giá vàng mua đơn vị;
bảng ánh xạ đơn vị ↔ màu (nguồn chỉ xác nhận khái niệm "cùng màu", không có bảng tra cứu).

---

## 7. Việc tiếp theo

1. Dựng prototype lưới 6×6 đôi, 3 move/lượt, chỉ có core unit, chưa cân bằng — để kiểm mục 5.3.
2. Chốt công thức link bằng playtest (6.1).
3. Gán 68 slime vào thang 5.2, xuất data file.
4. Thiết kế 8–10 mẫu boss theo khung Bloodcrown/Carlyle.
5. **Giải mã `config/table.bytes` + `config/json.bytes` của APK** — rút khoá từ `libil2cpp.so`
   (hàm `EncryptDecrypt`; `global-metadata.dat` còn nguyên nên định vị được). Đây là đường duy nhất
   lấy được chỉ số gốc 68 hero, bảng skill, bảng talent, bảng khắc hệ, tỉ lệ gacha — xem mục 8 của
   `slime-legion-apk-datamine.md`.
