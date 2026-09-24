# Bóc asset Dave the Diver cho Hố Xanh

Mọi ảnh, anim, VFX, tiếng và bản đồ của game này rút thẳng từ bản cài Steam của
Dave the Diver (Mintrocket). Hai công cụ, chạy lại bao nhiêu lần cũng ra cùng kết quả:

    set PYTHONIOENCODING=utf-8
    python games/ho-xanh/tools/rip.py     # art/{dave,fish,env,fx,ui,props}, audio/, data/assets.js
    python games/ho-xanh/tools/level.py   # art/level/<ZONE>.glb, data/zones.js (thêm mã zone để chạy lẻ)

`rip.py` phải chạy trước. Lần đầu nó quét hết bundle (~4 phút) rồi đệm bảng tra ở
`%TEMP%/ho-xanh-rip/bundle_index.json`. Cần Python 3.8 + UnityPy 1.25 + numpy + Pillow,
`ffmpeg` trong PATH, và `node`/`npx` (gltfpack, spine-info.js).

Gỡ nhanh nếu bị yêu cầu: xoá `art/`, `audio/` và hai tệp `data/assets.js`, `data/zones.js`.

`level.py` chạy ~5 phút mỗi zone (16 zone ≈ 80 phút), phần lớn là nạp ~100 bundle phụ thuộc.

## Game gốc đóng gói thế nào [ĐO TRONG REPO, 2026-09-24]

- Đường dẫn: `D:\Steam\steamapps\common\Dave the Diver\DaveTheDiver_Data`. Đổi bằng biến `DTD_DATA`.
- 3.967 bundle Addressables tên băm ở `StreamingAssets/aa/StandaloneWindows64`, **không mã hoá**.
  - Tên asset gốc nằm trong `m_Container` của object `AssetBundle` mỗi bundle.
  - `catalog.json` có tên nhưng khó tra ngược ra bundle.
- Nhiều asset trỏ sang CAB của bundle khác (sprite trong SpriteAtlas, mesh, material).
  - `FileNotFoundError: cab-…` nghĩa là thiếu bundle phụ thuộc.
  - Bảng tra `cab` trong tệp đệm cho biết cần nạp thêm bundle nào (`with_deps` / `load_with_deps`).
- **Sáu prefab `Map_A01..A06` nằm chung MỘT bundle.** Lấy cả tệp thì mỗi map ra y hệt nhau.
  - Phải đi từ GameObject gốc của prefab xuống cây con (`prefab_root` + `walk_roles`).
  - Lần đầu đã sập bẫy này: 6 tệp .glb cùng md5.

### Dave
- Sprite pixel 120×120, pivot giữa, 100 px/đơn vị.
- 788 khung nằm trong một SpriteAtlas: `Common/Sprites/Player/Atlas/01_Default_Atlas.spriteatlas`.
- Tên khung là `<Dãy><số>`. Lớp tay cầm súng (`…Arms`, `HookAttackArm`) là một khung không có số, pivot ở vai.
- Mọi dãy bơi, kể cả Up/Down, đều vẽ nằm ngang quay sang phải. Game xoay cả sprite theo hướng bơi.
- Fps đọc từ `m_SampleRate` của AnimationClip:
  - Idle: 6.
  - Move*: 9.
  - HookAttackFire: 15.

### Cá
- Loài vẽ 2D là Spine **4.0.37** (skel nhị phân).
  - Runtime khớp là `spine-threejs 4.0.31` (npm).
- Cá mập, cá ngừ lớn và nhiều boss là mô hình 3D, không có `.skel`.
- Bảng số gốc là `GameDataSheet/DR_GameData_Fish.json`.
  - Nhiều khối JSON nối bằng `@/`.
  - Khối `FishInfoData` có HP, Damage, FishActiveType (1 = hung), FishSizeType, ItemIcon.
  - TID khớp tên prefab `SA_<TID>_<Tên>.prefab`.
