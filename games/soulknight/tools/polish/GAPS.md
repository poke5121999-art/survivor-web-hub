# Chỗ lệch giữa Soul Knight gốc và bản web (đợt polish theo clip, 2026-10-09)

Nhãn: [THẤY] trong khung clip đã tự mở xem, [ĐO] đọc từ bundle 8.6, [SUY] suy luận, [AGENT] agent xem clip kể nhưng chưa ai mở khung kiểm.
Nhật ký quyết định: `decisions.tsv` cùng thư mục.

## Clip đã xem

| id | nội dung | bản |
|---|---|---|
| LyMmXTQFcq8 | Knight, lượt đủ 1-1 → 3-5 | 7.8.0.17 (chân màn) |
| B9Gb2Y26Cow | Knight sừng đỏ + chó Shiba, ải 1-1 → 1-5 | 4.1.8 |
| rNUWLt51lmA | tổng hợp trùm (bình luận Tây Ban Nha) | không rõ |
| dpJv-dNWg84 | kênh Su Đờn, giao diện tiếng Việt | 3.3.13 |

## Đã sửa

| lệch | bằng chứng | sửa |
|---|---|---|
| Dọn phòng không có chữ CLEAR | [THẤY] https://youtu.be/B9Gb2Y26Cow?t=112, cả lúc trùm chết https://youtu.be/rNUWLt51lmA?t=76 | `js/hud.js` phát clip gốc `message_bar/show_signpost`, Text = CLEAR |
| Khung mask hiện thành khối trắng khi clip bật Image | [THẤY] ảnh chụp web | `build_ui.py` ghi `img.gfx = 0` cho `Mask.m_ShowMaskGraphic = 0`; `ugui.js` không vẽ |
| Mở game vào thẳng màn chọn nhân vật, không có sảnh | [THẤY] sảnh "Select a hero" https://youtu.be/rhNuFTPktF4?t=74 | `js/hall.js` + `tools/hall/build_hall.py`: nền 2 lớp từ `hall_0_normal`, 21 prefab nội thất, mặt nạ đi được, khối chặn đồ đạc, cửa `door_enter` → bảng chế độ. `?quick=1` giữ luồng cũ cho bộ kiểm |
| Qua cổng không có màn tải; chọn buff bằng thẻ nâu HTML đè lên hầm | [THẤY] màn tải https://youtu.be/LyMmXTQFcq8?t=2, chọn thiên phú ?t=44 | `js/loading.js` vẽ scene gốc `loading.ab › Canvas_Loading`: nền xám, "{0} ải sau sẽ nhận Thiên Phú mới!", mẹo `I_tip_*`, xoáy cổng lớn dần; chọn thiên phú bằng `ui_buff_bar` + 3 thẻ `buff_tpl3`, nút "Đổi 1 đợt (2/2)". Bỏ lớp HTML `#sk-buffs` |
| Không có thú cưng đi theo | [THẤY] mèo đen https://youtu.be/LyMmXTQFcq8?t=33, chó https://youtu.be/B9Gb2Y26Cow?t=812 | `js/pets.js`, prefab `pet0..pet5` [ĐO Pet0Controller: 3 sát thương, atk_cd 2, theo chủ 2–20 đv, tốc 8] |
| Lượt chơi cố định Rừng → Lâu Đài → Núi Lửa; gốc bốc chủ đề mỗi tầng | [THẤY] trùm Zulan ở chủ đề đá xanh https://youtu.be/B9Gb2Y26Cow?t=812 | `js/game.js` `rollThemes()`: mỗi lượt chơi bốc một trong các chủ đề cùng tầng (`level/N/*`, 3 + 7 + 3 = 13 chủ đề), cả 5 ải của tầng cùng chủ đề. `?themes=a,b,c` ghim cho bộ kiểm. Bộ kiểm `test/soulknight-themes.js` |
| Vùng đất ngoài Rừng/Lâu Đài/Núi Lửa mượn trùm của vùng gốc | [ĐO config/enemies.json LevelKey] 1B boss09/10/13, 1C boss22/23/dead_cell_giant, 2B boss03/04, 2C boss15/16, 2D boss24, 2E boss26, 2F boss27, 2G robot king/queen, 3A boss05/06/21, 3C boss28/29 | 22 trùm mới (`js/bosses/<pid>.js`, `SK.bossRegister`), bể theo vùng đất; `build_bosses86.py` chạy trên Linux với config giải bằng `~/sk86-ref/tools/decode_config.py` |
| Thiếu 113 vũ khí đánh số + 28 thần thoại | [ĐO config/weapons.json] 409 + 28 | `build_w86.py` bóc đủ 503 món; 80 món của bảng rơi `weapons_drop` vào bể rương theo Group [SUY]; `test/soulknight-allweapons.js` quét từng món |
| Chỉ có skin 0 của nhân vật | [ĐO CharacterSprites] 740 skin | `tools/skins/build_skins.py`, gói nạp lười, thanh trượt skin ở màn chọn nhân vật |
| Chủ đề sàn đá xanh hoa văn 回 ở ải 1 (trùm Zulan) chưa tìm ra bundle | [THẤY] https://youtu.be/LyMmXTQFcq8?t=33 | là vùng 1G Di Tích Máy Móc `level/1/g.ab` (map_G1 "1-1", quái e_old_*, trùm boss30 Di Tích Zulan) [ĐO config/map_levels, enemies.LevelKey]; theme `zulanruins` tầng 1 |

