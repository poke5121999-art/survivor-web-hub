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

Chưa làm: thẻ bài, booster, quảng cáo, VIP.

## Cách chơi

- Giữ chuột, chạm màn hình, hoặc giữ Space: móc vào điểm móc gần nhất.
- Thả ra: bay đi.
- Qua vạch caro là xong màn.
- Rơi khỏi mép dưới hoặc mép trái camera khi không móc: chơi lại từ đầu màn.
- `?level=N` mở thẳng màn N, bỏ qua trang chính. Thêm `&mode=grapple` (hoặc `challenge`, `easter_event`, `valentine_day`) để mở màn của chế độ đó. `?mode=tournament` mở trang Đua. Phím `R` chơi lại. Tiến độ lưu trong `localStorage` (`stickman-hook`).
- Nút ★: trang chính, gồm xu, thanh XP (bấm để mở Đường XP), Chơi, Chế độ, Tuỳ biến.

## Tệp

| Tệp | Vai trò |
|---|---|
| `js/level.js` | Ghép màn từ pattern. Có bản port `System.Random` của .NET |
| `js/physics.js` | Thân tròn treo trên lò xo, va chạm capsule/polygon, trạng thái hoạt hình |
| `js/render.js` | Camera orthographic, vẽ sprite từ atlas, bóng, font bitmap |
| `js/main.js` | Vòng lặp, các pha `spawn → play → finish`, camera, HUD, chọn màn, đồ đang dùng, trang chính |
| `js/save.js` | Bản lưu v2: xu, XP, đồ đã có/đang dùng theo loại, mốc đã nhận của từng road, cờ, chế độ |
| `js/meta.js` | Kinh tế gốc: phát thưởng theo bảng loại tài nguyên, chữ mở khoá theo bảng cách mở, XP road, theme |
| `js/custom.js` | Nạp lười `custom.json`, sheet skin, `ropes.webp`, `custom-ui.webp` |
| `js/fx.js` | Nướng hiệu ứng của skin biến thể (nạp chỉ khi cần) |
| `js/menus.js` | Chế độ, Tuỳ biến, Đường XP, vòng quay, Chợ (nạp khi mở lần đầu) |
| `js/bonus.js` | Luật vòng quay, heo đất, xu mỗi ngày, vé bỏ qua, bỏ qua màn; ô trang chính, nút bỏ qua, khung heo đất (nạp lười) |
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
| `tools/build_meta.py` | Tạo `meta.json`, `bonus.json`, `menu.webp`, `wheel.webp`, `piggy.webp`, `skip.webp` từ remote settings mặc định và bundle trong APK |
| `tools/build_font.py` | Nướng font TMP SDF thành bitmap |
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
```

Ghi chú:

- Các script trong `tools/extract/` đọc từ `D:/stickman-hook-ref/tools/`, nên chép chúng về đó trước khi chạy.
- Dịch ngược một method: `py -3 -I tools/arm_method.py 'PlayerHookController\$\$Grab'`.
- `libil2cpp.so` là ARMv7, metadata v31. Il2CppDumper đọc được với `ForceDump`.

## Luật gốc đã dùng

Đo trong prefab và cấu hình:

- Người chơi: thân tròn bán kính 0.1125 (0.375 × scale 0.3), khối lượng 2, trọng lực −9.81 × 1.1, không ma sát.
- Bước vật lý 0.02 s. `physics.js` chia mỗi bước thành 5 bước con.
- Dây: `SpringJoint2D` 3 Hz, giảm chấn 0.5. Độ dài nghỉ = khoảng cách lúc móc − 0.5808.
  - 0.5808 là độ dài anchor chưa nhân scale. Vì thế lúc móc có cú giật nhẹ, đúng như bản gốc.
- Bumper: `BumperMaterial` nảy 1.4, kết hợp kiểu Maximum. Tường không nảy.
- Camera: ortho size 5 (cao 10 đơn vị), y khoá ở 0, x giới hạn giữa `StartCamera` và `EndCamera`.
- Game gốc chơi màn dọc (`screenOrientation = 1`).

Đọc từ mã IL2CPP:

- Chọn điểm móc gần nhất, không giới hạn tầm.
- Nhả dây được đẩy lên 0.15 m/s, tối đa một lần mỗi 0.5 s, và xoay `|v| × 200` độ/s.
- Chạm tường xoay theo tốc độ tiếp tuyến × 200.
- Về đích: thân thành kinematic, thời gian chậm về 5% trong 0.6 s, camera zoom về 2 trong 0.5 s.
- Ghép màn ngẫu nhiên (`PatternSpawner`): mỗi ô Start/Middle/Finish lọc pattern có `entryPositions & lối ra trước != 0`, rồi chọn bằng `new System.Random(chỉ số màn).Next(số ứng viên)`.
  - Mỗi ô tạo một `Random` mới với cùng seed.

Tự đặt, có nhãn `[ĐỀ XUẤT]` vì không có trong code (scene ProCamera2D không có typetree):

- Độ dẫn trước của camera: `vx × 0.2`, kẹp trong ±1.2.
- Vùng chết: ra khỏi mép khung 0.3 đơn vị.
- Hiệu ứng xuất hiện: vòng tròn mờ 0.75 s.

## Pha 1: tuỳ biến và vỏ meta

Mọi con số kinh tế lấy từ `D:/stickman-hook-ref/dump/full/remote_settings_default.json`: bản cấu hình mặc định nằm sẵn trong APK.
emote_settings_default.json`: bản cấu hình mặc định nằm sẵn trong APK.
Bản gốc chạy offline bằng chính bản này.

