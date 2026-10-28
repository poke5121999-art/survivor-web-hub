# Stickman Hook (web)

Bản web của Stickman Hook (Madbox, Android 9.9.60), dựng lại bằng Canvas 2D, không engine.
Chế độ chơi chính đầy đủ: 64 màn dựng tay của bản gốc, từ màn 65 trở đi ghép ngẫu nhiên đúng như bản gốc, không giới hạn số màn.
Nạp khoảng 215 KB (bản gốc 848 MB).

- Hình, font, tiếng: bóc từ APK, không tự vẽ.
- Màn chơi: bóc từ prefab pattern của `NormalGamePlayConfig`.
- Luật chơi: đọc từ mã IL2CPP đã dịch ngược. Xem `docs/GAMEPLAY.md`, mỗi luật có địa chỉ lệnh ARM đi kèm.

Pha 1 của bản full (kế hoạch: `brain/plans/stickman-hook-full.md`) thêm phần tuỳ biến và vỏ meta, xem mục "Pha 1" bên dưới.
Pha tiếp theo thêm ba chế độ: Mechanical Grapple, Challenge, sự kiện Easter / Valentine's Day. Xem mục "Chế độ phụ".

Chưa làm: các chế độ Adventure/Pachinko/Race, vòng quay, heo đất, thẻ bài, booster, quảng cáo, VIP.

## Cách chơi

- Giữ chuột, chạm màn hình, hoặc giữ Space: móc vào điểm móc gần nhất.
- Thả ra: bay đi.
- Qua vạch caro là xong màn.
- Rơi khỏi mép dưới hoặc mép trái camera khi không móc: chơi lại từ đầu màn.
- `?level=N` mở thẳng màn N, bỏ qua trang chính. Thêm `&mode=grapple` (hoặc `challenge`, `easter_event`, `valentine_day`) để mở màn của chế độ đó. Phím `R` chơi lại. Tiến độ lưu trong `localStorage` (`stickman-hook`).
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
| `js/menus.js` | Chế độ, Tuỳ biến, Đường XP (nạp khi mở lần đầu) |
| `js/modes.js` | Bảng chế độ: nguồn màn, lớp người chơi, chỗ lưu tiến độ, luật mở màn, thưởng cuối màn, road |
| `js/grapple.js` | Người chơi Mechanical Grapple (nạp khi mở chế độ) |
| `data/levels.json` | 123 pattern (toạ độ thế giới) cùng danh sách màn |
| `data/mode-<file>.json` | `{v, sets: {modeId: {levels, random?}}, patterns}`: danh sách màn của chế độ và pattern chưa có trong `levels.json` (`grapple`, `challenge`, `seasonal`) |
| `data/meta.json` | Bảng item, bộ sưu tập, độ hiếm, XP road, road màn Normal, chế độ, màu theme, trail/dây |
| `data/custom.json` | Khung của 95 skin, dây, trail, toạ độ icon shop |
| `art/skins/<tên>.webp` | Một sheet mỗi skin (7 trạng thái + điệu nhảy về đích) |
| `art/custom-ui.webp`, `art/ropes.webp`, `art/menu.webp` | Icon shop, texture dây, icon xu/XP/chế độ/booster |
| `data/font.json` | Bảng glyph của font Junegull |
| `art/atlas.webp` | Atlas sprite |
| `art/font.webp` | Font Junegull |
| `tools/build_data.py` | Tạo `levels.json`, `mode-*.json` và atlas, mọi chế độ qua cùng một `compile_pattern` |
| `tools/build_custom.py` | Tạo sheet skin, `ropes.webp`, `custom-ui.webp`, `custom.json` |
| `tools/build_meta.py` | Tạo `meta.json` và `menu.webp` từ remote settings mặc định trong APK |
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
py -3 -I tools/export_sprites.py D:/stickman-hook-ref/sprites <normal bundle> <generalservices gameplayconfig bundle> <skins_basic_animationcontroller bundle> -- --all-prefix AN_Grap1_Bumper A_ C_Wall D_Wall AAA_GE CHAR_Classic in_game GradientVertical UI
cd D:/survivor-web-hub/games/stickman-hook/tools && py -3 -I build_data.py && py -3 -I build_font.py
py -3 -I build_custom.py && py -3 -I build_meta.py   # build_meta đọc custom.json, nên chạy sau
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
  - Ở bản web chỉ đạt được: mặc định, road XP, road màn Normal.
  - Các cách khác (vòng quay, quảng cáo, VIP, heo đất, Adventure, Race, pachinko, sự kiện, link ngoài, thẻ, Challenge, Grapple) hiện chữ gốc và không có đường mở giả.
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

Mất khoảng 17 phút. `SH_MODES=grapple,challenge` để chạy riêng vài chế độ.

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
Nó cũng kiểm màn đầu không nạp quá 600 KB và không nạp ảnh shop. Ảnh chụp nằm ở `shots/stickman-hook/`.

## Tăng số bản

Đổi mọi `?v=` trong `index.html` và `js/main.js` (hằng `V`), rồi đổi `rev` trong `data/games.js` cho trùng.
Module JS mới phải có dòng trong importmap của `index.html`, kể cả module chỉ nạp động (`menus.js`, `fx.js`).
