# Chợ Phiên: luật và số của The Bazaar đã đối chiếu

Chợ Phiên làm lại The Bazaar (Tempo Storm) từ bản demo trên Steam. Tệp này gom các luật và con số đã kiểm với nguồn gốc. Mỗi dòng ghi nguồn để đợt sau khỏi phải đo lại.
Cách bóc art, tiếng và dữ liệu nằm ở `tools/README.md`. Kế hoạch theo pha nằm ở `brain/plans/bazaar-web.md`.

Nhãn dùng trong tệp:
- `[ĐO TRONG REPO]`: chạy hoặc đọc mã/dữ liệu của bản demo mà ra.
- `(wiki)`: đọc ở wiki hoặc trang hướng dẫn, chưa chạy thử.
- `[ĐỀ XUẤT]`: số tự đặt, vì bản demo để nó trên máy chủ.

## Nguồn

- Mã C# dịch ngược và dữ liệu của bản demo, bóc ra `D:\bazaar-ref\src` và `D:\bazaar-ref\db\json` (ngoài repo). `GameData.db` là SQLite, mỗi dòng là JSON, phải mở bằng `py -3.12`.
- Wiki: https://thebazaar.wiki.gg (trang Level_Up, Monsters, Burn, Haste...). Wiki tự ghi là có phần cũ. curl bị Cloudflare chặn, WebFetch đọc được.
- Mobalytics (day-guide, beginner-guide, start-of-run-guide). Một số trang trả 403.
- Clip YouTube có mốc giờ: `D:\bazaar-ref\notes\clips\*.md`.
- Báo cáo khảo sát đợt 2026-10-20, mỗi khác biệt có mã: `D:\bazaar-ref\notes\audit\{RUN,COMBAT,CONTENT,UI,FX,ASSET}.md`.

## Vòng chơi

- Một ngày có 6 giờ. Giờ 0, 1, 3, 4 là thương nhân, sự kiện hoặc lựa chọn miễn phí. Giờ 2 là PvE, chọn 1 trong 3 quái. Giờ 5 là PvP. (wiki Monsters, Mobalytics day-guide)
- Khởi đầu: 8 vàng, thu nhập 5. Income Start cho tổng 20 vàng và thu nhập 7. Enchanted Start cho một món Small bậc Đồng đã yểm bùa. Skill Start cho một kỹ năng. (Mobalytics start-of-run-guide)
- XP: +1 mỗi giờ, 8 XP lên một cấp. Máu theo `level_ups.json`, cấp 1 là 300. [ĐO TRONG REPO]
- Phần thưởng lên cấp đi theo **cấp**, không theo ngày. Bảng `LEVEL_REWARDS` trong `js/run/tuning.js`, lấy từ wiki Level_Up. Thầy kỹ năng có đổi hàng: Pip 2 vàng, Argenta 3, Orlin 6, Adira 8, Zosima 8 (`RerollRules` trong `cards.json`). [ĐO TRONG REPO]
- Quái giờ PvE theo danh sách từng ngày của wiki Monsters (`PVE_BY_DAY`). Ngày 1 không có quái Vàng. Từ ngày 11 có thêm quái boss cấp 11 đến 15. (wiki)
- Thua quái vẫn giữ vàng theo phần máu đã đánh. Dữ liệu demo không có XP khi thua (`RewardDefeat.ExperienceReward` bằng 0 trên cả 170 thẻ trận). Bản web cho XP nếu đã hạ ít nhất 50% máu quái. [ĐỀ XUẤT]
- Thua PvP mất uy tín bằng số ngày. Run hết khi đủ 10 thắng hoặc hết uy tín; không giới hạn 10 ngày. (`BazaarDeckTools.cs:2024-2035`, clip `oVtvrCdqHEE?t=652`)
- Fates: uy tín về 0 lần đầu thì được cứu, chọn một trong các bước thật của Futura: Fate's Bounty (20 vàng, 5 XP), Crossroads, Legacy, Fortunes. [ĐO TRONG REPO]
- Hợp nhất: mua món cùng id cùng bậc (dưới Kim cương) thì món cũ lên một bậc. Kỹ năng cũng hợp nhất như vậy (`SkillCard.CanFuseWith`). [ĐO TRONG REPO]
- Lựa chọn "(if you have a Food)" và tương tự bị ẩn khi bàn và kho không có món đó. [ĐO TRONG REPO]
- Bậc Huyền thoại của gặp gỡ (Freiya, Statia, bệ Huyền thoại) chỉ xuất hiện từ ngày 8, tỉ lệ 3%, 5%, 8%. [ĐỀ XUẤT] vì bảng thật nằm trên máy chủ.