- Một vài TID trỏ nhầm thư mục. Ví dụ 2010061 BlueFin_Tuna trỏ vào skel của cá vẹt, nên đã bỏ.

### Bản đồ (zone)
- Hố Xanh là 2.5D. Vách, đá, san hô là mesh 3D; Dave, cá, rong nhỏ là phẳng. Camera Perspective, fov 38°.
- 16 zone, mỗi zone một scene `001DR/<A|B|C>_Scenes/<map>_<nối trên>_<nối dưới>[_Night].unity`:
  A01 A02 A03 A04 A05 A06, A03N A04N, B01 B02 B03 B04 B06, B04N, C03 C04.
- **Luật nối:** zone Y xếp dưới zone X được khi mã trên của Y = mã dưới của X.
  - A01/A02/A05 (dưới `01`) → B01/B02 (trên `01`).
  - A03/A04/A06 (dưới `02`) → B03/B04/B06 (trên `02`).
  - B01/B02/B04 (dưới `01`) → C03 (trên `01`).
  - B03/B06 (dưới `02`) → C04 (trên `02`).
- Mỗi scene có gốc toạ độ riêng. Vách A y≈-36..29, B y≈-70..29, C y≈-108..27; x≈-76..75. Ghép tầng thì runtime tự dời y.
- Trong scene:
  - Va chạm là các `PolygonCollider2D` tên `MapCollderObj(Clone)`.
  - Điểm xuống nước: `SceneStartPoint` có `MyStartPtId` 0 (mọi scene A, cùng chỗ -57,25), không thì `PlayerSpawnPoint`. B, C không có.
  - Phao thoát là `EscapePodZone`, rương oxy là `SpawnerChestO2`.
  - `CameraBound` chỉ scene A có. B, C chỉ có `UpBound/BottomBound/...` nên `cameraBound` = null.

#### Phần nhìn lấy từ prefab Terrain, không đoán theo tên
- Scene không trỏ thẳng tới prefab hình. Nó có `AssetReplacerLoader` nạp addressable `<scene>_Terrain`
  = `001DR/Terrains/<scene>_Terrain.prefab`, kể cả bản `_Night`.
- Prefab này đã gộp đúng thứ game đặt: vách `Map_*`, đá `3dRock_*`, khối `Map_TB_*`, và mọi trang trí.
  Tất cả cùng hệ toạ độ với scene, không cần dời.
- **Bẫy đã sập:** bản cũ ghép prefab theo tên (`Map_Axx` + `3dRock_Axx` + TB theo đoán) nên thiếu TB ở A02, A04, A05, A06.
  - Thực tế A02, A05 dùng `Map_TB_A01_0101`; A04, A06 dùng `Map_TB_A03_0102`.
  - B02, B04 dùng `Map_TB_B01_0101`; B06 dùng `Map_TB_B03_0202`.
- Bộ trang trí theo tên nằm ở `00_InGame_Common/Prefabs/Seeweed/{ALevel,BLevel,CLevel}` (`2DCoralSprites_X`, `3dCoral_X`, …).
  Terrain đã chứa chúng rồi, nên KHÔNG nạp lại (A02a là map khác, không dùng).
- Night: A03N dùng `3DCoral_A03_Night` + `3DSeaAnemone_A03_Night` (vật liệu `_Glow`). Còn lại giống bản ngày.
- `Back_new` (40 cụm tảo bẹ nền) không có trong Terrain nào. Chỉ `kelpColony_A06` trỏ tới nó qua `SwitchReplacer`
  (Back_new cho PC, `Back_new_ForSwitch` cho Switch). Vì vậy tool thêm tay vào A06 (`EXTRA`).
- Bỏ qua: `ExFar2D` (đang tắt). Rong Spine (`2DCoralSprites_B0x_Side`, `2DCoralSprites_Waveweed_C0x`) có mesh sinh lúc chạy,
  không có trong glb. Vị trí của chúng ghi vào `zones.js` → `spines` (tên skel, anim, pos, ma trận 2×2).

