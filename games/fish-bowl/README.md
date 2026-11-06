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
| `il2cpp_a64.py <Lớp>[.<Hàm>]`, `--fields`, `--find` | dịch ngược hàm arm64 trong `libil2cpp.so` (capstone), chú thích tên hàm gọi, chuỗi/TypeInfo, hằng float và `this.<trường>`; đọc luật thật thay vì đoán |

Bẫy của `il2cpp_a64.py`: ô metadata trong `.data.rel.ro` trên đĩa là số 0, giá trị nằm trong bảng relocation
`R_AARCH64_RELATIVE` (đọc `DT_RELA`); lớp có namespace phải gõ đủ (`AS.UIManager`).

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

- `node test/fish-bowl-gesture.js`: 5 hình vẽ màn 5 (đúng, ẩu, ngược, đổi điểm xuất phát, nhỏ lệch) đạt ngưỡng gốc; đường thẳng, nguệch ngoạc, zigzag bị từ chối.
- `node test/fish-bowl-render.js`: ảnh phòng/bể qua các camera scene (`view.html`).
- `node test/fish-bowl-ui.js`: 5 màn UI ở 1280x720 và 2340x1080 (`ui.html`).
- `node test/fish-bowl-timeline.js "" "Intro:7,Jump Targets:20"`: chụp khung cutscene (`tl.html?tl=&t=`).
- `node test/fish-bowl-play.js <1..5>`: tự chơi một màn tới bảng hoàn thành; `FB_URL=<Pages index.html>` chạy trên bản đã đẩy.
- Đổi mã: `node games/fish-bowl/tools/stamp.js <rev>` rồi sửa `rev:` của `fish-bowl` trong `data/games.js`.
- `[BẪY ĐÃ SẬP]` Lightmap không có ảnh thì bề mặt nướng sáng ra đen; trên Pages 5 lightmap về chậm vài giây nên phòng
  đen kịt lúc vào màn. Lightmap giờ cũng có bản 16 px, và splash chờ `stage.lightmapsReady`.
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

## Luật gốc đọc từ mã: bơi và camera

Nguồn: `AS.ControllerInputManager` (Update/PhysicsHandler), `AS.CharacterController` (Move, ApplyExtraTurnRotation, Leaning,
OnAnimatorMove, FlyingGroundChecker, UpdateAnimator), `AS.CameraManager.CameraInputCheck`. `FishController`, `AS.CharacterAbility`,
`AS.ASWater`, `CameraTargetSetPlayer` là cái vỏ/không dùng cho cá người chơi; `LookAtPlayer` chỉ `LookAt(player)`.
- Gậy: `m_Move = v * camForward(phẳng, chuẩn hoá) + h * camRight`; **nút Run là nút bật/tắt** (`GetButtonDown`), chưa bật thì `m_Move *= 0.5`. Cũ: giữ Shift = 1, thả = 0,6.
- `Move`: cắt |move| về 1; vào hệ toạ độ cá: `forwardAmount = local.z`, `turnAmount = atan2(local.x, local.z)` (rad). Lùi gậy ra sau thì `forwardAmount` âm: cá quay 180 độ và bơi lùi trong lúc quay.
- Quay: `Rotate(0, turnAmount * lerp(180, 120, clamp01(forwardAmount)) * dt)` độ (turn là rad nên mũi tiến sát đích kiểu mũ, ~π/s đứng yên, ~2,1/s đang bơi). Cũ: bám theo vận tốc, tốc độ quay gấp đôi tự chế.
- Vận tốc (`OnAnimatorMove`): `speed(5) * (forward * forwardAmount + up * FlyUp)`, gán thẳng, **không quán tính**. Cũ: lerp damp 4 về 0,6 x tốc độ. Tốc độ lên/xuống = 5 x FlyUp (cũ 0,7 x tốc độ ngang).
- `FlyUp` (SwimUp/SwimDown giữ): `FlyUp += (đích - FlyUp) * min(2dt, 1)`, đích +1 / -1 / 0. Cũ: nhảy bậc 0/1.
- Nổi: `FlyingGroundChecker` mỗi bước vật lý nâng transform 0,5 đơn vị/s (cá đứng yên sẽ trôi lên mặt nước). Raycast xuống 2 x 0,12 từ gốc Player: chạm sàn thì Rigidbody đóng băng Y (vận tốc đứng bị bỏ, chỉ còn trôi 0,5/s). Mặt nạ sàn = layer Default (SUY RA là cát).
- Nghiêng (`Leaning`): mô hình slerp tốc độ 5 về góc `10 độ * FlyUp` (mũi hếch lên khi bơi lên). Cũ: pitch theo vận tốc, giới hạn 0,6 rad.
- Animator: `AnimationSpeed`=1, `Walk` = forwardAmount làm mượt 0,1 s, `Turn` = turnAmount; trạng thái Grounded là blend 1D IDLE(0) / SWIM(0,5) / SWIM FAST(1) theo `Walk` (Turn không đổi gì vì mọi điểm có x=0). Nghĩa là chưa bật Run thì stick đầy = SWIM, bật Run mới ra SWIM FAST. Cũ: chọn clip theo ngưỡng vận tốc, tốc độ phát 0,6 + v/5. Hệ số làm mượt 10/s là SUY RA.
- Camera tay (`CameraInputCheck`): quay mỗi khung theo trục chuột x `m_TurnSpeed`=1,5 độ, độ nghiêng kẹp 340..40 độ tức -20..+40 (cũ -52..+63). `m_TurnSmoothing`=0. Độ nhạy px của ta (0,006 rad/px) vẫn là đoán.
- vcam1 Transposer: damping X/Y/Z = 1 s tức 99% trong 1 s (~4,6/s; cũ 6/s). Composer dead/soft zone (rộng 0,15/0,25, damping 0,1/0,5) chưa dựng.
- `CameraFocus` (cảnh tập trung của nhiệm vụ): chuỗi `WaitForSeconds` -> bật vcam focus -> `BlendModeChange` -> `UIManager.Focus` -> `GameManager.SetControlls`, blend mặc định 2 s; thuộc game.js, chưa đọc kỹ.
- CHƯA TÌM RA: ai gọi `ControllerInputManager.FlyState(true)` (không có lời gọi nào trong libil2cpp lẫn dump cảnh). Coi cá luôn ở chế độ bay khi bơi trong bể (SUY RA).

