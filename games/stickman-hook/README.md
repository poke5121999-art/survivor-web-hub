# Stickman Hook (web)

Bản web của Stickman Hook (Madbox, Android 9.9.60), dựng lại bằng Canvas 2D, không engine.
Chế độ chơi chính đầy đủ: 64 màn dựng tay của bản gốc, từ màn 65 trở đi ghép ngẫu nhiên đúng như bản gốc, không giới hạn số màn.
Nạp khoảng 215 KB (bản gốc 848 MB).

- Hình, font, tiếng: bóc từ APK, không tự vẽ.
- Màn chơi: bóc từ prefab pattern của `NormalGamePlayConfig`.
- Luật chơi: đọc từ mã IL2CPP đã dịch ngược. Xem `docs/GAMEPLAY.md`, mỗi luật có địa chỉ lệnh ARM đi kèm.

Pha 1 của bản full (kế hoạch: `brain/plans/stickman-hook-full.md`) thêm phần tuỳ biến và vỏ meta, xem mục "Pha 1" bên dưới.
Pha tiếp theo thêm ba chế độ: Mechanical Grapple, Challenge, sự kiện Easter / Valentine's Day. Xem mục "Chế độ phụ".

Vòng quay, heo đất, xu miễn phí mỗi ngày và vé bỏ qua màn: xem mục "Vòng quay, heo đất, chợ, vé bỏ qua".
Lucky Drop (Pachinko) có engine riêng `js/pachinko.js`; luật, toạ độ bàn chơi và bẫy ở `docs/PACHINKO.md`.
Đua (Tournament): đua với ghost trên 21 map, bảng xếp hạng ngày chạy offline. Xem mục "Đua (Tournament)".
Phiêu lưu (Adventure): chạy vô tận trước tường lửa, 6 kỹ năng, đường kỷ lục, bảng tuần chạy offline. Xem mục "Phiêu lưu (Adventure)".

Thẻ bài (33 thẻ), booster, Chợ Đen và hiệu ứng thẻ ở mọi chế độ: xem mục "Thẻ bài, booster, Chợ Đen".

Quảng cáo có thưởng và mua bằng tiền thật (IAP): mọi nút hiện như bản gốc, bấm là nhận ngay. Xem mục "Quảng cáo có thưởng và IAP" (rev 20261028m).

## Cách chơi

- Giữ chuột, chạm màn hình, hoặc giữ Space: móc vào điểm móc gần nhất.
- Thả ra: bay đi.
- Qua vạch caro là xong màn.
- Rơi khỏi mép dưới hoặc mép trái camera khi không móc: chơi lại từ đầu màn.
- Trong màn chỉ có nút pause (góc trái trên) và thanh tiến độ "n ▬ n+1", như `DefaultInGameUI`.
  Pause mở `PauseUI`: chạm chỗ trống để chơi tiếp, nút nhà về trang chính. Hàng nút dưới (chọn màn, chơi lại, âm thanh, về hub) là của bản web.
  Phím Esc cũng mở/đóng pause.
- `?level=N` mở thẳng màn N, bỏ qua trang chính. Thêm `&mode=grapple` (hoặc `challenge`, `easter_event`, `valentine_day`) để mở màn của chế độ đó. `?mode=tournament` mở trang Đua. Phím `R` chơi lại. Tiến độ lưu trong `localStorage` (`stickman-hook`).
- Pause → nút nhà: trang chính, gồm xu, thanh XP (bấm để mở Đường XP), Chơi, Chế độ, Tuỳ biến.

## Tệp

| Tệp | Vai trò |
|---|---|
| `js/level.js` | Ghép màn từ pattern. Có bản port `System.Random` của .NET |
| `js/physics.js` | Thân tròn treo trên lò xo, va chạm capsule/polygon, trạng thái hoạt hình |
| `js/render.js` | Camera orthographic, vẽ sprite từ atlas, bóng, font bitmap |
| `js/main.js` | Vòng lặp, các pha `spawn → play → finish`, HUD (pause, thanh tiến độ, chữ về đích), chọn màn, đồ đang dùng, trang chính |
| `js/camera.js` | Camera ngang: ProCamera2D + ForwardFocus, dùng chung với bot của bài kiểm |
| `js/endgame.js` | Sau khi về đích: màn heo đất toàn màn hình rồi trang kết thúc (skin nhảy trên bục, nút Play). Nạp ở lần về đích đầu |
| `art/ui.webp`, `data/ui.json` | Art của trang kết thúc, heo đất và nút nhà của pause (`tools/build_ui.py`), nạp lười |
| `js/save.js` | Bản lưu v2: xu, XP, đồ đã có/đang dùng theo loại, mốc đã nhận của từng road, cờ, chế độ |
| `js/meta.js` | Kinh tế gốc: phát thưởng theo bảng loại tài nguyên, chữ mở khoá theo bảng cách mở, XP road, theme |
| `js/custom.js` | Nạp lười `custom.json`, sheet skin, `ropes.webp`, `custom-ui.webp` |
| `js/fx.js` | Nướng hiệu ứng của skin biến thể, kể cả phần động (nạp chỉ khi cần) |
| `js/trailfx.js`, `data/trailfx/<tên>.json`, `art/trailfx/<tên>.webp` | Hạt của trail (ParticleSystem của prefab trail), nạp khi trail đó được trang bị (`tools/build_trails.py`) |
| `js/menus.js` | Chế độ, Tuỳ biến, Đường XP (art gốc), vòng quay, Chợ (nạp khi mở lần đầu) |
| `js/cards.js` | Luật thẻ: cấp thẻ, cấp perk, mở booster (XXHash64 + `UnityEngine.Random`), Chợ Đen, cộng tài nguyên theo thẻ, phép thử của thẻ ở từng chế độ (không DOM) |
| `js/cardsui.js` | Trang thẻ, popup mở booster, gói thẻ và Chợ Đen trong Chợ, thông báo hiệu ứng thẻ (nạp lười) |
| `data/cards.json`, `art/m-cards.webp`, `art/m-boost.webp` | 33 thẻ, 7 nhóm, 7 booster, đơn giá Chợ Đen, `resource_boosting`, road perk, giá gói thẻ; art thẻ và booster |
| `js/home.js` | Trang chính theo prefab HomePage + MenuBar, art gốc; nạp khi trang chính hiện lần đầu, không bao giờ nạp với `?level=` |
| `js/uikit.js` | Bộ dựng menu dùng chung: sheet theo màn, sprite/9-slice/tile, đơn vị tham chiếu `--u` (1334 chiều cao), chữ font game trên canvas |
| `art/m-<màn>.webp`, `data/m-<màn>.json` | Art menu gốc theo màn: `home`, `modes`, `road`, `shop`, `tour` (`tools/build_menus.py`), nạp lười |
| `js/bonus.js` | Luật vòng quay, heo đất, xu mỗi ngày, bỏ qua màn; ô trang chính (cả cột ưu đãi VIP / No Ads), nút bỏ qua, `bonus.buy` (nạp lười) |
| `js/ads.js` | Luật quảng cáo có thưởng (`watch`, `adIcon`, `canSkip`, `vipSkip`) và Chợ (`Shop`: hiện, giá, mua) theo `data/ads.json`; không DOM |
| `data/ads.json`, `art/skip-ad.webp` | Ưu đãi Chợ, nội dung, giá, điều kiện, chữ và màu của thẻ (`tools/build_ads.py`); nút bỏ qua bản quảng cáo |
| `art/m-ads.webp`, `art/m-market.webp` | Nút quảng cáo / VIP dùng chung, widget ưu đãi trang chính; art thẻ Chợ (`tools/build_menus.py`, nạp lười) |
| `js/daily.js` | Mã ngày `yyyy-MM-dd`, giới hạn lượt mỗi ngày của chế độ (`GameModesService`), vòng một màn mỗi ngày của sự kiện; không DOM (nạp lười) |
| `js/modes.js` | Bảng chế độ: nguồn màn, lớp người chơi, chỗ lưu tiến độ, luật mở màn, thưởng cuối màn, road |
| `js/grapple.js` | Người chơi Mechanical Grapple (nạp khi mở chế độ) |
| `js/race.js` | Đua: trang bảng xếp hạng ngày, chọn đối thủ, ghost, đếm ngược, xếp hạng, thưởng (nạp khi mở chế độ) |
| `js/advrun.js` | Phiêu lưu: ghép đường theo seed tuần, `UnityEngine.Random`, kỹ năng, điểm móc/bumper/gió/cổng, tường lửa, điểm (không DOM) |
| `js/adventure.js` | Phiêu lưu: trang kỹ năng / đường kỷ lục / bảng tuần, vòng lặp, vẽ, màn kết thúc (nạp khi mở chế độ) |
| `data/mode-adventure.json`, `art/adventure.webp` | Cấu hình, kỹ năng, đường kỷ lục, 189 pattern của Phiêu lưu; sprite và texture hạt riêng |
| `data/race/<map>.json`, `art/race.webp` | Ghost của từng map (nạp khi đua map đó), vòng xuất phát và cúp |
| `data/levels.json` | 123 pattern (toạ độ thế giới) cùng danh sách màn |
| `data/mode-<file>.json` | `{v, sets: {modeId: {levels, random?}}, patterns}`: danh sách màn của chế độ và pattern chưa có trong `levels.json` (`grapple`, `challenge`, `seasonal`, `race`; `race` có thêm mục `race`) |
| `data/meta.json` | Bảng item, bộ sưu tập, độ hiếm, XP road, road màn Normal, chế độ, màu theme, trail/dây |
| `data/bonus.json` | Cấu hình vòng quay (pool, giá, `LuckyWheelSettings`), heo đất, ưu đãi Chợ, thẻ `skip_level`, toạ độ ảnh |
| `data/custom.json` | Khung của 95 skin, dây, trail, toạ độ icon shop |
| `art/skins/<tên>.webp` | Một sheet mỗi skin (7 trạng thái + điệu nhảy về đích) |
| `art/custom-ui.webp`, `art/ropes.webp`, `art/menu.webp` | Icon shop, texture dây, icon xu/XP/chế độ/booster/vé/vòng quay |
| `art/wheel.webp`, `art/piggy.webp`, `art/skip.webp` | Popup vòng quay, skin của heo đất, nút bỏ qua (ảnh gốc) |
| `data/font.json` | Bảng glyph của font Junegull |
| `art/atlas.webp` | Atlas sprite |
| `art/font.webp` | Font Junegull |
| `tools/build_data.py` | Tạo `levels.json`, `mode-*.json` và atlas, mọi chế độ qua cùng một `compile_pattern` |
| `tools/build_adventure.py` | Tạo `mode-adventure.json` và `adventure.webp` (pattern qua `build_data.compile_pattern(adv=True)`) |
| `tools/build_race.py` | Giải bản ghi ghost của Tournament, lấy mẫu lại 10 Hz → `data/race/*.json`; tạo `art/race.webp` |
| `tools/build_custom.py` | Tạo sheet skin, `ropes.webp`, `custom-ui.webp`, `custom.json` |
| `tools/build_cards.py` | Tạo `data/cards.json` từ remote settings mặc định |
| `tools/build_ads.py` | Tạo `data/ads.json` (ưu đãi, giá, điều kiện, chữ thẻ Chợ) và `art/skip-ad.webp` từ remote settings và bundle |
| `tools/build_meta.py` | Tạo `meta.json`, `bonus.json`, `menu.webp`, `wheel.webp`, `piggy.webp`, `skip.webp` từ remote settings mặc định và bundle trong APK |
| `tools/build_font.py` | Nướng font TMP SDF thành bitmap |
| `tools/build_ui.py` | Tạo `art/ui.webp` + `data/ui.json` từ `REF/sprites_ui` (xuất bằng `tools/extract/export_named.py`) |
| `tools/thumb.js` | Chụp ảnh thẻ hub |
| `tools/extract/` | Bóc dữ liệu từ APK, dịch ngược ARM |

## Dựng lại từ APK

Nguồn nằm ngoài git ở `D:\stickman-hook-ref`, gồm xapk, APK đã giải nén, `il2cpp/` (đầu ra Il2CppDumper), `dump/`, `sprites/`.

```sh
cd D:/stickman-hook-ref
py -3 -I tools/cabmap.py && py -3 -I tools/scripts_map.py
py -3 -I tools/extract_raw.py defaultlocalgroup_assets_stickmanhook_gamemodes_normalgameplayconfig_33940f3efbece7e4ff10381e9cdb258e.bundle dump/normal_raw.json
py -3 -I tools/extract_mode.py defaultlocalgroup_assets_stickmanhook_gamemodes_grapplegameplayconfig_c49590a553d4e81fcd7f9af8e5a01cfe.bundle dump/full/grapple_raw.json
py -3 -I tools/extract_mode.py defaultlocalgroup_assets_stickmanhook_gamemodes_challengegameplayconfig_1b394e114a8ba77953f7d300be6414b3.bundle dump/full/challenge_raw.json
py -3 -I tools/extract_mode.py defaultlocalgroup_assets_stickmanhook_gamemodes_seasonalgameplayconfig_1702fd10f76412a2f1a9044ba4e2b346.bundle dump/full/seasonal_raw.json
py -3 -I tools/extract_mode.py defaultlocalgroup_assets_stickmanhook_gamemodes_tournamentgameplayconfig_bee3ed665559a1033a70490b1ea1909d.bundle dump/full/tournament_raw.json
cd tools && py -3 -I export_sprites.py D:/stickman-hook-ref/sprites_race defaultlocalgroup_assets_stickmanhook_gamemodes_tournamentgameplayconfig_bee3ed665559a1033a70490b1ea1909d.bundle -- SpawnPointGhost SpawnPointPlayer
py -3 -I export_sprites.py D:/stickman-hook-ref/sprites_race defaultlocalgroup_assets_sprites_currencies_trophies_66fd9d60e2bcf44a91d4087abe890310.bundle -- Trophies && cd ..
py -3 -I tools/export_sprites.py D:/stickman-hook-ref/sprites <normal bundle> <generalservices gameplayconfig bundle> <skins_basic_animationcontroller bundle> -- --all-prefix AN_Grap1_Bumper A_ C_Wall D_Wall AAA_GE CHAR_Classic in_game GradientVertical UI
cd D:/survivor-web-hub/games/stickman-hook/tools && py -3 -I build_data.py && py -3 -I build_font.py
py -3 -I build_custom.py && py -3 -I build_meta.py   # build_meta đọc custom.json, nên chạy sau
py -3 -I build_race.py   # đọc levels.json và mode-race.json, nên chạy sau build_data
py -3 -I build_ui.py     # đọc REF/sprites_ui
```

Ghi chú:

- Các script trong `tools/extract/` đọc từ `D:/stickman-hook-ref/tools/`, nên chép chúng về đó trước khi chạy.
- Dịch ngược một method: `py -3 -I tools/arm_method.py 'PlayerHookController\$\$Grab'`.
- Art HUD, trang kết thúc, heo đất và hiệu ứng xuất hiện nằm ở `REF/sprites_ui`, xuất bằng
  `export_named.py <REF>/sprites_ui <tiền tố bundle> tên1 tên2 ...` với bundle `ui_pages_ingame_default`
  (`FX_Grap1_Spawn`, `B_PauseButton`, `Icon_Home`), `ui_pages_endgame_normal`, `ui_popups_piggybank`.
- Cây prefab UI (anchor, cỡ, sprite, chữ TMP): `ui_tree.py <tiền tố bundle>`. Trường của một component: `ui_component.py <bundle> <tên GameObject> [script]`.
- Trường MonoBehaviour trong scene (`data.unity3d` không có typetree): `scene_monobehaviours.py`.
- `libil2cpp.so` là ARMv7, metadata v31. Il2CppDumper đọc được với `ForceDump`.

## Luật gốc đã dùng

Đo trong prefab và cấu hình:

- Người chơi: thân tròn bán kính 0.1125 (0.375 × scale 0.3), khối lượng 2, trọng lực −9.81 × 1.1, không ma sát.
- Bước vật lý 0.02 s. `physics.js` chia mỗi bước thành 5 bước con.
- Dây: `SpringJoint2D` 3 Hz, giảm chấn 0.5. Độ dài nghỉ = khoảng cách lúc móc − 0.5808.
  - 0.5808 là độ dài anchor chưa nhân scale. Vì thế lúc móc có cú giật nhẹ, đúng như bản gốc.
- Bumper: `BumperMaterial` nảy 1.4, kết hợp kiểu Maximum. Tường không nảy.
- Camera: ortho size 5 (cao 10 đơn vị), y khoá ở 0, x giới hạn giữa `StartCamera` và `EndCamera`.
- Camera ngang (`js/camera.js`), đọc thô từ scene `level2` trong `data.unity3d` theo thứ tự trường của `dump.cs`:
  - `ProCamera2D`: `HorizontalFollowSmoothness` 0, tức camera nằm đúng trên người chơi cộng độ lệch của ForwardFocus.
  - `ProCamera2DForwardFocus`: Progressive, SpeedMultiplier 1, TransitionSmoothness 0.5, MaintainInfluenceOnStop, Left = Right = 0.25.
  - `ApplyInfluence` [asm 0x11b5860..0x11b5fbc]: đích = vận tốc ngang kẹp trong ±0.25 bề ngang màn [asm 0x11b5a80..0x11b5ab0].
    MaintainInfluenceOnStop giữ độ lệch lớn hơn theo chiều đang bay [asm 0x11b5b20..0x11b5b84], rồi `Mathf.SmoothDamp(…, 0.5)` [asm 0x11b5f4c].
  - Bay nhanh hơn 0.25 bề ngang/giây là bão hoà, nên người chơi đứng ở ~0.25-0.30 bề ngang tính từ trái, đúng như các clip.
  - Bot của bài kiểm dùng cùng file này.
- HUD: `CanvasScaler` của scene `level1` là ScaleWithScreenSize 750 × 1334, khớp chiều cao (match 1). Mọi toạ độ HUD nhân `cao / 1334`.
- Game gốc chơi màn dọc (`screenOrientation = 1`).

Đọc từ mã IL2CPP:

