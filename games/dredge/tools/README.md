# Bóc asset DREDGE cho Biển Mù

Mọi hình 3D, bản đồ, số liệu, chữ, tiếng và UI của game này lấy thẳng từ bản DREDGE 1.5.3 (Black Salt Games) trên máy chủ dự án.
Các công cụ dưới đây chạy lại bao nhiêu lần cũng ra cùng kết quả. Chạy bằng Python 3.8 + UnityPy 1.25 + numpy + Pillow, có `ffmpeg` trong PATH, `node`/`npx`.

## Nguồn

- Tệp gốc: `D:\DREDGE.v1.5.3.2_LinkNeverDie.Com.rar`, mật khẩu `linkneverdie.com`.
- Giải nén ở `D:\dredge-ref\game\DREDGE.v1.5.3_LinkNeverDie.Com\`. Đổi bằng biến `DREDGE_DATA` (trỏ vào `DREDGE_Data`).
- Mã C# dịch ngược bằng `ilspycmd -p -o D:\dredge-ref\src <Assembly-CSharp.dll>`: 901 tệp `.cs`.
- Ghi chú đọc mã: `D:\dredge-ref\notes\CODE.md` (công thức kèm `Tệp.cs:dòng`). Ghi chú wiki: `D:\dredge-ref\notes\WIKI.md` (501 trang dredge.fandom.com).

## Thứ tự chạy

```
python -I games/dredge/tools/index_bundles.py   # D:\dredge-ref\cache\bundle_index.json (container -> bundle), ~2 phút
python -I games/dredge/tools/world.py           # art/world/*: lib.glb, instances.bin, terrain, landmask, depthmask, markers, scene_config (~3,5 phút)
python -I games/dredge/tools/data.py            # data/*.js (item, chữ, lưới, cấu hình, bến, cửa hàng...), art/items, art/ui, wavemask-dlc1 (~45 giây)
python -I games/dredge/tools/boat.py            # art/boat/boat.glb, data/boat.js
python -I games/dredge/tools/audio.py           # D:\dredge-ref\audio (1089 clip .ogg) + audio/** và data/audio.js (~2 phút khi đã có .ogg)
python -I games/dredge/tools/fonts.py           # art/fonts
```

`index_bundles.py` phải chạy trước. `world.py` phải chạy trước `data.py` vì `data.py` trỏ `DR_CONFIG.wave` vào `art/world/depthmask.png` mà `world.py` ghi.

Gỡ nhanh nếu bị yêu cầu: xoá `art/`, `audio/`, và mọi tệp `data/*.js` sinh ra (đầu tệp ghi "generated").

## Game gốc đóng gói thế nào [ĐO TRONG REPO, 2026-10-07]

- Unity Mono (không phải IL2CPP), 113 bundle Addressables ở `StreamingAssets/aa/StandaloneWindows`, **không mã hoá**.
- Cả thế giới là **một scene** `Assets/Scenes/Game.unity` trong `gamescene_scenes_all_*.bundle` (189 MB, 151.648 object). UnityPy nạp mất ~6 giây.
  - Gốc scene: `TheMarrows`, `GaleCliffs`, `StellarBasin`, `TwistedStrand`, `DevilsSpine`, `OpenOcean`, `DLC1` (Pale Reach), `DLC2` (Iron Rig), `Docks`, `HarvestPOIs`, `InspectPOIs`, `Terrain`, `Logic`...
  - Thế giới là hình vuông 1500 m quanh gốc toạ độ (`GameConfigData.worldSize`). Pale Reach và Iron Rig nằm ngoài hình vuông ấy nên không có đáy biển hay độ sâu.
- Độ sâu không lấy từ terrain mà từ texture `WaveController.waveHeightMask`: kênh G = độ sâu thô 0..1 (×`depthModifier` 100 = mét), kênh A = độ dốc sóng. Ghi ra `art/world/depthmask.png`.
- Không có bản đồ "loại nước". Cá ở điểm câu nào là do danh sách item **nằm ngay trong MonoBehaviour `HarvestPOI` của scene**, không phải ScriptableObject.
- Item, cấu hình, nâng cấp, nhiệm vụ đều là `SerializedScriptableObject` của Odin (Sirenix). Trường kiểu `decimal`, `Dictionary`, `HashSet` nằm trong blob `serializationData.SerializedBytes`, không hiện trong typetree.
  - Quan trọng nhất là **giá cá** (`value`), giá nâng cấp, bảng độ khó minigame, `depthBands`.
  - `tools/odin.py` đọc định dạng nhị phân này. 1008 blob, 0 lỗi.

## Bẫy đã sập

- `[BẪY ĐÃ SẬP]` `python -I` **bỏ qua** biến `PYTHONIOENCODING`. In tên tiếng Việt hay ký tự lạ ra console là crash `UnicodeEncodeError` (cp1252). Mọi tool gọi `sys.stdout.reconfigure(encoding="utf-8")` ở đầu.
- `[BẪY ĐÃ SẬP]` `env.container` của bundle scene liệt kê `.unity` bằng PPtr có `m_PathID == 0`; gọi `.type` trên đó là `ValueError`. `index_bundles.py` ghi loại là `Scene`.
- `[BẪY ĐÃ SẬP]` `GameConfigData`, các `HarvestDifficultyConfigData` và `SaveDataTemplate` **không nằm trong bundle nào**. Chúng ở `sharedassets0.assets` của bản build, và tệp đó **không có typetree**.
  - `data.py` sinh typetree từ `Assembly-CSharp.dll`.
  - `SaveDataTemplate` vẫn hỏng theo cách đó nên phải đọc tay.
- `[BẪY ĐÃ SẬP]` Lọc landmask (chỗ thuyền không đi được). Lấy mọi collider cắt mặt nước y=0 thì quả cầu của các khối vùng (zone volume) bôi trắng nửa bản đồ.
  - Chỉ giữ collider thuộc layer va chạm với Player: `CollidesWithPlayer`, `CollidesWithPlayerAndCamera`, `CollidesWithPlayerAndMonster`, `Ice`.
- `[BẪY ĐÃ SẬP]` 5.440 renderer được static-batch: mesh của chúng là `Combined Mesh` toạ độ thế giới. `world.py` nhân ngược ma trận của từng renderer rồi gộp trùng theo hình.
- 325 instance bị lật gương (scale âm). Chúng dùng biến thể mesh đã lật sẵn trục x vì `instances.bin` chỉ chứa scale dương.
- `[BẪY ĐÃ SẬP]` Ghi trùng bản đồ độ sâu: `data.py` và `world.py` cùng xuất `waveHeightMask` (2,2 MB hai lần). Giờ chỉ `world.py` ghi.
- `[BẪY ĐÃ SẬP]` Vòng lặp tiếng bị cắt ngắn cho vừa ngân sách mà dùng fade-out ở cuối thì mỗi vòng hụt tiếng một lần. `audio.py` giờ crossfade 2 giây đuôi vào đầu đoạn.

## Hướng bản đồ

- Toạ độ trong repo là three.js tay phải: đổi dấu Z so với Unity (đỉnh, vị trí), quaternion (x,y,z,w) → (-x,-y,z,w), lật chiều tam giác.
- Bản đồ trong game vẽ UI y = Unity z (`MapWindow.cs:577`), nên **phía trên bản đồ = Unity +z = three.js −z**. +x là phía đông ở cả hai hệ.
- Nhìn từ trên bằng camera three.js với `up = (0,0,-1)` thì ra đúng bản đồ trong game.
  - Góc trên trái là Twisted Strand, trên phải là Devil's Spine.
  - Dưới trái là Stellar Basin (vòng đảo), dưới phải là Gale Cliffs.
  - Pale Reach nằm dưới cùng.
- `[BẪY ĐÃ SẬP]` Lưới ô chữ-số của wiki (D12, J8…) đánh **số hàng tăng dần lên trên**. Đọc nó như lưới thường (hàng 1 ở trên) thì tưởng ảnh nhìn từ trên bị lật dọc.
  - Kiểm bằng `MapWindow.cs` chứ đừng bằng trí nhớ về bản đồ.
- `world.py` còn tự kiểm: dựng lại bản đồ trong game từ 14 ô UI rồi so tương quan với landmask. Đúng hướng được 0,66, các hướng lật/xoay khác tối đa 0,20.

## Màn hình khoang thuyền (`cargo_ui.py`)

- Chạy: `python -I games/dredge/tools/cargo_ui.py` (3 giây, không cần `index_bundles.py`). Ra `art/ui/cargo/*.webp` (23 sprite, 48 KB) và `sprites.json` (kích thước, viền 9-slice, ppu).
- Đọc thẳng `D:\dredge-ref\ripped\ExportedProject\Assets\Sprite\<tên>.asset` + `Texture2D\*.png` của AssetRipper, không qua UnityPy.
- `[BẪY ĐÃ SẬP]` Nhiều sprite trùng `m_Name` (SidePanel, square, Tab_Selected, PopupBackground, TypeTag...). `data.py` đặt bản trùng thành `Tên#Tên_hash`, không biết bản nào prefab dùng. Prefab trỏ guid → tên tệp có đuôi `_0`; `cargo_ui.py` gọi đúng tên tệp đó.
- `[BẪY ĐÃ SẬP]` Toạ độ Unity của `m_Rect` tính từ ĐÁY ảnh. Viền `m_Border` là (trái, dưới, phải, trên). `SidePanel_0` có viền phải = 0: bảng trượt ra khỏi màn hình nên không có khung bên đó; bảng kho bên trái là bản lật gương.
- `[BẪY ĐÃ SẬP]` Sprite Sliced co theo `ppu/100` (CanvasScaler tham chiếu 100): viền 72 px ảnh ở ppu 200 = 36 đơn vị canvas, rồi nhân hệ số `--k` = chiều cao/1080.
- `CargoGrid_Damaged` (ô hỏng) không có trong `Sprite/` của AssetRipper; dùng bản `art/ui/sprites/CargoGrid_Damaged.webp` do `data.py` bóc.
- Số đo của bảng (650x935 ở y=-65, ô 60, tooltip 330 rộng, dải thông tin 145, thanh hư hại 50...) đọc từ `Scenes/Game.unity` bằng bộ đọc chunk YAML (tách theo `--- !u!<loại> &<id>`, dựng chỉ mục id → khoảng byte rồi đi cây `m_Children`). Bộ đọc tạm không giữ trong repo; muốn dựng lại thì làm như `D:\dredge-ref\notes\DELEGATE.md` gợi ý.

## Mặt biển, vệt bọt, cảm giác thuyền (`vfx.py`)

- Chạy: `python -I games/dredge/tools/vfx.py` (~40 giây, cần PyYAML; không cần `index_bundles.py`). Ra `data/vfx.js` (37 KB) và `art/vfx/*.webp` (3 ảnh, 20 KB). Đọc thẳng YAML của AssetRipper (`PlayerContainer.prefab`, `Material/*.mat`, `Mesh/*.asset`, `Scenes/Game.unity`).
- Lấy: hệ hạt `BoatTrailParticles` (mọi module, mesh phát `BoatFrontWakeMesh_0`, mesh hạt `SphereLowPoly_2`), cột khói `SmokeColumn` từng hạng thân, mặt nạ `WaterMask`/`FoamMask`, tâm khối + quán tính từng thân, tiếng máy/vệt/sóng lớn, `Water_Mat`, `WaterController` + 5 `WaterPropertyModifier`.
- `[BẪY ĐÃ SẬP]` `FoamMask` **không** ghi vào render target bọt nào. Nó dùng `Unlit/DepthMaskShader` (hàng đợi 3010) để che hạt bọt bên trong vỏ. `FoamCamera.cs` (R8 `_FoamTexture`) không được gắn ở scene hay prefab nào của bản 1.5.3.
- `[BẪY ĐÃ SẬP]` Hai `WaterSplash` nằm trong `PlayerTeleport/TeleportEffect` (đang tắt), là hiệu ứng kỹ năng dịch chuyển chứ không phải bọt mũi. Sóng chữ V ở mũi chính là `BoatTrailParticles`.
- `[BẪY ĐÃ SẬP]` Rigidbody không ghi `centerOfMass`/`inertiaTensor`. PhysX tự tính từ collider mô phỏng (không tính trigger), tức `MeshCollider` lồi của `BoatN`. `vfx.py` dựng bao lồi rồi tích phân khối đặc khối lượng 1. Quán tính trục đứng thật là 0,466, còn hộp va chạm cho 0,656.
- `[BẪY ĐÃ SẬP]` Mesh YAML có kênh `dimension` mang cờ ở các bit cao (52 = 4 | cờ). Phải lấy `dimension & 15`. Pháp tuyến có thể là float16.
- `[BẪY ĐÃ SẬP]` Tên GameObject kiểu `1`, `2` bị PyYAML đọc thành số nguyên. Tool ép về chuỗi.
- Thân shader `Water_Shader`, `FloatingParticle_Shader`, `SmokeColumn_Shader` bị bỏ khi xuất (`DummyShaderTextExporter`). Cách ghép các số của vật liệu trong `js/water.js`, `js/vfx.js` là `[ĐỀ XUẤT]`, có ghi tại chỗ.
- Kiểm: `node test/dredge-sea.js` (ảnh ở `%TEMP%/dredge-sea`). Đo trước/sau: `SEA_ROOT=<bản HEAD giải ra> SEA_PERF_ONLY=1 node test/dredge-sea.js`.

## Cốt truyện, hội thoại, bến (`yarn.py`)

- Chạy: `python -I games/dredge/tools/yarn.py` (~6,5 phút, sau `data.py` vì đọc `data/strings-dialogue.js` và `data/world_data.js`). `--no-art` chỉ giải lại chương trình Yarn (~2 giây), giữ nguyên phần bến/chân dung/mở đầu đã có trong `data/yarn.js`.
- Ra `data/yarn.js` (`window.DR_YARN`, ~0,8 MB) và `art/portraits/**` (~7 MB):
  - chương trình Yarn: 953 node, 14.922 lệnh, 2.479 dòng chữ, 1.040 thẻ dòng (#chuckle, #exit, #quest...);
  - 26 bến / 70 điểm đến (alwaysShow, speaker, speakerRootNodeOverride, vCam, highlightConditions), vCam của bến;
  - 55 prefab chân dung (131 lớp webp), 389 clip tiếng cảm thán (mp3 mono 40 kb/s) cho 43 SpeakerData;
  - màn mở đầu: cây 84 GameObject, 43 sprite, 44 đường cong của `IntroCutscene.anim`, tiếng `opening-ambience`; máy quay mở đầu trong Game (`IntroCinematic.playable`);
  - font hội thoại `Front Page Neue` (woff2, Latin).
- Yarn Spinner bản 2.2.0 (đọc chuỗi phiên bản trong `Plugins/YarnSpinner.dll`). Opcode theo `yarn_spinner.proto` 2.2: JumpTo=0 … RunNode=16. Kiểm 16/17 opcode có mặt trong chương trình (không có `PushNull`).
- `[BẪY ĐÃ SẬP]` Bảng `Yarn_en` trong project AssetRipper rỗng (Localization không có typetree). Chữ lấy từ `data/strings-dialogue.js` của `data.py` (đọc bundle).
- `[BẪY ĐÃ SẬP]` proto3 bỏ trường mang giá trị mặc định: nhãn ở lệnh số 0 không có trường giá trị trong map `labels`. Phải hiểu là 0, không phải thiếu.
- `[BẪY ĐÃ SẬP]` `Dock`/`BaseDestination` là `SerializedMonoBehaviour` (Odin): AssetRipper xuất khối rỗng, mất `alwaysShow`, `speakerData`, `vCam`. Đọc bằng UnityPy trong bundle scene (typetree có đủ).
- `[BẪY ĐÃ SẬP]` Lớp chân dung không gắn sprite trong prefab (`m_Sprite: 0`). Sprite nạp lúc chạy qua `AddressableSpriteLoader.assetReference` (GUID) → catalog Addressables → `Assets/Textures/UI/Characters/...`.
- `[BẪY ĐÃ SẬP]` AnimationClip trong bản build nén vào `m_MuscleClip`, `m_PositionCurves` rỗng. Khoá của clip máy quay mở đầu lấy từ YAML AssetRipper đã giải nén, khớp theo tên track của timeline.
- `[BẪY ĐÃ SẬP]` Dòng `path:` của clip gắn thẳng vào đối tượng là `    path:` không có dấu cách sau dấu hai chấm.
- Kiểm: `node test/dredge-story.js` (ảnh ở `%TEMP%/dredge-story`).

## Môi trường: ánh sáng, sương, trời, hậu kỳ, chim (`env.py`)

- Chạy: `python -I games/dredge/tools/env.py` (~45 giây, SAU `world.py` vì đọc `art/world/scene_config.json`). Ra `data/env.js` (`window.DR_ENV`, ~190 KB) và `art/env/*` (~260 KB). Chạy lại ra đúng từng byte.
  - `--dis <thư mục>`: rã bytecode DXBC của các shader môi trường (Lit, LitTriplanar, Foliage, LitYBillboard, TerrainShader, Sky, LightBeam, AtmosphericParticles, BirdParticle...) bằng `D3DDisassemble` của `C:\Windows\System32\D3DCompiler_47.dll`. Mỗi tệp có 6 biến thể ít keyword nhất. Công thức trong `js/sky.js`, `js/world.js` đọc từ đây.
- `world.py` (phần vật liệu) ghi thêm `extras.params` (thông số shader graph theo tên hiển thị: GrassColour, SnowHeight, LightStrength...) và `extras.keywords` vào từng vật liệu của `lib.glb`. Nó cũng gắn `emissiveTexture` (cửa sổ, đèn) và texture `*_RGB` cho LitTriplanar.
- `[BẪY ĐÃ SẬP]` Thân shader trong project AssetRipper là giả (`DummyShaderTextExporter`). Bytecode thật thì UnityPy có, nhưng nó in `// shader disassembly not supported on DXBC`. Cách lấy: lấy blob đã giải LZ4, tìm chuỗi `DXBC`, đưa vào `D3DDisassemble`.
  - Bảng tên cbuffer (RDEF) đã bị bỏ, nên `cb0[125..131]` phải đoán tên qua các lệnh `Shader.SetGlobal*` trong mã C#: `_Cloudiness`, `_WindSpeed`, `_SceneLightness`, `_FogDensity`, `_FogCenter`, `_FogHeight`, `_FogRemove`, `_LightingTint`, `_LightingTintStrength`, `_GameTime`, `_WorldSize`.
  - `cb3` (UnityPerMaterial) đi theo thứ tự khối Properties. Phép đoán khớp với mọi lệnh dùng tới.
- `[BẪY ĐÃ SẬP]` LitTriplanar **không** chiếu ba mặt. Nó lấy mẫu `*_RGB` theo UV0 × TextureScale. gltfpack xoá TEXCOORD_0 của vật liệu không có texture, nên đảo bị mất UV. Giờ `world.py` gắn texture `*_RGB` làm baseColorTexture để giữ UV.
- `[BẪY ĐÃ SẬP]` Shader toon gốc **không có N·L**. Ánh sáng là albedo × (nắng·mây·bóng + đèn phụ + ambient + (1 − WaveMask.b)). Dùng Lambert của three.js thì ra màu xám bệt.
  - Màu `Color` của vật liệu lưu ở dạng gamma, Unity (linear) đổi sang tuyến tính trước khi đưa vào shader. Màu đỉnh không đổi.
- `[BẪY ĐÃ SẬP]` Sương gốc không phải exp. Nó tính theo khoảng cách tới **thuyền** (`_FogCenter`), đi theo đường cos tới `far = 350 − 337·_FogDensity`, trừ phần theo độ cao (`y/_FogHeight`), có sàn `d/350`.
  - Ban đêm `far` ≈ 8 m. Đèn thuyền xua sương: nhân với `1 − 3·|Σ đèn phụ|`.
- Hậu kỳ URP ở chế độ LDR. Bloom cộng trên ảnh HDR (threshold 1, intensity 2), rồi LUT `ColorLookup` (1024×32, để PNG) tra trong sRGB, rồi `ColorAdjustments` của volume vùng.
  - Volume vùng là cầu: Stellar Basin r 175 / blend 150, Devil's Spine r 100 / blend 200, GiantHead r 50.
  - `[BẪY ĐÃ SẬP]` Có 2 volume global, một cái là của màn credits (không active). Phải lọc `active`.
- `[BẪY ĐÃ SẬP]` Đo hiệu năng: một mẫu `DR_DEBUG.perf()` (120 khung ≈ 0,3 s) lệch ±20 % khi máy có tiến trình khác chạy. Phải so trung vị nhiều mẫu, chạy xen kẽ "trước/sau".
  - Bản "trước" phải là **cây làm việc hiện tại** trả riêng các tệp của mình về HEAD, không phải HEAD trần: luồng khác đã làm khung nặng thêm ~0,6 ms.
  - Lệnh: `DR_ROOT=<thư mục chứa games/dredge cũ> BASELINE=1 node test/dredge-env.js`.
- Kiểm: `node test/dredge-env.js` (26 khẳng định màu nắng/ambient/sương = số chép tay từ gradient gốc; ảnh ở `%TEMP%/dredge-env`). Thêm `?shadows=1` vào URL để bật bóng đổ mặt trời (đắt ~+40 % khung, nên tắt mặc định).

## Kích thước [ĐO TRONG REPO, 2026-10-07]

| Thư mục | MB |
|---|---|
| `art/world` | 20,3 |
| `art/items` + `art/ui` | 11,8 |
| `art/boat` | 4,3 |
| `audio` | 21,8 |

## harvest_ui.py — màn thu hoạch (HarvestMinigameView) + hiệu ứng điểm câu [ĐO TRONG REPO, 2026-10-07]

- Chạy sau `data.py`/`world.py`: `python tools/harvest_ui.py` (~35 s; `--no-spotfx` bỏ phần UnityPy dựng atlas cá). Cần `D:\dredge-ref` (AssetRipper export + cache). Ra `art/ui/minigame/harvest_ui.js` (`DR_HARVEST_UI`: cây RectTransform, hằng minigame, prefab, clip Animator, màu thẻ, SFX, spotfx), `sprites/`, `audio/gate-*.mp3`, `fonts/FrontPageNeue.woff2`, `fish_atlas.webp`.
- Kiểm: `node test/dredge-fishing.js` (bố cục px khớp RectTransform ở 1280×720 và 844×390, bot bấm hoàn hảo cả 6 minigame, luồng thật tới điểm -> thẻ bắt được -> khoang, khoang đầy, hiệu ứng điểm; ảnh ở `%TEMP%/dredge-fishing`).
- Bẫy đã sập:
  - `[BẪY ĐÃ SẬP]` `m_LocalEulerAnglesHint` của AssetRipper đảo dấu: góc xoay phải lấy từ quaternion `m_LocalRotation` (`2*atan2(z,w)`).
  - `[BẪY ĐÃ SẬP]` Đường anim chỉ có hash `path_0x...` (Ring, Indicator): suy ra từ cấu trúc, không tra ngược được.
  - `[BẪY ĐÃ SẬP]` Odin blob làm mất trường (màu thẻ `HarvestTypeTagConfig`): giải bằng `tools/odin.py`.
  - `[BẪY ĐÃ SẬP]` Sprite bóc theo `m_Rect` bị cắt sát; ảnh xoắn ốc `50PercentSpiral` phải vẽ cỡ tự nhiên (240×255,5, pivot 0,4625/0,4696), kéo vào 280×280 là lệch.
  - `[BẪY ĐÃ SẬP]` Âm thanh qua catalog addressables (guid), không theo tên tệp; `fish.cast` là tiếng kỹ năng mồi, không phải thả cần.
  - Scene có 5 `SpiralGate(Clone)` dính sẵn — phải xoá khi `prepare()`.
  - Prefab không có HarvestableParticleSystem (Crab, Trinket, Cloth, Wood, MetalScrap, Relic...) chưa có silhouette -> shader vẽ như mảnh vụn.
