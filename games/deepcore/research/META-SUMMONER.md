# Meta của Survivor.io + class Summoner trong ARPG — hồ sơ nghiên cứu cho `deepcore`

Tài liệu này phục vụ đúng một việc: **thiết kế hệ "vũ khí = pet tự đánh" cho `deepcore`**
(2D top-down, màn hình dọc, người chơi KHÔNG tự đánh, có đào tường/quặng, một màn duy nhất,
lên cấp chọn 1 trong 3).

Ba phần:
- **PHẦN A** — bóc tách meta ngoài-ván của **Survivor.io** (Habby): tiền tệ, chọn ải, trang bị,
  vì sao "nâng ngoài ván" làm game dễ đi, và bố cục UI di động.
- **PHẦN B** — class **Summoner/Minion** trong ARPG: AI minion, phân vai, vì sao dễ chơi,
  và những bẫy thiết kế.
- **PHẦN C** — tổng hợp thành đề xuất cụ thể cho `deepcore`.

Quy ước đánh dấu — giống các hồ sơ khác trong repo:
- không dấu — **có nguồn**, URL dẫn ngay tại chỗ và gom ở cuối bài.
- `[NGUỒN]` — số/luật lấy từ nguồn ngoài, kèm URL.
- `[ĐỀ XUẤT]` — thiết kế do tài liệu này nghĩ ra, **không** có trong game gốc nào.

> **Cảnh báo về độ tin của số liệu Survivor.io.** Game chạy từ 2022-08 và Habby vá liên tục;
> nhiều con số bên dưới lấy từ hướng dẫn cộng đồng ở các mốc thời gian khác nhau (2022 → 2026)
> nên **có thể lệch với bản hiện tại**. Chỗ nào hai nguồn mâu thuẫn thì ghi rõ cả hai.
> `survivorio.fandom.com` là wiki đầy đủ nhất nhưng **chặn truy cập tự động (HTTP 402)** ở thời
> điểm viết, nên phần lớn số liệu dưới đây đến từ nguồn thứ cấp.

---

# PHẦN A — Meta ngoài-ván của Survivor.io

## 1. Hai loại tiền — và tất cả những thứ đóng vai tiền tệ

Survivor.io **không** chỉ có hai loại tiền. Nó có một tầng tiền tệ khá dày. Nhưng chỉ hai
thứ là **CỐT LÕI**, phần còn lại là van điều tiết.

### 1.1 CỐT LÕI

| Tiền | Kiếm ở đâu | Tiêu vào đâu |
|---|---|---|
| **Gold (Coin)** — tiền mềm | Rơi từ quái trong ván; thưởng qua ải; **Patrol** (thu nhập AFK, dồn tối đa 24 giờ); nhiệm vụ hằng ngày; xem quảng cáo | **Nâng cấp độ trang bị** (đi kèm Design); **cột trái của bảng Evolution** — mua vĩnh viễn Strength / Stamina / Tenacity / Restoration (ATK / HP / Armor / Meat Heal) |
| **Gem** — tiền cứng | Nhiệm vụ ngày/tuần ("hàng trăm gem đều đặn"); Special Ops (~500+ gem/ngày nếu ưu tiên nhiệm vụ ra gem); Ender's Echo (hàng trăm gem/tuần); Zone Ops 100–200 gem mỗi mốc mới; ải chính: **20 gem khi qua ải + 100 gem cho rương thứ hai**; code khuyến mãi 200–300 gem; nạp tiền | **Mở rương gacha** (S Grade Supplies 300 gem/lần, 2 680 gem cho 10 lần); **đổi Energy** (100 → 200 → 300 gem cho ba lần đổi trong ngày); hồi sinh giữa trận (100+ gem); rương thú cưng; đẩy mốc sự kiện (5 000–20 000 gem) |

`[NGUỒN]` bảng thu/chi gem và gold: https://mturbogamer.com/2022/10/survivor-io-best-way-to-spend-gems/
`[NGUỒN]` gold + Design là chi phí nâng cấp độ trang bị: https://onechilledgamer.com/survivor-io-equipment-guide/
`[NGUỒN]` bảng Evolution mua bằng gold: https://www.bluestacks.com/blog/game-guides/survivor-io/sio-beginner-guide-en.html

**Luật một câu:** *Gold là cái người chơi luôn có; Gem là cái người chơi luôn thiếu.*
Gold nhiều nguồn, hồi liên tục, và về cuối game **thừa mứa đến mức vô giá trị** (cùng nguồn
mturbogamer: gold "trở nên vô dụng và dư thừa ở late game"). Gem thì đi thẳng vào gacha — chỗ
duy nhất ra được trang bị bậc cao.

### 1.2 Các tiền tệ phụ (đầy đủ)

| Thứ | Vai trò | Ghi chú |
|---|---|---|
| **Energy (Stamina)** | Vé vào ván | **5 energy / lượt chơi một chương**; trần **30** (lên **50** nếu mua Super Monthly Card); hồi **1 điểm / 20 phút**; lên cấp tài khoản được **+5**; xem quảng cáo **+5, tối đa 3 lần/ngày**; mua **15 energy = 100 gem**, tối đa 3 lần/ngày (giá tăng dần 100 / 200 / 300) |
| **Equipment Design (bản vẽ)** | Vật liệu nâng **cấp độ** trang bị | Phải **đúng loại** trang bị muốn nâng. Đi cặp với gold. Hoàn lại được khi "downgrade" món đồ |
| **Gold Key / chìa** | Mở rương trang bị & rương pet bậc cao | Thưởng từ nhiệm vụ chương |
| **Evo DNA / Key Evolution ("Gold DNA")** | Mở **cột phải** của bảng Evolution — kỹ năng đặc biệt, **không mua được bằng gold** | Kiếm từ **Trials** (mở khoá sau khi qua Chương 2) |
| **Tech Parts (linh kiện) + Resonance Chips** | Hệ trang bị thứ hai: cộng ATK/HP và **sửa đổi kỹ năng vũ khí** | Nguồn chính: Daily Challenge, sự kiện, mua bằng gem. Ghép **3 cái trùng** để lên bậc |
| **Cube / Core (Eternal, Void, Chaos)** | Vật liệu **Astral Forge** | Lấy từ **rã (salvage)** trang bị thừa. Đồ thường ra cube; đồ S-grade ra nhiều cube hơn; mỗi bộ S-grade ra đúng loại core của bộ đó |
| **Energy Essence** | Nâng cấp Survivor (nhân vật) | Rơi từ Quick Patrol |
| **Dust** | Chỉ tồn tại **trong ván** — gom đủ thì được chọn buff | Không phải meta currency |

`[NGUỒN]` energy (trần 30/50, 5/lượt, 15 cho Quick Patrol, 100 gem = 15 energy, 3 lần quảng cáo): https://writerparty.com/party/survivor-io-energy-guide/
`[NGUỒN]` energy hồi 1 điểm / 20 phút: https://gamesadda.in/gaming/survivor-io-get-energy/
`[NGUỒN]` Evo DNA / cột phải bảng Evolution: https://mturbogamer.com/2022/09/survivor-io-how-to-get-key-evolution-gold-dna/
`[NGUỒN]` Tech Parts ghép 3: https://mturbogamer.com/2022/11/survivor-io-tech-parts-guide-unlock-use-merge/
`[NGUỒN]` cube/core từ salvage: https://www.allclash.com/survivor-io-astral-forge-guide/ và https://mturbogamer.com/2026/07/survivor-io-astral-forge-guide/
`[NGUỒN]` Energy Essence: https://mturbogamer.com/2022/09/survivor-io-patrol-quick-patrol/

### 1.3 Bài học rút cho `deepcore`

Survivor.io **không** dùng hai tiền tệ. Nó dùng **một cặp lõi (mềm / cứng) + một rừng vật liệu
chuyên dụng**. Lý do rất cụ thể: mỗi hệ thống nâng cấp bị khoá bằng **một vật liệu riêng không
thay thế được**, nên người chơi không thể dồn hết một nguồn vào một hệ và phá vỡ đường cong.
Muốn nâng cấp độ → cần Design **đúng loại**. Muốn lên bậc hiếm → cần **đồ trùng ô**. Muốn Astral
Forge → cần **core đúng bộ**. Gold chỉ là thuế đi kèm.

---

## 2. Chọn ải: cấu trúc chương–ải, độ khó, UI, thưởng lần đầu vs. lặp lại

### 2.1 Cấu trúc

