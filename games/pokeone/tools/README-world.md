# Bản đồ, nhân vật và cốt truyện mở đầu (build_maps.js, rip_world.py, js/world*.js)

Bản cài PokéOne không có bố cục bản đồ: server gửi `MapDump` khi vào map. Ở đây mười map đầu game Kanto
(Pallet Town, nhà người chơi hai tầng, nhà Gary, lab Oak, Route 1, Viridian City, Trung tâm Pokémon, Poké Mart,
trường huấn luyện) được viết bằng chữ trong `tools/maps/*.txt`, dịch thành `data/maps.js` theo đúng dạng `MapDump`.
Hằng số thế giới (tốc độ đi, máy ảnh, ánh sáng, hạt, cửa, emote) rút thẳng từ máy khách vào `data/world.js`.

## Chạy

```
node games/pokeone/tools/build_maps.js            # tools/maps/*.txt -> data/maps.js, in bảng map; lỗi thì không ghi
node games/pokeone/tools/build_maps.js --check    # chỉ kiểm
set PYTHONIOENCODING=utf-8
python games/pokeone/tools/rip_world.py           # data/world.js + art/fx/shadow.png, khoảng 6 s
python games/pokeone/tools/rip_world.py npc       # xuất tấm NPC mà tools/maps gọi (sprite=spriteN) còn thiếu
node test/pokeone-world.js                        # kiểm tĩnh + chơi thật bằng phím + 844x390 cảm ứng, ảnh ở %TEMP%\pokeone-world-shots
```

- Cả hai công cụ chạy lại ra cùng kết quả [ĐO TRONG REPO: `rip_world.py` chạy hai lần, md5 `world.js` và `shadow.png` khớp;
  `build_maps.js` không có ngẫu nhiên, ô cỏ đổi theo băm toạ độ].
- `build_maps.js` gom mọi lỗi rồi in một lần: kí tự không có trong chú giải, prefab không có trong `P1.PROPS`, vùng nhà sai cỡ,
  cây 2×2 lệch lưới, cửa nối tới ô bị chặn, nhãn kịch bản thiếu, vật phẩm/nhạc/tiếng không có, NPC đứng trên ô chặn.
- Tham số gỡ lỗi của trang: `?map=<id>&x=&z=` vào thẳng, `&grid=1` phủ lưới ô (đỏ chặn, tím quầy, vàng gờ, xanh cỏ gặp,
  lam cửa nối), `&overview=1` máy ảnh nhìn thẳng từ trên cả map (dùng để viết `*.txt`), `&period=night` ép buổi,
  `&touch=1` hiện phím ảo, `&nosave=1` không tự lưu. `P1.world.debug = { encounterRate, noEncounter, forceSpecies }`.

## Dạng dữ liệu: `P1.MAPS[id]` ↔ `MapDump` gốc [ĐO TRONG REPO: dump.cs]

| Trường | `MapDump` gốc | Ở đây |
|---|---|---|
| `w`, `h` | `width`, `height` | số ô |
| `tiles`, `tiles2` | `TileTypes`, `TileTypes2` | ô atlas nền `c + 64·r` (r tính từ đáy ảnh), -1 = trống |
| `heights` | `TileHeights` | số nguyên; chênh thì dựng tường |
| `walls` | `WallData` | ô atlas cho mặt tường của ô cao hơn (mặc định (1,62), vách đất) |
| `colliders` | `Colliders` | 0 đi được, 1 chặn, 2/3/4/5 gờ nhảy xuống/trái/phải/lên, 6 quầy (nói chuyện qua được) |
| `water` | `TileWater` | 1 = nước; mặt nước ở `h + 0,76` như prop `waves` |
| `zones` | `TileZones` + `Zones` | `{ grid: chỉ số vùng+1, ids, tables: { vùng: { rate, morning/day/evening/night: [{dex, w, min, max}] } } }` |
| `links` | `Links` | `{ x, y, to, tx, ty, face, kind: 'door'|'edge'|'stairs', sfx }` |
| `npcs` | `NPCs` (`NPCSettingStruct`) | `{ id, kind: npc/trainer/sign/item, x, y, face, name, sprite, script, look, path, los, trainer: {team, money, exp, music, spotted} }` |
| `objects` | `Objects` (`MapObjectStruct`) | `{ x, y, z, prefab, ry, tag }`, toạ độ three.js |
| `settings` | `Settings` | `{ song, indoors, tileset, encounterRate, light, mapName, spawn, enter }` |

