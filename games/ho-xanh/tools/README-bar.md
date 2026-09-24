## Quán sushi (rip_bar.py)

Bóc toàn bộ art, anim, UI, VFX và tiếng của quán sushi Bancho cho vòng "một ngày" của Hố Xanh.

    set PYTHONIOENCODING=utf-8
    python games/ho-xanh/tools/rip.py                 # phải chạy trước (bảng tra bundle + data/assets.js)
    python games/ho-xanh/tools/rip_bar.py             # tất cả, ~10 phút
    python games/ho-xanh/tools/rip_bar.py room chars  # chạy lẻ: room chars dishes ui audio

Ra `art/bar/**`, `audio/bar_*.mp3`, `data/bar_assets.js` (`window.HX_BAR_ASSETS`).
Mỗi phần ghi một tệp đệm ở `%TEMP%/ho-xanh-rip/bar_parts/<phần>.json`, rồi manifest gộp từ các tệp đó.
Chạy lẻ một phần thì các phần khác giữ nguyên.

Nguyên tắc: mọi hình, khung, thời lượng khung, đường cong UI và tham số hạt đọc từ tệp gốc.
Tool không vẽ thêm và không nội suy khung. Thứ game gốc không có thì nằm trong `missing` của manifest.

### Dữ liệu gốc nằm ở đâu [ĐO TRONG REPO, 2026-09-24]

- Quán đêm là prefab `SushiBar/Prefabs/Sushi_BG_Night_Re` đặt trong scene `Assets/Scenes/InGame/DR_SushiBar.unity`.
  - Tool dựng phòng từ chính scene (có ghế, chỗ ngồi, cửa, Bancho), không từ prefab rời.
  - Mọi thứ trong quán đặt scale 2, sprite 100 px/đơn vị. Vậy 1 px sprite = 1 px phòng = 0,02 đơn vị.
  - Phía sau quán trong game gốc là cảnh 3D (trời, biển). Không có tường sau dạng sprite.
- Chỗ ngồi là `SushiBarTable` dưới `SushiBarWorld/AIRoot/BarRoot/SeatRoot`.
  - `isFront` 1: ghế đẩu trước quầy dài, khách quay lưng (anim `back_*`), sortingOrder 160.
  - `isFront` 0: bàn sau, khách quay mặt ra (anim `wait`, `eat`…), sortingOrder -2.
  - Hai số này là `frontLayerOrder` / `backLayerOrder` của `SushiBarCustomer`.
- Scene có bản sao "preview" của quán ở x ≈ -1000. Tool bỏ mọi thứ có x < -500.
- Dave phục vụ là `Staffs/Dave` (sprite `Player_Sushi_*`). Bancho là `Staffs/Bancho`. Mèo Momo là prefab `cat001`.
- Món: cá → `FishInfoData.DropItemID` → `FishDropPackage.ItemIDList` → `Ingredients.TIDNumberConnect` → `Recipe`.
  - Icon món 64×52 nằm trong `CommonAtlas_Point`. Tên tiếng Anh ở `Assets/Excel/Auto/Texts/RecipeText.asset`.
  - 64/65 cá có món. `Cow_Pattern_Snapper` không có món nào.
- Số liệu khách (tốc độ, thời gian gọi món/ăn) ở `DR_GameData_NPC.json`, khối `Customer` và `CustomerEat`.

### Khung anim và thời lượng

- Thời lượng mỗi khung đọc từ khoá của `AnimationClip`, không từ `m_SampleRate`.
  - Ví dụ `Staff_Dave_Walk` có sample rate 48 nhưng khoá cách nhau 1/16 giây.
  - Manifest ghi `frames: [[ô, ms], …]` và giữ `rate` gốc để tham khảo.
- Clip Mecanim đã nén: khoá sprite nằm trong `m_StreamedClip.data`.
  - Dạng: `time f32, số khoá u32, [chỉ số curve u32, a b c d f32]`. Với PPtr thì `d` là chỉ số trong `pptrCurveMapping`.
  - Khung đầu nằm ở t = -FLT_MAX (trạng thái trước clip). Tool coi là t = 0.
  - Hai khoá cuối trùng sprite (khoá giữ khung cuối) thì gộp.