- **Chế độ chính là "Chapter" (chương)** — không phải "màn ngắn". Mỗi chương là **một ván sinh
  tồn liền mạch**: sống sót hết thời lượng, boss cuối xuất hiện ở cuối. Một chương có **3–4 boss**
  rải trong ván.
  `[NGUỒN]` https://www.bluestacks.com/blog/game-guides/survivor-io/sio-beginner-guide-en.html
  ("mỗi màn có một số lượng quái xấp xỉ và một thời lượng; ý tưởng là sống sót hết thời lượng,
  lúc đó boss cuối mới hiện"); https://www.ldplayer.net/blog/survivor-io-beginners-guide.html
- Thời lượng chương **8 phút hoặc 15 phút** tuỳ chương.
  `[NGUỒN]` tư liệu cộng đồng liệt kê "Every 8 & 15 Minute Chapter From 1 to 70":
  https://www.youtube.com/watch?v=CLXNNX_Vkys
- **Khoá tuyến tính**: phải qua chương trước mới mở chương sau.
  `[NGUỒN]` https://www.talkandroid.com/24372-survivor-io-ultimate-game-guide-with-tips-2023/
  (bài này ghi "100 chapters available" ở thời điểm 2023; số chương tăng theo phiên bản —
  **đừng coi 100 là con số cố định**)
- **Trials** — chế độ thứ hai, mở sau Chương 2. Chơi lại **bản đã buff** của chương đã qua,
  ngắn hơn ải chính nhưng **khó hơn hẳn**. Mỗi chương trong Trials có **3 nấc**:
  - nấc 1 → ~200 gem
  - nấc 2 → **Evolution DNA**
  - nấc 3 → gem
  `[NGUỒN]` https://writerparty.com/party/survivor-io-trials-guide-and-walkthrough/
  (nguồn này còn nói "13 stage mỗi chương" — mâu thuẫn với mô tả 3 nấc ngay bên dưới trong
  cùng bài; **không dùng con số 13**.)
- **Mega Challenge** — biến thể nơi **chỉ số trang bị KHÔNG tính**, chỉ tính kỹ năng chơi và
  lựa chọn buff khi lên cấp. Đây là van đối trọng cho lạm phát sức mạnh.
  `[NGUỒN]` cùng bài writerparty.

### 2.2 Thưởng lần đầu vs. lặp lại

Đây là chỗ Survivor.io tách rất rõ:

| Loại | Thưởng |
|---|---|
| **Lần đầu qua chương** | 20 gem khi hoàn thành + **100 gem cho rương thứ hai**; chìa / trang bị từ "chapter mission" |
| **Chơi lại chương** | Chỉ gold + EXP + rơi vặt — **không** trả lại phần thưởng mốc |
| **Trials, mỗi nấc** | Trả **một lần duy nhất** (gem / Evo DNA). Chơi lại **không tốn energy** nhưng cũng không cho lại thưởng |
| **Mega Challenge** | Chấm điểm; **điểm cao mở nhiều mốc thưởng cùng lúc**, không phải chơi ba lần |

`[NGUỒN]` 20 gem + 100 gem rương hai: https://mturbogamer.com/2022/10/survivor-io-best-way-to-spend-gems/
`[NGUỒN]` Trials chơi lại không tốn energy và cấu trúc thưởng theo nấc: https://writerparty.com/party/survivor-io-trials-guide-and-walkthrough/

### 2.3 "Sweep / quét ải" — Survivor.io gọi là **Patrol**

Survivor.io **không có nút sweep trên từng ải** như RPG gacha thông thường. Nó thay bằng
**một cơ chế AFK toàn cục**:

- **Patrol** — nhân vật tự đi tuần, sinh **gold + EXP** theo thời gian thực, **dồn tối đa 24 giờ**,
  vào lấy thủ công.
- **Quick Patrol ("Quick Earnings")** — trả **15 energy** để lấy ngay **300 phút (5 giờ)** thu nhập
  Patrol. **Tối đa 3 lần / 24 giờ.** Càng về sau càng ra thêm **Design** và **trang bị**, không chỉ
  gold/EXP.
- Nút nằm ở **màn hình chọn ải**, và nhãn nút ghi là **"Quick Earnings"** chứ không phải
  "Quick Patrol" — chính điều này khiến người chơi tìm không ra. **Đây là một lỗi UX đã được ghi
  nhận, đáng tránh.**

`[NGUỒN]` https://mturbogamer.com/2022/09/survivor-io-patrol-quick-patrol/
`[NGUỒN]` nút Patrol nằm trên màn chọn ải: https://www.talkandroid.com/24372-survivor-io-ultimate-game-guide-with-tips-2023/

### 2.4 Vì sao cấu trúc này hiệu quả

**Energy khoá nhịp, chương khoá tiến độ, Patrol khoá sự có mặt.**
5 energy/lượt trên trần 30 nghĩa là **6 lượt chơi rồi hết**; hồi 1 điểm / 20 phút nghĩa là
**10 giờ để đầy lại**. Người chơi buộc phải rời game — và **quay lại**. Trong lúc rời đi,
Patrol vẫn tích gold, tạo lý do quay lại. Quick Patrol thì đổi energy lấy thời gian, biến
energy thừa lúc nửa đêm thành tài nguyên. Đây là **vòng lặp giữ chân**, không phải vòng lặp chơi.

---

## 3. Trang bị: 6 ô, bậc hiếm, nâng cấp, tiến hoá, gacha

### 3.1 Sáu ô

| Ô | Vai trò chỉ số |
|---|---|
| **Weapon (vũ khí)** | Đổi **đòn đánh khởi đầu** trong ván — ô duy nhất đổi *cách chơi*, không chỉ đổi số |
| **Necklace (dây chuyền)** | Thiên về tấn công |
| **Gloves (găng)** | Thiên về sống sót |
| **Chest / Armor (giáp)** | HP, phòng thủ |
| **Belt (thắt lưng)** | HP + hiệu ứng sống sót |
| **Shoes (giày)** | Tốc chạy + HP |

`[NGUỒN]` https://onechilledgamer.com/survivor-io-equipment-guide/ và
https://www.talkandroid.com/24372-survivor-io-ultimate-game-guide-with-tips-2023/

Chú ý điểm thiết kế: **chỉ ô Weapon đổi lối chơi**, năm ô còn lại là chỉ số thuần. Nghĩa là
người chơi có **một quyết định thật** và **năm thanh tiến độ**. Rất rẻ để cân bằng, rất dễ hiểu.

### 3.2 Bậc hiếm

Chuỗi nền: **Normal (xám) → Good (lục) → Better (lam) → Excellent (tím) → Epic (vàng) →
Legend (đỏ)**, và mỗi bậc cao có các nấc **+1 / +2 / +3** ở giữa. Ngoài ra có một nhánh song
song **S-grade** (rồi **SS-grade**) — đồ đặc biệt **không tạo ra được bằng cách ghép đồ thường**,
chỉ ra từ rương S Grade Supplies hoặc sự kiện.

`[NGUỒN]` chuỗi 6 bậc: https://www.talkandroid.com/24372-survivor-io-ultimate-game-guide-with-tips-2023/
`[NGUỒN]` "11 bậc" khi đếm cả nấc `+`: https://simplegameguide.com/merge-equipment-gear-survivor-io/
`[NGUỒN]` "15 bậc" khi đếm đầy đủ hơn: https://onechilledgamer.com/survivor-io-equipment-guide/
`[NGUỒN]` S-grade không ghép từ đồ thường, 300 gem/lần: https://survivorio.fandom.com/wiki/S_grade_equipment

> **Mâu thuẫn giữa các nguồn đã ghi nhận:** 6 / 11 / 15 bậc. Ba con số này thực ra là **ba cách
> đếm cùng một thang** (đếm màu / đếm cả nấc `+` / đếm cả nhánh S). Với `deepcore` thì bài học
> là: **đếm màu ít, đếm nấc nhiều** — người chơi nhớ màu, nhưng đường cong chạy trên nấc.

### 3.3 Nâng **cấp độ** (upgrade) — tốn gì

- Vật liệu: **Equipment Design đúng loại trang bị** + **Gold**.
- Càng lên cao càng tốn cả hai.
- **Trần cấp độ do bậc hiếm quyết định.** Lên bậc hiếm → tăng trần cấp, tăng chỉ số nền,
  và **mở thêm Skill (nội tại)** cho món đồ.
- Có thể **"downgrade"** để hoàn lại gold và Design — tức là **không phạt sai lầm đầu tư**.

`[NGUỒN]` https://onechilledgamer.com/survivor-io-equipment-guide/
`[NGUỒN]` hoàn lại khi downgrade: https://onechilledgamer.com/survivor-io-guide-and-tips-for-beginners/

*Không tìm được bảng số trần-cấp-theo-bậc nào có nguồn tin cậy. **Không bịa.***

### 3.4 Lên **bậc hiếm** (merge) — ghép mấy món

Đây là chỗ các nguồn **mâu thuẫn nặng nhất**. Ghi cả ba:

**Nguồn A** — https://writerparty.com/party/survivor-io-how-to-get-better-excellent-epic-legendary-and-s-grade-supplies-and-equipment-part-2/
(chuỗi nhị phân, **cùng ô**):

```
Excellent    + Excellent    (cùng ô) → Excellent +1
Excellent +1 + Excellent +1 (cùng ô) → Excellent +2
Excellent +2 + Excellent +2 (cùng ô) → Epic
Epic         + Epic         (cùng ô) → Epic +1
Epic +1      + Epic +1      (cùng ô) → Epic +2
Epic +2      + Epic +2      (cùng ô) → Epic +3
Epic +3      + Epic +3      (cùng ô) → Legend
```

**Nguồn B** — https://survivorio.fandom.com/wiki/Merging và các hướng dẫn ghép:
3 xám → 1 lục; 3 lục → 1 lam; 3 lam → 1 tím; **8 tím → 1 Epic**; **6 Epic → 1 Legend**.

**Nguồn C** — https://theclashify.com/survivorio-io-merge-guide/: Epic cần *"2 món cùng loại +
6 món mồi khác"*; Legend cần *"3 Epic cùng loại (tức ít nhất 6 tím cùng loại) + 3 Epic khác"*.

**Cách hoà giải** — ba nguồn tả cùng một cây, khác nhau ở việc **có tính món mồi (fodder) hay
không**: ở bậc thấp thì mồi có thể là **bất kỳ món nào cùng bậc**, nhưng **nhánh chính phải
cùng ô**. Nguồn A đếm nhánh chính; nguồn B/C đếm tổng số món tiêu tốn. Bậc thấp ghép 2–3 món,
bậc cao nở ra 6–8 món.

**Điểm quan trọng cho `deepcore`:** *"cùng ô" mới là ràng buộc thật; "bất kỳ" là van xả cho đồ rác.*
Nhờ vậy mọi thứ rơi ra đều có chỗ dùng — **không có loot chết**.

### 3.5 Tiến hoá thật sự: **Astral Forge** (và **Tech Parts**)

Astral Forge là tầng nâng cấp **sau khi đã đạt Legend**:

- **Điều kiện mở**: phải **chế được ít nhất một món Legend (đỏ)**. Vào qua
  **tab Equipment → Merge → nút "Astral Forge"**.
- **Nguyên liệu mỗi lần forge**: một món **Legend (đỏ)** + một món **Epic (vàng)** **cùng loại**,
  cộng **Cube**; nếu là đồ **S-grade** thì cần thêm **Core đúng bộ** (Eternal / Void / Chaos).
- **Cube và Core lấy từ salvage** (rã đồ thừa): đồ thường ra cube, đồ S-grade ra nhiều cube hơn,
  và mỗi bộ S-grade ra đúng core của bộ đó.
- **Ba nấc: AF1 / AF2 / AF3.**
- Forge **không chỉ cộng chỉ số** — nó mở **hiệu ứng đặc biệt mới** cho món đồ. Số ghi nhận
  được: **~15% ATK/HP ở nấc 1 sao**, **~20% ở nấc 2 sao**, và ở **3 sao thì đổi cơ chế**
  (ví dụ được nêu: "vung vũ khí tạo sóng xung kích").

`[NGUỒN]` https://mturbogamer.com/2026/07/survivor-io-astral-forge-guide/
`[NGUỒN]` https://www.allclash.com/survivor-io-astral-forge-guide/
`[NGUỒN]` https://survivorio.fandom.com/wiki/Astral_forge

> Lưu ý trung thực: chính bài allclash bị người đọc phản hồi rằng bảng **5 sao** trong đó
> **không tồn tại trong game**. Vậy nên **chỉ tin phần 1–3 sao**.

Song song còn có **Tech Parts** — hệ trang bị thứ hai, cộng ATK/HP và **sửa đổi kỹ năng vũ khí**;
ghép **3 món trùng** để lên bậc. Đáng chú ý: **Tech Parts bắt buộc dùng đồ cùng loại ở MỌI nấc**,
khắt khe hơn trang bị thường (trang bị thường cho dùng mồi bất kỳ ở vài nấc).
`[NGUỒN]` https://mturbogamer.com/2022/11/survivor-io-tech-parts-guide-unlock-use-merge/ và
https://theclashify.com/survivorio-io-merge-guide/

### 3.6 Gacha: các loại rương

| Rương | Giá | Nội dung / luật |
|---|---|---|
| **S Grade Supplies** | **300 gem / lần**, **2 680 gem / 10 lần** (giảm ~10,7%) | Ra Good / Better / Excellent / **S-tier Excellent**. Rương tốt nhất game. Có **Wishlist**: người chơi chọn trước món mong muốn |
| **EDF Supplies** | 300 gem / lần | Ra Good / Better / Excellent. **Bảo hiểm: chắc chắn có 1 món Excellent sau mỗi 10 lần mở** |
| **Army Crates** | **80 gem / cái** | Giá trị thấp; chủ yếu để cày tiến độ sự kiện |
| **Master Tech Crates** | ~5 269 gem / món (quy đổi) | Nguồn đánh giá là **giá trị kém, tránh** |
| **Rương pet** | 300 gem / lần, **2 680 gem / 10 lần**; hoặc **3 lần/ngày miễn phí bằng quảng cáo**; hoặc Gold Key | Ra pet |
| **Rương chìa (Gold Key)** | Chìa từ nhiệm vụ chương | Trang bị bậc cao |

`[NGUỒN]` https://onechilledgamer.com/survivor-io-equipment-guide/ (300 / 2 680, nội dung S Grade)
`[NGUỒN]` https://onechilledgamer.com/survivor-io-guide-and-tips-for-beginners/ (EDF, bảo hiểm 10 lần)
`[NGUỒN]` https://mturbogamer.com/2022/10/survivor-io-best-way-to-spend-gems/ (Army 80 gem, Master Tech ~5 269)
`[NGUỒN]` https://www.pocketgamer.com/survivor-io/pets-guide/ (rương pet, 3 lần quảng cáo/ngày)
`[NGUỒN]` Wishlist cho S Grade Supply Crate — thông báo chính thức: https://www.instagram.com/survivor_io/p/Cr6TTxfPi6o/

> **Về tỉ lệ rơi:** tài liệu này **không tìm được bảng tỉ lệ công bố chính thức nào**. Có video
> cộng đồng tuyên bố "drop rate bí mật" nhưng không kiểm chứng được. **Không ghi số tỉ lệ.**
> Thứ duy nhất chắc chắn là **cơ chế bảo hiểm (pity) 10 lần** của EDF Supplies và **giảm giá gói 10**.

**Ba luật gacha rút được, đều dùng được cho `deepcore`:**
1. **Pity đếm được** ("10 lần chắc chắn có Excellent") — biến may rủi thành **thanh tiến độ**.
2. **Wishlist** — người chơi **chọn trước** cái mình muốn, nên cú mở nào cũng "gần trúng".
3. **Gói 10 rẻ hơn 10 lần lẻ** — đẩy hành vi về phía mở loạt, và loạt thì tạo khoảnh khắc.

---

## 4. Vì sao "nâng ngoài ván" làm game dễ đi

Đây là câu hỏi trung tâm của cả phần A. Survivor.io giải nó bằng **bốn trục sức mạnh vĩnh viễn
chồng lên nhau**, tất cả đều **cộng thẳng vào chỉ số của ván sau**:

| Trục | Nội dung | Nguồn tài nguyên |
|---|---|---|
| **1. Cấp độ trang bị** | 6 ô, mỗi ô một thanh cấp | Gold + Design |
| **2. Bậc hiếm trang bị** | Merge → tăng trần cấp, tăng chỉ số nền, **mở thêm Skill nội tại** | Đồ trùng (từ gacha) |
| **3. Bảng Evolution** | Thang leo mua vĩnh viễn: **Strength (ATK), Stamina (HP), Tenacity (Armor), Restoration (Meat Heal)** ở cột trái; **kỹ năng đặc biệt** ở cột phải | Gold (trái) + Evo DNA (phải) |
| **4. Tech Parts / Pets / Astral Forge** | Chỉ số cộng thêm + **sửa đổi cơ chế kỹ năng** | Daily Challenge, gem, salvage |

`[NGUỒN]` bảng Evolution 4 chỉ số và hai cột:
https://www.bluestacks.com/blog/game-guides/survivor-io/sio-beginner-guide-en.html và
https://mturbogamer.com/2022/09/survivor-io-how-to-get-key-evolution-gold-dna/

### 4.1 Cơ chế tâm lý: chết là một bước tiến, không phải một thất bại

> "Giống Vampire Survivors, cái chết là không tránh khỏi trong Survivor.io, nhưng nó cũng là
> **một phần thiết yếu của tiến độ**: mỗi lần chết bạn kiếm được tiền và EXP để mở khoá trang bị,
> nâng cấp và cộng chỉ số vĩnh viễn."
> `[NGUỒN]` https://www.thegamer.com/vampire-survivors-rip-off-survivor-io-mobile-clone-copy-cat/

Và nói thẳng ra tác dụng của merge:

> Cơ chế ghép trang bị "**xử lý được vấn đề trần sức mạnh** — thứ thường khiến các game cùng thể
> loại hoặc quá dễ hoặc quá khó — bằng cách cho bạn trang bị món đồ và **nhận buff vĩnh viễn thụ động**."
> `[NGUỒN]` cùng bài trên.

### 4.2 Vòng lặp thật sự

```
Thua ải N
   ↓
Vẫn nhận gold + EXP + Design + rơi vặt          ← thua KHÔNG bằng không
   ↓
Nâng cấp độ trang bị / mua nấc Evolution        ← ATK, HP, Armor tăng thật
   ↓
Vào lại ải N với chỉ số cao hơn
   ↓
Qua ải — mà KHÔNG cần chơi giỏi hơn
```

**Đây chính là điều làm game "dễ đi":** người chơi **không bao giờ bị chặn hẳn**. Nếu kỹ năng
không đủ thì **thời gian** đủ. Ải khó là **hàng rào thời gian**, không phải hàng rào kỹ năng.
Cùng lúc đó nó là **động cơ kiếm tiền** — người không muốn chờ thì trả tiền để nhảy qua hàng rào.

Habby xây tầng kiếm tiền theo đúng thứ tự ấy — mở dần từng lớp một, chứ không dội hết vào mặt
người chơi mới:

> "Survivor.io không dội mọi thứ vào bạn ở cấp 1. Thay vào đó nó **mở từng yếu tố kiếm tiền một**,
> đi kèm với các vòng lặp chơi và hoạt động mới, đảm bảo bạn đã nghiện cái vui **trước khi** cảm
> thấy ma sát của paywall."
> `[NGUỒN]` https://www.gamigion.com/survivor-io-the-progressive-monetization-masterclass/

Bốn lớp mà bài đó bóc ra: (1) quảng cáo trợ giá energy/tiền mềm ở early loop; (2) lớp hiệu suất —
**Quick Patrol bỏ qua 300 phút cày**, đánh vào *hyperbolic discounting* (thích phần thưởng ngay);
(3) lớp đầu tư — **heo đất gem** khai thác *endowment effect* (gem "đã kiếm được" rồi mới trả
tiền để đập heo); (4) lớp giữ chân — gói shop ngày/tuần mở bằng quảng cáo, tạo thói quen điểm danh.

### 4.3 Con số cụ thể tìm được

Rất ít số công khai đáng tin. Những gì chắc:
- **Astral Forge**: ~**15% ATK/HP** ở nấc 1 sao, ~**20%** ở nấc 2 sao.
  `[NGUỒN]` https://www.allclash.com/survivor-io-astral-forge-guide/
- **Merge một bậc** cần nhân đôi số đồ ở mỗi nấc (2 → 4 → 8 …), nên **chi phí lên bậc là hàm mũ**
  trong khi **lợi ích là tuyến tính-cộng-mốc** — đường cong cổ điển của F2P.
- **Energy 5/lượt trên trần 30** = 6 lượt/lần đầy, **10 giờ để hồi đầy** → khoảng **6–15 lượt/ngày**
  cho người chơi miễn phí (6 từ trần + 9 từ 3 lần xem quảng cáo).

*Không có bảng ATK/HP theo bậc nào kiểm chứng được. **Không bịa.***

### 4.4 Van đối trọng — chi tiết dễ bỏ sót

Survivor.io biết rằng "cứ cày là qua" sẽ làm chết cảm giác thành tựu, nên nó giữ một chế độ mà
**chỉ số hoàn toàn không tính**: **Mega Challenge** — "chỉ số của bạn sẽ không có ý nghĩa gì cả.
Nó hoàn toàn dựa vào kỹ năng của bạn và vào lựa chọn kỹ năng khi lên cấp."
`[NGUỒN]` https://writerparty.com/party/survivor-io-trials-guide-and-walkthrough/

**Bài học cho `deepcore`:** nếu meta-progression làm game dễ đi, hãy chừa **một chế độ chuẩn hoá**
để người chơi giỏi vẫn có chỗ chứng minh. Không thì người giỏi bỏ đi.

---

## 5. UI di động: bố cục để dựng lại

### 5.1 Màn hình chính (dọc)

Từ trên xuống, theo mô tả các nguồn:

```
┌─────────────────────────────────┐
│ [Energy ⚡30/30 +][Gold +][Gem +]│ ← thanh tài nguyên trên cùng, mỗi cái có nút "+"
│                                 │   bấm Energy → bảng "xem quảng cáo / đổi gem"
│ ▣ ▣ ▣  ← icon sự kiện xếp dọc   │
│         mép trái, có badge đỏ   │
│                                 │
│      NHÂN VẬT ĐỨNG GIỮA         │ ← khoe trang bị đang mặc, chiếm 40–50% chiều cao
│      (idle animation)           │
│                                 │
│           CHƯƠNG 12             │ ← tên/số chương hiện tại, có mũi tên ◀ ▶ đổi chương
│      ┌─────────────────┐        │
│      │  ▶  CHALLENGE   │        │ ← NÚT TO NHẤT MÀN HÌNH, giữa dưới,
│      │      -5 ⚡       │        │   chi phí IN THẲNG TRÊN NÚT
│      └─────────────────┘        │
│   [ Patrol / Quick Earnings ]   │ ← nút phụ ngay dưới, nhỏ hơn rõ rệt
│                                 │
│ ┌────┬─────┬────┬──────┬───────┐│
│ │Shop│Equip│Pet │Trials│Evolve ││ ← TAB ĐÁY, 5–6 tab, icon + chữ,
│ └────┴─────┴────┴──────┴───────┘│   mỗi tab có badge đỏ khi có việc chưa làm
└─────────────────────────────────┘
```

- Tab đáy: **icon đầu tiên bên trái là Shop**, kế bên là **Equipment** (mặc / tháo / merge),
  có **Patrol**, có **Trials**, và **"Evolve" nằm ngoài cùng bên phải**.
  `[NGUỒN]` https://www.talkandroid.com/24372-survivor-io-ultimate-game-guide-with-tips-2023/
- **Patrol nằm trên màn chọn ải**; nút thật ghi **"Quick Earnings"**.
  `[NGUỒN]` https://mturbogamer.com/2022/09/survivor-io-patrol-quick-patrol/
- **Màn hình Pet vào từ menu Equipment**, đánh dấu bằng **icon khẩu súng lục ở đáy màn**,
  và **bị khoá** cho tới khi qua đủ chương.
  `[NGUỒN]` https://www.pocketgamer.com/survivor-io/pets-guide/

### 5.2 Badge đỏ (red dot)

Đây là **đòn giữ chân rẻ nhất và mạnh nhất** của F2P di động: một chấm đỏ nhỏ chồng lên góc
icon, nói "có thứ chưa xem" mà không tốn một chữ nào.

- Định nghĩa mẫu: badge là "chỉ báo thị giác nhỏ, thường chồng lên phần tử cha, truyền đạt
  trạng thái hoặc hoạt động **chỉ bằng một cái liếc**."
  `[NGUỒN]` https://mobbin.com/glossary/badge
- Vị trí chuẩn: **góc của phần tử cha** — icon app, **tab điều hướng**, bước onboarding.
  `[NGUỒN]` https://www.setproduct.com/blog/badge-ui-design
- **Cảnh báo nghề nghiệp — "Red Dot Blindness":** dùng quá tay thì người dùng **ngừng nhìn thấy**
  chấm đỏ. Khuyến nghị: dùng badge tối / nhạt cho thông báo ít quan trọng.
  `[NGUỒN]` https://www.braze.com/resources/articles/beware-red-dot-badging

`[ĐỀ XUẤT]` cho `deepcore`: **chỉ 3 hạng badge** — (a) chấm đỏ = *có thứ MIỄN PHÍ đang chờ nhặt*;
(b) chấm đỏ có số = *đếm được bao nhiêu cái*; (c) **không badge cho bất cứ thứ gì phải trả tiền**.
Đừng gắn badge lên shop. Người chơi sẽ học được rằng chấm đỏ = quà, và sẽ luôn bấm.

### 5.3 Màn hình gacha / rương

Mẫu Survivor.io:
- **Ba–bốn rương xếp dọc**, mỗi rương một thẻ (card) chiếm chiều ngang màn hình.
- Mỗi thẻ có: hình rương, **danh sách bậc hiếm có thể ra**, **hai nút — "×1" và "×10"** với giá
  gem in thẳng trên nút, và **giá ×10 rẻ hơn 10× giá ×1** (300 → 2 680).
- **Thanh pity hiển thị được**: "còn N lần nữa chắc chắn ra Excellent".
- **Wishlist**: nút riêng, mở ra lưới chọn món mong muốn.

`[NGUỒN]` 300 / 2 680: https://onechilledgamer.com/survivor-io-equipment-guide/
`[NGUỒN]` bảo hiểm 10 lần: https://onechilledgamer.com/survivor-io-guide-and-tips-for-beginners/
`[NGUỒN]` wishlist: https://www.instagram.com/survivor_io/p/Cr6TTxfPi6o/

### 5.4 Màn hình trang bị

```
┌─────────────────────────────────┐
│ ← Trang bị           Power 12,340│
│  ┌────┐   NHÂN VẬT   ┌────┐     │ ← 6 ô xếp hai cột hai bên nhân vật (3 trái + 3 phải)
│  │Vũ khí│   (giữa)   │Dây │     │   mỗi ô: KHUNG MÀU THEO BẬC + số cấp ở góc dưới
│  ├────┤              ├────┤     │
│  │Giáp│              │Găng│     │
│  ├────┤              ├────┤     │
│  │Giày│              │Đai │     │
│  └────┘              └────┘     │
│                                 │
│  ┌───────────────────────────┐  │
│  │ Túi đồ — lưới 4 cột       │  │ ← đồ chưa mặc, sắp theo bậc giảm dần
│  │  ▣ ▣ ▣ ▣                  │  │   góc mỗi ô: chấm đỏ nếu MERGE ĐƯỢC NGAY
│  │  ▣ ▣ ▣ ▣                  │  │
│  └───────────────────────────┘  │
│  [ Merge ] [ Astral Forge ] [Rã]│ ← Astral Forge là NÚT BÊN TRONG màn Merge
└─────────────────────────────────┘
```

- Astral Forge vào qua **tab Equipment → Merge → nút "Astral Forge"**.
  `[NGUỒN]` https://www.allclash.com/survivor-io-astral-forge-guide/
- Merge: "vào khu trang bị và **chạm nút merge**", rồi chọn một hoặc nhiều món để ghép.
  `[NGUỒN]` https://simplegameguide.com/merge-equipment-gear-survivor-io/

### 5.5 Sáu luật UI rút ra, dùng thẳng cho `deepcore`

1. **Một nút to duy nhất.** Màn hình chính chỉ có **một** hành động chính. Mọi thứ khác nhỏ hơn
   rõ rệt. Người chơi mở game 30 giây và không được phép phân vân.
2. **Chi phí in trên nút**, không giấu trong popup.
3. **Tab đáy ≤ 6**, icon + chữ, luôn hiện — vì ngón cái ở dưới màn hình.
4. **Badge đỏ chỉ cho việc miễn phí.**
5. **Màu = bậc hiếm**, ở mọi nơi, không ngoại lệ. Xám / lục / lam / tím / vàng / đỏ. Người chơi
   đọc sức mạnh bằng mắt ngoại vi.
6. **Đừng đặt tên nút khác với tên hệ thống.** Bài học "Quick Patrol" vs. "Quick Earnings" —
   một chữ sai làm cả một hệ thống trở nên vô hình.

### 5.6 Ghi chú riêng: hệ **Pet** của Survivor.io — tiền lệ gần nhất với `deepcore`

Survivor.io đã có sẵn một hệ pet, và cấu trúc của nó đáng chép:

- **Một pet CHÍNH ra trận** (hiện trên bản đồ), cộng **các pet PHỤ (Assist) không hiện hình**
  nhưng vẫn góp kỹ năng. Đây là cách nhồi nhiều pet vào tiến độ mà **không làm rối màn hình**.
- **Ba loại kỹ năng mỗi pet:**
  - **Deploy Skill** — kỹ năng chiến đấu, chỉ chạy khi pet đó là pet chính. Mỗi pet có sẵn một cái.
  - **Assist Skill** — mở ngẫu nhiên khi pet đạt bậc *Better*; chỉ chạy khi pet làm phụ; thường
    **buff cho pet chính**.
  - **Quality Skill** — mở theo bậc chất lượng.
- **Trần cấp của pet phụ thuộc bậc chất lượng**, y hệt trang bị.
- Ví dụ Deploy Skill có thật (8 pet): **Murica** (đại bàng) triệu lốc xoáy diện rộng;
  **Cheshire** (mèo) cào cận chiến hồi chiêu nhanh; **Rex** (chó) gây sát thương âm thanh theo
  vùng ở tầm xa; **Shelly** (rùa) phóng mình đập xuống tạo sóng xung kích; **Neemo** (cá) bắn
  bong bóng nổ khi chạm; **Crabobble** (cua) bắn đạn nước xuyên nhiều mục tiêu; **DD-6** (drone)
  nhiều tia laser sát thương cao quanh mình; **Croaky** (ếch) phun axit đọng lại gây DoT.

`[NGUỒN]` https://www.pocketgamer.com/survivor-io/pets-guide/
`[NGUỒN]` https://onechilledgamer.com/survivor-io-pet-guide/

**Bài học lớn nhất cho `deepcore`:** *chính / phụ*. `deepcore` cho người chơi mang **nhiều
pet-vũ khí** — nếu tất cả đều hiện hình thì màn hình dọc sẽ vỡ. Mô hình "1 hiện + N ẩn góp buff"
là lời giải đã được kiểm chứng trên đúng loại màn hình này.

---

# PHẦN B — Class Summoner / Minion trong ARPG

> **Cảnh báo quan trọng trước khi đọc số:** **không một ARPG lớn nào công bố bán kính leash hay
> aggro bằng đơn vị game.** Tooltip chỉ mô tả định tính ("targeting range raised to a minimum
> value"). Những đơn vị tuyệt đối duy nhất tìm được trong toàn bộ nghiên cứu này là:
> PoE totem placement **85 unit**, PoE Stone Golem slam **~20 unit**, D3 Sentry Polar Station
> **16 yard**, D3 Kill Command **15 yard**. Mọi con số bán kính trong PHẦN C vì thế đều là
> `[ĐỀ XUẤT]` — **không có tiền lệ công khai để chép**.
>
> Ngoài ra: `poewiki.net` và toàn bộ Fandom **chặn truy cập tự động** (Anubis / HTTP 402) ở thời
> điểm viết. Số liệu PoE dưới đây lấy từ **poedb.tw** (mirror dữ liệu game, đáng tin) và
> **forum chính thức pathofexile.com**.

---

## 6. AI của minion

### 6.1 Hệ "stance" — ba cách làm, ba triết lý

**Path of Exile 1 — không có UI stance; stance đến từ support gem.** Và điểm thiết kế đắt nhất
là: **stance được mô hình hoá như một MODIFIER cộng lên biến `targetingRange`, không phải một enum.**

- **Feeding Frenzy Support**: `"Minions from Supported Skills are Aggressive"` — và dòng giải
  thích trong ngoặc của chính game: `"(Aggressive minions have their targeting range raised to a
  minimum value)"`.
  `[NGUỒN]` https://poedb.tw/us/Feeding_Frenzy_Support
- **Meat Shield Support**: `"Defensive minions have their targeting range lowered to a maximum
  value. They always target enemies around you"`.
  `[NGUỒN]` https://poedb.tw/us/Meat_Shield_Support
- Diễn giải hành vi: "Aggressive minion sẽ tập trung tấn công bất kỳ kẻ địch nào trong tầm aggro
  **và sẽ không di chuyển theo người chơi**. Defensive minion sẽ tập trung ở gần người chơi và
  **chỉ đánh kẻ địch gần người chơi**."
  `[NGUỒN]` https://www.vhpg.com/poe-aggressive-minions/
- **Bằng chứng rằng nó là số, không phải enum:** hai gem này **triệt tiêu lẫn nhau** —
  "nó sẽ khử nhau (điều này có ích nếu ai đó muốn lấy cơ hội Taunt từ Meat Shield mà vẫn giữ
  minion aggro ở tầm bình thường bằng Feeding Frenzy)". (cùng nguồn vhpg)

**Grim Dawn — hệ stance rõ ràng nhất, 3 nấc, đổi bằng right-click lên icon pet.**
Văn bản chính thức từ guide của Crate Entertainment:

> **Normal Stance** là mặc định khi pet được triệu hồi. Nó cân bằng giữa Defensive và Aggressive.
> **Defensive Stance** buộc pet **ở gần bạn** và khiến nó **đánh bất cứ thứ gì tấn công bạn**.
> **Aggressive Stance** cho phép pet **đi lang thang và đánh bất cứ thứ gì lọt vào TẦM NHÌN của nó**.
> Nó sẽ chủ động đi tìm mục tiêu, **kể cả những mục tiêu chưa tấn công bạn**.

`[NGUỒN]` https://www.grimdawn.com/guide/gameplay/combat/

Ba câu này chứa **ba trục khác nhau**, đáng tách ra khi thiết kế:
Defensive = *bám chủ + phản đòn*; Aggressive = *lang thang + line-of-sight + chủ động*; Normal = ở giữa.

**Last Epoch — 2 chế độ bật/tắt được (thêm ở Season 3):**
- **Protect**: minion ở gần người chơi, ưu tiên mục tiêu gần **người chơi**.
- **Assassinate**: "minion ưu tiên đánh mục tiêu gần **chính chúng**, đặc biệt là boss và quái
  rare, và **không quay về chỗ người chơi trừ khi ở rất xa**"; "nhắm kẻ địch từ khoảng cách xa hơn".

`[NGUỒN]` https://support.lastepoch.com/hc/en-us/articles/46361899830555-Minions ;
https://maxroll.gg/last-epoch/news/minion-changes-and-quality-of-life-in-season-3

**Diablo 4 — KHÔNG có stance, KHÔNG có lệnh thủ công.** Minion tự chọn mục tiêu theo khoảng cách.
Đây cũng là than phiền lớn nhất của cộng đồng D4 về minion ("crappy leash range that breaks too
easily"). `[NGUỒN]` https://us.forums.blizzard.com/en/d4/t/minion-command-targeting-uicontroller-mapping/158495

**Diablo 2** — không có stance. **Titan Quest** — có chế độ aggressive nhưng AI bị chê nặng:
"Lich AI đôi khi tấn công, nhưng phần lớn thời gian **đứng nhìn người chơi chết từ từ ngay cả ở
chế độ aggressive**"; quản pet giống "chăn mèo".
`[NGUỒN]` https://steamcommunity.com/app/475150/discussions/0/343786195660601366/

### 6.2 Lệnh thủ công — bốn cách giải

| Game | Cơ chế | Chi tiết chính xác |
|---|---|---|
| **D3 Necromancer** | `Command Skeletons`, tốn 50 Essence | "Ra lệnh cho minion xương tấn công mục tiêu và **tăng 50% sát thương của chúng lên mục tiêu đó**." Passive: "Dựng xương lên khỏi mặt đất **mỗi 2 giây**, tối đa **7 skeleton**." Rune: Frenzy (**+25% tốc đánh** khi được lệnh); Dark Mending ("minion xương **hồi cho bạn 0,5% máu tối đa mỗi đòn** trong lúc được ra lệnh"); Freezing Grasp (đóng băng mục tiêu 3 s); Kill Command (skeleton nổ, **215% weapon damage trong 15 yard**) |
| **PoE 2** | `Direct Minions` | "Chỉ đạo minion vĩnh viễn của bạn tấn công một mục tiêu hoặc di chuyển tới một vị trí." **Cooldown 0,50 giây**, instant, dùng được khi đang chạy. Cooldown 0,5 s **được THÊM vào ở patch 0.2.0** (trước đó không có) |
| **Last Epoch** | `Minion Attack Command`, mặc định phím **A** | "Bạn có thể bảo minion nhắm kẻ địch dưới con trỏ... **Nếu không có kẻ địch ở vị trí bạn chỉ, minion sẽ di chuyển tới đó rồi mới chọn mục tiêu mới**." |
| **Grim Dawn** | `Pet Attack` trên hotbar + **F2–F7** cho pet đã chọn | "ra lệnh cho chúng từ xa" |
| **PoE 2** (nâng cao) | **Lệnh RIÊNG theo từng loại minion** | Skeletal Brute → `Shattering Roar` (warcry, Intimidate, tiêu Freeze để nổ); Skeletal Sniper → `Command: Gas Arrow` (**CD 6 s**); Skeletal Storm Mage → `Command: Death Storm`; Skeletal Reaver → `Command: Enrage`; Skeletal Frost Mage → `Ice Armour`. Một số minion **miễn nhiễm lệnh**: "Raging Spirits... tấn công nhanh, **bỏ qua mọi lệnh**" |
| **D4** | Gần nhất là **Golem làm cờ chỉ mục tiêu** | Patch 2.5 chính thức: "**Nếu chiêu chủ động của Golem nhắm vào một kẻ địch, Skeletal Warriors và Mages của bạn sẽ dồn đòn vào mục tiêu đó.**" |

`[NGUỒN]` https://us.diablo3.blizzard.com/en-us/class/necromancer/active/command-skeletons ;
https://poe2db.tw/us/Direct_Minions ; https://www.pathofexile.com/forum/view-thread/3740562 ;
https://support.lastepoch.com/hc/en-us/articles/46361899830555-Minions ;
https://steamcommunity.com/app/219990/discussions/0/2287213008797767213/ ;
https://www.pathofexile.com/forum/view-thread/3826682 ;
https://news.blizzard.com/en-us/article/24244466/diablo-iv-patch-notes-2-5

**Bài học thiết kế:** D3 và Last Epoch **gắn phần thưởng cơ học vào lệnh** (+50% sát thương lên
mục tiêu được chỉ; mũi tên đỏ phản hồi), nên người chơi **có lý do bấm**. D4 không có lệnh — và
đó là than phiền lớn nhất của cộng đồng.

### 6.3 Khi chủ chạy xa — teleport / leash

**Đây là nguồn chính xác nhất tồn tại về chủ đề này.** Mark_GGG, developer của Grinding Gear
Games, trả lời trực tiếp trên forum:

> "Zombie sẽ **teleport** nếu nó cố đi theo bạn nhưng **không tìm được đường (pathfind fail)**,
> hoặc nếu bạn ở **xa hơn một khoảng cách nhất định**."
> "Nhưng **nếu nó đang trong giao tranh hoặc đang di chuyển thì lúc đó nó không đang cố tìm đường
> tới bạn**, và bạn có thể đi quá xa khỏi chúng ở thời điểm đó."
> "đôi khi bạn đi đủ xa để **chúng bị 'ru ngủ' (put to sleep) TRƯỚC KHI kịp teleport**"

`[NGUỒN]` http://www.pathofexile.com/forum/view-thread/38514/page/1

**Ba điều rút ra — đây là phần giá trị nhất của cả mục 6:**

1. Teleport có **hai trigger**: (a) pathfind thất bại, (b) vượt ngưỡng khoảng cách.
2. **Check leash chỉ chạy khi minion đang ở state "following".** Minion đang đánh nhau hoặc đang
   di chuyển tới mục tiêu **không chạy check đó** → **đây chính là gốc của cả một lớp bug "minion
   bị bỏ lại"**. Nếu viết state machine, phải cho check leash chạy ở **mọi** state.
3. Có cơ chế **"put to sleep"** (tắt entity ở xa) có thể **thắng** teleport check → minion biến
   mất luôn. Thứ tự ưu tiên giữa "sleep" và "leash-teleport" là **một quyết định thiết kế thật**,
   không phải chi tiết kỹ thuật.

**Các game khác:**

| Game | Cách xử lý | Nguồn |
|---|---|---|
| **PoE 1** | Teleport tự động (2 trigger trên) + `Convocation` recall thủ công (CD 3,00 s, hồi 2% máu/giây trong 2 s). **Không** áp dụng cho Raging Spirits, Skeletons, clone của Mirror/Blink Arrow | https://poedb.tw/us/Convocation |
| **Diablo 4** | Xác nhận chính thức có teleport, qua một dòng **bug fix** (patch 3.0.2): "...khi pet của bạn **thụ động teleport để đuổi kịp bạn**". Không có con số | https://news.blizzard.com/en-us/article/24271857/diablo-iv-patch-notes-3-0 |
| **Diablo 2** | "AI của Skeleton gần giống Mercenary... đôi khi **kẹt sau tường hoặc ở góc**. Nếu chúng lạc quá xa chủ, chúng sẽ **teleport tới đâu đó TRÊN MÀN HÌNH**." → **leash gắn với VIEWPORT**, không phải đơn vị world | https://diablo2.diablowiki.net/Necromancer_Summoning |
| **Grim Dawn** | Pet "tự ngắt giao tranh / teleport theo" khi chủ đi quá xa; **leash khác nhau theo loại pet** ("skeleton không đánh ở cùng tầm với các pet khác") | https://steamcommunity.com/app/219990/discussions/0/2425614361137955838/ |
| **Last Epoch** | **Chạy về, KHÔNG teleport**: "Minion tự động đánh kẻ địch và **sẽ chạy về phía người chơi nếu chúng tụt lại quá xa**." | https://support.lastepoch.com/hc/en-us/articles/46361899830555-Minions |
| **PoE 2** | Bỏ hẳn khái niệm "đuổi kịp" — dùng **Reviving**: "Reviving Minion hồi máu sau khi tránh được sát thương một lúc, và **tự hồi sinh sau một khoảng trễ ngắn khi bị giết**. Khoảng trễ này **reset mỗi khi một Reviving Minion khác chết**." | https://game8.co/games/Path-of-Exile-2/archives/498765 |

**Phản ví dụ có chủ đích — The Last of Us** (Naughty Dog, Game AI Pro 2, chương 35). Đáng trích
nguyên văn vì nó là lập luận *chống* teleport mạnh nhất từng được viết ra:

> "Chúng tôi quyết định **rất sớm là KHÔNG BAO GIỜ teleport bạn đồng hành** chỉ để giữ họ gần
> người chơi."
> Lý do: âm thanh (tiếng bước chân nhảy vị trí), và "**nếu người chơi chỉ cần thoáng nhận ra
> rằng có teleport đang xảy ra, cảm giác sẽ hơi kỳ và có thể phá vỡ sự tin tưởng vào thế giới**."
> "Rốt cuộc, lần duy nhất một buddy teleport là khi họ cần lập tức cứu người chơi khỏi một pha
> vật lộn cận chiến" — và **ngay cả lúc đó**, "trong lúc vật lộn, người chơi **không điều khiển
> được camera**, nên chúng tôi đảm bảo camera hướng về phía **không lộ ra cú teleport**."

`[NGUỒN]` http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter35_Ellie_Buddy_AI_in_The_Last_of_Us.pdf

**Kết luận thẳng cho `deepcore`:** teleport chỉ được phép **khi camera không nhìn thấy**. Với
game top-down thì gần như **không bao giờ giấu được** → ARPG buộc phải hoặc chấp nhận teleport
lộ liễu, hoặc **dùng một animation blink/chui đất có chủ ý** để biến cú cheat thành đặc điểm
nhân vật. `deepcore` chọn cách thứ hai (xem Giun Đào, mục 10.2).

### 6.4 Chọn mục tiêu (aggro / target selection)

Không game nào công bố thuật toán đầy đủ. Những gì có tài liệu:

- **PoE 1**: dựa trên `targetingRange` quanh **minion** (aggressive) hoặc quanh **người chơi**
  (defensive — "chúng **luôn** nhắm kẻ địch quanh bạn"). **Không** phải "kẻ mà chủ vừa đánh".
- **PoE 1 — aggro range là tham số RIÊNG theo từng loại minion**, không phải hằng số toàn cục:
  Holy Relic "có aggro range cao hơn trung bình đáng kể, được cho là để nó nhắm được bạn cho
  skill teleport của nó từ xa".
  `[NGUỒN]` https://poedb.tw/us/Minion
- **Last Epoch** — chi tiết nhất về thứ tự ưu tiên:
  - Protect: ưu tiên mục tiêu gần **người chơi**. Assassinate: ưu tiên mục tiêu gần **minion**,
    **ưu tiên boss và rare**.
  - Season 3 thêm **"sticky targeting"**: "Minion giờ nhắm mục tiêu **'dính' hơn**, nghĩa là chúng
    **giữ tập trung vào mục tiêu hiện tại thay vì đổi liên tục**... đặc biệt rõ ở chế độ Assassinate
    hoặc khi mục tiêu là boss hay quái rare."
  - **Ưu tiên skill nội bộ**: "một minion sẽ **ưu tiên dùng skill vừa hết cooldown** nếu nó có
    nhiều skill để chọn, với điều kiện có mục tiêu hợp lệ trong tầm."
  `[NGUỒN]` https://maxroll.gg/last-epoch/news/minion-changes-and-quality-of-life-in-season-3 ;
  https://support.lastepoch.com/hc/en-us/articles/46361899830555-Minions
- **D4**: theo khoảng cách; ghi đè bằng Golem active (patch 2.5). Cộng đồng phàn nàn minion
  "đánh vào rào chắn, mục tiêu bất tử, quái phụ giữa trận boss" — tức **không có bộ lọc loại mục tiêu**.
- **Grim Dawn**: Defensive = "đánh bất cứ thứ gì tấn công bạn" (**dựa trên phản đòn**);
  Aggressive = "bất cứ thứ gì lọt vào **tầm nhìn** của nó" (**dựa trên LOS**, không chỉ khoảng cách).

### 6.5 Khi mục tiêu chết thì làm gì

**Không game lớn nào có tài liệu chính thức mô tả rõ chuyện này.** Nguồn duy nhất mô tả cụ thể
một máy trạng thái đầy đủ là devlog của một game indie — dùng làm **mô hình tham khảo**, không
phải chuẩn AAA:

> "Minion có **3 trạng thái: idle, following và attacking**."
> "Ở trạng thái idle, chúng vừa **định kỳ (timer 0,5 giây)** kiểm tra khoảng cách tới người chơi,
> vừa bắn tia tới các quái trong tầm nhìn. Nếu tia trúng, chúng gán collider đó làm mục tiêu và
> chuyển sang attacking."
> "chúng sinh một đường đi tới người chơi và bám theo cho tới khi vào **khoảng cách mong muốn**
> (nên **không chạy đè lên người chơi**, chúng dừng sớm hơn một chút)"
> "có thể chuyển thẳng sang following nếu người chơi đi quá xa trong lúc đang attacking, nhưng
> **khoảng cách cần thiết cho điều kiện này LỚN HƠN NHIỀU so với khi ở trạng thái idle**."

`[NGUỒN]` https://alternalo.itch.io/alterworld/devlog/793904/lets-talk-about-minion-ai

**Hai kỹ thuật đáng chép nguyên:**
1. **Hysteresis** — ngưỡng bỏ trận khi *đang đánh* phải lớn hơn nhiều ngưỡng khi *đang rảnh*.
   Không có nó thì minion sẽ giật qua giật lại giữa đánh và đuổi.
2. **Quét lại mục tiêu bằng timer 0,5 s**, không phải mỗi khung hình. Rẻ, và tạo cảm giác
   "sinh vật cần một nhịp để nhận ra".

Last Epoch xử lý gián tiếp qua sticky targeting + lệnh move-to: "Nếu không có kẻ địch ở vị trí
bạn chỉ, minion sẽ di chuyển tới đó **rồi mới chọn mục tiêu mới**."

---

## 7. Phân vai minion — có ví dụ thật cho từng vai

### A. Tank / chặn đường / kéo aggro

| Game | Minion | Số liệu chính xác |
|---|---|---|
| **PoE 1** | **Summon Stone Golem** | "Triệu hồi Stone Golem cấp cho bạn hồi máu và phòng thủ. Ngoài đòn cận chiến, nó dùng cú lăn húc và **một cú đập mạnh có thể TAUNT kẻ địch**." Cú đập: **33% cơ hội Taunt khi trúng**, bán kính ~**20 unit**. Golem cấp cho chủ **(33–105) máu hồi mỗi giây** + **20% tăng Phòng thủ**. **Tối đa 1 golem.** |
| **PoE 1** | **Meat Shield Support** — biến *bất kỳ* minion nào thành tank | "Minion có **20% cơ hội Taunt khi trúng đòn**", minion nhận **ít hơn 15–24% sát thương**, gây **thêm 20–30% sát thương lên kẻ địch gần chủ**, **+10–29% tốc chạy** |
| **PoE 1** | **Animate Guardian** | "Làm sống dậy một vũ khí hoặc giáp, gắn nó vào một Guardian vô hình chiến đấu bên cạnh bạn." Lv20: **+38% máu tối đa**, **+38% sát thương**. **Chết là MẤT ITEM VĨNH VIỄN**: "Nếu Guardian của bạn chết, bạn không thể triệu hồi lại trong khu vực đó." |
| **D2** | **Clay Golem** | HP **100–765** theo cấp, **làm chậm 11–63%** cả khi đánh và khi bị đánh. Không cần xác. **Chỉ 1 golem bất kỳ loại nào cùng lúc.** Triệu hồi lại được ngay cả khi đang có, **không cooldown** |
| **D4** | **Golem** | Vừa tank vừa cờ chỉ mục tiêu: active cho **Unstoppable 3 giây** (tăng từ 1,5 s ở patch 2.5), **respawn timer 20 s → 10 s**. Patch 1.3.3: Golem "+30% sát thương đòn cơ bản, +20% máu" |
| **PoE 2** | **Skeletal Brute** | "Triệu hồi Skeletal Brute đánh mạnh, hồi sinh được, có thể **Stun** kẻ địch đã bị Primed và **Warcry theo lệnh**." **Lưu ý: đây là stun/intimidate, KHÔNG phải taunt** |
| **Grim Dawn** | **Briarthorn** (Shaman) | Cận chiến, di động, **chỉ 1 con cùng lúc** |
| **Titan Quest** | **Feral Wolves** (Nature) | Cận chiến, "lá chắn thịt". **2 sói ở skill level 7, 3 sói ở level 18** (cần trang bị +skill) |

`[NGUỒN]` https://poedb.tw/us/Summon_Stone_Golem ; https://poedb.tw/us/Meat_Shield_Support ;
https://poedb.tw/us/Animate_Guardian ; https://classic.battle.net/diablo2exp/skills/necromancer-summoning.shtml ;
https://maxroll.gg/d2/guides/summoner-necromancer-guide ;
https://news.blizzard.com/en-us/article/24244466/diablo-iv-patch-notes-2-5 ;
https://poe2db.tw/us/Skeletal_Brute ; https://www.grimdawn.com/guide/classes/shaman/ ;
https://steamcommunity.com/app/475150/discussions/0/343786195660601366/

### B. Tầm xa / DPS

| Game | Minion | Số liệu |
|---|---|---|
| **D2** | **Raise Skeletal Mage** | Thang số lượng y hệt skeleton: **1 → 8 con** (8 con ở skill level 18+). Mỗi mage có một hệ ngẫu nhiên (độc / lạnh / lửa / sét) và **kháng cao với chính hệ đó** |
| **D2** | **Raise Skeleton** (cận chiến, để so thang cap) | 1 (Lv1), 2 (Lv2), 3 (Lv3–5), 4 (Lv6–8), **+1 mỗi 3 cấp**, tới **8 ở cấp 18+**. Sát thương 1-2 → 37-39 |
| **PoE 2** | **Skeletal Sniper / Storm Mage / Frost Mage** | Sniper: `Command: Gas Arrow` CD **6 s**. Storm Mage: `Command: Death Storm` **154-551 tới 873-3121** |
| **D4** | **Skeletal Mages** (Shadow / Cold / Bone-Sacrifice) | Patch 1.3.3: mỗi loại "+20% sát thương, +10% máu"; Sacrifice Mage: thời lượng Vulnerable lên **8 giây** |
| **D3 Witch Doctor** | **Zombie Dogs / Gargantuan** | Gargantuan: **CD 60 s**, **450% weapon damage**. Cả hai có hồi máu thụ động + **Force Armor** (chặn trần sát thương nhận) và **chỉ nhận 10% từ phần lớn AoE** |

`[NGUỒN]` https://classic.battle.net/diablo2exp/skills/necromancer-summoning.shtml ;
https://www.pathofexile.com/forum/view-thread/3826682 ;
https://www.gameleap.com/articles/diablo-4-season-3-update-1-3-3-patch-notes-the-gauntlet-minion-buffs-vampiric-powers ;
https://www.diablofans.com/builds/88355-diablo-3-2-4-1-best-witch-doctor-pet-build-and

### C. Caster hỗ trợ — buff chủ hoặc buff minion khác

Đây là vai **quan trọng nhất cho `deepcore`**, nên ghi chi tiết:

| Game | Minion | Số liệu chính xác |
|---|---|---|
| **PoE 1** | **Summon Carrion Golem** — ví dụ chuẩn mực nhất | "Triệu hồi Carrion Golem **cấp sát thương vật lý cộng thêm cho các minion không-phải-golem** của bạn... và **gây thêm sát thương theo số minion không-phải-golem ở gần nó**." Số chính xác: `"Golems grant (7—27) to (11—41) additional Physical Damage for Non-Golem Minions"` và `"Golems deal 5% more Damage per Non-Golem Minion near them, up to 50%"` → **cap ở 10 minion**. Cast 1,00 s, CD 6,00 s |
| **PoE 1** | **Summon Stone Golem** (buff về phía CHỦ) | `"Golems grant (33—105) Life Regenerated per second"` + `"Golems grant 20% increased Defences"` (Armour, Evasion, ES) **cho người chơi** |
| **PoE 1** | **Ancestral Protector** (totem buff) | `"(10—20)% more Attack Speed while Totem is Active"`, totem sống **12 giây**, đặt trong bán kính **85 unit** quanh chủ. **Buff KHÔNG cộng dồn khi có nhiều totem** |
| **D2** | **Blood Golem** | Hút máu **chia sẻ**: **golem nhận 70%, necromancer nhận 30%**. HP 201, hút máu 86–138% |
| **D2** | **Summon Resist** | "Nâng kháng nguyên tố của Minion." **+28% → +66%** toàn kháng |
| **D2** | **Skeleton Mastery / Golem Mastery** | Skeleton Mastery: **+8 HP và +2 sát thương mỗi cấp**. Golem Mastery: HP **+20% → +400%**, tốc độ **+6% → +33%** |
| **D4** | **Golem** làm điều phối | "Nếu chiêu chủ động của Golem nhắm một kẻ địch, Skeletal Warriors và Mages sẽ **dồn đòn vào mục tiêu đó**" |
| **Last Epoch** | **Dread Shade** | Buff đặt lên **MỘT minion cụ thể** bằng con trỏ. Vấn đề UX đã được ghi nhận: "ngay cả khi con trỏ tôi đang sáng lên ở Wrathlord... tôi vẫn có thể đưa buff nhầm sang một minion khác gần đó", và "**một cú click nhầm như thế trừng phạt rất nặng**" |

`[NGUỒN]` https://poedb.tw/us/Summon_Carrion_Golem ; https://poedb.tw/us/Summon_Stone_Golem ;
https://poedb.tw/us/Ancestral_Protector ; https://classic.battle.net/diablo2exp/skills/necromancer-summoning.shtml ;
https://news.blizzard.com/en-us/article/24244466/diablo-iv-patch-notes-2-5 ;
https://forum.lastepoch.com/t/necromancer-minion-targeting/69561

**Ghi chú cho `deepcore`:** bài học Dread Shade là **cảnh báo trực tiếp**. Buff-nhắm-thủ-công
trên màn hình cảm ứng dọc sẽ **click nhầm liên tục**. Vì thế Trống Đá ở mục 10.2 buff **toàn
đội**, không nhắm ai cả.

### D. Healer minion — CÓ, và có 5 ví dụ thật

Đây là câu trả lời cho câu hỏi "ARPG nào thực sự có minion hồi máu": **có, và PoE làm chuẩn nhất.**

| Game | Minion | Số liệu chính xác |
|---|---|---|
| **PoE 1 — Summon Holy Relic** (healer thuần tuý nhất trong ARPG) | "Triệu hồi một Holy Relic **ở gần bạn**. **Khi bạn đánh trúng kẻ địch bằng một đòn attack**, Holy Relic kích hoạt một nova có cooldown ngắn, gây sát thương vật lý cho kẻ địch **và cấp hồi máu cho đồng minh** trong vùng quanh nó." Cấp 20: **154,6 máu/giây cho đồng minh; 985 máu/giây cho minion**. Nova **CD 0,3 giây**; thời lượng hồi **4 giây**, làm mới mỗi khi bạn đánh. **Tối đa 1 relic. Không thể bị nhắm trực tiếp, miễn nhiễm hiệu ứng mặt đất**, `"Minions cannot Taunt Enemies"`. Có skill nội bộ `RelicTeleport` để tự đổi chỗ |
| **PoE 2 — Skeletal Cleric** | "Triệu hồi Skeletal Cleric hồi sinh được, **chữa cho minion khác VÀ hồi sinh Skeleton đã ngã**." Hai hành động: `Revive Skeleton` — **CD 5 giây**, cast **1,2 giây**; `Heal` — cast **1 giây**, hồi **12,93 máu/giây**. Quality: "Skeleton được hồi sinh **miễn nhiễm sát thương (0–3) giây** sau khi hồi sinh" |
| **Grim Dawn — Wendigo Totem** | "Totem sẽ hút sinh lực của kẻ thù gần đó, đồng thời **tạo một luồng khí xoa dịu chữa lành cho đồng minh**." Bất động |
| **D3 Necromancer — rune Dark Mending** | "Minion xương sẽ **hồi cho BẠN 0,5% máu tối đa mỗi đòn trúng** trong lúc đang được ra lệnh" (minion heal **chủ**, và chỉ khi đang được lệnh) |
| **D2 — Fire Golem** | "Một Golem lửa **dùng sát thương lửa để tự chữa lành**." Hấp thụ **36–88%** sát thương lửa thành máu (tự hồi, không hồi cho chủ) |

`[NGUỒN]` https://poedb.tw/us/Summon_Holy_Relic ; https://poe2db.tw/us/Skeletal_Cleric ;
https://www.grimdawn.com/guide/classes/shaman/ ;
https://us.diablo3.blizzard.com/en-us/class/necromancer/active/command-skeletons ;
https://classic.battle.net/diablo2exp/skills/necromancer-summoning.shtml

**Chi tiết vàng của Holy Relic:** nó chỉ phát nova **khi CHỦ đánh trúng**. Tức healer bị buộc
vào hành động của người chơi. `deepcore` không cho người chơi đánh, nên phải đổi điều kiện —
nhưng nguyên tắc "**healer chỉ hoạt động khi người chơi làm đúng một việc gì đó**" thì giữ được
(Nấm Thở bám chủ trong 45 px; đi lạc là mất hồi).

### E. Totem / turret đứng yên

| Game | Đơn vị | Số liệu |
|---|---|---|
| **D3 Demon Hunter — Sentry** | "Triệu hồi một tháp pháo bắn kẻ địch gần đó, **280% weapon damage. Kéo dài 30 giây**." **Tối đa 2 turret cùng lúc**, hồi charge mỗi **8 giây**, tích tối đa **2 charge**. Runes: Spitfire (tên lửa dò tìm 120% lửa); **Chain of Torment** (**300% sát thương/giây** cho tia nối giữa bạn và các turret); **Polar Station** (làm lạnh trong **16 yard**, **-60% tốc chạy**); **Guardian Turret** (khiên **giảm 25% sát thương** cho đồng minh — turret kiêm aura) |
| **PoE 1 — Totems** | Bất động; `Multiple Totems Support` tăng số totem đồng thời. **Totem KHÔNG phải minion** — nhiều support gem ghi rõ "không thể sửa đổi skill của minion" |
| **Grim Dawn** | **Wendigo Totem** bất động (hồi máu + hút máu). **Wind Devils** thì **di động**, không cố định |

`[NGUỒN]` https://us.diablo3.blizzard.com/en-us/class/demon-hunter/active/sentry ;
https://poedb.tw/us/Totem ; https://www.grimdawn.com/guide/classes/shaman/

> **Không xác nhận được — đừng trích:** Last Epoch `Summon Sentinel` (lastepochtools và LE wiki
> đều chặn fetch); D2 Amazon Valkyrie **không phải totem** (nó là minion di động) — đừng dùng
> làm ví dụ; Grim Dawn `Storm Totem` không có trong guide chính thức đã đọc được.

### F. Aura minion — bám chủ và cấp buff thụ động

- **PoE 1 — Animate Guardian mặc giáp có aura**: "các bonus máu, tăng tốc đánh, **và aura đều
  hoạt động bình thường**" trên trang bị của Guardian. Đây là aura-minion thật và là một
  archetype build nổi tiếng. Nhưng: "nó **không thể dùng skill do item cấp**".
  `[NGUỒN]` https://poedb.tw/us/Animate_Guardian
- **PoE 1 — Stone Golem**: aura ngầm — **chỉ cần nó CÒN SỐNG** là chủ được +20% Phòng thủ và
  +33–105 hồi máu/giây. Đây là mô hình aura-minion đơn giản nhất: buff gắn vào điều kiện
  `golem alive`. **Đây chính là mô hình `deepcore` nên dùng cho pet "trợ chiến" vô hình.**
- **PoE 1 — Carrion Golem**: aura buff cho các minion **khác** (mục C).
- **D3 — rune Guardian Turret**: turret phát khiên **-25% sát thương nhận** cho đồng minh.
- **PoE — Herald of Purity**: minion **sinh ra từ một aura của chính người chơi** — "skill này
  sẽ triệu hồi một Sentinel of Purity, **hoặc làm mới thời lượng và máu của con đang có** nếu bạn
  đã đạt số tối đa".
  `[NGUỒN]` https://poedb.tw/us/Minion

> **Không khẳng định:** Grim Dawn `Guardian of Empyrion` — guide chính thức **không** xác nhận
> nó có aura.
## 8. Vì sao summoner "dễ chơi" — và thiết kế nào giữ cho nó không nhàm

### 8.1 "Dễ" đến từ đâu — ba dịch chuyển, không phải từ sát thương

Summoner không mạnh hơn class khác. Nó **dễ hơn** vì ba thứ bị gỡ khỏi tay người chơi:

**(a) Aggro dời khỏi người chơi.** Đây là gốc rễ. Phân tích Summonmancer của D2 nói thẳng:
build này "**hầu như không bao giờ là tâm điểm của aggro. Thay vào đó là bộ xương, revive và
golem của nó**". Kết quả: người chơi "có thể cứ lơ ngơ đi nhặt vàng và đồ trong khi lũ xương
chém sạch mọi thứ ngu ngốc".
`[NGUỒN]` https://lilura1.blogspot.com/2021/02/Diablo-2-Resurrected-Summonmancer-Necromancer-Skeleton-Summoner-Summon-Necro-Best-Build.html

**(b) Không cần nhắm — trục kỹ năng "aim + timing" biến mất.** Guide Spectre Summoner của
PoE Vault chỉ dẫn duy nhất một câu về cách chơi: "**Đừng đứng ăn đòn boss, hãy né, và để minion
chịu đòn thay**." Toàn bộ kỹ năng người chơi thu về **né và đứng đúng chỗ**.
`[NGUỒN]` https://www.poe-vault.com/guides/the-spectre-summoner-build-guide
Guide Minion Army Necro thì tả nguyên văn: "**Khi chạy map build này đi rất nhanh, và minion
làm toàn bộ công việc. Triệu hồi Skeleton rồi ngồi xem chúng phá huỷ mọi thứ.**"
`[NGUỒN]` https://www.poe-vault.com/guides/minion-army-necro-build-guide

**(c) Sát thương là hàm của build, không phải hàm của thao tác.** Diablo 4 nói rõ nhất:
"**Minion nhận 100% chỉ số mà bạn nhận. Tăng damage, tốc đánh v.v. — minion thừa hưởng hết.**"
Chơi hay hay dở gần như không đổi DPS.
`[NGUỒN]` https://maxroll.gg/d4/resources/necromancer-book-of-the-dead

Trường hợp cực đoan nhất, từ diễn đàn Last Epoch: một người chơi lâu năm nói bạn "**hoàn toàn
100% có thể chơi mà KHÔNG bấm một nút nào với build minion nếu muốn (chỉ là sẽ không mạnh bằng)**".
Người khác trong cùng thread gọi đó là "build một tay" và "Summoner khá bị động cho tới late game".
`[NGUỒN]` https://steamcommunity.com/app/899770/discussions/0/3824161508138483678

### 8.2 Và cái giá phải trả — chính các guide thừa nhận

Bảng Pros/Cons của guide Skelemancer D2R gần như là bản mô tả bệnh án:
- Ưu: "Dễ chơi và rất hiệu quả"; "Rất an toàn"
- Nhược: "Tốc độ dọn map không tuyệt vời"; "**Có thể rất chán nếu bạn thích build chủ động hơn**";
  và mục nhược điểm thứ ba họ ghi đúng ba chữ: "**AI...**" — tức lỗi AI minion là chuyện ai
  cũng ngầm hiểu, không cần giải thích.
`[NGUỒN]` https://odealo.com/articles/skeleton-summon-necromancer-d2r-build

Đây là bài toán trung tâm của `deepcore`, vì `deepcore` **không cho người chơi tự đánh chút nào**.
Nó bắt đầu từ đúng cái điểm mà các game kia coi là nhược điểm.

### 8.3 Bảy cần gạt tạo CHIỀU SÂU — tất cả đã kiểm chứng trong game thật

#### Cần gạt 1 — **Vị trí đứng trở thành một chỉ số**

Kỹ thuật đẹp nhất tìm được. **Meat Shield Support (PoE)** đổi hành vi minion sang phòng thủ
("bám sát chủ và ưu tiên đánh kẻ địch gần chủ"), và ở cấp cao cho:
"**Minion gây thêm 30% sát thương lên kẻ địch Ở GẦN BẠN**", cộng 29% tốc chạy minion, 20% cơ hội
Taunt khi đánh trúng, và minion nhận ít hơn 24% sát thương.
`[NGUỒN]` https://www.poe-vault.com/items/meat-shield-support và https://pathofexile.fandom.com/wiki/Meat_Shield_Support

Đọc kỹ: **game thưởng sát thương cho việc bạn đứng gần quái**. Người chơi không nhắm, nhưng
phải chủ động bước vào chỗ nguy hiểm để build chạy đủ công suất. Đó là một quyết định
rủi ro/phần thưởng thật, thay thế đúng chỗ cho việc nhắm.

#### Cần gạt 2 — **Bán kính leash là một LỰA CHỌN BUILD, không phải hằng số**

Đối cực của Meat Shield là **Feeding Frenzy Support**: đổi hành vi sang hung hăng, "ưu tiên đi
tìm và giết kẻ địch", và cấp buff cho *toàn bộ* minion: +10% sát thương, +10% tốc chạy,
+10% tốc đánh và tốc cast.
`[NGUỒN]` https://pathofexile.fandom.com/wiki/Feeding_Frenzy_Support

Nhưng lý do thật sự người ta dùng nó **không phải mấy con số 10%**. Trên forum chính chủ PoE:
"**khác biệt về HÀNH VI của zombie là rất lớn. Chúng bám đánh kẻ địch ở bán kính lớn hơn nhiều.**"
— và người trả lời nhấn mạnh giá trị nằm ở chuyện minion phản ứng nhanh khi dọn map, "99,9% thời
gian chơi".
`[NGUỒN]` https://www.pathofexile.com/forum/view-thread/2751010

**Bài học:** PoE **bán bán kính leash cho người chơi như một trục build**. Leash ngắn = tank,
thưởng khi đứng gần. Leash dài = dọn map nhanh. Một trục quyết định thật, **không tốn thêm nút bấm nào**.

#### Cần gạt 3 — **Một nút gom quân, cooldown ngắn**

**Convocation (PoE):** "Gọi tất cả minion đang đi theo bạn về vị trí của bạn, và cấp cho chúng
hiệu ứng hồi máu tạm thời." **Cooldown 3,00 giây**, hồi "2% máu mỗi giây" trong 2 giây.
`[NGUỒN]` https://poedb.tw/us/Convocation

Thiếu nó thì sao? Phản hồi Early Access của PoE 2 nói rất rõ: "**toàn bộ lối chơi là đi trước
minion của mình đúng một màn hình; nếu muốn giữ minion đi cùng thì tốc độ của bạn chậm như bò.**"
`[NGUỒN]` https://www.pathofexile.com/forum/view-thread/3933046

**Bài học:** một nút "về đây" với CD ~3s vừa là reposition, vừa là heal, vừa là **burst DPS**
(kéo hết quân dồn vào mặt boss). Rẻ để làm, và **một mình nó** biến "đi bộ xem đánh" thành
"chọn đúng lúc".

#### Cần gạt 4 — **Minion sinh tài nguyên, người chơi tiêu tài nguyên**

Đây là vòng lặp hay nhất tìm được, và hợp `deepcore` nhất.

- **Desecrate (PoE)** — rải xác: spawn 5 xác/lần, tối đa 10 xác tồn tại, cast 0,60s, không cooldown.
  `[NGUỒN]` https://poedb.tw/us/Desecrate
- **Offerings** — ăn xác để buff quân. Luật: **mỗi lúc chỉ được MỘT offering**; cast cái mới huỷ
  cái cũ. Mỗi lần ăn 1 xác chính + tối đa 4 xác quanh đó, mỗi xác thêm +1 giây thời lượng
  (nền 5s → tối đa 9s).
  - **Flesh Offering** → tốc độ (đánh/cast/chạy).
  - **Bone Offering** → phòng thủ (block + hồi máu khi block).
  - **Spirit Offering** → crit: "(110—148)% tăng Critical Strike Chance" và "+(30—39)% Critical
    Strike Multiplier".
  `[NGUỒN]` https://pathofexile.fandom.com/wiki/Offering ; https://poedb.tw/us/Spirit_Offering
- **Detonate Dead (PoE)** — nhắm vào một cái xác, cho nó nổ, sát thương lửa bằng
  "(6—7,9)% máu tối đa của cái xác".
  `[NGUỒN]` https://poedb.tw/us/Detonate_Dead
- **Corpse Explosion (D2)** — nổ 70–120% máu gốc của con quái, 50% lửa / 50% vật lý; bán kính
  tăng theo cấp skill nên "bạn có thể spam corpse explosion lên kẻ địch mà mình còn chẳng nhìn thấy".
  `[NGUỒN]` https://maxroll.gg/d2/guides/corpse-explosion-necromancer ; https://wiki.projectdiablo2.com/wiki/Necromancer_Corpse_Explosion_Guide

Nhịp chơi thật của Corpse Explosion Necromancer, theo Maxroll: curse Amplify Damage → nhảy vào
giữa bầy → **để lính đánh thuê / minion tạo ra CÁI XÁC ĐẦU TIÊN** → ngay khi có xác thì nổ dây chuyền.

**Hai bài học rất mạnh:**
1. **"Chỉ một offering cùng lúc"** biến buff thành *lựa chọn tấn công hay thủ, ngay lúc này* —
   chứ không phải bấm cả ba.
2. Vì thời lượng phụ thuộc **số xác quanh đó**, người chơi phải **đứng ở chỗ nhiều xác**.
   Vị trí lại thành chỉ số lần nữa.
3. Và mẫu lớn nhất: **minion sinh đạn, người chơi bắn đạn.** Người chơi không nhắm quái —
   họ nhắm *xác*. **Cái xác đầu tiên là nút thắt kịch tính**: phải sống đủ lâu và đứng đủ gần
   để quân mình giết được một con. Sau đó là phần thưởng dây chuyền.

#### Cần gạt 5 — **Minion là đạn tiêu hao, không phải tài sản cố định**

**Sacrifice (Last Epoch):** "xé toạc một minion đồng minh, gây sát thương vật lý lên kẻ địch
quanh nó. Sát thương cộng thêm áp dụng với hiệu lực gấp đôi." Có node cho nó **lan sang minion
khác trong vùng ("có thể xảy ra nhiều lần")**, node hồi máu người chơi mỗi lần zombie nổ.
`[NGUỒN]` https://lastepoch.fandom.com/wiki/Sacrifice

Kinh tế mana được thiết kế để vòng lặp bền: tác giả một build viết rằng với đúng node,
"**chúng ta hồi được nhiều mana hơn số mana bỏ ra để triệu hồi chúng, giả sử chúng bị hy sinh,
nên có thể triệu hồi nhanh tuỳ ý.**"
`[NGUỒN]` https://forum.lastepoch.com/t/the-defiler-of-rebirth-a-minion-exploding-necromancer-w-a-strong-bone-curse/40406

Vòng lặp "triệu hồi → đẩy ra tuyến đầu → kích nổ" cho người chơi **2–3 quyết định mỗi 5 giây**,
mà vẫn không cần nhắm.

#### Cần gạt 6 — **Một cần gạt "bao nhiêu phần trăm bạn là summoner"**

**Diablo 4 — Book of the Dead**: bạn **từ bỏ hẳn** một loại minion để đổi lấy buff **vĩnh viễn**
cho bản thân:
- Skeletal Skirmisher (Warrior) → **+5% Critical Strike Chance**
- Skeletal Reaper → **+10% sát thương Shadow**
- Skeletal Shadow Mage → **+15 Essence tối đa**
- Skeletal Cold Mage → **+15% sát thương lên kẻ địch Vulnerable**
- Iron Golem → **+30% Critical Strike Damage**

`[NGUỒN]` https://blizzardwatch.com/2023/05/30/necromancer-book-dead-diablo-4/ ;
https://www.gamespot.com/articles/diablo-4-necromancer-book-of-the-dead-guide/1100-6512713/

Maxroll bình luận đúng trọng tâm: "Hy sinh minion có tiềm năng **vượt trội hơn** lợi ích của
việc triệu hồi. Mỗi build Necromancer đưa ra quyết định khác nhau."
`[NGUỒN]` https://maxroll.gg/d4/resources/necromancer-book-of-the-dead

**Bài học:** cùng một class phục vụ được **cả hai gu**. Ai thấy chán vì quân đánh hộ thì đổi
quân lấy sức mạnh bản thân.

#### Cần gạt 7 — **Lệnh chủ động cho từng loại minion + đánh dấu mục tiêu**

- **Predator Support (PoE 1)** cấp một skill "có thể nhắm vào một kẻ địch để khiến các minion
  được hỗ trợ **tập trung tấn công mục tiêu đó và gây thêm sát thương lên mục tiêu được đánh dấu**."
  → **Đây chính là phiên bản "nhắm" của summoner:** người chơi vẫn trỏ vào kẻ địch, nhưng để
  *chỉ định ưu tiên*, không phải để bắn.
  `[NGUỒN]` https://pathofexile.fandom.com/wiki/Predator_Support
- **PoE 2 — Command skills**: câu trả lời hiện đại nhất của GGG cho "summoner nhàm chán". Mỗi
  loại minion có một *lệnh* riêng, gán như skill và bấm khi ngắm vào địch:
  Skeletal Reaver → **Command: Enrage** (tăng mạnh tốc đánh và sát thương vật lý, đổi lại mất máu
  theo thời gian); Skeletal Frost Mage → **Ice Bomb**; Skeletal Storm Mage → gọi bão sét
  **lên xác Skeleton đã chết**; Skeletal Sniper → **Gas Arrow** (khí sẽ nổ khi trúng kẻ địch
  đang bị thiêu).
  `[NGUỒN]` https://epiccarry.com/blogs/how-to-use-command-skills-for-minions-in-path-of-exile-2-guide/ ;
  https://game8.co/games/Path-of-Exile-2/archives/488581
  Vòng lặp thực tế theo Maxroll: "Volcano để tạo hai Raging Spirit và **thiêu** kẻ địch" →
  "**Ra lệnh** cho Skeletal Sniper bắn gas arrow, **nổ khi trúng kẻ địch đang bị thiêu**" →
  với boss thì "cast lệnh Skeletal Reaver để enrage chúng".
  `[NGUỒN]` https://maxroll.gg/poe2/build-guides/minion-army-infernalist-build-guide
- **Grim Dawn — hệ stance ba mức**, mẫu mực về điều khiển pet nhẹ tay:
  **Normal** (mặc định) / **Defensive** (pet bám sát người chơi, chỉ đánh thứ đang tấn công
  người chơi) / **Aggressive** (pet tự do lang thang, đánh mọi thứ trong tầm nhìn, kể cả thứ
  chưa gây hấn). Đổi bằng chuột phải lên icon pet; F2–F7 ra lệnh cho pet đã chọn.
  `[NGUỒN]` https://grimdawn.fandom.com/wiki/Pets ;
  https://steamcommunity.com/app/219990/discussions/0/2287213008797767213/

**Bài học lớn nhất của cần gạt 7:** **combo GIỮA các minion, do người chơi bấm ra.** Minion A
gây trạng thái, người chơi ra lệnh cho minion B kích nổ trạng thái đó. Người chơi thành **nhạc
trưởng** chứ không phải khán giả — mà vẫn không cần nhắm.

Chính điều này khớp với mô tả pet-class được yêu thích nhất: người chơi thích summoner khi
"phần lớn thời gian của nhân vật là triệu hồi, buff và ra lệnh cho minion, tức là **đóng vai một
vị tướng chiến thuật đang di chuyển**".
`[NGUỒN]` https://www.thegamer.com/video-games-with-summoner-pet-familiar-classes/

### 8.4 Downtime hồi sinh: chỉ hay khi nó đòi một hành động CÓ RỦI RO

Ba cách xử lý, ba kết quả khác nhau:

| Game | Cách làm | Kết quả |
|---|---|---|
| **PoE 2** | minion chết → "**5 giây cooldown hồi sinh**" | Bị chê; người chơi phải weapon-swap để lách, cộng đồng gọi là "phản trực giác" |
| **Last Epoch** | skeleton có **~60% tự hồi sinh miễn phí sau 4 giây** | Được khen: "để không phải liên tục bấm lại skill triệu hồi" |
| **Survivor.io** | pet ngất → phải **đứng sát nó vài giây**, có vòng tròn xanh chạy dưới chân | Downtime thành **một quyết định vị trí có rủi ro** |

`[NGUỒN]` https://www.pathofexile.com/forum/view-thread/3933046 ;
https://forum.lastepoch.com/t/the-defiler-of-rebirth-a-minion-exploding-necromancer-w-a-strong-bone-curse/40406 ;
https://mturbogamer.com/2023/04/survivor-io-pets-guide-how-to-get-level-up-evolve-revive/

**Kết luận:** downtime chỉ thú vị khi nó **yêu cầu một hành động có rủi ro** (chạy tới chỗ pet
chết, đứng yên vài giây giữa bầy quái), chứ không thú vị khi nó chỉ là thời gian chờ.

### 8.5 Bối cảnh rộng hơn: game "chỉ có một động từ"

`deepcore` thuộc họ Vampire Survivors, nên đáng nhìn cách họ giải cùng bài toán.

- Vampire Survivors: "**vũ khí của người chơi tấn công tự động**", người chơi chỉ di chuyển để né.
  Cảm hứng được ghi rõ là **Magic Survival** (2019, mobile) — cũng là game nhân vật tự đánh.
  `[NGUỒN]` https://en.wikipedia.org/wiki/Vampire_Survivors
- Phân tích tâm lý học trên The Conversation: "Lối chơi chỉ đòi hỏi điều khiển hướng để di chuyển
  nhân vật. Tấn công quái là tự động, đòn đánh kích hoạt theo các khoảng thời gian đều." Hai cơ chế
  giữ chân được nêu tên: **"near miss effect"** (mọi ván không tới mốc 30 phút đều gây cảm giác
  "suýt nữa thì") và trạng thái **flow** — kỹ năng và độ khó cân bằng tối ưu.
  `[NGUỒN]` https://theconversation.com/vampire-survivors-how-developers-used-gambling-psychology-to-create-a-bafta-winning-game-203613
- Về autobattler nói chung: điều kiện sống còn là "**Hầu hết autobattler cần một giao diện, mục
  tiêu, phong cách hoặc thẩm mỹ tốt thì mới thực sự hoạt động**", và sức hút đến từ "thiết kế đơn
  giản nhưng lối chơi/sơ đồ nâng cấp và tiến hoá có vẻ phức tạp hơn".
  `[NGUỒN]` https://brignews.com/2022/04/25/spotlight-on-vampire-survivors-and-the-comeback-of-the-auto-battler/
- **GDC 2020 — David Abecassis, lead designer Teamfight Tactics, "Teamfight Tactics Design Lessons".**
  Ba thứ mạnh nhất của auto chess được ông nêu: **nhịp thư giãn (relaxed pace)**, **lối chơi không
  đối đầu trực tiếp (non-confrontational play)**, và cách thể hiện tướng cho ngầu; cộng "vòng cung
  roguelike" khi người chơi tiến dần tới đội hình hoàn hảo.
  `[NGUỒN]` https://gdcvault.com/play/1026808/-Teamfight-Tactics-Design ;
  https://www.gamedeveloper.com/design/get-key-game-design-insights-from-riot-s-i-teamfight-tactics-i-at-gdc-2020-
- **Nghiên cứu học thuật — Alharthi, Alsaedi, Toups, Tanenbaum, Hammer, "Playing to Wait: A
  Taxonomy of Idle Games", CHI 2018** (phân tích 66 game idle + 10 game đối chứng). Kết luận
  dùng được thẳng: idle game **"đưa người chơi từ CHƠI sang LẬP KẾ HOẠCH"**.
  `[NGUỒN]` https://dl.acm.org/doi/10.1145/3173574.3174195

**Câu chốt cho `deepcore`:** *nhiệm vụ thiết kế của một class summoner là kéo phần "lập kế hoạch"
đó **vào trong trận, dưới sức ép thời gian**, thay vì để nó nằm hết ở màn hình build.*

Và khi bỏ nhắm, phải **bù lại bằng ba thứ**:
1. **mật độ quyết định build** (lên cấp mỗi vài giây → chọn 1 trong 3),
2. **sức ép vị trí liên tục** (sóng quái ép phải chạy),
3. **nhịp thưởng dày** — không bao giờ có 5 giây trống.

## 9. Bẫy thiết kế cần tránh — và cách các game thật đã giải

### 9.1 Minion kẹt tường / kẹt cửa / kẹt vào nhau

**Bằng chứng đây là bẫy có thật, không phải lo xa:**

- **D2**: "đôi khi **kẹt sau tường hoặc ở góc**."
  `[NGUỒN]` https://diablo2.diablowiki.net/Necromancer_Summoning
- **D2 + Teleport**: "Tuỳ loại Minion, Minion/Mercenary của bạn có thể bị **'dính' vào đúng chỗ
  bạn vừa teleport tới, nên bạn thường phải rời khỏi chỗ đó để chúng giãn ra.**"
  `[NGUỒN]` https://maxroll.gg/d2/guides/summoner-necromancer-guide
- **PoE 2**: "Chúng thường **kẹt vào nhau hoặc kẹt vào chướng ngại vật**, và điều đó đã dẫn tới
  nhiều cái chết đáng tiếc trong lúc tôi chơi."
  `[NGUỒN]` https://www.pathofexile.com/forum/view-thread/3692460
- **PoE 2** (nặng hơn): "**TẤT CẢ minion của tôi kẹt hàng chục lần trong một map** và bị khoá
  cứng vĩnh viễn" ở hành lang hẹp — và vì thế "lựa chọn thực tế duy nhất cho minion là arsonist,
  sniper và storm mage" (tức **chỉ minion tầm xa dùng được**).
  `[NGUỒN]` https://www.pathofexile.com/forum/view-thread/3646953
- **D4** `[CHÍNH THỨC]` patch 2.6.1: "Sửa lỗi **minion Necromancer có thể CHẶN ĐƯỜNG DI CHUYỂN
  của người chơi** khi vào Slaughterhouse."

**Năm cách giải đã được tài liệu hoá:**

1. **Teleport khi pathfind thất bại** (PoE, Mark_GGG). Trigger đầu tiên của teleport chính là
   "cố đi theo bạn nhưng không tìm được đường". **Rẻ nhất và là chuẩn ngành ARPG.**
2. **Raycast "cùng phòng"** — giải pháp tinh vi nhất từng được ghi lại, từ *The Last of Us*.
   Ellie sinh các vị trí đi-theo ứng viên bằng **ba bộ raycast trên navmesh**:
   - **Bộ 1**: tia toả từ leader ra vùng đi-theo (một hình **xuyến** quanh leader) → đảm bảo có
     đường di chuyển thông.
   - **Bộ 2**: tia bắn **về phía trước** từ mỗi ứng viên → "để chắc rằng vị trí đó **không quay
     mặt vào tường**... trên thực tế, một buddy đứng sát tường **cho cảm giác rất không tự nhiên**."
   - **Bộ 3**: tia từ vị trí người chơi tới mỗi vị trí "phía trước" đó. Lý do, trích nguyên văn:
     "Tia này **có vẻ thừa**, nhưng khi thử nghiệm, chúng tôi thấy rằng nếu không có nó, Ellie sẽ
     chọn đứng **ở phía bên kia một khung cửa hoặc hàng rào**. Thêm tia này cho cô ấy **mong muốn
     đứng trong CÙNG MỘT 'CĂN PHÒNG' với người chơi**."
   `[NGUỒN]` http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter35_Ellie_Buddy_AI_in_The_Last_of_Us.pdf
3. **Bỏ va chạm giữa minion và người chơi.** PoE làm vậy (không có patch note nào về minion chặn
   đường người chơi); **D4 giữ va chạm và phải vá bug chặn cửa**. Bài học rất rõ.
4. **Gán vai theo đội hình.** PoE 2 gán minion vào vị trí "tuyến đầu / không-tuyến-đầu" —
   Skeletal Cleric được đặt là **non-frontline**, kèm patch note: "Cải thiện hành vi của Skeletal
   Cleric để **giảm các trường hợp chúng lao vào kẻ địch và cố đánh nhau**."
   `[NGUỒN]` https://www.pathofexile.com/forum/view-thread/3740562
5. **Cho minion đi xuyên** — PoE Raging Spirits: "Kẻ địch sẽ **không trực tiếp giao chiến** với
   các spirit này, và **có thể đi xuyên qua chúng**."
   `[NGUỒN]` https://poedb.tw/us/Minion

### 9.2 Minion không đuổi kịp người chơi chạy nhanh

Sáu mức giải pháp, xếp theo độ "cheat" tăng dần:

| Mức | Giải pháp | Game + số liệu |
|---|---|---|
| **0** (không cheat) | **Ánh xạ khoảng-cách → tốc-độ-di-chuyển**, cộng **co giãn tốc độ animation ±25%** để chống dao động đi/chạy | *The Last of Us*: "tạo một ánh xạ từ quãng đường cần đi sang tốc độ di chuyển của buddy... Với quãng ngắn thì **đi bộ** là đủ; quãng cực dài thì phải **chạy nước rút**; ở giữa thì **chạy**." Và: "cô ấy sẽ tiến tới một khoảng cách lý tưởng rồi **dao động qua lại giữa chạy và đi bộ, rõ ràng là không tự nhiên**. Để ngăn điều đó, chúng tôi cho phép buddy **co giãn tốc độ animation tới 25%**." |
| **1** | **Chạy về phía chủ** khi tụt quá xa (không teleport) | Last Epoch |
| **2** | **Buff tốc chạy gắn vào stance** | PoE Meat Shield **+10–29% tốc chạy minion**; buff Feeding Frenzy **+10% tốc chạy**; Animate Guardian quality **+40% tốc chạy minion** |
| **3** | **Teleport tự động khi vượt ngưỡng** | PoE (Mark_GGG), D2 ("teleport tới đâu đó **trên màn hình**"), D4 ("pet **thụ động teleport để đuổi kịp bạn**"), Grim Dawn |
| **4** | **Recall thủ công** — người chơi tự bấm | PoE `Convocation`, **CD 3,00 s**, kèm thưởng **2% hồi máu/giây trong 2 s** để người chơi **có động lực bấm** |
| **5** | **Bỏ hẳn khái niệm "đuổi kịp"** — minion chết thì hồi sinh tại chỗ mới | PoE 2 Reviving Minions |

**Cạm bẫy máy trạng thái, ghi thẳng vào GDD** (từ Mark_GGG, mục 6.3): **check leash chỉ chạy khi
minion ở state following.** Minion đang giao tranh hoặc đang di chuyển thì check **không chạy** →
"bạn có thể đi quá xa khỏi chúng ở thời điểm đó". Và có race condition với hệ thống ru-ngủ:
"đôi khi bạn đi đủ xa để chúng bị ru ngủ **trước khi** kịp teleport."

### 9.3 Người chơi không hiểu minion đang làm gì

| Game | Kênh phản hồi | Chi tiết |
|---|---|---|
| **Last Epoch** | **Mũi tên đỏ tại con trỏ** | Khi bấm Minion Attack Command, "lệnh tấn công này cũng sẽ có **mấy mũi tên đỏ ngầu ngay tại vị trí con trỏ**, báo hiệu lúc bạn bấm nút" (patch 0.9.2) |
| **D3** | **Phần thưởng cơ học gắn vào lệnh** | **+50% sát thương** lên mục tiêu được lệnh → người chơi **THẤY** lệnh có tác dụng, không chỉ thấy skeleton chạy |
| **D4** | **Golem làm cờ hiệu** | Golem active vừa là animation lớn dễ đọc, vừa là lệnh dồn hoả lực cho toàn quân |
| **PoE** | **Stance ghi thẳng trong chữ của gem** | Kèm dòng giải thích trong ngoặc: "(Aggressive minion có targeting range được nâng lên một giá trị tối thiểu)" |
| **Grim Dawn** | **Thanh máu pet ở góc trên-trái** | "Phần lớn pet có thanh trạng thái máu hiển thị **ở góc trên bên trái màn hình** và có **ba stance điều khiển được**" |
| **The Last of Us** | **Thoại nền làm kênh báo trạng thái AI** | Thoại "vừa là khắc hoạ nhân vật vừa cung cấp thông tin liên quan tới lối chơi". Khi người chơi đâm vào Ellie, cô "diễn một animation né sang bên (**kèm một câu thoại trách người chơi xâm phạm không gian riêng**)". Nhận xét của chính tác giả: "**Cách tiếp cận này lấy một hành vi thường rất bực mình và phi thực tế rồi biến nó thành một nét tính cách nhân vật.**" |

`[NGUỒN]` https://forum.lastepoch.com/t/suggestion-make-minion-ai-more-aggressive-or-give-minion-attack-command/60477 ;
https://us.diablo3.blizzard.com/en-us/class/necromancer/active/command-skeletons ;
https://news.blizzard.com/en-us/article/24244466/diablo-iv-patch-notes-2-5 ;
https://poedb.tw/us/Feeding_Frenzy_Support ; https://www.grimdawn.com/guide/gameplay/combat/ ;
http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter35_Ellie_Buddy_AI_in_The_Last_of_Us.pdf

### 9.4 Rối mắt — không thấy nhân vật mình

**Đây là mảng có ít tài liệu nhất, và cần nói thẳng:**
**không tìm được patch note nào của PoE / D2–D4 / Grim Dawn / Titan Quest / Last Epoch triển khai
"minion trong suốt" hay "vẽ bóng nhân vật xuyên qua minion".** Nếu tài liệu thiết kế cần khẳng
định điều đó, phải ghi là **"chưa có tiền lệ công khai"**.

Than phiền thì có thật, rất rõ, từ ESO:
> "**Pet sẽ chắn tầm nhìn của người chơi**, dẫn tới trải nghiệm kém dễ chịu."
`[NGUỒN]` https://forums.elderscrollsonline.com/en/discussion/677232/why-the-pet-system-is-unattractive

**Những gì các game thật sự làm, có nguồn:**

**(1) Giới hạn cứng số lượng — đây mới là công cụ chính.**

| Game | Trần |
|---|---|
| **D2** | **8 skeleton + 8 skeletal mage + 1 golem** (chỉ 1 golem bất kỳ loại). Revive tối đa **1–20** con tuỳ cấp, **thời hạn đúng 180 giây**. D2R: triệu hồi vượt trần thì "**thay thế con Skeleton cũ nhất**" |
| **D3** | **Tối đa 7 skeleton**, dựng 1 con mỗi 2 s; **Sentry tối đa 2**; Gargantuan 1 |
| **PoE 1** | `Maximum Summoned Golems: 1`; `Maximum Summoned Relics: 1`; 1 Animate Guardian |
| **PoE 2** | Trần **mềm** bằng **Spirit reservation** ("2 minion đầu tiên không tốn spirit nền", sau đó mỗi con tốn) **+ trần cứng theo loại**: "Bạn vẫn có thể có nhiều Spectre hay Tamed Beast, **nhưng chỉ một con MỖI LOẠI quái**." Patch 0.2.0 giảm spam: "Raging Spirits giờ **tối đa 2 spirit mỗi lần cast** (trước là 5)" |

`[NGUỒN]` https://classic.battle.net/diablo2exp/skills/necromancer-summoning.shtml ;
https://maxroll.gg/d2/guides/summoner-necromancer-guide ;
https://us.diablo3.blizzard.com/en-us/class/necromancer/active/command-skeletons ;
https://poe2db.tw/us/Skeletal_Warrior ; https://www.pathofexile.com/forum/view-thread/3826682 ;
https://www.pathofexile.com/forum/view-thread/3740562

**(2) Bỏ va chạm minion↔người chơi** (PoE) so với **giữ va chạm** (D4 → bug chặn cửa Slaughterhouse,
phải vá ở 2.6.1). Đây là **đòn bẩy lớn nhất** cho cảm giác "không bị đám quân của mình cản chân".

**(3) Cho quái đi xuyên minion** — PoE Raging Spirits: "kẻ địch sẽ không trực tiếp giao chiến với
chúng, **và có thể đi xuyên qua chúng**."

**(4) Chấm điểm vị trí đi-theo mỗi khung hình** — *The Last of Us*, và **hai tiêu chí trong đó
trực tiếp chống che khuất**:
- "**Không đứng phía trước người chơi**"
- "**Khoảng cách tới các buddy khác**" (giãn companion ra, không chồng lên nhau)

cộng thêm "khoảng cách tới leader", "ở cùng phía với leader", "khả năng nhìn thấy mục tiêu tiềm
năng (hoặc để nấp, hoặc để lộ)". Và các bộ lọc chuyển động:
"chúng tôi **hạn chế các bước di chuyển ngắn**, chỉ cho phép khi thật cần thiết"; "chúng tôi
**ngăn cô ấy chạy vượt qua mặt nhân vật leader** nếu có thể"; "Cho phép cô ấy tới **'đủ gần'**
vị trí đi-theo, **và không chen lấn người chơi**, khiến hành vi đi theo có cảm giác rất hữu cơ
thay vì cứng nhắc như trước."

**(5) Minion không thể bị nhắm / miễn hiệu ứng mặt đất** để giảm nhiễu — Holy Relic "không thể bị
nhắm trực tiếp và không bị ảnh hưởng bởi hiệu ứng mặt đất".

**(6) Tiền lệ transparency duy nhất tìm được — và nó là một game indie:**
*NOOBS ARE COMING*, patch 0.3.0 mang tên **"The Visibility and Accessibility Update"**:
"Thêm **Chế độ Đòn Đánh Trong Suốt**, trong đó **đạn, minion và nhiều đòn đánh giờ trở nên trong
suốt**", và "**minion nhện không còn rung lắc khi đổi hướng vì nó gây phân tán thị giác quá mức**".
`[NGUỒN]` https://overboy.itch.io/noobs-are-coming-demo/devlog/1000068/patch-030-the-visibility-and-accessibility-update-new-content-balancing

> Chi tiết "minion nhện không còn rung khi đổi hướng" là một bài học nhỏ nhưng rất thật: **trên
> màn hình đông đúc, CHUYỂN ĐỘNG gây rối mắt hơn cả kích thước.** Pet của `deepcore` nên có
> quán tính quay, không được xoay giật.

### 9.5 Minion kéo aggro ngoài ý muốn

Vấn đề này có một quyết định thiết kế được ghi lại cực kỳ thẳng thắn — **The Last of Us chọn cheat**:

> "Trong suốt quá trình phát triển, có một quyết định nổi bật mà chúng tôi phải đưa ra: **liệu kẻ
> địch có nhìn thấy Ellie và bị báo động bởi cô ấy hay không**. Phần lớn thời gian phát triển,
> chúng có thể thấy... Trên thực tế, nó hoạt động đúng khoảng **90%–95%** số lần... Cuối cùng,
> chúng tôi kết luận lựa chọn khả thi duy nhất là **làm cho buddy VÔ HÌNH với NPC địch khi người
> chơi đang lén lút**. Kết quả là đôi khi một buddy sẽ chạy ngang qua một tên xấu ngay trước mắt
> nó mà không bị thấy... **Nó phá vỡ tính chân thực, nhưng hãy nghĩ tới lựa chọn còn lại.** Nếu
> Ellie bị thấy dù chỉ một lần và làm lộ vị trí người chơi, thì **mối liên kết giữa họ sẽ rạn nứt.**"

Và kết luận ở phần Lessons Learned: "quyết định rằng buddy **sẽ không bao giờ phá stealth** là một
quyết định cực kỳ quan trọng."
`[NGUỒN]` http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter35_Ellie_Buddy_AI_in_The_Last_of_Us.pdf

Phiên bản ARPG của cùng vấn đề: PoE dùng **Meat Shield** để *kéo aggro có chủ đích* (20% taunt)
đồng thời **giảm targeting range xuống một giá trị tối đa** để minion **không tự đi kéo thêm bầy**.
Ngược lại, **Feeding Frenzy** gấp đôi aggro range "khiến chúng thích rời xa người chơi để đánh
những kẻ địch ở xa, **đôi khi ngoài màn hình**" — chính là bẫy "minion tự đi pull ngoài khung hình".

### 9.6 Danh sách kiểm QA — lấy thẳng từ patch notes D4 và Last Epoch

Danh sách này hữu ích như **checklist test** cho bất kỳ hệ minion nào:
- "Giới hạn số minion của Book of the Dead **bị sai sau khi Hy sinh minion**."
- "Skeleton Mage **không hồi sinh đúng sau khi người chơi chết**."
- "**Máu minion dao động thất thường sau khi người chơi chết**."
- "Bonus máu minion từ Charm và Seal **không được áp dụng nhất quán**."
- "Nâng cấp Vulnerable của Skeleton Warrior **đôi khi áp Vulnerable lên chính Necromancer** khi
  pet thụ động teleport để đuổi kịp bạn."
- Patch 2.5.1: "Sửa lỗi pet Herald of Hatred **thường xuyên trở nên bất khả ngăn cản và CHẠY XA
  KHỎI người chơi**."
- Last Epoch S3 — lỗi "snapshot" chỉ số: "Minion giờ **cập nhật đúng chỉ số mỗi khi đổi node hoặc
  trang bị**, ngay cả khi minion đã được triệu hồi từ trước."

`[NGUỒN]` https://news.blizzard.com/en-us/article/24271857/diablo-iv-patch-notes-3-0 ;
https://news.blizzard.com/en-us/article/24244466/diablo-iv-patch-notes-2-5 ;
https://maxroll.gg/last-epoch/news/minion-changes-and-quality-of-life-in-season-3

### 9.7 Sáu bẫy, sáu câu trả lời — bản rút gọn

| Bẫy | Bằng chứng | Cách giải rẻ nhất |
|---|---|---|
| Kẹt tường / kẹt cửa | PoE 2: "TẤT CẢ minion kẹt hàng chục lần trong một map" | **Teleport khi pathfind fail** (chuẩn ngành) |
| Minion chặn đường chính chủ | D4 patch 2.6.1 phải vá | **Bỏ va chạm minion↔người chơi** |
| Không đuổi kịp | PoE 2: "đi trước quân mình đúng một màn hình" | **Nút recall CD ngắn có thưởng kèm** (Convocation) |
| Không hiểu quân đang làm gì | D4 không có lệnh = than phiền số 1 | **Gắn thưởng cơ học vào lệnh** (D3 +50%) |
| Rối mắt, không thấy mình | ESO: "pet chắn tầm nhìn" | **Trần số lượng cứng** + không vẽ pet phụ |
| Quân tự đi pull ngoài màn hình | Feeding Frenzy gấp đôi aggro range | **Cho leash là tham số theo từng pet**, không phải hằng số |

---

# PHẦN C — Tổng hợp cho `deepcore`

## 10. Đề xuất hệ pet-vũ khí

Toàn bộ mục 10 là `[ĐỀ XUẤT]` trừ chỗ có `[NGUỒN]`. Mỗi đề xuất đều **truy ngược được** về một
cơ chế đã kiểm chứng ở PHẦN A hoặc PHẦN B — cột "gốc" trong bảng ghi rõ lấy từ đâu.

### 10.1 Bốn luật nền, quyết trước khi bàn từng pet

**Luật 1 — Người chơi có đúng HAI động từ: DI CHUYỂN và MỘT NÚT.**
Di chuyển là joystick ảo. Nút duy nhất là **"GỌI"** (Convocation thu nhỏ): gom toàn bộ pet về
chỗ mình, hồi cho chúng một ít máu, và **trong 2 giây sau đó mọi pet gây thêm sát thương**.
`[ĐỀ XUẤT]` CD **6 giây** (Convocation gốc là 3s với CD, kèm hồi 2%/giây trong 2s —
`[NGUỒN]` https://poedb.tw/us/Convocation — nhưng `deepcore` chỉ có một nút nên phải đắt hơn).
Đây là cần gạt 3 ở mục 8.3: **một mình nó biến "đi bộ xem đánh" thành "chọn đúng lúc"**.

**Luật 2 — Đứng gần quái thì pet mạnh hơn.**
Chép thẳng Meat Shield: pet gây **+25%** sát thương lên kẻ địch **nằm trong 120 px quanh người chơi**.
(Bản gốc PoE: +30% lên kẻ địch "Near you" — `[NGUỒN]` https://www.poe-vault.com/items/meat-shield-support)
`deepcore` bỏ hẳn việc nhắm, nên **vị trí phải gánh toàn bộ trục kỹ năng**. Không có luật này thì
người chơi chỉ việc chạy xa và game tự chơi.

**Luật 3 — Tối đa 4 pet HIỆN HÌNH; số còn lại là "trợ chiến" vô hình.**
Đây là lời giải đã kiểm chứng của Survivor.io cho đúng loại màn hình này: **1 pet hiện hình +
2 pet Assist không ra trận nhưng vẫn góp kỹ năng**
(`[NGUỒN]` https://onechilledgamer.com/survivor-io-pet-guide/ ;
https://www.pocketgamer.com/survivor-io/pets-guide/).
`deepcore` là màn dọc + có đào tường nên tầm nhìn còn hẹp hơn nữa. `[ĐỀ XUẤT]` trần **4 hiện hình**,
pet thứ 5 trở đi tự chuyển sang chế độ **trợ chiến**: không vẽ ra, chỉ cấp phần buff của nó.
Người chơi vẫn sưu tầm được 10 pet mà màn hình không vỡ.

**Luật 4 — Quặng là đạn dược, không phải điểm số.**
Đây là phiên bản `deepcore` của "kinh tế xác chết" (cần gạt 4, mục 8.3). Đào ra quặng → quặng là
thứ **nuôi tiến hoá và nạp chiêu**. Người chơi không nhắm quái; người chơi **chọn đào chỗ nào**.
Cái quyết định "đào hay chạy" chính là chỗ thay thế cho "nhắm hay không nhắm".

### 10.2 Mười pet-vũ khí

Ký hiệu: **BÁM** = cách bám chủ · **NGẮM** = luật chọn mục tiêu · **NHỊP** = chu kỳ đánh.

---

#### 1. **Gộc Đá** — cận chiến chặn (tank / body-block)
Một khối đá cụt có hai tay, đi chậm, lì đòn.

- **BÁM**: **không** đi sau lưng chủ. Nó luôn **chen vào giữa chủ và cụm quái đông nhất**, giữ
  khoảng **60–90 px** trước mặt chủ. Nếu chủ đi xa quá **220 px** → bỏ vị trí, đuổi theo.
- **NGẮM**: quái **gần chủ nhất** (không phải gần nó nhất). Mỗi đòn trúng có **25% Khiêu khích**,
  kéo aggro của quái đó về mình trong 3 giây.
- **NHỊP**: chậm — 1,2 s/đòn, đòn có knockback nhẹ 20 px.
- **Gốc**: Meat Shield Support (bám sát chủ, ưu tiên quái gần chủ, có chance Taunt) —
  `[NGUỒN]` https://pathofexile.fandom.com/wiki/Meat_Shield_Support
- **5 bậc**: b2 +25% máu · **b3: chặn được cả đạn** (đứng chắn thì đạn trúng nó thay vì chủ) ·
  b4 +60% sát thương · **b5: khi máu về 0 thì vỡ thành tường đá chắn 4 giây rồi mới hồi**.
- **TIẾN HOÁ → "Vách Lõi"**: bậc 5 + đã **đào đủ 30 ô tường** trong ván. Thành một bức tường
  biết đi: không đánh nữa, nhưng **hút toàn bộ aggro trong 200 px** và phản 40% sát thương nhận.

---

#### 2. **Chó Mỏ** — cận chiến kết liễu (melee DPS)
Con chó máy nhỏ, nhanh, chuyên dọn nốt quái sắp chết.

- **BÁM**: bám lỏng, quỹ đạo vòng quanh chủ bán kính **90 px**; được phép **xông xa tối đa 260 px**
  rồi bắt buộc quay về.
- **NGẮM**: **quái MÁU THẤP NHẤT trong 260 px** — vai finisher. Mục tiêu chết → chọn con máu thấp
  nhất kế tiếp **ngay trong cùng khung hình** (không đứng ngơ).
- **NHỊP**: 0,75 s/đòn.
- **Gốc**: hành vi hung hăng "ưu tiên đi tìm và giết" của Feeding Frenzy —
  `[NGUỒN]` https://pathofexile.fandom.com/wiki/Feeding_Frenzy_Support
- **5 bậc**: b2 +25% st · **b3: giết được ai thì +30% tốc chạy trong 2s (cộng dồn 3 lần)** ·
  b4 +60% st · **b5: mỗi đòn kết liễu làm rơi 1 mảnh quặng**.
- **TIẾN HOÁ → "Chó Đầu Đàn"**: bậc 5 + **giết 150 quái bằng chính nó**. Nhân đôi thành **hai con**,
  mỗi con 70% sát thương gốc (tổng +40%), và chúng chia nhau hai mục tiêu khác nhau.

---

#### 3. **Mũi Khoan Bay** — tầm xa đơn mục tiêu (ranged single-target)
Mũi khoan lơ lửng, bắn lõi xuyên.

- **BÁM**: bay **cứng** ở **60 px** sau vai chủ, không rời. Đây là pet "không bao giờ kẹt".
- **NGẮM**: **quái TO NHẤT / máu tối đa cao nhất** trong tầm — vai chuyên trị elite và boss.
  Nếu không có elite thì bắn con **xa nhất** (dọn tuyến sau).
- **NHỊP**: 1,0 s/phát, đạn **xuyên 2 mục tiêu**, tầm 260 px.
- **Gốc**: quan sát của cộng đồng PoE 2 rằng khi hành lang hẹp thì "lựa chọn thực tế duy nhất là
  minion tầm xa" vì cận chiến kẹt cứng — `[NGUỒN]` https://www.pathofexile.com/forum/view-thread/3646953
  → trong hang đào của `deepcore`, **phải có ít nhất một pet miễn nhiễm với việc kẹt đường**.
- **5 bậc**: b2 +25% st · **b3: xuyên 4 mục tiêu** · b4 +60% st · **b5: bắn xuyên được 1 ô tường**
  (và làm nứt ô đó).
- **TIẾN HOÁ → "Khoan Xuyên Tầng"**: bậc 5 + **bắn trúng 3 elite khác nhau**. Đạn thành tia liên
  tục, xuyên vô hạn, **và tự đục thủng tường trên đường đi** — biến pet đánh thành pet mở đường.

---

#### 4. **Đom Đóm Mìn** — nổ diện (AoE)
Bầy đom đóm đá, rải mìn phát sáng rồi nổ.

- **BÁM**: lượn quanh chủ bán kính **50 px**, nhưng **thả mìn xuống nền nơi chủ VỪA ĐI QUA**
  (không thả về phía trước) — nên nó thưởng cho việc **chạy vòng gom quái**.
- **NGẮM**: **không ngắm quái**. Ngắm **mặt đất**. Mìn nổ khi có quái vào trong 70 px.
- **NHỊP**: thả 1 mìn / 2,5 s; tối đa **6 mìn** tồn tại cùng lúc.
- **Gốc**: mẫu "minion sinh đạn, người chơi kích hoạt đạn" của Detonate Dead / Corpse Explosion —
  `[NGUỒN]` https://poedb.tw/us/Detonate_Dead ; https://maxroll.gg/d2/guides/corpse-explosion-necromancer.
  Ở đây người chơi kích nổ **bằng đường chạy của mình**, không bằng nút bấm — đó là cách dịch cơ
  chế ấy sang game một-nút.
- **5 bậc**: b2 +25% st nổ · **b3: mìn nổ dây chuyền (mìn nổ kích mìn cạnh nó)** · b4 +60% st ·
  **b5: nổ làm nứt ô tường lân cận** (nổ = đào).
- **TIẾN HOÁ → "Ruộng Lân Tinh"**: bậc 5 + **giết 80 quái bằng mìn**. Mìn không tan nữa, tối đa 12
  quả, và mỗi quả **phát sáng bán kính 100 px** — thành ra vừa đánh vừa soi.

---

#### 5. **Nấm Thở** — hồi máu (healer)
Cây nấm đá phập phồng, thở ra bào tử xanh.

- **BÁM**: **cứng, 45 px** sau chủ. Pet hồi máu **không được phép lạc**.
- **NGẮM**: không đánh. Xung hồi máu theo **vùng bán kính 130 px quanh CHÍNH NÓ** — hồi cho chủ
  **và cho mọi pet khác** trong vùng.
- **NHỊP**: 1 xung / 3,0 s. Hồi **4 HP** cho chủ, **8 HP** cho pet.
- **Gốc**: hai thứ. (a) Convocation gốc **cũng là một skill hồi máu minion** —
  `[NGUỒN]` https://poedb.tw/us/Convocation ; (b) bài học của Last Epoch rằng minion chết liên
  tục là thứ giết trải nghiệm ("You get stuck with constantly dying minions" —
  `[NGUỒN]` https://steamcommunity.com/app/899770/discussions/0/3824161508138483678).
- **5 bậc**: b2 +25% hồi · **b3: hồi vượt máu tối đa thì đổi thành khiên tạm 3s** · b4 +60% hồi ·
  **b5: pet nào chết trong vùng thì hồi sinh sau 4 giây, một lần mỗi 20 giây**.
- **TIẾN HOÁ → "Nấm Mẹ"**: bậc 5 + **hồi tổng cộng 1 000 HP** trong ván. Bám vào **Gộc Đá** thay
  vì bám chủ (nếu có), vùng hồi tăng lên 200 px, và mỗi lần hồi **cũng cấp 5% giảm sát thương nhận**.

---

#### 6. **Trống Đá** — buff (support caster)
Cái trống đá tự gõ, nhịp gõ là buff.

- **BÁM**: **cứng, 40 px** bên hông chủ.
- **NGẮM**: không có mục tiêu. Phát **một trong hai nhịp**, và **chỉ một tại một thời điểm** —
  người chơi đổi bằng cách... **đứng yên 1 giây thì đổi sang nhịp Thủ, đang chạy thì là nhịp Công**.
  - **Nhịp Công** (đang di chuyển): mọi pet **+20% tốc đánh**.
  - **Nhịp Thủ** (đứng yên ≥1 s): mọi pet **+25% giảm sát thương nhận**, chủ **+15%**.
- **NHỊP**: cập nhật liên tục, đổi nhịp có 0,5 s trễ.
- **Gốc**: luật "**chỉ MỘT offering tại một thời điểm**" của PoE — cast cái mới huỷ cái cũ; đó là
  thứ biến buff thành *lựa chọn công hay thủ ngay lúc này*
  (`[NGUỒN]` https://pathofexile.fandom.com/wiki/Offering). `deepcore` không có nút thứ hai, nên
  **hành vi di chuyển đóng vai nút chọn** — đây là điểm dịch quan trọng nhất của cả tài liệu.
- **5 bậc**: b2 +25% hiệu lực · **b3: nhịp Công cộng thêm +10% tốc chạy cho chủ** · b4 +60% hiệu
  lực · **b5: giữ được nhịp cũ thêm 3 giây sau khi đổi trạng thái** (cho phép "ăn hai nhịp" nếu
  đảo chân khéo).
- **TIẾN HOÁ → "Trống Lõi"**: bậc 5 + **giữ mỗi nhịp tổng cộng ≥60 giây**. Có **nhịp thứ ba** —
  đứng yên trên **ô quặng** thì phát **Nhịp Đào**: mọi pet có khả năng đào **+100% tốc đào**.

---

#### 7. **Giun Đào** — đào hộ (utility / economy)
Con giun đá, không quan tâm đánh nhau, chỉ thích tường.

- **BÁM**: **lỏng nhất trong tất cả**. Nó tự đi tới **ô quặng hoặc ô tường gần nhất trong 320 px
  quanh chủ**. Chủ đi xa hơn **340 px** thì nó bỏ dở, chui đất về (**dịch chuyển tức thời**, không
  đi bộ — đây là cách né hoàn toàn bài toán kẹt đường).
- **NGẮM**: **quặng trước, tường sau, quái cuối cùng.** Chỉ đánh khi bị quái chạm vào người.
- **NHỊP**: đào **1 ô / 1,6 s**; đánh 3 st / 0,9 s khi bị ép.
- **Gốc**: bài học kẹt đường của PoE 2 ("ALL my minions stuck dozens of times in a single map and
  are just perm locked" — `[NGUỒN]` https://www.pathofexile.com/forum/view-thread/3646953).
  Giải pháp cộng đồng đề xuất ở đó là **cho minion phasing**; `deepcore` áp dụng thẳng: pet đào
  **đi xuyên đất** thay vì tìm đường.
- **5 bậc**: b2 tốc đào +25% · **b3: quặng nó đào ra tự bay về chủ** · b4 tốc đào +60% ·
  **b5: đào trúng quặng thì để lại một đường hầm sáng** (chủ chạy trong đó +20% tốc).
- **TIẾN HOÁ → "Giun Chúa"**: bậc 5 + **đào 100 ô**. Đào một đường hầm **liên tục** theo hướng
  chủ đang đi, và **mọi quái đứng trên ô nó vừa đào bị hút xuống 1 giây** — biến pet kinh tế thành
  pet gom quái.

---

#### 8. **Đèn Lồng** — soi sáng (vision / debuff)
Cái đèn đá lơ lửng trên vai chủ.

- **BÁM**: **cứng, 35 px** trên đầu chủ. Không bao giờ rời.
- **NGẮM**: không đánh. Mở **vùng sáng bán kính 180 px**; quái trong vùng sáng **-12% giáp** và
  **hiện thanh máu**; quặng ẩn trong tường **lộ viền vàng**.
- **NHỊP**: liên tục.
- **Gốc**: (a) than phiền kinh điển "pet che tầm nhìn" của ESO —
  `[NGUỒN]` https://forums.elderscrollsonline.com/en/discussion/677232/why-the-pet-system-is-unattractive
  → nên có **đúng một pet có nhiệm vụ ngược lại: LÀM RÕ màn hình**; (b) nguyên tắc UI mobile
  "less is more, mọi pixel đều đáng giá" — `[NGUỒN]` https://vrunik.com/ux-for-mobile-games-optimizing-user-interfaces-for-small-screens/
- **5 bậc**: b2 bán kính 210 px · **b3: quái trong sáng bị pet khác ngắm ưu tiên** · b4 bán kính
  250 px + debuff -20% giáp · **b5: soi thấy quặng qua 2 lớp tường**.
- **TIẾN HOÁ → "Mắt Lõi"**: bậc 5 + **soi lộ 40 ô quặng**. Vùng sáng thành **hình nón theo hướng
  chủ đi**, xa 400 px, và **đánh dấu 1 mục tiêu ưu tiên** trong nón — mọi pet dồn vào nó, gây +25%
  sát thương lên nó. Đây chính là **Predator Support**
  (`[NGUỒN]` https://pathofexile.fandom.com/wiki/Predator_Support): phiên bản "nhắm" duy nhất
  mà `deepcore` cho phép, **và nó nhắm bằng HƯỚNG CHẠY, không bằng ngón tay**.

---

#### 9. **Lưới Nhện** — khống chế / gom quái (control)
Con nhện đá, giăng lưới xuống nền.

- **BÁM**: quỹ đạo quanh chủ **110 px**, luôn **đứng về phía có nhiều quái nhất**.
- **NGẮM**: **cụm quái đông nhất trong 220 px** (đếm quái trong ô vuông 80 px). Bắn lưới xuống
  **giữa cụm**, không bắn vào một con.
- **NHỊP**: 1 lưới / 2,0 s; lưới rộng 80 px, **làm chậm 35% trong 3 giây**.
- **Gốc**: "gom quái thành cụm cho minion xử" là kỹ năng cốt lõi của summoner — nhịp chơi Corpse
  Explosion Necromancer là *nhảy vào giữa bầy rồi để quân tạo cái xác đầu tiên*
  (`[NGUỒN]` https://maxroll.gg/d2/guides/corpse-explosion-necromancer). Pet này **làm hộ việc gom**
  để người chơi không phải kite quá giỏi mới chơi được.
- **5 bậc**: b2 chậm 45% · **b3: lưới kéo quái vào giữa 40 px** · b4 chậm 55%, lưới rộng 110 px ·
  **b5: quái chết trên lưới để lại mảnh quặng**.
- **TIẾN HOÁ → "Tơ Lõi"**: bậc 5 + **làm chậm 400 lượt quái**. Lưới **dính vào nhau**: hai lưới
  chạm nhau tạo một dải tơ nối, quái đi qua dải bị **giữ chân 0,8 giây**. Cho phép người chơi
  **vẽ hàng rào** bằng đường chạy.

---

#### 10. **Hồn Quặng** — dây chuyền tầm xa (chain / scaling)
Bóng ma trong quặng, bắn tia nhảy.

- **BÁM**: trôi **70 px** phía sau chủ, xuyên tường (không bao giờ kẹt).
- **NGẮM**: **quái mà pet khác VỪA đánh trúng gần nhất** — nó "ăn theo" đội hình. Nếu không có,
  bắn con gần nhất.
- **NHỊP**: 1,4 s/phát; tia **nhảy 3 mục tiêu**, mỗi lần nhảy **-20% sát thương**, tầm nhảy 120 px.
- **Gốc**: mẫu combo giữa các minion của PoE 2 — minion A gây trạng thái, minion B kích nổ
  (`[NGUỒN]` https://maxroll.gg/poe2/build-guides/minion-army-infernalist-build-guide). `deepcore`
  làm phiên bản tự động: **pet này thưởng cho việc đội hình dồn hoả lực**.
- **5 bậc**: b2 +25% st · **b3: nhảy 5 mục tiêu** · b4 +60% st ·
  **b5: mỗi mảnh quặng nhặt được cộng +1% sát thương cho nó, tối đa +80%, mất khi hết ván**.
- **TIẾN HOÁ → "Mạch Lõi"**: bậc 5 + **nhặt 200 mảnh quặng**. Tia không nhảy nữa mà **nối thành
  một mạch giữa TẤT CẢ pet đang hiện hình**: quái chạm vào mạch nhận sát thương liên tục.
  Càng nhiều pet ra trận, mạch càng dài → **thưởng trực tiếp cho việc giữ pet sống**.

---

### 10.3 Bảng số liệu đề xuất — `[ĐỀ XUẤT]` toàn bộ

Đơn vị: **1 ô = 32 px**. Giả định nền để cân: **người chơi 100 HP, tốc chạy 130 px/s;
quái thường 20 HP ở phút 0**. Số dưới đây là **bậc 1**.

| # | Pet | Vai | ST/đòn | Nhịp (s) | DPS | Tầm đánh (px) | Bám chủ (px) | Leash tối đa (px) | Máu pet |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Gộc Đá** | Chặn / tank | 6 | 1,20 | 5,0 | 40 (cận) | 60–90 **phía trước** | 220 | **120** |
| 2 | **Chó Mỏ** | Cận DPS | 9 | 0,75 | 12,0 | 36 (cận) | 90 (quỹ đạo) | 260 | 45 |
| 3 | **Mũi Khoan Bay** | Tầm xa đơn | 11 | 1,00 | 11,0 | 260 | 60 (cứng) | — (không rời) | 30 |
| 4 | **Đom Đóm Mìn** | Nổ diện | 22 (nổ) | 2,50 | 8,8 | rải 150 · nổ r=70 | 50 (quỹ đạo) | 150 | 25 |
| 5 | **Nấm Thở** | Hồi máu | — (hồi 4 chủ / 8 pet) | 3,00 | — | aura r=130 | 45 (cứng) | — | 60 |
| 6 | **Trống Đá** | Buff | — (+20% tốc đánh / +25% giảm st) | liên tục | — | aura r=160 | 40 (cứng) | — | 50 |
| 7 | **Giun Đào** | Đào | 3 | 0,90 | 3,3 | 30 (cận) | tự do | 340 → **dịch chuyển về** | 40 |
| 8 | **Đèn Lồng** | Soi sáng | — (−12% giáp địch) | liên tục | — | sáng r=180 | 35 (cứng) | — | 20 |
| 9 | **Lưới Nhện** | Khống chế | — (chậm 35% / 3 s) | 2,00 | — | bắn 220 · lưới r=80 | 110 (quỹ đạo) | 240 | 35 |
| 10 | **Hồn Quặng** | Dây chuyền | 7 ×3 nhảy (−20%/nhảy) | 1,40 | ~10,9 | 200 · nhảy 120 | 70 (xuyên tường) | — | 25 |

**Tổng DPS bốn pet đánh mạnh nhất ở bậc 1** ≈ 12,0 + 11,0 + 10,9 + 8,8 ≈ **42,7 DPS** →
giết một quái 20 HP mỗi ~0,5 s. `[ĐỀ XUẤT]` đó là nhịp mở màn đúng cho một game survivor màn dọc:
đủ để thấy quái nổ liên tục, chưa đủ để đứng yên.

**Hệ số 5 bậc** (áp cho mọi pet):

| Bậc | Sát thương / hiệu lực | Máu pet | Thêm gì |
|---|---|---|---|
| 1 | ×1,00 | ×1,00 | — |
| 2 | ×1,25 | ×1,20 | — |
| 3 | ×1,25 | ×1,45 | **mở chức năng phụ #1** (xem từng pet) |
| 4 | ×1,60 | ×1,75 | — |
| 5 | ×1,60 | ×2,10 | **mở chức năng phụ #2** + đủ điều kiện tiến hoá |

Chú ý cố ý: **bậc 3 và bậc 5 KHÔNG tăng sát thương.** Chúng đổi *cách hoạt động*. Đây là chép
từ Astral Forge của Survivor.io — nấc 1–2 sao cộng ~15%/20% chỉ số, còn **nấc 3 sao thì đổi cơ chế**
(`[NGUỒN]` https://www.allclash.com/survivor-io-astral-forge-guide/). Người chơi nhớ bậc 3 và
bậc 5; bậc 2 và 4 chỉ là để đường cong không giật.

**Chi phí lên bậc** `[ĐỀ XUẤT]` — nhân đôi mỗi nấc, chép hình dạng hàm mũ của merge Survivor.io
(2 → 4 → 8 …, mục 3.4):

| Lên bậc | Mảnh quặng | Vàng |
|---|---|---|
| 1 → 2 | 20 | 300 |
| 2 → 3 | 45 | 900 |
| 3 → 4 | 100 | 2 700 |
| 4 → 5 | 220 | 8 100 |
| Tiến hoá | 500 + **điều kiện trong ván** | 20 000 |

### 10.4 Điều kiện TIẾN HOÁ — vì sao có hai vế

Mỗi tiến hoá cần **bậc 5 (vế ngoài ván) + một điều kiện làm được TRONG ván (vế trong ván)**.

Đây là chép chính xác luật tiến hoá vũ khí của Survivor.io: "nâng vũ khí lên cấp 5 **và** có được
kỹ năng hỗ trợ tương ứng; khi đủ cả hai, hạ boss rồi mở rương sẽ kích hoạt tiến hoá"
(`[NGUỒN]` https://www.bluestacks.com/blog/game-guides/survivor-io/sio-skills-evolution-guide-en.html).

Lý do nó tốt, và vì sao `deepcore` nên giữ: **vế ngoài ván là thời gian, vế trong ván là hành vi.**
Người chơi không thể chỉ cày tiền để có tiến hoá — họ phải **chơi theo đúng cách mà pet đó muốn**
(Giun Đào bắt đào 100 ô; Chó Mỏ bắt kết liễu 150 con; Đèn Lồng bắt soi 40 ô quặng). Vế thứ hai
chính là thứ dạy người chơi cách dùng pet, miễn phí, không cần tutorial.

Bảng gọn:

| Pet | Tiến hoá thành | Vế ngoài ván | Vế trong ván |
|---|---|---|---|
| Gộc Đá | **Vách Lõi** | bậc 5 | đào 30 ô tường |
| Chó Mỏ | **Chó Đầu Đàn** | bậc 5 | 150 đòn kết liễu |
| Mũi Khoan Bay | **Khoan Xuyên Tầng** | bậc 5 | trúng 3 elite khác nhau |
| Đom Đóm Mìn | **Ruộng Lân Tinh** | bậc 5 | 80 quái chết vì mìn |
| Nấm Thở | **Nấm Mẹ** | bậc 5 | hồi tổng 1 000 HP |
| Trống Đá | **Trống Lõi** | bậc 5 | giữ mỗi nhịp ≥60 s |
| Giun Đào | **Giun Chúa** | bậc 5 | đào 100 ô |
| Đèn Lồng | **Mắt Lõi** | bậc 5 | soi lộ 40 ô quặng |
| Lưới Nhện | **Tơ Lõi** | bậc 5 | làm chậm 400 lượt quái |
| Hồn Quặng | **Mạch Lõi** | bậc 5 | nhặt 200 mảnh quặng |

### 10.5 Cách dán vào "lên cấp chọn 1 trong 3"

`deepcore` có **một màn duy nhất** và **lên cấp chọn 1 trong 3**. Ba loại thẻ `[ĐỀ XUẤT]`:

| Loại thẻ | Nội dung | Tần suất |
|---|---|---|
| **Thẻ TRIỆU** | Gọi ra một pet chưa có (tối đa 4 hiện hình) | Luôn có ít nhất 1 trong 3 nếu còn ô trống |
| **Thẻ BẬC** | Nâng một pet đang có lên bậc kế | Chiếm phần lớn |
| **Thẻ NGƯỜI** | Buff cho **bản thân người chơi** — tốc chạy, máu, bán kính nhặt, tốc đào, bán kính "vùng gần" của Luật 2 | ~1/4 |

**Thẻ NGƯỜI là van chống chán.** Nó chính là cần gạt 6 ở mục 8.3 — cần gạt "bao nhiêu phần trăm
bạn là summoner", bản mềm. Diablo 4 làm cứng (bỏ hẳn một loại minion đổi lấy +5% crit vĩnh viễn —
`[NGUỒN]` https://maxroll.gg/d4/resources/necromancer-book-of-the-dead); `deepcore` không cần cứng
thế, chỉ cần luôn có một hướng đầu tư **không phải pet** để người chơi cảm thấy mình cũng đang lớn lên.

`[ĐỀ XUẤT]` thêm một loại thẻ hiếm: **Thẻ HY SINH** — phá huỷ một pet đang có để **mọi pet còn lại
+35% sát thương vĩnh viễn trong ván này**. Đây là Sacrifice của Last Epoch
(`[NGUỒN]` https://lastepoch.fandom.com/wiki/Sacrifice) rút gọn thành một quyết định duy nhất.
Nó cho người chơi một khoảnh khắc "được phép làm điều đau đớn" — thứ mà build tự-đánh rất hiếm có.

### 10.6 Chống rối màn hình — bắt buộc, không phải tuỳ chọn

Màn dọc + 4 pet + bầy quái + hầm đào = công thức của một mớ hỗn độn. Sáu luật `[ĐỀ XUẤT]`,
mỗi luật trả lời một than phiền có thật đã dẫn ở PHẦN B:

1. **Nhân vật người chơi luôn vẽ TRÊN CÙNG**, và có **viền sáng 2 px** không bao giờ bị che.
   (Trả lời: "Pet sẽ chắn tầm nhìn của người chơi" — ESO,
   `[NGUỒN]` https://forums.elderscrollsonline.com/en/discussion/677232/why-the-pet-system-is-unattractive)
2. **Pet nhỏ hơn nhân vật ~25%** và **mờ 15%** khi nằm đè lên nhân vật.
3. **Pet KHÔNG va chạm với nhau**, chỉ va chạm với quái.
   (Trả lời: minion kẹt cứng ở hành lang hẹp — `[NGUỒN]` https://www.pathofexile.com/forum/view-thread/3646953)
4. **Mỗi pet có một MÀU riêng cố định**, dùng cho cả thân, đạn và hiệu ứng. Người chơi đọc
   "ai đang đánh" bằng màu, không bằng hình.
5. **Không thanh máu trên đầu pet.** Pet sắp chết thì **nhấp nháy viền đỏ**. Dữ liệu quan trọng
   neo ở mép màn hình. (`[NGUỒN]` nguyên tắc UI mobile: "game action should take precedence over
   UI elements", thanh máu nên là "floating UI elements... anchored at the edges of the screen" —
   https://vrunik.com/ux-for-mobile-games-optimizing-user-interfaces-for-small-screens/)
6. **Pet thứ 5 trở đi không vẽ** — chỉ hiện thành **icon nhỏ ở HUD** kèm chữ "trợ chiến".
   (Đây là mô hình chính/phụ của Survivor.io, mục 5.6.)
   Nút "GỌI" là touch target **≥ 44×44 px**, góc dưới-phải, ngón cái với tới.

### 10.7 Bảng truy nguồn — mỗi đề xuất về từ đâu

| Đề xuất trong `deepcore` | Gốc | Nguồn |
|---|---|---|
| Nút **GỌI** (gom pet + hồi + buff 2 s) | Convocation, CD 3 s, hồi 2%/s trong 2 s | https://poedb.tw/us/Convocation |
| **Luật 2** — đứng gần quái thì pet mạnh hơn | Meat Shield: minion +30% st lên địch gần chủ | https://www.poe-vault.com/items/meat-shield-support |
| **Leash khác nhau cho từng pet** (35 px cứng → 340 px tự do) | Meat Shield vs Feeding Frenzy là hai trục build | https://pathofexile.fandom.com/wiki/Feeding_Frenzy_Support |
| **Trống Đá — chạy = Công, đứng = Thủ** | "Chỉ MỘT offering tại một thời điểm" | https://pathofexile.fandom.com/wiki/Offering |
| **Đom Đóm Mìn** — pet rải đạn, người chơi kích bằng đường chạy | Detonate Dead / Corpse Explosion | https://poedb.tw/us/Detonate_Dead |
| **Giun Đào dịch chuyển về thay vì tìm đường** | Cộng đồng PoE 2 đề xuất phasing cho minion kẹt | https://www.pathofexile.com/forum/view-thread/3646953 |
| **Mắt Lõi — đánh dấu 1 mục tiêu ưu tiên** | Predator Support | https://pathofexile.fandom.com/wiki/Predator_Support |
| **Thẻ HY SINH** | Sacrifice (Last Epoch) | https://lastepoch.fandom.com/wiki/Sacrifice |
| **Thẻ NGƯỜI** | Book of the Dead — đổi minion lấy sức mạnh bản thân | https://maxroll.gg/d4/resources/necromancer-book-of-the-dead |
| **Tối đa 4 hiện hình, còn lại "trợ chiến"** | Survivor.io: 1 pet deploy + 2 pet assist vô hình | https://onechilledgamer.com/survivor-io-pet-guide/ |
| **Bậc 3 & 5 đổi cơ chế, không cộng số** | Astral Forge: 1–2 sao cộng %, 3 sao đổi cơ chế | https://www.allclash.com/survivor-io-astral-forge-guide/ |
| **Tiến hoá = bậc 5 + điều kiện trong ván** | Survivor.io: vũ khí lv5 + kỹ năng hỗ trợ tương ứng | https://www.bluestacks.com/blog/game-guides/survivor-io/sio-skills-evolution-guide-en.html |
| **Chi phí lên bậc nhân đôi mỗi nấc** | Merge Survivor.io 2 → 4 → 8 | mục 3.4 tài liệu này |
| **Pet sắp chết nhấp nháy viền, không thanh máu** | UI mobile: hành động game ưu tiên hơn UI | https://vrunik.com/ux-for-mobile-games-optimizing-user-interfaces-for-small-screens/ |

---

# Nguồn

## A. Survivor.io

**Wiki / chính chủ**
- SurvivorIO Wiki (Fandom) — https://survivorio.fandom.com/wiki/Equipment , /wiki/Merging , /wiki/Astral_forge , /wiki/S_grade_equipment , /wiki/Tech_Parts
  — **chặn truy cập tự động (HTTP 402)** ở thời điểm viết; chỉ dùng được qua trích dẫn của công cụ tìm kiếm.
- Thông báo Wishlist cho S Grade Supply Crate (Instagram chính chủ) — https://www.instagram.com/survivor_io/p/Cr6TTxfPi6o/

**Hướng dẫn chi tiết**
- One Chilled Gamer — Equipment Guide: https://onechilledgamer.com/survivor-io-equipment-guide/
- One Chilled Gamer — Beginner Guide: https://onechilledgamer.com/survivor-io-guide-and-tips-for-beginners/
- One Chilled Gamer — Pet Guide: https://onechilledgamer.com/survivor-io-pet-guide/
- BlueStacks — Beginner's Guide: https://www.bluestacks.com/blog/game-guides/survivor-io/sio-beginner-guide-en.html
- BlueStacks — Skills & Evolution Guide: https://www.bluestacks.com/blog/game-guides/survivor-io/sio-skills-evolution-guide-en.html
- TalkAndroid — Ultimate Game Guide: https://www.talkandroid.com/24372-survivor-io-ultimate-game-guide-with-tips-2023/
- LDPlayer — Beginner's Guide: https://www.ldplayer.net/blog/survivor-io-beginners-guide.html
- mturbogamer — Best Way To Spend Gems: https://mturbogamer.com/2022/10/survivor-io-best-way-to-spend-gems/
- mturbogamer — Patrol & Quick Patrol: https://mturbogamer.com/2022/09/survivor-io-patrol-quick-patrol/
- mturbogamer — Key Evolution / Gold DNA: https://mturbogamer.com/2022/09/survivor-io-how-to-get-key-evolution-gold-dna/
- mturbogamer — Tech Parts Guide: https://mturbogamer.com/2022/11/survivor-io-tech-parts-guide-unlock-use-merge/
- mturbogamer — Astral Forge Guide: https://mturbogamer.com/2026/07/survivor-io-astral-forge-guide/
- mturbogamer — Pets Guide (level / evolve / revive): https://mturbogamer.com/2023/04/survivor-io-pets-guide-how-to-get-level-up-evolve-revive/
- WriterParty — Energy Guide: https://writerparty.com/party/survivor-io-energy-guide/
- WriterParty — Trials Guide: https://writerparty.com/party/survivor-io-trials-guide-and-walkthrough/
- WriterParty — Supplies & Equipment Part 2: https://writerparty.com/party/survivor-io-how-to-get-better-excellent-epic-legendary-and-s-grade-supplies-and-equipment-part-2/
- allclash — Astral Forge Guide: https://www.allclash.com/survivor-io-astral-forge-guide/
- theclashify — Merge Guide: https://theclashify.com/survivorio-io-merge-guide/
- theclashify — Chapter Guide: https://theclashify.com/survivor-io-chapter-guide/
- simplegameguide — Merge Equipment: https://simplegameguide.com/merge-equipment-gear-survivor-io/
- Pocket Gamer — Pets Guide: https://www.pocketgamer.com/survivor-io/pets-guide/
- gamesadda — How To Get Energy: https://gamesadda.in/gaming/survivor-io-get-energy/
- YouTube (tư liệu chương 8/15 phút, ch.1–70): https://www.youtube.com/watch?v=CLXNNX_Vkys

**Phân tích thiết kế / kinh doanh**
- Gamigion — "Survivor.io: The 'Progressive' Monetization Masterclass": https://www.gamigion.com/survivor-io-the-progressive-monetization-masterclass/
- TheGamer — về quan hệ với Vampire Survivors và vai trò của cái chết trong tiến độ: https://www.thegamer.com/vampire-survivors-rip-off-survivor-io-mobile-clone-copy-cat/
- Axios — Survivor.io và TikTok: https://www.axios.com/2022/08/26/survivorio-habby-tiktok-ios-android
- PocketGamer.biz — đổi mới và lặp lại của Survivor.io: https://www.pocketgamer.biz/feature/79592/how-innovation-and-iteration-has-transformed-survivorio/ (403 khi tải)

## B. Minion / Summoner trong ARPG

**Cơ sở dữ liệu game (đáng tin nhất)**
- poedb — Feeding Frenzy Support: https://poedb.tw/us/Feeding_Frenzy_Support
- poedb — Meat Shield Support: https://poedb.tw/us/Meat_Shield_Support
- poedb — Convocation: https://poedb.tw/us/Convocation
- poedb — Desecrate: https://poedb.tw/us/Desecrate
- poedb — Detonate Dead: https://poedb.tw/us/Detonate_Dead
- poedb — Spirit Offering: https://poedb.tw/us/Spirit_Offering
- poedb — Summon Stone Golem: https://poedb.tw/us/Summon_Stone_Golem
- poedb — Summon Carrion Golem: https://poedb.tw/us/Summon_Carrion_Golem
- poedb — Summon Holy Relic: https://poedb.tw/us/Summon_Holy_Relic
- poedb — Animate Guardian: https://poedb.tw/us/Animate_Guardian
- poedb — Ancestral Protector: https://poedb.tw/us/Ancestral_Protector
- poedb — Totem: https://poedb.tw/us/Totem
- poedb — Minion (tổng quan): https://poedb.tw/us/Minion
- poe2db — Direct Minions: https://poe2db.tw/us/Direct_Minions
- poe2db — Skeletal Cleric: https://poe2db.tw/us/Skeletal_Cleric
- poe2db — Skeletal Brute: https://poe2db.tw/us/Skeletal_Brute
- poe2db — Skeletal Warrior: https://poe2db.tw/us/Skeletal_Warrior
- Arreat Summit (D2 chính chủ) — Necromancer Summoning: https://classic.battle.net/diablo2exp/skills/necromancer-summoning.shtml
- Diablo 3 chính chủ — Command Skeletons: https://us.diablo3.blizzard.com/en-us/class/necromancer/active/command-skeletons
- Diablo 3 chính chủ — Sentry: https://us.diablo3.blizzard.com/en-us/class/demon-hunter/active/sentry
- Grim Dawn chính chủ — Combat (stance pet): https://www.grimdawn.com/guide/gameplay/combat/
- Grim Dawn chính chủ — Shaman: https://www.grimdawn.com/guide/classes/shaman/
- Grim Dawn chính chủ — Oathkeeper: https://www.grimdawn.com/guide/classes/oathkeeper/

**Diễn đàn chính chủ / dev**
- Mark_GGG (GGG) về teleport và leash của minion: http://www.pathofexile.com/forum/view-thread/38514/page/1
- PoE forum — Feeding Frenzy đổi hành vi: https://www.pathofexile.com/forum/view-thread/2751010
- PoE 2 forum — minion kẹt geometry: https://www.pathofexile.com/forum/view-thread/3646953
- PoE 2 forum — minion kẹt nhau: https://www.pathofexile.com/forum/view-thread/3692460
- PoE 2 forum — phản hồi summoner Early Access: https://www.pathofexile.com/forum/view-thread/3933046
- PoE 2 patch 0.2.0 (Direct Minions cooldown, Skeletal Cleric): https://www.pathofexile.com/forum/view-thread/3740562
- PoE 2 — danh sách minion & command skill: https://www.pathofexile.com/forum/view-thread/3826682
- Last Epoch — support chính thức về Minions: https://support.lastepoch.com/hc/en-us/articles/46361899830555-Minions
- Last Epoch forum — Defiler of Rebirth build: https://forum.lastepoch.com/t/the-defiler-of-rebirth-a-minion-exploding-necromancer-w-a-strong-bone-curse/40406
- Last Epoch forum — Minion attack command: https://forum.lastepoch.com/t/suggestion-make-minion-ai-more-aggressive-or-give-minion-attack-command/60477
- Last Epoch forum — Dread Shade targeting: https://forum.lastepoch.com/t/necromancer-minion-targeting/69561
- Blizzard forum (D4) — minion command / targeting: https://us.forums.blizzard.com/en/d4/t/minion-command-targeting-uicontroller-mapping/158495
- Blizzard forum (WoW) — vấn đề của pet spec: https://us.forums.blizzard.com/en/wow/t/the-problem-with-pet-specs-and-passive-neverending-damage/1575607
- Steam — Last Epoch, summoner "không cần bấm nút": https://steamcommunity.com/app/899770/discussions/0/3824161508138483678
- Steam — Grim Dawn, điều khiển pet: https://steamcommunity.com/app/219990/discussions/0/2287213008797767213/ và https://steamcommunity.com/app/219990/discussions/0/2425614361137955838/
- Steam — Titan Quest, AI pet: https://steamcommunity.com/app/475150/discussions/0/343786195660601366/
- ESO forum — "Why the pet system is unattractive": https://forums.elderscrollsonline.com/en/discussion/677232/why-the-pet-system-is-unattractive
- EN World — vấn đề của pet class: https://www.enworld.org/threads/the-problem-with-pet-classes-and-a-possible-solution.692853/

**Patch notes chính thức**
- Diablo IV patch 2.5 (Golem chỉ mục tiêu, Unstoppable 3 s): https://news.blizzard.com/en-us/article/24244466/diablo-iv-patch-notes-2-5
- Diablo IV patch 3.0 (bug "pet thụ động teleport để đuổi kịp"): https://news.blizzard.com/en-us/article/24271857/diablo-iv-patch-notes-3-0
- Diablo IV 1.3.3 (buff minion): https://www.gameleap.com/articles/diablo-4-season-3-update-1-3-3-patch-notes-the-gauntlet-minion-buffs-vampiric-powers
- Last Epoch Season 3 — minion changes, sticky targeting: https://maxroll.gg/last-epoch/news/minion-changes-and-quality-of-life-in-season-3

**Tài liệu AI game**
- Game AI Pro 2, chương 35 — "Ellie: Buddy AI in The Last of Us" (Naughty Dog): http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter35_Ellie_Buddy_AI_in_The_Last_of_Us.pdf
- Chưa đọc, có thể hữu ích: Game AI Pro Online 2021 ch.12 "Squad Coordination in Days Gone"; Game AI Pro 3 ch.19 "RVO and ORCA: How They Really Work" (chống chen lấn giữa minion); Game AI Pro ch.21 "Techniques for Formation Movement Using Steering Circles". PDF miễn phí tại http://www.gameaipro.com/
- Devlog indie mô tả máy trạng thái minion 3 nấc: https://alternalo.itch.io/alterworld/devlog/793904/lets-talk-about-minion-ai
- Devlog indie — chế độ đòn đánh trong suốt: https://overboy.itch.io/noobs-are-coming-demo/devlog/1000068/patch-030-the-visibility-and-accessibility-update-new-content-balancing

**Hướng dẫn cộng đồng chất lượng cao**
- Maxroll — D2 Summoner Necromancer: https://maxroll.gg/d2/guides/summoner-necromancer-guide
- Maxroll — D2 Corpse Explosion: https://maxroll.gg/d2/guides/corpse-explosion-necromancer
- Maxroll — D4 Book of the Dead: https://maxroll.gg/d4/resources/necromancer-book-of-the-dead
- Maxroll — PoE 2 Minion Army Infernalist: https://maxroll.gg/poe2/build-guides/minion-army-infernalist-build-guide
- PoE Vault — Minion Army Necro: https://www.poe-vault.com/guides/minion-army-necro-build-guide
- PoE Vault — Spectre Summoner: https://www.poe-vault.com/guides/the-spectre-summoner-build-guide
- PoE Vault — Detonate Dead Necro: https://www.poe-vault.com/guides/unkillable-necro-detonate-dead-necromancer-build-guide
- PoE Vault — Meat Shield Support: https://www.poe-vault.com/items/meat-shield-support
- vhpg — Aggressive minions in PoE: https://www.vhpg.com/poe-aggressive-minions/
- Odealo — D2R Skeleton Summoner build (bảng Pros/Cons): https://odealo.com/articles/skeleton-summon-necromancer-d2r-build
- Lilura1 — phân tích Summonmancer D2: https://lilura1.blogspot.com/2021/02/Diablo-2-Resurrected-Summonmancer-Necromancer-Skeleton-Summoner-Summon-Necro-Best-Build.html
- Project Diablo 2 wiki — Corpse Explosion: https://wiki.projectdiablo2.com/wiki/Necromancer_Corpse_Explosion_Guide
- Diablo Wiki — D2 Necromancer Summoning (AI skeleton): https://diablo2.diablowiki.net/Necromancer_Summoning
- DiabloFans — D3 Witch Doctor pet build: https://www.diablofans.com/builds/88355-diablo-3-2-4-1-best-witch-doctor-pet-build-and
- Blizzard Watch — D4 Book of the Dead: https://blizzardwatch.com/2023/05/30/necromancer-book-dead-diablo-4/
- GameSpot — D4 Book of the Dead: https://www.gamespot.com/articles/diablo-4-necromancer-book-of-the-dead-guide/1100-6512713/
- Game8 — PoE 2 Reviving Minions: https://game8.co/games/Path-of-Exile-2/archives/498765
- Game8 — PoE 2 Command skills: https://game8.co/games/Path-of-Exile-2/archives/488581
- EpicCarry — PoE 2 command skills: https://epiccarry.com/blogs/how-to-use-command-skills-for-minions-in-path-of-exile-2-guide/
- TheGamer — các game có class summoner/pet: https://www.thegamer.com/video-games-with-summoner-pet-familiar-classes/
- Fandom PoE (chặn tải, dùng qua trích dẫn): /wiki/Offering , /wiki/Flesh_Offering , /wiki/Bone_Offering , /wiki/Meat_Shield_Support , /wiki/Feeding_Frenzy_Support , /wiki/Predator_Support
- Fandom Last Epoch — Sacrifice: https://lastepoch.fandom.com/wiki/Sacrifice

## C. Thiết kế "người chơi không nhắm" / idle / UI di động

- Wikipedia — Vampire Survivors: https://en.wikipedia.org/wiki/Vampire_Survivors
- The Conversation — tâm lý học cờ bạc trong Vampire Survivors: https://theconversation.com/vampire-survivors-how-developers-used-gambling-psychology-to-create-a-bafta-winning-game-203613
- kokutech — phân tích thiết kế Vampire Survivors: https://www.kokutech.com/blog/gamedev/design-patterns/power-fantasy/vampire-survivors (429 khi tải, dùng qua trích dẫn)
- PC Gamer — Galante và game cờ bạc di động: https://www.pcgamer.com/vampire-survivors-saved-its-creator-from-working-on-mobile-gambling-games/ (chặn tải)
- BrigNews — autobattler comeback: https://brignews.com/2022/04/25/spotlight-on-vampire-survivors-and-the-comeback-of-the-auto-battler/
- GDC Vault — "Teamfight Tactics Design Lessons", David Abecassis, GDC 2020: https://gdcvault.com/play/1026808/-Teamfight-Tactics-Design
- Game Developer — tóm tắt talk TFT tại GDC 2020: https://www.gamedeveloper.com/design/get-key-game-design-insights-from-riot-s-i-teamfight-tactics-i-at-gdc-2020-
- Alharthi, Alsaedi, Toups, Tanenbaum, Hammer — "Playing to Wait: A Taxonomy of Idle Games", CHI 2018: https://dl.acm.org/doi/10.1145/3173574.3174195
- Cùng nhóm — "It Started as a Joke: On the Design of Idle Games", CHI PLAY 2019: https://dl.acm.org/doi/10.1145/3311350.3347180
- Machinations — Idle games and how to design them: https://machinations.io/articles/idle-games-and-how-to-design-them
- bugnet.io — How to design an idle/incremental game: https://bugnet.io/blog/how-to-design-an-idle-or-incremental-game
- Vrunik — UX cho game di động màn hình nhỏ: https://vrunik.com/ux-for-mobile-games-optimizing-user-interfaces-for-small-screens/
- Mobbin — Badge UI: https://mobbin.com/glossary/badge
- Setproduct — Badge UI design: https://www.setproduct.com/blog/badge-ui-design
- Braze — "Red Dot Blindness": https://www.braze.com/resources/articles/beware-red-dot-badging
- ProGameGuides — Archero best pets: https://progameguides.com/archero/archero-best-pets/
- tap-guides — Legend of Mushroom best pets: https://tap-guides.com/2026/08/01/legend-of-mushroom-best-pets-guide/

---

## Ghi chú độ tin cậy — đọc trước khi trích lại

**Tải được trực tiếp và đã đọc nội dung:** poedb, poe2db, forum chính chủ pathofexile.com,
Arreat Summit, trang class chính chủ Diablo 3, guide chính chủ Grim Dawn, patch notes Blizzard,
Steam Community, Wikipedia, ACM, Maxroll, PoE Vault, Game AI Pro 2 PDF, và phần lớn hướng dẫn
Survivor.io.

**Chặn truy cập tự động, chỉ có qua trích dẫn của công cụ tìm kiếm — nên kiểm lại bằng trình
duyệt trước khi trích nguyên văn:**
- `survivorio.fandom.com` và toàn bộ Fandom — HTTP 402
- `poewiki.net` — Anubis anti-bot
- `support.lastepoch.com`, `lastepochtools.com` — chặn fetch
- `icy-veins.com`, `thegamer.com`, `pocketgamer.io`, `appgamer.com`, `progameguides.com`,
  `pocketgamer.biz` — HTTP 403
- `kokutech.com` — HTTP 429
- `pcgamer.com` (phỏng vấn Galante) — chặn fetch
- `reddit.com` — chặn hoàn toàn; toàn bộ phần "cộng đồng nói gì" thay bằng Steam Community và
  forum chính chủ

**Không tìm được, và KHÔNG được bịa:**
1. **Bảng tỉ lệ rơi (drop rate) công bố chính thức của Survivor.io.** Chỉ có cơ chế pity 10 lần.
2. **Bảng trần-cấp-theo-bậc-hiếm của trang bị Survivor.io.**
3. **Bán kính aggro/leash bằng đơn vị game của BẤT KỲ ARPG lớn nào.** Đơn vị tuyệt đối duy nhất
   tìm được: PoE totem placement 85 unit, PoE Stone Golem slam ~20 unit, D3 Sentry Polar Station
   16 yard, D3 Kill Command 15 yard.
4. **Patch note về "minion trong suốt" hay "bóng nhân vật xuyên qua minion"** ở bất kỳ ARPG lớn
   nào. Tiền lệ duy nhất là một game indie (*NOOBS ARE COMING*).
5. **GDC talk chuyên về minion AI trong ARPG** — không tồn tại. Nguồn phân tích tốt nhất là
   Game AI Pro 2 chương 35, nói về companion AI (1 buddy), không phải army-of-minions.
6. **D4 Book of the Dead chi tiết** (Skirmishers / Defenders / Reapers và việc Defenders có taunt
   hay không) — mọi nguồn 403/502. **Đừng khẳng định Defenders có taunt.**
