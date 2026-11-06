# Diablo II Act I trên hub, art + số liệu D2R

Mục tiêu: `games/diablo2/` dựng lại Act I của Diablo II bằng canvas/JS thuần. Mở được từ `file://`, chơi được trên Pages bằng chuột và cảm ứng.

- Chủ dự án chốt 2026-10-06: **dùng bộ asset và config của Diablo II** từ bản D2R ở `D:\Diablo2`. Thay hẳn lựa chọn art Flare ngày 2026-10-01.
- Nguồn: CASC của D2R 3.1.91636, giải nén ở `D:\d2r-ref`, bóc ra `D:\d2r-ref\fs\data\data\{global,local}` (4,6 GB, 37.659 file). Công cụ là `D:\d2r-tools\CASCExplorer\CASCConsole` (đặt `CASC_LIST=1` thì chỉ liệt kê). Danh sách đủ ở `D:\d2r-ref\listing.tsv`.
- Dùng **art 2D cổ** (DCC, DC6, DT1, DS1, palette). Art HD của D2R là mô hình 3D, không dùng.
- Tiếng và nhạc lấy từ `.flac` của D2R (`global/sfx`, `global/music`).
- Số liệu lấy từ `global/excel/*.txt` của D2R 3.1.
- Bộ giải mã: `_tools/d2fmt.py`. Đã thử trên file thật: Amazon ghép đủ lớp theo COF ra 16 hướng, `towne1.ds1` dựng đúng cả doanh trại, không thiếu tile nào.

## Đơn vị và toạ độ

- Đơn vị thế giới là **subtile**. Một tile của D2 rộng 5×5 subtile.
- Chiếu ra màn hình: `sx = (x - y) * 16`, `sy = (x + y) * 8`. Một tile là hình thoi 160×80 px. Vẽ ở tỉ lệ 1:1, canvas 960×540.
- Tốc độ lấy từ bảng D2, tính bằng subtile/giây: `WalkVelocity`, `RunVelocity` trong charstats; `Velocity`, `Run` trong monstats.
- Hướng sprite: `d = 0` là màn hình phía Tây, tăng theo chiều kim đồng hồ, mỗi bước `360/dirs` độ. Bộ build đổi thứ tự hướng của file D2 sang quy ước này (xem `d2fmt.dir_to_compass`).

## Hợp đồng sprite: `assets/sprites.js`, `assets/sprites_obj.js`

```js
window.D2_SPRITES = {            // sprites_obj.js gán vào window.D2_SPRITES_OBJ, cùng dạng
  pages: ['assets/img/mon_zm_0.webp', ...],      // chỉ số trang dùng trong rect[6]
  sheets: {
    // khoá: 'mon.<Code monstats>' | 'npc.<Code>' | 'obj.<token>' | 'mis.<tên missiles.txt>' | 'ovl.<tên>' | 'flp.<invfile>'
    'mon.ZM': { anims: {
      // khoá anim = mã mode D2 viết hoa: NU WL RN A1 A2 GH DT DD SC S1..S4 BL KK TH ... (objects: NU OP ON S1..)
      WL: { dirs: 8, fps: 10.5, frames: 10, hit: -1 /* khung gây sát thương theo animdata, -1 nếu không có */,
            f: [ /* frame */ [ /* dir */ [x, y, w, h, ox, oy, page] ] ] }
    } }
  },
  hero: {                        // nhân vật người chơi vẽ theo lớp, như D2
    cofs: { 'AM.WL.1HT': { layers: ['HD','LA','LG','RA','RH','S1','S2','SH','TR'], wclass: {HD:'1ht',...}, dirs: 16, frames: 8, fps: 25, hit: -1,
                           pri: [ /* dir (đã đổi sang quy ước trên) */ [ /* frame */ 'HD,TR,...' ] ] } },
    // 'hero.<CLS>.<LAYER>.<token>.<wclass>' -> anims theo mode
    layers: { 'AM.TR.LIT.1HT': { WL: { f: [[rect]] }, A1: {...} } }
  }
};
```

- fps lấy từ `animdata.d2`: `fps = 25 * speed / 256`. `hit` là khung có sự kiện tấn công.
- Token mặc định là `LIT`. Đồ mặc đổi token theo cột `alternategfx` (vũ khí, khiên, mũ) và các cột `Tr Lg Rs Ls Ss` (0/1/2 → lit/med/hvy) của armor.txt.

## Hợp đồng thế giới: `assets/world.js`, `assets/maps.js`

