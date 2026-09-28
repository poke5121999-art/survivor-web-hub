# Bản đồ 2D, nhân vật và cốt truyện mở đầu (build_maps.js, pro/rip_tiles.py, js/world*.js)

PRO (Pokémon Revolution Online) không để bản đồ trong máy khách: máy chủ gửi khi vào map. Ở đây mười hai map đầu game
Kanto (Pallet Town, nhà người chơi hai tầng, nhà Gary, lab Oak, Route 1, Viridian City, Trung tâm Pokémon, Poké Mart,
trường huấn luyện, Gym Viridian) được viết bằng chữ trong `tools/maps/*.txt`, vẽ bằng tấm tile PRO (`Resources/tiles/1..144`,
1024² px, ô 32 px) và dịch thành `data/maps.js`.

**Theo PRO, không theo PokéOne.** Pallet Town, Route 1, Viridian City và lab Oak dựng lại từ ảnh PRO thật
(`D:\pro-ref\pokemap\{Pallet_Town,Route_1,Viridian_City}.png`, `D:\pro-ref\wiki\lab1.png`): cùng cỡ (31×31, 31×51,
79×65, 14×13), cùng chỗ nhà, ao, đường, cỏ, gờ, cổng. Trong nhà khác (nhà người chơi, nhà Gary, Trung tâm, Mart,
trường, Gym) không có ảnh PRO (wiki PRO 503, fandom chặn): bố cục tự dựng bằng tranh PRO [ĐỀ XUẤT].

## Chạy

```
node games/pokeone/tools/build_maps.js             # tools/maps/*.txt -> data/maps.js, in bảng map; lỗi thì không ghi
node games/pokeone/tools/build_maps.js --check     # chỉ kiểm
set PYTHONIOENCODING=utf-8
python games/pokeone/tools/pro/rip_tiles.py        # chép art/pro/tiles/<tấm>.png + art/pro/npc/sprite<N>.png map dùng, xoá cái thừa
python games/pokeone/tools/pro/rip_tiles.py --preview <thư mục> [--grid]   # vẽ mỗi map ra PNG để soát, không cần trình duyệt
python games/pokeone/tools/pro/rip_tiles.py --npc-sheet <tệp.png>          # mục lục khung mặt trước của 570 sprite NPC
node test/pokeone-world.js                         # kiểm tĩnh + chơi thật bằng phím, ảnh mọi map ở %TEMP%\pokeone-world-shots
```

### Dựng map từ ảnh PRO thật (cần làm lại khi có ảnh mới)

```
python games/pokeone/tools/pro/match_ref.py <ảnh> <ra> [--scale 0.5]          # 5 ô tile PRO gần nhất cho mỗi ô, ~2 phút
python games/pokeone/tools/pro/fit_ref.py <ảnh> <ra>/cells.json <ra>/x.stamps [--scale 0.5] [--path 96,108,112
    --path-auto "17:4,15;17:6,13"] [--walk-frac 0.35] [--lambda 20000]       # tách thành con tem + lưới gợi ý
python games/pokeone/tools/pro/gen_zones.py                                     # zones.txt từ bảng spawn PRO
```

- `match_ref.py`: ảnh tham chiếu mờ (co giãn/webp) nên không khớp đúng từng điểm ảnh [ĐO: 0/961 ô khớp tuyệt đối,
  RMSE trung vị ~31]. Lọc thô ở khối 8×8 rồi xếp lại 40 ứng viên ở 32×32 sau khi làm mờ ứng viên. Ra `cells.json`,
  `grid.png` (ảnh gốc kẻ lưới, nhãn toạ độ mỗi 5 ô) và `rebuild.png` (gốc | dựng bằng ô tốt nhất).
