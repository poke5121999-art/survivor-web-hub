# Cá Vàng Trong Bể (Aquarium Land: My Fish Bowl 3D) làm lại bằng three.js

Chủ dự án giao 2026-10-31: tải `com.fgs.fish.life` từ apkpure rồi "đưa game này lên web như my mini market"
(tức làm lại bằng JS thuần + three.js từ asset gốc, không Unity WebGL; xem `plans/my-mini-mart-web.md`).

## Chỗ để đồ

- Nguồn: `D:\fishlife-ref` (xapk 1.10, 88 MB; `apk/` bóc, `lib/` libil2cpp, `il2cpp-dump/` Il2CppDumper,
  `dump/<file>.json` mọi MonoBehaviour của level1-4 + sharedassets2/4, `survey/` tên asset + cây scene).
- Game: `games/fish-bowl/` (id hub `fish-bowl`). Tool bóc: `games/fish-bowl/tools/` (`fl.py` nạp dữ liệu).
- Không tìm ra clip YouTube đúng game (tên "Aquarium Land" trùng game nuôi cá khác của Supersonic); luồng chơi lấy từ
  dữ liệu scene + timeline.

## Sự thật đã đo

- Unity 2022.3.48f1, IL2CPP arm64, metadata v31, URP, ánh sáng nướng bằng Bakery (`ftLightmapsStorage`).
- 5 scene: level0 splash, level1 menu chính, level2 = môi trường + 5 màn (`ActivityManager/Activities/Level 1..5`),
  level3 chọn màn (5 nút), level4 = player cá + camera Cinemachine + UI ControlFreak2 (nạp cộng với level2).
- **Bẫy bộ nhớ:** `UnityPy.load(<cả thư mục Data>)` + TypeTreeGenerator giữ ~15,7 GB commit, làm phiên khác hết bộ
  nhớ. Tool chỉ được nạp đúng các file cần (level2, level4, sharedassets*, globalgamemanagers.assets).
- `AS.TriggerEvents` và `CinemachineVirtualCamera` đọc bằng cây sinh bị lệch (out of bounds); cần đọc tay.
- 6 timeline (sharedassets2): Intro 44 s (Timmy đi xa, "2 DAYS LATER"), FoodDispensing 20,5 s, FoodEating 5 s,
  JumpTargets 45,6 s, GlassDropped 3,5 s, FemaleFishIntro 37,5 s. Thoại nằm trong `TextSwitcherClip.template.text`.
- Clip người (Timmy) là Humanoid (Mixamo: Kneeling Down, TTB_talk, M_wave...) — cần nướng muscle → xương
  (Unity Editor batchmode, không cần script game). Clip cá (SWIM, IDLE, SWIM FAST, ACTION FOR SWIM, DOWN, LEFT,
  FlopIdle, FlopJump) là generic.

## Năm màn (từ `dump/level2.json`)

1. Intro → "Find the source of pollution" → `CleanMoss`: ngậm kéo cục rêu khỏi máy bơm (thanh 0..100), thả vào
   vùng chỉ định; Task 2 nhặt 3 cục rêu còn lại thả lên trên. Bể đục (DirtyAquariumPP + sương) sạch dần.
2. FoodDispensing → "Look for the dispensed fish food and eat it" → `FeedFish` (hunger +50 mỗi viên, đủ 100).
3. JumpTargets → "Jump when arrow is pointing downwards" → `FishGetsFood` 8 đích, nhảy theo quỹ đạo.
4. GlassDropped → `FishGetsFood` 7 đích về bể, rồi `FloppingFish` giãy theo 11 điểm đường về bể trước khi hết HP
   (hpDecreaseRate 0,3).
5. FemaleFishIntro → `PerformGestureTask`: vẽ 5 hình (Circle 0,6; Heart, Bolt, Loop, Triangle 0,8) để cá cái thích.

## Pha

1. **Dữ liệu** (chặn mọi thứ): `export_scene.py` (mesh, vật liệu, lightmap, cây node level2+level4 → geo.glb +
   scene.json), `export_anim.py` (clip cá generic), `export_timelines.py` (track, clip, binding đã giải), UI sprite,
   font, tiếng. Humanoid nướng qua Unity sau.
2. **Chạy được**: dựng phòng + bể, cá bơi (joystick/WASD, lên/xuống), camera theo.
3. **Cutscene**: trình phát timeline JSON + Cinemachine thu nhỏ (vcam tĩnh/LookAt/Follow, blend theo chồng shot).
4. **Năm màn** theo bảng trên + gợi ý, mũi tên chỉ đường (HUDNavigation), hoàn thành màn.
5. **Menu**: splash, menu chính, chọn màn, cài đặt, lưu tiến độ; thẻ hub; kiểm trên Pages.

Không làm: quảng cáo, IAP, thông báo, đánh giá app.