## Còn mở

| lệch | bằng chứng | vì sao chưa làm |
|---|---|---|
| Vị trí đứng của nhân vật trong sảnh | [THẤY] mỗi người cạnh đồ trang trí riêng https://youtu.be/rhNuFTPktF4?t=74 | 6 người neo theo đồ `decorate_*`/vòng phép/quan tài/ống nghiệm/hộp đồ nghề [SUY]; còn lại đứng ô trống [ƯỚC LƯỢNG]; bảng gốc chưa giải mã |
| Sảnh thiếu nút nhà góc trái | [THẤY] https://youtu.be/rhNuFTPktF4?t=74 | web không có màn tiêu đề để về; ô đá quý (prefab show_currency_widget) và mèo đi theo trong sảnh đã có |
| Skin: mọi skin chọn được miễn phí; tư thế kỹ năng (layer L2 của controller skin) và đạn/hiệu ứng riêng của skin vẫn của skin 0; skin có tranh động (nhiều phần) dùng tranh skin 0 | bản gốc mở skin bằng đá quý/sự kiện; prefab `characters/<hero>/skin_<n>/...` có đạn riêng | gói skin chỉ tách idle/run/dead (`tools/skins/build_skins.py`); khoá anim layer trùng tên sk-data. Kinh tế mở skin làm cùng mục sảnh/vật liệu |
| AI 22 trùm mới dựng từ tên state, sự kiện clip, trường MonoBehaviour và prefab đạn; số viên/góc/tốc nhiều chỗ [ƯỚC LƯỢNG]; vài đòn chưa làm (robot king atk6, queen atk_4, boss27 atk4 giáp, boss24 thân nhiều đốt, boss16 ngựa) | chú thích từng tệp `js/bosses/*.js` | logic đòn nằm trong IL2CPP, máy này không có dump.cs / libil2cpp_mem.so; cần Waydroid để dump lại |
| Bảng luban (bể rương WG_level*, nhóm thiên phú, bàn rèn...) chưa giải được | blob `luban_config.ab` AES | khoá không tìm thấy trong metadata đã xáo; dữ liệu luban cũ trong `data/*.js` vẫn dùng |
| Năng lực riêng của 28 vũ khí thần thoại (`weapon/weapon_mythic_NN/ability`) chưa chạy; vũ khí ngoài bể rương (rèn, sự kiện) chưa có đường lấy | localization ability/attr | chờ mục lò rèn (sảnh) |
| Lợi Hại: hệ số quái (mật độ ×1,3, tinh anh 40%, trùm máu ×1,5) [ƯỚC LƯỢNG]; điều kiện mở gốc còn đòi mở hết vật phẩm Phòng Khách | [WIKI skvn Chế_Độ_Badass] +1 sát thương, trùm tinh anh; [LOC I_tip_09] | gốc không ghi số; sảnh web chưa có kinh tế vật phẩm |
| Khu Thí Luyện: số ải (15, theo nhãn map_End_BR "BR 3-5") [SUY]; thiếu vé Lông Vũ Valkyrie, Thí Luyện Thuần Túy và trận Tước Sĩ Đỏ/Tím cuối, trùm tầng 4 | [CFG map_levels *_BR, enemies.boss_bossrush_final] | Tước Sĩ cần bóc rig + viết AI; vé cần Cảnh Sát/nhiệm vụ treo thưởng ở sảnh |
| Nhân Tố Thử Thách: 36/65 nhân tố chạy; 29 nhân tố cần hệ thống chưa có (may mắn, debuff lên quái, phòng thêm, thú cưỡi, hồi sinh...) chưa đưa vào danh sách; chọn tối đa 3 [ƯỚC LƯỢNG]; chưa có bảng nhiệm vụ treo thưởng làm mới theo ngày | tools/polish/MODES.md 2c | js/factors.js |
| Tước Sĩ cuối Khu Thí Luyện: web cho đánh khi không mang nhân tố; gốc đòi Thí Luyện Thuần Túy (không thiên phú/vũ khí, kịp giờ); thiếu lính e_bossrush_minion_* | [LOC bossrush_intro_tips4-6] | đồng hồ + kiểm thuần túy chưa làm |
| Sảnh: Máy Đổi và Máy Game là khối giữ chỗ tự vẽ (nội thất web không có prefab hai món này; Máy Đổi gốc ở khu Xưởng); Két Sắt cấp 2–4 nội suy; 1 vàng = 1 đá cuối lượt [ƯỚC LƯỢNG]; bỏ 14 mục rơi có `conditions` | tools/polish/HALL.md | js/hall_use.js, js/drops.js |
| Màn tải: dòng mẹo ở 82% chiều cao (gốc 92%); thiếu kim cương quay góc phải; font pixel `zpix` không có trong bundle (đang dùng Be Vietnam Pro) | [THẤY] https://youtu.be/LyMmXTQFcq8?t=2 | nhỏ, chưa sửa |
| Số lượt "Đổi 1 đợt" | nút gốc ghi (2/2) | web: 2 lượt mỗi lượt chơi [ƯỚC LƯỢNG], luật gốc chưa đọc |
| Cột sáng rơi xuống nhân vật lúc vào ải | [THẤY] https://youtu.be/LyMmXTQFcq8?t=5 | chưa tìm ra hiệu ứng (`fx_landing`, `effect_reborn` đều không phải) |
| Thoại NPC sau trùm, nút SKIP | [AGENT] https://youtu.be/B9Gb2Y26Cow?t=890 | chưa kiểm khung |
| Trùm nổi giận ~40% máu | [AGENT] https://youtu.be/rNUWLt51lmA?t=50 | chưa kiểm |
| Chọn thú cưng ở sảnh | [WIKI Pets] đổi ở sảnh trước khi chọn nhân vật | web luôn dùng `pet0`; đang làm (mua bằng đá/Cá Khô, cho ăn, thân mật 50% mở kỹ năng) |
| HP thú cưng | [WIKI Pets] 10 HP, về 1 HP thì nghỉ cạnh chủ, hồi đầy 14–16 s | chưa có hệ chung; pet7/8/14/26/49 giữ `a.hp` riêng trong tệp |
| pet17, pet44 | pet44 có thể là "Full Of Fortune" (chỉ máy chủ Trung Quốc) [WIKI Pets] (phỏng đoán) | không có tên/kỹ năng trong LOC, chưa dùng |
| Kỹ năng thú cưng còn số ước lượng | `js/pets/petN.js` nhãn `[ƯỚC LƯỢNG]` | wiki chỉ cho hồi chiêu; bán kính, thời lượng nhiều con vẫn đặt tay |
| Bộ kiểm `soulknight-season-world.js` treo ở `#hs-back` | nút bị bỏ từ `292d316b` (màn chọn nhân vật dựng từ prefab); worktree HEAD cũng treo | nợ bộ kiểm, chưa sửa |
| Bộ kiểm `skills`: `alchemist concoction` hỏng | hỏng y hệt ở HEAD trước đợt 1 | lỗi có sẵn, chưa sửa |

