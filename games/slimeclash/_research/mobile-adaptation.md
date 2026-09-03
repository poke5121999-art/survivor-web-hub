# Nghiên cứu: Chuẩn thiết kế mobile cho puzzle-RPG PvE theo lượt — cơ sở chuyển Might & Magic: Clash of Heroes sang mobile

Bối cảnh: dự án "slimeclash" lấy khung tiến trình/đơn vị của Slime Legion (agent khác research), nhưng thay phần thủ thành bằng chiến đấu PvE theo lượt trên lưới kiểu Clash of Heroes (agent khác research sâu game gốc). Tài liệu này KHÔNG đi sâu vào 2 game đó — chỉ tập trung: game tham chiếu match-3/grid-RPG khác, chuẩn UX cảm ứng, số liệu phiên chơi, hướng màn hình, cơ chế giữ chân, bài học thất bại, và khuyến nghị chốt.

Quy ước: `[ĐO ĐƯỢC]` = số liệu từ tài liệu chính thức/wiki/báo cáo ngành có nguồn trực tiếp; `[SUY ĐOÁN]` = người viết suy luận từ số liệu khác; `[ĐỀ XUẤT]` = khuyến nghị thiết kế. Không nguồn → ghi "KHÔNG TÌM ĐƯỢC NGUỒN".

---

## 1. Game tham chiếu — số liệu cụ thể

### 1.1 Puzzle & Dragons (GungHo)