- Clip legacy (component `Animation` của UI) giữ đường cong gốc có tên (`m_FloatCurves`…). Tool xuất `[t, v, inSlope, outSlope]`.
- Clip Mecanim có đường cong số: tool xuất `[t, v, c, b, a]`, v(t) = ((a·dt + b)·dt + c)·dt + v.
  - Binding chỉ giữ CRC32 của đường dẫn và tên thuộc tính. Tool dò ngược bằng CRC32 các đường dẫn con và một bảng tên thuộc tính.

### Khách = thân + áo

- Mỗi khách có hai SpriteRenderer: `Customer` (thân, có đầu) và `Costume` (áo).
- Thân chạy bằng `AnimatorOverrideController` riêng từng khách, sprite trong `CustomerAtlas_Basic_Point`.
- Áo đổi theo tên sprite thân, lấy từ atlas `<khách>_Default`. 25/45 khách có atlas áo. Số còn lại thân đã mặc sẵn.
- Tool ghép sẵn áo đè lên thân, cùng pivot, thành một sheet mỗi khách.
- Tên sprite áo lệch nhau giữa các khách (`Wait01` / `Wait001` / `wait`, `Good` / `Happy`). Tool khớp theo tiền tố + số.
  Khung thiếu thì lấy số gần nhất nhỏ hơn và ghi vào `substitutions` [ĐỀ XUẤT].

### Phòng, lớp, ánh sáng

- Sprite tĩnh gộp thành lớp theo dải sortingOrder [ĐỀ XUẤT]: `back` < -2 ≤ `mid` < 40 ≤ `kitchen` < 140 ≤ `counter` < 160 ≤ `chairs` < 200 ≤ `front` < 1000 ≤ `top`.
  - Ranh giới đặt đúng chỗ nhân vật chen vào: khách bàn sau -2, Dave/Bancho 40, khách ghế đẩu 160.
- Đồ có Animator (biển OPEN, neon, loa, chụp hút, bể cá) tách ra `room.props`, kèm khung + ms hoặc đường cong.
- Đèn tròn `LightCircle` dùng shader `ProjectDR/LightOverlay`, blend `DstColor+One` (kết quả = nền × (1 + màu đèn)).
  - Tool tách thành lớp `*_light` (`blend: 'add'`). Canvas không có phép này; gần nhất là vẽ `multiply` rồi `lighter`.
- Shader `2D_Sprite_Uber` lấy blend từ thuộc tính material. Pass đọc ra `Zero+Zero`, nên tool coi là alpha thường.
- Hệ hạt đặt sẵn trong quán (LED biển hiệu, loa, hoa anh đào, bọt bể cá) ở `room.emitters`, ảnh ở `art/bar/room/vfx`.

### UI và VFX

- Mỗi prefab UI xuất cây RectTransform đầy đủ ra `art/bar/ui/layout/<khoá>.json`.
  - Nút có: `rt` (anchor, vị trí, cỡ, pivot), `img` (sprite, kiểu 9 mảnh, màu, fill), `text` (chữ gốc, cỡ, căn lề),
    `tweens` (DOTweenAnimation: kiểu, thời gian, ease, vòng lặp, giá trị đích), `animation` / `animator` (tên clip trong `ui.clips`),
    `particle` (tham số hệ hạt).
- Sprite UI ở `art/bar/ui`, kèm `border` 9 mảnh [trái, dưới, phải, trên].
- VFX của quán ở `vfx.systems` (bố cục `art/bar/vfx/layout/*.json`), ảnh hạt ở `art/bar/vfx`.
  - Ảnh chuỗi `E_Seq_*` đi kèm `sheet.tilesX/tilesY` ở hệ hạt dùng nó.
- Khói nấu của Bancho chỉ có ở DLC Jungle (`VFX_Jungle_SushiBar_Bancho_CookSmoke_01A`). Tool lấy và ghi rõ nguồn.
- Không xuất: nhánh `Dispatch`, `RecruitMent` của bảng mở quán (phái nhân viên, tuyển người), clip UI của đấu VIP/chi nhánh/cocktail [ĐỀ XUẤT].
- Ảnh UI cạnh > 1100 px vẫn xuất. Riêng ảnh PNG > 600 KB thì thu nhỏ đúng 1/2 và ghi `downscale: 2`; `w`/`h` vẫn là cỡ gốc.
  - Chỉ rèm cuối ca `SushiBar_EndCurtain` (ảnh quán đã làm mờ, 1920×1080) bị thu nhỏ: 952 KB xuống 344 KB.
  - `Night_AlarmBox` (1798×10) và `Black_Gradation_Bg` (1348×4) là ảnh 9 mảnh: dài nhưng chỉ vài KB.
  - Bản trước bỏ cả bốn ảnh này vào `ui.tooBig`. Băng CLOSED, rèm và dải kết quả cuối ca vì thế bị vẽ thay bằng khối màu.
