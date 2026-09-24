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
- Ảnh UI cạnh > 1100 px (màn rèm cuối ca 1920×1080…) chỉ ghi tên vào `ui.tooBig`.

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
| UI + VFX | 25 prefab UI (267 sprite, 51 clip), 20 prefab VFX (74 ảnh) | ~4,6 MB |
| tiếng | 46 tệp | 2,9 MB |
| tổng art/bar | 509 png + json bố cục | 6,6 MB |

### Bẫy đã sập

- **Khách mất đầu.** Lần đầu chỉ lấy atlas `<khách>_Default`. Đó chỉ là lớp áo. Phải lấy thân từ Animator của prefab.
- **MemoryError khi bóc UI.** `rip.with_deps` đệm mọi tổ hợp (bundle, phụ thuộc) trong `rip._ENVS`. Prefab UI kéo theo ~20 bundle nên đệm phình.
  `rip_bar.with_deps` xoá đệm mỗi lần nạp thêm và nhớ phụ thuộc đã biết của từng bundle.
- **Không đọc `m_fontAsset` của TextMeshPro.** Font nằm trong bundle 50 MB, chỉ để lấy tên.
- **`script_name` nuốt lỗi.** `m_Script` của Image/TMP nằm ở bundle MonoScript khác. Nuốt `FileNotFoundError` thì with_deps không biết nạp thêm. Tool nhận Image/TMP theo trường typetree (`m_Sprite`+`m_FillMethod`, `m_text`).
- **Hai loa trùng tên** `Sushi_Column_Speaker_Lv2`. Đồ động đặt tên theo GameObject cha (`Sushi_Column_Speaker_L/R`).
- **Xoá thư mục phòng sai lúc.** `rmtree(art/bar/room)` phải chạy đầu `_room`, không thì xoá mất ảnh hạt vừa ghi.
- `python` trên máy là shim `.bat`: đối số có `|`, `(`, `)` bị cmd cắt. Gọi thẳng `C:\Users\tamph\.pyenv\pyenv-win\versions\3.8.10\python.exe` khi cần regex.
