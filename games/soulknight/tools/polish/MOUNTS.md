# MOUNTS: thú cưỡi và lính thuê Soul Knight 8.6 → đặc tả cho bản web

Nhãn nguồn: [CFG bảng] = `~/sk86-ref/decoded/config/*.json`; [PF bundle:đường dẫn] = thành phần MonoBehaviour đọc từ prefab (máy đọc, `max_hp`, `defence`, `speedRate`, `itemValue`, `damage`); [LOC khoá] = `localization_en_vi.json`; [WIKI trang] = soul-knight.fandom.com qua API; [WEB tệp] = hiện trạng bản web. Không có nhãn = suy ra, ghi "(suy ra)".
Quy ước: HP/giáp trong bảng là số của prefab (đơn vị "tim" của cơ giáp, không phải máu người chơi). `speedRate` là hệ số tốc độ cộng thêm (0,2 = +20%). Mọi số [PF] khớp wiki ở HP/giáp/tốc, trừ chỗ ghi lệch.

## 0. Phát hiện gốc: "31 thú cưỡi" của mounts.json không phải 31 con khác nhau

`mounts.json` có 31 khoá, đều trỏ bundle `mount/*` [CFG mounts]. Thực tế:
- 25 khoá là **Gấu Khổng Lồ** (`mbear`, `mbear_s1`...`mbear_s29`, thiếu số 3, 21, 23, 25, 28): đây là con triệu hồi của kỹ năng 2 Druid "Fuzzy Bear / Triệu hồi Gấu Khổng Lồ" [LOC Character11_skill_2_name; CFG skills c11/skill 2] chứ không phải thú cưỡi mua được; `_sN` là skin theo skin nhân vật (cùng bộ `pet/vine_sN`). Chỉ số giống hệt nhau: 30 máu, `camp 1`, `damage 12`, đòn chí mạng ×2, hồi đánh 2,5 s, `itemValue 30` [PF mount/bear:assets/mount/bear/mbear.prefab, mount/bear_s1].
- 6 khoá là thú cưỡi thật dạng sinh vật: `mboar`, `mboar2`, `mcristal`, `mcristal_gold`, `mspider`, `mvaken`.
- Thú cưỡi sinh vật còn lại và toàn bộ cơ giáp nằm trong bundle `common` (`rgprefab/mount/*`), không có trong `mounts.json`. Tổng tìm được: **6 sinh vật (mounts.json) + 5 sinh vật (common: ngựa, khỉ, bọ hung, Bazinga, + Bóng Xám/Mạnh Hoạch/Voi Nam Man/Trảo Hoàng Phi Điện của mùa Tam Quốc) + 13 cơ giáp + 3 đặc biệt + 25 gấu**. Chi tiết ở bảng dưới.

## 1. Bảng thú cưỡi

### 1a. Thú cưỡi sinh vật (thanh máu đỏ). Mua ở Thương Nhân Thú Cưỡi, lồng nhốt, hoặc phần thưởng

Cột giá: `itemValue` là trường thật của prefab nhưng **chưa chứng minh là giá bán** (xem mục 5). Wiki nói giá tối thiểu thú cưỡi 15 vàng, cơ giáp 30 [WIKI Mount_Merchant].

