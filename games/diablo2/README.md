# Ác Quỷ II

Bản làm lại Diablo II bằng canvas/JS thuần, không engine, mở được từ `file://`.
Đủ 5 act: 131 khu sinh từ DS1 gốc (thiếu Moo Moo Farm và 5 khu phụ của Act V), bảy lớp với mọi kỹ năng,
triệu hồi và biến hình, lính đánh thuê, waypoint, rương, nhiệm vụ, trùm của cả 5 act, ba độ khó.

## Luật của chủ dự án

- 2026-10-06: **dùng bộ asset và config của Diablo II** từ bản D2R ở `D:\Diablo2`. Bỏ hẳn art Flare của ngày 2026-10-01.
- Hình, tiếng, bản đồ, số liệu đều lấy từ game gốc. Không vẽ tay, không tự chế số.

## Nguồn

Bản D2R 3.1.91636. Kho CASC được giải nén ở `D:\d2r-ref`, bóc ra `D:\d2r-ref\fs\data\data\{global,local}`.

| Phần | File gốc | Lever (chạy lại được) | Ra |
|---|---|---|---|
| Nhân vật, quái, NPC | `global/chars`, `global/monsters` (DCC + COF), `animdata.d2` | `_tools/build_sprites.py` | `m/hero_*`, `m/mon_*`, `m/npc_*` |
| Vật thể, đạn, overlay, đồ rơi | `global/objects`, `missiles`, `overlays`, `items/flp*` | `_tools/build_objects.py` | `m/obj_act*`, `m/mis`, `m/ovl`, `m/flp` |
| Tile, bản đồ mẫu | `global/tiles/act*/**` (DT1 + DS1), `lvlprest/lvltypes/lvlmaze.txt` | `_tools/build_world.py --acts 1,2,3,4,5` | `m/world_act*`, `m/maps_act*` |
| UI, icon đồ, icon kỹ năng, tiếng, nhạc | `global/ui` (DC6), `items/inv*`, `sfx/*.flac`, `music/*` | `_tools/build_ui.py` | `m/ui`, `a/sfx/`, `a/music/` |

Mọi đường ở cột cuối nằm trong `assets/`. Ảnh ở `assets/img/g/`. `assets/index.js` (`window.D2_INDEX`) cho biết
sheet, tileset, bản đồ nào nằm ở nhóm nào; engine chèn `<script>` của nhóm khi cần (`E.ensure*`). Hợp đồng v2 ở
`brain/plans/diablo2-d2r.md`.
| Số liệu | `global/excel/*.txt` của 3.1, chuỗi `local/lng/strings` | `_tools/build_data.py` | `js/data.js` |

Bộ giải mã DCC, DC6, DT1, DS1, COF, palette là `_tools/d2fmt.py`, port từ OpenDiablo2. Bộ đóng atlas WebP là `_tools/d2pack.py`.
Hợp đồng dữ liệu giữa các lever và engine nằm ở `brain/plans/diablo2-d2r.md`.

Không sửa tay `js/data.js` hay `assets/`. Sửa lever rồi chạy lại:

```sh
PYTHONIOENCODING=utf-8 python games/diablo2/_tools/build_data.py
PYTHONIOENCODING=utf-8 python games/diablo2/_tools/build_sprites.py
PYTHONIOENCODING=utf-8 python games/diablo2/_tools/build_objects.py
PYTHONIOENCODING=utf-8 python games/diablo2/_tools/build_world.py
PYTHONIOENCODING=utf-8 python games/diablo2/_tools/build_ui.py      # cần ffmpeg
```

Đọc kho CASC: `D:\d2r-tools\CASCExplorer\CASCConsole` (WoW-Tools/CascLib có hỗ trợ D2R, product `osi`), build bằng `dotnet build -c Release -f net9.0`.
Ví dụ: `CASCConsole.exe -m Pattern -e "data/data/global/*" -d D:\d2r-ref\fs -l enUS -p osi -s <thư mục game>`. Đặt `CASC_LIST=1` thì chỉ liệt kê.

## Mã

