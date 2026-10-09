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
| Chủ đề sàn cỏ đá hoa văn 回 ở ải 1 (trùm Zulan) | [THẤY] https://youtu.be/LyMmXTQFcq8?t=33 | chưa tìm ra bundle; `level/1/{a,b,c,g}` đều không phải |
| Màn tải: dòng mẹo ở 82% chiều cao (gốc 92%); thiếu kim cương quay góc phải; font pixel `zpix` không có trong bundle (đang dùng Be Vietnam Pro) | [THẤY] https://youtu.be/LyMmXTQFcq8?t=2 | nhỏ, chưa sửa |
| Số lượt "Đổi 1 đợt" | nút gốc ghi (2/2) | web: 2 lượt mỗi lượt chơi [ƯỚC LƯỢNG], luật gốc chưa đọc |
| Cột sáng rơi xuống nhân vật lúc vào ải | [THẤY] https://youtu.be/LyMmXTQFcq8?t=5 | chưa tìm ra hiệu ứng (`fx_landing`, `effect_reborn` đều không phải) |
| Thoại NPC sau trùm, nút SKIP | [AGENT] https://youtu.be/B9Gb2Y26Cow?t=890 | chưa kiểm khung |
| Trùm nổi giận ~40% máu | [AGENT] https://youtu.be/rNUWLt51lmA?t=50 | chưa kiểm |
| Chọn thú cưng ở sảnh | — | web luôn dùng `pet0` (mèo đen) |
| Bộ kiểm `soulknight-season-world.js` treo ở `#hs-back` | nút bị bỏ từ `292d316b` (màn chọn nhân vật dựng từ prefab); worktree HEAD cũng treo | nợ bộ kiểm, chưa sửa |
| Bộ kiểm `skills`: `alchemist concoction` hỏng | hỏng y hệt ở HEAD trước đợt 1 | lỗi có sẵn, chưa sửa |