## Combat

- Khung mô phỏng 50 ms, trận tối đa 120 s (`BazaarConstants.cs:23,25`).
- Bỏng nhảy 2 lần mỗi giây, Độc và Hồi máu 1 lần mỗi giây (`tooltips.json`).
- Còn Khiên (dù chỉ 1) thì cả nhịp Bỏng chỉ còn một nửa, trừ Khiên trước rồi tới máu (wiki Burn). Độc bỏ qua Khiên.
- Bỏng giảm khoảng 4,5% mỗi nhịp, tối thiểu 1. Chỉ hệ số trong khoảng [0,04375; 0,04605) khớp chuỗi 80, 76, 73, 70, 67 của clip `5X-G7Jf3t5w?t=64`. [ĐO TRONG REPO]
- Món đang Đóng băng không kích hoạt được, kể cả khi bị Charge đầy hồi chiêu (`tooltips.json` Freeze, bản 5.0.0).
- Haste, Slow, Freeze ưu tiên món chưa bị ảnh hưởng và có hồi chiêu. (wiki Haste)
- Bão cát bắt đầu ở giây 30, nhịp 1 s, mỗi nhịp tăng 2 sát thương (khớp khoảng +1,8/s của clip `hV5vwlc_tBE?t=100`). [ĐỀ XUẤT]
- Transform đổi mẫu thẻ tại chỗ tới hết trận, giữ bậc và bùa nếu mẫu mới có. Bảng kết quả biến hình `TF_RULES` trong `js/sim/actions.js` suy từ tooltip, vì `SpawnContext` của bản demo chỉ còn `Limit`. [ĐỀ XUẤT]
- Đòn kết liễu: 5 khung cuối chạy ở tốc độ 0,2, giữ 2,5 s, hồi lại trong 1 s. Chỉ ảnh hưởng hình, không đổi kết quả (`FinalBlowSlowDownController.cs:9-20`).
- Nhạc combat đổi cường độ theo trung bình phần máu còn lại của hai bên (`SoundManager.cs:807-823`).

## Asset

- Bản demo có 931 bundle Addressables, 5,7 GB. Bản web lấy art gốc cho thẻ, chân dung, khung, nút, thanh máu, đồng hồ, bàn. Hero ở sảnh chạy Spine gốc (4.2.43) bằng `@esotericsoftware/spine-webgl@4.2.119`.
- Art thẻ và chân dung gặp gỡ 512 px (gốc 1024 px). Lý do: cả hub là một site GitHub Pages; repo đã khoảng 1,2 GB, quá trần mềm 1 GB của Pages. Đưa bản 1024 px lên cần thêm khoảng 120 MB. [ĐO TRONG REPO, 2026-10-20]
- 11 món và 1 kỹ năng không có art trong chính game gốc. Bản web giấu chúng khỏi mọi pool (`HIDDEN_CARDS` trong `js/run/tuning.js`), thay vì vẽ ảnh thay thế.
- The Dragons (hero thứ 8, ra ở bản 19.0 ngày 7/10/2026) không có thẻ nào trong `GameData.db` của bản demo, nên vẫn khoá.

## Điện thoại

