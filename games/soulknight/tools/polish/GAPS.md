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
| Skin nhân vật còn thiếu: (a) tư thế kỹ năng dạng clip riêng của skin (layer L2 của controller skin: lăn 8 khung của Du Hiệp skin 10, cánh Ma Cà Rồng skin 8/9, khoan Thợ Mỏ, tay Kỵ Sĩ Bí Thuật...) vẫn của skin 0 vì mã kỹ năng web không chạy layer L2; (b) đạn/hiệu ứng dạng prefab riêng của skin (420 skin có prefab đạn/hiệu ứng khác skin 0, danh sách `tools/skins/skin_prefabs.json`) chưa dựng, kỹ năng vẫn bắn prefab skin 0; (c) skin có tranh động (nhiều phần) dùng tranh skin 0; (d) skin bán bằng tiền thật hiện thanh toán giả như nhân vật, Xu mùa giải / Máy Gashapon / Hộp Mù / mảnh skin / Tiếp Tế Huấn Luyện / thành tựu chỉ hiện cách mở, chưa có đường nhận skin; 1 giá [ƯỚC LƯỢNG] (Hiệp Sĩ skin 7 "Panda": wiki chỉ ghi Cá Khô, đặt 12000 đá) | giá trong `data/skins/econ.js` từ wiki (Skinlines + Template:<Hero>_Skins); hình kỹ năng riêng chỉ đổi sprite `<tiền tố>_N_skill_...` (99 skin của 10 nhân vật, 562 tên) khi kỹ năng vẽ bằng tên skin 0 |
| AI 22 trùm mới dựng từ tên state, sự kiện clip, trường MonoBehaviour và prefab đạn; số viên/góc/tốc nhiều chỗ [ƯỚC LƯỢNG]; vài đòn chưa làm (robot king atk6, queen atk_4, boss27 atk4 giáp, boss24 thân nhiều đốt, boss16 ngựa) | chú thích từng tệp `js/bosses/*.js` | logic đòn nằm trong IL2CPP, máy này không có dump.cs / libil2cpp_mem.so; cần Waydroid để dump lại |
| Bảng luban (bể rương WG_level*, nhóm thiên phú, bàn rèn...) chưa giải được | blob `luban_config.ab` AES | khoá không tìm thấy trong metadata đã xáo; dữ liệu luban cũ trong `data/*.js` vẫn dùng |
| Năng lực riêng của 28 vũ khí thần thoại (`weapon/weapon_mythic_NN/ability`) chưa chạy; vũ khí ngoài bể rương (rèn, sự kiện) chưa có đường lấy | localization ability/attr | chờ mục lò rèn (sảnh) |
| Lợi Hại: hệ số quái (mật độ ×1,3, tinh anh 40%, trùm máu ×1,5) [ƯỚC LƯỢNG]; điều kiện mở gốc còn đòi mở hết vật phẩm Phòng Khách | [WIKI skvn Chế_Độ_Badass] +1 sát thương, trùm tinh anh; [LOC I_tip_09] | gốc không ghi số; sảnh web chưa có kinh tế vật phẩm |
| Khu Thí Luyện: số ải (15, theo nhãn map_End_BR "BR 3-5") [SUY]; trùm tầng 4 chỉ là vài ải 3-x đổi vùng (25% [ƯỚC LƯỢNG], không có tầng 4 tuỳ chọn +6 phút, thiếu trùm Tàu Ngầm / Đổng Trác / Lữ Bố...); vé Lông Vũ: 3 lông vũ tặng một lần + 2 lông vũ mỗi việc treo thưởng "thu thập" (không có Valkyrie bán trong hầm), 3 lượt/ngày; mốc kiểm thuần túy ở cổng 3-5 (gốc: 3-4 trong 13 ải); phòng phụ giữa ải vẫn theo bảng riêng | [WIKI Boss Rush, Rush to Purity, Feather of Valkyrie; LOC item/br_*] | Tàu Ngầm/Đổng Trác/Lữ Bố cần bóc rig + AI; Valkyrie NPC trong hầm cần dnpc |
| Nhân Tố Thử Thách: 36/65 nhân tố chạy; 29 nhân tố cần hệ thống chưa có (may mắn, debuff lên quái, phòng thêm, thú cưỡi, hồi sinh...) chưa đưa vào danh sách; chọn tối đa 3 [ƯỚC LƯỢNG]; chưa có bảng nhiệm vụ treo thưởng làm mới theo ngày | tools/polish/MODES.md 2c | js/factors.js |
| Tước Sĩ cuối Khu Thí Luyện: Thuần Túy làm xong (không nhân tố/thiên phú/vũ khí lạ, 12 phút, Lợi Hại 17 phút, thắng nhân đôi đá quý, trượt giảm nửa; phím 0 bỏ qua bảng thiên phú); lính e_bossrush_minion_a..d dựng từ prefab thật (Tước Sĩ gọi 3 lính / 14 s, tối đa 6, mỗi đợt +7%). Còn thiếu: chu kỳ gọi lính và đòn gọi (clip summon) của Tước Sĩ [ƯỚC LƯỢNG, AI ở js/bosses/ không sửa được], đạn riêng bullet_e_bossrush_minion_b / bullet_e_34_b (mượn bullet_e_34), Tước Sĩ Lục 4-5, kiểm "tay không" của gốc (web cho giữ vũ khí khởi đầu như wiki), kiểm đồ sảnh (Giếng Phép, tượng, nước uống: Khu Thí Luyện vốn không áp) | [LOC bossrush_intro_tips4-7; WIKI Rush to Purity] | AI Tước Sĩ thuộc agent trùm |
| Sảnh: Máy Đổi và Máy Game là khối giữ chỗ tự vẽ (nội thất web không có prefab hai món này; Máy Đổi gốc ở khu Xưởng); Két Sắt cấp 2–4 nội suy; 1 vàng = 1 đá cuối lượt [ƯỚC LƯỢNG]; bỏ 14 mục rơi có `conditions` | tools/polish/HALL.md | js/hall_use.js, js/drops.js |
| Màn tải: dòng mẹo ở 82% chiều cao (gốc 92%); thiếu kim cương quay góc phải; font pixel `zpix` không có trong bundle (đang dùng Be Vietnam Pro) | [THẤY] https://youtu.be/LyMmXTQFcq8?t=2 | nhỏ, chưa sửa |
| Số lượt "Đổi 1 đợt" | nút gốc ghi (2/2) | web: 2 lượt mỗi lượt chơi [ƯỚC LƯỢNG], luật gốc chưa đọc |
| Cột sáng rơi xuống nhân vật lúc vào ải | [THẤY] https://youtu.be/LyMmXTQFcq8?t=5 | chưa tìm ra hiệu ứng (`fx_landing`, `effect_reborn` đều không phải) |
| Thoại NPC sau trùm, nút SKIP | [AGENT] https://youtu.be/B9Gb2Y26Cow?t=890 | chưa kiểm khung |
| Trùm nổi giận ~40% máu | [AGENT] https://youtu.be/rNUWLt51lmA?t=50 | chưa kiểm |
| Chọn thú cưng ở sảnh | [WIKI Pets] đổi ở sảnh trước khi chọn nhân vật | web luôn dùng `pet0`; đang làm (mua bằng đá/Cá Khô, cho ăn, thân mật 50% mở kỹ năng) |
| HP thú cưng | [WIKI Pets] 10 HP (max_hp riêng theo prefab), máu không xuống dưới 1, về 1 HP thì nghỉ cạnh chủ không đánh, hồi đầy sau 14–16 s: ĐÃ CÓ hệ chung `SK.petHp` ở pets.js (pet7/8/14/26/49 đã chuyển; pet52 giữ `ownHp`, pet3 `keep`); đạn quái trúng hộp thân thì trừ máu | còn thiếu: quái vẫn chỉ nhắm chủ nên cận chiến / vùng nổ của quái không trúng pet; hồi dần trong trận (wiki: tốc độ không rõ); Pet Food +10 HP, Pet Buff +9 HP / nghỉ nửa; thanh máu (wiki: pet thường không hiện) |
| pet17, pet44 | pet44 có thể là "Full Of Fortune" (chỉ máy chủ Trung Quốc) [WIKI Pets] (phỏng đoán) | không có tên/kỹ năng trong LOC, chưa dùng |
| Kỹ năng thú cưng còn số ước lượng | `js/pets/petN.js` nhãn `[ƯỚC LƯỢNG]` | wiki chỉ cho hồi chiêu; bán kính, thời lượng nhiều con vẫn đặt tay |
| Bộ kiểm `soulknight-season-world.js` treo ở `#hs-back` | nút bị bỏ từ `292d316b` (màn chọn nhân vật dựng từ prefab); worktree HEAD cũng treo | nợ bộ kiểm, chưa sửa |
| Bộ kiểm `skills`: `alchemist concoction` hỏng | hỏng y hệt ở HEAD trước đợt 1 | lỗi có sẵn, chưa sửa |