#### Vai trò (tiền tố tên material, vì gltfpack bỏ tên node)
| vai trò | con cấp 1 của Terrain | shader gốc |
|---|---|---|
| `rock` | `Map_*`, `3dRock_*`, `Map_TB_*`, `Map_D01`, `Octopus_Shortcut_*` | `ProjectDR/2D_Sprite_Uber` (4 submesh Top/Side/Bottom/Edge) |
| `coral3d` | `3dCoral_*` | `ProjectDR/2D_Sprite_Uber`, 1 ảnh `CoralReef_001` 1024² |
| `anemone` | `3DSeaAnemone_*` | `ProjectDR/2D_Sprite_Uber`. Mỗi cây = MeshRenderer gốc + SkinnedMeshRenderer tua (Animator). |
| `waveweed` | `2DWaveweed_*` | `Shader Graphs/3D_GrassWave`: màu trộn 2 màu, ảnh chỉ là khuôn trắng |
| `kelp`, `back` | `kelpColony_A06`, `Back_new` | `Custom/2D_PhysicallySeaweed_NoShadow` (3 màu + Verlet) |
| `prop` | xác tàu, cửa Merman, lươn vườn, bộ xương cá voi, nhà Merman | chủ yếu `2D_Sprite_Uber` |
| `sprites` | mọi `SpriteRenderer` bật (2DCoralSprites, 2DStalactiteSprites, xác tàu, biển báo) | `2D_Sprite_Uber` |

- Uber tô màu bằng cờ riêng, không có `_Color`:
  - `_DiffuseBright` chỉ ăn khi `_DIFFUSEBRIGHT`=1 → baseColorFactor.
  - `_HSL` → extras `hsl` [hue, sat, light].
  - `_OVERLAYCOLOR` → `overlay` rgba.
  - `_GLOW` + `_GlowMaskTex` → emissiveTexture + extras `glow` (cường độ).
  - `_CullMode` 0 → doubleSided.
- Shader lẻ khác:
  - `Custom/SkinInstancing` (bản GPU-instancing của vài hải quỳ, ảnh ở `_BaseMap`);
  - `ProjectDR/3D_Dave_Uber` (lươn vườn, đèn Merman);
  - `Shader Graphs/3D_DefaultLM`.
  - Các shader này chỉ chép màu/số vào extras `colors`/`floats`.
- `COLOR_0` chỉ có ở sprite (tint), 52 primitive rock và 2 prop. Chưa rõ Uber có dùng màu đỉnh của đá không, nên runtime chỉ nên bật vertexColors cho `sprites`.
- Mesh skinned (tua hải quỳ, tảo bẹ) được nướng về tư thế đang lưu trong prefab: xương thế giới × bindpose.
- Sprite gộp thành MỘT mesh + MỘT atlas mỗi zone, material `sprites:deco_sprites`.
  - Mỗi quad lấy rect/ppu/pivot/flip + ma trận thế giới đầy đủ; `m_Color` của SpriteRenderer vào `COLOR_0`.
  - Atlas: lề 2 px kéo dài mép, sampler NEAREST. Mọi zone đều vừa ≤1024 px không phải thu nhỏ.

#### Nén và số đo
- `gltfpack -cc -km -ke -mm`, KHÔNG `-kn`: mesh cùng material gộp thành một draw call.
  - **Bẫy:** thiếu `-mm` thì bản sao dùng chung một mesh vẫn tách riêng (A01: 746 primitive thay vì 26).
  - `-km` giữ tên material (mang vai trò), `-ke` giữ extras.
  - three.js cần `MeshoptDecoder`. Ảnh > 1024 px thu về 1024.
- Kiểm tệp đã nén: `gltfpack -i X.glb -o dec.glb -noq` giải ngược ra số thật (accessor nén không có min/max).

