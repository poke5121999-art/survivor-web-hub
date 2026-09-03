# Slime Legion — Gacha, bậc hiếm hero, gói nạp (nguồn cộng đồng/wiki/store)

> Game: **Slime Legion** (Perfeggs Technology, `com.hero.may.cry.adventure.game`, phát hành 2/2023).
> Không nhầm với "Legend of Slime", "Slime Legends", "Slime Force".
> File này **bổ sung góc nhìn cộng đồng/wiki/store** cho phần "Monetization" đã đào được từ APK
> ở `slime-legion-apk-datamine.md` mục 6 và 9 — xem file đó để đối chiếu `[ĐO TỪ APK]`.
>
> Nhãn dùng trong file này: `[ĐO ĐƯỢC]` (có nguồn, đọc trực tiếp) / `[SUY ĐOÁN]` (suy luận từ nhiều
> nguồn không hoàn toàn khớp nhau) / **KHÔNG TÌM ĐƯỢC NGUỒN**.
>
> ⚠️ **Cảnh báo nguồn quan trọng**: `slime-legion.fandom.com` **chỉ có 26 trang tổng cộng**
> ([Shiranui — sidebar "26 pages"](https://slime-legion.fandom.com/wiki/Shiranui)), và phần lớn
> tên hero trong danh sách 11 hero cần xác minh **không có trang riêng** trên wiki này (trang tồn
> tại nhưng rỗng nội dung — chỉ có khung điều hướng, không có bài viết thật). Trang duy nhất có
> nội dung thật cho một hero trong nhóm 11 là **Tier List** (bảng cộng đồng, xem mục 3).
> `theclashify.com` là site SEO tổng hợp — bài Slime Legion của họ **còn sót nguyên văn "Defense
> Derby" / "Defence Derby"** ở phần mở đầu (tên một game khác), cho thấy bài bị tái sử dụng
> template từ game khác rồi nhét tên hero Slime Legion vào — coi khung tier S/A/B của riêng site
> này là **độ tin cậy thấp**, nhưng phần infobox riêng cho Dracula (Rarity/Unlock/Summon) thì khớp
> với dữ liệu từ `slime-legion.fandom.com`, nên phần đó vẫn dùng được.

---

## 1. Cơ chế "gacha" thật sự — KHÔNG PHẢI hệ thống tỉ lệ quay thẻ

`[ĐO ĐƯỢC]` Ba nguồn độc lập đều mô tả **cùng một cơ chế**, không nguồn nào nhắc tới "tỉ lệ SSR
X%" hay "pity mốc N lần" kiểu gacha cổ điển:

- **Ghép ô (merge) ra rương** → rương cho **mảnh hero** (shard), không phải thẻ quay thẳng.
  ("Once a monster is unlocked, their Monster Shards will become obtainable from Chests, AFK Gains
  and stage clear rewards" — [Slime Legion Wiki, trang Dracula](https://slime-legion.fandom.com/wiki/Dracula),
  qua snippet WebSearch, vì fetch trực tiếp domain này trả 402).
- **Số mảnh cần để mở khoá hero khác nhau theo từng hero** — ví dụ Goblin cần 10 mảnh, Berserker/
  Iron Fist/Dracula cần 5 mảnh mỗi con ([Slime Legion Wiki, snippet WebSearch từ trang Goblin/
  Berserker/Iron Fist/Dracula](https://slime-legion.fandom.com/wiki/Dracula)).
- **Độ hiếm của rương phụ thuộc độ dài chuỗi ghép**: ghép-5 xu (Coin) ra rương hiếm nhất (màu tím),
  cho kỹ năng mạnh nhất — ("A match-5 chest can give skills of the highest rarity (purple), which
  have the most powerful effects" — [Slime Legion Wiki, Slime Legion Starter Guide](https://slime-legion.fandom.com/wiki/Slime_Legion_Starter_Guide),
  đọc trực tiếp qua proxy r.jina.ai vì domain gốc bị chặn fetch trực tiếp).
  → Khớp 100% với dữ liệu `skill_box_1/2/3` trong `slime-legion-apk-datamine.md` mục 10 (ghép càng
  nhiều ô, bảng rơi kỹ năng càng tốt) — hai nguồn độc lập (APK và wiki) xác nhận cùng một quy luật.

**Kết luận**: hệ thống "gacha" của Slime Legion là **thu thập mảnh (shard) qua rương ghép ô /
AFK / thưởng ải**, không phải "quay 1 lần / quay 10 lần tốn gem" như game gacha thẻ bài thông
thường. Đây có thể là lý do KHÔNG tìm thấy trang "Summon Rates" hay "Gacha" nào trên wiki hoặc
site cộng đồng — khái niệm "tỉ lệ ra bậc hiếm" theo % có thể không tồn tại trong game này (rương
cho mảnh theo tỉ lệ ẩn, không công bố), hoặc có tồn tại nhưng nằm trong `config/table.bytes` mã
hoá mà `slime-legion-apk-datamine.md` chưa giải được.

## 2. Tỉ lệ triệu hồi theo bậc & mốc pity

**KHÔNG TÌM ĐƯỢC NGUỒN.** Không wiki, không site guide, không đánh giá Store nào công bố % ra
từng bậc hiếm hay mốc pity/bảo hiểm cho hệ thống rương/mảnh. Cơ chế pity gần nhất tìm được là
`SafetySkills` (bảo hiểm kỹ năng, không phải bảo hiểm hero) đã ghi trong `slime-legion-apk-datamine.md`
mục 3, dựa trên APK chứ không phải nguồn cộng đồng.

## 3. Giá triệu hồi (gem/vé)

**KHÔNG TÌM ĐƯỢC NGUỒN** số gem hay vé cụ thể cho 1 lần/10 lần triệu hồi. Do cơ chế là thu thập
mảnh qua rương (mục 1) chứ không phải quay thẳng bằng gem, khái niệm "giá 1 lần quay" có thể không
áp dụng trực tiếp — nhưng cũng có thể game có thêm một cửa hàng đổi mảnh bằng gem mà không nguồn
nào tìm thấy nhắc tới.

## 4. Bậc hiếm hero — tên gọi chính thức

`[ĐO ĐƯỢC]` Có ít nhất **một hạng "S-rank" là tên rarity chính thức trong game**, dùng cho cả
Dracula lẫn Hades — hai nhân vật **không mạnh nhất** theo đánh giá gameplay, chứng minh "rarity"
(độ hiếm) và "tier" (sức mạnh thực chiến) là **hai trục khác nhau** trong cộng đồng Slime Legion:

- "Dracula, the dark force of the night, is one of the first **S-rank monsters** that players can
  unlock in Slime Legion. **Rarity: S-rank**" — nhưng site guide xếp Dracula chỉ ở **B-Tier gameplay**
  ([Pro Game Guides, Slime Legion Tier List](https://progameguides.com/slime-legion/slime-legion-tier-list/),
  đọc qua proxy r.jina.ai; cũng lặp lại ở [theclashify.com](https://theclashify.com/slime-legion-tier-list-wiki/)).
- "**Hades is the game's S-Tier character** that I would rank the lowest [C-Tier gameplay]"
  ([Pro Game Guides, cùng bài trên](https://progameguides.com/slime-legion/slime-legion-tier-list/)).

`[SUY ĐOÁN]` Không nguồn nào liệt kê đủ **thang bậc hiếm hoàn chỉnh** (kiểu N/R/SR/SSR hay 1-5 sao).
Chỉ thấy nhắc "S-rank" như bậc cao, và "hộp/kỹ năng màu tím" là độ hiếm cao nhất cho **skill**
(không phải cho hero) ở mục 1. Không đủ bằng chứng để khẳng định có bao nhiêu bậc hero tất cả.

## 5. Ba bảng "tier list" cộng đồng — MÂU THUẪN NHAU, không phải bảng rarity chính thức

Quan trọng: cả ba bảng dưới đây là **xếp hạng sức mạnh gameplay do cộng đồng tự làm**, không phải
bảng tỉ lệ gacha hay bậc hiếm chính thức của nhà phát hành. Ba nguồn cho ba kết quả khác nhau:

### 5a. Slime Legion Wiki (Fandom) — Tier List, làm bởi "Shukaku", Discord cộng đồng, 11/2024
`[ĐO ĐƯỢC]` (đọc trực tiếp qua proxy r.jina.ai, bảng chỉ có hạng S được điền, hạng A trở xuống
để trống trên trang thật — không phải do tôi cắt bớt)

**S-Tier**: Prophet, Shiranui, Nemo, Hemera, Rabi, Sivir, Mina, Dracula, Laplace, Little Deer.
([Slime Legion Wiki, Tier List](https://slime-legion.fandom.com/wiki/Tier_List))

### 5b. Pro Game Guides — Slime Legion Tier List, 7/2024
`[ĐO ĐƯỢC]` (đọc qua proxy r.jina.ai)

- **S**: Angie, Aurora, Brawler, Mina, Prophet, Totem, Undine, Wine Sage
- **A**: Chief Judge, Crack Rock, Dark Knight, Dread Lord, Drogon, Egg Thrower, Erlinsea, Laplace,
  Ghost Butterfly, Medea, Medusa, Protector, Selena, Shiranui, Smelly Flower, Witch
- **B**: Amy, Bella, Berserker, Cannibal Flower, Dark Elf, Dracula, Fenrir, Ghost, Grinch, Hemera,
  Lurker, Navi, Nemo, Nova, Nyx, P.Bot, Siren, Venom, Zombie
- **C**: Apelet, Blackhat, Cactus, Clown, Death, Frost, Hades, Iron Fist, Little Deer, Little Devil,
  Mummy, Naga, Night Terror, Rabi, Slime, Succubus, Yuffie
- **D**: Chubby, Engineer, Goblin, Leviathan, Oliver, Rocky

([Pro Game Guides, Slime Legion Tier List](https://progameguides.com/slime-legion/slime-legion-tier-list/))

### 5c. TheClashify — độ tin cậy thấp (nghi bài tái sử dụng từ game khác)
`[ĐO ĐƯỢC]` nhưng gắn cờ nghi ngờ — bài mở đầu còn nguyên cụm "Defence Derby heroes" / "Defense
Derby characters" (tên game khác), gợi ý nội dung bị dán đè từ template có sẵn:

**S**: Undine, Lurker, Rabi. **A (13-12 "coins")**: Dracula, Amy, Ghost Butterfly, Zombie, Dark Elf.
**B (11-10 "coins")**: Ghost, Cannibal Flower, Hades, Nova, Dread Lord, Smelly Flower, Witch, Blackha.
([theclashify.com](https://theclashify.com/slime-legion-tier-list-wiki/))

### So sánh: 3 bảng lệch nhau đáng kể trên chính các hero trùng tên
Ví dụ rõ nhất — **Hemera**: S-Tier ở bảng Fandom (5a), B-Tier ở Pro Game Guides (5b). **Rabi**:
S-Tier ở Fandom (5a) và TheClashify (5c), nhưng C-Tier ở Pro Game Guides (5b). **Little Deer**:
S-Tier ở Fandom (5a), C-Tier ở Pro Game Guides (5b). **Dracula**: S-Tier ở Fandom (5a), nhưng chỉ
B-Tier gameplay ở Pro Game Guides dù rarity là "S-rank" (xem mục 4). → Không có "bảng tier list"
nào đáng tin cậy tuyệt đối; đây là quan điểm cộng đồng/reviewer cá nhân, thời điểm khác nhau
(3/2024, 7/2024, 11/2024), không phải số liệu nhà phát hành công bố.

## 6. Đối chiếu nhóm 11 hero "cao cấp" (suy từ APK) với 3 bảng tier list — CÂU TRẢ LỜI CHO YÊU CẦU XÁC MINH

Nhóm 11 hero từ `slime-legion-apk-datamine.md` (chuỗi gói ngắn nhất + CD 720 phút — suy đoán là
hero cao cấp nhất): **Medusa, Mina, Prophet, Silanui, Nox, Hemera, Panda, Medea, Navier, Drogon,
ElynSea**.

| Hero (APK) | Tên khớp trên wiki | Fandom Tier List (5a) | Pro Game Guides (5b) | TheClashify (5c) |
|---|---|---|---|---|
| Mina | Mina | **S** | **S** | không có mặt |
| Prophet | Prophet | **S** | **S** | không có mặt |
| Silanui | Shiranui | **S** | A | không có mặt |
| Hemera | Hemera | **S** | B | không có mặt |
| Medusa | Medusa | không có mặt | A | không có mặt |
| Medea | Medea | không có mặt | A | không có mặt |
| Drogon | Drogon | không có mặt | A | không có mặt |
| ElynSea | Erlinsea | không có mặt | A | không có mặt |
| Navier | Navi (?) | không có mặt | B | không có mặt |
| Nox | — | **không tìm thấy ở bất kỳ nguồn nào** | — | — |
| Panda | — | **không tìm thấy ở bất kỳ nguồn nào** | — | — |

**Trả lời trực tiếp**: **KHÔNG** — wiki/cộng đồng **không** gọi nguyên nhóm 11 hero này là "bậc
hiếm nhất" theo một bảng rarity thống nhất nào. Kết quả xác minh được:
- Chỉ **4/11** hero (Mina, Prophet, Silanui, Hemera) xuất hiện ở hạng **S** của ít nhất một bảng
  tier list cộng đồng, và chỉ **2/11** (Mina, Prophet) được **cả hai** bảng 5a và 5b đồng thuận S-Tier.
- **5/11** hero (Medusa, Medea, Drogon, ElynSea, Navier) chỉ đạt **A hoặc B-Tier** ở Pro Game Guides,
  không xuất hiện trong bảng Fandom (vốn chỉ liệt kê 10 hero S-Tier, chưa điền A/B/C).
- **2/11** hero (**Nox, Panda**) **không xuất hiện ở bất kỳ nguồn wiki/guide nào** tìm được — có
  thể là hero mới hơn thời điểm các bài viết này được viết (Fandom 11/2024, Pro Game Guides 7/2024),
  hoặc tên hiển thị trong game khác với tên nội bộ `Nox`/`Panda` lấy từ APK.
- Quan trọng hơn: **các bảng tier-list này đo "sức mạnh gameplay" theo đánh giá cá nhân/cộng đồng,
  không phải "độ hiếm" (rarity) hay "giá gacha"** — trong khi nhóm 11 hero từ APK được suy ra từ
  **độ dài chuỗi gói nạp và cooldown** (một tín hiệu về giá bán/độ hiếm thương mại, không phải sức
  mạnh chiến đấu). Hai trục này **không nhất thiết trùng nhau** (xem ví dụ Dracula/Hades ở mục 4:
  rarity "S-rank" nhưng gameplay tier B/C). Vì vậy dữ liệu cộng đồng hiện có **không đủ để xác nhận
  hay bác bỏ** giả thuyết "11 hero này là bậc hiếm nhất" — chỉ có thể nói rằng phần lớn trong số họ
  được cộng đồng đánh giá tốt (S hoặc A-Tier), nhưng không phải toàn bộ, và khái niệm "bậc hiếm"
  theo đúng nghĩa gacha (rate gợi ý %) không được xác nhận từ nguồn nào ngoài APK.

## 7. Nội dung & giá các gói nạp

`[ĐO ĐƯỢC]` Cùng một bộ SKU (tên IAP nội bộ) xuất hiện ở 3 nguồn độc lập (App Store US, Google
Play snippet, App Store Philippines) — xác nhận đây là ID gói thật của game, khớp quy ước đặt tên
với `GiftTriggerConfig` trong APK (`slime-legion-apk-datamine.md` mục 6, ví dụ chuỗi `gift_chain`
20001-20009 cho gói thất bại):

### App Store (US, giá USD) — [Apple App Store, Slime Legion](https://apps.apple.com/us/app/slime-legion/id1664686966)

| SKU | Giá USD |
|---|---|
| NEVERGIVEUPGIFT_V1 | $0.99 |
| SAMLLPACK_V2 | $4.99 |
| Periodic Purchase | $4.99 |
| GROWTH_SMALL_FUND | $6.99 |
| SUPPLYPACK_V2 | $6.99 |
| SUPPLYPACK_V3 | $9.99 |
| Pass Activity | $9.99 |
| BATTLEPASS | $11.99 |
| ADVANCEBATTLEPASS | $14.99 |
| EXPERTGIFTPACK_V2_1 | $19.99 |

### App Store (Philippines, giá PHP) — cùng game, đối chiếu chéo

| SKU | Giá PHP |
|---|---|
| NEVERGIVEUPGIFT_V1 | ₱49,00 |
| SAMLLPACK_V2 | ₱299,00 |
| SUPPLYPACK_V2 | ₱449,00 |
| SUPPLYPACK_V3 | ₱599,00 |
| EXPERTGIFTPACK_V2_1 | ₱1.290,00 |
| EXTREMEGIFTPACK_V2 | ₱5.990,00 (SKU này không thấy ở bản US — có thể là gói cao cấp hơn, hoặc
  bản US danh sách bị cắt bớt khi hiển thị) |

### Google Play (snippet, có thể là giá khác server/khu vực hoặc gói khác)

`[ĐO ĐƯỢC]` GROWTH_FUND $39,99, BATTLEPASS $19,99, ADVANCEBATTLEPASS $29,99, SUPPLYPACK_V2 $12,99.
⚠️ Giá này **khác** với bản App Store US ở trên cho cùng tên gói (BATTLEPASS $19,99 so với $11,99,
ADVANCEBATTLEPASS $29,99 so với $14,99, SUPPLYPACK_V2 $12,99 so với $6,99) — chưa rõ do lệch thời
điểm crawl, lệch khu vực định giá, hay đây là gói "GROWTH_FUND" (khác `GROWTH_SMALL_FUND` ở bản US)
tức 2 SKU riêng cho 2 mốc giá của cùng một loại "quỹ tăng trưởng". Không tìm được nguồn giải thích
chênh lệch này — ghi nhận cả hai, không chọn số nào là "đúng".

**Nội dung cụ thể mỗi gói** (số gem/vàng/mảnh hero bên trong): **KHÔNG TÌM ĐƯỢC NGUỒN.** Không
listing Store, không review, không wiki nào liệt kê rõ "gói X gồm bao nhiêu gem + bao nhiêu vàng +
mảnh hero nào". Chỉ có tên gói và giá.

**Xác nhận có cơ chế loot box**: Google Play gắn nhãn nội dung "**Loot Boxes**" cho app, và mục
Data Safety/Store xác nhận có thu thập "Purchase History" (lịch sử mua) — [Google Play, Slime
Legion](https://play.google.com/store/apps/details?id=com.hero.may.cry.adventure.game&hl=en_US)
(nội dung "About this game" đọc được qua proxy r.jina.ai xác nhận đúng game, mô tả "Merge your
monsters! Set your favorite lineup! Protect your castle!").

## 8. Sự kiện / banner giới hạn thời gian

`[ĐO ĐƯỢC]` Mục "What's new" trên trang Google Play (crawl gần bản cập nhật 26/8/2026) liệt kê các
mốc/sự kiện sắp ra mắt: **"[New Hero: Rhea] Coming Soon"**, "[New Lord: Sharma] Coming Soon",
"[Maple Leaf Kaleidoscope] Coming Soon", **"[Back-to-School UP Week] Coming Soon"**, "[Autumn
Harvest Festival] Coming Soon", "[Mid-Autumn Match-Up] Coming Soon", "[Lost Treasure Map] Coming
Soon" — ([Google Play, Slime Legion, mục What's new](https://play.google.com/store/apps/details?id=com.hero.may.cry.adventure.game&hl=en_US)).

`[SUY ĐOÁN]` Tên gọi **"UP Week"** ("tuần tăng tỉ lệ") gần như chắc chắn ám chỉ **banner rate-up
theo hero mới** kiểu gacha chuẩn (thuật ngữ "UP" = rate-up là quy ước phổ biến toàn ngành gacha),
và việc mỗi bản cập nhật đi kèm 1 hero mới + 1 sự kiện theo mùa xác nhận **có nhịp phát hành hero
giới hạn thời gian đều đặn**. Nhưng **không tìm được tỉ lệ rate-up cụ thể** (bao nhiêu % tăng, badge
"guarantee" bao nhiêu roll) từ bất kỳ nguồn nào.

## 9. Shop hằng ngày

**KHÔNG TÌM ĐƯỢC NGUỒN** cụ thể (bán gì, làm mới mấy lần/ngày, giá vàng/gem). Manh mối gián tiếp
duy nhất là một review Google Play: "the 'free' daily rewards in the shop requires you to watch
**8 ads** for them all" ([Google Play, review "Nick S", 23/9/2024](https://play.google.com/store/apps/details?id=com.hero.may.cry.adventure.game&hl=en_US))
— cho thấy có mục quà miễn phí hằng ngày gắn với quảng cáo, không phải giá vàng/gem, nhưng không
xác nhận đây có phải "shop" chính hay chỉ là một khay quà riêng.

## 10. Đánh giá cộng đồng — mức độ pay-to-win

`[ĐO ĐƯỢC]` Trích trực tiếp review Google Play (đọc qua proxy r.jina.ai, 63.100 lượt đánh giá tính
đến thời điểm crawl):

- *Sarah Rose, 8/8/2025 (71 người thấy hữu ích)*: "**Fun, clever, predatory**... What I do mind is
  how immediately and loudly this game screams for money. Packs, boosters, game pass esc mechanics,
  even events want me to tap that pay now button."
- *Nick S, 23/9/2024 (150 người thấy hữu ích)*: "Even at **chapter 2** (with chapter 1 basically
  being the tutorial chapter), enemies become too tanky for the resources and starting equipment
  you're given. You end up having to fail multiple times..." — **mốc nghẽn sớm nhất được cộng đồng
  ghi nhận: ngay chương 2** nếu không đầu tư.
- *Joshua Cobb, 8/8/2026*: "Purchased various passes and items... totaling around **$75
  cumulatively**" — dữ liệu thực chi tiêu của 1 người chơi thật, không phải ước tính.

Ngoài ra, một tìm kiếm WebSearch trước đó (không giữ được URL cụ thể, chỉ có bản tóm tắt do công cụ
search tổng hợp) ghi nhận có reviewer khác nói "completing the game without paying is impossible
once reaching **stage 13**" — gắn nhãn `[ĐO ĐƯỢC]` yếu vì tôi không tự đọc được nguyên văn review
này, chỉ có bản diễn giải qua tóm tắt của công cụ tìm kiếm; coi đây là **tín hiệu tham khảo**, không
phải trích dẫn nguyên văn đã kiểm chứng.

→ **Mức pay-to-win theo cộng đồng**: nặng, được nhiều review độc lập gọi thẳng là "predatory" và
"pay to win", với mốc nghẽn được nhắc tới sớm nhất là **chương 2** (theo 1 review) và **stage 13**
(theo 1 tóm tắt tìm kiếm chưa xác minh trực tiếp).

---

## 11. Tổng kết — những gì còn thiếu

| Câu hỏi gốc | Trả lời |
|---|---|
| Tỉ lệ gacha theo bậc | KHÔNG TÌM ĐƯỢC NGUỒN — game dùng cơ chế mảnh (shard) từ rương, không phải % quay thẳng |
| Pity/bảo hiểm, mốc bao nhiêu lần | KHÔNG TÌM ĐƯỢC NGUỒN (ngoài `SafetySkills` đã có trong APK, khác phạm trù) |
| Giá 1 lần/10 lần quay | KHÔNG TÌM ĐƯỢC NGUỒN |
| Tên gọi bậc hiếm hero | Một phần — xác nhận có "S-rank" là rarity thật (Dracula, Hades), nhưng không rõ đủ thang bậc |
| Nội dung từng gói nạp | Một phần — có tên SKU + giá 3 khu vực, KHÔNG có nội dung gem/vàng/mảnh bên trong |
| Banner giới hạn + rate-up % | Một phần — xác nhận có nhịp "hero mới + UP Week" mỗi bản cập nhật, không có số % |
| Shop hằng ngày | KHÔNG TÌM ĐƯỢC NGUỒN (trừ 1 manh mối "8 ads" cho quà free) |
| Mức P2W & mốc nghẽn | Có — nhiều review độc lập, mốc chương 2 (chắc chắn) và stage 13 (chưa xác minh trực tiếp) |
| **11 hero "cao cấp" (APK) có phải bậc cao nhất theo wiki?** | **KHÔNG xác nhận được toàn bộ** — chỉ 2-4/11 khớp S-Tier tuỳ bảng, 2/11 (Nox, Panda) không tìm thấy ở nguồn nào, và khái niệm "tier gameplay" của cộng đồng khác với "độ hiếm thương mại" suy từ APK |