## Luật gốc đọc từ mã: hạt

Đọc từ dữ liệu xuất của 102 ParticleSystem gốc (`tools/export_particles.py`, chạy bằng `py -3.12`), không phải từ il2cpp. Bật thật trong gốc: Trail 24 (đều là StarVortex đỏ/xanh), Inherit Velocity 49, Collision 8 (FogHeavyGrey x5, Stripes của Great, CloudCircle x3), Velocity 1. Sub-emitter, Noise, Force, Lights, Custom data, SizeBySpeed: không hệ nào bật (Noise/Force vẫn chạy nếu có).
- Trail (`def.trail`): chế độ PerParticle, 40 % hạt có vệt (`ratio` 0,4, bốc ngẫu nhiên lúc sinh), đời vệt 0,5 đời hạt, thêm đỉnh mỗi 0,2 m (`minVertexDistance`), toạ độ thế giới, chết cùng hạt, bề rộng 0,7 m không nhân kích thước hạt, màu = màu hạt x gradient đời hạt x gradient dọc vệt (trắng -> alpha 0), chất liệu `glow1_ADD` (vật liệu thứ hai của renderer). Cũ: bỏ qua hết, StarVortex chỉ có chấm sao. Vệt là dải quay mặt về camera dựng trong vertex shader, mỗi hạt giữ tối đa 96 điểm (vòng tròn), có đỉnh đầu bám sát hạt. SUY RA: màu/bề rộng dọc vệt tính theo tuổi điểm / đời vệt (Unity có thể tính theo chiều dài); `textureMode` 0 (Stretch) kéo theo độ dài tích luỹ, 1-3 chỉ làm gần đúng; `dieWithParticles=false` và `ribbonCount>1` chưa làm vì không hệ nào dùng.
- Collision (`def.col`, type World): bật lại sau cú nảy: phần pháp tuyến đảo và nhân `bounce` (0,1 cho sương, 1,0 cho Stripes/CloudCircle), nhân `1 - dampen` (0), trừ `lifetimeLoss x đời` (0), diệt hạt khi tốc độ ngoài [minKillSpeed, maxKillSpeed], bán kính = kích thước/2 x `radiusScale` (0,01). Gốc va với mọi collider của cảnh; trang này không có collider nên là XẤP XỈ: `fx.planes = [[nx, ny, nz, d]]` (phía giữ hạt n.p >= d), `autoAttach` đặt một mặt phẳng ở mặt trên `AquariumSand`. Hiệu ứng spawn (CloudCircle ở cú đáp) cần game.js đặt `fx.planes` theo sàn thật nếu muốn nảy. Cũ: không va chạm.
- Inherit Velocity (`def.inherit`): chế độ Initial cộng vận tốc của emitter (đo giữa hai khung) x hệ số vào vận tốc đầu, chế độ Current cộng mỗi khung; chỉ tác dụng khi hệ mô phỏng ở không gian thế giới (như Unity), tức chỉ `Player/Fx/waterSplashBack` (hệ số 0,2); 48 hệ còn lại ở không gian cục bộ nên không đổi. Cũ: bỏ qua.
- Bẫy: `m_MaxParticleSize` 0,5 (kẹp cỡ hạt theo màn hình) của renderer chưa dựng; `useUnscaledTime` (25 hệ) chưa dựng.

## Luật gốc đọc từ mã: màn 1-2