```js
window.D2_WORLD = { tilesets: { 'act1': {
  pages: ['assets/img/tiles_act1_0.webp', ...],
  // khoá 'o_s_q' = orientation_style(main_index)_sequence(sub_index); mỗi biến thể một mảng
  tiles: { '0_1_3': [[x, y, w, h, yMin, rarity, page, flagsIdx], ...] },
  flags: [ /* flagsIdx -> 25 số, cờ subtile của DT1: bit0 chặn đi, bit1 chặn tầm nhìn, bit2 chặn nhảy, bit3 chặn người chơi, bit5 ánh sáng */ ],
  palette: 'act1'
} } };
window.D2_MAPS = {               // mỗi DS1 cần dùng
  'act1/town/towne1': { w, h, floors: [[...]], walls: [{ t: [...], o: [...] }], shadows: [[...]],
                        // t[i] = style<<8 | sequence (0 = trống/ẩn), o[i] = orientation; i = y*w + x
                        objects: [{ type: 1|2, id, x, y }] },
  ...
};
window.D2_PRESETS = { /* LvlPrest rút gọn: def -> { name, files: ['act1/outdoors/bord1', ...], sizeX, sizeY, outdoors } */ };
```

Cách vẽ một tile, theo `OpenDiablo2 d2maprenderer`. Toạ độ tile `(tx, ty)` ra màn hình `px = (tx - ty) * 80`, `py = (tx + ty) * 40`. Ảnh của biến thể vẽ ở `(px - 80, py + dy)`:

| Loại | `dy` |
|---|---|
| sàn (orientation 0) | `yMin` |
| bóng (13) | `yMin + 80`, độ mờ 160/255 |
| tường (1..14) | `yMin + 80`. Orientation 3 vẽ thêm ảnh orientation 4 cùng style và sequence |
| mái (15) | `-roofHeight + yMin` |

Thứ tự vẽ:
1. Tường thấp (16..19), sàn, bóng.
2. Tường 1..14 (trừ 10, 11, 13) xen kẽ với thực thể, theo hàng tile.
3. Mái.

Biến thể chọn theo `rarity` với seed `(tx, ty)`. Cờ subtile của mọi lớp trong tile OR lại với nhau. Thứ tự subtile trong DT1 là từ dưới lên (`map_tile.go` subtileLookup).

## Hợp đồng `D2G` (js/drlg.js)

```js
D2G.build(areaId, seed) -> Level
// Level = { id, tw, th /* số tile */, w: tw*5, h: th*5 /* subtile */, tileset: 'act1',
//   floors: [Int32Array(tw*th)], walls: [{ t: Int32Array, o: Uint8Array }], shadows: [Int32Array],  // t = style<<8|seq, đã chọn biến thể: t | variant<<16
//   col: Uint8Array(w*h)  /* 0 đi được, 1 chặn đi, 2 chặn đi nhưng nhìn xuyên (nước) */,
//   hero: [x, y], exits: [{ x, y, to }], spawns: [{ x, y, n, kind }], npcs: [{ id, x, y }], objects: [{ token, x, y, kind }] }
```

- Doanh trại: chọn một trong các DS1 `Act 1 - Town 1` (LvlPrest def 1). Lối ra Blood Moor ở mép hở.
- Blood Moor: ghép như `OpenDiablo2 act1_overworld.go`. Viền cây là các stamp 8×8 (def 4..15), stamp lấp đầy chọn ngẫu nhiên (đá, nhà, trại Fallen, ao, đầm), cửa Den of Evil là def 52. Kích thước theo Levels.txt (80×80 tile).
- Den of Evil: mê cung phòng 24×24 tile (LvlPrest def 53..98, LvlMaze `Act 1 - Cave 1`). Phòng vào là `Prev`, phòng đặc biệt là `Den Of Evil`.

## Ai làm gì

| Phần | Tệp | Người làm |
|---|---|---|
| Bộ giải mã + bộ đóng gói | `_tools/d2fmt.py`, `_tools/d2pack.py` | xong |
| Sprite nhân vật, quái, NPC | `_tools/build_sprites.py` → `assets/sprites.js`, `assets/img/{hero,mon,npc}_*` | agent A |
| Vật thể, đạn, overlay, đồ rơi | `_tools/build_objects.py` → `assets/sprites_obj.js`, `assets/img/{obj,mis,ovl,flp}_*` | agent B |
| Tile + DS1 + bộ sinh bản đồ | `_tools/build_world.py` → `assets/world.js`, `assets/maps.js`; `js/drlg.js`; `test/diablo2-drlg.js` | agent C |
| Số liệu từ excel D2R | `_tools/build_data.py` → `js/data.js`; `test/diablo2-rules.js` | agent E |
| UI, icon đồ, tiếng, nhạc | `_tools/build_ui.py` → `assets/ui.js`, `assets/img/ui_*`, `assets/sfx/`, `assets/music/` | agent F |
| Engine vẽ, ghép vào game | `js/engine.js`, `js/game.js`, `js/ui.js`, `index.html`, `test/diablo2-suite.js` | điều phối |

