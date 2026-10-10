# Kiểm kê Soul Knight 8.6.0 (gốc) so với bản web `games/soulknight`

Nguồn: [LOC] `~/sk86-ref/decoded/localization_en_vi.json` (17.794 term); [AB] tên tệp trong `~/sk86-ref/UnityDataAssetPack/assets/AssetBundles` (không mở bundle); [WEB] code/dữ liệu trong repo; [WIKI] wiki. **Lưu ý: soulknight.fandom.com trả HTTP 402 (WebFetch thất bại cả 2 lần thử: /wiki/Bosses và /wiki/Levels), nên KHÔNG có số liệu wiki trực tiếp.** Chỗ cần "theo wiki" dùng `data/sk-wiki.js` (SK_WIKI, dữ liệu wiki đã chép sẵn trong repo, nhãn [WEB-wiki]).

Quy ước "gốc": đếm term có chữ trong LOC; LOC có thể gồm nội dung đã cắt/ẩn/sự kiện nên đây là cận trên của nội dung phát hành (phỏng đoán khi nói "có trong game thường").

## 1. Nhân vật (hero), skin, kỹ năng

Số hero gốc: **42** [LOC Character{N}_name_skin0, N=0..41]; [AB] character_drawing có 42 thư mục hero. Web: **42** hero [WEB data/sk-data.js SK_DATA.heroes], đủ 42/42, không thiếu hero nào.

