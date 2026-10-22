# Chợ Phiên: luật và số của The Bazaar đã đối chiếu

Chợ Phiên làm lại The Bazaar (Tempo Storm) từ bản demo trên Steam. Tệp này gom các luật và con số đã kiểm với nguồn gốc. Mỗi dòng ghi nguồn để đợt sau khỏi phải đo lại.
Cách bóc art, tiếng và dữ liệu nằm ở `tools/README.md`. Kế hoạch theo pha nằm ở `brain/plans/bazaar-web.md`.

Nhãn dùng trong tệp:
- `[ĐO TRONG REPO]`: chạy hoặc đọc mã/dữ liệu của bản demo mà ra.
- `(wiki)`: đọc ở wiki hoặc trang hướng dẫn, chưa chạy thử.
- `[ĐỀ XUẤT]`: số tự đặt, vì bản demo để nó trên máy chủ.

## Nguồn

- Mã C# dịch ngược và dữ liệu của bản demo, bóc ra `D:\bazaar-ref\src` và `D:\bazaar-ref\db\json` (ngoài repo). `GameData.db` là SQLite, mỗi dòng là JSON, phải mở bằng `py -3.12`.
- Wiki: https://thebazaar.wiki.gg (trang Level_Up, Monsters, Burn, Haste...). Wiki tự ghi là có phần cũ. Bản chép đủ 1351 trang (2026-10-22) ở `D:\bazaar-ref\wiki2\pages\*.wiki`: grep ở đó trước khi đổi số. Đối chiếu luật với wiki: `D:\bazaar-ref\review9\wiki\WIKI2.md` (44 dòng lệch, mã R/S/P/M/E/K dùng bên dưới); báo cáo sửa `D:\bazaar-ref\review9\FIX-W.md`.
- Mobalytics (day-guide, beginner-guide, start-of-run-guide). Một số trang trả 403.
- Clip YouTube có mốc giờ: `D:\bazaar-ref\notes\clips\*.md`.
- Báo cáo khảo sát đợt 2026-10-20, mỗi khác biệt có mã: `D:\bazaar-ref\notes\audit\{RUN,COMBAT,CONTENT,UI,FX,ASSET}.md`.

## Vòng chơi

