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
- Đợt chuẩn gốc 2 (2026-10-08): thêm 5 sprite (`TrophyIcon`, `InfectionBubble`, `TitleBackground`, `Button_White`, `FishmongerInventoryBackground`; 28 sprite, 107 KB) và `art/ui/cargo/cargo_fx.js` (`window.DR_CARGO_FX.infection`: ParticleSystem của `GameObject/InfectedObjectCell.prefab`, `index.html` nạp trước `js/cargo.js`).
- `[BẪY ĐÃ SẬP]` ParticleSystem YAML: trường `MinMaxCurve` có `minMaxState` 3 = ngẫu nhiên giữa `minScalar` và `scalar` (lifetime 8-12, size 15-30, burst 1-3); `ShapeModule` v6 ghi bán kính trong khối con `radius: {value: 0.4}` còn `m_Scale` (40) nhân thêm; `EmissionModule.rateOverTime` 0 nhưng `m_Bursts` phát mỗi chu kỳ `lengthInSec` 1 s. Prefab có hai con (`InfectedUIParticles`, `AmbientParticles`) nhưng chỉ một `!u!198`.
- Bảng trái đo từ `Game.unity`: `StorageSlidePanel` 650x800 (y -40); `QuestGridSlidePanel` 650x550 với `QuestGrid` 450x450, `UpgradeGridSlidePanel` 650x600 với `UpgradeGrid` 420x360 và `LightButton` 350x50 ở y +90; `HelpContainer` neo đáy, y 60 → 0 (treo dưới bảng); `StorageTray` rộng -260 (= 460) cao 245 neo đáy `Container` 720x320 của bảng câu, lưới cách tâm y +15, `HelpTextContainer` rộng -100 cao 60. Chạy lại bộ đọc: `python -I <rt.py> <tên GO>` kiểu như ghi ở đây (tách khối, tra `m_GameObject`/`m_Father`/`m_Children`).

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

### Vòng 2: thời tiết, chim, vật nổi, thác (`js/sky.js`, `js/world.js`, `js/water.js`)

- `DRSky.weather = { cur, prev, k }` là cổng công khai của WeatherController: `pin(tên|null)`, `emitLightning()`, `random` (đổi được khi kiểm thử). Số liệu ở `data/env.js` mục `weather` (chuyển 15 s, kiểm vùng mỗi 5 s, Lightning 50–250 m, 3 WeatherTrigger) và `data/weather.js` (của `data.py`, chỉ đọc).
- Mưa/tuyết đi qua `DRParticles.spawn('Rain'|'Snow', { loop: true })` và được lái bằng `handle.setRateOverTime(rainRate|snowRate)` (hạt/giây tuyệt đối, như `rateOverTime` của WeatherController). Tay cầm chưa có hàm này thì rơi về `setRate(k)`, và khi đó mưa mỏng, tuyết không hiện.
- `[BẪY ĐÃ SẬP]` `setRate(k)` của nhánh vfx nhân với tốc độ nền của cảnh (Rain 150/s, Snow 0/s) và giải phóng hệ có nền 0 khi hết hạt sống: HeavyStorm chỉ ra 211 hạt sống (gốc 2000/s) và tuyết không bao giờ xuất hiện. Không chữa bằng `setRate(0)` + `emit(n)`.
- Bão: sau 15 s steepness 0,15, foam 0,35 (đẩy vào `uWaveSteep`/`uFoam` của `water.js`). Pale Reach ban đêm bốc tuyết với trọng số 29/34 = 0,853.
- Chim chỉ bay lúc t = 0,27–0,60; phao và thuyền bến nhấp nhô (tương quan 0,999 trễ 1,1 s); thác cuộn UV.
- Kiểm: `node test/dredge-env.js` (ảnh ở `%TEMP%/dredge-env`, gồm `sbs-night-snow.png`, `sbs-dusk.png`). Chạy `env.py` và `world.py` hai lần phải ra cùng byte.

## Kích thước [ĐO TRONG REPO, 2026-10-07]

| Thư mục | MB |
|---|---|
| `art/world` | 20,3 |
| `art/items` + `art/ui` | 11,8 |
| `art/boat` | 4,3 |
| `audio` | 21,8 |

## harvest_ui.py — màn thu hoạch (HarvestMinigameView) + hiệu ứng điểm câu [ĐO TRONG REPO, 2026-10-07]

- Chạy sau `data.py`/`world.py`: `python -I tools/harvest_ui.py` (~50 s; `--no-spotfx` bỏ phần UnityPy, giữ spotfx của lần chạy trước). Cần `D:\dredge-ref` (AssetRipper export + cache), `ffprobe`. Ra `art/ui/minigame/harvest_ui.js` (`DR_HARVEST_UI`: cây RectTransform, hằng minigame, prefab, clip Animator, màu thẻ, SFX, `shiny` (UIShiny), `tutorialTransition` (UITransitionEffect), `cam` (camera thu hoạch), `spotfx`), `sprites/`, `audio/gate-*.mp3`, `fonts/FrontPageNeue.woff2`, `UITransitionTex.webp`, `spot_meshes.bin` (57 mesh hạt thật, ~100 KB), `spot_*.webp` (bảng màu AnimalColours, DredgeParticles, crate).
- `cam`: "HarvestClearShot VCam" + 5 camera con (PlayerContainer.prefab: ưu tiên, vị trí, FOV, Transposer, Composer, CinemachineCollider) và blend của CinemachineBrain (`Scenes/Manager.unity` + `MonoBehaviour/Main Camera Blends.asset`).
- `spotfx`: mọi hệ hạt của mỗi prefab điểm câu (mô-đun Initial/Shape/Emission/Velocity/Size/Rotation/Color/Noise/Limit, renderer, vật liệu, LODGroup, toggleObjects), vòng nước `DisturbedWaterParticles(_0)` / `SurfaceOozeParticles`, `poiSfx` = `HarvestPOIHandler.sfxClips` (Odin) + độ dài clip.
- Kiểm: `node test/dredge-fishing.js` (bố cục px khớp RectTransform ở 1280×720 và 844×390, bot bấm hoàn hảo cả 6 minigame, luồng thật tới điểm -> thẻ bắt được -> khoang, khoang đầy, hiệu ứng điểm; ảnh ở `%TEMP%/dredge-fishing`).
- Bẫy đã sập:
  - `[BẪY ĐÃ SẬP]` `m_LocalEulerAnglesHint` của AssetRipper đảo dấu: góc xoay phải lấy từ quaternion `m_LocalRotation` (`2*atan2(z,w)`).
  - `[BẪY ĐÃ SẬP]` Đường anim chỉ có hash `path_0x...` (Ring, Indicator): suy ra từ cấu trúc, không tra ngược được.
  - `[BẪY ĐÃ SẬP]` Odin blob làm mất trường (màu thẻ `HarvestTypeTagConfig`): giải bằng `tools/odin.py`.
  - `[BẪY ĐÃ SẬP]` Sprite bóc theo `m_Rect` bị cắt sát; ảnh xoắn ốc `50PercentSpiral` phải vẽ cỡ tự nhiên (240×255,5, pivot 0,4625/0,4696), kéo vào 280×280 là lệch.
  - `[BẪY ĐÃ SẬP]` Âm thanh qua catalog addressables (guid), không theo tên tệp; `fish.cast` là tiếng kỹ năng mồi, không phải thả cần.
  - Scene có 5 `SpiralGate(Clone)` dính sẵn — phải xoá khi `prepare()`.
  - `[BẪY ĐÃ SẬP]` Hai đường dẫn băm `path_0xDFDB0ECB` / `path_0xA6710CB7` của HarvestMinigameHit/Miss là CRC32 của "FishMinigameWheel/Ring(/Indicator)", nút không tồn tại trong cảnh: bản gốc KHÔNG rung vòng cá. Đừng gắn chúng vào `RadialFishMinigameWheel`.
  - `[BẪY ĐÃ SẬP]` Script trong DLL chỉ có `m_Script.fileID`: Cinemachine tra bằng MD4("s\0\0\0" + namespace + lớp) (`cm_classes()`). ClearShot có CinemachineCollider + ImpulseListener.
  - `[BẪY ĐÃ SẬP]` Blend vào/ra camera thu hoạch là `m_DefaultBlend` của CinemachineBrain (Custom 2 s), không phải `m_DefaultBlend` EaseInOut 1 s của ClearShot (cái đó chỉ dùng giữa camera con). Brain nằm ở `Scenes/Manager.unity`, không ở Game.unity.
  - `[BẪY ĐÃ SẬP]` Guid texture trong `.mat`: tra bằng dòng `guid:` ĐẦU của `.meta` (bảng `harvest_guids.pkl`); `grep guid:` thô trúng cả `.meta` của shader (texture mặc định) nên ra tên sai. Ảnh chính theo tên hiển thị: Albedo (Lit_Shader), MainTex (FishParticle), Sprite (FloatingParticle).
  - `SphereLowPoly_2` không có trong bundle itemdata; tool kiểm nó trùng từng byte với `SphereLowPoly` (YAML AssetRipper) rồi dùng chung.
  - Mesh xuất bằng `Mesh.export()` (OBJ: x đổi dấu, tam giác đảo) -> three.js = (−x, y, −z) của OBJ, giữ thứ tự tam giác.
  - Hạt mảnh vụn (Trinket/Wood/MetalScrap) có `startLifetime` = Infinity, burst 30 chặn ở maxP 6: 6 mảnh cố định, tắt bằng `toggleObjects` khi kho < 1.
