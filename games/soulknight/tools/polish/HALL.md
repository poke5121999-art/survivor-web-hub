# Đặc tả tiện ích Sảnh (Phòng Khách / Nhà Kỵ Sĩ) cho bản web Soul Knight 8.6

Quy ước nguồn: [LOC term] = ~/sk86-ref/decoded/localization_en_vi.json (cột vi); [CFG bảng.khoá] = ~/sk86-ref/decoded/config/*.json; [WEB tệp] = code web; [WIKI url] = trang wiki; (phỏng đoán) = không có nguồn.
Ghi chú nguồn: fandom trả 402 cho WebFetch; số WIKI lấy từ đoạn trích WebSearch (soul-knight.fandom.com/wiki/Safe, /Fridge, /Garden, /Drinks, /Gems) và https://www.touchtapplay.com/how-do-i-use-the-forge-table-in-soul-knight/. Đã dùng hết 6 lượt web. Số WIKI có thể là bản cũ hơn 8.6.
Mức khả thi: A dễ (một màn hình + localStorage), B vừa (cần dữ liệu/kinh tế khác làm trước), C lớn (cả một khu / hệ thống riêng), D bỏ (mạng, tiền thật, quảng cáo, thiếu dữ liệu).

## 0. Hiện trạng web (đã đọc code)

- [WEB data/sk-hall.js] 22 ô nội thất: fridge, plutus_cat, trash_can, hostess, hire_board, gallery, mail_box, chest, safe, plant, books, tv, postman, egg_machine, carpet, table, sofa, pet_food, handbook_entry, arcade_machine, drink_seller, fish_bowl; kèm `door` (cổng vào ải), `deco` (đồ trang trí theo nhân vật). Chỉ vẽ; `walkable()` có hộp chặn từ collider, chưa có "đứng gần + bấm tương tác".
- [WEB js/lobby.js] `SK.profile` (localStorage `sk.profile.v1`) chỉ có `gems, unlocked, skills, level, skin, won, diff, factors`. KHÔNG có kho vật liệu, hạt giống, ngày, két sắt, số lần đã nhặt vũ khí. `buy()` (trả đá), `fakePay()` (thanh toán giả), `openShop()` (gói đá giả) dùng lại được.
- [WEB js/game.js:271] `SK.emit('runEnd', G, {won, stage, kills, gold})` là điểm móc trả thưởng cuối ván. Hiện không có chỗ nào cộng đá từ vàng. [WEB js/rooms.js:948] đồ uống (buff tạm) chưa có.
- [WEB data/sk-weapons86.js] 503 vũ khí có `grade` 0..5 (trắng..đỏ), 6 = thần thoại: dùng cho điều kiện rèn.
- Bản gốc còn khu Xưởng (phải), Vườn (trái), Khu Phép Thuật, Hầm; web mới có một phòng chính (bounds [-23,-10,17,12]).
- Phân biệt: lò đúc/khởi nguyên/dung hợp, Thợ Thủ Công, Hồ Ước Nguyện, máy rút thưởng, huấn luyện viên là phòng/NPC TRONG ẢI (random_objects.weapon_provider...), không phải đồ đặt cố định trong sảnh. Ghi ở đây để khỏi lẫn.

## 1. Bảng tiện ích

### 1.1 Phòng chính (22 slot + vài vật trang trí)

| # | Term / slot | Tên Việt | Mô tả / lời thoại chính thức | Chức năng (vào / ra / tốn) | Config | Khả thi |
|---|---|---|---|---|---|---|
| 1 | object/door_enter, `door` | Cổng vào ải | "Cánh cửa kết nối dị thế giới! địa lao đầy nguy hiểm ngay trước mắt, bạn đã sẵn sàng chưa…" [LOC object/door_enter_disc]; nút "Xuất phát!" [LOC Object_room_door] | Đã làm (bảng chế độ). Gốc: cổng vào chung các chế độ [LOC entry_ui/play_modes_entry] | map_levels | xong |
| 2 | Object_tv, `tv` | Xem tivi | "Xem TV một chút, tiện thể đổi vài món đồ ngon" [LOC object/tv_disc]; thành tựu: đứng trước tivi >= 5 phút [LOC ac/desc_22] | Gốc: xem quảng cáo đổi quà. Web: bấm xem giả lập 5 giây, thưởng nhỏ 1 lần/ngày (phỏng đoán); bộ đếm đứng gần 300 s cho thành tựu | achievements | D (quảng cáo thật), A (bản giả lập) |
| 3 | Object_safe, `safe` | Két Sắt | "Vàng ban đầu" [LOC Object_safe_info] | Nâng cấp bằng đá, mỗi cấp tăng vàng khởi đầu mỗi ván. WIKI: mở sau khi qua ải 2-2; cấp 1 +2 vàng giá 500 đá, cấp 5 +10 vàng giá 2500 đá [WIKI soul-knight.fandom.com/wiki/Safe]. Nội suy các cấp giữa (phỏng đoán): +2/+4/+6/+8/+10, giá 500/1000/1500/2000/2500. Cộng vào `p.gold` ở `startRun`. Tip: tăng cấp vật phẩm trong phòng nhận cường hóa vĩnh viễn [LOC I_tip_12]; tiêu đề "Nội Thất Thuộc Tính Cơ Bản / Cấp hiện tại" [LOC title/attribute_furniture, _current_level] | (không có bảng) | A |
| 4 | Object_fridge, `fridge` | Tủ Lạnh | Chỉ có tên [LOC Object_fridge] | WIKI: mở Cửa hàng Đá (bản cũ), sau bị NPC Friggy thay [WIKI soul-knight.fandom.com/wiki/Fridge]. Trong 8.6 không có chuỗi mô tả hiệu ứng ăn uống. Web: gắn tương tác = `openShop()` có sẵn (thanh toán giả). Có thể là một trong "nội thất thuộc tính cơ bản" (phỏng đoán) | - | A |
| 5 | Object_plutus, `plutus_cat` | Mèo Chiêu Tài | "Nhà phát hành hỗ trợ" / "Cá Khô Cống Hiến" [LOC Object_plutus_info1..3]; "Mua Cá Khô được nhận Trọng Đãi Mèo Chiêu Tài và đổi thương phẩm hiếm!" [LOC tips/fishchip] | Bán Cá Khô (tiền thật) rồi đổi ở Tiệm Cá Khô: pet, skin kỵ sĩ, Vé Liên Vận, nâng chuyển phát +600 đá/ngày [LOC mall/ui_fish_chip_get_reward_0..3]. Web: mua Cá Khô = `fakePay`, tiệm = danh sách cố định | items.material_fish | D (thanh toán thật), B (bản giả lập) |
| 6 | Object_postman, `postman` | Nhân Viên Chuyển Phát | "Bạn có bưu kiện, vui lòng ký nhận" / "Mai gặp" [LOC Object_postman_talk, _gone]; "Gói Hàng" [LOC item/daily_pkg] | 1 lần/ngày: 500 đá + 1 gói chứa 1 vũ khí ngẫu nhiên; xem quảng cáo thêm 500; "Tăng dịch vụ chuyển phát nhanh" cho 600 đá/ngày [WIKI soul-knight.fandom.com/wiki/Gems; LOC item/postmanUpgrade_desc +100 (so với 500 ghi trong wiki thì 600 khớp LOC mall/ui_fish_chip_get_reward_3)]. Web: lưu `lastDay`, bỏ nhánh quảng cáo; nâng cấp = `fakePay` | items.material_postman_upgrade | A |
| 7 | mail_box | Hộp thư | "Còn / Thời hạn / Xóa / Xóa đã đọc / Nhận / Nhận nhanh / Hộp thư trồng..." [LOC mailbox/*]; thư chào "Huấn luyện đạt" [LOC mailbox/welcome_title] | Danh sách thư hệ thống kèm quà (thưởng thành tựu [LOC mailbox/achievement_reward], hoàn phí nghiên cứu [LOC mailbox/research_back]). Web: kho thư cục bộ; thành tựu, bàn thiết kế, cảnh sát đẩy thư vào đây | achievements | A |
| 8 | hire_board | Bảng tuyển (Tùy Tùng) | Không có chuỗi riêng. Liên quan: [LOC object/trainer_talk "Muốn huấn luyện Tùy Tùng của bạn không"] (phỏng đoán) | Nhiều khả năng tương tác nối máy. Web bỏ | - | D |
| 9 | gallery, object/gallery | Standee | Chỉ tên [LOC object/gallery] | Trưng bày hình nhân vật đã mở khóa. Chỉ xem | - | A |
| 10 | chest, Object_chest | Rương | "Cất vật phẩm" [LOC object/chest_talk_store]; "1 vũ khí miễn phí cho mỗi lượt" [LOC Object_chest_L1] | Chọn 1 vũ khí đã cất mang vào ván tiếp. Web: danh sách vũ khí đã mở (mục 2.4), `startRun` nhét vào kho | weapons | B |
| 11 | plant, Object_plant | Cây Cảnh | Chỉ tên [LOC Object_plant] | Trang trí; nói chuyện ngắn | - | A |
| 12 | books, Object_book | Sách | Chỉ tên [LOC Object_book] | Trang trí; gộp với Sổ Tay | - | A |
| 13 | handbook_entry, Object_cellar | Hầm / Sổ Tay Soul Knight | "Cái gì cũng có, đúng rồi, chính là bách khoa toàn thư." [LOC handbook/disc]; "Cổng vào bộ sưu tập như thành tựu, đồ giám…" [LOC entry_ui/collection_entry]; thưởng thành tựu nhận trong Hầm [LOC I_tip_18] | Cổng mở: Thành tựu (154, mục 2.8), Sổ Tay Quái Thú (khung bạc/vàng, sao [LOC handbook_enemy_*]), Sổ Tay Vũ Khí [LOC handbook_weapon_*], Sổ Tay Skin [LOC handbook_skin_title], Thống kê [LOC statistics/*] | achievements, enemies.CellarSprite | B |
| 14 | egg_machine, object/gashapon_machines | Máy Quay Trứng | "Xoay thử một cái đi, toàn hàng ngon, thật đó!" [LOC object/gashapon_machines_disc]; "Tiêu {0} Đá quay {1} lần?" [LOC ui/egg_machine_ask]; "Số lần hôm nay còn:" / "Hôm nay không thể rút nữa" [LOC item/egg_machine_left, _nomore] | Tốn đá, giới hạn lượt/ngày. Bảng xác suất gốc nằm ngoài máy khách [LOC item/egg_sign]. Mục 2.5 | (không có) | B |
| 15 | pet_food, Object_petfood | Thức Ăn Mèo | "Thức ăn cho pet" [LOC material_grain]; "Được dùng cho Pet ăn" [LOC item/grain_description]; "Món Ăn Ưa Thích": Thịt/Thực Vật/Cá/Robot/Tạp phẩm [LOC pet_food_*]; "Nhấn để tăng độ thân mật, mỗi lần nhấn tăng 1-5 điểm" [LOC pet_taptap_food_prefer] | Cho pet ăn Pet Treats -> thân mật. Web đã có pet đi theo chủ trong sảnh: bấm cho ăn, +1..5 thân mật, tốn 1 `material_grain` (phỏng đoán số lượng) | pets, items.material_grain | B |
| 16 | hostess, Object_hostess | Du Lịch Lợi Hại | "Đổi sang Du Lịch Lợi Hại?" / "Đổi sang trạng thái Du Lịch Bình Thường?" / "Đổi sang chế độ Vô Tận?" / "Đổi sang Chỉ Huy Nhỏ?" / "Du lịch vui vẻ!" [LOC I_hostess_talk1,2,3, I_hostess_loop_talk1, I_hostess_troop_talk1] | Công tắc độ khó Lợi Hại (gốc: mở khi mở hết đồ phòng khách [LOC I_tip_09]; web đang dùng "vượt ải 1 lần"). Gắn NPC gọi `SK.profile.setBadass()` có sẵn | - | A |
| 17 | trash_can, object/trash_can | Thùng Rác | "Muốn bỏ vũ khí hiện tại?" [LOC object/trash_can_talk] | Bỏ vũ khí đang cầm khỏi hòm đồ; chỉ làm khi đã có hòm vũ khí | - | A |
| 18 | carpet, table, sofa, lazy_sofa, magic_circle, cofin, podium, toolbox, tube | Thảm / Bàn / Sofa / chỗ đứng nhân vật | Chỉ trang trí [WEB hall.js DECO] | Không tương tác. Mỗi slot có 6..12 biến thể theo bộ trang trí [CFG hall_object_skins] | hall_object_skins | A (chỉ vẽ) |
| 19 | arcade_machine | Máy Game | "Máy Game đang bảo trì, xin hãy chờ!" / "Các kỹ sư đang nghiên cứu..." / "Đang viết code game..." / "Đang vẽ đồ họa..." [LOC arcade_machine/talk_0..3] | Gốc cũng chưa làm: đọc 4 câu quay vòng | - | A |
| 20 | drink_seller, object/drink_seller | Máy Bán Nước Uống Tự Động | "Muốn vào địa lao à? Uống chút nước ngọt trước đi, hiệu quả gấp đôi!" [LOC object/drink_seller_disc]; "Mua đồ uống không?" / "Máy bán hàng đã bán hết!" [LOC item/drink_seller_talk2, talk1]; "Mua đồ uống" [LOC entry_ui/drink_purchase_entry] | Mở bằng bản vẽ ở Bàn Thiết Kế: 3000 đá + 20 Bình Điện + 20 Linh Kiện + 20 Mỏ Sắt [CFG items.blueprint_room_decorate_drink_seller]. Bán đồ uống mang vào ván tiếp. Bảng ra [CFG random_objects.drink_seller]: bloody_mary, coconut, coffee, juice, tea, wine, redbull, jade_elixir, mỗi loại trọng số 3; milk 1 (cần Defence>1), soda 1, garlic_juice 3 (cần MaxHp>1). Buff từng loại ở mục 2.6. Giá ở sảnh: không có (phỏng đoán 100-300 đá/ly); máy trong ải 5 vàng [LOC guide/dirnk_machine] | random_objects.drink_seller | B |
| 21 | fish_bowl, object/fishbowl | Hồ Cá | "Một bể cá lớn tuyệt đẹp! ... luyện trình câu cá. Đôi khi cũng có thể đem cá ở đây đi để làm vũ khí." [LOC guide/fishbowl]; "Cá Cảnh" [LOC object/fish_bowl_fish] | Mở bằng bản vẽ: 1500 đá + 15 Mỏ Sắt + 2 Mảnh Phép Thuật lam + 15 Gỗ [CFG items.blueprint_room_decorate_fishbowl]. Mini-game câu cá; cá = vũ khí 1 ván (như NPC bán cá [LOC object/weapon_item_fish_talk_0]) | items | B (mini-game) |
| 22 | magic_well | Giếng Phép Thuật | "Giếng nước trong lành" / "Không uống được nữa" [LOC object/magic_well_talk1,2]; uống nước nhận Cầu Năng Lượng, hồi MP +1 [LOC guide/magic_well, magic_well_description] | Mở bằng bản vẽ: 3000 đá + 15 Mỏ Sắt + 5 Mảnh Phép Thuật đen + 5 lam + 15 Gỗ [CFG items.blueprint_room_decorate_magic_well]. Số lần uống/ngày không rõ (phỏng đoán 3); buff mang vào ván kế | items | A sau khi có bản vẽ |
| 23 | statue, object/mysteriou_statue | Tượng Tín Ngưỡng | "Thờ tượng?" / "Tượng trở nên tối đi rồi" / "Cảm giác tràn đầy sức mạnh thần bí" [LOC object/mysteriou_statue_talk1..3]; "Hãy hiến tế nó, bạn sẽ trở nên mạnh hơn! Tất nhiên, mạnh hơn cũng phải trả giá." [LOC object/mysteriou_statue_disc] | Lần thờ đầu mỗi ngày 300 đá, mỗi lần sau +100, tối đa 1300 [LOC guide/mysteriou_statue]. Nhận ngẫu nhiên 1 trong 10 buff Tượng (Phù Thủy, Kỵ Sĩ, Mục Sư, Thích Khách, Tinh Linh, Trộm Cướp, Kỵ Sĩ Thánh, Kỹ Sư, Berserker, Người Sói) [LOC statue/info/1..10, statue_*_name]; kích hoạt khi dùng kỹ năng [LOC skill_active_statue]; trùng thì "Đã có chúc phúc tượng này" hoặc hỏi thay [LOC statue_has_same_statue, statue_is_replace]. Mở bằng bản vẽ: 3000 đá + 20 Mỏ Sắt + 5 mảnh phép thuật lục/cam/tím/đỏ [CFG items.blueprint_room_decorate_mysteriou_statue] | items, random_objects.statue | B |
| 24 | Object_Statistics, Object_Globe | Thống kê / Trái Đất | Số liệu: Thủ Lĩnh và quái đã đánh bại, số lần vượt (thường/Lợi Hại), treo thưởng, tử vong [LOC statistics/*] | Bảng thống kê đọc từ `runEnd` | - | A |

### 1.2 Khu Xưởng (bên phải)

Mở khóa: vượt ải 1-5 ("Vượt 1-5 mở khóa Xưởng") [LOC item/fence_workshop]. "Đang thi công" khi chưa mở [LOC Object_worksign_talk].

| # | Term | Tên Việt | Lời thoại | Chức năng | Config | Khả thi |
|---|---|---|---|---|---|---|
| 25 | object/forge | Bàn Rèn | "Búa nhỏ 40, búa lớn 80! Gì cơ, bạn chỉ dùng một nhát mà đã rèn ra đúng Vũ Khí mong muốn?" [LOC object/forge_disc]; "Không có vũ khí có thể chế tạo" / "Không thể để thêm vũ khí nữa" / "Nguyên liệu không đủ" [LOC object/forge_empty, forge_full, no_enough_material] | Vào: nguyên liệu. Ra: 1 vũ khí dùng 1 ván; kho rèn tối đa 4 [WIKI touchtapplay forge]. Mở rèn: nhận trong ải trắng/lục/lam/tím/cam/đỏ lần lượt 2/3/4/6/6/8 lần [LOC forge/intro_tips_1]; thần thoại: nhận thưởng 1 lần mới rèn, nhận lại đánh thức sức mạnh phong ấn [LOC forge/intro_tips_2]; "Mở khóa rèn vũ khí này (n/m)" [LOC ui/forge_unlock_times]; vũ khí có bản vẽ phải nghiên cứu trước [LOC ui_forge_unlock_by_blueprint]; nút lưu yêu thích [LOC ui_forge_favor_add] | weapons.Materials (579/1045 mục có công thức; 503/503 vũ khí web đều có) | B |
| 26 | object/weapon_station | Bàn Thiết Kế | "Chỉ cần mang nguyên liệu cần thiết, cái gì cũng làm được." [LOC object/weapon_station_disc]; "Chưa thu thập được Bản Vẽ Vũ Khí" [LOC object/weapon_station_no_bluprint]; "Nghiên cứu bản vẽ vũ khí, skin, kỹ năng, cơ giáp…" [LOC entry_ui/research_blueprint_entry] | Nghiên cứu bản vẽ nhặt được để mở khóa: vũ khí (57), tiến hóa vũ khí (118), skin (35), kỹ năng (6), biến thân anh hùng (5), nội thất (4), khung vườn (10), phòng nối máy (11), cơ giáp (13) [CFG items.BluePrint.BlueprintType 7/8/5/4/6/3/0/1/2]. Giá: vũ khí 400-1500 đá (19 cái 1500, 16 cái 500, 8 cái 1000); tiến hóa 500-2000 đá + 5-12 Mảnh Vũ Khí Cổ + vật liệu; khung vườn/phòng nối máy 1500 đá; cơ giáp 3000 đá; biến thân 2000 đá + sách riêng. Hoàn phí khi không còn cần [LOC mailbox/research_back] | items.BluePrint (259) | B |
| 27 | object/mech_room | Bàn Robot | "Ngồi trong buồng lái, bạn ngầu quá!" [LOC object/mech_room_disc]; "Chế tạo cơ giáp (có thể mang vào Nhà Ngục)" [LOC entry_ui/dungeon_mecha_craft_entry] | Chế cơ giáp từ Mỏ Sắt/Linh Kiện/Mảnh Phép Thuật [LOC item/basicMaterial_description1] cộng bản vẽ cơ giáp + mảnh bản vẽ [LOC material_mech_fragment] | items.MechFragment, mounts | C |
| 28 | object/token_machine | Máy Đổi | "Không biết dùng Vé Đổi ở đâu? Lại đây thử xem." [LOC object/token_machine_disc]; "Cần Vé Đổi" / "Không có vật phẩm có thể đổi" [LOC object/token_machine_fail, item/token_machine_nothing] | Vé Đổi đổi lấy vật phẩm; 19 loại vé: vũ khí độ hiếm 0..5, hạt giống 0..5, bản vẽ 0..2, phụ kiện vũ khí, skin, anh hùng [CFG items.TokenTicket: TokenType 1/3/4/5/6/7, ItemLevel = độ hiếm]. Vé phát từ thành tựu (token_weapon_none_0/2/4/5, token_seed_none_0/1 ...) [CFG achievements.AwardList] | items.TokenTicket | A |
| 29 | (trong ải) npc/smith | Thợ Thủ Công | "Bạn thân mến, được gặp bạn đúng là tuyệt vời" [LOC cage/npc_smith_talk_1]; "Cải tiến vũ khí này?" / "Xong rồi" / "Vũ khí không thể cường hóa" [LOC object/smith_dialog, smith_done, smith_weapon_invalid]; hết tiền/vũ khí [LOC object/smith_no_money, smith_no_weapon] | NPC trong ải [CFG random_objects.weapon_provider: npc_smith]. Tốn vàng, cường hóa vũ khí. Làm cùng rooms.js, ngoài phạm vi sảnh | weapon_provider | B |
| 30 | (trong ải) object/furnace, furnace_inverse, furnace_fuse | Lò Đúc Lại / Lò Khởi Nguyên / Lò Luyện Dung Hợp | "Bỏ vũ khí này vào Lò Luyện?" [LOC object/furnace_talk]; "Vũ khí này không thể dung luyện" [LOC object/furnace_invalid]; "Bỏ vũ khí này vào Lò Luyện?" (đặt lại) [LOC item/furence_inverse_talk]; "Cần có 2 vũ khí mới có thể dung hợp" [LOC object/furnace_fuse_not_enough_weapon] | Phòng đặc biệt trong ải [CFG random_objects.weapon_provider: furance, furance_inverse, furance_fuse, wishing_well, npc_weapon_item_fish; điều kiện xuất hiện trong .conditions]. Dung hợp: 76 công thức [CFG weapons.FusionList], ví dụ 4 x weapon_000 -> weapon_240; 2 x weapon_001 -> weapon_016; 5 mục dạng "SourceRange" [CFG weapons.FusionRangeList] | weapons.FusionList | B |
| 31 | (trong ải) object/wishing_well | Hồ Ước Nguyện | "Muốn ném tiền vào hồ?" / "Hết Vàng rồi" / "Không xảy ra gì hết" / "Mặt nước không thay đổi, tiếp tục ném Vàng?" / "Ao nước trở nên tối tăm" [LOC object/wishing_well_*, item/wishing_well_*] | Ném vàng nhận vật phẩm; là nguồn vật liệu hiếm cùng Máy Quay Trứng, phòng súng máy [LOC item/source_general1] | weapon_provider | B |
| 32 | object/alchemy | Bàn Luyện Kim | Chỉ tên [LOC object/alchemy, map/alchemy "Phòng Luyện Kim"] | Không có chuỗi chức năng | - | D |
| 33 | work_shop_skin_* | Trang trí Xưởng | 5 skin: 0 miễn phí, 1 = 8000 đá, 4 = 20000 đá, 2/3 = mã 15 [CFG decorate_skins] | Mua đá (giữ giá), IAP bỏ | decorate_skins | C |

### 1.3 Khu Vườn (bên trái)

Mở khóa: đã mở Xưởng + vượt 1-3 [LOC item/fence_garden].

| # | Term | Tên Việt | Chức năng | Config | Khả thi |
|---|---|---|---|---|---|
| 34 | Object_garden, objects/plantpot | Vườn / Vườn Hoa (ô trồng) | "Trong khu vườn nhỏ đào đào đào, đào được vài thứ kỳ quái? Thì cũng chẳng lạ." [LOC Object_garden_disc]. Ô trồng thêm được: "Vườn Hoa {0}" [LOC cloudsave/plantpot_x_count], material_plantpot_1..4 ItemValue 500 [CFG items]. Thao tác: Trồng [LOC plant_pot/plant], Tưới [LOC objects/plantpot_watering], Bón phân [LOC objects/plantpot_fertilizing], Bỏ [LOC objects/plantpot_shoveling] ("Bỏ cây này thật sao?" [LOC objects/plantpot_shoveling_2]), "Chín Nhanh" [LOC plant_pot/one_click_harvest] có giới hạn lần mỗi ô sau mỗi lần về Nhà [LOC ui/one_click_plant_limit_tip]. Trồng xong phải tưới [LOC teaching/plant_end]; cây khác chu kỳ khác, mai quay lại nhận [LOC tip/tutorial_garden_2]; Phân Bón rút 1 ngày [LOC item/fertilizer_description]; "Không đủ phân bón" [LOC plant_pot/lack_of_fertilizer] | items.Seed, items.material_plantpot_* | B |
| 35 | items/seed | Hạt Giống (47 loại) | Giá trị / độ hiếm [CFG items.Seed ItemValue/ItemLevel]: hành lá 50/0, củ cải 50/1, cây sắt 75/0, hoa bánh răng 75/0, hoa đá 100/0, hoa tảo xanh 100/0, cây sồi 100/1, cây đá 3000/4, nấm vàng 3000/5, bí đỏ 3000/4, nhân sâm/hoa mandala... 10000/4-5. Màn chọn: "Sản xuất: {0}", "Loại thu hoạch: Nhanh/Vĩnh viễn", "Chu kỳ sinh trưởng: {0} ngày" [LOC ui/plantplot_seed_*]. Sản phẩm: pet Hoa Mandala/Hoa Ăn Thịt, buff ngẫu nhiên, vật phẩm ngẫu nhiên, 1 Mảnh Phép Thuật ngẫu nhiên, +1 ô thiên phú, buff Băng ngẫu nhiên [LOC plant/info/*]. Số ngày và sản lượng KHÔNG có trong config (nằm trong prefab); phải đặt, ví dụ (phỏng đoán) hiếm 0..5 = 1,1,2,3,4,5 ngày; ví dụ Hoa Đá/Cây Đá ra đá [LOC item/source_gemPlant] | items.Seed | B |
| 36 | item/fence_magic | Khu Phép Thuật | Mở sau khi mở hết nội thất + vượt 2-5 [LOC item/fence_magic]; "Khu Phép Thuật" [LOC Object_magiczone]; Cửa dịch chuyển cổ đại / mê trận [LOC item/gate_defence, item/gate_modeloop] | Khu lớn nhiều chế độ (Thần Điện Thủ Hộ, Khu Thí Luyện, Mê Trận). Boss Rush đã có ở web | - | C |

### 1.4 NPC và vật phẩm liên quan khác

| # | Term | Tên Việt | Chức năng | Khả thi |
|---|---|---|---|---|
| 37 | Object_officer, Object_quest, object/task_board | Cảnh Sát / Bảng nhiệm vụ | "Treo thưởng mới ra lò! Thật sự không định nhận một cái sao? Phần thưởng đảm bảo hấp dẫn." [LOC object/task_board_disc]. 3 loại: đánh bại, hộ tống, thu thập [LOC Object_quest_type1..3]. Thoại: "Chúc bạn may mắn", "Đây là thưởng của bạn", "Không lẽ bạn muốn bỏ khiêu chiến?", "Muốn nếm mùi thử thách khác lạ không?" [LOC officer/*]. Vé Nhân Tố Thử Thách [LOC item/factorVoucher_description]. Web đã có SK.FACTORS: treo thưởng = chọn nhân tố, hoàn thành ván -> thưởng. Mở khi chơi nhiều ván chế độ Ải [LOC task_bountyTaskPanelLocked]. Thành tựu 1/10/100 lần [LOC ac/desc_9..11] | B |
| 38 | object/trainer | Thầy Huấn Luyện | "Muốn huấn luyện Tùy Tùng của bạn không" / "Tùy Tùng của bạn đâu" / "Huấn luyện thêm không?" / "Không còn gì để dạy nữa rồi" [LOC object/trainer_*]; NPC trong ải [CFG random_objects.random_trainer] | C |
| 39 | npc_retired_knight | Kỵ Sĩ Nghỉ Hưu | "Phế phẩm, trả lại tiền đi!" / "Phân bón sinh hóa không?" [LOC talk/retired_knight_talk_1,2]; quà gặp mặt [LOC npc_retired_knight_talk_01]; đổi vật liệu thường lấy Mảnh Phép Thuật [LOC item/basicMaterial_description1, source_retireKnightConvert]. Tỷ lệ đổi không có (phỏng đoán 10 vật liệu thường : 1 Mảnh Phép Thuật) | B |
| 40 | Object_slot_machine, object/slotmachine | Máy Rút Thưởng / Thử Vận May Bài "Dilili" | "Chỉ cần {0}, không thử sao?" / "Bạn tuyệt quá!" / "Ồ! Giải đặc biệt!" / "Làm ăn nhỏ, vui lòng không ghi nợ" [LOC object/slotmachine_*]. Máy trong ải: thuốc HP/năng lượng thường/lớn (trọng số 10), hồi phục thường/lớn (5), hồi phục tối đa (2) [CFG random_objects.slot_machine] | A (ngoài sảnh) |
| 41 | item/wave_machine | Bộ Dẫn Sóng | Nạp đầy thì chọn 1 nhân vật anh hùng đã mở vào Nhà Kỵ Sĩ [LOC ui/wave_machine_upgrade, guide/hero_char]. Anh hùng mở bằng sách hai mảnh [CFG items.c17..c21_book_1/2] | C |
| 42 | material_hopper_ticket | Vé Liên Vận | "Mỗi ngày lần đầu chơi chế độ đặc biệt không tốn tiền vé" [LOC item/general_token_desc]; Lông Vũ Valkyrie = vé Khu Thí Luyện [LOC item/featherOfValkyrie_description] | A |
| 43 | hall_skin_* | Trang Trí Sảnh | 6 bộ: Nhà Kỵ Sĩ, Thủy Liêm Động, Ngôi Nhà Kỵ Sĩ, Lĩnh Vực Ngắm Sao-Sảnh Nghị Sự, Tàu Chiến Liên Hoàn (1), Phòng Tiếp Khách Của Ouboshi [LOC hall_skin_name_0..5]. Bộ 0 miễn phí; bộ 2 = 5000 đá; bộ 1/3/4/5 = mã 15 (IAP) [CFG decorate_skins]. Mỗi slot có 6..12 biến thể [CFG hall_object_skins] | B |

## 2. Kinh tế

### 2.1 Tiền tệ

| Tiền | Nguồn thu | Chỗ tiêu |
|---|---|---|
| Vàng (trong ván) | Nhặt trong ải; Két Sắt tặng vàng đầu ván. Vàng còn lại cuối ván đổi thành đá [LOC I_tip_10]; tỉ lệ không có trong config (phỏng đoán 1 vàng = 1 đá) | Cửa hàng, máy, phòng trong ải |
| Đá (material_gem; "Tiền dùng được ở nhiều nơi" [LOC item/gem_description]; ItemValue 1 [CFG items]) | Sau mỗi ván thắng/thua [WIKI soul-knight.fandom.com/wiki/Gems]; chuyển phát 500/600 mỗi ngày; 154 thành tựu tổng 25.666 đá [CFG achievements.AwardList cộng awardType 0 material_gem]; gói đá (giả lập) | Mở nhân vật/kỹ năng (đã có), nghiên cứu bản vẽ, Két Sắt, Tượng, Máy Quay Trứng, trang trí |
| Cá Khô (material_fish; "Tiền được dùng ở Tiệm Cá Khô" [LOC item/fishChip_description]) | Mua bằng tiền thật ở Mèo Chiêu Tài (web: fakePay) | Tiệm Cá Khô |
| Vật liệu (7 cơ bản + 7 Mảnh Phép Thuật) | Rơi ở ải, mục 2.2 | Rèn, bản vẽ, cơ giáp, đổi mảnh phép thuật |
| Vé Đổi (token_*, 19 loại, ItemValue 100..1000) | Thành tựu, sự kiện | Máy Đổi |
| Lông Vũ Valkyrie (material_ticket_bossrush) | Cảnh Sát (treo thưởng), Vé Liên Vận [LOC item/br_no_item] | Vào Khu Thí Luyện |
| Mảnh Vũ Khí Cổ (material_ancient_weapon_fragment) | Trùm ải 1A/1B/1C/1G/2A/2B/2C (xác suất 150-175) [CFG enemies.Drops] | Bản vẽ tiến hóa vũ khí (5-12) |

### 2.2 Vật liệu và nơi rơi

Công dụng: Mỏ Sắt/Gỗ/Linh Kiện/Bình Điện/Sinh Khối "dùng để rèn vũ khí ở Bàn Rèn, chế cơ giáp ở Bàn Robot hoặc đổi Mảnh Phép Thuật ở Kỵ Sĩ Nghỉ Hưu" [LOC item/basicMaterial_description1,2]. Mảnh Phép Thuật "dùng để rèn vũ khí và chế robot" [LOC item/magicFragment_description]. Phân Bón rút 1 ngày [LOC item/fertilizer_description]. Nguồn chung "Máy Quay Trứng/Phòng Súng Máy/Kho Ước Nguyện/Treo thưởng" [LOC item/source_general1].

Tổng hợp từ [CFG enemies.Drops] (592 quái). Xác suất >100 (như 150) hiểu là có thể rơi hơn 1 viên (phỏng đoán). "T" = trùm, "q" = quái thường.

| Vật liệu | Rơi ở đâu | Xác suất mẫu |
|---|---|---|
| Mỏ Sắt (material_iron) | 1B Cua Pha Lê T 100, Cua Hoàng Kim T 150, Thợ Mỏ q 4; 1C Vua Khỉ Mặt Vàng T 100; 2A/2B/3A | q 4-6, T 50-200 |
| Gỗ (material_wood) | 1A Người Cây Giáng Sinh T 100, Lính Goblin q 4; 1B Vua Người Tuyết T 50; 3B 5 trùm; 4A | q 4-5, T 50-150 |
| Linh Kiện (material_gear) | 1A Goblin/Goblin Lớn q 4; 1B Thợ Mỏ Tinh Anh q 4; 1G Di Tích Zulan T 50; 2A | q 2.5-6, T 50 |
| Bình Điện (material_battery) | 1B Quái Pha Lê q 4; 1C Tượng Viễn Cổ T 100; 1G Di Tích Zulan T 50; 2G | q 2.5-6, T 50-200 |
| Sinh Khối (material_cell) | 1A Thỏ Trứng Màu T 100, Heo Rừng q 4; 1B Vua Vượn Núi Tuyết T 100 | q 3-5, T 100-150 |
| Phân Bón (material_fertilize) | 1C Khỉ q 4; 2A Slime Lớn T 100; 2C Kỵ Sĩ Không Đầu T 50; 4A Vụ Ảnh Long T 100 | q 4, T 50-100 |
| Mảnh Phép Thuật đỏ/lam/lục/tím | 1A Thầy Tế Goblin T 7.5 (4 màu); 2A Phù Thủy Lớn T 12 (7 màu); 3B Rồng Bay Con (đỏ) T 100; 1G Di Tích Zulan (lam) T 100; 2D Sâu Băng Hang Động (lục) T 100; 3A Thủ Lĩnh Wackern (tím) T 100 | 7.5-12 hoặc 100 |
| Mảnh Phép Thuật cam | 1C Vua Khỉ Mặt Vàng T 10; 2A Phù Thủy Lớn T 12; 3B Anubis T 100 | |
| Mảnh Phép Thuật đen/xanh | 3A Đĩa Nổi Laser (đen) T 100; 3C Cướp Biển Sắt "Cấp Vua" và Kẻ Phá Sóng (xanh T 100; đen/lam/lục 7.5) | |
| DropGroups | boss_monolith_lower, boss_stone_dragon, boss_stone_man...: nhóm 7 màu phép thuật, mỗi màu 14% [CFG enemies.DropGroups] | |
| Hạt giống | Trùm 1A: datura 6.6, eator 10, trumpet 10, gear_flower 10, gem_flower 10, gem_tree 7, iron_tree 12.5, tree 12.5, xmas 12.5; 1B: lotus 25, nấm vàng 10, nấm pha lê 7.5; 2A: heptacolor 50-70; 2C: lycoris 50; 2D/3B: worm 15; 3A: mandrake 15; 3B: dragon_tree 15; carrot 50; bí đỏ 0.1 ở 14 quái 2C [CFG enemies.Drops] | |
| Bản vẽ | Trùm: blueprint_m_mech_3 (2B) 10, m_mech_4 (3A) 15, weapon_344 (3B) 10, weapon_385 (4B) 20, bossrush 17 | |
| Rác câu cá | Cá Khô Nhựa, Vịt Vàng, Mảnh Rách Nát... [LOC trash_*] | Bỏ ở Thùng Rác |

Khoá `LevelKey`: 1..4 là ải lớn, A..G biến thể; rỗng = trùm đặc biệt ngoài chế độ Ải. EnemyId trùng với `SK.bossRegister` của web (tra theo `boss07`...).

### 2.3 Công thức rèn mẫu (weapons.Materials)

Trung bình mỗi vũ khí theo độ hiếm web [tính từ CFG weapons.Materials nối với WEB sk-weapons86 grade]:

| Độ hiếm | Số vũ khí | Trung bình (sắt / linh kiện / gỗ / pin / sinh khối) | Ví dụ thật |
|---|---|---|---|
| 0 trắng | 132 | 1.8 / 0.7 / 1.5 / 0.2 / 0.3 | weapon_000 = 1 sắt + 1 linh kiện + 1 gỗ; weapon_001 = 1 gỗ + 2 sắt; weapon_003 = 2 sắt + 3 linh kiện + 2 gỗ |
| 1 lục | 73 | 2.1 / 1.0 / 1.4 / 0.3 / 0.5 (+2 đá) | weapon_006 = 3 sắt + 2 linh kiện; weapon_011 = 1 gỗ + 3 sắt |
| 2 lam | 89 | 2.7 / 1.0 / 1.7 / 0.6 / 0.5 (+3.4 đá) | weapon_009 = 3 sắt + 3 linh kiện; weapon_010 = 2 sắt + 1 linh kiện + 1 gỗ |
| 3 tím | 83 | 3.6 / 2.3 / 2.6 / 1.1 / 0.4 (+0.3 phép lam) | weapon_035 = 6 sắt + 6 linh kiện + 3 pin + 1 phép lam; weapon_041 = 6 sắt + 6 linh kiện + 2 phép lục; weapon_043 = 4 gỗ + 5 linh kiện + 5 sắt + 1 phép đỏ |
| 4 cam | 41 | 4.5 / 3.7 / 2.2 / 1.9 / 1.8 (+3.7 đá) | weapon_028 = 10 sắt + 10 linh kiện; weapon_033 = 8 sắt + 8 linh kiện + 4 pin + 3 phép đỏ; weapon_047 = 7 linh kiện + 7 sắt + 1 phép tím + 2 phép đỏ |
| 5 đỏ | 57 | 4.9 / 2.0 / 2.7 / 1.3 / 1.3 (+8.9 đá) | weapon_077 = 14 sắt + 5 gỗ + 1 phép đỏ + 1 phép lục; weapon_095 = 18 sắt + 2 phép lam + 1 phép lục; weapon_116 = 16 gỗ + 2 phép tím + 1 phép lục |
| 6 thần thoại | 28 | 1.4 / 2.0 / 0.9 / 0.6 / 0.6 | weapon_mythic_00 = 6 sắt; mythic_01 = 6 linh kiện; mythic_02 = 1 phép đỏ + 1 phép lam; mythic_03 = 3 sắt + 1 phép xanh |
| Biến thân anh hùng | 4 | | transform_weapon_envoy = 1 xanh + 1 đỏ + 1 lam; ninja = 1 đỏ + 1 lam; specialforces = 1 đỏ + 1 lam + 1 lục; transcendent = 1 đen + 1 tím; Price 1000 [CFG weapons.transform_weapon_*] |
| Vòng (ring_0..3) | 4 | | 4 sắt mỗi cái |

- Bảng đầy đủ: `weapons.json[khoá].Materials`; `Price` 0/50/100/150/200 theo độ hiếm (đá trắng 0, lục 50, lam/tím 100, cam 150, đỏ 200) [CFG weapons.Price]; `OriginalWeapon` trỏ vũ khí gốc của bản tiến hóa.
- Tiến hóa: 118 bản vẽ tiến hóa (5-12 Mảnh Vũ Khí Cổ + 500-2000 đá + vật liệu) [CFG items.blueprint_evolution_*]; hòm mảnh tiến hóa theo màu, mảnh "chung" thay mảnh cùng cấp [LOC material_weapon_fragment_chest_*, material_generic_weapon_fragment_desc]. Web chưa có hệ tiến hóa: để sau.
- Dung hợp: 76 vũ khí có FusionList, ví dụ weapon_000 x4 -> weapon_240 [CFG weapons.FusionList].

### 2.4 Điều kiện mở "có thể rèn"

- Cần `P.picked[weaponId]` đếm số lần nhặt trong ải. Ngưỡng theo độ hiếm 2/3/4/6/6/8 (trắng đến đỏ) [LOC forge/intro_tips_1]. (Câu "nhận vũ khí 8 lần" [LOC object/station_tips] và WIKI touchtapplay là bản cũ: dùng bảng 2/3/4/6/6/8.)
- Thần thoại: nhận thưởng 1 lần mở rèn, nhận lại mở sức mạnh phong ấn [LOC forge/intro_tips_2].
- 57 vũ khí có bản vẽ (blueprint_weapon_*): phải nghiên cứu ở Bàn Thiết Kế [LOC ui_forge_unlock_by_blueprint].
- Vũ khí rèn dùng 1 ván; kho tối đa 4 [WIKI touchtapplay].

### 2.5 Máy quay trứng ra gì

- Tốn đá theo lượt, quay 1 hoặc nhiều lần; số lần mỗi ngày có hạn [LOC ui/egg_machine_ask, item/egg_machine_left].
- Nhóm thưởng (sự kiện xuân 2025): skin và mảnh skin 7%, nhân tố thử thách 15%, vũ khí 26%, đá 9%, thuốc nổ 5%, khác 13% [LOC ui/spring_2025_egg_desc_3]; hè 2023: skin 8, nhân tố 32, vũ khí 35, đá 9, bom 3, khác 13 [LOC ui/summer_2023_egg_desc_3]; Tết 2024: skin 8, nhân tố 25, vũ khí 20, đá 9, bom 5 [LOC ui/new_year_2024_egg_desc_4]. Tổng xuân 2025 = 75%, 25% thiếu không giải thích được (phỏng đoán: làm tròn hoặc nhóm khác bị cắt chuỗi).
- Bảo đảm: 19 lần không ra skin thì lần 20 chắc ra skin hoặc mảnh [LOC ui/2025_egg_june_intro_desc_1].
- Bảng thật chỉ có trên web chính thức [LOC item/egg_sign, item/egg_tips_detail], và KHÔNG có bảng "gashapon" trong [CFG random_objects]. Bảng liên quan nhất: `egg_buff_element` (13 hiệu ứng nguyên tố đạn: buff_posion 10, buff_ele 7, buff_fire 10, buff_lightning 10, buff_ice 7, explode_s_hit_enemy/hit_enemy/poly/energy/energy2 10, Fire2 7, Gas2 7, bullet_frost 5).
- Đề xuất cho web (phỏng đoán): 100 đá/lượt (10 lượt 900), 20 lượt/ngày; vũ khí 35% (độ hiếm trắng/lục/lam/tím/cam = 55/25/12/6/2), vật liệu 25%, hạt giống 10%, đá 10%, nhân tố thử thách 10%, mảnh skin 5%, thuốc nổ gộp vào đá; bảo đảm mảnh skin sau 19 lượt.

### 2.6 Tủ lạnh / đồ ăn / đồ uống buff

- Tủ Lạnh: xem hàng 4, không có buff ăn uống trong 8.6. "Đồ ăn buff" thực tế là đồ uống ở máy bán nước sảnh và trong ải; "Nữ Đầu Bếp" (31 món [LOC cooking/0..31]) là sự kiện, bỏ.
- Buff đồ uống [LOC drink_*_desc]: vang +HP tối đa, dừa +hộ giáp tối đa, nước ép +năng lượng tối đa, Mary Khát Máu +bạo kích, sữa +phòng thủ, cà phê +tốc độ tấn công, trà +1 ô thiên phú, nước lãng quên bỏ thiên phú gần nhất, soda giảm thời gian chờ kỹ năng, sen: HP tối đa +1 và năng lượng tối đa +40 [LOC drink_lotus_desc]. Con số cộng cụ thể không có (phỏng đoán): vang +1 HP, dừa +1 hộ giáp, nước ép +40 năng lượng, Mary +5% bạo kích, sữa +1 phòng thủ, cà phê +10% tốc đánh. Không dùng các `monsrise/drink*_desc` (chế độ Quái Thú).
- Giếng Phép Thuật: Cầu Năng Lượng +1 MP [LOC guide/magic_well]. Máy trong ải 5 vàng 1 ly ngẫu nhiên [LOC guide/dirnk_machine].

### 2.7 Két sắt, Mèo Chiêu Tài, Chuyển phát

- Két sắt: hàng 3 (số liệu WIKI), mở khi `won` có ải 2-2.
- Mèo: Cá Khô là tiền thật; web chỉ làm fakePay, hàng trong tiệm cố định [LOC mall/ui_fish_chip_get_reward_0..3, I_FishChipSkin, multi_room_skin_ui_fish_chip_store "Tiệm Cá Khô bán không định kỳ"].
- Chuyển phát: 500 đá/ngày (600 sau nâng cấp) + gói hàng ngẫu nhiên; nâng cấp = 20 Cá Khô [WIKI fandom Gems, Safe qua WebSearch].

### 2.8 Thành tựu

- 154 thành tựu [CFG achievements]; mỗi cái có `UnlockConditionList` (achievementType, targetInt, targetHero), `AwardList` (đá, mảnh phép thuật, phân bón, vé đổi, hạt giống). Tổng đá 25.666; Mảnh Phép Thuật lam/lục/tím/đỏ mỗi màu 14, đen/cam mỗi màu 3; Phân Bón 10; vé hạt giống hạng 1 x6, hạng 0 x4; vé vũ khí hạng 0/2/4/5.
- Loại điều kiện: kill 100/1000/10000 [LOC ac/desc_1..3], vượt 5/20/100 [ac/desc_4..6], treo thưởng 1/10/100 [ac/desc_9..11], 800 vàng trong một lần [ac/desc_14], tivi 5 phút [ac/desc_22], hạ 500 quái mở thú cưỡi [ac/desc_23..26]; 30 cái dạng điều kiện 16 (theo nhân vật).
- Nhận thưởng trong Hầm [LOC I_tip_18] hoặc qua thư [LOC mailbox/achiv_content].

## 3. Thứ tự làm đề xuất

Phụ thuộc: tương tác sảnh + kho đồ -> rơi vật liệu -> tiêu (két, đổi, rèn) -> tiêu mở rộng (gacha, vườn, nội thất) -> khu mới.

1. Nền: tương tác sảnh, kho đồ, thư (A)
   - `SK.profile` thêm: `inv{key:n}`, `picked{weaponId:n}`, `day` (YYYY-MM-DD cục bộ), `daily{postman,egg,statue,well}`, `mail[]`, `safe` (cấp), `ach{id:{done,claimed}}`, `stats{kills,boss,pass,dead,wanted}`.
   - hall.js: `nearest(slot)` bán kính ~2 đv quanh `me`, hiện tên Việt chính thức, phím F/Enter/chạm; bảng `HALL_USE={slot:fn}`; thoại lấy từ LOC, hộp thoại dùng `dialog()` của lobby.
   - `SK.on('runEnd')`: vàng còn -> đá [LOC I_tip_10], cộng thống kê, ghi `picked` mỗi lần nhặt vũ khí, đẩy thư thưởng.
   - Hộp thư: `SK.mail.push({title,body,reward})` + `claim()`.
2. Rơi vật liệu, hạt giống, bản vẽ (B)
   - Sinh `data/sk-drops.js` từ [CFG enemies.Drops]: khoá EnemyId, mục {item,p}; p>100 => 1 chắc chắn + (p-100)% thêm.
   - actors.js: khi quái/trùm chết tung xúc xắc, hiện nhãn nhặt, ghi vào `inv` lúc nhặt (không mất khi chết, như gốc).
   - Màn "Nguyên liệu" xem số đã có [LOC entry_ui/material_check_entry].
3. Két Sắt, Chuyển phát, Máy Đổi, Thùng Rác, Du Lịch Lợi Hại, Gallery, Máy Game (A)
   - Két: cấp 0..5, giá 500..2500, vàng đầu ván +2/4/6/8/10, mở khi `won` có 2-2.
   - Chuyển phát: `claimPostman()` 1 lần/ngày, +500 đá (+100 nếu đã nâng cấp bằng fakePay) và 1 vũ khí ngẫu nhiên vào hòm.
   - Máy Đổi: đọc vé `token_*` trong `inv`, lọc vũ khí/hạt giống theo `ItemLevel`; vũ khí có `grade` sẵn.
   - Hostess gọi `setBadass()`; Thùng Rác bỏ vũ khí hòm.
4. Bàn Thiết Kế rồi Bàn Rèn (B)
   - Bản vẽ vào `inv` (bước 2); Bàn Thiết Kế liệt kê bản vẽ, kiểm `ResearchMaterials`, trừ vật liệu và đá, đánh dấu `P.devd[key]`.
   - Bàn Rèn: lọc vũ khí `picked >= [2,3,4,6,6,8][grade]` (và đã nghiên cứu nếu có bản vẽ); trừ `Materials`; đẩy `P.forged` (tối đa 4); `startRun` nhét 1 món rèn, dùng xong bỏ.
   - UI "Mở khóa rèn vũ khí này (n/m)" [LOC ui/forge_unlock_times].
5. Rương, Máy Quay Trứng, Mèo Chiêu Tài (B)
   - Rương chọn 1 vũ khí mang vào ván.
   - Máy Quay Trứng: bảng ở 2.5, 20 lượt/ngày, bộ đếm bảo đảm 19.
   - Mèo: tiệm Cá Khô giả lập dùng khuôn `fakePay`.
6. Vườn (B/C)
   - Màn overlay "Vườn" 4 ô (đủ cho web, khỏi vẽ khu mới); `plots[{seed,plantedDay,watered,fert}]`.
   - Trồng hạt trong `inv`, Tưới đặt `watered`, mỗi ngày qua chạy `grow()`, Phân Bón -1 ngày, Chín Nhanh tốn phân bón.
   - Sản phẩm theo [LOC plant/info/*] và bảng tự đặt (không có trong config).
7. Nội thất mở bằng bản vẽ: Máy Nước, Hồ Cá, Giếng, Tượng (B)
   - Mỗi cái cần bản vẽ (nguồn bản vẽ chưa rõ; gợi ý Thương Nhân Thần Bí [LOC item/source_bossshop]) nghiên cứu ở Bàn Thiết Kế.
   - Tượng: 300 đá lần đầu mỗi ngày +100/lần, tối đa 1300; buff 1/10 mang vào ván, kích hoạt khi dùng kỹ năng (cần hook trong skills.js).
   - Máy nước: bảng đồ uống 2.6; cần `P.drinks` mang vào ván (hiện rooms.js:948 bỏ đồ uống).
   - Giếng: Cầu Năng Lượng +1; Hồ Cá: mini-game câu cá, cá = vũ khí 1 ván.
8. Sổ Tay, thành tựu, thống kê (B)
   - `data/sk-ach.js` sinh từ achievements.json; ánh xạ `achievementType` cho ~25 loại phổ biến (kill, pass, treo thưởng, tivi, hạ N quái); loại lạ bỏ qua. Thưởng gửi thư.
   - Sổ Tay Quái/Vũ khí: lưu `seen/kills`; ngưỡng khung bạc/vàng không có trong config (phỏng đoán).
9. Khu Xưởng, Cảnh Sát (treo thưởng), trang trí sảnh, Bộ Dẫn Sóng, Bàn Robot, Khu Phép Thuật, Huấn Luyện (C)
   - Treo thưởng dùng SK.FACTORS có sẵn.
   - Trang trí sảnh: mua bằng đá (bộ 2 = 5000), bỏ IAP.
   - Các mục còn lại làm cuối.

## 4. Lỗ hổng dữ liệu

- Không có trong config tải về: công thức Két Sắt, xác suất Máy Quay Trứng, giá đồ uống ở sảnh, chu kỳ và sản lượng cây, tỉ lệ Kỵ Sĩ Nghỉ Hưu, ngưỡng Sổ Tay, hiệu ứng Tủ Lạnh. Mọi số tương ứng là (phỏng đoán) hoặc [WIKI] bản cũ.
- Cần kiểm chứng bằng clip YouTube (skill watch-game-clips): Két Sắt, Vườn, Máy Quay Trứng, Tủ Lạnh.
- `hire_board`, `Object_book`, `alchemy` chỉ có tên: không đủ để đặc tả.
