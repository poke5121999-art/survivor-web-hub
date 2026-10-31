# Cá Vàng Trong Bể (fish-bowl)

Bản web của **Aquarium Land: My Fish Bowl 3D** 1.10 (`com.fgs.fish.life`), dựng lại bằng three.js + DOM từ asset gốc,
không dùng Unity WebGL (cùng cách làm với `games/casual-farm`). Plan: `brain/plans/fish-bowl.md`.

## Nguồn

`FL_REF` = `D:\fishlife-ref` (ngoài git):

- `Aquarium_Land_1.10_APKPure.xapk` tải từ `https://d.apkpure.com/b/XAPK/com.fgs.fish.life?version=latest`.
  curl trần bị 403; thêm UA Chrome + `Referer: https://apkpure.com/` thì được 200.
- `apk/` APK gốc giải nén, `lib/` APK `config.arm64_v8a` (libil2cpp.so).
- `data/` = `apk/assets/bin/Data` với các phần `.splitN` đã ghép (UnityPy nhận danh sách file, không ghép split).
- `il2cpp-dump/` Il2CppDumper (`C:\Users\tamph\tools\Il2CppDumper`), `DummyDll/` dùng cho type tree.
- `dump/<file>.json` mọi MonoBehaviour của level1-4 + sharedassets2/4 kèm đường dẫn GameObject (`D:\fishlife-ref\tools\dump_mb.py`).

## Tool (`tools/`)

Chạy từ `games/fish-bowl/tools`, `PYTHONIOENCODING=utf-8 py -3.12 <tool>`:

| Tool | Ra |
|---|---|
| `fl.py` | nạp UnityPy + type tree từ DummyDll |
| `export_scene.py level2 env`, `export_scene.py level4 player` | `art/<id>/geo.glb` + `scene.json`, `art/tex/` |
| `export_anim.py` | `art/anim/clips.json`, `controllers.json` |
| `export_timelines.py` | `data/timelines.json` |
| `export_ui.py` | `art/ui/layout.json` + `sprites/` |
| `export_audio.py` | `art/sfx/*.mp3` + `sfx.json` |
| `export_vcams.py` | `data/vcams.json` (62 camera ảo Cinemachine: follow/look, FOV, body/aim) |
| `export_components.py` | `data/components.json` (mọi MonoBehaviour gameplay, tham chiếu thành `@<đường dẫn>`, UnityEvent thành danh sách lời gọi) |
| `humanoid/bake_humanoid.sh` | `art/anim/humanoid.json` (13 clip Humanoid của Timmy nướng ra xương, cần Unity) |

## Humanoid (Timmy)

Clip người (Mixamo) lưu dạng muscle, three.js không đọc được. `tools/humanoid/bake_humanoid.sh` dựng project Unity tạm
`D:\fishlife-ref\bake` (Unity 6000.0.77f1 batchmode, ~2-3 GB, vài phút), chép Avatar + 13 clip từ project AssetRipper
`D:\fishlife-ref\ripped\ExportedProject`, dựng lại cây xương từ `art/env/scene.json`, rồi `HumanoidBake.cs` lấy mẫu từng
clip bằng PlayableGraph (applyRootMotion bật, root bắt đầu ở gốc toạ độ) 30 khung/giây.
- AssetRipper chạy headless: `AssetRipper.GUI.Free.exe --headless --port 47811`, rồi POST `/LoadFolder` (path=`D:\fishlife-ref\apk`,
  thư mục phải có cả `lib/arm64-v8a/libil2cpp.so`, nạp thư mục xapk thì "không tìm thấy asset") và POST `/Export/UnityProject`.
- AssetRipper đặt tên clip `Idle` thành `Idle_1.anim`; `baked_to_web.py` đổi lại.
- Chỉ Unity khi nướng; game trên web không dùng Unity.

## Đã đo

