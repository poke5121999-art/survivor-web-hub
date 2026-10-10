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
- Đã làm (js/bossrush2.js, đợt 2): Thí Luyện Thuần Túy chọn ở hộp thoại Valkyrie (thẻ Khu Thí Luyện): hạn 12 phút / Lợi Hại 17 phút [WIKI Rush to Purity] tính ngoài phòng khởi đầu, mốc kiểm lúc vào cổng ải 3-5 [ƯỚC LƯỢNG]; hỏng khi chọn thiên phú, đang giữ vũ khí lạ lúc qua cổng (vứt đi thì bật lại), quá giờ; đạt thì mở ải 3-6 Tước Sĩ và đá quý x2, trượt thì bỏ 3-6 và đá quý x0,5 [WIKI]. Vé: 3 lông vũ tặng một lần [ƯỚC LƯỢNG], việc treo thưởng "thu thập" của Cảnh Sát thưởng 2 [WIKI], mỗi lần vào tốn 1 lông vũ + 1 trong 3 lượt/ngày [WIKI]. Lính e_bossrush_minion_a..d (kiếm / cung / súng nhiều viên / súng ngắn, HP 300, tốc 5 [CFG]) dựng từ prefab; Tước Sĩ gọi đợt 3 lính mỗi 14 s, tối đa 6, đợt sau +7% [CFG strengthenFactor; chu kỳ ƯỚC LƯỢNG]. Trùm tầng 4: 25% mỗi ải 3-2..3-5 đổi sang vùng tầng 4 [ƯỚC LƯỢNG]. Bộ kiểm test/soulknight-bossrush.js.
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

## 2d. Mê Trận Tà Vương (looptravel, "Matrix of the Lord of Evil")

Nhãn thêm: [WIKI Matrix] = soul-knight.fandom.com/wiki/Matrix_of_the_Lord_of_Evil, [WIKI Loop] = trang Loop_Mode (bản cũ 2.7.0-3.0.0), [WIKI SV] = trang Sir_Verdant, [WIKI buff N] = trang riêng của thiên phú id N. Wiki lấy được bằng API `api.php?action=parse` (web chính bị 402 nhưng API trả 200) [ĐO 2026-10-10].

### Là gì
Chế độ Ải vô tận: vẫn 5 ải mỗi tầng, nhưng qua 3-5 không dừng mà lặp lại dãy tầng cũ cho tới khi người chơi chết [LOC guide/mode_loop/guide01-05; WIKI Matrix "Loop Travel"]. Cùng dãy vùng đất lặp lại (4-1 là Rừng, 5-1 là Lâu Đài...) [WIKI Matrix, WIKI Loop]. Có hai độ khó Thường/Lợi Hại [WIKI Matrix "Access"]. Tên: gamemode/looptravel "Mê Trận Tà Vương", thẻ vào ui/game_entry_xiewang_desc "Mạnh hay không, đại nhân Tà Vương vĩ đại sẽ tự mình phán xét!" [LOC]. Không phải Khu Thí Luyện Vô Tận: chế độ Vô Tận của Khu Thí Luyện là một thống kê riêng "Số ải cao nhất của Du Lịch Vô Tận (Khu Thí Luyện)" [LOC statistics/max_loop_level_boss_rush].

Cách vào: mở khoá ngay khi Khu Phép Thuật mở; một người chơi vào bằng "Cửa Dịch Chuyển Mê Trận" (item/gate_modeloop; hỏi "Vào Mê Trận Tà Vương" modeloop/enter_tips) ở Khu Phép Thuật [WIKI Matrix, LOC]. Nhiều người: chủ phòng bật công tắc góc trên trái [WIKI Matrix]. Hạn chế: không chọn anh hùng huyền thoại [LOC tips/mode_cant_select_hero]; không tự chọn Nhân Tố Thử Thách (Tà Vương ban) [LOC tips/mode_cant_use_factor]; "không thể dùng bất kỳ thứ gì mang từ thế giới này" [LOC guide/mode_loop/guide11]; Kẻ Vượt Ranh Giới không xuất hiện nên không có tầng 4 [WIKI idt]. Không có 3-6: cổng 3-5 đi thẳng sang tầng kế [WIKI Matrix, suy từ "continues beyond 3-5"].

### Cấp Uy Áp (Pressure Level, P)
- P = 0 lúc vào; tăng 1 mỗi lần clear một tầng và vào tầng kế. Nhãn thành tựu: P = 20 là "21-1" [WIKI Matrix; LOC ac/desc_87 "Uy Áp Tà Vương đạt 20 tầng"; CFG achievements.87 achievementType 71, targetInt 20]. Nên P = số tầng đã vượt = tầng hiện tại - 1.
- HP quái và trùm = HP gốc x (1 + 0,15 x P), làm tròn (24 HP ở P=3 thành 34,8 thành 35) [WIKI Matrix]. Trùm bản Tinh Anh nhân thêm 1,25; điều kiện Hai Lãnh Chúa nhân 0,75. Ví dụ wiki: 2 UFO Laser Tinh Anh ở P=20 có 1200 x (1+0,15x20) x 1,25 x 0,75 = 4500 HP mỗi con [WIKI Matrix]. Tháp pháo của Phòng Súng, Mỏ Pha Lê, Mỏ Vàng cũng nhân theo; riêng Phòng Súng còn +15 HP gốc sau mỗi tầng nên mọc nhanh hơn cả trùm [WIKI Matrix].
- Sát thương quái đánh người chơi (và thú cưng, tuỳ tùng) +1 mỗi 3 cấp P (sau mỗi vòng 3 tầng): 7-X mạnh hơn 1-X đúng 2 sát thương [WIKI Matrix]. Tức +floor(P/3).
- Kháng khống chế của quái tăng theo P; tỉ lệ Tinh Anh và quái đột biến (Quái Gen) cũng tăng theo P [WIKI Matrix, LOC guide12]. KHÔNG có số gốc. Bản Vô Tận cũ: thời gian trạng thái xấu lên quái giảm một nửa mỗi vòng, Tinh Anh nhiều hơn mỗi vòng, quái đông hơn và hung hăng hơn mỗi vòng [WIKI Loop] (cũ, dùng làm gợi ý [SUY]).
- Cấp vũ khí (Weapon Level, số xanh trên nút vũ khí, mỗi khẩu một cấp): vũ khí thấp cấp càng đánh yếu khi P tăng: thấp hơn 2 cấp thì mất 1 sát thương, cộng dồn; áp cả cho phụ kiện và vũ khí của phân thân Sát Thủ. Miễn: Khiên, Serenity, Death Note, Gậy Anubis [WIKI Matrix]. Tên trong game: "Cấp Uy Áp", "Độ bền" (mode_loop/pressure_level, mode_loop/toughness "Resistance") [LOC]. Cấp khởi đầu của một khẩu vũ khí và "thấp hơn cái gì" (so với P?) KHÔNG có nguồn; (phỏng đoán) trừ floor(max(0, P - w.lvl) / 2) sát thương mỗi phát (tối thiểu 1), w.lvl bắt đầu 0 và tăng bằng NPC.

### Thanh Uy Áp và phán quyết của Tà Vương
- Thanh gồm thanh tiến độ (xanh lơ) tăng khi hạ quái và vạch mốc (xanh lục) trượt dần sang phải. Khi bước vào cổng tầng kế (x-5), Tà Vương chấm điểm: tiến độ vượt mốc = "Thưởng", ngược lại = "Phạt". Vạch luôn vượt thanh nếu ở lại tầng quá lâu. Vào tầng mới cả hai về 0 [WIKI Matrix; LOC guide/mode_loop/guide06-09].
- Thưởng: 70% Nhân Tố tích cực, 30% trung tính. Phạt: 40% tiêu cực, 60% trung tính [WIKI Matrix]. Lời Tà Vương: thưởng mode_loop/good01-04 ("Làm tốt lắm", "Thú vị...", "Yo~", "Thú vị"), phạt mode_loop/justsoso01-04 ("Không ổn lắm...", "Cái này à?", "Hả? ...", "Xem ra không chịu nổi?"); mode_loop/you_are_lazy "Thích lười biếng?" (khi vạch mốc vượt vì ở lại quá lâu [SUY]); mode_loop/end_title "Có vậy thôi sao" (màn kết khi chết [SUY]) [LOC]. Thành tựu "Matrix Racer" = 5 lần liên tiếp "Well Done!" (ac/name_89 "Chạy đua thời gian") [WIKI Matrix; LOC].
- Tốc độ vạch mốc, lượng tiến độ mỗi quái: KHÔNG có nguồn. (phỏng đoán) tiến độ = số quái đã hạ / số quái dự kiến của tầng (tổng ngân sách đợt quái); vạch = giây đã qua / 360 (đầy sau 6 phút/tầng); đặt hằng số ở data/sk-matrix.js.
- Ngân Hàng Nhân Tố (bể bốc), phân loại [WIKI Matrix]; cột "web" = khoá đã có trong SK.FACTORS (js/factors.js):

| Loại | Nhân tố (khoá LOC) | Web có |
|---|---|---|
| Tích cực (10 chung) | Thiên Giáng Thần Binh GainWeapon, CD Giảm Nửa HalfCd, Dao Găm Điên Cuồng Cruel, May mắn GoodLuck, Càng đánh càng hăng MoreBrave, Thuật Hồi HP Tenacious, Đèn Thần FullHouse, Bậc Thầy Phụ Kiện WeaponEquip, Biến To Pet HugePet, Thuần Thú Sư GainMount | 4/10 (HalfCd, Cruel, MoreBrave, Tenacious) |
| Trung tính (5) | Biến To Huge, Biến Nhỏ Tiny, Tốc độ dòng chảy thời gian không ổn định TimeDistortion, Giác quan Dejavu, Thiết lập lỗi WrongConfig | 2/5 (Huge, Tiny) |
| Tiêu cực (19 chung) | Kẻ Địch Hoang Dã AggressiveEnemy, Kẻ Địch Kiên Cuồng EnemyDefence, Chiến Thuật Biển Người Intensive, Kẻ Địch Tinh Thần EnemyBuffImmune (mô tả: thời gian debuff lên quái -50%), Kẻ Địch Phấn Khởi FastEnemyBullet, Hai Lãnh Chúa DoubleBoss, Vận xui BadLuck, Kẻ Địch Chạy FastEnemy, Cảnh Giác Toàn Diện ExEnemy, Mở Rộng Nhà Ngục LongMap, Vũ khí quá nóng WeaponOverheating, Thuốc chất lượng kém InferiorMedicine, Nhân Đôi Niềm Vui EnemyDoubleHp, Kẻ Địch Chớp Nhoáng EnemyFlash, Nguyên Tố Bất Thường Exception, Vỏ Cứng Bảo Vệ HardShield, CD Gấp Bội DoubleCd, Dũng Sĩ Cô Độc AllAlone, Tăng Giá Inflation | 13/19 (thiếu EnemyBuffImmune, BadLuck, LongMap, WeaponOverheating, EnemyFlash, Exception) |
| 6 của Tà Vương (tối đa 10 lần mỗi cái, trừ Hồi Sinh) | xem bên dưới | 0/6 |

"Một số Nhân Tố hay gặp không bốc được theo cách này" [WIKI Matrix] (danh sách loại trừ không có). Không trùng khoá chung (LOC I_factor_repeat); 6 nhân tố Tà Vương có trần 10 lần.

