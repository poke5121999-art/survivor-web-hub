# Prop bản đồ, nền và cảnh màn đăng nhập (rip_map.py)

Bản cài PokéOne không có bố cục bản đồ: server gửi `MapDump` lúc vào map. Pallet Town, Route 1,
Viridian City và các phòng trong nhà ở đây dựng tay từ prefab 3D gốc. Công cụ này rút các prefab
đó thành glb, ghi kích thước từng cái, và rút luôn cảnh đảo của màn đăng nhập.

## Chạy

```
set PYTHONIOENCODING=utf-8
python games/pokeone/tools/rip_map.py                 # props + ground + title, khoảng 70 s
python games/pokeone/tools/rip_map.py props tree_2    # chỉ vài prop (gộp vào props.js cũ)
python games/pokeone/tools/rip_map_catalog.py         # tờ ảnh mọi prefab, ngoài repo, khoảng 8 phút
node test/pokeone-props.js                            # kiểm + chụp, ảnh ở %TEMP%\pokeone-props-shots
```

- Chạy lại ra đúng từng byte như cũ [ĐO TRONG REPO: chạy hai lần liền, md5 của 735 tệp khớp hết].
- Chạy đủ bộ `props` thì xoá glb và ảnh không còn dùng, rồi ghi lại bảng prop cuối tệp này.
- Cần: Python 3.8, UnityPy 1.25, numpy, Pillow, `ttg.py` cùng thư mục, Node (gltfpack 0.22.0 qua npx).

| Tệp | Việc |
|---|---|
| `rip_map.py` | Danh sách prop đã chọn (`CURATED`), ảnh nền, ghi `data/props.js` |
| `rip_map_core.py` | Đọc cây GameObject thành hình học, đổi khung toạ độ, ghi glTF rồi gọi gltfpack |
| `rip_map_title.py` | Cảnh `level1`: đảo, trời, ánh sáng, đường bay máy ảnh |
| `rip_map_catalog.py` | Rasterizer numpy vẽ ảnh thu nhỏ mọi prefab |
| `props-viewer.html` | Xem prop (`?mode=grid&page=N`) và đảo (`?mode=title&t=giây`, `&play=1` để chạy) |

## Đầu ra

- `art/map/<id>.glb`: 283 prop, ảnh dùng chung ở `art/map/tex/` (glb trỏ uri `tex/...`).
- `art/map/tex/ground_*.png`: ảnh nền (xem mục Nền).
- `art/title/island.glb` + `art/title/tex/`, và `art/title/sky_{front,back,left,right,up}.png`.
- `data/props.js`:
  - `P1.PROPS[id] = { glb, min, max, tags, use, src, legacyScale?, atlasCell? }`
  - `P1.GROUND`: atlas ô nền, ảnh nền, nước.
  - `P1.TITLE_SCENE`: glb, máy ảnh + đường bay, trời, ánh sáng, hậu kỳ.