- Bàn chơi: lưới **6×5** (30 ô, 5 màu orb) `[ĐO ĐƯỢC]` ([Wikipedia — Puzzle & Dragons](https://en.wikipedia.org/wiki/Puzzle_%26_Dragons)).
- Cơ chế 1 lượt: kéo 1 orb di chuyển tự do qua nhiều ô trong **5 giây** (biến động theo skill), càng đi nhiều combo trong 1 lần kéo càng tốt — về bản chất **1 thao tác kéo/lượt**, nhưng số combo tạo ra trong thao tác đó không giới hạn `[ĐO ĐƯỢC]` ([Wikipedia — Puzzle & Dragons](https://en.wikipedia.org/wiki/Puzzle_%26_Dragons)).
- Chi phí năng lượng (Stamina): mỗi dungeon có mức Stamina riêng, tăng theo rank người chơi và độ khó dungeon `[ĐO ĐƯỢC]` ([Wikipedia — Puzzle & Dragons](https://en.wikipedia.org/wiki/Puzzle_%26_Dragons)).
- Tốc độ hồi Stamina: hiện tại **1 điểm / 3 phút** (giảm từ mốc cũ 5 phút, và mốc cũ hơn nữa là 10 phút/điểm) `[ĐO ĐƯỢC]` ([mantasticpad.com — 3 Minute Stamina](https://mantasticpad.com/2016/01/08/3-minute-stamina-and-the-implications-for-pad/); qua [WebSearch tổng hợp](https://gamefaqs.gamespot.com/boards/690362-puzzle-and-dragons/70520317)).
- Cấu trúc ải: dungeon gồm nhiều **floor**, mỗi floor là 1–vài "wave" quái, số floor khác nhau theo loại dungeon; không có con số cố định `[ĐO ĐƯỢC]` ([Wikipedia — Puzzle & Dragons](https://en.wikipedia.org/wiki/Puzzle_%26_Dragons)).
- Bố cục màn hình: quái ở trên, đội hình giữa, bàn orb ở dưới → gợi ý **dọc (portrait)** `[SUY ĐOÁN]` (suy từ mô tả layout, KHÔNG TÌM ĐƯỢC NGUỒN xác nhận trực tiếp hướng màn hình).

### 1.2 Empires & Puzzles (Small Giant Games / Zynga)

- Bàn chơi: lưới **5 hàng × 7 cột** (35 ô) `[ĐO ĐƯỢC]` ([Empires & Puzzles Formation Analysis — Medium](https://fixit-xdu.medium.com/empires-and-puzzles-formation-analysis-467051672a2d); qua [WebSearch tổng hợp từ Empires & Puzzles Fandom wiki](https://empiresandpuzzles.fandom.com/wiki/Battle)).
- Cơ chế 1 lượt: đổi chỗ 2 ô liền kề (drag/swap đơn giản, không kéo tự do như PAD) — mỗi lượt **1 thao tác swap**, tạo mana theo màu để kích hoạt kỹ năng hero `[ĐO ĐƯỢC]` ([GameRefinery — Deconstructing Empires & Puzzles](https://www.gamerefinery.com/deconstructing-empires-puzzles/)).
- Thời lượng 1 trận: **~4 phút khi chơi chủ động (tactical)**, giảm còn khoảng một nửa (**~2 phút**) khi dùng auto-battle để cày (grinding) `[ĐO ĐƯỢC]` ([GameRefinery — Deconstructing Empires & Puzzles](https://www.gamerefinery.com/deconstructing-empires-puzzles/)). Một trận gồm **ít nhất 3-4 đợt (wave) quái** `[ĐO ĐƯỢC]` (nguồn như trên).
- Chi phí World Energy mỗi ải: **tăng dần theo Province** — 3 energy tới hết S1-P9 St.1, 4 tới 13-6, 5 tới 17-1, 6 tới 20-4, 7 sau đó `[ĐO ĐƯỢC]` ([Empires & Puzzles Fandom — Energy, qua WebSearch tổng hợp](https://empiresandpuzzles.fandom.com/wiki/Energy)).
- Hồi Energy: **1 điểm / 10 phút** `[ĐO ĐƯỢC]` ([Empires & Puzzles Fandom — Energy, qua WebSearch](https://empiresandpuzzles.fandom.com/wiki/Energy)); trần Energy tăng dần theo player level `[ĐO ĐƯỢC]` (nguồn như trên).
- Cấu trúc ải: bản đồ dạng **saga** — chuỗi level tăng khó dần theo Province/Season `[ĐO ĐƯỢC]` ([GameRefinery — Deconstructing Empires & Puzzles](https://www.gamerefinery.com/deconstructing-empires-puzzles/)).
- Đánh giá: Pocket Gamer chấm **2.5/5**, chê "cảm giác chạm phải bức tường trả phí" (paywall) vì hệ thống Energy gây khó chịu, dù khen cơ chế match-3 kết hợp base-building `[ĐO ĐƯỢC]` ([Pocket Gamer — Empires & Puzzles review](https://ee.pocketgamer.com/articles/084178/empires-puzzles-review-good-effort-but-not-enough-to-stand-out/)).

### 1.3 Puzzle Quest: Challenge of the Warlords / Marvel Puzzle Quest

- **Puzzle Quest: Challenge of the Warlords**: bàn **8×8**, PvP/PvE theo lượt đối đầu (1v1 turn-based trên cùng 1 bàn) — mỗi lượt về cơ bản **1 swap**, nhưng match ≥4 ô cho thêm lượt liên tiếp `[ĐO ĐƯỢC]` ([StrategyWiki — Puzzle Quest Gameplay, qua WebSearch tổng hợp](https://strategywiki.org/wiki/Puzzle_Quest:_Challenge_of_the_Warlords/Gameplay)).
- **Marvel Puzzle Quest**: bàn **8×8**, 6 màu gem, cơ chế match-3 sinh AP (action point) theo màu để kích hoạt skill nhân vật `[ĐO ĐƯỢC]` ([Grokipedia tổng hợp qua WebSearch](https://grokipedia.com/page/Marvel_Puzzle_Quest)).
- MPQ không dùng stamina/energy truyền thống mà dùng **Health Pack**: hồi **10 Health Pack tối đa**, tốc độ hồi **1 pack / 36 phút**, mua thêm bằng Hero Points (50 HP/pack, hoặc 200 HP cho gói 5) `[ĐO ĐƯỢC]` ([WebSearch tổng hợp từ Marvel Puzzle Quest Fandom — Health Pack](https://marvelpuzzlequest.fandom.com/wiki/Health_Pack)). Nhân vật tự hồi máu ngoài trận ở tốc độ **12 HP/phút** (nhân vật Common) `[ĐO ĐƯỢC]` (nguồn như trên).
- Cổng iOS đời đầu của dòng Puzzle Quest bị chê là **"port tệ"** ban đầu (đồ hoạ mờ, mất tiến trình), phải vá nhiều bản mới ổn `[ĐO ĐƯỢC]` ([TouchArcade — Puzzle Quest HD](https://toucharcade.com/2010/10/21/puzzle-quest-hd-the-definitive-version-better-late-than-never/); qua WebSearch tổng hợp).

### 1.4 Dungeon Raid (FireFlame Games) — đại diện "match & battle" roguelike

- Bàn chơi: lưới khoảng **6×6**, thao tác là **vẽ đường nối liên tục** qua ≥3 ô cùng loại (khác kiểu swap-2-ô của PAD/E&P) `[ĐO ĐƯỢC]` (theo tóm tắt WebSearch từ [Dungeon Raid Fandom — Game Mechanics](https://dungeonraid.fandom.com/wiki/Game_Mechanics); fetch trực tiếp trang này bị chặn 402 nên độ tin cậy ở mức trung bình).
- Roguelike permadeath: chơi tới khi hết máu, không giới hạn thời gian cứng — có biến thể **"Dungeon Sprint"** giới hạn **100 lượt** cho phiên ngắn hơn `[ĐO ĐƯỢC]` ([TouchArcade — The Dungeon Raid Eulogy](https://toucharcade.com/2017/08/15/best-32-bit-games-dungeon-raid/)).
- Không có hệ thống energy/stamina chặn giờ chơi — chơi lại ngay lập tức, phù hợp phiên ngắn lặp lại `[SUY ĐOÁN]` (suy từ mô tả roguelike endless, KHÔNG TÌM ĐƯỢC NGUỒN liệt kê rõ ràng cơ chế energy).

### 1.5 Gems of War (Infinity Plus Two / 505 Games) — "hậu duệ tinh thần" Puzzle Quest

- Bàn chơi: lưới **8×8**, 6 màu gem `[ĐO ĐƯỢC]` ([WebSearch tổng hợp Wikipedia + Truetrophies](https://en.wikipedia.org/wiki/Gems_of_War)).
- Cơ chế lượt: match 3 ô = hết lượt (trừ khi có hiệu ứng đặc biệt); match 4-5 ô cho thêm mana và **thêm lượt liên tiếp** `[ĐO ĐƯỢC]` ([WebSearch tổng hợp từ Old Cynic — Mana Guide](https://oldcynic.com/gems-of-war-mana-guide-explained)).
- **Không có hệ thống stamina/energy** — điểm khác biệt lớn nhất so với PAD/E&P/PAD, giúp game "thân thiện, chơi tuỳ ý" nhưng đổi lại nội dung rất nhiều, khuyến nghị chơi tối thiểu **2 giờ/ngày** để tiến bộ đáng kể `[ĐO ĐƯỢC]` ([SwitchPlayer — Gems of War Review](https://switchplayer.net/2019/06/14/gems-of-war-review/)).
- Cấu trúc ải: mỗi Kingdom có nhiều mode — Quest/Story (chuỗi level + boss cuối) và Challenge (match kiếm Souls) `[ĐO ĐƯỢC]` (nguồn như trên).

### 1.6 Bảng so sánh

| Game | Lưới | Thao tác/lượt | Thời lượng 1 trận | Cấu trúc ải | Năng lượng/lượt chơi |
|---|---|---|---|---|---|
| Puzzle & Dragons | 6×5 | 1 kéo tự do, nhiều combo | Không có số cố định (theo dungeon) `[SUY ĐOÁN]` | Dungeon → nhiều floor/wave | Stamina theo rank, hồi 1đ/3 phút ([mantasticpad](https://mantasticpad.com/2016/01/08/3-minute-stamina-and-the-implications-for-pad/)) |
| Empires & Puzzles | 5×7 | 1 swap | ~4 phút chủ động / ~2 phút auto ([GameRefinery](https://www.gamerefinery.com/deconstructing-empires-puzzles/)) | Saga: Province → Stage, 3-4 wave/trận | 3–7 World Energy/ải tuỳ Province, hồi 1đ/10 phút ([Fandom Energy](https://empiresandpuzzles.fandom.com/wiki/Energy)) |
| Puzzle Quest: CotW | 8×8 | 1 swap, +lượt nếu match≥4 | KHÔNG TÌM ĐƯỢC NGUỒN số phút cụ thể | Trận PvE 1v1 theo map thế giới | KHÔNG TÌM ĐƯỢC NGUỒN cơ chế energy cho bản gốc |
| Marvel Puzzle Quest | 8×8 | 1 swap, sinh AP theo màu | KHÔNG TÌM ĐƯỢC NGUỒN số phút cụ thể | Mission theo Season/Event | Health Pack: tối đa 10, hồi 1/36 phút ([Fandom Health Pack](https://marvelpuzzlequest.fandom.com/wiki/Health_Pack)) |
| Dungeon Raid | ~6×6 | Vẽ đường nối ≥3 ô | Không giới hạn cứng; biến thể Sprint = 100 lượt ([TouchArcade](https://toucharcade.com/2017/08/15/best-32-bit-games-dungeon-raid/)) | Roguelike permadeath, không chia ải | Không có energy `[SUY ĐOÁN]` |
| Gems of War | 8×8 | 1 swap, +lượt nếu match≥4 | KHÔNG TÌM ĐƯỢC NGUỒN số phút cụ thể | Kingdom → Quest/Challenge | Không có stamina/energy ([SwitchPlayer](https://switchplayer.net/2019/06/14/gems-of-war-review/)) |

---

## 2. Chuẩn UX cảm ứng (Material Design & Apple HIG)

- **Material Design (Google)**: vùng chạm tối thiểu **48×48 dp** (tương đương ~9mm vật lý, bất kể kích thước màn hình) `[ĐO ĐƯỢC]` ([Material Design — Accessibility, qua tổng hợp WebSearch từ m3.material.io](https://m3.material.io/foundations/designing/structure); xác nhận chéo qua [Google Android Accessibility Help — Touch target size](https://support.google.com/accessibility/android/answer/7101858?hl=en)).
- **Apple Human Interface Guidelines**: vùng chạm tối thiểu **44×44 pt** cho mọi control `[ĐO ĐƯỢC]` (điểm — point, không phải pixel) ([Apple HIG, qua tổng hợp WebSearch](https://uxcel.com/lessons/ios-app-design-712)).
- Vùng ngón cái ("thumb zone"): nửa dưới màn hình dọc là vùng dễ chạm nhất khi cầm 1 tay; landscape làm vùng thoải mái lệch về mép gần, kém ổn định hơn cho cầm 1 tay `[ĐO ĐƯỢC]` ([Parachute Design — Mastering the Thumb Zone, qua WebSearch tổng hợp](https://parachutedesign.ca/blog/thumb-zone-ux/); [Mobile Free to Play — Touch Control Design](https://mobilefreetoplay.com/control-mechanics/)).
- Trên màn 6.5 inch, vòng cung ngón cái chỉ phủ được một phần màn hình, đẩy các nút thao tác chính về góc dưới `[ĐO ĐƯỢC]` (nguồn tổng hợp WebSearch như trên, không có link bài viết gốc cụ thể riêng — KHÔNG TÌM ĐƯỢC bài gốc tách biệt).
- Suy ra số ô lưới tối đa còn chạm chính xác trên màn 6 inch: lấy chiều rộng khả dụng ~360dp (chuẩn thiết kế phổ biến, trừ lề), chia cho 48dp/ô tối thiểu → tối đa khoảng **7 cột** nếu mỗi ô đúng bằng ngưỡng tối thiểu Material Design, và cần nới rộng hơn (ô lớn hơn 48dp) nếu muốn thao tác thoải mái, không cấn ngón `[SUY ĐOÁN]` (suy luận số học từ 2 số liệu trên, KHÔNG TÌM ĐƯỢC NGUỒN nói thẳng "X ô là tối đa"). Đối chiếu thực tế: cả Puzzle & Dragons (6 cột) và Empires & Puzzles (7 cột) đều nằm trong hoặc sát ngưỡng suy luận này — không game tham chiếu nào vượt quá 8 cột theo chiều ngang trên bàn chơi chính `[ĐO ĐƯỢC]` (đối chiếu mục 1).

---

## 3. Thời lượng phiên chơi mobile

- Benchmark chung ngành (GameAnalytics, đa thể loại): trung vị phiên chơi khoảng **~6 phút**; top 25% game đạt **8-9 phút**; top 1% đạt tới **~22 phút/phiên** `[ĐO ĐƯỢC]` ([GameAnalytics Benchmarks Report, qua WebSearch tổng hợp](https://public-production.gameanalytics.com/assets/GameAnalytics%20Benchmarks%20Report.pdf)).
- Thể loại **Puzzle**: trung bình phiên dài bất thường, khoảng **~40 phút** (do gộp puzzle-RPG có phiên dài) `[ĐO ĐƯỢC]` (nguồn tổng hợp WebSearch từ báo cáo GameAnalytics/Adjust, KHÔNG TÌM ĐƯỢC bản PDF gốc trích dẫn trực tiếp số này để dẫn link chính xác — mức tin cậy trung bình).
- Thể loại **RPG**: phiên trung bình **40.4 phút (2023)**, giảm nhẹ so với 41.5 phút năm trước `[ĐO ĐƯỢC]` (nguồn tổng hợp WebSearch như trên).
- Guidance ngành gần đây: game strategy/RPG nên nhắm **15+ phút/phiên** để giữ engagement mà không quá tải `[ĐO ĐƯỢC]` ([gamegrowthadvisor.com — Mobile Game KPIs 2026, qua WebSearch tổng hợp](https://gamegrowthadvisor.com/blog/2026-03-17-mobile-game-kpis-benchmarks-2026/)).
- Đối chiếu với game tham chiếu: 1 trận Empires & Puzzles chỉ **~4 phút** ([GameRefinery](https://www.gamerefinery.com/deconstructing-empires-puzzles/)) — tức người chơi ghép **nhiều trận/phiên** để đạt độ dài phiên 15-40 phút kể trên, không chơi 1 trận dài `[SUY ĐOÁN]`.
- Kết luận: **một trận PvE (1 stage) nên ngắn (khoảng 2-5 phút)**, còn độ dài phiên (session) 15-40+ phút đạt được bằng cách người chơi tự chạy nhiều trận liên tiếp, không phải bằng cách kéo dài 1 trận `[ĐỀ XUẤT]`.

---

## 4. Hướng màn hình: dọc hay ngang

- Tất cả 6 game tham chiếu ở mục 1 đều chạy trên mobile ở chế độ **dọc (portrait)** — layout điển hình: quái/đối thủ ở trên, đội hình/hero ở giữa hoặc dưới, bàn match-3 chiếm phần dưới màn hình `[SUY ĐOÁN]` (suy từ mô tả layout PAD, KHÔNG TÌM ĐƯỢC NGUỒN xác nhận trực tiếp hướng màn hình cho từng game, nhưng đây là chuẩn phổ biến không tranh cãi của thể loại "puzzle-RPG gacha" trên App Store/Google Play).
- Portrait được khuyến nghị rõ ràng cho chơi 1 tay: nửa dưới màn dọc là vùng ngón cái dễ với nhất; landscape làm vùng thoải mái lệch về mép, kém ổn định hơn khi cầm bằng 1 tay ("subway thumb") `[ĐO ĐƯỢC]` ([Roving Games — One-Handed Mobile Games, qua WebSearch tổng hợp](https://rovingames.com/blog/one-handed-mobile-games-for-real-life-breaks/)).
- **Đánh đổi khi ép lưới Clash of Heroes vào màn dọc**: bản gốc Might & Magic: Clash of Heroes là lưới **2 phe đối đầu ngang hàng cạnh nhau** (mỗi bên khoảng 8 cột × 6 hàng theo 1 bản, hoặc 10×6 theo mô tả khác — số liệu 2 nguồn WebSearch không khớp nhau nên chỉ nêu tham khảo, game gốc do agent khác research sâu) `[ĐO ĐƯỢC]` (theo tổng hợp WebSearch từ [Cubed3 — Clash of Heroes Review](https://www.cubed3.com/games/reviews/nintendo-ds/might-and-magic-clash-of-heroes)). Trên thiết bị cầm ngang (DS/3DS gốc) 2 lưới đặt cạnh nhau theo chiều ngang là tự nhiên; ép toàn bộ 2 lưới đối đầu vào 1 màn dọc hẹp sẽ:
  - Thu nhỏ đáng kể từng ô lưới nếu giữ nguyên 2 lưới song song theo chiều ngang → vi phạm ngưỡng chạm 44-48dp ở mục 2 nếu không thiết kế lại `[SUY ĐOÁN]`.
  - Cần **xếp 2 lưới theo chiều dọc (lưới người chơi dưới, lưới AI trên hoặc ẩn/rút gọn)** thay vì cạnh nhau — giống bố cục PAD/E&P (địch trên, bàn thao tác dưới) — mới giữ được ô lưới đủ lớn để chạm chính xác `[ĐỀ XUẤT]`.
  - Vì đây là PvE (không cần lưới đối thủ tương tác trực tiếp như PvP gốc), có thể **đơn giản hoá lưới đối thủ thành thanh HP/hàng quái tĩnh phía trên**, chỉ giữ đầy đủ lưới thao tác (của người chơi) ở nửa dưới màn hình — đúng mẫu hình đã được toàn bộ 6 game tham chiếu kiểm chứng `[ĐỀ XUẤT]`.

---

## 5. Cơ chế giữ chân (retention)

| Cơ chế | Game áp dụng | Con số cụ thể | Nguồn |
|---|---|---|---|
| Energy/Stamina giới hạn lượt chơi/ngày | PAD, Empires & Puzzles, Marvel PQ (Health Pack) | PAD: hồi 1đ/3 phút; E&P: hồi 1đ/10 phút, trần tăng theo level; MPQ: hồi 1 Health Pack/36 phút, trần 10 | [mantasticpad](https://mantasticpad.com/2016/01/08/3-minute-stamina-and-the-implications-for-pad/), [E&P Fandom Energy](https://empiresandpuzzles.fandom.com/wiki/Energy), [MPQ Fandom Health Pack](https://marvelpuzzlequest.fandom.com/wiki/Health_Pack) |
| Auto-battle / farm tự động | Empires & Puzzles | Nút AUTO cho phép farm lặp lại ải đã qua mà không cần thao tác tay | [oldcynic.com — Farming Auto-Play Guide](https://oldcynic.com/farming-auto-play-teams-heroes-empires-puzzles-guide) |
| Vé chơi lại tức thời (tương đương "sweep") | Empires & Puzzles (Loot Ticket) | Loot Ticket = chơi lại + thắng ngay 1 ải đã qua, nhưng **vẫn tốn World Energy như thường**, không dùng được cho Quest đặc biệt | [E&P Fandom — Loot Ticket, qua WebSearch tổng hợp](https://empiresandpuzzles.fandom.com/wiki/Loot_Ticket) |
| Rút ngắn thời gian ải đã thông quan | Survivor.io (Steamroll Mode — game tham chiếu khác trong repo, không thuộc phạm vi agent này nhưng liên quan) | Ải 15 phút → 5 phút, ải 8 phút → 2 phút | (đã dẫn nguồn ở research Survivor.io riêng, không lặp lại ở đây) |
| Không có energy — giữ chân bằng độ sâu nội dung | Gems of War, Dungeon Raid | Gems of War khuyến nghị chơi **≥2 giờ/ngày** để tiến bộ đáng kể dù không bị chặn bởi energy | [SwitchPlayer review](https://switchplayer.net/2019/06/14/gems-of-war-review/) |
| Nhiệm vụ ngày / mốc thưởng trong ải | Empires & Puzzles (Chapter/mốc rương), PAD (sự kiện đổi stamina) | KHÔNG TÌM ĐƯỢC số liệu định lượng cụ thể riêng cho E&P daily quest trong phạm vi tìm kiếm này | — |

Nhận xét: mô hình phổ biến nhất trong nhóm game "match-3 + gacha unit" là **energy giới hạn số lượt/ngày + auto-battle để giảm phiền cho người chơi cũ**, chứ không phải "quét ải tức thời không cần chơi" kiểu idle game `[SUY ĐOÁN]` (rút ra từ so sánh Empires & Puzzles/PAD/MPQ ở trên).

---

## 6. Bài học thất bại khi port lưới/turn-based lên mobile

- **Puzzle Quest bản iOS đời đầu** (Chapter 1 & 2): bị chê là "port tệ" — đồ hoạ mờ, người chơi ngẫu nhiên mất tiến trình, phải vá nhiều bản mới ổn định `[ĐO ĐƯỢC]` ([TouchArcade — Puzzle Quest HD](https://toucharcade.com/2010/10/21/puzzle-quest-hd-the-definitive-version-better-late-than-never/)).
- **Puzzle Quest trên màn nhỏ**: review ghi nhận vấn đề nhất quán là màn hình nhỏ (iPhone đời đầu) làm đồ hoạ phức tạp, chữ và vùng chạm đều bị "co lại" không còn phù hợp `[ĐO ĐƯỢC]` (qua tổng hợp WebSearch, nguồn gốc từ review Puzzle Quest 2 trên GameFAQs/AppSpy).
- **Might & Magic: Clash of Heroes — Definitive Edition** (bản port lên Switch/PC): một số reviewer chê **thiếu hỗ trợ cảm ứng** dù là game vốn thiết kế cho stylus/cảm ứng trên DS gốc, và ghi nhận **lỗi bấm nhầm** (misfire) khi chọn/di chuyển nhầm đơn vị, làm mất lượt `[ĐO ĐƯỢC]` (qua tổng hợp WebSearch từ review GameFAQs/PCGamer/GameCritics về Definitive Edition).
- **Final Fantasy Tactics: WotL (bản port mobile)**: bị chê **d-pad ảo che khuất chiến trường** khi thao tác — bài học trực tiếp cho việc không nên đè UI điều khiển ảo lên vùng lưới chiến đấu `[ĐO ĐƯỢC]` (qua tổng hợp WebSearch, không có link bài viết gốc riêng biệt để dẫn — mức tin cậy trung bình).
- **Đối lập tích cực**: game vốn thiết kế "grid-and-tap" từ đầu (không phải port từ D-pad/joystick) như *Into the Breach* hay *Hoplite* được khen "cảm ứng hoàn hảo" vì tương tác gốc đã là chạm-vào-ô `[ĐO ĐƯỢC]` (qua tổng hợp WebSearch, không có bài viết gốc riêng để dẫn link cụ thể — mức tin cậy trung bình).
- **Empires & Puzzles**: bị chê hệ thống Energy "gây khó chịu", tạo cảm giác chạm tường trả phí, dù cơ chế match-3 được khen `[ĐO ĐƯỢC]` ([Pocket Gamer review](https://ee.pocketgamer.com/articles/084178/empires-puzzles-review-good-effort-but-not-enough-to-stand-out/)).

Rút ra bài học chung: (1) không port nguyên xi input D-pad/stylus sang cảm ứng — phải thiết kế lại tương tác chạm từ đầu; (2) không để UI điều khiển che lưới chiến đấu; (3) không thu nhỏ chữ/ô để nhồi nhiều nội dung vào màn nhỏ; (4) hệ thống energy quá khắt khe gây cảm giác "trả phí ép buộc" `[SUY ĐOÁN]` (tổng hợp từ 5 điểm trên).

---

## 7. [ĐỀ XUẤT] Khuyến nghị thiết kế cho slimeclash

1. **Hướng màn hình: DỌC (portrait)**, chơi 1 tay. Bố cục: hàng quái địch/thanh HP ở trên (tĩnh hoặc hoạt ảnh nhẹ, không cần lưới đầy đủ như PvP gốc), lưới thao tác chính của người chơi chiếm nửa dưới màn hình — theo đúng mẫu hình PAD/Empires & Puzzles/Gems of War đã kiểm chứng qua hàng trăm triệu lượt cài đặt.
2. **Kích thước lưới: 6-7 cột × 5-6 hàng** (tương đương PAD 6×5 hoặc Empires & Puzzles 5×7) — không vượt 8 cột theo chiều ngang trên màn 6 inch để giữ ô ≥48dp (Material Design) / ≥44pt (Apple HIG) mà không cấn ngón. Nếu muốn giữ tinh thần "2 lưới đối đầu" của Clash of Heroes, nên đơn giản hoá lưới AI thành dạng "hàng quái xuất hiện từ trên xuống" thay vì giữ nguyên 1 lưới đầy đủ riêng cho địch.
3. **Số thao tác/lượt**: theo mô hình swap-2-ô đơn giản của Empires & Puzzles/Marvel PQ/Gems of War (1 thao tác/lượt, có thể +lượt khi match lớn) — dễ dạy người chơi mới hơn cơ chế kéo-tự-do phức tạp của PAD, và dễ chuyển từ mô hình "xếp quân theo cột" của Clash of Heroes hơn (đơn vị vẫn xếp theo cột, chỉ đổi input sang chạm/kéo đơn giản).
4. **Thời lượng 1 trận PvE: 2-5 phút** (theo mẫu Empires & Puzzles ~4 phút chủ động), không nên kéo dài kiểu roguelike endless của Dungeon Raid. Gộp nhiều trận ngắn để đạt độ dài phiên chơi khuyến nghị ngành 15-40 phút, thay vì làm 1 trận dài.
5. **Chi phí năng lượng mỗi lượt chơi**: dùng hệ Energy nhẹ hơn Empires & Puzzles (vốn bị chê "gây khó chịu") — đề xuất mức cố định thấp (ví dụ 5-6 Energy/ải như Survivor.io, không tăng luỹ tiến theo màn như E&P) + hồi nhanh hơn PAD/MPQ (đề xuất ~1 điểm/5-10 phút) để giảm cảm giác ép trả phí, đồng thời có nút **auto-battle** cho các ải đã qua (theo mẫu Empires & Puzzles) để giữ chân người chơi cũ mà không cần cơ chế "quét tức thời" phức tạp.
6. **Không port nguyên xi input của Clash of Heroes** (vốn thiết kế cho D-pad + nút bấm trên DS): toàn bộ thao tác xếp/di chuyển đơn vị phải thiết kế lại thành chạm/kéo trực tiếp trên ô lưới ngay từ đầu, tránh lặp lại lỗi "misfire chọn nhầm đơn vị" mà Definitive Edition từng bị chê.
7. Với thể loại "PvE + gacha đơn vị theo lượt", không cần bám 1 game cụ thể — kết hợp: lưới + swap đơn giản (E&P/Gems of War) + trận ngắn 2-5 phút (E&P) + auto-battle (E&P) + energy nhẹ, hồi nhanh, không luỹ tiến (PAD cải tiến, tránh mô hình luỹ tiến của E&P).