Cột: LOC skin = số term Character{N}_name_skin* (gồm cả skin "{bossXX}" mở từ trùm); AB skin = số tệp skin_*.ab trong skin/character/<hero>; LOC kn = số kỹ năng có tên trong LOC; web dữ liệu = số kỹ năng trong data/sk-skills86.js; web code = số kỹ năng có `S.<id> = {` trong js/skills.js + js/skills/*.js; web skin = số khóa skin trong SK_DATA.heroes.

| N | thư mục web | Tên Việt (skin0) | LOC skin | AB skin | LOC kn | web dữ liệu kn | web code kn | web skin |
|---|---|---|---|---|---|---|---|---|
| 0 | knight | Kỵ Sĩ | 38 | 38 | 3 | 3 | 3 | 1 |
| 1 | ranger | Hiệp Sĩ | 35 | 35 | 3 | 3 | 3 | 1 |
| 2 | mage | Pháp Sư | 33 | 33 | 3 | 3 | 3 | 1 |
| 3 | assassin | Thích Khách | 31 | 31 | 3 | 3 | 3 | 1 |
| 4 | alchemist | Thuật Sĩ Luyện Kim | 27 | 27 | 3 | 3 | 3 | 1 |
| 5 | engineer | Kỹ Sư | 31 | 31 | 3 | 3 | 3 | 1 |
| 6 | vampire | Ma Ca Rồng | 27 | 27 | 3 | 3 | 3 | 1 |
| 7 | paladin | Kỵ Sĩ Thánh | 31 | 31 | 3 | 3 | 3 | 1 |
| 8 | elves | Tinh Linh | 28 | 28 | 3 | 3 | 3 | 1 |
| 9 | werewolf | Người Sói | 33 | 33 | 3 | 3 | 3 | 1 |
| 10 | priest | Mục Sư | 30 | 30 | 3 | 3 | 3 | 1 |
| 11 | druid | Druid | 30 | 30 | 3 | 3 | 3 | 1 |
| 12 | robot | Robot | 27 | 27 | 3 | 3 | 3 | 1 |
| 13 | viking | Berserker | 32 | 32 | 3 | 3 | 3 | 1 |
| 14 | necromancer | Pháp Sư Tử Linh | 26 | 26 | 3 | 3 | 3 | 1 |
| 15 | officer | Cảnh Sát | 25 | 25 | 3 | 3 | 3 | 1 |
| 16 | taoist | Đạo Sĩ | 27 | 27 | 3 | 3 | 3 | 1 |
| 17 | transcendent | Kẻ Vượt Ranh Giới | 7 | 7 | 2 | 2 | 2 | 1 |
| 18 | envoy | Sứ Giả Nguyên Tố Cổ Đại | 5 | 5 | 1 | 1 | 1 | 1 |
| 19 | beheaded | Kẻ Bêu Đầu | 1 | 1 | 1 | 1 | 1 | 1 |
| 20 | ninja | Ninja Xuyên Không | 8 | 8 | 2 | 2 | 2 | 1 |
| 21 | specialforces | Đội Kỵ Sĩ Đặc Biệt | 4 | 4 | 1 | 1 | 1 | 1 |
| 22 | airbender | Khí Tông | 18 | 18 | 3 | 3 | 3 | 1 |
| 23 | warlock | Thuật sĩ ác ma | 19 | 19 | 3 | 3 | 3 | 1 |
| 24 | miner | Thợ Mỏ | 20 | 20 | 3 | 3 | 3 | 1 |
| 25 | trapmaster | Bậc Thầy Cạm Bẫy | 14 | 14 | 3 | 3 | 3 | 1 |
| 26 | costumeprince | Trang Phục Hoàng Tử | 16 | 16 | 3 | 3 | 3 | 1 |
| 27 | doctor | Nhà Vật Lý | 13 | 13 | 3 | 3 | 3 | 1 |
| 28 | swordmaster | Kiếm Tông | 14 | 14 | 3 | 3 | 3 | 1 |
| 29 | lancer | Thương Khách | 15 | 15 | 3 | 3 | 3 | 1 |
| 30 | warliege | Lãnh chúa | 14 | 14 | 3 | 3 | 3 | 1 |
| 31 | arcaneknight | Kỵ Sĩ Bùa Chú | 11 | 11 | 2 | 2 | 2 | 1 |
| 32 | astrologist | Chiêm Tinh Sư | 10 | 10 | 2 | 2 | 2 | 1 |
| 33 | fighter | Võ Đấu Gia | 13 | 13 | 2 | 2 | 2 | 1 |
| 34 | joker | Nhà Ảo Thuật | 11 | 11 | 2 | 2 | 2 | 1 |
| 35 | bard | Người Hát Rong | 11 | 11 | 2 | 2 | 2 | 1 |
| 36 | shooter | Tay Súng | 9 | 9 | 2 | 2 | 2 | 1 |
| 37 | aigirl | Nữ Hoàng Cơ Giới | 10 | 10 | 1 | 1 | 1 | 1 |
| 38 | captain | Thuyền Trưởng | 11 | 11 | 2 | 2 | 2 | 1 |
| 39 | yinyang | Âm Dương Gia | 6 | 6 | 1 | 1 | 1 | 1 |
| 40 | gunsexpert | Chuyên Gia Súng Đạn | 7 | 7 | 1 | 1 | 1 | 1 |
| 41 | ladychef | Nữ Đầu Bếp | 4 | 4 | 1 | 1 | 1 | 1 |

**Tổng:** LOC skin 782, AB skin 782 (chỉ thư mục skin/character, không tính ui_peek/drawing), web skin 42 (mỗi hero chỉ skin mặc định s0). LOC kỹ năng 103, web kỹ năng cài trong code 103 (kỹ năng specialforces đăng ký qua S[ID], id special_operation).

Hero mà web có ít kỹ năng hơn LOC: không có (103/103).

## 2. Vũ khí

- Vũ khí đánh số `weapon_NNN` có tên: **416** [LOC weapon/weapon_NNN; 416 term đánh số, 416 có tên]. Web có **296** vũ khí đánh số [WEB SK_W86.weapons, tổng 361 khóa gồm weapon_init_* và vũ khí quái]. Thiếu **120**.
- Biến thể vũ khí khởi đầu `weapon_init_*` (hero, x/xx = bản nâng/skin): 436 term [LOC]; web có 49 [WEB].
- Vũ khí thần thoại `weapon_mythic_N`: 28 term [LOC]; web có 0.
- Vũ khí của thú cưng `weapon_pet_N`: 11 [LOC]; web 6.
- Skin vũ khí: 164 thư mục skin/weapon/weapon_N/skin_*.ab (176 tệp .ab) [AB]; LOC `weapon_N_s_N` = 174 term; web: không có skin vũ khí (phỏng đoán từ việc SK_W86 không có trường skin, chưa kiểm tra sâu).
- Còn lại trong web nhưng không có trong LOC danh sách đánh số: không có (web ⊂ LOC).

### Vũ khí đánh số gốc mà web còn THIẾU (120)

| id | tên Việt |
|---|---|
| weapon_068 | Rìu |
| weapon_073 | Súng Trường |
| weapon_095 | Tấm Khiên |
| weapon_099 | Thịt |
| weapon_124 | Túi Thuốc Nổ |
| weapon_132 | Súng Xung Phong Wackern |
| weapon_133 | Súng Trường Goblin |
| weapon_144 | Súng Trường Kỵ Sĩ |
| weapon_150 | Dù |
| weapon_162 | Shuriken |
| weapon_167 | Lựu Đạn |
| weapon_169 | Dao Mổ Heo |
| weapon_175 | Chim Ưng Người Tuyết |
| weapon_189 | Móng Vuốt |
| weapon_191 | Búa |
| weapon_195 | Gậy Leo Núi |
| weapon_198 | Máy Xay Thịt |
| weapon_203 | Trúc |
| weapon_204 | Giáo |
| weapon_206 | Rìu Ném |
| weapon_208 | Dây Leo |
| weapon_213 | Thuốc Hồi Phục-Vô Tận |
| weapon_214 | Vương Miện Dự Phòng |
| weapon_215 | Súng Mới Của Vua |
| weapon_224 | Shuriken Hồ Quang |
| weapon_232 | Gậy Vực Sâu |
| weapon_238 | Máy Ảnh Mộc |
| weapon_240 | Súng Kỳ Diệu |
| weapon_242 | Rương |
| weapon_244 | Chữ Thập Trùng Sinh |
| weapon_248 | Chim Ưng Yinyin |
| weapon_252 | Bảo Bối Siêu Cấp |
| weapon_253 | Bao Tay Phép Thuật |
| weapon_254 | Gậy Anubis |
| weapon_255 | Laser Tử Tinh |
| weapon_262 | Kim Ngọc Băng |
| weapon_263 | Bột Khổng Tước |
| weapon_265 | Súng Dây |
| weapon_269 | Bình Bảo Liên |
| weapon_271 | Ngôi Sao |
| weapon_272 | Bàn Sao |
| weapon_273 | Kèn Lệnh Tấn Công |
| weapon_279 | Cá Nướng |
| weapon_280 | Cá Laser Nướng |
| weapon_281 | Hành Nướng |
| weapon_282 | Thịt Nướng |
| weapon_283 | Thượng Phương Bảo Kiếm Nướng |
| weapon_284 | Củ Cải Nướng |
| weapon_288 | Súng Bắn Tỉa Vàng |
| weapon_289 | Súng Bắn Tỉa Vàng-Chuyên Nghiệp |
| weapon_291 | Chưởng mạnh xuất kích |
| weapon_295 | Người Dệt Lưới Kịch Độc |
| weapon_297 | Pháo Quỹ Đạo Ion II |
| weapon_301 | Định Hải Thần Châm |
| weapon_303 | Shuriken Gió |
| weapon_304 | Củ Cải Trăm Năm |
| weapon_305 | Măng Ngàn Năm |
| weapon_306 | Rìu Chiến Cua Vàng |
| weapon_307 | Kiếm của Kỵ Sĩ Bóng Tối |
| weapon_309 | Shuriken Lượng Tử |
| weapon_312 | Senbontai |
| weapon_316 | Nỏ Bàn |
| weapon_317 | Dao Găm Bóng Tối |
| weapon_320 | Mặt Nạ Đau Khổ |
| weapon_331 | Thuốc Hồi Phục Toàn Bộ |
| weapon_333 | Figure Kỵ Sĩ Mini |
| weapon_334 | Tàn Ảnh Bóng Tối |
| weapon_339 | Thẻ Số |
| weapon_340 | Thẻ Quái Thú Siêu Cấp |
| weapon_344 | Đũa Phép Rồng Xanh |
| weapon_346 | Nhà Máy Bom Di Động |
| weapon_348 | Cung Cận Vệ Hỏng |
| weapon_349 | Cung Cận Vệ |
| weapon_352 | Gậy Pháp Sư Cận Vệ Phủ Bụi |
| weapon_353 | Gậy Pháp Sư Cận Vệ Phủ Bụi |
| weapon_354 | Đại Bác Cá Mập Chưa Hoàn Thành |
| weapon_355 | Huy Chương Thuyền Trưởng |
| weapon_357 | Chạm Tay Nữ Hoàng |
| weapon_358 | Nữ Hoàng Vỗ Về |
| weapon_359 | Trượng Chí Tôn |
| weapon_362 | Mắt Bão |
| weapon_363 | Tiếng Gọi Tổ Tiên |
| weapon_364 | Máy Kéo Xuyên Không Gian |
| weapon_365 | Kẹo Mút |
| weapon_368 | Quà Noel |
| weapon_369 | Thuốc Viên Siêu Lớn |
| weapon_372 | Quyền Trượng Ma Đạo Sư |
| weapon_373 | Ống Gỗ Nhỏ |
| weapon_382 | Trượng Nguyền Rủa |
| weapon_384 | Ly Thánh Nguyền Rủa |
| weapon_388 | Dùi Thần Ngưu |
| weapon_389 | Máy Dò Siêu Âm |
| weapon_390 | Thuyền Cỏ Mượn Tên |
| weapon_392 | Micro Lạc Điệu |
| weapon_393 | Súng Của Thương Nhân Bí Ẩn |
| weapon_394 | Thước 40CM |
| weapon_395 | Từ Điển Dày Cộp |
| weapon_396 | Máy Bắn Banh |
| weapon_397 | Bảng Màu Bẩn |
| weapon_398 | Cung Dung Hạch |
| weapon_399 | Cơ Bi-a |
| weapon_400 | Rìu Chiến Bão Tố |
| weapon_401 | Anh Hùng Bàn Phím |
| weapon_402 | Mắt Của Medusa |
| weapon_403 | Kim Cô Bổng |
| weapon_404 | Năm Phát Roi Sét |
| weapon_405 | Nguyên Toái Nha |
| weapon_407 | Tóc Giả |
| weapon_408 | Máy Phát Bug |
| weapon_409 | Trà Sữa Ngọt Ngào |
| weapon_410 | Đêm Dài |
| weapon_412 | Bàn Cờ Ngũ Tử |
| weapon_413 | Máy Bắn Đạn Nguyên Khí |
| weapon_414 | Sừng Ác Ma Đỏ |
| weapon_415 | Máy Nén Quái Vật |
| weapon_416 | Đao Đao Liệt Hỏa |
| weapon_417 | Minh Đăng |
| weapon_900 | Kẹo Hồ Lô |
| weapon_901 | Pháo |
| weapon_902 | Pháo Xung Thiên |

### Vũ khí mythic/init/pet thiếu

- mythic thiếu: weapon_mythic_00 Đao Tam Tiêm Lưỡng Nhẫn, weapon_mythic_01 Cung Càn Khôn, weapon_mythic_02 Bút Ngũ Sắc, weapon_mythic_03 Đoạn Tuyệt Phi Đao, weapon_mythic_04 Kim Giao Tiễn, weapon_mythic_05 Súng Tinh Vân, weapon_mythic_06 Khiên Phục Hi, weapon_mythic_07 Phất Trần Thái Ấn-Phong, weapon_mythic_08 Bình Ngọc Tịnh, weapon_mythic_09 Như Lai Thần Chưởng, weapon_mythic_10 Hàn Nguyệt Kiếm, weapon_mythic_11 Vũ Điệu Bướm, weapon_mythic_12 Tia Laser, weapon_mythic_13 Kiếm Ỷ Thiên, weapon_mythic_14 Yển Nguyệt - Đổi, weapon_mythic_15 Kiếm Thần Tế, weapon_mythic_16 Gậy Pháp Tinh, weapon_mythic_17 Cung Tinh Hạch, weapon_mythic_18 Đồ Long Đao, weapon_mythic_19 Samadhi Chân Hỏa, weapon_mythic_20 Chân-Quạt Ba Tiêu, weapon_mythic_21 Dây Trói Tiên, weapon_mythic_22 Dao Diêm Vương, weapon_mythic_23 Đại Kiếm Sấm Sét, weapon_mythic_24 Chân-Thương Hoa Tiêm, weapon_mythic_25 Kim Cang Trác, weapon_mythic_26 Lò Bát Quái, weapon_mythic_27 Huyền Thiết Trọng Kiếm

- init thiếu: weapon_init_aigirlx, weapon_init_aigirlxx, weapon_init_aigirlxx2, weapon_init_aigirlxx3, weapon_init_aigirlxx4, weapon_init_aigirlxx5, weapon_init_aigirlxx6, weapon_init_airbenderx, weapon_init_airbenderxx10, weapon_init_airbenderxx11, weapon_init_airbenderxx12, weapon_init_airbenderxx2, weapon_init_airbenderxx3, weapon_init_airbenderxx4, weapon_init_airbenderxx5, weapon_init_airbenderxx6, weapon_init_airbenderxx7, weapon_init_airbenderxx8, weapon_init_airbenderxx9, weapon_init_alchemistx, weapon_init_alchemistxx, weapon_init_alchemistxx10, weapon_init_alchemistxx11, weapon_init_alchemistxx12, weapon_init_alchemistxx13, weapon_init_alchemistxx3, weapon_init_alchemistxx4, weapon_init_alchemistxx5, weapon_init_alchemistxx6, weapon_init_alchemistxx7, weapon_init_alchemistxx8, weapon_init_alchemistxx9, weapon_init_arcaneknightxx, weapon_init_arcaneknightxx2, weapon_init_arcaneknightxx3, weapon_init_arcaneknightxx4, weapon_init_arcaneknightxx5, weapon_init_arcaneknightxx6, weapon_init_assassinx, weapon_init_assassinxx, weapon_init_assassinxx10, weapon_init_assassinxx11, weapon_init_assassinxx12, weapon_init_assassinxx13, weapon_init_assassinxx2, weapon_init_assassinxx4, weapon_init_assassinxx5, weapon_init_assassinxx6, weapon_init_assassinxx7, weapon_init_assassinxx8, weapon_init_assassinxx9, weapon_init_astrologistxx, weapon_init_astrologistxx2, weapon_init_astrologistxx3, weapon_init_astrologistxx4, weapon_init_astrologistxx5, weapon_init_bardx, weapon_init_bardxx, weapon_init_bardxx2, weapon_init_bardxx3, weapon_init_bardxx4, weapon_init_bardxx5, weapon_init_bardxx6, weapon_init_captainx, weapon_init_captainxx, weapon_init_captainxx2, weapon_init_captainxx3, weapon_init_captainxx4, weapon_init_captainxx6, weapon_init_captainxx7, weapon_init_costumeprincex, weapon_init_costumeprincexx, weapon_init_costumeprincexx2, weapon_init_costumeprincexx3, weapon_init_costumeprincexx3_special, weapon_init_costumeprincexx4, weapon_init_costumeprincexx5, weapon_init_costumeprincexx6, weapon_init_costumeprincexx7, weapon_init_costumeprincexx8, weapon_init_costumeprincexx9, weapon_init_doctorx, weapon_init_doctorxx, weapon_init_doctorxx2, weapon_init_doctorxx3, weapon_init_doctorxx4, weapon_init_doctorxx5, weapon_init_doctorxx6, weapon_init_doctorxx7, weapon_init_doctorxx8, weapon_init_druidx, weapon_init_druidxx, weapon_init_druidxx10, weapon_init_druidxx11, weapon_init_druidxx12, weapon_init_druidxx13, weapon_init_druidxx14, weapon_init_druidxx2, weapon_init_druidxx3, weapon_init_druidxx4, weapon_init_druidxx5, weapon_init_druidxx6, weapon_init_druidxx7, weapon_init_druidxx8, weapon_init_druidxx9, weapon_init_elvesx, weapon_init_elvesxx, weapon_init_elvesxx10, weapon_init_elvesxx11, weapon_init_elvesxx12, weapon_init_elvesxx13, weapon_init_elvesxx14, weapon_init_elvesxx2, weapon_init_elvesxx3, weapon_init_elvesxx4, weapon_init_elvesxx5, weapon_init_elvesxx6, weapon_init_elvesxx7, weapon_init_elvesxx8, weapon_init_elvesxx9, weapon_init_engineerx, weapon_init_engineerxx, weapon_init_engineerxx10, weapon_init_engineerxx11, weapon_init_engineerxx12, weapon_init_engineerxx13, weapon_init_engineerxx2, weapon_init_engineerxx3, weapon_init_engineerxx4, weapon_init_engineerxx6, weapon_init_engineerxx7, weapon_init_engineerxx8, weapon_init_engineerxx9, weapon_init_envoyxx, weapon_init_envoyxx2, weapon_init_fighterx, weapon_init_fighterxx, weapon_init_fighterxx2, weapon_init_fighterxx3, weapon_init_fighterxx4, weapon_init_fighterxx5, weapon_init_fighterxx6, weapon_init_fighterxx7, weapon_init_fighterxx8, weapon_init_gunsexpertxx, weapon_init_gunsexpertxx2, weapon_init_gunsexpertxx3, weapon_init_jokerx, weapon_init_jokerxx, weapon_init_jokerxx2, weapon_init_jokerxx3, weapon_init_jokerxx4, weapon_init_jokerxx5, weapon_init_ladychefx, weapon_init_ladychefxx, weapon_init_ladychefxx2, weapon_init_lancerx, weapon_init_lancerxx, weapon_init_lancerxx2, weapon_init_lancerxx3, weapon_init_lancerxx4, weapon_init_lancerxx5, weapon_init_lancerxx6, weapon_init_lancerxx7, weapon_init_magex, weapon_init_magexx, weapon_init_magexx10, weapon_init_magexx11, weapon_init_magexx12, weapon_init_magexx13, weapon_init_magexx14, weapon_init_magexx15, weapon_init_magexx2, weapon_init_magexx4, weapon_init_magexx5, weapon_init_magexx6, weapon_init_magexx7, weapon_init_magexx8, weapon_init_magexx9, weapon_init_minerx, weapon_init_minerxx, weapon_init_minerxx10, weapon_init_minerxx11, weapon_init_minerxx12, weapon_init_minerxx13, weapon_init_minerxx2, weapon_init_minerxx3, weapon_init_minerxx4, weapon_init_minerxx5, weapon_init_minerxx6, weapon_init_minerxx7, weapon_init_minerxx8, weapon_init_minerxx9, weapon_init_necromancerxx10, weapon_init_necromancerxx11, weapon_init_necromancerxx12, weapon_init_necromancerxx13, weapon_init_necromancerxx15, weapon_init_necromancerxx2, weapon_init_necromancerxx3, weapon_init_necromancerxx4, weapon_init_necromancerxx5, weapon_init_necromancerxx6, weapon_init_necromancerxx7, weapon_init_necromancerxx8, weapon_init_necromancerxx9, weapon_init_ninjax, weapon_init_ninjaxx, weapon_init_ninjaxx2, weapon_init_ninjaxx3, weapon_init_ninjaxx4, weapon_init_officerx, weapon_init_officerxx, weapon_init_officerxx10, weapon_init_officerxx11, weapon_init_officerxx12, weapon_init_officerxx2, weapon_init_officerxx3, weapon_init_officerxx4, weapon_init_officerxx5, weapon_init_officerxx6, weapon_init_officerxx7, weapon_init_officerxx8, weapon_init_officerxx9, weapon_init_paladinx, weapon_init_paladinxx, weapon_init_paladinxx10, weapon_init_paladinxx11, weapon_init_paladinxx12, weapon_init_paladinxx13, weapon_init_paladinxx2, weapon_init_paladinxx4, weapon_init_paladinxx5, weapon_init_paladinxx6, weapon_init_paladinxx7, weapon_init_paladinxx8, weapon_init_paladinxx9, weapon_init_priestx, weapon_init_priestxx, weapon_init_priestxx10, weapon_init_priestxx11, weapon_init_priestxx12, weapon_init_priestxx13, weapon_init_priestxx14, weapon_init_priestxx15, weapon_init_priestxx2, weapon_init_priestxx3, weapon_init_priestxx4, weapon_init_priestxx5, weapon_init_priestxx6, weapon_init_priestxx7, weapon_init_priestxx8, weapon_init_priestxx9, weapon_init_rangerx, weapon_init_rangerxx, weapon_init_rangerxx10, weapon_init_rangerxx11, weapon_init_rangerxx12, weapon_init_rangerxx13, weapon_init_rangerxx14, weapon_init_rangerxx15, weapon_init_rangerxx16, weapon_init_rangerxx17, weapon_init_rangerxx2, weapon_init_rangerxx4, weapon_init_rangerxx5, weapon_init_rangerxx6, weapon_init_rangerxx7, weapon_init_rangerxx8, weapon_init_rangerxx9, weapon_init_robotx, weapon_init_robotxx, weapon_init_robotxx10, weapon_init_robotxx11, weapon_init_robotxx12, weapon_init_robotxx3, weapon_init_robotxx4, weapon_init_robotxx5, weapon_init_robotxx6, weapon_init_robotxx7, weapon_init_robotxx8, weapon_init_robotxx9, weapon_init_shooterx, weapon_init_shooterxx, weapon_init_shooterxx2, weapon_init_shooterxx3, weapon_init_shooterxx4, weapon_init_shooterxx5, weapon_init_specialforcesx, weapon_init_specialforcesxx2, weapon_init_specialforcesxx3, weapon_init_swordmasterxx, weapon_init_swordmasterxx2, weapon_init_swordmasterxx3, weapon_init_swordmasterxx4, weapon_init_swordmasterxx5, weapon_init_swordmasterxx6, weapon_init_swordmasterxx7, weapon_init_swordmasterxx8, weapon_init_taoistx, weapon_init_taoistxx10, weapon_init_taoistxx11, weapon_init_taoistxx12, weapon_init_taoistxx13, weapon_init_taoistxx2, weapon_init_taoistxx3, weapon_init_taoistxx4, weapon_init_taoistxx5, weapon_init_taoistxx6, weapon_init_taoistxx7, weapon_init_taoistxx8, weapon_init_taoistxx9, weapon_init_transcendentx, weapon_init_transcendentxx, weapon_init_transcendentxx2, weapon_init_transcendentxx3, weapon_init_trapmasterx, weapon_init_trapmasterxx, weapon_init_trapmasterxx2, weapon_init_trapmasterxx3, weapon_init_trapmasterxx4, weapon_init_trapmasterxx5, weapon_init_trapmasterxx6, weapon_init_trapmasterxx7, weapon_init_vampirex, weapon_init_vampirexx, weapon_init_vampirexx10, weapon_init_vampirexx12, weapon_init_vampirexx13, weapon_init_vampirexx2, weapon_init_vampirexx3, weapon_init_vampirexx4, weapon_init_vampirexx5, weapon_init_vampirexx6, weapon_init_vampirexx7, weapon_init_vampirexx8, weapon_init_vampirexx9, weapon_init_vikingx, weapon_init_vikingxx, weapon_init_vikingxx10, weapon_init_vikingxx11, weapon_init_vikingxx12, weapon_init_vikingxx13, weapon_init_vikingxx14, weapon_init_vikingxx15, weapon_init_vikingxx3, weapon_init_vikingxx4, weapon_init_vikingxx5, weapon_init_vikingxx6, weapon_init_vikingxx7, weapon_init_vikingxx8, weapon_init_vikingxx9, weapon_init_warliegex, weapon_init_warliegexx, weapon_init_warliegexx2, weapon_init_warliegexx3, weapon_init_warliegexx4, weapon_init_warliegexx5, weapon_init_warliegexx6, weapon_init_warliegexx7, weapon_init_warliegexx8, weapon_init_warlockxx, weapon_init_warlockxx10, weapon_init_warlockxx11, weapon_init_warlockxx2, weapon_init_warlockxx3, weapon_init_warlockxx4, weapon_init_warlockxx5, weapon_init_warlockxx6, weapon_init_warlockxx7, weapon_init_warlockxx8, weapon_init_warlockxx9, weapon_init_werewolfx, weapon_init_werewolfxx, weapon_init_werewolfxx10, weapon_init_werewolfxx2, weapon_init_werewolfxx3, weapon_init_werewolfxx4, weapon_init_werewolfxx5, weapon_init_werewolfxx6, weapon_init_werewolfxx7, weapon_init_werewolfxx8, weapon_init_werewolfxx9, weapon_init_yinyangx, weapon_init_yinyangxx, weapon_init_yinyangxx2, weapon_init_yinyangxx3

### Vũ khí đánh số gốc web đã có (296)

000 Súng Ngắn Cũ, 001 Súng Ngắn P250, 002 AK47, 003 Súng Đạn Ria, 004 Súng Đạn Ria Cường Hóa, 005 Súng Uzi, 006 Người Phân Liệt Mạnh, 007 Cáo Tuyết, 008 Cáo Tuyết Lớn, 009 Cáo Tuyết Khổng Lồ, 010 Chim Ưng Sa Mạc, 011 Chim Ưng Ngoài Hành Tinh, 012 Chim Ưng Băng Sương, 013 Chim Ưng Lửa, 014 Chim Ưng Hạt Căn Bản, 015 Súng Ngắn Ổ Xoay, 016 Súng Ngắn Hai Nòng, 017 Súng Đột Kích, 018 Tên Lửa Đột Kích, 019 Súng Đột Kích Cường Hóa, 020 Súng Máy Không Ổn Định, 021 Súng Máy, 022 Súng Trường Hai Nòng, 023 Người Phân Liệt, 024 Súng Máy Dung Nham, 025 Súng Carbine, 026 Súng Xung Phong Cải Tiến, 027 Súng Xung Phong HK, 028 Cáo Tuyết-Vàng Kim, 029 Súng Đạn Ria Ngân Hà, 030 Rắn Chuông Đỏ, 031 Rắn Chuông Lục, 032 Súng Bắn Tỉa, 033 Huyền Ảo, 034 Sông Băng, 035 Cực Quang, 036 Lò Luyện, 037 Súng Máy Chuẩn Xác, 038 Chưởng Kỵ Sĩ, 039 Súng Máy Khí Độc, 040 Súng Máy Lửa, 041 Súng Gatling, 042 Mũi Khoan Năng Lượng, 043 Pháo Tên Lửa, 044 Bùng Nổ, 045 Pháo Quỹ Đạo Ion, 046 Súng Laser Ion, 047 Máy Bắn Đạn Đạo, 048 Súng Xung Phong Đời I, 049 Súng Xung Phong Đời II, 050 Thủ Vệ, 051 Pháo Quỹ Đạo Thủ Vệ, 052 Súng Đạn Ria I, 053 Súng Đạn Ria II, 054 Súng Đạn Ria III, 055 Súng Xung Phong II, 056 Pháo Tên Lửa Đời I, 057 Súng Xung Phong I, 058 Súng Xung Phong Xoắn Ốc, 059 Súng Quỹ Đạo Nguyên Mẫu, 060 Người Tiên Phong, 061 Máy Bắn Hỏa Tiễn Tập Trung, 062 Dao Chặt, 063 Dao Lớn, 064 Dao Lá Liễu, 065 Dao Cướp Biển, 066 Kiếm Lưỡi Kép, 067 Kiếm Đâm, 069 Rìu Chiến, 070 Rìu Lửa, 071 Gậy Răng Sói, 072 Bồ Cào Cỏ Khô, 074 Kiếm Ánh Sáng-Lam, 075 Kiếm Ánh Sáng-Đỏ, 076 Đinh Ba, 077 Kiếm Kỵ Sĩ Lớn, 078 Kiếm Lửa, 079 Kiếm Băng Sương, 080 Cung, 081 Cung Mạnh, 082 Cung Phức Hợp, 083 Cung Thợ Săn, 084 Cung Pha Lê, 085 Cung Băng Sương, 086 Cung Lửa, 087 Cung Ngọc Quân, 088 Cung Anh Hùng, 089 Cung Phép Thuật, 090 Nút Chai, 091 Chổi, 092 Súng Laser Tán Xạ, 093 Cá, 094 Cá Laser, 096 Bóng Rổ, 097 Bóng Đá, 098 Hành Lá, 100 Vợt Cầu Lông, 101 Người Phá Băng, 102 Súng Laser Đáng Ghét, 103 Trọng Tài, 104 Người Phán Xét, 105 Nỏ Đạn Ria, 106 Nỏ, 107 Nỏ Công Thành, 108 Mộng Ảo, 109 Loa, 110 Súng Máy Lựu Đạn, 111 Ống Hỏa Tiễn, 112 Gậy, 113 Gậy Tinh Xảo, 114 Gậy Sấm Chớp, 115 Gậy Tự Nhiên, 116 Gậy Tử Linh, 117 Gậy Băng, 118 Gậy Lửa, 119 Gậy Ánh Sáng, 120 Gậy Cari, 121 Thiếu Niên Nghiện Mạng, 122 Cung Vượn, 123 Gậy Sao Rơi, 125 Phi Tiêu Độc, 126 Nỏ Lông Vũ, 127 Tachi Cua Pha Lê, 128 Súng Trường Rồng Lửa, 129 Súng Máy Rồng Đỏ, 130 Súng Máy Bạch Ẩn, 131 Sâu Cát, 134 Hoa Ăn Thịt, 135 Chưởng, 136 Dứa Lớn, 137 Pháo Nổi, 138 Pháo Nổi Laser, 139 Súng Đạn Ria Liên Xạ, 140 Súng Đạn Ria Anh Đào, 141 Máy Bay Ném Bom, 142 Súng Bắn Tỉa Bắn, 143 Súng Xung Phong, 145 Gậy Phù Thủy Lớn, 146 Cây Thông Cầu, 147 Pháo Quỹ Đạo Liên Tục, 148 Pháo Quỹ Đạo Khuếch Tán, 149 Kiếm Ánh Sáng-Lục, 151 Súng Carbine Cũ, 152 Súng Bắn Tỉa Cũ, 153 Ống Hỏa Tiễn Cũ, 154 Người Vượt Không Gian, 155 Người Thanh Trừng, 156 Người Dệt Lưới, 157 Súng Laser, 158 Gậy Phù Thủy, 159 Đạn Đạo Nhiều Đầu, 160 Đạn Đạo Lỗ Đen, 161 Thượng Phương Bảo Kiếm, 163 Cờ Lê, 164 Senbon, 165 Nhũ Băng, 166 Boomerang, 168 Molotov Cocktail, 170 Chim Ưng Băng Lửa, 171 Giấy Làm Văn, 172 Cung Gió, 173 Cầu Vồng, 174 Gậy Ảo Ảnh, 176 Cành Cây Nóng Nảy, 177 Củ Cải, 178 Uzi Mini, 179 Súng Xung Phong III, 180 Súng Xung Phong Đỏ Vàng Lam, 181 Súng Đột Kích Cường Hóa +, 182 Chim Ưng Kịch Độc, 183 Súng Ngắn Lựu Đạn, 184 Súng Xung Phong Đời III, 185 Pháo Quỹ Đạo, 186 Gậy Bóng Chày, 187 Shuriken Phong Ma, 188 Khiên Tròn, 190 Liềm Ám Dạ, 192 Búa Gỗ, 193 Búa Đá, 194 Cung Khổng Lồ, 196 Kiếm Hư Không, 197 Rìu Cán Dài, 199 Người Hành Quyết, 200 Thiếu Nữ Nghiện Mạng, 201 Phương Thiên Họa Kích, 202 Thanh Gỗ, 205 Giáo Băng, 207 Rìu Săn Hạng Nặng, 209 Nỏ Gia Cát, 210 Gậy Sóng Biển, 211 Thuốc HP-Vô Tận, 212 Thuốc Năng Lượng-Vô Tận, 216 Súng Đâm, 217 Súng Bắn Xu, 218 Súng Bắn Tỉa Liên Xạ, 219 Súng Bắn Tỉa Điện Từ, 220 Nỏ Nổ, 221 Rìu Chiến Nổ, 222 Rìu Chiến Sấm Sét, 223 Chậu Lục, 230 Súng Ngắn Ống Ngắn, 231 Nước Ngầm (Mới xuất xưởng), 233 Ngựa Cầu Vồng Đau Bụng, 234 Pháo Sao Băng, 235 Hormone Đói, 236 Bánh Xe Tử Vong, 237 Máy Tính Khoa Học Siêu Cấp, 239 Súng Xung Phong Nhân Dân, 241 Dao Dài 40m, 243 Gậy Cũ Của Phù Thủy, 245 Kiếm Ánh Sáng-Vàng Kim, 246 Kiếm Sấm, 247 Cung Cụm Sao, 249 Súng Xung Phong Đời IIII, 250 Cáo Tuyết-Vàng Hồng, 251 Côn Nhị Khúc, 256 AK47 Vàng, 257 Chim Ưng Sa Mạc Vàng, 258 Súng Gatling Lửa Xanh, 259 Súng Cuộn, 260 Súng Cuộn Brown, 261 Súng Cuộn Ion, 264 Súng Bong Bóng, 266 Cán Kiếm Vỡ, 267 Cán Dao Vỡ, 268 Thánh Kiếm Đúc Lại, 270 Hồ Lô Dưỡng Kiếm, 274 Chưởng Thiên Đường, 275 Lời Ngon Ngọt, 276 Sổ Tay Chết Chóc, 277 Sao Băng, 278 Thú Cừu, 285 Gậy Vàng, 286 Gậy Vàng Tinh Xảo, 287 Súng Ngắn Ổ Xoay-Vàng, 290 Súng Gatling Cầu Vồng, 292 Thuốc Viên, 293 Quà Tết, 294 Súng Ngắn Ổ Xoay Du Ngoạn, 296 Rìu Chiến Lôi Bạo, 298 Pháo Quỹ Đạo Điện Từ, 299 Rìu Khổng Lồ, 300 Khẩu Pháo, 302 Cáo Tuyết Cực Lớn, 308 Sóng Hữu Cơ, 310 Mạch Đao, 311 Mâu Zeus, 313 Gậy Nữ Thần, 314 Salamander, 315 Súng Ngắn Siêu Cấp, 318 Súng Xung Phong IV, 319 Súng Đột Kích-Tinh Anh Chiến Thuật, 321 Khoan Điện, 322 Ná, 323 Khí Tức Tử Thần, 324 Rắn Cạp Nong, 325 Kiếm Ánh Sáng-Tím, 326 Băng Bộc, 327 Cáo Xám, 328 Chim Ưng Plasma, 329 Kunai Nổ Tung, 330 Mạch Xung, 332 Cào Trúng Thưởng, 335 Rìu Người Thủ Linh, 336 Kinh Lôi, 337 Súng Xung Phong Uzi Thiếu Nữ, 338 Rìu Chiến Băng Sương, 341 Gậy Dũng Sĩ Nhỏ, 342 Kiếm Anh Hùng, 343 Mưa Laze, 345 Huyền Minh, 347 Bao Tay Bão, 350 Kiếm Cận Vệ Cũ, 351 Kiếm Cận Vệ, 356 Tiểu Quỷ Đỏ Sẫm, 360 Trói Buộc, 361 Thanh Thản, 366 Sách Ánh Sáng, 367 Sách Bóng Tối, 370 Nỏ Nặng Biên Cương, 371 Pháo Hạm Vua Hải Tặc, 374 Lá Phong Khổng Lồ, 375 Song Đao Nguyên Tố Đá, 376 Dao Dài 40m Nhân Đôi, 377 Súng Gatling Thông Cầu, 378 Kịch Liệt, 379 Pháo Nổ Cực Băng, 380 Chiếc Búa Của Lão Thiết, 381 Súng Hàn Huyền Thoại, 383 Súng Lá Bánh, 385 Tu La, 386 Bút Biểu Tượng, 387 Súng Laze Lag, 406 Plasummonic, 411 Súng Hạt Giống, 903 Pháo Hoa Hỏa Tiễn

## 3. Vùng đất (level) và trùm chế độ thường

Số vùng đất gốc: **18** [LOC level/<tầng><chữ>]; bundle level/*/ có 17 [AB: 1:a b c g; 2:a-g; 3:a b c; 4:a b c; vùng 5A không có thư mục riêng]. Web có **13** vùng (13 theme trong SK_DATA.themes, ánh xạ theo đường dẫn bundle [WEB]). Thiếu: 1G Di Tích Máy Móc, 4A, 4B, 4C, 5A, kể cả toàn bộ tầng 4-5.