| Tệp | Việc |
|---|---|
| `js/drlg.js` | Sinh bản đồ: DS1 gốc cho khu preset, mê cung phòng theo `lvlmaze.txt`, ngoài trời ghép stamp DS1 như `act1_overworld.go` của OpenDiablo2 |
| `js/skills.js` | `D2S`: triệu hồi, lời nguyền, hào quang, biến hình, bẫy, võ thuật của 210 kỹ năng |
| `js/engine.js` | Vẽ tile theo 3 lượt như `d2maprenderer`, sprite 8/16 hướng, nhân vật ghép lớp theo COF |
| `js/rules.js` | Hàm thuần: nhân vật, chỉ số, trúng đòn, sát thương kỹ năng, XP, rơi đồ |
| `js/game.js` | Vòng lặp, máy trạng thái thực thể, AI quái, nhiệm vụ, lưu `localStorage` |
| `js/ui.js`, `js/input.js` | HUD, các bảng, chuột + bàn phím, cảm ứng ngang |

## Đơn vị

- Thế giới tính bằng **subtile** của D2. Một tile có 5×5 subtile.
- Chiếu ra màn hình: `sx = (x - y) * 16`, `sy = (x + y) * 8`. Tile vẽ 1:1 (160×80 px).
- Tốc độ lấy thẳng từ bảng (subtile/giây): `WalkVelocity` 6 và `RunVelocity` 9 của người chơi, `Velocity`/`Run` của quái.
- Hướng là số thực `[0, 8)`: 0 là Tây trên màn hình, tăng theo chiều kim đồng hồ. Sprite 8 hướng và 16 hướng dùng chung giá trị này.

## Bẫy

- `[BẪY ĐÃ SẬP]` Hình HD của D2R là mô hình 3D. Art 2D cổ (DCC, DT1...) vẫn nằm nguyên trong kho CASC, ở `data/data/global`.
- `[BẪY ĐÃ SẬP]` Lớp vật thể (lửa trại, đuốc) có phần trong suốt riêng ở `anim.fx`. Lúc đầu `sprites_obj.js` xếp khung theo `[hướng][khung]`, lửa trại chỉ hiện khung đầu. Giờ lever xoay về `[khung][hướng]` như hợp đồng.
- `[BẪY ĐÃ SẬP]` Stash trong objects.txt có tên lớp `Bank`, không phải `Stash`.
- `[BẪY ĐÃ SẬP]` Doanh trại D2 có hàng rào. Test đi thẳng tới lối ra sẽ kẹt, nên `test/diablo2-suite.js` bấm theo đường A* (`D2DBG.path`).
- `[ĐO TRONG REPO]` 3.1 đổi Sword Mastery thành Blade Mastery, AR 40 + 8/cấp (skills.txt `Param1`, `Param2`).
- Python ghi `game.js` đôi khi trả `OSError 22` trên Windows. File không bị hỏng, thử lại là được.
- `[BẪY ĐÃ SẬP]` HUD dựng trong `UI.init`, trước khi nhóm `m/ui` nạp xong, nên ra thiếu khung và cầu máu. Giờ `boot` gọi `UI.rebuildHud()` khi nhóm tới; suite có check riêng cho khung HUD.
- `[BẪY ĐÃ SẬP]` `build_ui.py` ghi tiếng ra `assets/a/sfx` nhưng chỉ mục vẫn trỏ `assets/sfx/`. Suite giờ ghi cả request hỏng (`requestfailed`), bỏ qua `ERR_ABORTED` vì đó là trình duyệt huỷ luồng nhạc khi đổi bài.
- `[ĐO TRONG REPO]` Trùm (Andariel, Blood Raven) không nằm trong đàn quái của khu; chúng là điểm đặt sẵn trong DS1 (`monpreset`). `spawnMonsters` đọc tên preset, so với `bosses` của khu.
- `[ĐO TRONG REPO]` Jerhyn không nằm trong DS1 nào của Act II; D2 đặt ông bằng script. Game đặt ông cạnh lối vào cung điện (`SCRIPTED_NPCS`).
- `[ĐO TRONG REPO]` Preset DS1 gọi superunique bằng tên hiện ("Radament") hoặc mã quái gốc ("summoner" = `the_summoner`).
- `[ĐO TRONG REPO]` TC rương là một thang trong nhóm 6 của TreasureClassEx (Act 1 Chest A level 0 tới Act 5 (H) Chest C level 85). `D2R.upgradeTc` nâng TC theo cấp, dùng cho cả quái.