- `fit_ref.py`: (A) vật nhiều ô: `--objects` người dựng chỉ ra (nhà cổng, đèn đôi, ghế, hộp thư — máy dò hay cắt
  đôi) rồi các vật được đa số ô bỏ phiếu, chọn tham lam theo mức giảm sai số ở khối 4 px; (B) rừng: trồng nguyên cây
  theo lưới so le 2×2 trên ô không đi được và ngoài vùng `--clear`, loại cây theo phiếu của các ô dưới tán (giữ tỉ lệ
  cây tròn/thông từng vùng); (C) ô lẻ chỉ khi chắc chắn (ô tốt nhất, sai số < `--conf`, là vật nhỏ trọn vẹn hoặc cỏ lá/
  gờ). Ô không chắc thành nền trơn hoặc cây nguyên, không bao giờ thành mảnh vụn. Ra `.stamps` (dòng
  `S:c,r,WxH x,y foot=N`), `.grid.txt` (`#` chặn, `,` đường, `.` đi được) và `.png` (gốc | dựng lại).
  [ĐO 2026-09-28] RMSE khối 4 px giữa bản vẽ trong game và ảnh PRO: Pallet 36,7, Route 1 34,9, Viridian 40,6 (thang
  255). Số này cao hơn lần trước (23,9 / 33,7 / 36,5) vì đã bỏ khảm ô lẻ khớp màu: ảnh sạch hơn nhưng rừng không trùng
  từng cây với ảnh gốc.
- Rồi sửa tay (kịch bản dựng map ở scratchpad của phiên, không vào repo): bỏ ô đường/cỏ lẻ (đường vẽ lại bằng cọ tự
  nối), đặt cửa, mốc NPC, cổng, ao; kiểm đường đi bằng BFS từ lối vào tới mọi cửa.
- Soát: `rip_tiles.py --preview` rồi ghép cạnh ảnh gốc. Ảnh so sánh của lần dựng 2026-09-28: scratchpad `cmp/*.png`.

- Luôn chạy `build_maps.js` rồi `rip_tiles.py`: công cụ thứ hai đọc `data/maps.js` để biết tấm nào, sprite nào cần chép.
- Nạp gói PRO (`D:\pro-ref\PROClient\...\data.unity3d`) mất khoảng 2 phút; ảnh gốc được đệm ở `D:\pro-ref\cache` nên lần
  sau chỉ đọc đệm. Mục lục tile để chọn ô: `D:\pro-ref\catalog\index_NN.png` (12 tấm/ảnh), `sheet_<n>.png` (lưới 32 px,
  nhãn cột,hàng mỗi 4 ô), `raw_<n>.png` (tools/pro/catalog_tiles.py).
- Cả hai công cụ chạy lại ra cùng kết quả (ô cỏ đổi theo băm toạ độ, không ngẫu nhiên).
- `build_maps.js` gom mọi lỗi rồi in một lần: kí tự không có trong chú giải, cọ/ô tile sai cú pháp, ô không có nền, đường
  tự nối rộng 1 ô, vùng tem không phải hình chữ nhật, tem lệch lưới bước, cửa ngoài chân nhà, cửa nối tới ô bị chặn, nhãn
  kịch bản thiếu, vật phẩm/nhạc/tiếng không có, NPC đứng trên ô chặn. `rip_tiles.py` báo ô tham chiếu trong suốt hoàn toàn
  (gõ nhầm toạ độ).
- Tham số gỡ lỗi của trang: `?map=<id>&x=&z=` vào thẳng, `&grid=1` phủ lưới ô (đỏ chặn, tím quầy, vàng gờ, xanh cỏ gặp,
  lam cửa nối), `&period=night` ép buổi, `&touch=1` hiện phím ảo, `&nosave=1` không tự lưu.
  `P1.world.debug = { encounterRate, noEncounter, forceSpecies }`.

## Dạng dữ liệu `P1.MAPS[id]`

| Trường | |
|---|---|
| `w`, `h` | số ô |
| `ground` | mảng lớp, mỗi lớp `w·h` tham chiếu tile, vẽ theo thứ tự DƯỚI nhân vật: lớp 0 là nền, các lớp sau là tem/hoa |
| `over` | mảng lớp vẽ TRÊN mọi nhân vật (mái nhà, ngọn cây nằm trên chân) |
| tham chiếu tile | `tấm·1024 + hàng·32 + cột`, −1 = trống. Ảnh `art/pro/tiles/<tấm>.png`, ô nguồn `(cột·32, hàng·32, 32, 32)` |
| `colliders` | 0 đi được, 1 chặn, 2/3/4/5 gờ nhảy xuống/trái/phải/lên, 6 quầy (nói chuyện qua được) |
| `water` | 1 = nước |
| `zones` | `{ grid: chỉ số vùng+1, ids, tables: { vùng: { rate, morning/day/evening/night: [{dex, w, min, max}] } } }` |
| `links` | `{ x, y, to, tx, ty, face, kind: 'door'|'edge'|'stairs'|'warp', sfx }`; cửa nối cạnh nằm ở x=−1/w, y=−1/h |
| `npcs` | `{ id, kind: npc/sign/item, x, y, face, name, sprite: 'spriteN', script, look, path, los, trainer: {team, money, exp, music, spotted} }` |
| `settings` | `{ song, indoors, bg, encounterRate, mapName, spawn, enter, region }`; `bg` = họ nền trận PRO (`land`, `forest`, `indoor`…) |
| `sheets` | các tấm tile map dùng (nạp trước khi vẽ) |

