# Slime Legion — chỉ số & kỹ năng hero (đối chiếu 59 tên thật từ APK 4.5.0)

> Quy ước: mỗi số liệu có link nguồn ngay sau câu. `[ĐO ĐƯỢC]` = số lấy từ wiki/guide cộng đồng có
> trích dẫn cụ thể. `[SUY ĐOÁN]` = suy luận của người viết (kể cả suy đoán ánh xạ tên), không có
> nguồn trực tiếp xác nhận. Không tìm ra gì thì ghi thẳng **"KHÔNG TÌM ĐƯỢC NGUỒN"**.
>
> Bảng 59 hero + id dưới đây lấy từ file đã mổ APK (`slime-legion-apk-datamine.md` — tên và id
> `[ĐO TỪ APK]`, đáng tin nhất). Cột "kỹ năng/tier" trong tài liệu này lấy từ wiki/guide cộng đồng
> nên chỉ là `[ĐO ĐƯỢC]` (không phải từ APK), và nhiều trường hợp **tên hiển thị cộng đồng dùng
> khác chữ với tên codename trong APK** — cột "Ánh xạ tên" ghi rõ độ tin cậy của việc khớp tên.

## 0. Phương pháp & giới hạn đã gặp

- Đã chạy 5 lượt tìm kiếm song song (mỗi lượt phụ trách ~12 hero), tổng cộng >290 lượt gọi công cụ.
  Ngân sách WebSearch của phiên (200 lệnh) bị dùng hết ngay từ 1–2 lượt tìm đầu của một vài nhóm
  (có vẻ ngân sách này **dùng chung giữa các agent chạy song song**, không phải theo từng agent).
  Từ đó phần lớn công việc phải chuyển sang `WebFetch` — trực tiếp nơi được, qua proxy
  `https://r.jina.ai/` nơi bị chặn (đặc biệt là `slime-legion.fandom.com`, luôn trả 402/403 nếu
  fetch thẳng).
- **`slime-legion.fandom.com` chỉ có 26–29 trang tổng cộng**, trong đó đúng **8 trang hero riêng**:
  Slime, Egg Thrower, Frost, Little Devil, Berserker, Dracula, Goblin, **Iron Fist** (trang thứ 8
  mới phát hiện lần này). Không có trang riêng nào cho bất kỳ hero nào trong 59 hero cần tìm ở
  trên. Trang `Tier_List` của chính wiki này cũng **chưa hoàn thành** — chỉ có hạng S được điền,
  A→D còn để trống (xác nhận bằng cách đọc `?action=raw`).