- Kiểm: `node test/dredge-fishing.js` (vòng 2: `ONLY_R2=1` chỉ chạy phần mới; `FISH_BASE=<bản sao thư mục cũ>` để đo hiệu năng trước/sau; ảnh ghép cạnh `gog_04`/`gog_16` ở `%TEMP%/dredge-fishing/sbs-*.png`).

## upgrade_ui.py — màn "Upgrades" của ụ tàu (UpgradeWindow) + tooltip nâng cấp [ĐO TRONG REPO, 2026-10-08]

- Chạy sau `index_bundles.py` và `data.py`: `python -I games/dredge/tools/upgrade_ui.py` (~30 s, ra đúng từng byte). Cần `D:\dredge-ref`. Ra `data/upgrade_ui.js` (cây RectTransform, sprite, khoá chữ, màu, giá vật liệu) và `art/ui/upgrade/*.webp` (16 ảnh, 44 KB, cỡ gốc).
- Kiểm: `node test/dredge-upgrade.js` (`ONLY=full|phone|apply`): vị trí 19 nút và 10 đường nối ±2 đơn vị canvas ở 1920x1080 và 844x390, màu theo trạng thái, tooltip vật liệu, mua bằng chuột, nâng thân bậc 2, áp trực tiếp `applyUpgrade`.
- Bẫy đã sập (chi tiết trong docstring của tool):
  - `[BẪY ĐÃ SẬP]` HorizontalLayoutGroup của `Nodes` bỏ qua con tắt (Tier5): `anchoredPosition` lưu trong scene là của bản 9 cột, bản cơ bản dịch phải 85; js/upgrade.js xếp lại bằng thuật toán Unity.
  - `[BẪY ĐÃ SẬP]` `fontSize` của chữ trong cửa sổ là `calc()` nên không đọc ngược được từ style; `_debug()` lưu cỡ ở `box._tx.size`.
  - `[BẪY ĐÃ SẬP]` `DRDialogue.start` gán `R = run(...)` sau khi node rỗng đã kết thúc ⇒ `isOpen()` kẹt true sau khi rời điểm đến (js/dialogue.js, chưa sửa); test dùng `DRYarn.current()` + khung `#dr-dlg`.
  - Khoang bậc 1 (~36 ô cho đồ thường) không đủ chứa vật liệu hull 2 (30 ô) cùng đồ khác: test gỡ rod1/engine1 trước khi mua.

## banner_ui.py — banner thông báo (BannersUI / BannerUI) [ĐO TRONG REPO, 2026-10-08]

- Chạy SAU `harvest_ui.py` (dùng chung bộ đọc cảnh, chỉ mục guid, catalog, hàm cắt sprite): `python -I tools/banner_ui.py` (~3 s). Ra `art/ui/banner/banner_ui.js` (`DR_BANNER_UI`: CanvasScaler, topYPos/bottomYPos, cây RectTransform, trạng thái + clip của BannerAnimator kèm sự kiện, tên clip tiếng, chuỗi gốc) và `art/ui/banner/sprites/*.webp` (~36 KB).
- Bẫy:
  - `[BẪY ĐÃ SẬP]` ±250 là `anchoredPosition.y` của **BannerUIContainer** (nơi gắn BannerUI + Animator), không phải nút "BannerUI" con 600x100 (tắt sẵn, clip Enter bật lên).
  - `holdTimeSec` 5 s là hằng trong mã (`BannersUI.cs:9`), không có trong cảnh. Banner kế chỉ hiện sau sự kiện `OnHideCompleteEventFired` của clip Exit (0,25 s).
  - Ảnh `mackerel` trong cảnh là ảnh mẫu: bỏ, lúc chạy gán sprite của món.
  - Viền 9 mảnh của Backplate phải vẽ ở `::before`: viền CSS trên chính nút làm Title/Subtitle bị thu hẹp và lệch.
- Kiểm: `node test/dredge-fishing.js` (banner loài mới ở con đầu, không ở con thứ hai; tiếng "Fish - New").

## Tiếng vòng 2: audio.py, sfx_dest.py, sfx_scene.py, js/sfx.js [ĐO TRONG REPO, 2026-10-08]

- Thứ tự chạy: `index_bundles.py` -> `audio.py` (bóc mọi clip ra `D:\dredge-refudio`, dựng `audio/**` + `data/audio.js`, in giá vốn từng nhóm) -> `sfx_dest.py` (~2 phút, ghi `D:\dredge-ref\cache\sfx_dest.json`) -> `sfx_scene.py` (~15 s, ghi `data/sfx.js` = `window.DR_SFX`). `sfx_scene.py` chỉ liệt kê clip bằng TÊN GỐC, nên chạy được trước hoặc sau `audio.py`; clip chưa có trong `audio.js` thì lúc chạy bị bỏ qua.
- `audio.py` chạy ~3-4 phút (ffmpeg từng clip) và dựng lại `audio/` từ đầu. Mã web gọi clip bằng tên gốc (`DRAudio.play('Dog - Pick Up 1')`) thì phải có dòng `N(...)` ở nhóm `p1-*`/`p2-*`; gõ sai tên thì cuối lần chạy in `PROBLEM`. Kiểm: `node test/dredge-asset-keys.js`.
- Ngân sách vòng 2: +10 MB (cả `games/dredge` <= 90 MB). Thứ tự bỏ khi hết chỗ: nhạc bến > nhạc chớp (mono 64k) > P2 (truyện, điểm đến, POI) > P1.
- Kiểm hành vi: `node test/dredge-sfx.js` (bấm chuột/phím thật, gián điệp WebAudio ghi mọi `start()` kèm cao độ/âm lượng). Đo tải: `scratchpad/sfx/perf_ab.js`, chỉ đo khi máy rảnh.
- Bẫy đã sập:
  - `[BẪY ĐÃ SẬP]` AssetRipper bỏ HẾT trường của Dock/BaseDestination/UpgradeGridPanel/AbilityRadial (chỉ còn `m_Script`): tiếng vào điểm đến phải đọc bằng UnityPy (`sfx_dest.py`), và phải nạp riêng bundle `gameaudio`/`commonaudio`/`gamescene` mới tra được tên clip.
  - `[BẪY ĐÃ SẬP]` Nguồn tiếng vùng (Day/Night/General) có SpatialBlend 0: gốc chỉ chỉnh âm lượng theo khoảng cách (`Volume2D`), không panning. Chỉ nguồn 3D thật mới dùng PannerNode.
  - `[BẪY ĐÃ SẬP]` `Waves Ambience 1` và tiếng mòng biển cố định KHÔNG có trong bản gốc (nguồn nằm trong GO bị tắt): đã bỏ, đừng thêm lại vòng biển 0,8.
  - Tên gốc viết sai chính tả được giữ nguyên: `Relic Necklance Place`.
  - Gói DLC (Pale Reach, Iron Rig) và nhạc/nhạc chớp của chúng cố ý không đóng gói; `Ooze Vacuum *` và `Fishing Minigame Doors *` (DLC2) chỉ đóng gói vì nhánh gear/fishing gọi bằng tên gốc.
  - Trình duyệt chặn WebAudio tới cú chạm đầu tiên: `js/sfx.js` đặt lại trạng thái mong muốn mỗi nhịp thay vì chỉ phát một lần.