## Mê Trận Tà Vương (lõi: js/matrix.js, STAGES động trong game.js, SK.factorsAdd)

| Phần | Tình trạng |
|---|---|
| Quái Gen (11 kiểu), nhân tố Đột Biến Gen | đã có (js/matrix2.js): 9 kiểu, tỉ lệ [ƯỚC LƯỢNG] 5% + 1%/P (trần 50%) + 2%/lần Đột Biến Gen. Thiếu: Thần Thánh chỉ miễn burn/poison (web chưa có trạng thái khác), Khiên chưa chặn đạn tầm xa (chỉ hấp thụ sát thương 30% HP), Sức Mạnh/Nhanh Nhẹn đổi sát thương chỉ khi nguồn đòn trong 44 px (đạn bay xa không tính), Hút HP chỉ hồi cho quái; không có hình riêng ngoài viền màu dưới chân |
| Cấp vũ khí (w.lvl, số xanh trên nút vũ khí, trừ sát thương khi cấp thấp) | đã có: w.lvl = P lúc cầm lần đầu, mất floor((P - lvl)/2) sát thương, số cạnh nút vũ khí; [ƯỚC LƯỢNG] cả cấp khởi đầu lẫn công thức. Nâng cấp qua Con Bạc (50%, nửa vàng) và Thương Nhân (1-3 Pha Lê) ở js/matrix3.js; chưa có cách nâng riêng phụ kiện vũ khí / vũ khí phân thân Sát Thủ (web chưa gắn w.lvl cho chúng) |
| Thiên phú 2001-2007 và 2117 | đã có (js/matrix3.js, tên Việt tự đặt vì LOC không có Buff_name_2001-2007/2117). [ƯỚC LƯỢNG]: xác suất kích Xích Điện 20% / choáng 30% / hồi 0,25 s, Gai Băng 20% / đóng băng 25% / sát thương gai 2, tỉ lệ thẻ riêng trong bộ 3 là 50%; 2117 chỉ chặn đạn có chữ lửa/sét/độc/băng trong tên và bọt độc Quái Gen vì người chơi web chưa có trạng thái nguyên tố (sàn lửa/độc, tia nguyên tố không chặn); 2006 chỉ gỡ nhân tố xấu đã mang (không tạm tắt); nút đổi bộ thẻ vẫn chen lại thẻ riêng; 2007 cộng dồn khi chọn lại bằng chuột (ROOMS.pick) lẫn phím số |
| 6 nhân tố riêng của Tà Vương | đã có, cộng dồn tối đa 10 (factors.js, ẩn khỏi Object.keys(SK.FACTORS)); Thuật Hồi Sinh chỉ giữ cờ (một người chơi). Thời gian trạng thái ×0,5^(Peff/3) [SUY] chỉ áp cho burn/poison |
| Thanh Uy Áp (HUD), đổi Pha Lê cuối ván | đã có (matrix2.js); phiếu Nhân Tố/phụ kiện/Vé dùng thử và 2% còn thiếu đổi thành 100 đá, 1 lượt tung mỗi Pha Lê [ƯỚC LƯỢNG]; chữ kết quả nối vào màn thua, hộp tóm tắt ở sảnh (lobby.js) chưa liệt kê phần Pha Lê |
| NPC Con Bạc/Thương Nhân/Thầy Bói | đã có (js/matrix3.js, prefab gốc npc_gambler/seller/prophet qua tools/extra/matrix.json; vẽ khung tĩnh vì 3 prefab trùng tên clip anim/idle): ở phòng khởi đầu x-1 từ tầng 2, xác suất 1/3 [ƯỚC LƯỢNG từ trọng số 2/6], Thầy Bói chỉ từ 4-1, mỗi NPC dùng một lần. Con Bạc: nửa vàng, 50% +1 cấp vũ khí, thua cho 1 bình máu/năng lượng (web không có Thuốc viên). Thương Nhân: 1-3 Pha Lê (bốc lúc dựng) +1 cấp. Thầy Bói: 1 Pha Lê, cấm 1 nhân tố tiêu cực khỏi phán quyết 5 ải kể từ ải kế (không gỡ nhân tố đã mang). Điều kiện loại 12 của Thầy Bói và lượng NPC mỗi phòng không có nguồn; chưa có hộp hỏi xác nhận (bấm E là mua) |
| Tước Sĩ Lục (boss_fel_lord) | chưa làm: prefab Level/others/boss_fel_lord (bundle levelobjects) là rig sprite (45 SpriteRenderer + Animator, 2 bản sao fel_lord_clone1/2), KHÔNG phải Spine; AI nằm ở BossFelLord + FelLordBrain + PlayMakerFSM nên chưa đọc được chiêu thức; cần dựng rig + AI riêng, rơi 3 Pha Lê (4 Lợi Hại), giảm 30% thanh Uy Áp |
| Trùm Tinh Anh x1,25 và Hai Lãnh Chúa x0,75 theo wiki | đã có (matrix3.js): ở Mê Trận đổi hệ số Lợi Hại 1,5 thành 1,25 và DoubleBoss 0,7 thành 0,75; HP_FACTOR 1,2 của bosses.js vẫn nhân (web riêng) |
| Tiến độ/vạch mốc của phán quyết | [ƯỚC LƯỢNG] tiến độ = quái hạ / quái đã sinh trong tầng, vạch = giây / 360 |

## Vườn + 47 cây trồng (sảnh bước 6: js/garden.js, data/sk-garden.js, test/soulknight-garden.js)

Làm được: 8 ô trồng (prefab gốc plant_pot_0_summer) + Bình Nước + Phân Bón + Xẻng đặt ở Khu Vườn bên trái sảnh (sàn/tường/cây của hero_room/garden/skin_0 ghép
thẳng vào nền sảnh, cùng toạ độ thế giới); trồng, tưới, bón phân, bỏ, thu hoạch, mở ô; sản phẩm vật liệu/đá/vũ khí/thiên phú/ô thiên phú/thức uống/thú cưng.