Cột trùm lấy từ SK_WIKI.bosses[].biomes (wiki đã chép trong repo) [WEB-wiki]; web theo pool SK_BOSSES86.pool (theo tầng: forest/castle/volcano = tầng 1/2/3).

| id | tên Việt | tên EN | tầng | web theme | trùm theo wiki (floor) |
|---|---|---|---|---|---|
| 1A | Rừng Rậm | Forest | 1 | forest | Christmas Treant (1-5); Devil's Snare (1-5); Easter Bunny (1-5); Goblin Priest (1-5); Goblin Priest (Haunted) (1-5) |
| 1B | Băng Nguyên | Glacier | 1 | glacier | Giant Crystal Crab (1-5); Giant Golden Crab (1-5); King Snow Ape (1-5); Snowman King (1-5) |
| 1C | Di Tích | Relics | 1 | ruins | Gold Mask (1-5); Prehistoric Colossus (1-5); The Giant (1-5) |
| 1G | Di Tích Máy Móc | Mechanical Ruins | 1 | THIẾU | Zulan In Ruins (1-5) |
| 2A | Lâu Đài | Knight Kingdom | 2 | castle | Dark Grand Knight (2-5); Grand Knight (2-5); Grand Slime (2-5); Grand Wizard (2-5); Mutant Nian (2-5); Nian (2-5) |
| 2B | Lâu Đài Dưới Đất | Dungeon | 2 | graveyard | C6H8O6 (2-5); Mutant Nian (2-5); Nian (2-5); Skeleton King (2-5) |
| 2C | Rừng Phù Thủy | Halloween | 2 | halloween | Headless Knight (2-5); Mutant Nian (2-5); Nian (2-5); Phantom King (2-5) |
| 2D | Hang Động | Cave | 2 | icecave | Cave Ice Bug (2-5) |
| 2E | Đầm Lầy | Swamp | 2 | swamp | ⊿卝⊙ϟ‡ (2-5) |
| 2F | Huyệt Mộ | Grave | 2 | relic | Grave Guard Scarab Archon (2-5) |
| 2G | Thành phố robot | Chiseltown | 2 | machinery | King (2-5); Queen (2-5) |
| 3A | Căn Cứ Ngoài Hành Tinh | Spaceship | 3 | aliens | Floating Laser UFO (3-5); Varkolyn Leader (3-5); Zulan The Colossus (3-5) |
| 3B | Núi Lửa | Volcano | 3 | volcano | Anubis (3-5); Baby Dragon Bros (3-5); Volcanic Sandworm (3-5) |
| 3C | Đảo Đất Sét | Neo Isle | 3 | island | Iron Pirate King Level (3-5); Iron Will Wavebreaker (3-5) |
| 4A | Di Tích Núi Khối | Monolithic Range Ruins | 4 | THIẾU | Ancestor's Legs (4-3); Captain Hulala Morley (4-5); Golem - Ancestor (4-5); Golem - Mist Dragon (4-5) |
| 4B | Chiến Trường Cổ | Ancient Battleground | 4 | THIẾU | Dong Zhuo (4-5); Hua Xiong (-); Li Jue (4-3); Ultimate Weapon- Code 01 (4-5) |
| 4C | Đáy Biển | Undersea | 4 | THIẾU | Abyssal Submariner (4-5) |
| 5A | Đáy Biển | Undersea | 5 | THIẾU | Abyssal Submariner (4-5) |