### 6 nhân tố Tà Vương dùng thế nào (số từ LOC task/<khoá>_desc, loại từ WIKI Matrix)
| Khoá | Loại | Luật chạy (stack n, n <= 10) | Móc trong web |
|---|---|---|---|
| ReduceEnemyBuffImmune "Thuật Suy Yếu" | Tích cực | Triệt tiêu n cấp Uy Áp khỏi phần kháng khống chế (P hiệu dụng cho kháng = P - n; không đổi HP/sát thương) | G.mods.pressureCtlCut += 1 |
| ReduceEnemyMoveSpeed "Thuật Chậm Chạp" | Tích cực | Tốc độ quái -1% mỗi lần | enemySpeedMul *= 0,99 (factors.js đã có enemySpeedMul) |
| KillEnemyRebornTeammate "Thuật Hồi Sinh" | Tích cực | Hạ quái có xác suất hồi sinh đồng đội; chỉ gặp ở nhiều người, và là cần thiết cho thành tựu "World Savior" (cứu 3 đồng đội một lượt, ac/desc_88) [WIKI Matrix] | BỎ ở bản một người |
| MoreGeneEnemy "Đột Biến Gen" | Tiêu cực | Tỉ lệ Quái Gen +2% mỗi lần ("quái có hiệu ứng đặc biệt như trong Thần Điện": Origin/Enemies #Mutations) | G.mods.mutateRate += 0.02; cần hệ Quái Gen (không có ở web) |
| ExtraHurtDamage "Kiếm Hai Lưỡi" | Tiêu cực | Người chơi chịu +1, quái chịu +2 sát thương mỗi lần | hurtPlayer (actors.js:1409) cộng n; chỗ trừ phòng thủ enemyDef (actors.js:1820) cộng 2n; giữ cả hai ở G.mods.playerHurtAdd, enemyHurtAdd |
| IncreaseEnemyBuffImmune "Gen Miễn Dịch" | Tiêu cực | Quái kháng khống chế thêm n cấp (P hiệu dụng cho kháng = P + n) | G.mods.pressureCtlCut -= 1 |
Nhân tố chung kéo theo: EnemyBuffImmune (Kẻ Địch Tinh Thần) = thời gian debuff trên quái -50% ("Enemy debuff time -50%" LOC task/EnemyBuffImmune_desc) dùng làm bậc kháng chuẩn: hệ số thời gian trạng thái = 0,5^(Peff/3) [SUY, theo bản cũ "giảm một nửa mỗi vòng"].
Quái Gen (tên chính thức LOC fire/gene_name_*, mô tả fire/gene_*; số liệu từ WIKI Enemies#Mutations): 11 kiểu: Sức Mạnh (+50% cỡ/HP/sát thương, -33,33% tốc độ), Nhanh Nhẹn (-33,33% cỡ/HP/sát thương, +50% tốc độ), Thần Thánh (giảm 20% sát thương, miễn trạng thái và tử thần), Ác Ma (giảm 60% sát thương trừ khi đang dính trạng thái), Phản Xạ (sóng chấn khi bị đánh), Khiên (chặn đạn tầm xa tới khi phá khiên), Tàng Hình (HP giảm nửa, không khoá mục tiêu), Hao Tổn Năng Lượng (mỗi đòn trừ 5% năng lượng tối đa), Hút HP (hút dần HP tối đa), Suy Yếu (dây nối quái, chạm vào giảm mạnh tốc độ; chính là "Chaining"), Bắn Lan (2-4 đợt bọt độc 4 sát thương). Tàng Hình và Suy Yếu KHÔNG có trong Mê Trận [WIKI Matrix, Trivia; bản 7.4.0 thêm 3 kiểu mới nhưng bỏ Chaining khỏi chế độ này, không rõ phiên bản]. Tỉ lệ cơ bản KHÔNG có nguồn.

### Thiên phú Tà Vương và ô thiên phú
- 38 ô thiên phú; chọn 1 trong 3 sau ải x-2 và x-5; thiên phú đã chọn không hiện lại trong ván [WIKI Matrix "Exclusive Content"]. (Web: BUFF_SLOTS = 7, BUFF_AFTER = 1-1, 1-3, 1-5, 2-3, 2-5, 3-5 trong js/rooms.js:1505.) Số cấp "Giới hạn thiên phú" là thống kê cuối ván (mode_loop/buff_max) [LOC].
- Thiên phú riêng (Matrix Buffs, id 2001-2007 + 2117) [LOC Buff_info_*, WIKI buff N]:

| id | Tên (wiki) | Luật |
|---|---|---|
| 2001 | Matrix Health Restoration | Vào ải kế: hồi 10% HP tối đa, tối thiểu 1; Hiệu Quả Thuốc không ảnh hưởng |
| 2002 | Matrix Energy Restoration | Vào ải kế: hồi 30% năng lượng tối đa |
| 2003 | Matrix Lightning Hit | Đánh trúng có xác suất tạo sét 3 sát thương, nảy tối đa 4 quái, xác suất choáng 2 giây |
| 2004 | Matrix Ice Hit | Đánh trúng bắn 12 gai băng xung quanh, có xác suất đóng băng |
| 2005 | "Xin Tà Vương bớt giận" | Triệt tiêu 1 cấp Uy Áp (kháng khống chế) [LOC Buff_info_2005: "Tăng triệt tiêu Uy Áp 1 lần"]; nói Tà Vương châm chọc mode_loop/beg01-02 |
| 2006 | "Xin Tà Vương bớt giận" (2) | Gỡ Nhân Tố xấu vừa nhận [LOC Buff_info_2006] |
| 2007 | Matrix Energy | Năng lượng tối đa +20, cộng dồn 10 lần |
| 2117 | Elemental Block | Chặn 1 hiệu ứng nguyên tố mỗi 8 giây (id 2117, cd 8); nay chỉ còn ở Mê Trận [WIKI buff 2117] |

Web chưa có 2001-2007 trong SK_BUFFS86.buffs (chỉ có 2101-2106, 2108, 2118, 2134, 2145, 2146, 1015-1025, 3001-3007) [ĐO data/sk-buffs86.js]; tools/buffs/talents86.py thêm được bằng cách thêm id vào danh sách; icon ui_buff_x như 3001-3007. Phần bể bốc (Tà Vương trộn thiên phú thường + riêng, xác suất xin tha) KHÔNG có nguồn.

### Tay sai Tà Vương (NPC)
Xuất hiện ở ải x-1 của mỗi tầng sau 1-5 (phòng khởi đầu r_start_looptravel_npc, weight 2, điều kiện loại 2 và loại 3) [WIKI Matrix; CFG map_levels.map_level_base.StartRooms]. Bể random_objects.start_loop_travel_npc gồm 3 NPC mỗi NPC weight 10; Thầy Bói chỉ khi chỉ số ải >= 15 (4-1 trở đi, tính 1-1 = 0) và điều kiện loại 12 > 0 (không rõ nghĩa) [CFG random_objects.start_loop_travel_npc]. Mỗi người chơi tương tác 1 lần.
- Con Bạc (Gambler): tốn một nửa vàng, 50% thành công: tăng độ bền vũ khí thêm 1; thất bại cho 1 Thuốc viên (Pill) an ủi [WIKI Matrix]. LOC: "Tốn {0} thử không?" (consume_coin), "May mắn đấy!", "Thử càng nhiều, cơ hội càng nhiều!".
- Thương Nhân (Merchant): 1-3 Pha Lê Tà Vương, 100% tăng độ bền vũ khí thêm 1 [WIKI Matrix]. LOC consume_crystal "Có {0} Pha Lê Tà Vương, tiêu {1}?"; câu "Bảo đảm thành công, chỉ cần nói cần hay không thôi?".
- Thầy Bói (Prophet): 1 Pha Lê, cấm 1 Nhân Tố tiêu cực trong 5 ải (từ ải kế) [WIKI Matrix]. Câu "Thả lỏng đi nào!".

### Pha Lê Tà Vương và phần thưởng
- Mỗi lần Uy Áp tăng nhận 4 Pha Lê (Lợi Hại: 5). Hạ Tước Sĩ Lục (Sir Verdant, bản wiki: "boss tuỳ chọn mỗi 15 ải/3 tầng", không gặp khi trùm chính là Iron Will Wavebreaker 3C vì bị dịch chuyển lên đảo cô lập) rơi 3 Pha Lê (Lợi Hại: 4) và giảm 30% thanh Uy Áp [WIKI Matrix, WIKI SV]. Sir Verdant bản Tinh Anh HP 3600 (cả Thường lẫn Lợi Hại) [WIKI SV]; trong config enemies không có khoá riêng cho Mê Trận (chỉ boss_bossrush_final*) [CFG enemies].
- Cuối ván mỗi Pha Lê đổi lấy phần thưởng [WIKI Matrix; số lượt tung mỗi viên KHÔNG ghi]: đá quý 100 (15%), 200 (15%), 500 (17,5%), 1000 (2,5%) = 50%, và Mê Trận là nguồn đá quý DUY NHẤT của chế độ (không có thưởng đá trực tiếp); nguyên liệu pin/sắt/gỗ/linh kiện/chất hữu cơ 28%, 7 mảnh phép thuật 6%, Phân Bón 1%; hạt giống 6% (tối đa 2); phiếu Nhân Tố 4% (tối đa 4), phiếu phụ kiện vũ khí 2% (tối đa 3), Vé dùng thử miễn phí 1%. Tổng 98% (wiki ghi chú ngoài dòng phiếu Anh Hùng Huyền Thoại 2% đã gạch), 2% còn thiếu KHÔNG rõ.
- Vật rơi: "Pha Lê Tà Vương" (mode_loop/item/reward_box); Bundle mode_loop.ab chứa crystal_broken_effect, demon_crystal (RGPrefab/LevelBuff/pixkable), ui_random_factors, ui_demon_countdown, panel_pause_mode_looptravel, grid_root, open_crystal_good/normal.wav [AB mode_loop.manifest]. "ui_demon_countdown" là đồng hồ Tà Vương (chức năng KHÔNG rõ; (phỏng đoán) đếm vạch mốc).
- Thống kê: "Số ải cao nhất Du Lịch Vô Tận" (statistics/max_loop_level), thành tựu Stress Beater (P=20), World Savior (nhiều người), Matrix Racer (5 "Well Done!") [LOC ac/desc_87-89].

### Kết thúc
Chơi tới khi chết; không có chiến thắng. Hồi sinh: không có nguồn riêng (Thần Điện: 3 lần miễn phí, lần 4 là 200 đá [WIKI Origin], không rõ áp cho Mê Trận). Phiên bản cũ (2.7-3.0): vượt 3-5 tính là thắng và vũ khí khung bạc/vàng [WIKI Loop]; bản 8.6 không ghi.

### Thứ đã có ở web dùng lại
- game.js STAGES/buildStages: danh sách tĩnh 15 ải theo DS.run; rooms.js offerIds/giá cửa hàng đọc SK.STAGES nên Mê Trận cần STAGES động (nối thêm 5 ải mỗi tầng khi qua cổng ải cuối của tầng) và rooms.js nắm chỉ số ải không giới hạn (giá gốc: cấp = chỉ số ải; công thức f = (cấp-2) x 0,12, gốc <= 198 [tools/buffs/README]).
- game.js startRun(heroId, mode, factors): G.mode chỉ nhận 'level'|'bossrush', thêm 'matrix'. lobby.js MODES (dòng 829-846): thêm thẻ; launch() (dòng 941-953) bỏ vàng két sắt và vũ khí mang theo như bossrush (đúng "không dùng đồ ngoài thế giới").
- factors.js: G.mods (enemyHpMul, enemySpeedMul, enemyDef, bossHpMul, doubleBoss, buffSlots, buffChoices, priceMul, eliteRate, spawnMul) đã đủ cho 13/19 nhân tố tiêu cực; SK.factorsOn(G) dựng LẠI toàn bộ từ G.factors và SK.factorsPlayer(G,p) không idempotent (cộng hpAdd vào hpMax) nên Tà Vương cần SK.factorsAdd(G,key) chỉ chạy on() của khoá mới và áp phần delta lên người chơi.
- actors.js: hurtPlayer (dòng 1409-1411) đã có móc `if (G.badass) dmg += DS.badass.dmgAdd`; SK.makeEnemy (dòng 1487-1490) gọi SK.factorsEnemy nhân HP lúc sinh; bosses.js dòng 1624 nhân HP trùm với HP_FACTOR 1,2 và badass.bossHp 1,5 (CHÚ Ý: Mê Trận wiki dùng công thức riêng 1+0,15P; chọn quy tắc nhân hay thay, xem kế hoạch).
- rooms.js: openChoice(ids), G.hold, sự kiện 'portalEnter' (dòng 1591) cho màn chọn thiên phú và màn phán quyết; BUFF_AFTER/BUFF_SLOTS/buffSlots()/buffChoices().
- boss_bossrush_final(.js) đã có AI Tước Sĩ: gần với Tước Sĩ Lục? KHÔNG (khác khoá); Sir Verdant chưa có AI/rig.

### Kế hoạch làm (tệp, dữ liệu, bộ kiểm)
1. data/sk-matrix.js (sinh bởi tools/matrix/build_matrix.py từ localization_en_vi.json; không sửa tay): hằng số {hpPerP 0.15, dmgEveryP 3, crystalPerP 4, crystalPerPBad 5, verdantCrystals 3/4, verdantBarCut 0.3, rewardPos 0.7/neu 0.3, penaltyNeg 0.4/neu 0.6, buffSlots 38, buffAfter [2,5], factorCap 10}; bảng thưởng Pha Lê; 6 nhân tố; chuỗi LOC mode_loop/*, guide/mode_loop/*, Buff_info_2001-2007.
2. js/matrix.js (mới): G.matrix = {P, crystals, bar, marker, weaponLvl}; hàm P-theo-tầng; SK.matrixEnemy(G,e) nhân HP theo 1+0,15*P (trùm: x1,25 nếu Tinh Anh, x0,75 nếu Hai Lãnh Chúa); móc hurtPlayer thêm floor(P/3); thanh Uy Áp (HUD canvas, js/hud.js); phán quyết ở 'portalEnter' của ải x-5 (G.hold); bốc nhân tố theo 70/30 và 40/60; NPC Con Bạc/Thương Nhân/Thầy Bói qua G.props ở ải x-1 (x >= 2).
3. game.js: buildStages('matrix') + SK.matrixNextFloor() để thêm 5 ải; bỏ nhánh 'victory' khi mode matrix; chủ đề của tầng k = chủ đề tầng ((k-1) mod 3)+1 đã bốc lúc vào (dãy lặp). debug.stage(label) cần nhận nhãn lặp "4-1"...
4. factors.js: thêm 6 khoá Tà Vương (khoá LOC ở bảng trên) + SK.factorsAdd; rooms.js: nhận buffSlots/buffAfter theo mode, bể bốc thêm 2001-2007, 2117; tools/buffs/talents86.py thêm id 2001-2007.
5. lobby.js: thẻ 'matrix' ("Mê Trận Tà Vương", đã có tệp art/lobby/mode_loop.png 2199 byte do phiên khác thêm, chưa kiểm hình; build_lobby_art.py chưa có khoá cho nó), điều kiện mở "Khu Phép Thuật" = web chưa có khu này: tạm mở sau lượt thắng đầu như Lợi Hại (nêu ở GAPS).
6. Bộ kiểm test/soulknight-matrix.js (Playwright như test/soulknight-modes.js, dùng SK_GAME.debug), số cụ thể:
   - P theo tầng: vào tầng 1,2,3,4 thì G.matrix.P = 0,1,2,3.
   - HP quái gốc 16: P=0 giữ 16; P=3 ra 23 (16 x 1,45 = 23,2); P=20 ra 64. HP gốc 24, P=3 ra 35 (khớp ví dụ wiki).
   - Trùm 1200, P=20: thường 4800; Tinh Anh 6000; Tinh Anh + Hai Lãnh Chúa 4500 (khớp wiki).
   - Sát thương cộng thêm của quái: P=0..2 cộng 0; P=3,4,5 cộng 1; P=6 cộng 2; P=20 cộng 6; bản Lợi Hại cộng thêm 1 của badass.
   - Nhân tố Tà Vương: Kiếm Hai Lưỡi n=1 người chơi chịu +1, quái chịu +2; n=10 thì +10 và +20, n=11 bị chặn ở 10; Thuật Chậm Chạp n=10 thì tốc độ quái x0,9.
   - Phán quyết mô phỏng 20000 lần: Thưởng cho tích cực 70% +-1,5%, trung tính 30%; Phạt cho tiêu cực 40% +-1,5%, trung tính 60%.
   - Pha Lê: vào mỗi tầng mới +4 (Lợi Hại +5): sau clear 5 tầng được 20 (25); hạ Verdant +3 (+4) và thanh Uy Áp x0,7.
   - Ô thiên phú: 38; chỉ hiện thẻ ở ải 2 và 5 của mỗi tầng; thẻ đã chọn không hiện lại.
   - Cổng 3-5 không phát hành 'victory': state vẫn 'stage', nhãn ải kế là "4-1" và chủ đề trùng tầng 1.
   - Không mang vàng két sắt/vũ khí mang theo vào ván.
7. Rủi ro/việc sau: Quái Gen (hệ riêng, 11 kiểu), Sir Verdant (AI + bundle), cấp vũ khí (cần w.lvl và HUD số xanh), hồi sinh nhân vật nhiều người.

### Nguồn không có (không đoán trong mã; nếu cần phải chốt bằng clip)
- Tốc độ vạch mốc Uy Áp, lượng tiến độ mỗi quái; xác suất bốc thiên phú Tà Vương/thiên phú xin tha trong 3 thẻ; thời lượng chính xác của hiệu ứng Thuật Suy Yếu lên kháng khống chế; xác suất Tinh Anh và Quái Gen cơ bản và hệ số tăng theo P; thời gian trạng thái xấu theo P; cấp vũ khí khởi đầu và đối chiếu với P; số lượt tung mỗi Pha Lê, 2% xác suất còn thiếu; ý nghĩa điều kiện loại 3 và loại 12 của start_loop_travel_npc; số HP/chiêu Sir Verdant (chỉ có HP Tinh Anh 3600 từ wiki); luật hồi sinh; tên trang wiki "Matrix Buffs" chỉ liệt kê 6 buff (2001-2004, 2007, 2117) và không có nội dung buff 2005/2006 ngoài chuỗi LOC.

## 2e. Xâm Nhập Hư Không (Void Invasion), độ 1 "Lần Đầu Vào Hư Không" (Primordial Void)

Nhãn thêm: [WIKI VI] = trang Void_Invasion, [WIKI Void] = trang The_Void, [WIKI buff N] = trang buff id N, [WIKI mod] = Template:Void_Mode_Weapon_Modifiers_Table, [AB difficulty] = AssetBundles/level/difficulty.manifest (132 asset; chỉ đọc manifest). Config `enemies.json` có đủ khoá e_void_* / boss_void* nhưng Hp = 0 cho mọi quái Hư Không (số máu nằm trong prefab/Lua, không giải mã được) nên mọi số máu dưới đây lấy từ wiki [CFG enemies; ĐO 2026-10-10].

### Là gì
Một độ khó mới của Chế độ Ải (không phải chế độ riêng): "Hầm ngục quen thuộc đã bị sức mạnh Hư Không xâm chiếm" [LOC void_invasion/tip_0, guide_0]. Ba độ: Lần Đầu Vào Hư Không / Hư Không Hỗn Độn / Hư Không Hủy Diệt (mode/void_invasion_0..2); thêm ở bản 7.5.0 (độ 1), 8.0.0 (độ 2), 8.4.0 (độ 3) [WIKI VI; WIKI Update 7.5.0]. Vào ở màn chọn chế độ, không có vật riêng ở Sảnh; KHÔNG chơi được cùng Lợi Hại; thắng độ 1 cho khung bạc, độ 2-3 cho khung vàng [WIKI VI]. Điều kiện mở khoá KHÔNG có nguồn (LOC chỉ có "Chế độ ải độ khó mới Xâm Nhập Hư Không đã mở khóa" void_invasion/guide_0).

### Luật chung của độ 1
- Bỏ phụ kiện vũ khí, bỏ Thợ Thủ Công, Kỵ Sĩ Nghỉ Hưu và mọi NPC nhận phụ kiện; nhân tố Bậc Thầy Phụ Kiện và phụ kiện mang từ ngoài ván không dùng được [LOC void_invasion/tip_7-8]. Thay bằng "dòng thuộc tính vũ khí" (modifier): vũ khí (trừ Thần Thoại) có 0-3 dòng, đổi/thêm/nâng ở Thương Nhân Rãnh Nứt; hết ván là mất [LOC tip_4-5; WIKI VI "Weapon Modifiers"].
- Mọi thiên phú thường có mặt; phần lớn nâng cấp được ở Thương Nhân Hư Không bằng 30 Xu Ám Tinh (chọn 1 trong 3 phương án ngẫu nhiên) [LOC tip_1-3, tip_5; WIKI VI "Upgradable Buffs"]. Có 51 chuỗi Buff_upgrade_* trong LOC (vd Buff_upgrade_1 "Đạn Bạo Kích xuyên thấu + Chảy Máu", _7 Kim Thép, _18 Sóng Xung Kích...); danh sách "kỳ này nâng cấp được" nằm ở void_invasion/tip_3 nhưng chỉ có tiêu đề, danh sách do mã sinh [LOC].
- Rơi nhiều Mảnh Tiến Hóa Vũ Khí hơn [LOC tip_6]. Quái và trùm tăng HP (không có số) [WIKI VI "Enemies & Bosses"]. Quái thường có thể xuất hiện ở mọi ải không bó buộc theo ải (kể cả Lõi Mỏng manh ở phòng Đảo Đất Sét) [WIKI VI]. Quái đột biến có xác suất sinh (không có số) và rơi Xu Ám Tinh khi chết [LOC tip_9; WIKI VI].
- Các Rãnh Nứt Hư Không xuất hiện ngẫu nhiên trong lúc đánh rồi đóng sau một quãng; không đánh được, không chạm được; bước vào mất 1 sát thương ở độ 1 (2 ở độ 2) [LOC tip_11; WIKI VI "Void Rift"; CFG: prefab VoidRift.prefab trong AB difficulty]. Pet/Tuỳ tùng: không có nguồn.
- Phòng chứa quái Hư Không hiện có thể gồm rương kép (lỗi đã sửa ở 8.4.0) [WIKI VI Trivia].

### Tiền tệ
- Xu Ám Tinh (void_invasion/coin, "Darkstar Coin"): rơi từ quái Hư Không và quái đột biến; tiêu ở Thương Nhân Hư Không, Thương Nhân Rãnh Nứt, Nhà Ngân Hàng [WIKI VI "Currencies"].
- Mắt Hư Không (coin_void_eye, "Void Crystal"): rơi từ Tinh Anh Hư Không và Hư Không; tiêu ở Nhà Ngân Hàng, Nhà Sưu Tầm, Tiên Tri [WIKI VI]. Thống kê cuối ván: "Số lượng Xu Ám Tinh nhận được", "Số lượng kẻ địch Hư Không đã đánh bại" (void_invasion/coin_count, kill_count) [LOC]. Thành tựu: tích luỹ tiêu 10000 Xu Ám Tinh (ac/desc_145) [LOC].

### Tinh Anh Hư Không và Khiên Hư Không (cốt lõi của độ 1)
Nguyên tắc [WIKI VI "Void Enemies"]:
- Mọi quái Hư Không trừ Đạo Tặc, Vật Tổ, Rãnh Nứt là Tinh Anh Hư Không: 3 tầng Khiên Hư Không. Đầu ván bốc 3 Tinh Anh hợp lệ (không tính Đạo Tặc); chỉ 3 loại này và Đạo Tặc gặp suốt ván; sinh ngẫu nhiên từ ải 1-2 tới 3-5. Mỗi Tinh Anh chết là không xuất hiện lại cả ván.
- Mỗi tầng khiên có 80 HP ở độ 1 (120 ở độ 2, 160 ở độ 3). Khi khiên còn, MỌI lần bị đánh chỉ tính 1 sát thương vào khiên, nên không phá được bằng đạn thường; mỗi loại có cách phá riêng (xem bảng). Số tầng khiên giữ qua các lần gặp.
- Hạ hết quái nhỏ trong phòng mà Tinh Anh còn khiên thì nó bỏ chạy và rơi 5 Xu Ám Tinh (trừ khi có thiên phú Lệnh Truy Sát 3003, chỉ độ 2-3). Phá được 1 tầng khiên thì nó mở cổng rút lui và rơi 30 Xu Ám Tinh. Hết khiên thì đánh bình thường; chết rơi 50 Xu Ám Tinh + 1 Mắt Hư Không.
- Ở độ 1 chỉ Hộ Vệ, Ảnh Vệ, Linh Vệ có số máu (các loại khác ghi NA) nên danh sách ứng viên độ 1 gồm đúng 3 loại này (suy ra từ "NA" ở độ 1: Huyết Vệ, Tế Tư, Cấm Vệ xuất hiện từ độ 2; Thiền Vệ Trượng/Châu, Triệu Hồi Sư, Hộ Pháp, Đao Phủ từ độ 3; LOC ui/void_invasion_enemy_debut "Xuất hiện ở độ khó {0} trở lên") [SUY, khớp bảng wiki].

| Quái (khoá config) | HP độ 1/2/3 (wiki) | Đòn | Cách phá khiên [LOC ui/void_invasion_enemy_short_guide_N] |
|---|---|---|---|
| Hư Không Thủ Vệ e_void_guard | 250/350/350 | Lao tới, thỉnh thoảng đấm 2 lần (4 sát thương mỗi đòn) | Khi khiên tím biến mất lúc lao (guide_2), đánh trúng đúng lúc đó |
| Hư Không Ảnh Vệ e_void_assassin | 200/300/? | Gọi 2 phân thân 30 HP, cả 3 lao theo vệt chữ nhật tím; chỉ 1 bản thật tính là hạ | Đánh trúng đúng lúc khiên biến mất trước khi lao (guide_1) |
| Hư Không Linh Vệ e_void_mage | 200/300/? | Đặt súng bắn hình chữ thập; thiên thạch (vòng đỏ bám theo rồi đứng yên) | Dẫn Cầu Lửa Hư Không về chính nó, hoặc thiên thạch trúng khiên thì vỡ ngay (guide_0) |
| Hư Không Đạo Tặc e_void_thief | 100/100/100 | Ném phi tiêu hình quạt, biến mất sau 20 giây | Không có khiên; hạ bình thường: rơi 100 Xu Ám Tinh + 1 Mắt Hư Không |
(Từ độ 2: Huyết Vệ, Tế Tư, Cấm Vệ, Vật Tổ; độ 3: Thiền Vệ Trượng/Châu, Triệu Hồi Sư, Hộ Pháp, Đao Phủ; chi tiết ở LOC ui/void_invasion_enemy_guide_0-10 và WIKI VI, ngoài phạm vi độ 1.)

Dữ liệu dựng: bundle level/difficulty.ab có prefab e_void_assassin/guard/mage/thief, VoidShield.prefab, VoidShield_RGEController, shield_bar.prefab, VoidRift.prefab, void_gate.prefab, void_effect_pot/water_dispenser, VoidEyeEffect(_UI), boss_void.prefab + 3 controller final/0..2, boss_void_origin [AB difficulty]. Các AI của Hộ Vệ/Ảnh Vệ/Linh Vệ nằm trong IL2CPP: viết lại từ tên state, đạn prefab, mô tả (như đã làm cho 22 trùm mới [tools/polish/GAPS.md]).

### Trùm "Hư Không" (boss_void)
Đồng hành mọi trùm trước tầng 4 [WIKI Void]: ở ải 1-5 và 2-5 xuất hiện cạnh trùm chính với thanh máu riêng (độ 1: 600 và 1200 HP), không bắt buộc hạ; nếu trùm chính chết trước thì Hư Không bỏ chạy, rơi 40 Xu Ám Tinh (một dòng chú thích ghi 35, mâu thuẫn); hạ nó rơi 120 Xu Ám Tinh. Ở 3-5 nó chỉ xuất hiện sau khi trùm chính chết: 1800 HP ở độ 1 (2400 độ 2, 3000 độ 3), cầm Eternal Night (độ 1) / Nether Lantern (độ 2), hạ xong rơi 1 Mắt Hư Không và nhiều Xu Ám Tinh, mở cổng miễn phí sang 3-6 và 4-1; rương phụ cạnh rương chính có thể có Eternal Night/Nether Lantern; Hai Lãnh Chúa chỉ nhân 0,75 máu (độ 1: 450/900/1430) không thêm trùm; Toàn Cảnh Giác (Full Alert) thành Tinh Anh. Băng nhạc "Hư Không Giáng Lâm" (material_tape_boss_void) rơi hiếm [WIKI Void; LOC]. Config: enemies.boss_void Hp 0 (không có số), boss_void_origin Hp 2000 BossRoom r_boss_void_origin.prefab (đó là Bản Tướng độ 3).

### NPC (độ 1) [WIKI VI "NPCs"; LOC npc/*, npc_void_merchant]
| NPC | Chỗ xuất hiện | Chức năng và giá |
|---|---|---|
| Thương Nhân Hư Không (npc_void_merchant) | Góc dưới-trái phòng khởi đầu của mọi ải x-3 và x-5 | 30 Xu Ám Tinh: bốc 3 thiên phú ngẫu nhiên có thể nâng, chọn 1; "Hết Xu thì không bán" |
| Thương Nhân Rãnh Nứt | Góc dưới-phải phòng khởi đầu của x-1, x-3, x-5 trừ 1-1 | Đổi dòng 20 Xu; chuyển dòng sang vũ khí khác 20 Xu; thêm dòng 100 Xu (từ 2-1); nâng cấp 30/50/80 Xu theo độ hiếm xanh/tím/cam; Huyền Thoại (đỏ) chỉ đổi. Số thao tác mỗi lần gặp: 2 (độ 1), 4 (độ 2), 6 (độ 3), làm mới ở lần gặp sau |
| Nhà Ngân Hàng Hư Không (npc/void_banker) | Phòng đặc biệt, có 6 biển 2 hàng x 3 | 55 vàng = 25 Xu Ám Tinh; 25 Xu = 50 vàng; 1 Mắt = 100 vàng; 110 vàng = 1 Mắt; 55 Xu = 1 Mắt; 1 Mắt = 50 Xu |
| Đại Hiệp Con Thoi Thời Không (npc/void_child) | Phòng đặc biệt (cũng có Cổng tím) | Nhận lời thì biến đi rồi xuất hiện ở phòng kế có quái Hư Không, đánh bằng kiếm laser tím (Laser Sword Purple), thành tuỳ tùng nếu Tinh Anh chết; dẫn về cho Thương Nhân Rãnh Nứt thì cha con nói chuyện, Rãnh Nứt +2 lượt tối đa (thành tựu "Lost Wanderer") |
| Tiên Tri Hư Không | Phòng rương phụ; không có ở tầng 1 và tầng 4 | 1 Mắt Hư Không: chọn vùng đất của ải kế (branch_select, điều kiện chỉ số ải 5-14 [CFG random_objects.void_invasion]) |
| Nhà Sưu Tầm Hư Không (npc/void_collector) | Ải 4-6 (nếu web chưa có tầng 4 thì đặt ở 3-6 [SUY]) | 3 món trên bàn, mỗi món 1 Mắt; chắc chắn có 1/2/3 bản vẽ hoặc mảnh tiến hóa ở độ 1/2/3 tới khi lấy hết; làm mới tốn 1 Mắt. Bể 51 món weight 100 đều: 17 bản thiết kế vũ khí, 4 bản thiết kế trang trí phòng, 7 mảnh phép thuật, 21 hạt giống, phân bón, Vé [CFG random_objects.void_collector_0] |
| Kẻ Vượt Ranh Giới (NPC) | Phòng đặc biệt nếu không đang chơi nhân vật này | 100 đá quý: hiện bản đồ theo số Mắt đang có (1 = phòng Tinh Anh/Vật Tổ, 2 = cổng và phòng trùm, 3 = mọi phòng) [LOC npc/void_eye_tip_0-2] |
Cấu hình phòng: `r_void_invasion.prefab` weight 80 trong SpecialRooms của map_level_base, điều kiện loại 29 > 0 (nghĩa KHÔNG rõ); random_objects.void_invasion: void_bank 100, teach_void_eye 150 (cần void_eye_mastery > 1), branch_select 100, void_child 50 (cần accept_void_child_help > 1) [CFG]. Prefab NPC: npc_void_banker, npc_void_child, npc_void_prophet, sell_void_collector, void_child, void_bank, teach_void_eye, npc_void_child_mercenary [AB levelcommon]; Thương Nhân Hư Không/Rãnh Nứt: tên prefab KHÔNG tìm thấy trong manifest (chỉ có chuỗi LOC) .

### Dòng thuộc tính vũ khí (weapon modifiers)
LOC có 75 tên level/weapon_affix_<id>_name (id 10010-10750, một phần thuộc chế độ Đảo Hương Thảo) và _desc; wiki bảng độ 1 liệt kê ~50 dòng với 4 bậc hiếm (xanh/lam/tím/cam) và Huyền Thoại đỏ [WIKI mod; LOC]. Ví dụ [WIKI mod]: Lan (nổ lan 25/50/75/100%), Nhanh (tốc đạn +10/15/20/30%), Nhạy (tốc đánh +10/20/35/50%), Bạo (bạo kích +10/15/25/40%), Của Trời Rơi (quái đột biến/Hư Không rơi thêm 1/2/3/4 Xu Ám Tinh), Hư Không-Tịch Diệt 10630 (đánh được Rãnh Nứt, phá thì nổ), Hư Không-Luyện Hóa 10640 (20 quái đột biến thì dòng này thành 1 Mắt) [LOC]. Giai đoạn 1 chỉ nên làm 6-8 dòng cắm gọn vào móc sẵn có (Lan, Nhanh, Nhạy, Bạo, Theo, Gai Nhọn, Ống Hút, Của Trời Rơi).

### 7 thiên phú Hư Không 3001-3007 trong độ 1: KHÔNG dùng
Bảng độ khó áp dụng [WIKI buff N; data/sk-buffs86.js đã có tên/mô tả, icon ui_buff_x, pool null]:
| id | Tên (VI/EN) | Độ khó có | Luật + số | Số {n} trong LOC |
|---|---|---|---|---|
| 3001 | Tay Hư Không / Void Grip | Hỗn Độn, Hủy Diệt | Tay không gây 2 sát thương lên Khiên Hư Không (20 lên khiên đỏ) | {0} = 1 thêm |
| 3002 | Thể Chất Hư Không / Void Affinity | Hỗn Độn, Hủy Diệt | Miễn sát thương Rãnh Nứt (cả rãnh lớn của Hư Không, Bản Tướng) | không có |
| 3003 | Lệnh Truy Sát Hư Không / Void Bounty | Hỗn Độn, Hủy Diệt | Hạ hết quái nhỏ thì Tinh Anh Hư Không KHÔNG bỏ chạy, cửa phòng đóng tới khi phá khiên/giết; lỗi: bốc từ Thương Nhân Thần Bí hoặc Gian Thương ở 2-5 làm hỏng 1 ải | không có |
| 3004 | Khiên Hư Không / Void Shield | Hủy Diệt | Vào ván có 12 tầng; mỗi sát thương trừ 1 tầng thay HP/Giáp; hết tầng thì đếm ngược Huỷ Diệt rồi chết bất kể bất tử; hồi tầng: vào ải kế +1, phá khiên Tinh Anh +3, nước uống 1/2/3/4 (tầng 1-4), Vật Tổ +1 mỗi khiên phá, Bình HP/Phục Hồi +1 (lớn +2), hạ Hư Không/Bản Tướng +5; hồi HP/Giáp dư đổi thành bất tử ngắn; Áo Giáp Vàng +1 tầng tối đa mỗi 100 vàng (tối đa 3) | không có (12 tầng từ wiki) |
| 3005 | Hư Không Che Chở / Void Blessing | Hủy Diệt | Còn khiên thì khung bất tử sau khi trúng đòn dài thêm 1 giây | không có |
| 3006 | Hư Không Cộng Tế / Void Support | Hủy Diệt | Lập tức hồi 3 tầng khiên; mỗi lần tương tác Nhân Vật hỗ trợ ở ải sau hồi 1 tầng | {0}=3, {1}=1 |
| 3007 | Tàn Tượng Hư Không / Void Afterimage | Hủy Diệt | Còn khiên: dùng kỹ năng thì tàng hình + bất tử ngắn và để lại Tàn Tượng đánh bằng vũ khí hiện tại | CD {0} giây: wiki ghi "??s", KHÔNG có số |
Ở độ 1: không có Khiên Hư Không của người chơi (3004), không bóc 3001-3003 vào bể chọn. Chỉ làm dữ liệu và móc rỗng `SK.voidTier >= 2/3` để dành cho độ sau; Đại Hiệp Con Thoi chỉ tặng thiên phú ở độ 3 (void_invasion_tier3/tip_5; độ 2 tip_3: "3 thiên phú riêng"). 3 thiên phú riêng của độ 2 khớp với 3001-3003 [SUY]. Bonus độ 3 trong LOC `Buff_void_*`: 33, 17, 34, 11, 05, 2145 (6 chuỗi) và Buff_upgrade_*_void (6, 7, 18, 2145, bản Hủy Diệt) [LOC].

### Phạm vi mã độ 1 và thứ đã có ở web
- Có thể dùng lại: STAGES 15 ải (3 tầng) với mode 'void'; G.mods (enemyHpMul, bossHpMul, buffChoices) cho "quái và trùm tăng HP"; khóa Lợi Hại: setBadass phải chặn khi chọn Hư Không (như wiki); rooms.js openChoice(ids) và SK_BUFFS86 để dựng "Thương Nhân Hư Không: 3 thiên phú nâng cấp, chọn 1" (cần dữ liệu nâng cấp: 51 Buff_upgrade_*; web hiện đã có đúng luật cho 1015-1018, 2101-2146, 38-41... theo tools/buffs/README, nâng cấp riêng thì chưa); boss registry SK.bosses và bosses/*.js cho "Hư Không" (đòn mới); G.props cho NPC; SK.on('enemyKill') để thả Xu Ám Tinh (drops.js).
- Phải làm mới: Khiên Hư Không trên quái (e.vshield = {stacks, hp}) vào đường sát thương actors.js; 3 Tinh Anh + Đạo Tặc + Rãnh Nứt; tiền tệ Xu Ám Tinh/Mắt Hư Không trong HUD (hud.js) và hồ sơ; Thương Nhân Hư Không/Rãnh Nứt/Ngân Hàng/Con Thoi/Tiên Tri/Sưu Tầm; bảng dòng thuộc tính vũ khí (cắm vào p.weapons[i].mods); trùm Hư Không 3 dạng.
- Tầng 4 liên quan: cổng miễn phí sang 4-1 và Nhà Sưu Tầm ở 4-6 phụ thuộc FLOOR4.md; giai đoạn 1 bỏ tầng 4 (kết 3-6 có Nhà Sưu Tầm).

### Kế hoạch làm (tệp, dữ liệu, bộ kiểm)
1. tools/void/build_void.py (mới): đọc localization_en_vi.json + config/random_objects.json, sinh data/sk-void.js {coins, npcs, collectorPool[51], tiers, eliteRoster, strings void_invasion/*, npc/*, ui/void_invasion_enemy_*}; wiki số liệu gõ tay có nhãn [WIKI].
2. js/void.js (mới): G.void = {tier:0, dc, vc, elites:[3 loại], thief}; SK.on('stageEnter') bốc Tinh Anh theo ải; Khiên Hư Không; rơi Xu; NPC; trùm Hư Không; hook 'runEnd' ghi thống kê.
3. js/design.js: DS.void = {shieldHp:80, stacks:3, dmgToShield:1, flee:5, shatter:30, kill:50, thief:100, rift:1, voidBoss:{f1:600,f2:1200,f3:1800}, trader:30, collector:{refresh:1,guaranteed:1}}. game.js: G.mode 'void'; lobby.js thẻ mới (img: tên khoá ui_game_entry_* chưa có; xem tools/hall hoặc ui_game_entry_void* nếu có trong ui.ab).
4. Bộ kiểm test/soulknight-void.js (Playwright), số cụ thể:
   - Tinh Anh độ 1 chỉ thuộc {guard, assassin, mage}, đủ 3 loại không trùng; mỗi ván có tối đa 1 Đạo Tặc.
   - Đánh 100 phát 10 sát thương vào Tinh Anh còn khiên: HP Tinh Anh giữ nguyên 100%; mỗi phát chỉ trừ tối đa 1 vào khiên (luật "mọi lần bị đánh cố định 1"); số tầng khiên không đổi trừ khi dùng cách phá riêng của loại đó.
   - Phá khiên bằng cách riêng: rơi 30 Xu Ám Tinh; bỏ chạy khi hạ hết quái nhỏ rơi 5; chết rơi 50 và 1 Mắt; Đạo Tặc chết rơi 100 và 1 Mắt.
   - Thương Nhân Hư Không: 30 Xu -> 3 lựa chọn, chọn 1; dưới 30 Xu bị từ chối ("Xu Ám Tinh không đủ").
   - Thương Nhân Rãnh Nứt: tối đa 2 thao tác mỗi lần gặp ở độ 1; đổi 20, thêm 100, nâng 30/50/80.
   - Nhà Ngân Hàng: 6 phép đổi đúng bảng (55 vàng -> 25 Xu ...).
   - Rãnh Nứt: chạm 1 sát thương (chưa có 3002).
   - Trùm Hư Không: 600 (1-5), 1200 (2-5), 1800 (3-5, sau trùm chính); Hai Lãnh Chúa x0,75 -> 450/900/1350 [wiki ghi 1430 ở độ 1 mà 1800x0,75 = 1350: lệch, chọn 1350 và ghi chú]; hạ ở 3-5 rơi 1 Mắt, mở cổng.
   - Hồ sơ: thắng độ 1 cho khung bạc; không chọn được khi bật Lợi Hại.

### Nguồn không có
- Khiên 80 HP mỗi tầng có bị đạn thường mài mòn (mỗi phát 1) hay chỉ phá bằng cách riêng: wiki nói cả hai ("80/120/160 máu mỗi tầng" và "mọi sát thương cố định 1") nhưng không nói rõ; hệ số HP quái/trùm tăng ở độ 1; xác suất và loại quái đột biến; xác suất/vị trí xuất hiện Tinh Anh theo ải, số phòng; số lượng Xu Ám Tinh quái đột biến thường rơi; danh sách thiên phú nâng cấp được ở độ 1 và bậc hiếm chi tiết; kiểm soát của điều kiện loại 29 (r_void_invasion) và cấu hình Thương Nhân Hư Không/Rãnh Nứt (không thấy trong random_objects/enemies/npc config; có thể trong luban đã mã hoá); CD của 3007; thời gian đếm ngược Hủy Diệt; điều kiện mở khoá chế độ; hai số chú thích mâu thuẫn (35 hay 40 Xu khi Hư Không bỏ chạy; Hai Lãnh Chúa độ 1 3-5 ghi 1430 so với 1800 x 0,75 = 1350); số HP quái độ 2-3 dấu "?" trong wiki.

## 2f. Thần Điện Thủ Hộ (The Origin, mode/defence)

Nhãn thêm: [WIKI Origin] = trang The_Origin; [WIKI ME] = Mechanical_Engineer (có bảng tháp); [WIKI SP/Mentor/WS/Trader/WH] = Shrine_Priestess / Mentor / Weaponsmith / Trader / Warehouse; [WIKI Enemies] = mục Mutations; [WIKI Carrier] = Alien_Aircraft_Carrier. Wiki ghi bản sau Update 4.0.0 (bản "Legacy" cũ không dùng). Config chỉ có tên map (map_defence, map_C5_defence, map_D10_defence: Path ModeDefence/Prefabs/*.prefab, các mảng Floors/Enemies rỗng) và enemies.defence_plot_boss (Hp 999999, quái cốt truyện) [CFG map_levels, enemies; ĐO 2026-10-10]: số máu, sóng, giá tháp KHÔNG nằm trong config (ở Lua/prefab), nên mọi số dưới đây lấy từ wiki.

### Là gì
Chế độ thủ thành (tower defense) vào qua Cửa Dịch Chuyển Cổ Đại ở Sảnh [LOC item/gate_defence]; mở khoá "mở hết nội thất và vượt 2-5" [LOC defence/mode_gate_unlock_tip]. Vào cổng thì mất thiên phú/nhân tố đính kèm [LOC defmode_intro_tips_08]; phần chuẩn bị mang vào được: vũ khí, phụ kiện, tượng, trang sức, thú cưỡi, lính thuê, pet vườn [WIKI Origin "Access"]. Gốc: vé 500 ngọc (hoặc Vé Nhảy Chế Độ 1 lần/ngày) [WIKI Origin; bản web không có ngọc cổng: bỏ]. Ba đoạn giới thiệu: Khai Quật Khảo Cổ / Ký Ức Chiến Đấu / Khảo Nghiệm Cuối Cùng [LOC defmode_intro_title_01-03].

### Vòng chơi
1. Màn mở đầu (đợt 0-1): "Đợt giới thiệu" ở Phòng Đá Phép với 3 cổng đỏ; người chơi có sẵn chỉ số cấp 5, kỹ năng cấp 10, vũ khí cầm tay +12; đợt này KHÔNG thua được dù Đá Phép vỡ, không sang bản đồ khác, tháp có sẵn không tương tác được; cuối đợt Robot Tự Nổ tới gần Đá Phép, Quan Tế che chắn rồi kiệt sức; sau cảnh phim người chơi về cấp 0 / kỹ năng 0 / vũ khí +6 [WIKI Origin "Wave Defense"; LOC defence/dialog1-3]. Bật "Bỏ qua cốt truyện" [LOC defence/skip_plot] thì bỏ đợt này và vũ khí không được tăng.
2. Quan Tế dẫn người chơi vào Hậu Điện (Shrine Back Chamber, [LOC defence/shop_node]); từ đó khám phá 7 vùng (Rừng, Băng Nguyên, Lâu Đài Hiệp Sĩ, Hang Động, Di Tích, Phi Thuyền, Núi Lửa) lấy vũ khí, EXP, Xu Sao, giải cứu 3 NPC; giữa chừng sóng quái cứ đến [WIKI Origin "Gameplay"]. Bản đồ cố định mỗi lần (bố cục phòng không đổi, quái vẫn ngẫu nhiên) [WIKI Origin "The Map"].
3. Sóng: mỗi đợt quái xuất hiện ở cổng đỏ ở hành lang giữa Phòng Đá Phép và từng vùng, đi theo đường cố định, lao vào Đá Phép và đánh mọi thứ chặn đường; quái chạm Đá Phép thì chết ngay (cả trùm) và gây sát thương theo máu còn lại của nó; Đá Phép chỉ bị sát thương do va chạm, tối đa 20 máu [WIKI Origin "Magic Stone"; LOC defence/magic_stone_under_attack]. Đối thoại với Đá Phép thì đợt kế đến sau 3 giây, bấm liên tục để bỏ qua chờ [WIKI; LOC defence/magic_stone_talk, tips16]. Đếm ngược mở đầu mỗi đợt 110 giây (đo bằng cách thoát/vào lại ván) [WIKI Origin "Great Wall" mục mẹo].
4. Thắng/thua: thua khi người chơi chết hết lượt hồi sinh VÀ Đá Phép vỡ (do quái hoặc xác Tàu rơi) [WIKI Origin "Gameplay"]; thắng khi đánh bại Tàu Ngoài Hành Tinh ở đợt 12-3, xác tàu vẫn rơi xuống làm vỡ Đá Phép (kết cảnh phim, mảnh Đá Phép tản ra) [WIKI Origin "Story", Carrier].

### Sóng quái [WIKI Origin "Wave Defense"]
- 36 đợt = 12 chặng x 3 đợt: X-1 Nhỏ, X-2 Vừa, X-3 Lớn (3-3, 6-3, 9-3, 12-3 là Đợt BOSS) [LOC defence/small_wave, big_wave, crazy_wave, boss_wave; *_wave_time "{0}s"]. Số tuyến vào: chặng 1-3 một tuyến (Rừng/Băng/Núi Lửa theo cổng), chặng 4-9 hai tuyến, chặng 10-12 ba tuyến.
- Nguồn quái: chặng 1-3 quái của vùng nối với cổng (Rừng, Băng, Núi Lửa); từ chặng 4 quái bất kỳ vùng nào nối được qua cổng đó (ví dụ quái Hang Động ra cổng Băng). Đợt Lớn thêm vài quái Phi Thuyền (rơi Xu Sao 10%).
- Trùm sóng (từ Phi Thuyền, thường bị đột biến, rơi 8 Xu Sao): 3-3 Đĩa Nổi Laser (Floating Laser UFO) từ cổng Rừng; 6-3 Zulan Khổng Lồ từ cổng Băng; 9-3 Thủ Lĩnh Wackern (Varkolyn Leader) từ cổng Núi Lửa; 12-3 Tàu Ngoài Hành Tinh [LOC bossdefence].
- Tàu Ngoài Hành Tinh: ~500.000 máu thân (wiki bản 4.0.2: giảm từ 800.000; trang boss ghi 500.000 thân + 4 x 85.000 ở 4 bộ phận), bất tử cho tới khi phá 4 bộ phận ngoài (2 pháo, 2 khiên/lỗ thông); 4 đòn riêng (9 khi còn pháo); khi nó bay ngang Hậu Điện Quan Tế bắn mỗi phát 1000 sát thương; rơi 15-20 mảnh bản vẽ [WIKI Carrier, SP]. Ở đợt cuối không dịch chuyển được [WIKI Origin].
- Quái đột biến (Mutations, có ở Thần Điện / Mê Trận / Hư Không): Quỷ (-60% sát thương nhận trừ khi dính hiệu ứng), Thần Thánh (-20%, miễn hiệu ứng, miễn chết tức thì), Sức Mạnh (+50% cỡ/ST/máu, -33,33% tốc), Nhanh Nhẹn (-33,33% cỡ/ST/máu, +50% tốc), Phản Xạ (sóng xung kích khi bị đánh), Khiên (chặn đòn tới khi khiên vỡ), Tàng Hình (-50% máu, tháp không thấy), Hút Năng Lượng, Xích Điện (nối tối đa 4 quái, làm chậm), Bắn Bong Bóng (2-4 chùm, 4 ST, Độc), Hút Máu (rút máu tối đa người chơi) [WIKI Enemies "Mutations"; LOC defence/tips7]. Lợi Hại: mọi quái ở cổng đỏ là bản Tinh Anh (Champion) [WIKI Origin].
- Rương xanh sau Đợt Lớn / Đợt BOSS ở Đá Phép: hạt giống, nguyên liệu, vé dùng thử [WIKI Origin]; đánh trùm sóng thì được thêm lượt hồi sinh [LOC defence/tips8].
- Cứ điểm (quái "cấp 1-12" xác định máu và sát thương quái trong phòng) [WIKI Origin "Additional Details"; LOC defence/enter_enemy_node]: bảng 39 phòng (Rừng F0-F3 và F6-F8, Băng G0-G7, Di Tích R0-R5, Hiệp Sĩ K0-K6, Hang C0-C1, Núi Lửa V0 và V3-V7, Phi Thuyền S0-S2) có cột "cấp quái / tổng quái / nội dung" đã được chép đủ ở [WIKI Origin "The Map"]; tạm bỏ cột "tổng quái" khi dựng vì wiki không nêu nó tính tới đâu.

### Tiền tệ và tài nguyên
- Xu Sao (Alien Coin) [LOC defmode_intro_tips_05; defence/not_enough_star_coin]: mua/nâng tháp, sửa tháp (5), mua Cờ Lê (5), sửa máy khai khoáng (15/30/45 ở mỏ F1/G6/V7). Nguồn: quái Phi Thuyền trong phòng 80% (trừ quái do thiết bị triệu hồi), trong sóng 10%; trùm trong phòng (kể cả trùm ẩn); mỗi Thiết Bị Triệu Hồi 30; trùm sóng 8; pháo của Tàu; nhiệm vụ "Đánh bại quái ngoài hành tinh" 100; Bậc Thầy Robot khi được cứu 15. Trung bình ~440 Xu Sao mỗi ván trước đợt cuối [WIKI Origin "Great Wall"].
- EXP: giết quái trong sóng cho EXP chia đều cho mọi tháp; giết quái ở phòng cứ điểm cho EXP người chơi [WIKI ME, Origin]. Hiện "EXP đầy, đến Quan Tế tăng cấp" [LOC defence/full_exp_message].
- Vàng (thường): mua thuốc ở Thương Nhân (HP lớn 25, NL lớn 25, mỗi lần lên cấp giá +10 / +5; Giảm Giá -50%), trả Bậc Thầy Vũ Khí/Thầy Hướng Dẫn; Mỏ Vàng: F1 500-750, G6 4000-6000, V7 5500-8250; "Đào hết mỏ" là thành tích [WIKI Trader, Origin; LOC ac/desc_73].
- Ngọc: thưởng cuối ván (dưới); hồi sinh: 3 lần miễn phí, lần 4 tốn 200 ngọc, sau đó x2 tới 1600 ngọc, tối đa 7 lần [WIKI Origin "Revives"; bản web không có ngọc trả phí: chỉ lấy 3 lượt + thêm lượt khi hạ trùm].

### Hậu Điện và NPC [WIKI Origin; LOC defence/npc_*]
- Quan Tế Thần Điện (Shrine Priestess): tăng cấp nhân vật bằng EXP. Cấp 1-12 cần tổng EXP 250, 500, 1000, 1600, 2400, 3200, 4000, 5000, 6000, 7200, 9600, 11000; mỗi cấp hồi đầy và cộng tối đa +8 HP, +4 giáp, +100 NL, +5 sát thương tay không (cộng dồn: cấp 12 = +96 HP, +48 giáp, +1200 NL, +60) [WIKI SP]. Mỗi cấp chọn 1 trong 3 thiên phú thường tới khi hết ô thiên phú; làm mới bằng ngọc tối đa 2 lần (100, 200) [WIKI SP; LOC defence/choose_buff, refresh_buff]. Quan Tế bắn Tàu 1000 sát thương mỗi phát.
- Bậc Thầy Robot (Mechanical Engineer): bị nhốt ở lồng cứ điểm Băng G0; được cứu cho 15 Xu Sao, về Hậu Điện bán Tháp Phòng Thủ (3 bệ; làm mới 1 Xu Sao); mỗi tháp 15 Xu Sao; mua trùng loại để nâng Phẩm (1-6, trắng..đỏ; 6 bản = 90 Xu Sao); Giảm Giá KHÔNG giảm giá tháp; có 1 Cờ Lê miễn phí [WIKI ME; LOC defence/npc_battery_master*, tips18].
- Thầy Hướng Dẫn (Mentor): bị nhốt ở Rừng F2; được cứu cho thiên phú Mentor (Thầy Hướng Dẫn), bán nâng cấp KỸ NĂNG nhân vật cấp 1-15 bằng vàng: 100, 125, 150, 175, 200, 240, 280, 320, 360, 400, 500, 600, 800, 1000, 1200 (tổng 6450; Giảm Giá -10%) [WIKI Mentor; LOC defence/npc_tutor*, skill_levelup]. Hiệu ứng mỗi cấp theo từng kỹ năng nhân vật đã chép ở [WIKI Mentor] (bảng dài: không sao chép vào mã đợt đầu).
- Bậc Thầy Vũ Khí (Weaponsmith): bị nhốt ở Núi Lửa V5; được cứu cho 1 phụ kiện tương thích; cường hóa vũ khí cầm tay lên +18 bằng vàng, giá và tỉ lệ theo Phẩm × cấp (bảng đủ 7 phẩm x 18 cấp ở [WIKI WS]; ví dụ trắng +1 20 vàng 100%, đỏ +1 40 vàng 90%; sau mỗi lần thành công tỉ lệ -4%, sau mỗi lần thất bại +5% cho lần kế; có thể thêm vũ khí làm nguyên liệu tăng tỉ lệ [LOC defence/tips3]); mốc +15 đỏ là thành tích "Vũ Khí Tối Thượng" [LOC ac/desc_72].
- Thương Nhân (Jolly Trader): xuất hiện sau đợt 1-3; thuốc HP/NL lớn 25 vàng (hồi 50%), Cờ Lê 5 Xu Sao [WIKI Trader].
- Kho (Warehouse) [WIKI WH; LOC defence/storehouse_*]: vũ khí rơi dưới đất sau ~6 giây tự về Kho; "Lấy ra" bất cứ lúc nào; "Đúc lại" 3 vũ khí thành 1 vũ khí ngẫu nhiên: cấp ra = cấp cao nhất đầu vào đến +2 (trần 15): 3 bản cùng vũ khí khác cấp +1 cấp, 3 cấp liền kề +1, 3 cấp bằng nhau +2; phẩm: 3 bản cùng vũ khí giữ nguyên; 3 vũ khí khác nhau cùng phẩm lên 1 phẩm (không tới Magenta); "Đại thành công" mới vượt phẩm đầu vào [LOC defence/great_success]; vũ khí ghép được thì ra vũ khí ghép. Vũ khí khởi đầu, rơi từ trùm, ghép thiếu mảnh không ra qua đúc lại.
- Lò Luyện (weapon_container) [LOC defence/weapon_container, put_weapon_material]: ô nguyên liệu cường hóa ở chỗ Bậc Thầy Vũ Khí.

### Tháp Phòng Thủ [WIKI ME "Defense Towers"; LOC defence/<tên>, tower_mode/*, tower/*]
- Quy tắc chung: tháp không chịu thiên phú; hỏng khi hết máu (máu tháp KHÔNG có số trong nguồn); sau mỗi đợt tháp hồi một phần; sửa 5 Xu Sao hoặc dùng Cờ Lê phá; Cờ Lê còn dùng để nhấc đi đặt chỗ khác; mỗi loại chỉ sở hữu 1 tháp, mua trùng = nâng Phẩm; đặt trên Nền Tháp trống mới chạy [LOC defence/tips5, tips15, tower/*]. Pháp "Giao Ước Hồi Phục" của Quan Tế hồi cho tháp (kỹ năng Giao Ước Hồi Phục của Mục Sư).
- Hai hệ cấp: Phẩm 1-6 (mua trùng) và Sao 0-18 (tăng theo giết quái trong sóng, chia đều giữa các tháp; càng nhiều tháp càng chậm [LOC defence/tips6, tips17]). EXP từng bậc sao (wiki không ghi rõ là từng bậc hay cộng dồn; từng bậc tăng dần đều, tổng 25.649): 25, 73, 169, 289, 361, 481, 721, 865, 1057, 1297, 1513, 1801, 2161, 2377, 2665, 3025, 3241, 3528. Mức tối đa là Phẩm đỏ + 18 sao; tối đa thực tế 5 tháp lên 18 sao trong một ván [WIKI ME, Origin "Great Wall"].
- Sát thương gốc (x1,26^(sao) ở các tháp đánh dấu *; ví dụ 24 x 1,26^18 = 1537,7):
  - Tháp Súng Máy (rage_gun_tower): 2 ST/viên*, 4 cấp tốc độ bắn (thanh vàng đầy thì +1 cấp); Phẩm không đổi gì.
  - Tháp Laser (chain_laser_tower): 21*, chí mạng x2, phản xạ tối đa 4 lần mỗi lần -20%; cần nạp (Chế độ Dị năng rút bớt).
  - Bẫy Gai Nhọn (spike_trap): 8* mỗi gai; 4 gai (thoi), Phẩm +1 thêm lớp gai: 6, 8, 10, 12, 14 gai; kích hoạt trong ô vuông 6x6.
  - Thiết Bị Gió Lốc (hurricane_device): hút vào 10*; đầy Dị năng thì lốc xoáy 50*; Phẩm giảm giãn cách lốc.
  - Máy Điều Khiển Thời Tiết (weather_controller): Sấm 15 (2 tia, mỗi Phẩm +1 tới 7; nối thêm 1..6 mục tiêu +2 ST; không có đích nối thì phản xạ 30) hoặc Lạnh 4* (2 cột băng, +1/Phẩm tới 7; chí mạng đóng băng); đầy Dị năng: mây sấm 2*.
  - Thiết Bị Sinh Hóa (biochemical_device): mỗi 8 giây tạo vũng bán kính 3 ô (+0,5/Phẩm tới 5,5), 6 giây: Độc 4*/0,5s làm chậm hoặc Lửa 6*/0,5s.
  - Căn Cứ Không Quân (airbase): Oanh tạc 4 máy bay (+1 mỗi 2 Phẩm tới 7) thả 1 bom 24* diện rộng; Ngăn cản: bắn hạ đạn địch.
  - Thiết Bị Nạp (energy_device): Năng lượng mỗi 5 giây 1 cầu (+1 cầu/Phẩm tới 6) hồi 8 NL (sao 18: 14); Dị năng cho Thời Tiết / Gió Lốc / Hộ Thuẫn / Laser (5, sao 18: 11).
  - Tháp Hộ Thuẫn (shield_tower): lực trường bán kính 3,5 ô (+0,5/Phẩm tới 6), 50 độ bền (sao tăng), vỡ thì ≥5 giây dựng lại.
  - Trung Tâm Bảo Trì (service_depot): 3 máy bay hồi 1 máu mỗi 2 giây cho người + đồng đội (Phẩm +1/cấp; sao rút giãn cách còn 1 giây ở 18) hoặc cho tháp (Phẩm và sao cộng 1, tối đa 24 ở Phẩm 6 + sao 18). Wiki ghi "đã hỏng từ 4.0.2" nên web có thể bỏ.
  - Ma Trận Khuếch Đại (amplification_matrix): đạn xuyên qua +2 ST, to +20%; Phẩm thêm cỡ đạn và chí mạng.
  - Thiết Bị Lỗ Đen (black_hole_tower) và Máy Khai Khoáng (miner_tower) có trong LOC; chuyển chế độ (tower_mode) bomber/interceptor/poison/fire/psionic/energy/heal/repair/thunder/ice. Wiki bảng tháp KHÔNG liệt kê Lỗ Đen: bỏ.
- Đặt tháp lên Nền Tháp ở Phòng Đá Phép; Máy Khai Khoáng đặt trên Nền Khoáng ở cứ điểm mỏ [LOC defence/miner_tower_message, tower/put_miner].

### Nhiệm vụ (3-6 trong 12 mỗi ván) [WIKI Origin "Quests"; LOC defence/event/*]
- Gom 3 hạt: Tinh Linh Gió (Rừng) +33% tốc chạy; Băng (Băng Nguyên) +5 Phòng Thủ; Lửa (Núi Lửa) +10 sát thương.
- Đánh bại (mở sau khi dọn phòng): Người Thần Bí Khí Tông (sau R5, 11.235 máu; thưởng mở nhân vật Khí Tông + thiên phú Khí Công), Lãnh chúa Hiệp Sĩ (sau K5; rương vàng Kiếm Kỵ Sĩ Lớn +10, hoặc Hắc Kỵ Sĩ Lớn nhỏ xác suất rương +15), Đĩa Nổi Laser hỏng (sau S1; thưởng 100 Xu Sao).
- Bảo vệ vài đợt: Kỵ Sĩ Tập Sự (sau K2; thành đồng hành), bầy côn trùng (sau R2; rương vàng Trượng Anubis +8), Kep Freeman (sau S0; thưởng Floating 51 bền 200, ST 154).
- Hộ tống: Chó Con Taro (sau G5; mở pet Taro, trong ván Taro gây 1000 ST), Đá Lửa (sau V6; Đá Phá Lửa: Đá Phép bị đâm thì nổ lửa 2000 ST toàn vùng, hồi 5-9 phút), Tâm Mạch Khoáng (sau C0; Đá Phép hồi 2 độ bền mỗi 5 giây).

### Thưởng cuối ván [WIKI Origin "Rewards"]
Ngọc = 50 x số đợt đánh lui + floor(Xu Sao còn / 100) + floor(quái giết / 4) + 850 nếu hạ Tàu. Thường: tối đa 3500 (thiên phú Ngọc x1,25, trần 4375). Lợi Hại: tối đa 7500, mặc định có thiên phú Ngọc, x1,75 (Lợi Hại) rồi x1,25. Rương xanh: ngọc, nguyên liệu, hạt giống. Thành tích: 8/16/24 đợt (Trung Thành Hộ Vệ: 3 đá đen/lam/lục + 1000 ngọc; 2000 ngọc + đá cam/tím/đỏ; Bức Tường Cuối + ô vườn + băng Cho Đến Tận Cùng Bình Minh + 5000 ngọc), hạ Tàu (Last Defender: skin Elf), hạ Tàu ở Lợi Hại (5000 ngọc + phiếu), Bức Tường Vĩ Đại (mọi tháp lên Phẩm đỏ và 18 sao), Khí Tông, Taro [CFG achievements 40-42 targetInt 8/16/24, 72-76; LOC ac/*]. XUNG ĐỘT NGUỒN: wiki ghi 16/31/46 đợt cho ba mốc đầu, config 8.6 ghi 8/16/24 (loại điều kiện 36) và LOC vi cũng 8/16/24; chọn 8/16/24 (config mới hơn) và 36 đợt vẫn là tổng đợt của wiki; chưa rõ "đợt đánh lui" ở config đếm từng đợt X-n hay theo cách khác.

### Đã làm đợt 4 (js/defence3.js)
Xem GAPS.md mục Thần Điện: đợt giới thiệu + Robot Tự Nổ, thiên phú Quan Tế, Thầy Hướng Dẫn, Bậc Thầy Vũ Khí, Kho, nhiệm vụ, ngọc thưởng, hồi sinh theo luật gốc, Cờ Lê. Kiểm: test/soulknight-defence.js.

### Thứ đã có ở web dùng lại
- Quái: toàn bộ quái 13 vùng, 35 trùm trong data/sk-bosses86.js (có Đĩa Nổi Laser hp 1000, Di Tích Zulan hp 600, Thủ Lĩnh Wackern hp 800; KHÔNG có Tàu Ngoài Hành Tinh, Zulan Khổng Lồ như Zulan Colossus cần kiểm tên), quái Phi Thuyền e_alien01-03, e_ufo [data/sk-data.js; js/bosses.js]. Quái đột biến: chưa có (GAPS.md đã ghi Quái Gen ở Mê Trận).
- Pháp/đạn: SK.spawnBullet86, SK.hurtEnemy, vfx; pet/lính theo chủ: addWeaponAlly (js/actors.js 743) cho máy bay của Căn Cứ Không Quân/Trung Tâm Bảo Trì; SK.addMercenary dùng được nguyên cho "lính thuê mang vào".
- Chế độ mới theo mẫu matrix.js/void.js: G.mode, hook SK.on('stageEnter'/'runStart'), buildStages trong game.js (bản đồ ghép ải từ STAGES); thẻ chế độ lobby.js MODES (thẻ 'warfront' "Tiền tuyến cổ đại" hiện là chỗ trống; mode_defence.png có sẵn ở art/lobby, chưa nối).
- Thiên phú thường 54, 503 vũ khí, hệ cường hóa/đúc: chưa có Kho/Đúc lại (hall_forge.js có lò rèn ngoài sảnh: cần đọc để xem tái dùng được không).
- Tài nguyên gốc có trong bundle common (chỉ biết tên, chưa trích): modedefence/textures/tower/*, npc/magic_stone_shield.png, event/boss_airbender.png, rgtexture/defence/df_tower*.png, df_enter_gate.png, plot/defence/plot_defence_start|end.jpg, animations/rage_gun_*; narrativedialog/dialogcharacter/defence_* (computer, seller, tower_master, tutor, weapon_master) [LOC/common liệt kê bằng cont.py].
- Chưa có: bản đồ Thần Điện, Đá Phép, Xu Sao, Tháp, Hậu Điện/NPC, Kho, thanh đợt/đếm ngược, Tàu Ngoài Hành Tinh, tuyến đường quái.

### Kế hoạch làm (tệp, dữ liệu, bộ kiểm)
Mức đề xuất: lõi tối thiểu chơi được trước (KHÔNG làm 7 vùng khám phá ngay).
1. tools/defence/build_defence.py (mới): sinh data/sk-defence.js từ localization (khoá defence/*, defmode_*, mode/defence*) + bảng gõ tay có nhãn [WIKI]: TOWERS (12 tháp: số gốc, hệ số 1,26, bảng Phẩm), STAR_EXP[18], PLAYER_EXP[12], WAVES[36] (tuyến, nguồn quái, trùm), SMITH[7][18] {cost, rate}, MENTOR[15], GEMS. Dữ liệu chung dựng qua khoá flock (xem common-rules.md); không sửa tệp extra của agent khác.
2. js/defence.js (mới): G.mode 'defence'; G.def = {wave, stone:20, stoneMax:20, coins, tower:{}, exp, lvl, revive:3, state}. Phòng đá phép là bản đồ cố định đơn giản (một phòng + hành lang 3 hướng + Hậu Điện) dựng bằng SK.world như phòng phụ; SK.on('runStart') khởi tạo; vòng sóng bằng bộ đếm 110 s; quái sinh ở cổng đỏ đi thẳng tới Đá Phép (đường thẳng + tránh vật cản bằng đường đi của world.js).
3. Mức lõi (ván chơi được): chỉ Phòng Đá Phép + Hậu Điện; 3 NPC coi như đã được cứu; Xu Sao nhận từ quái trong sóng (10%) + thiết lập 15 ban đầu; 6 tháp trước (Súng Máy, Laser, Bẫy Gai, Gió Lốc, Hộ Thuẫn, Sinh Hóa); Quan Tế + Đá Phép + sóng 1-1..12-3; Tàu Ngoài Hành Tinh bản đơn giản (thân + 4 bộ phận). Mức 2: Kho/Đúc lại, Bậc Thầy Vũ Khí, Mentor, tháp còn lại, Thương Nhân. Mức 3: khám phá 7 vùng, cứ điểm, nhiệm vụ, đột biến, Lợi Hại.
4. js/design.js: DS.defence = {stone:20, waveWait:110, towerCost:15, repair:5, wrench:5, refresh:1, freeRevive:3, starBase:1.26, gems:{perWave:50, perCoins:100, perKills:4, boss:850, capNormal:3500, capBad:7500}}; game.js: nhánh G.mode 'defence' trong startRun/buildStages (nhánh bản đồ riêng, không dùng STAGES); lobby.js: thẻ mới (hoặc nối lại thẻ warfront) với mode_defence.png. Thẻ script ?v= của tệp mới ghi theo brief riêng.
5. Bộ kiểm test/soulknight-defence.js (Playwright), số cụ thể:
   - Vào chế độ: G.mode 'defence', stone 20/20, 36 đợt đã khai báo (12 chặng x 3), tên đợt X-1/X-2/X-3 đúng, 3-3/6-3/9-3/12-3 là BOSS.
   - Đá Phép: quái 100 máu còn nguyên chạm vào thì chết và trừ đúng bằng hàm theo máu còn lại (hàm tạm [ƯỚC LƯỢNG], ghi); 20 quái nhỏ liên tiếp làm vỡ Đá Phép thì ván thua; đạn trúng Đá Phép không trừ máu.
   - Đối thoại Đá Phép: đợt kế sinh trong <= 3 s.
   - Xu Sao: mua tháp 15, sửa 5, Cờ Lê 5, làm mới 1; Giảm Giá không đổi giá tháp; mua trùng 6 lần cùng tháp lên Phẩm 6 và tốn đúng 90.
   - Sao tháp: bảng STAR_EXP 18 phần tử bằng wiki; 2 tháp chia đều EXP; 24 x 1,26^18 làm tròn = 1538 (độ lệch <= 1).
   - Tháp: Súng Máy 2 ST/viên; Laser 21 chạm quái đầu, phản xạ tối đa 4 lần, mỗi lần -20% (21, 16,8, 13,44...); Bẫy Gai 4 gai ở Phẩm 1, 14 gai ở Phẩm 6; Hộ Thuẫn chặn 50 ST đạn rồi vỡ, dựng lại sau >= 5 s.
   - Quan Tế: đủ EXP 250 thì lên cấp 1 (+8 HP, +4 giáp, +100 NL), 11000 là cấp 12 (+96/+48/+1200); thiếu EXP bị từ chối.
   - Mentor 15 cấp có tổng 6450 vàng (Giảm Giá 5804); Bậc Thầy Vũ Khí đỏ +1 giá 40 tỉ lệ 90%, sau thành công +1 tỉ lệ -4%.
   - Kho: vũ khí rơi sau 6 s ở Kho; Đúc lại 3 vũ khí cùng cấp ra cấp +2, cùng 3 bản cùng vũ khí ra cùng vũ khí cấp +1 (trần 15).
   - Tàu: 4 bộ phận x 85.000 máu; chưa phá hết thì thân miễn sát thương; phá hết rồi hạ thân thì thắng (xác tàu vẫn làm vỡ Đá Phép).
   - Thưởng: ví dụ 36 đợt, 300 Xu Sao còn, 400 quái, hạ Tàu = 50 x 36 + 3 + 100 + 850 = 2753 ngọc (thường), x1,25 nếu thiên phú Ngọc = 3441.

### Nguồn không có (không đoán trong mã; chốt bằng clip)
- Máu từng tháp, hệ số hồi sau đợt, cooldown, tầm đánh từng tháp (nhiều tháp chỉ có "bán kính" một phần); giá và công thức "EXP chia đều" khi có >5 tháp.
- Số quái và thành phần quái từng đợt X-n, máu quái theo "cấp quái 1-12", tuyến đường chi tiết; công thức sát thương Đá Phép nhận theo máu còn lại của quái (wiki chỉ cho ví dụ định tính); xác suất đột biến mỗi quái.
- Số máu/ST của Robot Tự Nổ đợt mở đầu; số liệu đòn Tàu (9 đòn); EXP người chơi mỗi quái.
- Lý do config thành tích ghi 8/16/24 mà wiki 16/31/46 (xem Thưởng).
- Loại tháp trong LOC mà wiki không ghi: Lỗ Đen (black_hole_tower), Máy tính (defence/computer).

## 2g. Chỉ Huy Nhỏ (Little Commander, Mode/Troop, season/Troop)

Nhãn thêm: [WIKI LC] = trang Little_Commander (bản chính, đầy đủ), [WIKI GC] = Great_Commander, [WIKI Whistle]. Lưu ý tên: LOC có HAI mùa "quân đoàn": `troop/*`, `season/Troop`, `weapon/troop/*`, `Object_hostess_troop` = Chỉ Huy Nhỏ (người chơi điều khiển pet, thuê lính, đánh Chế độ Ải bình thường) [WIKI LC]; còn `Troop2/*`, `troop2/*`, `I_season_Troop2` = Đại Đại Chỉ Huy (Great Commander, đạo diễn Tiêu Đen, diễn viên tự đánh, 15 vòng) [WIKI GC]. MODES.md mục 1 dòng "Mode/Troop" gộp hai (mô tả "Chiêu mộ diễn viên..." là của Troop2/guidance). Config: map_troop_base (RGPrefab/MapManager/map_troop_base.prefab) cho Chỉ Huy Nhỏ; map_troop2 (ModeSeason/Troop2/Prefabs) và 10 mục items.feature_season_troop2_* cho Đại Đại Chỉ Huy; random_objects.bar_troop_drinks / chest_troop / shop_troop / troop_statue (chỉ có trọng số, gameObject rỗng), items.weapon_troop_*, trash_can_troop.prefab (common), seasonguideview_troop.prefab (common) [CFG; ĐO 2026-10-10]. Config không có bảng lính (số liệu lính, giá flag trong Lua/prefab); common có data/troop_general_info.asset chưa giải mã. Tất cả số dưới là từ wiki, wiki ghi mùa này chạy "season, không phải mode": "Mùa giải đã kết thúc" [LOC; WIKI LC "Trivia" 3.2.0].

### Là gì
Mùa giải: người chơi điều khiển một pet (chọn ở Phòng Khách) thay vì anh hùng, thuê tối đa 6 lính thuê (chính là các anh hùng) và đánh Chế độ Ải thường như mọi ván, 3 tầng x 5 ải, mục tiêu nhận 3 cúp Đồng / Bạc / Vàng [WIKI LC; LOC season/Troop_Bronze|Silver|Gold]. Vào qua Dẫn Đường Mùa Giải ("Đổi sang Chỉ Huy Nhỏ?" [LOC I_hostess_troop_talk1]). Cúp Vàng cần thắng ở Lợi Hại; phần thưởng cúp Vàng: pet Officer Chilly + bản vẽ Mini Knight Figure [WIKI LC "Rewards"].

### Vòng chơi
1. Phòng đầu (căn cứ): cờ, rương và quầy; hai quầy là khu mua sắm bằng Xu Mèo (Pet Coin). Chỉ chỉnh được ở phòng đầu ([LOC troop/need_start_room "Cần ở phòng ban đầu"]).
2. Dọn ải, nhặt Xu Mèo, quay lại phòng đầu mỗi tầng/ải để thuê, nâng cờ, nâng rương, uống, đổi; vào cổng thì lính còn sống hồi đầy máu giáp và hồi sinh lính chết [WIKI LC "Properties"].
3. Thắng: qua ải 3-5 (Chế độ Ải; Lợi Hại cho Vàng). Thua: pet không nhận sát thương khi điều khiển [WIKI LC "Basic Properties"], nên ván thua khi TẤT CẢ lính chết ("Diệt hết" [LOC troop/game_over]; suy ra, wiki không nói rõ điều kiện thua).

### Pet và kỹ năng pet [WIKI LC]
- 3 HP, 1 giáp, 160 NL; không bị thương nhưng vẫn dính hiệu ứng xấu; đòn đánh duy nhất là cắn tầm ngắn 5 sát thương cơ bản; 5 ô vũ khí; Còi (Whistle) đầu tiên không chiếm ô. Thức uống/tượng mang vào chỉ áp cho pet; thiên phú/vườn của anh hùng khởi đầu vẫn áp cho lính.
- Dùng được: Bình Hồi Phục HP/NL/Hồi Phục/Sức Mạnh (hồi cho MỌI lính sống, x10 lượng hồi, không tràn), Pill, Happy New Year, Thẻ Cào, Kèn, Bayonet in a Gourd, Khiên (chỉ khi đổi vũ khí), vũ khí drone, đòn nút phụ.
- Bốn kỹ năng pet đổi bằng nút kỹ năng, đánh bằng nút tấn công; mỗi kỹ năng có hồi chiêu (kéo dài thêm nếu dùng trong trận); số trong ngoặc là NL: Pha Lê Đóng Băng (50: 8 vệt băng quanh người 1 s, 3 ST + đóng băng, phá đạn địch), Túi Chữa Trị (60: mọi lính +10 HP +5 giáp, cả đồng hành), Máy Tạo Lực Trường (70: lục giác chắn đạn 4 s, to gấp 2 Khiên), Máy Hồi Sức Tim Phổi (100: hồi sinh 1 lính đã gục, đầy HP và giáp, niệm 1 s, dùng được lúc đánh) [LOC weapon/troop/ice|heal|shield|reborn, troop/revive].
- Còi: bấm đổi giữa "Tập hợp" (lính ưu tiên theo pet) và "Hành động" (tự hành động) [WIKI Whistle; LOC weapon/weapon_troop_whistle].

### Xu Mèo và quầy mua [WIKI LC; LOC season/lc_txt*]
- Nguồn Xu Mèo: rương ở phòng đầu (2 xu, nâng lên sẽ cao hơn), rương xám sau dọn phòng 1 xu (phòng Tinh Anh không có rương xám nên không xu), phá Mỏ Vàng/Mỏ Pha Lê 1 xu (Tinh Anh 2), hạ trùm 3 xu. Giá KHÔNG chịu Giảm Giá.
- Cờ (Flag) [LOC troop/flag_*]: số lính tối đa và số lính chờ: cấp 1 (2 / 2, miễn phí), cấp 2 (3 / 3, 1 xu), cấp 3 (4 / 3, 3 xu), cấp 4 (5 / 4, 5 xu), cấp 5 (6 / 5, 7 xu). Thuê 1 lính 4 xu, lính đầu miễn phí. Nâng cờ thì ô trống được lấp lính mới, lính chết dịch chuyển về phòng đầu.
- Thầy Huấn Luyện (Drillmaster): làm mới hàng lính chờ 1 xu [LOC season/lc_txt11, troop/talk_mercenary_refresh].
- Rương + Mèo May Mắn (Lucky Cat) nâng rương [LOC troop/cat_talk]: trắng 2 xu, nâu 3 (nâng 3 xu), lam 4 (6), vàng 5 (9); mỗi rương mở một lần; vũ khí đầu tiên luôn là Còi; lãi ròng mỗi tầng wiki cho bảng 1-1..3-5 (nâu 1-1 +11 giảm dần 1 xu mỗi ải tới -3 ở 3-5; lam +8 .. -6; vàng +5 .. -9): mỗi nâng cấp thu về xu của ải sau trừ giá nâng.
- Quầy rượu (Bar) [CFG random_objects.bar_troop_drinks; LOC troop/talk_commodity_refresh]: Phục vụ làm mới hàng 1 xu; giá: thiên phú 3 (không trùng đã có), thức uống 2 (Rượu +10 HP, Nước Dừa +4 giáp, Sữa +1 Phòng Thủ, Bloody Mary +8 chí mạng, Cà Phê +10% công tốc, Soda -10% hồi chiêu kỹ năng; mỗi ly chỉ cho 1 lính), vũ khí ngẫu nhiên 0/1/2/3 theo Thường/Hiếm/Rất Hiếm-Hiếm/Sử Thi (không ra Huyền Thoại), "Tư Chất Lính Thuê" 1 (tăng giới hạn phẩm vũ khí lính [LOC weapon_troop_book]), Mực Xào 0 (sa thải lính: mất vũ khí, rơi lại, mất nâng cấp uống; không dùng được nếu chỉ còn 1 lính). Thùng rác bên cạnh bỏ vật vô dụng.
- Khác Chế độ Ải thường [WIKI LC "Gameplay"]: cửa hàng thường luôn có 1 bình HP và 5 vũ khí (trả vàng, bình cho lính x10 hồi); rương chỉ là rương lớn (2 vũ khí, 3 nếu Tinh Anh); tượng nhặt được tháo khỏi bệ (trả vàng) thành vật cho 1 lính, kích hoạt khi lính đó dùng kỹ năng; Phục vụ ở phòng thưởng bán thức uống 30 vàng ("Tư Chất" 15); Máy Nước hồi cho lính x10.

### Lính thuê (anh hùng) [WIKI LC "Mercenaries"]
- 17 anh hùng: Kỵ Sĩ, Du Hiệp (Rogue), Pháp Sư, Sát Thủ, Nhà Giả Kim, Kỹ Sư, Ma Cà Rồng, Hiệp Sĩ Thánh (Paladin), Tiên Nữ (Elf), Người Sói, Linh Mục, Đạo Sĩ Tự Nhiên (Druid), Robot, Cuồng Chiến, Thuật Sĩ Tử Thần (Necromancer), Cảnh Sát (Officer), Đạo Sĩ (Taoist).
- Chỉ số (HP/giáp/chí mạng, ngoặc là bản nâng): Kỵ Sĩ 60(120)/8(16)/5(10), Rogue 60(120)/6(12)/10(20), Pháp Sư 40(80)/12(24)/0, Sát Thủ 60(120)/8(16)/10(20), Giả Kim 50(100)/7(14)/5(10), Kỹ Sư 50(100)/10(20)/5(10), Ma Cà Rồng 50(100)/5(10)/5(10), Paladin 45(90)/20(40)/0 (Phòng Thủ 1 -> 2), Elf 50(100)/6(12)/10(20), Người Sói 80(160)/1(2)/5(10), Linh Mục 40(80)/7(14)/0, Druid 60(120)/5(10)/0, Robot 50(100)/11(22)/0, Cuồng Chiến 80(160)/3(6)/5(10), Necromancer 40(80)/11(22)/0, Officer 60(120)/6(12)/10(20), Taoist 50(100)/7(14)/0. Phòng Thủ cơ bản 0 (bản nâng 1) trừ Paladin. Tốc bắn 100. Hồi chiêu: 10, 7, 4,5 (nâng 8,0), 30, 10, 12, 15, 16, 15, 18, 18, ∞ (Druid), 10, 15, 5, 13, 8 (nâng 14) giây theo thứ tự trên. Mỗi anh hùng ưa một số loại vũ khí (ví dụ Paladin: kiếm, rìu, giáo, MISC; Robot: laser liên tục/tia đơn/Railgun).
- Kỹ năng (bản thường / bản nâng): Kỵ Sĩ chép vũ khí tạm / + Chaotic Strike; Rogue Iaido 5 lần / 10; Pháp Sư sét gây choáng / + 3 cầu lửa; Sát Thủ phân thân / 2 phân thân máu hơn; Giả Kim 3 chai độc / 3 chai nguyên tố 2 lần; Kỹ Sư tháp súng +10 máu / tháp chặn đạn +15 máu, 8 ST; Ma Cà Rồng 1 lỗ đen hút máu / 3 lỗ; Paladin hồi giáp + khiên 2 s / 4 s; Elf lục giác +25 chí mạng 5 s / 10 s; Người Sói điên cuồng hồi 10 / 20 + Phòng Thủ +2, bắn lửa; Linh Mục hồi 11 + tăng công tốc / 22 + Phòng Thủ + hồi giáp; Druid 2 sói (+10 máu) / + gấu (sói +25, gấu +50); Robot 4 drone 8 s / 6 drone 16 s; Cuồng Chiến cho Weapon Boost 5 s / 10 s; Necromancer hồi sinh quái làm đồng minh 15 s / 30 s; Officer không kích / 2 không kích + vũng lửa; Taoist kiếm bay chặn đạn / + Bát Quái chắn đạn.
- Quy tắc: nhân vật chọn ở Phòng Khách là lính đầu tiên (mang theo thiên phú thưởng); tối đa 2 lính cùng loại, thuê lính thứ 3 thì hợp nhất: rơi hết vũ khí, nhận vũ khí khởi đầu nâng cấp, đổi sang bản nâng (HP/giáp gấp đôi, chỉ bản thường mới hợp nhất; giữ nguyên nâng cấp uống). Phẩm vũ khí tối đa mặc định xanh lam (Normal và Lợi Hại), nâng bằng hợp nhất / thiên phú pet / "Tư Chất Lính Thuê" [LOC weapon/desc/weapon_troop_book]; giới hạn hiện ở vòng màu dưới chân lính [LOC troop/low_level, max_level, weapon_unfit]. Pet đưa vũ khí cho lính (đổi vũ khí đang cầm) [LOC troop/give_weapon].
- Trong trận lính KHÔNG hồi giáp; hồi giáp khi dọn phòng, hồi sinh, Túi Chữa Trị, kỹ năng Paladin. Lính chết chỉ hồi sinh nếu dọn phòng hoặc Máy Hồi Sức (hồi 1/10 máu tối đa); qua cổng thì hồi đầy và hồi sinh tất cả.
- Quái hung hãn hơn: thời gian hiệu ứng xấu -50%, tốc bắn và máu quái tăng nhiều (không có số; không cộng dồn với Lợi Hại). Phòng ít hơn: đường ngắn nhất x-1 và x-2 chỉ 1 phòng, từ x-3 là 2 phòng (Mở Rộng Nhà Ngục: tới 3 và 4) [WIKI LC "Gameplay"].

### Mục tiêu cúp [WIKI LC "Objectives"; LOC season/troop/*]
Đồng: 3 lính giống nhau khi làm mới; sa thải 1 lính bằng Mực Xào; từng thuê đủ 17 loại; đưa Vũ Khí Đỏ cho 1 lính. Bạc: từng thắng với mỗi lính; mở mọi bản nâng; cho 1 lính uống >= 10 ly. Vàng: thắng Lợi Hại với mỗi bản nâng; thắng 1 ván chỉ thuê 1 loại.

### Thứ đã có ở web dùng lại
- Lính theo chủ có HP/giáp, nhận đạn, chết/hồi sinh: addWeaponAlly + SK.addMercenary (js/actors.js 743-870; 13 lính "npc_01..13" của Phòng Lính Thuê, data/sk-mercs.js, hpBonus, stageEnter hồi đầy). Chưa có: lính là anh hùng; chỉ số lính theo bảng trên; kỹ năng anh hùng dùng bởi AI (js/skills/* gắn với người chơi).
- Pet: js/pets.js + js/pets/*.js (pet theo chủ, có thiết lập G.mods.noPet "Dũng Sĩ Cô Độc"), sk-pets.js; chưa có chế độ người chơi LÀ pet (hình nhân vật và hoạt ảnh).
- Anh hùng/kỹ năng: 20+ nhân vật, js/skills/*, sk-skills86.js, buff thiên phú, 503 vũ khí, thức uống (hall); Chế độ Ải phòng ít hơn: STAGES/buildStages (game.js).
- Chưa có: Xu Mèo, quầy/cờ/rương/mèo may mắn, Thầy Huấn Luyện, Phục Vụ trong phòng đầu, thẻ ở sảnh (thẻ 'season' hiện là Monkia; cần thẻ mới hoặc nhánh trong season).

### Kế hoạch làm (tệp, dữ liệu, bộ kiểm)
Mức đề xuất: lõi tối thiểu chơi được = pet + cờ + thuê lính + lính đánh + rương/xu; kỹ năng lính và quầy rượu sau.
1. tools/troop/build_troop.py (mới): sinh data/sk-troop.js từ localization (troop/*, season/Troop*, season/lc_txt*, weapon/troop/*) + bảng wiki gõ tay có nhãn: HEROES[17] {hp, armor, def, crit, cd, kinds, skill, upgraded}, FLAG[5] {max, stock, cost}, CHEST[4] {coins, cost}, BAR {buff 3, drink 2, weapon [0,1,2,2,3], book 1, squid 0, refresh 1}.
2. js/troop.js (mới): G.mode 'troop' (sau `level`, dùng nguyên buildStages 15 ải); G.troop = {coins, flag:1, chest:0, mercs:[], petSkill:0}; người chơi = pet (HP 3, giáp 1, NL 160, cắn 5, miễn sát thương; bản web dùng hình pet chọn, hoạt ảnh từ pets); lính = addWeaponAlly mở rộng với bảng HEROES (HP/giáp/chí mạng/tốc), AI đánh từng đợt như SK.addMercenary; hợp nhất khi lần thuê thứ 3; "Tập hợp/Hành động" qua Còi.
3. Phòng đầu: dựng phòng cố định (cờ, rương, mèo, quầy rượu, thùng rác, Thầy Huấn Luyện) giống cách rooms.js dựng phòng phụ; giá/xu theo DS.troop.
4. js/design.js: DS.troop = {petHp:3, petArmor:1, petEnergy:160, petBite:5, hire:4, firstFree:true, refresh:1, flag:[{max:2,stock:2,cost:0},{3,3,1},{4,3,3},{5,4,5},{6,5,7}], chest:[2,3,4,5] cost:[0,3,6,9], coins:{start:2, grey:1, mine:1, mineElite:2, boss:3}, reviveHp:0.1, healMul:10, mergeAt:3, sameMax:2}. game.js: G.mode 'troop' (hiện chỉ nhận bossrush/matrix/void/level); lobby.js: thẻ mới (hoặc mục trong Mùa Giải).
5. Bộ kiểm test/soulknight-troop.js (Playwright), số cụ thể:
   - Vào chế độ: pet HP 3, giáp 1, NL 160; 5 ô vũ khí; vũ khí đầu rương 1-1 là Còi và không chiếm ô; pet bị đạn đánh không mất máu.
   - Thuê: lính đầu 0 xu, lính sau 4; xu không đủ thì từ chối ("Lính Thuê đã đạt tối đa" khi vượt cờ); cờ cấp 1..5 cho 2/3/4/5/6 chỗ, 2/3/3/4/5 chờ, chi phí 0/1/3/5/7; tổng nâng tới cấp 5 = 16 xu.
   - Làm mới 1 xu; Mực Xào 0 xu và bị chặn khi còn 1 lính.
   - Hợp nhất: thuê 2 cùng loại thì ổn; lần thứ 3 thì còn 2 lính, lính bản nâng có HP gấp đôi (ví dụ Kỵ Sĩ 60 -> 120) và vũ khí cũ rơi.
   - Rương: trắng 2 xu, nâng nâu/lam/vàng tốn 3/6/9 và ra 3/4/5 xu; mở rồi nâng không nạp lại.
   - Xu thưởng: dọn phòng thường 1, mỏ 1 (Tinh Anh 2), trùm 3.
   - Lính: chết thì chỉ hồi sinh bằng Máy Hồi Sức (1 s, 1/10 HP) hoặc khi dọn phòng; qua cổng hồi đầy và hồi sinh tất cả; Túi Chữa Trị +10 HP +5 giáp cho mọi lính; bình HP hồi x10.
   - Phẩm vũ khí lính tối đa lam mặc định; đưa vũ khí vượt phẩm bị từ chối ("không thể trang bị").
   - Thắng: 3-5 xong thì "victory"; thua khi mọi lính chết ("Diệt hết").
   - Cúp Đồng: ba lính giống nhau sau làm mới đếm; mục tiêu Mực Xào đếm.

### Đại Đại Chỉ Huy (Troop2, Great Commander): KHÔNG đề xuất làm
Wiki ghi hiện "không còn", đã thay bằng Thần Khí Lục Địa Cổ [WIKI GC]. Tóm: đạo diễn Tiêu Đen (pet), 5 độ khó, mỗi độ 15 vòng, bắt đầu 8 điểm nổi tiếng + 100 NL (mỗi cầu NL +10); thua trận (hết giờ hoặc diễn viên chết hết) -1 nổi tiếng, 0 thì hết; vàng cuối vòng 4, 5, 6, 7, 10, 10 ... (độ 1) ; kỹ năng chỉ huy mua bằng Xu Mùa Giải 2000 (Túi Chữa Trị 80 NL +30% HP; Adrenalin 40 NL +30% công tốc 3 s; Đại Lực 40 NL +30% công 3 s; Pha Lê 60; Lì Xì 100 NL 1-4 vàng; Máy Tạo Giáp 60) [WIKI GC; LOC Troop2/mercenaries/skill_*]. Chợ 4 ô: giá phẩm trắng 1, lục 2, lam 3, tím 4, cam 5; nâng chợ tối đa 6 cấp (mỗi cấp +1 diễn viên ra trận, tối đa 6); gộp 3 diễn viên 1 sao lên 2 sao, 3 sao; 4-11 liên kết (Quần Hùng Trục Lộc, Quái Tiên, Văn Minh, Thần Thoại, Tinh Thông...) [LOC troop2/trait_*]. Đây là một trò đánh tự động hoàn toàn khác; không tái dùng được gì của web (không có diễn viên/chợ) và số liệu quan trọng (bảng diễn viên, liên kết, thang giá chợ) nằm trong Template wiki (GC_Performers...), chưa lấy: tách việc riêng nếu cần.

### Nguồn không có (không đoán trong mã; chốt bằng clip)
- Mọi số chỉ số lính ở tầng khác hơn trong bảng wiki (sát thương kỹ năng từng anh hùng, AI "đánh từng đợt"): wiki chỉ cho HP/giáp/Phòng Thủ/chí mạng/hồi chiêu; sát thương và tầm của kỹ năng không có số.
- Hệ số "máu quái tăng nhiều / tốc bắn tăng" của Chỉ Huy Nhỏ; cấu trúc phòng "ít hơn" (số phòng đã có nhưng bố cục không).
- Xu rương xám / mỏ có đổi theo Lợi Hại hay không; "Tư Chất Lính Thuê" tăng phẩm tối đa lên mức nào.
- Điều kiện mở (LOC không có chuỗi mở khoá Chỉ Huy Nhỏ): "Gold Trophy yêu cầu" chỉ nói ở mục Rewards.

## 3. Điểm cần xác minh thêm (nguồn không có)
- Hệ số HP/ST/tốc độ/mật độ/Tinh Anh chính xác của Lợi Hại; số trận và hồi máu của Khu Thí Luyện; số Lông Vũ/lượt/ngày; thưởng Nhân Tố; id số factor (105/1003/1010) -> tên. Cách lấy: clip gameplay (skill watch-game-clips) hoặc giải mã bảng cấu hình còn lại (ngoài 17 bảng; luban_config trong bundle config/luban_config).
