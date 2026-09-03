# SĂN RỒNG — CHUYỂN SANG VÒNG LẶP SURVIVOR-LIKE

Tài liệu này ghi lại đợt đổi thứ ba: bỏ lớp nhiệm vụ/cốt truyện/nguyên liệu, thu
kinh tế về hai đồng tiền, dựng ba banner gacha, thêm lớp Tiến Hoá theo tài khoản,
và — quan trọng nhất — thêm **bốc cường hoá khi lên cấp trong ải**, thứ mà thiếu
nó thì game không phải một survivor-like.

Đọc kèm, theo thứ tự thời gian:
`RESEARCH.md` (Dragon Project bản gốc) → `REMAKE.md` (bản dựng lại đầu) →
`SHOOTER.md` (cận chiến → bắn) → **tài liệu này**.
Không tài liệu nào thay tài liệu nào; mỗi cái ghi cái nó đổi và vì sao.

Bốn báo cáo nghiên cứu nguồn nằm ở `_research/`:
`survivorio.md` · `soulknight.md` · `gungeon.md` · `sephira-genre.md`.
Mọi con số trong tài liệu này dẫn về một trong bốn file đó, hoặc được ghi rõ là
**[TÁI DỰNG]**.

---

## 0. Một ghi chú về chữ "Sephira"

Đề bài nêu bốn game tham chiếu: survivor.io, Soul Knight, Enter the Gungeon, và
**"sephira"**. Ba cái đầu tra được ngay. Cái thứ tư thì không có game nào tên
đúng như vậy.