Web dùng bể trùm theo tầng chứ không theo vùng đất: tầng 1 {boss07,08,14,19,25}, tầng 2 {boss01,02,20}, tầng 3 {boss11,12,18} [WEB sk-bosses86.js pool].

## 4. Trùm

Số trùm gốc: **58** term trùm riêng [LOC boss*/boss_*; đã loại thoại, phụ đề, bản con boss12_1/2]; [AB] boss/ có 42 bundle (boss01..30 trừ 17 và 7 tên chữ, 42 tệp .ab) . Web: **12** [WEB SK_BOSSES86: boss07,08,14,19,25,01,01_2,02,20,11,12,18]. Trong đó "thường" theo SK_WIKI (phỏng đoán; trùm cuối ở floor x-5 của vùng đất có tên) = **40**, web đã có 12, thiếu 28.

| term | tên Việt | EN | loại | vùng đất wiki | web | AB bundle |
|---|---|---|---|---|---|---|
| boss01 | Kỵ Sĩ Lớn | Grand Knight | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 2-5) | Knight Kingdom | CÓ | có |
| boss01_2 | Kỵ Sĩ Bóng Tối | Dark Grand Knight | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 2-5) | Knight Kingdom | CÓ |  |
| boss02 | Phù Thủy Lớn | Grand Wizard | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 2-5) | Knight Kingdom | CÓ | có |
| boss03 | Vua Xương | Skeleton King | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 2-5) | Dungeon | thiếu | có |
| boss04 | C6H8O6 | C6H8O6 | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 2-5) | Dungeon | thiếu | có |
| boss05 | Thủ Lĩnh Wackern | Varkolyn Leader | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 3-5) | Spaceship | thiếu | có |
| boss06 | Zulan The Colossus | Zulan The Colossus | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 3-5) | Spaceship | thiếu | có |
| boss07 | Hoa Ma Mandala | Devil's Snare | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 1-5) | Forest | CÓ | có |
| boss08 | Thầy Tế Goblin | Goblin Priest | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 1-5) | Forest | CÓ | có |
| boss09 | Vua Vượn Núi Tuyết | King Snow Ape | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 1-5) | Glacier | thiếu | có |
| boss10 | Cua Pha Lê | Giant Crystal Crab | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 1-5) | Glacier | thiếu | có |
| boss10_2 | Cua Hoàng Kim | Giant Golden Crab | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 1-5) | Glacier | thiếu |  |
| boss11 | Sâu Cát Núi Lửa | Volcanic Sandworm | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 3-5) | Volcano | CÓ | có |
| boss12 | Rồng Bay Con | Baby Dragon Bros | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 3-5) | Volcano | CÓ | có |
| boss13 | Vua Người Tuyết | Snowman King | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 1-5) | Glacier | thiếu | có |
| boss14 | Người Cây Giáng Sinh | Christmas Treant | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 1-5) | Forest | CÓ | có |
| boss15 | Vua U Linh | Phantom King | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 2-5) | Halloween | thiếu | có |
| boss16 | Kỵ Sĩ Không Đầu | Headless Knight | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 2-5) | Halloween | thiếu | có |
| boss18 | Anubis | Anubis | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 3-5) | Volcano | CÓ | có |
| boss19 | Thỏ Trứng Màu | Easter Bunny | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 1-5) | Forest | CÓ | có |
| boss20 | Slime Lớn | Grand Slime | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 2-5) | Knight Kingdom | CÓ | có |
| boss21 | Đĩa Nổi Laser | Floating Laser UFO | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 3-5) | Spaceship | thiếu | có |
| boss22 | Tượng Viễn Cổ | Prehistoric Colossus | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 1-5) | Relics | thiếu | có |
| boss23 | Vua Khỉ Mặt Vàng | Gold Mask | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 1-5) | Relics | thiếu | có |
| boss24 | Sâu Băng Hang Động | Cave Ice Bug | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 2-5) | Cave | thiếu | có |
| boss25 | Thầy Tế Goblin | Goblin Priest | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 1-5) | Forest | CÓ | có |
| boss26 | ⊿卝⊙ϟ‡ | ⊿卝⊙ϟ‡ | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 2-5) | Swamp | thiếu | có |
| boss27 | Vua Sâu Giữ Mộ | Grave Guard Scarab Archon | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 2-5) | Grave | thiếu | có |
| boss28 | Cướp Biển Sắt “Cấp Vua” | Iron Pirate King Level | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 3-5) | Neo Isle | thiếu | có |
| boss29 | Kẻ Phá Sóng | Iron Will Wavebreaker | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 3-5) | Neo Isle | thiếu | có |
| boss30 | Di Tích Zulan | Zulan in Ruins | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 1-5) | Mechanical Ruins | thiếu | có |
| boss_abyssal_submariner | Thợ Lặn Vực Sâu | Abyssal Submariner | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 4-5) | Undersea | thiếu | có |
| boss_airbender | Khí Tông | Airbender | không rõ (phỏng đoán: chế độ phụ/sự kiện/mùa) |  | thiếu |  |
| boss_dead_cell_giant | Người Khổng Lồ | The Giant | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 1-5) | Relics | thiếu | có |
| boss_ditto | Vua Ti Vi | TV Tyrant | boss rush / chế độ khác (theo SK_WIKI [WEB-wiki]: 1-5) |  | thiếu |  |
| boss_dongzhuo | Đổng Trác | Dong Zhuo | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 4-5) | Ancient Battleground | thiếu | có |
| boss_dream_dog |  |  | không rõ (phỏng đoán: chế độ phụ/sự kiện/mùa) |  | thiếu | có |
| boss_fel_lord | Tước Sĩ Lục | Sir Verdant | boss rush / chế độ khác (theo SK_WIKI [WEB-wiki]: 4-5) |  | thiếu |  |
| boss_huaxiong | Hoa Hùng | Hua Xiong | không rõ (phỏng đoán: chế độ phụ/sự kiện/mùa) | Ancient Battleground | thiếu | có |
| boss_lijue | Lý Thôi | Li Jue | không rõ (phỏng đoán: chế độ phụ/sự kiện/mùa) | Ancient Battleground | thiếu | có |
| boss_lvbu | Vũ Khí Cuối Cùng 01 | Ultimate Weapon: Code 01 | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 4-5) | Ancient Battleground | thiếu | có |
| boss_mist_witch | Vu Nữ Sương Mù | Witch of the Mist | không rõ (phỏng đoán: chế độ phụ/sự kiện/mùa) |  | thiếu |  |
| boss_monolith_lower | Chân Tổ Tiên | Ancestor's Legs | không rõ (phỏng đoán: chế độ phụ/sự kiện/mùa) | Monolithic Range Ruins | thiếu | có |
| boss_noc_walker | Thần Đi Đêm | Night Wanderer | boss rush / chế độ khác (theo SK_WIKI [WEB-wiki]: 5-6) |  | thiếu |  |
| boss_robot_king | Hoàng Đế Robot | King | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 2-5) | Chiseltown | thiếu | có |
| boss_robot_queen | Hoàng Hậu Robot | Queen | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 2-5) | Chiseltown | thiếu | có |
| boss_stone_dragon | Thạch Giới·Vụ Ảnh Long | Golem - Mist Dragon | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 4-5) | Monolithic Range Ruins | thiếu | có |
| boss_stone_man | Golem - Tổ Tiên | Golem - Ancestor | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 4-5) | Monolithic Range Ruins | thiếu | có |
| boss_treant_king | Thụ Yêu Vương | Dendroid King | không rõ (phỏng đoán: chế độ phụ/sự kiện/mùa) |  | thiếu |  |
| boss_tvproducer | Nhà Sản Xuất Đen Tối | Pretentious Producer | không rõ (phỏng đoán: chế độ phụ/sự kiện/mùa) |  | thiếu |  |
| boss_void | Hư Không | The Void | boss rush / chế độ khác (theo SK_WIKI [WEB-wiki]: 3-5) |  | thiếu |  |
| boss_void_origin | Bản Tướng Hư Không | The True Void | boss rush / chế độ khác (theo SK_WIKI [WEB-wiki]: 4-6) |  | thiếu |  |
| boss_warlord | Đội trưởng đội xung phong Hulala-Moli | Captain Hulala Morley | thường (theo SK_WIKI [WEB-wiki]: trùm cuối tầng 4-5) | Monolithic Range Ruins | thiếu | có |
| boss_werewolf | Ma Sói Nhật Thực | Greedfang Warwolf | boss rush / chế độ khác (theo SK_WIKI [WEB-wiki]: 5-6) |  | thiếu |  |
| bossdefence | Tàu Ngoài Hành Tinh | Alien Aircraft Carrier | boss rush / chế độ khác (theo SK_WIKI [WEB-wiki]: 12-3) |  | thiếu |  |
| bossnian | Zodiac | Nian | sự kiện/Zodiac (không phải thường) | Dungeon/Halloween/Knight Kingdom | thiếu |  |
| bossshop | Thương Nhân Thần Bí | Trader | không rõ (phỏng đoán: chế độ phụ/sự kiện/mùa) |  | thiếu |  |
| bossxi | Zodiac Đột Biến | Mutant Nian | sự kiện/Zodiac (không phải thường) | Dungeon/Halloween/Knight Kingdom | thiếu |  |