## Hệ hạt chung (`particles.py` → `js/particles.js`) [ĐO TRONG REPO, 2026-10-08]

- Chạy: `python -I games/dredge/tools/particles.py` (~2 phút, cần PyYAML có libyaml, numpy, Pillow; UnityPy cho phần shader). Ra `data/particles.js` (`DR_PARTICLES` 31 hệ gọi tên, `DR_PARTICLES_SCENE` 141 nguồn đặt sẵn, `DR_PARTICLES_LIB`; ~192 KB) và `art/vfx/p/*.webp` (27 texture, ~153 KB). Chạy lại ra đúng từng byte (đã kiểm md5 hai lần).
  - `--dis`: rã DXBC đúng biến thể keyword của các vật liệu hạt vào `D:/dredge-ref/cache/particles/shaders/*.txt` (cùng cách `env.py --dis`). Thân shader trong `js/particles.js` đọc từ đây.
- API cho luồng khác: `DRParticles.spawn(tên, { pos, parent, yaw, scale, loop, follow, size, lifetime })` → `{ stop(), setRate(k), setRateOverTime(r), setSimulationSpeed(v), setSubEmitProbability(i, p), alive }`.
  - `setRate(k)` là hệ số nhân (khói ống khói = burn²). `setRateOverTime(r)` là số hạt/giây tuyệt đối của hệ gốc, như `WeatherController.cs:418,424`; thời tiết phải dùng cái này.
  - Hệ gốc loop + playOnAwake (Rain, Snow) hoặc `loop: true` thì sống tới khi `stop()`. Hệ loop mà playOnAwake tắt (Lightning) tự giải phóng khi hết hạt.
- `[BẪY ĐÃ SẬP]` Vật liệu Shader Graph bản 1.5.3 không ghi blend vào `.mat` (`_SrcBlend 1, _DstBlend 0` là mặc định cũ). Blend/ZWrite/ZTest/Cull/Queue phải lấy từ pass "Universal Forward" của shader đã tuần tự hoá trong bundle.
- `[BẪY ĐÃ SẬP]` YAML Unity ghi tiếp tuyến vô hạn là chuỗi `'Infinity'`. Không ép về số thì đường cong bậc thang hỏng và tệp ra đổi giữa các lần chạy. Tool đổi thành ±1e30, runtime coi > 1e20 là bậc thang.
- `[BẪY ĐÃ SẬP]` `FollowPlayer/Snow` trong cảnh có rateOverTime 0/s, chỉ có hạt khi `WeatherController` gán rate. Nhân hệ số (`setRate`) thì tuyết không bao giờ hiện; mưa HeavyStorm cần 2000/s tuyệt đối (giọt chạm trần maxN 2000).
- `[BẪY ĐÃ SẬP]` emitProbability của sub-emitter phải gieo một lần lúc hạt cha sinh. Gieo mỗi khung thì chỉ làm trễ, xác suất thành 1 (SubEmitter_Lightning p 0,5 luôn bắn).
- `[BẪY ĐÃ SẬP]` `test/dredge-particles.js` gọi `sbs.py` bằng python của node (PATH có thể trỏ bản không có Pillow). Script chọn sẵn pyenv 3.8.10; đổi bằng `PYTHON=<đường dẫn>`.
- Kiểm: `node test/dredge-particles.js` (ảnh và ảnh ghép ở `%TEMP%/dredge-particles`). Đo khung: `PERF_ONLY=1 DR_ROOT=<cây cần đo> node test/dredge-particles.js`, chạy xen kẽ trước/sau, lấy trung vị.

## data.py — đợt 2: khoá chữ của item, lưới phụ, lưới giao nâng cấp, tiếng thời tiết, thành phần scene [ĐO TRONG REPO, 2026-10-08]

- Chạy như cũ: `python -I games/dredge/tools/data.py` (25–100 giây). Chạy hai lần liền ra đúng từng byte (13 tệp `data/*.js`, 1167 ảnh `art/items` + `art/ui/sprites`, 13 json cache: sha256 giống nhau). Kiểm: `node test/dredge-data.js` (73 khẳng định, chỉ cần node, số mong đợi đọc thẳng từ asset gốc; chạy trên dữ liệu cũ thì hỏng).
- Thêm vào dữ liệu:
  - `items.js`: `tooltipTextColor`, `tooltipNotesColor` (420/420; 5 màu chữ, màu ghi chú luôn trắng). Quy ước `<x>Key` = khoá `DR_STR`, `<x>` = chữ: `itemInsaneTitleKey` (6), `itemInsaneDescriptionKey` (7), `additionalNoteKey` (5) nay là khoá, chữ nằm ở `itemInsaneTitle`, `itemInsaneDescription`, `additionalNote`; `dialogueNodeSpecificDescription` (3) giữ chữ và có thêm `dialogueNodeSpecificDescriptionKey`. Mọi khoá được kiểm tra tra ra đúng chữ trong `DR_STR` lúc chạy. Các trường còn lại của audit (`forbidStorageTray`, `hasSpecialDiscardAction`, `discardPromptOverride`, `cellsExcludedFromDisplayingInfection`, trường Deployable/Gadget...) đã có từ trước, `test/dredge-data.js` khoá giá trị.
  - `grids.js`: +46 lưới (306 mục, 193 tên); `config.js`: `gridKeyIds` (tên GridKey → số, `STORAGE_TRAY` = 11) và `gridConfigs.UPGRADE_T2..T5_HULL` trỏ đúng lưới giao.
  - `upgrades.js`: `DR_UPGRADES[id].questGrid` cho 20 nâng cấp (`gridKey` + `gridKeyId`, `gridConfiguration` là khoá `DR_GRIDS`, `questGridExitMode`, `isSaved`, `presetGridMode`, `presetGrid.spatialItems` {id,x,y,z}, `completeConditions` {item,count}, `titleString` + `titleStringKey`, `allowEquipmentInstallation`...); `upgradeCost` dựng lại từ `completeConditions`.
  - `weather.js`: `parameters.sfx` = tên clip (12/15). `world_data.js`: `DR_WORLD.<Lớp>.<Lớp>` cho `ShopRestocker` (12 cặp ShopData → GridKey + 10 `itemsToKeepInStock`), `TooltipSectionGadgetDetails` (`gadgetEffectNames` chữ, `gadgetEffectKeys` khoá), `QuestGridPanel` và `UpgradeGridPanel` (chữ trợ giúp mặc định), `HarvestMinigameView` (`storageTrayUnlockQuest`), cùng `loopSFX` của Mayor và LighthouseKeeper.