- Sân khấu là một khung 1920×1080 co giãn. Ở 844×390, co cả sân còn 0,361, thẻ nhỏ chỉ rộng 39 px CSS và hai bên dư dải đen. [ĐO TRONG REPO, 2026-10-22]
- Chiều cao màn là chỗ nghẽn, chiều ngang dư. Hai hàng bàn chỉ chiếm 480 trong 1080 px sân, phần còn lại là hai dải chân dung trên và dưới.
- Nên khi màn nhỏ (co cả sân dưới 0,62) và đang trong run, `V.fit` (`js/view/stage.js`) dùng camera `V.CAM.phone`. Camera cắt sát hai hàng bàn, còn hai dải chân dung thu lại `V.BAND.k` = 0,55 quanh mép bàn. Thẻ nhỏ lên 54 px ở 844×390 và 47 px ở 844×340 (có thanh địa chỉ, trước là 34 px).
  - Phần tử của dải nằm trong `.bz-band` (div 0×0, `transform-origin` là tâm thu), nên dời một khối không phải sửa toạ độ từng con.
  - HUD của dải nằm ở lớp khác (`.rs-merchant-ctl`, `.rs-level`, `.rs-xp`) thu cùng `--pk` trong `css/run.css`. Chữ và nút trong dải được phóng lại ở đó.
  - `V.vis` là vùng đang thấy. Tooltip, bảng giải thích và số nổi kẹp vào đây, không kẹp vào 1920×1080. Nút neo góc sân dời vào trong bằng `--vt/--vr/--vb`.
  - `V.heroRect`, `V.hpRect` đi qua `V.band`, vì đạn và số nổi bay tới chân dung đã dời.
- Sảnh, màn hết run vẫn co cả sân, vì bố cục của chúng trải hết 1920×1080.
- Bấm Sẵn sàng trên máy cảm ứng thì xin toàn màn hình, vì thanh địa chỉ ăn khoảng 15% chiều cao màn ngang. iPhone Safari không có API này nên bỏ qua.

## Cái bẫy đã sập