(Cột "loại" dựa SK_WIKI; wiki gốc không tra được vì HTTP 402. Zulan the Colossus/Varkolyn Leader/Floating Laser UFO thuộc vùng 3A "Spaceship" nên là trùm thường tầng 3 nhưng chưa có trong pool web. Nian/Mutant Nian là trùm sự kiện xuất hiện ngẫu nhiên.)

## 5. Thú cưng, thú cưỡi, tùy tùng

Thú cưng: **55** có tên [LOC Pet_name_N, N=0..56; term N=44 rỗng bị bỏ]. [AB] pet/: 46 bundle (skeleton_*, vine_s*, snowman, plasmonicdrone, vcmech, snowfoxgolden, relic_scarab_*) và skin/pet/wolf_* 48. Web: 0 thú cưng riêng; chỉ có 1 thú cưng chung (js/pets.js: prefab pet0..pet5 lấy từ common.ab, `SK.profile.pet()` mặc định pet0, cắn sát thương 3) [WEB]. Không có kỹ năng pet, độ thân mật, cho ăn.

| N | tên Việt | EN | kỹ năng pet (vi) |
|---|---|---|---|
| 0 | Liang | Chilly | Hân Hoan |
| 1 | Vượng Tài | Buddy | Thịnh Vượng |
| 2 | Ham | Hamm | Không Kén Ăn |
| 3 | Slime Lam | Blue | Chia Nhau Hành Động |
| 4 | Lobobo | Robo | Sạc Dự Phòng |
| 5 | Gấu Trúc | Panda | Dễ Thương Bùng Nổ |
| 6 | Benben | BonBon | Lông Xù Xù |
| 7 | Heo Lulu | Can'bellied Pig | Giáp Sắt |
| 8 | Tap | Tap | Nhấp Nhấp |
| 9 | Douwa | Douwa | Oh oh oh!!! |
| 10 | Bồ Câu | Pigeon | Chưa Có Mặt |
| 11 | Bổ Nhào | Flutter | Đánh Xa |
| 12 | Hải Cẩu Con | Baby Seal | Gọi Tỉnh |
| 13 | Lỗ Thủng Tổ Truyền | Inherited Bug | Uôi! Kinh! |
| 14 | Lai Phúc | Wayne | Hút Máu |
| 15 | Hà Mã Hồng | Pinko Hippo | Phân |
| 16 | Thiên Cẩu Nhỏ | Mini Tengu | Trạng Thái Tengu |
| 18 | Aba | Peanut | Tránh Đường! |
| 19 | Rye | Max | Hỗ trợ |
| 20 | Meow | Smokey | Tránh Xa Người Lạ |
| 21 | Snow | Snow | Yên Tâm |
| 22 | Papa | Papa | Quan Tâm |
| 23 | Cowboy | Cowboi | Không Lãng Phí |
| 24 | Trưởng Quan Liang | Officer Chilly | Quất Roi |
| 25 | Blarney | Blani | Đất Khô |
| 26 | Rùa Con | Speedy | Tư Thế Phòng Thủ |
| 27 | Bài Ca Ban Đêm | Serenade | Tìm Tế Bào |
| 28 | Tailang | Taro | Hành lý |
| 29 | Pudding | Pudding | Đôi Chân Nhanh Nhạy |
| 30 | Bong Bóng | Purpur | Tập Trung |
| 31 | Poch | Pochi | Quyết Tâm |
| 32 | Hạt Dẻ | Chestnut | Bảo hộ |
| 33 | Lửa Đỏ | Yanyan | Lửa Rồng |
| 34 | Tiêu Đen | Pepper | Thú Khổng Lồ |
| 35 | Mèo Thất Lạc | Rosemary Cat | Mèo Của Schrödinger |
| 36 | Giảm 10% | 10% Off | Giảm giá rồi |
| 37 | Xông Lên | Quacky | Giữ nguyên đội hình |
| 38 | Sacasaca | Sacasaca | Torpedo |
| 39 | Chiêu Tài | Zhaocai | Chiêu Tài Tiến Bảo |
| 40 | Búa Nhỏ | Hammery | Búa Nhỏ đánh bạn đây! |
| 41 | Bánh Ú Con | Zongzi Junior | Trưởng thành đi! |
| 42 | Đạo Diễn Tiêu Đen | Director Pepper | Linh Cảm |
| 43 | Lỗ Hổng Tấn Công | Glitchy Roachy | Cống hiến Lỗ Thủng của ta! |
| 45 | Mèo Hỏa Lực | Meower | Thời Khắc Hỏa Lực |
| 46 | Slime Nhỏ | Slimy | Lớn hơn, mạnh hơn |
| 47 | Đại Ca Bánh Chưng | Zongzi Bro | Bánh Chưng Thịt Muối Muôn Năm |
| 48 | Mahhmot | Mahhmot | Á! |
| 49 | Chú Heo Con | Kapikapi | Ngơ ngác |
| 50 | Tháp Phòng Ngọc Trai | Milktea Monitor Tower | Màn Trình Diễn Laser |
| 51 | Giáo Quan Nhỏ | Lil Drillmaster | Ta đến trợ giúp ngươi! |
| 52 | Vua Người Tuyết Hỏa Lực | Toastie | Cháy Rụi |
| 53 | Khối Lạnh | Chilly Cube | Bắn! Đạn Nguyên Khí! |
| 54 | Lai Tài | Lai Cai | Thức Tỉnh Bản Tướng |
| 55 | Cơ Giáp Chilly | Mecha Chilly | Cơ Giáp Hợp Thể |
| 56 | Khỉ Điên Nhỏ | Mad Monki | Bắn Tỉa Chí Mạng |

