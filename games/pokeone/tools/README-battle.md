# Cảnh trận đấu: `js/battle.js`, `js/fx.js`, `data/battle.js`

Trận đấu của bản web cố giữ đúng nhịp, máy ảnh, tiếng và câu chữ của PokéOne. Tệp này ghi phần nào lấy từ
bản gốc (kèm bằng chứng), phần nào là đoán, và cách chạy lại.

## Chạy

```
set PYTHONIOENCODING=utf-8
python games/pokeone/tools/rip_battle.py     # ghi data/battle.js, art/battle/stage/**, art/battle/ball/** (~1 phút)
node test/pokeone-battle.js                   # Playwright, bấm chuột thật; ảnh ở %TEMP%\pokeone-battle-shots
node test/pokeone-engine.js                   # luật trận (không đổi)
```

- Vào thẳng trận: `index.html?battle=16:3&party=4:7` (hoang dã), thêm `&trainer=Joey` cho trận huấn luyện viên.
  `&bspeed=2` tua nhanh đồng hồ trận (bài kiểm dùng).
- Gọi từ bản đồ: `P1.scene.go('battle', { kind:'wild'|'trainer', name, foe:[mon…], music?, bg?, gym?, money?, onEnd(result) })`.
  - `result = { outcome:'win'|'lose'|'caught'|'ran', caught?, money?, exp, evolve:[{index, dex}] }`.
  - Không có `onEnd` thì trận hiện khung "Battle again?" (dựng từ `Panel - Learn Evolution`).
  - Tiến hoá không làm trong trận: `evolve` liệt kê con đã lên cấp và đủ điều kiện, để bản đồ xử lý.

## Nguồn [ĐO TRONG REPO, 2026-09-27]

Địa chỉ dưới đây là RVA trong `GameAssembly.dll`, đọc bằng ảnh bộ nhớ đã giải nén (cách của `rip_ui_settings.py`,
lớp `Image`) và capstone. Thân hàm không có trong `dump.cs` vì DLL bị Themida nén.

### Sân (`rip_battle.py` → `P1.BATTLE.stage`)

- Scene `level2`, GameObject gốc `Battle Arena` (Unity (-500,0,0)). Toạ độ trong `data/battle.js` là khung three
  (x đảo dấu), tính trong không gian của arena.
- `UserPokePos` (0,0.05,-4), `FoePokePos` (0,0.05,4). Model nhìn +Z, nên phe mình quay 0, phe địch quay π.
- 38 nền `Background - *`; bóc glb cho 12 nền (grass, grass2, grass3, cave, city, indoor1, waterland, desert, snow,
  graveyard, stadium, ocean). Mặc định `grass` (nền duy nhất đang bật trong scene).
- Skybox: `RenderSettings` của level2, vật liệu "Sunny 06B noSun" (Skybox/6 Sided). `BattleCamera.Update` quay
  `_Rotation = -Time.time·0.5` (0x2002BB).
- Máy ảnh: fov 65, near 0.3, far 70, vị trí ban đầu = transform "BattleCamera" = `PositionTargets[3]`.
- Cỡ model: `StartUp` TweenScale tới `PokeLoader.scale·0.01` trên model đơn vị cm. `PokeLoader.scale` không
  phải 1 mà chuẩn hoá theo chiều cao (`PokeLoader.Setup` 0x269080, đoạn 0x26D9DC–0x26DD4B):
  - lấy mẫu clip "0" tại t=0, đặt localScale = 1, cộng `Renderer.bounds` mọi lưới (SkinnedMeshRenderer có
    `updateWhenOffscreen`, `m_AABB` lưu toàn 0, nên đây là khung bao thật của tư thế idle, đơn vị cm);
  - `scale = fixedAverage / Lerp(fixedAverage, size.y, Factor)`, `fixedAverage = 300` (ctor 0x26ED43),
    `Factor = 0.7` (ctor 0x26ED4A; `3DPokemonPrefab` cũng lưu 0.7);
  - hệ số nhân thêm = 1 cho dạng thường (0.8 cho Wishiwashi "School", `ScaleFactor` chỉ cho dạng "primal").
  - glb đã nhân 0.01, nên `battle.js` nhân model đúng `scale` (`pokeLoaderScale`). Charmander 0,59 m → 1,34 m
    (×2,29), Pidgey 0,29 m → 0,79 m (×2,72), Charizard 2,42 m → 2,80 m (×1,16).
  - Chuỗi thế giới: Battle Arena (-500,0,0) scale 1 → UserPokePos/FoePokePos scale 1, không xoay;
    Camera And Positions scale 1. Không cha nào có scale khác 1.
  - [BẪY ĐÃ SẬP] Bản đầu coi `PokeLoader.scale` = 1 nên Pokémon nhỏ đi 2–3 lần (Charmander 40 px thay vì ~110 px
    ở 1280x720 từ máy ảnh Idle2).