- `[BẪY ĐÃ SẬP]` Thẻ có hồi chiêu bị phủ xám ở màn thương nhân. Màn hồi chiêu (`.veil`) mặc định hiện, nên thẻ chưa vào trận cũng xám. Nay nó chỉ bật khi replay gọi `C.update` (`js/view/card.js`).
- `[BẪY ĐÃ SẬP]` Ghi chú cũ trong `tuning.js` nói Fates "không có bước con", nên bản web đã tự chế "Second Wind" và "Golden Gift". DB thật có bốn bước của Futura. Trước khi tự chế, tìm bằng tên trong `cards.json`.
- `[BẪY ĐÃ SẬP]` `tools/vfxmap.py` chỉ đọc `data/cards.js`, nên thẻ của Mak, Stelle, Jules, Karnok đều bay đạn mặc định. Mỗi lần thêm hero, kiểm lại: số ability có `VFXOverrideKey` mà không có mục trong `vfxmap.js` phải bằng 0 (hiện còn 7, vì prefab không có trong bản demo).
- `[BẪY ĐÃ SẬP]` (đợt 9b, audit `D:\bazaar-ref\review9\OOC.md`, `ENC.md`, báo cáo `FIX-M.md`) Spawn/Deal của thẻ gặp gỡ mất `SpawnContext`, nhưng nhiều bước Deal là bày THẺ GẶP GỠ kế tiếp (hiệp bóng của Bex, vòng quay Haddy, "Run away!", "Visit the Artist"), không phải vật phẩm. Bộ đọc chữ không ra bộ lọc thì trước đây chia một vật phẩm ngẫu nhiên: 30 bước ra đồ bừa. Nay chữ không nêu thẻ (`R.filterEmpty(f) && !f.kind`) thì không chia gì; hiệu ứng thật ghi vào bảng `St.FX` (`js/run/enc-step.js`, khoá InternalName, nguồn: bước anh em trong `BZ_ENCOUNTERS` + `bazaardb/events.json` `choices[].reward`). Chưa tìm ra hiệu ứng thì để trống và ghi tên vào `FIX-M.md`, đừng bịa.
- `[BẪY ĐÃ SẬP]` `CombatOutcome` trong dữ liệu là `'Lose'`, `enc-combat.js` truyền `'Loss'`, nên mọi ability "khi thua trận" (Stained Glass Window, Crystal Bonsai) không bao giờ chạy. `WorksIn` trong dữ liệu là `'CombatOnly'`, code lọc `'InCombatOnly'` (không có trong dữ liệu). Grep giá trị enum trong `data/cards-*.js` trước khi so chuỗi.
- `[BẪY ĐÃ SẬP]` Sim chỉ chạy ngay ability `Immediate`; ngoài trận không có hàng đợi, nên phản ứng dây chuyền (Peacewrought "+2 vàng khi phá", Chimeric Egg "giá trị chạm 10 thì nâng bậc") chết im. `BZSim.emit` có móc `S.onEmit`; `ooc.js` nghe `O.REACT` và chạy ability khớp. Ability `WorksIn: OutOfCombatOnly` bị sim bỏ khỏi bộ nghe của trận, nên chỉ đường này chạy được chúng.
- `[BẪY ĐÃ SẬP]` Trigger ngoài trận phải có người gọi `R.ooc.fire`: lên cấp (`R.gainXp` → `OnPlayerAttributeChanged` Level/HealthMax), vàng đổi (`R.gold`), chọn lấy thẻ (`R.gainCard` why buy/loot/chest/start → `OnCardSelected`). Thêm trigger mới thì thêm cả call-site lẫn mục trong `O.TRIGGERS`; `ooc-audit.js` đếm loại trigger không ai bắn.
- `[BẪY ĐÃ SẬP]` Loại thêm ngoài trận ("Your leftmost item gains the Food type", Mysterious Crystal) phải lưu trên `inst.tags` và qua `R.simCard` → `addTags` của `BZSim.makeCard`; trước đây sim gắn vào thẻ tạm rồi vứt. Bộ đọc cỡ phân biệt hoa thường nên "get a small item" (Scavenger) ra đồ Large: nay không phân biệt.
- `[BẪY ĐÃ SẬP]` Viết vá bằng `node -e "..."` hay heredoc trong Git Bash làm `\\b` thành ký tự backspace (0x08) trong regex: test vẫn xanh vì regex lỏng hơn. Viết script vá ra tệp bằng công cụ Write, rồi `grep -c $'\x08'` các tệp đã sửa.

## Nguồn bazaardb