Thú cưỡi (Chiến Mã mùa Tam Quốc): **5** [LOC mount/<X>/name]: Ngựa Xích Thố (ChiTu), Bóng Xám (HuiYing), Mạnh Hoạch (MengHuo), Voi Nam Man (NanManXiang), Trảo Hoàng Phi Điện (ZhuaHuangFeiDian). [AB] mount/ có 31 bundle (bear*, boar, boar2, mcristal, mcristalgold, spider, varkolyn = thú cưỡi/cơ giáp Tiệm "Thương Nhân Thú Cưỡi/Vật Chở": object/mount_seller_creature, object/mount_seller_mech [LOC]). Web: 0 [WEB: không thấy mount trong js/].

Tùy tùng (follower, Chiến Mã Tam Quốc): **6** [LOC follower/X]: Hoàng Phủ Tung, Lữ Linh Khởi, Mã Vân Lộc, Thủy Kính Tiên Sinh, Mẹ Thái Sử Từ, Văn Viễn. Web: 0 trong chế độ thường; js/season/world.js có logic follower cho mùa giải [WEB].

## 6. Cây trồng, hạt giống, vườn

Cây trồng: **51** tên [LOC plant_*]; hạt giống/bản vẽ: LOC `items/seed` "Hạt Giống", `object/plantpot_*` (chậu trồng), `plant_pot/*`, vật liệu `material_fertilize` Phân Bón. Vườn: LOC `Object_garden`, `item/fence_garden` (mở sau khi qua 1-3), 5 skin vườn [LOC garden_skin_name_0..4], [AB] hero_room/garden/skin_0..4 (5). Web: **0** (hall chỉ có đồ nội thất trang trí; không có vườn/chậu/trồng cây) [WEB]. Chế độ "Bảo Vệ Hoa Viên" (gamemode/pvz) là chế độ khác (xem mục 9).