Ô `(x, y)` chiếm `x..x+1`, `z = y..y+1` trong three.js; máy ảnh ở +z nhìn về -z nên hàng 0 là phía bắc (trên màn).
Cùng tệp có `P1.SCRIPTS`, `P1.QUESTS`, `P1.QUEST_ORDER`, `P1.MAP_NAMES` (HUD của shell đọc tên vùng ở đây).

## Viết một bản đồ (`tools/maps/<id>.txt`)

```
name: Pallet Town          # tên vùng (HUD, bảng tên khi đổi vùng)
song: pallet_town          # khoá P1.MUSIC (Settings.Song)
indoors: 1                 # trong nhà: nền đen, không viền cây, ánh sáng ban ngày
encounter: normal          # normal | low | verylow
spawn: @p                  # chỗ đứng khi New Game (chỉ phòng ngủ)
enter: intro               # kịch bản chạy mỗi lần vào map (tự kiểm cờ)

[legend]
. grass                    # kí tự  tên_cọ  [khoá=giá_trị thêm]
" tallgrass grass=route_1_grass
H house_player

[grid]
TTTT..,,..TTTT             # mỗi kí tự một ô; hàng 0 = bắc

[links]
edge north -> route_1 offset=-2                     # đi ra khỏi mép: cột x sang cột x-2 của map kia
door @H -> pallet_house_1f @x face=up               # @H = ô cửa của nhà H; @x = ô đánh dấu x (nhiều ô thì lấy ô đầu)
door @x -> pallet_town @H at=below arrive=below face=down sfx=exit_door   # thảm cửa: nối ở ô ngay dưới thảm
stairs @^ -> pallet_house_2f @^ face=left           # bước lên ô rồi mới chuyển

[actors]
joey @j sprite=youngster name="Youngster Joey" face=left los=4 script=joey team=19:10 money=300 exp=40 spotted=boy_1
potion @k kind=item item=potion sprite=sprite11
sign @s kind=sign script=sign_pallet
guy @g sprite=generic_22 path=right4,left4 script=...   # đi tuần; look=random thì nhìn quanh

[script joey]
if beat_joey > after
say Hey! You're a new trainer, aren't you?
battle self
:after
say My Rattata is in the top percentage of Rattata!
```

### Cọ (`tools/maps/brushes.txt`)

| Khoá | Nghĩa |
|---|---|
| `ground=c,r` / `c,r\|c,r` / `sand` / `dirt` | ô nền; nhiều ô thì chọn theo băm toạ độ; `sand`/`dirt` tự nối trên cỏ |
| `checker=a\|b\|c\|d` | lát 2×2 (sàn gỗ nhà `43,1\|44,1\|43,0\|44,0`) |
| `over=` `h=` `wall=` `water` `solid` `counter` `ledge=down` `grass=<vùng>` `mark` | lớp 2, độ cao, vách, nước, chặn, quầy, gờ, cỏ gặp, mốc |
| `prop=` `step=WxH` | vùng liền nhau cùng kí tự lát prop theo bước (cây `tree_2` 2×2 phải thẳng lưới 2 ô, công cụ báo lỗi nếu lệch) |
| `prop=` `size=WxH` `pivot=px,pz` | một prop; `pivot` đặt gốc prefab ở góc ô (x0+px, y0+pz) như `MapObjectStruct` số nguyên |
| `align=front\|back` `dx dz dy ry` | không có pivot thì căn tâm AABB vào vùng; dán mặt trước/sau vào mép vùng |
| `door=dx,dz` `doorprop=` | ô cửa trong vùng nhà và prop cánh cửa (gốc ở mép tường trước) |