- Một ngày có 6 giờ. Giờ 0, 1, 3, 4 là thương nhân, sự kiện hoặc lựa chọn miễn phí. Giờ 2 là PvE, chọn 1 trong 3 quái. Giờ 5 là PvP. (wiki Monsters, Mobalytics day-guide)
- Khởi đầu: 8 vàng, thu nhập 5. Ba lựa chọn (wiki Start of Run 2025-05-24, WIKI2 S1/R7): "+12 Gold and +2 Income" (tổng 20 vàng, thu nhập 7); "Choose an Enchanted (Non-Golden, Non-Radiant) Item (Choose 1 from 3) and + 6 Gold" (ba món Small bậc Đồng yểm bùa, không Golden theo 0.1.9, không Radiant theo 2.5.0, chọn 1 trong pha nhặt, +6 vàng); "Choose a Gold-tier Skill (Choose 1 from 3)" (ba kỹ năng chia ở bậc Gold cho mọi hero). Mở màn "counts as one of the six hours": chọn xong là hết giờ 0 (+1 XP), ngày 1 còn giờ 1 tự do, giờ 2 quái (WIKI2 R13).
- XP: chỉ +1 khi hết mỗi giờ (6 giờ một ngày) cộng XP thắng quái; 8 XP lên một cấp (wiki Level Up "Collect 8 XP to gain a level"). Chọn gặp gỡ KHÔNG cộng thêm `ExperienceAwardUponSelection` của bản demo: Version 0.1.6 sửa lỗi "Level Up rewards would provide XP like they were a regular encounter", tức XP của giờ chính là XP chọn gặp gỡ (WIKI2 R1). Bot thắng mọi trận quái Đồng: đầu ngày d đúng cấp d (đầu ngày 10 cấp 10, 72 XP). Bản cũ trả cả hai nên 12,3 XP/ngày, cấp 14,8 ở đầu ngày 10.
- Máu tối đa theo cấp, bảng tuyệt đối `HP_BY_LEVEL` 300/350/450/600/800/1050/1350/1700/2100/2550 (cấp 1..10), sau đó bước tăng +50 mỗi cấp (cấp 11 3050, 12 3600) [ĐỀ XUẤT nối nhịp]. Nguồn: Version 2.5.0 "Increased all Heroes' starting health by 50" (cấp 1 250 → 300, clip `PSP75k4R4Pk` cấp 1 300, cấp 2 350) + clip `wUzq6Q4u9Jc` đầu ngày C2..C10 (WIKI2 R2). Bảng `level_ups` của bản demo (C2 400 ... C10 3200) tính từ nền 250 và lệch một cấp nên bỏ.
- Phần thưởng lên cấp đi theo **cấp**, không theo ngày. Bảng `LEVEL_REWARDS` trong `js/run/tuning.js`, lấy từ wiki Level_Up. Thầy kỹ năng có đổi hàng: Pip 2 vàng, Argenta 3, Orlin 6, Adira 8, Zosima 8 (`RerollRules` trong `cards.json`). [ĐO TRONG REPO]
- Quái giờ PvE theo danh sách từng ngày của wiki Monsters (Monsters.wiki 2025-07-10), ghép theo (tên, bậc) ở `tools/data.py` (`WIKI_PVE_DAYS` → `data/encounters.js` `pveDays`). Bốn tên wiki khác tên dữ liệu: Tempest Flamedancer = Tempest Bravo, Shock Trooper = Annex Trooper, Death Knight Reaper = Void Knight (Legendary ngày 9), Veteran Octopus = Eight Arm Davvy (8888 máu) (WIKI2 P2). Bản demo không có thẻ đúng bậc cho 15 mục (Giant Mosquito ngày 2 là thẻ Vàng 700 máu, wiki Đồng 200; Thug ngày 7 là thẻ Kim cương 2550, wiki Bạc 1550...): mượn thẻ đó, ghi đè bậc, thưởng và máu theo trang quái (WIKI2 P3). Máu wiki cho 10 quái có bản vá ghi số (Rogue Scrapper 350, Boarrior 400, Ghost Pepper 2200, Yerdan 1925 theo 2.0.0; Kyver Drone 100, Mod Squad 1300, Scovyle 1400, Lich 1900, Chilly Charles 2100, Infernal Frigate 2050 theo trang sửa từ 2025-05-24) (WIKI2 P4). "[DISABLED] Joyful Jack" bị loại (P5). Ngày 1 không có quái Vàng. Từ ngày 11 có thêm Morguloth. (wiki)
- Thưởng thắng quái theo bậc, Version 2.5.0: Đồng 2 vàng 2 XP, Bạc 3/2, Vàng 4/2, Kim cương 5/3, Huyền thoại 6/3 (`PVE_REWARD_BY_TIER`, bỏ 3/3/3/4/4 XP của bản demo) (WIKI2 M-P1).
- Thua quái vẫn giữ vàng theo phần máu đã đánh. Thua thì không có XP: wiki Monsters "the rewards for winning that fight ... gold, XP and one of the Monster's items"; DB `RewardDefeat.ExperienceReward` = 0 ở 170/170 thẻ trận (WIKI2 R14; bản cũ [ĐỀ XUẤT] cho XP khi hạ ≥ 50% máu quái).
- Bóng PvP mang máu tối đa của chính bản ghi trong `data/ghosts.js` (wiki Day: "a snapshotted version of their build after their fight"), không còn đường cong `GHOST_HP_BY_DAY` (chỉ còn cho bóng dựng từ bàn quái khi không có bộ dữ liệu) (WIKI2 R3).
- Thua PvP mất uy tín bằng số ngày. Run hết khi đủ 10 thắng hoặc hết uy tín; không giới hạn 10 ngày. (`BazaarDeckTools.cs:2024-2035`, clip `oVtvrCdqHEE?t=652`)
- Fates: uy tín về 0 lần đầu thì được cứu, luôn đúng ba bước của Futura: Fate's Bounty (20 vàng, 5 XP), Fate's Crossroads, Fate's Legacy (wiki Futura 2025-05-08; Fate's Fortunes của bản demo không có trên wiki nên không bày) (WIKI2 R15). Statia chỉ ở lúc này, không vào giờ tự do (WIKI2 E5).
- Hợp nhất: mua món cùng id cùng bậc (dưới Kim cương) thì món cũ lên một bậc. Kỹ năng cũng hợp nhất như vậy (`SkillCard.CanFuseWith`). [ĐO TRONG REPO]
- Lựa chọn "(if you have a Food)" và tương tự bị ẩn khi bàn và kho không có món đó. [ĐO TRONG REPO]
- Lựa chọn mà mọi ability chỉ tác động lên thẻ ("Upgrade your leftmost Poison item", "Your items gain 3 Poison") cũng bị ẩn khi sim chấm ra không có đích trên bàn hiện tại (`St.noTarget`, `js/run/enc-step.js`). "Leftmost" chỉ xét tay; "Your items" xét cả kho. [ĐỀ XUẤT] (người chơi thử P1-9: chọn rồi trôi giờ không có gì)
- Phần thưởng sự kiện mà chữ không nêu bậc ("Get a Small Tool" của Utility Box Bạc) lấy bậc của chính thẻ sự kiện, vì bazaardb ghi mỗi bậc một bản "Get a Silver-tier Tool" (`St.encTier`). Chỉ thẻ sự kiện: bước con mang `StartingTier` mặc định Đồng (bước "Roast It" của Finn's Vàng là Đồng). Chữ khoá bậc ("Silver-tier", rương Bạc, sạp Goldie) thì bậc của nguồn thắng luật "đã có bản thì chia đúng bậc bản đó". (bazaardb `events.json`)
- Thẻ sinh thẳng vào bàn ("Get 5 Gumballs", Candy Stash) mà tay + kho đầy thì không mất im lặng: phần thừa thành pha nhặt (`spawned`: lấy hết, bán bớt cho có chỗ, hoặc bỏ qua), nhặt xong mới đi tiếp chuỗi của bước (Then, Deal). [ĐỀ XUẤT]
- Giảm giá của thương nhân: ×0,75 làm tròn xuống (món 2 vàng còn 1, 6 còn 4). Làm tròn xa 0 thì món 2 vàng "giảm" vẫn 2 vàng. [ĐỀ XUẤT]
- Gặp gỡ nháp của bản demo nói "Speed" (game không có chỉ số này; ability thật là +Crit Chance): Tok's Clocks (Charged Up More), Run a Race và bước con. Không có trong bazaardb lẫn wiki, nên không bày (`TUNING.PLACEHOLDER_ENCOUNTERS`).
- Giờ tự do lấy ĐỀU trong các gặp gỡ đúng ngày, không gieo bậc theo bảng tự đặt (Category_Event 2025-06-04: sự kiện Đồng/Bạc "Day 1+", Vàng "Day 2+") (WIKI2 E13). Ngày của gặp gỡ: `WIKI_DAYS` (wiki xác nhận: Haddy 8+, Study 2 và 4+, Form 7+, Pol 5+, Treasure Chest (Mimic) 10+, chín bệ yểm bùa 10+) → `days_active` của bazaardb → `Days` trong tên → `DAYS_BY_TIER` theo bậc (Đồng/Bạc 1+, Vàng 2+, Kim cương 6+, Huyền thoại 10+ [ĐỀ XUẤT theo các mốc trên Category_Event]) (WIKI2 E13/E14/M7). Bảng `ENCOUNTER_TIER_ODDS_WITH_LEGENDARY` cũ (Bạc không bao giờ ra ngày 1 và 10, Đồng không ra từ ngày 7, bệ yểm bùa từ ngày 5) đã bỏ.
- Đống đồ của sự kiện không nêu bậc chia theo cùng bảng bậc theo ngày của thương nhân (bazaardb `tierOdds`): wiki "Item Skill Spawn Tier Percentage by Day" là MỘT bảng (WIKI2 R6). Armory ngày 10 trước ra 76 % Kim cương, nay 0-10 %.
- Lựa chọn sự kiện trả vàng: chọn thì trừ, thiếu vàng thì từ chối và `R.legal` không liệt kê; huy hiệu cam hiện đúng giá (`EVENT_COSTS`): Eating Contest Deluxe 5 / Premium 10; Form Sharpen Weapon 5 / Upgrade 10 / Engrave (Enchant) 20, Exploit miễn phí; Aldric, Botul, D'flek, Flambe, Mad Maddie cùng mẫu (Exploit 0, nâng cấp chung 5, Upgrade 10, Enchant 20); Economic Seminar Premium 4; Artisan Dunes "Find Better Craftsman" 5; Gumball 1 vàng một viên (gói 5 viên 5 vàng) (trang wiki từng sự kiện, WIKI2 E1). Huy hiệu bazaardb cũ đặt nhầm 5 vàng lên Exploit.
- Gumball luôn bậc Đồng ("All Gumballs are of Bronze tier", Gumball Machine Event) và không cho XP (WIKI2 E7).
- Haddy chỉ bày "Spin the Wheel": quay ra một trong sáu giải (Bag of Gold 20, Enchanted Item, Gold Skill, Diamond Skill, Mystery Bundle, Magician's Top Hat), người chơi không tự chọn giải; từ ngày 8 (WIKI2 E2).
- Mountain Pass gieo khi chọn: 25 % đấu quái cùng ngày, 25 % quái ngày sau, 40 % một trong sáu kết quả tốt (3 Loot, +5 Regen, +10 vàng, +1 thu nhập, 1 XP + 5 vàng, 5 XP), 10 % nhận kỹ năng Valley Fever hoặc Insect Bite (Version 2.0.0, trang 2025-05-24). Sáu kết quả tốt và hai kỹ năng chia đều [ĐỀ XUẤT: trang không ghi tỉ lệ con] (WIKI2 E3).
- Deadly Duel / Epic Battle: một quái bất kỳ (mọi bậc) của danh sách ngày hiện tại hoặc ngày sau (WIKI2 E10).
- Study: đúng +1 XP (wiki "Gain 1 Additional XP"; bản demo +2 cộng chữ "Gain 2 XP" = 4), không ra ngày 3 (2.5.0) (WIKI2 E6).
- Relax (Rest của bản demo): "Start your next fight with 100 Shield per Level" → `run.nextFightShield`, cộng vào khiên mở trận kế, xong trận thì hết (WIKI2 E8).
- Pearl's Dig Site: đổi vô hạn, 1 vàng rồi +1 mỗi lần; đồ của mọi hero và cả Loot của quái (WIKI2 E9).
- Finn's Big Bite có ba món của wiki (Guardian's Gravy Plate: +5 % máu tối đa, đồ Shield +10 Shield; Restorative Risotto: +5 %, đồ Heal +10 Heal; Vitality Stew: +5 %, +5 Regen) dưới dạng lựa chọn tự dựng (`EVENT_EXTRA_CHOICES`, `R.GENERIC_FX`). Treasure Chest thường vào bể từ ngày 1 (WIKI2 E12).
- Thieves Guild không vào giờ tự do: wiki chỉ tới khi bán Thieves Guild Medallion / qua Mysterious Portal, bản web chưa có ba lựa chọn của nó (WIKI2 E11).
- Số nhỏ theo wiki (WIKI2 E15): Borrow 8 / 7 / 6 vàng (bản demo 9 / 8 / 7); Regenerative Tincture Regen bằng cấp (bản demo 2 x cấp).

## Combat

- Khung mô phỏng 50 ms, trận tối đa 120 s (`BazaarConstants.cs:23,25`).
- Bỏng nhảy 2 lần mỗi giây, Độc và Hồi máu 1 lần mỗi giây (`tooltips.json`).
- Còn Khiên (dù chỉ 1) thì cả nhịp Bỏng chỉ còn một nửa, trừ Khiên trước rồi tới máu (wiki Burn). Độc bỏ qua Khiên.
- Bỏng giảm khoảng 4,5% mỗi nhịp, tối thiểu 1. Chỉ hệ số trong khoảng [0,04375; 0,04605) khớp chuỗi 80, 76, 73, 70, 67 của clip `5X-G7Jf3t5w?t=64`. [ĐO TRONG REPO]
- Món đang Đóng băng không kích hoạt được, kể cả khi bị Charge đầy hồi chiêu (`tooltips.json` Freeze, bản 5.0.0).
- Haste, Slow, Freeze ưu tiên món chưa bị ảnh hưởng và có hồi chiêu. (wiki Haste)
- Hồi máu theo nhịp (Regen) trừ Độc một lượng bằng chính nó TRƯỚC khi Độc gây sát thương, kể cả khi đầy máu (wiki Regeneration 2025-05-14 "Regen will reduce Poison by its amount before Poison deals damage"): Độc 10 + Regen 5 → 5 → 0 (WIKI2 K1).
- Multicast: mỗi lượt bắn tính là một lần "dùng vật phẩm" cho món nghe `OnItemUsed` (wiki Multicast 2025-05-31), đạn vẫn trừ một lần (WIKI2 K2). Các lượt vẫn rơi cùng khung (K3 chưa làm: wiki không cho số theo món).
- Hút máu (Lifesteal) tính là Hồi máu cho trigger "khi bạn hồi máu" / "hồi quá", không tẩy Bỏng/Độc (Version 1.0.0) (WIKI2 K4).
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
- `[BẪY ĐÃ SẬP]` (đợt 9c, người chơi thử `D:\bazaar-ref\review9\play\P1..P3\ISSUES.md`, báo cáo `FIX-M2.md`) Luật "đã có bản thì chia đúng bậc bản đó" (TierDuplicateCardHandling) đè cả nguồn khoá bậc: Supply Drop Kim cương ra Cinders Đồng, rương Bạc ra Sharpening Stone Vàng, Luxe bày Chef Hat Đồng. Ba triệu chứng, một dòng trong `R.deal` / `R.dealShop`. Thấy thẻ lệch bậc thì xem người chơi đã có thẻ đó chưa trước khi đi tìm bảng bậc.
- `[BẪY ĐÃ SẬP]` Bậc và vàng thưởng của thẻ trận trong demo có chỗ tráo nhau: "Bloodreef Raider (D4 Bronze)" mang Silver + 2 vàng, bản thường mang Bronze + 3 vàng. Sửa ở `COMBAT_TIER_FIX` của `tools/data.py` (theo wiki: Bloodreef Raider Silver 3 vàng, Ferros Khan cấp 10 Gold 4 vàng), rồi chạy lại `data.py` (ra byte-giống trừ hai tệp đó). Stew (Bronze, 3 vàng) chưa có nguồn nên để nguyên.
- `[BẪY ĐÃ SẬP]` Bể bazaardb của thương nhân có món lạc chủ đề (Chronos "Sells Haste items" bày Refractor). `R.dealShop` lọc thêm: vật phẩm phải mang tag chữ nêu (kể cả `...Reference`) hoặc nhắc từ đó trong tooltip của chính nó (`R.themeOk`). Không tính tooltip enchantment: Turbo của món nào cũng nhắc Haste.
- `[BẪY ĐÃ SẬP]` Viết vá bằng `node -e "..."` hay heredoc trong Git Bash làm `\\b` thành ký tự backspace (0x08) trong regex: test vẫn xanh vì regex lỏng hơn. Viết script vá ra tệp bằng công cụ Write, rồi `grep -c $'\x08'` các tệp đã sửa.

## Nguồn bazaardb

Từ 2026-10-21 shop, thầy kỹ năng và sự kiện đọc cấu hình thật của bazaardb.gg (patch 19.2, nguồn ngoài, suy từ lượt chơi cộng đồng; bản demo 5.0.0 bị xoá bộ lọc sinh thẻ). Thư mục bóc: `D:\bazaar-ref\bazaardb\` (SUMMARY.md). Đổi sang web: `py -3.12 -I games/bazaar/tools/bazaardb.py` ra `data/shops.js` (141 KB; pool là chỉ số vào bảng id, nạp xong bung lại thành id thẻ). Khớp theo tên (hạ chữ thường, bỏ dấu câu). `js/run/pool.js` (`R.dealShop`, `R.dealFor`) chia từ bể này; không có bể thì rơi về bộ đọc chữ cũ và `R.shopStats.fallback` đếm lại.

- Bể: lọc theo hero đang chơi + Common, trừ "from any Hero" (mọi hero), "other Heroes" (hero khác), "this Hero" (chỉ hero đó), "Neutral" (chỉ Common). Aila ngày 1 có 198 thẻ web trong bể; Goldie 888; Valpak 901. [ĐO TRONG REPO]
- Bậc mỗi ô: tung theo `tierOdds` của ngày (bazaardb /shop-odds: ngày 1 = 97,39/2,61/0/0; ngày 9 = 0,35/34,99/59,57/5,08; ngày > 16 dùng hàng 16), rồi chọn thẻ có StartingTier ≤ bậc đó. Luật bậc riêng của thương nhân đọc từ "X-tier": Goldie toàn Gold, Curio toàn Bronze. Test: 2000 lượt chia của Aila lệch tối đa 0,44 điểm (ngày 1) và 0,82 điểm (ngày 9) so với bảng. Bảng chỉ cho tỉ lệ bậc của đồ đã bày, không cho trọng số trong bể: mỗi thẻ hợp lệ có cơ hội ngang nhau. [ĐỀ XUẤT]
- Thầy kỹ năng: bể kỹ năng theo hero, bậc theo dải ngày như trước (`BAND_BY_DAY`), vì bazaardb không có bảng bậc cho kỹ năng.
- Đổi hàng: bazaardb ghi `reroll_count` = 1 cho cả 78 thương nhân và thầy, giá theo bậc thẻ gặp gỡ (Bronze 2, Silver 3, Gold 4, Diamond 8). RerollRules của bản demo cũng 1 lần, `CostIncrease` 0, cùng giá, nên hai nguồn khớp. Lần đổi thứ hai tốn nhiều hơn trong clip không có trong dữ liệu nào: web không bịa. Giá theo dữ liệu bazaardb, riêng Pol thứ hai (Silver 2) bị lẫn với Pol Silver 3 nên lấy thẻ đầu.
- Giá bán thêm: Barkun Small +1, Midsworth Medium +2, Quixel Large +3 (khớp `MERCHANT_SELL_AURAS` cũ). Laurel (Toys +1) chưa có thẻ trong bản demo. Valpak: cờ `discounted` = luôn một thẻ giảm 25%.
- Ngày có thẻ: `days_active` của bazaardb thay `Days` của demo khi hiện thẻ ở giờ tự do (Goldie từ ngày 5, Curio ngày 2 đến 5; 10 = "10+"). Chỉ áp cho thẻ không phải Level Up.
- Sự kiện: lựa chọn nối với bước web theo tên. Lựa chọn có điều kiện ("if you have X") hay riêng hero luôn hiện khi đủ điều kiện (tỉ lệ bazaardb chỉ đo số người chơi đủ điều kiện, không phải xác suất). Chỉ lựa chọn không điều kiện mà tỉ lệ < 100 mới tung: nếu tổng ≈ số nguyên k thì rút đúng k theo trọng số, không thì từng ô một. Thực tế trong số sự kiện khớp được chỉ Shrouded Figure có ô loại này, nên phần lớn lựa chọn vẫn do điều kiện quyết. Mountain Pass đã nối theo wiki (xem Vòng chơi); Farai chưa nối. [ĐO TRONG REPO]
- Huy hiệu cam (`stamp` trên lựa chọn): lựa chọn có giá wiki (`EVENT_COSTS`, xem Vòng chơi) hiện đúng giá đó và trừ vàng thật; còn lại lấy `stack_count_guess` của bazaardb (Hire a Teacher 20; Wishing Fountain là giá vàng) hay "[Gumballs Remaining: N]" trong chữ của bước. `stack_count_guess` là phỏng đoán từ số góc thẻ (D'flek ghi Exploit 5, wiki ghi Exploit miễn phí, Reinforce 5).
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
- Đồ của quái không lên sạp, TRỪ Curio (WIKI2 M1/M2/M3). Đồ của quái = trang wiki {{Item}} có `collection` chứa Monster hoặc Junk (101 trang, `tools/bazaardb.py` đọc bản chép wiki → `BZ_SHOPS.monsterItems`) cộng mọi thẻ tag `Loot` (cả Catalyst của Mak) và đồ chỉ để bán lấy vàng ("Sells for Gold": Bar of Gold, Chunk of Gold, Bag of Jewels) (`R.isMonsterItem`, `js/run/pool.js`). Nguồn: Junk Items.wiki "can only be obtained through Monster encounters or from the Curio Merchant"; JayJay / Luxe / Serafina "excluding Monster items"; Curio.wiki "Sells Bronze-tier junk items"; Bar of Gold "From the Curio merchant"; Scrap, Sharpening Stone, Gland, Med Kit, Insect Wing...: "can be bought via the merchant Curio". Trước đợt 9d: Curio không bán món nào loại này (lệch wiki), còn thương nhân khác bán 4,8 % đồ của quái (Barkun 31 %, Serafina 34 %, Maximus 38 %); nay Curio bán đủ bể bazaardb của nó, thương nhân khác 0 %.
- Món yểm bùa sẵn ở thương nhân giá gấp đôi, nhân trước khi giảm 25 % (wiki Items 2025-04-09 "double the price") (WIKI2 R10). Serafina bày Icy nửa trọng số (Version 0.1.3 "Reduced the rate that Serafina ... will sell Icy items"; ×0,5 là [ĐỀ XUẤT], bản vá không ghi số) (WIKI2 M4).
- Bể bản live có món đổi cỡ so với demo (Eagle Sigil là Small trong demo, nằm trong bể Mittel "Sells Medium items"). `R.dealShop` lọc thêm cỡ theo chữ của chính thương nhân.
- Kiểm: `ONLY=fix9 node test/bazaar-run.js`; đợt 9c (lỗi người chơi thử, Maximus): `ONLY=fix9c node test/bazaar-run.js`; đợt 9d (luật theo wiki, WIKI2): `ONLY=fix9d node test/bazaar-run.js` và `ONLY=fix9d node test/bazaar-sim.js`.
