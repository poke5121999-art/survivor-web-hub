# Tầng 4 (4A / 4B / 4C) của Chế độ Ải bản 8.6.0: đặc tả cho bản web

Nhãn: [LOC khoá] = ~/sk86-ref/decoded/localization_en_vi.json; [CFG bảng.khoá] = ~/sk86-ref/decoded/config/*.json; [AB đường dẫn] = ~/sk86-ref/UnityDataAssetPack/assets/AssetBundles (chỉ đọc `.manifest`, không mở `.ab`); [WIKI trang] = soul-knight.fandom.com qua `api.php?action=parse` (web chính trả 402, API trả 200; ĐO 2026-10-10); [WEB tệp] = mã/dữ liệu trong repo; [SUY] = suy luận; (phỏng đoán) = chưa có nguồn.

## 0. Kết luận
1. CÓ. Tầng 4 là "ải mở rộng" của Chế độ Ải thường [LOC extended_level; normal_mode_intro_tips0-1]: "mỗi trận gồm 3 ải cơ bản và 1 ải mở rộng", sang được nhờ NPC Kẻ Vượt Ranh Giới sau khi hạ trùm 3-5. Có 3 vùng: 4A Di Tích Núi Khối, 4B Chiến Trường Cổ, 4C Đáy Biển [LOC level/4A, level/4B, level/4C]. "5A Đáy Biển" đã bị gộp vào 4C từ bản 7.2.0 [LOC tips/5a_Cancelled; WIKI Levels]; trong bundle không còn thư mục level/5.
2. "Tiền tuyến cổ đại" ở thẻ chế độ của web KHÔNG phải một chế độ riêng trong config: biểu tượng là `ui_game_entry_new_icon_guji` [WEB art/lobby/build_lobby_art.py:58-59], chuỗi LOC duy nhất là `ui/game_entry_guji_banner` = "Ancient Warfront" / "Bãi Chiến Tích" (một dòng biển hiệu), không có mô tả, không có khoá gamemode/*, không có map_* hay enemies.* mang tên này [CFG map_levels, enemies, achievements; LOC]. Tìm wiki "Ancient Warfront" trả "Ancient Battleground" (4B) là kết quả đầu [WIKI opensearch]. Suy ra (SUY): thẻ quảng bá tầng 4 mới (4B thêm ở 6.4.0 [WIKI Update 6.4.0]) trong màn chọn chế độ; không có điều kiện vào riêng.
3. Điều kiện vào thật: sau khi hạ trùm 3-5 ở Chế độ Ải thường một người, Kẻ Vượt Ranh Giới hiện, mở cổng tím "Extra Level" với giá 100 vàng, hoặc 1 HP tối đa nếu không đủ vàng; cổng xanh dẫn tới 3-6 kết thúc game [WIKI Inter-dimension Traveler, Ancient Battleground, Monolithic Range Ruins, Undersea]. Miễn phí ở Khu Thí Luyện và khi chơi chính nhân vật Kẻ Vượt Ranh Giới; không bao giờ có ở Mê Trận Tà Vương (xem MODES.md 2d) và khi mang Nhân Tố Mộng Du (Sleepwalk, "Thứ tự Nhà Ngục bị làm rối"); ở Xâm Nhập Hư Không thì hạ Hư Không ở 3-5 mở cả hai cổng miễn phí (MODES.md 2e) [WIKI idt, VI].
4. Web chưa có gì của tầng 4 ngoài 4 mẫu phòng của 4B đã nằm trong dữ liệu nhưng chưa ai dùng (xem 7). Phải bóc 3 vùng, 17 quái, 9 trùm.

## 1. Bố cục từng ải (config + wiki)
Ải tầng 4 là `map_A16..A20` (4A), `map_B16..B20` (4B), `map_C16..C20` (4C), nhãn "4月1日..4月5日" [CFG map_levels; nhãn "N月M日" = ải N-M, ví dụ map_A4 "1月4日" là 1-4]. Không có map cho 4-6: ải kết thúc dùng `map_GameOver` nhãn "3月6日" [CFG map_levels]; wiki mô tả 4-6 là ải 2 phòng có bàn thờ Đá Phép như 3-6 [WIKI Levels]; (phỏng đoán) dùng lại phòng 3-6 với nhãn 4-6.

| Ải | Điểm khác theo wiki [WIKI Levels, AB, MMR, Undersea] |
|---|---|
| 4-1 | ải thường |
| 4-2 | ải thường; có chọn thiên phú cuối ải (4-2 "Buff at the end of level") |
| 4-3 | 4A: trùm Chân Tổ Tiên + Gian Thương; 4B: ải 4-3 đặc biệt (xem 4B) + trùm Lý Thôi hoặc Hoa Hùng + Gian Thương; 4C: không có trùm. Từ bản 6.5.0 Gian Thương bỏ ở 4-3 rồi lại hoàn lại [WIKI Levels Trivia] |
| 4-4 | ải thường |
| 4-5 | trùm cuối vùng + Gian Thương |
| 4-6 | ải kết (Đá Phép) |

Trùm phòng: ải thường dùng cổng r_transgete; ải có trùm thay bằng phòng trùm [WIKI Level Mode: "x-5 (kể cả x-3 cho tầng 4) là phòng trùm"].

Bảng bốc quái mỗi ải [CFG map_levels.map_A16..A20, B16..B20, C16..C20.Enemies; ba số cuối cột là weight; maxCountPerWave luôn 0, conditions rỗng]:

4A (quái: e_stone_man "Golem - Chiến Binh", e_stone_horse "Ngựa", e_stone_dog "Chó Săn", e_stone_eagle "Đại Bàng", e_stone_ox "Bò", e_stone_chariot "Xe Ngựa", e_origin_stone "Đá Thô"):
| Ải | man | eagle | dog | horse | ox | chariot | origin_stone |
|---|---|---|---|---|---|---|---|
| 4-1 | 40 | - | 30 | 20 | - | - | 5 |
| 4-2 | 40 | 10 | 20 | 20 | - | - | 5 |
| 4-3 | 30 | 15 | 20 | 15 | 10 | - | 5 |
| 4-4 | 30 | 10 | 10 | 20 | 15 | 15 | 5 |
| 4-5 | 30 | 10 | 5 | 10 | 15 | 20 | 5 |
4B (e_mob0 Lính Giáo Dài, e_mob1 Lính Cung, e_mob2 Lính Kỵ, e_mob3 Lính Quạt, e_mob4 Lính Địa Lôi, e_mob5 Lính Bắt Lưới):
| Ải | mob0 | mob1 | mob2 | mob3 | mob4 | mob5 |
|---|---|---|---|---|---|---|
| 4-1 | 85 | 0 | 5 | - | 10 | - |
| 4-2 | 70 | 5 | 5 | - | 10 | - |
| 4-3 | 78 | 3 | 3 | 3 | 10 | 3 |
| 4-4 | 78 | 3 | 3 | 3 | 10 | 3 |
| 4-5 | 78 | 3 | 3 | 3 | 10 | 3 |
4C (e_seabed_mob0 Thủy Thủ Ký Sinh, mob1 Người Hầu Kraken, mob2 Thể Thí Nghiệm-001, mob3 -002, mob4 -003, mob5 -004):
| Ải | mob0 | mob1 | mob2 | mob3 | mob4 | mob5 |
|---|---|---|---|---|---|---|
| 4-1 | 40 | 35 | 20 | - | - | - |
| 4-2 | 35 | 32 | 22 | 8 | - | - |
| 4-3 | 40 | 30 | 25 | 15 | 10 | - |
| 4-4 | 40 | 30 | 27 | 15 | 10 | 8 |
| 4-5 | 40 | 30 | 30 | 20 | 15 | 10 |
(wiki ghi 004 chỉ ở ải 4 và 5, 003 từ ải 3, đúng khớp bảng.)
Phòng trùm trong config (Level/4/*/Boss/*/r4_*.prefab, weight 10 đều) [CFG map_levels]:
- map_A18 (4-3): boss_monolith_lower. map_A20 (4-5): boss_stone_man, boss_warlord, boss_stone_dragon.
- map_B18 (4-3): boss_huaxiong, boss_lijue. map_B20 (4-5): boss_dongzhuo, boss_lvbu.
- map_C20 (4-5): boss_abyssal_submariner. map_C18 không có trùm.
Các map tầng 4 KHÔNG có StartRooms/ChestRooms/SpecialRooms riêng (trống): dùng bể `map_level_base` chung (chest 2 : r_sell 2 (từ ải chỉ số >= 2) : r_chest_battery 1 (>= 3); đặc biệt r_weapon_provider 150, r_statue 100, r_mercenary 75, r_mineral 75, r_mount 40, ... [CFG map_levels.map_level_base]). Không có Floors/Walls/Obstacles cho 4A/4B/4C trong map_levels (bộ này lấy từ prefab trong bundle). map_A16 và các ải 4C/4B không khai báo cage (CageCreateRate 0).

## 2. level_generate_config: chỉ là tham số dựng phòng
`level_generate_config.json` có 7 khoá và KHÔNG chứa danh sách quái hay trùm: AncientBattlefield (4B), MonolithicMountainsRuins (4A), Seabed (4C), MachineryCity (2G), CommonHideRoom, MMRHideRoom, SeasonIrontide [CFG level_generate_config]. Số liệu dựng cho tầng 4:
| Khoá | Vùng | MiniStep | RoomSizeRange | CorridorRange | WallSize | DoorSize |
|---|---|---|---|---|---|---|
| MonolithicMountainsRuins | 4A | 4 | x16 y32 | x16 y400 | 4x6 | 6 |
| AncientBattlefield | 4B | 4 | x20 y28 | x16 y400 | 4x4 | 8 |
| Seabed | 4C | 4 | x16 y28 | x16 y400 | 4x4 | 8 |
| (đối chiếu) MachineryCity 2G | 2G | 4 | x16 y32 | x20 y28 | 2x6 | 8 |
Cửa: 4A `Level/4/A/LevelObject/Door/4A_MMR_Door_V|H.prefab`, 4B `4B_Door_V|H`, 4C `Seabed_Door_V|H`. Phòng ẩn: MMRHideRoom (phòng 16x26, DoorSize 3) và CommonHideRoom (16x28) [CFG]; wiki gọi "Secret Rooms" (phòng thuốc viên; Apocalyptic Void không có). Khai báo lớp dựng: RFloorSubBuilderMMR/RWallSubBuilderMMR/RMountainSubBuilderMMR/CBSubBuilderMMR (4A), SelectRFloorSubBuilderAB/SelectRWallSubBuilderAB/SelectCBSubBuilderAB (4B), RFloorSubBuilderSeabedLow/RWallSubBuilderSeabedLow/CBSubBuilderSeabedLow (4C) [CFG]; hàm dựng nằm trong IL2CPP, không giải mã (web đã có bộ sinh hầm riêng W.generate, không cần).
Chủ đề trong bundle của vùng [AB level/4/*.manifest, CFG level_generate_config.OtherPrefabPaths]: sàn rule tile `4A_RB_FloorTile_1,2` / `4B_RB_FloorTile_0..4` / `4C_RB_FloorTile_0..2`; nền `4ABackground.prefab` (5 ảnh background_1..5, skyIsland_1/2, sun) + sương `Fog.prefab` (4A); `map_mask.prefab` (4B, 4C).

## 3. Quái tầng 4 (số máu)
Config `enemies.Hp` đáng tin với 4A (e_stone_*: man 16, horse 64, dog 24, eagle 16, ox 150, chariot 100, origin_stone 16 khớp wiki) nhưng mọi e_mob0..5 và e_seabed_mob0..5 đều Hp = 16 (giá trị mặc định, không khớp wiki) [CFG enemies]; dùng số wiki cho 4B/4C [WIKI AB, Undersea, MMR]:
- 4A: Đá Thô 16 (tự phá hồi 60 máu cho quái bị thương gần; Tinh Anh hồi 85), Chiến Binh 16 (32 Tinh Anh; 5 viên đạn 4 sát thương, có thể cưỡi Ngựa/Bò/Đại Bàng(Tinh Anh)/Xe), Ngựa 64 (96), Chó Săn 24 (48), Đại Bàng 16 (32), Bò 150 (175), Xe Ngựa 100 (125).
- 4B: Lính Giáo 14 (96 là Tinh Anh), Lính Cung 14 (72), Lính Kỵ 40 (96), Lính Quạt 22 (72), Lính Địa Lôi 19 (72), Lính Bắt Lưới 22 (72). Tinh Anh dùng Kèn Trumpet tăng tốc đánh quái xung quanh; ở vùng này Tinh Anh đổi hình thay vì phình to [WIKI AB].
- 4C: Thủy Thủ Ký Sinh 40 (75), Người Hầu Kraken 25 (47), TTN-001 35 (75), TTN-002 75 (100), TTN-003 100 (130), TTN-004 140 (175) [WIKI Undersea]. 001-003 sinh trong bong bóng 10 HP (đạn tầm xa chỉ gây 1; cận chiến/tay không vỡ ngay).
Web `DS.rules.eliteScale 1.25` (quái Tinh Anh vẽ to) trái với 4B (đổi hình thay vì to).

## 4. Trùm tầng 4
| Khoá | Tên Việt (LOC) | Tên EN | Vùng/ải | Hp config | Hp wiki (thường / Tinh Anh) | Vũ khí trùm (config BossWeapon) | Nhạc |
|---|---|---|---|---|---|---|---|
| boss_monolith_lower | Chân Tổ Tiên | Ancestor's Legs | 4A 4-3 | 800 | 960 / 1200 | weapon_363 | boss_stone_man |
| boss_stone_man | Golem - Tổ Tiên | Golem - Ancestor | 4A 4-5 | 1200 | 1440 / 1800 | - | boss_stone_man |
| boss_warlord | Đội trưởng Hulala-Moli | Captain Hulala Morley | 4A 4-5 | 999999 (giữ chỗ) | 1800 / 2250 | weapon_388 | boss_stone_man |
| boss_stone_dragon | Thạch Giới·Vụ Ảnh Long | Golem - Mist Dragon | 4A 4-5 | 1200 | 1440 / 1800 | weapon_382 | boss_stone_man |
| boss_lijue | Lý Thôi | Li Jue | 4B 4-3 | 1000 | 1320 | - | bgm_4B_..._boss_b18 |
| boss_huaxiong | Hoa Hùng | Hua Xiong | 4B 4-3 | 1000 | 1440 | - | bgm_4B_..._boss_b18 |
| boss_dongzhuo | Đổng Trác | Dong Zhuo | 4B 4-5 | 2000 | 2160 | weapon_384 | bgm_4B_..._boss_dongzhuo |
| boss_lvbu | Vũ Khí Cuối Cùng 01 | Ultimate Weapon: Code 01 | 4B 4-5 | 2000 | 1800 / 2270 | - | bgm_4B_..._boss_lvbu |
| boss_abyssal_submariner | Thợ Lặn Vực Sâu | Abyssal Submariner | 4C 4-5 | 2300 | 2760 | weapon_389 | bgm_4c_Seabed_boss_abyssalSubmariner |
Hệ số HP_FACTOR = 1,2 của web (js/bosses.js:18) nhân Hp config ra đúng số wiki cho 4/9 trùm (Chân Tổ Tiên 960, Tổ Tiên 1440, Vụ Ảnh Long 1440, Thợ Lặn 2760); lệch ở 4 trùm (Hoa Hùng 1000 x 1,2 = 1200 so với wiki 1440; Lý Thôi 1200 so 1320; Đổng Trác 2400 so 2160; Vũ Khí 01 2400 so 1800) và Hulala có Hp giữ chỗ 999999: với 5 trùm đó dùng số wiki thay cho config x 1,2 [SUY: wiki là số quan sát trong game]. Hộ giá/phụ: boss_dongzhuo_barrel, _girl_0, _girl_1, _shield_guard (20 HP, đứng yên; thành tựu "The Show Goes On": hạ Đổng Trác không giết cô gái nào [WIKI AB]); boss_warlord_chariot/eagle/horse/ox (100/32/64/150, quân cưỡi) [CFG enemies]; boss_abyssal_submariner_mob0/1 (16 HP) [CFG]. Hai Lãnh Chúa: DoubleBosses của dongzhuo, lvbu = {lijue, huaxiong}; huaxiong={lijue}; lijue={huaxiong}; 4A/4C có danh sách ghép với trùm tầng 1-3 [CFG enemies.DoubleBosses]; wiki: 4-3 của 4B với Boss Duo luôn là Hoa Hùng + Lý Thôi [WIKI AB].
Rơi: nhóm "magic_*" mỗi màu 14% giống mọi trùm; riêng Tổ Tiên rơi mảnh skin Berserker (c13_s19, 50), sắt (150); Vụ Ảnh Long gỗ 150, phân bón 100; Đổng Trác tế bào 150, gỗ 175; Thợ Lặn sắt 150, bánh răng 175; Vũ Khí 01 pin 150, bánh răng 175; Hulala tế bào 150, pin 175 [CFG enemies.Drops; HALL.md đã chép]. Vũ khí chủ đề trong rương trùm: Ancestor's Call (Chân Tổ Tiên 4-3), Moo Moo Mallet (Hulala), Staff of Incantation (Vụ Ảnh Long), Cursed Chalice (Đổng Trác), Asura (Vũ Khí 01), Sonar Detector (Thợ Lặn) [WIKI trang trùm].

## 5. Cơ chế riêng từng vùng
- 4A: khối đá/cây/tường không phá, hũ phá được, BỤI RẬM (vào thì tàng hình 1 giây + tăng tốc, hồi 4 giây), thùng độc/nổ, ô chậm/nhanh/gai kiểu riêng, LỐC XOÁY ngẫu nhiên hút đạn cả hai phe quay quanh (đổi màu theo đạn nguyên tố); dân làng Gilley (+3 vàng), Gourley (+1 bình năng lượng), Harley (+1 bình máu) trên cầu giữa các phòng, mỗi người cho một lần [WIKI MMR; AB level/4/a: mmr_talk_npc_0..2]. Phòng trùm Vụ Ảnh Long có Pháo Rồng Đá ở giữa (10 sát thương, 5 năng lượng/phát, ngắm ngược chiều di chuyển) [WIKI MMR]. Thành tựu nhắc: "New World!" (vào 4-1), "Hurricane Handler" (dùng Găng Bão điều khiển lốc xoáy 5 giây) [WIKI MMR].
- 4B: bắt đầu ở bãi cỏ, sau khi vượt hành lang ở 4-3 chuyển sang thành luỹ. 4-3 KHÔNG dùng dựng phòng thường mà là 2 phòng đặc biệt: (1) hành lang ngang dài, rào chắn không phá + thùng, quái đứng nhóm sau từng rào (không theo đợt), ô tăng tốc 2x2 ở giữa lúc vào; (2) phòng vuông lớn, quái đứng giữa vuông bao rào và thùng, mỗi đợt sinh trong vuông. Xong phòng 2 có 3 hướng: Bắc = phòng đặc biệt chắc chắn có Thầy Hướng Dẫn, Đông = phòng trùm, Nam = phòng rương chắc chắn có Thương Nhân Thần Bí (không có nếu Ngày Ưu Đãi) [WIKI AB]. Thành tựu: vượt hành lang 4-3 trong 40 giây (ac/desc_120), hồi sinh trong phòng rồi dọn (ac/desc_152) [LOC].
- 4C: thanh Oxy đáy giữa màn hình, tụt dần từ phải sang trái, đầy lại khi vào ải mới; Người Hầu Kraken hút oxy; hết oxy thì mất 1 sát thương liên tục (2 nếu Lợi Hại), trừ giáp trước HP, thú cưỡi chịu trước; hồi oxy bằng bong bóng dưới sàn (vòng xanh lơ, còn tăng tốc nhẹ), vỡ bong bóng quái khi ở gần, TTN-004 nhả bóng, cánh quạt Thợ Lặn tạo bóng [WIKI Undersea; LOC seabed_oxygen, seabed_oxygen_tip]. Bong bóng quái: 10 HP. Thùng độc tím, thùng băng. Thành tựu hạ trùm đáy biển khi oxy = 0 / khác 0 (ac/desc_128-129) [LOC].
- Chung: ải mở rộng nên có Gian Thương ở x-3/x-5 như tầng khác [WIKI Levels]; bốc thiên phú chỉ 4-2 (web BUFF_AFTER ở js/rooms.js:1505 chưa có).

## 6. Tài nguyên có trong bundle (tên container, KHÔNG chép vào repo)
- Vùng: `level/4/a.ab` (224 asset, 369 KB), `level/4/b.ab` (236, 268 KB), `level/4/c.ab` (156, 346 KB) [AB]. Mỗi bundle chứa RoomBase (4A 77 + 1 atlas, 4B 54, 4C 16), Door (4A 5, 4B 22, 4C 12), Element, Tile (4A 2, 4B 12, 4C 6), Enemy/<e_*> (4A: e_stone_ox 21, horse 15, dog 13, chariot 11, eagle 10, origin_stone 9, man 8; 4B: e_mob0..5 15-21 asset mỗi cái; 4C: e_seabed_mob0..5 8-16), MapManager (map_A16..A20, map_A4_BR, map_A_MonolithicMountainsRuins; B và C tương tự), thư viện phần tử `Room/Config/ElementLibrary/map_4A_MonolithicMountainsRuins`, `map_4B_AncientBattlefield`, `map_4C_Seabed`. Riêng 4C: OxygenBar.prefab, SeabedOxygenBubble.prefab, SeabedBubbleShield.prefab (+ bubble_shield_idle/break anim), SeabedBeam, SeabedWaterWave(_HideRoom), WaveEffect.shader, VignetteEffect.shader, SeabedLight/Dark; 4B: trump.prefab/anim (kèn Tinh Anh), box/cask/stone/tree/wall_AB; 4A: Fog.prefab, 4ABackground.prefab, mmr_talk_npc_0..2.
- Trùm: `boss/boss_stone_man.ab` (48 asset), `boss_monolith_lower.ab` (16), `boss_warlord.ab` (75), `boss_stone_dragon.ab` (63), `boss_huaxiong.ab` (33), `boss_lijue.ab` (32), `boss_dongzhuo.ab` (78), `boss_lvbu.ab` (66), `boss_abyssal_submariner.ab` (61) [AB boss/*.manifest]; phòng trùm prefab `r4_boss1`, `r4_boss1_lower`, `r4_boss2`, `r4_boss3`, `r4_boss4`, `r4_boss4_lower`, `r4_boss5`, `r4_boss5_lower`, `r4_boss_abyssal_submariner` [CFG map_levels].
- Nhạc: `bgm/bgm_4a_monolithicmountainsruins.ab`, `bgm_4b_ancientbattlefield.ab`, `..._boss_b18.ab`, `..._boss_dongzhuo.ab`, `..._boss_lvbu.ab`, `bgm_4c.ab`, `bgm_4c_seabed_boss_abyssalsubmariner.ab`, `bgm_4low.ab` (+ boss_stone_man.mp3 dùng chung 4A) [AB bgm; CFG map_levels.BgmClip].
- Dữ liệu đã có sẵn trong repo: `data/sk-data.js` patterns `r4b_big_0`, `r4b_big_1`, `r4b_big_2` (32x32, 256 vật mỗi mẫu) và `r4b_long` (120x16, 333 vật) = hai phòng đặc biệt của 4-3 4B (hành lang và phòng vuông) [WEB data/sk-data.js; không có đoạn mã nào gọi chúng: `grep -rn r4b games/soulknight/js` rỗng]; `D.themes` chỉ có 14 chủ đề ở tầng 1-3 (forest..island) và `SK_BOSSES86.pool` chưa có khoá chủ đề tầng 4 [WEB].

## 7. Hiện trạng web (chỉ đọc) và cái thiếu
- `js/design.js:67` `run: [['forest',1],['castle',2],['volcano',3]]`; `js/game.js` `buildStages` tạo 15 ải (5 x 3) và kết thúc bằng "victory" khi qua cổng 3-5; `SK.tierThemes(level)` chọn theo `D.themes[k].level`, nên thêm chủ đề `level:4` sẽ có sẵn đường bốc. Web chưa có 3-6 (Đá Phép) [WEB game.js:262].
- `tools/build_sk.py:40` ánh xạ bundle → chủ đề: `'level/3/a.ab': ('aliens',3)...`; thêm 3 dòng `'level/4/a.ab': ('monolith',4)`, `'level/4/b.ab': ('battleground',4)`, `'level/4/c.ab': ('seabed',4)`. Đó là cách ghi chủ đề 1G (zulanruins) đã làm [GAPS.md "Đã sửa"].
- Thiếu: 3 chủ đề; quái e_stone_* (7), e_mob0..5, e_seabed_mob0..5 (19 quái, AI viết lại từ prefab); 9 trùm + phụ; cơ chế bụi rậm/lốc xoáy/oxy/bong bóng; 4B 4-3; NPC Kẻ Vượt Ranh Giới + cổng tím; 3-6 và 4-6 (Đá Phép); thanh Oxy HUD (hud.js); thiên phú sau 4-2; nhạc tầng 4 (sk-audio).
- Tách phụ thuộc: MODES.md 2e (Xâm Nhập Hư Không) cần cổng miễn phí sang 4-1 và Nhà Sưu Tầm ở 4-6; Khu Thí Luyện cần 3 map `_BR` của tầng 4 (A4/B4/C4 với EndRooms ở mục 1; MODES.md 2b đã liệt kê nhóm trùm).

## 8. Kế hoạch làm (theo thứ tự, mỗi bước độc lập kiểm được)
1. 4A trước (không cơ chế đặc biệt cần HUD): build_sk.py thêm 'level/4/a.ab'; D.themes.monolith {level 4, enemies theo bảng trọng số mục 1 (stages 4-1..4-5)}; 7 quái (js/enemies hoặc actors.js bảng AI) — Chiến Binh cưỡi quái cần cơ chế `mount`; 4 trùm 4A (js/bosses/boss_stone_man.js...) theo bosses/README; game.js buildStages nhận tầng 4 tuỳ chọn.
2. Cổng tầng 4: NPC Kẻ Vượt Ranh Giới ở 3-5 (game.js: sau trùm, props với use(): trừ 100 vàng hoặc 1 hpMax, cổng tím), ải kết 3-6 / 4-6 (game.js ROOM_FILL 'altar' + victory khi tới đó) — hiện web thắng ở cổng 3-5, đổi thành thắng ở 3-6/4-6 chỉ cho chế độ Ải thường (cẩn thận bộ kiểm cũ chờ 'victory' ở 3-5).
3. 4C: oxy (G.oxygen, tiêu hao, bong bóng hồi, hết thì 1 sát thương/giây) + bong bóng quái (10 HP, đạn xa 1 sát thương).
4. 4B: 4-3 đặc biệt dùng r4b_long/r4b_big_* (đã có), rào chắn không phá, Lý Thôi/Hoa Hùng; 4-5 Đổng Trác/Vũ Khí 01.
5. Thiên phú sau 4-2; nhạc; bể rơi.
Bộ kiểm cụ thể (test/soulknight-floor4.js, Playwright, dùng SK_GAME.debug.stage('4-1')):
- D.themes có 3 chủ đề level 4; mỗi lượt 4-x cùng chủ đề; nhãn ải 4-1..4-5 (+ 4-6 kết).
- 4A 4-1: mọi quái trong {e_stone_man, e_stone_horse, e_stone_dog, e_origin_stone}; không e_stone_ox/eagle/chariot (weight 0/vắng); 4-5: có thể ra chariot (weight 20).
- 4-3 4A phòng trùm: boss_monolith_lower HP 960; 4-5 trùm thuộc {stone_man 1440, warlord 1800, stone_dragon 1440}.
- 4B 4-3: bố cục = r4b_long rồi r4b_big_*; trùm thuộc {huaxiong 1440, lijue 1320}; Hai Lãnh Chúa cho đủ cặp.
- 4C: không phòng trùm ở 4-3; thanh oxy hết sau T giây (T cần chốt từ clip) rồi 1 sát thương/giây (2 Lợi Hại); bong bóng quái 10 HP: 10 phát 1 sát thương vỡ, cận chiến vỡ ngay.
- Kẻ Vượt Ranh Giới: với 100 vàng trừ đúng 100; với 99 vàng trừ 1 hpMax; Mê Trận và Hư Không độ 2-3 hạ Hư Không không thấy NPC (cổng sẵn).

## 9. Nguồn không có
- Cách bốc 1 trong 3 vùng 4A/4B/4C mỗi lượt (người chơi chọn? ngẫu nhiên?): wiki chỉ nói "can be Monolithic Range Ruins, Ancient Battleground, or Undersea"; không thấy bảng trọng số trong config [CFG map_levels, level_generate_config; WIKI Levels].
- Điều kiện loại của cổng tím/NPC (tên random_objects) không có khoá riêng cho Kẻ Vượt Ranh Giới trong 17 bảng config [CFG random_objects]; 100 vàng/1 HP lấy từ wiki.
- Số tầng 4 trong Boss Rush cần "tầng 4" thật (map_A4_BR, B4_BR, C4_BR có sẵn) nhưng số trận/xác suất chưa có (MODES.md 2b).
- Thời lượng oxy đầy, tốc độ tụt oxy, tốc độ hồi từ bong bóng, tỉ lệ lốc xoáy ở 4A, tỉ lệ hũ/thùng: không có số trong wiki lẫn config; cần clip.
- Hp thật của quái 4B/4C (config = 16 giữ chỗ) chỉ có số wiki (có thể lệch bản 8.6).
- Giải mã luban (bể rương WG_level*, trọng số vùng) chưa có khoá [GAPS.md]; nên mọi "bể rương tầng 4" của web là (phỏng đoán) dùng weaponPool theo cấp 4.
- 4-6: cấu hình kết thúc (map_GameOver nhãn 3-6) không có nhãn 4-6; wiki chỉ mô tả.