Số đo lần chạy 2026-09-24. Đếm theo renderer; một cây hải quỳ = 1 MeshRenderer + 1–2 skinned. Mọi atlas sprite vừa 1024 px, không phải thu nhỏ.

| zone | glb KB | draw call | sprite | coral3d | anemone | waveweed | kelp+back | prop | spine | sương | ambient y0→y1 | nhóm mặc định / biến thể |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A01 | 2673 | 26 | 435 | 433 | 517 | 69 | 0 | 0 | 0 | 0.110,0.478,0.839 | 9→-37 | Day / Evening,EveningRain,Luminous,Rain |
| A02 | 2898 | 26 | 460 | 517 | 517 | 62 | 0 | 0 | 0 | 0.110,0.478,0.839 | 9→-37 | Day / Evening,EveningRain,Luminous,Rain |
| A03 | 2889 | 31 | 623 | 392 | 656 | 87 | 0 | 0 | 0 | 0.110,0.478,0.839 | 9→-37 | Day / Evening,EveningRain,Luminous,Rain |
| A04 | 2387 | 27 | 560 | 418 | 485 | 84 | 0 | 0 | 0 | 0.110,0.478,0.839 | 9→-37 | Day / Evening,EveningRain,Luminous,Rain |
| A05 | 2722 | 26 | 407 | 416 | 524 | 67 | 0 | 0 | 0 | 0.110,0.478,0.839 | 9→-37 | Day / Evening,EveningRain,Luminous,Rain |
| A06 | 2434 | 20 | 313 | 462 | 0 | 0 | 217 | 0 | 0 | 0.110,0.478,0.839 | 9→-37 | Day / Evening,EveningRain,Luminous,Rain |
| A03N | 3050 | 38 | 623 | 390 | 650 | 87 | 0 | 0 | 0 | 0.110,0.478,0.839 | 9→-37 | Evening / Day,EveningRain,Luminous,Rain |
| A04N | 2566 | 29 | 560 | 424 | 485 | 84 | 0 | 0 | 0 | 0.110,0.478,0.839 | 9→-37 | Evening / Day,EveningRain,Luminous,Rain |
| B01 | 2994 | 23 | 815 | 649 | 0 | 178 | 0 | 152 | 8 | 0.169,0.311,0.453 | 10→-64 | Day / Evening,Rain |
| B02 | 3008 | 21 | 775 | 598 | 0 | 154 | 0 | 163 | 6 | 0.169,0.311,0.453 | 10→-64 | Day / Evening,Rain |
| B03 | 2535 | 23 | 692 | 517 | 0 | 61 | 0 | 151 | 7 | 0.169,0.311,0.453 | 10→-64 | Day / Evening,Rain |
| B04 | 2566 | 19 | 861 | 624 | 0 | 123 | 0 | 76 | 3 | 0.169,0.311,0.453 | 10→-64 | Day / Evening,Rain |
| B06 | 2727 | 23 | 684 | 410 | 0 | 54 | 0 | 150 | 6 | 0.169,0.311,0.453 | 10→-64 | Day / Evening,Rain |
| B04N | 2502 | 18 | 861 | 624 | 0 | 123 | 0 | 60 | 3 | 0.169,0.311,0.453 | 10→-64 | Evening / Day,Rain |
| C03 | 2967 | 29 | 574 | 0 | 0 | 0 | 0 | 6 | 99 | 0.039,0.161,0.282 | -64→-167 | Base |
| C04 | 2860 | 29 | 517 | 0 | 0 | 0 | 0 | 6 | 121 | 0.039,0.161,0.282 | -64→-167 | Base |

- `back` của A06 (Back_new) cao tới y=57, trên mặt nước. Nó nằm sâu phía sau (z Unity 3..36), đúng như prefab gốc.
- Ambient C lerp từ y -64 → -167, phần lớn nằm dưới đáy vách C (-108). Đây là số gốc, không sửa.