- Nhánh con của prefab lớn khai trong `UI_SUBTREES` (prefab, đường dẫn nút):
  - `hudGold`: ô vàng góc trên trái.
  - `hudWatch`: đồng hồ đeo tay, trạng thái tối ở clip `Watch/EveningState`.
  - `openAlarm`, `openAlarmFx`: băng OPEN và hạt lúc mở quán.
  - Hai nhánh đầu nằm trong `SushiBarCanvasRoot`. Xuất cả prefab này thì kéo theo ~300 sprite của màn quản lý ban ngày.

### HUD đêm gốc [ĐO TRONG REPO, 2026-09-24]

- HUD lúc bán (`Common/Prefabs/UI/SushiBar/SushiBarCanvasRoot.prefab`) chỉ có hai món:
  - ô vàng `TopInfoPanel/GoldInfoPanel/LobbyGoldbar`;
  - đồng hồ `DayInfoPanel/CalendarWatchPanel/Watch`.
- Không có ô đếm suất đã bán. Hàng món + số suất còn lại ở đáy màn là của dự án.
- Đồng hồ buổi tối:
  - `Evening` là ảnh `UI_Watch_Time_Night_all`, tô Radial360 từ trái, ngược chiều kim, 0,385 vòng.
  - Nút xoay −30°, nên cung đêm chạy từ 10 giờ qua 9 giờ tới ~5 giờ 23.
  - Kim `EveningPointer` có pivot (0,5; 0,94), treo từ tâm xuống. Góc kim theo chiều kim đồng hồ từ 12 giờ = 180° − rotZ.
  - `HourInfoPanel.eveningWarningValue` = 0,142. Dưới mức này bật `Evening_Red` (tween nhấp nháy).
  - Biểu tượng giữa mặt là 8 ảnh trăng `UI_Watch_Icon_Moon_*`.
  - Code `HourInfoPanel` là IL2CPP, không đọc được. Kim chạy thế nào và trăng đổi theo ngày là do game này chọn [ĐỀ XUẤT].

### Câu nói của khách [ĐO TRONG REPO, 2026-09-24]

- `NPC.CustomerToastTalk` có ba loại câu, mỗi loại kèm `Chance`, `PreDelay`, `ShowTime`:
  - `Wating*` lúc chờ món;
  - `Angry*` lúc giận;
  - `Eating*` lúc ăn.
- Không có câu lúc bước vào quán.
- Manifest ghi `customers[].talk.{waiting,angry,eating} = {lines: [[khoá, tiếng Anh]], chance, preDelay, showTime}`. Game tự dịch 21 câu sang tiếng Việt (`VI_TALK` trong `js/bar.js`).
- Khung `CustomerTalkBoxInfo` chỉ là một dòng TextMeshPro cỡ 16 có viền `TextMeshProUnderlay`. Không có ảnh bong bóng.
  - Neo góc phải-dưới, lệch (20, −40) px UI, chữ mọc sang trái.
- Bảng rót trà gốc `SushiBarQTEPanel` in nhãn bia "GLENN BEER". Chất lỏng là mô phỏng Water2D (metaball) vẽ qua RenderTexture.
  - Vì thế game giữ vòng `AutoQTE` của `StaffActionInfo`.

### Màu của shader hạt [ĐO TRONG REPO, 2026-09-24]

Đọc từ mã DXBC (cùng cách với shader flow bên dưới). Mọi shader hạt riêng của game **nhân đôi màu**, không chỉ Legacy:

| shader | màu ra |
|---|---|
| `ProjectDR/UI/Additive`, `ProjectDR/UI/Alpha Blended` | 2 · ảnh · màu hạt · `_Color` |
| `ProjectDR/VFX/Additive`, `AdditiveNoFog` | 2 · ảnh · màu hạt · `_TintColor` |
| `ProjectDR/VFX/Alpha Blended` (cả NoFog) | 2 · ảnh · màu hạt (không dùng `_TintColor`) |
| `Mobile/Particles/Alpha Blended` | ảnh · màu hạt |
| `Sprites/Default` | ảnh · màu hạt, nhân trước alpha (= pha alpha thường) |