- Chọn điểm móc gần nhất, không giới hạn tầm.
- Nhả dây được đẩy lên 0.15 m/s, tối đa một lần mỗi 0.5 s, và xoay `|v| × 200` độ/s.
- Chạm tường xoay theo tốc độ tiếp tuyến × 200.
- Về đích: thân thành kinematic, thời gian chậm về 5% trong 0.6 s, camera zoom về 2 trong 0.5 s.
  - Người chơi giữ tư thế FINISHED (bay ngang) suốt slow-mo. Điệu nhảy chỉ có ở trang kết thúc.
  - Chữ về đích hiện ngay khi chạm vạch: `<color=#9FFF54>Stage {0}</color> Completed`, Junegull 60, anchor y 0.8 (20 % từ trên) [asm 0x28d9430..0x28d9584].
    Hộp chữ rộng bằng màn, nên số màn hai chữ số xuống hai dòng như clip 2026.
  - Đua: chữ là hạng + "st/nd/rd/th" [asm 0x1224c1c..0x1224c90], cả khi bị ép về đích.
  - Sau `WhenAll(slow-mo 0.6 s, zoom 0.5 s)` + `Task.Delay(400)` [asm 0x1207d70..0x1207810], tức 1.0 s, trang kết thúc mở. Không còn "chạm để tiếp".
  - Nút pause biến mất từ lúc về đích (mọi clip).
- Thanh tiến độ: `clamp01((x − StartingX) / (Finish.x − nửa bề ngang vạch đích − StartingX))` [asm 0x28d934c, 0x28d8e90..0x28d92f8], đầy khi về đích.
  Nền #656565 198 × 21, bóng đen 0.5 lệch 7 xuống, phần đầy trắng, số "n" và "n+1" Junegull 41.65 cách tâm 146 (prefab `DefaultInGameUI`). Đua không có hai số.
- Điểm móc gần nhất: `Target.MarkAsClosest` bật con `Halo` (`A_PlotNearestFeedback`), `MarkAsHooked` tắt nó.
  `HaloAppearManager.OnEnable` scale 0 → 1 trong 0.1 s [asm 0x1242b78..0x1242b94], nên scale 1.2 trong prefab bị ghi đè: vòng rộng 2.74 × 0.5 = 1.37 đơn vị.
- Xuất hiện: `FX_Spawn` là một hạt sống 0.5 s, cỡ 1 × scale 2 = 2 đơn vị, chạy tờ `FX_Grap1_Spawn` 8 × 2 một lượt (ô 11-15 trống).
  `ShowSpawnFx` chờ `ParticleSystem.time × timeToSpawn` [asm 0x1206ea0..0x1206f04]. `time` của FX vừa sinh là 0, nên người chơi lớn dần ngay trong vòng sáng.
  Clip 2019 0:05.8 và 0:05.95 thấy cả vòng lẫn người chơi. Bản cũ chờ 0.75 s.
- Ghép màn ngẫu nhiên (`PatternSpawner`): mỗi ô Start/Middle/Finish lọc pattern có `entryPositions & lối ra trước != 0`, rồi chọn bằng `new System.Random(chỉ số màn).Next(số ứng viên)`.
  - Mỗi ô tạo một `Random` mới với cùng seed.

- **Pháo giấy về đích là `ConfettisLeft`**, `PlayerController.confettisPrefab` của mọi chế độ (PathID −2858981051185679930,
  bundle13). Đọc bằng `tools/extract/dump_confetti.py` + `show_ps.py`, port ở `js/main.js` (`CONF`):
  - Nón 20°, bán kính 0.01, theo hướng bay (`transform.up = v`) [asm 0x1207938..0x1207ae8]. 400 hạt/s, tối đa 70, sống 4 s, không lặp, 3.9 s.
  - Tốc 50-100, cỡ 0.2-0.5 × scale 0.3, trọng lực ×1.4-2, xoay 3D ±45° ban đầu và ±2π rad/s mỗi trục, noise 0.5 tần số 0.5.
  - Màu ngẫu nhiên trong gradient Fixed: #BC0067, #FF6DB5, #F3EADA, #9BF7AD, #F9F871. Mờ dần từ 0.806 tuổi. Texture `confetti`: chữ nhật trắng bo góc 0.98 × 0.70.
- **Zoom về đích đúng từ trước.** Ảnh n02 cũ chụp màn 1 lúc +0.25 s (zoom 3.34). Clip 2026 qua vạch ~0:13.25, khung 0:13.7 là +0.45 s, zoom đã gần 2.
- **"STAGE n COMPLETED" xuống dòng theo bề ngang.** Hộp chữ `FinishText` rộng bằng canvas (neo 0-1), wrap Normal, cỡ 60.
  Điện thoại 9:20 rộng 600 đơn vị: "Stage 44 Completed" 613.6 nên hai dòng, "Stage 1 Completed" 562.9 nên một dòng, ở gốc cũng vậy.

- **Vùng chết là hai hộp `CameraLimitsBottom` / `CameraLimitsLeft`** con của Main Camera (scene level2), chạm là chết
  (`OnTriggerStay2D` tên bắt đầu bằng "CameraLimits" → `TryKillPlayer` [asm 0x120500c..0x12050c0]).
  `CameraService.SetupCamera` [asm 0x127a010] đặt chúng một lần lúc nạp scene, với camera size 5 (`PlaceBorder` [asm 0x127a1b0]):
  BoxCollider2D 1 × 1, lệch 0.6 × hướng, scale đều = rộng / 0.32 (đáy) hoặc cao / 0.32 (trái), 0.32 là `SpriteRenderer.size`;
  tâm cách tâm camera nửa khung × (1 + `_percentageBorderMargin` 0.01) (CameraConfig: 0.01, 5, 15).
  Mép gần của hộp nằm ngoài khung 0.1 × scale: đáy 5.05 + 0.3125 × rộng dưới tâm, trái 0.505 × rộng + 3.125.
  Ở 9:16 người chơi (bán kính 0.1125) chết khi tâm xuống dưới −6.695 hoặc lùi quá 5.853 bên trái tâm camera (`camera.js deathLimits`, dùng cho mọi chế độ, cả Phiêu lưu).
  Bản cũ đặt `[ĐỀ XUẤT]` 0.3 đơn vị ngoài mép, chết sớm hơn bản gốc khoảng 1.5 đơn vị.

Tự đặt, có nhãn `[ĐỀ XUẤT]`:

- Camera lấy vận tốc của thân, không lấy hiệu vị trí như ProCamera2D, để lúc hồi sinh nhảy về đầu màn không làm camera giật.
- Pháo giấy: Limit Velocity dampen 0.1 áp mỗi khung hình thật (60 fps), hạt chạy theo thời gian đã chậm; tốc không nhân scale 0.3.
  Đo bằng `tools/extract/confetti_sim.js`: 1 s sau vạch đám mây trải −1.0..+3.8 đơn vị theo hướng bay, clip 2019 0:09.7-0:10.0 là −0.2..+3.6.
  Áp theo thời gian của hạt hoặc nhân tốc với 0.3 thì đám mây nhỏ còn một phần ba.

## Pha 1: tuỳ biến và vỏ meta

