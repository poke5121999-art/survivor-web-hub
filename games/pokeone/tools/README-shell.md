# Vỏ game PokéOne: màn đầu, tạo nhân vật, HUD, menu, hộp thoại

Ba tệp `js/title.js`, `js/creator.js`, `js/menus.js` và `css/p1.css`. Mọi màn dựng từ panel NGUI gốc qua
`P1.ngui` (xem `README-ui.md`), không vẽ khung tự chế. Tệp này ghi màn nào dùng panel nào, API cho `world.js`
và `battle.js`, chỗ khác bản gốc, và các bẫy đã sập khi làm.

## Chạy và kiểm

```
node test/pokeone-shell.js       # Playwright, chuột/phím thật, 1280x720 và 844x390, ảnh ở %TEMP%/pokeone-shell-shots
```

Bài kiểm đi hết: màn đầu → New Game → tạo nhân vật (đổi tóc, da, áo, mũ, giới tính, gõ tên) → world → Esc menu →
lưu → Options (kéo Music Volume, chọn trong danh sách thả xuống, xem phím) → túi đồ (Potion cho con yếu) → thẻ
Pokémon 4 thẻ con → kéo đổi chỗ trên HUD → Pokédex → thẻ huấn luyện viên → cửa hàng (mua 2 Poké Ball) → hộp PC
(rút ra, kéo gửi vào) → hồi máu → hộp thoại (Space, chọn bằng phím 2) → học chiêu → tiến hoá → lưu, tải lại,
Continue. Chưa có `js/world.js` thì bài kiểm đăng ký một cảnh `world` giả ngay trong trang (chỉ gắn HUD, phát nhạc).

## Màn và panel gốc [ĐO TRONG REPO]

| Màn | Panel gốc | Ghi chú |
|---|---|---|
| `title` | `title:Panel - Login` + `P1.TITLE_SCENE` | đảo 3D, máy ảnh chạy theo timeline "Login" (654 mẫu, lặp 163 s), skybox 5 mặt, sương, ACES +1 EV; nhạc `title` |
| `creator` | `Panel - Customization` (CustomizationHandler) | nền vẫn là đảo màn đầu |
| HUD | `Panel - Game GUI` | chân dung 4 lớp, 6 bóng đội, cấp/EXP huấn luyện viên, 6 ô Pokémon, đồng hồ, tên vùng |
| menu Esc | `Panel - Menu` | |
| đội | `prefab:Panel - Pokemon Card` + HUD | Info / Moves (`prefab:Sprite - Move`) / IVs / EVs |
| túi | `Panel - Inventory`, `prefab:Inventory Item`, `prefab:Panel - Message Box`, `Panel - Select Pokemon` | |
| Pokédex | `Panel - Pokedex`, `prefab:DexPokemon`, `prefab:Pokedex Move(1)` | 45 nút (PokedexHandler.MaxPokeButtons), lăn chuột đổi hàng |
| thẻ HLV | `Panel - Trainer Card` | |
| cài đặt | `Panel - Options` (ở màn đầu: `title:Panel - Options`), 4 prefab dòng | |
| hộp PC | `Panel - Pokebox`, `prefab:Pokebox Button` | |
| cửa hàng | `Panel - Shop`, `prefab:Shop Item#3985` | |
| hồi máu | `Panel - Script Blackout` | |
| học chiêu / tiến hoá | `Widget - Hidden During Battle Or Script` → `Panel - Learn Move` / `Panel - Learn Evolution` | |
| hộp thoại | `Panel - Scripts`, `prefab:Button - Script Button` | |
| thông báo | `prefab:Splash Message` | |

## API