- **Theme màn.** Cứ 5 màn đổi một bộ màu: `theme.levelColors[floor(màn/5) % 4]`.
  - Đổi màu nền camera, màu bóng, nền điểm móc (`targetsBackgroundColor`), phản chiếu tường (`wallsReflectionColor`).
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
- **Đường XP** (127 mốc): người chơi bấm "Nhận thưởng", nhận lần lượt mọi mốc đã đạt (`ClaimAllRewards`).
  - Thưởng mà hệ thống chưa có (booster, ...) vẫn được ghi vào `save.pending` để pha sau trả, và hiện khoá "sắp có".
- **Mở khoá item.** Một bảng `UNLOCK` (cách mở → điền `{0}` của `textTemplate` gốc, có đạt được ở bản web hay không).
  - Lúc làm Pha 1, bản web chỉ đạt được: mặc định, road XP, road màn Normal. Sau đó có thêm sự kiện, Challenge, Grapple, vòng quay, heo đất (bảng `UNLOCK`, cờ `live`).
  - Các cách còn lại (quảng cáo, VIP, Adventure, Race, pachinko, link ngoài, thẻ) hiện chữ gốc và không có đường mở giả.
  - `tournament` không có trong `unlockConditions`, nên dùng chữ của `leaderboard_prize`.
- **Chế độ.** Normal chơi được. Các chế độ khác hiện "Cần N XP" (theo mốc road phát chế độ đó), Easter/Valentine cần màn 10. Đạt rồi thì hiện "Sắp có".
- **Skin biến thể** (`skin.alien_hologram_travelers`, ...; 51 item): dùng sheet của skin gốc.
  - Material AllIn1SpriteShader của nó được `build_meta.py` rút gọn thành vài phép xử lý điểm ảnh: đổi màu, HSV, swap, xám, âm bản, posterize, gradient, pixel hoá, glow, sọc hologram, viền.
  - `fx.js` nướng các phép này một lần cho mỗi khung hình.
  - Các hiệu ứng động (glitch, nhấp nháy, rung, sóng, dissolve, color ramp) bỏ qua.
  - Skin biến thể có `hasShadow: false` nên không vẽ bóng.
- **Nạp lười.** Màn đầu chỉ nạp thêm `meta.json` (31 KB).
  - Skin mặc định và dây Classic vẫn vẽ từ `atlas.webp`.
  - Khi đổi sang đồ khác mới nạp `custom.json` + sheet skin, hoặc `ropes.webp`.
  - Điệu nhảy về đích nạp sheet của skin đang dùng khi qua màn.
  - Tiếng nạp ở lần chạm đầu.
  - `menu.webp` chỉ nạp khi trang chính hiện, tức là sau khi màn đã sẵn sàng.

Số tự đặt `[ĐỀ XUẤT]`:

- Dây: prefab Rope scale sprite (1.6, 2) dưới một cha không rõ scale.
  - Mình nhân thêm 0.2: ô texture 167 px rộng khoảng 0.4 đơn vị, cạnh dây Classic 0.045.
- Hạng = vị trí (đếm từ 1) của mốc road XP cuối cùng đã đạt.
  - Mã gốc điền `{{level}}` từ trạng thái road, còn template mặc định dùng `{0}`.
- Điệu nhảy bắt đầu sau 0.6 s, lúc slow motion về đích đã xong.
- Pixel hoá: khối `max(2, round(cạnh khung / _PixelateSize × 4))` px.
- Glow: cộng `_GlowColor × _Glow / 10`.
- Ngưỡng đổi màu tối thiểu 0.08.
- Trail lấy mẫu mỗi khi người chơi đi được 0.02 đơn vị, tuổi tính theo thời gian game. Hạt của trail chưa vẽ.