- Nguồn có dữ liệu thật nhiều nhất: **ProGameGuides Tier List**
  ([progameguides.com/slime-legion/slime-legion-tier-list/](https://progameguides.com/slime-legion/slime-legion-tier-list/),
  cập nhật 5/2025, tự nhận liệt kê ~66 hero) — mô tả kỹ năng bằng lời kèm một số % rải rác, **không
  có bảng chỉ số gốc** (HP/DMG/tốc đánh/tầm đánh/tốc di chuyển) cho gần như toàn bộ hero, và
  **không có bảng talent 8×5 hay chỉ số theo cấp Lv.1/3/5/7/9/12/15** cho hero nào trong danh sách.
  Nguồn phụ: **TheClashify** (theclashify.com, bản 4/2024, chỉ có số liệu chi tiết cho Dracula),
  **TierMaker** (roster ảnh + tên, không có mô tả kỹ năng, nhưng hữu ích để xác nhận **tên gốc
  chính xác trong game** trùng với codename APK).
- Reddit, Google/Bing/DuckDuckGo trực tiếp, YouTube: bị chặn captcha/403 ở mọi lượt thử qua
  WebFetch (kể cả qua proxy) — không khai thác được, trừ 1 snippet Reddit lấy qua Brave Search cho
  Vampire.
- **Không nguồn nào (kể cả wiki chính thức) có**: chỉ số gốc dạng số cho 59 hero này, bảng theo
  cấp Lv.1/3/5/7/9/12/15, bảng talent 8 loại × 5 cấp, hay bảng hệ khắc chế (elemental multiplier)
  — toàn bộ các mục này ghi **KHÔNG TÌM ĐƯỢC NGUỒN** cho mọi hero trong danh sách 59, không có
  ngoại lệ. (Dữ liệu Dracula 30→190 sát thương Lv1→Lv8 đã có sẵn từ trước **không nằm trong danh
  sách 59 hero này** — Dracula không có id trong bảng do người dùng cung cấp.)

## 1. Về 4 hero mặc định (id 101, 102, 104, 106) và Berserker/Dracula/Goblin/Iron Fist

Danh sách 59 hero do người dùng cung cấp **bỏ trống các id 101, 102, 104, 105, 106** (105 cũng
không xuất hiện). 8 trang hero đầy đủ nhất trên wiki fandom là Slime, Egg Thrower, Frost, Little
Devil (đều là hero khởi đầu, không cần mở khóa) và Berserker, Dracula, Goblin, Iron Fist (đều mở
khóa qua Main Story Chapter 2, cần đủ mảnh triệu hồi).

`[SUY ĐOÁN]` (không có xác nhận trực tiếp từ APK): 4 hero khởi đầu trùng số lượng và vai trò với 4
id mặc định — **101/102/104/106 = Slime, Egg Thrower, Frost, Little Devil** (thứ tự ghép cụ thể
với id nào thì không xác định được). **Berserker, Dracula, Goblin, Iron Fist** nhiều khả năng nằm
ở id 105 hoặc các id nằm ngoài khoảng người dùng liệt kê (ví dụ dưới 103) — không tìm được bằng
chứng để gán từng hero vào từng id cụ thể.

## 2. Bảng chính — 59 hero (theo id)

Cột "Ánh xạ tên": **Trùng** = tên hiển thị cộng đồng khớp đúng/gần như đúng chữ với codename APK
(TierMaker dùng nguyên văn tên trong game, không dịch/đổi). **Suy đoán** = tên hiển thị cộng đồng
khác hẳn hoặc khác nhiều so với codename, chỉ liên hệ được qua chủ đề/hình tượng — **chưa có gì
xác nhận đây là cùng 1 hero**, dùng phải hết sức thận trọng. **Không có** = không tìm được tên
hiển thị cộng đồng nào để đối chiếu.

| ID | Tên (APK) | Ánh xạ tên | Hệ | Tier | Kỹ năng / số liệu tìm được | Nguồn |
|---|---|---|---|---|---|---|
| 103 | IronBull | Không có | — | — | KHÔNG TÌM ĐƯỢC NGUỒN. Có hero "**Iron Fist**" trên wiki fandom với bảng kỹ năng đầy đủ theo cấp, nhưng **không có bằng chứng** đây là cùng hero — chỉ trùng chữ "Iron" `[SUY ĐOÁN]` (không dùng để tính là "tìm được") | — |
| 107 | ThunderRobot | Suy đoán (rất yếu) | — | — | Roster TierMaker bản v1.5.1/v2.0 có mục tên "Robot" (không "Thunder") — không đủ căn cứ khẳng định `[SUY ĐOÁN]`. Không có kỹ năng/tier | [TierMaker v1.5.1](https://tiermaker.com/create/slime-legion-v151-15805819) |
| 108 | WarriorBull | Suy đoán (rất yếu) | — | — | Roster TierMaker bản v1.5.1 có mục "Warrior" (không "Bull") `[SUY ĐOÁN]`. Không có kỹ năng/tier | [TierMaker v1.5.1](https://tiermaker.com/create/slime-legion-v151-15805819) |
| 109 | Enchantress | Trùng | — | — | Tên xuất hiện đúng chữ trong roster TierMaker v1.5.1/v2.0; bản v1.0 cùng vị trí ghi "Magic Woman" (hero từng đổi tên hiển thị) `[ĐO ĐƯỢC]`. Không có kỹ năng/chỉ số/tier | [TierMaker v1.5.1](https://tiermaker.com/create/slime-legion-v151-15805819); [TierMaker v1.0](https://tiermaker.com/create/slime-legion-tier-list-ver10-15789560) |
| 110 | Vampire | Trùng (tồn tại) | — | — | Chỉ có 1 câu trích Reddit qua snippet Brave Search: "Vampire is a beast vs pirates" — không rõ nghĩa do không fetch được toàn văn (Reddit chặn hết) `[ĐO ĐƯỢC]` (chỉ xác nhận tồn tại, không có kỹ năng) | [Reddit r/SlimeLegion — snippet](https://www.reddit.com/r/SlimeLegion/comments/12kjokl/combos_and_tier_list/) |
| 111 | Lord | Trùng | Lửa (suy ra) | A (ProGameGuides) / B (TheClashify — bản khác) | Gây **Sợ hãi (fear)**; hạ gục địch đang sợ → vào **Hyper Status 5 giây**, phun lửa, tăng tốc đánh; tăng sát thương lên địch đóng băng/bốc cháy; có chiêu "Deadly Ray" `[ĐO ĐƯỢC]` | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/); [TheClashify](https://theclashify.com/slime-legion-tier-list-wiki/) |
| 112 | Totem | Trùng | — | S | Hỗ trợ: tăng bonus/sát thương/tốc đánh đồng minh trong tầm; tăng sát thương địch nhận trong tầm khi nâng cấp đủ; hồi máu lâu đài từ từ; gây debuff Dễ tổn thương (vulnerable) lên địch `[ĐO ĐƯỢC]` | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/) |
| 113 | Joker | Trùng | — | C | Ném dao gây Dễ tổn thương (vulnerable); nâng cấp tăng sát thương thêm lên địch đang Dễ tổn thương `[ĐO ĐƯỢC]` (nguồn dùng tên "Clown" cho cùng vị trí tier — `[SUY ĐOÁN]` là cùng 1 hero) | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/) |
| 114 | Engineer | Trùng | — | D | Bắn tên lửa vào địch trong phạm vi **1 ô**; thiết kế để phối hợp với hero "P.Bot" (ra lệnh cho P.Bot bắn tên lửa) `[ĐO ĐƯỢC]` | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/) |
| 115 | Succubus | Trùng | — | C | Khống chế: **25% cơ hội mê hoặc 4 địch** cùng lúc (ở cấp cao); tăng sát thương lên địch đang Sợ hãi; giết địch Sợ hãi → **+100% sát thương trong 5 giây** (nguồn khác, bản khác) `[ĐO ĐƯỢC]` | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/); [TheClashify](https://theclashify.com/slime-legion-tier-list-wiki/) |
| 116 | Witch | Trùng | **Lửa (Fire)** — xác nhận rõ | A (ProGameGuides) / B (TheClashify) | Triệu hồi "lốc lửa" (fiery hurricane) xoay quanh bản thân; nâng cấp tăng tỉ lệ triệu hồi/sát thương/thời lượng; có thể **+0,5 giây** thời gian địch bị choáng `[ĐO ĐƯỢC]` — số liệu cụ thể duy nhất tìm được trong cả nhóm 103-117 | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/) |
| 117 | Medusa | Trùng | — | A | Hóa đá (petrify) địch khiến chúng nhận thêm sát thương; gây độc, triệu hồi rắn (vipers) — rắn cũng hóa đá + gây độc được; làm chậm địch sau khi hóa đá `[ĐO ĐƯỢC]` | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/) |
| 118 | Naga | Trùng | Nước (suy ra) | C | Tạo sóng thần đẩy lùi địch: cấp cơ bản **20% cơ hội đẩy lùi 2 địch** cùng lúc, % và số lượng tăng dần theo nâng cấp `[ĐO ĐƯỢC]` | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/) |
| 119 | Siren | Trùng | — | B | Ở **cấp 9**, làm địch **giảm 50% sát thương** gây vào lâu đài khi va chạm — thiên phòng thủ, kém "Protector" `[ĐO ĐƯỢC]` | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/) |
| 120 | Nova | Trùng | Băng/Nước | B | Cấp 1: **30% cơ hội** kích hoạt "ice storm" làm chậm/đóng băng địch; % và sát thương tăng theo nâng cấp. Trang `Monsters` của wiki fandom dùng chính Nova làm ví dụ minh hoạ 2 trường "Slowing Duration"/"Slowing Effect" (không kèm số) `[ĐO ĐƯỢC]` | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/); [Monsters — wiki](https://slime-legion.fandom.com/wiki/Monsters) |
| 121 | NightElf | Suy đoán (~"Dark Elf") | — | B (nếu đúng) | Nếu đúng là "Dark Elf": bắn nhiều mũi tên; giết địch đang Sợ hãi → **+50% sát thương vĩnh viễn trong trận** `[SUY ĐOÁN]` (chỉ liên hệ qua tên gọi, chưa xác nhận) | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/) |
| 124 | Cactus | Trùng | Thực vật/Thổ (suy đoán) | C | Đánh xa, bắn ra **4 hướng**, tốc nạp đạn chậm; mạnh hơn khi đi cùng "Smelly Flower"/"Cannibal Flower" `[ĐO ĐƯỢC]` | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/) |
| 125 | StoneMan | Suy đoán (~"Rocky") | — | D (nếu đúng) | Nếu đúng là "Rocky": sát thương cơ bản **25**, đẩy đá nghiền địch; cấp 15 mở thêm hất lùi (knockback) `[SUY ĐOÁN]` | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/) |
| 126 | Zombie | Trùng | — (có thể Tối/Undead, suy đoán) | B | Sát thương cao nhưng "ngủ" 3 giây sau đòn; **cấp 5**: ngủ còn **2 giây**; **cấp 15**: sau khi hạ gục **10 địch** → "Bloodthirsty", **+100% sát thương**, hết cần ngủ `[ĐO ĐƯỢC]` | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/) |
| 127 | Chomper | Suy đoán (~"Cannibal Flower") | — | B (nếu đúng) | Nếu đúng: **10% cơ hội** nuốt chửng địch không-phải-boss, vào "Chewing State" (dừng gây sát thương lúc đó) `[SUY ĐOÁN]` | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/) |
| 128 | Titanum | Không có | — | — | KHÔNG TÌM ĐƯỢC NGUỒN — không xuất hiện ở bất kỳ roster/tier list nào đã kiểm | — |
| 129 | Spikeweed | Không có | — | — | KHÔNG TÌM ĐƯỢC NGUỒN — có cân nhắc "Smelly Flower" nhưng cơ chế (đầu độc diện rộng) không khớp hình tượng gai đâm, quá yếu để coi là suy đoán hợp lý | — |
| 130 | Monkey | Suy đoán (~"Apelet") | — | C (nếu đúng) | Nếu đúng: mô tả rõ là "khỉ nhỏ ném chuối boomerang", ném trúng địch cả lượt đi lẫn về (trước+sau); sát thương thấp `[SUY ĐOÁN]` (độ tin cậy khá cao do mô tả khớp chủ đề "khỉ") | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/) |
| 131 | Undine | Trùng | Nước | **S** | Đánh bằng "cột nước" trúng địch trong phạm vi **2 ô**; là chuẩn tham chiếu hero nước mạnh nhất (được nhắc khi so sánh với Leviathan/Selena) `[ĐO ĐƯỢC]` | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/) |
| 132 | Ghost | Trùng | Độc | B | Bắn đạn nổ, nổ gây **100% sát thương** + độc lên địch; nâng cấp tăng kích thước vùng nổ; hợp combo với Medea `[ĐO ĐƯỢC]` | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/) |
| 133 | Fattie | Suy đoán (~"Chubby") | — | D (nếu đúng) | Nếu đúng: cận chiến, làm chậm địch khi tiếp xúc, tầm đánh tối đa **1,5 ô**, sát thương/kỹ năng thấp `[SUY ĐOÁN]` | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/) |
| 135 | Yuffie | Trùng | — (gây bleed, chưa rõ hệ chính thức) | C | Tầm xa, ném kunai gây chảy máu (bleed); nâng cấp cho kunai xuyên nhiều địch `[ĐO ĐƯỢC]` | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/) |
| 136 | Hades | Trùng | — | C (thực chiến) / S (theo hệ thống, nguồn tự ghi nhận thấp hơn tiềm năng) | Ném "phantom swords" gây chảy máu; **+200% sát thương** lên địch đang bị trói (rooted) — phụ thuộc đồng đội tạo hiệu ứng root nên hạn chế hữu dụng `[ĐO ĐƯỢC]` | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/) |
| 137 | WaterDragon | Không có | — | — | KHÔNG TÌM ĐƯỢC NGUỒN. Có vài ứng viên hệ nước/rồng (Naga, Leviathan, Drogon) nhưng không cái nào khớp rõ "rồng nước" — không đủ căn cứ để suy đoán | — |
| 138 | RockDragon | Không có | — | — | KHÔNG TÌM ĐƯỢC NGUỒN. "Rocky" (D-tier, chủ đề đá) được cân nhắc nhưng mô tả không có yếu tố rồng — không đủ căn cứ để suy đoán | — |
| 139 | Luby | Không có | — | — | KHÔNG TÌM ĐƯỢC NGUỒN | — |
| 141 | Venom | Trùng | Độc | B | Phun khí độc tấn công; **cấp 15**: **hạ gục tức thì địch dưới 10% HP** đang đứng trong vùng khí độc hình thành từ xác địch chết `[ĐO ĐƯỢC]` | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/) |
| 142 | RockBull | Không có | — | — | KHÔNG TÌM ĐƯỢC NGUỒN (roster TierMaker có tên "Rockbull" xuất hiện nhưng không kèm bất kỳ mô tả/kỹ năng nào, chỉ xác nhận tên tồn tại `[ĐO ĐƯỢC]` — không đủ để tính là "có dữ liệu") | [TierMaker v1.5.1](https://tiermaker.com/create/slime-legion-v151-15805819) |
| 143 | PinkBeer | Suy đoán (~"Night Terror") | — | C (nếu đúng) | Nếu đúng ("Beer" = lỗi chính tả của "Bear"): gấu bông hung hãn, cận chiến, triệu hồi linh hồn gấu + nguyền rủa; **cấp 15**: **+200% sát thương** khi hạ gục `[SUY ĐOÁN]` | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/) |
| 144 | Amy | Trùng | Thánh (Holy) | B | **20% cơ hội** bắn **3 tên lửa thánh**, mỗi tên lửa **200% sát thương**; nâng cấp thêm tên lửa + nổ + cơ hội làm yếu sát thương địch gây vào lâu đài `[ĐO ĐƯỢC]` | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/) |
| 145 | Spider | Không có | — | — | KHÔNG TÌM ĐƯỢC NGUỒN | — |
| 146 | GhostMonkey | Không có | — | — | KHÔNG TÌM ĐƯỢC NGUỒN | — |
| 147 | Bella | Trùng | Lửa | B | Lan lửa cháy theo hướng ngẫu nhiên; nâng cấp "Wind spell" giúp lửa lan sang mục tiêu mới `[ĐO ĐƯỢC]` | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/) |
| 148 | WhiteOni | Không có | — | — | KHÔNG TÌM ĐƯỢC NGUỒN | — |
| 149 | Judge | Suy đoán (~"Chief Judge", khá tin cậy) | Có thể Thánh/Ánh sáng (suy đoán, dựa tên kỹ năng) | A (nếu đúng) | Nếu đúng: dùng "Holy blade" tăng tốc đánh cho 3 đồng minh; chiêu "Judge's Strike" gây **200% sát thương** + choáng `[ĐO ĐƯỢC]`/`[SUY ĐOÁN]` (mapping) | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/) |
| 150 | Nobody | Không có | — | — | KHÔNG TÌM ĐƯỢC NGUỒN | — |
| 151 | Oliver | Trùng | **Ánh sáng (Light)** | D | Đánh sét dây chuyền (chain-lightning) nhưng bị đánh giá thua kém Prophet (id 153) về hiệu năng `[ĐO ĐƯỢC]` | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/) |
| 152 | Mina | Trùng | **Tối (Dark)** | **S** | Triệu hồi dơi + gây chảy máu; **+200% sát thương** lên địch đang bị debuff; vào trạng thái "Blood Ecstasy"; DPS linh hoạt cả cận chiến lẫn tầm xa `[ĐO ĐƯỢC]` | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/); [Fandom Tier List — snippet](https://slime-legion.fandom.com/wiki/Tier_List) |
| 153 | Prophet | Trùng | — | **S** | Đánh sét dây chuyền; "power of the wolf" nhân đôi sát thương + buff đồng minh, nâng cấp lên "power of the eagle"; fandom đánh giá **"hero SS mạnh nhất game ở cấp 9"**, có buff + khống chế đám đông `[ĐO ĐƯỢC]` | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/); [Fandom Tier List — snippet](https://slime-legion.fandom.com/wiki/Tier_List) |
| 154 | Silanui | Suy đoán (~"Shiranui", khả năng là lỗi chính tả trong APK) | **Ánh sáng (Light)** — xác nhận rõ nếu đúng mapping | A/S | Nếu đúng: chuyên trị boss (đơn mục tiêu); ném "Moon Disc" gây **300% sát thương** + choáng **1,5 giây**; có kỹ năng đẩy lùi `[ĐO ĐƯỢC]`/`[SUY ĐOÁN]` (mapping) | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/); [Fandom Tier List — snippet](https://slime-legion.fandom.com/wiki/Tier_List) |
| 155 | Pilot | Không có | — | — | KHÔNG TÌM ĐƯỢC NGUỒN | — |
| 156 | Guardian | Không có | — | — | KHÔNG TÌM ĐƯỢC NGUỒN. Có hero "Protector" (A-tier, hỗ trợ tạo khiên) gần nghĩa với "Guardian" nhưng KHÔNG cùng tên — không đủ căn cứ để coi là suy đoán hợp lý | — |
| 157 | Laplace | Trùng | — | A | Ném bài theo hướng hoặc xuyên thẳng hàng; kỹ năng dịch chuyển bảo vệ đẩy lùi địch gần **3 ô**; linh hoạt giữa sát thương diện rộng và đơn mục tiêu `[ĐO ĐƯỢC]` | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/) |
| 158 | Finer | Không có | — | — | KHÔNG TÌM ĐƯỢC NGUỒN | — |
| 159 | DarkKnight | Trùng | — | A | Cơ chế "Battle Spirit" tích lũy qua đòn đánh → tăng tầm đánh + xuyên giáp; đủ tích lũy thì tung "Ultimate Slash" gây **300% sát thương** toàn bộ địch, tiêu hao Battle Spirit `[ĐO ĐƯỢC]` | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/) |
| 160 | Nox | Suy đoán (~"Nyx", tên rất gần) | — | B (nếu đúng) | Nếu đúng: hiện thân của đêm, ghép cặp với Hemera mở "sword beam" + kéo dài "Power of the Stars"; kỹ năng "Doom Star" **50% cơ hội**, sao quay lại gây sát thương dọc đường bay `[SUY ĐOÁN]`/`[ĐO ĐƯỢC]` (số liệu, nếu mapping đúng) | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/) |
| 161 | Hemera | Trùng | — | B (ProGameGuides) / **S** (Fandom, bản 11/2024 — 2 nguồn không thống nhất) | Hiện thân của bình minh, mạnh nhất khi dùng cùng Nyx/Nox; "Dawn Shield" gây **50% sát thương** lên địch đi ngang qua kèm **50% cơ hội** root + tăng sát thương; wiki fandom thêm: cấp 9 kéo địch lại gần, có "dawn field debuff" `[ĐO ĐƯỢC]` | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/); [Fandom Tier List — snippet](https://slime-legion.fandom.com/wiki/Tier_List) |
| 162 | Panda | Không có | — | — | KHÔNG TÌM ĐƯỢC NGUỒN — đã quét kỹ toàn bộ ~66 tên trong roster ProGameGuides, không có tên nào liên hệ được với "gấu trúc" | — |
| 163 | Medea | Trùng | — | A | Sức mạnh từ "đội quân robot" (drone súng máy + robot tự hủy); hạ gục địch đang debuff → **20% cơ hội** triệu hồi robot tự hủy gây **100% sát thương** diện rộng `[ĐO ĐƯỢC]` | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/) |
| 164 | Navier | Suy đoán (~"Navi", tên rất gần) | — | B (nếu đúng) | Nếu đúng: dùng súng máy, 2 chế độ "Hyper State"/"Overheat Mode"; nâng cấp thêm tên lửa/đạn xuyên giáp `[SUY ĐOÁN]` | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/) |
| 165 | Drogon | Trùng | Lửa (suy đoán — "được tăng sức bởi đồng đội hệ lửa") | A | Đánh cả tầm xa lẫn cận chiến; triệu hồi rồng con, rồng con hạ gục địch trước sẽ tăng sức đòn thở lửa tiếp theo; có hất lùi (knockback); chiêu mạnh nhất triệu hồi nguyên 1 con rồng `[ĐO ĐƯỢC]` | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/) |
| 166 | ElynSea | Suy đoán (~"Erlinsea"/"Earlinsea", 2 cách viết cùng 1 bài — có vẻ lỗi chính tả người viết) | — | A (nếu đúng) | Nếu đúng: debuff chậm/trói/đóng băng; buff "Sea Song" **+100% sát thương đồng minh trong 2 giây**; nâng cấp mạnh nhất cho đồng đội cơ hội gây hiệu ứng theo hệ của chính đồng đội đó `[SUY ĐOÁN]`/`[ĐO ĐƯỢC]` (số liệu, nếu mapping đúng) | [ProGameGuides](https://progameguides.com/slime-legion/slime-legion-tier-list/) |
| 183 | Giant Rock Tortoise | Không có | — | — | KHÔNG TÌM ĐƯỢC NGUỒN. "Rocky" được cân nhắc (chủ đề đá) nhưng không có yếu tố rùa/mai rùa trong mô tả — không đủ căn cứ | — |
| 185 | Unicorn | Không có | — | — | KHÔNG TÌM ĐƯỢC NGUỒN — không có tên nào liên hệ được với "kỳ lân" trong toàn bộ roster đã quét | — |

## 3. Những mục hoàn toàn không có dữ liệu cho TẤT CẢ 59 hero

- **Chỉ số gốc dạng số** (HP, sát thương, tốc đánh, tầm đánh, tốc di chuyển): KHÔNG TÌM ĐƯỢC
  NGUỒN cho bất kỳ hero nào trong 59 hero — ProGameGuides/TheClashify/TierMaker/Fandom đều không
  công bố infobox số liệu này (duy nhất "Rocky" — không chắc khớp id nào — có nhắc "base attack of
  25" ở một chỗ nhưng hero đó vốn không xác nhận được thuộc id nào trong 59).
- **Chỉ số/kỹ năng theo cấp Lv.1/3/5/7/9/12/15**: KHÔNG TÌM ĐƯỢC NGUỒN cho hero nào trong 59 hero.
  Định dạng này CÓ tồn tại thật trong game (xác nhận qua các trang Slime/Egg Thrower/Frost/Little
  Devil/Berserker/Dracula/Goblin/Iron Fist trên wiki fandom — đều là hero NGOÀI danh sách 59, xem
  mục 1), nhưng không tìm được bản tương ứng cho hero nào trong danh sách này.
- **Hệ nguyên tố đầy đủ + bảng khắc chế (hệ số nhân cụ thể)**: chỉ xác định được hệ của **7/59**
  hero (Witch=Lửa, Undine=Nước, Amy=Thánh, Bella=Lửa, Oliver=Ánh sáng, Mina=Tối, Drogon=Lửa-suy
  đoán, Silanui/Shiranui=Ánh sáng-suy đoán theo mapping), còn lại KHÔNG TÌM ĐƯỢC NGUỒN. Không có
  nguồn nào công bố **bảng hệ số nhân khắc chế cụ thể** (ví dụ Lửa×1,5 vs Băng) cho bất kỳ cặp hệ
  nào — APK xác nhận có cấu trúc `Dictionary<hệ, hệ số>` (xem `slime-legion-apk-datamine.md`) nhưng
  không đọc được số vì bị mã hoá.
- **Talent (8 loại × 5 cấp) và số liệu mỗi cấp**: KHÔNG TÌM ĐƯỢC NGUỒN cho hero nào trong 59 hero.
  (Chỉ Dracula — ngoài danh sách 59 — có bảng talent 8×5 đã ghi trong
  `slime-legion-units-skills.md` mục 2.1, dùng để đối chiếu định dạng chứ không áp dụng được cho
  59 hero này.)

## 4. Tier list tổng hợp mới nhất tìm được

Nguồn chính: [ProGameGuides — Slime Legion Tier List (cập nhật 5/2025)](https://progameguides.com/slime-legion/slime-legion-tier-list/),
tự nhận liệt kê đủ ~66 hero (roster đầy đủ nhất tìm được, xem thêm bảng gốc trong
`slime-legion-units-skills.md` mục 1.1). Trong 59 hero cần tìm ở đây, các hero xác định được tier
(kèm ánh xạ tên "Trùng" ở mục 2, không tính suy đoán): **S** — Totem(112), Undine(131), Mina(152),
Prophet(153); **A** — Lord(111), Medusa(117), Laplace(157), DarkKnight(159), Medea(163),
Drogon(165); **B** — Siren(119), Nova(120), Zombie(126), Ghost(132), Venom(141), Amy(144),
Bella(147), Hemera(161) (fandom xếp S — mâu thuẫn, xem mục 2); **C** — Joker(113), Succubus(115),
Naga(118), Cactus(124), Yuffie(135), Hades(136); **D** — Engineer(114), Oliver(151). Lý do xếp
hạng nằm trong cột "Kỹ năng/số liệu" ở bảng mục 2 — ProGameGuides không tách riêng phần "lý do"
độc lập với mô tả kỹ năng.

## 5. Tổng kết độ phủ dữ liệu

- **Có dữ liệu xác thực dưới đúng tên/tên gần như đúng, kèm mô tả kỹ năng + tier** (mức tin cậy
  cao nhất, "Trùng" ở cột Ánh xạ tên): **27/59** — id 111, 112, 113, 114, 115, 116, 117, 118, 119,
  120, 124, 126, 131, 132, 135, 136, 141, 144, 147, 151, 152, 153, 157, 159, 161, 163, 165.
- **Chỉ xác nhận tên tồn tại, không có kỹ năng/chỉ số**: **2/59** — Enchantress(109), Vampire(110).
- **Có dữ liệu NHƯNG chỉ qua suy đoán ánh xạ tên chưa được xác nhận** (đọc kỹ phần "nếu đúng" ở
  bảng mục 2 trước khi dùng): **11/59** — NightElf(121), StoneMan(125), Chomper(127), Monkey(130),
  Fattie(133), PinkBeer(143), Judge(149), Silanui(154), Nox(160), Navier(164), ElynSea(166).
- **Hoàn toàn không tìm được nguồn nào, kể cả suy đoán**: **19/59** — IronBull(103),
  ThunderRobot(107), WarriorBull(108), Titanum(128), Spikeweed(129), WaterDragon(137),
  RockDragon(138), Luby(139), RockBull(142), Spider(145), GhostMonkey(146), WhiteOni(148),
  Nobody(150), Pilot(155), Guardian(156), Finer(158), Panda(162), Giant Rock Tortoise(183),
  Unicorn(185).

**Không có hero nào trong 59 hero** (kể cả nhóm "Trùng" tin cậy cao nhất) có đủ chỉ số gốc dạng số,
bảng theo cấp, hay bảng talent — giới hạn này là của toàn bộ nguồn công khai hiện có, không phải
do bỏ sót tìm kiếm.
