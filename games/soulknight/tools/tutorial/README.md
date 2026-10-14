# Ải hướng dẫn lần đầu (màn kể chuyện + ải hướng dẫn)

    py -3.12 -I -X utf8 games/soulknight/tools/tutorial/build_tutorial.py   # -> data/sk-tutorial.js, art/tutorial/juqing0{1,2}.png
    node test/soulknight-tutorial.js                                         # cần python -m http.server 8824 ở gốc repo

Hình bảng mẹo `signs_tip` và rương `chest00` vào atlas chung qua `tools/extra/tutorial.json` (chạy lại `build_sk.py`).
Mã chạy: `js/tutorial.js` (`SK.tutorial.start(onDone)`), bố cục phòng đặt sẵn qua `stage.layout` của `js/world.js`.

## Nguồn [ĐO 2026-10-14]

| Phần | Bundle 8.6 | Ghi chú |
|---|---|---|
| Màn kể chuyện | `scene_plot.ab` › Scene_Plot › `Canvas` (UIPlot) | Image (juqing01), Text (I_plot1), mubu (màn đen), btn_plot phủ cả màn. `UIPlot.img_list` = [juqing02]. |
| Nhịp kể chuyện | IL2CPP `UIPlot.Start/Tap1/DoTap1/Tap2/DoTap2/Tap3/BtnSkipClick` | 3 s mỗi câu, màn đen 0,5 s (`Invoke(DoTap*, 0.5)`), câu 3 tắt ảnh, Tap3 nạp Scene_Tutorial. |
| Màn đen | Animator `plot_anim` của Canvas | bool `show_mubu`; hai clip dài 0, chuyển trạng thái 0,5 s; trạng thái đầu `plot_show_mubu`. |
| Ải | `tutorial.ab` › prefab `map_Scene_toturial` | 7 phòng RGRoomX trên lưới 41 đv: start → đánh → rương → đánh → rương → đánh 21×21 (tinh anh `ex_orc07`) → cổng. |
| Bảng mẹo | `floor_group/signs_tip*/talk` (ObjectTip + BoxCollider2D trigger 4 × 4,5 đv) | I_teaching_1..3, I_tip_02/03/20. |
| Rương | `floor_group/chest00*` (RGChestAppoint.object_list) | weapon_021 (Súng Máy), weapon_251, weapon_034, energy_pot. |
| Chữ | `$SK86/decoded/localization_en_vi.json` | I_plot1..3, I_plot_skip, I_tutorial, các khoá mẹo. |

Clip đối chiếu: https://youtu.be/1EdlLjGhhEQ?t=3 (bản 2019, cùng bố cục phòng và cùng câu chữ).

## Bẫy đã sập

- **`py -I` bỏ qua `PYTHONIOENCODING`** (`-I` gồm `-E`): `build_sk.py` chạy 12 phút rồi chết ở dòng `print` tiếng Việt.
  Dùng `py -3.12 -I -X utf8`.
- **ObjectTip không nằm ở gốc `signs_tip`** mà ở nút con `talk` (cùng vùng trigger). Gốc chỉ có SpriteRenderer + CircleCollider2D.
  Bản `signs_tip` trong `levelcommon.ab` (dùng để vẽ) mang `TalkTrigger` cũ thay cho ObjectTip.
- **Tên nút có dấu cách thừa**: `signs_tip ` và `signs_tip` là hai bảng khác nhau trong cùng phòng.
- **RGObjectSkin.obj_index** (khối `skin_wall`/`skin_box0N` trong wall_group) là chỉ số trong `obstacle_list` của theme
  (forest: 0 wall502 khối X xám, 1 box02 thùng gỗ, 2 cask_red_2, 3 cask_green_2) [SUY, khớp clip ?t=106: hai hàng khối X,
  thùng gỗ bốn góc, vết nổ giữa phòng]. Không đọc được mã gán skin (IL2CPP).
- **emRoomType của phòng cuối là 2 (Statues)**, không phải phòng cổng; prefab không có `transfer_gate`. Bảng I_teaching_3
  "Dùng Cửa Dịch Chuyển kết thúc hướng dẫn" và clip ?t=255 cho thấy cổng giữa phòng này, nên web đặt cổng như phòng `end`.
- **openDirection** là bit: 1 lên, 2 xuống, 4 phải, 8 trái (lever kiểm cả 6 cặp phòng kề, lệch thì dừng).
- `chest/chest_open` chỉ có đường Transform (nắp tách, hộp nhô lên); vẽ trạng thái đóng bằng chính clip này ở t = 0.

## Chưa làm / rút gọn

- 8.6 còn ải hướng dẫn mới `map_Scene_tutorial_first` (FirstTutorialManager, có huấn luyện viên đi theo TrainerPos*, lồng,
  thương nhân, sách thiên phú) và bản thử A/B `map_Scene_toturial_group_b`; logic nằm trong IL2CPP. Web dùng bản cổ điển
  `map_Scene_toturial` khớp clip.
- Quái đặt sẵn xuất hiện khi phòng khoá (như đợt quái thường), không đứng chờ sẵn trước khi vào phòng.
- Lời nhắc "Nhấn nút kỹ năng" có bàn tay chỉ (I_teaching_00, clip ?t=96) chưa làm: không rõ điều kiện bật.
- Chết trong ải: chơi lại ải từ phòng đầu [SUY]. Bảng mẹo không chặn đường (gốc có CircleCollider2D bán kính 0,5 đv).
- Chữ màn kể chuyện dùng font dự phòng BeVietnamPro: font gốc `zpix` là font CJK 4,7 MB, không đưa lên web.