## Chế độ phụ

Mở từ trang chính → Chế độ. Hàng nào đã mở thì có nút Chơi, bấm vào là ra bảng chọn màn của chế độ đó.
Nút ☰, ↻ và màn kết thúc đều làm việc trên chế độ đang chơi. Mọi khác biệt giữa các chế độ nằm trong `js/modes.js`.

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
- Sự kiện mở màn sau theo thứ tự. Bản gốc mỗi ngày cho một màn (`GetLevelForToday`).
- **Không làm giới hạn 1 lượt chơi miễn phí mỗi ngày** của sự kiện, cũng không làm khung ngày của sự kiện. Cả hai do server quyết, offline thì luôn mở.
- Grapple và Challenge mở theo XP đã đạt, không cần bấm nhận thưởng trên Đường XP.

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
  - Hệ thẻ chưa có, nên chúng vào `save.pending` như thưởng booster của Đường XP.
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
  - Mọi quảng cáo có thưởng đều bỏ qua được bằng `skipPrice` của `rewarded.default`: 1 vé bỏ qua.
  - Bản web lấy đúng giá đó: mỗi nút tốn 1 vé.

**Xu miễn phí mỗi ngày**: `offer.free_coins` cho 20 xu.

- Điều kiện là `didnt_buy_free_coins_today` (`daily.free_coins` < 1). Chu kỳ 1 ngày, `isUtc` false, nên ngày tính theo giờ máy.
- `offer.rewarded_coins` (50 xu đổi một quảng cáo) không làm.

**Vé bỏ qua** (`currency.skip_tickets`):

- Trong bản gốc, vé dùng để bỏ qua quảng cáo (`skipPrice` của `rewarded.default`). Bản web không có quảng cáo, nên mọi nút "xem quảng cáo" ở trên đều tốn 1 vé.
- Nguồn vé: gói 20/60/140 vé (`offer.skip_tickets_1..3`). Bản gốc bán bằng tiền thật, bản web bán bằng xu trong Chợ.
- Thưởng `currency.skip_tickets` còn chờ trong `save.pending` được trả lúc khởi động (`Meta.deliverPending`).
  - Đường XP gốc không phát vé, nên thường không có gì để trả. Booster vẫn chờ.

**Bỏ qua màn** (`SkipLevelService`, `SkipButtonView`):

- Nút hiện ở màn Normal sau một lần chết (`SetHasDied`), khi hôm nay còn lượt (`CanSkipLevelToday` [asm 0x124eac8]). Chữ dưới nút là "còn/ngày".
- Số lượt mỗi ngày = hiệu ứng thẻ `card.skip_level` ở cấp thẻ hiện có (`GetNbSkippableLevelsPerDay` [asm 0x124ea20]).
  - Cấp < 1 cho 0 lượt [asm 0x127c668]. Cấp L cho min + bước × (L − 1), tức 1 lượt ở cấp 1.
- Lượt đã dùng đếm trong `flag.nb_levels_skipped_<ngày>` [asm 0x124eb40..0x124eb94]. Cờ của ngày cũ bị xoá (`CleanDailyTokenFlags`).
- Bấm nút = xem quảng cáo `rewarded.skip_level`, ở bản web là trả 1 vé.
  - Sau đó màn được tính là đã qua (`GamePlayService.SkipLevel` → `CompleteLevel` [asm 0x129c96c]): +10 XP, road, heo đất.

Tự đặt, có nhãn `[ĐỀ XUẤT]`:

- Giá gói vé: 50 xu/vé, nên 20 vé = 1000 xu, bằng gói xu rẻ nhất (`offer.coins_1`). APK không có giá tiền của từng gói nên không quy đổi được.
- Cấp thẻ `skip_level`: hệ thẻ chưa làm.
  - Bản web coi là cấp 1 khi đã có `flag.has_welcome_booster`, vì gói chào mừng gốc chắc chắn có thẻ này (`guaranteedCards`). Trước đó là cấp 0.
  - Tức là được bỏ qua 1 màn/ngày từ 550 XP.
- Heo đất chỉ nạp ở lần qua màn đầu tiên, giống XP. Bản web cho chơi lại màn, bản gốc thì không.
- Mã ngày dạng YYYYMMDD theo giờ máy. `FormatDateId` của bản gốc chưa giải.
- Dải quay:
  - Các ô khác lặp lại danh sách thưởng đã xáo. Ô quanh ô 45 không trùng với thưởng.
  - Bắt đầu ở ô 2 và cuộn xuống. Khung tham chiếu 750 × 1334.
  - Nhịp đèn bolt, tốc độ xoay của mặt trời và độ trôi của xúc xắc là tự đặt.