- Unity 2022.3.48f1, **gamma color space** (`m_ActiveColorSpace` 0), màn ngang. Renderer: không giải sRGB, không tone map.
- Lightmap Bakery mã hoá double-LDR: sáng = 2 x texel (gamma).
- 6 timeline: thoại ở `TextSwitcherClip`, đường bơi của cá cutscene là clip "Recorded" vô hạn (root position/rotation),
  thanh letterbox là clip scale `TopBar_Img`/`BottomBar_Img`. Mỗi cutscene có bản sao cá/Timmy riêng trong `TimelineAssets/`.
- Gốc `*****FISHENV*****` tắt sẵn trong scene; game bật khi scene Controller nạp xong (`js/stage.js`).

## Bẫy đã sập

- **Bộ nhớ:** `UnityPy.load(<cả thư mục Data>)` + đọc mọi MonoBehaviour giữ ~15,7 GB commit charge, làm phiên Claude
  khác trên máy hết bộ nhớ. `fl.load()` chỉ nạp `fl.FILES`.
- `AS.TriggerEvents` và `Cinemachine.CinemachineVirtualCamera` đọc bằng cây sinh từ DummyDll bị lệch (out of bounds).
  `AS.TriggerEvents` có lúc làm UnityPy crash native (access violation); `dump_safe.sh` chạy lại và bỏ qua object đó.
  Cách đã chữa: đọc byte thô (`export_components.trigger_events`, `export_vcams.head`), khớp đủ số byte.
- `export_ui.py` bỏ sprite rộng hơn `MAX_W`; game này có nền 1920x1080 và thẻ màn 1042x629, nên `MAX_W` = 2048.
- Heredoc bash nuốt `\n` trong mã Python dán vào (`newline="\n"` thành xuống dòng thật); sửa bằng Edit.

## Kiểm

- `node test/fish-bowl-gesture.js`: 5 hình vẽ màn 5 (cả vẽ ngược) đạt ngưỡng gốc, đường thẳng bị từ chối.
- `node test/fish-bowl-render.js`: ảnh phòng/bể qua các camera scene (`view.html`).
- `node test/fish-bowl-ui.js`: 5 màn UI ở 1280x720 và 2340x1080 (`ui.html`).
- `node test/fish-bowl-timeline.js "" "Intro:7,Jump Targets:20"`: chụp khung cutscene (`tl.html?tl=&t=`).
- `node test/fish-bowl-play.js <1-5>`: chơi trọn một màn qua đường input thật (màn 1 đi từ menu, bấm Skip cutscene trên
  HUD; màn 2-5 vào bằng `?level=N&skip=1`), kiểm LevelCompletePanel + save mở màn kế, chụp ảnh giữa nhiệm vụ. Mỗi lần
  chạy một màn (~40-110 s).

## Gameplay (`index.html`)

`js/main.js` luồng màn hình + `window.__fb` · `js/game.js` chạy một Activity · `js/events.js` bảng "Type.Method" cho
UnityEvent · `js/components.js` + `js/tasks/*.js` MonoBehaviour theo tên gốc · `js/triggers.js` AS.TriggerEvents ·
`js/tween3d.js` DOTween 3D · `js/fish.js` cá + camera CM vcam1 · `js/hudnav.js` mũi chỉ đường · `js/input.js` phím + HUD.

Bẫy đã gặp:
- `*****FISHENV*****/Plane` (sàn) là MeshCollider không có mesh: đáp đất khi giãy (màn 4) phải raycast mesh nhìn thấy.
- Mũi tên mục tiêu (màn 3-4) đứng lệch khỏi mục tiêu ~1,4 đơn vị; "chỉ xuống hộp" phải xét vị trí mục tiêu, không phải
  vị trí mũi tên.
- Cutscene dùng bản cá riêng trong `TimelineAssets`; Player bị ẩn trong lúc chạy timeline.
- Chỉ `arrow_current_Mat` (xanh) có trong export; màu mũi tên lúc chưa canh trúng là màu đoán.