Cùng tệp có `P1.SCRIPTS`, `P1.QUESTS`, `P1.QUEST_ORDER`, `P1.MAP_NAMES`.

## Viết một bản đồ (`tools/maps/<id>.txt`)

```
name: Pallet Town          # tên vùng (HUD, bảng tên khi đổi vùng)
song: pallet_town          # khoá P1.MUSIC
indoors: 1                 # trong nhà: nền đen quanh map, không tô ngày/đêm, bg mặc định 'indoor'
bg: forest                 # họ nền trận (mặc định land / indoor)
encounter: normal          # normal | low | verylow
spawn: @p                  # chỗ đứng khi New Game (chỉ phòng ngủ)
enter: intro               # kịch bản chạy mỗi lần vào map (tự kiểm cờ)

[legend]
. grass                    # kí tự  tên_cọ  [khoá=giá_trị thêm, đè lên cọ]
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
joey @j sprite=sprite77 name="Youngster Joey" face=left los=4 script=joey team=19:10 money=300 exp=40 spotted=boy_1
potion @k kind=item item=potion sprite=sprite11
sign @s kind=sign script=sign_pallet
guy @g sprite=sprite40 path=right4,left4 script=...   # đi tuần; look=random thì nhìn quanh

[script joey]
if beat_joey > after
say Hey! You're a new trainer, aren't you?
battle self
:after
say My Rattata is in the top percentage of Rattata!
```

### Cọ (`tools/maps/brushes.txt`)

Mỗi dòng `tên khoá=giá_trị ...`. Ô tile viết `S:c,r` (tấm S, cột c, hàng r trên `sheet_<S>.png`), khối viết `S:c,r,WxH`.

| Khoá | Nghĩa |
|---|---|
| `base=<cọ>` | kế thừa mọi khoá của cọ khác (khoá của mình đè lên); cọ có `stamp`/`fill` không kế thừa `deco` |
| `ground=S:c,r\|S:c,r` | ô nền lớp 0; nhiều ô thì chọn theo băm toạ độ (lặp một ô để tăng tỉ lệ) |
| `deco=S:c,r\|-\|-` | ô trang trí trong suốt chồng lên nền (hoa, sỏi); `-` = để trống, để rắc thưa |
| `over=S:c,r` | một ô vào lớp trên nhân vật |
| `auto=S:c,r` `inner=…` | ô tự nối: `auto` = góc trái trên khung 3×3, `inner` = góc trong (xem dưới); các ô cùng `auto=` nối với nhau. Cọ có `ground` thì ô tự nối chồng lên nền (khung viền trong suốt), không thì thay nền |
| `fill=S:c,r,WxH` | lát mẫu W×H theo toạ độ tính từ góc vùng (tường, sàn hoa văn, rừng dày); `fill2` = chồng lên nền thay vì thay nền |
| `stamp=S:c,r,WxH` | tranh nhiều ô. Vùng kí tự trên lưới là **chân**; hàng tranh nằm trên chân vào lớp `over` (vẽ đè nhân vật), hàng từ chân trở xuống (thân, bóng đổ) vào lớp nền chồng |
| `at=ax,ay` | ô tranh (ax, ay) đặt ở góc trái trên của chân. Mặc định canh đáy: ax=0, ay=H−cao chân. Dùng khi tranh có bóng đổ bên dưới/bên phải thân |
| `under` | mọi hàng tranh vào lớp nền dưới nhân vật, kể cả phần trên chân (ngọn cỏ cao) |
| `step=WxH` | lát chân W×H lặp trong vùng (rừng cây); vùng phải thẳng lưới bước, công cụ báo lỗi nếu lệch |
| `door=dx,dy` | ô cửa trong chân (tính từ góc trái trên của chân) |
| `[stamps]` (khối trong map) | mỗi dòng `S:c,r,WxH x,y [foot=N] [under\|over]` đặt thẳng một con tem ở toạ độ; N hàng dưới là chân (mặc định 1). Phần trên chân vào lớp `over` chỉ khi chân có ô chặn trên lưới, không thì nằm dưới nhân vật (luống hoa, thảm). Va chạm vẫn lấy từ `[grid]` |
| `solid` `water` `counter` `ledge=down\|left\|right` `grass=<vùng>` `mark` | chặn, nước, quầy, gờ nhảy, cỏ gặp Pokémon, mốc cho `@kí_tự` |