Ứng viên khớp gần nhất là **Sephiria** (Team Horay — studio từng làm *Dungreed*),
một action-roguelite pixel nhìn từ trên xuống, Early Access 4/2025 trên Steam
([Sephiria trên Steam](https://store.steampowered.com/app/2668530/Sephiria/)).
Nhưng nó lệch ở đúng hai điểm quan trọng nhất với việc đang làm: **không có bản
mobile** và **không có hệ gacha/banner nào** (bán đứt một lần, không IAP). Ngoài
ra rất nhiều trang tự xưng "wiki Sephiria" xuất hiện khi tìm kiếm có dấu hiệu rõ
của content-farm sinh tự động, nên chúng bị loại khỏi nguồn.

**Nên tài liệu này KHÔNG lấy gì từ "Sephira".** Chỗ nó lẽ ra đứng được thay bằng
Archero, Vampire Survivors và Genshin — ba game có tài liệu công khai kiểm chứng
được cho đúng ba thứ cần: draft trong lượt chơi, luật ghép tiến hoá vũ khí, và
cấu trúc banner. Chi tiết ở `_research/sephira-genre.md`.

Nếu "Sephira" là một game khác, nói lại thì tôi tra tiếp.

---

## 1. Cái thiếu lớn nhất: KHÔNG CÓ DRAFT

Trước đợt này, một lượt chơi Săn Rồng diễn ra như sau: vào ải, dọn quái, hạ trùm,
ra. Không có một quyết định nào bên trong lượt chơi đó. Mọi thứ quyết định sức
mạnh — cấp trang bị, hệ, đội hình — đều đã chốt xong **trước khi bấm vào ải**.

Đó là điểm khác biệt giữa một game hành động có màn chơi và một survivor-like.
Vòng lặp thật của cả thể loại là:

```
giết quái → lên cấp NGAY TRONG ẢI → BỐC MỘT TRONG BA → build lượt này khác lượt trước
```

Vampire Survivors cho bốc mỗi lần lên cấp trong một lượt 30 phút; Archero cho
chọn 1 trong 3 kỹ năng sau mỗi phòng; Survivor.io ghép vũ khí với trang bị bị
động ngay giữa trận để tiến hoá kỹ năng
(`_research/sephira-genre.md` phần B, `_research/survivorio.md` §6).

Không có bước bốc bài thì mọi lượt chơi giống hệt nhau, và thứ duy nhất còn thay
đổi được là bảng chỉ số ở nhà. Đây là chỗ sửa quan trọng nhất của cả đợt.

### 1.1 Bộ bài — 15 lá, ba luật

| # | Lá | Trần | Hiệu ứng |
|---|-----|------|----------|
| 1 | Sát Khí | 5 | +12% sát thương mọi nguồn |
| 2 | Tay Nhanh | 5 | +10% tốc bắn |
| 3 | Sức Bền | 4 | +15% máu tối đa, **và hồi lại đúng phần vừa cộng** |
| 4 | Chân Nhanh | 4 | +9% tốc chạy |
| 5 | Điểm Huyệt | 4 | +8% chí mạng |
| 6 | Đạn Phụ | 3 | +1 viên/phát, **mỗi viên −12%** |
| 7 | Xuyên Thấu | 2 | đạn xuyên thêm một con |
| 8 | Hút Máu | 3 | hồi 2,5% sát thương gây ra |
| 9 | Định Thần | 3 | −12% hồi chiêu kỹ năng |
| 10 | Da Dày | 4 | −9% sát thương phải chịu |
| 11 | Nam Châm | 2 | +70% tầm hút rương |
| 12 | Hồi Phục | 3 | +1,2% máu tối đa mỗi giây |
| 13 | Phản Xạ | 2 | −25% hồi chiêu né |
| 14 | Nộ Khí | 2 | dưới 40% máu thì +30% sát thương |
| 15 | Dây Chuyền | 2 | quái chết thì nổ một vòng nhỏ |

**Ba luật đặt bài, và mỗi luật chữa một cách hỏng cụ thể:**

1. **Không lá nào chỉ là "+x% của một lá khác."** Mỗi lá đổi một động từ hoặc một
   trục khác nhau. Hai lá cùng cộng sát thương theo hai đường khác nhau vẫn là
   một lá bị nhân đôi.

2. **Lá nào cũng có trần chồng.** Không trần thì mọi lượt chơi hội tụ về việc dồn
   hết vào lá mạnh nhất, và bộ mười lăm lá chỉ còn một lá.

3. **Lá đã đầy trần thì không hiện ra nữa.** Bốc phải ba lá dùng được là một lượt
   bốc bị ăn cắp, và người chơi không có cách nào phân biệt "xui" với "game
   hỏng". Có phép kiểm khoá lại đúng chuyện này: mở màn bốc 200 lần với một lá đã
   đầy trần, lá đó không được xuất hiện lần nào.

**Đạn Phụ chịu thuế** −12% mỗi viên. Đây là luật của Archero: mũi bắn về hướng
MỚI thì miễn phí (Side/Diagonal/Rear Arrow đều 100%), mũi bắn CÙNG hướng thì bị
thuế (Front Arrow −25%)
([Front Arrow](https://wiki-archero.luhcaran.fr/en/wiki/skill/Front_Arrow/)).
Không có thuế thì lá này mạnh gấp đôi mọi lá khác và ba lượt bốc đầu tiên đều chỉ
có đúng một đáp án.

**Nộ Khí là lá duy nhất thưởng cho việc KHÔNG an toàn.** Nó tồn tại để bộ bài có
ít nhất một quyết định không phải "cộng thêm cho cái đang tốt".

### 1.2 Nhịp bốc bài

```
EXP mỗi con:  quái thường 1 · tinh nhuệ 3 · con vàng 6
EXP cần cấp n:  2 + n
```
Một ải dọn 6–20 con nên ra **3–5 lần bốc mỗi lượt** — đủ để hai lượt chơi khác
nhau, không đủ để một lượt biến thành một build hoàn chỉnh.

### 1.3 Cài đặt: đi qua `p.buffs`, không dựng kho thứ hai

Buff bốc được đẩy thẳng vào `p.buffs` với `until: Infinity`.

Đó không phải là tiết kiệm dòng code. `p.buffs` đã là **chỗ duy nhất** mà bốn hàm
`playerDamage` · `atkSpeed` · `moveStep` · `hurtPlayer` cùng đọc. Đi qua nó thì
mười lăm lá bài lập tức chạy được ở cả bốn chỗ mà không sửa chỗ nào; dựng thêm
một kho buff riêng là dựng thêm bốn chỗ để quên đọc.

Và vì `p.buffs` chết cùng đối tượng `Battle`, **"reset sau mỗi ải" xảy ra tự
nhiên** — không cần ai đi dọn, nên không có chỗ nào để quên dọn.

---

## 2. Kinh tế: từ năm đồng tiền xuống hai

### 2.1 Bỏ những gì

| Bỏ | Vì sao |
|----|--------|
| 40 nguyên liệu + 6 tộc rơi đồ + bảng tỉ lệ rơi | Cả một trò chơi phụ về việc nhặt Jelly Dew để chế đồ, mà trò đó không còn ở đây |
| 38 chặng cốt truyện | Một danh sách việc vặt đọc một lần rồi thôi |
| Nhiệm vụ ngày + tuần | Chúng hẹn "quay lại vào ngày mai" trong một game chạy bằng localStorage |
| Vé · Medal · Pikke | Ba đồng tiền, ba bảng giá, ba quầy — không đồng nào làm được việc gì gold hoặc gem không làm được |
| Bốn quầy tiệm + quầy nạp giả | Hệ quả của việc bỏ ba đồng tiền trên |
| Điểm khai thác nhả nguyên liệu | Giờ nhả gold |

Có phép kiểm khoá lại việc chúng **thật sự biến mất** khỏi `DP`, không chỉ ngừng
được gọi. Để lại một bảng mồ côi không ai đọc là để lại một lời nói dối trong dữ
liệu, và lần sau sẽ có người tin nó.

### 2.2 Hai đồng tiền

```
⬤ GOLD   mọi thứ NÂNG CẤP: cấp trang bị, đột phá, tinh luyện, Tiến Hoá, mua bình
◈ GEM    CHỈ để quay
◆ LÕI RỒNG   không phải tiền: không mua được gì, chỉ có từ quay trúng NGƯỜI đã có
```

**Không có đường đổi gem sang gold hay ngược lại.** Hai đồng tiền mà đổi được cho
nhau thì thật ra chỉ có một. (Survivor.io có bán gold bằng gem ở tỉ giá ~400
gold/gem — `_research/survivorio.md` §3 — nhưng nó có cả một tầng IAP đứng sau để
cân; ở đây không có tầng đó, và một chiều đổi không đối ứng là một máy in tiền.)

### 2.3 Vì sao phá ải lại ra GEM — cố ý lệch Survivor.io

Đây là chỗ lệch bản gốc lớn nhất trong tài liệu này, nên phải ghi rõ.

**Survivor.io cố ý tách gem khỏi vòng cày ải chính.** Ải chính chỉ ra Gold + XP +
trang bị thô (phần lớn qua hệ AFK "Patrol", công thức cộng đồng: Gold/giờ ≈
3.000 + 300 × chapter đã qua). Gem đến từ một lớp mode phụ có trần theo
ngày/tuần/mùa — nhiệm vụ ngày ~80, nhiệm vụ tuần 450, Trials 200–600, Ender's
Echo 3.000–5.000/mùa — ước tính **~300 gem/ngày** cho người chơi miễn phí
([mturbogamer — Best & Fastest Way to Get Gems](https://mturbogamer.com/2022/12/survivor-io-best-fastest-way-to-get-gems/),
tổng hợp ở `_research/survivorio.md` §2.4).

Cách đó **đúng cho một game có máy chủ và có mốc reset mỗi ngày.** Bản này chạy
hoàn toàn trong `localStorage`: không có ngày mai, không có mùa, không có event.
Chép nguyên cấu trúc đó vào đây thì một người ngồi chơi liền hai tiếng nhận được
đúng **0 gem**, và cả hệ gacha thành thứ không bao giờ chạm tới được.

Nên gem ở đây đi theo **TIẾN ĐỘ**, không theo lịch.

### 2.4 Bảng thưởng sau ải

| Nguồn | Trả lời câu hỏi | Số |
|-------|-----------------|-----|
| Nền — phá lần đầu | "lần đầu tiên" | `60 + 6i` gem (ải 1 = 60, ải 38 = 282) |
| Nền — cày lại | "cày lại" | `8 + 0,62i` gem (ải 38 = 31) |
| Ba điều kiện | "phá ĐẸP" | +4 gem mỗi điều kiện |
| Đủ cả ba | | +8 gem nữa |
| Gold ải | "đã phá được ải này" | `(320 + 78·lv) × 1,9`, ×2 ở ải cuối vùng |

**Hai con số chốt lại cả đường cong:**

- Toàn bộ 38 ải ở lần phá đầu = **6.498 gem ≈ 40,6 lượt quay** cho cả chiến dịch.
- Cày lại ải cuối = 31 + 12 + 8 = **51 gem/lượt ≈ 3,1 lượt chơi đổi một cú quay**.

Cày lại phải **có nghĩa nhưng không được thay thế việc đi tiếp**. Nếu vài lượt
cày đã bằng một cú quay thì chẳng ai buồn phá ải mới. Có phép kiểm khoá cả hai
đầu của dải này (30–60 lượt quay cho chiến dịch, 3–8 lượt chơi cho một cú quay) —
chỉnh bảng thưởng lệch ra ngoài là test đỏ.

Gold nhân 1,9 lần so với bản cũ vì gold giờ là **đường duy nhất** để nâng cấp:
mọi thứ trước đây tiêu nguyên liệu giờ tiêu gold.

---

## 3. Ba banner

Cấu trúc lấy nguyên của Genshin (`_research/sephira-genre.md` phần B). Số **tỉ lệ
gốc** thì không.

| Banner | Ra gì | SS gốc | Pity mềm | Pity cứng | Cơ chế riêng |
|--------|-------|--------|----------|-----------|--------------|
| **Nhân Vật** | chỉ NGƯỜI | 3,0% | 33 | 40 | 50/50 + bảo hiểm |
| **Vũ Khí** | chỉ VŨ KHÍ | 4,0% | 26 | 32 | Điểm Định Mệnh |
| **Tiêu Chuẩn** | người + cả 5 loại đồ | 2,5% | 36 | 44 | không rate-up |

Giá: **160 gem một lượt, 1.600 gói mười** — đúng tỉ giá Genshin (160 primogem =
1 fate), và **không giảm giá gói mười**, cũng đúng như Genshin
([Game8 — Pity System](https://game8.co/games/Genshin-Impact/archives/305937)).

### 3.1 Vì sao KHÔNG chép tỉ lệ 0,6% của Genshin

Genshin để 5★ ở 0,6% với pity cứng 90 lượt. Dàn 5★ của Genshin có hàng trăm mục;
dàn SS ở đây có **4 nhân vật và 15 Behemoth**. Ở quy mô nhỏ hơn cả chục lần thì
0,6% không phải một đường cong, nó là một cái tường.

Nên **tỉ lệ gốc giữ nguyên số của Dragon Project** (SS 3 / S 15 / A 55 / B 27) —
con số đó có nguồn từ wiki bản gốc, đã dùng từ `REMAKE.md`. Cái chép của Genshin
là **CẤU TRÚC pity**, không phải con số.

Pity mềm đặt ở ~82% quãng đường tới pity cứng, cùng tỉ lệ với Genshin (74/90 =
0,82), kéo về thang ngắn hơn cho hợp tỉ lệ gốc cao gấp năm lần.

### 3.2 Pity phải NHÌN THẤY ĐƯỢC

Màn Triệu Hồi hiện đủ ba con số: đã quay bao nhiêu lượt không ra SS, **tỉ lệ SS
thật của lượt tiếp theo**, và còn bao nhiêu lượt là chắc chắn ra. Cộng một thanh
có vạch đánh dấu mốc pity mềm.

Đó không phải chi tiết trang trí. **Một hệ pity mà người chơi không thấy thì về
mặt trải nghiệm nó không tồn tại** — họ vẫn cảm thấy mỗi lượt quay là một canh
bạc độc lập, và cảm giác đó chính là cái mà pity sinh ra để chữa.

### 3.3 50/50 và Điểm Định Mệnh

- **Nhân vật:** ra SS thì 50% là người rate-up. Thua thì lần SS **sau** chắc chắn
  trúng. Đo bằng mô phỏng 4.000 lượt: tỉ lệ SS thật 4,25%, và **66% số SS là
  người rate-up** — đúng dải kỳ vọng của 50/50 + bảo hiểm.
- **Vũ khí:** chọn trước MỘT cây làm mục tiêu. Ra SS mà không phải cây đó thì +1
  Điểm Định Mệnh; có 1 điểm thì lần SS sau chắc chắn đúng cây đã chọn — luật của
  Genshin từ bản 5.0
  ([Gamerant — Epitomized Path](https://gamerant.com/genshin-impact-epitomized-path-fate-point-change-weapon-banner/)).
  **Đổi mục tiêu thì điểm về 0**, nếu không thì người chơi tích điểm bằng một cây
  rồi đổi sang cây kia để lấy bảo hiểm miễn phí.

### 3.4 Trùng NGƯỜI ra Lõi, trùng ĐỒ ra một món thật

Bản trước: quay trúng **món đồ** đã có thì món đó tan thành Lõi Rồng, vì túi
không cho phép hai món giống hệt nhau.

Luật đó **chết ngay khi Đột phá đổi sang ăn chính trang bị** (§4.2): nếu mọi món
trùng đều tan thành Lõi thì không bao giờ có đồ thừa để mà nướng, và cả một bậc
nâng cấp trở thành bất khả thi.

Nên giờ:
- **Trùng NGƯỜI** → Lõi Rồng (B 1 · A 2 · S 5 · SS 12)
- **Trùng ĐỒ** → một món thật, nằm trong túi làm nguyên liệu

Đó cũng đúng mô hình Survivor.io, nơi mọi bậc hiếm phía trên đều phải ghép từ một
đống đồ cấp dưới chứ không mua thẳng (`_research/survivorio.md` §4.3): **túi đầy
đồ trùng không phải rác, nó là kho nguyên liệu.**

Hệ quả phải chấp nhận: Lõi Rồng chỉ còn một nguồn duy nhất. Với 43 nhân vật thì
nguồn đó vẫn dồi dào sau vài chục lượt quay, và nó giữ cho hai bậc cao nhất khoá
vào đúng cú quay chứ không vào việc đi cày.

---

## 4. Trang bị: ba bậc, ba thứ tiêu khác nhau

```
NÂNG CẤP   Lv.1 → 40      tiêu GOLD          cày ải là ra
ĐỘT PHÁ    0 → 4          tiêu ĐỒ TRÙNG      phải HY SINH món khác
TINH LUYỆN 0 → 2 (S/SS)   tiêu LÕI RỒNG      chỉ có từ quay trúng người đã có
```

Ba bậc tiêu ba thứ khác nhau là cái làm chúng thành **ba quyết định** chứ không
phải ba lần bấm cùng một nút.

### 4.1 Vì sao đổi bậc giữa

Trước đây Đột phá tiêu Lapis — tức là đi cày, tức là cùng một hành động với bậc
thứ nhất, chỉ khác cái tên tài nguyên.

### 4.2 Đột phá ăn đồ

Đột phá lần thứ `n` cần **`n` món hạng bằng hoặc cao hơn, chưa lắp lên ai**, cộng
gold. Người chơi **tự chọn** món đem nướng — không tự chọn hộ.

Tự chọn hộ là cách chắc chắn nhất để một ngày nào đó nướng nhầm món người ta đang
để dành, và **không có nút hoàn tác cho việc đó**. Đây là chỗ duy nhất trong game
xoá vĩnh viễn một món, nên có hai lớp chặn và cả hai đều có phép kiểm:

1. `fodderFor()` **không bao giờ đề nghị** món đang lắp lên người, hay đồ trưng bày.
2. `limitBreak()` **kiểm lại danh sách** gửi lên trước khi nướng — gửi uid của
   món đang lắp thì bị từ chối và không mất một đồng gold nào.

### 4.3 Rã đồ trả về Gold

Trả theo hạng và theo công đã đổ vào nó (`600 × hệ số hạng × (1 + 0,5·lb + evo) +
(lv−1) × 40 × hệ số hạng`), để rã một món đã nâng không phải là một cú mất trắng.

---

## 5. TIẾN HOÁ — nâng nền cho mọi nhân vật

Bốn nhánh, mỗi nhánh 15 cấp, cộng phần trăm vào **chỉ số gốc** của **mọi nhân
vật** — kể cả người quay được sau này.

| Nhánh | Mỗi cấp | Tối đa |
|-------|---------|--------|
| Thể Chất (máu) | +3,0% | +45% |
| Sát Phạt (công) | +2,8% | +42% |
| Kiên Cố (thủ) | +3,2% | +48% |
| Kháng Hệ | +3,4% | +51% |

### 5.1 Vì sao lớp này bắt buộc phải có

Gacha ra người. Một người mới quay được thì chỉ số gốc của họ đúng bằng chỉ số
gốc lúc mới bắt đầu game. Không có lớp này thì **mọi người mới nhận về đều là một
bước LÙI so với người đang dùng**, và người chơi học được đúng một bài: *đừng đổi
người.* Đó là cái giết ý nghĩa của việc quay — tức là giết luôn lý do tồn tại của
ba banner ở §3.

Tiến Hoá cộng vào NỀN nên nó theo **tài khoản** chứ không theo người: quay được
ai thì người đó lập tức đứng ở cùng cái nền ấy.

### 5.2 Hai chi tiết thứ tự dễ làm sai

1. **Nhân TRƯỚC hệ số hạng.** Nhân trước thì một con SS hưởng nhiều hơn một con B
   đúng theo tỉ lệ hạng của nó — tức Tiến Hoá nâng ĐỀU tất cả. Cộng sau khi nhân
   hạng thì mọi hạng nhận cùng một lượng tuyệt đối, và nó âm thầm thành thứ **thu
   hẹp khoảng cách giữa các hạng**, ngược hẳn ý định.
2. **Kháng Hệ nhân SAU khi cộng xong bốn mảnh giáp**, vì kháng hệ chỉ tới từ
   giáp. Nhân trước là nhân với số 0 và cả nhánh đó không làm gì cả.

### 5.3 Giá

Luỹ thừa 1,52, bắt đầu ở 2.200 gold. Con số 1,52 không chọn cho đẹp: nó là hệ số
làm cho **tổng giá cả bốn nhánh ≈ 9,0 triệu gold** — quãng mà một người chơi hết
38 ải rồi cày lại vài chục lượt mới với tới. Tiến Hoá là **đích của cả chiến
dịch**, không phải một nút bấm trong buổi đầu.

Cứ 5 cấp cần thêm Lõi Rồng (tổng 18 lõi mỗi nhánh) — đây là chỗ những cú quay
thừa biến thành sức mạnh vĩnh viễn.

---

## 6. Kỹ năng: bỏ hẳn pha nạp, đổi sang NGẮM RỒI THẢ

### 6.1 Cái hỏng của ngữ pháp cũ

Ngữ pháp cũ là câu lệnh chuẩn của Colopl cho Punicon: *giữ màn hình → trượt về
HƯỚNG nút kỹ năng → giữ nguyên ở đó để nạp → nhả để xả.*

Đúng bản gốc. Nhưng đó là **ba điều kiện phải đúng liên tiếp trên cùng một ngón**:

1. đứng yên đủ lâu để vào được thế giữ,
2. khoá đúng hướng trong sai số 26°,
3. không nhúc nhích thêm 0,6–2,0 giây nữa.

Trượt một nấc ở bất kỳ bước nào là mất trắng cả chuỗi — và người chơi **không có
cách nào biết mình hỏng ở bước nào**. Cả ba đều cho ra đúng một kết quả nhìn thấy
được: không có gì xảy ra.

### 6.2 Ngữ pháp mới

```
HỒI CHIÊU CHÍNH LÀ THANH NẠP  →  nạp đầy thì nút sáng
đặt ngón lên nút, KÉO ĐỂ CHỈ HƯỚNG  (không kéo = tự ngắm con gần nhất)
THẢ RA = XẢ
```

- **Không còn "nhả sớm thì huỷ".** Chưa hồi xong thì nút không bấm được; bấm được
  thì chắc chắn xả ra.
- **Huỷ không mất gì.** Bỏ ngón ra là thôi — chưa tiêu gì thì không phải trả gì.
- **Ngắm không khoá chân.** Ngón di chuyển vẫn nằm trên canvas và vẫn chạy được
  trong lúc ngón kia đang chỉ hướng trên nút HUD.

Chi tiết cài đặt đáng ghi: trạng thái ngắm nằm ở **`p.skAim`, không nằm ở
`p.state`**. `p.state` bị mọi phát bắn ghi đè, còn cái ngắm thì phải sống xuyên
qua tất cả những cái đó.

`setPointerCapture` là bắt buộc, không phải cho đẹp: ngón phải kéo RA KHỎI nút
mới chỉ được hướng, mà rời khỏi nút là `pointermove` ngừng bắn vào nút ngay.
Không bắt con trỏ thì cử chỉ chết ở milimét đầu tiên và mọi cú xả đều thành
tự-ngắm.

### 6.3 Ba dáng ngắm

| Dáng | Cần gì | Vẽ ra | Ví dụ |
|------|--------|-------|-------|
| `self` | không | vòng quanh thân | Khiên Ảo, Cuồng Tốc, Vòng Mảnh |
| `dir` | một HƯỚNG | mũi tên dài đúng tầm | Trảm Thiên, Xuyên Tuyến, Phá Cửa |
| `point` | một ĐIỂM ĐẾN | vòng rơi + vành tầm tối đa | Thiên Thạch, Vũ Tiễn, Điểm Hút |

Màu **VÀNG**, không phải đỏ. Đỏ trong game này đã có nghĩa "vùng quái sắp đánh";
dùng lại nó cho vùng của chính mình là dạy người chơi sai một thứ rất đắt.

### 6.4 `faceTarget()` KHÔNG được gọi lúc xả

Hướng đã chốt ở `skillAimEnd`. Gọi thêm `faceTarget()` thì nó quay người về con
gần nhất **tại thời điểm xả** và ghi đè mất chỉ định của người chơi: chỉ tay lên
trên mà đòn bay sang ngang, vì có một con đứng sát nách. Có phép kiểm khoá lại
đúng chuyện này.

---

## 7. Bốn lớp vũ khí mới (6 → 10)

`SHOOTER.md` §3 dựng sáu lớp bắn. Đợt này thêm bốn, và **ba trong bốn cái không
sinh viên đạn nào** — mỗi cái đi một đường riêng, không nhánh nào chạy qua vòng
lặp đạn thẳng cũ.

| Lớp | Cơ chế | DPS | Tầm | Nguồn |
|-----|--------|-----|-----|-------|
| **Tia Nhiệt** | tia chạm tức thời, 10 tick/giây, ramp ×1,25 → ×1,50 | 16→24 | 330 | Gungeon + Ion Laser |
| **Kiếm Khí** | đạn rộng 46px, xuyên gần như miễn phí | 19,8 | 177 | [TÁI DỰNG] |
| **Lưỡi Hái** | 3 lưỡi xoay quanh THÂN, chặt đạn quái | 19,2 | 76 | [TÁI DỰNG] |
| **Cầu Lửa** | bay TRÊN KHÔNG, nổ ở chỗ đã chỉ | 19,2 | 300 | Soul Knight staff |

DPS của cả mười lớp nằm trong dải **15–27** (chênh 1,8 lần); burst mỗi lần bấm
chênh **17 lần**. Đúng luật của `SHOOTER.md` §3.1: DPS bền gần bằng nhau, cái
phân biệt là sát thương gom được trong một cửa sổ an toàn.

### 7.1 Tia Nhiệt — con số quan trọng nhất là ĐƯỜNG RAMP

Enter the Gungeon để **mọi** súng beam ở đúng `fireRate = 0,10s`, tức 10
tick/giây, và ghi sát thương thẳng dạng "X/giây" thay vì per-tick
(`_research/gungeon.md`). Lấy nguyên con số đó làm chuẩn cho cả hệ.

Sát thương mỗi tick **tăng dần theo thời gian giữ**, đúng Ion Laser của Soul
Knight: 4/tick, lên 5 sau 10 tick, lên 6 sau 23 tick — tức ×1,25 rồi ×1,50
([Ion Laser](https://soul-knight.fandom.com/wiki/Ion_Laser)).

Đó là cái làm laser khác một khẩu súng bắn nhanh: **phần thưởng nằm ở chỗ DÁM
đứng yên cho hết đường ramp, và mỗi lần né là mất sạch nó.** Cây này phạt đúng
cái mà mọi cây khác thưởng.

Hệ quả cài đặt: `p.beamTicks = 0` phải nằm ở **cả** `holdEnd` **và**
`holdCancel`. Quên một chỗ thì laser âm thầm thành cây mạnh nhất game.

### 7.2 Lưỡi Hái — không có bản gốc để chép

Soul Knight **không có vũ khí orbit nào**. Thứ gần nhất là skill "Battle Storm"
và mấy con drone bay kèm hai bên, cả hai đều không phải xoay-quanh-thân
(`_research/soulknight.md` §2.4). Nên phần này lấy khuôn **King Bible của Vampire
Survivors** và **tự đặt số**. Ghi rõ như vậy.

[TÁI DỰNG] Ba luật giữ cho nó không thành "bấm một lần rồi khỏi lo":

1. Bán kính **76px** — ngắn hơn tầm với của gần hết quái cận chiến, nên muốn lưỡi
   chạm được thì phải đứng trong tầm bị đánh.
2. Mỗi lưỡi **giữ sổ riêng** mốc thời gian nó chạm từng mục tiêu lần cuối, 600ms
   mới ăn lại. Không có sổ thì lưỡi ăn 60 lần một giây; để sổ chung cho cả ba
   lưỡi thì lưỡi thứ hai và thứ ba vĩnh viễn không ăn được gì.
3. Lưỡi **xoá đạn quái** khi chạm. Đây là cái mua lại chỗ đứng nguy hiểm kia, và
   là lý do lớp này tồn tại thay vì chỉ là một vòng sát thương.

Nhịp bung (2,5s) phải **dài hơn** thời gian lưỡi sống (2,6s ≈ bằng): ngắn hơn thì
lưỡi cũ chưa tan mà lưỡi mới đã ra, chúng dồn đống, và DPS tự nhân đôi theo thời
gian giữ cò mà không ai chủ ý thiết kế như vậy.

### 7.3 Cầu Lửa khác Súng Phóng ở đúng một điểm

Quả cầu bay **trên không** nên nó không va vào gì giữa đường. Súng phóng bắn
thẳng, gặp con đầu tiên là nổ ngay tại đó; cầu lửa bỏ qua cả hàng đầu và rơi đúng
xuống chỗ đã chỉ. Đó là vũ khí của người muốn đánh vào **hàng sau**.

Chiều cao là một parabol theo **tiến độ đường bay**, không phải mô phỏng trọng
lực: mô phỏng thật thì điểm rơi phụ thuộc vận tốc ban đầu và sẽ trượt khỏi chỗ đã
ngắm. Điểm rơi là thứ được chốt trước; cái parabol chỉ có nhiệm vụ làm cho việc
đó nhìn ra là một cú ném.

### 7.4 Bảng Behemoth vẫn giữ sáu lớp gốc

Bảng Behemoth là dữ liệu lấy nguyên văn từ wiki Dragon Project, và tôi không sửa
dữ liệu nguồn để nhét bốn lớp mới vào. Bốn lớp mới lấy đường khác: **mỗi lớp cũ
tách làm đôi theo họ silhouette**, chia bằng **băm id** chứ không bằng random —
cùng một con Behemoth thì đời nào cũng ra đúng cây đó, kể cả sau khi xoá save.
Random ở đây thì hồ sơ cũ nạp lên thấy vũ khí tự đổi lớp, mà đổi lớp là đổi cả bộ
đòn lẫn hai kỹ năng.

```
kiếm    → súng trường | kiếm khí    (cùng hình "một lưỡi thẳng")
thương  → bắn tỉa     | tia nhiệt   (cùng câu "xuyên một đường thẳng")
đại kiếm→ súng phóng  | cầu lửa     (cùng câu "một khối nặng rơi xuống")
song kiếm→ súng săn   | lưỡi hái    (cùng câu "áp sát, ra nhiều nhát")
cung    → cung        (không tách)
trượng  → gậy phép    (không tách)
```

Cung và trượng không tách vì cả hai đã là lớp có bản sắc riêng rõ nhất trong sáu
lớp cũ (dải chí mạng, và nhịp niệm ngắt được) — tách ra thì phải bịa một bản sắc
thứ hai cho mỗi cái.

---

## 8. Hai mươi kỹ năng chủ động

Hai kỹ năng mỗi lớp × mười lớp. **Không con số nào đặt bằng tay** — tất cả suy ra
từ ngân sách của `SHOOTER.md` §4:

```
mul ≈ DPS_đòn_thường × T(giây) × K
DPS mọi lớp nằm trong dải 15–27 nên lấy tròn 20 làm mốc
K = 0,80–0,90  đòn thuần sát thương, đơn mục tiêu
K = 0,45–0,55  đòn diện rộng, hoặc có "quà kèm" (triệu hồi, gom quái, bất tử)
K = 0,25–0,30  đòn thuần tiện ích
```

Bảy trình phát mới, và mỗi cái là một **hình dạng** khác nhau trên màn hình:

| Kỹ năng | Lớp | Dáng | Ghi chú thiết kế |
|---------|-----|------|------------------|
| Cuồng Tốc | súng trường | self | Không gây một điểm sát thương nào — nó bán thứ đắt hơn: xoá cái đánh đổi "một ngón thì hoặc chạy hoặc bắn" trong 6 giây |
| Liên Châu | bắn tỉa | dir | Bảy viên, mỗi viên một mục tiêu **khác nhau**. Dồn cả bảy vào con gần nhất thì nó chỉ là Xuyên Tuyến bắn chậm hơn |
| Khiên Ảo | gậy phép | self | Toàn bộ sát thương nằm ở **cú nổ lúc vỡ**, không ở lúc bấm |
| Bầy Vệ Tinh | tia nhiệt | self | Drone **bay theo người** (khác ụ súng cắm xuống đất) — vì tia nhiệt là lớp bị phạt di chuyển nặng nhất |
| Lăng Kính | tia nhiệt | dir | Quét cung 120° trong 900ms. Quét nhanh thì không né được, mà đòn không né được ở tầm 340px xoá sổ mọi quyết định |
| Trảm Thiên | kiếm khí | dir | Rộng 150px, đi **chậm**. Nhát to mà bay nhanh thì 324 điểm sát thương xảy ra trong một khung hình không ai thấy |
| Thiên Thạch | cầu lửa | point | Chờ 850ms — dài nhất game. Nó **không phải** để ném vào chỗ quái đang đứng, mà vào chỗ chúng SẼ đứng |

**Cuồng Tốc bỏ HAI hệ số phạt cùng lúc**, không phải một: `W.moveMul` (phạt theo
cây — tia nhiệt 0,62) và hệ số theo trạng thái (đang bắn 0,85, đang ghì 0,45). Bỏ
mỗi cái thứ nhất thì người chơi vẫn thấy mình bò trong lúc bấm cò và cả kỹ năng
mất nghĩa. Và nó **cộng thêm** +70% tốc chạy chứ không chỉ bỏ phạt: bỏ phạt thôi
thì người chơi không NHÌN THẤY gì cả — họ có sẵn tốc đó lúc không bắn.

**Thiên Thạch có hai vòng sát thương, không phải một:** lõi 62% trong bán kính
110, sóng xung kích 38% trong bán kính 190. Đứng rìa vẫn ăn, nhưng ăn ít — đó là
cái làm cho việc chạy ra rìa là một hành động **có nghĩa** chứ không phải nhị
phân.

---

## 9. Đọc được trong trận

### 9.1 Camera gần lại — bằng ZOOM, không bằng phóng sprite

Trước đây khung nhìn 1:1 với sân, nhân vật cao 34px trên khung 540 bề ngang —
chiếm **6%** bề ngang. Zoom 1,30 đưa nó lên ~8%.

Đổi bằng zoom chứ không phóng sprite: phóng sprite thì **tầm bắn, tầm quái và mọi
con số va chạm đứng nguyên trong khi ẢNH to ra** — hai thứ lệch nhau và game
trông sai. Zoom camera thì mọi thứ to lên cùng một hệ số, không có gì lệch pha.

Rung và đá camera đo bằng **pixel màn hình** nên chúng phải nằm NGOÀI phép zoom;
không thì cùng một con số rung sẽ mạnh yếu khác nhau tuỳ mức zoom.

### 9.2 Máu / thanh nạp / hai đồng hồ kỹ năng — dời lên TRÊN ĐẦU

Trên màn dọc điện thoại, mắt bám vào nhân vật gần như suốt trận — đó là chỗ mọi
thứ nguy hiểm xảy ra. Thanh máu ở mép dưới bắt mắt **rời mục tiêu, đi hết chiều
dọc màn hình, đọc, rồi quay lại**; trong một trận mà cửa sổ né chỉ 0,4 giây thì
quãng đường đó là quãng đường bị ăn đòn.

Thanh dưới chân màn hình vẫn giữ — nó là bảng **số chi tiết** (số máu, EXP, cấp).
Cái trên đầu là bảng **cảnh báo**: chỉ ba thứ, đọc bằng màu và bằng bề dài.

Chi tiết: màu máu đổi theo **ngưỡng** (>50% xanh, >25% vàng, còn lại đỏ) chứ
không nội suy trơn — một dải màu chuyển dần thì không có mốc nào để nhận ra, còn
ba bậc thì "đang đỏ" là một **sự kiện**. Thanh nạp đầy thì **nháy**, không chỉ đổi
màu: mắt ngoại vi bắt được nhấp nháy ở chỗ nó không bắt được một sắc độ.

### 9.3 Đạn vẽ lại

Bản cũ vẽ **mọi** viên — của mình lẫn của quái, bán kính 6 lẫn bán kính 22 — bằng
đúng một hình mũi tên dài 28px màu kem. Hệ quả: bán kính va chạm thật và hình
người chơi nhìn thấy không liên quan gì tới nhau, mà đó lại là thứ duy nhất quyết
định né được hay không.

Ba luật mới, và chỉ có ba:

1. **Hình vẽ đúng bằng bán kính va chạm.** Không có ngoại lệ.
2. **Đạn quái vẽ khác hẳn đạn mình** — khác cả hình lẫn màu. Trong một màn hình
   có bảy chục viên đang bay, câu phải trả lời tức thì là "viên này của ai".
3. **Đạn đang trong pha hiện dần** (chưa có hitbox) thì mờ và có vành ngoài.

---

## 10. Hiệu ứng: nhập bộ PVFX Foundry

25 hiệu ứng pixel (CC0), nhập qua `_tools/pvfx.py`. Mỗi hiệu ứng 96×96, 50ms/khung,
kèm pivot trong manifest nguồn.

Ba quyết định trong tool, và cả ba đều là chỗ dễ làm sai:

1. **Ghi strip vào `_assets_src/fx/` trong repo**, không đọc thẳng từ thư mục
   Downloads. Máy khác không có thư mục đó, và một pipeline chỉ chạy được trên
   một máy thì không phải pipeline.
2. **Dùng lưới `grid`, không dùng `packed`.** Bản packed cắt sát viền từng khung
   nên mỗi khung có một offset riêng; bản grid giữ nguyên ô 96×96 nên mọi khung
   dùng chung MỘT điểm neo. Đổi lấy vài KB để không phải mang theo một bảng offset
   mà chỗ nào quên đọc là hiệu ứng nhảy lung tung.
3. **`ox`/`oy` lấy nguyên pivot của manifest**, kèm `anchor: "fixed"` để `pack.py`
   không đoán lại. Pivot là thứ phân biệt "vòng nổ nở ra từ tâm" với "cột khói mọc
   lên từ chân" — đoán bằng tâm ảnh thì cột khói lơ lửng giữa không khí.

Trong game, tất cả đi qua **một kind FX duy nhất** `{ k:'spr', key:'fx.<tên>' }`.
Trước đây mỗi hiệu ứng mới là một nhánh `switch` mới cộng một hàm vẽ tay mới.

`scale` tính theo **bán kính mong muốn**, không phải một hệ số tự do: hiệu ứng gốc
96px tâm ở giữa thì bán kính của nó là 48, nên `scale = r/48`. Có vậy vòng nổ vẽ
ra mới đúng bằng vòng nổ ăn sát thương — hai thứ đó lệch nhau là người chơi học
sai tầm của chính vũ khí mình đang cầm.

Bảy hệ nguyên tố giờ có **bảy hình bung khác nhau** (`G.ELEM_FX[*].spr`), không
phải một vòng tròn đổi bảy màu. Đó chính là chỗ hệ Magi cũ chết.

---

## 11. Bảng thay đổi số — trước và sau

| Hằng số | Cũ | Mới | Vì sao |
|---------|-----|-----|--------|
| Số lớp vũ khí | 6 | **10** | §7 |
| Số kỹ năng | 12 | **20** | §8 |
| Đồng tiền | 5 | **2** (+1 con dấu) | §2.2 |
| Bảng nguyên liệu | 40 mục | **bỏ hẳn** | §2.1 |
| Cốt truyện / nhiệm vụ ngày / tuần | có | **bỏ hẳn** | §2.1 |
| Banner gacha | 1 | **3** | §3 |
| Giá một lượt quay | 5 vé | **160 gem** | tỉ giá Genshin |
| Gem lần đầu phá ải | 5–10 | **60 + 6i** | §2.4 |
| Gold thưởng ải | `320 + 78·lv` | **×1,9** | gold là đường nâng cấp duy nhất |
| Đột phá tiêu | Lapis | **đồ trùng** | §4.2 |
| Tinh luyện tiêu | Lõi Rồng | Lõi Rồng (giữ) | — |
| Trùng ĐỒ khi quay | → Lõi Rồng | **→ một món thật** | §3.4 |
| Tiến Hoá tài khoản | (chưa có) | **4 nhánh × 15 cấp** | §5 |
| Bốc cường hoá trong ải | (chưa có) | **15 lá, 3–5 lần/ải** | §1 |
| Xả kỹ năng | giữ → trượt → nạp → nhả | **bấm → kéo → thả** | §6 |
| Zoom camera | 1,00 | **1,30** | §9.1 |
| Thanh máu người chơi | mép dưới | **trên đầu nhân vật** | §9.2 |
| Hiệu ứng có ảnh | 16 | **41** | §10 |

---

## 12. Cái CỐ Ý không làm

- **Không cài hệ Energy/Stamina.** Survivor.io tính 5 Energy một lượt ải, trần 30,
  hồi 1 điểm/20 phút (`_research/survivorio.md` §1.2). Đó là một cái van chặn để
  bán lượt chơi. Ở đây không bán gì, nên cái van chỉ còn là một hàng rào.
- **Không cài hệ tiến hoá kỹ năng kiểu Survivor.io** (ghép vũ khí cấp 5 với một
  trang bị bị động để ra dạng evolve). Đẹp, và có tới 19 công thức xác nhận được,
  nhưng nó cần một hệ trang bị bị động **trong lượt chơi** mà bản này chưa có —
  bốc cường hoá (§1) đang giữ đúng chỗ đó và làm cùng một việc rẻ hơn.
- **Không cài mode phụ** (Trials, Special Ops, Ender's Echo). Chúng là bộ máy trả
  gem theo lịch của Survivor.io, mà §2.3 đã giải thích vì sao lịch không dùng
  được ở đây.
- **Không cài nảy tường cho đạn người chơi.** Giữ nguyên quyết định của
  `SHOOTER.md` §12: sân không có tường trong.
- **Không đổi tỉ lệ gacha gốc sang số của Genshin.** §3.1.