### Chuẩn gốc, đợt 1 (rev 20261007a)

- `[ĐO TRONG REPO]` Mỗi act có bố cục cố định `D2G.layoutAct(act, actSeed)` port từ D2MOO (`DrlgOutPlace.cpp`): mỗi khu ngoài trời là một hình chữ nhật trên toạ độ thế giới của act. Khe mở nằm giữa đoạn mép chung nên hai đầu khớp nhau (lệch tối đa 1 tile, Lut Gholein–Rocky Waste).
- `[ĐO TRONG REPO]` Một game là một lần vào nhân vật: `S.gameSeed` mới mỗi lần nạp; khu đã dựng (quái, rương, đồ dưới đất, automap) giữ trong phiên cho act hiện tại. Trạng thái khu lưu dạng ảnh chụp thực thể, không theo chỉ số đàn, vì cỡ đàn dùng `Math.random`.
- `[BẪY ĐÃ SẬP]` Hero qua mép ra cách mép 3 subtile, nằm trong bán kính 2,8 của lối quay về. Game khoá lối đó tới khi hero bước đi; test bấm thẳng vào lối khi A* trả đường rỗng.
- `[BẪY ĐÃ SẬP]` Stamp viền rộng 9 tile; Burial Grounds chỉ chung 24 tile mép với Cold Plains nên khe có thể cắt vào stamp góc.
- `[ĐO TRONG REPO]` D2 không có lối đi bộ Stony Field–Dark Wood (đi qua Underground Passage) và Valley of Snakes–Canyon of the Magi (chỉ qua cổng Arcane Sanctuary hoặc waypoint).
- `[BẪY ĐÃ SẬP]` 27/33 khoá tiếng viết cứng không có trong `sounds.txt` nên hero câm. Mọi khoá giờ lấy từ sounds.txt, skills.txt `stsound`, missiles.txt `TravelSound`/`HitSound`, monsounds.
- `[BẪY ĐÃ SẬP]` Canvas mở từ `file://` bị khoá đọc pixel; test đo độ tối bằng ảnh chụp nạp qua data: URL.
- `[BẪY ĐÃ SẬP]` Đuốc và lửa trại thị trấn có Lit 16–19 subtile, phủ gần kín màn hình, nên test ngày/đêm đo ở Blood Moor. Màu đuốc hắt bằng cộng sáng làm đêm sáng hơn ngày; giờ phủ màu ngay trong lớp tối.
- `[BẪY ĐÃ SẬP]` Tên NPC/vật khi rê chuột phải vẽ sau lớp tối, kẻo trong hầm bị phủ đen.
- `[BẪY ĐÃ SẬP]` Nhãn đồ dàn ra không chồng nhau, nên bấm vào chính món đồ có thể trúng nhãn món khác. Test nhặt đồ bấm vào nhãn (`getState().drops[].rect`).
- `[BẪY ĐÃ SẬP]` NPC giờ đi lại: test bấm đường đi có thể trúng NPC và mở hộp thoại, nên chọn điểm bấm không nằm trên NPC.
- `[BẪY ĐÃ SẬP]` `checkExits` từng chỉ chạy trong `moveHero`. Hero chạy tới lối trong 1,5 s ân hạn sau khi vào khu rồi đứng yên thì không bao giờ qua được (suite trượt 2/5 lần). Giờ `updateWorld` kiểm lối mỗi khung; suite có kiểm riêng cho ca này.
- Atlas UI không có tab act V của waypoint/nhiệm vụ; tab nằm ở `assets/img/g/exptabs.webp` (`_tools/build_exptabs.py`).

### Chuẩn gốc, đợt 2-MAP (rev 20261007c)