- **Ô tự nối PRO** [ĐO TRONG REPO bằng mặt nạ alpha và màu cỏ trên tấm 9, 35, 60, 79]: PRO không có một khuôn duy nhất.
  Mỗi vật liệu có khung 3×3 (góc TL/T/TR, L/tâm/R, BL/B/BR) và bốn ô góc trong; vị trí góc trong đổi theo tấm:
  - kiểu khối 2×2 (tấm 35, 60, 79): lỗ nền nằm ở tâm khối, `inner=S:c,r` là góc trái trên khối — (c,r) khi ô chéo
    đông-nam khác vật liệu, (c+1,r) tây-nam, (c,r+1) đông-bắc, (c+1,r+1) tây-bắc. Tấm 35: khung 35:9,5, góc trong 35:10,3
    (cạnh đó là bản có lỗ trong suốt ở 35:8,3). Tấm 60 (đất): khung 60:16,29, góc trong 60:16,27. Tấm 79 (nước tím):
    khung 79:16,9, góc trong 79:16,12.
  - kiểu rời (tấm 9, kiểu RPG Maker XP): khung ở hàng r+1..r+3, góc trong ở (c,r) ĐN, (c+2,r) TN, (c,r+4) ĐB, (c+2,r+4) TB;
    viền ngoài trong suốt nên chồng lên cỏ: `inner=9:3,0|9:5,0|9:3,4|9:5,4`.
  - Viền cỏ vẽ sẵn của 35:9,5 và 79:16,9 đúng màu cỏ nền (182,226,160); 60:16,29 lệch nhẹ (176,225,151).
  Không có ô cho lối rộng 1 ô: lối đi phải rộng ≥ 2 ô (công cụ báo lỗi).
- **Lớp chồng**: tem đặt từ bắc xuống nam; ô đã có tile ở một lớp thì tile sau lên lớp kế tiếp, nên trong từng ô cái đặt
  sau vẽ đè cái đặt trước (cây phía nam đè ngọn cây phía bắc, bóng nhà đè hàng rào).
- **Chân và mái**: người chơi đứng ở ô ngay trên chân nhà/cây bị mái/ngọn cây (lớp `over`) che, như PRO.

### Kịch bản (`[script tên]`, chạy bởi `js/world-script.js`)

Một lệnh mỗi dòng, nhãn `:tên`, `end` là nhãn kết thúc. `lệnh@Tên_Người` đổi người nói (`say@Prof._Oak ...`).
`{player}`, `{rival}`, `\n` được thay khi nói.

| Lệnh | |
|---|---|
| `say` `choose Hỏi? \| A > nhãn \| B > nhãn` | hộp thoại `P1.dialog` (tối đa 4 lựa chọn) |
| `if cờ > nhãn`, `ifnot`, `goto`, `end` | điều kiện: cờ, `quest=<id>`, `done=<id>`, `item=<id>`, `party` |
| `set` `clear` `hide cờ` `show cờ` | `hide` đặt cờ rồi ẩn NPC có `hideif=cờ` |
| `battle self` / `battle name=Gary team=4:5 music=… canlose win=… lose=…` | trận trainer; thắng thì cờ `beat_<id>` |
| `heal` `lastheal` `shop id:giá …` `pc` | `P1.ui.heal/shop/open('pokebox')`; `lastheal` ghi chỗ về khi thua |
| `give id n` `givemon dex lv` `money n` `exp n` | túi đồ, đội (đầy thì vào hộp), tiền, EXP huấn luyện viên |
| `quest id` `questdone id` | bắt đầu / xong nhiệm vụ: thưởng theo `quests.txt` |
| `face [ai] hướng\|player` `move [ai] up2 left1` `warp map x y hướng` `wait s` | |
| `sfx` `music key\|map` `cry dex` `showmon dex` `hidemon` `emote key` | ảnh lớn `art/pro/poke/front/<dex>.png` khi chọn khởi đầu |
| `call <kịch bản>` | chạy hết kịch bản khác rồi quay lại (phần chung sau khi chọn bóng khởi đầu) |
| `raid <bossId>` | mở sảnh đánh boss: `P1.raid.openLobby(bossId)` (luồng mạng, `js/raid.js`) |