Đọc từ `CleanMoss`, `CountCollectedItems`, `DestroyFood`, `FeedFish` và các coroutine của nó (`il2cpp_a64.py`) cộng số trong `data/components.json`.
- Kéo rong: mỗi lần bấm nút `Slider += mossSliderFillAmnt (1000) * Time.deltaTime` của khung đó (thành ~16,7 ở 60 fps, phụ thuộc fps như bản gốc); `Update` trừ `mossSliderDecreaseAmnt (1) * deltaTime`, tức 1/giây. Cũ: trừ 60/giây (nhầm "không nhân deltaTime"). Hàm `FillMossSliderValue`, `DecreaseMossSliderValue`.
- Rong chỉ tụt khi nút đang hiện và chưa đầy (`stopSlider`); đầy (>= 100) thì `stopSlider`+`cleanAquarium`, `popSfx` phát một lần lúc đầy (cũ: phát mỗi lần bấm), rồi `onMaxSliderValueEvent`. Mỗi lần bấm còn rung camera 0,5 (CameraShake) và đặt Animator `Pull`=true, `Animator.speed` đuổi về 1,25 khi bấm và về 0 theo 1/giây khi nghỉ (đã dựng speed trong script, chưa áp lên rig cá: SUY RA hình rung dừng khi speed < 0,05).
- Làm sạch bể: `DirtyAquariumPP.weight -= aquariumCleaningRate (0,1) * deltaTime`, hết thì tắt Volume và `StopFogParticles` (startLifetime 1, Stop). Khớp bản cũ.
- Thả bóng rong thứ nhất: `CleanMoss.UnparentChildOfMouth` đặt `taskComplete` ở lúc thả (cũ: ở lúc thanh đầy), rồi gọi `task2.TaskCheck`.
- `CountCollectedItems`: chỉ đếm khi miệng có bóng (`childCount != 0`); `CheckMaxCollectedItems` so `collected >= maxItemsCount` mà `maxItemsCount` = 0 trong cảnh, nên lần thả đầu của Task 2 đã đủ, `TaskCheck` thấy cả hai task xong và gọi `CurrentActivityComplete`. Màn 1 xong sau 2 quả (1 ở Task 1, 1 ở Task 2), không phải 4. Cũ: đoán 3 quả ở Task 2. Quả (2), (3) và DropTrigger (1), (2) không bao giờ tới.
- `DestroyFood` chỉ `Destroy` vật mang tag `FishFood` khi chạm trigger ngoài bể.
- Máy cho ăn: `Update` xoay máy `localRotation` yaw 0 khi vị trí xe < 1,1 và 180 độ khi trên; xe dừng dần (`speed += (0-speed)*min(dt,1)`) khi `foodDispensed` (chỉ đặt lúc thanh no). Cũ: máy không quay.
- `DispensingFood(2)`: tắt `foodNeeded`, `DORestartById("rotate")` lên ống, chờ 2 s, `openLid` + `DropFishFood` (tiếng `dispenseSfx` ngẫu nhiên phát lúc thả), chờ 2 s, `closeLid`. Cũ: tiếng phát lúc bắt đầu, lid đóng sau 1 s. Thả đầu tiên ở giây 2 (đoán đúng).
- `DispenseAgain(foodDestroyTime = 20)`: bật lại `foodNeeded` sau 20 s kể từ lúc thả, bất kể đã ăn hay chưa, tức mỗi 22 s một nhúm; `Destroy(food, 20)` cùng con số (Start chép `foodDestroyTime` vào static `foodDestroyTimeMain`). Cũ: NEXT_DROP 1,5 s sau khi ăn/mất, đồ thừa dọn xong là thả ngay.
- `IncrementHunger` (trigger vào thức ăn): `HungerSlider += hungerFillValue (50)` (thanh 100 nên 2 nhúm), tắt thức ăn, `HandleCrunch(food, 1)` (hạt nghiền ở vị trí thức ăn, cách nhau 1 s), `foodDestroyTime -= 2` (vô tác dụng vì coroutine gán lại 20), rồi `EatTimeline.Play()` ngay. Cũ: chờ 0,4 s, hạt ở miệng, one-shot 'ACTION FOR SWIM'.
- `CheckHungerBarLevel` (cuối timeline ăn, một lần): đủ max thì `foodDispensed`, `onHungerMaxEvent`, `CurrentActivityComplete(2.0)` (hoàn thành sau 2 s). Chưa đủ thì không làm gì (chờ nhúm sau). Cũ: hoàn thành tức thì, đặt NEXT_DROP.
- SUY RA, chưa đọc được: `BITE_RANGE` 1,0 và `SINK_SPEED` 0,6 (Rigidbody và collider của prefab FoodContainer2 không có trong dump), `eatSfx` phát lúc cắn (không thấy chỗ nào gọi trong FeedFish), số prefab thả mỗi lần = 1.

## Luật gốc đọc từ mã: màn 5 (vẽ hình)

