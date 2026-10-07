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

## Kích thước [ĐO TRONG REPO, 2026-10-07]

| Thư mục | MB |
|---|---|
| `art/world` | 20,3 |
| `art/items` + `art/ui` | 11,8 |
| `art/boat` | 4,3 |
| `audio` | 21,8 |
