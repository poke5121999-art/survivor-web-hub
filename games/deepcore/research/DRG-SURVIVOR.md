# Deep Rock Galactic: Survivor — Nghiên cứu thiết kế

> Mục đích: rút bài học thiết kế cho game survivor **chỉ có 1 màn, ~10 phút, chơi trên mobile**.
> Nhãn: `[NGUỒN]` = số liệu tra được, có URL ngay tại chỗ · `[ĐỀ XUẤT]` = suy luận của người viết, **không phải** số của game gốc · **KHÔNG TÌM THẤY** = không có nguồn, không bịa.
> Ngày tra: 2026-09-07.

## 0. Thông tin nền và cảnh báo phiên bản

| Mục | Nội dung | Nguồn |
|---|---|---|
| Nhà phát triển / phát hành | Funday Games / Ghost Ship Publishing | `[NGUỒN]` https://store.steampowered.com/app/2321470/Deep_Rock_Galactic_Survivor/ |
| Tự mô tả | "DEEP ROCK GALACTIC: SURVIVOR is a single player survivor-like auto-shooter." | như trên |
| Early Access | 14/02/2024 | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:The_Game |
| **Bản 1.0** | **17/09/2025** (PC + Xbox Series X\|S) | như trên |
| **Bản 1.1 / DLC Heavy Duty** | **30/04/2026** — thêm biome Glacial Strata, class Demolisher, mission Egg Hunt, Endless Mode, nâng lên Unity 6 | `[NGUỒN]` https://xpgained.co.uk/patch-notes/deep-rock-galactic-survivor-heavy-duty-patch-notes-30-april-2026 |
| Mobile | iOS + Android, 11/2025, đồng phát triển với Piktiv | `[NGUỒN]` https://www.gematsu.com/2025/09/deep-rock-galactic-survivor-coming-to-ios-android-in-november |
| Doanh số | >500.000 bản tuần đầu, 1 triệu trong tháng đầu | `[NGUỒN]` https://en.wikipedia.org/wiki/Deep_Rock_Galactic:_Survivor |

**Lưu ý về nguồn:** `drgsurvivor.wiki.gg` **không tồn tại** (trả 401). Toàn bộ nội dung Survivor nằm trong namespace `Survivor:` của `deeprockgalactic.wiki.gg`. Hai trang `Survivor:Difficulty` và `Survivor:Objectives` vẫn còn banner "PARDON OUR DUST — This page is under construction", nên một số hệ số nhân là **lỗ hổng tài liệu thật sự**, không phải mình tra thiếu.

**Cảnh báo trộn lẫn:** rất nhiều kết quả tìm kiếm là của **DRG gốc** (app 548430) chứ không phải Survivor. Ví dụ: Dense Biozone, Fungus Bogs, Sandblasted Corridors, Radioactive Exclusion Zone, overclock "Clean", tiền "Data Cells" — **đều KHÔNG có trong Survivor**. Tài liệu này đã lọc bỏ.

