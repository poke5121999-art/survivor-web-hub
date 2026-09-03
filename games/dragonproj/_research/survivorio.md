# Nghiên cứu Survivor.io (Habby) — dữ liệu cho port thiết kế

Quy ước: mỗi số liệu có link nguồn. `[SUY ĐOÁN]` = suy luận của người viết, không có nguồn trực tiếp. `[ĐO ĐƯỢC]` = số lấy từ dữ liệu đào ra của game (wiki data-mined) hoặc phát biểu trực tiếp từ nhà phát triển/nguồn chính thức.

---

## 1. Cấu trúc ải (Chapter/Stage) & tiến trình

### 1.1 Đơn vị "ải"

- Game hiện có tới **~345 chapter** (bản 4th-anniversary 2026, chapter 341–345 là mới nhất) — số chapter tăng liên tục qua các bản cập nhật ([Survivorio Fandom — Update History, qua WebSearch snippet](https://survivorio.fandom.com/wiki/Update_History)).
- Mỗi **Chapter** = một bối cảnh/màn chơi cụ thể (ví dụ Chapter 1 "Wild Streets", Chapter 6 "Suburbia", Chapter 10 "Country Road") ([Survivorio Fandom — Chapters](https://survivorio.fandom.com/wiki/Chapters)).
- Thời lượng một ải (main chapter): **15 phút** là chuẩn phổ biến ở early/mid game, một số ải ngắn hơn (**8 phút**) xuất hiện trong danh sách "All 8 Minute Chapters" ([TikTok compilation, qua WebSearch](https://www.tiktok.com/discover/all-8-minute-chapters-in-survivor-io); [ĐO ĐƯỢC] Chapter 6 & Chapter 10 đều 15 phút, 3 boss/ải — [Survivorio Fandom Chapter 6](https://survivorio.fandom.com/wiki/Chapter_6_-_Suburbia), [Chapter 10](https://survivorio.fandom.com/wiki/Chapter_10_-_Country_Road)).
- Boss xuất hiện định kỳ trong ải: ải mẫu có boss đầu ở phút 5 (Bouncebloom) và boss thứ hai ở phút 10 (Devourer), boss cuối/ải ở cuối giờ ([ProGameGuides — How to clear chapters 1-10](https://progameguides.com/survivor-io/how-to-clear-chapters-1-10-in-survivor-io/) qua WebSearch summary).
- "Clear" một ải = sống sót đủ thời lượng ải **và** hạ được boss cuối cùng ([ProGameGuides, như trên](https://progameguides.com/survivor-io/how-to-clear-chapters-1-10-in-survivor-io/)).
- Số quái trong một ải rất lớn và tăng theo chapter: Chapter 6 ≈ **38.000 quái**, Chapter 10 ≈ **95.000 quái** `[ĐO ĐƯỢC]` ([Survivorio Fandom Chapter 6](https://survivorio.fandom.com/wiki/Chapter_6_-_Suburbia), [Chapter 10](https://survivorio.fandom.com/wiki/Chapter_10_-_Country_Road)).

### 1.2 Chi phí năng lượng (Energy/Stamina)

| Hoạt động | Chi phí Energy | Nguồn |
|---|---|---|
| Chơi 1 lượt ải chính (main chapter) | **5 Energy** | [WriterParty — Energy Guide](https://writerparty.com/party/survivor-io-energy-guide/) qua WebSearch |
| Quick Patrol (đổi lấy 300 phút thành quả AFK) | **15 Energy**, tối đa 3 lần/ngày (không tính quảng cáo) | [mturbogamer — Patrol & Quick Patrol Guide](https://mturbogamer.com/2022/09/survivor-io-patrol-quick-patrol/) |
| Hồi Energy tự nhiên | 1 điểm / **20 phút** | [WriterParty — Energy Guide](https://writerparty.com/party/survivor-io-energy-guide/) |
| Trần Energy tối đa | **30** (F2P) / **50** (có Super Monthly Card) | [mturbogamer — Patrol Guide](https://mturbogamer.com/2022/09/survivor-io-patrol-quick-patrol/) |
| Mua thêm Energy bằng gem | 100 gem = 15 Energy (tối đa 3 lần/ngày); trần **300 gem/ngày** cho 45 Energy | [WebSearch tổng hợp WriterParty + mturbogamer](https://writerparty.com/party/survivor-io-energy-guide/) |
| Trials/Main Challenge | **Không tốn Energy**, chơi lại vô hạn | [WriterParty — Trials Guide](https://writerparty.com/party/survivor-io-trials-guide-and-walkthrough/) |

→ Với 5 Energy/lượt, trần 30 Energy = tối đa **6 lượt ải chính** trước khi hết Energy tự nhiên (chưa tính nạp lại) `[SUY ĐOÁN]` (suy ra từ hai số trên).

### 1.3 Độ khó & Trials

- **Trials**: mỗi chapter có **3 Trial** tăng dần độ khó, không tốn Energy, mở dựa trên chapter đã qua ở chế độ chính ([mturbogamer/WriterParty tổng hợp](https://writerparty.com/party/survivor-io-trials-guide-and-walkthrough/)):
  - **Tier 1 (dễ)**: modifier "Fury" — toàn bộ quái có Haste (nhanh hơn vĩnh viễn). Thưởng: **200 gem**.
  - **Tier 2 (khó)**: giữ Fury, cộng thêm "Doomsday" (giảm 50% EXP và tỉ lệ rơi power-up) và "Evolve" (buff ATK/HP quái). Thưởng: **1 Key Evo**.
  - **Tier 3 (Nightmare)**: khó nhất. Thưởng: **200 gem + 1 Key Evo**.
  ([WebSearch tổng hợp, nguồn gốc theclashify.com wiki](https://theclashify.com/survivor-io-wiki/))
- **Mega Challenge**: mở sau khi qua Chapter 2, nằm trong menu Trials; đặc điểm — chỉ số nhân vật (stats) **không có tác dụng**, boss gần như vô hạn, độ khó phụ thuộc RNG nặng (người chơi Lv.60 kỹ năng cao vẫn thường cần >5 lần thử) ([PocketGamer — Mega Challenge guide, qua WebSearch](https://www.pocketgamer.com/survivor-io/mega-challenge-guide/)).
- **Steamroll Mode**: mở sau khi hoàn thành Chapter 20 (chỉ hiện khi nhân vật đủ mạnh) — cho phép "cày nhanh" ải chính đã qua: ải 15 phút rút còn **5 phút**, ải 8 phút rút còn **2 phút**, vẫn nhận đủ mốc thưởng (Survive-X-phút, Clear) đã quy đổi theo tỉ lệ thời gian rút gọn, và vẫn có rương Combat Supplies đầu ải ([Survivorio Fandom — Steamroll Mode, qua WebSearch](https://survivorio.fandom.com/wiki/Steamroll_Mode)). Đây gần tương đương cơ chế "sweep" nhưng vẫn phải chơi trực tiếp (auto/qua nhanh), không phải một lệnh "quét" tức thời.

---

## 2. Thưởng sau ải (Post-stage reward)

### 2.1 Thưởng clear ải chính

- Ví dụ cụ thể `[ĐO ĐƯỢC]` (dữ liệu wiki):
  - Chapter 6 (Suburbia): **1.500 Clear XP**, **0 Clear Energy** ([Survivorio Fandom Chapter 6](https://survivorio.fandom.com/wiki/Chapter_6_-_Suburbia)).
  - Chapter 10 (Country Road): **1.900 Clear XP**, **17 Clear Energy** ([Survivorio Fandom Chapter 10](https://survivorio.fandom.com/wiki/Chapter_10_-_Country_Road)).
  - → XP thưởng tăng dần theo chapter; một số chapter còn hoàn lại Energy (gần như "miễn phí" chi phí lượt chơi) `[SUY ĐOÁN]` dựa trên so sánh 2 mốc trên.
- **Chapter Chest**: mốc thưởng phụ trong 1 ải — claim được sau khi sống sót đủ mốc thời gian (ví dụ 5 phút, 10 phút) và sau khi clear cả chapter; cho **gem + gold**, có mốc **100 gem miễn phí** ngay khi mở ([WebSearch tổng hợp beginner guides](https://onechilledgamer.com/survivor-io-guide-and-tips-for-beginners/)).
- Rương lúc bắt đầu ải: **Combat Supplies chest** đầu mỗi ải (kể cả khi chạy Steamroll) ([Survivorio Fandom — Steamroll Mode](https://survivorio.fandom.com/wiki/Steamroll_Mode)).

### 2.2 First-clear vs repeat-clear

- **Main Challenge (Trials) stage 1 & 3 lần đầu**: **200 gem** ([WebSearch tổng hợp mturbogamer](https://mturbogamer.com/2022/12/survivor-io-best-fastest-way-to-get-gems/)).
- Qua **chapter mới lần đầu**: **100 gem**; mốc rương thứ hai của chapter: thêm **100 gem**; hoàn thành "level" trong chapter: **20 gem** ([mturbogamer — Best & Fastest Way to Get Gems](https://mturbogamer.com/2022/12/survivor-io-best-fastest-way-to-get-gems/)).
- **Mega Challenge**: mỗi challenge **200 gem**, làm đủ cả 3 (thường 3 kiểu địa hình khác nhau) = **600 gem** ([mturbogamer, như trên](https://mturbogamer.com/2022/12/survivor-io-best-fastest-way-to-get-gems/)).
- Chơi lại (repeat clear) ải chính **không** cho gem trực tiếp — nguồn thu chính khi lặp lại là **Patrol/AFK** (Gold, XP, Design, Equipment), không phải gem `[SUY ĐOÁN]` rút ra từ việc không nguồn nào liệt kê gem cho repeat-clear ải chính; xem 2.3.

### 2.3 Patrol (hệ thống AFK)

- Patrol mở ngay sau khi qua xong **Chapter 1** ([mturbogamer — Patrol Guide](https://mturbogamer.com/2022/09/survivor-io-patrol-quick-patrol/)).
- Công thức thu nhập thụ động theo giờ (nguồn không chính thức, mang tính công thức cộng đồng suy ra) `[SUY ĐOÁN — công thức cộng đồng]`:
  - Gold/giờ ≈ **3.000 + 300 × Chapter đã hoàn thành**
  - XP/giờ ≈ **1.200 + 120 × Chapter đã hoàn thành**
  - Ví dụ hoàn thành Chapter 50 → **18.000 Gold/giờ**, **7.200 XP/giờ**.
  ([mturbogamer — Patrol & Quick Patrol Guide](https://mturbogamer.com/2022/09/survivor-io-patrol-quick-patrol/))
- Trần tích lũy AFK: **16–24 giờ** tùy nguồn (16 giờ theo mturbogamer, 24 giờ theo BlueStacks) ([mturbogamer](https://mturbogamer.com/2022/09/survivor-io-patrol-quick-patrol/); [BlueStacks Beginner Guide](https://www.bluestacks.com/blog/game-guides/survivor-io/sio-beginner-guide-en.html)).
- **Quick Patrol**: đổi **15 Energy** lấy ngay **300 phút (5 giờ)** thành quả Patrol; tối đa **3 lần/ngày** bằng Energy + **1 lần/ngày** miễn phí qua quảng cáo ([mturbogamer, như trên](https://mturbogamer.com/2022/09/survivor-io-patrol-quick-patrol/)).
- Số Equipment rơi ra mỗi lượt Patrol tăng theo chapter: 3 món (chapter 16–18) → 4 món (chapter 36) → 5 món (chapter 50) ([mturbogamer, như trên](https://mturbogamer.com/2022/09/survivor-io-patrol-quick-patrol/)).
- Super Monthly Card: +3 lượt Quick Patrol/ngày, +10% Gold/XP, bỏ yêu cầu xem quảng cáo ([mturbogamer, như trên](https://mturbogamer.com/2022/09/survivor-io-patrol-quick-patrol/)).
- Clan cấp cao mở thêm lượt Quick Patrol: Lv.3 (+1), Lv.9 (+1), Lv.15 (+1) ([mturbogamer, như trên](https://mturbogamer.com/2022/09/survivor-io-patrol-quick-patrol/)).

### 2.4 Kết luận cho câu hỏi trọng tâm — nhịp độ gacha/ngày

**Gem KHÔNG đến từ việc cày lại ải chính** (ải chính → Gold/XP/Equipment qua Patrol). Gem đến từ một tập hợp các "mode phụ" chạy song song, có trần rõ ràng mỗi ngày/tuần:

| Nguồn gem | Số lượng | Tần suất | Nguồn |
|---|---|---|---|
| Tap đầu tiên trong shop | 30 gem | 1 lần/ngày | [mturbogamer — Best & Fastest Way to Get Gems](https://mturbogamer.com/2022/12/survivor-io-best-fastest-way-to-get-gems/) |
| Quảng cáo trong shop | 60 gem | 1 lần/ngày (2 quảng cáo) | như trên |
| Quảng cáo giảm giá | 10 gem | 1 lần/ngày | như trên |
| Nhiệm vụ ngày | 80 gem | 1 lần/ngày | như trên |
| Rương Daily Challenge | 30 gem | 1 lần/ngày | như trên |
| Nhiệm vụ tuần | 450 gem | 1 lần/tuần (≈64/ngày) | như trên |
| Điểm danh tuần | 250 gem | 1 lần/tuần (≈36/ngày) | như trên |
| Điểm danh 10 ngày | 150 gem | 1 lần/10 ngày (≈15/ngày) | như trên |
| Gói miễn phí ngày/tuần/tháng | 10 / 50 / 100 gem | theo chu kỳ | như trên |

Tổng ước tính F2P thuần túy từ các nguồn hằng ngày/định kỳ ở trên ≈ **300–330 gem/ngày** `[SUY ĐOÁN — cộng dồn từ bảng trên]`. Cộng thêm biến động lớn từ Trials/Mega Challenge (200–600 gem, one-off theo chapter mới) và Special Ops/Ender's Echo (xem dưới) khi các mode này hoạt động.

- **Special Ops**: nhiệm vụ bậc "blue" cho **100 gem/nhiệm vụ**; chạy hết trong ngày có thể vượt **500 gem/ngày** ([mturbogamer, như trên](https://mturbogamer.com/2022/12/survivor-io-best-fastest-way-to-get-gems/)).
- **Ender's Echo** (boss rush 28-ngày/mùa): thưởng theo mốc sống sót (1/2/3 phút → rương tech part), cứ 2 trận có 1 rương gem+energy essence; hạng cao trên bảng xếp hạng có thể nhận **3.000–5.000 gem/mùa** ([mturbogamer — Best & Fastest Way to Get Gems](https://mturbogamer.com/2022/12/survivor-io-best-fastest-way-to-get-gems/); [ProGameGuides — Ender's Echo Tips](https://progameguides.com/survivor-io/tips-tricks-for-enders-echo-in-survivor-io/)).
- **Zone Operations**: **100–200 gem/cấp** ([mturbogamer, như trên](https://mturbogamer.com/2022/12/survivor-io-best-fastest-way-to-get-gems/)).

**Thiết kế chính**: gacha currency (gem) được tách khỏi vòng lặp cày ải chính (core loop farming). Ải chính chỉ tạo **Gold + XP + Equipment thô** qua Patrol; gem đến từ một lớp "meta-game" các mode có giới hạn ngày/tuần/mùa (nhiệm vụ, Trials, Ender's Echo, Special Ops) — nghĩa là tốc độ pull gacha bị chặn bởi **số lượng task/mode hoàn thành mỗi ngày**, không bị chặn bởi **Energy** (vì Trials không tốn Energy) `[SUY ĐOÁN — tổng hợp từ toàn bộ bảng trên]`.

---

## 3. Kinh tế tiền tệ (Currency)

| Currency | Vai trò | Nguồn thu chính | Nguồn tiêu | Nguồn |
|---|---|---|---|---|
| **Gold** | Tiền "vàng" — nâng cấp trang bị, evolution nhân vật, stat boost | Patrol/AFK (chính), clear ải, Chapter Chest, xem quảng cáo | Level-up Equipment, Evolution Table (nâng chỉ số nhân vật), stat boost | [PocketGamer.io — Gold guide](https://pocketgamer.io/best-ways-to-get-gold-all-methods-and-tips/) qua WebSearch; [WebSearch tổng hợp evolution](https://onechilledgamer.com/survivor-io-skill-guide/) |
| **Gems** | Tiền premium — mua Supply Chest (gacha equipment), refill Energy, đổi Gold | Nhiệm vụ ngày/tuần, Trials, event, IAP | EDF/S Grade Supplies (gacha), refill Energy, đổi Gold, mua Character shard | (xem bảng mục 2.4) |
| **Energy** | Vé chơi ải chính | Hồi tự nhiên (1/20 phút), IAP/ad, Energy Essence | Chơi ải chính (5), Quick Patrol (15) | [WriterParty — Energy Guide](https://writerparty.com/party/survivor-io-energy-guide/) |
| **Energy Essence** | Vật phẩm quy đổi ra Energy (không phải currency chạy song song mà là item nạp Energy) | Ender's Echo, event | Đổi trực tiếp ra Energy | [mturbogamer — Get & Use Energy Essence](https://mturbogamer.com/2022/12/survivor-io-how-to-get-energy-essence/) qua WebSearch |
| **Special Ops Coin / Voucher** | Tiền phụ dùng cho summon trang bị ở mode Special Ops | Hoàn thành nhiệm vụ Special Ops | Đổi lấy trang bị/shard nhân vật | [WebSearch tổng hợp](https://writerparty.com/party/survivor-io-best-characters-guide-unlock-all-heroes-and-character-shards/) |
| **Character/Hero Shards** | "Mảnh" gacha riêng cho từng nhân vật (per-character pity) | Ender's Echo, Special Ops Coin, event, level/boss reward | Ghép đủ mảnh để unlock/upgrade nhân vật | [WriterParty — Best Characters Guide](https://writerparty.com/party/survivor-io-best-characters-guide-unlock-all-heroes-and-character-shards/) |
| **Design** (vật phẩm) | Nguyên liệu nâng cấp Equipment (đi kèm Gold) | Boss drop, clear ải, Patrol | Level-up Equipment | [WebSearch tổng hợp evolution guide](https://onechilledgamer.com/survivor-io-skill-guide/) |
| **Key Evo** | Vé mở nội dung evolution/Trials Tier cao | Thưởng Trial Tier 2/3 | Mở khóa evolution table nâng cao | [theclashify.com wiki](https://theclashify.com/survivor-io-wiki/) qua WebSearch |

### Tỉ giá quy đổi cụ thể

- Đổi Gold bằng Gem trong shop: **288 gem → 115.200 Gold** (≈ **400 Gold/gem**, coi là mức "rẻ" theo cộng đồng) ([mturbogamer — Best Way to Spend Gems](https://mturbogamer.com/2022/10/survivor-io-best-way-to-spend-gems/) qua WebSearch).
- Đổi Energy bằng Gem: **100 gem → 15 Energy** (tối đa 3 lần/ngày); gói lớn hơn **300 gem → 45 Energy/ngày** ([WebSearch tổng hợp WriterParty + mturbogamer](https://writerparty.com/party/survivor-io-energy-guide/)).
- Chi phí 1 lượt Supply Chest (gacha equipment) — xem mục 5.

---

## 4. Hệ thống trang bị (Equipment/Gear)

### 4.1 6 slot trang bị

Weapon (vũ khí), Necklace (dây chuyền), Gloves (găng tay), Armor/Chest (áo giáp), Belt (thắt lưng), Shoes (giày) — mỗi slot chỉ nhận đúng 1 loại, tổng cộng **6 món trang bị mỗi lúc** ([OneChilledGamer — Equipment Guide](https://onechilledgamer.com/survivor-io-equipment-guide/); danh sách item cụ thể theo slot — [Survivorio Fandom — Equipment](https://survivorio.fandom.com/wiki/Equipment) qua WebSearch).

### 4.2 Thang bậc hiếm (rarity ladder)

Thang đầy đủ, thấp → cao `[ĐO ĐƯỢC — tổng hợp nhiều nguồn khớp nhau]`:

```
Common/Normal (Xám) → Good (Xanh lá) → Better (Xanh dương)
→ Excellent (Tím) → Excellent+1 → Excellent+2
→ Epic (Vàng) → Epic+1 → Epic+2 → Epic+3
→ Legendary (Đỏ) → Legendary+1..+4
→ S-grade (vượt trên Excellent gốc, chế từ merge Legendary)
→ SS-grade (ghép từ nhiều S-grade)
```
Nguồn: [OneChilledGamer — Equipment Guide](https://onechilledgamer.com/survivor-io-equipment-guide/) (liệt kê 10–15 cấp Common→Legendary+4 tùy bản); [Survivorio Fandom — S grade equipment](https://survivorio.fandom.com/wiki/S_grade_equipment) qua WebSearch ("S-Grade là lớp đặc biệt trên Excellent"); [Survivorio Fandom — SS equipment](https://survivorio.fandom.com/wiki/SS_equipment) qua WebSearch ("SS được rèn từ nhiều mảnh S-Grade hợp lại thành một").

Lưu ý: đề bài hỏi thang "Common → Chaos" — game **không dùng từ "Chaos" làm một cấp hiếm**; "Chaos Fusion" là một **hệ nâng cấp phụ áp cho SS gear cao cấp nhất** (xem 4.4), không phải bậc rarity kế tiếp sau SS `[SUY ĐOÁN — làm rõ khác biệt thuật ngữ]`.

### 4.3 Công thức ghép/fusion (chi tiết số lượng)

| Bước ghép | Nguyên liệu | Nguồn |
|---|---|---|
| Ghép chung (nguyên tắc cơ bản) | 3 món cùng loại/cùng cấp | [mturbogamer — Merge Items Guide](https://mturbogamer.com/2022/09/survivor-io-how-to-merge-items-guide/) |
| Excellent → Excellent+1 | 2 Excellent gốc | [mturbogamer — Get Epic Equipment](https://mturbogamer.com/2022/09/survivor-io-how-to-get-epic-equipment/) |
| Excellent+1 → Excellent+2 | 2 Excellent+1 | như trên |
| Excellent+2 → **Epic** | 2 Excellent+2 | như trên |
| Epic → Epic+1 | 1 Epic + 1 Epic | [mturbogamer — Get Legendary Equipment](https://mturbogamer.com/2022/10/survivor-io-how-to-get-legendary-red-equipment/) |
| Epic+1 → Epic+2 | 1 Epic+1 + 1 Epic+1 | như trên |
| Epic+2 → Epic+3 | 1 Epic+2 + 1 Epic+2 | như trên |
| Epic+3 → **Legendary** | 1 Epic+3 + 2 Epic khác | như trên |

→ Tổng để ra 1 **Epic** từ Excellent gốc: cần **8 món Excellent** (2+2+2+2 qua 3 bước) `[ĐO ĐƯỢC — cộng dồn]` ([mturbogamer, như trên](https://mturbogamer.com/2022/09/survivor-io-how-to-get-epic-equipment/)).
→ Tổng để ra 1 **Legendary** từ Epic gốc: cần **6 món Epic** (qua chuỗi Epic→+1→+2→+3, cộng 2 Epic phụ ở bước cuối) `[ĐO ĐƯỢC — cộng dồn]` ([mturbogamer, như trên](https://mturbogamer.com/2022/10/survivor-io-how-to-get-legendary-red-equipment/)).

Epic/Legendary **không thể mua trực tiếp** từ Supply Chest — chỉ ra được bằng cách ghép từ cấp thấp hơn ([mturbogamer, tổng hợp WebSearch](https://mturbogamer.com/2022/09/survivor-io-how-to-get-epic-equipment/)).

### 4.4 S-grade và SS-grade (endgame)

- **S-grade**: cấp đặc biệt trên Excellent, không ra từ merge chuỗi thường mà chủ yếu từ Supply Chest tỉ lệ cao ([Survivorio Fandom — S grade equipment](https://survivorio.fandom.com/wiki/S_grade_equipment) qua WebSearch).
- **SS-grade**: rèn ("forge") từ **nhiều mảnh S-grade** hợp lại thành 1 món SS ([Survivorio Fandom — SS equipment](https://survivorio.fandom.com/wiki/SS_equipment) qua WebSearch). Công thức chế 1 món SS gốc `[ĐO ĐƯỢC]`:
  - **50 Eternal Core + 50 Void Core + 2.000 Base Tech Material**
  - Core lấy từ rã (salvage) S-grade: item Purple cho **10 core**, item Yellow cho **20 core** → cần rã ước chừng **10 món S-grade** để đủ nguyên liệu chế 1 SS.
  - F2P cày mạnh có thể ra SS đầu tiên trong **15–20 ngày**.
  ([mturbogamer — SS Gear Guide](https://mturbogamer.com/2026/07/survivor-io-ss-gear-guide-upgrade-order/))
- **Astral Forging (AF)**: hệ nâng cấp SS gear theo cấp (AF1, AF2…), chi phí Relic Core tăng dần (AF1 = 1 core/bên, AF2 = 2 core/bên...) ([mturbogamer, như trên](https://mturbogamer.com/2026/07/survivor-io-ss-gear-guide-upgrade-order/); xác nhận cơ chế AF tồn tại — [Survivorio Fandom — Astral forge](https://survivorio.fandom.com/wiki/Astral_forge) qua WebSearch).
- **Chaos Fusion**: mở khi tổng AF-level đạt 3 (vd cấu hình E1V2); nạp thêm Relic Core để lên các mốc biến hình vũ khí:
  - **Chaos Wind** (9 điểm): đổi skin + tăng hiệu ứng đòn đánh.
  - **Wrathful Cleaver** (18 điểm): biến hình dạng búa mạnh hơn.
  - **Moonslicer Scythe** (27 điểm): đỉnh hiện tại của quá trình evolve vũ khí.
  - Đầu tư tối đa 1 món: tới **45 Relic Core** — tính năng dành cho player chi tiêu mạnh ("cá voi").
  ([mturbogamer — SS Gear Guide](https://mturbogamer.com/2026/07/survivor-io-ss-gear-guide-upgrade-order/))
- Game **không xác nhận có "gear set bonus"** kiểu (mặc đủ N món cùng bộ được cộng thêm) trong các nguồn đã kiểm tra ([OneChilledGamer — Equipment Guide](https://onechilledgamer.com/survivor-io-equipment-guide/) — không đề cập set bonus dù được hỏi trực tiếp) `[SUY ĐOÁN — dựa trên việc vắng mặt thông tin, không phải xác nhận phủ định chắc chắn]`.

---

## 5. Gacha / Banner

Survivor.io **không có banner nhân vật kiểu Genshin/Blue Archive** (không có "up-rate 50/50", không pity theo nghĩa cổ điển) — gacha chủ yếu xoay quanh **rương trang bị (Supply Chest)** và **mảnh nhân vật (character shard)** rải rác từ nhiều mode, không phải một hệ banner tập trung `[SUY ĐOÁN — kết luận từ việc không tìm được trang "banner" chính thức nào, trong khi có nhiều trang mô tả "Supply Chest"]`.

| Loại rương | Giá | Vật phẩm có thể ra | Pity/Guarantee | Nguồn |
|---|---|---|---|---|
| **EDF Supplies** | 300 gem/lượt | Good, Better, Excellent (ít khả năng S-grade) | Đảm bảo ra **1 món Excellent sau mỗi 10 lượt mở** (đếm reset nếu ra Excellent/S sớm hơn) | [mturbogamer — How to Get S Grade Equipment](https://mturbogamer.com/2022/12/survivor-io-how-to-get-s-grade-equipment/); xác nhận chéo qua [WebSearch tổng hợp](https://writerparty.com/party/survivor-io-how-to-get-better-excellent-and-s-grade-supplies-and-equipment/) |
| **S Grade Supplies** | 300 gem/lượt, **2.680 gem cho 10 lượt** (giảm ~10,7% so với mua lẻ) | Good, Better, Excellent, S-grade | Đảm bảo ra **1 món S-grade sau mỗi 50 lượt mở**; tỉ lệ ra S-grade cao hơn hẳn EDF Supplies | [mturbogamer — SS Gear/S Grade Guide, tổng hợp WebSearch](https://mturbogamer.com/2022/12/survivor-io-how-to-get-s-grade-equipment/) |
| **Army Crate** | Miễn phí (nhiệm vụ/patrol) | Chỉ Normal/Good | Không có pity — không ra Excellent/Epic/Legendary | [WebSearch tổng hợp](https://mturbogamer.com/2022/09/survivor-io-how-to-merge-items-guide/) |
| **EDF Key crate** (biến thể) | EDF Key (login/weekly/ads/event) | Tương tự EDF Supplies | 1 EDF Key mỗi 7 ngày đăng nhập | [mturbogamer — S Grade Equipment Guide](https://mturbogamer.com/2022/12/survivor-io-how-to-get-s-grade-equipment/) |
| **Spring Carnival** (gacha sự kiện theo mùa) | 3 vé/lượt quay | Vật phẩm sự kiện, "Sampling" tỉ lệ nhận từng phần | Tích lũy dần theo Sunk-Cost (thu thập mảnh) | [Gamigion — "Progressive" Monetization Masterclass](https://www.gamigion.com/survivor-io-the-progressive-monetization-masterclass/) |
| **Character/Hero Shard** (per-character) | Free-to-earn qua Ender's Echo, Special Ops Coin, event; hoặc mua thẳng bằng gem | Mảnh riêng từng nhân vật | Không "pity" toàn cục — mỗi nhân vật có ngưỡng mảnh riêng, ví dụ 1 nhân vật cần **50 shard hoặc 6.000 gem**; nhân vật khác cần **80/120 shard** hoặc trả tiền thật | [WriterParty — Best Characters Guide](https://writerparty.com/party/survivor-io-best-characters-guide-unlock-all-heroes-and-character-shards/) |

**Epic/Legendary/SS không rơi trực tiếp từ gacha** — luôn phải ghép (merge) từ cấp thấp hơn có được từ gacha (xem mục 4.3–4.4). Điều này khiến "pity" thực chất nằm ở hai lớp: (1) pity của rương (đảm bảo cấp Excellent/S sau N lượt mở) và (2) "pity" ẩn qua số lượng vật phẩm cần ghép dồn `[SUY ĐOÁN — khái quát hóa cơ chế]`.

---

## 6. Cảm giác chơi trong ải: skill, vũ khí, điều khiển

### 6.1 Chủ động / bị động (Active/Passive split)

- **Offensive Weapon** (vũ khí tấn công — tự động đánh quái) và **Passive Support Skill** (tăng chỉ số: ATK, tốc chạy, giảm cooldown, HP...) là hai nhóm skill tách biệt, chọn ngẫu nhiên khi lên cấp trong ải ([BlueStacks — Skills and Evolution Guide](https://www.bluestacks.com/blog/game-guides/survivor-io/sio-skills-evolution-guide-en.html)).

### 6.2 Evolution (kết hợp Weapon + Support Skill)

- Điều kiện evolve: **vũ khí đạt cấp 5** + đã có **support skill tương ứng** cùng lúc; khi đủ, việc mở **rương vàng từ boss** sẽ tự trả về dạng evolve ([BlueStacks — Skills and Evolution Guide](https://www.bluestacks.com/blog/game-guides/survivor-io/sio-skills-evolution-guide-en.html)).
- Bảng evolve đầy đủ đã xác nhận `[ĐO ĐƯỢC — tổng hợp community]`:

| Vũ khí gốc | Skill bị động ghép | Kết quả evolve |
|---|---|---|
| Bat (Baseball Bat) | Fitness Guide | Lucile |
| Boomerang | Hi-Power Magnet | Magnetic Dart |
| Brick | Fitness Guide | Dumbbell |
| Drill Shot | Ammo Thruster | Whistling Arrow |
| Drone Type-A + Type-B | (ghép 2 drone) | Destroyer |
| Durian | HE Fuel | Caltrops |
| Football | Sneakers | Quantum Ball |
| Forcefield Device | Energy Drink | Pressure Forcefield |
| Guardian | Exo-Bracer / Energy Drink | Defender |
| Katana | Ronin Oyoroi | Demon Blade |
| Kunai | Koga Ninja Scroll / Energy Cube | Spirit Shuriken |
| Laser Launcher | Energy Cube | Death Ray |
| Lightchaser | Ronin Oyoroi | Eternal Light |
| Lightning Emitter | Energy Cube | Thunderbolt Power Cell |
| Molotov Cocktail | Oil Bonds | Fuel Barrel |
| Modular Mine | Molotov | Inferno Bomb |
| Revolver | Hi-Powered Bullet | Reaper |
| RPG | HE Fuel | Sharkmaw Gun |
| Shotgun | Hi-Powered Bullet | Gatling Gun |
| Void Power | Exo-Bracer | Gloom Nova |

Nguồn: [mturbogamer — What Does Evo Mean](https://mturbogamer.com/2022/10/survivor-io-what-is-evo-weapon-evolutions/) qua WebSearch tổng hợp; xác nhận chéo [BlueStacks — Skills and Evolution Guide](https://www.bluestacks.com/blog/game-guides/survivor-io/sio-skills-evolution-guide-en.html).

### 6.3 Auto-aim

- Phần lớn vũ khí **tự động tấn công**, người chơi không cần bấm nút đánh ([WebSearch tổng hợp beginner guides](https://www.ldplayer.pro/survivor-io/)).
- Riêng **Kunai**: bắn nhắm 1 mục tiêu duy nhất mỗi lần, auto-aim, đặc biệt hiệu quả để "solo boss" (nhắm ưu tiên mục tiêu nguy hiểm/máu cao thay vì quái gần nhất) ([WebSearch tổng hợp](https://progameguides.com/survivor-io/how-to-get-weapons-evolutions-in-survivor-io/)).

### 6.4 Điều khiển (joystick) & camera

- Điều khiển: **joystick ảo 1 ngón tay**, không cần nút bắn — chỉ lo né đòn/gom EXP/tìm chỗ trống ([WebSearch tổng hợp](https://www.ldplayer.pro/survivor-io/), [BlueStacks Features Guide](https://www.bluestacks.com/blog/game-guides/survivor-io/sio-features-guide-en.html)).
- Camera: **top-down / vertical perspective** (không phải isometric), giúp thấy quái tiến vào từ mọi hướng ([WebSearch tổng hợp mô tả gameplay](https://survivor-io.en.uptodown.com/android)). Không tìm được số liệu chính xác về tỉ lệ zoom camera/kích thước nhân vật trên màn hình trong các nguồn đã kiểm tra `[SUY ĐOÁN — dựa trên video gameplay phổ biến: nhân vật chiếm một phần nhỏ màn hình, camera zoom ra đủ rộng để thấy quái tiến từ 4 phía]`.

### 6.5 HUD / hiển thị HP & trạng thái

- Có **bộ đếm số quái đã giết (kill counter)** hiển thị trên màn hình trong trận ([minireview.io — Survivor.io Review](https://minireview.io/arcade/survivor-io) qua WebSearch: "a current count of the number of zombies killed appears... upper right corner").
- **Thanh HP** hiển thị dạng thanh (bar) gắn theo nhân vật, cạn dần khi bị trúng đòn — mô tả là "thanh xanh trôi bên dưới nhân vật" ("green bar that floats beneath players") ([minireview.io, như trên](https://minireview.io/arcade/survivor-io)). Không xác nhận được vị trí chính xác (trên/dưới màn hình) do các nguồn không thống nhất — một nguồn khác (không rõ độ tin cậy, có thể lẫn game khác) nói HP bar ở góc trên-trái `[SUY ĐOÁN — mâu thuẫn giữa nguồn, ưu tiên mô tả "thanh máu gắn theo nhân vật" vì khớp với thể loại bullet-heaven/survivor phổ biến]`.

---

## 7. Ghi chú thiết kế tổng hợp cho việc port (không phải số liệu, chỉ là diễn giải)

- Vòng lặp lõi (core loop) và vòng lặp gacha **tách rời nhau về currency**: ải chính tạo Gold/Power-progression, còn Gem (gacha) đến từ lớp nhiệm vụ/mode phụ có trần ngày/tuần rõ ràng → kiểm soát nhịp pull mà không cần trừng phạt việc cày ải `[SUY ĐOÁN]`.
- Không có rương "ra thẳng Epic/Legendary" — mọi thứ hiếm đều phải **ghép tay từ cấp thấp**, khiến gacha (mua rương) chỉ quyết định *tốc độ tích nguyên liệu*, còn *item hiếm cuối cùng* luôn nằm trong tay người chơi qua thao tác merge — giảm cảm giác "toàn ăn may" so với gacha thuần túy `[SUY ĐOÁN]`.
- Evolution (kết hợp 1 vũ khí + 1 skill bị động cụ thể) là cơ chế build-in-run chính tạo chiều sâu chiến thuật mỗi trận, tách biệt hoàn toàn khỏi hệ equipment meta-game dài hạn `[SUY ĐOÁN]`.