- Bẫy đã sập:
  - `[BẪY ĐÃ SẬP]` `collect()` chỉ thấy asset chính trong container. `GridConfiguration` là asset phụ của bundle `itemdata`/`upgradedata`/`questgriddata` nên thiếu 42 tên (Pot1, Pot7, Net2–6, Net8 do item trỏ tới; 34 tên như ItemPickup*, HoodedFigure*, PassengerPickup_* do `QuestGridConfig.gridConfiguration` trỏ tới): trước đó 8 + 34 tham chiếu treo. `sweep_grids()` quét mọi tệp đã nạp: 193 tên, 0 tham chiếu treo.
  - `[BẪY ĐÃ SẬP]` Cùng tên, khác hình: `Tier2Hull`..`Tier5Hull` là bố cục khoang (7x10...) và cũng là lưới giao vật liệu của nâng cấp (5x6, 6x6, 7x6, 4x2). Bản cũ cho `UPGRADE_T2_HULL` trỏ nhầm 7x10. Lưới giao mang khoá `Tier2Hull#UPGRADE_T2_HULL`; `ref_name()` tra theo chữ ký hình (`GRID_SIG`) chứ không theo tên. So hình phải bỏ `mainItemData`: bản chép ở `sharedassets0` ghi tên asset, bản bundle ghi id.
  - `[BẪY ĐÃ SẬP]` `UpgradeData.upgradeCost` là danh sách cũ của editor; game thu theo `gridConfig.completeConditions` (`UpgradeData.cs`). `tier-5-hull` tốn 2 `crate`, không phải 4 gỗ/3 sắt/4 vải/3 kim loại; 19 nâng cấp kia khớp nhau.
  - `[BẪY ĐÃ SẬP]` `WeatherData.parameters.sfx` là PPtr thẳng tới AudioClip nằm trong bundle âm thanh mà `load_all()` bỏ qua (`gameaudio` 258 MB) nên ra `null`. Không nạp bundle: `audio_clip_name()` tra `path_id` trong `bundle_index.json`. Clear, Fine, FinaleStorm không có clip thật (âm lượng 0).
  - `[BẪY ĐÃ SẬP]` Gọi `export_obj` mà chưa `loc.load()` thì mọi `LocalizedString` ra `null` (`odin_upg.py` của audit báo `titleString: null`). Tiêu đề lưới giao thật là `quest-grid.upgrades` "Materials Required".
  - `[BẪY ĐÃ SẬP]` Hai bảng chữ trợ giúp: `QuestGridPanel` "You can return to these items later." còn `UpgradeGridPanel` "Materials left here will be saved." (audit gán nhầm bộ đầu cho màn nâng cấp). `storageTrayUnlockQuest` là PPtr thường (`Quest_Intro`), không phải Odin.
  - `[BẪY ĐÃ SẬP]` `prompt.radial-show` và `prompt.action` là tên đặt cứng trong mã C# (`AbilityRadial.cs:109`, `AbilityBarUI.cs:53`), không có trong bảng chữ nào (quét cả khoá chung lẫn KeyId), nên không bổ sung được. Mọi khoá và KeyId khác mà audit nêu đã có trong `DR_STR`.

## anim.py + js/anim.js — clip, Animator, chân dung (U2, U3, D1, D2) [ĐO TRONG REPO, 2026-10-08]

- Chạy: `python -I games/dredge/tools/anim.py` (~2 giây, cần PyYAML có libyaml; không cần `index_bundles.py`). Ra `data/animlib.js` (`window.DR_ANIM`, ~0,32 MB). `--out <tệp>` ghi chỗ khác để so hai lần chạy: ra đúng từng byte.
- Nguồn: YAML của AssetRipper (`AnimationClip`, `AnimatorController`, `AnimatorOverrideController`, `GameObject/<prefab>.prefab`, `Sprite`, đã giải nén `m_MuscleClip`) và các thư mục con của `art/portraits/` (danh sách prefab chân dung = thư mục `tools/yarn.py` đã bóc; nên chạy `yarn.py` trước, nó cũng cho `data/yarn.js` để tool đối chiếu bố cục).
- Danh sách tường minh trong đầu `anim.py` (không bóc cả 419 clip: 130 clip xương cần khung xương mà web chưa có): 55 prefab chân dung → 38 controller (clip `*Appear`, kèm `BookIdle`, `Scientist7Idle`); HUD `BannerAnimator`, `LoadingScreenAnimator`, `SpyglassUIAnimator`, `ResearchNotchAnimator`, `SpeakerButtonAttentionCallout`, `UnseenCabinItemAnimator(_0)`, `HasteBarAnimator`; lưới `TrawlNet_Animator`, `SalvageNet_Animator` (3 layer, 17 clip mỗi cái); phao `CrabPotBuoy_Animator`, `Bait_Animator`, `FlotsamPotBuoy_Animator` (override, tool dựng thành controller đầy đủ). Tổng 98 clip, 51 controller, 55 rig, 1.958 curve.
- Lược đồ `DR_ANIM` (chi tiết kiểu ở đầu `js/anim.js`):
  - `clips[tên] = {len, loop, curves:[{path, prop, [cls], keys:[[t, giá trị, tiếp tuyến vào, tiếp tuyến ra]]}], [sprites], [events:[{t, fn, [data], [f], [i]}]]}`. **Tên clip = tên tệp `.anim`** (không phải `m_Name`: có `Idle`, `Idle_0`, `Idle_1`, `Idle_3` cùng tên). `path` tính từ GameObject mang Animator, `""` là chính nó. `prop` theo Unity: `m_LocalPosition.x`, `localEulerAnglesRaw.z` (độ, ZXY), `m_LocalScale.x`, `m_AnchoredPosition.x`, `m_Alpha`, `m_Color.a`, `m_IsActive`, `blendShape.Key 1`...
  - `controllers[tên] = {params:[[tên, kiểu, mặc định]], default, states:{tên:{clip, speed, [speedParam], [wd:0]}}, transitions:[{from ("*" = any-state), to, cond:[[param, phép, ngưỡng]], dur, exitTime|null, [offset], [fixed:0], [self:0]}], [layers:[{name, weight, default, states, transitions}]]}`; layer 0 ở gốc, các layer sau ở `layers`.
  - `rigs[prefab] = {ctrl, nodes:[{n, p, ap, sd, an:[minX,minY,maxX,maxY], pv, sc, rz, [on:0], [cg], [col], [img], [pa:1]}]}`: cây RectTransform của prefab chân dung theo thứ tự cây; `img` là tệp webp của `yarn.py`.
- Dùng (đủ API ở đầu `js/anim.js`):
  ```js
  // lưới kéo / lưới trục vớt (đích three.js; path của clip tính từ node TrawlNet / SalvageNet trong boat.glb)
  const net = DRAnim.bind(trawlNode, 'TrawlNet_Animator', { onEvent: (e) => {}, onFloat: (path, prop, v) => {} });
  net.set('isDeployed', true); net.set('fullness', 0.4); net.set('isBroken', false);   // mỗi khung: net.update(dt)
  // phao rập cua / mồi: bind(node, 'CrabPotBuoy_Animator' | 'Bait_Animator' | 'FlotsamPotBuoy_Animator'); p.trigger('deploy')
  // HUD (DOM): dựng rig từ cây RectTransform của chủ rồi chạy controller; phần tử có sẵn nhận ma trận qua opts.adopt
  const h = DRAnim.rig(nodes, container, { adopt: n => elementByPath[n.path] });
  const p = DRAnim.bind(h, 'BannerAnimator'); p.set('showing', true);
  // đích tuỳ ý: DRAnim.bind({ set(path, prop, value) {...}, end() {} }, 'SpyglassUIAnimator')
  ```
  Path của clip lưới mà `boat.glb` chưa có: `.../NetMesh/DestroyedParticles` và `.../NetMesh/Mesh/NetTrailParticles` (hệ hạt); `EmissionModule.enabled` và `m_IsActive` của chúng đi qua `onFloat` / `userData['an:...']`.