- Alpha ra bị kẹp ở 1. Với cộng sáng, rgb có thể > 1: `js/bar.js` dồn độ sáng vào globalAlpha, vượt 1 thì vẽ chồng nhiều lượt.
- Bản trước chỉ nhân đôi cho `Legacy Shaders/Particles`. Các hiệu ứng UI (khách vui, vàng bay, trà perfect) vì thế chỉ còn một nửa độ sáng.

### Khói nấu: hạt mesh + shader flow [ĐO TRONG REPO, 2026-09-24]

- Cụm khói có 5 hệ hạt:
  - `Smoke`, `Smoke_Dura`: billboard `E_Smoke_03A`;
  - `Ash`, `Ash_Dura`: billboard kéo dài, cộng sáng, có Noise;
  - `Smoke_Flow`: hạt **mesh** `E_M_Circle_02A`, một dải cong phẳng 76 đỉnh, 108 tam giác, z ≈ 0.
- Bốn hệ đầu có Transform quay −90° quanh x. Hình nón (trục +z) nhờ thế hướng lên +y.
  - Bản trước không bóc phép quay, nên phải tự dựng nón đứng lên. Giờ `dump_node` ghi `q` (quaternion), phòng ghi `q` thế giới của từng hệ hạt.
- Khói trôi sang trái nhờ `ForceModule` x −0,5 (không gian thế giới). Bản trước không bóc mô-đun này.
- Shader `ProjectJDLC/VFX/VFX_SH_FlowB_Alpha_J` là ShaderGraph, tên thuộc tính bị băm (`Vector4_141c…`).
  - Tên đọc được nằm ở `Shader.m_ParsedForm.m_PropInfo.m_Props[].m_Description`. Tool xuất `render.props` theo tên đó.
- Công thức lấy từ mã máy: giải nén `Shader.compressedBlob` (LZ4), tìm các khối `DXBC`, dịch ngược bằng `D3DDisassemble` của `d3dcompiler_47.dll` (có sẵn trong Windows).
  - Bảng hằng `UnityPerMaterial` (cb1) xếp theo thứ tự thuộc tính.
  - t1 = MainTex, t2 = MaskTex, t3 = FlowTex, `cb0[19].x` = `_TimeParameters.x`.
  - `TEXCOORD1` = luồng đỉnh Custom1.xyzw (`m_VertexStreams` 0 1 3 4 5 34). Custom1 xy là số ngẫu nhiên 0..1 mỗi hạt.
  ```
  uvFlow = uv·FlowST.xy + FlowST.zw + t·FlowSpeed.xy + custom1.xy
  uvMain = uv·MainST.xy + MainST.zw + t·Speed.xy + custom1.zw + FlowTex(uvFlow).xy · FlowPower
  uvMask = uv·MaskST.xy + MaskST.zw + t·Speed.zw
  rgb = màu đỉnh · MainTexColor(2,519) · Main · Mask;   a = màu đỉnh.a · Main.a · Mask.a
  ```
- `E_Steam_03A_J` wrap Clamp; ảnh nhiễu và mặt nạ wrap Repeat. Kênh alpha của ảnh hơi nước chỉ tới 52/255.
  - Vì thế lớp flow gốc chỉ là làn hơi rất mờ. Phần khói thấy rõ là `Smoke` / `Smoke_Dura`.
- Game dựng lại ở canvas: mỗi hạt vẽ ảnh uv 64×64 theo công thức trên, rồi dán lên từng tam giác của mesh bằng ánh xạ afin.
- Không làm: `DepthFade` (làm mờ theo bộ đệm độ sâu 3D, quán 2D không có).
- Chỉ xuất ảnh phụ của shader riêng đã dựng lại (`REBUILT_SHADER`). `Add_CenterGlow` của sóng biển chỉ ghi tên ảnh, nếu không sẽ kéo thêm ~1 MB ảnh nhiễu.
- Mô-đun hạt tool chưa bóc được ghi ở `unhandledModules`.

### Tiếng

- 46 clip, mp3 mono 96 kbps (tiếng đám đông 64 kbps). Tiếng lẻ cắt lặng hai đầu (-55 dB). Nhạc giữ nguyên độ dài để lặp.
- Không có: chuông cửa khi khách vào, tiếng khách vui/giận riêng. Khách vào chỉ có `sushi_customer_enter_talk_*`.
- Tiếng thái cá lấy từ minigame đấu VIP (`BattleVIP_Slicing_Stargazer_Chop_01`), vì quán thường không có.