## Tranh PRO đã chọn

Chọn bằng mắt trên `D:\pro-ref\catalog`, soát bằng `rip_tiles.py --preview` và ảnh chụp trong trò chơi.

| Thứ | Ô | Ghi chú |
|---|---|---|
| Cỏ nền | 60:23,8 (×3), 1:7,0 | màu chính (182,226,160), trùng màu cỏ trong ảnh PRO |
| Đường cát / đường nhựa / ao | 38:16,16 (góc trong 38:19,14) / 17:4,15 (17:6,13) / 6:24,3 (6:27,3) | [ĐO] dò trên ảnh PRO bằng match_ref.py |
| Cỏ lá gặp Pokémon | 58:30,0 58:31,1 1:6,0 … | ô lẻ do fit_ref.py đặt; vùng gặp = ô `"` trên lưới |
| Gờ đất Route 1 | tấm 41 (41:21,24 …), 39:17,8 | tranh gờ thật của PRO (lần trước tưởng không có) |
| Rừng | 1:8,0 1:12,0 1:8,5 1:12,5 (thông 4×5), 2:8,0 2:11,0 2:8,4 2:11,4 (tròn 3×4) | `--trees` của fit_ref.py |
| Nhà Pallet đỏ / nhà Gary xanh / lab Oak | 4:0,0 6×8 / 5:0,1 6×7 / 5:0,24 8×6 | [ĐO] khớp ảnh Pallet_Town.png |
| Cổng Route 1 ↔ Viridian | 5:16,0 7×12 | cùng tranh ở hai đầu |
| Viridian: Trung tâm, Mart, trường, Gym, nhà | tấm 31, 14, 9, 12 | con tem trong `[stamps]` của viridian_city.txt |
| Lab Oak (ảnh lab1.png) | sàn 7:5,7 2×2, tường 30:12,0, máy hồi phục 28:20,14, tủ kính 28:19,9, tủ 6:16,28, ghế 7:11,17, bàn 7:8,1, thảm 7:12,25 | màu tường PRO xanh ngọc đậm hơn 30:12,0 [SUY RA: PRO tô màu lúc chạy] |
| Biển (trong nhà khác) | 104:24,8 2×2, 60:23,23 1×2 ("OAK") | |
| Sàn / tường trong nhà | 89:12,5 gỗ, 89:10,11 Trung tâm, 89:11,11 lab, 89:9,11 Mart / 91:16,2 1×2 … | tường là cặp 1×2 lát ngang |
| Đồ đạc | tấm 93, 94, 96, 97, 98, 99, 100, 104 | tên cọ trong `brushes.txt` |

Sprite NPC PRO (`npc/spriteN`, số KHÔNG trùng PokéOne) chọn trên `--npc-sheet`: Oak 261, Gary 46, Mẹ 247, Daisy 186, lab Oak không còn trợ lý (ảnh PRO không có),
Nurse Joy 26, Carl (Mart) 38, Joey 24, Nancy 199, Sherman 184, Franky 126, ông già 8, cô gái 163 / 25,
người máy móc 34, quý ông 79, Dizzy 137, học sinh 190, cậu bé 110 / 200, Giovanni 47, bóng vật phẩm 178
(tấm bóng duy nhất trong `npc/`, màu Master Ball).

## Luật chơi và nguồn

- **Nhiệm vụ** (`tools/maps/quests.txt`) [wiki PokéOne Main_Quests]: The Pokémon Prof. → First Battle → Trainer on Route 1 →
  (Part 2) → Viridian City → (Part 2) Carl → (Part 3) Dizzy → (Part 4) ông già → Viridian Forest (chưa làm Route 2).
- **Trainer Route 1**: Joey Rattata L10; Nancy Meowth L7 + Pidgey L6; Sherman Pidgey L9 + Rattata L9; thưởng 300.
  Vị trí và tầm nhìn (3–4 ô) là [ĐỀ XUẤT].
- **Gặp hoang dã**: bảng tỉ trọng theo buổi [pokeonecommunity]; cấp độ (2–5) và xác suất mỗi bước (11,7 % = FRLG 21/180)
  là [MAINLINE DEFAULT].