#### Ánh sáng (`light`, `lightVariants` trong zones.js)
- `RenderSettings`: sương tuyến tính start 12, end 56.
  - Màu: A (0.110, 0.478, 0.839), B (0.169, 0.311, 0.453), C (0.039, 0.161, 0.282).
- Mỗi thời tiết là một nhóm `Environment_<vùng>_<Tên>` (Day, Rain, Evening, EveningRain, Luminous; C chỉ có `Environment_C`).
  Mỗi nhóm có:
  - một `GlobalAmbientController`: sương/ambient lerp theo y từ `startPos` → `endPos`;
  - các `Volume` URP;
  - `DynamicEnvironmentActivation.States` = danh sách (DayTime, Weather) bật nhóm đó. DayTime 2 = đêm, Weather 0 = trời quang.
- **Chọn nhóm mặc định theo States, không theo cờ bật trong scene.**
  - Bẫy: `B04_02_01_Night` lưu `Environment_B_Day` đang bật.
  - Luật: scene ngày lấy nhóm có (0,0), scene `_Night` lấy nhóm có (2,0).
- **Ghép controller với Volume theo nhóm cha, không theo hậu tố tên profile.** Tên profile lệch:
  - `Environment_A_Evening` dùng `A_001 Global_Luminous Profile`;
  - `Environment_B_Rain` dùng `B_001 Global Profile`;
  - controller trong `Environment_B_Evening` tên `GlobalFogColor_B_Rain`.
- Volume không phải global (`m_IsGlobal` 0). Nó có BoxCollider: `region` = vùng áp dụng (xy), blendDistance 5.
  - `…_Surface` chỉ phủ gần mặt nước → `surfaceVolume`.
  - Volume tắt bên trong nhóm (vd Luminous) → null.
  - Tham số không override hoặc hiệu ứng `active` 0 → giá trị mặc định URP (bloom 0, vignette 0…).
- **Màu:** dự án ở Linear (`PlayerSettings.m_ActiveColorSpace` = 1).
  - Màu serialize là giá trị gamma/sRGB như trong Inspector (sương A = 28/122/214 trên 255). Unity tự đổi sang linear khi dựng.
  - zones.js giữ nguyên số gamma. Runtime three.js tự `convertSRGBToLinear` nếu dựng ở linear.
  - Đọc `PlayerSettings` bằng typetree phải thêm `check_read=False` (typetree lệch 4 byte).

### Tiếng
- AudioClip FSB5 trong bundle, `UnityPy` giải được thành WAV rồi `ffmpeg` ra mp3.
- Thư mục `StreamingAssets/SyncHashed` chỉ chứa một phần.
  - Tên tệp = sha256 của tên clip, khớp 624/1.547 tệp.
  - Không cần dùng thư mục này.

## Bẫy khi chạy trên máy này
- `python -c "…"` nhiều dòng hỏng vì `python` là shim `.bat`, và tham số có `|` bị cmd cắt. Ghi script ra tệp.
- `rip.py art` chỉ xoá thư mục con của nó. `art/level` thuộc `level.py`.
- `level.py`:
  - Nạp phụ thuộc phải bắc cầu. Terrain → material → texture nằm ở bundle thứ ba. Nạp một tầng thì báo `FileNotFoundError: cab-…`.
  - Mesh skinned phải đệm theo từng renderer. Đệm theo `id()` của list xương thì Python tái dùng id, và tua hải quỳ này nhận nhầm tư thế của cây khác.

## Vùng C (đáy sâu) + khoang thoát hiểm [ĐO 2026-09-24]