- Clip HUD/gear animate gì (path tính từ GameObject mang Animator; chủ giao diện/gear dựng nút trùng tên):
  - `BannerAnimator` (bool `showing`): `Enter` 0,333 s: `BannerUI` (m_Alpha, m_AnchoredPosition, m_IsActive), `BannerUI/Backplate` + `BannerUI/ImageBackplate` (m_LocalScale), `BannerUI/Backplate/Title` + `/Subtitle` (m_AnchoredPosition); `Exit` 0,25 s: `BannerUI` m_Alpha + m_IsActive, sự kiện `OnHideCompleteEventFired` ở 0,25 s.
  - `LoadingScreenAnimator` (trigger `show`/`hide`, từ any-state, không tự chuyển vào chính nó): gốc m_Alpha + m_BlocksRaycasts, `Container` m_IsActive, 0,5 s, sự kiện `OnLoadingScreenAnimationComplete` ở 0,5 s.
  - `SpyglassUIAnimator` (bool `showing`): `InfoPanelContainer` m_Alpha, Show/Hide 0,1167 s, Idle là tư thế tĩnh.
  - `ResearchNotchAnimator` (trigger `fill`): `NotchFade` euler z 180 → 0, scale 5 → 1, m_Color.a 0 → 1 trong 0,5 s, sự kiện `OnAnimationComplete` ở 0,5 s.
  - `SpeakerButtonAttentionCallout` (lặp 1,083 s): gốc lắc euler z + m_SizeDelta 60 → ~130 → 60; sprite `AlertIcon_0`. `UnseenCabinItemAnimator(_0)`: gốc m_SizeDelta + m_Pivot, `NewUnseenCabinItem` 0,333 s rồi `UnseenCabinItem` lặp 2 s.
  - `HasteBarAnimator` (trigger `explode`): `Container/AnimatedIcon` scale 1 → 2,5 + m_Color.a 1 → 0, `Container/Border/AnimatedFill` m_Color.a nhấp nháy, 0,4667 s.
  - `CrabPotBuoy_Animator` / `FlotsamPotBuoy_Animator` / `Bait_Animator` (trigger `deploy`): `BuoyMesh` scale 0 → 1 lúc 0,83–1 s rồi lắc euler tới 2,5167 s, `CrabPotParticle` m_IsActive; `BaitParticle` m_IsActive trong 2,5 s. Hết Place tự về Idle (exitTime 1).
  - `TrawlNet_Animator` / `SalvageNet_Animator` (bool `isDeployed`, `isBroken`, float `fullness`): layer gốc `TrawlDeploy` 2,0 s (TrawlArm euler x 20 → −85 trong 0,667 s, NetMesh trượt xuống −1,1), `TrawlDeployedIdle`, `TrawlRetract` 0,917 s; layer `BrokenNet` (`TrawlNetBroken` 0,817 s: TrawlArmature rung, tắt `Mesh`, bật `DestroyedParticles`); layer `NetFillAmount` 11 tư thế `Net_00..Net_100` (blendShape `Key 1`, bật `Fish1..10`) đi từng bậc 10% mỗi khung theo ngưỡng `fullness`.
- Kiểm: `node test/dredge-anim.js` (phần node đối chiếu từng curve với YAML bằng bộ đọc YAML riêng của bài kiểm; phần trình duyệt mở hội thoại Mayor bằng phím thật, ảnh chân dung ở 0 / 0,25 / 0,5 s và khi đứng yên, ghép với `gog_24` / `gog_02` bằng `sbs.py`; ảnh ở `%TEMP%/dredge-anim`).
- Bẫy đã sập:
  - `[BẪY ĐÃ SẬP]` fileID dài 18 chữ số: đọc qua `float` mất chữ số cuối nên mọi tham chiếu `{fileID: N}` trượt, rig ra 1 nút. Số nguyên phải đọc thẳng từ chuỗi.
  - `[BẪY ĐÃ SẬP]` PyYAML đổi tên GameObject/đường dẫn `1`, `On`, `1.5` thành số/bool và `path:` rỗng thành `None`. Tool dùng bộ nạp không nhận dạng ngầm (mọi scalar là chuỗi) rồi ép số bằng `F()`/`I()`.
  - `[BẪY ĐÃ SẬP]` Đường dẫn chỉ còn băm `path_0x23998AF8_vVpLuvN` (ShipwrightAppear) = CRC32 của đường dẫn thật `Shipwright_Foreground`; lớp này đã bị xoá khỏi prefab nên 2 curve đó chết (tool bỏ, in số lượng). `script_0x7822D856_...` = CRC32 của `m_Sprite` (SpeakerButtonAttentionCalloutLoop gán sprite `AlertIcon_0`). Ứng viên: đường dẫn có thật của prefab dùng clip + `<Prefab>_<Từ>` (Foreground, Background...).
  - `[BẪY ĐÃ SẬP]` Tiếp tuyến `Infinity` (đường bậc thang, mọi `m_IsActive`) không phải JSON: `animlib.js` giữ nguyên chữ `Infinity`, còn `JSON.stringify` đổi thành `null`. Bậc thang: khoá trái có tiếp tuyến ra vô cực → giữ giá trị khoá trái tới khoá phải.
  - `[BẪY ĐÃ SẬP]` Cả 13.154 curve đều `m_PreInfinity = m_PostInfinity = 2` (kẹp), cả 279.163 khoá `weightedMode 0` (không có trọng số; tool dừng nếu gặp). Vòng lặp nằm ở `m_AnimationClipSettings.m_LoopTime` (89/419 clip), không ở `m_WrapMode` (toàn 0).
  - `[BẪY ĐÃ SẬP]` `m_EulerCurves` mang vector `{x,y,z}`; thứ tự xoay ZXY (`m_RotationOrder: 4`) = `Quaternion.Euler`. Sang three.js: dựng quaternion Unity rồi đổi `(−x,−y,z,w)`, vị trí `(x,y,−z)`; node GLB đã đổi sẵn cùng công thức. GLTFLoader bỏ `. / : [ ]` khỏi tên node nên so tên phải qua `sanitize`.
  - `[BẪY ĐÃ SẬP]` `Image.preserveAspect`: hình chữ nhật RectTransform của lớp chân dung rộng hơn sprite (124/131 lớp, tới 4,7 lần). Bản phẳng cũ kéo ảnh cho đầy hộp (Scientist rộng gấp 1,7 so với gog_24). Rig vẽ `object-fit: contain` + `object-position` theo pivot như `Image.PreserveSpriteAspectRatio`; 6 Image tắt cờ (Book, CollectorReveal) vẫn kéo giãn.
  - `[BẪY ĐÃ SẬP]` Muốn ghép ảnh với `gog_02` phải dùng prefab `CollectorUnknown` (người trong khung cửa, tối), không phải `Collector`; với `gog_24` dùng `Scientist_2` (bảng + 1 vết nứt + người; `Scientist_3` thêm hai tờ giấy mà ảnh gốc không có), không phải `Scientist` (một lớp, không bảng). [ĐO bằng mắt qua sbs.py]
  - `[BẪY ĐÃ SẬP]` Lớp sprite có scale 100 trên hộp 5,7×7,0: đặt CSS lồng nhau bị LayoutUnit (1/64 px) làm lệch tới 1,5 px sau nhân 100. Rig tính ma trận thế giới bằng số thực, hộp CSS đặt cỡ nghỉ (sizeDelta × scale) nên ma trận chỉ còn phần chênh.
  - `[BẪY ĐÃ SẬP]` Màu Image không chỉ là alpha: `m_Color.r/g/b` chạy 0 → 1 cùng alpha (lớp tối dần lên), và `BookR`/`BookB` có màu khác kênh (cần bộ lọc SVG `feColorMatrix`, `color-interpolation-filters: sRGB`; `brightness()` chỉ đủ khi r = g = b).
  - `[BẪY ĐÃ SẬP]` `m_WriteDefaultValues: 0` ở layer gốc của lưới, các layer sau mặc định 1: layer ghi đè trọng số 1 với WriteDefaults bật sẽ ghi giá trị nghỉ đè lên thuộc tính layer dưới đã animate (đúng như Unity).
  - 36 nút chân dung có sprite nhưng tắt lúc nghỉ (Scientist_2..5 vết nứt, tờ giấy...) chưa có ảnh vì `yarn.py` bỏ cả nhánh GameObject tắt; hệ hạt (`UIParticle`) không vào rig nhưng tính là "có thật" khi xét curve chết.

