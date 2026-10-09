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
| Không có thú cưng đi theo | [THẤY] mèo đen https://youtu.be/LyMmXTQFcq8?t=33, chó https://youtu.be/B9Gb2Y26Cow?t=812 | `js/pets.js`, prefab `pet0..pet5` [ĐO Pet0Controller: 3 sát thương, atk_cd 2, theo chủ 2–20 đv, tốc 8] |

## Còn mở

| lệch | bằng chứng | vì sao chưa làm |
|---|---|---|
| Không có sảnh đi lại (vào thẳng màn chọn nhân vật) | [ĐO] `hero_room/hall/skin_0` › `hall_0_normal`, nội thất `hero_room/common` `*_0_normal`; bản phác dựng được | đợt kế; vị trí đứng của từng nhân vật nằm trong bảng cấu hình chưa giải mã |
| Lượt chơi cố định Rừng → Lâu Đài → Núi Lửa; gốc bốc chủ đề mỗi tầng | [THẤY] trùm Zulan ở chủ đề đá xanh https://youtu.be/B9Gb2Y26Cow?t=812 | trùm phụ thuộc chủ đề; `sk-bosses86.js` chỉ có bể trùm Rừng/Lâu Đài/Núi Lửa. 13 chủ đề đều sinh quái và đánh được |
| Chủ đề sàn cỏ đá hoa văn 回 ở ải 1 (trùm Zulan) | [THẤY] https://youtu.be/LyMmXTQFcq8?t=33 | chưa tìm ra bundle; `level/1/{a,b,c,g}` đều không phải |
| Màn tải giữa hai ải: nền đen, xoáy cổng, hai dòng mẹo | [THẤY] https://youtu.be/LyMmXTQFcq8?t=2 | chưa làm; cần `loading.ab` và chữ mẹo tiếng Việt |
| Cột sáng rơi xuống nhân vật lúc vào ải | [THẤY] https://youtu.be/LyMmXTQFcq8?t=5 | chưa tìm ra hiệu ứng (`fx_landing`, `effect_reborn` đều không phải) |
| Thoại NPC sau trùm, nút SKIP | [AGENT] https://youtu.be/B9Gb2Y26Cow?t=890 | chưa kiểm khung |
| Trùm nổi giận ~40% máu | [AGENT] https://youtu.be/rNUWLt51lmA?t=50 | chưa kiểm |
| Chọn thú cưng ở sảnh | — | web luôn dùng `pet0` (mèo đen) |