- **Gary** chọn khắc hệ và đấu ngay trong lab, thua vẫn đi tiếp (FRLG) [MAINLINE DEFAULT].
- **Thua cả đội**: mất nửa tiền, về chỗ `lastheal` (Trung tâm hoặc nhà), hồi đầy [MAINLINE DEFAULT].
- **Gặp hoang dã** (`tools/maps/zones.txt`, sinh bởi `tools/pro/gen_zones.py`): bảng spawn trên cỏ của PRO
  (`D:\pro-ref\pokemap\pro_land_spawns.json`, ảnh chụp 2026-07-18), bỏ dòng MemberOnly; tỉ trọng Common 10 / Uncommon 4 /
  Rare 1 và buổi chiều = ô "ngày" của PRO là [ĐỀ XUẤT]. Pallet Town và Viridian City không có spawn trên cỏ trong PRO nên
  không có vùng gặp. Đồ cầm (Sitrus Berry, Oran Berry...) chưa dùng vì `P1.mon.create` chưa nhận đồ cầm.
- **Lab Oak** [Kanto Guide PRO]: ba bóng Bulbasaur/Charmander/Squirtle trên bàn (trái -> phải); bóng tia chớp trên sàn là
  Pikachu, chỉ chọn được sau khi đã từ chối cả ba; chọn xong bóng biến mất; nói lại với Oak để nhận Pokédex. Gary lấy bóng
  khắc hệ; chọn Pikachu thì Gary dùng Eevee [SUY RA theo bản Yellow, chưa có nguồn PRO].
- **Mẹ** [Kanto Guide PRO]: cho [PD]10.000; hai bóng vật phẩm trong nhà (5 Poké Ball, 5 Potion) hiện ra sau khi nói với Mẹ.
- **Gym Viridian**: Giovanni nói hai câu rồi `raid giovanni` (bảng boss: thủ lĩnh Gym, Tứ Thiên Vương, Nhà vô địch như PRO,
  `js/raid.js` của luồng mạng). Bố cục phòng không có ảnh PRO [ĐỀ XUẤT].
- **[CHƯA CÓ NGUỒN PRO]** các nhiệm vụ lấy từ PokéOne: Trainer on Route 1 (Joey, Nancy, Sherman), Viridian City 1..4
  (Nurse Joy, Carl, Dizzy, ông già), cùng trainer Route 1 và NPC Franky. Giữ làm khung chơi đến khi có dữ liệu PRO.

### Sprite NPC cho thủ lĩnh / Tứ Thiên Vương / Nhà vô địch (chọn trên `--npc-sheet`, dùng khi làm các thị trấn sau)

| Nhân vật | sprite | |
|---|---|---|
| Giovanni | 47 | com lê đen, tóc đen (đang dùng ở Gym Viridian) |
| Blue (Nhà vô địch) | 46 | tóc cam dựng (cũng là Gary ở lab) |
| Lance | 67 | tóc đỏ dựng, áo choàng |
| Misty | 181 | tóc cam buộc lệch |
| Erika | 36 | tóc đen, băng đô, kimono |
| Lorelei | 64 | tóc đỏ, kính |
| Lt. Surge | 37 | tóc vàng, kính râm, áo rằn ri (khớp hơn 73) |
| Brock | 27 | tóc nâu dựng, áo cam |
| Bruno | 74 | búi tóc, cởi trần (khớp hơn 66: 66 tóc dựng, không búi) |
| Koga | 167 | bịt mặt kiểu ninja [ĐỀ XUẤT] |
| Sabrina | 39 | tóc xanh đậm [ĐỀ XUẤT] |
| Blaine | 34 | hói, không kính râm [ĐỀ XUẤT] |
| Agatha | 9 | bà cụ tóc bạc áo hồng [ĐỀ XUẤT] |

`rip_tiles.py` chép luôn các sprite trong bảng `BOSSES` của `js/raid.js` (đọc thẳng từ mã) vì sảnh raid hiện mặt boss.
- **Save cũ của bản 3D** có toạ độ theo lưới cũ: vào map mà ô lưu ngoài map hoặc bị chặn thì về mốc `spawn`, không có
  thì về ô trống gần cửa vào (bài kiểm: `viridian_mart` với x=40, z=40).

## Bẫy

