# Nghiên cứu "Sephira" và baseline thể loại survivor-like

> Phạm vi: (A) xác định game "Sephira" mà user nhắc tới cùng survivor.io / Soul Knight / Enter the Gungeon; (B) baseline số liệu từ Archero, Vampire Survivors, gacha Genshin Impact, và thiết kế kỹ năng chủ động kiểu "tích lực rồi ngắm bắn" (charge-then-directional-cast).
>
> Quy ước: mỗi số liệu có link nguồn inline. Suy luận không có nguồn trực tiếp gắn nhãn `[SUY ĐOÁN]`.

---

## Phần A — "Sephira" là game nào?

### Kết luận (độ tin cậy: TRUNG BÌNH-THẤP)

Không tìm thấy game nào tên chính xác là **"Sephira"**. Ứng viên khớp gần nhất về tên và về thể loại là **Sephiria** (chữ "-ia" ở cuối), studio **TEAM HORAY** (Hàn Quốc, cùng nhóm làm *Dungreed*) — action-roguelite nhìn từ trên xuống, phát hành trên Steam (PC/Mac), Early Access từ 3/4/2025, bản 1.0 ra ngày 31/7/2026. [Steam](https://store.steampowered.com/app/2436940/Sephiria/) · [itch.io demo](https://team-horay.itch.io/sephiria)

**Vì sao khớp:**
- Cùng nhóm thể loại top-down pixel-art action-roguelite, chiến đấu cận/viễn chiến theo thời gian thực, né đòn, weapon-based combat — rất gần về "cảm giác chơi" với Soul Knight và Enter the Gungeon (studio này công khai nhận cảm hứng dungeon-crawler roguelite). [namu.wiki](https://en.namu.wiki/w/%EC%84%B8%ED%94%BC%EB%A6%AC%EC%95%84)
- Co-op online tối đa 4 người, giống mô hình phòng chờ nhiều game bullet-hell.

**Vì sao KHÔNG chắc chắn / cảnh báo quan trọng:**
1. **Nền tảng: chỉ có PC (Steam), KHÔNG có bản mobile.** TapTap có trang tracking game này nhưng đó là trang theo dõi tin tức, không phải bản phát hành iOS/Android chính thức — NameWiki và trang chủ TEAM HORAY xác nhận "no console or mobile version exists, none announced". [gameprimer.com](https://gameprimer.com/sephiria/platforms/) · [namu.wiki](https://en.namu.wiki/w/%EC%84%B8%ED%94%BC%EB%A6%AC%EC%95%84)
2. **Monetization: trả phí một lần (~$14.99 trên Steam), KHÔNG có gacha/banner.** Điều này mâu thuẫn trực tiếp với yêu cầu nghiên cứu "gacha banners" ở Phần A — hệ thống đó **không tồn tại** trong game này.
3. Rất nhiều "wiki" xuất hiện trong kết quả tìm kiếm (`sephiria.net`, `sephiria.world`, `sephiria.pro`, `sephiria-guide.com`, `sephiria.tools`, `sephiriawiki.wiki`, `sephiriawiki.vercel.app`, `ssephiria.wiki`, `sephiria-wiki.online`, `sephiria-game.org`, `commonsensegamer.com`, `allthings.how`...) có pattern domain gần như giống hệt nhau cho một game indie ngách mới ra mắt — dấu hiệu đặc trưng của **SEO content-farm / nội dung AI-generated hàng loạt**, không phải wiki cộng đồng thật. Số liệu cực chi tiết (VD: "139 đường nâng cấp vũ khí", "300 artifact / 70 tablet") chỉ xuất hiện trên các site này, **không kiểm chứng chéo được với nguồn chính thức (Steam/itch.io/namu.wiki)** nên bị loại khỏi báo cáo hoặc gắn nhãn thấp độ tin cậy.

**Do đó:** nếu ý định của user là một game **mobile có hệ thống gacha kiểu Genshin** để làm chuẩn tham chiếu, Sephiria (Team Horay) **không phải nguồn phù hợp cho phần gacha/currency** — nó chỉ phù hợp làm tham chiếu **combat feel / weapon variety / active-skill** (cùng nhóm với Soul Knight, ETG). Phần dưới đây chỉ liệt kê các hệ thống **xác nhận được từ nguồn chính thức hoặc gần-chính-thức** (Steam description, itch.io, Steam Community Guide do người chơi viết, namu.wiki); các con số chi tiết hơn từ site farm được đánh dấu rõ.

### Hệ thống xác nhận được (Sephiria, Team Horay)

| Hệ thống | Nội dung | Nguồn |
|---|---|---|
| Cấu trúc | 6 chương (chapters), tháp trèo dần độ khó, roguelite mỗi lần chơi lại từ đầu | [TapTap listing](https://www.taptap.io/app/33638654) *(chưa kiểm chứng chéo được với Steam)* |
| Vũ khí | 6 loại vũ khí chính: Sword & Shield, Greatsword, Dagger, Crossbow, Katana, Quarterstaff — mỗi loại có "special action" riêng (VD Dagger: Parry → Fury; Greatsword: Charged Whirlwind; Sword & Shield: Guard → Cleave) | [WebSearch tổng hợp nhiều site] `[SUY ĐOÁN mức độ chi tiết]` |
| Vật phẩm build | Artifact (hiệu ứng khi nhặt) + Tablet (khuếch đại Artifact liền kề) — hệ thống sắp xếp túi đồ kiểu puzzle/inventory-Tetris | [itch.io](https://team-horay.itch.io/sephiria) |
| Tiền tệ trong lượt chơi | **Leaf** — dùng mua đồ trong dungeon, có node "Seed Money" cho khởi đầu 200 Leaf | [Steam Community Guide #3474238982](https://steamcommunity.com/sharedfiles/filedetails/?id=3474238982) |
| Tiền tệ meta | **Sapphire** — nhận khi chết (tỉ lệ theo độ sâu + số boss hạ được), dùng cho cây **Destiny Inscription** (mở khóa vĩnh viễn: vũ khí, artifact, điểm Talent, mở rộng túi đồ) | [Steam Community Guide #3474238982](https://steamcommunity.com/sharedfiles/filedetails/?id=3474238982) |
| Talent | 25 điểm Talent (lấy qua Destiny Inscription), respec miễn phí ngoài dungeon (dùng "gương") | [Steam Community Guide #3474238982](https://steamcommunity.com/sharedfiles/filedetails/?id=3474238982) |
| Gacha/banner | **KHÔNG có** — game bán đứt, không IAP gacha | Suy luận từ mô hình Steam premium |
| Nội dung khác | 60+ quái, 10+ boss, co-op online 4 người | [Steam](https://store.steampowered.com/app/2436940/Sephiria/) |

**Khuyến nghị:** xác nhận lại với user xem có đúng ý "Sephira" = Sephiria (Team Horay) hay không trước khi dùng làm tham chiếu thiết kế — vì thiếu khớp ở đúng 2 điểm user cần nhất (mobile, gacha).

---

## Phần B — Baseline thể loại survivor-like

### 1. Archero (Habby)

| Hệ thống | Số liệu | Nguồn |
|---|---|---|
| Năng lượng (bản gốc) | Tối đa 20, mỗi màn tốn **5 energy**, hồi **1 energy / 12 phút** (~4h hồi đầy) | [Game Developer — Finding the Fun pt.3](https://www.gamedeveloper.com/design/finding-the-fun-archero-part-3---monetization) |
| Năng lượng — thưởng | +5 energy khi hoàn thành mỗi 5–10 màn mới; xem quảng cáo hồi thêm 5 energy, tối đa 4 lần/ngày | [Game Developer](https://www.gamedeveloper.com/design/finding-the-fun-archero-part-3---monetization) |
| Mua năng lượng | 20 energy = 100 gems (~$1.25) | [Game Developer](https://www.gamedeveloper.com/design/finding-the-fun-archero-part-3---monetization) |
| Hồi sinh | 30 gems cho lần chết đầu tiên trong màn | [Game Developer](https://www.gamedeveloper.com/design/finding-the-fun-archero-part-3---monetization) |
| Rương thưởng | Golden Chest 60 gems (~$0.75): 80% Common / 20% Great. Obsidian Chest 300 gems (~$3.75): ~49% Great / 43% Rare / 7% Epic, có pity đảm bảo Epic sau 10 lần không ra Epic (tỉ lệ hiệu dụng ~13%) | [Game Developer](https://www.gamedeveloper.com/design/finding-the-fun-archero-part-3---monetization) · [LevelSkip](https://levelskip.com/mobile/Archero-Chest-Drop-Rates-Farming-Guide) |
| Equipment (bản gốc) | Chỉ 4 vũ khí, 4 giáp, 4 nhẫn, 4 spirit (16 món), 4 bậc hiếm: Common/Great/Rare/Epic | [Game Developer](https://www.gamedeveloper.com/design/finding-the-fun-archero-part-3---monetization) |
| Equipment (Archero 2) | 8 bậc hiếm: Common → Great → Rare → Epic → Perfect Epic → Legendary → Ancient Legendary → Mythic | [AllClash tier list](https://www.allclash.com/archero-equipment-tier-list-best-armor-ring-combination-locket-bracelet-spell-book/) |
| Fusion (Archero 2) | Ghép **3 món cùng loại** để lên bậc, đến Legendary; **Legendary → Ancient Legendary chỉ cần 2 món cùng loại**; Ancient→Mythic cũng cần 2 món giống | [WebSearch tổng hợp AllClash/mobi.gg] `[chưa kiểm chứng gốc]` |
| Gacha rương Archero 2 | Chromatic/Mythstone Chest: **2.18% Epic** (không tính pity); Obsidian Chest: **4% Epic** | [WebSearch — archero-2.game-vault.net Pull Rates] `[chưa fetch trực tiếp được, độ tin cậy trung bình]` |
| Draft chọn kỹ năng | Sau khi lên cấp / đầu màn: **chọn 1 trong 3** power-up ngẫu nhiên (không phải "pick 3" mà là pick-1-of-3) | [AndroidAuthority](https://www.androidauthority.com/archero-guide-heroes-abilities-1086651/) |

Ghi chú: nguồn "Pull Rates" của archero-2.game-vault.net không fetch trực tiếp được (bị chặn), số liệu 2.18%/4% chỉ lấy được qua snippet tìm kiếm — dùng thận trọng.

### 2. Vampire Survivors

| Hệ thống | Số liệu | Nguồn |
|---|---|---|
| Thời lượng 1 run | Chuẩn **30 phút**/màn (Red Death — kẻ thù cuối — xuất hiện ở phút 30) | [Vampire Survivors Wiki — Stages](https://vampire-survivors.fandom.com/wiki/Stages) |
| Draft khi lên cấp | Dừng game, hiện **3 lựa chọn** (vũ khí/passive); có thể lên **4 lựa chọn** tùy chỉ số Luck | [Vampire Survivors Wiki — Level up](https://vampire-survivors.fandom.com/wiki/Level_up) |
| Quy tắc evolution | Vũ khí gốc lên **max level (thường Lv8)** + trang bị **passive item tương ứng** (thường bất kỳ level nào, một số ngoại lệ như Globus cần Empty Tome Lv5) + nhặt rương do boss rớt sau mốc 10 phút | [Steam Guide — Evolution Cheat Sheet](https://steamcommunity.com/sharedfiles/filedetails/?id=2763945512) · [egamersworld](https://egamersworld.com/blog/what-to-pair-vampire-survivors-evolution-guide-NV539Y8B_F) |
| Ví dụ cặp evolution | Whip+Hollow Heart=Bloody Tear; Magic Wand+Empty Tome=Holy Wand; Knife+Bracer=Thousand Edge; Axe+Candelabrador=Death Spiral; Cross+Clover=Heaven Sword; King Bible+Spellbinder=Unholy Vespers; Fire Wand+Spinach=Hellfire; Garlic+Pummarola=Soul Eater | [Vampire Survivors Wiki — Evolution](https://vampire-survivors.fandom.com/wiki/Evolution) |
| Union evolution đặc biệt | Peachone + Ebony Wings: **cả hai phải max level, không cần passive item**, ghép thành Vandalier | [Vampire Survivors Wiki — Evolution](https://vampire-survivors.fandom.com/wiki/Evolution) |
| Đặc biệt khác | Spirit Rings cần **5 passive weapon đều max level** mới evolve | [androidpolice](https://www.androidpolice.com/vampire-survivors-weapon-evolution-guide/) |

### 3. Genshin Impact — cấu trúc gacha (chuẩn tham chiếu "banner giống Genshin")

**Tỉ lệ cơ bản (base rate), áp dụng mọi banner):**

| Bậc | Tỉ lệ cơ bản |
|---|---|
| 5★ | **0.6%** |
| 4★ | **5.1%** |
| 3★ | 94.3% |

Nguồn: [ScreenRant — Pull Rates Explained](https://screenrant.com/genshin-impact-wish-characters-weapons-banner-pull-rates/) · [Game8 — Pull Rates & IAP](https://game8.co/games/Genshin-Impact/archives/297443)

**Character Event Wish (banner nhân vật giới hạn):**

| Cơ chế | Số liệu | Nguồn |
|---|---|---|
| Soft pity | Bắt đầu tăng mạnh tỉ lệ 5★ từ khoảng **pull 74** (khoảng 60–80 tùy nguồn) | [Game8 — Pity System](https://game8.co/games/Genshin-Impact/archives/305937) |
| Hard pity | **90 pull** = chắc chắn có 5★ | [Game8](https://game8.co/games/Genshin-Impact/archives/305937) |
| 4★ pity | Đảm bảo ≥1 vật phẩm 4★ trong mỗi **10 pull** | [Game8](https://game8.co/games/Genshin-Impact/archives/305937) |
| 50/50 | Khi ra 5★, **50%** là nhân vật rate-up (featured), 50% rơi vào nhân vật 5★ pool thường (standard) | [Fandom Q&A tổng hợp](https://genshin-impact.fandom.com/f/p/4400000000000289566/r/4400000000001044047) |
| Guarantee (bảo hiểm thua 50/50) | Thua 50/50 → **lần 5★ tiếp theo chắc chắn là nhân vật rate-up**; pity/guarantee **cộng dồn qua các bản cập nhật** nếu chưa dùng | [BitTopup — Pity Guide](https://news.bittopup.com/news/genshin-impact-pity-system-guide-90-pull-guarantee-50-50) |
| Capturing Radiance (từ bản 5.0) | Khi thua 50/50 (ra 5★ standard thay vì rate-up), có cơ hội "cứu" thành nhân vật rate-up: **~33.3% nếu vừa thua 1 lần liên tiếp trước đó, ~66.7% nếu thua 2 lần liên tiếp, 100% nếu thua 3 lần liên tiếp** — cơ chế đảm bảo không thể thua 50/50 quá 3–4 lần liên tục; không ảnh hưởng pity đếm số pull | [BitTopup — Capturing Radiance 22.5%](https://news.bittopup.com/news/capturing-radiance-50-50-22.5-double-loss-explained) · [Game8 — Capturing Radiance](https://game8.co/games/Genshin-Impact/archives/468191) `[hai nguồn hơi lệch số %, xem là ước lượng]` |

**Weapon Event Wish (Epitomized Path):**

| Cơ chế | Số liệu | Nguồn |
|---|---|---|
| Hard pity | **80 pull** | [Game8 — Pity System](https://game8.co/games/Genshin-Impact/archives/305937) |
| Fate Point | Mỗi lần ra vũ khí 5★ **không phải vũ khí đã chọn** → +1 Fate Point | [Gamerant](https://gamerant.com/genshin-impact-epitomized-path-fate-point-change-weapon-banner/) |
| Guarantee | **Từ bản 5.0: chỉ cần 1 Fate Point** để lần 5★ vũ khí kế tiếp chắc chắn đúng vũ khí đã chọn (trước 5.0 cần 2 Fate Point, worst-case tới ~160 pull / 25,600 Primogems) | [Gamerant](https://gamerant.com/genshin-impact-epitomized-path-fate-point-change-weapon-banner/) · [BitTopup](https://news.bittopup.com/news/genshin-weapon-banner-pity-complete-guide-to-160-wish-max) |
| Reset Fate Point | Khi banner kết thúc, khi nhận đúng vũ khí chọn, hoặc khi đổi Weapon Course | [Gamerant](https://gamerant.com/genshin-impact-epitomized-path-fate-point-change-weapon-banner/) |

**Standard Wish (Wanderlust Invocation):**

| Cơ chế | Số liệu | Nguồn |
|---|---|---|
| Hard pity | 90 pull (không có 50/50 — mọi 5★ đều thuộc pool cố định gồm nhân vật/vũ khí vĩnh viễn) | [Game8](https://game8.co/games/Genshin-Impact/archives/305937) |

**Chuỗi tiền tệ (currency chain):**

| Bước | Quy đổi | Nguồn |
|---|---|---|
| Primogem → Fate | **160 Primogem = 1 Fate** (1 lượt quay); 1,600 Primogem = 10 lượt quay | [Fandom/tổng hợp WebSearch] |
| Genesis Crystal (IAP) → Primogem | Tỉ lệ **1:1** | [WebSearch tổng hợp] |
| Intertwined Fate | Dùng cho **banner giới hạn** (nhân vật event + vũ khí event) | [Fandom — Intertwined Fate](https://genshin-impact.fandom.com/wiki/Intertwined_Fate) |
| Acquaint Fate | Dùng cho **banner thường (standard)** | [Siliconera](https://www.siliconera.com/how-to-obtain-intertwined-and-acquaint-fate-in-genshin-impact/) |
| Battle Pass | +1 Intertwined Fate mỗi 10 cấp Battle Pass (khi mua gói trả phí) | [WebSearch tổng hợp] `[SUY ĐOÁN mức độ chính xác trung bình]` |

### 4. Thiết kế kỹ năng chủ động "tích lực → ngắm bắn có hướng" (charge-then-directional-cast)

| Game | Cơ chế | Nguồn |
|---|---|---|
| **Soul Knight** | "Aim Button" chỉ xuất hiện ở một số kỹ năng/vũ khí nhất định, kích hoạt khi **giữ nút Skill/Fire một khoảng ngắn**. Trên touchscreen có 3 kiểu joystick di chuyển (Dynamic/Fixed/Following) tách biệt với nút bắn/skill, cho phép vừa giữ sạc vừa chỉnh hướng bằng joystick | [Soul Knight Wiki — Controls] `[fetch trực tiếp bị 402, dữ liệu lấy qua WebSearch snippet]` |
| Soul Knight — chỉ báo sạc | **Charged Railgun**: khi giữ nút bắn, hiện **5 chấm tròn phía trên đầu nhân vật**, sáng dần trắng ra để báo % sạc — không phải đường thẳng/line trajectory mà là stack-dots UI; đạn bắn ra theo hướng joystick tại thời điểm nhả nút | [Soul Knight Fandom — Charged Railgun](https://soul-knight.fandom.com/wiki/Charged_Railgun) |
| Soul Knight — cung tên | **Magic Bow**: sạc theo thời gian giữ nút, damage tăng dần; **>33.3% sạc → bắn nhiều mũi tên theo góc quạt (spread angle, tối đa 7 mũi)** — đây là ví dụ rõ nhất về chỉ báo "cone/spread" thay vì line đơn | [WebSearch tổng hợp Magic Bow/Fandom] |
| Soul Knight — chậm khi sạc | Có nhóm vũ khí/kỹ năng **giảm tốc độ di chuyển khi giữ nút sạc**; ví dụ cụ thể: **One Punch giảm 20% tốc độ di chuyển khi đang tích lực**. Người chơi có thể lách luật này bằng cách bấm nhả liên tục (spam) thay vì giữ, để giữ tốc bắn mà tránh bị chậm | [WebSearch tổng hợp cộng đồng] `[độ tin cậy trung bình — không có patch note chính thức]` |
| **Hades / Hades II** | Cast (đòn phép bổ trợ) có biến thể **Omega Cast/Attack**: giữ nút → xả đòn mạnh hơn sau **thời gian tích lực ngắn**, tiêu hao Magick. Aim theo hướng di chuyển/joystick phải (trên tay cầm) hoặc chuột (PC) | [Mobalytics — Hades 2 Casts] `[fetch bị 403, dữ liệu qua snippet]` |
| Hades bản mobile (Netflix, iOS) | Có bố cục điều khiển chạm tùy biến (resize/move nút, joystick cố định hoặc nổi/floating), nhưng **không tìm thấy tài liệu mô tả chi tiết UI ngắm-hướng riêng cho Cast** trên bản mobile — nguồn chỉ xác nhận có haptic feedback và 3 preset layout | [ToucharCade — Hades iOS review](https://toucharcade.com/2024/03/20/hades-ios-review-2024-controller-support-cloud-saves-vs-switch-steam-deck-netflix-games/) `[GIỚI HẠN: không tìm được chi tiết]` |
| **Survivor.io** | Không tìm thấy cơ chế "charge rồi ngắm-hướng" cho kỹ năng chủ động. Phần lớn vũ khí/skill trong Survivor.io là **auto-attack/auto-aim**, người chơi chỉ điều khiển joystick di chuyển; không có nút giữ-sạc-nhả-bắn theo hướng thủ công được ghi nhận trong tài liệu tìm được | [BlueStacks — SIO Features Guide](https://www.bluestacks.com/blog/game-guides/survivor-io/sio-features-guide-en.html) `[XÁC NHẬN THIẾU: không tìm ra ví dụ charge-and-aim trong game này]` |

**Tổng hợp cho thiết kế UI ngắm-hướng trên touchscreen (rút từ Soul Knight — nguồn rõ nhất):**
- Tách biệt joystick di chuyển và nút skill/aim (không dùng chung 1 điểm chạm).
- Chỉ báo sạc thời gian thực bằng **icon rời rạc (dots) phía trên nhân vật** — không nhất thiết cần vẽ line/cone phức tạp trên màn hình.
- Khi vũ khí/kỹ năng cần hướng bắn, **hướng lấy từ joystick di chuyển tại thời điểm nhả nút** (không cần joystick ngắm thứ hai) — đơn giản hóa input trên màn hình nhỏ.
- Cân bằng bằng **giảm tốc độ di chuyển khi giữ sạc** (ví dụ 20%) — nhưng cơ chế này có thể bị "lách" bằng spam-tap, nên nếu áp dụng nên cân nhắc thêm cooldown chống spam.
- **Giới hạn nghiên cứu:** không tìm được ví dụ nào trong 3 game được yêu cầu (Survivor.io, Soul Knight, Hades) có UI **line/cone preview vẽ trực tiếp trên mặt đất** kiểu MOBA (VD League of Legends skillshot). Đây là khoảng trống — nếu dragonproj cần kiểu UI đó, nên tham khảo thêm các MOBA mobile (Mobile Legends, Arena of Valor) thay vì 3 game này.

---

## Tóm tắt giới hạn nghiên cứu

- **Sephira/Sephiria**: không xác nhận được đây có đúng là game user muốn nói không; không có bản mobile, không có gacha — hai điểm lệch lớn so với yêu cầu nghiên cứu ban đầu.
- Nhiều số liệu chi tiết về Sephiria chỉ đến từ các trang web có dấu hiệu SEO farm — đã loại bỏ số liệu không kiểm chứng chéo được, giữ lại phần khung hệ thống (Leaf/Sapphire/Destiny Inscription/Talent) vì được Steam Community Guide (nguồn người chơi thật) xác nhận.
- Archero 2 pull-rate lấy qua snippet tìm kiếm, không fetch được trang gốc — dùng thận trọng.
- Genshin Capturing Radiance có 2 cách mô tả số % hơi khác nhau giữa các nguồn thứ cấp (10% flat vs. 33/66/100% escalating) — bản escalating có vẻ là mô tả chính xác hơn (khớp với tên gọi cộng đồng "no 4th loss"), đã ưu tiên trình bày nhưng gắn cảnh báo.
- Không tìm được ví dụ "charge-then-directional-cast" nào trong Survivor.io; Hades mobile thiếu tài liệu UI touch chi tiết cho Cast.