Mọi con số kinh tế lấy từ `D:/stickman-hook-ref/dump/full/remote_settings_default.json`: bản cấu hình mặc định nằm sẵn trong APK.
emote_settings_default.json`: bản cấu hình mặc định nằm sẵn trong APK.
Bản gốc chạy offline bằng chính bản này.

- **Theme màn.** Cứ 4 màn đổi một bộ màu: `theme.levelColors[floor(màn/4) % 4]`.
  - APK ghi `nbLevelsPerTheme` = 5, nhưng cả ba clip đổi mỗi 4 màn (2019: 1-4 / 5-8 / 9…; 2023: 89-92 / 93-96 / 97-100; 2026: 43-46 / 47-50 / 51-54).
    Server ghi đè giá trị này. `SetGameModeTheme` chia cho nó [asm 0x118fb64..0x118fc00]. `tools/build_meta.py` đặt `NB_LEVELS_PER_THEME = 4`.
  - Đổi màu nền camera, màu bóng, nền điểm móc (`targetsBackgroundColor`), phản chiếu tường (`wallsReflectionColor`).
  - `effectBackgroundColor` tô sprite `GradientVertical` (trắng, trong suốt ở trên, đặc ở dưới): đáy nền là màu này ở mọi clip (`render.js`).
  - `build_data.py` gắn `th` (1 nền điểm móc, 2 phản chiếu tường) cho sprite dùng hai material đó. Màu theme thay tint của material.
  - `tint` chỉ còn giữ cho màu sprite khác trắng.
- **Bóng là màu đặc, không phải multiply.** `ShadowMaterial` dùng shader `Sprites/SolidCol`.
  - Bóng `SpriteShadow` vẽ ở thứ tự `sortingOrder + sortingOrderDifference`. Khi bằng nhau, bóng vẽ trước.
  - Nếu vẽ bóng ngay trước sprite của nó, bóng vòng móc sẽ che mất nền điểm móc.
- **XP.** +10 XP mỗi màn Normal (`GamePlaySettings._xpGainPerLevelCompleted`).
  - Chỉ tính lần đầu qua màn đó, vì bản gốc không cho chơi lại màn đã qua.
  - Mở khoá một item cũng cộng XP theo độ hiếm (20/30/50/75). Đủ bộ sưu tập cộng thêm XP của bộ.
  - Không có thưởng xu mỗi màn: `FULLGAME.md` không tìm thấy, nên không tự đặt.
- **Road màn Normal** (`achieved_level_mode.normal`): tự nhận khi qua màn 10/20/25/35/50/100, như `GiveEndGameRewards`. Lúc khởi động cũng nhận bù.
- **Đường XP** (127 mốc): không có nút nhận. Popup Đường XP tự mở khi có XP chưa nhận, chạy thanh rồi nhận mọi mốc đã đạt (`ClaimAllRewards`).
  Xem mục "Đường XP tự nhận" (rev 20261028l).
  - Thưởng mà hệ thống chưa nạp vẫn được ghi vào `save.pending` và trả khi hệ đó nạp (booster: khi `cards.js` nạp).
- **Mở khoá item.** Một bảng `UNLOCK` (cách mở → điền `{0}` của `textTemplate` gốc, có đạt được ở bản web hay không).
  - Lúc làm Pha 1, bản web chỉ đạt được: mặc định, road XP, road màn Normal. Sau đó có thêm sự kiện, Challenge, Grapple, vòng quay, heo đất (bảng `UNLOCK`, cờ `live`).
  - Các cách còn lại (quảng cáo, VIP, Adventure, Race, link ngoài) hiện chữ gốc và không có đường mở giả. Road cấp perk của thẻ giờ có thật.
  - `tournament` không có trong `unlockConditions`, nên dùng chữ của `leaderboard_prize`.
- **Chế độ.** Normal chơi được. Chế độ khác mở khi mốc Đường XP phát nó đã được **nhận** (từ 20261028l; trước đó web mở theo XP đạt).
  Còn khoá thì hiện "Cần N XP". Easter/Valentine mở theo cờ `flag.seasonal_event` do road màn Normal phát ở màn 10.
- **Skin biến thể** (`skin.alien_hologram_travelers`, ...; 51 item): dùng sheet của skin gốc.
  - Material AllIn1SpriteShader của nó được `build_meta.py` rút gọn thành vài phép xử lý điểm ảnh: đổi màu, HSV, swap, xám, âm bản, posterize, gradient, pixel hoá, glow, sọc hologram, viền.
  - `fx.js` nướng các phép này một lần cho mỗi khung hình.
  - Hiệu ứng động: xem mục "Hiệu ứng động của skin biến thể" (rev 20261028l).
  - Skin biến thể có `hasShadow: false` nên không vẽ bóng.
- **Nạp lười.** Màn đầu chỉ nạp thêm `meta.json` (31 KB).
  - Skin mặc định vẽ từ `atlas.webp`. Dây mặc định là texture `basic` trắng: web vẽ một nét trắng rộng 0.03 đơn vị, không nạp `ropes.webp`
    (clip 2026 1:06: 4-5 px ở 128 px/đơn vị, kể cả nhoè JPEG).
  - Khi đổi sang đồ khác mới nạp `custom.json` + sheet skin, hoặc `ropes.webp`.
  - Điệu nhảy về đích nạp sheet của skin đang dùng khi qua màn.
  - Tiếng nạp ở lần chạm đầu.
  - `menu.webp` chỉ nạp khi trang chính hiện, tức là sau khi màn đã sẵn sàng.

Số tự đặt `[ĐỀ XUẤT]`:

- Dây: prefab Rope scale sprite (1.6, 2) dưới một cha không rõ scale.
  - Mình nhân thêm 0.2: ô texture 167 px rộng khoảng 0.4 đơn vị, cạnh dây Classic 0.045.
- Hạng = chỉ số (đếm từ 0) của mốc Đường XP cuối cùng đã đạt. Clip 2026 0:16: mốc 1850 XP (chỉ số 21) mang số 21. Bản trước 20261028l đếm từ 1.
  - Mã gốc điền `{{level}}` từ trạng thái road, còn template mặc định dùng `{0}`.
- Pixel hoá: khối `max(2, round(cạnh khung / _PixelateSize × 4))` px.
- Glow: cộng `_GlowColor × _Glow / 10`.
- Ngưỡng đổi màu tối thiểu 0.08.
- Trail lấy mẫu mỗi khi người chơi đi được 0.02 đơn vị, tuổi tính theo thời gian game. Hạt của trail: mục "Hạt của trail" (rev 20261028l).

## Menu bằng art gốc (2026-10-29, rev 20261028i)

Trang chính, Chế độ, Đường XP, Tuỳ biến và trang Đua dựng lại theo prefab 9.9.60 với sprite gốc. Vòng quay và Chợ giữ như cũ.

- Art: `tools/extract/page_sprites.py` xuất mọi Sprite với tới được từ bundle của trang (cùng bundle phụ thuộc) ra `D:/stickman-hook-ref/sprites_menus`.
  `rarity_sprites.py` xuất holder theo độ hiếm (cùng tên ở mọi độ hiếm, lưu `<Tên>_<độ hiếm>`).
  `tools/build_menus.py` gói thành một sheet mỗi màn kèm viền 9-slice.
- Bố cục theo đơn vị tham chiếu: CanvasScaler 750 × 1334 khớp chiều cao, CSS `--u = 100dvh / 1334`. Số lấy từ RectTransform của prefab (`tools/extract/ui_tree.py`).
- Màu nền: UIGradient của từng trang. Trang chính #006DCF→#00EAFF, Chế độ #0082FF→#00EAFF, Đường XP #DA73D6→#3673C7, Đua #6521C5→#A52FDB.
- Chữ: số và chữ ASCII vẽ bằng font Junegull của game (canvas, `uikit.js label/glText`). Font không có dấu tiếng Việt, nên nhãn tiếng Việt
  ("CHƠI", "TRANG CHỦ", "CHẾ ĐỘ CHƠI", "GIẢI ĐUA"...) dùng chữ hệ thống viền xanh đậm. `glText` giữ nguyên `textContent`: code và bài kiểm vẫn đọc được số.
- Trang chính: cột trái là `MarketWidgetsHolder` (VIP Bundle, Welcome Offer / No Ads; từ 20261028m), Chợ mở từ tab đầu của thanh menu và nút + cạnh xu. Tab thẻ bài (`Icon_CardsLocked` tới khi có thẻ đầu tiên, rồi `Icon_Cards`) mở trang thẻ. Bánh răng mở bảng chọn màn.
- Tuỳ biến: gốc lật 7 trang, web cuộn mọi bộ sưu tập trong một danh sách, số trang cuộn tới nhóm của nó.
- Đường XP: từ 20261028l theo prefab `ElementStart` / `ElementReward` (300 đơn vị mỗi hạng) và thẻ thưởng Big / Small / Mode của `XpRoadSettings`. Bỏ nút "Nhận thưởng" của web.
- Nạp: `home.js` + `uikit.js` + `m-home.webp` chỉ nạp khi trang chính hiện. Màn đầu (`?level=1`) 580 KB. Mở trang chính thẳng (không `?level`) 712 KB
  (`m-home.webp` 92 KB thay `menu.webp` 39 KB).

## Chế độ phụ

Mở từ trang chính → Chế độ. Hàng nào đã mở thì có nút Chơi, bấm vào là ra bảng chọn màn của chế độ đó.
Nút chọn màn, chơi lại (trong pause) và trang kết thúc đều làm việc trên chế độ đang chơi. Mọi khác biệt giữa các chế độ nằm trong `js/modes.js`.

| Chế độ | Màn | Mở chế độ | Mở màn | Road |
|---|---|---|---|---|
| Mechanical Grapple | 41 cố định, rồi ngẫu nhiên từ 3 bể (31/46/37) | 2650 XP | qua màn trước | `achieved_level_mode.grapple`: 5, 20, 50, 100 |
| Challenge | 30, mỗi màn 3 pattern | 1250 XP | theo XP, xem dưới | `achieved_level_mode.challenge`: 1, 5, 10, … 30 |
| Easter, Valentine's Day | 5 mỗi sự kiện | qua Normal màn 10 | qua màn trước | không có; mỗi màn tặng một skin |

Luật đọc từ mã IL2CPP (`docs/FULLGAME.md` mục 1-4):

- **Màn ngẫu nhiên của Grapple** dùng đúng cách ghép của Normal (`level.js`), với bể pattern và chỉ số màn của Grapple.
- **Grapple** (`PlayerHookControllerGrappleMode`). Thân người chơi giống `PlayerDefault`, chỉ khác cú móc:
  - Chọn điểm móc gần nhất, điểm ở phía sau tính xa gấp 1/0.6 lần (`UpdateClosestTarget(0.4)` [asm 0x120dec8], chia khoảng cách [asm 0x120a8fc]).
  - Móc thì không có lò xo, trọng lực 0. Mỗi bước vật lý: `v = Vector2.SmoothDamp(v, hướng × tốc độ, 0.0176)` [asm 0x120e218].
  - Tốc độ tăng tuyến tính trong 0.4 s, từ `lerp(max(v·hướng, −5), 5, 0.75)` lên 15 [asm 0x120e5e8..0x120e6a8, 0x120e764].
  - Vận tốc của SmoothDamp bắt đầu bằng vận tốc lúc móc [asm 0x120e818].
  - Cách điểm móc dưới 0.25 thì tự nhả, giữ 75 % tốc độ [asm 0x120df6c]. Nhả tay thì giữ 100 %.
  - Nhả không có cú đẩy lên của dây. Nếu `|vx| < 1` thì `vx = ±1` [asm 0x120ebf8..0x120ecc4].
- **Challenge mở màn theo XP** (`autoUnlockNextLevel = false`).
  - Màn thứ i (đếm từ 0) mở khi số bước `unlocked_level_mode.challenge` đã đạt trên Đường XP ≥ i (`HasUnlockedLevel` [asm 0x1296d08..0x1296d14]).
  - Đường XP có 29 bước (1250, 1650, …, 12050) cho 30 màn, nên màn 1 có sẵn cùng chế độ. Ở 1250 XP mở được màn 1-2.
- **Theme** (`ThemeService.SetGameModeTheme`):
  - Chế độ có trong `theme.gameModes` dùng màu của nó (Challenge, Easter, Valentine).
  - Chế độ không có trong đó (Grapple) dùng `levelColors[0]` [asm 0x118fcb8]. Normal vẫn đổi màu mỗi 5 màn.
- **Hai sự kiện có cùng 5 màn.** `SeasonalGamePlayConfig` của Easter và Valentine trỏ cùng pattern, chỉ khác màu theme.
- **Bumper nhỏ** `AN_Grap1_BumperSmall004` có clip `BumperAnimationSmall` (000..004, 30 fps). Chỉ `STARTU050` dùng nó (Challenge màn 19, sự kiện màn 5).
  - Bumper của Challenge và sự kiện ghi đè độ nảy (1 hoặc 1.3), hoặc bật `forceBounce`: đặt vận tốc thành `forceImpulse / 2`.
- **Thưởng cuối màn** của mọi chế độ: +10 XP ở lần đầu qua màn, rồi nhận road của chế độ theo màn cao nhất đã qua.

Tự đặt, có nhãn `[ĐỀ XUẤT]`:

- Màn thứ N của sự kiện tặng skin thứ N của sự kiện, theo thứ tự bảng tuỳ biến.
  - Bản gốc lấy danh sách thưởng từ server (`SeasonalEventDto.Rewards`, rỗng trong cấu hình có sẵn), mỗi ngày một phần.
- Khung ngày của sự kiện do server quyết (`seasonalEvents` rỗng trong cấu hình có sẵn). Bản web để cả hai sự kiện luôn mở.
- Grapple và Challenge mở theo XP đã đạt, không cần bấm nhận thưởng trên Đường XP.
  Bản gốc cần đã nhận: `IsUnlocked` = số lượng `mode.<id>` trong túi > 0 [asm 0x1296ee0], `HasUnlockedLevel` so với số lượng
  `unlocked_level_mode.challenge` [asm 0x1296b28, 0x1296d08], cả hai chỉ có khi nhận mốc Đường XP. Giữ như cũ vì bản web chưa dựng
  `XpRoadPopup` tự hiện như bản gốc; đổi lúc này sẽ khoá chế độ của người đã đủ XP mà chưa bấm nhận.

**Một màn mỗi ngày và giới hạn lượt** (rev 20261028k, `js/daily.js`, `modes.js event`, `main.js openLevels`):

- Vòng sự kiện (`SeasonalEventsService.InitializeEvent` [asm 0x118066c]): trạng thái cũ giữ khi `now < EndDate` = ngày bắt đầu + số thưởng
  ngày [asm 0x11807dc..0x118081c, 0x117fe54]. Hết hạn (hoặc chưa có) thì mở vòng mới từ 0 giờ hôm nay với các thưởng chưa có
  (`<InitializeEvent>b__2`: `GetQuantity < 1` [asm 0x1181f6c]). Thưởng hôm nay = `rewards[(now − StartDate).Days]` [asm 0x11810b8, 0x118117c],
  màn hôm nay = vị trí của thưởng đó trong danh sách của sự kiện (`GetLevelForToday` [asm 0x118127c]).
- `GetCanPlayState` của sự kiện [asm 0x1180bd0]: có đủ thưởng → xong hẳn (5) [asm 0x1180c44]; đã có thưởng hôm nay → xong hôm nay (6)
  [asm 0x1180c58]; còn lại theo giới hạn ngày của `GameModesService`. Bảng chọn màn chỉ mở màn hôm nay, ghi "Hôm nay: màn N" hoặc
  "Đã nhận quà hôm nay. Màn mới sau …".
- Giới hạn ngày (`GameModesService.GetCanPlayState` [asm 0x129747c], `TryPlaying` [asm 0x1297744]), số từ `game_modes`:
  sự kiện 1 miễn phí, quảng cáo không giới hạn; Lucky Drop 1 miễn phí + 2 quảng cáo; Đua 2 miễn phí, quảng cáo không giới hạn; các chế độ khác −1/−1.
  - Miễn phí: cờ `daily_flag_<mode>_free_<yyyy-MM-dd>` +1 (`PlayForFree` [asm 0x1297870]). Quảng cáo: `AddRewardedTicket` [asm 0x1298494]
    rồi `PlayForRewarded` trừ vé chế độ và cộng `daily_flag_<mode>_rewarded_<ngày>` [asm 0x1297a04]. Quảng cáo: `js/ads.js watch` (có vé bỏ qua thì trừ 1 vé, không thì nhận ngay).
  - Cờ của ngày khác bị xoá (`CleanOldFlags` [asm 0x12964cc]).
- Lượt sự kiện tính khi bấm màn trong bảng chọn. Chết rồi hồi sinh, phím R, "Chơi lại" trong cùng lượt không tính thêm (bản gốc hồi sinh trong cùng game).
  Đóng bảng chọn khi chưa trả lượt thì về Normal và trang chính. `?mode=easter_event&level=N` (lối thử) bỏ qua giới hạn.

## Vòng quay, heo đất, chợ, vé bỏ qua

Vào từ trang chính: ô "Chợ" bên trái và ô vòng quay bên phải, giống `MarketWidgetsHolder` và `LuckyWheelButton` của `HomePage`.
Hàng "Lucky Wheel" trong Chế độ cũng mở vòng quay. Heo đất hiện ở màn kết thúc Normal. Nút bỏ qua hiện trong màn Normal sau một lần chết.

- Code: `js/bonus.js` (luật, ô trang chính, nút bỏ qua, khung heo đất) và `js/menus.js` (`openWheel`, `openMarket`).
- Dữ liệu `data/bonus.json`, ảnh `art/wheel.webp`, `art/piggy.webp`, `art/skip.webp`. Tất cả do `tools/build_meta.py` tạo từ APK.
- Màn đầu không nạp gì trong số này. `bonus.js` + `bonus.json` nạp khi trang chính hiện, khi chết hoặc khi qua một màn Normal.
  `wheel.webp` nạp khi mở vòng quay, `piggy.webp` khi khung heo hiện, `skip.webp` khi nút bỏ qua hiện.

Số lấy từ `remote_settings_default.json` (`lucky_wheel`, `piggy_bank`, `market`, `ads`, `cards`, `periodic_resources`).
Thông số dải quay lấy từ `LuckyWheelSettings` "LuckyWheelConfig" trong `resources.assets`.

**Vòng quay** (`LuckyWheelService`):

- Giá = `prices[min(số lần đã nhận, 1)]` = [0, 500] xu. Số lần nhận đếm suốt đời (`progression.lucky_wheel_claims`) [asm 0x115ab14..0x115ac50].
  - Lần quay đầu miễn phí, từ lần sau mỗi lần 500 xu.
  - Không có lượt miễn phí mỗi ngày, cũng không có thời gian chờ: cả service lẫn config đều không có. Thiếu xu thì nút báo "Cần thêm xu".
- `PayForSpin` trừ giá, `ClaimReward` cộng số lần nhận rồi phát thưởng [asm 0x115db94, 0x115dd94].
- Danh sách thưởng (`RefreshRewardsList` [asm 0x115c8b4]): mọi món của mọi pool, trừ đồ tuỳ biến đã có [asm 0x115e3c8].
  - Trọng số một món = trọng số pool / số món còn lại trong pool [asm 0x115cc38..0x115cc7c]. Pool `trail.epic` rỗng nên không góp gì.
- Thưởng ép: món đầu tiên của `forcedRewards` chưa có, tức skin Potatoz [asm 0x115ce78..0x115cee0]. Vì thế lần quay đầu luôn ra Potatoz.
  - `FULLGAME.md` ghi luật này là UNKNOWN. Giờ đã rõ: thưởng ép áp dụng khi người chơi chưa có món đó.
- Ngoài thưởng ép thì chọn theo trọng số (`WeightedRandom.GetRandom` [asm 0x115d030]).
  - Booster và thẻ lẻ chỉ được chọn sau khi có `flag.has_welcome_booster` (Đường XP, 550 XP) [asm 0x115e524..0x115e5c0].
  - Booster trúng được qua `GetFallbackIfNoCardAvailable` rồi mở trong popup (mục "Thẻ bài, booster, Chợ Đen").
- Dải quay có 50 ô, thưởng nằm ở ô 45. Quay 8 s theo đường cong của `LuckyWheelSettings` (3 key, nội suy Hermite như `AnimationCurve`).
  - Mỗi ô đi qua làm mũi tên giật xuống tối đa 45°, rồi bật lại với `tickerUpSpeed` 0.1 s.
- `mode.lucky_wheel` không có màn. Nó là cổng mở vòng quay, Đường XP phát ở bước 1 (0 XP).

**Heo đất** (`PiggyBankService`, `PiggyBankPopup`):

- Chỉ có ở Normal: `GiveEndGameRewards` mở popup heo khi còn skin heo chưa có [asm 0x12a62bc].
- Skin kế tiếp: trong các skin của `rewardIds` chưa có, lấy món thứ (số lần bỏ mod số món) [asm 0x1175cc8..0x1175dfc].
- Mức nạp lấy từ dòng cuối của `fillConfigs` có `threshold` ≤ số lần đã mở [asm 0x11759b4].
  - Trước lần mở đầu: +10 mỗi màn. Từ đó về sau: +3. Cột `rewarded` (+30) dành cho nút xem quảng cáo.
  - Tiến độ kẹp ở 100 [asm 0x1175c44..0x1175c88]. Đầy khi > 99 [asm 0x1175cb8].
- Mở heo: tiến độ về 0, số lần mở +1, nhận skin [asm 0x1175e38]. Bỏ heo: tiến độ về 0, số lần bỏ +1, chuyển sang skin sau [asm 0x1176094].
- Heo đầy mà không mở thì sẽ mất ở màn kế tiếp (`Activate` gọi `LoseReward` [asm 0x1177648]).
- Bản gốc không bán heo đất bằng tiền thật. Hai nút "Mở khoá" và "+30%" là quảng cáo có thưởng (`rewarded.piggy_bank_unlock`, `rewarded.piggy_bank_fill`).
  - Mọi quảng cáo có thưởng đều bỏ qua được bằng `skipPrice` của `rewarded.default`: 1 vé bỏ qua, trừ tự động khi có vé.
  - Từ 20261028m: không có vé thì bấm là nhận ngay (mục "Quảng cáo có thưởng và IAP").

**Xu miễn phí mỗi ngày**: `offer.free_coins` cho 20 xu.

- Điều kiện là `didnt_buy_free_coins_today` (`daily.free_coins` < 1). Chu kỳ 1 ngày, `isUtc` false, nên ngày tính theo giờ máy.
- `offer.rewarded_coins` (50 xu đổi một quảng cáo, một lần mỗi ngày): có từ 20261028m.

**Vé bỏ qua** (`currency.skip_tickets`):

- Trong bản gốc, vé dùng để bỏ qua quảng cáo (`skipPrice` của `rewarded.default`): có vé thì quảng cáo không chiếu, trừ 1 vé (`PAID_SKIP` [asm 0x2dfb204, 0x2dfb3ac]).
- Nguồn vé: gói 20/60/140 vé (`offer.skip_tickets_1..3`, IAP; từ 20261028m bấm là nhận ngay), VIP Bundle (60 vé).
- Thưởng `currency.skip_tickets` còn chờ trong `save.pending` được trả lúc khởi động (`Meta.deliverPending`).
  - Đường XP gốc không phát vé, nên thường không có gì để trả. Booster chờ tới khi `cards.js` nạp (trang chính) rồi mở.

**Bỏ qua màn** (`SkipLevelService`, `SkipButtonView`):

- Nút hiện ở màn Normal sau một lần chết (`SetHasDied`), khi hôm nay còn lượt (`CanSkipLevelToday` [asm 0x124eac8]). Chữ dưới nút là "còn/ngày".
- Số lượt mỗi ngày = `trunc(hiệu ứng)` của thẻ `card.skip_level` ở cấp thẻ hiện có (`GetNbSkippableLevelsPerDay` [asm 0x124ea74..0x124ea90]).
  - Cấp thẻ từ số thẻ đang có (`save.inv['card.skip_level']`): `(n − 1) / 30 + 1` [asm 0x127bb7c]. Cấp < 1 cho 0 lượt [asm 0x127c668]. Cấp L cho 1 + (L − 1) lượt.
- Lượt đã dùng đếm trong `flag.nb_levels_skipped_<ngày>` [asm 0x124eb40..0x124eb94]. Cờ của ngày cũ bị xoá (`CleanDailyTokenFlags`).
- Bấm nút = xem quảng cáo `rewarded.skip_level` (`js/ads.js watch`). Ảnh nút: vé khi `CanSkip` (vé > 1), còn lại ảnh quảng cáo `SkipButton0001` (`art/skip-ad.webp`).
  - Sau đó màn được tính là đã qua (`GamePlayService.SkipLevel` → `CompleteLevel` [asm 0x129c96c]): +10 XP, road, heo đất.

Tự đặt, có nhãn `[ĐỀ XUẤT]`:

- Heo đất chỉ nạp ở lần qua màn đầu tiên, giống XP. Bản web cho chơi lại màn, bản gốc thì không.
- Giờ máy, giờ địa phương. Bản gốc lấy ngày từ `OnlineDateService` (server).
  `FormatDateId` đã giải: `DateTime.ToString("yyyy-MM-dd")` [asm 0x2e7b9ec]. Cờ bỏ qua màn là `flag.nb_levels_skipped_yyyy-MM-dd`
  (`SkipLevelService.GetDayId` [asm 0x124e998]). Xu miễn phí mỗi ngày là tài nguyên định kỳ, không qua `FormatDateId`, vẫn lưu YYYYMMDD.
- Dải quay:
  - Các ô khác lặp lại danh sách thưởng đã xáo. Ô quanh ô 45 không trùng với thưởng.
  - Bắt đầu ở ô 2 và cuộn xuống. Khung tham chiếu 750 × 1334.
  - Nhịp đèn bolt, tốc độ xoay của mặt trời và độ trôi của xúc xắc là tự đặt.
- Heo đất (`js/endgame.js`) là màn toàn màn hình như `PiggyBankPopup`: nền gradient `#40E8EC → #008FE1` (UIGradient), `Pattern_MainMenu` lát 341 đơn vị,
  xoay 30°, cộng sáng 0.17; chữ "Stage n / Completed" ở 250 từ trên; bóng skin `#252252`, phần đã nạp tô tím từ dưới lên; nút vàng ở 240 từ dưới.
  - Nút vàng mang `AdIcon`, hoặc icon vé khi có vé (`NoAdsIconChanger`). Bên cạnh là nút VIP Skip khi chưa có VIP. Chạm chỗ trống là tiếp tục. Đầy: UNLOCK hoặc chạm "LOSE IT!". Mở xong: "Equip it!".
  - `[ĐỀ XUẤT]` chữ phóng 1.2 lần (đo trong clip, prefab ghi 49), skin chiếm 60 % hộp 570, nạp chạy 0.8 s. Thanh bộ sưu tập: có từ 20261028l. Nút VIP Skip: có từ 20261028m.