| term | tên Việt | EN |
|---|---|---|
| plant_banboo | Trúc | Bamboo |
| plant_cactus | Xương Rồng | Cactus |
| plant_carrot | Củ Cải | Carrot |
| plant_datura | Hoa Mandala | Devil's Snare |
| plant_dragon_tree | Cây Thanh Long | Dragon Fruit Tree |
| plant_eator | Hoa Ăn Thịt | Titan arum |
| plant_gear_flower | Hoa Bánh Răng | Gear Flower |
| plant_gem_flower | Hoa Đá | Gem Flower |
| plant_gem_tree | Cây Đá | Gem Tree |
| plant_heptacolor | Hoa Bảy Màu | Heptacolor Viola |
| plant_iron_tree | Cây Sắt | Ironwood |
| plant_magic_branch | Cành Ma Lực | Magic Branch |
| plant_magic_flower | Hoa Ma Lực | Magic Flower |
| plant_mandrake | Cỏ Mandela | Mandrake |
| plant_mushroom | Nấm Pha Lê | Crystal Mushroom |
| plant_shallot | Hành Lá | Green Onions |
| plant_tree | Cây Sồi | Oak Tree |
| plant_tree_L | Cây Sồi-Lớn | Oak Tree L |
| plant_trumpet | Hoa Tảo Xanh | Trumpet Flower |
| plant_vine | Dây Leo | Vine |
| plant_worm | Đông Trùng Hạ Thảo | Caterpillar fungus |
| plant_xmas | Cây Giáng Sinh | Xmas Tree |
| plant_radar | Hoa Radar | Radar Flower |
| plant_binary_tree | Cây Nhị Phân | Binary Tree |
| plant_red_black_tree | Cây Đỏ Đen | Red Black Tree |
| plant_watermelon | Dưa Hấu | Watermelon |
| plant_mirror_plane_flower | Hoa Mặt Gương | Mirror Flower |
| plant_defend_flower | Hoa Thủ Hộ | Guardian Flower |
| plant_fantastic_flower | Hoa Kỳ Diệu | Fantastic Flower |
| plant_strange_flower | Hoa Kỳ Dị | Strange Flower |
| plant_pumpkin | Bí Đỏ | Pumpkin |
| plant_lycoris | Manjusawa | Red Spider Lily |
| plant_lotus | Sen Tuyết Thiên Sơn | Snow Lotus |
| plant_mushroom_gold | Nấm Vàng | Golden Mushroom |
| plant_rosemary | Hương Thảo | Rosemary |
| plant_lavender | Oải Hương | Lavender |
| plant_silver_poplar | Dương Bạc | Abele |
| plant_roselle | Hoa Hồng | Roselle |
| plant_qilixiang | Thất Lý Hương | Daphne Odera |
| plant_rainbow_grass | Cỏ Cầu Vồng | Rainbow Grass |
| plant_shadow_bamboo | Trúc Vô Ảnh | Shadow Bamboo |
| plant_clivia | Quân Tử Lan | Bush Lily |
| plant_firecracker | Pháo | Firecracker |
| plant_zongzi | Hoa Bánh Ú | Zongzi Flower |
| plant_icepear | Lê Băng | Frozen Pear |
| plant_blackrose | Hoa Đồng Đen | Black Rose |
| plant_lithiumflower | Hoa Ly | Lithium Flower |
| plant_ginseng | Nhân Sâm | Ginseng |
| plant_flatpeach | Đào Tiên | Heavenly Peach |
| plant_nepenthes | Cây Nắp Ấm | Monkey Cup |
| plant_monotropa | Cây Lan Pha Lê | Ghost Pipe |

## 7. Thiên phú (buff), tượng thần, NPC trong hầm

Thiên phú: **62** term tên [LOC Buff_name_N; còn 163 term Buff_info_N không có tên; Buff_upgrade_N 46]. Web: dữ liệu 63 buff [WEB SK_BUFFS86.buffs, đã gồm 1015..1018 và 3001..3007 từ talents86.py], có luật chạy `def(id)` cho **51** [WEB js/rooms.js]. Chưa có luật: 15, 31, 1023, 1025 (lý do ở cột cuối) và 3001..3007 (cần chế độ Xâm Nhập Hư Không).

**Id ở bảng là BuffId** (tên ở `Buff_name_<BuffId-1>` khi BuffId < 1000; bản bảng cũ ghi tên theo chỉ số loc nên lệch một ô, ví dụ "15 Tim Dũng Sĩ" thật ra là BuffId 16). Buff 26/27 là bản cũ của 40 (Bạo Phép Thuật), không tính. Bể bốc theo cấp (`groups`) chỉ chứa 1..36, 1023, 1025, 2101..2108, 2118; các buff 38, 39, 40, 41, 1020, 1024, 2145, 2146 và 1015..1018 không nằm nhóm nào (40 bán ở Lái Buôn Thiện Lương cùng 8, 9, 23; còn lại cấp bằng `SK_ROOMS.takeBuff`).

| id | tên Việt | web dữ liệu | web luật |
|---|---|---|---|
| 1 | Rãnh Xuyên Tâm | có | có |
| 2 | Tia Năng Lượng Cao | có | có |
| 3 | Siêu Bom | có | có |
| 4 | Kiếm Phản Kích | có | có |
| 5 | Tụ Lực Nhanh | có | có |
| 6 | Khiên Kiên Cường | có | có |
| 7 | Khiên Gai | có | có |
| 8 | Khiên Chống Độc | có | có |
| 9 | Khiên Lửa | có | có |
| 10 | Giảm Nửa Giá! | có | có |
| 11 | Hút Sinh Lực | có | có |
| 12 | Cường Hóa Hồi Phục | có | có |
| 13 | Hút Năng Lượng | có | có |
| 14 | Trì Hoãn Thời Không | có | có |
| 15 | Thợ Mỏ Đá Quý | có | chưa: web không có đá quý cuối ván |
| 16 | Tim Dũng Sĩ | có | có |
| 17 | Bạn Tốt Nhất | có | có |
| 18 | Khiên Xung Kích | có | có |
| 19 | Người Nhặt Phế Liệu | có | có |
| 20 | Đòn Chính Xác | có | có |
| 21 | Giảm Hồi Chiêu | có | có |
| 22 | Tượng Nhân Đôi | có | có |
| 23 | Khiên Băng Giá | có | có |
| 24 | Đạn Nảy | có | có |
| 25 | Mở Rộng Túi | có | có |
| 28 | Đá Tảng Rắn | có | có |
| 29 | Kiếm Thuật Sư | có | có |
| 30 | Từ Điển Phép | có | có |
| 31 | Liên Kích Mưa | có | chưa: chưa có vũ khí đánh liên kích |
| 32 | Ép Xung | có | có |
| 33 | Xác Dễ Nổ | có | có |
| 34 | Giáp Vàng | có | có |
| 35 | Bạo Kích Mất Máu | có | có |
| 36 | Giáp Đi Nhanh | có | có |
| 38 | Khiên Khẩn Cấp | có | có |
| 39 | Bí Quyết Luyện Khí | có | có |
| 40 | Bạo Phép Thuật | có | có |
| 41 | Dòng Điện Từ | có | có |
| 1015 | Băng Kích | có | có |
| 1016 | Tượng Băng Nổ | có | có |
| 1017 | Vòng Sương Băng | có | có |
| 1018 | Ảo Ảnh Rừng | có | có |
| 1020 | Thời Khắc Tập Trung | có | có |
| 1023 | Âm Dương Lưu Chuyển | có | chưa: chỉ dành riêng một nhân vật |
| 1024 | Âm Vang Súng Đạn | có | có |
| 1025 | Nhà Mỹ Thực Ngục Tối | có | chưa: chưa có nguyên liệu thực phẩm |
| 2101 | Trảm Lốc Xoáy | có | có |
| 2102 | Đạn Phân Tách | có | có |
| 2103 | Tập Kích | có | có |
| 2105 | Luân Chuyển Nguyên Tố | có | có |
| 2106 | Đòn Động Năng | có | có |
| 2108 | Thời Gian Party! | có | có |
| 2118 | Bảo Hộ Linh Hồn | có | có |
| 2134 | (không có tên trong loc) | có | chưa: loc không có tên, mô tả nói về vùng nguyên tố (web chưa có vùng nguyên tố đứng được) |
| 2145 | Gan góc dũng cảm | có | có |
| 2146 | Hồn Giác Đấu | có | có |
| 3001 | Tay Hư Không | có | chưa (chế độ Xâm Nhập Hư Không chưa có; chỉ có tên/mô tả) |
| 3002 | Thể Chất Hư Không | có | chưa (chế độ Xâm Nhập Hư Không chưa có; chỉ có tên/mô tả) |
| 3003 | Lệnh Truy Sát Hư Không | có | chưa (chế độ Xâm Nhập Hư Không chưa có; chỉ có tên/mô tả) |
| 3004 | Khiên Hư Không | có | chưa (chế độ Xâm Nhập Hư Không chưa có; chỉ có tên/mô tả) |
| 3005 | Hư Không Che Chở | có | chưa (chế độ Xâm Nhập Hư Không chưa có; chỉ có tên/mô tả) |
| 3006 | Hư Không Cộng Tế | có | chưa (chế độ Xâm Nhập Hư Không chưa có; chỉ có tên/mô tả) |
| 3007 | Tàn Tượng Hư Không | có | chưa (chế độ Xâm Nhập Hư Không chưa có; chỉ có tên/mô tả) |

Tượng thần: **11** tên [LOC statue_*_name]: Tượng Thích Khách, Tượng Kỹ Sư, Tượng Kỵ Sĩ, Tượng Mục Sư, Tượng Kỵ Sĩ Thánh, Tượng Thỏ, Tượng Tinh Linh Ngọc Quân, Tượng Trộm Cướp, Tượng Phù Thủy, Tượng Berserker, Tượng Người Sói; thông tin hiệu ứng có 10 [LOC statue/info/1..10]. Web: **10** [WEB SK_BUFFS86.statues]; thiếu: Tượng Thỏ / Tượng Người Sói nếu bản 11 tên khác bản 10 hiệu ứng (chưa đối chiếu từng tượng; phỏng đoán).

NPC trong hầm/sảnh:

