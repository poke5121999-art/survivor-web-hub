# Đặc tả các chế độ một người của Soul Knight 8.6.0 cho bản web

Nguồn: [LOC term] = ~/sk86-ref/decoded/localization_en_vi.json (cột en/vi); [CFG bảng.khoá] = ~/sk86-ref/decoded/config/*.json; [AB tên] = tên bundle trong AssetBundles (chỉ thấy tên, không mở); [WIKI url] = kết quả tìm kiếm tóm tắt; (phỏng đoán) = suy ra, cần kiểm lại bằng clip/bản gốc.
Ghi chú nguồn wiki: soulknight.fandom.com và skvn.fandom.com trả 402, breezewiki bị Anubis chặn; chỉ lấy được tóm tắt từ WebSearch (skvn.fandom.com/vi/wiki/Chế_Độ_Badass, apkmirror, toucharcade). Số liệu HP/ST/tốc độ quái của Lợi Hại KHÔNG có trong nguồn nào.

## Hiện trạng web (đã có)
- Chế độ Ải: 3 tầng x 5 ải, trùm ải 5 (game.js dòng 6-8: STAGES từ DS.run = [forest1, castle2, volcano3], mỗi tầng bốc ngẫu nhiên 1 trong 13 vùng đất cùng tầng). Lobby.MODES có 3 thẻ: level (ok), season (ok, "Thoát khỏi Monkia"), warfront ("Tiền tuyến cổ đại", sắp ra mắt) - lobby.js dòng 641-648.
- Có sẵn: hầm ngục thủ tục, 13 vùng đất, 35 trùm (sk-bosses86.js pool theo vùng), 503 vũ khí, 54 thiên phú. design.js có eliteScale 1.25 "quái badass vẽ to hơn" (ước lượng), chưa có chế độ Lợi Hại.
- Lưu ý tên: trong game gốc "Chế độ Ải" (gamemode/normal) và Lợi Hại (gamemode/badass) là CÙNG chế độ Ải ở hai độ khó (difficulty/normal "Độ khó thường", difficulty/badass "Độ khó Lợi Hại"). Khu Thí Luyện cũng có hai độ khó. Bảng achievements ghi "Level Mode - Badass", "Boss Rush Mode - Badass", "The Origin - Badass" [LOC ac/desc_8, ac/desc_33, ac/desc_76]; UnlockGameMode: [0]=Ải, [1]=Khu Thí Luyện, [2]=Thần Điện [CFG achievements.UnlockGameMode, đối chiếu mô tả ach 32-35, 76].

## 1. Danh sách chế độ một người

Ký hiệu khả thi: A = làm được gần như hoàn toàn bằng thứ đã có; B = cần thêm hệ thống nhỏ/vừa; C = cần hệ thống lớn mới; D = không nên làm (cần mạng/thanh toán/sự kiện giới hạn).

| id term | Tên Việt chính thức | Mô tả Việt chính thức (LOC) | Khả thi |
|---|---|---|---|
| gamemode/normal | Chế độ Ải | (không có mô tả riêng) | ĐÃ CÓ |
| gamemode/badass | Lợi Hại (độ khó) | "Bước vào cổng bắt đầu chế độ Lợi Hại" [teaching/before_badass]; "Sau khi mở khóa tất cả vật phẩm Phòng Khách sẽ mở khóa độ khó Lợi Hại" [I_tip_09]; NPC "Du Lịch Lợi Hại" [Object_hostess] | A (ưu tiên 1) |
| gamemode/bossrush | Khu Thí Luyện | xem mục 3; NPC Valkyrie [object/br_npc], vật phẩm "Lông Vũ Valkyrie" [material_ticket_bossrush] | A/B (ưu tiên 2) |
| gamemode/challenge | Nhân Tố Thử Thách | "Nhấp nút Nhập mở hành trình Nhân Tố Thử Thách" [teaching/challenge_tip]; vật "Bóng Nhân Tố Thử Thách" [objects/factorbook] | A/B (ưu tiên 3) |
| gamemode/looptravel (Object_hostess_loop "Du Lịch Vô Tận") | Mê Trận Tà Vương | Chế độ Ải vô tận: "cuộc thám hiểm không có hồi kết", Tà Vương ban thưởng/trừng phạt, Uy Áp tăng dần làm quái giảm kháng khống chế, tăng HP, sinh quái đột biến gen; chỉ dùng vũ khí đúng cấp; không dùng vật phẩm ngoài thế giới [guide/mode_loop/guide01-15]; NPC Con Bạc/Thương Nhân/Thầy Bói, vật rơi "Pha Lê Tà Vương" [mode_loop/npc/*, mode_loop/item/reward_box]; chặn chọn anh hùng huyền thoại [tips/mode_cant_select_hero]; AB mode_loop | B (nối tiếp Ải: lặp vòng + Uy Áp) |
| mode/defence | Thần Điện Thủ Hộ (The Origin) | "Khai Quật Khảo Cổ / Ký Ức Chiến Đấu / Khảo Nghiệm Cuối Cùng": đợt quái ngoài hành tinh tấn công thần điện, đặt Tháp Phòng Thủ bằng Xu Sao, cứu Bậc Thầy Robot/Thầy Hướng Dẫn/Thợ Thủ Công, đợt cuối Tàu Ngoài Hành Tinh tấn công Đá Phép; vào cổng là mất thiên phú/nhân tố [defmode_intro_tips_01-08]; có Lợi Hại [defence/badass_pass_count]; tối đa đợt [mode/defence_max_wave]; AB defence, scene_plot_defence; map_C5_defence, map_D10_defence, map_defence [CFG map_levels] | C |
| Mode/Troop (season/Troop, Troop2) | Chỉ Huy Nhỏ | "Chiêu mộ diễn viên và bồi dưỡng cho họ, tiêu diệt thủ lĩnh để quay ra những thước phim đẹp đẽ!" [Troop2/guidance/desc_0]; chợ, liên kết, kỹ năng chỉ huy [desc_1-11]; mùa giải có Lính Thuê [season/lc_txt*]; map_troop2, map_troop_base | C |
| Mode/Artifacts | Thần Khí Lục Địa Cổ | mùa giải Thần Khí (season/Artifacts_Bronze/Silver/Gold, artifact/*); AB artifacts2 | C |
| (mùa giải hiện tại) | Mùa giải | "Chế độ Mùa Giải có quy tắc riêng... vũ khí mùa giải, thiên phú mùa giải... chế độ Vô Tận đã được thêm vào vòng quay" [season/introduce] | Web đã có bản "Thoát khỏi Monkia" (một phần) |
| mode/MonsterRise | Quái Thú Trỗi Dậy | 712 term monsrise/* (kỹ năng quái, khả năng); AB monster_rise, scene_monsterrise | C |
| mode/void_invasion | Xâm Nhập Hư Không (3 độ: Lần Đầu Vào Hư Không / Hư Không Hỗn Độn / Hư Không Hủy Diệt) | "Hầm ngục quen thuộc đã bị sức mạnh Hư Không xâm chiếm, mang đến những thử thách lẫn cơ hội" [void_invasion/tip_0]; Xu Ám Tinh, Mắt Hư Không, quái Hư Không, Rãnh Nứt, Khiên Hư Không ở độ 3 [void_invasion/tip_1-14, void_invasion_tier3/tip_0-12]. Là độ khó mới của chế độ Ải [void_invasion/guide_0] | B/C (ải thủ tục + biến thể quái; nhiều hệ thống con) |
| gamemode/pvz | Bảo Vệ Hoa Viên (sự kiện "Thủ Vệ Sân Vườn: Cây Cỏ Thành Binh") | [activity/pvz/title, desc0-4]: quái xếp hàng, trồng cây từ chậu hoa; AB statements_pvz, map_pvz | D (sự kiện) / C |
| (Hố Treo / escape) | Thoát khỏi Hố Treo (irontide, escape) | irontide/* 345 term; AB escape*, statements_iron, season_iron_common; web đã có tương đương "Thoát khỏi Monkia" | ĐÃ CÓ một phần |
| (fire) | Mở hết hỏa lực (sự kiện Tết) | [fire/name, fire/guide0-1]; map_fire | D (sự kiện) |
| (heroball) | Đạn Bi anh hùng | [heroball/guide0-3]; AB scene_heroball | D/C (thể loại khác) |
| (gunmaster) | Chuyên Gia Súng Ống / Khí Linh | [activity/gun_master/*]; map_gunmaster | D (sự kiện) |
| (ARAM) | Đại chiến ARAM | [seasonARAM/*, task/ARAM*]; map_ARAM; AB aram | D (nhiều người) |
| (pvp, combogun, new_mecha_combat) | PvP / Combo Gun / Cơ giáp | AB pvp, statements_pvp, statements_combogun, statements_mecha2 | D |
| gamemode/pure_multi_game | Chế độ kết nối máy thuần túy | Nối máy | D (nhiều người) |
| (tutorial) | Hướng dẫn Người Mới / Tiến Cấp | map_Scene_toturial*, [teaching/before_adv_tutorial] | B nhỏ (bỏ qua) |

Mức ưu tiên đề xuất sau 3 chế độ chính: Mê Trận Tà Vương (B), Xâm Nhập Hư Không độ 1 (B), Thần Điện Thủ Hộ (C), rồi Chỉ Huy Nhỏ (C).

## 2a. Lợi Hại (badass)

Cách vào: sau khi mở khoá mọi vật phẩm Phòng Khách [LOC I_tip_09] và vượt game một lần (với nhân vật bất kỳ, tới ải 3-6) [WIKI skvn.fandom.com/vi/wiki/Chế_Độ_Badass], vật "Du Lịch Lợi Hại" [LOC Object_hostess] xuất hiện ở Phòng Khách; chọn Thường/Lợi Hại cho ván kế [WIKI cùng trang]. Trong nối máy phải mở khoá ở chế độ cá nhân trước [LOC multi/badass_unlock_desc]. Mùa giải và Lợi Hại gỡ Nhân Tố Người Mới [LOC task/new_player_factor_desc].

Khác biệt với chế độ thường:
- Quái xuất hiện nhiều hơn và hung hăng hơn; Tinh Anh (champion) xuất hiện "nhiều hơn rất nhiều"; mọi trùm đều là bản Tinh Anh (to hơn, mạnh hơn) [WIKI skvn.fandom.com/vi/wiki/Chế_Độ_Badass]. Chế độ Thường vẫn có xác suất gặp Thủ Lĩnh Tinh Anh [LOC I_tip_15], nên ở Lợi Hại xác suất = 100% cho trùm.
- Người chơi nhận +1 sát thương từ mọi nguồn (đạn, debuff, môi trường); pet/tuỳ tùng không bị [WIKI cùng trang]. Nhân tố "Vỏ Cứng Bảo Vệ"/"giáp" có thể ép mọi sát thương về 1 [WIKI] (phỏng đoán chi tiết).
- Trùm cuối riêng: Thường là Tước Sĩ Đỏ (HP 1500, tốc độ 5; boss_bossrush_final), Lợi Hại là Tước Sĩ Tím (HP 2500, tốc độ 7; boss_bossrush_final_badass) - đây là số trong Khu Thí Luyện [CFG enemies.boss_bossrush_final, enemies.boss_bossrush_final_badass; LOC boss_bossrush_final, boss_bossrush_final_badass]. Gợi ý tỉ lệ 2500/1500 = 1.67x HP, 1.4x tốc độ cho trùm cuối (suy ra).
- Số tầng: KHÔNG đổi (vẫn 3 tầng x 5 ải + ải 6 cuối; các ải 3-6 đề cập ở wiki; map_GameOver Level "3月6日" = nhãn 3-6 [CFG map_levels.map_GameOver.Level]). Số ải/tầng không có biến thể Lợi Hại trong map_levels (không thấy map_*_badass ngoại trừ map_final_badass_BR, map_final_badass_BR2) [CFG map_levels].
- Mốc thời gian: thành tựu "vượt Lợi Hại trong 23 phút" [LOC ac/desc_17]; nhân tố Chạy đua thời gian: Thường 12 phút / Lợi Hại 16 phút [LOC task/TimeRacing, task/TimeRacing_desc] (đó là cho khiêu chiến "vượt ải 1 lần", không phải chế độ ải tính giờ).
- Phần thưởng: vượt Lợi Hại lần đầu = 5000 Đá + token_weapon_none_5 [CFG achievements.8, LOC ac/desc_8]; phiếu "Game Complete" có viền bạc thay vì đồng; sau khi hạ trùm cuối ở Lợi Hại thì các lần sau cùng trùm đó cũng ra viền bạc [WIKI]; hạ trùm 3-6 ở Lợi Hại thưởng bản thiết kế Sword of King Hero (bản APK cũ) [WIKI apkmirror]; thống kê riêng "Số lần vượt (Chế độ Lợi Hại)" [LOC statistics/pass_times_badass]. Thành tựu liên quan: ach 8, 17, 31 (không vũ khí), 46 (nối máy), 139 (không kỹ năng) [CFG achievements].
- Không có trong nguồn: hệ số HP/ST/tốc độ quái thường, tỉ lệ Tinh Anh cụ thể. (phỏng đoán) khuyến nghị: HP quái x1.5 hơn thường không, ST quái +1 (giáp mất 1 thêm), tỉ lệ Tinh Anh 35-50%, trùm luôn Tinh Anh (eliteScale 1.25 đã có).

Đặc tả code đề xuất cho web:
1. Cờ run.badass (lưu profile.badassUnlocked; mở khoá = hoàn thành 1 ván thường; bỏ điều kiện "mở mọi vật phẩm Phòng Khách" nếu web chưa có hệ đó, ghi chú là rút gọn).
2. Tại damagePlayer(): dmg += 1 khi badass (chỉ nguồn không phải pet). 
3. Spawn: mật độ x1.3 (phỏng đoán), xác suất Tinh Anh 40% (phỏng đoán), trùm luôn Tinh Anh (scale 1.25, HP x1.5 phỏng đoán).
4. Bỏ Nhân Tố Người Mới. Thưởng: gem x? (không có số gốc; tăng 1.5x phỏng đoán), lưu thống kê badass, phiếu viền bạc.
5. Lobby: thêm nút chuyển Thường/Lợi Hại (giống Object_hostess) hoặc thẻ chế độ.

## 2b. Khu Thí Luyện (boss rush)

Mở khoá/vào: Valkyrie ở Khu Phép Thuật (dưới-đông-nam Phòng Khách) [LOC multi/bossrush_unlock_desc]; vật phẩm vào cửa là "Lông Vũ Valkyrie" (material_ticket_bossrush, ItemValue 500) [CFG items.material_ticket_bossrush]; Lông Vũ nhận từ Nhiệm Vụ Treo Thưởng hằng ngày của Cảnh Sát [LOC bossrush_intro_tips2, item/br_no_item]; mỗi ngày có giới hạn lượt ("hôm nay còn {0} lần") [LOC item/br_gate_open, item/br_times_limit]. Lời Valkyrie: "Khu Thí Luyện / Đang sợ hãi sao? / Đã sẵn sàng đón nhận thử thách chưa? / Xác nhận nhận thử thách?" [LOC item/br_talk*, item/br_quest]. Random object bossrush_unlocker = NPC npc_bossrush_engineer [CFG random_objects.bossrush_unlocker].

Luật chung [LOC bossrush_intro_tips1-3]: một số Lãnh Chúa của chế độ Ải tạm không có, nhưng gặp nhiều biến thể/phiên bản tương tự hơn. Nhóm theo "tầng-vùng" gồm 17 bản đồ boss, tên map_<chữ><số>_BR [CFG map_levels]. Số = tầng (Level/1..4), chữ = vùng đất trong tầng. Mỗi map chỉ có phòng boss (EndRooms, weight 10 đều nhau), phần phòng thường lấy từ map_bossrush_base:
- StartRooms: r_start (weight 1)
- ChestRooms: r_chest (2), r_chest_battery (1), r_sell (2)
- SpecialRooms (phòng phụ giữa các trận): r_weapon_provider 10, r_mercenary 10, r_mineral 10, r_mount 4, r_statue 8 (+6 nếu có điều kiện type 5), r_sell 6, r_chest 6, r_chest_battery 3 [CFG map_levels.map_bossrush_base]
- Không có phòng quái thường: map_*_BR không có Enemies/Floors, vì vậy mỗi "ải" = phòng khởi đầu + phòng phụ + phòng boss.
- Phòng kết thúc map_End_BR (nhãn "BR 3-5"), EndRooms = r_bossrush_end, StartRooms = r_start_no_event [CFG map_levels.map_End_BR]: đây là phòng kết sau trùm cuối.

Bảng trùm theo map (tên room -> khoá trùm) [CFG map_levels.*_BR.EndRooms + enemies.BossRoom]:
- Tầng 1: A1 boss07, boss08, boss14 (điều kiện type 23 "chưa gặp boss14" inverse), boss19; B1 boss09, boss10(+boss10_2), boss13; C1 boss22, boss23; G1 boss30
- Tầng 2: A2 boss01(+boss01_2), boss02, boss20, bossnian, bossxi; B2 boss03, boss04; C2 boss15, boss16(+boss16_horse); D2 boss24; E2 boss26; F2 boss27; G2 boss_robot_queen, boss_robot_king
- Tầng 3: A3 boss06, boss05, boss21; B3 boss11, boss12_1/2/parent, boss18; C3 boss28
- Tầng 4: A4 boss_stone_man, boss_monolith_lower, boss_warlord, boss_stone_dragon; B4 boss_dongzhuo, boss_lvbu, boss_huaxiong, boss_lijue; C4 boss_abyssal_submariner
Bản web có 35 trùm trong sk-bosses86 (pool theo vùng) - đa số khoá này trùng tên; nhóm tầng 4 (stone_man, dongzhuo...) cần kiểm có sẵn không.
- Nhạc: bgm_1Low cho đa số, B1 bgm_5Low, B2 bgm_2Low [CFG map_levels.*_BR.BgmClip].

Trận cuối: sau khi qua hết boss, nếu không dùng Nhân Tố/BUFF/vũ khí (tay không) và nói chuyện với Valkyrie thì kích hoạt "Thí Luyện Thuần Túy" (Rush to Purity): có thời hạn, khác theo độ khó [LOC bossrush_intro_tips4-5]. Nếu đánh bại tất cả Lãnh Chúa trong hạn thì đấu anh hồn 2 Kỵ Sĩ vĩ đại thời xưa, có xác suất nhỏ rơi Vũ Khí Mạnh (bản thiết kế) [LOC bossrush_intro_tips6]; không hoàn thành thì lợi ích bị giảm ("Thí luyện của bạn đã thất bại / Lợi ích bị giảm") [LOC bossrush_intro_tips7, br_puremode_fail_tips1].
- Trùm cuối: Tước Sĩ Đỏ (Sir Sangria; "Từng dẫn binh suýt phá hủy cả Vương Quốc Cổ") HP 1500, tốc 5; Lợi Hại = Tước Sĩ Tím (Sir Violet; "Anh hùng giải cứu Vương Quốc Cổ trong nguy nan") HP 2500, tốc 7 [LOC boss_bossrush_final(_badass), bossintro_bossrush_final(_baddass); CFG enemies]. Còn "Tước Sĩ Lục" (Sir Verdant) cũng có (ach 116) [LOC ac/desc_116]. Lính phụ: e_bossrush_minion_a/b/c/d (HP 300) [CFG enemies]. Rơi: 4 nguyên liệu magic_blue/green/cyan/black 10% mỗi cái; bản Thường 17% blueprint_weapon_bossrushfinal; bản Lợi Hại nhóm 22% blueprint_weapon_bossrushfinalA (+B) có điều kiện [CFG enemies.boss_bossrush_final(_badass).Drops/DropGroups]. Vũ khí thưởng: weapon_bossrushfinal (MasterLaser, giá 200, cần 3 iron+3 wood+3 magic_red), weapon_bossrushfinalA (MasterHold, buffSpeedFactor 2, 3 magic_purple), weapon_bossrushfinalB; bản thiết kế nghiên cứu 1500 Đá [CFG weapons, items.blueprint_weapon_bossrushfinal].
- Thành tựu: vượt Thường/Lợi Hại; Thường trong 10 phút, Lợi Hại trong 15 phút; hạ 1 / tất cả trùm mà không mất HP/Khiên; vượt Thuần Túy Lợi Hại không vũ khí; hạ Tước Sĩ Lục không vũ khí; Kỵ Sĩ Thánh + Nhân Tố vượt không chết mở skin [Ku] [LOC ac/desc_32-35, 39, 94, 95, 92, 116; CFG achievements]. Thống kê: "Số lần Khu Thí Luyện", "Thời gian vượt nhanh nhất" [LOC br_times, br_fast_time]; Vô Tận có "Số ải cao nhất (Khu Thí Luyện)" [LOC statistics/max_loop_level_boss_rush].

KHÔNG có trong nguồn (không thể điền con số): tổng số trận boss trong một lượt, thứ tự bốc, hồi máu giữa trận, số Lông Vũ mỗi lượt, giới hạn lượt/ngày. Kết quả tìm kiếm có một trang không rõ nguồn nói "44 boss" (gameslearningsociety.org) - không đáng tin. (phỏng đoán) Cấu trúc: 3-4 tầng, mỗi tầng bốc 1 map _BR theo tầng (tầng 1: A1/B1/C1/G1; ...), mỗi tầng 1 boss = tổng khoảng 3-4 trận + trận cuối; giữa trận có start room + 1-2 phòng phụ (rương/thương nhân/Lính Thuê/đá/thú cưỡi/tượng/phát vũ khí) rồi qua cổng sang trận kế; vì không có phòng quái nên đặt hồi đầy HP/khiên (hoặc giữ nguyên) khi vào mỗi trận (chọn: khiên tự hồi, HP không hồi trừ khi nhặt bình).

Đặc tả code đề xuất:
1. Mode 'bossrush' (độ khó thường/badass). startRun: dựng STAGES = [tầng1..tầng3 hoặc 4], mỗi tầng 1 boss bốc từ pool _BR bảng trên (lọc những trùm web có); không phòng quái thường.
2. Mỗi tầng: phòng khởi đầu -> N phòng phụ ngẫu nhiên (bảng trọng số base) -> phòng boss; hạ boss mở cổng.
3. Sau boss cuối: nếu run "thuần túy" (không vũ khí/buff/nhân tố) cho đối thoại Valkyrie; đếm ngược; nếu thắng trước hạn -> trận Tước Sĩ (Đỏ/Tím theo badass), rơi theo bảng.
4. Vé: Lông Vũ (profile.feather, +1..x mỗi ngày từ "nhiệm vụ treo thưởng", giới hạn lượt/ngày) (phỏng đoán số).
5. Lưu thống kê br_times, br_fast_time; thành tựu nhanh.

## 2c. Nhân Tố Thử Thách (challenge factors)

Cách chọn/nhận (từ LOC):
- Mở khoá bằng Thanh nhiệm vụ trong Phòng Khách, bên trái cổng Nhà Ngục [LOC teaching/task_start1, multi/factor_unlock_desc]. Ở bảng đó có "treo thưởng" (Cảnh Sát) và "khiêu chiến"; "Hoàn thành nhiệm vụ treo thưởng và khiêu chiến được nhận thưởng" [LOC teaching/task_start2]; nhấp áp-phích để xem thêm [teaching/task_tip]; nút "Nhận thử thách" [ui/accept_challenge], "Nhấp nút Nhập mở hành trình Nhân Tố Thử Thách" [teaching/challenge_tip].
- Tập khiêu chiến hiện tại có thể làm mới: "Muốn đổi khiêu chiến hiện tại?" [LOC task/change_challenges, officer/change_task, officer/challenge_changed]; "hoàn thành thử thách hôm nay" [LOC officer/wanted_done] => tập nhiệm vụ làm mới theo NGÀY (phỏng đoán chu kỳ 0h; không có số). Thử thách tuần (nối máy): làm mới 0:00 thứ Hai, hoàn thành lần nữa nhận thêm 200 Đá [LOC multi/weekly_challenge_tip, weekly_challenge_complete].
- Trong ván: vật "Bóng Nhân Tố Thử Thách" (Challenger's Orb) [LOC objects/factorbook]; không thể có trùng nhân tố ("Đã có Nhân Tố Thử Thách") [LOC I_factor_repeat]; "Vé Đổi Nhân Tử" đổi một nhân tố [LOC token_battle_factor_none_0, item/factorVoucher_description]; một số chế độ không cho chọn chủ động [LOC tips/mode_cant_use_factor] hoặc có mùa giải không hỗ trợ [LOC artifact/no_challenge_factor]; Khu Thí Luyện cho phép mang nhân tố (nếu mang thì không vào Thuần Túy) [LOC bossrush_intro_tips4]. Chứng chỉ cuối ván liệt kê "Nhân Tố Thử Thách" [LOC ui_certificate_challenge]. Nhân tố bắt buộc theo chế độ: Vô Tận ("Số tầng Nhà Ngục biến thành vô tận...") và Đoàn Lính Thuê [LOC factor/EndlessLoop, factor/Troop]. Nhân Tố Người Mới: Thầy Huấn Luyện giúp trong {0} ván đầu [LOC task/new_player_factor_desc].
- Thưởng: không có số trong nguồn (thưởng theo áp-phích khiêu chiến: Đá/vật phẩm; thành tựu ach 62 "mang 30 Nhân Tố khác nhau vượt Ải" [LOC ac/desc_62]; ach 14 800 Vàng trong 1 khiêu chiến là chuyện khác). (phỏng đoán) mỗi nhân tố âm cho thưởng Đá tỉ lệ độ khó.
- Nhóm "Vượt ải 1 lần" (BoomBoomBoom, FloorCrack, ItIsFate, MonsterAircraft, SpaceDistortion, TimeRacing, TopWanted, VolcanoEruption) có chữ "Complete the game once" nghĩa là đây là khiêu chiến cần hoàn thành, không phải nhân tố tự chọn [LOC task/*_desc].
- Nhân tố gắn nhân vật (Buff_info_10xx "[Giới hạn nhân vật]") và nhân tố ARAM*/Fire*/GunMaster*/Tà Vương/curse-blessing-might-frozen-psyche-endurance thuộc chế độ khác, không đưa vào bảng chính.
- Cơ chế kỹ thuật: điều kiện trong random_objects/map_levels dùng "factor": 105 (void_invasion), 1003, 1010 (id số, ví dụ phòng đặc biệt/mineral/weapon_provider ẩn khi có nhân tố 1003 "MultiStatue"?); bảng ID số -> tên không có trong 17 bảng (phỏng đoán) [CFG random_objects.mineral, weapon_provider, map_levels.map_level_base]. Điều kiện type 5 = "có nhân tố" (suy ra).