- `Recognizer.Recognize` (asset Gesture Recognizer, Detail = 100): mỗi đường (nét vẽ và mẫu) qua `NormalizeClosedLines` (đường kín thêm một điểm cách điểm cuối 99% quãng về điểm đầu), `NormalizeScale` (khung vuông cạnh = cạnh dài của hộp bao, giữ tỉ lệ, đưa về 0..1), `NormalizeDistribution` (101 điểm cách đều theo độ dài). Thay cho: resample 100 điểm + khoảng cách gần nhất hai chiều, `SPREAD 0,2`.
- `CalcScore` -> `Score.get_score`: ba tổng cộng dồn trên 101 điểm: vị trí = Σ khoảng cách/√2; độ cong = Σ|hiệu độ cong|/360 (cong = góc rẽ giữa hai dây dài 10 điểm, -180..180, 10 điểm hai đầu bằng 0); góc = Σ|hiệu hướng dây ±10 điểm, gói về ±180|/360. Điểm = (4·T(vị trí) + T(cong) + T(góc))/6, với T(v) = 1 - v/50 kẹp 0..1. `useLinesDirections = 0` nên thử mẫu xuôi lẫn ngược lấy điểm cao hơn; mẫu kín (`CalcCircularListScore`) thử đủ 101 điểm xuất phát. Mẫu kín có closedLine=1 (Circle, heart, Triangle), nét người vẽ luôn hở.
- Hệ quả đo được: thang rất rộng. Hình vẽ đúng ~0,95; đường thẳng ~0,52 trên mọi mẫu; nguệch ngoạc ngẫu nhiên 0,3-0,45; tròn vẽ thành tim được 0,87 (qua 0,8), tim, tam giác, loop vẽ ra đều qua ngưỡng Circle 0,6; nét thẳng đứng đạt bolt 0,85. `test/fish-bowl-gesture.js` ghi các cặp này (INFO), không coi là lỗi.
- `DrawDetector.OnEndDragCoroutine`: so `Score.get_score >= scoreToAccept` của RecognizedEvents (Circle 0,6, còn lại 0,8; `AssignNewRecognizerToDraw` gán recognizer, scoreToAccept, min/maxLines = 1 của hình hiện tại). Mỗi Recognizer chỉ có đúng một pattern, nên chỉ chấm hình đang yêu cầu. Thay cho: cùng ngưỡng, giữ nguyên.
- `DrawDetector.OnBeginDrag/OnDrag/OnEndDrag`: không có luật tối thiểu số điểm; `OnDrag` bỏ điểm không dịch (bình phương khoảng cách < 1e-10), `OnEndDrag` luôn thêm điểm nhả chuột. Nét bắt đầu ở `OnBeginDrag`, chạm không kéo thì không làm gì (ngưỡng kéo 10 px là mặc định của EventSystem, SUY RA). Đang ở `maxLines` (1) thì nét cũ bị bỏ khi nét mới bắt đầu (`RemoveOld`).
- Vẽ hỏng: không có đoạn xoá nào (`clearNotRecognizedLines` không được dùng ở nhánh hỏng), nét giữ nguyên trên màn đến nét kế tiếp; hiện dòng "Wrong gesture drawn.\nDraw Again!". Thay cho: tự xoá nét sau 0,4 s.
- `PerformGestureTask.RecognizedCountIncrement`: đếm +1, `PlaySpecificAnim` (`Player.CrossFadeInFixedTime(AnimToPlay, 0,1)`), một hạt Great/Nice/Perfect ngẫu nhiên, `ClearDrawnLines(1)` (đợi 1 s rồi `DrawDetector.ClearLines`), `CheckMaxRecognized`, rồi `ReAssignRecognizer` NGAY (thẻ cũ chạy tween `move`, thẻ kế hiện, không chặn nhập). Thay cho: khoá vẽ 2,6 s (`NEXT_DELAY`) và xoá nét sau 0,6 s.
- `CheckMaxRecognized` (đếm >= `maxRecognizedCount`, `Start` gán bằng số RecognizedEvents = 5): `ClearDrawnLines(2)`, `onMaxRecognizedEvent`, `ActivityManager.CurrentActivityComplete(5)` tức hoàn thành màn sau 5 s. Thay cho: 2,6 s.
- `PerformGestureTask.Update`: mỗi khung `Female Fish.LookAt(player)`. Thêm vào; trước đó cá cái đứng nguyên hướng.
- SUY RA, chưa đọc được: mã chỉ gọi animator của Player (`GameManager.Player`); cá cái cũng chơi clip Happy ở bản web là chỗ giữ lại từ lần đầu (không thấy ai gọi nó trong mã nhiệm vụ). Độ dày/màu nét vẽ của `UILineRenderer` ở DrawArea Free không có trong dữ liệu xuất; nét trắng dày 10 px giữ nguyên. Cảnh bật/tắt vcam theo bool `Gestures` của Player trong `Update` chưa đọc kỹ (game.js lo máy quay).

## Luật gốc đọc từ mã: luồng game và UI

Đọc bằng `tools/il2cpp_a64.py` (AS.UIManager + coroutine, AS.Activity, AS.ActivityManager, AS.GameManager, AS.Fading, AS.FadeCall,
AS.TimelineManager, AS.TimelineEvents, AS.TimelineController, HintManager + coroutine, PlayerHandler.Death, InstanceManager,
LevelSelectionManager, MainMenuManager, Splash, SplashBGMusic), giá trị từ `data/components.json` và `D:\fishlife-ref\dump\level1/3/4.json`
(level1 = MainMenu, level3 = LevelSelection). Âm lượng AudioSource đọc bằng UnityPy trên `level0` (splash).

- Splash: `Splash.DelaySplash` chờ `WaitForSeconds(10)` rồi mới nạp MainMenu. Bản web giữ splash ít nhất 10 s và đến khi đủ ảnh
  menu + chọn màn + font, KHÔNG cắt giờ; số % đếm tệp đã về (không vượt thời gian 10 s). Thay cho: chờ tối đa 15 s rồi vào menu
  dù thiếu ảnh. Lightmap và ảnh HUD tải tiếp sau menu; bấm Play lúc chúng chưa về thì hiện LoadingPanel của màn đó.
  `?level=N` (dev) không chờ 10 s nhưng chờ đủ lightmap + ảnh HUD.
- Nhạc nền: `SplashBGMusic` (DontDestroyOnLoad) phát một clip lặp từ splash qua mọi scene, AudioSource BGMusic `m_Volume` 0,4;
  không màn nào đổi clip. Thay cho: 0,25 trong màn.
- Thanh âm lượng menu: `MainMenuManager.Volume` -> `SplashBGMusic.VolumeSlider` = `AudioListener.volume` (pref "Volume", mặc định 1),
  tức âm lượng tổng. Giữ như cũ. Nút Mute/Unmute có trong scene nhưng tắt sẵn; không có rung.
- Đảo trục: toggle menu chỉ ghi pref "InvertControls" (mặc định 1, `MainMenuManager.Start` còn ghi lại theo `isOn`=1 mỗi lần vào
  menu), còn `GameManager.InvertControls` là hàm rỗng: bản gốc KHÔNG đảo camera. Web giữ toggle chạy được, mặc định tắt (camera
  như gốc). [quyết định, không chép]
- Menu lần đầu: `MainMenuManager.Start` bật `Tutorial` (lớp tối 78% + bàn tay chỉ Play) khi `TutorialComplete` != 1;
  `LevelSelectionManager.Start` cũng bật lớp `Tutorial` với nút Play riêng gọi `Levels(0)` (màn 1). `InstanceManager.Init` ghi
  `TutorialComplete = 1` khi một màn nạp. Tắt Tutorial thì `HandIndicator` tắt theo (EventTriggers OnDisable, GameObject 65).
  Thay cho: tutorial luôn tắt, bàn tay luôn hiện.