**Điểm liên quan trực tiếp tới dự án:** bản mobile là **cùng một game, không cắt gọt** ("it's the same game as was just released, rather than a streamlined version" `[NGUỒN]` https://rogueliker.com/deep-rock-galactic-survivor-mobile/). Nghĩa là cấu trúc 5 tầng ~20–30 phút của nó **vẫn dài với chuẩn mobile**. Rút xuống 10 phút là quyết định đúng hướng — nhưng phải **nén**, không được **cắt**.

---

## 1. Vòng lặp một ván (dive) — cấu trúc 5 tầng

### 1.1 Khung tổng

| Hạng mục | Số liệu | Nguồn |
|---|---|---|
| Số tầng (Elimination) | **5 tầng** — "the player advances through five stages, defeating elite enemies and ultimately facing a Dreadnought" | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Elimination |
| Thời lượng chính thức mỗi tầng | **KHÔNG TÌM THẤY** — không có con số chính thức nào | — |
| Đo của cộng đồng | "it needs around 3 minutes until you see the stage boss (stage 1 - 4) for the final boss it takes less than 2 minutes until he's there" | `[NGUỒN]` https://steamcommunity.com/app/2321470/discussions/0/4342103279858852502/ |
| Tổng ván | "On average, the entire race lasts 20 minutes, which means 3-4 minutes per floor" · "Runs through the game are short and snappy at around 20 minutes tops" · nhưng cũng có "Late deaths waste 30+ minutes" → **dải hợp lý ~20–30 phút** | `[NGUỒN]` https://steamcommunity.com/app/2321470/discussions/0/4342103279858852502/ · https://completexbox.co.uk/reviews/deep-rock-galactic-survivor-review/ · https://grindnstrat.com/deep-rock-galactic-survivor-1-0-guide/ |
| Tầng có thể kéo dài | Có achievement "stay in 1 stage for 10 minutes as recon" → một tầng **co giãn được tới 10 phút** | `[NGUỒN]` https://steamcommunity.com/app/2321470/discussions/0/591784592221220592/ |

> **KHÔNG có đồng hồ đếm ván kiểu Vampire Survivors.** Đây là khác biệt cấu trúc lớn nhất, và là thứ quan trọng nhất phải hiểu trước khi nén.

### 1.2 Bên trong MỘT tầng — Progress Bar và ba loại mốc

Cơ chế thật sự vận hành một tầng:

- "**Progress Bar:** This shows how much progress you've made in the current level of the dive. This bar will continually move toward milestones as time goes on." `[NGUỒN]` https://techraptor.net/gaming/guides/deep-rock-galactic-survivor-guide
- **Giết quái làm thanh chạy nhanh hơn:** "The progress bar goes both by time and by enemies killed." `[NGUỒN]` https://steamcommunity.com/app/2321470/discussions/0/4371376043390811396/ — và "I can VISUALLY SEE the elite spawn timer rush up in small chunks as they explode sequentially." `[NGUỒN]` https://steamcommunity.com/app/2321470/discussions/0/4342103279868725438/
- **Nhưng không bao giờ đứng yên:** "The Progress Bar will continue to go up regardless if you kill the enemies or not." `[NGUỒN]` https://itemlevel.net/deep-rock-galactic-survivor-complete-starter-guide/
- Vị trí trên màn: "The yellow-orange bar at the top center" `[NGUỒN]` https://thenerdstash.com/deep-rock-galactic-survivor-starter-guide/

**Ba loại mốc trên thanh** (`[NGUỒN]` https://techraptor.net/gaming/guides/deep-rock-galactic-survivor-guide):

| Mốc | Trích nguyên văn |
|---|---|
| **Supply Drop Milestone** | "When the Progress Bar reaches this Milestone, a Supply Drop will spawn nearby." |
| **Swarm Milestone** | "A large group of enemies called a 'Swarm' will spawn when the Progress Bar reaches this milestone." — và **"Swarms will not despawn."** |
| **Objective Milestone** | "The final objective for this level of the dive will spawn when the Progress Bar reaches this final milestone at the end." |

**Sơ đồ một tầng:**

```
[vào tầng]
  |-- đào + nhặt XP + lên cấp        <- thanh chạy theo THỜI GIAN + SỐ QUÁI GIẾT
  |-- MỐC Supply Drop  -> đào sạch vùng tròn -> chọn 1 trong 3 Artifact
  |-- MỐC Swarm (1-3 lần tuỳ tầng)  -> "Swarm detected" -> bầy ập ra, KHÔNG tự biến mất
  |-- MỐC Objective    -> Elite (boss tầng) xuất hiện
  |-- giết Elite -> Drop Pod hạ xuống -> ĐẾM NGƯỢC 30 GIÂY
[shop tại Drop Pod: tiêu Gold + Nitra] -> [tầng kế]
```

> **Đây là cơ chế đáng ăn cắp nhất của cả game.** Thanh tiến độ có mốc nhìn thấy được, chạy nhanh hơn khi bạn đánh hăng — nó vừa là đồng hồ, vừa là bảng dự báo, vừa là công cụ để người chơi **tự chọn nhịp**.

### 1.3 Điều kiện xuống tầng (Drop Pod)

| Hạng mục | Số liệu | Nguồn |
|---|---|---|
| Điều kiện | Giết xong Elite: "Once the Elites have been eliminated, the Drop Pod will arrive for extraction towards the next stage." | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Objectives |
| Đếm ngược | **30 giây** — "the Elite dying will spawn the Drop Pod and start a 30-second timer" | `[NGUỒN]` https://techraptor.net/gaming/guides/deep-rock-galactic-survivor-guide |
| Xác nhận độc lập | "the game's exit drill... only sticks around for 30 seconds before leaving, granting a mission failure if players don't reach it in time" | `[NGUỒN]` https://gamingrespawn.com/featured/63459/deep-rock-galactic-survivor-review/ |
| Trượt | "Mission Failed" / "The drop pod left without you!" | `[NGUỒN]` https://itemlevel.net/deep-rock-galactic-survivor-what-happens-if-you-dont-reach-the-drop-pod/ |
| Đứng trên ramp là an toàn | "Standing on the pod ramp makes you untouchable to most enemies" | `[NGUỒN]` https://grindnstrat.com/deep-rock-galactic-survivor-1-0-guide/ |
| Gear kéo dài | Hexkeychain (Legendary): "the drop pod waits for an additional 15 sec" | `[NGUỒN]` Steam news feed app 2321470 |
| Tranh cãi | Thread "Drop pod extraction time being 30 seconds seems a little extreme." — nửa đòi 45–60s, nửa bảo đủ nếu đừng tham | `[NGUỒN]` https://steamcommunity.com/app/2321470/discussions/0/3882723431865425811/ |

**Bài học:** 30 giây chạy thoát là một **phase riêng có tension riêng**, và nó gây tranh cãi *chính vì* nó trừng phạt lòng tham. Đây là công cụ rẻ nhất để tạo cao trào cuối màn. Chi tiết "đứng trên ramp là bất tử" là một cái van an toàn thông minh — cho người chơi một đích đến tuyệt đối chứ không phải một cuộc rượt vô vọng.

### 1.4 Mỗi tầng nhồi gì

**Số đợt SWARM** (chú ý: đây là **số đợt swarm, KHÔNG phải số Elite phải giết**):

| Tầng | Số đợt swarm | Nguồn |
|---|---|---|
| Tầng 1 | "One wave" | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Elimination |
| Tầng 2 | "Two waves" | như trên |
| Tầng 3 | "Three waves" | như trên |
| Tầng 4 | "Three waves" | như trên |
| Tầng 5 | 4 Elite trong kén → Dreadnought | như trên |

**Số Elite** thì khác: "The amount of Elites depends on Hazard level and Mission type." — **bảng Elite theo Hazard: KHÔNG TÌM THẤY** `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Objectives

**Mọi tầng đều có Supply Pod:**
- "During each stage in a dive, Mission Control prepares a Supply Pod for the player. A landing zone will be marked on the minimap and an circular zone is drawn around the supply beacon, indicating the area that must be cleared of obstacles before the supply pod can land."
- "Opening the pod presents a selection of **three artifacts** drawn from those the player has unlocked."
- "The pod's impact deals heavy damage to enemies."

`[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Artifacts

**Sát thương va chạm của Supply Pod theo Hazard 1→5** (đây là một trong số ít bảng số có thật):
- Lên **Elite**: 100% / 90% / 80% / 65% / 50% máu tối đa
- Lên **Boss**: 33% / 30% / 27% / 24% / 20% máu tối đa

`[NGUỒN]` https://steamcommunity.com/games/2321470/announcements/detail/1795917897322495 (Patch Notes 4.2)

> Nghĩa là **gọi tiếp tế xuống đầu boss là một chiêu chính thống**, được cân bằng có chủ đích chứ không phải khai thác lỗi. Rất đáng học: cho người chơi một "nút bom" dùng một lần mỗi phase, gắn với việc phải đào dọn chỗ trước.

**Nhiệm vụ phụ:**
- Mở khoá: "unlocked once the player collects a cumulative total of **100 Gold** during dives"
- **"do not appear on the final stage of any dive"**
- Ba loại: "Collect **6 Apoca Blooms**" · "Collect **12 Boolo Caps**" · "Collect **20 Morkite**"

`[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Objectives

*(Một hướng dẫn cũ của TechRaptor ghi 15 Apoca Bloom / 20 Boolo Cap — đó là số thời Early Access, đã lỗi thời.)*

**Shop giữa tầng** (`[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Mid-dive_Upgrades):
- "In between dive stages, a selection of the above improvement cards becomes available for purchase at the drop pod at the cost of Gold and Nitra."
- Giá thẻ theo hạng (Uncommon / Rare / Epic / Legendary):
  - **Weapon card: 14 / 18 / 24 / 38 Nitra**
  - **Tag Mastery card: 29 / 35 / 48 / 77 Gold**
  - **Player Stat card: 23 / 29 / 40 / 63 Gold**
- **Hồi máu: 30 Gold cho 50% máu**

### 1.5 Tầng cuối và boss

| Hạng mục | Số liệu | Nguồn |
|---|---|---|
| Chuỗi tầng 5 | "the player must defeat **four Elites**, followed by a Dreadnought" | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Elimination |
| Hai cách gọi | Chờ quái tự chui ra, hoặc "accelerate this process by locating and manually tearing open the cocoons" | như trên |
| Chi tiết kén | "Each cocoon will spawn an Elite Creature, which the player can manually pop by damaging it enough, or by killing enough bugs... Once all the cocoons have been destroyed, the player can also manually pop the Dreadnought Cocoon" | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Objectives |
| Loại boss | "The Dreadnought has a **50% chance** of being either a Glyphid Dreadnought, or the Dreadnought Twins" | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Elimination |
| Thoát cuối ván | Có: "Once the Dreadnought has been eliminated, it will drop a piece of Gear, and the Drop Pod will arrive for extraction and end the dive" | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Objectives |
| Mâu thuẫn nhỏ | Trang `Survivor:Glyphid_Dreadnought` ghi "**three** smaller cocoons" trong khi hai trang khác ghi **four**. Bốn có nhiều nguồn hơn. | — |

**Đảo ngược nhịp chơi ở bản 1.0 — rất đáng chú ý:**

> "In early EA, the optimal play was often to ignore the end-of-stage elite to farm mineral and XP, which felt backwards. Now, **the faster you kill the boss, the better chest reward you earn**, making for a tradeoff between chest reward and farming."

`[NGUỒN]` https://steamcommunity.com/games/2321470/announcements/detail/1811138915355931 (thông báo 1.0)

Thưởng theo tốc độ: "either a Legendary, Epic or Rare Loot Crate" — **ngưỡng giây cụ thể: KHÔNG TÌM THẤY** `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Objectives

> **Đây là bài học lớn:** trong một game có thanh tiến độ chạy theo thời gian, người chơi sẽ *tự nhiên* rùa bò để farm. Funday phải vá bằng **thưởng theo tốc độ**. Nếu game 10 phút của mình có bất kỳ chỗ nào cho phép nấn ná, phải cài sẵn cơ chế thưởng-nhanh ngay từ đầu.

### 1.6 Các loại nhiệm vụ — số tầng khác nhau

| Loại | Số tầng | Kết tầng | Boss cuối | Mở khoá |
|---|---|---|---|---|
| **Elimination** | **5** | Giết Elite | Dreadnought / Twins (50/50) | mặc định |
| **Escort Duty** | **3** | Kích nổ thuốc bằng cuốc | Ommoran Heartstone | Player Rank 10 |
| **Egg Hunt** (DLC Heavy Duty) | **3** | Đủ hạn ngạch trứng + "a short grace period" | **Brood Nexus** | DLC + Rank 15 |
| Weapon Mastery | 3 | — | — | weapon level 18 |
| Class Mod Mastery | 5 | — | — | — |
| Biome Mastery | **10** | "Dreadnoughts on stages 5 and 10 / Stages 6–9 have 2 elites" | — | Haz 3+ |
| Endless Mode (miễn phí, 1.1) | vô hạn | "The first 10 stages of an Endless Dive are **shorter**, with **increased enemy density**"; từ tầng 11 độ khó tăng mạnh; giới hạn 15 artifact | — | — |
| Vanguard Contracts (ngày) | kế thừa | 1 mutator tốt + 2 xấu | — | thắng Haz 3 |
| Lethal Operations (tuần) | 5 | 1 tốt + 3 xấu | — | thắng Haz 4 |
| Anomaly Dives (6 loại) | kế thừa | chỉ là lớp luật phụ | — | Mastery Points |

`[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Elimination · https://deeprockgalactic.wiki.gg/wiki/Survivor:Escort_Duty · https://deeprockgalactic.wiki.gg/wiki/Survivor:Egg_Hunt · https://deeprockgalactic.wiki.gg/wiki/Survivor:Masteries · https://deeprockgalactic.wiki.gg/wiki/Survivor:Anomaly_Dives · https://steamcommunity.com/games/2321470/announcements/detail/1830797770235497

**KHÔNG có** Deep Dive, Point Extraction, Salvage, Mining Expedition, Refinery trong DRG:S (đó là mode của DRG gốc). ~280 trang namespace `Survivor:` đã được duyệt hết.

**Điểm cực kỳ đáng chú ý cho dự án:** Endless Mode làm 10 tầng đầu **NGẮN HƠN nhưng ĐẶC QUÁI HƠN**. Chính Funday cũng thừa nhận rằng khi cần rút ngắn, giải pháp là **tăng mật độ chứ không giảm nội dung**. Đây đúng là công thức mình cần.

**Escort Duty — vòng lặp đầy đủ** (tham khảo cho ý tưởng nhiệm vụ phụ): thu Oil Shale nạp cho B0b-33 → "When the Drilldozer reaches certain points of the map, it will trigger either a Swarm, or the Supply Pod." → tầng 1–2 kết thúc bằng việc **dùng cuốc kích nổ** các module → tầng 3 đứng trong bán kính máy khoan, diệt Beamer để máy tiếp tục phá vỏ. `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Objectives

Và một câu quan trọng của dev: **"In Escort Duty, you control the tempo. The stage timer only advances when B0b-33 does, and he only moves while you're inside his control circle."** `[NGUỒN]` https://steamcommunity.com/games/2321470/announcements/detail/1809869180027645

> Tức là: cùng một khung, họ tạo biến thể bằng cách **cho người chơi cầm cái van nhịp độ**. Trong một màn 10 phút, đây là ý tưởng cực rẻ để tạo biến hoá.

---

## 2. Lên cấp

### 2.1 Nhặt XP

| Hạng mục | Số liệu | Nguồn |
|---|---|---|
| Hình dạng | **Khối lập phương nhỏ màu xanh** — "you'll collect a small amount of XP (represented by small blue cubes)" | `[NGUỒN]` https://techraptor.net/gaming/guides/deep-rock-galactic-survivor-guide |
| Cách nhặt | **Phải chạy qua để nhặt**, không tự cộng. Người chơi than: "it feels bad when you can't pick them up because you have to run to the drop pod, makes kills less rewarding cause they dont give you anything until you kite back around to get the orbs" | `[NGUỒN]` https://steamcommunity.com/app/2321470/discussions/0/3882723820580279774/ |
| Bán kính hút | Chỉ số **Pickup Radius**, có cả ở thẻ trong ván lẫn meta. Meta "Pocket Magnets": **2% → 36%** | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Meta_Upgrades |
| Ngưỡng khuyến nghị | "prioritize Pickup Radius upgrades whenever they're available until you reach **around 300% for it**" | `[NGUỒN]` https://www.highgroundgaming.com/deep-rock-galactic-survivor-tips-beginner-advanced-guide/ |
| **Nam châm** (item riêng) | Hút **toàn bản đồ**, không phụ thuộc pickup radius: "They pull all the XP across the whole map to you" / "pickup EVERYTHING from the level regardless of pickup radius" | `[NGUỒN]` https://steamcommunity.com/app/2321470/discussions/0/3882723820580279774/ · https://steamcommunity.com/app/2321470/discussions/0/4289187252714796469/ |
| Tăng XP | Meta "Fast Learner": 2% → 24%. Thẻ trong ván "Learn on the Job": "+ -/-/10%/15%/20% XP gain" | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Meta_Upgrades · https://deeprockgalactic.wiki.gg/wiki/Survivor:Mid-dive_Upgrades |
| **Đào cũng ra XP** | "both gold and nitra still give XP"; và cuối ván "Gold and Nitra are converted to XP at the end of a dive" | `[NGUỒN]` https://steamcommunity.com/app/2321470/discussions/0/7607215003628504512/ · https://deeprockgalactic.wiki.gg/wiki/Survivor:Resources |
| Nguồn XP đầu ván | "Your main source of XP and resources at the start is **mining, not killing**" | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Tips,_tricks_and_strategies |
| Lạm phát | "Five levels in stage 1 may only translate to one level by stage 5" | `[NGUỒN]` https://grindnstrat.com/deep-rock-galactic-survivor-1-0-guide/ |

> **Hai vòi XP song song (đào + giết) là thứ khiến 2 phút đầu của DRG:S không nhạt.** Người chơi Vampire Survivors phải đứng chờ quái tới; người chơi DRG:S có việc làm ngay từ giây 0.

### 2.2 Màn chọn thẻ

| Hạng mục | Số liệu | Nguồn |
|---|---|---|
| Số thẻ | **3** — "the 3 upgrades you can choose from" (wiki chính thức không nêu số, chỉ nói "The player is given a choice of these every time they level up") | `[NGUỒN]` https://steamcommunity.com/app/2321470/discussions/0/6292161380820475318/ · https://deeprockgalactic.wiki.gg/wiki/Survivor:Mid-dive_Upgrades |
| Nhóm 1 — **Weapon Upgrade** | "applied to one weapon at a time" — "Taking these increases a weapon's level, **usually by one**" (thẻ "Paint Job" cho 2–3 cấp) | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Mid-dive_Upgrades |
| Nhóm 2 — **Tag Mastery** | "applied to all weapons that fit a given tag"; chỉ hiện khi cầm **ít nhất 2** vũ khí cùng tag | như trên |
| Nhóm 3 — **Player Stat** | "generally applied to the dwarf and all his weapons" | như trên |
| Hạng thẻ | common / uncommon / rare / epic / legendary | như trên |
| **Cách cộng dồn** | **CỘNG, không NHÂN**: "two 50% bonuses are effectively a 100% increase from the base value, not 225%" | như trên |
| Vũ khí mới | **KHÔNG** đến từ thẻ lên cấp — có màn chọn riêng ở cấp 5 / 15 / 25 | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Equipment |

### 2.3 Reroll — và tại sao KHÔNG có banish/lock

| Hạng mục | Số liệu | Nguồn |
|---|---|---|
| Reroll | Tiêu **Gold**: "Gold can be used to... **re-roll the card selection at the shop, and to re-roll the card selection on leveling up**" | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Mid-dive_Upgrades |
| Giá | "**Reroll (Gold): 5, 7, 10, 14, 20, 28, 39, 55, 77, 108 ...**" — dãy còn tiếp, tỉ lệ ≈ **×1.4** làm tròn | như trên · hệ số `[NGUỒN]` https://grindnstrat.com/deep-rock-galactic-survivor-1-0-guide/ |
| **Banish** | **KHÔNG CÓ.** Thread "Can we banish upgrades?" — người hỏi tự định nghĩa "banish means you delete the upgrade for the run so you never see it again"; **không ai xác nhận nó tồn tại**, chỉ trỏ về reroll. Wiki không nhắc tới banish ở bất kỳ đâu. Nó nằm trong mục *đề xuất tính năng*. | `[NGUỒN]` https://steamcommunity.com/app/2321470/discussions/0/6292161380807549049/ |
| **Lock** | **KHÔNG CÓ.** Không nguồn nào nhắc tới. | — |
| Reroll Artifact (khác hệ) | Meta upgrade "Artifact Rerolls" — "Allows you to reroll artifacts from the Supply Pod for **Nitra**" | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Meta_Upgrades |

> **DRG:S cố tình để người chơi *nghèo* công cụ điều khiển pool ngẫu nhiên** (chỉ có reroll, không banish, không lock) — nhưng bù lại bằng **shop tất định giữa tầng**, nơi người chơi mua đúng thứ mình cần bằng Gold/Nitra. Đó là một lựa chọn thiết kế: thay vì cho công cụ lọc RNG, cho một cửa hàng.

### 2.4 Overclock — CHÍNH XÁC là gì

⚠️ **Đính chính quan trọng:** DRG:Survivor chỉ có **HAI loại overclock** — **Balanced** và **Unstable**. **KHÔNG có "Clean" trong Survivor.** Bộ ba Clean/Balanced/Unstable (viền tam giác xanh / lục giác vàng / vuông đỏ) là của **DRG gốc**, tài liệu ở https://deeprockgalactic.wiki.gg/wiki/Weapon_Overclocks — **đừng bê nhầm sang.** Trang `Survivor:Overclocks` chỉ dùng hai icon `Survivor_OC_Balanced.png` và `Survivor_OC_Unstable.png`.

| Hạng mục | Số liệu | Nguồn |
|---|---|---|
| Định nghĩa | "Overclocks are specialized weapon upgrades that can be activated by leveling weapons up during a dive" | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Overclocks |
| Mốc | "**Balanced overclocks can be selected for a weapon at Weapon Levels 6 and 12, and a powerful 'Unstable' overclock can be selected at Weapon Level 18.**" | như trên |
| Xác nhận | "Players can attach a weapon Overclock to their weapon at three weapon levels: Level 6, 12, and 18." | `[NGUỒN]` https://www.ginx.tv/en/survivor-unlock-all-overclocks-weapons |
| Số lựa chọn mỗi mốc | **2** — "gives you the choice between two powerful upgrades whenever a weapon reaches level 6, 12, and 18 during a mission" | `[NGUỒN]` https://www.highgroundgaming.com/deep-rock-galactic-survivor-tips-beginner-advanced-guide/ |
| Số OC mỗi vũ khí (pool) | Điển hình **4–5 Balanced + 2 Unstable** (Deepcore GK2 5B+2U, M1000 5B+2U, Lead Storm 5B+2U, Zhukov 5B+2U, Warthog 4B+2U, Boomstick 4B+2U, Cryo Grenade 4B+2U, Breach Cutter 4B+2U) | `[NGUỒN]` các trang vũ khí trên https://deeprockgalactic.wiki.gg/wiki/Survivor:Weapons |
| Có cần mở khoá meta trước? | **Không còn nữa.** "All the weapons in the game **used to** be provided without overclocks available, and would need to be brought up to weapon level 12 during a run to unlock overclocks for subsequent runs." Milestone đó đã bị gỡ. | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Milestones |
| Toán học khác thẻ thường | "Overclocks operate differently, **mixing multipliers with additive values**" | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Mid-dive_Upgrades |
| OC có thể **đổi damage type** | Warthog "Battery Bullets (Balanced) — Changes damage to [ELECTRICAL], +25% Damage" | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:%22Warthog%22_Auto_210 |
| OC có thể **đổi hướng bắn** | Warthog "Akimbo" (Unstable) — "Shoots an additional time **in the opposite direction**" | như trên |
| Chiến lược | "Push at least one weapon to level 18 for its unstable overclock" | `[NGUỒN]` https://grindnstrat.com/deep-rock-galactic-survivor-1-0-guide/ |
| Màu viền trong Survivor | **KHÔNG TÌM THẤY** — wiki chỉ đưa tên file icon, không mô tả màu | — |

> **Đây là "tiến hoá vũ khí" của DRG:S** — không phải "ghép 2 món" như Vampire Survivors, mà là **ngưỡng đầu tư tích luỹ**: dồn 6 / 12 / 18 thẻ vào một khẩu thì khẩu đó *biến chất*, kể cả đổi hệ sát thương và đổi hướng bắn. Rất hợp game ngắn: buộc người chơi quyết định sớm "tôi dồn khẩu nào", và mỗi quyết định thấy được hiệu quả ngay.

---

## 3. Vũ khí

### 3.1 Số ô và cách mở

| Hạng mục | Số liệu | Nguồn |
|---|---|---|
| **Tối đa 4 khẩu** | "The weapon the player starts with depends on the class mod they chose, and **more can be chosen at levels 5, 15 and 25 during the dive**" → 1 + 3 = 4 | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Equipment |
| Số lựa chọn khi mở ô | **3 khẩu ngẫu nhiên** từ pool đã mở khoá | `[NGUỒN]` https://techraptor.net/gaming/guides/deep-rock-galactic-survivor-weapon-unlocks-guide |
| Pool phụ thuộc | "The available weapons in that choice will depend on what has been unlocked through completing **milestones**" + Class Mod | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Equipment |
| Class có đổi số ô không | **Không.** Class Mod chỉ đổi vũ khí khởi đầu và **pool** được rút (Recon "accesses all light weapons", Heavy Gunner truy cập heavy...) | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Class_Mods · https://deeprockgalactic.wiki.gg/wiki/Survivor:Weapons |
| Mua ô được không | **Không.** Shop chỉ bán *nâng cấp*, không bán vũ khí mới. | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Mid-dive_Upgrades |
| Ngoại lệ | Weapon Mastery: "you are only able to use that weapon, and **no other weapon slots will unlock in the dive**" | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Masteries |
| Nhịp thực tế | Khẩu 2 ở cấp 5 là "first real power spike"; khẩu thứ 4 thường có ở **tầng 2** | `[NGUỒN]` https://grindnstrat.com/deep-rock-galactic-survivor-1-0-guide/ |

### 3.2 Hệ thống TAG

Mỗi vũ khí gắn nhiều nhãn; nhãn là thứ các thẻ Tag Mastery bám vào. `[NGUỒN]` toàn bộ: https://deeprockgalactic.wiki.gg/wiki/Survivor:Weapons

| Trục | Giá trị |
|---|---|
| **Damage type** | KINETIC ("basic non-elemental damage"), FIRE, ELECTRIC, COLD, ACID, PLASMA ("causes projectiles to bounce") |
| **Family** | LIGHT, MEDIUM, HEAVY, THROWABLE, CONSTRUCT |
| **Type** | PROJECTILE, EXPLOSIVE, DRONE, TURRET, GROUNDZONE ("create a zone on the ground that damages enemies") |
| **Firing** | PRECISE, SPRAY, AREA, BEAM, LASTING |

Ví dụ hiển thị trên thẻ: `"Bulldog" Heavy Revolver = [KINETIC] [MEDIUM] [PRECISE] [PROJECTILE]`

Chỉ số cốt lõi:
- **Clip Size** — "How many projectiles a weapon can fire before reloading."
- **Fire Rate** — "Projectiles fired per second, and how fast a clip is emptied."
- **Piercing** — "How many enemies a projectile can pierce. **Larger enemies, Elites, and Bosses require higher piercing values.**"
- **Reload Time** — "Downtime after a clip is emptied before it can be fired again; affects speed of deploying [CONSTRUCT] weapons." → **nạp đạn tự động, không có nút nạp tay.**

Công thức: base × class modifiers + flat bonuses, rồi × Meta Upgrades × Overclock × Artifact. Xem được ở màn pause trong ván.

> **Hệ tag 4 trục là cỗ máy sinh build.** Mỗi vũ khí đeo ~4 nhãn, mỗi nhãn là một đường nâng cấp. Chỉ với 40 vũ khí và ~20 nhãn, họ có được số tổ hợp khổng lồ mà không phải viết riêng nâng cấp cho từng khẩu. **Đây là thứ đáng bê nguyên si nhất về mặt kiến trúc dữ liệu.**

### 3.3 TỰ ĐỘNG BẮN — auto-aim chọn mục tiêu thế nào

**Không có ngắm tay, tuyệt đối:** "Unlike some other auto-shooters, *Deep Rock Survivor* does **NOT** have a manual aim option for any of its weapons." `[NGUỒN]` https://www.highgroundgaming.com/deep-rock-galactic-survivor-tips-beginner-advanced-guide/ — có hẳn một mod Nexus tên "Poor Man's Twin-Stick Shooting" ra đời chỉ vì bản gốc thiếu tính năng này `[NGUỒN]` https://www.nexusmods.com/deeprockgalacticsurvivor/mods/15

**Luật ngắm được viết thẳng vào mô tả từng khẩu trong game.** Đây là các chế độ đã xác nhận:

| Chế độ | Vũ khí | Mô tả nguyên văn trong game |
|---|---|---|
| **Địch gần nhất** | Deepcore GK2 | "Fairly straight forwards assault rifle that shoots in bursts. **Targets closest enemy.**" `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Deepcore_GK2 |
| **Địch gần nhất** | Jury-Rigged Boomstick | "**Targets closest enemy**" `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Jury-Rigged_Boomstick |
| **Địch NHIỀU MÁU NHẤT** | M1000 Classic | "Shoots high caliber piercing bullets. **Targets highest HP enemy.**" `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:M1000_Classic |
| **Nhắm cụm đông** | Breach Cutter | "**Targets groups of enemies**" `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Breach_Cutter |
| **Theo hướng ĐANG DI CHUYỂN** | "Lead Storm" Minigun | "Shoots a hail of bullets in the direction you are facing. **Shoots in move direction.**" `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:%22Lead_Storm%22_Powered_Minigun |
| **Phía trước + hướng di chuyển** | "Warthog" Auto 210 | "**Shoots in front of you** in a steady rhythm. Knocks back enemies. **Shoots in move direction.**" `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:%22Warthog%22_Auto_210 |
| **Bốn hướng cố định (không ngắm)** | Zhukov NUK17 | "Quick firing weapon that **shoots in four directions**." `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Zhukov_NUK17 |
| **Hướng ngược lại (qua OC)** | Warthog + Akimbo (Unstable) | "Shoots an additional time **in the opposite direction**" `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:%22Warthog%22_Auto_210 | 
| **Không có dòng ngắm** (ném theo quán tính) | Cryo Grenade | "A grenade that deals moderate damage and slows enemies." `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Cryo_Grenade |

- "Bắn phía sau" và "nhắm địch ngẫu nhiên": **KHÔNG TÌM THẤY** trong text wiki. Người chơi có mô tả chung "some shoot in front of you, some in the back, some aim on the healthiest or weakest mob" `[NGUỒN]` https://steamcommunity.com/app/2321470/discussions/0/6292161380810861217/ nhưng không khớp được với dòng mô tả nào.
- **Di chuyển CÓ ảnh hưởng tới bắn** với nhóm "Shoots in move direction" — góc bắn bám theo hướng chạy, không bám theo quái.
- Điểm yếu thừa nhận: nhóm lựu đạn bị chê "vague descriptions and rather inconsistent targeting" `[NGUỒN]` https://www.highgroundgaming.com/deep-rock-galactic-survivor-tips-beginner-advanced-guide/
- **Né** là bị động: "Sometimes when you take damage you instead take 0 damage. That's it." `[NGUỒN]` https://steamcommunity.com/app/2321470/discussions/0/4342103279863938065/

> ### Bài học then chốt của cả tài liệu này
> **Auto-aim ở DRG:S là một phần BẢN SẮC của từng vũ khí, không phải một hàm dùng chung.**
> "Khẩu này bắn địch gần nhất / khẩu kia bắn địch máu cao nhất / khẩu nọ chỉ bắn theo hướng bạn đang chạy" — chính điều đó tạo ra quyết định **đứng ở đâu, chạy hướng nào**. Nó biến một game "chỉ có di chuyển" thành một game có chiều sâu vị trí thật.
> Nếu game của mình dùng một hàm auto-aim duy nhất cho mọi vũ khí, mình mất phân nửa chiều sâu mà không tốn thêm dòng code nào để lấy lại.
> Và quan trọng: **luật ngắm được in thẳng trên thẻ vũ khí**, người chơi đọc là biết ngay. Không giấu.

### 3.4 Danh sách vũ khí theo class

`[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Weapons — số trong ngoặc = **Class Rank** cần để mở khoá vĩnh viễn.

| Class | Chỉ số nền | Vũ khí (10–11 khẩu) |
|---|---|---|
| **Scout** | HP 120 · Dodge 5% · Crit 5% / 200% | Deepcore GK2 (1), Jury-Rigged Boomstick (1), Zhukov NUK17 (1), Cryo Grenade (1), M1000 Classic (3), Voltaic Stun Sweeper (6), TH-0R Bug Taser (12), Arc-Tek Cryo Guard (15), Drak-25 Plasma Carbine (21), Nishanka Boltshark X-80 (24) |
| **Gunner** | HP 160 · Armor 10 · Crit 5% / 150% | "Lead Storm" Minigun (1), "Bulldog" Heavy Revolver (1), Incendiary Grenade (1), BRT7 Burst Fire Gun (3), Tactical Leadburster (6), "Thunderhead" Heavy Autocannon (12), Firefly Hunter Drone (15), "Hurricane" Guided Rocket System (21), Seismic Repulsor (24), ArmsKore Coil Gun (27) |
| **Engineer** | HP 130 · +5% XP Gain | Hi-Volt Thunderbird (1), "Stubby" Voltaic SMG (1), LMG Gun Platform (1), "Warthog" Auto 210 (1), Voltaic Shock Fence (3), LOK-1 Smart Rifle (6), Deepcore PGL (12), Breach Cutter (15), Shard Diffractor (21), Plasma Burster (24), Shredder Swarm Grenade (27) |
| **Driller** | HP 145 · **Mining Speed +20%** | Subata 120 (1), CRSPR Flamethrower (1), High Explosive Grenade (1), Krakatoa Sentinel (1), Corrosive Sludge Pump (3), Colette Wave Cooker (6), Impact Axe (12), Neurotoxin Grenade (15), Cryo Cannon (21), K1-P Viper Drone (24), Experimental Plasma Charger (27) |
| **Demolisher** (DLC) | HP 175 · Armor 10 | Dragonstorm Incinerator (1), Twincoil Arc Burster (1), Chimera Fragcannon (1), Proximity Mines (1), Voltaic Field Generator (3), Slither Drones (6), E1M1 Caustic Scattergun (12), Toxic Sludge Spreader (15), Springloaded Ripper (21), Kaisong Scissor Ray (24), Carrier Drone (27) |

Chỉ số nền: https://deeprockgalactic.wiki.gg/wiki/Survivor:Scout · .../Survivor:Gunner · .../Survivor:Engineer · .../Survivor:Driller · .../Survivor:Demolisher

### 3.5 Weapon Level — KHÔNG có trần

⚠️ **Đính chính:** 18 là **mốc overclock cuối cùng**, không phải trần cấp.

- Steam: "It looks like 18 is the max, with overclocks at 6, 12 and 18" → được trả lời: "**You just keep leveling them. There is no maximum level.**" / "You can get like lvl 60 in just 1 weapon" `[NGUỒN]` https://steamcommunity.com/app/2321470/discussions/0/4289188745218440022/
- Có hẳn hướng dẫn cộng đồng tên "Guide to power leveling a weapon to **25-40+**" `[NGUỒN]` https://steamcommunity.com/sharedfiles/filedetails/?id=3204799839
- Nhưng **UI gợi ý sai**: "the UI implies that there is a level cap. The little bars with the bigger bars, makes it look like there's a max." (bài học UX ngược: đừng vẽ thanh có vẻ đầy nếu nó không có trần)

### 3.6 Weapon Mastery — khác gì nâng cấp trong ván

`[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Masteries

| Hạng mục | Nội dung |
|---|---|
| Mở khoá | "one weapon at a time by **upgrading that weapon to level 18 in any dive**" + đạt Hazard tương ứng |
| Thể thức | "short, **three-stage** dives where players make use of only a single weapon"; "no other weapon slots will unlock in the dive" |
| Thưởng | **Vĩnh viễn**: "+12% to one stat" (nếu vũ khí có 1 stat mastery) hoặc "+7% to one stat, +7% to the other" |
| Khác biệt | Nâng cấp trong ván là "temporary… lasting only through the current mission"; Mastery là buff vĩnh viễn toàn tài khoản |
| Còn cho | Mastery Points → mở Anomaly Dives |

---

## 4. Đào (mining)

### 4.1 Cơ chế

| Hạng mục | Nội dung | Nguồn |
|---|---|---|
| **Kích hoạt** | **TỰ ĐỘNG theo khoảng cách. Không có nút đào.** "If you stick close enough to rock formations, your character will start mining" | `[NGUỒN]` https://thenerdstash.com/deep-rock-galactic-survivor-starter-guide/ |
| Điều khiển | Chỉ WASD / cần gạt. Thread bàn về control scheme không hề nhắc tới nút đào nào. | `[NGUỒN]` https://steamcommunity.com/app/2321470/discussions/0/4342103279863938065/ |
| Tốc độ đào phụ thuộc | (a) chỉ số **Mining Speed**; (b) **class** (Driller +20% nền); (c) **class mod** (Foreman: "+2% Mining Speed buff for 2 seconds each time Driller mines, **stacking up to 25 times**"); (d) **loại địa hình** theo biome; (e) meta "Mining 101" (Croppa); (f) thẻ trong ván; (g) mutator "Rock and Stone — Rocks and minerals are easier to mine" | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Driller · https://deeprockgalactic.wiki.gg/wiki/Survivor:Meta_Upgrades · https://deeprockgalactic.wiki.gg/wiki/Survivor:Mutators |
| Địa hình dễ/khó | Salt Pits "easier to mine... except for dark gray strips"; Hollow Bough có dây leo "regenerating" | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Biomes |

> Cơ chế **Foreman stack ×25** rất đáng chú ý: nó thưởng cho việc **đào liên tục** chứ không thưởng cho việc đào nhiều. Một cách rất rẻ để biến "đào" từ việc vặt thành một nhịp điệu.

### 4.2 Ngưỡng Mining Speed — con số thiết kế quan trọng nhất

- "you should always try and get mining to **20%+** So you can actually **kite stuff through normal rocks**."
- "My sweet spot is at around **25%** too i'd say, **being able to kite bugs through normal rock is a huge help**."
- Ý kiến ngược: "miningspeed is overrated, the upgrades from mainscreen is enough"

`[NGUỒN]` https://steamcommunity.com/app/2321470/discussions/0/4342103705852468095/

> **Đây là con số cân bằng quan trọng nhất của cả hệ thống đào.** Tốc độ đào nền được cân sao cho bạn **KHÔNG** chạy thoát được qua đá. Chỉ khi đầu tư ~+20–25% thì "đào để chạy" mới thành chiến thuật khả thi.
> Nghĩa là mining speed là **một trục build thật**, không phải tiện ích. Nếu ở mức nền mà đã đào thoát được thì toàn bộ hệ thống mất ý nghĩa chiến thuật.

### 4.3 Vai trò của việc đục tường

| Chiến thuật | Trích | Nguồn |
|---|---|---|
| Đào để trốn | "carve tunnels to grab rare minerals for upgrades—**or just to make a last-second escape route** when a swarm of glyphids comes crashing in" | `[NGUỒN]` https://game8.co/articles/reviews/deep-rock-galactic-survivor-review |
| **Lái AI quái** | AI quái đi **đường ngắn nhất từ A đến B**; đào hầm mới là thao túng đường đi của chúng — dồn bầy vào chỗ hẹp cho AoE, hoặc gộp nhiều bầy nhỏ thành một bầy dễ kite | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Tips,_tricks_and_strategies |
| Đào trước, chừa nút cuối | Đào gần thủng rồi để lại lớp mỏng: ép quái vào cửa hẹp để đánh, đục nốt khi cần chạy | như trên |
| Phễu | "Tunnel into a big wall and kind of funnel them in at you." | `[NGUỒN]` https://steamcommunity.com/app/2321470/discussions/0/4342103705852468095/ |
| Ưu tiên đầu ván | "**dig first, fight later**" | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Tips,_tricks_and_strategies |
| **Bắt buộc phải đào** | Supply Pod chỉ hạ được khi vùng tròn đã đào sạch, có overlay hình cuốc trên nền đất | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Equipment |
| Địa hình bị quái phá lại | Praetorian "can slowly dig out terrain"; Elite Praetorian/Slasher "can break terrain much more effectively" | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Creatures |
| Địa hình vô hiệu hoá bởi Mactera | "Flying melee enemies who can passively fly over terrain. **Walls, vines, and voids mean nothing to Mactera.**" | như trên |

> **Đây là vòng lặp counter-play ba tầng, rất đẹp:**
> người chơi **đào** để tạo chokepoint → **Praetorian đào ngược lại** để phá chokepoint → **Mactera bay xuyên** để vô hiệu hoá hoàn toàn chiến thuật đào.
> Ba loại quái, ba câu trả lời khác nhau cho cùng một chiến thuật. Nếu game của mình có đào, **phải có ít nhất một loại quái phá được tường và một loại bay qua tường**, nếu không chiến thuật đào sẽ thắng tuyệt đối.

### 4.4 Nitra / Gold dùng làm gì TRONG ván

| Tài nguyên | Thu ở đâu | Dùng trong ván | Nguồn |
|---|---|---|---|
| **Gold** | Đào mạch vàng; nổ Lootbug / Golden Lootbug / Huuli Hoarder; nhiệm vụ phụ | (1) mua thẻ **Tag Mastery** (29/35/48/77) và **Player Stat** (23/29/40/63) ở shop; (2) **hồi 50% máu = 30 Gold**; (3) **reroll thẻ lên cấp**; (4) reroll hàng shop; (5) một số Artifact ăn theo lượng Gold đang cầm | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Mid-dive_Upgrades · https://deeprockgalactic.wiki.gg/wiki/Survivor:Resources |
| **Nitra** | Đào mạch Nitra (cụm tinh thể đỏ); nổ quái | (1) mua thẻ **Weapon** (14/18/24/38 Nitra); (2) reroll Artifact ở Supply Pod; (3) tiếp sức một số Artifact | như trên |
| **Red Sugar** | Nốt quặng đỏ phát sáng | "Heals the player when it's picked up" | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Resources |
| **Oil Shale** | Chỉ Escort Duty | Nạp nhiên liệu Drilldozer | như trên |

**Cuối ván:** "Gold and Nitra are converted to XP at the end of a dive" — nên không sợ thừa. Và **thu Credits tính theo lượng ĐÃ NHẶT chứ không phải lượng CÒN LẠI**: "Credit payments are based on what is picked up, not the remaining amount of resources at the end of the dive, so Gold and Nitra can be **freely spent** on upgrades." `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Credits

> **Chi tiết cực kỳ tinh tế và đáng học:** người chơi **không bao giờ phải tiếc tiền**. Tiêu hay không tiêu, phần thưởng meta y hệt. Điều này xoá sạch cái tật "để dành phòng khi" vốn làm hỏng nhịp chơi ở rất nhiều roguelite.

**Hai loại tiền tách theo CHỨC NĂNG, không theo độ hiếm:** Nitra = vũ khí, Gold = người + reroll. Người chơi luôn biết mình đang thiếu loại nào và phải đi đào loại nào. Cực rõ ràng, dạy một lần là nhớ.

---

## 5. Spawn quái + swarm

### 5.1 Nhịp spawn

| Hạng mục | Nội dung | Nguồn |
|---|---|---|
| Cơ chế nền | Rỉ rả liên tục + **Swarm ở mốc trên Progress Bar** (không phải hẹn giờ tuyệt đối) | `[NGUỒN]` https://techraptor.net/gaming/guides/deep-rock-galactic-survivor-guide |
| **Swarm không tự biến mất** | "Swarms will not despawn." | như trên |
| Cảnh báo | **"Swarm detected. The scanner just lit up like a Christmas tree, swarm incoming."** — thông báo trên màn + thoại Mission Control | `[NGUỒN]` https://steamcommunity.com/app/2321470/discussions/0/4694532371788212378/ |
| Số swarm mỗi tầng | 1 / 2 / 3 / 3 theo tầng 1–4 | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Elimination |
| **Khoảng cách giữa các swarm (giây / % thanh)** | **KHÔNG TÌM THẤY.** Không wiki, không dev, không datamine nào công bố. | — |
| Giai thoại duy nhất (thời EA) | "You just appear on the floor, excavate 1-2 veins of minerals and the first wave of beetles appears, **after 15 seconds** the second wave appears, then the third wave and the boss." | `[NGUỒN]` https://steamcommunity.com/app/2321470/discussions/0/4342103279858852502/ |
| Mutator chèn swarm | "Deep Vibrations — Spawns a wave when the Supply Pod is called"; "Swarm Guard — Spawn an elite at the start of the stage" | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Mutators |

### 5.2 Alien Threat Level — đồng hồ trừng phạt

| Hạng mục | Nội dung | Nguồn |
|---|---|---|
| Bản chất | "**Alien Threat Level** increases when the player is **dilly dallying**." Flavour: "The aliens grow stronger!" | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Difficulty |
| Tốc độ (Elimination) | "**threat level increases by one every 60 seconds during boss battles**" | như trên |
| Escort Duty | "increases periodically throughout the mission" | như trên |
| **Khi nào bắt đầu tick** | Tầng 1–4: "once the **Elites** spawn" · Tầng 5: "once the **Dreadnought** spawns" · Escort: "as soon as the **mission starts**" | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Objectives |
| Lời dev | "the threat counter starts ticking from the beginning of each stage, steadily powering up the swarm. **Wait too long, and you'll be buried under bugs that are far nastier than when you began.**" | `[NGUỒN]` https://steamcommunity.com/games/2321470/announcements/detail/1809869180027645 |
| **UI** | **Vòng tròn hình đầu lâu ở góc trên bên PHẢI**: "in the upper right there is a skull in a circle, and the outside fills as a meter. this shows how long until the next threat level, as well as the current threat level" | `[NGUỒN]` https://steamcommunity.com/app/2321470/discussions/0/591783109130761488/ |
| Hệ số nhân mỗi cấp | **KHÔNG TÌM THẤY.** Số duy nhất công bố liên quan: "Reduced the enemy speed bonus when enemies grow stronger (**8% → 5%**)" | `[NGUỒN]` https://steamcommunity.com/games/2321470/announcements/detail/1795917897322495 |
| Mức trần | **KHÔNG TÌM THẤY** (không có cap công bố). Nhưng nó lên cao thật: các milestone gồm "Reach alien threat level **20**", "Complete a stage with alien threat level **25 or more**" | `[NGUỒN]` wikitext https://deeprockgalactic.wiki.gg/wiki/Survivor:Escort_Duty |
| Cộng dồn qua tầng? | Người chơi báo là **không** (không có xác nhận chính thức) | `[NGUỒN]` https://steamcommunity.com/app/2321470/discussions/0/591783109130857459/ |

> **Đây là câu trả lời của DRG:S cho bài toán "người chơi rùa bò farm vô hạn".** Không đuổi bằng cách hết giờ thua, mà bằng cách **quái mạnh dần**. Rẻ, dễ hiểu, tự cân bằng — và có **UI riêng dạng đồng hồ đầu lâu** để người chơi thấy được sức ép đang tích tụ.

### 5.3 Hazard Level 1–5

| Hạng mục | Nội dung | Nguồn |
|---|---|---|
| Dải | Haz 1 → Haz 5 | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Difficulty |
| Quy tắc định tính | "Greater Hazards offer more Resources and higher-level Gear, but the bugs are stronger." | như trên |
| **Hệ số nhân HP/DMG cụ thể** | **KHÔNG TÌM THẤY Ở BẤT KỲ ĐÂU.** Trang wiki còn là stub; người chơi đã hỏi dev và **không được trả lời**: "it would be nice to have proper text on how much those modifiers are.. so you can judge how much you should upgrade your profile." | `[NGUỒN]` https://steamcommunity.com/app/2321470/discussions/0/6292161380819736758/ |
| Thứ CÓ tài liệu thay đổi theo Haz | Số Elite mỗi tầng · roster quái (Elite Q'ronar Shellback từ Haz 2+) · sát thương Supply Pod (xem 1.4) · Mastery Point thu được · số mutator ở Mutator Madness (Haz 1 = 1 tốt 1 xấu; Haz 2–5 = 1 tốt 2 xấu) | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Objectives · .../Survivor:Creatures · .../Survivor:Anomaly_Dives |
| Gating chế độ | Vanguard Contracts mở sau khi thắng Haz 3; Lethal Operations sau Haz 4 | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Vanguard_Contracts · .../Survivor:Lethal_Operations |
| Sector gating | "Higher level sectors have Mutators and minimum Hazard levels. (Sector 02 is Haz 2+, Sector 03 is Haz 3+, etc.)" | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Elimination |
| Mở khoá | Bằng **Biome Points** từ 3 thử thách hiện ngay trên màn chọn hazard. Giá ví dụ (Magma Core Elimination): Haz 1/2/3/4/5 = **2 / 9 / 19 / 29 / 39**; Hollow Bough Haz 5 = 55; Salt Pits Haz 5 = 60; Azure Weald Haz 1/3/5 = 8 / 32 / 64 | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Biomes |
| Mỗi bậc Haz kèm 1 mutator cố định | VD Crystalline Caverns Elimination Haz 5 = "Deepstrain Dreadnought — Dreadnought: **+50% HP, +50% Speed**" | như trên |

### 5.4 Ba bậc quái

| Bậc | Đặc điểm | Nguồn |
|---|---|---|
| **Thường** | Grunt phân 3 tier bằng **màu**: nâu (T1) → xanh (T2) → đỏ nâu (T3). "The sole difference is that blue and reddish brown grunts have more health" | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Creatures |
| **Mini Elite** | "stronger **purple** varieties who spawn in swarms" — "They are purple in color and have a **small health bar**" | như trên |
| **Elite** | "Elite Enemies serve as the **boss encounters for every stage but the last**, sporting increased health, speed, and damage" | như trên |
| **Dreadnought** | Boss tầng cuối | như trên |

### 5.5 Mutator — kho ~100 luật phụ (kho ý tưởng miễn phí)

"special challenging gamerule changes that come into play during Main Missions past Sector 01" `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Mutators

| Tích cực | Tiêu cực |
|---|---|
| Rock and Stone — "Rocks and minerals are easier to mine" | Dark Caves — "Reduced visibility" |
| Long Arms — "+75% Pickup Radius" | Weak Signal — "Your minimap is less reliable" |
| Steel Bones — "+500% Max HP, **-100% to all healing**" | Faulty Rounds — "Weapons sometimes jam" |
| Rich Deposits — "Spawns huge Nitra and Gold deposits" | Aerial Ectoplasm — "Spawns an **unkillable ghost**" |
| Generalist — "-50 Luck, +75% XP Gain" | Toxic Fumes — "Take 2.5% Max HP damage every 10 seconds" |
| Weakened Elites — "Elites: -20% HP, -20% DMG, -20% Speed" | NL Omega Pheromones — "Enemies: +50% HP, +30% DMG, +15% Speed" |
| Meta-Pods — "Supply Pod will open faster, **Drop Pod will wait longer**" | Just Pick One — "**You only have one choice**" |

Có cả họ mutator phân bậc để scale sạch: Hardened Carapace I/II/III (+10/20/30% HP), Serrated Claws I/II/III (+10/20/30% DMG), Enhanced Pheromones I/II/III.

> **"Just Pick One — You only have one choice"** là một mutator thiên tài: nó không đổi số nào cả, chỉ **bỏ đi quyền chọn**. Loại mutator kiểu này rẻ nhất để làm mà đổi nhiều nhất về cảm giác.

---

## 6. Danh sách quái + boss

`[NGUỒN]` toàn bộ mục 6: https://deeprockgalactic.wiki.gg/wiki/Survivor:Creatures (trừ chỗ ghi nguồn khác)

### 6.1 Quái di động cơ bản

| Tên | Hành vi (trích) | Bài học thiết kế |
|---|---|---|
| **Grunt** (nâu T1 / xanh T2 / đỏ nâu T3) | "basic melee enemies who will constantly walk towards the player, dealing damage when within biting range" | Quái nền, phân bậc chỉ bằng màu |
| **Fast Grunt** | "considerably faster and have less health than their cousins" | Ép người chơi không được đứng yên |
| **Slasher** | "Upgraded melee enemies, featuring more health and higher damage than Grunts" | Bậc trên của Grunt |
| **Acid Spitter** | "Keep a medium distance from the player and fire purple acid shots. Spitters will **not approach to melee, and will retreat when the player gets too near**" | **Quái duy nhất chủ động LÙI** — ép người chơi phải tiến lên, đảo ngược hoàn toàn nhịp kite |
| **Exploder** | Glyphid **cam to**, "approach the player and then explode in a large AOE" | Nổ dây chuyền dọn swarm — vừa là mối nguy vừa là công cụ |
| **Mini Exploder** | Bản **tím nhỏ** (Azure Weald), nhanh hơn nhưng yếu hơn | Biến thể biome |
| **Praetorian** | "Large melee glyphids that are much more durable... **can slowly dig out terrain**" | **Phá chiến thuật chokepoint** |
| **Big Praetorian** | Bản **xanh** của Azure Weald, "the only notable difference... is in their health" | Cùng silhouette, khác màu = khác máu |
| **Mactera** (xanh lá, bay) | "Flying melee enemies who can passively fly over terrain. **Walls, vines, and voids mean nothing to Mactera.**" Ở Hollow Bough "fly together in small clusters" | **Vô hiệu hoá hoàn toàn chiến thuật đào** |
| **Q'ronar Youngling** | Riêng Salt Pits: "travel aimlessly, **bouncing off of the walls** and hurting the player" | Nguy hiểm ngẫu nhiên, không đuổi theo — kiểu đe doạ hoàn toàn khác |

### 6.2 Quái đứng yên

| Tên | Hành vi |
|---|---|
| **Stabber Vine** | "Stationary melee enemies, attacking the player should you get close. **The attacks aren't predictive.**" (không đoán trước hướng chạy → tránh được nếu đi ngang) |
| **Spitball Infector** | "Stationary ranged enemies that fire large **green** shots at the player." |

### 6.3 Mini Elite (tím, đi trong swarm, có thanh máu nhỏ)

- Grunt / Fast Grunt / Slasher Mini Elite: tăng sát thương + tốc độ
- **Spitter Mini Elite**: "shoot a **spread of three shots** rather than just one"
- **Mactera Mini Elite**: "**actively pursue the player**" (bản thường chỉ bay lởn vởn)
- **Q'ronar Youngling Mini Elite**: phá được địa hình
- **Warden** (chỉ Azure Weald): "keep their distance from the player and will occasionally stop moving to create a **mind link, giving all enemies in the radius considerable damage reduction**" → **quái buff, ép đổi mục tiêu ưu tiên**

### 6.4 Elite — "boss" của tầng 1–4

| Tên | Hành vi |
|---|---|
| **Elite Slasher / Elite Praetorian** | "Can break terrain **much more effectively** than regular Praetorians" |
| **Elite Acid Spitter** | "Shoot **five shots in a spread pattern**. They are just as passive as their non-elite counterparts." |
| **Elite Mactera** | "Will **actively pursue** the player" |
| **Elite Q'ronar Shellback** | Như Youngling nhưng "when near the player will **stop to fire a beam of acid** at you, dealing considerable damage". Chỉ Haz 2+, và chỉ ở Crystalline Caverns / Magma Core / Salt Pits |

### 6.5 Boss

| Boss | Ở đâu | Hành vi (trích) |
|---|---|---|
| **Glyphid Dreadnought** | Elimination tầng 5 | "**towers over all the other enemies in the game**, and is the single most dangerous of them all. Its main attack is a **long distance leap** which deals massive damage." Thêm: "**smashes the ground, creating a funnel of rock pillars which will confine you to a small area until you dig out**", và "**fires swarm eggs** at the player, which can hatch into grunts, slashers, and praetorians." Nửa máu: xuất hiện stalagmite `[NGUỒN]` https://grindnstrat.com/deep-rock-galactic-survivor-1-0-guide/ |
| **Dreadnought Twins** | Elimination tầng 5 (50%) | "the **purple, melee-focused Lacerator**; and the **orange, range-focused Arbalest**. The Lacerator deals melee damage upon running into the player, but also shares the leaping attack... The Arbalest keeps its distance, shooting a spread of fireballs. Each twin has its own health bar, and **when the difference in health becomes too large, they will heal each other so that their health bars are equal.**" |
| **Ommoran Heartstone** | Escort Duty tầng 3 | Đứng trong bán kính Drilldozer để nó phá vỏ; "**While the beamers are active, the Drilldozer will not be able to damage the Ommoran Shell**"; vỡ vỏ → "causes an explosion that instantly kills all active enemies" `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Objectives |
| **Brood Nexus** | Egg Hunt tầng 3 (DLC) | "A Brood Nexus erupts on top of the pod, **locking down your exit** and triggering a multi-phase boss fight. It spawns relentless waves of enemies, and at key moments, creates **Nexus Sprouts that must be destroyed before you can damage the nexus again**." **Đứng yên một chỗ**, khác hẳn Dreadnought di động `[NGUỒN]` https://xpgained.co.uk/patch-notes/deep-rock-galactic-survivor-heavy-duty-patch-notes-30-april-2026 |

**Boss có theo biome không? KHÔNG.** Boss là hàm của **loại nhiệm vụ**, không phải biome. Biome chỉ đổi địa hình, hazard môi trường, hệ số HP/DMG phẳng, và quái riêng.

> **Ba boss = ba bài toán khác nhau, đáng phân tích:**
> - **Dreadnought** = boss di động, đòn chính là nhảy tầm xa → bài toán *đọc telegraph và tránh*. Đòn cột đá là bài toán *phải đào để thoát* — dùng lại cơ chế cốt lõi của game làm cơ chế boss.
> - **Twins** = hai thanh máu tự cân bằng → bài toán *chia đều sát thương*, cấm focus. Phá vỡ thói quen "dồn hết vào một mục tiêu".
> - **Brood Nexus** = boss đứng yên nhưng **khoá lối thoát**, có pha bất tử cần phá Sprout → bài toán *quản lý ưu tiên mục tiêu*.
> Với game 1 màn, boss kiểu **Dreadnought** (di động + có một đòn buộc dùng cơ chế đào) là lựa chọn tốt nhất: nó dạy lại toàn bộ kỹ năng của màn trong 60 giây.

### 6.6 Sinh vật hiền

| Tên | Vai trò |
|---|---|
| **Lootbug** | "Passive creatures that mind their own business, **not bothering to pursue the player**" — nổ ra Gold và Nitra |
| **Golden Lootbug** | To hơn, "a rather generous amount of gold" |
| **Huuli Hoarder** | "Uncommon passive creatures, which **quickly run away when attacked**" — rơi Loot Crate chứa nâng cấp và Artifact |

> Ba con này là **mini-game săn đuổi miễn phí**, chèn được vào bất cứ lúc nào để phá nhịp bắn-liên-tục. Huuli Hoarder đặc biệt hay: nó **chạy trốn**, biến một khoảnh khắc phòng thủ thành một khoảnh khắc tấn công.

---

## 7. Hazard môi trường theo biome

`[NGUỒN]` toàn bộ: https://deeprockgalactic.wiki.gg/wiki/Survivor:Biomes (trừ chỗ ghi khác)

| Biome | Hazard môi trường (trích) | Buff quái | Quái riêng |
|---|---|---|---|
| **Crystalline Caverns** | "a standard biome with purple mineable terrain and purple crystalline structures" — không hazard đặc thù | "Enemies are at the **default difficulty**" | — |
| **Magma Core** | "**Cracked ground and terrain with exposed lava deals damage** to miners who come into contact. **Exploding plants trigger when the player comes too close.**" | **+5% HP, +5% DMG** | — |
| **Hollow Bough** | "The brown vines are **regenerating vines**" (đường hầm **tự bịt lại**!); "The thick red vines are able to be mined but **will damage the player if they contact them** and will also regenerate" | **+10% HP, +10% DMG** | Mactera ("fly together in small clusters"), Stabber Vine |
| **Salt Pits** | "large red pulsating crystal clusters in the ground that, upon mining, will **collapse several unstable stalactites from the ceiling that can kill monsters**"; đá trắng dễ đào "except for dark gray strips" | **+15% HP, +15% DMG** | Q'ronar Youngling |
| **Azure Weald** | "**jump pads and healing crystals**. Walking across a jump pad **launches a dwarf high in the air**, and when they crash back down they **destroy terrain under them, push bugs away, and are granted a haste boost**"; "**There is no Red Sugar**; instead, circles of crystalline columns offer healing over time". Nhịp spawn khác: "**periods of relative quiet followed by heavy spawn rates**" | **KHÔNG TÌM THẤY** (wiki in nguyên `[?]%`) | Warden, Mini Exploder, Big Praetorian |
| **Glacial Strata** (DLC 1.1) | "green icicles and patches of **smooth ice**. The smooth ice **increases the speed of all dwarfs sliding across it at the cost of control**." Publisher: "**trigger deadly icicle traps by shattering ice crystals**, and face new cryo-infused enemies" `[NGUỒN]` https://xpgained.co.uk/patch-notes/deep-rock-galactic-survivor-heavy-duty-patch-notes-30-april-2026 | **KHÔNG TÌM THẤY** (wiki in `?%`) | quái hệ băng — **tên cụ thể KHÔNG TÌM THẤY** |

> ### Bốn kiểu hazard môi trường, xếp theo giá trị/chi phí
> 1. **Ô sàn gây sát thương** (dung nham, dây đỏ) — rẻ nhất, chỉ là vùng va chạm. Đắt nhất là làm hiệu ứng hình.
> 2. **Địa hình MỌC LẠI** (dây leo nâu Hollow Bough) — **giá trị cao nhất cho game 1 màn.** Nó vô hiệu hoá chiến thuật "đào một lần rồi trốn mãi", ép người chơi phải đào liên tục, và tự động chống lại việc rùa bò. Chi phí gần bằng 0.
> 3. **Đổi ma sát** (băng Glacial Strata) — đổi *cảm giác điều khiển* mà không cần thêm asset nào.
> 4. **Hazard hai mặt** — Salt Pits là ví dụ đẹp nhất: thạch nhũ rơi "**can kill monsters**". Người chơi có thể **cố ý kích hoạt** nó để giết quái. Một cái bẫy vừa là mối nguy vừa là vũ khí. Azure Weald jump pad cũng vậy: vừa mất kiểm soát, vừa **phá địa hình + đẩy quái + tăng tốc**.
>
> **Hazard hai mặt là loại đáng làm nhất.** Nó biến "tránh né" thành "sử dụng", và đó là khác biệt giữa một chướng ngại và một cơ chế.

---

## 8. Meta ngoài ván

### 8.1 Tiền tệ đầy đủ

| Loại | Phạm vi | Dùng vào | Nguồn |
|---|---|---|---|
| **Credits** | Meta, tích luỹ | Mua Meta Upgrade; mua/bán khoáng ở **400 mua / 200 bán** | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Resources |
| **6 khoáng**: Bismor, Croppa, Enor Pearl, Jadiz, Magnite, Umanite | Meta, tích luỹ | Mỗi khoáng cấp vốn cho đúng 3 Meta Upgrade | như trên |
| **Gold** | **Chỉ trong ván** | Xem 4.4 | như trên |
| **Nitra** | **Chỉ trong ván** | Xem 4.4 | như trên |
| **Red Sugar** | Trong ván | Hồi máu khi nhặt | như trên |
| **Oil Shale** | Trong ván, chỉ Escort | Nạp Drilldozer | như trên |
| **Biome Points** | Bộ đếm meta | Mở bậc Hazard cho từng biome × từng mission type | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Biomes |
| **Mastery Points** | Bộ đếm meta | Mở Anomaly Dives (5/10/15/20/25/30) | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Masteries |
| **Anomaly Points** | Bộ đếm meta | Thưởng khi hoàn thành Anomaly Dive (100 cho hầu hết, 40 cho No Movement) | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Anomaly_Dives |
| Morkite Reactor Cores | **ĐÃ GỠ** | "have been removed from the game as part of the 1.0 Update" | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Resources |
| "Data Cells" | **KHÔNG TỒN TẠI** trong DRG:S (đó là của DRG gốc) | — | — |

### 8.2 Cây nâng cấp vĩnh viễn — 18 mục, 3 mục / khoáng

`[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Meta_Upgrades

| Khoáng | 3 upgrade |
|---|---|
| **Bismor** | Getting Fit (+Max HP) · Heavy Bullets (+Damage %) · Reload Speed |
| **Croppa** | Upgraded Armor · **Mining 101** (+Mining Speed %) · Trigger Training (+Fire Rate %) |
| **Enor Pearl** | **Pocket Magnets** (+Pickup Radius, 2%→36%) · **Fast Learner** (+XP Gain, 2%→24%) · More Juice (+Potency %) |
| **Jadiz** | **Nitra Cache (+Starting Nitra)** · Target Practice (+Crit Chance) · Mind Blowing (+Crit Damage %) |
| **Magnite** | **Gold Cache (+Starting Gold)** · Catalyst Booster (+Status Effect Damage %) · First Aid Kit (+Life Regen) |
| **Umanite** | Me Lucky Charms (+Luck) · Better Boots (+Move Speed %) · **Artifact Rerolls** |

- Cấp chạy tới **180**. Tổng để max hết: "**1,176,000 Credits, ~1879–2021 of each mineral**".
- Ví dụ đường cong: *Getting Fit* từ "500 Credits" (mức 10) → "16000 Credits + 160 Bismor" (mức 180). *Nitra Cache* từ "500 Credits + 2 Jadiz" → "20000 Credits + 200 Jadiz" ở mức 24.

> **Chú ý ba mục Starting Nitra / Starting Gold / Artifact Rerolls:** meta không chỉ buff chỉ số mà **bơm thẳng tài nguyên vào giây 0 của ván**, rút ngắn đoạn khởi động nhạt. **Đây là mẹo hợp nhất với ván 10 phút** — người chơi lâu năm không phải trả lại 2 phút "đào lấy vốn" mỗi ván.

### 8.3 Mở khoá class — hai đường rank độc lập

`[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Milestones · https://deeprockgalactic.wiki.gg/wiki/Survivor:Class_Mods

| Hạng mục | Nội dung |
|---|---|
| Vai trò Milestone | "Milestones are the primary method to unlock new gameplay... be it new classes or subclasses, weapons and overclocks for them, or game changing artifacts." |
| **Player Rank** → class + mode | R1 Scout · R3 Gunner · R5 Engineer · R7 Driller · R9 Demolisher (thực tế cần DLC) · **R10 Escort Duty** · **R15 Egg Hunt** |
| **Class Rank** → vũ khí | Mốc 3 / 6 / 12 / 15 / 21 / 24 / 27 |
| **Class Rank** → Class Mod | **Rank 9** và **Rank 18** |
| Mở Artifact | Gắn với thành tích trong ván: gom 250 Gold, gây 1.337+ sát thương, đạt cấp 50... |
| Mở Weapon Mastery | Đưa vũ khí lên level 18, và đã hoàn thành dive ở HAZ 3+ |
| Công thức XP rank | **KHÔNG TÌM THẤY** |

**Ba Class Mod mỗi class:**
- Scout: Classic → Recon (9) → Sharp Shooter (18)
- Gunner: Weapons Specialist → Juggernaut (9) → Heavy Gunner (18)
- Engineer: Maintenance Worker → Tinkerer (9) → Demolitionist (18)
- Driller: Foreman → Interrogator (9) → Strong Armed (18)
- Demolisher: Contractor → Gridrunner (9) → Operator (18)

Ví dụ hiệu ứng: Juggernaut "+10 armor, +50 Max HP, **−50% weapon range**, +10% damage sau khi ăn đòn (chồng 5 lần)" · Tinkerer "+10% XP gain, **mọi vũ khí bắt đầu ở level 3**" · Foreman "+2% Mining Speed trong 2 giây mỗi lần đào, chồng tới 25 lần" · Sharp Shooter "+15% Crit Chance, +50% Crit Damage, nổ mảnh khi overkill".

### 8.4 Hệ Gear (mới ở 1.0)

`[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Gear

- "Gear is a new system introduced in 1.0 that adds depth and long-term progression... picking it up adds it to your Gear menu."
- **Rơi chắc chắn** "when a Dreadnought is killed in Elimination missions or after breaking the Ommoran Shell at the end of Escort Duty missions."
- 4 hạng hiếm; công thức: "Stat Increase = StatScaling × GearScaling × (10 + Level)"; trần level **99**; kho tối đa **150** món.

### 8.5 Phần thưởng cuối ván — và chết thì mất gì

`[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Credits

Credits tính từ: tài nguyên đã nhặt + số quái giết ("Credits are awarded for every bug killed. **All enemy types pay the same amount**") + mỗi cấp nhân vật đạt được + thưởng theo hazard và tiến độ tầng, "**including a bonus for successfully completing it**".

**CHẾT VẪN GIỮ TÀI NGUYÊN:**
> "If you die in Deep Rock Galactic: Survivor, you'll fail the current dive. **You'll keep any resources and experience you've earned**, but you'll miss out on completing certain Biome Goals." `[NGUỒN]` https://techraptor.net/gaming/guides/deep-rock-galactic-survivor-guide

> "You keep meta resources and any gear you picked up... **Quitting the dive when it's still in progress means that you won't get anything.**" `[NGUỒN]` https://steamcommunity.com/app/2321470/discussions/0/599667160179399090/

> **Ba quyết định thiết kế nối nhau, rất đáng học:**
> 1. Chết vẫn giữ tài nguyên → thua không bị phạt nặng
> 2. Nhưng **thoát ván giữa chừng thì mất sạch** → không được bỏ ván đang xấu
> 3. Và Credits tính theo lượng **đã nhặt** chứ không phải **còn lại** → tiêu thoải mái
>
> Kết quả: người chơi luôn được khuyến khích **chơi hết ván và tiêu hết tiền**. Đúng ba thứ mình muốn ở một game mobile 10 phút.

---

## 9. Vì sao DRG:S "dễ đọc" trên màn hình nhỏ

Game này đã lên iOS/Android 11/2025, đồng phát triển với Piktiv chuyên UI/UX cảm ứng — phần này có giá trị trực tiếp cho dự án. `[NGUỒN]` https://www.gematsu.com/2025/09/deep-rock-galactic-survivor-coming-to-ios-android-in-november

### 9.1 Bố cục HUD

`[NGUỒN]` https://techraptor.net/gaming/guides/deep-rock-galactic-survivor-guide (bài có ảnh chụp màn hình đánh số) trừ chỗ ghi khác

| Thành phần | Vị trí | Chức năng (trích) |
|---|---|---|
| **Minimap** | **Góc trên TRÁI** | "The minimap shows you the area near your dwarf. **There is no full map.**" |
| **Progress Bar** | **Giữa trên** | "The yellow-orange bar at the top center" — tiến độ tầng, có mốc `[NGUỒN]` https://thenerdstash.com/deep-rock-galactic-survivor-starter-guide/ |
| **Alien Threat Level** | **Góc trên PHẢI** | Vòng tròn hình **đầu lâu**, viền ngoài đầy dần: "this shows how long until the next threat level, as well as the current threat level" `[NGUỒN]` https://steamcommunity.com/app/2321470/discussions/0/591783109130761488/ |
| **Thanh XP + Level** | **Đáy màn hình**, thanh **xanh** | "Level and Experience Bar: This shows the current Level of your dwarf" · "A blue bar at screen bottom fills" `[NGUỒN]` https://thenerdstash.com/deep-rock-galactic-survivor-starter-guide/ |
| **HP** | (không xác định chính xác) | "The standard-issue Health bar. When this reaches 0, you die." |
| **Weapon Bar** | (dưới, cạnh HP) | 4 ô icon. Và: "Any upgrades that will affect one or more of your Weapons will show **two upward-facing arrows** on the Weapon Bar." |
| **Extra Ability** | "**to the left of the Weapons Bar**" | Trạng thái kỹ năng phụ |
| **Gold / Nitra** | (bộ đếm riêng) | "This shows how much Gold you currently have" / "...Nitra..." |

**Vị trí chính xác của HP / XP / Weapon Bar theo góc màn hình: KHÔNG TÌM THẤY** — chỉ minimap (trên-trái), threat (trên-phải), progress bar (giữa-trên) và thanh XP (đáy) là có nguồn.

Minimap ở trên-trái bị một số người chơi phản đối: "I personally find the minimap being on top left to be very distracting... I personally prefer bottom right." `[NGUỒN]` https://steamcommunity.com/app/2321470/discussions/0/6292161380807994881/

**Không có đồng hồ chạy ván** kiểu Vampire Survivors — chỉ có đồng hồ **30 giây** khi Drop Pod hạ.

### 9.2 Nguyên tắc rút ra từ bố cục

> **Mọi thông tin nhịp nhanh đều là THANH hoặc VÒNG, không phải SỐ.**
> Máu = thanh · Cấp = thanh · Tiến độ tầng = thanh có mốc · Sức ép = vòng tròn đầy dần.
> Chỉ **Gold và Nitra** là số — vì đó là thứ người chơi *tiêu ở màn shop*, không phải thứ *đọc lúc đang chạy*.

Và bốn góc màn hình được chia rõ ràng, mỗi góc một loại thông tin:
- **Trên-trái = KHÔNG GIAN** (tôi đang ở đâu)
- **Trên-giữa = THỜI GIAN** (tầng còn bao lâu)
- **Trên-phải = ĐE DOẠ** (sức ép đang tích tới đâu)
- **Đáy = BẢN THÂN** (máu, cấp, vũ khí)

### 9.3 Mã màu quái — kênh thông tin chính, thay cho thanh máu

`[NGUỒN]` toàn bảng: https://deeprockgalactic.wiki.gg/wiki/Survivor:Creatures

| Tín hiệu | Ý nghĩa |
|---|---|
| **Nâu / Xanh / Đỏ nâu** (Grunt) | Bậc máu T1 / T2 / T3 — "The sole difference is that blue and reddish brown grunts have more health" |
| **CAM** | **Sắp nổ** — "Exploders are larger, orange Glyphids" |
| **TÍM** | **Bậc nâng cao** — Mini Elite "are purple in color"; Mini Exploder "purple cousins" |
| **XANH DƯƠNG (to)** | Bản lớn hơn — Big Praetorian "even larger, blue variant" |
| **XANH LÁ** | Biết bay — Mactera |
| **Màu đạn = nguồn bắn** | Acid Spitter "purple acid shots"; Spitball Infector "large green shots" |
| **Màu boss = kiểu đánh** | "the **purple**, melee-focused Lacerator; and the **orange**, range-focused Arbalest" |
| **Kích cỡ = độ trâu** | Praetorian "much more durable"; Dreadnought "towers over all the other enemies" |

**Thanh máu chỉ dành cho Mini Elite trở lên:** Mini Elite "have a **small health bar**"; Twins "Each twin has its own health bar". Quái rác **không có thanh máu** — cộng đồng còn phải mở thread đòi thêm thanh máu cho Exploder `[NGUỒN]` https://steamcommunity.com/app/2321470/discussions/0/6292161380819718694/

> **Công thức đọc-nhanh của DRG:S, viết gọn thành một câu:**
> **Màu (hue) mã hoá LOẠI đe doạ · Kích cỡ mã hoá ĐỘ TRÂU · Tím luôn nghĩa là "bậc cao hơn".**
> Thanh máu chỉ xuất hiện từ Mini Elite trở lên. Đây chính xác là thứ cần cho màn hình 6 inch.

### 9.4 Nghệ thuật và kỹ thuật

- **Low-poly 3D** kiểu DRG gốc, **không dùng pixel art** như phần lớn game cùng thể loại `[NGUỒN]` https://www.gamepressure.com/games/deep-rock-galactic-survivor/z56591
- Góc nhìn: "Play each mission from a **top-down perspective**" `[NGUỒN]` https://store.steampowered.com/app/2321470/ (wiki ghi thể loại là "Isometric Shooter")
- Engine Unity, nâng lên **Unity 6** ở Heavy Duty kèm "VFX system improvements" `[NGUỒN]` https://xpgained.co.uk/patch-notes/deep-rock-galactic-survivor-heavy-duty-patch-notes-30-april-2026
- XP là token hình riêng: "**small blue cubes**" `[NGUỒN]` https://techraptor.net/gaming/guides/deep-rock-galactic-survivor-guide
- **Số sát thương BẬT/TẮT được**: "In the options menu there is an option to '**Show damage numbers**.'" — có cả toggle riêng cho sát thương DOT `[NGUỒN]` https://steamcommunity.com/app/2321470/discussions/0/4336482750667934902/
- Đánh giá tích cực: "The UI is clean and readable, and the top-down perspective and clean art direction ensure that critical information remains legible even during moments of extreme enemy density." `[NGUỒN]` https://www.reportafk.com/deep-rock-galactic-survivor-game-review/

### 9.5 Nhưng đây là chỗ DRG:S THẤT BẠI — phải tránh

Đây là lời chê lặp lại nhiều nhất về phần nhìn của game, và là cảnh báo trực tiếp cho bất kỳ ai làm cùng thể loại.

| Vấn đề | Trích | Nguồn |
|---|---|---|
| Hiệu ứng của chính mình che quái | "In late game **yours visual effects is more intense than monsters effects**. Instead of their attacks and movements all what you see are your blows." | `[NGUỒN]` https://steamcommunity.com/app/2321470/discussions/0/4342103279859098015/ |
| **Càng mạnh càng không đọc được** | "Particle count is good when there are no upgrades on any weapons, but **as the dorf gets stronger the screen gets more and more unreadable**." | như trên |
| **Khác Vampire Survivors ở chỗ chí mạng** | "In vampire survivor if your screen is cluttered that means you're one shoting everything, **here it's not the case and if your screen is cluttered you're dead**." | như trên |
| Hiệu ứng lạnh che tầm nhìn | "The effect of the cold is so intense that **you can't see anything nearby**" (Cryo) | như trên |
| Số sát thương góp phần | "Some of the visual effects, such as **explosions and damage numbers**, can make the screen extremely cluttered in higher difficulties and **cause issues with vision and navigation**." | `[NGUỒN]` https://gameluster.com/deep-rock-galactic-survivor-review-rock-stone-and-bullets/ |
| Cuối ván rối cả hình lẫn tiếng | "late-game screens get cluttered fast with bullets, fire, and explosions, easily obstructing your view of the models"; "**the audio in the late game can get overwhelming**" | `[NGUỒN]` https://game8.co/articles/reviews/deep-rock-galactic-survivor-review |
| Bóng tối làm nặng thêm | Game cố tình dùng bóng tối làm không khí; hai mutator còn cố ý đánh vào tầm nhìn: "Dark Caves — Reduced visibility" và "This is Bat Country — Don't look up." | `[NGUỒN]` https://deeprockgalactic.wiki.gg/wiki/Survivor:Mutators |
| Tuỳ chọn đồ hoạ nghèo | "it only changes resolution and Antialiasing" | `[NGUỒN]` https://steamcommunity.com/app/2321470/discussions/0/4371376043390418442/ |
| Đòi hỏi chưa được đáp | "+1 for **FX transparency slider**, or toggle, or dynamic reduction option, or just anything." | `[NGUỒN]` https://steamcommunity.com/app/2321470/discussions/0/6292161380821211309/ |
| Có người bênh | Một người 40+ giờ nói không gặp vấn đề gì | `[NGUỒN]` https://steamcommunity.com/app/2321470/discussions/0/4342103279859098015/ |

**Không tìm thấy** bất kỳ dev blog hay patch note nào của Funday Games trực tiếp giải quyết vấn đề readability.

> **Nghịch lý cần ghi nhớ:** trong Vampire Survivors, màn hình rối = bạn đang thắng. Trong DRG:S, màn hình rối = **bạn sắp chết**, vì quái ở đây thật sự giết được bạn. **Game của mình thuộc loại thứ hai nếu quái gây sát thương đáng kể.** Nghĩa là trần particle không phải là tuỳ chọn xa xỉ — nó là yêu cầu cân bằng.

### 9.6 Mười điều nên bê nguyên vào game màn hình nhỏ

1. **Mọi thông tin nhịp nhanh là THANH hoặc VÒNG, không phải SỐ.** Số chỉ dành cho tài nguyên đem đi tiêu.
2. **Một Progress Bar có mốc NHÌN THẤY ĐƯỢC.** Người chơi biết trước "còn 1 mốc nữa là swarm" mà không cần đồng hồ, không cần chữ.
3. **Chia bốn góc theo bốn loại thông tin**: không gian (trên-trái) · thời gian (trên-giữa) · đe doạ (trên-phải) · bản thân (đáy).
4. **Mã màu bậc quái**: hue = loại đe doạ, size = độ trâu, **tím = bậc cao hơn**. Không thanh máu cho quái rác.
5. **Cam = sắp nổ.** Một quy ước màu duy nhất cho "đừng đứng gần" là đủ.
6. **Minimap nhỏ, KHÔNG có bản đồ đầy đủ.** Giữ mắt người chơi ở trung tâm màn hình.
7. **Nền tối, nhân vật sáng, tương phản cao** — nhưng đừng tối đến mức phải bật đèn tìm quái.
8. **Số sát thương phải tắt được**, và **mặc định TẮT trên mobile**.
9. **Đặt TRẦN CỨNG cho particle của người chơi ngay từ ngày đầu.** Đây là lỗi lớn nhất của DRG:S và nó không sửa được về sau.
10. **Icon vũ khí thành một hàng cố định 4 ô**, có mũi tên báo khi có nâng cấp ảnh hưởng tới khẩu nào.

---

## 10. Nén 5 tầng thành 1 màn — đề xuất cụ thể

> **Ràng buộc: MỘT màn duy nhất, ~10 PHÚT, chơi trên mobile.**
> Toàn bộ mục này là `[ĐỀ XUẤT]`. Số liệu DRG:S ở trên chỉ là mốc tham chiếu.

### 10.1 Nguyên tắc nén

DRG:S dùng **một khuôn duy nhất lặp 5 lần**: `yên → Supply Drop → Swarm → Elite → chạy thoát 30s → shop`. Nén xuống 10 phút = **giữ nguyên khuôn**, đổi ba thứ: bỏ chuyển cảnh, giảm số lần lặp nghi thức nặng, và **tăng mật độ** (đúng như chính Funday làm với Endless Mode: "The first 10 stages of an Endless Dive are **shorter**, with **increased enemy density**").

| DRG:S (5 tầng × 3–4 phút ≈ 20–30 phút) | Game 1 màn (5 phase × 2 phút = 10 phút) | Lý do |
|---|---|---|
| 5 tầng, 5 bản đồ rời, có load | **5 phase trên 1 bản đồ liền** | Xoá màn load, giữ nhịp |
| Drop Pod + chạy 30s **giữa mỗi tầng** | **Chỉ MỘT lần chạy thoát ở cuối**, 40 giây | 5 lần nghi thức thoát trong 10 phút sẽ thành thủ tục |
| Shop toàn màn hình giữa tầng (5 lần) | **Trạm tiếp tế tại chỗ, 2 lần** | Mỗi lần mở/đóng UI trên mobile tốn ~4 giây thật |
| 1 Supply Drop / tầng (5 lần) | **2 Supply Drop** (phút 2 và 6:30) | Giữ nhịp thưởng ~3–4 phút/lần |
| Vũ khí mở ở cấp nhân vật 5 / 15 / 25 | **Cấp 3 / 7 / 12** | Phải đủ 4 khẩu trước phút 6, nếu không build không kịp thành hình |
| Overclock ở weapon level 6 / 12 / 18 | **Ngưỡng 4 / 8 / 12** | Phải với tới bậc 3 trong 10 phút, nếu không "unstable" thành đồ trang trí |
| Threat Level +1 mỗi 60s khi đánh boss | **+1 mỗi 30 giây** khi boss còn sống | Ván ngắn thì đồng hồ trừng phạt phải gấp đôi |
| XP: "5 cấp ở tầng 1 = 1 cấp ở tầng 5" | Đường cong **thoải hơn nhiều**, ~16 cấp trải đều | 10 phút không đủ chỗ cho lạm phát dốc như vậy |
| Reroll 5, 7, 10, 14, 20, 28... (×1.4) | **Giữ nguyên đường cong ×1.4**, hạ số nền cho vừa lượng vàng 10 phút | ×1.4 là đường cong tốt, không cần phát minh lại |

### 10.2 Năm phase

| Phase | Khung giờ | Vai trò | Nhồi gì |
|---|---|---|---|
| **P1 — Đào** | 0:00–2:00 | Dạy chơi, nạp vốn | Không swarm. XP chủ yếu từ **đào**. Lên 3–4 cấp. Mở khẩu 2. 1 Lootbug. |
| **P2 — Nhịp đầu** | 2:00–4:00 | Chốt hướng build | Supply Drop #1 (artifact). Swarm #1. **Mini-boss #1**. Mở khẩu 3. Trạm tiếp tế #1. |
| **P3 — Nhiệm vụ phụ** | 4:00–6:00 | Đổi việc, phá nhịp bắn | **Nhiệm vụ phụ có hẹn giờ 60s**. Hazard môi trường bật lên. Swarm #2. Mở khẩu 4. |
| **P4 — Sức ép** | 6:00–8:00 | Đỉnh trước boss | Supply Drop #2. **Swarm #3 + #4 chồng nhau, hai hướng**. **Mini-boss #2 (3 Elite)**. Trạm tiếp tế #2 — lần cuối được mua. |
| **P5 — Boss + Thoát** | 8:00–10:00 | Cao trào | Boss 8:10–9:20 (2 pha). 9:20 boss chết → **chạy thoát 40 giây**. |

### 10.3 BẢNG TIMELINE THEO PHÚT (0:00 → 10:00)

**Áp lực** = mật độ đe doạ tương đối, thang 1–10 · **Cấp** = cấp nhân vật kỳ vọng

| Phút | Phase | Sự kiện chính | Quái spawn | Áp lực | Cấp | Nguồn thu chính | HUD nhấn gì |
|---|---|---|---|---|---|---|---|
| **0:00–0:30** | P1 | Vào màn. Quặng ở ngay quanh người chơi. | Vài Grunt lẻ | **1** | 1 | Đào | Thanh XP đáy màn nhích |
| **0:30–1:00** | P1 | Lên cấp 2–3 → **mở ô vũ khí 2** ở cấp 3 | Grunt lác đác | **2** | 2–3 | Đào | Ô vũ khí 2 sáng lên |
| **1:00–1:30** | P1 | **Lootbug** chạy ngang (nổ ra tiền, mini-game săn) | Grunt + 1 Fast Grunt | **2** | 3 | Lootbug + đào | Bộ đếm Gold/Nitra nhảy |
| **1:30–2:00** | P1→P2 | **Báo Supply Drop**: vòng tròn hiện trên minimap, phải đào sạch | Grunt tăng nhẹ | **3** | 4 | Đào | Vòng tròn + overlay cuốc trên nền |
| **2:00–2:30** | P2 | **SUPPLY DROP #1** hạ → chọn **1 trong 3 Artifact**. Va chạm pod giết quái quanh đó. | Ngưng spawn ~5s | **2** ↓ | 4 | Artifact | Thẻ artifact, tối đa 5 giây |
| **2:30–3:00** | P2 | **SWARM #1** — banner "Bầy đang tới" + tiếng | ~25 Grunt + 3 Exploder | **5** | 5 | Giết quái | Viền màn hình nhấp đỏ **một lần** |
| **3:00–3:30** | P2 | Dọn swarm. **Mở ô vũ khí 3** (cấp 7) | Đuôi swarm | **4** | 6–7 | XP quái | Ô vũ khí 3 sáng |
| **3:30–4:00** | P2 | **MINI-BOSS #1** — 1 Elite kiểu Praetorian: chậm, dày, **tự phá tường** | Elite + Grunt nền | **6** | 7 | XP lớn + rơi tiền | Thanh máu boss ở đỉnh |
| **4:00–4:20** | P2→P3 | **TRẠM TIẾP TẾ #1** — kiosk tại chỗ, không đổi cảnh | Ngưng spawn 10s | **1** ↓ | 8 | Tiêu tiền | Bảng shop nhỏ, 4 món |
| **4:20–5:00** | P3 | **HAZARD MÔI TRƯỜNG BẬT**: vệt dung nham / dây leo mọc lại xuất hiện | Grunt tier 2 (xanh) | **4** | 8 | Đào | Nháy đỏ ở rìa vùng hazard |
| **5:00–5:30** | P3 | **NHIỆM VỤ PHỤ**: "Gom 6 mẫu khoáng trong 60 giây", mẫu rải ở rìa bản đồ | Acid Spitter xuất hiện (ép tiến lên) | **5** | 9 | Thưởng lớn nếu xong | Đồng hồ 60s + 6 chấm tiến độ |
| **5:30–6:00** | P3 | Hết giờ → thưởng Loot Crate. **SWARM #2** | ~35 quái, có **Mini Elite tím** | **6** | 10 | Giết quái | Banner swarm lần 2 |
| **6:00–6:30** | P3→P4 | **Mở ô vũ khí 4** (cấp 12). Khẩu chủ lực chạm **Overclock bậc 2** | Mactera (bay xuyên tường) | **6** | 11–12 | XP quái | Thẻ Overclock, 2 lựa chọn |
| **6:30–7:00** | P4 | **SUPPLY DROP #2** — artifact mạnh hơn, vùng phải đào rộng gấp đôi | Quái vây quanh vùng drop | **7** | 12 | Artifact | Vòng tròn to hơn + đếm ngược hạ |
| **7:00–7:40** | P4 | **SWARM #3 + #4 CHỒNG NHAU**, ập từ **hai hướng đối nhau** | ~50 quái, nhiều Exploder | **8** | 13 | Giết quái | Hai mũi tên cảnh báo ở hai rìa |
| **7:40–8:00** | P4 | **MINI-BOSS #2**: 3 Elite cùng lúc — 1 cận chiến, 1 bắn xa, 1 **buff đồng bọn** | 3 Elite + quái nền | **9** | 14 | XP + tiền | 3 thanh máu nhỏ xếp dọc |
| **8:00–8:10** | P4→P5 | **TRẠM TIẾP TẾ #2** — lần cuối. Ghi rõ "KHÔNG CÒN CƠ HỘI MUA NỮA" | Ngưng spawn 10s | **1** ↓ | 14 | Tiêu sạch tiền | Shop có dấu "CUỐI CÙNG" |
| **8:10–8:45** | P5 | **BOSS — PHA 1**: đòn nhảy tầm xa có telegraph. **Đồng hồ Threat +1 mỗi 30s** bắt đầu chạy | Boss + Grunt nền chậm | **8** | 15 | — | Thanh máu boss to + vòng đầu lâu góc phải |
| **8:45–9:20** | P5 | **BOSS — PHA 2** (dưới 50% máu): thêm đòn **cột đá vây người chơi — phải ĐÀO để thoát** + boss gọi bầy | Boss + swarm nhỏ liên tục | **10** | 15–16 | — | Thanh máu chuyển đỏ, cảnh báo cột đá |
| **9:20–9:25** | P5 | Boss chết, rơi phần thưởng. **Tàu thoát hạ ở rìa bản đồ, cách 1 màn hình** | Ngưng, rồi spawn lại | **2** ↓ | 16 | Loot | Đồng hồ **0:40** nhấp nháy + mũi tên chỉ tàu |
| **9:25–10:00** | P5 | **CHẠY THOÁT 40 GIÂY.** Quái spawn liên tục sau lưng nhưng **KHÔNG rơi XP** (chống nấn ná). Đường về có 1 đoạn đá phải tự đào. Đứng lên ramp tàu = bất tử. | Spawn vô hạn phía sau | **7** | 16 | — | Chỉ còn: đồng hồ + mũi tên + thanh máu |
| **10:00** | — | Lên tàu = **THẮNG**. Trượt = **THUA** (nhưng vẫn giữ tài nguyên đã nhặt). | — | — | — | Bảng kết quả | — |

### 10.4 Đường cong độ khó

```
10 |                                                        ##
 9 |                                                  ##    ##
 8 |                                            ####  ##    ##
 7 |                                       #####            ######
 6 |                    ####      ##  #####
 5 |              ####        ####
 4 |        ##          ####
 3 |    ##
 2 |  ##    ..                                    ..    ..
 1 | ##                                          ..
   +-------------------------------------------------------------
     0    1    2    3    4    5    6    7    8    9   10  (phút)
     |--P1---|---P2----|---P3----|---P4----|-----P5-----|
              ^         ^                ^          ^
              hố 2:00   hố 4:00          hố 8:00    hố 9:20
```

**Ba điều phải nhìn ra ở đường cong này:**

1. **Bốn "hố" áp lực rơi xuống 1–2**, ở phút **2:00** (Supply Drop), **4:00** và **8:00** (Trạm tiếp tế), **9:20** (boss vừa chết). **Bắt buộc phải có.** Một ván 10 phút không có chỗ thở thì trên mobile là mệt — đúng như lo ngại của chủ dự án. Bốn hố này chính là câu trả lời.
2. **Đường cong KHÔNG đơn điệu tăng.** Nó lên–xuống–lên. Cảm giác "vừa thoát nạn" quan trọng hơn con số áp lực tuyệt đối. DRG:S đạt được điều này miễn phí nhờ chuyển tầng; game 1 màn phải **cố ý dựng** các hố đó.
3. **Đỉnh thật ở 8:45–9:20** (boss pha 2). Đoạn chạy thoát cuối **hạ xuống 2 rồi lên lại 7 — KHÔNG được là đỉnh áp lực.** Nó là đỉnh **CĂNG THẲNG** (đồng hồ), khác với đỉnh áp lực (mật độ quái). Nhầm hai thứ này là cách chắc chắn nhất để làm hỏng đoạn kết.

### 10.5 Ngân sách sự kiện trong 10 phút

| Loại sự kiện | Số lần | Vào phút |
|---|---|---|
| Swarm | **4** (1 nhỏ, 1 vừa, 2 chồng nhau) | 2:30 · 5:30 · 7:00 · 7:20 |
| Supply Drop (artifact) | **2** | 2:00 · 6:30 |
| Trạm tiếp tế (shop) | **2** | 4:00 · 8:00 |
| Mini-boss | **2** | 3:30 · 7:40 |
| Boss cuối | **1** (2 pha) | 8:10–9:20 |
| Nhiệm vụ phụ có hẹn giờ | **1** | 5:00–6:00 |
| Chạy thoát | **1** | 9:20–10:00 |
| Mở ô vũ khí | **3** | ~0:45 · ~3:00 · ~6:00 |
| Mốc Overclock | **3** (bậc 4 / 8 / 12 của khẩu chủ lực) | ~2:30 · ~6:00 · ~8:30 |
| Quái hiền (Lootbug/Hoarder) | **2–3** | rải rác |
| **Tổng "khoảnh khắc"** | **~21** | ≈ **1 sự kiện mỗi 29 giây** |

> Mật độ ~1 sự kiện / 30 giây là con số đáng nhắm cho mobile: đủ dày để không chán trong 10 phút, đủ thưa để mỗi sự kiện còn được nhớ. `[ĐỀ XUẤT]`

### 10.6 Sáu thứ nên BỎ khi chỉ có 1 màn

1. **Drop Pod 30 giây giữa mỗi tầng** → chỉ giữ 1 lần ở cuối, 40 giây. Lặp 5 lần trong 10 phút thành thủ tục nhàm.
2. **Shop toàn màn hình** → thành kiosk tại chỗ. Mobile mất ~4 giây thật cho mỗi lần mở/đóng UI.
3. **Đường cong XP dốc dần** ("5 cấp tầng 1 = 1 cấp tầng 5") → cần đường cong thoải, ~16 cấp trải đều.
4. **Không giới hạn particle** → lỗi bị chê nhất của DRG:S, và **không sửa được về sau**. Đặt trần cứng từ ngày đầu.
5. **Hệ 6 loại khoáng meta** → quá nặng cho một game 1 màn. Một loại tiền meta là đủ.
6. **Bóng tối làm không khí** → DRG:S dùng hang tối để tạo mood và phải trả giá bằng readability. Trên màn 6 inch, đừng đánh đổi này.

### 10.7 Bảy thứ nên BÊ NGUYÊN SI

1. **Progress Bar có mốc nhìn thấy được.** Rẻ, dạy chơi không cần chữ, cho người chơi tự chọn nhịp.
2. **Thanh tiến độ chạy theo thời gian CỘNG số quái giết.** Người chơi đánh hăng thì màn đi nhanh — người chơi cẩn thận thì có thêm thời gian đào. Cùng một màn, hai cách chơi.
3. **Đào ra XP song song với giết ra XP.** Đây là thứ khiến 2 phút đầu không nhạt.
4. **Ngưỡng Mining Speed ~+20% mới "đào để chạy" được.** Biến tốc độ đào thành một trục build thật.
5. **Luật auto-aim khác nhau cho từng vũ khí, in thẳng trên thẻ.** "Bắn địch gần nhất" / "bắn địch máu cao nhất" / "bắn theo hướng đang chạy" — đây là thứ biến game "chỉ có di chuyển" thành game có chiều sâu vị trí.
6. **Overclock theo ngưỡng đầu tư (mốc 4/8/12).** Buộc chọn sớm "dồn khẩu nào", và OC được phép **đổi hệ sát thương và đổi hướng bắn** chứ không chỉ tăng số.
7. **Ba counter-play cho chiến thuật đào**: một loại quái **phá được tường**, một loại **bay xuyên tường**, và một loại hazard **mọc lại**. Nếu thiếu, chiến thuật đào sẽ thắng tuyệt đối và làm hỏng cả màn.

### 10.8 Ba mẹo nhỏ nhưng đắt giá của DRG:S nên nhớ

1. **Đứng trên ramp tàu thoát là bất tử.** Cho người chơi một đích đến tuyệt đối, không phải một cuộc rượt vô vọng.
2. **Credits tính theo lượng ĐÃ NHẶT, không phải lượng CÒN LẠI.** Xoá sạch tật "để dành phòng khi". Người chơi tiêu thoải mái, không tiếc.
3. **Chết vẫn giữ tài nguyên, nhưng thoát giữa chừng thì mất sạch.** Thua không bị phạt nặng, nhưng không được bỏ ván đang xấu. Đúng ba thứ cần cho một game mobile 10 phút.

---

## Phụ lục A — Bảng tra nhanh

| Số liệu | Giá trị | Nguồn |
|---|---|---|
| Số tầng / ván (Elimination) | 5 | https://deeprockgalactic.wiki.gg/wiki/Survivor:Elimination |
| Escort Duty / Egg Hunt | 3 tầng | .../Survivor:Escort_Duty · .../Survivor:Egg_Hunt |
| Biome Mastery | 10 tầng | .../Survivor:Masteries |
| Độ dài ván | ~20–30 phút | game8 / completexbox / grindnstrat |
| Độ dài tầng | ~3 phút tới Elite (đo cộng đồng; **không có số chính thức**) | steamcommunity 4342103279858852502 |
| Chạy thoát Drop Pod | **30 giây** | https://techraptor.net/gaming/guides/deep-rock-galactic-survivor-guide |
| Số swarm mỗi tầng | S1=1, S2=2, S3=3, S4=3 | .../Survivor:Elimination |
| Tầng 5 | 4 Elite (trong kén) → Dreadnought | như trên |
| Xác suất boss | 50% Glyphid Dreadnought / 50% Twins | như trên |
| Alien Threat Level | **+1 mỗi 60 giây** khi đánh boss; UI = vòng đầu lâu góc trên-phải | .../Survivor:Difficulty · steamcommunity 591783109130761488 |
| Sát thương Supply Pod (Haz 1→5) | Elite 100/90/80/65/50% · Boss 33/30/27/24/20% | steamcommunity announcements 1795917897322495 |
| Thẻ mỗi lần lên cấp | **3** | steamcommunity 6292161380820475318 |
| Cộng dồn buff | **CỘNG, không nhân** | .../Survivor:Mid-dive_Upgrades |
| Giá reroll (Gold) | 5, 7, 10, 14, 20, 28, 39, 55, 77, 108... (≈×1.4) | như trên |
| Giá thẻ shop | Weapon 14/18/24/38 Nitra · Tag 29/35/48/77 Gold · Stat 23/29/40/63 Gold | như trên |
| Hồi máu | **30 Gold = 50% HP** | như trên |
| Banish / Lock | **KHÔNG CÓ** | steamcommunity 6292161380807549049 |
| Ô vũ khí | **4**, mở ở cấp nhân vật **5 / 15 / 25**, mỗi lần chọn 1 trong 3 | .../Survivor:Equipment |
| Overclock | Weapon Level **6, 12** (Balanced), **18** (Unstable); chọn 1 trong 2; **KHÔNG có Clean** | .../Survivor:Overclocks |
| Weapon Level trần | **KHÔNG CÓ** (18 chỉ là mốc OC cuối) | steamcommunity 4289188745218440022 |
| Weapon Mastery thưởng | +12% một stat, hoặc +7%/+7% | .../Survivor:Masteries |
| Artifact mỗi Supply Pod | **1 trong 3** | .../Survivor:Artifacts |
| Nhiệm vụ phụ | Mở sau **100 Gold** tích luỹ; 6 Apoca Bloom / 12 Boolo Cap / 20 Morkite; **không có ở tầng cuối** | .../Survivor:Objectives |
| Đào | **Tự động khi đứng gần**, không có nút | thenerdstash starter guide |
| Mining Speed hữu dụng | **+20~25%** mới kite qua đá thường được | steamcommunity 4342103705852468095 |
| Driller Mining Speed nền | +20%; Foreman +2%/lần đào, chồng ×25 | .../Survivor:Driller |
| XP | Khối lập phương xanh nhỏ, **phải chạy qua**; nam châm hút cả bản đồ | techraptor guide · steamcommunity 3882723820580279774 |
| Hazard | Haz 1–5; **hệ số nhân KHÔNG TÌM THẤY** | .../Survivor:Difficulty |
| Buff quái theo biome | Crystalline +0% · Magma +5% · Hollow Bough +10% · Salt Pits +15% · Azure Weald & Glacial `?` | .../Survivor:Biomes |
| Meta upgrade | 18 mục, 3/khoáng, 6 khoáng, cấp tới 180, tổng **1.176.000 Credits** | .../Survivor:Meta_Upgrades |
| Giá khoáng | 400 Credits mua / 200 bán | .../Survivor:Resources |
| Mở class (Player Rank) | Scout 1 · Gunner 3 · Engineer 5 · Driller 7 · Demolisher 9 (DLC) · Escort Duty 10 · Egg Hunt 15 | .../Survivor:Milestones |
| Class Mod | Rank 9 và Rank 18 | .../Survivor:Class_Mods |
| Máu nền class | Scout 120 · Engineer 130 · Driller 145 · Gunner 160 · Demolisher 175 | các trang class |
| Chết giữa ván | **Giữ tài nguyên**; nhưng **thoát ván thì mất sạch** | techraptor guide · steamcommunity 599667160179399090 |
| Gear | Rơi chắc chắn khi giết Dreadnought; 4 hạng; trần level 99; kho 150 | .../Survivor:Gear |
| Số sát thương | **Tắt được** trong options | steamcommunity 4336482750667934902 |
| Minimap | **Góc trên-trái**, không có bản đồ đầy đủ | techraptor guide |

## Phụ lục B — Những thứ KHÔNG tra được (không bịa)

| Câu hỏi | Tình trạng |
|---|---|
| Hệ số nhân HP/DMG cụ thể của Hazard 1–5 | **Không ai công bố.** Trang wiki là stub; người chơi đã hỏi dev, không được trả lời. |
| Buff quái của Azure Weald và Glacial Strata | Wiki in nguyên `[?]%` và `?%` |
| Mức trần Alien Threat Level | Không có cap công bố (milestone nhắc tới mức 20 và 25+) |
| Số giây / % thanh chính xác của từng mốc Progress Bar | Không wiki, không dev, không datamine |
| Thời gian cảnh báo trước swarm (giây) | Không có số cho Survivor. (DRG gốc ~20s, **không được coi là số của Survivor**.) |
| Bảng số Elite theo Hazard × mission type | "The amount of Elites depends on Hazard level and Mission type" — bảng không công bố |
| Ngưỡng giây để nhận Loot Crate Legendary/Epic/Rare | Không công bố |
| Vị trí chính xác của HP / Weapon Bar theo góc màn hình | Chỉ minimap, threat, progress bar và thanh XP là có nguồn |
| Vị trí thanh máu boss trên màn hình | Không tìm thấy |
| Màu viền overclock trong Survivor (khác DRG gốc) | Wiki chỉ đưa tên file icon |
| Tên quái hệ băng riêng của Glacial Strata | Chỉ có mô tả chung "cryo-infused enemies" |
| Công thức XP của Player Rank / Class Rank | Không tìm thấy |
| Số cocoon ở tầng 5: 3 hay 4 | Hai trang wiki ghi **4**, trang `Survivor:Glyphid_Dreadnought` ghi **3**. Bốn có nhiều nguồn hơn. |
| Nội dung nguyên văn patch note 1.0 và Heavy Duty | Steam news và SteamDB trả 403 / trang rỗng với mọi cách fetch. Nội dung Heavy Duty ở đây lấy qua bản chép của XP Gained. |