- **[BẪY ĐÃ SẬP] BattleID "Poké Ball" trong `items.txt` là `pokball`** (mất chữ é) nhưng túi đồ dùng `pokeball`.
  `build_maps.js` và `world-script.js` so khoá sau khi bỏ chữ e ấy.
- **[BẪY ĐÃ SẬP] Kịch bản vào map chặn màn "Đang tải".** `main.js` chờ `scene.go('world')` xong mới gỡ màn chờ; kịch bản
  `enter` chờ hộp thoại nên phải chạy không `await`.
- **[BẪY ĐÃ SẬP] `heal` trong lab ghi đè chỗ về khi thua.** Giờ chỉ `lastheal` (Nurse Joy, Mẹ) ghi chỗ về.
- **[BẪY ĐÃ SẬP] Hai lần tải map chồng nhau.** Phím còn giữ trong lúc chuyển map gọi `useLink` lần hai. `useLink` khoá
  mode ngay đầu, `loadMap` bỏ kết quả của lần tải đã bị lần mới hơn thay.
- Số sprite NPC của PokéOne cũ KHÔNG khớp số của PRO: mọi `sprite=` đã chọn lại bằng mắt trên `--npc-sheet`.
- **[BẪY ĐÃ SẬP] Hàng sprite người PRO: hàng 1 quay PHẢI, hàng 3 quay TRÁI** (hàng 0 lưng, 2 mặt), ngược với ghi chú cũ.
  Đo trên `npc/sprite1` và `player/.../body`. `rip_tiles.py --preview` và `world-actor.js` đều theo thứ tự này.
- **[BẪY ĐÃ SẬP] Bố cục tự nghĩ trông "lạ".** Lần đầu map dựng theo FRLG với tranh chọn bừa; chủ dự án nhận ra ngay. Có
  ảnh PRO thật thì dựng theo ảnh (match_ref.py + fit_ref.py), không đoán.
- **[BẪY ĐÃ SẬP] Ảnh tham chiếu mờ, khớp đúng điểm ảnh = 0 ô.** So ở khối 4–8 px và làm mờ ứng viên mới xếp hạng được.
- **[BẪY ĐÃ SẬP] Tham lam ô lẻ trên rừng ra khảm vụn** (mỗi ô một mẩu cây khác nhau): rừng phải trồng nguyên cây theo lưới.
- **[BẪY ĐÃ SẬP] Tem nhiều ô mang theo đồ vật bên cạnh.** Tấm PRO xếp sát nhau: khung 7×8 của lab Oak dính tảng đá, khung
  6 ô của nhà Pallet dính luống hoa. Luôn soát `--preview` sau khi thêm tem; cắt tem thành mảnh nếu cần.
- **[BẪY ĐÃ SẬP] Bóng đổ vẽ sẵn là hình chữ nhật mờ.** Hàng bóng dưới đáy tranh (trường, Mart) bị cắt vuông khi khung
  tem không lấy trọn: bỏ hàng bóng ra khỏi tem thì đẹp hơn.
- Tile thiếu thì ô trống lộ nền đen: `rip_tiles.py` báo ô lớp nền trỏ vào ô trong suốt.
- Kí tự `#` không dùng được trong `[legend]` (là chú thích); tường trong nhà dùng `W`.
- `python -c` nhiều dòng hỏng vì `python` là shim cmd: dùng `python - <<'EOF'`.

## Còn thiếu

- Bố cục map là FRLG/HGSS thu theo cỡ tranh PRO, không phải bố cục thật của PRO (máy chủ giữ).
- Nước chưa có hoạt ảnh; không lướt nước, câu cá, Headbutt, xe đạp.
- `rip_tiles.py` chỉ giữ các ô map dùng trong mỗi tấm (phần còn lại trong suốt): 79 tấm, ~0,8 MB. Viridian dùng ô từ ~50 tấm
  nên nạp 50 ảnh nhỏ; gom thành một atlas sẽ ít yêu cầu mạng hơn.
- Rừng dựng lại chưa giống hệt: PRO lát cây chồng nhiều lớp, `fit_ref.py` chọn một loại cây mỗi gốc so le 2×2 nên rừng
  thưa/đều hơn ảnh gốc; một số ô lẻ khớp nhầm (chấm quả, ô vụn) đã lọc (`junk`), còn sót ít.
- Route 2 / Viridian Forest chưa có: nhiệm vụ dừng ở "Viridian Forest".