```js
P1.ui.hud(parent?)                 // → { view, refresh(), destroy() }; parent mặc định #ui
P1.ui.open(name, arg?)             // 'menu' | 'party' (arg = ô) | 'bag' | 'dex' | 'trainer' | 'options' | 'save' | 'pokebox' → Promise
P1.ui.close(); P1.ui.closeAll(); P1.ui.isOpen(); P1.ui.top(); P1.ui.view(name); P1.ui.refresh()
P1.ui.shop([{ id, price }])        // id = khoá túi ('pokeball') hoặc số ID trong P1.ITEMS → Promise khi đóng
P1.ui.heal()                       // → Promise; hồi cả đội, tiếng 'heal_pokemon'
P1.ui.learnMove(mon, moveId)       // → Promise<ô đã ghi | null>; tự ghi chiêu vào mon. Dưới 4 chiêu: học luôn, không mở panel
P1.ui.evolve(mon, intoDex)         // → Promise<bool>; Yes thì tự P1.mon.evolve + tiếng kêu + đánh dấu đã bắt
P1.ui.message({ title, text, yes, no })   // → Promise<bool>; bỏ `no` thì chỉ có nút Okay
P1.ui.toast(text)
P1.dialog.say(textOrLines, { name? })     // → Promise; Space/Enter/click khung: bỏ qua gõ, rồi sang trang
P1.dialog.choose(text, options)           // → Promise<index>; phím 1–4 hoặc click
P1.look.layers(player)             // 4 lớp sprite người chơi [{ part, url, tint }]; P1.look.HAIR_COLOURS; P1.look.parts(gender)
P1.trainerLevel(exp)               // { level, cur, need }
P1.getSetting(key)                 // đọc cài đặt theo khoá gốc ('sBattleCamera'...)
```

Hợp đồng với `world.js`:

- **Esc do `menus.js` giữ.** `menus.js` nghe phím Esc, lấy luôn hành động `'menu'` khỏi `P1.input`, và chỉ mở menu khi
  `P1.scene.name === 'world'` và `P1.scene.current.mode` rỗng hoặc bằng `'explore'`. World đừng tự mở menu bằng Esc.
- **Đóng băng di chuyển** khi `P1.ui.isOpen()` (menu, hộp thoại, màn đen hồi máu đều tính).
- **HUD do world gắn**: `this.hud = P1.ui.hud()` lúc vào, `this.hud.destroy()` lúc ra. Sau trận gọi `P1.ui.refresh()`.
  Mở `party`/`pokebox` khi chưa có HUD thì menus tự gắn tạm.
- Cảnh `creator` xong thì gọi `P1.scene.go('world', { intro: true })`. Continue gọi `P1.scene.go('world', {})`.
- Nhân vật: `P1.state.player = { name, gender, look: { body, clothe, hair, hairColor, hat } }`, `P1.state.region = 'kanto'`.
  `hairColor` là chỉ số vào `P1.look.HAIR_COLOURS`, tóc vẽ bằng cách nhân màu (tấm tóc gốc màu xám trắng).
- Tên bản đồ trên HUD lấy `P1.MAP_NAMES[P1.state.map]` nếu có, không thì viết hoa từ khoá map.
- Thống kê thẻ HLV đọc `P1.state.stats = { steps, fainted, levelUps, encounters, ballsThrown }` và `P1.state.badges`
  (mảng tên thường: `'boulder'`, `'cascade'`...). Chưa có thì hiện 0.
- Hộp PC: Pokémon trong `P1.state.box` mang `boxNo` (0–9), mỗi hộp 24 con.

## Đo trong repo

- [ĐO TRONG REPO] **Nút UI gốc không có tiếng click.** Quét mọi MonoBehaviour trong level1/level2/sharedassets0-2
  (`tools/ttg.py`): chỉ có 2 `UIPlaySound`, gắn trên `FX_ConfettiGlitter` (twinkle) và `FX_Explosion` (explode). Tiếng
  còn lại do máy chủ gửi qua `AudioHandler.PlaySound(effectID)`. Vì vậy menu ở đây im lặng khi bấm; chỉ hồi máu phát
  `heal_pokemon` và tiến hoá phát tiếng kêu loài mới.
- [ĐO TRONG REPO] **28 màu tóc** là `TextureManager.HairColour` (MonoBehaviour trong level1, pathID 2982). Đọc lại:
  duyệt `ttg.files(env)`, lấy MonoBehaviour có `ttg.script_of(env, o)[1] == 'TextureManager'`, `ttg.read_mb(env, o)`.
- [ĐO TRONG REPO] **Tên tệp thân `body_*/SS_EE`** = màu da (00–03) × màu mắt (00–04): ghép 20 tấm cạnh nhau thấy 4 dải
  da, mỗi dải 5 màu mắt. Khớp 4 dòng Skin Tone / Eyes của CustomizationHandler. Tóc 00 là trọc.
- [ĐO TRONG REPO] `items.txt` để `Pocket = 0` và `Usage = 0` cho cả 994 món (máy chủ gửi thật). Túi chia 6 thẻ theo
  tên: `…Ball` → Pokéball, `TM/HM` → TM/HM, `…Berry` → Berries, món có trong `P1.ITEM_EFFECT` hoặc tên thuốc → Medicine,
  mô tả có "When held" → Hold, còn lại General. [ĐỀ XUẤT], không có nguồn.