### Máy ảnh (`BattleHandler.MoveCamera` 0x2101D0)

Vị trí đi thẳng bằng `Vector3.MoveTowards` (m/s), hướng nhìn `LookAt` mỗi khung. `MovementSpeed=4`,
`SelectMovementSpeed=6` (ctor 0x213F48). PT = `BattleCamera.PositionTargets`, CT = `CameraTargets`.

| State | Vị trí | Nhìn | Tốc độ | Bằng chứng |
|---|---|---|---|---|
| Idle2 (3) | PT[3] `Center Field Pos (1)` | `Center Field` | 4, tới nơi thì xoay −5°/s quanh tâm | 0x2110d5, 0x211461 |
| Idle (2) | `Center Field Pos` | `Center Field` | 4, xoay +10°/s | 0x21095F, 0x210D20 |
| Default (9) | PT[2] `Select All Pos` | CT[2] `Select All Focus` | 3 | 0x21190C |
| HitFoe (4) | PT[0] `Select Foe` | CT[0] | 6 | 0x211FFE |
| HitUser (5) | PT[1] `Select User` | CT[1] | 6 | 0x211D7C |
| Still (10) | PT[4] `DefaultStuck` | CT[2] | 6 | 0x21198F |

- Tuỳ chọn Battle Camera = Set biến Idle/Idle2/Default thành Still (0x21020A). Trong port: `P1.settings.battleCamera`
  (true = Rotate).
- Thả Pokémon (chỉ khi Rotate): máy ảnh bám con đó tại `pos + (0, 3, −z_cha·1.2)`, ngẩng 10°, thả sau 1 s.
- Nhịp: Start → Idle2, Setup → Default, hết SpawnPokes → Idle2, sau mỗi lần thả → Default, cuối mỗi gói trận → Idle2.
  Lúc diễn đòn không đổi state. Ném bóng: HitFoe rồi trả state cũ.
- Lật trục x làm đảo chiều quay: Unity −5°/s thành +5°/s trong three.

### Mở trận (`<StartUp>d__118`, `BattleIntroAnimation`)

Màn đen mờ đi 2/s (0.5 s). Từng con phe mình rồi phe địch: TweenScale 0.5 s + cry + wait 0.5 (shiny: tiếng
`Gen_4_Shiny_edit2` + wait 0.65 trước). Wait 0.5, rồi thanh máu bay vào bằng anim 4 "Fly In Left" (−304) và
3 "Fly In Right" (+305), 0.3 s. Không có dòng log nào khi thả Pokémon.

### Anim chung (`NewBattleAnimation`, 9 bản, `P1.BATTLE.anims`)

Bước: Wait, SpriteAnimation, Shake, TweenPosition, TweenColor, ChangeBattleCamera… (enum ở `P1.BATTLE.enums`).
Mã gốc chỉ gọi 3 bản: 3 Fly In Right, 4 Fly In Left, 5 Faint (Wait 0.4). 0/1/6/7/8 có dữ liệu nhưng không ai gọi.
`battle.js` có bộ chạy bước (`STEP[type]`) cho các loại đang dùng.

### Diễn đòn

- `"X used [ffff00]Move[-]!"` (log nhanh 0.2 s), rồi `PlayAttackAnimation` (0x216D50): clip "8" vật lý, "9" đặc biệt,
  "13" trạng thái ("12" khi "13" và "14" dài bằng nhau), wait 1.0.
- Trúng đòn (`-damage` không có `[from]`): tiếng theo hiệu quả `Attack_Hit_Super_Effective` / `_Weak_Not_Very_Effective`
  / `_Damage`; clip "14" + prefab `Default Hit` (hạt) ở xương Head, chờ hết clip; rồi ChangeHealth.
- **Không có hoạt ảnh riêng cho từng chiêu.** `battleAnimations[moveID]` chỉ dùng cho 3/4/5.
- Ngất: `"X fainted!"`, máu về 0, clip "17" + anim 5 + `Faint_No_Health_Left` + wait 0.4. Không có cry.

### Thanh máu (`<ChangeHealth>d__128` 0x2151E0, `HealthBar.Update`)

