# Model Pokémon trận — `rip_poke.py`

Bóc model 3D dùng trong trận của PokéOne ra `art/poke/<dex>.glb`, ảnh shiny ra `art/poke/shiny/<dex>/*.png`, và ghi
`data/pokes.js` đúng hợp đồng trong `ARCH.md`.

## Chạy

```sh
set PYTHONIOENCODING=utf-8
python games/pokeone/tools/rip_poke.py          # cả ROSTER (39 loài, ~3 phút)
python games/pokeone/tools/rip_poke.py 1 25     # vài loài; pokes.js giữ bản ghi cũ của loài khác
node test/pokeone-poke.js                       # kiểm + chụp ảnh ra %TEMP%\pokeone-poke-shots
STRIPS=1,25:a3,a1 node test/pokeone-poke.js     # thêm dải 8 khung của từng clip
```

- Danh sách loài là `ROSTER` ở đầu script. Bảng vai trò clip là `ROLES` ngay dưới.
- Cần Python 3.8 + UnityPy 1.25, numpy, Pillow, và `npx` (gltfpack 0.22).
- Glb thô (chưa nén) nằm ở `%TEMP%\pokeone-rip-poke`, đổi bằng biến `P1_TMP`.
- Chạy lại ra cùng kết quả. Script xoá và ghi lại `art/poke/shiny/<dex>` của loài nó chạy.
- Trang xem: `tools/poke-viewer.html` (three r140 + GLTFLoader + meshopt, y như game nạp). Mở qua máy chủ tĩnh ở gốc repo.

## Nguồn [ĐO TRONG REPO, 2026-09-27]

- `StreamingAssets/pdata1..12`: `assets/assetbundles/pokes<N>/<modelId>/`, gồm:
  - `model.prefab`: gốc `Model` mang component `Animation` (legacy).
    - Con thứ nhất là cây xương `pm####_00` (có loài tên khác, ví dụ `pm0003_00_fushigibana`).
    - Mỗi con còn lại là một `SkinnedMeshRenderer` + MonoBehaviour `PokeShaderReset`, một material mỗi renderer.
  - `meshdataK.asset`, `material_K.mat` (shader `Custom/PokemonShaderEx`), ảnh `pm####_00_*.png`, `shiny/*.png`.
  - Clip `<n>.anim`: legacy, 60 fps danh nghĩa nhưng khoá cách nhau 1/30 s. Chỉ clip 0 có `m_WrapMode = 2` (lặp).
- `dex -> modelId`: `D:\pokeone-ref\data\pokemonmodels.txt`, lấy `MaleID`. `ScaleFactor` (nếu có) ghi thẳng vào `scale`.
- Đơn vị lưới gốc là cm của 3DS: Bulbasaur cao 71,4 ở khung 0 của idle. Script nhân 0,01 ra mét, khớp ví dụ
  `height: 0.71` của Bulbasaur trong `ARCH.md`.
- Tham số shader: `PokeShaderReset` chứa đủ 6 tầng bộ trộn TEV của GPU 3DS (PICA200). Đọc bằng TypeTreeGenerator + DummyDll,
  `m_Script` đọc tay từ byte thô (fileID ở 16, pathID ở 20; xem `ARCH.md`). Script tự làm, không import `ttg.py`.

## Bảng vai trò clip

Tên clip trong glb là `a<số gốc>`. Clip trùng từng khoá với clip khác thì không xuất lại: vai trò trỏ sang clip gốc
(ví dụ `special2: 'a9'`).