Từ 2026-10-21 shop, thầy kỹ năng và sự kiện đọc cấu hình thật của bazaardb.gg (patch 19.2, nguồn ngoài, suy từ lượt chơi cộng đồng; bản demo 5.0.0 bị xoá bộ lọc sinh thẻ). Thư mục bóc: `D:\bazaar-ref\bazaardb\` (SUMMARY.md). Đổi sang web: `py -3.12 -I games/bazaar/tools/bazaardb.py` ra `data/shops.js` (141 KB; pool là chỉ số vào bảng id, nạp xong bung lại thành id thẻ). Khớp theo tên (hạ chữ thường, bỏ dấu câu). `js/run/pool.js` (`R.dealShop`, `R.dealFor`) chia từ bể này; không có bể thì rơi về bộ đọc chữ cũ và `R.shopStats.fallback` đếm lại.

- Bể: lọc theo hero đang chơi + Common, trừ "from any Hero" (mọi hero), "other Heroes" (hero khác), "this Hero" (chỉ hero đó), "Neutral" (chỉ Common). Aila ngày 1 có 198 thẻ web trong bể; Goldie 888; Valpak 901. [ĐO TRONG REPO]
- Bậc mỗi ô: tung theo `tierOdds` của ngày (bazaardb /shop-odds: ngày 1 = 97,39/2,61/0/0; ngày 9 = 0,35/34,99/59,57/5,08; ngày > 16 dùng hàng 16), rồi chọn thẻ có StartingTier ≤ bậc đó. Luật bậc riêng của thương nhân đọc từ "X-tier": Goldie toàn Gold, Curio toàn Bronze. Test: 2000 lượt chia của Aila lệch tối đa 0,44 điểm (ngày 1) và 0,82 điểm (ngày 9) so với bảng. Bảng chỉ cho tỉ lệ bậc của đồ đã bày, không cho trọng số trong bể: mỗi thẻ hợp lệ có cơ hội ngang nhau. [ĐỀ XUẤT]
- Thầy kỹ năng: bể kỹ năng theo hero, bậc theo dải ngày như trước (`BAND_BY_DAY`), vì bazaardb không có bảng bậc cho kỹ năng.
- Đổi hàng: bazaardb ghi `reroll_count` = 1 cho cả 78 thương nhân và thầy, giá theo bậc thẻ gặp gỡ (Bronze 2, Silver 3, Gold 4, Diamond 8). RerollRules của bản demo cũng 1 lần, `CostIncrease` 0, cùng giá, nên hai nguồn khớp. Lần đổi thứ hai tốn nhiều hơn trong clip không có trong dữ liệu nào: web không bịa. Giá theo dữ liệu bazaardb, riêng Pol thứ hai (Silver 2) bị lẫn với Pol Silver 3 nên lấy thẻ đầu.
- Giá bán thêm: Barkun Small +1, Midsworth Medium +2, Quixel Large +3 (khớp `MERCHANT_SELL_AURAS` cũ). Laurel (Toys +1) chưa có thẻ trong bản demo. Valpak: cờ `discounted` = luôn một thẻ giảm 25%.
- Ngày có thẻ: `days_active` của bazaardb thay `Days` của demo khi hiện thẻ ở giờ tự do (Goldie từ ngày 5, Curio ngày 2 đến 5; 10 = "10+"). Chỉ áp cho thẻ không phải Level Up.
- Sự kiện: lựa chọn nối với bước web theo tên. Lựa chọn có điều kiện ("if you have X") hay riêng hero luôn hiện khi đủ điều kiện (tỉ lệ bazaardb chỉ đo số người chơi đủ điều kiện, không phải xác suất). Chỉ lựa chọn không điều kiện mà tỉ lệ < 100 mới tung: nếu tổng ≈ số nguyên k thì rút đúng k theo trọng số, không thì từng ô một. Thực tế trong số sự kiện khớp được chỉ Shrouded Figure có ô loại này, nên phần lớn lựa chọn vẫn do điều kiện quyết. Mountain Pass, Farai (phần thưởng ngẫu nhiên một trong N) là sự kiện `pile` của web, chưa nối. [ĐO TRONG REPO]
- Huy hiệu cam (`stamp` trên lựa chọn): lấy `stack_count_guess` của bazaardb (D'flek: Exploit 5, Upgrade 10, Enchant 20; Hire a Teacher 20; Wishing Fountain là giá vàng) hay "[Gumballs Remaining: N]" trong chữ của bước. `stack_count_guess` là phỏng đoán từ số góc thẻ.
- Giá: 120 dòng mẫu (mua) khớp luật 2 x cỡ x 2^bậc và bảng `StandardPrices` của demo (Small Bronze 2 đến Large Diamond 48): giữ bảng demo. Một lệch: Mystery Flavor Diamond Small bán 0 trên site, bảng demo 8; thẻ này không bán được ở bản gốc, chưa xử lý.

Điều tra không khớp (số đếm, tên đầy đủ ở đầu `data/shops.js`):

| Nhóm | Khớp / tổng | Không khớp tiêu biểu |
|---|---|---|
| thương nhân | 48 / 52 | Laurel, Private Pitchfork, The Dragons, Uitar Center (demo không có thẻ) |
| đồ trong bể thương nhân | 11290 / 12968 | thẻ patch mới: Burnacuda, Sweeper Drone, Hot Pants, RAMPage Module, Hairpins (khoảng 1678, 153 tên) |
| thầy kỹ năng | 23 / 24 | Mama Bear |
| kỹ năng trong bể thầy | 1678 / 2049 | Data Transfer, Chilled Delights, Piping Hot, Blight Rage (371) |
| sự kiện có bảng Options | 40 / 61 | Apothecary, Library, Piano, Wishing Fountain, Aurora Dome, Command Nexus, Concert Hall, Farmer's Market... (21) |
| lựa chọn của sự kiện | 119 / 167 | Jules' Cafe / Relax, Jungle Ruins / Enjoy the Scenery... (47: tên bước web khác hoặc lựa chọn mới) |
| thương nhân không có bể | 1 | Serafina (bazaardb không có trang bể; rơi về bộ đọc chữ) |

Ô lựa chọn web không có dữ liệu bazaardb vẫn hiện như cũ (không mất lựa chọn nào).
- `[BẪY ĐÃ SẬP]` Lều/xe ở khung trên to, che đường thẻ đang chia bay xuống. Nhấc thẻ giữa lúc chia thì trúng nút đổi hàng. Thẻ `.deal` phải nổi trên `.rs-merchant-ctl` (`css/run.css`).
- `[BẪY ĐÃ SẬP]` Ngày xuất hiện lấy từ bazaardb làm lộ ra Claw Game, một sự kiện bản demo có thẻ nhưng không có art (`ArtKey` rỗng), nên khung chân dung trống. Gặp gỡ có `ArtKey` rỗng không được bày (`artOk` trong `js/run/clock.js`), giống `HIDDEN_CARDS` với vật phẩm.
- `[BẪY ĐÃ SẬP]` (2026-10-22) Bộ chia bài dự phòng `R.deal` gặp bể rỗng thì nới bộ lọc tới mức bỏ hết tag, cỡ và tên, nên chia bừa cả bể. Chủ dự án thấy ba triệu chứng của cùng một lỗi này: sạp có đồ quái rơi và thỏi vàng, "Get 5 Gumballs" ra Rune Axe, Bag of Jewels, Cannon (chữ `Get {ability.0} Gumballs` mất số nên `R.phraseFilter` không đọc ra tên), sạp "Sells Potions" bày đồ khác. Giờ chỉ được nới sang bể của mọi hero, giữ tag, cỡ, tên; cạn thì chia ít hơn. Đo bằng quét mọi bước sự kiện × 7 hero × 4 ngày: 85 bước trả thẻ trái chữ trước khi sửa, còn 10 sau khi sửa, cả 10 là thầy kỹ năng chia kỹ năng mang tag `BurnReference` cho chữ "Burn" (khớp bể bazaardb).
- Bể bazaardb của vài thương nhân chỉ bóc được tab hero đầu (Barkun 84 món toàn Vanessa, dù `pool_per_hero_counts` có cả 7 hero). Hero khác rơi về bộ đọc chữ. `tools/bazaardb.py` ghi thêm `heroes` (hero có hàng theo `pool_per_hero_counts`); `R.shopHeroOk` không bày thương nhân / thầy cho hero không có hàng (Knightshade không ra cho Pygmalien, Stelle, Jules; Kev's Armory không ra cho Vanessa).
- Đồ quái rơi chung (tag `Loot` + hero Common) và đồ chỉ để bán lấy vàng (tooltip duy nhất "Sells for Gold": Bar of Gold, Chunk of Gold, Bag of Jewels) không bao giờ lên sạp (`R.isMonsterLoot`), kể cả khi bể bazaardb có (Curio, Aimbot). Bể bazaardb là suy từ lượt chơi cộng đồng; chủ dự án chơi bản thật và xác nhận sạp không bán loại này. Catalyst (tag Loot nhưng là đồ của Mak) vẫn bán.
- Bể bản live có món đổi cỡ so với demo (Eagle Sigil là Small trong demo, nằm trong bể Mittel "Sells Medium items"). `R.dealShop` lọc thêm cỡ theo chữ của chính thương nhân.
- Kiểm: `ONLY=fix9 node test/bazaar-run.js`.