## deploy.py — phao bẫy cua, điểm mồi (lưới kéo, bẫy cua, mồi: js/deploy.js) [ĐO TRONG REPO, 2026-10-09]

- Chạy SAU `data.py` (đọc `data/items.js` để tra id item theo tên asset): `python -I games/dredge/tools/deploy.py` (~10 giây, phần lớn là đọc dòng `Game.unity`). Ra `data/deploy.js` (`window.DR_DEPLOY`, ~115 KB: cây nút + lưới + vật liệu của `PlacedHarvestPOI`, `PlacedMaterialHarvestPOI`, `BaitPOI`; `materialPotItem`; `bait.items/deepForm` của BaitAbility) và `art/deploy/*.webp` (3 ảnh 32×32 lossless, < 1 KB). Chạy hai lần ra đúng từng byte.
- Hoạt hình phao (`CrabPotBuoy_Animator`, `FlotsamPotBuoy_Animator`, `Bait_Animator`) và lưới (`TrawlNet_Animator`) đã có sẵn trong `data/animlib.js` (anim.py), js/deploy.js chạy bằng `DRAnim.bind`.
- Kiểm: `node test/dredge-r2deploy.js` (ảnh ở `%TEMP%\dredge-r2deploy`).
- Bẫy:
  - `[BẪY ĐÃ SẬP]` `id` của item nằm trong blob Odin, không có dòng `id:` trong `.asset` của AssetRipper: tool tra ngược theo tên asset (`TIRPot1` → `tir-pot1`) qua `data/items.js`.
  - `[BẪY ĐÃ SẬP]` Controller của phao vật liệu là `AnimatorOverrideController` (thư mục riêng), không phải `AnimatorController`: chỉ mục guid phải quét cả hai.
  - `[BẪY ĐÃ SẬP]` `BuoyMesh/CrabPotParticle` (lưới ~45-75 KB) tắt sẵn; clip Place chỉ bật nút hạt CÙNG TÊN ở `CrabPotBuoy/CrabPotParticle` (ParticleSystem). Tool bỏ lưới của nút đang tắt.
  - `[BẪY ĐÃ SẬP]` Vật liệu nhấp nháy dùng `BlinkingLightGradient`, không phải `LightFlickerGradient` chung của `art/env/flicker.png`: tool ghi kênh R vào `materials.*.flickerGradient`.
  - Trường `OccasionalGridPanel.openSFX`, `ActiveAbilityInfoPanel.*QualityIcon` bị AssetRipper bỏ (khối rỗng như AbilityRadial): js/deploy.js chọn clip/sprite cùng tên, ghi `[ĐỀ XUẤT]`.
  - `GameConfigData.maxCrabPotCount` (25) không còn được mã 1.5.3 đọc; web chặn ở bẫy thứ 26 theo chuỗi `notification.crab-pot-deployment-failed-too-many`.

## shop_ui.py — chợ / xưởng tàu hai lưới (MarketDestination, ShipyardSlidePanel, MarketSlidePanel) [ĐO TRONG REPO, 2026-10-09]
- Chạy: `python -I games/dredge/tools/shop_ui.py` (sau `index_bundles.py`; ~50 s vì `load_all()` để giải PPtr sprite tab và `specificItemsBought`). Ghi `data/shop_ui.js` (`DR_SHOP_UI.dests[id]`: loại / phân loại mua, bán sỉ, `sellValueModifier`, `allowSellIfGridFull`, `allowRepairs`, `allowStorageAccess`, tab `{gridKey, icon, titleKey, title, unlockNodes}`, `playerTabs`; `DR_SHOP_UI.layout`: RectTransform của 16 nút UI). Không tạo ảnh.
- Dùng: `js/shop.js` (lưới hàng `DR.s.grids['Shop_' + GridKey]`, nhập hàng theo `DR_WORLD.ShopRestocker` + `ShopData`). Kiểm: `node test/dredge-r2shop.js`.
- Bẫy:
  - `[BẪY ĐÃ SẬP]` Game.unity của AssetRipper bỏ hết trường `MarketDestination` (SerializedMonoBehaviour): phải đọc typetree trong bundle scene như `sfx_dest.py`.
  - 5 pontoon cùng id `destination.tm-shipyard` / `tm-fish-market`, giá trị giống hệt nhau: tool lấy bản đầu theo đường dẫn.
  - `gridKey` trong `marketTabs` là số: đổi tên qua enum `GridKey` của mã C# (`Dt.cs.enum_name`). `lm-trader` có tab `NONE` (bán là mất, không có lưới hàng).
  - Đi cây UI bằng tên con từ `MarketDestinationUI` thay vì quét mọi RectTransform của scene (quét hết chậm hàng phút).
  - Bố cục: `rectIn()` trong `js/shop.js` tính hộp từ neo + pivot + sizeDelta (trục y Unity hướng lên); ShopGrid nằm trong `TabbedPanelContainer/Panels/ShopPanel/Container` → lưới 8x9 ô 60 ở (72, 312) trên canvas 1920x1080.

## tentacle.py — xúc tu đỏ gai của sự kiện TentacleAttack (V14, hoảng loạn cao) [ĐO TRONG REPO, 2026-10-09]
- Chạy: `python -I games/dredge/tools/tentacle.py` (vài giây, chỉ đọc `GameObject/TentacleAttack.prefab`, `Mesh/*.asset`, hai clip `Armature_Spawn` / `Tentacle_Retract`, `Material/AttackingTentacle_Mat`). Ghi `data/tentacle.js` (~75 KB) và `art/vfx/tentacle/{albedo,emission}.webp` (256 px).
- Dùng: `js/tentacle.js` (sự kiện thế giới + xương + vật liệu), nối qua `DRVfx.init/update/reset` trong `js/vfx.js`. Kiểm: `node test/dredge-vwater.js`; ảnh so clip: `node test/dredge-tour.js panic-high`.
- Bẫy:
  - `[BẪY ĐÃ SẬP]` Sự kiện bị bỏ nhầm là `Vines`: prefab đó là dây leo vân gỗ ô liu, cấm ở Marrows; xúc tu đỏ ở clip (t = 1671) là `TentacleAttack` (sanity ≤ 0,1, worldPhase ≥ 2, đêm). Tìm bằng `AttackingTentacle_Mat` (texture + emission đỏ gai), không bằng tên "panic".
  - Mesh có trọng số xương nằm trong kênh 12/13 của vertex buffer (không phải `m_Skin`); bindpose Unity đã gồm biến đổi của nút `Tentacle` nên mesh ở gốc thế giới, `bind(skeleton, đơn vị)` (xem đầu `js/tentacle.js`).
  - Đổi hệ toạ độ: z đảo dấu ở vị trí, quaternion (x,y,z,w) → (−x,−y,z,w), bindpose S·M·S, tam giác đảo chiều. Đường cong clip là Hermite theo từng thành phần: giữ khoá thưa, không lấy mẫu lại.
  - `data/worldevents.js` (đã có từ trước) chưa được nạp ở đâu; `index.html` nay nạp nó cho `js/tentacle.js` (TestWorldEvent/SelectInsanityEvent thật).
  - Độ sâu `CheckDepthRelativePoint` dùng `depth01 > minDepth` (minDepth 0,1 = 10 m): vịnh Marrows quá nông, xúc tu chỉ ra ở biển sâu.