| Thiếu | Lý do / cách xử lý |
|---|---|
| 14 cây thiên phú 2170-2184: luật đã làm ở js/plantbuff.js (test/soulknight-plantbuff.js, 64 kiểm). Chỗ còn thiếu: tên buff Việt, số của Lightning Bolt / Arbitrary Strike / Monkey Pack và nhiều số phụ là [ƯỚC LƯỢNG] (ghi ở TL trong tệp); biểu tượng dùng chung ui_buff_x (chưa có khung ui_buff_217x trong atlas); Không Quân Chi Viện tự gọi khi đang đánh nhau vì web chưa có biểu cảm Kính Râm, lính vẽ bằng hình Anh Hùng Mặt Nạ / Babalu / Kỵ Sĩ Hoàng Gia, không nhảy từ máy bay xuống; Bầy Khỉ gọi lúc đang đánh nhau (hồi 20 s) vì mô tả không nói khi nào; Đả Kích Linh Hồn và Đòn Tùy Ý tính cả đòn của thú cưng chính (pets.js chưa gắn nhãn đòn); Tân Tinh không hồi máu cho thú cưng (không có máu); Sao Chép Vũ Khí bỏ qua vũ khí cận chiến, vũ khí tụ lực và lớp tự viết (CUSTOM_FIRE); chưa có thanh hiện giai đoạn của Hấp Thụ Sát Thương như biểu tượng tạm gốc (chỉ số nhỏ trên đầu) |
| Nấm Pha Lê (thiên phú 15 Thợ Mỏ Đá Quý) | đã có luật ở rooms.js (cuối ván đá quý ×1,25); mọi cây buff của vườn đều thu được |
| Lê Băng (plant_icepear) | không có prefab trong common.ab; dùng hình Hương Thảo và luật wiki (một trong Băng Kích / Tượng Băng Nổ / Vòng Sương Băng, id 1015-1017) |
| Thú cưng thứ hai | thú cưng cây (Hoa Mandala, Hoa Ăn Thịt, Bánh Ú Con) là bạn đồng hành riêng trong garden.js, dùng chung hệ máu `SK.petHp`: Mandala 10 HP bắn 3 viên quạt 3 sát thương, độc khi bạo kích (debuff poison của skills.js); Ăn Thịt 15 HP cắn 5 (8 khi bạo kích), thanh máu hiện; Bánh Ú 10 HP bắn loạt 3 lá x 3 sát thương cách 0,1 s [WIKI trang từng cây] | còn thiếu: xác suất bạo kích 20%, góc quạt 0,3 rad, tầm bắn 6 đv [ƯỚC LƯỢNG]; màu lá Súng Bánh Ú (đốt / điện / băng / jackpot); Mandala bay qua khối; Buff Shotgun / Chính Xác / Pet; chưa nhận kỹ năng pet chính, G.pet vẫn chỉ một con |
| Chín Nhanh (Instant Grow) | chưa làm; giới hạn lần mỗi ô [LOC ui/one_click_plant_limit_tip] chưa rõ |
| Ô 7 (thành tựu "Tường Than Thở") | mở khi đạt thành tựu id 42 (js/ach.js); thành tựu này cần Thần Điện Thủ Hộ, web chưa có nên ô vẫn khoá trong chơi thật |
| Ô 5, 6, 8 | thanh toán giả (fakePay), không trừ tiền thật |
| Bí Đỏ "vật phẩm ngẫu nhiên" | web không có kho thuốc/bom ở sảnh: 40% vũ khí vào hòm, còn lại đá quý [ƯỚC LƯỢNG] |
| Sen Tuyết (+1 máu tối đa, +40 năng lượng tối đa) | áp một ván; chưa tính vào hạn mức thức uống vì web chưa có Máy Bán Nước Uống |
| NPC trong khu vườn gốc: Kỵ Sĩ Nghỉ Hưu, bù nhìn, giếng ước, thú hoang | không vẽ, không có tương tác (HALL.md #39); tường vườn là BoxCollider2D xoay chéo nên mặt nạ đi được của vườn lấy theo ô sàn floor_garden |
| Ngày | ngày thật (SK.profile.dayIndex); cây chỉ lớn khi ghé lại / đổi ngày, tối đa 30 đêm cộng dồn; SK.profile.shiftDay + SK.garden.debugNextDay là móc kiểm thử |

## Sổ Tay + 154 thành tựu (sảnh bước 8, js/ach.js, data/sk-ach.js, tools/achievements/build_ach.py)

Có: ô Hầm (phím E) mở Sổ Tay với tab Thành Tựu (lưới icon, tiến độ, thưởng, nút Nhận / Nhận tất cả) và tab Thống kê. 64 / 154 thành tựu tính được (đợt 2: xem dòng 90 thành tựu khoá bên dưới; bộ đếm đọc sự kiện bounty, defenceWaveClear, towerPham, matrixVerdict, voidShieldBreak, stageEnter, roomLock, fire, mercTrain và runEnd). Trước đó 40 mục
(loại 1, 2, 3, 4, 7, 10, 13, 14, 16-22, 29-32, 49, 50, 53, 62, 65, 78, 79, 82, 90, 96, 102, 117, 121, 122). Thú cưng mở bằng thành tựu: pet36 (id 106),
pet28 (id 86), pet13 (id 37), pet11 (id 38); ô vườn 7 (id 42).

| Thiếu | Lý do / cách xử lý |
|---|---|
| 90 thành tựu còn khoá ("Chưa có ở bản web"); 24 mục đã mở đợt 2 (id 9-11 treo thưởng, 28-31 thí luyện nhân vật Berserker / Robot và không bắn, 39 Ku, 40-42 chặn 8/16/24 đợt, 74 tháp tối đa, 87 Uy Áp 20, 89 5 lần làm tốt lắm, 99 vào ải 4, 124 tùy tùng cấp tối đa, 125 cưỡi thú vượt ải, 126 tùy tùng + thú cưng 6, 140-142 / 145 / 146 / 157 Hư Không) | còn thiếu: nối máy (33, 45-48, 80, 81, 138: web không có nhiều người chơi); Thần Điện Thủ Hộ thiếu mỏ vàng, cường hóa vũ khí Đỏ +15, Tàu Ngoài Hành Tinh, kết giao Khí Tông, đấu Kiếm Tông (36 loại 33, 72, 73, 75, 76, 85, 113); Mê Trận thiếu cứu đồng đội (88); Hư Không thiếu nâng thiên phú, thay dòng thuộc tính, Con Thoi, Đạo Tặc... (143, 144, 147); câu cá / vớt rác (54, 55); ải 4 thiếu Sâu Băng, Gai Băng, phòng ẩn, Bao Tay Bão, phòng thí luyện ẩn, Hành Lang Chiến Trường Cổ (44, 48, 101, 103, 108, 120, 152); ải đáy biển thiếu oxy (128, 129 loại đáy biển); hồ dâng hiến, câu đố, ải ẩn, emoji, tuần, Khu Thí Luyện Thuần Túy (92, 93); nhiệm vụ riêng của vũ khí / nhân vật cần cơ chế riêng (6, 8, 11, 12, 13, 15, 19, 27, 77, 91, 100, 102, 105, 107, 109-111, 114-116, 118, 121, 122, 130-137, 148-156) |
| Loại 63 / 64 (mèo / chó thân mật) | cần phân loài thú cưng; chỉ làm loại 62, 65 (số pet thân mật tối đa) |
| Loại 7 (800 vàng trong một lần) | tính theo vàng đang giữ nhiều nhất trong ván (đo ở lúc nhặt vàng và cuối ván), không có sự kiện "nhận vàng" riêng |
| Loại 27/28 (vượt không vũ khí, id 30/31) | mở: ván thắng mà sự kiện 'fire' của người chơi chưa phát lần nào (kỹ năng, thú, tùy tùng vẫn được dùng); loại 76/77 (Thí Luyện Thuần Túy) vẫn khoá |
| Loại 17-20 (hạ 500 quái mở thú cưỡi) | tiến độ đếm đúng; mở thú cưỡi do js/mounts.js, chưa nối vào thành tựu |
| Loại 0 (Eagle lover id 38, Bug id 37, boss12 id 20, AdvToturial id 43) | cần danh sách vũ khí Chim Ưng / sự kiện riêng; pet11, pet13 vẫn khoá |
| Thưởng skin nhân vật (awardType 2: id 10, 46, 75, 127...), vé theo extraInfo (token_weapon_weapon_*, token_factor_*), bản vẽ cá, băng từ, chậu cây 3 | web chưa có đích nhận: Sổ Tay hiện "(chưa có ở bản web)", không cộng |
| Thưởng thư | thưởng nhận trong Sổ Tay, không đẩy vào Hộp Thư; thông báo khi đạt chỉ là dòng nổi trên màn |


## Thú cưỡi sinh vật (Bước C, js/mounts.js + js/rooms.js fillMount; kiểm: test/soulknight-mounts.js)
Có: 9 sinh vật bán ở Thương Nhân Thú Cưỡi trong phòng đặc biệt (bày 3 con), p.mount nhận sát thương trước người, vỡ thì gỡ và chặn phần dư, lên/xuống bằng E, kỹ năng bị khoá khi cưỡi, qua tầng hồi floor(hpMax/2) (Kỹ Sư đầy), buff Thú Cưng +50% máu, Badass +2/+3, tốc speedRate, con bỏ lại trên đất cưỡi lại được.

| Thiếu | Lý do / cách xử lý |
|---|---|
| Nâng cấp ★ cơ giáp ở Thương Nhân Vật Chở | Bước D (còn lại) |
| Hệ mở khoá thú (mboar2, mcristal, mspider, mvaken cần `type 8`) | web chưa có kho mở khoá thú: cả 9 con luôn nằm trong quầy |
| Vũ khí gắn của thú (Va Đập, Gai Băng, Nổ Tung, Kim Độc; húc của Bazinga bodyDamage 6) | dữ liệu có trong sk-mounts.js nhưng chưa nối đòn; thú chỉ đỡ đòn và tăng tốc |
| Trọng số phòng thú cưỡi so với tượng / giếng / lồng nhốt (25) và số ô bày (3), giá tăng theo tầng | ƯỚC LƯỢNG: dữ liệu đọc được chỉ có 4 : 2 trong mount_seller |
| Lồng nhốt thú cưỡi (cage_mount), phòng khởi đầu của Beastmaster | chưa làm |
| Bình máu và Giao Ước Hồi Sinh hồi cho thú; Hơi Thở Thần Chết không chuyển vào thú | wiki gọi là lỗi thiết kế; chưa làm |
| "Không lên được khi đang đánh nhau"; kỹ năng bị động vẫn chạy; kỹ năng đang chạy khi lên vẫn còn | chưa chặn lên lúc phòng khoá; kỹ năng chủ động chỉ bị khoá lúc bấm |
| Buff chặn đòn (Khiên Kỵ Sĩ Thánh...) | thú đỡ trước nên các buff này không kích khi đang cưỡi |
| Hình mhorse/mIceMonkey/mDungBeetle/m_morph | lấy clip ide/run của prefab; người ngồi nhấc 6 px, chưa chỉnh điểm ngồi theo từng con |

## Xâm Nhập Hư Không độ 1 (js/void.js, rev 20261010k)
- Đã làm: Tinh Anh 3 tầng khiên × 80 (đòn nào cũng 1), Thủ Vệ/Ảnh Vệ/Linh Vệ với cách phá riêng, Đạo Tặc, trùm Hư Không 600/1200/1800, Xu Ám Tinh + Mắt (cộng thẳng vào G.void, hiện ở góc HUD, không có vật nhặt rơi), màn kết thúc.
- Hình quái: prefab gốc e_void_guard/assassin/mage/thief + boss_void dựng qua tools/extra/void.json. Khiên và vệt báo vẽ bằng canvas (VoidShield.prefab chưa dựng).
- Số [ƯỚC LƯỢNG] (wiki không ghi): xác suất phòng có Tinh Anh 50% / Đạo Tặc 18%, thời gian báo trước/lao/nghỉ, khung 0,5 s khiên biến mất của Ảnh Vệ, bán kính thiên thạch 22 px, tốc Cầu Lửa, Xu rơi khi hạ Hư Không 3-5 (200), tầng cuối vỡ thì Tinh Anh ở lại đánh [SUY]. Đòn của trùm Hư Không chỉ là quạt + vòng đạn bullet_e_3.
- Đã làm thêm (void.js): Rãnh Nứt (chỉ khi phòng đang khoá; 1 máu mỗi lần bước vào, 2 ở độ 2; không chặn đạn; vẽ bằng canvas, VoidRift.prefab chưa dựng; nhịp 5-9 s, tồn tại 6 s, bán kính 13 px là [ƯỚC LƯỢNG]); Thương Nhân Hư Không (x-3 và x-5, góc dưới-trái phòng khởi đầu, 30 Xu bốc 3 thiên phú chọn 1; bể là bể thiên phú thường của ải kế vì danh sách "nâng cấp được" do mã gốc sinh, chưa có bản nâng cấp riêng); Nhà Ngân Hàng (6 phép đổi theo wiki, đặt ở phòng đặc biệt còn trống nên không phải ván nào cũng gặp); Nhà Sưu Tầm (ở 3-5 vì web chưa có 4-6; 3 món mỗi món 1 Mắt, làm mới 1 Mắt; bể thay bằng vũ khí / 20 đá quý / bình vì bản vẽ, mảnh tiến hóa, hạt giống chưa có ở web). Hình NPC vẽ canvas (prefab chưa dựng, tên prefab Thương Nhân không có trong manifest).
- Chưa làm: Thương Nhân Rãnh Nứt, Con Thoi, Tiên Tri, dòng thuộc tính vũ khí, "quái thường tăng HP", Hai Lãnh Chúa chỉ nhân máu trùm Hư Không (không đụng trùm chính), khung bạc hồ sơ khi thắng độ 1, thiên phú 3001-3007 (độ 2-3), Mắt Hư Không chưa dùng ở Tiên Tri, Rãnh Nứt chưa tránh được bằng Pet/Tuỳ tùng (không có nguồn).


## Sảnh bước 7 + 9 (js/hall_ext.js; kiểm: test/soulknight-hall4.js)
Có: bản vẽ nội thất (Máy Nước, Hồ Cá, Giếng Phép Thuật, Tượng) quyết định món dùng được (chưa nghiên cứu: vẽ mờ trong khung "Cần bản vẽ"); Máy Nước (đồ uống 11 loại, tối đa 3 ly mang vào ván); Hồ Cá (câu cá bấm Thu Cần, cá = vũ khí 1 ván); Giếng Phép Thuật ở Vườn (Cầu Năng Lượng 8 -> 9); Tượng Tín Ngưỡng (300 +100/lần, tối đa 1300, kích hoạt khi dùng kỹ năng); Cảnh Sát (treo thưởng đánh bại / thu thập dùng SK.FACTORS, thưởng đá + vật liệu, độ khó "khó" thưởng bản vẽ nội thất). Hồ Cá vốn nằm ngoài tầm với của hàng sàn cuối: kéo vùng tương tác lên sàn (hall.js BOX_FIX).

| Thiếu | Lý do / cách xử lý |
|---|---|
| Trang trí sảnh (hall_skin_*; bộ 2 = 5000 đá, bộ 1/3/4/5 mã 15) | hall skin_2 không dựng bằng tilemap như skin_0 (không có floor_lobby: nền là sprite, collider và vị trí món khác): cần bộ dựng nền + mặt nạ đi được + `<ô>_2` riêng; chưa làm, không có UI mua để khỏi bán thứ không đổi hình |
| Vật liệu dựng nội thất | nghiên cứu bản vẽ ở Bàn Thiết Kế trừ theo [CFG] (3000 đá...); bản wiki cũ (Giếng 300 đá) không trừ thêm lần hai |
| Nguồn bản vẽ nội thất | gốc chưa rõ; web cho rơi từ treo thưởng "khó" của Cảnh Sát [ƯỚC LƯỢNG] |
| Số cộng và giá đồ uống, bảng cá, chỉ tiêu và thưởng treo thưởng, 3 việc mỗi ngày | [ƯỚC LƯỢNG] (config không có); đồ uống sảnh "hiệu quả gấp đôi" nên số cộng gấp đôi con số trong ải (Sữa Bò không nhân đôi) |
| Điều kiện Sữa Bò (Defence > 1) và Nước Ép Tỏi (MaxHp > 1) trong bảng ra | bỏ điều kiện, luôn có trong bể |
| Nhiệm vụ hộ tống; Nước Lãng Quên; Giếng có Người Ếch (frogManProbability) và điểm câu cá của Giếng | cần NPC hộ tống / hệ thiên phú gần nhất / câu cá ngoài sảnh |
| Thành tựu "treo thưởng 1/10/100" (ach loại 9-11) | sự kiện `bounty` đã phát (SK.emit('bounty', G, việc)) nhưng js/ach.js chưa đếm |

## Tầng 4A (ải mở rộng sau 3-5; js/floor4.js, js/bosses/boss_warlord.js, test/soulknight-floor4.js)

Đã làm: Kẻ Vượt Ranh Giới sau trùm 3-5 (trả 100 vàng hoặc 1 HP tối đa, miễn phí khi chơi chính nhân vật transcendent, vắng khi Mộng Du), cổng tím `transfer_gate_extendedLevel`, chủ đề `monolith` (level/4/a: 7 quái e_stone_* + tinh anh, sàn RB_Floor, tường wall_MMR, thư viện vật cản), 5 ải 4-1..4-5 với trọng số quái của map_A16..A20, trùm 4-5 Hulala-Moli (3 con vật, mỗi con 1/3 máu).

| Còn thiếu | Ghi chú |
|---|---|
| Trùm `boss_stone_man` (Tổ Tiên) và `boss_stone_dragon` (Vụ Ảnh Long) ở 4-5; `boss_monolith_lower` (Chân Tổ Tiên) ở 4-3 | stone_man/stone_dragon là rig Spine + MeshRenderer (bundle có .skel/.atlas), web không có bộ vẽ Spine; monolith_lower không có Animator. Bể 4-5 hiện chỉ có Hulala (`F4.BOSSES45` tự thêm khi có AI). 4-3 chưa có trùm (stage.boss chỉ ở 4-5) |
| AI quái 4A viết lại từ mô tả, mượn EnemyAI02/03/04 (p rỗng trong dữ liệu, logic ở IL2CPP) | Chiến Binh không cưỡi quái (cơ chế `mount` chưa có), skill_1..5 của Ngựa/Bò/Xe không chạy; Đá Thô tự phá hồi 60 (Tinh Anh 85) [WIKI] đã làm |
| 4-1 không có bụi rậm tàng hình, lốc xoáy, dân làng Gilley/Gourley/Harley, cầu giữa phòng, phòng ẩn MMR; sàn/tường ghép đơn giản (4 khung RB_Floor_{1,2}_{9,16} + wall_MMR) | bộ dựng RFloor/RWall/RMountainSubBuilderMMR nằm trong IL2CPP; phòng dùng mẫu của tầng 3 (patternroom không có mẫu level3) [SUY] |
| Thiên phú sau 4-2 | `BUFF_AFTER` ở js/rooms.js:1678 chỉ tới '3-5': thêm '4-2' vào mảng đó. Cổng tím vẫn phát `portalEnter` của 3-5 nên bốc thiên phú 3-5 chạy như cũ |
| Ải kết 4-6 (Đá Phép), nhạc tầng 4, Gian Thương ở 4-3/4-5 | hết 4-5 là thắng (như 3-5 trước đây) |
| Hulala: sát thương/tốc/số viên [ƯỚC LƯỢNG]; Tinh Anh 2250 do hệ số Lợi Hại chung; chưa có bầy ngựa/bò/xe đỗ sẵn ở phòng và cảnh nhảy sang con khác | `ent.hp = 1500` đặt trong boss_warlord.js (config 999999 giữ chỗ), HP_FACTOR 1,2 ra đúng 1800 wiki |
| 4B Chiến Trường Cổ, 4C Đáy Biển (oxy) | xem FLOOR4.md mục 8 bước 3-4. build_sk.py chưa thêm level/4/b, level/4/c |

## Tầng 4B Chiến Trường Cổ (js/floor4.js, js/world.js b43, test/soulknight-floor4.js mục 7)

Đã làm: chủ đề `battleground` (build_sk.py `level/4/b.ab`; sàn cỏ gr_21/gr_22/RB_Floor_4, tường prefab wall_AB, nền #70822f, 6 quái e_mob0..5 + tinh anh), bốc quái theo trọng số map_B16..B20 (getter `th.enemies` trong floor4.js, game.js không phải sửa), máu quái theo wiki (config 16 giữ chỗ), cổng tím bốc 4A/4B cùng trọng số (`SK.floor4.force` ép vùng cho bộ kiểm), 4-3 dựng r4b_long rồi r4b_big_* xếp dọc một cột (pts 35000/40000 trong dữ liệu đổi thành 30/24 [ƯỚC LƯỢNG]).

| Còn thiếu | Ghi chú |
|---|---|
| Trùm 4-5 của 4B (Đổng Trác, Vũ Khí Cuối Cùng 01) và trùm 4-3 (Lý Thôi, Hoa Hùng) | chưa bóc rig vào sk-bosses86 (build_bosses86.py) và chưa viết AI; 4-5 của 4B mượn bể trùm 4A (Hulala) |
| AI quái 4B viết lại từ mô tả, mượn EnemyAI02/03/04 (AIBrain, p rỗng, logic IL2CPP) | Địa Lôi không nổ mìn, Bắt Lưới không có lưới, Lính Quạt/Cung chưa có đạn riêng, Tinh Anh chưa đổi hình/kèn Trumpet (vẫn phình 1,25) |
| 4-3 đặc biệt: rào/ô tăng tốc có sẵn trong mẫu nhưng quái chưa đứng nhóm sau rào, 3 hướng sau phòng 2 (Thầy Hướng Dẫn / trùm / Thương Nhân Thần Bí) | web dùng bố cục start-dài-vuông-end chuẩn |
| HUD riêng của 4B | FLOOR4.md không nêu HUD riêng cho 4B (HUD riêng chỉ có ở 4C: oxy) |
| Sàn đá lâu đài (4B_RB_FloorTile_1..3) sau hành lang 4-3, nhạc 4B | chỉ dùng sàn cỏ |

## Cơ giáp (Bước D, rev 20261010m + 20261010zb)
- Đã làm cả 14 cơ giáp có prefab trong `common` (m_mech_0..7, 9, coin, engineer, m_mecha_normal_b/d/e/2s): vẽ nguyên prefab gốc (`tools/extra/mech.json`, `js/mechs.js`), HP/giáp/tốc theo `data/sk-mounts.js`, vũ khí gắn thay ô vũ khí, vỡ nổ hpMax, xuống trả vũ khí. 12 giáp bán được vào quán Thương Nhân Vật Chở (giáp có bản vẽ chỉ khi `SK.profile.devd`). m_mech_9/coin/engineer không bán (chỉ qua `SK.mountOn`).
- Nút Phụ (phím kỹ năng) đã có: Tạm Biệt Thế Giới của m_mech_0 (nổ 50 rồi mất giáp) và m_mech_engineer (199), Vụ Nổ Tròn của m_mech_2 (5 sát thương, xoá đạn địch, hồi 4 s). Tầm nổ 4 ô và 3 ô là [ƯỚC LƯỢNG]; "mất giáp sau Tạm Biệt Thế Giới" suy từ tên, chưa xác nhận.
- Vũ khí gắn dùng bộ đạn vũ khí web gần nhất (pulse, bazooka, pincer, rocket_fireworks, smg_m2, arbitrator, broadsword, assault_rifle, m4, smg_m3, blaster, assault_sniper_rifle), số dmg/tiêu/crit từ prefab; hình đạn không phải đạn gốc của `arm_*` [ƯỚC LƯỢNG].
- WiFi Booster (m_mech_4): 3 súng lơ lửng tự bắn quái gần nhất trong 9 ô, 4 sát thương mỗi 0,4 s, miễn năng lượng, giữ vũ khí người chơi [ƯỚC LƯỢNG nhịp bắn]; chưa có đòn đặc biệt nâng cấp.
- Chưa làm: nâng cấp ★ ở Thương Nhân Vật Chở (prefab `*_update` có, chưa đọc), xuyên vật cản của m_mech_6/7, đòn thứ hai (Lưới Điện Từ, Phân Giải, Missile, Pháo Hoa nút riêng), Hellfire Chariot (m_mech_7 chưa chắc là nó), đòn đấm đúng clip, Tạm Biệt Thế Giới nút Phụ riêng ngoài phím kỹ năng, buff Thú Cưng +50% sát thương nổ, m_mech_8 và m_mech_paladin* (không/chưa có prefab dùng được), giá cơ giáp theo tầng.
- Độ nhấc người ngồi (`lift`) và bố cục lấy trực tiếp từ prefab; giáp lớn (m_mecha_normal_*) nhấc 26 px chỉnh bằng mắt.

## Chỉ Huy Nhỏ (lõi: js/troop.js, thẻ chế độ trong lobby.js, kiểm: test/soulknight-troop.js, rev 20261010o)
- Lõi (rev 20261010o): người chơi là pet (HP 3, giáp 1, NL 160, cắn 5, đạn trúng pet đổ lên lính gần nhất [ƯỚC LƯỢNG]), cờ 5 cấp 2/3/4/5/6 lính và 0/1/3/5/7 xu, thuê 17 anh hùng 4 xu, hợp nhất ở lần thuê thứ 3 cùng loại (bản nâng gấp đôi HP/giáp/chí mạng), rương trắng/nâu/lam/vàng 2/3/4/5 xu (nâng 3/6/9), Mèo May Mắn, Thầy Huấn Luyện làm mới 1 xu, xu dọn phòng 1 / trùm 3, hồi sinh khi dọn phòng (1/10 máu), qua cổng hồi đầy, thua khi hết lính, Túi Chữa Trị thay kỹ năng anh hùng.
- Ảnh thẻ chế độ: không tìm thấy ảnh Chỉ Huy Nhỏ trong common/ui (regex troop chỉ ra ảnh Đại Đại Chỉ Huy) nên dùng mode_level.png.
- Đợt 2 (js/troop2.js ?v=20261010zc, kiểm test/soulknight-troop.js 85 ĐẠT): kỹ năng riêng của 16 anh hùng (bản rút gọn dựng từ mô tả wiki vì kỹ năng người chơi gắn G.player; mọi số sát thương/tầm/thời gian [ƯỚC LƯỢNG], chỉ hồi chiêu theo wiki; Tu Sĩ Rừng hồi chiêu ∞ nên không dùng), Còi (nút L: Tập hợp lính về cạnh pet / Hành động lính tự đuổi quái), 5 ô vũ khí pet (nút K đổi vũ khí; Cắn + Pha Lê Đóng Băng 50 NL / Túi Chữa Trị 60 / Máy Tạo Lực Trường 70 / Máy Hồi Sức Tim Phổi 100 NL; hồi chiêu 8/15/12/20 s [ƯỚC LƯỢNG]; vũ khí mang theo để đưa cho lính), quầy rượu (2 thức uống 2 xu: Rượu +10 HP, Nước Dừa +4 giáp, Sữa +1 Phòng Thủ, Bloody Mary +8 chí mạng, Cà Phê +10% công tốc, Soda -10% hồi chiêu; 1 vũ khí 0/1/2/3 xu theo phẩm; Tư Chất Lính Thuê 1 xu nâng phẩm tối đa từ lam lên tối đa đỏ [ƯỚC LƯỢNG: trần 6]; Mực Xào 0 xu; Phục vụ làm mới 1 xu), đưa vũ khí cho lính (từ chối nếu quá phẩm), thùng rác, cúp Đồng/Bạc/Vàng (mục tiêu theo LOC season/troop/*, lưu localStorage `sk.troop.v1`, hiện ở cuối ván).
- Chưa làm: thiên phú 3 xu ở quầy rượu (web chưa có API thiên phú gắn lính), thức uống/tượng chỉ áp cho pet, vũ khí khởi đầu rương là Còi (Còi luôn có sẵn, không chiếm ô), loại vũ khí mỗi anh hùng ưa (troop/weapon_unfit), hồi chiêu pet kéo dài khi dùng trong trận, Túi Chữa Trị cho cả đồng hành, vũ khí drone/Kèn/Thẻ Cào của pet, đòn nút phụ vũ khí pet, bình HP/NL cho lính x10, hồi sức tim phổi niệm trong lúc đánh có thể bị ngắt, xu từ mỏ vàng/rương xám/Tinh Anh, phòng ít hơn của chế độ (x-1, x-2 một phòng), quái hung hãn hơn, chỉ số lính theo phẩm chất khác thiên phú, cúp Vàng cần Lợi Hại thật (dùng G.badass), thưởng cúp (pet Officer Chilly, bản vẽ).
- Lỗi cũ của game.js (ngoài phạm vi): `fillEnd('sk-win-info')` gọi runEnd với `won: id === 'sk-win'` nên `info.won` luôn false; troop2.js đọc G.state === 'victory' để vượt qua.
- Giá hợp nhất: tính 4 xu như thuê thường; hợp nhất cho phép cả khi đã đầy chỗ vì số lính giảm [ƯỚC LƯỢNG].

## Thần Điện Thủ Hộ (js/defence.js, 12 chặng x 3 đợt) - còn thiếu
- Đã có: 12 chặng x 3 đợt (qua chặng thì sang chặng kế cùng phòng, thắng khi qua 12-3), ngân sách quái x(1 + 0,25 x (chặng-1)), máu quái x(1 + 0,1 x (chặng-1)) [ƯỚC LƯỢNG], số tuyến 1/2/3 theo chặng [WIKI], Đợt Lớn thêm quái Phi Thuyền, trùm sóng ở 3-3/6-3/9-3/12-3 rơi 8 Xu Sao, Phẩm tháp 1-6 mua trùng 15 Xu Sao (Bẫy Gai 4 -> 14 gai).
- Hình gốc (tools/extra/defence.json, bundle defence.ab; đợt 3 thêm js/defence2.js ?v=20261010za): Nền Tháp, 11 tháp (thân, nòng, bản hỏng), cổng đỏ, Xu Sao, tia Laser (chain_laser), gai (spike_trap_bullet), bom + nổ (warcraft_bomb, explode), vũng độc/lửa (biochemical_gas/fire, nhân màu), cầu năng lượng, rương xanh (defence_chest) vẽ bằng prefab; tháp chạy clip bắn (Súng Máy m4, Bẫy Gai create_spike, Gió Lốc w_sword 0, Sinh Hóa bioch_fire, Không Quân airbase_open, Bảo Trì service_depot_open). Đá Phép vẽ bằng sprite magic_stone. Chưa vẽ: 3 sao nổi của Nền Tháp (dùng chữ), vòng gió của Gió Lốc và tia sét Thời Tiết vẫn là hình canvas (hurricane_bullet/hurricane_skill/tower_level_up chỉ có hạt, không có khung hình), đạn Súng Máy (không có prefab), máy bay drone (recoverier/warcraft) của Không Quân / Bảo Trì chưa vẽ, Quan Tế vẽ bằng hình hero priest (defence.ab không có prefab), Thương Nhân vẽ bằng prefab merchant_honest (defence_seller chỉ là ảnh UI).
- Trùm sóng là Phi Thuyền thường (e_alien03) với máu [ƯỚC LƯỢNG] 300/600/900/1200, KHÔNG phải Đĩa Nổi Laser / Zulan Khổng Lồ / Thủ Lĩnh Wackern / Tàu Ngoài Hành Tinh (trùm cần đấu trường riêng, không đặt vào sóng được); 12-3 chưa có Tàu (500.000 máu, 4 bộ phận): thắng khi dọn xong đợt 12-3.
- Sao tháp chỉ lên bằng EXP (wiki không có giá Xu Sao cho sao); chưa có Phẩm cho tháp ngoài Bẫy Gai/Thời Tiết/Không Quân.
- Bản đồ: dùng phòng khởi đầu của W.generate làm Phòng Đá Phép (3 cổng đỏ tây/bắc/đông); chưa có Hậu Điện, 7 vùng, 39 cứ điểm, hành lang cổng, đợt giới thiệu (0-1) và Robot Tự Nổ. Quái từ chặng 4 lấy từ mọi chủ đề, chưa theo vùng nối cổng.
- Tháp: 11/12 (đủ Súng Máy, Laser, Bẫy Gai, Gió Lốc, Thời Tiết, Sinh Hóa, Không Quân, Thiết Bị Nạp, Hộ Thuẫn, Bảo Trì, Ma Trận Khuếch Đại). Tháp thứ 12 Thiết Bị Lỗ Đen (prefab black_hole_tower có trong bundle) wiki KHÔNG ghi số nên bỏ; Máy Khai Khoáng cần Nền Khoáng ở cứ điểm mỏ (web không có cứ điểm). Còn thiếu: Dị năng (Nạp chưa cấp Dị năng cho Thời Tiết / Gió Lốc / Hộ Thuẫn / Laser), chế độ chuyển đủ bộ (mới Bảo Trì tháp / người, Sinh Hóa độc / lửa; độc chưa làm chậm quái; chưa có Phẩm thêm cỡ đạn riêng ngoài [ƯỚC LƯỢNG] +10%/Phẩm), chí mạng (Laser, Ma Trận), bắn đạn địch (Không Quân Ngăn Cản), Cờ Lê chỉ có hàm Df.moveTower (chưa có nút bấm / phá tháp), Máy Khai Khoáng. Số cd/tầm/máu tháp/EXP mỗi quái, số cầu Nạp theo sao (nội suy 8 -> 14), độ bền Hộ Thuẫn theo sao (x1,26), tầm Bảo Trì hồi người 90 px, bán kính Ma Trận 36 px là [ƯỚC LƯỢNG].
- Đá Phép mất máu = ceil(máu quái / 10) tối đa 20 [ƯỚC LƯỢNG]; Xu Sao rơi 50% x 2 mỗi quái trong đợt + 15 khởi đầu [ƯỚC LƯỢNG].
- Đã có (đợt 3): Quan Tế EXP/cấp 1-12 (bảng 250..11000, mỗi cấp +8 máu, +4 giáp, +100 NL, +5 sát thương tay không [WIKI SP]; EXP người chơi 8 mỗi điểm quái trong đợt là [ƯỚC LƯỢNG]), Thương Nhân (mở sau 1-3: thuốc máu / NL lớn 25 vàng hồi 50%, Cờ Lê 5 Xu Sao [WIKI Trader]), 3 lượt hồi sinh + 1 lượt khi hạ trùm sóng [WIKI/LOC], rương xanh sau Đợt Lớn (web chưa có hạt giống / vé nên thưởng vàng 30 + 10 x chặng [ƯỚC LƯỢNG]).
- Chưa có: chọn thiên phú mỗi cấp của Quan Tế (+ làm mới bằng ngọc), +5 sát thương tay không mới ghi vào d.bareDmg chưa nối vào đòn, Robot Tự Nổ (đợt giới thiệu 0-1), Thầy Hướng Dẫn, Bậc Thầy Vũ Khí, Kho, nhiệm vụ, ngọc thưởng, lượt hồi sinh trả ngọc (web không có ngọc), thua khi hết lượt hồi sinh dù Đá Phép chưa vỡ (gốc: phải vỡ cả Đá Phép), đột biến quái, Lợi Hại, xung đột thành tích đợt đã chọn 8/16/24.

## Đồ vật / NPC phòng đặc biệt trong hầm (js/dnpc.js, kiểm: test/soulknight-dnpc.js, rev 20261010t)
- Đã làm: Lò Đúc Lại (furance: trả vàng, ra vũ khí CÙNG LOẠI, đỏ ra đỏ, giá gấp đôi mỗi lần [WIKI]), Lò Khởi Nguyên (furance_inverse: vứt vũ khí lấy ⌈n/3⌉ mỗi nguyên liệu trong công thức rèn [WIKI + CFG weapons.Materials], dùng 1 lần), Lò Luyện Dung Hợp (furance_fuse: 2 vũ khí → 1, cùng bậc thì lên 1 bậc tối đa đỏ, khác bậc thì theo bậc cao [WIKI]), Thầy Huấn Luyện (npc_trainer: có lính chưa đủ 5 bậc thì thế chỗ phòng lính thuê; mọi lính +1 bậc, +15 máu/bậc, giá gấp đôi mỗi lần [WIKI]). Trọng số: r_weapon_provider 150 × 2/11 mỗi lò (random_objects.weapon_provider [CFG]); lò dung hợp từ ải 1-4 (điều kiện loại 0 > 2); thầy huấn luyện 75 khi phòng lính thuê tắt.
- Giá gốc [ƯỚC LƯỢNG] (không có trong prefab/config): Đúc Lại 20, Dung Hợp 30, Huấn Luyện 20 (qua priced()); Lò Khởi Nguyên miễn phí. Bể đúc lại = mọi vũ khí weapon_NNN có sát thương, không khởi đầu; không loại được vũ khí "chỉ ghép" vì dữ liệu không đánh dấu. Điều kiện của furance_inverse (loại 10 > 70, loại 13) không rõ nghĩa nên coi là luôn hợp lệ. "Hung hãn hơn" của lính sau huấn luyện = hồi chiêu ngắn thêm 6%/bậc [ƯỚC LƯỢNG].
- Đợt 2 (js/dnpc2.js, rev 20261010zd): Thợ Thủ Công (npc_smith, 4/11 trọng số weapon_provider [CFG]) và Người Câu Cá (npc_weapon_item_fish, 1/11; "wi" = phụ kiện vũ khí) bán một phụ kiện hợp vũ khí đang cầm, mỗi NPC một lần. Hệ phụ kiện tối thiểu: chỉ nhóm "Chỉ số" theo số wiki (Đá Mài Dao, Cuộn Dây Gaussian, Máy Tụ Năng, Chip Tàn Khốc, Lò Phản Ứng Hiệu Suất Cao do thợ; Balanus, Cá Đao, Đá Hiền Giả do Người Câu Cá); đổi `w.def` (sát thương cả đạn, bạo kích, năng lượng, tốc đánh), tên có ★; vũ khí đỏ, vũ khí chỉ câu cá, Qian-kun Punch không gắn được. Đạo Sư (npc_skill_update, 1/11): mỗi cấp = hồi chiêu kỹ năng ×0,94, tối đa 5 cấp/ván, `G.mods.skillLv`. Máy Thử Vận May (slotmachine, r_slotmachine 10 từ chỉ số ải >= 6 [CFG]): bảng giải trong prefab (5 giải trọng số 10, lượt còn lại 3/3/10000/10/1; 2 mục phạt trọng số 1000 [ĐO Odin]) + bể bình random_objects.slot_machine [CFG].
- [ƯỚC LƯỢNG] của đợt 2: giá Thợ Thủ Công 15 + 5/bậc (wiki chỉ ghi "tối thiểu 15"), Người Câu Cá 30, Đạo Sư 40 × cấp kế, máy 30 vàng; máy trúng 40%; ý nghĩa số hiệu giải 1-7 (1-4 = một bình từ bể, 5 = giải đặc biệt hồi đầy + máy hỏng, 6 = "cảm ơn ủng hộ", 7 = giật 1 sát thương); xác suất ra từng phụ kiện/độ hiếm (đều nhau trong loại hợp); hồi chiêu 6%/cấp của Đạo Sư. Giá và tỉ lệ trúng của máy nằm trong IL2CPP, không đọc được.
- Chưa làm (đợt 2): phụ kiện nhóm "Đặc biệt"/"Nâng cấp" (Mirror Device, Energy Hilt, Bullet Fish, Starfish Shuriken, Binary Jellyfish...), phụ kiện rơi nhặt được khi đổi/dung hợp vũ khí và đổi phụ kiện giữa các vũ khí, Máy Đổi Phiếu; Đạo Sư theo bảng hiệu ứng riêng từng nhân vật (wiki Mentor Table: sát thương, số vật thể, thời lượng) và đường chạy 2 đoạn của phòng Đạo Sư (web chỉ có hồi chiêu); hoạt ảnh cần gạt có kèm tiếng/đèn của máy (chỉ hạ cần + tên lửa); câu cá mini-game (wiki: gỡ ở bản 6.2.0, NPC chỉ bán phụ kiện); Lão Thiết npc_smith_fusion (sự kiện, điều kiện loại 28); Thợ Thủ Công/Bánh Quay/Ngân hàng trong lồng (cage_npc, thợ miễn phí khi cứu từ lồng).
- Chưa làm (đợt 1): Thầy Huấn Luyện trong lồng nhốt, phòng có "vật liệu huấn luyện", giảm 50% giá khi cứu từ lồng, vũ khí tốt hơn theo bậc huấn luyện (lính web cầm vũ khí cố định).
- Không có trong hầm: Bàn Luyện Kim (alchemy), Máy Quay Trứng (gashapon), Họa Sĩ (map_drawer), Robot Hỏng (robot), Lái Buôn Thần Bí (bossshop) và Bàn Rèn chỉ có tên trong LOC, không nằm trong random_objects/map_levels/prefab levelcommon: là đồ vật của Xưởng/Sảnh (đã nằm ở js/hall*.js) hoặc sự kiện, nên không đặt vào phòng đặc biệt.

## Tầng 4C Đáy Biển (js/floor4c.js, build_sk.py `level/4/c.ab`, test/soulknight-floor4.js mục 8, rev 20261010s)

Đã làm: chủ đề `seabed` (sàn RB_Floor_0, tường prefab wall_seabed), 6 quái e_seabed_mob0..5 bốc theo map_C16..C20, máu theo wiki, cổng tím bốc 4A/4B/4C cùng trọng số [SUY], 4-3 không có trùm, oxy (đầy 100, tụt 1,25/s, hết thì 1 sát thương/giây qua hurtPlayer nên giáp trước máu, thú cưỡi trước, Lợi Hại thành 2), bong bóng sàn (+30/s, chạy x1,15), Người Hầu Kraken hút 5/s, bong bóng quái 10 máu cho 001-003 (tầm xa 1 sát thương, cận chiến vỡ ngay, vỡ trong 8 ô thì +15 oxy), HUD oxy dưới giữa (sự kiện `hud`, hud.js không sửa).

| Còn thiếu | Ghi chú |
|---|---|
| Số oxy: thời lượng đầy, tốc tụt, tốc hồi, lượng bóng quái, nhịp sát thương 1 s | wiki/config không ghi, IL2CPP; toàn bộ [ƯỚC LƯỢNG] trong `SK.floor4.OXY` |
| Trùm 4-5 Thợ Lặn Vực Sâu | rig là Spine (`spine_export/abyssal submariner.skel.bytes`), không có Animator để vẽ; 4-5 mượn bể trùm 4A (Hulala...) |
| AI quái 4C viết lại từ mô tả wiki | 001 hiện sau lưng + gai, 002 4 chùm 16 đạn, 003 khí độc 3 ô rồi lao, 004 vuốt + phun đạn/bóng oxy; đạn tròn dùng đạn 'orb' chung, chưa dùng prefab đạn gốc (tam giác nảy, đạn nảy của Kraken) |
| Bong bóng quái: phân biệt cận chiến theo loại vũ khí đang cầm (không theo nguồn đòn), TTN-004 không nhả bóng đúng tần suất | [ƯỚC LƯỢNG] |
| Thùng độc tím/thùng băng, sóng nước, ánh sáng/tối Seabed, nhạc bgm_4c, bong bóng cánh quạt của trùm, sàn 4C_RB_FloorTile_1/2 | chỉ dùng một khung sàn |

| Trùm `boss_stone_man` (Tổ Tiên) đã vẽ bằng Spine | `js/spine.js` (spine-canvas 4.2.40, nạp lười từ CDN) + `js/bosses/boss_stone_man.js`; còn lại: `boss_stone_dragon`, Đổng Trác, Thợ Lặn Vực Sâu chưa làm. Số đòn Tổ Tiên (vùng nổ, sát thương) là [ƯỚC LƯỢNG]; không có bản chạy offline của spine-canvas (cần mạng, lỗi thì hình tĩnh) |

## Xâm Nhập Hư Không độ 2 và 3 (js/void2.js, rev 20261010u)
- Đã làm: `G.void.tier` 1..3 (lối vào `SK.profile.voidTier`, nút `data-d="void"/"void2"/"void3"` ở thẻ Chế độ Ải; độ 2 mở sau khi thắng độ 1, độ 3 sau khi thắng độ 2, ghi ở hồ sơ `voidWon` [ƯỚC LƯỢNG: wiki/LOC không ghi điều kiện mở]); khiên 80/120/160 mỗi tầng; máu Tinh Anh theo bảng wiki; trùm Hư Không 3-5 là 1800/2400/3000 (1-5 và 2-5 độ 2-3 nhân 4/3 và 5/3 [ƯỚC LƯỢNG]); Rãnh Nứt 2 máu từ độ 2.
- Độ 2: Huyết Vệ (e_void_blood), Tế Tư (e_void_priest), Cấm Vệ (e_void_imperial, khiên đỏ: cận chiến ×10); người chơi +1 sát thương mọi nguồn trừ Rãnh Nứt [WIKI VI General].
- Độ 3: Thiền Vệ Trượng + Châu (chung một ô Tinh Anh, mở khiên cho nhau), Triệu Hồi Sư (Bàn Tay Hư Không), Hộ Pháp (e_void_sentinel: vòng cấm kỹ năng), Đao Phủ (e_void_killer; chỉ có kiểm bằng dựng thẳng vì chế độ này chưa có ải 4-x); người chơi vào ván có Khiên Hư Không 12 tầng (3004) + Lệnh Truy Sát (3003) [WIKI VI General]; hồi tầng: vào ải +1, phá khiên Tinh Anh +3, hạ Hư Không +5, bình HP/NL +1 (lớn +2); đếm ngược Hủy Diệt 10 giây [ƯỚC LƯỢNG].
- Thiên phú 3001-3003 (độ 2) và 3005-3007 (độ 3) bốc qua Thương Nhân Hư Không (một thẻ riêng trong bộ 3) vì Đại Hiệp Con Thoi Thời Không (nguồn gốc của chúng) chưa có.
- Hình quái: prefab gốc dựng qua tools/extra/void.json; khiên, vòng đỏ, huyết trì, vòng cấm vẽ bằng canvas.
- Chưa làm: Vật Tổ Hư Không (độ 2-3), Xu Ám Tinh tăng ở độ 2, Nhà Sưu Tầm bán 2 Mảnh Tiến Hóa cố định, Thương Nhân Rãnh Nứt 4/6 thao tác, khung vàng/tím hồ sơ, Áo Giáp Vàng +1 tầng khiên, nước uống hồi tầng, "hồi dư đổi bất tử ngắn" của 3004, Chrono Wanderer, Hư Không Bản Tướng (độ 3 trùm mới), Lưỡi Dao tập kích ở 4-x.
- Xấp xỉ: "cận chiến" với khiên đỏ = người chơi cách quái < 42 px (actors.js không báo nguồn đòn); "tay không" (3001) = không cầm vũ khí; Bàn Tay Hư Không bị "ném" khi bị đánh trúng thay vì người chơi nhặt/ném; Bàn Tay chạm người làm chậm + 2 sát thương mà không ngắt đòn đánh/đổi vũ khí; Hộ Pháp chỉ cấm kỹ năng (chưa gây sát thương bỏ qua bất tử); Đao Phủ không tái xuất sau 40 giây.

## Skin nhân vật đợt 2 (js/skins2.js, js/lobby.js, tools/skins/build_econ.py + build_skins.py, test/soulknight-skins2.js, rev 20261010zf)
- Đã làm: giá / cách mở 740 skin [WIKI Skinlines 669 skin + Template:<Hero>_Skins 70 skin; config skins.json và LOC không có giá]: 164 skin tính đá (2k-18k), 217 tiền thật (thanh toán giả như nhân vật), 48 Cá Khô (Fish Chips, trừ Cá Khô của tiệm Mèo Chiêu Tài), 2 miễn phí, 309 chỉ mở qua sự kiện / mảnh skin / Gashapon / Hộp Mù / thành tựu / Xu mùa giải / Tiếp Tế Huấn Luyện (hiện khoá kèm cách mở, không bán); 1 skin [ƯỚC LƯỢNG] 12000 đá. Skin khoá chỉ xem trước trên thanh trượt, nút Mở khoá hiện giá; mua xong chọn luôn; lưu ở hồ sơ `skinOwn`; hồ sơ cũ giữ skin đang chọn.
- Hình kỹ năng riêng: gói skin thêm `fx` (99 skin, 10 nhân vật: Du Hiệp lăn, Người Sói dạng sói, Hiệp Sĩ Thánh khiên, Kỹ Sư, Robot, Pháp Sư Hắc Ám, Kiếm Sư, Elf, Phù Thuỷ Hư Không, Hiệp Sĩ Bí Thuật) đổi tên sprite lúc vẽ cho người chơi đang dùng skin đó (bọc SK.draw / SK.drawTinted).
- Đã sửa kèm: `SK.makePlayer` (js/actors.js) tạo `p.h` bằng Object.create nên skin khác 0 vào ván rồi mất tốc độ / hộp chân (rooms.js sao chép bằng Object.assign) và lỗi `body.r`; nay là bản sao đầy đủ.

## Skin vũ khí khởi đầu (js/hall_wskin.js, data/sk-wskin.js, tools/wskin/build_wskin.py, rev 20261010y)
- Đã làm: 354 skin của 40 nhân vật [CFG weapons.json: 369 prefab `weapon_init_<hero>xx[N]` trừ 13 trùng tên vũ khí gốc, trừ `assassinxx3` (thiếu hình `bullet_assassin_11_init_0_1`) và `paladinxx3` (thiếu `weapons5_38`, bundle không có trong bản cài)]. Tên Việt [LOC weapon/<khoá>]; 15 prefab không có tên trong LOC đặt "<tên vũ khí gốc> #N" [ƯỚC LƯỢNG tên]. Giá Skin Vũ Khí cạnh Rương chọn nhân vật + skin; trong ván vũ khí khởi đầu vẽ bằng hình skin (nút `w`, nút phụ img/ui/l/r, đường sprite của clip), chỉ số/đạn/nòng/hoạt ảnh giữ nguyên.
- Giá: config chỉ có `Price` 50 trên prefab skin, game gốc phát skin qua Máy Quay Trứng Skin Vũ Khí / thẻ Beep / cửa hàng nhiệm vụ ngày [LOC activity_egg_machine_weapon_skin, bp/reward_info, daily_commission/shop/tab/weapon_skins] và không ghi giá đá. Web dùng 50 đá mỗi skin [CFG Price; đơn vị đá là ƯỚC LƯỢNG]; Máy Quay Trứng web chưa phát skin vũ khí.
- Skin gốc gắn với `weapon_init_<hero>x` (bản "x" của vũ khí khởi đầu); web chỉ có bản không "x", nên skin áp lên vũ khí khởi đầu của web, không đổi chỉ số [ƯỚC LƯỢNG: LOC/config không ghi chênh lệch số giữa bản x và bản thường].
- Chưa làm: 44 skin (alchemist, bard, costumeprince, elves, engineer, joker, ninja, priest, robot, shooter, swordmaster, taoist, trapmaster, vampire, viking, werewolf) có bộ clip khác số lượng clip gốc nên hoạt ảnh đổi hình theo trạng thái dùng hình gốc, chỉ hình tĩnh là hình skin; 12 skin Người Điều Khiển Gió chỉ đổi `def.sprite` (vũ khí này không có cây hình w86); hiệu ứng riêng của skin (đạn, vệt chém, âm thanh) không đổi; biểu tượng vũ khí ở HUD (js/hud.js) và vũ khí của Song Thủ/bản sao vẫn là hình gốc; không đổi trong Xem Trước Hiệu Ứng [LOC weapon_skin_preview/*] vì web không có màn đó.