## Mê Trận Tà Vương (lõi: js/matrix.js, STAGES động trong game.js, SK.factorsAdd)

| Phần | Tình trạng |
|---|---|
| Quái Gen (11 kiểu), nhân tố Đột Biến Gen | chưa có hệ Quái Gen; không làm đợt này |
| Cấp vũ khí (w.lvl, số xanh trên nút vũ khí, trừ sát thương khi cấp thấp) | chưa có w.lvl và HUD; không làm đợt này |
| Thiên phú 2001-2007 và 2117 | chưa có trong data/sk-buffs86.js; thiên phú sau x-2/x-5 chưa gắn (rooms.js BUFF_AFTER chỉ có 1-1..3-5 nên sau tầng 3 không còn thẻ chọn) |
| 6 nhân tố riêng của Tà Vương (Thuật Suy Yếu, Thuật Chậm Chạp, Đột Biến Gen, Kiếm Hai Lưỡi, Gen Miễn Dịch, Thuật Hồi Sinh) | chưa có; cần cộng dồn n lần (factorsAdd hiện chặn trùng khoá) và móc enemyHurtAdd ở actors.js |
| Thanh Uy Áp (HUD), NPC Con Bạc/Thương Nhân/Thầy Bói, Tước Sĩ Lục, đổi Pha Lê cuối ván | chưa có; Pha Lê mới đếm ở G.matrix.crystals |
| Trùm Tinh Anh x1,25 và Hai Lãnh Chúa x0,75 theo wiki | web dùng sẵn badass.bossHp 1,5 và DoubleBoss x0,7; matrix.js chỉ nhân thêm (1 + 0,15 P) |
| Tiến độ/vạch mốc của phán quyết | [ƯỚC LƯỢNG] tiến độ = quái hạ / quái đã sinh trong tầng, vạch = giây / 360 |