- `[ĐO TRONG REPO]` `S.grid` là một `D2G.World`: các khu ngoài trời của act nằm chung theo rect của `layoutAct`, hang/hầm là World một khu. `World.add` đổi mọi điểm của Level sang subtile thế giới một lần; tile và `col` giữ cục bộ, tra qua `levelAt`/`colAt`. Khu kề được dựng khi hero cách mép dưới 90 subtile, quái xa hơn 60 subtile thì ngủ.
- `[ĐO TRONG REPO]` Khung hình ở Blood Moor sát mép Cold Plains (CDP, 960×540): 3,17 ms trước, 4,25 ms sau khi ghép (3 khu dựng sẵn).
- `[BẪY ĐÃ SẬP]` DS1 preset rộng hơn levels.txt 1 tile, nên lối đi bộ của preset có thể nằm trên dải thừa thuộc khu kề. `goto(id, from)` với khu kề cùng World từng đặt hero vào dải thừa và lật sang khu kia; giờ bỏ qua `from`.
- `[BẪY ĐÃ SẬP]` Tile warp orientation 10/11 không ẩn chính là hình cầu thang/cửa hang mà packer từng bỏ (Catacombs, Jail thiếu cầu thang). Marker ẩn là floor warp; bản sáng khi rê là sàn có style = seq của marker, seq|4 (D2MOO `LoadFloorWarpTiles`).
- `[ĐO TRONG REPO]` Hộp bấm `SelectX/Y/DX/DY` của lvlwarp tính từ đỉnh ô tile. Warp `NoInteract` (cửa sập cống Act II, cửa đền Kurast, Travincal → Durance) kích hoạt khi bước lên; còn lại phải bấm.
- `[BẪY ĐÃ SẬP]` `S.hover` tính trong `updateWorld`, nên `D2DBG.freeze` khoá luôn hover; test rê chuột phải bỏ freeze.
- `build_world.py` chạy khoảng 3–4 phút mỗi act.

### Chuẩn gốc, đợt 2-UI (rev 20261007d)

- `[ĐO TRONG REPO]` Font DC6 gốc (Font16/30/42, Exocet10, Formal12) chỉ có mã 0–255: thiếu ă ơ ư đ và mọi dấu thanh. Một hàm duy nhất `textFontOf` chọn font: chuỗi có ký tự ngoài bảng thì rơi về serif small-caps cùng cỡ, cùng màu. Vì thế có chỗ một tab chữ gốc nằm cạnh tab chữ web.
- `[BẪY ĐÃ SẬP]` Mảnh shift 0 trong `pal.pl2` biến mọi glyph thành đen; "white" là glyph gốc, không áp shift. Mã 128–159 trong font là ô giữ chỗ (vẽ ra Ø), phải coi là thiếu.
- `[BẪY ĐÃ SẬP]` Tranh nền 800×600 của màn đầu phải neo theo góc trên-trái từng ô; neo theo điểm DC6 thì các ô lệch hẳn lên trên.
- `[BẪY ĐÃ SẬP]` Lớp `#touch` (z-index 6) che nút "Bắt đầu" khi chơi cảm ứng; ẩn nó ở màn đầu và màn tải.
- `[BẪY ĐÃ SẬP]` Vàng tự nhặt trong bán kính 2,6 nhặt lại ngay vàng vừa thả; vàng thả ra mang cờ `noAuto`, phải bấm mới nhặt.
- `[BẪY ĐÃ SẬP]` Nhãn đồ vừa rơi có điểm số 0 trong `entAt`, thắng quái đứng dưới nó. Chuột phải nhắm vào nhãn, phép bay về điểm đất sau lưng quái và trượt (suite trượt 1/2 lần sau khi ghép liền làm nhiều quái hơn). Giờ chuột phải và Shift chỉ nhắm quái (`entAt(sx, sy, 'mon')`); suite có kiểm riêng, trượt trên mã cũ.
- Chưa có nút sửa đồ vì độ bền chưa bao giờ giảm. Màn chọn lớp giữ nửa số khung của động tác bước tới/lùi về.

### Chuẩn gốc, đợt 2-AVFX + automap (rev 20261007e)

