# Nghiên cứu Slime Legion — Core loop, tiến trình, kinh tế, cấu trúc ải

Quy ước: mỗi số liệu có link nguồn ngay sau câu. `[ĐO ĐƯỢC]` = số lấy từ wiki/store listing/bài hướng dẫn có trích dẫn cụ thể/phát biểu chính thức. `[SUY ĐOÁN]` = suy luận của người viết, không có nguồn trực tiếp. Mục nào không tìm ra số liệu sau nhiều lượt tìm sẽ ghi thẳng **"KHÔNG TÌM ĐƯỢC NGUỒN"**.

---

## 0. Xác định đúng game

**Game đã chọn: "Slime Legion"** (tên đầy đủ trên store), nhà phát triển/phát hành **Perfeggs Technology Co., Limited**, ra mắt **5/2/2023** ([Game Solver — Slime Legion, qua WebSearch snippet](https://game-solver.com/slime-legion/); [App Store listing](https://apps.apple.com/us/app/slime-legion/id1664686966)). Package Android: `com.hero.may.cry.adventure.game` ([Google Play](https://play.google.com/store/apps/details?id=com.hero.may.cry.adventure.game&hl=en_US)). Thể loại: **merge + tower defense + roguelike skill-selection**, mô tả chính thức "Merge your monsters! Set up your favorite lineup! Protect your castle! Destroy all invaders!" ([App Store](https://apps.apple.com/us/app/slime-legion/id1664686966)). Rating ~4.4–4.8/5 với 55.000–65.000+ lượt đánh giá, 2M+ lượt tải trên Google Play ([WebSearch tổng hợp Google Play snippet](https://play.google.com/store/apps/details?id=com.hero.may.cry.adventure.game&hl=en_US)). Bản mới nhất ghi nhận ở thời điểm nghiên cứu (12/2025) là 3.9.0, thêm Lord mới "Itiel" ([mwm.ai — Slime Legion](https://mwm.ai/apps/slime-legion/1664686966); [Game Solver — Slime Legion](https://game-solver.com/slime-legion/)).

### Các game trùng tên/dễ nhầm đã loại trừ

| Tên | Vì sao loại | Nguồn |
|---|---|---|
| **Legend of Slime: Idle RPG (War)** (`com.loadcomplete.slimeidle`, NCB) | Idle RPG tự động chiến đấu, không có cơ chế merge-match-3 lẫn tower defense; khác hẳn thể loại | [Google Play](https://play.google.com/store/apps/details?id=com.loadcomplete.slimeidle&hl=en_US) |
| **Slime Legion: Idle Merge** (`com.fc.p.F4.slime.tap.idle.legends`) | Tuy trùng cụm "Slime Legion" nhưng là game tap/idle-merge khác nhà phát triển, không phải bản của Perfeggs | [Google Play](https://play.google.com/store/apps/details?id=com.fc.p.F4.slime.tap.idle.legends&hl=en&gl=US) |
| **Slime Force - Idle RPG** | Idle RPG khác, không liên quan | [Google Play](https://play.google.com/store/apps/details?id=slime.tower.defense.idle.games&hl=en_US) |
| **Idle Slime Slayer** | Idle clicker khác, không liên quan | [Google Play](https://play.google.com/store/apps/details?id=com.idle.slime.slayer&hl=en_US) |
| **Legends of Slime** (theclashify guide) | Bài hướng dẫn thực chất nói về "Legend of Slime: Idle RPG" ở trên, không phải game đang xét | [theclashify.com](https://theclashify.com/legends-of-slime-guide-2023-traits-how-to-level-up-slime/) |
| **Slime RNG** (Roblox) | Nền tảng khác (Roblox), thể loại gacha-collector, không liên quan | [slimerng.com](https://slimerng.com/slime-rng-tier-list) |

Không có ứng viên nào khác nổi bật hơn trên Google Play/App Store khi tìm đúng cụm "Slime Legion" gắn với merge + tower defense, nên đây là lựa chọn rõ ràng, không cần chọn giữa nhiều ứng viên ngang nhau.

---

## 1. Core loop — một phiên chơi diễn ra thế nào

Slime Legion chia mỗi trận thành 2 pha lặp lại theo chu kỳ **Day** (ngày):

- **Preparation Phase (pha chuẩn bị)**: là bàn match-3. Người chơi kéo/đổi vị trí các ô để xếp **từ 3 ô giống nhau trở lên thành 1 hàng** (game gợi ý xếp theo hàng 3, 4, hoặc 5 ô) để merge chúng thành quái/vật liệu cấp cao hơn `[ĐO ĐƯỢC]` ([Talk Android — Ultimate Guide & Tips](https://www.talkandroid.com/22376-slime-legion-ultimate-guide-tips/); [mobilegaminghub.com — Beginner's Guide, qua WebSearch snippet](https://mobilegaminghub.com/slime-legion-beginners-guide-and-tips/)).
- Có bộ đếm **Turns** (lượt đi) hiện ở góc trên-trái màn hình; mỗi lần di chuyển 1 quân cờ, Turns giảm 1. Khi Turns về 0, **wave bắt đầu** `[ĐO ĐƯỢC]` ([Talk Android, qua WebSearch tổng hợp](https://www.talkandroid.com/22376-slime-legion-ultimate-guide-tips/)).
- **Defense Phase (pha phòng thủ)**: khi hết lượt đi (hoặc hết nước đi khả dụng), các quái/lính người chơi đã ghép tự động chiến đấu chống quái địch đang tấn công lâu đài `[ĐO ĐƯỢC]` ([mobilegaminghub.com — Beginner's Guide, qua WebSearch](https://mobilegaminghub.com/slime-legion-beginners-guide-and-tips/)). Đây là phần "tower defense": người chơi không điều khiển trực tiếp trong lúc đánh, chỉ đặt sẵn đội hình từ pha chuẩn bị.
- Kết thúc 1 wave, người chơi tiến thêm **+1 Day**, và chu kỳ (chuẩn bị → phòng thủ) lặp lại **cho tới Day 10** `[ĐO ĐƯỢC]` ([Talk Android, qua WebSearch tổng hợp](https://www.talkandroid.com/22376-slime-legion-ultimate-guide-tips/)).
- **Boss xuất hiện định kỳ mỗi 10 ngày** trong 1 stage/level — tức là boss là mốc kết thúc chu kỳ 10-Day nói trên `[ĐO ĐƯỢC]` ([Talk Android, qua WebSearch tổng hợp](https://www.talkandroid.com/22376-slime-legion-ultimate-guide-tips/)).
- Không có nút Undo — di chuyển sai là vĩnh viễn, không sửa lại được `[ĐO ĐƯỢC]` ([WebSearch tổng hợp từ nhiều guide](https://www.talkandroid.com/22376-slime-legion-ultimate-guide-tips/)).
- Có thanh **EXP (màu xanh)** tích lũy trên bàn chuẩn bị; khi đầy sẽ sinh ra buff/power-up cho người chơi chọn dùng `[ĐO ĐƯỢC]` ([WebSearch tổng hợp](https://www.talkandroid.com/22376-slime-legion-ultimate-guide-tips/)).
- Điều kiện thua: lâu đài hết máu ("castle's gate" về 0 HP) — game khuyên khi gate HP còn trên 40% thì có thể chấp nhận rủi ro (mạo hiểm xếp hình chậm để có combo tốt hơn), dưới ngưỡng đó nên chơi an toàn `[SUY ĐOÁN]` (diễn giải từ 1 bài guide) ([Talk Android, qua WebSearch tổng hợp](https://www.talkandroid.com/22376-slime-legion-ultimate-guide-tips/)).
- **Thời lượng 1 phiên chơi cụ thể (số phút thực tế)**: KHÔNG TÌM ĐƯỢC NGUỒN — không có bài viết nào đo trực tiếp số phút cho 1 chapter/1 chu kỳ 10-Day.

---

## 2. Cấu trúc ải / wave / chương

| Nội dung | Số liệu | Nhãn | Nguồn |
|---|---|---|---|
| Cấu trúc 1 stage/level | Chu kỳ Preparation→Defense lặp qua các **Day**, boss xuất hiện ở **Day 10** | `[ĐO ĐƯỢC]` | [Talk Android](https://www.talkandroid.com/22376-slime-legion-ultimate-guide-tips/) |
| Story chính (main chapters) | Có ít nhất **120 chapter** theo mô tả cũ hơn (bản Steam/press cũ), **140+ level** theo mô tả apk.dog gần hơn — số tăng theo bản cập nhật, giống mô hình Survivor.io | `[ĐO ĐƯỢC]` (2 mốc khác thời điểm) | [WebSearch tổng hợp taptap/review](https://www.talkandroid.com/22376-slime-legion-ultimate-guide-tips/); [slime-legion.apk.dog, qua WebFetch](https://slime-legion.apk.dog/) |
| Chế độ phụ "Arabian Nights" | **180+ tầng (floors)** | `[ĐO ĐƯỢC]` | [slime-legion.apk.dog, qua WebFetch](https://slime-legion.apk.dog/) |
| Chế độ phụ khác | **Lost Temple**, **Boss Rush**, sự kiện theo mùa | `[ĐO ĐƯỢC]` (chỉ có tên, không có số liệu chi tiết) | [slime-legion.apk.dog, qua WebFetch](https://slime-legion.apk.dog/) |
| Mở khóa nhân vật theo chương | Dracula (một unit) chỉ mở sau khi hoàn thành **Chapter 2** | `[ĐO ĐƯỢC]` | [mobilegaminghub.com, qua WebSearch](https://mobilegaminghub.com/slime-legion-beginners-guide-and-tips/) |
| Mở khóa trang bị quái (Equipment) | Mở ở **Chapter 5** | `[ĐO ĐƯỢC]` | [slime-legion.apk.dog, qua WebFetch](https://slime-legion.apk.dog/) |
| Độ khó tăng vọt | Chapter 14 được người chơi mô tả là cực khó, cần thử hàng chục lần và gần như không thể qua nếu không nạp tiền; chapter 2 quái đã "quá trâu" so với tài nguyên được cấp | `[ĐO ĐƯỢC]` (trích lời review) | [WebSearch tổng hợp review App Store/Google Play](https://apps.apple.com/us/app/slime-legion/id1664686966) |
| Điều kiện thắng/thua | Thắng = sống qua đủ số Day/qua boss; Thua = lâu đài (castle gate) hết máu | `[ĐO ĐƯỢC]` | [Talk Android](https://www.talkandroid.com/22376-slime-legion-ultimate-guide-tips/) |
| Số wave/quái cụ thể mỗi Day | KHÔNG TÌM ĐƯỢC NGUỒN | — | — |

---

## 3. Kinh tế trong trận (in-run economy)

- **Vàng (Gold) trong trận**: sinh ra bằng cách merge các ô "coin" trên bàn — 3+ đồng xu giống nhau ghép lại thành **rương (chest)**, cho **kỹ năng (skill)** và hiệu ứng đặc biệt khác, không hẳn ra thẳng Gold số lượng lớn `[ĐO ĐƯỢC]` ([Talk Android — Ultimate Guide, qua WebSearch](https://www.talkandroid.com/22376-slime-legion-ultimate-guide-tips/)).
- **Cơ chế "Steps"**: chuỗi merge liên tiếp (combo) tích lũy thành **Steps**; càng nhiều Steps trong 1 Day, người chơi càng lên cấp quái nhiều hơn và có thể sắp xếp lại bàn tốt hơn cho wave/boss kế tiếp `[ĐO ĐƯỢC]` ([WebSearch tổng hợp](https://www.talkandroid.com/22376-slime-legion-ultimate-guide-tips/)).
- **Giá nâng cấp quái trong trận**: quái được nâng cấp bằng **Monster Shards** (mảnh quái, coi như "ảnh/mảnh ghép" rơi ra sau khi thắng ~10 wave) cộng với **Gold** `[ĐO ĐƯỢC]` ([WebSearch tổng hợp — "Monster Shards and Gold"](https://mobilegaminghub.com/slime-legion-beginners-guide-and-tips/)).
- **Đường cong giá tăng theo cấp (%/lần nâng)**: KHÔNG TÌM ĐƯỢC NGUỒN.
- **Giá cụ thể từng đơn vị/mỗi lần merge (bằng bao nhiêu Gold)**: KHÔNG TÌM ĐƯỢC NGUỒN.
- **Buff/power-up giữa trận**: xuất hiện khi thanh EXP (xanh) đầy, người chơi có thể chọn dùng ngay trong trận `[ĐO ĐƯỢC]` ([Talk Android, qua WebSearch](https://www.talkandroid.com/22376-slime-legion-ultimate-guide-tips/)).

---

## 4. Kinh tế ngoài trận (meta economy)

| Loại tiền tệ | Vai trò | Nguồn |
|---|---|---|
| **Gold** | Tiền tệ thường, dùng nâng cấp quái cùng Monster Shards | `[ĐO ĐƯỢC]` ([mobilegaminghub.com, qua WebSearch](https://mobilegaminghub.com/slime-legion-beginners-guide-and-tips/)) |
| **Diamond/Gem** | Tiền tệ cao cấp (premium), dùng cho tiến trình và **refresh trận đấu** (battle refreshes) | `[ĐO ĐƯỢC]` ([apk.dog, qua WebFetch](https://slime-legion.apk.dog/)) |
| **Summon Ticket (vé triệu hồi)** | Dùng để quay gacha lấy Lord/quái mới | `[ĐO ĐƯỢC]` (nhắc tới trong tổng hợp trang code redemption) ([WebSearch tổng hợp levelgeeks.net/deliventura.com](https://levelgeeks.net/slime-legion-codes/)) |
| **Stamina/Energy** | Có tồn tại hệ thống stamina giới hạn số lượt chơi, có thể hồi qua item hoặc mã redeem ("stamina refill") | `[ĐO ĐƯỢC]` — chỉ xác nhận sự tồn tại, không có số cụ thể ([WebSearch tổng hợp deliventura.com/levelgeeks.net](https://deliventura.com/slime-legion-games-codes-update/)) |

- **Số lượng Stamina tối đa, tốc độ hồi (bao nhiêu phút/điểm), giá mua thêm bằng gem**: KHÔNG TÌM ĐƯỢC NGUỒN — nhiều bài tìm được chỉ xác nhận cơ chế stamina tồn tại (qua mã redeem "SLIMEPOWER" cho stamina refill) nhưng không nêu con số cấu hình `[ĐO ĐƯỢC cho riêng sự tồn tại]` ([WebSearch tổng hợp deliventura.com](https://deliventura.com/slime-legion-games-codes-update/)).
- **Chi phí gem cho mỗi lần refresh trận đấu**: KHÔNG TÌM ĐƯỢC NGUỒN.
- **Tỉ giá quy đổi Gold/Gem/Diamond**: KHÔNG TÌM ĐƯỢC NGUỒN.

---

## 5. Merge / gộp đơn vị

- **Luật merge cơ bản**: xếp **3 ô giống nhau liền hàng** → tạo ra **1 quái/vật liệu cấp cao hơn**; xếp **4 ô trở lên giống nhau** → tạo ra **2 quái** cùng lúc (thay vì 1) `[ĐO ĐƯỢC]` ([WebSearch tổng hợp](https://www.talkandroid.com/22376-slime-legion-ultimate-guide-tips/); xác nhận lại ở [WebSearch — beginner tips](https://www.talkandroid.com/22376-slime-legion-ultimate-guide-tips/)).
- **Gộp quái lên cấp**: **3 quái giống loại + giống cấp** → **1 quái cấp cao hơn (evolve)** `[ĐO ĐƯỢC]` ([apk.dog — "Strengthen your monsters and evolve into invincible soldiers", qua WebFetch](https://slime-legion.apk.dog/); [WebSearch tổng hợp](https://www.talkandroid.com/22376-slime-legion-ultimate-guide-tips/)).
- **Match-5 (5 ô 1 hàng)**: lời khuyên chiến thuật là cố đạt match-5 trong vòng 3 lượt, vì match-5 thường tạo ra bộ **3 mảnh đã nâng cấp** kích hoạt combo merge tiếp theo `[ĐO ĐƯỢC]` ([WebSearch tổng hợp Fandom Starter Guide snippet](https://slime-legion.fandom.com/wiki/Slime_Legion_Starter_Guide)).
- **Bậc hiếm (rarity) của nhân vật/Lord**: game có các cấp phẩm chất bao gồm **Red Core**, **Orange-quality Lord**, **Radiant-quality** — chỉ xác nhận tên gọi tồn tại, chưa rõ thứ tự đầy đủ hay tỉ lệ % `[ĐO ĐƯỢC cho tên gọi]` / `[SUY ĐOÁN cho thứ tự]` ([apk.dog, qua WebFetch](https://slime-legion.apk.dog/)).
- **Tỉ lệ gacha (rate SSR/SR/R theo %)**: KHÔNG TÌM ĐƯỢC NGUỒN.
- **Support monster (quái hỗ trợ)**: có cơ chế quái hỗ trợ đứng cạnh đội hình chính, không tham gia merge trực tiếp `[ĐO ĐƯỢC]` ([apk.dog, qua WebFetch](https://slime-legion.apk.dog/)).

---

## 6. Idle / AFK

- Không tìm thấy nguồn nào mô tả riêng cho **Slime Legion (Perfeggs)** về thưởng offline/AFK — toàn bộ kết quả tìm kiếm về "idle/AFK reward" cho từ khóa này đều trả về game khác cùng chủ đề slime (**Legend of Slime: Idle RPG**, **Slime RNG**), không phải game đang xét, nên **không dùng được** làm nguồn cho Slime Legion `[SUY ĐOÁN — không có bằng chứng cả 2 chiều]`.
- **Có cơ chế thưởng offline/AFK hay không, trần bao lâu, tỉ lệ so với chơi tay**: KHÔNG TÌM ĐƯỢC NGUỒN.

---

## 7. Tiến trình dài hạn

- **Equipment (trang bị) cho quái**: mở khóa từ **Chapter 5**, có "improvements range from added damage to extra effects" (thu thập qua nâng cấp/mảnh) `[ĐO ĐƯỢC]` ([apk.dog, qua WebFetch](https://slime-legion.apk.dog/); [mobilegaminghub.com, qua WebSearch](https://mobilegaminghub.com/slime-legion-beginners-guide-and-tips/)).
- **Sổ tay quái (Monster glossary)**: người chơi cải thiện quái vĩnh viễn ngoài trận bằng cách thu thập **mảnh ảnh (image fragments)**, thường rơi ra sau khi thắng đủ **10 wave** `[ĐO ĐƯỢC]` ([mobilegaminghub.com, qua WebSearch](https://mobilegaminghub.com/slime-legion-beginners-guide-and-tips/)).
- **Hệ thống Lord**: các tướng/Lord được cập nhật định kỳ (ví dụ Lord mới "Itiel" ở bản 3.9.0, cuối 2025) — đây là trục tiến trình dài hạn kiểu gacha-hero `[ĐO ĐƯỢC]` ([Game Solver, qua WebSearch](https://game-solver.com/slime-legion/)).
- **Prestige / reset vĩnh viễn / cấp tài khoản (account level)**: KHÔNG TÌM ĐƯỢC NGUỒN — không có bài viết nào mô tả cơ chế reset-lấy-buff-vĩnh-viễn hay account level cho riêng game này.

---

## 8. Monetization

- **Supply pack**: **$4.99–$19.99** `[ĐO ĐƯỢC]` ([App Store — In-App Purchases, qua WebFetch](https://apps.apple.com/us/app/slime-legion/id1664686966)).
- **Battle Pass**: **$9.99–$14.99** `[ĐO ĐƯỢC]` ([App Store, qua WebFetch](https://apps.apple.com/us/app/slime-legion/id1664686966)).
- **Growth Fund**: **$6.99** `[ĐO ĐƯỢC]` ([App Store, qua WebFetch](https://apps.apple.com/us/app/slime-legion/id1664686966)).
- **Gói mua định kỳ (periodic purchase)**: **$4.99** `[ĐO ĐƯỢC]` ([App Store, qua WebFetch](https://apps.apple.com/us/app/slime-legion/id1664686966)).
- **Gift pack**: **$0.99–$19.99** `[ĐO ĐƯỢC]` ([App Store, qua WebFetch](https://apps.apple.com/us/app/slime-legion/id1664686966)).
- **Quảng cáo tăng thưởng (rewarded ads)**: ứng dụng có chứa quảng cáo theo mô tả Google Play ("The app contains ads and in-app purchases") nhưng không rõ cơ chế cụ thể (nhân đôi thưởng? mở rương?) `[ĐO ĐƯỢC cho việc có ads]` / KHÔNG TÌM ĐƯỢC NGUỒN cho cơ chế chi tiết ([WebSearch tổng hợp Google Play](https://play.google.com/store/apps/details?id=com.hero.may.cry.adventure.game&hl=en_US)).
- **Nhận xét cộng đồng về P2W**: review mô tả monetization "aggressive và intrusive", liên tục mời mua gói/booster/pass; nhiều màn được thiết kế khó cố ý để thúc đẩy nạp tiền; F2P thường **chững lại quanh khoảng level 30** `[ĐO ĐƯỢC]` (trích dẫn review tổng hợp) ([WebSearch tổng hợp review App Store/Google Play](https://apps.apple.com/us/app/slime-legion/id1664686966)).

---

## 9. Nhận xét độ khó & thời lượng phiên chơi

- Cấu trúc chu kỳ Day-by-Day (chuẩn bị → phòng thủ, tối đa 10 Day/stage trước boss) tự nhiên tạo ra các phiên chơi **ngắn, chia nhỏ theo từng Day** — phù hợp mô hình chơi mobile ngắt quãng, mỗi Day có thể xong trong một khoảng thời gian ngắn rồi dừng `[SUY ĐOÁN]` (suy luận từ cấu trúc core loop ở mục 1, không có số phút đo trực tiếp).
- Tuy nhiên độ khó bị nhiều review đánh giá là **tăng đột ngột** (chapter 2 quái đã trâu, chapter 14 gần như bất khả thi nếu không nạp), khiến trải nghiệm "ngắn nhưng khó" hơn là "ngắn và dễ chịu" — mâu thuẫn với kỳ vọng phiên chơi mobile thoải mái `[ĐO ĐƯỢC]` (trích lời review) ([WebSearch tổng hợp review](https://apps.apple.com/us/app/slime-legion/id1664686966)).
- **Số phút trung bình để hoàn thành 1 stage/level cụ thể**: KHÔNG TÌM ĐƯỢC NGUỒN.
- Kết luận `[SUY ĐOÁN]`: cơ chế lõi (match-3 → auto-battle theo Day) về bản chất hợp với phiên ngắn, nhưng thiết kế độ khó/kinh tế hiện tại của Slime Legion thiên về ép nạp tiền nhiều hơn là tối ưu trải nghiệm ngắn-vui — nên khi tham khảo cho thiết kế game riêng, nên tách rõ phần cơ chế lõi (đáng học) khỏi phần cân bằng độ khó/kinh tế (không nên copy y hệt).

---

## Ghi chú phương pháp

- Trang wiki chính thức `slime-legion.fandom.com` **không fetch trực tiếp được** trong phiên nghiên cứu này (mọi lần gọi đều trả lỗi HTTP 402 Payment Required từ công cụ fetch) — thông tin từ wiki này chỉ có được qua **snippet trong kết quả WebSearch** (đã trích dẫn kèm ghi chú "qua WebSearch"), không đọc được toàn văn trang. Nếu cần đào sâu hơn (giá merge chính xác, tỉ lệ gacha, số liệu stamina), nên thử truy cập `slime-legion.fandom.com` trực tiếp bằng trình duyệt thật thay vì qua tool fetch.
- Nhiều trang guide khác (`game-solver.com`, `mobilegaminghub.com`, `playoholic.com`, `levelgeeks.net`) cũng chặn fetch trực tiếp (403 Forbidden); dữ liệu từ các trang này trong tài liệu là snippet tổng hợp qua WebSearch, không phải đọc toàn văn.