`FISH_TIDS` thêm 10 loài vùng C (regex `rip_fish` đã nhận sẵn chữ `C`): Chambered_Nautilus,
Fangtooth, GreatSpiderCrab (sheet ghi `Great_Spider_Crab`), Clione, Sea_Toad, Pacificfanfish,
Threetooth_Puffer, Comb_Jelly, Bloodbelly_Comb_Jelly, Red_Bream. Cả 10 đều có `anims.swim` nên
`animFor()` trong `js/fish.js` chọn được ngay không cần sửa gì; `Threetooth_Puffer` có
`defence_on/defence_idle/defence_off` nên `isPuffer()` nhận đúng như cá nóc vùng A/B.

Bỏ 10 TID còn lại trong danh sách "known C list" người giao việc đưa, kèm lý do (xem thêm
comment ngay trên `FISH_TIDS`):
- **3D, không có `.skel`:** Frilled_Shark, BluespottedStargazer, Rhinochimaeridae,
  Megamouth_Shark, Cookiecutter_Shark (đều chỉ có `.fbx`, không có thư mục `Spine/`).
- **Spine JSON, không phải `.skel` nhị phân:** ElephantFish, Salmon_Snailfish — có
  `Spine/<Tên>.json` (text, `{"skeleton":…}`) thay vì `.skel.bytes`. `rip_spine()` và
  spine-threejs runtime của game này chỉ đọc `SkeletonBinary`; muốn lấy hai loài này phải viết
  thêm nhánh `SkeletonJson`, không làm trong lượt này.
- **TID 2010206 Viperfish:** có đủ `.skel/.atlas/.png` nhưng KHÔNG có dòng nào trong
  `FishInfoData` (asset mồ côi, chắc là nội dung cắt) — không có HP/damage/rank để điền, bỏ.
- **Norway_Lobster, Eastern_Rock_Lobster (2010240/2010241):** HP 999, bắt bằng tay như tôm hùm
  vùng khác — bỏ.
- Không có loài nào trùng tên/skel kiểu "bản đêm" ở vùng C (đã so bằng tên FishName như cách làm
  ở vùng A/B).

**Tiếng vùng B/C:** không thấy BGM hay ambience loop nào riêng cho tầng giữa hay đáy sâu ngoài
`BGM_Deep_Sea.wav`/`amb_deepsea_loop.wav` đã có sẵn trong `AUDIO` (`bgm_deep`/`amb_deep`). Không
có `BGM_Medium*`, không có `amb_medium*`/`amb_depths*`, không có bảng dữ liệu nào map BGM theo
vùng lặn. Không thêm khoá `bgm_b`/`bgm_c`/`amb_b`/`amb_c` để khỏi trùng.

**Khoang thoát hiểm:** thêm `EscapePod.prefab` và `EscapePodZone.prefab` vào `PREFAB_SPRITES`.
Ra `props/Pod_ex.png` (135×400, thân khoang, tĩnh) và `props/Icon_Radios01.png` (26×44, biểu
tượng bộ đàm gọi khoang, cũng tĩnh — `AnimationClip EscapePod_Radios_Idle` không có
`m_PPtrCurves` nên không phải hoạt ảnh đổi khung hình, chỉ là property animation kiểu pulse nhẹ).
Vòng sáng quanh khoang trong bản gốc là `ParticleSystem` 3D (glow/ring/god-rays…), không xuất
được kiểu sprite — dựng lại bằng VFX glow đã có sẵn trong `VFX` (`LightCircle`, `PointLightFX`,
`E_Glow_*`) nếu cần hiệu ứng tương tự.

## Cano, súng, trang bị, quán sushi

Hai công cụ bóc riêng, ghi chép và bẫy nằm ở tệp riêng:

- `tools/rip_boat.py` → `art/boat/`, `art/gear/`, `audio/boat_*`, `audio/gun_*`, `audio/ui_*`, `data/boat_assets.js`, `data/gear_sheet.js`. Xem `README-boat.md`.
- `tools/rip_bar.py` → `art/bar/`, `audio/bar_*`, `data/bar_assets.js`. Xem `README-bar.md`.