- Xu ở menu: `ShowTotalCoins` hiện số khi >= 1, không thì "0".
- Rate / More Games / Privacy: `AddsCalling.ShowRating`, `AddsCalling.MoreGames`, `Application.OpenURL(privacyPolicyLink)`; không
  gì khác đọc chúng. Vẫn ẩn.
- Chọn màn: `useScrollView` 0; thẻ hiện đầu tiên = pref "Activity" (màn bắt đầu gần nhất, 0-based), trái/phải quay vòng
  (`CheckLevelStatus`); Play `interactable = thẻ <= UnlockLevel`; thẻ khoá chỉ là Button ở trạng thái disabled
  (ColorTint `m_DisabledColor` 0,7843/0,7843/0,7843/0,502 lên ảnh thẻ), `LockImages` rỗng nên không có ổ khoá. Thẻ không có
  onClick. Thay cho: mở ở thẻ mở khoá cao nhất, vẽ ổ khoá + màn tối, bấm thẻ cũng vào màn.
- Lỗi gốc KHÔNG chép: `LevelSelectionManager.Start` gắn Play = `Levels(0)` cho tới khi bấm mũi tên (thẻ hiện màn 3 mà Play vào
  màn 1). Web luôn chơi thẻ đang hiện.
- Mở khoá: `ActivityManager.NexActivityUnlock` (OnComplete màn 1-4) tăng `UnlockLevel` khi `Activity == UnlockLevel`. Giống cũ.
- Vào màn: `AS.Fading.Init` (FadeOutOnLoad 1) = `DoFading(FromBlack, speed 1, wait 1)`: Fader đen, giữ 1 s, về trong 1 s
  (`FadingNumerator`, MoveTowards theo deltaTime*speed), chặn chạm HUD tới khi xong. `FadeCall.Fade` = `DoFading(Mode, Speed, wait)`
  (màn 2, 4 wait 2; màn 5 wait 1; cutscene cá cái wait 2). Thay cho: không fade lúc vào màn, FadeCall bỏ `wait`.
- HUD: `UIManager.Init` đặt alpha nhóm Controls = 0; `HudFader` mỗi khung MoveTowards alpha từng CanvasGroup (Controls,
  GameStatusBtns, TaskSpecificControls, HUD Navigation Canvas) về 0 khi cờ focus bật, 1 khi tắt, tốc 1/s; nhóm bị focus không nhận
  chạm. `TimelineEvents.OnEnable/OnDisable` -> `TimelineManager.isTimeLine` bật/tắt cả ba cờ. Thay cho: ẩn/hiện tức thì.
  `HUD_NAV_CANVAS_Opacity` bị HudFader đè ngay khung sau (cùng CanvasGroup).
- Gợi ý: `ChangeHintAndShow` (từ `ShowHintFromInstanceMngr`) gán chữ ngay (coroutine gõ chữ `TypeHint` có nhưng không ai gọi),
  hiện 5 s (WaitForSeconds, theo timeScale), nút Hint `interactable = false` trong lúc đó. Nút Hint (`ShowHint`): chữ đang có,
  rỗng thì "No Hint Available", 5 s + tween "close" (panel không có id đó) + 1 s = 6 s. Không tắt gợi ý khi cutscene bắt đầu
  (gợi ý màn 1 hiện đè cutscene mở đầu). Thay cho: 5 s cả hai, nút luôn bấm được, ẩn gợi ý khi vào cutscene.
- Âm UI: `UIManager.ClickSound` / complete / fail phát trên AudioSource của Manager, `m_Volume` 0,8. `ShowHint`, `SetSkipPanel`,
  nút skip cutscene và nút nhiệm vụ không có tiếng bấm. Thay cho: click âm lượng 1 ở mọi nút, nhạc thắng/thua 0,7.
- Tạm dừng: `UIManager.Pause` chỉ bật panel + `GameManager.gamePaused`, không đụng `Time.timeScale`; các nhiệm vụ tự dừng theo cờ.
  Thay cho: đóng băng cả game.
- Bỏ qua màn: nút Skip -> `SetSkipPanel(true)`: panel + `Time.timeScale = 0`; No -> timeScale 1; Yes -> `UIManager.Skip`:
  `levelSkipped`, `Activity.ActivityComplete()` với ĐỦ `Cash` (bản gốc xem quảng cáo thưởng trước; web miễn phí), timeScale vẫn 0
  tới khi pop-up đặt 0,5. Thay cho: thưởng 0 khi bỏ qua.
- Bỏ qua cutscene: `TimelineManager.SetSkip(true)`: panel, director speed 0 (chỉ cutscene dừng), ẩn nút skip; No: speed 1, hiện
  lại nút; Yes (`SkipCutscene`): speed 1, `director.time = duration - 0,1`, cutscene tự kết thúc (OnTimelineEnd) 0,1 s sau, nút
  skip không hiện lại. Thay cho: dừng cả game khi hỏi, Yes nhảy thẳng tới cuối.
- Hoàn thành: `ActivityComplete` -> `MissionComplete(Cash)` -> `ShowCompletePopUpPanel(3, Cash)`: pop-up + `inGameCompleteSfx`,
  `Time.timeScale = 0,5`, chờ 3 s thời gian thực; rồi tắt pop-up, bật LevelCompletePanel, chữ thưởng `"X" + Cash`, ghi xu,
  `lvlCompleteSound`, Focus(true) (HUD mờ dần) và `gamePaused`. OnComplete chạy ngay sau khi coroutine bắt đầu. Điều khiển và gợi ý
  để nguyên tới lúc đó. Thay cho: pop-up 1,6 s, chữ "100", ẩn HUD ngay.