## book_ui.py — Bản đồ (MapWindow, M) và Bách khoa (EncyclopediaWindow, L) [ĐO TRONG REPO, 2026-10-09]
- Chạy sau `index_bundles.py` và `data.py`: `python -I games/dredge/tools/book_ui.py` (~6 phút vì `load_all()`; ra đúng từng byte). Ghi `data/encyclopedia.js` (`window.DR_BOOK`: cây RectTransform hai cửa sổ, sprite, thứ tự cá `allFish`, màu, tham số) và `art/ui/book/*.webp` (~0,6 MB, cỡ gốc; ảnh > 150 nghìn điểm lưu WebP q88).
- Dùng: `js/book_kit.js` (dựng cây + cửa sổ chung `DRBook`), `js/map.js`, `js/encyclopedia.js`. Kiểm: `node test/dredge-vbook.js`; ảnh so video: `node test/dredge-tour.js map encyclopedia`.
- Bẫy:
  - `[BẪY ĐÃ SẬP]` `Image` tắt (`m_Enabled = 0`) của vùng bấm Zones / Types và `Mask` có `m_ShowMaskGraphic = 0` (MapMask, LettersMask, NumbersMask): vẽ chúng thành khối trắng che cả sách. Tool ghi `img.en` và `mask`.
  - `[BẪY ĐÃ SẬP]` Lưới bản đồ là `RawImage` (texture `MapTilingCell` lặp 19 x 15), không phải sprite `GridSquare` (đó là viền ô ảnh cá trong sách).
  - Nhãn vùng uốn cung dùng script plugin (không có trong Assembly-CSharp), nhận bằng trường `m_arcDegrees`; `m_fontStyle` 17 = đậm + chữ hoa.
  - `DockLabel.dockData.id` = khoá chuỗi (`dock.greater-marrow`), trùng id bến của web và cờ `has-visited-dock-<id>`.
  - `Encyclopedia.allFish` có 230 cá kể cả DLC; web bỏ cá cần DLC_1 / DLC_2 (còn 151), nên sách hiện "x/151" chứ không phải "x/128" của bản demo trong video.
  - Danh sách vùng trong ô "vùng" là cách vẽ của bản demo (video t=360); bản 1.5.3 dùng ảnh `zone-img-*`. Web vẽ danh sách.

## ghosts.py — thuyền ma GhostBoat_* và FogGhost tĩnh (U4: js/ghosts.js) [ĐO TRONG REPO, 2026-10-10]
- Chạy: `python -I games/dredge/tools/ghosts.py` (~30 giây: nạp scene qua `world.py`, trạng thái pass của shader qua `particles.py`). Ghi `data/ghosts.js` (`window.DR_GHOSTS`) + `art/vfx/ghosts/meshes.bin` (350 KB) + `emission.webp`; ra đúng từng byte.
- Đọc: 4 prefab `GhostBoat_*` (số của `GhostBoatWorldEvent`, `NavMeshAgent`, `AudioSource` còi; mỗi thuyền có thời gian còi / cao độ riêng), 15 `FogGhosts/*` trong scene (`FogGhost`: seenMaxDistanceThreshold, manuallyFadeOutIfCloserThanSeenDistance), clip `FogGhost_FadeIn/Out` (đường cong float `Opacity`, tiếp tuyến 0 = smoothstep).
- `meshes.bin`: mỗi mesh = vị trí int16 (lượng tử theo hộp bao `bb`), uv int16 (`uvb`), màu đỉnh uint8 nếu có, chỉ số uint16; đệm bội 4 byte. `js/ghosts.js` nạp một lần bằng `fetch`.
- Bẫy:
  - `[BẪY ĐÃ SẬP]` Mesh ma không có pháp tuyến dùng: shader `FogGhost_Shader` chỉ đọc vị trí, uv, màu đỉnh. Bỏ pháp tuyến rồi hàn đỉnh trùng (vị trí + uv + màu) làm `ghost_containership` từ 13.731 xuống 4.530 đỉnh.
  - Mesh không có kênh COLOR thì màu đỉnh là trắng; alpha màu đỉnh nhân vào độ mờ (mesh đảo/nhà ma dùng nó để mờ phần chân).
  - Biến thể shader dùng là biến thể KHÔNG keyword: `BOOLEAN_367D..._ON` ghi trong `.mat` không phải biến thể có thật (disassembly báo "không có biến thể").
  - `GhostBoatWorldEvent.PickDestination` có vòng `while` không tăng bộ đếm và `LookRotation(destination)` nhận toạ độ đích chứ không phải hiệu vector: web chặn 10 lần thử và bắt chước hướng khởi đầu từ gốc thế giới (agent quay về hướng chạy ngay sau đó).
  - FogGhost kết thúc sự kiện NGAY khi kích hoạt, vật vẫn sống tới khi "thấy rồi ra khỏi khung hình"; nên `js/ghosts.js` tự chạy vòng `requestAnimationFrame` cho vật tĩnh thay vì trông vào `handle.update` của DREvents.
- Kiểm: `node test/dredge-m3ghosts.js`.

## angler.py — Night Angler (MarrowMonster, MONSTERS.md §2.1, U1) [ĐO TRONG REPO, 2026-10-10]
- Chạy: `python -I games/dredge/tools/angler.py` (~5 s; đọc Game.unity 168 MB một lần, chỉ parse khối cần; ra đúng từng byte, đã kiểm md5 hai lần). Thêm `--dis`: rã DXBC `Monster_Shader` + `FogGhost_Shader` (bundle gamescene) vào `D:/dredge-ref/cache/angler/shaders/`.
- Ghi `data/angler.js` (`DR_ANGLER`: MonsterData, trường MarrowMonster/VariablePlayerDamager/NavMeshAgent/BuoyantObject/RangeSensor/AudioSource, hai đường 10 điểm của Logic/MonsterManager, cây 43 nút, skin `monster_marrow`, vỏ `GhostBoat1_0`, ba clip, hai AnimatorController, vật liệu; ~315 KB) và `art/vfx/angler/*.webp` (~3 KB). Dùng: `js/angler.js`. Kiểm: `node test/dredge-m2angler.js`.
- Bẫy:
  - Mesh mã hoá base64 (Int16 vị trí theo hộp bao, Uint16 uv/chỉ số, Uint8 xương/trọng số/màu đỉnh); không ghi pháp tuyến vì hai shader (DXBC) không đọc NORMAL ở pixel shader.
  - Clip `MarrowMonster_Swim` dùng `m_EulerCurves` (độ, thứ tự ZXY = three `'YXZ'`; lật z: đảo dấu góc x, y).
  - `attackSFX` là AssetReference: tra `catalog.json` (cách giải của `boat.py guid_path`), không có trong `.meta` của AssetRipper.
  - Tên GameObject chỉ có số (điểm đường `1`..`10`) bị PyYAML đọc thành int: ép `str`.
  - `Monster_Shader`: `Texture2D_f4d8…` = "Texture" (màu), `Texture2D_23e2…` = "Emission" (theo Properties); `tentacle.py` đang đặt ngược hai tên này.
  - `[BẪY ĐÃ SẬP]` three r140 không cập nhật uniform `cameraPosition` cho `MeshBasicMaterial` (chỉ ShaderMaterial/Phong/Toon/Standard hoặc có envMap): nó đứng yên ở (0,0,0). FogGhost tính khoảng cách camera từ `viewMatrix`. `drEnvFogColor` của `js/sky.js` cũng dùng `cameraPosition`.