- `npc/npc_NN` (NPC phụ khai thác trong hầm): 13 [LOC]: npc_01=Kỵ Sĩ Hoàng Gia, npc_02=Anh Hùng Mặt Nạ, npc_03=Lính Thuê Kiến Tập, npc_04=Học Trò Truyền Kỳ, npc_05=Babalu, npc_06=Tiểu Hắc, npc_07=Kep Freeman, npc_08=Don Quixote, npc_09=Curry, npc_10=Robot Vệ Sĩ Ném Xu, npc_11=Kỵ Sĩ Hy Vọng, npc_12=Pharaoh, npc_13=Jim Smiley. Web: 0 NPC này.
- Lính đánh thuê `mercenaryN_*`: 13 loại [LOC]. Web: 0 (chỉ có chữ "mercenary" trong js/actors.js, js/skills.js liên quan kỹ năng) [WEB].
- Thuê (hire): Dân IT, Nhà Thiết Kế, Chị Gái, Mèo Ú [LOC hire/abo,bean,jiaqi,cat]; web 0.
- Đồ vật/cửa hàng trong hầm: Bàn Rèn (object/forge), Lò Đúc Lại (furnace), Lò Khởi Nguyên (furnace_inverse), Bàn Luyện Kim (alchemy), Máy Quay Trứng (gashapon), Họa Sĩ (map_drawer), Thương Nhân Thú Cưỡi/Vật Chở, Thầy Huấn Luyện (trainer), Robot Hỏng (robot), Thầy bói/Con bạc/Thương nhân Tà Vương (mode_loop/npc/*), Giếng ước (item/wishing_well_*), Lái buôn thần bí (bossshop "Thương Nhân Thần Bí"), Thợ rèn Lão Thiết [LOC]. Web có: cửa hàng phòng rương vàng (js/rooms.js CỬA HÀNG), Giếng Ước, tượng, rương, thiên phú [WEB]; không có rèn/lò/luyện kim/gacha/hỏa họa sĩ.

## 8. Chế độ chơi

| chế độ | tên Việt [LOC] | web |
|---|---|---|
| gamemode/normal | Chế độ Ải | CÓ (3 tầng ngẫu nhiên vùng đất, 5 màn; 1 người) [WEB lobby.js MODES level] |
| gamemode/badass | Lợi Hại (badass/hard) | thiếu |
| gamemode/bossrush | Khu Thí Luyện (boss rush) | thiếu |
| gamemode/challenge | Nhân Tố Thử Thách | thiếu |
| gamemode/looptravel | Mê Trận Tà Vương | thiếu |
| gamemode/pvz | Bảo Vệ Hoa Viên | thiếu |
| mode/defence | Thần Điện Thủ Hộ (The Origin) | thiếu |
| mode/MonsterRise | Quái Thú Trỗi Dậy | thiếu |
| mode/void_invasion | Xâm Nhập Hư Không | thiếu |
| Mode/Troop | Chỉ Huy Nhỏ | thiếu |
| Mode/Artifacts | Thần Khí Lục Địa Cổ | thiếu |
| esc_mode_name | Thoát Khỏi Đảo Khỉ Điên (Escape from Monkia, mùa giải) | CÓ một phần (js/season/*, lobby MODES season) [WEB] |
| irontide/scene_name | Mùa Trào Lưu Robot (irontide, cảnh Hố Treo) | thiếu |
| combogun | Mùa giải "combogun" (Cúp Vàng Mùa Giải) | thiếu (phỏng đoán tên) |
| pvp/normal_mode | Chế độ kinh điển / Loạn Đấu (PVP) | thiếu, online |
| multi_local/title | Nối máy cục bộ/từ xa (nhiều người) | bỏ qua theo yêu cầu |
| daily_commission/title | Ủy Thác Hôm Nay (thử thách hằng ngày) và officer "Nhiệm Vụ Treo Thưởng" | thiếu |

LOC còn có tiền tố aram (112 term), heroball (192), troop2/Troop (103), activity (1737 term sự kiện) mà không có tên chế độ rõ [LOC]; web chỉ có "warfront" ghi "Sắp ra mắt".

## 9. Sảnh/nhà (hall)

Web hall (data/sk-hall.js): **22 slot nội thất** + 8 trang trí [WEB]: arcade_machine, books, carpet, chest, drink_seller, egg_machine, fish_bowl, fridge, gallery, handbook_entry, hire_board, hostess, mail_box, pet_food, plant, plutus_cat, postman, safe, sofa, table, trash_can, tv. Chỉ vẽ, **không có tương tác** (js/hall.js không có xử lý bấm/E) [WEB]; nhân vật đi bộ trong sảnh rồi vào cửa chọn chế độ.

Tiện ích gốc [LOC Object_* / object/*]: 26 mục tiêu biểu:

| term | tên Việt | web |
|---|---|---|
| Object_chest | Rương | chỉ vẽ (slot chest), không chạy |
| Object_fridge | Tủ Lạnh | chỉ vẽ (slot fridge), không chạy |
| Object_plutus | Mèo Chiêu Tài | chỉ vẽ (slot plutus_cat), không chạy |
| Object_hostess | Du Lịch Lợi Hại | chỉ vẽ (slot hostess), không chạy |
| Object_postman | Nhân Viên Chuyển Phát | chỉ vẽ (slot postman), không chạy |
| Object_safe | Két Sắt | chỉ vẽ (slot safe), không chạy |
| Object_garden | Vườn | THIẾU |
| Object_workshop | Xưởng | THIẾU |
| Object_Achievenment | Thành tựu | THIẾU |
| Object_book | Sách | chỉ vẽ (slot books), không chạy |
| Object_petfood | Thức Ăn Mèo | chỉ vẽ (slot pet_food), không chạy |
| Object_Statistics | Thống kê | THIẾU |
| Object_plant | Cây Cảnh | chỉ vẽ (slot plant), không chạy |
| Object_tv | Tivi | chỉ vẽ (slot tv), không chạy |
| Object_cellar | Hầm | THIẾU |
| object/forge | Bàn Rèn | THIẾU |
| object/furnace | Lò Đúc Lại | THIẾU |
| object/furnace_inverse | Lò Khởi Nguyên | THIẾU |
| object/alchemy | Bàn Luyện Kim | THIẾU |
| object/gashapon_machines | Máy Quay Trứng | chỉ vẽ (slot egg_machine), không chạy |
| object/gallery | Standee | chỉ vẽ (slot gallery), không chạy |
| object/fishbowl | Hồ Cá | chỉ vẽ (slot fish_bowl), không chạy |
| object/trainer | Thầy Huấn Luyện | THIẾU |
| object/slotmachine | Máy "Dilili" | THIẾU |
| Object_officer | Cảnh Sát (nhiệm vụ treo thưởng) | THIẾU |
| Object_magiczone | Khu Phép Thuật | THIẾU |

Skin sảnh [AB hero_room]: hall 6, second_hall 1, work_shop 5, garden 5, magic_area 5; LOC hall_skin_name_0..5 (6). Web 1 (hall_0) [WEB].

## 10. Vật liệu, rương, tiêu hao, thành tựu (chỉ đếm)

- Vật liệu: 162 term `material_*` [LOC], gồm: nguyên liệu (Bình Điện, Sinh Khối, Phân Bón, Linh Kiện, Mỏ Sắt, Gỗ, Cá Khô, Đá), Mảnh Phép Thuật nhiều màu, mảnh skin/kỹ năng, Băng Từ nhạc nền theo vùng (material_tape_*), Lông Vũ Valkyrie, Tế Bào, sách kỹ năng c17/c18/c20/c21. Web: không có hệ vật liệu (ngoài chế độ mùa: SK_SEASON_ITEMS 792 item [WEB data/season-items.js]).
- Tiêu hao: item_health_pot(_L), item_energy_pot(_L), item_restore_pot(_L), item_dumplings [LOC]; 13 term item_*. Web có bình máu/năng lượng rơi từ quái và rương (rooms.js ĐỒ RƠI) [WEB] nhưng không có kho vật phẩm.
- Rương: Object_chest, e_chest1/2 (quái rương), objects/material_chest, rương vàng/ rương vũ khí theo cấp (tbweapongroup WG_level1..3) [LOC/WEB]; web có rương vũ khí + cửa hàng rương vàng.
- Thành tựu: 155 tên `ac/name_N` + 145 mô tả [LOC]; danh hiệu `honorary_title` 41; Thần khí/artifact (`artifact/achieve_*`) 220 term. Web: 0 hệ thành tựu (chỉ ghi "unlock achievement" ở dữ liệu hero) [WEB].
- Phụ tùng/dấu ấn: vũ khí có lời nguyền/affix `level/weapon_affix_N_name` = 75 [LOC]; web chưa có.

## Bảng tổng

| nhóm | gốc | web | thiếu |
|---|---|---|---|
| Hero | 42 | 42 | 0 |
| Kỹ năng hero | 103 | 103 | 0 |
| Skin hero (LOC) | 782 | 42 | 740 |
| Vũ khí đánh số | 416 | 296 | 120 |
| Vũ khí mythic | 28 | 0 | 28 |
| Vùng đất | 18 | 13 | 5 |
| Trùm (term riêng) | 58 | 12 | 46 |
| Trùm chế độ thường (theo wiki) | 40 | 12 | 28 |
| Thú cưng | 55 | 0 | 55 |
| Thú cưỡi (LOC mount/*) | 5 | 0 | 5 |
| Tùy tùng (follower) | 6 | 0 | 6 |
| Cây trồng | 51 | 0 | 51 |
| Skin vườn | 5 | 0 | 5 |
| Thiên phú (Buff_name) | 62 | 34 | 28 |
| Tượng thần | 11 | 10 | 1 |
| NPC npc_NN | 13 | 0 | 13 |
| Lính thuê mercenaryN | 13 | 0 | 13 |
| Chế độ chơi (liệt kê trên) | 16 | 2 | 14 |
| Tiện ích sảnh (liệt kê) | 26 | 0 | 26 |
| Skin sảnh (LOC hall_skin) | 6 | 1 | 5 |
| Vật liệu | 162 | 0 | 162 |
| Thành tựu | 155 | 0 | 155 |