- Lỗi gốc KHÔNG chép: `set_totalCoins(coins)` ghi đè TotalCoins bằng thưởng của màn vừa xong (không cộng dồn). Web cộng dồn.
- Chết: mọi nơi gọi `PlayerHandler.Death(2)`: vcam chết + "Death Global Volume" bật, `deathSfx`, chữ WASTED, Animator "Death"
  (clip JUMP, rồi `FlopJump 0` giữ khung cuối); 2 s sau tắt hết (máy quay về vcam trước đó) ->
  `CurrentActivityFailed` -> `MissionFailed`: LevelFailPanel, `lvlFailedSound`, Focus(true), `gamePaused`, rồi OnFailed.
  Thay cho: 2,5 s, FlopIdle lặp, máy quay kẹt ở vcam chết.
- Replay / Home: `RestartWithSceneDataHandler` nạp lại scene của "Activity" (cùng màn), `MainMenuHome` nạp MainMenu; mọi lần nạp
  đặt `Time.timeScale = 1` (`LoadingScene`). Web không có thời gian nạp scene nên không hiện panel Loading lúc này.
- Next: `UIManager.Next`: Activity + 1; nếu đã là màn cuối thì `Random.Range(0, count - 1)` tức một màn ngẫu nhiên trong 1-4.
  Thay cho: về màn chọn màn sau màn 5.
- Tiếng máy lọc: `InstanceManager.AquariumSound` mỗi khung: hệ bọt `spongefilter/BubbleRisingUnderwater` đang phát hạt mà tiếng
  chưa chạy thì Play (rồi lặp mãi). AudioSource 3D, `m_Volume` 0,5, rolloff log min 1 max 3,5 (gain = 1/khoảng cách tới camera,
  kẹp trong [1; 3,5]). Màn 1 (máy bơm tắc) im tới khi bọt chạy. Thay cho: rì rì 0,15 ở mọi màn từ đầu. Hệ bọt (playOnAwake tắt)
  được xoá khi vào màn, như scene nạp lại.
- Nút Play menu không có nhịp "pulse": chỉ tween scale-in và `Pop Fade Fx`. Bỏ nhịp tự thêm.
- SUY RA: `set_text` của TMP và các `Slider.set_value` là lời gọi ảo, đọc theo ngữ cảnh. Thứ tự lớp letterbox (TimelineUI) với
  HUD không đo; web vẽ letterbox trên HUD nên gợi ý màn 1 bị thanh dưới che một phần.
- Kiểm tải nguội: script Playwright tạm (CDP `emulateNetworkConditions` 2 Mbit/s, tắt cache) đo menu hiện sau 54 s, cả 34 ảnh menu +
  chọn màn và font đã về ở khung menu đầu tiên. `test/fish-bowl-play.js 1` giờ bấm Play của lớp Tutorial (save mới) và chờ Fader tan
  trước khi bấm skip.

## Luật gốc đọc từ mã: hình

Nguồn: chương trình GLES3 trong `tools/shaders/*.glsl` (thêm biến thể LIGHTMAP_ON bóc lại từ blob), property mặc định của
shader, Material (`m_ValidKeywords`), asset URP `globalgamemanagers.assets` 2282, VolumeProfile 637/650 và mã URP 14.0.11
(`ColorUtils.PrepareLiftGammaGain`, `LutBuilderLdr.shader`, `UberPost.shader`, `PostProcessPass.SetupLensDistortion`).
- Nước WaterwithWaves (Aqua bể cá, Bowl ly/chén màn 3-4, Soup): albedo = lerp(`_CameraOpaqueTexture` tại uv màn hình lệch theo
  normal map × `_RefractionAmount / độ sâu`, `_TintColor`, `_RefrectionOpacity`); rgb = ambient × albedo × 0,96 + `_EmissionColor` +
  `_DepthColor` × saturate((1 - |dz/_DepthOffset|) × `_DepthPower`); alpha = min(|dz/_Opacity|, 1), Blend SrcAlpha/OneMinusSrcAlpha,
  ZWrite On, Cull Off; Aqua nhấp nhô `_WaveHeight` 0,3 theo simplex noise XZ thế giới (`js/materials.js` waterMaterial). Thay đoán
  cũ: mặt phẳng cộng `_EmissionColor` × gợn sóng, không khúc xạ, không theo độ sâu.
- `_MianTex`, `_EmssionMap` không gán trên mọi vật liệu nước, mặc định "white"; `_Distortion` chỉ lệch uv của hai ảnh trắng đó nên
  không đổi hình. Bỏ: đèn chính (Directional Light là Baked, cha tắt) và phản chiếu probe (`m_ReflectionIntensity` 0 trong FishEnv).
- `_CameraOpaqueTexture` nửa độ phân giải, bilinear (`m_OpaqueDownsampling` 1); depth đủ độ phân giải. `js/post.js`: khi có mặt
  nước trong khung hình thì vẽ vật đục vào target MSAA (kèm DepthTexture), chép nửa cỡ, rồi vẽ vật trong suốt lên trên. Không có
  nước thì vẽ thẳng như cũ. Đo GPU RTX 3050, 1920x1080: ~1 ms → ~2 ms mỗi khung khi thấy bể (nhiễu vì máy chung).
- AquariumGlass là URP/Lit trong suốt (`_ALPHAPREMULTIPLY_ON`), không khúc xạ; các property `_Refraction*` trên nó là đồ thừa của
  shader cũ, URP/Lit không đọc.