- Ngoài repo, `D:\pokeone-ref\catalog\`:
  - `props\props_000..047.png`: 3.769 prefab, lưới 10×8. Nhãn gồm tên, bundle, `L` nếu là nhóm cũ, cỡ tính theo ô.
  - `props\index.tsv`: tên, bundle, tờ, ô, đường dẫn container.
  - `tiles\tiles1_rows_*.png`: mọi ô của atlas nền, ghi `(c,r)`.
- Dung lượng [ĐO TRONG REPO]: `art/map` 9,8 MB (glb 1,9 MB, còn lại là ảnh), `art/title` 5,6 MB.

## Khung toạ độ và tỉ lệ [ĐO TRONG REPO]

- **Một ô bản đồ = 1 đơn vị Unity.**
  - Tên prefab ghi số ô, và cỡ đo được khớp đúng: `counterx3` rộng 3,00; `int_mat_4_x_4` 3,97×4,03; `cliff4_rightwall_4x` dài 4,00; `shadow_1x1` 1,00.
  - `MapDump` gửi lưới `width × height` ô, cùng `TileHeights` và `MapObjectStruct {x,y,z,rx,ry,rz,Name}` (dump.cs). Không có trường scale.
- **Có hai nhóm prefab.**
  - Nhóm cũ, dựng theo HGSS, lấy **16,6 đơn vị = 1 ô**. Ví dụ `jetty_3x3` = 49,8 = 3×16,6; `pokemongrass_4x4` = 66,4; `bridge_wood_3_x_6` = 99,6×49,8.
  - `rip_map.py` nhân nhóm cũ với 1/16,6 cho cùng lưới với nhóm mới. Prop đó có `legacyScale: 0.060241` và thẻ `legacy`.
  - Cách nhận: cạnh AABB gốc lớn hơn 12. Riêng `flowers_2` phải ép tay (xem bẫy).
  - Game gốc thu nhóm cũ bằng cách nào thì chưa tìm ra [SUY RA]. Mã `MapManager` bị mã hoá, xem bẫy.
- **Cỡ tham chiếu**, tính theo ô, `x × cao × z`:

  | Vật | Cỡ |
  |---|---|
  | Cửa nhà `door_ext_*` | 1,1 × 1,8 |
  | Nhà Pallet `ext_house_pallettown_1` | 4,9 × 4,2 × 3,6 |
  | Trung tâm Pokémon `ext_building_pockiecenter` | 7,6 × 5,2 × 6,1 |
  | Poké Mart `ext_building_shop` | 7,5 × 5,1 × 4,9 |
  | Nhà thi đấu `ext_gym` | 8,3 × 3,9 × 4,3 |
  | Lab Oak `ext_house_oak` | 7,5 × 4,6 × 3,9 |
  | Cây viền `tree_2` | 2 × 3,3 × 2, tâm ở góc ô |
  | Thông `tree_2_light` | 2,5 × 3,3 |
  | Cỏ cao `pokemongrass_1x1` | đúng 1 × 0,3 × 1, gốc ở góc ô |
  | Cỏ `tallgrass` | 1,5 × 0,9, lá xoè tràn sang ô bên |
  | Gờ nhảy `jump_middle` | 1 ô |

  Vì vậy lưới 1 đơn vị là đủ cho tác giả map.
- **Khung toạ độ glb = three.js.**
  - Đảo trục **x** của Unity, không đảo z. Đơn vị giữ nguyên. Tam giác đảo chiều quay.
  - Lý do: máy ảnh PokéOne đứng phía +z Unity nhìn về -z. Mặt tiền nhà quay về +z, còn **mặt sau nhà bỏ trống** (không có tường).
  - Đảo x thì máy ảnh chơi trong three.js cũng đặt ở +z nhìn về -z như mặc định. Vật bên phải màn hình game vẫn ở bên phải.
- **Pivot = gốc prefab.** Vị trí và góc xoay của gốc bị bỏ, chỉ giữ scale của gốc. Game đặt prefab bằng x,y,z và rx,ry,rz của `MapObjectStruct`.
  - Nhiều mảnh theo ô có gốc ở một góc ô, không ở tâm. Ví dụ `pokemongrass_1x1` nằm trong x ∈ [0,1], z ∈ [0,1].
  - Luôn căn theo `min`/`max`, đừng giả định vật nằm giữa gốc.
- **Material** (giữ trong `extras` của glb, three.js đọc ở `material.userData`):
  - `shader`: tên shader gốc.
  - `vcol`: shader có dùng màu đỉnh không.
  - `atlasCell`, `nightColor` (cửa sổ `PSX/Windows` sáng đèn ban đêm), `water`, `additive`.
  - Cắt alpha (`MASK`, hai mặt) cho lá cây, cỏ, hoa, lấy theo `_Mode`/`_ALPHATEST_ON`/shader Cutout và `_Cutoff` gốc.
  - Standard opaque bỏ qua kênh alpha của ảnh, như Unity.

## Nền được vẽ thế nào [ĐO TRONG REPO trừ chỗ ghi khác]

- **Map chơi dựng nền bằng lưới ô, không có mesh nền.**
  - `MapManager` (level2) giữ `TileMaterial[2]` = material `1`, `2` (shader `Custom/Tiles`, ảnh atlas `1`, `2` cỡ 2048², RGBA32). Thêm `WaterMaterial`, `TilePrefab`, `WaterPrefab`.
  - Hàm có tên `BuildChunkSingleThreaded`, `AddVerticies(..., SideType Top/Left/Front/Right)`, `AddUVs/AddColors(tileType)`, `GetTileUV(tileType)`.
  - Tức là mỗi ô là một quad 1×1 lấy UV vào một ô atlas. Chỗ chênh `TileHeights` thì dựng thêm tường (Left/Front/Right). Màu đỉnh tô theo loại ô.
  - `Settings.Tileset` chọn atlas 1 hay 2.
  - Đọc `MapManager` qua typetree hỏng, nên đọc tay các PPtr ở cuối dữ liệu thô (`export_ground`).
- **Atlas** (`P1.GROUND.atlas`, `art/map/tex/ground_tiles1.png`):
  - 64×64 ô, mỗi ô 32 px.
  - Ô `(c, r)` có UV từ `(c/64, r/64)` tới `((c+1)/64, (r+1)/64)`. `r` đếm từ **đáy** ảnh, như UV Unity. three.js `TextureLoader` mặc định lật y nên dùng thẳng được.
  - Bằng chứng: material `Custom/Primitive*` trong mdata ghi `_TileX/_TileY` là bội số 1/64. `101to_kotoki_kusa_b` (kusa = cỏ) = (31,3) ra đúng ô cỏ xanh; `d111r_wground` = (30,4) ra ô đá xám.
  - `P1.GROUND.atlas.named` giữ 7 tên tin được. Tra ô bằng mắt ở `D:\pokeone-ref\catalog\tiles`.
  - **Chưa có bảng `tileType → (c, r)`.** `GetTileUV` nằm trong mã bị mã hoá. [SUY RA] nhiều khả năng là `c = t % 64`, hàng tính từ trên hoặc dưới. Tác giả map chọn ô trực tiếp bằng `(c, r)`.
- **Tái tạo trong three.js**:
  - Mỗi ô: quad 1×1 ở `y = TileHeights`, UV như trên, `MeshLambertMaterial({ map: atlas, alphaTest: 0.5, vertexColors })`. `Custom/Tiles` = ảnh × `_Color` × màu đỉnh, cắt alpha 0,5, có chiếu sáng.
  - Đặt `magFilter = NearestFilter` để giữ nét pixel-art 32 px.
  - Không bật mipmap, hoặc chừa viền ô: atlas dán sát, mipmap sẽ lem màu ô bên cạnh [SUY RA].
  - Gộp cả map thành một BufferGeometry.
- **Đảo màn đăng nhập thì khác: là mesh sơn màu đỉnh.**
  - `PaintTerrain` trên node `Island` nạp TextAsset `MapVertex`: 13.671 × `Vector3` float, đúng bằng số đỉnh mesh. Giá trị xám 0,47..1,27, ghi vào `mesh.colors`.
  - Material `Grass` (Custom/Tiles) lặp ảnh `Grass` 128 px với tiling 0,5. Đường đi, cát, vách là submesh riêng (`GrassgrassPath`, `Sand`, `Cliff_2`...).
  - `LoadVertexPaint` làm việc tương tự cho bản đồ bay Unova ở level2 (`unovaPaint0..2`).
  - Không có "Special Grass" riêng. Cỏ gặp Pokémon là prefab `pokemongrass_*` / `tallgrass*`, ảnh `enc_grass` ở sharedassets2.
- **Ảnh nền đã rút**: `ground_{grass, grass_path, dirt_path, dirt_path_solid, sand, sand_to_water, ground, cliff1, cliff2, enc_grass, water, water_normal}.png`.
- **Nước** (`P1.GROUND.water`):
  - `PSX/Water2`, màu (0,039, 0,239, 0,463), `_Transparency` 0,85, ảnh `ground_water.png` và `ground_water_normal.png`.
  - `MapManager` đổi màu theo map: `WaterColourNormal/Cave/Spooky`.
  - Nước ở map là `WaterPrefab` theo ô (`TileWater`). Prop `waves*` là gợn sóng đặt lên trên.
- **Bờ nước `ground_grass_to_water_*` và `wateredge*` là vách đất một mặt** (shader `Custom/Primitive`, ảnh atlas `1`).
  - Game gọi `PaintPrimitiveTile(obj, tileID)` để đổi ô atlas cho khớp nền map.
  - glb mang ô mặc định của material `(1,62)`, trông như cát nâu. Prop loại này có `atlasCell` và thẻ `atlas-cell`. Muốn khác màu thì đổi `offset` của `map`.

## Cảnh màn đăng nhập (`P1.TITLE_SCENE`) [ĐO TRONG REPO]

- **Nội dung**:
  - `level1/Scene`: `Island` (mesh sơn đỉnh), `Beach`, `Volcano`, `Bridge1`, `SSAnne`.
  - `Buildings/Locations`: nhà thu nhỏ của 26 thành phố Kanto/Johto.
  - `Nature`: 105 cây cọ, `Trees` đã gộp mesh, 190 hoa/bụi.
  - Nước: `Water`, `Water (1)`, `WaterDam`. Mặt nước rộng ±1.750.
  - Bỏ `Lava_sparks` (hạt).
- **Máy ảnh**: `fov` 60 (dọc), near 0,3, far 700.
- **Chuyển động**:
  - `Main Camera` có `PlayableDirector` phát timeline `Login`, `DirectorWrapMode` = Loop.
  - Timeline có một `AnimationTrack` với clip vô hạn `Recorded`: 163,2 s, 60 fps, 6 đường cong streamed Hermite (vị trí xyz, Euler xyz).
  - Công thức: vị trí thế giới = `OpenClipOffsetPosition` (612,3; 87,6; 291,5) + R(`OpenClipOffsetEulerAngles` 36,8°; 182,7°; 0) × vị trí clip. Góc xoay = R(offset) × R(Euler clip).
  - Kiểm: ở t=0 công thức ra (562,30; 87,60; 258,10). Transform lưu trong scene là (562,04; 87,69; 258,11), hướng nhìn khớp tới 3 chữ số.
  - Đường bay là một vòng khép kín, dài khoảng 2.970 đơn vị, trung bình 18 đơn vị/s, cao 43..152.
  - Chặng bay (toạ độ three.js): mở từ (−562, 88, 258) nhìn xuống vịnh; t=40 s ở (−4, 126, 225); t=60 s sà thấp (84, 45, 91) qua Viridian; t=80..100 s sang (277..464); t=120 s ở (45, 82, 363); t=160 s về chỗ cũ.
  - `camera.path` lấy mẫu mỗi 0,25 s (654 mẫu, vị trí + quaternion three.js). Nội suy tuyến tính + slerp, lặp theo `duration`. `props-viewer.html` có hàm `poseAt` mẫu.
- **Trời**:
  - `Skybox/6 Sided` "Sunny 03A", tint 0,5 (= trung tính), exposure 1. Chỉ có 5 mặt, không có mặt dưới.
  - Hướng từng mặt trong three.js ở `sky.threeDir`: front +z, back −z, left −x, right +x, up +y.
  - Viewer dựng hộp 5 mặt quanh máy ảnh, cạnh `0,55 × far`, tắt depthTest. Đã soát 8 hướng nhìn, không lộ đường ghép.
- **Ánh sáng**:
  - Directional trắng, cường độ 0,5, hướng chiếu (−0,321; −0,766; −0,557).
  - Ambient Flat (0,617; 0,624; 0,644).
  - Sương tuyến tính màu (0,32; 0,65; 0,99) từ 350 tới 500.
  - Hậu kỳ `ColorGrading`: ACES, `postExposure` +1 EV, nhiệt độ +25.
  - Viewer dùng ACES, phơi sáng 2 × 0,8 và mặt trời × 2 cho gần màu game. Đây là chỉnh bằng mắt [SUY RA], không đo.

## Bẫy

- **[BẪY ĐÃ SẬP] Đảo trục z làm nhà quay lưng về máy ảnh.**
  - Lần đầu đảo z như Hố Xanh. Lưới prop nhìn từ +z thấy nhà mất tường trước.
  - Thật ra nhà chỉ có mặt tiền, mặt sau để trống, và mặt tiền quay về +z Unity.
  - Đổi sang đảo x (`FLIP` trong `rip_map_core.py`).
- **[BẪY ĐÃ SẬP] Máy ảnh nhìn lên trời.** Máy ảnh Unity nhìn theo +z cục bộ, three.js theo −z. Sau khi soi gương phải nhân thêm nửa vòng quanh y (`to_three_quat(camera=True)`).
- **[BẪY ĐÃ SẬP] Trời thủng một ô vuông màu sương.** Hộp trời cạnh 600 có góc ở 1.039, xa hơn far = 700, nên bị cắt. Giờ cạnh = 0,55 × far.
- **[BẪY ĐÃ SẬP] Hai tỉ lệ prefab.**
  - Cây/cỏ/hàng rào nhóm cũ to gấp 16,6 lần nhà nhóm mới.
  - `flowers_2` rộng 7,8 (< 12) nhưng nằm lệch gốc 4..12 đơn vị, nên thực ra là nhóm cũ: ép bằng `LEGACY_FORCE`.
  - Thẻ `legacy` tự gán theo cỡ đo. Đoán tay theo tên sai tới 20 cái.
- **[BẪY ĐÃ SẬP] 41 prefab lỗi "unity default resources not found".** Đèn đường, cửa... dùng mesh dựng sẵn của Unity (Quad 10210, Plane 10209, Cylinder 10206, Cube 10202, Sphere 10207). `rip_map_core._builtin` dựng lại theo kích thước chuẩn.
- **[BẪY ĐÃ SẬP] Đọc shader của 3.263 material mất hơn 2 phút.** `Shader.read()` phân tích cả blob. Nhớ tên theo PPtr (`_SHADER`).
- **[BẪY ĐÃ SẬP] `npx gltfpack` mỗi lần mất khoảng 2 s** (283 prop ≈ 10 phút). Gọi thẳng `cli.js` 0.22.0 trong bộ đệm npx: cả bộ còn khoảng 40 s.
- **[BẪY ĐÃ SẬP] Typetree của `MapManager` đọc hỏng** (`read_int64 out of bounds`). Các PPtr cuối lớp (`TileMaterial[]`, `WaterMaterial`, `MapLabel`) đọc ngược từ cuối dữ liệu thô.
- **[BẪY ĐÃ SẬP] Không dịch ngược được `GetTileUV`.** Byte ở RVA 0xB36890 của GameAssembly.dll toàn số 0 khi đọc tĩnh: mã được giải lúc chạy.
- **[BẪY ĐÃ SẬP] Tên ô atlas giả.**
  - 4 material `Custom/Primitive` (`Grass`, `Rock`, `CaveTile`, `WaterEdge`) cùng trỏ ô (1,62), ảnh là ô cát nâu. `GrassMain` trỏ ô đen.
  - Là giá trị mặc định/cũ, đã lọc khỏi `named`.
- **[BẪY ĐÃ SẬP] Màu đỉnh > 1 bị kẹp.** `MapVertex` sáng tới 1,27, gltfpack lượng tử hoá màu về [0,1]. Chia màu đỉnh, nhân lại vào `baseColorFactor` (`extras.vcolScale`).
- `int_house_1`, `int_house_1_upstairs` chỉ có tường. Sàn nhà lát bằng ô atlas. `interior_blank_room_*`, `interior_lab_3`, `pokiecentre` thì có sàn.
- Gờ nhảy `jump_*` là dải bán trong suốt phủ lên ô cỏ, không phải khối.
- `python -c` nhiều dòng hỏng vì `python` là shim cmd. Viết script ra tệp (xem `brain/codebase/ui-test-gotchas.md`).

## Thiếu / chưa làm

- Không có bố cục map gốc. Không có bảng `tileType → ô atlas` (mã bị mã hoá).
- Hoa `animatedflowers*`, sóng `waves*`, cối xay: anim/UV-scroll gốc không rút, glb tĩnh.
- Shader `PSX/Water2` (khúc xạ, bọt) và đèn cửa sổ ban đêm không dựng lại, chỉ ghi tham số.
- Không có vỏ phòng riêng cho Poké Mart. Dùng `interior_blank_room_1` + đồ `mart-int`.
- Lab Oak có ba ứng viên (`ext_house_oak`, `ext_house_profesor`, `ext_building_lab`). Chưa có ảnh chụp game để chốt cái PokéOne dùng.
- Trời không có mặt dưới (material gốc cũng không có).

## Bảng prop đã chọn

`(L)` = nhóm cũ, đã nhân 1/16,6. Cỡ tính theo ô, khung three.js. Chọn bằng mắt trên tờ ảnh `D:\pokeone-ref\catalog\props`. Cần thêm thì thêm vào `CURATED` trong `rip_map.py`.

<!-- BẢNG PROP: rip_map.py tự ghi -->

**house**

| id | cỡ x×y×z (ô) | gợi ý |
|---|---|---|
| `ext_house_pallettown_1` | 4.9×4.2×3.6 | Nhà dân Pallet mái đỏ (nhà người chơi); mặt tiền +z có lỗ cửa, lắp door_ext_* vào; mặt sau bỏ trống |
| `ext_house_pallettown_2` | 5.0×3.8×3.6 | Nhà dân Pallet mái đỏ có cửa sổ mái (nhà Blue) |
| `ext_veridian_house_1` | 5.0×3.5×3.2 | Nhà dân Viridian mái đỏ thấp |
| `ext_house_kanto5_1` | 4.8×3.8×3.6 | Nhà Kanto mái xanh rêu, dùng rải cho Viridian |
| `ext_house_kanto5_2` | 4.8×3.8×3.6 | Nhà Kanto mái nâu đỏ |
| `ext_house_kanto5_3` | 4.8×3.8×3.6 | Nhà Kanto mái nâu đỏ (bản 2) |
| `ext_house_kanto5_4` | 4.8×3.9×3.6 | Nhà Kanto mái xanh lam |
| `ext_house_kanto5_5` | 4.8×3.8×3.8 | Nhà Kanto mái xanh lam (bản 2) |
| `ext_house_kanto5_6` | 4.8×3.8×3.8 | Nhà Kanto mái xanh lam (bản 3) |
| `house_a_1` (L) | 4.4×3.9×5.4 | Nhà nhỏ mái hồng (nhóm cũ HGSS) |
| `house_a_3` (L) | 4.4×4.0×5.4 | Nhà nhỏ mái xanh (nhóm cũ HGSS) |

**lab**

| id | cỡ x×y×z (ô) | gợi ý |
|---|---|---|
| `ext_house_oak` | 7.5×4.6×3.9 | Phòng thí nghiệm GS Oak kiểu HGSS: tường kem, mái bằng |
| `ext_house_profesor` | 9.2×5.9×5.0 | Nhà lớn mái cam - phương án khác cho lab Oak |
| `ext_building_lab` | 6.5×4.7×3.6 | Lab mái kính tròn (kiểu lab Elm) |

**pokecenter-ext**

| id | cỡ x×y×z (ô) | gợi ý |
|---|---|---|
| `ext_building_pockiecenter` | 7.6×5.2×6.1 | Trung tâm Pokémon mái đỏ, cửa kính phía nam |
| `pokiecentre_new` (L) | 4.7×3.4×3.7 | Trung tâm Pokémon mái đỏ nhỏ (nhóm cũ, kiểu HGSS) |
| `pokiecentre_doors` (L) | 1.6×1.6×0.6 | Cửa kính trượt Trung tâm Pokémon |

**mart-ext**

| id | cỡ x×y×z (ô) | gợi ý |
|---|---|---|
| `ext_building_shop` | 7.5×5.1×4.9 | Poké Mart mái phẳng, biển xanh |
| `ext_shop` | 7.2×5.0×4.6 | Poké Mart (bản 2) |
| `pokieshop` (L) | 4.2×3.2×3.8 | Poké Mart mái xanh nhỏ (nhóm cũ, kiểu HGSS) |
| `shopdoors` (L) | 1.2×2.0×0.2 | Cửa kính xanh Poké Mart |

**gym-ext**

| id | cỡ x×y×z (ô) | gợi ý |
|---|---|---|
| `ext_gym` (L) | 8.3×3.9×4.3 | Nhà thi đấu (Viridian Gym) |
| `gym_sign` (L) | 1.4×1.1×0.6 | Bảng tên nhà thi đấu |

**door**

| id | cỡ x×y×z (ô) | gợi ý |
|---|---|---|
| `door_ext_brownhouse` (L) | 1.1×1.8×0.3 | Cửa gỗ nâu cho nhà dân |
| `door_ext_bluehouse` (L) | 1.1×1.8×0.3 | Cửa xanh than |
| `door_ext_greenhouse` (L) | 1.1×1.8×0.3 | Cửa xanh lá đậm |
| `door_ext_greyhouse` (L) | 1.1×1.8×0.3 | Cửa trắng xám |
| `door_ext_blue` (L) | 1.1×1.8×0.3 | Cửa xanh da trời |
| `door_ext_green` (L) | 1.1×1.8×0.3 | Cửa xanh lá nhạt |
| `door_ext_old` (L) | 1.1×1.8×0.3 | Cửa xanh két có ô kính |
| `door_ext_office` (L) | 1.1×1.8×0.3 | Cửa gỗ vân |
| `door_ext_yellow` (L) | 1.1×1.8×0.3 | Cửa vàng nâu |
| `door_ext_pink` (L) | 1.1×1.8×0.3 | Cửa hồng |
| `door_green_oak` (L) | 1.1×1.8×0.3 | Cửa xanh lá của lab Oak |
| `doorframe` (L) | 1.5×2.2×1.3 | Khung cửa trong nhà (lối sang phòng khác) |

**doormat**

| id | cỡ x×y×z (ô) | gợi ý |
|---|---|---|
| `int_mat_2_x_1_doormat_red` | 1.5×0.0×0.8 | Thảm chùi chân 2x1 đỏ, đặt ở ô cửa ra |
| `int_mat_2_x_1_doormat_blue` | 1.5×0.0×0.8 | Thảm chùi chân 2x1 xanh |
| `int_mat_2_x_1_doormat_yellow` | 1.5×0.0×0.8 | Thảm chùi chân 2x1 vàng |
| `int_mat_yellow_2_x_1_door` | 1.4×0.0×1.0 | Thảm cửa vàng caro |
| `int_mat_1_x_2_door_blue` | 2.0×0.0×1.0 | Thảm cửa xanh 1x2 |
| `mat_01` (L) | 2.3×0.0×0.8 | Thảm đỏ dài (nhóm cũ) |

**tree**

| id | cỡ x×y×z (ô) | gợi ý |
|---|---|---|
| `tree_2` (L) | 2.0×3.3×2.0 | Cây tròn xanh đậm 2x2 ô - viền đường/viền map kiểu HGSS |
| `tree_2_light` | 2.5×3.3×2.7 | Cây thông xanh non 2,5 ô |
| `tree_2_dark` | 2.5×3.3×2.7 | Cây thông xanh đậm 2,5 ô |
| `tree_2_original` (L) | 3.2×4.2×3.2 | Cây thông mảnh (tầng lá) |
| `tree_original` (L) | 2.8×4.3×2.8 | Cây thông mảnh (nhóm cũ) |
| `tree_basic` (L) | 2.8×3.8×2.2 | Cây cành xoè lá mỏng |
| `tree_large` (L) | 8.5×11.2×6.8 | Cây cổ thụ tán rộng 8 ô |
| `tree_main` | 8.6×3.2×10.4 | Cụm 3 hàng thông xanh non (khối viền rừng 8x10 ô) |
| `ext_towntree` | 1.9×2.5×1.8 | Cây nhỏ trong thị trấn |
| `ext_tree_small` | 1.1×2.7×1.2 | Cây thông nhỏ 1 ô |
| `ext_tree_smallest_1` | 0.9×1.4×0.9 | Cây thông tí hon |
| `ext_tree_smallest_2` | 0.9×1.4×0.9 | Cây thông tí hon (bản 2) |
| `acorntree` | 0.9×1.2×0.9 | Bụi cây tròn trên đế cỏ |
| `treecut` (L) | 1.0×1.1×1.0 | Bụi chặt được (Cut) |
| `stump_1` (L) | 2.9×0.9×2.9 | Gốc cây |

**hedge**

| id | cỡ x×y×z (ô) | gợi ý |
|---|---|---|
| `hedge_1` (L) | 1.0×0.9×1.0 | Khối bụi rào 1x1 có hoa hồng |
| `hedge_1_light` (L) | 1.0×0.9×1.0 | Khối bụi rào 1x1 sáng |
| `hedge_1x6` (L) | 1.0×0.9×6.0 | Hàng rào bụi 1x6 |
| `hedge_2` (L) | 1.2×1.1×2.2 | Khối bụi rào vuông đế đất |
| `hedge_tile_corner` | 1.0×1.5×1.0 | Bụi rào dạng ô - góc |
| `hedge_tile_end` | 1.0×1.5×1.0 | Bụi rào dạng ô - đầu mút |
| `hedge_tile_left_right` | 1.0×1.5×1.0 | Bụi rào dạng ô - đoạn ngang |
| `hedge_tile_up_down` | 1.0×1.5×1.0 | Bụi rào dạng ô - đoạn dọc |
| `ext_hedge_small` | 1.0×0.7×1.0 | Bụi thấp 1 ô |
| `ext_hedge_smallx4` | 1.9×0.7×1.8 | Bụi thấp 2x2 ô |
| `hedge_shape_1` (L) | 2.4×2.2×2.4 | Bụi tỉa hình trên nền hoa (trang trí) |

**fence**

| id | cỡ x×y×z (ô) | gợi ý |
|---|---|---|
| `fence_small` (L) | 1.0×0.8×0.4 | Rào gỗ trắng đầu tròn 1 ô (Pallet) |
| `fence_small_side` (L) | 0.4×0.8×1.0 | Rào trắng đầu tròn, đoạn dọc |
| `fenceend` (L) | 0.3×0.9×0.3 | Cọc cuối rào trắng |
| `fencesidepole` (L) | 0.4×0.6×1.0 | Thanh rào trắng nằm ngang |
| `fence_roundtop_1` (L) | 0.4×0.8×1.0 | Rào trắng đầu tròn, dọc |
| `fence_roundtop_2` (L) | 1.0×0.9×0.4 | Rào trắng đầu tròn, ngang |
| `fence_02` (L) | 1.0×2.0×0.4 | Tấm rào mắt cáo gỗ |
| `ext_log_fence_pole` | 0.2×0.6×0.2 | Cọc rào gỗ tròn |
| `ext_log_fence_rail` | 1.0×0.6×0.2 | Thanh rào gỗ 1 ô |
| `ext_logpole` | 0.5×0.9×0.5 | Cọc gỗ to |
| `bikefencewhite` | 0.7×0.7×0.2 | Rào vòm trắng |

**ledge**

| id | cỡ x×y×z (ô) | gợi ý |
|---|---|---|
| `jump_left` | 0.9×0.3×0.9 | Gờ nhảy xuống (một chiều) - đầu trái |
| `jump_middle` | 1.0×0.3×0.7 | Gờ nhảy xuống - đoạn giữa, 1 ô |
| `jump_right` | 0.9×0.3×0.9 | Gờ nhảy xuống - đầu phải |

**sign**

| id | cỡ x×y×z (ô) | gợi ý |
|---|---|---|
| `sign_1` (L) | 1.8×1.8×0.6 | Bảng tin trắng chân kim loại |
| `sign_4` (L) | 1.8×1.8×0.6 | Bảng gỗ nâu 2 chân |
| `signsmall1` (L) | 0.8×1.1×0.3 | Biển nhỏ gỗ một chân (biển tên đường/thị trấn) |
| `ext_sign_log` | 1.5×1.2×0.4 | Biển gỗ khắc chữ 2 cọc |
| `ext_logsign_small` | 0.6×1.1×0.3 | Biển gỗ nhỏ |

**mailbox**

| id | cỡ x×y×z (ô) | gợi ý |
|---|---|---|
| `letterbox_1` (L) | 0.4×1.3×0.5 | Hộp thư trước nhà (nhóm cũ, kiểu HGSS) |
| `ext_letterbox_red` | 0.6×1.6×0.6 | Hộp thư đỏ |

**flower**

| id | cỡ x×y×z (ô) | gợi ý |
|---|---|---|
| `flowers` (L) | 0.9×0.0×0.9 | Ô hoa trắng mọc sát đất 1 ô (Pallet) |
| `flowers_2` (L) | 0.5×0.0×0.5 | Ô hoa trắng thưa |
| `flowers_group_1` | 1.0×0.4×0.9 | Khóm hoa nhiều màu |
| `flowers_group_2` | 0.9×0.5×0.8 | Khóm hoa tím |
| `flowers_group_3` | 0.9×0.5×0.8 | Khóm hoa vàng |
| `flowers_group_4` | 0.9×0.5×0.8 | Khóm hoa xanh lam |
| `flowers_group_5` | 1.0×0.6×0.9 | Khóm hoa hồng |
| `animatedflowers` | 0.9×0.1×0.9 | Khóm hoa đỏ cam (bản có anim ở game gốc, ở đây tĩnh) |
| `animatedflowerspink` | 0.9×0.1×0.9 | Khóm hoa hồng tím |
| `animatedflowerswhite` | 0.9×0.1×0.9 | Khóm hoa trắng |
| `plant_flowers_small` (L) | 1.0×0.4×1.0 | Bụi hoa đỏ nhỏ |

**rock**

| id | cỡ x×y×z (ô) | gợi ý |
|---|---|---|
| `rock_1` | 1.9×1.3×1.9 | Tảng đá xám |
| `rock_2` | 2.6×2.2×2.1 | Cụm đá xám |
| `rock_3` | 1.2×1.7×1.5 | Đá xám cao |
| `rock_5` | 1.6×2.5×1.9 | Đá xám dựng |
| `rock_6` | 2.0×1.7×1.9 | Cụm đá to |
| `rock_8` | 1.8×1.2×1.4 | Đá dẹt |
| `rocksmall` | 1.0×0.4×1.0 | Đá nhỏ nâu |
| `rocklarge` (L) | 1.1×1.3×1.1 | Đá to nâu |
| `pebbles` (L) | 1.0×0.0×1.0 | Sỏi rải mặt đất |

**tallgrass**

| id | cỡ x×y×z (ô) | gợi ý |
|---|---|---|
| `pokemongrass_1x1` (L) | 1.0×0.3×1.0 | Cỏ cao 1 ô - ô gặp Pokémon hoang dã (kiểu HGSS) |
| `pokemongrass_1x1_2` (L) | 1.0×0.3×1.0 | Cỏ cao 1 ô (màu 2) |
| `pokemongrass_1x1_light` (L) | 1.0×0.3×1.0 | Cỏ cao 1 ô, vàng nhạt |
| `pokemongrass_4x4` (L) | 4.0×0.3×4.0 | Cỏ cao 4x4 ô |
| `pokemongrass_4x4_light` (L) | 4.0×0.3×4.0 | Cỏ cao 4x4 ô, vàng nhạt |
| `tallgrass` | 1.5×0.9×1.5 | Cỏ cao dạng lá xoè 1 ô |
| `tallgrass_4x4` | 4.5×0.9×4.5 | Cỏ cao dạng lá xoè 4x4 |

**grass-deco**

| id | cỡ x×y×z (ô) | gợi ý |
|---|---|---|
| `ext_grassfern` | 1.1×0.4×1.1 | Bụi dương xỉ thấp 1 ô (trang trí, không gặp Pokémon) |
| `ext_grassfern_light` | 1.1×0.4×1.1 | Bụi dương xỉ vàng |
| `ext_grassfern_4x4` | 4.1×0.3×4.1 | Thảm dương xỉ 4x4 |
| `grass_weed` (L) | 1.0×0.9×0.4 | Nhúm cỏ dại |
| `grass_weededge` (L) | 1.0×0.6×0.3 | Cỏ dại mép |
| `garden_grass` | 1.2×0.8×1.2 | Bụi cỏ xanh |
| `smallplant_ground_1` | 1.1×1.3×0.9 | Cây non trồng đất |

**water**

| id | cỡ x×y×z (ô) | gợi ý |
|---|---|---|
| `waves` | 3.0×0.0×3.0 | Sóng lăn tăn trên mặt nước 3x3 |
| `wavescorner` | 3.0×0.0×3.0 | Sóng - góc ngoài |
| `wavescornerinner` | 3.0×0.0×3.0 | Sóng - góc trong |
| `wavesend` | 3.0×0.0×0.6 | Sóng - đầu mút |
| `wavesstart` | 3.0×0.0×0.5 | Sóng - đầu vào |

**shore**

| id | cỡ x×y×z (ô) | gợi ý |
|---|---|---|
| `beach_center` | 3.0×1.0×3.0 | Bãi cát 3x3 - giữa |
| `beach_fl` | 3.0×1.0×3.0 | Bờ cát/nước - góc trước trái |
| `beach_fm` | 1.0×1.0×3.0 | Bờ cát/nước - cạnh trước |
| `beach_fr` | 3.0×1.0×3.0 | Bờ cát/nước - góc trước phải |
| `beach_l` | 3.0×1.0×1.0 | Bờ cát/nước - cạnh trái |
| `beach_r` | 3.0×1.0×1.0 | Bờ cát/nước - cạnh phải |
| `beach_bl` | 3.0×1.0×3.0 | Bờ cát/nước - góc sau trái |
| `beach_bm` | 1.0×1.0×3.0 | Bờ cát/nước - cạnh sau |
| `beach_br` | 3.0×1.0×3.0 | Bờ cát/nước - góc sau phải |
| `beach_in` | 3.0×1.0×3.0 | Bờ cát - góc lõm |
| `beach_out` | 3.0×1.0×3.0 | Bờ cát - góc lồi |
| `beach_invertfl` | 3.0×1.0×3.0 | Bờ cát ngược - trước trái |
| `beach_invertfr` | 3.0×1.0×3.0 | Bờ cát ngược - trước phải |
| `beach_invertbl` | 3.0×1.0×3.0 | Bờ cát ngược - sau trái |
| `beach_invertbr` | 3.0×1.0×3.0 | Bờ cát ngược - sau phải |
| `ground_grass_to_water_edge_fm` | 1.0×1.0×1.0 | Bờ cỏ xuống nước 1 ô - cạnh trước |
| `ground_grass_to_water_edge_fl` | 1.0×1.0×1.0 | Bờ cỏ/nước - góc trước trái |
| `ground_grass_to_water_edge_fr` | 1.0×1.0×1.0 | Bờ cỏ/nước - góc trước phải |
| `ground_grass_to_water_edge_lm` | 1.0×1.0×1.0 | Bờ cỏ/nước - cạnh trái |
| `ground_grass_to_water_edge_mr` | 1.0×1.0×1.0 | Bờ cỏ/nước - cạnh phải |
| `ground_grass_to_water_edge_rl` | 1.0×1.0×1.0 | Bờ cỏ/nước - góc sau trái |
| `ground_grass_to_water_edge_rm` | 1.0×1.0×1.0 | Bờ cỏ/nước - cạnh sau |
| `ground_grass_to_water_edge_rr` | 1.0×1.0×1.0 | Bờ cỏ/nước - góc sau phải |
| `ground_grass_to_water_inner_large_fl` | 2.0×1.0×2.0 | Bờ cỏ/nước góc trong lớn 2x2 - trước trái |
| `ground_grass_to_water_inner_large_fr` | 2.0×1.0×2.0 | Bờ cỏ/nước góc trong lớn - trước phải |
| `ground_grass_to_water_inner_large_lr` | 2.0×1.0×2.0 | Bờ cỏ/nước góc trong lớn - sau trái |
| `ground_grass_to_water_inner_large_rr` | 2.0×1.0×2.0 | Bờ cỏ/nước góc trong lớn - sau phải |
| `ground_grass_to_water_isfl` | 1.0×1.0×1.0 | Bờ cỏ/nước góc trong nhỏ - trước trái |
| `ground_grass_to_water_isfr` | 1.0×1.0×1.0 | Bờ cỏ/nước góc trong nhỏ - trước phải |
| `ground_grass_to_water_isrl` | 1.0×1.0×1.0 | Bờ cỏ/nước góc trong nhỏ - sau trái |
| `ground_grass_to_water_isrr` | 1.0×1.0×1.0 | Bờ cỏ/nước góc trong nhỏ - sau phải |
| `ground_grass_to_water_hole` | 1.0×0.6×1.0 | Vũng nước 1 ô giữa cỏ |
| `wateredgefrontleft` | 0.9×1.0×1.0 | Mép vách đất xuống nước - trước trái |
| `wateredgefrontright` | 0.9×1.0×1.0 | Mép vách đất xuống nước - trước phải |
| `wateredgetopleft` | 0.9×1.0×1.0 | Mép vách đất xuống nước - sau trái |
| `wateredgetopright` | 0.9×1.0×1.0 | Mép vách đất xuống nước - sau phải |

**stairs**

| id | cỡ x×y×z (ô) | gợi ý |
|---|---|---|
| `ext_stairs_x1` | 1.2×1.0×1.2 | Bậc thềm ngoài trời rộng 1 ô, cao 1 |
| `ext_stairs_x2` | 2.2×1.0×1.2 | Bậc thềm ngoài trời rộng 2 ô |
| `ext_stairs_x3` | 3.2×1.0×1.2 | Bậc thềm ngoài trời rộng 3 ô |
| `int_stairs_main` | 1.2×2.0×2.0 | Cầu thang trong nhà - đoạn giữa |
| `int_stairs_left` | 1.0×2.0×2.0 | Cầu thang trong nhà - mép trái |
| `int_stairs_right` | 1.0×2.0×2.0 | Cầu thang trong nhà - mép phải |
| `int_stairs_top` | 1.2×0.2×2.2 | Chiếu nghỉ đầu cầu thang |
| `stairs_up_left_1` (L) | 1.9×1.7×1.7 | Cầu thang gỗ lên tầng (quay trái) - nhà người chơi |
| `stairs_up_right_1` (L) | 1.9×1.7×1.7 | Cầu thang gỗ lên tầng (quay phải) |
| `stairsdown_1` (L) | 3.0×1.3×1.6 | Lỗ cầu thang xuống ở tầng trên |

**outdoor-deco**

| id | cỡ x×y×z (ô) | gợi ý |
|---|---|---|
| `ext_bench_wood` | 1.9×0.8×0.7 | Ghế băng gỗ |
| `ext_bin` | 0.7×0.6×0.7 | Thùng rác lưới |
| `ext_lamp_01` | 1.8×3.4×0.6 | Cột đèn đường |
| `shadow_1x1` | 1.0×0.0×1.0 | Bóng đổ vuông 1 ô (đặt dưới vật) |
| `shadow_round` | 0.9×0.0×0.9 | Bóng đổ tròn |

**interior-shell**

| id | cỡ x×y×z (ô) | gợi ý |
|---|---|---|
| `int_house_1` (L) | 12.8×3.0×8.3 | Tường bao tầng trệt nhà người chơi; KHÔNG có sàn (sàn lát bằng ô atlas P1.GROUND) |
| `int_house_1_upstairs` (L) | 10.8×4.0×7.3 | Tường bao tầng lầu (phòng ngủ) nhà người chơi; không có sàn |
| `int_house_1_wall_1` (L) | 2.0×3.0×2.5 | Mảng tường trong nhà 2 ô |
| `int_house_1_wall_2` (L) | 2.0×3.0×1.5 | Mảng tường trong nhà 2 ô (bản 2) |
| `int_house_1_wall_3` (L) | 2.5×3.0×1.5 | Mảng tường trong nhà 2,5 ô |
| `interior_blank_room_1` (L) | 13.4×4.1×9.6 | Phòng trống sàn gỗ (dùng làm Poké Mart/nhà dân) |
| `interior_blank_room_2` (L) | 14.2×4.1×12.6 | Phòng trống sàn gạch |
| `interior_blank_room_3` (L) | 19.2×4.1×12.0 | Phòng trống lớn sàn gỗ |
| `interior_blank_room_4` (L) | 15.2×3.0×15.5 | Phòng trống hai gian |
| `interior_lab_3` (L) | 13.2×3.9×10.7 | Vỏ phòng thí nghiệm (lab Oak) |
| `pokiecentre` (L) | 14.7×7.9×22.8 | Vỏ Trung tâm Pokémon (sàn, tường, quầy) |

**pokecenter-int**

| id | cỡ x×y×z (ô) | gợi ý |
|---|---|---|
| `int_pokiecentre_maincounter` | 5.1×0.7×3.2 | Quầy chính Trung tâm Pokémon (chữ U, 5 ô) |
| `int_pokiecentre_maincounter_pcs` | 1.3×1.2×1.3 | Mảnh quầy có máy tính |
| `int_pokiecentre_maincounter_pokieballs` | 4.7×0.5×0.5 | Bóng Poké trên quầy |
| `int_pokiecentre_pokemonheal_machine` | 1.6×0.9×1.6 | Máy hồi phục Pokémon |
| `int_pokiecentre_pokemonheal_machine_centrre` | 1.6×0.9×1.6 | Máy hồi phục (đặt giữa quầy) |
| `int_pokiecentre_main_monitor` | 3.2×1.7×0.5 | Màn hình lớn sau quầy |
| `int_pokiecentre_loung_x1` | 1.0×0.7×0.7 | Ghế sofa xanh 1 chỗ |
| `int_pokiecentre_loung_x2` | 2.0×0.7×0.7 | Ghế sofa xanh 2 ô |
| `int_pokiecentre_loung_x3` | 3.0×0.7×0.7 | Ghế sofa xanh 3 ô |
| `int_pokiecentre_l_lounge1` | 2.9×0.7×2.9 | Sofa góc chữ L |
| `int_pokiecentre_table` | 1.4×0.4×1.3 | Bàn kính |
| `int_pokiecentre_plant` | 1.0×1.5×1.0 | Chậu cây |
| `int_pokiecentre_bookshelf` | 1.5×1.0×0.6 | Kệ sách trắng |
| `int_pokiecentre_kantomap` | 2.0×1.4×0.0 | Bản đồ Kanto treo tường |
| `int_pokiecentre_pcs_corner` | 1.7×0.7×1.6 | Góc máy tính |
| `int_pokiecentre_chair_cushion_red` | 0.6×0.4×0.6 | Ghế đôn đỏ |
| `pokiecentre_computer_1` (L) | 1.4×2.1×0.9 | Máy PC lưu trữ Pokémon |
| `int_pokepc` | 1.0×1.4×0.7 | Máy PC lưu trữ (bản mới) |

**mart-int**

| id | cỡ x×y×z (ô) | gợi ý |
|---|---|---|
| `int_counter_shop_main` | 4.7×1.6×5.8 | Quầy thu ngân Poké Mart (chữ L) |
| `int_counter_shop_blue` | 4.4×1.2×2.7 | Quầy thu ngân xanh chữ U |
| `int_counter_shop_shelf_1` | 0.6×1.1×1.8 | Kệ hàng giữa phòng |
| `int_counter_shop_shelf_2` | 0.6×1.1×1.8 | Kệ hàng giữa phòng (bản 2) |
| `int_counter_shop_shelves_wall` | 1.1×2.3×3.4 | Kệ hàng dựa tường |
| `int_counter_shop_fridge` | 2.4×2.1×0.7 | Tủ lạnh đồ uống đôi |
| `int_shop_counter_l` | 4.3×1.6×5.5 | Quầy chữ L |
| `int_shop_u_counter` | 4.4×1.2×2.9 | Quầy chữ U |
| `int_shop_corner_1` | 3.0×1.2×3.0 | Quầy góc |
| `int_shop_cupboard_potions_left_potions` | 0.6×0.9×1.9 | Tủ thuốc (trái) |
| `int_shop_cupboard_potions_right_potions` | 0.6×0.9×1.9 | Tủ thuốc (phải) |
| `int_shop_counter_displaycase` | 0.8×1.0×3.1 | Tủ kính trưng bày |
| `int_shop_counter_highshelf` | 0.5×0.8×3.0 | Kệ cao |
| `int_shop_fridge_1x` | 1.4×2.1×0.7 | Tủ lạnh đơn |
| `shelf_shop` (L) | 1.8×0.8×1.0 | Kệ hàng thấp |
| `cashier` (L) | 0.8×0.8×0.8 | Máy tính tiền |
| `int_sign_shop_logo` | 0.9×0.9×0.2 | Logo Poké Mart treo tường |

**lab-int**

| id | cỡ x×y×z (ô) | gợi ý |
|---|---|---|
| `lab_machine_2` | 2.5×2.0×2.0 | Máy trong lab (trụ xanh) |
| `lab_machine_2_computer` | 2.0×0.9×0.7 | Dãy máy tính lab |
| `lab_system` | 1.9×1.3×1.1 | Máy lồng kính |
| `lab_system2` | 1.9×1.3×1.1 | Máy lồng kính (bản 2) |
| `int_computer_profoak_1` | 2.7×1.2×2.7 | Máy tính tròn của GS Oak |
| `int_computer_profoak_2` | 1.6×0.7×0.7 | Bàn máy của GS Oak |
| `int_computer_profoak_3` | 0.7×1.0×0.9 | Tủ máy của GS Oak |
| `int_computer_profoak_4` | 2.6×1.1×1.1 | Quầy máy cong |
| `int_pokemontable` | 2.2×0.7×2.2 | Bàn đặt 3 bóng khởi đầu |
| `int_pokemontableitems` | 1.6×0.6×1.5 | Đồ trên bàn lab |
| `pokemonbookcase1` | 2.2×1.7×0.9 | Kệ sách lab đôi |
| `pokemonbookcase2` | 1.1×1.4×0.9 | Kệ sách lab đơn |
| `pokemonbookcase3` | 2.2×1.7×0.9 | Kệ sách lab đôi (bản 2) |
| `int_labcoats` | 1.5×1.2×0.2 | Áo blouse treo tường |
| `int_lab_machine_elm` | 2.5×2.1×2.0 | Máy trụ đèn đỏ |
| `lab_seed_experiment` (L) | 2.7×1.7×1.1 | Bàn thí nghiệm hạt giống |
| `int_office_whiteboard` | 3.0×1.7×0.1 | Bảng trắng |

**furniture**

| id | cỡ x×y×z (ô) | gợi ý |
|---|---|---|
| `int_bed_1_red` | 1.4×1.0×2.2 | Giường đơn chăn đỏ |
| `int_bed_1_blue` | 1.4×1.0×2.2 | Giường đơn chăn xanh |
| `int_bed_double` | 1.9×0.8×2.3 | Giường đôi |
| `bed_1` (L) | 2.0×0.8×2.0 | Giường gỗ chăn tím |
| `int_tv` | 1.8×1.2×0.8 | TV trên kệ |
| `int_tv_1` | 1.4×1.1×0.3 | TV màn phẳng |
| `int_cabinet_tv_red` | 2.2×0.5×0.8 | Kệ TV đỏ |
| `snes` (L) | 0.9×0.2×1.2 | Máy SNES (phòng người chơi) |
| `n64` (L) | 1.4×0.4×1.2 | Máy N64 |
| `gamecube` (L) | 0.9×0.3×1.2 | Máy GameCube |
| `bookshelf_1` (L) | 1.6×1.7×0.7 | Kệ sách trắng thấp |
| `bookshelf_2` (L) | 1.7×1.6×0.7 | Kệ sách trắng (bản 2) |
| `int_bookshelf_medium_lightwood` | 0.8×1.2×0.8 | Tủ gỗ sáng |
| `int_shelf_with_books_small_2` | 0.7×1.5×0.8 | Kệ sách gỗ hẹp |
| `int_table_1_red` | 1.6×0.8×1.6 | Bàn tròn khăn đỏ |
| `int_table_2` | 1.8×0.7×1.8 | Bàn gỗ mặt vàng |
| `table_house` (L) | 2.0×0.8×2.0 | Bàn khăn caro (bếp nhà người chơi) |
| `table_dinner` (L) | 1.8×1.2×1.8 | Bàn tròn |
| `int_chair_1` | 0.7×0.7×0.8 | Ghế trắng |
| `int_chair_2_red` | 0.6×0.8×0.7 | Ghế đỏ |
| `chair_wood` (L) | 0.6×0.8×0.6 | Ghế gỗ |
| `int_sofa_1_red` | 2.1×0.7×0.8 | Sofa đỏ |
| `int_cupboard_kitchen_1` | 0.8×0.7×0.7 | Tủ bếp |
| `int_kitchen_sink_1` | 2.3×0.9×0.8 | Bồn rửa + bếp |
| `int_fridge_1` | 0.8×1.6×0.8 | Tủ lạnh |
| `int_kitchencabinet_lightwood` | 1.4×1.0×0.7 | Tủ gỗ bếp |
| `int_plant_indoor_1` | 1.1×1.5×0.9 | Chậu cây cao |
| `int_plant_indoor_2` | 0.6×0.6×0.6 | Chậu cây lá to |
| `plant_in_pot_1` (L) | 1.0×1.9×1.2 | Chậu bonsai |
| `int_window_indoor_1` | 1.2×1.0×0.1 | Cửa sổ trong nhà |
| `int_windowdouble_curtian` | 2.2×1.1×0.4 | Cửa sổ đôi có rèm |
| `int_clock_wall_1` | 0.7×1.1×0.1 | Đồng hồ treo tường |
| `int_desk_01` | 2.3×0.7×0.8 | Bàn làm việc gỗ |
| `int_draws_1` | 1.7×0.7×0.8 | Tủ ngăn kéo thấp |
| `int_bedroom_desk` | 2.2×1.8×1.1 | Bàn học có kệ |
| `int_bin_red` | 0.6×0.4×0.6 | Thùng rác đỏ |

**rug**

| id | cỡ x×y×z (ô) | gợi ý |
|---|---|---|
| `int_mat_2_x_2_red_2` | 2.0×0.0×2.0 | Thảm 2x2 đỏ |
| `int_mat_3_x_3_red_2` | 3.0×0.0×3.0 | Thảm 3x3 đỏ |
| `int_mat_4_x_4_red` | 4.0×0.0×4.0 | Thảm 4x4 đỏ viền vàng |
| `int_mat_4_x_4_yellow_pb` | 2.8×0.0×2.9 | Thảm vàng hình Poké Ball |
| `int_mat_round_1` | 3.9×0.0×3.9 | Thảm tròn hồng |
| `int_carpet_transparentpokeball` | 2.0×0.0×2.0 | Hình Poké Ball dán sàn |

<!-- HẾT BẢNG PROP -->