- [ĐO TRONG REPO] Hộp thoại: `TypewriterEffect` của `Label - Script Text` là 35 ký tự/giây, fadeIn 0,2 s,
  `keepFullDimensions` (khung giữ cỡ cả câu). Chữ chưa tới vẽ bằng màu `[ffffff00]`.
- [ĐO TRONG REPO] `UIGrid` của danh sách cài đặt có `sort: alpha`: tên dòng phải đệm số (`r00`, `r01`…), không thì
  `r10` đứng trước `r2`.
- [ĐO TRONG REPO] Âm lượng mặc định gốc: nhạc 0,35, tiếng 0,45, Bump Sound tắt (`data/settings.js`). `core.js` trước
  đó để 0,6 / 0,8 / bật; đã sửa theo bản gốc.

## Khác bản gốc và vì sao

- **Màn đăng nhập**: ô Username thành dòng tóm tắt bản lưu, nút Login thành Continue (chỉ hiện khi có bản lưu),
  thêm New Game (bản sao nút Login). Bỏ Password, Remember, Sign Up, Lost Password, Quit (trang web không tự đóng).
- **Tạo nhân vật**: panel gốc chỉ có tóc, màu tóc, da, mắt, giới tính; áo và mũ mua ở Costume Shop, tên là tên tài
  khoản. Thêm 4 hàng cùng kiểu (Clothes, Hat, Name, Region), cửa sổ cao thêm 180. Ô tên mượn `Input - Username` của
  màn đăng nhập. Thêm lớp Hat cho hình xem trước. Hình tự xoay 4 hướng và bước chân; nút xoay gốc vẫn dùng được.
- **Menu Esc**: Change Password → Save Game, Logout → Title Screen, bỏ Exit Game.
- **HUD**: tắt nút cửa hàng trang phục, thành tựu, bạn bè, PvP, hòm, thú cưỡi, bản đồ bay, nhiệm vụ; 4 biểu tượng còn
  lại xếp sát phải. Màu thanh HP (vàng dưới 50%, đỏ dưới 20%) là đoán.
- **Thẻ Pokémon**: bỏ nút trả phí (Reset IV, cộng/trừ EV). Bảng chỉ số (`Table - Stat Numbers`, bản gốc để tắt) hiện
  ở thẻ IVs dưới dòng "Stats (IV x/186)". Ảnh Pokémon là sprite 2D thay cho model 3D quay được.
- **Màu tên theo IV**: tên màu lấy từ wiki, mã màu là đoán.
- **Túi**: bấm món mở Message Box với Use / Hold gốc, thêm Toss (bản sao nút Hold). Ẩn Poké Gold.
- **Pokédex**: ảnh 2D phóng 1,5 lần thay model 3D; lục giác chỉ số vẽ ra ảnh rồi gán vào `Chart Texture`
  (bản gốc là RenderTexture); thang 150 là đoán. Bỏ thẻ Locations (không có dữ liệu).
- **Thẻ HLV**: huy hiệu chưa có tô tối `#00000073` (đoán). Ẩn Private, guild.
- **Cài đặt**: dòng `offline: true` ẩn; nút Set Defaults bỏ vì phím chỉ xem. Window Mode bật/tắt toàn màn hình thật.
  Resolution chỉ hiện cỡ khung. Danh sách thả xuống dựng từ sprite atlas như UIPopupList (Bg_Window, Bg_Hotkey_Icon).
  Kéo thanh trượt đổi âm lượng ngay và lưu ngay; Apply chỉ đóng cửa sổ.
- **Hộp PC**: 24 con mỗi hộp (4 hàng × 6 vừa BoxView), 10 hộp, không mua thêm, không thả (Release). Rút: bấm hoặc kéo
  lên HUD. Gửi: kéo ô HUD vào hộp.
- **Cửa hàng**: ẩn giá Poké Gold và nút mua bằng Poké Gold; nút Buy ra giữa.
- **Hồi máu**: màn đen 0,35 s + `heal_pokemon`. Bản gốc do script máy chủ, không có mã mô tả thời lượng.
- **Học chiêu**: panel gốc. Rê chuột vào chiêu cũ hiện khung mô tả (ShowMoveDescription).
- **Tiến hoá**: EvolveAnimation gốc đổi qua mảng Texture2D; ở đây hai ảnh loài cũ/mới nhấp nháy nhanh dần.
- **Hộp thoại**: bản gốc không có ô tên NPC; tên đặt đầu câu màu cam. Ngắt dòng 52 ký tự, 3 dòng mỗi trang.
- **Cấp huấn luyện viên**: máy chủ tính, máy khách không có công thức. Dùng đường "medium" bắt đầu Lv 5 (đoán).