- Rong (Trees, LIGHTMAP_ON): rgb = `_MainTex` × 0,96 × 2 × lightmap, không màu tô, không màu đỉnh. Texel lá trung bình
  (0,79; 0,83; 0,32) × lightmap (0,79; 0,75; 0,60) → (1; 1; 0,36) sau kẹp (URP `m_SupportsHDR` 0): vàng là đúng toán gốc, không sửa
  màu. Trees là Queue Transparent, ZWrite On, clip 0,1: giờ vẽ sau bản chụp opaque và sắp xếp chung với kính/nước (rong gần hơn tâm
  bể thì không bị kính phủ màu, như Unity sắp theo tâm bounds).
- Bề mặt nướng lightmap: albedo × 0,96 × (1 - `_Metallic`) × 2 × texel (lightmap `m_LightmapFormat` 1 = DoubleLDR). Thay ×2 thiếu 0,96.
- Lọc bọt biển (`<--- Essentials --->/spongefilter`, Cylinder.001, `saydam_albedo`): đen là đúng gốc. 80% đỉnh của uv0 gốc (đọc từ
  Mesh trong APK) rơi vào texel đen; Material không có `_EMISSION` nên `_EmissionColor` 0,14 không bật; không lightmap, không màu
  đỉnh. Trong bể AquariumPP nâng đen lên (0; 0; 0,34) nên ống lọc thành xanh đậm.
- AquariumPP / DirtyAquariumPP: gamma space + LDR grading = SRGBToLinear → saturate → × gain + lift → pow(gamma) → saturate →
  LinearToSRGB, với lift = GammaToLinear(v) × 0,15 − luminance, gamma/gain = GammaToLinear(v) × 0,8 − luminance + 1 (gamma nghịch
  đảo). Xám 0,5 ở màn bẩn ra (0,20; 0,57; 0,10): xanh lá đậm là đúng gốc. Thay công thức cũ (chia trung bình, ×0,1/×0,5 trên giá trị
  gamma) cho (0,45; 0,75; 0,21).
- Lens distortion: `DistScale` = 1/scale (1/1,2 = phóng to), không phải × scale như bản cũ.
- Chưa làm: RenderObjects "SeeThrough*" (layer 14, vẽ vật bị che bằng vật liệu khác) và "Player" (layer 9) của URP_Renderer;
  scene.json không ghi layer nên chưa biết vật nào. `m_AmbientProbe` của FishEnv có hướng (sáng từ dưới), khác màu flat ambient
  đang dùng; chưa rõ player dùng cái nào.

## Luật gốc đọc từ mã: màn 3-4

Nguồn: `FishGetsFood`, `ThrowSimulation` (+ coroutine `SimulateProjectile`, `DeathCheck`), `FloppingFish`, `PlayerHandler.Death`. Cài ở `js/tasks/jumps.js`, `js/tasks/flopping.js`. Dòng ghi "suy ra" là chưa đọc được từ mã.