- **Ô tự nối cát/đất trên cỏ** [ĐO TRONG REPO]: khối 4 cột ở hàng 55–63 của atlas 1 (cát cột 20–23, đất đá 24–27), đo bằng
  mặt nạ màu cỏ từng ô 8 px. Góc ngoài `(b+2,63) TL, (b+1,63) TR, (b,63) BL, (b+3,63) BR`; cạnh trên `(b,62)/(b+1,62)` xen
  kẽ theo cột, cạnh dưới `(b,59)/(b+1,59)`, cạnh trái `(b,61)/(b,60)` xen theo hàng, cạnh phải `(b+1,61)/(b+1,60)`; góc
  trong `(b+2,60) (b+3,60) (b+2,59) (b+3,59)`; lối 1 ô `(b,58)` dọc, `(b+1,58)` ngang. Tâm cát dùng ô tên `Sand` (1,59).
  Viền cỏ mảnh 8 px nằm trong ô của vùng cát. Lối đi nên rộng ≥ 2 ô (lối 1 ô không có đầu mút).
- **Cỏ** `14,59|15,59|14,60|15,60` khớp màu cỏ của viền cát [SUY RA bằng mắt].
- **Nhà ngoài trời** đặt gốc ở mép tường trước (`pivot=2,4` cho nhà 5×4): cửa `door_ext_*` cùng gốc với nhà
  [ĐO TRONG REPO: AABB cửa z -0,19..0,09 quanh gốc], cửa là ô hàng cuối của vùng, người chơi đứng ngay dưới.
- **Trong nhà**: vỏ phòng (`int_house_1`, `interior_lab_3`, `pokiecentre`, `interior_blank_room_*`) đặt bằng kí tự `S` ở ô
  (0,0) với `pivot`; ô chặn vẽ bằng `W`. Vị trí tường/quầy đo trên ảnh `&overview=1&grid=1`, không có số gốc.

### Kịch bản (`[script tên]`, chạy bởi `js/world-script.js`)

Một lệnh mỗi dòng, nhãn `:tên`, `end` là nhãn kết thúc. `lệnh@Tên_Người` đổi người nói (`say@Prof._Oak ...`).
`{player}`, `{rival}`, `\n` được thay khi nói.

| Lệnh | |
|---|---|
| `say` `choose Hỏi? \| A > nhãn \| B > nhãn` | hộp thoại `Panel - Scripts` của shell (tối đa 4 lựa chọn) |
| `if cờ > nhãn`, `ifnot`, `goto`, `end` | điều kiện: cờ, `quest=<id>`, `done=<id>`, `item=<id>`, `party` |
| `set` `clear` `hide cờ` `show cờ` | `hide` đặt cờ rồi ẩn NPC có `hideif=cờ` |
| `battle self` / `battle name=Gary team=4:5 music=… canlose win=… lose=…` | trận trainer; thắng thì cờ `beat_<id>` |
| `heal` `lastheal` `shop id:giá …` `pc` | `P1.ui.heal/shop/open('pokebox')`; `lastheal` ghi chỗ về khi thua |
| `give id n` `givemon dex lv` `money n` `exp n` | túi đồ, đội (đầy thì vào hộp), tiền, EXP huấn luyện viên |
| `quest id` `questdone id` | bắt đầu / xong nhiệm vụ: thưởng theo `quests.txt`, tiếng `quest_update_1` / `quest_complete` |
| `face [ai] hướng\|player` `move [ai] up2 left1` `warp map x y hướng` `wait s` | |
| `sfx` `music key\|map` `cry dex` `showmon dex` `hidemon` `emote key` | ảnh lớn `art/sprite/poke/big/<dex>.png` khi chọn khởi đầu |

## Số đo từ bản gốc (`data/world.js`, `tools/rip_world.py`)

- **Đi theo ô** [ĐO TRONG REPO]: `CharacterHandler.MoveSpeed` = 3,25 ô/giây, người chơi, NPC và người chơi mạng như nhau.
- **Khung sprite** [ĐO TRONG REPO]: `Sprite Offset` ở (0,5; 0,2; −0,35) so với gốc nhân vật, xoay 35° quanh x; `Quad - Body`
  scale 2 (quad 2×2); bóng `Quad - Shadow` 1×0,5 ở (0; −0,8; 0,06), 60°, ảnh `shadow` alpha 0,56. Mặt đất = gốc − 0,6
  [SUY RA: 19 con của `NPCPrefab` đặt ở y = −0,6]. Pokémon đi theo: offset (0,5; 0,2; −0,15), 40°, bóng tắt.
