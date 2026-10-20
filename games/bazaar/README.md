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

## Cái bẫy đã sập

- `[BẪY ĐÃ SẬP]` Thẻ có hồi chiêu bị phủ xám ở màn thương nhân. Màn hồi chiêu (`.veil`) mặc định hiện, nên thẻ chưa vào trận cũng xám. Nay nó chỉ bật khi replay gọi `C.update` (`js/view/card.js`).
- `[BẪY ĐÃ SẬP]` Ghi chú cũ trong `tuning.js` nói Fates "không có bước con", nên bản web đã tự chế "Second Wind" và "Golden Gift". DB thật có bốn bước của Futura. Trước khi tự chế, tìm bằng tên trong `cards.json`.
- `[BẪY ĐÃ SẬP]` `tools/vfxmap.py` chỉ đọc `data/cards.js`, nên thẻ của Mak, Stelle, Jules, Karnok đều bay đạn mặc định. Mỗi lần thêm hero, kiểm lại: số ability có `VFXOverrideKey` mà không có mục trong `vfxmap.js` phải bằng 0 (hiện còn 7, vì prefab không có trong bản demo).