| Vai trò | Clip | Có ở (trên 1.106 model) | Bằng chứng |
|---|---|---|---|
| `idle` | 0 | 1.106 | Clip duy nhất có `m_WrapMode = 2` (lặp), ở cả 39 loài. |
| `appear` | 3 | 1.106 | Nhìn khung hình: khung đầu cuộn tròn, nhắm mắt, rồi bung ra đứng dậy (thả khỏi bóng). Dài 0,37–0,83 s. 25/39 loài trong roster có clip 3 trùng từng khoá clip 1 (không có cảnh cuộn tròn riêng). |
| `roar` | 1 | 1.106 | Nhìn khung hình: đứng tại chỗ, há miệng, giơ tay/vẫy đuôi (tư thế kêu khi ra trận). |
| `attack` | 8 | 1.106 | Vật lý. Hông (`Waist`) lao tới xa nhất trong mọi clip: trung bình \|dz\| lớn nhất 37,8 cm, gấp 3 clip 9. |
| `special` | 9 | 1.105 | Đặc biệt. Đứng tại chỗ, dài 1,5–2,6 s. Caterpie, Weedle, Kakuna, Spinarak có 9 trùng 8. |
| `special2` | 12 | 1.105 | 37/39 loài có 12 trùng từng khoá với 9 (hoặc 8). Charizard và Pikachu có clip riêng. Chuỗi `"12"` xuất hiện lần đầu trong khối chuỗi của `BattleHandler`. |
| `hit` | 13 | 1.103 | Ngắn nhất (0,57–1,97 s, thường 0,63 s), mắt nhắm/nheo. Chuỗi `"13"` cũng nằm trong khối chuỗi của `BattleHandler`. |
| `hit2` | 14 | 1.103 | 36/39 loài có 14 trùng 13 (Venusaur, Blastoise, Pikachu có clip riêng). |
| `faint` | 17 | 1.054 | Hông hạ trung bình 15,9 cm ở cuối clip (clip khác ≤ 3,8), mắt chuyển sang biến thể nhắm ở cuối. Trong `stringliteral.json`, chuỗi `"17"` đứng ngay trước `"FNT"`. **Kakuna (#14) không có clip 17.** |

- Clip 2 chỉ có ở 23 model, không loài nào trong roster.
- Mã trận không cho câu trả lời thẳng. `GameAssembly.dll` bị Themida nén (section không tên, `.themida`, entropy 7,98), nên
  `dump.cs` chỉ có chữ ký hàm. `BattleHandler.PlayAttackAnimation(target, source, animationID = 2, moveName)` và
  `PlayAnimation(target, source, animationID = 5)` nhận số, không nhận tên clip.
- Bằng chứng từ mã chỉ là thứ tự chuỗi. IL2CPP gom chuỗi hằng không trùng lặp theo lần dùng đầu tiên. `"12" "13" "14"
  "17"` lần đầu xuất hiện giữa các chuỗi của `BattleHandler` (`"GetRP"`, `"FNT"`, `"battlebag"`). `"0" "1" "3" "8" "9"`
  đã có từ mã hệ thống nên không định vị được.
- Vai trò gán theo số, giống nhau cho mọi loài. Loài thiếu clip thì thiếu khoá đó (chỉ có Kakuna thiếu `faint`).
- Số liệu thống kê do `clipstats`/`clipdiff` (script nháp) đo trên 39 loài roster. Ảnh dải khung: `STRIPS=... node test/pokeone-poke.js`.

## Vật liệu

Kết luận: mỗi renderer ra một material glTF PBR (metallic 0, roughness 1) với **một ảnh màu đã nướng sẵn**.

- `Custom/PokemonShaderEx` mô phỏng bộ trộn 6 tầng của 3DS. Ảnh `_Texture0` chưa phải màu cuối.
  - Ví dụ: thân Bulbasaur ra màu `T0` ở phía sáng, và `T0 + 2·T1 − 1` ở phía tối (`T1` là ảnh đổ bóng xám).
  - Tròng mắt lấy alpha = `alpha(Iris2) × alpha(EyeNor)`. `EyeNor` là mặt nạ hốc mắt, dùng UV khác.
- `tev_eval()` chạy đúng 6 tầng trên từng điểm ảnh, với:
  - Ánh sáng giả định "đang được chiếu": `FragmentPrimary = 1`, `FragmentSecondary = (1, 0, 0, 0)` (không viền sáng).
  - Bộ đệm theo citra: tầng i đọc đầu ra tầng k−1, với k lớn nhất ≤ i−1 có cờ `CombinersUp*Buff`.
  - Màu đỉnh:
    - Cờ bit 3 của `FixedAttr` bật thì dùng hằng `FixedCol`.
    - Màu đỉnh thay đổi và nhánh RGB có đọc nó thì vẽ màu đỉnh vào ảnh theo UV (`raster_vertex_colors`, lông Mankey).
- Có hai cách nướng. Lỗi so với game nằm ở cách xấp xỉ ánh sáng, không nằm ở UV.
  - `texel`: mọi ảnh cần dùng có cùng scale/offset (và cùng đường cong offset) với `_Texture0`.
    - Nướng trên lưới điểm ảnh của `_Texture0`.
    - Giữ kiểu lặp gương: `MirrorU0` → sampler `MIRRORED_REPEAT`.
    - UV = `uv·scale + offset` của Unity, lật v.
  - `mesh`: các ảnh lệch scale/offset nhau (tròng mắt, lửa Charmander, cánh có mặt nạ).
    - Nướng trong khung UV của chính lưới, tối đa 512 px, sampler `CLAMP`.
- Kiểu alpha:
  - `_ColorSrcFunc/_ColorDstFunc` khác 1/0 → `BLEND` (tròng mắt, cánh Beedrill).
  - `AlphaTestEnb` → `MASK`, ngưỡng `AlphaTestRef` (lửa).
  - Còn lại `OPAQUE`, ảnh lưu RGB.
- `_Cull = 0` → `doubleSided`.

### Biểu cảm mắt

- Clip đổi `_TextureN.offset` của renderer `Eye`, `LIris`, `RIris` để chọn ô biểu cảm (mở/nheo/nhắm/X).
- glTF không có hoạt ảnh UV mà three r140 hiểu. Mỗi trạng thái offset khác nhau thành **một bản sao lưới** (UV nướng sẵn).
- Mỗi bản sao có một morph target tên `hide:<renderer>:<k>`, kéo mọi đỉnh về tâm.
- Clip có rãnh `weights` bước nhảy (STEP): bản đang dùng weight 0, bản khác weight 1. Bản 0 (trạng thái của material) mặc định hiện.
- Không ẩn bằng scale nút được: three ở chế độ `attached` triệt tiêu transform của nút skinned mesh.
- Khoá trạng thái lượng tử 1/8. Tròng mắt đảo nhẹ (offset < 0,05 ở Charmeleon, Wartortle, Blastoise) bị làm tròn về trạng thái nghỉ.
- Clip không có rãnh offset thì về trạng thái nghỉ. `PokeLoader.ResetUVs()` gợi ý game cũng làm vậy.
- `m_IsActive` trong clip nhắm các nút rỗng `pm####_00_*Skin`. Trong Unity nó không có tác dụng, nên bỏ qua.
  Dây leo/cánh ẩn bằng scale xương = 0, rãnh này đã có trong clip.

### Shiny

- `shiny` trong `pokes.js`: `tên material trong glb` → `art/poke/shiny/<dex>/<tên>.png`.
- Đây là ảnh nướng lại bằng cùng bộ trộn, thay ảnh gốc bằng ảnh trong `shiny/` cùng tên. Material nào có ít nhất một ảnh được thay thì có ảnh shiny.
- Tên material = tên ảnh. gltfpack giữ tên material (`-km`) nhưng bỏ tên texture, nên game tìm theo `material.name`:
  `mesh.material.map = loader.load(P1.POKES[dex].shiny[mesh.material.name])`, nhớ `flipY = false`, `encoding = sRGBEncoding`.

## Hướng, cỡ, gốc

- Đổi hệ tay trái → tay phải bằng lật trục **x** (không lật z). Nhờ vậy model **nhìn về +Z**, không cần xoay nút gốc.
- 1 đơn vị glb = 1 m (lưới gốc × 0,01). `scale` = `ScaleFactor` của `pokemonmodels.txt`. Game nhân thêm `scale`, glb chưa nhân.
- `height` = chiều cao khung bao ở khung 0 của `idle`, chưa nhân `scale`. Tư thế nghỉ của glb cũng là khung 0 của idle, nên không phát clip vẫn đúng dáng.
- Chân ở y = 0 (sai số ≤ 0,02). Loài lơ lửng giữ nguyên độ cao gốc, đáy khung bao cao hơn 0:
  Charizard 0,4, Butterfree 0,4, Beedrill 0,3, Pidgeotto 0,5, Pidgeot 0,7, Fearow 0,8, Geodude 0,3, Noctowl 0,6, Ledyba 0,4, Ledian 0,4.
- Game nên đặt `frustumCulled = false` cho mọi mesh. Khối cầu cắt khung tính theo tư thế bind, clip lao tới/bay có thể ra ngoài.

## Dung lượng

- `art/poke`: 20,7 MB, 392 tệp. Ngân sách là ~60 MB.
  - 39 glb, tổng 14,1 MB. Nhỏ nhất Kakuna 60 KB, lớn nhất Charizard 836 KB. Nén meshopt `-cc`, ảnh PNG giữ nguyên (không KTX2).
  - 353 ảnh shiny, tổng 6,6 MB.

## Bẫy

- [BẪY ĐÃ SẬP] `pokemonmodels.txt` không phải JSON chuẩn: có dấu phẩy thừa trước `}` và byte latin-1 (`0xE9`). Đọc `latin-1` rồi xoá dấu phẩy thừa.
- [BẪY ĐÃ SẬP] Đường dẫn trong clip legacy kết thúc bằng `/` (`pm0001_00/Origin/Waist/`). Phải `rstrip('/')` trước khi tra nút.
- [BẪY ĐÃ SẬP] Đặt scale 0,01 ở nút gốc làm mất bầu cây của Bulbasaur và cả tròng mắt.
  - Nút skinned mesh không nằm dưới nút gốc. three tính khối cầu cắt khung theo `matrixWorld` của chính nút đó, nên khối cầu to gấp 100 lần và nằm lệch chỗ.
  - Sửa: nhân 0,01 thẳng vào vị trí đỉnh, vị trí nút, rãnh dời và inverse bind matrix (`S·IBM·S⁻¹`).
- [BẪY ĐÃ SẬP] gltfpack 0.22 bỏ tên nút/lưới của skinned mesh và mọi `extras` của lưới, chỉ giữ `targetNames`. Nó cũng bỏ `extras` của animation. Vì vậy tên morph mang luôn tên renderer + số biến thể.
  - Việc clip nào lặp không nằm trong glb: chỉ `idle` lặp.
- [BẪY ĐÃ SẬP] `SkinnedMesh.boneTransform` của three r140 ra khung bao to gấp ~255 lần.
  - Nó cần `target` điền sẵn vị trí đỉnh.
  - Nó đọc trọng số uint8 (đã chuẩn hoá) của gltfpack như số nguyên.
  - Cách xử lý: `V.info()` trong viewer tự skin, chia tổng trọng số.
- [BẪY ĐÃ SẬP] Kênh màu đỉnh của mắt toàn số 0 nhưng 3DS dùng `FixedCol`, vì bit 3 của `FixedAttr` bật (thuộc tính PICA: 3 = Color). Lấy số 0 làm vùng mắt Mankey lệch màu.
- [BẪY ĐÃ SẬP] Prefab để dây leo/cánh bung (tư thế bind). Clip idle co chúng về scale 0. Lấy tư thế prefab làm tư thế nghỉ thì Bulbasaur cao 1,48 m thay vì 0,71.
- [BẪY ĐÃ SẬP] Clip 9≡12, 13≡14 và 1≡3 ở hầu hết loài. Xuất cả hai làm glb phình ra vô ích. Script so từng khoá (`clip_digest`) rồi trỏ vai trò về clip gốc.
- `GameAssembly.dll` bị Themida: không dịch ngược thân hàm được. Muốn biết chắc cách game gọi clip phải chạy game và dump bộ nhớ (game online, chưa làm).

## Chưa giống game

- Không có viền đen (shader gốc có pass viền `_Outline = 0.002`, màu 0,1). Game muốn có viền thì tự thêm pass "vỏ lộn" phía three.
- Bóng đổ kiểu toon (hai tông theo LUT) thay bằng ánh sáng three thường. Ảnh nướng là màu phía sáng.
- Lửa đuôi Charmander/Charmeleon/Charizard đứng yên. `ScrollFire` cuộn UV lúc chạy, glTF không có.
  - Màu lửa ra vàng/cam nhạt vì tầng 0 cộng `vtx.a · 0,5` vào đỏ, và `FixedCol = (1,1,1,1)` (bit Color của `FixedAttr = 108` bật).
  - Nếu shader Unity đọc kênh màu đỉnh (toàn 0) thay vì `FixedCol`, lửa sẽ đỏ hơn. Chưa kiểm được vì không có thân hàm shader.
- Mankey: vùng quanh mắt sáng hơn lông một chút. Bộ trộn của mắt kéo màu về `K = (1; 0,98; 0,94)` theo `FixedCol.a`. Đó là đúng công thức gốc, nhưng game có ánh sáng khác nên chênh ít hơn.