- Nhảy (ThrowSimulation.Update): bấm phím nhảy là ném luôn, KHÔNG kiểm tra mũi tên xanh. Bản cũ chặn khi "target không nằm giữa 70% hộp" (GREEN_SHRINK 0,15); bỏ.
- Mũi tên xanh + chữ GO (FishGetsFood.Update): tia `Physics.Raycast(vị trí target đầu danh sách, Vector3.down, 2, propLayerMask)` trúng collider tag Prop thì xanh (nút nhảy cũng nháy tween `jumpNow`). Bản cũ dùng hộp bao của vật chứa; nay bắn tia thật vào mesh layer 14, kể cả `FISHENV/Water (For Arrow Check)` (tắt renderer, vẫn va chạm; target cuối màn 3 và target đầu màn 4 ở trên nó). Tô xanh nút nhảy (`UI[0x90].color`) chưa làm.
- Ném (SimulateProjectile): lúc bấm, target và mũi tên dừng và tắt renderer; chờ `throwDelay` 0,2 s; rồi bay tới đúng chỗ target đã đứng yên: v = sqrt(d / (sin 2a / g)), a = 45 độ, g = `FishGetsFood.gravityMultiplier` 9,8, thời gian bay = d / Vx, mỗi khung `Translate(0, (Vy - g t) dt, Vx dt)` theo hệ trục của cá (Euler từng khung, không dùng công thức đóng). Cá quay mặt về target một lần lúc cất cánh (có độ ngẩng) rồi giữ nguyên; bản cũ xoay theo vận tốc.
- Tới nơi (ThrowSimulation.TargetReached): tiếng bọt nước + hạt splash tại trigger, cá đặt tại (trigger.x, trigger.y - 0,2, trigger.z), target kế bật ngay. Không có LAND_PAUSE (bản cũ 0,35 s). Sau đó `lookAtTarget`: mỗi khung `Slerp(xoay, nhìn target kế, deltaTime)`; bản cũ `face()` tức thì.
- Ném lệch có chết không? Mã KHÔNG có nhánh "ném lệch thì chết". Chết duy nhất là `ThrowSimulation.Grounded` (SphereCast xuống 0,3 trúng layer 12 = `groundLayer`) -> `PlayerHandler.Death(2)`. Đo: cả 8 target màn 3 và 7 target màn 4 luôn cách mặt đất >= 0,58, trừ target cuối màn 3 (0,06 trên `wood_container_S`); trigger các target đó đổi layer `StylizedHouseB`/`wood_container_S`/vật chứa về 0 (`ChangeGameobjectLayer` = `GameObject.layer = 0`, không đệ quy) để khỏi chết. Hệ quả: ném lúc nào cũng tới target, mũi tên chỉ là gợi ý. Bản cũ rơi xuống bàn rồi chết (`miss()`); bỏ.
- `DisableDeathCheck(true)` chỉ ghi `ThrowSimulation.disableDeath` (0x81), không chỗ nào trong mã đã đọc dùng cờ đó. Giữ cờ, không dùng.
- Suy ra: collider "Water" layer 12 (`FISHENV/Water`) bị bỏ khỏi tập mặt đất: màn 4 bắt đầu với cá lơ lửng cách nó 0,14 mà không chết, nên coi là ao. Collider sàn phòng (`FISHENV/Plane`) không có mesh xuất ra; kiểm Grounded dùng mọi mesh layer 12 (StylizedHouseB là sàn thực tế).
- Chết (PlayerHandler.Death): bật deathVcam, Death Global Volume, tiếng `deathSfx`, chữ WASTED, Animator `Death` (CrossFade 0,1), chờ 2 s (đối số delay), tắt hết rồi `ActivityManager.CurrentActivityFailed`. `game.die()` hiện chờ 2,5 s và phát FlopIdle (ngoài file tôi sở hữu).
- Cá lăn (FloppingFish.Start): slider HP min 0, max `maxHP` 100, đặt đầy; `Rigidbody.useGravity = true`, isKinematic = false, applyRootMotion = false; tắt CharacterController + ControllerInputManager.
- HP (CalculateFishHP): `slider.value -= hpDecreaseRate * Time.deltaTime` (0,3/s, đầy 100 thì ~333 s), chữ `(floor(hp)/maxHP)`; chỉ chạy khi thanh HP đang hiện. `CheckDied`: giá trị <= minHP -> dead, `onDeadEvent`, `PlayerHandler.Death(2)`. Bản cũ nhân HP_RATE_SCALE 5 (1,5 HP/s, ~67 s) và làm tròn lên; bỏ.
- Xoay (Update, `lookAtPath` = 1, `lookAtTime` = 3): mỗi khung `rotation = Slerp(rotation, LookRotation(path trigger hiện tại - cá), deltaTime * 3)`, có độ ngẩng, cả khi trên không. Không có cần gạt nào xoay cá (chỉ khi lookAtPath = 0, FixedUpdate mới gán xoay = xoay camera): TURN_RATE 2,2 và LOOK_RATE 6 của bản cũ bỏ.
- Lăn (FixedUpdate, 0,02 s): `grounded = Grounded()` (SphereCast xuống `groundCheckHeight` 0,3 trên layer 12: cá cách sàn dưới 0,3 là lăn được). Khi grounded: `velocity = Lerp(velocity, 0, fixedDt * stoppingSpeed 6)` cả trục y (bản cũ exp(-6 h) và ép y = 0). Phím lăn: `AddRelativeForce(0, jumpSpeed 3, forwardForce 4, Impulse)`, khối lượng 1, theo hệ trục của cá nên CỘNG vào vận tốc và nghiêng theo độ ngẩng (bản cũ gán vận tốc ngang), kèm `PlayerHandler.PlayFlopParticle` = hạt `Player/CartoonyBodySlam` mỗi lần lăn. `FloppingFish.flopParticle`, `audioSource`, `flopSfx` mã không dùng.
- Bỏ vì mã không có: bụi `StepsManager.Dust` khi chạm sàn (FLOOR_BAND 0,5) và hạt slam khi chạm mạnh (HARD_LANDING 6). Suy ra: bụi có thể do animation event của clip; web chưa có.
- Tới hồ (AquariumReahed): bật lại CharacterController + ControllerInputManager rồi `ActivityManager.CurrentActivityComplete`. Hạt splash mặt nước và anim SWIM giữ lại (suy ra).
- Còn là mô phỏng của web, không phải PhysX: va chạm cá lăn dùng mesh phòng làm sàn và hộp `Colliders/Collider_Cube*`. Leo giá sách phụ thuộc nhịp khung hình; ngã xuống sàn thì kẹt (do cá ngẩng 50 độ nên lăn gần như thẳng đứng), bot test thỉnh thoảng kẹt vì vậy.

## Luật gốc đọc từ mã: phần nối (điều phối)

- Rung camera: `CleanMoss.FillMossSliderValue` gọi `CameraManager.CameraShake(0.5)` mỗi lần bấm kéo rêu →
  `CinemachineImpulseSource.GenerateImpulse(0.5)` trên `MainCamera/Camera/DefaultCameraShake` (legacy, NoiseSettings
  "6D Shake" của sharedassets4, sustain 0,2 s + decay 0,7 s). Web: `Game.cameraShake` cộng nhiễu sin lên camera sau bước
  follow. Nhiễu Perlin của các octave `Constant 0` được thay bằng sin (suy ra, không đọc).
- `CleanMoss.ShowMossBtn` đặt Rigidbody cá thành kinematic: cá đứng yên ở máy bơm khi nút kéo hiện (`Game.fishHeld`).
- Hậu kỳ chết: `Death Features/Death Global Volume` (VolumeProfile 104 sharedassets4) = ChromaticAberration 1 +
  ColorAdjustments saturation -100. `post.js` vẽ thêm volume toàn cục này.
- Màn 3-4: chữ nút nhảy (`UIManager.jumpText`) đổi sang `greenArrowColor` khi mũi tên chỉ xuống, trắng khi không
  (`FishGetsFood.Update`).
- Va chạm hạt với mặt cát chỉ tính khi hạt lún dưới mặt phẳng tối đa 0,25 m, để bụi ở sàn phòng (thấp hơn cát) không bị
  đẩy lên mặt cát.