## mindsucker.py — Mind Sucker (TSMonster) + bẫy cối Twisted Strand (WORLD-GAPS.md R3, r3mind) [ĐO TRONG REPO, 2026-10-10]
- Chạy: `python -I games/dredge/tools/mindsucker.py` (~20 s; đọc Game.unity một lần qua `angler.Scene`, mượn `tentacle.read_skinned_mesh` và `ray.pack_mesh`; cần ffmpeg). Ra đúng từng byte (đã so md5 hai lần).
- Ghi `data/mindsucker.js` (`DR_MINDSUCKER`, ~820 KB: 14 hộp kích hoạt + 20 điểm sinh, cấu hình TSMonster/NavMeshAgent/Eye/InsanityEffector, 21 xương + polySurface341, 13 clip lấy mẫu 15 khung/giây, 3 bẫy, clip TwistedStrandTrapActivate, mesh bẫy sống/vỡ/mồi), `art/vfx/mindsucker/*.webp` (~12 KB), `audio/monsters/mindsucker/*.mp3` (17 clip, ~970 KB; tự đăng ký vào `DR_AUDIO` lúc chạy như `questcmds.js`). Dùng: `js/mindsucker.js`. Kiểm: `node test/dredge-r3mind.js`.
- Bẫy:
  - Không có prefab: mọi thứ nằm trong `Game.unity` (`TwistedStrand/Monsters/*`, `TwistedStrand/Traps/Trap1..3`, `Logic/MonsterManager/TwistedStrandMonsterManager`). Tìm MonoBehaviour bằng guid script (`.cs.meta`), không bằng tên.
  - `vineAttackData` (Vines) nằm ở `Assets/Data/WorldEvent/`, không ở `MonoBehaviour/`.
  - Clip TSM_* bake cả nút `*_ctrl` lẫn `*_jnt`; chỉ `*_jnt` là xương skin. `TwistedStrandTrapActivate` dùng `m_EulerCurves` (ZXY) cho nút `TSMonster` (đổi sang quaternion trước khi lật z). Đường dẫn dạng số (`2306843298`) / `path_0x…` là nút đã xoá: bỏ qua.
  - `InsanityEffector` chỉ bật bởi `m_IsActive` của clip `TSM_DrainIdleRW` (tắt ở `TSM_BanishRW`); SanityModifier `ignoreTimescale = 1` nên hút theo giây thật cả khi thuyền đứng.
  - Nguồn relic4 (WORLD-GAPS §7.1): `Relic4Pickup` là GridConfiguration của lưới `SoldierRelic`, Yarn `Soldier_DeliverTrophy3` mở nó; relic5 tương tự qua lưới `DSPyre` (`Relic5Pickup`). Không có POI nhặt riêng.

## finale.py — hai cảnh kết theo timeline gốc (WORLD-GAPS.md §6 W6b, w6bcut) [ĐO TRONG REPO, 2026-10-10]
- Chạy: `python -I games/dredge/tools/finale.py` (~40 s; đọc Game.unity một lần qua `angler.Scene`, mượn `mindsucker.read_mesh_raw`/`herm`; cần ffmpeg). Sau đó `particles.py` (khối "vòng 8 W6b" của `NAMED`: 9 hệ hạt trong hai timeline + `GMRuinedTown`).
- Ghi `data/finale.js` (`DR_FINALE`, ~86 KB: 171 nút của `InspectPOIs/Finale_Inspect` + `CinematicCameraRigs/Credits`, 2 timeline với track/clip/mốc, 21 clip lấy mẫu, vật liệu, tiếng, cây `GM_RuinedTown`, chỉ số instance cần ẩn), `art/finale/cut.bin` (~1,1 MB: mesh + mẫu Int16), `ruins.bin` (~0,8 MB), `*.webp` (20, ~170 KB), `audio/*.mp3` (6 clip mới, ~590 KB; 4 clip dùng lại mp3 đã có theo trường `orig` của `data/audio.js`). Dùng: `js/finale_cut.js` (W6a gọi `DRFinaleCut.play`). Kiểm: `node test/dredge-w6bcut.js` (+ `dredge-w6finale.js`).
- Bẫy:
  - Một `PlayableDirector` (&122906) giữ binding của CẢ HAI timeline: khoá `m_SceneBindings` là (guid của .playable, fileID của track). Có khoá cũ trỏ vào clip chứ không phải track: bỏ.
  - `[BẪY ĐÃ SẬP]` Animation Track (3) của Good (Circle/Chomp của vòng thân Leviathan) gắn vào Animator của `Credits_VCam`, nên bản gốc không chạy clip đó; vòng thân nằm dưới nước (đỉnh y −18 m) => không xuất (tiết kiệm ~2,5 MB). Tool assert điều này.
  - Marker của Bad là `SignalEmitter` ở tệp riêng `MonoBehaviour/*.asset` (track `Markers`), của Good nằm trong .playable (Signal Track).
  - Offset của `AnimationPlayableAsset` (`m_Position`, `m_EulerAngles`, Euler ZXY) áp cho nút gốc của clip TRƯỚC khi đổi hệ toạ độ; mẫu đã nướng sẵn. Clip vòng lặp biến `kind` trong vòng for: đừng gán lại biến lặp (lỗi đã sập: đường cong Euler thứ hai bị lưu nguyên 3 thành phần).
  - Thuộc tính vật liệu trong clip bị AssetRipper ghi `material.path_0x…_xxx` (không phải CRC32 của tên): không giải được, coi theo nghĩa đoán `[ĐỀ XUẤT]` ở JS.
  - Vật ở xa (Masstrocity ~1000 m, cực quang ~2000 m) vượt `camera.far` ~425 m của main.js: JS nới far trong cảnh kết (bọc `DRWorld.cull`).

## shader_cbuf.py — tên cbuffer của shader đã tuần tự hoá (vòng 9 wfx, mặt nước + vệt) [ĐO TRONG REPO, 2026-10-10]
- Chạy: `python -I games/dredge/tools/shader_cbuf.py [Tên_Shader ...]` (mặc định `Water_Shader FloatingParticle_Shader`, ~2 phút). Ra `D:/dredge-ref/cache/particles/shaders/<Tên>.cbuf.txt`: mỗi dòng `cN.k tên` của `$Globals`/`UnityPerDraw`..., đọc kèm bản rã DXBC (`env.py --dis`, `particles.py --dis`) để biết `cb0[N]` là biến nào. Không ghi gì vào repo.
- Bẫy:
  - `[BẪY ĐÃ SẬP]` bố cục `$Globals` mỗi shader một khác: Water_Shader `_ShallowColor` c126, `_DeepColor` c127, `_FoamColor` c128, `_WorldSize` c132; FloatingParticle_Shader `_WorldSize` c128. Vòng V04 đoán hoán vị c126/c127 của nước và vòng trước suy "cb0[126] của hạt bọt = màu nước" — cả hai sai.
  - `m_CommonParameters` chỉ có tham số chung mọi biến thể; tham số riêng một biến thể (màu FoamColoured c126 của FloatingParticle) không có tên trong bản 1.5.3 (`m_Parameters` của subprogram rỗng, DXBC đã bỏ RDEF): suy từ tên công tắc + đo ảnh, ghi `[ĐỀ XUẤT]`.
  - Hạt `BoatTrailParticles` dùng `FoamParticle_Mat_0` (không phải `FoamParticle_Mat`), shader cùng thân. Hạt ở lớp Water (4): ForwardRenderer loại lớp 4 khỏi pass đục/trong suốt, vẽ qua RenderObjects `Water.asset` (ghi chiều sâu, Less) — xem `js/vfx.js foamMaterial`.
  - Mặt nước gốc là ô `WaterPlane_LOD0` 128 m lưới 2,67 m (LOD1 5,3 m), không phải 1 m như web.