- Rộng `(int)(211·cur/max − 1)`, kẹp [2, 211]. Sprite `Fill_HPBar` sliced; không đổi màu theo ngưỡng.
- "Healthbar Old" (#c56564) = rộng cũ + 1; thanh chính TweenWidth 0.5 s, wait 0.5; thanh cũ đuổi 0.5 s sau 0.75 s.
- Sprite rộng ≤ 4 thì ẩn. Nhãn phe mình "cur/max" (0 → "FNT"); phe địch để trống khi đấu NPC/hoang dã.

### Log (`BattleText` 0x20F650, `Update` 0x20FDDD)

- `BattlePanel/Debug Log` (UITextList). Khung sáng dần 2/s trong 3.5 s sau dòng cuối, rồi tối dần 2/s.
- `logText`: chờ 0.2 s (nhanh) hoặc 0.8 s. Có "Turn N" từ lượt 2.
- Tên Pokémon `[ff6600]Tên[-]` cho cả hai phe, không có chữ "wild". Tên người chơi `[ff6666]User[-]`.
- Câu chữ lấy từ `stringliteral.json` (khối 8080–9060 của `BattlePacketHandler`): "It's super effective!",
  "It's not very effective.", "A critical hit!", "X's ATK rose sharply!" (`STAT.ToUpper()`), "You got away safely!",
  "[ffff00]X[-] failed to run away!", "Gotcha! X was caught!", "Oh no! The Pokémon broke free!" (0 lần lắc),
  "Aww! It appeared to be caught!" (1), "Aargh! Almost had it!" (2+), "[ff6666]X[-]'s team won the battle!",
  "Enemy's team won the Battle!".

### Bắt (`CatchEffect.<Catch>d__4` 0x19E520, `P1.BATTLE.catch`)

- 25 prefab bóng, glb ở `art/battle/ball/<tên>.glb`, gốc glb = nút "PokeBall" (đã gộp scale 0.1 của gốc CatchEffect).
  Đường kính 0,46 m. Bốn clip glTF: `Pokeball_Open_Catch`, `Pokeball_Shake`, `Pokeball_Break`, `Pokeball_Success`.
- Nhịp: HitFoe; Open_Catch, wait 0.1; đặt bóng ở Pokémon + Unity (1.5, 3, 1); hạt BallEffect; wait 1.0;
  PokemonEffectIn; wait 0.3; `balldrop`; Pokémon co về 0 trong 0.3 s; chờ hết clip. Mỗi lần lắc: Shake + `ballshake`,
  chờ hết clip, wait 0.2. Thành công: Success, wait 0.8. Thất bại: Break, PokemonEffectOut, Pokémon phóng lại 0.3 s.
- Bóng chỉ dùng từ túi đồ (thẻ Pokéball của `Battle Items`); không có nút ném riêng (`SelectPokeballTarget`).

### Nhạc

`PlayBattleMusic` (0x2334C0): nhạc server gửi nếu có, không thì `Battle_Wild` / `Trainer_Battle`. Port: hoang dã
`battle_wild`, huấn luyện viên `trainer_battle`, gym `battle_gym_kanto` (đoán: gym do server gửi), hoặc `args.music`.
Hết trận trả lại nhạc trước đó (`MusicHandler.PlayLastTitle`).

### UI

- `BattlePanel`: nút Fight/Pokémon/Items/Run, 4 nút chiêu (`Attacks/Attacks/Button - Attack 1..4`: tên + PP, không
  tô màu hệ vì `AttackButton` của 4 nút này không có `spriteType`), tooltip `UIWidget - Mouse Over Move` khi rê chuột
  (ô hệ tô theo `BattleHandler.TypeColours`), cửa sổ `Battle Pokemon` (đổi con, chọn mục tiêu cho thuốc),
  `Battle Items` (thẻ Pokéball/Medicine/Berries lọc từ `P1.state.bag`).
- Học chiêu khi đủ 4: `Widget - Hidden During Battle Or Script/Panel - Learn Move`.
- Run bị tắt khi đấu huấn luyện viên (`BattleHandler.CanRun`).
- Phím: Space/Enter mở Fight, 1–4 chọn chiêu, Esc/Backspace lùi.

## Bảng sự kiện → trình diễn (`DIRECTOR` trong `battle.js`)

| Lệnh | Trình diễn |
|---|---|
| `switch` / `drag` / `replace` | SendOutPokemon (rút về, bám máy ảnh, phóng to, cry, clip "1") |
| `move` | log + clip 8/9/13 + wait 1.0; chiêu trạng thái có VFX atlas (đoán) |
| `-damage` | tiếng hiệu quả, clip 14, Default Hit, VFX atlas (đoán), thanh máu |
| `-supereffective` `-resisted` `-crit` `-miss` `-immune` `-fail` `-ohko` `-hitcount` | dòng log |
| `-heal` `-sethp` `-revive` | thanh máu + log |
| `faint` | log, clip 17, anim 5, tiếng ngất; phe địch ngất → EXP, lên cấp, học chiêu |
| `-status` `-curestatus` `cant` `-start` `-end` `-activate` | icon trạng thái, sprite `fx_statuseffects`, log |
| `-boost` `-unboost` | log `STAT.ToUpper()` |
| `-weather` `-message` `turn` | log |
| `p1-item` `p1-ball` `p1-run` `p1-norun` `p1-noball` | hành động riêng của `engine.js`: dùng đồ, ném bóng, chạy |

## Phần đoán (không có trong mã gốc)

- VFX chiêu thức từ 10 atlas `fx_*` (bảng `MOVE_FX`: theo tên chiêu rồi theo hệ). Bản gốc không chiếu atlas nào khi
  đánh; đề bài yêu cầu, nên port thêm hoạt ảnh billboard 3D, `fxPxToM = 0.006` m/điểm ảnh.
- EXP trong trận: dòng "X gained N EXP!", chữ nổi `prefab:EXP Gain`, thanh EXP (nhân bản "Healthbar Old", sprite
  `Bar_PokemonEXP`) dưới thanh máu, "X grew to level N!" + `Level Up`. Bản gốc chỉ hiện EXP ở HUD ngoài trận.
- Tiếng `stat_up` / `stat_down` khi tăng/giảm chỉ số (bản gốc không phát trong nhánh `-boost`).
- Tiền thưởng huấn luyện viên: `args.money`, không có thì cấp cao nhất × 24.
- Câu dùng đồ ("X used a Potion on Y!"), câu khi chưa bắt được của huấn luyện viên, câu học chiêu.
- Hạt Shuriken xấp xỉ (`fx.js` `emitter`): bỏ va chạm, sub-emitter, hình dạng mesh.

## Bẫy

- [BẪY ĐÃ SẬP] `js/menus.js` nuốt `P1.input.take('menu')` ở mọi phím Esc (pha bubble). Trận bắt Esc riêng ở pha
  capture (`onEsc`), không dựa vào `P1.input` cho Esc.
- [BẪY ĐÃ SẬP] `BattlePanel` có hai nút cùng tên "Button - Attack 1" (bản 4 chiêu và bản nhân đôi đang tắt). Bài
  kiểm phải lọc `:visible`. Lưới bóng "Sprite - Ball" trùng tên sáu lần: đi qua `grid.kids`, đừng tra theo đường dẫn.
- [BẪY ĐÃ SẬP] Panel con mở bằng TweenAlpha (Battle Pokemon, Battle Items, Mouse Over Move) lưu alpha 0 trong
  dữ liệu. Mở ra phải đặt màu `#ffffffff`, nếu không cả cây con trong suốt.
- [BẪY ĐÃ SẬP] `items.txt` ghi BattleID của Poké Ball là `pokball`. Túi đồ dùng `pokeball` (luật bóng của engine);
  `battle.js` quy đổi qua `BAG_ALIAS`, còn `P1.BATTLE.catch.balls` giữ khoá gốc `pokball`.
- [BẪY ĐÃ SẬP] Request đầu tiên của `@pkmn/sim` còn PP trước khi `syncIn` chép PP thật (và maxpp đã nhân PP Up).
  Nút chiêu đọc PP từ `simMon().moveSlots`, PP tối đa từ `mon.moves[k].ppMax`.
- [BẪY ĐÃ SẬP] Clip của bóng có rãnh scale ở chính nút gốc; lúc bóc quên nhân 0.1 vào rãnh này nên bóng to gấp 10.
  Đã sửa trong `rip_battle.py`.
- Transform "BattleCamera" lưu trong scene nhìn thẳng +Z từ (−9,4,0) Unity, không nhìn vào sân. Hướng thật do
  `MoveCamera` tính mỗi khung.

## Chưa làm

- Trận đôi/ba (`Battle3V3`, Rotate Left/Right, Mega, Z-Move, chọn mục tiêu).
- Học chiêu giữa trận chỉ đổi `mon.moves`; sim vẫn giữ bộ chiêu cũ tới hết trận.
- `PlaySpriteAnimation` và `PlayTweenColor` của NewBattleAnimation chưa dịch ngược (mã gốc không gọi các anim dùng
  chúng). Kích thước sprite 3D là đoán.
- Free cam (giữ chuột phải xoay máy ảnh) và SelectField theo chuột chưa làm.
- Thời tiết (`Battle Weather`), bẫy sân (hazard icons) chưa diễn.