- **Máy ảnh** [ĐO TRONG REPO]: `GameCamera.Offset` (0, 14, −14,5) quanh `Sprite Offset` của người chơi, Transform 45°, fov 30,
  near 0,3, far 56, nền xám 0,689. `speed` = 8 dùng làm hệ số lerp [SUY RA: mã Update bị mã hoá].
- **Ánh sáng** [ĐO TRONG REPO]: một đèn hướng trắng 0,7 chiếu (0; −0,707; −0,707) (khung three), ambient phẳng 0,412.
  `MapManager.EnviromentColours` có 7 màu không nhãn; gán [2] trắng = ngày, [3] = sáng, [4] cam = chiều, [5] lam = đêm là
  [SUY RA] theo màu. Mốc giờ buổi lấy từ `P1.period()` (HGSS, chưa có nguồn PokéOne).
- **Hạt** [ĐO TRONG REPO]: `Special Grass` lá xanh bắn lên (sống 0,8 s, tốc 3,5, cỡ 0,25, trọng lực 1, `CFX3_T_Leaf`);
  `Dust Effect` sau khi nhảy gờ. Bản gốc phát liên tục khi còn trong cỏ; ở đây một đợt 4 lá mỗi bước [SUY RA].
- **Cửa** [ĐO TRONG REPO]: `door_ext_*` con `Door_2` clip `Take 001` xoay 89,6° ở 0,87 s. Ở đây xoay trong 0,35 s rồi mới đen màn.
- **"!" khi trainer thấy** [ĐO TRONG REPO]: `EmoteAtlas` sprite `"1"`, bong bóng phóng 0 → 1 trong 0,25 s. Chọn emote 1 cho
  trainer là [SUY RA]. `SpottedSFX` do server gửi nên nhạc phát hiện lấy theo lớp NPC trong `P1.MUSIC` (`boy_1`, `lass`...) [ĐỀ XUẤT].
- **Không đo được** (trường private, `GameAssembly.dll` có section `.themida`): `AnimationSpeed`, `JumpSpeed`, tốc độ
  Pokémon đi theo. Đặt tay: khung bước = nửa đầu mỗi bước, nhảy 2 ô ở 0,75 × tốc đi, cao 0,9.

## Luật chơi và nguồn

- **Nhiệm vụ** (`tools/maps/quests.txt`) [wiki Main_Quests]: The Pokémon Prof. → First Battle → Trainer on Route 1 → (Part 2)
  → Viridian City → (Part 2) Carl → (Part 3) Dizzy → (Part 4) ông già → Viridian Forest (chưa làm Route 2). EXP là EXP huấn
  luyện viên (`P1.state.trainerExp`), cộng tiền và vật phẩm. Sổ nhiệm vụ là panel gốc `Panel - Quests` (nút QUEST ảo, hoặc
  `P1.input.press('quests')`).
- **Trainer Route 1** [pokeonecommunity Viridian City]: Joey Rattata L10; Nancy Meowth L7 + Pidgey L6; Sherman Pidgey L9 +
  Rattata L9; thưởng 300. Vị trí và tầm nhìn (3–4 ô) là [ĐỀ XUẤT].
- **Gặp hoang dã**: bảng tỉ trọng theo buổi [pokeonecommunity]; cấp độ (2–5) và xác suất mỗi bước (11,7 % = FRLG 21/180)
  là [MAINLINE DEFAULT, not PokéOne-confirmed].
- **Gary** chọn khắc hệ và đấu ngay trong lab, thua vẫn đi tiếp (FRLG) [MAINLINE DEFAULT].
- **Thua cả đội**: mất nửa tiền, về chỗ `lastheal` (Trung tâm hoặc nhà), hồi đầy [MAINLINE DEFAULT, not PokéOne-confirmed].
- **Poké Mart Carl**: tặng 5 Poké Ball khi làm nhiệm vụ Part 2 [ĐỀ XUẤT], giá bán theo bảng pokeonecommunity.
- **Pokémon đi theo**: con đầu đội còn sống, nếu có sprite `follow` (`P1.FOLLOW_ROSTER`). Wiki ghi NOT FOUND nhưng máy khách
  có lớp `FollowPokemon` và `CharacterHandler.Follower` [ĐO TRONG REPO].

## Bẫy