## Vườn + 47 cây trồng (sảnh bước 6: js/garden.js, data/sk-garden.js, test/soulknight-garden.js)

Làm được: 8 ô trồng (prefab gốc plant_pot_0_summer) + Bình Nước + Phân Bón + Xẻng đặt ở Khu Vườn bên trái sảnh (sàn/tường/cây của hero_room/garden/skin_0 ghép
thẳng vào nền sảnh, cùng toạ độ thế giới); trồng, tưới, bón phân, bỏ, thu hoạch, mở ô; sản phẩm vật liệu/đá/vũ khí/thiên phú/ô thiên phú/thức uống/thú cưng.

| Thiếu | Lý do / cách xử lý |
|---|---|
| 14 cây thiên phú chưa có luật ở bản web: Hương Thảo (2170 Tân Tinh Thần Thánh), Oải Hương (2171), Dương Bạc (2172), Hoa Hồng (2173), Thất Lý Hương (2174), Cỏ Cầu Vồng (2175), Quân Tử Lan (2177), Pháo (2178), Hoa Ly (2179), Nhân Sâm (2180), Hoa Đồng Đen (2181), Cây Nắp Ấm (2182), Cây Lan Pha Lê (2183), Đào Tiên (2184) | không có trong data/sk-buffs86.js và rooms.js DEF; cây trồng được, đến lúc thu báo "Thiên phú này chưa có ở bản web" và giữ nguyên cây (không mất). Tên/mô tả Việt lấy từ Buff_info_<id> |
| Nấm Pha Lê (thiên phú 15 Thợ Mỏ Đá Quý) | rooms.js đang tắt (OFF 15: web không có đá quý cuối ván), thu báo như trên |
| Lê Băng (plant_icepear) | không có prefab trong common.ab; dùng hình Hương Thảo và luật wiki (một trong Băng Kích / Tượng Băng Nổ / Vòng Sương Băng, id 1015-1017) |
| Thú cưng thứ hai | pets.js chỉ giữ một thú cưng chính (G.pet, spawn đóng kín) nên thú cưng cây (Hoa Mandala, Hoa Ăn Thịt, Bánh Ú Con) là bạn đồng hành riêng trong garden.js: bám chủ, cắn quái gần (3 / 5 / 2 sát thương, wiki); chưa có 3 viên đạn hình quạt + độc của Hoa Mandala, chưa có máu / hồi máu, chưa nhận kỹ năng pet |
| Chín Nhanh (Instant Grow) | chưa làm; giới hạn lần mỗi ô [LOC ui/one_click_plant_limit_tip] chưa rõ |
| Ô 7 (thành tựu "Tường Than Thở") | mở khi đạt thành tựu id 42 (js/ach.js); thành tựu này cần Thần Điện Thủ Hộ, web chưa có nên ô vẫn khoá trong chơi thật |
| Ô 5, 6, 8 | thanh toán giả (fakePay), không trừ tiền thật |
| Bí Đỏ "vật phẩm ngẫu nhiên" | web không có kho thuốc/bom ở sảnh: 40% vũ khí vào hòm, còn lại đá quý [ƯỚC LƯỢNG] |
| Sen Tuyết (+1 máu tối đa, +40 năng lượng tối đa) | áp một ván; chưa tính vào hạn mức thức uống vì web chưa có Máy Bán Nước Uống |
| NPC trong khu vườn gốc: Kỵ Sĩ Nghỉ Hưu, bù nhìn, giếng ước, thú hoang | không vẽ, không có tương tác (HALL.md #39); tường vườn là BoxCollider2D xoay chéo nên mặt nạ đi được của vườn lấy theo ô sàn floor_garden |
| Ngày | ngày thật (SK.profile.dayIndex); cây chỉ lớn khi ghé lại / đổi ngày, tối đa 30 đêm cộng dồn; SK.profile.shiftDay + SK.garden.debugNextDay là móc kiểm thử |

## Sổ Tay + 154 thành tựu (sảnh bước 8, js/ach.js, data/sk-ach.js, tools/achievements/build_ach.py)

Có: ô Hầm (phím E) mở Sổ Tay với tab Thành Tựu (lưới icon, tiến độ, thưởng, nút Nhận / Nhận tất cả) và tab Thống kê. 40 / 154 thành tựu tính được
(loại 1, 2, 3, 4, 7, 10, 13, 14, 16-22, 29-32, 49, 50, 53, 62, 65, 78, 79, 82, 90, 96, 102, 117, 121, 122). Thú cưng mở bằng thành tựu: pet36 (id 106),
pet28 (id 86), pet13 (id 37), pet11 (id 38); ô vườn 7 (id 42).

| Thiếu | Lý do / cách xử lý |
|---|---|
| 114 thành tựu khoá ("Chưa có ở bản web") | cần chế độ / cơ chế web chưa có: treo thưởng (5), nối máy (33, 45-48, 80, 81, 138), Thần Điện Thủ Hộ (36, 56-60, 69, 97), câu cá (54, 55), Hư Không (123-129, 140), ải 4 và ải ẩn (44, 83, 85-88, 92, 103), hồ dâng hiến, câu đố, sự kiện / emoji (74, 104, 110), Mê Trận (71-73), thí luyện nhân vật lấy skin (24-26, 35), nhiệm vụ riêng của vũ khí / nhân vật (loại 6, 8, 11, 85, 86, 89, 91, 93, 99-101, 105-109, 111-115...) |
| Loại 63 / 64 (mèo / chó thân mật) | cần phân loài thú cưng; chỉ làm loại 62, 65 (số pet thân mật tối đa) |
| Loại 7 (800 vàng trong một lần) | tính theo vàng đang giữ nhiều nhất trong ván (đo ở lúc nhặt vàng và cuối ván), không có sự kiện "nhận vàng" riêng |
| Loại 27/28/76/77 (vượt không vũ khí) | game không phát sự kiện "ván không dùng vũ khí"; để khoá |
| Loại 17-20 (hạ 500 quái mở thú cưỡi) | tiến độ đếm đúng; mở thú cưỡi do js/mounts.js, chưa nối vào thành tựu |
| Loại 0 (Eagle lover id 38, Bug id 37, boss12 id 20, AdvToturial id 43) | cần danh sách vũ khí Chim Ưng / sự kiện riêng; pet11, pet13 vẫn khoá |
| Thưởng skin (awardType 2), vé theo extraInfo (token_weapon_weapon_*, token_factor_*), bản vẽ cá, băng từ, chậu cây 3 | web chưa có đích nhận: Sổ Tay hiện "(chưa có ở bản web)", không cộng |
| Thưởng thư | thưởng nhận trong Sổ Tay, không đẩy vào Hộp Thư; thông báo khi đạt chỉ là dòng nổi trên màn |

