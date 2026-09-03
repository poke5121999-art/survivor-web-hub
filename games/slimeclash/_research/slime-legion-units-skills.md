# Nghiên cứu Slime Legion (Perfeggs) — Đơn vị, Kỹ năng, Chỉ số

## Xác định game

- Game được research: **"Slime Legion"** — nhà phát triển **Perfeggs** (App Store ghi "Perfeggs Technology Co., Limited"), package Android `com.hero.may.cry.adventure.game`, phát hành **3/2/2023 (Android)**, **5/2/2023 (iOS)** ([WebSearch tổng hợp Google Play/game-solver.com](https://play.google.com/store/apps/details?id=com.hero.may.cry.adventure.game&hl=en_US); [App Store](https://apps.apple.com/us/app/slime-legion/id1664686966)).
- Thể loại: game di động **merge + tower defense + roguelike skill-pick trong trận** — nhân vật là "đại ma vương" bảo vệ khu rừng quái vật khỏi các "anh hùng" xâm lược, ghép 3 quái giống nhau để tạo/nâng cấp quái mạnh hơn, xếp đội hình bảo vệ lâu đài ([App Store mô tả, qua WebFetch](https://apps.apple.com/us/app/slime-legion/id1664686966)).
- Rating **4.39/5**, **48.587 đánh giá**, **~3,1 triệu lượt tải** ([WebSearch tổng hợp Google Play](https://play.google.com/store/apps/details?id=com.hero.may.cry.adventure.game&hl=en_US)).
- **Đã loại trừ** các game trùng tên/dễ nhầm: *"Legend of Slime: Idle RPG War"* (`com.loadcomplete.slimeidle`, game idle RPG khác nhà phát triển), *"Slime Legends - Survivor"* (`com.fori.slimelegends`, game survivor bullet-heaven khác), và *"That Time I Got Reincarnated as a Slime ISEKAI Memories"* (game license anime, không liên quan) — đều xuất hiện trong kết quả tìm kiếm nhưng không phải game đang research ([WebSearch google play/app store](https://play.google.com/store/apps/details?id=com.hero.may.cry.adventure.game&hl=en_US)).
- Nguồn chính dùng trong tài liệu này: **Slime Legion Fandom Wiki** (`slime-legion.fandom.com`, wiki cộng đồng nhỏ, phần lớn trang unit **không có infobox số liệu đầy đủ**, phải fetch qua proxy `r.jina.ai` vì fetch trực tiếp trả lỗi 402/403), **ProGameGuides Tier List** (5/2025), **TheClashify Tier List Wiki** (4/2024), và các guide phụ (TalkAndroid, MobileGamingHub). Vì đây là game nhỏ, **KHÔNG có tool đào dữ liệu (data-mine) công khai** như các game lớn — phần lớn số liệu trong tài liệu này chỉ đến từ mô tả kỹ năng trên wiki, không phải từ file dữ liệu gốc.

---

## 1. Danh sách đơn vị (roster) theo Tier List

**Lưu ý quan trọng**: có ít nhất **hai bảng tier list khác nhau theo thời gian** (game cập nhật liên tục, unit mới/cân bằng lại thay đổi thứ hạng) — không nên coi đây là bảng "chân lý" cố định.

### 1.1 Tier List ProGameGuides (cập nhật 5/2025) — đầy đủ nhất, 68 unit

| Tier | Unit |
|---|---|
| **S** (8) | Angie, Aurora, Brawler, Mina, Prophet, Totem, Undine, Wine Sage |
| **A** (16) | Chief Judge, Crack Rock, Dark Knight, Dread Lord, Drogon, Egg Thrower, Erlinsea, Ghost Butterfly, Laplace, Medea, Medusa, Protector, Selena, Shiranui, Smelly Flower, Witch |
| **B** (19) | Amy, Bella, Berserker, Cannibal Flower, Dark Elf, Dracula, Fenrir, Ghost, Grinch, Hemera, Lurker, Navi, Nemo, Nova, Nyx, P.Bot, Siren, Venom, Zombie |
| **C** (17) | Apelet, Blackhat, Cactus, Clown, Death, Frost, Hades, Iron Fist, Little Deer, Little Devil, Mummy, Naga, Night Terror, Rabi, Slime, Succubus, Yuffie |
| **D** (6) | Chubby, Engineer, Goblin, Leviathan, Oliver, Rocky |

([ProGameGuides — Slime Legion Tier List, qua WebFetch proxy r.jina.ai](https://progameguides.com/slime-legion/slime-legion-tier-list/))

Mô tả vai trò/kỹ năng tóm tắt cho từng unit (không có số liệu HP/tầm đánh gốc, chỉ có % sát thương kỹ năng rải rác) `[ĐO ĐƯỢC]` — trích trực tiếp từ trang trên:

- **Angie (S)**: buff đồng minh, kéo địch xa lại gần, tự buff bản thân để chặn đòn đánh và có thể hồi sinh đồng minh đã chết.
- **Aurora (S)**: sát thương scale theo số địch trên sân; có kỹ năng công/thủ mạnh tùy chỉnh cho PvE/PvP.
- **Brawler (S)**: vào "trạng thái điên" gây sát thương lớn cho địch gần; tăng **+15% ATK** cho đồng minh cách 1 ô.
- **Mina (S)**: triệu hồi dơi + gây chảy máu; đạt trạng thái "Blood Ecstasy" gây **+200% sát thương** lên địch đang dính debuff.
- **Prophet (S)**: đòn sét lan chuỗi; nhân đôi sát thương lúc đầu trận; nâng cấp mở buff diện rộng + debuff địch.
- **Totem (S)**: hỗ trợ, tăng "bonus, ATK và tốc đánh" đồng minh trong tầm; gây vulnerable (dễ tổn thương) lên địch.
- **Undine (S)**: đòn cột nước đánh trúng "bất kỳ ai trong 2 ô quanh"; nâng cấp tăng tầm và sát thương.
- **Wine Sage (S)**: võ sĩ gây choáng; **+300% sát thương** lên địch đang bị debuff khống chế; có trạng thái "Drunken" cộng thêm.
- **Chief Judge (A)**: kiếm thánh, tăng tốc đánh 3 đồng minh; đòn "Judge's Strike" gây **200% sát thương** + choáng địch.
- **Egg Thrower (A)**: đơn vị khởi đầu tầm xa; trứng xuyên địch, nhân số lượng khi nâng cấp.
- **Erlinsea (A)**: debuff chậm/trói/đóng băng; buff "Sea Song" cho **+100% sát thương đồng minh trong 2 giây**.
- **Ghost Butterfly (A)**: triệu hồi bướm bảo vệ; gây hiệu ứng ăn mòn **20% sát thương/giây trong 5 giây**.
- **Shiranui (A)**: chuyên trị boss; ném "Moon Disc" gây **300% sát thương** + choáng; đánh dấu địch để tăng sát thương.
- **Smelly Flower (A)**: đầu độc từ "1 ô" (nâng lên 1.5 ô); gây debuff và hiệu ứng sợ hãi.
- **Amy (B)**: **20% cơ hội** bắn 3 tên lửa thánh gây **200% sát thương**; nâng cấp mở nổ + gây yếu.
- **Fenrir (B)**: đi theo bầy sói; solo được **+100% ATK**, đi cặp **+50% tốc đánh**; khóa mục tiêu đầu trận.
- **Lurker (B)**: **1/5 cơ hội** bùng nổ sát thương **200%**; gây trói theo stack.
- **Nemo (B)**: chuyên trị boss; sát thương **tăng dần 5%** mỗi đòn liên tục lên cùng 1 địch.
- **Nova (B)**: **30% cơ hội** kích hoạt bão băng làm chậm/đóng băng.
- **P.Bot (B)**: tăng **+25% ATK** đồng minh trong tầm; cấp 12 biến địch chết thành vũng độc.
- **Siren (B)**: cấp 9 làm địch **giảm 50% sát thương lên lâu đài**.
- **Venom (B)**: cấp 15 **hạ gục tức thì** địch dưới **10% HP**.
- **Zombie (B)**: sát thương cao nhưng "ngủ" 3 giây sau đòn (giảm còn 2 giây khi nâng cấp); vào "Bloodthirsty" sau 10 lần hạ gục.
- **Blackhat (C)**: **10% cơ hội** gây sợ hãi, **+100% sát thương**.
- **Death (C)**: lưỡi hái quét cả hàng; kích nổ địch đang cháy; **10% cơ hội gây 10x sát thương** lên địch đóng băng.
- **Hades (C)**: **+200% sát thương** lên địch bị trói (phụ thuộc combo, hạn chế hữu dụng).
- **Naga (C)**: **1/5 cơ hội** đẩy lùi 2 địch bằng sóng nước.
- **Night Terror (C)**: gấu hung hãn, buff tới **+200% sát thương** khi hạ gục đơn lẻ.
- **Succubus (C)**: **25% cơ hội mê hoặc 4 địch** ở nâng cấp tối đa.
- **Rocky (D)**: đẩy đá; ATK gốc **25**; hất lùi chỉ mở khóa ở cấp 15.

*(Toàn bộ số liệu mục 1.1 `[ĐO ĐƯỢC]` từ mô tả trên trang ProGameGuides, không kèm HP/tầm đánh/tốc đánh gốc cho các unit này — trang không công bố infobox đầy đủ.)*

### 1.2 Tier List TheClashify (4/2024) — mâu thuẫn thứ hạng với 1.1, minh chứng game biến động qua bản cập nhật

| Tier | Unit |
|---|---|
| S | Undine, Lurker, Rabi |
| A (13-12 "coin") | Dracula, Amy, Ghost Butterfly, Zombie, Dark Elf |
| B (11-10 "coin") | Ghost, Cannibal Flower, Hades |
| (nhóm hỗ trợ/khống chế, không rõ tier số) | Nova, Dread Lord, Smelly Flower, Witch, Blackhat |

([TheClashify — Slime Legion Tier List Wiki, 4/2024, qua WebFetch proxy](https://theclashify.com/slime-legion-tier-list-wiki/))

→ So sánh 1.1 vs 1.2: **Rabi** và **Undine** rớt từ S (2024) xuống C/giữ S tùy nguồn; **Dracula** từ A (2024) xuống B (2025); **Lurker** từ S (2024) xuống B (2025) `[SUY ĐOÁN]` (suy luận từ đối chiếu 2 bảng, không có patch note trực tiếp giải thích).

### 1.3 Tier List cũ hơn từ Fandom Wiki (bản snapshot khác, qua WebSearch — có thể là cache cũ)

Một kết quả tìm kiếm khác dẫn cùng URL Fandom Tier List nhưng liệt kê S-tier khác: **Angie, Aurora, Brawler, Mina, Prophet, Totem, Undine, Wine Sage** — trùng khớp với bảng 1.1 (ProGameGuides có vẻ đã đồng bộ/copy dữ liệu từ Fandom Wiki tại cùng thời điểm) ([WebSearch snippet Fandom Tier List](https://slime-legion.fandom.com/wiki/Tier_List)).

### 1.4 Chỉ số/kỹ năng chi tiết theo từng cấp — chỉ có cho 7 unit có trang wiki riêng đầy đủ

Đây là **7 unit duy nhất** có trang Category:Monster trên Fandom Wiki với bảng kỹ năng theo cấp độ (Lv.1/3/5/7/9/12/15) `[ĐO ĐƯỢC]` ([Category:Monster — Slime Legion Wiki](https://slime-legion.fandom.com/wiki/Category:Monster)):

| Unit | Vai trò | Kỹ năng theo cấp (nguồn) |
|---|---|---|
| **Slime** | Cận chiến, khởi đầu | Lv1: thêm 1 kiếm; Lv3: kiếm to hơn +100%; Lv5: ATK +10%; Lv7: hạ gục tức thì địch bị choáng dưới 10% HP (combo P.Bot/Aplet/Siren); Lv9: xoay kiếm 2 lần; Lv12: tốc đánh +10%; Lv15: ngưỡng hạ gục tức thì tăng lên 15% HP ([Slime — wiki](https://slime-legion.fandom.com/wiki/Slime)) |
| **Egg Thrower** | Tầm xa, khởi đầu | Lv1: "Scattering" — ném 3 trứng theo hình quạt; nâng cấp thêm xuyên trứng, gây chảy máu lên địch bị choáng, tăng tốc đánh, bonus sát thương sau khi hạ gục ([Egg Thrower — wiki](https://slime-legion.fandom.com/wiki/Egg_Thrower)) |
| **Frost** | Khống chế, khởi đầu | Lv1: 15% cơ hội đóng băng 1 giây khi trúng đòn; Lv3: +15% cơ hội đóng băng; Lv5: thời gian làm chậm +0.2 giây; Lv7: địch trong 0.5 ô quanh mục tiêu bị đóng băng cũng bị chậm 1s; Lv9: địch đóng băng chết bắn ra khối băng; Lv12: sát thương khối băng +10%; Lv15: địch bị chậm nhận thêm +20% sát thương ([Frost — wiki](https://slime-legion.fandom.com/wiki/Frost)) |
| **Little Devil** | Cận chiến/lan (fire), khởi đầu | Lv1: gây cháy 5 giây, 20% sát thương/giây; Lv3: sát thương cháy +200%; Lv5: +300% sát thương lên địch đóng băng (combo Frost); Lv7: thời gian cháy +1 giây; Lv9: 20% cơ hội lan cháy sang ô kề; Lv12: sát thương lan cháy +10%; Lv15: vùng lan cháy tăng thành 3×3 ([Little Devil — wiki](https://slime-legion.fandom.com/wiki/Little_Devil)) |
| **Berserker** | Tầm xa, mở khóa Chapter 2 | Lv1: ném rìu tới trước & sau; Lv3: +200% sát thương lên địch đang cháy (combo Little Devil/Dread Lord/Witch/Goblin/Rabi); Lv5: tăng sát thương theo khoảng cách xa; Lv7: tốc đánh +10% trong 3s sau khi hạ gục (cộng dồn); Lv9: +4% sát thương mỗi địch bị xuyên; Lv12: buff tốc đánh kéo dài thêm 1s; Lv15: rìu ném quay lại ([Berserker — wiki](https://slime-legion.fandom.com/wiki/Berserker)) |
| **Dracula** | Cận chiến dark, S-rank, mở khóa Chapter 2 | Xem bảng 2.1 chi tiết bên dưới |
| **Goblin** | Tầm xa nổ, mở khóa Chapter 2 | Lv1: ném bom ngẫu nhiên hướng; Lv3: +200% sát thương lên địch cháy/đóng băng (combo Little Devil/Dread Lord/Witch/Goblin/Rabi/Frost Nova); Lv5: bom nổ gây cháy 5 giây, 20% sát thương/giây; Lv7: sát thương cháy +10%; Lv9: bán kính nổ +0.5 ô; Lv12: ATK +10%; Lv15: cứ 5 đòn đánh bắn thêm 1 tên lửa vào địch ngẫu nhiên ([Goblin — wiki](https://slime-legion.fandom.com/wiki/Goblin)) |

Cách mở khóa 3 unit trên (Berserker, Dracula, Goblin) đều giống nhau: **mở khóa** = qua Main Story Chapter 2; **triệu hồi** = gom đủ mảnh (shard) — Dracula 5 mảnh, Goblin 10 mảnh `[ĐO ĐƯỢC]` ([Berserker](https://slime-legion.fandom.com/wiki/Berserker), [Dracula](https://slime-legion.fandom.com/wiki/Dracula), [Goblin](https://slime-legion.fandom.com/wiki/Goblin)).

### 2.1 Bảng chỉ số gốc đầy đủ nhất tìm được — Dracula

| Chỉ số | Giá trị | Nguồn |
|---|---|---|
| Độ hiếm (Rarity) | **S-rank** | [Dracula — wiki](https://slime-legion.fandom.com/wiki/Dracula); [TheClashify tier list](https://theclashify.com/slime-legion-tier-list-wiki/) |
| Hệ/Type | **Dark (Bóng tối)** | [TheClashify tier list](https://theclashify.com/slime-legion-tier-list-wiki/) |
| Tầm đánh | **Trong 1 ô (1 Slot)** | [TheClashify tier list](https://theclashify.com/slime-legion-tier-list-wiki/) |
| Tốc đánh | **2** (số càng thấp = đánh càng nhanh; công thức thời gian giữa 2 đòn ≈ *n × 0.9 giây* ở tốc độ x1) | [TheClashify](https://theclashify.com/slime-legion-tier-list-wiki/); công thức tốc đánh từ [Monsters — wiki](https://slime-legion.fandom.com/wiki/Monsters) |
| Sát thương Lv.1 | **30** | [TheClashify tier list](https://theclashify.com/slime-legion-tier-list-wiki/) |
| Sát thương Lv.2 | **39** | [TheClashify tier list](https://theclashify.com/slime-legion-tier-list-wiki/) |
| Sát thương Lv.7 | **156** | [TheClashify tier list](https://theclashify.com/slime-legion-tier-list-wiki/) |
| Sát thương Lv.8 | **190** | [TheClashify tier list](https://theclashify.com/slime-legion-tier-list-wiki/) |
| Thời gian chảy máu (Bleeding Duration) | **5** (đơn vị không ghi rõ giây/lượt) | [TheClashify tier list](https://theclashify.com/slime-legion-tier-list-wiki/) |
| Mở khóa | Qua Main Story Chapter 2 | [Dracula — wiki](https://slime-legion.fandom.com/wiki/Dracula) |
| Triệu hồi | 5 Dracula Shards | [Dracula — wiki](https://slime-legion.fandom.com/wiki/Dracula) |

Từ **30 → 190 sát thương** giữa Lv.1 và Lv.8, mỗi cấp tăng trung bình khoảng **+23%** so với cấp trước theo cấp số nhân gần đúng `[SUY ĐOÁN]` (tự tính: 190/30 ≈ 6.33 lần qua 7 lần nâng cấp → hệ số ~1.30/cấp; không có công thức chính thức nào công bố).

Kỹ năng theo cấp của Dracula `[ĐO ĐƯỢC]` ([Dracula — wiki](https://slime-legion.fandom.com/wiki/Dracula)):

| Level | Kỹ năng |
|---|---|
| 1 | Dơi bay vòng tròn 2 lần trước khi quay về |
| 3 | Thả ra 3 con dơi |
| 5 | Số stack chảy máu tối đa +1 |
| 7 | Có 4 dơi hộ vệ bay quanh |
| 9 | +1 dơi hộ vệ nữa |
| 12 | Dơi hạ gục địch gây 100% sát thương lan sang địch gần, gây 1 stack chảy máu |
| 15 | Lâu đài bị tấn công sẽ kích hoạt bầy dơi gây 100% sát thương |

**Talent (hệ thống riêng, xem mục 3.2)**: Dracula có 8 talent — Loyal Guard (Guardian Bats +5% sát thương/cấp), Dark Blessing (Crit Rate +2%/cấp), Blood Frenzy (chảy máu +5% sát thương/cấp), Perseverance, Fierce Strike, Dark Power, Deadly Bloom, Friend Power — mỗi talent có **5 cấp**, mở ở **Lv.9** của unit `[ĐO ĐƯỢC]` ([Dracula — wiki](https://slime-legion.fandom.com/wiki/Dracula); [WebSearch bổ sung số % Loyal Guard/Dark Blessing/Blood Frenzy](https://slime-legion.fandom.com/wiki/Dracula)).

---

## 2. Hệ thống kỹ năng/buff nhặt trong trận

- Trong trận, kỹ năng (Monster Skills) được nhận thông qua **rương** (mở bằng cách ghép 3 đồng xu giống nhau thành rương) hoặc khi **đầy thanh đồng hồ xanh** phía trên `[ĐO ĐƯỢC]` ([WebSearch tổng hợp](https://mobilegaminghub.com/slime-legion-beginners-guide-and-tips/) — nội dung gốc không fetch được do lỗi 403, chỉ có qua snippet tổng hợp của WebSearch).
- Hiệu ứng có thể là: tăng sát thương, tăng tốc đánh, giảm tốc địch, thêm hàng ("row") trên bàn cờ, và nhiều loại khác `[ĐO ĐƯỢC]` ([WebSearch tổng hợp mobilegaminghub](https://mobilegaminghub.com/slime-legion-beginners-guide-and-tips/)).
- **Luật giữ lại giữa các trận**: sau khi 1 trận kết thúc, **1 kỹ năng được chọn ngẫu nhiên trong số các kỹ năng đã có sẽ được giữ lại (carry over)** sang trận tiếp theo `[ĐO ĐƯỢC]` ([WebSearch tổng hợp](https://mobilegaminghub.com/slime-legion-beginners-guide-and-tips/)).
- **Số slot tối đa, luật chồng buff (stacking), danh sách đầy đủ toàn bộ loại kỹ năng nhặt trong trận**: **KHÔNG TÌM ĐƯỢC NGUỒN** — không có trang wiki hay guide nào liệt kê đầy đủ bảng kỹ năng nhặt-trong-trận kèm số liệu chính xác.

---

## 3. Hệ thống nâng cấp đơn vị

### 3.1 Merge (ghép) — cơ chế chính để lên cấp

- Cách ghép: xếp các vật phẩm cùng loại thành hàng **3×1, 4×1, hoặc 5×1** để hợp nhất `[ĐO ĐƯỢC]` ([Slime Legion Starter Guide — wiki, qua WebFetch proxy](https://slime-legion.fandom.com/wiki/Slime_Legion_Starter_Guide)).
- Ghép **đồng xu** → tạo thành **rương** (chest); ghép **nguyên liệu khác** → **lên cấp quái vật (monster)** `[ĐO ĐƯỢC]` ([Starter Guide — wiki](https://slime-legion.fandom.com/wiki/Slime_Legion_Starter_Guide)).
- Ghép dài hơn (**merge-4, 5, 6, 8**) cho hiệu ứng đặc biệt hơn; ghép **4 trở lên** tạo ra **2 quái cùng lúc** thay vì 1; khuyến nghị nên **ghép-5 trong vòng 3 lượt di chuyển** để nhận rương hiếm hơn `[ĐO ĐƯỢC]` ([Starter Guide — wiki](https://slime-legion.fandom.com/wiki/Slime_Legion_Starter_Guide); [TalkAndroid guide, qua WebFetch](https://www.talkandroid.com/22376-slime-legion-ultimate-guide-tips/)).
- Bàn cờ cho phép **di chuyển BẤT KỲ ô nào**, kể cả ô không ghép được gì, khác các game match-3 thông thường `[ĐO ĐƯỢC]` ([TalkAndroid guide](https://www.talkandroid.com/22376-slime-legion-ultimate-guide-tips/)).
- Số lượt di chuyển bị **giới hạn** trước khi làn sóng địch tiếp theo tấn công `[ĐO ĐƯỢC]` ([TalkAndroid guide](https://www.talkandroid.com/22376-slime-legion-ultimate-guide-tips/)).

### 3.2 Level & Talent (nâng cấp vĩnh viễn ngoài trận)

- Ngoài trận, người chơi nâng cấp quái vật qua menu **"Monsters"** (góc dưới-phải màn hình chính); mức nâng cấp thay đổi tùy unit — có thể tăng sát thương, thêm hiệu ứng `[ĐO ĐƯỢC]` ([WebSearch tổng hợp](https://theclashify.com/slime-legion-tier-list-wiki/)).
- Cách lên cấp: thu thập **"character image pieces"** (mảnh ảnh nhân vật), thường có được sau khi **vượt qua 10 wave (ngày) trong game** `[ĐO ĐƯỢC]` ([TalkAndroid guide](https://www.talkandroid.com/22376-slime-legion-ultimate-guide-tips/)).
- **Talent** — hệ thống mới từ **bản Ver. 1.5.0**, chỉnh sửa hành vi/kỹ năng quái vật bằng hiệu ứng mạnh; chỉ một số quái vật có Talent (mở rộng dần theo bản cập nhật) `[ĐO ĐƯỢC]` ([Monsters — wiki](https://slime-legion.fandom.com/wiki/Monsters)).
  - Điều kiện mở Talent: quái vật đạt **cấp yêu cầu**, sau đó tốn **Talent Stones cùng hệ (type)** với quái đó `[ĐO ĐƯỢC]` ([Monsters — wiki](https://slime-legion.fandom.com/wiki/Monsters)).
  - Ví dụ Dracula: Talent mở ở **Lv.9**, có 8 loại, mỗi loại tối đa **5 cấp** (xem bảng 2.1) `[ĐO ĐƯỢC]` ([Dracula — wiki](https://slime-legion.fandom.com/wiki/Dracula)).
- **Mở khóa (unlock) vs Triệu hồi (summon)** là 2 bước tách biệt: unlock quái mới (thường bằng vượt Chapter chính), sau đó gom **Monster Shards** (rơi từ rương/AFK/thưởng ải) mới triệu hồi được `[ĐO ĐƯỢC]` ([WebSearch tổng hợp](https://slime-legion.fandom.com/wiki/Monsters); [Dracula](https://slime-legion.fandom.com/wiki/Dracula), [Goblin](https://slime-legion.fandom.com/wiki/Goblin)).
- **Trần cấp độ, chi phí nâng cấp theo từng mốc, % chỉ số tăng cụ thể mỗi cấp cho toàn bộ roster**: **KHÔNG TÌM ĐƯỢC NGUỒN** (ngoại trừ bảng sát thương Dracula Lv.1→8 ở mục 2.1).

---

## 4. Tương khắc hệ/nguyên tố

- Hệ thống **có tồn tại**: mỗi quái vật có **"Monster Type"** (hệ), "ảnh hưởng sát thương gây ra dựa trên **kháng/yếu** của từng loại địch" `[ĐO ĐƯỢC]` ([Monsters — wiki, qua WebFetch proxy](https://slime-legion.fandom.com/wiki/Monsters)).
- Các hệ được xác nhận tồn tại qua tên gọi unit trong tier list: **Fire** (Little Devil, Rabi, Bella, Witch — cháy/burn), **Ice/Frost** (Frost, Nova — đóng băng/chậm), **Dark** (Dracula, Mina, Dread Lord, Nyx), **Water** (Undine, Naga, Leviathan — đẩy lùi/sóng nước), **Light** (Shiranui, Oliver, Prophet — sét/ánh sáng), **Earth** (Goblin — bom đất) `[SUY ĐOÁN]` (suy ra từ mô tả kỹ năng ở mục 1.1, wiki không có bảng hệ chính thức).
- **Bảng khắc chế cụ thể (hệ nào khắc hệ nào, hệ số nhân sát thương bao nhiêu %)**: **KHÔNG TÌM ĐƯỢC NGUỒN**. Chỉ có các "combo" cụ thể giữa kỹ năng — ví dụ Little Devil/Frost (địch đóng băng nhận +300% sát thương từ Little Devil), Berserker/Goblin/Witch/Dread Lord/Rabi (địch cháy nhận +200% sát thương từ Berserker hoặc Goblin) — đây là **combo trạng thái (status) chứ không phải bảng khắc chế hệ nguyên tố cổ điển (Đá-Kéo-Bao)** `[SUY ĐOÁN]`.

---

## 5. Đội hình

- Có **mâu thuẫn giữa 2 nguồn** về số lượng đơn vị tối đa:
  - ProGameGuides mô tả: **"đội hình 4 quái vật"** để đối đầu làn sóng địch ("teams of four monsters to take on hordes of enemies") `[ĐO ĐƯỢC]` ([ProGameGuides hub page, qua WebFetch](https://progameguides.com/slime-legion/)).
  - Slime Legion Starter Guide (wiki) ghi: sau khi hạ boss, **chỉ 6 quái vật mạnh nhất (top 6) được mang sang màn tiếp theo**, dù một số kỹ năng có thể thay đổi con số này `[ĐO ĐƯỢC]` ([Starter Guide — wiki](https://slime-legion.fandom.com/wiki/Slime_Legion_Starter_Guide)).
  - `[SUY ĐOÁN]`: có khả năng "4" là số unit hiển thị/quảng bá trên trang chủ game (marketing), còn "6" là con số thật trong luật chơi sau boss — hai con số đo ở ngữ cảnh khác nhau, không chắc chắn loại trừ lẫn nhau. Cần kiểm chứng thêm bằng gameplay thật.
- **Chi phí đội hình (mana/energy cost để triệu hồi trong trận), luật sắp xếp vị trí trên bàn cờ (ngoài "tầm đánh" ở mục 1.4), giới hạn slot bàn cờ**: phần lớn **KHÔNG TÌM ĐƯỢC NGUỒN** chi tiết, ngoại trừ khái niệm tầm đánh unit chia 3 loại: **"trong 1 ô"**, **"cùng cột"**, **"cùng hàng"** `[ĐO ĐƯỢC]` ([Monsters — wiki](https://slime-legion.fandom.com/wiki/Monsters)).

---

## 6. Chỉ số quái/địch

- Cấu trúc thời gian: game chia theo **"Day"** (ngày/wave); mỗi khi 1 wave kết thúc, tiến thêm 1 Day `[ĐO ĐƯỢC]` ([WebSearch tổng hợp Starter Guide](https://slime-legion.fandom.com/wiki/Slime_Legion_Starter_Guide)).
- **Boss xuất hiện định kỳ mỗi 10 Day** (Day 10, Day 20,...), mô tả là "không dễ đánh bại" `[ĐO ĐƯỢC]` ([WebSearch tổng hợp Starter Guide](https://slime-legion.fandom.com/wiki/Slime_Legion_Starter_Guide)).
- **HP/ATK quái theo wave, hệ số tăng mỗi ải, loại quái đặc biệt, chỉ số boss cụ thể**: **KHÔNG TÌM ĐƯỢC NGUỒN** — không tìm thấy bài viết hay wiki nào công bố số liệu quái/địch.

---

## 7. Công thức sát thương

- **Attack Speed**: số hiển thị càng **thấp** = đánh càng **nhanh**; công thức suy ra thời gian giữa 2 đòn đánh ở tốc độ chuẩn (x1) là **khoảng n × 0.9 giây**, với n là số Attack Speed hiển thị `[ĐO ĐƯỢC]` ([Monsters — wiki](https://slime-legion.fandom.com/wiki/Monsters)).
- **Sát thương cuối cùng bị ảnh hưởng bởi hệ (type) của quái và độ kháng/yếu của địch** — xác nhận hệ thống có tồn tại nhưng không có công thức % cụ thể `[ĐO ĐƯỢC]` ([Monsters — wiki](https://slime-legion.fandom.com/wiki/Monsters)).
- **Chí mạng (Crit)**: có tồn tại — ví dụ talent "Dark Blessing" của Dracula tăng **Crit Rate +2%/cấp** `[ĐO ĐƯỢC]` ([WebSearch snippet từ Dracula wiki](https://slime-legion.fandom.com/wiki/Dracula)), nhưng **không tìm được công thức crit damage multiplier mặc định** hay cách giáp/armor giảm sát thương.
- **Giáp/Armor giảm sát thương thế nào, xuyên giáp**: **KHÔNG TÌM ĐƯỢC NGUỒN**.

---

## 8. Đơn vị mạnh nhất / yếu nhất theo cộng đồng

### Mạnh nhất (theo ProGameGuides 5/2025, xem 1.1)
- **S-tier**: Angie, Aurora, Brawler, Mina, Prophet, Totem, Undine, Wine Sage — lý do chung: có cơ chế **buff/debuff diện rộng + % sát thương cực cao có điều kiện** (200–300%+), nhiều unit còn có khả năng hồi sinh/kiểm soát đám đông mạnh ([ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/)).
- Theo bảng cũ hơn (TheClashify 4/2024), **Undine, Lurker, Rabi** từng được xem là S-tier mạnh nhất — cho thấy meta thay đổi liên tục qua các bản vá ([TheClashify](https://theclashify.com/slime-legion-tier-list-wiki/)).
- **Dracula** dù chỉ B-tier ở bảng mới nhất, vẫn được đánh giá là **"vô giá ở giai đoạn đầu game"**, DPS chính cho tới khoảng **Chapter 16** vì là S-rank sớm nhất người chơi có thể unlock (Chapter 2) `[ĐO ĐƯỢC]` ([Dracula — wiki](https://slime-legion.fandom.com/wiki/Dracula)).

### Yếu nhất (D-tier, ProGameGuides 5/2025)
- **Chubby, Engineer, Goblin, Leviathan, Oliver, Rocky** — lý do cụ thể theo từng unit:
  - Chubby: tầm đánh tối đa chỉ **1.5 ô**, yếu hơn cả unit khởi đầu.
  - Goblin: sát thương không đủ so với lựa chọn thay thế cùng vai trò.
  - Leviathan: bị **Undine** (kiểm soát nước tốt hơn) và **Selena** (khống chế tốt hơn) vượt trội hoàn toàn.
  - Oliver: dùng sét chuỗi hệ Light nhưng **Prophet** làm điều tương tự với sát thương/cơ chế tốt hơn hẳn.
  - Rocky: ATK gốc chỉ **25**, hất lùi (mở khóa cấp 15) đến quá muộn để hữu dụng.
  ([ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/))

---

## Tổng kết mảng có/thiếu nguồn

| Mảng | Tình trạng |
|---|---|
| Roster đầy đủ (tên + tier) | **Có** — 68 unit, bảng 1.1 |
| Chỉ số gốc (HP/ATK/tầm/tốc) toàn roster | **Thiếu gần hết** — chỉ có Dracula đầy đủ (2.1), 6 unit khác chỉ có bảng kỹ năng không có HP/ATK gốc |
| Kỹ năng riêng theo cấp | **Có cho 7/68 unit** (mục 1.4, 2.1) |
| Buff/skill nhặt trong trận | **Sơ lược, thiếu số liệu slot/stacking** |
| Nâng cấp unit (level/merge) | **Có** cơ chế, **thiếu** % tăng theo cấp & trần cấp |
| Talent system | **Có khái niệm + ví dụ Dracula**, thiếu danh sách đầy đủ toàn roster |
| Tương khắc hệ | **Chỉ suy đoán tên hệ**, không có bảng khắc chế số liệu |
| Đội hình | **Mâu thuẫn nguồn** (4 vs 6), thiếu chi tiết slot bàn cờ |
| Chỉ số quái/địch | **KHÔNG TÌM ĐƯỢC NGUỒN** |
| Công thức sát thương/crit/giáp | **Chỉ có 1 công thức tốc đánh + xác nhận crit tồn tại**, thiếu công thức đầy đủ |
| Mạnh/yếu nhất + lý do | **Có**, 2 bảng tier khác thời điểm |