Bảng nhân tố (tên Việt | mô tả Việt | mô tả En; khoá = hậu tố term "task/<khoá>_title" và "task/<khoá>_desc"). [LOC task/*]

### Nhân tố tự chọn / ngẫu nhiên (65)
| khoá | Tên Việt | Mô tả Việt | Mô tả En |
|---|---|---|---|
| AggressiveEnemy | Kẻ Địch Hoang Dã | Địch có tính tấn công hơn | More aggressive enemies! |
| AllAlone | Dũng Sĩ Cô Độc | Không thể mang Pet và Lính Thuê | No pets or mercenaries |
| BadLuck | Vận xui | Hết vận may rồi! | You are jinxed! |
| BigSale | 3 lần đầu tiêu phí không tốn Vàng | 3 lần đầu tiêu phí không tốn Vàng | First three purchases in dungeon are free |
| BlackFog | Khí độc lan tràn | Trong khu vực sẽ tàng hình và cộng dồn debuff khí độc, sau khi cộng dồn đầy sẽ mất HP. | Turn invisible but gain stacks within miasmas. Lose HP if stacks max. |
| BombGift | Rương Bom | Rương thưởng phòng quái thường (Rương Trắng) chỉ xuất hiện Vàng hoặc Bom | Bombs and coins spawn in chests when you clear a room (except for boss rooms). |
| BoxMutation | Rương Đột Biến | Một số rương trong ải sẽ đột biến thành rương đặc biệt | Some crates in levels will become special chests. |
| Cruel | Dao Găm Điên Cuồng | DMG bạo kích tăng | Increase critical damage |
| Dark | Mắt Cận Thị | Tầm nhìn bị giới hạn | Vision is limited |
| Dejavu | Giác quan | Có thể sẽ gặp được ải hoàn thành giống nhau | You may encounter levels that you have encountered before. |
| DoubleBoss | Hai Lãnh Chúa | Bạn sẽ cùng lúc đối mặt với 2 Thủ Lĩnh, nhưng Thủ Lĩnh sẽ yếu hơn một chút | Fight with 2 slightly nerfed bosses in each Boss room |
| DoubleCd | CD Gấp Bội | Thời gian chờ kỹ năng gấp đôi | Skill cooldown +100% |
| DoubleCritic | Thuật Cường Hóa Chính Xác | Tỷ lệ bạo kích của vũ khí tăng gấp đôi, DMG bạo kích giảm nửa | Weapon crit rate +100%, crit damage -50% |
| EnemyBuffImmune | Kẻ Địch Tinh Thần | Thời gian chịu hiệu quả bất lợi của địch giảm nửa | Enemy debuff time -50% |
| EnemyDefence | Kẻ Địch Kiên Cuồng | Phòng thủ của địch +1 | Enemy defense +1 |
| EnemyDoubleHp | Nhân Đôi Niềm Vui | Địch có HP gấp đôi | Enemy HP +100% |
| EnemyFlash | Kẻ Địch Chớp Nhoáng | Địch sau khi chịu DMG sẽ dịch chuyển | Monsters shift to a different position the moment they get hit |
| EnemyReborn | Quái sau không tử vong có xác suất hồi sinh | Quái sau không tử vong có xác suất hồi sinh | Killed monsters may revive |
| EnemySplit | Tế Bào Phân Liệt | HP quái dưới một nửa sẽ phân liệt | Monsters split into two when their HP is below 50% |
| ExEnemy | Cảnh Giác Toàn Diện | Xác suất Quái Tinh Anh xuất hiện tăng | Elite enemies appear more often |
| Exception | Nguyên Tố Bất Thường | Khi nhân vật bị tấn công sẽ kèm trạng thái bất thường ngẫu nhiên, chờ 5 giây | When you take a hit, a random debuff will be applied to you. The effect only triggers once every 5 seconds. |
| FastEnemy | Kẻ Địch Chạy | Kẻ địch nhanh hơn, nhưng thỉnh thoảng sẽ choáng | Enemies move faster, but will be stunned from time to time. |
| FastEnemyBullet | Kẻ Địch Phấn Khởi | Tốc độ đạn của địch tăng | Enemy fire rate up! |
| FastShooter | Thuật Cường Hóa Tốc Đánh | Tốc độ tấn công của vũ khí tăng gấp đôi, nhưng tấn công giảm nửa | Weapon fire rate +100%, attack -50% |
| FullHouse | Đèn Thần | Mỗi ải đều có thể gặp thêm 1 phòng đặc biệt | A bonus room in each level |
| GainMount | Thuần Thú Sư | Mỗi lần vào cảnh mới sẽ được nhận 1 Thú Cưỡi | A mount awaits when you enter a new biome. |
| GainWeapon | Thiên Giáng Thần Binh | Mỗi lần vào cảnh mới sẽ được nhận 1 vũ khí | Get a weapon when entering a new biome |
| GoodLuck | May mắn | Bạn là người may mắn hôm nay! | Today is your lucky day! |
| HalfCd | CD Giảm Nửa | Thời gian chờ kỹ năng giảm 50% | Skill cooldown -50% |
| HardShield | Vỏ Cứng Bảo Vệ | Khiên sẽ không khôi phục trong trận, nhưng có phòng thủ mạnh hơn | Better defense, but armor does not regenerate during combat. |
| Huge | Biến To | Thân hình nhân vật biến to, tăng HP và giáp, giảm tốc độ di chuyển | Become larger and gain extra health and armor, but move slower. |
| HugePet | Biến To Pet | Pet hóa khổng lồ, có lực tấn công cao và tính tấn công cao hơn | Pet is gigantic, more aggressive and deals higher damage. |
| InferiorMedicine | Thuốc chất lượng kém | Chỉ số trị liệu nhận trong tất cả dạng hồi phục sẽ giảm một nửa | All recovery -50% |
| InfiniteEnergy | Năng Lượng Vô Hạn | Có năng lượng vô tận | Infinite energy |
| Inflation | Tăng Giá | Giá thương phẩm Nhà Ngục tăng gấp đôi | Store price +100% |
| Intensive | Chiến Thuật Biển Người | Địch mật độ cao hơn | More enemies in the dungeon |
| LackEnergy | Năng Lượng Suy Yếu | Năng lượng tối đa giảm nửa | Max energy -50% |
| LackHp | Da Giòn | HP tối đa cố định là 1 điểm | Max HP =1 |
| LessBuff | Thiên Phú Lựa Chọn +1 | Giảm 1 vị trí thiên phú, nhưng khi chọn thiên phú sẽ tăng 1 mục chọn | Buff slot -1, but option +1 when you choose buffs. |
| LessChoice | Thiên Phú Vị Trí +1 | Tăng 1 vị trí thiên phú, nhưng khi chọn thiên phú sẽ giảm 1 mục chọn | Buff slot +1, but option -1 when you choose buffs. |
| LongMap | Mở Rộng Nhà Ngục | Mỗi ải đều có xác suất xuất hiện thêm 1 phòng chiếu đấu | Each level may contain an extra battle room. |
| MelleOnly | Cận Chiến Giới Hạn | Chỉ có thể dùng vũ khí cận chiến | Melee weapons only |
| MelleWeaken | Vũ khí cận chiến không thể tiêu hủy đạn địch | Vũ khí cận chiến không thể tiêu hủy đạn địch | Melee weapons can't destroy bullets |
| MeridianDisorder | Kinh Mạch Hỗn Loạn | Giới hạn Hộ Giáp HP cố định 1 điểm, giới hạn Năng Lượng cố định 999 điểm | Max armor and max HP are fixed at 1. Max energy is fixed at 999. |
| MoreBrave | Càng đánh càng hăng | Tiêu diệt quái liên tục sẽ giúp nhân vật mạnh hơn | You get stronger as you acquire a killstreak. |
| MoreBuff | Thiên Phú Dị Bẩm | Nhận thêm 3 vị trí thiên phú | Max number of buffs +3 |
| MoreChoice | Thiên Phú Tự Chọn | Khi chọn thiên phú tăng 2 mục lựa chọn | Options +2 when you choose buffs |
| MultiStatue | Đa Tượng Điêu Khắc | Có thể cùng lúc có nhiều hiệu quả Tượng | You can worship multiple statues |
| OneWeapon | Vũ Khí Đơn | Mặc định chỉ có thể mang theo 1 vũ khí | Can only carry one weapon |
| Painless | Không Có Tri Giác | Giao diện tính năng mất tác dụng | Functional UI is disabled |
| RandomCharactor | Đa Nhân Cách | Khi vào tầng kế ngẫu nhiên đổi nhân vật chọn | May switch character when you enter a new level |
| RebornTwice | Hồi Sinh Thức TỈnh | Số lần hồi sinh khi bị hạ +1 | Gains +1 revival chance. |
| ReforgeWeapon | Đúc Lại Vũ Khí | Khi bắt đầu mỗi ải sẽ đúc lại vũ khí trong tay | Weapons get reforged at the start of each level |
| RenduErmai | Thông Kinh Mạch | Tốc độ tấn công +10%; HP +1; Tốc độ di chuyển +10%; Tỉ lệ bạo kích +5% | Attack speed +10%, health +1, movement speed +10%, and crit hit rate +5%. |
| SaleDay | Ngày ưu đãi | Sự kiện ưu đãi Thương Nhân Thần Bí đã mở! | Trader's special sale is on! |
| SleepWalking | Mộng Du | Thứ tự Nhà Ngục bị làm rối | Random levels |
| SlowShooter | Thuật Cường Hóa Cơ Bắp | Tấn công của vũ khí tăng gấp đôi, nhưng tốc độ tấn công giảm nửa | Weapon attack +100%, fire rate -50% |
| SuperFactor | Hiệu quả Nhân Tố Thử Thách khác tăng cường | - | - |
| Tenacious | Thuật Hồi HP | Khi HP dưới 50% tự động hồi phục | Regenerate HP when it's below 50% |
| TimeDistortion | Tốc độ dòng chảy thời gian không ổn định | Hành động của bạn lúc nhanh lúc chậm | Your movement speed randomly increases or decreases. |
| Tiny | Biến Nhỏ | Thân hình nhân vật biến nhỏ, giảm HP và giáp, tăng tốc độ di chuyển | Become smaller and lose health and armor, but move faster. |
| TrackingLaser | Laser theo vết | Laser xuất hiện định kỳ sẽ theo dõi người chơi, gây sát thương cho người chơi lẫn kẻ địch! | A beam of laser will appear regularly, tracking you and dealing damage to both you and your enemies! |
| WeaponEquip | Bậc Thầy Phụ Kiện | Tất cả vũ khí tự có 1 bộ phận | All weapons are equipped with attachments |
| WeaponOverheating | Vũ khí quá nóng | Vũ khí dạng bắn tấn công liên tục sẽ khiến tốc độ tấn công chậm đi | The fire rate of weapons that discharge projectiles reduces after consecutive attacks. |
| WrongConfig | Thiết lập lỗi | Mỗi phòng chỉ sẽ xuất hiện 1 loại kẻ địch | Only one type of enemy will appear in each room. |

### Khiêu chiến "vượt ải 1 lần" (8)
| khoá | Tên Việt | Mô tả Việt | Mô tả En |
|---|---|---|---|
| BoomBoomBoom | Bùng Nổ | Kẻ địch tử vong sẽ nổ, gây sát thương cho người chơi Khi người chơi khác tử vong cũng sẽ gây vụ nổ lớn Mở khiêu chiến này và vượt ải 1 lần | Complete the game once. And in this game, both enemies and players explode upon death. The explosion deals damage to players.   |
| FloorCrack | Rãnh Nứt Thời Không | Khi quái tử vong sẽ có xác suất để lại rãnh nứt, gây sát thương rơi, mở khiêu chiến này và vượt ải 1 lần | Complete the game once. And in this game monsters, upon death, have a chance to open a rift of time and space. You will take damage if you fall into the rift. |
| ItIsFate | Vận Mệnh An Bài | Vượt ải 1 lần với điều kiện cả đội hồi sinh từ 2 lần trở xuống Việc hồi sinh vũ khí và nhân tố không tính là điều kiện để mất hạn chế hồi sinh | Complete the game once, and in this game, the whole team (all the team members combined) can't revive more than 2 times. If one is revived by a weapon or a challenge condition, it is not counted as one revival consumed.  |
| MonsterAircraft | Phi Thuyền Quái | Thường xuyên có phi thuyền chở quái bay và ném bom căn phòng (bất chấp ta hay địch), mở khiêu chiến này và vượt ải 1 lần | Complete the game once. And in this game, from time to time, a bomber will fly across the room and bombard everyone in it, including monsters. |
| SpaceDistortion | Không Gian Bóp Méo | Phóng to thu nhỏ ngẫu nhiên, vượt ải 1 lần (To lên sẽ giảm tốc độ di chuyển và ngược lại) | Complete the game once. And in this game, you will get bigger or smaller from time to time. You move slower if you grow bigger, and you move faster once you shrink smaller.  |
| TimeRacing | Chạy đua thời gian | Vượt ải 1 lần trong 12/16 phút (Thường 12 phút, lợi hại 16 phút) | Complete the game once. And in this game you should finish a run within 12 minutes on Normal difficulty or 16 minutes on Badass difficulty.  |
| TopWanted | Lệnh Truy Nã Đỏ | Mỗi phòng quái đều có 1 Tinh Anh phóng to, mở khiêu chiến này và vượt ải 1 lần | Complete the game once. And in this game you will run into a bigger elite monster in each battle room. |
| VolcanoEruption | Núi Lửa Phun Trào | Vượt ải 1 lần dưới sự bắn phá của thiên thạch (Không gây sát thương cho địch) | Complete the game once. And in this game volcanic rocks will pelt down on you. These rocks deal no damage to enemies.  |

### Nhân tố của Mê Trận Tà Vương (tối đa nhận 10 lần) (6)
| khoá | Tên Việt | Mô tả Việt | Mô tả En |
|---|---|---|---|
| ExtraHurtDamage | Kiếm Hai Lưỡi (Tà Vương) | DMG nhân vật phải chịu +1, DMG quái phải chịu +2 (được nhận 10 lần) | Character damage taken +1. Enemy damage taken +2. Can be obtained up to 10 times. |
| IncreaseEnemyBuffImmune | Gen Miễn Dịch (Tà Vương) | Tăng tăng cường miễn dịch đối với hiệu quả khống chế của quái (được nhận 10 lần) | Increases enemy resistance to control effects. Can be obtained up to 10 times. |
| KillEnemyRebornTeammate | Thuật Hồi Sinh (Tà Vương) | Diệt quái có tỉ lệ hồi sinh toàn bộ đồng đội | Chance to revive all teammates upon killing enemies. |
| MoreGeneEnemy | Đột Biến Gen (Tà Vương) | Tỉ lệ Quái Gen xuất hiện +2% (được nhận 10 lần) | Spawn chance of mutated enemies +2%. Can be obtained up to 10 times. |
| ReduceEnemyBuffImmune | Thuật Suy Yếu (Tà Vương) | Triệt tiêu 1 tầng tăng cường miễn dịch đối với hiệu quả khống chế của Uy Áp (được nhận 10 lần) | Cancels 1 increased Pressure Level's weight on enemy resistance to control effects. Can be obtained up to 10 times. |
| ReduceEnemyMoveSpeed | Thuật Chậm Chạp (Tà Vương) | Tốc độ di chuyển của quái -1% (được nhận 10 lần) | Movement speed of enemies -1%. Can be obtained up to 10 times. |

Ghi chú bảng: BigSale/EnemyReborn/MelleWeaken/SuperFactor chỉ có tên (không có mô tả riêng): "3 lần đầu tiêu phí không tốn Vàng", "Quái sau không tử vong có xác suất hồi sinh", "Vũ khí cận chiến không thể tiêu hủy đạn địch", "Hiệu quả Nhân Tố Thử Thách khác tăng cường" [LOC task/BigSale, EnemyReborn, MelleWeaken, SuperFactor]. VolcanoEruption lấy tên từ task/VolcanaEruption_title.

Phân loại độ làm được trên web (hầm ngục thủ tục hiện có):
- Dễ (chỉnh hệ số hoặc cờ): EnemyDoubleHp (HP quái x2), EnemyDefence (+1 phòng thủ), AggressiveEnemy, FastEnemy, FastEnemyBullet, EnemyBuffImmune, Intensive (mật độ), ExEnemy (xác suất Tinh Anh), LackHp (HP tối đa=1), LackEnergy, InfiniteEnergy, DoubleCd/HalfCd, DoubleCritic/FastShooter/SlowShooter, Cruel, InferiorMedicine, Inflation/BigSale/SaleDay (giá), MoreBuff/LessBuff/LessChoice/MoreChoice (số thiên phú), RebornTwice, OneWeapon, MelleOnly, Huge/Tiny, RenduErmai, Tenacious, HardShield, Dark (hạn chế tầm nhìn), AllAlone (cấm pet), GoodLuck/BadLuck (tỉ lệ rơi), MoreBrave, WeaponOverheating, DoubleBoss (2 trùm, giảm HP).
- Vừa (cần thêm đối tượng/phòng): LongMap/FullHouse/WrongConfig (cấu hình phòng), GainWeapon/GainMount/WeaponEquip/ReforgeWeapon, MultiStatue, BombGift/BoxMutation, EnemyFlash/EnemySplit/EnemyReborn, Exception, SleepWalking/Dejavu (thứ tự ải), RandomCharactor (đổi nhân vật giữa tầng), HugePet, BlackFog, TrackingLaser, MeridianDisorder, TimeDistortion, Painless (tắt UI), MelleWeaken, SuperFactor.
- Khó/ít giá trị: nhóm "vượt ải 1 lần" (nhiều hiệu ứng toàn màn: thiên thạch, phi thuyền, rãnh nứt, phình/co), ReturnPlayer*, ARAM*.
Tổng: 65 nhân tố chính + 8 khiêu chiến + 6 nhân tố Tà Vương trong bảng trên (không tính ARAM/Fire/GunMaster/ReturnPlayer/blessing...).

Đặc tả code đề xuất:
1. Registry SK.FACTORS = { key: { vi, desc, apply(run), reward } } đặt cạnh design.js; mỗi nhân tố là một "sửa số" lên run.mods (hpMul, atkMul, spawnMul, eliteRate, playerHp, energyMul, cdMul, shopMul, buffSlots, buffChoices, banPet, oneWeapon, meleeOnly...). Dễ ghép, không trùng (I_factor_repeat).
2. Chọn: (a) màn Nhân Tố trong Phòng Khách: bảng nhiệm vụ gồm 3-4 áp-phích ngẫu nhiên theo ngày (seed = ngày địa phương), nút "Đổi" (tốn lượt/Vàng, phỏng đoán) và "Nhận thử thách"; (b) vật Bóng Nhân Tố trong ván (cho thêm nhân tố ngẫu nhiên, không trùng).
3. Thưởng (phỏng đoán): Đá theo tổng độ khó nhân tố; khiêu chiến ngày hoàn thành = ach "30 nhân tố khác nhau" theo dõi qua profile.factorsDone (Set).
4. Kết hợp với Khu Thí Luyện: mang nhân tố thì không được Thuần Túy [LOC bossrush_intro_tips4].
5. Hiển thị cuối ván: dòng "Nhân Tố Thử Thách" liệt kê đã mang [LOC ui_certificate_challenge].

## 3. Điểm cần xác minh thêm (nguồn không có)
- Hệ số HP/ST/tốc độ/mật độ/Tinh Anh chính xác của Lợi Hại; số trận và hồi máu của Khu Thí Luyện; số Lông Vũ/lượt/ngày; thưởng Nhân Tố; id số factor (105/1003/1010) -> tên. Cách lấy: clip gameplay (skill watch-game-clips) hoặc giải mã bảng cấu hình còn lại (ngoài 17 bảng; luban_config trong bundle config/luban_config).