- `[ĐO TRONG REPO]` Hero 16 hướng cho NU WL RN TN TW (8 cho mode khác); quái đủ khung ở NU WL RN GH DT (zombie WL 12 khung, DT 19, GH 5); thêm cung và giáo cho SO/NE/DZ/PA. Nhạc đủ bài, Vorbis ABR 48k (đo ~43 kbps), wilderness 479 s. 111 lời thoại từ `local/sfx` (thiếu mana, túi đầy, chưa đủ yêu cầu, lời chào 37 NPC thị trấn). Assets 157 → 196 MB.
- `[BẪY ĐÃ SẬP]` Chạy `build_sprites.py` không có `--codes` xoá 31 nhóm chỉ dựng qua `--codes`/`--npc-codes` (triệu hồi, biến hình, vài NPC). Chạy lại: `--codes 22,40,B7,B8,BW,E9,G1,G2,G3,G4,HK,HX,LG,SE,TG,VC,WF,X3,X4,XU,XW` và `--npc-codes 36,B9,BS,CM,HR,JE,RT,TX,XR,XS`.
- Mã hoá lại nhạc cần `--force-music` (ogg đã có thì lever bỏ qua). Warriv không có `warriv_greeting_1`, dùng `warriv_greeting_inactive_1`.
- `[ĐO TRONG REPO]` Automap vẽ bằng cel `maximap.dc6` theo `automap.txt` (lever `_tools/build_automap.py`, 0,19 MB). `act2map`, `act4map`, `extnmap` là tranh nguyên khối của thị trấn Act II/IV/V, chưa ghép; ba thị trấn đó vẫn vẽ điểm ảnh. `mapicons.dc6` là biểu tượng nhà thờ, cây, không phải dấu NPC.
- `[BẪY ĐÃ SẬP]` Style trong `world_actN` có thể là style bí danh (≥ 64) do `build_world` đặt; `build_automap.py` chạy lại `build_world.build(act)` để đổi ngược. Dựng lại world thì phải chạy lại `build_automap.py`.
- `[BẪY ĐÃ SẬP]` Xương triệu hồi đi giật và nhìn như xoay vòng: một ngưỡng 4 subtile làm pet đổi chạy/đứng gần như mỗi khung (đo 176 lần trong 20 s, hoạt ảnh reset liên tục), và cả bầy cùng đi tới toạ độ hero nên chồng khít một điểm (khoảng cách 0). Giờ `follow` (skills.js) có vùng đệm và mỗi pet một chỗ trên vòng quanh hero; suite đo lại (≤ 14 lần, cách nhau ≥ 1,45).
- `api` mà game.js đưa cho D2S có `heroSpeed`; `test/diablo2-skills.js` dựng `api` giả nên phải khai cùng hàm.

## Kiểm

```sh
node test/diablo2-rules.js   # số liệu so với bảng 3.1
node test/diablo2-drlg.js    # 20 seed mỗi khu: tới được mọi lối ra và đàn quái
node test/diablo2-skills.js  # D2S: hiệu ứng từng loại kỹ năng
node test/diablo2-suite.js   # Playwright: chuột thật, cảm ứng 932×430
```

## Chưa có

- Moo Moo Farm; Matron's Den, Forgotten Sands, Furnace of Pain, Tristram (Act V), Colossal Summit: lever chưa đưa level 133–137 vào `maps_act5`.
- Valkyrie: `monsters/vk` của D2R chỉ có DCC giả, nên vẽ bằng thân Amazon giáp nặng.
- Baal ngồi ngai không đánh được; năm đợt quân đứng sẵn quanh ngai thay vì kéo tới theo đợt.
- Ba trùm giữ ấn ở Chaos Sanctuary đứng ở điểm xa lối vào; chưa có ấn để mở. Diablo ra khi cả ba đã chết.
- Vật phẩm nhiệm vụ chưa có hình trong túi đồ; Golden Bird trao ngay khi nhặt tượng ngọc.
- Đích "rescue/reach" của nhiệm vụ rút gọn thành "tới được khu".
- TH/KK/S1–S4 của hero chỉ có ở lớp nào lever đã đóng gói COF đó.
- Đổi màu unique mới là phủ màu, chưa đổi bảng `.pl2`/colormap như D2.
- River of Flame ↔ Chaos Sanctuary và Barracks ↔ Outer Cloister vẫn là lối dịch chuyển, vì mê cung chưa nằm trong `layoutAct`.
- Chưa có Horadric Cube. Automap thị trấn Act II/IV/V còn vẽ điểm ảnh.
- Trùm và các mode ngoài NU WL RN GH DT A1 của quái còn bỏ nửa khung; hero chưa có nỏ (xbw) và 1ht/2hs cho mọi lớp (hết ngân sách 200 MB).