- Trang kết thúc (`NormalEndGame`): nền theme, `BackgroundEndRace` hai góc, "stage n / Completed!" (#FFC327, Grapple/Challenge #76E97E) ở 300 từ trên,
  `LightEndRace_01`, bục caro (rộng 516 đơn vị như clip 2026 0:27.6), skin nhảy cỡ gốc 100 đơn vị/đơn vị thế giới, nút `PlayButton_03` ở 300 từ dưới, nút nhà.

Bẫy:

- `LuckyWheelSettings` nằm trong `data.unity3d`, không có typetree. Phải đọc thô theo thứ tự trường trong `dump.cs`.
  - Mỗi Keyframe dài 28 byte: time, value, inSlope, outSlope, weightedMode, inWeight, outWeight.
- `rewardPools` có phần tử cuối là `{"poolId": 0}`. Phải bỏ nó đi.
- Icon trong `menu.webp` phải nằm trên ô vuông. `icon()` co ảnh vào ô vuông, nên ảnh hẹp (vé 64×49) để lộ ảnh bên cạnh trong sheet.
- Thêm icon thì `menu.webp` xếp lại chỗ. Luôn tạo lại cùng lúc với `meta.json`.
- Để luật mới trong `meta.js` và `meta.json` thì màn đầu lên 606 KB, vượt ngân sách 600 KB. Đã tách sang `bonus.js` + `bonus.json` nạp lười: màn đầu còn 592 KB.
- Đề bài cho rằng heo đất bán bằng tiền thật, và vòng quay có lượt miễn phí mỗi ngày. Cả hai đều sai so với config và asm.

## Đua (Tournament)

Mở ở 150 XP (Đường XP phát `mode.tournament`). Chế độ → Đua mở trang bảng xếp hạng hôm nay, nút Đua bắt đầu một cuộc đua.
Người chơi đua với tối đa 4 ghost là bản ghi người thật có sẵn trong APK, trên một trong 21 map của Tournament.

- Code: `js/race.js` (trang bảng xếp hạng, chọn đối thủ, ghost, đếm ngược, xếp hạng, thưởng, bảng ngày). `main.js` chỉ có vài móc `mode.race?.…`, vật lý là của Normal.
- Dữ liệu: `data/mode-race.json` (`build_data.py`: 21 map + mục `race`: số đối thủ, trọng số độ khó, cấu hình bảng xếp hạng, tên và skin AI),
  `data/race/<map>.json` (`build_race.py`: ghost của map đó), `art/race.webp` + `data/race/art.json` (vòng đánh dấu chỗ xuất phát, cúp).
- Nạp lười: mở chế độ nạp `race.js` (27 KB thô) + `mode-race.json` (55 KB). Mỗi cuộc đua nạp một file ghost (40–103 KB thô, gzip trung bình 17 KB),
  `race.webp` (18 KB) và sheet skin của các ghost. Màn đầu không nạp gì trong số này.
- Bản ghi asm đã dịch: `D:/stickman-hook-ref/dump/asm/tournament/` (`tools/dump_tournament_asm.py`). Tìm nơi gọi một hàm: `tools/callers.py`.

Luật đọc từ mã IL2CPP:

- **Lượt chơi.** 2 lượt miễn phí mỗi ngày (`maxFreeGamesPerDay`), đếm lúc bấm Đua, không phải lúc về đích, trong cờ
  `daily_flag_mode.tournament_free_<ngày>` [asm 0x1296f40, 0x12972f0, 0x1297870].
  - Hết lượt miễn phí thì bản gốc bắt xem quảng cáo, không giới hạn (`maxRewardedGamesPerDay` −1) [asm 0x129747c, 0x12984f8].
    Nút `RewardedPlayButton` (AdIcon "+1" Ticket): quảng cáo cho 1 vé đua, chơi ngay (`js/ads.js watch`; có vé bỏ qua thì trừ 1 vé).
- **Chọn map.** `GetNextLevelToPlay` = max(0, min(đã đạt, đã mở)) [asm 0x1296b50]. `RefineLevel`: dưới 21 thì giữ nguyên, từ 21 trở đi `Random.Range(0, 21)` [asm 0x12aac08].
  - Về đích (kể cả bị ép về đích) thì "đã đạt" = map + 1 nếu chưa vượt (`OnLevelAchieved` [asm 0x2419580, 0x12968e4]). Lưu ở `save.modes['mode.tournament'].best`.
  - Vì thế 21 cuộc đua đầu đi lần lượt map 1 → 21 (map 1 là `RaceTest`), sau đó ngẫu nhiên.
- **Chỗ xuất phát.** Người chơi ở ô `Random.Range(0, 5)` [asm 0x121fea0]. Ô k là object `"Spawn" + (k > 0 ? k : "")` của pattern đầu [asm 0x12aad00].
- **Đối thủ.** Mỗi ô còn lại lấy `GetRandomSaveForRace(map, ô, ANY)` [asm 0x12202d8]:
  - Độ khó rút theo trọng số `_difficultyLevels[clamp(số ngày thắng, 0, 5)]` [asm 0x1190c6c]. Số ngày thắng = `leaderboard.tournament_win` (`GetNbLeaderboardWins` [asm 0x12b8af0]).
  - Lấy ngẫu nhiên một bản ghi cùng map, độ khó, ô. Không có bản ghi nào thì trả null và ô đó trống [asm 0x12205a0].
    Đây là lời giải của UNKNOWN "fallback diff 4" trong `FULLGAME.md`: độ khó 4 (ANY) không có bản ghi, nên từ 5 ngày thắng mỗi ô có 40 % bị trống.
  - Đối thủ xếp theo `duration` tăng dần [asm 0x1220c0c]. Tên ghost lấy từ danh sách người của bảng xếp hạng đã xáo [asm 0x1220160].
- **Đếm ngược.** "3", "2", "1", "GO", mỗi chữ 500 ms [asm 0x1220e98, 0x1220f78, 0x122102c].
  - Trong lúc đếm, ô của người chơi hiện `SpawnPointPlayer`, các ô khác hiện `SpawnPointGhost` [asm 0x12aae04]. Vòng của người chơi phồng 1.2 lần trong 0.2 s ở mỗi nhịp [asm 0x1220acc, 0x1220b48].
  - Người chơi chỉ xuất hiện sau khi `StartRace` xong, cùng lúc các ghost bắt đầu chạy [asm 0x12abeec].
- **Ghost về đích.** `PlayGhostAndWaitForFinish` chờ `Task.Delay(round(duration × 1000))` tính từ GO rồi mới báo ghost về đích [asm 0x1221438, 0x1221528].
  - Hình của ghost chạy theo đồng hồ bản ghi, cũng tính từ GO.
- **Xếp hạng** = thứ tự về đích. Ghost về thì vào danh sách (`TriggerOnGhostFinished`). Người chơi về thì vào danh sách (`CompleteLevel` [asm 0x12ab638]). Hạng là chỉ số của người chơi, đếm từ 0 [asm 0x12abb74].
  - Ghost làm danh sách đủ 4 thì người chơi bị ép về đích (`ForceFinish`, không có pháo giấy) [asm 0x12ab824..0x12ab84c]. Nghĩa là thua cả 4 thì về thứ 5.
  - Chết thì chơi lại từ ô xuất phát của mình. Cuộc đua vẫn chạy tiếp (`Respawn`, xem `docs/GAMEPLAY.md` mục 4).
- **Thưởng mỗi cuộc đua** (`GetRaceRewards(clamp(hạng, 0, 4))` [asm 0x1190d24]): xu [10, 7, 5, 3, 1], cúp [10, 5, 3, 2, 1].
  - Hai mảng nằm trong metadata ở offset 0x6cb420 và 0x6d20b8 (`.cctor` [asm 0x11910c8]).
  - `FinishRace` cộng xu và `progression.race_trophies`, rồi ghi tổng cúp hôm nay làm điểm bảng xếp hạng [asm 0x1190e44, 0x1191054].
  - Không có XP: `GiveEndGameRewards` của lớp gốc rỗng, Tournament không ghi đè [asm 0x28d84f8].
- **Bảng xếp hạng ngày** (competition `tournament`, 10 người, 1 ngày):
  - Seed = (int)(32 bit thấp của mốc bắt đầu tính bằng ms) / 1000 [asm 0x115642c].
  - 9 AI sinh từ `System.Random(seed)` [asm 0x11568ec, 0x115692c]. Mỗi AI: `Next(0, 100)` ≤ 20 thì tên là "Player" + 6 chữ số, cắt còn 10 ký tự. Còn lại thì lấy `playerNames[Next]`. Sau đó rút skin từ `playerSkinIds`.
  - Điểm AI: mỗi lần tính lại tạo một `System.Random(seed)` mới. Độ khó = `aiDifficulties[min(số ngày thắng, 4)]`.
    AI thứ i: easing = bảng[`Next(0, 7)`] (bảng có SINE_OUT hai lần [asm 0x813404]), đích = `Next(min, max)`, điểm = (int)(start + easing(p) × (đích − start)), với p = phần ngày đã trôi qua [asm 0x12b9ae4, 0x12b94c8..0x12b96e4].
  - Người chơi đứng sau 9 AI, điểm = cúp hôm nay. Sắp xếp giảm dần và ổn định, nên hoà điểm thì người chơi đứng dưới [asm 0x12b97f4, 0x1154ebc].
  - `tournaments.tournamentsAI` trong config không được code nào đọc.
- **Hết ngày.** Lần mở kế tiếp sẽ chốt bảng cũ ở p = 1 (`ClaimRewards` [asm 0x12bae08]):
  - Thưởng theo hạng: hạng có trong danh sách thì lấy đúng mục đó, hạng nằm giữa hai mục thì nội suy và làm tròn chẵn (hạng 7/8/9: 20/15/10 xu) [asm 0x12ba320].
  - Hạng 1 nhận skin chưa có thứ (số bảng đã chơi mod số skin chưa có) của `reward_pool.tournament_skin`. Có đủ cả 6 thì mất phần skin [asm 0x1157358..0x1157374].
  - Hạng 1 cộng 1 ngày thắng [asm 0x12bb4cc]. Mọi hạng cộng 1 bảng đã chơi [asm 0x12bb54c].
  - Bảng mới xoá cúp và điểm của ngày [asm 0x11909bc, 0x12b880c].

Đo trong dữ liệu:

- Ghost: `GhostMaterial` (Sprites/Default, `_Color` alpha 0.396). Đây là `alternativeMaterials` của `Ghostable2D`, nên ghost trong suốt 60 %.
  - Bản ghi chỉ có thân và dây, nên ghost không có bóng.
- Bản ghi (`build_race.py`): track 0 là thân (vị trí, góc z, flipX, tên khung hình), track 1 là dây.
  - Vị trí của dây là trung điểm, scale y = độ dài / 0.345. Điểm móc = 2 × trung điểm − thân.
- 502/505 bản ghi chạm vạch đích chậm hơn `duration` khoảng 0.22 s (trung vị 0.221).
  - Nghĩa là ghost được tính về đích trước khi hình của nó chạm vạch. Bản web giữ nguyên lệch này.
- Ghost lấy mẫu lại 10 Hz, vẽ bằng Catmull-Rom. Sau khi bản ghi hết (khoảng `duration` + 0.5 s) thì ghost biến mất.

Tự đặt, có nhãn `[ĐỀ XUẤT]`:

- Ngày của bảng: nửa đêm theo giờ máy. Bản gốc lấy giờ từ server (`OnlineDateService`). Mã ngày theo `FormatDateId` đã giải: `yyyy-MM-dd`
  (`js/daily.js dayKey`), cờ lượt miễn phí `daily_flag_mode.tournament_free_<yyyy-MM-dd>`.
- Tên ghost lấy từ 9 AI của bảng, không lấy tên người chơi. Bản gốc xáo cả 10 người, nên có thể ra chính tên mình.
- Ghost và người chơi về trong cùng một khung hình thì ghost đứng trước (đồng hồ đua chạy trước bước vật lý của khung đó).
- Màu dây ghost lấy màu dây mặc định (trắng). Độ rộng 0.06 × 0.345 giả định `AAL_square_mini` là hình vuông.
- Trong lúc đua: thanh tiến độ không số, góc phải liệt kê "#n tên" người đã về (người chơi là "ME" vì font Junegull không có chữ Việt, màu #FFC64C),
  số đếm đỏ #FF483E nằm trên vòng ô xuất phát của người chơi (`SpawnCounter`). Bản web vẫn giữ nút pause khi đua (gốc tắt), để thoát được map chỉ có 3 ghost.
- Màn kết thúc là khung DOM tiếng Việt: hạng, thời gian, xu/cúp, thứ tự cả cuộc đua, hạng trên bảng ngày, nút "Bảng xếp hạng" và "Đua tiếp".
  - Bản gốc dùng ảnh hạng và nút xem quảng cáo nhân xu.
- Chơi lại, phím R và chọn màn (trong pause) khi đang đua mở lại trang bảng xếp hạng, để không chơi lại free cùng một cuộc đua.

Chưa làm:

- Đường VIP `flag.old_no_ads` (`offer.old_no_ads` bị tắt trong 9.9.60). Nút "Claim +N" và "Claim x1.2": có từ 20261028m.
- Chữ "X đã về đích" trong lúc đua.
- Ảnh hạng và hoạt hình của `FinishedTournamentPopup`.

Bẫy:

- **Bản ghi có cả lúc chết.** Giữa bản ghi có những đoạn thân bị đẩy về x − 1000 (`ResetPlayer`) rồi xuất hiện lại.
  - Nội suy qua những đoạn đó sẽ ra ghost bay ngang màn hình. `build_race.py` ghi chúng vào `hid` và ẩn ghost ở đó.
- **Vị trí track dây không phải điểm móc** mà là trung điểm của dây. Lấy nó làm điểm móc thì dây chỉ dài một nửa.
- **Map 1 (`RaceTest`) không có bản ghi độ khó 0 cho ô 1.** Người mới chơi ở ô khác chỉ gặp 3 ghost. Đó là luật gốc, không phải lỗi.
- **Vòng xuất phát, Halo và sprite tắt trong prefab không được vào `atlas.webp`**, vì atlas thuộc màn đầu. Chúng nằm riêng trong `race.webp`.
- **Seed của bảng phụ thuộc múi giờ** (nửa đêm giờ máy). Bài kiểm dùng mốc ms cố định 1793120400000 (28/10/2026, UTC+7).
- **Tên trường `n` trong file ghost là tên bản ghi.** Lúc giải nén lần đầu, mình gán số mẫu vào `n` và làm mất tên. Số mẫu giờ là `len`.

## Phiêu lưu (Adventure)

Mở ở 650 XP (`meta.d.modes`: `mode.adventure` ← `progression.xp` 650). Chế độ → Phiêu lưu mở trang của chế độ: kỹ năng, đường kỷ lục, bảng tuần, nút Chơi.
Một lượt là chạy vô tận sang phải, tường lửa đuổi sau lưng, một mạng. Điểm là số mét.

- Code: `js/advrun.js` (luật, không đụng DOM, bài kiểm node chạy thẳng), `js/adventure.js` (trang, vòng lặp, vẽ, màn kết thúc). Vật lý là `physics.js` của Normal.
- Dữ liệu: `data/mode-adventure.json` (`tools/build_adventure.py`: cấu hình, 6 kỹ năng, giá, đường kỷ lục 105 mốc, bảng tuần, 8 tầng, 189 pattern, toạ độ sprite)
  và `art/adventure.webp` (sprite riêng của Adventure, khung bumper đỏ `_Low` đã nướng màu, texture hạt).
- Nạp lười, chỉ khi mở chế độ: `adventure.js` 38 KB + `advrun.js` 26 KB + `mode-adventure.json` 389 KB (gzip 86 KB) + `adventure.webp` 111 KB.
  Tổng 564 KB thô, khoảng 220 KB gzip. Màn đầu không nạp gì trong số này.
- Bản ghi asm: `D:/stickman-hook-ref/dump/asm/adventure/*.s` (`tools/dump_adventure_asm.py`). `UnityEngine.Random` đọc từ `libunity.so` (Thumb),
  giải nén ở `D:/stickman-hook-ref/libunity_x/`, đọc bằng `tools/unity_icall_thumb.py` và `tools/unity_dis.py`.
- Dựng lại: `adventure_assets.py`, `adventure_curves.py`, `export_textures.py` (ở `D:/stickman-hook-ref/tools/`), rồi `cd tools && py -3 -I build_adventure.py`.

Luật đọc từ mã IL2CPP:

- **Ghép đường** (`LoadNewAdventurePattern` [asm 0x11f9300]):
  - seed = `Leaderboard.Seed + _index`. Tầng = chỉ số cuối k có `_index >= [0, 1, 10, 25, 35, 55, 65, 80][k]` [asm 0x11f8e3c..0x11f8ee0].
  - Ứng viên: pattern của tầng có `entry & lối ra trước != 0` (`Intersects` [asm 0x12a242c], lối ra đầu = 7). Chọn bằng `System.Random(seed).Next(0, số ứng viên)` [asm 0x17501a8].
  - Đặt ở điểm End của pattern trước, pattern đầu ở `Vector3.zero`. Sau đó `SpawnGravityZone`, `SpawnPortal`.
  - Nạp thêm khi còn ≤ 3 pattern hoặc pattern cuối bắt đầu chưa tới 100 m trước người chơi. Xoá pattern đầu khi có ≥ 3 và pattern thứ hai đã lùi quá 100 m [asm 0x11f8f0c].
- **`UnityEngine.Random`** là Xorshift128 của libunity: `InitState` [libunity 0x22a968], `value` = `(w & 0x7FFFFF) × f32(0x34000001)` [0x22aa10],
  `Range(float)` = `(1 − t) × max + t × min` [0x22a998], `Range(int)` = `min + next % (max − min)` [0x236128]. Port: `URandom` trong `advrun.js`.
- **Thiên lệch theo kỹ năng** (mọi vật thể): `v = r + (min(1, r + Range(minSize, maxSize)) − r) × giá trị kỹ năng`, rồi `GetDifficulty` chia ba: BAD / NEUTRAL / GOOD [asm 0x126ac08].
  - Giá trị kỹ năng `GetValueAtLevelAndDistance` [asm 0x126a060] = `lerp(min, max, progression(clamp01((1 + bonus(d / 1000) × mult) × cấp / 100)))`.
  - 100 là `GetSkillLevelMax` = 20 + hiệu ứng thẻ nâng trần ở cấp tối đa (80) [asm 0x1269d78]. Không có thẻ thì trần là cấp 20 (`LOCKED` [asm 0x1269ae0, 0x126a390]).
- **Điểm móc** (`TargetAdventure`, `Target.Start` [asm 0x1200e74]): `InitState(Seed + _targetsCount++)`, `value`, `Range`.
  GOOD → xoay (180°/s, giữ tốc ≥ 6 khi đang móc [asm 0x11fca84]), NEUTRAL → thường, BAD → `RangeInt(0, 3) + 1`: dùng một lần (thả là mất [asm 0x11fdfd0]),
  hẹn giờ (mất sau 5 s kể từ lần móc đầu [asm 0x11fc93c]), di chuyển (hướng `RangeInt(0, 4)`, ±1, SINE_EASE_IN_OUT [asm 0x11fe2ac]).
  Điểm móc dưới pattern `INITIAL` luôn thường. Điểm đang móc bị huỷ thì tự nhả [asm 0x120adb8].
- **Bumper** (`BumperAnimationController.Start` [asm 0x11ff9f4] → `SetType` [asm 0x11fa948]): `RangeInt(0, 4)` bỏ đi, rồi `InitState(Seed + _bumpersCount++)`.
  NEUTRAL → thường (nảy 1.3), GOOD → vàng (1.5), BAD → `RangeInt(0, 2)`: đỏ (0.5) hoặc dùng một lần (co lại khi chạm [asm 0x11fa810]). `INITIAL` → giữ 1.0 [asm 0x11fad94].
- **Vùng gió** (`SpawnGravityZone` [asm 0x11f9950]): `InitState(seed)`, có khi `value < 0.15`, vị trí ngẫu nhiên trong pattern, rồi `Range`, `value`.
  BAD → kéo xuống (−3, −1.5), GOOD → đẩy lên (10, 3), NEUTRAL → vẫn đẩy lên nhưng không hiện hình. `AddForce` mỗi bước vật lý (khối lượng 2), bỏ qua khi đang móc mà đi ngược lực.
  Vận tốc kẹp ở 35 [asm 0x12a0920]. Vào / ra vùng qua trigger [asm 0x129fe3c, 0x12a0628].
- **Cổng dịch chuyển** (`SpawnPortal` [asm 0x11f9e1c]): khi pattern trước còn trước x 300 thì cổng thưởng luôn qua, sau đó cần `value ≤ 0.2`. Rồi `value`, `Range`, phải ra GOOD.
  Cổng đặt cách một điểm xuất hiện của pattern 1 m về bên phải. Chạm cổng (`HandlePortalCollision` [asm 0x129ff2c]): tới pattern `RangeInt(1, 3)` phía trước,
  một điểm xuất hiện ngẫu nhiên, lùi 1 m. Người chơi mờ 0.3, bay thẳng 20 m/s, ra với vận tốc (14.7087, 2.94174) [asm 0x12a1660]. Đi qua cổng thì cổng đóng [asm 0x12a1b50].
- **Độ dài dây**: `AdventurePlayerController.Awake` gán `ropeLength` [asm 0x12a081c]. Chỉ điểm móc trong tầm dây mới được chọn [asm 0x120a58c].
  Vòng tròn xanh (0.25, 1, 0.31, α 0.118) quanh người chơi là tầm dây [asm 0x11ffef0]. Giữ nút thì móc ngay khi có điểm vào tầm (`grabOnHold` [asm 0x12a18f8]).
- **Tường lửa** (`Firewall` [asm 0x11fb4cc..0x11fbc5c]): sinh ở (0, 0), chạy từ lần móc đầu, chờ 3 s. Mode 0: tốc độ 0.1, cộng `0.05 × dt × kỹ năng` mỗi khung, không có trần.
  Không bao giờ tụt sau người chơi quá 30 m. Chạm hộp trigger (lệch (−2.5, 40), cỡ (5, 100)) là chết [asm 0x129fdcc].
- **Điểm**: `lastDistance = floor(max(lastDistance, x − StartingX))` [asm 0x129fa54]. Vạch "best score" / "last score" đặt ở x = điểm [asm 0x129ef5c].
- **Kết thúc lượt** (`RegisterPendingScore` [asm 0x12680cc], `ClaimPendingScore` [asm 0x1268190]): ghi kỷ lục tuần, điểm lần trước, `progression.adventure_best_score`; mỗi mét = 1 xu phiêu lưu.
- **Giá nâng kỹ năng** = `100 + 10 × floor(tổng cấp cả 6 kỹ năng / 10)` [asm 0x126a184]. `FULLGAME.md` cũ ghi "+10 mỗi cấp" là sai.
- **Nâng kỹ năng ngẫu nhiên** (rev 20261028k): nút duy nhất là `HoldButton` gọi `LevelUpRandomSkill` [asm 0x113d050..0x113d080, 0x126a3f4].
  Thiếu xu phiêu lưu thì thôi [asm 0x126a4dc..0x126a504]. Ứng viên = kỹ năng còn nâng được (`<LevelUpRandomSkill>b__15_0` [asm 0x126aa5c]),
  không còn thì không trừ gì [asm 0x126a590]. Chọn `UnityEngine.Random.Range(0, n)` [asm 0x126a5a0], trừ giá, +1 cấp [asm 0x126a63c, 0x126a660].
  Có thẻ Skill Upgrade Boost và kỹ năng đó còn nâng được thì `Range(0, 1000) < trunc(effect) × 10` cho thêm 1 cấp [asm 0x126a684..0x126a774].
  - Giữ nút thì lặp: lần đầu ngay khi chạm, rồi chờ `lerp(0.6, 0.1, (đếm / 5)²)` giây (prefab: initialInterval 0.6, finalInterval 0.1,
    nbClicksToFinal 5, easing (0,0,0)→(1,1,2) = t²) [asm 0x304064c, 0x3040830..0x30409a4]: 0.6, 0.58, 0.52, 0.42, 0.28, rồi 0.1 s.
    Nút tắt khi thiếu xu (`UpdateView` [asm 0x113bb34..0x113bb84]), lúc đó vòng lặp chờ từng khung.
- **Bộ đếm tĩnh** `Target._targetsCount` / `BumperAdventure._bumpersCount` chỉ về 0 khi mở app [asm 0x120114c, 0x11faac0].
  Web giữ chúng trong `adventure.js COUNTS` suốt phiên trang (tải lại trang = mở app), nên lượt thứ hai cùng seed ra loại vật thể khác, như bản gốc.
- **Tuần mới** xoá đường kỷ lục (`ResetProgressionRoad` [asm 0x1267e24]) và điểm tuần. Bảng `adventure`: 10000 người, 6 độ khó AI, hạng ≤ 2 tính là thắng.

Tự đặt, có nhãn `[ĐỀ XUẤT]`:

- Tuần bắt đầu thứ Hai 0 giờ theo giờ máy. Bản gốc lấy từ server. Bảng tuần dùng `Board` của `race.js` với thời gian chạy chậm 7 lần.
- `Target.Start` / `BumperAnimationController.Start` chạy theo thứ tự trong hierarchy, ngay sau khi sinh pattern.
- Camera: như Normal (dẫn trước `vx × 0.2`), y khoá ở 0, không có mép phải.
- Hạt và ánh sáng làm đơn giản: hạt lửa, tia lửa, quầng đỏ, hạt của vùng gió lấy tốc độ phát, thời gian sống, cỡ, màu từ ParticleSystem của prefab, nhưng phẳng 2D và không có Light.
  Cổng dịch chuyển vẽ bằng vài lớp quầng tĩnh. Chưa có clip Adventure của bản gốc để so hình.
- Thưởng đường kỷ lục nhận ngay ở màn kết thúc. Bảng tuần hạng 1 nhận skin từ `reward_pool.adventure_skin` theo cách của Đua.

Bẫy:

- **Tên pattern trùng với Normal** (`FINISH00`, …) nhưng prefab khác. Pattern Adventure chỉ nằm trong `mode-adventure.json`, không gộp vào `levels.json`.
- **Seed liền nhau của `System.Random` ra pattern xen kẽ** (`NewEasyLow (1)`, `(2)`, `(1)`, …). Đó là đúng bản gốc, không phải lỗi.
- **Đích của cổng phụ thuộc trạng thái chung của `UnityEngine.Random`**, tức là vật thể nào vừa sinh. Bài kiểm trình duyệt kiểm theo luật, không kiểm toạ độ cố định.
- **Renderer nhận bảng toạ độ atlas trần** (`app.atlas.rects`). Bọc thêm một lớp `{rects}` thì không vẽ được người chơi, tường, theme mà không báo lỗi gì.
- **Script vá có dấu `\` viết bằng heredoc của bash bị nuốt mất.** Viết bằng công cụ Write rồi chạy.

## Thẻ bài, booster, Chợ Đen (2026-10-29, rev 20261028j)

33 thẻ, 7 booster, Chợ Đen và hiệu ứng thẻ ở mọi chế độ. Vào từ tab thẻ bài của thanh menu dưới trang chính (khoá tới khi có thẻ đầu tiên) và từ Chợ.

- Code: `js/cards.js` (luật, không DOM: cấp thẻ, booster, Chợ Đen, cộng tài nguyên theo thẻ, các phép thử của thẻ), `js/cardsui.js` (trang thẻ, popup mở booster, phần Chợ Đen và gói thẻ trong Chợ, thông báo hiệu ứng).
- Dữ liệu: `data/cards.json` (14 KB, `tools/build_cards.py` từ `remote_settings_default.json`: `cards`, `booster`, `black_market`, `resource_boosting`, road `progression.cards_perk_level`, giá gói thẻ).
- Art: `art/m-cards.webp` (thẻ, holder theo độ hiếm, nền theo nhóm, trang thẻ) và `art/m-boost.webp` (gói thẻ, popup, Chợ Đen), cùng `tools/build_menus.py`.
  - Sprite gốc: `tools/extract/page_sprites.py` trên mọi bundle `cards_*`, `boosters_*`, `ui_market_*`, `ui_pages_cards`, `ui_popups_cards_info` ra `D:/stickman-hook-ref/sprites_cards`.
  - Gói thẻ cùng tên `Market` / `NoOutline` ở mọi độ hiếm: `tools/extract/booster_sprites.py` lưu `<loại>_<biến thể>.png` vào `sprites_cards/boosters`.
  - Prefab dựng lúc chạy (`HolderCardItemUI`, `CardsUI`, `BoosterCardItemUI`) không có đường dẫn container: `tools/extract/ui_roots.py <bundle> [tên]` in mọi GameObject gốc.
- Nạp lười: `cards.js` + `cards.json` nạp cùng trang chính, khi mở Lucky Drop / Phiêu lưu / Chợ, hoặc lúc mở game nếu bản lưu đã có thẻ hay booster chờ mở.
  `cardsui.js` + `m-cards.webp` (254 KB) + `m-boost.webp` (124 KB) nạp khi mở trang thẻ, popup booster hoặc Chợ. Màn đầu không nạp gì trong số này.
- Bản ghi asm: `D:/stickman-hook-ref/dump/asm/{cards,blackmarket,boost,cardfx}/`.

Luật đọc từ mã IL2CPP:

- **Cấp thẻ** (`CardsService`). Số thẻ lưu dưới chính id thẻ (`save.inv['card.skip_level']`) [asm 0x1277100]. Cấp = 0 nếu chưa có, ngược lại `(n − 1) / requiredCardsPerLevel + 1` (chia nguyên) [asm 0x127bb7c..0x127bba0].
  - Thẻ đầu tiên cho cấp 1, mỗi cấp sau tốn đúng `requiredCardsPerLevel` (common 30, epic 15, legendary 10). Tối đa `(maxLevel − 1) × req + 1` thẻ [asm 0x127bd40].
  - Thanh tiến độ: `(n − 1) % req` trên `req`, đầy khi tối đa [asm 0x127bc8c..0x127bd20].
  - Hiệu ứng ở cấp L: 0 nếu L < 1, `maxEffect` nếu L ≥ max, ngược lại `minEffect + effectGraduation × (L − 1)` [asm 0x127c5b0]. Ví dụ Second Chance 5, 7, … 21, 23, rồi 25 ở cấp 10.
- **Cấp perk** = tổng cấp của 33 thẻ, tối đa 330 [asm 0x127b9c4, 0x127c0f0]. Mỗi lần đổi, road `progression.cards_perk_level` tự nhận mọi mốc đã đạt [asm 0x127b20c]:
  10 Stick Viking, 20 Spider, 29 dây Banana, 50 dây Candy, … 330 vệt Fire. Cách mở khoá này giờ có thật (`meta.js UNLOCK` `live`).
- **Booster đến tay** (`BoosterIncentiveController`): thưởng `booster.*` không nằm trong túi đồ. Mỗi cái thành một bản `"<id>_<GUID N>"` và mở ngay bằng popup [asm 0x1278a68..0x1278b18].
  - Web: `save.boosterQueue`, popup mở khi trang chính hiện. Booster trong `save.pending` từ các bản cũ được trả qua `Meta.deliverPending` khi `cards.js` nạp.
  - Vòng quay: `booster_card.<độ hiếm>` cho `booster.<độ hiếm>_single_card`. Mọi booster của vòng quay qua `GetFallbackIfNoCardAvailable`: hết thẻ chưa tối đa ở mọi độ hiếm có trọng số thì đổi thành xu bù × số lượng [asm 0x1277260, 0x115e4c0].
  - `flag.has_welcome_booster` chỉ là thưởng của Đường XP mốc 550 (cùng `booster.welcome_booster`), code không ghi nó.
- **Mở booster** (`GetBoosterContent` [asm 0x12759ec]):
  - Seed: `UnityEngine.Random.InitState((int)XXHash64(token))`, token là đoạn sau dấu `_` cuối [asm 0x1275b3c, 0x1275e04]. Port XXHash64 (BigInt) và Xorshift128 trong `cards.js`.
  - Số lượt rút = `nbCards`, hoặc 1 nếu là `one_more_card_` / `extra_card_` [asm 0x1275d58]. Mỗi lượt theo thứ tự:
    1. `Range(min, max + 1)` thẻ một chồng [asm 0x1275e38].
    2. Lượt i < số `guaranteedCards`: thẻ chỉ định (mới nếu chưa có, bỏ qua thẻ vừa rút), hoặc `booster_card.<độ hiếm>` thì đi đường độ hiếm.
    3. Còn lại: độ hiếm theo `cardsWeight` bằng `System.Random` **không seed** (`WeightedRandom` [asm 0x12763bc, 0x19749dc]).
  - Trong một độ hiếm [asm 0x12766b0]: bể = thẻ chưa tối đa (tính cả thẻ vừa rút). Rỗng thì ra xu bù 1/3/10. Toàn thẻ mới hoặc toàn thẻ cũ thì không thử, ngược lại mới khi `value < noveltyChance / 100` (7.5 / 20 / 30 %) [asm 0x1276940]. Chọn đều bằng `Range(0, n)` [asm 0x12769d0].
  - Thẻ mới cho 1 thẻ. Thẻ cũ cho `min(chồng, còn thiếu tới tối đa)` [asm 0x1276dc4, 0x1277044].
  - `card.double_cards`: khi còn thiếu > chồng, `Range(0, 1000) < (int)(effect × 10)` thì chồng × 2 [asm 0x1276f80..0x1277018].
  - `card.extra_draw`: lúc đóng popup, ≥ 2 thẻ và `Range(0, 1000) < (int)(effect × 10)` trên cùng dòng Random thì được thêm `extra_card_<id>`, mở tiếp [asm 0x1142d6c..0x1142ec8].
  - Nút "+1 Card": không phải one-more, `nbRewarded ≥ 1`, món đầu là thẻ [asm 0x1144360..0x11443e8]. Là quảng cáo `rewarded.one_more_card`: bấm là nhận ngay, có vé bỏ qua thì trừ 1 vé (20261028m).
- **Popup** (`RunOpenFlow` [asm 0x1145c04]): ≥ 2 thẻ thì có màn xé gói (openingDelay 0.5 s, displayDelay 1.0 s), chờ 300 ms [asm 0x1145fb4], hiện từng thẻ phóng tới 1.6 [asm 0x1143294],
  rồi vòng tổng kết bán kính 210, y × 1.2, bắt đầu từ 90° [asm 0x1146088]. Nền UIGradient #0C142B → #2169D4, `Pattern_CardMenu` tô #040711.
- **Cộng tài nguyên theo thẻ** (`ResourceBoostingService.GetBoostAmount` [asm 0x117d920]): khoá `(tài nguyên + "_" + nguồn)` chữ thường.
  - Thưởng thêm = `RoundHalfEven(effect / 100 × số lượng)` (float), cho cả thẻ "+%" lẫn thẻ "x" [asm 0x117daf4..0x117dc24], kẹp theo phần còn lại của ngày.
  - Bộ đếm ngày `consumption_<thẻ>_<yyyy-MM-dd>` (giờ máy) cộng theo số lượng **gốc** [asm 0x117dd74], chỉ khi có trần ≥ 1. Thưởng thêm là một lần cộng riêng [asm 0x117d8e0].
  - Nguồn: `finish_level_normal` / `finish_level_grapple` (XP cuối màn), `unlocked_<skin|rope|trail>`, `collection_complete`, `progression_road_progression.xp` (xu của Đường XP, Rank Coins Boost),
    `offer.free_coins`, `finish_level_tournament` (xu, cúp), `pachinko` (xu của Lucky Drop), `finish_level_adventure` (xu phiêu lưu).
- **Bỏ qua màn**: số lượt mỗi ngày = `trunc(effect)` của `card.skip_level` ở cấp thẻ đang có [asm 0x124ea74..0x124ea90]. Thẻ cấp 2 (31 thẻ) cho 2 lượt.
- **Cơ hội thứ hai** (`PlayerController.TryKillPlayer` → `DeservesSecondChance` [asm 0x12050d0, 0x1207054..0x1207238]):
  thẻ của chế độ đang chơi (normal / challenge / grapple / tournament), `Range(0, 100) < effect` thì hồi sinh thay vì chết.
  - `Revive` [asm 0x12097f0..0x1209a64]: điểm xuất hiện cuối cùng bên trái chỗ chết (chỉ pattern Start có, nên là đầu màn), đếm ngược `SpawnCounter`, vận tốc 0. Không tính là chết, nên không hiện nút bỏ qua.
  - Không có giới hạn "1 lần mỗi màn" trong code dù chữ của thẻ ghi vậy: mỗi lần chết lại thử.
- **Vòng quay** `card.extra_lucky_wheel`: sau mỗi lần nhận thưởng, `Range(0, 1000) < (int)(effect × 10)` thì quay thêm một lượt tự động, không trả giá [asm 0x115e1c4..0x115e234, 0x1160b0c].
  - Lượt thêm không phát gì (rev 20261028k, giống bản gốc): bỏ qua `PayForSpin`, nên `ClaimReward` thấy `progression.lucky_wheel_spin` ≤ 0
    [asm 0x115de58..0x115de5c] và thoát với log lỗi [asm 0x115e0f8..0x115e114]: không đếm lần nhận, không thưởng, không thử quay thêm lần nữa.
    Web quay bánh xe tới một món rồi báo "Lượt quay thêm không phát thưởng".
- **Lucky Drop**:
  - `PachinkoLevelSpawner.Initialize` [asm 0x1212548..0x1212718], sau khi dựng bàn, trước khi chọn chỗ xuất hiện, trên danh sách chốt xếp từ cao xuống:
    - Extra Stickman: một lần `value() < effect / 100`, rồi `Range(0, min(n − 1, 10))`. Chữ của thẻ ghi "1-2" nhưng code chỉ một chốt.
    - x10: 5 lần thử độc lập, rồi k lần `Range(0, n − 1)`.
  - Chốt người que (`SetAsExtraStickman` [asm 0x121b024]): sprite `PegExtra*`, 1 xu, chạm là sinh một người que phụ ở chốt, bay `10 × (cos a, sin a)` với `a = Range(45, 135)` độ, không móc được, mờ 0.5 [asm 0x12a87b8, 0x1217cec].
    Chốt biến mất ngay. Ván xong khi mọi người que đều vào ô, mỗi ô đều được tính thưởng [asm 0x12a768c, 0x12a7ff8].
  - Bumper Resistance: mỗi lần chạm khi chốt chưa biến mất, `value() < effect / 100` thì chốt đứng lại [asm 0x121b39c..0x121b4d0]. Chốt x10 vẫn tiêu một lần thử.
  - Lucky Drop Limit: `ResetPachinkoState` thử `NextDouble() < effect / 100` vào `_bonusGamesLimit` [asm 0x116f26c], nhưng không code nào của 9.9.60 đọc giá trị này
    (`get_BonusGamesLimit` không có ai gọi; giới hạn ngày chỉ đọc `maxFreeGamesPerDay` / `maxRewardedGamesPerDay` [asm 0x1297178, 0x1297234]). Web lưu nó vào trạng thái Lucky Drop và không dùng.
  - Giới hạn ngày của Lucky Drop (1 miễn phí + 2 quảng cáo) và bàn đổi mỗi ngày: `docs/PACHINKO.md` (rev 20261028k).
- **Phiêu lưu**:
  - Trần mua kỹ năng = 20 + `trunc(effect)` của thẻ nâng trần tương ứng ở cấp đang có [asm 0x1269bb8..0x1269be8]: 20 khi chưa có thẻ, 28 ở cấp 1, 100 ở cấp 10. Mẫu số của công thức giá trị vẫn là 100 [asm 0x1269e50].
  - Skill Upgrade Boost: sau khi nâng, `Range(0, 1000) < trunc(effect) × 10` thì được thêm một cấp miễn phí [asm 0x126a6b4..0x126a714].
  - Weekly Starting Tokens: tuần mới, ngay sau khi xoá đường kỷ lục [asm 0x1267e40]. Daily Login Tokens: mở trang Phiêu lưu, mỗi ngày một lần, cờ `flag.adventure_daily_token_flag_<ngày>` [asm 0x12682b0].
- **Chợ Đen** (`BlackMarketService`):
  - Lượt 6 giờ (`BlackMarketDuration` 21600000 ms [asm 0x126cb10]) theo lịch giờ máy tính từ 1970-01-01, tức đổi lúc 0, 6, 12, 18 giờ [asm 0x1270160].
  - Mỗi lượt: 3 món tuỳ biến, rồi 3 thẻ, không lặp món của lượt trước (thiếu thì cho lặp), xáo Fisher–Yates bằng `System.Random` không seed [asm 0x12717f8..0x1271988, 0x1270b2c].
  - Món tuỳ biến: chưa có, không thuộc bể thưởng Đua, không là giải chính đang có của Lucky Drop [asm 0x126cc18]. Giá cố định 1000 / 3000 / 6000 xu.
  - Thẻ: đã có (cấp ≥ 1), chưa tối đa [asm 0x126cebc]. Số thẻ = phần XP còn thiếu của cấp hiện tại, giá = đơn giá 20 / 50 / 200 × số thẻ [asm 0x126edc0..0x126f0f8]. Mỗi thẻ mua một lần mỗi lượt.
  - Phần thẻ và gói thẻ cần `has_cards` (đã có ít nhất một thẻ).

Tự đặt, có nhãn `[ĐỀ XUẤT]`:

- Giá gói thẻ: từ 20261028m gói thẻ là nút IAP như bản gốc (giá USD `[ĐỀ XUẤT]`, mục "Quảng cáo có thưởng và IAP"). Giá xu 3800/9800/49000 cũ đã bỏ.
- Popup mở booster hiện và cấp đúng một nội dung. Bản gốc sinh hai lần (một để hiện, một để cấp) với lần thử độ hiếm không seed, nên có thể cấp khác cái đã hiện.
- Đếm ngược của Cơ hội thứ hai: "3", "2", "1", "GO", mỗi chữ 0.5 s như ô xuất phát của Đua, chữ DOM đỏ #FF483E. Popup thẻ nhỏ (`SmallCardsEffectPopup`) và popup hiệu ứng (`NormalCardsEffectPopup`) rút gọn thành toast.
- Thanh tiến độ trong popup hiện ngay trạng thái cuối, không chạy đếm từ n/2 tới n.
- Dải giá trị dưới thẻ (`GradientHorizontalInOut`, trắng trong prefab) tô màu tối của độ hiếm.
- Trang thẻ: khối 675 đơn vị co lại cho vừa màn hình hẹp (canvas gốc ghép theo chiều cao nên rộng chỉ ~616 đơn vị ở 390 × 844).
- Ô thẻ trong Chợ Đen: chữ "LVL n" và tên chế độ bằng chữ hệ thống trên thanh màu tối của độ hiếm.

Bẫy:

- **Đặt `background-size: contain !important` lên phần tử dùng `spr()` thì hiện cả sheet.** `spr` cần kích thước nền đúng tỉ lệ sheet. Ảnh co vào hộp dùng `fit()` (cắt sprite bằng `cut`).
- **`page_sprites.py` lấy bundle đầu tiên khớp tiền tố** và bỏ sprite trùng tên. Gói thẻ và nền nhóm thẻ trùng tên ở mọi biến thể, nên cần `booster_sprites.py`.
- **Thẻ "x" nhân rất ít.** Cùng công thức `effect / 100 × số lượng` với thẻ "+%": Daily Coins Boost x2 trên 7 xu đua là `round(0.14)` = 0. Đúng asm, không phải lỗi.
- **Welcome booster cho 2 thẻ Skin XP Boost, mỗi thẻ 1.** Thẻ chỉ định tính "mới" theo kho đồ, không tính thẻ vừa rút trong cùng gói.
- **Mọi mã ngày của bản gốc là `FormatDateId` = `yyyy-MM-dd`** (bộ đếm thẻ, bỏ qua màn, cờ lượt chơi của chế độ, Lucky Drop).
  Riêng xu miễn phí mỗi ngày (`periodic_resources`) không qua hàm này, `bonus.js dayId` vẫn là YYYYMMDD.

## Đường XP tự nhận (2026-10-29, rev 20261028l)

Luật gốc, đọc từ asm (`D:/stickman-hook-ref/dump/asm/road/`):

- **Chế độ mở theo mốc đã nhận.** `GameModesService.IsUnlocked` = số lượng tài nguyên chế độ trong kho > 0 [asm 0x1296df4..0x1296ee8].
  Sự kiện dùng `flag.seasonal_event`. Tài nguyên chỉ vào kho khi mốc Đường XP được nhận.
  Web: `Meta.modeState` đọc `save.modes[id].unlocked`, sự kiện đọc `save.flags['flag.seasonal_event']`.
- **Màn Challenge.** `HasUnlockedLevel(mode, i)` (i đếm từ 0): `nbLevels <= i` thì không; `autoUnlockNextLevel` thì có;
  còn lại `GetMaxLevelUnlocked >= i` [asm 0x1296bf4..0x1296d14].
  - `GetMaxLevelUnlocked` = số `unlocked_level_mode.challenge` trong kho [asm 0x1296b28]. Mỗi mốc đã nhận cộng 1.
  - `FixUnlockDiscrepancies` nâng nó lên bằng số màn đã qua [asm 0x12962f4..0x1296350].
  - Web: `Meta.levelsUnlocked` = max(`levels`, `best`).
- **Lần cấp màn đầu tiên mở luôn chế độ.** `OnModeLevelUnlocked` gán chế độ = 1 rồi gọi `ShowModePopup` [asm 0x1297dec..0x1297f68].
  `OnModeUnlocked` cấp màn 1 cho chế độ chưa có màn nào [asm 0x1297c1c..0x1297c5c].
- **Popup tự mở.** `XpRoadService.OnXpChanged` theo dõi `progression.xp` [asm 0x11a0310..0x11a046c].
  - Còn XP chưa chạy thanh (`ProgressionRoadStateController.GetPendingProgressions` [asm 0x2f9fde8]) thì xếp hàng `XpRoadPopup.AutomaticTrophyRoadPopupConfig`.
  - Trang chính có prompt `xp_road_recovery` (`XpRoadRecoveryPromptController`) mở cùng popup đó khi còn XP chưa nhận [asm 0x1192fa0..0x119313c].
  - Clip 2026: qua màn 44 lúc 0:13.25, popup Đường XP ở 0:15.8-0:17.4, heo đất từ 0:17.6.
  - Web: XP qua màn → popup trước heo đất (`endgame.js show`), và trang chính mở popup khi còn XP chưa nhận (`main.js roadPopup`).
- **Trong popup** (`XpRoadPopup.OnShowEndedAsync` [asm 0x1240a94..0x12413f8]):
  - Ẩn nút về, sao XP bay vào, thanh chạy (`AnimateAllXpProgress`).
  - Rồi `ClaimAllRewards('progression.xp')` [asm 0x1240c38], `UpdateView`, `Task.Delay(600)` [asm 0x1240e6c] và tự đóng.
  - Không còn XP chờ: `Delay(100)`, cuộn tới mốc hiện tại, hiện nút về.
  - Mở tay khi còn XP chờ (bấm thanh XP) cũng chạy, nhận rồi đóng như vậy.
- **XP đã nhận.** Lưu ở `save.inv['progression.xp_claimed']` (`claimedResourceId` của `progression_road`). `Meta.xpPending` = XP − giá trị đó.
  - Mở khoá item lúc nhận cũng cộng XP. Vì vậy sau một lần nhận có thể còn XP chờ, và popup mở tiếp (web: tối đa 4 lần liền).
- **Chuyển bản lưu cũ** (`Meta.migrate`, chạy lúc khởi động):
  - Bản lưu chưa có `progression.xp_claimed` lấy giá trị bằng mốc cuối đã bấm nhận ở web cũ.
  - Phần XP sau mốc đó thành XP chờ. Lần tới về trang chính (hoặc qua màn), popup tự nhận nốt.
  - Ai đã bấm nhận mốc Grapple / Challenge thì giữ quyền vào. Ai chỉ có XP mà chưa nhận thì được nhận ngay ở trang chính.
  - Chế độ đã có `levels` mà thiếu cờ `unlocked` thì được gắn cờ.
- **Popup dựng theo prefab** (`menus.js openRoad`, art `m-road.webp`):
  - Hàng: `ElementStart` cao 454, mỗi mốc sau cao 300 (`ElementReward` / `ElementLeague`). Thanh ở x 85, rộng 47, màu #2B247B.
    Bát giác 80 × 66 #4E47A1 viền #2B247B, số Junegull 28 #A46AC7. Mốc i nằm 33 dưới đỉnh hàng.
  - Phần đầy #6DDCFF / #25CAFF, đầu thanh `CursorTrophyRoad`. Dây nối #372B8582 dày 5 tới thẻ ở 30 % bề ngang.
  - Thẻ (`XpRoadSettings` trong bundle xproadconfig):
    - Big 400 × 180: item và gói booster, nền `XpRoadHolder` theo độ hiếm.
    - Small 180 × 180: xu (`SkinCoinsPile` + số), thẻ lẻ, vé, cờ.
    - Mode 400 × 180: ảnh chế độ (`TrophyRoadRewardModeUI`: Challenge_Illu, Grapple_Illu, LuckyWheel_Illu, Tournament_Illu, LuckyDrop_Illu, Adventure_Illu;
      xuất bằng `D:/stickman-hook-ref/tools/export_modereward.py`), tên 22 và "New Mode" / "New Challenge" #FFC93D 30.
    - Khung `rounded_square` #372B85 50 %, `IconValidate` 60 × 60 khi đã nhận.
  - Nút nhà 85 × 85 ở góc phải dưới, không có tiêu đề, như prefab.
- `[ĐỀ XUẤT]`:
  - Số sao min(10, XP chờ), cách nhau 0.06 s, bay 0.5 s, thanh chạy 0.6 s, đường bay cong sang trái. Tổng ~1.7 s, khớp clip ~1.6 s.
    Thông số thật nằm trong `CurveProfile` / `MagneticLauncher`, chưa đọc.
  - Huy chương hạng dùng sprite medal nhỏ đã có, không có "TOP n % of players" (số của server).
  - Mốc 0 XP (Lucky Wheel) được nhận ở lần popup đầu, tức sau màn 1.
- Chưa làm: `ModeUnlockedPopup` sau khi nhận chế độ (web hiện toast "Chế độ mới: …"). Popup mở item và mở bộ sưu tập cũng vẫn là toast.

## Hiệu ứng động của skin biến thể (2026-10-29, rev 20261028l)

Cả 51 material dùng shader `AllIn1SpriteShaderScrollView` (bundle192). 33 chương trình GLES3 của nó khớp một-một với tổ hợp keyword của các material.
Công thức đọc thẳng từ mã GLES3, ghi cạnh `material_ops` trong `tools/build_meta.py`. `_Time` = (t/20, t, 2t, 3t); uv là toạ độ trên texture gốc của skin.

| Hiệu ứng (keyword) | Công thức | Skin |
|---|---|---|
| Rung (SHAKEUV) | uv += 0.01·sin(t/20·speed·500·(x, y)) | NegativeOnes ×3 |
| Glitch (GLITCH) | kênh lục lệch 0.02·amount·r1³·r2³·r3; ô ngẫu nhiên 24×19 và 38×14 (×size), đổi 12 lần/giây | Hologram ×3, ChromaticLot ×3 |
| Tách màu (CHROMABERR) | đỏ ở uv.x + 0.1·amount, lam ở −; alpha = max(aG, max(aR, aB)·alpha) | 6 skin trên |
| Nhấp nháy (FLICKER) | bật = fract(3t·freq + 0.05) ≤ 1 − percent; A = clamp(A·bật + alpha)·A | Hologram ×3, RainbowLovers ×3 |
| Sọc hologram (HOLOGRAM) | s = fract((v + fract(t/20)·speed)/(stripes + unmod)); alpha 1 dưới unmod, rồi min + (s − unmod)·(max − min) | Hologram ×3, WaveParty ×3 |
| Sóng tròn (ROUNDWAVEUV) | uv += sin((t·speed·0.1 − dist)·66.67)·strength·0.1 | WaveParty ×3 |
| Viền méo (OUTDIST) | bán kính viền = width + (noise − 0.5)·0.2·amount, noise trôi theo fract(t/20·speed) | 20 skin (GlowInTheDark, ColdFire, Poisonous, Diabolical, Goldies, Overpowered…) |
| Viền texture (OUTTEX) | màu viền × texture cầu vồng trôi × 2·OutlineGlow | ChromaticLot ×3, RainbowLovers ×3 |

- 35/51 skin có phần động. Glow theo shader: rgb·(1 + a²·Glow·GlowColor), thay cho mức cộng 1/10 cũ (icon shop sáng hơn trước).
- Viền theo bề rộng thật của shader (`_OutlinePixelWidth` làm tròn xuống, hoặc `_OutlineWidth`·200 texel) × 2·OutlineGlow, mảnh hơn bản nướng cũ.
- `js/fx.js` + `js/custom.js`: skin động trả `frames[tên]` là canvas của thời điểm hiện tại.
  - Mỗi khung chỉ vẽ lại khi có nơi đọc, tối đa 30 lần/giây (đo ~24 lần/giây khi chơi). Không nơi gọi nào phải sửa.
  - Rung chỉ dời pivot. Skin tĩnh vẫn nướng một lần.
- Nạp lười, chỉ khi skin hiệu ứng được dựng: `art/fx/anim.json` (4.4 KB, 1 KB gzip), `art/fx/noise.webp` (8 KB, chỉ cho viền méo),
  `art/fx/outline.webp` (0.5 KB, chỉ cho viền cầu vồng). `data/meta.json` không đổi byte nào.
- `[ĐỀ XUẤT]`:
  - Hoa văn bám texture gốc bắt đầu ở góc dưới trái của sprite, vì vị trí của sprite trong atlas gốc không còn.
  - Phép thử viền: điểm đặc đầu tiên theo mỗi hướng lấy mẫu nằm trong bán kính.
  - Skin xám: glitch trộn sau khi tô xám.
- Không clip nào có skin biến thể, nên chưa có cặp gốc|web. Ảnh web: `shots/stickman-hook/skinfx-*.png`.

## Hạt của trail (2026-10-29, rev 20261028l)

`tools/build_trails.py` đọc prefab trail: `Renderer` (TrailRenderer, order −5) và `BaseFollow` cùng 3 con `BaseSmoke` / `BaseShine` / `BaseFall`.
Mỗi trail ra `data/trailfx/<tên>.json` (0.9-4.2 KB) và `art/trailfx/<tên>.webp` (1.6-12.7 KB; emoji 55 KB).
`js/trailfx.js` chỉ nạp khi trail đang dùng có hạt. 24/26 trail có hạt; `basic` và `pink` không phát hạt nào (emission tắt), nên không có file.

- `PlayerController.DisplayTrail` [asm 0x1206c14..0x1206d3c] gắn prefab làm con của người chơi (scale 0.3).
  Nó được gọi từ `SpawnPlayer` sau `DestroyTrailIfExists` [asm 0x1206894], nên mỗi lần xuất hiện hạt bắt đầu từ trống.
  Về đích không xoá hạt: hạt chạy theo thời gian game, nên chậm lại theo slow-mo.
- Mọi system mô phỏng ở world space, có loop, `emitterVelocity` lấy theo Rigidbody.
  - Hầu hết phát theo quãng đường. Ví dụ fire `BaseFollow`: 11 hạt mỗi đơn vị, sống 0.25-0.35 s, cone 25°.
  - poop Smoke phát thêm 4 hạt/s theo thời gian. burger Fall có burst 5 hạt mỗi 0.5 s.
- Đã port: shape sphere/cone, inherit velocity, trọng lực, limit velocity, noise, size/rotation/colour over lifetime (cả kiểu random giữa hai curve/gradient),
  texture sheet dạng lưới và dạng sprite, stretched billboard, pivot, maxParticleSize, sorting order (hạt order ≤ 0 vẽ trước người chơi, ≥ 1 vẽ sau).
- Scaling Hierarchy (fire, bubble, smoke, goldsmoke, thunder) nhân cỡ và shape với 0.3. Các trail khác dùng scaling Local.
- goldcandy và thunder tắt TrailRenderer, goldsmoke có Renderer inactive: ba trail này không vẽ vạch.
- Material: Mobile Alpha → source-over, Legacy Additive → `lighter`, Additive (Soft) → `screen`, Legacy Alpha → màu × 2 · tint.
- `[ĐỀ XUẤT]`:
  - Tốc ban đầu không nhân scale (như pháo giấy). Dampen tính theo khung 60 fps thật. Noise dùng trường mượt của pháo giấy.
  - fruits: giới hạn cả chuyển động do noise. Không giới hạn thì trái cây văng khỏi màn trong 1 s.
  - Bỏ prewarm, Collision 3D, External Forces. thunder `BaseShine` (stretched, vận tốc 0) bỏ.
- Chưa có clip gốc dùng trail khác mặc định. Đã so với icon shop của từng trail.

## Heo đất đầy: thanh bộ sưu tập (2026-10-29, rev 20261028l)

`PiggyBankPopup.Fill` khi tiến độ > 99 [asm 0x1178194..0x11785dc]:

- `PiggyBankSkin.AnimateUnlock`: skin hiện màu sau một chớp trắng. Web cũ để tím tới khi mở.
- Tìm bộ sưu tập của skin (`CollectionsMap`), `CollectionProgressBar.InitializeElements` [asm 0x11f3c10], rồi bật thanh.
- Bật `ActionButton` UNLOCK, `Task.Delay(600)` [asm 0x117854c], rồi bật NextButton (LOSE IT).
- Thanh (`CollectionProgressBar`, 322 × 170 ở (0, −265) quanh tâm):
  - Khung `rounded_square` #103D7580, giãn theo nội dung. Clip 0:21.5 đo được ~540 × 180.
  - Tên bộ sưu tập Junegull 38.3. Mỗi item một `CollectionProgressElement` 77 × 84 (`rounded_square_shadow_bottom`), nối bằng dây trắng.
  - `IconValidate` cho item đã có (chỉ số < số đã có, `GetNbItemsClaimedInCollection`), `IconValidateSlot` cho phần còn lại.
  - Đủ bộ: `Icon_Validate` vàng và chữ "Completed!" #FFC327.
- Mở xong thì thanh đếm thêm skin vừa có.
- `[ĐỀ XUẤT]`: chớp trắng 0.4 s; khoảng cách 107 đơn vị giữa ô (đo trong clip, 4 ô), thu lại cho vừa 500 đơn vị khi bộ dài hơn.
- Nút VIP Skip: có từ 20261028m.

## Quảng cáo có thưởng và IAP (2026-10-29, rev 20261028m)

Luật của chủ dự án: mọi nút xem quảng cáo và mọi nút mua bằng tiền thật hiện như bản gốc, bấm vào là nhận ngay. Không có video giả, không trừ tiền.

- Code: `js/ads.js` (luật, không DOM), `bonus.buy` (bấm một ưu đãi), `cardsui.js marketSections` (cả Chợ), `endgame.js` (heo đất), `race.js`, `pachinko.js`, `menus.js` (Tuỳ biến), `daily.js`.
- Dữ liệu: `data/ads.json` (15 KB, `tools/build_ads.py` từ `market`, `view_templates`, `requirements`, `ads.placements` của remote settings), nạp cùng `bonus.json`.
- Art: `art/m-ads.webp` (39 KB: AdIcon, vé, VIPButtonSmall_01, vương miện, widget VIP / Welcome / No Ads), `art/m-market.webp` (195 KB, chỉ khi mở Chợ), `art/skip-ad.webp` (3 KB). Sprite xuất bằng `export_named.py` vào `D:/stickman-hook-ref/sprites_ads`.
- Màn đầu không nạp gì trong số này: 596 KB thô (trước 595 KB; `main.js` thêm `ads.json` vào `loadBonus`, `save.js` thêm `installed`, `meta.js` hai cách mở khoá `rewarded`, `vip`).
- Bản ghi asm: `D:/stickman-hook-ref/dump/asm/ads/`.

**Luật quảng cáo gốc** (mọi chỗ đặt quảng cáo dùng `rewarded.default`):

- `AdController.SafelyDisplayAd` [asm 0x2dfae04]: có `flag.old_no_ads` thì bỏ qua miễn phí (`FREE_SKIP` [asm 0x2dfafcc..0x2dfb04c]).
  Không thì vé bỏ qua ≥ giá (1) là trừ 1 vé, không chiếu quảng cáo (`PAID_SKIP` [asm 0x2dfb1c4..0x2dfb208, 0x2dfb3ac]). Còn lại mới chiếu quảng cáo.
  - Web (`ads.js watch`): giữ y hai nhánh đầu. Nhánh chiếu quảng cáo thành nhận ngay. Vậy **có vé thì vẫn trừ vé**, như bản gốc. Không có vé thì miễn phí.
- Icon nút (`NoAdsIconChanger` [asm 0x1130554], `RewardedButton.UpdateView` [asm 0x1130d00]): vương miện VIP cũ khi `flag.old_no_ads`, vé khi có ≥ 1 vé, còn lại `AdIcon`.
- `AdsService.CanSkip` [asm 0x2df25c4] là số vé **> giá**, không phải ≥ [asm 0x2df2724..0x2df2730]. Nên có đúng 1 vé thì nút bỏ qua màn vẫn mang ảnh quảng cáo
  (`SkipButtonView.Initialize` [asm 0x12a3910..0x12a3968]) và nút VIP Skip vẫn hiện, dù bấm thì vé đó vẫn bị trừ. Web làm y vậy (`ads.js canSkip`).
- Nút VIP Skip (`ActionButton.ShouldShowNoAdsButton` [asm 0x12649fc]): trạng thái quảng cáo, `CanSkip` sai, `flag.vip` < 1. Nó là `VipOfferWidget`: ẩn khi không còn ưu đãi VIP nào hiện (`GetVipOffer` [asm 0x11927c8], `OnEnable` [asm 0x119274c]).
- Giới hạn giữ như bản gốc: Lucky Drop 1 miễn phí + 2 quảng cáo mỗi ngày; sự kiện 1 + quảng cáo không trần; Đua 2 + quảng cáo không trần (`game_modes`); bỏ qua màn theo thẻ `skip_level`; xu quảng cáo 1 lần mỗi ngày (`daily.rewarded_coins`). Các chỗ khác không có trần.

**Bảng chỗ đặt quảng cáo** (mọi nơi gọi `AdsService.ShowRewarded`, `tools/callers.py`):

| Chỗ đặt | Nút gốc | Thưởng | Web |
|---|---|---|---|
| `rewarded.skip_level` (`SkipButtonView` [asm 0x12a3fb8]) | `SkipButton0001` / `SkipButtonTicket_01`, "n/ngày" | Qua màn, như hoàn thành | Nút bỏ qua trong màn (`bonus.js skipView`) |
| `rewarded.` + `_unlock` (`PiggyBankPopup.WatchRewardedToUnlockSkin` [asm 0x1179a30]) | `OutlinedButtonGold` AdIcon "UNLOCK" | Skin heo đất | Màn heo đất (`endgame.js`) |
| `rewarded.` + `_fill` (`WatchRewardedToAddProgression` [asm 0x11796d0]) | `OutlinedButtonGold` AdIcon "+30%" | +30 tiến độ (`fillConfigs.rewarded`) | Màn heo đất |
| `rewarded.one_more_card` (`BoosterOpeningPopup.LaunchRewarded` [asm 0x114533c]) | `OutlinedButtonGold` "+1 Card" AdIcon | Thêm 1 lượt rút | Popup mở gói thẻ (`cardsui.js`) |
| `rewarded.play_ticket_mode_pachinko` (`TryPlaying` [asm 0x12984f8]) | `PlayRewarded` AdIcon | 1 lượt (tối đa 2/ngày) | Khung "Giới hạn hôm nay" của Lucky Drop |
| `rewarded.play_ticket_mode_seasonal` | `PlayRewarded` AdIcon | 1 lượt, không trần | Bảng chọn màn sự kiện |
| `rewarded.play_ticket_mode_tournament` | `RewardedPlayButton`: AdIcon "+1" Ticket | 1 vé đua, chơi ngay, không trần | Trang Đua |
| `rewarded.tournament_finish_level` (`TournamentEndGamePage.WatchRewarded` [asm 0x1224520]) | "Claim +N" | + `skinCoinsMultiplier` (4, prefab `TournamentEndGame`) × xu của cuộc đua, nguồn `finish_level_tournament_rewarded` [asm 0x1224784, 0x12247a0] | Màn kết thúc Đua |
| `rewarded.tournament_claim` (`FinishedTournamentPopup` [asm 0x1236ffc]) | "Claim" / "Claim x{N}" | Xu thưởng hạng × 1.2, làm tròn chẵn (`TournamentService.ClaimRewards` [asm 0x1190b5c], [asm 0x12bb32c]) | Trang Đua khi bảng ngày cũ đóng |
| `rewarded.customization_unlock` (`ShopItemUI.OnClickAsync` [asm 0x11ee67c]) | Ô khoá "Watch a Rewarded" | Mở item, 1 quảng cáo mỗi item (`SetQuantity` [asm 0x11ee76c]); 12 skin common | Tuỳ biến: bấm ô có AdIcon |
| `offer.rewarded_coins` (`MarketPurchaseController.TryMakePurchase` [asm 0x2f62578]) | `ButtonOrange` "get" AdIcon | 50 xu, 1 lần/ngày | Chợ, mục Coins |
| `rewarded.customization_incentive` (`IncentiveRewardedSkinUnlockPopup` [asm 0x11f41d4]) | Popup "Get {N} XP" | 1 skin "rewarded" | **Chưa làm**: hệ prompt cuối màn (`end_game_optional_set`) chưa có ở web |

Không có quảng cáo nhân xu ở cuối Phiêu lưu hay Lucky Drop. `TryShowInventive` của Phiêu lưu là popup ưu đãi mỗi 5 ván, không phải quảng cáo (chưa làm).

**Bảng IAP** (`market.offers` có `paymentType` IAP; bấm là nhận ngay qua `Shop.buy`, từng dòng nội dung riêng như `giveRewardsIndividually`):

| Ưu đãi (sản phẩm) | Nút / chỗ gốc | Nhận | Giá hiện `[ĐỀ XUẤT]` | Web |
|---|---|---|---|---|
| `offer.vip` (`offer_vip`) | Widget "VIP Bundle", thẻ Special Offers, VIP Skip ở heo đất / Đua | `flag.vip`, `flag.no_ads`, 3000 xu, 60 vé, 9 skin, 3 dây, 3 vệt, 3 gói legendary | 19.99$ (gạch 49.97$, nhãn "+150%") | Trang chính, Chợ, heo đất, Đua |
| `offer.vip_discount` (`offer_vip_discount`) | Như trên, khi đã có No Ads | Như trên, bỏ 3 skin của Welcome nếu đã mua | 14.99$ (gạch 37.48$, "+150%") | Như trên |
| `offer.welcome_offer` (`offer_welcome_offer`) | Widget, thẻ "Welcome Offer!" (ngày chẵn kể từ lúc cài) | `flag.welcome_offer`, `flag.no_ads`, 2500 xu, Pigeot / Shark / Vampire, 1 gói epic | 4.99$ (gạch 14.68$, "+195%") | Trang chính, Chợ |
| `offer.no_ads` (`offer_no_ads`) | Widget "No Ads", thẻ (ngày lẻ) | `flag.no_ads` | 3.99$ | Trang chính, Chợ |
| `offer.boosters_pack` (`offer_booster`) | Thẻ "Boosters Pack" (cần có thẻ, một lần) | `flag.booster_pack`, 2 gói common, 2 epic, 2 legendary | 9.99$ (gạch 27.75$, "+180%") | Chợ |
| `offer.adventure_1` / `_2` (`offer_adventure_1/2`) | Thẻ Adventure (khi đã mở Phiêu lưu; gói 1 mỗi tuần) | 15000 token + 3000 xu / 30000 token + 5000 xu | 2.99$ / 4.99$ | Chợ |
| `offer.coins_1..4` (`offer_coins_1..4`) | `MarketOfferSingleItem` | 1000 / 3000 / 15000 / 40000 xu | 0.99$ / 2.99$ / 9.99$ / 19.99$ | Chợ, mục Coins |
| `offer.skip_tickets_1..3` (`offer_skip_tickets_1..3`) | "Get the rewards without watching the ads" (ẩn khi có `flag.old_no_ads`) | 20 / 60 / 140 vé | 1.99$ / 4.99$ / 9.99$ | Chợ, mục Skip Tickets |
| `offer.boosters_1..3` (`offer_boosters_1..3`) | Mục Boosters "Get new cards !" (mua cần có thẻ) | 1 epic / 1 legendary / 5 legendary | 1.99$ / 4.99$ / 19.99$ | Chợ, mục Boosters; gói mở popup ngay |
| `offer.old_no_ads` (`NoAds`) | Không hiện (`displayRequirementId` "disabled") | `flag.no_ads`, `flag.old_no_ads`, `flag.vip` | 3.99$ | Không có nút, như bản gốc |

- **Giá:** APK không có giá nào. `IAPConfig` (data.unity3d) chỉ có mã sản phẩm và `otaPrice` 0; chữ "0.99$" / "5.99$" trong prefab là chữ mẫu. Giá do cửa hàng gửi lúc chạy.
  Cả cột giá ở trên là `[ĐỀ XUẤT]`, viết theo dạng "0.99$" của prefab (`tools/build_ads.py USD`).
- Nhãn giảm giá (`MarketDiscountPercentageDisplayer.Initialize` [asm 0x2f6b410]): ẩn khi `discount` < 1, còn lại "+{5 × round(20 × (1/(1 − d/100) − 1))}%". Giá gạch = giá / (1 − d/100).
- Chợ dựng theo `market.sections` đúng thứ tự: Special Offers (#FDC202), Boosters, Black Market, Coins, Skip Tickets (#25BFFE).
  Thẻ `MarketSpecialOfferCard` (nền, minh hoạ, ô thưởng `MarketSpecialOfferRewardHolder`, thanh dưới có tên và nút giá) và `MarketOfferSingleItem` 180 × 250 (màu nền theo `view_templates`, số lượng, nút Free / Rewarded / IAP / "available in").
- Widget trang chính (`MarketWidgetsHolder`): mọi ưu đãi đang hiện có `viewWidgetId`. Welcome / No Ads luân phiên theo ngày kể từ lúc cài
  (`every_2d_since_install_before_1d` / `_after_1d`, chu kỳ 2 ngày, khoảng 1 ngày).

**VIP và No Ads làm gì trong code** (`flag.vip`, `flag.no_ads`; tìm mọi nơi đọc chuỗi bằng `strxref.py`):

- `flag.vip` không đổi lượng thưởng nào (`GameResourcesService.OnCurrencyEarned` chỉ bỏ popup cho nguồn `vip`). Nó ẩn nút VIP Skip, widget VIP, nút VIP của `RewardedButton` và popup VIP của Phiêu lưu.
- `flag.no_ads` chỉ tắt quảng cáo xen ngang (`freeSkipRequirementId` has_no_ads của `interstitial.*`); web không có quảng cáo xen ngang. Nó ẩn widget và thẻ Welcome / No Ads, đổi VIP sang `offer.vip_discount`.
- Quảng cáo có thưởng **vẫn còn** sau khi mua VIP: chỉ `flag.old_no_ads` mới bỏ qua miễn phí. Cái VIP thật sự đổi là 60 vé, nên các nút quảng cáo chuyển sang icon vé và trừ vé.
- Lưu: cờ ở `save.flags`, giới hạn `daily.*` / `weekly.*` ở `save.periodic`, mốc cài ở `save.installed` (bản lưu cũ nhận mốc lúc đọc lần đầu, `[ĐỀ XUẤT]`).

Tự đặt, có nhãn `[ĐỀ XUẤT]`:

- Giá USD ở bảng IAP.
- Ngày kể từ lúc cài tính theo nửa đêm giờ máy; tuần (`weekly.adventure_starter_pack`) bắt đầu thứ Hai như tuần Phiêu lưu.
- Nút VIP Skip trên trang Đua hiện cùng luật với heo đất (`vipSkip`). `TournamentPage.UpdatePremiumButtonDisplay` chỉ xét `flag.old_no_ads`; chỗ gọi `CanSkip` trong `UpdateStaticUI` chưa đọc.
- Bảng ngày cũ chờ bấm Claim (lưu `modes['mode.tournament'].claim`); bản gốc hiện popup ngay khi vào trang.

Bẫy:

- `py tools/build_meta.py` và `build_cards.py` đã bỏ giá xu của gói vé / gói thẻ. Chạy lại `build_meta.py` chỉ đổi `bonus.json` (đã so md5 mọi file khác).
- `uikit.spr` kéo giãn sprite theo hộp. Ảnh cần giữ tỉ lệ dùng `uikit.fit` (mới export).
- Script vá viết bằng heredoc làm hỏng regex `\n` trong JS (thành xuống dòng thật). Viết script vá bằng Write.

## Bẫy đã sập

- **Ngân sách 600 KB của màn đầu.** Bản cũ đã nạp 585 KB, nên thêm `meta.json` là vượt.
  - Đã gỡ trường `spawns` không dùng và các trường bumper `null`.
  - Đã bỏ tint cố định của material theme, nạp tiếng ở lần chạm đầu, nạp `fx.js` động.
  - Lúc đó còn 585 KB, sau khi thêm chế độ phụ là 589 KB. Thêm gì vào màn đầu thì đo lại bằng bài kiểm tra.
- **Ngân sách 600 KB lần ba (2026-10-28h).** Atlas thêm vòng nét đứt, 11 khung FX_Spawn và nút pause (+16 KB).
  - `levels.json` bỏ `sh` khi trùng bóng hay gặp nhất của sprite và `o` khi bằng 0 (`build_data.py pack_defaults`, `level.js unpackDefaults`): −48 KB.
  - Khung FX_Spawn để nửa độ phân giải, alpha 16 mức (28 KB → 12 KB). Màn đầu còn 576 KB.
  - `sh: 0` nghĩa là "sprite này thường có bóng nhưng item này không". Đọc `levels.json` trực tiếp thì phải gọi `unpackDefaults`.
- **CSS `canvas { position: fixed }` áp cho mọi canvas.** Canvas xem trước trong shop đã phủ kín màn hình và chặn nút đóng. CSS giờ chỉ nhắm `#cv`.

- **Pháo giấy tưởng là của UI.** `ConfettisLeft` nằm trong thư mục UI và có scale 0.3, nên vòng trước bỏ qua.
  Đọc `PlayerController.confettisPrefab` trong `grapple_raw.json` mới thấy đúng nó. Cấu hình Normal không chứa Player, phải đọc qua bundle cấu hình Grapple.
- **Nhân tốc pháo giấy với scale 0.3 làm đám mây bé ba lần.** Clip 2019 và 2026 cho thấy tốc 50-100 không đổi, dampen theo khung thật.
- **Ảnh n02 "zoom sai" là chụp sớm.** Cảnh chụp cũ lấy +0.25 s ở màn 1. Đối chiếu clip phải đo giờ qua vạch (chữ STAGE hiện) trước, rồi chụp cùng độ trễ.
- **Khung gốc n03 lúc 0:14.9 là cảnh khác** (clip cắt sang người nhảy dù). Đã dời sang `parity/ref_off/`.
- **heredoc của bash vỡ với template literal có `${...}` dài.** Viết script vá bằng Write.

- **Gốc prefab lệch.** 30 pattern Finish có gốc ở x=37. `Instantiate` rồi gán `transform.position` sẽ bỏ vị trí gốc.
  - Lần đầu mình cộng vị trí gốc vào mọi thứ, nên cả đoạn cuối màn bị đẩy xa 37 đơn vị: bot thấy một khoảng trống không thể qua.
  - `build_data.py` giờ bỏ vị trí gốc, giữ xoay và scale.
- **`End_Solo12` bị tắt** nhưng vẫn được đọc vị trí. Nếu bỏ qua object tắt thì màn 6 mất điểm nối.
- **Ảnh `GradientVertical` mờ dần ở hai mép.** Kéo giãn cả ảnh sẽ ra sọc ở mép phải màn hình, nên chỉ lấy cột giữa.
- **`data.unity3d` không có typetree.**
  - `CameraConfig` đọc thô: byte 44 trở đi là `0.01, 5, 15`.
  - `Physics2DSettings` đọc thô: gravity ở byte 4.
- **Bot kẹt ở Challenge 1 (x 12 trên 91) không phải lỗi bot.** `STARTU031` có 24 đơn vị không có điểm móc. Người chơi lăn xuống máng rồi được ba bumper bắn đi.
  - Ba bumper đó bật `forceBounce`: chạm vào thì vận tốc thành `forceImpulse / khối lượng` = (25, 12.5) [asm 0x11ffdf8..0x11ffe24].
  - Normal không có bumper nào bật cờ này, nên `physics.js` chưa làm luật đó. Giờ đã làm. 6 màn Challenge kẹt vì thiếu luật này.
- **Bể ngẫu nhiên của Grapple có pattern trùng.** Vị trí 18 là `STARTU000`, không phải `STARTU018` như Normal. Bể có 11 chỗ trùng như vậy.
  - Lúc đầu tưởng `extract_mode.py` đặt tên sai. Đọc PPtr thì thấy cấu hình gốc trỏ đúng cùng một object, nên giữ nguyên.
  - Bỏ chỗ trùng sẽ đổi kết quả của `NetRandom`.
- **Ngân sách 600 KB lại chạm trần.** Atlas thêm bumper nhỏ (+5.6 KB) và `modes.js` đẩy màn đầu lên đúng 600 KB.
  - `build_data.py` giờ ghi số nguyên dạng `1` thay vì `1.0`. Giá trị trong JS không đổi, `levels.json` nhẹ đi 12 KB, màn đầu còn 589 KB.
- **`py -3 -I` bỏ qua `PYTHONIOENCODING`** (cờ `-I` kéo theo `-E`). In tiếng Việt thì dùng `py -3 -I -X utf8`.
- **Chữ "challenge 12" đè nút ☰ và ♪** ở màn hình 390 px. HUD giờ thu cỡ chữ cho vừa khoảng trống giữa hai cụm nút.
- **Màn khó không phải lỗi vật lý.** Màn 12 phải móc từ xa khoảng 9 đơn vị ngay khi rời máng. Màn 41 phải lăn quanh vòng tường bao điểm móc.
  - Bot ban đầu không làm được hai việc này. Đừng sửa vật lý để bot qua màn.

## Kiểm

```sh
node test/stickman-hook-sim.js
```

Bot chạy trên chính `physics.js`, có quay lui theo từng cú móc. Camera dọc 9:16. Nó phải qua hết các màn sau:

- Normal: 64 màn cố định và 30 màn ngẫu nhiên (65, 72, …, 268).
- Grapple: 41 màn cố định và 10 màn ngẫu nhiên (42, 49, …). Bot dùng `GrapplePlayer`, coi lúc tự nhả là lúc nhả tay.
- Challenge: 30 màn. Mỗi sự kiện: 5 màn.
  - Ở hai chế độ này bot có thêm hai nước: chờ rơi xuống bumper rồi mới móc, và móc điểm nằm phía sau.
  - Nếu không tìm ra đường thì thử lại với beam và số lần thử gấp 2, rồi gấp 3. Challenge 11 cần mức gấp 3.
  - Lý do: vài màn Challenge đặt điểm móc đầu tiên sau chỗ xuất hiện, hoặc bắt rơi qua máng bumper trước.
  - Một cú móc dò vét cạn (giữ ở giây a, nhả ở giây b) đã đi xa được ở các màn bot kẹt, nên đó là giới hạn của bot, không phải lỗi dữ liệu.

- Đua: 21 map, mỗi map xuất phát từ cả 5 ô (`SH_RACE_SLOTS=one`: map n chỉ từ ô (n − 1) mod 5).

- Phiêu lưu: `URandom` khớp số của libunity, 8 tầng, chuỗi pattern / vùng gió / cổng / loại vật thể của seed 1792800, giá trị kỹ năng, giá nâng cấp,
  cổng (20 m/s, vận tốc ra), tường lửa (chờ 3 s, kéo dây 30 m). Bot beam search với kỹ năng cấp 0 (dây 3 m) phải đi được `SH_ADV_GOAL` m (mặc định 500)
  trên ba seed tuần cố định. Phần này mất khoảng 4 phút.

Mất khoảng 20 phút, riêng phần Đua khoảng 30 giây. `SH_MODES=grapple,challenge,race,adventure` để chạy riêng vài chế độ.

```sh
SH_URL=<Pages> node test/stickman-hook-play.js
```

Bài kiểm này chạy trên trình duyệt thật: mở game, móc, về đích, chuyển màn.
Phần meta: +10 XP sau màn 1, theme màn 6 khác màn 1, nhận Đường XP, mở Tuỳ biến, trang bị skin/dây, sheet skin được nạp và vẽ, skin biến thể, danh sách chế độ.
Phần chế độ:

- Sự kiện mở sau Normal màn 10, có màu theme riêng. Qua màn 1 thì được skin, chạm thì sang màn 2.
- Với 3000 XP, Grapple và Challenge mở. Màn 1 của mỗi chế độ nạp đúng pattern và màu theme. Cú móc Grapple kéo thẳng rồi tự nhả.
- Challenge hiện 30 màn, mở 4. ↻ giữ chế độ. Qua màn mở cuối thì quay về bảng chọn màn. Quay lại Normal.
- Màn đầu không nạp `mode-*.json` hay `grapple.js`.
Phần vòng quay, heo đất, Chợ, bỏ qua màn:

- Màn 1 nạp heo đất thêm 10. Vé đang chờ trong `pending` được trả. Booster chờ tới trang chính, ở đó gói epic mở trong popup.
- Hàng Lucky Wheel của Chế độ mở vòng quay. Lần đầu miễn phí, dừng ở ô 45 là Potatoz và nhận được.
- Lần sau giá 500 xu, không có xu thì bị từ chối. Có 500 xu và `Math.random` = 0 thì ra Tiki.
- Chợ: +20 xu một lần, cùng ngày bấm lại không được, sang ngày khác thì được. (Từ 20261028m: gói 20 vé là nút IAP, xem phần rev 20261028m.)
- Heo 90 qua một màn thành 100, mở bằng quảng cáo (trả bằng 1 vé đang có) ra Stick Frog, màn sau chỉ +3.
- Chưa có thẻ `skip_level` thì không có nút bỏ qua. Có 1 thẻ (cấp 1) thì chết một lần hiện nút "1/1": bấm là quảng cáo (trừ 1 vé đang có) và qua màn 15. Màn sau chết không còn nút.
- Trang chính có ô vòng quay "xu/500" và số vé.

Phần Đua (`Math.random` = 0 lúc dựng cuộc đua, nên map, ô và ghost là cố định):

- Hàng Đua của Chế độ mở trang bảng xếp hạng 10 dòng, còn 2/2 lượt miễn phí. `race.js` và `mode-race.json` chỉ nạp lúc này.
- Cuộc đua 1: map `RaceTest`, ô 0 ở (0.08, 4.33), 3 ghost Ninja 24.915 s, Harry 27.333 s, Mommy 39.895 s, mỗi ghost có sheet skin của nó.
- Ghost Ninja nằm đúng mẫu bản ghi: (0.08, −3.67) lúc 0.04 s, (9.86, −4.37) lúc 1.04 s, (32.95, −0.83) lúc 3.04 s. Trong cuộc đua thật mọi ghost đều di chuyển.
- Về đích lúc 26 s, sau ghost 24.9 s: hạng 2, +7 xu, +5 cúp, map 1 đã đạt. Màn kết thúc ghi "Hạng 2/4", "+7 xu", "+5 cúp".
- Cuộc đua 2: map 2, 4 ghost. Cả 4 về trước thì bị ép về đích thứ 5: +1 xu, +1 cúp.
- Hết 2 lượt miễn phí thì nút quảng cáo "+1": không có vé vẫn chơi ngay (rev 20261028m).
- Bảng ngày 28/10/2026 (mốc 1793120400000): seed 2119037, ba AI đầu HBK-Taker2 / Player1935 / Zeus, bảng lúc 12 giờ trưa đúng từng điểm. Hạng 7 được 20 xu, hạng 8 được 15 xu.
- Bảng hai ngày trước với 100 cúp: mở trang thì chốt hạng 1, nhận 1000 xu và Dolphin, thắng 1, chơi 1, bảng mới có 0 cúp.

Phần Phiêu lưu:

- Hàng Phiêu lưu mở trang: 6 kỹ năng cấp 0/20 tiếng Việt, đường kỷ lục từ 1 m, top 10 + dòng của mình. Code, pattern, ảnh chỉ nạp lúc này.
- Cùng seed thì cùng đường (1792810: `INITIAL000` có cổng ở (1.89, 2.59), `NewEasyLow (2)` có gió kéo xuống ở x 18.874), seed khác thì khác.
- Lượt bắt đầu ở (0.86, 6.27), dây 3 m, tường lửa đứng ở x 0.
- Gió: 10 bước từ đứng yên, lên (10, 3) ra v (0.9, −1.888), xuống (−3, −1.5) ra v (−0.27, −2.293).
- Cổng: bay tới 1 m trái một điểm xuất hiện của pattern 1–2 phía trước, mờ 0.3, tới nơi thì rõ lại, cổng đóng.
- Tường lửa bắt kịp ở 123 m: màn kết thúc ghi "Tường lửa bắt kịp bạn", +123 xu, đường kỷ lục +800 xu, kỷ lục 123, đã ghi vào `localStorage`.
- Mua 1 cấp độ dài dây giá 100 xu, lượt sau dây dài 4.455 m.

Nó cũng kiểm màn đầu không nạp quá 600 KB, không nạp ảnh shop và không nạp `bonus.js`, `bonus.json`, ảnh vòng quay/heo/nút bỏ qua, `endgame.js`, `ui.webp`, `ui.json`, `race.js`, file ghost, `race.webp`, `adventure.js`, `advrun.js`, `adventure.webp`.

Phần thẻ bài (`js/cards.js`, `js/cardsui.js`):

- Màn đầu không nạp `cards.js`, `cardsui.js`, `cards.json`, `m-cards.webp`, `m-boost.webp`. Booster `pending` mở trong popup khi trang chính hiện.
- Rút có seed: welcome booster ra đúng 5 thẻ bảo đảm, perk 4. Epic booster token `0123…cdef` (độ hiếm thử bằng 0.1) ra
  `finish_line_xp_boost_grapple:1 (mới), shop_free_coins_boost 18 + 20, pachinko_x10_multiplier 16, skip_level 17`. Thẻ lẻ common ra 14 Shop Free Coins Boost.
- Cấp thẻ: 0/1/30/31/271 thẻ skip = cấp 0/1/1/2/10. Popup cấp đúng thứ đã hiện. Trang thẻ: 7 nhóm, 33 thẻ, 29 khoá, perk 4/330.
- Hiệu ứng: skip cấp 2 cho nút "2/2". Second Chance tối đa (25 %, Random 0) hồi sinh ở đầu màn với đếm ngược, không tính chết.
  Finish Line XP cấp 1: màn Normal +11 XP. Daily Coins Boost Đua tối đa: +2 trên 100 xu, rồi 0. Shop Free Coins cấp 1: 22 xu.
  Extra Lucky Wheel: một lượt trả 500 xu được thêm lượt quay miễn phí không phát thưởng (1 lần nhận). Rope Length Limit Boost: trần 20 → 28 → 100. Perk 13 nhận Stick Viking.
- Chợ Đen: 3 món + 3 thẻ, hết lượt ở mốc 6 giờ giờ máy. Mua thẻ trừ đơn giá × số thẻ, mua lại bị từ chối. Mua món trả giá cố định.
- Lucky Drop bàn 4 seed 3 với thẻ tối đa: 2 chốt x10, 1 chốt người que (chạm ra người que phụ 10 m/s bay lên), Bumper Resistance giữ chốt khi thử 0.1.

Phần luật theo ngày và Phiêu lưu (rev 20261028k):

- `daily.js`: 29/10/2026 → `2026-10-29`. Lucky Drop: miễn phí, quảng cáo, quảng cáo, rồi từ chối (3/3); hôm sau miễn phí lại, cờ cũ bị xoá.
  Sự kiện: 1 miễn phí rồi quảng cáo mỗi lượt, không trần. Đua 2 miễn phí rồi quảng cáo. Challenge luôn miễn phí. (rev 20261028m: quảng cáo trừ vé khi có, không có vé thì nhận ngay.)
- Vòng sự kiện 5 thưởng: ngày 0 màn 1, nhận xong thì hết hôm nay, ngày 1 màn 2, sau 5 ngày vòng mới với 3 thưởng chưa có (màn 3), có đủ thì xong hẳn.
- Trong trình duyệt: nhận quà Easter hôm nay rồi thì bảng chọn không mở màn nào; đóng bảng thì về Normal. Cờ bỏ qua màn dạng `yyyy-MM-dd`.
- Nâng kỹ năng ngẫu nhiên: 6 kỹ năng mở, Random 0.51 → Độ dài dây, 100 xu; 2 kỹ năng mở → kỹ năng cuối, 180 xu (80 cấp);
  thiếu xu hoặc mọi kỹ năng ở trần thì không trừ gì. Khoảng lặp khi giữ: 0.6, 0.58, 0.52, 0.42, 0.28, 0.1 s.
- Bộ đếm vật thể Phiêu lưu chạy tiếp sang lượt sau trong cùng phiên (lượt 2 cùng seed kết thúc ở gấp đôi lượt 1).
- `test/stickman-hook-pachinko.js`: lượt đầu từ trang Chế độ dùng lượt miễn phí, lượt 2 là quảng cáo (1/3), 2 lượt quảng cáo rồi "Hết lượt" (3/3).
- `test/stickman-hook-sim.js`: vùng chết ở 9:16 là −6.695 / −5.853 quanh tâm camera; bot dùng chung `camera.js deathLimits`.

Phần rev 20261028l (`test/stickman-hook-play.js` 133/133):

- Qua màn 1: popup Đường XP tự mở (10 XP chờ, nút về ẩn), nhận mốc 0 (Lucky Wheel, thẻ Mode, dấu tích), tự đóng: `animating,claimed,closed`.
- 300 XP chưa nhận: Race vẫn khoá. Mở Đường XP thì nhận tới mốc 350 (dây Spiders, 150 xu, Race; thẻ mode,big,small,mode,big,big), lần sau tới 450.
  Không còn XP chờ thì mở để xem, có nút về. Hạng đếm từ 0 (1850 XP = hạng 21).
- 3000 XP: Grapple / Challenge khoá tới khi popup nhận. Nhận xong có 4 màn Challenge cấp (mở 5 màn), XP đã nhận = XP.
- Màn đầu không nạp `trailfx`, `fx.js`, `art/fx/`, `m-road`. Trail fire: 3 system BaseFollow/BaseSmoke/BaseShine (max 1000), 0 hạt lúc xuất hiện, 30-80 hạt sau 0.8 s.
  candy BaseFollow tối đa 100; thunder không vẽ vạch.
- Skin hologram: op động `t,gl,fl,hs,ca,ol`, sọc `[0.069, 0.11, 3.19, 0.43, 1]`, alpha một texel 255 lúc t 10 → 154 lúc 10.5.
  Pixelated Friends vẫn là một lần nướng (`pix 84`). Negative Ones rung pivot 86.77 → 90.11.
- Heo đất đầy: thanh "Aquatic Friends" 0/3; mở xong 1/3.
- `test/stickman-hook-pachinko.js`: 400 XP chưa nhận thì Lucky Drop khoá; trang chính tự nhận nên mở.

Phần rev 20261028m (quảng cáo và IAP; `test/stickman-hook-play.js` 145/145, `test/stickman-hook-pachinko.js` 30/30, `test/stickman-hook-sim.js` 307/307, màn đầu 596 KB):

- Chợ: 5 mục đúng thứ tự; nút IAP 1.99$ / 0.99$, VIP 49.97$ gạch → 19.99$ (+150 %). Gói 20 vé: 3 → 23 vé, không trừ xu. Xu quảng cáo: +50 xu, trả bằng 1 vé (23 → 22), rồi "available in".
- Heo đất 22 vé: icon vé, không có VIP Skip, UNLOCK trừ 1 vé. 0 vé: AdIcon + VIP Skip, bấm là có Ghost, không trừ gì.
- Bỏ qua màn: 21 vé → ảnh vé, trừ 1 vé. 1 vé → ảnh quảng cáo `skip-ad.webp` nhưng vẫn trừ vé đó (`CanSkip` = vé > 1).
- Gói thẻ IAP 1.99$: popup epic mở ngay, thêm thẻ, không trừ xu. "+1 Card" mang icon vé, trừ 1 vé, thêm `one_more_card`.
- Đua: "Claim +28" (4 × 7 xu, vé trả quảng cáo), hết lượt miễn phí thì nút AdIcon "+1" Ticket + VIP "Skip", 0 vé vẫn chơi (lượt quảng cáo 0 → 1 → 2). Bảng cũ: "Claim" / "Claim x1200", bấm quảng cáo nhận 1200 xu + Dolphin.
- VIP từ widget trang chính: `flag.vip`, `flag.no_ads`, 3000 xu, 60 vé, skin / dây / vệt vàng, 3 gói legendary; widget biến mất, cờ lưu trong localStorage; heo đất sau đó không còn VIP Skip, UNLOCK trừ 1 trong 60 vé.
- Lucky Drop: lượt 2 là nút "Chơi" AdIcon, 0 vé vẫn chơi; lượt 3 icon vé, trừ 1 vé; rồi "Hết lượt" 3/3.

Phần HUD và về đích: chỉ có nút pause trong màn; về đích giữ tư thế FINISHED và ẩn nút pause; màn heo đất toàn màn hình rồi trang kết thúc; nút Play mở màn sau; pause dừng màn.
Ảnh chụp nằm ở `shots/stickman-hook/`.

## Tăng số bản

Đổi mọi `?v=` trong `index.html`, `js/main.js` (hằng `V`) và ba `import()` có `?v=` trong `js/modes.js` (`pachinko.js`, `race.js`, `adventure.js`), rồi đổi `rev` trong `data/games.js` cho trùng.
Bản hiện tại: `20261028m`. `js/pachinko.js` có `PV` riêng (`20261028d`) cho ảnh của nó.
Module JS mới phải có dòng trong importmap của `index.html`, kể cả module chỉ nạp động (`menus.js`, `fx.js`, `cards.js`, `cardsui.js`).
