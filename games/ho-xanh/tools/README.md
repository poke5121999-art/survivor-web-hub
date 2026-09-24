# Bóc asset Dave the Diver cho Hố Xanh

Mọi ảnh, anim, VFX, tiếng và bản đồ của game này rút thẳng từ bản cài Steam của
Dave the Diver (Mintrocket). Hai công cụ, chạy lại bao nhiêu lần cũng ra cùng kết quả:

    set PYTHONIOENCODING=utf-8
    python games/ho-xanh/tools/rip.py     # art/{dave,fish,env,fx,ui,props}, audio/, data/assets.js
    python games/ho-xanh/tools/level.py   # art/level/Axx.glb, data/levels.js

`rip.py` phải chạy trước. Lần đầu nó quét hết bundle (~4 phút) rồi đệm bảng tra ở
`%TEMP%/ho-xanh-rip/bundle_index.json`. Cần Python 3.8 + UnityPy 1.25 + numpy + Pillow,
`ffmpeg` trong PATH, và `node`/`npx` (gltfpack, spine-info.js).

Gỡ nhanh nếu bị yêu cầu: xoá `art/`, `audio/` và hai tệp `data/assets.js`, `data/levels.js`.

## Game gốc đóng gói thế nào [ĐO TRONG REPO, 2026-09-24]

- Đường dẫn: `D:\Steam\steamapps\common\Dave the Diver\DaveTheDiver_Data`. Đổi bằng biến `DTD_DATA`.
- 3.967 bundle Addressables tên băm ở `StreamingAssets/aa/StandaloneWindows64`, **không mã hoá**.
  - Tên asset gốc nằm trong `m_Container` của object `AssetBundle` mỗi bundle.
  - `catalog.json` có tên nhưng khó tra ngược ra bundle.
- Nhiều asset trỏ sang CAB của bundle khác (sprite trong SpriteAtlas, mesh, material).
  - `FileNotFoundError: cab-…` nghĩa là thiếu bundle phụ thuộc.
  - Bảng tra `cab` trong tệp đệm cho biết cần nạp thêm bundle nào (`with_deps` / `load_with_deps`).
- **Sáu prefab `Map_A01..A06` nằm chung MỘT bundle.** Lấy cả tệp thì mỗi map ra y hệt nhau.
  - Phải đi từ GameObject gốc của prefab xuống cây con (`prefab_objects`).
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

### Bản đồ
- Hố Xanh vùng nông là 2.5D. Vách và đá là mesh 3D, Dave, cá và rong là phẳng.
- Một map gồm prefab vách `Map_Axx`, bãi đá `3dRock_Axx` (và `Map_TB_…` với A01, A03), cộng scene `A_Scenes/Axx_*.unity`.
- Trong scene:
  - Va chạm là các `PolygonCollider2D` tên `MapCollderObj(Clone)`.
  - Điểm xuống nước là `PlayerSpawnPoint` (chỉ A01, A04 có).
  - Rương oxy là MonoBehaviour `SpawnerChestO2`.
- Mesh ra ~18 MB mỗi map, gần như toàn hình học. `gltfpack -cc` nén còn ~1 MB.
  - three.js cần `MeshoptDecoder` để đọc.
- Camera gốc là Perspective, fov 38°.

### Tiếng
- AudioClip FSB5 trong bundle, `UnityPy` giải được thành WAV rồi `ffmpeg` ra mp3.
- Thư mục `StreamingAssets/SyncHashed` chỉ chứa một phần.
  - Tên tệp = sha256 của tên clip, khớp 624/1.547 tệp.
  - Không cần dùng thư mục này.

## Bẫy khi chạy trên máy này
- `python -c "…"` nhiều dòng hỏng vì `python` là shim `.bat`, và tham số có `|` bị cmd cắt. Ghi script ra tệp.
- `rip.py art` chỉ xoá thư mục con của nó. `art/level` thuộc `level.py`.