Ngân sách: tối đa 60 MB cho cả game. Cả site tối đa 1 GB.

## Bản đầy đủ (từ 2026-10-06, chủ dự án: "làm full")

Đích: đủ 5 act, 7 lớp chơi được, lính đánh thuê, HUD và bảng của D2, ba độ khó. Mỗi pha lên Pages và có bộ kiểm riêng trước khi sang pha sau.

**Giới hạn cứng:** cả site 780 MB / trần 1 GB của Pages [ĐO TRONG REPO, 2026-10-06]. Bản Act I lossless tốn 71 MB, nên ngân sách cả game là **150 MB**. Muốn vừa thì phải nén ảnh lossy, nạp asset theo nhóm khi cần, và mỗi act chỉ đóng gói đúng quái, NPC, tile mà act đó dùng.

### Hợp đồng v2: nhóm asset nạp khi cần

Thay `sprites.js`, `sprites_obj.js`, `world.js`, `maps.js`, `ui.js` (nạp hết lúc mở game) bằng một chỉ mục nhỏ và các tệp nhóm:

```js
// assets/index.js: nạp lúc mở game, nhỏ
window.D2_INDEX = {
  sheets:   { 'mon.ZM': 'm/mon_ZM', 'obj.rb': 'm/obj_act1', 'mis.firebolt': 'm/mis', 'flp.flpjav': 'm/flp', ... },  // khoá sheet -> nhóm
  hero:     { AM: 'm/hero_AM', SO: 'm/hero_SO', ... },        // lớp nhân vật -> nhóm (cofs + layers của lớp đó)
  tilesets: { act1: 'm/world_act1', act1cave: 'm/world_act1', ... },
  maps:     { 1: 'm/maps_act1', 2: 'm/maps_act2', ... },      // act -> nhóm DS1 + D2_PRESETS của act
  ui: 'm/ui',
  monmap:   { cr_archer1: 'mon.CR.lbb', ... },
  objPresets: { 'act1:2': { token, name, cls, w, h, collide, selectable, modes, lit }, ... }
};
// assets/m/<nhóm>.js: mỗi tệp gọi đúng một lần
D2_REG('<nhóm>', { pages: ['assets/img/...webp'], sheets: {...}, hero: { cofs, layers }, tilesets: {...}, maps: {...}, presets: {...}, ui: {...} });
```

- `rect[6]` là chỉ số trang **trong nhóm đó**. Engine gắn `pages` của nhóm vào từng sheet khi `D2_REG` chạy.
- Engine nạp nhóm bằng thẻ `<script>` chèn động, chạy được trên `file://`. Node test nạp bằng `vm`.
- Ảnh WebP lossy (quality khoảng 90, alpha giữ nguyên) cho sprite và tile. Hình UI và icon nhỏ giữ lossless.
- Nhạc Vorbis 96 kbps stereo. Tiếng hiệu ứng mono 22 kHz q1.

### Mã khu (dùng chung cho số liệu, bản đồ, game)

- `id` = snake_case của tên hiển thị tiếng Anh (`LevelName` của levels.txt qua bảng chuỗi): `rogue_encampment`, `blood_moor`, `cave_level_1`, `catacombs_level_4`, `lut_gholein`...
- Trùng tên ở act khác thì thêm `_a<act>` cho bản ở act sau (vd. `sewers_level_1_a3`).
- `D2DATA.areas[id]` có `d2id` (Id của levels.txt), `act`, `drlg` (1 mê cung, 2 preset, 3 ngoài trời), `levelType` (tên LvlTypes), `links` (khu kề nhau, gồm cả lối ngoài trời mà D2 viết cứng trong DRLG), `waypoint`.
- Mã cũ `cave_1`, `cave_2` đổi thành `cave_level_1`, `cave_level_2`. Game đổi cả trong bản lưu cũ.

### Pha