### Số đo lần chạy 2026-09-24

| phần | số lượng | cỡ |
|---|---|---|
| phòng | 994×585 px, 9 lớp, 6 đồ động, 19 hệ hạt, 15 chỗ ngồi | ~0,7 MB |
| Dave | 24 anim, 132 khung (có 12 khung không clip nào dùng) | 72 KB |
| Bancho | 12 anim, 62 khung | 44 KB |
| mèo | 8 anim, 66 khung | 12 KB |
| khách | 45 khách × 11 anim | ~0,6 MB |
| món | 64 món cá + 4 món chung + trà | 0,3 MB |
| UI + VFX | 25 prefab UI + 4 nhánh con (303 sprite, 54 clip), 20 prefab VFX (78 ảnh, 4 mesh) | ~7,5 MB |
| tiếng | 46 tệp | 2,9 MB |
| tổng art/bar | 549 png + json bố cục | 9,3 MB (lần đánh bóng 2026-09-24: +1,1 MB ảnh mới, chủ yếu rèm cuối ca, dải kết quả, ảnh nhiễu của khói) |

### Bẫy đã sập

- **Khách mất đầu.** Lần đầu chỉ lấy atlas `<khách>_Default`. Đó chỉ là lớp áo. Phải lấy thân từ Animator của prefab.
- **MemoryError khi bóc UI.** `rip.with_deps` đệm mọi tổ hợp (bundle, phụ thuộc) trong `rip._ENVS`. Prefab UI kéo theo ~20 bundle nên đệm phình.
  `rip_bar.with_deps` xoá đệm mỗi lần nạp thêm và nhớ phụ thuộc đã biết của từng bundle.
- **Không đọc `m_fontAsset` của TextMeshPro.** Font nằm trong bundle 50 MB, chỉ để lấy tên.
- **`script_name` nuốt lỗi.** `m_Script` của Image/TMP nằm ở bundle MonoScript khác. Nuốt `FileNotFoundError` thì with_deps không biết nạp thêm. Tool nhận Image/TMP theo trường typetree (`m_Sprite`+`m_FillMethod`, `m_text`).
- **Hai loa trùng tên** `Sushi_Column_Speaker_Lv2`. Đồ động đặt tên theo GameObject cha (`Sushi_Column_Speaker_L/R`).
- **"Quầng tối" sau khi phục vụ.** `VFX_UI_Customer_Pop_Re` là viền sáng hình bong bóng, lõi trong suốt.
  - Trong prefab nó là con của bong bóng `Order`. Bong bóng tắt thì hạt tắt ngay theo GameObject.
  - Bản trước chỉ `stop()`, nên viền mờ còn lơ lửng ~0,5 s quanh chỗ trống. Nhìn thành một đĩa đen có viền.
  - Giờ tắt hẳn bằng `killFx`. Cách phân biệt: điểm ảnh trong "đĩa" bằng đúng màu nền, chỉ viền sáng hơn. Không có gì bị vẽ tối đi.
  - Đĩa đen có vòng vàng sau lưng mặt cười lúc khách ăn là `EatGauge` gốc (`Circle_38` đen 86 %, vòng `Circle_36_Stroke` chạy theo thời gian ăn). Đó không phải lỗi.
- **Regex shader "thường" hụt `Alpha Blended NoFog`** (có dấu cách). Hệ `Smoke` bị coi là shader riêng, nên game bỏ không vẽ, và khói nấu chỉ còn tàn lửa. Kiểm bằng `HX.bar.debug.fx()`: đếm hệ hạt đang sống.
- **Thêm trường vào manifest khi tool đang chạy thì trường mới không vào.** Python đã nạp `rip_bar.py` lúc khởi động. Sửa xong phải chạy lại phần đó.
- **Xoá thư mục phòng sai lúc.** `rmtree(art/bar/room)` phải chạy đầu `_room`, không thì xoá mất ảnh hạt vừa ghi.
- `python` trên máy là shim `.bat`: đối số có `|`, `(`, `)` bị cmd cắt. Gọi thẳng `C:\Users\tamph\.pyenv\pyenv-win\versions\3.8.10\python.exe` khi cần regex.
