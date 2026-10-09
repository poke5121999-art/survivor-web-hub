# tools/build_ui.py: UI gốc của Tốc Độ

Nhãn: **[ĐO]** là điều đã kiểm trên dữ liệu, **[SUY]** là suy luận chưa kiểm.

## Điều khác với giao việc

- [ĐO] Zing Speed dùng **NGUI** (UIPanel, UIAnchor, UISprite, UILabel; chỉ có 24 RectTransform trong mọi bundle UI), không phải uGUI.
  Không có CanvasScaler. `build_ui.py` đọc NGUI rồi xuất đúng dạng nút của Soul Knight (`games/soulknight/tools/ui/README.md`),
  nên `js/ui/ugui.js` (bản của tron-tim, chỉ đổi namespace) chạy nguyên.
- Quy đổi: mỗi nút con neo vào điểm gốc (pivot) của cha (`a = pivot cha`), `p` = localPosition, `sz` = mWidth x mHeight,
  `pv` = pivot widget, `sc` = scale (kèm mFlip), `rz` từ quaternion. UIAnchor thành nút neo vào mép màn (`a` = 9 vị trí `side`),
  cha của nó dãn kín màn (`a = [0,0,1,1]`). Sắp thứ tự vẽ theo (UIPanel.depth, widget.depth) của cây con.
- [SUY] `ref = [1280, 720]`, `match = 1` (co theo chiều cao). UIRoot nằm trong scene, không có trong IFS. 1280x720 là chọn theo
  tỉ lệ bố cục: nền phủ màn 2000x1500, nút lái cách mép ~105, dải thanh cuối lobby cao ~65.
- Bảng chữ: `localization_{vn,en,chs,cht}_base.bytes` là cùng một bảng 8663 hàng (u32 x3 đầu, N, N hash tăng dần, N offset,
  mỗi chuỗi = u32 độ dài + utf8). Khoá `m_key` 64 bit của `CUILocalizationScript` **không giải được ra hash 32 bit** (thử
  FNV, djb2, CRC, murmur, md5/sha, nửa trên/dưới), nên tra theo chữ Anh/Hoa của prefab; trùng nghĩa khác hàng thì lấy bản VN hay gặp nhất
  (10 chuỗi mơ hồ, vd "Racetrack" nút RoadTeach ra "Trận đấu", đúng ra là "Hướng dẫn"). Chữ không có trong bảng (phần lớn nhãn UI
  của bản VN tải từ Puffer sau khi cài) dịch tay trong `VI_FIX` [SUY].

## Prefab đã xuất (`TD.UGUI.prefabs[khoá]`)

`racehud` (ghép: `ingameview` + `minimap` gắn `StaticUI/AnchorTopRight/Offset`, `speednitro` gắn `DynamicUI/AnchorButtom`,
`controls` gắn gốc [SUY nơi gắn]), `ingameview`, `speednitro`, `controls`, `countdown`, `minimap`, `minimapparams`, `rankitem`,
`myrankitem`, `lap2`, `lap3`, `finish`, `booststate`, `driftdis`, `confirmexit`, `settle`, `settlemain`, `garage`, `garageitem`, `lobby`.
`ig_ingame.prefab` / `ig_ingame_ui3.prefab` chỉ là prefab chứa atlas; HUD gốc là `ingameview` (khung rỗng, mã Lua gắn các prefab con).

## Đường dẫn game phải cập nhật (từ gốc `racehud`) [ĐO tên, SUY ý nghĩa]

| Giá trị | Đường dẫn |
|---|---|
| số tốc độ | `DynamicUI/AnchorButtom/IG_SigleSpeedNitrogen/HideRoot/Speed/Speed/Label` (`txt.s`), phần thập phân `.../DecimalLabel` |
| thanh nitro | `.../IG_SigleSpeedNitrogen/N2o/N2OShow/N2OProgress Bar/Foreground` (`img.fa` 0..1, Filled ngang) |
| nitro nhỏ (nút) | `OperatingMode_TwoSide/AnchorRightDown/Offset/SmallBoostButton` (`/Mask` là lớp hồi, `img.fa`); bản tay trái `AnchorLeftDown` |
| nút drift / phanh / lái / reset | `.../Offset/RDriftButton`, `BrakeBtn`, `RSteerButton`, `ResetButton` (trái: `LDriftButton`, `LSteerButton`). Một trong hai nhánh `AnchorLeftDown`/`AnchorRightDown` đặt `off` theo tay thuận |
| hạng | `HalfDyanamicUI/HangingView/AnchorTopLeft/RankPanel/Rank/Num` + `/Tab` ("st"); bảng hạng: nhân `rankitem`/`myrankitem` |
| vòng | `StaticUI/AnchorTopRight/Offset/IG_MiniMapContainer/Turns/FGLap/Label_Number` (hiện tại), `Label_Nums` (tổng), `Label` "Vòng" |
| bản đồ nhỏ | khung `IG_MiniMapContainer/MiniMapRoot/BG` 180x166, chỗ vẽ bản đồ `.../MiniMapTexture` (`dyn`, game tự vẽ canvas vào rect), chấm xe tự thêm làm con; `minimapparams` chứa tham số |
| tiến độ chặng | `IG_MiniMapContainer/SeasonContractRoot/...` (slider, `slider` = mValue) |
| số đếm ngược | `countdown`: `UIFX_CountDown_01` = "3", `_02` = "2", `_03` = "1", `_go` = "GO" (mỗi nhóm một ảnh 160x160 ở y=130; build để 3 hiện, 2/1/GO `off`) |
| LAP / FINISH | `lap2`, `lap3`, `finish`: ảnh biển trên đường (quad 3D, tính 10 px/m [SUY]); lap2 và lap3 dùng chung một texture, chưa cắt theo UV |
| hộp thoại thoát | `confirmexit`: `Anchor/CancelBtn`, `Anchor/SureBTn`, `Anchor/RoadTeach`, `SkillTeach`, `MoreTeach` |

Vùng bấm: nút nào có BoxCollider thì nút có `sz`/`pv` theo collider (không có widget) hoặc `col = [cx, cy, w, h]` (có widget);
`inst.rectOf(đường dẫn, w, h)` trả rect màn hình. Nút `off` hoặc có cha `off` trả null.

## Thiếu / chưa làm

- Sprite nằm trong atlas khác (nhóm `Replace*Sprite`, `Icon_Cup2/3`, `Icon_Win/Lose`, `BG_ShowDis`...; 35 tên) không tìm thấy trong atlas của prefab: nút đặt `img.off` + `img.miss`.
- 3 nhãn dùng UIFont bitmap (`txt.bmp = 1`) vẽ bằng font số; 247 MeshRenderer + 16 ParticleSystem (VFX) bỏ qua.
- Gradient chữ lấy trung bình; mClipping của UIPanel (24) bỏ; anchor theo widget đích (13) dùng toạ độ đã lưu.
- Animator/DOTween không xuất. Trang sprite `art/ugui/ui0.png` cao ~9500 px (2048 rộng): nặng bộ nhớ, nên tách theo prefab khi chốt.