- Heo đất là một khung dưới chữ "completed", không phải popup toàn màn hình, để chạm chỗ khác vẫn sang màn.
- Booster trúng từ vòng quay giữ nguyên. Không đổi sang xu theo `GetFallbackIfNoCardAvailable`, vì hệ thẻ chưa làm.

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
    Bản web theo quy ước chung: mỗi quảng cáo có thưởng = 1 vé bỏ qua. Không có vé thì nút báo cần vé.
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

- Ngày của bảng: nửa đêm theo giờ máy, mã ngày dạng YYYYMMDD. Bản gốc lấy giờ từ server (`OnlineDateService`), và `FormatDateId` chưa giải.
- Tên ghost lấy từ 9 AI của bảng, không lấy tên người chơi. Bản gốc xáo cả 10 người, nên có thể ra chính tên mình.
- Chỗ đứng trên HUD lúc đang đua ("2/4") = số ghost đã về + số ghost đang ở phía trước theo x. Bản gốc không có HUD này.
- Ghost và người chơi về trong cùng một khung hình thì ghost đứng trước (đồng hồ đua chạy trước bước vật lý của khung đó).
- Màu dây ghost lấy màu dây Classic. Độ rộng 0.06 × 0.345 giả định `AAL_square_mini` là hình vuông.
- Màn kết thúc là khung DOM tiếng Việt: hạng, thời gian, xu/cúp, thứ tự cả cuộc đua, hạng trên bảng ngày, nút "Bảng xếp hạng" và "Đua tiếp".
  - Bản gốc dùng ảnh hạng và nút xem quảng cáo nhân xu.
- ↻, phím R và ☰ trong cuộc đua mở lại trang bảng xếp hạng, để không chơi lại free cùng một cuộc đua.

Chưa làm:

- Nút xem quảng cáo nhân xu ở màn kết thúc (`skinCoinsMultiplier` nằm trong prefab, chưa đọc).
- Thẻ `daily_coins_boost_tournament`, `daily_trophy_boost_tournament`, `second_chance_tournament`. Hệ thẻ chưa có.
- Đường VIP `flag.old_no_ads`.
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
  Tổng 564 KB thô, khoảng 220 KB gzip. Màn đầu không nạp gì trong số này (594 KB, như trước).
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
- **Tuần mới** xoá đường kỷ lục (`ResetProgressionRoad` [asm 0x1267e24]) và điểm tuần. Bảng `adventure`: 10000 người, 6 độ khó AI, hạng ≤ 2 tính là thắng.

Tự đặt, có nhãn `[ĐỀ XUẤT]`:

- Tuần bắt đầu thứ Hai 0 giờ theo giờ máy. Bản gốc lấy từ server. Bảng tuần dùng `Board` của `race.js` với thời gian chạy chậm 7 lần.
- Bộ đếm `_targetsCount` / `_bumpersCount` về 0 mỗi lượt. Bản gốc chỉ về 0 khi mở app, nên lượt thứ hai trong cùng phiên của bản gốc ra loại vật thể khác.
- `Target.Start` / `BumperAnimationController.Start` chạy theo thứ tự trong hierarchy, ngay sau khi sinh pattern.
- Camera: như Normal (dẫn trước `vx × 0.2`), y khoá ở 0, không có mép phải.
- Hạt và ánh sáng làm đơn giản: hạt lửa, tia lửa, quầng đỏ, hạt của vùng gió lấy tốc độ phát, thời gian sống, cỡ, màu từ ParticleSystem của prefab, nhưng phẳng 2D và không có Light.
  Cổng dịch chuyển vẽ bằng vài lớp quầng tĩnh. Chưa có clip Adventure của bản gốc để so hình.
- Thưởng đường kỷ lục nhận ngay ở màn kết thúc. Bảng tuần hạng 1 nhận skin từ `reward_pool.adventure_skin` theo cách của Đua.
- Thẻ tăng xu phiêu lưu (ngày, tuần) chưa có vì hệ thẻ chưa có.

Bẫy:

- **Tên pattern trùng với Normal** (`FINISH00`, …) nhưng prefab khác. Pattern Adventure chỉ nằm trong `mode-adventure.json`, không gộp vào `levels.json`.
- **Seed liền nhau của `System.Random` ra pattern xen kẽ** (`NewEasyLow (1)`, `(2)`, `(1)`, …). Đó là đúng bản gốc, không phải lỗi.
- **Đích của cổng phụ thuộc trạng thái chung của `UnityEngine.Random`**, tức là vật thể nào vừa sinh. Bài kiểm trình duyệt kiểm theo luật, không kiểm toạ độ cố định.
- **Renderer nhận bảng toạ độ atlas trần** (`app.atlas.rects`). Bọc thêm một lớp `{rects}` thì không vẽ được người chơi, tường, theme mà không báo lỗi gì.
- **Script vá có dấu `\` viết bằng heredoc của bash bị nuốt mất.** Viết bằng công cụ Write rồi chạy.

## Bẫy đã sập

- **Ngân sách 600 KB của màn đầu.** Bản cũ đã nạp 585 KB, nên thêm `meta.json` là vượt.
  - Đã gỡ trường `spawns` không dùng và các trường bumper `null`.
  - Đã bỏ tint cố định của material theme, nạp tiếng ở lần chạm đầu, nạp `fx.js` động.
  - Lúc đó còn 585 KB, sau khi thêm chế độ phụ là 589 KB. Thêm gì vào màn đầu thì đo lại bằng bài kiểm tra.
- **CSS `canvas { position: fixed }` áp cho mọi canvas.** Canvas xem trước trong shop đã phủ kín màn hình và chặn nút đóng. CSS giờ chỉ nhắm `#cv`.

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

- Màn 1 nạp heo đất thêm 10. Vé đang chờ trong `pending` được trả, booster vẫn chờ.
- Hàng Lucky Wheel của Chế độ mở vòng quay. Lần đầu miễn phí, dừng ở ô 45 là Potatoz và nhận được.
- Lần sau giá 500 xu, không có xu thì bị từ chối. Có 500 xu và `Math.random` = 0 thì ra Tiki.
- Chợ: +20 xu một lần, cùng ngày bấm lại không được, sang ngày khác thì được. 20 vé giá 1000 xu.
- Heo 90 qua một màn thành 100, mở bằng 1 vé ra Stick Frog, màn sau chỉ +3.
- Chưa có thẻ `skip_level` thì không có nút bỏ qua. Có rồi thì chết một lần hiện nút "1/1": bấm là trừ 1 vé và qua màn 15. Màn sau chết không còn nút.
- Trang chính có ô vòng quay "xu/500" và số vé.

Phần Đua (`Math.random` = 0 lúc dựng cuộc đua, nên map, ô và ghost là cố định):

- Hàng Đua của Chế độ mở trang bảng xếp hạng 10 dòng, còn 2/2 lượt miễn phí. `race.js` và `mode-race.json` chỉ nạp lúc này.
- Cuộc đua 1: map `RaceTest`, ô 0 ở (0.08, 4.33), 3 ghost Ninja 24.915 s, Harry 27.333 s, Mommy 39.895 s, mỗi ghost có sheet skin của nó.
- Ghost Ninja nằm đúng mẫu bản ghi: (0.08, −3.67) lúc 0.04 s, (9.86, −4.37) lúc 1.04 s, (32.95, −0.83) lúc 3.04 s. Trong cuộc đua thật mọi ghost đều di chuyển.
- Về đích lúc 26 s, sau ghost 24.9 s: hạng 2, +7 xu, +5 cúp, map 1 đã đạt. Màn kết thúc ghi "Hạng 2/4", "+7 xu", "+5 cúp".
- Cuộc đua 2: map 2, 4 ghost. Cả 4 về trước thì bị ép về đích thứ 5: +1 xu, +1 cúp.
- Hết 2 lượt miễn phí thì trả 1 vé bỏ qua, hết vé thì bị từ chối.
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

Nó cũng kiểm màn đầu không nạp quá 600 KB, không nạp ảnh shop và không nạp `bonus.js`, `bonus.json`, ảnh vòng quay/heo/nút bỏ qua, `race.js`, file ghost, `race.webp`, `adventure.js`, `advrun.js`, `adventure.webp`.
Ảnh chụp nằm ở `shots/stickman-hook/`.

## Tăng số bản

Đổi mọi `?v=` trong `index.html`, `js/main.js` (hằng `V`) và ba `import()` có `?v=` trong `js/modes.js` (`pachinko.js`, `race.js`, `adventure.js`), rồi đổi `rev` trong `data/games.js` cho trùng.
Module JS mới phải có dòng trong importmap của `index.html`, kể cả module chỉ nạp động (`menus.js`, `fx.js`).