| id | Tên Anh / Việt | Prefab | HP | Giáp | Tốc | Vũ khí gắn / kỹ năng | Nguồn nhận |
|---|---|---|---|---|---|---|---|
| mboar | Boar / Heo Rừng [LOC mboar] | có (mount/boar) | 10 | 0 | +20% | không vũ khí gắn; cưỡi dùng vũ khí người chơi tự do [PF mboar: itemValue 15] | thương nhân thú cưỡi (không điều kiện), lồng nhốt [CFG npc_mount_creature, cage_mount] |
| mboar2 | Dire Boar / Heo Rừng Nổi Giận | có | 14 | 0 | +20% | Va Đập (`weapon/mboard2`): damage 4, lùi 6, tiêu hao 1 [PF mboar2] | như trên, cần mở khoá `mboar2` |
| mcristal | Crystal Beetle / Sâu Pha Lê | có | 12 | 0 | +10% | Gai Băng (`weapon/mcrystal`): damage 3, chí mạng 50, tiêu hao 5, đạn tốc 20 [PF mcristal] | thương nhân/lồng; mở khoá `mcristal` |
| mcristal_gold | Crystal Beetle vàng (không có tên LOC riêng) | có (mount/mcristalgold) | 12 | 0 | +10% | giống mcristal | không có nguồn trong npc/cage; thuộc khoá `mcristal` (biến thể) |
| mspider | Spider / Nhện | có | 12 | 0 | +10% | Nổ Tung (`weapon/mspider`): damage 10, tiêu hao 3 [PF mspider] | thương nhân/lồng; mở khoá `mspider` |
| mvaken | Varkolyn / Wackern | có | 16 | 0 | +10% | Kim Độc (`weapon/mvaken`): bắn damage 1, chí mạng 50, lệch 25 [PF mvaken, vũ khí tên e_worm01] | thương nhân/lồng; mở khoá `mvaken` |
| mhorse | White Dragon Horse (Ngựa Bạch Long, tên Việt chưa tra) | có (common) | 10 | 0 | +20% | không [PF mhorse] | thương nhân thú cưỡi, lồng nhốt [CFG] |
| micemonkey | Gentle Snow Ape (Khỉ Tuyết; wiki; LOC không có) | có | 20 | 0 | +20% | `explode` damage 5, `ball` damage 12 (bọ hung/khỉ dùng chung bộ) [PF] | thương nhân thú cưỡi [CFG: RGPrefab/Mount/mIceMonkey] |
| mdungbeetle | Stubborn Dung Beetle (Bọ Hung Cứng Đầu) | có | 20 | 0 | +20% | như khỉ tuyết | thương nhân thú cưỡi |
| m_morph | Bazinga | có | 8 | 0 | +10% | `collider` damage 6 (húc) [PF] | thương nhân thú cưỡi; còn câu cá hạng A [WIKI Mounts] |
| cg_mount1 | Yellow Lightning / Trảo Hoàng Phi Điện [LOC mount/ZhuaHuangFeiDian] | có (modeseason/combogun) | 18 | 1 | +30 (wiki) | kỹ năng: hóa Cầu Điện lao tới phóng Xích Điện; trait: đánh có tỉ lệ kích Xích Điện | mùa Tam Quốc (Combogun), rèn ở Bàn Robot |
| cg_mount2 | Meng Huo / Mạnh Hoạch | có | 12 | 0 | +20 (wiki) | kỹ năng: gầm đánh bay và làm chậm (bản nâng cấp thêm choáng); cầm súng tăng di tốc | như trên |
| cg_mount3 | Barbaric Elephant / Voi Nam Man | có | 15 | 0 | +15 (wiki) | giẫm đất phát sóng xung kích; miễn đẩy lùi | như trên |
| cg_mount4 | Gray Shadow / Bóng Xám | có | 8 | 0 | +20 (wiki) | kỹ năng: tàng hình | như trên |
| cg_mount0 | Red Hare / Ngựa Xích Thố [LOC mount/ChiTu] | có | (wiki không có trang) | | | xung phong, gây cháy; nhảy xuống thì húc dọc đường | như trên |
| mbear + 24 skin | Fuzzy Bear / Gấu Khổng Lồ | có (25 bundle) | 30 | 0 | +20% | camp 1, damage 12, chí mạng ×2, hồi đánh 2,5 s, bay theo chủ [PF] | chỉ do kỹ năng Druid triệu hồi, không bán |

Chỉ số cg_mount* [WIKI từng trang] (tốc trong wiki ghi "15/20/30", đơn vị không rõ). Prefab Combogun chưa đọc HP (chỉ có controller + prefab) nên HP lấy từ wiki.

### 1b. Cơ giáp (thanh máu xanh). Mua ở Thương Nhân Vật Chở, mở bằng bản vẽ