## Bẫy đã sập

- [BẪY ĐÃ SẬP] **Panel con lưu alpha 0.** `Panel - Learn Move` / `Panel - Learn Evolution` có TweenAlpha 0→1 và
  `pn.alpha = 0`. `ngui.build` chỉ chạy tween của nút gốc, nên bật panel con lên vẫn trong suốt. Đặt `node.alpha = 1`.
- [BẪY ĐÃ SẬP] **Nút trùng tên chung một đường dẫn.** 6 `PokeButton`, 6 `Backgrounds`, hai `Sprite - BG Currency`:
  `ui.on(path)` gắn cho cả nhóm, `find` trả nút cuối. Lấy nút qua `parent.kids`, bắt click thẳng trên `node.el` (`P1.ui.onEl`).
- [BẪY ĐÃ SẬP] **`find('Grid')` trả lưới đầu tiên** theo thứ tự duyệt (Options có lưới thẻ trước lưới dòng). Luôn ghi
  thêm tên cha: `'Scroll View - Settings/Grid'`.
- [BẪY ĐÃ SẬP] **ShrinkContent + ký hiệu `[PD]`.** Ký hiệu là ảnh cao cố định, nhãn 22 đơn vị không bao giờ vừa, vòng
  co chữ chạy tới cỡ 3 px ("₽ ₀₀"). Nhãn tổng tiền ở cửa hàng đổi sang ResizeFreely.
- [BẪY ĐÃ SẬP] **Thanh trượt Options có anchor.** Foreground neo cả 4 cạnh vào Slider, `ui.value` đổi cỡ xong bị anchor
  kéo về đủ 150. Gỡ `anc`, đặt pivot Left rồi tự đặt bề ngang và vị trí Thumb.
- [BẪY ĐÃ SẬP] **RenderTexture bị xoá khi vẽ lại.** Vẽ thẳng lên canvas của `Chart Texture` thì lần `refresh` sau
  (font tải xong) đặt lại `width` và xoá hình. Vẽ ra ảnh (`toDataURL`) rồi `setTex`, ngui tự nhân màu nút.
- [BẪY ĐÃ SẬP] **`dt` bị kẹp 0,05 s.** Máy chậm (headless vẽ đảo bằng phần mềm) chạy ~10 khung/s, hình xem trước xoay
  chậm một nửa. Hoạt ảnh xem trước dùng đồng hồ thật.
- [BẪY ĐÃ SẬP] **`elementFromPoint` trên nhãn có collider** trả `<div>` dòng chữ bên trong (con kế thừa
  `pointer-events: auto`). Bài kiểm coi là trúng khi phần tử trúng nằm trong `node.el`.
- [BẪY ĐÃ SẬP] **Heredoc Python trên máy này** (`python - <<'EOF'`) đổi `'\\n'` thành xuống dòng thật, `assert` so chuỗi
  trượt mà không rõ vì sao. Ghi script sửa ra tệp rồi chạy.
- [BẪY ĐÃ SẬP] **Màn đen hồi máu đè cả HUD** khi dựng trong lớp menu. `Panel - Script Blackout` depth 9 nằm dưới
  `Panel - Game GUI` depth 11; giờ dựng trong lớp `.p1-scene` (z 10) dưới lớp HUD (z 15).

## Còn thiếu

- Phím chỉ xem, không gán lại (Add/Remove/Replace của `prefab:Button - Key Setting` ẩn).
- Không có Costume Shop, nhiệm vụ trên HUD (`Button - Quests`), bản đồ, Release trong hộp PC, chọn hộp bằng kéo thả.
- Tooltip `ShowTip` trên biểu tượng HUD chưa làm (`Panel - Tool Tip`).
- Ô Pokémon trên HUD chưa có hiệu ứng EXP tăng dần (`HUDPokemon.SplashEXPGain`).
- Tween mở/đóng cửa sổ (TweenAlpha 0,2 s, TweenScale menu ngữ cảnh) chưa chạy; cửa sổ hiện ngay.