- **[BẪY ĐÃ SẬP] Máy ảnh gốc ở −z Unity, không phải +z.** `GameCamera.Offset` z = −14,5. Bản web soi gương z mọi vị trí
  thế giới rút từ scene (`P1.WORLD.frame`); glb vẫn đảo x như `rip_map.py`. Tính cả hai lần đảo thì trái/phải giữ đúng.
- **[BẪY ĐÃ SẬP] `AnimationSpeed`/`JumpSpeed` không có trong dữ liệu**: trường private không serialize, mã bị Themida mã hoá.
- **[BẪY ĐÃ SẬP] Typetree của `MapManager` hỏng vì `int[,]`** (`TileHeight`, `TileFlags`): Unity không lưu mảng nhiều chiều.
  Bỏ hai nút đó (`read_mb_dropping`) thì đọc đủ màu môi trường, màu nước, đèn vùng tối.
- **[BẪY ĐÃ SẬP] BattleID "Poké Ball" trong `items.txt` là `pokball`** (mất chữ é) nhưng túi đồ dùng `pokeball`
  (`engine.js`, `core.js`). `build_maps.js` và `world-script.js` so khoá sau khi bỏ chữ e ấy.
- **[BẪY ĐÃ SẬP] `rip_2d.py` chỉ xuất 51 NPC đã chọn.** Nurse Joy (`sprite220`), Gary (`sprite46`), bóng vật phẩm
  (`sprite11`, chính là "PokeBall" trong `NPCPrefab`)... có trong `sdata` nhưng chưa ra đĩa: `rip_world.py npc` xuất thêm
  đúng các tấm map gọi, không ghi đè.
- **[BẪY ĐÃ SẬP] Kịch bản vào map chặn màn "Đang tải".** `main.js` chờ `scene.go('world')` xong mới gỡ màn chờ; kịch bản
  `enter` chờ hộp thoại nên phải chạy không `await`.
- **[BẪY ĐÃ SẬP] `heal` trong lab ghi đè chỗ về khi thua.** Thua trận hoang dã ở Route 1 đưa người chơi về lab Oak.
  Giờ chỉ `lastheal` (Nurse Joy, Mẹ) ghi chỗ về.
- **[BẪY ĐÃ SẬP] Sau trận hoang dã mode kẹt ở 'script'** (lấy mode lúc vào trận rồi đổi). Giờ trận giữ 'battle' cho tới khi
  mã đang chờ trận tự đặt lại.
- **[BẪY ĐÃ SẬP] Bài kiểm đi đường ngắn nhất né được Sherman** (tầm nhìn cột 17–19 hàng 14, BFS đi cột 20–21), nhiệm vụ
  Part 2 không xong. Bài kiểm giờ đi ngang tầm nhìn có chủ ý.
- **[BẪY ĐÃ SẬP] Hai lần tải map chồng nhau.** Thêm hoạt ảnh mở cửa (0,35 s) trước khi khoá `mode = 'warp'`: phím còn giữ
  gọi `useLink` lần hai, lab Oak bị dựng hai lần, một bản không bao giờ gỡ và hiện đè lên trường huấn luyện. Giờ khoá mode
  ngay đầu `useLink`, và `loadMap` bỏ kết quả của lần tải đã bị lần mới hơn thay. Bài kiểm đếm số nhóm `map:*` sau mỗi lần đổi map.
- Kí tự `#` không dùng được trong `[legend]` (là chú thích); tường trong nhà dùng `W`.
- `python -c` nhiều dòng hỏng vì `python` là shim cmd (xem `brain/codebase/ui-test-gotchas.md`).

## Còn thiếu

- Map gốc không có trong máy khách: bố cục là HGSS/FRLG thu theo cỡ prefab PokéOne, không phải bố cục thật của PokéOne.
- Bờ nước chỉ là mặt nước + vách đất; chưa đặt prop `ground_grass_to_water_*`/`waves` (anim UV chưa rút).
- Không lướt nước, câu cá, Headbutt, xe đạp/thú cưỡi, băng trượt, cầu, hang tối (có số đo đèn nhưng chưa dùng).
- Hạt `Shiny Sparkle` và `RippleEffect` đã rút số, chưa dùng (chưa có Pokémon đi theo shiny hay nước đi được).
- Route 2 / Viridian Forest chưa có: nhiệm vụ dừng ở "Viridian Forest".
- Đèn cửa sổ ban đêm (`nightLights`) chưa bật.