HP/giáp/tốc/damage từ [PF common:rgprefab/mount/*] đối chiếu [WIKI từng trang]. `giáp` = `defence` (giảm sát thương mỗi đòn). Thứ tự khoá trong `npc_mount_mech` kèm trọng số [CFG npc_mount_mech].

| id | Tên (Anh / Việt [LOC]) | HP | Giáp | Tốc | Vũ khí [PF damage; tiêu hao] | Trọng số ở thương nhân | Điều kiện hiện |
|---|---|---|---|---|---|---|---|
| m_mech_0 | Prototype Armor / Thiết Giáp Nguyên Mẫu | 7 | 1 | -20% | Pháo Thần Lửa (đạn 3, xuyên 10) + `m_mech_0_2` Tạm Biệt Thế Giới (nổ 50); [LOC weapon/m_mech_0_1,_2] | 6 | luôn |
| m_mech_1 | Iron Fist / Chưởng Thép | 10 (wiki 10, nâng cấp 12) | 1 | -20% | Cánh Tay Robot-Chưởng (10), -Búa (12) [LOC weapon/mech_1_*] | 6 | luôn |
| m_mech_2 | Apocalypse / Thiên Khởi | 8 | 1 | -20% | Laser Mạch Xung (3, tiêu 1/tia), Vụ Nổ Tròn 5 sát thương hất đạn, nâng cấp Lưới Điện Từ (8, choáng) [LOC weapon/mech_2_1, mount_2_2] | 3 | có `blueprint_m_mech_2` |
| m_mech_3 | C5H6O5 / Thiết Giáp C | 12 | 2 | -20% | Cannon Oanh Tạc (12, tiêu 3), Pháo Phân Giải (nâng cấp), Missile (2 x10) | 1 | có bản vẽ + cấp màn >= 3 |
| m_mech_4 | WiFi Booster / Máy Khuếch Đại Tín Hiệu | 16 | 0 (1 ở Badass) | 0 | 2 Súng Lơ Lửng + 1 Laser Lơ Lửng (damage 4, tiêu 1); **cho dùng vũ khí thường** | 1 | có bản vẽ + cấp màn >= 6 |
| m_mech_5 | Dragon Dance Armor / Thiết Giáp Múa Lân | 8 | 1 | -20% | Cắn (10) + Pháo Hoa (12, tiêu 4) | 3 | có bản vẽ + cấp màn >= 6 |
| m_mech_6 | Swift Shuttle Jet / Máy Bay Chiến Đấu | 7 | 1 | +60% | 2 súng (2, tiêu 4) | 3 | có bản vẽ |
| m_mech_7 | (Hellfire Chariot / wiki) | 7 | 1 (prefab; wiki 0) | +60% (prefab; wiki +120) | 1 súng (8, tiêu 2) | 3 | có bản vẽ. LƯU Ý: wiki Hellfire Chariot tốc 120, prefab m_mech_7 speedRate 0,6; chưa chắc m_mech_7 là Hellfire |
| m_mecha_normal_b | Garboil Warmech (suy ra từ HP 12) | 12 | 1 | -20% | arm_bazooka (8, tiêu 2) | 3 | có bản vẽ |
| m_mecha_normal_d | Raid Battlesuit (suy ra từ HP 13, tốc -10%, Pong Pong) | 13 | 1 | -10% | arm_pengpeng (3, tiêu 2) | 3 | có bản vẽ |
| m_mecha_normal_e | Guerrilla Combatant (Turbulence) | 14 | 1 | -20% | arm_normal_turbulence (4, tiêu 1) | 3 | có bản vẽ |
| m_mecha_normal_2s | Plume (Magnetic Storm + Electrical Sword; wiki) | 13 | 2 | -20% | arm_eliminator_plus (8, tiêu 4) | 3 | có bản vẽ |
| m_mech_9 | (chưa tra tên) | 12 | 1 | -20% | 2 súng (15 và 10, tiêu 3) | không có trong npc_mount_mech | bản vẽ 2000 đá [CFG items blueprint_m_mech_9] |
| m_mech_coin | (mech coin, mùa Mecha2) | 20 | 0 | +10% (suy ra) | m_mech_0_1 damage 2 | không | từ mảnh bản vẽ mùa [CFG items] |
| m_mech_engineer | Cơ giáp của Kỹ Sư (kỹ năng 2) | 7 | 1 | 0 | Pháo + Tạm Biệt Thế Giới nổ **199** | không bán | chỉ qua kỹ năng "Vũ Trang Cơ Giáp" [LOC Character5_skill_1_name] |
| m_mech_paladin + 15 skin | cơ giáp Paladin theo skin | 10 | (chưa đọc) | | weapon_225 (10) | không bán | kỹ năng nhân vật |

Tên của bốn dòng m_mecha_normal_b/d/e/2s gán theo HP khớp wiki, là suy luận: prefab chỉ ghi `arm_*`. Ghép tên-id chưa kiểm được (xem mục 5). m_mech_8 có bản vẽ [CFG items] nhưng không có prefab trong `common`.

### 1c. Thú cưỡi đặc biệt (không máu, không đỡ đòn, chỉ tăng tốc)

| id | Tên | Tốc | Ghi chú |
|---|---|---|---|
| mcloud | Speedy Cloud (Mây Cấp Tốc) | speedRate 1,0 (wiki +100) [PF] | Thầy Đạo cho mượn 1 tầng [CFG taoist_npc_random_mount: msword trọng số 8, mcloud 2]; bất tử, 3 vàng [WIKI Taoist, Mounts] |
| msword | Saint Sword (Thánh Kiếm) | 0,5 [PF] | như trên |
| mtao_sword | (kiếm của Thầy Đạo, bản khác) | 2,22 [PF] | không thấy nguồn nhận |
| m_celler_train | Xe Máy / Motorcycle [LOC m_celler_train] | +400 (wiki, 6 máu) | chỉ dùng trong Hầm Rượu (`celler`) |

## 2. Luật cưỡi

[WIKI Mounts] trừ khi có nhãn khác.

1. Lên: đứng gần thú cưỡi bấm nút Tương Tác (Action). Có thể lên bất kỳ lúc nào trừ khi đang đánh nhau. Đã có thú cưỡi mà tương tác thú cưỡi khác thì đổi, con cũ bỏ lại mặt đất.
2. Xuống: nút Xuống (Dismount) thay nút Kỹ Năng. Trước bản 5.2.0 phải bấm Kỹ Năng.
3. Máu riêng: mọi thú cưỡi (trừ nhóm đặc biệt) có thanh máu riêng, **nhận sát thương thay người cưỡi**. Ngoại lệ: sát thương từ Hơi Thở Thần Chết không chuyển. Khi vỡ, phần sát thương dư bị chặn, không truyền sang người; hiệu ứng trạng thái thì vẫn qua.
4. Không nhận sát thương khi không được cưỡi.
5. Hỏng: sinh vật biến mất; cơ giáp **nổ**, gây sát thương vùng bằng máu tối đa (+50% với buff Thú Cưng) và có thể thiêu [WIKI Armor Mounts; PF `playDeadClip`].
6. Qua ải (cổng): có mang, và **hồi một nửa máu tối đa (làm tròn xuống)** khi vào tầng mới. Kỹ Sư hồi đầy cơ giáp. Cơ giáp chỉ hồi bằng cách này; sinh vật còn hồi bằng bình máu (hồi được chuyển cho thú) và Giao Ước Hồi Sinh của Nữ Tư Tế. Wiki gọi chuyện hồi bằng bình/Tư Tế là lỗi thiết kế.
7. Buff Thú Cưng: thú cưỡi +50% máu (làm tròn xuống); Badass: sinh vật +2 máu (+3 với Thú Cưng), cơ giáp +1 giáp; pet Robo: cơ giáp +2 máu.
8. Vũ khí: sinh vật cho dùng/đổi vũ khí tự do. Cơ giáp **thay thế** ô vũ khí bằng vũ khí gắn (trừ WiFi Booster). Nút Phụ (Extra) kích đòn đặc biệt, ghi đè nút đổi chế độ của vũ khí chọn lửa.
9. Kỹ năng nhân vật: **không dùng được khi cưỡi**. Ngoại lệ: kỹ năng bị động vẫn chạy (Doppelganger, Guardian Elf, Moon Shadow, Frostfire Wolves, Hat Trick...), kỹ năng có hiệu ứng kéo dài dùng trước khi lên thì vẫn còn. Kỹ năng đổi đòn đánh (Dual Wield, Chaotic Strike...) tắt ngay khi lên; Meridian Sword là ngoại lệ. Kỹ năng biến hình/triệu hồi thú cưỡi (Berserk, Holy Warrior, Armor Mount, Sword Fly) không tương tác được với thú cưỡi; Cart Delivery, Transform Slime King, Fuzzy Bear... đổi thú ngay khi tương tác.
10. Giá và quán: thú cưỡi rẻ hơn cơ giáp khoảng 50%, cơ giáp đắt hơn khoảng 100% (giá tối thiểu 15 vs 30 vàng). Thương Nhân Vật Chở còn **nâng cấp** cơ giáp (một lần, trừ Prototype và Dragon Dance), cơ giáp nâng cấp có ★. Lời thoại: "Cần xe không?", mua xong "Chú ý lái an toàn", thiếu tiền "Xin lỗi, chúng tôi không cung cấp dịch vụ cho vay", nâng cấp "Sức mạnh lớn quá" [LOC object/mount_*].
11. Phòng: xuất hiện ở Phòng Đặc Biệt (dấu chấm than vàng) qua `mount_seller` [CFG random_objects]: thương nhân thú cưỡi trọng số 4 + thương nhân vật chở trọng số 2 (khi không có sự kiện Halloween). Lồng nhốt `cage_mount`: boar, boar2, mcristal, mspider, mvaken, mhorse trọng số 1 mỗi con, con có điều kiện mở khoá mới hiện. Phòng khởi đầu có điều kiện Beastmaster tặng thú cưỡi ngẫu nhiên.
12. Rèn: cơ giáp rèn trước ở Bàn Robot (hall) bằng Sắt/Linh kiện/Pin + mảnh bản vẽ + đá [WIKI từng trang; HALL.md dòng 27 tách C]. Sinh vật chỉ rèn được loại mùa Tam Quốc.

## 3. Lính thuê (13)

Chỉ số: [PF levelcommon:assets/rgprefab/pet/mercenary/npc_NN.prefab]. Tên [LOC npc/npc_NN]. "giá" = `talk.item_value` của prefab (giá cơ sở, nhân theo tầng 15-30 [WIKI Followers]). Khi prefab và wiki khác nhau thì ghi cả hai.

| id | Tên Anh / Việt | HP prefab (wiki) | Tốc | Chí mạng | Giá cơ sở | Vũ khí mặc định / dùng được [WIKI] | Cách xuất hiện |
|---|---|---|---|---|---|---|---|
| npc_01 | Royal Knight / Kỵ Sĩ Hoàng Gia | 70 (70, giáp 1) | 6 | 0 | 15 | Royal Knight's Short Sword; kiếm, giáo | sân huấn luyện + 2 hiệp sĩ phụ (`npc_01_x`); lồng nhốt trọng số 1 |
| npc_02 | Headgear Hero / Anh Hùng Mặt Nạ | 50 (50) | 6 | 0 | 15 | Machine Gun của chính anh; súng lục, súng trường | trước xe buýt "hero"; có hiệp sĩ phụ `npc_02_x` |
| npc_03 | Mercenary Intern / Lính Thuê Kiến Tập | 60 (infobox 50, thân bài 60) | 6 | 0 | 15 | Shotgun riêng; shotgun, phóng lựu | phòng 2 lính khác + `npc_03_accompany` |
| npc_04 | Legendary Apprentice / Học Trò Truyền Kỳ | 55 (55) | 6 | 0 | 15 | Magic Staff; cung, giáo, trượng | phòng đặc biệt |
| npc_05 | BarbarQ / Babalu | 65 (65) | 6 | 5 | 15 | Raw Axe; rìu, kiếm, búa | cổng đá trong phòng trống (bấm); có `npc_05_x` |
| npc_06 | Soot Soot / Tiểu Hắc | 55 (55) | 5 (wiki; prefab 6) | 5 | 15 | Monster Cuisine; vũ khí ném, railgun | cổng đá trong phòng trống |
| npc_07 / npc_07_mad | Mad Scientist / Kep Freeman | 55 (55) | 6 (wiki 5) | 5 | không có `item_value` | Crowbar; súng laser | cạnh bàn vỡ như cỗ máy thời gian; **bản `npc_07_mad` là kẻ địch** (`enemy_id e_npc_07`) khi đã có vũ khí [WIKI]; lồng nhốt cả hai bản |
| npc_08 | Don Quixote | **80** prefab (wiki 55) | **12** (rất nhanh) | 5 | **20** | Retro Spear; giáo, kiếm, cung | trước lều xiếc |
| npc_09 | Muscleman / Curry | 60 (60) | 5 | 5 | 15 | Worn Bazooka; phóng lựu | dưới cây cọ |
| npc_10 | Shared Robot / Robot Vệ Sĩ Ném Xu | 60 (60) | 8 | 5 | **một nửa số vàng đang có (làm tròn xuống)** [WIKI] | 4 vũ khí tùy mức tiền: Ion Railgun, Laser, Laser Therapy, Meteo Laser Gun | trạm Robot dùng chung, ô thứ 3 |
| npc_11 | Healing Knight / Kỵ Sĩ Hy Vọng | 55 (55) | 5 | 5 | **20** | Hope; trượng; hồi chậm (`atk_cd` 15 s) | trại cứu thương + 3 hiệp sĩ phụ (`npc_11_accompany`) |
| npc_12 | Pharaoh | **100** (100) | 5 | 5 | **1** = trừ 1-2 máu tối đa của người chơi (4 nếu điều kiện giá +100%) [WIKI; PF `item_value 1`] | Pharaoh's Blade; chỉ vũ khí đỏ | đống xương giữa vòng phép; thuê xong thành xác ướp |
| npc_13 | Jim Smiley | 50 (50) | 6 | 5 | 15 | không có; dùng gần như mọi vũ khí, bỏ qua giới hạn độ hiếm ở tầng thuê | thi thoảng ra khi ném xu Giếng Ước/Giếng Phép (xác suất thấp) |

Phân phối [CFG random_mercenary]: npc_01..06, 08, 09, 10 (và các id sau) trọng số 10; npc_07 và npc_07_mad trọng số 5 mỗi bản. Chế độ Artifact [CFG random_mercenary_artifact_mode]: chỉ 01, 04, 05, 06, 08, 11 (trọng số 10) và 12 (trọng số 5). Lồng nhốt [CFG cage_mercenary]: 01 (1), 02..06 (2), 07 (1), 07_mad (1).

### Luật lính thuê [WIKI Followers, [PF] khi có nhãn]
- Thuê: nói chuyện ở Phòng Đặc Biệt (lời "Cần giúp đỡ không?", nhận: "Dạ, thưa chủ nhân", thiếu tiền: "Thượng Đế phù hộ bạn" [LOC mercenary1_*]). Giá 15-30 vàng tăng theo tầng; không đổi ở Nguồn Gốc. Chịu ảnh hưởng buff Sale và điều kiện giá đắt.
- Số lượng: thuê một người thì **chặn xuất hiện lính thuê ở tầng sau** (chỉ một cùng lúc). Lồng nhốt không bị chặn, có thể giữ nhiều người nếu còn sống. Phòng có sẵn lính thuê thì không sinh thêm.
- Lồng nhốt: miễn phí nhưng **tay không**; nếu sống qua tầng, tầng sau nhận vũ khí mặc định. Mad Scientist là ngoại lệ (có vũ khí thì thù địch).
- Máu: theo bảng; vào tầng mới hồi đầy. Không có khung bất tử (nhận nhiều đạn cùng lúc). Chết thì biến mất và **mất cả vũ khí đang cầm**.
- Vũ khí: mặc định chỉ đồ xanh dương trở xuống (Pharaoh chỉ đỏ). Buff Thú Cưng: +35 máu cơ bản và bỏ giới hạn độ hiếm. Mỗi cấp Thầy Huấn Luyện: +15 máu, mở vũ khí hiếm hơn, tối đa đến đỏ. Mọi lính thuê dùng được vũ khí tạp. Cấm: vũ khí ma-gen-ta và 7 món (Happy New Year, Christmas Gift, Scratch Card, Super Monster Card, Portable Bomber, Strength Potion, Captain's Medal). Đổi vũ khí: dẫn lính đến món vũ khí thích hợp, 2 s sau họ nhận ("Ồ, một món vũ khí vừa tay") và thả món cũ.
- Hành vi: đánh theo từng đợt cố định rồi nghỉ (không sạc kịp vũ khí cần sạc). Bám người chơi: `min_follow_distance 2`, `max_follow_distance 20`, tự bay về chủ khi xa [PF]. `atk_cd` 1,7-3,5 s; riêng Healing Knight 15 s.
- Thầy Huấn Luyện (`object/trainer`): "Muốn huấn luyện Tùy Tùng của bạn không?"; thiếu lính: "Tùy Tùng của bạn đâu"; xong: "Ừm... Xem ra anh ta đã trở nên cường tráng hơn"; hết bậc: "Không còn gì để dạy nữa rồi" [LOC object/trainer_*].
- Còn "Thuê" khác (`hire/abo, bean, jiaqi, cat`: Dân IT, Nhà Thiết Kế cấp cứu, Chị Gái, Mèo Ú): **không phải lính thuê trong hầm**; là nhân vật phụ cho sảnh/dịch vụ (Nhà Thiết Kế "cấp cứu" rồi tặng quà [LOC hire/bean_restore, hire/gift]). Chưa có prefab đọc được. Liên hệ `hire_board` là suy đoán.

### Bảng Thuê (`hire_board`) ở sảnh
Ô nằm tại (6,27; 9,34) trong `data/sk-hall.js` [WEB], chỉ vẽ, không tương tác [WEB hall.js]. Nguồn gốc **không có chuỗi LOC riêng** (HALL.md dòng 29 và 223). Wiki không có trang Hire Board (API trả `missingtitle`) [WIKI Hire_Board]. Vậy "Bảng Thuê = nơi thuê lính thuê trước ván" là **không có bằng chứng**; lính thuê gốc thuê **trong hầm** ở phòng đặc biệt/lồng nhốt.

## 4. Hiện trạng web
- Chưa có thú cưỡi, chưa có lính thuê [WEB INVENTORY.md dòng 364, 500; js/actors.js chỉ có từ "mercenary" ở kỹ năng].
- Có sẵn khung đồng minh dùng lại được: `addWeaponAlly`, `allyDie`, `allyWalk`, `allyFollow` trong `js/actors.js` (khoảng dòng 743-800, dùng bởi bộ xương Necromancer ~dòng 1092 và tùy tùng Kỵ Sĩ ~dòng 1144 `summonKnight`) [WEB]. Đồng minh có `hp/hpMax`, `life`, `onDie`, theo chủ bằng `allyFollow` (tốc `spd * U`).
- Phòng đặc biệt/thương nhân ở `js/rooms.js` (cửa hàng phòng rương vàng ~dòng 1322 `merchant_honest`, Giếng Ước ~dòng 1385). Chưa có phòng lồng nhốt.
- Bộ kiểm chứng của web nằm ở `test/` (gốc repo): `test/soulknight-rooms.js` có sẵn [WEB git status].

## 5. Đề xuất cho web (rẻ → đắt)

**Bước A. Dữ liệu (rẻ nhất, không đổi lối chơi)**
- Sinh `data/sk-mounts.js` bằng `tools/polish/gen_mounts.py` (mới) từ [PF] ở mục 1 và 3: id, tên Việt, HP, giáp, `speedRate`, vũ khí gắn (damage, tiêu hao), prefab. Dùng đúng cách `tools/pets/` đã làm.
- Sinh `data/sk-mercs.js`: 13 lính thuê (HP, tốc, chí mạng, giá, vũ khí mặc định, loại dùng được, trọng số).
- Bộ kiểm: đếm khoá, số tim khớp bảng. Cụ thể: 14 sinh vật bán được (`mboar, mboar2, mcristal, mspider, mvaken, mhorse, micemonkey, mdungbeetle, m_morph` + 4 mùa Tam Quốc nếu làm) và 13 lính thuê; tổng HP 13 lính = 70+50+60+55+65+55+55+80+60+60+55+100+50 = **815**; HP cơ giáp m_mech_0..7 theo thứ tự = 7,10,8,12,16,8,7,7.

**Bước B. Lính thuê (đòn bẩy cao, dùng lại `addWeaponAlly`)**
- Thêm `mercenary` vào `js/actors.js`: một đồng minh bám chủ (`min 2 U`, `max 20 U`), HP theo bảng, chết thì biến mất, vào tầng mới hồi đầy; tấn công theo `atk_cd`; sát thương theo vũ khí mặc định (bản web chưa có 13 vũ khí này nên dùng damage đo từ [PF] bullet: npc_01 4, 02 3, 03 3, 04 4, 05 4, 06 7, 07 8, 08 10, 09 8, 12 8).
- Phòng đặc biệt "lính thuê" trong `js/rooms.js`: một người, giá 15 vàng (+tăng theo tầng 15-30), thuê xong chặn lính thuê tầng sau (cờ `G.merc`). Trọng số theo `random_mercenary`.
- Bộ kiểm: (1) thuê khi thiếu tiền bị từ chối, vàng không đổi; (2) thuê xong HP = giá trị bảng (ví dụ Kỵ Sĩ Hoàng Gia 70); (3) tầng sau không xuất hiện phòng lính thuê khi còn người sống; (4) đồng minh đỡ đạn và biến mất khi HP = 0; (5) sang tầng mới HP về đúng số tối đa.

**Bước C. Thú cưỡi sinh vật + thương nhân (vừa)**
- Trạng thái người chơi `p.mount = {id, hp, hpMax, def}`; nhận sát thương trước người; `hp` về 0 thì gỡ và (cơ giáp) nổ gây `hpMax` sát thương vùng. Lên/xuống bằng phím tương tác/Dismount.
- Thương nhân thú cưỡi: trọng số 4 (sinh vật) : 2 (cơ giáp) trong `random_objects mount_seller`; giá tối thiểu 15/30.
- Vào tầng mới hồi `floor(hpMax/2)` (Kỹ Sư: đầy).
- Bộ kiểm: (1) mua Heo Rừng (10 HP) rồi nhận 3 sát thương → thú 7, người nguyên vẹn; (2) nhận đòn 12 lúc thú còn 10 → thú vỡ và người không nhận phần dư 2; (3) sang tầng: thú 3 HP → 3 + floor(10/2) = 8 (kẹp ở 10); (4) trong lúc cưỡi `skill()` không chạy.

**Bước D. Cơ giáp (đắt)**
- Thay ô vũ khí bằng vũ khí gắn, giáp trừ sát thương mỗi đòn, nổ khi vỡ, nâng cấp ★ ở thương nhân. Cần vẽ 13 sprite cơ giáp (tách từ prefab) và vũ khí riêng của từng loại (Cannon, Laser Mạch Xung...). Gợi ý chỉ làm m_mech_0, 1 trước.
- Bộ kiểm: cơ giáp giáp 1 nhận đòn 3 → trừ 2; Prototype Armor vỡ nổ 7 sát thương vùng.

**Không nên làm sớm**: thú cưỡi Tam Quốc (kỹ năng riêng, mùa), Gấu Khổng Lồ 25 skin (chỉ cần kỹ năng Druid, vốn đã nằm ở nhân vật), Xe Máy (Hầm Rượu), Shared Robot (giá theo vàng), Pharaoh (trừ máu tối đa).

## 6. Những gì nguồn không có (không đoán)
- **Giá thật** của thú cưỡi: `itemValue` (15 cho sinh vật, 12/20/40/50 cho cơ giáp) có trong prefab nhưng wiki nói "tối thiểu 15 vàng thú, 30 vàng cơ giáp" và giá có thể tăng theo tầng. Chưa tìm công thức tầng (nằm trong mã C# không giải được).
- Tên Việt của `mhorse`, `micemonkey`, `mdungbeetle`, `m_morph`, `m_mech_7`, `m_mech_9`, `mcristal_gold`: LOC không có khoá. Tên Anh lấy từ wiki.
- Ghép chắc chắn id prefab `m_mecha_normal_b/d/e/2s` với tên wiki Raid Battlesuit / Guerrilla Combatant / Garboil Warmech / Plume: chưa đối chiếu được (prefab chỉ ghi `arm_bazooka`, `arm_pengpeng`, `arm_normal_turbulence`, `arm_eliminator_plus`). Cảnh báo: wiki ghi Raid Battlesuit dùng vũ khí Pong Pong, nhưng prefab `arm_pengpeng` ở `m_mecha_normal_d` (13 HP khớp wiki Raid 13): vậy `normal_d` = Raid, còn `normal_b` (12 HP, bazooka) = Garboil Warmech (wiki 12 HP). Đây là suy luận từ HP, ghi để kiểm lại.
- HP/giáp/tốc của 5 thú Tam Quốc: chỉ có số wiki (đơn vị tốc không rõ); chưa đọc prefab Combogun.
- Điều kiện mở khoá `type 8` và `type 0 >= 3 / 6` trong `npc_mount_mech`: số `>= 3`, `>= 6` có thể là cấp màn (wiki không nói rõ) (suy ra).
- Bảng Thuê (`hire_board`): không có chuỗi, không có trang wiki, không có prefab tìm được. Không rõ nó có bán lính thuê không.
- Công thức giá lính thuê theo tầng (15-30): chỉ có câu wiki, không có bảng. Số lượng tối đa mỗi tầng ngoài luật "một người/lồng nhốt không giới hạn": chưa thấy tham số trong prefab.
- Bảng nâng cấp ★ của từng cơ giáp: wiki mô tả, prefab `*_update` chưa đọc (có 11 tệp `_update`).
- HP lính thuê: prefab lệch wiki ở Don Quixote (80 vs 55) và Kiến Tập (60 vs infobox 50); dùng prefab vì là số 8.6 trực tiếp.
- 25 prefab `m_mech_paladin_sN`: chưa đọc giáp/tốc.
- Mã hành vi (đúng lúc lên/xuống, nổ, hồi) nằm trong C# không giải; luật mục 2 phần lớn từ wiki.