| Pha | Việc | Xong khi | Trạng thái |
|---|---|---|---|
| 1 Nền | Hợp đồng v2 cho mọi lever, nén lossy, engine nạp nhóm; số liệu mọi level của 5 act (`areas` theo Levels.txt); HUD + bảng D2 | Act I như cũ, bộ kiểm 72/72 trên Pages, game ≤ 45 MB | xong, rev 20261006d (116 MB cho cả 5 act sprite + tiếng) |
| 2 Act I đủ | Mọi khu Act I (ngoài trời, hang, hầm mộ, tháp, tu viện, nhà giam, nhà thờ, hầm Catacombs, Tristram), nhiệm vụ Act I, Andariel, lính Rogue | Đi được từ doanh trại tới Andariel, bộ kiểm từng khu | 38/39 khu (thiếu Moo Moo Farm); trùm ra từ preset DS1 từ rev e |
| 3 Bảy lớp | Kỹ năng triệu hồi, lời nguyền, hào quang, biến hình, bẫy, võ thuật | Mỗi lớp dùng được mọi kỹ năng tới cấp 30 | xong phần luật (rev c); thiếu hình quái triệu hồi và biến hình |
| 4–7 | Act II, III, IV, V: tile, bản đồ, quái, NPC, nhiệm vụ, trùm | Đi hết act, giết trùm, sang act sau | rev f: 131 khu × 20 seed qua test drlg (thiếu 6 khu phụ); thị trấn đủ NPC; trùm mọi act; chuyển act qua Warriv/Meshif/cổng đỏ/Tyrael; vật phẩm nhiệm vụ, cổng Duriel/Durance |
| 8 | Nightmare, Hell, waypoint khắp các act | Đổi độ khó chạy đúng số liệu | xong rev e: kháng, mất XP, cấp khu, quái, lính, nhiệm vụ theo độ khó; mở bằng Eve of Destruction |

Rương và đồ rơi: TC rương là thang nhóm 6 của TreasureClassEx, quái cũng được nâng TC theo cấp (`D2R.upgradeTc`). Vật phẩm nhiệm vụ: bảng tay `HAND_QUEST_ITEMS` trong `build_data.py` (nguồn Arreat Summit), chưa có hình trong túi đồ.

## Rủi ro

- Art và tiếng thuộc bản quyền Blizzard, lấy từ một bản crack. Hub đăng công khai trên Pages, nên có thể bị gửi yêu cầu gỡ bản quyền (DMCA). Chủ dự án đã yêu cầu dùng bộ này.

## Chuẩn gốc (từ 2026-10-07, chủ dự án: "map phải liên kết như game gốc, UI/UX, anim, sfx, vfx cũng vậy")

Ba bản soát so với D2 gốc nằm ở `brain/plans/diablo2-chuan-goc/` (`audit-maps.md`, `audit-ui.md`, `audit-avfx.md`).
Mỗi ý trong đó có nhãn đo / nguồn / đoán và số dòng mã.

Quyết định đã chốt (không hỏi lại):
- Bỏ những thứ D2 không có: số sát thương nổi, "+XP", "miss", "LÊN CẤP!", nháy mờ khi trúng, quầng sáng champion/unique, vòng elip đỏ dưới quái, dải `.ptsflag`, hộp hướng dẫn `.detail`. Thay bằng cách gốc (sprite sáng lên, colormap, tiếng).
- Chữ giao diện tiếng Việt giữ nguyên. Font DC6 gốc dùng cho chữ không dấu (tên đồ, khu, quái, NPC) ở đợt 2.
- Một "game" = một lần vào nhân vật. Seed của act sinh lúc vào game; khu đã dựng giữ nguyên cho tới khi thoát (như D2).

| Đợt | Việc | Tệp chính |
|---|---|---|
| 1-MAP | Bố cục act theo D2MOO (hình chữ nhật thế giới), khe mở giữa đoạn mép chung ở cả hai đầu, ra đúng chỗ tương ứng, giữ khu trong phiên (quái đã giết, rương, automap), bỏ 2 lối sai, lật dải Act V | `drlg.js`, `build_data.py`, `game.js` (enterArea, lưu) |
| 1-UI | Nhả chuột thì dừng, cầm đồ trên con trỏ, mini panel, bảng trái/phải + dịch khung nhìn, nhãn đồ không chồng, con trỏ bàn tay, HUD (nút chạy, thể lực, XP, cầu), "Entering X", nhật ký nhiệm vụ + waypoint đủ act, phím tắt | `ui.js`, `input.js`, `index.html`, `game.js` (input, nhãn) |
| 1-AVFX | Khoá tiếng đúng (hero, kỹ năng, đạn, vũ khí, đồ), âm lượng theo khoảng cách, nạp trước đạn, lớp ánh sáng, bỏ thứ D2 không có, nhuộm lạnh/độc, máu, overlay niệm, mode S1–S4/TH/KK, khung gây sát thương, đỡ đòn, tiếng môi trường + bước chân | `engine.js`, `game.js`, `skills.js`, `rules.js` |
| 2-MAP | Ghép liền các khu ngoài trời (mục E của audit-maps), warp bấm được + sáng khi rê, ra theo lvlwarp | `drlg.js`, `engine.js`, `game.js`, `build_world.py` |
| 2-UI | Font DC6, automap bằng `maximap.dc6`, màn tiêu đề/chọn lớp/tải gốc, cube, hộp thoại NPC, menu Esc | `build_ui.py`, `ui.js` |
| 2-AVFX | 16 hướng, đủ khung quái, nhạc dài hơn, lời nhân vật + NPC (cần dời ngân sách MB) | `build_sprites.py`, `build_ui.py` |
